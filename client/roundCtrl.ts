import { h, VNode } from 'snabbdom';
import { premove } from 'chessgroundx/premove';
import { predrop } from 'chessgroundx/predrop';
import * as cg from 'chessgroundx/types';
import { Api } from "chessgroundx/api";

import { newWebsocket } from './socket';
import { JSONObject } from './types';
import { _, ngettext } from './i18n';
import { patch } from './document';
import { boardSettings } from './boardSettings';
import { Clock } from './clock';
import { sound } from './sound';
import { WHITE, BLACK, uci2LastMove, getCounting, isHandicap } from './chess';
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
import { handleOngoingGameEvents, Game, gameViewPlaying, compareGames } from './nowPlaying';
import { initPocketRow } from './pocketRow';

let rang = false;
const CASUAL = '0';

export class RoundController extends GameController {
    assetURL: string;
    berserked: { wberserk: boolean, bberserk: boolean };
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
    vpng: VNode;
    vdialog: VNode;
    berserkable: boolean;
    settings: boolean;
    tv: boolean;
    blindfold: boolean;
    handicap: boolean;
    setupFen: string;
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
        };

        const onReconnect = () => {
            if (this.finishedGame) {
                // Prevent endless reconnections from finished games
                this.sock.close();
                return
            }
            this.clocks[0].connecting = true;
            this.clocks[1].connecting = true;
            console.log('Reconnecting in round...');

            // relevant to the "reconnecting" message in lower left corner
            document.body.classList.add('offline');
            document.body.classList.remove('online');
            document.body.classList.add('reconnected'); // this will trigger the animation once we get "online" class added back on reconnect

            const container = document.getElementById('player1') as HTMLElement;
            patch(container, h('i-side.online#player1', {class: {"icon": true, "icon-online": false, "icon-offline": true}}));
        };

        this.sock = newWebsocket('wsr/' + this.gameId);
        this.sock.onopen = () => onOpen();
        this.sock.onreconnect = () => onReconnect();
        this.sock.onmessage = (e: MessageEvent) => this.onMessage(e);

        this.assetURL = model["assetURL"];
        this.byoyomiPeriod = Number(model["byo"]);
        this.byoyomi = this.variant.rules.defaultTimeControl === 'byoyomi';
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
        this.clockOn = (Number(parts[parts.length - 1]) >= 2) && !this.corr;

        const berserkId = (this.mycolor === "white") ? "wberserk" : "bberserk";
        // Not berserked yet, but allowed to do it
        this.berserkable = !this.spectator && this.tournamentGame && this.base > 0 && !this.berserked[berserkId];

        this.chessground.set({
            orientation: this.mycolor,
            turnColor: this.turnColor,
            autoCastle: this.variant.name !== 'cambodian', // TODO make more generic
        });

        if (this.spectator) {
            this.chessground.set({
                //viewOnly: false,
                movable: { free: false, color: undefined },
                draggable: { enabled: false },
                premovable: { enabled: false },
                events: { move: this.onMove() }
            });
        } else {
            this.chessground.set({
                movable: {
                    free: false,
                    color: (this.variant.rules.setup && this.status === -2) ? undefined : this.mycolor,
                    events: {
                        after: (orig, dest, meta) => this.onUserMove(orig, dest, meta),
                        afterNewPiece: (piece, dest, meta) => this.onUserDrop(piece, dest, meta),
                    }
                },
                premovable: {
                    enabled: true,
                    premoveFunc: premove(this.variant.name, this.chess960, this.variant.board.dimensions),
                    predropFunc: predrop(this.variant.name, this.variant.board.dimensions),
                    events: {
                        set: this.setPremove,
                        unset: this.unsetPremove,
                    }
                },
                events: {
                    move: this.onMove(),
                    dropNewPiece: this.onDrop(),
                    select: this.onSelect(),
                },
            });
        }

        // initialize pockets
        const pocket0 = document.getElementById('pocket0') as HTMLElement;
        const pocket1 = document.getElementById('pocket1') as HTMLElement;
        initPocketRow(this, pocket0, pocket1);

        // initialize users
        const player0 = document.getElementById('rplayer0') as HTMLElement;
        const player1 = document.getElementById('rplayer1') as HTMLElement;
        this.vplayer0 = patch(player0, player('player0', this.titles[0], this.players[0], this.ratings[0], this.level));
        this.vplayer1 = patch(player1, player('player1', this.titles[1], this.players[1], this.ratings[1], this.level));

        if (this.variant.material.showDiff) {
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

        this.clocktimes = [this.base * 1000 * 60, this.base * 1000 * 60]

        // initialize clocks
        if (this.corr) {
            const c0 = new Clock(this.base, 0, 0, document.getElementById('clock0') as HTMLElement, 'clock0', true);
            const c1 = new Clock(this.base, 0, 0, document.getElementById('clock1') as HTMLElement, 'clock1', true);
            this.clocks = [c0, c1];

            this.clocks[0].onTick(this.clocks[0].renderTime);
            this.clocks[1].onTick(this.clocks[1].renderTime);

        } else {

            const c0 = new Clock(this.base, this.inc, this.byoyomiPeriod, document.getElementById('clock0') as HTMLElement, 'clock0', false);
            const c1 = new Clock(this.base, this.inc, this.byoyomiPeriod, document.getElementById('clock1') as HTMLElement, 'clock1', false);
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

            if (!this.spectator && this.rated === CASUAL && this.wtitle !== 'BOT' && this.btitle !== 'BOT') {
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
        }

        // initialize crosstable
        this.ctableContainer = document.querySelector('.ctable-container') as HTMLElement;

        if (model["ct"]) {
            this.ctableContainer = patch(this.ctableContainer, h('div.ctable-container'));
            this.ctableContainer = patch(this.ctableContainer, crosstableView(model["ct"] as CrossTable, this.gameId));
            const panel3 = document.querySelector('.ctable-container') as HTMLElement;
            panel3.style.display = 'block';
        }

        const misc0 = document.getElementById('misc-info0') as HTMLElement;
        const misc1 = document.getElementById('misc-info1') as HTMLElement;

        // initialize material point and counting indicator
        if (this.variant.ui.materialPoint || this.variant.ui.counting) {
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

        if (!this.spectator && !this.corr) {
            if (this.byoyomiPeriod > 0) {
                this.clocks[1].onByoyomi(byoyomiCallback);
            }
            this.clocks[1].onFlag(flagCallback);
        }

        const container = document.getElementById('game-controls') as HTMLElement;
        if (!this.spectator) {
            let buttons = [];
            if (this.variant.rules.duck) {
                buttons.push(h('div#undo'));
            }
            if (!this.tournamentGame) {
                buttons.push(this.buttonAbort());
            }
            buttons.push(h('button#count', _('Count')));
            if (this.variant.rules.pass) {
                buttons.push(h('button#draw', { on: { click: () => this.pass() }, props: { title: _('Pass') } }, _('Pass')));
            } else if (!this.variant.rules.noDrawOffer) {
                buttons.push(h('button#draw', { on: { click: () => this.draw() }, props: { title: _('Draw') } }, h('i', '½')));
            }
            buttons.push(h('button#resign', { on: { click: () => this.resign() }, props: {title: _("Resign")} }, [h('i', {class: {"icon": true, "icon-flag-o": true} } ), ]));
            
            this.gameControls = patch(container, h('div.btn-controls.game', buttons));

            const manualCount = this.variant.ui.counting === 'makruk' && !(this.wtitle === 'BOT' || this.btitle === 'BOT');
            if (!manualCount)
                patch(document.getElementById('count') as HTMLElement, h('div'));
            if (this.corr) {
                const drawEl = document.getElementById("draw") as HTMLInputElement;
                if (drawEl) drawEl.disabled = true;
                const resignEl = document.getElementById("resign") as HTMLInputElement;
                if (resignEl) resignEl.disabled = true;
            }
        } else {
            this.gameControls = patch(container, h('div.btn-controls.game'));
        }

        createMovelistButtons(this);
        this.vmovelist = document.getElementById('movelist') as HTMLElement;

        this.vdialog = patch(document.getElementById('offer-dialog')!, h('div#offer-dialog', ""));

        patch(document.getElementById('roundchat') as HTMLElement, chatView(this, "roundchat"));

        boardSettings.assetURL = this.assetURL;
        boardSettings.updateBoardAndPieceStyles();

        if (model.corrGames.length > 0) {
            const corrGames = JSON.parse(model.corrGames).sort(compareGames(this.username));
            const cgMap: {[gameId: string]: Api} = {};
            handleOngoingGameEvents(this.username, cgMap);

            patch(document.querySelector('.games-container') as HTMLElement, 
                h('games-grid#games', corrGames.flatMap((game: Game) => {
                    if (game.gameId === this.gameId) {
                        return [];
                    } else {
                        return [gameViewPlaying(cgMap, game, this.username)];
                    }
                }))
            )
        }

        this.onMsgBoard(model["board"] as MsgBoard);
    }

    toggleSettings() {
    }

    buttonAbort() {
        return h('button#abort', { on: { click: () => this.abort() }, props: {title: _('Abort')} }, [h('i', {class: {"icon": true, "icon-abort": true} } ), ]);
    }

    toggleOrientation() {
        // TODO: handle berserk
        if (this.tournamentGame && this.ply < 2 && !this.spectator) return;

        super.toggleOrientation()

        boardSettings.updateDropSuggestion();

        // console.log("FLIP");
        if (this.variant.material.showDiff) {
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

        if (this.variant.ui.counting)
            [this.vmiscInfoW, this.vmiscInfoB] = updateCount(this.fullfen, this.vmiscInfoB, this.vmiscInfoW);

        if (this.variant.ui.materialPoint)
            [this.vmiscInfoW, this.vmiscInfoB] = updatePoint(this.variant, this.fullfen, this.vmiscInfoB, this.vmiscInfoW);

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
        this.clocktimes[(color === 'white') ? WHITE : BLACK] = this.base * 1000 * 30;
        sound.berserk();

        const berserkId = (color === "white") ? "wberserk" : "bberserk";
        this.berserked[berserkId] = true;
        const infoContainer = document.getElementById(berserkId) as HTMLElement;
        if (infoContainer) patch(infoContainer, h('icon.icon-berserk'));

        const container = document.getElementById(`berserk${clockIdx}`) as HTMLElement;
        patch(container, h(`div#berserk${clockIdx}.berserked`, [h('button.icon.icon-berserk')]));
    }

    undo = () => {
        this.goPly(this.ply);
    }

    private abort = () => {
        this.doSend({ type: "abort", gameId: this.gameId });
    }

    private takeback = () => {
        this.doSend({ type: "takeback", gameId: this.gameId });
    }

    private draw = () => {
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
        (document.querySelector('.btn-controls.game') as HTMLElement).style.display= "none";
        this.vdialog = patch(this.vdialog, h('div#offer-dialog', [
            h('div.dcontrols', [
                h('div', { class: { reject: true }, on: { click: () => this.rejectDrawOffer() } }, h('i.icon.icon-abort.reject')),
                h('div.text', _("Your opponent offers a draw")),
                h('div', { class: { accept: true }, on: { click: () => this.draw() } }, h('i.icon.icon-check')),
            ])
        ]));
    }

    private rejectCorrMove = () => {
        this.undo();
        this.clearDialog();
    }

    private renderConfirmCorrMove = (callback: any, move: string) => {
        (document.querySelector('.btn-controls.game') as HTMLElement).style.display= "none";
        this.vdialog = patch(this.vdialog, h('div#offer-dialog', [
            h('div.dcontrols', [
                h('div', { class: { reject: true }, on: { click: () => this.rejectCorrMove() } }, h('i.icon.icon-abort.reject')),
                h('div.text', _("Confirm move")),
                h('div', { class: { accept: true }, on: { click: () => callback(move) } }, h('i.icon.icon-check')),
            ])
        ]));
    }

    private setDialog = (message: string) => {
        const gameControlsEl = document.querySelector('.btn-controls.game') as HTMLElement;
        if (gameControlsEl) gameControlsEl.style.display= "none";

        this.vdialog = patch(this.vdialog, h('div#offer-dialog', [
            h('div.dcontrols', [
                h('div', { class: { reject: false } }),
                h('div.text', message),
                h('div', { class: { accept: false } }),
            ])
        ]));
        setTimeout(() => this.clearDialog(), 2000);
    }

    private clearDialog = () => {
        this.vdialog = patch(this.vdialog, h('div#offer-dialog', []));
        const el = document.querySelector('.btn-controls.game') as HTMLElement;
        if (el) el.style.display= "flex";
    }

    private resign = () => {
        const doResign = ( localStorage.getItem("confirmresign") === "false" ) || confirm(_('Are you sure you want to resign?')) 
        if (doResign) {    
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

        chatMessage('_server', message, "roundchat");

        const message1 = _('You can use the arrow buttons (below the board -- scroll down to display) to switch them, then click on the check mark to finalize your decision.');
        chatMessage('_server', message1, "roundchat");

        const message2 = _('To start the game you have to click on the check mark!');
        chatMessage('_server', message2, "roundchat");

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
        (document.querySelector('.btn-controls.game') as HTMLElement).style.display= "none";
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
            } else if (!this.corr) {
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

        if (msg.takeback) latestPly = true;

        if (latestPly) this.ply = msg.ply;

        if (this.ply === 0) {
            if (this.variant.rules.setup) {
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

            if (!this.spectator && this.corr) {
                const drawEl = document.getElementById("draw") as HTMLInputElement;
                if (drawEl) drawEl.disabled = false;
                const resignEl = document.getElementById("resign") as HTMLInputElement;
                if (resignEl) resignEl.disabled = false;
            }
        }

        if (this.ply === 1 || this.ply === 2) {
            this.expiStart = 0;
            this.renderExpiration();
            if (this.ply === 1) {
                this.expiStart = Date.now();
                setTimeout(this.showExpiration, 350);
            }
        }

        // turnColor have to be actualized before setDests() !!!
        const parts = msg.fen.split(" ");
        this.turnColor = parts[1] === "w" ? "white" : "black";
        this.fullfen = msg.fen;
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

        this.clockOn = (Number(msg.ply) >= 2);
        if ((!this.spectator && this.clockOn) || this.tournamentGame) {
            const container = document.getElementById('abort') as HTMLElement;
            if (container) {
                // No takeback for Duck chess, because it already has undo for first leg of moves
                if ((this.wtitle === 'BOT' || this.btitle === 'BOT') && !this.variant.rules.duck) {
                    patch(container, h('button#takeback', { on: { click: () => this.takeback() }, props: {title: _('Propose takeback')} }, [h('i', {class: {"icon": true, "icon-reply": true} } ), ]));
                } else {
                    patch(container, h('div'));
                }
            }
        } else if (!this.spectator && !this.clockOn) {
            const container = document.getElementById('takeback') as HTMLElement;
            if (container) {
                patch(container, this.buttonAbort());
            }
        }

        const lastMove = uci2LastMove(msg.lastMove);
        const step = this.steps[this.steps.length - 1];
        const capture = !!lastMove && ((this.chessground.state.boardState.pieces.get(lastMove[1] as cg.Key) && step.san?.slice(0, 2) !== 'O-') || (step.san?.slice(1, 2) === 'x'));

        if (msg.steps.length === 1 && lastMove && (this.turnColor === this.mycolor || this.spectator)) {
            if (!this.finishedGame) sound.moveSound(this.variant, capture);
        }
        this.checkStatus(msg);
        if (msg.steps.length === 1 && !this.spectator && msg.check && !this.finishedGame) {
            sound.check();
        }

        if (this.variant.ui.counting) {
            this.updateCount(msg.fen);
        }

        if (this.variant.ui.materialPoint) {
            this.updatePoint(msg.fen);
        }

        const oppclock = !this.flipped() ? 0 : 1;
        const myclock = 1 - oppclock;

        this.clocks[0].pause(false);
        this.clocks[1].pause(false);
        if (this.byoyomi && msg.byo) {
            this.clocks[oppclock].byoyomiPeriod = msg.byo[(this.oppcolor === 'white') ? WHITE : BLACK];
            this.clocks[myclock].byoyomiPeriod = msg.byo[(this.mycolor === 'white') ? WHITE : BLACK];
        }

        this.clocks[oppclock].setTime(this.clocktimes[(this.oppcolor === 'white') ? WHITE : BLACK]);
        this.clocks[myclock].setTime(this.clocktimes[(this.mycolor === 'white') ? WHITE : BLACK]);

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
        // console.log("onMsgBoard() this.clockOn && msg.status", this.clockOn, msg.status);
        if (this.spectator) {
            if (latestPly) {
                this.chessground.set({
                    fen: this.fullfen,
                    turnColor: this.turnColor,
                    check: msg.check,
                    lastMove: lastMove,
                    movable: { color: undefined },
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
                            color: (this.variant.rules.setup && this.status === -2) ? undefined : this.mycolor,
                        },
                        check: msg.check,
                        lastMove: lastMove,
                    });

                    // This have to be exactly here (and before this.performPremove as well!!!),
                    // because in case of takeback 
                    // ataxx setDests() needs not just actualized turnColor but
                    // actualized chessground.state.boardState.pieces as well !!!
                    if (this.ffishBoard) {
                        this.ffishBoard.setFen(this.fullfen);
                        this.setDests();
                    }

                    if (!this.focus) this.notifyMsg(`Played ${step.san}\nYour turn.`);

                    // prevent sending premove/predrop when (auto)reconnecting websocked asks server to (re)sends the same board to us
                    // console.log("trying to play premove....");
                    if (this.premove) this.performPremove();
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
                    lastMove: lastMove,
                });

                // This have to be here, because in case of takeback 
                // ataxx setDests() needs not just actualized turnColor but
                // actualized chessground.state.boardState.pieces as well !!!
                if (this.ffishBoard) {
                    this.ffishBoard.setFen(this.fullfen);
                    this.setDests();
                }

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

        if (this.spectator || this.turnColor !== this.mycolor || this.result !== "*" || ply !== this.steps.length - 1) {
            this.chessground.set({ movable: { color: undefined } });
        }

        this.updateMaterial();
    }

    doSendMove(move: string) {
        const send = (move: string) => {
            this.clearDialog();
            let clock_times: Clocks, increment;
            const oppclock = !this.flipped() ? 0 : 1
            const myclock = 1 - oppclock;

            if (!this.corr) {
                // pause() will add increment!
                this.clocks[myclock].pause((this.base === 0 && this.ply < 2) ? false : true);

                let bclock;
                if (!this.flipped()) {
                    bclock = this.mycolor === "black" ? 1 : 0;
                } else {
                    bclock = this.mycolor === "black" ? 0 : 1;
                }
                const wclock = 1 - bclock

                if (!this.berserked[(this.mycolor === "white") ? "wberserk" : "bberserk"]) {
                    increment = (this.inc > 0 && this.ply >= 2 && !this.byoyomi) ? this.inc * 1000 : 0;
                } else {
                    increment = 0;
                }

                const bclocktime = (this.mycolor === "black" && this.preaction) ? this.clocktimes[BLACK] + increment: this.clocks[bclock].duration;
                const wclocktime = (this.mycolor === "white" && this.preaction) ? this.clocktimes[WHITE] + increment: this.clocks[wclock].duration;

                clock_times = [wclocktime, bclocktime];
            } else  {
                clock_times = [0, 0];
                increment = 0;
            }

            this.lastMaybeSentMsgMove = { type: "move", gameId: this.gameId, move: move, clocks: clock_times, ply: this.ply + 1 };
            this.doSend(this.lastMaybeSentMsgMove as JSONObject);

            if (this.preaction) {
                this.clocks[myclock].setTime(this.clocktimes[(this.mycolor === 'white') ? WHITE : BLACK] + increment);
            }
            if (this.clockOn) this.clocks[oppclock].start();
        }

        const confirmCorrMove = localStorage.confirmCorrMove === undefined ? true : localStorage.getItem("confirmCorrMove") === "true";
        if (confirmCorrMove && this.corr) {
            this.renderConfirmCorrMove(send, move);
        } else {
            send(move);
        }
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
                if (countingSide === this.mycolor[0])
                    patch(countButton, h('button#count', { on: { click: () => this.stopCount() }, props: {title: _('Stop counting')}, class: { disabled: !myturn } }, _('Stop')));
                else
                    patch(countButton, h('button#count', { on: { click: () => this.startCount() }, props: {title: _('Start counting')}, class: { disabled: !(myturn && countingSide === '') } }, _('Count')));
            else
                patch(countButton, h('button#count', { props: {title: _('Start counting')}, class: { disabled: true } }, _('Count')));
        }
    }

    private updatePoint = (fen: cg.FEN) => {
        [this.vmiscInfoW, this.vmiscInfoB] = updatePoint(this.variant, fen, this.vmiscInfoW, this.vmiscInfoB);
    }

    private updateMaterial(): void {
        if (this.variant.material.showDiff && this.materialDifference)
            [this.vmaterial0, this.vmaterial1] = updateMaterial(this.variant, this.fullfen, this.vmaterial0, this.vmaterial1, this.flipped(), this.mycolor);
        else
            [this.vmaterial0, this.vmaterial1] = emptyMaterial(this.variant);
    }

    private setPremove = (orig: cg.Orig, dest: cg.Key, metadata?: cg.SetPremoveMetadata) => {
        this.premove = { orig, dest, metadata };
        // console.log("setPremove() to:", orig, dest, meta);
    }

    private unsetPremove = () => {
        this.premove = undefined;
        this.preaction = false;
    }

    private performPremove = () => {
        // const { orig, dest, meta } = this.premove;
        // TODO: promotion?
        // console.log("performPremove()", orig, dest, meta);
        this.chessground.playPremove();
    }

    private renderExpiration = () => {
        // We return sooner in case the client belongs to a spectator or the 
        // game is non tournament game.
        if (this.spectator || !this.tournamentGame) return;
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
            if (!isNaN(secs)) {
                this.expirations[expi] = patch(this.expirations[expi], h('div#expiration-' + position + '.expiration',
                    {class:
                        {emerg, 'bar-glider': this.turnColor === this.mycolor}
                    },
                    [ngettext('%1 second to play the first move', '%1 seconds to play the first move', secs)]
                ));
            }
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

            // prevent sending gameStart message when user just reconnecting
            if (msg.ply === 0) {
                this.doSend({ type: "ready", gameId: this.gameId });
            //    if (this.variant.setup) {
            //        this.doSend({ type: "board", gameId: this.gameId });
            //    }
            }
        }
        // We always need this to get possible moves made while our websocket connection was established
        // fixes https://github.com/gbtami/pychess-variants/issues/962
        this.doSend({ type: "board", gameId: this.gameId });
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

        if (evt.data === '/n') return;
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
