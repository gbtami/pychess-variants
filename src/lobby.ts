import { init } from 'snabbdom';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

const patch = init([klass, attributes, properties, listeners]);

import h from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';

import { renderUsername } from './user';
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

    constructor(el, model, handler) {
        console.log("LobbyController constructor", el, model);

        // TODO: use auto reconnecting sockette in lobby and round ctrl instead
        // ping-pong és zold/szurke potty is jó lenne
        //try {
        //    var wsUri = "ws://" + location.host + "/ws";
        //}
        //catch(err){
            var wsUri = "wss://" + location.host + "/ws";
        //}
        this.sock = new WebSocket(wsUri);

        this.model = model;
        this.evtHandler = handler

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

    createSeek (color) {
        console.log('Black');
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

        this.createSeekMsg(variant, color, fen, minutes, increment)
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
                h('h2', "Create a game"),
                h('label', { props: {for: "variant"} }, "Variant"),
                h('select#variant', { props: {name: "variant"} }, variants.map((variant) => h('option', { props: {value: variant} }, variant))),
                h('label', { props: {for: "fen"} }, "Start position"),
                h('input#fen', { props: {name: 'fen', placeholder: 'Paste the FEN text here'} }),
                h('label', { props: {for: "tc"} }, "Time Control"),
                h('select#timecontrol', { props: {name: "timecontrol"} }, [
                    h('option', { props: {value: "1", selected: true} }, "Real time"),
                    h('option', { props: {value: "2"} }, "Unlimited"),
                ]),
                h('label', { props: {for: "min"} }, "Minutes per side:"),
                h('span#minutes'),
                h('input#min', {
                    attrs: {name: "min", type: "range", min: 0, max: 180, value: 3},
                    on: { input(e) { setMinutes((e.target as HTMLInputElement).value); } }
                }),
                h('label', { props: {for: "inc"} }, "Increment in seconds:"),
                h('span#increment'),
                h('input#inc', {
                    attrs: {name: "inc", type: "range", min: 0, max: 180, value: 2},
                    on: { input(e) { setIncrement((e.target as HTMLInputElement).value); } }
                }),
                // if play with the machine
                // A.I.Level (1-8 buttons)
                h('button.icon.icon-circle', { props: {type: "button", title: "Black"}, on: {click: () => this.createSeek('b') } }),
                h('button.icon.icon-adjust', { props: {type: "button", title: "Random"}, on: {click: () => this.createSeek('r')} }),
                h('button.icon.icon-circle-o', { props: {type: "button", title: "White"}, on: {click: () => this.createSeek('w')} }),
            ]),
          ]),
        ]),
        h('button', { class: {'button': true}, on: { click: () => document.getElementById('id01')!.style.display='block' } }, "Create a game"),
        h('button', { class: {'button': true}, on: { click: () => document.getElementById('id01')!.style.display='block' } }, "Play with the machine"),
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
            h('main.main', [ h('table#seeks', {hook: { insert: (vnode) => runSeeks(vnode, model, handler) } }) ]),
            h('aside.sidebar-first', ""),
            h('aside.sidebar-second', [ h('ul#seekbuttons') ]),
        ]);
}
