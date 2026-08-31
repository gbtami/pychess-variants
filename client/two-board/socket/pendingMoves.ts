import { MsgMove, MsgMovesAfterReconnect } from '../../messages';
import { BugBoardName } from '../../types';

// One pending-move-per-board cache per game, so a dropped connection can resend
// the last unconfirmed move for each board on reconnect. Keeping it in localStorage
// (rather than only in memory) means it also survives a page refresh.
export function pendingMovesStorageKey(gameId: string): string {
    return `bug-pending-moves:${gameId}`;
}

// `resent` is local bookkeeping and never leaves the browser: it records that this move was
// handed back to the server inside a `movesQueued` payload, which is what makes the mover's own
// clock value untrustworthy. See `loadPendingMoves()` and `consumePendingMove()`.
type StoredPendingMove = MsgMove & { resent?: boolean };
type StoredPendingMoves = Partial<Record<BugBoardName, StoredPendingMove>>;

function readStoredPendingMoves(gameId: string): StoredPendingMoves {
    const raw = localStorage.getItem(pendingMovesStorageKey(gameId));
    return raw ? JSON.parse(raw) : {};
}

function writeStoredPendingMoves(gameId: string, stored: StoredPendingMoves): void {
    localStorage.setItem(pendingMovesStorageKey(gameId), JSON.stringify(stored));
}

// Builds the reconnect message straight from localStorage: movesQueued[0] is always
// processed first by server, then movesQueued[1] if any (only possible in simul mode).
export function loadPendingMoves(gameId: string): MsgMovesAfterReconnect {
    const stored = readStoredPendingMoves(gameId);
    const queued = Object.values(stored).sort((a, b) => a.ply - b.ply);

    // Remember what we are about to resend. `handle_reconnect_bughouse` replays a queued move
    // with the SERVER's clocks — it has to, the copies here carry the `[-1, -1]` placeholders
    // written below — so the value the mover paused locally is the stale one, and the
    // confirmation for this move must be allowed to overwrite it even though that clock is not
    // running. `consumePendingMove()` is where that is read.
    if (queued.length > 0) {
        const marked: StoredPendingMoves = {};
        queued.forEach(entry => (marked[entry.board as BugBoardName] = { ...entry, resent: true }));
        writeStoredPendingMoves(gameId, marked);
    }

    const movesQueued: MsgMove[] = queued.map(entry => {
        const msg: StoredPendingMove = { ...entry };
        delete msg.resent;
        return msg as MsgMove;
    });

    return { type: 'reconnect', gameId, movesQueued };
}

/** The server has acknowledged `move` on `board`, so this cache entry is done: drop it.
 *
 * Returns whether that entry had been RESENT, which tells the caller its locally paused clock
 * for that seat is stale and the server's value in the confirming message should win.
 *
 * Dropping it here is what finally bounds this cache. A confirmation is the only moment when
 * removal is provably safe — the server has just replied about this exact move, so there is
 * nothing left to resend — and leaving entries behind is why a stale one used to be resent on
 * every later reconnect ("move already played - probably resent twice" in the server log). */
export function consumePendingMove(gameId: string, board: BugBoardName, move: string): boolean {
    const stored = readStoredPendingMoves(gameId);
    const entry = stored[board];
    if (entry === undefined || entry.move !== move) return false;

    const resent = entry.resent === true;
    delete stored[board];
    writeStoredPendingMoves(gameId, stored);
    return resent;
}

export function recordPendingMove(gameId: string, moveMsg: MsgMove): void {
    // Clock times are only meaningful at the moment the move was made; by the time we'd
    // actually resend this (after a reconnect, possibly much later), they'd be stale,
    // so they're blanked out before the move ever reaches localStorage.
    const stored = readStoredPendingMoves(gameId);
    stored[moveMsg.board as BugBoardName] = { ...moveMsg, clocks: [-1, -1], clocksB: [-1, -1] };
    writeStoredPendingMoves(gameId, stored);
}
