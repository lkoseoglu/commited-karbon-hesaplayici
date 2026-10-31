/* =========================================================================
   Turizm hesaplayıcısı — OTEL PANELİ: ÇİZİM  (assets/js/turizm/dashboard-view.js)
   -------------------------------------------------------------------------
   dashboard.js'in modelini ekrana çizer:
     · üst alan: tesisin kendi eş derinlik çizgileri (rapor kapağıyla aynı desen) üstünde
       oda-gece başına karbon, kıyas notu ve A–E kıyas şeridi; panel ilk açıldığında
       çizgiler soldan taranır, tesis işareti yerine iner ve bir "sonar" halkası yayılır
     · gösterge kartları (önceki yıl ve segment kıyası, yıllar çizgisi)
     · yıllara göre sütun grafik, emisyon kaynakları, net sıfır yolu,
       eylem planı (önlem ekle / çıkar), karbon dışı göstergeler, hazırlık ve paylaşım
   Renkler yalnız CSS sınıflarından gelir (turizm-app.css + theme-sea.css): koyu mod
   kendiliğinden çalışır. Kullanıcı metni her zaman textContent ile yazılır.
   Önlem ekleme / çıkarma, rapor ve gezinme düğmeleri data-dash-act ile app.js'e gider.
   ctx.readOnly (yönetim paneli, turizm-admin.html): aynı panel düğmesiz çizilir; önlem ekle / çıkar,
   kaydet, rapor ve "veri girin" bağlantıları yerine yalnız bilgi kalır.
   Dışa: globalThis.TURIZM.dashView = { render(host, model, ctx), redraw() }
   ========================================================================= */
