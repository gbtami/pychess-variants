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

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function safeUrl(url: string): string | null {
    const value = (url || '').trim();
    if (!value) return null;
    if (value.startsWith('/')) return value;
    try {
        const parsed = new URL(value);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
        return null;
    } catch {
        return null;
    }
}

function sanitizeRenderedHtml(html: string): string {
    const host = document.createElement('div');
    host.innerHTML = html;

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
        el.setAttribute('loading', 'lazy');
    });

    return host.innerHTML;
}

function renderMarkdown(text: string): string {
    const escaped = escapeHtml(text || '');
    return sanitizeRenderedHtml(converter.makeHtml(escaped));
}

export function initUblogMarkdown(): void {
    const source = document.getElementById("ublog-markdown-source") as HTMLTextAreaElement | null;
    const render = document.getElementById("ublog-markdown-render");
    if (source && render) {
        render.innerHTML = renderMarkdown(source.value || source.textContent || "");
    }
}
