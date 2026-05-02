import { describe, expect, test } from '@jest/globals';

import { sliceVariationForBranch } from '../client/analysisVariation';
import { getFastMoveSelection, isTheoreticalMove, normalizePlyVariForSelection } from '../client/movelist';

describe('analysis variation branch trimming', () => {
    test('preserves existing variation prefix when replacing a tail', () => {
        const existing = ['b1c2', 'b3b4', 'c6c5', 'b4c4', 'd2d4'];

        // New move was just played from the c6c5 position:
        // current ply is already incremented to 44 and variation starts at 41.
        const prefix = sliceVariationForBranch(existing, 44, 41);

        expect(prefix).toEqual(['b1c2', 'b3b4', 'c6c5']);
    });

    test('never slices from a negative index window', () => {
        const existing = ['m1', 'm2'];
        expect(sliceVariationForBranch(existing, 10, 20)).toEqual([]);
    });
});

describe('fast move-list navigation targets', () => {
    test('jumps to variation bounds when a variation is active', () => {
        expect(getFastMoveSelection(41, 5, 120, true)).toEqual({ ply: 41, plyVari: 41 });
        expect(getFastMoveSelection(41, 5, 120, false)).toEqual({ ply: 45, plyVari: 41 });
    });

    test('falls back to mainline bounds when no active variation exists', () => {
        expect(getFastMoveSelection(0, undefined, 120, true)).toEqual({ ply: 0, plyVari: 0 });
        expect(getFastMoveSelection(0, undefined, 120, false)).toEqual({ ply: 120, plyVari: 0 });
        expect(getFastMoveSelection(41, 0, 120, false)).toEqual({ ply: 120, plyVari: 0 });
    });
});

describe('theoretical move marking', () => {
    test('marks only post-game continuation plies as theoretical', () => {
        expect(isTheoreticalMove(41, 1, 40)).toBe(true);
        expect(isTheoreticalMove(40, 1, 40)).toBe(false);
        expect(isTheoreticalMove(10, -1, 9)).toBe(false);
        expect(isTheoreticalMove(10, 1, undefined)).toBe(false);
    });
});

describe('selection context normalization', () => {
    test('falls back to mainline highlighting context when variation state is stale', () => {
        expect(normalizePlyVariForSelection(41, undefined, 44)).toBe(0);
        expect(normalizePlyVariForSelection(41, 5, 44)).toBe(41);
        expect(normalizePlyVariForSelection(41, 5, 50)).toBe(0);
        expect(normalizePlyVariForSelection(0, undefined, 10)).toBe(0);
    });
});
