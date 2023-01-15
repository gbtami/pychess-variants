import { h, VNode } from 'snabbdom';
import * as cg from 'chessgroundx/types';

import { _ } from '../i18n';
import { patch } from '../document';
import { Clock } from '../clock';
import {chatMessage, chatView, IChatController} from '../chat';
import {createMovelistButtons, updateMovelist} from './movelist';
import {Clocks, MsgBoard, MsgFullChat, MsgGameEnd, MsgMove, MsgUserConnected, RDiffs, Step} from "../messages";
import {
    MsgUserDisconnected,
    MsgUserPresent,
    MsgDrawOffer,
    MsgDrawRejected,
    MsgRematchOffer,
    MsgRematchRejected,
    MsgUpdateTV,
    MsgGameStart
} from '../roundType';
import {JSONObject, PyChessModel} from "../types";
import {ChessgroundController} from "./ChessgroundCtrl";
import {cg2uci, uci2LastMove} from "../chess";
import {sound} from "../sound";
import {renderRdiff} from "../result";
import {player} from "../player";
import {newWebsocket} from "../socket";
import WebsocketHeartbeatJs from "websocket-heartbeat-js";
import {notify} from "../notification";

export class RoundController implements IChatController/*extends GameController todo:does it make sense for these guys - also AnalysisControl which is older before this refactring that introduced this stuff*/ {
    sock: WebsocketHeartbeatJs;

    b1: ChessgroundController;
    b2: ChessgroundController;

    username: string;
    gameId: string;
    readonly anon: boolean;

    steps: Step[];
    ply: number;
    plyVari: number;

    moveControls: VNode;
    status: number;
    result: string;

    autoPromote: boolean;

    clocks: [Clock, Clock];
    clocksB: [Clock, Clock];
    clocktimes: Clocks;
    clocktimesB: Clocks;
    // expirations: [VNode | HTMLElement, VNode | HTMLElement];
    expiStart: number;
    firstmovetime: number;
    profileid: string;
    level: number;
    clockOn: boolean;
    vmaterial0: VNode | HTMLElement;
    vmaterial1: VNode | HTMLElement;
    vmiscInfoW: VNode;
    vmiscInfoB: VNode;

    vdialog: VNode;
    berserkable: boolean;
    settings: boolean;
    tv: boolean;
    animation: boolean;
    showDests: boolean;
    blindfold: boolean;
    handicap: boolean;
    setupFen: string;
    prevPieces: cg.Pieces;
    focus: boolean;
    finishedGame: boolean;
    lastMaybeSentMsgMove: MsgMove; // Always store the last "move" message that was passed for sending via websocket.
                          // In case of bad connection, we are never sure if it was sent (thus the name)
                          // until a "board" message from server is received from server that confirms it.
                          // So if at any moment connection drops, after reconnect we always resend it.
                          // If server received and processed it the first time, it will just ignore it

    base: number;
    inc: number;
    vmovelist: VNode | HTMLElement;

    spectator: boolean;

    gameControls: VNode;//todo:niki: usually inherited from gameCtrl
    readonly home: string;

    vplayerA0: VNode;
    vplayerA1: VNode;

    vplayerB0: VNode;
    vplayerB1: VNode;

    players: string[];
    titles: string[];
    ratings: string[];

    playersB: string[];
    titlesB: string[];
    ratingsB: string[];

    wplayer: string;
    bplayer: string;

    wtitle: string;
    btitle: string;
    wrating: string;
    brating: string;

    wplayerB: string;
    bplayerB: string;

    wtitleB: string;
    btitleB: string;
    wratingB: string;
    bratingB: string;

    mycolor: Map<'a'|'b', Set<cg.Color>> = new Map<'a'|'b', Set<cg.Color>>([['a', new Set()],['b', new Set()]]);

