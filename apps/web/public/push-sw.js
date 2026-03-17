const sw = self;

/** @typedef {Object} PushPayload
 * @property {string} title
 * @property {string} body
 * @property {string} [icon]
 * @property {string} [badge]
 * @property {string} [url]
 * @property {Record<string, unknown>} [data]
 * @property {string} [tag]
 * @property {boolean} [requireInteraction]
 * @property {boolean} [silent]
 */

sw.addEventListener('install', (event) => {
    console.log('[Push Service Worker] Installing...');
    sw.skipWaiting();
});

sw.addEventListener('activate', (event) => {
    console.log('[Push Service Worker] Activating...');
    event.waitUntil(sw.clients.claim());
});

sw.addEventListener('push', (event) => {
    console.log('[Push Service Worker] Push event received');

    /** @type {PushPayload} */
    let data;

    try {
        data = event.data?.json();
    } catch (error) {
        console.error('[Push Service Worker] Failed to parse push data:', error);
        return;
    }

    const options = {
        body: data.body,
        icon: data.icon || '/assets/woolet-icon.png',
        badge: data.badge || '/assets/woolet-icon.png',
        tag: data.tag || `notification-${Date.now()}`,
        requireInteraction: data.requireInteraction || false,
        silent: data.silent || false,
        data: {
            url: data.url || '/notifications',
            ...data.data,
        },
        actions: [
            {
                action: 'open',
                title: 'Open',
                icon: '/assets/woolet-icon.png',
            },
            {
                action: 'dismiss',
                title: 'Dismiss',
                icon: '/assets/woolet-icon.png',
            },
        ],
    };

    event.waitUntil(
        sw.registration.showNotification(data.title, options)
    );
});

sw.addEventListener('notificationclick', (event) => {
    console.log('[Push Service Worker] Notification click:', event.action);

    event.notification.close();

    const url = new URL(event.notification.data?.url || '/notifications', self.location.origin).href;

    if (event.action === 'dismiss') {
        return;
    }

    event.waitUntil(
        sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // 1. Try to find any existing window from our app and tell it to navigate
            for (const client of clientList) {
                if ('focus' in client && 'postMessage' in client) {
                    client.focus();
                    client.postMessage({
                        type: 'NAVIGATE',
                        url: url
                    });
                    return;
                }
            }

            // 2. Otherwise open a new window
            return sw.clients.openWindow(url);
        })
    );
});

sw.addEventListener('notificationclose', (event) => {
    console.log('[Push Service Worker] Notification closed:', event.notification.tag);
});

sw.addEventListener('pushsubscriptionchange', (event) => {
    console.log('[Push Service Worker] Push subscription changed');
    // Subscription change handling is done on the client side
});
