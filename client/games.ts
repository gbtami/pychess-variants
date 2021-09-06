import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

const patch = init([klass, attributes, properties, listeners]);

import h from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';

import { Chessground } from 'chessgroundx';

import { VARIANTS, uci2cg } from './chess';
import { boardSettings } from './boardSettings';
import { timeControlStr } from './view';
import { Api } from "chessgroundx/api";
import { FEN, Key } from "chessgroundx/types";

export interface Game{
    gameId: string;
    variant: string;
    chess960: boolean;
    base: number;
    inc: number;
    byoyomi: number;
    b: string;
    w: string;
    fen: FEN;
    lastMove: Key[];
}

function gameView(games: {[gameId: string]: Api}, game: Game, fen: FEN, lastMove: Key[]) {
    const variant = VARIANTS[game.variant];
    return h(`minigame#${game.gameId}.${variant.board}.${variant.piece}`, {
        on: { click: () => window.location.assign('/' + game.gameId) }
    }, h('div', [
        h('div.row', [
            h('div.variant-info', [
                h('div.icon', { props: { title: variant.displayName(game.chess960) }, attrs: { "data-icon": variant.icon(game.chess960) } }),
                h('div.tc', timeControlStr(game.base, game.inc, game.byoyomi)),
            ]),
            h('div.name', game.b),
        ]),
        h(`div.cg-wrap.${variant.cg}.mini`, {
            hook: {
                insert: vnode => {
                    const cg = Chessground(vnode.elm as HTMLElement, {
                        fen: fen,
                        lastMove: lastMove,
                        geometry: variant.geometry,
                        coordinates: false,
                        viewOnly: true
                    });
                    games[game.gameId] = cg;
                }
            }
        }),
        h('div.name', game.w),
    ]));
}

export function renderGames(): VNode[] {
    boardSettings.updateBoardAndPieceStyles();

    const xmlhttp = new XMLHttpRequest();
    const url = "/api/games";

    xmlhttp.onreadystatechange = function() {
        if (this.readyState === 4 && this.status === 200) {
            const response = JSON.parse(this.responseText);
            const oldVNode = document.getElementById('games');
            const games: {[gameId: string]: Api} = {};
            if (oldVNode instanceof Element) {
                patch(oldVNode as HTMLElement, h('grid-container#games', response.map((game: Game) => gameView(games, game, game.fen, game.lastMove))));

                const evtSource = new EventSource("/api/ongoing");
                evtSource.onmessage = function(event) {
                    const message = JSON.parse(event.data);

                    const cg = games[message.gameId];

                    const parts = message.fen.split(" ");
                    let lastMove = message.lastMove;
                    if (lastMove !== null) {
                        lastMove = uci2cg(lastMove);
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
