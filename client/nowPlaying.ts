import { h } from 'snabbdom';

import { Chessground } from 'chessgroundx';
import * as cg from "chessgroundx/types";

import { uci2LastMove } from './chess';
import { timeago } from './datetime';
import { VARIANTS } from './variants';

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
    lastMove: string;
    tp: string;
    mins: number;
    date: string;
}

function timer(date: string) {
  return h(
    'time.timeago',
    {
      hook: {
        insert(vnode) {
          (vnode.elm as HTMLElement).setAttribute('datetime', '' + date);
        },
      },
    },
    timeago(date),
  );
}

export function gameViewPlaying(game: Game, username: string) {
    const variant = VARIANTS[game.variant];
    const isMyTurn = game.tp === username;
    const opp = (username === game.w) ? game.b : game.w;
    const mycolor = (username === game.w) ? 'white' : 'black';
    return h(`div.${variant.boardFamily}.${variant.pieceFamily}`, {
        on: { click: () => window.location.assign('/' + game.gameId) }
    }, [
        h(`div.cg-wrap.${variant.board.cg}`, {
            hook: {
                insert: vnode => {
                    Chessground(vnode.elm as HTMLElement, {
                        orientation: mycolor,
                        fen: game.fen,
                        lastMove: uci2LastMove(game.lastMove),
                        dimensions: variant.board.dimensions,
                        coordinates: false,
                        viewOnly: true,
                        pocketRoles: variant.pocket?.roles,
                    });
                }
            }
        }),
        h('span.vstext', [
            h('span', opp),
            h(
              'span.indicator',
              isMyTurn
                ? true //game.date && game.lastmove
                  ? timer(game.date)
                  : ['yourTurn']
                : h('span', '\xa0'),
            ), // &nbsp;

        ]),
    ]);
}
