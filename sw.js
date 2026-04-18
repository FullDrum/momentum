// Momentum Service Worker
const CACHE_NAME = 'momentum-v2';

self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', function(e) {
  // Only handle same-origin requests. Cross-origin requests (Apps Script,
  // Google APIs, etc.) must go directly to the network — the SW cannot
  // proxy them without breaking redirects and CORS.
  var url = new URL(e.request.url);
  if (url.origin !== self.location.origin) {
    return; // let the browser handle it natively
  }
  // For same-origin, just pass through (no caching).
  e.respondWith(fetch(e.request));
});
