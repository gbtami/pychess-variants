import { describe, expect, test } from '@jest/globals';

import { availableTournamentLifecycleActions } from '../client/tournamentLifecycle';

const baseState = {
    status: 'started',
    system: 2,
    manualNextRoundPending: true,
    creatorCanManage: false,
    isDirector: false,
};

describe('tournament lifecycle controls', () => {
    test('lets a creator start a pending manual round', () => {
        expect(availableTournamentLifecycleActions({ ...baseState, creatorCanManage: true })).toEqual([
            'start_next_round',
        ]);
    });

    test('lets a tournament director start a pending manual round', () => {
        expect(availableTournamentLifecycleActions({ ...baseState, isDirector: true })).toEqual([
            'start_next_round',
        ]);
    });

    test('hides start until a manual fixed-system round is pending', () => {
        expect(
            availableTournamentLifecycleActions({
                ...baseState,
                creatorCanManage: true,
                manualNextRoundPending: false,
            }),
        ).toEqual([]);
        expect(availableTournamentLifecycleActions({ ...baseState, creatorCanManage: true, system: 0 })).toEqual([]);
    });

    test('hides all controls from ordinary users and after the tournament ends', () => {
        expect(availableTournamentLifecycleActions(baseState)).toEqual([]);
        expect(availableTournamentLifecycleActions({ ...baseState, status: 'finished', isDirector: true })).toEqual([]);
    });
});
