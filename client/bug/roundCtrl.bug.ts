import { h, VNode } from 'snabbdom';
import * as cg from 'chessgroundx/types';

import { _ } from '../i18n';
import { patch } from '../document';
import { Clock } from '../clock';
import {ChatController, chatMessage, chatView} from '../chat';
import {createMovelistButtons, updateMovelist} from './movelist.bug';
import {
    Clocks,
    MsgBoard,
    MsgChat,
    MsgFullChat,
    MsgGameEnd,
    MsgMove,
    MsgMovesAfterReconnect,
    MsgNewGame,
    MsgUserConnected,
    RDiffs,
    Step
} from "../messages";
import {
    MsgUserDisconnected,
    MsgUserPresent,
    MsgDrawOffer,
    MsgDrawRejected,
    MsgRematchOffer,
    MsgRematchRejected,
    MsgUpdateTV,
    MsgGameStart, MsgViewRematch
} from '../roundType';
import {JSONObject, PyChessModel} from "../types";
import {GameControllerBughouse} from "./gameCtrl.bug";
import {cg2uci, uci2LastMove} from "../chess";
import {sound} from "../sound";
import {renderRdiff} from "../result";
import {player} from "../player";
import {newWebsocket} from "../socket";
import WebsocketHeartbeatJs from "websocket-heartbeat-js";
import {notify} from "../notification";
import {FEN} from "chessgroundx/types";
import {VARIANTS} from "../variants";

export class RoundControllerBughouse implements ChatController/*extends GameController todo:does it make sense for these guys - also AnalysisControl which is older before this refactring that introduced this stuff*/ {
    sock: WebsocketHeartbeatJs;

    b1: GameControllerBughouse;
    b2: GameControllerBughouse;

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
    handicap: boolean = false;
    setupFen: string;
    prevPieces: cg.Pieces;
    focus: boolean;
    finishedGame: boolean;
    msgMovesAfterReconnect: MsgMovesAfterReconnect; // Always store the last "move" message that was passed for sending via websocket.
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

    colors: cg.Color[];
    colorsB: cg.Color[];

    players: string[];
    playersB: string[];

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

    myColor: Map<'a'|'b', cg.Color|undefined> = new Map<'a'|'b', cg.Color|undefined>([['a', undefined],['b', undefined]]);
    partnerColor: Map<'a'|'b', cg.Color|undefined> = new Map<'a'|'b', cg.Color|undefined>([['a', undefined],['b', undefined]]);

    constructor(el1: HTMLElement,el1Pocket1: HTMLElement,el1Pocket2: HTMLElement,el2: HTMLElement,el2Pocket1: HTMLElement,el2Pocket2: HTMLElement, model: PyChessModel) {

        this.home = model.home;

        this.base = Number(model["base"]);
        this.inc = Number(model["inc"]);
        this.status = Number(model["status"]);

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
            console.log('onOpen');

            try {
                console.log("resending unsent move messages ", this.msgMovesAfterReconnect);
                this.doSend(this.msgMovesAfterReconnect);
            } catch (e) {
                console.log("could not even REsend unsent messages ", this.msgMovesAfterReconnect)
            }

            this.clocks[0].connecting = false;
            this.clocks[1].connecting = false;
            this.clocksB[0].connecting = false;
            this.clocksB[1].connecting = false;

            const cl = document.body.classList; // removing the "reconnecting" message in lower left corner
            cl.remove('offline');
            cl.add('online');

            this.doSend({ type: "game_user_connected", username: this.username, gameId: this.gameId });
        };

        const onReconnect = () => {
            console.log('onReconnect');
            document.body.classList.add('reconnected'); // this will trigger the animation once we get "online" class added back on reconnect

            const container = document.getElementById('player1a') as HTMLElement;
            patch(container, h('i-side.online#player1a', {class: {"icon": true, "icon-online": false, "icon-offline": true}}));
        };

        const onClose = () => {
            console.log('onClose');
            this.clocks[0].connecting = true;
            this.clocks[1].connecting = true;
            this.clocksB[0].connecting = true;
            this.clocksB[1].connecting = true;
            // relevant to the "reconnecting" message in lower left corner
            document.body.classList.add('offline');
            document.body.classList.remove('online');
        };

        const onError = () => {
            console.log("onError");
        }

        this.sock = newWebsocket('wsr');
        const f = this.sock.ws.onclose;
        this.sock.ws.onclose = (e) => { console.log("onclose1"); f(e); console.log("onclose2");}
        const f1 = this.sock.ws.close.bind(this.sock.ws); //todo:niki:mainly for debug purposes to understand howit works for now. could put logic for the red popup here eventually, because at least when browser trottle is set to offline it never triggers onclose until actually disable trottle back - not sure if same in normal disconnect
        this.sock.ws.close = () => { console.log("close() 1"); f1(); console.log("close() 2");}

        this.sock.forbidReconnect = false;
        this.sock.onopen = () => onOpen();
        this.sock.onreconnect = () => onReconnect();
        this.sock.onclose = () => onClose();
        this.sock.onmessage = (e: MessageEvent) => this.onMessage(e);
        this.sock.onerror = () => onError(e);
//
        this.finishedGame = this.status >= 0;
        this.tv = model["tv"];
        this.profileid = model["profileid"];
        this.level = model["level"];

        this.settings = true;
        this.blindfold = localStorage.blindfold === undefined ? false : localStorage.blindfold === "true";
        this.autoPromote = localStorage.autoPromote === undefined ? false : localStorage.autoPromote === "true";

