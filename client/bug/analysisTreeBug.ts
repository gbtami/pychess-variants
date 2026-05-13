import { AnalysisTree, AnalysisTreeNode, getNodeList, projectPath } from '../analysis/analysisTree';
import { Step } from '../messages';

export function bugMovePrefix(step: Step): string {
    const boardName = step.turnColor === 'white' ? step.boardName : step.boardName?.toUpperCase();
    const boardPly = step.boardName === 'a' ? step.plyA : step.plyB;
    const moveNo = Math.floor(((boardPly ?? 0) + 1) / 2);
    return `${moveNo}${boardName}.`;
}

function renderBugPgnSequence(
    nodes: AnalysisTreeNode[],
    isMainline: boolean,
    getSan: (node: AnalysisTreeNode) => string,
): string[] {
    const [child, ...siblings] = nodes;
    if (!child) return [];

    const tokens: string[] = [];
    let current: AnalysisTreeNode | undefined = child;
    let branchSiblings = siblings;

    while (current) {
        if (current.forceVariation && isMainline) {
            tokens.push(`(${renderBugPgnSequence([current, ...branchSiblings], false, getSan).join(' ')})`);
            break;
        }

        tokens.push(`${bugMovePrefix(current.step)} ${getSan(current)}`);

        branchSiblings.forEach((sideline) => {
            tokens.push(`(${renderBugPgnSequence([sideline], false, getSan).join(' ')})`);
        });
        branchSiblings = [];

        current.children.slice(1).forEach((sideline) => {
            tokens.push(`(${renderBugPgnSequence([sideline], false, getSan).join(' ')})`);
        });

        current = current.children[0];
    }

    return tokens;
}

export function renderBughouseTreePgnMoveText(
    tree: AnalysisTree,
    getSan: (node: AnalysisTreeNode) => string,
): string {
    return renderBugPgnSequence(tree.root.children, true, getSan).join(' ');
}

function collectBughouseLineNodes(tree: AnalysisTree, path: string): AnalysisTreeNode[] {
    const projection = projectPath(tree, path);

    if (projection.isMainline) {
        const nodes: AnalysisTreeNode[] = [];
        let current = tree.root.children[0];
        while (current) {
            nodes.push(current);
            if (current.children[0]?.forceVariation) break;
            current = current.children[0];
        }
        return nodes;
    }

    const pathNodes = getNodeList(tree, path);
    const firstVariationIdx = pathNodes.findIndex((node) => node.mainlinePly === undefined);
    const nodes = pathNodes.slice(firstVariationIdx);
    let current = nodes[nodes.length - 1];
    while (current?.children[0]) {
        current = current.children[0];
        nodes.push(current);
    }
    return nodes;
}

export function renderBughouseLinePgnMoveText(
    tree: AnalysisTree,
    path: string,
    getSan: (node: AnalysisTreeNode) => string,
): string {
    return collectBughouseLineNodes(tree, path)
        .map((node) => `${bugMovePrefix(node.step)} ${getSan(node)}`)
        .join(' ');
}
