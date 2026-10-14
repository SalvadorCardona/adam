/* global self, caches, fetch, URL */
/*
 * Le service worker d'Adam fait deux choses.
 *
 * 1. Il pose les notifications (Android n'accepte que celles d'un service
 *    worker) et ramène le jeu au premier plan quand on en touche une.
 * 2. Il met le jeu en cache pour qu'il s'ouvre sans réseau. `vite.config.ts`
 *    remplace `__BUILD__` par la liste des fichiers du build et une version ;
 *    en développement le jeton reste, et le worker ne touche à aucune requête
 *    (le cache ferait mentir le rechargement à chaud).
 *
 * Page : le réseau d'abord, le cache si la connexion manque — une nouvelle
 * version est donc lue dès le lancement suivant. Fichiers (assets au nom
 * haché, sons, polices) : le cache d'abord, puis le réseau, gardé au passage.
 * Les parties en ligne (API, WebSocket) sont d'une autre origine : jamais
 * interceptées.
 */

const BUILD = '__BUILD__';
const BUILT = typeof BUILD === 'object' ? BUILD : null;
const PREFIX = 'adam-';
const CACHE = BUILT ? `${PREFIX}${BUILT.version}` : null;

self.addEventListener('install', (event) => {
  if (BUILT) {
    event.waitUntil(
      caches.open(CACHE).then((cache) => cache.addAll(['', ...BUILT.files].map((file) => new URL(file, self.registration.scope).href))),
    );
  }
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

/** Une réponse qui vaut d'être gardée : réussie, de notre origine. */
const keepable = (response) => response.ok && response.type === 'basic';

async function page(request) {
  const cache = await caches.open(CACHE);

  try {
    const response = await fetch(request);

    if (keepable(response)) void cache.put(request, response.clone());
    return response;
  } catch (error) {
    // Hors ligne : la page demandée (une route de test, `?join=`), sinon l'accueil.
    const cached = await cache.match(request, { ignoreSearch: true });

    return cached ?? (await cache.match(self.registration.scope)) ?? Promise.reject(error);
  }
}

async function file(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);

  if (cached) return cached;
  const response = await fetch(request);

  if (keepable(response)) void cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (!BUILT || request.method !== 'GET' || !request.url.startsWith(self.location.origin) || request.headers.has('range')) return;
  event.respondWith(request.mode === 'navigate' ? page(request) : file(request));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows[0];

      return open ? open.focus() : self.clients.openWindow(self.registration.scope);
    }),
  );
});
