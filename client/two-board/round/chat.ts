import { h } from 'snabbdom';

import { patch } from '@/document';
import { RoundControllerBughouse } from '@/two-board/round/roundCtrl';
import { formatChatMessageTime, getLocalMoveNum, selectMove } from '@/two-board/common/movelist';
import { StepChat } from '@/messages';
import { displayUsername, isAnonUsername } from '@/user';
import { linkifyNodes } from '@/linkify';

export function resetChat() {
    const container = document.getElementById('messages') as HTMLElement;
    container.innerHTML = '';
}

export function chatMessageBug(ply: number, ctrl: RoundControllerBughouse, x: StepChat) {
    //TODO: first lines and very last copied from chat.ts
    const chatDiv = document.getElementById('bugroundchat-messages') as HTMLElement;
    // You must add border widths, padding and margins to the right.
    // Only scroll the chat on a new message if the user is at the very bottom of the chat
    const isBottom = chatDiv.scrollHeight - (chatDiv.scrollTop + chatDiv.offsetHeight) < 80;
    const container = document.getElementById('messages') as HTMLElement;

    const step = ctrl.steps[ply];
    const boardName = step.turnColor === 'black' ? step.boardName?.toUpperCase() : step.boardName;
    const lastMoveSan = ply === 0 ? '' : getLocalMoveNum(step) + '' + boardName + '.' + step.san!;

    const message = x.message;
    const messageNodes = linkifyNodes(message, 'chat-message-link');
    const m = message.replace('!bug!', '');

    const user = x.username;
    const displayUser = displayUsername(user);
    const userNode = isAnonUsername(user)
        ? h('span', displayUser)
        : h('a', { attrs: { href: '/@/' + user }, class: { 'user-link': true } }, displayUser);

    const time = formatChatMessageTime(x);

    const san = h(
        'div.time.bugchatpointer',
        {
            attrs: { title: time },
            on: {
                click: () => {
                    onchatclick(ply, ctrl);
                },
            },
        },
        lastMoveSan,
    );

    if (message.startsWith('!bug!')) {
        patch(
            container,
            h('div#messages', [
                h('li.message', [
                    san,
                    h('user', userNode),
                    h(
                        'div.bugchat.' + m,
                        {
                            attrs: { title: lastMoveSan },
                            on: {
                                click: () => {
                                    onchatclick(ply, ctrl);
                                },
                            },
                        },
                        [],
                    ),
                ]),
            ]),
        );
    } else {
        patch(
            container,
            h('div#messages', [
                h('li.message', [
                    san,
                    h('user', userNode),
                    h(
                        't.bugchatpointer',
                        {
                            attrs: { title: step.san ?? '' },
                            on: {
                                click: () => {
                                    onchatclick(ply, ctrl);
                                },
                            },
                        },
                        messageNodes,
                    ),
                ]),
            ]),
        );
    }

    if (isBottom)
        setTimeout(() => {
            chatDiv.scrollTop = chatDiv.scrollHeight;
        }, 200);
}

export function onchatclick(ply: number | undefined, ctrl?: RoundControllerBughouse) {
    if (ply && ctrl) {
        ctrl.goPly(ply);
        selectMove(ctrl, ply);
    }
}
