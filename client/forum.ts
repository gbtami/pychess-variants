import { h, VNode } from 'snabbdom';
import { Api } from 'chessgroundx/api';
import { Chessground } from 'chessgroundx';
import * as cg from 'chessgroundx/types';

import { _ } from './i18n';
import { patch } from './document';
import { timeago } from './datetime';
import { PyChessModel } from './types';
import { expandGameEmbeds, makeExternalLinkPopups, renderRichText } from './richTextEnhance';
import { boardSettings } from './boardSettings';
import { VARIANTS } from './variants';

/** Supported forum UI modes mapped from URL paths. */
type ForumMode = 'index' | 'categ' | 'topic' | 'newTopic' | 'search' | 'modFeed';

/** Category row payload used by forum index and topic-category headers. */
interface ForumCategory {
    _id: string;
    name: string;
    desc: string;
    nbTopics: number;
    nbPosts: number;
    lastPostAt?: string | null;
    lastPostUser?: string;
    lastTopicSlug?: string;
    lastTopicName?: string;
    lastTopicPage?: number;
    lastPostId?: string;
}

/** Topic summary payload used by category listings and topic header state. */
interface ForumTopicSummary {
    _id: string;
    categId: string;
    slug: string;
    name: string;
    user: string;
    userTitle?: string;
    createdAt: string;
    updatedAt: string;
    nbPosts: number;
    nbReplies: number;
    lastPostAt: string;
    lastPostUser: string;
    lastPostUserTitle?: string;
    lastPostId: string;
    sticky?: boolean;
    closed?: boolean;
    lastPage?: number;
}

/** Post payload used by topic, search, and moderation feed views. */
interface ForumPost {
    _id: string;
    topicId: string;
    categId: string;
    user: string;
    userTitle?: string;
    text: string;
    createdAt: string;
    updatedAt?: string | null;
    canEdit?: boolean;
    canDelete?: boolean;
    canReact?: boolean;
    reactionCounts?: Record<string, number>;
    myReactions?: string[];
}

/** Search result row combining post data with owning topic and category labels. */
interface ForumSearchResult {
    post: ForumPost;
    postUserTitle?: string;
    topic: {
        _id: string;
        slug: string;
        name: string;
    };
    categ: {
        _id: string;
        name: string;
    };
}

/** Moderation feed row containing one post and its topic info. */
interface ForumModFeedItem {
    post: ForumPost;
    topic: {
        _id: string;
        slug: string;
        name: string;
    };
}

/** Client-side reaction descriptor mapped to emoji assets and API keys. */
interface ForumReaction {
    key: string;
    emoji: string;
}

/** Captcha payload returned by forum captcha API endpoints. */
interface ForumCaptcha {
    gameId: string;
    variant?: string;
    fen: string;
    color: 'white' | 'black';
    moves: Record<string, string>;
}

/** Captcha validation state mirrored in form UX feedback. */
type ForumCaptchaState = 'idle' | 'checking' | 'success' | 'failure';

/** Maximum accepted post length enforced by both UI and backend API. */
const FORUM_MAX_POST_LEN = 5000;
/** Maximum accepted topic-title length enforced by both UI and backend API. */
const FORUM_MAX_TOPIC_NAME_LEN = 100;
/** Supported forum reactions mirrored from the server and lila conventions. */
const REACTIONS: ForumReaction[] = [
    { key: '+1', emoji: '+1' },
    { key: '-1', emoji: '-1' },
    { key: 'laugh', emoji: 'laugh' },
    { key: 'thinking', emoji: 'thinking' },
    { key: 'heart', emoji: 'heart' },
    { key: 'horsey', emoji: 'horsey' },
];

/** Parse current path into the forum mode/categ/slug route state. */
function parsePath(pathname: string): { mode: ForumMode; categ?: string; slug?: string } {
    const clean = pathname.replace(/\/+$/g, '');
    const parts = clean.split('/').filter(Boolean);
    if (parts.length === 1 && parts[0] === 'forum') return { mode: 'index' };
    if (parts.length >= 2 && parts[0] === 'forum' && parts[1] === 'search') return { mode: 'search' };
    if (parts.length >= 3 && parts[0] === 'forum' && parts[2] === 'mod-feed') {
        return { mode: 'modFeed', categ: parts[1] };
    }
    if (parts.length >= 3 && parts[0] === 'forum' && parts[2] === 'form') {
        return { mode: 'newTopic', categ: parts[1] };
    }
    if (parts.length >= 3 && parts[0] === 'forum') return { mode: 'topic', categ: parts[1], slug: parts[2] };
    if (parts.length >= 2 && parts[0] === 'forum') return { mode: 'categ', categ: parts[1] };
    return { mode: 'index' };
}

