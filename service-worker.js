/* ═══════════════════════════════════════════════════════════════
   iCU Calc — Service Worker
   Strategy: network-first for everything, with an offline cache
   fallback. Every activation wipes ALL previous cache versions and
   takes control of open tabs immediately, so a deploy is reflected
   on next load with no stale content lingering.

   Bump SW_VERSION on every deploy. v7 → v8 → this is v9
   (v8 shipped with a broken app-shell path; v9 fixes it to index.html).
   ═══════════════════════════════════════════════════════════════ */

const SW_VERSION = 'v9';
const CACHE_NAME = 'icu-calc-' + SW_VERSION;

// App shell — kept small on purpose; everything else is cached
// opportunistically as it's fetched (see fetch handler below).
const APP_SHELL = [
  './index.html',
  './manifest.json',
  './icon-72x72.png',
  './icon-96x96.png',
  './icon-128x128.png',
  './icon-144x144.png',
  './icon-152x152.png',
  './icon-192x192.png',
  './icon-384x384.png',
  './icon-512x512.png'
];

const OFFLINE_FALLBACK = './index.html';

// ─── INSTALL: pre-cache the shell, then activate right away ───
self.addEventListener('install', (event) => {
  self.skipWaiting(); // don't wait for old tabs to close
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch((err) => console.warn('[SW] precache failed:', err))
  );
});

// ─── ACTIVATE: delete every cache that isn't this version, then
//     take control of all open clients immediately ───
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log('[SW] deleting stale cache:', key);
            return caches.delete(key);
          })
      ))
      .then(() => self.clients.claim())
  );
});

// ─── FETCH: network-first, cache as fallback (offline support) ───
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle same-origin GET requests; let everything else
  // (cross-origin fonts, POSTs, etc.) pass straight through.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req, { cache: 'no-store' })
      .then((networkResponse) => {
        const clone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        return networkResponse;
      })
      .catch(() =>
        caches.match(req).then((cached) => {
          if (cached) return cached;
          if (req.mode === 'navigate') return caches.match(OFFLINE_FALLBACK);
          return Response.error();
        })
      )
  );
});

// ─── Allow the page to force an immediate update (optional
//     "Update now" button can postMessage({type:'SKIP_WAITING'})) ───
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
