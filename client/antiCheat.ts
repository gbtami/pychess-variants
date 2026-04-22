export const CEVAL_DISABLE_STORAGE_KEY = 'ceval.disable';
export const CEVAL_POSITION_STORAGE_KEY = 'ceval.position';
export const CEVAL_ACTIVE_ROUNDS_STORAGE_KEY = 'ceval.activeRounds';
export const MIN_CEVAL_REPORT_PLY = 6;
export const MIN_CEVAL_REPORT_PLY_CHESS960 = 1;
export const CEVAL_ACTIVE_ROUND_HEARTBEAT_MS = 15_000;

const CEVAL_ACTIVE_ROUND_TTL_MS = 60_000;
const CEVAL_TAB_ID_SESSION_KEY = 'ceval.tabId';

interface ActiveCevalRoundPayload {
    gameId: string;
    updatedAt: number;
}

type ActiveCevalRoundsState = Record<string, ActiveCevalRoundPayload>;

let fallbackCevalTabId: string | undefined;

export interface CevalPositionPayload {
    variant: string;
    chess960: boolean;
    fen: string;
}

type CevalStoragePayload = CevalPositionPayload & {
    at: number;
};

export function buildCevalPositionPayload(
    variant: string,
    chess960: boolean,
    fen: string,
): CevalPositionPayload {
    return { variant, chess960, fen };
}

function boardOnlyFen(fen: string): string {
    return fen.split(' ')[0];
}

function makeCevalTabId(now: number): string {
    return `ceval-${now}-${Math.random().toString(36).slice(2, 10)}`;
}

function getCevalTabId(now: number): string {
    try {
        const existing = sessionStorage.getItem(CEVAL_TAB_ID_SESSION_KEY);
        if (existing) return existing;

        const created = makeCevalTabId(now);
        sessionStorage.setItem(CEVAL_TAB_ID_SESSION_KEY, created);
        return created;
    } catch (_error) {
        fallbackCevalTabId ??= makeCevalTabId(now);
        return fallbackCevalTabId;
    }
}

function parseActiveCevalRoundsState(raw: string | null): ActiveCevalRoundsState {
    if (!raw) return {};

    try {
        const parsed = JSON.parse(raw) as Record<string, Partial<ActiveCevalRoundPayload>>;
        const state: ActiveCevalRoundsState = {};
        for (const [tabId, entry] of Object.entries(parsed)) {
            if (
                typeof tabId === 'string'
                && typeof entry.gameId === 'string'
                && typeof entry.updatedAt === 'number'
            ) {
                state[tabId] = {
                    gameId: entry.gameId,
                    updatedAt: entry.updatedAt,
                };
            }
        }
        return state;
    } catch (_error) {
        return {};
    }
}

function pruneActiveCevalRoundsState(
    state: ActiveCevalRoundsState,
    now: number,
): ActiveCevalRoundsState {
    return Object.fromEntries(
        Object.entries(state).filter(([, entry]) => now - entry.updatedAt <= CEVAL_ACTIVE_ROUND_TTL_MS)
    );
}

function readActiveCevalRoundsState(now: number): ActiveCevalRoundsState {
    try {
        const raw = localStorage.getItem(CEVAL_ACTIVE_ROUNDS_STORAGE_KEY);
        const parsed = parseActiveCevalRoundsState(raw);
        const pruned = pruneActiveCevalRoundsState(parsed, now);

        if (JSON.stringify(parsed) !== JSON.stringify(pruned)) {
            localStorage.setItem(CEVAL_ACTIVE_ROUNDS_STORAGE_KEY, JSON.stringify(pruned));
        }

        return pruned;
    } catch (_error) {
        return {};
    }
}

function writeActiveCevalRoundsState(state: ActiveCevalRoundsState): void {
    try {
        localStorage.setItem(CEVAL_ACTIVE_ROUNDS_STORAGE_KEY, JSON.stringify(state));
    } catch (_error) {
        // Ignore storage failures in restricted browser contexts.
    }
}

export function minCevalReportPly(chess960: boolean): number {
    return chess960 ? MIN_CEVAL_REPORT_PLY_CHESS960 : MIN_CEVAL_REPORT_PLY;
}

export function sameCevalPosition(
    left: CevalPositionPayload,
    right: CevalPositionPayload,
): boolean {
    return boardOnlyFen(left.fen) === boardOnlyFen(right.fen);
}

export function publishCevalDisable(): void {
    localStorage.setItem(CEVAL_DISABLE_STORAGE_KEY, JSON.stringify({ at: Date.now() }));
}

export function publishCevalPosition(payload: CevalPositionPayload): void {
    const eventPayload: CevalStoragePayload = { ...payload, at: Date.now() };
    localStorage.setItem(CEVAL_POSITION_STORAGE_KEY, JSON.stringify(eventPayload));
}

export function upsertActiveCevalRound(gameId: string, now: number = Date.now()): void {
    const state = readActiveCevalRoundsState(now);
    state[getCevalTabId(now)] = { gameId, updatedAt: now };
    writeActiveCevalRoundsState(state);
}

export function removeActiveCevalRound(now: number = Date.now()): void {
    const state = readActiveCevalRoundsState(now);
    const tabId = getCevalTabId(now);
    if (!(tabId in state)) return;

    delete state[tabId];
    writeActiveCevalRoundsState(state);
}

export function hasActiveEligibleLiveGame(now: number = Date.now()): boolean {
    return Object.keys(readActiveCevalRoundsState(now)).length > 0;
}

export function parseCevalPositionPayload(raw: string | null): CevalPositionPayload | undefined {
    if (!raw) return;

    try {
        const payload = JSON.parse(raw) as Partial<CevalStoragePayload>;
        if (
            typeof payload.variant !== 'string'
            || typeof payload.chess960 !== 'boolean'
            || typeof payload.fen !== 'string'
        ) {
            return;
        }
        return {
            variant: payload.variant,
            chess960: payload.chess960,
            fen: payload.fen,
        };
    } catch (_error) {
        return;
    }
}
