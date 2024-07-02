import * as cg from 'chessgroundx/types';

import { Position } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseUci } from 'chessops/util';

import { PyChessModel } from "./types";
import { RoundController } from '@/roundCtrl';
import { moveDests, CGMove, uci2cg, UCIMove } from './chess';

type BoardId = 0 | 1;
type Boards = [Chess, Chess];
type Fens = [string, string];


export class RoundControllerAlice extends RoundController {
    board: BoardId;

    constructor(el: HTMLElement, model: PyChessModel) {
        super(el, model);
        this.board = 0;
    }

    goPly = (ply: number, plyVari = 0) => {
        console.log("roundCtrlAlice.goPly()");
        this.board = 0;
        super.goPly(ply, plyVari);
    }

    onMsgBoard = (msg: MsgBoard) => {
        console.log("roundCtrlAlice.onMsgBoard()");
        this.board = 0;
        super.onMsgBoard(msg);
    }

    setDests() {
        console.log("Alice setDests()");
        const legalMoves = this.getLegalAliceMoves();
        const fakeDrops = false;
        const pieces = this.chessground.state.boardState.pieces;

        const dests = moveDests(legalMoves as UCIMove[], fakeDrops, pieces, this.turnColor);
        this.chessground.set({ movable: { dests: dests } });
    }

    getLegalAliceMoves() {
        const fens = this.fullfen.split(' | ') as Fens;

        const setup0 = parseFen(fens[0]).unwrap();
        const setup1 = parseFen(fens[1]).unwrap();

        const pos0 = new Position();
        pos0.reset();
        const pos1 = new Position();
        pos1.reset();

        pos0.setupUnchecked(setup0);
        pos1.setupUnchecked(setup1);

        const boards = [pos0, pos1];
        let pseudo_legal_moves_0, pseudo_legal_moves_1;

        this.ffishBoard.setFen(fens[0]);
        const moves_0 = this.ffishBoard.legalMoves();
        if (moves_0.length > 0) {
            pseudo_legal_moves_0 = moves_0.split(' ').filter(uci => boards[1].board.get(parseUci(uci).to) === undefined);
        } else {
            pseudo_legal_moves_0 = [];
        }

        this.ffishBoard.setFen(fens[1]);
        const moves_1 = this.ffishBoard.legalMoves();
        if (moves_1.length > 0) {
            pseudo_legal_moves_1 = moves_1.split(' ').filter(uci => boards[0].board.get(parseUci(uci).to) === undefined);
        } else {
            pseudo_legal_moves_1 = [];
        }

        //return (this.board === 0) ? pseudo_legal_moves_0 : pseudo_legal_moves_1;
        return pseudo_legal_moves_0.concat(pseudo_legal_moves_1);
    }

    legalMoves(): CGMove[] {
        return this.getLegalAliceMoves().map(uci2cg) as CGMove[];
    }

    switchAliceBoards() {
        this.board = 1 - this.board as BoardId;
        console.log('switchAliceBoards()', this.fullfen);
        const fens = this.fullfen.split(' | ') as Fens;
        const fen = fens[this.board];

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
