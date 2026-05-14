import { Chessground } from 'chessgroundx';
import { Api } from 'chessgroundx/api';

import { _, ngettext } from './i18n';
import { boardSettings } from './boardSettings';
import { timeago } from './datetime';
import { getLastMoveFen, VARIANTS } from './variants';
import { displayUsername } from './user';

interface MiniPerf {
    variant: string;
    rating: number;
    provisional: boolean;
    nb: number;
}

interface MiniPlaying {
    gameId: string;
    url: string;
    variant: string;
    fen: string;
    lastMove: string;
    w: string;
    wTitle: string;
    b: string;
    bTitle: string;
    orientation: 'white' | 'black';
}

interface MiniPayload {
    username: string;
    title: string;
    online: boolean;
    joinedAt: string | null;
    count: {
        game: number;
        win: number;
        loss: number;
        draw: number;
        rated: number;
    };
    vsScore: {
        mineTenths: number;
        oppTenths: number;
    } | null;
    perfs: MiniPerf[];
    playing: MiniPlaying | null;
}

interface OngoingMessage {
    gameId: string;
    fen: string;
    lastMove: string;
}

interface BlocksResponse {
    blocks?: string[];
}

interface CacheEntry {
    expiresAt: number;
    payload: MiniPayload;
}

const HOVER_DELAY_MS = 110;
const HIDE_DELAY_MS = 130;
const CACHE_TTL_MS = 8000;

function parseProfileId(target: HTMLElement): string | null {
    const href = target.getAttribute('data-href') ?? target.getAttribute('href');
    if (!href) return null;

    let url: URL;
    try {
        url = new URL(href, window.location.origin);
    } catch (_err) {
        return null;
    }

    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2 || parts[0] !== '@') return null;
    return decodeURIComponent(parts[1]);
}

function splitVariantKey(variantKey: string): { base: string; chess960: boolean } {
    if (variantKey.endsWith('960')) {
        return { base: variantKey.slice(0, -3), chess960: true };
    }
    return { base: variantKey, chess960: false };
}

function clearElement(el: HTMLElement) {
    while (el.firstChild) el.removeChild(el.firstChild);
}

function formatJoinedAgo(value: string | null): string {
    if (!value) return '';
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return '';
    return timeago(parsed.toISOString());
}

function formatTenthsScore(value: number): string {
    const points = Math.max(0, Math.trunc(value));
    const whole = Math.floor(points / 10);
    return points % 10 === 5 ? `${whole}½` : `${whole}`;
}

class UserMiniWidget {
    private readonly root: HTMLDivElement;
    private readonly content: HTMLDivElement;

    private hoverTimer?: number;
    private hideTimer?: number;
    private requestSeq = 0;

    private anchor?: HTMLElement;
    private anchorUser?: string;
    private overWidget = false;
    private lastMouseX = 0;
    private lastMouseY = 0;

    private cg?: Api;
    private liveGameId?: string;
    private liveVariantName?: string;
    private liveOrientation: 'white' | 'black' = 'white';

    private currentPayload?: MiniPayload;
    private readonly blockedUsers = new Set<string>();
    private loadedBlocks = false;
    private loadingBlocks?: Promise<void>;

    private readonly cache = new Map<string, CacheEntry>();
    private readonly ongoingSource: EventSource;

    constructor(
        private readonly assetURL: string,
        private readonly currentUsername: string,
        private readonly isAnon: boolean,
    ) {
        this.root = document.createElement('div');
        this.root.className = 'user-mini-widget hidden';

        this.content = document.createElement('div');
        this.content.className = 'user-mini-widget__content';
        this.root.appendChild(this.content);

        document.body.appendChild(this.root);

        this.root.addEventListener('mouseenter', () => {
            this.overWidget = true;
            this.clearHideTimer();
        });
        this.root.addEventListener('mouseleave', () => {
            this.overWidget = false;
            this.scheduleHide();
        });

        this.ongoingSource = new EventSource('/api/ongoing');
        this.ongoingSource.onmessage = (event) => {
            if (!this.liveGameId || !this.cg || !this.liveVariantName) return;
            const msg = JSON.parse(event.data) as OngoingMessage;
            if (msg.gameId !== this.liveGameId) return;

            const [lastMove, fen] = getLastMoveFen(this.liveVariantName, msg.lastMove, msg.fen);
            this.cg.set({
                fen,
                lastMove,
                orientation: this.liveOrientation,
            });
        };
    }

