function base64UrlToArrayBuffer(base64Url: string): ArrayBuffer {
    const base64 = (base64Url + '==='.slice((base64Url.length + 3) % 4)).replace(/-/g, '+').replace(/_/g, '/');

    const raw = atob(base64);
    const output = new Uint8Array(raw.length);
    for (let index = 0; index < raw.length; index += 1) {
        output[index] = raw.charCodeAt(index);
    }
    return output.buffer as ArrayBuffer;
}

function equalUint8Arrays(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let index = 0; index < a.length; index += 1) {
        if (a[index] !== b[index]) return false;
    }
    return true;
}

function asUint8Array(value: BufferSource): Uint8Array {
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function pushDebugEnabled(): boolean {
    try {
        return localStorage.getItem('push-debug') === 'true';
    } catch {
        return false;
    }
}

function pushDebugLog(message: string, details?: unknown): void {
    if (!pushDebugEnabled()) return;
    if (details === undefined) {
        console.info(`[push-debug] ${message}`);
    } else {
        console.info(`[push-debug] ${message}`, details);
    }
}

async function postSubscription(subscription: PushSubscription): Promise<void> {
    pushDebugLog('POST /push/subscribe', { endpoint: subscription.endpoint });
    const response = await fetch('/push/subscribe', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(subscription),
        credentials: 'same-origin',
    });

    if (!response.ok || response.redirected) {
        throw new Error(`push subscribe failed: ${response.status}`);
    }
    pushDebugLog('Subscription persisted server-side', { status: response.status });
}

async function postUnsubscribe(endpoint: string): Promise<void> {
    pushDebugLog('POST /push/unsubscribe', { endpoint });
    const response = await fetch('/push/unsubscribe', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ endpoint }),
        credentials: 'same-origin',
    });

    if (!response.ok || response.redirected) {
        throw new Error(`push unsubscribe failed: ${response.status}`);
    }
    pushDebugLog('Unsubscribe persisted server-side', { status: response.status });
}

export async function initPushSubscription(anon: string, vapidPublicKey: string): Promise<void> {
    if (anon === 'True') {
        pushDebugLog('Skipping push init: anonymous user');
        return;
    }
    if (!vapidPublicKey) {
        pushDebugLog('Skipping push init: empty VAPID public key');
        return;
    }
    if (!('serviceWorker' in navigator)) {
        pushDebugLog('Skipping push init: browser has no serviceWorker support');
        return;
    }
    if (!('PushManager' in window)) {
        pushDebugLog('Skipping push init: browser has no PushManager support');
        return;
    }
    if (!('Notification' in window)) {
        pushDebugLog('Skipping push init: browser has no Notification support');
        return;
    }

    const lastSyncedKey = 'push-subscribed';
    // Keep subscription metadata in sync periodically in case browser keys rotate
    // or a service worker update invalidates stored endpoint details server-side.
    const syncWindowMs = 12 * 60 * 60 * 1000;
    const stored = Number(localStorage.getItem(lastSyncedKey) || 0);
    const needsResync = stored + syncWindowMs < Date.now();
    pushDebugLog('Push init started', {
        permission: Notification.permission,
        needsResync,
        lastSyncedAt: stored || null,
    });

    let newSubscription: PushSubscription | null = null;
    const desiredServerKey = new Uint8Array(base64UrlToArrayBuffer(vapidPublicKey));

    try {
        const registration = await navigator.serviceWorker.register('/service-worker.js', {
            scope: '/',
            updateViaCache: 'all',
        });
        pushDebugLog('Service worker registration ok', {
            scope: registration.scope,
        });

        if (Notification.permission !== 'granted') {
            pushDebugLog('Skipping push subscribe: Notification permission is not granted', {
                permission: Notification.permission,
            });
            return;
        }

        const existingSubscription = await registration.pushManager.getSubscription();
        const existingServerKey = existingSubscription?.options?.applicationServerKey ?? null;
        const keyMismatch = existingServerKey
            ? !equalUint8Arrays(asUint8Array(existingServerKey), desiredServerKey)
            : true;

        if (existingSubscription && !needsResync && !keyMismatch) {
            pushDebugLog('Existing subscription is fresh; re-syncing server-side record', {
                endpoint: existingSubscription.endpoint,
            });
            await postSubscription(existingSubscription);
            localStorage.setItem(lastSyncedKey, `${Date.now()}`);
            pushDebugLog('Existing subscription found and still fresh; no re-subscribe', {
                endpoint: existingSubscription.endpoint,
            });
            return;
        }
        if (existingSubscription && keyMismatch) {
            pushDebugLog('Existing subscription server key mismatch; renewing subscription', {
                endpoint: existingSubscription.endpoint,
            });

            try {
                await postUnsubscribe(existingSubscription.endpoint);
            } catch (error) {
                console.warn('Failed to remove stale server-side push subscription', error);
            }

            try {
                await existingSubscription.unsubscribe();
            } catch (error) {
                console.warn('Failed to remove stale browser push subscription', error);
            }
        } else if (existingSubscription && needsResync) {
            pushDebugLog('Existing subscription found but resync window elapsed; renewing');
        } else {
            pushDebugLog('No existing subscription found; creating one');
        }

        newSubscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64UrlToArrayBuffer(vapidPublicKey),
        });
        pushDebugLog('PushManager.subscribe() ok', { endpoint: newSubscription.endpoint });

        await postSubscription(newSubscription);
        localStorage.setItem(lastSyncedKey, `${Date.now()}`);
        pushDebugLog('Push subscription initialization completed');
    } catch (error) {
        console.error('Failed to initialize web push subscription', error);
        pushDebugLog('Push subscription initialization failed', error);
        if (newSubscription !== null) {
            try {
                await newSubscription.unsubscribe();
                pushDebugLog('Rolled back failed browser subscription');
            } catch {
                // Ignore unsubscribe errors.
            }
        }
    }
}

export async function disablePushSubscription(): Promise<void> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        pushDebugLog('Skipping push disable: serviceWorker/PushManager not supported');
        return;
    }

    try {
        // Iterate all registrations so we clean up even if a browser keeps multiple
        // service worker registrations during updates.
        const registrations = await navigator.serviceWorker.getRegistrations();
        pushDebugLog('Disabling push subscriptions for registrations', { count: registrations.length });
        for (const registration of registrations) {
            const existingSubscription = await registration.pushManager.getSubscription();
            if (!existingSubscription) continue;

            try {
                await postUnsubscribe(existingSubscription.endpoint);
            } catch (error) {
                console.warn('Failed to remove server-side push subscription', error);
            }

            try {
                await existingSubscription.unsubscribe();
                pushDebugLog('Removed browser push subscription', {
                    endpoint: existingSubscription.endpoint,
                });
            } catch (error) {
                console.warn('Failed to remove browser push subscription', error);
            }
        }
        localStorage.removeItem('push-subscribed');
        pushDebugLog('Push disable flow completed');
    } catch (error) {
        console.warn('Failed to disable push subscription', error);
        pushDebugLog('Push disable flow failed', error);
    }
}
