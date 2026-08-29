import { POCKET_HOTKEYS, pocketHotkeyBindings } from '../client/pocketHotkeys';
import type * as cg from 'chessgroundx/types';

describe('pocket drop hotkeys', () => {
    test('follow pocket order across the full number row', () => {
        const roles = ['p', 'l', 'n', 's', 'g', 'b', 'r', 'u', 'a', 'c', 'i'] as cg.Letter[];

        expect(pocketHotkeyBindings(roles.map(role => `${role}-piece` as cg.Role))).toEqual([
            ['1', 'p-piece'],
            ['2', 'l-piece'],
            ['3', 'n-piece'],
            ['4', 's-piece'],
            ['5', 'g-piece'],
            ['6', 'b-piece'],
            ['7', 'r-piece'],
            ['8', 'u-piece'],
            ['9', 'a-piece'],
            ['0', 'c-piece'],
            ['-', 'i-piece'],
        ]);
        expect(POCKET_HOTKEYS).toHaveLength(12);
    });
});
