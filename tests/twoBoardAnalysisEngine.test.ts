import { beforeAll, expect, jest, test } from '@jest/globals';

import { Ceval } from '../client/messages';

// engine.ts imports the ffish wasm module at top level — mock it out
jest.unstable_mockModule('ffish-es6', () => ({
    default: () => Promise.resolve({}),
}));

let buildScoreStr: typeof import('../client/two-board/analysis/engine').buildScoreStr;
let parseUciInfoLine: typeof import('../client/two-board/analysis/engine').parseUciInfoLine;

beforeAll(async () => {
    ({ buildScoreStr, parseUciInfoLine } = await import('../client/two-board/analysis/engine'));
});

const ceval = (s: object): Ceval => ({ d: 18, s }) as Ceval;

test('buildScoreStr: centipawn scores are pawns from the given color perspective', () => {
    expect(buildScoreStr('w', ceval({ cp: 154 }))).toBe('1.5');
    expect(buildScoreStr('b', ceval({ cp: 154 }))).toBe('-1.5');
    expect(buildScoreStr('w', ceval({ cp: -37 }))).toBe('-0.4');
    expect(buildScoreStr('b', ceval({ cp: -37 }))).toBe('0.4');
    expect(buildScoreStr('w', ceval({ cp: 0 }))).toBe('0.0');
});

test('buildScoreStr: mate scores carry a sign per color', () => {
    expect(buildScoreStr('w', ceval({ mate: 3 }))).toBe('#3');
    expect(buildScoreStr('b', ceval({ mate: 3 }))).toBe('#-3');
    expect(buildScoreStr('w', ceval({ mate: -2 }))).toBe('#-2');
    expect(buildScoreStr('b', ceval({ mate: -2 }))).toBe('#2');
});

test('buildScoreStr: empty for a score without mate or cp', () => {
    expect(buildScoreStr('w', ceval({}))).toBe('');
});

test('parseUciInfoLine: full cp info line', () => {
    const line =
        'info depth 18 seldepth 24 multipv 1 score cp 34 nodes 1234567 nps 456789 hashfull 12 tbhits 0 time 1234 pv e2e4 e7e5 g1f3';
    expect(parseUciInfoLine(line)).toEqual({
        depth: 18,
        multiPv: 1,
        isMate: false,
        povEv: 34,
        evalType: undefined,
        nodes: 1234567,
        elapsedMs: 1234,
        moves: 'e2e4 e7e5 g1f3',
    });
});

test('parseUciInfoLine: mate score, secondary pv, bounds', () => {
    const mate = 'info depth 12 seldepth 20 multipv 2 score mate -3 nodes 1000 nps 500000 time 200 pv d8h4';
    expect(parseUciInfoLine(mate)).toMatchObject({ multiPv: 2, isMate: true, povEv: -3, moves: 'd8h4' });

    const bound =
        'info depth 10 seldepth 15 multipv 3 score cp 51 upperbound nodes 2000 nps 400000 time 100 pv b1c3';
    expect(parseUciInfoLine(bound)).toMatchObject({ isMate: false, povEv: 51, evalType: 'upper' });
});

test('parseUciInfoLine: non-eval lines do not match', () => {
    expect(parseUciInfoLine('bestmove e2e4 ponder e7e5')).toBeUndefined();
    expect(parseUciInfoLine('info string classical evaluation enabled')).toBeUndefined();
    expect(parseUciInfoLine('readyok')).toBeUndefined();
    // currmove lines lack the score/pv structure
    expect(parseUciInfoLine('info depth 19 currmove d2d4 currmovenumber 2')).toBeUndefined();
});
