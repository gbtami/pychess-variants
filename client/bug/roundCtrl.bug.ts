import { h, VNode } from 'snabbdom';
import * as Mousetrap  from 'mousetrap';
import * as cg from 'chessgroundx/types';

import { _ } from '../i18n';
import { patch } from '../document';
import { Clock } from '../clock';
import { ChatController, chatMessage, chatView } from '../chat';
import { createMovelistButtons, updateMovelist, updateResult, selectMove } from './movelist.bug';
import {
    Clocks,
    MsgBoard,
    MsgGameEnd,
    MsgMove,
    MsgMovesAfterReconnect,
    MsgNewGame,
    MsgUserConnected,
    Step, StepChat
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
import {BoardName, BugBoardName, JSONObject, PyChessModel} from "../types";
import { GameControllerBughouse } from "./gameCtrl.bug";
import { BLACK, getTurnColor, uci2LastMove, WHITE } from "../chess";
import { sound, soundThemeSettings } from "../sound";
import { player } from "../player";
import { WebsocketHeartbeatJs } from '../socket/socket';
import { notify } from "../notification";
import { Variant, VARIANTS } from "../variants";
import { createWebsocket } from "@/socket/webSocketUtils";
import AnalysisControllerBughouse from "@/bug/analysisCtrl.bug";
import { boardSettings } from "@/boardSettings";
import { ChessgroundController } from "@/cgCtrl";
import {playerInfoData} from "@/bug/gameInfo.bug";
import {chatMessageBug, resetChat} from "@/bug/chat.bug";

export class RoundControllerBughouse implements ChatController {
    sock: WebsocketHeartbeatJs;

    b1: GameControllerBughouse;
    b2: GameControllerBughouse;

    username: string;
    gameId: string;
    readonly anon: boolean;

    steps: Step[];
    ply: number;
    plyA: number = 0;
    plyB: number = 0;
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
    // firstmovetime: number;
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
    variant: Variant;

    spectator: boolean;

    gameControls: VNode; // todo: usually inherited from gameCtrl - think about some reusable solution (DRY)
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

    teamFirst: [[string, string, string], [string, string, string]]
    teamSecond: [[string, string, string], [string, string, string]]

    constructor(el1: HTMLElement,el1Pocket1: HTMLElement,el1Pocket2: HTMLElement,el2: HTMLElement,el2Pocket1: HTMLElement,el2Pocket2: HTMLElement, model: PyChessModel) {

        this.home = model.home;

        this.base = Number(model["base"]);
        this.inc = Number(model["inc"]);
        this.status = Number(model["status"]);

        this.gameId = model["gameId"] as string;
        this.username = model["username"];
        this.anon = model.anon === 'True';

        this.variant = VARIANTS[model.variant];

        this.teamFirst = [playerInfoData(model, "w", "a"), playerInfoData(model, "b", "b")]
        this.teamSecond = [playerInfoData(model, "b", "a"), playerInfoData(model, "w", "b")]

        this.focus = !document.hidden;
        document.addEventListener("visibilitychange", () => {this.focus = !document.hidden});
        window.addEventListener('blur', () => {this.focus = false});
        window.addEventListener('focus', () => {this.focus = true});
//
        const onOpen = () => {
            try {
                console.log("resending unsent move messages ", this.msgMovesAfterReconnect);
                if (this.msgMovesAfterReconnect) {
                    this.doSend(this.msgMovesAfterReconnect);
                }
            } catch (e) {
                console.log("could not even REsend unsent messages ", this.msgMovesAfterReconnect)
            }
            this.clocks[0].connecting = false;
            this.clocks[1].connecting = false;
            this.clocksB[0].connecting = false;
            this.clocksB[1].connecting = false;
        };

        const onReconnect = () => {
            const container = document.getElementById('player1a') as HTMLElement;
            patch(container, h('i-side.online#player1a', {class: {"icon": true, "icon-online": false, "icon-offline": true}}));
        };

        const onClose = () => {
            this.clocks[0].connecting = true;
            this.clocks[1].connecting = true;
            this.clocksB[0].connecting = true;
            this.clocksB[1].connecting = true;
        };

//
        this.finishedGame = this.status >= 0;
        this.tv = model["tv"];
        this.profileid = model["profileid"];
        this.level = model["level"];

        this.settings = true;
        this.autoPromote = localStorage.autoPromote === undefined ? false : localStorage.autoPromote === "true";

        this.clockOn = true;//(Number(parts[parts.length - 1]) >= 2);

        this.steps = [];
        // this.ply = isNaN(model["ply"]) ? 0 : model["ply"];

        // initialize users
        this.wplayer = model.wplayer;
        this.bplayer = model.bplayer;

        this.wtitle = model.wtitle;
        this.btitle = model.btitle;
        this.wrating = model.wrating;
        this.brating = model.brating;

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
        this.vplayerA0 = patch(player0a, player('player0a', titles.get(this.players[0])!, this.players[0], ratings.get(this.players[0])!, this.level));
        this.vplayerA1 = patch(player1a, player('player1a', titles.get(this.players[1])!, this.players[1], ratings.get(this.players[1])!, this.level));

        const player0b = document.getElementById('rplayer0b') as HTMLElement;
        const player1b = document.getElementById('rplayer1b') as HTMLElement;
        this.vplayerB0 = patch(player0b, player('player0b', titles.get(this.playersB[0])!, this.playersB[0], ratings.get(this.playersB[0])!, this.level));
        this.vplayerB1 = patch(player1b, player('player1b', titles.get(this.playersB[1])!, this.playersB[1], ratings.get(this.playersB[1])!, this.level));

        this.clocktimes = [ this.base * 1000 * 60, this.base * 1000 * 60 ]
        this.clocktimesB = [ this.base * 1000 * 60, this.base * 1000 * 60 ]

        // initialize clocks
        // this.clocktimes = {};
        const c0a = new Clock(this.base, this.inc, 0, document.getElementById('clock0a') as HTMLElement, 'clock0a', false);
        const c1a = new Clock(this.base, this.inc, 0, document.getElementById('clock1a') as HTMLElement, 'clock1a', false);
        const c0b = new Clock(this.base, this.inc, 0, document.getElementById('clock0b') as HTMLElement, 'clock0b', false);
        const c1b = new Clock(this.base, this.inc, 0, document.getElementById('clock1b') as HTMLElement, 'clock1b', false);
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

        this.b1 = new GameControllerBughouse(el1, el1Pocket1, el1Pocket2, 'a', model);
        this.b2 = new GameControllerBughouse(el2, el2Pocket1, el2Pocket2, 'b', model);
        this.b1.partnerCC = this.b2;
        this.b2.partnerCC = this.b1;
        this.b1.parent = this;
        this.b2.parent = this;

        ///////
        // todo: redundant setting turnColor here. It will be overwritten a moment later in onMsgBoard which is
        //       important and more correct in case of custom fen with black to move
        this.b1.chessground.set({
            orientation: this.myColor.get('a') === 'white' || this.partnerColor.get('a') === 'white' || this.spectator? 'white': 'black',
            turnColor: 'white',
            movable: {
                color: this.myColor.get('a') === 'white'? 'white': this.myColor.get('a') === 'black'? 'black': undefined
            },
            autoCastle: true,
        });
        this.b2.chessground.set({
            orientation: this.myColor.get('b') === 'white' || this.partnerColor.get('b') === 'white'? 'white': 'black',
            turnColor: 'white',
            movable: {
                color: this.myColor.get('b') === 'white'? 'white': this.myColor.get('b') === 'black'? 'black': undefined
            },
            autoCastle: true,
        });

        ////////////
        createMovelistButtons(this);
        this.vmovelist = document.getElementById('movelist') as HTMLElement;

        this.vdialog = patch(document.getElementById('offer-dialog')!, h('div#offer-dialog', ""));

        // todo: if spectator do not render buttons, also good to render all player's messages for specatotors to see
        //       all communication as it happens. However not sure how this can be combined with usual spectators chat
        //       without becoming a bit messy, but maybe it is ok.
        patch(document.getElementById('bugroundchat') as HTMLElement, chatView(this, "bugroundchat"));


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
            gameId: this.gameId,
            movesQueued: [],
        }

        initBoardSettings(this.b1, this.b2, this.variant);

        // last so when it receive initial messages on connect all dom is ready to be updated
        this.sock = createWebsocket('wsr/' + this.gameId, onOpen, onReconnect, onClose, (e: MessageEvent) => this.onMessage(e));

        Mousetrap.bind('left', () => selectMove(this, this.ply - 1, this.plyVari));
        Mousetrap.bind('right', () => selectMove(this, this.ply + 1, this.plyVari));
        Mousetrap.bind('up', () => selectMove(this, 0));
        Mousetrap.bind('down', () => selectMove(this, this.steps.length - 1));
        Mousetrap.bind('f', () => this.flipBoards());
        Mousetrap.bind('?', () => this.helpDialog());

        soundThemeSettings.buildBugChatSounds();
    }

    helpDialog() {
        console.log('HELP!');
    }

    flipBoards = (): void => {
        let infoWrap0 = document.getElementsByClassName('info-wrap0')[0] as HTMLElement;
        let infoWrap0bug = document.getElementsByClassName('info-wrap0 bug')[0] as HTMLElement;
        let infoWrap1 = document.getElementsByClassName('info-wrap1')[0] as HTMLElement;
        let infoWrap1bug = document.getElementsByClassName('info-wrap1 bug')[0] as HTMLElement;

        let a = infoWrap0!.style.gridArea || "clock-top";
        infoWrap0!.style.gridArea = infoWrap1!.style.gridArea || "clock-bot";
        infoWrap1!.style.gridArea = a;
        a = infoWrap0bug!.style.gridArea || "clockB-top";
        infoWrap0bug!.style.gridArea = infoWrap1bug!.style.gridArea || "clockB-bot";
        infoWrap1bug!.style.gridArea = a;

        this.b1.toggleOrientation();
        this.b2.toggleOrientation();
    }

    switchBoards = (): void => {
        switchBoards(this);

        let infoWrap0 = document.getElementsByClassName('info-wrap0')[0] as HTMLElement;
        let infoWrap0bug = document.getElementsByClassName('info-wrap0 bug')[0] as HTMLElement;
        let infoWrap1 = document.getElementsByClassName('info-wrap1')[0] as HTMLElement;
        let infoWrap1bug = document.getElementsByClassName('info-wrap1 bug')[0] as HTMLElement;

        let a = infoWrap0!.style.gridArea || "clock-top";
        infoWrap0!.style.gridArea = infoWrap0bug!.style.gridArea || "clockB-top";
        infoWrap0bug!.style.gridArea = a;
        a = infoWrap1!.style.gridArea || "clock-bot";
        infoWrap1!.style.gridArea = infoWrap1bug!.style.gridArea || "clockB-bot";
        infoWrap1bug!.style.gridArea = a;
    }

    getClock = (boardName: string, color: cg.Color) => {
        const colors = boardName === 'a'? this.colors: this.colorsB;
        const clocks = boardName === 'a'? this.clocks: this.clocksB;
        const bclock = colors[0] === "black"? 0: 1;
        const wclock = 1 - bclock

        return clocks[color === "black"? bclock: wclock];
    }

    sendMove = (b: GameControllerBughouse, move: string) => {
        console.log(b, move);
        this.clearDialog();

        //moveColor is "my color" on that board
        const moveColor = this.myColor.get(b.boardName as BugBoardName) === "black"? "black" : "white";

        const oppclock = b.chessground.state.orientation === moveColor? 0: 1; // only makes sense when board is flipped which not supported in gameplay yet and itself only makes sense in spectators mode todo: also switching boards to be implemented
        const myclock = 1 - oppclock;

        const clocksInQuestion = (b.boardName === 'a'? this.clocks: this.clocksB);
        const clocktimesInQuestion = (b.boardName === 'a'? this.clocktimes: this.clocktimesB);

        // const movetime = (clocksInQuestion[myclock].running) ? Date.now() - clocksInQuestion[myclock].startTime : 0;
        // pause() will ALWAYS add increment, even on first move, because (for now) we dont have aborting timeout
        clocksInQuestion[myclock].pause(true);
        // console.log("sendMove(orig, dest, prom)", orig, dest, promo);

        // console.log("sendMove(move)", move);


        const increment = (this.inc > 0 /*&& this.ply >= 2*/) ? this.inc * 1000 : 0;
        const bclocktime = (moveColor === "black" && b.preaction) ? this.clocktimes[BLACK] + increment: this.getClock("a", "black").duration;
        const wclocktime = (moveColor === "white" && b.preaction) ? this.clocktimes[WHITE] + increment: this.getClock("a", "white").duration;
        const bclocktimeB = (moveColor === "black" && b.preaction) ? this.clocktimesB[BLACK] + increment: this.getClock("b", "black").duration;
        const wclocktimeB = (moveColor === "white" && b.preaction) ? this.clocktimesB[WHITE] + increment: this.getClock("b", "white").duration;

        // const movetime = b.boardName === "a"? (b.preaction) ? 0 : movetime: -1;
        // const movetimeB = b.boardName === "b"? (b.preaction) ? 0 : movetime: -1;

        const msgClocks = [ wclocktime, bclocktime ];
        const msgClocksB = [ wclocktimeB, bclocktimeB  ];

        const moveMsg = { type: "move",
                          gameId: this.gameId,
                          move: move,
                          clocks: msgClocks,
                          clocksB: msgClocksB,
                          ply: this.ply + 1,
                          board: b.boardName,
        } as MsgMove;

        this.updateLastMovesRecorded(moveMsg);

        this.doSend(moveMsg as JSONObject);

        if (b.preaction) {
            clocksInQuestion[myclock].setTime(clocktimesInQuestion[moveColor === 'white'? WHITE: BLACK] + increment);
        }
        if (this.clockOn) clocksInQuestion[oppclock].start();
    }

    private updateLastMovesRecorded = (moveMsg: MsgMove) => {
        // TODO:NIKI: what happens if this movesQueue get lost because user refreshed, while disconnected, which is
        //            very likely for a user to do, trying to troubleshoot. Maybe we keep this in localStorage?
        // movesQueued[0] is always processed first by server, then movesQueued[1] if any (only possible in simul mode)

        if (this.msgMovesAfterReconnect.movesQueued.length == 0) {
            // this case only ever entered once, when first move was made.
            this.msgMovesAfterReconnect.movesQueued[0] = moveMsg;
        } else if (this.msgMovesAfterReconnect.movesQueued.length == 1) {
            if (this.msgMovesAfterReconnect.movesQueued[0].board === moveMsg.board) {
                // in non-simul mode, this is the only case that is relevant after the first move
                // length always stays 1 after that and board is always the same
                // in simul mode, this case is only entered after 1st move and until a move is made on the other board
                // than the one the first move was made on. From then on length is always 2
                this.msgMovesAfterReconnect.movesQueued[0] = moveMsg;
            } else {
                // this case only ever entered once, when in simul mode, the first time the player moves on a
                // different board than the one on which their first move was made. From then on length is always 2
                this.msgMovesAfterReconnect.movesQueued[1] = moveMsg;
            }
        } else if (this.msgMovesAfterReconnect.movesQueued.length == 2) {
            // only relevant for simul mode
            if (this.msgMovesAfterReconnect.movesQueued[1].board !== moveMsg.board) {
                // new move is on a board, different than the previous move.
                // Previous moves to 0 to be processed first in case of resent, the new one to 1, to be processed second
                this.msgMovesAfterReconnect.movesQueued[0] = this.msgMovesAfterReconnect.movesQueued[1];
                this.msgMovesAfterReconnect.movesQueued[1] = moveMsg;
            } else {
                // new move is on the same board as the previous move.
                // We keep the older move from the other board at [0] to be processed first in case of resend
                // although so board order remains the same and just this board's move gets replaced
                // todo: in this case we dont need to keep the older move - 2 conseq moves from the same board means
                //       we had connection in the time between those 2 moves, otherwise we cant make them
                this.msgMovesAfterReconnect.movesQueued[1] = moveMsg;
            }
        } else {
            // not possible
        }
    }

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
            h('div.dcontrols', [
                h('div', { class: { reject: true }, on: { click: () => this.rejectDrawOffer() } }, h('i.icon.icon-abort.reject')),
                h('div.text', _("Your opponent offers a draw")),
                h('div', { class: { accept: true }, on: { click: () => this.draw() } }, h('i.icon.icon-check')),
            ])
        ]));
    }
    //
    private setDialog = (message: string) => {
        this.vdialog = patch(this.vdialog, h('div#offer-dialog', [
            h('div.dcontrols', [
                h('div', { class: { reject: false } }),
                h('div.text', message),
                h('div', { class: { accept: false } }),
            ])
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
            h('div.dcontrols', [
                h('div', { class: { reject: true }, on: { click: () => this.rejectRematchOffer() } }, h('i.icon.icon-abort.reject')),
                h('div.text', _("Your opponent offers a rematch")),
                h('div', { class: { accept: true }, on: { click: () => this.rematch() } }, h('i.icon.icon-check')),
            ])
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

    private gameOver = () => {
        this.gameControls = patch(this.gameControls, h('div'));
        let buttons: VNode[] = [];
        if (!this.spectator) {
            buttons.push(h('button.rematch', { on: { click: () => this.rematch() } }, _("REMATCH")));
            buttons.push(h('button.newopp', { on: { click: () => this.newOpponent(this.home) } }, _("NEW OPPONENT")));
        }
        buttons.push(h('button.analysis', { on: { click: () => this.analysis(this.home) } }, _("ANALYSIS BOARD")));
        patch(this.gameControls, h('div.btn-controls.after', buttons));
    }

    private whichTeamAmI = () : '1' | '2' => {
        return this.myColor.get('a') === 'white' || this.myColor.get('b') === 'black'? '1' : '2';
    }

    private checkStatus = (msg: MsgBoard | MsgGameEnd) => {
        console.log(msg);
        if (msg.gameId !== this.gameId) return;
        if (msg.status >= 0) { // game over
            this.status = msg.status;
            this.result = msg.result;
            this.clocks[0].pause(false);
            this.clocks[1].pause(false);
            this.clocksB[0].pause(false);
            this.clocksB[1].pause(false);
            // this.dests = new Map();

            if (this.result !== "*" && !this.spectator && !this.finishedGame) {
                sound.gameEndSoundBughouse(msg.result, this.whichTeamAmI());
            }
            selectMove(this, this.steps.length - 1); // show final position (also important to disable cg's movable)
            updateResult(this);
            this.gameOver();


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
        console.log(msg); // todo: tv for bug not supported
    }

    private updateSteps = (full: boolean, steps: Step[], ply: number, latestPly: boolean) => {
        if (full) { // all steps in one message
            this.steps = [];
            this.plyA = 0;
            this.plyB = 0;
            resetChat();
            const container = document.getElementById('movelist') as HTMLElement;
            patch(container, h('div#movelist'));

            steps.forEach((step, idx) => {
                if (idx > 0) {
                    //skip first dummy element
                    if (step.boardName === "a") {
                        this.plyA++;
                    } else {
                        this.plyB++;
                    }
                } else {
                    chatMessage("", "Messages visible to all 4 players for the first 4 moves", "bugroundchat", undefined, undefined, this);
                }
                step.plyA = this.plyA;
                step.plyB = this.plyB;
                this.steps.push(step);
                if (idx === 4) {
                    chatMessage("", "Chat visible only to your partner", "bugroundchat", undefined, idx, this);
                }
                if (step.chat) {
                    step.chat.forEach((c) => {
                        // Check if status < 0 and filter only partners messages
                        const myTeam = (this.whichTeamAmI() === '1') ? this.teamFirst : this.teamSecond;
                        if (this.status < 0) {
                            if (c.username === myTeam[0][0] || c.username === myTeam[1][0]) {
                                chatMessageBug(idx, this, c);
                            }
                        } else {
                            chatMessageBug(idx, this, c);
                        }
                    });
                }
                if (idx === steps.length - 1 && this.status > 0) {
                    chatMessage("", "Game over. All messages visible to all.", "bugroundchat", undefined, this.steps.length, this);
                }
                });
            updateMovelist(this, true, true, false);
        } else { // single step message
            if (ply === this.steps.length) {
                if (ply > 0) {
                    //skip first dummy element
                    if (steps[0].boardName === "a") {
                        this.plyA++;
                    } else {
                        this.plyB++;
                    }
                } else {
                    chatMessage("", "Messages visible to all 4 players for the first 4 moves", "bugroundchat", undefined, undefined, this);
                }
                steps[0].plyA = this.plyA;
                steps[0].plyB = this.plyB;
                this.steps.push(steps[0]);
                const full = false;
                const activate = !this.spectator || latestPly;
                const result = false;
                updateMovelist(this, full, activate, result);
                if (this.steps.length === 5) {
                    chatMessage("", "Chat visible only to your partner", "bugroundchat", undefined, ply, this);
                }
            }
        }
    }

    private updateBoardsAndClocksSpectors = (board: GameControllerBughouse, fen: cg.FEN, fenPartner: cg.FEN, lastStepA: Step, lastStepB: Step, msgClocks: Clocks, latestPly: boolean, colors: cg.Color[], status: number, check: boolean) => {
        console.log("updateBoardsAndClocksSpectors", board, fen, fenPartner, lastStepA, lastStepB, msgClocks, latestPly, colors, status, check);

        this.clockOn = true;// Number(msg.ply) >= 2;
        if ( !this.spectator && this.clockOn ) {
            const container = document.getElementById('abort') as HTMLElement;
            if (container) patch(container, h('div'));
        }
        const step = board.boardName === 'a'? lastStepA: lastStepB;
        const stepPartner = board.boardName === 'b'? lastStepA: lastStepB;
        const msgTurnColor = getTurnColor(fen);//step.turnColor; // whose turn it is after this move

        // todo: same clock logic also in updateSingleBoardAndClocks - move to reusable method.
        // important we update only the board where the single move happened, the other clock values do not include the
        // time passed since last move on that board, but contain what is last recorded on the server for that board,
        // while the clock values for this move contain what the user making the moves has in their browser, which we
        // consider most accurate

        this.updateClocks(board.boardName, msgTurnColor, msgClocks);

        //when message is for opp's move, meaning turnColor is my color - it is now my turn after this message
        if (latestPly) {
            const move = step == undefined? undefined: board.boardName == "a"? step.move: step.moveB;
            const lastMove = uci2LastMove(move);
            let capture = false;
            if (move) {
                // const capture = !!lastMove && ((board.chessground.state.boardState.pieces.get(lastMove[1] as cg.Key) && step.san?.slice(0, 2) !== 'O-') || (step.san?.slice(1, 2) === 'x'));
                capture = board.ffishBoard.isCapture(move);
            }
            if (lastMove) {
                if (!this.finishedGame) sound.moveSound(this.variant, capture);
            }
            if (check && !this.finishedGame) {
                sound.check();
            }

            board.setState(fen, msgTurnColor, lastMove);
            board.renderState();

            // because pocket might have changed. todo: condition it on if(capture) maybe
            const movePartner = stepPartner == undefined? undefined: board.partnerCC.boardName == "a"? stepPartner.move: stepPartner.moveB;
            board.partnerCC.setState(fenPartner, board.partnerCC.turnColor, uci2LastMove(movePartner));
            board.partnerCC.renderState();
        }

    }

    private updateBothBoardsAndClocksOnFullBoardMsg = (lastStepA: Step, lastStepB: Step, fenA: cg.FEN, fenB: cg.FEN, clocksA: Clocks, clocksB: Clocks) => {
        console.log("updateBothBoardsAndClocksOnFullBoardMsg", lastStepA, lastStepB, clocksA, clocksB);

        this.b1.setState(fenA, getTurnColor(fenA), uci2LastMove(lastStepA?.move));
        this.b1.renderState();
        this.b2.setState(fenB, getTurnColor(fenB), uci2LastMove(lastStepB?.moveB));
        this.b2.renderState();

        if (this.status < 0) {
            this.updateClocks("a", this.b1.turnColor, clocksA);
            this.updateClocks("b", this.b2.turnColor, clocksB);
        } else {
            // // TODO: this logic differs than single board games and lichess - not sure if to preserve+improve or remove
            // //       for finished games they dont update clocks according to move times of last moves and here i do
            // if (lastStepA) {
            //     this.updateClocks("a", this.b1.turnColor, lastStepA.clocks!);
            // }
            // if (lastStepB) {
            //     this.updateClocks("b", this.b2.turnColor, lastStepB.clocks!);
            // }
        }

        // prevent sending premove/predrop when (auto)reconnecting websocked asks server to (re)sends the same board to us
        // console.log("trying to play premove....");
        if (this.b1.premove && this.b1.turnColor == this.myColor.get('a')) this.b1.performPremove();
        if (this.b2.premove && this.b2.turnColor == this.myColor.get('b')) this.b2.performPremove();
    }

    /**
     * @param boardName - for which board we are updating the clocks
     * @param turnColor - whose turn it is after this move - their clock should be started
     *
     * Stops clock of user how made the move for the board in question,
     * updates the clock times with the new values,
     * starts the clock of the player whose turn is now
     * */
    private updateClocks(boardName: BoardName, turnColor: cg.Color, msgClocks: Clocks) {

        if (boardName == 'a') {
            this.clocktimes = msgClocks;
        } else {
            this.clocktimesB = msgClocks;
        }

        const colors = boardName === 'a' ? this.colors : this.colorsB;

        // 0 - top, 1 - botton (in non-flipped mode) - that is how we identify clocks
        // todo: maybe make some enums for top/bottom
        const startClockAtIdx = colors[0] === turnColor? 0: 1;
        const stopClockAtIdx = 1 - startClockAtIdx;

        const whiteClockAtIdx = colors[0] === 'white'? 0: 1;
        const blackClockAtIdx = 1 - whiteClockAtIdx;

        const clocks = boardName === 'a'? this.clocks: this.clocksB;

        clocks[stopClockAtIdx].pause(false);

        clocks[whiteClockAtIdx].setTime(msgClocks[WHITE]);
        clocks[blackClockAtIdx].setTime(msgClocks[BLACK]);

        if (this.clockOn && this.status < 0) {
            clocks[startClockAtIdx].start();
        }

    }

    private updateSingleBoardAndClocks = (board: GameControllerBughouse, fen: cg.FEN, fenPartner: cg.FEN, lastStepA: Step, lastStepB: Step,
                                          msgClocks: Clocks, latestPly: boolean, colors: cg.Color[], status: number, check: boolean) => {
        console.log("updateSingleBoardAndClocks", board, fen, fenPartner, lastStepA, lastStepB, msgClocks, latestPly, colors, status, check);

        this.clockOn = true;// Number(msg.ply) >= 2;

        const step = board.boardName === 'a'? lastStepA: lastStepB;
        const stepPartner = board.boardName === 'b'? lastStepA: lastStepB;
        const msgTurnColor = step.turnColor; // whose turn it is after this move
        const msgMoveColor = msgTurnColor === 'white'? 'black': 'white'; // which color made the move
        const myMove = this.myColor.get(board.boardName as BugBoardName) === msgMoveColor; // the received move was made by me

        const move = board.boardName === 'a'? step.move: step.moveB;
        const lastMove = uci2LastMove(move);
        const lastMovePartner = stepPartner? uci2LastMove( board.partnerCC.boardName === 'a'? stepPartner.move: stepPartner.moveB): undefined;

        let capture = false;
        if (move) {
            //const capture = !!lastMove && ((board.chessground.state.boardState.pieces.get(lastMove[1] as cg.Key) && step.san?.slice(0, 2) !== 'O-') || (step.san?.slice(1, 2) === 'x'));
            capture = board.ffishBoard.isCapture(move);
        }

        if (lastMove && !myMove) {
            if (!this.finishedGame) sound.moveSound(this.variant, capture);
        }
        if (check && !this.finishedGame) {
            sound.check();
        }

        if (!myMove) {
            // important we update only the board where the single move happened, the other clock values do not include the
            // time passed since last move on that board, but contain what is last recorded on the server for that board,
            // while the clock values for this move contain what the user making the moves has in their browser, which we
            // consider most accurate
            this.updateClocks(board.boardName, msgTurnColor, msgClocks);

            //when message is for opp's move, meaning turnColor is my color - it is now my turn after this message
            if (latestPly) {
                board.setState(fen, board.turnColor === 'white' ? 'black' : 'white', lastMove);
                board.renderState();

                // because pocket might have changed. todo: condition it on if(capture) maybe
                const messageFenPartnerSplit = fenPartner.split(/[\[\]]/);
                const currentFenPartnerSplit = board.partnerCC.fullfen.split(/[\[\]]/);
                const newFen = currentFenPartnerSplit[0] + "[" + messageFenPartnerSplit[1] + "]" + currentFenPartnerSplit[2];
                board.partnerCC.setState(newFen, board.partnerCC.turnColor, lastMovePartner);
                board.partnerCC.renderState();

                if (!this.focus) this.notifyMsg(`Played ${step.san}\nYour turn.`);

                if (board.premove) board.performPremove();
            }
        } else {
            //when message is about the move i just made
            board.setState(fen, board.turnColor === 'white' ? 'black': 'white', lastMove);
            board.renderState();

            // because pocket might have changed. todo: condition it on if(capture) maybe
            board.partnerCC.setState(fenPartner, board.partnerCC.turnColor, board.partnerCC.lastmove);
            board.partnerCC.renderState();
        }

    }

    private onMsgBoard = (msg: MsgBoard) => {
        console.log(msg);
        if (msg.gameId !== this.gameId) return;

        let latestPly;
        const full = msg.steps.length > 1;
        const isInitialBoardMessage = this.ply === undefined;

        // latestPly=true means that the received move should be not only added to the move list, but also scrolled
        // to in the move list and also rendered on the board. This should happen if:
        // - initial page load/refresh - always consider it latest ply and show last position and scroll to last move
        // - the received move is exactly one move after the current, we are in latestPly mode and scroll to the new move
        // - we get full board message means refresh/reconnect, so we consider this a latestPly mode and will scroll to
        // latest ply regardless if user has scrolled back examining older moves or not and potentially ruining his
        // experience in case of network connection dropped and reconnected.
        latestPly = (isInitialBoardMessage || msg.ply === this.ply + 1 || (full && msg.ply > this.ply));

        if (latestPly) this.ply = msg.ply;

        this.result = msg.result;
        this.status = msg.status;

        this.updateSteps(full, msg.steps, msg.ply, latestPly);
        this.checkStatus(msg);

        //
        const lastStep = this.steps[this.steps.length - 1];

        const lastStepA = this.steps[this.steps.findLastIndex(s => s.boardName === "a")];
        const lastStepB = this.steps[this.steps.findLastIndex(s => s.boardName === "b")];

        if (isInitialBoardMessage || full) { // reconnect after lost ws connection or refresh
            if (this.spectator) {
                this.updateBoardsAndClocksSpectors(this.b1, lastStep.fen, lastStep.fenB!, lastStepA, lastStepB, msg.clocks!, latestPly, this.colors, msg.status, msg.check);
                this.updateBoardsAndClocksSpectors(this.b2, lastStep.fenB!, lastStep.fen, lastStepA, lastStepB, msg.clocksB!, latestPly, this.colorsB, msg.status, msg.checkB!);
            } else {
                this.updateBothBoardsAndClocksOnFullBoardMsg(lastStepA, lastStepB, lastStep.fen, lastStep.fenB!, msg.clocks!, msg.clocksB!);
            }
        } else {
            const boardName = msg.steps[msg.steps.length - 1].boardName as BugBoardName;
            const board = boardName === 'a' ? this.b1 : this.b2;
            const colors = boardName === 'a' ? this.colors : this.colorsB;
            const check = boardName == 'a' ? msg.check : msg.checkB!;
            const clocks = boardName == 'a' ? msg.clocks : msg.clocksB!;
            const fen = boardName == 'a' ? lastStep.fen : lastStep.fenB!;
            const fenPartner = boardName == 'a' ? lastStep.fenB! : lastStep.fen;
            if (this.spectator) {
                this.updateBoardsAndClocksSpectors(board, fen, fenPartner, lastStepA, lastStepB, clocks!, latestPly, colors, msg.status, check);
            } else {
                this.updateSingleBoardAndClocks(board, fen, fenPartner, lastStepA, lastStepB, clocks!, latestPly, colors, msg.status, check);
            }
        }
    }

    doSend = (message: JSONObject) => {
        console.log("---> doSend():", message);
        this.sock.send(JSON.stringify(message));
    }


    goPly = (ply: number) => {
        console.log("RoundControllerBughouse.goPly "+ply);

        const step = this.steps[ply];
        console.log(step);

        const board=step.boardName === 'a'? this.b1: this.b2;

        const fen=step.boardName==='a'?step.fen: step.fenB;
        const fenPartner=step.boardName === 'b'? step.fen: step.fenB;

        const move = step.boardName === 'a'? uci2LastMove(step.move): uci2LastMove(step.moveB);
        const movePartner = step.boardName === 'b'? uci2LastMove(step.move): uci2LastMove(step.moveB);

        let capture = false;
        if (move) {
            // 960 king takes rook castling is not capture
            // TODO defer this logic to ffish.js
            capture = (board.chessground.state.boardState.pieces.get(move[1] as cg.Key) !== undefined && step.san?.slice(0, 2) !== 'O-') || (step.san?.slice(1, 2) === 'x');
        }

        board.partnerCC.setState(fenPartner!, getTurnColor(fenPartner!), movePartner);
        board.partnerCC.renderState();

        board.setState(fen!, getTurnColor(fen!), move);
        board.renderState();

        if (this.status >=0 || ply !== this.steps.length - 1) {
            board.chessground.set({ movable: { color: undefined, dests: undefined } });
            board.partnerCC.chessground.set({ movable: { color: undefined, dests: undefined } });
        } else if (ply === this.steps.length - 1) {
            if (this.myColor.has("a")) {
                this.b1.setDests();
                this.b1.chessground.set({ movable: { color: this.myColor.get("a") } });
            }
            if (this.myColor.has("b")) {
                this.b2.setDests();
                this.b2.chessground.set({ movable: { color: this.myColor.get("b") } });
            }
        }

        // if (this.status >= 0 && this.ply !== ply) {
        //     //if it is a game that ended, then when scrolling it makes sense to show clocks when the move was made
        //     // however if timeout happened and we receive gameEnd message we don't want to update clocks, we want to see
        //     // the zeros.
        //     // todo:this is a mess. also on lichess and other pychess variants we don't update clocks in round page only in analysis
        //     //      if we decide to preserver and improve this behaviour in round page, at least some refactoring to reduce this complexity
        //     //      of this if and calling goPly on gameEnd just for the sake of setting movable to none - really no other reason
        //     //      to call this on gameEnd.
        //     const whiteAClockAtIdx = this.colors[0] === 'white'? 0: 1;
        //     const blackAClockAtIdx = 1 - whiteAClockAtIdx;
        //     const whiteBClockAtIdx = this.colorsB[0] === 'white'? 0: 1;
        //     const blackBClockAtIdx = 1 - whiteBClockAtIdx;
        //
        //     const lastStepA = this.steps[this.steps.findLastIndex((s, i) => s.boardName === "a" && i <= ply)];
        //     const lastStepB = this.steps[this.steps.findLastIndex((s, i) => s.boardName === "b" && i <= ply)];
        //     if (lastStepA) {
        //         this.clocks[whiteAClockAtIdx].setTime(lastStepA.clocks![WHITE]);
        //         this.clocks[blackAClockAtIdx].setTime(lastStepA.clocks![BLACK]);
        //     } else {
        //         this.clocks[whiteAClockAtIdx].setTime(this.base * 60 * 1000);
        //         this.clocks[blackAClockAtIdx].setTime(this.base * 60 * 1000);
        //     }
        //     if (lastStepB) {
        //         this.clocksB[whiteBClockAtIdx].setTime(lastStepB.clocks![WHITE]);
        //         this.clocksB[blackBClockAtIdx].setTime(lastStepB.clocks![BLACK]);
        //     } else {
        //         this.clocksB[whiteBClockAtIdx].setTime(this.base * 60 * 1000);
        //         this.clocksB[blackBClockAtIdx].setTime(this.base * 60 * 1000);
        //     }
        // }

        if (ply === this.ply + 1) { // no sound if we are scrolling backwards
            sound.moveSound(board.variant, capture);
        }
        this.ply = ply;
    }

    private onMsgUserConnected = (msg: MsgUserConnected) => {
        console.log(msg);
        if (!this.spectator) {
            const container = document.getElementById('player1a') as HTMLElement;
            patch(container, h('i-side.online#player1a', {class: {"icon": true, "icon-online": true, "icon-offline": false}}));

            // prevent sending gameStart message when user just reconnecting
            //todo:niki:what is the point of this message - also what if we refresh before moves are made? also what is the point of this whole method at all?
            if (msg.ply === 0) {
                this.doSend({ type: "ready", gameId: this.gameId });
            }
        }
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

    // private onMsgFullChat = (msg: MsgFullChat) => {
        // To prevent multiplication of messages we have to remove old messages div first
        // patch(document.getElementById('messages') as HTMLElement, h('div#messages-clear'));
        // // then create a new one
        // patch(document.getElementById('messages-clear') as HTMLElement, h('div#messages'));
        // if (this.ply > 4) {
        //     chatMessage("", "Chat visible only to your partner", "bugroundchat");
        // } else {
        //     chatMessage("", "Messages visible to all 4 players for the first 4 moves", "bugroundchat");
        // }
        // msg.lines.forEach((line) => {
        //     if ((this.spectator && line.room === 'spectator') || (!this.spectator && line.room !== 'spectator') || line.user.length === 0) {
        //         chatMessage(line.user, line.message, "bugroundchat", line.time);
        //     }
        // });
    // }

    private onMsgChat = (msg: StepChat) => {
        if (this.spectator /*spectators always see everything*/ || (!this.spectator && msg.room !== 'spectator') || msg.username.length === 0) {
            chatMessageBug(this.ply, this, msg);
            if (msg.username !== this.username && msg.message.startsWith("!bug!")) {
                sound.bugChatSound(msg.message.replace('!bug!',''));
            }
        }
    }

    protected onMessage(evt: MessageEvent) {
        console.log("<+++ onMessage():", evt.data);
        // super.onMessage(evt);
        if (evt.data === '/n') return;
        const msg = JSON.parse(evt.data);
        switch (msg.type) {
            // copy pated from gameCtl.ts->onMessage, which is otherwise inherited in normal roundCtrl
            case "spectators":
                // this.onMsgSpectators(msg);
                break;
            case "bugroundchat":
                this.onMsgChat(msg);
                break;
            // case "fullchat":
            //     this.onMsgFullChat(msg);
            //     break;
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
                this.doSend({"type": "board", "gameId": this.gameId});
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

export function swap(nodeA: HTMLElement, nodeB: HTMLElement) {
        const parentA = nodeA.parentNode;
        const siblingA = nodeA.nextSibling === nodeB ? nodeA : nodeA.nextSibling;

        // Move `nodeA` to before the `nodeB`
        nodeB.parentNode!.insertBefore(nodeA, nodeB);

        // Move `nodeB` to before the sibling of `nodeA`
        parentA!.insertBefore(nodeB, siblingA);
};

export function switchBoards(ctrl: RoundControllerBughouse| AnalysisControllerBughouse) {
            // todo: not sure if best implementation below
        //       it manipulates the DOM directly switching places of elements identified by whether they are
        //       main/second board, instead of keeping info about the switch and rendering boards on elements
        //       called left/right
        let mainboardVNode = document.getElementById('mainboard');
        let mainboardPocket0 = document.getElementById('pocket00');
        let mainboardPocket1 = document.getElementById('pocket01');

        let bugboardVNode = document.getElementById('bugboard');
        let bugboardPocket0 = document.getElementById('pocket10');
        let bugboardPocket1 = document.getElementById('pocket11');

        let a = mainboardVNode!.style.gridArea || "board";
        mainboardVNode!.style.gridArea = bugboardVNode!.style.gridArea || "boardPartner";
        bugboardVNode!.style.gridArea = a;

        swap(mainboardPocket0!, bugboardPocket0!);
        swap(mainboardPocket1!, bugboardPocket1!);

        ctrl.b1.chessground.redrawAll();
        ctrl.b2.chessground.redrawAll();
}

export function initBoardSettings(b1: ChessgroundController, b2: ChessgroundController, variant: Variant) {
    const boardFamily = variant.boardFamily;
    boardSettings.updateZoom(boardFamily, b1.boardName);
    boardSettings.updateZoom(boardFamily, b2.boardName);
}
