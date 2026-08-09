import * as Mousetrap from 'mousetrap';
import * as cg from 'chessgroundx/types';

import { _ } from '../../i18n';
import { RoundSeatView, RoundSeatViews } from './roundSeatView';
import { Seat } from '../common/seat';
import { Clock } from '../../clock';
import { RoundControllerBughouseSocket } from '../socket/sockets';
import { recordPendingMove } from '../socket/pendingMoves';
import { ChatController, chatMessage } from '../../chat';
import { updateMovelist, updateResult, selectMove, MovelistView } from '../common/movelist';
import { GameInfoView } from '../common/gameInfo';
import { Clocks, MsgBoard, MsgGameEnd, MsgMove, MsgNewGame, MsgUserConnected, Step, StepChat } from '../../messages';
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
} from '../../roundType';
import { BoardName, BugBoardName, JSONObject, PyChessModel } from '../../types';
import { GameControllerBughouse } from '../common/gameCtrl';
import { BLACK, WHITE, getTurnColor, uci2LastMove } from '../../chess';
import { sound, soundThemeSettings } from '../../sound';
import { notify } from '../../notification';
import { chatMessageBug, resetChat } from '@/two-board/round/chat';
import { confirmDialog } from '@/confirmDialog';
import { TwoBoardController, initBoardSettings } from '../twoBoardCtrl';
import {
    RoundControlsView,
    renderRoundChat,
    resetMovelistDom,
    clearExtensionChoice,
    clearAbortIndicator,
    insertRematchButton,
    swapClockGridAreasForFlip,
    swapClockGridAreasForSwitch,
} from './roundControls';
import {
    buildGameKeyboardHelpSections,
    hideGameKeyboardHelp,
    isKeyboardHelpShortcut,
    showGameKeyboardHelp,
} from '../../gameKeyboardHelp';

// live remaining time of a clock, whether or not it is currently running (mirrors Clock's own tick math)
const liveTime = (clock: Clock) => (clock.running ? clock.duration - (Date.now() - clock.startTime) : clock.duration);

export class RoundControllerBughouse extends TwoBoardController implements ChatController {
    socket: RoundControllerBughouseSocket;

    readonly anon: boolean;

    autoPromote: boolean;

    private readonly seatViews: RoundSeatViews;
    // color rendered at the top (position 0) of each board. This represents only the
    // initial positioning on the screen: flip/switch only move html elements around,
    // so these remain constant throughout the whole game.
    private readonly topColor: Record<BugBoardName, cg.Color>;

    profileid: string;
    level: number;

    tv: boolean;
    handicap: boolean = false;
    focus: boolean;
    finishedGame: boolean;

    spectator: boolean;

    controlsView: RoundControlsView;

    keyboardHelpOpen: boolean;
    private readonly onKeyboardHelpKeyDown: (event: KeyboardEvent) => void;

