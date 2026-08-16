import { h, toVNode, VNode } from 'snabbdom';

import { timeago } from './datetime';
import { patch } from './document';
import { _ } from './i18n';
import { PyChessModel } from './types';
import { displayUsername, userLink } from './user';

export type TimelineEventType =
    | 'follow'
    | 'forum-post'
    | 'ublog-post'
    | 'ublog-post-like'
    | 'simul-create'
    | 'simul-join'
    | 'tournament-join';

export interface TimelineEntry {
    id: string;
    type: TimelineEventType;
    data: Record<string, string>;
    date: string;
}

interface TimelineResponse {
    entries: TimelineEntry[];
}

function parseTimelineEntries(raw: string): TimelineEntry[] {
    try {
        const value = JSON.parse(raw || '[]');
        return Array.isArray(value) ? value : [];
    } catch {
        return [];
    }
}

function actorLink(entry: TimelineEntry): VNode {
    const actor = entry.data.actor || '';
    return userLink(actor, displayUsername(actor));
}

function activity(entry: TimelineEntry): Array<VNode | string> | null {
    switch (entry.type) {
        case 'follow': {
            const target = entry.data.target || '';
            return [actorLink(entry), ` ${_('started following')} `, userLink(target, displayUsername(target))];
        }
        case 'forum-post':
            return [
                actorLink(entry),
                ` ${_('posted in forum')} `,
                h(
                    'a',
                    { attrs: { href: `/forum/redirect/post/${encodeURIComponent(entry.data.postId || '')}` } },
                    entry.data.topic || _('Forum'),
                ),
            ];
        case 'ublog-post':
            return [
                actorLink(entry),
                ` ${_('published')} `,
                h(
                    'a',
                    {
                        attrs: {
                            href: `/blogs/@/${encodeURIComponent(entry.data.actor || '')}/${encodeURIComponent(
                                entry.data.slug || '',
                            )}/${encodeURIComponent(entry.data.postId || '')}`,
                        },
                    },
                    entry.data.title || _('Blog post'),
                ),
            ];
        case 'ublog-post-like':
            return [
                actorLink(entry),
                ` ${_('likes')} `,
                h(
                    'a',
                    {
                        attrs: {
                            href: `/blogs/@/${encodeURIComponent(entry.data.profile || '')}/${encodeURIComponent(
                                entry.data.slug || '',
                            )}/${encodeURIComponent(entry.data.postId || '')}`,
                        },
                    },
                    entry.data.title || _('Blog post'),
                ),
            ];
        case 'simul-create':
            return [
                actorLink(entry),
                ` ${_('created')} `,
                h(
                    'a',
                    { attrs: { href: `/simul/${encodeURIComponent(entry.data.simulId || '')}` } },
                    entry.data.name || _('Simultaneous exhibition'),
                ),
            ];
        case 'simul-join':
            return [
                actorLink(entry),
                ` ${_('joined')} `,
                h(
                    'a',
                    { attrs: { href: `/simul/${encodeURIComponent(entry.data.simulId || '')}` } },
                    entry.data.name || _('Simultaneous exhibition'),
                ),
            ];
        case 'tournament-join':
            return [
                actorLink(entry),
                ` ${_('joined')} `,
                h(
                    'a',
                    { attrs: { href: `/tournament/${encodeURIComponent(entry.data.tournamentId || '')}` } },
                    entry.data.name || _('Tournament'),
                ),
            ];
        default:
            return null;
    }
}

export function timelineEntriesView(entries: TimelineEntry[]): VNode {
    const rows = entries.flatMap(entry => {
        const body = activity(entry);
        if (body === null) return [];
        return [
            h('div.timeline-entry', { key: entry.id }, [
                h('span.timeline-entry__body', body),
                ' ',
                h('info-date.timeline-entry__date', { attrs: { timestamp: entry.date } }, timeago(entry.date)),
            ]),
        ];
    });
    return h('div.timeline-entries', rows);
}

export function timelinePanel(entries: TimelineEntry[], anon: boolean): VNode {
    const body = anon
        ? h('p.timeline-empty', [
              h('a', { attrs: { href: '/login' } }, _('Sign in')),
              ` ${_('to see activity from people you follow.')}`,
          ])
        : entries.length > 0
          ? timelineEntriesView(entries)
          : h('p.timeline-empty', _('No activity yet. Follow players to see what they do.'));

    return h('div#timeline.lobby-timeline', { attrs: { 'aria-label': _('Timeline') } }, [
        body,
        !anon && entries.length > 0
            ? h('a.cont-link.timeline-more', { attrs: { href: '/timeline' } }, `${_('More')} »`)
            : null,
    ]);
}

export class LiveTimelinePanel {
    private vnode: VNode;

    constructor(element: Element) {
        this.vnode = toVNode(element);
    }

    update(entries: TimelineEntry[]): void {
        this.vnode = patch(this.vnode, timelinePanel(entries, false));
    }
}

export async function fetchTimeline(limit = 10): Promise<TimelineEntry[]> {
    const response = await fetch(`/api/timeline?nb=${limit}`, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
    });
    if (!response.ok) throw new Error(`Timeline request failed: ${response.status}`);
    const payload = (await response.json()) as TimelineResponse;
    return Array.isArray(payload.entries) ? payload.entries : [];
}

export function timelinePageView(model: PyChessModel): VNode {
    const entries = parseTimelineEntries(model.timeline);
    return h('main.timeline-page.box', [
        h('h1', _('Timeline')),
        entries.length > 0
            ? timelineEntriesView(entries)
            : h('p.timeline-empty', _('No activity yet. Follow players to see what they do.')),
    ]);
}

export function timelineEntriesFromModel(model: PyChessModel): TimelineEntry[] {
    return parseTimelineEntries(model.timeline);
}
