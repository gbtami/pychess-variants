import { h, VNode } from 'snabbdom';
import { Chessground } from 'chessgroundx';
import { Api } from "chessgroundx/api";

import { VARIANTS } from '../variants';
import { getLastMoveFen } from '../variants';
import { PyChessModel } from '../types';
import { patch } from '../document';
import { boardSettings } from '../boardSettings';
import { chatMessage, chatView, ChatController } from '../chat';
import { newWebsocket } from "@/socket/webSocketUtils";
import { displayUsername, userLink } from "../user";
import { sizeMiniBoardHost } from '../miniBoard';
import { timeControlStr } from '../view';
import { localeOptions } from '../tournamentClock';

const T_CREATED = 0;
const T_STARTED = 1;
const T_FINISHED = 3;

interface SimulPlayer {
    name: string;
    rating: number;
    title: string;
}

interface SimulGame {
    gameId: string;
    wplayer: string;
    bplayer: string;
    variant: string;
    fen: string;
    lastMove?: string;
    rated: boolean;
    base: number;
    inc: number;
    byo: number;
    status: number;
    result: string;
}

interface MsgSimulUserConnected {
    type: "simul_user_connected";
    simulId: string;
    players: SimulPlayer[];
    pendingPlayers: SimulPlayer[];
    createdBy: string;
    name?: string;
    description?: string;
    variant?: string;
    chess960?: boolean;
    base?: number;
    inc?: number;
    status?: number;
    hostColor?: string;
    hostExtraTime?: number;
    hostExtraTimePerPlayer?: number;
    entryMinRating?: number;
    entryMaxRating?: number;
    entryMinRatedGames?: number;
    entryMinAccountAgeDays?: number;
    createdAt?: string;
    startsAt?: string | null;
    endsAt?: string | null;
    games?: SimulGame[];
}

interface MsgNewGame extends SimulGame {
    type: "new_game";
}

interface MsgGameUpdate {
    type: "game_update";
    gameId: string;
    fen: string;
    lastMove: string;
    status: number;
    result: string;
}

interface MsgPlayerJoined {
    type: "player_joined";
    player: SimulPlayer;
}

interface MsgPlayerApproved {
    type: "player_approved";
    player: SimulPlayer;
}

interface MsgPlayerDenied {
    type: "player_denied";
    username: string;
}

interface MsgPlayerDisconnected {
    type: "player_disconnected";
    username: string;
    group: "pending" | "approved";
}

interface MsgError {
    type: "error";
    message: string;
}

interface MsgChat {
    type: "lobbychat";
    user: string;
    message: string;
    time?: number;
}

interface MsgFullChat {
    type: "fullchat";
    lines: MsgChat[];
}

type SimulInboundMessage =
    | MsgSimulUserConnected
    | MsgNewGame
    | MsgGameUpdate
    | MsgPlayerJoined
    | MsgPlayerApproved
    | MsgPlayerDenied
    | MsgPlayerDisconnected
    | MsgChat
    | MsgFullChat
    | MsgError
    | { type: "simul_started" }
    | { type: "simul_finished" };

export class SimulController implements ChatController {
    sock;
    vnode: VNode | HTMLElement;
    anon: boolean;
    simulId: string;
    players: SimulPlayer[] = [];
    pendingPlayers: SimulPlayer[] = [];
    createdBy: string;
    model: PyChessModel;
    games: SimulGame[] = [];
    chessgrounds: { [gameId: string]: Api } = {};
    hasRedirectedToGame = false;
    hostRedirectTimeout: number | null = null;
    hostStartGames: SimulGame[] = [];
    simulStatus: number;
    simulName: string;
    variantKey: string;
    base: number;
    inc: number;
    hostColor: string;
    hostExtraTime: number;
    hostExtraTimePerPlayer: number;
    description: string;
    entryMinRating: number;
    entryMaxRating: number;
    entryMinRatedGames: number;
    entryMinAccountAgeDays: number;
    createdAt: string;
    startsAt: string;
    endsAt: string;
    lastError: string;

