/* Сообщение клиенту — чистые функции (без DOM), общие для браузера и Node (тест: node app/message_test.js).
 * В текст попадают только названия изделий и клиентские цены. Себестоимость, прибыль, цены позиций,
 * заметки к образцам и любые внутренние цифры сюда не передаются и не выводятся.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KPMessage = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var CATS = ['Фасады', 'Корпус', 'Столешница', 'Стеновая панель', 'Ручки', 'Другое'];

  function defaults() {
    return {
      master: '',
      greeting: 'Здравствуйте',
      intro: 'Рассчитал для вас ориентировочную стоимость:',
      disclaimer: 'Цена предварительная: точную назову после окончательного проекта и замера.',
      samplesTitle: 'Образцы, которые смотрели на замере:',
      termText: 'Срок изготовления — 25–35 рабочих дней с момента оплаты.',
      payText: 'Оплата: 70 % при запуске в работу, 30 % по завершении работ.',
      signature: '',
      promoText: 'Подарок при запуске в работу до {дата}.',   // срок акции на подарок
      askText: 'Когда вам удобно: на этой неделе или на следующей — привезу образцы и сделаю замер?',
      showPromo: true,      // срок акции (если в заказе есть подарок)
      promoDays: 7,         // через сколько дней от отправки; 0 — без срока
      showAsk: true,        // заключительный вопрос
      showTerm: false,      // срок и оплата — условия из КП, включает мастер сам
      round: true,          // округлять до тысяч
      perItem: true,        // цены по каждому изделию (иначе только итог)
      showSamples: true,
      attachPhotos: true
    };
  }
  /** Настройки: сохранённые поверх значений по умолчанию (пустые строки сохраняются — это осознанная правка). */
  function merge(saved) {
    var d = defaults(), s = saved || {};
    Object.keys(d).forEach(function (k) { if (s[k] !== undefined && s[k] !== null && typeof s[k] === typeof d[k]) d[k] = s[k]; });
    return d;
  }
  /** 374440 → «374 440» (обычный пробел между тысячами). */
  function fmtNum(n) {
    var s = String(Math.round(+n || 0)), neg = s[0] === '-'; if (neg) s = s.slice(1);
    return (neg ? '-' : '') + s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }
  /** До ближайшей тысячи (1500 → 2000, 1499 → 1000); если округление дало бы 0 — оставляем как есть. */
  function roundK(n) {
    n = Math.round(+n || 0);
    var r = Math.round(n / 1000) * 1000;
    return r === 0 && n > 0 ? n : r;
  }
  var MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  /** День + N дней (локальное время, переход через месяц/год — штатно). */
  function addDays(d, n) { var r = new Date(d.getFullYear(), d.getMonth(), d.getDate()); r.setDate(r.getDate() + (+n || 0)); return r; }
  /** 15 ноября (родительный падеж месяца). */
  function fmtDateRu(d) { return d.getDate() + ' ' + MONTHS[d.getMonth()]; }
  function money(n, round) { return fmtNum(round ? roundK(n) : n) + ' ₽'; }

  /**
   * build({client, items: [{name, price}], samples: [{cat, name, obj?}], settings})
   * items — только включённые изделия; с ценой ≤ 0 пропускаются. Итог — сумма точных цен (потом округляется).
   * Одно изделие — без списка, только итоговая строка. Возвращает текст.
   */
  function build(o) {
    var s = merge(o && o.settings), client = String((o && o.client) || '').trim();
    var items = ((o && o.items) || []).filter(function (it) { return it && +it.price > 0; });
    var out = [];
    out.push(client ? s.greeting + ', ' + client + '!' : s.greeting + '!');
    var intro = [];
    if (s.master.trim()) intro.push('Это ' + s.master.trim() + '.');
    if (s.intro.trim()) intro.push(s.intro.trim());
    if (intro.length) out.push(intro.join(' '));
    var about = s.round ? 'около ' : '';
    if (items.length) {
      var total = 0;
      items.forEach(function (it) { total += +it.price; });
      if (s.perItem && items.length > 1) {
        items.forEach(function (it) { out.push('• ' + it.name + ' — ' + about + money(it.price, s.round)); });
      }
      out.push('Итого ориентировочно: ' + about + money(total, s.round) + '.');
    }
    var gifts = ((o && o.gifts) || []).filter(function (g) { return g && String(g.name || '').trim(); });
    if (gifts.length) {
      var names = gifts.map(function (g) { var q = +g.qty; return String(g.name).trim() + (q > 0 && q !== 1 ? ' × ' + q : ''); }).join(', ');
      var gv = +(o && o.giftValue) || 0;
      out.push('🎁 В подарок: ' + names + (gv > 0 ? ', по прайсу это ' + about + money(gv, s.round) : '') + '.');
      var days = Math.floor(+s.promoDays || 0);
      if (s.showPromo && days > 0 && s.promoText.trim()) {
        var when = fmtDateRu(addDays((o && o.now) || new Date(), days));
        out.push(s.promoText.trim().split('{дата}').join(when));
      }
    }
    if (s.disclaimer.trim()) out.push(s.disclaimer.trim());
    var blocks = [out.join('\n')];
    var smp = (o && o.samples) || [];
    if (s.showSamples && smp.length) {
      var lines = [s.samplesTitle.trim()];
      var extra = smp.map(function (x) { return x.cat; }).filter(function (c, i, a) { return c && CATS.indexOf(c) < 0 && a.indexOf(c) === i; });
      CATS.concat(extra).forEach(function (c) {
        var list = smp.filter(function (x) { return (x.cat || 'Другое') === c && String(x.name || '').trim(); });
        if (!list.length) return;
        lines.push(c + ': ' + list.map(function (x) { return String(x.name).trim() + (x.obj ? ' (' + x.obj + ')' : ''); }).join('; '));
      });
      if (lines.length > 1) blocks.push(lines.join('\n'));
    }
    if (s.showTerm) {
      var tp = [s.termText.trim(), s.payText.trim()].filter(Boolean).join(' ');
      if (tp) blocks.push(tp);
    }
    if (s.showAsk && s.askText.trim()) blocks.push(s.askText.trim());
    if (s.signature.trim()) blocks.push(s.signature.trim());
    return blocks.join('\n\n');
  }
  return { CATS: CATS, defaults: defaults, merge: merge, build: build, fmtNum: fmtNum, roundK: roundK, money: money, addDays: addDays, fmtDateRu: fmtDateRu };
});
