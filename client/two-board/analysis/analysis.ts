import { h, VNode } from 'snabbdom';

import { _ } from '../../i18n';
import { GameInfoView } from '../common/gameInfo';
import { VARIANTS, selectVariant, validVariant } from '../../variants';

import { renderTimeago } from '../../datetime';
import { PyChessModel } from '../../types';
import AnalysisControllerBughouse from './analysisCtrl';
import { gauge } from '@/analysis';
import { TabbedPanels } from '../common/tabs';
import { MovelistView } from '../common/movelist';
import { EngineController } from './engine';
import { PgnView } from './pgn';
import { AnalysisClockView } from './analysisClock';
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
        movetimeChartView,
    );
    window['onFSFline'] = ctrl.engine.onFSFline;
}

export function analysisView(model: PyChessModel): VNode[] {
    const variant = VARIANTS[model.variant];
    const isAnalysisBoard = model['gameId'] === '';

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

    const movelistView = new MovelistView();
    const gameInfoView = new GameInfoView();
    const engine = new EngineController(model.chess960 === 'True');
    const pgnView = new PgnView();
    const clockView = new AnalysisClockView();
    const movetimeChartView = new MovetimeChartView(!isAnalysisBoard);
    const analysisTabs = new TabbedPanels(
        'analysis-tabs',
        [
            // one part each: panelClass now belongs to the part, since it is the
            // part that becomes an element and the part that gets placed
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
        ],
        'Analysis Tabs',
    );

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
                            movetimeChartView,
                        );
                    },
                },
            },
            [
                h('div.bug-game-info', leftSide(model, gameInfoView)),
                h(`selection#mainboard.${variant.boardFamily}.${variant.pieceFamily}.${variant.ui.boardMark}`, [
                    clockView.topPlaceholder(),
                    h('div.cg-wrap.' + variant.board.cg, {
                        hook: { insert: vnode => (mainboardVNode = vnode) /*runGround(vnode, model)*/ },
                    }),
                    clockView.bottomPlaceholder(),
                ]),
                h(`selection#bugboard.${variant.boardFamily}.${variant.pieceFamily}.${variant.ui.boardMark}`, [
                    clockView.bugTopPlaceholder(),
                    h('div.cg-wrap.' + variant.board.cg, {
                        hook: { insert: vnode => (bugboardVNode = vnode) /*runGround(vnode, model)*/ },
                    }),
                    clockView.bugBottomPlaceholder(),
                ]),
                gauge(variant.colors),
                gauge(variant.colors, 'gaugePartner', 'flipped'),
                h('div.pocket-top', [
                    h('div.' + variant.pieceFamily + '.twoboards', [
                        h('div.cg-wrap.pocket', [
                            h('div#pocket00', {
                                hook: {
                                    insert: vnode => {
                                        mainboardPocket0 = vnode;
                                    },
                                },
                            }),
                        ]),
                    ]),
                ]),
                h('div.pocket-top-partner', [
                    h('div.' + variant.pieceFamily + '.twoboards', [
                        h('div.cg-wrap.pocket', [
                            h('div#pocket10', {
                                hook: {
                                    insert: vnode => {
                                        bugboardPocket0 = vnode;
                                    },
                                },
                            }),
                        ]),
                    ]),
                ]),
                h('div.analysis-tools', [
                    h('div#ceval', [engine.renderPanel()]),
                    engine.pvPanel(),
                    h('div.movelist-block', [movelistView.placeholder()]),
                    h('div#misc-info', [h('div#misc-infow'), h('div#misc-info-center'), h('div#misc-infob')]),
                ]),
                h('div#move-controls'),

                h('div.pocket-bot', [
                    h('div.' + variant.pieceFamily + '.twoboards', [
                        h('div.cg-wrap.pocket', [
                            h('div#pocket01', {
                                hook: {
                                    insert: vnode => {
                                        mainboardPocket1 = vnode;
                                    },
                                },
                            }),
                        ]),
                    ]),
                ]),
                h('div.pocket-bot-partner', [
                    h('div.' + variant.pieceFamily + '.twoboards', [
                        h('div.cg-wrap.pocket', [
                            h('div#pocket11', {
                                hook: {
                                    insert: vnode => {
                                        bugboardPocket1 = vnode;
                                    },
                                },
                            }),
                        ]),
                    ]),
                ]),
                h('under-left#spectators'),
                // under-board is the page's own element now; the widget contributes
                // only the two parts inside it. The plain analysis board has nothing
                // to switch to, so it simply does not mount the tablist.
                h(
                    'under-board',
                    isAnalysisBoard
                        ? [analysisTabs.panel(0, 0), analysisTabs.panel(1, 0)]
                        : [analysisTabs.panel(0, 0), analysisTabs.panel(1, 0), analysisTabs.tabList()],
                ),
            ],
        ),
    ];
}
