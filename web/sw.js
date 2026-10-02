// Service worker: keeps the app in the browser cache so that, once installed, it starts even without the server running.
// Network first (if the server is running you always get the current version), otherwise the last cached state.
const CACHE = 'glotz3r-v2';
self.addEventListener('install', e => {
  self.skipWaiting();
  // Each file on its own: a missing one (e.g. config.json on a plain web server) must not abort the installation.
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(['./', 'config.json', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'].map(u => c.add(u)))));
});
// Remove caches of earlier names/versions, otherwise caches.match serves the old state when offline.
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  // Only the app itself and hls.js; Jellyfin, YouTube and local videos (blob:) pass through untouched.
  if (e.request.method !== 'GET' || !u.protocol.startsWith('http') || (u.origin !== location.origin && u.hostname !== 'cdn.jsdelivr.net')) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok || r.type === 'opaque') { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(async () => (await caches.match(e.request)) || Response.error()));
});
