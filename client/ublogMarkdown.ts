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
    'img', 'span', 'div', 'iframe',
]);

// Keep legacy presentational align attributes from migrated posts.
const ALIGN_ATTRS = new Set(['align']);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
    a: new Set(['href', 'title']),
    img: new Set(['src', 'alt', 'title', 'width', 'height']),
    p: ALIGN_ATTRS,
    div: new Set(['align', 'class']),
    h1: ALIGN_ATTRS,
    h2: ALIGN_ATTRS,
    h3: ALIGN_ATTRS,
    h4: ALIGN_ATTRS,
    h5: ALIGN_ATTRS,
    h6: ALIGN_ATTRS,
    code: new Set(['class']),
    pre: new Set(['class']),
    th: new Set(['align', 'colspan', 'rowspan']),
    td: new Set(['align', 'colspan', 'rowspan']),
    iframe: new Set(['src', 'width', 'height', 'frameborder', 'allowfullscreen', 'loading', 'referrerpolicy']),
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

function toProxiedImageUrl(url: string): string {
    try {
        const parsed = new URL(url, window.location.origin);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            if (parsed.origin === window.location.origin) return parsed.pathname + parsed.search + parsed.hash;
            // External inline images are served through our backend to avoid ORB/CORS breakage.
            return `/blogs/image?url=${encodeURIComponent(parsed.href)}`;
        }
        return url;
    } catch {
        return url;
    }
}

function safeIframeUrl(url: string): string | null {
    const value = (url || '').trim();
    if (!value) return null;
    try {
        const parsed = new URL(value, window.location.origin);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

        const host = parsed.hostname.toLowerCase();
        const path = parsed.pathname;
        const isLocal = parsed.origin === window.location.origin;
        const isLichessStudyEmbed = (host === 'lichess.org' || host === 'www.lichess.org') && path.startsWith('/study/embed/');
        const isYouTubeEmbed = (
            host === 'www.youtube.com' ||
            host === 'youtube.com' ||
            host === 'www.youtube-nocookie.com'
        ) && path.startsWith('/embed/');

        if (isLocal || isLichessStudyEmbed || isYouTubeEmbed) {
            return parsed.href;
        }
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

        if (tag === 'div') {
            const className = (el.getAttribute('class') || '').trim();
            if (className && className !== 'embed') {
                el.removeAttribute('class');
            }
        }
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
        el.setAttribute('src', toProxiedImageUrl(safe));
        sanitizePositiveIntAttr(el, 'width');
        sanitizePositiveIntAttr(el, 'height');
        el.setAttribute('loading', 'lazy');
    });

    host.querySelectorAll<HTMLIFrameElement>('iframe[src]').forEach((el) => {
        const safe = safeIframeUrl(el.getAttribute('src') || '');
        if (!safe) {
            el.remove();
            return;
        }
        el.setAttribute('src', safe);
        sanitizePositiveIntAttr(el, 'width');
        sanitizePositiveIntAttr(el, 'height');
        el.setAttribute('loading', 'lazy');
        el.setAttribute('referrerpolicy', 'no-referrer');
        if (!el.hasAttribute('allowfullscreen')) {
            el.setAttribute('allowfullscreen', '');
        }
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
