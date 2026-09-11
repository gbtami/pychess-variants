import { afterEach, expect, test } from '@jest/globals';
import { parsePgnVariantTag } from '../client/pgn';
import {
    getVariantByKey,
    registerCataloguedVariant,
    splitVariantKey,
    unregisterCataloguedVariant,
    VARIANTS,
    variantKey,
} from '../client/variants';

const name = 'testsideways960';
afterEach(() => unregisterCataloguedVariant(name));

test.each([true, false])('community names survive PGN and UI keys with randomStart=%s', randomStart => {
    registerCataloguedVariant({
        name,
        displayName: 'Sideways 960',
        ini: `[${name}:pawnsideways]\nchess960 = true`,
        baseVariant: 'pawnsideways',
        startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        width: 8,
        height: 8,
        pieces: ['p', 'n', 'b', 'r', 'q', 'k'],
        randomStart,
    });
    const key = variantKey(name, randomStart);
    expect(key).toBe(name);
    expect(getVariantByKey(key)).toBe(VARIANTS[name]);
    expect(splitVariantKey(key)).toEqual({ base: name, chess960: randomStart });
    expect(parsePgnVariantTag('Testsideways960')).toEqual({
        variant: name,
        chess960: randomStart,
        raw: 'Testsideways960',
    });
    expect(VARIANTS[name].displayName(randomStart)).toBe('SIDEWAYS 960');
});

test('site Chess960 retains its separate variant key', () => {
    expect(variantKey('chess', true)).toBe('chess960');
    expect(parsePgnVariantTag('Chess960').variant).toBe('chess');
    expect(splitVariantKey('chess960')).toEqual({ base: 'chess', chess960: true });
});
