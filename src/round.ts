import { h } from "snabbdom";
import { VNode } from 'snabbdom/vnode';

import RoundController from './roundCtrl';
import { VARIANTS } from './chess';
import { timeago, renderTimeago } from './clock';


function runGround(vnode: VNode, model) {
    const el = vnode.elm as HTMLElement;
    const ctrl = new RoundController(el, model);
    const cg = ctrl.chessground;
    window['cg'] = cg;
}

export function roundView(model): VNode[] {
    console.log("roundView model=", model);
    const dataIcon = VARIANTS[model["variant"]].icon;
    renderTimeago();
    return [h('aside.sidebar-first', [
                h('div.game-info', [
                    h('div.info0', {attrs: {"data-icon": dataIcon}, class: {"icon": true}}, [
                        h('div.info1', {attrs: {"data-icon": (model["chess960"] === 'True') ? "V" : ""}, class: {"icon": true}}),
                        h('div.info2', [
                            h('div.tc', model["base"] + "+" + model["inc"] + " • Casual • " + model["variant"]),
                            Number(model["status"]) >= 0 ? h('info-date', {attrs: {timestamp: model["date"]}}, timeago(model["date"])) : "Playing right now",
                        ]),
                    ]),
                    h('div.player-data', [
                        h('i-side.online', {class: {"icon": true, "icon-white": true} } ),
                        h('player', [
                            h('a.user-link', {attrs: {href: '/@/' + model["wplayer"]}}, [
                                h('player-title', " " + model["wtitle"] + " "),
                                model["wplayer"] + " (1500?)",
                            ]),
                        ]),
                    ]),
                    h('div.player-data', [
                        h('i-side.online', {class: {"icon": true, "icon-black": true} } ),
                        h('player', [
                            h('a.user-link', {attrs: {href: '/@/' + model["bplayer"]}}, [
                                h('player-title', " " + model["btitle"] + " "),
                                model["bplayer"] + " (1500?)",
                            ]),
                        ]),
                    ]),
                ]),
                h('div.roundchat#roundchat'),
            ]),
            h('main.round', [
                h('selection.' + VARIANTS[model["variant"]].board + '.' + VARIANTS[model["variant"]].pieces, [
                    h('div.cg-wrap.' + VARIANTS[model["variant"]].cg,
                        { hook: { insert: (vnode) => runGround(vnode, model)},
                    }),
                ]),
            ]),
            h('aside.sidebar-second', [
                h('div#pocket-wrapper', [
                    h('div.' + VARIANTS[model["variant"]].pieces + '.' + model["variant"], [
                        h('div.cg-wrap.pocket', [
                            h('div#pocket0'),
                        ]),
                    ]),
                ]),
                h('div#clock0'),
                h('div.round-data', [
                    h('round-player#rplayer0'),
                    h('div#move-controls'),
                    h('div#board-settings'),
                    h('div#movelist-block', [
                        h('div#movelist'),
                    ]),
                    h('div#game-controls'),
                    h('round-player#rplayer1'),
                ]),
                h('div#clock1'),
                h('div#pocket-wrapper', [
                    h('div.' + VARIANTS[model["variant"]].pieces + '.' + model["variant"], [
                        h('div.cg-wrap.pocket', [
                            h('div#pocket1'),
                        ]),
                    ]),
                ]),
            ]),
            h('under-left', "Spectators"),
            h('under-board'),
        ];
}
