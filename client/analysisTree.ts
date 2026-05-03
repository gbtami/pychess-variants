import { Step } from './messages';

const ROOT_PATH = '';
const PATH_SEPARATOR = '.';

export interface AnalysisTreeNode {
    id: string;
    path: string;
    ply: number;
    step: Step;
    children: AnalysisTreeNode[];
    mainlinePly?: number;
}

export interface AnalysisTree {
    root: AnalysisTreeNode;
    byPath: Map<string, AnalysisTreeNode>;
    nextId: number;
}

export interface TreePathProjection {
    isMainline: boolean;
    anchorPath: string;
    anchorPly: number;
    targetPly: number;
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
        mainlinePly: asMainline ? mainlinePly : undefined,
    };
    tree.byPath.set(path, node);
    return node;
}

export function nodeAtPath(tree: AnalysisTree, path: string): AnalysisTreeNode | undefined {
    return tree.byPath.get(path);
}

export function getNodeList(tree: AnalysisTree, path: string): AnalysisTreeNode[] {
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
    const projection = projectPath(tree, path);
    if (projection.isMainline) return mainlineEndPath(tree);

    const node = nodeAtPath(tree, path);
    if (!node) return path;
    return pathFollowingFirstChildren(node);
}

export function projectPath(tree: AnalysisTree, path: string): TreePathProjection {
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

    const existing = parent.children.find(
        (child) => child.step.move === step.move && child.step.fen === step.fen,
    );
    if (existing) return existing.path;

    const child = createChild(tree, parent, step, preferMainline, mainlinePly);
    if (preferMainline) parent.children.unshift(child);
    else parent.children.push(child);

    return child.path;
}
