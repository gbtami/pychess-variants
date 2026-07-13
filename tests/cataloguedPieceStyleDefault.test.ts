import { afterEach, expect, test } from '@jest/globals';

import { boardSettings } from '../client/boardSettings';
import {
    CataloguedVariantClientDocument,
    FsfVariantInfo,
    cataloguedCompatiblePieceFamily,
    PIECE_FAMILIES,
    registerCataloguedVariant,
    unregisterCataloguedVariant,
    VARIANTS,
} from '../client/variants';
import { fsfPiece, makeFsfVariantInfo } from './fsfVariantInfoFixture';

const variantNames: string[] = [];

function metaFromInfo(
    info: FsfVariantInfo,
    overrides: Partial<CataloguedVariantClientDocument> = {},
): CataloguedVariantClientDocument {
    const pieces = [
        ...new Set(info.pieces.flatMap(piece => [piece.fen.white, piece.fen.black]).map(role => role.toLowerCase())),
    ].filter(role => /^[a-z]$/.test(role));
    return {
        name: info.name,
        displayName: info.name,
        tooltip: 'Catalogued variant',
        ini: `[${info.name}:chess]\n# Deliberately not used by client-side rule inference.`,
        baseVariant: info.template || undefined,
        startFen: info.board.startFen,
        width: info.board.width,
        height: info.board.height,
        pieces: pieces as CataloguedVariantClientDocument['pieces'],
        kingRoles: ['k'],
        fsfVariantInfo: info,
        ...overrides,
    };
}

function register(meta: CataloguedVariantClientDocument) {
    variantNames.push(meta.name);
    registerCataloguedVariant(meta);
    return VARIANTS[meta.name];
}

afterEach(() => {
    variantNames.splice(0).forEach(name => {
        unregisterCataloguedVariant(name);
        delete localStorage[`${name}-piece`];
        delete boardSettings.settings[`${name}-piece`];
    });
});

test('resolved standard pieces default to the compatible standard family', () => {
    const name = 'testbuiltindefault';
    const info = makeFsfVariantInfo({
        name,
        pieces: [fsfPiece('king', 'K'), fsfPiece('pawn', 'P')],
        pieceTypes: ['king', 'pawn'],
    });
    const meta = metaFromInfo(info);
    const variant = register(meta);

    expect(variant.pieceFamily).toBe(cataloguedCompatiblePieceFamily(meta, { ignoreCustomPieceSet: true }));
    expect(boardSettings.pieceCSS(variant.pieceFamily, variant)).toBe(PIECE_FAMILIES[variant.pieceFamily].pieceCSS[0]);
});

test('catalogued wall pieces are marked when both board and piece families are built in', () => {
    const variant = register({
        name: 'testmakrukwall',
        displayName: 'Test Makruk Wall',
        tooltip: 'Catalogued variant',
        ini: '[testmakrukwall:makruk]',
        baseVariant: 'makruk',
        startFen: '8/8/6**/**4*m/M*4**/**6/8/8 w - - 0 1',
        width: 8,
        height: 8,
        pieces: ['m', 's', 'n'],
        kingRoles: [],
        promotionType: 'regular',
        promotionRoles: ['s'],
        promotionOrder: ['n'],
    });
    const board = document.createElement('div');
    const wrap = document.createElement('div');
    board.className = `${variant.boardFamily} ${variant.pieceFamily}`;
    board.appendChild(wrap);
    document.body.appendChild(board);

    expect(variant.boardFamily).toBe('makruk8x8');
    expect(variant.pieceFamily).toBe('makruk');

    boardSettings.updateScopedPieceStyle(variant, wrap);
    expect(board.classList.contains('catalogued-piece-variant')).toBe(true);
    expect(board.classList.contains('catalogued-missing-piece-fallback')).toBe(true);

    boardSettings.updateScopedPieceStyle(VARIANTS.makruk, wrap);
    expect(board.classList.contains('catalogued-piece-variant')).toBe(false);
    expect(board.classList.contains('catalogued-missing-piece-fallback')).toBe(false);
    board.remove();
});

