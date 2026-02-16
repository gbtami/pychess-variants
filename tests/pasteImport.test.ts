import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, expect, jest, test } from '@jest/globals';

import { FairyStockfish } from 'ffish-es6';

import { pasteView, recordImportFfishError } from '../client/paste';
import { PyChessModel } from '../client/types';

const GRAND_PGN = `[Event "PyChess rated game"]
[Site "https://www.pychess.org/7sApQgpB"]
[Date "2024.12.26"]
[Round "-"]
[White "gbtami"]
[Black "PraseodymiumSpike"]
[Result "1-0"]
[TimeControl "600+5"]
[WhiteElo "1589"]
[BlackElo "1016?"]
[Variant "Grand"]
[FEN "r8r/1nbqkcabn1/pppppppppp/10/10/10/10/PPPPPPPPPP/1NBQKCABN1/R8R w - - 0 1"]
[SetUp "1"]

1. e5 Ce7 2. g4 c7 3. f5 g7 4. c4 b6 5. d5 Cc8 6. Be4 f7 7. Cd3 Ac5 8. Cxc5 bxc5 9. Bf4 Cb6 10. Qc3 Qb7 11. Bc2 i7 12. Nd3 Ba7 13. Nxc5 Qb8 14. Ae4 Ci6 15. Bh2 d6 16. Nd3 Nh7 17. Nh4 Ng5 18. Ad2 Cj6 19. Axg5 h6 20. Ae7 Rad10 21. exd6 Rd7 22. Qxg7+ Ke10 23. Qxj10+ Ke9 24. Qg7+ Ke10 25. Af8+ 1-0`;

const GRAND_UCI_MOVES =
    'e3e5 f9e7 g3g4 c8c7 f3f5 g8g7 c3c4 b8b6 d3d5 e7c8 c2e4 f8f7 f2d3 g9c5 d3c5 b6c5 h2f4 c8b6 d2c3 d9b7 e4c2 i8i7 b2d3 c9a7 d3c5 b7b8 g2e4 b6i6 f4h2 d8d6 c5d3 i9h7 i2h4 h7g5 e4d2 i6j6 d2g5 h8h6 g5e7 a10d10 e5d6 d10d7 c3g7 e9e10 g7j10 e10e9 j10g7 e9e10 e7f8';

type QueuedXhrResponse = {
    status: number;
    body: Record<string, string> | string;
    networkError?: boolean;
    skipReadyState?: boolean;
};

let ffish: FairyStockfish;
let queuedXhrResponses: QueuedXhrResponse[] = [];
let sentBodies: FormData[] = [];
let alertSpy: jest.SpiedFunction<typeof window.alert>;
let warnSpy: jest.SpiedFunction<typeof console.warn>;

const originalXHR = global.XMLHttpRequest;

class FakeXMLHttpRequest {
    readyState = 0;
    status = 0;
    responseText = '';
    onreadystatechange: ((this: XMLHttpRequest, ev: Event) => unknown) | null = null;
    onerror: ((this: XMLHttpRequest, ev: Event) => unknown) | null = null;

    open(_method: string, _url: string, _async?: boolean): void {
        // No-op for tests.
    }

    send(body?: Document | XMLHttpRequestBodyInit | null): void {
        if (body instanceof FormData) {
            sentBodies.push(body);
        }

        const response = queuedXhrResponses.shift();
        if (response?.networkError) {
            this.onerror?.call(this as unknown as XMLHttpRequest, new Event('error'));
            return;
        }
        if (response?.skipReadyState) {
            return;
        }

        this.readyState = 4;
        this.status = response?.status ?? 200;
        const rawBody = response?.body ?? {};
        this.responseText = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
        this.onreadystatechange?.call(this as unknown as XMLHttpRequest, new Event('readystatechange'));
    }
}

function queueXhrResponse(response: QueuedXhrResponse): void {
    queuedXhrResponses.push(response);
}

function makeModel(): PyChessModel {
    return {
        ffish,
        home: '/home',
        username: 'tester',
    } as unknown as PyChessModel;
}

