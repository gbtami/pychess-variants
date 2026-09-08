import { reconnectingEventSource } from './reconnectingEventSource';

export interface OngoingRealtimeSubscription {
    close: () => void;
}

type OngoingRealtimeListener = (payload: string) => void;

// A page may have several ongoing-game consumers (lobby boards, correspondence
// sideboards, user mini-board). They must share one SSE transport rather than
// consuming one HTTP/1.1 connection per consumer.
const listeners = new Set<OngoingRealtimeListener>();
let worker: Worker | null = null;
let eventSource: ReturnType<typeof reconnectingEventSource> | null = null;

function workerUrl() {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/static/pychess-variants.js"]');
    const version = script ? new URL(script.src, window.location.href).search : '';
    return `/static/ongoing-realtime-worker.js${version}`;
}

function dispatch(payload: unknown) {
    if (typeof payload !== 'string') return;
    for (const listener of listeners) {
        try {
            listener(payload);
        } catch (err) {
            console.error('Ongoing realtime listener failed.', err);
        }
    }
}

function startEventSource() {
    if (eventSource !== null) return;
    eventSource = reconnectingEventSource('/api/ongoing', dispatch);
}

function startTransport() {
    if (worker !== null || eventSource !== null) return;

    if ('Worker' in window) {
        try {
            const nextWorker = new Worker(workerUrl(), { name: 'pychess-ongoing-realtime' });
            nextWorker.onmessage = event => dispatch(event.data);
            nextWorker.onerror = event => {
                if (worker !== nextWorker) return;
                console.warn('Ongoing realtime worker error; falling back to EventSource.', event);
                worker = null;
                nextWorker.terminate();
                startEventSource();
            };
            worker = nextWorker;
            return;
        } catch (err) {
            console.warn('Failed to start ongoing realtime worker; falling back to EventSource.', err);
        }
    }

    startEventSource();
}

function stopTransportIfUnused() {
    if (listeners.size !== 0) return;
    worker?.terminate();
    worker = null;
    eventSource?.close();
    eventSource = null;
}

export function subscribeOngoingRealtime(onMessage: OngoingRealtimeListener): OngoingRealtimeSubscription {
    listeners.add(onMessage);
    startTransport();

    let closed = false;
    return {
        close: () => {
            if (closed) return;
            closed = true;
            listeners.delete(onMessage);
            stopTransportIfUnused();
        },
    };
}
