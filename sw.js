// Wildbound service worker: cache the app shell so it opens offline once installed to the home screen.
const CACHE = 'wildbound-v3';
const SHELL = ['./', 'index.html', 'css/styles.css', 'vendor/three.min.js', 'manifest.webmanifest', 'icons/icon.svg',
  'js/app.js', 'js/data.js', 'js/engine.js', 'js/geo.js', 'js/map3d.js', 'js/gmaps.js', 'js/tracker.js', 'js/store.js', 'js/sync.js'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // Network first (fresh code when online), cache as fallback (offline).
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
