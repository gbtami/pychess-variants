import { h, VNode } from 'snabbdom';

import { Chessground } from 'chessgroundx';
import * as cg from "chessgroundx/types";

import { _, ngettext, pgettext } from './i18n';
import { uci2LastMove, VARIANTS } from './chess';
import { patch } from './document';
import { renderTimeago } from './datetime';
import { boardSettings } from './boardSettings';
import { timeControlStr } from './view';
import { PyChessModel } from "./types";
import { Ceval } from "./messages";
import { aiLevel, gameType, result, renderRdiff } from './result';

interface Game {
    _id: string;
    z: number;
    v: string;
    f: cg.FEN;
    lm: string;

    b: number;
    i: number;
    bp: number;

    y: string;
    d: string;

    tid?: string;
    tn?: string;

    wb?: boolean;
    bb?: boolean;

    us: string[];
    wt: string;
    bt: string;
    x: number;
    p0: Player;
    p1: Player;
    s: number;
    r: string;
    m: string[]; // moves in compressed format as they are stored in mongo. Only used for count of moves here
    a: Ceval[];
}

interface Player {
    e: string;
    d: number;
}

function toutnamentInfo(game: Game) {
    let elements = [h('info-date', { attrs: { timestamp: game["d"] } })];
    if (game["tid"]) {
        elements.push(h('span', " • "));
        elements.push(h('a.icon.icon-trophy', { attrs: { href: '/tournament/' + game["tid"] } }, game["tn"]));
    }
    return elements;
}

function renderGames(model: PyChessModel, games: Game[]) {
    const rows = games.map(game => {
        const variant = VARIANTS[game.v];
        const chess960 = game.z === 1;

        return h('tr', [h('a', { attrs: { href : '/' + game["_id"] } }, [
            h('td.board', { class: { "with-pockets": variant.pocketRoles('white') !== undefined } }, [
                h(`selection.${variant.board}.${variant.piece}`, [
                    h(`div.cg-wrap.${variant.cg}.mini`, {
                        hook: {
                            insert: vnode => Chessground(vnode.elm as HTMLElement,  {
                                coordinates: false,
                                viewOnly: true,
                                fen: game["f"],
                                lastMove: uci2LastMove(game.lm),
                                geometry: variant.geometry,
                                addDimensionsCssVars: true,
                                pocketRoles: color => variant.pocketRoles(color),
                            })
                        }
                    }),
                ]),
            ]),
            h('td.games-info', [
                h('div.info0.games.icon', { attrs: { "data-icon": variant.icon(chess960) } }, [
                    // h('div.info1.icon', { attrs: { "data-icon": (game["z"] === 1) ? "V" : "" } }),
                    h('div.info2', [
                        h('div.tc', timeControlStr(game["b"], game["i"], game["bp"]) + " • " + gameType(game["y"]) + " • " + variant.displayName(chess960)),
                        h('div', toutnamentInfo(game)),
                    ]),
                ]),
                h('div.info-middle', [
                    h('div.versus', [
                        h('player', [
                            h('a.user-link', { attrs: { href: '/@/' + game["us"][0] } }, [
                                h('player-title', " " + game["wt"] + " "),
                                game["us"][0] + aiLevel(game["wt"], game['x']),
                            ]),
                            h('br'),
                            (game["wb"] === true) ? h('icon.icon-berserk') : '',
                            (game["p0"] === undefined) ? "": game["p0"]["e"] + " ",
                            (game["p0"] === undefined) ? "": renderRdiff(game["p0"]["d"]),
                        ]),
                        h('vs-swords.icon', { attrs: { "data-icon": '"' } }),
                        h('player', [
                            h('a.user-link', { attrs: { href: '/@/' + game["us"][1] } }, [
                                h('player-title', " " + game["bt"] + " "),
                                game["us"][1] + aiLevel(game["bt"], game['x']),
                            ]),
                            h('br'),
                            (game["bb"] === true) ? h('icon.icon-berserk') : '',
                            (game["p1"] === undefined) ? "": game["p1"]["e"] + " ",
                            (game["p1"] === undefined) ? "": renderRdiff(game["p1"]["d"]),
                        ]),
                    ]),
                    h('div.info-result', {
                        class: {
                            "win": (game["r"] === '1-0' && game["us"][0] === model["profileid"]) || (game["r"] === '0-1' && game["us"][1] === model["profileid"]),
                            "lose": (game["r"] === '0-1' && game["us"][0] === model["profileid"]) || (game["r"] === '1-0' && game["us"][1] === model["profileid"]),
                        }}, result(variant, game["s"], game["r"])
                    ),
                ]),
                h('div.info0.games', [
                    h('div', [
                        h('div.info0', game["m"] === undefined ? "" : ngettext("%1 move", "%1 moves", game["m"].length)),
                        h('div.info0', game["a"] === undefined ? "" : [ h('span.icon', { attrs: {"data-icon": "3"} }), _("Computer analysis available") ]),
                    ])
                ])
            ])])
        ])
    });
    return [h('tbody', rows)];
}

