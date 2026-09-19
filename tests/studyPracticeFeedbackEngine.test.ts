import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { expect, test } from '@jest/globals';

import { AnalysisPracticeEngine, type AnalysisPracticeEngineEvent } from '../client/analysis/analysisPracticeEngine';
import { gradeStudyPracticeMove } from '../client/study/studyPracticeFeedback';

type LiveEngine = {
    addMessageListener(listener: (line: string) => void): void;
    removeMessageListener(listener: (line: string) => void): void;
    postMessage(command: string): void;
    terminate(): void;
};

type StockfishFactory = (options: { wasmBinary: Uint8Array }) => Promise<LiveEngine>;

const require = createRequire(import.meta.url);
const Stockfish = require('fairy-stockfish-nnue.wasm/stockfish.js') as StockfishFactory;
const wasmPath = require.resolve('fairy-stockfish-nnue.wasm/stockfish.wasm');
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

test('live Fairy-Stockfish output reaches the practice feedback grading path', async () => {
    const liveEngine = await Stockfish({ wasmBinary: readFileSync(wasmPath) });
    let bestmove: Extract<AnalysisPracticeEngineEvent, { type: 'bestmove' }> | undefined;
    let bestmoveResolver: (() => void) | undefined;
    let drainResolver: (() => void) | undefined;
    const adapter = new AnalysisPracticeEngine({ postMessage: command => liveEngine.postMessage(command) }, event => {
        if (event.type === 'bestmove') {
            bestmove = event;
            bestmoveResolver?.();
        }
    });
    const listener = (line: string) => {
        const text = String(line).trim();
        adapter.handleLine(text);
        if (text === 'readyok') drainResolver?.();
    };
    liveEngine.addMessageListener(listener);

    try {
        const bestmoveDone = new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('live Fairy-Stockfish search timed out')), 10_000);
            bestmoveResolver = () => {
                clearTimeout(timer);
                resolve();
            };
        });
        const drainDone = new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('live Fairy-Stockfish drain timed out')), 10_000);
            drainResolver = () => {
                clearTimeout(timer);
                resolve();
            };
        });

        adapter.search({
            initialFen: START_FEN,
            budget: { type: 'nodes', value: 5_000 },
            multiPv: 1,
            options: [
                { name: 'UCI_Variant', value: 'chess' },
                { name: 'UCI_Chess960', value: false },
                { name: 'Use NNUE', value: false },
            ],
        });
        await Promise.all([bestmoveDone, drainDone]);

        expect(bestmove?.move).toBeTruthy();
        expect(bestmove?.info?.score).toBeDefined();
        const playedMove = bestmove!.move!;
        const feedback = gradeStudyPracticeMove({
            learnerColor: 'white',
            playedMove,
            parent: {
                turnColor: 'white',
                score: bestmove?.info?.score,
                bound: bestmove?.info?.bound,
                bestMove: bestmove?.move,
            },
        });
        expect(feedback.verdict).toBe('good');
    } finally {
        adapter.destroy();
        liveEngine.removeMessageListener(listener);
        liveEngine.terminate();
    }
});

test('live bounded practice searches work across chess, Crazyhouse and Shogi families', async () => {
    const liveEngine = await Stockfish({ wasmBinary: readFileSync(wasmPath) });
    const commands: string[] = [];
    let currentBestmove: Extract<AnalysisPracticeEngineEvent, { type: 'bestmove' }> | undefined;
    let bestmoveResolver: (() => void) | undefined;
    let drainResolver: (() => void) | undefined;
    const adapter = new AnalysisPracticeEngine(
        {
            postMessage: command => {
                commands.push(command);
                liveEngine.postMessage(command);
            },
        },
        event => {
            if (event.type === 'bestmove') {
                currentBestmove = event;
                bestmoveResolver?.();
            }
        },
    );
    const listener = (line: string) => {
        const text = String(line).trim();
        adapter.handleLine(text);
        if (text === 'readyok') drainResolver?.();
    };
    liveEngine.addMessageListener(listener);

    const cases = [
        {
            variant: 'chess',
            fen: START_FEN,
        },
        {
            variant: 'crazyhouse',
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[] w KQkq - 0 1',
        },
        {
            variant: 'shogi',
            fen: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL[-] w 0 1',
        },
    ] as const;

    try {
        for (const item of cases) {
            currentBestmove = undefined;
            const bestmoveDone = new Promise<void>((resolve, reject) => {
                const timer = setTimeout(
                    () => reject(new Error(`live ${item.variant} Fairy-Stockfish search timed out`)),
                    10_000,
                );
                bestmoveResolver = () => {
                    clearTimeout(timer);
                    resolve();
                };
            });
            const drainDone = new Promise<void>((resolve, reject) => {
                const timer = setTimeout(
                    () => reject(new Error(`live ${item.variant} Fairy-Stockfish drain timed out`)),
                    10_000,
                );
                drainResolver = () => {
                    clearTimeout(timer);
                    resolve();
                };
            });

            adapter.beginSession();
            adapter.search({
                initialFen: item.fen,
                budget: { type: 'nodes', value: 5_000 },
                multiPv: 1,
                options: [
                    { name: 'UCI_Variant', value: item.variant },
                    { name: 'UCI_Chess960', value: false },
                    { name: 'Use NNUE', value: false },
                ],
            });
            await Promise.all([bestmoveDone, drainDone]);

            expect(currentBestmove?.move).toBeTruthy();
            expect(currentBestmove?.info?.nodes).toBeDefined();
            expect(currentBestmove?.info?.score).toBeDefined();
        }

        expect(commands.filter(command => command === 'go nodes 5000')).toHaveLength(cases.length);
        for (const item of cases) expect(commands).toContain(`setoption name UCI_Variant value ${item.variant}`);
    } finally {
        adapter.destroy();
        liveEngine.removeMessageListener(listener);
        liveEngine.terminate();
    }
});
