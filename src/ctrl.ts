import Sockette from 'sockette';

import { init } from 'snabbdom';
import { h } from 'snabbdom/h';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

import { key2pos, pos2key } from 'chessgroundx/util';
import { Chessground } from 'chessgroundx';
import { Api } from 'chessgroundx/api';
import { Color, Dests, PiecesDiff, Role, Key, Pos, Piece, dimensions } from 'chessgroundx/types';

import { Clock, renderTime } from './clock';
import makeGating from './gating';
import makePromotion from './promotion';
import { dropIsValid, pocketView, updatePockets } from './pocket';
import { sound, changeCSS } from './sound';
import { variants, hasEp, needPockets, roleToSan, uci2usi, usi2uci, VARIANTS } from './chess';
import { renderUsername } from './user';
import { chatMessage, chatView } from './chat';
import { movelistView, updateMovelist } from './movelist';
import resizeHandle from './resize';

const patch = init([klass, attributes, properties, listeners]);


export default class RoundController {
    model;
    sock;
    chessground: Api;
    fullfen: string;
    wplayer: string;
    bplayer: string;
    base: number;
    inc: number;
    mycolor: Color;
    oppcolor: Color;
    turnColor: Color;
    clocks: any;
    abortable: boolean;
    gameId: string;
    variant: string;
    pockets: any;
    vpocket0: any;
    vpocket1: any;
    gameControls: any;
    moveControls: any;
    gating: any;
    promotion: any;
    dests: Dests;
    lastmove: Key[];
    premove: any;
    predrop: any;
    result: string;
    flip: boolean;
    spectator: boolean;
    oppIsRandomMover: boolean;
    tv: boolean;
    status: number;
    steps;
    ply: number;
    players: string[];
    CSSindexes: number[];
    clickDrop: Piece | undefined;

