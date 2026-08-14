import { expect, test } from '@jest/globals';

import { aliceBoardFen } from '../client/aliceBoard';

const fen = 'r|n6/8/8/8/8/8/8/6|NR w - - 0 1';

test('extracts Alice board A and preserves the position fields', () => {
    expect(aliceBoardFen(fen, 'a')).toBe('r7/8/8/8/8/8/8/7R w - - 0 1');
});

test('extracts Alice board B as normally rendered pieces', () => {
    expect(aliceBoardFen(fen, 'b')).toBe('1n6/8/8/8/8/8/8/6N1 w - - 0 1');
});
