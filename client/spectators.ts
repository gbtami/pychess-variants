import { h, VNode } from 'snabbdom';

import { _ } from './i18n';
import { isAnonUsername } from './user';

/** Counts spectators in a numeric payload or a name list, including grouped Anonymous(N) entries. */
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

/** Renders the count or name list, linking registered users to their profiles. */
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
