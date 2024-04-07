import {Api} from "chessgroundx/api";
import * as cg from "chessgroundx/types";
import {Chessground} from "chessgroundx";
import {VARIANTS, BOARD_FAMILIES} from "../variants"
import * as util from "chessgroundx/util";
import AnalysisControllerBughouse from "./analysisCtrl.bug";
import {GameController} from "../gameCtrl";
import {PyChessModel} from "../types";
import {RoundControllerBughouse} from "./roundCtrl.bug";
import {premove} from "chessgroundx/premove";
import {predrop} from "chessgroundx/predrop";
import {uci2LastMove} from "@/chess";

export class GameControllerBughouse extends GameController {

    partnerCC: GameControllerBughouse;
    parent: AnalysisControllerBughouse | RoundControllerBughouse;
    boardName: 'a' | 'b';
    localAnalysis: boolean = false;

    constructor(el: HTMLElement,elPocket1: HTMLElement,elPocket2: HTMLElement, boardName: 'a' | 'b', model: PyChessModel) {
        super(el, model,elPocket1,elPocket2);
        this.boardName = boardName;
        const fens = model.fen.split(" | ");
        this.fullfen = this.boardName === "a" ? fens[0]: fens[1];
        this.chessground = this.createGround(el, elPocket1, elPocket2, this.fullfen);
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
        // TODO: NIKI: promotion on premove currently not working correctly - it shows the dialog once the premove is executed and not when it is declared. Also probably doesnt respect the config for auto-promot
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

            if (this.partnerCC.chessground.state.boardState.pockets) {
                // update pocket mode of partner board:
                const pocket = this.partnerCC.chessground.state.boardState.pockets[meta.captured.color];
                if (!pocket.has(role)) {
                    pocket.set(role, 0);
                }
                pocket.set(role, pocket.get(role)! + 1);
                // update fen of partner board:
                let ff = this.partnerCC.ffishBoard.fen();
                const f1 = this.partnerCC.chessground.getFen(); // we updated pocket model, so now chessground returns correct new fen with updated pockets
                const fenPocket = f1.match(/\[.*\]/)![0]; // how the pocket should look like
                this.partnerCC.fullfen=ff.replace(/\[.*\]/,fenPocket);
                this.partnerCC.ffishBoard.setFen(this.partnerCC.fullfen);//todo:niki:hope it doesnt break anything this way. ply number i think is not correct now?
                this.partnerCC.setDests(); // partner dests refresh needed for analysis and simul mode

                this.partnerCC.chessground.state.dom.redraw(); // TODO: see todo comment also at same line in onUserDrop.
            }
        } else {
        }
        this.processInput(moved, orig, dest, meta);; //if (!this.promotion.start(moved.role, orig, dest, meta.thisKey)) this.sendMove(orig, dest, '');
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

    setState = (fen: cg.FEN, turnColor: cg.Color, move: cg.Orig[]) => {
        this.fullfen = fen;
        this.turnColor = turnColor;//todo: probably not needed here and other places as well where its set
        this.lastmove = move;
        if (this.ffishBoard) { //TODO:NIKI: if this ffishboard object is one and the same, maybe move it to some global place instead of associating it to board
            this.ffishBoard.setFen(this.fullfen);
            this.isCheck = this.ffishBoard.isCheck();
            this.setDests();
        } else {
            console.error("ffishBoard not initialized yet");
        }
    }

    pushMove = (move: string) => {
        this.ffishBoard.push(move);

        this.fullfen = this.ffishBoard.fen(VARIANTS['bughouse'].ui.showPromoted, 0);
        const parts = this.fullfen.split(" ");
        this.turnColor = parts[1] === "w" ? "white" : "black";
        this.lastmove = uci2LastMove(move);
        this.isCheck = this.ffishBoard.isCheck();
        this.setDests();
    }

    renderState = () => {
        this.chessground.set({
            fen: this.fullfen,
            turnColor: this.turnColor,
            check: this.isCheck,
            lastMove: this.lastmove,
        });
    }

    createGround = (el: HTMLElement, pocket0:HTMLElement|undefined, pocket1:HTMLElement|undefined, fullfen: string): Api => {
        //TODO:NIKI: this initialization happens over another construction of chessground object in cgCtrl the value of which is overwritten wit this one. can we somehow avoid this?
        const parts = fullfen.split(" ");
        const fen_placement: cg.FEN = parts[0];

        const chessground = Chessground(el, {
             fen: fen_placement as cg.FEN,
             dimensions: BOARD_FAMILIES.standard8x8.dimensions,
             notation: cg.Notation.ALGEBRAIC,
             orientation: 'white',//todo:niki
             turnColor: 'white',//todo:niki
             animation: {
                 enabled: localStorage.animation === undefined || localStorage.animation === "true",
             },
             addDimensionsCssVarsTo: this.boardName === 'a'? document.body: undefined, // todo:niki, i was hoping this check will result in only setting those variables once by first board, this avoiding that loop of resizing that happens but i guess not enough
             pocketRoles: VARIANTS.crazyhouse.pocket?.roles,
        }, pocket0, pocket1);

        chessground.set({
            animation: { enabled: false },
            movable: {
                free: false,
                color: 'white',
                showDests: localStorage.showDests === undefined || localStorage.showDests === "true",
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

        return chessground;
    }

    toggleSettings(): void {
    }

}


