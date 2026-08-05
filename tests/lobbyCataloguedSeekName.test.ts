import { afterEach, expect, jest, test } from '@jest/globals';
import type { VNode } from 'snabbdom';

import type { Seek } from '../client/lobbyType';

jest.unstable_mockModule('../client/main', () => ({ model: {} }));
jest.unstable_mockModule('chessgroundx', () => ({ Chessground: jest.fn() }));

const { LobbyController } = await import('../client/lobby');
const { registerCataloguedVariant, unregisterCataloguedVariant } = await import('../client/variants');

const variantName = 'testmobileseekvariant';

function makeSeek(variant: string): Seek {
    return {
        user: 'Seeker',
        variant,
        color: 'r',
        fen: '',
        base: 15,
        inc: 10,
        byoyomi: 0,
        day: 0,
        chess960: false,
        rated: false,
        bot: false,
        rating: 1500,
        seekID: 'seek-1',
        target: '',
        title: '',
        bugPlayer1: '',
        player2: '',
        bugPlayer2: '',
    };
}

function makeController(): LobbyController {
    const ctrl = Object.create(LobbyController.prototype) as LobbyController;
    Object.assign(ctrl, {
        username: 'Viewer',
        anon: false,
        title: '',
    });
    return ctrl;
}

afterEach(() => unregisterCataloguedVariant(variantName));

test('catalogued seeks add one mobile-only row with their full display name', () => {
    registerCataloguedVariant({
        name: variantName,
        displayName: 'A Very Long Mobile Seek Variant Name',
        ini: `[${variantName}:chess]`,
        baseVariant: 'chess',
        startFen: '8/8/8/8/8/8/8/K6k w - - 0 1',
        width: 8,
        height: 8,
        pieces: ['k'],
        kingRoles: ['k'],
    });

    const [, tbody] = makeController().renderSeeks([makeSeek(variantName)]);
    const rows = tbody.children as VNode[];

    expect(rows).toHaveLength(2);
    expect(rows[0].data?.class?.['catalogued-seek-main']).toBe(true);
    expect(rows[1].sel).toBe('tr.catalogued-seek-name');

    const cell = rows[1].children?.[0] as VNode;
    const name = cell.children?.[0] as VNode;
    expect(cell.data?.attrs?.colspan).toBe('6');
    expect(name.sel).toBe('span.mobile-catalogued-variant');
    expect(name.data?.attrs?.['data-icon']).toBeUndefined();
    expect(name.text).toBe('A VERY LONG MOBILE SEEK VARIANT NAME');

    const mainVariantCell = rows[0].children?.[4] as VNode;
    expect(mainVariantCell.data?.attrs?.['data-icon']).toBe('◇');
});

test('site variant seeks remain single-row', () => {
    const [, tbody] = makeController().renderSeeks([makeSeek('chess')]);
    expect(tbody.children).toHaveLength(1);
});