    constructor(model: PyChessModel) {
        this.anon = model["anon"] === "True";
        this.simulId = model["simulId"] || "";
        this.model = model;
        this.createdBy = "";
        this.simulStatus = Number.isFinite(model.status) ? model.status : T_CREATED;
        this.simulName = model["name"] || "Simul";
        this.variantKey = model["variant"] || "chess";
        this.base = Number.isFinite(model.base) ? model.base : 0;
        this.inc = Number.isFinite(model.inc) ? model.inc : 0;
        this.hostColor = "random";
        this.hostExtraTime = 0;
        this.hostExtraTimePerPlayer = 0;
        this.description = "";
        this.entryMinRating = 0;
        this.entryMaxRating = 0;
        this.entryMinRatedGames = 0;
        this.entryMinAccountAgeDays = 0;
        this.createdAt = "";
        this.startsAt = "";
        this.endsAt = "";
        this.lastError = "";
        boardSettings.assetURL = model.assetURL;

        this.sock = newWebsocket('wss');
        this.sock.onopen = () => {
            this.doSend({ type: "simul_user_connected", username: model["username"], simulId: this.simulId });
        };
        this.sock.onmessage = (e: MessageEvent) => this.onMessage(e);

        this.vnode = document.getElementById('simul-view') as HTMLElement;
        this.redraw();
    }

    doSend(message: object) {
        this.sock.send(JSON.stringify(message));
    }

    onMessage(evt: MessageEvent) {
        if (evt.data === '/n') return;
        const msg = JSON.parse(evt.data) as SimulInboundMessage;
        switch (msg.type) {
            case "simul_user_connected":
                this.onMsgSimulUserConnected(msg);
                break;
            case "new_game":
                this.onMsgNewGame(msg);
                break;
            case "game_update":
                this.onMsgGameUpdate(msg);
                break;
            case "player_joined":
                this.onMsgPlayerJoined(msg);
                break;
            case "player_approved":
                this.onMsgPlayerApproved(msg);
                break;
            case "player_denied":
                this.onMsgPlayerDenied(msg);
                break;
            case "player_disconnected":
                this.onMsgPlayerDisconnected(msg);
                break;
            case "lobbychat":
                this.onMsgChat(msg);
                break;
            case "fullchat":
                this.onMsgFullChat(msg);
                break;
            case "simul_started":
                this.simulStatus = T_STARTED;
                this.redraw();
                break;
            case "simul_finished":
                this.simulStatus = T_FINISHED;
                this.redraw();
                break;
            case "error":
                this.lastError = msg.message;
                this.redraw();
                console.warn("Simul error:", msg.message);
                break;
        }
    }

    onMsgSimulUserConnected(msg: MsgSimulUserConnected) {
        this.players = msg.players ?? [];
        this.pendingPlayers = msg.pendingPlayers ?? [];
        this.createdBy = msg.createdBy;
        if (msg.name) this.simulName = msg.name;
        if (typeof msg.description === "string") this.description = msg.description;
        if (msg.variant) {
            this.variantKey = msg.variant + (msg.chess960 ? "960" : "");
        }
        if (typeof msg.base === "number") this.base = msg.base;
        if (typeof msg.inc === "number") this.inc = msg.inc;
        if (typeof msg.status === "number") this.simulStatus = msg.status;
        if (typeof msg.hostColor === "string") this.hostColor = msg.hostColor;
        if (typeof msg.hostExtraTime === "number") this.hostExtraTime = msg.hostExtraTime;
        if (typeof msg.hostExtraTimePerPlayer === "number") this.hostExtraTimePerPlayer = msg.hostExtraTimePerPlayer;
        if (typeof msg.entryMinRating === "number") this.entryMinRating = msg.entryMinRating;
        if (typeof msg.entryMaxRating === "number") this.entryMaxRating = msg.entryMaxRating;
        if (typeof msg.entryMinRatedGames === "number") this.entryMinRatedGames = msg.entryMinRatedGames;
        if (typeof msg.entryMinAccountAgeDays === "number") this.entryMinAccountAgeDays = msg.entryMinAccountAgeDays;
        if (typeof msg.createdAt === "string") this.createdAt = msg.createdAt;
        if (typeof msg.startsAt === "string") this.startsAt = msg.startsAt;
        if (typeof msg.endsAt === "string") this.endsAt = msg.endsAt;
        this.games = msg.games ?? [];
        this.redraw();
    }

