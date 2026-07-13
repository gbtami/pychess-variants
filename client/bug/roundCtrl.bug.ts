import { h, VNode } from 'snabbdom';
import * as Mousetrap from 'mousetrap';
import * as cg from 'chessgroundx/types';

import { _ } from '../i18n';
import { patch } from '../document';
import { PlayersState } from './playersState.bug';
import { RoundControllerBughouseSocket } from './roundCtrl.bug.socket';
import { recordPendingMove } from './pendingMoves.bug';
import { ChatController, chatMessage, chatView } from '../chat';
import { createMovelistButtons, updateMovelist, updateResult, selectMove } from './movelist.bug';
import { Clocks, MsgBoard, MsgGameEnd, MsgMove, MsgNewGame, MsgUserConnected, Step, StepChat } from '../messages';
import {
    MsgUserDisconnected,
    MsgUserPresent,
    MsgDrawOffer,
    MsgDrawRejected,
    MsgRematchOffer,
    MsgRematchRejected,
    MsgUpdateTV,
    MsgGameStart,
    MsgViewRematch,
} from '../roundType';
import { BugBoardName, JSONObject, PyChessModel } from '../types';
import { GameControllerBughouse } from './gameCtrl.bug';
import { BLACK, getTurnColor, uci2LastMove, WHITE } from '../chess';
import { sound, soundThemeSettings } from '../sound';
import { notify } from '../notification';
import { Variant, VARIANTS } from '../variants';
import AnalysisControllerBughouse from '@/bug/analysisCtrl.bug';
import { boardSettings } from '@/boardSettings';
import { ChessgroundController } from '@/cgCtrl';
import { chatMessageBug, resetChat } from '@/bug/chat.bug';
import { confirmDialog } from '@/confirmDialog';

export class RoundControllerBughouse implements ChatController {
    socket: RoundControllerBughouseSocket;

    boardA: GameControllerBughouse;
    boardB: GameControllerBughouse;

    username: string;
    gameId: string;
    readonly anon: boolean;

    steps: Step[];
    ply: number;
    plyA: number = 0;
    plyB: number = 0;

    moveControls: VNode;
    status: number;
    result: string;

    autoPromote: boolean;

    model: PyChessModel;
    playersState: PlayersState;

    base: number;
    inc: number;

    profileid: string;
    level: number;

    vdialog: VNode;
    settings: boolean;
    tv: boolean;
    animation: boolean;
    showDests: boolean;
    handicap: boolean = false;
    focus: boolean;
    finishedGame: boolean;

    vmovelist: VNode | HTMLElement;
    variant: Variant;

    spectator: boolean;

    gameControls: VNode; // todo: usually inherited from gameCtrl - think about some reusable solution (DRY)
    readonly home: string;

