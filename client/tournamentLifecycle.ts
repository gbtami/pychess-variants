import { h, VNode } from 'snabbdom';

import { _ } from './i18n';

export interface TournamentLifecycleState {
    status: string;
    system: number;
    manualNextRoundPending: boolean;
    isCreator: boolean;
    isDirector: boolean;
}

export function availableTournamentLifecycleActions(
    state: TournamentLifecycleState,
): Array<'start_next_round' | 'abort_tournament'> {
    const actions: Array<'start_next_round' | 'abort_tournament'> = [];
    if (
        state.status === 'started' &&
        state.system > 0 &&
        state.manualNextRoundPending &&
        (state.isCreator || state.isDirector)
    ) {
        actions.push('start_next_round');
    }
    if (state.isDirector && (state.status === 'created' || state.status === 'started')) {
        actions.push('abort_tournament');
    }
    return actions;
}

export function tournamentLifecycleView(
    state: TournamentLifecycleState,
    startNextRound: () => void,
    abortTournament: () => void,
): VNode {
    const actions = availableTournamentLifecycleActions(state);
    return h(
        'div#tournament-lifecycle.tournament-lifecycle',
        actions.map(action =>
            action === 'start_next_round'
                ? h(
                      'button.button.tournament-lifecycle__start',
                      { props: { type: 'button' }, on: { click: startNextRound } },
                      _('START NEXT ROUND'),
                  )
                : h(
                      'button.button.button-red.tournament-lifecycle__abort',
                      { props: { type: 'button' }, on: { click: abortTournament } },
                      _('ABORT TOURNAMENT'),
                  ),
        ),
    );
}