test('resolved custom pieces default to letters instead of matching by role only', () => {
    const name = 'testcustompiecelettersdefault';
    const info = makeFsfVariantInfo({
        name,
        pieces: [
            fsfPiece('king', 'K'),
            fsfPiece('rook', 'R'),
            fsfPiece('knight', 'N'),
            fsfPiece('pawn', 'P'),
            fsfPiece('custom1', 'E', { customBetza: 'FA' }),
            fsfPiece('custom2', 'G', { customBetza: 'BWD' }),
        ],
        pieceTypes: ['king', 'rook', 'knight', 'pawn', 'custom1', 'custom2'],
        promotion: {
            pawnTypes: { white: ['pawn'], black: ['pawn'] },
            pieceTypes: {
                white: ['custom2', 'rook', 'custom1', 'knight'],
                black: ['custom2', 'rook', 'custom1', 'knight'],
            },
        },
    });
    const meta = metaFromInfo(info, {
        ini: `[${name}]\n# These misleading options must be ignored by the browser.\ncustomPiece1 = c:R`,
    });
    const variant = register(meta);

    expect(cataloguedCompatiblePieceFamily(meta, { ignoreCustomPieceSet: true })).toBeUndefined();
    expect(variant.pieceFamily).toBe(`catalogued-${name}`);
    expect(boardSettings.pieceCSS(variant.pieceFamily, variant)).toBe('letters');
});

test('a complete uploaded custom piece set remains the default', () => {
    const name = 'testcustomdefault';
    const info = makeFsfVariantInfo({
        name,
        pieces: [fsfPiece('king', 'K'), fsfPiece('pawn', 'P')],
        pieceTypes: ['king', 'pawn'],
    });
    const variant = register(metaFromInfo(info, { hasPieceSet: true, pieceSetRevision: 'r1' }));

    expect(boardSettings.pieceCSS(variant.pieceFamily, variant)).toBe('custom-r1');

    const board = document.createElement('div');
    const wrap = document.createElement('div');
    board.className = `${variant.boardFamily} ${variant.pieceFamily}`;
    board.appendChild(wrap);
    document.body.appendChild(board);

    boardSettings.updateScopedPieceStyle(variant, wrap);
    expect(board.classList.contains('catalogued-piece-variant')).toBe(true);
    expect(board.classList.contains('catalogued-missing-piece-fallback')).toBe(false);

    board.remove();
});

test('catalogued variants can explicitly use the shared courier piece family', () => {
    const variant = register({
        name: 'testreformedcourieroverride',
        displayName: 'Test Reformed Courier Override',
        tooltip: 'Catalogued variant',
        ini: `[testreformedcourieroverride]
king = k
pawn = p
rook = r
knight = n
bishop = b
queen = q
centaur = d
customPiece1 = a:AF
customPiece2 = m:DK`,
        startFen: 'rnabmqkdbanr/pppppppppppp/12/12/12/12/PPPPPPPPPPPP/RNABMQKDBANR w KQkq - 0 1',
        width: 12,
        height: 8,
        pieces: ['k', 'p', 'r', 'n', 'b', 'q', 'd', 'a', 'm'],
        kingRoles: ['k'],
        pieceFamilyOverride: 'courier',
    });

    expect(variant.pieceFamily).toBe('courier');
    expect(boardSettings.pieceCSS(variant.pieceFamily, variant)).toBe('courier');
});

test('catalogued variants using an image-layer piece style do not get a base-image fallback', () => {
    const variant = register({
        name: 'testdecimalshogiimagelayer',
        displayName: 'Test Decimal Shogi Image Layer',
        tooltip: 'Catalogued variant',
        ini: '[testdecimalshogiimagelayer:shogi]',
        baseVariant: 'shogi',
        startFen: '10/10/10/10/10/10/10/10/10/K8k w - - 0 1',
        width: 10,
        height: 10,
        pieces: ['k', 'q', 'r', 'b', 'n', 'p', 'l', 's', 'g'],
        kingRoles: ['k'],
        pieceFamilyOverride: 'decimalshogi',
    });
    const board = document.createElement('div');
    const wrap = document.createElement('div');
    board.className = `${variant.boardFamily} ${variant.pieceFamily}`;
    board.appendChild(wrap);
    document.body.appendChild(board);

    expect(boardSettings.pieceCSS(variant.pieceFamily, variant)).toBe('shogik');

    boardSettings.updateScopedPieceStyle(variant, wrap);
    expect(board.classList.contains('catalogued-piece-variant')).toBe(true);
    expect(board.classList.contains('catalogued-missing-piece-fallback')).toBe(false);

    board.remove();
});

test('a custom promoted target requires custom/letter graphics', () => {
    const name = 'testpromotedcustomdefault';
    const info = makeFsfVariantInfo({
        name,
        pieces: [fsfPiece('king', 'K'), fsfPiece('pawn', 'P'), fsfPiece('custom1', 'Z', { customBetza: 'WAD' })],
        pieceTypes: ['king', 'pawn', 'custom1'],
        promotion: {
            shogiStyle: true,
            pawnTypes: { white: ['pawn'], black: ['pawn'] },
            promotedPieceTypes: { pawn: 'custom1' },
        },
    });
    const meta = metaFromInfo(info);
    const variant = register(meta);

    expect(cataloguedCompatiblePieceFamily(meta, { ignoreCustomPieceSet: true })).toBeUndefined();
    expect(variant.pieceFamily).toBe(`catalogued-${name}`);
});

