import { expect, test } from '@jest/globals';

import { shouldShowRatingRange } from '../client/lobby/ratingRange';

test('shows the rating range only for public non-catalogued seeks', () => {
    expect(shouldShowRatingRange('createGame', false, false)).toBe(true);
    expect(shouldShowRatingRange('createGame', false, true)).toBe(false);
    expect(shouldShowRatingRange('createGame', true, false)).toBe(false);
    expect(shouldShowRatingRange('playAI', true, true)).toBe(false);
    expect(shouldShowRatingRange('playFriend', false, false)).toBe(false);
});
