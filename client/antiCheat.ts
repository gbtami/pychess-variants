export const CEVAL_DISABLE_STORAGE_KEY = 'ceval.disable';
export const CEVAL_POSITION_STORAGE_KEY = 'ceval.position';
export const MIN_CEVAL_REPORT_PLY = 6;

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
