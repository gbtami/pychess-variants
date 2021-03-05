import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

const patch = init([klass, attributes, properties, listeners]);

import h from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';

import { Chessground } from 'chessgroundx';

import { _, ngettext } from './i18n';
import { VARIANTS, IVariant } from './chess';
import { renderTimeago } from './datetime';
import { boardSettings } from './boardSettings';
import { timeControlStr } from './view';

export function colorNames(color: string) {
    return _(color);
}

export function gameType(rated: string | number) {
    switch (rated) {
    case "1":
    case 1:
        return _("Rated");
    case "2":
    case 2:
        return _("IMPORT");
    default:
        return _("Casual");
    }
}

export function aiLevel(title: string, level: number) {
    return (title === 'BOT' && level >= 0) ? ' ' + _('level %1', level): '';
}

export function result(variant: IVariant, status: number, result: string) {
    let text = '';
    const variantName = variant.name;
    console.log("result()", variantName, status, result);
    const first = colorNames(variant.firstColor);
    const second = colorNames(variant.secondColor);
    switch (status) {
        case -2:
        case -1:
            text = _('Playing right now');
            break;
        case 0:
            text = _('Game aborted');
            break;
        case 1:
            text = _('Checkmate');
            break;
        case 2:
            text = _('%1 resigned', (result === '1-0') ? second : first);
            break;
        case 3:
            text = _('Stalemate');
            break;
        case 4:
            text = _('Time out');
            break;
        case 5:
            text = _('Draw');
            break;
        case 6:
            text = _('Time out');
            break;
        case 7:
            text = _('%1 abandoned the game', (result === '1-0') ? second : first);
            break;
        case 8:
            text = _('Cheat detected');
            break;
        case 9:
            text = _('Not started');
            break;
        case 10:
            text = _('Invalid move');
            break;
        case 11:
            text = _('Unknown reason');
            break;
        case 12:
            switch (variantName) {
                case 'orda':
                case 'synochess':
                case 'dobutsu':
                    text = _('Campmate');
                    break;
                case 'atomic':
                    text = _('Explosion of king');
                    break;
                default:
                    text = _('Point counting');
                    break;
            }
            break;
        case 13:
            switch (variantName) {
                case 'janggi':
                    text = _('Point counting');
                    break;
                default:
                    text = _('Repetition');
                    break;
            }
            break;
        default:
            text = '*';
            break
    }
    return (status <= 0) ? text : text + ', ' + result;
}

export function renderRdiff(rdiff: number) {
    if (rdiff === undefined) {
        return h('span');
    } else if (rdiff === 0) {
        return h('span', '±0');
    } else if (rdiff < 0) {
        return h('bad', rdiff);
    } else if (rdiff > 0) {
        return h('good', '+' + rdiff);
    } else {
        return h('span');
    }
}

function renderGames(model, games) {
    const rows = games.map(game => {
        const variant = VARIANTS[game.v];
        const chess960 = game.z === 1;
        return h('tr', [h('a', { attrs: { href : '/' + game["_id"] } }, [
            h('td.board', [
                h(`selection.${variant.board}.${variant.piece}`, [
                    h(`div.cg-wrap.${variant.cg}.mini`, {
                        hook: {
                            insert: vnode => Chessground(vnode.elm as HTMLElement, {
                                coordinates: false,
                                viewOnly: true,
                                fen: game["f"],
                                geometry: variant.geometry,
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
                        h('info-date', { attrs: { timestamp: game["d"] } }),
                    ]),
                ]),
                h('div.info-middle', [
                    h('div.versus', [
                        h('player', [
                            h('a.user-link', { attrs: { href: '/@/' + game["us"][0] } }, [
                                h('player-title', " " + game["wt"] + " "),
                                game["us"][0] + aiLevel(game["wt"], game['x']),
                                h('br'),
                                (game["p0"] === undefined) ? "": game["p0"]["e"] + " ",
                                (game["p0"] === undefined) ? "": renderRdiff(game["p0"]["d"]),
                            ]),
                        ]),
                        h('vs-swords.icon', { attrs: { "data-icon": '"' } }),
                        h('player', [
                            h('a.user-link', { attrs: { href: '/@/' + game["us"][1] } }, [
                                h('player-title', " " + game["bt"] + " "),
                                game["us"][1] + aiLevel(game["bt"], game['x']),
                                h('br'),
                                (game["p1"] === undefined) ? "": game["p1"]["e"] + " ",
                                (game["p1"] === undefined) ? "": renderRdiff(game["p1"]["d"]),
                            ]),
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

function loadGames(model, page) {
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
    } else {
        url = url + "/all?p=";
    }

    xmlhttp.onreadystatechange = function() {
        if (this.readyState == 4 && this.status == 200) {
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

function observeSentinel(vnode: VNode, model) {
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

export function profileView(model) {
    boardSettings.updateBoardAndPieceStyles();
    const anon = model["anon"] === 'True';
    return [
        h('player-head', [
            h('player', [
                h('a.user-link', { attrs: { href: '/@/' + model["profileid"] } }, [
                    h('player-title', " " + model["title"] + " "),
                    model["profileid"],
                ]),
            ]),
            h('a.i-at.icon.icon-at', {
                attrs: { href: 'https://lichess.org/@/' + model["profileid"], title: _('Lichess profile') },
                class: { "disabled": anon },
            }),
            h('a.i-dl.icon.icon-cloud-upload', {
                attrs: { href: '/paste', title: _('Import game') },
                class: { "disabled": anon || model["title"] === 'BOT' },
            }),
            h('a.i-dl.icon.icon-download', {
                attrs: { href: '/games/export/' + model["profileid"], download: model["profileid"] + '.pgn', title: _('Export games') },
                class: { "disabled": anon || model["title"] === 'BOT' },
            }),
            h('a.i-tv.icon.icon-tv', {
                attrs: { href: '/@/' + model["profileid"] + '/tv', title: _('Watch games') },
            }),
            h('a.i-ch.icon.icon-crossedswords', {
                attrs: { href: '/@/' + model["profileid"] + '/challenge', title: _('Challenge to a game') },
                class: { "disabled": anon || model["username"] === model["profileid"] }
            }),
        ]),
        h('div.filter-tabs', [
            h('div.sub-ratings', [h('a', { attrs: { href: '/@/' + model["profileid"] }, class: {"active": model["rated"] === "None"} }, _('Games'))]),
            h('div.sub-ratings', [h('a', { attrs: { href: '/@/' + model["profileid"] + '/rated' }, class: {"active": model["rated"] === "1" } }, _('Rated'))]),
            h('div.sub-ratings', [h('a', { attrs: { href: '/@/' + model["profileid"] + '/import' }, class: {"active": model["rated"] === "2" } }, _('Imported'))]),
        ]),
        h('table#games'),
        h('div#sentinel', { hook: { insert: (vnode) => observeSentinel(vnode, model) } }),
    ];
}
