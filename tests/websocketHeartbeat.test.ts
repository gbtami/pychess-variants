import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import { WebsocketHeartbeatJs } from '../client/socket/socket';

class TestWebSocket {
    static instances: TestWebSocket[] = [];

    onclose: (event: CloseEvent) => void = () => {};
    onerror: (event: Event) => void = () => {};
    onopen: (event: Event) => void = () => {};
    onmessage: (event: MessageEvent) => void = () => {};
    sent: unknown[] = [];
    closeCalls = 0;

    constructor(
        readonly url: string,
        readonly protocols?: string | string[],
    ) {
        TestWebSocket.instances.push(this);
    }

    send(message: unknown) {
        this.sent.push(message);
    }

    close() {
        // Deliberately do not emit onclose: a blackholed connection may not
        // complete its close handshake promptly.
        this.closeCalls++;
    }
}

beforeEach(() => {
    jest.useFakeTimers();
    TestWebSocket.instances = [];
    globalThis.WebSocket = TestWebSocket as unknown as typeof WebSocket;
    document.body.innerHTML = '<time id="reconnecting-ts"></time>';
});

afterEach(() => {
    jest.useRealTimers();
});

describe('WebsocketHeartbeatJs', () => {
    test('directly replaces a socket whose application pong times out', () => {
        const socket = new WebsocketHeartbeatJs({
            url: 'wss://example.test/socket',
            pingTimeout: 2500,
            pongTimeout: 9000,
            reconnectTimeout: 4000,
            pingMsg: '/n',
        });
        let reconnects = 0;
        socket.onreconnect = () => reconnects++;

        const staleSocket = TestWebSocket.instances[0];
        staleSocket.onopen(new Event('open'));

        jest.advanceTimersByTime(2500);
        expect(staleSocket.sent).toEqual(['/n']);

        jest.advanceTimersByTime(9000);
        jest.runOnlyPendingTimers();

        expect(reconnects).toBe(1);
        expect(staleSocket.closeCalls).toBe(1);
        expect(TestWebSocket.instances).toHaveLength(2);
        expect(socket.ws).toBe(TestWebSocket.instances[1]);

        socket.close();
    });
});
