import type { CreateMode } from '../lobbyType';

export function shouldShowRatingRange(
    createMode: CreateMode,
    hasChallengeTarget: boolean,
    catalogued: boolean,
): boolean {
    return createMode === 'createGame' && !hasChallengeTarget && !catalogued;
}
