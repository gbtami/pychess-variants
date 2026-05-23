import { describe, expect, test } from '@jest/globals';

import { result } from '../client/result';
import { VARIANTS } from '../client/variants';

describe('result text rendering', () => {
    test('does not announce a winner for unresolved unknown-finish results', () => {
        expect(result(VARIANTS.xiangqi, 11, '*')).toBe('Unknown reason');
    });
});
