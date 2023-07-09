import {Api} from "chessgroundx/api";
import {GatingInput} from "../input/gating";
import {PromotionInput} from "../input/promotion";
import * as cg from "chessgroundx/types";
import {Chessground} from "chessgroundx";
import {VARIANTS, BOARD_FAMILIES, Variant} from "../variants"
import * as util from "chessgroundx/util";
import AnalysisControllerBughouse from "./analysisCtrl.bug";
import {Step} from "../messages";
import {GameController} from "../gameCtrl";
import {PyChessModel} from "../types";
import {RoundControllerBughouse} from "./roundCtrl.bug";
import {premove} from "chessgroundx/premove";
import {predrop} from "chessgroundx/predrop";
import {boardSettings} from "@/boardSettings";

export class GameControllerBughouse extends GameController {

    partnerCC: GameControllerBughouse;

    gating: GatingInput;
    promotion: PromotionInput;

    mycolor: cg.Color;
    turnColor: cg.Color;// todo: don't think this is ever used as other then temp variable before setting turncolor to CG

    chess960: boolean;
    assetURL: string;

    variant: Variant;

    parent: AnalysisControllerBughouse | RoundControllerBughouse;

    fullfen: cg.FEN;

    preaction: boolean;//todo:niki:where is this used usually?

    ply: number = 0;//todo:niki; only needed for cancel() of promotion.ts and gating.ts. so it can call goPly(which is currently not implemented either) to reset last move
                    //todo:niki: gonna start using it also instead of this.ffishBoard.getPly(), because ply is messed up after calling setFen because of update of pockets after capture

    promotions: string[];//on each turn, it is populated from possible moves that are promotions - todo;niki; should implement the population of this array - currently commented out probably

    boardName: 'a' | 'b';

    steps: Step[];
    localAnalysis: boolean = false;

    constructor(el: HTMLElement,elPocket1: HTMLElement,elPocket2: HTMLElement, boardName: 'a' | 'b', model: PyChessModel) {
        super(el, model,elPocket1,elPocket2);

        this.boardName = boardName;
        const fens = model.fen.split(" | ");
        this.fullfen = this.boardName === "a" ? fens[0]: fens[1];

        this.variant = VARIANTS[model.variant];
        this.chess960 = model.chess960==='True';//todo:niki:i am having second thought if i need this here really 960 should be true/false for both boards, but logically feel the right place here
        this.assetURL = model.assetURL;
        this.chessground = this.createGround(el, elPocket1, elPocket2, this.fullfen);//todo:fullfen is not passed in default logic inherited

        this.gating = new GatingInput(this);
        this.promotion = new PromotionInput(this);

        this.mycolor = 'white';

        // this.result = "*";
        const parts = this.fullfen.split(" ");

        // const fen_placement: cg.FEN = parts[0];
        this.turnColor = parts[1] === "w" ? "white" : "black";

        this.steps = [];
        this.steps.push({//todo:niki:i dont know if some better data structure can be invented to replace the 3 steps lists used now - 2 local for each board and 1 aggregate
            'fen': this.fullfen,
            'fenB': this.fullfen,
            'move': undefined,
            'check': false,
            'turnColor': this.turnColor,
            // 'turnColorB': this.b2.turnColor,
        });

    }

    doSendMove(move: string) {
        // todo;niki; somehting about promotions and stuff. maybe test to see if needs implemenation
    }

    sendMove = (orig: cg.Orig, dest: cg.Key, promo: string) => {
        this.ply++;
        this.parent.sendMove(this, orig, dest, promo);
        //todo:niki:for now just so promotion and gating.ts compile. not sure if this is the right place and what overall design this whole stuff will end up with - aggregation vs inheritance
    }

    onMove = () => {
        return (orig: cg.Key, dest: cg.Key, capturedPiece: cg.Piece) => {
            console.log("   ground.onMove()", orig, dest, capturedPiece);
        }
    }

    onDrop = () => {
        return (piece: cg.Piece, dest: cg.Key) => {
            console.log("ground.onDrop()", piece, dest);
        }
    }

    onUserDrop = (piece: cg.Piece, dest: cg.Key, meta: cg.MoveMetadata) => {
        console.log(piece, dest, meta);
        // onUserDrop(this, role, dest, meta); todo:niki
        this.preaction = meta.premove;
        // // decrease pocket count - todo: covers the gap before we receive board message confirming the move - then FEN is set
        // //                               and overwrites whole board+pocket and refreshes.
        // //                               Maybe consider decrease count on start of drag (like in editor mode)?
        // (this.chessground.state.boardState.pockets![this.chessground.state.turnColor] as Pocket).set(piece.role]! --;
        // this.chessground.state.dom.redraw();
        this.sendMove(util.dropOrigOf(piece.role), dest, '')
        this.preaction = false;
    }

    onSelect = () => {
        return (key: cg.Key) => {
            console.log(key);

            if (this.chessground.state.movable.dests === undefined) return;

            // Save state.pieces to help recognise 960 castling (king takes rook) moves
            // Shouldn't this be implemented in chessground instead?
            // if (this.chess960 && this.variant.gate) {
            //     this.prevPieces = new Map(this.chessground.state.pieces);
            // }todo:niki

            // Janggi pass and Sittuyin in place promotion on Ctrl+click
            if (this.chessground.state.stats.ctrlKey &&
                (this.chessground.state.movable.dests.get(key)?.includes(key))
                ) {
                const piece = this.chessground.state.boardState.pieces.get(key);
                if (this.variant.name === 'sittuyin') { // TODO make this more generic
                    // console.log("Ctrl in place promotion", key);
                    const pieces: cg.PiecesDiff = new Map();
                    pieces.set(key, {
                        color: piece!.color,
                        role: 'f-piece',
                        promoted: true
                    });
                    this.chessground.setPieces(pieces);
                    this.sendMove(key, key, 'f');
                } /*else if (this.variant.pass && piece!.role === 'k-piece') {niki:todo:commenting out because not relevant now - what about long term?
                    this.pass();
                }*/
            }
        }
    }

