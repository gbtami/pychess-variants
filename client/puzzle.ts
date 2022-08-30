import { h, VNode } from "snabbdom";

import { _ } from './i18n';
import { PuzzleController } from './puzzleCtrl';
import { gameInfo } from './gameInfo';
import { selectVariant, VARIANTS } from './chess';
import { PyChessModel } from "./types";

function runPuzzle(vnode: VNode, model: PyChessModel) {
    const el = vnode.elm as HTMLElement;
    new PuzzleController(el, model);
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
            if (isInput) window.location.assign('/puzzle/' + variant);
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

export function puzzleView(model: PyChessModel): VNode[] {
    const variant = VARIANTS[model.variant];
    return [
        h('div.analysis-app', [
            h('aside.sidebar-first', leftSide(model)),
            h(`selection#mainboard.${variant.board}.${variant.piece}.${variant.boardMark}`, [
                h('div.cg-wrap.' + variant.cg, { hook: { insert: (vnode) => runPuzzle(vnode, model) } }),
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
                h('div#misc-info', [
                    h('div#misc-infow'),
                    h('div#misc-info-center'),
                    h('div#misc-infob'),
                ]),
                h('div.feedback', [
                    h('div.player'),
                    h('div.view-solution', [
                        h('a.button.solution'),
                    ]),
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
            h('under-board')
        ]),
    ];
}