    constructor(el, model) {
        const onOpen = (evt) => {
            console.log("ctrl.onOpen()", evt);
            this.clocks[0].connecting = false;
            this.clocks[1].connecting = false;
            this.doSend({ type: "game_user_connected", username: this.model["username"], gameId: this.model["gameId"] });
        };

        const opts = {
            maxAttempts: 10,
            onopen: e => onOpen(e),
            onmessage: e => this.onMessage(e),
            onreconnect: e => {
                this.clocks[0].connecting = true;
                this.clocks[1].connecting = true;
                console.log('Reconnecting in round...', e);

                var container = document.getElementById('bottom-player') as HTMLElement;
                patch(container, h('i-side.online#bottom-player', {class: {"icon": true, "icon-online": false, "icon-offline": true}}));
                },
            onmaximum: e => console.log('Stop Attempting!', e),
            onclose: e => console.log('Closed!', e),
            onerror: e => console.log('Error:', e),
            };

        try {
            this.sock = new Sockette("ws://" + location.host + "/wsr", opts);
        }
        catch(err) {
            this.sock = new Sockette("wss://" + location.host + "/wsr", opts);
        }

        this.model = model;
        this.variant = model["variant"] as string;
        this.fullfen = model["fen"] as string;
        this.wplayer = model["wplayer"] as string;
        this.bplayer = model["bplayer"] as string;
        this.base = model["base"] as number;
        this.inc = model["inc"] as number;
        this.status = model["status"] as number;
        this.tv = model["tv"];
        this.steps = [];
        this.ply = 0;

        this.flip = false;

        this.CSSindexes = variants.map((variant) => localStorage[variant + "_pieces"] === undefined ? 0 : Number(localStorage[variant + "_pieces"]));

        this.spectator = this.model["username"] !== this.wplayer && this.model["username"] !== this.bplayer;

        // orientation = this.mycolor
        if (this.spectator) {
            this.mycolor = this.variant === 'shogi' ? 'black' : 'white';
            this.oppcolor = this.variant === 'shogi' ? 'white' : 'black';
        } else {
            this.mycolor = this.model["username"] === this.wplayer ? 'white' : 'black';
            this.oppcolor = this.model["username"] === this.wplayer ? 'black' : 'white';
        }

        this.oppIsRandomMover = (
            (this.mycolor === "white" && this.bplayer === "Random-Mover") ||
            (this.mycolor === "black" && this.wplayer === "Random-Mover"));

        // players[0] is top player, players[1] is bottom player
        this.players = [
            this.mycolor === "white" ? this.bplayer : this.wplayer,
            this.mycolor === "white" ? this.wplayer : this.bplayer
        ];

        this.premove = null;
        this.predrop = null;

        this.result = "";
        const parts = this.fullfen.split(" ");
        this.abortable = Number(parts[parts.length - 1]) <= 1;

        const fen_placement = parts[0];
        this.turnColor = parts[1] === "w" ? "white" : "black";

        if (this.variant === "shogi" || this.variant === "xiangqi") {
            this.setPieces(this.mycolor);
        } else {
            // TODO:save/restore preferences
            changeCSS('/static/' + VARIANTS[this.variant].css[0] + '.css');
        };

        this.steps.push({
            'fen': fen_placement,
            'move': undefined,
            'check': false,
            'turnColor': this.turnColor,
            });

        this.chessground = Chessground(el, {
            fen: fen_placement,
            geometry: VARIANTS[this.variant].geom,
            orientation: this.mycolor,
            turnColor: this.turnColor,
            animation: {
                enabled: true,
            },
            events: {
                insert(elements) {resizeHandle(elements);}
            }
        });

        if (localStorage.zoom !== undefined && localStorage.zoom !== 100) {
            this.setZoom(Number(localStorage.zoom));
        }

        if (this.spectator) {
            this.chessground.set({
                viewOnly: true,
                events: {
                    move: this.onMove(),
                }
            });
        } else {
            this.chessground.set({
                movable: {
                    free: false,
                    color: this.mycolor,
                    showDests: true,
                    events: {
                        after: this.onUserMove,
                        afterNewPiece: this.onUserDrop,
                    }
                },
                premovable: {
                    enabled: true,
                    events: {
                        set: this.setPremove,
                        unset: this.unsetPremove,
                        }
                },
                predroppable: {
                    enabled: true,
                    events: {
                        set: this.setPredrop,
                        unset: this.unsetPredrop,
                        }
                },
                events: {
                    move: this.onMove(),
                    dropNewPiece: this.onDrop(),
                    change: this.onChange(this.chessground.state.selected),
                    select: this.onSelect(this.chessground.state.selected),
                }
            });
        };

        this.gating = makeGating(this);
        this.promotion = makePromotion(this);

        // initialize pockets
        if (needPockets(this.variant)) {
            const pocket0 = document.getElementById('pocket0') as HTMLElement;
            const pocket1 = document.getElementById('pocket1') as HTMLElement;
            updatePockets(this, pocket0, pocket1);
        }

        // initialize clocks
        const c0 = new Clock(this.base, this.inc, document.getElementById('clock0') as HTMLElement);
        const c1 = new Clock(this.base, this.inc, document.getElementById('clock1') as HTMLElement);
        this.clocks = [c0, c1];
        this.clocks[0].onTick(renderTime);
        this.clocks[1].onTick(renderTime);

        const flagCallback = () => {
            if (this.turnColor === this.mycolor && !this.spectator) {
                this.chessground.stop();
                console.log("Flag");
                this.doSend({ type: "flag", gameId: this.model["gameId"] });
            }
        }
        this.clocks[1].onFlag(flagCallback);

        if (Number(this.status) < 0) {
            console.log("GAME is ONGOING...");
        } else {
            console.log("GAME was ENDED...");
        }

        // TODO: add dark/light theme buttons (icon-sun-o/icon-moon-o)

        const togglePieces = () => {
            var idx = this.CSSindexes[variants.indexOf(this.variant)];
            idx += 1;
            idx = idx % VARIANTS[this.variant].css.length;
            this.CSSindexes[variants.indexOf(this.variant)] = idx
            localStorage.setItem(this.variant + "_pieces", String(idx));
            this.setPieces(this.mycolor);
        }

        if (this.variant === "shogi" || this.variant === "xiangqi") {
            var container = document.getElementById('btn-pieces') as HTMLElement;
            patch(container, h('button', { on: { click: () => togglePieces() }, props: {title: 'Toggle pieces'} }, [h('i', {class: {"icon": true, "icon-cog": true} } ), ]));
        }

        var container = document.getElementById('zoom') as HTMLElement;
        patch(container, h('input', { class: {"slider": true },
            attrs: { width: '280px', type: 'range', value: Number(localStorage.zoom), min: 60, max: 140 },
            on: { input: (e) => { this.setZoom(parseFloat((e.target as HTMLInputElement).value)); } } })
        );

        //const onResize = () => {console.log("onResize()");}
        //var elmnt = document.getElementById('cgwrap') as HTMLElement;
        //elmnt.addEventListener("resize", onResize);

        const abort = () => {
            // TODO: disable when ply > 2
            console.log("Abort");
            this.doSend({ type: "abort", gameId: this.model["gameId"] });
        }

        const draw = () => {
            console.log("Draw");
            this.doSend({ type: "draw", gameId: this.model["gameId"] });
        }

        const resign = () => {
            console.log("Resign");
            this.doSend({ type: "resign", gameId: this.model["gameId"] });
        }
/*
        const disconnect = () => {
            console.log("Testing socket disconnect...");
            this.doSend({ type: "disconnect", gameId: this.model["gameId"] });
        }
*/
        var container = document.getElementById('game-controls') as HTMLElement;
        if (!this.spectator) {
            this.gameControls = patch(container, h('div.btn-controls', [
                h('button#abort', { on: { click: () => abort() }, props: {title: 'Abort'} }, [h('i', {class: {"icon": true, "icon-abort": true} } ), ]),
                h('button#draw', { on: { click: () => draw() }, props: {title: "Draw"} }, [h('i', {class: {"icon": true, "icon-hand-paper-o": true} } ), ]),
                h('button#resign', { on: { click: () => resign() }, props: {title: "Resign"} }, [h('i', {class: {"icon": true, "icon-flag-o": true} } ), ]),
                // h('button#disconnect', { on: { click: () => disconnect() }, props: {title: 'disconnect'} }, [h('i', {class: {"icon": true, "icon-sign-out": true} } ), ]),
                ])
            );
        } else {
            this.gameControls = patch(container, h('div'));
        }

        patch(document.getElementById('movelist') as HTMLElement, movelistView(this));

        patch(document.getElementById('roundchat') as HTMLElement, chatView(this, "roundchat"));
    }