    constructor(el1: HTMLElement,el1Pocket1: HTMLElement,el1Pocket2: HTMLElement,el2: HTMLElement,el2Pocket1: HTMLElement,el2Pocket2: HTMLElement, model: PyChessModel) {

        this.home = model.home;

        this.b1 = new ChessgroundController(el1, el1Pocket1, el1Pocket2, 'a', model); //todo:niki:fen maybe should be parsed from bfen. what situation do we start from custom fen?
        this.b2 = new ChessgroundController(el2, el2Pocket1, el2Pocket2, 'b', model);
        this.b2.chessground.set({orientation:"black"});
        this.b1.partnerCC = this.b2;
        this.b2.partnerCC = this.b1;
        this.b1.parent = this;
        this.b2.parent = this;

        this.base = Number(model["base"]);
        this.inc = Number(model["inc"]);
        this.gameId = model["gameId"] as string;
        this.username = model["username"];
        this.anon = model.anon === 'True';


        // super(el, model, document.getElementById('pocket0') as HTMLElement, document.getElementById('pocket1') as HTMLElement);//todo:niki:those elements best be passed as args
        this.focus = !document.hidden;
        document.addEventListener("visibilitychange", () => {this.focus = !document.hidden});
        window.addEventListener('blur', () => {this.focus = false});
        window.addEventListener('focus', () => {this.focus = true});
//
        const onOpen = () => {
            if ( this.lastMaybeSentMsgMove  && this.lastMaybeSentMsgMove.ply === this.ply + 1 ) {
                // if this.ply === this.lastMaybeSentMsgMove.ply it would mean the move message was received by server and it has replied with "board" message, confirming and updating the state, including this.ply
                // since they are not equal, but also one ply behind, means we should try to re-send it
                try {
                    console.log("resending unsent message ", this.lastMaybeSentMsgMove);
                    this.doSend(this.lastMaybeSentMsgMove);
                } catch (e) {
                    console.log("could not even REsend unsent message ", this.lastMaybeSentMsgMove)
                }
            }

            this.clocks[0].connecting = false;
            this.clocks[1].connecting = false;

            const cl = document.body.classList; // removing the "reconnecting" message in lower left corner
            cl.remove('offline');
            cl.add('online');

            this.doSend({ type: "game_user_connected", username: this.username, gameId: this.gameId });
        };

        const onReconnect = () => {
            this.clocks[0].connecting = true;
            this.clocks[1].connecting = true;
            console.log('Reconnecting in round...');

            // relevant to the "reconnecting" message in lower left corner
            document.body.classList.add('offline');
            document.body.classList.remove('online');
            document.body.classList.add('reconnected'); // this will trigger the animation once we get "online" class added back on reconnect

            const container = document.getElementById('player1a') as HTMLElement;
            patch(container, h('i-side.online#player1a', {class: {"icon": true, "icon-online": false, "icon-offline": true}}));
        };

        this.sock = newWebsocket('wsr');
        this.sock.onopen = () => onOpen();
        this.sock.onreconnect = () => onReconnect();
        this.sock.onmessage = (e: MessageEvent) => this.onMessage(e);
//
        this.finishedGame = this.status >= 0;
        this.tv = model["tv"];
        this.profileid = model["profileid"];
        this.level = model["level"];

        this.settings = true;
        this.blindfold = localStorage.blindfold === undefined ? false : localStorage.blindfold === "true";
        this.autoPromote = localStorage.autoPromote === undefined ? false : localStorage.autoPromote === "true";

        // this.preaction = false;

        // this.tournamentGame = this.tournamentId !== '';
        // const parts = this.fullfen.split(" ");
        this.clockOn = false;//(Number(parts[parts.length - 1]) >= 2);

        // this.chessground.set({
        //     orientation: this.mycolor,
        //     turnColor: this.turnColor,
        //     autoCastle: this.variant.name !== 'cambodian', // TODO make more generic
        //     animation: { enabled: this.animation },
        // });

        // if (this.spectator) {
        //     this.chessground.set({
        //         //viewOnly: false,
        //         movable: { free: false },
        //         draggable: { enabled: false },
        //         premovable: { enabled: false },
        //         predroppable: { enabled: false },
        //         events: { move: this.onMove() }
        //     });
        // } else {
        //     this.chessground.set({
        //         animation: { enabled: this.animation },
        //         movable: {
        //             free: false,
        //             color: this.mycolor,
        //             showDests: this.showDests,
        //             events: {
        //                 after: (orig, dest, meta) => this.onUserMove(orig, dest, meta),
        //                 afterNewPiece: (role, dest, meta) => this.onUserDrop(role, dest, meta),
        //             }
        //         },
        //         premovable: {
        //             enabled: true,
        //             events: {
        //                 set: this.setPremove,
        //                 unset: this.unsetPremove,
        //                 }
        //         },
        //         predroppable: {
        //             enabled: true,
        //             events: {
        //                 set: this.setPredrop,
        //                 unset: this.unsetPredrop,
        //                 }
        //         },
        //         events: {
        //             move: this.onMove(),
        //             dropNewPiece: this.onDrop(),
        //             select: this.onSelect(),
        //         },
        //     });
        // }

        this.steps = [];
        this.ply = isNaN(model["ply"]) ? 0 : model["ply"];

        // initialize users
        this.wplayer = model["wplayer"];
        this.bplayer = model["bplayer"];

        this.wtitle = model["wtitle"];
        this.btitle = model["btitle"];
        this.wrating = model["wrating"];
        this.brating = model["brating"];

        this.wplayerB = model.wplayerB;
        this.bplayerB = model.bplayerB;

        this.wtitleB = model.wtitleB;
        this.btitleB = model.btitleB;
        this.wratingB = model.wratingB;
        this.bratingB = model.bratingB;
//
        if (this.wplayer === this.username) this.mycolor.get('a')!.add('white');
        if (this.bplayer === this.username) this.mycolor.get('a')!.add('black');
        if (this.wplayerB === this.username) this.mycolor.get('b')!.add('white');
        if (this.bplayerB === this.username) this.mycolor.get('b')!.add('black');
//

        this.spectator = this.username !== this.wplayer && this.username !== this.bplayer && this.username !== this.wplayerB && this.username !== this.bplayerB;
        //todo:niki:rethink eventually maybe this: below it is overly compicated because i want to support same player playing on all 4 boards or other arbitrary combinations for now
// board A - 0 means top, 1 means bottom
        this.players = [
            this.mycolor.get('a')!.size === 0 || this.mycolor.get('a')!.has("white") ? this.bplayer : this.wplayer,
            this.mycolor.get('a')!.size === 0 || this.mycolor.get('a')!.has("white") ? this.wplayer : this.bplayer
        ];
        this.titles = [
            this.mycolor.get('a')!.size === 0 || this.mycolor.get('a')!.has("white") ? this.btitle : this.wtitle,
            this.mycolor.get('a')!.size === 0 || this.mycolor.get('a')!.has("white") ? this.wtitle : this.btitle
        ];
        this.ratings = [
            this.mycolor.get('a')!.size === 0 || this.mycolor.get('a')!.has("white") ? this.brating : this.wrating,
            this.mycolor.get('a')!.size === 0 || this.mycolor.get('a')!.has("white") ? this.wrating : this.brating
        ];
// board B - 0 means top, 1 means bottom
        this.playersB = [
            !this.mycolor.get('a')!.has("white") && this.mycolor.get('b')!.has("white") ? this.bplayerB : this.wplayerB,
            !this.mycolor.get('a')!.has("white") && this.mycolor.get('b')!.has("white") ? this.wplayerB : this.bplayerB
        ];
        this.titlesB = [
            !this.mycolor.get('a')!.has("white") && this.mycolor.get('b')!.has("white") ? this.btitleB : this.wtitleB,
            !this.mycolor.get('a')!.has("white") && this.mycolor.get('b')!.has("white") ? this.wtitleB : this.btitleB
        ];
        this.ratingsB = [
            !this.mycolor.get('a')!.has("white") && this.mycolor.get('b')!.has("white") ? this.bratingB : this.wratingB,
            !this.mycolor.get('a')!.has("white") && this.mycolor.get('b')!.has("white") ? this.wratingB : this.bratingB
        ];

        const player0a = document.getElementById('rplayer0a') as HTMLElement;
        const player1a = document.getElementById('rplayer1a') as HTMLElement;
        this.vplayerA0 = patch(player0a, player('round-player0','player0a', this.titles[0], this.players[0], this.ratings[0], this.level));
        this.vplayerA1 = patch(player1a, player('round-player1', 'player1a', this.titles[1], this.players[1], this.ratings[1], this.level));

        const player0b = document.getElementById('rplayer0b') as HTMLElement;
        const player1b = document.getElementById('rplayer1b') as HTMLElement;
        this.vplayerB0 = patch(player0b, player('round-player0.bug', 'player0b', this.titlesB[0], this.playersB[0], this.ratingsB[0], this.level));
        this.vplayerB1 = patch(player1b, player('round-player1.bug', 'player1b', this.titlesB[1], this.playersB[1], this.ratingsB[1], this.level));

        this.clocktimes = {'white': this.base * 1000 * 60, 'black': this.base * 1000 * 60}
        this.clocktimesB = {'white': this.base * 1000 * 60, 'black': this.base * 1000 * 60}

        // initialize clocks
        // this.clocktimes = {};
        const c0a = new Clock(this.base, this.inc, 0, document.getElementById('clock0a') as HTMLElement, 'clock0a');
        const c1a = new Clock(this.base, this.inc, 0, document.getElementById('clock1a') as HTMLElement, 'clock1a');
        const c0b = new Clock(this.base, this.inc, 0, document.getElementById('clock0b') as HTMLElement, 'clock0b');
        const c1b = new Clock(this.base, this.inc, 0, document.getElementById('clock1b') as HTMLElement, 'clock1b');
        this.clocks = [c0a, c1a];
        this.clocksB = [c0b, c1b];

        this.clocks[0].onTick(this.clocks[0].renderTime);
        this.clocks[1].onTick(this.clocks[1].renderTime);

        this.clocksB[0].onTick(this.clocksB[0].renderTime);
        this.clocksB[1].onTick(this.clocksB[1].renderTime);

        const flagCallback0 = () => {
            if ( this.mycolor.get('a')!.has(this.b1.turnColor) ) {
                this.b1.chessground.stop();
                this.b2.chessground.stop();
                // console.log("Flag");
                this.doSend({ type: "flag", gameId: this.gameId });
            }
        }
        const flagCallback1 = () => {
            if ( this.mycolor.get('b')!.has(this.b2.turnColor) ) {
                this.b1.chessground.stop();
                this.b2.chessground.stop();
                // console.log("Flag");
                this.doSend({ type: "flag", gameId: this.gameId });
            }
        }

        if (!this.spectator) {
            this.clocks[0].onFlag(flagCallback0);
            this.clocks[1].onFlag(flagCallback1);
        }

        const container = document.getElementById('game-controls') as HTMLElement;
        // if (!this.spectator) {
        //     const pass = this.variant.pass;
        //     let buttons = [];
        //     if (!this.tournamentGame) {
        //         buttons.push(h('button#abort', { on: { click: () => this.abort() }, props: {title: _('Abort')} }, [h('i', {class: {"icon": true, "icon-abort": true} } ), ]));
        //     }
        //     buttons.push(h('button#count', _('Count')));
        //     buttons.push(h('button#draw', { on: { click: () => (pass) ? this.pass() : this.draw() }, props: {title: (pass) ? _('Pass') : _("Draw")} }, [(pass) ? _('Pass') : h('i', '½')]));
        //     buttons.push(h('button#resign', { on: { click: () => this.resign() }, props: {title: _("Resign")} }, [h('i', {class: {"icon": true, "icon-flag-o": true} } ), ]));
        //
        //     this.gameControls = patch(container, h('div.btn-controls', buttons));
        //
        //     const manualCount = this.variant.counting === 'makruk' && !(this.wtitle === 'BOT' || this.btitle === 'BOT');
        //     if (!manualCount)
        //         patch(document.getElementById('count') as HTMLElement, h('div'));
        //
        // } else {
            this.gameControls = patch(container, h('div.btn-controls'));
        // }

        createMovelistButtons(this);
        this.vmovelist = document.getElementById('movelist') as HTMLElement;

        this.vdialog = patch(document.getElementById('offer-dialog')!, h('div#offer-dialog', ""));

        patch(document.getElementById('roundchat') as HTMLElement, chatView(this, "roundchat"));

        this.onMsgBoard(model["board"] as MsgBoard);
    }

