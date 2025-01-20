import { h, VNode } from 'snabbdom';

import { Chessground } from 'chessgroundx';
import * as cg from "chessgroundx/types";

import { _, ngettext, pgettext, languageSettings } from './i18n';
import { getLastMoveFen, VARIANTS } from './variants';
import { patch } from './document';
import { renderTimeago } from './datetime';
import { boardSettings } from './boardSettings';
import { alternateStartName, timeControlStr } from './view';
import { PyChessModel } from "./types";
import { Ceval } from "./messages";
import { aiLevel, gameType, result, renderRdiff } from './result';
import { renderBugTeamInfo, renderGameBoardsBug } from "@/bug/profile.bug";

export interface Game {
    _id: string; // mongodb document id
    z: number; // chess960 (0/1)
    v: string; // variant name
    f: cg.FEN; // FEN 
    fp: cg.FEN; // FEN partner/second board B in case of bughouse

    lm: string; // last move
    lmB: string; // last move

    b: number; // TC base
    i: number; // TC increment
    bp: number; // TC byoyomi period

    y: number; // casual/rated/imported/correspondence (0/1/2/3)
    c: boolean; // correspondence game
    d: string; // datetime

    tid?: string; // tournament id
    tn?: string; // tournament name

    wb?: boolean; // white berserk
    bb?: boolean; // black berserk

    us: string[]; // users (wplayer name, bplayer name) or in case of bughouse: board A wplayer name, board A bplayer name, board B wplayer name, board B bplayer name
    wt: string; // white title
    bt: string; // black title

    wtB: string; // white title board B in case of bughouse
    btB: string; // black title board B in case of bughouse

    x: number; // Fairy level
    p0: Player; // white performance rating (rating, diff)
    p1: Player; // black performance rating (rating, diff)
    s: number; // game status range(-2, 14) as CREATED, STARTED, ABORTED, MATE, ... see in const.py
    r: string; // game result string (1-0, 0-1, 1/2-1/2, *)
    m: string[]; // moves in compressed format as they are stored in mongo. Only used for count of moves here
    a: Ceval[]; // analysis

    initialFen: string;
}

interface Player {
    e: string;
    d: number;
}

