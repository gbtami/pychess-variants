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

const variantNames = ['testbuiltindefault', 'testlettersdefault', 'testcustomdefault', 'testpromotedkingroles'];

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