    flipBoards = (): void => {
        this.b1.toggleOrientation();
        this.b2.toggleOrientation();
    }

    switchBoards = (): void => {

        const swap = function (nodeA: HTMLElement, nodeB: HTMLElement) {
            const parentA = nodeA.parentNode;
            const siblingA = nodeA.nextSibling === nodeB ? nodeA : nodeA.nextSibling;

            // Move `nodeA` to before the `nodeB`
            nodeB.parentNode!.insertBefore(nodeA, nodeB);

            // Move `nodeB` to before the sibling of `nodeA`
            parentA!.insertBefore(nodeB, siblingA);
        };
        let mainboardVNode = document.getElementById('mainboard');
        let mainboardPocket0 = document.getElementById('pocket00');
        let mainboardPocket1 = document.getElementById('pocket01');

        let bugboardVNode = document.getElementById('bugboard');
        let bugboardPocket0 = document.getElementById('pocket10');
        let bugboardPocket1 = document.getElementById('pocket11');

        swap(mainboardVNode!, bugboardVNode!);
        swap(mainboardPocket0!, bugboardPocket0!);
        swap(mainboardPocket1!, bugboardPocket1!);
    }


    sendMove = (b: ChessgroundController, orig: cg.Orig, dest: cg.Key, promo: string) => {
        console.log(b,orig,dest,promo);
        this.doSendMove(b, orig, dest, promo);
    }

