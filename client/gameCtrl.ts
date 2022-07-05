import Sockette from 'sockette';

import { h, VNode } from 'snabbdom';
import * as cg from 'chessgroundx/types';
import * as util from 'chessgroundx/util';

import { _ } from './i18n';
import { patch } from './document';
import { Step, MsgChat, MsgFullChat, MsgSpectators, MsgShutdown,MsgGameNotFound } from './messages';
import { uci2LastMove, moveDests, uci2cg } from './chess';
import { Gating } from './gating';
import { Promotion } from './promotion';
import { ChessgroundController } from './cgCtrl';
import { JSONObject, PyChessModel } from './types';
import { updateCount, updatePoint } from './info';
import { sound } from './sound';
import { chatMessage, IChatController } from './chat';

export abstract class GameController extends ChessgroundController implements IChatController {
    sock: Sockette;

    // Info
    username: string;
    gameId: string;
    tournamentId: string;
    handicap: boolean;
    wplayer: string;
    bplayer: string;
    aiLevel: number;
    rated: string;

    base: number;
    inc: number;

    players: string[];
    titles: string[];
    ratings: string[];
    wtitle: string;
    btitle: string;
    wrating: string;
    brating: string;

    // Helpers
    gating: Gating;
    promotion: Promotion;

    // Game state
    turnColor: cg.Color;

    setupFen: string;
    prevPieces: cg.Pieces;

    premove: { orig: cg.Key, dest: cg.Key, metadata?: cg.SetPremoveMetadata } | undefined;
    predrop: { role: cg.Role, key: cg.Key } | undefined;
    preaction: boolean;

    steps: Step[];
    promotions: string[];

    // TODO: moveList: MoveList;
    status: number;
    pgn: string;
    ply: number;
    result: string;

    // UI state
    vplayer0: VNode;
    vplayer1: VNode;
    vmovelist: VNode | HTMLElement;
    gameControls: VNode;
    moveControls: VNode;
    ctableContainer: VNode | HTMLElement;
    clickDrop: cg.Piece | undefined;

    dests: cg.Dests; // stores all possible moves for all pieces of the player whose turn it is currently
    lastmove: cg.Key[];

    spectator: boolean;

    // Settings
    animation: boolean;
    showDests: boolean;
    clickDropEnabled: boolean;
    autoPromote?: boolean;

    // Main line ply where analysis variation starts
    plyVari: number;

    constructor(el: HTMLElement, model: PyChessModel) {
        super (el, model);

        this.gameId = model["gameId"] as string;
        this.tournamentId = model["tournamentId"]
        this.username = model["username"];
        this.wplayer = model["wplayer"];
        this.bplayer = model["bplayer"];
        this.base = Number(model["base"]);
        this.inc = Number(model["inc"]);
        this.status = Number(model["status"]);
        this.steps = [];
        this.pgn = "";
        this.ply = isNaN(model["ply"]) ? 0 : model["ply"];
        this.wtitle = model["wtitle"];
        this.btitle = model["btitle"];
        this.wrating = model["wrating"];
        this.brating = model["brating"];
        this.rated = model["rated"];

        this.spectator = this.username !== this.wplayer && this.username !== this.bplayer;

        this.animation = localStorage.animation === undefined ? true : localStorage.animation === "true";
        this.showDests = localStorage.showDests === undefined ? true : localStorage.showDests === "true";

        this.gating = new Gating(this);
        this.promotion = new Promotion(this);

        // orientation = this.mycolor
        if (this.spectator) {
            this.mycolor = 'white';
            this.oppcolor = 'black';
        } else {
            this.mycolor = this.username === this.wplayer ? 'white' : 'black';
            this.oppcolor = this.username === this.wplayer ? 'black' : 'white';
        }

        // players[0] is top player, players[1] is bottom player
        this.players = [
            this.mycolor === "white" ? this.bplayer : this.wplayer,
            this.mycolor === "white" ? this.wplayer : this.bplayer
        ];
        this.titles = [
            this.mycolor === "white" ? this.btitle : this.wtitle,
            this.mycolor === "white" ? this.wtitle : this.btitle
        ];
        this.ratings = [
            this.mycolor === "white" ? this.brating : this.wrating,
            this.mycolor === "white" ? this.wrating : this.brating
        ];

        this.result = "*";
        const parts = this.fullfen.split(" ");

        this.turnColor = parts[1] === "w" ? "white" : "black";

        this.steps.push({
            'fen': this.fullfen,
            'move': undefined,
            'check': false,
            'turnColor': this.turnColor,
            });

        this.setDests();
    }

