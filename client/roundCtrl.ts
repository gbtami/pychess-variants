import Sockette from 'sockette';

import { h, VNode } from 'snabbdom';
import * as cg from 'chessgroundx/types';

import { JSONObject } from './types';
import { _, ngettext } from './i18n';
import { patch } from './document';
import { boardSettings } from './boardSettings';
import { Clock } from './clock';
import { sound } from './sound';
import { uci2LastMove, cg2uci, getCounting, isHandicap } from './chess';
import { crosstableView } from './crosstable';
import { chatMessage, chatView } from './chat';
import { createMovelistButtons, updateMovelist, updateResult, selectMove } from './movelist';
import { renderRdiff } from './result'
import { player } from './player';
import { updateCount, updatePoint } from './info';
import { updateMaterial, emptyMaterial } from './material';
import { notify } from './notification';
import { Clocks, MsgBoard, MsgGameEnd, MsgMove, MsgNewGame, MsgUserConnected, RDiffs, CrossTable } from "./messages";
import { MsgUserDisconnected, MsgUserPresent, MsgMoreTime, MsgDrawOffer, MsgDrawRejected, MsgRematchOffer, MsgRematchRejected, MsgCount, MsgSetup, MsgGameStart, MsgViewRematch, MsgUpdateTV, MsgBerserk } from './roundType';
import { PyChessModel } from "./types";
import { GameController } from './gameCtrl';

let rang = false;

export class RoundController extends GameController {
    berserked: {wberserk: boolean, bberserk: boolean};
    byoyomi: boolean;
    byoyomiPeriod: number;
    clocks: [Clock, Clock];
    clocktimes: Clocks;
    expirations: [VNode | HTMLElement, VNode | HTMLElement];
    expiStart: number;
    firstmovetime: number;
    tournamentGame: boolean;
    profileid: string;
    level: number;
    clockOn: boolean;
    materialDifference: boolean;
    vmaterial0: VNode | HTMLElement;
    vmaterial1: VNode | HTMLElement;
    vmiscInfoW: VNode;
    vmiscInfoB: VNode;
    vpng: VNode;
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

