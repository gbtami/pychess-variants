import {h, VNode} from "snabbdom";
import {patch} from "@/document";

export function renderBugChatPresets(sendMessage: (s:string)=>void): VNode{
    return h('div#chatpresets', [
                    h('button.bugchat.p', { on: { click: () => sendMessage("!bug!p") } }, []),
                    h('button.bugchat.n', { on: { click: () => sendMessage("!bug!n") } }, []),
                    h('button.bugchat.b', { on: { click: () => sendMessage("!bug!b") } }, []),
                    h('button.bugchat.r', { on: { click: () => sendMessage("!bug!r") } }, []),
                    h('button.bugchat.q', { on: { click: () => sendMessage("!bug!q") } }, []),

                    h('button.bugchat.nop', { on: { click: () => sendMessage("!bug!nop") } }, []),
                    h('button.bugchat.non', { on: { click: () => sendMessage("!bug!non") } }, []),
                    h('button.bugchat.nob', { on: { click: () => sendMessage("!bug!nob") } }, []),
                    h('button.bugchat.nor', { on: { click: () => sendMessage("!bug!nor") } }, []),
                    h('button.bugchat.noq', { on: { click: () => sendMessage("!bug!noq") } }, []),

                    h('button.bugchat.sit', { on: { click: () => sendMessage("!bug!sit") } }, []),
                    h('button.bugchat.go', { on: { click: () => sendMessage("!bug!go") } }, []),
                    h('button.bugchat.trade', { on: { click: () => sendMessage("!bug!trade") } }, []),
                    h('button.bugchat.notrade', { on: { click: () => sendMessage("!bug!notrade") } }, []),
                    h('button.bugchat.mate', { on: { click: () => sendMessage("!bug!mate") } },[]),

                    h('button.bugchat.ok', { on: { click: () => sendMessage("!bug!ok") } }, []),
                    h('button.bugchat.no', { on: { click: () => sendMessage("!bug!no") } }, []),
                    h('button.bugchat.mb', { on: { click: () => sendMessage("!bug!mb") } }, []),
                    h('button.bugchat.nvm', { on: { click: () => sendMessage("!bug!nvm") } }, []),
                    h('button.bugchat.nice', { on: { click: () => sendMessage("!bug!fix") } }, []),

                ]);
}

export function chatMessageBug (container: HTMLElement, user: string, message: string, chatType: string, localTime?: string) {
    const m = message.replace('!bug!','');
    patch(container, h('div#messages', [ h("li.message",
        [h("div.time", localTime), h("user", h("a", { attrs: {href: "/@/" + user} }, user)),
            h('div.bugchat.'+m,[])
        ]) ]));
}