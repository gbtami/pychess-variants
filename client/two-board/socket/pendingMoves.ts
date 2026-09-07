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

/* OWNED BY `ReconnectController`, WHICH IS ITS ONLY CALLER. These are storage primitives; every
   decision about WHEN to record, consume, reconcile or clear belongs to the controller, because each
   of those answers a different reconnect case and the cases only make sense beside each other.

   EVERY STORAGE ACCESS IS GUARDED, and the reason is `recordPendingMove()`: it runs inside
   `sendMove()` on the line before the move is handed to the socket, so anything it throws takes
   the move with it and the player cannot move at all. localStorage throws for reasons that have
   nothing to do with this game — a browser set to block site data, a private window, a full quota,
   a corrupted value left by an older version of this code. A cache that cannot be written is a
   lost RESEND, which costs nothing until a connection also drops; a cache that throws is a lost
   MOVE. The one-board round page draws the same line (`roundCtrl.ts`, "Keep gameplay robust even
   if storage is blocked/corrupted"). */
function readStoredPendingMoves(gameId: string): StoredPendingMoves {
    try {
        const raw = localStorage.getItem(pendingMovesStorageKey(gameId));
        return raw ? JSON.parse(raw) : {};
    } catch (e) {
        console.warn('Failed to read pending move cache', e);
        return {};
    }
}

/** Writes the cache, and REMOVES the key outright once nothing is pending.
 *
 * Storing `{}` would leave one key per game behind forever — a bughouse player accumulates one
 * for every game they ever play, none of which will be read again. */
function writeStoredPendingMoves(gameId: string, stored: StoredPendingMoves): void {
    try {
        if (Object.keys(stored).length === 0) localStorage.removeItem(pendingMovesStorageKey(gameId));
        else localStorage.setItem(pendingMovesStorageKey(gameId), JSON.stringify(stored));
    } catch (e) {
        console.warn('Failed to write pending move cache', e);
    }
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
 * A confirmation is the moment when removal is provably safe — the server has just replied about
 * this exact move, so there is nothing left to resend — and leaving entries behind is why a stale
 * one used to be resent on every later reconnect ("move already played - probably resent twice" in
 * the server log). It is NOT the only moment: a resent move that the server recognises as a
 * duplicate is answered with that log line and nothing else, so no confirmation ever arrives for
 * it. `reconcilePendingMove()` and `clearPendingMoves()` close that gap. */
export function consumePendingMove(gameId: string, board: BugBoardName, move: string): boolean {
    const stored = readStoredPendingMoves(gameId);
    const entry = stored[board];
    if (entry === undefined || entry.move !== move) return false;

    const resent = entry.resent === true;
    delete stored[board];
    writeStoredPendingMoves(gameId, stored);
    return resent;
}

/** Drops the cached move for `board` if an authoritative board snapshot shows the server already
 * holds it — `lastMove` is that board's last move in the snapshot.
 *
 * This is the case a confirmation never covers. Resending a move the server has already played
 * makes it take the `lastmovePerBoardAndUser` branch in `bug/utils_bug.py`, which logs and
 * returns: correct, harmless, and silent. Without this the entry survives that reconnect and is
 * resent again on the next one, which is the loop the cache was meant to end.
 *
 * Matching on the move rather than on a ply, deliberately. A ply comparison would also consume an
 * entry whose move never reached the server at all — the global ply advances on the OTHER board's
 * moves too — and that entry is the one thing that can still recover the move. Equality can only
 * be true of a move the server has actually played. It does leave one case for
 * `clearPendingMoves()`: a snapshot taken after the opponent has replied shows their move here,
 * not ours. */
export function reconcilePendingMove(gameId: string, board: BugBoardName, lastMove: string | undefined): void {
    if (lastMove === undefined) return;
    const stored = readStoredPendingMoves(gameId);
    if (stored[board]?.move !== lastMove) return;

    delete stored[board];
    writeStoredPendingMoves(gameId, stored);
}

/** Forgets everything cached for this game. Called when the game ends, which is what finally
 * bounds the cache: a finished game can never accept a resend, so whatever is left — an entry the
 * server silently deduplicated, a move made as the result arrived — is dead weight, and the key
 * itself goes with it. */
export function clearPendingMoves(gameId: string): void {
    writeStoredPendingMoves(gameId, {});
}

/** The move waiting to be sent for this board, if there is one, without disturbing it.
 *
 * The durable half of "is a move waiting": it survives the page, and only storage can answer it. */
export function pendingMove(gameId: string, board: BugBoardName): string | undefined {
    return readStoredPendingMoves(gameId)[board]?.move;
}

export function recordPendingMove(gameId: string, moveMsg: MsgMove): void {
    // Clock times are only meaningful at the moment the move was made; by the time we'd
    // actually resend this (after a reconnect, possibly much later), they'd be stale,
    // so they're blanked out before the move ever reaches localStorage.
    const stored = readStoredPendingMoves(gameId);
    stored[moveMsg.board as BugBoardName] = { ...moveMsg, clocks: [-1, -1], clocksB: [-1, -1] };
    writeStoredPendingMoves(gameId, stored);
}
