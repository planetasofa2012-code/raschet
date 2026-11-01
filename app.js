/* Расчёт изделий — приложение для телефона.
 * Чистый JS без зависимостей. Расчёт — только через window.KPEngine (calcObject / calcOrder).
 * Данные: IndexedDB (ключи с префиксом "kpc:"), запасной вариант — localStorage. Контракт данных — 2_tz.md.
 */
(function () {
'use strict';

const APP_VERSION = '1.5.0';
const K = { orders: 'kpc:orders', over: 'kpc:overrides', meta: 'kpc:meta', cat: 'kpc:catalog-cache', msg: 'kpc:msg', pset: 'kpc:psettings' };
const DEV = /[?&]dev=[12]/.test(location.search);               // ?dev=1 — тестовый движок-заглушка; ?dev=2 — ещё и тестовый каталог (только для проверки вёрстки)
const DEV_CAT = /[?&]dev=2/.test(location.search);
const DB_NAME = DEV ? 'kpc-dev' : ((document.querySelector('meta[name="kpc-db"]') || {}).content || 'kpc');   // у личной сборки своя база: на github.io все репозитории аккаунта делят одно хранилище браузера
const LS_PREFIX = DB_NAME === 'kpc' ? '' : DB_NAME + '|';
const FIXED = ['kitchen', 'wardrobe'];                          // изделия с готовым бланком
const FREE_DEFAULT = { chest: 'Комод', nightstand: 'Тумба', installation: 'Шкаф-инсталляция', custom: 'Индивидуальное' };
const NAMES_FALLBACK = Object.assign({ kitchen: 'Кухня', wardrobe: 'Шкаф' }, FREE_DEFAULT);

/* ───────────── утилиты ───────────── */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const clone = o => JSON.parse(JSON.stringify(o));
const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е').trim();
const round3 = n => Math.round(n * 1000) / 1000;
const round4 = n => Math.round(n * 1e4 + 1e-9) / 1e4;   // количества: до 4 знаков (квадратура фасадов как в Excel: 4,1551)
const NF = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const NF2 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const money = n => NF.format(Math.round(+(+n || 0).toFixed(6))).replace(/[  ]/g, ' ') + ' ₽';
const fmtP = n => NF2.format(+n || 0).replace(/[  ]/g, ' ');
const fmtQ = n => String(round4(+n || 0)).replace('.', ',');
const fmtA = n => String(Math.round((+n || 0) * 1000 + 1e-9) / 1000).replace('.', ',');   // площадь строки, 3 знака
function parseNum(s) {
  s = String(s == null ? '' : s).replace(/\s| /g, '').replace(',', '.');
  if (s === '' || s === '-' || s === '.') return NaN;
  const n = Number(s);
  return isFinite(n) ? n : NaN;
}
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso); if (isNaN(d)) return '';
  const o = { day: 'numeric', month: 'short' };
  if (d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
  return d.toLocaleDateString('ru-RU', o);
}
const nowIso = () => new Date().toISOString();

const ICON = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  more: '<circle cx="12" cy="5" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="19" r="1.6" fill="currentColor"/>',
  eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
  right: '<path d="M9 6l6 6-6 6"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  tag: '<path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1"/>',
  save: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  upload: '<path d="M12 15V3M7 8l5-5 5 5M4 21h16"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  ruler: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8c-1.5-4-5-4-5-2 0 1.500 2.500 2 5 2zM12 8c1.500-4 5-4 5-2 0 1.500-2.500 2-5 2z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 118 0v4"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  send: '<path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/>',
  refresh: '<path d="M20 11a8 8 0 00-14-4M4 4v4h4M4 13a8 8 0 0014 4M20 20v-4h-4"/>'
};
const svg = (n, cls) => `<svg viewBox="0 0 24 24" aria-hidden="true"${cls ? ` class="${cls}"` : ''}>${ICON[n]}</svg>`;

/* ───────────── состояние ───────────── */
const S = {
  base: null,            // справочник из catalog.json
  eff: null,             // справочник с правками цен с телефона (то, что идёт в движок)
  baseP: new Map(),      // id → цена из Excel
  idx: {},               // product → Map(id → {item, sec})
  orders: [],
  over: { prices: {}, added: [] },
  meta: { lastBackup: null },
  msg: null,             // настройки сообщения клиенту
  pset: {},              // глобальные настройки изделий: {kitchen: {coef, logistics, designerPct}}
  client: false,         // режим «Показать клиенту»
  clientOrder: null,     // заказ, который показываем клиенту
  ui: {}                 // временное состояние экранов
};
let storageOk = true;

/* ───────────── хранилище ─────────────
 * IndexedDB (база "kpc", хранилище "kv", ключи с префиксом "kpc:"). Все данные держим ещё и в памяти (KV),
 * запись в IndexedDB — на каждое изменение. Если IndexedDB недоступна (редко: приватный режим) — запасной localStorage.
 */
const KV = {};
let idb = null;
function idbOpen() {
  return new Promise((res, rej) => {
    try {
      const r = indexedDB.open(DB_NAME, 3);
      r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv'); if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos'); if (!d.objectStoreNames.contains('secure')) d.createObjectStore('secure'); };
      r.onsuccess = () => { r.result.onversionchange = () => r.result.close(); res(r.result); };
      r.onerror = () => rej(r.error);
      setTimeout(() => rej(new Error('база занята другой вкладкой — закройте её')), 6000);   // старая вкладка может держать базу при обновлении
    } catch (e) { rej(e); }
  });
}
function idbLoadAll(db) {
  return new Promise((res, rej) => {
    const out = {}, tx = db.transaction('kv', 'readonly'), st = tx.objectStore('kv'), rq = st.openCursor();
    rq.onsuccess = () => { const c = rq.result; if (c) { out[c.key] = c.value; c.continue(); } };
    tx.oncomplete = () => res(out);
    tx.onerror = () => rej(tx.error);
  });
}
async function initStorage() {
  try { idb = await idbOpen(); Object.assign(KV, await idbLoadAll(idb)); S.store = 'IndexedDB'; }
  catch (e) { idb = null; S.store = 'localStorage (запасной)'; [K.orders, K.over, K.meta, K.cat].forEach(k => { try { const v = localStorage.getItem(LS_PREFIX + k); if (v != null) KV[k] = JSON.parse(v); } catch (_) {} }); }
  // перенос из localStorage, если когда-то данные лежали там
  if (idb && KV[K.orders] === undefined) {
    if (DB_NAME === 'kpc') [K.orders, K.over, K.meta].forEach(k => { try { const v = localStorage.getItem(k); if (v != null) { KV[k] = JSON.parse(v); kvWrite(k, KV[k]); } } catch (_) {} });
  }
  // просим постоянное хранилище и запоминаем ответ
  try {
    if (navigator.storage && navigator.storage.persisted) {
      S.persist = await navigator.storage.persisted();
      if (!S.persist && navigator.storage.persist) S.persist = await navigator.storage.persist();
    } else S.persist = null;
  } catch (e) { S.persist = null; }
}
function kvWrite(k, v) {
  if (idb) {
    try {
      const tx = idb.transaction('kv', 'readwrite'); tx.objectStore('kv').put(JSON.parse(JSON.stringify(v)), k);
      tx.onerror = tx.onabort = () => storeFail();
    } catch (e) { storeFail(); }
  } else { try { localStorage.setItem(LS_PREFIX + k, JSON.stringify(v)); } catch (e) { storeFail(); } }
}
const secStore = mode => idb.transaction('secure', mode).objectStore('secure');
const secGet = key => new Promise(res => {
  if (!idb) return res(null);
  try { const r = secStore('readonly').get(key); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); } catch (e) { res(null); }
});
const secPut = (key, val) => new Promise((res, rej) => {
  if (!idb) return rej(new Error('Хранилище недоступно'));
  try { const tx = idb.transaction('secure', 'readwrite'); tx.objectStore('secure').put(val, key); tx.oncomplete = () => res(); tx.onerror = tx.onabort = () => rej(tx.error); } catch (e) { rej(e); }
});
const secDel = key => new Promise(res => {
  if (!idb) return res();
  try { const tx = idb.transaction('secure', 'readwrite'); tx.objectStore('secure').delete(key); tx.oncomplete = () => res(); tx.onerror = tx.onabort = () => res(); } catch (e) { res(); }
});
function storeFail() { if (storageOk) { storageOk = false; toast('Не удалось сохранить на телефоне — сделайте копию данных'); } }
const lsGet = (k, def) => (KV[k] === undefined ? def : KV[k]);
function lsSet(k, v) { KV[k] = v; kvWrite(k, v); return true; }
function loadState() {
  const o = lsGet(K.orders, []);
  S.orders = Array.isArray(o) ? o.filter(x => x && x.id).map(fixOrder) : [];
  const ov = lsGet(K.over, null) || {};
  S.over = { prices: (ov.prices && typeof ov.prices === 'object') ? ov.prices : {}, added: Array.isArray(ov.added) ? ov.added : [] };
  S.meta = Object.assign({ lastBackup: null }, lsGet(K.meta, {}) || {});
  S.msg = KPMessage.merge(lsGet(K.msg, {}));
  const ps = lsGet(K.pset, {});
  S.pset = ps && typeof ps === 'object' && !Array.isArray(ps) ? ps : {};
}
function fixOrder(o) {
  o.client = o.client || ''; o.title = o.title || ''; o.created = o.created || nowIso();
  o.objects = Array.isArray(o.objects) ? o.objects : [];
  o.samples = (Array.isArray(o.samples) ? o.samples : []).filter(x => x && x.id).map(x => ({ id: x.id, cat: x.cat || 'Другое', name: x.name || '', note: x.note || '', obj: x.obj || null, photos: Array.isArray(x.photos) ? x.photos : [] }));
  o.objects.forEach(b => {
    b.id = b.id || ('o' + uid()); b.qty = b.qty || {}; b.priceOverride = b.priceOverride || {};
    if (!Array.isArray(b.extraLines)) b.extraLines = [];
    if (!Array.isArray(b.gifts)) b.gifts = [];
    if (b.facadeCols && !Array.isArray(b.facadeCols)) delete b.facadeCols;
    b.extraLines.forEach(x => { if (x && x.noMarkup !== undefined) x.noMarkup = !!x.noMarkup; });
    if (b.facadeLink && typeof b.facadeLink !== 'object') delete b.facadeLink;
    b.name = b.name || NAMES_FALLBACK[b.product] || b.product;
  });
  return o;
}
const saveOrders = () => lsSet(K.orders, S.orders);
const saveOver = () => lsSet(K.over, S.over);
const saveMeta = () => lsSet(K.meta, S.meta);
function touch(order) { order.updated = nowIso(); saveOrders(); }

/* ───────────── справочник ───────────── */
function buildEff() {
  const c = clone(S.base);
  S.baseP = new Map(); S.idx = {};
  const secLists = () => {
    const m = { library: libSections(c) };
    FIXED.forEach(k => { if (c.products && c.products[k]) m[k] = c.products[k].sections || []; });
    return m;
  };
  const lists = secLists();
  Object.values(lists).forEach(secs => secs.forEach(sec => (sec.items || []).forEach(it => S.baseP.set(it.id, it.price))));
  const P = S.over.prices || {};
  Object.values(lists).forEach(secs => secs.forEach(sec => (sec.items || []).forEach(it => {
    if (Object.prototype.hasOwnProperty.call(P, it.id) && isFinite(P[it.id])) {
      if (it.noPrice) { it.mine = true; delete it.noPrice; it.price = P[it.id]; }          // публичная сборка: цена вписана пользователем
      else { it.was = it.price; it.price = P[it.id]; it.chg = true; }
    }
  })));
  (S.over.added || []).forEach(a => {
    const secs = lists[a.product] || lists.library;
    let sec = secs.find(s => s.id === a.section) || secs[0];
    if (!sec) { sec = { id: a.section || 'misc', title: 'Прочее', items: [] }; secs.push(sec); }
    sec.items.push({ id: a.id, name: a.name, unit: a.unit || 'шт', price: +a.price || 0, user: true });
  });
  if (c.library && !Array.isArray(c.library) && !c.library.sections) c.library.sections = lists.library;
  KPPrices.applySettings(c, S.pset);                  // коэффициент, логистика, designerPct — из настроек пользователя
  S.eff = c;
}
function libSections(c) {
  const l = (c || S.eff).library;
  if (!l) return [];
  return Array.isArray(l) ? l : (l.sections || (l.sections = []));
}
function productDef(key) {
  const c = S.eff;
  if (c.products && c.products[key]) return c.products[key];
  const pr = (c.presets || {})[key] || {};
  return { name: pr.name || NAMES_FALLBACK[key] || key, coef: pr.coef != null ? pr.coef : 2, logistics: pr.logistics || 0,
           designerPct: pr.designerPct || 0, sections: libSections(), suggest: pr.suggest || [], free: true };
}
const isFree = key => !(S.eff.products && S.eff.products[key]);
function itemIndex(key) {
  if (!S.idx[key]) {
    const m = new Map();
    productDef(key).sections.forEach(sec => (sec.items || []).forEach(it => m.set(it.id, { item: it, sec })));
    S.idx[key] = m;
  }
  return S.idx[key];
}
function productList() {
  const out = [];
  FIXED.forEach(k => { if (S.eff.products[k]) out.push({ key: k, name: S.eff.products[k].name || NAMES_FALLBACK[k], hint: 'готовый бланк' }); });
  const pre = S.eff.presets || {};
  const keys = Object.keys(pre).length ? Object.keys(pre) : Object.keys(FREE_DEFAULT);
  keys.forEach(k => { if (!FIXED.includes(k)) out.push({ key: k, name: (pre[k] && pre[k].name) || NAMES_FALLBACK[k] || k, hint: 'из материалов' }); });
  return out;
}
const productName = key => (S.eff.products && S.eff.products[key] && S.eff.products[key].name) || ((S.eff.presets || {})[key] || {}).name || NAMES_FALLBACK[key] || key;

/* ───────────── расчёт (только через движок) ───────────── */
const EMPTY = { cost: 0, price: 0, lines: [], sections: {} };
function calcObj(obj) {
  try { return KPEngine.calcObject(productDef(obj.product), obj) || EMPTY; } catch (e) { console.error(e); return EMPTY; }
}
function calcOrd(order) {
  try { return KPEngine.calcOrder(S.eff, order) || { total: 0, objects: [] }; } catch (e) { console.error(e); return { total: 0, objects: [] }; }
}
function orderCost(order, res) {
  // себестоимость заказа = сумма cost изделий из ответа движка (если нет — считаем по изделиям)
  let s = 0, ok = true;
  (res.objects || []).forEach(o => { if (typeof o.cost === 'number') s += o.cost; else ok = false; });
  if (ok) return s;
  return order.objects.reduce((a, b) => a + (calcObj(b).cost || 0), 0);
}
const lineMap = res => { const m = new Map(); (res.lines || []).forEach(l => m.set(l.id, l)); return m; };

/* ───────────── заказы: операции ───────────── */
const getOrder = id => S.orders.find(o => o.id === id);
function newOrder() {
  const o = { id: 'z' + uid(), client: '', title: '', created: nowIso(), updated: nowIso(), objects: [] };
  S.orders.unshift(o); saveOrders(); return o;
}
function dupOrder(o) {
  const c = clone(o); c.id = 'z' + uid(); c.created = c.updated = nowIso();
  c.title = (c.title ? c.title + ' ' : '') + '(копия)';
  const oldIds = new Map(o.objects.map((b, i) => [b.id, c.objects[i]]));
  c.objects.forEach(b => b.id = 'o' + uid());
  (c.samples || []).forEach(sm => { if (sm.obj && oldIds.has(sm.obj)) sm.obj = oldIds.get(sm.obj).id; sm.id = 's' + uid(); });
  const pairs = [];
  (c.samples || []).forEach(sm => { sm.photos = (sm.photos || []).map(old => { const nw = 'p' + uid(); pairs.push([old, nw]); return nw; }); });
  S.orders.unshift(c); saveOrders();
  (async () => { for (const [a, b] of pairs) { const blob = await phGet(a); if (blob) await phPut(b, blob).catch(() => {}); } })();
  return c;
}
function addObject(order, key) {
  const def = productDef(key);
  const b = { id: 'o' + uid(), product: key, name: def.name || NAMES_FALLBACK[key] || key, qty: {}, priceOverride: {}, extraLines: [] };
  order.objects.push(b); touch(order); return b;
}
function dupObject(order, b) {
  const c = clone(b); c.id = 'o' + uid(); c.name = b.name + ' (копия)';
  order.objects.splice(order.objects.indexOf(b) + 1, 0, c); touch(order); return c;
}

