import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';

import { subscribeHeaderRealtime } from '../client/headerRealtime';

class TestEventSource {
    static instances: TestEventSource[] = [];

    onmessage: ((event: MessageEvent) => void) | null = null;
    closeCalls = 0;

    constructor(readonly url: string) {
        TestEventSource.instances.push(this);
    }

    close() {
        this.closeCalls++;
    }
}

const originalWorker = window.Worker;
const originalEventSource = globalThis.EventSource;

beforeEach(() => {
    TestEventSource.instances = [];
    delete (window as unknown as { Worker?: typeof Worker }).Worker;
    globalThis.EventSource = TestEventSource as unknown as typeof EventSource;
});

afterEach(() => {
    if (originalWorker !== undefined) window.Worker = originalWorker;
    if (originalEventSource !== undefined) globalThis.EventSource = originalEventSource;
    else delete (globalThis as unknown as { EventSource?: typeof EventSource }).EventSource;
});

describe('header realtime transport', () => {
    test('multiplexes challenge and notification listeners over one EventSource', () => {
        const challenges: string[] = [];
        const notifications: string[] = [];
        const challengeSubscription = subscribeHeaderRealtime('challenges', payload => challenges.push(payload));
        const notificationSubscription = subscribeHeaderRealtime('notifications', payload =>
            notifications.push(payload),
        );

        expect(TestEventSource.instances).toHaveLength(1);
        const source = TestEventSource.instances[0];
        expect(source.url).toBe('/api/header/subscribe');

        source.onmessage?.(
            new MessageEvent('message', {
                data: JSON.stringify({ channel: 'challenges', payload: '{"challenges":[]}' }),
            }),
        );
        source.onmessage?.(
            new MessageEvent('message', {
                data: JSON.stringify({ channel: 'notifications', payload: '[{"type":"studyInvite"}]' }),
            }),
        );

        expect(challenges).toEqual(['{"challenges":[]}']);
        expect(notifications).toEqual(['[{"type":"studyInvite"}]']);

        challengeSubscription.close();
        expect(source.closeCalls).toBe(0);
        notificationSubscription.close();
        expect(source.closeCalls).toBe(1);
    });
});
