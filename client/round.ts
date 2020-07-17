import { h } from "snabbdom";
import { VNode } from 'snabbdom/vnode';

import { _ } from './i18n';
import RoundController from './roundCtrl';
import { VARIANTS, variantIcon, variantName, variantTooltip, firstColor, secondColor } from './chess';
import { timeago, renderTimeago } from './datetime';


function runGround(vnode: VNode, model) {
    const el = vnode.elm as HTMLElement;
    const ctrl = new RoundController(el, model);
    const cg = ctrl.chessground;
    window['cg'] = cg;
}

export function roundView(model): VNode[] {
    console.log("roundView model=", model);
    const dataIcon = variantIcon(model["variant"], model["chess960"]);
    renderTimeago();
    const fc = firstColor(model["variant"]);
    const sc = secondColor(model["variant"]);

    return [h('aside.sidebar-first', [
                h('div.game-info', [
                    h('div.info0.icon', { attrs: {"data-icon": dataIcon} }, [
                        h('div.info2', [
                            h('div.tc', [
                                model["base"] + "+" + (model["byo"] > 1 ? model["byo"] + "x" : "") + model["inc"] + (model["byo"] > 0 ? "(b)" : "") + " • " + ((model["rated"] === 'True') ? _("Rated") : _("Casual")) + " • ",
                                h('a.user-link', {attrs: {
                                    target: '_blank',
                                    href: '/variant/' + model["variant"] + ((model["chess960"]==='True') ? '960': ''),
                                    title: variantTooltip(model["variant"])
                                    }}, variantName(model["variant"], model["chess960"]) ),
                            ]),
                            Number(model["status"]) >= 0 ? h('info-date', {attrs: {timestamp: model["date"]}}, timeago(model["date"])) : _("Playing right now"),
                        ]),
                    ]),
                    h('div.player-data', [
                        h('i-side.icon', {
                            class: {
                                "icon-red": fc === _("Red"),
                                "icon-blue": fc === _("Blue"),
                                "icon-white": fc === _("White"),
                                "icon-black": fc === _("Black"),
                            }
                        }),
                        h('player', [
                            h('a.user-link', {attrs: {href: '/@/' + model["wplayer"]}}, [
                                h('player-title', " " + model["wtitle"] + " "),
                                model["wplayer"] + " (" + model["wrating"] + ") ",
                                h('rdiff#wrdiff'),
                            ]),
                        ]),
                    ]),
                    h('div.player-data', [
                        h('i-side.icon', {
                            class: {
                                "icon-red": sc === _("Red"),
                                "icon-gold": sc === _("Gold"),
                                "icon-black": sc === _("Black"),
                                "icon-white": sc === _("White"),
                            }
                        }),
                        h('player', [
                            h('a.user-link', {attrs: {href: '/@/' + model["bplayer"]}}, [
                                h('player-title', " " + model["btitle"] + " "),
                                model["bplayer"] + " (" + model["brating"] + ") ",
                                h('rdiff#brdiff'),
                            ]),
                        ]),
                    ]),
                ]),
                h('div.roundchat#roundchat'),
            ]),
            h('div', [
                h('selection.' + VARIANTS[model["variant"]].board + '.' + VARIANTS[model["variant"]].pieces, [
                    h('div.cg-wrap.' + VARIANTS[model["variant"]].cg,
                        { hook: { insert: (vnode) => runGround(vnode, model)},
                    }),
                ]),
            ]),
            h('aside.sidebar-second', [
                h('div#counting'),
                h('div#pocket-wrapper0', [
                    h('div.' + VARIANTS[model["variant"]].pieces + '.' + model["variant"], [
                        h('div.cg-wrap.pocket', [
                            h('div#pocket0'),
                        ]),
                    ]),
                ]),
                h('div.info-wrap', [
                    h('div.clock-wrap', [
                        h('div#clock0'),
                        h('div#more-time'),
                    ]),
                    h('div#misc-info0'),
                ]),
                h('div.round-data', [
                    h('round-player#rplayer0'),
                    h('div#move-controls'),
                    h('div#movelist-block', [
                        h('div#movelist'),
                    ]),
                    h('div#result'),
                    h('div#game-controls'),
                    h('round-player#rplayer1'),
                ]),
                h('div.info-wrap', [
                    h('div#clock1'),
                    h('div#misc-info1'),
                ]),
                h('div#pocket-wrapper1', [
                    h('div.' + VARIANTS[model["variant"]].pieces + '.' + model["variant"], [
                        h('div.cg-wrap.pocket', [
                            h('div#pocket1'),
                        ]),
                    ]),
                ]),
            ]),
            h('under-left#spectators'),
            h('under-board', [
                h('div#janggi-setup-buttons'),
                h('div#ctable-container'),
            ]),
        ];
}
