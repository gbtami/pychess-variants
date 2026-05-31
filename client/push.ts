function base64UrlToArrayBuffer(base64Url: string): ArrayBuffer {
    const base64 = (base64Url + '==='.slice((base64Url.length + 3) % 4))
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const raw = atob(base64);
    const output = new Uint8Array(raw.length);
    for (let index = 0; index < raw.length; index += 1) {
        output[index] = raw.charCodeAt(index);
    }
    return output.buffer as ArrayBuffer;
}

async function postSubscription(subscription: PushSubscription): Promise<void> {
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
}

async function postUnsubscribe(endpoint: string): Promise<void> {
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
}

export async function initPushSubscription(anon: string, vapidPublicKey: string): Promise<void> {
    if (
        anon === 'True' ||
        !vapidPublicKey ||
        !('serviceWorker' in navigator) ||
        !('PushManager' in window) ||
        !('Notification' in window)
    ) {
        return;
    }

    const lastSyncedKey = 'push-subscribed';
    // Keep subscription metadata in sync periodically in case browser keys rotate
    // or a service worker update invalidates stored endpoint details server-side.
    const syncWindowMs = 12 * 60 * 60 * 1000;
    const stored = Number(localStorage.getItem(lastSyncedKey) || 0);
    const needsResync = stored + syncWindowMs < Date.now();

    let newSubscription: PushSubscription | null = null;

    try {
        const registration = await navigator.serviceWorker.register('/service-worker.js', {
            scope: '/',
            updateViaCache: 'all',
        });

        if (Notification.permission !== 'granted') {
            return;
        }

        const existingSubscription = await registration.pushManager.getSubscription();
        if (existingSubscription && !needsResync) {
            return;
        }

        newSubscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64UrlToArrayBuffer(vapidPublicKey),
        });

        await postSubscription(newSubscription);
        localStorage.setItem(lastSyncedKey, `${Date.now()}`);
    } catch (error) {
        console.error('Failed to initialize web push subscription', error);
        if (newSubscription !== null) {
            try {
                await newSubscription.unsubscribe();
            } catch {
                // Ignore unsubscribe errors.
            }
        }
    }
}

export async function disablePushSubscription(): Promise<void> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        return;
    }

    try {
        // Iterate all registrations so we clean up even if a browser keeps multiple
        // service worker registrations during updates.
        const registrations = await navigator.serviceWorker.getRegistrations();
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
            } catch (error) {
                console.warn('Failed to remove browser push subscription', error);
            }
        }
        localStorage.removeItem('push-subscribed');
    } catch (error) {
        console.warn('Failed to disable push subscription', error);
    }
}
