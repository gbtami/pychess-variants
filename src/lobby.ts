import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

const patch = init([klass, attributes, properties, listeners]);

import h from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';

import { renderUsername } from './user';
import { chatMessage, chatView } from './chat';
import { variants } from './chess';

export const ACCEPT = Symbol("Accept");
export const ADD = Symbol('Add');
export const DELETE = Symbol('Delete');
export const UPDATE = Symbol('Update');
export const RESET = Symbol('Reset');


class LobbyController {
    model;
    sock;
    evtHandler;
    player;
    logged_in;
    challengeAI;

    constructor(el, model, handler) {
        console.log("LobbyController constructor", el, model);
        // TODO: use auto reconnecting sockette in lobby and round ctrl
        try {
            this.sock = new WebSocket("ws://" + location.host + "/ws");
        }
        catch(err) {
            this.sock = new WebSocket("wss://" + location.host + "/ws");
        }

        this.model = model;
        this.evtHandler = handler;
        this.challengeAI = false;

        const onOpen = (evt) => {
            console.log("---CONNECTED", evt);
            this.doSend({ type: "lobby_user_connected" });
            this.doSend({ type: "get_seeks" });
        }

        this.sock.onopen = (evt) => { onOpen(evt) };
        this.sock.onclose = (evt) => {
            console.log("---DISCONNECTED", evt.code, evt.reason);
            this.doSend({ type: "close" });
        };
        this.sock.onerror = (evt) => { console.log("---ERROR:", evt.data) };
        this.sock.onmessage = (evt) => { this.onMessage(evt) };

        // get seeks when we are coming back after a game
        if (this.sock.readyState === 1) {
            this.doSend({ type: "get_seeks" });
        };
        patch(document.getElementById('seekbuttons') as HTMLElement, h('ul#seekbuttons', this.renderSeekButtons()));
        patch(document.getElementById('lobbychat') as HTMLElement, chatView(this, "lobbychat"));
    }


    doSend (message) {
        console.log("---> lobby doSend():", message);
        this.sock.send(JSON.stringify(message));
    }

    createSeekMsg (variant, color, fen, minutes, increment) {
        this.doSend({
            type: "create_seek",
            user: this.model["username"],
            variant: variant,
            fen: fen,
            minutes: minutes,
            increment: increment,
            color: color });
    }

    createBotChallengeMsg (variant, color, fen, minutes, increment, level) {
        this.doSend({
            type: "create_ai_challenge",
            user: this.model["username"],
            variant: variant,
            fen: fen,
            minutes: minutes,
            increment: increment,
            level: level,
            color: color });
    }

    createSeek (color) {
        document.getElementById('id01')!.style.display='none';
        let e;
        e = document.getElementById('variant') as HTMLSelectElement;
        const variant = e.options[e.selectedIndex].value;

        e = document.getElementById('fen') as HTMLInputElement;
        const fen = e.value;

        e = document.getElementById('min') as HTMLInputElement;
        const minutes = parseInt(e.value);

        e = document.getElementById('inc') as HTMLInputElement;
        const increment = parseInt(e.value);

        if (this.challengeAI) {
            const form = document.getElementById('ailevel') as HTMLFormElement;
            const level = parseInt(form.elements['level'].value);
            this.createBotChallengeMsg(variant, color, fen, minutes, increment, level)
        } else {
            this.createSeekMsg(variant, color, fen, minutes, increment)
        }
    }

