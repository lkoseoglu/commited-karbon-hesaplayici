/* =========================================================================
   Turizm hesaplayıcısı — DİL: Türkçe / English  (assets/js/turizm/i18n.js)
   -------------------------------------------------------------------------
   Kaynak dil Türkçedir: kod ve HTML Türkçe metin üretir. İngilizce seçiliyken bu katman
   ekrana çıkan her metni sözlükten (i18n-en.js) çevirir. Böylece mevcut kodun her satırına
   dokunmak gerekmez; yeni bir Türkçe metin eklenip sözlüğe yazılmazsa Türkçe görünür
   (bozulmaz) ve "İngilizce kapsam" testi bunu yakalar (tests/e2e/turizm-en.test.mjs).

   Sözlük anahtarı = ŞABLON: metindeki boşluklar teke indirilir, sayılar {#} olur.
     "Bu tesis 18,9"        → "Bu tesis {#}"        → "This property {#}"  → "This property 18.9"
     "%12 azaltım"          → "{#} azaltım"         → "{#} reduction"      → "12% reduction"
   İngilizce şablonda {#} sırayla doldurulur; sıra farklıysa {#1}, {#2} kullanılır.
   Sayıların kendisi çevrilmez: İngilizce seçiliyken NUM.format zaten 1,234.5 biçiminde yazar;
   yüzde işareti "%12" biçiminde gelirse "12%" yapılır.
   Değişken metin içeren cümleler için PATTERNS (düzenli ifade + işlev) eklenebilir.

   Ekran: document.body bir MutationObserver ile izlenir; eklenen/değişen metin düğümleri ve
   placeholder/title/aria-label/alt öznitelikleri çevrilir. Türkçeye dönünce asıl metin geri konur.
   Çevrilmeyecek bölgeler: translate="no" (kullanıcının yazdığı adlar, dil düğmeleri).

   Dil seçimi: ?lang=en|tr  >  localStorage "turizm.lang"  >  tr.
   Dışa: globalThis.TURIZM.i18n = { lang(), setLang(l), t(s), add(dict), patterns(list), apply(node),
                                    start(), key(s), missing() }
   Olay: dil değişince document'e "turizm:lang" (detail.lang) gönderilir; app.js yeniden çizer.
   ========================================================================= */