    flipped() {
        return (
            (this.chessground.state.orientation === 'black' && this.mycolor === 'white') ||
            (this.chessground.state.orientation === 'white' && this.mycolor === 'black')
        );
    }

    getGround = () => this.chessground;

    setDests = () => {
        if (this.ffishBoard === undefined) {
            // At very first time we may have to wait for ffish module to initialize
            setTimeout(this.setDests, 100);
        } else {
            const legalMoves = this.ffishBoard.legalMoves().split(" ");
            const dests: cg.Dests = moveDests(legalMoves);
            // list of legal promotion moves
            this.promotions = [];
            legalMoves.forEach((move: string) => {
                const moveStr = uci2cg(move);
                
                const tail = moveStr.slice(-1);
                if (tail > '9' || tail === '+' || tail === '-') {
                    if (!(this.variant.gate && (moveStr.slice(1, 2) === '1' || moveStr.slice(1, 2) === '8'))) {
                        this.promotions.push(moveStr);
                    }
                }
                if (this.variant.promotion === 'kyoto' && moveStr.slice(0, 1) === '+') {
                    this.promotions.push(moveStr);
                }
            });
            this.chessground.set({ movable: { dests: dests }});
        }
    }

    abstract doSendMove(orig: cg.Orig, dest: cg.Key, promo: string): void;

    sendMove(orig: cg.Orig, dest: cg.Key, promo: string) {
        console.log(orig, dest, promo);
        this.doSendMove(orig, dest, promo);
    }

    goPly(ply: number, plyVari = 0) {
        const vv = this.steps[plyVari]?.vari;
        const step = (plyVari > 0 && vv) ? vv[ply - plyVari] : this.steps[ply];
        if (step === undefined) return;

        const move = uci2LastMove(step.move);
        let capture = false;
        if (move.length > 0) {
            // 960 king takes rook castling is not capture
            // TODO Defer this logic to ffish.js
            capture = (this.chessground.state.pieces.get(move[move.length - 1]) !== undefined && step.san?.slice(0, 2) !== 'O-') || (step.san?.slice(1, 2) === 'x');
        }

        this.chessground.set({
            fen: step.fen,
            turnColor: step.turnColor,
            movable: {
                color: step.turnColor,
                },
            check: step.check,
            lastMove: move,
        });
        this.setDests();

        this.turnColor = step.turnColor;
        this.fullfen = step.fen;

        if (this.variant.counting) {
            updateCount(step.fen, document.getElementById('misc-infow') as HTMLElement, document.getElementById('misc-infob') as HTMLElement);
        }

        if (this.variant.materialPoint) {
            updatePoint(step.fen, document.getElementById('misc-infow') as HTMLElement, document.getElementById('misc-infob') as HTMLElement);
        }

        if (ply === this.ply + 1) {
            sound.moveSound(this.variant, capture);
        }

        this.ply = ply
    }

    doSend = (message: JSONObject) => {
        // console.log("---> doSend():", message);
        this.sock.send(JSON.stringify(message));
    }

    protected onMove = () => {
        return (orig: cg.Key, dest: cg.Key, capturedPiece: cg.Piece) => {
            console.log("   ground.onMove()", orig, dest, capturedPiece);
            sound.moveSound(this.variant, !!capturedPiece);
        }
    }

