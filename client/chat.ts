import { h } from "snabbdom";

import { _ } from './i18n';
import RoundController from './roundCtrl';
import AnalysisController from './analysisCtrl';
import TournamentController from './tournament';
import { LobbyController } from './lobby';
import { patch } from './document';

export function chatView(ctrl: RoundController | AnalysisController | TournamentController | LobbyController, chatType: string) { // TODO: instead of | better have some IChatController interface implemented by these classes
    function onKeyPress (e: KeyboardEvent) {
        if (!(<HTMLInputElement>document.getElementById('checkbox')).checked)
            return;
        const message = (e.target as HTMLInputElement).value.trim();
        if ((e.keyCode === 13 || e.which === 13) && message.length > 0) {
            const m: any = {type: chatType, message: message, room: ("spectator" in ctrl && ctrl.spectator) ? "spectator" : "player"};
            if ("gameId" in ctrl)
                m["gameId"] = ctrl.gameId;
            if ("tournamentId" in ctrl)
                m["tournamentId"] = ctrl.tournamentId
            ctrl.doSend(m);
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
    const anon = ctrl.anon;
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

export function chatMessage (user: string, message: string, chatType: string, time?: number) {
    const chatDiv = document.getElementById(chatType + '-messages') as HTMLElement;
    // You must add border widths, padding and margins to the right.
    // Only scroll the chat on a new message if the user is at the very bottom of the chat
    const isBottom = chatDiv.scrollHeight - (chatDiv.scrollTop + chatDiv.offsetHeight) < 80;
    const localTime = time ? new Date(time * 1000).toLocaleTimeString("default", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";

    const container = document.getElementById('messages') as HTMLElement;
    if (user.length === 0) {
        patch(container, h('div#messages', [ h("li.message.offer", [h("t", message)]) ]));
    } else if (user === '_server') {
        patch(container, h('div#messages', [ h("li.message.server", [h("div.time", localTime), h("user", _('Server')), h("t", message)]) ]));
    } else if (user === 'Discord-Relay') {
        const colonIndex = message.indexOf(':'); // Discord doesn't allow colons in usernames so the first colon signifies the start of the message
        const discordUser = message.substring(0, colonIndex);
        const discordMessage = message.substring(colonIndex + 2);
        patch(container, h('div#messages', [ h("li.message", [h("div.time", localTime), h("div.discord-icon-container", h("img.icon-discord-icon", { attrs: { src: '/static/icons/discord.svg' } })), h("user", discordUser), h("t", discordMessage)]) ]));
    } else {
        patch(container, h('div#messages', [ h("li.message", [h("div.time", localTime), h("user", h("a", { attrs: {href: "/@/" + user} }, user)), h("t", message)]) ]));
    }

    if (isBottom) setTimeout(() => {chatDiv.scrollTop = chatDiv.scrollHeight;}, 200);
}