function triggerImport(model: PyChessModel, pgn: string): void {
    document.body.innerHTML = '<textarea id="pgnpaste"></textarea>';
    const textarea = document.getElementById('pgnpaste') as HTMLTextAreaElement;
    textarea.value = pgn;

    const root: any = pasteView(model)[0];
    const clickImport = root.children[0].children[2].children[0].data.on.click as () => void;
    clickImport();
}

beforeAll(async () => {
    (global as any).XMLHttpRequest = FakeXMLHttpRequest;

    alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const ffishModuleNs: any = await import('ffish-es6');
    const initFfish =
        ffishModuleNs.default?.default ?? ffishModuleNs.default ?? ffishModuleNs;
    const wasmPath = path.resolve(process.cwd(), 'node_modules/ffish-es6/ffish.wasm');
    ffish = await initFfish({
        wasmBinary: fs.readFileSync(wasmPath),
        printErr: recordImportFfishError,
    });
});

afterAll(() => {
    (global as any).XMLHttpRequest = originalXHR;
    alertSpy.mockRestore();
    warnSpy.mockRestore();
});

beforeEach(() => {
    queuedXhrResponses = [];
    sentBodies = [];
    alertSpy.mockClear();
    document.body.innerHTML = '';
});

test('prepares and submits a valid Grand PGN import request', () => {
    queueXhrResponse({ status: 200, body: { gameId: 'AbCd1234' }, skipReadyState: true });

    triggerImport(makeModel(), GRAND_PGN);

    expect(sentBodies).toHaveLength(1);
    const sent = sentBodies[0];
    expect(sent.get('Variant')).toBe('Grand');
    expect(sent.get('moves')).toBe(GRAND_UCI_MOVES);
    expect(sent.get('final_fen')).toBe(
        '4k5/1n5b2/pq2pA3p/b1pr1pQ1p1/3P3p1c/3P1P4/2P3PN2/PP1N3PPP/2B1K2B2/R8R b - - 4 25',
    );
    expect(window.alert).not.toHaveBeenCalled();
});

test('shows a clear error for unsupported Variant tags', () => {
    const unsupportedVariantPgn = GRAND_PGN.replace('[Variant "Grand"]', '[Variant "NoSuchVariant"]');

    triggerImport(makeModel(), unsupportedVariantPgn);

    expect(sentBodies).toHaveLength(0);
    expect(window.alert).toHaveBeenCalledWith('Unsupported PGN Variant tag: NoSuchVariant.');
});

test('shows mapped FEN validation errors', () => {
    const invalidFenPgn = GRAND_PGN.replace(
        '[FEN "r8r/1nbqkcabn1/pppppppppp/10/10/10/10/PPPPPPPPPP/1NBQKCABN1/R8R w - - 0 1"]',
        '[FEN "bad fen"]',
    );

    triggerImport(makeModel(), invalidFenPgn);

    expect(sentBodies).toHaveLength(0);
    expect(window.alert).toHaveBeenCalledWith(
        'Invalid [FEN] tag (code -10): Invalid character in board layout.',
    );
});

test('shows parser move errors from Fairy-Stockfish bindings', () => {
    const invalidMovePgn = GRAND_PGN.replace('1. e5 Ce7', '1. e5 Cz9');

    triggerImport(makeModel(), invalidMovePgn);

    expect(sentBodies).toHaveLength(0);
    expect(window.alert).toHaveBeenCalled();
    const firstCallArg = (window.alert as jest.Mock).mock.calls[0][0] as string;
    expect(firstCallArg).toContain('The given sanMove');
});

test('shows backend import errors returned as non-200 responses', () => {
    queueXhrResponse({
        status: 400,
        body: { error: "Invalid move 'Cz9' at ply 2 in imported PGN." },
    });

    triggerImport(makeModel(), GRAND_PGN);

    expect(sentBodies).toHaveLength(1);
    expect(window.alert).toHaveBeenCalledWith("Invalid move 'Cz9' at ply 2 in imported PGN.");
});

test('shows generic import error for XHR network failures', () => {
    queueXhrResponse({
        status: 0,
        body: '',
        networkError: true,
    });

    triggerImport(makeModel(), GRAND_PGN);

    expect(sentBodies).toHaveLength(1);
    expect(window.alert).toHaveBeenCalledWith('Import failed');
});
