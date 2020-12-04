import { h } from "snabbdom";
import { VNode } from 'snabbdom/vnode';

import { _ } from './i18n';
import RoundController from './roundCtrl';
import { VARIANTS } from './chess';
import { timeago, renderTimeago } from './datetime';
import { aiLevel, gameType, renderRdiff } from './profile';

function runGround(vnode: VNode, model) {
    const el = vnode.elm as HTMLElement;
    const ctrl = new RoundController(el, model);
    const cg = ctrl.chessground;
    window["cg"] = cg;
}

export function roundView(model): VNode[] {
    console.log("roundView model=", model);
    const variant = VARIANTS[model.variant];
    const chess960 = model.chess960 === 'True';
    const dataIcon = variant.icon(chess960);
    const fc = variant.firstColor;
    const sc = variant.secondColor;

    renderTimeago();

    return [h('aside.sidebar-first', [
        h('div.game-info', [
            h('div.info0.icon', { attrs: { "data-icon": dataIcon } }, [
                h('div.info2', [
                    h('div.tc', [
                        model["base"] + "+" + (model["byo"] > 1 ? model["byo"] + "x" : "") + model["inc"] + (model["byo"] > 0 ? "(b)" : "") + " • " + gameType(model["rated"]) + " • ",
                        h('a.user-link', {
                            attrs: {
                                target: '_blank',
                                href: '/variant/' + model["variant"] + (chess960 ? '960': ''),
                            }
                        },
                            variant.displayName(chess960)),
                    ]),
                    Number(model["status"]) >= 0 ? h('info-date', { attrs: { timestamp: model["date"] } }, timeago(model["date"])) : _("Playing right now"),
                ]),
            ]),
            h('div.player-data', [
                h('i-side.icon', {
                    class: {
                        "icon-white": fc === "White",
                        "icon-black": fc === "Black",
                        "icon-red":   fc === "Red",
                        "icon-blue":  fc === "Blue",
                        "icon-gold":  fc === "Gold",
                    }
                }),
                h('player', playerInfo(model, 'w', null)),
            ]),
            h('div.player-data', [
                h('i-side.icon', {
                    class: {
                        "icon-white": sc === "White",
                        "icon-black": sc === "Black",
                        "icon-red":   sc === "Red",
                        "icon-blue":  sc === "Blue",
                        "icon-gold":  sc === "Gold",
                    }
                }),
                h('player', playerInfo(model, 'b', null)),
            ]),
        ]),
        h('div.roundchat#roundchat'),
    ]),
        h('div', [
            h('selection#mainboard.' + variant.board + '.' + variant.piece, [
                h('div.cg-wrap.' + variant.cg, {
                    hook: {
                        insert: (vnode) => runGround(vnode, model)
                    },
                }),
            ]),
        ]),
        h('aside.sidebar-second', [
            h('div#counting'),
            h('div', [
                h('div.' + variant.piece + '.' + model["variant"], [
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
            h('div', [
                h('div.' + variant.piece + '.' + model["variant"], [
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

function playerInfo(model, color: string, rdiff: number | null) {
    const username = model[color + "player"];
    const title = model[color + "title"];
    const level = model.level;
    const rating = model[color + "rating"];

    return h('a.user-link', { attrs: { href: '/@/' + username } }, [
        h('player-title', " " + title + " "),
        username + aiLevel(title, level) + " (" + rating + ") ",
        rdiff === null ? h('rdiff#' + color + 'rdiff') : renderRdiff(rdiff),
    ]);
}
