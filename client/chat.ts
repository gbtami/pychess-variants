import { h } from "snabbdom";

import { _ } from './i18n';
import { patch } from './document';
import { RoundControllerBughouse } from "./bug/roundCtrl.bug";
import { onchatclick, renderBugChatPresets} from "@/bug/chat.bug";

export interface ChatController {
    anon: boolean;
    doSend: any;
    spectator?: boolean;
    gameId?: string;
    tournamentId?: string;
}

// ------ Deterministic color assignment for usernames, theme-aware ------
function getThemeColorParams(): { s: number; lBase: number; lMod: number } {
    const theme = document.body?.dataset?.theme;
    if (theme === 'dark') {
        return { s: 60, lBase: 50, lMod: 10 };
    } else {
        return { s: 70, lBase: 60, lMod: 10 };
    }
}

/**
 * Returns a mapping from username to HSL color, deterministically assigned by
 * alphabetical order and spaced evenly around the color wheel.
 * Saturation and lightness are chosen based on theme and username length.
 */
function assignUsernameColors(usernames: string[]): Record<string, string> {
    const { s, lBase, lMod } = getThemeColorParams();
    const sorted = [...usernames].sort((a, b) => a.localeCompare(b));
    const total = sorted.length;
    const colors: Record<string, string> = {};
    for (let i = 0; i < total; ++i) {
        const name = sorted[i];
        if (!userColorMap[name]) {
            const lightness = lBase + (name.length % lMod);
            const hue = Math.round((i + 1) * 360 / (total + 1));
            colors[name] = `hsl(${hue} ${s} ${lightness})`;
            userColorMap[name] = colors[name];
        } else {
            colors[name] = userColorMap[name];
        }
    }
    return colors;
}

// Stores all seen usernames for color assignment (session-based)
const activeUsernames = new Set<string>();
const userColorMap: { [username: string]: string } = {};

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
        chatEntry.placeholder = activated ? (ctrl.anon ? _('Sign in to chat') : _('Please be nice in the chat!')) : _("Chat is disabled");
    }
    return h(`div#${chatType}.${chatType}.chat`, [
        bughouse? h('div.chatroom'): h('div.chatroom', [
            (spectator) ? _('Spectator room') : _('Chat room'),
            h('input#checkbox', { props: { title: _("Toggle the chat"), name: "checkbox", type: "checkbox", checked: "true" }, on: { click: onClick } })
        ]),
        h(`ol#${chatType}-messages`, [ h('div#messages') ]),
        bughouse && !ctrl.spectator? renderBugChatPresets(ctrl.variant, sendMessage): null,
        h('input#chat-entry', {
            props: {
                type: "text",
                name: "entry",
                autocomplete: "off",
                placeholder: (ctrl.anon) ? _('Sign in to chat') : _('Please be nice in the chat!'),
                disabled: ctrl.anon,
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


export function chatMessage (
    user: string,
    message: string,
    chatType: string,
    time?: number,
    ply?: number,
    ctrl?: RoundControllerBughouse
) {

    const chatDiv = document.getElementById(chatType + '-messages') as HTMLElement;
    const isBottom = chatDiv.scrollHeight - (chatDiv.scrollTop + chatDiv.offsetHeight) < 80;
    const localTime = time ? new Date(time * 1000).toLocaleTimeString("default", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
    const container = document.getElementById('messages') as HTMLElement;

    // Update active usernames set
    if (user.length && user !== '_server' && user !== 'Discord-Relay') {
        activeUsernames.add(user);
    }
    // Special handling for Discord-Relay messages
    let discordUser = "";
    if (user === 'Discord-Relay') {
        const colonIndex = message.indexOf(':');
        if (colonIndex > 0) {
            discordUser = message.substring(0, colonIndex);
            activeUsernames.add(discordUser);
        }
    }
    // Get color mapping
    const usernameColorMap = assignUsernameColors(Array.from(activeUsernames));

    if (user.length === 0) {
        patch(container, h('div#messages', [ h("li.message.offer", [h("t", message)]) ]));
    } else if (user === '_server') {
        patch(container, h('div#messages', [ h("li.message.server", [h("div.time", localTime), h("user", _('Server')), h("t", message)]) ]));
    } else if (user === 'Discord-Relay') {
        const colonIndex = message.indexOf(':');
        if (colonIndex > 0) {
            discordUser = message.substring(0, colonIndex);
            const discordMessage = message.substring(colonIndex + 2);
            patch(container, h('div#messages', [
                h("li.message", [
                    h("div.time", localTime),
                    h("div.discord-icon-container", h("img.icon-discord-icon", { attrs: { src: '/static/icons/discord.svg', alt: "" } })),
                    h("user", { style: { color: usernameColorMap[discordUser] || "#aaa" } }, discordUser),
                    h("t", discordMessage)
                ])
            ]));
        } else {
            patch(container, h('div#messages', [
                h("li.message", [
                    h("div.time", localTime),
                    h("div.discord-icon-container", h("img.icon-discord-icon", { attrs: { src: '/static/icons/discord.svg', alt: "" } })),
                    h("user", { style: { color: "#aaa" } }, user),
                    h("t", message)
                ])
            ]));
        }
    } else {
        patch(container, h('div#messages', [
            h("li.message", [
                h("div.time", localTime),
                h("user", [
                    h("a", {
                        attrs: { href: "/@/" + user },
                        style: { color: usernameColorMap[user] || "#aaa" }
                    }, user)
                ]),
                h("t", { attrs: {"title": ctrl?.steps[ply!].san!}, on: { click: () => { onchatclick(ply, ctrl) }}}, message)
            ])
        ]));
    }

    if (isBottom) setTimeout(() => {chatDiv.scrollTop = chatDiv.scrollHeight;}, 200);
}
