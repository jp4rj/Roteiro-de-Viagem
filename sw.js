// Service Worker — cacheia app shell + jsPDF, e faz fallback para fotos offline
const CACHE_NAME = 'viagem-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.all(
        APP_SHELL.map(url =>
          cache.add(url).catch(() => null) // não quebra se um recurso falhar
        )
      );
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  // Só GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Fotos da Wikipedia: cache-first (evita rebaixar toda hora)
  if (url.hostname.includes('wikipedia.org') || url.hostname.includes('wikimedia.org')) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(resp => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, clone));
          }
          return resp;
        }).catch(() => new Response('', { status: 404 }));
      })
    );
    return;
  }

  // jsPDF e CDN: cache-first
  if (url.hostname.includes('cloudflare') || url.hostname.includes('cdnjs')) {
    event.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(resp => {
        if (resp.ok) caches.open(CACHE_NAME).then(c => c.put(req, resp.clone()));
        return resp;
      }))
    );
    return;
  }

  // App shell: network-first, fallback cache (HTML sempre fresco quando online)
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req).then(resp => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone));
        }
        return resp;
      }).catch(() => caches.match(req).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  // Resto: network normal
});
