import { h, VNode } from 'snabbdom';

import { _ } from './i18n';
import { GameController } from './gameCtrl';
import { result } from './result'
import { patch } from './document';
import { AnalysisTreeNode } from './analysis/analysisTree';

type TreeCtrl = GameController & {
    analysisTree?: { root: AnalysisTreeNode };
    hasAnalysisTree?: () => boolean;
    isTreeInlineNotation?: () => boolean;
    getTreeActivePath?: () => string;
    activateTreePath?: (path: string) => void;
    activateTreeMainlinePly?: (ply: number) => void;
    getTreeSelectedChildPath?: () => string | undefined;
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

export function selectMove (ctrl: GameController, ply: number, _plyVari = 0): void {
    //console.log("selectMove()", ply);

    const treeCtrl = asTreeCtrl(ctrl);
    if (treeCtrl) {
        if (ply < 0) return;
        ctrl.goPly(ply, 0);
        updateMovelist(ctrl, true, false);
        scrollToPly(ctrl);
        return;
    }

    if (ply < 0 || ply > ctrl.steps.length - 1) {
        return
    }

    ctrl.goPly(ply, 0);
    activatePly(ctrl);
    scrollToPly(ctrl);

}

export function selectMainlineMove(ctrl: GameController, ply: number): void {
    const treeCtrl = asTreeCtrl(ctrl);
    if (treeCtrl?.activateTreeMainlinePly) {
        treeCtrl.activateTreeMainlinePly(ply);
        return;
    }
    selectMove(ctrl, ply, 0);
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

export function isTheoreticalMove(
    ply: number,
    status: number,
    recordedMainlinePly: number | undefined,
) {
    // In finished games, moves beyond the persisted game tail are analysis-only.
    return status >= 0 && recordedMainlinePly !== undefined && ply > recordedMainlinePly;
}

export function getFastMoveSelection(
    _plyVari: number,
    _variLength: number | undefined,
    mainLineLastPly: number,
    goToStart: boolean,
) {
    return {
        ply: goToStart ? 0 : mainLineLastPly,
        plyVari: 0,
    };
}

export function createMovelistButtons (ctrl: GameController) {
    const container = document.getElementById('move-controls') as HTMLElement;

    const selectVariationBound = (goToStart: boolean) => {
        const treeCtrl = asTreeCtrl(ctrl);
        if (treeCtrl) {
            const target = goToStart ? treeCtrl.getTreeLineStartPath?.() : treeCtrl.getTreeLineEndPath?.();
            if (target !== undefined) treeCtrl.activateTreePath?.(target);
            return;
        }
        const target = getFastMoveSelection(0, undefined, ctrl.steps.length - 1, goToStart);
        selectMove(ctrl, target.ply, target.plyVari);
    };

    let buttons = [
        h('button', { on: { click: () => ctrl.toggleOrientation() }, props: { title: _('Flip board')} }, [ h('i.icon.icon-refresh') ]),
        h('button', { on: { click: () => selectVariationBound(true) } }, [ h('i.icon.icon-fast-backward') ]),
        h('button', {
            on: {
                click: () => {
                    const treeCtrl = asTreeCtrl(ctrl);
                    if (treeCtrl) {
                        const target = treeCtrl.getTreeParentPath?.();
                        if (target !== undefined) treeCtrl.activateTreePath?.(target);
                    } else selectMove(ctrl, ctrl.ply - 1, 0);
                }
            }
        }, [ h('i.icon.icon-step-backward') ]),
        h('button', {
            on: {
                click: () => {
                    const treeCtrl = asTreeCtrl(ctrl);
                    if (treeCtrl) {
                        const target = treeCtrl.getTreeMainChildPath?.();
                        if (target !== undefined) treeCtrl.activateTreePath?.(target);
                    } else selectMove(ctrl, ctrl.ply + 1, 0);
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
            selected: path === ctrl.getTreeSelectedChildPath?.(),
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
    // Inline mode is the simplest renderer: walk the preferred continuation and
    // emit each sideline as a parenthesized inline fragment at the branch point.
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

interface TreeColumnArgs {
    isMainline: boolean;
    rootTurnColor: string;
    // When true, a sideline is compact enough to stay inside parentheses.
    parenthetical?: boolean;
    firstInVariation?: boolean;
    // Once a sideline row has started, deeper sub-variations should keep flowing
    // inline inside that row so wrapping behaves like wrapped text, not nested grids.
    flowInline?: boolean;
}

function hasBranching(node: AnalysisTreeNode, depth: number): boolean {
    if (node.children.length > 1) return true;
    if (depth <= 1) return false;
    return node.children.some((child) => hasBranching(child, depth - 1));
}

function isParentheticalVariation(node: AnalysisTreeNode): boolean {
    // Match the Lichess heuristic closely: only keep a variation inline when there
    // is a single secondary branch and that branch is not itself heavily branching.
    const second = node.children[1];
    const third = node.children[2];
    return third === undefined && second !== undefined && !hasBranching(second, 6);
}

function nextTreeColumnArgs(node: AnalysisTreeNode, args: TreeColumnArgs, isMainline = false): TreeColumnArgs {
    return {
        isMainline,
        rootTurnColor: args.rootTurnColor,
        parenthetical: isParentheticalVariation(node),
        firstInVariation: false,
        flowInline: args.flowInline,
    };
}

function renderTreeColumnMove(
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
        selected: path === ctrl.getTreeSelectedChildPath?.(),
        theoretical,
        'tree-node': true,
        mainline: isMainline,
    },
    attrs: { 'data-path': path },
    on: { click: () => ctrl.activateTreePath?.(path) },
    }, [
        h('san', `${move ?? ''}`),
        evalNode,
    ]);
}

function renderTreeLineSequence(
    ctrl: TreeCtrl,
    nodes: AnalysisTreeNode[],
    args: TreeColumnArgs,
): VNode[] {
    // Column mode still reuses inline fragments inside a sideline row. The split between
    // `renderTreeLineSequence` and `renderTreeVariationLines` is what lets us switch
    // between "same flowing row" and "start a new branch row" at each branching point.
    const [child, ...siblings] = nodes;
    if (!child) return [];

    const childArgs = nextTreeColumnArgs(child, args, false);
    const moves: VNode[] = [];

    moves.push(
        renderTreeMove(
            ctrl,
            child.path,
            child,
            args.rootTurnColor,
            args.firstInVariation ?? true,
            false,
        ),
    );

    if ((args.parenthetical || args.flowInline) && siblings.length > 0) {
        moves.push(renderTreeVariationLines(ctrl, siblings, args));
    }

    if (child.children.length > 0) {
        if (args.flowInline || child.children.length < 2 || childArgs.parenthetical) {
            moves.push(...renderTreeLineSequence(ctrl, child.children, childArgs));
        } else {
            moves.push(renderTreeVariationLines(ctrl, child.children, childArgs));
        }
    }

    if (!args.parenthetical && !args.flowInline && siblings.length > 0) {
        moves.push(renderTreeVariationLines(ctrl, siblings, args));
    }

    return moves;
}

function renderTreeVariationLines(
    ctrl: TreeCtrl,
    lines: AnalysisTreeNode[],
    args: TreeColumnArgs,
): VNode {
    // Only direct sibling alternatives become separate rows in column mode.
    // Once inside one of those rows, deeper sub-variations continue inline so the
    // row wraps naturally at panel boundaries like a long notation string.
    if (!args.isMainline && (args.parenthetical || args.flowInline)) {
        return h('inline', renderTreeLineSequence(ctrl, lines, {
            ...args,
            isMainline: false,
            firstInVariation: true,
            flowInline: true,
        }));
    }

    return h('lines', lines.map((line) =>
        h('line', [
            h('branch'),
            ...renderTreeLineSequence(ctrl, [line], {
                ...args,
                isMainline: false,
                firstInVariation: true,
                flowInline: true,
            }),
        ])
    ));
}

function renderTreeColumnNodes(
    ctrl: TreeCtrl,
    nodes: AnalysisTreeNode[],
    args: TreeColumnArgs,
): VNode[] {
    // Top-level column mode preserves the traditional "move number / white / black"
    // rhythm, but hands side branches off to `interrupt -> lines -> line` blocks.
    const [child, ...siblings] = nodes;
    const out: VNode[] = [];
    if (!child) return out;

    const isWhiteMove = child.step.turnColor === 'black';

    if (isWhiteMove) {
        out.push(h('index', `${Math.ceil(child.ply / 2)}`));
    }

    out.push(renderTreeColumnMove(ctrl, child.path, child, args.isMainline));

    if (siblings.length > 0) {
        if (isWhiteMove) out.push(h('move.empty', '...'));
        out.push(h('interrupt', [renderTreeVariationLines(ctrl, siblings, args)]));
        if (isWhiteMove && child.children.length > 0) {
            out.push(h('index', `${Math.ceil(child.ply / 2)}`));
            out.push(h('move.empty', '...'));
        }
    }

    if (child.children.length > 0) {
        out.push(...renderTreeColumnNodes(ctrl, child.children, nextTreeColumnArgs(child, args, true)));
    }

    return out;
}

function renderTreeColumnMovelist(ctrl: TreeCtrl): VNode[] {
    const root = ctrl.analysisTree!.root;
    const moves: VNode[] = [];

    if (root.step.turnColor === 'black' && root.children[0]) {
        moves.push(h('index', '1'));
        moves.push(h('move.empty', '...'));
    }

    moves.push(...renderTreeColumnNodes(ctrl, root.children, {
        isMainline: true,
        rootTurnColor: root.step.turnColor,
        firstInVariation: false,
        flowInline: false,
    }));

    return moves;
}

export function updateMovelist (ctrl: GameController, full = true, activate = true, needResult = true) {
    const treeCtrl = asTreeCtrl(ctrl);
    if (treeCtrl) {
        const inlineNotation = treeCtrl.isTreeInlineNotation?.() ?? false;
        const moves = inlineNotation ? renderTreeMovelist(treeCtrl) : renderTreeColumnMovelist(treeCtrl);
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
                'tview2-column': !inlineNotation,
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