    constructor(
        el1: HTMLElement,
        el1Pocket1: HTMLElement,
        el1Pocket2: HTMLElement,
        el2: HTMLElement,
        el2Pocket1: HTMLElement,
        el2Pocket2: HTMLElement,
        model: PyChessModel,
    ) {
        this.model = model;

        this.home = model.home;

        this.status = Number(model['status']);

        this.gameId = model['gameId'] as string;
        this.username = model['username'];
        this.anon = model.anon === 'True';

        this.variant = VARIANTS[model.variant];

        this.focus = !document.hidden;
        document.addEventListener('visibilitychange', () => {
            this.focus = !document.hidden;
        });
        window.addEventListener('blur', () => {
            this.focus = false;
        });
        window.addEventListener('focus', () => {
            this.focus = true;
        });
        //
        this.finishedGame = this.status >= 0;
        this.tv = model['tv'];
        this.profileid = model['profileid'];
        this.level = model['level'];

        this.settings = true;
        this.autoPromote = localStorage.autoPromote === undefined ? false : localStorage.autoPromote === 'true';

        this.base = Number(model['base']);
        this.inc = Number(model['inc']);

        this.steps = [];
        // this.ply = isNaN(model["ply"]) ? 0 : model["ply"];

        this.playersState = new PlayersState(this);

        this.spectator =
            this.playersState.myColor.get('a') === undefined && this.playersState.myColor.get('b') === undefined;

        const flagCallbackA = () => {
            if (this.playersState.myColor.get('a') === this.boardA.turnColor) {
                this.boardA.chessground.stop();
                this.boardB.chessground.stop();
                // console.log("Flag");
                this.socket.doSend({ type: 'flag', gameId: this.gameId });
            }
        };
        const flagCallbackB = () => {
            if (this.playersState.myColor.get('b') === this.boardB.turnColor) {
                this.boardA.chessground.stop();
                this.boardB.chessground.stop();
                // console.log("Flag");
                this.socket.doSend({ type: 'flag', gameId: this.gameId });
            }
        };

        if (!this.spectator) {
            this.playersState.clocks[0].onFlag(flagCallbackA);
            this.playersState.clocks[1].onFlag(flagCallbackA);
            this.playersState.clocksB[0].onFlag(flagCallbackB);
            this.playersState.clocksB[1].onFlag(flagCallbackB);
        }

        const container = document.getElementById('game-controls') as HTMLElement;
        if (!this.spectator) {
            let buttons = [];
            buttons.push(h('button#count', _('Count')));
            buttons.push(
                h('button#draw', { on: { click: () => this.draw() }, props: { title: _('Draw') } }, [h('i', '½')]),
            );
            buttons.push(
                h('button#resign', { on: { click: () => this.resign() }, props: { title: _('Resign') } }, [
                    h('i', { class: { icon: true, 'icon-flag-o': true } }),
                ]),
            );

            this.gameControls = patch(container, h('div.btn-controls', buttons));

            patch(document.getElementById('count') as HTMLElement, h('div'));
        } else {
            this.gameControls = patch(container, h('div.btn-controls'));
        }

        //////////////

        this.boardA = new GameControllerBughouse(el1, el1Pocket1, el1Pocket2, 'a', model);
        this.boardB = new GameControllerBughouse(el2, el2Pocket1, el2Pocket2, 'b', model);
        this.boardA.partnerCC = this.boardB;
        this.boardB.partnerCC = this.boardA;
        this.boardA.parent = this;
        this.boardB.parent = this;

        ///////
        // todo: redundant setting turnColor here. It will be overwritten a moment later in onMsgBoard which is
        //       important and more correct in case of custom fen with black to move
        this.boardA.chessground.set({
            orientation:
                this.playersState.myColor.get('a') === 'white' ||
                this.playersState.partnerColor.get('a') === 'white' ||
                this.spectator
                    ? 'white'
                    : 'black',
            turnColor: 'white',
            movable: {
                color:
                    this.playersState.myColor.get('a') === 'white'
                        ? 'white'
                        : this.playersState.myColor.get('a') === 'black'
                          ? 'black'
                          : undefined,
            },
            autoCastle: true,
        });
        this.boardB.chessground.set({
            orientation:
                this.playersState.myColor.get('b') === 'white' || this.playersState.partnerColor.get('b') === 'white'
                    ? 'white'
                    : 'black',
            turnColor: 'white',
            movable: {
                color:
                    this.playersState.myColor.get('b') === 'white'
                        ? 'white'
                        : this.playersState.myColor.get('b') === 'black'
                          ? 'black'
                          : undefined,
            },
            autoCastle: true,
        });

        ////////////
        createMovelistButtons(this);
        this.vmovelist = document.getElementById('movelist') as HTMLElement;

        this.vdialog = patch(document.getElementById('offer-dialog')!, h('div#offer-dialog', ''));

        // todo: if spectator do not render buttons, also good to render all player's messages for specatotors to see
        //       all communication as it happens. However not sure how this can be combined with usual spectators chat
        //       without becoming a bit messy, but maybe it is ok.
        patch(document.getElementById('bugroundchat') as HTMLElement, chatView(this, 'bugroundchat'));

        /////////////////
        // const amISimuling = this.mycolor.get('a') !== undefined && this.mycolor.get('b') !== undefined;
        // const distinctOpps = new Set([this.wplayer, this.bplayer, this.wplayerB, this.bplayerB].filter((e) => e !== this.username));
        // const isOppSimuling = distinctOpps.size === 1;
        if (this.playersState.myColor.get('a') === undefined && !this.spectator) {
            // I am not playing on board A at all. Switch:
            this.switchBoards();
        }

        initBoardSettings(this.boardA, this.boardB, this.variant);

        // last so when it receive initial messages on connect all dom is ready to be updated
        this.socket = new RoundControllerBughouseSocket(this);

        Mousetrap.bind('left', () => selectMove(this, this.ply - 1));
        Mousetrap.bind('right', () => selectMove(this, this.ply + 1));
        Mousetrap.bind('up', () => selectMove(this, 0));
        Mousetrap.bind('down', () => selectMove(this, this.steps.length - 1));
        Mousetrap.bind('f', () => this.flipBoards());
        Mousetrap.bind('?', () => this.helpDialog());

        soundThemeSettings.buildBugChatSounds();
    }

    helpDialog() {
        console.log('HELP!');
    }

    // required by the ChatController interface (chatView() calls ctrl.doSend()); forwards to the real implementation
    get doSend() {
        return this.socket.doSend;
    }

