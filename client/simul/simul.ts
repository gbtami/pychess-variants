import { h, VNode } from 'snabbdom';
import { Chessground } from 'chessgroundx';
import { Api } from "chessgroundx/api";
import { VARIANTS } from '../variants';

import { PyChessModel } from '../types';
import { _ } from '../i18n';
import { patch } from '../document';
import { chatView, ChatController } from '../chat';
import { newWebsocket } from "@/socket/webSocketUtils";

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
    result?: string; // Game result when finished (e.g., "1-0", "0-1", "1/2-1/2", or undefined when ongoing)
}

interface MsgSimulUserConnected {
    type: string;
    simulId: string;
    players: SimulPlayer[];
    pendingPlayers: SimulPlayer[];
    createdBy: string;
}

export class SimulController implements ChatController {
    sock;
    anon: boolean;
    simulId: string;
    players: SimulPlayer[] = [];
    pendingPlayers: SimulPlayer[] = [];
    createdBy: string;
    model: PyChessModel;
    games: SimulGame[] = [];
    activeGameId: string | null = null;
    chessgrounds: { [gameId: string]: Api } = {};

    constructor(el: HTMLElement, model: PyChessModel) {
        console.log("SimulController constructor", el, model);
        this.anon = model["anon"] !== undefined && model["anon"] !== "";
        this.simulId = model["simulId"] || "";
        this.model = model;
        this.players = model["players"] || [];
        this.pendingPlayers = model["pendingPlayers"] || [];
        this.createdBy = model["createdBy"] || "";

        const onOpen = () => {
            this.doSend({ type: "simul_user_connected", username: model["username"], simulId: this.simulId });
        }

        this.sock = newWebsocket('wss');
        this.sock.onopen = () => onOpen();
        this.sock.onmessage = (e: MessageEvent) => this.onMessage(e);

        this.redraw();
        patch(document.getElementById('lobbychat') as HTMLElement, chatView(this, "lobbychat"));
    }

    doSend(message: object) {
        this.sock.send(JSON.stringify(message));
    }

    onMessage(evt: MessageEvent) {
        console.log("<+++ simul onMessage():", evt.data);
        if (evt.data === '/n') return;
        const msg = JSON.parse(evt.data);
        switch (msg.type) {
            case "simul_user_connected":
                this.onMsgSimulUserConnected(msg);
                break;
            case "new_game":
                this.onMsgNewGame(msg);
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
        }
    }

    onMsgSimulUserConnected(msg: MsgSimulUserConnected) {
        this.players = msg.players;
        this.pendingPlayers = msg.pendingPlayers;
        this.createdBy = msg.createdBy;
        this.redraw();
    }

    onMsgNewGame(msg: SimulGame) {
        this.games.push(msg);
        if (this.activeGameId === null) {
            this.activeGameId = msg.gameId;
        }
        this.redraw();
    }

    onMsgPlayerJoined(msg: { player: SimulPlayer }) {
        this.pendingPlayers.push(msg.player);
        this.redraw();
    }

    onMsgPlayerApproved(msg: { username: string }) {
        const player = this.pendingPlayers.find(p => p.name === msg.username);
        if (player) {
            this.pendingPlayers = this.pendingPlayers.filter(p => p.name !== msg.username);
            this.players.push(player);
            this.redraw();
        }
    }

    onMsgPlayerDenied(msg: { username: string }) {
        this.pendingPlayers = this.pendingPlayers.filter(p => p.name !== msg.username);
        this.players = this.players.filter(p => p.name !== msg.username);
        this.redraw();
    }

    setActiveGame(gameId: string) {
        this.activeGameId = gameId;
        this.redraw();
    }