    //
    // private abort = () => {
    //     // console.log("Abort");
    //     this.doSend({ type: "abort", gameId: this.gameId });
    // }
    //
    // private draw = () => {
    //     // console.log("Draw");
    //     if (confirm(_('Are you sure you want to draw?'))) {
    //         this.doSend({ type: "draw", gameId: this.gameId });
    //         this.setDialog(_("Draw offer sent"));
    //     }
    // }
    //
    // private rejectDrawOffer = () => {
    //     this.doSend({ type: "reject_draw", gameId: this.gameId });
    //     this.clearDialog();
    // }
    //
    // private renderDrawOffer = () => {
    //     this.vdialog = patch(this.vdialog, h('div#offer-dialog', [
    //         h('div', { class: { reject: true }, on: { click: () => this.rejectDrawOffer() } }, h('i.icon.icon-abort.reject')),
    //         h('div.text', _("Your opponent offers a draw")),
    //         h('div', { class: { accept: true }, on: { click: () => this.draw() } }, h('i.icon.icon-check')),
    //     ]));
    // }
    //
    // private setDialog = (message: string) => {
    //     this.vdialog = patch(this.vdialog, h('div#offer-dialog', [
    //         h('div', { class: { reject: false } }),
    //         h('div.text', message),
    //         h('div', { class: { accept: false } }),
    //     ]));
    // }
    //
    private clearDialog = () => {
        this.vdialog = patch(this.vdialog, h('div#offer-dialog', []));
    }

    //
    // private resign = () => {
    //     // console.log("Resign");
    //     if (confirm(_('Are you sure you want to resign?'))) {
    //         this.doSend({ type: "resign", gameId: this.gameId });
    //     }
    // }

    // Janggi second player (Red) setup
    // private onMsgSetup = (msg: MsgSetup) => {
    //     this.setupFen = msg.fen;
    //     this.chessground.set({fen: this.setupFen});
    //
    //     const side = (msg.color === 'white') ? _('Blue (Cho)') : _('Red (Han)');
    //     const message = _('Waiting for %1 to choose starting positions of the horses and elephants...', side);
    //
    //     this.expiStart = 0;
    //     this.renderExpiration();
    //     this.turnColor = msg.color;
    //     this.expiStart = Date.now();
    //     setTimeout(this.showExpiration, 350);
    //
    //     if (this.spectator || msg.color !== this.mycolor) {
    //         chatMessage('', message, "roundchat");
    //         return;
    //     }
    //
    //     chatMessage('', message, "roundchat");
    //
    //     const switchLetters = (side: number) => {
    //         const white = this.mycolor === 'white';
    //         const rank = (white) ? 9 : 0;
    //         const horse = (white) ? 'N' : 'n';
    //         const elephant = (white) ? 'B' : 'b';
    //         const parts = this.setupFen.split(' ')[0].split('/');
    //         let [left, right] = parts[rank].split('1')
    //         if (side === -1) {
    //             left = left.replace(horse, '*').replace(elephant, horse).replace('*', elephant);
    //         } else {
    //             right = right.replace(horse, '*').replace(elephant, horse).replace('*', elephant);
    //         }
    //         parts[rank] = left + '1' + right;
    //         this.setupFen = parts.join('/') + ' w - - 0 1' ;
    //         this.chessground.set({fen: this.setupFen});
    //     }
    //
    //     const sendSetup = () => {
    //         patch(document.getElementById('janggi-setup-buttons') as HTMLElement, h('div#empty'));
    //         this.doSend({ type: "setup", gameId: this.gameId, color: this.mycolor, fen: this.setupFen });
    //     }
    //
    //     const leftSide = (this.mycolor === 'white') ? -1 : 1;
    //     const rightSide = leftSide * -1;
    //     patch(document.getElementById('janggi-setup-buttons') as HTMLElement, h('div#janggi-setup-buttons', [
    //         h('button#flipLeft', { on: { click: () => switchLetters(leftSide) } }, [h('i', {props: {title: _('Switch pieces')}, class: {"icon": true, "icon-exchange": true} } ), ]),
    //         h('button', { on: { click: () => sendSetup() } }, [h('i', {props: {title: _('Ready')}, class: {"icon": true, "icon-check": true} } ), ]),
    //         h('button#flipRight', { on: { click: () => switchLetters(rightSide) } }, [h('i', {props: {title: _('Switch pieces')}, class: {"icon": true, "icon-exchange": true} } ), ]),
    //     ]));
    // }

    private notifyMsg = (msg: string) => {
        if (this.status >= 0) return;

        const opp_name = this.username === this.wplayer ? this.bplayer : this.wplayer;
        const logoUrl = `${this.home}/static/favicon/android-icon-192x192.png`;
        notify('pychess.org', {body: `${opp_name}\n${msg}`, icon: logoUrl});
    }

