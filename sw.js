// sw.js — dexipurei-galore service worker. No build step → runtime caching only.
//   navigations            → NetworkFirst (fresh ?v= fingerprints) → cached page → offline.html
//   same-origin GET assets → StaleWhileRevalidate (the ?v= token makes each build's URLs unique, so
//                            cached entries can never go stale within a build)
//   cross-origin (fonts)   → CacheFirst
// Update UX: never skipWaiting() on its own — the page asks via a SKIP_WAITING message (update toast).

const VERSION = 'v1';
const CACHE = 'dexipurei-' + VERSION;
const OFFLINE_URL = 'offline.html';
const PRECACHE = ['offline.html', 'manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    if (self.registration.navigationPreload) { try { await self.registration.navigationPreload.enable(); } catch (err) {} }
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('dexipurei-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // HTML navigations → network-first, fall back to cached page, then offline.html
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const net = (await e.preloadResponse) || (await fetch(req));
        const c = await caches.open(CACHE); c.put(req, net.clone());
        return net;
      } catch (err) {
        const c = await caches.open(CACHE);
        return (await c.match(req)) || (await c.match(OFFLINE_URL)) || Response.error();
      }
    })());
    return;
  }

  // cross-origin (Google Fonts, etc.) → cache-first
  if (url.origin !== self.location.origin) {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      try { const net = await fetch(req); if (net.ok || net.type === 'opaque') c.put(req, net.clone()); return net; }
      catch (err) { return hit || Response.error(); }
    }));
    return;
  }

  // same-origin assets → stale-while-revalidate
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(req);
    const fetching = fetch(req)
      .then((net) => { if (net && net.ok) c.put(req, net.clone()); return net; })
      .catch(() => hit);
    return hit || fetching;
  }));
});
