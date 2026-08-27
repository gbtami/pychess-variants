export type ProfileRealtimeChannel = 'challenges' | 'notifications' | 'ongoing';

interface RealtimeEventMessage {
    type: 'event';
    channel: ProfileRealtimeChannel;
    data: string;
}

export interface ProfileRealtimeSubscription {
    close: () => void;
}

function workerUrl() {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/static/pychess-variants.js"]');
    const version = script ? new URL(script.src, window.location.href).search : '';
    return `/static/profile-realtime-worker.js${version}`;
}

export function subscribeProfileRealtime(
    channel: ProfileRealtimeChannel,
    onMessage: (data: string) => void,
): ProfileRealtimeSubscription | null {
    if (!('Worker' in window)) return null;

    try {
        const worker = new Worker(workerUrl(), { name: `pychess-profile-${channel}` });
        let closing = false;

        worker.onmessage = event => {
            const message = event.data as RealtimeEventMessage;
            if (!closing && message.type === 'event' && message.channel === channel) onMessage(message.data);
        };
        worker.onerror = event => console.warn('Profile realtime worker error.', event);
        worker.postMessage({ type: 'subscribe', channel });

        return {
            close: () => {
                if (closing) return;
                closing = true;
                worker.terminate();
            },
        };
    } catch (err) {
        console.warn('Failed to start profile realtime worker.', err);
        return null;
    }
}
