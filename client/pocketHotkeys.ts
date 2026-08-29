import * as Mousetrap from 'mousetrap';
import type { Api } from 'chessgroundx/api';
import type * as cg from 'chessgroundx/types';

// Follow the physical number-row order after 9. This keeps Crazyhouse compatible
// with lichess (1-5) while covering every current PyChess pocket variant, including
// Cannon Shogi's 11 pocket roles.
export const POCKET_HOTKEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='] as const;

export function pocketHotkeyBindings(roles: readonly cg.Role[]): Array<[string, cg.Role]> {
    return roles
        .slice(0, POCKET_HOTKEYS.length)
        .map((role, index): [string, cg.Role] => [POCKET_HOTKEYS[index], role]);
}

export function bindPocketHotkeys(chessground: Api, color: cg.Color, roles: readonly cg.Role[]): void {
    const bindings = pocketHotkeyBindings(roles);
    const roleByKey = new Map(bindings);
    const activeKeys: string[] = [];

    const selectActivePocket = () => {
        const key = activeKeys[activeKeys.length - 1];
        const role = roleByKey.get(key);
        if (!role) {
            chessground.selectPocket(null);
            return;
        }

        const count = chessground.state.boardState.pockets?.[color].get(role) ?? 0;
        chessground.selectPocket(count > 0 ? { color, role } : null);
    };

    for (const [key] of bindings) {
        Mousetrap.bind(key, () => {
            if (!activeKeys.includes(key)) {
                activeKeys.push(key);
                selectActivePocket();
            }
        });
        Mousetrap.bind(
            key,
            () => {
                const index = activeKeys.indexOf(key);
                if (index !== -1) {
                    activeKeys.splice(index, 1);
                    selectActivePocket();
                }
            },
            'keyup',
        );
    }

    const reset = () => {
        if (activeKeys.length === 0) return;
        activeKeys.length = 0;
        chessground.selectPocket(null);
    };

    window.addEventListener('blur', reset);

    // Focusing a text control can hide the matching keyup event from Mousetrap.
    window.addEventListener(
        'focus',
        event => {
            const target = event.target as HTMLElement | null;
            if (target?.matches('input, textarea, select, [contenteditable="true"]')) reset();
        },
        { capture: true },
    );
}
