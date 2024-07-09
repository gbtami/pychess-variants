import { PyChessModel } from "./types";
import { RoundController } from '@/roundCtrl';
import { moveDests, CGMove, uci2cg, UCIMove } from './chess';
import { MsgBoard } from './messages';
import { AliceBoard, BoardId, Fens } from './alice'; 


export class RoundControllerAlice extends RoundController {
    boardId: BoardId;
    unionFens: Fens;
    check: boolean;

    constructor(el: HTMLElement, model: PyChessModel) {
        super(el, model);
        this.boardId = 0;
    }

    goPly = (ply: number, plyVari = 0) => {
        //this.boardId = 0;
        super.goPly(ply, plyVari);

        const aliceBoard = new AliceBoard(this.fullfen, this.ffishBoard);
        this.check = aliceBoard.check;
        this.unionFens = [aliceBoard.getUnionFen(0), aliceBoard.getUnionFen(1)];
        const unionFen = this.unionFens[this.boardId ?? 0];

        this.chessground.set({
            animation: { enabled: false },
            check: (this.check) ? this.turnColor : false,
            fen: unionFen,
        });
    }

    onMsgBoard = (msg: MsgBoard) => {
        this.boardId = 0;
        super.onMsgBoard(msg);
    }

    setDests() {
        console.log("roundCtrlAlice.setDests()");
        const aliceBoard = new AliceBoard(this.fullfen, this.ffishBoard);
        this.check = aliceBoard.check;

        this.unionFens = [aliceBoard.getUnionFen(0), aliceBoard.getUnionFen(1)];
        const unionFen = this.unionFens[this.boardId ?? 0];

        const legalMoves = aliceBoard.getLegalAliceMoves();
        const fakeDrops = false;
        const pieces = this.chessground.state.boardState.pieces;

        const dests = moveDests(legalMoves as UCIMove[], fakeDrops, pieces, this.turnColor);
        this.chessground.set({
            fen: unionFen,
            check: (this.check) ? this.turnColor : false,
            movable: { dests: dests } 
        });
    }

    legalMoves(): CGMove[] {
        const aliceBoard = new AliceBoard(this.fullfen, this.ffishBoard);
        return aliceBoard.getLegalAliceMoves().map(uci2cg) as CGMove[];
    }

    switchAliceBoards(): void {
        this.boardId = 1 - this.boardId as BoardId;
        const unionFen = this.unionFens[this.boardId ?? 0];
        this.chessground.set({
            animation: { enabled: false },
            check: (this.check) ? this.turnColor : false,
            fen: unionFen,
        });
    }
}
