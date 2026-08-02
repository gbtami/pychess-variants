import * as cg from 'chessgroundx/types';

import { uci2LastMove } from '../../chess';
import { updateMovelist, selectMove } from '../common/movelist';
import { Chart } from 'highcharts';
import { BugBoardName, PyChessModel } from '../../types';
import { MsgBoard } from '../../messages';
import { GameControllerBughouse } from '../common/gameCtrl';
import { sound } from '../../sound';
import { AnalysisClockView, renderClocks } from './analysisClock';
import { movetimeChart, MovetimeChartView } from './movetimeChart';
import { TwoBoardController, initBoardSettings } from '@/two-board/twoBoardCtrl';
import { getPgn, PgnView, updateFENAndPGN } from './pgn';
import { buildScoreStr, EngineController } from './engine';
import { AnalysisTreeController } from './analysisTree';
import { GameInfoView } from '../common/gameInfo';
import { MovelistView } from '../common/movelist';

export default class AnalysisControllerBughouse extends TwoBoardController {
    pgn: string;
    plyVari: number;
    recordedMainlinePly?: number;

    isAnalysisBoard: boolean;

    movetimeChart: Chart;
    movetimeChartView: MovetimeChartView;
    chartFunctions: any[];

    engine: EngineController;
    tree: AnalysisTreeController;
    pgnView: PgnView;
    clockView: AnalysisClockView;

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

        // current interactive analysis variation ply
        this.plyVari = 0;

        this.pgn = '';
        this.ply = isNaN(model['ply']) ? 0 : model['ply'];

        this.engine = engine;
        this.engine.attachCtrl(this);
        this.tree = new AnalysisTreeController(this);
        this.pgnView = pgnView;
        this.clockView = clockView;
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

        this.onMsgBoard(model['board'] as MsgBoard);

        initBoardSettings(this.boardA, this.boardB, this.variant);
        this.syncBoardHitAreas();
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

        this.ply = msg.ply;

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
            const initialPly = this.model['ply'] > 0 ? this.model['ply'] : this.ply;
            this.tree.initAnalysisTreeAtPly(initialPly);
            updateMovelist(this);

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
            this.tree.initAnalysisTreeAtPly(this.ply);
            updateMovelist(this);
        }

        updateFENAndPGN(this);

        if (this.model['ply'] > 0) {
            this.ply = this.model['ply'];
            if (this.tree.hasAnalysisTree()) this.tree.activateTreeMainlinePly(this.ply, false);
            else selectMove(this, this.ply);
        }

        this.syncBoardHitAreas();
    };

    goPly = (ply: number, plyVari = 0) => {
        if (this.tree.hasAnalysisTree() && plyVari === 0) {
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

            if (ply === this.ply + 1 && step.boardName !== undefined) {
                sound.moveSound(activeBoard.variant, capture);
            }
            this.ply = ply;
            this.plyVari = 0;

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

        if (ply === this.ply + 1) {
            // no sound if we are scrolling backwards
            sound.moveSound(board.variant, capture);
        }
        this.ply = ply;
        this.plyVari = 0;

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
