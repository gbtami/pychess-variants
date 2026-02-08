import { MsgMove } from "./messages";

export type PendingMoveOnOpenAction = "resend" | "clear" | "noop";

// One pending move cache entry per game. Keeping the key game-scoped prevents any
// accidental cross-game reuse if the user quickly switches tabs/games.
export function pendingMoveStorageKey(gameId: string): string {
    return `round-pending-move:${gameId}`;
}

// We intentionally validate only the minimum fields needed for safe resend decisions.
// If payload shape does not match, callers treat it as absent and clear local cache.
function isValidPendingMove(value: unknown, gameId: string): value is MsgMove {
    if (typeof value !== "object" || value === null) return false;
    const move = value as MsgMove;
    if (move.type !== "move") return false;
    if (move.gameId !== gameId) return false;
    if (typeof move.move !== "string") return false;
    if (!Array.isArray(move.clocks) || move.clocks.length < 2) return false;
    if (typeof move.clocks[0] !== "number" || typeof move.clocks[1] !== "number") return false;
    if (typeof move.ply !== "number") return false;
    return true;
}

// Parse localStorage entry safely.
// Returns undefined for all malformed/wrong-game/stale-shape values so callers can
// drop bad cache entries instead of throwing during game initialization.
export function parsePendingMove(raw: string | null, gameId: string): MsgMove | undefined {
    if (!raw) return undefined;
    try {
        const parsed = JSON.parse(raw);
        return isValidPendingMove(parsed, gameId) ? parsed : undefined;
    } catch {
        return undefined;
    }
}

// Reconnect/open policy:
// - resend only when local board is exactly one ply behind cached move
// - clear in all other cached-move cases to avoid stale or position-mismatched sends
// - noop when there is no cached move
//
// Why exactly one ply?
// The cached move was created from local state at "current ply + 1". If relation no
// longer holds after reconnect/load, local and cached contexts diverged, so safest
// action is to clear and rely on fresh board sync from server.
export function pendingMoveOnOpenAction(
    pendingMove: MsgMove | undefined,
    currentPly: number,
): PendingMoveOnOpenAction {
    if (!pendingMove) return "noop";
    if (pendingMove.ply === currentPly + 1) return "resend";
    return "clear";
}

// Once server reports ply >= cached pending ply, that move is no longer pending:
// either it was accepted or game advanced past it. In both cases, cached resend
// state must be removed to prevent stale retries after future reconnects/reloads.
export function shouldClearPendingMoveByServerPly(
    pendingMove: MsgMove | undefined,
    serverPly: number,
): boolean {
    return !!pendingMove && serverPly >= pendingMove.ply;
}
