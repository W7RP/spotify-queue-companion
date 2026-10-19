// Never cache account data, keys, pages, or queue writes. No background replay.
const iconCache = 'qc-icons-v2';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
 await Promise.all((await caches.keys()).filter(name => name.startsWith('qc-icons-') && name !== iconCache).map(name => caches.delete(name)));
 await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
 const url = new URL(event.request.url);
 if (event.request.method !== 'GET' || url.origin !== self.location.origin || !/^\/(?:icon-(?:192|512|maskable-512)\.png|apple-touch-icon\.png|favicon\.(?:svg|png|ico))$/.test(url.pathname)) return;
 event.respondWith(caches.open(iconCache).then(async cache => { const cached = await cache.match(event.request); if (cached) return cached; const response = await fetch(event.request); if (response.ok) await cache.put(event.request, response.clone()); return response; }));
});
