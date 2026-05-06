import { AnalysisTree, AnalysisTreeNode } from '../analysis/analysisTree';
import { Step } from '../messages';

export function bugMovePrefix(step: Step): string {
    const boardName = step.turnColor === 'white' ? step.boardName : step.boardName?.toUpperCase();
    const boardPly = step.boardName === 'a' ? step.plyA : step.plyB;
    const moveNo = Math.floor(((boardPly ?? 0) + 1) / 2);
    return `${moveNo}${boardName}.`;
}

function renderBugPgnSequence(
    nodes: AnalysisTreeNode[],
    getSan: (node: AnalysisTreeNode) => string,
): string[] {
    const [child, ...siblings] = nodes;
    if (!child) return [];

    const tokens: string[] = [];
    let current: AnalysisTreeNode | undefined = child;
    let branchSiblings = siblings;

    while (current) {
        tokens.push(`${bugMovePrefix(current.step)} ${getSan(current)}`);

        branchSiblings.forEach((sideline) => {
            tokens.push(`(${renderBugPgnSequence([sideline], getSan).join(' ')})`);
        });
        branchSiblings = [];

        current.children.slice(1).forEach((sideline) => {
            tokens.push(`(${renderBugPgnSequence([sideline], getSan).join(' ')})`);
        });

        current = current.children[0];
    }

    return tokens;
}

export function renderBughouseTreePgnMoveText(
    tree: AnalysisTree,
    getSan: (node: AnalysisTreeNode) => string,
): string {
    return renderBugPgnSequence(tree.root.children, getSan).join(' ');
}
