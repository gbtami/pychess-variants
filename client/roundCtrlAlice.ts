import * as cg from 'chessgroundx/types';

import { PyChessModel } from "./types";
import { RoundController } from '@/roundCtrl';
import { moveDests, CGMove, uci2cg, UCIMove } from './chess';
import { MsgBoard } from './messages';
import { AliceBoard, BoardId, Fens } from './alice'; 


export class RoundControllerAlice extends RoundController {
    boardId: BoardId;
//    aliceBoard: AliceBoard;

    constructor(el: HTMLElement, model: PyChessModel) {
        super(el, model);
        this.boardId = 0;
//        this.aliceBoard = AliceBoard(this.fullfen);
    }

    goPly = (ply: number, plyVari = 0) => {
        console.log("roundCtrlAlice.goPly()");
        this.boardId = 0;
        super.goPly(ply, plyVari);
    }

    onMsgBoard = (msg: MsgBoard) => {
        console.log("roundCtrlAlice.onMsgBoard()");
        this.boardId = 0;
        super.onMsgBoard(msg);
    }

    setDests() {
        console.log("!!! Alice setDests()");
        const aliceBoard = new AliceBoard(this.fullfen, this.ffishBoard);
        const legalMoves = aliceBoard.getLegalAliceMoves();
        const fakeDrops = false;
        const pieces = this.chessground.state.boardState.pieces;

        const dests = moveDests(legalMoves as UCIMove[], fakeDrops, pieces, this.turnColor);
        this.chessground.set({ movable: { dests: dests } });
    }

    legalMoves(): CGMove[] {
        console.log("!!! RoundControllerAlice.legalMoves()");
        const aliceBoard = new AliceBoard(this.fullfen, this.ffishBoard);
        return aliceBoard.getLegalAliceMoves().map(uci2cg) as CGMove[];
    }

    switchAliceBoards(): void {
        this.boardId = 1 - this.boardId as BoardId;
        console.log('switchAliceBoards()', this.fullfen);
        const fens = this.fullfen.split(' | ') as Fens;
        const fen = fens[this.boardId];

        const parts = fen.split(" ");
        const fen_placement: cg.FEN = parts[0];
        console.log('switchAliceBoards()', this.boardId, fen_placement);
        this.chessground.set({
            fen: fen_placement,
        });
    }
}