    // private onMsgBerserk = (msg: MsgBerserk) => {
    //     if (!this.spectator && msg['color'] === this.mycolor) return;
    //     this.berserk(msg['color'])
    // }
    //
    private onMsgGameStart = (msg: MsgGameStart) => {
        // console.log("got gameStart msg:", msg);
        if (msg.gameId !== this.gameId) return;
        if (!this.spectator) {
            sound.genericNotify();
            if (!this.focus) this.notifyMsg('joined the game.');
        }
    }
    //
    // private onMsgNewGame = (msg: MsgNewGame) => {
    //     window.location.assign(this.home + '/' + msg["gameId"]);
    // }
    //
    // private onMsgViewRematch = (msg: MsgViewRematch) => {
    //     const btns_after = document.querySelector('.btn-controls.after') as HTMLElement;
    //     let rematch_button = h('button.newopp', { on: { click: () => window.location.assign(this.home + '/' + msg["gameId"]) } }, _("VIEW REMATCH"));
    //     let rematch_button_location = btns_after!.insertBefore(document.createElement('div'), btns_after!.firstChild);
    //     patch(rematch_button_location, rematch_button);
    // }
    //
    private rematch = () => {
        console.log("rematch not implemented")
        // this.doSend({ type: "rematch", gameId: this.gameId, handicap: this.handicap });
        // this.setDialog(_("Rematch offer sent"));
    }
    //
    // private rejectRematchOffer = () => {
    //     this.doSend({ type: "reject_rematch", gameId: this.gameId });
    //     this.clearDialog();
    // }
    //
    // private renderRematchOffer = () => {
    //     this.vdialog = patch(this.vdialog, h('div#offer-dialog', [
    //         h('div', { class: { reject: true }, on: { click: () => this.rejectRematchOffer() } }, h('i.icon.icon-abort.reject')),
    //         h('div.text', _("Your opponent offers a rematch")),
    //         h('div', { class: { accept: true }, on: { click: () => this.rematch() } }, h('i.icon.icon-check')),
    //     ]));
    // }
    //
    private newOpponent = (home: string) => {
        console.log("newOpponent not implemented ", home);
        // this.doSend({"type": "leave", "gameId": this.gameId});
        // window.location.assign(home);
    }
    //
    private analysis = (home: string) => {
        window.location.assign(home + '/' + this.gameId + '?ply=' + this.ply.toString());
    }
    //
    // private joinTournament = () => {
    //     window.location.assign(this.home + '/tournament/' + this.tournamentId);
    // }
    //
    // private pauseTournament = () => {
    //     window.location.assign(this.home + '/tournament/' + this.tournamentId + '/pause');
    // }

    private gameOver = (rdiffs: RDiffs) => {
        let container;
        container = document.getElementById('wrdiff') as HTMLElement;
        if (container) patch(container, renderRdiff(rdiffs["wrdiff"]));

        container = document.getElementById('brdiff') as HTMLElement;
        if (container) patch(container, renderRdiff(rdiffs["brdiff"]));

        // console.log(rdiffs)
        this.gameControls = patch(this.gameControls, h('div'));
        let buttons: VNode[] = [];
        if (!this.spectator) {
            buttons.push(h('button.rematch', { on: { click: () => this.rematch() } }, _("REMATCH")));
            buttons.push(h('button.newopp', { on: { click: () => this.newOpponent(this.home) } }, _("NEW OPPONENT")));
        }
        buttons.push(h('button.analysis', { on: { click: () => this.analysis(this.home) } }, _("ANALYSIS BOARD")));
        patch(this.gameControls, h('div.btn-controls.after', buttons));
    }

    private checkStatus = (msg: MsgBoard | MsgGameEnd) => {
        console.log(msg);
        if (msg.gameId !== this.gameId) return;
        if (msg.status >= 0) {
            this.status = msg.status;
            this.result = msg.result;
            this.clocks[0].pause(false);
            this.clocks[1].pause(false);
            this.clocksB[0].pause(false);
            this.clocksB[1].pause(false);
            // this.dests = new Map();

            // if (this.result !== "*" && !this.spectator && !this.finishedGame) todo:niki: i dont understand why !finishedGame and we issue a gameEndSound
            //     sound.gameEndSound(msg.result, this.mycolor); todo:niki: i dont understand why it matters whose color it is?

            if ("rdiffs" in msg) this.gameOver(msg.rdiffs); //todo:niki: am i still using rdiffs - probably i should for boardA
            // selectMove(this, this.ply);TODO:NIKI

            // updateResult(this);TODO:NIKI

            // if ("ct" in msg && msg.ct) {
            //     this.ctableContainer = patch(this.ctableContainer, h('div.ctable-container'));
            //     this.ctableContainer = patch(this.ctableContainer, crosstableView(msg.ct, this.gameId));
            // }

            // clean up gating/promotion widget left over the ground while game ended by time out
            const container = document.getElementById('extension_choice') as HTMLElement;
            if (container instanceof Element) patch(container, h('extension'));

            if (this.tv) {
                setInterval(() => {this.doSend({ type: "updateTV", gameId: this.gameId, profileId: this.profileid });}, 2000);
            }

            this.clearDialog();
        }
    }

    private onMsgUpdateTV = (msg: MsgUpdateTV) => {
        console.log(msg);
        // if (msg.gameId !== this.gameId) {
        //     if (this.profileid !== "") {
        //         window.location.assign(this.home + '/@/' + this.profileid + '/tv');
        //     } else {
        //         window.location.assign(this.home + '/tv');
        //     }
        //     // TODO: reuse current websocket to fix https://github.com/gbtami/pychess-variants/issues/142
        //     // this.doSend({ type: "game_user_connected", username: this.username, gameId: msg.gameId });
        // }
    }

