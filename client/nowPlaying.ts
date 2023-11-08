import { h } from 'snabbdom';

import { Chessground } from 'chessgroundx';
import { Api } from "chessgroundx/api";
import * as cg from "chessgroundx/types";

import { patch } from './document';
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

export function handleOngoingGameEvents(username: string, cgMap: {[gameId: string]: Api}) {
    const evtSource = new EventSource("/api/ongoing");
    evtSource.onmessage = function(event) {
        const message = JSON.parse(event.data);
        if (!(message.gameId in cgMap)) return;

        const cg = cgMap[message.gameId];
        cg.set({
            fen: message.fen,
            lastMove: uci2LastMove(message.lastMove),
        });
        const isMyTurn = message.tp === username;
        patch(document.querySelector(`a[href='${message.gameId}'] .indicator`) as HTMLElement,
            h('span.indicator', ''),
        );
        patch(document.querySelector(`a[href='${message.gameId}'] .indicator`) as HTMLElement,
            corrClockIndicator(isMyTurn, message.date),
        );
        const noreadEl = document.querySelector('span.noread') as HTMLElement;
        const diff = isMyTurn ? 1 : -1;
        const count = parseInt(noreadEl.dataset.count || '0') + diff;
        patch(noreadEl, h('span.noread.data-count', {attrs: { 'data-count': count }}));
    }
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

function corrClockIndicator(isMyTurn:boolean, date: string) {
    return h('span.indicator', isMyTurn ? timer(date) : h('span', '\xa0')) // &nbsp;
}

export function compareGames(username: string) {
    return function(a: Game, b: Game) {
        const aIsUserTurn = (a.tp === username);
        const bIsUserTurn = (b.tp === username);
        if (aIsUserTurn && !bIsUserTurn) return -1;
        if (!aIsUserTurn && bIsUserTurn) return 1;
        if (a.mins < b.mins) return -1;
        if (a.mins > b.mins) return 1;
        return 0;
    };
}

export function gameViewPlaying(cgMap: {[gameId: string]: Api}, game: Game, username: string) {
    const variant = VARIANTS[game.variant];
    const isMyTurn = game.tp === username;
    const opp = (username === game.w) ? game.b : game.w;
    const mycolor = (username === game.w) ? 'white' : 'black';
    return h(`a.${variant.boardFamily}.${variant.pieceFamily}`, { attrs: { href: game.gameId } }, [
        h(`div.cg-wrap.${variant.board.cg}`, {
            hook: {
                insert: vnode => {
                    const cg = Chessground(vnode.elm as HTMLElement, {
                        orientation: mycolor,
                        fen: game.fen,
                        lastMove: uci2LastMove(game.lastMove),
                        dimensions: variant.board.dimensions,
                        coordinates: false,
                        viewOnly: true,
                        pocketRoles: variant.pocket?.roles,
                    });
                    cgMap[game.gameId] = cg;
                }
            }
        }),
        h('span.vstext', [
            h('span', opp),
            corrClockIndicator(isMyTurn, game.date),
        ]),
    ]);
}
