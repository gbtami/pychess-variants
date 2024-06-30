import * as cg from 'chessgroundx/types';

import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';

import { PyChessModel } from "./types";
import { RoundController } from '@/roundCtrl';
import { moveDests, CGMove, uci2cg, UCIMove } from './chess';


export class RoundControllerAlice extends RoundController {
    board: 0 | 1;
    boards: [Chess, Chess];
    fens: [string, string];

    constructor(el: HTMLElement, model: PyChessModel) {
        super(el, model);
        this.board = 0;
        this.fens = this.fullfen.split(' | ');
        console.log("CONSTRUCTOR this.fens");
        console.log(this.fens);
    }

    goPly = (ply: number, plyVari = 0) => {
        this.board = 0;
        super.goPly(ply, plyVari);
    }

    getLegalAliceMoves() {
        console.log('getLegalMoves()');
        this.ffishBoard.setFen(this.fens[0]);
        const moves_0 = this.ffishBoard.legalMoves().split(" ");
        // const pseudo_legal_moves_0 = [uci for uci in moves_0 if self.boards[1].piece_at(chess.Move.from_uci(uci).to_square) is None]
        console.log('--- on board 0', moves_0);

        this.ffishBoard.setFen(this.fens[1]);
        const moves_1 = this.ffishBoard.legalMoves().split(" ")
        // const pseudo_legal_moves_1 = [uci for uci in moves_1 if self.boards[0].piece_at(chess.Move.from_uci(uci).to_square) is None]
        console.log('--- on board 1', moves_1);

        // return pseudo_legal_moves_0 + pseudo_legal_moves_1
        return (this.board === 0) ? moves_0 : moves_1;
    }

    legalMoves(): CGMove[] {
        return this.getLegalAliceMoves().map(uci2cg) as CGMove[];
    }

    switchAliceBoards() {
        this.board = 1 - this.board;
        console.log('switchAliceBoards()', this.fullfen);
        this.fens = this.fullfen.split(' | ');
        const fen = this.fens[this.board];

        const parts = fen.split(" ");
        const fen_placement: cg.FEN = parts[0];
        console.log('switchAliceBoards()', this.board, fen_placement);

        if (this.spectator) {
            this.chessground.set({
                fen: fen_placement,
                movable: { color: undefined },
                // TODO:
                //check: msg.check,
                //lastMove: lastMove,
            });
        } else {
            if (this.turnColor === this.mycolor) {
                const latestPly = this.ply === this.steps.length - 1;
                if (latestPly) {
                    const legalMoves = this.getLegalAliceMoves();
                    const fakeDrops = false;
                    const pieces = this.chessground.state.boardState.pieces;

                    const dests = moveDests(legalMoves as UCIMove[], fakeDrops, pieces, this.turnColor);
                    console.log('DESTS=', dests);
                    this.chessground.set({
                        fen: fen_placement,
                        movable: {
                            dests: dests,
                            free: false,
                            color: this.mycolor,
                        },
                    });
                } else {
                    this.chessground.set({
                        fen: fen_placement,
                    });
                }
            } else {
                this.chessground.set({
                    fen: fen_placement,
                });
            }
        }
    }
}