        this.clockOn = true;//(Number(parts[parts.length - 1]) >= 2);

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
        if (this.wplayer === this.username) this.myColor.set('a', 'white');
        if (this.bplayer === this.username) this.myColor.set('a', 'black');
        if (this.wplayerB === this.username) this.myColor.set('b', 'white');
        if (this.bplayerB === this.username) this.myColor.set('b', 'black');
//
        if (this.wplayer === this.username) this.partnerColor.set('b', 'black');
        if (this.bplayer === this.username) this.partnerColor.set('b', 'white');
        if (this.wplayerB === this.username) this.partnerColor.set('a', 'black');
        if (this.bplayerB === this.username) this.partnerColor.set('a', 'white');
//
        this.spectator = this.username !== this.wplayer && this.username !== this.bplayer && this.username !== this.wplayerB && this.username !== this.bplayerB;
// this represents only the initial positioning of players on the screen. Flip/switch will not change those values
// but only work on html elements, so these remain constant as initialized here throughout the whole game:
        if (this.spectator) {
// board A - 0 means top, 1 means bottom
            this.colors = [ 'black', 'white' ];
// board B - 0 means top, 1 means bottom
            this.colorsB = [ 'white', 'black' ];
        } else {
// board A - 0 means top, 1 means bottom
            this.colors = [
                this.myColor.get('a') === 'black' || this.partnerColor.get('a') === 'black' ? 'white' : 'black',
                this.myColor.get('a') === 'white' || this.partnerColor.get('a') === 'white' ? 'white' : 'black'
            ];
// board B - 0 means top, 1 means bottom
            this.colorsB = [
                this.myColor.get('b') === 'black' || this.partnerColor.get('b') === 'black' ? 'white' : 'black',
                this.myColor.get('b') === 'white' || this.partnerColor.get('b') === 'white' ? 'white' : 'black'
            ];
        }
//
// board A - 0 means top, 1 means bottom
        this.players = [
            this.colors[0] === 'white' ? this.wplayer : this.bplayer,
            this.colors[1] === 'white' ? this.wplayer : this.bplayer
        ];
// board B - 0 means top, 1 means bottom
        this.playersB = [
            this.colorsB[0] === 'white' ? this.wplayerB : this.bplayerB,
            this.colorsB[1] === 'white' ? this.wplayerB : this.bplayerB
        ];
//

        const ratings = new Map<string, string>([[this.wplayer, this.wrating], [this.bplayer, this.brating], [this.wplayerB, this.wratingB], [this.bplayerB, this.bratingB]]);
        const titles = new Map<string, string>([[this.wplayer, this.wtitle], [this.bplayer, this.btitle], [this.wplayerB, this.wtitleB], [this.bplayerB, this.btitleB]]);
        const player0a = document.getElementById('rplayer0a') as HTMLElement;
        const player1a = document.getElementById('rplayer1a') as HTMLElement;
        this.vplayerA0 = patch(player0a, player('round-player0', 'player0a', titles.get(this.players[0])!, this.players[0], ratings.get(this.players[0])!, this.level));
        this.vplayerA1 = patch(player1a, player('round-player1', 'player1a', titles.get(this.players[1])!, this.players[1], ratings.get(this.players[1])!, this.level));

        const player0b = document.getElementById('rplayer0b') as HTMLElement;
        const player1b = document.getElementById('rplayer1b') as HTMLElement;
        this.vplayerB0 = patch(player0b, player('round-player0.bug', 'player0b', titles.get(this.playersB[0])!, this.playersB[0], ratings.get(this.playersB[0])!, this.level));
        this.vplayerB1 = patch(player1b, player('round-player1.bug', 'player1b', titles.get(this.playersB[1])!, this.playersB[1], ratings.get(this.playersB[1])!, this.level));

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

        const flagCallbackA = () => {
            if ( this.myColor.get('a') === this.b1.turnColor ) {
                this.b1.chessground.stop();
                this.b2.chessground.stop();
                // console.log("Flag");
                this.doSend({ type: "flag", gameId: this.gameId });
            }
        }
        const flagCallbackB = () => {
            if ( this.myColor.get('b') === this.b2.turnColor ) {
                this.b1.chessground.stop();
                this.b2.chessground.stop();
                // console.log("Flag");
                this.doSend({ type: "flag", gameId: this.gameId });
            }
        }

        if (!this.spectator) {
            this.clocks[0].onFlag(flagCallbackA);
            this.clocks[1].onFlag(flagCallbackA);
            this.clocksB[0].onFlag(flagCallbackB);
            this.clocksB[1].onFlag(flagCallbackB);
        }

        const container = document.getElementById('game-controls') as HTMLElement;
        if (!this.spectator) {
            let buttons = [];
            buttons.push(h('button#count', _('Count')));
            buttons.push(h('button#draw', { on: { click: () => this.draw() }, props: {title: _("Draw")} }, [h('i', '½')]));
            buttons.push(h('button#resign', { on: { click: () => this.resign() }, props: {title: _("Resign")} }, [h('i', {class: {"icon": true, "icon-flag-o": true} } ), ]));

            this.gameControls = patch(container, h('div.btn-controls', buttons));

            patch(document.getElementById('count') as HTMLElement, h('div'));

        } else {
            this.gameControls = patch(container, h('div.btn-controls'));
        }

        //////////////

        this.b1 = new GameControllerBughouse(el1, el1Pocket1, el1Pocket2, 'a', model); //todo:niki:fen maybe should be parsed from bfen. what situation do we start from custom fen?
        this.b2 = new GameControllerBughouse(el2, el2Pocket1, el2Pocket2, 'b', model);
        this.b1.partnerCC = this.b2;
        this.b2.partnerCC = this.b1;
        this.b1.parent = this;
        this.b2.parent = this;

        ///////

        this.b1.chessground.set({
            orientation: this.myColor.get('a') === 'white' || this.partnerColor.get('a') === 'white' || this.spectator? 'white': 'black',
            turnColor: 'white',
            movable: {
                free: false,
                color: this.myColor.get('a') === 'white'? 'white': this.myColor.get('a') === 'black'? 'black': undefined
            },
            autoCastle: true, // TODO:niki:what is this?
        });
        this.b2.chessground.set({
            orientation: this.myColor.get('b') === 'white' || this.partnerColor.get('b') === 'white'? 'white': 'black',
            turnColor: 'white',
            movable: {
                free: false,
                color: this.myColor.get('b') === 'white'? 'white': this.myColor.get('b') === 'black'? 'black': undefined
            },
            autoCastle: true, // TODO:niki:what is this?
        });

