/// <reference lib="webworker" />

import { reconnectingEventSource } from './reconnectingEventSource';

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
reconnectingEventSource('/api/ongoing', data => workerScope.postMessage(data));

export {};
