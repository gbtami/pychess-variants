import { AnalysisTree, AnalysisTreeNode } from '../analysis/analysisTree';
import { Step } from '../messages';

export const STUDY_NODE_ID_LENGTH = 10;
const STUDY_NODE_ID_RE = new RegExp(`^[A-Za-z0-9]{${STUDY_NODE_ID_LENGTH}}$`);
const STUDY_NODE_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const ROOT_PARENT_KEY = '';

export interface StudyTreeNodeDto {
    id: string;
    parentId: string | null;
    order: number;
    move: string;
    fen: string;
    turnColor: Step['turnColor'];
    check: boolean;
    san?: string;
    sanSAN?: string;
    forceVariation?: boolean;
}

export interface StudyTreeDto {
    nodes: StudyTreeNodeDto[];
}

export function isStudyNodeId(value: unknown): value is string {
    return typeof value === 'string' && STUDY_NODE_ID_RE.test(value);
}

export function newStudyNodeId(): string {
    if (!globalThis.crypto?.getRandomValues) throw new Error('Study node IDs require Web Crypto support');

    let id = '';
    const bytes = new Uint8Array(STUDY_NODE_ID_LENGTH * 2);
    const unbiasedLimit = Math.floor(256 / STUDY_NODE_ID_ALPHABET.length) * STUDY_NODE_ID_ALPHABET.length;
    while (id.length < STUDY_NODE_ID_LENGTH) {
        globalThis.crypto.getRandomValues(bytes);
        for (const byte of bytes) {
            if (byte >= unbiasedLimit) continue;
            id += STUDY_NODE_ID_ALPHABET[byte % STUDY_NODE_ID_ALPHABET.length];
            if (id.length === STUDY_NODE_ID_LENGTH) break;
        }
    }
    return id;
}

function validateDtoNode(node: StudyTreeNodeDto): void {
    if (!isStudyNodeId(node.id)) throw new Error(`Invalid Study node id: ${node.id}`);
    if (node.parentId !== null && !isStudyNodeId(node.parentId)) {
        throw new Error(`Invalid Study parent node id: ${node.parentId}`);
    }
    if (!Number.isInteger(node.order) || node.order < 0) throw new Error('Study node order must be non-negative');
    if (!node.move) throw new Error('Study node move must be non-empty');
    if (!node.fen) throw new Error('Study node FEN must be non-empty');
    if (node.turnColor !== 'white' && node.turnColor !== 'black') throw new Error('Invalid Study node turn color');
}

function parentKey(parentId: string | null): string {
    return parentId ?? ROOT_PARENT_KEY;
}

export function analysisTreeFromStudy(rootStep: Step, dto: StudyTreeDto): AnalysisTree {
    const dtoById = new Map<string, StudyTreeNodeDto>();
    const children = new Map<string, StudyTreeNodeDto[]>();

    for (const node of dto.nodes) {
        validateDtoNode(node);
        if (dtoById.has(node.id)) throw new Error(`Duplicate Study node id: ${node.id}`);
        dtoById.set(node.id, node);
        const key = parentKey(node.parentId);
        const siblings = children.get(key) ?? [];
        if (siblings.some(sibling => sibling.order === node.order)) {
            throw new Error(`Duplicate Study sibling order ${node.order}`);
        }
        siblings.push(node);
        children.set(key, siblings);
    }

    for (const node of dto.nodes) {
        if (node.parentId !== null && !dtoById.has(node.parentId)) {
            throw new Error(`Study node ${node.id} has missing parent ${node.parentId}`);
        }
    }
    children.forEach(siblings => siblings.sort((a, b) => a.order - b.order));

    const root: AnalysisTreeNode = {
        id: 'root',
        path: '',
        ply: 0,
        step: rootStep,
        children: [],
        mainlinePly: 0,
    };
    const tree: AnalysisTree = {
        root,
        byPath: new Map([['', root]]),
        nextId: 1,
        nodeIdFactory: newStudyNodeId,
    };

    const queue: Array<{ parent: AnalysisTreeNode; stableParentId: string | null; onMainline: boolean }> = [
        { parent: root, stableParentId: null, onMainline: true },
    ];
    let attached = 0;

    while (queue.length) {
        const current = queue.shift()!;
        const siblings = children.get(parentKey(current.stableParentId)) ?? [];
        for (let index = 0; index < siblings.length; index++) {
            const dtoNode = siblings[index];
            const path = current.parent.path ? `${current.parent.path}.${dtoNode.id}` : dtoNode.id;
            const onMainline = current.onMainline && index === 0 && !dtoNode.forceVariation;
            const node: AnalysisTreeNode = {
                id: dtoNode.id,
                path,
                ply: current.parent.ply + 1,
                step: {
                    fen: dtoNode.fen,
                    move: dtoNode.move,
                    check: dtoNode.check,
                    turnColor: dtoNode.turnColor,
                    san: dtoNode.san,
                    sanSAN: dtoNode.sanSAN,
                },
                children: [],
                forceVariation: dtoNode.forceVariation,
                mainlinePly: onMainline ? current.parent.ply + 1 : undefined,
            };
            current.parent.children.push(node);
            tree.byPath.set(path, node);
            queue.push({ parent: node, stableParentId: dtoNode.id, onMainline });
            attached += 1;
        }
    }

    if (attached !== dto.nodes.length) throw new Error('Study tree contains a parent cycle');
    return tree;
}

