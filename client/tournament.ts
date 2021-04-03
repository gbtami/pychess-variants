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
import { chatMessage, chatView } from './chat';
import { sound } from './sound';


export default class TournamentController {
    model;
    sock;
    _ws;

    constructor(el, model) {
        console.log("LobbyController constructor", el, model);
        this.model = model;

        const onOpen = (evt) => {
            this._ws = evt.target;
            console.log('onOpen()');
            this.doSend({ type: "tournament_user_connected", username: this.model["username"]});
        }

        this._ws = { "readyState": -1 };
        const opts = {
            maxAttempts: 20,
            onopen: e => onOpen(e),
            onmessage: e => this.onMessage(e),
            onreconnect: e => console.log('Reconnecting in lobby...', e),
            onmaximum: e => console.log('Stop Attempting!', e),
            onclose: e => {console.log('Closed!', e);},
            onerror: e => console.log('Error:', e),
        };

        const ws = location.host.includes('pychess') ? 'wss://' : 'ws://';
        this.sock = new Sockette(ws + location.host + "/tsl", opts);

        patch(document.getElementById('lobbychat') as HTMLElement, chatView(this, "lobbychat"));
    }

    doSend(message: JSONObject) {
        // console.log("---> lobby doSend():", message);
        this.sock.send(JSON.stringify(message));
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
        // console.log("<+++ lobby onMessage():", evt.data);
        const msg = JSON.parse(evt.data);
        switch (msg.type) {
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
        h('div.standing', [
            h('div#standing-table', [
                h('table#standing-header'),
                h('div#standing-wrapper', h('table#players', { hook: { insert: vnode => runTournament(vnode, model) } })),
            ]),
        ]),
        h('aside.sidebar-second', [ h('div#tournament-games') ]),
    ];
}
