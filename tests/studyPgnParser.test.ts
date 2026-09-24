import { describe, expect, test } from '@jest/globals';

import { parsePgn, PgnParseError, type PgnParserLimits } from '../client/pgnParser';

function firstGame(pgn: string) {
    return parsePgn(pgn).games[0];
}

describe('Study PGN raw parser', () => {
    test('parses escaped tags, opaque variant move tokens and punctuation NAGs', () => {
        const game = firstGame(String.raw`[Event "A \"quoted\" \\ path"]
[Variant "grand"]

1.P@j10!? -- 2 S@a1! *`);

        expect(game.tags).toEqual({
            Event: 'A "quoted" \\ path',
            Variant: 'grand',
            Result: '*',
        });
        expect(game.children[0]).toMatchObject({ san: 'P@j10', nags: [5] });
        expect(game.children[0].children?.[0]).toMatchObject({ san: '--' });
        expect(game.children[0].children?.[0].children?.[0]).toMatchObject({ san: 'S@a1', nags: [1] });
    });

    test('keeps recursive RAVs in mainline-first order with comments and NAGs', () => {
        const game = firstGame(`{Root note}
1. e4! e5 2.Nf3 Nc6
    (2... d6?! 3.d4 (3. Bc4!?))
    (2... c5 $5)
3.Bb5 *`);

        const e4 = game.children[0];
        const e5 = e4.children![0];
        const nf3 = e5.children![0];
        const [nc6, d6, c5] = nf3.children!;

        expect(game.comments).toEqual(['Root note']);
        expect(e4.nags).toEqual([1]);
        expect(nc6.san).toBe('Nc6');
        expect(nc6.children?.[0].san).toBe('Bb5');
        expect(d6).toMatchObject({ san: 'd6', nags: [6] });
        expect(d6.children?.map(move => move.san)).toEqual(['d4', 'Bc4']);
        expect(d6.children?.[1].nags).toEqual([5]);
        expect(c5).toMatchObject({ san: 'c5', nags: [5] });
    });

    test('preserves adjacent comments and keeps leading variation comments local to that branch', () => {
        const game = firstGame(String.raw`{root one} {root two}
1.e4 {after \} brace and \\ slash}
( {variation intro} ;second intro
  1.d4 {queen pawn} ) *`);

        expect(game.comments).toEqual(['root one', 'root two']);
        expect(game.children[0].comments).toEqual(['after } brace and \\ slash']);
        expect(game.children[1]).toMatchObject({
            san: 'd4',
            comments: ['variation intro', 'second intro', 'queen pawn'],
        });
    });

    test('parses several games and derives a missing Result tag from movetext', () => {
        const parsed = parsePgn(`[Event "One"]
[Result "1-0"]

1.e4 e5 1-0

[Event "Two"]

1.d4 d5 1/2-1/2

1.c4 c5 *`);

        expect(parsed.capabilities).toEqual({
            recursiveVariations: true,
            comments: true,
            nags: true,
            multipleGames: true,
        });
        expect(parsed.games).toHaveLength(3);
        expect(parsed.games.map(game => game.tags.Result)).toEqual(['1-0', '1/2-1/2', '*']);
        expect(parsed.games.map(game => game.children[0].san)).toEqual(['e4', 'd4', 'c4']);
    });

    test('keeps comments after the termination marker on the final position', () => {
        const parsed = parsePgn('1.e4 e5 1-0 {final note}\n\n[Event "Next"]\n\n1.d4 *');
        expect(parsed.games).toHaveLength(2);
        expect(parsed.games[0].children[0].children?.[0].comments).toEqual(['final note']);
        expect(parsed.games[1].tags.Event).toBe('Next');
    });

    test('accepts common tolerant move-number forms without interpreting SAN', () => {
        const game = firstGame('1.e4 e5 2 Nf3 2...Nc6 3. Bb5 a6 *');
        const sans: string[] = [];
        let move: (typeof game.children)[number] | undefined = game.children[0];
        while (move) {
            sans.push(move.san);
            move = move.children?.[0];
        }
        expect(sans).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
    });

    test('accepts recoverable PyChess desktop PGN quirks without treating comment text as syntax', () => {
        const game = firstGame(`[Result "1/2"]

{root note}
1. e4 $1 $24 e5! 2 Nf3 { [
%clk 0:05:00] comment }
({variation intro ['just for fun']} 2.. d6) 1/2`);

        const e4 = game.children[0];
        const e5 = e4.children![0];
        const nf3 = e5.children![0];
        expect(game.tags.Result).toBe('1/2-1/2');
        expect(e4.nags).toEqual([1, 24]);
        expect(e5.nags).toEqual([1]);
        expect(nf3.comments).toEqual(['[\n%clk 0:05:00] comment']);
        expect(e5.children?.[1]).toMatchObject({
            san: 'd6',
            comments: ["variation intro ['just for fun']"],
        });
    });

    test('normalizes a shorthand 1/2 movetext result instead of replaying it as a move', () => {
        const game = firstGame('1.e4 e5 1/2');
        expect(game.tags.Result).toBe('1/2-1/2');
        expect(game.children[0].children?.[0]).toMatchObject({ san: 'e5' });
        expect(game.children[0].children?.[0].children).toBeUndefined();
    });

    test('supports standalone symbolic NAGs and de-duplicates repeated NAGs', () => {
        const game = firstGame('1.e4 ! $1 e5 = 2.Nf3 ± Nc6 -/+ *');
        const e4 = game.children[0];
        const e5 = e4.children![0];
        const nf3 = e5.children![0];
        const nc6 = nf3.children![0];
        expect(e4.nags).toEqual([1]);
        expect(e5.nags).toEqual([10]);
        expect(nf3.nags).toEqual([16]);
        expect(nc6.nags).toEqual([19]);
    });

    test('ignores BOM and PGN percent escape lines', () => {
        const game = firstGame('\ufeff% generated by a database\n[Event "Escaped"]\n\n1.e4 e5 *');
        expect(game.tags.Event).toBe('Escaped');
        expect(game.children[0].san).toBe('e4');
    });

    test('preserves duplicate branches for the legality-aware normalization stage to merge later', () => {
        const game = firstGame('1.d4 (1.d4 Nf6) (1.d4 d5) 1...e5 *');
        expect(game.children.map(move => move.san)).toEqual(['d4', 'd4', 'd4']);
        expect(game.children[0].children?.[0].san).toBe('e5');
        expect(game.children[1].children?.[0].san).toBe('Nf6');
        expect(game.children[2].children?.[0].san).toBe('d5');
    });

    test.each([
        ['unclosed comment', '1.e4 {oops', /line 1, column \d+: Unclosed brace comment/],
        ['unmatched variation close', '1.e4 )', /line 1, column \d+: Unexpected "\)"/],
        ['variation without a move', '(1.d4)', /line 1, column 1: Variation has no preceding move/],
        ['malformed tag', '[Event noquote]\n1.e4 *', /line 1, column \d+: Expected quoted value/],
    ])('reports useful source locations for %s', (_name, pgn, expected) => {
        expect(() => parsePgn(pgn)).toThrow(expected as RegExp);
        try {
            parsePgn(pgn);
        } catch (error) {
            expect(error).toBeInstanceOf(PgnParseError);
            expect((error as PgnParseError).line).toBeGreaterThan(0);
            expect((error as PgnParseError).column).toBeGreaterThan(0);
        }
    });

    test('enforces configurable browser-safety limits', () => {
        const base: PgnParserLimits = {
            maxInputChars: 10_000,
            maxGames: 10,
            maxNodesPerGame: 10,
            maxVariationDepth: 10,
        };

        expect(() => parsePgn('1.e4 *', { ...base, maxInputChars: 3 })).toThrow(/too large/);
        expect(() => parsePgn('1.e4 * 1.d4 *', { ...base, maxGames: 1 })).toThrow(/more than 1 games/);
        expect(() => parsePgn('1.e4 e5 2.Nf3 *', { ...base, maxNodesPerGame: 2 })).toThrow(/more than 2/);
        expect(() => parsePgn('1.e4 (1.d4 (1.c4)) *', { ...base, maxVariationDepth: 1 })).toThrow(/nesting exceeds 1/);
    });
});
