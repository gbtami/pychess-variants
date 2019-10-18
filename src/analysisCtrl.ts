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
import { Color, Dests, PiecesDiff, Role, Key, Pos, Piece } from 'chessgroundx/types';
import { DrawShape } from 'chessgroundx/draw';

import makeGating from './gating';
import makePromotion from './promotion';
import { dropIsValid, pocketView, updatePockets } from './pocket';
import { sound } from './sound';
import { variants, hasEp, needPockets, roleToSan, uci2usi, usi2uci, grand2zero, zero2grand, VARIANTS, sanToRole } from './chess';
import { renderUsername } from './user';
import { chatMessage, chatView } from './chat';
import { settingsView } from './settings';
import { movelistView, updateMovelist, selectMove } from './movelist';
import resizeHandle from './resize';
import { result } from './profile';
import { copyTextToClipboard } from './clipboard';

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
    CSSindexesB: number[];
    CSSindexesP: number[];
    clickDrop: Piece | undefined;

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

        this.spectator = this.model["username"] !== this.wplayer && this.model["username"] !== this.bplayer;

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
                    showDests: true,
                    events: {
                        after: this.onUserMove,
                        afterNewPiece: this.onUserDrop,
                    }
                },
                events: {
                    move: this.onMove(),
                    dropNewPiece: this.onDrop(),
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

        patch(document.getElementById('board-settings') as HTMLElement, settingsView(this));

        patch(document.getElementById('movelist') as HTMLElement, movelistView(this));

        patch(document.getElementById('roundchat') as HTMLElement, chatView(this, "roundchat"));

        this.vpv = document.getElementById('pv') as HTMLElement;
/*
        const btn = h('button#analysis', {
                        on: { click: () => this.doSend({ type: "analysis", username: this.model["username"], gameId: this.model["gameId"] }) }},
                        [h('i', {
                            props: {title: 'Computer Analysis'},
                            class: {"icon": true, "icon-microscope": true} 
                            }
                        )]);
        var container = document.getElementById('flip') as HTMLElement;
        patch(container, btn);
*/
    }

    getGround = () => this.chessground;
    getDests = () => this.dests;

    private gameOver = () => {
        var container = document.getElementById('result') as HTMLElement;
        patch(container, h('div#result', result(this.status, this.result)));
    }

    private checkStatus = (msg) => {
        if (msg.gameId !== this.model["gameId"]) return;
        if (msg.status >= 0 && this.result === "") {
            this.result = msg.result;
            this.status = msg.status;
            this.gameOver();

            this.pgn = msg.pgn;
            this.uci_usi = msg.uci_usi;

            var container = document.getElementById('copyfen') as HTMLElement;
            patch(container, h('div', [
                h('a.i-pgn', { on: { click: () => download("pachess-variants_" + this.model["gameId"], this.pgn) } }, [
                    h('i', {props: {title: 'Download game to PGN file'}, class: {"icon": true, "icon-download": true} }, ' Download PGN')]),
                h('a.i-pgn', { on: { click: () => copyTextToClipboard(this.uci_usi) } }, [
                    h('i', {props: {title: 'Copy USI/UCI to clipboard'}, class: {"icon": true, "icon-clipboard": true} }, ' Copy UCI/USI')]),
                h('button', { on: { click: () => this.doSend({ type: "analysis", username: this.model["username"], gameId: this.model["gameId"] }) } }, [
                    h('i', {props: {title: 'Request Computer Analysis'}, class: {"icon": true, "icon-microscope": true} }, ' Request Analysis')]),
                ]),
            );

            container = document.getElementById('fen') as HTMLElement;
            this.vfen = patch(container, h('div#fen', this.fullfen));

            container = document.getElementById('pgntext') as HTMLElement;
            patch(container, h('textarea', { attrs: { rows: 13, readonly: true, spellcheck: false} }, msg.pgn));

            selectMove(this, this.ply);
        }
    }

    private onMsgBoard = (msg) => {
        if (msg.gameId !== this.model["gameId"]) return;

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

            msg.steps.forEach((step) => { 
                this.steps.push(step);
                updateMovelist(this);
                });
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
                updateMovelist(this);
            }
        }

        var lastMove = msg.lastMove;
        if (lastMove !== null) {
            if (this.variant.endsWith('shogi')) {
                lastMove = usi2uci(lastMove);
            } else if (this.variant.startsWith('grand')) {
                lastMove = grand2zero(lastMove);
            }
            lastMove = [lastMove.slice(0,2), lastMove.slice(2,4)];
        }
        // drop lastMove causing scrollbar flicker,
        // so we remove from part to avoid that
        if (lastMove !== null && lastMove[0][1] === '@') lastMove = [lastMove[1]];
        // save capture state before updating chessground
        const capture = lastMove !== null && this.chessground.state.pieces[lastMove[1]]

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
        if (msg.check) {
            sound.check();
        }

        if (this.spectator) {
            this.chessground.set({
                fen: parts[0],
                turnColor: this.turnColor,
                check: msg.check,
                lastMove: lastMove,
            });
            updatePockets(this, this.vpocket0, this.vpocket1);
        };
    }

    goPly = (ply) => {
        const step = this.steps[ply];
        var move = step.move;
        var capture = false;
        if (move !== undefined) {
            if (this.variant.endsWith('shogi')) move = usi2uci(move);
            if (this.variant.startsWith('grand')) move = grand2zero(move);
            move = move.slice(1, 2) === '@' ? [move.slice(2, 4)] : [move.slice(0, 2), move.slice(2, 4)];
            capture = this.chessground.state.pieces[move[move.length - 1]] !== undefined;
        }
        var shapes0: DrawShape[] = [];
        this.chessground.setAutoShapes(shapes0);
        const ceval = step.ceval;
        if (ceval !== undefined) {
            if (ceval.pv !== undefined) {
                var pv_move = ceval["pv"].split(" ")[0];
                if (this.variant.endsWith('shogi')) pv_move = usi2uci(pv_move);
                if (this.variant.startsWith('grand')) pv_move = grand2zero(pv_move);
                console.log(pv_move, ceval["pv"]);
                if (pv_move.slice(1, 2) === '@') {
                    const d = pv_move.slice(2, 4);
                    shapes0 = [{ orig: d, brush: 'paleGreen', piece: {
                        color: step.turnColor,
                        role: sanToRole[pv_move.slice(0, 1)]
                        }},
                        { orig: d, brush: 'paleGreen'}
                    ];
                } else {
                    const o = pv_move.slice(0, 2);
                    const d = pv_move.slice(2, 4);
                    shapes0 = [{ orig: o, dest: d, brush: 'paleGreen', piece: undefined },];
                }

                this.vpv = patch(this.vpv, h('div#pv', [
                    h('div', [h('score', this.steps[ply]['scoreStr']), 'Fairy-Stockfish, Depth ' + String(ceval["depth"])]),
                    h('pv', ceval.pv_san !== undefined ? ceval.pv_san : ceval.pv)
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

    private sendMove = (orig, dest, promo) => {
        // pause() will add increment!
        // console.log("sendMove(orig, dest, prom)", orig, dest, promo);
        const uci_move = orig + dest + promo;
        const move = this.variant.endsWith('shogi') ? uci2usi(uci_move) : this.variant.startsWith('grand') ? zero2grand(uci_move) : uci_move;
        // console.log("sendMove(move)", move);
        this.doSend({ type: "move", gameId: this.model["gameId"], move: move });
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
            } else {
                this.clickDrop = piece;
            }
        }
    }

    private onUserMove = (orig, dest, meta) => {
        // chessground doesn't knows about ep, so we have to remove ep captured pawn
        const pieces = this.chessground.state.pieces;
        const geom = this.chessground.state.geometry;
        // console.log("ground.onUserMove()", orig, dest, meta, pieces);
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
        if ((this.variant === "crazyhouse" || this.variant === "capahouse" || this.variant === "shouse" || this.variant === "grandhouse" || this.variant.endsWith('shogi')) && meta.captured) {
            var role = meta.captured.role
            if (meta.captured.promoted) role = this.variant.endsWith('shogi') ? meta.captured.role.slice(1) as Role : "pawn";

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
            if (!this.promotion.start(orig, dest, meta) && !this.gating.start(this.fullfen, orig, dest, meta)) this.sendMove(orig, dest, '');
        } else {
            if (!this.promotion.start(orig, dest, meta)) this.sendMove(orig, dest, '');
        };
    }

    private onUserDrop = (role, dest) => {
        // console.log("ground.onUserDrop()", role, dest);
        // decrease pocket count
        //cancelDropMode(this.chessground.state);
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

    private onSelect = (selected) => {
        return (key) => {
            console.log("ground.onSelect()", key, selected, this.clickDrop, this.chessground.state);
            // If drop selection was set dropDests we have to restore dests here
            if (this.chessground.state.movable.dests === undefined) return;
            if (key != 'z0' && 'z0' in this.chessground.state.movable.dests) {
                if (this.clickDrop !== undefined && dropIsValid(this.dests, this.clickDrop.role, key)) {
                    this.chessground.newPiece(this.clickDrop, key);
                    this.onUserDrop(this.clickDrop.role, key);
                }
                this.clickDrop = undefined;
                //cancelDropMode(this.chessground.state);
                this.chessground.set({ movable: { dests: this.dests }});
            };
            // Sittuyin in place promotion on Ctrl+click
            if (this.chessground.state.stats.ctrlKey && 
                (key in this.chessground.state.movable.dests) &&
                (this.chessground.state.movable.dests[key].indexOf(key) >= 0) &&
                (this.variant === 'sittuyin')) {
                console.log("Ctrl in place promotion", key);
                var pieces = {};
                var piece = this.chessground.state.pieces[key];
                pieces[key] = {
                    color: piece!.color,
                    role: 'ferz',
                    promoted: true
                };
                this.chessground.setPieces(pieces);
                this.sendMove(key, key, 'f');

            };
        }
    }

    private onMsgAnalysis = (msg) => {
        if (msg['ceval']['score'] === undefined) return;

        const ply = msg['ply'];
        const score = msg['ceval']['score'];
        var scoreStr = '';
        var ceval = '';
        if (score['mate'] !== undefined) {
            ceval = score['mate']
            const sign = ((msg.color === 'b' && Number(ceval) > 0) || (msg.color === 'w' && Number(ceval) < 0)) ? '-': '';
            scoreStr = '#' + sign + Math.abs(Number(ceval));
        } else {
            ceval = score['cp']
            var nscore = Number(ceval) / 100.0;
            if (msg.color === 'b') nscore = -nscore;
            scoreStr = nscore.toFixed(1);
        }
        console.log(ply, scoreStr);
        if (ply > 0) {
            var evalEl = document.getElementById('ply' + String(ply)) as HTMLElement;
            patch(evalEl, h('eval#ply' + String(ply), scoreStr));
        }
        this.steps[ply]['ceval'] = msg['ceval'];
        this.steps[ply]['scoreStr'] = scoreStr;
    }

    private onMsgUserConnected = (msg) => {
        this.model["username"] = msg["username"];
        renderUsername(this.model["home"], this.model["username"]);
        // we want to know lastMove and check status
        this.doSend({ type: "board", gameId: this.model["gameId"] });
    }

    private onMsgChat = (msg) => {
        if (msg.user !== this.model["username"]) chatMessage(msg.user, msg.message, "roundchat");
    }

    private onMsgFullChat = (msg) => {
        msg.lines.forEach((line) => {chatMessage(line.user, line.message, "roundchat");});
    }

    private onMsgGameNotFound = (msg) => {
        alert("Requseted game " + msg['gameId'] + " not found!");
        window.location.assign(this.model["home"]);
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
            case "roundchat":
                this.onMsgChat(msg);
                break;
            case "fullchat":
                this.onMsgFullChat(msg);
                break;
            case "game_not_found":
                this.onMsgGameNotFound(msg);
                break
        }
    }
}
