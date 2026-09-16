/** @jest-environment jsdom */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

jest.mock('../client/i18n', () => ({
    _: (text: string, ...args: string[]) =>
        args.reduce((value, arg, index) => value.replace(`%${index + 1}`, arg), text),
}));

import type { AnalysisController } from '../client/analysis/analysisCtrl';
import type { AnalysisNavigationOrigin } from '../client/analysis/analysisExtension';
import type { AnalysisTree, AnalysisTreeNode } from '../client/analysis/analysisTree';
import { StudyPracticeSession, type StudyPracticeAccess } from '../client/study/studyPractice';

type Color = 'white' | 'black';

type Scenario = {
    initialTurn: Color;
    terminalAfter?: number;
    initialTerminal?: boolean;
    result?: string;
    legalMoves?: (turn: Color, moves: readonly string[]) => string;
};

let scenario: Scenario;
let boardsCreated = 0;
let boardsDeleted = 0;
let boardVariants: string[] = [];

function opposite(color: Color): Color {
    return color === 'white' ? 'black' : 'white';
}

class FakeBoard {
    private turn: Color;
    private readonly moves: string[] = [];
    deleted = false;

    constructor(variant: string, fen: string) {
        boardsCreated += 1;
        boardVariants.push(variant);
        this.turn = fen.split(' ')[1] === 'b' ? 'black' : scenario.initialTurn;
    }

    delete(): void {
        if (!this.deleted) boardsDeleted += 1;
        this.deleted = true;
    }

    isGameOver(): boolean {
        return Boolean(
            scenario.initialTerminal ||
            (scenario.terminalAfter !== undefined && this.moves.length >= scenario.terminalAfter),
        );
    }

    result(): string {
        return this.isGameOver() ? (scenario.result ?? '1-0') : '*';
    }

    legalMoves(): string {
        if (this.isGameOver()) return '';
        if (scenario.legalMoves) return scenario.legalMoves(this.turn, this.moves);
        if (this.turn === 'white') return this.moves.length === 0 ? 'e2e4 d2d4' : 'g1f3 b1c3';
        return this.moves.length === 0 ? 'e7e5 d7d5' : 'e7e5 d7d5 g8f6';
    }

    pop(): void {
        if (this.moves.length === 0) throw new Error('no move');
        this.moves.pop();
        this.turn = opposite(this.turn);
    }

    push(move: string): void {
        if (!this.legalMoves().split(' ').includes(move)) throw new Error(`illegal ${move}`);
        this.moves.push(move);
        this.turn = opposite(this.turn);
    }

    sanMove(move: string): string {
        return move;
    }
}

function rootFen(turn: Color): string {
    return `8/8/8/8/8/8/8/8 ${turn === 'white' ? 'w' : 'b'} - - 0 1`;
}

function makeRoot(fen: string): AnalysisTreeNode {
    return {
        id: 'root',
        path: '',
        ply: 0,
        step: { fen, turnColor: fen.includes(' b ') ? 'black' : 'white', check: false },
        children: [],
        mainlinePly: 0,
    };
}

type HarnessOverrides = Partial<{
    engineVariant: string;
    localEngine: boolean;
    localAnalysis: boolean;
    isEngineReady: boolean;
    variantSupportedByFSF: boolean;
    uciOk: boolean;
    twoBoards: boolean;
    practiceEngineIdle: boolean;
}>;

