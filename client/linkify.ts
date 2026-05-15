import { h, VNode } from 'snabbdom';

type LinkifyNode = VNode | string;

// Mirrors the Lichess rich text URL detection style, with our own domain.
const linkRegex =
    /(^|[\s\n]|<[A-Za-z]*\/?>)((?:(?:https?|ftp):\/\/|pychess\.org)[\-A-Z0-9+\u0026\u2019@#/%?=()~_|!:,.;]*[\-A-Z0-9+\u0026@#/%=~()_|])/gi;

function toHref(url: string): string {
    if (url.match(/^[A-Za-z]+:\/\//)) return url;
    return `https://${url}`;
}

function toLabel(url: string): string {
    return url.replace(/^https?:\/\//, '');
}

export function linkifyNodes(text: string, linkClass: string): LinkifyNode[] {
    const nodes: LinkifyNode[] = [];
    const regex = new RegExp(linkRegex.source, 'gi');
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
        const full = match[0];
        const prefix = match[1] || '';
        const url = match[2];
        const fullStart = match.index;

        if (fullStart > lastIndex) nodes.push(text.slice(lastIndex, fullStart));
        if (prefix.length > 0) nodes.push(prefix);

        nodes.push(h(`a.${linkClass}`, {
            attrs: {
                href: toHref(url),
                target: '_blank',
                rel: 'nofollow noopener noreferrer',
            },
            on: {
                click: (event: MouseEvent) => event.stopPropagation(),
            },
        }, toLabel(url)));

        lastIndex = fullStart + full.length;
    }

    if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
    return nodes.length > 0 ? nodes : [text];
}
