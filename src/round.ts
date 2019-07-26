import { h } from "snabbdom";
import { VNode } from 'snabbdom/vnode';
import RoundController from './ctrl';
import { VARIANTS } from './chess';


function runGround(vnode: VNode, model) {
    const el = vnode.elm as HTMLElement;
    const ctrl = new RoundController(el, model);
    const cg = ctrl.chessground;
    window['cg'] = cg;
}

export function roundView(model): VNode[] {
    var playerTop, playerBottom, dataIcon;
    dataIcon = VARIANTS[model["variant"]].icon;
    if (model["username"] !== model["wplayer"] && model["username"] !== model["bplayer"]) {
        // spectator game view
        playerTop = model["variant"] === 'shogi' ? model["wplayer"] : model["bplayer"];
        playerBottom = model["variant"] === 'shogi' ? model["bplayer"] : model["wplayer"];
    } else {
        playerTop = model["username"] === model["wplayer"] ? model["bplayer"] : model["wplayer"];
        playerBottom = model["username"];
    }
    return [h('aside.sidebar-first', [
                h('div.game-info', [
                    h('div', [
                        h('i-variant', {attrs: {"data-icon": dataIcon}, class: {"icon": true}} ),
                        h('tc', model["base"] + "+" + model["inc"] + " • Casual • " + model["variant"])
                    ]),
                    h('div', [
                        h('i-side', {class: {"icon": true, "icon-white": true} } ),
                        h('player', [
                            h('a.user-link', {attrs: {href: '/@/' + model["wplayer"]}}, model["wplayer"]),
                            h('rating', " (1500?)"),
                        ]),
                    ]),
                    h('div', [
                        h('i-side', {class: {"icon": true, "icon-black": true} } ),
                        h('player', [
                            h('a.user-link', {attrs: {href: '/@/' + model["bplayer"]}}, model["bplayer"]),
                            h('rating', " (1500?)"),
                        ]),
                    ]),
                ]),
                h('div.roundchat#roundchat'),
            ]),
            h('main.main', [
                h(`selection.${VARIANTS[model["variant"]].board}.${VARIANTS[model["variant"]].pieces}`, [
                    h(`div.cg-wrap.${VARIANTS[model["variant"]].cg}`,
                        { hook: { insert: (vnode) => runGround(vnode, model)},
                    }),
                ]),
            ]),
            h('aside.sidebar-second', [
                h('div#pocket-wrapper', [
                    h(`div.${VARIANTS[model["variant"]].pieces}`, [
                        h('div.cg-wrap.pocket', [
                            h('div#pocket0'),
                        ]),
                    ]),
                ]),
                h('div#clock0'),
                h('div.round-data', [
                    h('div.player-data', [
                        h('i-side.online#top-player', {class: {"icon": true, "icon-online": false, "icon-offline": true}}),
                        h('player', [
                            h('a.user-link', {attrs: {href: '/@/' + playerTop}}, playerTop),
                            h('rating', "1500?"),
                        ]),
                    ]),
                    h('div#move-controls'),
                    h('div#movelist'),
                    h('div#after-game'),
                    h('div#game-controls'),
                    h('div.player-data', [
                        h('i-side.online#bottom-player', {class: {"icon": true, "icon-online": false, "icon-offline": true}}),
                        h('player', [
                            h('a.user-link', {attrs: {href: '/@/' + playerBottom}}, playerBottom),
                            h('rating', "1500?"),
                        ]),
                    ]),
                ]),
                h('div#clock1'),
                h('div#pocket-wrapper', [
                    h(`div.${VARIANTS[model["variant"]].pieces}`, [
                        h('div.cg-wrap.pocket', [
                            h('div#pocket1'),
                        ]),
                    ]),
                ]),
                h('div#flip'),
            ]),
            h('under-left', "Spectators"),
            h('under-board', [h('div.#under-board')]),
            h('under-right', [h('div#zoom')]),
        ];
}