function makeHarness(
    learnerColor: Color,
    accessRef = { value: { available: true } as StudyPracticeAccess },
    overrides: HarnessOverrides = {},
) {
    document.body.innerHTML = '<div class="analysis-tools"><div class="ordinary-tools"></div></div>';
    const commands: string[] = [];
    const sent: string[] = [];
    const fen = rootFen(scenario.initialTurn);
    const root = makeRoot(fen);
    const tree: AnalysisTree = { root, byPath: new Map([['', root]]), nextId: 1 };
    const positions = new Map<string, { turn: Color; fen: string }>([['', { turn: scenario.initialTurn, fen }]]);
    let moveIndex = 0;
    let session!: StudyPracticeSession;

    const ctrl = {
        analysisTree: tree,
        analysisPath: '',
        steps: [root.step],
        recordedMainlinePly: 0,
        turnColor: scenario.initialTurn,
        fullfen: fen,
        engineVariant: overrides.engineVariant ?? 'chess',
        chess960: false,
        variant: { twoBoards: overrides.twoBoards ?? false },
        ffish: { Board: FakeBoard },
        localEngine: overrides.localEngine ?? true,
        localAnalysis: overrides.localAnalysis ?? false,
        isEngineReady: overrides.isEngineReady ?? true,
        variantSupportedByFSF: overrides.variantSupportedByFSF ?? true,
        uciOk: overrides.uciOk ?? true,
        autoShapes: [],
        chessground: {
            state: { dimensions: { width: 8, height: 8 } },
            cancelPremove: jest.fn(),
            set: jest.fn(),
            setAutoShapes: jest.fn(),
        },
        fsfPostMessage: (command: string) => commands.push(command),
        suspendLocalAnalysisForExtension: jest.fn(function (this: { localAnalysis: boolean }) {
            this.localAnalysis = false;
        }),
        isPracticeEngineIdle: () => overrides.practiceEngineIdle ?? true,
        isLocalAnalysisBlockedByAntiCheat: () => false,
        activateTreePath(path: string, _redraw: boolean, _origin: AnalysisNavigationOrigin) {
            const position = positions.get(path);
            if (!position) return false;
            this.analysisPath = path;
            this.turnColor = position.turn;
            this.fullfen = position.fen;
            return true;
        },
        applyAnalysisMove(move: string, origin: 'played-move' | 'automated-reply') {
            const nextTurn = opposite(this.turnColor);
            const path = `m${++moveIndex}`;
            const nextFen = rootFen(nextTurn);
            const node: AnalysisTreeNode = {
                id: path,
                path,
                ply: moveIndex,
                step: { move, fen: nextFen, turnColor: nextTurn, check: false },
                children: [],
            };
            tree.byPath.set(path, node);
            tree.root.children.push(node);
            this.analysisPath = path;
            this.turnColor = nextTurn;
            this.fullfen = nextFen;
            positions.set(path, { turn: nextTurn, fen: nextFen });
            sent.push(move);
            session.onPositionChanged({
                origin,
                path,
                previousPath: '',
                ply: moveIndex,
                fen: nextFen,
                node,
            });
            return true;
        },
    } as unknown as AnalysisController;

    session = new StudyPracticeSession(ctrl, {
        initialFen: fen,
        learnerColor,
        access: () => accessRef.value,
        canAnalyse: false,
    });

    const humanMove = (move: string) => {
        const allowed = session.beforeMoveApplied({ move, origin: 'played-move', path: ctrl.analysisPath ?? '' });
        if (!allowed) return false;
        return ctrl.applyAnalysisMove(move, 'played-move');
    };

    const finishEvaluation = (bestMove: string, cp = 0) => {
        session.onEngineLine(`info depth 16 multipv 1 score cp ${cp} nodes 400000 time 1000 pv ${bestMove}`);
        session.onEngineLine(`bestmove ${bestMove}`);
        session.onEngineLine('readyok');
    };

    return { ctrl, session, commands, sent, humanMove, tree, accessRef, finishEvaluation };
}

