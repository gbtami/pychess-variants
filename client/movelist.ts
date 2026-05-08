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
    isTreeDisclosureMode?: () => boolean;
    getTreeActivePath?: () => string;
    activateTreePath?: (path: string) => void;
    activateTreeMainlinePly?: (ply: number) => void;
    getTreeSelectedChildPath?: () => string | undefined;
    toggleTreeCollapsed?: (path: string) => void;
    getTreeLineStartPath?: () => string;
    getTreeLineEndPath?: () => string;
    getTreeParentPath?: () => string;
    getTreeMainChildPath?: () => string | undefined;
};

type TreeDiscloseState = undefined | 'expanded' | 'collapsed';
type MoveGlyphClass = 'good' | 'mistake' | 'brilliant' | 'blunder' | 'interesting' | 'inaccuracy';

interface ParsedTreeMove {
    san: string;
    glyph?: {
        text: string;
        cls: MoveGlyphClass;
    };
}

function treeDiscloseState(ctrl: TreeCtrl, node: AnalysisTreeNode): TreeDiscloseState {
    if (!(ctrl.isTreeDisclosureMode?.() ?? false) || node.children.length < 2) return undefined;
    return node.collapsed ? 'collapsed' : 'expanded';
}

function treePathContains(outerPath: string, innerPath: string | undefined): boolean {
    if (innerPath === undefined) return false;
    return innerPath === outerPath || innerPath.startsWith(`${outerPath}.`);
}

function parseTreeMove(move: string | undefined): ParsedTreeMove {
    if (!move || move === '?') return { san: move ?? '' };

    const match = move.match(/^(.*?)(\?\?|\!\!|\!\?|\?\!|\!|\?)$/);
    if (!match) return { san: move };

    const [, san, glyphText] = match;
    const glyphClass: Record<string, MoveGlyphClass> = {
        '!': 'good',
        '?': 'mistake',
        '!!': 'brilliant',
        '??': 'blunder',
        '!?': 'interesting',
        '?!': 'inaccuracy',
    };

    return {
        san,
        glyph: {
            text: glyphText,
            cls: glyphClass[glyphText],
        },
    };
}

function renderTreeMoveText(move: string | undefined): VNode[] {
    const parsed = parseTreeMove(move);
    const nodes: VNode[] = [h('san', parsed.san)];

    if (parsed.glyph) {
        nodes.push(h(`glyph.${parsed.glyph.cls}`, parsed.glyph.text));
    }

    return nodes;
}

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
    parentPath = '',
    parentDisclose?: TreeDiscloseState,
): VNode {
    const move = (ctrl.fog && ctrl.status < 0 && (node.step.turnColor === ctrl.mycolor || ctrl.spectator)) ? '?' : node.step.san;
    const activePath = ctrl.getTreeActivePath?.();
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
    const currentline = treePathContains(path, activePath);
    const recorded = node.mainlinePly !== undefined && !theoretical;
    const disclosureButton =
        parentDisclose
            ? h('button.disclosure', {
                class: { expanded: parentDisclose === 'expanded' },
                on: {
                    click: (event: MouseEvent) => {
                        event.stopPropagation();
                        ctrl.toggleTreeCollapsed?.(parentPath);
                    }
                },
            })
            : undefined;

    return h('move', {
        class: {
            active: path === ctrl.getTreeActivePath?.(),
            currentline,
            selected: path === ctrl.getTreeSelectedChildPath?.(),
            recorded,
            theoretical,
            branchpoint: node.children.length > 1,
            sideline: !isMainline,
            'tree-node': true,
            mainline: isMainline,
        },
        attrs: { 'data-path': path },
        on: { click: () => ctrl.activateTreePath?.(path) },
    }, [
        disclosureButton,
        prefix ? h('index', prefix) : undefined,
        ...renderTreeMoveText(move),
        evalNode,
    ]);
}

function renderTreeBranch(
    ctrl: TreeCtrl,
    node: AnalysisTreeNode,
    branchSiblings: AnalysisTreeNode[],
    firstInVariation: boolean,
    rootTurnColor: string,
    isMainline: boolean,
    parentPath: string,
    parentDisclose: TreeDiscloseState,
): VNode[] {
    // Inline mode is the simplest renderer: walk the preferred continuation and
    // emit each sideline as a parenthesized inline fragment at the branch point.
    const out: VNode[] = [];
    let current: AnalysisTreeNode | undefined = node;
    let isFirst = firstInVariation;
    let currentParentPath = parentPath;
    let currentParentDisclose = parentDisclose;
    let currentBranchSiblings = branchSiblings;

    while (current) {
        const currentNode: AnalysisTreeNode = current;
        out.push(renderTreeMove(
            ctrl,
            currentNode.path,
            currentNode,
            rootTurnColor,
            isFirst,
            isMainline,
            currentParentPath,
            currentParentDisclose,
        ));
        if (currentParentDisclose !== 'collapsed') {
            currentBranchSiblings.forEach((sideline, idx) => {
                out.push(h('inline', renderTreeBranch(
                    ctrl,
                    sideline,
                    currentBranchSiblings.slice(idx + 1),
                    true,
                    rootTurnColor,
                    false,
                    currentParentPath,
                    undefined,
                )));
            });
        }

        currentParentPath = currentNode.path;
        currentParentDisclose = treeDiscloseState(ctrl, currentNode);
        currentBranchSiblings = currentNode.children.slice(1);
        current = currentNode.children[0];
        isFirst = false;
    }

    return out;
}

