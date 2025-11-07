import { h, VNode } from "snabbdom";
import * as cg from 'chessgroundx/types';

import { _ } from '@/i18n';
import { patch } from "@/document";
import {RoundControllerBughouse} from "@/bug/roundCtrl.bug";
import {formatChatMessageTime, getLocalMoveNum, selectMove} from "@/bug/movelist.bug";
import {StepChat} from "@/messages";
import { Variant } from "../variants";

export function renderBugChatPresets(variant: Variant, sendMessage: (s:string)=>void): VNode {
    const roles: (cg.Role)[] = [...variant.pocket!.roles.white];
    let buttons = [];

    const needButtons = roles.map(
        role => {
            const letter = role.charAt(0);
            const piece = variant.pocket!.pieceNames![role];
            return h(`button.bugchat.${letter}`, { on: { click: () => sendMessage(`!bug!${letter}`) }, props: { title: _("Need %1", piece)} }, []);
        }
    );
    const dontGiveButtons = roles.map(
        role => {
            const letter = role.charAt(0);
            const piece = variant.pocket!.pieceNames![role];
            return h(`button.bugchat.no${letter}`, { on: { click: () => sendMessage(`!bug!no${letter}`) }, props: { title: _("Don't give %1", piece)} }, []);
        }
    );

    const tells = [
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
    ];

    buttons.push(...needButtons);
    buttons.push(...dontGiveButtons);
    buttons.push(...tells);

    return h('div#chatpresets', { style: {'--rolesCount': String(roles.length) } }, buttons);
}

export function resetChat() {
    const container = document.getElementById('messages') as HTMLElement;
    container.innerHTML = '';
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
