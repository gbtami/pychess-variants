import Sockette from 'sockette';

import { init } from 'snabbdom';
import { h } from 'snabbdom/h';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

import { Chessground } from 'chessgroundx';
import { Api } from 'chessgroundx/api';
import { Color, Dests, Key, Piece } from 'chessgroundx/types';
import { DrawShape } from 'chessgroundx/draw';

import makeGating from './gating';
import makePromotion from './promotion';
import { dropIsValid, updatePockets } from './pocket';
import { sound } from './sound';
import { variants, needPockets, usi2uci, grand2zero, VARIANTS, sanToRole, getPockets } from './chess';
import { renderUsername } from './user';
import { chatMessage, chatView } from './chat';
import { settingsView } from './settings';
import { movelistView, updateMovelist, selectMove } from './movelist';
import resizeHandle from './resize';
//import { result } from './profile';
import { copyTextToClipboard } from './clipboard';
import { analysisChart } from './chart';

const patch = init([klass, attributes, properties, listeners]);


function download(filename, text) {
  var element = document.createElement('a');
  element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
  element.setAttribute('download', filename);

  element.style.display = 'none';
  document.body.appendChild(element);

  element.click();

  document.body.removeChild(element);
}


export default class AnalysisController {
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
    gameId: string;
    variant: string;
    hasPockets: boolean;
    pockets: any;
    vpocket0: any;
    vpocket1: any;
    vplayer0: any;
    vplayer1: any;
    vfen: any;
    vpv: any;
    gameControls: any;
    moveControls: any;
    gating: any;
    promotion: any;
    dests: Dests;
    promotions: string[];
    lastmove: Key[];
    result: string;
    flip: boolean;
    spectator: boolean;
    settings: boolean;
    status: number;
    steps;
    pgn: string;
    uci_usi: string;
    ply: number;
    players: string[];
    titles: string[];
    ratings: string[];
    CSSindexesB: number[];
    CSSindexesP: number[];
    clickDrop: Piece | undefined;
    clickDropEnabled: boolean;
    showDests: boolean;
    analysisChart: any;