    constructor(
        el1: HTMLElement,
        el1Pocket1: HTMLElement,
        el1Pocket2: HTMLElement,
        el2: HTMLElement,
        el2Pocket1: HTMLElement,
        el2Pocket2: HTMLElement,
        model: PyChessModel,
        movelistView: MovelistView,
        gameInfoView: GameInfoView,
        seatViews: RoundSeatViews,
    ) {
        super(el1, el1Pocket1, el1Pocket2, el2, el2Pocket1, el2Pocket2, model, movelistView, gameInfoView);

        this.anon = model.anon === 'True';

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

        this.autoPromote = localStorage.autoPromote === undefined ? false : localStorage.autoPromote === 'true';

        this.seatViews = seatViews;
        this.topColor = { a: this.seats.initialTopColor('a'), b: this.seats.initialTopColor('b') };

        this.createSeatWidgets();
        this.wireClockDifferences();

        this.spectator = this.seats.isSpectator();

        const flagCallbackA = () => {
            if (this.seats.myColor('a') === this.boardA.turnColor) {
                this.boardA.chessground.stop();
                this.boardB.chessground.stop();
                // console.log("Flag");
                this.socket.doSend({ type: 'flag', gameId: this.gameId });
            }
        };
        const flagCallbackB = () => {
            if (this.seats.myColor('b') === this.boardB.turnColor) {
                this.boardA.chessground.stop();
                this.boardB.chessground.stop();
                // console.log("Flag");
                this.socket.doSend({ type: 'flag', gameId: this.gameId });
            }
        };

        if (!this.spectator) {
            this.seats.seatsOn('a').forEach(s => s.clock!.onFlag(flagCallbackA));
            this.seats.seatsOn('b').forEach(s => s.clock!.onFlag(flagCallbackB));
        }

        this.controlsView = new RoundControlsView();
        this.controlsView.renderInitialGameControls(
            this.spectator,
            () => this.draw(),
            () => this.resign(),
        );

        //////////////
        // todo: redundant setting turnColor here. It will be overwritten a moment later in onMsgBoard which is
        //       important and more correct in case of custom fen with black to move
        const myColorA = this.seats.myColor('a');
        const myColorB = this.seats.myColor('b');
        // my partner's color on one board is the opposite of my color on the other board
        const partnerColorA = myColorB === undefined ? undefined : myColorB === 'white' ? 'black' : 'white';
        const partnerColorB = myColorA === undefined ? undefined : myColorA === 'white' ? 'black' : 'white';
        this.boardA.chessground.set({
            orientation: myColorA === 'white' || partnerColorA === 'white' || this.spectator ? 'white' : 'black',
            turnColor: 'white',
            movable: {
                color: myColorA,
            },
            autoCastle: true,
        });
        this.boardB.chessground.set({
            orientation: myColorB === 'white' || partnerColorB === 'white' ? 'white' : 'black',
            turnColor: 'white',
            movable: {
                color: myColorB,
            },
            autoCastle: true,
        });

        // todo: if spectator do not render buttons, also good to render all player's messages for specatotors to see
        //       all communication as it happens. However not sure how this can be combined with usual spectators chat
        //       without becoming a bit messy, but maybe it is ok.
        renderRoundChat(this);

        /////////////////
        // const amISimuling = this.mycolor.get('a') !== undefined && this.mycolor.get('b') !== undefined;
        // const distinctOpps = new Set([this.wplayer, this.bplayer, this.wplayerB, this.bplayerB].filter((e) => e !== this.username));
        // const isOppSimuling = distinctOpps.size === 1;
        if (this.seats.me('a') === undefined && !this.spectator) {
            // I am not playing on board A at all. Switch:
            this.switchBoards();
        }

        initBoardSettings(this.boardA, this.boardB, this.variant);

        // last so when it receive initial messages on connect all dom is ready to be updated
        this.socket = new RoundControllerBughouseSocket(this);

        this.keyboardHelpOpen = false;
        this.onKeyboardHelpKeyDown = (event: KeyboardEvent) => {
            if (!this.keyboardHelpOpen) return;

            if (event.key === 'Escape' || isKeyboardHelpShortcut(event)) {
                event.preventDefault();
                event.stopPropagation();
                this.closeKeyboardHelp();
                return;
            }

            if (event.key === 'Tab') return;

            event.preventDefault();
            event.stopPropagation();
        };

        Mousetrap.bind('left', () => selectMove(this, this.ply - 1));
        Mousetrap.bind('right', () => selectMove(this, this.ply + 1));
        Mousetrap.bind('up', () => selectMove(this, 0));
        Mousetrap.bind('down', () => selectMove(this, this.steps.length - 1));
        Mousetrap.bind('f', () => this.flipBoards());
        Mousetrap.bind('?', () => this.helpDialog());

        soundThemeSettings.buildBugChatSounds();
    }

    helpDialog() {
        if (this.keyboardHelpOpen) {
            this.closeKeyboardHelp();
        } else {
            this.openKeyboardHelp();
        }
    }

    openKeyboardHelp() {
        this.keyboardHelpOpen = true;
        document.addEventListener('keydown', this.onKeyboardHelpKeyDown, true);
        showGameKeyboardHelp(
            this,
            buildGameKeyboardHelpSections(this, { flipDescription: _('Flip boards') }),
        );
    }

