import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

const patch = init([klass, attributes, properties, listeners]);

import h from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';

import { Chessground } from 'chessgroundx';

import { VARIANTS, usi2uci, grand2zero } from './chess';
import { setBoardAndPieceStyles } from './settings';

function renderGame(model, games, game, fen, lastMove) {
    return h('minigame#' + game.gameId + '.' + game.variant + '-board.' + VARIANTS[game.variant].pieces,
                { on: { click: () => { window.location.assign(model["home"] + '/' + game.gameId); } } },
                [
                h('div', game.b),
                h('div.cg-wrap.' + VARIANTS[game.variant].cg + '.mini',
                    { hook: { insert: (vnode) => {
                        const cg = Chessground(vnode.elm as HTMLElement, {
                            fen: fen,
                            lastMove: lastMove,
                            geometry: VARIANTS[game.variant].geom,
                            coordinates: false,
                            viewOnly: true
                            });
                        games[game.gameId] = cg;
                     }}}),
                h('div', game.w),
                ]
            )
}


export function gamesView(model): VNode[] {
    setBoardAndPieceStyles();

    var xmlhttp = new XMLHttpRequest();
    var url = model["home"] + "/api/games";

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
        var games = {};
        if (oldVNode instanceof Element) {
            patch(oldVNode as HTMLElement, h('grid-container#games', arr.map((game) => renderGame(model, games, game, game.fen, game.lastMove))));

            var evtSource = new EventSource(model["home"] + "/api/ongoing");
            evtSource.onmessage = function(event) {
                const message = JSON.parse(event.data);

                const game = arr.find((g) => g.gameId === message.gameId);
                const cg = games[message.gameId];

                const parts = message.fen.split(" ");
                var lastMove = message.lastMove;
                if (lastMove !== null) {
                    if (game.variant.endsWith('shogi')) {
                        lastMove = usi2uci(lastMove);
                    } else if (game.variant.startsWith('grand') || game.variant === 'shako') {
                        lastMove = grand2zero(lastMove);
                    }
                    lastMove = [lastMove.slice(0,2), lastMove.slice(2,4)];
                }
                if (lastMove !== null && lastMove[0][1] === '@') lastMove = [lastMove[1]];
                cg.set({
                    fen: parts[0],
                    lastMove: lastMove,
                });
            }
        }
    }

    return [h('aside.sidebar-first'),
            h('main.games', [h('grid-container#games')]),
            h('aside.sidebar-second'),
        ];
}