/* ───────────── интерфейс: общие части ───────────── */
let toastTimer;
function toast(msg, actLabel, act) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>` + (actLabel ? `<button>${esc(actLabel)}</button>` : '');
  t.hidden = false; t.classList.toggle('has-bar-toast', document.body.classList.contains('bar-on'));
  if (actLabel) $('button', t).onclick = () => { t.hidden = true; act && act(); };
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, actLabel ? 9000 : 2600);
}

/** Шторка снизу. Возвращает Promise<{btn, data}>; btn = value нажатой кнопки или null (закрыли). */
function showSheet(o) {
  return new Promise(res => {
    const w = document.createElement('div');
    w.className = 'sheet-wrap';
    w.innerHTML = `<div class="sheet-bg"></div><div class="sheet${o.tall ? ' tall' : ''}" role="dialog" aria-modal="true"><div class="sheet-grip"></div>` +
      (o.title ? `<h3 class="sheet-title">${esc(o.title)}</h3>` : '') +
      `<div class="sheet-body">${o.body || ''}</div>` +
      ((o.buttons || []).length ? `<div class="sheet-btns${o.row ? ' row2' : ''}">${o.buttons.map((b, i) => `<button class="btn ${b.kind || ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div>` : '') +
      `</div>`;
    document.body.appendChild(w); document.body.classList.add('noscroll');
    let done = false;
    const onKey = e => { if (e.key === 'Escape') close(null); };
    const close = v => {
      if (done) return; done = true;
      const data = o.collect ? o.collect(w) : null;
      document.removeEventListener('keydown', onKey);
      w.remove();
      if (!$('.sheet-wrap')) document.body.classList.remove('noscroll');
      res({ btn: v, data });
    };
    document.addEventListener('keydown', onKey);
    $('.sheet-bg', w).onclick = () => close(null);
    $$('.sheet-btns .btn', w).forEach(b => b.onclick = () => close(o.buttons[+b.dataset.i].value));
    const prim = (o.buttons || []).find(b => b.primary);
    $$('input', w).forEach(inp => inp.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || inp.type === 'search') return;
      if (inp.dataset.next) { e.preventDefault(); const n = $(inp.dataset.next, w); if (n) { n.focus(); try { n.select(); } catch (_) {} } return; }
      if (prim) { e.preventDefault(); close(prim.value); }
    }));
    o.onOpen && o.onOpen(w, close);
    const first = $('input[autofocus],input[data-focus]', w);
    if (first) setTimeout(() => { first.focus(); try { first.select(); } catch (e) {} }, 60);
  });
}
async function confirmDlg(text, okLabel, danger, title) {
  const r = await showSheet({ title: title || 'Подтвердите', body: `<p style="margin:0">${text}</p>`, row: true,
    buttons: [{ label: 'Отмена', kind: 'ghost', value: null }, { label: okLabel || 'Да', kind: danger ? 'danger' : 'go', value: 'ok', primary: true }] });
  return r.btn === 'ok';
}
function menuSheet(title, items) {
  return showSheet({
    title, body: `<div class="sheet-list">${items.map((it, i) => `<button class="menu-item${it.danger ? ' danger' : ''}" data-m="${i}">${svg(it.icon || 'edit')}<span>${esc(it.label)}</span>${it.hint ? `<small>${esc(it.hint)}</small>` : ''}</button>`).join('')}</div>`,
    buttons: [{ label: 'Отмена', kind: 'ghost', value: null }],
    onOpen: (w, close) => $$('.menu-item', w).forEach(b => b.onclick = () => close(items[+b.dataset.m].value))
  }).then(r => r.btn);
}

