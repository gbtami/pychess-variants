import {Api} from "chessgroundx/api";
import {Gating} from "../gating";
import {Promotion} from "../promotion";
import * as cg from "chessgroundx/types";
import {Chessground} from "chessgroundx";
import {BOARD_FAMILIES, Variant, VARIANTS} from "../chess";
import * as util from "chessgroundx/util";

export class ChessgroundController{



    chessground: Api;

    gating: Gating;
    promotion: Promotion;

    mycolor: cg.Color;
    oppcolor: cg.Color;
    turnColor: cg.Color;

    chess960: boolean;
    prevPieces: cg.Pieces;

    variant: Variant;

    fullfen: cg.FEN;

    preaction: boolean;//todo:niki:where is this used usually?

    ply: number = 0;//todo:niki; only needed for cancel() of promotion.ts and gating.ts. so it can call goPly(which is currently not implemented either) to reset last move
    // plyVari: number;

    dests: cg.Dests;

    promotions: string[];//on each turn, it is populated from possible moves that are promotions - todo;niki; should implement the population of this array - currently commented out probably

    ffish: any;
    ffishBoard: any;

    boardName: 'a' | 'b';

    constructor(el: HTMLElement,elPocket1: HTMLElement,elPocket2: HTMLElement, fullfen: string, variant: string, chess960: boolean) {
        this.chessground = this.createGround(el, elPocket1, elPocket2, fullfen);

        this.gating = new Gating(this);
        this.promotion = new Promotion(this);

        this.variant = VARIANTS[variant];
        this.chess960 = chess960;//todo:niki:i am having second thought if i need this here really 960 should be true/false for both boards, but logically feel the right place here
        this.fullfen = fullfen;

        // this.plyVari = 0;

        //
        // this.spectator = this.model["username"] !== this.wplayer && this.model["username"] !== this.bplayer;

        // orientation = this.mycolor
        // if (this.spectator) {
            this.mycolor = 'white';
            this.oppcolor = 'black';
        // } else {
        //     this.mycolor = this.model["username"] === this.wplayer ? 'white' : 'black';
        //     this.oppcolor = this.model["username"] === this.wplayer ? 'black' : 'white';
        // }

        // players[0] is top player, players[1] is bottom player
        // this.players = [
        //     this.mycolor === "white" ? this.bplayer : this.wplayer,
        //     this.mycolor === "white" ? this.wplayer : this.bplayer
        // ];
        // this.titles = [
        //     this.mycolor === "white" ? this.model['btitle'] : this.model['wtitle'],
        //     this.mycolor === "white" ? this.model['wtitle'] : this.model['btitle']
        // ];
        // this.ratings = [
        //     this.mycolor === "white" ? this.model['brating'] : this.model['wrating'],
        //     this.mycolor === "white" ? this.model['wrating'] : this.model['brating']
        // ];

        // this.result = "*";
        const parts = this.fullfen.split(" ");

        // const fen_placement: cg.FEN = parts[0];
        this.turnColor = parts[1] === "w" ? "white" : "black";

    }

    getGround = () => this.chessground;

