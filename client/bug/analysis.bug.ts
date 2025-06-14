import { h, VNode } from "snabbdom";

import { _ } from '../i18n';
import { gameInfoBug } from './gameInfo.bug';
import { VARIANTS, selectVariant, validVariant } from "../variants"

import { renderTimeago } from '../datetime';
import { PyChessModel } from "../types";
import AnalysisControllerBughouse from "./analysisCtrl.bug";
import { gauge } from "@/analysis";

function leftSide(model: PyChessModel) {

    if (model["gameId"] !== "") {
        return [
            gameInfoBug(model),
            h('div#roundchat'),
        ];

    } else {

        const setVariant = (isInput: boolean) => {
            let e;
            e = document.getElementById('variant') as HTMLSelectElement;
            const variant = e.options[e.selectedIndex].value;
            if (isInput) {
                window.location.assign('/analysis/' + validVariant(variant));
            }
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

function createBoards(mainboardVNode: VNode, bugboardVNode: VNode, mainboardPocket0: VNode, mainboardPocket1: VNode, bugboardPocket0: VNode, bugboardPocket1: VNode, model: PyChessModel) {
    /*this.ctrl = */ const ctrl = new AnalysisControllerBughouse(mainboardVNode.elm as HTMLElement,
        mainboardPocket0.elm as HTMLElement,
        mainboardPocket1.elm as HTMLElement,
        bugboardVNode.elm as HTMLElement,
        bugboardPocket0.elm as HTMLElement, bugboardPocket1.elm as HTMLElement,
        model);
    window['onFSFline'] = ctrl.onFSFline;
}

export function analysisView(model: PyChessModel): VNode[] {

    const variant = VARIANTS[model.variant];

    renderTimeago();

    const onClickFullfen = () => {
        const el = document.getElementById('fullfen') as HTMLInputElement;
        el.focus();
        el.select();
    }

    let mainboardVNode: VNode, bugboardVNode: VNode, mainboardPocket0: VNode, mainboardPocket1: VNode, bugboardPocket0: VNode, bugboardPocket1: VNode;

    return [
        h('div.analysis-app.bug', { hook: {insert: ()=>{createBoards(mainboardVNode, bugboardVNode, mainboardPocket0, mainboardPocket1, bugboardPocket0, bugboardPocket1, model)}}}, [
            h('div.bug-game-info', leftSide(model)),
            h(`selection#mainboard.${variant.boardFamily}.${variant.pieceFamily}.${variant.ui.boardMark}`, [
                h('div#anal-clock-top'),
                h('div.cg-wrap.' + variant.board.cg, { hook: { insert: (vnode) => mainboardVNode = vnode/*runGround(vnode, model)*/ } }),
                h('div#anal-clock-bottom'),
            ]),
            h(`selection#bugboard.${variant.boardFamily}.${variant.pieceFamily}.${variant.ui.boardMark}`, [
                h('div#anal-clock-top-bug'),
                h('div.cg-wrap.' + variant.board.cg, { hook: { insert: (vnode) => bugboardVNode = vnode/*runGround(vnode, model)*/ } }),
                h('div#anal-clock-bottom-bug'),
            ]),
            gauge(),
            gauge("gaugePartner"),
            h('div.pocket-top', [
                h('div.' + variant.pieceFamily + '.twoboards', [
                    h('div.cg-wrap.pocket', [
                        h('div#pocket00', { hook: { insert: (vnode)=>{mainboardPocket0=vnode}}}),
                    ]),
                ]),
            ]),
            h('div.pocket-top-partner', [
                h('div.' + variant.pieceFamily + '.twoboards', [
                    h('div.cg-wrap.pocket', [
                        h('div#pocket10', { hook: { insert: (vnode)=>{bugboardPocket0=vnode}}}),
                    ]),
                ]),
            ]),
            h('div.analysis-tools', [
                h('div#ceval', [
                    h('div.engine', [
                        h('label.switch', [
                            h('input#input', {
                                props: {
                                    name: "engine",
                                    type: "checkbox",
                                },
                            }),
                            h('span#slider.sw-slider'),
                        ]),
                        h('score#score', ''),
                        h('div.infoBug', ['Fairy-Stockfish 11+', h('br'), h('info#info', _('in local browser'))]),
                        h('score#scorePartner', ''),
                        h('label.switch', [
                            h('input#inputPartner', {
                                props: {
                                    name: "engine",
                                    type: "checkbox",
                                },
                            }),
                            h('span#sliderPartner.sw-slider'),
                        ]),
                    ]),
                ]),
                h('div.pvbox', [
                    h('div#pv1'),
                    h('div#pv2'),
                    h('div#pv3'),
                    h('div#pv4'),
                    h('div#pv5'),
                ]),
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
                h('div.' + variant.pieceFamily + '.twoboards', [
                    h('div.cg-wrap.pocket', [
                        h('div#pocket01', { hook: { insert: (vnode)=>{mainboardPocket1=vnode}}}),
                    ]),
                ]),
            ]),
            h('div.pocket-bot-partner', [
                h('div.' + variant.pieceFamily + '.twoboards', [
                    h('div.cg-wrap.pocket', [
                        h('div#pocket11', { hook: { insert: (vnode)=>{bugboardPocket1=vnode}}}),
                    ]),
                ]),
            ]),
            h('under-left#spectators'),
            h('under-board', [
                h('div.chart-container', {attrs: {id: 'panel-2', role: 'tabpanel', tabindex: '0', 'aria-labelledby': 'tab-1'}}, [
                    h('div#chart-movetime'),
                ]),
                h('div', {attrs: {id: 'panel-4', role: 'tabpanel', tabindex: '1', 'aria-labelledby': 'tab-4'}}, [
                    h('div#fentext', [
                        h('strong', 'BFEN'),
                        h('input#fullfen', {attrs: {readonly: true, spellcheck: false}, on: { click: onClickFullfen } })
                    ]),
                    h('div#copyfen'),
                    h('div#pgntext'),
                ]),
                h('div', {attrs: {role: 'tablist', 'aria-label': 'Analysis Tabs'}}, [
                    h('span', {attrs: {role: 'tab', 'aria-selected': 'true', 'aria-controls': 'panel-2', id: 'tab-1', tabindex: '0'}}, _('Move times')),
                    h('span', {attrs: {role: 'tab', 'aria-selected': 'false', 'aria-controls': 'panel-4', id: 'tab-4', tabindex: '1'}}, _('FEN & PGN')),
                ]),
            ]),
        ]),
    ];
}