/* ───────────── маршрутизация ───────────── */
function parseRoute() {
  const h = (location.hash || '#/').replace(/^#/, '');
  const p = h.split('/').filter(Boolean);
  if (!p.length) return { name: 'orders' };
  if (p[0] === 'prices') return { name: 'prices' };
  if (p[0] === 'data') return { name: 'data' };
  if (p[0] === 'settings') return { name: 'settings' };
  if (p[0] === 'o' && p[1]) return p[2] === 'msg' ? { name: 'msg', oid: p[1] } : p[2] ? { name: 'object', oid: p[1], bid: p[2] } : { name: 'order', oid: p[1] };
  return { name: 'orders' };
}
const go = h => { location.hash = h; };
const scrollPos = {};
let curKey = '';
function render() {
  if (!S.eff) return;
  let r = parseRoute();
  // в режиме «клиенту» никуда, кроме показываемого заказа
  if (S.client) {
    const ord = getOrder(S.clientOrder);
    if (!ord) { S.client = false; }
    else if (r.name === 'orders' || r.name === 'prices' || r.name === 'data' || r.name === 'settings' || r.name === 'msg' || r.oid !== S.clientOrder) { location.replace('#/o/' + S.clientOrder); return; }
  }
  scrollPos[curKey] = window.scrollY;
  const key = location.hash || '#/';
  const same = key === curKey;
  curKey = key;
  if (!same) S.ui = { open: S.ui.open || {}, ptab: S.ui.ptab || 'kitchen', popen: S.ui.popen || {} };
  const app = $('#app');
  app.className = 'app' + (S.client ? ' client' : '');
  document.body.classList.remove('bar-on');
  if (r.name === 'order') return renderOrder(r, app);
  if (r.name === 'object') return renderObject(r, app);
  if (r.name === 'msg') return renderMessage(r, app);
  if (r.name === 'prices') return renderPrices(app);
  if (r.name === 'settings') return renderSettings(app);
  if (r.name === 'data') return renderData(app);
  renderOrders(app);
  setTimeout(() => window.scrollTo(0, scrollPos[curKey] || 0), 0);
}
function setScreen(app, html, withBar) {
  app.innerHTML = html;
  app.classList.toggle('has-bar', !!withBar);
  document.body.classList.toggle('bar-on', !!withBar);
  if (withBar) { const b = $('#bar'); document.documentElement.style.setProperty('--bar-h', (b ? b.offsetHeight : 70) + 'px'); }
}
function tabsHtml(cur) {
  const t = [['', 'Заказы', 'list', 'orders'], ['prices', 'Цены', 'tag', 'prices'], ['data', 'Данные', 'save', 'data']];
  return `<nav class="tabs"><div class="tabs-in">${t.map(x => `<a href="#/${x[0]}" class="${cur === x[3] ? 'on' : ''}">${svg(x[2])}<span>${x[1]}</span></a>`).join('')}</div></nav>`;
}

/* ───────────── экран «Заказы» ───────────── */
/** Цен ещё нет (публичная сборка без загруженного файла) — первый запуск. */
const noPrices = () => !(KPPrices.hasPrices(S.eff) || (S.over.added || []).length);
function welcomeHtml() {
  if (!noPrices()) return '';
  return `<div class="card stack welcome"><h2 style="font-size:19px">С чего начать</h2>
    <p class="hint" style="margin:0">В приложении нет цен — они хранятся только на вашем телефоне и никуда не отправляются.</p>
    <ol class="steps"><li><b>Загрузите свои цены файлом</b> или впишите вручную на экране «Цены».</li><li><b>Задайте коэффициент</b> в «Настройки».</li><li><b>Создайте заказ.</b></li></ol>
    <a class="btn go block" href="#/prices">1. Цены</a><a class="btn ghost block" href="#/settings">2. Настройки</a><button class="btn ghost block" data-act="new-order">3. Новый заказ</button></div>`;
}
const coefUnsetFor = obj => KPPrices.coefUnset(productDef(obj.product), obj, S.pset, obj.product);
const coefBanner = () => `<a class="warnbox coefwarn" href="#/settings"><b>Задайте коэффициент:</b> сейчас 1 (цены = закупка). Нажмите, чтобы задать.</a>`;
function renderOrders(app) {
  const list = S.orders.slice().sort((a, b) => String(b.updated || b.created).localeCompare(String(a.updated || a.created)));
  const days = S.meta.lastBackup ? (Date.now() - new Date(S.meta.lastBackup).getTime()) / 864e5 : Infinity;
  const warn = list.length && days > 7
    ? `<div class="warnbox">${S.meta.lastBackup ? 'Копия данных не сохранялась ' + Math.floor(days) + ' дн.' : 'Копия данных ещё не сохранялась.'} Телефон может очистить память браузера — <a href="#/data">сохраните копию</a>.</div>` : '';
  const cards = list.map(o => {
    const r = calcOrd(o);
    return `<div class="card ord" data-oid="${o.id}">
      <div class="ord-main" data-act="open-order"><b>${esc(o.client || 'Без клиента')}</b><span class="t">${esc(o.title || '—')}</span>
      <small>${fmtDate(o.updated || o.created)} · изделий: ${o.objects.length}</small></div>
      <div class="ord-sum" data-act="open-order">${money(r.total)}</div>
      <button class="ibtn" data-act="order-menu" aria-label="Действия">${svg('more')}</button></div>`;
  }).join('');
  setScreen(app, `<div class="top home"><h1>Расчёты<span class="sub">${list.length ? 'заказов на телефоне: ' + list.length : 'пока пусто'}</span></h1>
      <a class="ibtn" href="#/settings" aria-label="Настройки">${svg('gear')}</a><button class="pill${list.length && days > 7 ? ' acc' : ''}" data-act="save-backup">${svg('save')}Сохранить копию</button></div>
    <div class="wrap stack">${welcomeHtml()}${warn}${cards ? `<div class="olist">${cards}</div>` :
      `<div class="empty"><h2>Расчётов пока нет</h2><p>Нажмите «Новый расчёт», чтобы посчитать кухню, шкаф или другое изделие.</p></div>`}</div>
    <button class="btn go fab" data-act="new-order">${svg('plus')}Новый расчёт</button>${tabsHtml('orders')}`);
}

/* ───────────── экран «Заказ» ───────────── */
function renderOrder(r, app) {
  const o = getOrder(r.oid);
  if (!o) { go('#/'); return; }
  S.ui.oid = o.id;
  if (S.client) return renderClientOrder(o, app);
  const res = calcOrd(o);
  const objs = o.objects.map(b => {
    const ro = (res.objects || []).find(x => x.id === b.id);
    const price = ro ? ro.price : calcObj(b).price;
    const n = Object.values(b.qty || {}).filter(v => v > 0).length + (b.extraLines || []).length;
    return `<div class="card obj" data-bid="${b.id}"><div class="obj-main" data-act="open-obj">
      <span class="obj-tag">${esc(productName(b.product))}</span><div class="obj-name">${esc(b.name)}</div>
      <div class="obj-price">${money(price)}</div><div class="obj-meta">позиций: ${n}</div></div>
      <button class="ibtn" data-act="obj-menu" aria-label="Действия">${svg('more')}</button></div>`;
  }).join('');
  setScreen(app, `<div class="top"><a class="ibtn" href="#/" aria-label="Назад">${svg('back')}</a><h1>${esc(o.client || 'Новый расчёт')}<span class="sub">${esc(o.title || 'заказ')}</span></h1>
      <button class="pill" data-act="client-mode">${svg('eye')}Показать</button></div>
    <div class="wrap stack">
      ${o.objects.some(coefUnsetFor) ? coefBanner() : ''}
      <div class="card stack"><label class="fld">Клиент<input id="f-client" data-in="o-client" value="${esc(o.client)}" placeholder="Имя клиента" autocomplete="off" autocapitalize="sentences"></label>
      <label class="fld">Название / адрес<input data-in="o-title" value="${esc(o.title)}" placeholder="Например, ул. Ленина 5" autocomplete="off" autocapitalize="sentences"></label></div>
      ${objs}
      <button class="btn dashed block" data-act="add-obj">${svg('plus')}Изделие</button>
      ${samplesHtml(o, false)}
      <a class="btn go block" href="#/o/${o.id}/msg">${svg('send')}Сообщение клиенту</a>
    </div><div id="bar" class="bar"></div>`, true);
  fillBar(o, null, res); hydratePhotos(app);
  if (!o.client && !o.title && !o.objects.length) setTimeout(() => { const f = $('#f-client'); f && f.focus(); }, 80);
}
function giftClientHtml(list, total) {
  if (!list.length) return '';
  return `<div class="card gift-cl" style="padding:0"><div class="cl-h" style="padding:14px 14px 6px">${svg('gift')} В подарок</div>${list.map(g => `<div class="cl-row"><span>${esc(g.name)}${g.qty !== 1 ? ' × ' + fmtQ(g.qty) : ''}<small class="muted" style="display:block;font-size:12.5px">стоимость по прайсу ${money(g.value)}</small></span></div>`).join('')}
    <div class="cl-row"><span>Подарок по прайсу</span><b>${money(total)}</b></div></div>`;
}
function renderClientOrder(o, app) {
  const res = calcOrd(o);
  const gl = []; (res.objects || []).forEach(x => (x.gifts || []).forEach(g => gl.push(g)));
  const rows = o.objects.map(b => {
    const ro = (res.objects || []).find(x => x.id === b.id);
    return `<div class="card obj" data-bid="${b.id}"><div class="obj-main" data-act="open-obj"><div class="obj-name" style="margin:0">${esc(b.name)}</div>
      <div class="obj-price">${money(ro ? ro.price : calcObj(b).price)}</div></div><svg class="chev" viewBox="0 0 24 24">${ICON.right}</svg></div>`;
  }).join('');
  setScreen(app, clientBanner() + `<div class="wrap stack"><div class="client-title">${esc(o.client)}${o.client && o.title ? '<br>' : ''}<span class="muted" style="font-size:16px;font-weight:400">${esc(o.title)}</span></div>${rows}${giftClientHtml(gl, res.giftValue || 0)}${samplesHtml(o, true)}</div><div id="bar" class="bar"></div>`, true);
  fillBar(o, null, res); hydratePhotos(app);
}
function clientBanner() {
  return `<div class="clientbanner"><span>Режим показа клиенту</span><button data-hold="exit-client"><b>Удерживайте — выйти</b></button></div>`;
}

/* ───────────── липкая панель итога ───────────── */
/** Подарок в «Для себя»: расход по закупке и остаток прибыли после него. */
function giftSelf(price, prof, gc, gv) {
  if (!(gc > 0)) return '';
  const left = prof - gc, pct = price ? left / price * 100 : 0, heavy = price > 0 && gc > 0.2 * price;
  return `<span>Подарок обойдётся вам</span><b>${money(gc)}</b><span>Ценность для клиента</span><b>${money(gv)}</b>
    <span>Остаётся после подарка</span><b class="${left >= 0 ? 'pos' : 'neg'}">${money(left)} · ${NF.format(Math.round(pct))}%</b>${heavy ? '<div class="cap gwarn">Подарок съедает много маржи</div>' : ''}`;
}
function fillBar(order, obj, resOrder, resObj) {
  const bar = $('#bar'); if (!bar) return;
  const ro = resOrder || calcOrd(order);
  let main, alt = '', cost, price, gc = 0, gv = 0;
  if (obj) {
    const r = resObj || calcObj(obj);
    price = r.price; cost = r.cost; gc = r.giftCost || 0; gv = r.giftValue || 0;
    main = `<div class="l"><div class="lbl">${esc(obj.name)} — клиенту</div><div class="tot">${money(price)}</div></div>`;
    if (!S.client) alt = `<div class="alt">Весь заказ<br><b>${money(ro.total)}</b></div>`;
    else alt = `<div class="alt">Весь заказ<br><b>${money(ro.total)}</b></div>`;
  } else {
    price = ro.total; cost = orderCost(order, ro); gc = ro.giftCost || 0; gv = ro.giftValue || 0;
    main = `<div class="l"><div class="lbl">${S.client ? 'Итого' : 'Итого клиенту'}</div><div class="tot">${money(price)}</div></div>`;
  }
  const open = !!S.ui.self && !S.client;
  const prof = price - cost, pct = price ? prof / price * 100 : 0;
  const self = (!S.client && open) ? `<div class="self"><div class="cap">Для себя — не показывать клиенту</div>
      <span>Себестоимость</span><b>${money(cost)}</b><span>Прибыль</span><b class="${prof >= 0 ? 'pos' : 'neg'}">${money(prof)} · ${NF.format(Math.round(pct))}%</b>${giftSelf(price, prof, gc, gv)}${(obj ? coefUnsetFor(obj) : order.objects.some(coefUnsetFor)) ? '<div class="cap gwarn">Задайте коэффициент: сейчас 1 (цены = закупка)</div>' : ''}</div>` : '';
  bar.innerHTML = `<div class="bar-in">${self}<div class="bar-main">${main}${alt}${S.client ? '' : `<button class="self-btn${open ? ' on' : ''}" data-act="toggle-self">Для себя${svg('chev')}</button>`}</div></div>`;
  document.documentElement.style.setProperty('--bar-h', bar.offsetHeight + 'px');
}

/* ───────────── экран «Изделие» ───────────── */
function currentCtx() {
  const r = parseRoute();
  const order = getOrder(r.oid); if (!order) return {};
  return { order, obj: order.objects.find(b => b.id === r.bid) };
}
function renderObject(r, app) {
  const order = getOrder(r.oid);
  const obj = order && order.objects.find(b => b.id === r.bid);
  if (!obj) { go(order ? '#/o/' + order.id : '#/'); return; }
  const def = productDef(obj.product), free = def.free;
  if (S.client) return renderClientObject(order, obj, app);
  const dc = def.coef != null ? def.coef : 2, dl = def.logistics || 0;
  const tools = free ? '' : `<div class="stickytools"><div class="search">${svg('search')}<input class="inp" type="search" id="q" data-in="q" placeholder="Поиск по позициям" value="${esc(S.ui.q || '')}" autocomplete="off"></div>
      <div class="chips"><button class="chip${S.ui.only ? ' on' : ''}" data-act="only-sel">Только выбранные</button></div></div>`;
  const settings = `<div class="settings${S.ui.setOpen ? ' open' : ''}" id="setbox"><button data-act="toggle-settings">Настройки изделия${svg('chev', 'chv')}</button>
      <div class="body"><label class="fld">Название<input data-in="b-name" value="${esc(obj.name)}" autocomplete="off"></label>
      <div class="grid2"><label class="fld">Коэффициент<input data-in="b-coef" inputmode="decimal" value="${obj.coef != null ? fmtQ(obj.coef) : ''}" placeholder="${fmtQ(dc)}"></label>
      <label class="fld">Логистика, ₽<input data-in="b-log" inputmode="decimal" value="${obj.logistics != null ? fmtQ(obj.logistics) : ''}" placeholder="${fmtQ(dl)}"></label></div>
      <p class="hint">Пустое поле — значение по умолчанию (${fmtQ(dc)} и ${money(dl)}). Цена клиенту = себестоимость × коэффициент + логистика.</p></div></div>`;
  setScreen(app, `<div class="top"><a class="ibtn" href="#/o/${order.id}" aria-label="К заказу">${svg('back')}</a><h1 id="objTitle">${esc(obj.name)}<span class="sub">${esc(order.client || 'заказ')}${order.title ? ' · ' + esc(order.title) : ''}</span></h1>
      <button class="pill" data-act="client-mode">${svg('eye')}Показать</button></div>
    ${tools}<div class="wrap stack">${coefUnsetFor(obj) ? coefBanner() : ''}<div id="objList" class="stack"></div>${settings}</div><div id="bar" class="bar"></div>`, true);
  renderObjList();
  fillBar(order, obj);
}

function rowHtml(o) {
  const q = o.qty > 0;
  return `<div class="row${q ? ' on' : ''}" data-row ${o.g != null ? `data-g="${o.g}"` : o.x != null ? `data-x="${o.x}"` : `data-id="${esc(o.id)}"`}>
    <div class="row-top"><span class="row-name">${esc(o.name)}${o.x != null ? '<span class="xtag">своя</span>' : ''}${o.nm ? '<span class="xtag nm">без наценки</span>' : ''}${o.linked ? `<span class="lnk" title="Связано с квадратурой">${svg('ruler')}</span>` : ''}</span><b class="row-sum" data-sum>${q ? money(o.sum) : ''}</b></div>
    <div class="row-bot"><button class="pricebtn${o.chg ? ' chg' : ''}" data-act="edit-price"><span data-pv>${o.np ? '<b class="np">цена не задана</b>' : fmtP(o.price) + '\u00a0₽'}</span><i>/ ${esc(o.unit)}</i>${o.chg ? '<em>изм.</em>' : ''}</button>
    <div class="row-act">${o.rm ? `<button class="rm" data-act="rm-line" aria-label="Убрать">${svg('trash')}</button>` : ''}
    <div class="stepper"><button data-act="dec" aria-label="Меньше">−</button><input inputmode="decimal" data-in="qty" value="${fmtQ(o.qty)}" aria-label="Количество"><button data-act="inc" aria-label="Больше">+</button></div></div></div></div>`;
}
function itemRow(obj, it, lm, rm) {
  const qty = obj.qty[it.id] || 0;
  const has = Object.prototype.hasOwnProperty.call(obj.priceOverride, it.id);
  const price = has ? obj.priceOverride[it.id] : it.price;
  const l = lm.get(it.id);
  const linked = !!(obj.facadeLink && obj.facadeLink[it.id] !== undefined);
  return rowHtml({ id: it.id, name: it.name, unit: it.unit, price, chg: has, qty, sum: l ? l.sum : qty * price, rm, linked, np: !!it.noPrice && !has });
}
function renderObjList() {
  const { order, obj } = currentCtx(); if (!obj) return;
  const box = $('#objList'); if (!box) return;
  const def = productDef(obj.product), res = calcObj(obj), lm = lineMap(res);
  if (def.free) return renderFreeList(box, order, obj, def, res, lm);
  const q = norm(S.ui.q), only = !!S.ui.only, filt = q || only;
  let html = '', found = 0;
  def.sections.forEach(sec => {
    let items = sec.items || [];
    const n = items.filter(it => (obj.qty[it.id] || 0) > 0).length;
    if (q) items = items.filter(it => norm(it.name).includes(q) || norm(sec.title).includes(q));
    if (only) items = items.filter(it => (obj.qty[it.id] || 0) > 0);
    if (filt && !items.length) return;
    found += items.length;
    const open = filt || !!S.ui.open[obj.id + ':' + sec.id];
    const cst = res.sections && res.sections[sec.id] ? res.sections[sec.id].cost : 0;
    const fbtn = isFacadeSec(sec) ? `<button class="pill sm" data-act="facade" aria-label="Квадратура фасадов">${svg('ruler')}<span class="plabel">Квадратура</span></button>` : '';
    html += `<section class="sec${open ? ' open' : ''}" data-sec="${esc(sec.id)}"><div class="sec-hw"><button class="sec-h" data-act="toggle-sec"><span class="st">${esc(sec.title)}</span>
      <span class="badge" data-n="${n}">${n || ''}</span><span class="ss" data-ss>${cst > 0 ? money(cst) : ''}</span>${svg('chev', 'chv')}</button>${fbtn}</div>
      <div class="sec-b">${open ? items.map(it => itemRow(obj, it, lm)).join('') : ''}</div></section>`;
  });
  const ex = obj.extraLines || [];
  let exq = ex.map((x, i) => ({ x, i }));
  if (q) exq = exq.filter(e => norm(e.x.name).includes(q));
  if (only) exq = exq.filter(e => +e.x.qty > 0);
  if (ex.length && (!filt || exq.length)) {
    found += exq.length;
    const key = obj.id + ':__extra', open = filt || (key in S.ui.open ? !!S.ui.open[key] : true);
    const nq = ex.filter(x => +x.qty > 0).length, cst = res.sections && res.sections.extra ? res.sections.extra.cost : 0;
    html += `<section class="sec${open ? ' open' : ''}" data-sec="__extra"><div class="sec-hw"><button class="sec-h" data-act="toggle-sec"><span class="st">Свои позиции</span>
      <span class="badge" data-n="${nq}">${nq || ''}</span><span class="ss" data-ss>${cst > 0 ? money(cst) : ''}</span>${svg('chev', 'chv')}</button></div>
      <div class="sec-b">${open ? exq.map(e => extraRow(e.x, e.i)).join('') : ''}</div></section>`;
  }
  if (filt && !found) html = `<div class="empty"><p>${only && !q ? 'Пока ничего не выбрано.' : 'Ничего не найдено.'}</p></div>`;
  box.innerHTML = html + `<button class="btn dashed block" data-act="add-line">${svg('plus')}Своя позиция</button>` + giftBlock(obj, res);
}
function giftSummary(obj, res) {
  if (!(obj.gifts || []).length) return '';
  const gc = res.giftCost || 0, gv = res.giftValue || 0, price = res.price || 0;
  const heavy = gc > 0 && price > 0 && gc > 0.2 * price;
  return `<div class="gsum">Подарок обойдётся вам: <b>${money(gc)}</b> <span class="muted">(клиент видит ценность: ${money(gv)})</span>${heavy ? '<div class="gwarn">Подарок съедает много маржи</div>' : ''}</div>`;
}
function giftBlock(obj, res) {
  const g = obj.gifts || [];
  const nq = g.filter(x => +x.qty > 0).length, gc = res.giftCost || 0;
  const rows = g.map((x, i) => rowHtml({ g: i, name: x.name || 'Без названия', unit: x.unit || 'шт', price: +x.price || 0, qty: +x.qty || 0, sum: (+x.qty || 0) * (+x.price || 0), rm: true, nm: !!x.noMarkup })).join('');
  return `<section class="sec open gift" data-sec="__gift"><div class="sec-hw"><div class="sec-h static"><span class="st">${svg('gift')} Подарок</span>
    <span class="badge" data-n="${nq}">${nq || ''}</span><span class="ss" data-ss>${gc > 0 ? money(gc) : ''}</span></div></div>
    <div class="sec-b">${rows}<div id="gift-sum-w">${giftSummary(obj, res)}</div>
    <div class="gift-add"><button class="btn dashed block" data-act="add-gift">${svg('plus')}Подарок</button></div></div></section>`;
}
function extraRow(x, i) {
  return rowHtml({ x: i, name: x.name || 'Без названия', unit: x.unit || 'шт', price: +x.price || 0, qty: +x.qty || 0, sum: (+x.qty || 0) * (+x.price || 0), rm: true, nm: !!x.noMarkup });
}
function renderFreeList(box, order, obj, def, res, lm) {
  const ids = Object.keys(obj.qty);
  const idx = itemIndex(obj.product);
  let rows = ids.map(id => { const e = idx.get(id); return e ? itemRow(obj, e.item, lm, true) : ''; }).join('');
  rows += (obj.extraLines || []).map((x, i) => extraRow(x, i)).join('');
  box.innerHTML = (rows ? `<div class="sec open"><div class="sec-b">${rows}</div></div>` : `<div class="empty"><h2>Пока пусто</h2><p>Добавьте материалы из справочника или свою строку.</p></div>`) +
    `<div class="grid2"><button class="btn dashed" data-act="add-mat">${svg('plus')}Материал</button><button class="btn dashed" data-act="add-line">${svg('plus')}Своя строка</button></div>` +
    `<button class="btn dashed block" data-act="facade">${svg('ruler')}Квадратура фасадов</button>` + giftBlock(obj, res);
}
function renderClientObject(order, obj, app) {
  const def = productDef(obj.product), idx = itemIndex(obj.product);
  let html = '';
  if (def.free) {
    const rows = Object.keys(obj.qty).filter(id => obj.qty[id] > 0 && idx.get(id)).map(id => [idx.get(id).item.name, obj.qty[id], idx.get(id).item.unit])
      .concat((obj.extraLines || []).filter(x => x.qty > 0).map(x => [x.name, x.qty, x.unit]));
    html = rows.length ? `<div class="card" style="padding:0">${rows.map(clRow).join('')}</div>` : '';
  } else {
    def.sections.forEach(sec => {
      const rows = (sec.items || []).filter(it => (obj.qty[it.id] || 0) > 0).map(it => [it.name, obj.qty[it.id], it.unit]);
      if (rows.length) html += `<div class="cl-h">${esc(sec.title)}</div><div class="card" style="padding:0">${rows.map(clRow).join('')}</div>`;
    });
    const exr = (obj.extraLines || []).filter(x => x.qty > 0).map(x => [x.name, x.qty, x.unit]);
    if (exr.length) html += `<div class="cl-h">Дополнительно</div><div class="card" style="padding:0">${exr.map(clRow).join('')}</div>`;
  }
  { const gr = calcObj(obj); html += giftClientHtml(gr.gifts || [], gr.giftValue || 0); }
  setScreen(app, clientBanner() + `<div class="top"><a class="ibtn" href="#/o/${order.id}" aria-label="К заказу">${svg('back')}</a><h1>${esc(obj.name)}</h1></div>
    <div class="wrap stack">${html || '<div class="empty"><p>Позиции не выбраны.</p></div>'}</div><div id="bar" class="bar"></div>`, true);
  fillBar(order, obj);
}
const clRow = r => `<div class="cl-row"><span>${esc(r[0])}</span><b>${fmtQ(r[1])} ${esc(r[2] || '')}</b></div>`;

/* патч без перерисовки (чтобы не терять фокус в поле количества) */
function patchObject() {
  const { order, obj } = currentCtx(); if (!obj) return;
  const res = calcObj(obj), lm = lineMap(res);
  $$('[data-row]').forEach(row => {
    let qty, sum;
    if (row.dataset.g != null) { const x = (obj.gifts || [])[+row.dataset.g] || {}; qty = +x.qty || 0; sum = qty * (+x.price || 0); }
    else if (row.dataset.x != null) { const x = obj.extraLines[+row.dataset.x] || {}; qty = +x.qty || 0; sum = qty * (+x.price || 0); }
    else { const id = row.dataset.id; qty = obj.qty[id] || 0; const l = lm.get(id); sum = l ? l.sum : 0; }
    row.classList.toggle('on', qty > 0);
    if (row.dataset.id && !(obj.facadeLink && obj.facadeLink[row.dataset.id] !== undefined)) { const l = $('.lnk', row); if (l) l.remove(); }
    $('[data-sum]', row).textContent = qty > 0 ? money(sum) : '';
  });
  $$('[data-sec]').forEach(sec => {
    const id = sec.dataset.sec, def = productDef(obj.product);
    if (id === '__extra') {
      const nq = (obj.extraLines || []).filter(x => +x.qty > 0).length, b0 = $('[data-n]', sec); b0.dataset.n = nq; b0.textContent = nq || '';
      const c0 = res.sections && res.sections.extra ? res.sections.extra.cost : 0; $('[data-ss]', sec).textContent = c0 > 0 ? money(c0) : ''; return;
    }
    if (id === '__gift') {
      const nq = (obj.gifts || []).filter(x => +x.qty > 0).length, b1 = $('[data-n]', sec); b1.dataset.n = nq; b1.textContent = nq || '';
      $('[data-ss]', sec).textContent = res.giftCost > 0 ? money(res.giftCost) : ''; return;
    }
    const s = def.sections.find(x => x.id === id); if (!s) return;
    const n = (s.items || []).filter(it => (obj.qty[it.id] || 0) > 0).length;
    const b = $('[data-n]', sec); b.dataset.n = n; b.textContent = n || '';
    const c = res.sections && res.sections[id] ? res.sections[id].cost : 0;
    $('[data-ss]', sec).textContent = c > 0 ? money(c) : '';
  });
  const gw = $('#gift-sum-w'); if (gw) gw.innerHTML = giftSummary(obj, res);
  fillBar(order, obj, null, res);
}
function saveObjChange(order) { touch(order); patchObject(); }

function qtyTarget(el) { const row = el.closest('[data-row]'); return row ? { id: row.dataset.id, x: row.dataset.x, g: row.dataset.g } : null; }
function getQ(obj, t) { return t.g != null ? +(obj.gifts[+t.g] || {}).qty || 0 : t.x != null ? +(obj.extraLines[+t.x] || {}).qty || 0 : obj.qty[t.id] || 0; }
function setQ(obj, t, v) {
  v = Math.max(0, round4(v));
  if (t.x == null && t.g == null && obj.facadeLink) delete obj.facadeLink[t.id];      // ручная правка — связь с квадратурой снимается
  if (t.g != null) obj.gifts[+t.g].qty = v;
  else if (t.x != null) obj.extraLines[+t.x].qty = v;
  else if (v === 0 && !isFree(obj.product)) delete obj.qty[t.id];
  else obj.qty[t.id] = v;
}

/* правка цены в этом расчёте */
async function editPrice(row) {
  const { order, obj } = currentCtx(); if (!obj) return;
  const t = qtyTarget(row);
  if (t.g != null) return editLine(order, obj, +t.g, 'gifts');
  if (t.x != null) return editLine(order, obj, +t.x);
  const e = itemIndex(obj.product).get(t.id); if (!e) return;
  const has = Object.prototype.hasOwnProperty.call(obj.priceOverride, t.id);
  const cur = has ? obj.priceOverride[t.id] : e.item.price;
  const btns = [{ label: 'Применить', kind: 'go', value: 'ok', primary: true }];
  if (has) btns.push({ label: 'Вернуть цену справочника', kind: 'ghost', value: 'reset' });
  btns.push({ label: 'Отмена', kind: 'ghost', value: null });
  const r = await showSheet({ title: e.item.name,
    body: `<label class="fld big">Цена за ${esc(e.item.unit)}, ₽ — только в этом расчёте<input data-focus inputmode="decimal" id="np" value="${fmtQ(cur)}"></label>
      <p class="hint">В справочнике: ${fmtP(e.item.price)} ₽${e.item.chg ? ' (уже изменена на вкладке «Цены»; было ' + fmtP(e.item.was) + ' ₽)' : ''}. Другие расчёты не затрагиваются.</p>`,
    buttons: btns, collect: w => $('#np', w).value });
  if (r.btn === 'reset') { delete obj.priceOverride[t.id]; }
  else if (r.btn === 'ok') {
    const n = parseNum(r.data);
    if (isNaN(n) || n < 0) return toast('Введите цену числом');
    if (n === e.item.price) delete obj.priceOverride[t.id]; else obj.priceOverride[t.id] = n;
  } else return;
  touch(order); renderObjList(); fillBar(order, obj);
}

/* пикер материалов из библиотеки */
async function pickMaterial(order, obj) {
  const def = productDef(obj.product), idx = itemIndex(obj.product);
  const sugg = (def.suggest || []).map(id => idx.get(id)).filter(Boolean);
  let q = '';
  const open = new Set();
  const itemBtn = (e, sid) => {
    const on = Object.prototype.hasOwnProperty.call(obj.qty, e.item.id);
    return `<button class="pk-item" data-pid="${esc(e.item.id)}"><span class="n">${esc(e.item.name)}</span><span class="p">${e.item.noPrice ? 'нет цены' : fmtP(e.item.price) + '\u00a0₽'}<br>/ ${esc(e.item.unit)}</span>${on ? `<span class="ok">${svg('check')}</span>` : '<span class="plus"></span>'}</button>`;
  };
  const draw = w => {
    const box = $('#pk-list', w), nq = norm(q);
    let h = '';
    if (nq) {
      const res = [];
      def.sections.forEach(sec => (sec.items || []).forEach(it => { if (norm(it.name).includes(nq) || norm(sec.title).includes(nq)) res.push({ item: it, sec }); }));
      h = res.length ? `<div class="pk-box">${res.slice(0, 150).map(itemBtn).join('')}</div>` + (res.length > 150 ? '<p class="hint">Показаны первые 150 — уточните запрос.</p>' : '') : '<div class="empty"><p>Ничего не найдено. Можно добавить «Свою строку».</p></div>';
    } else {
      if (sugg.length) h += `<div class="pk-h">Часто для этого изделия</div><div class="pk-box">${sugg.map(itemBtn).join('')}</div>`;
      h += `<div class="pk-h">Весь справочник</div>`;
      def.sections.forEach(sec => {
        const isOpen = open.has(sec.id);
        h += `<button class="pk-sec" data-psec="${esc(sec.id)}"><span>${esc(sec.title)}</span><small>${(sec.items || []).length}</small>${svg('chev')}</button>`;
        if (isOpen) h += `<div class="pk-box">${(sec.items || []).map(it => itemBtn({ item: it, sec })).join('')}</div>`;
      });
    }
    box.innerHTML = h;
  };
  await showSheet({ title: 'Материал', tall: true,
    body: `<div class="search">${svg('search')}<input class="inp" type="search" id="pk-q" placeholder="Поиск по справочнику" autocomplete="off"></div><div id="pk-list"></div>`,
    buttons: [{ label: 'Готово', kind: 'go', value: 'ok', primary: true }],
    onOpen: w => {
      draw(w);
      $('#pk-q', w).oninput = e => { q = e.target.value; draw(w); };
      $('#pk-list', w).onclick = e => {
        const s = e.target.closest('[data-psec]');
        if (s) { const id = s.dataset.psec; open.has(id) ? open.delete(id) : open.add(id); const st = $('#pk-list', w).scrollTop; draw(w); return; }
        const b = e.target.closest('[data-pid]'); if (!b) return;
        const id = b.dataset.pid;
        if (Object.prototype.hasOwnProperty.call(obj.qty, id)) { delete obj.qty[id]; delete obj.priceOverride[id]; }
        else obj.qty[id] = 1;
        touch(order);
        const sc = $('.sheet-body', w).scrollTop; draw(w); $('.sheet-body', w).scrollTop = sc;
      };
    } });
  renderObjList(); fillBar(order, obj);
}

/* ───────────── квадратура фасадов ───────────── */
const isM2 = u => /^(м2|м²|м\.?\s*кв|кв\.?\s*м)/i.test(String(u || '').trim());
const isFacadeSec = sec => /фасад|facade/i.test((sec.title || '') + ' ' + (sec.id || ''));
/** Позиции-фасады изделия (м²), в которые можно записать сумму колонки. */
function facadeCands(obj) {
  const def = productDef(obj.product), out = [];
  if (def.free) {
    const idx = itemIndex(obj.product);
    Object.keys(obj.qty).forEach(id => { const e = idx.get(id); if (e && isM2(e.item.unit)) out.push(e.item); });
  } else {
    def.sections.filter(isFacadeSec).forEach(sec => {
      const its = sec.items || [], m2 = its.filter(i => isM2(i.unit));
      (m2.length ? m2 : its).forEach(i => out.push(i));
    });
  }
  return out;
}
const newRowId = () => 'r' + uid();
function facadeCalc(order, obj) {
  if (S.client || !obj) return;
  if (!obj.facadeCols || !obj.facadeCols.length) obj.facadeCols = KPArea.newCols();
  S.ui.fc = S.ui.fc || 0;
  return facadeLoop(order, obj);
}
async function facadeLoop(order, obj) {
  for (;;) {
    const r = await facadeSheet(order, obj);
    if (r !== 'apply') break;
    if (await facadeApply(order, obj)) break;       // отказались от замены — возвращаемся в шторку
  }
  renderObjList(); fillBar(order, obj);
}
function facadeSheet(order, obj) {
  const cols = obj.facadeCols, cands = facadeCands(obj);
  const free = productDef(obj.product).free;
  let act = Math.min(S.ui.fc || 0, cols.length - 1), lastField = null;
  const candName = id => { const c = cands.find(x => x.id === id); return c ? c.name : ''; };
  const rowHtmlF = r => `<div class="fr" data-r="${r.id}">
      <div class="fr-top"><input class="inp" data-f="label" placeholder="Метка (необязательно)" value="${esc(r.label || '')}" enterkeyhint="next" autocomplete="off">
      <button class="rm" data-rmrow aria-label="Удалить строку">${svg('x')}</button></div>
      <div class="fr-dim"><input class="inp" data-f="wr" inputmode="decimal" placeholder="ширина" value="${esc(r.wr || '')}" enterkeyhint="next" autocomplete="off"><i>×</i>
      <input class="inp" data-f="hr" inputmode="decimal" placeholder="высота" value="${esc(r.hr || '')}" enterkeyhint="next" autocomplete="off"><i>×</i>
      <input class="inp" data-f="nr" inputmode="decimal" placeholder="шт" value="${esc(r.nr || '')}" enterkeyhint="next" autocomplete="off"></div>
      <div class="fr-area">площадь <b data-area>${KPArea.rowArea(r) ? fmtA(KPArea.rowArea(r)) : '—'}</b> м²</div></div>`;
  const drawSums = w => {
    const sm = KPArea.summarize(cols);
    $('#fc-seg', w).innerHTML = cols.map((c, i) => `<button class="${i === act ? 'on' : ''}" data-col="${i}"><span>${esc(c.name || 'Цвет ' + (i + 1))}</span><small>${sm.cols[i].sum ? fmtQ(sm.cols[i].sum) + ' м²' : '—'}</small></button>`).join('');
    const lines = cols.map((c, i) => ({ c, s: sm.cols[i].sum })).filter(x => x.s > 0)
      .map(x => `<div class="ft-l"><span>${esc(x.c.name)}${x.c.item ? ' · ' + esc(candName(x.c.item)) : ' · <em>без позиции</em>'}</span><b>${fmtQ(x.s)} м²</b></div>`).join('');
    $('#fc-foot', w).innerHTML = `<div class="ft-t"><span>Всего</span><b>${fmtQ(sm.total)} м²</b></div>${lines}`;
  };
  const drawCol = w => {
    const c = cols[act];
    $('#fc-name', w).value = c.name || '';
    $('#fc-item', w).innerHTML = `<option value="">не выбрана</option>` + cands.map(i => `<option value="${esc(i.id)}"${c.item === i.id ? ' selected' : ''}>${esc(i.name)}</option>`).join('');
    $('#fc-none', w).hidden = cands.length > 0;
    $('#fc-rows', w).innerHTML = c.rows.length ? c.rows.map(rowHtmlF).join('') : '<p class="hint" style="text-align:center;padding:10px 0">В этом цвете строк пока нет.</p>';
    drawSums(w);
  };
  const addRow = (w, same) => {
    const c = cols[act], last = c.rows[c.rows.length - 1];
    const r = same && last ? Object.assign({}, last, { id: newRowId() }) : { id: newRowId(), label: '', w: null, h: null, n: 1, wr: '', hr: '', nr: '' };
    c.rows.push(r); touch(order); drawCol(w);
    const inp = $(`[data-r="${r.id}"] [data-f="wr"]`, w);
    if (inp) { inp.focus(); try { inp.select(); } catch (e) {} }
    const list = $('.sheet-body', w); list.scrollTop = list.scrollHeight;
  };
  return showSheet({
    title: 'Квадратура фасадов', tall: true,
    body: `<div class="seg fc-seg" id="fc-seg"></div>
      <div class="grid2"><label class="fld">Название цвета<input id="fc-name" autocomplete="off"></label>
      <label class="fld">Позиция-фасад (м²)<select id="fc-item" class="sel"></select></label></div>
      <p class="hint" id="fc-none" hidden>${free ? 'Сначала добавьте в изделие материал в м² (МДФ, плёнка…) — тогда его можно выбрать здесь.' : 'В этом изделии нет позиций в м².'}</p>
      <div id="fc-rows" class="stack"></div>
      <div class="grid2"><button class="btn dashed" data-addrow>${svg('plus')}Строка</button><button class="btn dashed" data-addsame>${svg('plus')}Такая же</button></div>
      <button class="pill fc-plus" data-plus>+ вставить плюс в поле</button>
      <p class="hint">Размеры: число от 10 — миллиметры (396 = 0,396 м), меньше 10 — метры (0,74). Можно суммой: 300+360.</p>
      <div class="fc-foot" id="fc-foot"></div>`,
    buttons: [{ label: 'Применить к количеству', kind: 'go', value: 'apply' }, { label: 'Закрыть', kind: 'ghost', value: null }],
    onOpen: w => {
      drawCol(w);
      // «+» на цифровой клавиатуре телефона нет — кнопка вставляет плюс в активное поле размера
      $('[data-plus]', w).addEventListener('pointerdown', e => e.preventDefault());
      w.addEventListener('focusin', e => { if (e.target.matches('[data-f]')) lastField = e.target; });
      w.addEventListener('click', e => {
        const t = e.target;
        if (t.closest('[data-plus]')) {
          const f = lastField;
          if (!f || !(f.dataset.f === 'wr' || f.dataset.f === 'hr')) return toast('Нажмите на поле ширины или высоты');
          const a = f.selectionStart == null ? f.value.length : f.selectionStart, b = f.selectionEnd == null ? a : f.selectionEnd;
          f.value = f.value.slice(0, a) + '+' + f.value.slice(b); f.focus(); try { f.setSelectionRange(a + 1, a + 1); } catch (_) {}
          f.dispatchEvent(new Event('input', { bubbles: true })); return;
        }
        const seg = t.closest('[data-col]'); if (seg) { act = +seg.dataset.col; S.ui.fc = act; drawCol(w); return; }
        if (t.closest('[data-addrow]')) return addRow(w, false);
        if (t.closest('[data-addsame]')) return addRow(w, true);
        const rm = t.closest('[data-rmrow]');
        if (rm) { const id = rm.closest('[data-r]').dataset.r; cols[act].rows = cols[act].rows.filter(r => r.id !== id); touch(order); drawCol(w); }
      });
      w.addEventListener('change', e => {
        if (e.target.id === 'fc-item') { cols[act].item = e.target.value || null; touch(order); drawSums(w); }
      });
      w.addEventListener('input', e => {
        const t = e.target;
        if (t.id === 'fc-name') { cols[act].name = t.value; touch(order); drawSums(w); return; }
        const f = t.dataset && t.dataset.f; if (!f) return;
        const rowEl = t.closest('[data-r]'), r = cols[act].rows.find(x => x.id === rowEl.dataset.r); if (!r) return;
        if (f === 'label') r.label = t.value;
        else if (f === 'wr') { r.wr = t.value; const m = KPArea.toMeters(t.value); r.w = isNaN(m) ? null : m; t.classList.toggle('bad', t.value.trim() !== '' && isNaN(m)); }
        else if (f === 'hr') { r.hr = t.value; const m = KPArea.toMeters(t.value); r.h = isNaN(m) ? null : m; t.classList.toggle('bad', t.value.trim() !== '' && isNaN(m)); }
        else if (f === 'nr') { r.nr = t.value; const n = KPArea.toCount(t.value); r.n = isNaN(n) ? null : n; t.classList.toggle('bad', isNaN(n)); }
        touch(order);
        const a = KPArea.rowArea(r); $('[data-area]', rowEl).textContent = a ? fmtA(a) : '—';
        drawSums(w);
      });
      w.addEventListener('keydown', e => {
        if (e.key !== 'Enter' || !e.target.matches || !e.target.matches('[data-f]')) return;
        e.preventDefault();
        const all = $$('#fc-rows [data-f]', w), i = all.indexOf(e.target);
        if (i >= 0 && i < all.length - 1) { all[i + 1].focus(); try { all[i + 1].select(); } catch (_) {} }
        else addRow(w, true);                                   // последнее поле → новая строка с теми же размерами
      });
    }
  }).then(r => { S.ui.fc = act; return r.btn; });
}
/** Записать суммы колонок в количества позиций. Возвращает false, если пользователь отказался. */
async function facadeApply(order, obj) {
  const sm = KPArea.summarize(obj.facadeCols);
  const ids = Object.keys(sm.byItem).filter(id => sm.byItem[id] > 0);
  if (!ids.length) { toast(sm.noItem > 0 ? 'Выберите позицию-фасад хотя бы для одного цвета' : 'Нет площади — добавьте размеры'); return true; }
  const idx = itemIndex(obj.product), nameOf = id => (idx.get(id) ? idx.get(id).item.name : id);
  const conf = ids.filter(id => { const cur = obj.qty[id] || 0; return cur > 0 && Math.abs(cur - sm.byItem[id]) > 1e-9; });
  if (conf.length) {
    const txt = conf.map(id => `Заменить ${fmtQ(obj.qty[id])} на ${fmtQ(sm.byItem[id])} (${esc(nameOf(id))})?`).join('<br>');
    if (!await confirmDlg(txt, 'Заменить', false, 'Применить к количеству')) return false;
  }
  obj.facadeLink = obj.facadeLink || {};
  ids.forEach(id => { obj.qty[id] = sm.byItem[id]; obj.facadeLink[id] = sm.byItem[id]; });
  touch(order);
  toast('Количество обновлено' + (sm.noItem > 0 ? ' (цвет без позиции не учтён)' : ''));
  return true;
}

/* ───────────── свои позиции (во всех изделиях) ───────────── */
async function editLine(order, obj, i, key) {
  key = key || 'extraLines';
  const gift = key === 'gifts';
  const coef = obj.coef != null ? obj.coef : productDef(obj.product).coef;
  const hist = KPLines.history(S.orders);
  let carry = null, draft = null;                       // carry — единица и режим цены для «Добавить ещё»; draft — введённое при ошибке
  for (;;) {
    const x = draft || (i != null ? obj[key][i] : { name: '', unit: (carry && carry.unit) || 'шт', price: '', qty: 1, noMarkup: !!(carry && carry.noMarkup) });
    let unit = x.unit || 'шт', mode = x.noMarkup ? 1 : 0;
    const units = KPLines.UNITS.indexOf(unit) < 0 ? KPLines.UNITS.concat([unit]) : KPLines.UNITS;
    const btns = i != null
      ? [{ label: 'Сохранить', kind: 'go', value: 'ok', primary: true }, { label: 'Удалить позицию', kind: 'ghost danger', value: 'del' }, { label: 'Отмена', kind: 'ghost', value: null }]
      : [{ label: 'Добавить', kind: 'go', value: 'ok', primary: true }, { label: 'Добавить ещё', kind: 'ghost', value: 'more' }, { label: 'Отмена', kind: 'ghost', value: null }];
    const r = await showSheet({ title: gift ? (i != null ? 'Подарок' : 'Подарок — своя позиция') : (i != null ? 'Своя позиция' : 'Своя позиция — новая'),
      body: `<label class="fld">Название<input data-focus data-next="#lp" id="ln" list="ln-list" value="${esc(x.name)}" placeholder="Например, розетка" autocomplete="off" enterkeyhint="next"></label>
        <datalist id="ln-list">${hist.slice(0, 80).map(h => `<option value="${esc(h.name)}">`).join('')}</datalist>
        <div class="grid2"><label class="fld">Цена за единицу, ₽<input id="lp" data-next="#lq" inputmode="decimal" value="${x.price === '' || x.price == null ? '' : fmtQ(x.price)}" enterkeyhint="next"></label>
        <label class="fld">Количество<input id="lq" inputmode="decimal" value="${fmtQ(x.qty)}" enterkeyhint="done"></label></div>
        <div class="fld">Единица<div class="chips" id="lu">${units.map(u => `<button class="chip${u === unit ? ' on' : ''}" data-u="${esc(u)}">${esc(u)}</button>`).join('')}</div></div>
        <div class="fld">Цена в этой строке<div class="seg" id="lm"><button data-m="0" class="${mode ? '' : 'on'}">Закупка (×коэф.)</button><button data-m="1" class="${mode ? 'on' : ''}">Для клиента</button></div>
        <span class="hint" id="lh"></span></div>`,
      buttons: btns,
      collect: w => ({ n: $('#ln', w).value.trim(), p: $('#lp', w).value, q: $('#lq', w).value, u: unit, m: mode }),
      onOpen: w => {
        const hint = () => {
          const p = parseNum($('#lp', w).value), q = parseNum($('#lq', w).value);
          const h = $('#lh', w);
          if (isNaN(p)) { h.textContent = mode ? 'Цена пойдёт в расчёт как есть, без коэффициента.' : 'Цена умножается на коэффициент изделия (' + fmtQ(coef) + ').'; return; }
          const cu = KPLines.clientUnitPrice(p, coef, !!mode);
          h.textContent = 'клиенту: ' + money(cu) + ' за ' + unit + (!isNaN(q) && q !== 1 ? ' · на ' + fmtQ(q) + ': ' + money(cu * q) : '') + (mode ? ' (как есть)' : ' (×' + fmtQ(coef) + ')');
        };
        hint();
        $('#lu', w).onclick = e => { const b = e.target.closest('[data-u]'); if (!b) return; unit = b.dataset.u; $$('#lu .chip', w).forEach(c => c.classList.toggle('on', c === b)); hint(); };
        $('#lm', w).onclick = e => { const b = e.target.closest('[data-m]'); if (!b) return; mode = +b.dataset.m; $$('#lm button', w).forEach(c => c.classList.toggle('on', c === b)); hint(); };
        $('#lp', w).addEventListener('input', hint); $('#lq', w).addEventListener('input', hint);
        $('#ln', w).addEventListener('input', e => {       // подсказка: прежние цена, единица и режим для знакомого названия
          if (i != null) return;
          const h = KPLines.find(hist, e.target.value), p = $('#lp', w);
          if (h && !p.value.trim()) {
            p.value = fmtQ(h.price); unit = h.unit; mode = h.noMarkup ? 1 : 0;
            if (!$$('#lu [data-u]', w).some(b => b.dataset.u === unit)) $('#lu', w).insertAdjacentHTML('beforeend', `<button class="chip" data-u="${esc(unit)}">${esc(unit)}</button>`);
            $$('#lu .chip', w).forEach(c => c.classList.toggle('on', c.dataset.u === unit));
            $$('#lm button', w).forEach(c => c.classList.toggle('on', +c.dataset.m === mode));
            hint();
          }
        });
      } });
    if (r.btn === 'del') {
      if (!await confirmDlg('Удалить позицию «' + esc(x.name) + '»?', 'Удалить', true, 'Удаление')) { draft = null; continue; }
      obj[key].splice(i, 1); break;
    }
    if (r.btn !== 'ok' && r.btn !== 'more') break;
    const d = r.data, p = parseNum(d.p), q = parseNum(d.q);
    draft = { name: d.n, unit: d.u, price: isNaN(p) ? '' : p, qty: isNaN(q) ? 1 : q, noMarkup: !!d.m };
    if (!d.n) { toast('Введите название'); continue; }
    if (isNaN(p) || p < 0) { toast('Введите цену числом'); continue; }
    const line = { name: d.n, unit: d.u || 'шт', price: p, qty: isNaN(q) ? 1 : Math.max(0, q) };
    if (d.m) line.noMarkup = true;
    if (i != null) obj[key][i] = line; else obj[key].push(line);
    touch(order); renderObjList(); fillBar(order, obj);
    if (r.btn === 'more') { toast('Добавлено: ' + d.n); carry = { unit: d.u, noMarkup: !!d.m }; draft = null; continue; }
    break;
  }
  touch(order); renderObjList(); fillBar(order, obj);
}

/** Выбор подарка: частые позиции сверху, поиск по справочнику изделия и общей библиотеке, «своя позиция». */
async function pickGift(order, obj) {
  const def = productDef(obj.product);
  const secs = def.free ? def.sections : def.sections.concat(libSections());
  const all = []; secs.forEach(sec => (sec.items || []).forEach(it => all.push({ item: it, sec })));
  const byId = new Map(); all.forEach(e => { if (!byId.has(e.item.id)) byId.set(e.item.id, e); });
  const popular = KPLines.popularGifts(all.map(e => e.item), 12).map(i => byId.get(i.id));
  const priceOf = it => (Object.prototype.hasOwnProperty.call(obj.priceOverride, it.id) ? obj.priceOverride[it.id] : it.price);
  const has = id => (obj.gifts || []).some(g => g.item === id);
  let q = ''; const open = new Set();
  const itemBtn = e => `<button class="pk-item" data-pid="${esc(e.item.id)}"><span class="n">${esc(e.item.name)}</span><span class="p">${e.item.noPrice ? 'нет цены' : fmtP(priceOf(e.item)) + '\u00a0₽'}<br>/ ${esc(e.item.unit)}</span>${has(e.item.id) ? `<span class="ok">${svg('check')}</span>` : '<span class="plus"></span>'}</button>`;
  const draw = w => {
    const nq = norm(q); let h = '';
    if (nq) {
      const res = all.filter(e => norm(e.item.name).includes(nq) || norm(e.sec.title).includes(nq));
      h = res.length ? `<div class="pk-box">${res.slice(0, 150).map(itemBtn).join('')}</div>` : '<div class="empty"><p>Ничего не найдено. Можно добавить «Свою позицию».</p></div>';
    } else {
      if (popular.length) h += `<div class="pk-h">Частые подарки</div><div class="pk-box">${popular.map(itemBtn).join('')}</div>`;
      h += '<div class="pk-h">Весь справочник</div>';
      secs.forEach(sec => {
        h += `<button class="pk-sec" data-psec="${esc(sec.id)}"><span>${esc(sec.title)}</span><small>${(sec.items || []).length}</small>${svg('chev')}</button>`;
        if (open.has(sec.id)) h += `<div class="pk-box">${(sec.items || []).map(it => itemBtn({ item: it, sec })).join('')}</div>`;
      });
    }
    $('#pk-list', w).innerHTML = h;
  };
  const r = await showSheet({ title: 'Подарок клиенту', tall: true,
    body: `<div class="search">${svg('search')}<input class="inp" type="search" id="pk-q" placeholder="Поиск по справочнику" autocomplete="off"></div><div id="pk-list"></div>`,
    buttons: [{ label: 'Готово', kind: 'go', value: 'ok', primary: true }, { label: 'Своя позиция', kind: 'ghost', value: 'own' }],
    onOpen: w => {
      draw(w);
      $('#pk-q', w).oninput = e => { q = e.target.value; draw(w); };
      $('#pk-list', w).onclick = e => {
        const sc = $('.sheet-body', w).scrollTop;
        const s = e.target.closest('[data-psec]');
        if (s) { const id = s.dataset.psec; open.has(id) ? open.delete(id) : open.add(id); draw(w); $('.sheet-body', w).scrollTop = sc; return; }
        const b = e.target.closest('[data-pid]'); if (!b) return;
        const id = b.dataset.pid, en = byId.get(id) || all.find(x => x.item.id === id); if (!en) return;
        obj.gifts = obj.gifts || [];
        const k = obj.gifts.findIndex(g => g.item === id);
        if (k >= 0) obj.gifts.splice(k, 1);
        else obj.gifts.push({ name: en.item.name, unit: en.item.unit || 'шт', price: priceOf(en.item), qty: 1, item: id });
        touch(order); draw(w); $('.sheet-body', w).scrollTop = sc;
      };
    } });
  renderObjList(); fillBar(order, obj);
  if (r.btn === 'own') await editLine(order, obj, null, 'gifts');
}

/* ───────────── фото образцов: хранилище, сжатие ───────────── */
const PH_URL = new Map();
const phStore = mode => idb.transaction('photos', mode).objectStore('photos');
const phPut = (id, blob) => new Promise((res, rej) => {
  if (!idb) return rej(new Error('Фото нельзя сохранить: хранилище браузера недоступно'));
  try { const r = phStore('readwrite').put(blob, id); r.onsuccess = () => res(); r.onerror = () => rej(r.error); } catch (e) { rej(e); }
});
const phGet = id => new Promise(res => {
  if (!idb) return res(null);
  try { const r = phStore('readonly').get(id); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); } catch (e) { res(null); }
});
function phDel(id) {
  try { if (idb) phStore('readwrite').delete(id); } catch (e) {}
  const u = PH_URL.get(id); if (u) { URL.revokeObjectURL(u); PH_URL.delete(id); }
}
async function phUrl(id) {
  if (PH_URL.has(id)) return PH_URL.get(id);
  const b = await phGet(id); if (!b) return null;
  const u = URL.createObjectURL(b); PH_URL.set(id, u); return u;
}
function hydratePhotos(root) { $$('img[data-ph]', root).forEach(async img => { const u = await phUrl(img.dataset.ph); if (u) img.src = u; else img.classList.add('missing'); }); }
function phStats() {
  return new Promise(res => {
    if (!idb) return res({ n: 0, bytes: 0 });
    let n = 0, bytes = 0;
    try {
      const tx = idb.transaction('photos', 'readonly'), rq = tx.objectStore('photos').openCursor();
      rq.onsuccess = () => { const c = rq.result; if (c) { n++; bytes += (c.value && c.value.size) || 0; c.continue(); } };
      tx.oncomplete = () => res({ n, bytes }); tx.onerror = () => res({ n, bytes });
    } catch (e) { res({ n, bytes }); }
  });
}
const blobToDataURL = b => new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(f.result); f.onerror = () => rej(f.error); f.readAsDataURL(b); });
/** Длинная сторона ≤ 1000 px, JPEG 0,75 — чтобы не раздувать память телефона. */
async function compressImage(file) {
  let src, w, h;
  try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); w = src.width; h = src.height; }
  catch (e) {
    src = await new Promise((res, rej) => { const im = new Image(), u = URL.createObjectURL(file); im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = () => rej(new Error('Не удалось открыть фото')); im.src = u; });
    w = src.naturalWidth; h = src.naturalHeight;
  }
  const k = Math.min(1, 1000 / Math.max(w, h)), cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cw, ch); g.drawImage(src, 0, 0, cw, ch);
  if (src.close) src.close();
  return await new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('Не удалось сжать фото'))), 'image/jpeg', 0.75));
}
const allPhotoIds = order => [].concat(...(order.samples || []).map(s => s.photos || []));

