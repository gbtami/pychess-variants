import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
    AnalysisPracticeEngine,
    parseAnalysisPracticeBestmove,
    parseAnalysisPracticeInfo,
    type AnalysisPracticeAvailability,
    type AnalysisPracticeEngineEvent,
} from '../client/analysis/analysisPracticeEngine';

const START_FEN = '8/8/8/8/8/8/8/K6k w - - 0 1';

function infoLine(move = 'a1a2', nodes = 12345, time = 321): string {
    return `info depth 12 seldepth 18 multipv 1 score cp 42 nodes ${nodes} nps 38000 hashfull 1 time ${time} pv ${move} h1h2`;
}

function makeHarness(availability?: () => AnalysisPracticeAvailability) {
    const commands: string[] = [];
    const events: AnalysisPracticeEngineEvent[] = [];
    const engine = new AnalysisPracticeEngine(
        {
            postMessage: command => commands.push(command),
            availability,
        },
        event => events.push(event),
        {
            maxNodes: 600_000,
            maxMovetimeMs: 4_000,
            maxDepth: 24,
            maxMultiPv: 2,
            maxWallTimeMs: 5_000,
            timeoutGraceMs: 500,
            drainTimeoutMs: 1_000,
        },
    );
    return { engine, commands, events };
}

function search(engine: AnalysisPracticeEngine, move = 'a1a2') {
    return engine.search({
        initialFen: START_FEN,
        moves: move === 'a1a2' ? [] : [move],
        budget: { type: 'nodes', value: 200_000 },
        multiPv: 1,
        options: [
            { name: 'UCI_Variant', value: 'chess' },
            { name: 'Threads', value: 1 },
        ],
    });
}

describe('analysis practice UCI parsing', () => {
    test('preserves score, PV, nodes and elapsed time', () => {
        expect(parseAnalysisPracticeInfo(infoLine())).toEqual({
            depth: 12,
            multiPv: 1,
            score: { cp: 42 },
            bound: undefined,
            nodes: 12345,
            timeMs: 321,
            pv: ['a1a2', 'h1h2'],
        });
    });

    test('parses mate/bound/multipv and terminal bestmove forms', () => {
        expect(
            parseAnalysisPracticeInfo('info depth 7 multipv 2 score mate -3 upperbound nodes 99 time 7 pv P@a10 a1b3'),
        ).toEqual({
            depth: 7,
            multiPv: 2,
            score: { mate: -3 },
            bound: 'upper',
            nodes: 99,
            timeMs: 7,
            pv: ['P@a10', 'a1b3'],
        });
        expect(parseAnalysisPracticeBestmove('bestmove e2e4 ponder e7e5')).toEqual({
            move: 'e2e4',
            ponder: 'e7e5',
        });
        expect(parseAnalysisPracticeBestmove('bestmove (none)')).toEqual({ move: null });
        expect(parseAnalysisPracticeBestmove('bestmove 0000')).toEqual({ move: null });
    });
});

