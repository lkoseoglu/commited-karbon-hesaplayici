/* =========================================================================
   Türkçe sayı girişi  (assets/js/num-input.js)
   -------------------------------------------------------------------------
   Eski sayfada <input type="number"> kullanılıyordu: "1.480.000" yazan kullanıcı
   1,48 olarak okunuyor, virgül yazınca alan boşalıyordu. Bu modül Türkçe yazımı
   (1.234.567,89) doğru okur, yanlış yazımı SESSİZCE düzeltmek yerine geçersiz sayar.

   parse(text, opts)  → sayı | null (boş) | NaN (geçersiz)
     opts.kind: 'amount' (varsayılan) | 'factor'
       amount : tek noktalı "1.234" binlik ayraçtır (=1234); "12.5" ve "0.5" ondalıktır
       factor : nokta HER ZAMAN ondalıktır (emisyon faktörü "0.469", "2.045" için)
   Her iki durumda:
       "1.234.567,89" → 1234567.89      "1,234,567.89" → 1234567.89
       "1,5" → 1.5                      "-3,2" → -3.2     "%12" → 12
       "1 480 000" → 1480000 (boşluk ve ince boşluk atılır)
       harf içeren metin ("12 kWh") → NaN  (sessizce tahmin edilmez)

   format(x, digits, minDigits) → "1.234,5"   (locale'e bağlı değildir; her ortamda aynı)

   attach(input, opts) → tarayıcıda alanı Türkçe sayı alanı yapar (blur'da biçimler).
   Klasik betik: globalThis.NUM atar.
   ========================================================================= */
(function (root) {
  'use strict';

  function parse(text, opts) {
    opts = opts || {};
    if (text === null || text === undefined) { return null; }
    if (typeof text === 'number') { return isFinite(text) ? text : NaN; }
    var s = String(text).replace(/[\s  ]/g, '');
    if (s === '') { return null; }

    var neg = false;
    if (/^[-−]/.test(s)) { neg = true; s = s.slice(1); }
    else if (s.charAt(0) === '+') { s = s.slice(1); }
    s = s.replace(/^[%₺]/, '').replace(/[%₺]$/, '');
    if (!/^[0-9.,]+$/.test(s) || !/[0-9]/.test(s)) { return NaN; }
    if (opts.allowNegative === false && neg) { return NaN; }

    var hasDot = s.indexOf('.') >= 0, hasComma = s.indexOf(',') >= 0, out;
    if (hasDot && hasComma) {
      // İkisi birlikte: SON görünen ayraç ondalıktır, diğeri binlik gruplamadır
      var dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
      var thou = dec === '.' ? ',' : '.';
      var pos = s.lastIndexOf(dec);
      var ip = s.slice(0, pos), fp = s.slice(pos + 1);
      if (!/^\d+$/.test(fp)) { return NaN; }                          // ondalık kısım yalnız rakam
      var gr = ip.split(thou);
      var okGroups = gr.every(function (g, i) { return i === 0 ? /^\d{1,3}$/.test(g) : /^\d{3}$/.test(g); });
      if (!okGroups) { return NaN; }                                  // ip içinde başka ayraç ya da bozuk gruplama
      out = gr.join('') + '.' + fp;
    } else if (hasComma) {
      var cparts = s.split(',');
      if (cparts.length > 2) {                                       // 1,234,567 → binlik (İngilizce yazım)
        if (!/^\d{1,3}(?:,\d{3})+$/.test(s)) { return NaN; }
        out = cparts.join('');
      } else {
        if (cparts[0] === '' && cparts[1] === '') { return NaN; }
        out = (cparts[0] === '' ? '0' : cparts[0]) + '.' + cparts[1];  // 1,5 → ondalık (Türkçe)
      }
    } else if (hasDot) {
      var dparts = s.split('.');
      if (dparts.length > 2) {                                       // 1.234.567 → binlik
        if (!/^\d{1,3}(?:\.\d{3})+$/.test(s)) { return NaN; }
        out = dparts.join('');
      } else if (opts.kind !== 'factor' && /^[1-9]\d{0,2}\.\d{3}$/.test(s)) {
        out = dparts.join('');                                       // 1.234 → 1234
      } else {
        if (dparts[0] === '' && dparts[1] === '') { return NaN; }
        out = (dparts[0] === '' ? '0' : dparts[0]) + '.' + dparts[1];
      }
    } else {
      out = s;
    }
    var v = Number(out);
    if (!isFinite(v)) { return NaN; }
    return neg ? -v : v;
  }

  function format(x, digits, minDigits) {
    if (typeof x !== 'number' || !isFinite(x)) { return ''; }
    var d = digits === undefined ? 2 : digits, m = minDigits || 0;
    var ax = Math.abs(x);
    var fixed = ax.toFixed(d), parts = fixed.split('.');
    var ip = parts[0], fp = parts[1] || '';
    while (fp.length > m && fp.charAt(fp.length - 1) === '0') { fp = fp.slice(0, -1); }
    ip = ip.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    var isZero = Number(fixed) === 0;
    return (x < 0 && !isZero ? '-' : '') + ip + (fp ? ',' + fp : '');
  }

  /** Alan metnini sayıya çevir: boş → null, geçersiz → NaN */
  function read(input, opts) { return parse(input && input.value, opts); }

  /**
   * Tarayıcıda bir <input>'u Türkçe sayı alanı yap.
   * opts: { kind, digits (varsayılan 2), min, max, onChange(value|null|NaN) }
   * Yazarken biçimlemez (imleç kaymasın); alandan çıkınca "1.480.000" biçimine getirir.
   */
  function attach(input, opts) {
    opts = opts || {};
    if (!input || input.__numAttached) { return; }
    input.__numAttached = true;
    input.setAttribute('inputmode', 'decimal');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');
    function validate() {
      var v = parse(input.value, opts), bad = false, msg = '';
      if (typeof v === 'number' && isNaN(v)) { bad = true; msg = 'Sayı yazın, örn. 1.480.000 veya 12,5'; }
      else if (typeof v === 'number') {
        if (opts.min !== undefined && v < opts.min) { bad = true; msg = 'En az ' + format(opts.min, 6) + ' olabilir'; }
        if (opts.max !== undefined && v > opts.max) { bad = true; msg = 'En fazla ' + format(opts.max, 6) + ' olabilir'; }
      }
      if (bad) { input.setAttribute('aria-invalid', 'true'); input.title = msg; }
      else { input.removeAttribute('aria-invalid'); input.removeAttribute('title'); }
      return { value: v, bad: bad, message: msg };
    }
    input.addEventListener('input', function () { var r = validate(); if (opts.onChange) { opts.onChange(r.bad ? NaN : r.value); } });
    input.addEventListener('blur', function () {
      var r = validate();
      if (!r.bad && typeof r.value === 'number') { input.value = format(r.value, opts.digits === undefined ? 2 : opts.digits); }
    });
  }

  root.NUM = { version: '1.0.0', parse: parse, format: format, read: read, attach: attach };
})(typeof globalThis !== 'undefined' ? globalThis : self);
