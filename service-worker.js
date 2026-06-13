// service-worker.js — cache applicatif pour le mode hors-ligne.
// On ne met en cache QUE les fichiers de l'app (jamais de données).

const CACHE = 'cyclo-v1';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/store.js',
  './js/crypto.js',
  './js/gist.js',
  './js/predict.js',
  './js/dates.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Les appels à l'API GitHub passent toujours par le réseau.
  if (url.hostname.endsWith('github.com') || url.hostname.endsWith('githubusercontent.com')) {
    return;
  }
  // Cache d'abord pour les ressources de l'app, repli réseau.
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
