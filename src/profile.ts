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
import { VARIANTS } from './chess';

// TODO: save FEN and lastmove to db and reuse them in miniboards

function renderGames(model, games) {
    const header = h('thead', [h('tr', [h('th', model["profileid"]), ])]);
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
            h('div', [
                h('i-variant', {attrs: {"data-icon": VARIANTS[game["v"]].icon}, class: {"icon": true}} ),
                h('tc', game["b"] + "+" + game["i"] + " • Casual • " + game["v"])
            ]),
            h('div', [
                h('player', [
                    h('a.user-link', {attrs: {href: '/@/' + game["us"][0]}}, game["us"][0]),
                ]),
                h('vs', '-'),
                h('player', [
                    h('a.user-link', {attrs: {href: '/@/' + game["us"][1]}}, game["us"][1]),
                ]),
            ]),
            h('div.info-result', game["r"]),
            h('div.info-date', game["d"]),
        ])
        ])
        );
    return [header, h('tbody', rows)];
}

export function profileView(model): VNode[] {
    renderUsername(model["home"], model["username"]);

    var xmlhttp = new XMLHttpRequest();
    var url = model["home"] + "/api/" + model["profileid"] +"/games";

    xmlhttp.onreadystatechange = function() {
      if (this.readyState == 4 && this.status == 200) {
        var myArr = JSON.parse(this.responseText);
        myFunction(myArr);
      }
    };
    xmlhttp.open("GET", url, true);
    xmlhttp.send();

    function myFunction(arr) {
        const oldVNode = document.getElementById('games');
        console.log(arr);
        if (oldVNode instanceof Element) {
            patch(oldVNode as HTMLElement, h('table#games', renderGames(model, arr)));
        }
    }

    console.log(model);
    return [h('aside.sidebar-first'),
            h('main.main', [h('table#games')]),
            h('aside.sidebar-second'),
        ];
}
