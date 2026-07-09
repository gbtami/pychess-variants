import { afterEach, expect, test } from '@jest/globals';

import { boardSettings } from '../client/boardSettings';
import {
    CataloguedVariantClientDocument,
    cataloguedCompatiblePieceFamily,
    PIECE_FAMILIES,
    registerCataloguedVariant,
    unregisterCataloguedVariant,
    VARIANTS,
} from '../client/variants';

const variantNames = [
    'testbuiltindefault',
    'testlettersdefault',
    'testcustomdefault',
    'testcustompiecelettersdefault',
    'testpromotedcustomdefault',
    'testpromotedkingroles',
    'testfsfnightriderletters',
    'testfsfcentaurletters',
    'testfsfalmostcapa',
    'testfsfgrandcapa',
    'testfsfpieceoptioncapa',
    'testfsfthreekingsstandard',
];

function register(meta: CataloguedVariantClientDocument) {
    registerCataloguedVariant(meta);
    return VARIANTS[meta.name];
}

afterEach(() => {
    variantNames.forEach(name => {
        unregisterCataloguedVariant(name);
        delete localStorage[`${name}-piece`];
        delete boardSettings.settings[`${name}-piece`];
    });
});

test('catalogued variants with a compatible built-in piece family default to that family', () => {
    const meta: CataloguedVariantClientDocument = {
        name: 'testbuiltindefault',
        displayName: 'Test Built-in Default',
        tooltip: 'Catalogued variant',
        ini: '[testbuiltindefault:chess]',
        startFen: '8/8/8/8/8/8/8/K6k w - - 0 1',
        width: 8,
        height: 8,
        pieces: ['k', 'p'],
        kingRoles: ['k'],
    };
    const variant = register(meta);

    expect(variant.pieceFamily).toBe(cataloguedCompatiblePieceFamily(meta, { ignoreCustomPieceSet: true }));
    expect(boardSettings.pieceCSS(variant.pieceFamily, variant)).toBe(PIECE_FAMILIES[variant.pieceFamily].pieceCSS[0]);
});

test('catalogued variants without a compatible built-in piece family default to letters', () => {
    const meta: CataloguedVariantClientDocument = {
        name: 'testlettersdefault',
        displayName: 'Test Letters Default',
        tooltip: 'Catalogued variant',
        ini: '[testlettersdefault:chess]',
        startFen: '8/8/8/8/8/8/8/K6k w - - 0 1',
        width: 8,
        height: 8,
        pieces: ['k', 'x'],
        kingRoles: ['k'],
    };
    const variant = register(meta);

    expect(cataloguedCompatiblePieceFamily(meta, { ignoreCustomPieceSet: true })).toBeUndefined();
    expect(variant.pieceFamily).toBe(`catalogued-${variant.name}`);
    expect(boardSettings.pieceCSS(variant.pieceFamily, variant)).toBe('letters');
});

test('catalogued variants with a custom piece set still default to that custom set', () => {
    const variant = register({
        name: 'testcustomdefault',
        displayName: 'Test Custom Default',
        tooltip: 'Catalogued variant',
        ini: '[testcustomdefault:chess]',
        startFen: '8/8/8/8/8/8/8/K6k w - - 0 1',
        width: 8,
        height: 8,
        pieces: ['k', 'p'],
        kingRoles: ['k'],
        hasPieceSet: true,
        pieceSetRevision: 'r1',
    });

    expect(boardSettings.pieceCSS(variant.pieceFamily, variant)).toBe('custom-r1');
});

test('catalogued variants needing custom piece roles default to letters instead of matching by role letter only', () => {
    const meta: CataloguedVariantClientDocument = {
        name: 'testcustompiecelettersdefault',
        displayName: 'Test Custom Piece Letters Default',
        tooltip: 'Catalogued variant',
        ini: `[testcustompiecelettersdefault]
pawn = p
knight = n
customPiece1 = e:FA
rook = r
customPiece2 = g:BWD
king = k
promotionPieceTypes = gren
doubleStep = false
castling = false
stalemateValue = loss`,
        startFen: 'rnegkenr/pppppppp/8/8/8/8/PPPPPPPP/RNEGKENR w - - 0 1',
        width: 8,
        height: 8,
        pieces: ['k', 'r', 'n', 'p', 'e', 'g'],
        kingRoles: ['k'],
        promotionType: 'regular',
        promotionRoles: ['p'],
        promotionOrder: ['g', 'r', 'e', 'n'],
    };
    const variant = register(meta);

    expect(cataloguedCompatiblePieceFamily(meta, { ignoreCustomPieceSet: true })).toBeUndefined();
    expect(variant.pieceFamily).toBe(`catalogued-${variant.name}`);
    expect(boardSettings.pieceCSS(variant.pieceFamily, variant)).toBe('letters');
});