        ////////////
        createMovelistButtons(this);
        this.vmovelist = document.getElementById('movelist') as HTMLElement;

        this.vdialog = patch(document.getElementById('offer-dialog')!, h('div#offer-dialog', ""));

        patch(document.getElementById('bugroundchat') as HTMLElement, chatView(this, "bugroundchat"));

        this.onMsgBoard(model["board"] as MsgBoard);

        /////////////////
        // const amISimuling = this.mycolor.get('a') !== undefined && this.mycolor.get('b') !== undefined;
        // const distinctOpps = new Set([this.wplayer, this.bplayer, this.wplayerB, this.bplayerB].filter((e) => e !== this.username));
        // const isOppSimuling = distinctOpps.size === 1;
        if (this.myColor.get('a') === undefined && !this.spectator) {
            // I am not playing on board A at all. Switch:
            this.switchBoards();
        }

        this.msgMovesAfterReconnect = {
            type: "reconnect",
            gameId: this.gameId
        }
    }


    flipBoards = (): void => {

        // boardSettings.updateDropSuggestion(); todo:niki:dont understand this at the moment

        let infoWrap0 = document.getElementsByClassName('info-wrap0')[0] as HTMLElement;
        let infoWrap0bug = document.getElementsByClassName('info-wrap0 bug')[0] as HTMLElement;
        let infoWrap1 = document.getElementsByClassName('info-wrap1')[0] as HTMLElement;
        let infoWrap1bug = document.getElementsByClassName('info-wrap1 bug')[0] as HTMLElement;

        let a = infoWrap0!.style.gridArea || "clock-top"; //todo;niki:dont remember why we need this || but i see i needed it for boards switch. Maybe not initialized in the beninning somehow i dont know. Check and document maybe if at all this approach for swapping remains like this
        infoWrap0!.style.gridArea = infoWrap1!.style.gridArea || "clock-bot";
        infoWrap1!.style.gridArea = a;
        a = infoWrap0bug!.style.gridArea || "clockB-top"; //todo;niki:dont remember why we need this || but i see i needed it for boards switch. Maybe not initialized in the beninning somehow i dont know. Check and document maybe if at all this approach for swapping remains like this
        infoWrap0bug!.style.gridArea = infoWrap1bug!.style.gridArea || "clockB-bot";
        infoWrap1bug!.style.gridArea = a;

        this.b1.toggleOrientation();
        this.b2.toggleOrientation();
    }

    switchBoards = (): void => {
        //todo:niki:not sure if best implementation possible below
        let mainboardVNode = document.getElementById('mainboard');
        let mainboardPocket0 = document.getElementById('pocket00');
        let mainboardPocket1 = document.getElementById('pocket01');

        let bugboardVNode = document.getElementById('bugboard');
        let bugboardPocket0 = document.getElementById('pocket10');
        let bugboardPocket1 = document.getElementById('pocket11');

        let infoWrap0 = document.getElementsByClassName('info-wrap0')[0] as HTMLElement;
        let infoWrap0bug = document.getElementsByClassName('info-wrap0 bug')[0] as HTMLElement;
        let infoWrap1 = document.getElementsByClassName('info-wrap1')[0] as HTMLElement;
        let infoWrap1bug = document.getElementsByClassName('info-wrap1 bug')[0] as HTMLElement;

        let a = mainboardVNode!.style.gridArea || "board";
        mainboardVNode!.style.gridArea = bugboardVNode!.style.gridArea || "boardPartner";
        bugboardVNode!.style.gridArea = a;

        a = infoWrap0!.style.gridArea || "clock-top"; //todo;niki:dont remember why we need this || but i see i needed it for boards switch. Maybe not initialized in the beninning somehow i dont know. Check and document maybe if at all this approach for swapping remains like this
        infoWrap0!.style.gridArea = infoWrap0bug!.style.gridArea || "clockB-top";
        infoWrap0bug!.style.gridArea = a;
        a = infoWrap1!.style.gridArea || "clock-bot"; //todo;niki:dont remember why we need this || but i see i needed it for boards switch. Maybe not initialized in the beninning somehow i dont know. Check and document maybe if at all this approach for swapping remains like this
        infoWrap1!.style.gridArea = infoWrap1bug!.style.gridArea || "clockB-bot";
        infoWrap1bug!.style.gridArea = a;

        swap(mainboardPocket0!, bugboardPocket0!);
        swap(mainboardPocket1!, bugboardPocket1!);



        this.b1.chessground.redrawAll();
        this.b2.chessground.redrawAll();
    }

    sendMove = (b: GameControllerBughouse, orig: cg.Orig, dest: cg.Key, promo: string) => {
        console.log(b,orig,dest,promo);
        this.clearDialog();

        //moveColor is "my color" on that board
        const moveColor = this.myColor.get(b.boardName) === "black"? "black" : "white";

        const oppclock = b.chessground.state.orientation === moveColor? 0: 1; // only makes sense when board is flipped which not supported in gameplay yet and itself only makes sense in spectators mode todo: also switching boards to be implemented
        const myclock = 1 - oppclock;

        // const oppclock = !b.flipped() ? 0 : 1
        // const myclock = 1 - oppclock;
        const clocks = (b.boardName === 'a'? this.clocks: this.clocksB);
        const clocktimes = (b.boardName === 'a'? this.clocktimes: this.clocktimesB);

        const movetime = (clocks[myclock].running) ? Date.now() - clocks[myclock].startTime : 0;
        // pause() will ALWAYS add increment, even on first move, because (for now) we dont have aborting timeout
        clocks[myclock].pause(true);
        // console.log("sendMove(orig, dest, prom)", orig, dest, promo);

        const move = cg2uci(orig + dest + promo);
        // console.log("sendMove(move)", move);

        const colors = b.boardName === 'a'? this.colors: this.colorsB;
        const bclock = colors[0] === "black"? 0: 1;
        const wclock = 1 - bclock

        const increment = (this.inc > 0 /*&& this.ply >= 2*/) ? this.inc * 1000 : 0;
        const bclocktime = (moveColor === "black" && b.preaction) ? clocktimes.black + increment: clocks[bclock].duration;
        const wclocktime = (moveColor === "white" && b.preaction) ? clocktimes.white + increment: clocks[wclock].duration;

        const msgClocks = {movetime: (b.preaction) ? 0 : movetime, black: bclocktime, white: wclocktime};

        const moveMsg = { type: "move", gameId: this.gameId, move: move, clocks: msgClocks, ply: this.ply + 1, board: b.boardName, partnerFen: b.partnerCC.fullfen };
        if (b.boardName === "a") {
            this.msgMovesAfterReconnect.lastMaybeSentMsgMoveA = moveMsg;
        } else {
            this.msgMovesAfterReconnect.lastMaybeSentMsgMoveB = moveMsg;
        }
        this.doSend(moveMsg as JSONObject);

        if (b.preaction) {
            clocks[myclock].setTime(clocktimes[moveColor] + increment);
        }
        if (this.clockOn) clocks[oppclock].start();
    }

    //
    // private abort = () => {
    //     // console.log("Abort");
    //     this.doSend({ type: "abort", gameId: this.gameId });
    // }
    //
    private draw = () => {
        // console.log("Draw");
        if (confirm(_('Are you sure you want to draw?'))) {
            this.doSend({ type: "draw", gameId: this.gameId });
            this.setDialog(_("Draw offer sent"));
        }
    }
    //
    private rejectDrawOffer = () => {
        this.doSend({ type: "reject_draw", gameId: this.gameId });
        this.clearDialog();
    }
    //
    private renderDrawOffer = () => {
        this.vdialog = patch(this.vdialog, h('div#offer-dialog', [
            h('div', { class: { reject: true }, on: { click: () => this.rejectDrawOffer() } }, h('i.icon.icon-abort.reject')),
            h('div.text', _("Your opponent offers a draw")),
            h('div', { class: { accept: true }, on: { click: () => this.draw() } }, h('i.icon.icon-check')),
        ]));
    }
    //
    private setDialog = (message: string) => {
        this.vdialog = patch(this.vdialog, h('div#offer-dialog', [
            h('div', { class: { reject: false } }),
            h('div.text', message),
            h('div', { class: { accept: false } }),
        ]));
    }
    //
    private clearDialog = () => {
        this.vdialog = patch(this.vdialog, h('div#offer-dialog', []));
    }

    //
    private resign = () => {
        // console.log("Resign");
        if (confirm(_('Are you sure you want to resign?'))) {
            this.doSend({ type: "resign", gameId: this.gameId });
        }
    }

    private notifyMsg = (msg: string) => {
        if (this.status >= 0) return;

        const opp_name = this.username === this.wplayer ? this.bplayer : this.wplayer;
        const logoUrl = `${this.home}/static/favicon/android-icon-192x192.png`;
        notify('pychess.org', {body: `${opp_name}\n${msg}`, icon: logoUrl});
    }

    private onMsgGameStart = (msg: MsgGameStart) => {
        // console.log("got gameStart msg:", msg);
        if (msg.gameId !== this.gameId) return;
        if (!this.spectator) {
            sound.genericNotify();
            if (!this.focus) this.notifyMsg('joined the game.');
        }
    }
    //
    private onMsgNewGame = (msg: MsgNewGame) => {
        window.location.assign(this.home + '/' + msg["gameId"]);
    }

    private onMsgViewRematch = (msg: MsgViewRematch) => {
        const btns_after = document.querySelector('.btn-controls.after') as HTMLElement;
        let rematch_button = h('button.newopp', { on: { click: () => window.location.assign(this.home + '/' + msg["gameId"]) } }, _("VIEW REMATCH"));
        let rematch_button_location = btns_after!.insertBefore(document.createElement('div'), btns_after!.firstChild);
        patch(rematch_button_location, rematch_button);
    }
    //
    private rematch = () => {
        this.doSend({ type: "rematch", gameId: this.gameId, handicap: this.handicap });
        this.setDialog(_("Rematch offer sent"));
    }
    //
    private rejectRematchOffer = () => {
        this.doSend({ type: "reject_rematch", gameId: this.gameId });
        this.clearDialog();
    }
    //
    private renderRematchOffer = () => {
        this.vdialog = patch(this.vdialog, h('div#offer-dialog', [
            h('div', { class: { reject: true }, on: { click: () => this.rejectRematchOffer() } }, h('i.icon.icon-abort.reject')),
            h('div.text', _("Your opponent offers a rematch")),
            h('div', { class: { accept: true }, on: { click: () => this.rematch() } }, h('i.icon.icon-check')),
        ]));
    }
    //
    private newOpponent = (home: string) => {
        this.doSend({"type": "leave", "gameId": this.gameId});
        window.location.assign(home);
    }
    //
    private analysis = (home: string) => {
        window.location.assign(home + '/' + this.gameId + '?ply=' + this.ply.toString());
    }

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

            if (this.result !== "*" && !this.spectator && !this.finishedGame)
                sound.gameEndSound(msg.result, this.mycolor); //todo:niki: debug here to see how to trick this into playing correct vicory/defeat/draw soound - i dont remember how i denote end games - 1:0 means first team wins maybe?

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

    private updateSteps = (full: boolean, steps: Step[], ply: number, latestPly: boolean) => {
        if (full) { // all steps in one message
            this.steps = [];
            const container = document.getElementById('movelist') as HTMLElement;
            patch(container, h('div#movelist'));

            steps.forEach((step) => {
                this.steps.push(step);
                });
            updateMovelist(this, true, true, false);
        } else { // single step message
            if (ply === this.steps.length) { //todo:niki:where does this if come from? is it possible the incomuing message not to be for last ply - there are similar checks above aslso - which one is redundant maybe?
                // const step = {
                //     'fen': msg.fen,
                //     'move': msg.lastMove,
                //     'check': msg.check,
                //     'turnColor': this.turnColor,
                //     'san': msg.steps[0].san,
                //     }; todo:niki:why not use step[0] and do this above? temporary doing it like this will see what will go wrong when testing
                this.steps.push(steps[0]);
                const full = false;
                const activate = !this.spectator || latestPly;
                const result = false;
                updateMovelist(this, full, activate, result);
            }
        }
    }

    private updateBoardsAndClocksSpectors = (board: GameControllerBughouse, fen: cg.FEN, fenPartner: cg.FEN, lastMove: cg.Orig[] | undefined, step: Step, clocks: Clocks, latestPly: boolean, colors: cg.Color[], status: number, check: boolean) => {
        console.log("updateBoardsAndClocksSpectors", board, fen, fenPartner, lastMove, step, clocks, latestPly, colors, status, check);

        this.clockOn = true;// Number(msg.ply) >= 2;
        if ( !this.spectator && this.clockOn ) {
            const container = document.getElementById('abort') as HTMLElement;
            if (container) patch(container, h('div'));
        }

        const msgTurnColor = step.turnColor; // whose turn it is after this move

        if (board.boardName == 'a') {
            this.clocktimes = clocks || this.clocktimes; //todo:niki:have the feeling this or is redundant. probably only initial board message doesnt have clocktimes. maybe even it has. not sure
        } else {
            this.clocktimesB = clocks || this.clocktimes;
        }

        // resetting clocks on the client that has just sent them seems like a bad idea
        const startClockAtIdx = colors[0] === msgTurnColor? 0: 1;
        const stopClockAtIdx = 1 - startClockAtIdx;

        const whiteClockAtIdx = colors[0] === 'white'? 0: 1;
        const blackClockAtIdx = 1 -whiteClockAtIdx;

        const clocks1 = board.boardName === 'a'? this.clocks: this.clocksB;
        const clocktimes = board.boardName === 'a'? this.clocktimes: this.clocktimesB;


        clocks1[stopClockAtIdx].pause(false);

        clocks1[whiteClockAtIdx].setTime(clocktimes['white']);
        clocks1[blackClockAtIdx].setTime(clocktimes['black']);

        if (this.clockOn && status < 0) { // todo:niki:not sure why this if is needed
            clocks1[startClockAtIdx].start();
        }

        //when message is for opp's move, meaning turnColor is my color - it is now my turn after this message
        if (latestPly) {
            board.chessground.set({
                fen: fen,
                turnColor: board.turnColor,
                check: check,
                lastMove: lastMove,
            });
            //todo:niki: updating model probably should be regardless of whetehre it is latestPly:
            board.fullfen = fen;
            board.partnerCC.fullfen = fenPartner;//todo:niki:setter or something maybe
            board.partnerCC.chessground.set({ fen: fenPartner});
            if (!this.focus) this.notifyMsg(`Played ${step.san}\nYour turn.`);

            // prevent sending premove/predrop when (auto)reconnecting websocked asks server to (re)sends the same board to us
            // console.log("trying to play premove....");
            if (board.premove) board.performPremove();
        }

    }

    private updateBothBoardsAndClocksInitial = (fenA: cg.FEN, fenB: cg.FEN, clocksA: Clocks, clocksB: Clocks) => {
        console.log("updateBothBoardsAndClocksInitial", fenA, fenB, clocksA, clocksB);

        const partsA = fenA.split(" ");
        const partsB = fenB.split(" ");

        this.b1.turnColor = partsA[1] === "w" ? "white" : "black";
        this.b2.turnColor = partsB[1] === "w" ? "white" : "black";

        this.b1.chessground.set({
            fen: fenA,
            turnColor: 'white',
            //  check: msg.check,
            //lastMove: lastMove,
        });
        this.b2.chessground.set({
            fen: fenB,
            turnColor: 'white',
            // check: msg.check,
            //lastMove: lastMove,
        });

        // // normally white clocks should start, except when custom fen (todo:not fully implemented yet):
        // const whiteClockAidx = this.colors[0] === this.b1.turnColor? 0: 1;
        // const whiteClockBidx = this.colorsB[0] === this.b2.turnColor? 0: 1;
        // this.clocks[whiteClockAidx].start();
        // this.clocksB[whiteClockBidx].start();

        this.clocks[0].pause(false);
        this.clocks[1].pause(false);
        this.clocksB[0].pause(false);
        this.clocksB[1].pause(false);

        this.clocktimes = clocksA;
        this.clocktimesB = clocksB;

        const whiteAClockAtIdx = this.colors[0] === 'white'? 0: 1;
        const blackAClockAtIdx = 1 -whiteAClockAtIdx;
        const whiteBClockAtIdx = this.colorsB[0] === 'white'? 0: 1;
        const blackBClockAtIdx = 1 -whiteBClockAtIdx;

        this.clocks[whiteAClockAtIdx].setTime(this.clocktimes['white']);
        this.clocks[blackAClockAtIdx].setTime(this.clocktimes['black']);
        this.clocksB[whiteBClockAtIdx].setTime(this.clocktimesB['white']);
        this.clocksB[blackBClockAtIdx].setTime(this.clocktimesB['black']);

        if (this.status < 0) {
            const clockOnTurnAidx = this.colors[0] === this.b1.turnColor ? 0 : 1;
            const clockOnTurnBidx = this.colorsB[0] === this.b2.turnColor ? 0 : 1;
            this.clocks[clockOnTurnAidx].start(this.clocktimes[this.b1.turnColor]); //todo:niki:not perfect. this is server time and initial message means no moves were made so client clock doesnt really need update. will leave it for now though, like this. but probably doesnt matter much because its first move
            this.clocksB[clockOnTurnBidx].start(this.clocktimesB[this.b2.turnColor]);
        }

    }

    private updateBothBoardsAndClocksOnFullBoardMsg = (lastStepA: Step, lastStepB: Step, clocksA: Clocks, clocksB: Clocks) => {
        console.log("updateBothBoardsAndClocksOnFullBoardMsg", lastStepA, lastStepB, clocksA, clocksB);

        // todo:niki: if undedefined it will get white, which is ok-ish, but ideally should use initial fen in case of custom start position


        if (lastStepA) {
            const partsA = lastStepA.fen.split(" ");
            this.b1.turnColor = partsA[1] === "b" ? "black" : "white";
            const lastMoveA = uci2LastMove(lastStepA.move);
            this.b1.chessground.set({
                fen: lastStepA.fen,
                turnColor: this.b1.turnColor,
                check: lastStepA.check,
                lastMove: lastMoveA,
            });

            if (this.b1.ffishBoard) {
                this.b1.ffishBoard.setFen(lastStepA.fen);
                this.b1.setDests();
            }

        }
        if (lastStepB) {
            const partsB = lastStepB.fenB!.split(" ");
            this.b2.turnColor = partsB[1] === "b" ? "black" : "white";
            const lastMoveB = uci2LastMove(lastStepB.moveB);
            this.b2.chessground.set({
                fen: lastStepB.fenB,
                turnColor: this.b2.turnColor,
                check: lastStepB.check,
                lastMove: lastMoveB,
            });

            if (this.b2.ffishBoard) {
                this.b2.ffishBoard.setFen(lastStepB.fen);
                this.b2.setDests();
            }

        }

        this.clocks[0].pause(false);
        this.clocks[1].pause(false);
        this.clocksB[0].pause(false);
        this.clocksB[1].pause(false);

        this.clocktimes = clocksA;
        this.clocktimesB = clocksB;

        const whiteAClockAtIdx = this.colors[0] === 'white'? 0: 1;
        const blackAClockAtIdx = 1 - whiteAClockAtIdx;
        const whiteBClockAtIdx = this.colorsB[0] === 'white'? 0: 1;
        const blackBClockAtIdx = 1 - whiteBClockAtIdx;


        if (this.status < 0) {
            this.clocks[whiteAClockAtIdx].setTime(this.clocktimes['white']);
            this.clocks[blackAClockAtIdx].setTime(this.clocktimes['black']);
            this.clocksB[whiteBClockAtIdx].setTime(this.clocktimesB['white']);
            this.clocksB[blackBClockAtIdx].setTime(this.clocktimesB['black']);

            const clockOnTurnAidx = this.colors[0] === this.b1.turnColor ? 0 : 1;
            const clockOnTurnBidx = this.colorsB[0] === this.b2.turnColor ? 0 : 1;
            this.clocks[clockOnTurnAidx].start(this.clocktimes[this.b1.turnColor]);
            this.clocksB[clockOnTurnBidx].start(this.clocktimesB[this.b2.turnColor]);
        } else {
            //todo:niki:not great if there were no moves on one of the boards because then it will show initial clock times but anyway
            if (lastStepA) {
                this.clocks[whiteAClockAtIdx].setTime(lastStepA.clocks['white']);
                this.clocks[blackAClockAtIdx].setTime(lastStepA.clocks['black']);
            }
            if (lastStepB) {
                this.clocksB[whiteBClockAtIdx].setTime(lastStepB.clocks['white']);
                this.clocksB[blackBClockAtIdx].setTime(lastStepB.clocks['black']);
            }
        }
    }

    private updateSingleBoardAndClocks = (board: GameControllerBughouse, fen: cg.FEN, fenPartner: cg.FEN, lastMove: cg.Orig[] | undefined, step: Step,
                                          msgClocks: Clocks, latestPly: boolean, colors: cg.Color[], status: number, check: boolean) => {
        console.log("updateSingleBoardAndClocks", board, fen, fenPartner, lastMove, step, msgClocks, latestPly, colors, status, check);

        board.turnColor = board.turnColor === 'white' ? 'black' : 'white';

        if (board.ffishBoard) {
            board.ffishBoard.setFen(fen);
            board.setDests();
        }

        //hiding abort button - todo:niki:we dont realy have abort button (for now)
        this.clockOn = true;// Number(msg.ply) >= 2;
        if ( !this.spectator && this.clockOn ) {
            const container = document.getElementById('abort') as HTMLElement;
            if (container) patch(container, h('div'));
        }

        //todo:niki:sound not implemented for now
        // const step = this.steps[this.steps.length - 1];
        // const capture = (lastMove.length > 0) && ((this.chessground.state.pieces.get(lastMove[1]) && step.san?.slice(0, 2) !== 'O-') || (step.san?.slice(1, 2) === 'x'));
        //
        // if (lastMove.length > 0 && (this.turnColor === this.mycolor || this.spectator)) {
        //     if (!this.finishedGame) sound.moveSound(this.variant, capture);
        // }
        // if (!this.spectator && msg.check && !this.finishedGame) {
        //     sound.check();
        // }

        const msgTurnColor = step.turnColor; // whose turn it is after this move
        const msgMoveColor = msgTurnColor === 'white'? 'black': 'white'; // which color made the move
        const myMove = this.myColor.get(board.boardName) === msgMoveColor; // the received move was made by me
        if (board.boardName == 'a') {
            this.clocktimes = msgClocks || this.clocktimes; //todo:niki:have the feeling this or is redundant. probably only initial board message doesnt have clocktimes. maybe even it has. not sure
        } else {
            this.clocktimesB = msgClocks || this.clocktimesB;
        }

        const capture = !!lastMove && ((board.chessground.state.boardState.pieces.get(lastMove[1] as cg.Key) && step.san?.slice(0, 2) !== 'O-') || (step.san?.slice(1, 2) === 'x'));
        if (lastMove && (!myMove || this.spectator)) {
            if (!this.finishedGame) sound.moveSound(VARIANTS['bughouse'], capture);
        }
        if (!this.spectator && check && !this.finishedGame) {
            sound.check();
        }

        if (!myMove) {
            // resetting clocks on the client that has just sent them seems like a bad idea
            const startClockAtIdx = colors[0] === msgTurnColor? 0: 1;
            const stopClockAtIdx = 1 - startClockAtIdx;

            const whiteClockAtIdx = colors[0] === 'white'? 0: 1;
            const blackClockAtIdx = 1 -whiteClockAtIdx;

            const clocks = board.boardName === 'a'? this.clocks: this.clocksB;
            const clocktimes = board.boardName === 'a'? this.clocktimes: this.clocktimesB;


            clocks[stopClockAtIdx].pause(false);

            clocks[whiteClockAtIdx].setTime(clocktimes['white']);
            clocks[blackClockAtIdx].setTime(clocktimes['black']);

            if (this.clockOn && status < 0) { // todo:niki:not sure why this if is needed
                clocks[startClockAtIdx].start();
            }

            //when message is for opp's move, meaning turnColor is my color - it is now my turn after this message
            if (latestPly) {
                board.chessground.set({
                    fen: fen,
                    turnColor: board.turnColor,
                    check: check,
                    lastMove: lastMove,
                });
                //todo:niki: updating model probably should be regardless of whetehre it is latestPly:
                board.fullfen = fen;
                board.partnerCC.fullfen = fenPartner;//todo:niki:setter or something maybe
                board.partnerCC.chessground.set({ fen: fenPartner});
                board.partnerCC.ffishBoard.setFen(board.partnerCC.fullfen);
                board.partnerCC.setDests();
                if (!this.focus) this.notifyMsg(`Played ${step.san}\nYour turn.`);

                // prevent sending premove/predrop when (auto)reconnecting websocked asks server to (re)sends the same board to us
                // console.log("trying to play premove....");
                if (board.premove) board.performPremove();
            }
        } else {
            //when message is about the move i just made
            board.chessground.set({
                // giving fen here will place castling rooks to their destination in chess960 variants
                fen: fen,
                turnColor: board.turnColor,
                check: check,
            });
            board.fullfen = fen;
            board.partnerCC.fullfen = fenPartner;
            board.partnerCC.chessground.set({ fen: fenPartner});
        }

    }

    private onMsgBoard = (msg: MsgBoard) => {
        console.log(msg);
        if (msg.gameId !== this.gameId) return;
        // if (msg.ply <= this.ply) return;// ideally not needed but putting it for now to handle a serverside bug that sends board messages twice sometimes

        // console.log("got board msg:", msg);
        let latestPly;
        const full = msg.steps.length > 1;
        const isInitialBoardMessage = !(msg.steps[msg.steps.length-1].boardName);//todo:niki:not sure why step[0] is still being sent with every move, but when initial board message, that is always the only element (respectively also the last)
        if (this.spectator) {
            // Fix https://github.com/gbtami/pychess-variants/issues/687
            latestPly = (this.ply === -1 || msg.ply === this.ply + 1);
        } else {
            latestPly = (this.ply === -1 || msg.ply === this.ply + 1 || (full && msg.ply > this.ply + 1));
            // when receiving a board msg with full list of moves (aka steps) after reconnecting
            // its ply might be ahead with 2 ply - our move that failed to get confirmed
            // because of disconnect and then also opp's reply to it, that we didn't
            // receive while offline. Not sure if it could be ahead with more than 2 ply
            // todo:this if for spectators probably not needed if that check for full is added -
            //  fix that in other controller as well
        }
        if (latestPly) this.ply = msg.ply;

        this.result = msg.result;
        this.status = msg.status;

        this.updateSteps(full, msg.steps, msg.ply, latestPly);

        this.checkStatus(msg);

        //
        const fens = msg.fen.split(" | ");
        const fenA = fens[0];
        const fenB = fens[1];

        const boardName = msg.steps[msg.steps.length - 1].boardName as 'a' | 'b';//todo:niki:change this to step[0] if/when that board message is fixed to have just one element in steps and stop always sending that redundnat initial dummy step (if it is indeed redundant)
        //todo:niki:update to above's todo, actually it sometimes sends it with 2 elements, sometimes just with one - gotta check what is wrong with python code and how it works in other variants. for now always getting the last element should be robust in all cases
        const board = boardName === 'a' ? this.b1 : this.b2;
        const colors = boardName === 'a' ? this.colors : this.colorsB;

        const fen = boardName == 'a' ? fenA : fenB;
        const fenPartner = boardName == 'a' ? fenB : fenA;

        const check = boardName == 'a' ? msg.check : msg.checkB!;
        const clocks = boardName == 'a' ? msg.clocks : msg.clocksB!;
        const lastMove = uci2LastMove(msg.lastMove);

        if (this.spectator) {
            this.updateBoardsAndClocksSpectors(board, fen, fenPartner, lastMove, msg.steps[0], msg.clocks!, latestPly, colors, msg.status, check);//todo:niki unclear what is different that when playing, but should have full mode as well

        } else {
            if (isInitialBoardMessage) { // from constructor
                this.updateBothBoardsAndClocksInitial(fenA, fenB, msg.clocks!, msg.clocksB!);// todo:niki: when no moves were made and we refresh, logic here doesnt differentiate it is not initial anymore, but full, and clocks have started so sending clock times again and inside duplicating the logic for clock from full mode as well - maybe think about reusing that logic or differentiating better this case as full
            } else if (full) { // manual refresh or reconnect after lost ws connection
                const lastStepA = msg.steps[msg.steps.findLastIndex(s => s.boardName === "a")];
                const lastStepB = msg.steps[msg.steps.findLastIndex(s => s.boardName === "b")];
                this.updateBothBoardsAndClocksOnFullBoardMsg(lastStepA, lastStepB, msg.clocks!, msg.clocksB!);
            } else { // usual single ply board messages sent on each move
                this.updateSingleBoardAndClocks(board, fen, fenPartner, lastMove, msg.steps[0], clocks!, latestPly, colors, msg.status, check);
            }
        }
    }

    doSend = (message: JSONObject) => {
        console.log("---> doSend():", message);
        this.sock.send(JSON.stringify(message));
    }


    goPly = (ply: number) => {
        console.log(ply);

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
            capture = (board.chessground.state.boardState.pieces.get(move[1] as cg.Key) !== undefined && step.san?.slice(0, 2) !== 'O-') || (step.san?.slice(1, 2) === 'x');
        }

        board.chessground.set({
            fen: fen,
            turnColor: step.turnColor,
            check: step.check,
            lastMove: move,
        });

        if (this.status >= 0) {
            //if it is a game that ended, then when scrolling it makes sense to show clocks when the move was made
            //todo:niki:maybe i should record the clocks on both boards on every move otherwise a bit misleading

            const whiteAClockAtIdx = this.colors[0] === 'white'? 0: 1;
            const blackAClockAtIdx = 1 -whiteAClockAtIdx;
            const whiteBClockAtIdx = this.colorsB[0] === 'white'? 0: 1;
            const blackBClockAtIdx = 1 -whiteBClockAtIdx;

            const lastStepA = this.steps[this.steps.findLastIndex((s, i) => s.boardName === "a" && i <= ply)];
            const lastStepB = this.steps[this.steps.findLastIndex((s, i) => s.boardName === "b" && i <= ply)];
            if (lastStepA) {
                this.clocks[whiteAClockAtIdx].setTime(lastStepA.clocks['white']);
                this.clocks[blackAClockAtIdx].setTime(lastStepA.clocks['black']);
            } else {
                this.clocks[whiteAClockAtIdx].setTime(this.base * 60 * 1000);
                this.clocks[blackAClockAtIdx].setTime(this.base * 60 * 1000);
            }
            if (lastStepB) {
                this.clocksB[whiteBClockAtIdx].setTime(lastStepB.clocks['white']);
                this.clocksB[blackBClockAtIdx].setTime(lastStepB.clocks['black']);
            } else {
                this.clocksB[whiteBClockAtIdx].setTime(this.base * 60 * 1000);
                this.clocksB[blackBClockAtIdx].setTime(this.base * 60 * 1000);
            }
        }

        board.partnerCC.chessground.set({fen: fenPartner, lastMove: movePartner});

        board.fullfen = step.fen;
        board.partnerCC.fullfen = fenPartner!;

        if (ply === this.ply + 1) { // no sound if we are scrolling backwards
            sound.moveSound(board.variant, capture);
        }
        this.ply = ply;

        board.turnColor = step.turnColor;

        if (board.ffishBoard !== null) {
            board.ffishBoard.setFen(board.fullfen);
            // board.dests = board.parent.setDests(board);//todo:niki:maybe do this before chessground set above.
            board.setDests();
        }
    }

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
        if (msg.username === this.players[0]) {
            const container = document.getElementById('player0a') as HTMLElement;
            patch(container, h('i-side.online#player0a', {class: {"icon": true, "icon-online": false, "icon-offline": true}}));
        } else if (msg.username === this.players[1]) {
            const container = document.getElementById('player1a') as HTMLElement;
            patch(container, h('i-side.online#player1a', {class: {"icon": true, "icon-online": false, "icon-offline": true}}));
        }
        if (msg.username === this.playersB[0]) {
            const container = document.getElementById('player0b') as HTMLElement;
            patch(container, h('i-side.online#player0b', {class: {"icon": true, "icon-online": false, "icon-offline": true}}));
        } else if (msg.username === this.playersB[1]) {
            const container = document.getElementById('player1b') as HTMLElement;
            patch(container, h('i-side.online#player1b', {class: {"icon": true, "icon-online": false, "icon-offline": true}}));
        }
    }

    private onMsgDrawOffer = (msg: MsgDrawOffer) => {
        chatMessage("", msg.message, "bugroundchat");
        if (!this.spectator && msg.username !== this.username) this.renderDrawOffer();
    }

    private onMsgDrawRejected = (msg: MsgDrawRejected) => {
        chatMessage("", msg.message, "bugroundchat");
        // this.clearDialog();
    }

    private onMsgRematchOffer = (msg: MsgRematchOffer) => {
        chatMessage("", msg.message, "bugroundchat");
        if (!this.spectator && msg.username !== this.username) this.renderRematchOffer();
    }

    private onMsgRematchRejected = (msg: MsgRematchRejected) => {
        chatMessage("", msg.message, "bugroundchat");
        // this.clearDialog();
    }

    private onMsgFullChat = (msg: MsgFullChat) => {
        // To prevent multiplication of messages we have to remove old messages div first
        patch(document.getElementById('messages') as HTMLElement, h('div#messages-clear'));
        // then create a new one
        patch(document.getElementById('messages-clear') as HTMLElement, h('div#messages'));
        msg.lines.forEach((line) => {
            if ((this.spectator && line.room === 'spectator') || (!this.spectator && line.room !== 'spectator') || line.user.length === 0) {
                chatMessage(line.user, line.message, "bugroundchat", line.time);
            }
        });
    }

    private onMsgChat = (msg: MsgChat) => {
        if (this.spectator /*spectators always see everything*/ || (!this.spectator && msg.room !== 'spectator') || msg.user.length === 0) {
            chatMessage(msg.user, msg.message, "bugroundchat", msg.time);
        }
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
            case "bugroundchat":
                this.onMsgChat(msg);
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
                this.onMsgNewGame(msg);
                break;
            case "view_rematch":
                this.onMsgViewRematch(msg);
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

function swap(nodeA: HTMLElement, nodeB: HTMLElement) {
        const parentA = nodeA.parentNode;
        const siblingA = nodeA.nextSibling === nodeB ? nodeA : nodeA.nextSibling;

        // Move `nodeA` to before the `nodeB`
        nodeB.parentNode!.insertBefore(nodeA, nodeB);

        // Move `nodeB` to before the sibling of `nodeA`
        parentA!.insertBefore(nodeB, siblingA);
};
