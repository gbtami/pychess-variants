import { patch } from '@/document';
import { LiveTimelinePanel, TimelineEntry, timelineEntriesView, timelinePanel } from '@/timeline';

const entries: TimelineEntry[] = [
    {
        id: 'one',
        type: 'forum-post',
        data: { actor: 'alice', topic: 'Interesting variants', postId: 'post1234' },
        date: new Date(Date.now() - 60_000).toISOString(),
        patron: true,
    },
    {
        id: 'two',
        type: 'ublog-post',
        data: { actor: 'bob', title: 'My new variant', slug: 'my-new-variant', postId: 'blog1234' },
        date: new Date(Date.now() - 120_000).toISOString(),
    },
    {
        id: 'three',
        type: 'ublog-post-like',
        data: { actor: 'carol', profile: 'alice', title: 'A liked post', slug: 'liked-post', postId: 'liked123' },
        date: new Date(Date.now() - 180_000).toISOString(),
    },
];

test('renders timeline activity links and relative dates', () => {
    const root = document.createElement('div');
    document.body.append(root);
    patch(root, timelineEntriesView(entries));

    expect(document.body.textContent).toContain('alice posted in forum Interesting variants');
    expect(document.body.textContent).toContain('bob published My new variant');
    expect(document.body.textContent).toContain('carol likes A liked post');
    expect(document.querySelector('a[href="/forum/redirect/post/post1234"]')).not.toBeNull();
    expect(document.querySelector('a[href="/blogs/@/bob/my-new-variant/blog1234"]')).not.toBeNull();
    expect(document.querySelector('a[href="/blogs/@/alice/liked-post/liked123"]')).not.toBeNull();
    expect(document.querySelector('a[href="/@/alice"] .icon-patron-wing')).not.toBeNull();
    expect(document.querySelectorAll('info-date')).toHaveLength(3);
});

test('shows a sign-in prompt instead of private activity to anonymous visitors', () => {
    document.body.innerHTML = '<div id="root"></div>';
    patch(document.getElementById('root')!, timelinePanel(entries, true));

    expect(document.querySelector('.timeline-entry')).toBeNull();
    expect(document.querySelector('a[href="/login"]')).not.toBeNull();
    expect(document.body.textContent).toContain('Sign in to see activity from people you follow.');
});

test('live refresh replaces the existing lobby timeline without duplicating it', () => {
    document.body.innerHTML = '<div id="root"></div>';
    patch(document.getElementById('root')!, timelinePanel(entries.slice(0, 1), false));

    const livePanel = new LiveTimelinePanel(document.getElementById('timeline')!);
    livePanel.update(entries);
    livePanel.update(entries.slice(1, 2));

    expect(document.querySelectorAll('#timeline')).toHaveLength(1);
    expect(document.querySelectorAll('.timeline-entry')).toHaveLength(1);
    expect(document.querySelector('.lobby-timeline h2')).toBeNull();
    expect(document.querySelector('.timeline-more.cont-link')).not.toBeNull();
    expect(document.body.textContent).not.toContain('alice posted in forum Interesting variants');
    expect(document.body.textContent).toContain('bob published My new variant');
});

test('renders team creation and join activity with team links and icons', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const teamEntries: TimelineEntry[] = [
        {
            id: 'team-create',
            type: 'team-create',
            data: { actor: 'alice', teamId: 'variant-fans', name: 'Variant Fans' },
            date: new Date(Date.now() - 60_000).toISOString(),
        },
        {
            id: 'team-join',
            type: 'team-join',
            data: { actor: 'bob', teamId: 'variant-fans', name: 'Variant Fans' },
            date: new Date(Date.now() - 120_000).toISOString(),
        },
    ];

    patch(root, timelineEntriesView(teamEntries));

    expect(document.body.textContent).toContain('alice created team Variant Fans');
    expect(document.body.textContent).toContain('bob joined team Variant Fans');
    expect(document.querySelectorAll('a[href="/team/variant-fans"]')).toHaveLength(2);
    expect(document.querySelectorAll('.timeline-team-icon')).toHaveLength(2);
});

