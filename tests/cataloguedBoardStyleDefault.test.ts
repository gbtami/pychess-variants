import { afterEach, expect, test } from '@jest/globals';

import { boardSettings } from '../client/boardSettings';
import { initCommunityVariantFavorites } from '../client/communityVariants';
import {
    BOARD_FAMILIES,
    CataloguedVariantClientDocument,
    cataloguedCompatibleBoardFamily,
    registerCataloguedVariant,
    unregisterCataloguedVariant,
    VARIANTS,
} from '../client/variants';

const variantNames = [
    'testshogiboarddefault',
    'testmakrukboardoverride',
    'testboarddimensionfallback',
    'testcustomboardoverride',
    'testshogiboardpreview',
];

function register(meta: CataloguedVariantClientDocument) {
    registerCataloguedVariant(meta);
    return VARIANTS[meta.name];
}

afterEach(() => {
    document.body.textContent = '';
    variantNames.forEach(name => {
        const variant = VARIANTS[name];
        unregisterCataloguedVariant(name);
        delete localStorage[`${name}-board`];
        delete boardSettings.settings[`${name}-board`];
        if (variant?.boardFamily.startsWith('catalogued')) delete localStorage[`${variant.boardFamily}-board`];
    });
});

test('catalogued variants inherit a dimension-compatible board family from their base variant', () => {
    const meta: CataloguedVariantClientDocument = {
        name: 'testshogiboarddefault',
        displayName: 'Test Shogi Board Default',
        ini: '[testshogiboarddefault:shogi]',
        baseVariant: 'shogi',
        startFen: '9/9/9/9/9/9/9/9/9 w - - 0 1',
        width: 9,
        height: 9,
        pieces: ['k'],
        kingRoles: ['k'],
    };
    const variant = register(meta);

    expect(cataloguedCompatibleBoardFamily(meta)).toBe('shogi9x9');
    expect(variant.boardFamily).toBe('shogi9x9');
    expect(boardSettings.boardCSS(variant.boardFamily, variant)).toBe(BOARD_FAMILIES.shogi9x9.boardCSS[0]);
});

test('an explicit board family override takes precedence over base-variant detection', () => {
    const meta: CataloguedVariantClientDocument = {
        name: 'testmakrukboardoverride',
        displayName: 'Test Makruk Board Override',
        ini: '[testmakrukboardoverride:chess]',
        baseVariant: 'chess',
        boardFamilyOverride: 'makruk8x8',
        startFen: '8/8/8/8/8/8/8/8 w - - 0 1',
        width: 8,
        height: 8,
        pieces: ['k'],
        kingRoles: ['k'],
    };
    const variant = register(meta);

    expect(cataloguedCompatibleBoardFamily(meta)).toBe('makruk8x8');
    expect(variant.boardFamily).toBe('makruk8x8');
});

test('dimension-incompatible base and override board families fall back to a generated checkerboard', () => {
    const meta: CataloguedVariantClientDocument = {
        name: 'testboarddimensionfallback',
        displayName: 'Test Board Dimension Fallback',
        ini: '[testboarddimensionfallback:chess]\nmaxFile = 10',
        baseVariant: 'chess',
        boardFamilyOverride: 'makruk8x8',
        startFen: '10/10/10/10/10/10/10/10 w - - 0 1',
        width: 10,
        height: 8,
        pieces: ['k'],
        kingRoles: ['k'],
    };
    const variant = register(meta);

    expect(cataloguedCompatibleBoardFamily(meta)).toBeUndefined();
    expect(variant.boardFamily).toBe('catalogued10x8');
});

test('uploaded custom boards retain priority while preserving the selected fallback family', () => {
    const meta: CataloguedVariantClientDocument = {
        name: 'testcustomboardoverride',
        displayName: 'Test Custom Board Override',
        ini: '[testcustomboardoverride:chess]',
        baseVariant: 'chess',
        boardFamilyOverride: 'makruk8x8',
        startFen: '8/8/8/8/8/8/8/8 w - - 0 1',
        width: 8,
        height: 8,
        pieces: ['k'],
        kingRoles: ['k'],
        hasBoard: true,
        boardRevision: 'r1',
    };
    const variant = register(meta);

    expect(variant.hasBoard).toBe(true);
    expect(variant.boardFamily).toBe('makruk8x8');
});


test('rules and community mini-boards use the detected built-in board image', () => {
    register({
        name: 'testshogiboardpreview',
        displayName: 'Test Shogi Board Preview',
        ini: '[testshogiboardpreview:shogi]',
        baseVariant: 'shogi',
        startFen: '9/9/9/9/9/9/9/9/9 w - - 0 1',
        width: 9,
        height: 9,
        pieces: ['k'],
        kingRoles: ['k'],
    });
    document.body.innerHTML = `
        <div data-variant="testshogiboardpreview">
            <svg class="catalogued-start-board-svg" width="216" height="216">
                <title>Default starting position</title>
                <rect class="catalogued-start-board-square" />
            </svg>
        </div>`;

    initCommunityVariantFavorites();

    const image = document.querySelector<SVGImageElement>('.catalogued-start-board-theme');
    const square = document.querySelector<SVGRectElement>('.catalogued-start-board-square');
    expect(image?.getAttribute('href')).toBe('/static/images/board/shogi.svg');
    expect(square?.getAttribute('visibility')).toBe('hidden');
});