describe('StudyPracticeSession', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        scenario = { initialTurn: 'white' };
        boardsCreated = 0;
        boardsDeleted = 0;
        boardVariants = [];
    });

    afterEach(() => {
        jest.useRealTimers();
        document.body.replaceChildren();
    });

    test('white learner starts from a FEN-only root and receives exactly one engine reply', () => {
        scenario = { initialTurn: 'white' };
        const { session, commands, sent, humanMove, tree, finishEvaluation } = makeHarness('white');

        expect(session.state.kind).toBe('human-turn');
        finishEvaluation('e2e4');
        expect(tree.root.children).toHaveLength(0);
        expect(humanMove('e2e4')).toBe(true);
        expect(session.state.kind).toBe('engine-thinking');
        expect(commands).toContain('position fen 8/8/8/8/8/8/8/8 w - - 0 1 moves e2e4');
        expect(commands).toContain('go nodes 600000');

        expect(session.onEngineLine('bestmove e7e5')).toBe(true);
        expect(session.state.kind).toBe('human-turn');
        expect(sent).toEqual(['e2e4', 'e7e5']);
        expect(session.attemptHistory.map(entry => entry.by)).toEqual(['human', 'engine']);

        // A duplicate trailing bestmove belongs to the E1 drain, not a second reply.
        expect(session.onEngineLine('bestmove d7d5')).toBe(true);
        expect(sent).toEqual(['e2e4', 'e7e5']);
        session.onEngineLine('readyok');
        session.destroy();
    });

    test('black learner waits for the engine to make the root reply first', () => {
        scenario = { initialTurn: 'white' };
        const { session, sent, humanMove, finishEvaluation } = makeHarness('black');

        expect(session.state.kind).toBe('engine-thinking');
        session.onEngineLine('bestmove e2e4');
        expect(session.state.kind).toBe('human-turn');
        expect(sent).toEqual(['e2e4']);
        session.onEngineLine('readyok');
        finishEvaluation('e7e5');
        expect(humanMove('e7e5')).toBe(true);
        expect(session.state.kind).toBe('engine-thinking');
        session.destroy();
    });

    test('saved authored continuations are discarded from the disposable practice tree', () => {
        scenario = { initialTurn: 'white' };
        document.body.innerHTML = '<div class="analysis-tools"></div>';
        const fen = rootFen('white');
        const root = makeRoot(fen);
        const authored: AnalysisTreeNode = {
            id: 'authored',
            path: 'authored',
            ply: 1,
            step: { move: 'd2d4', fen: rootFen('black'), turnColor: 'black', check: false },
            children: [],
            mainlinePly: 1,
        };
        root.children.push(authored);
        const tree: AnalysisTree = {
            root,
            byPath: new Map([
                ['', root],
                ['authored', authored],
            ]),
            nextId: 2,
        };
        const ctrl = {
            analysisTree: tree,
            analysisPath: '',
            steps: [root.step, authored.step],
            recordedMainlinePly: 1,
            turnColor: 'white',
            fullfen: fen,
            engineVariant: 'chess',
            chess960: false,
            variant: { twoBoards: false },
            ffish: { Board: FakeBoard },
            localEngine: true,
            localAnalysis: false,
            isEngineReady: true,
            variantSupportedByFSF: true,
            uciOk: true,
            autoShapes: [],
            chessground: {
                state: { dimensions: { width: 8, height: 8 } },
                cancelPremove: jest.fn(),
                set: jest.fn(),
                setAutoShapes: jest.fn(),
            },
            fsfPostMessage: jest.fn(),
            suspendLocalAnalysisForExtension: jest.fn(),
            isPracticeEngineIdle: () => true,
            activateTreePath: jest.fn(),
        } as unknown as AnalysisController;
        const session = new StudyPracticeSession(ctrl, {
            initialFen: fen,
            learnerColor: 'white',
            access: () => ({ available: true }),
            canAnalyse: false,
        });

        expect(tree.root.children).toEqual([]);
        expect(tree.byPath.has('authored')).toBe(false);
        expect(ctrl.steps).toHaveLength(1);
        session.destroy();
    });

    test('pause cancels engine work, permits history browsing, and resume returns to the live path', () => {
        scenario = { initialTurn: 'white' };
        const { session, ctrl, humanMove, finishEvaluation } = makeHarness('white');
        finishEvaluation('e2e4');
        humanMove('e2e4');
        session.onEngineLine('bestmove e7e5');
        session.onEngineLine('readyok');
        expect(session.state.kind).toBe('human-turn');
        expect(session.pause()).toBe(true);
        expect(session.state.kind).toBe('paused');
        expect(session.browse(-1)).toBe(true);
        expect(ctrl.analysisPath).toBe('m1');
        expect(session.browse(-1)).toBe(true);
        expect(ctrl.analysisPath).toBe('');
        expect(session.resume()).toBe(true);
        expect(ctrl.analysisPath).toBe('m2');
        expect(session.state.kind).toBe('human-turn');
        session.destroy();
    });

    test('reset invalidates the old search and starts a fresh root attempt', () => {
        scenario = { initialTurn: 'white' };
        const { session, ctrl, humanMove, finishEvaluation } = makeHarness('white');
        finishEvaluation('e2e4');
        humanMove('e2e4');
        expect(session.state.kind).toBe('engine-thinking');
        session.reset();
        expect(ctrl.analysisPath).toBe('');
        expect(session.attemptHistory).toEqual([]);
        expect(session.state.kind).toBe('human-turn');
        // Stale output from the cancelled attempt cannot move the fresh board.
        session.onEngineLine('bestmove e7e5');
        expect(session.attemptHistory).toEqual([]);
        session.onEngineLine('readyok');
        session.destroy();
    });

    test('terminal root ends immediately without starting an engine search', () => {
        scenario = { initialTurn: 'black', initialTerminal: true };
        const { session, commands } = makeHarness('white');
        expect(session.state).toEqual({ kind: 'ended', result: '1-0' });
        expect(commands.some(command => command.startsWith('go '))).toBe(false);
        session.destroy();
    });

    test('terminal result after a human move stops before requesting an engine reply', () => {
        scenario = { initialTurn: 'white', terminalAfter: 1 };
        const { session, commands, humanMove, finishEvaluation } = makeHarness('white');
        expect(humanMove('e2e4')).toBe(true);
        expect(session.state.kind).toBe('evaluating-move');
        finishEvaluation('e2e4');
        expect(session.state.kind).toBe('ended');
        if (session.state.kind === 'ended') expect(session.state.result).toBe('1-0');
        expect(commands).not.toContain('go nodes 600000');
        session.destroy();
    });

    test('actual UCI score output produces negative feedback and retry replaces the disposable move', () => {
        scenario = { initialTurn: 'white' };
        const { session, sent, humanMove, finishEvaluation } = makeHarness('white');
        finishEvaluation('e2e4', 0);

        expect(humanMove('d2d4')).toBe(true);
        expect(session.state.kind).toBe('evaluating-move');
        session.onEngineLine('info depth 16 multipv 1 score cp 200 nodes 400000 time 1000 pv e7e5');
        session.onEngineLine('bestmove e7e5');

        expect(session.state.kind).toBe('move-feedback');
        if (session.state.kind === 'move-feedback') {
            expect(session.state.feedback.verdict).toBe('blunder');
            expect(session.state.feedback.bestMove).toBe('e2e4');
            expect(session.state.feedback.bestSan).toBe('e2e4');
        }
        expect(document.querySelector('.study-practice')?.textContent).toContain('A stronger move was e2e4.');

        session.onEngineLine('readyok');
        expect(session.retryBestMove()).toBe(true);
        expect(sent).toEqual(['d2d4', 'e2e4']);
        expect(session.attemptHistory.map(entry => entry.move)).toEqual(['e2e4']);
        expect(session.state.kind).toBe('engine-thinking');
        session.destroy();
    });

    test('missing exact score reports insufficient information instead of inventing a verdict', () => {
        scenario = { initialTurn: 'white' };
        const { session, commands, humanMove } = makeHarness('white');
        session.onEngineLine('bestmove e2e4');
        session.onEngineLine('readyok');

        expect(humanMove('d2d4')).toBe(true);
        expect(session.state.kind).toBe('engine-thinking');
        expect(document.querySelector('.study-practice')?.textContent).toContain(
            'There was not enough engine information to grade this move.',
        );
        expect(commands).toContain('go nodes 600000');
        session.destroy();
    });

    test('hints escalate from the best-move piece to the full move and then hide again', () => {
        scenario = { initialTurn: 'white' };
        const { session, ctrl, finishEvaluation } = makeHarness('white');

        expect(session.hint()).toBe(true);
        expect(document.querySelector('.study-practice')?.textContent).toContain('Analyzing a hint…');
        finishEvaluation('e2e4');
        expect(ctrl.autoShapes).toEqual([[{ orig: 'e2', brush: 'paleBlue' }]]);
        expect(document.querySelector('.study-practice')?.textContent).toContain('Try the piece on e2.');

        expect(session.hint()).toBe(true);
        expect(ctrl.autoShapes).toEqual([
            [{ orig: 'e2', dest: 'e4', brush: 'paleBlue', piece: undefined, modifiers: { lineWidth: 14 } }],
        ]);
        expect(document.querySelector('.study-practice')?.textContent).toContain('Try e2e4.');

        expect(session.hint()).toBe(true);
        expect(ctrl.autoShapes).toEqual([]);
        session.destroy();
    });

    test('drop hints use the destination square without assuming an origin square', () => {
        scenario = {
            initialTurn: 'white',
            legalMoves: (turn, moves) => (turn === 'white' && moves.length === 0 ? 'P@e4 d2d4' : 'e7e5'),
        };
        const { session, ctrl, finishEvaluation } = makeHarness('white');
        expect(session.hint()).toBe(true);
        finishEvaluation('P@e4');

        expect(ctrl.autoShapes).toEqual([[{ orig: 'e4', brush: 'paleBlue' }]]);
        expect(document.querySelector('.study-practice')?.textContent).toContain('Try a P drop.');
        expect(session.hint()).toBe(true);
        expect(document.querySelector('.study-practice')?.textContent).toContain('Try P@e4.');
        session.destroy();
    });

    test('slow browser-engine initialization stays inert until readiness is revalidated', () => {
        scenario = { initialTurn: 'white' };
        const { session, ctrl, commands } = makeHarness('white', undefined, {
            localEngine: false,
            isEngineReady: false,
            variantSupportedByFSF: false,
            uciOk: false,
        });

        expect(session.state.kind).toBe('initializing');
        expect(commands.some(command => command.startsWith('go '))).toBe(false);

        ctrl.localEngine = true;
        ctrl.isEngineReady = true;
        ctrl.variantSupportedByFSF = true;
        ctrl.uciOk = true;
        session.refreshAvailability();

        expect(session.state.kind).toBe('human-turn');
        expect(commands).toContain('go nodes 400000');
        session.destroy();
    });

    test('disabled computer permission blocks startup without sending engine work and can recover', () => {
        scenario = { initialTurn: 'white' };
        const accessRef = {
            value: { available: false, reason: 'computer-disabled' } as StudyPracticeAccess,
        };
        const { session, commands } = makeHarness('white', accessRef);

        expect(session.state).toEqual({ kind: 'unavailable', reason: 'computer-disabled' });
        expect(commands.some(command => command.startsWith('go '))).toBe(false);
        expect(document.querySelector('.study-practice')?.textContent).toContain(
            'Computer analysis is disabled for this study.',
        );

        accessRef.value = { available: true };
        session.refreshAvailability();
        expect(session.state.kind).toBe('human-turn');
        expect(commands).toContain('go nodes 400000');
        session.destroy();
    });

    test('unsupported and two-board variants show explicit fallback without starting a search', () => {
        scenario = { initialTurn: 'white' };
        const unsupported = makeHarness('white', undefined, {
            localEngine: true,
            isEngineReady: true,
            variantSupportedByFSF: false,
            uciOk: true,
        });
        expect(unsupported.session.state).toEqual({
            kind: 'unavailable',
            reason: 'unsupported',
            message: 'This variant is not supported by the browser engine.',
        });
        expect(unsupported.commands.some(command => command.startsWith('go '))).toBe(false);
        expect(document.querySelector('.study-practice')?.textContent).toContain(
            'This variant is not supported by the browser engine.',
        );
        unsupported.session.destroy();

        const twoBoard = makeHarness('white', undefined, { twoBoards: true });
        expect(twoBoard.session.state).toEqual({
            kind: 'unavailable',
            reason: 'unsupported',
            message: 'Two-board variants are not supported by computer practice.',
        });
        expect(twoBoard.commands.some(command => command.startsWith('go '))).toBe(false);
        twoBoard.session.destroy();
    });

    test('engine failure stops practice and reports the failure instead of reusing stale output', () => {
        scenario = { initialTurn: 'white' };
        const { session, commands } = makeHarness('white');

        expect(session.state.kind).toBe('human-turn');
        expect(session.onEngineLine('info string ERROR: worker crashed')).toBe(true);
        expect(session.state).toEqual({
            kind: 'unavailable',
            reason: 'engine-error',
            message: 'worker crashed',
        });
        expect(commands).toContain('stop');
        expect(commands).toContain('isready');
        session.destroy();
    });

    test('saved custom runtime rules use the chapter engine variant for boards and bounded searches', () => {
        scenario = { initialTurn: 'white' };
        const { session, commands, finishEvaluation } = makeHarness('white', undefined, {
            engineVariant: 'study-custom-deadbeef',
        });

        expect(boardVariants).toEqual(['study-custom-deadbeef']);
        expect(commands).toContain('setoption name UCI_Variant value study-custom-deadbeef');
        finishEvaluation('e2e4');
        expect(boardVariants).toEqual(['study-custom-deadbeef', 'study-custom-deadbeef']);
        expect(boardsCreated - boardsDeleted).toBe(1);
        session.destroy();
        expect(boardsCreated).toBe(boardsDeleted);
    });

    test('repeat reset keeps one history board alive and teardown emits no later bounded searches', () => {
        scenario = { initialTurn: 'white' };
        const { session, commands } = makeHarness('white');

        for (let index = 0; index < 8; index += 1) {
            session.reset();
            expect(boardsCreated - boardsDeleted).toBe(1);
        }

        session.destroy();
        expect(boardsCreated).toBe(boardsDeleted);
        const commandCount = commands.length;
        jest.advanceTimersByTime(30_000);
        session.refreshAvailability();
        session.onEngineLine('readyok');
        session.onEngineLine('bestmove e2e4');
        expect(commands).toHaveLength(commandCount);
    });

    test('anti-cheat revocation during engine thinking stops play and fails closed', () => {
        scenario = { initialTurn: 'white' };
        const accessRef = { value: { available: true } as StudyPracticeAccess };
        const { session, commands, humanMove, finishEvaluation } = makeHarness('white', accessRef);
        finishEvaluation('e2e4');
        humanMove('e2e4');
        expect(session.state.kind).toBe('engine-thinking');
        accessRef.value = { available: false, reason: 'active-game' };
        session.refreshAvailability();
        expect(session.state).toEqual({ kind: 'unavailable', reason: 'active-game' });
        expect(commands).toContain('stop');
        expect(commands).toContain('isready');
        session.destroy();
    });

    test('destroy during an engine search prevents a late reply from being applied', () => {
        scenario = { initialTurn: 'white' };
        const { session, sent, humanMove, finishEvaluation } = makeHarness('white');
        finishEvaluation('e2e4');
        humanMove('e2e4');
        expect(session.state.kind).toBe('engine-thinking');
        session.destroy();
        expect(session.onEngineLine('bestmove e7e5')).toBe(false);
        expect(sent).toEqual(['e2e4']);
        expect(document.querySelector('.study-practice')).toBeNull();
    });
});