    private onMsgBoard = (msg: MsgBoard) => {
        console.log(msg);
        if (msg.gameId !== this.gameId) return;

        // console.log("got board msg:", msg);
        let latestPly;
        if (this.spectator) {
            // Fix https://github.com/gbtami/pychess-variants/issues/687
            latestPly = (this.ply === -1 || msg.ply === this.ply + 1);
        } else {
            latestPly = (this.ply === -1 || msg.ply >= this.ply + 1); // when receiving a board msg with full list of moves (aka steps) after reconnecting
                                                                        // its ply might be ahead with 2 ply - our move that failed to get confirmed
                                                                        // because of disconnect and then also opp's reply to it, that we didn't
                                                                        // receive while offline. Not sure if it could be ahead with more than 2 ply
        }
        if (latestPly) this.ply = msg.ply;

        // list of legal promotion moves
        this.clocktimes = msg.clocks || this.clocktimes;

        this.result = msg.result;
        this.status = msg.status;

        if (msg.steps.length > 1) { // all steps in one message
            this.steps = [];
            const container = document.getElementById('movelist') as HTMLElement;
            patch(container, h('div#movelist'));

            msg.steps.forEach((step) => {
                this.steps.push(step);
                });
            const full = true;
            const activate = true;
            const result = false;
            updateMovelist(this, full, activate, result);
        } else { // single step message
            if (msg.ply === this.steps.length) {
                // const step = {
                //     'fen': msg.fen,
                //     'move': msg.lastMove,
                //     'check': msg.check,
                //     'turnColor': this.turnColor,
                //     'san': msg.steps[0].san,
                //     }; todo:niki:why not use step[0] and do this above? temporary doing it like this will see what will go wrong when testing
                this.steps.push(msg.steps[0]);
                const full = false;
                const activate = !this.spectator || latestPly;
                const result = false;
                updateMovelist(this, full, activate, result);
            }
        }

        this.clockOn = Number(msg.ply) >= 2;
        if ( !this.spectator && this.clockOn ) {
            const container = document.getElementById('abort') as HTMLElement;
            if (container) patch(container, h('div'));
        }

        //todo:niki:sound not implemented for now
        const lastMove = uci2LastMove(msg.lastMove);
        // const step = this.steps[this.steps.length - 1];
        // const capture = (lastMove.length > 0) && ((this.chessground.state.pieces.get(lastMove[1]) && step.san?.slice(0, 2) !== 'O-') || (step.san?.slice(1, 2) === 'x'));
        //
        // if (lastMove.length > 0 && (this.turnColor === this.mycolor || this.spectator)) {
        //     if (!this.finishedGame) sound.moveSound(this.variant, capture);
        // }
        this.checkStatus(msg);
        // if (!this.spectator && msg.check && !this.finishedGame) {
        //     sound.check();
        // }

        //todo:niki:when server sends board message, should it always send clocks for both board or only for the one we are updating?
        const oppclock = /*!this.flipped() ?*/ 0 /*: 1*/;
        const myclock = 1 - oppclock;

        this.clocks[0].pause(false);
        this.clocks[1].pause(false);

        this.clocks[oppclock].setTime(this.clocktimes['black']);
        this.clocks[myclock].setTime(this.clocktimes['white']);

        const isInitialBoardMessage = !(msg.steps[0].boardName);
        const board = msg.steps[0].boardName === 'a'? this.b1: this.b2;
        if (isInitialBoardMessage) {
            this.b1.turnColor = "white"; //todo:niki:probably dont need this initialization, but do need the if-else so not to switch turn color on first message. Alternatively could get the turn color from the server though - as in other variants i think
            this.b2.turnColor = "white";
        } else {
            board.turnColor = board.turnColor === 'white' ? 'black' : 'white';
        }
        if (this.spectator) {
            //todo:niki:spectator mode not implemented for now
            if (latestPly) {
                // this.chessground.set({
                //     fen: this.fullfen,
                //     turnColor: this.turnColor,
                //     check: msg.check,
                //     lastMove: lastMove,
                // });
            }
            if (this.clockOn && msg.status < 0) {
                if (this.b1.turnColor === 'white') {
                    this.clocks[1].start();
                } else {
                    this.clocks[0].start();
                }
                if (this.b2.turnColor === 'white') {
                    this.clocks[0].start();
                } else {
                    this.clocks[1].start();
                }
            }
        } else {
            const fens = msg.fen.split(" | ");


            if (isInitialBoardMessage || this.mycolor.get(msg.steps[0].boardName!)!.has(board.turnColor)) {
                //when message is for opp's move or it is the initializiation board message:
                if (latestPly) {
                    //todo:niki: i need to update both board only on initial board message and tbh only if 960 but for now lets always do it
                    this.b1.chessground.set({
                        fen: fens[0],
                        turnColor: this.b1.turnColor,
                        movable: {
                            free: false,
                            color: this.mycolor.get('a')!.size > 1? 'both': this.b1.turnColor,
                            // dests: msg.dests,
                        },
                        check: msg.check,//todo:niki:which board is this about?
                        lastMove: lastMove,
                    });
                    this.b2.chessground.set({
                        fen: fens[1],
                        turnColor: this.b2.turnColor,
                        movable: {
                            free: false,
                            color: this.mycolor.get('b')!.size > 1? 'both': this.b2.turnColor,
                            // dests: msg.dests,
                        },
                        check: msg.check,//todo:niki:which board is this about?
                        lastMove: lastMove,
                    });

                    if (!this.focus) this.notifyMsg(`Played ${msg.steps[0].san}\nYour turn.`);

                    // prevent sending premove/predrop when (auto)reconnecting websocked asks server to (re)sends the same board to us
                    // console.log("trying to play premove....");
                    //todo:niki:premoves/drops
                    // if (this.premove) this.performPremove();
                    // if (this.predrop) this.performPredrop();
                }
                if (this.clockOn && msg.status < 0) {
                    (msg.steps[0].boardName === 'a'? this.clocks: this.clocksB)[myclock].start(); //todo: consider using map as with mycolor., other places as well
                    // console.log('MY CLOCK STARTED');
                }
            } else {
                //when message is about the move i just made
                this.b1.chessground.set({
                    // giving fen here will place castling rooks to their destination in chess960 variants
                    fen: fens[0],
                    turnColor: this.b1.turnColor,
                    check: msg.check,
                });
                this.b1.chessground.set({
                    // giving fen here will place castling rooks to their destination in chess960 variants
                    fen: fens[1],
                    turnColor: this.b1.turnColor,
                    check: msg.check,
                });
                if (this.clockOn && msg.status < 0) {
                    (msg.steps[0].boardName === 'a'? this.clocks: this.clocksB)[oppclock].start();
                    // console.log('OPP CLOCK  STARTED');
                }
            }
        }
        // this.updateMaterial();
    }