    redraw() {
        patch(document.getElementById('simul-view') as HTMLElement, this.render());
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

    render() {
        const isHost = this.model.username === this.createdBy;
        const isSimulStarted = this.games.length > 0;
        const isSimulFinished = isSimulStarted && this.games.every(game => game.result); // Assuming game has a result field when finished

        const simulStatus = isSimulFinished ? 'Finished' : isSimulStarted ? 'Playing now' : 'Waiting for players';

        // Create header with simul info
        const simulHeader = h('div.simul-header', [
            h('h1.simul-title', [
                h('span', `${this.model["name"] || 'Simul'} `),
                h('span.simul-status', { class: { 'status-finished': isSimulFinished, 'status-started': isSimulStarted, 'status-waiting': !isSimulStarted } }, `(${simulStatus})`)
            ]),
            h('div.simul-info', [
                h('div.variant-info', `${this.model["variant"] || 'Standard'} • ${this.formatTimeControl()}`),
                h('div.created-by', `By ${this.createdBy}`)
            ])
        ]);

        const startButton = isHost && !isSimulStarted
            ? h('button.button', { on: { click: () => this.startSimul() } }, 'Start Simul')
            : h('div');

        const joinButton = (!isHost && !isSimulStarted && !this.players.find(p => p.name === this.model.username) && !this.pendingPlayers.find(p => p.name === this.model.username))
            ? h('button.button', { on: { click: () => this.joinSimul() } }, 'Join Simul')
            : h('div');

        // Main content area - different depending on if it's host vs player and if simul is started
        const mainContent = isSimulStarted 
            ? h('div.simul-ongoing', [
                isHost 
                    ? h('div.simul-host-view', [
                        h('div.simul-boards-container', [
                            this.renderMiniBoards(),
                            this.renderBoardControls()
                        ])
                    ])
                    : h('div.simul-player-view', [
                        // Player sees their own game board here when simul is ongoing
                        h('div', 'Your game board would appear here when simul starts')
                    ])
            ])
            : h('div.simul-waiting', [
                // Waiting for approval / game start view
                h('div.simul-players-section', [
                    h('h2', 'Participants'),
                    h('div.players-grid', [
                        h('div.pending-players', [
                            h('h3', `Pending Players (${this.pendingPlayers.length})`),
                            this.pendingPlayers.length > 0 
                                ? h('ul', this.pendingPlayers.map(p => h('li', [
                                    h('span.player-info', [
                                        p.title ? h('span.title', p.title) : null,
                                        h('span.name', p.name),
                                        h('span.rating', `(${p.rating})`)
                                    ]),
                                    isHost ? h('div.player-actions', [
                                        h('button.button.btn-approve', { on: { click: () => this.approve(p.name) } }, '✓'),
                                        h('button.button.btn-deny', { on: { click: () => this.deny(p.name) } }, 'X')
                                    ]) : null
                                ]))) 
                                : h('p.empty', 'No pending players')
                        ]),
                        h('div.approved-players', [
                            h('h3', `Approved Players (${this.players.length})`),
                            this.players.length > 0 
                                ? h('ul', this.players.map(p => h('li', [
                                    h('span.player-info', [
                                        p.title ? h('span.title', p.title) : null,
                                        h('span.name', p.name),
                                        h('span.rating', `(${p.rating})`)
                                    ]),
                                    (isHost && p.name !== this.model.username) ? h('div.player-actions', [
                                        h('button.button.btn-deny', { on: { click: () => this.deny(p.name) } }, 'Remove')
                                    ]) : null
                                ]))) 
                                : h('p.empty', 'No approved players yet')
                        ])
                    ])
                ])
            ]);

        return h('div#simul-view', [
            simulHeader,
            h('div.simul-content', [
                // Side panel (similar to tournament structure)
                h('div', { style: { 'grid-area': 'side' } }, [
                    // Would contain simul info, player list, etc.
                    h('div.box.pad', [
                        h('h2', 'About this Simul'),
                        h('p', `A simul exhibition where ${this.createdBy} plays against multiple opponents simultaneously.`),
                        h('p', `Time control: ${this.formatTimeControl()}`),
                        h('p', `Variant: ${this.model["variant"] || 'Standard'}`)
                    ])
                ]),
                
                // Main content area
                h('div.simul-main', [
                    startButton,
                    joinButton,
                    mainContent,
                ]),
                
                // Table panel (for game list/standings)
                h('div', { style: { 'grid-area': 'table' } }, [
                    h('div.box.pad', [
                        h('h2', 'Games'),
                        h('div.game-list', [
                            this.games.length > 0 
                                ? h('ul', this.games.map(game => h('li', `${game.wplayer} vs ${game.bplayer}`)))
                                : h('p', 'No games yet')
                        ])
                    ])
                ]),
                
                // Under chat panel
                h('div', { style: { 'grid-area': 'uchat' } }, [
                    h('div#lobbychat.chat-container')
                ]),
                
                // Players panel
                h('div', { style: { 'grid-area': 'players' } }, [
                    h('div.box.pad', [
                        h('h2', 'Players'),
                        h('p', `Total: ${this.players.length + this.pendingPlayers.length}`)
                    ])
                ])
            ])
        ]);
    }

    formatTimeControl(): string {
        const base = this.model["base"] || 0;
        const inc = this.model["inc"] || 0;
        if (base === 0 && inc === 0) return "Untimed";
        
        const baseMinutes = base > 0 ? `${base}m` : '';
        const incSeconds = inc > 0 ? `+${inc}s` : '';
        return `${baseMinutes}${incSeconds}`;
    }

    renderBoardControls() {
        return h('div.simul-board-controls', [
            h('div.navigation', [
                h('button.button.nav-btn', { 
                    on: { click: () => this.navigateToGame('prev') },
                    attrs: { title: 'Previous game' }
                }, '‹'),
                h('span.game-info', this.getActiveGameInfo()),
                h('button.button.nav-btn', { 
                    on: { click: () => this.navigateToGame('next') },
                    attrs: { title: 'Next game' }
                }, '›'),
                h('button.button.nav-btn.auto-skip', { 
                    on: { click: () => this.toggleAutoSkip() }
                }, 'Auto-skip')
            ])
        ]);
    }

    getActiveGameInfo(): string {
        if (!this.activeGameId) return 'No active game';
        const game = this.games.find(g => g.gameId === this.activeGameId);
        if (!game) return 'Unknown game';
        return `${game.wplayer} vs ${game.bplayer}`;
    }

    navigateToGame(direction: 'next' | 'prev') {
        if (this.games.length === 0) return;
        
        const currentIndex = this.games.findIndex(g => g.gameId === this.activeGameId);
        let targetIndex: number;

        if (direction === 'next') {
            targetIndex = (currentIndex + 1) % this.games.length;
        } else {
            targetIndex = (currentIndex - 1 + this.games.length) % this.games.length;
        }

        if (targetIndex >= 0 && targetIndex < this.games.length) {
            this.setActiveGame(this.games[targetIndex].gameId);
        }
    }

    toggleAutoSkip() {
        // Implement auto-skip functionality
        console.log("Auto-skip toggled");
    }

    renderMiniBoards() {
        if (this.games.length === 0) {
            return h('div.no-games', 'No games created yet');
        }
        
        return h('div.mini-boards', this.games.map(game => {
            const variant = VARIANTS[game.variant];
            const isActive = game.gameId === this.activeGameId;
            const isFinished = !!game.result;
            
            return h(`div.mini-board`, {
                on: { click: () => this.setActiveGame(game.gameId) },
                class: { 
                    active: isActive,
                    finished: isFinished
                }
            }, [
                h(`div.cg-wrap.${variant.board.cg}`, {
                    hook: {
                        insert: vnode => {
                            const cg = Chessground(vnode.elm as HTMLElement,  {
                                fen: game.fen,
                                viewOnly: true,
                                coordinates: false,
                            });
                            this.chessgrounds[game.gameId] = cg;
                        },
                        destroy: vnode => {
                            // Clean up chessground instance when element is removed
                            // Find the game associated with this chessground
                            const cgElement = vnode.elm as HTMLElement;
                            if (cgElement) {
                                // Find which game this chessground belongs to by checking the class
                                const game = this.games.find(g => 
                                    cgElement.classList.contains(VARIANTS[g.variant].board.cg)
                                );
                                if (game && this.chessgrounds[game.gameId]) {
                                    this.chessgrounds[game.gameId].destroy();
                                    delete this.chessgrounds[game.gameId];
                                }
                            }
                        }
                    }
                }),
                h('div.game-info', [
                    h('div.players', `${game.wplayer} vs ${game.bplayer}`),
                    isFinished && h('div.result', game.result),
                    !isFinished && h('div.status', 'Ongoing')
                ])
            ]);
        }));
    }
}

export function simulView(model: PyChessModel): VNode[] {
    return [
        h('div#simul-view', { hook: { insert: vnode => new SimulController(vnode.elm as HTMLElement, model) } }, [
            // initial content, will be replaced by redraw
        ])
    ];
}
