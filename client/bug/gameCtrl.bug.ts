import * as cg from "chessgroundx/types";
import * as util from "chessgroundx/util";
import AnalysisControllerBughouse from "./analysisCtrl.bug";
import { GameController} from "../gameCtrl";
import { BugBoardName, PyChessModel } from "../types";
import { RoundControllerBughouse } from "./roundCtrl.bug";
import { premove } from "chessgroundx/premove";
import { predrop } from "chessgroundx/predrop";
import { uci2LastMove } from "@/chess";

export class GameControllerBughouse extends GameController {

    partnerCC: GameControllerBughouse;
    parent: AnalysisControllerBughouse | RoundControllerBughouse;
    localAnalysis: boolean = false;

    isCheck: boolean;
    lastmove: cg.Orig[] | undefined;

    constructor(el: HTMLElement,elPocket1: HTMLElement,elPocket2: HTMLElement, boardName: BugBoardName, model: PyChessModel) {
        super(el, model, boardName === "a" ? model.fen.split(" | ")[0]: model.fen.split(" | ")[1], elPocket1, elPocket2, boardName);
        this.setGround();
        this.mycolor = 'white';
    }

    doSendMove(move: string) {
        this.ply++;
        this.parent.sendMove(this, move);
    }


    onUserDrop = (piece: cg.Piece, dest: cg.Key, meta: cg.MoveMetadata) => {
        console.log(piece, dest, meta);
        this.preaction = meta.premove;
        this.sendMove(util.dropOrigOf(piece.role), dest, '')
        this.preaction = false;
    }

    onSelect = () => {
        return (key: cg.Key) => {
            console.log(key);
        }
    }

    performPremove = () => {
        // const { orig, dest, meta } = this.premove;
        // todo: once premove+promotion bug is fixed for regular variants, apply here as well
        // console.log("performPremove()", orig, dest, meta);
        this.chessground.playPremove();
    }

    onUserMove = (orig: cg.Key, dest: cg.Key, meta: cg.MoveMetadata) => {
        console.log(orig, dest, meta);

        this.preaction = meta.premove;
        // chessground doesn't knows about ep, so we have to remove ep captured pawn
        const pieces = this.chessground.state.boardState.pieces;
        // console.log("ground.onUserMove()", orig, dest, meta);
        let moved = pieces.get(dest);
        // Fix king to rook 960 castling case
        if (moved === undefined) moved = {role: 'k-piece', color: this.mycolor} as cg.Piece;
        //en - passant logic
        this.performEnPassant(meta, moved, orig, dest, pieces, this.chessground, this.variant, this.mycolor);

        if (meta.captured === undefined && moved !== undefined && moved.role === "p-piece" && orig[0] !== dest[0] && this.variant.rules.enPassant) {
            const pos = util.key2pos(dest),
                pawnPos: cg.Pos = [pos[0], pos[1] + (this.mycolor === 'white' ? -1 : 1)];
            const diff: cg.PiecesDiff = new Map();
            diff.set(util.pos2key(pawnPos), undefined);
            this.chessground.setPieces(diff);
            meta.captured = {role: "p-piece", color: moved.color === "white"? "black": "white"/*or could get it from pieces[pawnPos] probably*/};
        }

        // increase partner's pocket count
        // important only during gap before we receive board message from server and reset whole FEN (see also onUserDrop)
        if (meta.captured) {
            const role = meta.captured.promoted? "p-piece": meta.captured.role;
            const pocketPartner = this.partnerCC.chessground.state.boardState.pockets![meta.captured.color];
            if (!pocketPartner.has(role)) {
                pocketPartner.set(role, 0);
            }
            pocketPartner.set(role, pocketPartner.get(role)! + 1);
            // update fen of partner board:
            const partnerFenFromFFish = this.partnerCC.ffishBoard.fen();
            // we updated pocket model, so now chessground returns correct new fen with updated pockets:
            const partnerFenFromCG = this.partnerCC.chessground.getFen();
            const partnerFenFromCGPocketsPart = partnerFenFromCG.match(/\[.*\]/)![0]; // how the pocket should look like
            // todo: don't remember if there was any reason for not just using the fen from chessground directly instead
            //       of replacing the pockets in the ffish fen
            const partnerFenFromFFishNewPockets = partnerFenFromFFish.replace(/\[.*\]/,partnerFenFromCGPocketsPart);
            this.partnerCC.setState(partnerFenFromFFishNewPockets, this.partnerCC.turnColor, this.partnerCC.lastmove);
            this.partnerCC.chessground.state.dom.redraw();
        } else {
        }
        this.processInput(moved, orig, dest, meta);
        this.preaction = false;
    }

    private setPremove = (orig: cg.Orig, dest: cg.Key, metadata?: cg.SetPremoveMetadata) => {
        this.premove = { orig, dest, metadata };
        // console.log("setPremove() to:", orig, dest, meta);
    }

    private unsetPremove = () => {
        this.premove = undefined;
        this.preaction = false;
    }

    setState = (fen: cg.FEN, turnColor: cg.Color, move: cg.Orig[] | undefined) => {
        this.fullfen = fen;

        // this is used by clocks to prevent sending "flag" message by flagCallback when turnColor == oppcolor
        this.turnColor = turnColor;

        this.lastmove = move;
        this.ffishBoard.setFen(this.fullfen);
        this.isCheck = this.ffishBoard.isCheck();
        this.setDests();
    }

    pushMove = (move: string) => {
        this.ffishBoard.push(move);

        this.fullfen = this.ffishBoard.fen(this.variant.ui.showPromoted, 0);
        const parts = this.fullfen.split(" ");
        this.turnColor = parts[1] === "w" ? "white" : "black";
        this.lastmove = uci2LastMove(move);
        this.isCheck = this.ffishBoard.isCheck();
        this.setDests();
    }

    getFFishPly = () => {
        console.log(">>>>>>>>>>>>>>>>>>>>>")
        console.log(this.partnerCC.ffishBoard.moveStack().split(' '));
        console.log(this.ffishBoard.moveStack().split(' '));
        return this.ffishBoard.moveStack().split(' ').length;
    }

    hasNoMoves = () => {
        return this.ffishBoard.moveStack().split(' ')[0] === '';
    }

    san = (move: string): string => {
        return this.ffishBoard.sanMove(move, this.notationAsObject);
    }

    sanSAN = (move: string): string => {
        return this.ffishBoard.sanMove(move);
    }

    renderState = () => {
        this.chessground.set({
            fen: this.fullfen,
            turnColor: this.turnColor,
            check: this.isCheck,
            lastMove: this.lastmove,
        });
    }

    setGround = () => {
        //TODO: There already is initialization of chessground in the parent class, but might require some changes to it
        //      to decouple from model object and pass custom fens, etc. Ideally below initialization should happen there as well
        this.chessground.set({
            movable: {
                free: false,
                color: 'white',
                events: {
                    after: this.onUserMove,
                    afterNewPiece: this.onUserDrop,
                }
            },
            premovable: {
                enabled: true,
                premoveFunc: premove(this.variant.name, this.chess960, this.variant.board.dimensions),
                predropFunc: predrop(this.variant.name, this.variant.board.dimensions),
                events: {
                    set: this.setPremove,
                    unset: this.unsetPremove,
                }
            },
            events: {
                move: this.onMove(),
                dropNewPiece: this.onDrop(),
                select: this.onSelect(),
            },
        });
    }

    toggleSettings(): void {
    }

}


