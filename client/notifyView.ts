import { h, VNode } from "snabbdom";

import { _ } from './i18n';
import { patch } from './document';
import { timeago } from './datetime';

interface Message {
    type: string;
    read: boolean;
    createdAt: string;
    content: {
        id: string;
        opp: string;
        win: boolean | null;
    };
}

function result(win: boolean | null) {
    switch (win) {
    case true :
        return "Congratulations, you won!"; break;
    case false :
        return "Defeat"; break;
    default:
        return "Draw";
    }
}

function messageView(message: Message) {
    const read = (message.read) ? '' : '.new';
    const content = message.content;
    switch (message.type) {
    case 'gameAborted':
        return h(`div.notification.corr${read}`, [
            h('div.icon.icon-paper-plane'),
            h('span.content',[
                h('span', [
                    h('strong', "Game vs " + content.opp),
                    h('info.date', { attrs: { timestamp: message.createdAt} }, timeago(message.createdAt)),
                ]),
                h('span', 'Game aborted'),
            ]),
        ]);
    case 'gameEnd':
        return h(`a.notification.corr${read}`, { attrs: { href: '/' + content.id} }, [
            h('div.icon.icon-paper-plane'),
            h('span.content',[
                h('span', [
                    h('strong', "Game vs " + content.opp),
                    h('info.date', { attrs: { timestamp: message.createdAt} }, timeago(message.createdAt)),
                ]),
                h('span', result(content.win)),
            ]),
        ]);
    case 'corrAlarm':
        return h(`a.notification.corr${read}`, { attrs: { href: '/' + content.id} }, [
            h('div.icon.icon-paper-plane'),
            h('span.content',[
                h('span', [
                    h('strong', "Time is almost up!"),
                    h('info.date', { attrs: { timestamp: message.createdAt} }, timeago(message.createdAt)),
                ]),
                h('span', "Game vs " + content.opp),
            ]),
        ]);
    default:
        return '';
    }
}

function compareMessages(a: Message, b: Message) {
    if (a.createdAt < b.createdAt) return 1;
    if (a.createdAt > b.createdAt) return -1;
    return 0;
}

function renderMessages(messages: Message[]) {
    let renderedMessages = [];
    if (messages.length === 0) {
        renderedMessages.push(
            h('span.notification.empty', [
                h('div.icon.icon-info', '🛈'),
                h('span.text', _('No notifications.')),
            ]),
        );
    } else {
        messages.sort(compareMessages).forEach((message: Message) => renderedMessages.push(messageView(message)));
    }
    return renderedMessages;
}

export function notifyView() {
    var page: number = 0;
    var unread: number = 0;
    var messages: Message[] = [];

    const xmlhttp = new XMLHttpRequest();
    const url = "/notifications?p=";
    var notifyAppEl: HTMLElement | VNode;

    const newNotifyCounter = (sum: number, message: Message) => sum + ((message.read) ? 0 : 1);

    function redraw() {
        (document.querySelector('.data-count') as HTMLElement).setAttribute('data-count', `${unread}`);
        notifyAppEl = patch(notifyAppEl, h('div#notify-app', renderMessages(messages)));
    }

    xmlhttp.onreadystatechange = function() {
        if (this.readyState === 4 && this.status === 200) {
            notifyAppEl = document.getElementById('notify-app') as HTMLElement;
            messages = JSON.parse(this.responseText);
            unread = messages.reduce(newNotifyCounter, 0);
            redraw();

            const evtSource = new EventSource("/notify");
            evtSource.onmessage = function(event) {
                messages = JSON.parse(event.data);
                unread = messages.reduce(newNotifyCounter, 0);
                page = 0;
                redraw();
            }
        }
    };
    xmlhttp.open("GET", `${url}${page}`, true);
    xmlhttp.send();

    function sendNotified() {
        const xmlhttp = new XMLHttpRequest();
        xmlhttp.onreadystatechange = function() {
            if (this.readyState === 4 && this.status === 200) {
                console.log("sendNotified() was OK");
            }
        }
        xmlhttp.open("GET", "/notified", true);
        xmlhttp.send();
    }

    function showNotify() {
        if (unread > 0) {
            messages.forEach(msg => msg.read = true);
            unread = 0;
            (document.querySelector('.data-count') as HTMLElement).setAttribute('data-count', `${unread}`);
            sendNotified();
        } else { 
            document.querySelectorAll('.notification.new').forEach(el => el.classList.remove('new'));
        }
        (document.getElementById('btn-notify') as HTMLElement).classList.add('shown');
        (document.getElementById('notify-app') as HTMLElement).style.display = 'flex';
    }

    function toggleNotify() {
        if ((document.getElementById('notify-app') as HTMLElement).style.display === 'flex') {
            hideNotify();
        } else {
            showNotify();
        }
    }

    return h('div#notify-panel', [
        h('button#btn-notify', { on: { click: toggleNotify }, attrs: { 'aria-label': `Notifications: ${unread}`} }, [
            h('div.icon.icon-bell-o.data-count', {attrs: { 'data-count': 0 }}),
        ]),
        h('div#notify-app'),
    ]);
}

export function hideNotify() {
    (document.getElementById('btn-notify') as HTMLElement).classList.remove('shown');
    (document.getElementById('notify-app') as HTMLElement).style.display = 'none';
}
