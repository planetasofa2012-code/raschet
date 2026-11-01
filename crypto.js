/* Расшифровка справочника для «личной» сборки (WebCrypto: PBKDF2-HMAC-SHA256 + AES-256-GCM).
 * Общий для браузера и Node (тест: node app/crypto_test.js). Шифрует tools/build_private.py.
 *
 * Формат data/catalog.enc.json:
 *   {"format":"kpc-enc","v":1,"kdf":"PBKDF2-SHA256","iter":600000,"salt":"<b64>","nonce":"<b64>","ct":"<b64>"}
 *   ct = шифртекст + 16-байтовый тег GCM; ключ = PBKDF2(фраза в UTF-8, соль, iter, SHA-256) → 256 бит.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KPCrypto = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** code: 'nosubtle' | 'format' | 'badpass' */
  function CryptoError(code, message) { this.name = 'CryptoError'; this.code = code; this.message = message; }
  CryptoError.prototype = Object.create(Error.prototype);

  function b64(s) {
    var bin = atob(String(s || ''));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function getSubtle(subtle) {
    var s = subtle || (typeof crypto !== 'undefined' && crypto.subtle);
    if (!s) throw new CryptoError('nosubtle', 'Шифрование доступно только по HTTPS (или на localhost)');
    return s;
  }
  function check(enc) {
    if (!enc || enc.format !== 'kpc-enc' || enc.v !== 1 || enc.kdf !== 'PBKDF2-SHA256') throw new CryptoError('format', 'Файл справочника не распознан');
    var iter = +enc.iter;
    if (!(iter >= 100000 && iter <= 5000000)) throw new CryptoError('format', 'Файл справочника повреждён (параметры)');
    try {
      var salt = b64(enc.salt), nonce = b64(enc.nonce), ct = b64(enc.ct);
      if (salt.length < 8 || nonce.length !== 12 || ct.length < 17) throw new Error('len');
      return { iter: iter, salt: salt, nonce: nonce, ct: ct };
    } catch (e) { throw new CryptoError('format', 'Файл справочника повреждён'); }
  }

  /** Расшифровать: возвращает Uint8Array с открытым текстом. Неверная фраза → CryptoError('badpass'). */
  async function decrypt(enc, pass, subtle) {
    var s = getSubtle(subtle), p = check(enc);
    var km = await s.importKey('raw', new TextEncoder().encode(String(pass)), 'PBKDF2', false, ['deriveKey']);
    var key = await s.deriveKey({ name: 'PBKDF2', salt: p.salt, iterations: p.iter, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    try { return new Uint8Array(await s.decrypt({ name: 'AES-GCM', iv: p.nonce }, key, p.ct)); }
    catch (e) { throw new CryptoError('badpass', 'Неверный пароль'); }
  }
  /** То же, но если с пробелами по краям не вышло — пробуем без них (телефонная клавиатура любит дописывать пробел). */
  async function decryptLoose(enc, pass, subtle) {
    try { return await decrypt(enc, pass, subtle); }
    catch (e) {
      if (e && e.code === 'badpass' && String(pass).trim() !== String(pass) && String(pass).trim()) return decrypt(enc, String(pass).trim(), subtle);
      throw e;
    }
  }
  /** Сообщение об ошибке для человека. */
  function explain(e) {
    if (e && e.name === 'CryptoError') return e.message;
    return 'Не удалось расшифровать: ' + ((e && e.message) || e);
  }
  return { CryptoError: CryptoError, decrypt: decrypt, decryptLoose: decryptLoose, explain: explain, b64: b64 };
});
