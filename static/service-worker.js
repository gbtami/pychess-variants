const sw = self;

sw.addEventListener('install', () => sw.skipWaiting());

sw.addEventListener('activate', event => {
  event.waitUntil(sw.clients.claim());
});

sw.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    sw.registration.showNotification(data.title || 'pychess.org', {
      body: data.body || '',
      tag: data.tag || 'pychess-notify',
      data: data.payload || {},
      icon: '/static/favicon/android-icon-192x192.png',
      badge: '/static/favicon/favicon-96x96.png',
      requireInteraction: true,
    }),
  );
});

sw.addEventListener('notificationclick', event => {
  event.waitUntil((async () => {
    event.notification.close();
    const payload = event.notification.data || {};
    const targetUrl = typeof payload.url === 'string' ? payload.url : '/';

    const windowClients = await sw.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });

    for (const client of windowClients) {
      const clientUrl = new URL(client.url, sw.location.origin);
      if (clientUrl.pathname === targetUrl && 'focus' in client) {
        await client.focus();
        return;
      }
    }

    for (const client of windowClients) {
      const clientUrl = new URL(client.url, sw.location.origin);
      if (clientUrl.pathname === '/' && 'navigate' in client) {
        await client.navigate(targetUrl);
        await client.focus();
        return;
      }
    }

    await sw.clients.openWindow(targetUrl);
  })());
});
