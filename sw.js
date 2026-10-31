const CACHE_NAME = 'momentum-v41';
const APP_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './core.js',
  './app.js',
  './task-conversation.js',
  './voice-capture.js',
  './audio-capture.js',
  './mobile-viewport.js',
  './task-conversation.css',
  './task-memory.js',
  './task-relations.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  // Activate the new version as soon as its cache is populated, so a refresh
  // always picks up the latest assets instead of waiting on the update banner.
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_ASSETS)));
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )),
      self.clients.claim()
    ])
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          var appRoot = new URL('./', self.location.href).pathname;
          var cacheKey = url.pathname === appRoot || url.pathname === appRoot + 'index.html' ? './index.html' : event.request;
          if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(cacheKey, response.clone()));
          return response;
        })
        .catch(() => {
          var appRoot = new URL('./', self.location.href).pathname;
          return caches.match(url.pathname === appRoot || url.pathname === appRoot + 'index.html' ? './index.html' : event.request);
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
      return response;
    }))
  );
});