    renderSeekButtons () {
        // TODO: save/restore selected values
        const setMinutes = (minutes) => {
            var el = document.getElementById("minutes") as HTMLElement;
            if (el) el.innerHTML = minutes;
        }

        const setIncrement = (increment) => {
            var el = document.getElementById("increment") as HTMLElement;
            if (el) el.innerHTML = increment;
        }

        return [
        h('div#id01', { class: {"modal": true} }, [
          h('form.modal-content', [
            h('div#closecontainer', [
              h('span.close', { on: { click: () => document.getElementById('id01')!.style.display='none' }, attrs: {'data-icon': 'j'}, props: {title: "Cancel"} }),
            ]),
            h('div.container', [
                // h('h2', "Create a game"),
                h('label', { attrs: {for: "variant"} }, "Variant"),
                h('select#variant', { props: {name: "variant"} }, variants.map((variant) => h('option', { props: {value: variant} }, variant))),
                h('label', { attrs: {for: "fen"} }, "Start position"),
                h('input#fen', { props: {name: 'fen', placeholder: 'Paste the FEN text here'} }),
                //h('label', { attrs: {for: "tc"} }, "Time Control"),
                //h('select#timecontrol', { props: {name: "timecontrol"} }, [
                //    h('option', { props: {value: "1", selected: true} }, "Real time"),
                //    h('option', { props: {value: "2"} }, "Unlimited"),
                //]),
                h('label', { attrs: {for: "min"} }, "Minutes per side:"),
                h('span#minutes'),
                h('input#min', {
                    props: {name: "min", type: "range", min: 0, max: 180, value: 3},
                    on: { input: (e) => setMinutes((e.target as HTMLInputElement).value) },
                    hook: {insert: (vnode) => setMinutes((vnode.elm as HTMLInputElement).value) },
                }),
                h('label', { attrs: {for: "inc"} }, "Increment in seconds:"),
                h('span#increment'),
                h('input#inc', {
                    props: {name: "inc", type: "range", min: 0, max: 180, value: 2},
                    on: { input: (e) => setIncrement((e.target as HTMLInputElement).value) },
                    hook: {insert: (vnode) => setIncrement((vnode.elm as HTMLInputElement).value) },
                }),
                // if play with the machine
                // A.I.Level (1-8 buttons)
                h('form#ailevel', [
                h('h4', "A.I. Level"),
                h('div.radio-group', [
                    h('input#ai1', { props: { type: "radio", name: "level", value: "1", checked: "checked"} }),
                    h('label.level-ai.ai1', { attrs: {for: "ai1"} }, "1"),
                    h('input#ai2', { props: { type: "radio", name: "level", value: "2"} }),
                    h('label.level-ai.ai2', { attrs: {for: "ai2"} }, "2"),
                    h('input#ai3', { props: { type: "radio", name: "level", value: "3"} }),
                    h('label.level-ai.ai3', { attrs: {for: "ai3"} }, "3"),
                    h('input#ai4', { props: { type: "radio", name: "level", value: "4"} }),
                    h('label.level-ai.ai4', { attrs: {for: "ai4"} }, "4"),
                    h('input#ai5', { props: { type: "radio", name: "level", value: "5"} }),
                    h('label.level-ai.ai5', { attrs: {for: "ai5"} }, "5"),
                    h('input#ai6', { props: { type: "radio", name: "level", value: "6"} }),
                    h('label.level-ai.ai6', { attrs: {for: "ai6"} }, "6"),
                    h('input#ai7', { props: { type: "radio", name: "level", value: "7"} }),
                    h('label.level-ai.ai7', { attrs: {for: "ai7"} }, "7"),
                    h('input#ai8', { props: { type: "radio", name: "level", value: "8"} }),
                    h('label.level-ai.ai8', { attrs: {for: "ai8"} }, "8"),
                ]),
                ]),
                h('div.button-group', [
                    h('button.icon.icon-circle', { props: {type: "button", title: "Black"}, on: {click: () => this.createSeek('b') } }),
                    h('button.icon.icon-adjust', { props: {type: "button", title: "Random"}, on: {click: () => this.createSeek('r')} }),
                    h('button.icon.icon-circle-o', { props: {type: "button", title: "White"}, on: {click: () => this.createSeek('w')} }),
                ]),
            ]),
          ]),
        ]),
        h('button', { class: {'lobby-button': true}, on: {
            click: () => {
                this.challengeAI = false;
                document.getElementById('ailevel')!.style.display='none';
                document.getElementById('id01')!.style.display='block';
                }
            } }, "Create a game"),
        h('button', { class: {'lobby-button': true}, on: {
            click: () => {
                this.challengeAI = true;
                document.getElementById('ailevel')!.style.display='inline-block';
                document.getElementById('id01')!.style.display='block';
                }
            } }, "Play with the machine"),
        ];
    }