    flipBoards = (): void => {
        let infoWrap0 = document.getElementsByClassName('info-wrap0')[0] as HTMLElement;
        let infoWrap0bug = document.getElementsByClassName('info-wrap0 bug')[0] as HTMLElement;
        let infoWrap1 = document.getElementsByClassName('info-wrap1')[0] as HTMLElement;
        let infoWrap1bug = document.getElementsByClassName('info-wrap1 bug')[0] as HTMLElement;

        let a = infoWrap0!.style.gridArea || 'clock-top';
        infoWrap0!.style.gridArea = infoWrap1!.style.gridArea || 'clock-bot';
        infoWrap1!.style.gridArea = a;
        a = infoWrap0bug!.style.gridArea || 'clockB-top';
        infoWrap0bug!.style.gridArea = infoWrap1bug!.style.gridArea || 'clockB-bot';
        infoWrap1bug!.style.gridArea = a;

        this.boardA.toggleOrientation();
        this.boardB.toggleOrientation();
    };

    switchBoards = (): void => {
        switchBoards(this);

        let infoWrap0 = document.getElementsByClassName('info-wrap0')[0] as HTMLElement;
        let infoWrap0bug = document.getElementsByClassName('info-wrap0 bug')[0] as HTMLElement;
        let infoWrap1 = document.getElementsByClassName('info-wrap1')[0] as HTMLElement;
        let infoWrap1bug = document.getElementsByClassName('info-wrap1 bug')[0] as HTMLElement;

        let a = infoWrap0!.style.gridArea || 'clock-top';
        infoWrap0!.style.gridArea = infoWrap0bug!.style.gridArea || 'clockB-top';
        infoWrap0bug!.style.gridArea = a;
        a = infoWrap1!.style.gridArea || 'clock-bot';
        infoWrap1!.style.gridArea = infoWrap1bug!.style.gridArea || 'clockB-bot';
        infoWrap1bug!.style.gridArea = a;
    };

    sendMove = (b: GameControllerBughouse, move: string) => {
        console.log(b, move);
        this.clearDialog();

        //moveColor is "my color" on that board
        const moveColor = this.playersState.myColor.get(b.boardName as BugBoardName) === 'black' ? 'black' : 'white';

        const oppclock = b.chessground.state.orientation === moveColor ? 0 : 1; // only makes sense when board is flipped which not supported in gameplay yet and itself only makes sense in spectators mode todo: also switching boards to be implemented
        const myclock = 1 - oppclock;

        const clocksInQuestion = b.boardName === 'a' ? this.playersState.clocks : this.playersState.clocksB;
        clocksInQuestion[myclock].pause(true);

        const increment = this.inc > 0 ? this.inc * 1000 : 0;
        const bclocktime =
            moveColor === 'black' && b.preaction
                ? this.playersState.clocktimes[BLACK] + increment
                : this.playersState.getClock('a', 'black').duration;
        const wclocktime =
            moveColor === 'white' && b.preaction
                ? this.playersState.clocktimes[WHITE] + increment
                : this.playersState.getClock('a', 'white').duration;
        const bclocktimeB =
            moveColor === 'black' && b.preaction
                ? this.playersState.clocktimesB[BLACK] + increment
                : this.playersState.getClock('b', 'black').duration;
        const wclocktimeB =
            moveColor === 'white' && b.preaction
                ? this.playersState.clocktimesB[WHITE] + increment
                : this.playersState.getClock('b', 'white').duration;

        const msgClocks = [wclocktime, bclocktime];
        const msgClocksB = [wclocktimeB, bclocktimeB];

        const moveMsg = {
            type: 'move',
            gameId: this.gameId,
            move: move,
            clocks: msgClocks,
            clocksB: msgClocksB,
            ply: this.ply + 1,
            board: b.boardName,
        } as MsgMove;

        recordPendingMove(this.gameId, moveMsg);

        this.socket.doSend(moveMsg as JSONObject);
        clocksInQuestion[oppclock].start();
    };

    private draw = async () => {
        // console.log("Draw");
        const confirmed = await confirmDialog({
            text: _('Are you sure you want to draw?'),
            confirmText: _('Offer draw'),
            cancelText: _('Cancel'),
        });
        if (!confirmed) return;
        this.socket.doSend({ type: 'draw', gameId: this.gameId });
        this.setDialog(_('Draw offer sent'));
    };
    //
    private rejectDrawOffer = () => {
        this.socket.doSend({ type: 'reject_draw', gameId: this.gameId });
        this.clearDialog();
    };
    //
    private renderDrawOffer = () => {
        this.vdialog = patch(
            this.vdialog,
            h('div#offer-dialog', [
                h('div.dcontrols', [
                    h(
                        'div',
                        { class: { reject: true }, on: { click: () => this.rejectDrawOffer() } },
                        h('i.icon.icon-abort.reject'),
                    ),
                    h('div.text', _('Your opponent offers a draw')),
                    h('div', { class: { accept: true }, on: { click: () => this.draw() } }, h('i.icon.icon-check')),
                ]),
            ]),
        );
    };
    //
    private setDialog = (message: string) => {
        this.vdialog = patch(
            this.vdialog,
            h('div#offer-dialog', [
                h('div.dcontrols', [
                    h('div', { class: { reject: false } }),
                    h('div.text', message),
                    h('div', { class: { accept: false } }),
                ]),
            ]),
        );
    };
    //
    private clearDialog = () => {
        this.vdialog = patch(this.vdialog, h('div#offer-dialog', []));
    };

