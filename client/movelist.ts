import { h, VNode } from 'snabbdom';

import { _ } from './i18n';
import { GameController } from './gameCtrl';
import { result } from './result'
import { Step } from './messages';
import { patch } from './document';
import { AnalysisTreeNode } from './analysisTree';

type TreeCtrl = GameController & {
    analysisTree?: { root: AnalysisTreeNode };
    hasAnalysisTree?: () => boolean;
    isTreeInlineNotation?: () => boolean;
    getTreeActivePath?: () => string;
    activateTreePath?: (path: string) => void;
    getTreeLineStartPath?: () => string;
    getTreeLineEndPath?: () => string;
    getTreeParentPath?: () => string;
    getTreeMainChildPath?: () => string | undefined;
};

function asTreeCtrl(ctrl: GameController): TreeCtrl | undefined {
    const treeCtrl = ctrl as TreeCtrl;
    return treeCtrl.hasAnalysisTree?.() ? treeCtrl : undefined;
}

function clearActiveMoveHighlight() {
    document.querySelectorAll('move.active, vari-move.active').forEach((el) => el.classList.remove('active'));
}

export function normalizePlyVariForSelection(
    plyVari: number,
    variationLength: number | undefined,
    ply: number,
): number {
    // Keep variation context only when the target ply is inside that variation.
    // This prevents stale plyVari state from blocking main-line highlight updates.
    if (
        plyVari > 0
        && variationLength !== undefined
        && variationLength > 0
        && ply >= plyVari
        && ply <= plyVari + variationLength - 1
    ) {
        return plyVari;
    }
    return 0;
}

export function selectMove (ctrl: GameController, ply: number, plyVari = 0): void {
    //console.log("selectMove()", ply, plyVari);

    const treeCtrl = asTreeCtrl(ctrl);
    if (treeCtrl) {
        if (ply < 0) return;
        ctrl.goPly(ply, 0);
        updateMovelist(ctrl, true, false);
        scrollToPly(ctrl);
        return;
    }

    let plyMax = ctrl.steps.length - 1;
    const vari = "plyVari" in ctrl ? ctrl.steps[ctrl.plyVari]?.vari : undefined;
    const requestedVariLength = "plyVari" in ctrl ? ctrl.steps[plyVari]?.vari?.length : undefined;
    plyVari = normalizePlyVariForSelection(plyVari, requestedVariLength, ply);
    if (vari && ctrl.plyVari > 0) plyMax = ctrl.plyVari + vari.length - 1;

    if (ply < 0 || ply > plyMax) {
        return
    }

    if (plyVari > 0 && ply < plyVari) {
        // back to the main line
        plyVari = 0;
    }

    ctrl.goPly(ply, plyVari);

    if (plyVari === 0) {
        activatePly(ctrl);
        scrollToPly(ctrl);
    } else {
        activatePlyVari(ply);
    }

}

function activatePly (ctrl: GameController) {
    //console.log('activatePly()', ctrl.ply, ctrl.plyVari);
    clearActiveMoveHighlight();

    const elPly = document.querySelector(`move[ply="${ctrl.ply}"]`);
    if (elPly) elPly.classList.add('active');
}

function scrollToPly (ctrl: GameController) {
    const movelistEl = document.getElementById('movelist') as HTMLElement;
    const plyEl = movelistEl.querySelector('move.active') as HTMLElement | null;

    let st: number | undefined = undefined;

    if (ctrl.ply === 0) st = 0;
    else if (plyEl) st = plyEl.offsetTop - movelistEl.offsetHeight / 2 + plyEl.offsetHeight / 2;

    if (st !== undefined)
        movelistEl.scrollTop = st;
}

export function activatePlyVari (ply: number) {
    //console.log('activatePlyVari()', ply);
    clearActiveMoveHighlight();

    const elPly = document.querySelector(`vari-move[ply="${ply}"]`);
    if (elPly) elPly.classList.add('active');
}

export function isTheoreticalMove(
    ply: number,
    status: number,
    recordedMainlinePly: number | undefined,
) {
    // In finished games, moves beyond the persisted game tail are analysis-only.
    return status >= 0 && recordedMainlinePly !== undefined && ply > recordedMainlinePly;
}

