import { h, VNode } from 'snabbdom';

import { _ } from './i18n';
import { isAnonUsername } from './user';

/* THE SPECTATORS PAYLOAD, PARSED ONCE FOR BOTH PAGE FAMILIES.
   ------------------------------------------------------------------------------------
   The server sends one field, `spectators`, and it is two different things depending on how
   many people are watching (`server/spectators.py`): at or below `MAX_NAMED_SPECTATORS` it is a
   comma-separated list of names, with the anonymous watchers collapsed into a single
   `Anonymous(N)` entry; above it, the bare count as a string. Both forms have to be understood
   by anything that displays them, which is now two callers — the single-board `gameCtrl` and the
   two-board round page — so the reading of it lives here rather than privately in one of them. */

/** Everything the payload says is watching, as a number — `Anonymous(3)` counts as three.
 *
 * The bare-count form is already the answer. The named form has to be counted rather than
 * measured by `split(',').length`, because one of its entries stands for several people. */
export function spectatorCount(raw: string): number {
    const text = raw.trim();
    if (text === '') return 0;
    if (/^\d+$/.test(text)) return Number(text);

    return text
        .split(',')
        .map(part => part.trim())
        .filter(Boolean)
        .reduce((total, part) => {
            const anons = /^Anonymous\((\d+)\)$/.exec(part);
            return total + (anons === null ? 1 : Number(anons[1]));
        }, 0);
}

/** The payload as display children: the label, then either the count or the names.
 *
 * A named watcher is a link to their profile; an anonymous one is not, because there is no
 * profile to link to — `isAnonUsername` covers the per-user anonymous names and the
 * `Anonymous(N)` collapse is matched directly. */
export function renderSpectators(raw: string): Array<VNode | string> {
    if (/^\d+$/.test(raw)) {
        return [_('Spectators: '), raw];
    }

    const parts = raw
        .split(',')
        .map(part => part.trim())
        .filter(Boolean);
    const children: Array<VNode | string> = [_('Spectators: ')];
    parts.forEach((part, idx) => {
        if (idx > 0) children.push(', ');
        if (isAnonUsername(part) || part.startsWith('Anonymous(')) {
            children.push(part);
        } else {
            children.push(h('a.user-link', { attrs: { href: `/@/${encodeURIComponent(part)}` } }, part));
        }
    });
    return children;
}
