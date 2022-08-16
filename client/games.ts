import { h, VNode } from 'snabbdom';

import { Api } from "chessgroundx/api";
import * as cg from "chessgroundx/types";
import { Chessground } from 'chessgroundx';

import { VARIANTS, uci2LastMove } from './chess';
import { boardSettings } from './boardSettings';
import { patch } from './document';
import { timeControlStr } from './view';
import { PyChessModel } from "./types";
import {aiLevel} from './result';

export interface Game {
    gameId: string;
    variant: string;
    chess960: boolean;
    base: number;
    inc: number;
    byoyomi: number;
    b: string;
    bTitle: string;
    w: string;
    wTitle: string;
    level: number;
    fen: cg.FEN;
    lastMove: cg.Move;
}

function gameView(games: {[gameId: string]: Api}, game: Game, fen: cg.FEN, lastMove: cg.Move) {
    const variant = VARIANTS[game.variant];
    return h(`minigame#${game.gameId}.${variant.board}.${variant.piece}`, {
        class: {
            "with-pockets": variant.drop,
            "smaller-text": game.bTitle == "BOT",
        },
        on: { click: () => window.location.assign('/' + game.gameId) }
    }, h('div', [
        h('div.row', [
            h('div.variant-info', [
                h('div.icon', { props: { title: variant.displayName(game.chess960) }, attrs: { "data-icon": variant.icon(game.chess960) } }),
                h('div.tc', timeControlStr(game.base, game.inc, game.byoyomi)),
            ]),
            h('div.name', [
                h('player-title', " " + game.bTitle + " "),
                game.b + aiLevel(game.bTitle, game.level)
            ]),
        ]),
        h(`div.cg-wrap.${variant.cg}.mini`, {
            hook: {
                insert: vnode => {
                    const cg = Chessground(vnode.elm as HTMLElement, {
                        fen: fen,
                        lastMove: lastMove,
                        dimensions: variant.boardDimensions,
                        coordinates: false,
                        viewOnly: true,
                        addDimensionsCssVarsTo: document.documentElement,
                        pocketRoles: variant.pocketRoles,
                    });
                    games[game.gameId] = cg;
                }
            }
        }),
        h('div.name', [
            h('player-title', " " + game.wTitle + " "),
            game.w + aiLevel(game.wTitle, game.level)
        ]),
    ]));
}

export function renderGames(model: PyChessModel): VNode[] {
    boardSettings.assetURL = model.assetURL;
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
                    cg.set({
                        fen: message.fen,
                        lastMove: uci2LastMove(message.lastMove),
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
