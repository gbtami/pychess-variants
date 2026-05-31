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
