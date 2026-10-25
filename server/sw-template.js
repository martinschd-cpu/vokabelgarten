// Service Worker von Vokabelgarten. Wird vom Server mit Version und Dateiliste befüllt.
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const SHELL_CACHE = `vg-shell-${VERSION}`;
const RUNTIME_CACHE = 'vg-runtime-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('vg-shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(caches.match('/', { cacheName: SHELL_CACHE }).then((r) => r || fetch(request)));
    return;
  }
  const cacheName = url.pathname.startsWith('/vendor/tesseract/') ? RUNTIME_CACHE : SHELL_CACHE;
  event.respondWith(cacheFirst(request, cacheName));
});

self.addEventListener('message', (event) => {
  if (event.data === 'version') event.source?.postMessage({ version: VERSION });
});