    getGround = () => this.chessground;
    getDests = () => this.dests;

    private setZoom = (zoom: number) => {
        const el = document.querySelector('.cg-wrap') as HTMLElement;
        if (el) {
            const baseWidth = dimensions[VARIANTS[this.variant].geom].width * (this.variant === "shogi" ? 52 : 64);
            const baseHeight = dimensions[VARIANTS[this.variant].geom].height * (this.variant === "shogi" ? 60 : 64);
            const pxw = `${zoom / 100 * baseWidth}px`;
            const pxh = `${zoom / 100 * baseHeight}px`;
            el.style.width = pxw;
            el.style.height = pxh;

            document.body.setAttribute('style', '--cgwrapwidth:' + pxw);
            document.body.setAttribute('style', '--cgwrapheight:' + pxh);

            document.body.dispatchEvent(new Event('chessground.resize'));
            localStorage.setItem("zoom", String(zoom));
        }
    }

    private onMsgGameStart = (msg) => {
        // console.log("got gameStart msg:", msg);
        if (msg.gameId !== this.model["gameId"]) return;
        if (!this.spectator) sound.genericNotify();
    }

    private onMsgNewGame = (msg) => {
        console.log("GameController.onMsgNewGame()", this.model["gameId"])
        window.location.assign(this.model["home"] + '/' + msg["gameId"]);
    }

    private rematch = () => {
        console.log("REMATCH");
        this.doSend({ type: "rematch", gameId: this.model["gameId"] });
        // window.location.assign(home);
    }

    private newOpponent = (home) => {
        window.location.assign(home);
    }

    private gameOver = () => {
        this.gameControls = patch(this.gameControls, h('div'));

        var container = document.getElementById('after-game') as HTMLElement;
        if (this.spectator) {
            patch(container, h('div.after-game', [h('result', this.result)]));
        } else {
            patch(container, h('div.after-game', [
                h('result', this.result),
                h('button.rematch', { on: { click: () => this.rematch() } }, "REMATCH"),
                h('button.newopp', { on: { click: () => this.newOpponent(this.model["home"]) } }, "NEW OPPONENT"),
            ]));
        }
    }

