import { h } from "snabbdom";
import { VNode } from 'snabbdom/vnode';

import AnalysisController from './analysisCtrl';
import { VARIANTS } from './chess';
import { timeago, renderTimeago } from './clock';


function runGround(vnode: VNode, model) {
    const el = vnode.elm as HTMLElement;
    const ctrl = new AnalysisController(el, model);
    const cg = ctrl.chessground;
    window['cg'] = cg;
}

export function analysisView(model): VNode[] {
    console.log("analysisView model=", model);
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
            h('main.analysis', [
                h('selection.' + VARIANTS[model["variant"]].board + '.' + VARIANTS[model["variant"]].pieces, [
                    h('div.cg-wrap.' + VARIANTS[model["variant"]].cg,
                        { hook: { insert: (vnode) => runGround(vnode, model)},
                    }),
                ]),
                h('div', {attrs: {id: "gauge"}}, [
                    h('div.black', {props: {style: "height: 50%;"}}),
                    h('div.tick', {props: {style: "height: 12.5%;"}}),
                    h('div.tick', {props: {style: "height: 25%;"}}),
                    h('div.tick', {props: {style: "height: 37.5%;"}}),
                    h('div.tick zero', {props: {style: "height: 50%;"}}),
                    h('div.tick', {props: {style: "height: 62.5%;"}}),
                    h('div.tick', {props: {style: "height: 75%;"}}),
                    h('div.tick', {props: {style: "height: 87.5%;"}}),
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
                h('div.round-data', [
                    h('div#move-controls'),
                    h('div#board-settings'),
                    h('div#movelist-block', [
                        h('div#movelist'),
                        h('div#result'),
                    ]),
                ]),
                h('div#pocket-wrapper', [
                    h('div.' + VARIANTS[model["variant"]].pieces + '.' + model["variant"], [
                        h('div.cg-wrap.pocket', [
                            h('div#pocket1'),
                        ]),
                    ]),
                ]),
            ]),
            h('under-left'),
            h('under-board', [
                h('div.#pgn')
            ])
        ];
}