    protected onDrop = () => {
        return (piece: cg.Piece, dest: cg.Key) => {
            // console.log("ground.onDrop()", piece, dest);
            if (dest !== 'a0' && piece.role) {
                sound.moveSound(this.variant, false);
            }
        }
    }

    protected onSelect = () => {
        let lastTime = performance.now();
        let lastKey: cg.Key = 'a0';
        return (key: cg.Key) => {
            if (this.chessground.state.movable.dests === undefined) return;

            const curTime = performance.now();

            // Save state.pieces to help recognise 960 castling (king takes rook) moves
            // Shouldn't this be implemented in chessground instead?
            if (this.chess960 && this.variant.gate) {
                this.prevPieces = new Map(this.chessground.state.pieces);
            }

            // Sittuyin in place promotion on double click
            if (lastKey === key && curTime - lastTime < 500) {
                if (this.chessground.state.movable.dests.get(key)?.includes(key)) {
                    const piece = this.chessground.state.pieces.get(key)!;
                    if (this.variant.name === 'sittuyin') { // TODO make this more generic
                        // console.log("Ctrl in place promotion", key);
                        const pieces: cg.Pieces = new Map();
                        pieces.set(key, {
                            color: piece.color,
                            role: 'f-piece',
                            promoted: true
                        });
                        this.chessground.setPieces(pieces);
                        this.chessground.state.movable.dests = undefined;
                        this.chessground.selectSquare(key);
                        sound.moveSound(this.variant, false);
                        this.sendMove(key, key, 'f');
                    }
                }
                lastKey = 'a0';
            } else {
                lastKey = key;
                lastTime = curTime;
            }
        }
    }

    protected pass = () => {
        let passKey: cg.Key = 'a0';
        const pieces = this.chessground.state.pieces;
        const dests = this.chessground.state.movable.dests!;
        for (const [k, p] of pieces) {
            if (p.role === 'k-piece' && p.color === this.turnColor)
                if (dests.get(k)?.includes(k)) {
                    passKey = k;
                    break;
                }
        }
        if (passKey !== 'a0') {
            // prevent calling pass() again by selectSquare() -> onSelect()
            this.chessground.state.movable.dests = undefined;
            this.chessground.selectSquare(passKey);
            sound.moveSound(this.variant, false);
            this.sendMove(passKey, passKey, '');
        }
    }

/**
 * Custom variant-specific logic to be triggered on move and alter state of board/pocket depending on variant rules.
 * TODO: contains also some ui logic - maybe good to split pure chess rules (which maybe can go to chess.ts?)
 *       from rendering dialogs and
 * */
    protected onUserMove(orig: cg.Key, dest: cg.Key, meta: cg.MoveMetadata) {
        this.preaction = meta.premove;
        // chessground doesn't knows about ep, so we have to remove ep captured pawn
        const pieces = this.chessground.state.pieces;
        // console.log("ground.onUserMove()", orig, dest, meta);
        let moved = pieces.get(dest);
        // Fix king to rook 960 castling case
        if (moved === undefined) moved = {role: 'k-piece', color: this.mycolor} as cg.Piece;
        if (meta.captured === undefined && moved !== undefined && moved.role === "p-piece" && orig[0] !== dest[0] && this.variant.enPassant) {
            const pos = util.key2pos(dest),
            pawnPos: cg.Pos = [pos[0], pos[1] + (this.mycolor === 'white' ? -1 : 1)];
            const diff: cg.PiecesDiff = new Map();
            diff.set(util.pos2key(pawnPos), undefined);
            this.chessground.setPieces(diff);
            meta.captured = {role: "p-piece", color: moved.color === "white"? "black": "white"/*or could get it from pieces[pawnPos] probably*/};
        }
        // increase pocket count
        // important only during gap before we receive board message from server and reset whole FEN (see also onUserDrop)
        if (this.variant.drop && meta.captured) {
            let role = meta.captured.role;
            if (meta.captured.promoted)
                role = (this.variant.promotion === 'shogi' || this.variant.promotion === 'kyoto') ? meta.captured.role.slice(1) as cg.Role : "p-piece";

            const pocket = this.chessground.state.pockets ? this.chessground.state.pockets[util.opposite(meta.captured.color)] : undefined;
            if (pocket && role && role in pocket) {
                pocket[role]!++;
                this.chessground.state.dom.redraw(); // TODO: see todo comment also at same line in onUserDrop.
            }
        }

        //  gating elephant/hawk
        if (this.variant.gate) {
            if (!this.promotion.start(moved.role, orig, dest, meta.ctrlKey) && !this.gating.start(this.fullfen, orig, dest)) this.sendMove(orig, dest, '');
        } else {
            if (!this.promotion.start(moved.role, orig, dest, meta.ctrlKey)) this.sendMove(orig, dest, '');
            this.preaction = false;
        }
    }

/**
 * Variant specific logic for when dropping a piece from pocket is performed
 * todo: decreasing of pocket happens here as well even though virtually no variant ever has a drop rule that doesn't decrease pocket.
 *       Only reason currently this is not in chessground is editor where we have a second "pocket" that serves as a palette
 *       Also maybe nice ot think if ui+communication logic can be split out of here (same for onUserMove) so only chess rules remain?
 * */
    protected onUserDrop(role: cg.Role, dest: cg.Key, meta: cg.MoveMetadata) {
        this.preaction = meta.predrop === true;
        // decrease pocket count - todo: covers the gap before we receive board message confirming the move - then FEN is set
        //                               and overwrites whole board+pocket and refreshes.
        //                               Maybe consider decrease count on start of drag (like in editor mode)?
        this.chessground.state.pockets![this.chessground.state.turnColor]![role]! --;
        this.chessground.state.dom.redraw();
        if (this.variant.promotion === 'kyoto') {
            if (!this.promotion.start(role, 'a0', dest)) this.sendMove(util.dropOrigOf(role), dest, '');
        } else {
            this.sendMove(util.dropOrigOf(role), dest, '')
        }
        this.preaction = false;
    }