test('catalogued variants with custom promoted target pieces default to letters', () => {
    const meta: CataloguedVariantClientDocument = {
        name: 'testpromotedcustomdefault',
        displayName: 'Test Promoted Custom Default',
        tooltip: 'Catalogued variant',
        ini: `[testpromotedcustomdefault]
king = k
pawn = p
customPiece1 = z:WAD
promotedPieceType = p:z`,
        startFen: '8/8/8/8/8/8/P7/K6k w - - 0 1',
        width: 8,
        height: 8,
        pieces: ['k', 'p'],
        kingRoles: ['k'],
        promotionType: 'shogi',
        promotionRoles: ['p'],
        promotionOrder: ['+', ''],
        showPromoted: true,
    };
    const variant = register(meta);

    expect(cataloguedCompatiblePieceFamily(meta, { ignoreCustomPieceSet: true })).toBeUndefined();
    expect(variant.pieceFamily).toBe(`catalogued-${variant.name}`);
    expect(boardSettings.pieceCSS(variant.pieceFamily, variant)).toBe('letters');
});

test('catalogued variants mark shogi-style promoted kings as king roles', () => {
    const variant = register({
        name: 'testpromotedkingroles',
        displayName: 'Test Promoted King Roles',
        tooltip: 'Catalogued variant',
        ini: `[testpromotedkingroles:chess]
extinctionValue = loss
extinctionPieceTypes = jk
extinctionPseudoRoyal = true
mandatoryPiecePromotion = true
promotedPieceType = n:y b:y p:z r:o q:a k:j
promotionPieceTypes = -`,
        startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        width: 8,
        height: 8,
        pieces: ['k', 'q', 'r', 'b', 'n', 'p'],
        kingRoles: ['k'],
        promotionType: 'shogi',
        promotionRoles: ['n', 'b', 'p', 'r', 'q', 'k'],
        promotionOrder: ['+', ''],
        showPromoted: true,
    });

    expect(variant.kingRoles).toContain('k-piece');
    expect(variant.kingRoles).toContain('pk-piece');
});


test('FSF built-in Nightrider identity does not match standard knight letters', () => {
    const meta: CataloguedVariantClientDocument = {
        name: 'testfsfnightriderletters',
        displayName: 'Test FSF Nightrider Letters',
        tooltip: 'Catalogued variant',
        ini: '',
        source: 'fairy-stockfish-builtin',
        fsfBuiltinVariant: 'nightrider',
        baseVariant: 'chess',
        startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        width: 8,
        height: 8,
        pieces: ['k', 'q', 'r', 'b', 'n', 'p'],
        kingRoles: ['k'],
        promotionType: 'regular',
        promotionRoles: ['p'],
        promotionOrder: ['q', 'r', 'b', 'n'],
    };
    const variant = register(meta);

    expect(cataloguedCompatiblePieceFamily(meta, { ignoreCustomPieceSet: true })).toBeUndefined();
    expect(variant.pieceFamily).toBe(`catalogued-${variant.name}`);
});

test('FSF built-in Centaur identity does not match Capablanca chancellor letters', () => {
    const meta: CataloguedVariantClientDocument = {
        name: 'testfsfcentaurletters',
        displayName: 'Test FSF Centaur Letters',
        tooltip: 'Catalogued variant',
        ini: '',
        source: 'fairy-stockfish-builtin',
        fsfBuiltinVariant: 'centaur',
        baseVariant: 'capablanca',
        startFen: 'rncbqkbnr/ppppppppp/9/9/9/9/PPPPPPPPP/RNCBQKBNR w KQkq - 0 1',
        width: 9,
        height: 8,
        pieces: ['k', 'q', 'r', 'b', 'n', 'p', 'c'],
        kingRoles: ['k'],
        promotionType: 'regular',
        promotionRoles: ['p'],
        promotionOrder: ['c', 'q', 'r', 'b', 'n'],
    };
    const variant = register(meta);

    expect(cataloguedCompatiblePieceFamily(meta, { ignoreCustomPieceSet: true })).toBeUndefined();
    expect(variant.pieceFamily).toBe(`catalogued-${variant.name}`);
});

