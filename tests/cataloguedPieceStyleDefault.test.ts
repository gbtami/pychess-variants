import { afterEach, expect, test } from '@jest/globals';

import { boardSettings } from '../client/boardSettings';
import {
    CataloguedVariantClientDocument,
    registerCataloguedVariant,
    unregisterCataloguedVariant,
    VARIANTS,
} from '../client/variants';

const variantNames = ['testlettersdefault', 'testcustomdefault', 'testpromotedkingroles'];

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

test('catalogued variants without a custom piece set default to letters', () => {
    const variant = register({
        name: 'testlettersdefault',
        displayName: 'Test Letters Default',
        tooltip: 'Catalogued variant',
        ini: '[testlettersdefault:chess]',
        startFen: '8/8/8/8/8/8/8/K6k w - - 0 1',
        width: 8,
        height: 8,
        pieces: ['k', 'p'],
        kingRoles: ['k'],
    });

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
