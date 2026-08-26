import { h, VNode } from 'snabbdom';

import { _ } from './i18n';

export interface TournamentLifecycleState {
    status: string;
    system: number;
    manualNextRoundPending: boolean;
    creatorCanManage: boolean;
    isDirector: boolean;
}

export function availableTournamentLifecycleActions(
    state: TournamentLifecycleState,
): Array<'start_next_round'> {
    const actions: Array<'start_next_round'> = [];
    if (
        state.status === 'started' &&
        state.system > 0 &&
        state.manualNextRoundPending &&
        (state.creatorCanManage || state.isDirector)
    ) {
        actions.push('start_next_round');
    }
    return actions;
}

export function tournamentLifecycleView(
    state: TournamentLifecycleState,
    startNextRound: () => void,
): VNode {
    const actions = availableTournamentLifecycleActions(state);
    return h(
        'div#tournament-lifecycle.tournament-lifecycle',
        actions.map(() =>
            h(
                'button.button.tournament-lifecycle__start',
                { props: { type: 'button' }, on: { click: startNextRound } },
                _('START NEXT ROUND'),
            ),
        ),
    );
}
