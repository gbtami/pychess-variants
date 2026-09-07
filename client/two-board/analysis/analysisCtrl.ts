import * as cg from 'chessgroundx/types';

import { uci2LastMove } from '../../chess';
import { Chart } from 'highcharts';
import { BugBoardName, PyChessModel } from '../../types';
import { MsgBoard } from '../../messages';
import { GameControllerBughouse } from '../common/gameCtrl';
import { sound } from '../../sound';
import { AnalysisClockView, renderClocks } from './analysisClock';
import { AnalysisSeatView, renderSeatNames } from './analysisSeatView';
import { movetimeChart, MovetimeChartView } from './movetimeChart';
import { TwoBoardController, initBoardSettings, clearBoardBounds } from '@/two-board/twoBoardCtrl';
import { getPgn, PgnView, updateFENAndPGN } from './pgn';
import { buildScoreStr, EngineController } from './engine';
import { AnalysisTreeController } from './analysisTree';
import { GameInfoView } from '../common/gameInfo';
import { MovelistView } from '../common/movelist';
import { isOutsidePartnerStack, markBoardRoles } from '../common/boardRoles';
import { trackToolsPlacement } from '../common/toolsPlacement';

export default class AnalysisControllerBughouse extends TwoBoardController {
    pgn: string;
    recordedMainlinePly?: number;

    isAnalysisBoard: boolean;

    movetimeChart: Chart;
    movetimeChartView: MovetimeChartView;
    chartFunctions: any[];

