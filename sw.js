// Lets Between the Slides work offline once installed (or visited once).
// The app itself is fetched fresh when online, so updates arrive straight away; the libraries it uses never change, so they come from the cache.
const CACHE = 'bts-v2';          // a new name clears out the old copy (which could have kept a broken download)
const APP = ['./', './index.html', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png'];
const LIBS = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js',
  'https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js',
];
const LIB_HOSTS = /^(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)$/;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(APP);
    await Promise.all(LIBS.map(u => c.add(u).catch(() => {})));     // a library that can't be fetched now is cached the first time it is used
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('bts-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {                 // the app: fresh when online, saved copy when offline
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        const res = await fetch(req);
        if (res.ok) c.put(req.mode === 'navigate' ? './' : req, res.clone());
        return res;
      } catch {
        return (await c.match(req, {ignoreSearch: true})) || (await c.match('./')) || Response.error();
      }
    })());
  } else if (LIB_HOSTS.test(url.hostname) && !/\.(aff|dic)$/.test(url.pathname)) {   // spell-check dictionaries keep their own cache
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(req);
      if (hit && hit.ok) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());            // only a download known to be good is kept (never an error page)
      return res;
    })());
  }
});
