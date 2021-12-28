import { h, VNode } from "snabbdom";

import { _ } from './i18n';
import { VARIANTS } from './chess';
import { aiLevel, gameType, renderRdiff } from './profile';
import { timeago, } from './datetime';
import { timeControlStr } from "./view";
import { PyChessModel } from "./main";


export function gameInfo(model: PyChessModel): VNode {
    console.log("roundView model=", model);
    const variant = VARIANTS[model.variant];
    const chess960 = model.chess960 === 'True';
    const dataIcon = variant.icon(chess960);
    const fc = variant.firstColor;
    const sc = variant.secondColor;

    return h('div.game-info', [
        h('section', [
        h('div.info0.icon', { attrs: { "data-icon": dataIcon } }, [
            h('div.info2', [
                h('div.tc', [
                    timeControlStr(model["base"], model["inc"], model["byo"]) + " • " + gameType(model["rated"]) + " • ",
                    h('a.user-link', {
                        attrs: {
                            target: '_blank',
                            href: '/variants/' + model["variant"] + (chess960 ? '960': ''),
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
                    "icon-pink":  fc === "Pink",
                }
            }),
            h('player', playerInfo(model, 'w')),
        ]),
        h('div.player-data', [
            h('i-side.icon', {
                class: {
                    "icon-white": sc === "White",
                    "icon-black": sc === "Black",
                    "icon-red":   sc === "Red",
                    "icon-blue":  sc === "Blue",
                    "icon-gold":  sc === "Gold",
                    "icon-pink":  sc === "Pink",
                }
            }),
            h('player', playerInfo(model, 'b')),
        ]),
        ]),
        h('section', [
            h('div.tourney', (model["tournamentId"]) ? [
                h('a.icon.icon-trophy', { attrs: { href: '/tournament/' + model["tournamentId"] } }, model["tournamentname"]),
            ] : []),
        ]),
    ])
}

function playerInfo(model: PyChessModel, color: string) {
    const username = model[color === "w"? "wplayer": "bplayer"];
    const title = model[color === "w"? "wtitle": "btitle"];
    const level = model.level;
    const rating = model[color === "w"? "wrating": "brating"];
    const rdiff = model[color === "w"? "wrdiff": "brdiff"];
    const berserk = model[color === "w"? "wberserk": "bberserk"];

    return h('a.user-link', { attrs: { href: '/@/' + username } }, [
        h('player-title', " " + title + " "),
        username + aiLevel(title, level) + (title !== 'BOT' ? (" (" + rating + ") ") : ''),
        model["status"] < 1 || model["rated"] !== '1' ? h('rdiff#' + color + 'rdiff') : renderRdiff(rdiff),
        (berserk === "True") ? h('icon.icon-berserk') : h('berserk#' + color + 'berserk'),
    ]);
}
