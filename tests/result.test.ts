import { describe, expect, test } from '@jest/globals';

import { aiLevel, result } from '../client/result';
import { VARIANTS } from '../client/variants';

describe('result text rendering', () => {
    test('does not announce a winner for unresolved unknown-finish results', () => {
        expect(result(VARIANTS.xiangqi, 11, '*')).toBe('Unknown reason');
    });
});

describe('AI level rendering', () => {
    test('shows levels only for the built-in Fairy-Stockfish opponent', () => {
        expect(aiLevel('Fairy-Stockfish', 6)).toBe(' level 6');
        expect(aiLevel('Random-Mover', 0)).toBe('');
        expect(aiLevel('Alice-Stockfish', 6)).toBe('');
    });
});
