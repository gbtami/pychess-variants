import { expect, test } from '@jest/globals';

import { canRateCustomStart, VARIANTS } from '../client/variants';

test('hidden info metadata is set for fogofwar', () => {
    expect(VARIANTS.fogofwar.hiddenInfo).toBe(true);
    expect(VARIANTS.fogofwar.hiddenInfoMode).toBe('fog');
});

test('hidden info metadata is set for jieqi', () => {
    expect(VARIANTS.jieqi.hiddenInfo).toBe(true);
    expect(VARIANTS.jieqi.hiddenInfoMode).toBe('covered_pieces');
});

test('hidden info metadata defaults to none for normal variants', () => {
    expect(VARIANTS.chess.hiddenInfo).toBe(false);
    expect(VARIANTS.chess.hiddenInfoMode).toBe('none');
});

test('only curated alternate starts can be rated', () => {
    expect(canRateCustomStart(VARIANTS.chess, VARIANTS.chess.alternateStart!['No castle'].fen)).toBe(
        true,
    );
    expect(canRateCustomStart(VARIANTS.chess, VARIANTS.chess.alternateStart!.UpsideDown.fen)).toBe(
        false,
    );
    expect(canRateCustomStart(VARIANTS.capablanca, VARIANTS.capablanca.alternateStart!.Gothic.fen)).toBe(
        true,
    );
});

test('custom start rating check normalizes whitespace', () => {
    const noCastle = VARIANTS.chess.alternateStart!['No castle'].fen;
    expect(canRateCustomStart(VARIANTS.chess, `  ${noCastle.replaceAll(' ', '   ')}  `)).toBe(true);
});