    doSend = (message: JSONObject) => {
        console.log("---> doSend():", message);
        this.sock.send(JSON.stringify(message));
    }


    goPly = (ply: number, plyVari = 0) => {
        console.log(ply, plyVari);
        this.ply = ply;

        const step = this.steps[ply];
        console.log(step);

        const board=step.boardName==='a'?this.b1:this.b2;

        const fen=step.boardName==='a'?step.fen: step.fenB;
        const fenPartner=step.boardName==='b'?step.fen: step.fenB;

        const move = step.boardName==='a'?uci2LastMove(step.move):uci2LastMove(step.moveB);
        const movePartner = step.boardName==='b'?uci2LastMove(step.move):uci2LastMove(step.moveB);

        let capture = false;
        if (move) {
            // 960 king takes rook castling is not capture
            // TODO defer this logic to ffish.js
            capture = (board.chessground.state.boardState.pieces.get(move[1]) !== undefined && step.san?.slice(0, 2) !== 'O-') || (step.san?.slice(1, 2) === 'x');
        }

        board.chessground.set({
            fen: fen,
            turnColor: step.turnColor,
            movable: {
                color: step.turnColor,
                dests: board.dests,//todo:niki:probably has to re-init this for variations or disable moves until variations are supported - current value probably wrong either way
                },
            check: step.check,
            lastMove: move,
        });

        board.partnerCC.chessground.set({fen: fenPartner, lastMove: movePartner});

        board.fullfen = step.fen;
        board.partnerCC.fullfen = fenPartner!;

        if (ply === this.ply + 1) {//todo:niki:pretty sure this is noop as it is
            sound.moveSound(board.variant, capture);
        }

        // Go back to the main line
        if (plyVari === 0) {
            this.ply = ply;//todo:niki:this has to be local ply - cant remember why i need it though
        }
        board.turnColor = step.turnColor;

        if (board.ffishBoard !== null) {
            board.ffishBoard.setFen(board.fullfen);
            // board.dests = board.parent.setDests(board);//todo:niki:maybe do this before chessground set above.
            board.setDests();
        }
    }

    doSendMove = (b: ChessgroundController, orig: cg.Orig, dest: cg.Key, promo: string) => {
        this.clearDialog();
        // pause() will add increment!
        const oppclock = !b.flipped() ? 0 : 1
        const myclock = 1 - oppclock;
        const clock = (b.boardName === 'a'? this.clocks: this.clocksB);
        const movetime = (clock[myclock].running) ? Date.now() - clock[myclock].startTime : 0;
        clock[myclock].pause((this.base === 0 && this.ply < 2) ? false : true);
        // console.log("sendMove(orig, dest, prom)", orig, dest, promo);

        const move = cg2uci(orig + dest + promo);
//todo:this is all wrong - i should get the move color from the move itself so can support same user playing both sides but lets make it compile first then think:
        const moveColor = this.mycolor.get(b.boardName)!.has("black")? "black" : "white";
        // console.log("sendMove(move)", move);
        let bclock, clocks;
        if (!b.flipped()) {
            bclock = this.mycolor.get(b.boardName)!.has("black") ? 1 : 0;
        } else {
            bclock = this.mycolor.get(b.boardName)!.has("black") ? 0 : 1;
        }
        const wclock = 1 - bclock

        const increment = (this.inc > 0 && this.ply >= 2) ? this.inc * 1000 : 0;
        const bclocktime = (this.mycolor.get(b.boardName)!.has("black") && b.preaction) ? this.clocktimes.black + increment: this.clocks[bclock].duration;
        const wclocktime = (this.mycolor.get(b.boardName)!.has("white") && b.preaction) ? this.clocktimes.white + increment: this.clocks[wclock].duration;

        clocks = {movetime: (b.preaction) ? 0 : movetime, black: bclocktime, white: wclocktime};

        //todo:niki:need to add board here - aslo how does the fact that we have 2 boards affect this logic? e.g. in simul mode maybe we need to save 2 moves for the 2 boards when we simuling
        this.lastMaybeSentMsgMove = { type: "move", gameId: this.gameId, move: move, clocks: clocks, ply: this.ply + 1, board: b.boardName };
        this.doSend(this.lastMaybeSentMsgMove as JSONObject);

        if (b.preaction) {
            this.clocks[myclock].setTime(this.clocktimes[moveColor] + increment);
        }
        if (this.clockOn) this.clocks[oppclock].start();
    }

    //
    // private setPremove = (orig: cg.Key, dest: cg.Key, metadata?: cg.SetPremoveMetadata) => {
    //     this.premove = { orig, dest, metadata };
    //     // console.log("setPremove() to:", orig, dest, meta);
    // }
    //
    // private unsetPremove = () => {
    //     this.premove = undefined;
    //     this.preaction = false;
    // }
    //
    // private setPredrop = (role: cg.Role, key: cg.Key) => {
    //     this.predrop = { role, key };
    //     // console.log("setPredrop() to:", role, key);
    // }
    //
    // private unsetPredrop = () => {
    //     this.predrop = undefined;
    //     this.preaction = false;
    // }
    //
    // private performPremove = () => {
    //     // const { orig, dest, meta } = this.premove;
    //     // TODO: promotion?
    //     // console.log("performPremove()", orig, dest, meta);
    //     this.chessground.playPremove();
    // }
    //
    // private performPredrop = () => {
    //     // const { role, key } = this.predrop;
    //     // console.log("performPredrop()", role, key);
    //     this.chessground.playPredrop();
    // }