test('resolved shogi-style promotion to a royal type adds the promoted source king role', () => {
    const name = 'testpromotedkingroles';
    const info = makeFsfVariantInfo({
        name,
        pieces: [fsfPiece('king', 'K'), fsfPiece('commoner', 'J')],
        pieceTypes: ['king', 'commoner'],
        royalPieceTypes: ['king', 'commoner'],
        promotion: { shogiStyle: true, promotedPieceTypes: { king: 'commoner' } },
        extinction: { value: 'loss', pseudoRoyal: true, pieceTypes: ['commoner'] },
    });
    const variant = register(metaFromInfo(info));

    expect(variant.kingRoles).toContain('k-piece');
    expect(variant.kingRoles).toContain('pk-piece');
});

test('resolved custom Nightrider movement does not match standard knight graphics', () => {
    const name = 'testfsfnightriderletters';
    const info = makeFsfVariantInfo({
        name,
        pieces: [
            fsfPiece('king', 'K'),
            fsfPiece('queen', 'Q'),
            fsfPiece('rook', 'R'),
            fsfPiece('bishop', 'B'),
            fsfPiece('custom1', 'N', { customBetza: 'NN' }),
            fsfPiece('pawn', 'P'),
        ],
        pieceTypes: ['king', 'queen', 'rook', 'bishop', 'custom1', 'pawn'],
    });
    const meta = metaFromInfo(info, { fsfBuiltinVariant: 'nightrider' });

    expect(cataloguedCompatiblePieceFamily(meta, { ignoreCustomPieceSet: true })).toBeUndefined();
});

test('resolved Centaur identity does not match Capablanca Chancellor graphics', () => {
    const name = 'testfsfcentaurletters';
    const info = makeFsfVariantInfo({
        name,
        template: 'capablanca',
        board: { width: 9, startFen: 'rncbqkbnr/ppppppppp/9/9/9/9/PPPPPPPPP/RNCBQKBNR w KQkq - 0 1' },
        pieces: [
            fsfPiece('king', 'K'),
            fsfPiece('queen', 'Q'),
            fsfPiece('rook', 'R'),
            fsfPiece('bishop', 'B'),
            fsfPiece('knight', 'N'),
            fsfPiece('pawn', 'P'),
            fsfPiece('centaur', 'C'),
        ],
        pieceTypes: ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn', 'centaur'],
    });
    const meta = metaFromInfo(info, { baseVariant: 'capablanca' });

    expect(cataloguedCompatiblePieceFamily(meta, { ignoreCustomPieceSet: true })).toBeUndefined();
});

test('resolved Chancellor identity can reuse Capablanca graphics', () => {
    const name = 'testfsfalmostcapa';
    const info = makeFsfVariantInfo({
        name,
        pieces: [
            fsfPiece('king', 'K'),
            fsfPiece('rook', 'R'),
            fsfPiece('bishop', 'B'),
            fsfPiece('knight', 'N'),
            fsfPiece('pawn', 'P'),
            fsfPiece('chancellor', 'C'),
        ],
        pieceTypes: ['king', 'rook', 'bishop', 'knight', 'pawn', 'chancellor'],
    });
    const meta = metaFromInfo(info);
    const variant = register(meta);

    expect(cataloguedCompatiblePieceFamily(meta, { ignoreCustomPieceSet: true })).toBe('capa');
    expect(variant.pieceFamily).toBe('capa');
});

test('resolved inherited Archbishop and Chancellor identities reuse Capablanca graphics', () => {
    const name = 'testfsfgrandcapa';
    const info = makeFsfVariantInfo({
        name,
        template: 'grand',
        board: {
            width: 10,
            height: 10,
            startFen: 'r8r/1nbqkcabn1/pppppppppp/10/10/10/10/PPPPPPPPPP/1NBQKCABN1/R8R w - - 0 1',
        },
        pieces: [
            fsfPiece('king', 'K'),
            fsfPiece('queen', 'Q'),
            fsfPiece('rook', 'R'),
            fsfPiece('bishop', 'B'),
            fsfPiece('knight', 'N'),
            fsfPiece('pawn', 'P'),
            fsfPiece('archbishop', 'A'),
            fsfPiece('chancellor', 'C'),
        ],
        pieceTypes: ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn', 'archbishop', 'chancellor'],
    });
    const meta = metaFromInfo(info, { baseVariant: 'grand' });

    expect(cataloguedCompatiblePieceFamily(meta, { ignoreCustomPieceSet: true })).toBe('capa');
});

