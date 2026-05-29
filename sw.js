// PadelPass SW v2
const CACHE = 'padelpass-v2';

// Только локальные файлы — без cross-origin шрифтов
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// ── INSTALL ──────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      // ignoreSearch: true — игнорируем query string при матче
      Promise.allSettled(
        PRECACHE.map(url =>
          fetch(url, { cache: 'reload' })
            .then(res => { if (res.ok) cache.put(url, res); })
            .catch(() => {}) // не ронять установку если файл недоступен
        )
      )
    ).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ─────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH ────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);

  // Только GET, только http(s)
  if (req.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // Cross-origin (шрифты Google, CDN) — только network, без кеша
  if (url.origin !== self.location.origin) {
    e.respondWith(fetch(req).catch(() => new Response('', { status: 408 })));
    return;
  }

  // index.html — Network first, fallback to cache
  if (url.pathname === '/' || url.pathname === '/index.html') {
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Статика (иконки, manifest) — Cache first, network fallback
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => caches.match('/index.html'));
    })
  );
});

// ── PUSH NOTIFICATIONS ───────────────────────────────────
self.addEventListener('push', e => {
  const data = e.data?.json().catch(() => ({})) || {};
  e.waitUntil(
    self.registration.showNotification(data.title || 'PadelPass', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' },
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url === url && 'focus' in c) return c.focus();
      }
      return clients.openWindow(url);
    })
  );
});
