import showdown from 'showdown';

const converter = new showdown.Converter({
    ghCompatibleHeaderId: true,
    simpleLineBreaks: false,
    strikethrough: true,
    tables: true,
    tasklists: true,
    openLinksInNewWindow: true,
});
converter.setFlavor('github');

const ALLOWED_TAGS = new Set([
    'a', 'p', 'blockquote', 'pre', 'code', 'ul', 'ol', 'li', 'hr', 'br',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'em', 'del', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'img', 'span', 'div',
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
    a: new Set(['href', 'title']),
    img: new Set(['src', 'alt', 'title', 'width', 'height']),
    p: new Set(['align']),
    div: new Set(['align']),
    code: new Set(['class']),
    pre: new Set(['class']),
    th: new Set(['align', 'colspan', 'rowspan']),
    td: new Set(['align', 'colspan', 'rowspan']),
};

function safeUrl(url: string): string | null {
    const value = (url || '').trim();
    if (!value) return null;
    if (value.startsWith('/images/') || value.startsWith('/icons/')) return `/static${value}`;
    if (value.startsWith('/')) return value;
    try {
        const parsed = new URL(value);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
        return null;
    } catch {
        return null;
    }
}

function sanitizePositiveIntAttr(el: Element, attr: 'width' | 'height'): void {
    const raw = el.getAttribute(attr);
    if (!raw) return;
    const value = Number.parseInt(raw, 10);
    if (!Number.isFinite(value) || value <= 0 || value > 4096) {
        el.removeAttribute(attr);
        return;
    }
    el.setAttribute(attr, String(value));
}

function sanitizeRenderedHtml(html: string): string {
    const host = document.createElement('div');
    host.innerHTML = html;

    host.querySelectorAll<HTMLElement>('*').forEach((el) => {
        const tag = el.tagName.toLowerCase();
        if (!ALLOWED_TAGS.has(tag)) {
            if (tag === 'script' || tag === 'style' || tag === 'iframe' || tag === 'object' || tag === 'embed') {
                el.remove();
                return;
            }
            const parent = el.parentNode;
            if (!parent) return;
            while (el.firstChild) parent.insertBefore(el.firstChild, el);
            parent.removeChild(el);
            return;
        }

        const allowedAttrs = ALLOWED_ATTRS[tag] ?? new Set<string>();
        Array.from(el.attributes).forEach((attr) => {
            const attrName = attr.name.toLowerCase();
            if (attrName.startsWith('on') || attrName === 'style' || attrName === 'id' || attrName === 'name') {
                el.removeAttribute(attr.name);
                return;
            }
            if (!allowedAttrs.has(attrName)) {
                el.removeAttribute(attr.name);
            }
        });
    });

    host.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((el) => {
        const safe = safeUrl(el.getAttribute('href') || '');
        if (!safe) {
            el.removeAttribute('href');
            return;
        }
        el.setAttribute('href', safe);
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer nofollow');
    });

    host.querySelectorAll<HTMLImageElement>('img[src]').forEach((el) => {
        const safe = safeUrl(el.getAttribute('src') || '');
        if (!safe) {
            el.remove();
            return;
        }
        el.setAttribute('src', safe);
        sanitizePositiveIntAttr(el, 'width');
        sanitizePositiveIntAttr(el, 'height');
        el.setAttribute('loading', 'lazy');
    });

    return host.innerHTML;
}

function renderMarkdown(text: string): string {
    return sanitizeRenderedHtml(converter.makeHtml(text || ''));
}

export function initUblogMarkdown(): void {
    const source = document.getElementById("ublog-markdown-source") as HTMLTextAreaElement | null;
    const render = document.getElementById("ublog-markdown-render");
    if (source && render) {
        render.innerHTML = renderMarkdown(source.value || source.textContent || "");
    }
}