    onMsgNewGame(msg: MsgNewGame) {
        const alreadyExists = this.games.some(game => game.gameId === msg.gameId);
        if (!alreadyExists) {
            this.games.push(msg);
        }
        this.simulStatus = T_STARTED;

        const isHost = this.model.username === this.createdBy;
        const isMyGame = msg.wplayer === this.model.username || msg.bplayer === this.model.username;
        if (isMyGame && !isHost) {
            this.redirectToGame(msg.gameId);
            return;
        }
        if (isMyGame && isHost) {
            if (!this.hostStartGames.some(game => game.gameId === msg.gameId)) {
                this.hostStartGames.push(msg);
            }
            this.scheduleHostGameRedirect();
        }
        this.redraw();
    }

    onMsgGameUpdate(msg: MsgGameUpdate) {
        const game = this.games.find(g => g.gameId === msg.gameId);
        if (game) {
            game.fen = msg.fen;
            game.lastMove = msg.lastMove;
            game.status = msg.status;
            game.result = msg.result;
            const cg = this.chessgrounds[msg.gameId];
            if (cg) {
                const variant = VARIANTS[game.variant] || VARIANTS[this.variantKey] || VARIANTS["chess"];
                const [lastMove, fen] = getLastMoveFen(variant.name, msg.lastMove, msg.fen);
                cg.set({ fen, lastMove });
            }
        }
        this.redraw();
    }

    onMsgPlayerJoined(msg: MsgPlayerJoined) {
        if (!this.pendingPlayers.some(player => player.name === msg.player.name)) {
            this.pendingPlayers.push(msg.player);
            this.redraw();
        }
    }

    onMsgPlayerApproved(msg: MsgPlayerApproved) {
        this.pendingPlayers = this.pendingPlayers.filter(player => player.name !== msg.player.name);
        if (!this.players.some(player => player.name === msg.player.name)) {
            this.players.push(msg.player);
        }
        this.redraw();
    }

    onMsgPlayerDenied(msg: MsgPlayerDenied) {
        this.pendingPlayers = this.pendingPlayers.filter(player => player.name !== msg.username);
        this.players = this.players.filter(player => player.name !== msg.username);
        this.redraw();
    }

    onMsgPlayerDisconnected(msg: MsgPlayerDisconnected) {
        this.pendingPlayers = this.pendingPlayers.filter(player => player.name !== msg.username);
        this.players = this.players.filter(player => player.name !== msg.username);
        this.redraw();
    }

    onMsgChat(msg: MsgChat) {
        chatMessage(msg.user, msg.message, "lobbychat", msg.time);
    }

    onMsgFullChat(msg: MsgFullChat) {
        const messages = document.getElementById('messages');
        if (messages) {
            patch(messages, h('div#messages-clear'));
            const cleared = document.getElementById('messages-clear');
            if (cleared) patch(cleared, h('div#messages'));
        }
        msg.lines.forEach(line => this.onMsgChat(line));
    }

    approve(username: string) {
        this.doSend({ type: "approve_player", simulId: this.simulId, username: username });
    }

    deny(username: string) {
        this.doSend({ type: "deny_player", simulId: this.simulId, username: username });
    }

    startSimul() {
        this.doSend({ type: "start_simul", simulId: this.simulId });
    }

    joinSimul() {
        this.lastError = "";
        this.doSend({ type: "join", simulId: this.simulId });
        this.redraw();
    }

    redraw() {
        this.vnode = patch(this.vnode, this.render());
    }

    isGameFinished(game: SimulGame): boolean {
        return game.status >= 0;
    }

    isHostWhite(game: SimulGame): boolean {
        return game.wplayer === this.createdBy;
    }

    getHostScore(game: SimulGame): '1' | '0' | '½' | '' {
        if (!this.isGameFinished(game)) return '';
        if (game.result === '1/2-1/2') return '½';
        if (game.result === '1-0') return this.isHostWhite(game) ? '1' : '0';
        if (game.result === '0-1') return this.isHostWhite(game) ? '0' : '1';
        return '';
    }

    getOpponentScore(game: SimulGame): '1' | '0' | '½' | '' {
        const hostScore = this.getHostScore(game);
        if (hostScore === '1') return '0';
        if (hostScore === '0') return '1';
        if (hostScore === '½') return '½';
        return '';
    }

    hostWon(game: SimulGame): boolean {
        return this.getHostScore(game) === '1';
    }

