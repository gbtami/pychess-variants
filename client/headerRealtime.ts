import { reconnectingEventSource } from './reconnectingEventSource';

export type HeaderRealtimeChannel = 'challenges' | 'notifications';

interface HeaderRealtimeMessage {
    channel: HeaderRealtimeChannel;
    payload: string;
}

export interface HeaderRealtimeSubscription {
    close: () => void;
}

type HeaderRealtimeListener = (payload: string) => void;

// Keep challenges and notifications on one transport. Multiple long-lived SSE
// connections can exhaust Firefox's small HTTP/1.1 per-origin connection pool
// and prevent round/study websocket handshakes from reaching the server.
const listeners: Record<HeaderRealtimeChannel, Set<HeaderRealtimeListener>> = {
    challenges: new Set(),
    notifications: new Set(),
};

let worker: Worker | null = null;
let eventSource: ReturnType<typeof reconnectingEventSource> | null = null;

function workerUrl() {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/static/pychess-variants.js"]');
    const version = script ? new URL(script.src, window.location.href).search : '';
    return `/static/header-realtime-worker.js${version}`;
}

function dispatch(message: HeaderRealtimeMessage) {
    if (message.channel !== 'challenges' && message.channel !== 'notifications') return;
    for (const listener of listeners[message.channel]) {
        try {
            listener(message.payload);
        } catch (err) {
            console.error('Header realtime listener failed.', err);
        }
    }
}

function parseAndDispatch(data: unknown) {
    let message: HeaderRealtimeMessage;
    try {
        message = (typeof data === 'string' ? JSON.parse(data) : data) as HeaderRealtimeMessage;
    } catch {
        return;
    }
    if (!message || typeof message.payload !== 'string') return;
    dispatch(message);
}

function startEventSource() {
    if (eventSource !== null) return;
    eventSource = reconnectingEventSource('/api/header/subscribe', parseAndDispatch);
}

function startTransport() {
    if (worker !== null || eventSource !== null) return;

    if ('Worker' in window) {
        try {
            const nextWorker = new Worker(workerUrl(), { name: 'pychess-header-realtime' });
            nextWorker.onmessage = event => parseAndDispatch(event.data);
            nextWorker.onerror = event => {
                if (worker !== nextWorker) return;
                console.warn('Header realtime worker error; falling back to EventSource.', event);
                worker = null;
                nextWorker.terminate();
                startEventSource();
            };
            worker = nextWorker;
            return;
        } catch (err) {
            console.warn('Failed to start header realtime worker; falling back to EventSource.', err);
        }
    }

    startEventSource();
}

function stopTransportIfUnused() {
    if (listeners.challenges.size !== 0 || listeners.notifications.size !== 0) return;
    worker?.terminate();
    worker = null;
    eventSource?.close();
    eventSource = null;
}

export function subscribeHeaderRealtime(
    channel: HeaderRealtimeChannel,
    onMessage: HeaderRealtimeListener,
): HeaderRealtimeSubscription {
    listeners[channel].add(onMessage);
    startTransport();

    let closed = false;
    return {
        close: () => {
            if (closed) return;
            closed = true;
            listeners[channel].delete(onMessage);
            stopTransportIfUnused();
        },
    };
}
