import { init } from "snabbdom";
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

const patch = init([klass, attributes, properties, listeners]);

import h from 'snabbdom/h';

import { _ } from './i18n';
import RoundController from "./roundCtrl";
import AnalysisController from "./analysisCtrl";
import TournamentController from "./tournament";
import { LobbyController } from "./lobby";

export function chatView (ctrl: RoundController | AnalysisController | TournamentController | LobbyController, chatType: string) { // TODO: instead of | better have some IChatController interface implemented by these classes
    function onKeyPress (e: KeyboardEvent) {
        if (!(<HTMLInputElement>document.getElementById('checkbox')).checked)
            return;
        const message = (e.target as HTMLInputElement).value;
        if ((e.keyCode == 13 || e.which == 13) && message.length > 0) {
            ctrl.doSend({"type": chatType, "message": message, "gameId": ctrl.model["gameId"], "tournamentId": ctrl.model["tournamentId"], "room": (/*(ctrl instanceof RoundController || ctrl instanceof AnalysisController) &&*/ ctrl.spectator) ? "spectator": "player"});
            (e.target as HTMLInputElement).value = "";
        }
    }
    function onClick () {
        const activated = (<HTMLInputElement>document.getElementById('checkbox')).checked;
        const chatEntry = (<HTMLInputElement>document.getElementById('chat-entry'));
        (<HTMLElement>document.getElementById(chatType + "-messages")).style.display = activated ? "block" : "none";
        chatEntry.disabled = !activated;
        chatEntry.placeholder = activated ? (anon ? _('Sign in to chat') : _('Please be nice in the chat!')) : _("Chat is disabled");
    }
    const anon = ctrl.model["anon"] === 'True';
    return h(`div#${chatType}.${chatType}.chat`, [
        h('div.chatroom', [
            ((ctrl instanceof RoundController || ctrl instanceof AnalysisController) && ctrl.spectator) ? _('Spectator room') : _('Chat room'),
            h('input#checkbox', { props: { title: _("Toggle the chat"), name: "checkbox", type: "checkbox", checked: "true" }, on: { click: onClick } })
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

export function chatMessage (user: string, message: string, chatType: string) {
    const myDiv = document.getElementById(chatType + '-messages') as HTMLElement;
    // You must add border widths, padding and margins to the right.
    const isScrolled = myDiv.scrollTop == myDiv.scrollHeight - myDiv.offsetHeight;

    const container = document.getElementById('messages') as HTMLElement;
    if (user.length === 0) {
        patch(container, h('div#messages', [ h("li.message.offer", [h("t", message)]) ]));
    } else if (user === '_server') {
        patch(container, h('div#messages', [ h("li.message.server", [h("user", _('Server')), h("t", message)]) ]));
    } else {
        patch(container, h('div#messages', [ h("li.message", [h("user", h("a", { attrs: {href: "/@/" + user} }, user)), h("t", message)]) ]));
    }

    if (isScrolled) setTimeout(() => {myDiv.scrollTop = myDiv.scrollHeight;}, 200);
}
