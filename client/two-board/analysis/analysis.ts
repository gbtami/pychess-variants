import { h, VNode } from 'snabbdom';

import { _ } from '../../i18n';
import { GameInfoView } from '../common/gameInfo';
import { VARIANTS, selectVariant, validVariant } from '../../variants';

import { renderTimeago } from '../../datetime';
import { BugBoardName, PyChessModel } from '../../types';
import AnalysisControllerBughouse from './analysisCtrl';
import { gauge } from '@/analysis';
import { TabbedPanels, TabPanelDef } from '../common/tabs';
import { trackSquareUnit } from '../squareUnit';
import { boardZoom } from '@/boardSettings';
import { ownBoardName } from '../common/boardRoles';
import { twoBoardSeats } from '../common/seatConfiguration';
import { MovelistView } from '../common/movelist';
import { EngineController } from './engine';
import { PgnView } from './pgn';
import { AnalysisClockView } from './analysisClock';
import { AnalysisSeatView } from './analysisSeatView';
import { MovetimeChartView } from './movetimeChart';

function leftSide(model: PyChessModel, gameInfoView: GameInfoView) {
    if (model['gameId'] !== '') {
        return [gameInfoView.placeholder(), h('div#roundchat')];
    } else {
        const setVariant = (isInput: boolean) => {
            let e;
            e = document.getElementById('variant') as HTMLSelectElement;
            const variant = e.options[e.selectedIndex].value;
            if (isInput) {
                window.location.assign('/analysis/' + validVariant(variant));
            }
        };

        const vVariant = model.variant || 'chess';

        return h('div.container', [
            h('div', [
                h('label', { attrs: { for: 'variant' } }, _('Variant')),
                selectVariant(
                    'variant',
                    vVariant,
                    () => setVariant(true),
                    () => setVariant(false),
                    [],
                    model.gameCategory,
                ),
            ]),
        ]);
    }
}

function createBoards(
    mainboardVNode: VNode,
    bugboardVNode: VNode,
    mainboardPocket0: VNode,
    mainboardPocket1: VNode,
    bugboardPocket0: VNode,
    bugboardPocket1: VNode,
    model: PyChessModel,
    movelistView: MovelistView,
    gameInfoView: GameInfoView,
    engine: EngineController,
    pgnView: PgnView,
    clockView: AnalysisClockView,
    seatView: AnalysisSeatView,
    movetimeChartView: MovetimeChartView,
) {
    /*this.ctrl = */ const ctrl = new AnalysisControllerBughouse(
        mainboardVNode.elm as HTMLElement,
        mainboardPocket0.elm as HTMLElement,
        mainboardPocket1.elm as HTMLElement,
        bugboardVNode.elm as HTMLElement,
        bugboardPocket0.elm as HTMLElement,
        bugboardPocket1.elm as HTMLElement,
        model,
        movelistView,
        gameInfoView,
        engine,
        pgnView,
        clockView,
        seatView,
        movetimeChartView,
    );
    window['onFSFline'] = ctrl.engine.onFSFline;
}

