import { Step } from '../messages';

const ROOT_PATH = '';
const PATH_SEPARATOR = '.';

export interface AnalysisTreeNode {
    // Stable per-parent id segment used to build dotted paths like `01.0a.0b`.
    id: string;
    // Full path from the synthetic root to this node. This is the primary UI navigation key.
    path: string;
    // Logical ply in the explored tree, not necessarily the persisted game mainline ply.
    ply: number;
    step: Step;
    // Child[0] is always the preferred continuation for this node. Siblings are alternatives.
    children: AnalysisTreeNode[];
    // Present only for nodes that still sit on the original persisted game mainline.
    mainlinePly?: number;
}

export interface AnalysisTree {
    root: AnalysisTreeNode;
    // Fast random access by dotted path so UI navigation never has to re-walk the tree.
    byPath: Map<string, AnalysisTreeNode>;
    nextId: number;
}

export interface TreePathProjection {
    // Paths stay on mainline until the first node with no `mainlinePly`.
    isMainline: boolean;
    // Mainline node where the current sideline branches off.
    anchorPath: string;
    anchorPly: number;
    // Ply of the currently selected node inside that projected line.
    targetPly: number;
    // Steps after the anchor, suitable for PGN/UCI generation of the active variation.
    variationSteps: Step[];
}

function joinPath(parentPath: string, id: string): string {
    return parentPath ? `${parentPath}${PATH_SEPARATOR}${id}` : id;
}

export function parentPath(path: string): string {
    const idx = path.lastIndexOf(PATH_SEPARATOR);
    if (idx < 0) return ROOT_PATH;
    return path.slice(0, idx);
}

function nextNodeId(tree: AnalysisTree): string {
    const id = tree.nextId.toString(36).padStart(2, '0');
    tree.nextId += 1;
    return id;
}

export function createAnalysisTree(steps: Step[]): AnalysisTree {
    // The synthetic root owns the initial position and lets us treat root alternatives
    // exactly the same way as sub-variations deeper in the tree.
    const root: AnalysisTreeNode = {
        id: 'root',
        path: ROOT_PATH,
        ply: 0,
        step: steps[0],
        children: [],
        mainlinePly: 0,
    };

    const tree: AnalysisTree = {
        root,
        byPath: new Map([[ROOT_PATH, root]]),
        nextId: 1,
    };

    let parent = root;
    for (let ply = 1; ply < steps.length; ply++) {
        const child = createChild(tree, parent, steps[ply], true, ply);
        parent.children.push(child);
        parent = child;
    }

    return tree;
}

function createChild(
    tree: AnalysisTree,
    parent: AnalysisTreeNode,
    step: Step,
    asMainline: boolean,
    mainlinePly?: number,
): AnalysisTreeNode {
    const id = nextNodeId(tree);
    const path = joinPath(parent.path, id);
    const node: AnalysisTreeNode = {
        id,
        path,
        ply: parent.ply + 1,
        step,
        children: [],
        // Off-mainline nodes intentionally drop `mainlinePly`; that is how projection
        // later detects where a variation leaves the persisted game record.
        mainlinePly: asMainline ? mainlinePly : undefined,
    };
    tree.byPath.set(path, node);
    return node;
}

export function nodeAtPath(tree: AnalysisTree, path: string): AnalysisTreeNode | undefined {
    return tree.byPath.get(path);
}

export function getNodeList(tree: AnalysisTree, path: string): AnalysisTreeNode[] {
    // Returns the active breadcrumb from synthetic root to the requested node.
    const nodes: AnalysisTreeNode[] = [tree.root];
    if (!path) return nodes;

    const segments = path.split(PATH_SEPARATOR).filter(Boolean);
    let current = tree.root;
    for (const segment of segments) {
        const child = current.children.find((c) => c.id === segment);
        if (!child) break;
        nodes.push(child);
        current = child;
    }

    return nodes;
}

export function mainlinePathAtPly(tree: AnalysisTree, ply: number): string {
    let current = tree.root;
    let path = ROOT_PATH;

    while (current.ply < ply && current.children[0]) {
        current = current.children[0];
        path = current.path;
    }

    return path;
}

export function mainlineEndPath(tree: AnalysisTree): string {
    return pathFollowingFirstChildren(tree.root);
}

function pathFollowingFirstChildren(node: AnalysisTreeNode): string {
    let current = node;
    while (current.children[0]) current = current.children[0];
    return current.path;
}