export function getFastMoveSelection(
    plyVari: number,
    variLength: number | undefined,
    mainLineLastPly: number,
    goToStart: boolean,
) {
    if (variLength !== undefined && plyVari > 0 && variLength > 0) {
        return {
            ply: goToStart ? plyVari : plyVari + variLength - 1,
            plyVari,
        };
    }

    return {
        ply: goToStart ? 0 : mainLineLastPly,
        plyVari: 0,
    };
}

export function createMovelistButtons (ctrl: GameController) {
    const container = document.getElementById('move-controls') as HTMLElement;
    const treeCtrl = asTreeCtrl(ctrl);

    const selectVariationBound = (goToStart: boolean) => {
        if (treeCtrl) {
            const target = goToStart ? treeCtrl.getTreeLineStartPath?.() : treeCtrl.getTreeLineEndPath?.();
            if (target !== undefined) treeCtrl.activateTreePath?.(target);
            return;
        }
        const vari = "plyVari" in ctrl ? ctrl.steps[ctrl.plyVari]?.vari : undefined;
        const target = getFastMoveSelection(ctrl.plyVari, vari?.length, ctrl.steps.length - 1, goToStart);
        selectMove(ctrl, target.ply, target.plyVari);
    };

    let buttons = [
        h('button', { on: { click: () => ctrl.toggleOrientation() }, props: { title: _('Flip board')} }, [ h('i.icon.icon-refresh') ]),
        h('button', { on: { click: () => selectVariationBound(true) } }, [ h('i.icon.icon-fast-backward') ]),
        h('button', {
            on: {
                click: () => {
                    if (treeCtrl) {
                        const target = treeCtrl.getTreeParentPath?.();
                        if (target !== undefined) treeCtrl.activateTreePath?.(target);
                    } else {
                        selectMove(ctrl, ctrl.ply - 1, ctrl.plyVari);
                    }
                }
            }
        }, [ h('i.icon.icon-step-backward') ]),
        h('button', {
            on: {
                click: () => {
                    if (treeCtrl) {
                        const target = treeCtrl.getTreeMainChildPath?.();
                        if (target !== undefined) treeCtrl.activateTreePath?.(target);
                    } else {
                        selectMove(ctrl, ctrl.ply + 1, ctrl.plyVari);
                    }
                }
            }
        }, [ h('i.icon.icon-step-forward') ]),
        h('button', { on: { click: () => selectVariationBound(false) } }, [ h('i.icon.icon-fast-forward') ]),
    ];
    if (ctrl.variant.name === 'alice') {
        buttons.push(h('button#alice', { on: { click: () => ctrl.switchAliceBoards() }, props: { title: _('Switch boards')} }, [ h('i.icon.icon-exchange') ]));
    }

    if ("localEngine" in ctrl) {
        buttons.push(h('button#bars', { on: { click: () => ctrl.toggleSettings() }, props: { title: _('Menu')} }, [ h('i.icon.icon-bars') ]));
    } else {
        if (ctrl.corr && ctrl.variant.name !== 'fogofwar') {
            const url = ctrl.home + '/corranalysis/' + ctrl.gameId + `?ply=${ctrl.ply + 1}`;
            buttons.push(h('button#corr', { on: { click: () => window.location.assign(url) }, props: { title: _('Analysis board')} }, [ h('i.icon.icon-microscope') ]));
        }
    }

    ctrl.moveControls = patch(container, h('div#btn-controls-top.btn-controls', buttons));
}

