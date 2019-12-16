import Sockette from 'sockette';

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
import { variants, variants960, VARIANTS } from './chess';
import { sound } from './sound';


class LobbyController {
    model;
    sock;
    player;
    logged_in;
    challengeAI;
    _ws;
    seeks;

    constructor(el, model) {
        console.log("LobbyController constructor", el, model);

        this.model = model;
        this.challengeAI = false;

        const onOpen = (evt) => {
            this._ws = evt.target;
            console.log("---CONNECTED", evt);
            this.doSend({ type: "lobby_user_connected", username: this.model["username"]});
            this.doSend({ type: "get_seeks" });
        }

        this._ws = {"readyState": -1};
        const opts = {
            maxAttempts: 20,
            onopen: e => onOpen(e),
            onmessage: e => this.onMessage(e),
            onreconnect: e => console.log('Reconnecting in lobby...', e),
            onmaximum: e => console.log('Stop Attempting!', e),
            onclose: e => {console.log('Closed!', e);},
            onerror: e => console.log('Error:', e),
            };
        try {
            this.sock = new Sockette("ws://" + location.host + "/wsl", opts);
        }
        catch(err) {
            this.sock = new Sockette("wss://" + location.host + "/wsl", opts);
        }

        // get seeks when we are coming back after a game
        if (this._ws.readyState === 1) {
            this.doSend({ type: "get_seeks" });
        };
        patch(document.getElementById('seekbuttons') as HTMLElement, h('ul#seekbuttons', this.renderSeekButtons()));
        patch(document.getElementById('lobbychat') as HTMLElement, chatView(this, "lobbychat"));
    }


    doSend (message) {
        console.log("---> lobby doSend():", message);
        this.sock.send(JSON.stringify(message));
    }

    createSeekMsg (variant, color, fen, minutes, increment, chess960, rated) {
        this.doSend({
            type: "create_seek",
            user: this.model["username"],
            variant: variant,
            fen: fen,
            minutes: minutes,
            increment: increment,
            rated: rated,
            chess960: chess960,
            color: color });
    }

    createBotChallengeMsg (variant, color, fen, minutes, increment, level, chess960, rated) {
        this.doSend({
            type: "create_ai_challenge",
            user: this.model["username"],
            variant: variant,
            fen: fen,
            minutes: minutes,
            increment: increment,
            rated: rated,
            level: level,
            chess960: chess960,
            color: color });
    }

    isNewSeek (variant, color, fen, minutes, increment) {
        return !this.seeks.some(seek => {
            return seek.user === this.model["username"] && seek.variant === variant && seek.fen === fen && seek.color === color && seek.tc === minutes + "+" + increment;
        })
    }

    createSeek (color) {
        document.getElementById('id01')!.style.display='none';
        let e;
        e = document.getElementById('variant') as HTMLSelectElement;
        const variant = e.options[e.selectedIndex].value;
        localStorage.setItem("seek_variant", variant);

        e = document.getElementById('fen') as HTMLInputElement;
        const fen = e.value;
        localStorage.setItem("seek_fen", e.value);

        e = document.getElementById('min') as HTMLInputElement;
        const minutes = parseInt(e.value);
        localStorage.setItem("seek_min", e.value);

        e = document.getElementById('inc') as HTMLInputElement;
        const increment = parseInt(e.value);
        localStorage.setItem("seek_inc", e.value);

        e = document.querySelector('input[name="mode"]:checked') as HTMLInputElement;
        // useful for testing with AI
        const rated = parseInt(e.value);
        //TODO:
        //const rated = (this.challengeAI || this.model["anon"] === 'True') ? 0 : parseInt(e.value);
        localStorage.setItem("seek_rated", e.value);

        e = document.getElementById('chess960') as HTMLInputElement;
        const hide = variants960.indexOf(variant) === -1;
        const chess960 = (hide) ? false : e.checked;
        localStorage.setItem("seek_chess960", e.checked);

        console.log("CREATE SEEK variant, color, fen, minutes, increment, hide, chess960", variant, color, fen, minutes, increment, chess960, rated);

        if (this.challengeAI) {
            e = document.querySelector('input[name="level"]:checked') as HTMLInputElement;
            const level = parseInt(e.value);
            localStorage.setItem("seek_level", e.value);
            console.log(level, e.value, localStorage.getItem("seek_level"));
            this.createBotChallengeMsg(variant, color, fen, minutes, increment, level, chess960, rated===1);
        } else {
            if (this.isNewSeek(variant, color, fen, minutes, increment)) {
                this.createSeekMsg(variant, color, fen, minutes, increment, chess960, rated===1);
            }
        }
    }