    private checkStatus = (msg) => {
        if (msg.gameId !== this.model["gameId"]) return;
        if (msg.status >= 0 && this.result === "") {
            this.clocks[0].pause(false);
            this.clocks[1].pause(false);
            this.result = msg.result;
            switch (msg.result) {
                case "1/2-1/2":
                    sound.draw();
                    break;
                case "1-0":
                    if (!this.spectator) {
                        if (this.mycolor === "white") {
                            sound.victory();
                        } else {
                            sound.defeat();
                        }
                    }
                    break;
                case "0-1":
                    if (!this.spectator) {
                        if (this.mycolor === "black") {
                            sound.victory();
                        } else {
                            sound.defeat();
                        }
                    }
                    break;
                // ABORTED
                default:
                    break;
            }
            this.gameOver();

            var container = document.getElementById('under-board') as HTMLElement;
            patch(container, h('under-board', [h('textarea', { attrs: { rows: 13} }, msg.pgn)]));

            if (this.tv) {
                setInterval(() => {this.doSend({ type: "updateTV", gameId: this.model["gameId"] });}, 2000);
            }
        }
    }

    private onMsgUpdateTV = (msg) => {
        if (msg.gameId !== this.model["gameId"]) {
            window.location.assign(this.model["home"] + '/tv');
        }
    }

    private setPieces = (color) => {
        console.log("setPieces()", this.variant, color)
        const idx = this.CSSindexes[variants.indexOf(this.variant)];
        switch (this.variant) {
        case "xiangqi":
            changeCSS('/static/' + VARIANTS[this.variant].css[idx] + '.css');
            break;
        case "shogi":
            var css = VARIANTS[this.variant].css[idx];
            // change shogi piece colors according to board orientation
            if (color === "black") css = css.replace('0', '1');
            changeCSS('/static/' + css + '.css');
            break;
        }
    }

    // In Capablanca we have to finelize castling because
    // chessground autoCastle works for standard chess only
    private castleRook = (kingDest, color) => {
        const diff: PiecesDiff = {};
        if (kingDest === "c") {
            diff[color === 'white' ? "a1" : "a8"] = undefined;
            diff[color === 'white' ? "d1" : "d8"] = {color: color, role: "rook"};
            this.chessground.setPieces(diff);
        };
        if (kingDest === "i") {
            diff[color === 'white' ? "j1" : "j8"] = undefined;
            diff[color === 'white' ? "h1" : "h8"] = {color: color, role: "rook"};
            this.chessground.setPieces(diff);
        };
    }

    private onMsgBoard = (msg) => {
        if (msg.gameId !== this.model["gameId"]) return;
        // Game aborted.
        if (msg["status"] === 0) return;

        // console.log("got board msg:", msg);
        this.ply = msg.ply
        this.fullfen = msg.fen;
        this.dests = msg.dests;
        const clocks = msg.clocks;

        const parts = msg.fen.split(" ");
        this.turnColor = parts[1] === "w" ? "white" : "black";

        if (msg.steps.length > 1) {
            this.steps = [];
            var container = document.getElementById('movelist') as HTMLElement;
            patch(container, h('div#movelist'));

            msg.steps.forEach((step) => { 
                this.steps.push(step);
                updateMovelist(this);
                });
        } else {
            if (msg.ply === this.steps.length) {
                const step = {
                    'fen': msg.fen,
                    'move': msg.lastMove[0] + msg.lastMove[1],
                    'check': msg.check,
                    'turnColor': this.turnColor,
                    'san': msg.steps[0].san,
                    };
                this.steps.push(step);
                updateMovelist(this);
            }
        }

        this.abortable = Number(parts[parts.length - 1]) <= 1;
        if (!this.spectator && !this.abortable && this.result === "") {
            var container = document.getElementById('abort') as HTMLElement;
            patch(container, h('button#abort', { props: {disabled: true} }));
        }

        var lastMove = msg.lastMove;
        if (lastMove !== null && this.variant === "shogi") {
            lastMove = usi2uci(lastMove[0] + lastMove[1]);
            lastMove = [lastMove.slice(0,2), lastMove.slice(2,4)];
        }
        // drop lastMove causing scrollbar flicker,
        // so we remove from part to avoid that
        if (lastMove !== null && lastMove[0][1] === '@') lastMove = [lastMove[1]];
        // save capture state before updating chessground
        const capture = lastMove !== null && this.chessground.state.pieces[lastMove[1]]

        if (lastMove !== null && (this.turnColor === this.mycolor || this.spectator)) {
            if (this.variant === "shogi") {
                sound.shogimove();
            } else {
                if (capture) {
                    sound.capture();
                } else {
                    sound.move();
                }
            }
        } else {
            lastMove = [];
        }
        this.checkStatus(msg);
        if (msg.check) {
            sound.check();
        }

        const oppclock = !this.flip ? 0 : 1;
        const myclock = 1 - oppclock;

        if (this.spectator) {
            this.chessground.set({
                fen: parts[0],
                turnColor: this.turnColor,
                check: msg.check,
                lastMove: lastMove,
            });
            updatePockets(this, this.vpocket0, this.vpocket1);
            this.clocks[0].pause(false);
            this.clocks[1].pause(false);
            this.clocks[oppclock].setTime(clocks[this.oppcolor]);
            this.clocks[myclock].setTime(clocks[this.mycolor]);
            if (!this.abortable && msg.status < 0) {
                if (this.turnColor === this.mycolor) {
                    this.clocks[myclock].start();
                } else {
                    this.clocks[oppclock].start();
                }
            }
        } else {
            if (this.turnColor === this.mycolor) {
                this.chessground.set({
                    fen: parts[0],
                    turnColor: this.turnColor,
                    movable: {
                        free: false,
                        color: this.mycolor,
                        dests: msg.dests,
                    },
                    check: msg.check,
                    lastMove: lastMove,
                });
                updatePockets(this, this.vpocket0, this.vpocket1);
                this.clocks[oppclock].pause(false);
                this.clocks[oppclock].setTime(clocks[this.oppcolor]);
                this.clocks[myclock].setTime(clocks[this.mycolor]);
                if (!this.abortable && msg.status < 0) {
                    this.clocks[myclock].start(clocks[this.mycolor]);
                    console.log('MY CLOCK STARTED');
                }
                // console.log("trying to play premove....");
                if (this.premove) this.performPremove();
                if (this.predrop) this.performPredrop();
            } else {
                this.chessground.set({
                    turnColor: this.turnColor,
                    premovable: {
                        dests: msg.dests,
                    },
                    check: msg.check,
                });
                this.clocks[myclock].pause(false);
                this.clocks[myclock].setTime(clocks[this.mycolor]);
                this.clocks[oppclock].setTime(clocks[this.oppcolor]);
                if (!this.abortable && msg.status < 0) {
                    this.clocks[oppclock].start(clocks[this.oppcolor]);
                    console.log('OPP CLOCK  STARTED');
                }
                if (this.oppIsRandomMover && msg.rm  !== "") {
                    this.doSend({ type: "move", gameId: this.model["gameId"], move: msg.rm, clocks: clocks });
                };
            };
        };
    }

