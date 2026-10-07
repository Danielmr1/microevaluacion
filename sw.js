// Service Worker para Microevaluación A5 (PWA) — v3.1.37
// Arquitectura Offline Total (Pre-Caché + Resiliencia de Aula + Cero Dependencias Externas)
const CACHE_NAME = 'microeval-cache-v3.1.37';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './styles.css?v=3.1.37',
  './manifest.json',
  './icon-192.png',
  // Librerías de soporte (100% locales / self-hosted)
  './supabase.min.js',
  './xlsx.full.min.js',
  './jszip.min.js',
  './aruco.bundle.js?v=3.0.6',
  './jsqr.min.js?v=3.0.6',
  './warp_math.js',
  // Módulos de la aplicación
  './classroom-data.js?v=3.1.37',
  './supabase-client.js?v=3.1.37',
  './roi-processor.js?v=3.1.37',
  './scanner.js?v=3.1.37',
  './results-manager.js?v=3.1.37',
  './classroom-manager.js?v=3.1.37',
  './question-bank.js?v=3.1.37',
  './card-generator.js?v=3.1.37'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[PWA SW] Pre-cache warning:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Las peticiones a APIs de Supabase y Gemini van siempre a la red
  if (url.hostname.includes('supabase.co') || url.hostname.includes('googleapis.com')) {
    return;
  }

  // Estrategia Cache-First con actualización en segundo plano para recursos estáticos locales
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // En segundo plano revalida si hay conexión sin retrasar la respuesta al usuario
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {/* Modo offline: ignora fallo de red silenciosamente */});

        return cachedResponse;
      }

      // Si no estaba en caché, intenta obtener de la red y guarda en caché
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        // Fallback final: si navega a una página y no hay red, servir index.html cacheado
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