    engine: EngineController;
    tree: AnalysisTreeController;
    pgnView: PgnView;
    clockView: AnalysisClockView;
    seatView: AnalysisSeatView;

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
        engine: EngineController,
        pgnView: PgnView,
        clockView: AnalysisClockView,
        seatView: AnalysisSeatView,
        movetimeChartView: MovetimeChartView,
    ) {
        super(el1, el1Pocket1, el1Pocket2, el2, el2Pocket1, el2Pocket2, model, movelistView, gameInfoView);

        // orient the boards as the viewer experienced the game: own/partner color at
        // the bottom for participants, white-A/black-B for spectators (the old default)
        const bottomColor = (board: BugBoardName): cg.Color =>
            this.seats.initialTopColor(board) === 'white' ? 'black' : 'white';
        this.boardA.chessground.set({ orientation: bottomColor('a') });
        this.boardB.chessground.set({ orientation: bottomColor('b') });

        this.isAnalysisBoard = model['gameId'] === '';
        this.chartFunctions = [movetimeChart];

        this.pgn = '';

        this.engine = engine;
        this.engine.attachCtrl(this);
        this.tree = new AnalysisTreeController(this);
        this.pgnView = pgnView;
        this.clockView = clockView;
        this.seatView = seatView;
        this.movetimeChartView = movetimeChartView;

        const fens = model.fen.split(' | ');

        this.steps.push({
            fen: fens[0],
            fenB: fens[1],
            move: undefined,
            check: false, //not relevant/meaningful - we use the fens for that
            turnColor: this.boardA.turnColor, //not relevant/meaningful - we use the fens for that
        });

        this.pgnView.render(this, this.isAnalysisBoard ? getPgn(this) : this.pgn);

        /* THE BLANK BOARD HAS NO BOARD MESSAGE, so it cannot be started by replaying one.
           `data-board` is the empty string on `/analysis/<variant>` — there is no game to
           describe — and `onMsgBoard('' as MsgBoard)` reads `undefined` for its `gameId`,
           which does not equal this page's `''`, so the first line of that handler returned
           and NOTHING was initialised. No tree, so `sendMove()`'s `consumeMove()` had no
           tree to record into: every move played fine on the board and appeared nowhere.
           The movelist stayed empty and FEN & PGN kept showing the start position.

           So this build starts itself, from the one step the constructor just seeded from
           `model.fen`. The game build still goes through `onMsgBoard`, which needs the real
           message for its plies, its analysis scores and its clocks. */
        if (this.isAnalysisBoard) {
            this.recordedMainlinePly = this.steps.length - 1;
            this.tree.initAnalysisTreeAtPly(this.openingPly());
            this.movelistView.render(this);
            updateFENAndPGN(this);
        } else {
            this.onMsgBoard(model['board'] as MsgBoard);
        }

        initBoardSettings(this.boardA, this.boardB, this.variant);
        // Which board is in the main position — the same positional test the round page
        // uses, so `.own-board` / `.partner-board` mean the same thing on both pages.
        // The view has already put the viewer's own board in `.bug-own-stack`.
        markBoardRoles(isOutsidePartnerStack);
        /* The tab list moves under the partner board once it no longer fits beside it, and spans
           the column pair when it does — the round page's arrangement, driven by the same file.
           One droppable part: the panel is this page's equivalent of that page's chat, the part
           that never moves. */
        trackToolsPlacement([['[role="tablist"]', 'drop-tablist']], '.analysis-app.bug', () => clearBoardBounds(this));
        // The four player bars, keyed by which end of which board they sit at. Painted
        // here rather than by the view because the seat that is at a given end depends
        // on the orientation set a few lines above.
        renderSeatNames(this);
        this.syncBoardHitAreas();
    }

    // A flip changes which player is at the top of a board, so the names and the clocks
    // that name them both have to be repainted. The base class only re-orients the
    // boards; the round page overrides this for the same reason, moving its seat blocks
    // between strips instead.
    flipBoards(): void {
        super.flipBoards();
        renderSeatNames(this);
        renderClocks(this);
    }

    private syncBoardHitAreas() {
        // Bughouse analysis changes the surrounding layout after the two chessgrounds
        // are created. Force a post-layout redraw so pointer bounds stay aligned with
        // the final rendered board positions on both boards.
        requestAnimationFrame(() => {
            this.boardA.chessground.redrawAll();
            this.boardB.chessground.redrawAll();
        });
    }

    private onMsgBoard = (msg: MsgBoard) => {
        if (msg.gameId !== this.gameId) return;

        this.result = msg.result;
        this.status = msg.status;

        if (msg.steps.length > 1) {
            this.steps = [];
            this.plyA = 0;
            this.plyB = 0;

            msg.steps.forEach((step, idx) => {
                if (step.analysis !== undefined) {
                    step.ceval = step.analysis;
                    const scoreStr = buildScoreStr(idx % 2 === 0 ? 'w' : 'b', step.analysis);
                    step.scoreStr = scoreStr;
                }

                this.stampStepPlys(step, idx);
            });
            this.recordedMainlinePly = this.steps.length - 1;
            this.tree.initAnalysisTreeAtPly(this.openingPly());
            this.movelistView.render(this);

            if (this.steps[0].analysis !== undefined) {
                this.engine.clearInfo();
            }

            renderClocks(this);
            movetimeChart(this);
            this.syncBoardHitAreas();
        } else {
        }

        if (!this.tree.hasAnalysisTree() && this.steps.length >= 1) {
            this.recordedMainlinePly = this.steps.length - 1;
            this.tree.initAnalysisTreeAtPly(this.openingPly());
            this.movelistView.render(this);
        }

        updateFENAndPGN(this);

        if (this.model['ply'] > 0) {
            if (this.tree.hasAnalysisTree()) this.tree.activateTreeMainlinePly(this.model['ply'], false);
            else this.movelistView.selectMove(this, this.model['ply']);
        }

        this.syncBoardHitAreas();
    };

    /** WHICH PLY THE ANALYSIS TREE OPENS AT — the end of the recorded game, or the ply named in
     *  the URL.
     *
     *  NOT THE CURSOR, which is the move list's and is set from here downstream: this value picks
     *  a tree path, `activateTreePath()` walks to its node and calls `goPly()`, and THAT moves the
     *  cursor. Until 2026-09-07 the value was parked on `ctrl.ply` in between — assigned from
     *  `msg.ply` at the top of `onMsgBoard()` and read back twenty lines later — so the cursor
     *  briefly held something that was not a cursor, and the controller appeared to own a field
     *  the move list owns.
     *
     *  `steps.length - 1` RATHER THAN `msg.ply`. They are the same number for a whole-game board
     *  message, which is the only kind this page receives, but that identity is the server's and
     *  is incidental here. The intent is "open at the last recorded move", and `steps` is what
     *  records them — every call site assigns `recordedMainlinePly` this very expression on the
     *  line above. */
    private openingPly(): number {
        return this.model['ply'] > 0 ? this.model['ply'] : this.steps.length - 1;
    }

    /** One line, delegating to the move list, which owns the selection. See `twoBoardCtrl`.
     *
     *  The analysis TREE calls this directly and drives its own move-list redraw behind a
     *  `redrawMovelist` flag, so this must NOT go through `selectMove` — that would redraw twice
     *  and override a decision the tree had deliberately made. `showPly` touches the cursor and
     *  the boards and nothing else, which is exactly what the tree wants. */
    goPly = (ply: number) => this.movelistView.showPly(this, ply);

    renderPly = (ply: number, steppedForward: boolean) => {
        if (this.tree.hasAnalysisTree()) {
            const node = this.tree.getTreeNodeForPly(ply);
            if (!node) return;

            const step = node.step;
            const activeBoard = step.boardName === 'b' ? this.boardB : this.boardA;
            const fenA = step.fen;
            const fenB = step.fenB ?? this.steps[0].fenB!;
            const moveA = uci2LastMove(step.move);
            const moveB = uci2LastMove(step.moveB);
            const turnColorA = fenA.split(' ')[1] === 'w' ? 'white' : 'black';
            const turnColorB = fenB.split(' ')[1] === 'w' ? 'white' : 'black';

            const move = step.boardName === 'b' ? moveB : moveA;
            const capture = this.stepCapture(step, activeBoard, move);

            // `steppedForward` comes from the move list, which held the cursor's old value.
            if (steppedForward && step.boardName !== undefined) {
                sound.moveSound(activeBoard.variant, capture);
            }

            if (this.boardA.localAnalysis || this.boardB.localAnalysis) {
                this.engine.engineStop();
                this.engine.clearPvlines();
            }

            this.boardA.setState(fenA, turnColorA, moveA);
            this.boardA.renderState();
            this.boardA.chessground.set({ movable: { color: turnColorA } });

            this.boardB.setState(fenB, turnColorB, moveB);
            this.boardB.renderState();
            this.boardB.chessground.set({ movable: { color: turnColorB } });

            this.disableMovableOnCheckmate(activeBoard);
            renderClocks(this);
            updateFENAndPGN(this);

            if (this.boardA.localAnalysis) {
                this.engine.engineGo(this.boardA);
            } else if (this.boardB.localAnalysis) {
                this.engine.engineGo(this.boardB);
            }

            return;
        }

        const step = this.steps[ply];
        if (step === undefined) return;

        const { board, fen, fenPartner, move, movePartner } = this.goPlyCore(step);
        const turnColorPartner = fenPartner!.split(' ')[1] === 'w' ? 'white' : 'black';

        const capture = this.stepCapture(step, board, move);

        if (steppedForward) {
            // no sound if we are scrolling backwards
            sound.moveSound(board.variant, capture);
        }

        ////////////// above is more or less copy/pasted from gameCtrl.ts->goPLy. other places just call super.goPly

        if (this.boardA.localAnalysis || this.boardB.localAnalysis) {
            this.engine.engineStop();
            this.engine.clearPvlines();
        }

        board.setState(fen!, step.turnColor, move!);
        board.renderState();
        board.chessground.set({ movable: { color: step.turnColor } });

        board.partnerCC.setState(fenPartner!, turnColorPartner, movePartner);
        board.partnerCC.renderState();
        board.partnerCC.chessground.set({ movable: { color: turnColorPartner } });

        this.disableMovableOnCheckmate(board);

        renderClocks(this);
    };

    private disableMovableOnCheckmate = (board: GameControllerBughouse) => {
        // when we have a checkmate on one board, make the other non-movable (the one with checkmate has no dest so
        // not important if movable or not
        if (board.partnerCC.chessground.state.movable.dests?.size === 0) {
            board.chessground.set({ movable: { color: undefined } });
        }
        if (board.chessground.state.movable.dests?.size === 0) {
            board.partnerCC.chessground.set({ movable: { color: undefined } });
        }
    };

    sendMove = (b: GameControllerBughouse, move: string) => {
        if (b.localAnalysis) this.engine.engineStop();
        const { san, sanSAN } = b.playMove(move);

        if (b.localAnalysis) this.engine.engineGo(b);
        //~

        const step = {
            //no matter on which board the ply is happening i always need both fens and moves for both boards. this way when jumping to a ply in the middle of the list i can setup both boards and highlight both last moves
            fen: this.boardA.fullfen,
            fenB: this.boardB.fullfen,
            move: b.boardName === 'a' ? move : this.steps[this.steps.length - 1].move, // if the new move is not for A, repeat value from previous step for A
            moveB: b.boardName === 'b' ? move : this.steps[this.steps.length - 1].moveB, // if the new move is not for B, repeat value from previous step for B
            check: b.isCheck,
            turnColor: b.turnColor,
            san: san,
            sanSAN: sanSAN,
            boardName: b.boardName,
            plyA: this.boardA.ply,
            plyB: this.boardB.ply,
        };

        this.tree.consumeMove(step);
        this.disableMovableOnCheckmate(b);
    };
}
