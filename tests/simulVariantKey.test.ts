import { expect, test } from '@jest/globals';

import { getVariantByKey, splitVariantKey } from '../client/variants';

test('splitVariantKey preserves chess960 variants', () => {
    expect(splitVariantKey('crazyhouse960')).toEqual({
        base: 'crazyhouse',
        chess960: true,
    });
});

test('getVariantByKey resolves base metadata for chess960 variants', () => {
    const variant = getVariantByKey('crazyhouse960');

    expect(variant.name).toBe('crazyhouse');
    expect(variant.displayName(true)).toBe('CRAZYHOUSE960');
    expect(variant.icon(true)).toBe('%');
});

test('getVariantByKey falls back to chess for unknown variants', () => {
    expect(getVariantByKey('not-a-variant').name).toBe('chess');
});
