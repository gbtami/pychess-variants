import { h, VNode } from "snabbdom";

import { _ } from '@/i18n';
import { patch } from "@/document";
import {RoundControllerBughouse} from "@/bug/roundCtrl.bug";
import {selectMove} from "@/bug/movelist.bug";

export function renderBugChatPresets(sendMessage: (s:string)=>void): VNode {
    return h('div#chatpresets', [
                    h('button.bugchat.p', { on: { click: () => sendMessage("!bug!p") }, props: { title: _('Need pawn')} }, []),
                    h('button.bugchat.n', { on: { click: () => sendMessage("!bug!n") }, props: { title: _('Need knight')} }, []),
                    h('button.bugchat.b', { on: { click: () => sendMessage("!bug!b") }, props: { title: _('Need bishop')} }, []),
                    h('button.bugchat.r', { on: { click: () => sendMessage("!bug!r") }, props: { title: _('Need rook')} }, []),
                    h('button.bugchat.q', { on: { click: () => sendMessage("!bug!q") }, props: { title: _('Need queen')} }, []),

                    h('button.bugchat.nop', { on: { click: () => sendMessage("!bug!nop") }, props: { title: _("Don't give pawn")} }, []),
                    h('button.bugchat.non', { on: { click: () => sendMessage("!bug!non") }, props: { title: _("Don't give knight")} }, []),
                    h('button.bugchat.nob', { on: { click: () => sendMessage("!bug!nob") }, props: { title: _("Don't give bishop")} }, []),
                    h('button.bugchat.nor', { on: { click: () => sendMessage("!bug!nor") }, props: { title: _("Don't give rook")} }, []),
                    h('button.bugchat.noq', { on: { click: () => sendMessage("!bug!noq") }, props: { title: _("Don't give queen")} }, []),

                    h('button.bugchat.sit', { on: { click: () => sendMessage("!bug!sit") }, props: { title: _('Sit/stall')} }, []),
                    h('button.bugchat.go', { on: { click: () => sendMessage("!bug!go") }, props: { title: _('Go/hurry')} }, []),
                    h('button.bugchat.trade', { on: { click: () => sendMessage("!bug!trade") }, props: { title: _('Trades are good')} }, []),
                    h('button.bugchat.notrade', { on: { click: () => sendMessage("!bug!notrade") }, props: { title: _("Don't trade")} }, []),
                    h('button.bugchat.mate', { on: { click: () => sendMessage("!bug!mate") }, props: { title: _('I have checkmate')} },[]),

                    h('button.bugchat.ok', { on: { click: () => sendMessage("!bug!ok") }, props: { title: _('OK')} }, []),
                    h('button.bugchat.no', { on: { click: () => sendMessage("!bug!no") }, props: { title: _('No')} }, []),
                    h('button.bugchat.mb', { on: { click: () => sendMessage("!bug!mb") }, props: { title: _('My bad')} }, []),
                    h('button.bugchat.nvm', { on: { click: () => sendMessage("!bug!nvm") }, props: { title: _('Nevermind')} }, []),
                    h('button.bugchat.nice', { on: { click: () => sendMessage("!bug!nice") }, props: { title: _('Nice')} }, []),

                ]);
}

export function chatMessageBug (container: HTMLElement, user: string, message: string, /*chatType: string,*/ localTime?: string, ply?: number, ctrl?: RoundControllerBughouse) {
    const m = message.replace('!bug!','');
    patch(container, h('div#messages', [ h("li.message",
        [h("div.time", localTime), h("user", h("a", { attrs: {href: "/@/" + user} }, user)),
            h('div.bugchat.'+m,{ attrs: {"title": ctrl?.steps[ply!].san!}, on: { click: () => {onchatclick(ply, ctrl)}}}, [])
        ]) ]));
}

export function onchatclick(ply: number | undefined, ctrl?: RoundControllerBughouse) {
    if (ply && ctrl) {
        ctrl.goPly(ply);
        selectMove(ctrl, ply);
    }
}
