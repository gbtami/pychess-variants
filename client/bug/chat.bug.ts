import { h, VNode } from "snabbdom";

import { _ } from '@/i18n';
import { patch } from "@/document";
import {RoundControllerBughouse} from "@/bug/roundCtrl.bug";
import {formatChatMessageTime, getLocalMoveNum, selectMove} from "@/bug/movelist.bug";
import {StepChat} from "@/messages";

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

export function chatMessageBug (ply: number, ctrl: RoundControllerBughouse, x: StepChat) {

    //TODO: first lines and very last copied from chat.ts
    const chatDiv = document.getElementById('bugroundchat-messages') as HTMLElement;
    // You must add border widths, padding and margins to the right.
    // Only scroll the chat on a new message if the user is at the very bottom of the chat
    const isBottom = chatDiv.scrollHeight - (chatDiv.scrollTop + chatDiv.offsetHeight) < 80;
    const container = document.getElementById('messages') as HTMLElement;

    const step = ctrl?.steps[ply!]!;
    const boardName = step.turnColor === 'black' ? step.boardName?.toUpperCase() : step.boardName;
    const lastMoveSan = ply === 0? "": getLocalMoveNum(step) + '' + boardName + "." + step.san!;

    const message = x.message
    const m = message.replace('!bug!','');

    const user = x.username

    const time = formatChatMessageTime(x);

    const san = h("div.time.bugchatpointer", {attrs: {"title": time }, on: {
                click: () => {
                    onchatclick(ply, ctrl)
                }}}, lastMoveSan);

    if (message.startsWith("!bug!")) {

        patch(container, h('div#messages', [h("li.message",
            [san, h("user", h("a", {attrs: {href: "/@/" + user}}, user)),
                h('div.bugchat.' + m, {
                    attrs: {"title": lastMoveSan}, on: {
                        click: () => {
                            onchatclick(ply, ctrl)
                        }
                    }
                }, [])
            ])]));
    } else {
        patch(container, h('div#messages', [ h("li.message", [san, h("user", h("a", { attrs: {href: "/@/" + user} }, user)), h("t.bugchatpointer", { attrs: {"title": ctrl?.steps[ply!].san!}, on: { click: () => { onchatclick(ply, ctrl) }}}, message)]) ]));
    }

    if (isBottom) setTimeout(() => {chatDiv.scrollTop = chatDiv.scrollHeight;}, 200);
}

export function onchatclick(ply: number | undefined, ctrl?: RoundControllerBughouse) {
    if (ply && ctrl) {
        ctrl.goPly(ply);
        selectMove(ctrl, ply);
    }
}
