/* sw.js - Service Worker for background push notifications */

self.addEventListener('push', (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { message: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Notification';
  const options = {
    body: payload.message || '',
    icon: payload.icon || '/favicon.ico',
    badge: payload.badge || '/favicon.ico',
    data: {
      url: payload.url || payload.onClickUrl || '/',
      type: payload.type || null,
      id: payload.id || null,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = event?.notification?.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Try to focus an existing tab
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) return client.focus();
      }

      // Otherwise open a new tab
      if (clients.openWindow) return clients.openWindow(urlToOpen);
      return undefined;
    })
  );
});