    goPly = (ply) => {
        const step = this.steps[ply];
        // TODO: update pockets !!!
        this.chessground.set({
            fen: step.fen,
            turnColor: step.turnColor,
            movable: {
                free: false,
                color: this.spectator ? undefined : step.turnColor,
                dests: this.result === "" && ply === this.steps.length - 1 ? this.dests : undefined,
                },
            check: step.check,
            lastMove: step.move === undefined ? undefined :
                step.move.slice(1, 2) === '@' ? [step.move.slice(2, 4)] :
                    [step.move.slice(0, 2), step.move.slice(2, 4)],
        });
        this.fullfen = step.fen;
        updatePockets(this, this.vpocket0, this.vpocket1);
        // TODO: play sound if ply == this.ply + 1
        this.ply = ply
    }

    private doSend = (message) => {
        console.log("---> doSend():", message);
        this.sock.send(JSON.stringify(message));
    }

    private sendMove = (orig, dest, promo) => {
        // pause() will add increment!
        const oppclock = !this.flip ? 0 : 1
        const myclock = 1 - oppclock;
        const movetime = (this.clocks[myclock].running) ? Date.now() - this.clocks[myclock].startTime : 0;
        this.clocks[myclock].pause((this.base === 0 && this.ply < 2) ? false : true);
        // console.log("sendMove(orig, dest, prom)", orig, dest, promo);
        const uci_move = orig + dest + promo;
        const move = this.variant === "shogi" ? uci2usi(uci_move) : uci_move;
        // console.log("sendMove(move)", move);
        // TODO: if premoved, send 0 time
        let bclock, clocks;
        if (!this.flip) {
            bclock = this.mycolor === "black" ? 1 : 0;
        } else {
            bclock = this.mycolor === "black" ? 0 : 1;
        }
        const wclock = 1 - bclock
        clocks = {movetime: movetime, black: this.clocks[bclock].duration, white: this.clocks[wclock].duration};
        this.doSend({ type: "move", gameId: this.model["gameId"], move: move, clocks: clocks });
        if (!this.abortable) this.clocks[oppclock].start();
    }