/* ───────────── образцы ───────────── */
function sampleNames(cat, q) {
  const cnt = new Map();
  S.orders.forEach(o => (o.samples || []).forEach(s => {
    const n = (s.name || '').trim(); if (!n) return;
    const e = cnt.get(n) || { n, c: 0, same: 0 }; e.c++; if (s.cat === cat) e.same = 1; cnt.set(n, e);
  }));
  const nq = norm(q);
  return Array.from(cnt.values()).filter(e => norm(e.n) !== nq && (!nq || norm(e.n).includes(nq)))
    .sort((a, b) => (b.same - a.same) || (b.c - a.c)).slice(0, 6).map(e => e.n);
}
function samplesHtml(order, ro) {
  const list = order.samples || [];
  if (ro && !list.length) return '';
  const rows = list.map(s => {
    const ob = s.obj && order.objects.find(b => b.id === s.obj);
    const ph = (s.photos || []).slice(0, 3).map((p, i) => `<img data-ph="${esc(p)}" data-act="open-photo" data-i="${i}" alt="">`).join('');
    return `<div class="smp" data-sid="${esc(s.id)}"><div class="smp-ph">${ph}</div>
      <div class="smp-t"${ro ? '' : ' data-act="edit-sample"'}><span class="obj-tag">${esc(s.cat)}</span><b>${esc(s.name || 'Без названия')}</b>${ob ? `<small>${esc(ob.name)}</small>` : ''}${!ro && s.note ? `<small>${esc(s.note)}</small>` : ''}</div></div>`;
  }).join('');
  return `<div class="card stack" id="smp"><h2 style="font-size:17px">Образцы</h2>${rows || '<p class="hint">Образцы цвета и материала, которые вы показывали клиенту: категория, название или код, фото.</p>'}${ro ? '' : `<button class="btn dashed block" data-act="add-sample">${svg('plus')}Образец</button>`}</div>`;
}
async function sampleSheet(order, sid) {
  const ex = sid ? (order.samples || []).find(s => s.id === sid) : null;
  const st = { cat: ex ? ex.cat : (S.ui.lastCat || 'Фасады'), photos: ex ? (ex.photos || []).slice() : [] };
  const added = [], removed = [];
  const objOpts = order.objects.map(b => `<option value="${esc(b.id)}"${ex && ex.obj === b.id ? ' selected' : ''}>${esc(b.name)}</option>`).join('');
  const r = await showSheet({ title: ex ? 'Образец' : 'Новый образец', tall: true,
    body: `<div class="fld">Категория<div class="chips" id="sp-cats">${KPMessage.CATS.map(c => `<button class="chip big" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div></div>
      <label class="fld">Название или код<input data-focus data-next="#sp-note" id="sp-n" value="${esc(ex ? ex.name : '')}" placeholder="Например, Egger W1000 ST9" autocomplete="off" enterkeyhint="next"></label>
      <div class="chips" id="sp-sug"></div>
      <label class="fld">Заметка (необязательно, в сообщение не попадает)<input id="sp-note" value="${esc(ex ? ex.note || '' : '')}" autocomplete="off"></label>
      <label class="fld">К какому изделию (необязательно)<select id="sp-obj" class="sel"><option value="">не привязан</option>${objOpts}</select></label>
      <div class="fld">Фото (до 3)<div class="sp-photos" id="sp-ph"></div>
        <div class="grid2"><button class="btn ghost" data-cam>${svg('camera')}Фото</button><button class="btn ghost" data-gal>Из галереи</button></div>
        <input type="file" id="sp-f1" accept="image/*" capture="environment" hidden><input type="file" id="sp-f2" accept="image/*" multiple hidden></div>`,
    buttons: [{ label: 'Сохранить', kind: 'go', value: 'ok', primary: true }].concat(ex ? [{ label: 'Удалить образец', kind: 'ghost danger', value: 'del' }] : []).concat([{ label: 'Отмена', kind: 'ghost', value: null }]),
    collect: w => ({ n: $('#sp-n', w).value.trim(), note: $('#sp-note', w).value.trim(), obj: $('#sp-obj', w).value || null }),
    onOpen: w => {
      const drawCats = () => $$('#sp-cats .chip', w).forEach(b => b.classList.toggle('on', b.dataset.c === st.cat));
      const drawSug = () => { $('#sp-sug', w).innerHTML = sampleNames(st.cat, $('#sp-n', w).value).map(n => `<button class="chip" data-sug="${esc(n)}">${esc(n)}</button>`).join(''); };
      const drawPh = () => {
        $('#sp-ph', w).innerHTML = st.photos.map((p, i) => `<div class="spp"><img data-ph="${esc(p)}" alt=""><button data-rmph="${i}" aria-label="Убрать фото">${svg('x')}</button></div>`).join('');
        hydratePhotos(w);
        $('[data-cam]', w).disabled = $('[data-gal]', w).disabled = st.photos.length >= 3;
      };
      const addFiles = async files => {
        for (const f of Array.from(files)) {
          if (st.photos.length >= 3) { toast('Не больше 3 фото'); break; }
          try { toast('Обрабатываю фото…'); const b = await compressImage(f); const id = 'p' + uid(); await phPut(id, b); st.photos.push(id); added.push(id); }
          catch (e) { toast(String((e && e.message) || e)); }
        }
        drawPh();
      };
      drawCats(); drawSug(); drawPh();
      $('#sp-cats', w).onclick = e => { const b = e.target.closest('[data-c]'); if (b) { st.cat = b.dataset.c; drawCats(); drawSug(); } };
      $('#sp-n', w).addEventListener('input', drawSug);
      $('#sp-sug', w).onclick = e => { const b = e.target.closest('[data-sug]'); if (b) { $('#sp-n', w).value = b.dataset.sug; drawSug(); } };
      $('#sp-ph', w).onclick = e => {
        const b = e.target.closest('[data-rmph]'); if (!b) return;
        const id = st.photos.splice(+b.dataset.rmph, 1)[0];
        if (added.includes(id)) { added.splice(added.indexOf(id), 1); phDel(id); } else removed.push(id);
        drawPh();
      };
      $('[data-cam]', w).onclick = () => $('#sp-f1', w).click();
      $('[data-gal]', w).onclick = () => $('#sp-f2', w).click();
      $('#sp-f1', w).onchange = e => { addFiles(e.target.files); e.target.value = ''; };
      $('#sp-f2', w).onchange = e => { addFiles(e.target.files); e.target.value = ''; };
    } });
  let keep = false;
  if (r.btn === 'ok') {
    keep = true;
    const d = r.data;
    S.ui.lastCat = st.cat;
    order.samples = order.samples || [];
    if (ex) Object.assign(ex, { cat: st.cat, name: d.n, note: d.note, obj: d.obj, photos: st.photos });
    else order.samples.push({ id: 's' + uid(), cat: st.cat, name: d.n, note: d.note, obj: d.obj, photos: st.photos });
    removed.forEach(phDel);
  } else if (r.btn === 'del' && ex && await confirmDlg('Удалить образец «' + esc(ex.name || 'без названия') + '» вместе с фото?', 'Удалить', true, 'Удаление')) {
    st.photos.concat(removed).forEach(phDel); added.forEach(id => { if (!st.photos.includes(id)) phDel(id); });
    order.samples = order.samples.filter(s => s !== ex); keep = true;
  }
  if (!keep) added.forEach(phDel);                     // отменили — новые фото убираем из хранилища
  touch(order); render();
}
/** Просмотр фото во весь экран (мастер может удалить, клиент — только смотреть). */
function openViewer(ids, idx, onDelete) {
  const w = document.createElement('div'); w.className = 'viewer';
  w.innerHTML = `<div class="vw-top"><button data-vclose aria-label="Закрыть">${svg('x')}</button><span id="vw-n"></span>${onDelete ? `<button data-vdel aria-label="Удалить фото">${svg('trash')}</button>` : '<span></span>'}</div>
    <img id="vw-img" alt=""><button class="vw-nav l" data-vnav="-1" aria-label="Назад">${svg('back')}</button><button class="vw-nav r" data-vnav="1" aria-label="Дальше">${svg('right')}</button>`;
  document.body.appendChild(w); document.body.classList.add('noscroll');
  const show = async () => {
    $('#vw-n', w).textContent = (idx + 1) + ' / ' + ids.length;
    $$('.vw-nav', w).forEach(b => { b.hidden = ids.length < 2; });
    const u = await phUrl(ids[idx]); $('#vw-img', w).src = u || '';
  };
  const close = () => { w.remove(); if (!$('.sheet-wrap')) document.body.classList.remove('noscroll'); };
  w.onclick = async e => {
    if (e.target.closest('[data-vclose]')) return close();
    const n = e.target.closest('[data-vnav]'); if (n) { idx = (idx + +n.dataset.vnav + ids.length) % ids.length; return show(); }
    if (e.target.closest('[data-vdel]') && await confirmDlg('Удалить это фото?', 'Удалить', true, 'Удаление')) { onDelete(ids[idx]); close(); }
  };
  show();
}

/* ───────────── сообщение клиенту ───────────── */
function msgText(o) {
  const res = calcOrd(o), inc = S.ui.inc || new Set();
  const items = o.objects.filter(b => inc.has(b.id)).map(b => { const ro = (res.objects || []).find(x => x.id === b.id); return { name: b.name, price: ro ? ro.price : 0 }; });
  const samples = (o.samples || []).map(s => { const ob = s.obj && o.objects.find(b => b.id === s.obj); return { cat: s.cat, name: s.name, obj: ob ? ob.name : '' }; });
  const gifts = []; let giftValue = 0;
  o.objects.filter(b => inc.has(b.id)).forEach(b => { const ro = (res.objects || []).find(x => x.id === b.id); if (ro) { (ro.gifts || []).forEach(g => gifts.push({ name: g.name, qty: g.qty })); giftValue += ro.giftValue || 0; } });
  return KPMessage.build({ client: o.client, items, samples, gifts, giftValue, now: new Date(), settings: S.msg });
}
function msgRegen(o) {
  const ta = $('#msg-text'); if (!ta) return;
  ta.value = msgText(o); S.ui.msgEdited = false; $('#msg-rebuild').hidden = true; msgFit();
}
function msgFit() { const ta = $('#msg-text'); if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 4, 560) + 'px'; } }
function msgChanged(o) { if (S.ui.msgEdited) { $('#msg-rebuild').hidden = false; } else msgRegen(o); }
function renderMessage(r, app) {
  const o = getOrder(r.oid); if (!o) { go('#/'); return; }
  S.ui.oid = o.id;
  if (!S.ui.inc) { const res = calcOrd(o); S.ui.inc = new Set((res.objects || []).filter(x => x.price > 0).map(x => x.id)); }
  const m = S.msg, nPh = allPhotoIds(o).length, nS = (o.samples || []).length;
  const hasGift = o.objects.some(b => (b.gifts || []).length);
  const sw = (k, label, sub) => `<label class="sw"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span><input type="checkbox" data-sw="${k}"${m[k] ? ' checked' : ''}></label>`;
  const objs = o.objects.map(b => `<label class="sw"><span>${esc(b.name)}</span><input type="checkbox" data-minc="${esc(b.id)}"${S.ui.inc.has(b.id) ? ' checked' : ''}></label>`).join('');
  const tf = (k, label, ta) => `<label class="fld">${label}${ta ? `<textarea class="inp" rows="2" data-ms="${k}">${esc(m[k])}</textarea>` : `<input data-ms="${k}" value="${esc(m[k])}" autocomplete="off">`}</label>`;
  setScreen(app, `<div class="top"><a class="ibtn" href="#/o/${o.id}" aria-label="К заказу">${svg('back')}</a><h1>Сообщение клиенту<span class="sub">${esc(o.client || 'без имени')}</span></h1></div>
    <div class="wrap stack">
      <div class="card stack"><textarea id="msg-text" class="inp ta" rows="10" aria-label="Текст сообщения"></textarea>
        <button class="pill" id="msg-rebuild" data-act="msg-rebuild" hidden>${svg('refresh')}Пересобрать текст (ваши правки пропадут)</button>
        <button class="btn go block" data-act="msg-send">${svg('send')}Отправить</button>
        <button class="btn ghost block" data-act="msg-copy">${svg('copy')}Копировать</button>
        <p class="hint" id="msg-hint">Текст можно править прямо здесь. В сообщении только названия изделий и цены — без себестоимости.</p></div>
      <div class="card stack"><h2 style="font-size:17px">Что показать</h2>
        ${sw('round', 'Округлять цену до тысяч', '374 440 → «около 374 000 ₽»')}${sw('perItem', 'Цены по каждому изделию', 'выкл. — только итог')}
        ${objs ? `<div class="sec-title" style="padding-top:6px">Изделия в сообщении</div>${objs}` : ''}
        ${sw('showSamples', 'Показывать образцы', nS ? 'образцов: ' + nS : 'пока нет образцов')}
        ${nPh ? sw('attachPhotos', 'Прикрепить фото образцов', 'фото: ' + nPh + ' — при отправке') : ''}
        ${hasGift ? sw('showPromo', 'Срок акции на подарок', 'подарок при запуске в работу до даты') + `<label class="fld">Срок акции, дней (0 — без срока)<input data-ms="promoDays" inputmode="numeric" value="${m.promoDays}" autocomplete="off"></label>` : ''}
        ${sw('showAsk', 'Вопрос про замер в конце', 'когда вам удобно — привезу образцы')}</div>
      <div class="settings${S.ui.msgSet ? ' open' : ''}" id="msgset"><button data-act="msg-settings">Настройки сообщения${svg('chev', 'chv')}</button>
        <div class="body">${tf('master', 'Имя мастера')}${tf('greeting', 'Приветствие')}${tf('intro', 'Вступление', 1)}${tf('disclaimer', 'Про предварительную цену', 1)}${tf('samplesTitle', 'Заголовок образцов')}
          ${sw('showTerm', 'Показывать срок и оплату', 'условия из КП — по умолчанию выключено')}${tf('termText', 'Срок', 1)}${tf('payText', 'Оплата', 1)}${tf('promoText', 'Срок акции (дата — {дата})', 1)}${tf('askText', 'Вопрос про замер', 1)}${tf('signature', 'Подпись', 1)}
          <button class="btn ghost block" data-act="msg-reset">Вернуть по умолчанию</button></div></div>
    </div>`);
  msgRegen(o);
  $('#msg-text').addEventListener('input', () => { S.ui.msgEdited = true; msgFit(); });
}
async function samplePhotoFiles(o) {
  const files = [];
  for (const id of allPhotoIds(o).slice(0, 10)) {
    const b = await phGet(id); if (b) files.push(new File([b], 'obrazec-' + (files.length + 1) + '.jpg', { type: b.type || 'image/jpeg' }));
  }
  return files;
}
async function copyText(text) {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch (e) {}
  const ta = $('#msg-text');                                           // запасной путь: выделить текст и скопировать
  if (!ta) return false;
  ta.focus(); ta.select(); ta.setSelectionRange(0, ta.value.length);
  try { return document.execCommand('copy'); } catch (e) { return false; }
}
async function msgCopy(o, afterFail) {
  const text = $('#msg-text').value;
  const ok = await copyText(text);
  const hint = $('#msg-hint');
  if (ok) { hint.textContent = (afterFail ? 'Отправка из браузера здесь недоступна. ' : '') + 'Текст скопирован — вставьте в MAX / Telegram.'; toast('Скопировано'); }
  else { hint.textContent = 'Не удалось скопировать автоматически — текст выделен, скопируйте его вручную (долгое нажатие → «Копировать»).'; const ta = $('#msg-text'); ta.focus(); ta.select(); }
}
async function msgSend(o) {
  const text = $('#msg-text').value;
  if (!text.trim()) return toast('Текст пустой');
  const data = { text };
  if (S.msg.attachPhotos && S.msg.showSamples) {
    const files = await samplePhotoFiles(o);
    if (files.length && navigator.canShare && navigator.canShare({ files })) data.files = files;
  }
  if (navigator.share) {
    try { await navigator.share(data); return; }
    catch (e) {
      if (e && e.name === 'AbortError') return;
      if (data.files) { try { await navigator.share({ text }); toast('Фото не прикрепились — отправлен только текст'); return; } catch (e2) { if (e2 && e2.name === 'AbortError') return; } }
    }
  }
  await msgCopy(o, true);
}

/* ───────────── экран «Настройки» (коэффициент и логистика по умолчанию для каждого изделия) ───────────── */
function renderSettings(app) {
  const baseOf = k => (S.base.products && S.base.products[k]) || ((S.base.presets || {})[k]) || {};
  const rows = productList().map(p => {
    const ps = S.pset[p.key] || {}, b = baseOf(p.key);
    return `<div class="card stack"><h2 style="font-size:17px">${esc(p.name)}</h2><div class="grid2">
      <label class="fld">Коэффициент<input data-ps="coef" data-k="${esc(p.key)}" inputmode="decimal" value="${ps.coef != null ? fmtQ(ps.coef) : ''}" placeholder="${fmtQ(b.coef != null ? b.coef : 1)}"></label>
      <label class="fld">Логистика, ₽<input data-ps="logistics" data-k="${esc(p.key)}" inputmode="decimal" value="${ps.logistics != null ? fmtQ(ps.logistics) : ''}" placeholder="${fmtQ(b.logistics || 0)}"></label></div></div>`;
  }).join('');
  setScreen(app, `<div class="top"><a class="ibtn" href="#/" aria-label="Назад">${svg('back')}</a><h1>Настройки<span class="sub">коэффициент и логистика</span></h1></div>
    <div class="wrap stack"><div class="warnbox" style="background:var(--acc-soft);border-color:#C5D8CE;color:var(--ink)"><b>Цена клиенту = закупка × коэффициент + логистика.</b><br>Эти значения подставляются во все новые и старые расчёты; в «Настройках изделия» внутри заказа можно задать своё значение — оно главнее.</div>
      ${S.personal ? `<div class="card stack"><h2 style="font-size:17px">${svg('lock')} Защита справочника</h2><p class="hint" style="margin:0">Справочник цен расшифрован и хранится на этом телефоне. Если телефон потеряете или отдадите — сотрите его: при следующем запуске снова понадобится пароль. Ваши заказы не удаляются.</p>
        <button class="btn ghost danger block" data-act="lock-erase">Заблокировать и стереть справочник с этого телефона</button></div>` : ''}
      ${rows}<p class="hint">Пустое поле — значение из справочника (серая подсказка). Настройки хранятся только на этом телефоне и входят в файл «Мои цены» и в копию.</p></div>${tabsHtml('')}`);
}
/* ───────────── «Мои цены»: файл ───────────── */
async function importPrices(file) {
  let j;
  try { j = JSON.parse(await file.text()); } catch (e) { return toast('Файл не читается — это не JSON'); }
  const parsed = KPPrices.parseFile(j);
  if (!parsed.ok) return toast(parsed.error);
  const sum = KPPrices.summarize(parsed, S.baseP);
  KPPrices.mergeOver(S.over, parsed, S.baseP);
  KPPrices.mergeSettings(S.pset, parsed);
  saveOver(); lsSet(K.pset, S.pset); buildEff();
  const miss = sum.notFound.slice(0, 10).map(id => `<li><code>${esc(id)}</code></li>`).join('');
  await showSheet({ title: 'Цены загружены',
    body: `<p style="margin:0"><b>Загружено цен: ${sum.loaded}</b>, коэффициентов: ${sum.coefs}, не найдено позиций: ${sum.notFound.length}${sum.bad ? ', пропущено значений: ' + sum.bad : ''}${sum.added ? ', своих позиций: ' + sum.added : ''}.</p>` +
      (miss ? `<p class="hint">Не найдены в справочнике (первые 10):</p><ul style="margin:0;padding-left:20px">${miss}</ul>` : ''),
    buttons: [{ label: 'Готово', kind: 'go', value: 'ok' }] });
  render();
}
function savePricesFile() {
  const blob = new Blob([JSON.stringify(KPPrices.buildFile(S.over, S.pset), null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'kpc-prices.json'; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  toast('Мои цены сохранены: kpc-prices.json');
}

/* ───────────── экран «Цены» ───────────── */
function priceTabs() {
  const t = [];
  FIXED.forEach(k => { if (S.eff.products[k]) t.push({ key: k, name: S.eff.products[k].name || NAMES_FALLBACK[k] }); });
  t.push({ key: 'library', name: 'Материалы' });
  return t;
}
function tabSections(key) { return key === 'library' ? libSections() : (S.eff.products[key] ? S.eff.products[key].sections : []); }
function renderPrices(app) {
  const tabs = priceTabs();
  if (!tabs.find(t => t.key === S.ui.ptab)) S.ui.ptab = tabs[0].key;
  const nChg = Object.keys(S.over.prices || {}).length + (S.over.added || []).length;
  setScreen(app, `<div class="top home"><h1>Цены<span class="sub">справочник закупки</span></h1><button class="pill acc" data-act="add-pos">${svg('plus')}Позиция</button></div>
    <div class="stickytools"><div class="seg">${tabs.map(t => `<button class="${t.key === S.ui.ptab ? 'on' : ''}" data-act="ptab" data-k="${t.key}">${esc(t.name)}</button>`).join('')}</div>
    <div class="search">${svg('search')}<input class="inp" type="search" id="pq" data-in="pq" placeholder="Поиск по позициям" value="${esc(S.ui.pq || '')}" autocomplete="off"></div></div>
    <div class="wrap stack"><div class="card stack"><button class="btn go block" data-act="load-prices">${svg('upload')}Загрузить мои цены (файл)</button>
      <button class="btn ghost block" data-act="save-prices">${svg('save')}Сохранить мои цены (файл)</button><input type="file" id="pfile" accept="application/json,.json" hidden>
      <p class="hint">Файл «kpc-prices.json»: цены по id позиций, коэффициенты и логистика. Цены остаются только на этом телефоне.</p></div><div id="plist" class="stack"></div>
    <button class="btn ghost danger block" data-act="reset-prices"${nChg ? '' : ' disabled style="opacity:.45"'}>Сбросить мои цены${nChg ? ' (правок: ' + nChg + ')' : ''}</button>
    <p class="hint">Изменение цены здесь касается всех расчётов. Чтобы поменять цену только в одном расчёте — нажмите на цену прямо в изделии.</p></div>${tabsHtml('prices')}`);
  renderPList();
}
function renderPList() {
  const box = $('#plist'); if (!box) return;
  const q = norm(S.ui.pq), key = S.ui.ptab;
  let html = '', found = 0;
  tabSections(key).forEach(sec => {
    let items = sec.items || [];
    if (q) items = items.filter(it => norm(it.name).includes(q) || norm(sec.title).includes(q));
    if (q && !items.length) return;
    found += items.length;
    const open = !!q || !!S.ui.popen[key + ':' + sec.id];
    const nch = (sec.items || []).filter(it => it.chg || it.user).length;
    html += `<section class="sec${open ? ' open' : ''}" data-psec="${esc(sec.id)}"><button class="sec-h" data-act="toggle-psec"><span class="st">${esc(sec.title)}</span>
      <span class="badge" data-n="${nch}">${nch || ''}</span><span class="ss">${(sec.items || []).length}</span>${svg('chev', 'chv')}</button>
      <div class="sec-b">${open ? items.map(it => `<div class="row${it.chg || it.user ? ' on' : ''}" data-pid="${esc(it.id)}"><div class="row-top"><span class="row-name">${esc(it.name)}${it.user ? '<span class="xtag">моя</span>' : ''}</span></div>
        <div class="row-bot"><button class="pricebtn${it.chg ? ' chg' : ''}" data-act="edit-gprice"><span>${it.noPrice ? 'цена не задана' : fmtP(it.price) + '\u00a0₽'}</span><i>/ ${esc(it.unit)}</i>${it.chg ? `<em>было ${fmtP(it.was)}</em>` : ''}</button></div></div>`).join('') : ''}</div></section>`;
  });
  if (!found) html = '<div class="empty"><p>Ничего не найдено.</p></div>';
  box.innerHTML = html;
}
async function editGlobalPrice(id) {
  const key = S.ui.ptab;
  let it, sec; tabSections(key).some(s => (s.items || []).some(x => x.id === id && (it = x, sec = s)));
  if (!it) return;
  const added = (S.over.added || []).find(a => a.id === id);
  const body = (added ? `<label class="fld">Название<input id="gn" value="${esc(it.name)}" autocomplete="off"></label><label class="fld">Единица<input id="gu" value="${esc(it.unit)}" autocomplete="off"></label>` : '') +
    `<label class="fld big">Цена за ${esc(it.unit)}, ₽ — во всех расчётах<input ${added ? '' : 'data-focus'} id="gp" inputmode="decimal" value="${fmtQ(it.price)}"></label>` +
    (it.chg ? `<p class="hint">Исходная цена: ${fmtP(it.was)} ₽.</p>` : '');
  const btns = [{ label: 'Сохранить', kind: 'go', value: 'ok', primary: true }];
  if (it.chg || it.mine) btns.push({ label: 'Вернуть исходную цену', kind: 'ghost', value: 'reset' });
  if (added) btns.push({ label: 'Удалить позицию', kind: 'ghost danger', value: 'del' });
  btns.push({ label: 'Отмена', kind: 'ghost', value: null });
  const r = await showSheet({ title: it.name, body, buttons: btns,
    collect: w => ({ p: $('#gp', w).value, n: $('#gn', w) && $('#gn', w).value.trim(), u: $('#gu', w) && $('#gu', w).value.trim() }) });
  if (r.btn === 'reset') delete S.over.prices[id];
  else if (r.btn === 'del') { if (!await confirmDlg('Удалить позицию «' + esc(it.name) + '» из справочника? В расчётах она пропадёт.', 'Удалить', true)) return; S.over.added = S.over.added.filter(a => a.id !== id); }
  else if (r.btn === 'ok') {
    const p = parseNum(r.data.p);
    if (isNaN(p) || p < 0) return toast('Введите цену числом');
    if (added) { added.price = p; if (r.data.n) added.name = r.data.n; if (r.data.u) added.unit = r.data.u; }
    else if (S.baseP.get(id) === p) delete S.over.prices[id]; else S.over.prices[id] = p;
  } else return;
  saveOver(); buildEff(); renderPrices($('#app'));
}
async function addPosition() {
  const key = S.ui.ptab, secs = tabSections(key);
  const r = await showSheet({ title: 'Новая позиция в справочнике',
    body: `<label class="fld">Раздел<select id="as">${secs.map(s => `<option value="${esc(s.id)}">${esc(s.title)}</option>`).join('')}</select></label>
      <label class="fld">Название<input data-focus id="an" placeholder="Например, ручка скоба 128" autocomplete="off"></label>
      <div class="grid2"><label class="fld">Единица<input id="au" value="шт" autocomplete="off"></label><label class="fld">Цена, ₽<input id="ap" inputmode="decimal"></label></div>`,
    buttons: [{ label: 'Добавить', kind: 'go', value: 'ok', primary: true }, { label: 'Отмена', kind: 'ghost', value: null }],
    collect: w => ({ s: $('#as', w).value, n: $('#an', w).value.trim(), u: $('#au', w).value.trim(), p: $('#ap', w).value }) });
  if (r.btn !== 'ok') return;
  const p = parseNum(r.data.p);
  if (!r.data.n) return toast('Введите название');
  if (isNaN(p) || p < 0) return toast('Введите цену числом');
  S.over.added.push({ id: 'u-' + uid(), product: key, section: r.data.s, name: r.data.n, unit: r.data.u || 'шт', price: p });
  S.ui.popen[key + ':' + r.data.s] = true;
  saveOver(); buildEff(); renderPrices($('#app')); toast('Позиция добавлена');
}

/* ───────────── экран «Данные» ───────────── */
function renderData(app) {
  const sw = ('serviceWorker' in navigator)
    ? (navigator.serviceWorker.controller ? '<span class="state-ok">работает</span>' : 'после перезагрузки')
    : '<span class="state-bad">недоступен (нужен HTTPS или localhost)</span>';
  const bytes = JSON.stringify(S.orders).length + JSON.stringify(S.over).length;
  const last = S.meta.lastBackup ? fmtDate(S.meta.lastBackup) + ', ' + new Date(S.meta.lastBackup).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : 'ещё не сохранялась';
  const share = (navigator.canShare && navigator.share) ? `<button class="btn ghost block" data-act="share-backup">${svg('upload')}Отправить копию…</button>` : '';
  phStats().then(st => { const e = $('#ph-stat'); if (e) e.textContent = st.n ? st.n + ' шт., ' + fmtMB(st.bytes) : 'нет'; });
  setScreen(app, `<div class="top home"><h1>Данные<span class="sub">копия, справочник, версия</span></h1></div><div class="wrap stack">
    <div class="card stack"><h2 style="font-size:17px">Резервная копия</h2>
      <p class="hint">Расчёты и правки цен живут только в памяти браузера на этом телефоне. iOS и Android могут её очистить — сохраняйте копию после работы.</p>
      <button class="btn go block" data-act="save-backup">${svg('save')}Сохранить копию</button>${share}
      <button class="btn ghost block" data-act="load-backup">${svg('upload')}Загрузить копию</button>
      <input type="file" id="bfile" accept="application/json,.json" hidden>
      <div class="kv"><span class="muted">Последняя копия</span><b>${last}</b></div></div>
    <div class="card stack"><h2 style="font-size:17px">О приложении</h2><div class="kv">
      <span class="muted">Версия приложения</span><b>${APP_VERSION}</b>
      <span class="muted">Справочник</span><b>${esc(S.base.version != null ? 'v' + S.base.version : '—')}${S.catSrc ? ' · ' + esc(S.catSrc) : ''}</b>
      <span class="muted">Заказов на телефоне</span><b>${S.orders.length}</b>
      <span class="muted">Правок цен / своих позиций</span><b>${Object.keys(S.over.prices).length} / ${S.over.added.length}</b>
      <span class="muted">Фото образцов</span><b id="ph-stat">…</b>
      <span class="muted">Занято в памяти</span><b>${Math.max(1, Math.round(bytes / 1024))} КБ</b>
      <span class="muted">Хранилище</span><b>${esc(S.store || '—')}</b>
      <span class="muted">Постоянное хранилище</span><b>${S.persist === true ? '<span class="state-ok">дано</span>' : S.persist === false ? '<span class="state-bad">не дано</span>' : 'неизвестно'}</b>
      <span class="muted">Офлайн-режим</span><b>${sw}</b></div>
      ${S.persist === true ? '' : '<p class="hint">Браузер не гарантирует, что расчёты сохранятся: при нехватке места или (на iPhone) через несколько дней без открытия он может их стереть. Сохраняйте копию. Установка на экран «Домой» обычно повышает шансы.</p>'}
      <button class="btn ghost block" data-act="reload-catalog">${svg('refresh')}Обновить справочник с сервера</button></div></div>${tabsHtml('data')}`);
}
async function backupObject() {
  const photos = {};
  for (const o of S.orders) for (const id of allPhotoIds(o)) { if (photos[id]) continue; const b = await phGet(id); if (b) photos[id] = await blobToDataURL(b); }
  return { kpcBackup: 1, app: 'raschet-na-telefone', version: APP_VERSION, saved: nowIso(), data: { orders: S.orders, overrides: S.over, msg: S.msg, psettings: S.pset, photos } };
}
async function backupFile() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const name = `kpc-kopiya-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
  const blob = new Blob([JSON.stringify(await backupObject(), null, 1)], { type: 'application/json' });
  return { name, blob };
}
const fmtMB = n => (n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' КБ' : (n / 1048576).toFixed(n < 1048576 * 10 ? 1 : 0).replace('.', ',') + ' МБ');
async function saveBackup() {
  toast('Готовлю копию…');
  const { name, blob } = await backupFile();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  S.meta.lastBackup = nowIso(); saveMeta(); toast('Копия сохранена: ' + name + ' (' + fmtMB(blob.size) + ')'); setTimeout(render, 300);
  if (blob.size > 20 * 1048576) showSheet({ title: 'Копия очень большая', body: `<p style="margin:0">Файл ${fmtMB(blob.size)} — больше 20 МБ. Из-за фото образцов. Такую копию сложно отправлять и держать в мессенджерах; удалите лишние фото в старых заказах.</p>`, buttons: [{ label: 'Понятно', kind: 'go', value: 'ok' }] });
}
async function shareBackup() {
  const { name, blob } = await backupFile();
  const f = new File([blob], name, { type: 'application/json' });
  try { if (navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: 'Копия расчётов' }); S.meta.lastBackup = nowIso(); saveMeta(); render(); } else toast('Отправка файлов не поддерживается — используйте «Сохранить копию»'); }
  catch (e) { if (e && e.name !== 'AbortError') toast('Не удалось отправить'); }
}
async function importBackup(file) {
  let j;
  try { j = JSON.parse(await file.text()); } catch (e) { return toast('Это не файл копии (не читается)'); }
  const d = j && j.kpcBackup && j.data;
  if (!d || !Array.isArray(d.orders)) return toast('Это не файл копии расчётов');
  const inc = d.orders.filter(o => o && o.id).map(fixOrder);
  const r = await showSheet({ title: 'Загрузить копию', body: `<p style="margin:0">В файле: заказов — ${inc.length}${j.saved ? ', сохранён ' + esc(fmtDate(j.saved)) : ''}.<br>Сейчас на телефоне: ${S.orders.length}.</p><p class="hint">«Объединить» добавит заказы из файла, одинаковые заказы заменятся версией из файла. «Заменить всё» удалит текущие данные.</p>`,
    buttons: [{ label: 'Объединить', kind: 'go', value: 'merge' }, { label: 'Заменить всё', kind: 'ghost danger', value: 'replace' }, { label: 'Отмена', kind: 'ghost', value: null }] });
  if (!r.btn) return;
  for (const id of Object.keys(d.photos || {})) {                                  // фото из копии — обратно в хранилище
    try { const b = await (await fetch(d.photos[id])).blob(); await phPut(id, b); } catch (e) {}
  }
  if (d.psettings && typeof d.psettings === 'object') {
    if (r.btn === 'replace') S.pset = d.psettings; else Object.keys(d.psettings).forEach(k => { if (!S.pset[k]) S.pset[k] = d.psettings[k]; });
    lsSet(K.pset, S.pset);
  }
  if (r.btn === 'replace' && d.msg) { S.msg = KPMessage.merge(d.msg); lsSet(K.msg, S.msg); }
  const ov = d.overrides || {}, inO = { prices: ov.prices || {}, added: Array.isArray(ov.added) ? ov.added : [] };
  if (r.btn === 'replace') { S.orders = inc; S.over = inO; }
  else {
    const ids = new Set(inc.map(o => o.id));
    S.orders = inc.concat(S.orders.filter(o => !ids.has(o.id)));
    S.over.prices = Object.assign({}, S.over.prices, inO.prices);
    const have = new Set(S.over.added.map(a => a.id));
    inO.added.forEach(a => { if (!have.has(a.id)) S.over.added.push(a); });
  }
  saveOrders(); saveOver(); buildEff(); toast('Копия загружена'); go('#/');
}

