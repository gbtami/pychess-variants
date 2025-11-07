import { expect, test } from '@jest/globals';
import { getJanggiPoints, getPockets, isHandicap, validFen, cg2uci, uci2cg, UCIMove } from '../client/chess';
import { variants, VARIANTS } from '../client/variants';

test('getPockets test', () => {
    const result = getPockets(VARIANTS['chess'].startFen);
    expect(result).toBe("");
});

test('getPockets test', () => {
    const result = getPockets(VARIANTS['seirawan'].startFen);
    expect(result).toBe("[HEhe]");
});

test('isHandicap test', () => {
    const result = isHandicap('10-PC HC');
    expect(result).toBeTruthy();
});

test('validFen test', () => {
    variants.forEach( (variant) => {
        const result = validFen(VARIANTS[variant], VARIANTS[variant].startFen);
        expect(result).toBeTruthy();
    });
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