test('FSF built-in Almost keeps using Capablanca pieces for Chancellor', () => {
    const meta: CataloguedVariantClientDocument = {
        name: 'testfsfalmostcapa',
        displayName: 'Test FSF Almost Capa',
        tooltip: 'Catalogued variant',
        ini: '',
        source: 'fairy-stockfish-builtin',
        fsfBuiltinVariant: 'almost',
        baseVariant: 'chess',
        startFen: 'rnbckbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBCKBNR w KQkq - 0 1',
        width: 8,
        height: 8,
        pieces: ['k', 'r', 'b', 'n', 'p', 'c'],
        kingRoles: ['k'],
        promotionType: 'regular',
        promotionRoles: ['p'],
        promotionOrder: ['c', 'r', 'b', 'n'],
    };
    const variant = register(meta);

    expect(cataloguedCompatiblePieceFamily(meta, { ignoreCustomPieceSet: true })).toBe('capa');
    expect(variant.pieceFamily).toBe('capa');
});

test('FSF-inherited Grand keeps using Capablanca pieces for Archbishop and Chancellor', () => {
    const meta: CataloguedVariantClientDocument = {
        name: 'testfsfgrandcapa',
        displayName: 'Test FSF Grand Capa',
        tooltip: 'Catalogued variant',
        ini: '[testfsfgrandcapa:grand]',
        baseVariant: 'grand',
        startFen: 'r8r/1nbqkcabn1/pppppppppp/10/10/10/10/PPPPPPPPPP/1NBQKCABN1/R8R w - - 0 1',
        width: 10,
        height: 10,
        pieces: ['k', 'q', 'r', 'b', 'n', 'p', 'a', 'c'],
        kingRoles: ['k'],
        promotionType: 'regular',
        promotionRoles: ['p'],
        promotionOrder: ['q', 'r', 'b', 'n', 'a', 'c'],
    };
    const variant = register(meta);

    expect(cataloguedCompatiblePieceFamily(meta, { ignoreCustomPieceSet: true })).toBe('capa');
    expect(variant.pieceFamily).toBe('capa');
});

test('FSF built-in piece option names can opt into compatible piece families', () => {
    const meta: CataloguedVariantClientDocument = {
        name: 'testfsfpieceoptioncapa',
        displayName: 'Test FSF Piece Option Capa',
        tooltip: 'Catalogued variant',
        ini: `[testfsfpieceoptioncapa:chess]
archbishop = a
chancellor = c`,
        baseVariant: 'chess',
        startFen: 'rnabqkbcnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNABQKBCNR w KQkq - 0 1',
        width: 10,
        height: 8,
        pieces: ['k', 'q', 'r', 'b', 'n', 'p', 'a', 'c'],
        kingRoles: ['k'],
        promotionType: 'regular',
        promotionRoles: ['p'],
        promotionOrder: ['q', 'r', 'b', 'n', 'a', 'c'],
    };
    const variant = register(meta);

    expect(cataloguedCompatiblePieceFamily(meta, { ignoreCustomPieceSet: true })).toBe('capa');
    expect(variant.pieceFamily).toBe('capa');
});

test('catalogued piece family override bypasses conservative identity detection', () => {
    const meta: CataloguedVariantClientDocument = {
        name: 'testfsfthreekingsstandard',
        displayName: 'Test FSF Three Kings Standard',
        tooltip: 'Catalogued variant',
        ini: '',
        source: 'fairy-stockfish-builtin',
        fsfBuiltinVariant: 'threekings',
        pieceFamilyOverride: 'standard',
        baseVariant: 'chess',
        startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        width: 8,
        height: 8,
        pieces: ['k', 'q', 'r', 'b', 'n', 'p'],
        kingRoles: ['k'],
        promotionType: 'regular',
        promotionRoles: ['p'],
        promotionOrder: ['q', 'r', 'b', 'n'],
    };
    const variant = register(meta);

    expect(cataloguedCompatiblePieceFamily(meta, { ignoreCustomPieceSet: true })).toBe('standard');
    expect(variant.pieceFamily).toBe('standard');
});