function tournamentInfo(game: Game) {
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
        const tc = timeControlStr(game["b"], game["i"], game["bp"], game["c"] === true ? game["b"] : 0);
        const altStartName = alternateStartName(variant, game.initialFen);
        const isBug = variant.twoBoards;
        let teamFirst, teamSecond = '';
        if (isBug) {
            teamFirst = game["us"][0] + "+" + game["us"][3];
            teamSecond = game["us"][2] + "+" + game["us"][1];
        }
        let lastMove, fen;
        [lastMove, fen] = getLastMoveFen(variant.name, game.lm, game.f)
        return h('tr', [h('a', { attrs: { href : '/' + game["_id"] } }, [
            h('td.board', { class: { "with-pockets": !!variant.pocket, "bug": isBug} },
               isBug? renderGameBoardsBug(game, model["profileid"]): [
                    h(`selection.${variant.boardFamily}.${variant.pieceFamily}.${variant.ui.boardMark}`,[
                        h(`div.cg-wrap.${variant.board.cg}.mini`, {
                        hook: {
                            insert: vnode => Chessground(vnode.elm as HTMLElement, {
                                coordinates: false,
                                viewOnly: true,
                                fen: fen,
                                lastMove: lastMove,
                                dimensions: variant.board.dimensions,
                                pocketRoles: variant.pocket?.roles,
                            })
                        }
                    })
                ]),
            ]),
            h('td.games-info', [
                h('div.info0.games.icon', { attrs: { "data-icon": variant.icon(chess960) } }, [
                    // h('div.info1.icon', { attrs: { "data-icon": (game["z"] === 1) ? "V" : "" } }),
                    h('div.info2', [
                        h('div.tc', tc + " • " + gameType(game["y"]) + " • " + variant.displayName(chess960)),
                        h('div', (altStartName) ? altStartName : ''),
                        h('div', tournamentInfo(game)),
                    ]),
                ]),
                h('div.info-middle', [
                    h('div.versus',
                        { class: { "bug": isBug } },
                        [h('player.left',
                            { class: { "bug": isBug } },
                            isBug? renderBugTeamInfo(game, 0): [
                            h('a.user-link', { attrs: { href: '/@/' + game["us"][0] } }, [
                                h('player-title', game["wt"]? " " + game["wt"] + " ": ""),
                                game["us"][0] + aiLevel(game["wt"], game['x']),
                            ]),
                            h('br'),
                            (game["wb"] === true) ? h('icon.icon-berserk') : '',
                            (game["p0"] === undefined) ? "": game["p0"]["e"] + " ",
                            (game["p0"] === undefined) ? "": renderRdiff(game["p0"]["d"]),
                        ]),
                        h('vs-swords.icon', { attrs: { "data-icon": '"' } }),
                        h('player.right',
                            { class: { "bug": isBug } },
                            isBug? renderBugTeamInfo(game, 1): [
                            h('a.user-link', { attrs: { href: '/@/' + game["us"][1] } }, [
                                h('player-title', game["bt"]? " " + game["bt"] + " ": ""),
                                game["us"][1] + aiLevel(game["bt"], game['x']),
                            ]),
                            h('br'),
                            (game["bb"] === true) ? h('icon.icon-berserk') : '',
                            (game["p1"] === undefined) ? "": game["p1"]["e"] + " ",
                            (game["p1"] === undefined) ? "": renderRdiff(game["p1"]["d"]),
                        ])]
                    ),
                    h('div.info-result', {
                        class: {
                            "win": isWinClass(model, game),
                            "lose": ['1-0', '0-1'].includes(game["r"]) && !isWinClass(model, game),
                        }}, result(variant, game["s"], game["r"], teamFirst, teamSecond)
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

function isWinClass(model: PyChessModel, game: Game): boolean {
    const variant = VARIANTS[game.v];
    if (variant.twoBoards){
        const team = game["us"][0] === model["profileid"] || game["us"][3] === model["profileid"]? 0: 1;
        return (game["r"] === '1-0' && team === 0) || (game["r"] === '0-1' && team === 1);
    } else {
        return (game["r"] === '1-0' && game["us"][0] === model["profileid"]) || (game["r"] === '0-1' && game["us"][1] === model["profileid"]);
    }
}

function loadGames(model: PyChessModel, page: number) {
    const lang = languageSettings.value;

    const xmlhttp = new XMLHttpRequest();
    let url = "/api/" + model["profileid"]
    if (model.level) {
        url = `${url}/loss?l=${lang}&x=8&p=`;
    } else if (model.variant) {
        url = `${url}/perf/${model.variant}?l=${lang}&p=`;
    } else if (model.rated === "1") {
        url = `${url}/rated?l=${lang}&p=`;
    } else if (model.rated === "2") {
        url = `${url}/import?l=${lang}&p=`;
    } else if (model.rated === "-2") {
        url = `${url}/playing?l=${lang}&p=`;
    } else if (model.rated === "-1") {
        url = `${url}/me?l=${lang}&p=`;
    } else {
        url = `${url}/all?l=${lang}&p=`;
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
    xmlhttp.open("GET", `${url}${page}`, true);
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

    const profileId = model["profileid"];
    const rated = model["rated"];

    const blockEl = document.getElementById('block') as HTMLElement;
    if (blockEl !== null) renderBlock('block', profileId);

    const unblockEl = document.getElementById('unblock') as HTMLElement;
    if (unblockEl !== null) renderUnblock('unblock', profileId);

    let tabs: VNode[] = [];
    tabs.push(h('div.sub-ratings', [h('a', { attrs: { href: '/@/' + profileId }, class: {"active": rated === "None"} }, _('Games'))]));
    if (model["username"] !== profileId) {
        tabs.push(h('div.sub-ratings', [h('a', { attrs: { href: '/@/' + profileId + '/me' }, class: {"active": rated === "-1" } }, _('Games with you'))]));
    }
    tabs.push(h('div.sub-ratings', [h('a', { attrs: { href: '/@/' + profileId + '/rated' }, class: {"active": rated === "1" } }, pgettext('UsePluralFormIfNeeded', 'Rated'))]));
    tabs.push(h('div.sub-ratings', [h('a', { attrs: { href: '/@/' + profileId + '/playing' }, class: {"active": rated === "-2" } }, pgettext('UsePluralFormIfNeeded', 'Playing'))]));
    tabs.push(h('div.sub-ratings', [h('a', { attrs: { href: '/@/' + profileId + '/import' }, class: {"active": rated === "2" } }, _('Imported'))]));

    return [
        h('div.filter-tabs', tabs),
        h('table#games'),
        h('div#sentinel', { hook: { insert: (vnode) => observeSentinel(vnode, model) } }),
    ];
}

function renderBlock(id: string, profileId: string) {
    const el = document.getElementById(id) as HTMLElement;
    if (el !== null) {
        patch(el, h('a#block.icon.icon-ban', {
            attrs: { href: '/api/' + profileId + '/block', title: _('Block') },
            on: { click: (e: Event) => postBlock(e, profileId, true) } },
            _('Block')
        ));
    }
}

function renderUnblock(id: string, profileId: string) {
    const el = document.getElementById(id) as HTMLElement;
    if (el !== null) {
        patch(el, h('a#unblock.icon.icon-ban', {
            attrs: { href: '/api/' + profileId + '/block', title: _('Unblock') },
            on: { click: (e: Event) => postBlock(e, profileId, false) } },
            _('Unblock')
        ));
    }
}

function postBlock(e: Event, profileId: string, block: boolean) {
    e.preventDefault();
    const XHR = new XMLHttpRequest();
    const FD  = new FormData();
    FD.append('block', `${block}`);

    XHR.onreadystatechange = function() {
        if (this.readyState === 4 && this.status === 200) {
            const response = JSON.parse(this.responseText);
            if (response['error'] !== undefined) {
                console.log(response['error']);
            } else {
                if (block) {
                    renderUnblock('block', profileId);
                } else {
                    renderBlock('unblock', profileId);
                }
            }
        }
    }
    XHR.open("POST", `/api/${profileId}/block`, true);
    XHR.send(FD);
    return false;
}