    init() {
        document.body.addEventListener('mouseover', this.onBodyMouseOver);
        document.body.addEventListener('mouseout', this.onBodyMouseOut);
        window.addEventListener('scroll', this.onWindowChange, true);
        window.addEventListener('resize', this.onWindowChange);
        void this.loadBlockedUsers();
    }

    private onWindowChange = () => {
        if (!this.anchor || this.root.classList.contains('hidden')) return;
        this.positionForAnchor(this.anchor);
    };

    private onBodyMouseOver = (event: MouseEvent) => {
        const target = event.target as HTMLElement | null;
        if (!target) return;
        this.lastMouseX = event.clientX;
        this.lastMouseY = event.clientY;

        const anchor = target.closest('.user-link') as HTMLElement | null;
        if (!anchor || this.root.contains(anchor)) return;

        const profileId = parseProfileId(anchor);
        if (!profileId) return;

        this.anchor = anchor;
        this.anchorUser = profileId;

        this.clearHideTimer();
        this.scheduleShow(anchor, profileId);
    };

    private onBodyMouseOut = (event: MouseEvent) => {
        const target = event.target as HTMLElement | null;
        if (!target) return;
        const fromLink = target.closest('.user-link') as HTMLElement | null;
        if (!fromLink) return;

        const related = event.relatedTarget as HTMLElement | null;
        if (related && (this.root.contains(related) || fromLink.contains(related))) return;

        this.scheduleHide();
    };

    private placeByPoint(x: number, y: number) {
        const spacing = 8;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const widgetRect = this.root.getBoundingClientRect();

        let left = x + 20;
        if (left + widgetRect.width > vw - spacing) {
            left = vw - widgetRect.width - spacing;
        }
        if (left < spacing) left = spacing;

        let top = y + 16;
        if (top + widgetRect.height > vh - spacing) {
            top = y - widgetRect.height - spacing;
        }
        if (top < spacing) top = spacing;

        this.root.style.left = `${Math.round(left)}px`;
        this.root.style.top = `${Math.round(top)}px`;
        this.root.style.visibility = 'visible';
    }

    private scheduleShow(anchor: HTMLElement, profileId: string) {
        this.clearHoverTimer();
        this.hoverTimer = window.setTimeout(() => {
            this.hoverTimer = undefined;
            void this.show(anchor, profileId);
        }, HOVER_DELAY_MS);
    }

    private scheduleHide() {
        this.clearHideTimer();
        this.hideTimer = window.setTimeout(() => {
            this.hideTimer = undefined;
            if (this.overWidget) return;
            this.root.classList.add('hidden');
            this.clearLiveBoard();
        }, HIDE_DELAY_MS);
    }

    private clearHoverTimer() {
        if (this.hoverTimer === undefined) return;
        window.clearTimeout(this.hoverTimer);
        this.hoverTimer = undefined;
    }

    private clearHideTimer() {
        if (this.hideTimer === undefined) return;
        window.clearTimeout(this.hideTimer);
        this.hideTimer = undefined;
    }

    private async show(anchor: HTMLElement, profileId: string) {
        this.root.classList.remove('hidden');
        this.positionForAnchor(anchor);
        this.renderLoading(profileId);

        const seq = ++this.requestSeq;
        try {
            const [payload] = await Promise.all([this.fetchMini(profileId), this.loadBlockedUsers()]);
            if (seq !== this.requestSeq) return;
            if (this.anchorUser !== profileId) return;
            this.currentPayload = payload;
            this.renderPayload(payload);
            this.positionForAnchor(anchor);
        } catch (_err) {
            if (seq !== this.requestSeq) return;
            this.root.classList.add('hidden');
            this.clearLiveBoard();
        }
    }

    private async fetchMini(profileId: string): Promise<MiniPayload> {
        const now = Date.now();
        const cached = this.cache.get(profileId);
        if (cached && cached.expiresAt > now) {
            return cached.payload;
        }

        const response = await fetch(`/@/${encodeURIComponent(profileId)}/mini`);
        if (!response.ok) throw new Error(`mini fetch failed: ${response.status}`);
        const payload = (await response.json()) as MiniPayload;

        this.cache.set(profileId, {
            expiresAt: now + CACHE_TTL_MS,
            payload,
        });

        return payload;
    }

