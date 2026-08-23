import { h, VNode } from 'snabbdom';

import { _ } from './i18n';

const ANON_PREFIXES = ['Anon\u2013', 'Anon-'];

function classMap(className?: string): Record<string, boolean> | undefined {
    if (!className) {
        return undefined;
    }
    return className
        .split(/\s+/)
        .filter(Boolean)
        .reduce(
            (acc, name) => {
                acc[name] = true;
                return acc;
            },
            {} as Record<string, boolean>,
        );
}

export function isAnonUsername(username: string, anon?: boolean): boolean {
    if (anon !== undefined) {
        return anon;
    }
    if (!username) {
        return false;
    }
    return ANON_PREFIXES.some(prefix => username.startsWith(prefix));
}

export function displayUsername(username: string, anon?: boolean): string {
    return isAnonUsername(username, anon) ? _('Anonymous') : username;
}

export function patronWing(patron: boolean, username?: string): VNode | string {
    return patron
        ? h('i-side.icon.icon-patron', {
              attrs: {
                  title: _('PyChess Patron'),
                  ...(username ? { 'data-patron-user': username } : {}),
              },
          })
        : '';
}

export function updatePatronPresence(username: string, online: boolean): void {
    document.querySelectorAll<HTMLElement>('[data-patron-user]').forEach(icon => {
        if (icon.dataset.patronUser !== username) return;
        icon.classList.toggle('icon-online', online);
        icon.classList.toggle('online', online);
        icon.classList.toggle('icon-offline', !online);
        icon.classList.toggle('offline', !online);
    });
}

export function userLink(
    username: string,
    children: VNode | string | Array<VNode | string>,
    options: { anon?: boolean; className?: string; hrefPrefix?: string } = {},
): VNode {
    const anon = isAnonUsername(username, options.anon);
    const classes = classMap(options.className ?? 'user-link');
    if (anon) {
        return h('span', { class: classes }, children);
    }
    const hrefPrefix = options.hrefPrefix ?? '/@/';
    return h('a', { class: classes, attrs: { href: hrefPrefix + username } }, children);
}