    hostLost(game: SimulGame): boolean {
        return this.getHostScore(game) === '0';
    }

    hostDrew(game: SimulGame): boolean {
        return this.getHostScore(game) === '½';
    }

    renderResultsSummary(): VNode {
        const playing = this.games.filter(game => !this.isGameFinished(game)).length;
        const wins = this.games.filter(game => this.hostWon(game)).length;
        const draws = this.games.filter(game => this.hostDrew(game)).length;
        const losses = this.games.filter(game => this.hostLost(game)).length;

        const stat = (value: number, label: string) => h('div', [
            h('div.number', String(value)),
            h('div.text', label),
        ]);

        return h('div.results', [
            stat(playing, 'Playing'),
            stat(wins, 'Wins'),
            stat(draws, 'Draws'),
            stat(losses, 'Losses'),
        ]);
    }

    redirectToGame(gameId: string) {
        if (this.hasRedirectedToGame) return;
        this.hasRedirectedToGame = true;
        window.location.assign('/' + gameId);
    }

    scheduleHostGameRedirect() {
        if (this.hasRedirectedToGame || this.hostStartGames.length === 0) return;
        if (this.hostRedirectTimeout !== null) {
            window.clearTimeout(this.hostRedirectTimeout);
        }
        this.hostRedirectTimeout = window.setTimeout(() => {
            this.hostRedirectTimeout = null;
            if (this.hasRedirectedToGame || this.hostStartGames.length === 0) return;
            const preferredAsWhite = this.hostStartGames.filter(
                game => game.wplayer === this.model.username
            );
            const candidates = preferredAsWhite.length > 0 ? preferredAsWhite : this.hostStartGames;
            const target = candidates[Math.floor(Math.random() * candidates.length)];
            this.redirectToGame(target.gameId);
        }, 150);
    }

    formatTimeControl(): string {
        if (this.base === 0 && this.inc === 0) return "Untimed";
        return timeControlStr(this.base, this.inc, 0);
    }

    formatHostColor(): string {
        if (this.hostColor === "white") return "White";
        if (this.hostColor === "black") return "Black";
        return "Random";
    }

    formatHostExtraTime(seconds: number): string {
        const sign = seconds > 0 ? '+' : '';
        const abs = Math.abs(seconds);
        if (abs % 60 === 0) {
            const minutes = abs / 60;
            return `${sign}${seconds < 0 ? '-' : ''}${minutes} minute${minutes === 1 ? '' : 's'}`;
        }
        return `${sign}${seconds} seconds`;
    }

    getHostAndOpponent(game: SimulGame): { host: string; opponent: string } {
        if (game.wplayer === this.createdBy) {
            return { host: game.wplayer, opponent: game.bplayer };
        }
        if (game.bplayer === this.createdBy) {
            return { host: game.bplayer, opponent: game.wplayer };
        }
        return { host: game.wplayer, opponent: game.bplayer };
    }

    getVariantInfo() {
        return VARIANTS[this.variantKey] || VARIANTS["chess"];
    }

    renderEntryConditions(): VNode[] {
        const lines: VNode[] = [];
        if (this.entryMinRatedGames > 0) {
            lines.push(h('p.simul__meta__line', `Entry: ${this.entryMinRatedGames}+ rated games in this variant`));
        }
        if (this.entryMinRating > 0) {
            lines.push(h('p.simul__meta__line', `Entry: minimum rating ${this.entryMinRating}`));
        }
        if (this.entryMaxRating > 0) {
            lines.push(h('p.simul__meta__line', `Entry: maximum rating ${this.entryMaxRating}`));
        }
        if (this.entryMinAccountAgeDays > 0) {
            lines.push(h('p.simul__meta__line', `Entry: account age ${this.entryMinAccountAgeDays}+ days`));
        }
        return lines;
    }