    sendMove = (orig: cg.Orig, dest: cg.Key, promo: string) => {
        console.log(orig, dest, promo);
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

    onUserDrop = (role: cg.Role, dest: cg.Key, meta: cg.MoveMetadata) => {
        console.log(role, dest, meta);
        // onUserDrop(this, role, dest, meta); todo:niki
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
                const piece = this.chessground.state.pieces.get(key);
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

    private onUserMove = (orig: cg.Key, dest: cg.Key, meta: cg.MoveMetadata) => {
        console.log(orig, dest, meta);
        const ctrl = this;
        ctrl.preaction = meta.premove;
        // chessground doesn't knows about ep, so we have to remove ep captured pawn
        const pieces = ctrl.chessground.state.pieces;
        // console.log("ground.onUserMove()", orig, dest, meta);
        let moved = pieces.get(dest);
        // Fix king to rook 960 castling case
        if (moved === undefined) moved = {role: 'k-piece', color: ctrl.mycolor} as cg.Piece;
        //en - passant logic todo:niki:maybe move to common place. chess.ts?
        if (meta.captured === undefined && moved !== undefined && moved.role === "p-piece" && orig[0] !== dest[0] && ctrl.variant.enPassant) {
            const pos = util.key2pos(dest),
            pawnPos: cg.Pos = [pos[0], pos[1] + (ctrl.mycolor === 'white' ? -1 : 1)];
            const diff: cg.PiecesDiff = new Map();
            diff.set(util.pos2key(pawnPos), undefined);
            ctrl.chessground.setPieces(diff);
            meta.captured = {role: "p-piece", color: moved.color === "white"? "black": "white"/*or could get it from pieces[pawnPos] probably*/};
        }

        // // increase pocket count todo:niki: but now partners pocket
        // // important only during gap before we receive board message from server and reset whole FEN (see also onUserDrop)
        // if (ctrl.variant.drop && meta.captured) {
        //     let role = meta.captured.role;
        //     if (meta.captured.promoted)
        //         role = (ctrl.variant.promotion === 'shogi' || ctrl.variant.promotion === 'kyoto') ? meta.captured.role.slice(1) as cg.Role : "p-piece";
        //
        //     const pocket = ctrl.chessground.state.pockets ? ctrl.chessground.state.pockets[util.opposite(meta.captured.color)] : undefined;
        //     if (pocket && role && role in pocket) {
        //         pocket[role]!++;
        //         ctrl.chessground.state.dom.redraw(); // TODO: see todo comment also at same line in onUserDrop.
        //     }
        // }

        //  gating elephant/hawk
        // if (ctrl.variant.gate) {
        //     if (!ctrl.promotion.start(moved.role, orig, dest, meta.ctrlKey) && !ctrl.gating.start(ctrl.fullfen, orig, dest)) ctrl.sendMove(orig, dest, '');
        // } else {
            if (!ctrl.promotion.start(moved.role, orig, dest, meta.ctrlKey)) ctrl.sendMove(orig, dest, '');
            ctrl.preaction = false;
        // }


    }


    goPly = (ply: number, plyVari = 0) => {
        console.log(ply, plyVari);
        //todo;niki: need so gating can compile - i wonder what is best design here now with 2 board - i guess used to reset board on cancel of promotion
        // if (this.localAnalysis) {
        //     this.engineStop();
        //     // Go back to the main line
        //     if (plyVari === 0) {
        //         const container = document.getElementById('vari') as HTMLElement;
        //         patch(container, h('div#vari', ''));
        //     }
        // }
        //
        // const vv = this.steps[plyVari]?.vari;
        // const step = (plyVari > 0 && vv ) ? vv[ply] : this.steps[ply];
        //
        // const move = uci2LastMove(step.move);
        // let capture = false;
        // if (move.length > 0) {
        //     // 960 king takes rook castling is not capture
        //     // TODO defer this logic to ffish.js
        //     capture = (this.b1.chessground.state.pieces.get(move[move.length - 1]) !== undefined && step.san?.slice(0, 2) !== 'O-') || (step.san?.slice(1, 2) === 'x');
        // }
        //
        // this.b1.chessground.set({
        //     fen: step.fen,
        //     turnColor: step.turnColor,
        //     movable: {
        //         color: step.turnColor,
        //         dests: this.dests,
        //         },
        //     check: step.check,
        //     lastMove: move,
        // });
        //
        // this.b1.fullfen = step.fen;
        //
        // if (this.b1.variant.counting) {
        //     updateCount(step.fen, document.getElementById('misc-infow') as HTMLElement, document.getElementById('misc-infob') as HTMLElement);
        // }
        //
        // if (this.b1.variant.materialPoint) {
        //     updatePoint(step.fen, document.getElementById('misc-infow') as HTMLElement, document.getElementById('misc-infob') as HTMLElement);
        // }
        //
        // if (ply === this.ply + 1) {
        //     sound.moveSound(this.b1.variant, capture);
        // }
        //
        // // Go back to the main line
        // if (plyVari === 0) {
        //     this.ply = ply
        // }
        // this.b1.turnColor = step.turnColor;
        //
        // if (this.plyVari > 0 && plyVari === 0) {
        //     this.steps[this.plyVari]['vari'] = undefined;
        //     this.plyVari = 0;
        //     updateMovelist(this);
        // }
        //
        // if (this.model["embed"]) return;
        //
        // if (this.ffishBoard !== null) {
        //     this.ffishBoard.setFen(this.b1.fullfen);
        //     this.dests = this.getDests();
        // }
        //
        // this.drawEval(step.ceval, step.scoreStr, step.turnColor);
        // this.drawServerEval(ply, step.scoreStr);
        //
        // // TODO: multi PV
        // this.maxDepth = maxDepth;
        // if (this.localAnalysis) this.engineGo(this.b1);
        //
        // const e = document.getElementById('fullfen') as HTMLInputElement;
        // e.value = this.b1.fullfen;
        //
        // if (this.isAnalysisBoard) {
        //     const idxInVari = (plyVari > 0) ? ply : 0;
        //     this.vpgn = patch(this.vpgn, h('textarea#pgntext', { attrs: { rows: 13, readonly: true, spellcheck: false} }, this.getPgn(idxInVari)));
        // } else {
        //     const hist = this.model["home"] + '/' + this.gameId + '?ply=' + ply.toString();
        //     window.history.replaceState({}, this.model['title'], hist);
        // }
    }


    createGround = (el: HTMLElement, pocket0:HTMLElement|undefined, pocket1:HTMLElement|undefined, fullfen: string): Api => {



    // const pocket0 = this.hasPockets? document.getElementById('pocket0') as HTMLElement: undefined;
    // const pocket1 = this.hasPockets? document.getElementById('pocket1') as HTMLElement: undefined;

    // const fullfen = model["fen"] as string;
    const parts = fullfen.split(" ");
    const fen_placement: cg.FEN = parts[0];

    const chessground = Chessground(el, {
         fen: fen_placement as cg.FEN,
         variant: 'crazyhouse' as cg.Variant,//todo:niki:why does cg need to be aware of variants?
         chess960: false,
         geometry: BOARD_FAMILIES.standard8x8.geometry,
         notation: cg.Notation.ALGEBRAIC,
         orientation: 'white',//todo:niki
         turnColor: 'white',//todo:niki
         animation: { enabled: false },//todo:niki
         addDimensionsCssVars: true,

         pocketRoles: VARIANTS.crazyhouse.pocketRoles.bind(VARIANTS.crazyhouse),
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
        events: {
            move: this.onMove(),
            dropNewPiece: this.onDrop(),
            select: this.onSelect(),
        },
    });
    return chessground;
}
}