    constructor(el: HTMLElement, model: PyChessModel) {
        super(el, model);
        this.focus = !document.hidden;
        document.addEventListener("visibilitychange", () => {this.focus = !document.hidden});
        window.addEventListener('blur', () => {this.focus = false});
        window.addEventListener('focus', () => {this.focus = true});

        const onOpen = (evt: Event) => {
            console.log("ctrl.onOpen()", evt);
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

        const opts = {
            maxAttempts: 10,
            onopen: (e: Event) => onOpen(e),
            onmessage: (e: MessageEvent) => this.onMessage(e),
            onreconnect: (e: Event | CloseEvent) => {

                this.clocks[0].connecting = true;
                this.clocks[1].connecting = true;
                console.log('Reconnecting in round...', e);

                // relevant to the "reconnecting" message in lower left corner
                document.body.classList.add('offline');
                document.body.classList.remove('online');
                document.body.classList.add('reconnected'); // this will trigger the animation once we get "online" class added back on reconnect

                const container = document.getElementById('player1') as HTMLElement;
                patch(container, h('i-side.online#player1', {class: {"icon": true, "icon-online": false, "icon-offline": true}}));
                },
            onmaximum: (e: CloseEvent) => console.log('Stop Attempting!', e),
            onclose: (e: CloseEvent) => console.log('Closed!', e),
            onerror: (e: Event) => console.log('Error:', e),
            };

        const ws = (location.protocol.indexOf('https') > -1) ? 'wss://' : 'ws://';
        this.sock = new Sockette(ws + location.host + "/wsr", opts);

        this.byoyomiPeriod = Number(model["byo"]);
        this.byoyomi = this.variant.timeControl === 'byoyomi';
        this.finishedGame = this.status >= 0;
        this.tv = model["tv"];
        this.profileid = model["profileid"];
        this.level = model["level"];
        this.berserked = {wberserk: model["wberserk"] === "True", bberserk: model["bberserk"] === "True"};

        this.settings = true;
        this.blindfold = localStorage.blindfold === undefined ? false : localStorage.blindfold === "true";
        this.autoPromote = localStorage.autoPromote === undefined ? false : localStorage.autoPromote === "true";
        this.materialDifference = localStorage.materialDifference === undefined ? false : localStorage.materialDifference === "true";

        this.handicap = this.variant.alternateStart ? Object.keys(this.variant.alternateStart!).some(alt => isHandicap(alt) && this.variant.alternateStart![alt] === this.fullfen) : false;

        this.preaction = false;

        this.tournamentGame = this.tournamentId !== '';
        const parts = this.fullfen.split(" ");
        this.clockOn = (Number(parts[parts.length - 1]) >= 2);

        const berserkId = (this.mycolor === "white") ? "wberserk" : "bberserk";
        // Not berserked yet, but allowed to do it
        this.berserkable = !this.spectator && this.tournamentGame && this.base > 0 && !this.berserked[berserkId];

        this.chessground.set({
            orientation: this.mycolor,
            turnColor: this.turnColor,
            autoCastle: this.variant.name !== 'cambodian', // TODO make more generic
            animation: { enabled: this.animation },
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
                animation: { enabled: this.animation },
                movable: {
                    free: false,
                    color: this.mycolor,
                    showDests: this.showDests,
                    events: {
                        after: (orig, dest, meta) => this.onUserMove(orig, dest, meta),
                        afterNewPiece: (role, dest, meta) => this.onUserDrop(role, dest, meta),
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
                },
            });
        }

        // initialize users
        const player0 = document.getElementById('rplayer0') as HTMLElement;
        const player1 = document.getElementById('rplayer1') as HTMLElement;
        this.vplayer0 = patch(player0, player('player0', this.titles[0], this.players[0], this.ratings[0], this.level));
        this.vplayer1 = patch(player1, player('player1', this.titles[1], this.players[1], this.ratings[1], this.level));

        if (this.variant.materialDiff) {
            const materialTop = document.querySelector('.material-top') as HTMLElement;
            const materialBottom = document.querySelector('.material-bottom') as HTMLElement;
            this.vmaterial0 = this.mycolor === 'white' ? materialBottom : materialTop;
            this.vmaterial1 = this.mycolor === 'black' ? materialBottom : materialTop;
            this.updateMaterial();
        }

        // initialize expirations
        this.expirations = [
            document.getElementById('expiration-top') as HTMLElement,
            document.getElementById('expiration-bottom') as HTMLElement
        ];

        this.clocktimes = {'white': this.base * 1000 * 60, 'black': this.base * 1000 * 60}

        // initialize clocks
        // this.clocktimes = {};
        const c0 = new Clock(this.base, this.inc, this.byoyomiPeriod, document.getElementById('clock0') as HTMLElement, 'clock0');
        const c1 = new Clock(this.base, this.inc, this.byoyomiPeriod, document.getElementById('clock1') as HTMLElement, 'clock1');
        this.clocks = [c0, c1];

        // If player berserked, set increment to 0. Actual clock duration value will be set by onMsgBoard()
        const bclock = this.mycolor === "black" ? 1 : 0;
        const wclock = 1 - bclock;
        if (this.berserked['wberserk']) this.clocks[wclock].increment = 0;
        if (this.berserked['bberserk']) this.clocks[bclock].increment = 0;

        this.clocks[0].onTick(this.clocks[0].renderTime);
        this.clocks[1].onTick(this.clocks[1].renderTime);

        const onMoreTime = () => {
            if (this.wtitle === 'BOT' || this.btitle === 'BOT' || this.spectator || this.status >= 0 || this.flipped()) return;
            const clockIdx = (this.flipped()) ? 1 : 0;
            this.clocks[clockIdx].setTime(this.clocks[clockIdx].duration + 15 * 1000);
            this.doSend({ type: "moretime", gameId: this.gameId });
            const oppName = (this.username === this.wplayer) ? this.bplayer : this.wplayer;
            chatMessage('', oppName + _(' +15 seconds'), "roundchat");
        }

        if (!this.spectator && this.rated !== '1' && this.wtitle !== 'BOT' && this.btitle !== 'BOT') {
            const container = document.getElementById('more-time') as HTMLElement;
            patch(container, h('div#more-time', [
                h('button.icon.icon-plus-square', {
                    props: {type: "button", title: _("Give 15 seconds")},
                    on: { click: () => onMoreTime() }
                })
            ]));
        }

        const onBerserk = () => {
            if (this.berserkable) {
                this.berserkable = false;
                this.berserk(this.mycolor);
                this.doSend({ type: "berserk", gameId: this.gameId, color: this.mycolor });
            }
        }

        if (this.berserkable && this.status < 0 && this.ply < 2) {
            const container = document.getElementById('berserk1') as HTMLElement;
            patch(container, h('div#berserk1', [
                h('button.icon.icon-berserk', {
                    props: {type: "button", title: _("Berserk")},
                    on: { click: () => onBerserk() }
                })
            ]));
        }

        // initialize crosstable
        this.ctableContainer = document.querySelector('.ctable-container') as HTMLElement;

        if (model["ct"]) {
            this.ctableContainer = patch(this.ctableContainer, h('div.ctable-container'));
            this.ctableContainer = patch(this.ctableContainer, crosstableView(model["ct"] as CrossTable, this.gameId));
        }

        const misc0 = document.getElementById('misc-info0') as HTMLElement;
        const misc1 = document.getElementById('misc-info1') as HTMLElement;

        // initialize material point and counting indicator
        if (this.variant.materialPoint || this.variant.counting) {
            this.vmiscInfoW = this.mycolor === 'white' ? patch(misc1, h('div#misc-infow')) : patch(misc0, h('div#misc-infow'));
            this.vmiscInfoB = this.mycolor === 'black' ? patch(misc1, h('div#misc-infob')) : patch(misc0, h('div#misc-infob'));
        }

        const flagCallback = () => {
            if (this.turnColor === this.mycolor) {
                this.chessground.stop();
                // console.log("Flag");
                this.doSend({ type: "flag", gameId: this.gameId });
            }
        }

        const byoyomiCallback = () => {
            if (this.turnColor === this.mycolor) {
                // console.log("Byoyomi", this.clocks[1].byoyomiPeriod);
                const oppclock = !this.flipped() ? 0 : 1;
                const myclock = 1 - oppclock;
                this.doSend({ type: "byoyomi", gameId: this.gameId, color: this.mycolor, period: this.clocks[myclock].byoyomiPeriod });
            }
        }

        if (!this.spectator) {
            if (this.byoyomiPeriod > 0) {
                this.clocks[1].onByoyomi(byoyomiCallback);
            }
            this.clocks[1].onFlag(flagCallback);
        }

        const container = document.getElementById('game-controls') as HTMLElement;
        if (!this.spectator) {
            const pass = this.variant.pass;
            let buttons = [];
            if (!this.tournamentGame) {
                buttons.push(h('button#abort', { on: { click: () => this.abort() }, props: {title: _('Abort')} }, [h('i', {class: {"icon": true, "icon-abort": true} } ), ]));
            }
            buttons.push(h('button#count', _('Count')));
            buttons.push(h('button#draw', { on: { click: () => (pass) ? this.pass() : this.draw() }, props: {title: (pass) ? _('Pass') : _("Draw")} }, [(pass) ? _('Pass') : h('i', '½')]));
            buttons.push(h('button#resign', { on: { click: () => this.resign() }, props: {title: _("Resign")} }, [h('i', {class: {"icon": true, "icon-flag-o": true} } ), ]));
            
            this.gameControls = patch(container, h('div.btn-controls', buttons));

            const manualCount = this.variant.counting === 'makruk' && !(this.wtitle === 'BOT' || this.btitle === 'BOT');
            if (!manualCount)
                patch(document.getElementById('count') as HTMLElement, h('div'));

        } else {
            this.gameControls = patch(container, h('div.btn-controls'));
        }

        createMovelistButtons(this);
        this.vmovelist = document.getElementById('movelist') as HTMLElement;

        this.vdialog = patch(document.getElementById('offer-dialog')!, h('div#offer-dialog', ""));

        patch(document.getElementById('roundchat') as HTMLElement, chatView(this, "roundchat"));

        this.onMsgBoard(model["board"] as MsgBoard);
    }

    toggleOrientation() {
        // TODO: handle berserk
        if (this.tournamentGame && this.ply < 2 && !this.spectator) return;

        super.toggleOrientation()

        boardSettings.updateDropSuggestion();

        // console.log("FLIP");
        if (this.variant.materialDiff) {
            this.updateMaterial();
        }

        // TODO: moretime button
        const new_running_clck = (this.clocks[0].running) ? this.clocks[1] : this.clocks[0];
        this.clocks[0].pause(false);
        this.clocks[1].pause(false);

        const tmp_clock = this.clocks[0];
        const tmp_clock_time = tmp_clock.duration;
        this.clocks[0].setTime(this.clocks[1].duration);
        this.clocks[1].setTime(tmp_clock_time);
        if (this.status < 0) new_running_clck.start();

        this.vplayer0 = patch(this.vplayer0, player('player0', this.titles[this.flipped() ? 1 : 0], this.players[this.flipped() ? 1 : 0], this.ratings[this.flipped() ? 1 : 0], this.level));
        this.vplayer1 = patch(this.vplayer1, player('player1', this.titles[this.flipped() ? 0 : 1], this.players[this.flipped() ? 0 : 1], this.ratings[this.flipped() ? 0 : 1], this.level));

        if (this.variant.counting)
            [this.vmiscInfoW, this.vmiscInfoB] = updateCount(this.fullfen, this.vmiscInfoB, this.vmiscInfoW);

        if (this.variant.materialPoint)
            [this.vmiscInfoW, this.vmiscInfoB] = updatePoint(this.fullfen, this.vmiscInfoB, this.vmiscInfoW);

        this.updateMaterial();
    }

    private berserk = (color: cg.Color) => {
        let bclock;
        if (!this.flipped()) {
            bclock = this.mycolor === "black" ? 1 : 0;
        } else {
            bclock = this.mycolor === "black" ? 0 : 1;
        }
        const wclock = 1 - bclock
        const clockIdx = (color === 'white') ? wclock : bclock;

        this.clocks[clockIdx].increment = 0;
        this.clocks[clockIdx].setTime(this.base * 1000 * 30);
        this.clocktimes[color] = this.base * 1000 * 30;
        sound.berserk();

        const berserkId = (color === "white") ? "wberserk" : "bberserk";
        this.berserked[berserkId] = true;
        const infoContainer = document.getElementById(berserkId) as HTMLElement;
        if (infoContainer) patch(infoContainer, h('icon.icon-berserk'));

        const container = document.getElementById(`berserk${clockIdx}`) as HTMLElement;
        patch(container, h(`div#berserk${clockIdx}.berserked`, [h('button.icon.icon-berserk')]));
    }

    private abort = () => {
        // console.log("Abort");
        this.doSend({ type: "abort", gameId: this.gameId });
    }

    private draw = () => {
        // console.log("Draw");
        if (confirm(_('Are you sure you want to draw?'))) {
            this.doSend({ type: "draw", gameId: this.gameId });
            this.setDialog(_("Draw offer sent"));
        }
    }

    private rejectDrawOffer = () => {
        this.doSend({ type: "reject_draw", gameId: this.gameId });
        this.clearDialog();
    }

    private renderDrawOffer = () => {
        this.vdialog = patch(this.vdialog, h('div#offer-dialog', [
            h('div', { class: { reject: true }, on: { click: () => this.rejectDrawOffer() } }, h('i.icon.icon-abort.reject')),
            h('div.text', _("Your opponent offers a draw")),
            h('div', { class: { accept: true }, on: { click: () => this.draw() } }, h('i.icon.icon-check')),
        ]));
    }

    private setDialog = (message: string) => {
        this.vdialog = patch(this.vdialog, h('div#offer-dialog', [
            h('div', { class: { reject: false } }),
            h('div.text', message),
            h('div', { class: { accept: false } }),
        ]));
    }

    private clearDialog = () => {
        this.vdialog = patch(this.vdialog, h('div#offer-dialog', []));
    }

    private resign = () => {
        // console.log("Resign");
        if (confirm(_('Are you sure you want to resign?'))) {
            this.doSend({ type: "resign", gameId: this.gameId });
        }
    }

    // Janggi second player (Red) setup
    private onMsgSetup = (msg: MsgSetup) => {
        this.setupFen = msg.fen;
        this.chessground.set({fen: this.setupFen});

        const side = (msg.color === 'white') ? _('Blue (Cho)') : _('Red (Han)');
        const message = _('Waiting for %1 to choose starting positions of the horses and elephants...', side);

        this.expiStart = 0;
        this.renderExpiration();
        this.turnColor = msg.color;
        this.expiStart = Date.now();
        setTimeout(this.showExpiration, 350);

        if (this.spectator || msg.color !== this.mycolor) {
            chatMessage('', message, "roundchat");
            return;
        }

        chatMessage('', message, "roundchat");

        const switchLetters = (side: number) => {
            const white = this.mycolor === 'white';
            const rank = (white) ? 9 : 0;
            const horse = (white) ? 'N' : 'n';
            const elephant = (white) ? 'B' : 'b';
            const parts = this.setupFen.split(' ')[0].split('/');
            let [left, right] = parts[rank].split('1')
            if (side === -1) {
                left = left.replace(horse, '*').replace(elephant, horse).replace('*', elephant);
            } else {
                right = right.replace(horse, '*').replace(elephant, horse).replace('*', elephant);
            }
            parts[rank] = left + '1' + right;
            this.setupFen = parts.join('/') + ' w - - 0 1' ;
            this.chessground.set({fen: this.setupFen});
        }

        const sendSetup = () => {
            patch(document.getElementById('janggi-setup-buttons') as HTMLElement, h('div#empty'));
            this.doSend({ type: "setup", gameId: this.gameId, color: this.mycolor, fen: this.setupFen });
        }

        const leftSide = (this.mycolor === 'white') ? -1 : 1;
        const rightSide = leftSide * -1;
        patch(document.getElementById('janggi-setup-buttons') as HTMLElement, h('div#janggi-setup-buttons', [
            h('button#flipLeft', { on: { click: () => switchLetters(leftSide) } }, [h('i', {props: {title: _('Switch pieces')}, class: {"icon": true, "icon-exchange": true} } ), ]),
            h('button', { on: { click: () => sendSetup() } }, [h('i', {props: {title: _('Ready')}, class: {"icon": true, "icon-check": true} } ), ]),
            h('button#flipRight', { on: { click: () => switchLetters(rightSide) } }, [h('i', {props: {title: _('Switch pieces')}, class: {"icon": true, "icon-exchange": true} } ), ]),
        ]));
    }

    private notifyMsg = (msg: string) => {
        if (this.status >= 0) return;

        const opp_name = this.username === this.wplayer ? this.bplayer : this.wplayer;
        const logoUrl = `${this.home}/static/favicon/android-icon-192x192.png`;
        notify('pychess.org', {body: `${opp_name}\n${msg}`, icon: logoUrl});
    }

    private onMsgBerserk = (msg: MsgBerserk) => {
        if (!this.spectator && msg['color'] === this.mycolor) return;
        this.berserk(msg['color'])
    }

    private onMsgGameStart = (msg: MsgGameStart) => {
        // console.log("got gameStart msg:", msg);
        if (msg.gameId !== this.gameId) return;
        if (!this.spectator) {
            sound.genericNotify();
            if (!this.focus) this.notifyMsg('joined the game.');
        }
    }

    private onMsgNewGame = (msg: MsgNewGame) => {
        window.location.assign(this.home + '/' + msg["gameId"]);
    }

    private onMsgViewRematch = (msg: MsgViewRematch) => {
        const btns_after = document.querySelector('.btn-controls.after') as HTMLElement;
        let rematch_button = h('button.newopp', { on: { click: () => window.location.assign(this.home + '/' + msg["gameId"]) } }, _("VIEW REMATCH"));
        let rematch_button_location = btns_after!.insertBefore(document.createElement('div'), btns_after!.firstChild);
        patch(rematch_button_location, rematch_button);
    }

    private rematch = () => {
        this.doSend({ type: "rematch", gameId: this.gameId, handicap: this.handicap });
        this.setDialog(_("Rematch offer sent"));
    }

    private rejectRematchOffer = () => {
        this.doSend({ type: "reject_rematch", gameId: this.gameId });
        this.clearDialog();
    }

    private renderRematchOffer = () => {
        this.vdialog = patch(this.vdialog, h('div#offer-dialog', [
            h('div', { class: { reject: true }, on: { click: () => this.rejectRematchOffer() } }, h('i.icon.icon-abort.reject')),
            h('div.text', _("Your opponent offers a rematch")),
            h('div', { class: { accept: true }, on: { click: () => this.rematch() } }, h('i.icon.icon-check')),
        ]));
    }

    private newOpponent = (home: string) => {
        this.doSend({"type": "leave", "gameId": this.gameId});
        window.location.assign(home);
    }

    private analysis = (home: string) => {
        window.location.assign(home + '/' + this.gameId + '?ply=' + this.ply.toString());
    }

    private joinTournament = () => {
        window.location.assign(this.home + '/tournament/' + this.tournamentId);
    }

    private pauseTournament = () => {
        window.location.assign(this.home + '/tournament/' + this.tournamentId + '/pause');
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
            if (this.tournamentGame) {
                // TODO: isOver = ?
                const isOver = false;
                if (isOver) {
                    buttons.push(h('button.newopp', { on: { click: () => this.joinTournament() } },
                        [h('div', {class: {"icon": true, 'icon-play3': true} }, _("VIEW TOURNAMENT"))]));
                } else {
                    buttons.push(h('button.newopp', { on: { click: () => this.joinTournament() } },
                        [h('div', {class: {"icon": true, 'icon-play3': true} }, _("BACK TO TOURNAMENT"))]));
                    buttons.push(h('button.newopp', { on: { click: () => this.pauseTournament() } },
                        [h('div', {class: {"icon": true, 'icon-pause2': true} }, _("PAUSE"))]));
                }
            } else {
                buttons.push(h('button.rematch', { on: { click: () => this.rematch() } }, _("REMATCH")));
                buttons.push(h('button.newopp', { on: { click: () => this.newOpponent(this.home) } }, _("NEW OPPONENT")));
            }
        }
        buttons.push(h('button.analysis', { on: { click: () => this.analysis(this.home) } }, _("ANALYSIS BOARD")));
        patch(this.gameControls, h('div.btn-controls.after', buttons));
    }

