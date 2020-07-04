import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

const patch = init([klass, attributes, properties, listeners]);

import h from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';

import { Chessground } from 'chessgroundx';

import { _, i18n } from './i18n';
import { VARIANTS, variantIcon, variantName, firstColor, secondColor } from './chess';
import { renderTimeago } from './clock';
import { boardSettings } from './board';


export function result(variant, status, result) {
    var text = '';
    console.log("result()", variant, status, result);
    const first = firstColor(variant);
    const second = secondColor(variant);
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
        text = ((result === '1-0') ? i18n.gettext('%1 resigned', second) : i18n.gettext('%1 resigned', first));
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
        text = ((result === '1-0') ? i18n.gettext('%1 abandoned the game', second) : i18n.gettext('%1 abandoned the game', first));
        break
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
        text = (variant === 'orda' || variant === 'synochess') ? _('Campmate') : _('Point counting');
        break;
    case 13:
        text = (variant === 'janggi') ? _('Point counting') : _('Repetition');
        break;
    default:
        text = '*';
        break
    }
    return (status <= 0) ? text : text + ', ' + result;
}

export function renderRdiff(rdiff) {
    if (rdiff === undefined) {
        return h('span');
    } else if (rdiff === 0) {
        return h('span', '±0');
    } else if (rdiff< 0) {
        return h('bad', rdiff);
    } else {
        return h('good', '+' + rdiff);
    }
}

function renderGames(model, games) {
    var rows = games.map((game) => h(
        'tr',
        { on: { click: () => { window.location.assign(model["home"] + '/' + game["_id"]); } },
        }, [
        h('td.board', [
            h('selection.' + game["v"] + '-board.' + VARIANTS[game["v"]].pieces, [
                h('div.cg-wrap.' + VARIANTS[game["v"]].cg + '.mini', { hook: {
                    insert: (vnode) => {
                        Chessground(vnode.elm as HTMLElement, {
                            coordinates: false,
                            viewOnly: true,
                            fen: game["f"],
                            geometry: VARIANTS[game["v"]].geom
                        });
                    }
                }}),
            ]),
        ]),
        h('td.games-info', [
            h('div.info0.games', {attrs: {"data-icon": variantIcon(game["v"], game["z"])}, class: {"icon": true}}, [
                // h('div.info1', {attrs: {"data-icon": (game["z"] === 1) ? "V" : ""}, class: {"icon": true}}),
                h('div.info2', [
                    h('div.tc', game["b"] + "+" + (game["bp"] > 1 ? game["bp"] + "x" : "") + game["i"] + (game["bp"] > 0 ? "(b)" : "") + " • " + ((game["y"] === 1) ? _("Rated") : _("Casual")) + " • " + variantName(game["v"], game["z"])),
                    h('info-date', {attrs: {timestamp: game["d"]}}),
                ]),
            ]),
            h('div.info-middle', [
                h('div.versus', [
                    h('player', [
                        h('a.user-link', {attrs: {href: '/@/' + game["us"][0]}}, [
                            h('player-title', " " + game["wt"] + " "),
                            game["us"][0] + ((game["wt"] === 'BOT' && game['x'] >= 0) ? _(' level ') + game['x']: ''),
                            h('br'),
                            (game["p0"] === undefined) ? "": game["p0"]["e"] + " ",
                            (game["p0"] === undefined) ? "": renderRdiff(game["p0"]["d"]),
                        ]),
                    ]),
                    h('vs-swords', {attrs: {"data-icon": '"'}, class: {"icon": true}}),
                    h('player', [
                        h('a.user-link', {attrs: {href: '/@/' + game["us"][1]}}, [
                            h('player-title', " " + game["bt"] + " "),
                            game["us"][1] + ((game["bt"] === 'BOT' && game['x'] >= 0) ? _(' level ') + game['x']: ''),
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
                    }}, result(game["v"], game["s"], game["r"])
                ),
            ]),
            h('div.info0.games', [
                h('div', [
                    h('div.info0', game["m"] === undefined ? "" : i18n.ngettext("%1 move", "%1 moves", game["m"].length)),
                    h('div.info0', game["a"] === undefined ? "" : [h('span.icon', {attrs: {"data-icon": "3"}, class: {"icon": true}}), _("Computer analysis available")]),
                ]),
            ]),
        ])
        ])
        );
    return [h('tbody', rows)];
}

function loadGames(model, page) {
    var xmlhttp = new XMLHttpRequest();
    var url = model["home"] + "/api/" + model["profileid"]
    if (model.level) {
        url = url + "/loss?x=8&p=";
    } else if (model.variant) {
        url = url + "/" + model.variant + "?p=";
    } else {
        url = url + "/all?p=";
    }

    xmlhttp.onreadystatechange = function() {
        if (this.readyState == 4 && this.status == 200) {
            var myArr = JSON.parse(this.responseText);

            // If empty JSON, exit the function
            if (!myArr.length) {
                return;
            }
            myFunction(myArr);
        }
    };
    // console.log("GET url:", url + page)
    xmlhttp.open("GET", url + page, true);
    xmlhttp.send();

    function myFunction(arr) {
        const oldVNode = document.getElementById('games');
        console.log(arr);
        if (oldVNode instanceof Element) {
            patch(oldVNode as HTMLElement, h('table#games', renderGames(model, arr)));
        }
        renderTimeago();
    }
}


function observeSentinel(vnode: VNode, model) {
    const sentinel = vnode.elm as HTMLElement;
    var page = 0;

    var intersectionObserver = new IntersectionObserver(entries => {
        // If intersectionRatio is 0, the sentinel is out of view
        // and we don't need to do anything. Exit the function
        if (entries[0].intersectionRatio <= 0) return;

        loadGames(model, page);
        page += 1;
    });

    intersectionObserver.observe(sentinel!);
}

export function profileView(model) {
    console.log(model);
    boardSettings.updateBoardAndPieceStyles();
    const anon = model["anon"] === 'True';
    return [
                h('player-head', [
                    h('player', [
                        h('a.user-link', {attrs: {href: '/@/' + model["profileid"]}}, [
                            h('player-title', " " + model["title"] + " "),
                            model["profileid"],
                        ]),
                    ]),
                    h('a.i-at', {
                        attrs: {href: 'https://lichess.org/@/' + model["profileid"], title: _('Lichess profile')},
                        class: {"icon": true, "icon-at": true, "disabled": anon}}),
                    h('a.i-dl', {
                        attrs: {href: '/games/export/' + model["profileid"], download: model["profileid"] + '.pgn', title: _('Export games')},
                        class: {"icon": true, "icon-download": true, "disabled": anon || model["title"] === 'BOT'}}),
                    h('a.i-tv', {
                        attrs: {href: '/@/' + model["profileid"] + '/tv', title: _('Watch games')},
                        class: {"icon": true, "icon-tv": true}}),
                    h('a.i-ch', {
                        attrs: {href: '/@/' + model["profileid"] + '/challenge', title: _('Challenge to a game')},
                        class: {"icon": true, "icon-crossedswords": true, "disabled": anon || model["username"] === model["profileid"]}}),
                    ]),
                h('table#games'),
                h('div#sentinel', { hook: { insert: (vnode) => observeSentinel(vnode, model) }})
            ]
}