    renderSeekButtons () {
        const setVariant = () => {
            let e;
            e = document.getElementById('variant') as HTMLSelectElement;
            const variant = e.options[e.selectedIndex].value;
            const hide = variants960.indexOf(variant) === -1;

            document.getElementById('chess960-block')!.style.display = (hide) ? 'none' : 'block';
        }

        const setMinutes = (minutes) => {
            var min, inc = 0;
            var el = document.getElementById("minutes") as HTMLElement;
            if (el) el.innerHTML = minutes;

            var e = document.getElementById('min') as HTMLInputElement;
            if (e) min = parseInt(e.value);

            e = document.getElementById('inc') as HTMLInputElement;
            if (e) inc = parseInt(e.value);

            document.getElementById('color-button-group')!.style.display = (min + inc === 0) ? 'none' : 'block';
        }

        const setIncrement = (increment) => {
            var min, inc = 0;
            var el = document.getElementById("increment") as HTMLElement;
            if (el) el.innerHTML = increment;

            var e = document.getElementById('min') as HTMLInputElement;
            if (e) min = parseInt(e.value);

            e = document.getElementById('inc') as HTMLInputElement;
            if (e) inc = parseInt(e.value);

            document.getElementById('color-button-group')!.style.display = (min + inc === 0) ? 'none' : 'block';
        }

        const vIdx = localStorage.seek_variant === undefined ? 0 : variants.indexOf(localStorage.seek_variant);
        const vFen = localStorage.seek_fen === undefined ? "" : localStorage.seek_fen;
        const vMin = localStorage.seek_min === undefined ? "5" : localStorage.seek_min;
        const vInc = localStorage.seek_inc === undefined ? "3" : localStorage.seek_inc;
        const vRated = localStorage.seek_rated === undefined ? "0" : localStorage.seek_rated;
        const vLevel = localStorage.seek_level === undefined ? "1" : localStorage.seek_level;
        const vChess960 = localStorage.seek_chess960 === undefined ? "false" : localStorage.seek_chess960;
        console.log("localeStorage.seek_level, vLevel=", localStorage.seek_level, vLevel);

        return [
        h('div#id01', { class: {"modal": true} }, [
          h('form.modal-content', [
            h('div#closecontainer', [
              h('span.close', { on: { click: () => document.getElementById('id01')!.style.display='none' }, attrs: {'data-icon': 'j'}, props: {title: "Cancel"} }),
            ]),
            h('div.container', [
                h('label', { attrs: {for: "variant"} }, "Variant"),
                h('select#variant', {
                    props: {name: "variant"},
                    on: { input: () => setVariant() },
                    hook: {insert: () => setVariant() },
                    }, variants.map((variant, idx) => h('option', { props: {value: variant, selected: (idx === vIdx) ? "selected" : ""} }, variant))),
                h('label', { attrs: {for: "fen"} }, "Start position"),
                h('input#fen', { props: {name: 'fen', placeholder: 'Paste the FEN text here', value: vFen} }),
                h('div#chess960-block', [
                    h('label', { attrs: {for: "chess960"} }, "Chess960"),
                    h('input#chess960', {props: {name: "chess960", type: "checkbox", checked: vChess960 === "true" ? "checked" : ""}}),
                ]),
                //h('label', { attrs: {for: "tc"} }, "Time Control"),
                //h('select#timecontrol', { props: {name: "timecontrol"} }, [
                //    h('option', { props: {value: "1", selected: true} }, "Real time"),
                //    h('option', { props: {value: "2"} }, "Unlimited"),
                //]),
                h('label', { attrs: {for: "min"} }, "Minutes per side:"),
                h('span#minutes'),
                h('input#min', { class: { "slider": true },
                    props: {name: "min", type: "range", min: 1, max: 60, value: vMin},
                    on: { input: (e) => setMinutes((e.target as HTMLInputElement).value) },
                    hook: {insert: (vnode) => setMinutes((vnode.elm as HTMLInputElement).value) },
                }),
                h('label', { attrs: {for: "inc"} }, "Increment in seconds:"),
                h('span#increment'),
                h('input#inc', { class: {"slider": true },
                    props: {name: "inc", type: "range", min: 0, max: 15, value: vInc},
                    on: { input: (e) => setIncrement((e.target as HTMLInputElement).value) },
                    hook: {insert: (vnode) => setIncrement((vnode.elm as HTMLInputElement).value) },
                }),
                h('form#game-mode', [
                h('div.radio-group', [
                    h('input#casual', {props: {type: "radio", name: "mode", value: "0", checked: vRated === "0" ? "checked" : ""}}),
                    h('label', { attrs: {for: "casual"} }, "Casual"),
                    h('input#rated', {props: {type: "radio", name: "mode", value: "1", checked: vRated === "1" ? "checked" : ""}}),
                    h('label', { attrs: {for: "rated"} }, "Rated"),
                ]),
                ]),
                // if play with the machine
                // A.I.Level (1-8 buttons)
                h('form#ailevel', [
                h('h4', "A.I. Level"),
                h('div.radio-group', [
                    h('input#ai1', { props: { type: "radio", name: "level", value: "1", checked: vLevel === "1" ? "checked" : ""} }),
                    h('label.level-ai.ai1', { attrs: {for: "ai1"} }, "1"),
                    h('input#ai2', { props: { type: "radio", name: "level", value: "2", checked: vLevel === "2" ? "checked" : ""} }),
                    h('label.level-ai.ai2', { attrs: {for: "ai2"} }, "2"),
                    h('input#ai3', { props: { type: "radio", name: "level", value: "3", checked: vLevel === "3" ? "checked" : ""} }),
                    h('label.level-ai.ai3', { attrs: {for: "ai3"} }, "3"),
                    h('input#ai4', { props: { type: "radio", name: "level", value: "4", checked: vLevel === "4" ? "checked" : ""} }),
                    h('label.level-ai.ai4', { attrs: {for: "ai4"} }, "4"),
                    h('input#ai5', { props: { type: "radio", name: "level", value: "5", checked: vLevel === "5" ? "checked" : ""} }),
                    h('label.level-ai.ai5', { attrs: {for: "ai5"} }, "5"),
                    h('input#ai6', { props: { type: "radio", name: "level", value: "6", checked: vLevel === "6" ? "checked" : ""} }),
                    h('label.level-ai.ai6', { attrs: {for: "ai6"} }, "6"),
                    h('input#ai7', { props: { type: "radio", name: "level", value: "7", checked: vLevel === "7" ? "checked" : ""} }),
                    h('label.level-ai.ai7', { attrs: {for: "ai7"} }, "7"),
                    h('input#ai8', { props: { type: "radio", name: "level", value: "8", checked: vLevel === "8" ? "checked" : ""} }),
                    h('label.level-ai.ai8', { attrs: {for: "ai8"} }, "8"),
                ]),
                ]),
                h('div#color-button-group', [
                    h('button.icon.icon-black', { props: {type: "button", title: "Black"}, on: {click: () => this.createSeek('b') } }),
                    h('button.icon.icon-adjust', { props: {type: "button", title: "Random"}, on: {click: () => this.createSeek('r')} }),
                    h('button.icon.icon-white', { props: {type: "button", title: "White"}, on: {click: () => this.createSeek('w')} }),
                ]),
            ]),
          ]),
        ]),
        h('button', { class: {'lobby-button': true}, on: {
            click: () => {
                this.challengeAI = false;
                if (this.model["anon"] !== 'True') {
                    document.getElementById('game-mode')!.style.display='inline-flex';
                } else {
                    document.getElementById('game-mode')!.style.display='none';
                }
                document.getElementById('ailevel')!.style.display='none';
                document.getElementById('id01')!.style.display='block';
                }
            } }, "Create a game"),
        h('button', { class: {'lobby-button': true}, on: {
            click: () => {
                this.challengeAI = true;
                //document.getElementById('game-mode')!.style.display='none';
                //TODO
                if (this.model["anon"] !== 'True') {
                    document.getElementById('game-mode')!.style.display='inline-flex';
                } else {
                    document.getElementById('game-mode')!.style.display='none';
                }
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
        const header = h('thead', [h('tr',
            [h('th', 'Player'),
             h('th', 'Color'),
             h('th', 'Rating'),
             h('th', 'Time'),
             h('th', '    '),
             h('th', 'Variant'),
             h('th', 'Mode')])]);
        const colorIcon = (color) => { return h('i', {attrs: {"data-icon": color === "w" ? "c" : color === "b" ? "b" : "a"}} ); };
        seeks.sort((a, b) => (a.bot && !b.bot) ? 1 : -1);
        console.log("VARIANTS", VARIANTS);
        var rows = seeks.map((seek) => (this.model["anon"] === 'True' && seek["rated"]) ? "" : h(
            'tr',
            { on: { click: () => this.onClickSeek(seek) } },
            [h('td', [h('player-title', " " + seek["title"] + " "), seek["user"]]),
             h('td', [colorIcon(seek["color"])]),
             h('td', seek["rating"]),
             h('td', seek["tc"]),
             h('td', {attrs: {"data-icon": VARIANTS[seek["variant"]].icon}, class: {"icon": true}} ),
             h('td', {attrs: {"data-icon": (seek.chess960) ? "V" : ""}, class: {"icon": true}} ),
             h('td', seek["variant"]),
             h('td', (seek["rated"]) ? 'Rated' : 'Casual') ])
            );
        return [header, h('tbody', rows)];
    }

    private onMsgGetSeeks = (msg) => {
        this.seeks = msg.seeks;
        // console.log("!!!! got get_seeks msg:", msg);
        const oldVNode = document.getElementById('seeks');
        if (oldVNode instanceof Element) {
            oldVNode.innerHTML = '';
            patch(oldVNode as HTMLElement, h('table#seeks', this.renderSeeks(msg.seeks)));
        }
    }

    private onMsgNewGame = (msg) => {
        console.log("LobbyController.onMsgNewGame()", this.model["gameId"])
        window.location.assign(this.model["home"] + '/' + msg["gameId"]);
}

    private onMsgUserConnected = (msg) => {
        this.model["username"] = msg["username"];
        renderUsername(this.model["home"], this.model["username"]);
    }

    private onMsgChat = (msg) => {
        if (msg.user !== this.model["username"]) {
            chatMessage(msg.user, msg.message, "lobbychat");
            if (msg.user.length !== 0 && msg.user !== '_server') sound.chat();
        }
    }

    private onMsgFullChat = (msg) => {
        msg.lines.forEach((line) => {chatMessage(line.user, line.message, "lobbychat");});
    }

    private onMsgPing = (msg) => {
        this.doSend({type: "pong", timestamp: msg.timestamp});
    }

    private onMsgShutdown = (msg) => {
        alert(msg.message);
    }

    onMessage (evt) {
        console.log("<+++ lobby onMessage():", evt.data);
        var msg = JSON.parse(evt.data);
        switch (msg.type) {
            case "get_seeks":
                this.onMsgGetSeeks(msg);
                break;
            case "new_game":
                this.onMsgNewGame(msg);
                break;
            case "lobby_user_connected":
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
            case "shutdown":
                this.onMsgShutdown(msg);
                break;
        }
    }
}

function runSeeks(vnode: VNode, model) {
    const el = vnode.elm as HTMLElement;
    const ctrl = new LobbyController(el, model);
    console.log("lobbyView() -> runSeeks()", el, model, ctrl);
}

export function lobbyView(model): VNode[] {
    // Get the modal
    const modal = document.getElementById('id01')!;

    // When the user clicks anywhere outside of the modal, close it
    window.onclick = function(event) {
        if (event.target == modal) {
            modal.style.display = "none";
        }
    }

    return [h('aside.sidebar-first', [ h('div.lobbychat#lobbychat') ]),
            h('main.main', [ h('table#seeks', {hook: { insert: (vnode) => runSeeks(vnode, model) } }) ]),
            h('aside.sidebar-second', [ h('ul#seekbuttons') ]),
            h('under-left', [
                h('a.reflist', {attrs: {href: 'https://discord.gg/aPs8RKr'}}, 'Discord'),
                h('a.reflist', {attrs: {href: 'https://github.com/gbtami/pychess-variants'}}, 'Github'),
            ]),
            h('under-lobby'),
            h('under-right', [
                h('a', {
                    class: {'donate-button': true},
                    attrs: {href: 'https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=NC73JXRBQNTAN&source=url'}
                    }, 'Directly support us')
            ]),
        ];
}
