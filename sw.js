// Service Worker for DDU B.Tech Notes Hub PWA
const CACHE_NAME = 'ddu-notes-pwa-v5';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo.png',
  '/favicon.ico',
  '/favicon.png',
  '/static/css/style.css',
  '/static/js/ddu_data.js',
  '/static/js/auth.js',
  '/static/js/app.js',
  '/static/js/dashboard.js',
  '/static/ddu_kn_notes_logo.png',
  '/static/ddu_official_logo.png',
  '/static/favicon.png',
  '/static/favicon.ico',
  '/static/icon-192.png',
  '/static/icon-512.png'
];

// Install: Cache all core app shell assets
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 [DDU Notes PWA] Pre-caching app shell assets...');
      return cache.addAll(ASSETS_TO_CACHE).catch(err => {
        console.warn('Some assets could not be pre-cached:', err);
      });
    })
  );
});

// Activate: Clean up old caches & claim clients immediately
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('🧹 [DDU Notes PWA] Purging stale cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Network-First falling back to Cache (offline support)
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Skip external origins if any
  if (url.origin !== self.location.origin) return;

  // Skip dynamic API requests
  if (url.pathname.startsWith('/api/')) return;

  e.respondWith(
    fetch(e.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Fallback to cache when offline
        return caches.match(e.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (e.request.headers.get('accept') && e.request.headers.get('accept').includes('text/html')) {
            return caches.match('/index.html') || caches.match('/');
          }
        });
      })
  );
});
