/* MeteoConsenso — service worker
   L'app resta sulla versione installata (funziona anche offline) finché
   non premi "Aggiorna": il tasto compare quando version.json annuncia
   una versione nuova. Non serve cambiare questo file a ogni rilascio.
   Le previsioni (Open-Meteo) non passano di qui: vengono sempre dalla rete
   e l'app tiene l'ultima copia in memoria locale per l'uso offline. */
const CACHE = 'meteoconsenso-app';
const ASSETS = [
  './', './index.html', './widget/', './widget/index.html', './widget/manifest.webmanifest', './css/style.css', './css/widget.css',
  './js/fonti.js', './js/icone.js', './js/app.js', './js/widget.js', './js/aggiornamenti.js',
  './manifest.webmanifest', './icons/logo.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-180.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k.split('-')[0] === CACHE.split('-')[0]).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function fromNetwork(req, key) {
  return fetch(req).then(res => {
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(key || req, copy));
    }
    return res;
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // API meteo: sempre dalla rete
  if (url.pathname.endsWith('version.json')) return;         // controllo aggiornamenti: sempre dalla rete

  if (req.mode === 'navigate' && url.pathname.endsWith('/widget.html')) {
    e.respondWith(Response.redirect(new URL('./widget/', self.registration.scope).href, 302));
    return;
  }
  if (req.mode === 'navigate') {
    const pagina = url.pathname.indexOf('/widget/') >= 0 ? './widget/index.html' : './index.html';
    e.respondWith(
      caches.match(pagina).then(hit => hit || fromNetwork(req, pagina)).catch(() => caches.match(pagina))
    );
    return;
  }
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fromNetwork(req)).catch(() => caches.match(req))
  );
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      if (list.length) return list[0].focus();
      return self.clients.openWindow('./');
    })
  );
});
