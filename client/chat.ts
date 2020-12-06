import { init } from "snabbdom";
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

const patch = init([klass, attributes, properties, listeners]);

import h from 'snabbdom/h';

import { _ } from './i18n';

export function chatView (ctrl, chatType) {
    function onKeyPress (e) {
        if (!(<HTMLInputElement>document.getElementById('chatbox')).checked)
            return;
        const message = (e.target as HTMLInputElement).value;
        if ((e.keyCode == 13 || e.which == 13) && message.length > 0) {
            ctrl.doSend({"type": chatType, "message": message, "gameId": ctrl.model["gameId"], "room": (ctrl.spectator) ? "spectator": "player"});
            (e.target as HTMLInputElement).value = "";
        }
    }
    function onClick () {
        const chatEntry = document.getElementById('chat-entry') as HTMLInputElement;
        const activated = (<HTMLInputElement>document.getElementById('chatbox')).checked;
        chatEntry.disabled = !activated;
        chatEntry.placeholder = (anon) ? _('Sign in to chat') : (activated ? _('Please be nice in the chat!') : _('Click on the button to activate the chat'));
    }
    const anon = ctrl.model["anon"] === 'True';
    return h(`div#${chatType}.${chatType}.chat`, [
        h('div.chatroom', [
            ctrl.spectator ? _('Spectator room') : _('Chat room'),
            h('input#chatbox', { props: { name: "chatbox", type: "checkbox", checked: "true" }, style: { float: "right", margin: "revert" }, on: { click: onClick } })
        ]),
        // TODO: lock/unlock chat to spectators
        h(`ol#${chatType}-messages`, [ h('div#messages') ]),
        h('input#chat-entry', {
            props: {
                type: "text",
                name: "entry",
                autocomplete: "off",
                placeholder: (anon) ? _('Sign in to chat') : _('Please be nice in the chat!'),
                disabled: anon,
            },
            attrs: {
                maxlength: 140,
            },
            on: { keypress: onKeyPress },
        })
    ]);
}

export function chatMessage (user, message, chatType) {
    const myDiv = document.getElementById(chatType + '-messages') as HTMLElement;
    // You must add border widths, padding and margins to the right.
    const isScrolled = myDiv.scrollTop == myDiv.scrollHeight - myDiv.offsetHeight;

    const container = document.getElementById('messages') as HTMLElement;
    if (user.length === 0) {
        patch(container, h('div#messages', [ h("li.message.offer", [h("t", message)]) ]));
    } else if (user === '_server') {
        patch(container, h('div#messages', [ h("li.message.server", [h("user", _('Server')), h("t", message)]) ]));
    } else {
        patch(container, h('div#messages', [ h("li.message", [h("user", user), h("t", message)]) ]));
    }

    if (isScrolled) myDiv.scrollTop = myDiv.scrollHeight;
}
