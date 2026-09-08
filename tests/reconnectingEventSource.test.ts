import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import { reconnectingEventSource } from '../client/reconnectingEventSource';

class TestEventSource {
    static readonly CLOSED = 2;
    static instances: TestEventSource[] = [];
    readyState = 0;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onopen: (() => void) | null = null;
    onerror: (() => void) | null = null;

    constructor(readonly url: string) {
        TestEventSource.instances.push(this);
    }

    close() {
        this.readyState = TestEventSource.CLOSED;
    }

    fail() {
        this.readyState = TestEventSource.CLOSED;
        this.onerror?.();
    }
}

const originalEventSource = globalThis.EventSource;
let subscription: ReturnType<typeof reconnectingEventSource> | undefined;

beforeEach(() => {
    jest.useFakeTimers();
    TestEventSource.instances = [];
    globalThis.EventSource = TestEventSource as unknown as typeof EventSource;
});

afterEach(() => {
    subscription?.close();
    subscription = undefined;
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    if (originalEventSource !== undefined) globalThis.EventSource = originalEventSource;
    else delete (globalThis as unknown as { EventSource?: typeof EventSource }).EventSource;
});

describe('reconnecting EventSource', () => {
    test('restarts a terminal failure and resumes delivery', () => {
        const messages: string[] = [];
        subscription = reconnectingEventSource('/stream', data => messages.push(data));
        TestEventSource.instances[0].fail();
        TestEventSource.instances[0].fail();
        jest.advanceTimersByTime(1499);
        expect(TestEventSource.instances).toHaveLength(1);
        jest.advanceTimersByTime(1);
        expect(TestEventSource.instances).toHaveLength(2);
        const recovered = TestEventSource.instances[1];
        expect(recovered.url).toBe('/stream');
        recovered.onmessage?.(new MessageEvent('message', { data: 'recovered' }));
        expect(messages).toEqual(['recovered']);
    });

    test('leaves recoverable failures to native reconnection', () => {
        subscription = reconnectingEventSource('/stream', () => {});
        TestEventSource.instances[0].onerror?.();
        jest.advanceTimersByTime(60000);
        expect(TestEventSource.instances).toHaveLength(1);
        expect(TestEventSource.instances[0].readyState).toBe(0);
    });

    test('caps retry backoff and resets it after an open event', () => {
        subscription = reconnectingEventSource('/stream', () => {});
        for (const delay of [1500, 3000, 6000, 12000, 24000, 30000, 30000]) {
            const count = TestEventSource.instances.length;
            TestEventSource.instances[count - 1].fail();
            jest.advanceTimersByTime(delay - 1);
            expect(TestEventSource.instances).toHaveLength(count);
            jest.advanceTimersByTime(1);
            expect(TestEventSource.instances).toHaveLength(count + 1);
        }
        const count = TestEventSource.instances.length;
        TestEventSource.instances[count - 1].onopen?.();
        TestEventSource.instances[count - 1].fail();
        jest.advanceTimersByTime(1500);
        expect(TestEventSource.instances).toHaveLength(count + 1);
    });

    test('closing cancels pending retries and detaches callbacks', () => {
        subscription = reconnectingEventSource('/stream', () => {});
        const source = TestEventSource.instances[0];
        source.fail();
        subscription.close();
        jest.advanceTimersByTime(60000);
        expect(TestEventSource.instances).toHaveLength(1);
        expect(source.onmessage).toBeNull();
        expect(source.onerror).toBeNull();
    });
});

describe('worker transports', () => {
    test.each(['header', 'ongoing'])('%s worker recovers and forwards messages', async channel => {
        const postMessage = jest.spyOn(self, 'postMessage').mockImplementation(() => {});
        await jest.isolateModulesAsync(async () => {
            if (channel === 'header') await import('../client/headerRealtimeWorker');
            else await import('../client/ongoingRealtimeWorker');
        });
        TestEventSource.instances[0].fail();
        jest.advanceTimersByTime(1500);
        expect(TestEventSource.instances).toHaveLength(2);
        const source = TestEventSource.instances[1];
        expect(source.url).toBe(channel === 'header' ? '/api/header/subscribe' : '/api/ongoing');
        const message =
            channel === 'header' ? { channel: 'challenges', payload: '{"challenges":[]}' } : '{"gameId":"game0001"}';
        source.onmessage?.(
            new MessageEvent('message', {
                data: typeof message === 'string' ? message : JSON.stringify(message),
            }),
        );
        expect(postMessage).toHaveBeenCalledWith(message);
    });
});
