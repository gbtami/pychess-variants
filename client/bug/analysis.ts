import {h, VNode} from "snabbdom";

import {_} from '../i18n';
import {gameInfo} from '../gameInfo';
import {selectVariant, VARIANTS} from '../chess';
import {renderTimeago} from '../datetime';
import {spinner} from '../spinner';
import {PyChessModel} from "../main";
import AnalysisController from "./analysisCtrl";

// function runGround(vnode: VNode, model: PyChessModel) {
//     const el = vnode.elm as HTMLElement;
//     const ctrl = new AnalysisController(el, model);
//     window['onFSFline'] = ctrl.onFSFline;
// }




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
            if (isInput) {
                window.location.assign('/analysis/' + variant);
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

// export function embedView(model: PyChessModel): VNode[] {
//     const variant = VARIANTS[model.variant];
//     const chess960 = model.chess960 === 'True';
//
//     return [
//         h('div.embed-app', [
//             h(`selection#mainboard.${variant.board}.${variant.piece}.${variant.boardMark}`, [
//                 h('div.cg-wrap.' + variant.cg, { hook: { insert: (vnode) => runGround(vnode, model) } }),
//             ]),
//
//             h('div.pocket-top', [
//                 h('div.' + variant.piece + '.' + model["variant"], [
//                     h('div.cg-wrap.pocket', [
//                         h('div#pocket0'),
//                     ]),
//                 ]),
//             ]),
//
//             h('div.analysis-tools', [
//                 h('div.movelist-block', [
//                     h('div#movelist'),
//                 ]),
//                 h('div#misc-info', [
//                     h('div#misc-infow'),
//                     h('div#misc-info-center'),
//                     h('div#misc-infob'),
//                 ]),
//             ]),
//
//             h('div#move-controls'),
//
//             h('div.pocket-bot', [
//                 h('div.' + variant.piece + '.' + model["variant"], [
//                     h('div.cg-wrap.pocket', [
//                         h('div#pocket1'),
//                     ]),
//                 ]),
//             ]),
//         ]),
//         h('div.footer', [
//             h('a.gamelink', { attrs: { rel: "noopener", target: "_blank", href: '/' + model["gameId"] } },
//                 [variant.displayName(chess960), '•', model.wtitle, model.wplayer, 'vs', model.btitle, model.bplayer].join(' ')
//             ),
//         ]),
//     ];
// }

function createBoards(mainboardVNode: VNode, bugboardVNode: VNode, mainboardPocket0: VNode, mainboardPocket1: VNode, bugboardPocket0: VNode, bugboardPocket1: VNode, model: PyChessModel) {
    /*this.ctrl = */const ctrl = new AnalysisController(mainboardVNode.elm as HTMLElement,
        mainboardPocket0.elm as HTMLElement,
        mainboardPocket1.elm as HTMLElement,
        bugboardVNode.elm as HTMLElement,
        bugboardPocket0.elm as HTMLElement, bugboardPocket1.elm as HTMLElement,
        model);
    window['onFSFline'] = ctrl.onFSFline;
}

export function analysisView(model: PyChessModel): VNode[] {

    window['onFSFline'] = (line: string) => {console.log(line)};//todo:niki: temporary here so it doesnt crash

    const variant = VARIANTS[model.variant];

    renderTimeago();

    let mainboardVNode: VNode, bugboardVNode: VNode, mainboardPocket0: VNode, mainboardPocket1: VNode, bugboardPocket0: VNode, bugboardPocket1: VNode;

    return [
        h('div.analysis-app.bug', { hook: {insert: ()=>{createBoards(mainboardVNode, bugboardVNode, mainboardPocket0, mainboardPocket1, bugboardPocket0, bugboardPocket1, model)}}}, [
            h('aside.sidebar-first', leftSide(model)),
            h(`selection#mainboard.${variant.board}.${variant.piece}.${variant.boardMark}`, [
                h('div.cg-wrap.' + variant.cg, { hook: { insert: (vnode) => mainboardVNode = vnode/*runGround(vnode, model)*/ } }),
            ]),
            h(`selection#bugboard.${variant.board}.${variant.piece}.${variant.boardMark}`, [
                h('div.cg-wrap.' + variant.cg, { hook: { insert: (vnode) => bugboardVNode = vnode/*runGround(vnode, model)*/ } }),
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
                        h('div#pocket0', { hook: { insert: (vnode)=>{mainboardPocket0=vnode}}}),
                    ]),
                ]),
            ]),
            h('div.pocket-top-partner', [
                h('div.' + variant.piece + '.' + model["variant"], [
                    h('div.cg-wrap.pocket', [
                        h('div#pocket0', { hook: { insert: (vnode)=>{bugboardPocket0=vnode}}}),
                    ]),
                ]),
            ]),
            h('div.analysis-tools', [
                h('div#ceval', [
                    h('div.engine', [
                        h('score#score', ''),
                        h('div.info', ['Fairy-Stockfish 11+', h('br'), h('info#info', _('in local browser'))]),
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
                        h('div#pocket1', { hook: { insert: (vnode)=>{mainboardPocket1=vnode}}}),
                    ]),
                ]),
            ]),
            h('div.pocket-bot-partner', [
                h('div.' + variant.piece + '.' + model["variant"], [
                    h('div.cg-wrap.pocket', [
                        h('div#pocket1', { hook: { insert: (vnode)=>{bugboardPocket1=vnode}}}),
                    ]),
                ]),
            ]),
            h('under-left#spectators'),
            h('under-board', [
                h('div#pgn', [
                    h('div#ctable-container'),
                    h('div.chart-container', [
                        h('div#chart'),
                        h('div#loader-wrapper', [spinner()])
                    ]),
                    h('div#fentext', [
                        h('strong', 'FEN'),
                        h('input#fullfen', {attrs: {readonly: true, spellcheck: false}})
                    ]),
                    h('div#copyfen'),
                    h('div', [h('textarea#pgntext')]),
                ]),
            ]),
        ]),
    ];
}
