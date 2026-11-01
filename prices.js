/* «Мои цены» — чистые функции (без DOM), общие для браузера и Node (тест: node app/prices_test.js).
 *
 * Файл kpc-prices.json:
 *   {"format":"kpc-prices","version":1,
 *    "prices":{"<id позиции>": число}, "coef":{"kitchen":2}, "logistics":{"kitchen":6000}, "designerPct":{"kitchen":0}}
 * Все блоки необязательные. Необязательный блок "added" — свои позиции [{id, product, section, name, unit, price}].
 * Цены и коэффициенты живут только на телефоне пользователя; публичная сборка приложения их не содержит.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KPPrices = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var FORMAT = 'kpc-prices';
  var BLOCKS = ['coef', 'logistics', 'designerPct'];

  function num(v) {
    if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
    var n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    return isFinite(n) ? n : null;
  }
  function has(known, id) { return known && typeof known.has === 'function' ? known.has(id) : !!(known && Object.prototype.hasOwnProperty.call(known, id)); }

  /** Разбор файла. Возвращает {ok, error?, prices, coef, logistics, designerPct, added, bad} — bad: сколько значений отброшено. */
  function parseFile(j) {
    if (!j || typeof j !== 'object' || Array.isArray(j) || j.format !== FORMAT) return { ok: false, error: 'Это не файл цен (нет метки «kpc-prices»)' };
    var out = { ok: true, prices: {}, coef: {}, logistics: {}, designerPct: {}, added: [], bad: 0 };
    var p = j.prices && typeof j.prices === 'object' ? j.prices : {};
    Object.keys(p).forEach(function (id) { var n = num(p[id]); if (n === null || n < 0) out.bad++; else out.prices[id] = n; });
    BLOCKS.forEach(function (b) {
      var src = j[b] && typeof j[b] === 'object' ? j[b] : {};
      Object.keys(src).forEach(function (k) {
        var n = num(src[k]);
        if (n === null || n < 0 || (b === 'coef' && n === 0)) out.bad++; else out[b][k] = n;
      });
    });
    if (Array.isArray(j.added)) j.added.forEach(function (a) {
      if (a && a.id && a.name && num(a.price) !== null && num(a.price) >= 0) out.added.push({ id: String(a.id), product: a.product || 'library', section: a.section || '', name: String(a.name), unit: a.unit || 'шт', price: num(a.price) });
      else out.bad++;
    });
    return out;
  }

  /** Сводка: сколько цен загружено, не найдено позиций (id), сколько изделий получили настройки. known — Map/Set/объект с id позиций каталога. */
  function summarize(parsed, known) {
    var ids = Object.keys(parsed.prices), found = [], missing = [];
    ids.forEach(function (id) { (has(known, id) ? found : missing).push(id); });
    var keys = {};
    BLOCKS.forEach(function (b) { Object.keys(parsed[b]).forEach(function (k) { keys[k] = true; }); });
    return { loaded: found.length, notFound: missing, coefs: Object.keys(keys).length, added: parsed.added.length, bad: parsed.bad };
  }

  /** Записать цены из файла в правки (over: {prices, added}) — только найденные позиции; свои позиции добавляются, если id нет. */
  function mergeOver(over, parsed, known) {
    over.prices = over.prices || {}; over.added = over.added || [];
    Object.keys(parsed.prices).forEach(function (id) { if (has(known, id)) over.prices[id] = parsed.prices[id]; });
    var have = {}; over.added.forEach(function (a) { have[a.id] = true; });
    parsed.added.forEach(function (a) { if (!have[a.id]) over.added.push(a); });
    return over;
  }
  /** Записать коэффициенты/логистику/designerPct из файла в глобальные настройки изделий (pset: {kitchen:{coef,...}}). */
  function mergeSettings(pset, parsed) {
    BLOCKS.forEach(function (b) {
      Object.keys(parsed[b]).forEach(function (k) { pset[k] = pset[k] || {}; pset[k][b] = parsed[b][k]; });
    });
    return pset;
  }
  /** Файл «Мои цены» из текущих правок и настроек. */
  function buildFile(over, pset) {
    var f = { format: FORMAT, version: 1, prices: {}, coef: {}, logistics: {}, designerPct: {} };
    Object.keys((over && over.prices) || {}).forEach(function (id) { var n = num(over.prices[id]); if (n !== null) f.prices[id] = n; });
    Object.keys(pset || {}).forEach(function (k) { BLOCKS.forEach(function (b) { var n = num(pset[k] && pset[k][b]); if (n !== null) f[b][k] = n; }); });
    if (over && over.added && over.added.length) f.added = over.added.map(function (a) { return { id: a.id, product: a.product, section: a.section, name: a.name, unit: a.unit, price: a.price }; });
    return f;
  }
  /** Подставить глобальные настройки в справочник (cat изменяется на месте): products.* и presets.*. */
  function applySettings(cat, pset) {
    Object.keys(pset || {}).forEach(function (k) {
      var t = (cat.products && cat.products[k]) || (cat.presets && cat.presets[k]);
      if (!t) return;
      BLOCKS.forEach(function (b) { var n = num(pset[k][b]); if (n !== null) t[b] = n; });
    });
    return cat;
  }
  /** Есть ли в справочнике хоть одна цена больше нуля (или свои позиции). */
  function hasPrices(cat) {
    var found = false;
    function scan(secs) { (secs || []).forEach(function (s) { (s.items || []).forEach(function (it) { if (+it.price > 0) found = true; }); }); }
    Object.keys((cat && cat.products) || {}).forEach(function (k) { scan(cat.products[k].sections); });
    var lib = cat && cat.library;
    scan(Array.isArray(lib) ? lib : lib && lib.sections);
    return found;
  }
  /** Коэффициент «не задан»: в справочнике 1 (публичная сборка), ни в настройках изделия, ни глобально значения нет. */
  function coefUnset(def, obj, pset, key) {
    if (obj && obj.coef != null) return false;
    if (pset && pset[key] && pset[key].coef != null) return false;
    return !(def && +def.coef !== 1);
  }
  return { FORMAT: FORMAT, parseFile: parseFile, summarize: summarize, mergeOver: mergeOver, mergeSettings: mergeSettings, buildFile: buildFile, applySettings: applySettings, hasPrices: hasPrices, coefUnset: coefUnset };
});
