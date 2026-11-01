/* Квадратура фасадов — чистые функции (без DOM), общие для браузера и Node (тест: node app/area_test.js).
 *
 * Как в Excel мастера: несколько колонок («цветов»), в каждой строки «ширина × высота × шт = площадь»,
 * внизу сумма колонки и общая сумма. Размеры: число от 10 — миллиметры (396 = 0,396 м), меньше 10 — метры;
 * можно суммой через «+» (300+360 или 0,3+0,36), запятая и точка — одинаково.
 * Точность: площадь строки показывается до 3 знаков, суммы считаются без промежуточного округления и
 * округляются до 4 знаков (чтобы совпадать с Excel: 4,1551, а не 4,156).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KPArea = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var COLS = 3;
  var r4 = function (x) { return Math.round(x * 1e4 + 1e-9) / 1e4; };
  var r3 = function (x) { return Math.round(x * 1e3 + 1e-9) / 1e3; };
  var r6 = function (x) { return Math.round(x * 1e6) / 1e6; };

  /** Слагаемые из строки «300+360» → [300, 360]; NaN-массив-признак ошибки = null. Пустой хвост («300+») допустим. */
  function terms(s) {
    s = String(s == null ? '' : s).replace(/^\s*=/, '').replace(/[\s\u00a0]/g, '');
    if (s === '') return [];
    var parts = s.split('+');
    if (parts.length > 1 && parts[parts.length - 1] === '') parts.pop();
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].replace(',', '.');
      if (!/^(\d+\.?\d*|\.\d+)$/.test(p)) return null;
      out.push(Number(p));
    }
    return out;
  }
  /** Размер в метрах: каждое слагаемое ≥ 10 — миллиметры. Пусто/ошибка → NaN. */
  function toMeters(s) {
    var t = terms(s);
    if (!t || !t.length) return NaN;
    var sum = 0;
    t.forEach(function (v) { sum += v >= 10 ? v / 1000 : v; });
    return r6(sum);
  }
  /** Количество штук: сумма слагаемых; пусто → 1; ошибка → NaN. */
  function toCount(s) {
    var t = terms(s);
    if (t === null) return NaN;
    if (!t.length) return 1;
    var sum = 0; t.forEach(function (v) { sum += v; });
    return sum;
  }
  /** Площадь строки, м² (не округлена); если размеры не заданы — 0. */
  function rowArea(row) {
    var w = row && row.w, h = row && row.h, n = row && row.n != null ? row.n : 1;
    if (!(w > 0) || !(h > 0) || !(n > 0)) return 0;
    return w * h * n;
  }
  function colSum(col) {
    var s = 0; ((col && col.rows) || []).forEach(function (r) { s += rowArea(r); });
    return r4(s);
  }
  /** Заготовка: три колонки-цвета. */
  function newCols() {
    var a = [];
    for (var i = 1; i <= COLS; i++) a.push({ id: 'c' + i, name: 'Цвет ' + i, item: null, rows: [] });
    return a;
  }
  /** Итоги: суммы колонок, общая сумма, разбивка по позициям (одинаковая позиция в разных колонках складывается). */
  function summarize(cols) {
    var res = { cols: [], total: 0, byItem: {}, noItem: 0 };
    var raw = 0, byRaw = {}, noRaw = 0;
    (cols || []).forEach(function (c) {
      var rows = (c.rows || []), s = 0;
      rows.forEach(function (r) { s += rowArea(r); });
      res.cols.push({ id: c.id, sum: r4(s), item: c.item || null });
      raw += s;
      if (s > 0) { if (c.item) byRaw[c.item] = (byRaw[c.item] || 0) + s; else noRaw += s; }
    });
    res.total = r4(raw);
    res.noItem = r4(noRaw);
    Object.keys(byRaw).forEach(function (k) { res.byItem[k] = r4(byRaw[k]); });
    return res;
  }
  return { terms: terms, toMeters: toMeters, toCount: toCount, rowArea: rowArea, colSum: colSum, newCols: newCols, summarize: summarize, r3: r3, r4: r4 };
});