function allocateStableId(preferred: string, used: Set<string>): string {
    if (isStudyNodeId(preferred) && !used.has(preferred)) {
        used.add(preferred);
        return preferred;
    }
    let id: string;
    do id = newStudyNodeId();
    while (used.has(id));
    used.add(id);
    return id;
}

export function studyTreeFromAnalysisTree(tree: AnalysisTree): StudyTreeDto {
    const nodes: StudyTreeNodeDto[] = [];
    const used = new Set<string>();
    const queue: Array<{ parent: AnalysisTreeNode; stableParentId: string | null }> = [
        { parent: tree.root, stableParentId: null },
    ];

    while (queue.length) {
        const { parent, stableParentId } = queue.shift()!;
        parent.children.forEach((child, order) => {
            if (!child.step.move) throw new Error('Study tree child must have a move');
            const id = allocateStableId(child.id, used);
            const node: StudyTreeNodeDto = {
                id,
                parentId: stableParentId,
                order,
                move: child.step.move,
                fen: child.step.fen,
                turnColor: child.step.turnColor,
                check: child.step.check,
            };
            if (child.step.san !== undefined) node.san = child.step.san;
            if (child.step.sanSAN !== undefined) node.sanSAN = child.step.sanSAN;
            if (child.forceVariation) node.forceVariation = true;
            nodes.push(node);
            queue.push({ parent: child, stableParentId: id });
        });
    }

    return { nodes };
}

export function addStudyNodeToAnalysisTree(
    tree: AnalysisTree,
    parentPath: string,
    dtoNode: StudyTreeNodeDto,
): string | undefined {
    validateDtoNode(dtoNode);
    const parent = tree.byPath.get(parentPath);
    if (!parent) return undefined;

    const expectedParentId = parentPath ? parent.id : null;
    if (dtoNode.parentId !== expectedParentId) return undefined;
    if (dtoNode.order !== parent.children.length) return undefined;

    for (const node of tree.byPath.values()) {
        if (node.id === dtoNode.id) return node.path;
    }

    const path = parentPath ? `${parentPath}.${dtoNode.id}` : dtoNode.id;
    const onMainline = parent.mainlinePly !== undefined && dtoNode.order === 0 && !dtoNode.forceVariation;
    const child: AnalysisTreeNode = {
        id: dtoNode.id,
        path,
        ply: parent.ply + 1,
        step: {
            fen: dtoNode.fen,
            move: dtoNode.move,
            check: dtoNode.check,
            turnColor: dtoNode.turnColor,
            san: dtoNode.san,
            sanSAN: dtoNode.sanSAN,
        },
        children: [],
        forceVariation: dtoNode.forceVariation,
        mainlinePly: onMainline ? parent.ply + 1 : undefined,
    };
    parent.children.push(child);
    tree.byPath.set(path, child);
    return path;
}

// Unlike ordinary post-game analysis, a Study's preferred mainline is mutable:
// promote/delete/force operations can change child[0] after the tree was loaded.
// Keep the generic analysis controller's mainline metadata/steps aligned with the
// current Study tree, mirroring lila's habit of recomputing its mainline from the
// tree after path/tree changes rather than treating the imported game as immutable.
export function refreshStudyMainline(tree: AnalysisTree): Step[] {
    tree.byPath.forEach(node => {
        if (node !== tree.root) node.mainlinePly = undefined;
    });
    tree.root.mainlinePly = 0;

    const steps: Step[] = [tree.root.step];
    let current = tree.root;
    while (current.children[0] && !current.children[0].forceVariation) {
        current = current.children[0];
        current.mainlinePly = steps.length;
        steps.push(current.step);
    }
    return steps;
}