function renderTreeMove(
    ctrl: TreeCtrl,
    path: string,
    node: AnalysisTreeNode,
    rootTurnColor: string,
    firstInVariation: boolean,
    isMainline: boolean,
): VNode {
    const move = (ctrl.fog && ctrl.status < 0 && (node.step.turnColor === ctrl.mycolor || ctrl.spectator)) ? '?' : node.step.san;
    const isWhiteMove = node.step.turnColor === 'black';
    let prefix = '';
    if (rootTurnColor === 'black' && node.ply === 1) {
        prefix = '1... ';
    } else if (isWhiteMove) {
        prefix = `${Math.ceil((node.ply + 1) / 2)}. `;
    } else if (firstInVariation) {
        prefix = `${Math.floor((node.ply + 1) / 2)}... `;
    }

    const scoreStr = node.step.scoreStr ?? '';
    const evalNode = node.mainlinePly !== undefined
        ? h(`eval#ply${node.mainlinePly}`, scoreStr)
        : h('eval', scoreStr);

    const recordedMainlinePly = (ctrl as GameController & { recordedMainlinePly?: number }).recordedMainlinePly;
    const theoretical =
        node.mainlinePly === undefined
        || (node.mainlinePly !== undefined && isTheoreticalMove(node.mainlinePly, ctrl.status, recordedMainlinePly));

    return h('move', {
        class: {
            active: path === ctrl.getTreeActivePath?.(),
            theoretical,
            'tree-node': true,
            mainline: isMainline,
        },
        attrs: { 'data-path': path },
        on: { click: () => ctrl.activateTreePath?.(path) },
    }, [
        prefix ? h('index', prefix) : undefined,
        h('san', `${move ?? ''}`),
        evalNode,
    ]);
}

function renderTreeBranch(
    ctrl: TreeCtrl,
    node: AnalysisTreeNode,
    firstInVariation: boolean,
    rootTurnColor: string,
    isMainline: boolean,
): VNode[] {
    const out: VNode[] = [];
    let current: AnalysisTreeNode | undefined = node;
    let isFirst = firstInVariation;

    while (current) {
        out.push(renderTreeMove(ctrl, current.path, current, rootTurnColor, isFirst, isMainline));
        const sidelines = current.children.slice(1);
        sidelines.forEach((sideline) => {
            out.push(h('inline', renderTreeBranch(ctrl, sideline, true, rootTurnColor, false)));
        });

        current = current.children[0];
        isFirst = false;
    }

    return out;
}

function renderTreeMovelist(ctrl: TreeCtrl): VNode[] {
    const root = ctrl.analysisTree!.root;
    const rootTurnColor = root.step.turnColor;
    const moves: VNode[] = [];
    const mainline = root.children[0];
    if (mainline) moves.push(...renderTreeBranch(ctrl, mainline, false, rootTurnColor, true));
    root.children.slice(1).forEach((sideline) => {
        moves.push(h('inline', renderTreeBranch(ctrl, sideline, true, rootTurnColor, false)));
    });
    return moves;
}

function renderTreeGridMove(
    ctrl: TreeCtrl,
    path: string,
    node: AnalysisTreeNode,
    isMainline: boolean,
): VNode {
    const move = (ctrl.fog && ctrl.status < 0 && (node.step.turnColor === ctrl.mycolor || ctrl.spectator)) ? '?' : node.step.san;
    const scoreStr = node.step.scoreStr ?? '';
    const evalNode = node.mainlinePly !== undefined
        ? h(`eval#ply${node.mainlinePly}`, scoreStr)
        : h('eval', scoreStr);

    const recordedMainlinePly = (ctrl as GameController & { recordedMainlinePly?: number }).recordedMainlinePly;
    const theoretical =
        node.mainlinePly === undefined
        || (node.mainlinePly !== undefined && isTheoreticalMove(node.mainlinePly, ctrl.status, recordedMainlinePly));

    return h('move', {
        class: {
            active: path === ctrl.getTreeActivePath?.(),
            theoretical,
            'tree-node': true,
            mainline: isMainline,
            'tree-grid-move': true,
        },
        attrs: { 'data-path': path },
        on: { click: () => ctrl.activateTreePath?.(path) },
    }, [
        h('san', `${move ?? ''}`),
        evalNode,
    ]);
}

