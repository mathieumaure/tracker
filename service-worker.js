// service-worker.js — cache applicatif pour le mode hors-ligne.
// Stratégie « réseau d'abord » : on sert toujours la dernière version en ligne,
// et on ne se rabat sur le cache que si le réseau est indisponible. Ainsi les
// mises à jour apparaissent immédiatement, tout en gardant le fonctionnement
// hors-ligne. On ne met JAMAIS de données en cache, uniquement les fichiers app.

const CACHE = 'cyclo-v3';
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
  // Les appels à l'API GitHub passent toujours par le réseau, jamais en cache.
  if (url.hostname.endsWith('github.com') || url.hostname.endsWith('githubusercontent.com')) {
    return;
  }
  if (e.request.method !== 'GET') return;

  // Réseau d'abord ; on rafraîchit le cache au passage ; repli cache si hors-ligne.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((c) => c || caches.match('./index.html')))
  );
});
