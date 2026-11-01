/* Service worker «Расчёт изделий».
 * Стратегия: сеть в приоритете (чтобы цены и приложение были свежими), но если сети нет
 * или она отвечает дольше NET_TIMEOUT — отдаём копию из кэша. Так работает офлайн после первой загрузки.
 * Обновление: поменяйте VERSION — старый кэш удалится при активации новой версии.
 * Работает только на HTTPS или http://localhost (требование браузеров).
 */
const VERSION = 'v1.4.0';
const CACHE = 'kpc-shell-' + VERSION;
const NET_TIMEOUT = 3500;
const SHELL = [
  './', 'index.html', 'app.js', 'area.js', 'lines.js', 'message.js', 'prices.js', 'style.css', 'manifest.json',
  'engine/engine.js', 'data/catalog.json',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // по одному: если какого-то файла нет (например, движок ещё не выложен) — установка не должна падать
    await Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('kpc-shell-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

function withTimeout(p, ms) {
  return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); p.then(v => { clearTimeout(t); res(v); }, er => { clearTimeout(t); rej(er); }); });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const resp = await withTimeout(fetch(req, { cache: 'no-cache' }), NET_TIMEOUT);
      if (resp && resp.ok && resp.status === 200) cache.put(req, resp.clone());
      return resp;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') { const idx = await cache.match('index.html') || await cache.match('./'); if (idx) return idx; }
      return new Response('Нет связи и нет копии в памяти телефона', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
