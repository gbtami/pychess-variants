import { h, VNode } from "snabbdom";

import { _ } from "./i18n";

const ANON_PREFIXES = ["Anon\u2013", "Anon-"];

function classMap(className?: string): Record<string, boolean> | undefined {
    if (!className) {
        return undefined;
    }
    return className
        .split(/\s+/)
        .filter(Boolean)
        .reduce((acc, name) => {
            acc[name] = true;
            return acc;
        }, {} as Record<string, boolean>);
}

export function isAnonUsername(username: string, anon?: boolean): boolean {
    if (anon !== undefined) {
        return anon;
    }
    if (!username) {
        return false;
    }
    return ANON_PREFIXES.some((prefix) => username.startsWith(prefix));
}

export function displayUsername(username: string, anon?: boolean): string {
    return isAnonUsername(username, anon) ? _("Anonymous") : username;
}

export function userLink(
    username: string,
    children: VNode | string | Array<VNode | string>,
    options: { anon?: boolean; className?: string; hrefPrefix?: string } = {},
): VNode {
    const anon = isAnonUsername(username, options.anon);
    const classes = classMap(options.className ?? "user-link");
    if (anon) {
        return h("span", { class: classes }, children);
    }
    const hrefPrefix = options.hrefPrefix ?? "/@/";
    return h("a", { class: classes, attrs: { href: hrefPrefix + username } }, children);
}