    renderCreatedActionButtons(
        isHost: boolean,
        alreadyJoined: boolean,
        pendingParticipants: SimulPlayer[],
        approvedParticipants: SimulPlayer[],
    ): VNode[] {
        const buttons: VNode[] = [];

        if (isHost) {
            if (approvedParticipants.length > 0) {
                buttons.push(
                    h(
                        'button.button.button-green.text.simul__cta',
                        { on: { click: () => this.startSimul() } },
                        `Start (${approvedParticipants.length})`
                    )
                );
            }
            if (pendingParticipants.length > 0) {
                buttons.push(
                    h(
                        'button.button.text.simul__cta',
                        {
                            on: {
                                click: () => {
                                    const randomCandidate = pendingParticipants[Math.floor(Math.random() * pendingParticipants.length)];
                                    this.approve(randomCandidate.name);
                                },
                            },
                        },
                        'Accept random candidate'
                    )
                );
            }
        } else if (!alreadyJoined) {
            buttons.push(
                h(
                    'button.button.text.simul__cta',
                    { on: { click: () => this.joinSimul() } },
                    'Join'
                )
            );
        }

        return buttons;
    }

    renderApplicantRow(player: SimulPlayer, isHost: boolean, isPending: boolean): VNode {
        const variantInfo = this.getVariantInfo();
        return h(
            'tr',
            {
                key: player.name,
                class: {
                    me: this.model.username === player.name,
                },
            },
            [
                h('td', [
                    userLink(
                        player.name,
                        [
                            ...(player.title ? [h('player-title', `${player.title} `)] : []),
                            displayUsername(player.name),
                            h('em', ` ${player.rating}`),
                        ],
                        { className: 'user-link ulpt' }
                    ),
                ]),
                h('td.variant', { attrs: { 'data-icon': variantInfo.icon(this.variantKey.endsWith("960")) } }),
                h(
                    'td.action',
                    isHost
                        ? isPending
                            ? [
                                h(
                                    'button.button.simul__table-action',
                                    { attrs: { title: 'Accept' }, on: { click: () => this.approve(player.name) } },
                                    'Accept'
                                ),
                                h(
                                    'button.button.button-red.simul__table-action',
                                    { attrs: { title: 'Reject' }, on: { click: () => this.deny(player.name) } },
                                    'Reject'
                                ),
                            ]
                            : h(
                                'button.button.button-red.simul__table-action',
                                { attrs: { title: 'Remove' }, on: { click: () => this.deny(player.name) } },
                                'Remove'
                            )
                        : null
                ),
            ]
        );
    }

    renderCreated() {
        const isHost = this.model.username === this.createdBy;
        const hostName = this.createdBy ? displayUsername(this.createdBy) : '-';
        const hostLinkNode = () =>
            this.createdBy
                ? userLink(this.createdBy, hostName, { className: 'user-link' })
                : h('span', hostName);
        const approvedParticipants = this.players.filter(player => player.name !== this.createdBy);
        const pendingParticipants = this.pendingPlayers.filter(player => player.name !== this.createdBy);
        const alreadyJoined =
            this.players.some(player => player.name === this.model.username) ||
            this.pendingPlayers.some(player => player.name === this.model.username);
        const buttons = this.renderCreatedActionButtons(
            isHost,
            alreadyJoined,
            pendingParticipants,
            approvedParticipants,
        );

        const instruction = approvedParticipants.some(player => player.name === this.model.username)
            ? 'You have been selected! Hold still, the simul is about to begin.'
            : isHost && this.players.length + this.pendingPlayers.length < 6
                ? 'Share this page URL to let people enter the simul!'
                : !isHost && alreadyJoined
                    ? 'Your registration is recorded. Wait for the host to accept you.'
                    : null;

        return h('div.simul__main.box', [
            h('div.box__top', [
                h('h1', [
                    this.simulName,
                    h('span.author', [' hosted by ', hostLinkNode()]),
                ]),
                h('div.box__top__actions', buttons),
            ]),
            instruction ? h('p.instructions', instruction) : null,
            h('div.halves', [
                h('div.half.candidates', [
                    h('table.slist.slist-pad', [
                        h('thead', [
                            h('tr', [
                                h('th', { attrs: { colspan: 3 } }, [
                                    h('strong', `${pendingParticipants.length}`),
                                    ' candidate players',
                                ]),
                            ]),
                        ]),
                        h(
                            'tbody',
                            pendingParticipants.length > 0
                                ? pendingParticipants.map(player => this.renderApplicantRow(player, isHost, true))
                                : [
                                    h('tr.empty', [
                                        h('td', { attrs: { colspan: 3 } }, 'No pending players'),
                                    ]),
                                ]
                        ),
                    ]),
                ]),
                h('div.half.accepted', [
                    h('table.slist.slist-pad.user_list', [
                        h('thead', [
                            h('tr', [
                                h('th', { attrs: { colspan: 3 } }, [
                                    h('strong', `${approvedParticipants.length}`),
                                    ' accepted players',
                                ]),
                            ]),
                            isHost && pendingParticipants.length > 0 && approvedParticipants.length === 0
                                ? h('tr.help', [
                                    h('th', { attrs: { colspan: 3 } }, 'Now you get to accept some players, then start the simul'),
                                ])
                                : null,
                        ]),
                        h(
                            'tbody',
                            approvedParticipants.length > 0
                                ? approvedParticipants.map(player => this.renderApplicantRow(player, isHost, false))
                                : [
                                    h('tr.empty', [
                                        h('td', { attrs: { colspan: 3 } }, 'No approved players yet'),
                                    ]),
                                ]
                        ),
                    ]),
                ]),
            ]),
        ]);
    }

