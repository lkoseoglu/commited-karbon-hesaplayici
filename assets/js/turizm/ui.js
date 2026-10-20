/* =========================================================================
   Turizm hesaplayıcısı — ARAYÜZ YARDIMCILARI  (assets/js/turizm/ui.js)
   -------------------------------------------------------------------------
   Küçük DOM yardımcıları, Türkçe sayı biçimleri, çubuk grafik, tablo, bildirim
   (toast) ve panoya kopyalama. Kullanıcıdan gelen metin HER ZAMAN textContent ile
   yazılır (innerHTML yok) — XSS'e kapalı.
   Dışa: globalThis.TURIZM.ui
   ========================================================================= */
(function (root) {
  'use strict';

  var NS = root.TURIZM = root.TURIZM || {};
  var doc = root.document;

  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function el(id) { return doc.getElementById(id); }

  /**
   * Eleman oluştur. attrs: { class, text, html:false (desteklenmez), on:{click:fn}, ...öznitelikler }
   * children: düğüm ya da metin dizisi
   */
  function h(tag, attrs, children) {
    var e = doc.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) { return; }
      if (k === 'class') { e.className = v; }
      else if (k === 'text') { e.textContent = v; }
      else if (k === 'on') { Object.keys(v).forEach(function (ev) { e.addEventListener(ev, v[ev]); }); }
      else if (k === 'value') { e.value = v; }
      else if (k === 'checked' || k === 'selected' || k === 'disabled' || k === 'hidden') { e[k] = !!v; }
      else { e.setAttribute(k, v === true ? '' : String(v)); }
    });
    (children || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) { return; }
      e.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c);
    });
    return e;
  }
  function clear(node) { while (node && node.firstChild) { node.removeChild(node.firstChild); } return node; }
  function setText(id, t) { var e = typeof id === 'string' ? el(id) : id; if (e && e.textContent !== t) { e.textContent = t; } }
  function show(id, on) { var e = typeof id === 'string' ? el(id) : id; if (e) { e.hidden = !on; } }

  // ------------------------------------------------------------------ sayı biçimleri (Türkçe)
  var fmt = {
    n: function (x, d) { return isNum(x) ? root.NUM.format(x, d === undefined ? 1 : d) : '—'; },
    /** ton: 100'ün altında 1 ondalık, üstünde tam sayı */
    t: function (x) { return isNum(x) ? root.NUM.format(x, Math.abs(x) < 100 ? 1 : 0) : '—'; },
    tl: function (x) { return isNum(x) ? root.NUM.format(Math.round(x), 0) : '—'; },
    pct01: function (x) { return isNum(x) ? '%' + root.NUM.format(x * 100, 0) : '—'; },
    pct100: function (x) { return isNum(x) ? '%' + root.NUM.format(x, x > 0 && x < 1 ? 1 : 0) : '—'; },
    year: function (x) { return isNum(x) ? String(Math.round(x)) : '—'; }
  };

  /**
   * Yatay çubuklar. rows: [{label, value, note?, tone?}] — değerler aynı birimde.
   * Boşsa emptyText gösterilir.
   */
  function bars(host, rows, opts) {
    opts = opts || {};
    if (!host) { return; }
    clear(host);
    var list = (rows || []).filter(function (r) { return isNum(r.value) && r.value > 0; });
    if (!list.length) { host.appendChild(h('p', { class: 'empty', text: opts.emptyText || 'Verilerinizi girdikçe burada görünür.' })); return; }
    var mx = 0; list.forEach(function (r) { if (r.value > mx) { mx = r.value; } });
    list.forEach(function (r) {
      var w = Math.max(r.value / mx * 100, 0.8);
      host.appendChild(h('div', { class: 'bar-row' + (r.tone ? ' tone-' + r.tone : '') }, [
        h('div', { class: 'lbl', text: r.label }),
        h('div', { class: 'bar-track', 'aria-hidden': 'true' }, [h('div', { class: 'bar-fill', style: 'width:' + w.toFixed(1) + '%' })]),
        h('div', { class: 'val', text: (opts.format || fmt.t)(r.value) })
      ]));
    });
  }

  /** Tablo gövdesi: rows = [[hücre, ...]] ; hücre metin ya da {text, cls, th} */
  function fillTable(tbody, rows, emptyText, cols) {
    if (!tbody) { return; }
    clear(tbody);
    if (!rows.length && emptyText) {
      tbody.appendChild(h('tr', {}, [h('td', { class: 'empty', colspan: String(cols || 1), text: emptyText })]));
      return;
    }
    rows.forEach(function (r) {
      tbody.appendChild(h('tr', {}, r.map(function (c) {
        var o = (c && typeof c === 'object' && !(c instanceof root.Node)) ? c : { text: c };
        if (o.node) { return h(o.th ? 'th' : 'td', { class: o.cls || null, scope: o.th ? 'row' : null }, [o.node]); }
        return h(o.th ? 'th' : 'td', { class: o.cls || null, scope: o.th ? 'row' : null, text: o.text === undefined ? '' : String(o.text) });
      })));
    });
  }

  // ------------------------------------------------------------------ bildirim ve kopyalama
  var toastTimer = null;
  function toast(msg) {
    var t = el('toast'); if (!t) { return; }
    t.textContent = msg || 'Kopyalandı';
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }
  function copy(text, msg) {
    function fallback() {
      var ta = doc.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.left = '-9999px';
      doc.body.appendChild(ta); ta.select();
      var ok = false; try { ok = doc.execCommand('copy'); } catch (e) { ok = false; }
      doc.body.removeChild(ta);
      toast(ok ? (msg || 'Kopyalandı') : 'Kopyalanamadı — metni seçip elle kopyalayın');
    }
    if (!text) { toast('Önce verilerinizi girin'); return; }
    if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
      root.navigator.clipboard.writeText(text).then(function () { toast(msg || 'Kopyalandı'); }, fallback);
    } else { fallback(); }
  }

  /** Bildirim kutusu: parçalar metin ya da {b:'kalın'} / {button:{text, attrs}} */
  function notice(id, parts, tone) {
    var n = el(id); if (!n) { return; }
    clear(n);
    n.classList.toggle('warn', tone === 'warn');
    (parts || []).forEach(function (p) {
      if (typeof p === 'string') { n.appendChild(doc.createTextNode(p)); }
      else if (p.b) { n.appendChild(h('b', { text: p.b })); }
      else if (p.button) { n.appendChild(h('button', Object.assign({ type: 'button', class: 'linkbtn', text: p.button.text }, p.button.attrs || {}))); }
      else if (p.list) { n.appendChild(h('ul', { class: 'notice-list' }, p.list.map(function (t) { return h('li', { text: t }); }))); }
    });
  }

  NS.ui = { el: el, h: h, clear: clear, setText: setText, show: show, fmt: fmt, bars: bars, fillTable: fillTable,
            toast: toast, copy: copy, notice: notice, isNum: isNum };
})(typeof globalThis !== 'undefined' ? globalThis : self);
