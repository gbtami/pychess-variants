/// <reference lib="webworker" />

import { reconnectingEventSource } from './reconnectingEventSource';

interface HeaderRealtimeMessage {
    channel: 'challenges' | 'notifications';
    payload: string;
}

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
reconnectingEventSource('/api/header/subscribe', data => {
    let message: HeaderRealtimeMessage;
    try {
        message = JSON.parse(data) as HeaderRealtimeMessage;
    } catch {
        return;
    }
    if (
        (message.channel === 'challenges' || message.channel === 'notifications') &&
        typeof message.payload === 'string'
    ) {
        workerScope.postMessage(message);
    }
});

export {};