    renderStartedOrFinished(
        isSimulStarted: boolean,
        isSimulFinished: boolean,
        simulStatusText: string,
    ) {
        return h('div.simul__main.box', [
            h('div.box__top', [
                h('h1', this.simulName),
                h('div.box__top__actions', [
                    h(
                        'div.simul-status',
                        {
                            class: {
                                'status-finished': isSimulFinished,
                                'status-started': isSimulStarted,
                            },
                        },
                        simulStatusText
                    ),
                ]),
            ]),
            this.renderResultsSummary(),
            !isSimulFinished ? h('h2.simul__section-title', 'Games in progress') : null,
            this.renderMiniBoards(),
        ]);
    }

    renderSide(simulStatusText: string): VNode {
        const variantInfo = this.getVariantInfo();
        const variantName = variantInfo.displayName(this.variantKey.endsWith("960"));
        const hostName = this.createdBy ? displayUsername(this.createdBy) : '-';
        const canEdit = this.model["username"] === this.createdBy;
        const hostLinkNode = () =>
            this.createdBy
                ? userLink(this.createdBy, hostName, { className: 'user-link' })
                : h('span', hostName);
        const approvedCount = Math.max(0, this.players.length - (this.createdBy ? 1 : 0));
        const pendingCount = this.pendingPlayers.length;
        const showPendingCount = this.simulStatus < T_STARTED;
        const isFinished = this.simulStatus === T_FINISHED;
        const eventDate = this.getEventDate();

        return h('aside.simul__side', [
            h('div.box.simul__meta', [
                h('div.header', [
                    h('i', { attrs: { 'data-icon': variantInfo.icon(this.variantKey.endsWith("960")) } }),
                    h('div', [
                        h('span.clock', this.formatTimeControl()),
                        h('p.simul__meta__headline', [
                            h('span', `${variantName} • Casual`),
                            canEdit ? h('a.icon-cog.simul__meta__edit', {
                                attrs: {
                                    href: `/simul/${this.simulId}/edit`,
                                    title: 'Edit simul',
                                },
                            }) : null,
                        ]),
                    ]),
                ]),
                h('section.game-infos', [
                    h('p.simul__meta__line', `Host color: ${this.formatHostColor()}`),
                    ...(this.hostExtraTime !== 0 ? [h('p.simul__meta__line', `Host extra time: ${this.formatHostExtraTime(this.hostExtraTime)}`)] : []),
                    ...(this.hostExtraTimePerPlayer > 0 ? [h('p.simul__meta__line', `Host extra time per player: +${this.hostExtraTimePerPlayer} seconds`)] : []),
                    ...(showPendingCount ? [h('p.simul__meta__line', `${approvedCount} accepted players`)] : []),
                    ...(showPendingCount ? [h('p.simul__meta__line', `${pendingCount} pending players`)] : []),
                ]),
                this.description
                    ? h('section', [
                        h('p.simul__meta__line.simul__meta__description', this.description),
                    ])
                    : null,
                this.renderEntryConditions().length > 0
                    ? h('section', [
                        ...this.renderEntryConditions(),
                    ])
                    : null,
                h('section', [
                    h('p.simul__meta__line', ['Hosted by ', hostLinkNode()]),
                    ...(eventDate ? [h('p.simul__meta__line.simul__meta__date', this.formatEventDate(eventDate))] : []),
                    ...(!isFinished ? [h('p.simul__meta__line.simul__meta__statusline', simulStatusText)] : []),
                    ...(this.lastError ? [h('p.simul__meta__line.simul__meta__error', this.lastError)] : []),
                ]),
            ]),
            chatView(this, "lobbychat"),
        ]);
    }

