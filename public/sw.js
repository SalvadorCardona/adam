/* global self */
/*
 * Le service worker de Mobile Factory ne fait qu'une chose : poser les
 * notifications (Android n'accepte que celles d'un service worker) et ramener
 * le jeu au premier plan quand on en touche une. Il ne met rien en cache.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows[0];

      return open ? open.focus() : self.clients.openWindow(self.registration.scope);
    }),
  );
});
