import type { VNode } from "snabbdom";
import { h } from "snabbdom";

type RichNode = VNode | string;

// Derived from lichess rich text behavior, adapted for pychess.
const linkRegex =
    /(^|[\s\n]|<[A-Za-z]*\/?>)((?:(?:https?|ftp):\/\/|pychess\.org)[\-A-Z0-9+\u0026\u2019@#/%?=()~_|!:,.;]*[\-A-Z0-9+\u0026@#/%=~()_|])/gi;
const mentionRegex = /(^|[^\w@#/])@([a-z0-9_-]{2,30})/gi;
const gameIdRegex = /(\s#)([\w]{8})($|[^\w-])/g;
const imgurRegex = /https?:\/\/(?:i\.)?imgur\.com\/(?!gallery\b)(\w{7})(?:\.jpe?g|\.png|\.gif)?/i;
const giphyRegex = /https:\/\/(?:media\.giphy\.com\/media\/|giphy\.com\/gifs\/(?:\w+-)*)(\w+)(?:\/giphy\.gif)?/i;
const imageExtRegex = /\.(jpg|jpeg|png|gif)$/i;
const gamePathRegex = /^\/(?:embed\/)?(?:game\/)?(\w{8})$/i;
const nonGamePaths = new Set([
    "training",
    "analysis",
    "insights",
    "practice",
    "features",
    "password",
    "streamer",
    "timeline",
]);

const preparedPopupSelectors = new WeakMap<HTMLElement, Set<string>>();

interface EnhanceRichTextOptions {
    imageClass?: string;
    allowExternalMediaEmbeds?: boolean;
}

interface ExpandGameEmbedsOptions {
    linkSelector?: string;
    expandLinkClass?: string;
    embedContainerClass?: string;
}

interface ExternalLinkPopupOptions {
    selector?: string;
    siteHost?: string;
}

function escapeHtml(input: string): string {
    return input
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function toUrl(url: string): URL | null {
    try {
        const value = /^[A-Za-z]+:\/\//.test(url)
            ? url
            : url.startsWith("/")
                ? url
                : `https://${url}`;
        const parsed = new URL(value, window.location.origin);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
        return parsed;
    } catch {
        return null;
    }
}

function safeHref(url: string): string | null {
    const parsed = toUrl(url);
    return parsed?.href ?? null;
}

function linkHtml(href: string, body: string, expandable = true): string {
    const classes = expandable ? "" : ' class="text"';
    return `<a${classes} target="_blank" rel="nofollow noreferrer noopener" href="${escapeHtml(href)}">${body}</a>`;
}

function expandLink(url: string): string {
    const href = safeHref(url);
    if (!href) return escapeHtml(url);
    return linkHtml(href, escapeHtml(url.replace(/^https?:\/\//i, "")));
}

function imageHtml(src: string, imageClass: string): string {
    return `<img class="${escapeHtml(imageClass)}" src="${escapeHtml(src)}" alt="${escapeHtml(src)}" referrerpolicy="no-referrer" loading="lazy" decoding="async"/>`;
}

function sameOrigin(href: string): boolean {
    try {
        return new URL(href).origin === window.location.origin;
    } catch {
        return false;
    }
}

function canEmbedImageHref(href: string, options: EnhanceRichTextOptions): boolean {
    if (sameOrigin(href)) return true;
    if (typeof options.allowExternalMediaEmbeds === "boolean") return options.allowExternalMediaEmbeds;

    // With COEP/COOP isolation, many third-party images are blocked by CORP.
    // Default to link-only for cross-origin media in that mode.
    return !window.crossOriginIsolated;
}

function expandImageLike(url: string, options: EnhanceRichTextOptions): string | undefined {
    const href = safeHref(url);
    if (!href) return undefined;
    if (!canEmbedImageHref(href, options)) return undefined;
    const imageClass = options.imageClass || "inbox-msg-inline-image";

    const imgur = href.match(imgurRegex);
    if (imgur) {
        const src = `https://i.imgur.com/${imgur[1]}.jpg`;
        return linkHtml(src, imageHtml(src, imageClass));
    }

    const giphy = href.match(giphyRegex);
    if (giphy) {
        const src = `https://media.giphy.com/media/${giphy[1]}/giphy.gif`;
        return linkHtml(src, imageHtml(src, imageClass));
    }

    if (imageExtRegex.test(href)) {
        return linkHtml(href, imageHtml(href, imageClass));
    }

    return undefined;
}

function expandUrl(url: string, options: EnhanceRichTextOptions): string {
    return expandImageLike(url, options) ?? expandLink(url);
}

function enhanceUrls(escaped: string, options: EnhanceRichTextOptions): string {
    return escaped.replace(linkRegex, (_, space: string, url: string) => `${space}${expandUrl(url, options)}`);
}

function enhanceMentions(html: string): string {
    return html.replace(mentionRegex, (_m: string, prefix: string, user: string) => {
        return `${prefix}${linkHtml(`/@/${encodeURIComponent(user)}`, `@${escapeHtml(user)}`)}`;
    });
}

function enhanceGameIds(html: string): string {
    return html.replace(gameIdRegex, (_m: string, bulkStart: string, id: string, suffix: string) => {
        return ` ${linkHtml(`/${id}`, `#${id}`, !bulkStart)}${suffix}`;
    });
}

export function enhanceRichText(text: string, options: EnhanceRichTextOptions = {}): string {
    const escaped = escapeHtml(text);
    return enhanceGameIds(enhanceMentions(enhanceUrls(escaped, options))).replace(/\n/g, "<br>");
}

export function isMoreThanText(text: string): boolean {
    return /(\n|(@|#|\.)\w{2,}|https?:\/\/|pychess\.org)/i.test(text);
}

export function renderRichText(text: string, options: EnhanceRichTextOptions = {}): RichNode[] {
    if (!isMoreThanText(text)) return [text];
    return [
        h("span", {
            hook: {
                insert(vnode) {
                    const el = vnode.elm as HTMLElement;
                    el.innerHTML = enhanceRichText(text, options);
                },
                postpatch(_oldVnode, vnode) {
                    const el = vnode.elm as HTMLElement;
                    el.innerHTML = enhanceRichText(text, options);
                },
            },
        }),
    ];
}

function parseGameLink(link: HTMLAnchorElement): { id: string; ply?: string } | null {
    let parsed: URL;
    try {
        parsed = new URL(link.href);
    } catch {
        return null;
    }

    if (parsed.host.toLowerCase() !== window.location.host.toLowerCase()) return null;

    const path = parsed.pathname.replace(/\/+$/g, "");
    const match = path.match(gamePathRegex);
    if (!match) return null;

    const id = match[1];
    if (!id) return null;
    if (nonGamePaths.has(id.toLowerCase())) return null;

    const hash = parsed.hash.startsWith("#") ? parsed.hash.slice(1) : "";
    return {
        id,
        ply: /^\d+$/.test(hash) ? hash : undefined,
    };
}

function renderGameEmbed(link: HTMLAnchorElement, game: { id: string; ply?: string }, embedContainerClass: string) {
    const container = document.createElement("div");
    container.className = embedContainerClass;

    const iframe = document.createElement("iframe");
    const hash = game.ply ? `#${game.ply}` : "";
    iframe.src = `/embed/${game.id}${hash}`;
    iframe.loading = "lazy";
    iframe.referrerPolicy = "no-referrer";
    iframe.title = `Game ${game.id}`;

    container.appendChild(iframe);
    link.replaceWith(container);
}

export function expandGameEmbeds(root: HTMLElement, options: ExpandGameEmbedsOptions = {}) {
    const linkSelector = options.linkSelector || "a:not(.text)";
    const expandLinkClass = options.expandLinkClass || "inbox-msg-game-expand";
    const embedContainerClass = options.embedContainerClass || "inbox-msg-game-embed";
    const links = Array.from(root.querySelectorAll(linkSelector)) as HTMLAnchorElement[];
    const games = links
        .map((link) => ({ link, parsed: parseGameLink(link) }))
        .filter((item): item is { link: HTMLAnchorElement; parsed: { id: string; ply?: string } } => item.parsed !== null);

    if (games.length === 0) return;

    if (games.length < 3) {
        games.forEach(({ link, parsed }) => renderGameEmbed(link, parsed, embedContainerClass));
        return;
    }

    games.forEach(({ link, parsed }) => {
        link.classList.add(expandLinkClass);
        link.title = "Click to expand";
        link.addEventListener("click", (event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            renderGameEmbed(link, parsed, embedContainerClass);
        }, { once: true });
    });
}

export function expandInboxGameEmbeds(root: HTMLElement) {
    expandGameEmbeds(root, {
        linkSelector: "a:not(.text)",
        expandLinkClass: "inbox-msg-game-expand",
        embedContainerClass: "inbox-msg-game-embed",
    });
}

export function makeExternalLinkPopups(root: HTMLElement, options: ExternalLinkPopupOptions = {}) {
    const selector = options.selector || "a[href^='http']";
    const prepared = preparedPopupSelectors.get(root) || new Set<string>();
    if (prepared.has(selector)) return;
    prepared.add(selector);
    preparedPopupSelectors.set(root, prepared);
    const siteHost = (options.siteHost || "pychess.org").toLowerCase();

    root.addEventListener("click", (event) => {
        const target = event.target as HTMLElement | null;
        const link = target?.closest(selector) as HTMLAnchorElement | null;
        if (!link) return;

        let parsed: URL;
        try {
            parsed = new URL(link.href);
        } catch {
            return;
        }

        const host = parsed.host.toLowerCase();
        const sameHost = host === window.location.host.toLowerCase();
        if (sameHost || host.endsWith(`.${siteHost}`) || host === siteHost) return;

        const proceed = window.confirm(`You are leaving ${siteHost} and opening ${host}. Continue?`);
        if (!proceed) {
            event.preventDefault();
            event.stopPropagation();
        }
    });
}
