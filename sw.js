/* SuperNotes service worker — offline shell */
const V = 'supernotes-v7';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './style.css',
  './app.js', './editor.js', './ink.js', './papers.js', './weekly.js',
  './covers.js', './store.js', './drive.js', './pdfout.js', './ui.js',
  './icon-192.png', './icon-512.png', './icon-180.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // never cache Google auth / API traffic
  if (/googleapis\.com|accounts\.google\.com|gstatic\.com/.test(url.hostname)) return;
  if (url.origin !== location.origin) return;

  e.respondWith(
    caches.match(e.request).then(hit => {
      const net = fetch(e.request).then(res => {
        if (res.ok) { const cp = res.clone(); caches.open(V).then(c => c.put(e.request, cp)); }
        return res;
      }).catch(() => hit || caches.match('./index.html'));
      return hit || net;
    })
  );
});