    private checkStatus = (msg: MsgBoard | MsgGameEnd) => {
        if (msg.gameId !== this.gameId) return;
        if (msg.status >= 0) {
            this.status = msg.status;
            this.result = msg.result;
            this.clocks[0].pause(false);
            this.clocks[1].pause(false);
            this.dests = new Map();

            if (this.result !== "*" && !this.spectator && !this.finishedGame)
                sound.gameEndSound(msg.result, this.mycolor);

            if ("rdiffs" in msg) this.gameOver(msg.rdiffs);
            selectMove(this, this.ply);

            updateResult(this);

            if ("ct" in msg && msg.ct) {
                this.ctableContainer = patch(this.ctableContainer, h('div.ctable-container'));
                this.ctableContainer = patch(this.ctableContainer, crosstableView(msg.ct, this.gameId));
            }

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
        if (msg.gameId !== this.gameId) {
            if (this.profileid !== "") {
                window.location.assign(this.home + '/@/' + this.profileid + '/tv');
            } else {
                window.location.assign(this.home + '/tv');
            }
            // TODO: reuse current websocket to fix https://github.com/gbtami/pychess-variants/issues/142
            // this.doSend({ type: "game_user_connected", username: this.username, gameId: msg.gameId });
        }
    }

    private onMsgBoard = (msg: MsgBoard) => {
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

        if (this.ply === 0) {
            if (this.variant.name === 'janggi') {
                // force to set new dests after setup phase!
                latestPly = true;
            } else {
                this.expiStart = Date.now();
                setTimeout(this.showExpiration, 350);
            }
        }

        if (this.ply >= 2) {
            const container0 = document.getElementById('berserk0') as HTMLElement;
            if (container0) patch(container0, h('div#berserk0', ''));

            const container1 = document.getElementById('berserk1') as HTMLElement;
            if (container1) patch(container1, h('div#berserk1', ''));
        }

        if (this.ply === 1 || this.ply === 2) {
            this.expiStart = 0;
            this.renderExpiration();
            if (this.ply === 1) {
                this.expiStart = Date.now();
                setTimeout(this.showExpiration, 350);
            }
        }

        this.fullfen = msg.fen;

        if (this.variant.gate) {
            // When castling with gating is possible 
            // e1g1, e1g1h, e1g1e, h1e1h, h1e1e all will be offered by moving our king two squares
            // so we filter out rook takes king moves (h1e1h, h1e1e) from dests
            for (const orig in msg.dests) {
                if (orig[1] !== '@') {
                const movingPiece = this.chessground.state.pieces.get(orig as cg.Key);
                if (movingPiece !== undefined && movingPiece.role === "r-piece") {
                    msg.dests[orig] = msg.dests[orig].filter(x => {
                        const destPiece = this.chessground.state.pieces.get(x);
                        return destPiece === undefined || destPiece.role !== 'k-piece';
                    });
                }
                }
            }
        }
        const parts = msg.fen.split(" ");
        this.turnColor = parts[1] === "w" ? "white" : "black";

        this.dests = (msg.status < 0) ? new Map(Object.entries(msg.dests)) : new Map();

        // list of legal promotion moves
        this.promotions = msg.promo;
        this.clocktimes = msg.clocks || this.clocktimes;

        this.result = msg.result;
        this.status = msg.status;

        if (msg.steps.length > 1) {
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
                const full = false;
                const activate = !this.spectator || latestPly;
                const result = false;
                updateMovelist(this, full, activate, result);
            }
        }

        this.clockOn = Number(msg.ply) >= 2;
        if ((!this.spectator && this.clockOn) || this.tournamentGame) {
            const container = document.getElementById('abort') as HTMLElement;
            if (container) patch(container, h('div'));
        }

        const lastMove = uci2LastMove(msg.lastMove);
        const step = this.steps[this.steps.length - 1];
        const capture = (lastMove.length > 0) && ((this.chessground.state.pieces.get(lastMove[1]) && step.san?.slice(0, 2) !== 'O-') || (step.san?.slice(1, 2) === 'x'));

        if (lastMove.length > 0 && (this.turnColor === this.mycolor || this.spectator)) {
            if (!this.finishedGame) sound.moveSound(this.variant, capture);
        }
        this.checkStatus(msg);
        if (!this.spectator && msg.check && !this.finishedGame) {
            sound.check();
        }

        if (this.variant.counting) {
            this.updateCount(msg.fen);
        }

        if (this.variant.materialPoint) {
            this.updatePoint(msg.fen);
        }

        const oppclock = !this.flipped() ? 0 : 1;
        const myclock = 1 - oppclock;

        this.clocks[0].pause(false);
        this.clocks[1].pause(false);
        if (this.byoyomi && msg.byo) {
            this.clocks[oppclock].byoyomiPeriod = msg.byo[(this.oppcolor === 'white') ? 0 : 1];
            this.clocks[myclock].byoyomiPeriod = msg.byo[(this.mycolor === 'white') ? 0 : 1];
        }

        this.clocks[oppclock].setTime(this.clocktimes[this.oppcolor]);
        this.clocks[myclock].setTime(this.clocktimes[this.mycolor]);

        let bclock;
        if (!this.flipped()) {
            bclock = this.mycolor === "black" ? 1 : 0;
        } else {
            bclock = this.mycolor === "black" ? 0 : 1;
        }
        const wclock = 1 - bclock
        if (this.berserked['wberserk'] || msg.berserk.w) {
            this.clocks[wclock].increment = 0;
            if (msg.ply <= 2) this.clocks[wclock].setTime(this.base * 1000 * 30);
        }
        if (this.berserked['bberserk'] || msg.berserk.b) {
            this.clocks[bclock].increment = 0;
            if (msg.ply <= 2) this.clocks[bclock].setTime(this.base * 1000 * 30);
        }

        if (this.spectator) {
            if (latestPly) {
                this.chessground.set({
                    fen: this.fullfen,
                    turnColor: this.turnColor,
                    check: msg.check,
                    lastMove: lastMove,
                });
            }
            if (this.clockOn && msg.status < 0) {
                if (this.turnColor === this.mycolor) {
                    this.clocks[myclock].start();
                } else {
                    this.clocks[oppclock].start();
                }
            }
        } else {
            if (this.turnColor === this.mycolor) {
                if (latestPly) {
                    this.chessground.set({
                        fen: this.fullfen,
                        turnColor: this.turnColor,
                        movable: {
                            free: false,
                            color: this.mycolor,
                            dests: this.dests,
                        },
                        check: msg.check,
                        lastMove: lastMove,
                    });

                    if (!this.focus) this.notifyMsg(`Played ${step.san}\nYour turn.`);

                    // prevent sending premove/predrop when (auto)reconnecting websocked asks server to (re)sends the same board to us
                    // console.log("trying to play premove....");
                    if (this.premove) this.performPremove();
                    if (this.predrop) this.performPredrop();
                }
                if (this.clockOn && msg.status < 0) {
                    this.clocks[myclock].start();
                    // console.log('MY CLOCK STARTED');
                }
            } else {
                this.chessground.set({
                    // giving fen here will place castling rooks to their destination in chess960 variants
                    fen: parts[0],
                    turnColor: this.turnColor,
                    check: msg.check,
                });
                if (this.clockOn && msg.status < 0) {
                    this.clocks[oppclock].start();
                    // console.log('OPP CLOCK  STARTED');
                }
            }
        }
        this.updateMaterial();
    }