    //
    private resign = async () => {
        // console.log("Resign");
        const confirmed = await confirmDialog({
            text: _('Are you sure you want to resign?'),
            confirmText: _('Resign'),
            cancelText: _('Cancel'),
            danger: true,
        });
        if (!confirmed) return;
        this.socket.doSend({ type: 'resign', gameId: this.gameId });
    };

    private notifyMsg = (msg: string) => {
        if (this.status >= 0) return;

        const opp_name =
            this.username === this.playersState.wplayer ? this.playersState.bplayer : this.playersState.wplayer;
        const logoUrl = `${this.home}/static/favicon/android-icon-192x192.png`;
        notify('pychess.org', { body: `${opp_name}\n${msg}`, icon: logoUrl });
    };

    onMsgGameStart = (msg: MsgGameStart) => {
        // console.log("got gameStart msg:", msg);
        if (msg.gameId !== this.gameId) return;
        if (!this.spectator) {
            sound.genericNotify();
            if (!this.focus) this.notifyMsg('joined the game.');
        }
    };
    //
    onMsgNewGame = (msg: MsgNewGame) => {
        window.location.assign(this.home + '/' + msg['gameId']);
    };

    onMsgViewRematch = (msg: MsgViewRematch) => {
        const btns_after = document.querySelector('.btn-controls.after') as HTMLElement;
        let rematch_button = h(
            'button.newopp',
            { on: { click: () => window.location.assign(this.home + '/' + msg['gameId']) } },
            _('VIEW REMATCH'),
        );
        let rematch_button_location = btns_after!.insertBefore(document.createElement('div'), btns_after!.firstChild);
        patch(rematch_button_location, rematch_button);
    };
    //
    private rematch = () => {
        this.socket.doSend({ type: 'rematch', gameId: this.gameId, handicap: this.handicap });
        this.setDialog(_('Rematch offer sent'));
    };
    //
    private rejectRematchOffer = () => {
        this.socket.doSend({ type: 'reject_rematch', gameId: this.gameId });
        this.clearDialog();
    };
    //
    private renderRematchOffer = () => {
        this.vdialog = patch(
            this.vdialog,
            h('div#offer-dialog', [
                h('div.dcontrols', [
                    h(
                        'div',
                        { class: { reject: true }, on: { click: () => this.rejectRematchOffer() } },
                        h('i.icon.icon-abort.reject'),
                    ),
                    h('div.text', _('Your opponent offers a rematch')),
                    h('div', { class: { accept: true }, on: { click: () => this.rematch() } }, h('i.icon.icon-check')),
                ]),
            ]),
        );
    };
    //
    private newOpponent = (home: string) => {
        this.socket.doSend({ type: 'leave', gameId: this.gameId });
        window.location.assign(home);
    };
    //
    private analysis = (home: string) => {
        window.location.assign(home + '/' + this.gameId + '?ply=' + this.ply.toString());
    };

    private gameOver = () => {
        this.gameControls = patch(this.gameControls, h('div'));
        let buttons: VNode[] = [];
        if (!this.spectator) {
            buttons.push(h('button.rematch', { on: { click: () => this.rematch() } }, _('REMATCH')));
            buttons.push(h('button.newopp', { on: { click: () => this.newOpponent(this.home) } }, _('NEW OPPONENT')));
        }
        buttons.push(h('button.analysis', { on: { click: () => this.analysis(this.home) } }, _('ANALYSIS BOARD')));
        patch(this.gameControls, h('div.btn-controls.after', buttons));
    };

    checkStatus = (msg: MsgBoard | MsgGameEnd) => {
        console.log(msg);
        if (msg.gameId !== this.gameId) return;
        if (msg.status >= 0) {
            // game over
            this.status = msg.status;
            this.result = msg.result;
            this.playersState.clocks[0].pause(false);
            this.playersState.clocks[1].pause(false);
            this.playersState.clocksB[0].pause(false);
            this.playersState.clocksB[1].pause(false);
            // this.dests = new Map();

            if (this.result !== '*' && !this.spectator && !this.finishedGame) {
                sound.gameEndSoundBughouse(msg.result, this.playersState.whichTeamAmI());
            }
            selectMove(this, this.steps.length - 1); // show final position (also important to disable cg's movable)
            updateResult(this);
            this.gameOver();

            // clean up gating/promotion widget left over the ground while game ended by time out
            const container = document.getElementById('extension_choice') as HTMLElement;
            if (container instanceof Element) patch(container, h('extension'));

            if (this.tv) {
                setInterval(() => {
                    this.socket.doSend({ type: 'updateTV', gameId: this.gameId, profileId: this.profileid });
                }, 2000);
            }

            this.clearDialog();
        }
    };