function renderTreeMovelist(ctrl: TreeCtrl): VNode[] {
    const root = ctrl.analysisTree!.root;
    const rootTurnColor = root.step.turnColor;
    const moves: VNode[] = [];
    const mainline = root.children[0];
    const rootDisclose = treeDiscloseState(ctrl, root);
    if (mainline) moves.push(...renderTreeBranch(ctrl, mainline, root.children.slice(1), false, rootTurnColor, true, '', rootDisclose));
    return moves;
}

interface TreeColumnArgs {
    isMainline: boolean;
    rootTurnColor: string;
    parentNode: AnalysisTreeNode;
    parentPath: string;
    parentDisclose?: TreeDiscloseState;
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
        parentNode: node,
        parentPath: node.path,
        parentDisclose: args.parentDisclose,
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
    parentPath = '',
    parentDisclose?: TreeDiscloseState,
): VNode {
    const move = (ctrl.fog && ctrl.status < 0 && (node.step.turnColor === ctrl.mycolor || ctrl.spectator)) ? '?' : node.step.san;
    const activePath = ctrl.getTreeActivePath?.();
    const scoreStr = node.step.scoreStr ?? '';
    const evalNode = node.mainlinePly !== undefined
        ? h(`eval#ply${node.mainlinePly}`, scoreStr)
        : h('eval', scoreStr);

    const recordedMainlinePly = (ctrl as GameController & { recordedMainlinePly?: number }).recordedMainlinePly;
    const theoretical =
        node.mainlinePly === undefined
        || (node.mainlinePly !== undefined && isTheoreticalMove(node.mainlinePly, ctrl.status, recordedMainlinePly));
    const currentline = treePathContains(path, activePath);
    const recorded = node.mainlinePly !== undefined && !theoretical;
    const disclosureButton =
        parentDisclose
            ? h('button.disclosure', {
                class: { expanded: parentDisclose === 'expanded' },
                on: {
                    click: (event: MouseEvent) => {
                        event.stopPropagation();
                        ctrl.toggleTreeCollapsed?.(parentPath);
                    }
                },
            })
            : undefined;

    return h('move', {
        class: {
            active: path === ctrl.getTreeActivePath?.(),
            currentline,
            selected: path === ctrl.getTreeSelectedChildPath?.(),
            recorded,
            theoretical,
            branchpoint: node.children.length > 1,
            sideline: !isMainline,
            'tree-node': true,
            mainline: isMainline,
        },
        attrs: { 'data-path': path },
        on: { click: () => ctrl.activateTreePath?.(path) },
    }, [
        disclosureButton,
        ...renderTreeMoveText(move),
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

    const currentParentDisclose = args.parentDisclose;
    const moves: VNode[] = [];

    moves.push(
        renderTreeMove(
            ctrl,
            child.path,
            child,
            args.rootTurnColor,
            args.firstInVariation ?? true,
            false,
            args.parentPath,
            currentParentDisclose,
        ),
    );

    if (currentParentDisclose !== 'collapsed' && (args.parenthetical || args.flowInline) && siblings.length > 0) {
        moves.push(renderTreeVariationLines(ctrl, siblings, args));
    }

    if (child.children.length > 0) {
        const childArgs = {
            ...nextTreeColumnArgs(child, args, false),
            parentDisclose: treeDiscloseState(ctrl, child),
        };
        if (args.flowInline || child.children.length < 2 || childArgs.parenthetical) {
            moves.push(...renderTreeLineSequence(ctrl, child.children, childArgs));
        } else {
            moves.push(renderTreeVariationLines(ctrl, child.children, childArgs));
        }
    }

    if (currentParentDisclose !== 'collapsed' && !args.parenthetical && !args.flowInline && siblings.length > 0) {
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
            parentDisclose: undefined,
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
                parentDisclose: undefined,
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
    const currentParentDisclose = args.parentDisclose;

    if (isWhiteMove) {
        out.push(h('index', `${Math.ceil(child.ply / 2)}`));
    }

    out.push(renderTreeColumnMove(ctrl, child.path, child, args.isMainline, args.parentPath, currentParentDisclose));

    if (currentParentDisclose !== 'collapsed' && siblings.length > 0) {
        if (isWhiteMove) out.push(h('move.empty', '...'));
        out.push(h('interrupt', [renderTreeVariationLines(ctrl, siblings, args)]));
        if (isWhiteMove && child.children.length > 0) {
            out.push(h('index', `${Math.ceil(child.ply / 2)}`));
            out.push(h('move.empty', '...'));
        }
    }

    if (child.children.length > 0) {
        out.push(...renderTreeColumnNodes(ctrl, child.children, {
            ...nextTreeColumnArgs(child, args, true),
            parentDisclose: treeDiscloseState(ctrl, child),
        }));
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
        parentNode: root,
        parentPath: '',
        parentDisclose: treeDiscloseState(ctrl, root),
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
