// Never cache account data, keys, pages, or queue writes. No background replay.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
 const url = new URL(event.request.url);
 if (event.request.method !== 'GET' || url.origin !== self.location.origin || !/^\/(?:icon-(?:192|512)\.png|apple-touch-icon\.png|favicon\.svg)$/.test(url.pathname)) return;
 event.respondWith(caches.open('qc-icons-v1').then(async cache => { const cached = await cache.match(event.request); if (cached) return cached; const response = await fetch(event.request); if (response.ok) await cache.put(event.request, response.clone()); return response; }));
});