    private async loadBlockedUsers(): Promise<void> {
        if (this.isAnon || this.loadedBlocks) return;
        if (this.loadingBlocks) return this.loadingBlocks;

        this.loadingBlocks = (async () => {
            try {
                const response = await fetch('/api/blocks');
                if (!response.ok) return;
                const payload = (await response.json()) as BlocksResponse;
                if (!Array.isArray(payload.blocks)) return;

                this.blockedUsers.clear();
                payload.blocks.forEach((username) => this.blockedUsers.add(username));
                this.loadedBlocks = true;
            } catch (_err) {
                // non-fatal
            } finally {
                this.loadingBlocks = undefined;
            }
        })();

        return this.loadingBlocks;
    }

    private renderLoading(profileId: string) {
        clearElement(this.content);

        const head = document.createElement('div');
        head.className = 'umw-head';
        head.textContent = profileId;
        this.content.appendChild(head);
    }

    private renderPayload(payload: MiniPayload) {
        clearElement(this.content);
        this.clearLiveBoard();

        const head = document.createElement('div');
        head.className = 'umw-head';

        const status = document.createElement('span');
        status.className = `umw-status ${payload.online ? 'online' : 'offline'}`;
        status.setAttribute('aria-hidden', 'true');
        head.appendChild(status);

        const nameLink = document.createElement('a');
        nameLink.className = 'user-link';
        nameLink.href = `/@/${encodeURIComponent(payload.username)}`;
        nameLink.textContent = `${payload.title ? `${payload.title} ` : ''}${displayUsername(payload.username)}`;
        head.appendChild(nameLink);

        this.content.appendChild(head);

        if (payload.perfs.length > 0) {
            const perfList = document.createElement('div');
            perfList.className = 'umw-perfs';

            for (const perf of payload.perfs) {
                const key = splitVariantKey(perf.variant);
                const variant = VARIANTS[key.base];
                if (!variant) continue;

                const link = document.createElement('a');
                link.className = 'umw-perf icon';
                link.href = `/@/${encodeURIComponent(payload.username)}/perf/${perf.variant}`;
                link.setAttribute('data-icon', variant.icon(key.chess960));
                link.title = `${variant.displayName(key.chess960)} • ${perf.nb}`;
                link.textContent = `${perf.rating}${perf.provisional ? '?' : ''}`;
                perfList.appendChild(link);
            }

            this.content.appendChild(perfList);
        }

        const actions = this.renderActions(payload);
        if (actions) this.content.appendChild(actions);

        if (payload.vsScore) {
            const score = document.createElement('div');
            score.className = 'umw-score';
            score.textContent =
                `${_('Your score')}: ${formatTenthsScore(payload.vsScore.mineTenths)} - ${formatTenthsScore(payload.vsScore.oppTenths)}`;
            this.content.appendChild(score);
        }

        const details = document.createElement('div');
        details.className = 'umw-details';

        const games = document.createElement('span');
        const gamesCount = Math.max(0, payload.count?.game ?? 0);
        games.textContent = ngettext('%1 game', '%1 games', gamesCount);
        details.appendChild(games);

        const joined = formatJoinedAgo(payload.joinedAt);
        if (joined) {
            const joinedEl = document.createElement('span');
            joinedEl.className = 'umw-joined';
            joinedEl.textContent = `${_('Joined')} ${joined}`;
            details.appendChild(joinedEl);
        }

        this.content.appendChild(details);

        if (payload.playing) {
            const key = splitVariantKey(payload.playing.variant);
            const variant = VARIANTS[key.base];
            if (variant) {
                const gameLink = document.createElement('a');
                gameLink.className = 'umw-game-link';
                gameLink.href = payload.playing.url;

                const boardHost = document.createElement('div');
                boardHost.className = `umw-game-board ${variant.boardFamily} ${variant.pieceFamily} ${variant.ui.boardMark}`;

                const boardWrap = document.createElement('div');
                boardWrap.className = `cg-wrap ${variant.board.cg} mini`;
                boardHost.appendChild(boardWrap);

                gameLink.appendChild(boardHost);

                const players = document.createElement('div');
                players.className = 'umw-game-players';
                players.textContent = `${payload.playing.wTitle ? `${payload.playing.wTitle} ` : ''}${displayUsername(payload.playing.w)} vs ${payload.playing.bTitle ? `${payload.playing.bTitle} ` : ''}${displayUsername(payload.playing.b)}`;
                gameLink.appendChild(players);

                this.content.appendChild(gameLink);

                boardSettings.assetURL = this.assetURL;
                boardSettings.updateScopedBoardStyle(variant, boardWrap);
                boardSettings.updateScopedPieceStyle(variant, boardWrap);

                const [lastMove, fen] = getLastMoveFen(variant.name, payload.playing.lastMove, payload.playing.fen);
                this.cg = Chessground(boardWrap, {
                    fen,
                    lastMove,
                    orientation: payload.playing.orientation,
                    dimensions: variant.board.dimensions,
                    coordinates: false,
                    viewOnly: true,
                    pocketRoles: variant.pocket?.roles,
                });
                this.liveGameId = payload.playing.gameId;
                this.liveVariantName = variant.name;
                this.liveOrientation = payload.playing.orientation;
            }
        }
    }

