import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

const patch = init([klass, attributes, properties, listeners]);

import h from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';

import { Chessground } from 'chessgroundx';

import { renderUsername } from './user';
import { variants, VARIANTS } from './chess';
import { renderTimeago } from './clock';
import { changeCSS } from './settings';


export function result(status, result) {
    var text = '';
    console.log("result()", status, result);
    switch (status) {
    case -2:
    case -1:
        text = 'Playing right now';
        break;
    case 0:
        text = 'Game aborted';
        break;
    case 1:
        text = 'Checkmate';
        break;
    case 2:
        text = ((result === '1-0') ? 'Black' : 'White') + ' resigned';
        break;
    case 3:
        text = 'Stalemate';
        break;
    case 4:
        text = 'Time out';
        break;
    case 5:
        text = 'Draw';
        break;
    case 6:
        text = 'Time out';
        break;
    case 7:
        text = ((result === '1-0') ? 'Black' : 'White') + ' abandoned the game';
        break
    default:
        text = '*';
        break
    }
    return (status <= 0) ? text : text + ', ' + result;
}


function renderGames(model, games) {
//                h('fn', player["first_name"]),
//                h('ln', player["last_name"]),
//                h('country', player["country"]),
    var rows = games.map((game) => h(
        'tr',
        { on: { click: () => { window.location.assign(model["home"] + '/' + game["_id"]); } },
        }, [
        h('td.board', [
            h('selection.' + VARIANTS[game["v"]].board + '.' + VARIANTS[game["v"]].pieces, [
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
            h('div.info0', {attrs: {"data-icon": VARIANTS[game["v"]].icon}, class: {"icon": true}}, [
                h('div.info1', {attrs: {"data-icon": (game["z"] === 1) ? "V" : ""}, class: {"icon": true}}),
                h('div.info2', [
                    h('div.tc', game["b"] + "+" + game["i"] + " • Casual • " + game["v"]),
                    h('info-date', {attrs: {timestamp: game["d"]}}),
                ]),
            ]),
            h('div', [
                h('player', [
                    h('a.user-link', {attrs: {href: '/@/' + game["us"][0]}}, [
                        h('player-title', " " + game["wt"] + " "),
                        game["us"][0] + ((game["wt"] === 'BOT' && game['x'] > 0) ? ' level ' + game['x']: ''),
                    ]),
                ]),
                h('vs', ' - '),
                h('player', [
                    h('a.user-link', {attrs: {href: '/@/' + game["us"][1]}}, [
                        h('player-title', " " + game["bt"] + " "),
                        game["us"][1] + ((game["bt"] === 'BOT' && game['x'] > 0) ? ' level ' + game['x']: ''),
                    ]),
                ]),
            ]),
            h('div.info-result', {
                class: {
                    "win": (game["r"] === '1-0' && game["us"][0] === model["profileid"]) || (game["r"] === '0-1' && game["us"][1] === model["profileid"]),
                    "lose": (game["r"] === '0-1' && game["us"][0] === model["profileid"]) || (game["r"] === '1-0' && game["us"][1] === model["profileid"]),
                }}, result(game["s"], game["r"])
            ),
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

export function profileView(model): VNode[] {
    renderUsername(model["home"], model["username"]);
    console.log(model);

    const CSSindexesB = variants.map((variant) => localStorage[variant + "_board"] === undefined ? 0 : Number(localStorage[variant + "_board"]));
    const CSSindexesP = variants.map((variant) => localStorage[variant + "_pieces"] === undefined ? 0 : Number(localStorage[variant + "_pieces"]));
    Object.keys(VARIANTS).forEach((key) => {
        const variant = VARIANTS[key];
        if (variant.BoardCSS.length > 1) {
            var idx = CSSindexesB[variants.indexOf(key)];
            idx = Math.min(idx, variant.BoardCSS.length - 1);
            changeCSS('/static/' + variant.BoardCSS[idx] + '.css');
        };
        if (variant.PieceCSS.length > 1) {
            var idx = CSSindexesP[variants.indexOf(key)];
            idx = Math.min(idx, variant.PieceCSS.length - 1);
            changeCSS('/static/' + variant.PieceCSS[idx] + '.css');
        };
    });

    return [h('aside.sidebar-first'),
            h('main.profile', [
                h('player-head', [
                    model["profileid"],
                    h('a.i-dl', {
                        attrs: {href: '/games/export/' + model["profileid"], "download": model["profileid"] + '.pgn'},
                        class: {"icon": true, "icon-download": true}}),
                    h('a.i-tv', {
                        attrs: {href: '/@/' + model["profileid"] + '/tv'},
                        class: {"icon": true, "icon-tv": true}}),
                    ]),
                h('table#games'),
                h('div#sentinel', { hook: { insert: (vnode) => observeSentinel(vnode, model) }})
            ]),
            h('aside.sidebar-second'),
        ];
}