/* ───────────── события ───────────── */
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  const act = t.dataset.act;
  const orderId = () => { const c = t.closest('[data-oid]'); return c && c.dataset.oid; };
  const ctx = currentCtx();
  switch (act) {
    case 'new-order': { const o = newOrder(); go('#/o/' + o.id); break; }
    case 'open-order': go('#/o/' + orderId()); break;
    case 'order-menu': {
      const o = getOrder(orderId()); if (!o) break;
      const v = await menuSheet(o.client || 'Заказ', [{ label: 'Открыть', icon: 'edit', value: 'open' }, { label: 'Дублировать', icon: 'copy', value: 'dup' }, { label: 'Удалить', icon: 'trash', value: 'del', danger: true }]);
      if (v === 'open') go('#/o/' + o.id);
      if (v === 'dup') { dupOrder(o); toast('Заказ продублирован'); render(); }
      if (v === 'del' && await confirmDlg(`Удалить расчёт «${esc(o.client || 'Без клиента')}${o.title ? ' — ' + esc(o.title) : ''}»? Вернуть его будет нельзя.`, 'Удалить', true, 'Удаление')) {
        S.orders = S.orders.filter(x => x.id !== o.id); saveOrders(); allPhotoIds(o).forEach(phDel); render(); toast('Удалено');
      }
      break; }
    case 'add-obj': {
      const o = getOrder(S.ui.oid); if (!o) break;
      const list = productList();
      const v = await menuSheet('Какое изделие добавить?', list.map(p => ({ label: p.name, hint: p.hint, icon: 'plus', value: p.key })));
      if (v) { const b = addObject(o, v); go('#/o/' + o.id + '/' + b.id); }
      break; }
    case 'open-obj': { const c = t.closest('[data-bid]'); go('#/o/' + S.ui.oid + '/' + c.dataset.bid); break; }
    case 'obj-menu': {
      const o = getOrder(S.ui.oid), c = t.closest('[data-bid]'), b = o && o.objects.find(x => x.id === c.dataset.bid); if (!b) break;
      const v = await menuSheet(b.name, [{ label: 'Открыть', icon: 'edit', value: 'open' }, { label: 'Дублировать', icon: 'copy', value: 'dup' }, { label: 'Удалить', icon: 'trash', value: 'del', danger: true }]);
      if (v === 'open') go('#/o/' + o.id + '/' + b.id);
      if (v === 'dup') { dupObject(o, b); render(); }
      if (v === 'del' && await confirmDlg(`Удалить изделие «${esc(b.name)}» из заказа?`, 'Удалить', true, 'Удаление')) { o.objects = o.objects.filter(x => x !== b); (o.samples || []).forEach(sm => { if (sm.obj === b.id) sm.obj = null; }); touch(o); render(); }
      break; }
    case 'client-mode': {
      const o = ctx.order || getOrder(S.ui.oid); if (!o) break;
      S.client = true; S.clientOrder = o.id; S.ui.self = false; render(); break; }
    case 'toggle-self': S.ui.self = !S.ui.self; fillBar(ctx.order || getOrder(S.ui.oid), ctx.obj); break;
    case 'toggle-sec': {
      const sec = t.closest('[data-sec]'), key = ctx.obj.id + ':' + sec.dataset.sec;
      S.ui.open[key] = !sec.classList.contains('open'); const y = window.scrollY; renderObjList(); window.scrollTo(0, y); break; }
    case 'only-sel': S.ui.only = !S.ui.only; t.classList.toggle('on', S.ui.only); renderObjList(); break;
    case 'toggle-settings': S.ui.setOpen = !S.ui.setOpen; $('#setbox').classList.toggle('open', S.ui.setOpen); break;
    case 'inc': case 'dec': {
      const tg = qtyTarget(t), obj = ctx.obj; if (!tg || !obj) break;
      const cur = getQ(obj, tg), step = 1;
      setQ(obj, tg, act === 'inc' ? cur + step : cur - step);
      $('input[data-in=qty]', t.closest('.stepper')).value = fmtQ(getQ(obj, tg));
      saveObjChange(ctx.order); break; }
    case 'edit-price': editPrice(t.closest('[data-row]')); break;
    case 'rm-line': {
      const tg = qtyTarget(t), obj = ctx.obj; if (!tg || !obj) break;
      if (tg.g != null) {
        const nm = (obj.gifts[+tg.g] || {}).name || 'подарок';
        if (!await confirmDlg('Убрать из подарка «' + esc(nm) + '»?', 'Убрать', true, 'Удаление')) break;
        obj.gifts.splice(+tg.g, 1);
      } else if (tg.x != null) {
        const nm = (obj.extraLines[+tg.x] || {}).name || 'строку';
        if (!await confirmDlg('Удалить позицию «' + esc(nm) + '»?', 'Удалить', true, 'Удаление')) break;
        obj.extraLines.splice(+tg.x, 1);
      } else { delete obj.qty[tg.id]; delete obj.priceOverride[tg.id]; if (obj.facadeLink) delete obj.facadeLink[tg.id]; }
      touch(ctx.order); renderObjList(); fillBar(ctx.order, obj); break; }
    case 'add-mat': pickMaterial(ctx.order, ctx.obj); break;
    case 'add-gift': pickGift(ctx.order, ctx.obj); break;
    case 'facade': facadeCalc(ctx.order, ctx.obj); break;
    case 'add-sample': { const o = getOrder(S.ui.oid); if (o) sampleSheet(o, null); break; }
    case 'edit-sample': { const o = getOrder(S.ui.oid), sid = t.closest('[data-sid]').dataset.sid; if (o) sampleSheet(o, sid); break; }
    case 'open-photo': {
      const o = getOrder(S.ui.oid), sid = t.closest('[data-sid]').dataset.sid, sm = o && o.samples.find(s => s.id === sid); if (!sm) break;
      openViewer(sm.photos.slice(), +t.dataset.i || 0, S.client ? null : id => { sm.photos = sm.photos.filter(p => p !== id); phDel(id); touch(o); render(); });
      break; }
    case 'msg-settings': S.ui.msgSet = !S.ui.msgSet; $('#msgset').classList.toggle('open', S.ui.msgSet); break;
    case 'msg-rebuild': msgRegen(getOrder(S.ui.oid)); break;
    case 'msg-reset': S.msg = KPMessage.defaults(); lsSet(K.msg, S.msg); S.ui.msgEdited = false; render(); toast('Настройки сообщения сброшены'); break;
    case 'msg-copy': msgCopy(getOrder(S.ui.oid)); break;
    case 'msg-send': msgSend(getOrder(S.ui.oid)); break;
    case 'add-line': editLine(ctx.order, ctx.obj, null); break;
    case 'ptab': S.ui.ptab = t.dataset.k; renderPrices($('#app')); break;
    case 'toggle-psec': { const sec = t.closest('[data-psec]'), k = S.ui.ptab + ':' + sec.dataset.psec; S.ui.popen[k] = !S.ui.popen[k]; renderPList(); break; }
    case 'edit-gprice': editGlobalPrice(t.closest('[data-pid]').dataset.pid); break;
    case 'add-pos': addPosition(); break;
    case 'reset-prices':
      if (await confirmDlg('Все ваши цены (загруженные и вписанные) и свои позиции будут удалены. Расчёты останутся, но позиции без цены посчитаются как 0. Коэффициенты в «Настройках» не меняются.', 'Сбросить', true, 'Сбросить мои цены')) {
        S.over = { prices: {}, added: [] }; saveOver(); buildEff(); renderPrices($('#app')); toast('Мои цены сброшены');
      }
      break;
    case 'lock-erase':
      if (await confirmDlg('Расшифрованный справочник (цены и коэффициенты) будет удалён с этого телефона, приложение снова спросит пароль. Заказы останутся.', 'Стереть и заблокировать', true, 'Заблокировать')) {
        await secDel('catalog'); lsSet(K.cat, null); S.base = null; S.eff = null; location.hash = '#/'; location.reload();
      }
      break;
    case 'load-prices': $('#pfile').click(); break;
    case 'save-prices': savePricesFile(); break;
    case 'save-backup': saveBackup(); break;
    case 'share-backup': shareBackup(); break;
    case 'load-backup': $('#bfile').click(); break;
    case 'reload-catalog': {
      if (S.personal) {
        toast('Загружаю зашифрованный справочник…');
        let enc; try { const rr = await fetch('data/catalog.enc.json', { cache: 'no-store' }); if (!rr.ok) throw new Error('HTTP ' + rr.status); enc = await rr.json(); } catch (e) { toast('Нет связи — остался прежний справочник'); break; }
        const rp = await showSheet({ title: 'Пароль от справочника', body: '<label class="fld">Пароль<input data-focus id="up" type="password" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false"></label><p class="hint" id="upe" style="color:var(--warn)" hidden></p>',
          buttons: [{ label: 'Обновить', kind: 'go', value: 'ok', primary: true }, { label: 'Отмена', kind: 'ghost', value: null }], collect: w => $('#up', w).value });
        if (rp.btn !== 'ok') break;
        const dr = await tryDecrypt(enc, rp.data);
        if (!dr.ok) { toast(dr.error); break; }
        await secPut('catalog', dr.cat); S.base = dr.cat; buildEff(); toast('Справочник обновлён'); renderData($('#app')); break;
      }
      toast('Загружаю справочник…');
      const ok = await loadCatalog(true);
      if (ok) { buildEff(); toast('Справочник обновлён'); } else toast('Не удалось загрузить — остался прежний');
      renderData($('#app')); break; }
  }
});

