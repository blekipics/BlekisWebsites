'use strict';
// Service Worker: legt nur die eigene App-Hülle (statische Dateien) offline ab.
// Es werden KEINE Nutzerdaten gecacht, diese liegen verschlüsselt im localStorage.
const CACHE = 'sparplan-shell-v4';
const SHELL = [
  './', 'index.html', 'css/style.css', 'js/app.js', 'manifest.webmanifest',
  'bilder/icon-192.png', 'bilder/icon-512.png', 'bilder/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match('index.html')))
  );
});
