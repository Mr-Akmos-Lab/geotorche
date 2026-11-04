// GéoTorche : fonctionnement hors connexion
const C = 'geotorche-v3';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C && x !== 'geotorche-partage').map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  // « Partager > GéoTorche » depuis WhatsApp : on garde le fichier reçu, puis on ouvre l'application
  if (e.request.method === 'POST' && u.origin === location.origin && u.pathname.endsWith('/partage')) {
    e.respondWith((async () => {
      try {
        const fd = await e.request.formData();
        const cache = await caches.open('geotorche-partage');
        let i = 0;
        for (const f of fd.getAll('capsule')) if (f && typeof f !== 'string') await cache.put(new URL('partage-recu-' + Date.now() + '-' + (i++), self.registration.scope).href, new Response(f));
      } catch (err) { /* rien reçu */ }
      return Response.redirect(new URL('./?partage=1', self.registration.scope).href, 303);
    })());
    return;
  }
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(C).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html'))));
});