    constructor(el, model) {
        const onOpen = (evt) => {
            console.log("ctrl.onOpen()", evt);
            this.doSend({ type: "game_user_connected", username: this.model["username"], gameId: this.model["gameId"] });
        };

        const opts = {
            maxAttempts: 10,
            onopen: e => onOpen(e),
            onmessage: e => this.onMessage(e),
            onreconnect: e => console.log('Reconnecting in round...', e),
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
        this.steps = [];
        this.pgn = "";
        this.ply = 0;

        this.flip = false;
        this.settings = true;
        this.CSSindexesB = variants.map((variant) => localStorage[variant + "_board"] === undefined ? 0 : Number(localStorage[variant + "_board"]));
        this.CSSindexesP = variants.map((variant) => localStorage[variant + "_pieces"] === undefined ? 0 : Number(localStorage[variant + "_pieces"]));
        this.clickDropEnabled = localStorage.clickDropEnabled === undefined ? false : localStorage.clickDropEnabled === true;
        this.showDests = localStorage.showDests === undefined ? true : localStorage.showDests === true;

        this.spectator = this.model["username"] !== this.wplayer && this.model["username"] !== this.bplayer;
        this.hasPockets = needPockets(this.variant);

        // orientation = this.mycolor
        if (this.spectator) {
            this.mycolor = this.variant.endsWith('shogi') ? 'black' : 'white';
            this.oppcolor = this.variant.endsWith('shogi') ? 'white' : 'black';
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

        this.result = "";
        const parts = this.fullfen.split(" ");

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

        if (this.spectator) {
            this.chessground.set({
                //viewOnly: true,
                events: {
                    move: this.onMove(),
                }
            });
        } else {
            this.chessground.set({
                movable: {
                    free: false,
                    color: this.mycolor,
                    showDests: this.showDests,
                },
                events: {
                    move: this.onMove(),
                    dropNewPiece: this.onDrop(),
                }
            });
        };

        this.gating = makeGating(this);
        this.promotion = makePromotion(this);

        // initialize pockets
        if (this.hasPockets) {
            const pocket0 = document.getElementById('pocket0') as HTMLElement;
            const pocket1 = document.getElementById('pocket1') as HTMLElement;
            updatePockets(this, pocket0, pocket1);
        }

        var element = document.getElementById('chart') as HTMLElement;
        element.style.display = 'none';

        patch(document.getElementById('board-settings') as HTMLElement, settingsView(this));

        patch(document.getElementById('movelist') as HTMLElement, movelistView(this));

        patch(document.getElementById('roundchat') as HTMLElement, chatView(this, "roundchat"));

        this.vpv = document.getElementById('pv') as HTMLElement;
    }

    getGround = () => this.chessground;
    getDests = () => this.dests;

    private requestAnalysis = (withSend) => {
        if (this.model["anon"] === 'True') {
            alert('You need an account to do that.');
            return;
        }
        if (withSend) {
            var element = document.getElementById('request-analysis') as HTMLElement;
            element.style.display = 'none';
            this.doSend({ type: "analysis", username: this.model["username"], gameId: this.model["gameId"] });
            element = document.getElementById('loader') as HTMLElement;
            element.style.display = 'block';
        }
        element = document.getElementById('chart') as HTMLElement;
        element.style.display = 'block';
        this.analysisChart = analysisChart(this);
    }

    private checkStatus = (msg) => {
        if (msg.gameId !== this.model["gameId"]) return;
        if (msg.status >= 0 && this.result === "") {
            this.result = msg.result;
            this.status = msg.status;

            this.pgn = msg.pgn;
            this.uci_usi = msg.uci_usi;

            var container = document.getElementById('copyfen') as HTMLElement;
            var buttons = [
                h('a.i-pgn', { on: { click: () => download("pychess-variants_" + this.model["gameId"], this.pgn) } }, [
                    h('i', {props: {title: 'Download game to PGN file'}, class: {"icon": true, "icon-download": true} }, ' Download PGN')]),
                h('a.i-pgn', { on: { click: () => copyTextToClipboard(this.uci_usi) } }, [
                    h('i', {props: {title: 'Copy USI/UCI to clipboard'}, class: {"icon": true, "icon-clipboard": true} }, ' Copy UCI/USI')]),
                ]
            if (this.steps[0].analysis === undefined) {
                buttons.push(h('button#request-analysis', { on: { click: () => this.requestAnalysis(true) } }, [
                    h('i', {props: {title: 'Request Computer Analysis'}, class: {"icon": true, "icon-bar-chart": true} }, ' Request Analysis')])
                );
            }
            patch(container, h('div', buttons));

            container = document.getElementById('fen') as HTMLElement;
            this.vfen = patch(container, h('div#fen', this.fullfen));

            container = document.getElementById('pgntext') as HTMLElement;
            patch(container, h('textarea', { attrs: { rows: 13, readonly: true, spellcheck: false} }, msg.pgn));

            selectMove(this, this.ply);
        }
    }

    private onMsgBoard = (msg) => {
        if (msg.gameId !== this.model["gameId"]) return;

        const pocketsChanged = this.hasPockets && (getPockets(this.fullfen) !== getPockets(msg.fen));

        // console.log("got board msg:", msg);
        this.ply = msg.ply
        this.fullfen = msg.fen;
        this.dests = msg.dests;
        // list of legal promotion moves
        this.promotions = msg.promo;

        const parts = msg.fen.split(" ");
        this.turnColor = parts[1] === "w" ? "white" : "black";

        if (msg.steps.length > 1) {
            this.steps = [];
            var container = document.getElementById('movelist') as HTMLElement;
            patch(container, h('div#movelist'));

            msg.steps.forEach((step, ply) => {
                if (step.analysis !== undefined) {
                    step['ceval'] = step.analysis;
                    const scoreStr = this.buildScoreStr(ply % 2 === 0 ? "w" : "b", step.analysis);
                    step['scoreStr'] = scoreStr;
                }
                this.steps.push(step);
                });
            updateMovelist(this, 1, this.steps.length);

            if (this.steps[0].analysis !== undefined) {
                this.requestAnalysis(false);
                analysisChart(this);
            };
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
                updateMovelist(this, this.steps.length - 1, this.steps.length);
            }
        }

        var lastMove = msg.lastMove;
        if (lastMove !== null) {
            if (this.variant.endsWith('shogi')) {
                lastMove = usi2uci(lastMove);
            } else if (this.variant === 'xiangqi' || this.variant.startsWith('grand') || this.variant === 'shako') {
                lastMove = grand2zero(lastMove);
            }
            // drop lastMove causing scrollbar flicker,
            // so we remove from part to avoid that
            lastMove = lastMove.indexOf('@') > -1 ? [lastMove.slice(-2)] : [lastMove.slice(0, 2), lastMove.slice(2, 4)];
        }
        // save capture state before updating chessground
        // 960 king takes rook castling is not capture
        const capture = lastMove !== null && this.chessground.state.pieces[lastMove[1]] && this.steps[this.steps.length - 1].san.slice(0, 2) !== 'O-'

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

        if (this.spectator) {
            this.chessground.set({
                fen: parts[0],
                turnColor: this.turnColor,
                check: msg.check,
                lastMove: lastMove,
            });
            if (pocketsChanged) updatePockets(this, this.vpocket0, this.vpocket1);
        };
    }

    goPly = (ply) => {
        const step = this.steps[ply];
        var move = step.move;
        var capture = false;
        if (move !== undefined) {
            if (this.variant.endsWith('shogi')) move = usi2uci(move);
            if (this.variant === 'xiangqi' || this.variant.startsWith('grand') || this.variant === 'shako') move = grand2zero(move);
            move = move.indexOf('@') > -1 ? [move.slice(-2)] : [move.slice(0, 2), move.slice(2, 4)];
            // 960 king takes rook castling is not capture
            capture = this.chessground.state.pieces[move[move.length - 1]] !== undefined && step.san.slice(0, 2) !== 'O-';
        }
        var shapes0: DrawShape[] = [];
        this.chessground.setAutoShapes(shapes0);
        const ceval = step.ceval;
        if (ceval !== undefined) {
            if (ceval.p !== undefined) {
                var pv_move = ceval["m"].split(" ")[0];
                if (this.variant.endsWith('shogi')) pv_move = usi2uci(pv_move);
                if (this.variant === 'xiangqi' || this.variant.startsWith('grand') || this.variant === 'shako') pv_move = grand2zero(pv_move);
                // console.log(pv_move, ceval["m"]);
                const atPos = pv_move.indexOf('@');
                if (atPos > -1) {
                    const d = pv_move.slice(atPos + 1, atPos + 3);
                    var color = step.turnColor;
                    if (this.flip && this.variant.endsWith('shogi')) color = (color === 'white') ? 'balck' : 'white';
                    // console.log(pv_move.slice(0, atPos), sanToRole[pv_move.slice(0, atPos)], d);
                    shapes0 = [{ orig: d, brush: 'paleGreen', piece: {
                        color: color,
                        role: sanToRole[pv_move.slice(0, atPos)]
                        }},
                        { orig: d, brush: 'paleGreen'}
                    ];
                } else {
                    const o = pv_move.slice(0, 2);
                    const d = pv_move.slice(2, 4);
                    shapes0 = [{ orig: o, dest: d, brush: 'paleGreen', piece: undefined },];
                }

                this.vpv = patch(this.vpv, h('div#pv', [
                    h('div', [h('score', this.steps[ply]['scoreStr']), 'Fairy-Stockfish, Depth ' + String(ceval.d)]),
                    h('pv', ceval.p !== undefined ? ceval.p : ceval.m)
                ]));
                const stl = document.body.getAttribute('style');
                document.body.setAttribute('style', stl + '--PVheight:64px;');
            } else {
                this.vpv = patch(this.vpv, h('div#pv'));
                const stl = document.body.getAttribute('style');
                document.body.setAttribute('style', stl + '--PVheight:0px;');
            }
        }

        console.log(shapes0);
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
            drawable: {autoShapes: shapes0},
        });

