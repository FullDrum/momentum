// Momentum Service Worker
const CACHE_NAME = 'momentum-v1';

self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', function(e) {
  // Just pass through - no offline caching needed since we need live data
  e.respondWith(fetch(e.request));
});