    onClickSeek(seek) {
        if (seek["user"] === this.model["username"]) {
            this.doSend({ type: "delete_seek", seekID: seek["seekID"], player: this.model["username"] });
        } else {
            this.doSend({ type: "accept_seek", seekID: seek["seekID"], player: this.model["username"] });
        }
    }

    renderSeeks(seeks) {
        // TODO: fix header and data row colomns
        // https://stackoverflow.com/questions/37272331/html-table-with-fixed-header-and-footer-and-scrollable-body-without-fixed-widths
        const header = h('thead', [h('tr', [h('th', 'Player'), h('th', 'Color'), h('th', 'Rating'), h('th', 'Time'), h('th', 'Variant'), h('th', 'Mode')])]);
        var rows = seeks.map((seek) => h(
            'tr',
            { on: { click: () => this.onClickSeek(seek) } },
            [h('td', seek["user"]), h('td', seek["color"]), h('td', '1500?'), h('td', seek["tc"]), h('td', seek["variant"]), h('td', seek["rated"]) ])
            );
        return [header, h('tbody', rows)];
    }

    private onMsgGetSeeks = (msg) => {
        // console.log("!!!! got get_seeks msg:", msg);
        const oldVNode = document.getElementById('seeks');
        if (oldVNode instanceof Element) {
            oldVNode.innerHTML = '';
            patch(oldVNode as HTMLElement, h('table#seeks', this.renderSeeks(msg.seeks)));
        }
    }

    private onMsgCreateSeek = (msg) => {
        // console.log("!! got create_seek msg:", msg);
        const oldVNode = document.getElementById('seeks');
        if (oldVNode instanceof Element) {
            oldVNode.innerHTML = '';
            patch(oldVNode as HTMLElement, h('table#seeks', this.renderSeeks(msg.seeks)));
        }
    }

    private onMsgAcceptSeek = (msg) => {
        this.model["gameId"] = msg["gameId"];
        this.model["variant"] = msg["variant"];
        this.model["wplayer"] = msg["wplayer"];
        this.model["bplayer"] = msg["bplayer"];
        this.model["fen"] = msg["fen"];
        this.model["base"] = msg["base"];
        this.model["inc"] = msg["inc"];
        // console.log("LobbyController.onMsgAcceptSeek()", this.model["gameId"])
        this.evtHandler({ type: ACCEPT });
}

    private onMsgUserConnected = (msg) => {
        this.model["username"] = msg["username"];
        renderUsername(this.model["home"], this.model["username"]);
    }

    private onMsgChat = (msg) => {
        chatMessage(msg.user, msg.message, "lobbychat");
    }

    onMessage (evt) {
        console.log("<+++ lobby onMessage():", evt.data);
        var msg = JSON.parse(evt.data);
        switch (msg.type) {
            case "get_seeks":
                this.onMsgGetSeeks(msg);
                break;
            case "create_seek":
                this.onMsgCreateSeek(msg);
                break;
            case "accept_seek":
                this.onMsgAcceptSeek(msg);
                break;
            case "lobby_user_connected":
                this.onMsgUserConnected(msg);
                break;
            case "lobbychat":
                this.onMsgChat(msg);
                break;
        }
    }
}

function runSeeks(vnode: VNode, model, handler) {
    const el = vnode.elm as HTMLElement;
    const ctrl = new LobbyController(el, model, handler);
    console.log("lobbyView() -> runSeeks()", el, model, ctrl);
}

export function lobbyView(model, handler): VNode {
    // console.log(".......lobbyView(model, handler)", model, handler);
    // Get the modal
    const modal = document.getElementById('id01')!;

    // When the user clicks anywhere outside of the modal, close it
    window.onclick = function(event) {
        if (event.target == modal) {
            modal.style.display = "none";
        }
    }

    return h('div.columns', [
            h('aside.sidebar-first', [ h('div.lobbychat#lobbychat') ]),
            h('main.main', [ h('table#seeks', {hook: { insert: (vnode) => runSeeks(vnode, model, handler) } }) ]),
            h('aside.sidebar-second', [ h('ul#seekbuttons') ]),
            h('under-stuff', "Spectators"),
        ]);
}
