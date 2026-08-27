/// <reference lib="webworker" />

type Channel = 'challenges' | 'notifications' | 'ongoing';

type WorkerRequest = { type: 'subscribe'; channel: Channel };

const endpoints: Record<Channel, string> = {
    challenges: '/challenge/subscribe',
    notifications: '/notify',
    ongoing: '/api/ongoing',
};

let source: EventSource | null = null;
let channel: Channel | null = null;
let reconnectTimer: number | null = null;

function clearReconnect() {
    if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
}

function connect() {
    if (source !== null || channel === null) return;
    clearReconnect();

    const activeChannel = channel;
    const nextSource = new EventSource(endpoints[activeChannel]);
    nextSource.onmessage = event => {
        workerScope.postMessage({ type: 'event', channel: activeChannel, data: event.data });
    };
    nextSource.onerror = () => {
        nextSource.close();
        if (source === nextSource) source = null;
        if (channel === null || reconnectTimer !== null) return;
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connect();
        }, 1500);
    };
    source = nextSource;
}

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
workerScope.onmessage = event => {
    const message = event.data as WorkerRequest;
    if (message.type !== 'subscribe') return;
    channel = message.channel;
    connect();
};
