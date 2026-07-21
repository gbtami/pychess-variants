import { expect, test } from '@jest/globals';

import { canRateCustomStart, cwdaEngineVariant, VARIANTS } from '../client/variants';

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

test('Chess with Different Armies exposes every ordered non-FIDE matchup', () => {
    const starts = Object.values(VARIANTS.cwda.alternateStart!);

    expect(VARIANTS.cwda._displayName).toBe('cwda');
    expect(Object.keys(VARIANTS.cwda.alternateStart!)[0]).toBe('FIDE — Clobberers');
    expect(starts).toHaveLength(15);
    expect(new Set(starts.map(start => start.fen)).size).toBe(15);
    expect(starts.every(start => start.canRated)).toBe(true);
});

test('Chess with Different Armies resolves color reversals to one engine profile', () => {
    const normal = 'gihokhig/pppppppp/8/8/8/8/PPPPPPPP/DWACKAWD w KQkq - 0 1';
    const reversed = 'dwackawd/pppppppp/8/8/8/8/PPPPPPPP/GIHOKHIG w KQkq - 0 1';

    expect(cwdaEngineVariant(normal)).toBe('cwda-clobberers-knights');
    expect(cwdaEngineVariant(reversed)).toBe('cwda-clobberers-knights');
    expect(cwdaEngineVariant('')).toBe('cwda-fide-clobberers');
});