(function (root) {
  'use strict';

  var NS = root.TURIZM = root.TURIZM || {};
  var doc = root.document;
  var SVGNS = 'http://www.w3.org/2000/svg';
  var ui = { metric: 'total', tables: {}, introDone: false };
  var last = null;           // { host, model, ctx }
  var resizeTimer = null;
  var ro = false;            // salt okunur çizim (ctx.readOnly): render() başında ayarlanır

  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function U() { return NS.ui; }
  function h(tag, attrs, kids) { return U().h(tag, attrs, kids); }
  function n(x, d) { return isNum(x) ? root.NUM.format(x, d === undefined ? 1 : d) : '—'; }
  function n1(x) { return n(x, 1); }
  function pct(x, d) { return isNum(x) ? '%' + n(x, d === undefined ? 0 : d) : '—'; }
  function money(x) {
    if (!isNum(x)) { return '—'; }
    var a = Math.abs(x);
    return a >= 1e9 ? n(x / 1e9, 1) + ' milyar TL' : a >= 1e6 ? n(x / 1e6, 1) + ' milyon TL' : n(Math.round(x), 0) + ' TL';
  }
  function reduced() { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); }

  function s(tag, attrs, text) {
    var e = doc.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] !== null && attrs[k] !== undefined) { e.setAttribute(k, attrs[k]); } });
    if (text !== undefined) { e.textContent = text; }
    return e;
  }

  // ------------------------------------------------------------------ simgeler (currentColor)
  var ICONS = {
    down: 'M8 3v9M4 8.5 8 12.5l4-4',
    up: 'M8 13V4M4 7.5 8 3.5l4 4',
    same: 'M3.5 8h9',
    check: 'M3.5 8.5 6.5 11.5 12.5 4.5',
    alert: 'M8 4v5M8 11.6v.2',
    plus: 'M8 3.5v9M3.5 8h9',
    x: 'M4.5 4.5l7 7M11.5 4.5l-7 7',
    info: 'M8 7.2v4.3M8 4.6v.2',
    lever: 'M3 12.5h10M5 12.5V8l3-4 3 4v4.5'
  };
  function icon(name, cls) {
    var g = s('svg', { viewBox: '0 0 16 16', width: '16', height: '16', 'aria-hidden': 'true', focusable: 'false', class: 'ic' + (cls ? ' ' + cls : '') });
    if (name === 'alert' || name === 'info') { g.appendChild(s('circle', { cx: '8', cy: '8', r: '6.5', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5' })); }
    g.appendChild(s('path', { d: ICONS[name] || '', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    return g;
  }
  function tone(better) { return better === true ? 'good' : better === false ? 'bad' : 'same'; }
  function deltaLine(d, cls) {
    if (!d) { return null; }
    var t = tone(d.better);
    return h('p', { class: (cls || 'dln') + ' ' + t }, [icon(d.dir === 'same' ? 'same' : d.dir), h('span', { text: d.text })]);
  }

  // ------------------------------------------------------------------ eksen yardımcıları
  function niceStep(raw) {
    if (!(raw > 0)) { return 1; }
    var e = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), m = raw / e;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * e;
  }
  function ticks(max, count) {
    var step = niceStep(max / (count || 4)), top = Math.ceil(max / step) * step, out = [];
    for (var v = 0; v <= top + step * 1e-9; v += step) { out.push(v); }
    return { top: top, list: out, step: step };
  }
  function tickText(v, step) { return n(v, step < 1 ? (step < 0.1 ? 2 : 1) : 0); }

  // ------------------------------------------------------------------ ipucu
  function tipShow(tip, box, x, y, rows) {
    U().clear(tip);
    rows.forEach(function (r, i) { tip.appendChild(h(i === 0 ? 'span' : (r.strong ? 'b' : 'span'), { class: r.cls || null, text: r.text })); });
    tip.classList.add('on');
    var bw = box.clientWidth, tw = tip.offsetWidth, th = tip.offsetHeight;
    var left = Math.min(Math.max(x - tw / 2, 0), Math.max(bw - tw, 0));
    tip.style.left = left + 'px';
    tip.style.top = Math.max(y - th - 10, 0) + 'px';
  }
  function tipHide(tip) { tip.classList.remove('on'); }

  // ------------------------------------------------------------------ üst alan
  var BAND = [['A', 0.4, 0.6], ['B', 0.6, 0.85], ['C', 0.85, 1.15], ['D', 1.15, 1.5], ['E', 1.5, 1.8]];
  function scalePos(ratio) { return Math.min(Math.max((ratio - 0.4) / 1.4, 0), 1); }
  function clampPct(p, lo, hi) { return Math.min(Math.max(p, lo), hi); }

  var isoCache = { seed: null, paths: [] };
  /** Tesisin kendi eş derinlik çizgileri (rapor kapağıyla aynı üretici; ad, şehir ve yıldan, her seferinde aynı) */
  function isoSvg(m) {
    var g = s('svg', { class: 'dh-iso', viewBox: '0 0 300 100', preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true', focusable: 'false' });
    var R = NS.report && NS.report._isobaths;
    if (!R) { return g; }
    var seed = (m.name || '') + '|' + (m.city || '') + '|' + (m.year || '') + '|panel', paths = [];
    if (isoCache.seed === seed) { paths = isoCache.paths; }
    else { try { paths = R(seed, 300, 100, 18, 1.6); } catch (e) { paths = []; } isoCache = { seed: seed, paths: paths }; }
    paths.forEach(function (p) { g.appendChild(s('path', { d: p.d, class: p.index ? 'ix' : null })); });
    return g;
  }

  function hero(m) {
    var H = m.hero, kids = [];
    kids.push(isoSvg(m));
    var meta = [m.year ? m.year + ' sonuçları' : 'Bu yılın sonuçları', m.city, isNum(m.rooms) ? n(m.rooms, 0) + ' oda' : null, m.segmentLabel].filter(Boolean).join(', ');
    kids.push(h('div', { class: 'dh-top' }, [
      h('div', { class: 'dh-id' }, [
        m.logo ? h('span', { class: 'dh-logo' }, [h('img', { src: m.logo, alt: m.name + ' logosu' })]) : null,
        h('div', {}, [h('h2', { id: 'dash-h', text: m.name }), h('p', { class: 'dh-meta', text: meta })])
      ]),
      m.sample ? h('span', { class: 'dh-chip', text: 'Örnek veriler: gerçek bir tesis değil' }) : null
    ]));

    var ratioTxt = '';
    if (isNum(H.ratio)) {
      var p = Math.round(Math.abs(1 - H.ratio) * 100);
      ratioTxt = p < 3 ? 'tesisiniz ortalamada' : 'tesisiniz %' + p + (H.ratio < 1 ? ' altında' : ' üzerinde');
    }
    var refTxt = H.refIsCustom ? 'Kendi referansınız ' + n1(H.ref) + ' kg' : (m.segmentLabel || 'Segment') + ' ortalaması ' + n1(H.ref) + ' kg';
    kids.push(h('div', { class: 'dh-main' }, [
      h('div', { class: 'dh-fig' }, [
        h('p', { class: 'dh-lbl', text: 'Satılan oda-gece başına karbon' }),
        h('p', { class: 'dh-num' }, [
          h('span', { class: 'dh-val', 'aria-hidden': 'true', 'data-count': isNum(H.cpor) ? String(H.cpor) : null, text: n1(H.cpor) }),
          h('span', { class: 'dh-unit', 'aria-hidden': 'true', text: 'kg CO₂e' }),
          h('span', { class: 'sr-only', text: n1(H.cpor) + ' kg CO₂e satılan oda-gece başına' })]),
        deltaLine(H.delta, 'dh-delta')
      ]),
      H.grade ? h('div', { class: 'dh-grade' }, [
        h('span', { class: 'dh-badge', 'data-grade': H.grade, 'aria-hidden': 'true', text: H.grade }),
        h('div', { class: 'dh-gtxt' }, [h('b', { text: 'Kıyas notu ' + H.grade + ', ' + H.gradeLabel }), h('span', { text: refTxt + '; ' + ratioTxt + '.' })])
      ]) : null
    ]));

    // A–E kıyas şeridi
    if (isNum(H.scalePos)) {
      var pos = H.scalePos * 100, refPos = scalePos(1) * 100;
      var bands = BAND.map(function (b) {
        var a = scalePos(b[1]) * 100, z = scalePos(b[2]) * 100;
        return h('span', { class: 'dh-band' + (b[0] === H.grade ? ' on' : ''), style: 'flex:' + (z - a).toFixed(3) + ' 0 0', text: b[0] });
      });
      var below = [h('span', { class: 'dh-reflbl', style: 'left:' + clampPct(refPos, 8, 92).toFixed(2) + '%' }, [
        h('span', { class: 'lg', text: (H.refIsCustom ? 'Referans ' : 'Segment ortalaması ') + n1(H.ref) }), h('span', { class: 'sm', text: 'Ort. ' + n1(H.ref) })])];
      if (isNum(H.afterPos)) {
        var ap = H.afterPos * 100, near = Math.abs(ap - refPos) < 18;
        below.push(h('span', { class: 'dh-after' + (near ? ' low' : ''), style: 'left:' + clampPct(ap, 5, 95).toFixed(2) + '%' }, [
          h('i', { 'aria-hidden': 'true' }), h('span', { text: 'Planla ' + n1(H.afterCpor) })]));
      }
      var label = 'Kıyas şeridi: tesisiniz ' + n1(H.cpor) + ' kg ile ' + H.grade + ' bandında; ' + refTxt.toLowerCase() + (isNum(H.afterCpor) ? '; planınızla ' + n1(H.afterCpor) + ' kg' : '') + '.';
      kids.push(h('div', { class: 'dh-scale', role: 'img', 'aria-label': label }, [
        h('span', { class: 'dh-mark', style: '--x:' + pos.toFixed(2) + '%' }, [
          h('span', { class: 'dh-marklbl', style: 'left:' + clampPct(pos, 7, 93).toFixed(2) + '%', text: 'Bu tesis ' + n1(H.cpor) }),
          h('i', { class: 'dh-pin', 'aria-hidden': 'true' }), h('i', { class: 'dh-ping', 'aria-hidden': 'true' }), h('i', { class: 'dh-ping p2', 'aria-hidden': 'true' })
        ]),
        h('div', { class: 'dh-bands', 'aria-hidden': 'true' }, bands),
        h('span', { class: 'dh-refline', style: 'left:' + refPos.toFixed(2) + '%', 'aria-hidden': 'true' }),
        h('div', { class: 'dh-below', 'aria-hidden': 'true' }, below)
      ]));
    }

    var stats = [
      ['Toplam ayak izi', n1(H.total) + ' t CO₂e'],
      isNum(H.perGuest) ? ['Kişi başı', n1(H.perGuest) + ' kg CO₂e'] : null,
      isNum(H.afterCpor) ? ['Planınızla', n1(H.afterCpor) + ' kg' + (H.afterGrade ? ', not ' + H.afterGrade : '')] : null,
      isNum(H.completeness) ? ['Veri tamlığı', H.completeness + ' / 100'] : null,
      ['Doğrulama', H.verify]
    ].filter(Boolean);
    kids.push(h('dl', { class: 'dh-stats' }, stats.map(function (x) { return h('div', {}, [h('dt', { text: x[0] }), h('dd', { text: x[1] })]); })));
    return h('div', { class: 'dhero' }, kids);
  }

  // ------------------------------------------------------------------ gösterge kartları
  function tiles(m) {
    return h('div', { class: 'dash-tiles' }, m.tiles.map(function (t) {
      var cmp = t.vsSegment;
      return h('article', { class: 'tile', 'data-tile': t.id }, [
        h('h3', { text: t.label }),
        h('p', { class: 'tv' }, [h('b', { text: n(t.value, t.digits) }), h('small', { text: t.unit })]),
        cmp ? h('p', { class: 'dln ' + tone(cmp.better) }, [icon(cmp.better === true ? 'check' : cmp.better === false ? 'alert' : 'same'), h('span', { text: cmp.text })])
            : h('p', { class: 'dln same' }, [h('span', { text: t.sub })]),
        deltaLine(t.delta),
        t.spark ? h('span', { class: 'spark', 'data-spark': t.id, 'aria-hidden': 'true' }) : null
      ]);
    }));
  }
  function drawSpark(host, pts) {
    var W = Math.max(host.clientWidth || 120, 60), H = 26, pad = 4;
    var vs = pts.map(function (p) { return p.v; }), lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs), span = hi - lo || 1;
    var x = function (i) { return pad + i * (W - 2 * pad) / Math.max(pts.length - 1, 1); };
    var y = function (v) { return H - pad - (v - lo) / span * (H - 2 * pad); };
    var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, width: String(W), height: String(H), focusable: 'false' });
    svg.appendChild(s('polyline', { class: 'sp-ln', points: pts.map(function (p, i) { return x(i).toFixed(1) + ',' + y(p.v).toFixed(1); }).join(' ') }));
    var k = pts.length - 1;
    svg.appendChild(s('circle', { class: 'sp-dot', cx: x(k).toFixed(1), cy: y(pts[k].v).toFixed(1), r: '3.5' }));
    U().clear(host); host.appendChild(svg);
  }

  // ------------------------------------------------------------------ kart iskeleti
  function card(cls, id, title, sub, body) {
    return h('section', { class: 'dcard ' + cls, 'aria-labelledby': id }, [
      h('header', { class: 'dc-head' }, [h('h3', { id: id, text: title }), sub ? h('p', { class: 'dc-sub', text: sub }) : null])
    ].concat(body));
  }
  function tableToggle(key, label, table) {
    var open = !!ui.tables[key];
    var wrap = h('div', { class: 'tblwrap dc-tbl', id: 'dtbl-' + key, hidden: !open }, [table]);
    return [h('button', { type: 'button', class: 'linkbtn dc-tblbtn', 'data-dash-tbl': key, 'aria-expanded': String(open), 'aria-controls': 'dtbl-' + key, 'data-fkey': 'tbl-' + key,
                          text: open ? 'Tabloyu gizle' : label }), wrap];
  }
  function simpleTable(head, rows) {
    return h('table', { class: 't' }, [
      h('thead', {}, [h('tr', {}, head.map(function (c) { return h('th', { scope: 'col', text: c }); }))]),
      h('tbody', {}, rows.map(function (r) { return h('tr', {}, r.map(function (c, i) { return h(i ? 'td' : 'th', { scope: i ? null : 'row', text: c }); })); }))
    ]);
  }

  // ------------------------------------------------------------------ yıllara göre
  function trendCard(m, ctx) {
    var T = m.trend, cur = T.byId[ui.metric] && T.byId[ui.metric].points.length >= 2 ? ui.metric : 'total';
    ui.metric = cur;
    var tr = T.byId[cur];
    if (T.years < 2) {
      var acc = ctx && ctx.account, msg, btn = null;
      if (ro) {
        msg = 'Bu tesis yalnız ' + (m.year || 'bu yılın') + ' verisini kaydetmiş; diğer yıllar kaydedildikçe gelişimi burada görünür.';
      } else if (acc === 'user') {
        msg = 'Bu yılın sonuçlarını hesabınıza kaydedin. Önceki yılları da girip kaydettiğinizde gelişiminiz burada yıl yıl görünür; tüm yıllar aynı yöntemle yeniden hesaplanır.';
        btn = h('button', { type: 'button', class: 'btn primary sm', 'data-cloud-save': '', text: 'Hesabıma kaydet' });
      } else if (acc === 'guest') {
        msg = 'Her yılın sonuçlarını ücretsiz hesabınıza kaydedin; gelişiminiz burada yıl yıl görünür. Tüm yıllar aynı yöntemle yeniden hesaplanır.';
        btn = h('button', { type: 'button', class: 'btn primary sm', 'data-auth': 'register', text: 'Ücretsiz üye olun' });
      } else {
        msg = 'Önceki yılların sonuçları kaydedildiğinde gelişiminiz burada yıl yıl görünür.';
      }
      return card('d-trend', 'dc-trend', 'Yıllara göre', 'Henüz yalnız ' + (m.year || 'bu yılın') + ' verisi var.', [
        h('div', { class: 'dc-empty' }, [h('p', { text: msg }), btn])
      ]);
    }
    var seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Grafikte gösterilen değer' }, T.ids.filter(function (id) { return T.byId[id].points.length >= 2; }).map(function (id) {
      return h('button', { type: 'button', 'data-dash-metric': id, 'aria-pressed': String(id === cur), 'data-fkey': 'metric-' + id, text: T.byId[id].label });
    }));
    var sub = tr.change ? tr.change.since + '.' : '';
    if (T.sample) { sub += ' Yıldızlı yıllar örnek verilerdir.'; }
    var table = simpleTable(['Yıl', tr.label + ' (' + tr.unit + ')', 'Önceki yıla göre'], tr.points.map(function (p, i) {
      var d = i ? NS.dashboard.delta(cur, tr.points[i - 1].v, p.v, tr.points[i - 1].year) : null;
      return [String(p.year) + (p.sample ? ' (örnek)' : ''), n(p.v, tr.digits), d ? d.text.replace(/^\d{4}'\S+ göre /, '') : '—'];
    }));
    return card('d-trend', 'dc-trend', 'Yıllara göre', sub, [seg,
      h('div', { class: 'chartbox', 'data-chart': 'trend' }, [h('div', { class: 'dtip', 'aria-hidden': 'true' })])
    ].concat(tableToggle('trend', 'Tablo olarak göster', table)));
  }
  function drawTrend(box, tr) {
    var tip = box.querySelector('.dtip');
    var old = box.querySelector('svg'); if (old) { box.removeChild(old); }
    var W = Math.max(box.clientWidth, 260), H = Math.max(Math.min(box.clientHeight, 420), 230), M = { l: 52, r: 10, t: 28, b: 30 };
    var pts = tr.points, mx = Math.max.apply(null, pts.map(function (p) { return p.v; }));
    var tk = ticks(mx * 1.08, 4), iw = W - M.l - M.r, ih = H - M.t - M.b, band = iw / pts.length;
    var y = function (v) { return M.t + ih - v / tk.top * ih; };
    var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, width: String(W), height: String(H), role: 'group',
      'aria-label': tr.label + ', yıllara göre: ' + pts.map(function (p) { return p.year + ' ' + n(p.v, tr.digits); }).join('; ') + ' ' + tr.unit + '.' });
    tk.list.forEach(function (v) {
      svg.appendChild(s('line', { class: 'dv-grid', x1: M.l, x2: W - M.r, y1: y(v).toFixed(1), y2: y(v).toFixed(1) }));
      svg.appendChild(s('text', { class: 'dv-axis', x: M.l - 8, y: (y(v) + 4).toFixed(1), 'text-anchor': 'end' }, tickText(v, tk.step)));
    });
    var cw = Math.min(24, band * 0.46), base = y(0);
    pts.forEach(function (p, i) {
      var cx = M.l + band * (i + 0.5), x0 = cx - cw / 2, x1 = cx + cw / 2, top = y(p.v), r = Math.min(4, (base - top) / 2, cw / 2);
      var d = 'M' + x0.toFixed(1) + ',' + base.toFixed(1) + 'V' + (top + r).toFixed(1) + 'Q' + x0.toFixed(1) + ',' + top.toFixed(1) + ' ' + (x0 + r).toFixed(1) + ',' + top.toFixed(1)
        + 'H' + (x1 - r).toFixed(1) + 'Q' + x1.toFixed(1) + ',' + top.toFixed(1) + ' ' + x1.toFixed(1) + ',' + (top + r).toFixed(1) + 'V' + base.toFixed(1) + 'Z';
      var prev = i ? pts[i - 1] : null, dl = prev ? NS.dashboard.delta(tr.id, prev.v, p.v, prev.year) : null;
      var g = s('g', { class: 'colg' + (p.current ? ' cur' : ''), tabindex: '0', role: 'img', 'data-fkey': 'col-' + p.year,
        'aria-label': p.year + (p.sample ? ' (örnek)' : '') + ': ' + n(p.v, tr.digits) + ' ' + tr.unit + (dl ? ', ' + dl.text : '') });
      g.appendChild(s('rect', { class: 'dv-hit', x: (M.l + band * i).toFixed(1), y: M.t, width: band.toFixed(1), height: ih }));
      g.appendChild(s('path', { class: 'dv-col' + (p.current ? ' cur' : ''), d: d }));
      svg.appendChild(g);
      if (p.current || i === 0) { svg.appendChild(s('text', { class: 'dv-val', x: cx.toFixed(1), y: (top - 8).toFixed(1), 'text-anchor': 'middle' }, n(p.v, tr.digits))); }
      svg.appendChild(s('text', { class: 'dv-axis' + (p.current ? ' cur' : ''), x: cx.toFixed(1), y: H - 9, 'text-anchor': 'middle' }, String(p.year) + (p.sample ? '*' : '')));
      var show = function () {
        tipShow(tip, box, cx, top, [{ text: p.year + (p.sample ? ' (örnek)' : '') }, { text: n(p.v, tr.digits) + ' ' + tr.unit, strong: true }].concat(dl ? [{ text: dl.text, cls: tone(dl.better) }] : []));
      };
      g.addEventListener('pointerenter', show); g.addEventListener('focus', show);
      g.addEventListener('pointerleave', function () { tipHide(tip); }); g.addEventListener('blur', function () { tipHide(tip); });
    });
    svg.appendChild(s('line', { class: 'dv-base', x1: M.l, x2: W - M.r, y1: base.toFixed(1), y2: base.toFixed(1) }));
    box.insertBefore(svg, tip);
  }

  // ------------------------------------------------------------------ emisyon kaynakları
  function sourcesCard(m) {
    var S = m.sources, tot = S.total, kids = [];
    if (S.scopes.length) {
      kids.push(h('div', { class: 'scopebar', role: 'img', 'aria-label': 'Kapsamlara göre: ' + S.scopes.map(function (p) { return p.label + ' ' + n1(p.t) + ' t (' + pct(p.t / tot * 100, 1) + ')'; }).join('; ') }, S.scopes.map(function (p) {
        return h('span', { class: 'sc-' + p.id, style: 'flex:' + (p.t / tot).toFixed(5) + ' 0 0' });
      })));
      kids.push(h('ul', { class: 'scopeleg' }, S.scopes.map(function (p) {
        return h('li', {}, [h('i', { class: 'sc-' + p.id, 'aria-hidden': 'true' }), h('b', { text: p.label }), h('span', { class: 'v', text: n1(p.t) + ' t, ' + pct(p.t / tot * 100, 1) }), h('small', { text: p.desc })]);
      })));
    }
    var mx = S.top.reduce(function (a, x) { return Math.max(a, x.t); }, 0) || 1;
    kids.push(h('div', { class: 'dbars' }, S.top.map(function (x) {
      return h('div', { class: 'dbar' + (x.other ? ' other' : '') }, [
        h('span', { class: 'lb', text: x.label }),
        h('span', { class: 'tr', 'aria-hidden': 'true' }, [h('span', { class: 'fl', style: 'width:' + Math.max(x.t / mx * 100, 1.5).toFixed(1) + '%' })]),
        h('span', { class: 'v', text: n1(x.t) + ' t, ' + pct(x.share * 100, 0) })
      ]);
    })));
    var L = S.lever;
    if (L && L.source) {
      var parts = [h('b', { text: L.source.label }), ' tek başına ayak izinin ' + pct(L.source.share * 100, 0) + ' kadarı. '];
      if (L.measure) {
        parts.push('Bu kalemi en çok azaltacak önlem: ' + L.measure.tr + ' (yılda ' + n1(L.measure.reductionT) + ' t). ');
        if (!ro) { parts.push(h('button', { type: 'button', class: 'linkbtn', 'data-dash-act': 'add', 'data-id': L.measure.id, 'data-fkey': 'lever-' + L.measure.id, text: 'Plana ekleyin' })); }
      } else if (L.planned.length) {
        parts.push('Planınızda bu kalemi azaltan önlemler var: ' + L.planned.join(', ') + '.');
      }
      kids.push(h('div', { class: 'dcallout' }, [icon('lever'), h('p', {}, parts)]));
    }
    return card('d-src', 'dc-src', 'Emisyonların kaynağı', n1(tot) + ' t CO₂e, HCMI kapsamı (karbon kredisi düşülmeden)', kids);
  }

  // ------------------------------------------------------------------ net sıfır yolu
  function pathCard(m) {
    var P = m.path;
    if (!P) {
      return card('d-path', 'dc-path', 'Net sıfır yolu', 'NZMFH 2. baskı, bina enerjisi', [h('div', { class: 'dc-empty' }, [h('p', { text: 'Enerji verisi girildiğinde hedef yolunuz burada çizilir.' })])]);
    }
    var legend = h('ul', { class: 'dlegend', 'aria-hidden': 'true' }, [
      h('li', {}, [h('i', { class: 'lg-act' }), 'Gerçekleşen']),
      h('li', {}, [h('i', { class: 'lg-plan' }), 'Planınız']),
      h('li', {}, [h('i', { class: 'lg-tgt' }), 'NZMFH üst sınırı'])
    ]);
    var ms = h('ul', { class: 'mstones' }, P.milestones.map(function (e) {
      return h('li', { class: e.met ? 'ok' : 'gap' }, [
        h('b', { text: String(e.year) }),
        h('span', { class: 'ms-st' }, [icon(e.met ? 'check' : 'alert'), h('span', { text: e.met ? 'Karşılanıyor' : n1(e.gapT) + ' t açık' })])
      ]);
    }));
    var note;
    if (P.firstGap) {
      note = 'Planınız ' + NS.dashboard.sfx(P.firstGap.year, 'loc') + ' NZMFH sınırını ' + n1(P.firstGap.gapT) + ' t aşıyor. Bu açığı kapatmak için ek verimlilik ve yenilenebilir elektrik gerekir; hedefleri her yıl güncel verilerle yeniden hesaplayın.';
    } else {
      note = 'Planınız tüm kilometre taşlarında NZMFH sınırının altında kalıyor.';
    }
    var rows = P.years.map(function (y, i) {
      var a = P.actual.filter(function (x) { return x.year === y; })[0];
      return { y: y, tgt: P.target[i], plan: P.plan[i], act: a ? a.t : null };
    });
    var pre = P.actual.filter(function (a) { return a.year < P.baseYear; }).map(function (a) { return { y: a.year, tgt: null, plan: null, act: a.t, sample: a.sample }; });
    var tblRows = pre.concat(rows).filter(function (r) { return r.act !== null || r.y % 5 === 0 || r.y === P.baseYear; });
    var table = simpleTable(['Yıl', 'Gerçekleşen, t', 'Plan, t', 'NZMFH sınırı, t'], tblRows.map(function (r) {
      return [String(r.y) + (r.sample ? ' (örnek)' : ''), isNum(r.act) ? n1(r.act) : '—', isNum(r.plan) ? n1(r.plan) : '—', isNum(r.tgt) ? n1(r.tgt) : '—'];
    }));
    return card('d-path', 'dc-path', 'Net sıfır yolu', 'NZMFH 2. baskı, bina enerjisi (Kapsam 1 ve 2), t CO₂e', [legend,
      h('div', { class: 'chartbox', 'data-chart': 'path' }, [h('div', { class: 'dtip', 'aria-hidden': 'true' })]),
      ms, h('p', { class: 'dc-note', text: note })
    ].concat(tableToggle('path', 'Tablo olarak göster', table)));
  }
  function drawPath(box, P) {
    var tip = box.querySelector('.dtip');
    var old = box.querySelector('svg'); if (old) { box.removeChild(old); }
    var W = Math.max(box.clientWidth, 260), H = Math.max(Math.min(box.clientHeight, 420), 230), M = { l: 52, r: 14, t: 16, b: 30 };
    var first = Math.min(P.baseYear, P.actual.length ? P.actual[0].year : P.baseYear), lastY = P.years[P.years.length - 1];
    var mx = Math.max.apply(null, P.target.concat(P.plan).concat(P.actual.map(function (a) { return a.t; })));
    var tk = ticks(mx * 1.05, 4), iw = W - M.l - M.r, ih = H - M.t - M.b;
    var x = function (yr) { return M.l + (yr - first) / Math.max(lastY - first, 1) * iw; };
    var y = function (v) { return M.t + ih - v / tk.top * ih; };
    var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, width: String(W), height: String(H), role: 'img',
      'aria-label': 'Net sıfır yolu: ' + P.baseYear + ' yılında ' + n1(P.baseT) + ' t; plan ' + n1(P.planT) + ' t.' + (P.firstGap ? ' İlk açık ' + P.firstGap.year + ' yılında, ' + n1(P.firstGap.gapT) + ' t.' : '') });
    tk.list.forEach(function (v) {
      svg.appendChild(s('line', { class: 'dv-grid', x1: M.l, x2: W - M.r, y1: y(v).toFixed(1), y2: y(v).toFixed(1) }));
      svg.appendChild(s('text', { class: 'dv-axis', x: M.l - 8, y: (y(v) + 4).toFixed(1), 'text-anchor': 'end' }, tickText(v, tk.step)));
    });
    var labs = {}; [first, P.baseYear, 2030, 2035, 2040, 2045, 2050].forEach(function (yr) { if (yr >= first && yr <= lastY) { labs[yr] = 1; } });
    var keys = Object.keys(labs).map(Number).sort(function (a, b) { return a - b; });
    keys.forEach(function (yr, i) {
      if (i && x(yr) - x(keys[i - 1]) < 30) { return; }
      svg.appendChild(s('text', { class: 'dv-axis' + (yr === P.baseYear ? ' cur' : ''), x: x(yr).toFixed(1), y: H - 9, 'text-anchor': 'middle' }, String(yr)));
    });
    // açık alanı (plan > sınır)
    var gapPts = [], gapBack = [];
    P.years.forEach(function (yr, i) {
      if (P.plan[i] > P.target[i] + 1e-9) { gapPts.push(x(yr).toFixed(1) + ',' + y(P.plan[i]).toFixed(1)); gapBack.unshift(x(yr).toFixed(1) + ',' + y(P.target[i]).toFixed(1)); }
    });
    if (gapPts.length > 1) { svg.appendChild(s('polygon', { class: 'dv-gap', points: gapPts.concat(gapBack).join(' ') })); }
    var line = function (ys, vs) { return ys.map(function (yr, i) { return x(yr).toFixed(1) + ',' + y(vs[i]).toFixed(1); }).join(' '); };
    svg.appendChild(s('polyline', { class: 'dv-tgt', points: line(P.years, P.target) }));
    svg.appendChild(s('polyline', { class: 'dv-plan', points: line(P.years, P.plan) }));
    if (P.actual.length > 1) { svg.appendChild(s('polyline', { class: 'dv-act', points: P.actual.map(function (a) { return x(a.year).toFixed(1) + ',' + y(a.t).toFixed(1); }).join(' ') })); }
    P.actual.forEach(function (a) { svg.appendChild(s('circle', { class: 'dv-dot' + (a.current ? ' cur' : ''), cx: x(a.year).toFixed(1), cy: y(a.t).toFixed(1), r: '4.5' })); });
    P.milestones.forEach(function (e) {
      svg.appendChild(s('circle', { class: 'dv-ms' + (e.met ? ' ok' : ' gap'), cx: x(e.year).toFixed(1), cy: y(e.targetT).toFixed(1), r: '3' }));
    });
    svg.appendChild(s('line', { class: 'dv-base', x1: M.l, x2: W - M.r, y1: y(0).toFixed(1), y2: y(0).toFixed(1) }));
    // artı imleci: en yakın yıl
    var cross = s('line', { class: 'dv-cross', x1: 0, x2: 0, y1: M.t, y2: M.t + ih, visibility: 'hidden' });
    svg.appendChild(cross);
    var hit = s('rect', { class: 'dv-hit', x: M.l, y: M.t, width: iw, height: ih });
    svg.appendChild(hit);
    hit.addEventListener('pointermove', function (ev) {
      var r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) * (W / r.width);
      var yr = Math.round(first + (px - M.l) / iw * (lastY - first)); yr = Math.min(Math.max(yr, first), lastY);
      var i = P.years.indexOf(yr), a = P.actual.filter(function (q) { return q.year === yr; })[0];
      var rows = [{ text: String(yr) + (a && a.sample ? ' (örnek)' : '') }];
      if (a) { rows.push({ text: 'Gerçekleşen ' + n1(a.t) + ' t', strong: true }); }
      if (i >= 0) {
        rows.push({ text: 'Plan ' + n1(P.plan[i]) + ' t', strong: !a });
        rows.push({ text: 'NZMFH sınırı ' + n1(P.target[i]) + ' t' });
        if (P.plan[i] > P.target[i] + 0.05) { rows.push({ text: n1(P.plan[i] - P.target[i]) + ' t açık', cls: 'bad' }); }
      }
      cross.setAttribute('x1', x(yr).toFixed(1)); cross.setAttribute('x2', x(yr).toFixed(1)); cross.setAttribute('visibility', 'visible');
      var vy = a ? a.t : (i >= 0 ? P.plan[i] : 0);
      tipShow(tip, box, x(yr) * (r.width / W), y(vy) * (r.height / H), rows);
    });
    hit.addEventListener('pointerleave', function () { cross.setAttribute('visibility', 'hidden'); tipHide(tip); });
    box.insertBefore(svg, tip);
  }

  // ------------------------------------------------------------------ eylem planı
  function planCard(m) {
    var PL = m.plan, kids = [];
    var sub = PL.any
      ? PL.selected.length + ' önlem: yılda ' + n1(PL.savedT) + ' t azaltım (' + pct(PL.savedPct, 0) + '), yatırım ' + money(PL.capexTl)
        + (isNum(PL.paybackYears) && PL.paybackYears > 0 ? ', geri ödeme ' + n1(PL.paybackYears) + ' yıl' : '')
      : (ro ? 'Henüz önlem seçilmedi.' : 'Henüz önlem seçilmedi. Aşağıdan ekleyin; panel anında güncellenir.');
    if (PL.target) {
      var cov = Math.min(PL.target.coverage, 1) * 100, met = PL.target.met;
      kids.push(h('div', { class: 'dmeter' + (met ? ' ok' : '') }, [
        h('p', { class: 'dm-l' }, [icon(met ? 'check' : 'alert', met ? 'good' : 'warn'),
          h('span', { text: met ? '2030 hedefi karşılanıyor: gereken azaltımın ' + pct(PL.target.coverage * 100, 0) + ' kadarı planda.'
                                : '2030 hedefi için gereken azaltımın ' + pct(cov, 0) + ' kadarı planda; ' + n1(PL.target.gapT) + ' t daha gerekiyor.' })]),
        h('div', { class: 'meter', role: 'img', 'aria-label': '2030 hedefinin ' + pct(cov, 0) + ' kadarı planda' }, [h('span', { style: 'width:' + cov.toFixed(1) + '%' })])
      ]));
    }
    if (PL.selected.length) {
      kids.push(h('ul', { class: 'plansel', 'aria-label': 'Planınızdaki önlemler' }, PL.selected.map(function (x) {
        return h('li', {}, [h('span', { text: x.label + (isNum(x.reductionT) ? ' (' + n1(x.reductionT) + ' t)' : '') }),
          ro ? null : h('button', { type: 'button', 'data-dash-act': 'remove', 'data-id': x.id, 'data-fkey': 'rm-' + x.id, 'aria-label': 'Plandan çıkarın: ' + x.label, title: 'Plandan çıkarın' }, [icon('x')])]);
      })));
    }
    if (m.next.length) {
      kids.push(h('h4', { class: 'dc-h4', text: ro ? 'Önerilen önlemler' : 'Sıradaki adımlar' }));
      kids.push(h('ul', { class: 'nexts' }, m.next.map(function (x) {
        var det = 'Yılda ' + n1(x.reductionT) + ' t azaltım';
        if (x.afterOthers) { det += ', yıllık belge maliyeti; verimlilik önlemlerinden sonra'; }
        else if (isNum(x.paybackYears)) { det += ', geri ödeme ' + n1(x.paybackYears) + ' yıl'; }
        else if (isNum(x.capexTl) && x.capexTl > 0) { det += ', yatırım ' + money(x.capexTl); }
        return h('li', {}, [
          h('div', {}, [h('b', { text: x.label }), h('small', { text: det })]),
          ro ? null : h('button', { type: 'button', class: 'btn-add', 'data-dash-act': 'add', 'data-id': x.id, 'data-fkey': 'add-' + x.id, 'aria-label': 'Ekle: ' + x.label }, [icon('plus'), h('span', { text: 'Ekle' })])
        ]);
      })));
    }
    kids.push(ro ? h('p', { class: 'dc-note', text: 'Önlem katsayıları ve yatırım tutarları gösterge değerdir.' })
      : h('p', { class: 'dc-note' }, ['Önlem katsayıları ve yatırım tutarları gösterge değerdir. ',
        h('button', { type: 'button', class: 'linkbtn', 'data-dash-act': 'step', 'data-id': 'adim3', text: 'Ayrıntılar Adım 3\'te' }), '.']));
    return card('d-next', 'dc-next', 'Eylem planı', sub, kids);
  }

  // ------------------------------------------------------------------ karbon dışı göstergeler
  function peopleCard(m) {
    var P = m.people, pg = P.perGuest;
    var figs = [
      ['Enerji', pg.kwh, 1, 'kWh', 'hotel.energy'],
      ['Su', pg.waterL, 0, 'litre', 'hotel.extras.waterM3'],
      ['Atık', pg.wasteKg, 2, 'kg', 'hotel.extras.wasteLandfillT'],
      ['Kimyasal', pg.chemKg, 2, 'kg', 'hotel.esg.chemicalsKg']
    ];
    var noData = function (path) {
      return ro ? h('span', { class: 'pna', text: 'Veri yok' }) : h('button', { type: 'button', class: 'linkbtn', 'data-dash-act': 'field', 'data-id': path, text: 'Veri girin' });
    };
    var grid = h('div', { class: 'pgrid' }, figs.map(function (f) {
      return h('div', { class: 'pfig' }, [h('span', { class: 'pl', text: f[0] }),
        isNum(f[1]) ? h('p', {}, [h('b', { text: n(f[1], f[2]) }), h('small', { text: f[3] })]) : noData(f[4])]);
    }));
    var meters = [
      ['Yenilenebilir elektrik', P.renew, 'Yerinde üretim (GES) ve YEK-G / I-REC', 'hotel.market'],
      ['Geri kazanılan atık', P.recycle, isNum(P.wasteT) ? n(P.wasteT, 0) + ' ton atığın geri dönüşüm ve kompost payı' : 'Geri dönüşüm ve kompost', 'hotel.extras.wasteRecycledT'],
      ['Yerel satın alma', P.local, isNum(P.totalTl) ? money(P.localTl) + ' / ' + money(P.totalTl) : 'Yerel tedarikçilerden yapılan alım', 'hotel.esg.purchaseTotalTl'],
      ['Çevre eğitimi alan çalışan', P.trained, isNum(P.staff) ? n(P.staffTrained, 0) + ' / ' + n(P.staff, 0) + ' çalışan' : 'Yıl içinde eğitim alanlar', 'hotel.esg.staff']
    ];
    var mlist = h('div', { class: 'pmeters' }, meters.map(function (x) {
      var has = isNum(x[1]);
      return h('div', { class: 'pmeter' }, [
        h('p', { class: 'pm-h' }, [h('span', { text: x[0] }), has ? h('b', { text: pct(x[1], x[1] > 0 && x[1] < 10 ? 1 : 0) }) : null]),
        has ? h('div', { class: 'meter', 'aria-hidden': 'true' }, [h('span', { style: 'width:' + Math.min(Math.max(x[1], 0), 100).toFixed(1) + '%' })]) : null,
        has ? h('small', { text: x[2] }) : noData(x[3])
      ]);
    }));
    return card('d-people', 'dc-people', 'Kaynaklar, tedarik ve çalışanlar', 'Misafir gecelemesi başına; karbon hesabına girmez', [grid, mlist]);
  }

  // ------------------------------------------------------------------ hazırlık ve paylaşım
  function readyCard(m) {
    var Rd = m.readiness, rows = [];
    if (isNum(Rd.completeness)) {
      rows.push(h('div', { class: 'rrow' }, [
        h('p', { class: 'pm-h' }, [h('span', { text: 'Veri tamlığı' }), h('b', { text: Rd.completeness + ' / 100' })]),
        h('div', { class: 'meter', 'aria-hidden': 'true' }, [h('span', { style: 'width:' + Rd.completeness + '%' })]),
        Rd.missing.length ? h('small', { text: 'Eksik: ' + Rd.missing.slice(0, 3).map(function (x) { return x.name; }).join(', ') }) : h('small', { text: 'Raporun bütün bölümleri dolu.' })
      ]));
    }
    if (isNum(Rd.taxonomy)) {
      rows.push(h('div', { class: 'rrow' }, [
        h('p', { class: 'pm-h' }, [h('span', { text: 'Türkiye Yeşil Taksonomisi hazırlığı' }), h('b', { text: Rd.taxonomy + ' / 100' })]),
        h('div', { class: 'meter', 'aria-hidden': 'true' }, [h('span', { style: 'width:' + Math.max(Rd.taxonomy, 0) + '%' })]),
        Rd.taxonomyRec ? h('small', { text: 'Sıradaki: ' + Rd.taxonomyRec.replace(/\s+—\s+/g, '; ') }) : null
      ]));
    }
    rows.push(h('div', { class: 'rrow' }, [
      h('p', { class: 'pm-h' }, [h('span', { text: 'Doğrulama' }), h('b', { class: Rd.verifyId === 'third' ? 'good' : null, text: Rd.verify })]),
      Rd.verifyId === 'third' ? null : h('small', { text: 'Reklam ve pazarlama iddiaları için bağımsız doğrulama önerilir.' })
    ]));
    var hint = h('div', { class: 'dcallout soft' }, [icon('info'), h('p', {}, [
      'Misafirlere anlatırken ölçülen değeri yöntemi ve yılıyla verin; karbon kredisine dayanarak "karbon nötr" demeyin (AB 2024/825). ',
      ro ? null : h('button', { type: 'button', class: 'linkbtn', 'data-dash-act': 'claims', text: 'Nasıl anlatılır?' })])]);
    if (ro) { return card('d-ready', 'dc-ready', 'Hazırlık', null, [h('div', { class: 'rrows' }, rows), hint]); }
    var acts = h('div', { class: 'dacts' }, [
      h('button', { type: 'button', class: 'btn primary', 'data-dash-act': 'report', 'data-fkey': 'act-report', text: 'PDF raporu' }),
      h('button', { type: 'button', class: 'btn ghost', 'data-dash-act': 'summary', 'data-fkey': 'act-summary', text: 'Tek sayfalık özet' }),
      h('button', { type: 'button', class: 'btn ghost', 'data-cloud-save': '', 'data-fkey': 'act-save', text: 'Hesabıma kaydet' }),
      h('button', { type: 'button', class: 'btn ghost', 'data-dash-act': 'step', 'data-id': 'adim1', text: 'Verileri düzenle' })
    ]);
    return card('d-ready', 'dc-ready', 'Hazırlık ve paylaşım', null, [h('div', { class: 'rrows' }, rows), hint, acts]);
  }

  // ------------------------------------------------------------------ boş durum
  function emptyView(m) {
    if (ro) {
      return h('div', { class: 'dash-empty' }, [
        h('h2', { id: 'dash-h', text: m.name || 'Tesis' }),
        h('p', { text: 'Bu kaydın hesabı tamamlanmamış; tesis eksik verileri girip yeniden kaydettiğinde panel dolar.' })
      ]);
    }
    return h('div', { class: 'dash-empty' }, [
      h('h2', { id: 'dash-h', text: 'Paneliniz verilerinizle dolar' }),
      h('p', { text: m.started
        ? 'Hesap henüz tamamlanmadı. Adım 1\'deki "Veri kontrolü" listesindeki eksikleri tamamlayın; panel o anda dolar.'
        : 'Tesisinizin 12 aylık enerji, su ve atık verilerini girin. Panel; kıyas notunuzu, emisyonlarınızın kaynağını, hedef yolunuzu ve sıradaki adımlarınızı tek ekranda gösterir.' }),
      h('div', { class: 'dacts' }, [
        h('button', { type: 'button', class: 'btn primary', 'data-dash-act': 'step', 'data-id': 'adim1', text: 'Verileri girin' }),
        m.started ? null : h('button', { type: 'button', class: 'btn ghost', 'data-example': 'otel', text: 'Örnek otelle görün' })
      ])
    ]);
  }

  // ------------------------------------------------------------------ çizim
  function drawCharts(host, m) {
    if (!m.ok) { return; }
    var tb = host.querySelector('[data-chart="trend"]');
    if (tb && m.trend.byId[ui.metric]) { drawTrend(tb, m.trend.byId[ui.metric]); }
    var pb = host.querySelector('[data-chart="path"]');
    if (pb && m.path) { drawPath(pb, m.path); }
    Array.prototype.forEach.call(host.querySelectorAll('[data-spark]'), function (sp) {
      var t = m.tiles.filter(function (x) { return x.id === sp.getAttribute('data-spark'); })[0];
      if (t && t.spark) { drawSpark(sp, t.spark); }
    });
  }

  function countUp(el) {
    var to = parseFloat(el.getAttribute('data-count'));
    if (!isNum(to) || reduced()) { return; }
    var t0 = null, dur = 900;
    function step(t) {
      if (t0 === null) { t0 = t; }
      var k = Math.min((t - t0) / dur, 1), e = 1 - Math.pow(1 - k, 3);
      el.textContent = n1(to * e);
      if (k < 1) { root.requestAnimationFrame(step); } else { el.textContent = n1(to); }
    }
    el.textContent = n1(0);
    root.requestAnimationFrame(step);
  }

  /** Paneli baştan çizer. ctx: { account: 'user' | 'guest' | 'none', readOnly: true (yönetim paneli) } */
  function render(host, m, ctx) {
    if (!host) { return; }
    var ae = doc.activeElement, fkey = ae && host.contains(ae) && ae.getAttribute ? ae.getAttribute('data-fkey') : null;
    last = { host: host, model: m, ctx: ctx || {} };
    ro = !!(ctx && ctx.readOnly);
    host.classList.toggle('ro', ro);
    var root2 = h('div', { class: 'dash-in' });
    if (!m.ok) {
      root2.appendChild(emptyView(m));
    } else {
      root2.appendChild(hero(m));
      root2.appendChild(tiles(m));
      root2.appendChild(h('div', { class: 'dash-grid' }, [trendCard(m, ctx), sourcesCard(m), pathCard(m), planCard(m), peopleCard(m), readyCard(m)]));
    }
    var intro = m.ok && !ui.introDone && !reduced();
    U().clear(host);
    host.appendChild(root2);
    host.classList.toggle('intro', intro);
    if (m.ok) { ui.introDone = true; }
    if (host.offsetParent !== null || host.getClientRects().length) { drawCharts(host, m); }
    if (intro) {
      var v = host.querySelector('.dh-val'); if (v) { countUp(v); }
      root.setTimeout(function () { host.classList.remove('intro'); }, 3200);
    }
    if (fkey) {
      var t = host.querySelector('[data-fkey="' + fkey + '"]');
      if (!t) { t = host.querySelector('#dc-next'); if (t) { t.setAttribute('tabindex', '-1'); } }
      if (t) { try { t.focus({ preventScroll: true }); } catch (e) { t.focus(); } }
    }
  }

  function redraw() { if (last && last.model) { drawCharts(last.host, last.model); } }

  // panel içi etkileşim: gösterge seçimi ve tablo aç / kapat (app.js'e gitmez)
  doc.addEventListener('click', function (ev) {
    var b = ev.target.closest ? ev.target.closest('[data-dash-metric],[data-dash-tbl]') : null;
    if (!b || !last || !last.host.contains(b)) { return; }
    if (b.hasAttribute('data-dash-metric')) {
      ui.metric = b.getAttribute('data-dash-metric');
      render(last.host, last.model, last.ctx);
      return;
    }
    var k = b.getAttribute('data-dash-tbl');
    ui.tables[k] = !ui.tables[k];
    var w = doc.getElementById('dtbl-' + k);
    if (w) { w.hidden = !ui.tables[k]; }
    b.setAttribute('aria-expanded', String(!!ui.tables[k]));
    b.textContent = ui.tables[k] ? 'Tabloyu gizle' : 'Tablo olarak göster';
  });
  root.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (last && last.host && !last.host.hidden) { redraw(); } }, 150);
  });

  NS.dashView = { render: render, redraw: redraw, _ui: ui };
})(typeof globalThis !== 'undefined' ? globalThis : self);
