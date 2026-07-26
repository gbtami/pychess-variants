import * as Mousetrap from 'mousetrap';

import { updateMovelist, scrollToActiveMove } from '../common/movelist';
import { copyTextToClipboard } from '../../clipboard';
import { Step } from '../../messages';
import { renderBughouseLinePgnMoveText } from './analysisTreeTwoBoards';
import {
    addOrSelectChild,
    AnalysisTree,
    branchStartPath,
    canPromoteVariation,
    createAnalysisTree,
    currentLineEndPath,
    deleteNodePath,
    extendPath,
    forceVariationAt,
    getNodeList,
    mainlineEndPath,
    mainlinePathAtPly,
    nextBranchPath,
    nodeAtPath,
    parentPath,
    pathIsForcedVariation,
    previousBranchPath,
    promoteNodePath,
    setCollapsedFrom,
    someCollapsedFrom,
    stepLinePath,
} from '../../analysis/analysisTree';
import type AnalysisControllerBughouse from './analysisCtrl';

const TREE_COLLAPSED_STORAGE_KEY = 'analysisTreeBugCollapsed';

// Analysis-tree navigation for the bughouse analysis page: tree state, path/node
// lookup and traversal, context-menu state, collapse persistence, and recording a
// played move into the tree. Owned by the analysis controller as `ctrl.tree`; the
// controller type is imported type-only, so there is no runtime edge back into it.
// Board/FEN/sound/render orchestration (goPly, sendMove's move handling) stays on
// the controller, which calls into this class for tree state only.
export class AnalysisTreeController {
    analysisTree?: AnalysisTree;
    analysisPath: string;
    treeForkIndex: number;
    treeContextMenu?: { path: string; x: number; y: number };
    private readonly onTreeContextMenuDocumentClick: (event: MouseEvent) => void;

