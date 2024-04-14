import { h, VNode } from "snabbdom";

import { _ } from './i18n';
import { colorIcon } from './chess';
import { aiLevel, gameType, renderRdiff } from './result';
import { timeago, } from './datetime';
import { timeControlStr } from "./view";
import { PyChessModel } from "./types";
import { VARIANTS } from "./variants";


export function gameInfo(model: PyChessModel): VNode {
    console.log("roundView model=", model);
    const variant = VARIANTS[model.variant];
    const chess960 = model.chess960 === 'True';
    const dataIcon = variant.icon(chess960);
    const tc = timeControlStr(model["base"], model["inc"], model["byo"], model["corr"] === "True" ? model["base"] : 0)

    return h('div.game-info', [
        h('section', [
        h('div.info0.icon', { attrs: { "data-icon": dataIcon } }, [
            h('div.info2', [
                h('div.tc', [
                    tc + " • " + gameType(model["rated"]) + " • ",
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
            h('player', playerInfo(model, 'w')),
        ]),
        h('div.player-data', [
            h('i-side.icon', {class: {[colorIcon(model.variant, variant.colors.second)]: true}}),
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
        (title !== '') ? h('player-title', title + ' ') : '',
        username + aiLevel(title, level) + (title !== 'BOT' ? (" (" + rating + ") ") : ''),
        model["status"] < 1 || model["rated"] !== '1' ? h('rdiff#' + color + 'rdiff') : renderRdiff(rdiff),
        (berserk === "True") ? h('icon.icon-berserk') : h('berserk#' + color + 'berserk'),
    ]);
}
