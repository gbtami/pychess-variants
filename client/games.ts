import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

const patch = init([klass, attributes, properties, listeners]);

import h from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';

import { Chessground } from 'chessgroundx';

import { VARIANTS, grand2zero, isVariantClass } from './chess';
import { boardSettings } from './boardSettings';

function renderGame(games, game, fen, lastMove) {
    return h(`minigame#${game.gameId}.${VARIANTS[game.variant].board}.${VARIANTS[game.variant].piece}`, {
        on: { click: () => window.location.assign('/' + game.gameId) }
    }, [
        h('div', game.b),
        h(`div.cg-wrap.${VARIANTS[game.variant].cg}.mini`, {
            hook: {
                insert: vnode => {
                    const cg = Chessground(vnode.elm as HTMLElement, {
                        fen: fen,
                        lastMove: lastMove,
                        geometry: VARIANTS[game.variant].geometry,
                        coordinates: false,
                        viewOnly: true
                    });
                    games[game.gameId] = cg;
                }
            }
        }),
        h('div', game.w),
    ]);
}

export function gamesView(): VNode[] {
    boardSettings.updateBoardAndPieceStyles();

    const xmlhttp = new XMLHttpRequest();
    const url = "/api/games";

    xmlhttp.onreadystatechange = function() {
        if (this.readyState === 4 && this.status === 200) {
            const response = JSON.parse(this.responseText);
            const oldVNode = document.getElementById('games');
            const games = {};
            if (oldVNode instanceof Element) {
                patch(oldVNode as HTMLElement, h('grid-container#games', response.map(game => renderGame(games, game, game.fen, game.lastMove))));

                const evtSource = new EventSource("/api/ongoing");
                evtSource.onmessage = function(event) {
                    const message = JSON.parse(event.data);

                    const game = response.find(g => g.gameId === message.gameId);
                    const cg = games[message.gameId];

                    const parts = message.fen.split(" ");
                    let lastMove = message.lastMove;
                    if (lastMove !== null) {
                        if (isVariantClass(game.variant, "tenRanks"))
                            lastMove = grand2zero(lastMove);
                        lastMove = [lastMove.slice(0,2), lastMove.slice(2,4)];
                        if (lastMove[0][1] === '@')
                            lastMove = [lastMove[1]];
                    }
                    cg.set({
                        fen: parts[0],
                        lastMove: lastMove,
                    });
                }
            }
        }
    };
    xmlhttp.open("GET", url, true);
    xmlhttp.send();

    return [h('aside.sidebar-first'),
        h('main.games', [h('grid-container#games')]),
        h('aside.sidebar-second'),
    ];
}
