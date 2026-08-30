export type OngoingGamesMode = 'corr' | 'simul';

export interface OngoingGameSelectionData {
    gameId: string;
    tp: string;
    mins?: number;
    date: string;
    status?: number;
}

export function compareGames(username: string, mode: OngoingGamesMode = 'corr') {
    const now = Date.now();
    const correspondenceDeadline = (game: OngoingGameSelectionData): number => {
        if (typeof game.mins === 'number') return now + game.mins * 60_000;
        const deadline = Date.parse(game.date);
        return Number.isNaN(deadline) ? Number.POSITIVE_INFINITY : deadline;
    };

    return function (a: OngoingGameSelectionData, b: OngoingGameSelectionData) {
        const aFinished = typeof a.status === 'number' && a.status >= 0;
        const bFinished = typeof b.status === 'number' && b.status >= 0;
        if (aFinished && !bFinished) return 1;
        if (!aFinished && bFinished) return -1;

        const aIsUserTurn = a.tp === username;
        const bIsUserTurn = b.tp === username;
        if (aIsUserTurn && !bIsUserTurn) return -1;
        if (!aIsUserTurn && bIsUserTurn) return 1;

        if (mode === 'simul') {
            return a.gameId.localeCompare(b.gameId);
        }

        const aDeadline = correspondenceDeadline(a);
        const bDeadline = correspondenceDeadline(b);
        if (aDeadline < bDeadline) return -1;
        if (aDeadline > bDeadline) return 1;
        return 0;
    };
}

export function nextGameToPlay<T extends OngoingGameSelectionData>(
    games: T[],
    username: string,
    currentGameId: string,
    mode: OngoingGamesMode,
): T | undefined {
    return games
        .filter(
            game =>
                game.gameId !== currentGameId &&
                game.tp === username &&
                (typeof game.status !== 'number' || game.status < 0),
        )
        .sort(compareGames(username, mode))[0];
}