    goPly = (ply: number, plyVari = 0) => {
        super.goPly(ply, plyVari);

        const step = this.steps[ply];
        this.chessground.set({
            movable: {
                free: false,
                color: this.spectator ? undefined : step.turnColor,
                dests: (this.turnColor === this.mycolor && this.result === "*" && ply === this.steps.length - 1) ? this.dests : undefined,
            }
        });

        this.updateMaterial();
    }

    doSendMove = (orig: cg.Orig, dest: cg.Key, promo: string) => {
        this.clearDialog();
        // pause() will add increment!
        const oppclock = !this.flipped() ? 0 : 1
        const myclock = 1 - oppclock;
        const movetime = (this.clocks[myclock].running) ? Date.now() - this.clocks[myclock].startTime : 0;
        this.clocks[myclock].pause((this.base === 0 && this.ply < 2) ? false : true);
        // console.log("sendMove(orig, dest, prom)", orig, dest, promo);

        const move = cg2uci(orig + dest + promo);

        // console.log("sendMove(move)", move);
        let bclock, clocks;
        if (!this.flipped()) {
            bclock = this.mycolor === "black" ? 1 : 0;
        } else {
            bclock = this.mycolor === "black" ? 0 : 1;
        }
        const wclock = 1 - bclock

        let increment = 0;
        if (!this.berserked[(this.mycolor === "white") ? "wberserk" : "bberserk"]) {
            increment = (this.inc > 0 && this.ply >= 2 && !this.byoyomi) ? this.inc * 1000 : 0;
        }

        const bclocktime = (this.mycolor === "black" && this.preaction) ? this.clocktimes.black + increment: this.clocks[bclock].duration;
        const wclocktime = (this.mycolor === "white" && this.preaction) ? this.clocktimes.white + increment: this.clocks[wclock].duration;

        clocks = {movetime: (this.preaction) ? 0 : movetime, black: bclocktime, white: wclocktime};

        this.lastMaybeSentMsgMove = { type: "move", gameId: this.gameId, move: move, clocks: clocks, ply: this.ply + 1 };
        this.doSend(this.lastMaybeSentMsgMove as JSONObject);

        if (this.preaction) {
            this.clocks[myclock].setTime(this.clocktimes[this.mycolor] + increment);
        }
        if (this.clockOn) this.clocks[oppclock].start();
    }

