import { h, VNode } from 'snabbdom';

import { _ } from './i18n';
import { selectVariant, VARIANTS } from './chess';
import { EditorController } from './editorCtrl';
import { PyChessModel } from "./main";

function runEditor(vnode: VNode, model: PyChessModel) {
    const el = vnode.elm as HTMLElement;
    const ctrl = new EditorController(el, model);
    const cg = ctrl.chessground;
    window['cg'] = cg;
}

export function editorView(model: PyChessModel): VNode[] {

    const setVariant = (isInput: boolean) => {
        let e;
        e = document.getElementById('variant') as HTMLSelectElement;
        const variant = e.options[e.selectedIndex].value;
        if (isInput) window.location.assign('/editor/' + variant);
    }

    const vVariant = model.variant || "chess";
    const variant = VARIANTS[vVariant];

    return [
        h('div.editor-app', [
            h('aside.sidebar-first', [
                h('div.container', [
                    h('div', [
                        h('label', { attrs: { for: "variant" } }, _("Variant")),
                        selectVariant("variant", vVariant, () => setVariant(true), () => setVariant(false)),
                    ]),
                ])
            ]),

            h('div.pocket-wrapper.top', [
                h('div.' + variant.piece + '.' + model["variant"], [
                    h('div.cg-wrap.pocket', [
                        h('div#pieces0'),
                    ]),
                ]),
            ]),
            h('selection#mainboard.' + variant.board + '.' + variant.piece, [
                h('div.cg-wrap.' + variant.cg,
                    { hook: { insert: (vnode) => runEditor(vnode, model)},
                }),
            ]),
            h('div.pocket-wrapper.bot', [
                h('div.' + variant.piece + '.' + model["variant"], [
                    h('div.cg-wrap.pocket', [
                        h('div#pieces1'),
                    ]),
                ]),
            ]),

            h('div.pocket-top', [
                h('div.' + variant.piece + '.' + model["variant"], [
                    h('div.cg-wrap.pocket', [
                        h('div#pocket0'),
                    ]),
                ]),
            ]),
            h('div#editor-button-container'),
            h('div.pocket-bot', [
                h('div.' + variant.piece + '.' + model["variant"], [
                    h('div.cg-wrap.pocket', [
                        h('div#pocket1'),
                    ]),
                ]),
            ]),
            h('under-board', [
                h('input#fen'),
            ]),
        ]),
    ];
}
