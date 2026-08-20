const LAST_REDIRECT_KEY = 'tournament-last-redirect';
const JUST_NOTIFIED_KEY = 'tournament-just-notified';
const NOTIFICATION_DEDUP_MS = 1000;

function storageGet(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function storageSet(key: string, value: string): void {
    try {
        localStorage.setItem(key, value);
    } catch {
        // Cross-tab coordination is best-effort. Never let storage failures
        // prevent a player from being sent to their game.
    }
}

export function redirectFirst(gameId: string, redirect: () => void, rightNow = false): void {
    const delay = rightNow || document.hasFocus() ? 10 : 1000 + Math.random() * 500;

    window.setTimeout(() => {
        if (storageGet(LAST_REDIRECT_KEY) === gameId) return;
        storageSet(LAST_REDIRECT_KEY, gameId);
        redirect();
    }, delay);
}

export function notifyTournamentStarting(body: string): void {
    if (document.hasFocus() || !('Notification' in window) || Notification.permission !== 'granted') return;

    window.setTimeout(
        () => {
            if (document.hasFocus()) return;

            const now = Date.now();
            const lastNotified = Number(storageGet(JUST_NOTIFIED_KEY) ?? 0);
            if (now - lastNotified < NOTIFICATION_DEDUP_MS) return;
            storageSet(JUST_NOTIFIED_KEY, String(now));

            const notification = new Notification('pychess.org', {
                body,
                icon: '/static/favicon/android-icon-192x192.png',
            });
            notification.onclick = () => window.focus();
        },
        10 + Math.random() * 500,
    );
}
