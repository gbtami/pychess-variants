import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';

import { subscribeOngoingRealtime } from '../client/ongoingRealtime';

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

describe('ongoing realtime transport', () => {
    test('shares one EventSource between consumers and closes it after the last unsubscribe', () => {
        const first: string[] = [];
        const second: string[] = [];
        const firstSubscription = subscribeOngoingRealtime(payload => first.push(payload));
        const secondSubscription = subscribeOngoingRealtime(payload => second.push(payload));

        expect(TestEventSource.instances).toHaveLength(1);
        const source = TestEventSource.instances[0];
        expect(source.url).toBe('/api/ongoing');

        source.onmessage?.(new MessageEvent('message', { data: '{"gameId":"game0001"}' }));
        expect(first).toEqual(['{"gameId":"game0001"}']);
        expect(second).toEqual(['{"gameId":"game0001"}']);

        firstSubscription.close();
        expect(source.closeCalls).toBe(0);
        secondSubscription.close();
        expect(source.closeCalls).toBe(1);
    });
});
