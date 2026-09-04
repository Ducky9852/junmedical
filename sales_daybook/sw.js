// Service Worker for Junmedical MEDI-SALES 360° PWA
const CACHE_NAME = 'medi-sales-cache-jun-V1-017';
const ASSETS_TO_CACHE = [
  './sales.html',
  './index.html',
  './app.css',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('⚡ [ServiceWorker] Pre-caching PWA App Assets (v31)');
      return cache.addAll(ASSETS_TO_CACHE).catch(err => console.warn('Cache prefetch error:', err));
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('🧹 [ServiceWorker] Purging old cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Always network first for DB and scripts to prevent stale data
  if (event.request.method === 'GET') {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((response) => {
          if (response && response.status === 200 && !event.request.url.includes('sales_database.js')) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  }
});