    private renderActions(payload: MiniPayload): HTMLElement | undefined {
        const actions = document.createElement('div');
        actions.className = 'umw-actions';

        const watchLink = this.makeActionLink(
            'icon icon-tv',
            `/@/${encodeURIComponent(payload.username)}/tv`,
            _('Watch'),
        );
        actions.appendChild(watchLink);

        if (!this.isAnon && payload.username !== this.currentUsername) {
            const challengeLink = this.makeActionLink(
                'icon icon-crossedswords',
                `/@/${encodeURIComponent(payload.username)}/challenge`,
                _('Challenge'),
            );
            actions.appendChild(challengeLink);

            const blocked = this.blockedUsers.has(payload.username);
            const blockLink = this.makeActionLink(
                'icon icon-ban',
                `/api/${encodeURIComponent(payload.username)}/block`,
                blocked ? _('Unblock') : _('Block'),
            );
            blockLink.addEventListener('click', (event) => {
                event.preventDefault();
                void this.toggleBlock(payload.username, !blocked);
            });
            actions.appendChild(blockLink);
        }

        return actions.childElementCount > 0 ? actions : undefined;
    }

    private makeActionLink(className: string, href: string, text: string): HTMLAnchorElement {
        const link = document.createElement('a');
        link.className = `umw-action-btn ${className}`;
        link.href = href;
        link.textContent = text;
        return link;
    }

    private async toggleBlock(profileId: string, block: boolean) {
        if (this.isAnon || profileId === this.currentUsername) return;

        const formData = new FormData();
        formData.append('block', `${block}`);

        try {
            const response = await fetch(`/api/${encodeURIComponent(profileId)}/block`, {
                method: 'POST',
                body: formData,
            });
            if (!response.ok) return;

            const payload = await response.json() as { error?: string };
            if (payload.error !== undefined) return;

            if (block) this.blockedUsers.add(profileId);
            else this.blockedUsers.delete(profileId);

            if (this.currentPayload && this.currentPayload.username === profileId) {
                this.renderPayload(this.currentPayload);
                if (this.anchor) this.positionForAnchor(this.anchor);
            }
        } catch (_err) {
            // non-fatal
        }
    }

    private clearLiveBoard() {
        this.cg = undefined;
        this.liveGameId = undefined;
        this.liveVariantName = undefined;
    }

    private positionForAnchor(anchor: HTMLElement) {
        const rect = anchor.getBoundingClientRect();
        const spacing = 8;

        this.root.style.visibility = 'hidden';
        this.root.style.left = '0px';
        this.root.style.top = '0px';
        this.root.classList.remove('hidden');

        const widgetRect = this.root.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        // Profile game rows can rerender and detach the hovered link before positioning.
        // In that case, keep the widget near the pointer instead of defaulting near top-left.
        if (
            !anchor.isConnected ||
            (!Number.isFinite(rect.left) ||
                !Number.isFinite(rect.top) ||
                (rect.left === 0 && rect.top === 0 && rect.width === 0 && rect.height === 0))
        ) {
            this.placeByPoint(this.lastMouseX, this.lastMouseY);
            return;
        }

        let left = rect.left + 24;
        if (left + widgetRect.width > vw - spacing) {
            left = vw - widgetRect.width - spacing;
        }
        if (left < spacing) left = spacing;

        let top = rect.bottom + spacing;
        if (top + widgetRect.height > vh - spacing) {
            top = rect.top - widgetRect.height - spacing;
        }
        if (top < spacing) top = spacing;

        this.root.style.left = `${Math.round(left)}px`;
        this.root.style.top = `${Math.round(top)}px`;
        this.root.style.visibility = 'visible';
    }
}

let miniWidget: UserMiniWidget | undefined;

export function initUserMiniWidget(assetURL: string, username: string, anon: string) {
    if (miniWidget) return;
    miniWidget = new UserMiniWidget(assetURL, username, anon === 'True' || anon === 'true');
    miniWidget.init();
}