document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'bfile' && t.files[0]) { importBackup(t.files[0]); t.value = ''; return; }
  if (t.id === 'pfile' && t.files[0]) { importPrices(t.files[0]); t.value = ''; return; }
  if (t.dataset && (t.dataset.sw || t.dataset.minc) && parseRoute().name === 'msg') {
    const o = getOrder(S.ui.oid); if (!o) return;
    if (t.dataset.sw) { S.msg[t.dataset.sw] = t.checked; lsSet(K.msg, S.msg); }
    else { t.checked ? S.ui.inc.add(t.dataset.minc) : S.ui.inc.delete(t.dataset.minc); }
    msgChanged(o);
  }
});
document.addEventListener('focusin', e => {
  if (e.target.matches('.stepper input')) setTimeout(() => { try { e.target.select(); } catch (_) {} }, 0);
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset && t.dataset.ms && parseRoute().name === 'msg') {                      // настройки сообщения
    S.msg[t.dataset.ms] = t.dataset.ms === 'promoDays' ? Math.max(0, parseInt(t.value, 10) || 0) : t.value; lsSet(K.msg, S.msg);
    const o = getOrder(S.ui.oid); if (o) { clearTimeout(S.ui.mt); S.ui.mt = setTimeout(() => msgChanged(o), 250); }
    return;
  }
  if (t.dataset && t.dataset.ps) {                                                  // «Настройки»: коэффициент / логистика
    const key = t.dataset.k, f = t.dataset.ps, n = parseNum(t.value);
    S.pset[key] = S.pset[key] || {};
    if (t.value.trim() === '') delete S.pset[key][f]; else if (!isNaN(n) && n >= 0 && !(f === 'coef' && n === 0)) S.pset[key][f] = n; else return;
    if (!Object.keys(S.pset[key]).length) delete S.pset[key];
    lsSet(K.pset, S.pset); buildEff(); return;
  }
  const k = t.dataset && t.dataset.in; if (!k) return;
  const ctx = currentCtx(), order = ctx.order || getOrder(S.ui.oid), obj = ctx.obj;
  switch (k) {
    case 'o-client': order.client = t.value; touch(order); break;
    case 'o-title': order.title = t.value; touch(order); break;
    case 'q': S.ui.q = t.value; renderObjList(); break;
    case 'pq': S.ui.pq = t.value; renderPList(); break;
    case 'b-name': obj.name = t.value; touch(order); { const h = $('#objTitle'); if (h) h.firstChild.nodeValue = t.value; } break;
    case 'b-coef': case 'b-log': {
      const f = k === 'b-coef' ? 'coef' : 'logistics', n = parseNum(t.value);
      if (t.value.trim() === '' ) delete obj[f]; else if (!isNaN(n) && n >= 0) obj[f] = n; else break;
      touch(order); fillBar(order, obj); break; }
    case 'qty': {
      const tg = qtyTarget(t); if (!tg || !obj) break;
      const n = parseNum(t.value);
      setQ(obj, tg, isNaN(n) ? 0 : n); saveObjChange(order); break; }
  }
});
document.addEventListener('focusout', e => {            // красиво показать число после ввода
  const t = e.target;
  if (t.matches && t.matches('.stepper input')) { const { obj } = currentCtx(), tg = qtyTarget(t); if (obj && tg) t.value = fmtQ(getQ(obj, tg)); }
});

