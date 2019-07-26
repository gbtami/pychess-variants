import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

const patch = init([klass, attributes, properties, listeners]);

import h from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';

import { renderUsername } from './user';


function renderGames(model, games) {
    const header = h('thead', [h('tr',
        [h('th', 'Game'),
         h('th', 'Date'),
         h('th', 'Players'),
         ])]);
    var rows = games.map((game) => h(
        'tr',
        { on: { click: () => {
            console.log(game);
            window.location.assign(model["home"] + '/' + game["_id"]);
            } } },
        [h('td', game["_id"]),
         h('td', game["d"]),
         h('td', game["us"][0]),
         h('td', game["us"][1]),
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
            patch(oldVNode as HTMLElement, h('div#games', renderGames(model, arr)));
        }
    }

    console.log(model);
    return [h('aside.sidebar-first'),
            h('main.main', [h('div#games')]),
            h('aside.sidebar-second'),
            h('under-left'),
            h('under-lobby'),
            h('under-right'),
        ];
}
