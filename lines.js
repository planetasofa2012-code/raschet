/* Свои позиции — чистые функции (без DOM), общие для браузера и Node (тест: node app/lines_test.js). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KPLines = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var UNITS = ['шт', 'м', 'м²', 'лист', 'комплект'];

  /** Цена для клиента за единицу: закупка умножается на коэффициент изделия, «для клиента» — как есть. */
  function clientUnitPrice(price, coef, noMarkup) {
    var p = +price;
    if (!isFinite(p) || p < 0) return 0;
    if (noMarkup) return p;
    var k = +coef;
    return p * (isFinite(k) ? k : 1);
  }

  /**
   * Ранее введённые свои позиции по всем заказам: самые свежие первыми, без повторов по названию.
   * orders — массив заказов (objects[].extraLines[]); порядок свежести: updated || created.
   */
  function history(orders) {
    var list = (orders || []).slice().sort(function (a, b) {
      return String(b.updated || b.created || '').localeCompare(String(a.updated || a.created || ''));
    });
    var seen = {}, out = [];
    list.forEach(function (o) {
      (o.objects || []).forEach(function (b) {
        (b.extraLines || []).slice().reverse().forEach(function (x) {
          var name = String((x && x.name) || '').trim(), key = name.toLowerCase().replace(/ё/g, 'е');
          if (!name || seen[key]) return;
          seen[key] = true;
          out.push({ name: name, unit: x.unit || 'шт', price: +x.price || 0, noMarkup: !!x.noMarkup });
        });
      });
    });
    return out;
  }
  /** Найти запись истории по названию (без учёта регистра и ё/е). */
  function find(hist, name) {
    var key = String(name || '').trim().toLowerCase().replace(/ё/g, 'е');
    if (!key) return null;
    for (var i = 0; i < hist.length; i++) if (hist[i].name.toLowerCase().replace(/ё/g, 'е') === key) return hist[i];
    return null;
  }
  var GIFT_WORDS = ['подсветк', 'подключ', 'довод', 'лент', 'ручк'];
  /** «Частые подарки»: позиции с этими словами в названии; порядок — по списку слов, затем по алфавиту; без повторов по названию. */
  function popularGifts(items, limit) {
    var seen = {}, list = [];
    (items || []).forEach(function (it) {
      var n = String((it && it.name) || '').toLowerCase().replace(/ё/g, 'е');
      var k = -1;
      for (var i = 0; i < GIFT_WORDS.length; i++) if (n.indexOf(GIFT_WORDS[i]) >= 0) { k = i; break; }
      if (k < 0 || seen[n]) return;
      seen[n] = true; list.push({ it: it, k: k, n: n });
    });
    list.sort(function (a, b) { return a.k - b.k || (a.n < b.n ? -1 : a.n > b.n ? 1 : 0); });
    return list.slice(0, limit || 12).map(function (x) { return x.it; });
  }
  return { GIFT_WORDS: GIFT_WORDS, popularGifts: popularGifts, UNITS: UNITS, clientUnitPrice: clientUnitPrice, history: history, find: find };
});