describe('AnalysisPracticeEngine ownership and barriers', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test('emits structured info and bestmove with one search owner', () => {
        const { engine, commands, events } = makeHarness();
        const owner = search(engine);

        expect(commands).toEqual([
            'setoption name UCI_Variant value chess',
            'setoption name Threads value 1',
            'setoption name MultiPV value 1',
            `position fen ${START_FEN}`,
            'go nodes 200000',
        ]);

        expect(engine.handleLine(infoLine())).toBe(true);
        expect(engine.handleLine('bestmove a1a2 ponder h1h2')).toBe(true);
        expect(events).toEqual([
            {
                type: 'info',
                owner,
                info: {
                    depth: 12,
                    multiPv: 1,
                    score: { cp: 42 },
                    bound: undefined,
                    nodes: 12345,
                    timeMs: 321,
                    pv: ['a1a2', 'h1h2'],
                },
            },
            {
                type: 'bestmove',
                owner,
                move: 'a1a2',
                ponder: 'h1h2',
                info: {
                    depth: 12,
                    multiPv: 1,
                    score: { cp: 42 },
                    bound: undefined,
                    nodes: 12345,
                    timeMs: 321,
                    pv: ['a1a2', 'h1h2'],
                },
            },
        ]);
        expect(commands.at(-1)).toBe('isready');
    });

    test('a bestmove callback cannot start the next position before the ready barrier', () => {
        const commands: string[] = [];
        const events: AnalysisPracticeEngineEvent[] = [];
        let engine!: AnalysisPracticeEngine;
        engine = new AnalysisPracticeEngine(
            { postMessage: command => commands.push(command) },
            event => {
                events.push(event);
                if (event.type === 'bestmove') search(engine, 'a1a2');
            },
            { drainTimeoutMs: 1_000 },
        );
        search(engine);
        const positionCount = commands.filter(command => command.startsWith('position fen')).length;

        engine.handleLine('bestmove a1a2');

        expect(commands.at(-1)).toBe('isready');
        expect(commands.filter(command => command.startsWith('position fen'))).toHaveLength(positionCount);
        engine.handleLine('readyok');
        expect(commands.filter(command => command.startsWith('position fen'))).toHaveLength(positionCount + 1);
        expect(events.filter(event => event.type === 'bestmove')).toHaveLength(1);
    });

    test('does not launch a replacement until stopped search sends bestmove and readyok', () => {
        const { engine, commands, events } = makeHarness();
        const oldOwner = search(engine);
        engine.handleLine(infoLine('a1a2'));
        const newOwner = search(engine, 'a1a2');

        expect(newOwner).not.toEqual(oldOwner);
        expect(commands.slice(-2)).toEqual(['stop', 'isready']);
        const positionCountBeforeDrain = commands.filter(command => command.startsWith('position fen')).length;

        // UCI responses do not carry our owner tags. Even if readyok arrives first,
        // the new position must not be sent until the stopped search's bestmove is drained.
        expect(engine.handleLine('readyok')).toBe(true);
        expect(commands.filter(command => command.startsWith('position fen'))).toHaveLength(positionCountBeforeDrain);
        expect(engine.handleLine('info depth 99 score cp 999 nodes 999 time 1 pv a1a2')).toBe(true);
        expect(engine.handleLine('bestmove a1a2')).toBe(true);

        expect(commands.filter(command => command.startsWith('position fen'))).toHaveLength(
            positionCountBeforeDrain + 1,
        );
        expect(commands.at(-1)).toBe('go nodes 200000');

        engine.handleLine(infoLine('a1a2', 777, 22));
        engine.handleLine('bestmove a1a2');

        const bestmoves = events.filter(event => event.type === 'bestmove');
        expect(bestmoves).toHaveLength(1);
        expect(bestmoves[0].owner).toEqual(newOwner);
        expect(bestmoves[0].info?.nodes).toBe(777);
    });

    test('rapid same-FEN session reset cannot assign an old legal reply to the new search', () => {
        const { engine, commands, events } = makeHarness();
        engine.beginSession();
        const oldOwner = search(engine);
        engine.beginSession();
        const newOwner = search(engine);

        expect(oldOwner.session).not.toBe(newOwner.session);
        expect(commands.slice(-2)).toEqual(['stop', 'isready']);

        // Same FEN and same legal PV are deliberately used here. Ownership comes
        // from the stop/bestmove/ready barrier, not from move-legality heuristics.
        engine.handleLine(infoLine('a1a2', 111, 11));
        engine.handleLine('bestmove a1a2');
        engine.handleLine('readyok');
        engine.handleLine(infoLine('a1a2', 222, 22));
        engine.handleLine('bestmove a1a2');

        const newEvents = events.filter(event => event.owner.session === newOwner.session);
        expect(newEvents.map(event => event.type)).toEqual(['info', 'bestmove']);
        expect(newEvents[0].type === 'info' && newEvents[0].info.nodes).toBe(222);
        expect(events.some(event => event.type === 'bestmove' && event.owner.session === oldOwner.session)).toBe(false);
    });

    test('treats no legal move as a successful terminal bestmove', () => {
        const { engine, events } = makeHarness();
        const owner = search(engine);

        engine.handleLine('bestmove (none)');

        expect(events).toContainEqual({ type: 'bestmove', owner, move: null });
    });

    test('hard timeout stops and drains before any queued replacement can start', () => {
        const { engine, commands, events } = makeHarness();
        const owner = engine.search({
            initialFen: START_FEN,
            budget: { type: 'movetime', value: 50_000 },
            timeoutMs: 50_000,
        });

        // Both engine movetime and wall time are clamped by the adapter.
        expect(commands.at(-1)).toBe('go movetime 4000');
        jest.advanceTimersByTime(5_000);
        expect(events).toContainEqual({ type: 'unavailable', owner, reason: 'timeout' });
        expect(commands.slice(-2)).toEqual(['stop', 'isready']);
    });

    test('fails closed if the drain barrier never receives the stopped bestmove', () => {
        const { engine, events } = makeHarness();
        search(engine);
        const replacement = search(engine);

        engine.handleLine('readyok');
        jest.advanceTimersByTime(1_000);

        expect(events).toContainEqual({ type: 'unavailable', owner: replacement, reason: 'drain-timeout' });
        const afterFailure = search(engine);
        expect(events).toContainEqual({ type: 'unavailable', owner: afterFailure, reason: 'drain-timeout' });
    });

    test('rechecks host availability at launch', () => {
        let availability: AnalysisPracticeAvailability = { available: false, reason: 'unsupported' };
        const { engine, commands, events } = makeHarness(() => availability);
        const unsupported = search(engine);

        expect(commands).toHaveLength(0);
        expect(events).toContainEqual({ type: 'unavailable', owner: unsupported, reason: 'unsupported' });

        availability = { available: true };
        const supported = search(engine);
        expect(commands.at(-1)).toBe('go nodes 200000');
        expect(engine.isCurrent(supported)).toBe(true);
    });

    test('permission revocation stops active work and blocks later searches until revalidated', () => {
        const { engine, commands, events } = makeHarness();
        const active = search(engine);

        engine.setBlocked('permission', 'Computer analysis is disabled.');
        expect(events).toContainEqual({
            type: 'unavailable',
            owner: active,
            reason: 'permission',
            message: 'Computer analysis is disabled.',
        });
        expect(commands.slice(-2)).toEqual(['stop', 'isready']);

        const blocked = search(engine);
        expect(events).toContainEqual({
            type: 'unavailable',
            owner: blocked,
            reason: 'permission',
            message: 'Computer analysis is disabled.',
        });
    });

    test('engine errors stop the owned search and distinguish unsupported rules', () => {
        const { engine, events } = makeHarness();
        const owner = search(engine);

        expect(engine.handleLine('info string ERROR: Unknown variant customfoo')).toBe(true);
        expect(events).toContainEqual({
            type: 'unavailable',
            owner,
            reason: 'unsupported',
            message: 'Unknown variant customfoo',
        });
    });

    test('destroy stops browser-local work and ignores later engine output', () => {
        const { engine, commands, events } = makeHarness();
        search(engine);
        const count = events.length;

        engine.destroy();

        expect(commands.at(-1)).toBe('stop');
        expect(engine.handleLine(infoLine())).toBe(false);
        expect(engine.handleLine('bestmove a1a2')).toBe(false);
        expect(events).toHaveLength(count);
        const destroyed = search(engine);
        expect(events).toContainEqual({ type: 'unavailable', owner: destroyed, reason: 'destroyed' });
    });
});
