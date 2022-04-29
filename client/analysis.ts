import { h, VNode } from "snabbdom";

import { _ } from './i18n';
import AnalysisController from './analysisCtrl';
import { gameInfo } from './gameInfo';
import { selectVariant, VARIANTS } from './chess';
import { renderTimeago } from './datetime';
import { spinner } from './spinner';
import { PyChessModel } from "./main";

function runGround(vnode: VNode, model: PyChessModel) {
    const el = vnode.elm as HTMLElement;
    const ctrl = new AnalysisController(el, model);
    window['onFSFline'] = ctrl.onFSFline;
}

function leftSide(model: PyChessModel) {

    if (model["gameId"] !== "") {
        return [
            gameInfo(model),
            h('div#roundchat'),
        ];

    } else {

        const setVariant = (isInput: boolean) => {
            let e;
            e = document.getElementById('variant') as HTMLSelectElement;
            const variant = e.options[e.selectedIndex].value;
            if (isInput) window.location.assign('/analysis/' + variant);
        }

        const vVariant = model.variant || "chess";

        return h('div.container', [
            h('div', [
                h('label', { attrs: { for: "variant" } }, _("Variant")),
                selectVariant("variant", vVariant, () => setVariant(true), () => setVariant(false)),
            ]),
        ]);
    }
}

export function embedView(model: PyChessModel): VNode[] {
    const variant = VARIANTS[model.variant];
    const chess960 = model.chess960 === 'True';

    return [
        h('div.embed-app', [
            h(`selection#mainboard.${variant.board}.${variant.piece}.${variant.boardMark}`, [
                h('div.cg-wrap.' + variant.cg, { hook: { insert: (vnode) => runGround(vnode, model) } }),
            ]),

            h('div.pocket-top', [
                h('div.' + variant.piece + '.' + model["variant"], [
                    h('div.cg-wrap.pocket', [
                        h('div#pocket0'),
                    ]),
                ]),
            ]),

            h('div.analysis-tools', [
                h('div.movelist-block', [
                    h('div#movelist'),
                ]),
                h('div#misc-info', [
                    h('div#misc-infow'),
                    h('div#misc-info-center'),
                    h('div#misc-infob'),
                ]),
            ]),

            h('div#move-controls'),

            h('div.pocket-bot', [
                h('div.' + variant.piece + '.' + model["variant"], [
                    h('div.cg-wrap.pocket', [
                        h('div#pocket1'),
                    ]),
                ]),
            ]),
        ]),
        h('div.footer', [
            h('a.gamelink', { attrs: { rel: "noopener", target: "_blank", href: '/' + model["gameId"] } },
                [variant.displayName(chess960), '•', model.wtitle, model.wplayer, 'vs', model.btitle, model.bplayer].join(' ')
            ),
        ]),
    ];
}

export function analysisView(model: PyChessModel): VNode[] {
    const variant = VARIANTS[model.variant];
    const isAnalysisBoard = model["gameId"] === "";
    const tabindexCt = (isAnalysisBoard) ? '-1' : '0';
    const tabindexPgn = (isAnalysisBoard) ? '0' : '-1';

    renderTimeago();

    const onClickFullfen = () => {
        const el = document.getElementById('fullfen') as HTMLInputElement;
        el.focus();
        el.select();
    }

    return [
        h('div.analysis-app', [
            h('aside.sidebar-first', leftSide(model)),
            h(`selection#mainboard.${variant.board}.${variant.piece}.${variant.boardMark}`, [
                h('div#anal-clock-top'),
                h('div.cg-wrap.' + variant.cg, { hook: { insert: (vnode) => runGround(vnode, model) } }),
                h('div#anal-clock-bottom'),
            ]),
            h('div#gauge', [
                h('div.black',     { props: { style: "height: 50%;" } }),
                h('div.tick',      { props: { style: "height: 12.5%;" } }),
                h('div.tick',      { props: { style: "height: 25%;" } }),
                h('div.tick',      { props: { style: "height: 37.5%;" } }),
                h('div.tick.zero', { props: { style: "height: 50%;" } }),
                h('div.tick',      { props: { style: "height: 62.5%;" } }),
                h('div.tick',      { props: { style: "height: 75%;" } }),
                h('div.tick',      { props: { style: "height: 87.5%;" } }),
            ]),

            h('div.pocket-top', [
                h('div.' + variant.piece + '.' + model["variant"], [
                    h('div.cg-wrap.pocket', [
                        h('div#pocket0'),
                    ]),
                ]),
            ]),
            h('div.analysis-tools', [
                h('div#ceval', [
                    h('div.engine', [
                        h('score#score', ''),
                        h('div.info', ['Fairy-Stockfish 14+', h('br'), h('info#info', _('in local browser'))]),
                        h('label.switch', [
                            h('input#input', {
                                props: {
                                    name: "engine",
                                    type: "checkbox",
                                },
                            }),
                            h('span#slider.sw-slider'),
                        ]),
                    ]),
                ]),
                h('div#pv'),
                h('div.movelist-block', [
                    h('div#movelist'),
                ]),
                h('div#vari'),
                h('div#misc-info', [
                    h('div#misc-infow'),
                    h('div#misc-info-center'),
                    h('div#misc-infob'),
                ]),
            ]),
            h('div#move-controls'),

            h('div.pocket-bot', [
                h('div.' + variant.piece + '.' + model["variant"], [
                    h('div.cg-wrap.pocket', [
                        h('div#pocket1'),
                    ]),
                ]),
            ]),
            h('under-left#spectators'),
            h('under-board', [
                h('div.chart-container', {attrs: {id: 'panel-1', role: 'tabpanel', tabindex: '-1', 'aria-labelledby': 'tab-1'}}, [
                    h('button#request-analysis'),
                    h('div#chart-analysis'),
                    h('div#loader-wrapper', [spinner()])
                ]),
                h('div.chart-container', {attrs: {id: 'panel-2', role: 'tabpanel', tabindex: '-1', 'aria-labelledby': 'tab-2'}}, [
                    h('div#chart-movetime'),
                ]),
                h('div.ctable-container', {attrs: {id: 'panel-3', role: 'tabpanel', tabindex: tabindexCt, 'aria-labelledby': 'tab-3'}}),
                h('div', {attrs: {id: 'panel-4', role: 'tabpanel', tabindex: tabindexPgn, 'aria-labelledby': 'tab-4'}}, [
                    h('div#fentext', [
                        h('strong', 'FEN'),
                        h('input#fullfen', {attrs: {readonly: true, spellcheck: false}, on: { click: onClickFullfen } })
                    ]),
                    h('div#copyfen'),
                    h('div#pgntext'),
                ]),
                h('div', {attrs: {role: 'tablist', 'aria-label': 'Analysis Tabs'}}, [
                    h('span', {attrs: {role: 'tab', 'aria-selected': false, 'aria-controls': 'panel-1', id: 'tab-1', tabindex: '-1'}}, _('Computer analysis')),
                    h('span', {attrs: {role: 'tab', 'aria-selected': true, 'aria-controls': 'panel-2', id: 'tab-1', tabindex: '-1'}}, _('Move times')),
                    h('span', {attrs: {role: 'tab', 'aria-selected': false, 'aria-controls': 'panel-3', id: 'tab-3', tabindex: tabindexCt}}, _('Crosstable')),
                    h('span', {attrs: {role: 'tab', 'aria-selected': false, 'aria-controls': 'panel-4', id: 'tab-4', tabindex: tabindexPgn}}, _('FEN & PGN')),
                ]),
            ]),
        ]),
    ];
}