function loadGames(model: PyChessModel, page: number) {
    const xmlhttp = new XMLHttpRequest();
    let url = "/api/" + model["profileid"]
    if (model.level) {
        url = url + "/loss?x=8&p=";
    } else if (model.variant) {
        url = url + "/perf/" + model.variant + "?p=";
    } else if (model.rated === "1") {
        url = url + "/rated" + "?p=";
    } else if (model.rated === "2") {
        url = url + "/import" + "?p=";
    } else if (model["rated"] === "-1") {
        url = url + "/me" + "?p=";
    } else {
        url = url + "/all?p=";
    }

    xmlhttp.onreadystatechange = function() {
        if (this.readyState === 4 && this.status === 200) {
            const response = JSON.parse(this.responseText);

            // If empty JSON, exit the function
            if (!response.length) {
                return;
            }
            const oldVNode = document.getElementById('games');
            if (oldVNode instanceof Element)
                patch(oldVNode, h('table#games', renderGames(model, response)));
            renderTimeago();
        }
    };
    xmlhttp.open("GET", url + page, true);
    xmlhttp.send();
}

function observeSentinel(vnode: VNode, model: PyChessModel) {
    const sentinel = vnode.elm as HTMLElement;
    let page = 0;
    const options = {root: null, rootMargin: '44px', threshold: 1.0};

    const intersectionObserver = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.intersectionRatio > 0)) {
            loadGames(model, page);
            page += 1;
        }
    }, options);

    intersectionObserver.observe(sentinel);
}

export function profileView(model: PyChessModel) {
    boardSettings.assetURL = model.assetURL;
    boardSettings.updateBoardAndPieceStyles();
    let tabs: VNode[] = [];
    tabs.push(h('div.sub-ratings', [h('a', { attrs: { href: '/@/' + model["profileid"] }, class: {"active": model["rated"] === "None"} }, _('Games'))]));
    if (model["username"] !== model["profileid"]) {
        tabs.push(h('div.sub-ratings', [h('a', { attrs: { href: '/@/' + model["profileid"] + '/me' }, class: {"active": model["rated"] === "-1" } }, _('Games with you'))]));
    }
    tabs.push(h('div.sub-ratings', [h('a', { attrs: { href: '/@/' + model["profileid"] + '/rated' }, class: {"active": model["rated"] === "1" } }, pgettext('UsePluralFormIfNeeded', 'Rated'))]));
    tabs.push(h('div.sub-ratings', [h('a', { attrs: { href: '/@/' + model["profileid"] + '/import' }, class: {"active": model["rated"] === "2" } }, _('Imported'))]));

    return [
        h('div.filter-tabs', tabs),
        h('table#games'),
        h('div#sentinel', { hook: { insert: (vnode) => observeSentinel(vnode, model) } }),
    ];
}