function renderTreeGridRow(
    ctrl: TreeCtrl,
    whiteNode: AnalysisTreeNode | undefined,
    blackNode: AnalysisTreeNode | undefined,
    depth: number,
    rootTurnColor: string,
    isMainline: boolean,
): VNode {
    const anchorNode = whiteNode ?? blackNode!;
    const rowNumber = Math.ceil(anchorNode.ply / 2);
    const rowLabel =
        !whiteNode && blackNode && anchorNode.ply === 1 && rootTurnColor === 'black'
            ? `${rowNumber}...`
            : `${rowNumber}.`;

    const whiteCell = whiteNode
        ? renderTreeGridMove(ctrl, whiteNode.path, whiteNode, isMainline)
        : h('div.tree-grid-empty');
    const blackCell = blackNode
        ? renderTreeGridMove(ctrl, blackNode.path, blackNode, isMainline)
        : h('div.tree-grid-empty');

    return h('div.tree-row', {
        class: {
            'tree-row-mainline': isMainline,
            'tree-row-variation': !isMainline,
            [`tree-depth-${Math.min(depth, 8)}`]: depth > 0,
        },
    }, [
        h('div.tree-row-index', rowLabel),
        h('div.tree-row-cell.tree-row-white', [whiteCell]),
        h('div.tree-row-cell.tree-row-black', [blackCell]),
    ]);
}

function renderTreeGridVariationBlocks(
    ctrl: TreeCtrl,
    branches: AnalysisTreeNode[],
    depth: number,
    rootTurnColor: string,
): VNode[] {
    return branches.map((branch) =>
        h('div.tree-variation-block', {
            class: {
                [`tree-depth-${Math.min(depth + 1, 8)}`]: true,
            },
        }, renderTreeGridBranch(ctrl, branch, depth + 1, rootTurnColor, false))
    );
}

function renderTreeGridBranch(
    ctrl: TreeCtrl,
    startNode: AnalysisTreeNode,
    depth: number,
    rootTurnColor: string,
    isMainline: boolean,
    sidelineSiblings: AnalysisTreeNode[] = [],
): VNode[] {
    const out: VNode[] = [];
    let current: AnalysisTreeNode | undefined = startNode;
    let initialSidelines = sidelineSiblings;

    while (current) {
        const whiteNode: AnalysisTreeNode | undefined = current.step.turnColor === 'black' ? current : undefined;
        const mainBlackNode: AnalysisTreeNode | undefined =
            whiteNode && current.children[0]?.step.turnColor === 'white'
                ? current.children[0]
                : undefined;
        const blackNode: AnalysisTreeNode | undefined = whiteNode ? mainBlackNode : current;

        out.push(renderTreeGridRow(ctrl, whiteNode, blackNode, depth, rootTurnColor, isMainline));

        if (initialSidelines.length > 0) {
            out.push(...renderTreeGridVariationBlocks(ctrl, initialSidelines, depth, rootTurnColor));
            initialSidelines = [];
        }

        const branchSidelines: AnalysisTreeNode[] = [];
        if (whiteNode) branchSidelines.push(...whiteNode.children.slice(mainBlackNode ? 1 : 0));
        if (blackNode) branchSidelines.push(...blackNode.children.slice(1));
        if (branchSidelines.length > 0) {
            out.push(...renderTreeGridVariationBlocks(ctrl, branchSidelines, depth, rootTurnColor));
        }

        if (whiteNode && mainBlackNode) current = mainBlackNode.children[0];
        else if (whiteNode) current = undefined;
        else current = blackNode?.children[0];
    }

    return out;
}

function renderTreeGridMovelist(ctrl: TreeCtrl): VNode[] {
    const root = ctrl.analysisTree!.root;
    const mainline = root.children[0];
    if (!mainline) return [];
    return renderTreeGridBranch(ctrl, mainline, 0, root.step.turnColor, true, root.children.slice(1));
}

