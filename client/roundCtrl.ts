import Sockette from 'sockette';

import { init } from 'snabbdom';
import { VNode } from 'snabbdom/vnode';
import { h } from 'snabbdom/h';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

import { key2pos, pos2key } from 'chessgroundx/util';
import { Chessground } from 'chessgroundx';
import { Api } from 'chessgroundx/api';
import { Color, Dests, PiecesDiff, Role, Key, Pos, Piece, Variant, Notation } from 'chessgroundx/types';

import { Clock, renderTime } from './clock';
import makeGating from './gating';
import makePromotion from './promotion';
import { dropIsValid, pocketView, updatePockets } from './pocket';
import { sound } from './sound';
import { variants, hasEp, needPockets, roleToSan, grand2zero, zero2grand, VARIANTS, getPockets, SHOGI_HANDICAP_FEN } from './chess';
import { crosstableView } from './crosstable';
import { chatMessage, chatView } from './chat';
import { settingsView } from './settings';
import { movelistView, updateMovelist, selectMove } from './movelist';
import resizeHandle from './resize';
import { renderRdiff, result } from './profile'
import { player } from './player';
import { updateCount, updatePoint } from './info';

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
    byoyomiPeriod: number;
    mycolor: Color;
    oppcolor: Color;
    turnColor: Color;
    clocks: any;
    clocktimes: any;
    abortable: boolean;
    gameId: string;
    variant: string;
    hasPockets: boolean;
    pockets: any;
    vpocket0: any;
    vpocket1: any;
    vplayer0: any;
    vplayer1: any;
    vpointCho: any;
    vpointHan: any;
    vpng: any;
    gameControls: any;
    moveControls: any;
    ctableContainer: any;
    gating: any;
    promotion: any;
    dests: Dests;
    promotions: string[];
    lastmove: Key[];
    premove: any;
    predrop: any;
    preaction: boolean;
    result: string;
    flip: boolean;
    spectator: boolean;
    settings: boolean;
    tv: boolean;
    status: number;
    steps;
    pgn: string;
    ply: number;
    players: string[];
    titles: string[];
    ratings: string[];
    CSSindexesB: number[];
    CSSindexesP: number[];
    clickDrop: Piece | undefined;
    clickDropEnabled: boolean;
    showDests: boolean;
    blindfold: boolean;
    handicap: boolean;
    autoqueen: boolean;
    setupFen: string;

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

                var container = document.getElementById('player1') as HTMLElement;
                patch(container, h('i-side.online#player1', {class: {"icon": true, "icon-online": false, "icon-offline": true}}));
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
        this.byoyomiPeriod = model["byo"] as number;
        this.status = model["status"] as number;
        this.tv = model["tv"];
        this.steps = [];
        this.pgn = "";
        this.ply = -1;

        this.flip = false;
        this.settings = true;
        this.CSSindexesB = variants.map((variant) => localStorage[variant + "_board"] === undefined ? 0 : Number(localStorage[variant + "_board"]));
        this.CSSindexesP = variants.map((variant) => localStorage[variant + "_pieces"] === undefined ? 0 : Number(localStorage[variant + "_pieces"]));
        this.clickDropEnabled = localStorage.clickDropEnabled === undefined ? false : localStorage.clickDropEnabled === "true";
        this.showDests = localStorage.showDests === undefined ? true : localStorage.showDests === "true";
        this.blindfold = localStorage.blindfold === undefined ? false : localStorage.blindfold === "true";
        this.autoqueen = localStorage.autoqueen === undefined ? false : localStorage.autoqueen === "true";

        this.spectator = this.model["username"] !== this.wplayer && this.model["username"] !== this.bplayer;
        this.hasPockets = needPockets(this.variant);
        this.handicap = (this.variant === 'shogi') ? Object.keys(SHOGI_HANDICAP_FEN).some(e => SHOGI_HANDICAP_FEN[e] === this.fullfen) : false;

        // orientation = this.mycolor
        if (this.spectator) {
            this.mycolor = 'white';
            this.oppcolor = 'black';
        } else {
            this.mycolor = this.model["username"] === this.wplayer ? 'white' : 'black';
            this.oppcolor = this.model["username"] === this.wplayer ? 'black' : 'white';
        }

        // players[0] is top player, players[1] is bottom player
        this.players = [
            this.mycolor === "white" ? this.bplayer : this.wplayer,
            this.mycolor === "white" ? this.wplayer : this.bplayer
        ];
        this.titles = [
            this.mycolor === "white" ? this.model['btitle'] : this.model['wtitle'],
            this.mycolor === "white" ? this.model['wtitle'] : this.model['btitle']
        ];
        this.ratings = [
            this.mycolor === "white" ? this.model['brating'] : this.model['wrating'],
            this.mycolor === "white" ? this.model['wrating'] : this.model['brating']
        ];

        this.premove = null;
        this.predrop = null;
        this.preaction = false;

        this.result = "";
        const parts = this.fullfen.split(" ");
        this.abortable = Number(parts[parts.length - 1]) <= 1;

        const fen_placement = parts[0];
        this.turnColor = parts[1] === "w" ? "white" : "black";

        this.steps.push({
            'fen': fen_placement,
            'move': undefined,
            'check': false,
            'turnColor': this.turnColor,
            });

        this.chessground = Chessground(el, {
            fen: fen_placement,
            variant: this.variant as Variant,
            geometry: VARIANTS[this.variant].geom,
            notation: (this.variant === 'janggi') ? Notation.JANGGI : Notation.DEFAULT,
            orientation: this.mycolor,
            turnColor: this.turnColor,
            autoCastle: this.variant !== 'cambodian',
            animation: {
                enabled: true,
            },
            events: {
                insert(elements) {resizeHandle(elements);}
            }
        });

        if (this.spectator) {
            this.chessground.set({
                //viewOnly: false,
                movable: { free: false },
                draggable: { enabled: false },
                premovable: { enabled: false },
                predroppable: { enabled: false },
                events: { move: this.onMove() }
            });
        } else {
            this.chessground.set({
                movable: {
                    free: false,
                    color: this.mycolor,
                    showDests: this.showDests,
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
                    select: this.onSelect(),
                }
            });
        };

        this.gating = makeGating(this);
        this.promotion = makePromotion(this);

        // initialize users
        const player0 = document.getElementById('rplayer0') as HTMLElement;
        const player1 = document.getElementById('rplayer1') as HTMLElement;
        this.vplayer0 = patch(player0, player('player0', this.titles[0], this.players[0], this.ratings[0], model["level"]));
        this.vplayer1 = patch(player1, player('player1', this.titles[1], this.players[1], this.ratings[1], model["level"]));

        // initialize pockets
        if (this.hasPockets) {
            const pocket0 = document.getElementById('pocket0') as HTMLElement;
            const pocket1 = document.getElementById('pocket1') as HTMLElement;
            updatePockets(this, pocket0, pocket1);
        }

        // initialize clocks
        this.clocktimes = {};
        const c0 = new Clock(this.base, this.inc, document.getElementById('clock0') as HTMLElement, 'clock0', this.byoyomiPeriod);
        const c1 = new Clock(this.base, this.inc, document.getElementById('clock1') as HTMLElement, 'clock1', this.byoyomiPeriod);
        this.clocks = [c0, c1];
        this.clocks[0].onTick(renderTime);
        this.clocks[1].onTick(renderTime);

        // initialize crosstable
        this.ctableContainer = document.getElementById('ctable-container') as HTMLElement;
        const onMoreTime = () => {
            // TODO: enable when this.flip is true
            if (this.model['wtitle'] === 'BOT' || this.model['btitle'] === 'BOT' || this.spectator || this.status >= 0 || this.flip) return;
            this.clocks[0].setTime(this.clocks[0].duration + 15 * 1000);
            this.doSend({ type: "moretime", gameId: this.model["gameId"] });
            const oppName = (this.model["username"] === this.wplayer) ? this.bplayer : this.wplayer;
            chatMessage('', oppName + ' +15 seconds', "roundchat");
        }

        // initialize janggi point indicator
        const point0 = document.getElementById('janggi-point0') as HTMLElement;
        const point1 = document.getElementById('janggi-point1') as HTMLElement;
        this.vpointCho = this.mycolor === 'white' ? patch(point1, h('div#janggi-point-cho')) : patch(point0, h('div#janggi-point-cho'));
        this.vpointHan = this.mycolor === 'white' ? patch(point0, h('div#janggi-point-han')) : patch(point1, h('div#janggi-point-han'));

        if (!this.spectator) {
            var container = document.getElementById('clock0') as HTMLElement;
            patch(container, h('div.clock-wrap#clock0', [
                h('div.more-time', [
                    h('button.icon.icon-plus-square', {
                        props: {type: "button", title: "Give 15 seconds"},
                        on: {click: () => onMoreTime() }
                    })
                ])
            ])
            );
        }

        const flagCallback = () => {
            if (this.turnColor === this.mycolor) {
                this.chessground.stop();
                // console.log("Flag");
                this.doSend({ type: "flag", gameId: this.model["gameId"] });
            }
        }
        if (!this.spectator) this.clocks[1].onFlag(flagCallback);

        var container = document.getElementById('game-controls') as HTMLElement;
        if (!this.spectator) {
            const pass = this.variant === 'janggi';
            this.gameControls = patch(container, h('div.btn-controls', [
                h('button#abort', { on: { click: () => this.abort() }, props: {title: 'Abort'} }, [h('i', {class: {"icon": true, "icon-abort": true} } ), ]),
                h('button#draw', { on: { click: () => (pass) ? this.pass() : this.draw() }, props: {title: (pass) ? 'Pass' : "Draw"} }, [(pass) ? 'Pass' : h('i', {class: {"icon": true, "icon-hand-paper-o": true} } ), ]),
                h('button#resign', { on: { click: () => this.resign() }, props: {title: "Resign"} }, [h('i', {class: {"icon": true, "icon-flag-o": true} } ), ]),
                ])
            );
        } else {
            this.gameControls = patch(container, h('div'));
        }

        patch(document.getElementById('board-settings') as HTMLElement, settingsView(this));

        patch(document.getElementById('movelist') as HTMLElement, movelistView(this));

        patch(document.getElementById('roundchat') as HTMLElement, chatView(this, "roundchat"));
    }

    getGround = () => this.chessground;
    getDests = () => this.dests;

    private abort = () => {
        // console.log("Abort");
        this.doSend({ type: "abort", gameId: this.model["gameId"] });
    }

    private draw = () => {
        // console.log("Draw");
        this.doSend({ type: "draw", gameId: this.model["gameId"] });
    }

    private resign = () => {
        // console.log("Resign");
        if (confirm('Are you sure you want to resign?')) {
            this.doSend({ type: "resign", gameId: this.model["gameId"] });
        }
    }

    private pass = () => {
        var passKey = 'z0';
        const pieces = this.chessground.state.pieces;
        const dests = this.chessground.state.movable.dests;
        for (let key in pieces) {
            if (pieces[key]!.role === 'king' && pieces[key]!.color === this.turnColor) {
                if ((key in dests!) && (dests![key].indexOf(key as Key) >= 0)) passKey = key;
            }
        }
        if (passKey !== 'z0') {
            this.chessground.selectSquare(passKey as Key);
            sound.move();
            this.sendMove(passKey, passKey, '');
        }
    }

    // Janggi second player (Red) setup
    private onMsgSetup = (msg) => {
        this.setupFen = msg.fen;
        this.chessground.set({fen: this.setupFen});

        const side = (msg.color === 'white') ? 'Blue (Cho)' : 'Red (Han)';
        const message = 'Waiting for ' + side + ' to choose starting positions of the horses and elephants...';

        if (this.spectator || msg.color !== this.mycolor) {
            chatMessage('', message, "roundchat");
            return;
        }

        chatMessage('', message, "roundchat");

        const switchLetters = (side) => {
            const white = this.mycolor === 'white';
            const rank = (white) ? 9 : 0;
            const horse = (white) ? 'N' : 'n';
            const elephant = (white) ? 'B' : 'b';
            var parts = this.setupFen.split(' ')[0].split('/');
            var [left, right] = parts[rank].split('1')
            if (side === -1) {
                left = left.replace(horse, '*').replace(elephant, horse).replace('*', elephant);
            } else {
                right = right.replace(horse, '*').replace(elephant, horse).replace('*', elephant);
            }
            parts[rank] = left + '1' + right;
            this.setupFen = parts.join('/');
            this.chessground.set({fen: this.setupFen});
        }

        const sendSetup = () => {
            patch(document.getElementById('janggi-setup-buttons') as HTMLElement, h('div#empty'));
            this.doSend({ type: "setup", gameId: this.model["gameId"], color: this.mycolor, fen: this.setupFen + ' w - - 0 1' });
        }

        const leftSide = (this.mycolor === 'white') ? -1 : 1;
        const rightSide = leftSide * -1;
        patch(document.getElementById('janggi-setup-buttons') as HTMLElement, h('div#janggi-setup-buttons', [
            h('button#flipLeft', { on: { click: () => switchLetters(leftSide) } }, [h('i', {props: {title: 'Switch pieces'}, class: {"icon": true, "icon-exchange": true} } ), ]),
            h('button', { on: { click: () => sendSetup() } }, [h('i', {props: {title: 'Ready'}, class: {"icon": true, "icon-check": true} } ), ]),
            h('button#flipRight', { on: { click: () => switchLetters(rightSide) } }, [h('i', {props: {title: 'Switch pieces'}, class: {"icon": true, "icon-exchange": true} } ), ]),
        ]));
    }

    private onMsgGameStart = (msg) => {
        // console.log("got gameStart msg:", msg);
        if (msg.gameId !== this.model["gameId"]) return;
        if (!this.spectator) sound.genericNotify();
    }

    private onMsgNewGame = (msg) => {
        window.location.assign(this.model["home"] + '/' + msg["gameId"]);
    }

    private rematch = () => {
        this.doSend({ type: "rematch", gameId: this.model["gameId"], handicap: this.handicap });
    }

    private newOpponent = (home) => {
        this.doSend({"type": "leave", "gameId": this.model["gameId"]});
        window.location.assign(home);
    }

    private analysis = (home) => {
        window.location.assign(home + '/' + this.model["gameId"]);
    }

    private gameOver = (rdiffs) => {
        var container = document.getElementById('movelist') as HTMLElement;
        var movesTail: VNode[] = [];
        if (this.turnColor === 'black') movesTail.push(h('li.move.hidden', 'X'));
        movesTail.push(h('div#result', result(this.variant, this.status, this.result)));
        patch(container, h('ol.movelist#movelist', movesTail));

        container = document.getElementById('wrdiff') as HTMLElement;
        patch(container, renderRdiff(rdiffs["wrdiff"]));

        container = document.getElementById('brdiff') as HTMLElement;
        patch(container, renderRdiff(rdiffs["brdiff"]));

        // console.log(rdiffs)
        if (!this.spectator) {
            this.gameControls = patch(this.gameControls, h('div'));
            patch(this.gameControls, h('div#after-game-controls', [
                h('button.rematch', { on: { click: () => this.rematch() } }, "REMATCH"),
                h('button.newopp', { on: { click: () => this.newOpponent(this.model["home"]) } }, "NEW OPPONENT"),
                h('button.analysis', { on: { click: () => this.analysis(this.model["home"]) } }, "ANALYSIS BOARD"),
            ]));
        }
    }

    private checkStatus = (msg) => {
        if (msg.gameId !== this.model["gameId"]) return;
        if (msg.status >= 0 && this.result === "") {
            this.clocks[0].pause(false);
            this.clocks[1].pause(false);
            this.result = msg.result;
            this.status = msg.status;
            if (!this.spectator) {
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
            }
            this.gameOver(msg.rdiffs);
            selectMove(this, this.ply);

            if (msg.ct !== "") {
                this.ctableContainer = patch(this.ctableContainer, h('div#ctable-container'));
                this.ctableContainer = patch(this.ctableContainer, crosstableView(msg.ct, this.model["gameId"]));
            }

            // clean up gating/promotion widget left over the ground while game ended by time out
            var container = document.getElementById('extension_choice') as HTMLElement;
            if (container instanceof Element) patch(container, h('extension'));

            if (this.tv) {
                setInterval(() => {this.doSend({ type: "updateTV", gameId: this.model["gameId"], profileId: this.model["profileid"] });}, 2000);
            }
        }
    }

    private onMsgUpdateTV = (msg) => {
        if (msg.gameId !== this.model["gameId"]) {
            if (this.model["profileid"] !== "") {
                window.location.assign(this.model["home"] + '/@/' + this.model["profileid"] + '/tv');
            } else {
                window.location.assign(this.model["home"] + '/tv');
            }
            // TODO: reuse current websocket to fix https://github.com/gbtami/pychess-variants/issues/142
            // this.doSend({ type: "game_user_connected", username: this.model["username"], gameId: msg.gameId });
        }
    }

    private onMsgBoard = (msg) => {
        if (msg.gameId !== this.model["gameId"]) return;

        const pocketsChanged = this.hasPockets && (getPockets(this.fullfen) !== getPockets(msg.fen));

        // console.log("got board msg:", msg);
        const latestPly = (this.ply === -1 || msg.ply === this.ply + 1);
        if (latestPly) this.ply = msg.ply

        this.fullfen = msg.fen;
        this.dests = msg.dests;
        // list of legal promotion moves
        this.promotions = msg.promo;
        this.clocktimes = msg.clocks;

        const parts = msg.fen.split(" ");
        this.turnColor = parts[1] === "w" ? "white" : "black";

        if (msg.steps.length > 1) {
            this.steps = [];
            var container = document.getElementById('movelist') as HTMLElement;
            patch(container, h('div#movelist'));

            msg.steps.forEach((step) => { 
                this.steps.push(step);
                });
            updateMovelist(this, 1, this.steps.length);
        } else {
            if (msg.ply === this.steps.length) {
                const step = {
                    'fen': msg.fen,
                    'move': msg.lastMove,
                    'check': msg.check,
                    'turnColor': this.turnColor,
                    'san': msg.steps[0].san,
                    };
                this.steps.push(step);
                const activate = !this.spectator || latestPly
                updateMovelist(this, this.steps.length - 1, this.steps.length, activate);
            }
        }

        this.abortable = Number(msg.ply) <= 1;
        if (!this.spectator && !this.abortable && this.result === "") {
            var container = document.getElementById('abort') as HTMLElement;
            patch(container, h('button#abort', { props: {disabled: true} }));
        }

        var lastMove = msg.lastMove;
        if (lastMove !== null) {
            if (this.variant === 'xiangqi' || this.variant.startsWith('grand') || this.variant === 'shako' || this.variant === 'janggi') {
                lastMove = grand2zero(lastMove);
            }
            // drop lastMove causing scrollbar flicker,
            // so we remove from part to avoid that
            lastMove = lastMove.indexOf('@') > -1 ? [lastMove.slice(-2)] : [lastMove.slice(0, 2), lastMove.slice(2, 4)];
        }
        // save capture state before updating chessground
        // 960 king takes rook castling is not capture
        const step = this.steps[this.steps.length - 1];
        const capture = (lastMove !== null) && ((this.chessground.state.pieces[lastMove[1]] && step.san.slice(0, 2) !== 'O-') || (step.san.slice(1, 2) === 'x'));
        // console.log("CAPTURE ?", capture, lastMove, step);
        if (lastMove !== null && (this.turnColor === this.mycolor || this.spectator)) {
            if (this.variant.endsWith('shogi')) {
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
        if (!this.spectator && msg.check) {
            sound.check();
        }

        const oppclock = !this.flip ? 0 : 1;
        const myclock = 1 - oppclock;

        if (this.variant === "makruk" || this.variant === "cambodian" || this.variant === "sittuyin") {
            updateCount(msg.fen);
        }

        if (this.variant === "janggi") {
            [this.vpointCho, this.vpointHan] = updatePoint(msg.fen, this.vpointCho, this.vpointHan);
        }

        if (this.spectator) {
            if (latestPly) {
                this.chessground.set({
                    fen: parts[0],
                    turnColor: this.turnColor,
                    check: msg.check,
                    lastMove: lastMove,
                });
                if (pocketsChanged) updatePockets(this, this.vpocket0, this.vpocket1);
            }
            this.clocks[0].pause(false);
            this.clocks[1].pause(false);
            this.clocks[oppclock].setTime(this.clocktimes[this.oppcolor]);
            this.clocks[myclock].setTime(this.clocktimes[this.mycolor]);
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
                if (pocketsChanged) updatePockets(this, this.vpocket0, this.vpocket1);
                this.clocks[oppclock].pause(false);
                this.clocks[oppclock].setTime(this.clocktimes[this.oppcolor]);
                this.clocks[myclock].setTime(this.clocktimes[this.mycolor]);
                if (!this.abortable && msg.status < 0) {
                    this.clocks[myclock].start(this.clocktimes[this.mycolor]);
                    // console.log('MY CLOCK STARTED');
                }

                // console.log("trying to play premove....");
                if (this.premove) this.performPremove();
                if (this.predrop) this.performPredrop();

            } else {
                this.chessground.set({
                    // giving fen here will place castling rooks to their destination in chess960 variants
                    fen: parts[0],
                    turnColor: this.turnColor,
                    premovable: {
                        dests: msg.dests,
                    },
                    check: msg.check,
                });
                this.clocks[myclock].pause(false);
                this.clocks[myclock].setTime(this.clocktimes[this.mycolor]);
                this.clocks[oppclock].setTime(this.clocktimes[this.oppcolor]);
                if (!this.abortable && msg.status < 0) {
                    this.clocks[oppclock].start(this.clocktimes[this.oppcolor]);
                    // console.log('OPP CLOCK  STARTED');
                }
            };
        };
    }

    goPly = (ply) => {
        const step = this.steps[ply];
        var move = step['move'];
        var capture = false;
        if (move !== undefined) {
            if (this.variant == 'xiangqi' || this.variant.startsWith('grand') || this.variant === 'shako' || this.variant === 'janggi') move = grand2zero(move);
            move = move.indexOf('@') > -1 ? [move.slice(-2)] : [move.slice(0, 2), move.slice(2, 4)];
            // 960 king takes rook castling is not capture
            capture = (this.chessground.state.pieces[move[move.length - 1]] !== undefined && step.san.slice(0, 2) !== 'O-') || (step.san.slice(1, 2) === 'x');
        }

        this.chessground.set({
            fen: step.fen,
            turnColor: step.turnColor,
            movable: {
                free: false,
                color: this.spectator ? undefined : step.turnColor,
                dests: this.result === "" && ply === this.steps.length - 1 ? this.dests : undefined,
                },
            check: step.check,
            lastMove: move,
        });
        this.fullfen = step.fen;
        updatePockets(this, this.vpocket0, this.vpocket1);

        if (this.variant === "makruk" || this.variant === "cambodian" || this.variant === "sittuyin") {
            updateCount(step.fen);
        }

        if (this.variant === "janggi") {
            [this.vpointCho, this.vpointHan] = updatePoint(step.fen, this.vpointCho, this.vpointHan);
        }

        if (ply === this.ply + 1) {
            if (this.variant.endsWith('shogi')) {
                sound.shogimove();
            } else {
                if (capture) {
                    sound.capture();
                } else {
                    sound.move();
                }
            }
        }
        this.ply = ply
    }

    private doSend = (message) => {
        // console.log("---> doSend():", message);
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
        const move = (this.variant === 'xiangqi' || this.variant.startsWith('grand') || this.variant === 'shako' || this.variant === 'janggi') ? zero2grand(uci_move) : uci_move;

        // console.log("sendMove(move)", move);
        // TODO: if premoved, send 0 time
        let bclock, clocks;
        if (!this.flip) {
            bclock = this.mycolor === "black" ? 1 : 0;
        } else {
            bclock = this.mycolor === "black" ? 0 : 1;
        }
        const wclock = 1 - bclock

        const increment = (this.inc > 0 && this.ply >= 2) ? this.inc * 1000 : 0;
        const bclocktime = (this.mycolor === "black" && this.preaction) ? this.clocktimes.black + increment: this.clocks[bclock].duration;
        const wclocktime = (this.mycolor === "white" && this.preaction) ? this.clocktimes.white + increment: this.clocks[wclock].duration;

        clocks = {movetime: movetime, black: bclocktime, white: wclocktime};

        this.doSend({ type: "move", gameId: this.model["gameId"], move: move, clocks: clocks });

        if (!this.abortable) this.clocks[oppclock].start();
    }

    private onMove = () => {
        return (orig, dest, capturedPiece) => {
            console.log("   ground.onMove()", orig, dest, capturedPiece);
            if (this.variant.endsWith('shogi')) {
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
            // console.log("ground.onDrop()", piece, dest);
            if (dest != 'z0' && piece.role && dropIsValid(this.dests, piece.role, dest)) {
                if (this.variant.endsWith('shogi')) {
                    sound.shogimove();
                } else {
                    sound.move();
                }
            } else if (this.clickDropEnabled) {
                this.clickDrop = piece;
            }
        }
    }

    private setPremove = (orig, dest, meta) => {
        this.premove = { orig, dest, meta };
        // console.log("setPremove() to:", orig, dest, meta);
    }

    private unsetPremove = () => {
        this.premove = null;
        this.preaction = false;
    }

    private setPredrop = (role, key) => {
        this.predrop = { role, key };
        // console.log("setPredrop() to:", role, key);
    }

    private unsetPredrop = () => {
        this.predrop = null;
        this.preaction = false;
    }

    private performPremove = () => {
        // const { orig, dest, meta } = this.premove;
        // TODO: promotion?
        // console.log("performPremove()", orig, dest, meta);
        this.chessground.playPremove();
        this.premove = null;
    }

    private performPredrop = () => {
        // const { role, key } = this.predrop;
        // console.log("performPredrop()", role, key);
        this.chessground.playPredrop(drop => { return dropIsValid(this.dests, drop.role, drop.key); });
        this.predrop = null;
    }

    private onUserMove = (orig, dest, meta) => {
        this.preaction = meta.premove === true;
        // chessground doesn't knows about ep, so we have to remove ep captured pawn
        const pieces = this.chessground.state.pieces;
        const geom = this.chessground.state.geometry;
        // console.log("ground.onUserMove()", orig, dest, meta);
        var moved = pieces[dest];
        // Fix king to rook 960 castling case
        if (moved === undefined) moved = {role: 'king', color: this.mycolor} as Piece;
        const firstRankIs0 = this.chessground.state.dimensions.height === 10;
        if (meta.captured === undefined && moved !== undefined && moved.role === "pawn" && orig[0] != dest[0] && hasEp(this.variant)) {
            const pos = key2pos(dest, firstRankIs0),
            pawnPos: Pos = [pos[0], pos[1] + (this.mycolor === 'white' ? -1 : 1)];
            const diff: PiecesDiff = {};
            diff[pos2key(pawnPos, geom)] = undefined;
            this.chessground.setPieces(diff);
            meta.captured = {role: "pawn"};
        };
        // increase pocket count
        if ((this.variant.endsWith('house') || this.variant.endsWith('shogi') || this.variant === 'shogun') && meta.captured) {
            var role = meta.captured.role
            if (meta.captured.promoted) role = (this.variant.endsWith('shogi')|| this.variant === 'shogun') ? meta.captured.role.slice(1) as Role : "pawn";

            if (this.flip) {
                this.pockets[0][role]++;
                this.vpocket0 = patch(this.vpocket0, pocketView(this, this.mycolor, "top"));
            } else {
                this.pockets[1][role]++;
                this.vpocket1 = patch(this.vpocket1, pocketView(this, this.mycolor, "bottom"));
            }
        };

        //  gating elephant/hawk
        if (this.variant === "seirawan" || this.variant === "shouse") {
            if (!this.promotion.start(moved.role, orig, dest, meta) && !this.gating.start(this.fullfen, orig, dest)) this.sendMove(orig, dest, '');
        } else {
            if (!this.promotion.start(moved.role, orig, dest, meta)) this.sendMove(orig, dest, '');
        this.preaction = false;
        };
    }

    private onUserDrop = (role, dest, meta) => {
        this.preaction = meta.predrop === true;
        // console.log("ground.onUserDrop()", role, dest, meta);
        // decrease pocket count
        if (dropIsValid(this.dests, role, dest)) {
            if (this.flip) {
                this.pockets[0][role]--;
                this.vpocket0 = patch(this.vpocket0, pocketView(this, this.mycolor, "top"));
            } else {
                this.pockets[1][role]--;
                this.vpocket1 = patch(this.vpocket1, pocketView(this, this.mycolor, "bottom"));
            }
            if (this.variant === "kyotoshogi") {
                if (!this.promotion.start(role, 'z0', dest, undefined)) this.sendMove(roleToSan[role] + "@", dest, '');
            } else {
                this.sendMove(roleToSan[role] + "@", dest, '')
            }
            // console.log("sent move", move);
        } else {
            // console.log("!!! invalid move !!!", role, dest);
            // restore board
            this.clickDrop = undefined;
            this.chessground.set({
                fen: this.fullfen,
                lastMove: this.lastmove,
                turnColor: this.mycolor,
                movable: {
                    dests: this.dests,
                    showDests: this.showDests,
                    },
                }
            );
        }
        this.preaction = false;
    }

    private onSelect = () => {
        return (key) => {
            // console.log("ground.onSelect()", key, this.chessground.state);
            // If drop selection was set dropDests we have to restore dests here
            if (this.chessground.state.movable.dests === undefined) return;
            if (key != 'z0' && 'z0' in this.chessground.state.movable.dests) {
                if (this.clickDropEnabled && this.clickDrop !== undefined && dropIsValid(this.dests, this.clickDrop.role, key)) {
                    this.chessground.newPiece(this.clickDrop, key);
                    this.onUserDrop(this.clickDrop.role, key, {predrop: this.predrop});
                }
                this.clickDrop = undefined;
                //cancelDropMode(this.chessground.state);
                this.chessground.set({ movable: { dests: this.dests }});
            };
            // Sittuyin in place promotion on Ctrl+click
            if (this.chessground.state.stats.ctrlKey && 
                (key in this.chessground.state.movable.dests) &&
                (this.chessground.state.movable.dests[key].indexOf(key) >= 0)
                ) {
                const piece = this.chessground.state.pieces[key];
                if (this.variant === 'sittuyin') {
                    // console.log("Ctrl in place promotion", key);
                    var pieces = {};
                    pieces[key] = {
                        color: piece!.color,
                        role: 'ferz',
                        promoted: true
                    };
                    this.chessground.setPieces(pieces);
                    this.sendMove(key, key, 'f');
                } else if (this.variant === 'janggi' && piece!.role === 'king') {
                    this.pass();
                }
            };
        }
    }

    private onMsgUserConnected = (msg) => {
        this.model["username"] = msg["username"];
        if (this.spectator) {
            this.doSend({ type: "is_user_present", username: this.wplayer, gameId: this.model["gameId"] });
            this.doSend({ type: "is_user_present", username: this.bplayer, gameId: this.model["gameId"] });

            // we want to know lastMove and check status
            this.doSend({ type: "board", gameId: this.model["gameId"] });
        } else {
            const opp_name = this.model["username"] === this.wplayer ? this.bplayer : this.wplayer;
            this.doSend({ type: "is_user_present", username: opp_name, gameId: this.model["gameId"] });

            var container = document.getElementById('player1') as HTMLElement;
            patch(container, h('i-side.online#player1', {class: {"icon": true, "icon-online": true, "icon-offline": false}}));

            // prevent sending gameStart message when user just reconecting
            if (msg.ply === 0) {
                this.doSend({ type: "ready", gameId: this.model["gameId"] });
            }
            this.doSend({ type: "board", gameId: this.model["gameId"] });
        }
    }

    private onMsgSpectators = (msg) => {
        var container = document.getElementById('spectators') as HTMLElement;
        patch(container, h('under-left#spectators', 'Spectators: ' + msg.spectators));
    }

    private onMsgUserPresent = (msg) => {
        // console.log(msg);
        if (msg.username === this.players[0]) {
            var container = document.getElementById('player0') as HTMLElement;
            patch(container, h('i-side.online#player0', {class: {"icon": true, "icon-online": true, "icon-offline": false}}));
        } else {
            var container = document.getElementById('player1') as HTMLElement;
            patch(container, h('i-side.online#player1', {class: {"icon": true, "icon-online": true, "icon-offline": false}}));
        }
    }

    private onMsgUserDisconnected = (msg) => {
        // console.log(msg);
        if (msg.username === this.players[0]) {
            var container = document.getElementById('player0') as HTMLElement;
            patch(container, h('i-side.online#player0', {class: {"icon": true, "icon-online": false, "icon-offline": true}}));
        } else {
            var container = document.getElementById('player1') as HTMLElement;
            patch(container, h('i-side.online#player1', {class: {"icon": true, "icon-online": false, "icon-offline": true}}));
        }
    }

    private onMsgChat = (msg) => {
        if (msg.user !== this.model["username"]) {
            if ((this.spectator && msg.room === 'spectator') || (!this.spectator && msg.room !== 'spectator') || msg.user.length === 0) {
                chatMessage(msg.user, msg.message, "roundchat");
            }
        }
    }

    private onMsgFullChat = (msg) => {
        msg.lines.forEach((line) => {
            if ((this.spectator && line.room === 'spectator') || (!this.spectator && line.room !== 'spectator') || line.user.length === 0) {
                chatMessage(line.user, line.message, "roundchat");
            }
        });
    }

    private onMsgMoreTime = (msg) => {
        chatMessage('', msg.username + ' +15 seconds', "roundchat");
        if (this.spectator) {
            if (msg.username === this.players[0]) {
                this.clocks[0].setTime(this.clocks[0].duration + 15 * 1000);
            } else {
                this.clocks[1].setTime(this.clocks[1].duration + 15 * 1000);
            };
        } else {
            this.clocks[1].setTime(this.clocks[1].duration + 15 * 1000);
        };
    }

    private onMsgOffer = (msg) => {
        chatMessage("", msg.message, "roundchat");
    }

    private onMsgGameNotFound = (msg) => {
        alert("Requseted game " + msg['gameId'] + " not found!");
        window.location.assign(this.model["home"]);
    }

    private onMsgShutdown = (msg) => {
        alert(msg.message);
    }

    private onMsgCtable = (ct, gameId) => {
        if (ct !== "") {
            this.ctableContainer = patch(this.ctableContainer, crosstableView(ct, gameId));
        }
    }

    private onMessage = (evt) => {
        // console.log("<+++ onMessage():", evt.data);
        var msg = JSON.parse(evt.data);
        switch (msg.type) {
            case "board":
                this.onMsgBoard(msg);
                break;
            case "crosstable":
                this.onMsgCtable(msg.ct, this.model["gameId"]);
                break
            case "gameEnd":
                this.checkStatus(msg);
                break;
            case "gameStart":
                this.onMsgGameStart(msg);
                break;
            case "game_user_connected":
                this.onMsgUserConnected(msg);
                break;
            case "user_present":
                this.onMsgUserPresent(msg);
                break;
            case "spectators":
                this.onMsgSpectators(msg);
                break
            case "user_disconnected":
                this.onMsgUserDisconnected(msg);
                break;
            case "roundchat":
                this.onMsgChat(msg);
                break;
            case "fullchat":
                this.onMsgFullChat(msg);
                break;
            case "new_game":
                this.onMsgNewGame(msg);
                break;
            case "offer":
                this.onMsgOffer(msg);
                break;
            case "moretime":
                this.onMsgMoreTime(msg);
                break;
            case "updateTV":
                this.onMsgUpdateTV(msg);
                break
            case "game_not_found":
                this.onMsgGameNotFound(msg);
                break
            case "shutdown":
                this.onMsgShutdown(msg);
                break;
            case "logout":
                this.doSend({type: "logout"});
                break;
            case "setup":
                this.onMsgSetup(msg);
                break;
        }
    }
}
