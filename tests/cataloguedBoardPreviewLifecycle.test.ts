import { afterEach, expect, jest, test } from '@jest/globals';
import type { Api } from 'chessgroundx/api';
import { Chessground } from 'chessgroundx/chessground';
import { readFileSync } from 'node:fs';

import { boardSettings } from '../client/boardSettings';
import { initCommunityVariantFavorites, mountCataloguedStartBoards } from '../client/communityVariants';
import {
    CataloguedVariantClientDocument,
    registerCataloguedVariant,
    unregisterCataloguedVariant,
    VARIANTS,
} from '../client/variants';

const variantNames = ['testpreviewcleanup', 'testrectangularpocketpreview'];
const originalIntersectionObserver = window.IntersectionObserver;
const originalFetch = globalThis.fetch;

function register(meta: CataloguedVariantClientDocument) {
    registerCataloguedVariant(meta);
    return VARIANTS[meta.name];
}

afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: originalFetch });
    document.body.textContent = '';
    variantNames.forEach(name => {
        const variant = VARIANTS[name];
        unregisterCataloguedVariant(name);
        delete localStorage[`${name}-board`];
        delete boardSettings.settings[`${name}-board`];
        if (variant?.boardFamily.startsWith('catalogued')) delete localStorage[`${variant.boardFamily}-board`];
    });
    if (originalIntersectionObserver) window.IntersectionObserver = originalIntersectionObserver;
    else Reflect.deleteProperty(window, 'IntersectionObserver');
});

test('removing a favorite-only card disposes its mini-board resize binding and Chessground', async () => {
    register({
        name: 'testpreviewcleanup',
        displayName: 'Test Preview Cleanup',
        ini: '[testpreviewcleanup:chess]',
        baseVariant: 'chess',
        startFen: '8/8/8/8/8/8/8/8 w - - 0 1',
        width: 8,
        height: 8,
        pieces: ['k'],
        kingRoles: ['k'],
    });
    document.body.innerHTML = `
        <div class="community-variants-page" data-favorites-only="1">
            <article class="community-variant-card">
                <button class="community-variant-favorite" data-variant="testpreviewcleanup" aria-pressed="true"></button>
                <div class="catalogued-start-board-preview" data-variant="testpreviewcleanup"></div>
            </article>
        </div>`;
    Reflect.deleteProperty(window, 'IntersectionObserver');

    const destroy = jest.fn();
    const chessground = { state: {}, destroy } as unknown as Api;
    const createChessground = jest.fn(() => chessground) as unknown as typeof Chessground;
    const unbindResize = jest.fn();
    const bindResize = jest.fn(() => unbindResize);
    mountCataloguedStartBoards('/static', createChessground, bindResize);
    initCommunityVariantFavorites('/static');

    const fetchMock = jest.fn(async () => ({
        ok: true,
        json: async () => ({ favorite: false, favoriteCount: 0 }),
    })) as unknown as typeof fetch;
    Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: fetchMock });
    document.querySelector<HTMLButtonElement>('.community-variant-favorite')?.click();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(unbindResize).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.community-variant-card')).toBeNull();
});

test('pocket preview spacing uses rendered board height and logical rank count', () => {
    register({
        name: 'testrectangularpocketpreview',
        displayName: 'Test Rectangular Pocket Preview',
        ini: '[testrectangularpocketpreview:shogi]\nmaxFile = 7\nmaxRank = 9',
        baseVariant: 'shogi',
        startFen: '7/7/7/7/7/7/7/7/7[Pp] w - - 0 1',
        width: 7,
        height: 9,
        pieces: ['k', 'p'],
        kingRoles: ['k'],
        pocketRoles: ['p'],
        captureToHand: true,
    });
    document.body.innerHTML = `
        <div class="catalogued-start-board-preview" data-variant="testrectangularpocketpreview"></div>`;
    Reflect.deleteProperty(window, 'IntersectionObserver');

    const createChessground = jest.fn(
        () => ({ state: {}, destroy: jest.fn() }) as unknown as Api,
    ) as unknown as typeof Chessground;
    mountCataloguedStartBoards(
        '/static',
        createChessground,
        jest.fn(() => () => undefined),
    );

    const preview = document.querySelector<HTMLElement>('.catalogued-start-board-preview');
    expect(preview?.style.getPropertyValue('--catalogued-board-ranks')).toBe('9');
    expect(preview?.style.getPropertyValue('--catalogued-board-files')).toBe('');

    const css = readFileSync('static/variants.css', 'utf8');
    expect(css).toContain('padding-block: calc(var(--cg-height) / var(--catalogued-board-ranks, 8));');
});
