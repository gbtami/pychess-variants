import { expect, test } from '@jest/globals';

import { VARIANTS } from '../client/variants';

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
