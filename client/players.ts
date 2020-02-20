import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

const patch = init([klass, attributes, properties, listeners]);

import h from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';

import { renderUsername } from './user';


function renderPlayers(players) {
    var rows = players.map(
        (player) => h('tr', [
            h('td.player-data', [
                h('i-side.online', {class: {"icon": true, "icon-online": player["online"], "icon-offline": !player["online"]}}),
                h('player', [
                    h('a.user-link', {attrs: {href: '/@/' + player["_id"]}}, [
                        h('player-title', " " + player["title"] + " "),
                        player["_id"],
                    ]),
                ]),
            ])
        ])
        );
    return rows;
}

function renderAllPlayers(players) {
    return [
        h('thead', [h('tr', [h('th', 'Online'), ])]), h('tbody', renderPlayers(players.filter((player) => player["online"]))),
        h('hr'),
        h('thead', [h('tr', [h('th', 'Offline'), ])]), h('tbody', renderPlayers(players.filter((player) => !player["online"])))
    ];
}

export function playersView(model): VNode[] {
    renderUsername(model["username"]);

    var xmlhttp = new XMLHttpRequest();
    var url = model["home"] + "/api/players";

    xmlhttp.onreadystatechange = function() {
      if (this.readyState == 4 && this.status == 200) {
        var myArr = JSON.parse(this.responseText);
        myFunction(myArr);
      }
    };
    xmlhttp.open("GET", url, true);
    xmlhttp.send();

    function myFunction(arr) {
        const oldVNode = document.getElementById('players');
        console.log(arr);
        if (oldVNode instanceof Element) {
            patch(oldVNode as HTMLElement, h('table#players', renderAllPlayers(arr)));
        }
    }

    console.log(model);
    return [h('table#players')];
}
