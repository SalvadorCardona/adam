/* global self, caches */
/*
 * Le service worker de l'ancien chemin `/mobile-factory/` (le jeu s'appelle
 * désormais Adam, sous `/adam/`). Le navigateur l'installe à la place de
 * l'ancien : il vide les caches de l'ancien nom, se désinscrit et recharge les
 * pages ouvertes, qui tombent alors sur la page de transfert.
 */

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith('mobile-factory-')) await caches.delete(key);
      await self.registration.unregister();
      for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
    })(),
  );
});
