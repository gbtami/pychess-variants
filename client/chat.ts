import { init } from "snabbdom";
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

const patch = init([klass, attributes, properties, listeners]);

import h from 'snabbdom/h';

export function chatView (ctrl, chatType) {
    function onKeyPress (e) {
        const message = (e.target as HTMLInputElement).value
        if ((e.keyCode == 13 || e.which == 13) && message.length > 0) {
            chatMessage (ctrl.model['username'], message, chatType);
            ctrl.doSend({"type": chatType, "message": message, "gameId": ctrl.model["gameId"], "room": (ctrl.spectator) ? "spectator": "player"});
            (e.target as HTMLInputElement).value = "";
        }
    }
    const anon = ctrl.model["anon"] === 'True';
    return h(`div.${chatType}#${chatType}`, { class: {"chat": true} }, [
                h('div.chatroom', ctrl.spectator ? 'Spectator room' : 'Chat room'),
                // TODO: lock/unlock chat to spectators
                // h('input#chatbox', {props: {name: "chatbox", type: "checkbox", checked: ""}}),
                h(`ol#${chatType}-messages`, [ h("div#messages")]),
                h('input#chat-entry', {
                    props: {
                        type: "text",
                        name: "entry",
                        autocomplete: "off",
                        placeholder: (anon) ? 'Sign in to chat' : 'Please be nice in the chat!',
                        disabled: anon,
                        maxlength: "140",
                    },
                    on: { keypress: (e) => onKeyPress(e) },
                })
            ])
    }

export function chatMessage (user, message, chatType) {
    const myDiv = document.getElementById(chatType + '-messages') as HTMLElement;
    // You must add border widths, padding and margins to the right.
    const isScrolled = myDiv.scrollTop == myDiv.scrollHeight - myDiv.offsetHeight;

    var container = document.getElementById('messages') as HTMLElement;
    if (user.length === 0) {
        patch(container, h('div#messages', [ h("li.message.offer", [h("t", message)]) ]));
    } else if (user === '_server') {
        patch(container, h('div#messages', [ h("li.message.server", [h("user", 'Server'), h("t", message)]) ]));
    } else {
        patch(container, h('div#messages', [ h("li.message", [h("user", user), h("t", message)]) ]));
    };

    if (isScrolled) myDiv.scrollTop = myDiv.scrollHeight;
}