    private onMove = () => {
        return (orig, dest, capturedPiece) => {
            console.log("   ground.onMove()", orig, dest, capturedPiece);
            if (this.variant === "shogi") {
                sound.shogimove();
            } else {
                if (capturedPiece) {
                    sound.capture();
                } else {
                    sound.move();
                }
            }
        }
    }

    private onDrop = () => {
        return (piece, dest) => {
            console.log("ground.onDrop()", piece, dest);
            if (dest != "a0" && piece.role && dropIsValid(this.dests, piece.role, dest)) {
                if (this.variant === "shogi") {
                    sound.shogimove();
                } else {
                    sound.move();
                }
            } else {
                this.clickDrop = piece;
            }
        }
    }

    private setPremove = (orig, dest, meta) => {
        this.premove = { orig, dest, meta };
        console.log("setPremove() to:", orig, dest, meta);
    }

    private unsetPremove = () => {
        this.premove = null;
    }

    private setPredrop = (role, key) => {
        this.predrop = { role, key };
        console.log("setPredrop() to:", role, key);
    }

    private unsetPredrop = () => {
        this.predrop = null;
    }

    private performPremove = () => {
        const { orig, dest, meta } = this.premove;
        // TODO: promotion?
        console.log("performPremove()", orig, dest, meta);
        this.chessground.playPremove();
        this.premove = null;
    }

    private performPredrop = () => {
        const { role, key } = this.predrop;
        console.log("performPredrop()", role, key);
        this.chessground.playPredrop(drop => { return dropIsValid(this.dests, drop.role, drop.key); });
        this.predrop = null;
    }

    private onUserMove = (orig, dest, meta) => {
        // chessground doesn't knows about ep, so we have to remove ep captured pawn
        const pieces = this.chessground.state.pieces;
        const geom = this.chessground.state.geometry;
        console.log("ground.onUserMove()", orig, dest, meta, pieces);
        const moved = pieces[dest] as Piece;
        const firstRankIs0 = this.chessground.state.dimensions.height === 10;
        if (meta.captured === undefined && moved.role === "pawn" && orig[0] != dest[0] && hasEp(this.variant)) {
            const pos = key2pos(dest, firstRankIs0),
            pawnPos: Pos = [pos[0], pos[1] + (this.mycolor === 'white' ? -1 : 1)];
            const diff: PiecesDiff = {};
            diff[pos2key(pawnPos, geom)] = undefined;
            this.chessground.setPieces(diff);
            meta.captured = {role: "pawn"};
        };
        // increase pocket count
        if ((this.variant === "crazyhouse" || this.variant === "shogi") && meta.captured) {
            var role = meta.captured.role
            if (meta.captured.promoted) role = this.variant === "shogi" ? meta.captured.role.slice(1) as Role : "pawn";

            if (this.flip) {
                this.pockets[0][role]++;
                this.vpocket0 = patch(this.vpocket0, pocketView(this, this.mycolor, "top"));
            } else {
                this.pockets[1][role]++;
                this.vpocket1 = patch(this.vpocket1, pocketView(this, this.mycolor, "bottom"));
            }
        };
        // chessground autoCastle works for standard chess only
        if (this.variant === "capablanca" && moved.role === "king" && orig[0] === "f") this.castleRook(dest[0], this.mycolor);

        //  gating elephant/hawk
        if (this.variant === "seirawan") {
            if (!this.promotion.start(orig, dest, meta) && !this.gating.start(this.fullfen, orig, dest, meta)) this.sendMove(orig, dest, '');
        } else {
            if (!this.promotion.start(orig, dest, meta)) this.sendMove(orig, dest, '');
        };
    }

    private onUserDrop = (role, dest) => {
        // console.log("ground.onUserDrop()", role, dest);
        // decrease pocket count
        if (dropIsValid(this.dests, role, dest)) {
            if (this.flip) {
                this.pockets[0][role]--;
                this.vpocket0 = patch(this.vpocket0, pocketView(this, this.mycolor, "top"));
            } else {
                this.pockets[1][role]--;
                this.vpocket1 = patch(this.vpocket1, pocketView(this, this.mycolor, "bottom"));
            }
            this.sendMove(roleToSan[role] + "@", dest, '')
            // console.log("sent move", move);
        } else {
            console.log("!!! invalid move !!!", role, dest);
            // restore board
            this.clickDrop = undefined;
            this.chessground.set({
                fen: this.fullfen,
                lastMove: this.lastmove,
                turnColor: this.mycolor,
                movable: {
                    dests: this.dests,
                    showDests: true,
                    },
                }
            );
        }
    }