    private startCount = () => {
        this.doSend({ type: "count", gameId: this.gameId, mode: "start" });
    }

    private stopCount = () => {
        this.doSend({ type: "count", gameId: this.gameId, mode: "stop" });
    }

    private updateCount = (fen: cg.FEN) => {
        [this.vmiscInfoW, this.vmiscInfoB] = updateCount(fen, this.vmiscInfoW, this.vmiscInfoB);
        const countButton = document.getElementById('count') as HTMLElement;
        if (countButton) {
            const [ , , countingSide, countingType ] = getCounting(fen);
            const myturn = this.mycolor === this.turnColor;
            if (countingType === 'board')
                if ((countingSide === 'w' && this.mycolor === 'white') || (countingSide === 'b' && this.mycolor === 'black'))
                    patch(countButton, h('button#count', { on: { click: () => this.stopCount() }, props: {title: _('Stop counting')}, class: { disabled: !myturn } }, _('Stop')));
                else
                    patch(countButton, h('button#count', { on: { click: () => this.startCount() }, props: {title: _('Start counting')}, class: { disabled: !(myturn && countingSide === '') } }, _('Count')));
            else
                patch(countButton, h('button#count', { props: {title: _('Start counting')}, class: { disabled: true } }, _('Count')));
        }
    }

