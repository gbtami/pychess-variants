import WebsocketHeartbeatJs from 'websocket-heartbeat-js';

import { h, VNode } from 'snabbdom';
import * as cg from 'chessgroundx/types';
import * as util from 'chessgroundx/util';

import { _ } from './i18n';
import { patch } from './document';
import { Step, MsgChat, MsgFullChat, MsgSpectators, MsgShutdown,MsgGameNotFound } from './messages';
import { uci2LastMove, moveDests, duckMoveDests, cg2uci, unpromotedRole } from './chess';
import { GatingInput } from './gating';
import { PromotionInput } from './promotion';
import { ChessgroundController } from './cgCtrl';
import { JSONObject, PyChessModel } from './types';
import { updateCount, updatePoint } from './info';
import { sound } from './sound';
import { chatMessage, IChatController } from './chat';
import { DuckInput } from './duck';

type InputType = 'gating' | 'promotion' | 'duck';

export abstract class GameController extends ChessgroundController implements IChatController {
    sock: WebsocketHeartbeatJs;

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
    gating: GatingInput;
    promotion: PromotionInput;
    duck: DuckInput;

    // Game state
    turnColor: cg.Color;
    suffix: string;

    setupFen: string;
    prevPieces: cg.Pieces;

    premove?: { orig: cg.Orig, dest: cg.Key, metadata?: cg.SetPremoveMetadata };
    preaction: boolean;

    steps: Step[];

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

    lastmove: cg.Key[];

    spectator: boolean;

    // Settings
    clickDropEnabled: boolean;
    autoPromote?: boolean;
    dblClickPass?: boolean;

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

        this.gating = new GatingInput(this);
        this.promotion = new PromotionInput(this);
        this.duck = new DuckInput(this);

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
        this.suffix = '';

        this.chessground.set({
            animation: {
                enabled: localStorage.animation === undefined || localStorage.animation === "true",
            },
            movable: {
                showDests: localStorage.showDests === undefined || localStorage.showDests === "true",
            },
        });

        this.steps.push({
            'fen': this.fullfen,
            'move': undefined,
            'check': false,
            'turnColor': this.turnColor,
            });

