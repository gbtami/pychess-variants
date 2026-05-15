import { h, VNode } from 'snabbdom';

import { _ } from './i18n';
import { patch } from './document';
import { timeago } from './datetime';
import { PyChessModel } from './types';

interface ThreadSummary {
    user: string;
    title: string;
    online?: boolean;
    updatedAt: string;
    unread: boolean;
    lastMsg: {
        user: string;
        text: string;
        createdAt: string;
    };
}

interface Message {
    _id: string;
    tid: string;
    from: string;
    to: string;
    text: string;
    createdAt: string;
}

interface ThreadResponse {
    contact: {
        name: string;
        title: string;
        online?: boolean;
    };
    messages: Message[];
    hasMore?: boolean;
}

async function parseJsonResponse(res: Response) {
    const text = await res.text();
    if (text.length === 0) return { status: res.status, data: {} as any };
    try {
        return { status: res.status, data: JSON.parse(text) };
    } catch {
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
}

function titleAndName(title: string, name: string) {
    return title ? `${title} ${name}` : name;
}

function pad2(num: number): string {
    return (num < 10 ? '0' : '') + num;
}

function parseDate(input: string): Date | null {
    const date = new Date(input);
    return Number.isNaN(date.getTime()) ? null : date;
}

function sameDay(left: Date, right: Date): boolean {
    return left.getDate() === right.getDate()
        && left.getMonth() === right.getMonth()
        && left.getFullYear() === right.getFullYear();
}

function renderDayLabel(date: Date): string {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (sameDay(date, today)) return _('Today').toUpperCase();
    if (sameDay(date, yesterday)) return _('Yesterday').toUpperCase();

    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric' });
}

function renderClockTime(input: string): string {
    const date = parseDate(input);
    if (date === null) return '';
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function inboxView(model: PyChessModel) {
    let threads: ThreadSummary[] = [];
    let contact = model.profileid || '';
    let contactTitle = '';
    let contactOnline = false;
    let blockedUsers = new Set<string>();
    let contactBlocked = false;
    let messages: Message[] = [];
    let hasMoreMessages = false;
    let loadingMore = false;
    let draft = '';
    let loading = true;
    let sending = false;
    let appEl: HTMLElement | VNode;
    let evtSource: EventSource | null = null;
    let reconnectTimer: number | null = null;
    let pendingScrollToBottom = false;
    let pendingRestoreScroll: { top: number; height: number } | null = null;

    function convoBodyEl() {
        return document.querySelector('#inbox-app .inbox-convo-body') as HTMLElement | null;
    }

    function redraw() {
        appEl = patch(appEl, render());
        const convoBody = convoBodyEl();
        if (convoBody && pendingRestoreScroll) {
            const { top, height } = pendingRestoreScroll;
            convoBody.scrollTop = convoBody.scrollHeight - height + top;
            pendingRestoreScroll = null;
        } else if (convoBody && pendingScrollToBottom) {
            convoBody.scrollTop = convoBody.scrollHeight;
            pendingScrollToBottom = false;
        }
    }

    function selectedThread() {
        return threads.find(thread => thread.user === contact);
    }

    function loadThreads(selectFirstWhenEmpty = true) {
        fetch('/api/inbox/threads')
            .then(parseJsonResponse)
            .then(({ status, data }: { status: number; data: { threads?: ThreadSummary[]; message?: string } }) => {
                if (status >= 400) {
                    throw new Error(data.message || `HTTP ${status}`);
                }
                const payload = data;
                threads = payload.threads || [];
                if (selectFirstWhenEmpty && !contact && threads.length > 0) {
                    contact = threads[0].user;
                    openThread(contact);
                    return;
                }
                if (!contact || threads.length === 0) loading = false;
                redraw();
            })
            .catch((err) => {
                console.warn('Failed to load inbox threads.', err);
                loading = false;
                redraw();
            });
    }

    function loadBlockedUsers() {
        fetch('/api/blocks')
            .then(parseJsonResponse)
            .then(({ status, data }: { status: number; data: { blocks?: string[] } }) => {
                if (status >= 400) return;
                blockedUsers = new Set((data.blocks || []).filter(Boolean));
                contactBlocked = blockedUsers.has(contact);
                redraw();
            })
            .catch((err) => console.warn('Failed to load blocked users.', err));
    }

    function openThread(user: string, before?: number, loadingOlder = false) {
        if (!user) return;
        if (!loadingOlder) loading = true;
        redraw();

        const query = before ? `?before=${before}` : '';
        fetch(`/api/inbox/thread/${encodeURIComponent(user)}${query}`)
            .then(parseJsonResponse)
            .then(({ status, data }: { status: number; data: ThreadResponse & { type?: string; message?: string } }) => {
                if (status >= 400 || data.type === 'error') {
                    alert(data.message || _('Could not open conversation.'));
                    loadingMore = false;
                    loading = false;
                    redraw();
                    return;
                }

                if (loadingOlder) {
                    messages = (data.messages || []).concat(messages);
                } else {
                    contact = data.contact.name;
                    contactTitle = data.contact.title || '';
                    contactOnline = Boolean(data.contact.online);
                    contactBlocked = blockedUsers.has(contact);
                    messages = data.messages || [];
                    history.replaceState({ contact }, '', `/inbox/${encodeURIComponent(contact)}`);
                    loadThreads(false);
                    pendingScrollToBottom = true;
                }

                hasMoreMessages = Boolean(data.hasMore);
                loadingMore = false;
                loading = false;
                redraw();
            })
            .catch((err) => {
                console.warn('Failed to load inbox thread.', err);
                loadingMore = false;
                loading = false;
                redraw();
            });
    }

    function loadOlderMessages() {
        if (!contact || loadingMore || !hasMoreMessages || messages.length === 0) return;
        const oldestDate = parseDate(messages[0].createdAt);
        if (!oldestDate) return;

        const convoBody = convoBodyEl();
        if (convoBody) {
            pendingRestoreScroll = {
                top: convoBody.scrollTop,
                height: convoBody.scrollHeight,
            };
        }

        loadingMore = true;
        redraw();
        openThread(contact, oldestDate.getTime(), true);
    }

    function sendMessage() {
        const text = draft.trim();
        if (!contact || !text || sending) return;

        sending = true;
        redraw();

        const formData = new URLSearchParams({ text });
        fetch(`/api/inbox/thread/${encodeURIComponent(contact)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
            body: formData.toString(),
        })
            .then(parseJsonResponse)
            .then(({ status, data }) => {
                if (status >= 400 || data.type === 'error') {
                    alert(data.message || _('Could not send message.'));
                    return;
                }

                draft = '';
                pendingScrollToBottom = true;
                openThread(contact);
            })
            .catch((err) => {
                console.warn('Failed to send inbox message.', err);
                alert(_('Could not send message.'));
            })
            .finally(() => {
                sending = false;
                redraw();
            });
    }

    function toggleBlock() {
        if (!contact) return;
        const nextBlocked = !contactBlocked;
        const formData = new URLSearchParams({ block: `${nextBlocked}` });
        fetch(`/api/${encodeURIComponent(contact)}/block`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
            body: formData.toString(),
        })
            .then(parseJsonResponse)
            .then(({ status }) => {
                if (status >= 400) {
                    alert(_('Could not update block state.'));
                    return;
                }
                contactBlocked = nextBlocked;
                if (nextBlocked) blockedUsers.add(contact);
                else blockedUsers.delete(contact);
                redraw();
            })
            .catch((err) => {
                console.warn('Failed to update block state.', err);
                alert(_('Could not update block state.'));
            });
    }

    function deleteConversation() {
        if (!contact) return;
        if (!window.confirm(_('Delete conversation?'))) return;

        fetch(`/api/inbox/thread/${encodeURIComponent(contact)}/delete`, {
            method: 'POST',
        })
            .then(parseJsonResponse)
            .then(({ status, data }: { status: number; data: { type?: string; message?: string } }) => {
                if (status >= 400 || data.type === 'error') {
                    alert(data.message || _('Could not delete conversation.'));
                    return;
                }

                threads = threads.filter((t) => t.user !== contact);
                messages = [];
                contact = '';
                contactTitle = '';
                contactOnline = false;
                loading = false;
                history.replaceState({}, '', '/inbox');
                loadThreads(true);
                redraw();
            })
            .catch((err) => {
                console.warn('Failed to delete conversation.', err);
                alert(_('Could not delete conversation.'));
            });
    }

    function connectInbox() {
        if (evtSource !== null) evtSource.close();
        evtSource = new EventSource('/inbox/subscribe');
        evtSource.onmessage = (event: MessageEvent) => {
            const payload = JSON.parse(event.data) as { unread: number; thread?: string };
            if (payload.thread) {
                if (payload.thread === contact) openThread(contact);
                else loadThreads(false);
            } else {
                loadThreads(false);
            }
        };
        evtSource.onerror = function() {
            if (evtSource !== null) {
                evtSource.close();
                evtSource = null;
            }
            if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
            reconnectTimer = window.setTimeout(() => {
                reconnectTimer = null;
                connectInbox();
            }, 1500);
        };
    }

    function renderThreadItem(thread: ThreadSummary) {
        const isSelected = thread.user === contact;
        const statusClass = thread.online ? '.online' : '';
        return h(`button.inbox-thread${isSelected ? '.active' : ''}${thread.unread ? '.unread' : ''}`, {
            props: { type: 'button' },
            on: { click: () => openThread(thread.user) },
        }, [
            h('div.inbox-thread-head', [
                h(`strong.inbox-user${statusClass}`, titleAndName(thread.title, thread.user)),
                h('span.inbox-thread-date', timeago(thread.lastMsg?.createdAt || thread.updatedAt)),
            ]),
            h('div.inbox-thread-body', thread.lastMsg?.text || ''),
        ]);
    }

    function renderMessage(msg: Message) {
        const mine = msg.from === model.username;
        const createdAt = parseDate(msg.createdAt);
        return h(`div.inbox-msg${mine ? '.mine' : '.their'}`, [
            h('div.inbox-msg-meta', [
                h('strong', mine ? _('You') : titleAndName(contactTitle, contact)),
                h('span', {
                    attrs: {
                        title: createdAt ? createdAt.toLocaleString() : '',
                    },
                }, renderClockTime(msg.createdAt)),
            ]),
            h('div.inbox-msg-text', msg.text),
        ]);
    }

    function renderMessagesWithDates(msgs: Message[]) {
        const nodes: VNode[] = [];
        let lastDate: Date | null = null;

        msgs.forEach((msg) => {
            const date = parseDate(msg.createdAt);
            if (date !== null && (lastDate === null || !sameDay(lastDate, date))) {
                nodes.push(h('div.inbox-day', renderDayLabel(date)));
                lastDate = date;
            }
            nodes.push(renderMessage(msg));
        });

        return nodes;
    }

    function render() {
        const thread = selectedThread();
        const hasContact = Boolean(thread || contact);
        const challengeHref = hasContact ? `/@/${encodeURIComponent(contact)}/challenge` : '#';
        const convoBodyNodes: (VNode | null)[] = [];
        if (hasMoreMessages) {
            convoBodyNodes.push(
                h('button.inbox-load-more.button.button-empty', {
                    props: { type: 'button', disabled: loadingMore },
                    on: { click: loadOlderMessages },
                }, loadingMore ? _('Loading...') : _('Load more')),
            );
        }
        if (messages.length) {
            convoBodyNodes.push(...renderMessagesWithDates(messages));
        } else {
            convoBodyNodes.push(h('div.inbox-empty', _('No messages yet.')));
        }
        return h('main#inbox-app.inbox.box.inbox-app', [
            h('section.inbox-side', [
                h('div.inbox-side-head', [h('h2', _('Inbox'))]),
                h('div.inbox-side-compose', [
                    h('input', {
                        attrs: { type: 'text', placeholder: _('Type username and press Enter') },
                        props: { value: contact },
                        on: {
                            input: (e: Event) => {
                                contact = (e.target as HTMLInputElement).value.trim();
                            },
                            keypress: (e: KeyboardEvent) => {
                                if (e.key === 'Enter' && contact) openThread(contact);
                            },
                        },
                    }),
                ]),
                h('div.inbox-thread-list', threads.length
                    ? threads.map(renderThreadItem)
                    : [h('div.inbox-empty', _('No conversations yet.'))]),
            ]),
            h('section.inbox-convo', [
                h('div.inbox-convo-head', [
                    thread
                        ? h(`h2.inbox-user${contactOnline ? '.online' : ''}`, titleAndName(thread.title || contactTitle, thread.user))
                        : h('h2', _('Select a conversation')),
                    h('div.inbox-convo-actions', hasContact ? [
                        h('a.inbox-action.icon.icon-crossedswords', {
                            attrs: { href: challengeHref, title: _('Challenge') },
                        }),
                        h('button.inbox-action.icon.icon-ban', {
                            props: { type: 'button' },
                            attrs: { title: contactBlocked ? _('Unblock') : _('Block') },
                            on: { click: toggleBlock },
                        }),
                        h('button.inbox-action.icon.icon-trash-o', {
                            props: { type: 'button' },
                            attrs: { title: _('Delete') },
                            on: { click: deleteConversation },
                        }),
                    ] : []),
                ]),
                h('div.inbox-convo-body', loading
                    ? h('div.inbox-empty', _('Loading...'))
                    : convoBodyNodes.filter(Boolean) as VNode[],
                ),
                h('form.inbox-convo-post', {
                    on: {
                        submit: (event: Event) => {
                            event.preventDefault();
                            sendMessage();
                        },
                    },
                }, [
                    h('textarea', {
                        attrs: {
                            placeholder: contact ? _('Write a message...') : _('Select a conversation first'),
                            rows: 3,
                            disabled: !contact || sending,
                        },
                        props: { value: draft },
                        on: {
                            input: (e: Event) => {
                                draft = (e.target as HTMLTextAreaElement).value;
                                redraw();
                            },
                        },
                    }),
                    h('button.button', {
                        props: { type: 'submit', disabled: !contact || sending || !draft.trim() },
                    }, sending ? _('Sending...') : _('Send')),
                ]),
            ]),
        ]);
    }

    setTimeout(() => {
        appEl = document.getElementById('inbox-app') as HTMLElement;
        loadBlockedUsers();
        if (contact) openThread(contact);
        loadThreads(!Boolean(contact));
        connectInbox();
    }, 0);

    return h('main#inbox-app.inbox.box.inbox-app');
}