    closeKeyboardHelp() {
        if (!this.keyboardHelpOpen) return;
        this.keyboardHelpOpen = false;
        document.removeEventListener('keydown', this.onKeyboardHelpKeyDown, true);
        hideGameKeyboardHelp();
    }

    private viewAt(position: 0 | 1, board: BugBoardName): RoundSeatView {
        return this.seatViews[board][position];
    }

    private viewOf(seat: Seat): RoundSeatView {
        return this.viewAt(seat.color === this.topColor[seat.boardName] ? 0 : 1, seat.boardName);
    }

    // gives every seat the live clock its view renders into, and paints the player bars
    private createSeatWidgets(): void {
        this.seats.all.forEach(seat => {
            const view = this.viewOf(seat);
            seat.clock = view.createClock(this.base, this.inc);
            view.renderPlayerBar(seat.player, this.level);
        });
    }

    // difference value = this clock's live time minus the live time of the clock of your
    // opponent's partner (the same color, on the other board). Updated on every tick.
    private wireClockDifferences(): void {
        this.seats.all.forEach(seat => {
            seat.clock!.onTick(diff => {
                seat.clock!.renderTime(diff);
                const counterpart = this.seats.opponentsPartnerOf(seat);
                const otherMillis = liveTime(counterpart.clock!);
                this.viewOf(seat).renderDifference(Math.round((diff - otherMillis) / 1000));
                this.viewOf(counterpart).renderDifference(Math.round((otherMillis - diff) / 1000));
            });
        });
    }

    // online/offline indicator on the player bars of every seat this username occupies
    setPresence(username: string, online: boolean): void {
        this.seats.all.filter(s => s.player.username === username).forEach(s => this.viewOf(s).setPresence(online));
    }

    /**
     * @param boardName - for which board we are updating the clocks
     * @param turnColor - whose turn it is after this move - their clock should be started
     * @param status - current game status (needed to know whether the clock should actually start)
     *
     * Stops clock of user how made the move for the board in question,
     * updates the clock times with the new values,
     * starts the clock of the player whose turn is now
     * */
    updateClocks(boardName: BoardName, turnColor: cg.Color, msgClocks: Clocks, status: number) {
        const board = boardName as BugBoardName;
        const whiteClock = this.seats.byBoardAndColor(board, 'white').clock!;
        const blackClock = this.seats.byBoardAndColor(board, 'black').clock!;

        const moverClock = turnColor === 'white' ? blackClock : whiteClock;
        const nextClock = turnColor === 'white' ? whiteClock : blackClock;

        moverClock.pause(false);

        whiteClock.setTime(msgClocks[WHITE]);
        blackClock.setTime(msgClocks[BLACK]);

        if (status < 0) {
            nextClock.start();
        }
    }

    // required by the ChatController interface (chatView() calls ctrl.doSend()); forwards to the real implementation
    get doSend() {
        return this.socket.doSend;
    }

    flipBoards(): void {
        swapClockGridAreasForFlip();
        super.flipBoards();
    }

    switchBoards(): void {
        super.switchBoards();
        swapClockGridAreasForSwitch();
    }