export function updateMovelist (ctrl: GameController, full = true, activate = true, needResult = true) {
    const treeCtrl = asTreeCtrl(ctrl);
    if (treeCtrl) {
        const inlineNotation = treeCtrl.isTreeInlineNotation?.() ?? false;
        const moves = inlineNotation ? renderTreeMovelist(treeCtrl) : renderTreeGridMovelist(treeCtrl);
        if (ctrl.status >= 0 && needResult) {
            moves.push(h('div.result', ctrl.result));
            moves.push(h('div.status', result(ctrl.variant, ctrl.status, ctrl.result)));
        }
        const container = document.getElementById('movelist') as HTMLElement;
        if (full) {
            while (container.lastChild) {
                container.removeChild(container.lastChild);
            }
        }
        ctrl.vmovelist = patch(container, h('div#movelist', {
            class: {
                tview2: true,
                'tview2-inline': inlineNotation,
                'tview2-grid': !inlineNotation,
                'analysis-tree': true,
            },
        }, moves));
        if (activate) scrollToPly(ctrl);
        return;
    }

    const plyFrom = (full) ? 1 : ctrl.steps.length -1
    const plyTo = ctrl.steps.length;

    const moves: VNode[] = [];

    const blackStarts = ctrl.steps[0].turnColor === 'black';
    if (blackStarts && plyFrom === 1) {
        moves.push(h('move.counter', 1));
        moves.push(h('move', '...'));
    }

    for (let ply = plyFrom; ply < plyTo; ply++) {
        const move = (ctrl.fog && ctrl.status < 0 && (ctrl.steps[ply].turnColor === ctrl.mycolor || ctrl.spectator)) ? '?' : ctrl.steps[ply].san;
        if (move === null) continue;

        const whiteMove = ctrl.steps[ply].turnColor === 'black';
        const moveEl = [ h('san', move) ];
        const scoreStr = ctrl.steps[ply]['scoreStr'] ?? '';
        moveEl.push(h('eval#ply' + ply, scoreStr));

        if (whiteMove)
            moves.push(h('move.counter', Math.ceil((ply + 1) / 2)));

        const el = h('move', {
            class: {
                active: ((ply === plyTo - 1) && activate),
                theoretical: isTheoreticalMove(ply, ctrl.status, (ctrl as GameController & { recordedMainlinePly?: number }).recordedMainlinePly),
            },
            attrs: { ply: ply },
            on: { click: () => selectMove(ctrl, ply) },
        }, moveEl);

        moves.push(el);
        
        if (ctrl.steps[ply]['vari'] !== undefined && "plyVari" in ctrl) {
            const variMoves = ctrl.steps[ply]['vari'];

            if (whiteMove) moves.push(h('move', '...'));

            moves.push(h('vari#vari' + ctrl.plyVari,
                variMoves?
                    variMoves.map((x: Step, idx: number) => {
                    const currPly = ctrl.plyVari + idx + ((blackStarts) ? 1 : 0);
                    const moveCounter = (currPly % 2 !== 0) ? (currPly + 1) / 2 + '. ' : (idx === 0) ? Math.floor((currPly + 1) / 2) + '...' : ' ';
                    return h('vari-move', {
                        attrs: { ply: ctrl.plyVari + idx },
                        on: { click: () => selectMove(ctrl, ctrl.plyVari + idx, ctrl.plyVari) },
                        }, [ h('san', moveCounter + x['san']) ]
                    );
                }) : []
            ));

            if (whiteMove) {
                moves.push(h('move.counter', Math.ceil((ply + 1) / 2)));
                moves.push(h('move', '...'));
            }
        }
    }

    if (ctrl.status >= 0 && needResult) {
        moves.push(h('div.result', ctrl.result));
        moves.push(h('div.status', result(ctrl.variant, ctrl.status, ctrl.result)));
    }

    const container = document.getElementById('movelist') as HTMLElement;
    if (full) {
        while (container.lastChild) {
            container.removeChild(container.lastChild);
        }
    }
    ctrl.vmovelist = patch(container, h('div#movelist', moves));

    if (activate) {
        activatePly(ctrl);
        scrollToPly(ctrl);
    }
}

export function updateResult (ctrl: GameController) {
    if (ctrl.status < 0) return;

    // Prevent to render it twice
    const resultEl = document.querySelector('.result');
    if (resultEl) return;

    const container = document.getElementById('movelist') as HTMLElement;
    ctrl.vmovelist = patch(container, h('div#movelist', [
        h('div.result', ctrl.result),
        h('div.status', result(ctrl.variant, ctrl.status, ctrl.result))
    ]));
    container.scrollTop = 99999;
}
