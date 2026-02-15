function setPcfpCookie(): void {
    if (typeof document === 'undefined' || typeof navigator === 'undefined') return;

    const nav = navigator as Navigator & { deviceMemory?: number };
    const screenInfo = window.screen ?? {};
    let tz = '';

    try {
        tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
    } catch (_error) {
        tz = '';
    }

    const parts = [
        String(nav.platform ?? ''),
        String(nav.language ?? ''),
        String(nav.hardwareConcurrency ?? ''),
        String(nav.deviceMemory ?? ''),
        String(screenInfo.width ?? ''),
        String(screenInfo.height ?? ''),
        String(screenInfo.colorDepth ?? ''),
        String(window.devicePixelRatio ?? ''),
        String(tz),
    ];

    const raw = parts.join('|').slice(0, 384);
    document.cookie = `pcfp=${encodeURIComponent(raw)}; Max-Age=2592000; Path=/; SameSite=Lax`;
}

setPcfpCookie();
