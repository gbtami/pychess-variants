import { h } from "snabbdom";
import { VNode } from 'snabbdom/vnode';
import RoundController from './ctrl';
import { VARIANTS } from './chess';

export const BACK = Symbol('Back');
// export const RESIGN = Symbol('Resign');

function runGround(vnode: VNode, model) {
    const el = vnode.elm as HTMLElement;
    const ctrl = new RoundController(el, model);
    const cg = ctrl.chessground;
    window['cg'] = cg;
}

export function roundView(model, handler): VNode {
    console.log(".......roundView(model, handler)", model, handler);
    var playerTop, playerBottom;
    if (model["username"] !== model["wplayer"] && model["username"] !== model["bplayer"]) {
        // spectator game view
        playerTop = model["variant"] === 'shogi' ? model["wplayer"] : model["bplayer"];
        playerBottom = model["variant"] === 'shogi' ? model["bplayer"] : model["wplayer"];
    } else {
        playerTop = model["username"] === model["wplayer"] ? model["bplayer"] : model["wplayer"];
        playerBottom = model["username"];
    }
    return h('div.columns', [
            h('aside.sidebar-first', [ h('div.roundchat#roundchat') ]),
            h('main.main', [
                h(`selection.${VARIANTS[model["variant"]].board}.${VARIANTS[model["variant"]].pieces}`, [
                    h(`div.cg-board-wrap.${VARIANTS[model["variant"]].cg}`,
                        { hook: { insert: (vnode) => runGround(vnode, model)},
                    }),
                ]),
            ]),
            h('aside.sidebar-second', [
                h('div#pocket-wrapper', [
                    h(`div.${VARIANTS[model["variant"]].pieces}`, [
                        h('div.cg-board-wrap.pocket', [
                            h('div#pocket0'),
                        ]),
                    ]),
                ]),
                h('div#clock0'),
                h('h1', playerTop + " (1500?)"),
                h('div#result'),
                h('div#after-game'),
                h('div#game-controls'),
                h('h1', playerBottom + " (1500?)"),
                h('div#clock1'),
                h('div#pocket-wrapper', [
                    h(`div.${VARIANTS[model["variant"]].pieces}`, [
                        h('div.cg-board-wrap.pocket', [
                            h('div#pocket1'),
                        ]),
                    ]),
                ]),
                h('div#flip'),
                h('div#zoom'),
            ]),
        ]);
}