export function analysisView(model: PyChessModel): VNode[] {
    const variant = VARIANTS[model.variant];
    const isAnalysisBoard = model['gameId'] === '';

    /* MUST run before the boards are constructed, for the same reason it must on the round
       page: the grid tracks reference the published unit with no fallback, so chessgroundx
       has to measure a wrap that is already at its final size. Publish it late and the
       boards move under an already-memoized `bounds`, and every click lands on the wrong
       square.

       The zoom is passed in rather than read inside squareUnit.ts, which must not import
       boardSettings — boardSettings calls back into it when a slider moves, and the two
       importing each other is a module-evaluation cycle. */
    trackSquareUnit({
        a: boardZoom(VARIANTS[model.variant].boardFamily, 'a'),
        b: boardZoom(VARIANTS[model.variant].boardFamily, 'b'),
    });

    renderTimeago();

    const onClickFullfen = () => {
        const el = document.getElementById('fullfen') as HTMLInputElement;
        el.focus();
        el.select();
    };

    let mainboardVNode: VNode,
        bugboardVNode: VNode,
        mainboardPocket0: VNode,
        mainboardPocket1: VNode,
        bugboardPocket0: VNode,
        bugboardPocket1: VNode;

    /* Which board is the viewer's own. Decided from seats, so a player of this game gets
       their own board in the main position — left in landscape, bottom in portrait — and
       anyone who did not play gets board A. The round page has no need of it, because its
       switch does the placing.

       Declared HERE, above the views, because the engine needs it too: its PV columns, its two
       scores and its two gauges are all keyed to which board sits where, and the tools panel
       below is built before the stacks are. */
    const ownBoard = ownBoardName(twoBoardSeats(model, model.username));

    const movelistView = new MovelistView();
    const gameInfoView = new GameInfoView();
    const engine = new EngineController(model.chess960 === 'True', ownBoard);
    const pgnView = new PgnView();
    const clockView = new AnalysisClockView();
    const seatView = new AnalysisSeatView();
    const movetimeChartView = new MovetimeChartView(!isAnalysisBoard);

    /* THE TOOLS COLUMN, as a tabbed panel beside the boards.
       Three tabs, and the grouping is the decision worth stating:

       MOVES holds the movelist, the move controls AND the whole engine — its switches,
       its name panel, its principal variation and #misc-info. They are one activity,
       reading the game, and splitting the evaluation from the move it evaluates would
       make a reader choose which half to look at.

       INFO is the game information that used to sit bottom-left.

       CHAT is #roundchat, which is in this page's markup and renders nowhere visible.
       It is given a tab so it becomes observable and can then be judged — not because
       its home is decided. Deleting it would settle its fate without anyone ever having
       seen it. */
    /* ONE TABBED PANEL FOR THE WHOLE PAGE.
       There used to be two: this one beside the boards, and a second under them holding the move
       chart and FEN & PGN. Two switchers meant two places to look for a thing that is not on
       screen, and the lower one cost the page a full-width row of its own — which is what put the
       chart below the fold in every mode. Merged, the page has one place where everything that is
       not a board lives.

       The tabs are declared as data rather than inline, because the page mounts one panel per tab
       and that list has to follow the declarations. It used to mount `panel(0,0)`, `panel(1,0)`,
       `panel(2,0)` by hand, which was already wrong for the blank analysis board: that build
       declares only ONE tab, and `panel(1, 0)` on a one-tab widget is an index error. */
    const toolPanels: TabPanelDef[] = [
            {
                label: _('Moves'),
                parts: [
                    {
                        panelClass: 'analysis-moves-panel',
                        content: [
                            h('div#ceval', [engine.renderPanel()]),
                            engine.pvPanel(),
                            h('div.movelist-block', [movelistView.placeholder()]),
                            h('div#move-controls'),
                            h('div#misc-info', [
                                h('div#misc-infow'),
                                h('div#misc-info-center'),
                                h('div#misc-infob'),
                            ]),
                        ],
                    },
                ],
            },
            /* Only a real game has these. The blank analysis board (`/analysis/<variant>`,
               no gameId) has no game info and no chat — what it has instead is a variant
               selector, which stays in `.bug-game-info` below. Building empty tabs for it
               would give it two tabs that say nothing. */
            ...(isAnalysisBoard
                ? []
                : [
                      { label: _('Info'), parts: [{ content: [gameInfoView.placeholder()] }] },
                      { label: _('Chat'), parts: [{ content: [h('div#roundchat')] }] },
                  ]),
        /* Both of these came from the panel that used to sit under the boards. `chart-container`
           and `fenpgn-panel` keep their classes: the chart's is what analysis.css sizes, and the
           pgn one mirrors that file's `#panel-4` rule for the single-board page. */
        {
            label: _('Move times'),
            parts: [{ panelClass: 'chart-container', content: [movetimeChartView.placeholder()] }],
        },
        {
            label: _('FEN & PGN'),
            parts: [
                {
                    panelClass: 'fenpgn-panel',
                    content: [
                        h('div#fentext', [
                            h('strong', 'BFEN'),
                            h('input#fullfen', {
                                attrs: { readonly: true, spellcheck: false },
                                on: { click: onClickFullfen },
                            }),
                        ]),
                        ...pgnView.placeholders(),
                    ],
                },
            ],
        },
    ];
    const toolsTabs = new TabbedPanels('analysis-tools', toolPanels, _('Analysis tools'));

    /* Built once and placed by `ownBoard` below, rather than written twice inline. Each
       board element keeps its IDENTITY id — #mainboard is board A whoever plays on it —
       while its POSITION is chosen here and its role marked from that position. */
    const mainboardSel = h(
        `selection#mainboard.${variant.boardFamily}.${variant.pieceFamily}.${variant.ui.boardMark}`,
        [
            clockView.topPlaceholder(),
            h('div.cg-wrap.' + variant.board.cg, {
                hook: { insert: vnode => (mainboardVNode = vnode) },
            }),
            clockView.bottomPlaceholder(),
        ],
    );
    const bugboardSel = h(
        `selection#bugboard.${variant.boardFamily}.${variant.pieceFamily}.${variant.ui.boardMark}`,
        [
            clockView.bugTopPlaceholder(),
            h('div.cg-wrap.' + variant.board.cg, {
                hook: { insert: vnode => (bugboardVNode = vnode) },
            }),
            clockView.bugBottomPlaceholder(),
        ],
    );
    const gaugeOwn = gauge(variant.colors);
    const gaugePartnerEl = gauge(variant.colors, 'gaugePartner', 'flipped');

    /* WHICH BOARD IS WHICH, said once per board.
       The stacks are placed by ROLE — the viewer's own board goes left in landscape, bottom in
       portrait — so nothing on the page states a board's IDENTITY, and identity is what the
       engine's PV columns, the pockets, the movelist and the game record are all keyed to. The
       letter goes in the gauge's own column, immediately under it, so it reads as belonging to
       the board the gauge reports on rather than to the seam between the two. */
    const boardLabel = (board: BugBoardName) => h('div.board-label', board.toUpperCase());

    const pocket = (cls: string, id: string, keep: (vnode: VNode) => void) =>
        h('div.' + cls, [
            h('div.' + variant.pieceFamily + '.twoboards', [
                h('div.cg-wrap.pocket', [h('div#' + id, { hook: { insert: keep } })]),
            ]),
        ]);
    const pocketA0 = pocket('pocket-top', 'pocket00', v => (mainboardPocket0 = v));
    const pocketA1 = pocket('pocket-bot', 'pocket01', v => (mainboardPocket1 = v));
    const pocketB0 = pocket('pocket-top-partner', 'pocket10', v => (bugboardPocket0 = v));
    const pocketB1 = pocket('pocket-bot-partner', 'pocket11', v => (bugboardPocket1 = v));

    /* A SEAT STRIP: one seat's pocket beside its player bar, as a single stack row.
       The round page's element, class for class, so the strip skeleton and the whole
       of the name's own sizing machinery apply here without a second copy — see the
       `.seat-strip0, .seat-strip1` block in bughouse.css.

       It carries a POSITION class and a ROLE class and nothing else. Position says
       which end of its board it is (0 = top), which is what decides whether the name
       leaves the row upwards or downwards. Role says whose board it belongs to, and
       comes from the stack it is being built into — never from the board's identity,
       which is board A for a board-B player's own board.

       The player bar arrives empty: `AnalysisSeatView` patches it once the controller
       exists, keyed by physical position, exactly as the clocks are. */
    const partnerBoard: BugBoardName = ownBoard === 'a' ? 'b' : 'a';
    const strip = (position: 0 | 1, role: 'own' | 'partner', board: BugBoardName, pocketVNode: VNode) =>
        h(`div.seat-strip${position}.${role}-seat`, [pocketVNode, seatView.placeholder(board, position)]);

    return [
        h(
            'div.analysis-app.bug',
            {
                hook: {
                    insert: () => {
                        createBoards(
                            mainboardVNode,
                            bugboardVNode,
                            mainboardPocket0,
                            mainboardPocket1,
                            bugboardPocket0,
                            bugboardPocket1,
                            model,
                            movelistView,
                            gameInfoView,
                            engine,
                            pgnView,
                            clockView,
                            seatView,
                            movetimeChartView,
                        );
                    },
                },
            },
            [
                /* The blank analysis board's variant selector. For a real game this element
                   is gone: its two occupants, the game info and the chat, are tabs of the
                   tools panel now. `leftSide()` still answers both cases, so the selector is
                   not duplicated here. */
                ...(isAnalysisBoard ? [h('div.bug-game-info', leftSide(model, gameInfoView))] : []),
                /* TWO STACKS, mirroring the round page. Each is pocket / board / pocket in
                   block flow — the same ten rows the round page's square unit is computed
                   over, which measurement confirmed this page already has: the analysis
                   clocks are absolutely positioned overlays on the board and add no height.

                   The stacks carry the round page's own class names deliberately. That is
                   what lets `isOutsidePartnerStack()` answer here unchanged, and what makes
                   the coordinate machinery keyed to `.bug-own-stack, .bug-partner-stack`
                   apply without a second copy.

                   WHICH board goes in which stack is decided by seats — see
                   `ownBoardName()` — so a player always finds their own board in the main
                   position, and anyone who did not play gets board A there. */
                /* THE GAUGE GOES INSIDE THE STACK, in the board's own row.
                   It was a sibling of the stack at first, which placed it correctly
                   left-to-right but not vertically: the stack is pocket / board / pocket,
                   so a sibling spans all three and the gauge ran the pocket's height taller
                   at each end. Inside the stack it occupies the BOARD's row and stretches
                   to exactly the board's height — by construction, with no arithmetic and
                   nothing to keep in step when a pocket changes size. */
                h('div.bug-own-stack', [
                    strip(0, 'own', ownBoard, ownBoard === 'a' ? pocketA0 : pocketB0),
                    ownBoard === 'a' ? mainboardSel : bugboardSel,
                    strip(1, 'own', ownBoard, ownBoard === 'a' ? pocketA1 : pocketB1),
                    gaugeOwn,
                    boardLabel(ownBoard),
                ]),
                /* THE PARTNER'S BOARD AND THE TOOLS AS ONE GROUP, which is the round page's
                   `.bug-right-column`, reused here for the reason that page introduced it:
                   portrait needs the two as a single block so the tools can sit in the space
                   the small partner board leaves beside it, instead of taking a full-width row
                   of their own between the two boards and pushing the player's board off the
                   screen.

                   The landscape modes dissolve this wrapper with `display: contents`, so the
                   partner stack and the tools go on being independent columns of the app's grid
                   exactly as before. Each mode dissolves the container it does not want — the
                   same trick, and the same wording, as the round page. */
                h('div.bug-right-column', [
                    h('div.bug-partner-stack', [
                        strip(0, 'partner', partnerBoard, ownBoard === 'a' ? pocketB0 : pocketA0),
                        ownBoard === 'a' ? bugboardSel : mainboardSel,
                        strip(1, 'partner', partnerBoard, ownBoard === 'a' ? pocketB1 : pocketA1),
                        gaugePartnerEl,
                        boardLabel(partnerBoard),
                    ]),
                    // Derived from the declarations above, so a tab can be added or made
                    // conditional without a second list to keep in step. Every tab here has
                    // exactly one part.
                    h('div.bug-parts', [...toolPanels.map((_p, t) => toolsTabs.panel(t, 0)), toolsTabs.tabList()]),
                ]),
                h('under-left#spectators'),
            ],
        ),
    ];
}
