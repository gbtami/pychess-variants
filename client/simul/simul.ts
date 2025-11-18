import { h, VNode } from 'snabbdom';
import { Chessground } from 'chessgroundx';
import { Api } from "chessgroundx/api";
import { VARIANTS } from '../variants';
import { PyChessModel, SimulPlayer } from '../types';
import { _ } from '../i18n';
import { patch } from '../document';
import { chatView, ChatController } from '../chat';
import { newWebsocket } from "@/socket/webSocketUtils";

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
  pendingPlayers: SimulPlayer[];
  createdBy: string;
}

export class SimulController implements ChatController {
  sock;
  simulId: string;
  players: SimulPlayer[] = [];
  pendingPlayers: SimulPlayer[] = [];
  createdBy: string;
  model: PyChessModel;
  games: SimulGame[] = [];
  activeGameId: string | null = null;
  chessgrounds: { [gameId: string]: Api } = {};
  anon: boolean;

  constructor(el: HTMLElement, model: PyChessModel) {
    console.log("SimulController constructor", el, model);
    this.simulId = model.simulId;
    this.model = model;
    this.players = model.players || [];
    this.pendingPlayers = model.pendingPlayers || [];
    this.createdBy = model.createdBy || "";
    this.anon = model.anon === "true";

    const onOpen = () => {
      this.doSend({ type: "simul_user_connected", username: model.username, simulId: this.simulId });
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

    const startButton = isHost
      ? h('button', { on: { click: () => this.startSimul() } }, 'Start Simul')
      : h('div');

    const joinButton = (!isHost && !this.players.find(p => p.name === this.model.username) && !this.pendingPlayers.find(p => p.name === this.model.username))
      ? h('button', { on: { click: () => this.joinSimul() } }, 'Join Simul')
      : h('div');

    return h('div#simul-view', [
      h('div.simul-sidebar', [
        h('h1', 'Simul Lobby'),
        startButton,
        joinButton,
        h('div.players-grid', [
          h('div.pending-players', [
            h('h2', 'Pending Players'),
            h('ul', this.pendingPlayers.map(p => h('li', [
              `${p.title} ${p.name} (${p.rating})`,
              isHost ? h('button', { on: { click: () => this.approve(p.name) } }, '✓') : null,
              isHost ? h('button', { on: { click: () => this.deny(p.name) } }, 'X') : null,
            ]))),
          ]),
          h('div.approved-players', [
            h('h2', 'Approved Players'),
            h('ul', this.players.map(p => h('li', [
              `${p.title} ${p.name} (${p.rating})`,
              (isHost && p.name !== this.createdBy) ? h('button', { on: { click: () => this.deny(p.name) } }, 'X') : null,
            ]))),
          ]),
        ]),
      ]),
      h('div.simul-main', [
        this.renderMiniBoards(),
        h('div#lobbychat')
      ])
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
              const cg = Chessground(vnode.elm as HTMLElement, {
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