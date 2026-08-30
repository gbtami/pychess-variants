import { nextGameToPlay } from '../client/ongoingGameSelection';
import type { OngoingGameSelectionData } from '../client/ongoingGameSelection';

function game(overrides: Partial<OngoingGameSelectionData>): OngoingGameSelectionData {
    return {
        gameId: 'game0000',
        tp: 'Player',
        date: '2026-08-31T12:00:00+00:00',
        ...overrides,
    };
}

describe('ongoing round game selection', () => {
    test('correspondence selects the most urgent active game where it is my turn', () => {
        const games = [
            game({ gameId: 'current0', date: '2026-08-30T18:00:00+00:00' }),
            game({ gameId: 'later000', date: '2026-09-02T12:00:00+00:00' }),
            game({ gameId: 'urgent00', date: '2026-08-31T08:00:00+00:00' }),
            game({ gameId: 'opponent', tp: 'Opponent', date: '2026-08-30T19:00:00+00:00' }),
            game({ gameId: 'finished', status: 1, date: '2026-08-30T19:00:00+00:00' }),
        ];

        expect(nextGameToPlay(games, 'Player', 'current0', 'corr')?.gameId).toBe('urgent00');
    });

    test('simul preserves the existing deterministic game-id ordering', () => {
        const games = [
            game({ gameId: 'current0' }),
            game({ gameId: 'zzzzzzzz' }),
            game({ gameId: 'aaaaaaaa' }),
        ];

        expect(nextGameToPlay(games, 'Player', 'current0', 'simul')?.gameId).toBe('aaaaaaaa');
    });

    test('returns no next game when none are waiting for my move', () => {
        const games = [
            game({ gameId: 'current0' }),
            game({ gameId: 'opponent', tp: 'Opponent' }),
            game({ gameId: 'finished', status: 1 }),
        ];

        expect(nextGameToPlay(games, 'Player', 'current0', 'corr')).toBeUndefined();
    });
});