    private updatePoint = (fen: cg.FEN) => {
        [this.vmiscInfoW, this.vmiscInfoB] = updatePoint(fen, this.vmiscInfoW, this.vmiscInfoB);
    }

    private updateMaterial(): void {
        if (this.variant.materialDiff && this.materialDifference)
            [this.vmaterial0, this.vmaterial1] = updateMaterial(this.variant, this.fullfen, this.vmaterial0, this.vmaterial1, this.flipped());
        else
            [this.vmaterial0, this.vmaterial1] = emptyMaterial(this.variant);
    }

    private setPremove = (orig: cg.Key, dest: cg.Key, metadata?: cg.SetPremoveMetadata) => {
        this.premove = { orig, dest, metadata };
        // console.log("setPremove() to:", orig, dest, meta);
    }

    private unsetPremove = () => {
        this.premove = undefined;
        this.preaction = false;
    }

    private setPredrop = (role: cg.Role, key: cg.Key) => {
        this.predrop = { role, key };
        // console.log("setPredrop() to:", role, key);
    }

    private unsetPredrop = () => {
        this.predrop = undefined;
        this.preaction = false;
    }

    private performPremove = () => {
        // const { orig, dest, meta } = this.premove;
        // TODO: promotion?
        // console.log("performPremove()", orig, dest, meta);
        this.chessground.playPremove();
    }

