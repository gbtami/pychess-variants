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

    redraw() {
        this.vnode = patch(this.vnode, this.render());
    }

    isGameFinished(game: SimulGame): boolean {
        return game.status >= 0;
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

    getHostAndOpponent(game: SimulGame): { host: string; opponent: string } {
        if (game.wplayer === this.createdBy) {
            return { host: game.wplayer, opponent: game.bplayer };
        }
        if (game.bplayer === this.createdBy) {
            return { host: game.bplayer, opponent: game.wplayer };
        }
        return { host: game.wplayer, opponent: game.bplayer };
    }

    renderMiniBoards() {
        if (this.games.length === 0) {
            return h('div.no-games', 'No games created yet');
        }

        return h('div.simul__games', { class: { finished: this.simulStatus === T_FINISHED } }, this.games.map(game => {
            const variant = VARIANTS[game.variant] || VARIANTS[this.variantKey] || VARIANTS["chess"];
            const isFinished = this.isGameFinished(game);
            const pairing = this.getHostAndOpponent(game);
            return h('a', {
                key: game.gameId,
                attrs: { href: `/${game.gameId}` },
            }, [
                h(`div.mini-game.${variant.boardFamily}.${variant.pieceFamily}.${variant.ui.boardMark}`, {
                    class: { finished: isFinished },
                    hook: {
                        insert: vnode => {
                            boardSettings.updateBoardStyle(variant.boardFamily);
                            boardSettings.updatePieceStyle(variant.pieceFamily);
                            const cg = Chessground((vnode.elm as HTMLElement).firstElementChild as HTMLElement, {
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
                }, [
                    h(`div.cg-wrap.${variant.board.cg}`),
                ]),
                h('div.game-header', [
                    h('span.host', displayUsername(pairing.host)),
                    h('span.vstext', 'vs'),
                    h('span.opp', displayUsername(pairing.opponent)),
                ]),
                h('div.result-wrap', [
                    h('span.result', isFinished ? game.result : ''),
                    h('span.status', isFinished ? 'Finished' : 'Ongoing'),
                ]),
            ]);
        }));
    }

    renderPlayerRow(player: SimulPlayer, canModerate: boolean, isPending: boolean): VNode {
        return h('div.simul__player', [
            h('span.simul__player__identity', [
                player.title ? h('player-title', player.title + ' ') : null,
                h('a.user-link', { attrs: { href: `/@/${player.name}` } }, displayUsername(player.name)),
            ]),
            h('span.simul__player__rating', `(${player.rating})`),
            canModerate
                ? h('span.simul__player__actions', isPending
                    ? [
                        h(
                            'button.button.btn-approve',
                            { on: { click: () => this.approve(player.name) } },
                            'Approve'
                        ),
                        h(
                            'button.button.btn-deny',
                            {
                                attrs: { title: 'Reject this join request' },
                                on: { click: () => this.deny(player.name) },
                            },
                            'Reject'
                        ),
                    ]
                    : [
                        h(
                            'button.button.btn-deny',
                            {
                                attrs: { title: 'Remove this approved player from the simul' },
                                on: { click: () => this.deny(player.name) },
                            },
                            'Remove'
                        ),
                    ])
                : null,
        ]);
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
        const hostName = this.createdBy ? displayUsername(this.createdBy) : '-';

        const alreadyJoined =
            this.players.some(player => player.name === this.model.username) ||
            this.pendingPlayers.some(player => player.name === this.model.username);

        const startButton = isHost && !isSimulStarted
            ? h('button.button.simul__actions__start', { on: { click: () => this.startSimul() } }, 'Start simul')
            : null;

        const joinButton = (!isHost && !isSimulStarted && !alreadyJoined)
            ? h('button.button.simul__actions__join', { on: { click: () => this.joinSimul() } }, 'Join simul')
            : null;

        const approvedParticipants = this.players.filter(player => player.name !== this.createdBy);
        const pendingParticipants = this.pendingPlayers.filter(player => player.name !== this.createdBy);
        const canModeratePlayers = isHost && !isSimulStarted;
        const actionButtons: VNode[] = [];

        if (startButton) actionButtons.push(startButton);
        if (joinButton) actionButtons.push(joinButton);
        if (actionButtons.length === 0 && !isHost && !isSimulStarted && alreadyJoined) {
            actionButtons.push(h('span.simul__actions__note', 'You are on the participants list.'));
        }

        const approvedRows = approvedParticipants.length > 0
            ? approvedParticipants.map(player => this.renderPlayerRow(player, canModeratePlayers, false))
            : [h('p.simul__empty', 'No approved players yet')];
        const pendingRows = pendingParticipants.length > 0
            ? pendingParticipants.map(player => this.renderPlayerRow(player, canModeratePlayers, true))
            : [h('p.simul__empty', 'No pending players')];

        return h('div.simul__app', [
            h('div.simul__app__content', [
                h('div.box.pad.simul__title', [
                    h('h1', this.simulName),
                    h(
                        'span.simul-status',
                        {
                            class: {
                                'status-finished': isSimulFinished,
                                'status-started': isSimulStarted,
                                'status-waiting': !isSimulStarted,
                            },
                        },
                        simulStatusText
                    ),
                ]),
                h('div.box.simul__meta', [
                    h('div.simul__meta__host', `Host: ${hostName}`),
                    h('div.simul__meta__text', `${variantName} • ${this.formatTimeControl()}`),
                    h('div.simul__meta__games', `${this.games.length} games`),
                    h('div.simul__meta__text.simul__meta__status', simulStatusText),
                ]),
                h('div.box.pad', [
                    h(
                        'h2.simul__section-title',
                        isSimulStarted ? (isSimulFinished ? 'Finished games' : 'Games in progress') : 'Waiting room'
                    ),
                    isSimulStarted
                        ? this.renderMiniBoards()
                        : h('p.simul__waiting-note', 'Waiting for the host to start once participants are approved.'),
                ]),
            ]),
            h('aside.simul__side', [
                h('div.box.simul__side__host', [
                    h('span.simul__side__host__text', hostName),
                ]),
                h('div.box.pad', [
                    h('h2.simul__section-title', 'Players'),
                    h('div.simul__actions', actionButtons),
                    h('div.simul__players-group', [
                        h('h3', `Approved (${approvedParticipants.length})`),
                        ...approvedRows,
                    ]),
                    h('div.simul__players-group', [
                        h('h3', `Pending (${pendingParticipants.length})`),
                        ...pendingRows,
                    ]),
                ]),
            ]),
            h('div#lobbychat.chat'),
        ]);
    }
}

export function simulView(model: PyChessModel): VNode[] {
    return [
        h('div#simul-view', { hook: { insert: () => new SimulController(model) } }),
    ];
}
