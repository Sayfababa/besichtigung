// Service Worker: hält die App offline verfügbar.
// Bei jeder neuen Version VERSION erhöhen – dann bekommt das Handy den Hinweis „Neue Version“.
const VERSION = 'v1.1.0';
const CACHE = 'besichtigung-' + VERSION;
const DATEIEN = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/db.js',
  'js/store.js',
  'js/modell.js',
  'js/bild.js',
  'js/pdf.js',
  'js/sync.js',
  'vendor/jspdf.umd.min.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(DATEIEN.map(u => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('besichtigung-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => {
  if (e.data === 'jetzt-aktivieren') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // GitHub-API usw. nicht anfassen
  if (self.location.hostname === 'localhost') return;                     // beim Testen am PC immer frisch laden
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (req.mode === 'navigate') {
      return (await cache.match('index.html')) || fetch(req);
    }
    const treffer = await cache.match(req, { ignoreSearch: true });
    if (treffer) return treffer;
    try {
      return await fetch(req);
    } catch (err) {
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});