test('resolved semantic piece types replace INI option-name inference', () => {
    const name = 'testfsfpieceoptioncapa';
    const info = makeFsfVariantInfo({
        name,
        pieces: [
            fsfPiece('king', 'K'),
            fsfPiece('queen', 'Q'),
            fsfPiece('rook', 'R'),
            fsfPiece('bishop', 'B'),
            fsfPiece('knight', 'N'),
            fsfPiece('pawn', 'P'),
            fsfPiece('archbishop', 'A'),
            fsfPiece('chancellor', 'C'),
        ],
        pieceTypes: ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn', 'archbishop', 'chancellor'],
    });
    const meta = metaFromInfo(info, { ini: `[${name}:chess]\ncustomPiece1 = a:W\ncustomPiece2 = c:F` });

    expect(cataloguedCompatiblePieceFamily(meta, { ignoreCustomPieceSet: true })).toBe('capa');
});

test('resolved Shogi identities and promotion targets reuse the Shogi family', () => {
    const name = 'testresolvedshogi';
    const info = makeFsfVariantInfo({
        name,
        template: 'shogi',
        board: { width: 9, height: 9, startFen: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL[-] w 0 1' },
        pieces: [
            fsfPiece('king', 'K'),
            fsfPiece('shogiPawn', 'P'),
            fsfPiece('lance', 'L'),
            fsfPiece('shogiKnight', 'N'),
            fsfPiece('silver', 'S'),
            fsfPiece('gold', 'G'),
            fsfPiece('bishop', 'B'),
            fsfPiece('rook', 'R'),
            fsfPiece('dragonHorse', '+'),
            fsfPiece('bers', '+'),
        ],
        pieceTypes: [
            'king',
            'shogiPawn',
            'lance',
            'shogiKnight',
            'silver',
            'gold',
            'bishop',
            'rook',
            'dragonHorse',
            'bers',
        ],
        drops: { enabled: true, capturesToHand: true },
        promotion: {
            shogiStyle: true,
            pawnTypes: { white: ['shogiPawn'], black: ['shogiPawn'] },
            promotedPieceTypes: {
                shogiPawn: 'gold',
                lance: 'gold',
                shogiKnight: 'gold',
                silver: 'gold',
                bishop: 'dragonHorse',
                rook: 'bers',
            },
        },
    });
    const meta = metaFromInfo(info, { baseVariant: 'shogi' });

    expect(cataloguedCompatiblePieceFamily(meta, { ignoreCustomPieceSet: true })).toBe('shogi');
});

test('a different resolved promoted target does not reuse misleading Shogi promoted graphics', () => {
    const name = 'testwrongshogipromotion';
    const info = makeFsfVariantInfo({
        name,
        template: 'shogi',
        board: { width: 9, height: 9, startFen: '4k4/9/9/9/9/9/PPPPPPPPP/9/4K4[-] w 0 1' },
        pieces: [fsfPiece('king', 'K'), fsfPiece('shogiPawn', 'P'), fsfPiece('queen', '+')],
        pieceTypes: ['king', 'shogiPawn', 'queen'],
        drops: { enabled: true, capturesToHand: true },
        promotion: {
            shogiStyle: true,
            pawnTypes: { white: ['shogiPawn'], black: ['shogiPawn'] },
            promotedPieceTypes: { shogiPawn: 'queen' },
        },
    });
    const meta = metaFromInfo(info, { baseVariant: 'shogi' });

    expect(cataloguedCompatiblePieceFamily(meta, { ignoreCustomPieceSet: true })).toBeUndefined();
});

test('an explicit ADMIN piece-family override remains authoritative presentation metadata', () => {
    const name = 'testfsfthreekingsstandard';
    const info = makeFsfVariantInfo({
        name,
        pieces: [
            fsfPiece('commoner', 'K'),
            fsfPiece('queen', 'Q'),
            fsfPiece('rook', 'R'),
            fsfPiece('bishop', 'B'),
            fsfPiece('knight', 'N'),
            fsfPiece('pawn', 'P'),
        ],
        pieceTypes: ['commoner', 'queen', 'rook', 'bishop', 'knight', 'pawn'],
        gameEnd: { kingType: 'commoner' },
    });
    const meta = metaFromInfo(info, { pieceFamilyOverride: 'standard' });
    const variant = register(meta);

    expect(cataloguedCompatiblePieceFamily(meta, { ignoreCustomPieceSet: true })).toBe('standard');
    expect(variant.pieceFamily).toBe('standard');
});
