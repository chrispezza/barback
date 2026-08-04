// Shell-cache service worker: the app opens away from the LAN (store aisle),
// where index.html would otherwise be unreachable. Deliberately minimal —
// hashed assets cache-first, navigations network-first with cached fallback,
// API and search NEVER cached (stale stock data is worse than none; the list
// fallback is the localStorage snapshot, clearly stamped). Full offline sync
// is a separate decision — see README "A note before exposing this".
const CACHE = 'barback-shell-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/bar/') || url.pathname.startsWith('/search/')) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (event.request.mode === 'navigate') {
        try {
          const fresh = await fetch(event.request);
          await cache.put('/index.html', fresh.clone());
          return fresh;
        } catch {
          const cached = await cache.match('/index.html');
          return cached ?? Response.error();
        }
      }
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const fresh = await fetch(event.request);
      if (fresh.ok) await cache.put(event.request, fresh.clone());
      return fresh;
    })(),
  );
});
