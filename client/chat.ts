import { h } from "snabbdom";

import { _ } from './i18n';
import { patch } from './document';
import { RoundControllerBughouse } from "./bug/roundCtrl.bug";
import {chatMessageBug, onchatclick, renderBugChatPresets} from "@/bug/chat.bug";

export interface ChatController {
    anon: boolean;
    doSend: any;
    spectator?: boolean;
    gameId?: string;
    tournamentId?: string;
}

export function chatView(ctrl: ChatController, chatType: string) {
    const spectator = ("spectator" in ctrl && ctrl.spectator);
    const bughouse = ctrl instanceof RoundControllerBughouse;
    function blur (e: Event) {
        if (bughouse) {
            console.log(e);
            // always keep focus on chat text input for faster chatting when in bughouse round page
            //todo:niki: temporarily disable this to make playing on mobile a bit easier, until solution is found:
            //(e.target as HTMLInputElement).focus();
        }
    }
    function onKeyPress (e: KeyboardEvent) {
        const cb = (<HTMLInputElement>document.getElementById('checkbox'));
        if (cb && !cb.checked)
            return;
        const message = (e.target as HTMLInputElement).value.trim();
        if ((e.keyCode === 13 || e.which === 13) && message.length > 0) {
            sendMessage(message);
            (e.target as HTMLInputElement).value = "";
        }
    }
    function sendMessage(message: string) {
        const m: any = {type: chatType, message: message, room: spectator ? "spectator" : "player"};
        if ("gameId" in ctrl)
            m["gameId"] = ctrl.gameId;
        if ("tournamentId" in ctrl)
            m["tournamentId"] = ctrl.tournamentId
        ctrl.doSend(m);
    }
    function onClick () {
        const activated = (<HTMLInputElement>document.getElementById('checkbox')).checked;
        const chatEntry = (<HTMLInputElement>document.getElementById('chat-entry'));
        (<HTMLElement>document.getElementById(chatType + "-messages")).style.display = activated ? "block" : "none";
        chatEntry.disabled = !activated;
        chatEntry.placeholder = activated ? (anon ? _('Sign in to chat') : _('Please be nice in the chat!')) : _("Chat is disabled");
    }
    const anon = ctrl.anon && !bughouse; // chat is essential to bughouse, allow even if anons (or disallow anon bughouse games?)
    return h(`div#${chatType}.${chatType}.chat`, [
        bughouse? h('div.chatroom'): h('div.chatroom', [
            (spectator) ? _('Spectator room') : _('Chat room'),
            h('input#checkbox', { props: { title: _("Toggle the chat"), name: "checkbox", type: "checkbox", checked: "true" }, on: { click: onClick } })
        ]),
        // TODO: lock/unlock chat to spectators
        h(`ol#${chatType}-messages`, [ h('div#messages') ]),
        bughouse? renderBugChatPresets(sendMessage): null,
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
                // autofocus: "true",
                'aria-label': "Chat input"
            },
            on: { keypress: onKeyPress, blur: blur },

        })
    ]);
}


export function chatMessage (user: string, message: string, chatType: string, time?: number, ply?: number, ctrl?: RoundControllerBughouse) {

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
        patch(container, h('div#messages', [ h("li.message", [h("div.time", localTime), h("div.discord-icon-container", h("img.icon-discord-icon", { attrs: { src: '/static/icons/discord.svg', alt: "" } })), h("user", discordUser), h("t", discordMessage)]) ]));
    } else if (message.startsWith("!bug!")) {
        chatMessageBug(container, user, message, /*chatType,*/ localTime, ply, ctrl);
    } else {
        patch(container, h('div#messages', [ h("li.message", [h("div.time", localTime), h("user", h("a", { attrs: {href: "/@/" + user} }, user)), h("t", { attrs: {"title": ctrl?.steps[ply!].san!}, on: { click: () => { onchatclick(ply, ctrl) }}}, message)]) ]));
    }

    if (isBottom) setTimeout(() => {chatDiv.scrollTop = chatDiv.scrollHeight;}, 200);
}