    constructor(private readonly ctrl: AnalysisControllerBughouse) {
        this.analysisPath = '';
        this.treeForkIndex = 0;
        this.onTreeContextMenuDocumentClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest('.tree-context-menu')) return;
            this.closeTreeContextMenu();
        };
        this.bindTreeKeys();
    }

    private bindTreeKeys() {
        Mousetrap.bind('left', () => {
            if (!this.hasAnalysisTree()) return;
            const target = this.getTreeParentPath();
            if (target !== this.analysisPath) this.activateTreePath(target);
        });
        Mousetrap.bind('right', () => {
            if (!this.hasAnalysisTree()) return;
            const target = this.getTreeMainChildPath();
            if (target) this.activateTreePath(target);
        });
        Mousetrap.bind(['up', '0', 'home'], (event?: KeyboardEvent) => {
            if (!this.hasAnalysisTree()) return;
            if (event?.key === 'ArrowUp' && this.selectTreeFork('prev')) return;
            this.activateTreePath('');
        });
        Mousetrap.bind(['down', '$', 'end'], (event?: KeyboardEvent) => {
            if (!this.hasAnalysisTree()) return;
            if (event?.key === 'ArrowDown' && this.selectTreeFork('next')) return;
            this.activateTreePath(this.getTreeMainlineEndPath());
        });
        Mousetrap.bind('shift+left', () => {
            if (!this.hasAnalysisTree()) return;
            const target = this.getTreePreviousBranchPath();
            if (target !== this.analysisPath) this.activateTreePath(target);
        });
        Mousetrap.bind('shift+right', () => {
            if (!this.hasAnalysisTree()) return;
            const target = this.getTreeNextBranchPath();
            if (target !== this.analysisPath) this.activateTreePath(target);
        });
        Mousetrap.bind('shift+up', () => {
            if (!this.hasAnalysisTree()) return;
            const target = this.getTreeStepLinePath('prev');
            if (target !== this.analysisPath) this.activateTreePath(target);
        });
        Mousetrap.bind('shift+down', () => {
            if (!this.hasAnalysisTree()) return;
            const target = this.getTreeStepLinePath('next');
            if (target !== this.analysisPath) this.activateTreePath(target);
        });
    }

    hasAnalysisTree() {
        return this.analysisTree !== undefined;
    }

    initAnalysisTreeAtPly(ply: number) {
        if (this.ctrl.steps.length === 0) return;
        this.analysisTree = createAnalysisTree(this.ctrl.steps);
        this.applyTreeCollapsedPaths();
        this.analysisPath = mainlinePathAtPly(this.analysisTree, ply);
        this.revealTreePath(this.analysisPath);
        this.activateTreePath(this.analysisPath, false);
    }

    getTreeActivePath() {
        return this.analysisPath;
    }

    getTreeCurrentNode() {
        if (!this.analysisTree) return undefined;
        return nodeAtPath(this.analysisTree, this.analysisPath);
    }

    getTreeNodeList() {
        if (!this.analysisTree) return [];
        return getNodeList(this.analysisTree, this.analysisPath);
    }

    getTreeLineStartPath() {
        if (!this.analysisTree) return '';
        return branchStartPath(this.analysisTree, this.analysisPath);
    }

    getTreeLineEndPath() {
        if (!this.analysisTree) return '';
        return currentLineEndPath(this.analysisTree, this.analysisPath);
    }

    getTreeMainlineEndPath() {
        if (!this.analysisTree) return '';
        return mainlineEndPath(this.analysisTree);
    }

    getTreeParentPath() {
        return parentPath(this.analysisPath);
    }

    getTreeMainChildPath() {
        const node = this.getTreeCurrentNode();
        return node?.children[this.treeForkIndex]?.path ?? node?.children[0]?.path;
    }

    getTreeSelectedChildPath() {
        return this.treeForkIndex > 0 ? this.getTreeMainChildPath() : undefined;
    }

    getTreeNodeAtPath(path: string) {
        if (!this.analysisTree) return undefined;
        return nodeAtPath(this.analysisTree, path);
    }

    pathIsTreeMainline(path: string) {
        if (!this.analysisTree) return true;
        return getNodeList(this.analysisTree, path).every((node, idx) => idx === 0 || node.mainlinePly !== undefined);
    }

    pathIsTreeForcedVariation(path: string) {
        if (!this.analysisTree) return false;
        return pathIsForcedVariation(this.analysisTree, path);
    }

    canPromoteTreeVariation(path: string) {
        if (!this.analysisTree) return false;
        return canPromoteVariation(this.analysisTree, path);
    }

    someTreeCollapsed(collapsed: boolean) {
        if (!this.analysisTree) return false;
        return someCollapsedFrom(this.analysisTree, collapsed);
    }

    getTreeContextMenu() {
        return this.treeContextMenu;
    }

    openTreeContextMenu(path: string, clientX: number, clientY: number) {
        const container = document.getElementById('movelist');
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const x = clientX - rect.left + container.scrollLeft;
        const y = clientY - rect.top + container.scrollTop;

        this.treeContextMenu = { path, x, y };
        document.addEventListener('click', this.onTreeContextMenuDocumentClick, false);
        updateMovelist(this.ctrl, true, false);
    }

    closeTreeContextMenu() {
        if (!this.treeContextMenu) return;
        this.treeContextMenu = undefined;
        document.removeEventListener('click', this.onTreeContextMenuDocumentClick, false);
        updateMovelist(this.ctrl, true, false);
    }

    copyTreeLinePgn(path: string) {
        if (!this.analysisTree) return;
        const onMainline = this.pathIsTreeMainline(path) && !this.pathIsTreeForcedVariation(path);
        copyTextToClipboard(
            renderBughouseLinePgnMoveText(
                this.analysisTree,
                onMainline ? extendPath(this.analysisTree, path, true) : path,
                node => node.step.sanSAN ?? node.step.san ?? '',
            ),
        );
        this.closeTreeContextMenu();
    }

    toggleTreeCollapsed(path: string) {
        if (!this.analysisTree) return;
        const node = nodeAtPath(this.analysisTree, path);
        if (!node || node.children.length < 2) return;

        node.collapsed = !node.collapsed;
        if (node.collapsed) {
            const mainChildPath = node.children[0]?.path;
            if (this.analysisPath !== path && mainChildPath && !this.analysisPath.startsWith(mainChildPath)) {
                this.analysisPath = path;
                this.ctrl.goPly(node.ply, 0);
            }
        }
        this.revealTreePath(this.analysisPath);
        this.saveTreeCollapsedPaths();
        updateMovelist(this.ctrl, true, false);
    }

    collapseAllTree() {
        if (!this.analysisTree) return;
        setCollapsedFrom(this.analysisTree, '', true);
        this.saveTreeCollapsedPaths();
        this.closeTreeContextMenu();
        updateMovelist(this.ctrl, true, false);
    }

    expandAllTree() {
        if (!this.analysisTree) return;
        setCollapsedFrom(this.analysisTree, '', false);
        this.saveTreeCollapsedPaths();
        this.closeTreeContextMenu();
        updateMovelist(this.ctrl, true, false);
    }

    promoteTreeVariation(path: string, toMainline: boolean) {
        if (!this.analysisTree) return;
        promoteNodePath(this.analysisTree, path, toMainline);
        this.closeTreeContextMenu();
        updateMovelist(this.ctrl, true, false);
    }

    forceTreeVariation(path: string, force: boolean) {
        if (!this.analysisTree) return;
        forceVariationAt(this.analysisTree, path, force);
        this.activateTreePath(path);
    }

    deleteTreeNode(path: string) {
        if (!this.analysisTree || !path) return;
        const nextPath =
            this.analysisPath === path || this.analysisPath.startsWith(`${path}.`)
                ? parentPath(path)
                : this.analysisPath;
        deleteNodePath(this.analysisTree, path);
        this.revealTreePath(nextPath);
        this.saveTreeCollapsedPaths();
        this.closeTreeContextMenu();
        this.activateTreePath(nextPath);
    }

    getTreePreviousBranchPath() {
        if (!this.analysisTree) return this.analysisPath;
        return previousBranchPath(this.analysisTree, this.analysisPath);
    }

    getTreeNextBranchPath() {
        if (!this.analysisTree) return this.analysisPath;
        return nextBranchPath(this.analysisTree, this.analysisPath, this.treeForkIndex);
    }

    getTreeStepLinePath(which: 'prev' | 'next') {
        if (!this.analysisTree) return this.analysisPath;
        return stepLinePath(this.analysisTree, this.analysisPath, which);
    }

    selectTreeFork(which: 'prev' | 'next') {
        const node = this.getTreeCurrentNode();
        if (!node || node.children.length < 2) return false;

        const delta = which === 'next' ? 1 : -1;
        this.treeForkIndex = (node.children.length + this.treeForkIndex + delta) % node.children.length;
        updateMovelist(this.ctrl, true, false);
        return true;
    }

    activateTreeMainlinePly(ply: number, redrawMovelist = true) {
        if (!this.analysisTree) return;
        this.activateTreePath(mainlinePathAtPly(this.analysisTree, ply), redrawMovelist);
    }

    getTreeNodeForPly(ply: number) {
        if (!this.analysisTree) return undefined;

        const nodeOnActivePath = this.getTreeNodeList().find(node => node.ply === ply);
        if (nodeOnActivePath) return nodeOnActivePath;

        const mainlinePath = mainlinePathAtPly(this.analysisTree, ply);
        const mainlineNode = nodeAtPath(this.analysisTree, mainlinePath);
        if (mainlineNode) this.analysisPath = mainlinePath;
        return mainlineNode;
    }

    activateTreePath(path: string, redrawMovelist = true) {
        if (!this.analysisTree) return;
        const node = nodeAtPath(this.analysisTree, path);
        if (!node) return;

        this.revealTreePath(path);
        this.treeForkIndex = 0;
        this.treeContextMenu = undefined;
        document.removeEventListener('click', this.onTreeContextMenuDocumentClick, false);
        this.analysisPath = path;
        this.ctrl.plyVari = 0;
        this.ctrl.goPly(node.ply, 0);

        if (redrawMovelist) {
            updateMovelist(this.ctrl, true, false);
            scrollToActiveMove();
        }
    }

    // records a played move as a new (or existing) child of the current tree node,
    // extending the mainline tail when appropriate; returns the child path, or
    // undefined if there is no tree yet (mirrors the pre-extraction early return)
    recordMove(step: Step): string | undefined {
        const tree = this.analysisTree;
        if (!tree) return undefined;

        const currentNode = this.getTreeCurrentNode() ?? tree.root;
        const extendsMainlineTail =
            this.analysisPath === this.getTreeMainlineEndPath() &&
            currentNode.mainlinePly !== undefined &&
            currentNode.mainlinePly === this.ctrl.steps.length - 1;
        const childPath = addOrSelectChild(
            tree,
            this.analysisPath,
            step,
            extendsMainlineTail && currentNode.children[0] === undefined,
            extendsMainlineTail ? this.ctrl.steps.length : undefined,
        );

        if (extendsMainlineTail && currentNode.children[0] === undefined) {
            this.ctrl.steps.push(step);
            this.ctrl.recordedMainlinePly = this.ctrl.steps.length - 1;
        }

        return childPath;
    }

    // records a played move and, if the tree accepted it, activates the resulting
    // path in one step (no-op when there is no analysis tree yet, mirroring
    // recordMove's early return)
    consumeMove(step: Step): void {
        const childPath = this.recordMove(step);
        if (childPath === undefined) return;

        this.activateTreePath(childPath);
    }

    private treeCollapsedStorageKey() {
        return `${TREE_COLLAPSED_STORAGE_KEY}:${this.ctrl.gameId || `analysis:${this.ctrl.variant.name}`}`;
    }

    private applyTreeCollapsedPaths() {
        if (!this.analysisTree) return;
        let collapsedPaths: string[] = [];
        try {
            collapsedPaths = JSON.parse(localStorage[this.treeCollapsedStorageKey()] ?? '[]');
        } catch {
            collapsedPaths = [];
        }
        collapsedPaths.forEach(path => {
            const node = nodeAtPath(this.analysisTree!, path);
            if (node) node.collapsed = true;
        });
    }

    private saveTreeCollapsedPaths() {
        if (!this.analysisTree) return;
        const collapsedPaths: string[] = [];
        const visit = (node: AnalysisTree['root']) => {
            if (node.collapsed) collapsedPaths.push(node.path);
            node.children.forEach(visit);
        };
        visit(this.analysisTree.root);
        localStorage[this.treeCollapsedStorageKey()] = JSON.stringify(collapsedPaths);
    }

    private revealTreePath(path: string) {
        if (!this.analysisTree) return;
        getNodeList(this.analysisTree, path)
            .slice(0, -1)
            .forEach(node => {
                node.collapsed = false;
            });
    }
}
