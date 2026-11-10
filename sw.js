// Service Worker para Microevaluación A5 (PWA) — v3.10.164
// Arquitectura Offline Total (Pre-Caché + Resiliencia de Aula + Cero Dependencias Externas)
const CACHE_NAME = 'microeval-cache-v3.10.164';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './styles-core.css',
  './styles-header.css',
  './styles-wizard.css',
  './styles-print.css',
  './styles-booklet.css',
  './styles-scanner.css',
  './styles-hub.css',
  './styles-simulator.css',
  './styles-blueprint.css',
  './styles-copilot.css',
  './manifest.json',
  './icon-192.png',
  // Librerías de soporte (100% locales / self-hosted)
  './supabase.min.js',
  './xlsx.full.min.js',
  './jszip.min.js',
  './jspdf.umd.min.js',
  './gsap.min.js',
  './ScrollTrigger.min.js',
  './three.min.js',
  './qrcode.bundle.js',
  './aruco.bundle.js',
  './jsqr.min.js',
  // Módulos de la aplicación
  './classroom-data.js',
  './classroom-bank-data.js',
  './classroom-session-data.js',
  './supabase-client.js',
  './supabase-ai-service.js',
  './roi-processor.js',
  './scanner.js',
  './scanner-result-modal.js',
  './results-manager.js',
  './classroom-importer.js',
  './classroom-roster.js',
  './classroom-manual-form.js',
  './classroom-manager.js',
  './bank-tools-math.js',
  './bank-ai-rubric.js',
  './bank-manager-modal.js',
  './bank-manager-form.js',
  './question-bank.js',
  './sim-card-layout.js',
  './sim-card-picker.js',
  './card-simulator.js',
  './card-builder-focalizada.js',
  './card-exam-builder.js',
  './card-formativa.js',
  './card-focalizada.js',
  './card-cartilla.js',
  './card-booklet-pdf.js',
  './card-sheets-print.js',
  './card-generator.js',
  './session-saved-manager.js',
  './session-summary-view.js',
  './session-controller.js',
  './app-scroll-effects.js',
  './app-navigation.js',
  './copilot-analytics.js',
  './copilot-ai.js',
  './copilot-command.js',
  './daily-quota.js',
  './evaluation-hologram.js',
  './modals-classroom.js',
  './modals-sim-picker.js',
  './modals-bank.js',
  './license-pro-manager.js',
  './aula-bridge.js',
  './qr-yape.png',
  './qr-yape.jpg'
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

  // Navegación principal (HTML): Network-First para reflejar actualizaciones de GitHub de inmediato
  if (event.request.mode === 'navigate' || url.pathname.endsWith('index.html') || url.pathname.endsWith('/')) {
    event.respondWith(
      fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const resClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
        }
        return networkResponse;
      }).catch(() => {
        return caches.match(event.request).then((cached) => cached || caches.match('./index.html'));
      })
    );
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
        }).catch(() => {/* Modo offline: ignora fallo de red silenciosamente */ });

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
