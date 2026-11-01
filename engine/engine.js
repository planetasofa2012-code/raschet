/*
 * Движок расчёта изделий (кухня, шкаф, свободные изделия).
 * Чистый JS без зависимостей. UMD: window.KPEngine (браузер) и module.exports (Node).
 * Контракт — 2_tz.md.
 *
 *   KPEngine.calcObject(productDef, object) -> {cost, price, sections, lines, ...}
 *   KPEngine.calcOrder(catalog, order)      -> {total, objects: [{id, name, price, cost}]}
 *   KPEngine.productFor(catalog, key)       -> определение изделия (кухня/шкаф/пресет+библиотека) или null
 *
 * Формулы:
 *   cost  = Σ qty × price(с учётом priceOverride) + Σ extraLines(qty × price)
 *   price = cost × coef + logistics + designerPct × blocksPrice
 *   blocksPrice («общая цена» N6 в Excel кухни) = Σ cost(секции) × section.coef.
 *   Если designerPct = 0 (по умолчанию), формула сводится к cost × coef + logistics.
 * Внутри ничего не округляется; наружу cost/price/суммы — до рубля (Math.round).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KPEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Число или null (пустые строки, NaN, Infinity -> null)
  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    return isFinite(n) ? n : null;
  }
  function or(v, def) {
    var n = num(v);
    return n === null ? def : n;
  }
  function rub(x) {
    // Math.round(-0.5) даёт -0: нормализуем в 0
    var r = Math.round(x);
    return r === 0 ? 0 : r;
  }

  /**
   * Расчёт одного изделия.
   * productDef: {coef, logistics, designerPct?, sections: [{id, title?, coef?, items: [{id, name, unit?, price}]}]}
   * object:     {qty: {id: n}, priceOverride: {id: цена}, extraLines: [{name, unit, price, qty}], coef?, logistics?, designerPct?}
   */
  function calcObject(productDef, object) {
    productDef = productDef || {};
    object = object || {};
    var qty = object.qty || {};
    var over = object.priceOverride || {};
    var coef = or(object.coef, or(productDef.coef, 1));
    var logistics = or(object.logistics, or(productDef.logistics, 0));
    var designerPct = or(object.designerPct, or(productDef.designerPct, 0));

    var lines = [];
    var sections = {};
    var cost = 0;
    var blocksPrice = 0;
    var known = {};

    (productDef.sections || []).forEach(function (sec) {
      var secCost = 0;
      (sec.items || []).forEach(function (it) {
        known[it.id] = true;
        var q = num(qty[it.id]);
        if (!q) return; // пусто, 0 или мусор — позиция не входит
        var ov = num(over[it.id]);
        var price = ov !== null ? ov : or(it.price, 0);
        var sum = q * price;
        secCost += sum;
        lines.push({ id: it.id, name: it.name, unit: it.unit, section: sec.id, qty: q, price: price, sum: rub(sum) });
      });
      sections[sec.id] = { cost: rub(secCost) };
      cost += secCost;
      blocksPrice += secCost * or(sec.coef, coef);
    });

    // свои строки: в справочнике их нет
    // noMarkup: true — цена вписана уже для клиента: идёт в итог как есть, без коэффициента (в себестоимость — без прибыли)
    var extraCost = 0, fixedCost = 0;
    (object.extraLines || []).forEach(function (ex, i) {
      var q = or(ex && ex.qty, 0);
      var price = or(ex && ex.price, 0);
      if (!q) return;
      var sum = q * price;
      extraCost += sum;
      if (ex && ex.noMarkup) fixedCost += sum;
      lines.push({ id: 'extra-' + (i + 1), name: (ex && ex.name) || 'Своя строка', unit: ex && ex.unit,
                   section: 'extra', qty: q, price: price, sum: rub(sum), noMarkup: !!(ex && ex.noMarkup) });
    });
    if (object.extraLines && object.extraLines.length) {
      sections.extra = { cost: rub(extraCost) };
      cost += extraCost;
      blocksPrice += (extraCost - fixedCost) * coef + fixedCost;
    }

    // количества для id, которых нет в изделии (например, позицию убрали из справочника)
    var unknown = Object.keys(qty).filter(function (id) { return !known[id] && num(qty[id]); });

    var designer = designerPct * blocksPrice;
    var price = (cost - fixedCost) * coef + fixedCost + logistics + designer;

    // подарки клиенту: в цену не входят. Для мастера — расход (giftCost, по закупке),
    // клиенту показывается ценность по прайсу (giftValue = закупка × коэффициент; noMarkup — цена как есть)
    var giftCost = 0, giftValue = 0, gifts = [];
    (object.gifts || []).forEach(function (g) {
      var q = or(g && g.qty, 0);
      var p = or(g && g.price, 0);
      if (!q) return;
      var c = q * p;
      var v = g && g.noMarkup ? c : c * coef;
      giftCost += c;
      giftValue += v;
      gifts.push({ name: (g && g.name) || 'Подарок', unit: g && g.unit, qty: q, price: p, cost: rub(c), value: rub(v) });
    });

    return {
      cost: rub(cost),
      price: rub(price),
      giftCost: rub(giftCost),
      giftValue: rub(giftValue),
      gifts: gifts,
      coef: coef,
      logistics: logistics,
      designer: rub(designer),
      blocksPrice: rub(blocksPrice),
      sections: sections,
      lines: lines,
      unknown: unknown
    };
  }

  /**
   * Определение изделия по ключу: kitchen/wardrobe — из products; chest/nightstand/installation/custom —
   * пресет + общая библиотека (suggest — «частые» позиции для пикера).
   */
  function productFor(catalog, key) {
    if (!catalog) return null;
    var p = catalog.products && catalog.products[key];
    if (p) return p;
    var pr = catalog.presets && catalog.presets[key];
    if (!pr) return null;
    return {
      name: pr.name,
      coef: pr.coef,
      logistics: pr.logistics,
      designerPct: pr.designerPct || 0,
      suggest: pr.suggest || [],
      sections: (catalog.library && catalog.library.sections) || [],
      free: true
    };
  }

  /**
   * Расчёт заказа из нескольких изделий.
   * order: {objects: [{id, product, name, qty, priceOverride, extraLines, coef?, logistics?}]}
   */
  function calcOrder(catalog, order) {
    var objects = [];
    var total = 0, giftCost = 0, giftValue = 0;
    ((order && order.objects) || []).forEach(function (obj) {
      var def = productFor(catalog, obj.product);
      var r = calcObject(def || { coef: 1, logistics: 0, sections: [] }, obj);
      var name = obj.name || (def && def.name) || obj.product;
      objects.push({ id: obj.id, name: name, price: r.price, cost: r.cost, giftCost: r.giftCost, giftValue: r.giftValue, gifts: r.gifts });
      total += r.price;
      giftCost += r.giftCost;
      giftValue += r.giftValue;
    });
    return { total: total, giftCost: giftCost, giftValue: giftValue, objects: objects };
  }

  return { calcObject: calcObject, calcOrder: calcOrder, productFor: productFor };
});
