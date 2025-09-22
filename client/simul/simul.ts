import { h, VNode } from 'snabbdom';
import { Chessground } from 'chessgroundx';
import { Api } from "chessgroundx/api";
import { Variant, VARIANTS } from '../variants';

import { PyChessModel } from '../types';
import { _ } from '../i18n';
import { patch } from '../document';
import { chatMessage, chatView, ChatController } from '../chat';
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
}

interface MsgSimulUserConnected {
    type: string;
    simulId: string;
    players: SimulPlayer[];
    createdBy: string;
    // ... other fields
}

export class SimulController implements ChatController {
    sock;
    simulId: string;
    players: SimulPlayer[] = [];
    createdBy: string;
    model: PyChessModel;
    games: SimulGame[] = [];
    activeGameId: string | null = null;
    chessgrounds: { [gameId: string]: Api } = {};

    constructor(el: HTMLElement, model: PyChessModel) {
        console.log("SimulController constructor", el, model);
        this.simulId = model["simulId"];
        this.model = model;

        const onOpen = () => {
            this.doSend({ type: "simul_user_connected", username: model["username"], simulId: this.simulId });
        }

        this.sock = newWebsocket('wss'); // Use the new websocket endpoint for simuls
        this.sock.onopen = () => onOpen();
        this.sock.onmessage = (e: MessageEvent) => this.onMessage(e);

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
        }
    }

    onMsgSimulUserConnected(msg: MsgSimulUserConnected) {
        this.players = msg.players;
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

    setActiveGame(gameId: string) {
        this.activeGameId = gameId;
        this.redraw();
    }

    redraw() {
        patch(document.getElementById('simul-view') as HTMLElement, this.render());
    }

    startSimul() {
        this.doSend({ type: "start_simul", simulId: this.simulId });
    }

    render() {
        const startButton = (this.model.username === this.createdBy)
            ? h('button', { on: { click: () => this.startSimul() } }, 'Start Simul')
            : h('div');

        const activeGame = this.games.find(g => g.gameId === this.activeGameId);

        return h('div#simul-view', [
            h('h1', 'Simul Lobby'),
            h('h2', 'Participants'),
            h('div.players', this.players.map(p => h('div.player', `${p.title} ${p.name} (${p.rating})`))),
            startButton,
            h('div.active-game', activeGame ? `Active game FEN: ${activeGame.fen}` : 'No active game'),
            this.renderMiniBoards(),
            h('div#lobbychat')
        ]);
    }

    renderMiniBoards() {
        return h('div.mini-boards', this.games.map(game => {
            const variant = VARIANTS[game.variant];
            return h(`div.mini-board`, {
                on: { click: () => this.setActiveGame(game.gameId) },
                class: { active: game.gameId === this.activeGameId }
            }, [
                h(`div.cg-wrap.${variant.board.cg}.mini`, {
                    hook: {
                        insert: vnode => {
                            const cg = Chessground(vnode.elm as HTMLElement,  {
                                fen: game.fen,
                                viewOnly: true,
                                coordinates: false,
                            });
                            this.chessgrounds[game.gameId] = cg;
                        }
                    }
                }),
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