    getEventDate(): string {
        if (this.startsAt) return this.startsAt;
        if (this.endsAt) return this.endsAt;
        return this.createdAt;
    }

    formatEventDate(dateLike: string): string {
        const date = new Date(dateLike);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleString("default", localeOptions);
    }

    renderMiniBoards() {
        if (this.games.length === 0) {
            return h('div.no-games', 'No games created yet');
        }

        const sortedGames = [...this.games].sort((left, right) => {
            const leftFinished = this.isGameFinished(left);
            const rightFinished = this.isGameFinished(right);
            if (leftFinished !== rightFinished) return leftFinished ? 1 : -1;

            const outcomeRank = (game: SimulGame) => {
                if (!this.isGameFinished(game)) return 0;
                if (this.hostWon(game)) return 1;
                if (this.hostDrew(game)) return 2;
                if (this.hostLost(game)) return 3;
                return 4;
            };

            return outcomeRank(left) - outcomeRank(right);
        });

        return h('div.simul__games', { class: { finished: this.simulStatus === T_FINISHED } }, sortedGames.map(game => {
            const variant = VARIANTS[game.variant] || VARIANTS[this.variantKey] || VARIANTS["chess"];
            const isFinished = this.isGameFinished(game);
            const pairing = this.getHostAndOpponent(game);
            const hostScore = this.getHostScore(game);
            const opponentScore = this.getOpponentScore(game);
            const [lastMove, fen] = getLastMoveFen(variant.name, game.lastMove ?? '', game.fen);
            return h('a', {
                key: game.gameId,
                attrs: { href: `/${game.gameId}` },
            }, [
                h('div.mini-game__player', [
                    h('span.mini-game__user.host', displayUsername(pairing.host)),
                    h('span.mini-game__result', hostScore),
                ]),
                h(`div.mini-game.${variant.boardFamily}.${variant.pieceFamily}.${variant.ui.boardMark}`, {
                    class: { finished: isFinished },
                    hook: {
                        insert: vnode => {
                            const boardWrap = (vnode.elm as HTMLElement).firstElementChild as HTMLElement;
                            sizeMiniBoardHost(boardWrap);
                            boardSettings.updateScopedBoardStyle(variant, boardWrap);
                            boardSettings.updateScopedPieceStyle(variant, boardWrap);
                            const cg = Chessground(boardWrap, {
                                fen,
                                lastMove,
                                dimensions: variant.board.dimensions,
                                viewOnly: true,
                                coordinates: false,
                                pocketRoles: variant.pocket?.roles,
                            });
                            this.chessgrounds[game.gameId] = cg;
                        },
                        update: () => {
                            const cg = this.chessgrounds[game.gameId];
                            if (cg) cg.set({ fen, lastMove });
                        },
                        destroy: () => {
                            const cg = this.chessgrounds[game.gameId];
                            if (cg) {
                                cg.destroy();
                                delete this.chessgrounds[game.gameId];
                            }
                        },
                    },
                }, [
                    h(`div.cg-wrap.${variant.board.cg}.mini`),
                ]),
                h('div.mini-game__player', [
                    h('span.mini-game__user.opp', displayUsername(pairing.opponent)),
                    h('span.mini-game__result', opponentScore),
                ]),
            ]);
        }));
    }

    render() {
        const isSimulStarted = this.simulStatus >= T_STARTED;
        const isSimulFinished = this.simulStatus === T_FINISHED;
        const simulStatusText = isSimulFinished
            ? 'Finished'
            : isSimulStarted
                ? 'Playing now'
                : 'Waiting for players';

        return h('div.simul__app', { class: { 'simul-created': !isSimulStarted } }, [
            this.renderSide(simulStatusText),
            isSimulStarted
                ? this.renderStartedOrFinished(isSimulStarted, isSimulFinished, simulStatusText)
                : this.renderCreated(),
        ]);
    }
}

export function simulView(model: PyChessModel): VNode[] {
    return [
        h('div#simul-view', { hook: { insert: () => new SimulController(model) } }),
    ];
}
