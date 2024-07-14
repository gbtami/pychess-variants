import { h } from 'snabbdom';

import { PyChessModel } from "./types";
import { AnalysisController } from '@/analysisCtrl';
import { moveDests, CGMove, uci2cg, uci2LastMove, UCIMove } from './chess';
import { MsgBoard } from './messages';
import { AliceBoard, BoardId, Fens } from './alice'; 
import { createMovelistButtons, updateMovelist, selectMove, activatePlyVari } from './movelist';
import { patch } from './document';


export class AnalysisControllerAlice extends AnalysisController {
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
        this.setDests();
    }

    onMsgBoard = (msg: MsgBoard) => {
        this.boardId = 0;
        super.onMsgBoard(msg);
    }

    doSendMove(move: string) {
        const aliceBoard = new AliceBoard(this.fullfen, this.ffishBoard);

        const san = this.ffishBoard.sanMove(move, this.notationAsObject);
        const sanSAN = this.ffishBoard.sanMove(move);
        const vv = this.steps[this.plyVari]?.vari;

        // Instead of sending moves to the server we can get new FEN and dests from ffishjs
        //this.ffishBoard.push(move);
        //const fen = this.ffishBoard.fen();
        this.fullfen = aliceBoard.getFen(move);
        this.check = aliceBoard.check;
        const unionFen = aliceBoard.getUnionFen(this.fullfen, this.boardId ?? 0);

        console.log('ITT', move, this.fullfen, unionFen);
        const parts = this.fullfen.split(" ");
        // turnColor have to be actualized before setDests() !!!
        this.turnColor = parts[1] === "w" ? "white" : "black";

        this.setDests();
        console.log('ITT0', move, this.fullfen);

        const newPly = this.ply + 1;

        const msg : MsgAnalysisBoard = {
            gameId: this.gameId,
            fen: this.fullfen,
            unionfen: unionFen,
            ply: newPly,
            lastMove: move,
            check: this.check,
        }

        this.onMsgAnalysisBoard(msg);
        console.log('ITT1', move, this.fullfen);

        const step = {
            'fen': this.fullfen,
            'move': msg.lastMove,
            'check': msg.check,
            'turnColor': this.turnColor,
            'san': san,
            'sanSAN': sanSAN,
            };

        const ffishBoardPly = this.ffishBoard.moveStack().split(' ').length;
        const moveIdx = (this.plyVari === 0) ? this.ply : this.plyInsideVari;
        // New main line move
        if (moveIdx === this.steps.length && this.plyVari === 0) {
            this.steps.push(step);
            this.ply = this.steps.length -1;
            updateMovelist(this);

            this.checkStatus(msg);
        // variation move
        } else {
            // possible new variation move
            if (ffishBoardPly === 1) {
                if (this.ply < this.steps.length && msg.lastMove === this.steps[this.ply].move) {
                    // existing main line played
                    selectMove(this, this.ply);
                    return;
                }
                // new variation starts
                if (vv === undefined) {
                    this.plyVari = this.ply;
                    this.steps[this.plyVari]['vari'] = [];
                } else {
                    // variation in the variation: drop old moves
                    if ( vv ) {
                        this.steps[this.plyVari]['vari'] = vv.slice(0, ffishBoardPly - this.plyVari);
                    }
                }
            }
            // continuing the variation
            if (this.steps[this.plyVari].vari !== undefined) {
                this.steps[this.plyVari]?.vari?.push(step);
            };

            const full = true;
            const activate = false;
            updateMovelist(this, full, activate);
            if (vv) {
                activatePlyVari(this.plyVari + vv.length - 1);
            } else if (vv === undefined && this.plyVari > 0) {
                activatePlyVari(this.plyVari);
            }
        }
        console.log('ITT2', move, this.fullfen);

        const idxInVari = (this.plyVari > 0) && vv ? vv.length - 1 : 0;
        this.updateUCImoves(idxInVari);
        if (this.localAnalysis) this.engineGo();

        if (!this.puzzle) {
            const e = document.getElementById('fullfen') as HTMLInputElement;
            e.value = this.fullfen;

            if (this.isAnalysisBoard || this.result == "*") {
                this.vpgn = patch(this.vpgn, h('div#pgntext', this.getPgn(idxInVari)));
            }
        }

        console.log('OTT', move, this.fullfen);

        // TODO: But sending moves to the server will be useful to implement shared live analysis!
        // this.doSend({ type: "analysis_move", gameId: this.gameId, move: move, fen: this.fullfen, ply: this.ply + 1 });
    }

    private onMsgAnalysisBoard = (msg: MsgAnalysisBoard) => {
        // console.log("got analysis_board msg:", msg);
        if (msg.gameId !== this.gameId) return;
        if (this.localAnalysis) this.engineStop();
        this.clearPvlines();

        this.fullfen = msg.fen;
        this.ply = msg.ply

        const parts = msg.fen.split(" ");
        this.turnColor = parts[1] === "w" ? "white" : "black";

        this.chessground.set({
            fen: msg.unionfen,
            turnColor: this.turnColor,
            lastMove: uci2LastMove(msg.lastMove),
            check: msg.check,
            movable: {
                color: this.turnColor,
            },
        });

        if (this.variant.ui.showCheckCounters) {
            this.updateCheckCounters(this.fullfen);
        }
    }

    setDests() {
        //console.log("roundCtrlAlice.setDests()");
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
        console.log('ITT', this.fullfen);
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
