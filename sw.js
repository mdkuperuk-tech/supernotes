/* SuperNotes service worker — offline shell.

   Serving strategy is network-first for the app's own code, cache-first for
   pictures. The old build served everything cache-first, which meant a fresh
   deploy needed two reloads before it took effect: the first reload handed back
   the cached copy and only refreshed the cache in the background. Network-first
   means an update lands the moment you reload, while the cache still keeps
   everything working with no connection. */
const V = 'supernotes-v9';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './style.css',
  './app.js', './editor.js', './ink.js', './papers.js', './weekly.js',
  './covers.js', './store.js', './drive.js', './pdfout.js', './ui.js',
  './icon-192.png', './icon-512.png', './icon-180.png'
];

const NET_TIMEOUT = 3500;   // fall back to cache rather than sit on a dead network

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(V);
    // {cache:'reload'} skips the browser's own HTTP cache, so a new service
    // worker can never pre-cache the very files it was meant to replace.
    await Promise.all(SHELL.map(u =>
      fetch(new Request(u, { cache: 'reload' }))
        .then(r => (r.ok ? c.put(u, r) : null))
        .catch(() => null)
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

const isCode = p => /\.(?:js|css|webmanifest)$/.test(p) || p.endsWith('/') || p.endsWith('.html');

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // never touch Google auth / API traffic
  if (/googleapis\.com|accounts\.google\.com|gstatic\.com/.test(url.hostname)) return;
  if (url.origin !== location.origin) return;

  // Pictures and icons never change under a given name — cache-first is right.
  if (!isCode(url.pathname)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const cp = res.clone(); caches.open(V).then(c => c.put(req, cp)); }
      return res;
    })));
    return;
  }

  // App code: newest wins, with the cache as the safety net.
  e.respondWith((async () => {
    try {
      const res = await Promise.race([
        fetch(req, { cache: 'no-cache' }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), NET_TIMEOUT))
      ]);
      if (res && res.ok) { const cp = res.clone(); caches.open(V).then(c => c.put(req, cp)); }
      return res;
    } catch {
      return (await caches.match(req)) || (await caches.match('./index.html'));
    }
  })());
});