    performPremove = () => {
        // const { orig, dest, meta } = this.premove;
        // TODO: promotion?
        // console.log("performPremove()", orig, dest, meta);
        this.chessground.playPremove();
    }

    onUserMove = (orig: cg.Key, dest: cg.Key, meta: cg.MoveMetadata) => {
        console.log(orig, dest, meta);
        const ctrl = this;
        ctrl.preaction = meta.premove;
        // chessground doesn't knows about ep, so we have to remove ep captured pawn
        const pieces = ctrl.chessground.state.boardState.pieces;
        // console.log("ground.onUserMove()", orig, dest, meta);
        let moved = pieces.get(dest);
        // Fix king to rook 960 castling case
        if (moved === undefined) moved = {role: 'k-piece', color: ctrl.mycolor} as cg.Piece;
        //en - passant logic todo:niki:maybe move to common place. chess.ts?
        if (meta.captured === undefined && moved !== undefined && moved.role === "p-piece" && orig[0] !== dest[0] && ctrl.variant.rules.enPassant) {
            const pos = util.key2pos(dest),
            pawnPos: cg.Pos = [pos[0], pos[1] + (ctrl.mycolor === 'white' ? -1 : 1)];
            const diff: cg.PiecesDiff = new Map();
            diff.set(util.pos2key(pawnPos), undefined);
            ctrl.chessground.setPieces(diff);
            meta.captured = {role: "p-piece", color: moved.color === "white"? "black": "white"/*or could get it from pieces[pawnPos] probably*/};
        }

        // increase pocket count todo:niki: but now partners pocket
        // important only during gap before we receive board message from server and reset whole FEN (see also onUserDrop)
        if (/*ctrl.variant.drop && todo:not relevant for bughouse - if/when this class becomes generic bring this back maybe*/ meta.captured) {
            const role = meta.captured.promoted? "p-piece": meta.captured.role;

            if (this.partnerCC.chessground.state.boardState.pockets) {
                // update pocket mode of partner board:
                const pocket = /*ctrl.chessground.state.pockets todo:not relevant for bughouse - if/when this class becomes generic bring this back?*/
                    this.partnerCC.chessground.state.boardState.pockets[/*util.opposite(*/meta.captured.color/*)*/]/* : undefined*/;
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
                this.partnerCC.setDests();//dests = this.parent.getDests(this.partnerCC);

                this.partnerCC.chessground.state.dom.redraw(); // TODO: see todo comment also at same line in onUserDrop.
            }
        }

        this.processInput(moved, orig, dest, meta);; //if (!ctrl.promotion.start(moved.role, orig, dest, meta.ctrlKey)) ctrl.sendMove(orig, dest, '');
        ctrl.preaction = false;

    }

    private setPremove = (orig: cg.Orig, dest: cg.Key, metadata?: cg.SetPremoveMetadata) => {
        this.premove = { orig, dest, metadata };
        // console.log("setPremove() to:", orig, dest, meta);
    }

    private unsetPremove = () => {
        this.premove = undefined;
        this.preaction = false;
    }

    createGround = (el: HTMLElement, pocket0:HTMLElement|undefined, pocket1:HTMLElement|undefined, fullfen: string): Api => {

        const parts = fullfen.split(" ");
        const fen_placement: cg.FEN = parts[0];

        const chessground = Chessground(el, {
             fen: fen_placement as cg.FEN,
             // variant: 'crazyhouse' as cg.Variant,//todo:niki:why does cg need to be aware of variants?
             // chess960: false,
             dimensions: BOARD_FAMILIES.standard8x8.dimensions,
             notation: cg.Notation.ALGEBRAIC,
             orientation: 'white',//todo:niki
             turnColor: 'white',//todo:niki
             animation: { enabled: false },//todo:niki
             addDimensionsCssVarsTo: this.boardName === 'a'? document.body: undefined, // todo:niki, i was hoping this check will result in only setting those variables once by first board, this avoiding that loop of resizing that happens but i guess not enough
             pocketRoles: VARIANTS.crazyhouse.pocket?.roles,
        }, pocket0, pocket1);

        chessground.set({
            animation: { enabled: false },
            movable: {
                free: false,
                color: 'white',
                showDests: true,//todo:niki
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

        if (this.boardName === 'a') { // todo:niki:maytbe less ugly would be to move this in the parent cotroller. also not sure if good idea to call below stuff twice really
            boardSettings.ctrl = this;
        } else {
            boardSettings.ctrl2 = this;
        }
        boardSettings.assetURL = this.assetURL;
        const boardFamily = this.variant.boardFamily;
        const pieceFamily = this.variant.pieceFamily;
        boardSettings.updateBoardStyle(boardFamily);
        boardSettings.updatePieceStyle(pieceFamily);
        boardSettings.updateZoom(boardFamily);
        boardSettings.updateBlindfold();


        return chessground;
    }

    toggleSettings(): void {
        console.log("toggleSettings not implemented"); //todo:niki
    }

}