    private performPredrop = () => {
        // const { role, key } = this.predrop;
        // console.log("performPredrop()", role, key);
        this.chessground.playPredrop();
    }

    private renderExpiration = () => {
        if (this.spectator) return;
        let position = (this.turnColor === this.mycolor) ? "bottom": "top";
        if (this.flipped()) position = (position === "top") ? "bottom" : "top";
        let expi = (position === 'top') ? 0 : 1;
        const timeLeft = Math.max(0, this.expiStart - Date.now() + this.firstmovetime );
        // console.log("renderExpiration()", position, timeLeft);
        if (timeLeft === 0 || this.status >= 0) {
            this.expirations[expi] = patch(this.expirations[expi], h('div#expiration-' + position));
        } else {
            const emerg = (this.turnColor === this.mycolor && timeLeft < 8000);
            if (!rang && emerg) {
                sound.lowTime();
                rang = true;
            }
            const secs: number = Math.floor(timeLeft / 1000);
            this.expirations[expi] = patch(this.expirations[expi], h('div#expiration-' + position + '.expiration',
                {class:
                    {emerg, 'bar-glider': this.turnColor === this.mycolor}
                },
                [ngettext('%1 second to play the first move', '%1 seconds to play the first move', secs)]
            ));
        }
    }

    private showExpiration = () => {
        if (this.expiStart === 0 || this.spectator) return;
        this.renderExpiration();
        setTimeout(this.showExpiration, 250);
    }

