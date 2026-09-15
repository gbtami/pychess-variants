import { getNodeList, type AnalysisTree, type AnalysisTreeNode } from '../analysis/analysisTree';

/**
 * Return the authored lesson script. Child[0] is the only accepted continuation;
 * forced-variation display flags and learner-created branches never redefine it.
 */
export function studyGamebookMainline(tree: AnalysisTree): AnalysisTreeNode[] {
    const line = [tree.root];
    let node = tree.root;
    while (node.children[0]) {
        node = node.children[0];
        line.push(node);
    }
    return line;
}

export function gamebookPathIsMainline(tree: AnalysisTree, path: string): boolean {
    const nodes = getNodeList(tree, path);
    return nodes.every((node, index) => index === 0 || nodes[index - 1].children[0] === node);
}

/** Select the first nonempty ordinary comment in persisted order. */
export function firstGamebookComment(node: AnalysisTreeNode): string | undefined {
    return node.annotations?.comments.find(comment => comment.text.trim())?.text;
}