        this.fullfen = step.fen;
        updatePockets(this, this.vpocket0, this.vpocket1);

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
        this.vfen = patch(this.vfen, h('div#fen', this.fullfen));
    }

    private doSend = (message) => {
        console.log("---> doSend():", message);
        this.sock.send(JSON.stringify(message));
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
            console.log("ground.onDrop()", piece, dest);
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

    private buildScoreStr = (color, analysis) => {
        const score = analysis['s'];
        var scoreStr = '';
        var ceval = '';
        if (score['mate'] !== undefined) {
            ceval = score['mate']
            const sign = ((color === 'b' && Number(ceval) > 0) || (color === 'w' && Number(ceval) < 0)) ? '-': '';
            scoreStr = '#' + sign + Math.abs(Number(ceval));
        } else {
            ceval = score['cp']
            var nscore = Number(ceval) / 100.0;
            if (color === 'b') nscore = -nscore;
            scoreStr = nscore.toFixed(1);
        }
        return scoreStr;
    }

    private onMsgAnalysis = (msg) => {
        if (msg['ceval']['s'] === undefined) return;

        const scoreStr = this.buildScoreStr(msg.color, msg.ceval);
        if (msg.ply > 0) {
            var evalEl = document.getElementById('ply' + String(msg.ply)) as HTMLElement;
            patch(evalEl, h('eval#ply' + String(msg.ply), scoreStr));
        }
        this.steps[msg.ply]['ceval'] = msg['ceval'];
        this.steps[msg.ply]['scoreStr'] = scoreStr;

        analysisChart(this);
        if (this.steps.every((step) => {return step.scoreStr !== undefined;})) {
            var element = document.getElementById('loader-wrapper') as HTMLElement;
            element.style.display = 'none';
        }
    }

    private onMsgUserConnected = (msg) => {
        this.model["username"] = msg["username"];
        renderUsername(this.model["home"], this.model["username"]);
        // we want to know lastMove and check status
        this.doSend({ type: "board", gameId: this.model["gameId"] });
    }

    private onMsgSpectators = (msg) => {
        var container = document.getElementById('spectators') as HTMLElement;
        patch(container, h('under-left#spectators', 'Spectators: ' + msg.spectators));
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

    private onMsgGameNotFound = (msg) => {
        alert("Requseted game " + msg['gameId'] + " not found!");
        window.location.assign(this.model["home"]);
    }

    private onMsgShutdown = (msg) => {
        alert(msg.message);
    }

    private onMessage = (evt) => {
        console.log("<+++ onMessage():", evt.data);
        var msg = JSON.parse(evt.data);
        switch (msg.type) {
            case "board":
                this.onMsgBoard(msg);
                break;
            case "analysis":
                this.onMsgAnalysis(msg);
                break;
            case "game_user_connected":
                this.onMsgUserConnected(msg);
                break;
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