    onMsgUpdateTV = (msg: MsgUpdateTV) => {
        console.log(msg); // todo: tv for bug not supported
    };

    private updateSteps = (full: boolean, steps: Step[], ply: number, latestPly: boolean) => {
        if (full) {
            // all steps in one message
            this.steps = [];
            this.plyA = 0;
            this.plyB = 0;
            resetChat();
            const container = document.getElementById('movelist') as HTMLElement;
            patch(container, h('div#movelist'));

            steps.forEach((step, idx) => {
                if (idx > 0) {
                    //skip first dummy element
                    if (step.boardName === 'a') {
                        this.plyA++;
                    } else {
                        this.plyB++;
                    }
                } else {
                    chatMessage(
                        '',
                        'Messages visible to all 4 players for the first 4 moves',
                        'bugroundchat',
                        undefined,
                        undefined,
                        this,
                    );
                }
                step.plyA = this.plyA;
                step.plyB = this.plyB;
                this.steps.push(step);
                if (idx === 4) {
                    chatMessage('', 'Chat visible only to your partner', 'bugroundchat', undefined, idx, this);
                }
                if (step.chat) {
                    step.chat.forEach(c => {
                        // Check if status < 0 and filter only partners messages
                        const myTeam =
                            this.playersState.whichTeamAmI() === '1'
                                ? this.playersState.teamFirst
                                : this.playersState.teamSecond;
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
                    chatMessage(
                        '',
                        'Game over. All messages visible to all.',
                        'bugroundchat',
                        undefined,
                        this.steps.length,
                        this,
                    );
                }
            });
            updateMovelist(this, true, true, false);
        } else {
            // single step message
            if (ply === this.steps.length) {
                if (ply > 0) {
                    //skip first dummy element
                    if (steps[0].boardName === 'a') {
                        this.plyA++;
                    } else {
                        this.plyB++;
                    }
                } else {
                    chatMessage(
                        '',
                        'Messages visible to all 4 players for the first 4 moves',
                        'bugroundchat',
                        undefined,
                        undefined,
                        this,
                    );
                }
                steps[0].plyA = this.plyA;
                steps[0].plyB = this.plyB;
                this.steps.push(steps[0]);
                const full = false;
                const activate = !this.spectator || latestPly;
                const result = false;
                updateMovelist(this, full, activate, result);
                if (this.steps.length === 5) {
                    chatMessage('', 'Chat visible only to your partner', 'bugroundchat', undefined, ply, this);
                }
            }
        }
    };

    private updateBoardsAndClocksSpectors = (
        board: GameControllerBughouse,
        fen: cg.FEN,
        fenPartner: cg.FEN,
        lastStepA: Step,
        lastStepB: Step,
        msgClocks: Clocks,
        latestPly: boolean,
        colors: cg.Color[],
        status: number,
        check: boolean,
    ) => {
        console.log(
            'updateBoardsAndClocksSpectors',
            board,
            fen,
            fenPartner,
            lastStepA,
            lastStepB,
            msgClocks,
            latestPly,
            colors,
            status,
            check,
        );

        if (!this.spectator) {
            const container = document.getElementById('abort') as HTMLElement;
            if (container) patch(container, h('div'));
        }
        const step = board.boardName === 'a' ? lastStepA : lastStepB;
        const stepPartner = board.boardName === 'b' ? lastStepA : lastStepB;
        const msgTurnColor = getTurnColor(fen); //step.turnColor; // whose turn it is after this move

        // todo: same clock logic also in updateSingleBoardAndClocks - move to reusable method.
        // important we update only the board where the single move happened, the other clock values do not include the
        // time passed since last move on that board, but contain what is last recorded on the server for that board,
        // while the clock values for this move contain what the user making the moves has in their browser, which we
        // consider most accurate

        this.playersState.updateClocks(board.boardName, msgTurnColor, msgClocks, this.status);

        //when message is for opp's move, meaning turnColor is my color - it is now my turn after this message
        if (latestPly) {
            const move = step == undefined ? undefined : board.boardName == 'a' ? step.move : step.moveB;
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
            const movePartner =
                stepPartner == undefined
                    ? undefined
                    : board.partnerCC.boardName == 'a'
                      ? stepPartner.move
                      : stepPartner.moveB;
            board.partnerCC.setState(fenPartner, board.partnerCC.turnColor, uci2LastMove(movePartner));
            board.partnerCC.renderState();
        }
    };

    private updateBothBoardsAndClocksOnFullBoardMsg = (
        lastStepA: Step,
        lastStepB: Step,
        fenA: cg.FEN,
        fenB: cg.FEN,
        clocksA: Clocks,
        clocksB: Clocks,
    ) => {
        console.log('updateBothBoardsAndClocksOnFullBoardMsg', lastStepA, lastStepB, clocksA, clocksB);

        this.boardA.setState(fenA, getTurnColor(fenA), uci2LastMove(lastStepA?.move));
        this.boardA.renderState();
        this.boardB.setState(fenB, getTurnColor(fenB), uci2LastMove(lastStepB?.moveB));
        this.boardB.renderState();

        if (this.status < 0) {
            this.playersState.updateClocks('a', this.boardA.turnColor, clocksA, this.status);
            this.playersState.updateClocks('b', this.boardB.turnColor, clocksB, this.status);
        } else {
            // // TODO: this logic differs than single board games and lichess - not sure if to preserve+improve or remove
            // //       for finished games they dont update clocks according to move times of last moves and here i do
            // if (lastStepA) {
            //     this.playersState.updateClocks("a", this.b1.turnColor, lastStepA.clocks!, this.status);
            // }
            // if (lastStepB) {
            //     this.playersState.updateClocks("b", this.b2.turnColor, lastStepB.clocks!, this.status);
            // }
        }

        // prevent sending premove/predrop when (auto)reconnecting websocked asks server to (re)sends the same board to us
        // console.log("trying to play premove....");
        if (this.boardA.premove && this.boardA.turnColor == this.playersState.myColor.get('a'))
            this.boardA.performPremove();
        if (this.boardB.premove && this.boardB.turnColor == this.playersState.myColor.get('b'))
            this.boardB.performPremove();
    };

    private updateSingleBoardAndClocks = (
        board: GameControllerBughouse,
        fen: cg.FEN,
        fenPartner: cg.FEN,
        lastStepA: Step,
        lastStepB: Step,
        msgClocks: Clocks,
        latestPly: boolean,
        colors: cg.Color[],
        status: number,
        check: boolean,
    ) => {
        console.log(
            'updateSingleBoardAndClocks',
            board,
            fen,
            fenPartner,
            lastStepA,
            lastStepB,
            msgClocks,
            latestPly,
            colors,
            status,
            check,
        );

        const step = board.boardName === 'a' ? lastStepA : lastStepB;
        const stepPartner = board.boardName === 'b' ? lastStepA : lastStepB;
        const msgTurnColor = step.turnColor; // whose turn it is after this move
        const msgMoveColor = msgTurnColor === 'white' ? 'black' : 'white'; // which color made the move
        const myMove = this.playersState.myColor.get(board.boardName as BugBoardName) === msgMoveColor; // the received move was made by me

        const move = board.boardName === 'a' ? step.move : step.moveB;
        const lastMove = uci2LastMove(move);
        const lastMovePartner = stepPartner
            ? uci2LastMove(board.partnerCC.boardName === 'a' ? stepPartner.move : stepPartner.moveB)
            : undefined;

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
            this.playersState.updateClocks(board.boardName, msgTurnColor, msgClocks, this.status);

            //when message is for opp's move, meaning turnColor is my color - it is now my turn after this message
            if (latestPly) {
                board.setState(fen, board.turnColor === 'white' ? 'black' : 'white', lastMove);
                board.renderState();

                // because pocket might have changed. todo: condition it on if(capture) maybe
                const messageFenPartnerSplit = fenPartner.split(/[\[\]]/);
                const currentFenPartnerSplit = board.partnerCC.fullfen.split(/[\[\]]/);
                const newFen =
                    currentFenPartnerSplit[0] + '[' + messageFenPartnerSplit[1] + ']' + currentFenPartnerSplit[2];
                board.partnerCC.setState(newFen, board.partnerCC.turnColor, lastMovePartner);
                board.partnerCC.renderState();

                if (!this.focus) this.notifyMsg(`Played ${step.san}\nYour turn.`);

                if (board.premove) board.performPremove();
            }
        } else {
            //when message is about the move i just made
            // if this clock is still running, sendMove() never got to pause it locally in this
            // session (e.g. this is confirming a move resent after a reconnect/refresh) - sync
            // from the server now instead of leaving it stuck in whatever state the earlier
            // full-board snapshot left it in.
            if (this.playersState.getClock(board.boardName, msgMoveColor).running) {
                this.playersState.updateClocks(board.boardName, msgTurnColor, msgClocks, this.status);
            }
            board.setState(fen, board.turnColor === 'white' ? 'black' : 'white', lastMove);
            board.renderState();

            // because pocket might have changed. todo: condition it on if(capture) maybe
            board.partnerCC.setState(fenPartner, board.partnerCC.turnColor, board.partnerCC.lastmove);
            board.partnerCC.renderState();
        }
    };

    onMsgBoard = (msg: MsgBoard) => {
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
        latestPly = isInitialBoardMessage || msg.ply === this.ply + 1 || (full && msg.ply > this.ply);

        if (latestPly) this.ply = msg.ply;

        this.result = msg.result;
        this.status = msg.status;

        this.updateSteps(full, msg.steps, msg.ply, latestPly);
        this.checkStatus(msg);

        //
        const lastStep = this.steps[this.steps.length - 1];

        const lastStepA = this.steps[this.steps.findLastIndex(s => s.boardName === 'a')];
        const lastStepB = this.steps[this.steps.findLastIndex(s => s.boardName === 'b')];

        if (isInitialBoardMessage || full) {
            // reconnect after lost ws connection or refresh
            if (this.spectator) {
                this.updateBoardsAndClocksSpectors(
                    this.boardA,
                    lastStep.fen,
                    lastStep.fenB!,
                    lastStepA,
                    lastStepB,
                    msg.clocks!,
                    latestPly,
                    this.playersState.colors,
                    msg.status,
                    msg.check,
                );
                this.updateBoardsAndClocksSpectors(
                    this.boardB,
                    lastStep.fenB!,
                    lastStep.fen,
                    lastStepA,
                    lastStepB,
                    msg.clocksB!,
                    latestPly,
                    this.playersState.colorsB,
                    msg.status,
                    msg.checkB!,
                );
            } else {
                this.updateBothBoardsAndClocksOnFullBoardMsg(
                    lastStepA,
                    lastStepB,
                    lastStep.fen,
                    lastStep.fenB!,
                    msg.clocks!,
                    msg.clocksB!,
                );
            }
        } else {
            const boardName = msg.steps[msg.steps.length - 1].boardName as BugBoardName;
            const board = boardName === 'a' ? this.boardA : this.boardB;
            const colors = boardName === 'a' ? this.playersState.colors : this.playersState.colorsB;
            const check = boardName == 'a' ? msg.check : msg.checkB!;
            const clocks = boardName == 'a' ? msg.clocks : msg.clocksB!;
            const fen = boardName == 'a' ? lastStep.fen : lastStep.fenB!;
            const fenPartner = boardName == 'a' ? lastStep.fenB! : lastStep.fen;
            if (this.spectator) {
                this.updateBoardsAndClocksSpectors(
                    board,
                    fen,
                    fenPartner,
                    lastStepA,
                    lastStepB,
                    clocks!,
                    latestPly,
                    colors,
                    msg.status,
                    check,
                );
            } else {
                this.updateSingleBoardAndClocks(
                    board,
                    fen,
                    fenPartner,
                    lastStepA,
                    lastStepB,
                    clocks!,
                    latestPly,
                    colors,
                    msg.status,
                    check,
                );
            }
        }
    };

    goPly = (ply: number) => {
        console.log('RoundControllerBughouse.goPly ' + ply);

        const step = this.steps[ply];
        console.log(step);

        const board = step.boardName === 'a' ? this.boardA : this.boardB;

        const fen = step.boardName === 'a' ? step.fen : step.fenB;
        const fenPartner = step.boardName === 'b' ? step.fen : step.fenB;

        const move = step.boardName === 'a' ? uci2LastMove(step.move) : uci2LastMove(step.moveB);
        const movePartner = step.boardName === 'b' ? uci2LastMove(step.move) : uci2LastMove(step.moveB);

        let capture = false;
        if (move) {
            // 960 king takes rook castling is not capture
            // TODO defer this logic to ffish.js
            capture =
                (board.chessground.state.boardState.pieces.get(move[1] as cg.Key) !== undefined &&
                    step.san?.slice(0, 2) !== 'O-') ||
                step.san?.slice(1, 2) === 'x';
        }

        board.partnerCC.setState(fenPartner!, getTurnColor(fenPartner!), movePartner);
        board.partnerCC.renderState();

        board.setState(fen!, getTurnColor(fen!), move);
        board.renderState();

        if (this.status >= 0 || ply !== this.steps.length - 1) {
            board.chessground.set({ movable: { color: undefined, dests: undefined } });
            board.partnerCC.chessground.set({ movable: { color: undefined, dests: undefined } });
        } else if (ply === this.steps.length - 1) {
            if (this.playersState.myColor.has('a')) {
                this.boardA.setDests();
                this.boardA.chessground.set({ movable: { color: this.playersState.myColor.get('a') } });
            }
            if (this.playersState.myColor.has('b')) {
                this.boardB.setDests();
                this.boardB.chessground.set({ movable: { color: this.playersState.myColor.get('b') } });
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

        if (ply === this.ply + 1) {
            // no sound if we are scrolling backwards
            sound.moveSound(board.variant, capture);
        }
        this.ply = ply;
    };

    onMsgUserConnected = (msg: MsgUserConnected) => {
        console.log(msg);
        if (!this.spectator) {
            const container = document.getElementById('player1a') as HTMLElement;
            patch(
                container,
                h('i-side.online#player1a', { class: { icon: true, 'icon-online': true, 'icon-offline': false } }),
            );

            // prevent sending gameStart message when user just reconnecting
            //todo:niki:what is the point of this message - also what if we refresh before moves are made? also what is the point of this whole method at all?
            if (msg.ply === 0) {
                this.socket.doSend({ type: 'ready', gameId: this.gameId });
            }
        }
    };

    onMsgUserPresent = (msg: MsgUserPresent) => {
        console.log(msg);
        if (msg.username === this.playersState.players[0]) {
            const container = document.getElementById('player0a') as HTMLElement;
            patch(
                container,
                h('i-side.online#player0a', { class: { icon: true, 'icon-online': true, 'icon-offline': false } }),
            );
        }
        if (msg.username === this.playersState.players[1]) {
            const container = document.getElementById('player1a') as HTMLElement;
            patch(
                container,
                h('i-side.online#player1a', { class: { icon: true, 'icon-online': true, 'icon-offline': false } }),
            );
        }
        if (msg.username === this.playersState.playersB[0]) {
            const container = document.getElementById('player0b') as HTMLElement;
            patch(
                container,
                h('i-side.online#player0b', { class: { icon: true, 'icon-online': true, 'icon-offline': false } }),
            );
        }
        if (msg.username === this.playersState.playersB[1]) {
            const container = document.getElementById('player1b') as HTMLElement;
            patch(
                container,
                h('i-side.online#player1b', { class: { icon: true, 'icon-online': true, 'icon-offline': false } }),
            );
        }
    };

    onMsgUserDisconnected = (msg: MsgUserDisconnected) => {
        console.log(msg);
        if (msg.username === this.playersState.players[0]) {
            const container = document.getElementById('player0a') as HTMLElement;
            patch(
                container,
                h('i-side.online#player0a', { class: { icon: true, 'icon-online': false, 'icon-offline': true } }),
            );
        } else if (msg.username === this.playersState.players[1]) {
            const container = document.getElementById('player1a') as HTMLElement;
            patch(
                container,
                h('i-side.online#player1a', { class: { icon: true, 'icon-online': false, 'icon-offline': true } }),
            );
        }
        if (msg.username === this.playersState.playersB[0]) {
            const container = document.getElementById('player0b') as HTMLElement;
            patch(
                container,
                h('i-side.online#player0b', { class: { icon: true, 'icon-online': false, 'icon-offline': true } }),
            );
        } else if (msg.username === this.playersState.playersB[1]) {
            const container = document.getElementById('player1b') as HTMLElement;
            patch(
                container,
                h('i-side.online#player1b', { class: { icon: true, 'icon-online': false, 'icon-offline': true } }),
            );
        }
    };

    onMsgDrawOffer = (msg: MsgDrawOffer) => {
        chatMessage('', msg.message, 'bugroundchat');
        if (!this.spectator && msg.username !== this.username) this.renderDrawOffer();
    };

    onMsgDrawRejected = (msg: MsgDrawRejected) => {
        chatMessage('', msg.message, 'bugroundchat');
        // this.clearDialog();
    };

    onMsgRematchOffer = (msg: MsgRematchOffer) => {
        chatMessage('', msg.message, 'bugroundchat');
        if (!this.spectator && msg.username !== this.username) this.renderRematchOffer();
    };

    onMsgRematchRejected = (msg: MsgRematchRejected) => {
        chatMessage('', msg.message, 'bugroundchat');
        // this.clearDialog();
    };

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

    onMsgChat = (msg: StepChat) => {
        if (
            this.spectator /*spectators always see everything*/ ||
            (!this.spectator && msg.room !== 'spectator') ||
            msg.username.length === 0
        ) {
            chatMessageBug(this.ply, this, msg);
            if (msg.username !== this.username && msg.message.startsWith('!bug!')) {
                sound.bugChatSound(msg.message.replace('!bug!', ''));
            }
        }
    };
}

export function swap(nodeA: HTMLElement, nodeB: HTMLElement) {
    const parentA = nodeA.parentNode;
    const siblingA = nodeA.nextSibling === nodeB ? nodeA : nodeA.nextSibling;

    // Move `nodeA` to before the `nodeB`
    nodeB.parentNode!.insertBefore(nodeA, nodeB);

    // Move `nodeB` to before the sibling of `nodeA`
    parentA!.insertBefore(nodeB, siblingA);
}

export function switchBoards(ctrl: RoundControllerBughouse | AnalysisControllerBughouse) {
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

    let a = mainboardVNode!.style.gridArea || 'board';
    mainboardVNode!.style.gridArea = bugboardVNode!.style.gridArea || 'boardPartner';
    bugboardVNode!.style.gridArea = a;

    swap(mainboardPocket0!, bugboardPocket0!);
    swap(mainboardPocket1!, bugboardPocket1!);

    ctrl.boardA.chessground.redrawAll();
    ctrl.boardB.chessground.redrawAll();
}

export function initBoardSettings(b1: ChessgroundController, b2: ChessgroundController, variant: Variant) {
    const boardFamily = variant.boardFamily;
    boardSettings.updateZoom(boardFamily, b1.boardName);
    boardSettings.updateZoom(boardFamily, b2.boardName);
}