export function currentLineEndPath(tree: AnalysisTree, path: string): string {
    // Mainline and sideline "end of line" mean different things:
    // for sidelines we only follow the preferred continuation from the selected node onward.
    const projection = projectPath(tree, path);
    if (projection.isMainline) return mainlineEndPath(tree);

    const node = nodeAtPath(tree, path);
    if (!node) return path;
    return pathFollowingFirstChildren(node);
}

export function projectPath(tree: AnalysisTree, path: string): TreePathProjection {
    // The UI still needs a "current line" view for buttons, PGN and engine position updates.
    // Projection maps an arbitrary tree path back to:
    // 1. the mainline anchor where the sideline begins, and
    // 2. the steps that make up the currently selected sideline.
    const nodeList = getNodeList(tree, path);
    const lastNode = nodeList[nodeList.length - 1] ?? tree.root;

    let firstOffMainlineIdx = -1;
    for (let i = 1; i < nodeList.length; i++) {
        if (nodeList[i].mainlinePly === undefined) {
            firstOffMainlineIdx = i;
            break;
        }
    }

    if (firstOffMainlineIdx < 0) {
        return {
            isMainline: true,
            anchorPath: ROOT_PATH,
            anchorPly: 0,
            targetPly: lastNode.ply,
            variationSteps: [],
        };
    }

    const anchorIdx = firstOffMainlineIdx - 1;
    const anchorNode = nodeList[anchorIdx];
    const variationSteps = nodeList.slice(anchorIdx + 1).map((node) => node.step);

    return {
        isMainline: false,
        anchorPath: anchorNode.path,
        anchorPly: anchorNode.ply,
        targetPly: lastNode.ply,
        variationSteps,
    };
}

export function branchStartPath(tree: AnalysisTree, path: string): string {
    const projection = projectPath(tree, path);
    return projection.isMainline ? ROOT_PATH : projection.anchorPath;
}

export function addOrSelectChild(
    tree: AnalysisTree,
    parentPath: string,
    step: Step,
    preferMainline = false,
    mainlinePly?: number,
): string {
    const parent = nodeAtPath(tree, parentPath);
    if (!parent) return parentPath;

    // Reuse an existing child when the same move already exists from this position.
    // This keeps repeated clicks or engine lines from duplicating branches.
    const existing = parent.children.find(
        (child) => child.step.move === step.move && child.step.fen === step.fen,
    );
    if (existing) return existing.path;

    const child = createChild(tree, parent, step, preferMainline, mainlinePly);
    // Child[0] is treated everywhere else as the preferred continuation of a node.
    if (preferMainline) parent.children.unshift(child);
    else parent.children.push(child);

    return child.path;
}

function movePrefix(node: AnalysisTreeNode, rootTurnColor: string, firstInVariation: boolean): string {
    const isWhiteMove = node.step.turnColor === 'black';
    if (rootTurnColor === 'black' && node.ply === 1) return '1...';
    if (isWhiteMove) return `${Math.ceil((node.ply + 1) / 2)}.`;
    if (firstInVariation) return `${Math.floor((node.ply + 1) / 2)}...`;
    return '';
}

function renderPgnSequence(
    nodes: AnalysisTreeNode[],
    rootTurnColor: string,
    firstInVariation: boolean,
    getSan: (node: AnalysisTreeNode) => string,
): string[] {
    const [child, ...siblings] = nodes;
    if (!child) return [];

    const tokens: string[] = [];
    let current: AnalysisTreeNode | undefined = child;
    let isFirst = firstInVariation;
    let branchSiblings = siblings;

    while (current) {
        const prefix = movePrefix(current, rootTurnColor, isFirst);
        tokens.push(prefix ? `${prefix} ${getSan(current)}` : getSan(current));

        // Siblings represent alternative moves from the same parent position.
        branchSiblings.forEach((sideline) => {
            tokens.push(`(${renderPgnSequence([sideline], rootTurnColor, true, getSan).join(' ')})`);
        });
        branchSiblings = [];

        current.children.slice(1).forEach((sideline) => {
            tokens.push(`(${renderPgnSequence([sideline], rootTurnColor, true, getSan).join(' ')})`);
        });

        current = current.children[0];
        isFirst = false;
    }

    return tokens;
}

export function renderFullTreePgnMoveText(
    tree: AnalysisTree,
    getSan: (node: AnalysisTreeNode) => string,
): string {
    // PGN movetext is closest to the inline-notation renderer: a single token stream
    // with recursive parenthesized alternatives attached at each branch point.
    return renderPgnSequence(tree.root.children, tree.root.step.turnColor, false, getSan).join(' ');
}
