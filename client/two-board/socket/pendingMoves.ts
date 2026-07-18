import { MsgMove, MsgMovesAfterReconnect } from '../../messages';
import { BugBoardName } from '../../types';

// One pending-move-per-board cache per game, so a dropped connection can resend
// the last unconfirmed move for each board on reconnect. Keeping it in localStorage
// (rather than only in memory) means it also survives a page refresh.
export function pendingMovesStorageKey(gameId: string): string {
    return `bug-pending-moves:${gameId}`;
}

type StoredPendingMoves = Partial<Record<BugBoardName, MsgMove>>;

function readStoredPendingMoves(gameId: string): StoredPendingMoves {
    const raw = localStorage.getItem(pendingMovesStorageKey(gameId));
    return raw ? JSON.parse(raw) : {};
}

// Builds the reconnect message straight from localStorage: movesQueued[0] is always
// processed first by server, then movesQueued[1] if any (only possible in simul mode).
export function loadPendingMoves(gameId: string): MsgMovesAfterReconnect {
    const stored = readStoredPendingMoves(gameId);
    const movesQueued = Object.values(stored).sort((a, b) => a.ply - b.ply);

    return { type: 'reconnect', gameId, movesQueued };
}

export function recordPendingMove(gameId: string, moveMsg: MsgMove): void {
    // Clock times are only meaningful at the moment the move was made; by the time we'd
    // actually resend this (after a reconnect, possibly much later), they'd be stale,
    // so they're blanked out before the move ever reaches localStorage.
    const stored = readStoredPendingMoves(gameId);
    stored[moveMsg.board as BugBoardName] = { ...moveMsg, clocks: [-1, -1], clocksB: [-1, -1] };
    localStorage.setItem(pendingMovesStorageKey(gameId), JSON.stringify(stored));
}
