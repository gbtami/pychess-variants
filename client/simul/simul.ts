import { h, VNode } from 'snabbdom';
import { Chessground } from 'chessgroundx';
import { Api } from "chessgroundx/api";

import { VARIANTS } from '../variants';
import { PyChessModel } from '../types';
import { patch } from '../document';
import { boardSettings } from '../boardSettings';
import { chatView, ChatController } from '../chat';
import { newWebsocket } from "@/socket/webSocketUtils";
import { displayUsername } from "../user";

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
    variant?: string;
    chess960?: boolean;
    base?: number;
    inc?: number;
    status?: number;
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

type SimulInboundMessage =
    | MsgSimulUserConnected
    | MsgNewGame
    | MsgGameUpdate
    | MsgPlayerJoined
    | MsgPlayerApproved
    | MsgPlayerDenied
    | MsgPlayerDisconnected
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
    activeGameId: string | null = null;
    chessgrounds: { [gameId: string]: Api } = {};
    hasRedirectedToGame = false;
    hostRedirectTimeout: number | null = null;
    hostStartGames: SimulGame[] = [];
    simulStatus: number;
    simulName: string;
    variantKey: string;
    base: number;
    inc: number;

    constructor(model: PyChessModel) {
        this.anon = model["anon"] !== undefined && model["anon"] !== "";
        this.simulId = model["simulId"] || "";
        this.model = model;
        this.createdBy = "";
        this.simulStatus = Number.isFinite(model.status) ? model.status : T_CREATED;
        this.simulName = model["name"] || "Simul";
        this.variantKey = model["variant"] || "chess";
        this.base = Number.isFinite(model.base) ? model.base : 0;
        this.inc = Number.isFinite(model.inc) ? model.inc : 0;
        boardSettings.assetURL = model.assetURL;

        this.sock = newWebsocket('wss');
        this.sock.onopen = () => {
            this.doSend({ type: "simul_user_connected", username: model["username"], simulId: this.simulId });
        };
        this.sock.onmessage = (e: MessageEvent) => this.onMessage(e);

        this.vnode = document.getElementById('simul-view') as HTMLElement;
        this.redraw();
        patch(document.getElementById('lobbychat') as HTMLElement, chatView(this, "lobbychat"));
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
            case "simul_started":
                this.simulStatus = T_STARTED;
                this.redraw();
                break;
            case "simul_finished":
                this.simulStatus = T_FINISHED;
                this.redraw();
                break;
            case "error":
                console.warn("Simul error:", msg.message);
                break;
        }
    }

    onMsgSimulUserConnected(msg: MsgSimulUserConnected) {
        this.players = msg.players ?? [];
        this.pendingPlayers = msg.pendingPlayers ?? [];
        this.createdBy = msg.createdBy;
        if (msg.name) this.simulName = msg.name;
        if (msg.variant) {
            this.variantKey = msg.variant + (msg.chess960 ? "960" : "");
        }
        if (typeof msg.base === "number") this.base = msg.base;
        if (typeof msg.inc === "number") this.inc = msg.inc;
        if (typeof msg.status === "number") this.simulStatus = msg.status;
        this.games = msg.games ?? [];
        if (this.activeGameId === null && this.games.length > 0) {
            this.activeGameId = this.games[0].gameId;
        }
        this.redraw();
    }

    onMsgNewGame(msg: MsgNewGame) {
        const alreadyExists = this.games.some(game => game.gameId === msg.gameId);
        if (!alreadyExists) {
            this.games.push(msg);
        }
        this.simulStatus = T_STARTED;
        if (this.activeGameId === null) {
            this.activeGameId = msg.gameId;
        }

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
            game.status = msg.status;
            game.result = msg.result;
            const cg = this.chessgrounds[msg.gameId];
            if (cg) cg.set({ fen: msg.fen });
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
        this.doSend({ type: "join", simulId: this.simulId });
    }

    setActiveGame(gameId: string) {
        this.activeGameId = gameId;
        this.redraw();
    }

    redraw() {
        this.vnode = patch(this.vnode, this.render());
    }

    isGameFinished(game: SimulGame): boolean {
        return game.status > 0;
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
        const baseMinutes = this.base > 0 ? `${this.base}m` : '';
        const incSeconds = this.inc > 0 ? `+${this.inc}s` : '';
        return `${baseMinutes}${incSeconds}`;
    }

    renderMiniBoards() {
        if (this.games.length === 0) {
            return h('div.no-games', 'No games created yet');
        }

        return h('div.mini-boards', this.games.map(game => {
            const variant = VARIANTS[game.variant] || VARIANTS[this.variantKey] || VARIANTS["chess"];
            const isActive = game.gameId === this.activeGameId;
            const isFinished = this.isGameFinished(game);
            return h('div.mini-board', {
                key: game.gameId,
                on: { click: () => this.setActiveGame(game.gameId) },
                class: {
                    active: isActive,
                    finished: isFinished,
                },
            }, [
                h(`div.cg-wrap.${variant.board.cg}`, {
                    hook: {
                        insert: vnode => {
                            boardSettings.updateBoardStyle(variant.boardFamily);
                            boardSettings.updatePieceStyle(variant.pieceFamily);
                            const cg = Chessground(vnode.elm as HTMLElement, {
                                fen: game.fen,
                                viewOnly: true,
                                coordinates: false,
                            });
                            this.chessgrounds[game.gameId] = cg;
                        },
                        update: () => {
                            const cg = this.chessgrounds[game.gameId];
                            if (cg) cg.set({ fen: game.fen });
                        },
                        destroy: () => {
                            const cg = this.chessgrounds[game.gameId];
                            if (cg) {
                                cg.destroy();
                                delete this.chessgrounds[game.gameId];
                            }
                        },
                    },
                }),
                h('div.game-info', [
                    h('div.players', `${displayUsername(game.wplayer)} vs ${displayUsername(game.bplayer)}`),
                    isFinished ? h('div.result', game.result) : h('div.status', 'Ongoing'),
                ]),
            ]);
        }));
    }

    render() {
        const isHost = this.model.username === this.createdBy;
        const isSimulStarted = this.simulStatus >= T_STARTED;
        const isSimulFinished = this.simulStatus === T_FINISHED;
        const simulStatusText = isSimulFinished
            ? 'Finished'
            : isSimulStarted
                ? 'Playing now'
                : 'Waiting for players';

        const variantInfo = VARIANTS[this.variantKey];
        const variantName = variantInfo
            ? variantInfo.displayName(this.variantKey.endsWith("960"))
            : this.variantKey;

        const alreadyJoined =
            this.players.some(player => player.name === this.model.username) ||
            this.pendingPlayers.some(player => player.name === this.model.username);

        const startButton = isHost && !isSimulStarted
            ? h('button.button', { on: { click: () => this.startSimul() } }, 'Start simul')
            : null;

        const joinButton = (!isHost && !isSimulStarted && !alreadyJoined)
            ? h('button.button', { on: { click: () => this.joinSimul() } }, 'Join simul')
            : null;

        const approvedParticipants = this.players.filter(player => player.name !== this.createdBy);
        const pendingParticipants = this.pendingPlayers.filter(player => player.name !== this.createdBy);

        const activeGame = this.games.find(game => game.gameId === this.activeGameId);
        const ongoingView = h('div.simul-ongoing', [
            this.renderMiniBoards(),
        ]);

        const waitingView = h('div.simul-waiting', [
            h('div.simul-players-section', [
                h('h2', 'Participants'),
                h('div.players-grid', [
                    h('div.pending-players', [
                        h('h3', `Pending players (${pendingParticipants.length})`),
                        pendingParticipants.length > 0
                            ? h('ul', pendingParticipants.map(player => h('li', [
                                h('span.player-info', [
                                    player.title ? h('span.title', player.title) : null,
                                    h('span.name', displayUsername(player.name)),
                                    h('span.rating', `(${player.rating})`),
                                ]),
                                isHost
                                    ? h('div.player-actions', [
                                        h('button.button.btn-approve', { on: { click: () => this.approve(player.name) } }, 'Approve'),
                                        h('button.button.btn-deny', { on: { click: () => this.deny(player.name) } }, 'Deny'),
                                    ])
                                    : null,
                            ])))
                            : h('p.empty', 'No pending players'),
                    ]),
                    h('div.approved-players', [
                        h('h3', `Approved players (${approvedParticipants.length})`),
                        approvedParticipants.length > 0
                            ? h('ul', approvedParticipants.map(player => h('li', [
                                h('span.player-info', [
                                    player.title ? h('span.title', player.title) : null,
                                    h('span.name', displayUsername(player.name)),
                                    h('span.rating', `(${player.rating})`),
                                ]),
                                (isHost && player.name !== this.model.username)
                                    ? h('div.player-actions', [
                                        h('button.button.btn-deny', { on: { click: () => this.deny(player.name) } }, 'Remove'),
                                    ])
                                    : null,
                            ])))
                            : h('p.empty', 'No approved players yet'),
                    ]),
                ]),
            ]),
        ]);

        const sideInfo = h('div', { style: { 'grid-area': 'side' } }, [
            h('div.box.pad', [
                h('h2', 'About this simul'),
                h('p', `Host: ${displayUsername(this.createdBy)}`),
                h('p', `Time control: ${this.formatTimeControl()}`),
                h('p', `Variant: ${variantName}`),
                activeGame ? h('p', `Active game: ${displayUsername(activeGame.wplayer)} vs ${displayUsername(activeGame.bplayer)}`) : null,
            ]),
        ]);

        const gamesTable = isSimulStarted ? h('div', { style: { 'grid-area': 'table' } }, [
            h('div.box.pad', [
                h('h2', 'Games'),
                h('div.game-list', [
                    this.games.length > 0
                        ? h('ul', this.games.map(game => h('li', [
                            h('a', { attrs: { href: `/${game.gameId}` } }, `${displayUsername(game.wplayer)} vs ${displayUsername(game.bplayer)}`),
                            this.isGameFinished(game) ? ` (${game.result})` : '',
                        ])))
                        : h('p', 'No games yet'),
                ]),
            ]),
        ]) : null;

        const playersSummary = isSimulStarted ? h('div', { style: { 'grid-area': 'players' } }, [
            h('div.box.pad', [
                h('h2', 'Players'),
                h('p', `Approved: ${approvedParticipants.length}`),
                h('p', `Pending: ${pendingParticipants.length}`),
            ]),
        ]) : null;

        return h('div#simul-view', [
            h('div.simul-header', [
                h('h1.simul-title', [
                    h('span', `${this.simulName} `),
                    h(
                        'span.simul-status',
                        {
                            class: {
                                'status-finished': isSimulFinished,
                                'status-started': isSimulStarted,
                                'status-waiting': !isSimulStarted,
                            },
                        },
                        `(${simulStatusText})`
                    ),
                ]),
                h('div.simul-info', [
                    h('div.variant-info', `${variantName} • ${this.formatTimeControl()}`),
                    h('div.created-by', `By ${displayUsername(this.createdBy)}`),
                ]),
            ]),
            h('div.simul-content', [
                sideInfo,
                h('div.simul-main', [
                    startButton,
                    joinButton,
                    isSimulStarted ? ongoingView : waitingView,
                ]),
                gamesTable,
                h('div', { style: { 'grid-area': 'uchat' } }, [
                    h('div#lobbychat.chat-container'),
                ]),
                playersSummary,
            ]),
        ]);
    }
}

export function simulView(model: PyChessModel): VNode[] {
    return [
        h('div#simul-view', { hook: { insert: () => new SimulController(model) } }),
    ];
}
