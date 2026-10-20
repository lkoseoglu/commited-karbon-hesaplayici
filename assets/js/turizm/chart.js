/* =========================================================================
   Turizm hesaplayıcısı — NET SIFIR GRAFİĞİ  (assets/js/turizm/chart.js)
   -------------------------------------------------------------------------
   compute().path verisinden SVG çizer: hedef (NZMFH, kesikli), plan (düz), aradaki
   açık (taralı alan), kilometre taşları. Grafik kutunun gerçek genişliğine göre
   çizilir (telefonda yazılar küçülmesin). Renkler CSS sınıflarından gelir
   (turizm-app.css: .ln-target, .ln-plan, .gap-area …) — koyu mod kendiliğinden çalışır.
   Aynı veri, sayfadaki "Tablo görünümü"nde erişilebilir biçimde de durur.
   Dışa: globalThis.TURIZM.chart
   ========================================================================= */
(function (root) {
  'use strict';

  var NS = root.TURIZM = root.TURIZM || {};
  var SVGNS = 'http://www.w3.org/2000/svg';
  var geo = null;          // son çizimin geometrisi (ipucu için)
  var bound = false;

  function s(tag, attrs, text) {
    var e = root.document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (text !== undefined) { e.textContent = text; }
    return e;
  }
  function f(x, d) { return root.NUM.format(x, d === undefined ? 0 : d); }
  function tf(x) { return root.NUM.format(x, Math.abs(x) < 100 ? 1 : 0); }

  function draw(path, ids) {
    var doc = root.document;
    var svg = doc.getElementById(ids.svg), box = doc.getElementById(ids.box), tip = doc.getElementById(ids.tip), empty = doc.getElementById(ids.empty);
    if (!svg || !box) { return; }
    while (svg.firstChild) { svg.removeChild(svg.firstChild); }
    if (tip) { tip.classList.remove('on'); }
    if (!path) {
      geo = null;
      svg.setAttribute('viewBox', '0 0 640 60'); svg.classList.add('is-empty');
      if (empty) { empty.hidden = false; }
      return;
    }
    svg.classList.remove('is-empty');
    if (empty) { empty.hidden = true; }

    var years = path.series.years, tgt = path.series.target, pln = path.series.plan;
    var W = Math.max(300, Math.min(Math.round(box.clientWidth || 640), 960));
    var narrow = W < 480;
    var H = narrow ? 236 : 280, L = narrow ? 44 : 56, R = 18, T = 18, B = 34;
    var x0 = years[0], x1 = years[years.length - 1]; if (x1 <= x0) { x1 = x0 + 1; }
    var ymax = root.NZPATH.niceMax(Math.max(path.baseT, path.planT, 1) * 1.08);
    function X(y) { return L + (y - x0) / (x1 - x0) * (W - L - R); }
    function Y(v) { return T + (1 - Math.max(v, 0) / ymax) * (H - T - B); }
    function pt(y, v) { return X(y).toFixed(1) + ',' + Y(v).toFixed(1); }

    // ızgara ve eksen yazıları
    for (var gi = 0; gi <= 4; gi++) {
      var gv = ymax * gi / 4, gy = Y(gv).toFixed(1);
      svg.appendChild(s('line', { x1: L, y1: gy, x2: W - R, y2: gy, class: 'grid-line' }));
      svg.appendChild(s('text', { x: L - 8, y: (+gy + 4).toFixed(1), 'text-anchor': 'end', class: 'ax' }, f(gv)));
    }
    // açık alanı: plan hedefin üstündeyse
    var fwd = years.map(function (y, k) { return pt(y, Math.max(pln[k], tgt[k])); });
    var bwd = years.map(function (y, k) { return pt(y, tgt[k]); }).reverse();
    svg.appendChild(s('polygon', { points: fwd.concat(bwd).join(' '), class: 'gap-area' }));
    // hedef ve plan
    svg.appendChild(s('polyline', { points: years.map(function (y, k) { return pt(y, tgt[k]); }).join(' '), class: 'ln-target' }));
    svg.appendChild(s('polyline', { points: years.map(function (y, k) { return pt(y, pln[k]); }).join(' '), class: 'ln-plan' }));
    // kilometre taşları
    var labelled = {};
    path.milestones.forEach(function (m) {
      svg.appendChild(s('circle', { cx: X(m.year).toFixed(1), cy: Y(m.allowedTco2e).toFixed(1), r: 3.5, class: 'ms-dot' }));
      if (!labelled[m.year]) {
        labelled[m.year] = true;
        svg.appendChild(s('text', { x: X(m.year).toFixed(1), y: H - 12, 'text-anchor': 'middle', class: 'ax' }, String(m.year)));
      }
    });
    // plan bitiş noktası
    var px = X(Math.min(path.done, x1)), py = Y(path.planT);
    svg.appendChild(s('circle', { cx: px.toFixed(1), cy: py.toFixed(1), r: 4.5, class: 'plan-dot' }));
    var anchor = px > W - 160 ? 'end' : 'start';
    svg.appendChild(s('text', { x: (anchor === 'end' ? px - 10 : px + 10).toFixed(1), y: (py - 10).toFixed(1), 'text-anchor': anchor, class: 'plan-lbl' },
      'Plan ' + tf(path.planT) + ' t'));
    // imleç ve etkileşim alanı
    var cross = s('line', { x1: 0, y1: T, x2: 0, y2: H - B, class: 'cross' });
    svg.appendChild(cross);
    var hit = s('rect', { x: L, y: T, width: W - L - R, height: H - T - B, class: 'hit' });
    svg.appendChild(hit);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    geo = { years: years, tgt: tgt, pln: pln, X: X, Y: Y, W: W, H: H, hit: hit, cross: cross, tip: tip };
    bindHover(hit);
  }

  function bindHover(hit) {
    function move(ev) {
      var G = geo; if (!G || !G.tip) { return; }
      var r = hit.getBoundingClientRect();
      var cx = ev.touches && ev.touches[0] ? ev.touches[0].clientX : ev.clientX;
      var idx = Math.round(((cx - r.left) / (r.width || 1)) * (G.years.length - 1));
      idx = Math.min(Math.max(idx, 0), G.years.length - 1);
      var y = G.years[idx], t = G.tgt[idx], p = G.pln[idx], x = G.X(y);
      G.cross.setAttribute('x1', x); G.cross.setAttribute('x2', x); G.cross.classList.add('on');
      var tip = G.tip;
      while (tip.firstChild) { tip.removeChild(tip.firstChild); }
      var doc = root.document;
      function line(label, val) {
        var d = doc.createElement('div'); d.appendChild(doc.createTextNode(label + ' '));
        var b = doc.createElement('b'); b.textContent = val; d.appendChild(b); tip.appendChild(d);
      }
      var head = doc.createElement('b'); head.textContent = String(y); tip.appendChild(head);
      line('Hedef', tf(t) + ' t'); line('Plan', tf(p) + ' t');
      if (p > t + 1e-9) { line('Açık', tf(p - t) + ' t'); } else { var ok = doc.createElement('div'); ok.textContent = 'Hedefin altında'; tip.appendChild(ok); }
      tip.style.left = (x / G.W * 100) + '%';
      tip.style.top = (G.Y(Math.max(p, t)) / G.H * 100) + '%';
      tip.classList.add('on');
    }
    function out() { if (geo) { geo.cross.classList.remove('on'); if (geo.tip) { geo.tip.classList.remove('on'); } } }
    hit.addEventListener('mousemove', move);
    hit.addEventListener('touchmove', move, { passive: true });
    hit.addEventListener('touchstart', move, { passive: true });
    hit.addEventListener('mouseleave', out);
    hit.addEventListener('touchend', out);
  }

  /** Ekran okuyucu için kısa özet */
  function describe(path) {
    if (!path) { return 'Net sıfır patikası: veri bekleniyor.'; }
    var parts = ['Baz yıl ' + path.baseYear + ': bina enerjisi ' + tf(path.baseT) + ' tCO₂e.'];
    path.evaluation.forEach(function (e) {
      parts.push(e.year + ' hedefi ' + tf(e.targetTco2e) + ', plan ' + tf(e.planTco2e) + (e.met ? ' (hedefte).' : ' (açık ' + tf(e.gapTco2e) + ').'));
    });
    return parts.join(' ');
  }

  NS.chart = { draw: draw, describe: describe, isBound: function () { return bound; } };
})(typeof globalThis !== 'undefined' ? globalThis : self);