(function (root) {
  'use strict';

  var NS = root.TURIZM = root.TURIZM || {};
  var doc = root.document;
  var KEY = 'turizm.lang';
  var DICT = Object.create(null);
  var PATS = [];
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt', 'aria-roledescription'];
  var NUMRE = /%?[-−+]?\d+(?:[.,]\d+)*%?/g;
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, CODE: 0 };
  var lang = initial();
  var observer = null, started = false;
  var miss = Object.create(null);

  function initial() {
    var q = '';
    try { q = (new root.URLSearchParams(root.location.search).get('lang') || '').toLowerCase(); } catch (e) {}
    if (q === 'en' || q === 'tr') { return q; }
    try { var s = root.localStorage.getItem(KEY); if (s === 'en' || s === 'tr') { return s; } } catch (e) {}
    return 'tr';
  }

  function norm(s) { return String(s).replace(/\s+/g, ' ').trim(); }

  /** Metni şablona çevir: { key: "Bu tesis {#}", nums: ["18,9"] } */
  function template(s) {
    var nums = [];
    var key = norm(s).replace(NUMRE, function (m) { nums.push(m); return '{#}'; });
    return { key: key, nums: nums };
  }

  function fixNum(tok) {
    // İngilizcede yüzde işareti sona gelir
    if (lang === 'en' && /^%/.test(tok)) { return tok.slice(1) + '%'; }
    return tok;
  }

  function fill(tpl, nums) {
    var i = 0;
    return tpl.replace(/\{#(\d*)\}/g, function (m, n) {
      var tok = n ? nums[+n - 1] : nums[i++];
      return tok === undefined ? '' : fixNum(tok);
    });
  }

  var TRCH = /[çğıöşüÇĞİÖŞÜ]/;
  /**
   * Çeviri bul. Sıra: 1) şablon sözlüğü, 2) düzenli ifadeler (değişken ad içeren cümleler),
   * 3) birden çok cümleyse cümle cümle (hepsi bulunmalı), 4) " · " ile ayrılmış listeyse parça parça
   * (Türkçe harf içermeyen parçalar, ör. "CHSB 2025", çevrilmeden kalabilir). Bulunamazsa null.
   */
  function lookup(s, depth) {
    depth = depth || 0;
    var tp = template(s);
    if (!tp.key) { return null; }
    var v = DICT[tp.key];
    if (v !== undefined) { return fill(v, tp.nums); }
    var n = norm(s), i;
    for (i = 0; i < PATS.length; i++) {
      var m = n.match(PATS[i].re);
      if (m) { var r = PATS[i].to.apply(null, m); if (r !== null && r !== undefined) { return r; } }
    }
    if (depth > 1) { return null; }
    var parts = n.replace(/([.!?])\s+(?=["“(✓A-ZÇĞİÖŞÜ0-9])/g, '$1\u0001').split('\u0001');
    if (parts.length > 1) {
      var out = [];
      for (i = 0; i < parts.length; i++) {
        var pv = wordy(parts[i]) ? lookup(parts[i], depth + 1) : parts[i];
        if (pv === null) { out = null; break; }
        out.push(pv);
      }
      if (out) { return out.join(' '); }
    }
    if (n.indexOf(' · ') > 0) {
      var segs = n.split(' · '), res = [], any = false;
      for (i = 0; i < segs.length; i++) {
        var g = segs[i];
        if (!wordy(g)) { res.push(g); continue; }
        var gv = lookup(g, depth + 1);
        if (gv === null) { if (TRCH.test(g)) { res = null; break; } res.push(g); } else { res.push(gv); any = true; }
      }
      if (res && any) { return res.join(' · '); }
    }
    return null;
  }

  /** Çevirmeye değer mi? Yalnız sayı ve simgelerden oluşan metinler çevrilmez. */
  function wordy(s) { return /[A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû]/.test(s); }

  /** Kod içinden çeviri: t('Form temizlendi'). Türkçede metni olduğu gibi döndürür. */
  function t(s) {
    if (lang === 'tr' || s === null || s === undefined || !wordy(String(s))) { return s; }
    var v = lookup(String(s));
    if (v === null) { note(s); return s; }
    return v;
  }

  function note(s) { var k = template(s).key; if (k && !(k in miss)) { miss[k] = 1; } }

  /**
   * Çok satırlı düz metin (panoya kopyalanan beyan ve özetler): satır satır çevirir.
   * Baştaki girinti ve madde işareti korunur. Satırın tamamı sözlükte yoksa "Etiket: değer"
   * biçiminde etiket ve değer ayrı ayrı denenir (değer kullanıcının yazdığı bir ad olabilir).
   */
  function tLines(text) {
    if (lang === 'tr' || !text) { return text; }
    return String(text).split('\n').map(function (line) {
      var m = line.match(/^(\s*(?:[•·*\-–—]\s+|\d+[.)]\s+)?)(.*?)(\s*)$/);
      var pre = m[1], body = m[2], post = m[3];
      if (!body || !wordy(body)) { return line; }
      var v = lookup(body);
      if (v === null) {
        var kv = body.match(/^(.+?):\s+(.*)$/);
        if (kv) {
          var lab = lookup(kv[1] + ':'), lab2 = lab === null ? lookup(kv[1]) : null;
          var val = wordy(kv[2]) ? lookup(kv[2]) : kv[2];
          if (lab !== null || lab2 !== null) { v = (lab !== null ? lab : lab2 + ':') + ' ' + (val === null ? kv[2] : val); }
        }
      }
      if (v === null) { note(body); return line; }
      return pre + v + post;
    }).join('\n');
  }

  // ------------------------------------------------------------------ ekrandaki metin
  function skipped(el) {
    for (var e = el; e && e.nodeType === 1; e = e.parentNode) {
      if (SKIP_TAGS[e.tagName]) { return true; }
      if (e.getAttribute('translate') === 'no' || e.hasAttribute('data-en')) { return true; }
    }
    return false;
  }

  /** İngilizcesi elle verilmiş öğe: <span data-en="1,480,000">1.480.000</span> (bağlama göre anlamı değişen
   *  kısa etiketler ve metindeki sabit Türkçe yazımlı sayılar için). */
  function doDataEn(el) {
    var en = el.getAttribute('data-en');
    if (lang === 'en') {
      if (el.textContent !== el.__i18nEnOut) { el.__i18nTr = el.textContent; }
      el.__i18nEnOut = en;
      if (el.textContent !== en) { el.textContent = en; }
    } else if (el.__i18nTr !== undefined) {
      if (el.textContent === el.__i18nEnOut) { el.textContent = el.__i18nTr; }
      el.__i18nTr = undefined; el.__i18nEnOut = undefined;
    }
  }
  function dataEnHost(n) {
    for (var e = n && (n.nodeType === 1 ? n : n.parentNode); e && e.nodeType === 1; e = e.parentNode) {
      if (e.hasAttribute('data-en')) { return e; }
    }
    return null;
  }

  // Sayfanın HTML'inde yazılı (Türkçe yazımlı) sayılar: 1.480.000 → 1,480,000 · 12,5 → 12.5.
  // Yalnız açılışta HTML'de bulunan metin düğümlerine ve placeholder'lara uygulanır; uygulamanın
  // sonradan yazdığı sayılar zaten seçilen dilde biçimlenir (NUM.format), onlara dokunulmaz.
  var TRNUM = /\d{1,3}(?:\.\d{3})+(?:,\d+)?(?!\d|[.,]\d)|\d+,\d+(?!\d|[.,]\d)/g;
  function enNums(s) {
    return s.replace(TRNUM, function (t) {
      var parts = t.replace(/\./g, '').split(',');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return parts.join('.');
    });
  }
  function markStatic(rootEl) {
    var w = doc.createTreeWalker(rootEl, 4, null), n;
    while ((n = w.nextNode())) { n.__i18nStatic = true; }
  }

  function doText(node) {
    var cur = node.nodeValue;
    if (!cur) { return; }
    if (!wordy(cur)) {                                  // yalnız sayı: HTML'deki sabit örnekler (1.480.000)
      if (node.__i18nStatic && (lang === 'tr' ? node.__i18nOut !== undefined : TRNUM.test(cur))) {
        TRNUM.lastIndex = 0;
        if (lang === 'en') {
          if (node.__i18nOut !== cur) { node.__i18nSrc = cur; }
          var o = enNums(node.__i18nSrc); node.__i18nOut = o;
          if (cur !== o) { node.nodeValue = o; }
        }
        else { if (cur === node.__i18nOut) { node.nodeValue = node.__i18nSrc; } node.__i18nOut = undefined; }
      }
      TRNUM.lastIndex = 0;
      return;
    }
    var mine = node.__i18nOut !== undefined && cur === node.__i18nOut;
    var src = mine ? node.__i18nSrc : cur;          // uygulama yeni Türkçe metin yazdıysa onu kaynak al
    if (lang === 'tr') {
      if (mine && src !== cur) { node.nodeValue = src; }
      node.__i18nOut = undefined;
      return;
    }
    if (node.parentNode && skipped(node.parentNode)) { return; }
    var v = lookup(src);
    if (v === null) { note(src); return; }
    var lead = src.match(/^\s*/)[0], trail = src.match(/\s*$/)[0];
    var out = lead + (node.__i18nStatic ? enNums(v) : v) + trail;
    node.__i18nSrc = src; node.__i18nOut = out;
    if (cur !== out) { node.nodeValue = out; }
  }

  function doAttrs(el) {
    if (!el.getAttribute) { return; }
    var store = el.__i18nAttr || (el.__i18nAttr = {});
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i], cur = el.getAttribute(a);
      if (cur === null) { continue; }
      var rec = store[a], mine = rec && cur === rec.out, src = mine ? rec.src : cur;
      if (lang === 'tr') { if (mine && src !== cur) { el.setAttribute(a, src); } store[a] = undefined; continue; }
      var forced = el.getAttribute('data-en-' + a);     // ör. data-en-placeholder="e.g. 26,280"
      if (forced === null && (!wordy(src) || skipped(el))) { continue; }
      var v = forced !== null ? forced : lookup(src);
      if (v === null) { note(src); continue; }
      if (a === 'placeholder' && forced === null) { v = enNums(v); }   // ör. 26.280 → e.g. 26,280
      store[a] = { src: src, out: v };
      if (cur !== v) { el.setAttribute(a, v); }
    }
  }

  function apply(node) {
    if (!node) { return; }
    if (node.nodeType === 3) { doText(node); return; }
    if (node.nodeType === 9) { node = node.documentElement; }
    if (node.nodeType !== 1 && node.nodeType !== 11) { return; }
    if (node.nodeType === 1) {
      if (SKIP_TAGS[node.tagName]) { return; }
      doAttrs(node);
      if (node.hasAttribute('data-en')) { doDataEn(node); return; }
    }
    // data-en öğelerinin içine girilmez (metnini doDataEn yönetir); script/style atlanır
    var w = (node.ownerDocument || doc).createTreeWalker(node, 1 | 4, { acceptNode: function (n) {
      if (n.nodeType === 1) {
        if (SKIP_TAGS[n.tagName]) { return 2; }
        if (n.hasAttribute('data-en')) { doAttrs(n); doDataEn(n); return 2; }
      }
      return 1;
    } });
    var n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) { doText(n); } else { doAttrs(n); }
    }
  }

  function onMutations(list) {
    for (var i = 0; i < list.length; i++) {
      var m = list[i], host = m.type === 'attributes' ? null : dataEnHost(m.target);
      if (host) { doDataEn(host); continue; }           // uygulama data-en öğesine Türkçe yazdı
      if (m.type === 'characterData') { doText(m.target); }
      else if (m.type === 'attributes') { doAttrs(m.target); }
      else { for (var j = 0; j < m.addedNodes.length; j++) { apply(m.addedNodes[j]); } }
    }
  }

  function observe() {
    if (observer || !root.MutationObserver || !doc || !doc.body) { return; }
    observer = new root.MutationObserver(onMutations);
    observer.observe(doc.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  function syncChrome() {
    if (!doc) { return; }
    doc.documentElement.lang = lang;
    if (doc.body) { doc.body.classList.toggle('lang-en', lang === 'en'); }
    if (!doc.__i18nTitle) { doc.__i18nTitle = doc.title; }
    doc.title = lang === 'en' ? (lookup(doc.__i18nTitle) || doc.__i18nTitle) : doc.__i18nTitle;
    var btns = doc.querySelectorAll('[data-lang]');
    for (var i = 0; i < btns.length; i++) { btns[i].setAttribute('aria-pressed', String(btns[i].getAttribute('data-lang') === lang)); }
    if (root.NUM && root.NUM.setLocale) { root.NUM.setLocale(lang); }
  }

  /** Sayfa açılışında bir kez: düğmeleri bağla, durağan metni çevir, izlemeye başla. */
  function start() {
    if (started || !doc || !doc.body) { return; }
    started = true;
    markStatic(doc.body);
    syncChrome();
    if (lang === 'en') { apply(doc.body); }
    observe();
    doc.addEventListener('click', function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest('[data-lang]') : null;
      if (b) { ev.preventDefault(); setLang(b.getAttribute('data-lang')); }
    });
  }

  function setLang(l) {
    l = l === 'en' ? 'en' : 'tr';
    if (l === lang) { return; }
    lang = l;
    try { root.localStorage.setItem(KEY, l); } catch (e) {}
    try {
      if (!root.location || !root.history) { throw 0; }
      var u = new root.URL(root.location.href);
      if (l === 'en') { u.searchParams.set('lang', 'en'); } else { u.searchParams.delete('lang'); }
      root.history.replaceState(root.history.state, '', u.toString());
    } catch (e) {}
    if (root.NUM && root.NUM.setLocale) { root.NUM.setLocale(l); }
    if (!doc || !doc.body) { return; }                  // Node (testler, rapor aracı)
    syncChrome();
    apply(doc.body);                                    // çevir ya da Türkçeyi geri koy
    try { doc.dispatchEvent(new root.CustomEvent('turizm:lang', { detail: { lang: l } })); } catch (e) {}
  }

  function add(dict) { Object.keys(dict).forEach(function (k) { DICT[template(k).key] = dict[k]; }); }
  function patterns(list) { list.forEach(function (p) { PATS.push(p); }); }

  NS.i18n = {
    lang: function () { return lang; },
    setLang: setLang, t: t, tLines: tLines, add: add, patterns: patterns, apply: apply, start: start,
    key: function (s) { return template(s).key; },
    has: function (s) { return lookup(s) !== null; },
    find: function (s) { return lookup(s, 1); },          // düzenli ifadelerin içinden: çeviri ya da null
    missing: function () { return Object.keys(miss); }
  };
  // Node testleri ve sayfa açılmadan önce: sayı biçimi seçilen dile uysun
  if (root.NUM && root.NUM.setLocale) { root.NUM.setLocale(lang); }
})(typeof globalThis !== 'undefined' ? globalThis : self);
