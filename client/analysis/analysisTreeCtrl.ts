import * as Mousetrap from 'mousetrap';

import { copyTextToClipboard } from '../clipboard';
import { Step } from '../messages';
import { updateMovelist } from '../movelist';
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
    renderLinePgnMoveText,
    setCollapsedFrom,
    someCollapsedFrom,
    stepLinePath,
} from './analysisTree';
import type { AnalysisController } from './analysisCtrl';

const TREE_COLLAPSED_STORAGE_KEY = 'analysisTreeCollapsedPaths';

// Owns the mutable single-board analysis-tree state and navigation behavior.
// Board/FEN/evaluation rendering remains on AnalysisController; this controller
// calls back into goPly() whenever selecting a tree node changes the active position.
export class AnalysisTreeController {
    analysisTree?: AnalysisTree;
    analysisPath: string;
    treeForkIndex: number;
    treeContextMenu?: { path: string; x: number; y: number };
    private readonly onTreeContextMenuDocumentClick: (event: MouseEvent) => void;

    constructor(private readonly ctrl: AnalysisController) {
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
        const initialPath = mainlinePathAtPly(this.analysisTree, ply);
        this.revealTreePath(initialPath);
        this.activateTreePath(initialPath, false, false);
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

    getTreeNodeListForPath(path: string) {
        if (!this.analysisTree) return [];
        return getNodeList(this.analysisTree, path);
    }

    getTreeMainlineEndPath() {
        if (!this.analysisTree) return '';
        return mainlineEndPath(this.analysisTree);
    }

    getTreeLineStartPath() {
        if (!this.analysisTree) return '';
        return branchStartPath(this.analysisTree, this.analysisPath);
    }

    getTreeLineEndPath() {
        if (!this.analysisTree) return '';
        return currentLineEndPath(this.analysisTree, this.analysisPath);
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
        this.ensureTreeSanSan();
        const onMainline = this.pathIsTreeMainline(path) && !this.pathIsTreeForcedVariation(path);
        copyTextToClipboard(
            renderLinePgnMoveText(
                this.analysisTree,
                onMainline ? extendPath(this.analysisTree, path, true) : path,
                node => node.step.sanSAN ?? '',
            ),
        );
        this.closeTreeContextMenu();
    }

    collapseAllTree() {
        if (!this.analysisTree) return;
        setCollapsedFrom(this.analysisTree, '', true);
        this.saveTreeCollapsedPaths();
        this.closeTreeContextMenu();
    }

    expandAllTree() {
        if (!this.analysisTree) return;
        setCollapsedFrom(this.analysisTree, '', false);
        this.saveTreeCollapsedPaths();
        this.closeTreeContextMenu();
    }

    promoteTreeVariation(path: string, toMainline: boolean) {
        if (!this.analysisTree) return;
        const changed = nodeAtPath(this.analysisTree, path) !== undefined;
        promoteNodePath(this.analysisTree, path, toMainline);
        if (changed) this.ctrl.analysisExtension?.onVariationPromoted?.(path, toMainline);
        updateMovelist(this.ctrl, true, false);
        this.closeTreeContextMenu();
    }

    forceTreeVariation(path: string, force: boolean) {
        if (!this.analysisTree) return;
        const changed = nodeAtPath(this.analysisTree, path) !== undefined;
        forceVariationAt(this.analysisTree, path, force);
        this.activateTreePath(path, true, false);
        if (changed) this.ctrl.analysisExtension?.onVariationForced?.(path, force);
    }

    deleteTreeNode(path: string) {
        if (!this.analysisTree || !path) return;
        const changed = nodeAtPath(this.analysisTree, path) !== undefined;
        const nextPath =
            this.analysisPath === path || this.analysisPath.startsWith(`${path}.`)
                ? parentPath(path)
                : this.analysisPath;
        deleteNodePath(this.analysisTree, path);
        this.revealTreePath(nextPath);
        this.saveTreeCollapsedPaths();
        this.activateTreePath(nextPath, true, false);
        if (changed) this.ctrl.analysisExtension?.onNodeDeleted?.(path);
        this.closeTreeContextMenu();
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

    toggleTreeCollapsed(path: string) {
        if (!this.analysisTree) return;
        const node = nodeAtPath(this.analysisTree, path);
        if (!node || node.children.length < 2) return;

        node.collapsed = !node.collapsed;
        if (node.collapsed) {
            const mainChildPath = node.children[0]?.path;
            if (this.analysisPath !== path && mainChildPath && !this.analysisPath.startsWith(mainChildPath)) {
                this.activateTreePath(path, false, false);
            }
        }
        this.revealTreePath(this.analysisPath);
        this.saveTreeCollapsedPaths();
        updateMovelist(this.ctrl, true, false);
    }

    activateTreeMainlinePly(ply: number) {
        if (!this.analysisTree) return;
        this.activateTreePath(mainlinePathAtPly(this.analysisTree, ply));
    }

    getTreeNodeForPly(ply: number) {
        if (!this.analysisTree) return undefined;

        const nodeOnActivePath = this.getTreeNodeList().find(node => node.ply === ply);
        if (nodeOnActivePath) return nodeOnActivePath;

        const mainlinePath = mainlinePathAtPly(this.analysisTree, ply);
        const mainlineNode = nodeAtPath(this.analysisTree, mainlinePath);
        if (!mainlineNode || this.ctrl.analysisExtension?.canActivatePath?.(mainlinePath) === false) return undefined;

        this.setAnalysisPath(mainlinePath);
        return mainlineNode;
    }

    activateTreePath(path: string, redrawMovelist = true, userNavigation = true) {
        if (!this.analysisTree) return;
        const node = nodeAtPath(this.analysisTree, path);
        if (!node) return;
        if (
            userNavigation &&
            path !== this.analysisPath &&
            this.ctrl.analysisExtension?.canActivatePath?.(path) === false
        )
            return;

        this.treeForkIndex = 0;
        this.treeContextMenu = undefined;
        document.removeEventListener('click', this.onTreeContextMenuDocumentClick, false);
        this.setAnalysisPath(path);
        this.revealTreePath(path);
        this.ctrl.plyVari = 0;
        this.ctrl.goPly(node.ply, 0);

        if (redrawMovelist) updateMovelist(this.ctrl, true, false);
    }

    recordMove(step: Step): { childPath: string; extendedMainline: boolean } | undefined {
        const tree = this.analysisTree;
        if (!tree) return undefined;

        const currentNode = this.getTreeCurrentNode() ?? tree.root;
        const followMainlineMove = currentNode.children[0]?.step.move;
        const extendsMainlineTail =
            this.analysisPath === this.getTreeMainlineEndPath() &&
            currentNode.mainlinePly !== undefined &&
            currentNode.mainlinePly === this.ctrl.steps.length - 1;
        const extendedMainline = extendsMainlineTail && followMainlineMove === undefined;
        const parentPath = this.analysisPath;
        const previousChildPaths = new Set(currentNode.children.map(child => child.path));
        const childPath = addOrSelectChild(
            tree,
            parentPath,
            step,
            extendedMainline,
            extendsMainlineTail ? this.ctrl.steps.length : undefined,
        );

        if (extendedMainline) {
            this.ctrl.steps.push(step);
            this.ctrl.recordedMainlinePly = this.ctrl.steps.length - 1;
        }

        if (!previousChildPaths.has(childPath)) {
            const child = nodeAtPath(tree, childPath);
            if (child) this.ctrl.analysisExtension?.onNodeAdded?.(parentPath, child);
        }

        return { childPath, extendedMainline };
    }

    ensureTreeSanSan() {
        if (!this.analysisTree) return;

        const visit = (parentFen: string, nodes: AnalysisTree['root']['children']) => {
            nodes.forEach(node => {
                if (node.step.sanSAN === undefined && node.step.move !== undefined) {
                    this.ctrl.ffishBoard.setFen(parentFen);
                    node.step.sanSAN = this.ctrl.ffishBoard.sanMove(node.step.move);
                }
                visit(node.step.fen, node.children);
            });
        };

        visit(this.ctrl.steps[0].fen, this.analysisTree.root.children);
    }

    private setAnalysisPath(path: string) {
        const previousPath = this.analysisPath;
        this.analysisPath = path;
        if (previousPath !== path) this.ctrl.analysisExtension?.onPathChanged?.(path, previousPath);
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