/* долгое нажатие — выход из режима «клиенту» */
(function () {
  let timer = null, btn = null;
  const stop = () => { clearTimeout(timer); if (btn) btn.classList.remove('hold'); btn = null; };
  document.addEventListener('pointerdown', e => {
    const b = e.target.closest('[data-hold="exit-client"]'); if (!b) return;
    btn = b; requestAnimationFrame(() => b.classList.add('hold'));
    timer = setTimeout(() => { stop(); S.client = false; S.clientOrder = null; render(); toast('Режим клиента выключен'); }, 900);
  });
  ['pointerup', 'pointercancel', 'pointerleave', 'contextmenu'].forEach(ev => document.addEventListener(ev, stop, true));
})();
window.addEventListener('hashchange', render);

/* ───────────── загрузка справочника и запуск ───────────── */
async function loadCatalog(force) {
  const url = DEV_CAT ? 'dev-catalog.json' : 'data/catalog.json';
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (r.status === 404 && !DEV_CAT) {                                   // личная сборка: открытого справочника нет, есть зашифрованный
      const e = await fetch('data/catalog.enc.json', { cache: 'no-store' });
      if (e.ok) { S.enc = await e.json(); return 'enc'; }
    }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (!j.products) throw new Error('нет products');
    S.base = j; S.catSrc = 'с сервера';
    lsSet(K.cat, j);
    return true;
  } catch (err) {
    if (force) return false;
    const c = lsGet(K.cat, null);
    if (c && c.products) { S.base = c; S.catSrc = 'копия на телефоне'; return true; }
    S.loadError = String(err && err.message || err);
    return false;
  }
}
/** Расшифровать справочник паролем: {ok, cat} или {ok: false, error}. */
async function tryDecrypt(enc, pass) {
  try {
    const bytes = await KPCrypto.decryptLoose(enc, pass);
    const cat = JSON.parse(new TextDecoder().decode(bytes));
    if (!cat || !cat.products) throw new Error('в файле нет справочника');
    return { ok: true, cat };
  } catch (e) { return { ok: false, error: KPCrypto.explain(e) }; }
}
/** Полноэкранный ввод пароля; выполняется, когда справочник расшифрован и сохранён в этом телефоне. */
function unlockScreen(enc) {
  return new Promise(res => {
    const app = $('#app'); app.className = 'app'; document.body.classList.remove('bar-on');
    app.innerHTML = `<div class="lock"><form class="card stack lock-card" id="lk-form" autocomplete="off">
      <h1>${svg('lock')} Введите пароль</h1>
      <p class="hint">Справочник цен зашифрован. После ввода он сохранится на этом телефоне, и пароль больше спрашивать не будут (кнопка «Заблокировать» — в «Настройках»).</p>
      <label class="fld">Пароль<div class="pw"><input id="lk-pw" type="password" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go"><button type="button" class="ibtn" id="lk-eye" aria-label="Показать пароль">${svg('eye')}</button></div></label>
      <div class="lk-err" id="lk-err" role="alert" hidden></div>
      <button class="btn go block" id="lk-go" type="submit">Открыть</button></form></div>`;
    const pw = $('#lk-pw'), err = $('#lk-err'), go = $('#lk-go');
    setTimeout(() => pw.focus(), 50);
    $('#lk-eye').onclick = () => { const show = pw.type === 'password'; pw.type = show ? 'text' : 'password'; $('#lk-eye').setAttribute('aria-label', show ? 'Скрыть пароль' : 'Показать пароль'); pw.focus(); };
    $('#lk-form').onsubmit = async e => {
      e.preventDefault();
      if (!pw.value) { err.textContent = 'Введите пароль'; err.hidden = false; return; }
      go.disabled = true; go.textContent = 'Расшифровываю…'; err.hidden = true;
      const r = await tryDecrypt(enc, pw.value);
      if (!r.ok) { err.textContent = r.error; err.hidden = false; go.disabled = false; go.textContent = 'Открыть'; pw.select(); return; }
      try { await secPut('catalog', r.cat); } catch (e2) { toast('Не удалось сохранить справочник на телефоне — пароль будет спрашиваться снова'); }
      res(r.cat);
    };
  });
}
function loadScript(src) {
  return new Promise(res => { const s = document.createElement('script'); s.src = src; s.onload = () => res(true); s.onerror = () => res(false); document.head.appendChild(s); });
}
function fatal(title, text) {
  $('#app').innerHTML = `<div class="errbox"><h2>${esc(title)}</h2><p>${text}</p><button class="btn go" onclick="location.reload()">Повторить</button></div>`;
}
async function boot() {
  await initStorage();
  loadState();
  if (DEV && !window.KPEngine) await loadScript('dev-engine.js');
  if (!window.KPEngine) return fatal('Не загружен движок расчёта', 'Файл <code>engine/engine.js</code> недоступен. Откройте приложение через <code>server.py</code> с компьютера (и один раз — при включённом интернете/Wi-Fi).');
  const saved = DEV ? null : await secGet('catalog');            // личная сборка: справочник уже расшифрован на этом телефоне
  if (saved && saved.products) { S.base = saved; S.catSrc = 'личный, расшифрован'; S.personal = true; }
  else {
    const lc = await loadCatalog();
    if (lc === 'enc') {
      S.personal = true;
      if (!window.KPCrypto) return fatal('Не загружен модуль шифрования', 'Файл <code>crypto.js</code> недоступен.');
      S.base = await unlockScreen(S.enc); S.catSrc = 'личный, расшифрован';
    }
    else if (!lc) return fatal('Нет справочника цен', 'Не удалось загрузить <code>data/catalog.json</code> (' + esc(S.loadError || '') + '). Первый запуск требует связи с компьютером или сервером.');
  }
  buildEff();
  if (DEV) document.title = 'Расчёт (тестовые данные)';
  render();
  if ('serviceWorker' in navigator && !DEV) {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.update().catch(() => {});
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing; if (!nw) return;
        nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('Вышла новая версия', 'Обновить', () => location.reload()); });
      });
    }).catch(() => {});
  }
}
boot();
})();
