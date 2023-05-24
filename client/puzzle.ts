import { h, VNode } from "snabbdom";

import { _ } from './i18n';
import { PuzzleController } from './puzzleCtrl';
import { selectVariant, VARIANTS, noPuzzleVariants } from './variants';
import { PyChessModel } from './types';
import { analysisTools, gauge } from './analysis'
import { analysisSettings } from './analysisSettings';

function runPuzzle(vnode: VNode, model: PyChessModel) {
    const el = vnode.elm as HTMLElement;
    const ctrl = new PuzzleController(el, model);
    window['onFSFline'] = ctrl.onFSFline;
}

function leftSide(model: PyChessModel) {
    const setVariant = (isInput: boolean) => {
        let e;
        e = document.getElementById('variant') as HTMLSelectElement;
        const variant = e.options[e.selectedIndex].value;
        if (isInput) window.location.assign('/puzzle/' + variant);
    }
    return h('div', [
        h('div.puzzle-meta', [
            h('div.infos'),
        ]),
        h('div.puzzle-user', [
            h('div.rated-toggle'),
            h('div.rating'),
        ]),
        h('div.puzzle-info', [
            h('label', { attrs: { for: "variant" } }, _("Variant")),
            selectVariant("variant", model.variant, () => setVariant(true), () => setVariant(false), noPuzzleVariants),
            h('div.auto-next-toggle'),
        ]),
    ]);
}

export function puzzleView(model: PyChessModel): VNode[] {
    const variant = VARIANTS[model.variant];
    return [
        h('div.analysis-app', [
            h('aside.sidebar-first', leftSide(model)),
            h(`selection#mainboard.${variant.boardFamily}.${variant.pieceFamily}.${variant.ui.boardMark}`, [
                h('div.cg-wrap.' + variant.board.cg, { hook: { insert: (vnode) => runPuzzle(vnode, model) } }),
            ]),
            gauge(),
            h('div.pocket-top', [
                h('div.' + variant.pieceFamily + '.' + model["variant"], [
                    h('div.cg-wrap.pocket', [
                        h('div#pocket0'),
                    ]),
                ]),
            ]),
            analysisTools(),
            analysisSettings.view(variant.name),
            h('div#move-controls'),
            h('div.pocket-bot', [
                h('div.' + variant.pieceFamily + '.' + model["variant"], [
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