    sendMove = (b: GameControllerBughouse, move: string) => {
        console.log(b, move);
        this.clearDialog();

        //moveColor is "my color" on that board
        const moveColor = this.seats.myColor(b.boardName as BugBoardName) === 'black' ? 'black' : 'white';
        const movedClock = this.seats.byBoardAndColor(b.boardName as BugBoardName, moveColor).clock!;

        // A premove is dispatched the instant the opponent's move lands, so the player is
        // charged nothing for it. Clock.duration is frozen while the clock runs, so before
        // pausing it still holds the time this turn started with; capture that plus the
        // increment and restore it afterwards, since pause() would otherwise deduct the
        // dispatch latency. setTime() also repaints, so what is shown matches what is sent.
        const increment = this.inc > 0 ? this.inc * 1000 : 0;
        const premoveTime = b.preaction ? movedClock.duration + increment : undefined;
        movedClock.pause(true);
        if (premoveTime !== undefined) movedClock.setTime(premoveTime);

        // all those values are generally ignored on the server except the one for the current move which is
        // communicated to the other players and recorded in the server move history
        const msgClocks = [
            this.seats.byBoardAndColor('a', 'white').clock!.duration,
            this.seats.byBoardAndColor('a', 'black').clock!.duration,
        ];
        const msgClocksB = [
            this.seats.byBoardAndColor('b', 'white').clock!.duration,
            this.seats.byBoardAndColor('b', 'black').clock!.duration,
        ];

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
        this.seats
            .byBoardAndColor(b.boardName as BugBoardName, moveColor === 'white' ? 'black' : 'white')
            .clock!.start();
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
        this.controlsView.renderDrawOffer(
            () => this.rejectDrawOffer(),
            () => this.draw(),
        );
    };
    //
    private setDialog = (message: string) => {
        this.controlsView.setDialogMessage(message);
    };
    //
    private clearDialog = () => {
        this.controlsView.clearDialog();
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

        // todo: assumes the viewer plays board A — for a board-B player this names the wrong opponent (preserved quirk)
        const wplayerA = this.seats.byBoardAndColor('a', 'white').player.username;
        const bplayerA = this.seats.byBoardAndColor('a', 'black').player.username;
        const opp_name = this.username === wplayerA ? bplayerA : wplayerA;
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
        insertRematchButton(() => window.location.assign(this.home + '/' + msg['gameId']));
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
        this.controlsView.renderRematchOffer(
            () => this.rejectRematchOffer(),
            () => this.rematch(),
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
        this.controlsView.renderGameOverControls(
            this.spectator,
            () => this.rematch(),
            () => this.newOpponent(this.home),
            () => this.analysis(this.home),
        );
    };

    checkStatus = (msg: MsgBoard | MsgGameEnd) => {
        console.log(msg);
        if (msg.gameId !== this.gameId) return;
        if (msg.status >= 0) {
            // game over
            this.status = msg.status;
            this.result = msg.result;
            this.seats.all.forEach(s => s.clock!.pause(false));
            // this.dests = new Map();

            if (this.result !== '*' && !this.spectator && !this.finishedGame) {
                sound.gameEndSoundBughouse(msg.result, this.seats.myTeam().teamNumber);
            }
            selectMove(this, this.steps.length - 1); // show final position (also important to disable cg's movable)
            updateResult(this);
            this.gameOver();

            // clean up gating/promotion widget left over the ground while game ended by time out
            clearExtensionChoice();

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
            resetMovelistDom();

            steps.forEach((step, idx) => {
                if (idx === 0) {
                    chatMessage(
                        '',
                        'Messages visible to all 4 players for the first 4 moves',
                        'bugroundchat',
                        undefined,
                        undefined,
                        this,
                    );
                }
                this.stampStepPlys(step, idx);
                if (idx === 4) {
                    chatMessage('', 'Chat visible only to your partner', 'bugroundchat', undefined, idx, this);
                }
                if (step.chat) {
                    step.chat.forEach(c => {
                        // Check if status < 0 and filter only partners messages
                        const myTeam = this.seats.myTeam();
                        if (this.status < 0) {
                            if (
                                c.username === myTeam.seats[0].player.username ||
                                c.username === myTeam.seats[1].player.username
                            ) {
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
                if (ply === 0) {
                    chatMessage(
                        '',
                        'Messages visible to all 4 players for the first 4 moves',
                        'bugroundchat',
                        undefined,
                        undefined,
                        this,
                    );
                }
                this.stampStepPlys(steps[0], ply);
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
            status,
            check,
        );

        if (!this.spectator) {
            clearAbortIndicator();
        }
        const step = board.boardName === 'a' ? lastStepA : lastStepB;
        const stepPartner = board.boardName === 'b' ? lastStepA : lastStepB;
        const msgTurnColor = getTurnColor(fen); //step.turnColor; // whose turn it is after this move

        // todo: same clock logic also in updateSingleBoardAndClocks - move to reusable method.
        // important we update only the board where the single move happened, the other clock values do not include the
        // time passed since last move on that board, but contain what is last recorded on the server for that board,
        // while the clock values for this move contain what the user making the moves has in their browser, which we
        // consider most accurate

        this.updateClocks(board.boardName, msgTurnColor, msgClocks, this.status);

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
            this.updateClocks('a', this.boardA.turnColor, clocksA, this.status);
            this.updateClocks('b', this.boardB.turnColor, clocksB, this.status);
        } else {
            // // TODO: this logic differs than single board games and lichess - not sure if to preserve+improve or remove
            // //       for finished games they dont update clocks according to move times of last moves and here i do
            // if (lastStepA) {
            //     this.updateClocks("a", this.b1.turnColor, lastStepA.clocks!, this.status);
            // }
            // if (lastStepB) {
            //     this.updateClocks("b", this.b2.turnColor, lastStepB.clocks!, this.status);
            // }
        }

        // prevent sending premove/predrop when (auto)reconnecting websocked asks server to (re)sends the same board to us
        // console.log("trying to play premove....");
        if (this.boardA.premove && this.boardA.turnColor == this.seats.myColor('a')) this.boardA.performPremove();
        if (this.boardB.premove && this.boardB.turnColor == this.seats.myColor('b')) this.boardB.performPremove();
    };

    private updateSingleBoardAndClocks = (
        board: GameControllerBughouse,
        fen: cg.FEN,
        fenPartner: cg.FEN,
        lastStepA: Step,
        lastStepB: Step,
        msgClocks: Clocks,
        latestPly: boolean,
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
            status,
            check,
        );

        const step = board.boardName === 'a' ? lastStepA : lastStepB;
        const stepPartner = board.boardName === 'b' ? lastStepA : lastStepB;
        const msgTurnColor = step.turnColor; // whose turn it is after this move
        const msgMoveColor = msgTurnColor === 'white' ? 'black' : 'white'; // which color made the move
        const myMove = this.seats.myColor(board.boardName as BugBoardName) === msgMoveColor; // the received move was made by me

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
            this.updateClocks(board.boardName, msgTurnColor, msgClocks, this.status);

            //when message is for opp's move, meaning turnColor is my color - it is now my turn after this message
            if (latestPly) {
                board.setState(fen, board.turnColor === 'white' ? 'black' : 'white', lastMove);
                board.renderState();

                // because pocket might have changed. todo: condition it on if(capture) maybe
                const messageFenPartnerSplit = fenPartner.split(/\[|\]/);
                const currentFenPartnerSplit = board.partnerCC.fullfen.split(/\[|\]/);
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
            if (this.seats.byBoardAndColor(board.boardName as BugBoardName, msgMoveColor).clock!.running) {
                this.updateClocks(board.boardName, msgTurnColor, msgClocks, this.status);
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

        const { board, fen, fenPartner, move, movePartner } = this.goPlyCore(step);

        const capture = this.stepCapture(step, board, move);

        board.partnerCC.setState(fenPartner!, getTurnColor(fenPartner!), movePartner);
        board.partnerCC.renderState();

        board.setState(fen!, getTurnColor(fen!), move);
        board.renderState();

        if (this.status >= 0 || ply !== this.steps.length - 1) {
            board.chessground.set({ movable: { color: undefined, dests: undefined } });
            board.partnerCC.chessground.set({ movable: { color: undefined, dests: undefined } });
        } else if (ply === this.steps.length - 1) {
            if (this.seats.me('a') !== undefined) {
                this.boardA.setDests();
                this.boardA.chessground.set({ movable: { color: this.seats.myColor('a') } });
            }
            if (this.seats.me('b') !== undefined) {
                this.boardB.setDests();
                this.boardB.chessground.set({ movable: { color: this.seats.myColor('b') } });
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
            this.setPresence(this.username, true);

            // prevent sending gameStart message when user just reconnecting
            //todo:niki:what is the point of this message - also what if we refresh before moves are made? also what is the point of this whole method at all?
            if (msg.ply === 0) {
                this.socket.doSend({ type: 'ready', gameId: this.gameId });
            }
        }
    };

    onMsgUserPresent = (msg: MsgUserPresent) => {
        console.log(msg);
        this.setPresence(msg.username, true);
    };

    onMsgUserDisconnected = (msg: MsgUserDisconnected) => {
        console.log(msg);
        this.setPresence(msg.username, false);
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
