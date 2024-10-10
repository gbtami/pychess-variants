import { h, VNode } from "snabbdom";

import { _ } from '../i18n';
import { colorIcon } from '../chess';
import { VARIANTS } from "../variants"
import { aiLevel, gameType } from '../result';
import { timeago, } from '../datetime';
import { timeControlStr } from "../view";
import { PyChessModel } from "../types";


export function gameInfoBug(model: PyChessModel): VNode {
    // console.log("roundView model=", model);
    const variant = VARIANTS[model.variant];
    const chess960 = model.chess960 === 'True';
    const dataIcon = variant.icon(chess960);

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
            h('i-side.icon', {class: {[colorIcon(model.variant, variant.colors.first)]: true}}),
            h('player', playerInfo(model, 'w', 'a')),
            h('div', {style:{display:"inline", paddingRight:"8px"}},'+'),
            h('i-side.icon', {class: {[colorIcon(model.variant, variant.colors.second)]: true}}),
            h('player', playerInfo(model, 'b', 'b')),
        ]),
        h('div.player-data', [
            h('i-side.icon', {class: {[colorIcon(model.variant, variant.colors.second)]: true}}),
            h('player', playerInfo(model, 'w', 'b')),
            h('div', {style:{display:"inline", paddingRight:"8px"}},'+'),
            h('i-side.icon', {class: {[colorIcon(model.variant, variant.colors.first)]: true}}),
            h('player', playerInfo(model, 'b', 'a')),
        ]),
        ]),
        h('section', [
            h('div.tourney', (model["tournamentId"]) ? [
                h('a.icon.icon-trophy', { attrs: { href: '/tournament/' + model["tournamentId"] } }, model["tournamentname"]),
            ] : []),
        ]),
    ])
}

export function playerInfoData(model: PyChessModel, color: "w" | "b", board: "a" | "b"): [string, string, string] {
    const username = model[board == "a"? (color === "w"? "wplayer": "bplayer"): (color === "w"? "wplayerB": "bplayerB")];
    const title = model[board == "a"? color === "w"? "wtitle": "btitle": color === "w"? "wtitleB": "btitleB"];
    const rating = model[board == "a"? color === "w"? "wrating": "brating": color === "w"? "wratingB": "bratingB"];
    return [username, title, rating];
}

function playerInfo(model: PyChessModel, color: "w" | "b", board: "a" | "b") {

    const [username, title, rating] = playerInfoData(model, color, board);

    const level = model.level;

    return h('a.user-link', { attrs: { href: '/@/' + username } }, [
        h('player-title', " " + title + " "),
        username + aiLevel(title, level) + (title !== 'BOT' ? (" (" + rating + ") ") : ''),
        h('rdiff#' + color + 'rdiff'),
        h('berserk#' + color + 'berserk'),
    ]);
}
