// Service worker: keeps the app in the browser cache so that, once installed, it starts even without the server running.
// Network first (if the server is running you always get the current version), otherwise the last cached state.
// "Network" has to bypass the browser's HTTP cache for the app's own files: fetch() goes through it, and a server without cache
// headers (or GitHub Pages with its 10 minutes) would otherwise hand back the old scripts after an update – Firefox in particular.
const CACHE = 'glotz3r-v6';
self.addEventListener('install', e => {
  self.skipWaiting();
  // Each file on its own: a missing one (e.g. config.json on a plain web server) must not abort the installation.
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(['./', 'style.css', ...['schemes', 'main', 'base', 'i18n', 'look', 'youtube', 'sync', 'detect', 'picture', 'sources', 'link', 'panel', 'jellyfin', 'app'].map(f => `js/${f}.js`), 'config.json', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'].map(u => c.add(new Request(u, { cache: 'reload' }))))));
});
// Remove caches of earlier names/versions, otherwise caches.match serves the old state when offline.
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  // Only the app itself and hls.js; Jellyfin, YouTube and local videos (blob:) pass through untouched.
  // Scope, not origin: a Jellyfin behind the same host (reverse proxy) must not end up in the cache.
  if (e.request.method !== 'GET' || !u.protocol.startsWith('http') || (!u.href.startsWith(registration.scope) && u.hostname !== 'cdn.jsdelivr.net')) return;
  const own = u.href.startsWith(registration.scope); // own files: revalidate every time (a 304 is cheap); hls.js is pinned and immutable
  e.respondWith(fetch(e.request, own ? { cache: 'no-cache' } : {}).then(r => {
    if (r.ok || r.type === 'opaque') { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(async () => (await caches.match(e.request)) || Response.error()));
});
