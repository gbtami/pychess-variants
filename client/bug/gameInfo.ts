import { h, VNode } from "snabbdom";

import { _ } from '../i18n';
import { colorIcon, VARIANTS } from '../chess';
import { aiLevel, gameType, renderRdiff } from '../result';
import { timeago, } from '../datetime';
import { timeControlStr } from "../view";
import { PyChessModel } from "../types";


export function gameInfo(model: PyChessModel): VNode {
    console.log("roundView model=", model);
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
            h('i-side.icon', {class: {[colorIcon(model.variant, variant.firstColor)]: true}}),
            h('player', playerInfo(model, 'w', 'a')),
            h('div', {style:{display:"inline", paddingRight:"8px"}},'+'),
            h('i-side.icon', {class: {[colorIcon(model.variant, variant.secondColor)]: true}}),
            h('player', playerInfo(model, 'b', 'a')),
        ]),
        h('div.player-data', [
            h('i-side.icon', {class: {[colorIcon(model.variant, variant.secondColor)]: true}}),
            h('player', playerInfo(model, 'b', 'b')),
            h('div', {style:{display:"inline", paddingRight:"8px"}},'+'),
            h('i-side.icon', {class: {[colorIcon(model.variant, variant.firstColor)]: true}}),
            h('player', playerInfo(model, 'w', 'b')),
        ]),
        ]),
        h('section', [
            h('div.tourney', (model["tournamentId"]) ? [
                h('a.icon.icon-trophy', { attrs: { href: '/tournament/' + model["tournamentId"] } }, model["tournamentname"]),
            ] : []),
        ]),
    ])
}

function playerInfo(model: PyChessModel, color: string, board: string) {

    const username = model[board == "a"? color === "w"? "wplayer": "bplayer": color === "w"? "wplayerB": "bplayerB"];
    const title = model[board == "a"? color === "w"? "wtitle": "btitle": color === "w"? "wtitleB": "btitleB"];
    const level = model.level;
    const rating = model[board == "a"? color === "w"? "wrating": "brating": color === "w"? "wratingB": "bratingB"];
    const rdiff = model[board == "a"? color === "w"? "wrdiff": "brdiff": color === "w"? "wrdiffB": "brdiffB"];
    const berserk = model[color === "w"? "wberserk": "bberserk"];

    return h('a.user-link', { attrs: { href: '/@/' + username } }, [
        h('player-title', " " + title + " "),
        username + aiLevel(title, level) + (title !== 'BOT' ? (" (" + rating + ") ") : ''),
        model["status"] < 1 || model["rated"] !== '1' ? h('rdiff#' + color + 'rdiff') : renderRdiff(rdiff),
        (berserk === "True") ? h('icon.icon-berserk') : h('berserk#' + color + 'berserk'),
    ]);
}