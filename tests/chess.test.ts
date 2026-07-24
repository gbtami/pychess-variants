import { expect, test } from '@jest/globals';
import { getJanggiPoints, getPockets, isHandicap, validFen, cg2uci, uci2cg, UCIMove } from '../client/chess';
import { variants, VARIANTS } from '../client/variants';

test('getPockets test', () => {
    const result = getPockets(VARIANTS['chess'].startFen);
    expect(result).toBe('');
});

test('getPockets test', () => {
    const result = getPockets(VARIANTS['seirawan'].startFen);
    expect(result).toBe('[HEhe]');
});

test('isHandicap test', () => {
    const result = isHandicap('10-PC HC');
    expect(result).toBeTruthy();
});

test('validFen test', () => {
    variants.forEach(variant => {
        const result = validFen(VARIANTS[variant], VARIANTS[variant].startFen);
        expect(result).toBeTruthy();
    });
});

test('validFen allows extra pocket material within Fairy-Stockfish limits', () => {
    const startFen = VARIANTS['crazyhouse'].startFen;

    expect(validFen(VARIANTS['crazyhouse'], startFen.replace('[]', `[${'Q'.repeat(14)}]`))).toBeTruthy();
    expect(validFen(VARIANTS['crazyhouse'], startFen.replace('[]', `[${'Q'.repeat(15)}]`))).toBeFalsy();
});

test('validFen rejects too many active Fairy-Stockfish features', () => {
    const startFen = VARIANTS['mansindam'].startFen;
    const extraPieces = ['N', 'B', 'R', 'Q', 'A', 'C'].map(piece => piece.repeat(16)).join('');

    expect(validFen(VARIANTS['mansindam'], startFen.replace('[]', `[${extraPieces}]`))).toBeFalsy();
});

test('validFen rejects more pieces in one hand than Fairy-Stockfish allocates', () => {
    const startFen = VARIANTS['torishogi'].startFen;
    const twoSwallowsOnBoard = startFen.replace('sssssss/2s1S2/SSSSSSS', '7/2s1S2/7');

    expect(validFen(VARIANTS['torishogi'], twoSwallowsOnBoard.replace('[-]', `[${'S'.repeat(14)}]`))).toBeTruthy();
    expect(validFen(VARIANTS['torishogi'], twoSwallowsOnBoard.replace('[-]', `[${'S'.repeat(15)}]`))).toBeFalsy();
});

test('validFen leaves headroom below the HTTP request-line limit', () => {
    const startFen = VARIANTS['crazyhouse'].startFen;
    expect(validFen(VARIANTS['crazyhouse'], startFen.replace('[]', `[${'Q'.repeat(4096)}]`))).toBeFalsy();
});

test('uci2cg test', () => {
    const result = uci2cg('a10j10' as UCIMove);
    expect(result).toBe('a:j:');
});

test('cg2uci test', () => {
    const result = cg2uci('a:j:');
    expect(result).toBe('a10j10');
});

test('getJanggiPoints test', () => {
    const result = getJanggiPoints(VARIANTS['janggi'].startFen);
    expect(result).toContain(72);
    expect(result).toContain(73.5);
});