    private onMsgSpectators = (msg: MsgSpectators) => {
        const container = document.getElementById('spectators') as HTMLElement;
        patch(container, h('under-left#spectators', _('Spectators: ') + msg.spectators));
    }

    private onMsgChat = (msg: MsgChat) => {
        if ((this.spectator && msg.room === 'spectator') || (!this.spectator && msg.room !== 'spectator') || msg.user.length === 0) {
            chatMessage(msg.user, msg.message, "roundchat", msg.time);
        }
    }

    private onMsgFullChat = (msg: MsgFullChat) => {
        // To prevent multiplication of messages we have to remove old messages div first
        patch(document.getElementById('messages') as HTMLElement, h('div#messages-clear'));
        // then create a new one
        patch(document.getElementById('messages-clear') as HTMLElement, h('div#messages'));
        msg.lines.forEach((line) => {
            if ((this.spectator && line.room === 'spectator') || (!this.spectator && line.room !== 'spectator') || line.user.length === 0) {
                chatMessage(line.user, line.message, "roundchat", line.time);
            }
        });
    }

    private onMsgGameNotFound = (msg: MsgGameNotFound) => {
        alert(_("Requested game %1 not found!", msg['gameId']));
        window.location.assign(this.home);
    }

    private onMsgShutdown = (msg: MsgShutdown) => {
        alert(msg.message);
    }

    protected onMessage(evt: MessageEvent) {
        // console.log("<+++ onMessage():", evt.data);
        const msg = JSON.parse(evt.data);
        switch (msg.type) {
            case "spectators":
                this.onMsgSpectators(msg);
                break
            case "roundchat":
                this.onMsgChat(msg);
                break;
            case "fullchat":
                this.onMsgFullChat(msg);
                break;
            case "game_not_found":
                this.onMsgGameNotFound(msg);
                break
            case "shutdown":
                this.onMsgShutdown(msg);
                break;
            case "logout":
                this.doSend({type: "logout"});
                break;
        }
    }
}
