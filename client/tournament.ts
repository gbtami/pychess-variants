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
    players;

    constructor(el, model) {
        console.log("TournamentController constructor", el, model);
        this.model = model;

        const onOpen = (evt) => {
            this._ws = evt.target;
            console.log('onOpen()');
            this.doSend({ type: "tournament_user_connected", username: this.model["username"], "tournamentId": this.model["tournamentId"]});
            this.doSend({ type: "get_players", "tournamentId": this.model["tournamentId"] });
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
        patch(document.getElementById('players-header') as HTMLElement, this.renderHeader());
    }

    doSend(message: JSONObject) {
        console.log("---> tournament doSend():", message);
        this.sock.send(JSON.stringify(message));
    }

    renderHeader() {
        // TODO
        return h('table#players-header', [
            h('button.lobby-button', {
                on: {
                    click: () => {
                        this.doSend({ type: "join", "tournamentId": this.model["tournamentId"] });
                    }
                }
            },
                _("Join")
            ),

    //        h('tr', [
    //            h('th', _('Sign in')),
    //            h('th', _('Join')),
    //            h('th', _('Withdraw')),
    //            h('th', _('Pause')),
    //        ])
        ]);
    }

    renderPlayers(players) {
        const rows = players.map(player => this.playerView(player));
        return rows;
    }

    private playerView(player) {
        return h('tr', { on: { click: () => this.onClickPlayer(player) } }, [
            h('td', player.title),
            h('td', player.name),
            h('td', player.rating),
            h('td.sheet', player.points.join('').padStart(30, '_')),
            h('td', player.score),
            h('td', player.perf),
        ]);
    }

    private onClickPlayer(player) {
        console.log(player.name);
    }

    private onMsgGetPlayers(msg) {
        this.players = msg.players;
        // console.log("!!!! got get_players msg:", msg);

        const oldPlayers = document.getElementById('players') as Element;
        oldPlayers.innerHTML = "";
        patch(oldPlayers, h('table#players', this.renderPlayers(msg.players)));
    }

    private onMsgNewGame(msg) {
        // console.log("LobbyController.onMsgNewGame()", this.model["gameId"])
        window.location.assign('/' + msg.gameId);
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
        h('div.players', [
            h('div#players-table', [
                h('table#players-header'),
                h('div#players-wrapper', h('table#players', { hook: { insert: vnode => runTournament(vnode, model) } })),
            ]),
        ]),
        h('aside.sidebar-second', [ h('div#tournament-games') ]),
    ];
}
