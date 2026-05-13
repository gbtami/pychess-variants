import { describe, expect, test } from '@jest/globals';

import { getFastMoveSelection, isTheoreticalMove, selectMainlineMove } from '../client/movelist';

describe('fast move-list navigation targets', () => {
    test('always jumps to the mainline bounds outside tree mode', () => {
        expect(getFastMoveSelection(0, undefined, 120, true)).toEqual({ ply: 0, plyVari: 0 });
        expect(getFastMoveSelection(0, undefined, 120, false)).toEqual({ ply: 120, plyVari: 0 });
        expect(getFastMoveSelection(41, 0, 120, false)).toEqual({ ply: 120, plyVari: 0 });
        expect(getFastMoveSelection(41, 5, 120, true)).toEqual({ ply: 0, plyVari: 0 });
        expect(getFastMoveSelection(41, 5, 120, false)).toEqual({ ply: 120, plyVari: 0 });
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

describe('mainline tree selection', () => {
    test('uses an explicit mainline jump in tree mode', () => {
        let selectedMainlinePly: number | undefined;
        let rawGoPlyCalls = 0;

        selectMainlineMove({
            hasAnalysisTree: () => true,
            activateTreeMainlinePly: (ply: number) => {
                selectedMainlinePly = ply;
            },
            goPly: () => {
                rawGoPlyCalls += 1;
            },
            steps: [{}, {}, {}],
            ply: 0,
        } as any, 2);

        expect(selectedMainlinePly).toBe(2);
        expect(rawGoPlyCalls).toBe(0);
    });
});
