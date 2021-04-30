import Sockette from 'sockette';

import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';
import style from 'snabbdom/modules/style';

const patch = init([klass, attributes, properties, listeners, style]);

import h from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';

import { JSONObject } from './types';
import { _ } from './i18n';
import { chatMessage, chatView } from './chat';
import { sound } from './sound';


export default class TournamentController {
    model;
    sock;
    _ws;
    buttons;
    players;
    nbPlayers;
    page;

    constructor(el, model) {
        console.log("TournamentController constructor", el, model);
        this.model = model;
        this.nbPlayers = 0;
        this.page = 1;

        const onOpen = (evt) => {
            this._ws = evt.target;
            console.log('onOpen()');
            this.doSend({ type: "tournament_user_connected", username: this.model["username"], "tournamentId": this.model["tournamentId"]});
            this.doSend({ type: "get_players", "tournamentId": this.model["tournamentId"], "page": this.page });
        }

        this._ws = { "readyState": -1 };
        const opts = {
            maxAttempts: 20,
            onopen: e => onOpen(e),
            onmessage: e => this.onMessage(e),
            onreconnect: e => console.log('Reconnecting in tournament...', e),
            onmaximum: e => console.log('Stop Attempting!', e),
            onclose: e => {console.log('Closed!', e);},
            onerror: e => console.log('Error:', e),
        };

        const ws = location.host.includes('pychess') ? 'wss://' : 'ws://';
        this.sock = new Sockette(ws + location.host + "/wst", opts);

        patch(document.getElementById('lobbychat') as HTMLElement, chatView(this, "lobbychat"));
        this.buttons = patch(document.getElementById('page-controls') as HTMLElement, this.renderButtons());
    }

    doSend(message: JSONObject) {
        console.log("---> tournament doSend():", message);
        this.sock.send(JSON.stringify(message));
    }

    join() {
        this.doSend({ type: "join", "tournamentId": this.model["tournamentId"] });
    }

    goToPage(page) {
        if (page < 1) {
            this.page = 1;
        } else {
            const x = Math.floor(this.nbPlayers / 10);
            const y = this.nbPlayers % 10;
            const lastPage = x + ((y > 0) ? 1 : 0);
            this.page = (page > lastPage) ? lastPage : page;
        }
        this.doSend({ type: "get_players", "tournamentId": this.model["tournamentId"], "page": this.page });
    }

    renderButtons() {
        return h('div#page-controls.btn-controls', [
            h('div.pager', [
                h('button', { on: { click: () => this.goToPage(1) } }, [ h('i.icon.icon-fast-backward') ]),
                h('button', { on: { click: () => this.goToPage(this.page - 1) } }, [ h('i.icon.icon-step-backward') ]),
                h('span.page', `${(this.page-1)*10 + 1} - ${Math.min((this.page)*10, this.nbPlayers)} / ${this.nbPlayers}`),
                h('button', { on: { click: () => this.goToPage(this.page + 1) } }, [ h('i.icon.icon-step-forward') ]),
                h('button', { on: { click: () => this.goToPage(10000) } }, [ h('i.icon.icon-fast-forward') ]),
            ]),
            h('button#join', { on: { click: () => this.join() }, class: {"icon": true, "icon-play2": true} }, _('JOIN')), // TODO: _('SIGN IN') _('WITHDRAW') _('PAUSE')
        ]);
    }

    renderPlayers(players) {
        const rows = players.map((player,index) => this.playerView(player, (this.page - 1) * 10 + index + 1));
        return rows;
    }

    private playerView(player, index) {
        return h('tr', { on: { click: () => this.onClickPlayer(player) } }, [
            h('td.rank', index),
            h('td.player', [
                h('span.title', player.title),
                h('span.name', player.name),
                h('span', player.rating),
            ]),
            h('td.sheet', player.points.join('')),
            h('td.total', [
                h('strong.score', player.score),
                h('span.perf', player.perf)
            ]),
        ]);
    }

    private onClickPlayer(player) {
        console.log(player.name);
    }

    private onMsgGetPlayers(msg) {
        this.players = msg.players;
        this.page = msg.page;
        this.nbPlayers = msg.nbPlayers;
        console.log("!!!! got get_players msg:", msg);
        this.buttons = patch(this.buttons, this.renderButtons());

        const oldPlayers = document.getElementById('players') as Element;
        oldPlayers.innerHTML = "";
        patch(oldPlayers, h('table#players', [h('tbody', this.renderPlayers(msg.players))]));
    }

    private onMsgNewGame(msg) {
        window.location.assign('/' + msg.gameId);
    }

    private onMsgGameUpdate() {
        this.doSend({ type: "get_players", "tournamentId": this.model["tournamentId"], "page": this.page });
    }

    private onMsgUserConnected(msg) {
        this.model.username = msg.username;
    }

    private onMsgChat(msg) {
        chatMessage(msg.user, msg.message, "lobbychat");
        if (msg.user.length !== 0 && msg.user !== '_server')
            sound.socialNotify();
    }
    private onMsgFullChat(msg) {
        // To prevent multiplication of messages we have to remove old messages div first
        patch(document.getElementById('messages') as HTMLElement, h('div#messages-clear'));
        // then create a new one
        patch(document.getElementById('messages-clear') as HTMLElement, h('div#messages'));
        // console.log("NEW FULL MESSAGES");
        msg.lines.forEach(line => chatMessage(line.user, line.message, "lobbychat"));
    }

    private onMsgPing(msg) {
        this.doSend({ type: "pong", timestamp: msg.timestamp });
    }
    private onMsgError(msg) {
        alert(msg.message);
    }

    onMessage(evt) {
        // console.log("<+++ tournament onMessage():", evt.data);
        const msg = JSON.parse(evt.data);
        switch (msg.type) {
            case "get_players":
                this.onMsgGetPlayers(msg);
                break;
            case "new_game":
                this.onMsgNewGame(msg);
                break;
            case "game_update":
                this.onMsgGameUpdate();
                break;
            case "tournament_user_connected":
                this.onMsgUserConnected(msg);
                break;
            case "lobbychat":
                this.onMsgChat(msg);
                break;
            case "fullchat":
                this.onMsgFullChat(msg);
                break;
            case "ping":
                this.onMsgPing(msg);
                break;
            case "error":
                this.onMsgError(msg);
                break;
        }
    }

}

function runTournament(vnode: VNode, model) {
    const el = vnode.elm as HTMLElement;
    new TournamentController(el, model);
}

export function tournamentView(model): VNode[] {

    return [
        h('aside.sidebar-first', [ h('div#lobbychat') ]),
        h('div.players.box', [
            h('div#players-table', [
                h('div#page-controls'),
                h('div#players-wrapper', h('table#players', { hook: { insert: vnode => runTournament(vnode, model) } })),
            ]),
        ]),
        h('aside.sidebar-second', [ h('div#tournament-games') ]),
    ];
}
