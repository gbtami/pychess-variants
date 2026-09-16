/**
 * Bounded, single-owner UCI search protocol for interactive analysis features.
 *
 * This class intentionally does not create or discover a Fairy-Stockfish worker.
 * The analysis page already owns the one browser engine; callers inject that
 * engine's postMessage path and route engine output through handleLine() while a
 * practice search owns the protocol. This keeps normal analysis and training on
 * one coordinated engine instead of creating a second global worker.
 */

export type AnalysisPracticeSearchOwner = Readonly<{
    session: number;
    search: number;
}>;

export type AnalysisPracticeScore = Readonly<{
    cp?: number;
    mate?: number;
}>;

export type AnalysisPracticeBound = 'upper' | 'lower';

export type AnalysisPracticeInfo = Readonly<{
    depth?: number;
    multiPv: number;
    score?: AnalysisPracticeScore;
    bound?: AnalysisPracticeBound;
    nodes?: number;
    timeMs?: number;
    pv: readonly string[];
}>;

export type AnalysisPracticeSearchBudget =
    | Readonly<{ type: 'nodes'; value: number }>
    | Readonly<{ type: 'movetime'; value: number }>
    | Readonly<{ type: 'depth'; value: number }>;

export type AnalysisPracticeEngineOption = Readonly<{
    name: string;
    value: string | number | boolean;
}>;

export type AnalysisPracticeSearchRequest = Readonly<{
    initialFen: string;
    moves?: readonly string[];
    budget: AnalysisPracticeSearchBudget;
    multiPv?: number;
    options?: readonly AnalysisPracticeEngineOption[];
    /**
     * Optional wall-clock cap. It is still clamped to the adapter-wide maximum.
     * Node/depth searches otherwise use the adapter-wide maximum directly.
     */
    timeoutMs?: number;
}>;

export type AnalysisPracticeUnavailableReason =
    | 'permission'
    | 'unsupported'
    | 'engine-not-ready'
    | 'engine-error'
    | 'timeout'
    | 'drain-timeout'
    | 'destroyed';

export type AnalysisPracticeEngineEvent =
    | Readonly<{
          type: 'info';
          owner: AnalysisPracticeSearchOwner;
          info: AnalysisPracticeInfo;
      }>
    | Readonly<{
          type: 'bestmove';
          owner: AnalysisPracticeSearchOwner;
          move: string | null;
          ponder?: string;
          info?: AnalysisPracticeInfo;
      }>
    | Readonly<{
          type: 'unavailable';
          owner: AnalysisPracticeSearchOwner;
          reason: AnalysisPracticeUnavailableReason;
          message?: string;
      }>;

export type AnalysisPracticeAvailability =
    | Readonly<{ available: true }>
    | Readonly<{
          available: false;
          reason: Extract<AnalysisPracticeUnavailableReason, 'permission' | 'unsupported' | 'engine-not-ready'>;
          message?: string;
      }>;

export interface AnalysisPracticeEngineHost {
    postMessage(command: string): void;
    availability?(): AnalysisPracticeAvailability;
}

export interface AnalysisPracticeEngineLimits {
    maxNodes: number;
    maxMovetimeMs: number;
    maxDepth: number;
    maxMultiPv: number;
    maxWallTimeMs: number;
    timeoutGraceMs: number;
    drainTimeoutMs: number;
}

const DEFAULT_LIMITS: AnalysisPracticeEngineLimits = {
    maxNodes: 1_000_000,
    maxMovetimeMs: 10_000,
    maxDepth: 30,
    maxMultiPv: 3,
    maxWallTimeMs: 12_000,
    timeoutGraceMs: 1_000,
    drainTimeoutMs: 2_000,
};

interface NormalizedSearchRequest {
    initialFen: string;
    moves: readonly string[];
    budget: AnalysisPracticeSearchBudget;
    multiPv: number;
    options: readonly AnalysisPracticeEngineOption[];
    timeoutMs: number;
}

interface SearchRecord {
    owner: AnalysisPracticeSearchOwner;
    request: NormalizedSearchRequest;
    lastPrimaryInfo?: AnalysisPracticeInfo;
}

interface DrainState {
    awaitingBestmove: boolean;
    awaitingReadyok: boolean;
    timer: number;
}

