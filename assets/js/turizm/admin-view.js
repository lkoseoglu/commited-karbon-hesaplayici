/* =========================================================================
   Commited Yönetim Paneli — ÇİZİM  (assets/js/turizm/admin-view.js)
   -------------------------------------------------------------------------
   admin.js'in modelini turizm-admin.html'e çizer:
     · üst alan: özet sayılar ve bütün oteller A–E kıyas şeridinde birer nokta
       (otel panelinin şeridiyle aynı ölçek; noktaya tıklayınca otelin ayrıntısı)
     · haftalara göre (yeni üye / kaydedilen hesap), satış fırsatları
     · oteller / acenteler / üyeler listesi: arama, süzgeç, sıralama, Excel'e aktarma
     · otel ayrıntısı: otelin kendi paneli (dashboard-view.js, salt okunur) + PDF rapor / özet
   Kullanıcı metni her zaman textContent ile yazılır; renkler yalnız CSS sınıflarından.
   Dışa: window.__admin = { show(data), message(text, tone), loading() }  (admin-cloud.js çağırır)
   ========================================================================= */
(function (root) {
  'use strict';

  var NS = root.TURIZM = root.TURIZM || {};
  var doc = root.document;
  var SVGNS = 'http://www.w3.org/2000/svg';
  var XLSX_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';   // kapsam3 sayfasıyla aynı sürüm

  var st = {
    data: null, model: null, cur: null,
    tab: 'hotels', q: '',
    filter: { hotels: 'all', agencies: 'all', members: 'all' },
    sort: { hotels: { k: 'lastAt', dir: 'desc' }, agencies: { k: 'lastAt', dir: 'desc' }, members: { k: 'joinedAt', dir: 'desc' } },
    metric: 'members', table: false, detail: null, pushed: false, listY: 0
  };
  var resizeTimer = null;

  function A() { return NS.admin; }
  function U() { return NS.ui; }
  function h(tag, attrs, kids) { return U().h(tag, attrs, kids); }
  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function n(x, d) { return isNum(x) ? root.NUM.format(x, d === undefined ? 1 : d) : '—'; }
  function tons(x) { return isNum(x) ? root.NUM.format(x, Math.abs(x) < 100 ? 1 : 0) : '—'; }
  function money(x) {
    if (!isNum(x)) { return '—'; }
    var a = Math.abs(x);
    return a >= 1e9 ? n(x / 1e9, 1) + ' milyar TL' : a >= 1e6 ? n(x / 1e6, 1) + ' milyon TL' : n(Math.round(x), 0) + ' TL';
  }
  function dateTr(t) { return A().dateTr(t) || '—'; }
  function s(tag, attrs, text) {
    var e = doc.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] !== null && attrs[k] !== undefined) { e.setAttribute(k, attrs[k]); } });
    if (text !== undefined) { e.textContent = text; }
    return e;
  }
  var ICONS = { info: 'M8 7.2v4.3M8 4.6v.2', back: 'M9.5 3.5 5 8l4.5 4.5', down: 'M8 3.5v9M4.5 9 8 12.5 11.5 9', up: 'M8 12.5v-9M4.5 7 8 3.5 11.5 7' };
  function icon(name) {
    var g = s('svg', { viewBox: '0 0 16 16', width: '16', height: '16', 'aria-hidden': 'true', focusable: 'false', class: 'ic' });
    if (name === 'info') { g.appendChild(s('circle', { cx: '8', cy: '8', r: '6.5', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5' })); }
    g.appendChild(s('path', { d: ICONS[name], fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    return g;
  }
  function focusKey(k) {
    if (!k) { return; }
    var t = doc.querySelector('[data-fkey="' + k + '"]');
    if (t) { try { t.focus({ preventScroll: true }); } catch (e) { t.focus(); } }
  }
  function keepFocus(fn) {
    var ae = doc.activeElement, k = ae && ae.getAttribute ? ae.getAttribute('data-fkey') : null;
    fn(); focusKey(k);
  }

  // ------------------------------------------------------------------ kart iskeleti
  function card(cls, id, title, sub, body) {
    return h('section', { class: 'dcard ' + cls, 'aria-labelledby': id }, [
      h('header', { class: 'dc-head' }, [h('h2', { class: 'dc-h', id: id, tabindex: '-1', text: title }), sub ? h('p', { class: 'dc-sub', text: sub }) : null])
    ].concat(body));
  }

  // ------------------------------------------------------------------ üst alan
  var BAND = [['A', 0.4, 0.6], ['B', 0.6, 0.85], ['C', 0.85, 1.15], ['D', 1.15, 1.5], ['E', 1.5, 1.8]];
  function sp(r) { return Math.min(Math.max((r - 0.4) / 1.4, 0), 1); }
  function isoSvg() {
    var g = s('svg', { class: 'dh-iso', viewBox: '0 0 300 100', preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true', focusable: 'false' });
    var R = NS.report && NS.report._isobaths, paths = [];
    if (R) { try { paths = R('commited|yonetim|turizm', 300, 100, 18, 1.6); } catch (e) { paths = []; } }
    paths.forEach(function (p) { g.appendChild(s('path', { d: p.d, class: p.index ? 'ix' : null })); });
    return g;
  }
  function hero(m) {
    var C = m.counts, when = new Date(m.now);
    var meta = 'Son güncelleme ' + when.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
      + ', ' + when.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    var kpis = [
      ['Üye', n(C.members, 0), C.newMembers30 ? 'son 30 günde ' + C.newMembers30 + ' yeni' : 'son 30 günde yeni üye yok'],
      ['Otel', n(C.hotels, 0), m.opps.stale.length ? m.opps.stale.length + ' otel güncelleme bekliyor' : (C.hotels ? 'hepsinin verisi güncel' : null)],
      ['Acente', n(C.agencies, 0), null],
      ['Kaydedilen hesap', n(C.records, 0), C.newRecords30 ? 'son 30 günde ' + C.newRecords30 : 'son 30 günde yok'],
      ['Ölçülen emisyon', tons(C.totalT), 't CO₂e, son kayıtların toplamı']
    ];
    return h('section', { class: 'dhero ahero', 'aria-labelledby': 'adm-h' }, [isoSvg(),
      h('div', { class: 'dh-top' }, [h('div', {}, [h('h1', { id: 'adm-h', tabindex: '-1', text: 'Turizm hesaplayıcısı' }), h('p', { class: 'dh-meta', text: meta })])]),
      h('dl', { class: 'ah-kpis' }, kpis.map(function (k) {
        return h('div', {}, [h('dt', { text: k[0] }), h('dd', {}, [k[1], k[2] ? h('small', { text: k[2] }) : null])]);
      })),
      fleet(m)
    ]);
  }
  function fleet(m) {
    var G = m.gradeCounts;
    var flex = BAND.map(function (b) { return (sp(b[2]) - sp(b[1])).toFixed(3); });
    var summary = 'Otellerin kıyas notları: ' + BAND.map(function (b) { return b[0] + ' notunda ' + G[b[0]]; }).join(', ')
      + (G.none ? '; hesabı tamamlanmamış ' + G.none : '') + ' otel.';
    var kids = [h('div', { class: 'ah-fh' }, [h('h2', { text: 'Otellerin kıyas notları' }),
      h('p', { text: 'Her nokta bir otel: son kaydındaki oda-gece başına karbon, kendi segment ortalamasına göre. Çizgi segment ortalaması.' })])];
    kids.push(h('p', { class: 'sr-only', text: summary }));
    kids.push(h('div', { class: 'ah-plot', 'aria-hidden': 'true' }, [
      h('div', { class: 'ah-dots' }),
      h('div', { class: 'dh-bands' }, BAND.map(function (b, i) { return h('span', { class: 'dh-band' + (G[b[0]] ? ' on' : ''), style: 'flex:' + flex[i] + ' 0 0', text: b[0] }); })),
      h('span', { class: 'ah-refline', style: 'left:' + (sp(1) * 100).toFixed(2) + '%' }),
      h('div', { class: 'ah-tip' })
    ]));
    kids.push(h('div', { class: 'ah-counts', 'aria-hidden': 'true' }, BAND.map(function (b, i) {
      return h('span', { style: 'flex:' + flex[i] + ' 0 0' }, [h('b', { text: String(G[b[0]]) }), ' otel']);
    })));
    if (!m.fleet.length) { kids.push(h('p', { class: 'ah-none', text: 'Hesabı tamamlanmış otel yok; oteller kaydettikçe burada birer nokta olarak görünür.' })); }
    else if (G.none) { kids.push(h('p', { class: 'ah-none', text: G.none + ' otelin son kaydında hesap tamamlanmamış; şeritte gösterilmiyor.' })); }
    return h('div', { class: 'ah-fleet' }, kids);
  }
  /** Noktalar: x = kıyas şeridindeki yer; üst üste binenler yukarı dizilir (piksele göre) */
  function placeDots() {
    var plot = doc.querySelector('.ah-plot'); if (!plot || !st.model) { return; }
    var box = plot.querySelector('.ah-dots'), tip = plot.querySelector('.ah-tip');
    var W = plot.clientWidth || 600, gap = 17 / W, rows = [];
    U().clear(box);
    st.model.fleet.forEach(function (f) {
      var r = 0;
      while (r < rows.length && f.scalePos - rows[r] < gap) { r++; }
      if (r > 7) { r = 7; }
      rows[r] = f.scalePos;
      var b = h('button', { type: 'button', class: 'ah-dot', tabindex: '-1', 'data-adm-open': f.key,
        style: 'left:' + (f.scalePos * 100).toFixed(2) + '%; bottom:' + (6 + r * 17) + 'px' });
      b.addEventListener('pointerenter', function () {
        U().clear(tip);
        tip.appendChild(h('b', { text: f.name }));
        tip.appendChild(h('span', { text: n(f.cpor, 1) + ' kg oda-gece başına, not ' + (f.grade || '—') }));
        if (f.city || f.segmentLabel) { tip.appendChild(h('span', { text: [f.city, f.segmentLabel].filter(Boolean).join(', ') })); }
        tip.classList.add('on'); b.classList.add('on');
        var x = b.offsetLeft + 7, tw = tip.offsetWidth;
        tip.style.left = Math.min(Math.max(x - tw / 2, 0), Math.max(W - tw, 0)) + 'px';
        tip.style.top = (b.offsetTop - tip.offsetHeight - 10) + 'px';
      });
      b.addEventListener('pointerleave', function () { tip.classList.remove('on'); b.classList.remove('on'); });
      box.appendChild(b);
    });
    box.style.height = (rows.length ? 10 + rows.length * 17 : 0) + 'px';
  }

  // ------------------------------------------------------------------ haftalar
  var MET = { members: { label: 'Yeni üye', unit: 'yeni üye' }, records: { label: 'Kaydedilen hesap', unit: 'kaydedilen hesap' } };
  function weeksCard(m) {
    var met = MET[st.metric] ? st.metric : 'members', W = m.weeks;
    var tot = W.reduce(function (a, w) { return a + w[met]; }, 0);
    var seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Grafikte gösterilen değer' }, Object.keys(MET).map(function (k) {
      return h('button', { type: 'button', 'data-adm-metric': k, 'aria-pressed': String(k === met), 'data-fkey': 'met-' + k, text: MET[k].label });
    }));
    var rows = W.map(function (w) { return [w.label + (w.current ? ' (bu hafta)' : ''), String(w.members), String(w.records), String(w.hotels), String(w.agencies)]; });
    var table = h('table', { class: 't' }, [
      h('thead', {}, [h('tr', {}, ['Hafta', 'Yeni üye', 'Kaydedilen hesap', 'Otel', 'Acente'].map(function (c) { return h('th', { scope: 'col', text: c }); }))]),
      h('tbody', {}, rows.map(function (r) { return h('tr', {}, r.map(function (c, i) { return h(i ? 'td' : 'th', { scope: i ? null : 'row', text: c }); })); }))
    ]);
    return card('d-trend', 'ac-weeks', 'Haftalara göre', 'Son 12 hafta: ' + tot + ' ' + MET[met].unit + '. Bu hafta vurgulu.', [seg,
      h('div', { class: 'chartbox', 'data-chart': 'weeks' }, [h('div', { class: 'dtip', 'aria-hidden': 'true' })]),
      h('button', { type: 'button', class: 'linkbtn dc-tblbtn', 'data-adm-tbl': '', 'aria-expanded': String(st.table), 'aria-controls': 'atbl-weeks', 'data-fkey': 'tbl-weeks',
                    text: st.table ? 'Tabloyu gizle' : 'Tablo olarak göster' }),
      h('div', { class: 'tblwrap dc-tbl', id: 'atbl-weeks', hidden: !st.table }, [table])
    ]);
  }
  function drawWeeks() {
    var box = doc.querySelector('[data-chart="weeks"]'); if (!box || !st.model) { return; }
    var tip = box.querySelector('.dtip'), old = box.querySelector('svg'); if (old) { box.removeChild(old); }
    var met = MET[st.metric] ? st.metric : 'members', pts = st.model.weeks;
    var W = Math.max(box.clientWidth, 260), H = Math.max(Math.min(box.clientHeight, 460), 220), M = { l: 34, r: 8, t: 24, b: 28 };
    var mx = Math.max.apply(null, pts.map(function (p) { return p[met]; }).concat([1]));
    var step = mx <= 6 ? 1 : mx <= 12 ? 2 : mx <= 30 ? 5 : Math.ceil(mx / 4 / 10) * 10;
    var top = Math.ceil(mx * 1.12 / step) * step;
    var iw = W - M.l - M.r, ih = H - M.t - M.b, band = iw / pts.length;
    var y = function (v) { return M.t + ih - v / top * ih; };
    var every = Math.max(1, Math.ceil(48 / band)), lastI = pts.length - 1;
    var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, width: String(W), height: String(H), role: 'group',
      'aria-label': MET[met].label + ', son 12 hafta: ' + pts.map(function (p) { return p.label + ' ' + p[met]; }).join('; ') + '.' });
    for (var v = 0; v <= top + 1e-9; v += step) {
      svg.appendChild(s('line', { class: 'dv-grid', x1: M.l, x2: W - M.r, y1: y(v).toFixed(1), y2: y(v).toFixed(1) }));
      svg.appendChild(s('text', { class: 'dv-axis', x: M.l - 8, y: (y(v) + 4).toFixed(1), 'text-anchor': 'end' }, n(v, 0)));
    }
    var cw = Math.min(22, band * 0.5), base = y(0);
    pts.forEach(function (p, i) {
      var val = p[met], cx = M.l + band * (i + 0.5), x0 = cx - cw / 2, x1 = cx + cw / 2, tp = y(val), r = Math.min(4, (base - tp) / 2, cw / 2);
      var detail = met === 'records' && val ? 'otel ' + p.hotels + ', acente ' + p.agencies : null;
      var g = s('g', { class: 'colg' + (p.current ? ' cur' : ''), tabindex: '0', role: 'img', 'data-fkey': 'wk-' + i,
        'aria-label': p.label + ' haftası' + (p.current ? ' (bu hafta)' : '') + ': ' + val + ' ' + MET[met].unit + (detail ? ' (' + detail + ')' : '') });
      g.appendChild(s('rect', { class: 'dv-hit', x: (M.l + band * i).toFixed(1), y: M.t, width: band.toFixed(1), height: ih }));
      if (val > 0) {
        var d = 'M' + x0.toFixed(1) + ',' + base.toFixed(1) + 'V' + (tp + r).toFixed(1) + 'Q' + x0.toFixed(1) + ',' + tp.toFixed(1) + ' ' + (x0 + r).toFixed(1) + ',' + tp.toFixed(1)
          + 'H' + (x1 - r).toFixed(1) + 'Q' + x1.toFixed(1) + ',' + tp.toFixed(1) + ' ' + x1.toFixed(1) + ',' + (tp + r).toFixed(1) + 'V' + base.toFixed(1) + 'Z';
        g.appendChild(s('path', { class: 'dv-col' + (p.current ? ' cur' : ''), d: d }));
      }
      svg.appendChild(g);
      if (p.current) { svg.appendChild(s('text', { class: 'dv-val', x: cx.toFixed(1), y: (tp - 8).toFixed(1), 'text-anchor': 'middle' }, String(val))); }
      if ((lastI - i) % every === 0) { svg.appendChild(s('text', { class: 'dv-axis' + (p.current ? ' cur' : ''), x: cx.toFixed(1), y: H - 9, 'text-anchor': 'middle' }, p.label)); }
      var show = function () {
        U().clear(tip);
        tip.appendChild(h('span', { text: p.label + ' haftası' + (p.current ? ' (bu hafta)' : '') }));
        tip.appendChild(h('b', { text: val + ' ' + MET[met].unit }));
        if (detail) { tip.appendChild(h('span', { text: detail })); }
        tip.classList.add('on');
        var bw = box.clientWidth, tw = tip.offsetWidth, th = tip.offsetHeight;
        tip.style.left = Math.min(Math.max(cx - tw / 2, 0), Math.max(bw - tw, 0)) + 'px';
        tip.style.top = Math.max(tp - th - 10, 0) + 'px';
      };
      g.addEventListener('pointerenter', show); g.addEventListener('focus', show);
      g.addEventListener('pointerleave', function () { tip.classList.remove('on'); }); g.addEventListener('blur', function () { tip.classList.remove('on'); });
    });
    svg.appendChild(s('line', { class: 'dv-base', x1: M.l, x2: W - M.r, y1: base.toFixed(1), y2: base.toFixed(1) }));
    box.insertBefore(svg, tip);
  }

  // ------------------------------------------------------------------ satış fırsatları
  function oppsCard(m) {
    var O = m.opps;
    var names = function (list) {
      var top = list.slice(0, 3).map(function (x) { return x.name; }).join(', ');
      return list.length > 3 ? top + ' ve ' + (list.length - 3) + ' diğer' : top;
    };
    var rows = [
      { id: 'verify', tab: 'hotels', t: 'Doğrulamaya hazır', d: 'Veri tamlığı ' + O.verifyMin + ' ve üstü, bağımsız doğrulaması yok.', list: O.verify, unit: 'otel' },
      { id: 'high', tab: 'hotels', t: 'Kıyasın üstünde (D ve E)', d: 'Segment ortalamasının belirgin üstünde; azaltım danışmanlığı için öncelikli.', list: O.high, unit: 'otel' },
      { id: 'stale', tab: 'hotels', t: 'Güncelleme bekliyor', d: m.expectYear + ' verisini henüz kaydetmedi.', list: O.stale, unit: 'otel' },
      { id: 'idle', tab: 'members', t: 'Hesap kaydetmemiş üye', d: 'Üye oldu ama hiç hesap kaydetmedi.', list: O.idle, unit: 'üye' }
    ];
    var ul = h('ul', { class: 'opps' }, rows.map(function (r) {
      return h('li', {}, [
        h('p', { class: 'opp-t', text: r.t }),
        h('p', { class: 'opp-d', text: r.d }),
        r.list.length ? h('p', { class: 'opp-names', text: names(r.list) }) : null,
        h('div', { class: 'opp-n' }, [h('b', { text: String(r.list.length) }), h('small', { text: r.unit }),
          r.list.length ? h('button', { type: 'button', class: 'linkbtn', 'data-adm-tab': r.tab, 'data-adm-filter': r.id, 'data-fkey': 'opp-' + r.id,
                                        'aria-label': 'Listede gösterin: ' + r.t, text: 'Listede gösterin' }) : null])
      ]);
    }));
    var off = h('div', { class: 'dcallout soft opp-off' }, [icon('info'), h('p', {}, [
      'Planlardan sonra kalan yıllık emisyon ', h('b', { text: tons(O.offsetT) + ' t CO₂e' }),
      '. VER ' + n(O.verPrice, 0) + ' TL/t ile dengeleme potansiyeli yaklaşık ', h('b', { text: money(O.offsetTl) }), '.'])]);
    return card('d-src', 'ac-opps', 'Satış fırsatları', 'Otellerin son kayıtlarına göre', [ul, off]);
  }

  // ------------------------------------------------------------------ liste
  var TABS = [['hotels', 'Oteller'], ['agencies', 'Acenteler'], ['members', 'Üyeler']];
  var UNIT = { hotels: 'otel', agencies: 'acente', members: 'üye' };
  var COLS = {
    hotels: [['name', 'Otel'], ['year', 'Yıl'], ['cpor', 'Oda-gece başına, kg'], ['grade', 'Not'],
             ['totalT', 'Toplam, t'], ['completeness', 'Veri tamlığı'], ['lastAt', 'Son kayıt'], ['email', 'E-posta']],
    agencies: [['name', 'Acente'], ['city', 'Şehir'], ['totalT', 'Toplam, t'], ['passengers', 'Yolcu'], ['perGuestKg', 'Yolcu başı, kg'],
               ['count', 'Kayıt'], ['lastAt', 'Son kayıt'], ['email', 'E-posta']],
    members: [['name', 'Üye'], ['typeLabel', 'Tür'], ['city', 'Şehir'], ['email', 'E-posta'], ['joinedAt', 'Üyelik'], ['records', 'Kayıt'], ['lastAt', 'Son kayıt']]
  };
  var TEXT_COLS = { name: 1, segmentLabel: 1, city: 1, email: 1, typeLabel: 1, grade: 1 };
  var FILTERS = {
    hotels: [['all', 'Tümü'], ['verify', 'Doğrulamaya hazır'], ['high', 'D ve E'], ['stale', 'Güncelleme bekliyor']],
    agencies: [],
    members: [['all', 'Tümü'], ['idle', 'Hesap kaydetmemiş']]
  };
  function listCard(m) {
    var tab = st.tab;
    var seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Gösterilen liste' }, TABS.map(function (t) {
      return h('button', { type: 'button', 'data-adm-tab': t[0], 'aria-pressed': String(t[0] === tab), 'data-fkey': 'tab-' + t[0], text: t[1] + ' (' + m[t[0]].length + ')' });
    }));
    var q = h('input', { type: 'search', class: 'al-q', id: 'adm-q', value: st.q, placeholder: 'Ad, şehir ya da e-posta', 'aria-label': 'Listede arayın', autocomplete: 'off', spellcheck: 'false' });
    var xl = h('button', { type: 'button', class: 'btn ghost sm al-xl', id: 'adm-xlsx', 'data-fkey': 'xlsx', text: 'Excel\'e aktarın' });
    var chips = FILTERS[tab].length ? h('div', { class: 'chips al-chips', role: 'group', 'aria-label': 'Süzgeç' }, FILTERS[tab].map(function (f) {
      return h('button', { type: 'button', class: 'chip', 'data-adm-filter': f[0], 'aria-pressed': String(st.filter[tab] === f[0]), 'data-fkey': 'flt-' + f[0], text: f[1] });
    })) : null;
    return card('adm-list', 'ac-list', 'Oteller, acenteler ve üyeler', 'Bir otelin adına tıklayınca otelin kendi panelini görürsünüz.', [
      h('div', { class: 'al-tools' }, [seg, q, xl]), chips,
      h('p', { class: 'al-count', id: 'adm-count', role: 'status' }),
      h('div', { class: 'tblwrap', id: 'adm-tbl' })
    ]);
  }
  function sortIcon(dir) { return icon(dir === 'asc' ? 'up' : 'down'); }
  function fillTable() {
    var m = st.model, tab = st.tab, wrap = U().el('adm-tbl'), count = U().el('adm-count');
    if (!m || !wrap) { return; }
    var S = st.sort[tab], cols = COLS[tab];
    var rows = A().query(m[tab], { q: st.q, filter: st.filter[tab], sort: S.k, dir: S.dir });
    var head = h('tr', {}, cols.map(function (c) {
      var on = S.k === c[0], left = TEXT_COLS[c[0]] && c[0] !== 'grade';
      return h('th', { scope: 'col', class: left ? 'al-tx' : null, 'aria-sort': on ? (S.dir === 'asc' ? 'ascending' : 'descending') : null }, [
        h('button', { type: 'button', class: 'sortb', 'data-adm-sort': c[0], 'data-fkey': 'sort-' + c[0] }, [h('span', { text: c[1] }), sortIcon(on ? S.dir : 'desc')])]);
    }));
    var body = rows.length ? rows.map(ROW[tab]) : [h('tr', {}, [h('td', { class: 'al-empty', colspan: String(cols.length),
      text: st.q ? 'Aramanızla eşleşen ' + UNIT[tab] + ' yok.' : (st.filter[tab] !== 'all' ? 'Bu süzgece uyan ' + UNIT[tab] + ' yok.' : 'Henüz ' + UNIT[tab] + ' yok.') })])];
    U().clear(wrap);
    wrap.appendChild(h('table', { class: 't adm-t' }, [h('caption', { class: 'sr-only', text: TABS.filter(function (t) { return t[0] === tab; })[0][1] + ' listesi' }),
      h('thead', {}, [head]), h('tbody', {}, body)]));
    var all = m[tab].length;
    count.textContent = rows.length === all ? all + ' ' + UNIT[tab] : rows.length + ' / ' + all + ' ' + UNIT[tab] + ' gösteriliyor';
  }
  function tags(r) {
    return r.tags.length ? h('span', { class: 'tgs' }, r.tags.map(function (t) { return h('span', { class: 'tg ' + t, text: A().TAGS[t].short }); })) : null;
  }
  function mail(e) { return e ? h('a', { href: 'mailto:' + e, text: e }) : '—'; }
  var ROW = {
    hotels: function (r) {
      var sub = [r.city, r.segmentLabel, r.legacy ? 'önceki sürüm kaydı' : null].filter(Boolean).join(', ');
      return h('tr', {}, [
        h('th', { scope: 'row' }, [h('button', { type: 'button', class: 'linkbtn', 'data-adm-open': r.key, 'data-fkey': 'open-' + r.key, text: r.name }),
          sub ? h('span', { class: 'cell-sub', text: sub }) : null, tags(r)]),
        h('td', { text: isNum(r.year) ? String(r.year) : '—' }),
        h('td', { text: n(r.cpor, 1) }),
        h('td', {}, [r.grade ? h('span', { class: 'gb', 'data-g': r.grade, text: r.grade }) : '—']),
        h('td', { text: tons(r.totalT) }),
        h('td', {}, [isNum(r.completeness) ? h('span', { class: 'cm' }, [String(r.completeness), h('i', { 'aria-hidden': 'true' }, [h('span', { style: 'width:' + Math.min(Math.max(r.completeness, 0), 100) + '%' })])]) : '—']),
        h('td', { text: dateTr(r.lastAt) }),
        h('td', { class: 'al-tx' }, [mail(r.email)])
      ]);
    },
    agencies: function (r) {
      return h('tr', {}, [
        h('th', { scope: 'row' }, [h('span', { text: r.name })]),
        h('td', { class: 'al-tx', text: r.city || '—' }),
        h('td', { text: tons(r.totalT) }),
        h('td', { text: isNum(r.passengers) ? n(r.passengers, 0) : '—' }),
        h('td', { text: n(r.perGuestKg, 1) }),
        h('td', { text: String(r.count) }),
        h('td', { text: dateTr(r.lastAt) }),
        h('td', { class: 'al-tx' }, [mail(r.email)])
      ]);
    },
    members: function (r) {
      return h('tr', {}, [
        h('th', { scope: 'row' }, [h('span', { text: r.name }), tags(r)]),
        h('td', { class: 'al-tx', text: r.typeLabel || '—' }),
        h('td', { class: 'al-tx', text: r.city || '—' }),
        h('td', { class: 'al-tx' }, [mail(r.email)]),
        h('td', { text: dateTr(r.joinedAt) }),
        h('td', { text: String(r.records) }),
        h('td', { text: dateTr(r.lastAt) })
      ]);
    }
  };

  // ------------------------------------------------------------------ otel ayrıntısı
  function detailView(host, row) {
    var d = null;
    try { d = A().detail(row); } catch (e) { if (root.console) { root.console.error(e); } d = null; }
    st.cur = d && d.model && d.model.ok ? d : null;
    var meta = [['E-posta', row.email || '—'], ['Kayıt', row.count + ' kayıt'], ['Kaydedilen yıllar', row.years.join(', ') || '—'], ['Son kayıt', dateTr(row.lastAt)]];
    var bar = h('div', { class: 'ad-bar' }, [
      h('button', { type: 'button', class: 'btn ghost sm ad-back', 'data-adm-back': '', 'data-fkey': 'back' }, [icon('back'), h('span', { text: 'Listeye dönün' })]),
      h('p', { class: 'ad-meta' }, meta.map(function (x) { return h('span', {}, [h('b', { text: x[0] + ': ' }), x[1]]); })),
      st.cur ? h('div', { class: 'ad-acts' }, [
        h('button', { type: 'button', class: 'btn primary sm', 'data-adm-report': 'report', text: 'PDF raporu' }),
        h('button', { type: 'button', class: 'btn ghost sm', 'data-adm-report': 'summary', text: 'Tek sayfalık özet' })
      ]) : null
    ]);
    var sec = h('section', { class: 'dash', id: 'adm-dash', 'aria-label': row.name + ' paneli' });
    host.appendChild(h('div', { class: 'adm adm-detail' }, [h('h1', { class: 'sr-only', text: row.name + ': otel ayrıntısı' }), bar,
      row.legacy ? h('p', { class: 'notice', text: 'Bu otelin son kaydı hesaplayıcının önceki sürümüyle yapılmış; değerler bugünkü yöntemle yeniden hesaplandı.' }) : null,
      sec]));
    if (d) { NS.dashView.render(sec, d.model, { account: 'admin', readOnly: true }); }
    else {
      sec.appendChild(h('div', { class: 'dash-empty' }, [h('h2', { id: 'dash-h', text: row.name }),
        h('p', { text: 'Bu kaydın girdileri okunamadı; listede yalnız kaydedilen özet değerler görünür.' })]));
    }
  }
  function openReport(variant) {
    var d = st.cur; if (!d || !NS.report) { return; }
    var can = NS.report.canBuild(d.state, d.R);
    if (!can.ok) { U().toast('Rapor için veriler eksik'); return; }
    var html;
    try { html = NS.report.build(d.state, d.R, { toolbar: true, sample: false, variant: variant === 'summary' ? 'summary' : 'report' }); }
    catch (e) { if (root.console) { root.console.error(e); } U().toast('Rapor oluşturulamadı'); return; }
    var w = root.open('', '_blank');
    if (!w) { U().toast('Tarayıcı yeni sekmeyi engelledi'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }

  // ------------------------------------------------------------------ Excel
  function loadXlsx() {
    if (root.XLSX) { return Promise.resolve(root.XLSX); }
    return new Promise(function (res, rej) {
      var sc = doc.createElement('script'); sc.src = XLSX_URL; sc.async = true;
      sc.onload = function () { if (root.XLSX) { res(root.XLSX); } else { rej(new Error('XLSX yok')); } };
      sc.onerror = function () { rej(new Error('Excel kütüphanesi yüklenemedi')); };
      doc.head.appendChild(sc);
    });
  }
  function exportXlsx() {
    if (!st.model) { return; }
    loadXlsx().then(function (X) {
      var wb = X.utils.book_new();
      A().sheets(st.model).forEach(function (sh) {
        var ws = X.utils.aoa_to_sheet(sh.rows);
        ws['!cols'] = sh.widths.map(function (w) { return { wch: w }; });
        X.utils.book_append_sheet(wb, ws, sh.name);
      });
      var d = new Date(st.model.now), p = function (x) { return (x < 10 ? '0' : '') + x; };
      X.writeFile(wb, 'commited-turizm-' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '.xlsx');
      U().toast('Excel dosyası indirildi');
    }, function () { U().toast('Excel dosyası oluşturulamadı; bağlantınızı kontrol edin'); });
  }

  // ------------------------------------------------------------------ çizim
  function render() {
    var host = U().el('adm-main'), m = st.model;
    if (!host || !m) { return; }
    U().clear(host);
    if (st.detail && m.byKey[st.detail]) { detailView(host, m.byKey[st.detail]); return; }
    st.detail = null; st.cur = null;
    var kids = [];
    if (st.data && st.data.mode === 'firms') {
      kids.push(h('p', { class: 'notice', text: 'Kayıtlar üye profilleri üzerinden okundu; profili olmayan hesapların kayıtları görünmeyebilir. '
        + 'Hepsini görmek için Firestore kurallarına yöneticinin bütün kayıtları tek seferde okuma izni eklenmeli (yazılım ekibi: README-yazilim-ekibi.md).' }));
    }
    kids.push(hero(m));
    if (m.empty) {
      kids.push(h('div', { class: 'dcard adm-list' }, [h('p', { class: 'dc-sub', text: 'Henüz üye ya da kayıt yok. Oteller ve acenteler turizm hesaplayıcısında üye olup hesaplarını kaydettikçe burada görünür.' })]));
      host.appendChild(h('div', { class: 'adm' }, kids));
      placeDots();
      return;
    }
    kids.push(h('div', { class: 'dash-grid' }, [weeksCard(m), oppsCard(m)]));
    kids.push(listCard(m));
    host.appendChild(h('div', { class: 'adm' }, kids));
    fillTable(); drawWeeks(); placeDots();
  }
  function refreshList(focusTarget) {
    var old = doc.querySelector('.adm-list'); if (!old || !st.model) { render(); return; }
    var fresh = listCard(st.model);
    old.parentNode.replaceChild(fresh, old);
    fillTable();
    if (focusTarget) { focusKey(focusTarget); }
  }
  function refreshWeeks() {
    var old = doc.querySelector('.dcard.d-trend'); if (!old || !st.model) { return; }
    old.parentNode.replaceChild(weeksCard(st.model), old);
    drawWeeks();
  }

  function openDetail(key) {
    if (!st.model || !st.model.byKey[key]) { return; }
    st.listY = root.pageYOffset || 0;
    st.detail = key;
    try { root.history.pushState({ admDetail: key }, '', '#otel'); st.pushed = true; } catch (e) { st.pushed = false; }
    render();
    root.scrollTo(0, 0);
    var hd = doc.getElementById('dash-h');
    if (hd) { hd.setAttribute('tabindex', '-1'); try { hd.focus({ preventScroll: true }); } catch (e2) { hd.focus(); } }
  }
  function closeNow() {
    var key = st.detail;
    st.detail = null; st.cur = null;
    render();
    root.scrollTo(0, st.listY || 0);
    focusKey('open-' + key);
  }
  function closeDetail() {
    if (st.pushed) { st.pushed = false; root.history.back(); return; }
    closeNow();
  }

  // ------------------------------------------------------------------ olaylar
  doc.addEventListener('click', function (ev) {
    var t = ev.target.closest ? ev.target.closest('[data-adm-open],[data-adm-back],[data-adm-tab],[data-adm-filter],[data-adm-sort],[data-adm-metric],[data-adm-tbl],[data-adm-report],#adm-xlsx') : null;
    if (!t || !st.model) { return; }
    if (t.hasAttribute('data-adm-open')) { openDetail(t.getAttribute('data-adm-open')); return; }
    if (t.hasAttribute('data-adm-back')) { closeDetail(); return; }
    if (t.hasAttribute('data-adm-report')) { openReport(t.getAttribute('data-adm-report')); return; }
    if (t.id === 'adm-xlsx') { exportXlsx(); return; }
    if (t.hasAttribute('data-adm-tab')) {
      st.tab = t.getAttribute('data-adm-tab');
      var f = t.getAttribute('data-adm-filter');
      if (f) {
        st.filter[st.tab] = f; st.q = '';
        refreshList();
        var list = doc.querySelector('.adm-list');
        if (list) { list.scrollIntoView({ block: 'start' }); }
        focusKey(null);
        var hd = doc.getElementById('ac-list'); if (hd) { try { hd.focus({ preventScroll: true }); } catch (e) { hd.focus(); } }
        return;
      }
      refreshList('tab-' + st.tab);
      return;
    }
    if (t.hasAttribute('data-adm-filter')) { st.filter[st.tab] = t.getAttribute('data-adm-filter'); keepFocus(function () { refreshList(); }); return; }
    if (t.hasAttribute('data-adm-sort')) {
      var k = t.getAttribute('data-adm-sort'), S = st.sort[st.tab];
      if (S.k === k) { S.dir = S.dir === 'asc' ? 'desc' : 'asc'; } else { S.k = k; S.dir = TEXT_COLS[k] ? 'asc' : 'desc'; }
      keepFocus(fillTable);
      return;
    }
    if (t.hasAttribute('data-adm-metric')) { st.metric = t.getAttribute('data-adm-metric'); keepFocus(refreshWeeks); return; }
    if (t.hasAttribute('data-adm-tbl')) {
      st.table = !st.table;
      var w = doc.getElementById('atbl-weeks'); if (w) { w.hidden = !st.table; }
      t.setAttribute('aria-expanded', String(st.table));
      t.textContent = st.table ? 'Tabloyu gizle' : 'Tablo olarak göster';
    }
  });
  doc.addEventListener('input', function (ev) {
    if (ev.target && ev.target.id === 'adm-q') { st.q = ev.target.value; fillTable(); }
  });
  root.addEventListener('popstate', function () { if (st.detail) { st.pushed = false; closeNow(); } });
  root.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (!st.detail) { drawWeeks(); placeDots(); } }, 150);
  });

  // ------------------------------------------------------------------ admin-cloud.js ile bağlantı
  root.__admin = {
    /** data: { firms, items, now, mode: 'group' | 'firms' } */
    show: function (data) {
      st.data = data;
      st.model = A().build(data);
      if (st.detail && !st.model.byKey[st.detail]) { st.detail = null; }
      render();
    },
    message: function (text, tone) {
      var host = U().el('adm-main'); if (!host) { return; }
      st.model = null; U().clear(host);
      host.appendChild(h('div', { class: 'adm' }, [h('p', { class: 'notice' + (tone === 'warn' ? ' warn' : ''), role: 'status', text: text })]));
    },
    loading: function () {
      var host = U().el('adm-main'); if (!host) { return; }
      if (st.model) { U().toast('Kayıtlar yenileniyor'); return; }      // yenilerken eski görünüm kalsın
      U().clear(host); host.appendChild(h('p', { class: 'adm-loading', text: 'Kayıtlar yükleniyor…' }));
    },
    /** çıkışta: önceki oturumun verisi ekranda ve bellekte kalmasın */
    reset: function () {
      st.data = null; st.model = null; st.detail = null; st.cur = null; st.pushed = false;
      var host = U().el('adm-main'); if (host) { U().clear(host); }
    },
    _state: st
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