/** Decode JSON responses and surface useful errors for malformed payloads. */
async function parseJsonResponse(res: Response) {
    const text = await res.text();
    if (text.length === 0) return { status: res.status, data: {} as any };
    try {
        return { status: res.status, data: JSON.parse(text) };
    } catch {
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
}

/** Compose a human-readable name with optional title prefix (e.g. GM user). */
function titleAndName(title: string | undefined, name: string): string {
    return title ? `${title} ${name}` : name;
}

/** Apply rich-content enhancers reused from inbox message rendering flow. */
function enhanceForumPostMessage(el: HTMLElement) {
    expandGameEmbeds(el, {
        linkSelector: 'a:not(.text)',
        expandLinkClass: 'forum-post-game-expand',
        embedContainerClass: 'forum-post-game-embed',
    });
    makeExternalLinkPopups(el, { selector: "a[href^='http']" });
    window.requestAnimationFrame(() => expandGameEmbeds(el));
}

/** Read a query-string parameter from the current location. */
function searchParam(name: string): string {
    const value = new URLSearchParams(window.location.search).get(name);
    return value ? value : '';
}

/** Parse and validate the current `page` query parameter. */
function pageParam(): number {
    const page = parseInt(searchParam('page'), 10);
    return Number.isFinite(page) && page > 0 ? page : 1;
}

/** Shorten long text snippets for tabular preview rows. */
function shorten(text: string, len: number): string {
    if (text.length <= len) return text;
    return `${text.slice(0, len - 1)}…`;
}

/** Build canonical post redirect URLs that preserve page and anchor resolution. */
function postRedirectHref(postId: string): string {
    return `/forum/redirect/post/${encodeURIComponent(postId)}`;
}

/** Build report-form URL prefilled for a specific forum post and author. */
function reportPostHref(post: ForumPost): string {
    const params = new URLSearchParams({
        source: 'profile',
        username: post.user,
        reason: 'harass',
        details: `${_('Forum post')}: ${window.location.origin}${postRedirectHref(post._id)}`,
    });
    return `/report?${params.toString()}`;
}

/** Forum SPA entry point for index/category/topic/search/mod-feed rendering and actions. */
export function forumView(model: PyChessModel) {
    boardSettings.assetURL = model.assetURL;
    const route = parsePath(window.location.pathname);
    const mode = route.mode;
    const categ = route.categ || '';
    const slug = route.slug || '';
    let appEl: HTMLElement | VNode;
    let loading = true;
    let error = '';

    let categories: ForumCategory[] = [];
    let topics: ForumTopicSummary[] = [];
    let topicPosts: ForumPost[] = [];
    let searchPosts: ForumSearchResult[] = [];
    let modFeedItems: ForumModFeedItem[] = [];

    let page = pageParam();
    let nbPages = 1;
    let total = 0;

    let categData: ForumCategory | null = null;
    let topicData: ForumTopicSummary | null = null;
    let canWrite = false;
    let canModerate = false;
    let canReply = false;
    let canClose = false;
    let canSticky = false;

    let relocateTargets: ForumCategory[] = [];

    let composeReply = '';
    let sendingReply = false;
    let creatingTopic = false;
    let topicTitleDraft = '';
    let topicTextDraft = '';
    let searchTextDraft = searchParam('text');
    let showRelocateModal = false;
    let relocateTargetDraft = '';
    let formCaptcha: ForumCaptcha | null = null;
    let loadingCaptcha = false;
    let captchaMoveDraft = '';
    let captchaState: ForumCaptchaState = 'idle';
    let captchaError = '';

    const reactingPostIds = new Set<string>();
    const expandedReactionPostIds = new Set<string>();
    const editDraftByPostId = new Map<string, string>();
    const savingEditPostIds = new Set<string>();

    /** Re-render the forum vnode tree after state changes. */
    function redraw() {
        appEl = patch(appEl, render());
    }

    /** Convert API errors into thrown exceptions for shared catch handling. */
    function handleApiError(data: { type?: string; message?: string }, status: number) {
        throw new Error(data.message || data.type || `HTTP ${status}`);
    }

    /** Parse compact captcha destination encoding into chessground destination map. */
    function parseCaptchaDests(moves: Record<string, string>): cg.Dests {
        const squarePattern = /[a-z][0-9]+/g;
        const dests: cg.Dests = new Map();
        Object.entries(moves || {}).forEach(([orig, raw]) => {
            if (!orig || !raw) return;
            const cleaned = raw.replace(/\s+/g, '');
            if (!/^[a-z][0-9]+$/i.test(orig)) return;
            const squares = cleaned.match(squarePattern) || [];
            const validSquares = squares as cg.Key[];
            if (validSquares.length > 0) dests.set(orig as cg.Key, validSquares);
        });
        return dests;
    }

    function captchaVariantKey(captcha: ForumCaptcha): string {
        const key = (captcha.variant || '').toLowerCase();
        return key && VARIANTS[key] ? key : 'chess';
    }

    /** Reset captcha interaction state while preserving loaded challenge payload. */
    function resetCaptchaState() {
        captchaMoveDraft = '';
        captchaState = 'idle';
        captchaError = '';
    }

    /** Replace active form captcha challenge and reset move/result state. */
    function setFormCaptcha(captcha: ForumCaptcha | null) {
        formCaptcha = captcha;
        resetCaptchaState();
    }

    /** Fetch a new forum captcha challenge payload for post forms. */
    function loadCaptcha() {
        if (loadingCaptcha) return;
        loadingCaptcha = true;
        captchaError = '';
        redraw();
        fetch('/api/forum/captcha')
            .then(parseJsonResponse)
            .then(({ status, data }) => {
                loadingCaptcha = false;
                if (status >= 400 || data.type === 'error') handleApiError(data, status);
                setFormCaptcha((data.captcha || null) as ForumCaptcha | null);
                redraw();
            })
            .catch((err) => {
                loadingCaptcha = false;
                setFormCaptcha(null);
                captchaError = err instanceof Error ? err.message : _('Could not load captcha.');
                redraw();
            });
    }

    /** Verify the selected captcha move with server API and update status classes. */
    function checkCaptchaMove(solution: string, board: Api, fen: string, color: cg.Color, dests: cg.Dests) {
        if (!formCaptcha) return;
        captchaState = 'checking';
        captchaMoveDraft = solution;
        redraw();
        fetch(`/api/forum/captcha/${encodeURIComponent(formCaptcha.gameId)}/check?solution=${encodeURIComponent(solution)}`)
            .then((res) => res.text())
            .then((text) => {
                if (text.trim() === '1') {
                    captchaState = 'success';
                    board.stop();
                } else {
                    captchaState = 'failure';
                    captchaMoveDraft = '';
                    window.setTimeout(() => {
                        board.set({
                            fen,
                            turnColor: color,
                            movable: {
                                color,
                                free: false,
                                dests,
                            },
                        });
                    }, 280);
                }
                redraw();
            })
            .catch(() => {
                captchaState = 'failure';
                captchaMoveDraft = '';
                redraw();
            });
    }

    /** Render chess captcha widget used by topic creation and reply forms. */
    function renderCaptcha() {
        if (loadingCaptcha) return h('div.forum-captcha-loading', _('Loading captcha...'));
        if (captchaError) {
            return h('div.forum-captcha-error', [
                h('span', captchaError),
                h('button.button.button-empty.text', {
                    props: { type: 'button' },
                    on: {
                        click: () => loadCaptcha(),
                    },
                }, _('Retry')),
            ]);
        }
        if (!formCaptcha) {
            return h('div.forum-captcha-error', _('Captcha unavailable. Please retry.'));
        }

        const variantKey = captchaVariantKey(formCaptcha);
        const captchaVariant = VARIANTS[variantKey];
        const color = formCaptcha.color === 'black' ? 'black' : 'white';
        const dests = parseCaptchaDests(formCaptcha.moves);
        return h(`div.forum-captcha${captchaState === 'success' ? '.success' : ''}${captchaState === 'failure' ? '.failure' : ''}`, { key: `captcha-${formCaptcha.gameId}` }, [
            h('div.forum-captcha__challenge', [
                h(`div.cg-wrap.${captchaVariant.board.cg}.mini`, {
                    hook: {
                        insert(vnode) {
                            boardSettings.updateScopedBoardStyle(captchaVariant, vnode.elm as Element);
                            boardSettings.updateScopedPieceStyle(captchaVariant, vnode.elm as Element);
                            const board = Chessground(vnode.elm as HTMLElement, {
                                fen: formCaptcha!.fen as cg.FEN,
                                dimensions: captchaVariant.board.dimensions,
                                notation: captchaVariant.notation,
                                pocketRoles: captchaVariant.pocket?.roles,
                                orientation: color,
                                turnColor: color,
                                coordinates: false,
                                viewOnly: false,
                                movable: {
                                    free: false,
                                    color,
                                    dests,
                                    events: {
                                        after(orig: cg.Key, dest: cg.Key) {
                                            checkCaptchaMove(`${orig} ${dest}`, board, formCaptcha!.fen, color, dests);
                                        },
                                    },
                                },
                            });
                        },
                    },
                }),
            ]),
            h('div.forum-captcha__explanation', [
                h('label.form-label', color === 'white' ? _('White checkmates in one move') : _('Black checkmates in one move')),
                h('p', _('This is a mate-in-one captcha. Click two squares to make your move.')),
                h(`div.forum-captcha__result.success${captchaState === 'success' ? '.visible' : ''}`, _('Checkmate.')),
                h(`div.forum-captcha__result.failure${captchaState === 'failure' ? '.visible' : ''}`, _('Not a checkmate. Try again.')),
            ]),
        ]);
    }

    /** Render simple previous/next pager links for list and topic pages. */
    function renderPagination(baseUrl: string) {
        if (nbPages <= 1) return null;
        const prevPage = page > 1 ? page - 1 : 1;
        const nextPage = page < nbPages ? page + 1 : nbPages;
        const sep = baseUrl.includes('?') ? '&' : '?';
        return h('nav.pagination.forum-pagination', [
            h(`a.button.button-empty${page <= 1 ? '.disabled' : ''}`, {
                attrs: { href: page <= 1 ? '#' : `${baseUrl}${sep}page=${prevPage}` },
            }, _('Previous')),
            h('span.forum-pagination-current', `${page} / ${nbPages}`),
            h(`a.button.button-empty${page >= nbPages ? '.disabled' : ''}`, {
                attrs: { href: page >= nbPages ? '#' : `${baseUrl}${sep}page=${nextPage}` },
            }, _('Next')),
        ]);
    }

    /** Load forum home categories and counters. */
    function loadIndex() {
        fetch('/api/forum/categs')
            .then(parseJsonResponse)
            .then(({ status, data }) => {
                if (status >= 400 || data.type === 'error') handleApiError(data, status);
                categories = data.categs || [];
                loading = false;
                redraw();
            })
            .catch((err) => {
                console.warn('Failed to load forum categories.', err);
                error = _('Could not load forum categories.');
                loading = false;
                redraw();
            });
    }

    /** Load one category with topic listing and permission flags. */
    function loadCateg() {
        fetch(`/api/forum/${encodeURIComponent(categ)}/topics?page=${page}`)
            .then(parseJsonResponse)
            .then(({ status, data }) => {
                if (status >= 400 || data.type === 'error') handleApiError(data, status);
                categData = data.categ || null;
                topics = data.topics || [];
                page = data.page || 1;
                nbPages = data.nbPages || 1;
                total = data.total || 0;
                canWrite = Boolean(data.canWrite);
                canModerate = Boolean(data.canModerate);
                setFormCaptcha((data.captcha || null) as ForumCaptcha | null);
                loading = false;
                redraw();
            })
            .catch((err) => {
                console.warn('Failed to load forum category.', err);
                error = _('Could not load forum category.');
                loading = false;
                redraw();
            });
    }

    /** Load one topic page including posts, reactions, and moderation metadata. */
    function loadTopic() {
        fetch(`/api/forum/${encodeURIComponent(categ)}/${encodeURIComponent(slug)}?page=${page}`)
            .then(parseJsonResponse)
            .then(({ status, data }) => {
                if (status >= 400 || data.type === 'error') handleApiError(data, status);
                categData = data.categ || null;
                topicData = data.topic || null;
                topicPosts = data.posts || [];
                page = data.page || 1;
                nbPages = data.nbPages || 1;
                total = data.total || 0;
                canWrite = Boolean(data.canWrite);
                canModerate = Boolean(data.canModerate);
                canReply = Boolean(data.canReply);
                canClose = Boolean(data.canClose);
                canSticky = Boolean(data.canSticky);
                relocateTargets = data.relocateTargets || [];
                setFormCaptcha((data.captcha || null) as ForumCaptcha | null);
                if (canReply && !formCaptcha) loadCaptcha();
                if (relocateTargetDraft === '' && relocateTargets.length > 0) {
                    relocateTargetDraft = relocateTargets[0]._id;
                }
                loading = false;
                redraw();
            })
            .catch((err) => {
                console.warn('Failed to load forum topic.', err);
                error = _('Could not load forum topic.');
                loading = false;
                redraw();
            });
    }

    /** Load forum search results for the current `text` query. */
    function loadSearch() {
        const text = searchParam('text').trim();
        searchTextDraft = text;
        if (!text) {
            searchPosts = [];
            page = 1;
            nbPages = 1;
            total = 0;
            loading = false;
            redraw();
            return;
        }
        fetch(`/api/forum/search?text=${encodeURIComponent(text)}&page=${page}`)
            .then(parseJsonResponse)
            .then(({ status, data }) => {
                if (status >= 400 || data.type === 'error') handleApiError(data, status);
                searchPosts = data.posts || [];
                page = data.page || 1;
                nbPages = data.nbPages || 1;
                total = data.total || 0;
                loading = false;
                redraw();
            })
            .catch((err) => {
                console.warn('Failed to load forum search results.', err);
                error = _('Could not search forum posts.');
                loading = false;
                redraw();
            });
    }

    /** Load moderator-only category feed ordered by latest posts first. */
    function loadModFeed() {
        fetch(`/api/forum/${encodeURIComponent(categ)}/mod-feed?page=${page}`)
            .then(parseJsonResponse)
            .then(({ status, data }) => {
                if (status >= 400 || data.type === 'error') handleApiError(data, status);
                categData = data.categ || null;
                modFeedItems = data.items || [];
                page = data.page || 1;
                nbPages = data.nbPages || 1;
                total = data.total || 0;
                loading = false;
                redraw();
            })
            .catch((err) => {
                console.warn('Failed to load forum moderation feed.', err);
                error = _('Could not load moderation feed.');
                loading = false;
                redraw();
            });
    }

    /** Submit creation of a new topic in the current category. */
    function submitNewTopic(event: Event) {
        event.preventDefault();
        const name = topicTitleDraft.trim();
        const text = topicTextDraft.trim();
        if (!name || !text || creatingTopic) return;
        if (!formCaptcha || captchaState !== 'success') {
            alert(_('Please solve the captcha.'));
            return;
        }
        creatingTopic = true;
        redraw();
        const formData = new URLSearchParams({
            name,
            text,
            gameId: formCaptcha.gameId,
            move: captchaMoveDraft,
        });
        fetch(`/api/forum/${encodeURIComponent(categ)}/topic`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
            body: formData.toString(),
        })
            .then(parseJsonResponse)
            .then(({ status, data }) => {
                if (status >= 400 || data.type === 'error') handleApiError(data, status);
                window.location.assign(data.redirect || `/forum/${encodeURIComponent(categ)}`);
            })
            .catch((err) => {
                console.warn('Failed to create topic.', err);
                alert(err instanceof Error ? err.message : _('Could not create topic.'));
                creatingTopic = false;
                redraw();
            });
    }

    /** Submit a reply message in the currently opened topic. */
    function submitReply(event: Event) {
        event.preventDefault();
        const text = composeReply.trim();
        if (!text || sendingReply || !topicData) return;
        if (!formCaptcha || captchaState !== 'success') {
            alert(_('Please solve the captcha.'));
            return;
        }
        sendingReply = true;
        redraw();
        const formData = new URLSearchParams({
            text,
            gameId: formCaptcha.gameId,
            move: captchaMoveDraft,
        });
        fetch(`/api/forum/${encodeURIComponent(categ)}/${encodeURIComponent(slug)}/post`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
            body: formData.toString(),
        })
            .then(parseJsonResponse)
            .then(({ status, data }) => {
                if (status >= 400 || data.type === 'error') handleApiError(data, status);
                window.location.assign(data.redirect || window.location.href);
            })
            .catch((err) => {
                console.warn('Failed to post reply.', err);
                alert(err instanceof Error ? err.message : _('Could not post reply.'));
                sendingReply = false;
                redraw();
            });
    }

    /** Delete a post after user confirmation. */
    function deletePost(post: ForumPost) {
        if (!window.confirm(_('Delete this post?'))) return;
        fetch(`/api/forum/post/${encodeURIComponent(post._id)}/delete`, { method: 'POST' })
            .then(parseJsonResponse)
            .then(({ status, data }) => {
                if (status >= 400 || data.type === 'error') handleApiError(data, status);
                window.location.reload();
            })
            .catch((err) => {
                console.warn('Failed to delete post.', err);
                alert(err instanceof Error ? err.message : _('Could not delete post.'));
            });
    }

    /** Toggle edit mode for one post and initialize draft from source text. */
    function editPost(post: ForumPost) {
        if (editDraftByPostId.has(post._id)) {
            editDraftByPostId.delete(post._id);
            savingEditPostIds.delete(post._id);
        } else {
            editDraftByPostId.set(post._id, post.text);
        }
        redraw();
    }

    /** Submit edited post text from inline form and refresh the current page. */
    function submitEditedPost(event: Event, post: ForumPost) {
        event.preventDefault();
        if (savingEditPostIds.has(post._id)) return;

        const draft = (editDraftByPostId.get(post._id) || '').trim();
        if (!draft) return;
        if (draft === post.text.trim()) {
            editDraftByPostId.delete(post._id);
            redraw();
            return;
        }

        savingEditPostIds.add(post._id);
        redraw();

        fetch(`/api/forum/post/${encodeURIComponent(post._id)}/edit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
            body: new URLSearchParams({ text: draft }).toString(),
        })
            .then(parseJsonResponse)
            .then(({ status, data }) => {
                savingEditPostIds.delete(post._id);
                if (status >= 400 || data.type === 'error') handleApiError(data, status);
                window.location.reload();
            })
            .catch((err) => {
                savingEditPostIds.delete(post._id);
                redraw();
                console.warn('Failed to edit post.', err);
                alert(err instanceof Error ? err.message : _('Could not edit post.'));
            });
    }

    /** Toggle topic closed/open state. */
    function toggleTopicClose() {
        fetch(`/api/forum/${encodeURIComponent(categ)}/${encodeURIComponent(slug)}/close`, { method: 'POST' })
            .then(parseJsonResponse)
            .then(({ status, data }) => {
                if (status >= 400 || data.type === 'error') handleApiError(data, status);
                window.location.reload();
            })
            .catch((err) => {
                console.warn('Failed to toggle topic close state.', err);
                alert(err instanceof Error ? err.message : _('Could not update topic.'));
            });
    }

    /** Toggle topic sticky/unsticky state. */
    function toggleTopicSticky() {
        fetch(`/api/forum/${encodeURIComponent(categ)}/${encodeURIComponent(slug)}/sticky`, { method: 'POST' })
            .then(parseJsonResponse)
            .then(({ status, data }) => {
                if (status >= 400 || data.type === 'error') handleApiError(data, status);
                window.location.reload();
            })
            .catch((err) => {
                console.warn('Failed to toggle topic sticky state.', err);
                alert(err instanceof Error ? err.message : _('Could not update topic.'));
            });
    }

    /** Add or remove a reaction and update local reaction state from API response. */
    function reactToPost(post: ForumPost, reaction: string) {
        if (!post.canReact) return;
        const key = `${post._id}:${reaction}`;
        if (reactingPostIds.has(key)) return;

        const mine = new Set(post.myReactions || []);
        const nextValue = !mine.has(reaction);

        reactingPostIds.add(key);
        redraw();

        fetch(`/api/forum/${encodeURIComponent(categ)}/react/${encodeURIComponent(post._id)}/${encodeURIComponent(reaction)}/${nextValue ? 'true' : 'false'}`, {
            method: 'POST',
        })
            .then(parseJsonResponse)
            .then(({ status, data }) => {
                reactingPostIds.delete(key);
                if (status >= 400 || data.type === 'error') handleApiError(data, status);
                post.reactionCounts = data.reactionCounts || {};
                post.myReactions = data.myReactions || [];
                redraw();
            })
            .catch((err) => {
                reactingPostIds.delete(key);
                redraw();
                console.warn('Failed to react to post.', err);
                alert(err instanceof Error ? err.message : _('Could not react to this post.'));
            });
    }

    /** Relocate a full thread to another category via moderator endpoint. */
    function relocateThread(postId: string) {
        if (!relocateTargetDraft) return;
        const formData = new URLSearchParams({ categ: relocateTargetDraft });
        fetch(`/api/forum/post/${encodeURIComponent(postId)}/relocate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
            body: formData.toString(),
        })
            .then(parseJsonResponse)
            .then(({ status, data }) => {
                if (status >= 400 || data.type === 'error') handleApiError(data, status);
                window.location.assign(data.redirect || `/forum/${encodeURIComponent(relocateTargetDraft)}`);
            })
            .catch((err) => {
                console.warn('Failed to relocate thread.', err);
                alert(err instanceof Error ? err.message : _('Could not relocate this thread.'));
            });
    }

    /** Insert quoted markdown for a selected post into the reply textarea. */
    function quotePost(post: ForumPost) {
        const reply = document.querySelector('#forum-reply-text') as HTMLTextAreaElement | null;
        const lines = post.text.split('\n');
        if (lines.length === 0) return;

        const quote =
            `@${post.user} said [^](${postRedirectHref(post._id)})\n` +
            lines.map((line) => `> ${line}`).join('\n') +
            '\n\n';

        if (reply) {
            const start = reply.selectionStart;
            const end = reply.selectionEnd;
            const before = reply.value.slice(0, start);
            const after = reply.value.slice(end);
            const newText = before + quote + after;
            composeReply = newText;
            redraw();
            window.requestAnimationFrame(() => {
                const updated = document.querySelector('#forum-reply-text') as HTMLTextAreaElement | null;
                if (updated) {
                    const pos = start + quote.length;
                    updated.focus();
                    updated.setSelectionRange(pos, pos);
                }
            });
            return;
        }

        composeReply = `${composeReply.trim()}\n\n${quote}`.trim();
        redraw();
    }

    /** Navigate to search route for the current draft text. */
    function submitSearch(event: Event) {
        event.preventDefault();
        const text = searchTextDraft.trim();
        if (!text) {
            window.location.assign('/forum');
            return;
        }
        window.location.assign(`/forum/search?text=${encodeURIComponent(text)}`);
    }

    /** Render the shared top-right search form used across forum modes. */
    function renderSearchBox() {
        return h('form.search', {
            on: { submit: submitSearch },
        }, [
            h('input', {
                attrs: {
                    type: 'text',
                    name: 'text',
                    placeholder: _('Search'),
                    enterkeyhint: 'search',
                },
                props: { value: searchTextDraft },
                on: {
                    input: (e: Event) => {
                        searchTextDraft = (e.target as HTMLInputElement).value;
                    },
                },
            }),
        ]);
    }

    /** Render per-post reaction chips with counts and current-user selection state. */
    function renderReactions(post: ForumPost) {
        const canReactPost = Boolean(post.canReact);
        const reactionCounts = post.reactionCounts || {};
        const mine = new Set(post.myReactions || []);
        const showAll = expandedReactionPostIds.has(post._id);
        const visible = REACTIONS.filter((r) => showAll || canReactPost || (reactionCounts[r.key] || 0) > 0);
        if (visible.length === 0) return null;

        const allReactionsVisible = REACTIONS.every((r) => (reactionCounts[r.key] || 0) > 0);
        const loading = REACTIONS.some((r) => reactingPostIds.has(`${post._id}:${r.key}`));
        return h(`div.reactions${canReactPost ? '.reactions-auth' : ''}${loading ? '.loading' : ''}`, [
            canReactPost && !allReactionsVisible
                ? h('button.reactions-toggle', {
                    props: {
                        type: 'button',
                    },
                    attrs: {
                        'data-icon': '+',
                        title: '+',
                    },
                    on: {
                        click: () => {
                            if (expandedReactionPostIds.has(post._id)) expandedReactionPostIds.delete(post._id);
                            else expandedReactionPostIds.add(post._id);
                            redraw();
                        },
                    },
                })
                : null,
            ...visible.map((r) => {
                const count = reactionCounts[r.key] || 0;
                const isMine = mine.has(r.key);
                return h(`button${isMine ? '.mine' : ''}${count > 0 ? '.yes' : '.no'}`, {
                    props: {
                        type: 'button',
                        disabled: !canReactPost,
                    },
                    attrs: {
                        title: r.key,
                    },
                    on: canReactPost ? { click: () => reactToPost(post, r.key) } : {},
                }, [
                    h('img', {
                        attrs: {
                            src: `${model.assetURL}/images/emoji/${encodeURIComponent(r.emoji)}.webp`,
                            alt: r.key,
                            width: '20',
                            height: '20',
                        },
                    }),
                    count > 0 ? h('span', `${count}`) : null,
                ].filter(Boolean as any));
            }),
        ]);
    }

    /** Render forum category index table. */
    function renderIndex() {
        return h('main.forum.index.box', [
            h('div.box__top', [
                h('h1', _('Forum')),
                h('div.box__top__actions', [renderSearchBox()]),
            ]),
            h('table.categs.slist.slist-pad', [
                h('thead', [
                    h('tr', [h('th', _('Category')), h('th.right', _('Topics')), h('th.right', _('Posts')), h('th', _('Last post'))]),
                ]),
                h('tbody', categories.map((c) => {
                    const lastHref = c.lastPostId
                        ? postRedirectHref(c.lastPostId)
                        : `/forum/${encodeURIComponent(c._id)}`;
                    return h('tr', [
                        h('td.subject', [
                            h('h2', [h('a', { attrs: { href: `/forum/${encodeURIComponent(c._id)}` } }, c.name)]),
                            h('p', c.desc || ''),
                        ]),
                        h('td.right', `${c.nbTopics || 0}`),
                        h('td.right', `${c.nbPosts || 0}`),
                        h('td', c.lastPostAt
                            ? [
                                h('a', { attrs: { href: lastHref } }, timeago(c.lastPostAt)),
                                h('br'),
                                h('span.forum-by', `${_('by')} ${c.lastPostUser || ''}`),
                            ]
                            : h('span.forum-empty', _('No posts yet.'))),
                    ]);
                })),
            ]),
        ]);
    }

    /** Render one category page with topic list and actions. */
    function renderCateg() {
        const actions: VNode[] = [];
        if (canModerate) {
            actions.push(h('a.button.button-empty.text', {
                attrs: { href: `/forum/${encodeURIComponent(categ)}/mod-feed` },
            }, _('Mod feed')));
        }
        if (canWrite) {
            actions.push(h('a.button.button-empty.button-green.text', {
                attrs: { href: `/forum/${encodeURIComponent(categ)}/form` },
            }, _('Create a new topic')));
        }

        return h('main.forum.forum-categ.box', [
            h('div.box__top', [
                h('h1', [
                    h('a.text', { attrs: { href: '/forum' } }, '‹'),
                    ` ${categData?.name || _('Forum')}`,
                ]),
                h('div.box__top__actions', actions),
            ]),
            h('table.topics.slist.slist-pad', [
                h('thead', [
                    h('tr', [h('th', _('Topic')), h('th.right', _('Replies')), h('th', _('Last post'))]),
                ]),
                h('tbody', topics.map((t) => h(`tr.paginated${t.sticky ? '.sticky' : ''}`, [
                    h('td.subject', [
                        h('a', { attrs: { href: `/forum/${encodeURIComponent(categ)}/${encodeURIComponent(t.slug)}` } }, t.name),
                    ]),
                    h('td.right', `${t.nbReplies || 0}`),
                    h('td', [
                        h('a', {
                            attrs: {
                                href: postRedirectHref(t.lastPostId),
                            },
                        }, timeago(t.lastPostAt)),
                        h('br'),
                        h('span.forum-by', `${_('by')} ${titleAndName(t.lastPostUserTitle, t.lastPostUser)}`),
                    ]),
                ]))),
            ]),
            renderPagination(`/forum/${encodeURIComponent(categ)}`),
        ]);
    }

    /** Render one topic post card with controls and rich-text content. */
    function renderTopicPost(post: ForumPost, isFirst: boolean) {
        const author = titleAndName(post.userTitle, post.user);
        const isTopicAuthor = topicData?.user === post.user;
        const isAnonUser = model.anon === 'True' || model.anon === 'true';
        const canReport = !isAnonUser && model.username !== post.user;
        const editing = editDraftByPostId.has(post._id);
        const editDraft = editDraftByPostId.get(post._id) || post.text;
        const savingEdit = savingEditPostIds.has(post._id);
        return h(`article.forum-post${isFirst ? '.topic-first' : ''}`, {
            attrs: {
                id: post._id,
                'data-post-id': post._id,
            },
        }, [
            h('div.forum-post__metas', [
                h('div', [
                    h(`a.user-link.ulpt.author${isTopicAuthor ? '.author--op' : ''}`, {
                        attrs: { href: `/@/${encodeURIComponent(post.user)}` },
                    }, author),
                    h('a', {
                        attrs: { href: `#${post._id}` },
                    }, post.updatedAt
                        ? [h('span.post-edited', `${_('edited')} `), timeago(post.updatedAt)]
                        : timeago(post.createdAt)),
                    post.canEdit
                        ? h('button.forum-post__button.edit.button.button-empty.text', {
                            props: { type: 'button' },
                            attrs: {
                                title: _('Edit'),
                                'aria-label': _('Edit'),
                            },
                            on: { click: () => editPost(post) },
                        }, [
                            h('i.icon.icon-pencil'),
                            h('span', _('Edit')),
                        ])
                        : null,
                    isFirst && canModerate && relocateTargets.length > 0
                        ? h('button.forum-post__button.mod-relocate.button.button-empty.icon-only', {
                            props: { type: 'button' },
                            attrs: {
                                title: _('Relocate'),
                                'aria-label': _('Relocate'),
                            },
                            on: {
                                click: () => {
                                    if (!relocateTargetDraft && relocateTargets.length > 0) {
                                        relocateTargetDraft = relocateTargets[0]._id;
                                    }
                                    showRelocateModal = true;
                                    redraw();
                                },
                            },
                        }, [h('i.icon.icon-step-forward')])
                        : null,
                    post.canDelete
                        ? h('button.forum-post__button.delete.button.button-empty.icon-only', {
                            props: { type: 'button' },
                            attrs: {
                                title: _('Delete'),
                                'aria-label': _('Delete'),
                            },
                            on: { click: () => deletePost(post) },
                        }, [h('i.icon.icon-trash-o')])
                        : null,
                    canReply
                        ? h('button.forum-post__button.quote.button.button-empty.text', {
                            props: { type: 'button' },
                            attrs: {
                                title: _('Quote'),
                                'aria-label': _('Quote'),
                            },
                            on: { click: () => quotePost(post) },
                        }, [
                            h('span.quote-glyph', '❝'),
                            h('span', _('Quote')),
                        ])
                        : null,
                    canReport
                        ? h('a.forum-post__button.report.button.button-empty.icon-only', {
                            attrs: {
                                href: reportPostHref(post),
                                title: _('Report'),
                                'aria-label': _('Report'),
                            },
                        }, [h('i.icon.icon-warning')])
                        : null,
                ].filter(Boolean as any)),
            ]),
            h('div.forum-post__message.expand-text', {
                hook: {
                    insert(vnode) {
                        enhanceForumPostMessage(vnode.elm as HTMLElement);
                    },
                    postpatch(_oldVnode, vnode) {
                        enhanceForumPostMessage(vnode.elm as HTMLElement);
                    },
                },
            }, renderRichText(post.text, { imageClass: 'forum-post-inline-image' })),
            h('div.forum-post__message-source', post.text),
            renderReactions(post),
            editing
                ? h('form.edit-post-form', {
                    on: {
                        submit: (event: Event) => submitEditedPost(event, post),
                    },
                }, [
                    h('textarea.form-control.post-text-area.edit-post-box', {
                        attrs: {
                            required: true,
                            rows: 10,
                            maxlength: `${FORUM_MAX_POST_LEN}`,
                            'data-topic': topicData?._id || '',
                        },
                        props: { value: editDraft },
                        on: {
                            input: (e: Event) => {
                                editDraftByPostId.set(post._id, (e.target as HTMLTextAreaElement).value);
                            },
                        },
                    }),
                    h('div.edit-buttons', [
                        h('a.edit-post-cancel', {
                            attrs: { href: '#' },
                            on: {
                                click: (event: Event) => {
                                    event.preventDefault();
                                    editDraftByPostId.delete(post._id);
                                    savingEditPostIds.delete(post._id);
                                    redraw();
                                },
                            },
                        }, _('Cancel')),
                        h('button.button', {
                            props: {
                                type: 'submit',
                                disabled: savingEdit,
                            },
                        }, _('Apply')),
                    ]),
                ])
                : null,
        ].filter(Boolean as any));
    }

    /** Render moderator relocate modal for moving a thread between categories. */
    function renderRelocateModal(firstPostId: string) {
        if (!showRelocateModal) return null;
        return h('div.forum-relocate-modal', [
            h('div.forum-modal-backdrop', {
                on: {
                    click: () => {
                        showRelocateModal = false;
                        redraw();
                    },
                },
            }),
            h('div.forum-modal-body', [
                h('p', _('Move the entire thread to another forum')),
                h('form.form3', {
                    on: {
                        submit: (e: Event) => {
                            e.preventDefault();
                            showRelocateModal = false;
                            redraw();
                            relocateThread(firstPostId);
                        },
                    },
                }, [
                    h('select.form-control', {
                        attrs: { name: 'categ' },
                        props: { value: relocateTargetDraft },
                        on: {
                            change: (e: Event) => {
                                relocateTargetDraft = (e.target as HTMLSelectElement).value;
                            },
                        },
                    }, relocateTargets.map((target) => h('option', {
                        attrs: { value: target._id },
                    }, target.name))),
                    h('div.form-actions', [
                        h('button.button.button-empty.cancel', {
                            props: { type: 'button' },
                            on: {
                                click: () => {
                                    showRelocateModal = false;
                                    redraw();
                                },
                            },
                        }, _('Cancel')),
                        h('button.button.button-red', { props: { type: 'submit' } }, _('Relocate the thread')),
                    ]),
                ]),
            ]),
        ]);
    }

    /** Render full topic page: header, posts, actions, and reply form. */
    function renderTopic() {
        const topicUrl = `/forum/${encodeURIComponent(categ)}/${encodeURIComponent(slug)}`;
        const firstPostId = topicPosts.length > 0 ? topicPosts[0]._id : '';
        return h('main.forum.forum-topic.page-small.box.box-pad', [
            h('div.box__top', [
                h('h1', [
                    h('a.text', { attrs: { href: `/forum/${encodeURIComponent(categ)}` } }, '‹'),
                    ` ${topicData?.name || ''}`,
                ]),
            ]),
            renderPagination(topicUrl),
            h('div.forum-topic__posts', topicPosts.map((post, idx) => renderTopicPost(post, idx === 0 && page === 1))),
            renderPagination(topicUrl),
            h('div.forum-topic__actions', [
                topicData?.closed
                    ? h('p', _('This topic is now closed.'))
                    : canReply
                        ? h('h2#reply', _('Reply to this topic'))
                        : h('p', _('You cannot post yet. Play some games first.')),
                h('div', [
                    canClose
                        ? h('button.button.button-empty.button-red', {
                            props: { type: 'button' },
                            on: { click: toggleTopicClose },
                        }, topicData?.closed ? _('Reopen') : _('Close'))
                        : null,
                    canSticky
                        ? h('button.button.button-empty.button-brag', {
                            props: { type: 'button' },
                            on: { click: toggleTopicSticky },
                        }, topicData?.sticky ? _('Unsticky') : _('Sticky'))
                        : null,
                ].filter(Boolean as any)),
            ]),
            canReply
                ? h('form.form3.reply', {
                    on: { submit: submitReply },
                }, [
                    h('label', { attrs: { for: 'forum-reply-text' } }, _('Message')),
                    h('textarea#forum-reply-text.post-text-area.form-control', {
                        attrs: {
                            rows: 10,
                            placeholder: _('Please be nice in the forum!'),
                            maxlength: `${FORUM_MAX_POST_LEN}`,
                            'data-topic': topicData?._id || '',
                        },
                        props: { value: composeReply },
                        on: {
                            input: (e: Event) => {
                                composeReply = (e.target as HTMLTextAreaElement).value;
                            },
                        },
                    }),
                    h('div.forum-form-help.space-between', [
                        h('span', _('Markdown available')),
                        h('a.text', {
                            attrs: {
                                href: '/page/forum-etiquette',
                            },
                        }, _('Forum etiquette')),
                    ]),
                    renderCaptcha(),
                    h('div.form-actions', [
                        h('a.button.button-empty', { attrs: { href: `/forum/${encodeURIComponent(categ)}` } }, _('Cancel')),
                        h('button.button', {
                            props: { type: 'submit', disabled: sendingReply },
                        }, sendingReply ? _('Sending...') : _('Reply')),
                    ]),
                ])
                : null,
            firstPostId ? renderRelocateModal(firstPostId) : null,
        ].filter(Boolean as any));
    }

    /** Render new-topic form page. */
    function renderNewTopic() {
        return h('main.forum.forum-topic.topic-form.page-small.box.box-pad', [
            h('div.box__top', [
                h('h1', [
                    h('a.text', { attrs: { href: `/forum/${encodeURIComponent(categ)}` } }, '‹'),
                    ` ${_('New topic')}`,
                ]),
            ]),
            h('section.warning', [
                h('h2', _('Important')),
                h('p', _('Your question may already be answered in FAQ or community pages.')),
                h('p', _('Use reports for moderation issues; keep forum posts constructive and respectful.')),
                h('p', [
                    _('Make sure to read'),
                    ' ',
                    h('a', { attrs: { href: '/page/forum-etiquette' } }, _('Forum etiquette')),
                    '.',
                ]),
            ]),
            h('form.form3', {
                on: { submit: submitNewTopic },
            }, [
                h('label', { attrs: { for: 'forum-topic-title' } }, _('Subject')),
                h('input#forum-topic-title.form-control', {
                    attrs: { type: 'text', maxlength: `${FORUM_MAX_TOPIC_NAME_LEN}`, required: true },
                    props: { value: topicTitleDraft },
                    on: {
                        input: (e: Event) => {
                            topicTitleDraft = (e.target as HTMLInputElement).value;
                        },
                    },
                }),
                h('label', { attrs: { for: 'forum-topic-text' } }, _('Message')),
                h('textarea#forum-topic-text.post-text-area.form-control', {
                    attrs: {
                        rows: 10,
                        maxlength: `${FORUM_MAX_POST_LEN}`,
                        placeholder: _('Please be nice in the forum!'),
                        required: true,
                    },
                    props: { value: topicTextDraft },
                    on: {
                        input: (e: Event) => {
                            topicTextDraft = (e.target as HTMLTextAreaElement).value;
                        },
                    },
                }),
                h('div.forum-form-help.space-between', [
                    h('span', _('Markdown available')),
                    h('a.text', {
                        attrs: {
                            href: '/page/forum-etiquette',
                        },
                    }, _('Forum etiquette')),
                ]),
                renderCaptcha(),
                h('div.form-actions', [
                    h('a.button.button-empty', { attrs: { href: `/forum/${encodeURIComponent(categ)}` } }, _('Cancel')),
                    h('button.button', {
                        props: { type: 'submit', disabled: creatingTopic },
                    }, creatingTopic ? _('Creating...') : _('Create the topic')),
                ]),
            ]),
        ]);
    }

    /** Render search results page. */
    function renderSearch() {
        const text = searchParam('text').trim();
        return h('main.forum.box.search', [
            h('div.box__top', [
                h('h1', [
                    h('a.text', { attrs: { href: '/forum' } }, '‹'),
                    text ? `${_('Search')} "${text}"` : _('Search'),
                ]),
                h('div.box__top__actions', [renderSearchBox()]),
            ]),
            h('strong.nb-results.box__pad', `${total} ${_('forum posts')}`),
            h('table.slist.slist-pad.slist-invert.search__results', [
                h('tbody', searchPosts.map((row) => {
                    const post = row.post;
                    const postHref = postRedirectHref(post._id);
                    return h('tr.stack-row', [
                        h('td', [
                            h('a.post', { attrs: { href: postHref } }, `${row.categ.name} - ${row.topic.name}`),
                            h('p', shorten(post.text, 220)),
                        ]),
                        h('td.info', [
                            h('span', timeago(post.createdAt)),
                            h('br'),
                            h('span', titleAndName(row.postUserTitle, post.user)),
                        ]),
                    ]);
                })),
            ]),
            renderPagination(`/forum/search?text=${encodeURIComponent(text)}`),
        ]);
    }

    /** Render moderator category feed table. */
    function renderModFeed() {
        return h('main.forum.forum-mod-feed.box', [
            h('div.box__top', [
                h('h1', [
                    h('a.text', { attrs: { href: `/forum/${encodeURIComponent(categ)}` } }, '‹'),
                    ` ${categData?.name || categ} ${_('mod feed')}`,
                ]),
            ]),
            h('table.slist.slist-pad', [
                h('thead', [
                    h('tr', [h('th', _('User')), h('th', _('Topic')), h('th', _('Post')), h('th', _('Date'))]),
                ]),
                h('tbody', modFeedItems.map((item) => {
                    const post = item.post;
                    return h('tr', [
                        h('td', [
                            h('a.user-link', { attrs: { href: `/@/${encodeURIComponent(post.user)}` } }, titleAndName(post.userTitle, post.user)),
                        ]),
                        h('td', [
                            h('a', {
                                attrs: {
                                    href: `/forum/${encodeURIComponent(categ)}/${encodeURIComponent(item.topic.slug)}`,
                                },
                            }, item.topic.name),
                        ]),
                        h('td', shorten(post.text, 280)),
                        h('td', [
                            h('a', { attrs: { href: postRedirectHref(post._id) } }, timeago(post.createdAt)),
                        ]),
                    ]);
                })),
            ]),
            renderPagination(`/forum/${encodeURIComponent(categ)}/mod-feed`),
        ]);
    }

    /** Select and render page body for the active forum mode. */
    function render() {
        if (loading) {
            return h('main.forum.box', [h('div.box__pad', _('Loading...'))]);
        }
        if (error) {
            return h('main.forum.box', [h('div.box__pad.error', error)]);
        }
        if (mode === 'categ') return renderCateg();
        if (mode === 'topic') return renderTopic();
        if (mode === 'newTopic') return renderNewTopic();
        if (mode === 'search') return renderSearch();
        if (mode === 'modFeed') return renderModFeed();
        return renderIndex();
    }

    setTimeout(() => {
        appEl = document.getElementById('forum-app') as HTMLElement;
        if (mode === 'categ') loadCateg();
        else if (mode === 'topic') loadTopic();
        else if (mode === 'newTopic') {
            loading = false;
            redraw();
            loadCaptcha();
        } else if (mode === 'search') loadSearch();
        else if (mode === 'modFeed') loadModFeed();
        else loadIndex();
    }, 0);

    return h('main#forum-app.forum.box');
}