    // use this for sittuyin in place promotion ?
    // Or implement ondblclick handler to emit move in chessground?
    // https://www.w3schools.com/jsref/event_ondblclick.asp
    private onChange = (selected) => {
        return () => {
            console.log("   ground.onChange()", selected);
        }
    }

    // use this for sittuyin in place promotion ?
    private onSelect = (selected) => {
        return (key) => {
            console.log("   ground.onSelect()", key, selected, this.clickDrop, this.chessground.state);
            // If drop selection was set dropDests we have to restore dests here
            if (this.chessground.state.movable.dests === undefined) return;
            if (key != "a0" && "a0" in this.chessground.state.movable.dests) {
                if (this.clickDrop !== undefined && dropIsValid(this.dests, this.clickDrop.role, key)) {
                    this.chessground.newPiece(this.clickDrop, key);
                    this.onUserDrop(this.clickDrop.role, key);
                }
                this.clickDrop = undefined;
                this.chessground.set({ movable: { dests: this.dests }});
            };
        }
    }

    private onMsgUserConnected = (msg) => {
        this.model["username"] = msg["username"];
        renderUsername(this.model["home"], this.model["username"]);
        if (this.spectator) {
            this.doSend({ type: "is_user_online", username: this.wplayer });
            this.doSend({ type: "is_user_online", username: this.bplayer });

            // we want to know lastMove and check status
            this.doSend({ type: "board", gameId: this.model["gameId"] });
        } else {
            const opp_name = this.model["username"] === this.wplayer ? this.bplayer : this.wplayer;
            this.doSend({ type: "is_user_online", username: opp_name });

            var container = document.getElementById('bottom-player') as HTMLElement;
            patch(container, h('i-side.online#bottom-player', {class: {"icon": true, "icon-online": true, "icon-offline": false}}));

            // prevent sending gameStart message when user just reconecting
            if (msg.ply === 0) {
                this.doSend({ type: "ready", gameId: this.model["gameId"] });
            }
            this.doSend({ type: "board", gameId: this.model["gameId"] });
        }
    }

    private onMsgUserOnline = (msg) => {
        console.log(msg);
        if (msg.username === this.players[0]) {
            var container = document.getElementById('top-player') as HTMLElement;
            patch(container, h('i-side.online#top-player', {class: {"icon": true, "icon-online": true, "icon-offline": false}}));
        } else {
            var container = document.getElementById('bottom-player') as HTMLElement;
            patch(container, h('i-side.online#bottom-player', {class: {"icon": true, "icon-online": true, "icon-offline": false}}));
        }
    }

    private onMsgUserDisconnected = (msg) => {
        console.log(msg);
        if (msg.username === this.players[0]) {
            var container = document.getElementById('top-player') as HTMLElement;
            patch(container, h('i-side.online#top-player', {class: {"icon": true, "icon-online": false, "icon-offline": true}}));
        } else {
            var container = document.getElementById('bottom-player') as HTMLElement;
            patch(container, h('i-side.online#bottom-player', {class: {"icon": true, "icon-online": false, "icon-offline": true}}));
        }
    }

    private onMsgChat = (msg) => {
        chatMessage(msg.user, msg.message, "roundchat");
    }

    private onMsgOffer = (msg) => {
        chatMessage("", msg.message, "roundchat");
    }


    private onMessage = (evt) => {
        console.log("<+++ onMessage():", evt.data);
        var msg = JSON.parse(evt.data);
        switch (msg.type) {
            case "board":
                this.onMsgBoard(msg);
                break;
            case "gameEnd":
                this.checkStatus(msg);
                break;
            case "gameStart":
                this.onMsgGameStart(msg);
                break;
            case "game_user_connected":
                this.onMsgUserConnected(msg);
                break;
            case "user_online":
                this.onMsgUserOnline(msg);
                break;
            case "user_disconnected":
                this.onMsgUserDisconnected(msg);
                break;
            case "roundchat":
                this.onMsgChat(msg);
                break;
            case "new_game":
                this.onMsgNewGame(msg);
                break;
            case "offer":
                this.onMsgOffer(msg);
                break;
            case "updateTV":
                this.onMsgUpdateTV(msg);
                break
        }
    }
}