        this.setDests();
    }

    flipped() {
        return this.chessground.state.orientation !== this.mycolor;
    }

    setDests = () => {
        if (this.ffishBoard === undefined) {
            // At very first time we may have to wait for ffish module to initialize
            setTimeout(this.setDests, 100);
        } else {
            const legalMoves = this.ffishBoard.legalMoves().split(" ");
            const dests = moveDests(legalMoves);
            this.chessground.set({ movable: { dests: dests }});
            if (this.steps.length === 1) {
                this.chessground.set({ check: (this.ffishBoard.isCheck()) ? this.turnColor : false});
            }
        }
    }

    setDuckDests = (move: string) => {
        const legalMoves = this.ffishBoard.legalMoves();
        // valid moves starting with the given piece move
        const filteredMoves = legalMoves.split(" ").filter((m: string) => m.startsWith(move));

        let fromSquare = undefined;
        const pieces = this.chessground.state.boardState.pieces;
        for (const [k, p] of pieces) {
            if (p.role === '_-piece') {
                fromSquare = k;
                break;
            }
        }

        // In case of white first move there is no duck on the board at all
        // so we have to pass the given move dest square as fromSquare param to duckMoveDests()
        if (fromSquare === undefined) {
            // The new duck will be placed by one click on some empty square in onSelect()
            fromSquare = move.slice(2, 4) as cg.Key;
        } else {
            // turn the duck piece color to the opposite to let it be movable on chessground
            this.chessground.state.boardState.pieces.get(fromSquare)!.color = this.turnColor;
        };

        const dests = duckMoveDests(filteredMoves, fromSquare);
        this.chessground.set({ movable: { dests: dests }, turnColor: this.turnColor });
    }

    abstract doSendMove(move: string): void;

    processInput(piece: cg.Piece, orig: cg.Orig, dest: cg.Key, meta: cg.MoveMetadata, lastSuffix?: string, lastInputType?: InputType): void {
        switch (lastInputType) {
            case undefined:
                this.suffix = '';
                if (this.variant.rules.gate && util.isKey(orig))
                    this.gating.start(this.fullfen, orig, dest);
                else
                    this.promotion.start(piece, orig, dest, meta);
                break;
            case 'gating':
            case 'promotion':
                this.suffix += lastSuffix;
                if (this.variant.rules.duck)
                    this.duck.start(piece, orig, dest, meta);
                else
                    this.sendMove(orig, dest, this.suffix);
                break;
            case 'duck':
                this.suffix += lastSuffix;
                this.sendMove(orig, dest, this.suffix);
                break;
        }
    }

    sendMove(orig: cg.Orig, dest: cg.Key, promo: string) {
        this.doSendMove(cg2uci(orig + dest + promo));
    }

    goPly(ply: number, plyVari = 0) {
        const vv = this.steps[plyVari]?.vari;
        const step = (plyVari > 0 && vv) ? vv[ply - plyVari] : this.steps[ply];
        if (step === undefined) return;

        const move = uci2LastMove(step.move);
        let capture = false;
        if (move) {
            // 960 king takes rook castling is not capture
            // TODO Defer this logic to ffish.js
            capture = (this.chessground.state.boardState.pieces.get(move[1]) !== undefined && step.san?.slice(0, 2) !== 'O-') || (step.san?.slice(1, 2) === 'x');
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

        if (this.variant.ui.counting) {
            updateCount(step.fen, document.getElementById('misc-infow') as HTMLElement, document.getElementById('misc-infob') as HTMLElement);
        }

        if (this.variant.ui.materialPoint) {
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
        return (_orig: cg.Key, _dest: cg.Key, capturedPiece: cg.Piece) => {
            sound.moveSound(this.variant, !!capturedPiece);
        }
    }

    protected onDrop = () => {
        return (piece: cg.Piece, _dest: cg.Key) => {
            if (piece.role)
                sound.moveSound(this.variant, false);
        }
    }

    protected onSelect = () => {
        let lastTime = performance.now();
        let lastKey: cg.Key | undefined;
        return (key: cg.Key) => {
            if (this.duck.inputState === 'click') {
                this.duck.moveDuck(key);
                return;
            }

            if (this.chessground.state.movable.dests === undefined) return;

            const curTime = performance.now();

            // Save state.pieces to help recognise 960 castling (king takes rook) moves
            // Shouldn't this be implemented in chessground instead?
            if (this.chess960 && this.variant.rules.gate) {
                this.prevPieces = new Map(this.chessground.state.boardState.pieces);
            }

            // Sittuyin in place promotion on double click
            if (this.chessground.state.stats.ctrlKey || (lastKey === key && curTime - lastTime < 500)) {
                if (this.chessground.state.movable.dests.get(key)?.includes(key)) {
                    const piece = this.chessground.state.boardState.pieces.get(key)!;
                    if (this.variant.name === 'sittuyin') { // TODO make this more generic
                        // console.log("Ctrl in place promotion", key);
                        this.chessground.setPieces(new Map([[key, {
                            color: piece.color,
                            role: 'f-piece',
                            promoted: true
                        }]]));
                        this.chessground.state.movable.dests = undefined;
                        this.chessground.selectSquare(key);
                        sound.moveSound(this.variant, false);
                        this.processInput(piece, key, key, { premove: false }, 'f', 'promotion');
                    } else if ((this.chessground.state.stats.ctrlKey || this.dblClickPass) && this.variant.rules.pass) {
                        this.pass(key);
                    }
                }
                lastKey = undefined;
            } else {
                lastKey = key;
                lastTime = curTime;
            }
        }
    }

    protected pass = (passKey?: cg.Key) => {
        if (this.turnColor === this.chessground.state.movable.color || this.chessground.state.movable.color === 'both') {
            if (!passKey) {
                const pieces = this.chessground.state.boardState.pieces;
                const dests = this.chessground.state.movable.dests;
                for (const [k, p] of pieces) {
                    if (p.role === 'k-piece' && p.color === this.turnColor) {
                        if (dests?.get(k)?.includes(k)) {
                            passKey = k;
                            break;
                        }
                    }
                }
            }
            if (passKey) {
                // prevent calling pass() again by selectSquare() -> onSelect()
                this.chessground.unselect();
                sound.moveSound(this.variant, false);
                this.sendMove(passKey, passKey, '');
            }
        }
    }

    /**
      * Custom variant-specific logic to be triggered on move and alter state of board/pocket depending on variant rules.
      */
    protected onUserMove(orig: cg.Key, dest: cg.Key, meta: cg.MoveMetadata) {
        if (this.duck.inputState === "move") {
            this.duck.moveDuck(dest);
            return;
        }

        this.preaction = meta.premove;
        const pieces = this.chessground.state.boardState.pieces;
        let moved = pieces.get(dest);
        // Fix king to rook 960 castling case
        if (moved === undefined) moved = {role: 'k-piece', color: this.mycolor} as cg.Piece;

        // chessground doesn't know about en passant, so we have to remove the captured pawn manually
        if (meta.captured === undefined && moved !== undefined && moved.role === "p-piece" && orig[0] !== dest[0] && this.variant.rules.enPassant) {
            const pos = util.key2pos(dest),
                pawnKey = util.pos2key([pos[0], pos[1] + (this.mycolor === 'white' ? -1 : 1)]);
            meta.captured = pieces.get(pawnKey);
            this.chessground.setPieces(new Map([[pawnKey, undefined]]));
        }

        // add the captured piece to the pocket
        // chessground doesn't know what piece to revert a captured promoted piece into, so it needs to be handled here
        if (this.variant.pocket?.captureToHand && meta.captured) {
            const piece = {
                role: unpromotedRole(this.variant, meta.captured),
                color: util.opposite(meta.captured.color),
            };
            this.chessground.changePocket(piece, 1);
            this.chessground.state.dom.redraw();
        }

        this.processInput(moved, orig, dest, meta);
        this.preaction = false;
    }

    /**
     * Variant specific logic for when dropping a piece from pocket is performed
     */
    protected onUserDrop(piece: cg.Piece, dest: cg.Key, meta: cg.MoveMetadata) {
        this.preaction = meta.premove;
        const role = piece.role;
        this.processInput(piece, util.dropOrigOf(role), dest, meta);
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
        if (evt.data === '/n') return;
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
