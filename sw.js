// Service Worker para Microevaluación A5 (PWA)
const CACHE_NAME = 'microeval-cache-v3.1.29';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Network first con fallback de red para asegurar que siempre cargue la versión más reciente
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