function finitePositiveInteger(value: number, label: string): number {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be a positive finite number.`);
    return Math.max(1, Math.floor(value));
}

function bounded(value: number, maximum: number): number {
    return Math.min(finitePositiveInteger(value, 'Search limit'), maximum);
}

function normalizeBestmove(move: string | undefined): string | null {
    if (!move || move === '(none)' || move === 'none' || move === '0000') return null;
    return move;
}

function parseNumber(value: string | undefined): number | undefined {
    if (value === undefined) return undefined;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseAnalysisPracticeInfo(line: string): AnalysisPracticeInfo | undefined {
    const parts = line.trim().split(/\s+/);
    if (parts[0] !== 'info' || parts[1] === 'string') return undefined;

    let depth: number | undefined;
    let multiPv = 1;
    let score: AnalysisPracticeScore | undefined;
    let bound: AnalysisPracticeBound | undefined;
    let nodes: number | undefined;
    let timeMs: number | undefined;
    let pv: readonly string[] = [];

    for (let i = 1; i < parts.length; i += 1) {
        switch (parts[i]) {
            case 'depth':
                depth = parseNumber(parts[++i]);
                break;
            case 'multipv':
                multiPv = parseNumber(parts[++i]) ?? 1;
                break;
            case 'score': {
                const kind = parts[++i];
                const value = parseNumber(parts[++i]);
                if (value !== undefined) {
                    if (kind === 'cp') score = { cp: value };
                    else if (kind === 'mate') score = { mate: value };
                }
                if (parts[i + 1] === 'upperbound') {
                    bound = 'upper';
                    i += 1;
                } else if (parts[i + 1] === 'lowerbound') {
                    bound = 'lower';
                    i += 1;
                }
                break;
            }
            case 'nodes':
                nodes = parseNumber(parts[++i]);
                break;
            case 'time':
                timeMs = parseNumber(parts[++i]);
                break;
            case 'pv':
                pv = parts.slice(i + 1);
                i = parts.length;
                break;
        }
    }

    if (depth === undefined && score === undefined && nodes === undefined && timeMs === undefined && pv.length === 0)
        return undefined;

    return { depth, multiPv, score, bound, nodes, timeMs, pv };
}

export function parseAnalysisPracticeBestmove(
    line: string,
): Readonly<{ move: string | null; ponder?: string }> | undefined {
    const parts = line.trim().split(/\s+/);
    if (parts[0] !== 'bestmove') return undefined;
    const move = normalizeBestmove(parts[1]);
    const ponder = parts[2] === 'ponder' ? parts[3] : undefined;
    return ponder ? { move, ponder } : { move };
}

export class AnalysisPracticeEngine {
    private readonly limits: AnalysisPracticeEngineLimits;
    private sessionGeneration = 0;
    private searchGeneration = 0;
    private current?: SearchRecord;
    private pending?: SearchRecord;
    private searchTimer = 0;
    private drain?: DrainState;
    private blocked?: Readonly<{ reason: AnalysisPracticeUnavailableReason; message?: string }>;
    private destroyed = false;

    constructor(
        private readonly host: AnalysisPracticeEngineHost,
        private readonly emit: (event: AnalysisPracticeEngineEvent) => void,
        limits: Partial<AnalysisPracticeEngineLimits> = {},
    ) {
        this.limits = { ...DEFAULT_LIMITS, ...limits };
    }

    /** Starts a fresh logical practice attempt. Searches from older sessions become stale immediately. */
    beginSession(): number {
        if (this.destroyed) return this.sessionGeneration;
        this.sessionGeneration += 1;
        this.searchGeneration = 0;
        this.dropPending();
        this.cancelCurrent(false);
        return this.sessionGeneration;
    }

    currentSession(): number {
        return this.sessionGeneration;
    }

    isCurrent(owner: AnalysisPracticeSearchOwner): boolean {
        return !this.destroyed && owner.session === this.sessionGeneration && owner.search === this.searchGeneration;
    }

    search(request: AnalysisPracticeSearchRequest): AnalysisPracticeSearchOwner {
        const owner = Object.freeze({
            session: this.sessionGeneration,
            search: ++this.searchGeneration,
        });
        const record: SearchRecord = { owner, request: this.normalizeRequest(request) };

        if (this.destroyed) {
            this.emitUnavailable(record, 'destroyed');
            return owner;
        }
        if (this.blocked) {
            this.emitUnavailable(record, this.blocked.reason, this.blocked.message);
            return owner;
        }

        this.dropPending();
        this.pending = record;
        if (this.current) this.cancelCurrent(false);
        this.startPendingIfIdle();
        return owner;
    }

    /**
     * Practice permission/support changes are fail-closed. A blocked adapter can be
     * unblocked after the caller has revalidated the current chapter/session.
     */
    setBlocked(
        reason: Extract<AnalysisPracticeUnavailableReason, 'permission' | 'unsupported' | 'engine-not-ready'> | null,
        message?: string,
    ): void {
        if (this.destroyed) return;
        this.blocked = reason ? { reason, message } : undefined;
        if (!reason) {
            this.startPendingIfIdle();
            return;
        }

        if (this.pending) {
            this.emitUnavailable(this.pending, reason, message);
            this.pending = undefined;
        }
        if (this.current) {
            const current = this.current;
            this.emitUnavailable(current, reason, message);
            this.cancelCurrent(false);
        }
    }

    /** Cancel the current/pending work without permanently blocking later searches. */
    cancel(): void {
        if (this.destroyed) return;
        this.dropPending();
        this.cancelCurrent(false);
    }

    /**
     * Route UCI output here before normal-analysis parsing while practice owns the
     * engine. Returns true when the line belonged to the practice protocol.
     */
    handleLine(rawLine: string): boolean {
        if (this.destroyed) return false;
        const line = String(rawLine ?? '').trim();

        if (this.drain) {
            if (line === 'readyok') {
                this.drain.awaitingReadyok = false;
                this.finishDrainIfComplete();
                return true;
            }
            if (line.startsWith('bestmove')) {
                if (this.drain.awaitingBestmove) {
                    this.drain.awaitingBestmove = false;
                    this.finishDrainIfComplete();
                }
                return true;
            }
            if (line.startsWith('info')) return true;
            return false;
        }

        const current = this.current;
        if (!current) return false;

        if (line.startsWith('info string ERROR:')) {
            const message = line.slice('info string ERROR:'.length).trim();
            const reason = /unsupported|unknown.*variant|variant.*unknown/i.test(message)
                ? 'unsupported'
                : 'engine-error';
            this.emitUnavailable(current, reason, message || undefined);
            this.cancelCurrent(false);
            return true;
        }

        const info = parseAnalysisPracticeInfo(line);
        if (info) {
            if (info.multiPv === 1) current.lastPrimaryInfo = info;
            this.emit({ type: 'info', owner: current.owner, info });
            return true;
        }

        const bestmove = parseAnalysisPracticeBestmove(line);
        if (bestmove) {
            this.clearSearchTimer();
            this.current = undefined;
            // Establish the drain before notifying consumers. A bestmove callback
            // is allowed to request the next evaluation immediately, and that
            // request must queue behind readyok rather than start a new position.
            this.beginDrain(false);
            this.emit({
                type: 'bestmove',
                owner: current.owner,
                move: bestmove.move,
                ...(bestmove.ponder ? { ponder: bestmove.ponder } : {}),
                ...(current.lastPrimaryInfo ? { info: current.lastPrimaryInfo } : {}),
            });
            return true;
        }

        return false;
    }

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.dropPending();
        this.clearSearchTimer();
        this.clearDrainTimer();
        if (this.current || this.drain) {
            try {
                this.host.postMessage('stop');
            } catch {
                // Browser teardown is best effort; no callbacks survive destroy().
            }
        }
        this.current = undefined;
        this.drain = undefined;
    }

    private normalizeRequest(request: AnalysisPracticeSearchRequest): NormalizedSearchRequest {
        const budget = this.normalizeBudget(request.budget);
        const multiPv = Math.min(
            finitePositiveInteger(request.multiPv ?? 1, 'MultiPV'),
            finitePositiveInteger(this.limits.maxMultiPv, 'Maximum MultiPV'),
        );
        const derivedTimeout =
            budget.type === 'movetime'
                ? Math.min(this.limits.maxWallTimeMs, budget.value + this.limits.timeoutGraceMs)
                : this.limits.maxWallTimeMs;
        const timeoutMs = Math.min(
            request.timeoutMs === undefined
                ? derivedTimeout
                : finitePositiveInteger(request.timeoutMs, 'Search timeout'),
            finitePositiveInteger(this.limits.maxWallTimeMs, 'Maximum wall time'),
        );

        return {
            initialFen: request.initialFen,
            moves: [...(request.moves ?? [])],
            budget,
            multiPv,
            options: [...(request.options ?? [])],
            timeoutMs,
        };
    }

    private normalizeBudget(budget: AnalysisPracticeSearchBudget): AnalysisPracticeSearchBudget {
        switch (budget.type) {
            case 'nodes':
                return { type: 'nodes', value: bounded(budget.value, this.limits.maxNodes) };
            case 'movetime':
                return { type: 'movetime', value: bounded(budget.value, this.limits.maxMovetimeMs) };
            case 'depth':
                return { type: 'depth', value: bounded(budget.value, this.limits.maxDepth) };
        }
    }

    private startPendingIfIdle(): void {
        if (this.destroyed || this.current || this.drain || !this.pending || this.blocked) return;

        const record = this.pending;
        this.pending = undefined;
        const availability = this.host.availability?.() ?? { available: true };
        if (!availability.available) {
            this.emitUnavailable(record, availability.reason, availability.message);
            return;
        }

        this.current = record;
        this.searchTimer = window.setTimeout(() => this.onSearchTimeout(record.owner), record.request.timeoutMs);
        try {
            for (const option of record.request.options) {
                if (option.name === 'MultiPV') continue;
                this.host.postMessage(`setoption name ${option.name} value ${String(option.value)}`);
            }
            this.host.postMessage(`setoption name MultiPV value ${record.request.multiPv}`);
            this.host.postMessage(this.positionCommand(record.request));
            this.host.postMessage(`go ${record.request.budget.type} ${record.request.budget.value}`);
        } catch (error) {
            this.clearSearchTimer();
            this.current = undefined;
            this.emitUnavailable(record, 'engine-error', error instanceof Error ? error.message : String(error));
            this.beginDrain(false);
        }
    }

    private positionCommand(request: NormalizedSearchRequest): string {
        const moves = request.moves.length > 0 ? ` moves ${request.moves.join(' ')}` : '';
        return `position fen ${request.initialFen}${moves}`;
    }

    private onSearchTimeout(owner: AnalysisPracticeSearchOwner): void {
        if (!this.current || this.current.owner !== owner) return;
        const current = this.current;
        this.emitUnavailable(current, 'timeout');
        this.cancelCurrent(false);
    }

    private cancelCurrent(emitDestroyed: boolean): void {
        const current = this.current;
        if (!current) return;
        this.clearSearchTimer();
        this.current = undefined;
        if (emitDestroyed) this.emitUnavailable(current, 'destroyed');
        this.beginDrain(true);
    }

    private beginDrain(awaitBestmove: boolean): void {
        if (this.destroyed) return;
        if (this.drain) {
            if (awaitBestmove) this.drain.awaitingBestmove = true;
            return;
        }

        const timer = window.setTimeout(() => this.failDrain(), this.limits.drainTimeoutMs);
        this.drain = { awaitingBestmove: awaitBestmove, awaitingReadyok: true, timer };
        try {
            if (awaitBestmove) this.host.postMessage('stop');
            this.host.postMessage('isready');
        } catch (error) {
            this.failDrain(error instanceof Error ? error.message : String(error));
        }
    }

    private finishDrainIfComplete(): void {
        const drain = this.drain;
        if (!drain || drain.awaitingBestmove || drain.awaitingReadyok) return;
        window.clearTimeout(drain.timer);
        this.drain = undefined;
        this.startPendingIfIdle();
    }

    private failDrain(message?: string): void {
        this.clearDrainTimer();
        this.drain = undefined;
        this.current = undefined;
        this.blocked = { reason: 'drain-timeout', message };
        if (this.pending) {
            this.emitUnavailable(this.pending, 'drain-timeout', message);
            this.pending = undefined;
        }
    }

    private clearSearchTimer(): void {
        if (this.searchTimer) window.clearTimeout(this.searchTimer);
        this.searchTimer = 0;
    }

    private clearDrainTimer(): void {
        if (this.drain) window.clearTimeout(this.drain.timer);
    }

    private dropPending(): void {
        this.pending = undefined;
    }

    private emitUnavailable(record: SearchRecord, reason: AnalysisPracticeUnavailableReason, message?: string): void {
        this.emit({
            type: 'unavailable',
            owner: record.owner,
            reason,
            ...(message ? { message } : {}),
        });
    }
}
