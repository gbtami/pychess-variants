import { describe, expect, test } from '@jest/globals';

import { availableTournamentLifecycleActions } from '../client/tournamentLifecycle';

const baseState = {
    status: 'started',
    system: 2,
    manualNextRoundPending: true,
    creatorCanManage: false,
    isDirector: false,
    isTeamTournament: false,
};

describe('tournament lifecycle controls', () => {
    test('lets a non-team creator start a pending manual round without exposing abort', () => {
        expect(availableTournamentLifecycleActions({ ...baseState, creatorCanManage: true })).toEqual([
            'start_next_round',
        ]);
    });

    test('lets a team tournament creator abort their fixed-round tournament', () => {
        expect(
            availableTournamentLifecycleActions({
                ...baseState,
                creatorCanManage: true,
                isTeamTournament: true,
            }),
        ).toEqual(['start_next_round', 'abort_tournament']);
    });

    test('lets a tournament director start a round and abort an active tournament', () => {
        expect(availableTournamentLifecycleActions({ ...baseState, isDirector: true })).toEqual([
            'start_next_round',
            'abort_tournament',
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

    test('hides creator controls after Team tournament permission is lost', () => {
        expect(
            availableTournamentLifecycleActions({
                ...baseState,
                isTeamTournament: true,
                creatorCanManage: false,
            }),
        ).toEqual([]);
    });

    test('hides all controls from ordinary users and after the tournament ends', () => {
        expect(availableTournamentLifecycleActions(baseState)).toEqual([]);
        expect(availableTournamentLifecycleActions({ ...baseState, status: 'finished', isDirector: true })).toEqual([]);
    });
});