    private onMsgUserConnected = (msg: MsgUserConnected) => {
        console.log(msg);
        this.username = msg["username"];
        if (this.spectator) {
            console.log('todo');
            // this.doSend({ type: "is_user_present", username: this.wplayer, gameId: this.gameId });
            // this.doSend({ type: "is_user_present", username: this.bplayer, gameId: this.gameId });

        } else {
            this.firstmovetime = msg.firstmovetime || this.firstmovetime;

            const opp_name = this.username === this.wplayer ? this.bplayer : this.wplayer;
            this.doSend({ type: "is_user_present", username: opp_name, gameId: this.gameId });
            // todo: 2 more is_user_present calls for the other board maybe

            const container = document.getElementById('player1a') as HTMLElement;
            patch(container, h('i-side.online#player1a', {class: {"icon": true, "icon-online": true, "icon-offline": false}}));

            // prevent sending gameStart message when user just reconecting
            if (msg.ply === 0) {
                this.doSend({ type: "ready", gameId: this.gameId });
            }
        }
        // We always need this to get possible moves made while our websocket connection was established
        // fixes https://github.com/gbtami/pychess-variants/issues/962
        this.doSend({ type: "board", gameId: this.gameId });
    }

    private onMsgUserPresent = (msg: MsgUserPresent) => {
        console.log(msg);
        if (msg.username === this.players[0]) {
            const container = document.getElementById('player0a') as HTMLElement;
            patch(container, h('i-side.online#player0a', {class: {"icon": true, "icon-online": true, "icon-offline": false}}));
        }
        if (msg.username === this.players[1]) {
            const container = document.getElementById('player1a') as HTMLElement;
            patch(container, h('i-side.online#player1a', {class: {"icon": true, "icon-online": true, "icon-offline": false}}));
        }
        if (msg.username === this.playersB[0]) {
            const container = document.getElementById('player0b') as HTMLElement;
            patch(container, h('i-side.online#player0b', {class: {"icon": true, "icon-online": true, "icon-offline": false}}));
        }
        if (msg.username === this.playersB[1]) {
            const container = document.getElementById('player1b') as HTMLElement;
            patch(container, h('i-side.online#player1b', {class: {"icon": true, "icon-online": true, "icon-offline": false}}));
        }
    }

    private onMsgUserDisconnected = (msg: MsgUserDisconnected) => {
        console.log(msg);
        // if (msg.username === this.players[0]) {
        //     const container = document.getElementById('player0') as HTMLElement;
        //     patch(container, h('i-side.online#player0', {class: {"icon": true, "icon-online": false, "icon-offline": true}}));
        // } else {
        //     const container = document.getElementById('player1') as HTMLElement;
        //     patch(container, h('i-side.online#player1', {class: {"icon": true, "icon-online": false, "icon-offline": true}}));
        // }
    }

    private onMsgDrawOffer = (msg: MsgDrawOffer) => {
        chatMessage("", msg.message, "roundchat");
        // if (!this.spectator && msg.username !== this.username) this.renderDrawOffer();
    }

    private onMsgDrawRejected = (msg: MsgDrawRejected) => {
        chatMessage("", msg.message, "roundchat");
        // this.clearDialog();
    }

    private onMsgRematchOffer = (msg: MsgRematchOffer) => {
        chatMessage("", msg.message, "roundchat");
        // if (!this.spectator && msg.username !== this.username) this.renderRematchOffer();
    }

    private onMsgRematchRejected = (msg: MsgRematchRejected) => {
        chatMessage("", msg.message, "roundchat");
        // this.clearDialog();
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

    protected onMessage(evt: MessageEvent) {
        console.log("<+++ onMessage():", evt.data);
        // super.onMessage(evt);
        if (evt.data === '/n') return; // todo:niki: not sure where this comes from, temporary working around it like this
        const msg = JSON.parse(evt.data);
        switch (msg.type) {
            // copy pated from gameCtl.ts->onMessage, which is otherwise inherited in normal roundCtrl
            case "spectators":
                // this.onMsgSpectators(msg);
                break;
            case "roundchat":
                // this.onMsgChat(msg);
                break;
            case "fullchat":
                this.onMsgFullChat(msg);
                break;
            case "game_not_found":
                // this.onMsgGameNotFound(msg);
                break
            case "shutdown":
                // this.onMsgShutdown(msg);
                break;
            case "logout":
                // this.doSend({type: "logout"});
                break;
            // ~copy pated from gameCtl.ts->onMessage, which is otherwise inherited in normal roundCtrl
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
            case "user_present":
                this.onMsgUserPresent(msg);
                break;
            case "user_disconnected":
                this.onMsgUserDisconnected(msg);
                break;
            case "new_game":
                // this.onMsgNewGame(msg);
                break;
            case "view_rematch":
                // this.onMsgViewRematch(msg);
                break;
            case "draw_offer":
                this.onMsgDrawOffer(msg);
                break;
            case "draw_rejected":
                this.onMsgDrawRejected(msg);
                break;
            case "rematch_offer":
                this.onMsgRematchOffer(msg);
                break;
            case "rematch_rejected":
                this.onMsgRematchRejected(msg);
                break;
            case "updateTV":
                this.onMsgUpdateTV(msg);
                break
            case "setup":
                // this.onMsgSetup(msg);
                break;
            case "berserk":
                // this.onMsgBerserk(msg);
                break;
        }
    }
}