    private onMsgUserConnected = (msg: MsgUserConnected) => {
        this.username = msg["username"];
        if (this.spectator) {
            this.doSend({ type: "is_user_present", username: this.wplayer, gameId: this.gameId });
            this.doSend({ type: "is_user_present", username: this.bplayer, gameId: this.gameId });

        } else {
            this.firstmovetime = msg.firstmovetime || this.firstmovetime;

            const opp_name = this.username === this.wplayer ? this.bplayer : this.wplayer;
            this.doSend({ type: "is_user_present", username: opp_name, gameId: this.gameId });

            const container = document.getElementById('player1') as HTMLElement;
            patch(container, h('i-side.online#player1', {class: {"icon": true, "icon-online": true, "icon-offline": false}}));

            // prevent sending gameStart message when user just reconecting
            if (msg.ply === 0) {
                this.doSend({ type: "ready", gameId: this.gameId });
                if (this.variant.name === 'janggi') {
                    this.doSend({ type: "board", gameId: this.gameId });
                }
            }
        }
    }

    private onMsgUserPresent = (msg: MsgUserPresent) => {
        // console.log(msg);
        if (msg.username === this.players[0]) {
            const container = document.getElementById('player0') as HTMLElement;
            patch(container, h('i-side.online#player0', {class: {"icon": true, "icon-online": true, "icon-offline": false}}));
        } else {
            const container = document.getElementById('player1') as HTMLElement;
            patch(container, h('i-side.online#player1', {class: {"icon": true, "icon-online": true, "icon-offline": false}}));
        }
    }

    private onMsgUserDisconnected = (msg: MsgUserDisconnected) => {
        // console.log(msg);
        if (msg.username === this.players[0]) {
            const container = document.getElementById('player0') as HTMLElement;
            patch(container, h('i-side.online#player0', {class: {"icon": true, "icon-online": false, "icon-offline": true}}));
        } else {
            const container = document.getElementById('player1') as HTMLElement;
            patch(container, h('i-side.online#player1', {class: {"icon": true, "icon-online": false, "icon-offline": true}}));
        }
    }

    private onMsgMoreTime = (msg: MsgMoreTime) => {
        chatMessage('', msg.username + _(' +15 seconds'), "roundchat");
        if (this.spectator) {
            if (msg.username === this.players[0]) {
                this.clocks[0].setTime(this.clocks[0].duration + 15 * 1000);
            } else {
                this.clocks[1].setTime(this.clocks[1].duration + 15 * 1000);
            }
        } else {
            this.clocks[1].setTime(this.clocks[1].duration + 15 * 1000);
        }
    }

    private onMsgDrawOffer = (msg: MsgDrawOffer) => {
        chatMessage("", msg.message, "roundchat");
        if (!this.spectator && msg.username !== this.username) this.renderDrawOffer();
    }

    private onMsgDrawRejected = (msg: MsgDrawRejected) => {
        chatMessage("", msg.message, "roundchat");
        this.clearDialog();
    }

    private onMsgRematchOffer = (msg: MsgRematchOffer) => {
        chatMessage("", msg.message, "roundchat");
        if (!this.spectator && msg.username !== this.username) this.renderRematchOffer();
    }

    private onMsgRematchRejected = (msg: MsgRematchRejected) => {
        chatMessage("", msg.message, "roundchat");
        this.clearDialog();
    }

    private onMsgCount = (msg: MsgCount) => {
        chatMessage("", msg.message, "roundchat");
        if (msg.message.endsWith("started")) {
            if (this.turnColor === 'white')
                this.vmiscInfoW = patch(this.vmiscInfoW, h('div#misc-infow', '0/64'));
            else
                this.vmiscInfoB = patch(this.vmiscInfoB, h('div#misc-infob', '0/64'));
        }
        else if (msg.message.endsWith("stopped")) {
            if (this.turnColor === 'white')
                this.vmiscInfoW = patch(this.vmiscInfoW, h('div#misc-infow', ''));
            else
                this.vmiscInfoB = patch(this.vmiscInfoB, h('div#misc-infob', ''));
        }
    }

    protected onMessage(evt: MessageEvent) {
        // console.log("<+++ onMessage():", evt.data);
        super.onMessage(evt);

        const msg = JSON.parse(evt.data);
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
            case "moretime":
                this.onMsgMoreTime(msg);
                break;
            case "updateTV":
                this.onMsgUpdateTV(msg);
                break
            case "setup":
                this.onMsgSetup(msg);
                break;
            case "count":
                this.onMsgCount(msg);
                break;
            case "berserk":
                this.onMsgBerserk(msg);
                break;
        }
    }
}
