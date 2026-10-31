/* =========================================================================
   Turizm hesaplayıcısı — PDF SÜRDÜRÜLEBİLİRLİK RAPORU  (assets/js/turizm/report.js)
   -------------------------------------------------------------------------
   build(state, R, opts) → tek parça HTML belgesi: A4 sayfalar, satır içi SVG grafikler.
     · Tarayıcıda (app.js, "PDF raporu oluştur" / "Tek sayfalık özet"): yeni sekmede açılır; üstteki
       "PDF olarak kaydet" düğmesi yazdırma penceresini açar, kullanıcı hedef olarak "PDF olarak kaydet"i seçer.
     · Node'da: Chromium (Playwright) page.pdf() ile aynı PDF (tools/report-sample.mjs).
   canBuild(state, R) → { ok, reason }: düğmenin açık/kapalı durumu için.
   R = TURIZM.compute(state). Saf fonksiyon; DOM'a dokunmaz. Dışa: globalThis.TURIZM.report
   opts: { generatedAt: Date, reportId: string, sample: bool, toolbar: bool, fontCss: string,
           variant: 'report' (varsayılan, kapaklı çok sayfalı rapor) | 'summary' (tek sayfalık özet) }
     fontCss verilmezse DM Sans Google Fonts'tan yüklenir (sitedeki yazı tipi).
   Otel logosu (state.hotel.logo, model.logoOf ile denetlenmiş PNG/JPEG data URL) kapakta, sayfa
   başlıklarında ve özette gösterilir. Karbon dışı göstergeler (R.esg: su, atık, kimyasal, yerel
   satın alma, çalışan eğitimi) "Kaynaklar, tedarik ve çalışanlar" bölümündedir; veri yoksa bölüm çıkar.
   Bölüm numaraları ve içindekiler sayfa sayısına göre kendiliğinden belirlenir.
   Sayfa düzeni sabit A4 kutularıdır; uzun içerik (çok sayıda enerji satırı, çok faktör) ek sayfaya
   bölünür. Sayılar yalnız R'den gelir; metinde elle yazılmış rakam yoktur.
   Renkler: marka "Deniz" teması (assets/css/theme-sea.css). Kapsam renkleri dataviz
   doğrulayıcısından geçti (açık zemin, renk körlüğü ayrımı ve 3:1 kontrast).
   ========================================================================= */
(function (root) {
  'use strict';

  var NS = root.TURIZM = root.TURIZM || {};

  // ------------------------------------------------------------------ biçim
  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function fx(x, d, fixed) {
    if (!isNum(x)) { return '—'; }
    var s = root.NUM.format(x, d, fixed ? d : 0);
    return s.charAt(0) === '-' ? '−' + s.slice(1) : s;
  }
  function tn(x) { return fx(x, 1, true); }                         // ton: hep 1 ondalık
  function tl(x) { return isNum(x) ? fx(Math.round(x), 0) : '—'; }  // TL: tam sayı
  /** Büyük TL tutarları: 96,0 milyon TL · 1,2 milyar TL · 850.000 TL */
  function tlShort(x) {
    if (!isNum(x)) { return '—'; }
    var a = Math.abs(x);
    return a >= 1e9 ? fx(x / 1e9, 1, true) + ' milyar TL' : a >= 1e6 ? fx(x / 1e6, 1, true) + ' milyon TL' : tl(x) + ' TL';
  }
  function pos(x) { return isNum(x) && x > 0; }
  function pc(x, d) { return isNum(x) ? root.NUM.pct(fx(x, d === undefined ? 0 : d)) : '—'; }   // x yüzde cinsinden
  function pcf(x) { return isNum(x) ? root.NUM.pct(fx(x, 1, true)) : '—'; }                     // tablolarda sabit 1 ondalık
  // Cümle içinde küçük harf: ilk kelime kısaltmaysa (LED, BMS, GES) dokunma; Türkçe I → ı
  function lc(s) {
    s = String(s || '');
    var first = s.split(/\s/)[0];
    if (/^[A-ZÇĞİÖŞÜ0-9-]{2,}$/.test(first)) { return s; }
    return s.charAt(0).toLocaleLowerCase('tr') + s.slice(1);
  }
  function noLe(s) { return String(s || '').replace(/≤\s?/g, 'en çok ').replace(/≥\s?/g, 'en az '); }
  function yearOf(h) { return isNum(h.year) ? String(h.year) : ''; }
  function period(h) { return isNum(h.year) ? '1 Ocak – 31 Aralık ' + h.year : '—'; }
  function hasRef(b) { return !!(b && isNum(b.ref) && isNum(b.ratio) && b.grade && b.grade.letter && b.grade.letter !== '—'); }
  /** En büyük n-1 kalem + "Diğer (k kalem)" — grafikler sayfaya sığsın */
  function topN(list, n) {
    if (list.length <= n) { return list; }
    var head = list.slice(0, n - 1), rest = list.slice(n - 1);
    return head.concat([{ label: 'Diğer (' + rest.length + ' kalem)', t: rest.reduce(function (a, x) { return a + x.t; }, 0), other: true, fmt: rest[0].fmt }]);
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var CO2E = 'CO<sub>2</sub>e';
  var MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  function dateTr(d) { return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
  function star(s) { return String(s || '').replace(/(\d)★/g, '$1 yıldızlı'); }
  // Kapak ve cümlelerde kullanılan segment adları (BENCH.segments[].tr tablo için kalır)
  var SEG_NICE = { lux: 'lüks otel', resort5: '5 yıldızlı tatil köyü', s5: '5 yıldızlı otel', s4: '4 yıldızlı otel',
                   s3: '3 yıldızlı otel', limited: 'apart, pansiyon ve butik otel' };
  function diffText(ratio) {          // oran → "%30 altında" / "%12 üzerinde" / "ortalamada"
    if (!isNum(ratio)) { return '—'; }
    var p = Math.round(Math.abs(1 - ratio) * 100);
    if (p < 2) { return 'ortalamada'; }
    return root.NUM.pct(p) + (ratio < 1 ? ' altında' : ' üzerinde');
  }
  var COLORS = {
    ink: '#0E2233', ink2: '#4A6578', line: '#CFE0EA', grid: '#DCE9F0', mist: '#EBF5FA', ocean: '#0B6FA0', soft: '#BCDDEE',
    s1: '#D4643A', s2: '#0B6FA0', s3: '#13906A', yellow: '#E8C547', good: '#1F8A52', bad: '#C0392B', warn: '#B87410',
    grade: { A: ['#15733C', '#DCF1E4'], B: ['#3A7420', '#E8F2D9'], C: ['#7A5C0A', '#FBF1D2'], D: ['#A24F0E', '#FBE6D3'], E: ['#A8261E', '#FADCDA'] }
  };
  var PT = 0.3528;   // 1 pt = 0,3528 mm (SVG'ler mm biriminde çizilir)

  // ------------------------------------------------------------------ küçük parçalar
  function icon(kind) {
    var c = { good: COLORS.good, bad: COLORS.bad, warn: COLORS.warn, info: COLORS.ocean }[kind];
    if (kind === 'todo') {
      return '<svg class="ic" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5.3" fill="none" stroke="#9BB0BF" stroke-width="1.2"/></svg>';
    }
    var g = kind === 'good'
      ? '<path d="M3.3 6.2l1.8 1.8 3.7-4" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>'
      : kind === 'info'
        ? '<path d="M6 5.4v3.2" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/><circle cx="6" cy="3.5" r=".85" fill="#fff"/>'
        : '<path d="M6 3.2v3.3" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/><circle cx="6" cy="8.6" r=".85" fill="#fff"/>';
    return '<svg class="ic" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="6" fill="' + c + '"/>' + g + '</svg>';
  }
  function sw(color) { return '<span class="sw" style="background:' + color + '"></span>'; }
  /** Yüzde halkası (0–1): ortası yüzde yazılı, mm biriminde */
  function ring(frac, label) {
    var r = 9.2, C = 2 * Math.PI * r, f = Math.max(0, Math.min(1, isNum(frac) ? frac : 0));
    var p = f * 100, txt = root.NUM.pct(fx(p, p > 0 && p < 10 ? 1 : 0));
    return '<svg class="ring" viewBox="0 0 24 24" role="img" aria-label="' + esc(label + ': ' + txt) + '">'
      + '<circle cx="12" cy="12" r="' + r + '" fill="none" stroke="#DCE9F0" stroke-width="3.2"/>'
      + (f > 0 ? '<circle cx="12" cy="12" r="' + r + '" fill="none" stroke="' + COLORS.ocean + '" stroke-width="3.2" transform="rotate(-90 12 12)" stroke-dasharray="'
        + (C * f).toFixed(3) + ' ' + C.toFixed(3) + '"/>' : '')
      + '<text x="12" y="13.55" text-anchor="middle" font-size="5.2" font-weight="650" fill="#0E2233">' + txt + '</text></svg>';
  }
  /** Kapak ve özetteki logo alanı (beyaz zemin: koyu logolar da okunur) */
  function logoPlate(c, cls) {
    return c.logo ? '<div class="' + (cls || 'cv-logo') + '"><img src="' + esc(c.logo) + '" alt="' + esc((c.s.hotel.name || 'Tesis') + ' logosu') + '"></div>' : '';
  }
  function chapter(num, title, take) {
    return '<div class="chap">' + (num ? '<span class="chap-n">' + num + '</span>' : '') + '<h2>' + title + '</h2></div>'
      + (take ? '<p class="take' + (num ? '' : ' nonum') + '">' + take + '</p>' : '');
  }
  function kpi(label, value, unit, sub) {
    return '<div class="kpi"><div class="l">' + label + '</div><div class="v">' + value + (unit ? '<small>' + unit + '</small>' : '') + '</div>'
      + (sub ? '<div class="s">' + sub + '</div>' : '') + '</div>';
  }
  function table(head, rows, opts) {
    opts = opts || {};
    var h = '<table class="t' + (opts.cls ? ' ' + opts.cls : '') + '"><thead><tr>' + head.map(function (c) {
      return '<th' + (c.num ? ' class="num"' : '') + (c.w ? ' style="width:' + c.w + '"' : '') + '>' + c.t + '</th>';
    }).join('') + '</tr></thead><tbody>';
    rows.forEach(function (r) {
      h += '<tr' + (r.cls ? ' class="' + r.cls + '"' : '') + '>' + r.cells.map(function (c, i) {
        return '<td' + (head[i] && head[i].num ? ' class="num"' : '') + '>' + c + '</td>';
      }).join('') + '</tr>';
    });
    return h + '</tbody></table>';
  }

  // ------------------------------------------------------------------ kapak deseni: eş derinlik eğrileri
  // Her tesis için adından türetilen tohumla aynı, ama tesisten tesise farklı bir "deniz haritası" çizer.
  function hashStr(s) { var h = 2166136261 >>> 0; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0; var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function marching(g, nx, ny, step, lv) {
    var out = [];
    function lerp(v1, v2) { return (lv - v1) / (v2 - v1); }
    for (var j = 0; j < ny - 1; j++) {
      for (var i = 0; i < nx - 1; i++) {
        var a = g[j * nx + i], b = g[j * nx + i + 1], c = g[(j + 1) * nx + i + 1], d = g[(j + 1) * nx + i];
        var idx = (a > lv ? 8 : 0) | (b > lv ? 4 : 0) | (c > lv ? 2 : 0) | (d > lv ? 1 : 0);
        if (idx === 0 || idx === 15) { continue; }
        var x = i * step, y = j * step;
        var T = [x + step * lerp(a, b), y], Rt = [x + step, y + step * lerp(b, c)];
        var Bt = [x + step * lerp(d, c), y + step], Lf = [x, y + step * lerp(a, d)];
        switch (idx) {
          case 1: case 14: out.push([Lf, Bt]); break;
          case 2: case 13: out.push([Bt, Rt]); break;
          case 3: case 12: out.push([Lf, Rt]); break;
          case 4: case 11: out.push([T, Rt]); break;
          case 5: out.push([Lf, T]); out.push([Bt, Rt]); break;
          case 6: case 9: out.push([T, Bt]); break;
          case 7: case 8: out.push([Lf, T]); break;
          case 10: out.push([T, Rt]); out.push([Lf, Bt]); break;
        }
      }
    }
    return out;
  }
  function joinSegments(segs) {
    function key(p) { return Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000); }
    var ends = {};
    segs.forEach(function (s, i) { [0, 1].forEach(function (e) { var k = key(s[e]); (ends[k] = ends[k] || []).push(i); }); });
    var used = new Uint8Array(segs.length), lines = [];
    function grow(line, fwd) {
      for (;;) {
        var p = fwd ? line[line.length - 1] : line[0], list = ends[key(p)] || [], next = -1;
        for (var q = 0; q < list.length; q++) { if (!used[list[q]]) { next = list[q]; break; } }
        if (next < 0) { return; }
        used[next] = 1;
        var s = segs[next], pt = key(s[0]) === key(p) ? s[1] : s[0];
        if (fwd) { line.push(pt); } else { line.unshift(pt); }
      }
    }
    for (var i = 0; i < segs.length; i++) {
      if (used[i]) { continue; }
      used[i] = 1;
      var line = [segs[i][0], segs[i][1]];
      grow(line, true); grow(line, false);
      lines.push(line);
    }
    return lines;
  }
  function smoothPath(pts) {
    if (pts.length < 2) { return ''; }
    var p = [pts[0]];
    for (var i = 1; i < pts.length; i++) {
      var q = p[p.length - 1];
      if (Math.abs(pts[i][0] - q[0]) + Math.abs(pts[i][1] - q[1]) > 1.1 || i === pts.length - 1) { p.push(pts[i]); }
    }
    function r(v) { return Math.round(v * 10) / 10; }
    var d = 'M' + r(p[0][0]) + ' ' + r(p[0][1]);
    if (p.length === 2) { return d + 'L' + r(p[1][0]) + ' ' + r(p[1][1]); }
    for (var k = 1; k < p.length - 1; k++) {
      d += 'Q' + r(p[k][0]) + ' ' + r(p[k][1]) + ' ' + r((p[k][0] + p[k + 1][0]) / 2) + ' ' + r((p[k][1] + p[k + 1][1]) / 2);
    }
    var last = p[p.length - 1];
    return d + 'L' + r(last[0]) + ' ' + r(last[1]);
  }
  function isobaths(seedText, W, H, levels, step) {
    var rand = rng(hashStr(seedText || 'commited')), bumps = [];
    for (var i = 0; i < 9; i++) {
      bumps.push({ x: rand() * W * 1.3 - W * 0.15, y: rand() * H * 1.2 - H * 0.1, s: 24 + rand() * 62, a: (rand() < 0.35 ? -1 : 1) * (0.35 + rand() * 0.8) });
    }
    var tiltX = (rand() - 0.5) * 0.006, tiltY = 0.004 + rand() * 0.004, ph = rand() * 6.28;
    function f(x, y) {
      var v = tiltX * x - tiltY * y + 0.07 * Math.sin(x / 19 + ph) * Math.cos(y / 27 - ph);
      for (var k = 0; k < bumps.length; k++) {
        var b = bumps[k], dx = x - b.x, dy = y - b.y;
        v += b.a * Math.exp(-(dx * dx + dy * dy) / (2 * b.s * b.s));
      }
      return v;
    }
    var nx = Math.ceil(W / step) + 1, ny = Math.ceil(H / step) + 1, g = new Float64Array(nx * ny), min = Infinity, max = -Infinity;
    for (var j = 0; j < ny; j++) {
      for (var ii = 0; ii < nx; ii++) {
        var v = f(ii * step, j * step); g[j * nx + ii] = v;
        if (v < min) { min = v; } if (v > max) { max = v; }
      }
    }
    var out = [];
    for (var L = 1; L < levels; L++) {
      var d = joinSegments(marching(g, nx, ny, step, min + (max - min) * L / levels)).map(smoothPath).join('');
      if (d) { out.push({ level: L, index: L % 4 === 0, d: d }); }
    }
    return out;
  }
  function isobathSvg(seed, W, H, opacity) {
    var paths = isobaths(seed, W, H, 22, 2.6), o = opacity || 1;
    return '<svg class="iso" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid slice" aria-hidden="true">'
      + paths.map(function (p) {
        return '<path d="' + p.d + '" fill="none" stroke="#FFFFFF" stroke-opacity="' + ((p.index ? 0.2 : 0.085) * o).toFixed(3)
          + '" stroke-width="' + (p.index ? 0.42 : 0.24) + '" stroke-linecap="round" stroke-linejoin="round"/>';
      }).join('') + '</svg>';
  }

  // ------------------------------------------------------------------ grafikler
  function niceMax(v) {
    if (!(v > 0)) { return 1; }
    var e = Math.pow(10, Math.floor(Math.log(v) / Math.LN10)), m = v / e;
    var n = m <= 1 ? 1 : m <= 1.2 ? 1.2 : m <= 1.5 ? 1.5 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 3 ? 3 : m <= 4 ? 4 : m <= 5 ? 5 : m <= 6 ? 6 : m <= 8 ? 8 : 10;
    return n * e;
  }

  /** Kapsam çubuğu (yüzde 100 yığılmış, yatay) + altında etiketler */
  function scopeBar(parts) {
    var tot = parts.reduce(function (a, p) { return a + p.t; }, 0);
    var bar = '<div class="sbar">' + parts.map(function (p) {
      return '<span style="flex:' + (p.t / tot).toFixed(5) + ' 0 0;background:' + p.color + '"></span>';
    }).join('') + '</div>';
    var lab = '<div class="slab">' + parts.map(function (p) {
      return '<div>' + sw(p.color) + '<b>' + p.name + '</b> ' + tn(p.t) + ' t <span class="mut">' + pcf(p.t / tot * 100) + '</span>'
        + (p.desc ? '<div class="mut sm">' + p.desc + '</div>' : '') + '</div>';
    }).join('') + '</div>';
    return bar + lab;
  }

  /** Kaynak çubukları: kapsam rengiyle, değer çubuk ucunda */
  function sourceBars(all, color, n, maxW, cls) {
    var tot = all.reduce(function (a, s) { return a + s.t; }, 0) || 1;      // pay: tüm kalemlerin toplamına göre
    var list = topN(all, n || 8);
    var max = list.reduce(function (a, s) { return Math.max(a, s.t); }, 0) || 1;
    return '<div class="hbars' + (cls ? ' ' + cls : '') + '">' + list.map(function (s) {
      var w = Math.max(s.t / max * (maxW || 76), 0.6);   // en uzun çubuk %76: değer etiketi kenara taşmasın
      return '<div class="hb-row"><div class="hb-l">' + esc(s.label) + '</div><div class="hb-track"><span class="hb-bar" style="width:'
        + w.toFixed(2) + '%;background:' + (s.other ? '#9BB0BF' : color(s)) + '"></span><span class="hb-v">' + (s.fmt ? s.fmt(s.t) : tn(s.t) + ' t') + ' <span class="mut">'
        + pcf(s.t / tot * 100) + '</span></span></div></div>';
    }).join('') + '</div>';
  }

  /** CPOR ölçeği: A–E bantları, tesis, önlemler sonrası ve segment ortalaması */
  function cporScale(cpor, after, ref, dark, compact) {
    var tight = dark || compact;
    var W = 176, H = tight ? 24 : 30, x0 = 0, D = Math.max(ref * 1.8, cpor * 1.12, (after || 0) * 1.12);
    var X = function (v) { return x0 + Math.min(v, D) / D * (W - x0); };
    var G = root.BENCH.grades, prev = 0, s = '', by = tight ? 10.5 : 12.5, bh = tight ? 6 : 7.5;
    G.forEach(function (g, i) {
      var hi = isFinite(g.max) ? g.max * ref : D, a = X(prev), b = X(hi);
      var fill = dark ? (i % 2 ? 'rgba(255,255,255,.26)' : 'rgba(255,255,255,.12)') : COLORS.grade[g.letter][1];
      s += '<rect x="' + (a + (i ? 0.35 : 0)).toFixed(2) + '" y="' + by + '" width="' + Math.max(b - a - (i ? 0.35 : 0), 0).toFixed(2)
        + '" height="' + bh + '" rx="' + (i === 0 || i === G.length - 1 ? 1 : 0) + '" fill="' + fill + '"/>';
      // harf bandın soluna yaslı: segment ortalaması çizgisi C bandının ortasından geçer, harfin üstüne binmesin
      s += '<text x="' + (a + 2.2).toFixed(2) + '" y="' + (by + bh / 2 + 1.25) + '" font-size="' + (9 * PT).toFixed(2)
        + '" font-weight="650" fill="' + (dark ? '#FFFFFF' : COLORS.grade[g.letter][0]) + '">' + g.letter + '</text>';
      prev = hi;
    });
    var ink = dark ? '#FFFFFF' : COLORS.ink, sub = dark ? '#BFE2F4' : COLORS.ink2, fs = (7.5 * PT).toFixed(2);
    // segment ortalaması
    var xr = X(ref);
    s += '<line x1="' + xr.toFixed(2) + '" x2="' + xr.toFixed(2) + '" y1="' + (by - 2.2) + '" y2="' + (by + bh + 0.6) + '" stroke="' + ink + '" stroke-width="0.35"/>';
    s += '<text x="' + (xr + 1.2).toFixed(2) + '" y="' + (by - 3) + '" font-size="' + fs + '" fill="' + sub + '">Segment ortalaması ' + fx(ref, 1) + '</text>';
    // tesis
    var xc = X(cpor), mark = dark ? COLORS.yellow : COLORS.ink;
    s += '<path d="M' + (xc - 1.8).toFixed(2) + ' ' + (by - 3.2) + 'L' + (xc + 1.8).toFixed(2) + ' ' + (by - 3.2) + 'L' + xc.toFixed(2) + ' ' + (by - 0.5) + 'Z" fill="' + mark + '"/>';
    s += '<text x="' + (xc - 2.6).toFixed(2) + '" y="' + (by - 3) + '" text-anchor="end" font-size="' + fs + '" font-weight="600" fill="' + ink + '">Bu tesis ' + fx(cpor, 1) + '</text>';
    // önlemler sonrası
    if (isNum(after) && Math.abs(after - cpor) > 0.05) {
      var xa = X(after), ya = by + bh + 2.6;
      s += '<circle cx="' + xa.toFixed(2) + '" cy="' + ya + '" r="1.25" fill="none" stroke="' + (dark ? COLORS.yellow : COLORS.ocean) + '" stroke-width="0.5"/>';
      s += '<text x="' + (xa + 2.4).toFixed(2) + '" y="' + (ya + 1) + '" font-size="' + fs + '" fill="' + sub + '">Seçilen önlemlerle ' + fx(after, 1) + '</text>';
    }
    return '<svg class="scale" viewBox="0 0 ' + W + ' ' + H + '" style="width:' + W + 'mm;height:' + H + 'mm" role="img" aria-label="Oda-gece başına karbon kıyas ölçeği">' + s + '</svg>';
  }

  /** Net sıfır patikası: plan ve NZMFH üst sınırı, açık taralı */
  function pathwayChart(P) {
    var S = P.series, W = 176, H = 68, L = 15, Rm = 28, T = 5, B = 8;
    var pw = W - L - Rm, ph = H - T - B;
    var y0 = S.years[0], y1 = S.years[S.years.length - 1];
    var vmax = niceMax(Math.max.apply(null, S.target.concat(S.plan)) * 1.04);
    var X = function (y) { return L + (y - y0) / (y1 - y0) * pw; }, Y = function (v) { return T + ph - v / vmax * ph; };
    var s = '', fs = (7 * PT).toFixed(2), k;
    for (k = 0; k <= 4; k++) {
      var v = vmax * k / 4, yy = Y(v).toFixed(2);
      s += '<line x1="' + L + '" x2="' + (L + pw) + '" y1="' + yy + '" y2="' + yy + '" stroke="' + (k ? COLORS.grid : '#B9CCD8') + '" stroke-width="' + (k ? 0.2 : 0.3) + '"/>';
      s += '<text x="' + (L - 2) + '" y="' + (Y(v) + 0.9).toFixed(2) + '" text-anchor="end" font-size="' + fs + '" fill="' + COLORS.ink2 + '">' + fx(v, 0) + '</text>';
    }
    for (var yr = y0; yr <= y1; yr += 5) {
      s += '<text x="' + X(yr).toFixed(2) + '" y="' + (T + ph + 5) + '" text-anchor="middle" font-size="' + fs + '" fill="' + COLORS.ink2 + '">' + yr + '</text>';
    }
    // açık (plan > hedef)
    var up = [], lo = [];
    S.years.forEach(function (yr2, i) { up.push([X(yr2), Y(Math.max(S.plan[i], S.target[i]))]); lo.push([X(yr2), Y(S.target[i])]); });
    var area = 'M' + up.map(function (p) { return p[0].toFixed(2) + ' ' + p[1].toFixed(2); }).join('L') + 'L'
      + lo.reverse().map(function (p) { return p[0].toFixed(2) + ' ' + p[1].toFixed(2); }).join('L') + 'Z';
    s += '<path d="' + area + '" fill="' + COLORS.s1 + '" fill-opacity="0.13"/>';
    function line(arr, color, w, dash) {
      return '<path d="M' + S.years.map(function (yr2, i) { return X(yr2).toFixed(2) + ' ' + Y(arr[i]).toFixed(2); }).join('L') + '" fill="none" stroke="' + color
        + '" stroke-width="' + w + '" stroke-linejoin="round" stroke-linecap="round"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>';
    }
    s += line(S.target, COLORS.ink2, 0.4, '1.4 1.1');
    s += line(S.plan, COLORS.ocean, 0.7);
    // kilometre taşları (hedef çizgisi üstünde) ve plan uçları
    (P.evaluation || []).forEach(function (e) {
      s += '<circle cx="' + X(e.year).toFixed(2) + '" cy="' + Y(e.targetTco2e).toFixed(2) + '" r="0.95" fill="#FFFFFF" stroke="' + COLORS.ink2 + '" stroke-width="0.4"/>';
    });
    var last = S.years.length - 1;
    s += '<circle cx="' + X(y0).toFixed(2) + '" cy="' + Y(S.plan[0]).toFixed(2) + '" r="1.25" fill="' + COLORS.ocean + '" stroke="#FFFFFF" stroke-width="0.5"/>';
    s += '<text x="' + (X(y0) + 2.2).toFixed(2) + '" y="' + (Y(S.plan[0]) - 2).toFixed(2) + '" font-size="' + fs + '" fill="' + COLORS.ink + '">Baz yıl ' + y0 + ': ' + tn(S.plan[0]) + ' t</text>';
    s += '<circle cx="' + X(y1).toFixed(2) + '" cy="' + Y(S.plan[last]).toFixed(2) + '" r="1.25" fill="' + COLORS.ocean + '" stroke="#FFFFFF" stroke-width="0.5"/>';
    s += '<text x="' + (X(y1) + 2.2).toFixed(2) + '" y="' + (Y(S.plan[last]) + 0.9).toFixed(2) + '" font-size="' + fs + '" font-weight="600" fill="' + COLORS.ink + '">Plan ' + tn(S.plan[last]) + ' t</text>';
    s += '<text x="' + (X(y1) + 2.2).toFixed(2) + '" y="' + (Y(S.target[last]) + 0.9).toFixed(2) + '" font-size="' + fs + '" fill="' + COLORS.ink2 + '">Sınır ' + tn(S.target[last]) + ' t</text>';
    // ilk açık yılı notu
    var g = P.firstGap;
    if (g && g.gapTco2e > 0.5) {
      var gx = X(g.year), gy1 = Y(g.planTco2e), gy2 = Y(g.targetTco2e);
      s += '<line x1="' + (gx + 1.6).toFixed(2) + '" x2="' + (gx + 1.6).toFixed(2) + '" y1="' + gy1.toFixed(2) + '" y2="' + gy2.toFixed(2) + '" stroke="' + COLORS.s1 + '" stroke-width="0.35"/>';
      s += '<text x="' + (gx + 3).toFixed(2) + '" y="' + ((gy1 + gy2) / 2 + 0.9).toFixed(2) + '" font-size="' + fs + '" fill="' + COLORS.ink + '">' + g.year + ' açığı ' + tn(g.gapTco2e) + ' t</text>';
    }
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" style="width:' + W + 'mm;height:' + H + 'mm" role="img" aria-label="Net sıfır patikası">' + s + '</svg>';
  }

  /** Segment ortalamasına göre endeks çubukları (ortalama = 100) */
  function indexRows(rows) {
    var MAXI = 200;
    var head = '<div class="ix-head"><span></span><span class="ix-scale"><i style="left:0">0</i><i style="left:50%">100 = segment ortalaması</i><i style="left:100%">200</i></span><span>Tesis / ortalama</span><span>Fark</span></div>';
    return '<div class="ix">' + head + rows.map(function (r) {
      var idx = r.ratio * 100, w = Math.min(idx, MAXI) / MAXI * 100;
      var kind = Math.abs(1 - r.ratio) < 0.02 ? 'info' : (r.ratio < 1) === r.lowerIsBetter ? 'good' : 'bad';
      return '<div class="ix-row"><div class="ix-l">' + r.label + '<div class="mut sm">' + r.unit + '</div></div>'
        + '<div class="ix-track"><span class="ix-bar" style="width:' + w.toFixed(2) + '%"></span><span class="ix-ref"></span></div>'
        + '<div class="ix-n">' + r.mine + ' <span class="mut">/ ' + r.ref + '</span></div>'
        + '<div class="ix-d">' + icon(kind) + ' ' + diffText(r.ratio) + '</div></div>';
    }).join('') + '</div>';
  }

  // ------------------------------------------------------------------ sayfalar
  function cover(c) {
    var s = c.s, h = s.hotel, R = c.R, b = R.bench;
    var sub = [h.city, isNum(h.rooms) ? fx(h.rooms, 0) + ' oda' : null, SEG_NICE[h.segment] || star(b.segment && b.segment.tr)].filter(Boolean).join(', ');
    var after = R.scenario && R.scenario.any && R.scenario.valid ? R.scenario.afterCpor : null;
    var verify = h.verify === 'third' ? 'Bağımsız üçüncü taraf' : h.verify === 'internal' ? 'İç inceleme' : 'Yok (iç hesaplama)';
    var grid = R.grid ? (R.grid.origin === 'tr' ? 'ETKB ' + R.grid.basisYear + ', ' + fx(R.grid.value, 3) + ' kg/kWh' : 'HCMI v2.0 ülke tablosu') : '—';
    var nl = String(h.name || '').length, hcls = nl > 46 ? ' class="xl"' : nl > 26 ? ' class="l"' : '';
    var ref = hasRef(b);
    var brand = c.logo ? logoPlate(c) : '<div class="brand"><span class="wm">cOmmited</span><span class="wm-s">Turizm Karbon Hesaplayıcısı</span></div>';
    return '<section class="page cover">' + isobathSvg((h.name || '') + '|' + (h.city || '') + '|' + yearOf(h), 210, 297)
      + '<div class="cv-top">' + brand
      + '<div class="cv-year">Sürdürülebilirlik raporu<strong>' + yearOf(h) + '</strong>Karbon, enerji ve kaynak kullanımı'
      + (c.opts.sample ? '<span class="cv-sample">Örnek rapor: gerçek bir tesise ait değildir</span>' : '') + '</div></div>'
      + '<div class="cv-title"><h1' + hcls + '>' + esc(h.name || 'Tesis') + '</h1><p class="cv-sub">' + esc(sub) + '</p></div>'
      + '<div class="cv-fig"><div class="cv-l">Satılan oda-gece başına karbon</div>'
      + '<div class="cv-row"><div class="cv-num">' + fx(R.metrics.cpor, 1) + '<span>kg ' + CO2E + '</span></div>'
      + (ref ? '<div class="cv-cmp"><span class="cv-grade">' + b.grade.letter + '</span><div><b>Kıyas notu ' + b.grade.letter + ', ' + b.grade.label + '</b><br>'
        + 'Türkiye ' + (SEG_NICE[h.segment] || 'segment') + ' ortalaması ' + fx(b.ref, 1) + ' kg; bu tesis ' + diffText(b.ratio) + '</div></div>' : '')
      + '</div>' + (ref ? cporScale(R.metrics.cpor, after, b.ref, true) : '') + '</div>'
      + '<dl class="cv-meta">'
      + '<div><dt>Raporlama dönemi</dt><dd>' + period(h) + '</dd></div>'
      + '<div><dt>Hesaplama yöntemi</dt><dd>HCMI v2.0, GHG Protocol</dd></div>'
      + '<div><dt>Elektrik emisyon faktörü</dt><dd>' + grid + '</dd></div>'
      + '<div><dt>Kıyas kaynağı</dt><dd>CHSB 2026 Türkiye</dd></div>'
      + '<div><dt>Veri tamlığı</dt><dd>' + R.completeness.score + ' / 100</dd></div>'
      + '<div><dt>Bağımsız doğrulama</dt><dd>' + verify + '</dd></div></dl>'
      + '<div class="cv-foot"><span>Rapor no ' + esc(c.opts.reportId) + '</span>'
      + (c.logo ? '<span>cOmmited Turizm Karbon Hesaplayıcısı ile hazırlandı</span>' : '')
      + '<span>Oluşturma tarihi ' + dateTr(c.opts.generatedAt) + '</span></div>'
      + '</section>';
  }

  function summaryPage(c) {
    var s = c.s, h = s.hotel, R = c.R, T = R.totals, m = R.metrics, b = R.bench, sc = R.scopes, I = R.intensity, sn = R.scenario, P = R.path;
    var hcmiSources = R.sources.filter(function (x) { return x.hcmi; });
    var top = hcmiSources[0];
    var segN = SEG_NICE[h.segment] || 'segment', ref = hasRef(b);
    var take = 'Tesisin ' + (yearOf(h) ? yearOf(h) + ' ' : '') + 'karbon ayak izi ' + tn(T.hcmiT) + ' ton ' + CO2E + '. Satılan oda-gece başına ' + fx(m.cpor, 1) + ' kg'
      + (ref ? ' ile Türkiye ' + segN + ' ortalamasının ' + diffText(b.ratio) + '; kıyas notu ' + b.grade.letter + '.' : '.');
    var cmp = function (x, pre) { return x && isNum(x.ratio) ? pre + diffText(x.ratio) : ''; };
    var kpis = '<div class="kpis">'
      + kpi('HCMI karbon ayak izi', tn(T.hcmiT), 't ' + CO2E, 'Kapsam 1, 2 ve dış çamaşırhane')
      + kpi('Oda-gece başına', fx(m.cpor, 1), 'kg ' + CO2E, ref ? 'Kıyas notu ' + b.grade.letter + ', referans ' + fx(b.ref, 1) : '')
      + kpi('Toplantı alanı', fx(m.meetH, 3), 'kg / m²·saat', cmp(b.meet, 'Segmentte ').replace('ortalamada', 'ortalama düzeyde'))
      + kpi('Enerji yoğunluğu', fx(I.kwhm2, 0), 'kWh / m²', cmp(b.kwhm2, 'Segment ortalamasının '))
      + '</div>';
    // karbon dışı göstergeler: misafir gecelemesi başına, yerel satın alma, çalışan eğitimi (veri varsa)
    var E = R.esg || {}, pg = E.perGuest || {}, k2 = [];
    if (isNum(pg.co2Kg)) { k2.push(kpi('Kişi başı karbon', fx(pg.co2Kg, 1), 'kg ' + CO2E, 'Misafir gecelemesi başına')); }
    if (isNum(pg.waterM3)) { k2.push(kpi('Kişi başı su', fx(pg.waterM3 * 1000, 0), 'litre', 'Misafir gecelemesi başına')); }
    if (isNum(E.localPct)) { k2.push(kpi('Yerel satın alma', pc(E.localPct, 0), '', 'Toplam satın almanın payı')); }
    if (isNum(E.trainedPct)) { k2.push(kpi('Çevre eğitimi alan çalışan', pc(E.trainedPct, 0), '', fx(E.staffTrained, 0) + ' / ' + fx(E.staff, 0) + ' kişi')); }
    var kpis2 = k2.length >= 2 ? '<div class="kpis k2" style="grid-template-columns:repeat(' + Math.min(k2.length, 4) + ',1fr)">' + k2.slice(0, 4).join('') + '</div>' : '';
    var parts = [
      { name: 'Kapsam 1', t: sc.s1All, color: COLORS.s1, desc: 'Yakıtlar, araçlar, soğutucu gaz' },
      { name: 'Kapsam 2', t: sc.s2Market, color: COLORS.s2, desc: 'Satın alınan elektrik' },
      { name: 'Kapsam 3', t: sc.s3Laundry, color: COLORS.s3, desc: 'Dış çamaşırhane' }
    ].filter(function (p) { return p.t > 0.0005; });

    // güçlü yönler / gelişim alanları — veriden seçilir
    var good = [], dev = [];
    if (ref && b.ratio < 0.98) { good.push('Oda-gece başına karbon segment ortalamasının ' + diffText(b.ratio) + ' (kıyas notu ' + b.grade.letter + ').'); }
    if (ref && b.ratio > 1.05) { dev.push('Oda-gece başına karbon segment ortalamasının ' + diffText(b.ratio) + ' (kıyas notu ' + b.grade.letter + ').'); }
    [['kwhm2', 'Enerji yoğunluğu'], ['water', 'Oda-gece başına su tüketimi'], ['co2m2', 'Metrekare başına karbon']].forEach(function (k) {
      var x = b[k[0]]; if (x && isNum(x.ratio) && x.ratio < 0.95 && good.length < 3) { good.push(k[1] + ' segment ortalamasının ' + diffText(x.ratio) + '.'); }
    });
    if (sn && sn.any && sn.valid && good.length < 3) {
      good.push('Seçilen ' + sn.applied.length + ' önlem yılda ' + tn(sn.savedT) + ' t azaltım sağlıyor; yatırım ' + fx(sn.paybackYears, 1) + ' yılda geri dönüyor.');
    }
    if (top && top.t / T.hcmiT > 0.4) { dev.push('Emisyonların ' + pc(top.t / T.hcmiT * 100, 0) + ' kadarı ' + lc(top.label) + ' kaynaklı; en büyük kazanç bu kalemde.'); }
    [['waste', 'Dolu oda başına atık'], ['water', 'Su tüketimi'], ['kwhm2', 'Enerji yoğunluğu']].forEach(function (k) {
      var x = b[k[0]]; if (x && isNum(x.ratio) && x.ratio > 1.05 && dev.length < 3) { dev.push(k[1] + ' segment ortalamasının ' + diffText(x.ratio) + '.'); }
    });
    if (R.renewable && R.renewable.elecPct < 20 && dev.length < 3) { dev.push('Yenilenebilir elektrik payı ' + pc(R.renewable.elecPct, 1) + '.'); }
    if (P && P.firstGap && dev.length < 3) { dev.push(P.firstGap.year + ' net sıfır kilometre taşı için ek ' + tn(P.firstGap.gapTco2e) + ' t azaltım gerekiyor.'); }
    // karbon dışı göstergelerden birer madde (yönetim karbonla birlikte bunları da görmek istiyor)
    if (isNum(E.localPct) && E.localPct >= 50 && good.length < 3) { good.push('Satın almanın ' + pc(E.localPct, 0) + ' kadarı yerel tedarikçilerden yapılıyor.'); }
    else if (isNum(E.trainedPct) && E.trainedPct >= 60 && good.length < 3) { good.push('Çalışanların ' + pc(E.trainedPct, 0) + ' kadarı çevre eğitimi aldı.'); }
    if (isNum(E.recycleRate) && E.recycleRate < 0.3 && dev.length < 3) { dev.push('Atığın yalnız ' + pc(E.recycleRate * 100, 0) + ' kadarı geri dönüşüme ya da komposta ayrılıyor.'); }
    else if (isNum(E.localPct) && E.localPct < 30 && dev.length < 3) { dev.push('Yerel tedarikçilerden satın alma payı ' + pc(E.localPct, 0) + '.'); }
    if (!good.length) { good.push('Veri tamlığı ' + R.completeness.score + '/100: ölçüm temeli hazır, ilerleme yıllık olarak izlenebilir.'); }
    if (!dev.length) { dev.push('Belirgin bir zayıf alan görünmüyor; önlem planını ve net sıfır kilometre taşlarını izleyin.'); }
    var li = function (arr, kind) { return '<ul class="ticks">' + arr.map(function (x) { return '<li>' + icon(kind) + '<span>' + x + '</span></li>'; }).join('') + '</ul>'; };

    var plan = '';
    if (sn && sn.any && sn.valid) {
      var names = R.ranking.filter(function (r) { return sn.applied.indexOf(r.id) >= 0; }).map(function (r) { return lc(r.tr); });
      plan = '<div class="panel plan"><h3>Azaltım planı</h3><p>Seçilen önlemler: ' + names.join(', ') + '. Yıllık azaltım <b>' + tn(sn.savedT) + ' t ' + CO2E + '</b> ('
        + pc(sn.savedT / T.hcmiT * 100, 0) + '), yatırım ' + tl(sn.capexTl) + ' TL, yıllık net tasarruf ' + tl(sn.netSavingsTl) + ' TL. Önlemler sonrası oda-gece başına '
        + fx(sn.afterCpor, 1) + ' kg (not ' + sn.afterGrade.letter + ').'
        + (P && P.m2030 ? ' Plan NZMFH 2030 kilometre taşını ' + (P.m2030.met ? 'karşılıyor.' : 'karşılamıyor; açık ' + tn(P.m2030.gapTco2e) + ' t.') : '') + '</p></div>';
    }
    var dq = '<p class="note dq">' + icon('info') + '<span>Veri tamlığı ' + R.completeness.score + '/100. Doğrulama durumu: ' + esc(NS.model.VERIFY[h.verify]) + '. '
      + (R.grid && R.grid.origin === 'tr' && !R.grid.exact && yearOf(h) ? h.year + ' için resmî elektrik faktörü henüz yayımlanmadığından ' + R.grid.basisYear + ' değeri kullanıldı. ' : '')
      + 'Değerler karbon kredisi düşülmeden önceki brüt emisyondur.</span></p>';

    var toc = (c.toc || []).length ? '<div class="toc"><h3>Bu raporda</h3><ol style="grid-template-rows:repeat(' + Math.ceil(c.toc.length / 2) + ',auto)">' + c.toc.map(function (t) {
      return '<li><span class="toc-n">' + t.num + '</span><span class="toc-t">' + t.title + '</span><span class="toc-p">' + t.page + '</span></li>';
    }).join('') + '</ol></div>' : '';
    return chapter('', 'Yönetici özeti', take) + kpis + kpis2
      + '<div class="blk"><h3>Kapsamlara göre dağılım</h3>' + scopeBar(parts) + '</div>'
      + '<div class="cols2 blk"><div><h3>Güçlü yönler</h3>' + li(good, 'good') + '</div><div><h3>Gelişim alanları</h3>' + li(dev, 'warn') + '</div></div>'
      + plan + dq + toc;
  }

  function I0(R) { return R.intensity || {}; }
  function profilePage(c) {
    var s = c.s, h = s.hotel, R = c.R, m = R.metrics, A = h.area;
    var occ = isNum(h.occupiedRooms) && isNum(h.rooms) && h.rooms > 0 ? h.occupiedRooms / (h.rooms * 365) * 100 : null;
    var gpr = isNum(h.guestNights) && isNum(h.occupiedRooms) && h.occupiedRooms > 0 ? h.guestNights / h.occupiedRooms : null;
    var take = 'Hesap, tesisin işletme kontrolündeki tüm enerji kullanımını kapsar. HCMI kuralıyla ayak izinin '
      + pc(m.shareRooms * 100, 1) + ' kadarı konaklamaya, ' + pc(m.shareMeet * 100, 1) + ' kadarı toplantı alanlarına paylaştırılır.';
    var L = [
      ['Tesis', esc(h.name || '—')], ['Konum', esc([h.city, h.country === 'Turkey' ? 'Türkiye' : h.country].filter(Boolean).join(', '))],
      ['Kıyas grubu', esc(star(R.bench.segment && R.bench.segment.tr))], ['Oda sayısı', fx(h.rooms, 0)],
      ['Raporlama dönemi', period(h)], ['İklimlendirilen kapalı alan', fx(A.conditioned, 0) + ' m²'],
      ['Konaklama (oda) alanı', fx(A.rooms, 0) + ' m²'], ['Toplantı alanı', fx(A.meeting, 0) + ' m²'],
      ['Satılan oda-gece', fx(h.occupiedRooms, 0)], ['Misafir-gece', fx(h.guestNights, 0)],
      ['Oda doluluk oranı', occ !== null ? pc(occ, 1) : '—'], ['Oda başına misafir', gpr !== null ? fx(gpr, 2) : '—']
    ];
    var dl = '<dl class="facts">' + L.map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>'; }).join('') + '</dl>';
    var alloc = '<div class="alloc"><div class="alloc-bar"><span style="flex:' + m.shareRooms.toFixed(4) + ' 0 0;background:' + COLORS.ocean + '"></span><span style="flex:'
      + m.shareMeet.toFixed(4) + ' 0 0;background:' + COLORS.soft + '"></span></div>'
      + '<div class="alloc-lab"><div>' + sw(COLORS.ocean) + '<b>Konaklama</b> ' + tn(m.guestroomsT) + ' t <span class="mut">' + pc(m.shareRooms * 100, 1) + '</span>'
      + '<div class="mut sm">Satılan oda-gece başına ' + fx(m.cpor, 1) + ' kg ' + CO2E + '</div></div>'
      + '<div>' + sw(COLORS.soft) + '<b>Toplantı alanları</b> ' + tn(m.meetingsT) + ' t <span class="mut">' + pc(m.shareMeet * 100, 1) + '</span>'
      + '<div class="mut sm">' + fx(m.meetH, 4) + ' kg / m²·saat (yılda 365 gün × 10 saat)</div></div></div></div>';
    var ex = R.sources.filter(function (x) { return !x.hcmi; });
    var exT = function (id) { var x = ex.filter(function (y) { return y.id === id; })[0]; return x ? ' (' + tn(x.t) + ' t)' : ''; };
    var bound = '<div class="cols3 bound">'
      + '<div><h4>HCMI ayak izine dahil</h4><ul><li>Sabit yakıtlar: doğal gaz, LPG, jeneratör ve kazan motorini</li><li>Araç ve iş makinesi yakıtları</li><li>Soğutucu gaz kaçakları</li>'
      + '<li>Satın alınan elektrik (piyasa bazlı Kapsam 2)</li><li>Dış çamaşırhane (Kapsam 3)</li></ul></div>'
      + '<div><h4>Ayrıca raporlanan</h4><ul><li>Su temini ve atıksu' + exT('water') + '</li><li>Atık: depolama ve geri dönüşüm' + exT('waste') + '</li></ul>'
      + '<p class="mut sm">Bu kalemler HCMI metriklerine katılmaz; tam envanter toplamında gösterilir: ' + tn(R.totals.fullT) + ' t ' + CO2E + '.</p></div>'
      + '<div><h4>Kapsam dışı</h4><ul><li>Misafir ve çalışan ulaşımı</li><li>Satın alınan gıda, malzeme ve hizmetler</li><li>Bina ve donanımın üretim ve inşaat emisyonları</li></ul>'
      + '<p class="mut sm">Tedarik zinciri emisyonları Commited Kapsam 3 Karbon Hesaplayıcısı ile ayrıca hesaplanabilir.</p></div></div>';
    // tesis içi enerji kullanımı (dış çamaşırhane hariç)
    var en = [];
    (R.input.energy || []).forEach(function (row, k) {
      var st = h.energy[R.rowIndex[k]], rr = R.rows[k] || {};
      if (st && isNum(rr.kwh) && rr.kwh > 0) { en.push({ label: NS.model.typeLabel(st.typeId), t: rr.kwh / 1000, fmt: function (v) { return fx(v, 1, true) + ' MWh'; } }); }
    });
    en.sort(function (a, b) { return b.t - a.t; });
    var ownMwh = (I0(R).ownKwh || 0) / 1000;
    var energy = en.length ? '<div class="blk"><h3>Enerji kullanımı</h3><div class="mini">'
      + '<div><span>Tesis içi toplam</span><b>' + fx(ownMwh, 1, true) + ' MWh</b></div>'
      + '<div><span>Metrekare başına</span><b>' + fx(R.intensity.kwhm2, 0) + ' kWh</b></div>'
      + '<div><span>Satılan oda-gece başına</span><b>' + (isNum(h.occupiedRooms) && h.occupiedRooms > 0 ? fx(ownMwh * 1000 / h.occupiedRooms, 1) : '—') + ' kWh</b></div>'
      + '<div><span>Yenilenebilir payı</span><b>' + pcf(R.renewable.energyPct) + '</b></div></div>'
      + sourceBars(en, function () { return COLORS.ocean; }, 7) + '</div>' : '';
    return chapter(c.n, 'Tesis ve raporlama sınırları', take)
      + '<div class="blk">' + dl + '</div>' + energy
      + '<div class="blk"><h3>Ayak izinin paylaştırılması</h3>' + alloc
      + '<p class="note">HCMI, ayak izini oda ve toplantı alanlarına metrekare oranıyla böler. Oda-gece başına karbon, konaklama payının satılan oda-gece sayısına bölünmesiyle bulunur.</p></div>'
      + '<div class="blk"><h3>Raporlama sınırı: işletme kontrolü (GHG Protocol)</h3>' + bound + '</div>';
  }

  function footprintPage(c) {
    var s = c.s, h = s.hotel, R = c.R, T = R.totals, sc = R.scopes, M = NS.model;
    var src = R.sources.filter(function (x) { return x.hcmi && x.t > 0.0005; });
    var a = src[0], b2 = src[1];
    var take = !a ? 'Ayak izi kaynaklara göre aşağıda.'
      : !b2 ? 'Ayak izinin tamamına yakını ' + lc(a.label) + ' kaynaklı.'
      : 'Ayak izinin ' + pc(a.t / T.hcmiT * 100, 1) + ' kadarı ' + lc(a.label) + ', ' + pc(b2.t / T.hcmiT * 100, 1) + ' kadarı ' + lc(b2.label)
        + ' kaynaklı. İlk iki kaynak toplamın ' + pc((a.t + b2.t) / T.hcmiT * 100, 0) + ' kadarını oluşturuyor.';
    var scopeColor = function (x) { return x.scope === 1 ? COLORS.s1 : x.scope === 2 ? COLORS.s2 : COLORS.s3; };
    var parts = [
      { name: 'Kapsam 1', t: sc.s1All, color: COLORS.s1, desc: 'Doğrudan: yakıt yakma, araçlar, soğutucu gaz' },
      { name: 'Kapsam 2', t: sc.s2Market, color: COLORS.s2, desc: 'Satın alınan elektrik (piyasa bazlı)' },
      { name: 'Kapsam 3', t: sc.s3Laundry, color: COLORS.s3, desc: 'Dış çamaşırhane' }
    ].filter(function (p) { return p.t > 0.0005; });
    var s2note = Math.abs(sc.s2Location - sc.s2Market) < 0.05
      ? 'Kapsam 2 konum bazlı ve piyasa bazlı değeri aynı (' + tn(sc.s2Market) + ' t): YEK-G veya I-REC belgesi bildirilmedi.'
      : 'Kapsam 2 konum bazlı ' + tn(sc.s2Location) + ' t, piyasa bazlı ' + tn(sc.s2Market) + ' t (YEK-G / I-REC belgeleri düşüldü).';
    // enerji ve emisyon defteri
    var rows = [], totK = 0;
    (R.input.energy || []).forEach(function (row, k) {
      var st = h.energy[R.rowIndex[k]], rr = R.rows[k] || {};
      if (!st) { return; }
      totK += isNum(rr.kwh) ? rr.kwh : 0;
      rows.push({ cells: [esc(M.typeLabel(st.typeId)), fx(row.total, 0) + ' ' + esc(M.unitShort(row.unit)), fx(rr.kwh / 1000, 1, true),
        isNum(rr.ef) ? fx(rr.ef, 3, true) : '—', tn(rr.t), pcf(rr.t / T.hcmiT * 100)] });
    });
    (R.result.refrigerants || []).forEach(function (r) {
      rows.push({ cells: ['Soğutucu gaz kaçağı: ' + esc(r.name), fx(r.kg, 1) + ' kg × GWP ' + fx(r.gwp, 0), '—', '—', tn(r.tco2e), pcf(r.tco2e / T.hcmiT * 100)] });
    });
    if (sc.uplift > 1e-9) {
      var upPct = (R.result.breakdown.upliftFactor - 1) * 100;
      rows.push({ cells: ['HCMI tahmini ek: bilinmeyen soğutucu gaz / araç yakıtı', 'Toplama %' + fx(upPct, 0) + ' ek', '—', '—', tn(sc.uplift), pcf(sc.uplift / T.hcmiT * 100)] });
    }
    if (sc.recCreditT > 0.0005) {
      rows.push({ cells: ['YEK-G / I-REC belgeleri (piyasa bazlı düşüm)', fx(sc.recAppliedKwh, 0) + ' kWh', '—', '—', '−' + tn(sc.recCreditT), '−' + pcf(sc.recCreditT / T.hcmiT * 100)] });
    }
    if (h.laundry.outsourced && R.result.laundry) {
      var lk = R.result.energy.laundryKwh;
      totK += isNum(lk) ? lk : 0;
      rows.push({ cells: ['Dış çamaşırhane (Kapsam 3)', R.result.laundry.tonnageT !== null ? fx(R.result.laundry.tonnageT, 1) + ' ton çamaşır' : 'Dolu odadan tahmin',
        fx(lk / 1000, 1, true), '—', tn(sc.s3Laundry), pcf(sc.s3Laundry / T.hcmiT * 100)] });
    }
    rows.push({ cls: 'total', cells: ['HCMI ayak izi toplamı', '', fx(totK / 1000, 1, true), '', tn(T.hcmiT), pcf(100)] });
    var tbl = table([{ t: 'Kaynak', w: '33%' }, { t: 'Yıllık miktar' }, { t: 'Enerji, MWh', num: 1 }, { t: 'Faktör, kg/kWh', num: 1 }, { t: 't ' + CO2E, num: 1 }, { t: 'Pay', num: 1 }], rows, { cls: 'ledger' });
    var ledgerNote = '<p class="note">Yerinde üretilen yenilenebilir enerji (GES) sıfır emisyonla sayılır; yenilenebilir elektrik payı ' + pcf(R.renewable.elecPct)
      + ', toplam enerjide ' + pcf(R.renewable.energyPct) + '. Dış çamaşırhane enerjisi HCMI ton başı katsayılarıyla hesaplanır.</p>';
    var first = chapter(c.n, 'Karbon ayak izi', take)
      + '<div class="blk"><h3>Kapsamlara göre</h3>' + scopeBar(parts) + '<p class="note">' + s2note + '</p></div>'
      + '<div class="blk"><h3>Kaynaklara göre</h3>' + sourceBars(src, scopeColor, 8) + '</div>';
    // 12 satıra kadar defter aynı sayfaya sığar; fazlası kendi sayfasına geçer
    if (rows.length <= 12) { return first + '<div class="blk"><h3>Enerji ve emisyon defteri</h3>' + tbl + ledgerNote + '</div>'; }
    return [first, chapter(c.n, 'Enerji ve emisyon defteri', '') + '<div class="blk">' + tbl + ledgerNote + '</div>'];
  }

  function benchmarkPage(c) {
    var s = c.s, h = s.hotel, R = c.R, b = R.bench, I = R.intensity, m = R.metrics, seg = b.segment || {};
    var after = R.scenario && R.scenario.any && R.scenario.valid ? R.scenario.afterCpor : null;
    var worse = [['waste', 'atıkta'], ['water', 'suda'], ['kwhm2', 'enerji yoğunluğunda'], ['co2m2', 'alan başına karbonda']].filter(function (k) {
      return b[k[0]] && isNum(b[k[0]].ratio) && b[k[0]].ratio > 1.05;
    });
    var ref = hasRef(b);
    var take = (ref ? 'Oda-gece başına karbonda kıyas notu ' + b.grade.letter + ': segment ortalamasının ' + diffText(b.ratio) + '.' : 'Oda-gece başına karbon için segment referansı yok.')
      + (worse.length ? ' ' + worse.map(function (k) { return k[1].charAt(0).toUpperCase() + k[1].slice(1); })[0] + ' ise ortalamanın ' + diffText(b[worse[0][0]].ratio) + '.' : '');
    var G = root.BENCH.grades, prev = 0;
    var grows = G.map(function (g) {
      var lo = prev * b.ref, hi = isFinite(g.max) ? g.max * b.ref : null;
      var rng2 = hi === null ? fx(lo, 1) + ' kg üzeri' : (prev === 0 ? fx(hi, 1) + ' kg ve altı' : fx(lo, 1) + ' – ' + fx(hi, 1) + ' kg');
      var ratioTxt = hi === null ? fx(prev, 2, true) + ' üzeri' : (prev === 0 ? fx(g.max, 2, true) + ' ve altı' : fx(prev, 2, true) + ' – ' + fx(g.max, 2, true));
      prev = g.max;
      var cur = g.letter === b.grade.letter;
      return { cls: cur ? 'cur' : '', cells: ['<span class="gl" style="background:' + COLORS.grade[g.letter][1] + ';color:' + COLORS.grade[g.letter][0] + '">' + g.letter + '</span>',
        rng2, ratioTxt, esc(g.label) + (cur ? ' <b>(bu tesis)</b>' : '')] };
    });
    var gt = table([{ t: 'Not', w: '10%' }, { t: 'Oda-gece başına aralık' }, { t: 'Referansa oran' }, { t: 'Anlamı' }], grows, { cls: 'grades' });
    var ix = [];
    function add(key, label, unit, mine, ref) { var x = b[key]; if (x && isNum(x.ratio)) { ix.push({ label: label, unit: unit, ratio: x.ratio, lowerIsBetter: true, mine: mine, ref: ref }); } }
    add('co2m2', 'Alan başına karbon', 'kg ' + CO2E + ' / m² / yıl', fx(I.co2m2, 1), fx(seg.co2m2, 1));
    add('kwhm2', 'Enerji yoğunluğu', 'kWh / m² / yıl', fx(I.kwhm2, 0), fx(seg.kwhm2, 0));
    add('water', 'Su tüketimi', 'litre / satılan oda-gece', fx(I.waterL, 0), fx(seg.water, 0));
    add('waste', 'Atık', 'kg / dolu oda', fx(I.wasteKg, 1), fx(seg.waste, 1));
    add('meet', 'Toplantı alanı', 'kg ' + CO2E + ' / m²·saat', fx(m.meetH, 4), fx(seg.meet, 4));
    return chapter(c.n, 'Kıyas: CHSB 2026 Türkiye', take)
      + (ref ? '<div class="blk"><h3>Oda-gece başına karbon, kg ' + CO2E + '</h3>' + cporScale(m.cpor, after, b.ref, false) + gt + '</div>' : '')
      + (ix.length ? '<div class="blk"><h3>Diğer yoğunluk göstergeleri</h3>' + indexRows(ix) + '</div>' : '')
      + '<div class="panel src"><p class="note">Kıyas grubu: ' + esc(star(seg.tr)) + (seg.n ? '; örneklem ' + esc(seg.n) : '') + '. Kaynak: Cornell Hotel Sustainability Benchmarking Index (CHSB) 2026, Türkiye ortalamaları. '
      + (seg.proxy ? esc(seg.proxy) + ' ' : '') + 'Kıyas notu tesisin oda-gece başına karbonunun segment ortalamasına oranıdır; düşük oran daha iyidir.</p></div>';
  }

  function reductionPage(c) {
    var s = c.s, h = s.hotel, R = c.R, T = R.totals, sn = R.scenario;
    var list = R.ranking.filter(function (r) { return r.id !== 'green'; }).slice().sort(function (a, b) { return b.reductionT - a.reductionT; });
    var green = R.ranking.filter(function (r) { return r.id === 'green'; })[0];
    var sel = list.filter(function (r) { return sn.applied.indexOf(r.id) >= 0; });
    var take = sn.any && sn.valid
      ? 'Seçilen ' + sel.length + ' önlem yılda ' + tn(sn.savedT) + ' t ' + CO2E + ' azaltım (' + pc(sn.savedT / T.hcmiT * 100, 0) + ') ve ' + fx(sn.netSavingsTl / 1e6, 2)
        + ' milyon TL net tasarruf sağlıyor; ' + fx(sn.capexTl / 1e6, 2) + ' milyon TL yatırım yaklaşık ' + fx(sn.paybackYears, 1) + ' yılda geri dönüyor.'
      : 'Henüz önlem seçilmedi. Aşağıdaki tablo her önlemin bu tesis için hesaplanan etkisini gösteriyor.';
    var kp = sn.any && sn.valid ? '<div class="kpis">'
      + kpi('Yıllık azaltım', tn(sn.savedT), 't ' + CO2E, pc(sn.savedT / T.hcmiT * 100, 0) + ' daha düşük ayak izi')
      + kpi('Önlemler sonrası', fx(sn.afterCpor, 1), 'kg / oda-gece', 'Kıyas notu ' + sn.afterGrade.letter + ' (bugün ' + R.bench.grade.letter + ')')
      + kpi('Yatırım', tl(sn.capexTl), 'TL', 'Seçilen ' + sel.length + ' önlem')
      + kpi('Yıllık net tasarruf', tl(sn.netSavingsTl), 'TL', 'Geri ödeme ' + fx(sn.paybackYears, 1) + ' yıl')
      + '</div>' : '';
    var max = list.reduce(function (a, r) { return Math.max(a, r.reductionT); }, 0) || 1;
    var rows = list.map(function (r) {
      var on = sn.applied.indexOf(r.id) >= 0;
      return { cls: on ? 'on' : '', cells: [esc(r.tr) + (on ? ' <span class="tag">Planda</span>' : ''),
        '<div class="mb"><span style="width:' + (r.reductionT / max * 100).toFixed(1) + '%;background:' + (on ? COLORS.ocean : COLORS.soft) + '"></span><em>' + tn(r.reductionT) + '</em></div>',
        tl(r.capexTl), tl(r.netSavingsTl), isNum(r.paybackYears) ? fx(r.paybackYears, 1, true) : '—'] };
    });
    var tbl = table([{ t: 'Önlem', w: '36%' }, { t: 'Azaltım, t ' + CO2E + ' / yıl', w: '27%' }, { t: 'Yatırım, TL', num: 1 }, { t: 'Net tasarruf, TL / yıl', num: 1 }, { t: 'Geri ödeme, yıl', num: 1 }], rows, { cls: 'measures' });
    var gnote = green ? '<div class="panel"><h3>Yenilenebilir elektrik belgesi (YEK-G / I-REC)</h3><p>Tüketilen şebeke elektriğinin tamamı için YEK-G veya I-REC alınırsa piyasa bazlı Kapsam 2, '
      + tn(green.reductionT) + ' t ' + CO2E + ' azalır; yıllık ek maliyet yaklaşık ' + tl(-green.netSavingsTl) + ' TL (' + fx(root.MEASURES.coef.green.premiumTlPerKwh, 2) + ' TL/kWh prim). '
      + 'Belge fiziksel tüketimi değiştirmez; HCMI bu azaltımı piyasa bazlı yöntemle tanır, konum bazlı değer raporda ayrıca kalır.</p></div>' : '';
    var pr = [];
    (h.energy || []).forEach(function (e) {
      if (!isNum(e.price)) { return; }
      var txt = lc(esc(NS.model.typeLabel(e.typeId)).split(' (')[0]) + ' ' + fx(e.price, 2) + ' TL/' + esc(NS.model.unitShort(e.unit));
      if (pr.indexOf(txt) < 0) { pr.push(txt); }
    });
    if (h.prices) {
      if (isNum(h.prices.waterTlPerM3)) { pr.push('su ' + fx(h.prices.waterTlPerM3, 2) + ' TL/m³'); }
      if (isNum(h.prices.laundryTlPerKg)) { pr.push('çamaşır ' + fx(h.prices.laundryTlPerKg, 2) + ' TL/kg'); }
    }
    return chapter(c.n, 'Azaltım planı', take) + kp
      + '<div class="blk"><h3>Önlemler ve bu tesisteki etkisi</h3>' + tbl
      + '<p class="note">Her satır, önlemin bu tesise tek başına uygulandığı durumdaki tahmini etkiyi gösterir (su ve atık kalemleri dahil). Önlemler birlikte uygulandığında birbirini etkiler; '
      + 'plan toplamı bu etkileşimle ve HCMI ayak izi üzerinden hesaplanır. '
      + 'Yatırım ve tasarruf katsayıları gösterge niteliğindedir; teklif aşamasında enerji etüdü ve tedarikçi verisiyle güncelleyin.'
      + (pr.length ? ' Kullanılan birim fiyatlar: ' + pr.join(', ') + '.' : '') + '</p></div>' + gnote;
  }

  function netZeroPage(c) {
    var s = c.s, h = s.hotel, R = c.R, P = R.path, T = R.totals;
    if (!P) { return ''; }
    var ev = P.evaluation || [], m30 = P.m2030, gaps = ev.filter(function (e) { return !e.met; });
    var later = gaps.filter(function (e) { return !m30 || e.year !== m30.year; });
    var take = (m30 ? 'Plan, NZMFH ' + m30.year + ' kilometre taşını ' + (m30.met ? 'karşılıyor' : 'karşılamıyor (açık ' + tn(m30.gapTco2e) + ' t)') + '. ' : '')
      + (later.length ? later.slice(0, 2).map(function (e) { return e.year + ' yılında ' + tn(e.gapTco2e) + ' t'; }).join(', ') + ' açık kalıyor; ek önlem ve yenilenebilir elektrik gerekecek.'
        : gaps.length ? 'Ek önlem ve yenilenebilir elektrik gerekecek.' : 'Tüm kilometre taşları planla karşılanıyor.');
    var legend = '<div class="legend"><span><i class="ln" style="border-color:' + COLORS.ocean + '"></i>Plan: seçilen önlemlerle bina enerjisi emisyonu</span>'
      + '<span><i class="ln dash"></i>NZMFH izin verilen üst sınır</span><span><i class="wash"></i>Açık</span></div>';
    var rows = ev.map(function (e) {
      var ok = e.passedTests.filter(function (t) { return t.ok; }).map(function (t) { return lc(t.label); });
      return { cells: [String(e.year), tn(e.targetTco2e), pc(e.reductionPct, 1), tn(e.planTco2e), e.met ? '—' : tn(e.gapTco2e),
        (e.met ? icon('good') + ' Karşılanıyor' + (ok.length ? ': ' + ok.join(', ') : '') : icon('warn') + ' Açık var')] };
    });
    var tbl = table([{ t: 'Yıl', w: '9%' }, { t: 'Üst sınır, t', num: 1 }, { t: 'Gereken azaltım', num: 1 }, { t: 'Plan, t', num: 1 }, { t: 'Açık, t', num: 1 }, { t: 'Durum', w: '34%' }], rows, { cls: 'nz' });
    var unsel = R.ranking.filter(function (r) { return r.id !== 'green' && R.scenario.applied.indexOf(r.id) < 0; }).sort(function (a, b) { return b.reductionT - a.reductionT; }).slice(0, 3);
    var excl = T.hcmiT - P.baseT;
    // NZMFH kilometre taşlarının yol gösterici ölçütleri
    var area = R.intensity && R.intensity.areaM2;
    var gp = (P.milestones || []).filter(function (x) { return x.kind !== 'baseline'; }).map(function (x) {
      var re = x.renewableElectricityPct || {};
      return { cells: [String(x.year), isNum(x.energyEffPct) ? pc(x.energyEffPct, 0) : '—', isNum(re.developing) ? pc(re.developing, 0) : '—', isNum(re.mature) ? pc(re.mature, 0) : '—',
        isNum(x.offsetCapKgPerM2) ? fx(x.offsetCapKgPerM2, 0) + ' kg/m²' + (isNum(x.offsetCapTco2e) ? ' <span class="mut">(' + tn(x.offsetCapTco2e) + ' t)</span>' : '') : '—'] };
    });
    var gpt = gp.length ? '<div class="blk"><h3>Kilometre taşlarının yol gösterici ölçütleri</h3>'
      + table([{ t: 'Yıl', w: '9%' }, { t: 'Enerji verimliliği (baz yıla göre)' }, { t: 'Yenilenebilir elektrik, gelişmekte olan pazar' }, { t: 'Yenilenebilir elektrik, olgun pazar' }, { t: 'Kapsam 1 dengeleme üst sınırı' }], gp, { cls: 'gp' })
      + '<p class="note">Tesisin bugünkü yenilenebilir elektrik payı ' + pcf(R.renewable.elecPct) + '. Dengeleme üst sınırı, kilometre taşı yılında kalan Kapsam 1 emisyonunun karbon kredisiyle karşılanabilecek en yüksek miktarıdır'
      + (isNum(area) ? ' (' + fx(area, 0) + ' m² ile)' : '') + '.</p></div>' : '';
    return chapter(c.n, 'Net sıfır yol haritası', take)
      + '<div class="blk">' + legend + pathwayChart(P) + '</div>'
      + '<div class="blk">' + tbl + '</div>' + gpt
      + '<div class="cols2 blk"><div><h3>Hesabın temeli</h3><p class="sm">Net Zero Methodology for Hotels (NZMFH, 2. baskı, 2023) Tablo 3, Kategori 1: binanın enerji kullanımından doğan emisyon, yani sabit yakıtlar ve satın alınan elektrik ve ısı. '
      + 'Baz yıl ' + P.baseYear + ': ' + tn(P.baseT) + ' t. Araç yakıtı, soğutucu gaz ve dış çamaşırhane (toplam ' + tn(excl) + ' t) NZMFH\'de ayrı kategorilerdir. '
      + 'Her kilometre taşında mutlak azaltım, yoğunluk azaltımı veya metrekare başına seviye eşiğinden en az birinin sağlanması gerekir.</p></div>'
      + '<div><h3>Açığı kapatmak için</h3><p class="sm">'
      + (unsel.length ? 'Planda olmayan önlemlerden en büyük ek potansiyel: ' + unsel.map(function (r) { return lc(r.tr) + ' (' + tn(r.reductionT) + ' t)'; }).join(', ') + '. '
        : 'Önerilen önlemlerin hepsi planda. ')
      + 'Şebeke elektriği için yenilenebilir elektrik tedariki (YEK-G, I-REC veya ikili anlaşma) uzun vadeli hedeflerin ana kaldıracıdır. Hedefleri yılda bir güncel verilerle yeniden hesaplayın.</p></div></div>';
  }

  // ------------------------------------------------------------------ karbon dışı göstergeler
  /** "Kaynaklar, tedarik ve çalışanlar" bölümü için yeterli veri var mı? (yoksa bölüm rapora girmez) */
  function peopleData(c) {
    var R = c.R, E = R.esg || {}, X = c.s.hotel.extras || {};
    return !!E.any || pos(X.waterM3) || pos(X.wasteLandfillT) || pos(X.wasteRecycledT);
  }

  function peoplePage(c) {
    var s = c.s, h = s.hotel, R = c.R, E = R.esg || {}, pg = E.perGuest || {}, I = R.intensity || {}, X = h.extras || {};
    var gn = E.guestNights, orn = pos(h.occupiedRooms) ? h.occupiedRooms : null;
    var ownKwh = pos(I.ownKwh) ? I.ownKwh : null, wasteT = E.wasteT;
    var perRoom = function (v) { return isNum(v) && orn ? v / orn : null; };
    // ana göstergeler: misafir gecelemesi başına; misafir gecelemesi yoksa satılan oda-gece başına
    var k = gn
      ? { co2: pg.co2Kg, kwh: pg.kwh, waterL: isNum(pg.waterM3) ? pg.waterM3 * 1000 : null, waste: pg.wasteKg, chem: pg.chemKg }
      : { co2: R.metrics.cpor, kwh: perRoom(ownKwh), waterL: I.waterL, waste: I.wasteKg, chem: E.chemPerRoomKg };
    var basis = gn ? 'misafir gecelemesi başına' : 'satılan oda-gece başına';
    var tiles = [];
    if (isNum(k.co2)) { tiles.push(kpi('Karbon', fx(k.co2, 1), 'kg ' + CO2E, gn ? 'Toplam ayak izi / misafir gecelemesi' : 'Konaklama payı (CPOR)')); }
    if (isNum(k.kwh)) { tiles.push(kpi('Enerji', fx(k.kwh, 1), 'kWh', 'Yıllık ' + fx(ownKwh / 1000, 0) + ' MWh')); }
    if (isNum(k.waterL)) { tiles.push(kpi('Su', fx(k.waterL, 0), 'litre', 'Yıllık ' + fx(X.waterM3, 0) + ' m³')); }
    if (isNum(k.waste)) { tiles.push(kpi('Atık', fx(k.waste, k.waste < 10 ? 2 : 1), 'kg', 'Yıllık ' + fx(wasteT, wasteT < 100 ? 1 : 0) + ' ton')); }
    if (isNum(k.chem)) { tiles.push(kpi('Kimyasal', fx(k.chem, 2), 'kg', 'Yıllık ' + fx(E.chemicalsKg, 0) + ' kg')); }
    var kp = tiles.length ? '<h3>Kaynak kullanımı, ' + basis + '</h3><div class="kpis five" style="grid-template-columns:repeat(' + tiles.length + ',1fr)">' + tiles.join('') + '</div>' : '';

    // halkalar: yenilenebilir elektrik, geri kazanılan atık, yerel satın alma, çalışan eğitimi
    var rings = [];
    if (R.renewable && isNum(R.renewable.elecPct)) {
      rings.push({ f: R.renewable.elecPct / 100, h: 'Yenilenebilir elektrik', t: 'Yerinde üretim (GES), ikili anlaşma ve YEK-G / I-REC belgeleriyle karşılanan elektrik payı.' });
    }
    if (isNum(E.recycleRate)) {
      rings.push({ f: E.recycleRate, h: 'Geri kazanılan atık', t: fx(wasteT, wasteT < 100 ? 1 : 0) + ' ton atığın ' + fx(X.wasteRecycledT || 0, (X.wasteRecycledT || 0) < 100 ? 1 : 0) + ' tonu geri dönüşüme ya da komposta ayrıldı.' });
    }
    if (isNum(E.localPct)) {
      rings.push({ f: E.localPct / 100, h: 'Yerel satın alma', t: tlShort(E.purchaseTotalTl) + ' satın almanın ' + tlShort(E.purchaseLocalTl) + ' kadarı tesisle aynı il ya da bölgedeki tedarikçilerden.' });
    }
    if (isNum(E.trainedPct)) {
      rings.push({ f: E.trainedPct / 100, h: 'Çevre eğitimi alan çalışan', t: 'Ortalama ' + fx(E.staff, 0) + ' çalışandan ' + fx(E.staffTrained, 0) + ' kişi enerji, su, atık ya da kimyasal kullanımı üzerine eğitim aldı.' });
    }
    var cols = rings.length === 4 ? 2 : rings.length;
    var rg = rings.length ? '<div class="blk"><h3>Oranlar</h3><div class="rings" style="grid-template-columns:repeat(' + cols + ',minmax(0,1fr))">' + rings.map(function (x) {
      return '<div class="rg">' + ring(x.f, x.h) + '<div><b>' + x.h + '</b><p class="sm mut">' + x.t + '</p></div></div>';
    }).join('') + '</div></div>' : '';

    // yıllık değerler ve yoğunluklar tablosu
    var rows = [];
    function row(name, year, room, guest) { rows.push({ cells: [name, year, room].concat(gn ? [guest] : []) }); }
    if (ownKwh) { row('Enerji (tesis içi)', fx(ownKwh / 1000, 0) + ' MWh', fx(perRoom(ownKwh), 1) + ' kWh', fx(pg.kwh, 1) + ' kWh'); }
    if (pos(X.waterM3)) { row('Su', fx(X.waterM3, 0) + ' m³', fx(I.waterL, 0) + ' litre', isNum(pg.waterM3) ? fx(pg.waterM3 * 1000, 0) + ' litre' : '—'); }
    if (isNum(wasteT)) { row('Atık (depolama ve geri dönüşüm)', fx(wasteT, wasteT < 100 ? 1 : 0) + ' ton', fx(I.wasteKg, 1) + ' kg', fx(pg.wasteKg, 2) + ' kg'); }
    if (isNum(E.chemicalsKg)) { row('Kimyasal', fx(E.chemicalsKg, 0) + ' kg', fx(E.chemPerRoomKg, 2) + ' kg', fx(pg.chemKg, 2) + ' kg'); }
    if (isNum(R.totals.hcmiT)) { row('Karbon (HCMI ayak izi)', tn(R.totals.hcmiT) + ' t ' + CO2E, fx(R.metrics.cpor, 1) + ' kg <span class="mut">konaklama payı</span>', fx(pg.co2Kg, 1) + ' kg'); }
    var head = [{ t: 'Gösterge', w: '34%' }, { t: 'Yıllık', num: 1 }, { t: 'Satılan oda-gece başına', num: 1 }].concat(gn ? [{ t: 'Misafir gecelemesi başına', num: 1 }] : []);
    var tbl = rows.length ? '<div class="blk"><h3>Yıllık değerler ve yoğunluklar</h3>' + table(head, rows, { cls: 'res' }) + '</div>' : '';

    // tedarik ve çalışanlar: oranı hesaplanamayan ama girilen değerler
    var extra = [];
    if (pos(E.purchaseTotalTl) && !isNum(E.localPct)) { extra.push('Yıllık toplam satın alma ' + tlShort(E.purchaseTotalTl) + '.'); }
    if (pos(E.staff) && !isNum(E.trainedPct)) { extra.push('Ortalama çalışan sayısı ' + fx(E.staff, 0) + '.'); }

    // başlık cümlesi
    var use = [];
    if (gn && isNum(pg.kwh)) { use.push(fx(pg.kwh, 1) + ' kWh enerji'); }
    if (gn && isNum(pg.waterM3)) { use.push(fx(pg.waterM3 * 1000, 0) + ' litre su'); }
    if (gn && isNum(pg.chemKg)) { use.push(fx(pg.chemKg, 2) + ' kg kimyasal'); }
    var take = '';
    if (use.length) {
      take = 'Misafir gecelemesi başına ' + (use.length > 1 ? use.slice(0, -1).join(', ') + ' ve ' + use[use.length - 1] : use[0]) + ' kullanıldı'
        + (isNum(pg.wasteKg) ? ', ' + fx(pg.wasteKg, pg.wasteKg < 10 ? 2 : 1) + ' kg atık oluştu.' : '.');
    } else if (!gn) {
      take = 'Misafir gecelemesi girilmediği için göstergeler satılan oda-gece başına verildi.';
    }
    var soc = [];
    if (isNum(E.localPct)) { soc.push('satın almanın ' + pc(E.localPct, 0) + ' kadarı yerel tedarikçilerden yapıldı'); }
    if (isNum(E.trainedPct)) { soc.push('çalışanların ' + pc(E.trainedPct, 0) + ' kadarı çevre eğitimi aldı'); }
    if (soc.length) { take += (take ? ' ' : '') + soc.join('; ').replace(/^./, function (ch) { return ch.toLocaleUpperCase('tr'); }) + '.'; }
    if (!take) { take = 'Tesisin kaynak kullanımı ve toplumla ilgili göstergeleri.'; }

    var note = '<p class="note">' + (gn ? 'Misafir gecelemesi başına göstergeler, otellerin sürdürülebilirlik raporlarındaki "kişi başı" değerlerdir'
        + (isNum(E.guestsPerRoom) ? ' (oda başına ortalama ' + fx(E.guestsPerRoom, 2) + ' misafir)' : '') + '. Misafir gecelemesi başına karbon, toplantı alanı payı dahil toplam ayak izinin '
        + 'misafir gecelemesine bölümüdür; oda-gece başına karbon yalnız konaklama payıdır. ' : 'Misafir gecelemesi girilirse kişi başı göstergeler de hesaplanır. ')
      + 'Su, atık, kimyasal, satın alma ve çalışan verileri tesisin kendi kayıtlarına dayanır ve karbon hesabına girmez; "yerel tedarikçi" tanımı tesise aittir. '
      + 'Segment kıyasları kıyas bölümündedir.' + (extra.length ? ' ' + extra.join(' ') : '') + '</p>';
    return chapter(c.n, 'Kaynaklar, tedarik ve çalışanlar', take) + '<div class="blk">' + kp + '</div>' + rg + tbl + note;
  }

  function compliancePage(c) {
    var s = c.s, h = s.hotel, R = c.R, o = R.offsets, ev = R.event, tx = R.taxonomy;
    var take = 'Türkiye Yeşil Taksonomisi hazırlık skoru ' + tx.score + '/100. '
      + (isNum(o.remainingT) && o.remainingT > 0 ? 'Planlanan önlemlerden sonra kalan ' + tn(o.remainingT) + ' t ' + CO2E + ' için dengeleme seçeneği ve raporun kullanım ilkeleri aşağıda.'
        : 'Raporun kullanım ilkeleri aşağıda.');
    var items = NS.model.TAXONOMY.map(function (t) {
      var on = !!(h.taxonomy && h.taxonomy[t.id]);
      return '<li>' + icon(on ? 'good' : 'todo') + '<span><b>' + esc(t.title) + '</b> <span class="mut">' + t.w + ' puan</span>'
        + (t.detail ? '<br><span class="mut sm">' + esc(noLe(t.detail)) + '</span>' : '') + '</span></li>';
    }).join('');
    var meter = '<div class="meter"><span style="width:' + Math.max(tx.score, 0.5) + '%"></span></div><div class="meter-l"><b>' + tx.score + '</b> / 100</div>';
    // Skor 100 iken hesap katmanı Commited'a yönlendiren bir cümle döndürür; raporu okuyan üçüncü kişiye uygun değil
    var recs = (tx.score >= 100 ? [] : (tx.recs || [])).slice(0, 3).map(function (r) { return '<li>' + esc(noLe(r)) + '</li>'; }).join('')
      || '<li>Kontrol listesindeki tüm maddeler işaretli. Belgelerin geçerlilik tarihlerini izleyin.</li>';
    var evb = ev && ev.valid ? '<div class="panel"><h3>Toplantı ve etkinlik müşterileri için örnek hesap</h3><p class="sm">'
      + fx(h.event.guests, 0) + ' katılımcı, ' + fx(h.event.nights, 0) + ' oda-gece konaklama ve ' + fx(h.event.m2, 0) + ' m² salonun ' + fx(h.event.hours, 0) + ' saat kullanımı: <b>'
      + fx(ev.totalKg / 1000, 1) + ' t ' + CO2E + '</b>, katılımcı başına ' + fx(ev.perPersonKg, 1) + ' kg. Konaklama ' + fx(ev.stayKg / 1000, 1) + ' t, toplantı alanı '
      + fx(ev.meetingKg / 1000, 2) + ' t. Bu değerler kurumsal müşterilerin etkinlik raporlarına doğrudan girebilir.</p></div>' : '';
    var off = isNum(o.remainingT) && o.remainingT > 0 ? '<div class="panel"><h3>Kalan emisyon ve dengeleme seçeneği</h3><p class="sm">Planlanan önlemlerden sonra kalan ' + tn(o.remainingT) + ' t ' + CO2E + ' için '
      + fx(o.verCount, 0) + ' adet doğrulanmış karbon kredisi (VER) yaklaşık ' + tl(o.costTl) + ' TL / yıl tutar' + (isNum(o.perRoomNightTl) ? '; oda-gece başına ' + fx(o.perRoomNightTl, 2) + ' TL' : '') + '. '
      + 'Dengeleme raporlanan brüt emisyonu azaltmaz; HCMI kuralı gereği krediler ayak izinden düşülmez. AB\'de 27 Eylül 2026\'dan beri dengelemeye dayanan "iklim nötr" türü tüketici iddiaları yasak (Direktif 2024/825). '
      + 'Dengeleme ancak iptal edilen kredi miktarı ve projesiyle, ayrı bir iklim katkısı olarak anlatılabilir.</p></div>' : '';
    var use = '<div class="panel"><h3>Bu raporun kullanımı (AB 2024/825)</h3><ul class="plain sm">'
      + '<li>Değerleri yöntemi (HCMI v2.0), yılı ve kapsamıyla birlikte aktarın; kıyaslarda kaynağı (CHSB 2026 Türkiye, segment) belirtin.</li>'
      + '<li>Rapor; "karbon nötr", "iklim dostu", "yeşil otel" gibi genel çevre iddialarına dayanak değildir.</li>'
      + '<li>Net sıfır patikası bir planlama aracıdır; hedefin kamuya duyurulması için uygulama planı ve bağımsız doğrulama gerekir.</li>'
      + '<li>Doğrulama durumu: ' + esc(NS.model.VERIFY[h.verify]) + '. Bağımsız doğrulama yapılmadıkça değerler reklam ve pazarlama iddiası olarak kullanılmamalıdır.</li></ul></div>';
    return chapter(c.n, 'Uyum, etkinlik ve dengeleme', take)
      + '<div class="cols-tx blk"><div><h3>Türkiye Yeşil Taksonomisi hazırlık</h3>' + meter + '<ul class="ticks tx">' + items + '</ul></div>'
      + '<div><h3>Önerilen ilk adımlar</h3><ol class="recs">' + recs + '</ol>'
      + '<p class="mut sm">Skor, Türkiye Yeşil Taksonomisi Yönetmeliği (Resmî Gazete 24.09.2026, Sayı 33380) ve konaklama için taslak teknik tarama kriterlerine dayanan bir hazırlık göstergesidir; hukuki uygunluk beyanı değildir.</p></div></div>'
      + evb + off + use;
  }

  function methodPage(c) {
    var s = c.s, h = s.hotel, R = c.R, H = root.HCMI, D = root.HCMI_DATA, M = NS.model, TR = root.TR_REFERENCE;
    var steps = [
      ['Veri', '12 aylık enerji, yakıt, soğutucu gaz, çamaşırhane, doluluk ve alan.'],
      ['Enerjiye çevirme', 'Miktarlar HCMI v2.0 katsayılarıyla kWh\'e çevrilir.'],
      ['Emisyon', 'kWh × faktör; soğutucu gaz kg × GWP; çamaşırhane ton başına enerji.'],
      ['Paylaştırma', 'Toplam, oda ve toplantı alanına metrekare oranıyla bölünür.'],
      ['Göstergeler', 'Oda-gece başına, toplantı m²·saat başına, alan ve enerji yoğunluğu.']
    ];
    var ol = '<ol class="steps">' + steps.map(function (x) { return '<li><b>' + x[0] + '.</b> ' + x[1] + '</li>'; }).join('') + '</ol>';
    function efRow(id) {
      var t = D.energyTypes.filter(function (x) { return x.id === id; })[0];
      var row = (h.energy || []).filter(function (e) { return e.typeId === id; })[0];
      if (!t || !row) { return null; }
      var d = H.defaultEf(h.country || 'Turkey', h.region || 'Turkey', t.name, []);
      if (d.value === null) { return null; }
      var unit = row.unit;
      return { cells: [esc(M.typeLabel(id).split(' (')[0]) + (/\(/.test(M.typeLabel(id)) ? ' <span class="mut">(' + esc(M.typeLabel(id).split(' (')[1].replace(/\)$/, '')) + ')</span>' : ''),
        fx(d.value * t.kwhPerUnit[unit], 3, true) + ' kg/' + esc(M.unitShort(unit)), fx(d.value, 4, true), 'HCMI v2.0'] };
    }
    var rows = [];
    if (R.grid) {
      rows.push({ cells: ['Şebeke elektriği', fx(R.grid.value, 3, true) + ' kg/kWh', fx(R.grid.value, 4, true), R.grid.origin === 'tr' ? 'ETKB ' + R.grid.basisYear + ', ' + (R.grid.connection === 'transmission' ? 'iletim' : 'dağıtım') + ' hattı' : 'HCMI v2.0 ülke tablosu'] });
    }
    (h.energy || []).forEach(function (e) { if (e.typeId !== 'grid' && e.typeId !== 'onsite_renew') { var r = efRow(e.typeId); if (r) { rows.push(r); } } });
    (R.result.refrigerants || []).forEach(function (r) { rows.push({ cells: ['Soğutucu gaz ' + esc(r.name), 'GWP ' + fx(r.gwp, 0), '—', 'HCMI v2.0 listesi'] }); });
    if (h.laundry.outsourced) {
      rows.push({ cells: ['Dış çamaşırhane', 'Ton başına ' + D.laundry.estimate.map(function (e) { return fx(e.perTonne, 0) + ' ' + (e.unit === 'L' ? 'L' : e.unit); }).join(' + '), '—', 'HCMI v2.0'] });
    }
    rows.push({ cells: ['Su temini ve atıksu', fx(root.MEASURES.extrasEf.waterKgPerM3, 2, true) + ' kg/m³', '—', 'DEFRA 2025'] });
    rows.push({ cells: ['Atık: depolama / geri dönüşüm', fx(root.MEASURES.extrasEf.landfillKgPerT, 0) + ' / ' + fx(root.MEASURES.extrasEf.recycleKgPerT, 0) + ' kg/ton', '—', 'DEFRA 2025'] });
    var tbl = table([{ t: 'Kalem', w: '40%' }, { t: 'Birim başına', num: 1 }, { t: 'kg ' + CO2E + ' / kWh', num: 1 }, { t: 'Kaynak', w: '30%' }], rows, { cls: 'factors' });
    var msgs = [].concat(R.messages.warnings || [], R.messages.info || []).map(function (x) { return '<li>' + esc(x.message) + '</li>'; }).join('');
    var gl = [
      ['HCMI', 'Hotel Carbon Measurement Initiative; otel konaklaması ve toplantıları için sektör ölçüm yöntemi (Sustainable Hospitality Alliance ve WTTC).'],
      ['Oda-gece başına karbon', 'Konaklama payına düşen emisyonun satılan oda-gece sayısına bölümü (İngilizce kısaltması CPOR).'],
      ['Kapsam 1, 2, 3', 'Doğrudan emisyon; satın alınan enerjiden dolaylı emisyon; değer zincirindeki diğer dolaylı emisyon.'],
      ['Konum ve piyasa bazlı', 'Kapsam 2\'nin şebeke ortalamasıyla ve satın alınan yenilenebilir elektrik belgeleri dikkate alınarak iki ayrı hesabı.'],
      ['YEK-G, I-REC', 'Elektriğin yenilenebilir kaynaktan üretildiğini gösteren yerli ve uluslararası belgeler.'],
      ['NZMFH', 'Net Zero Methodology for Hotels; otellerin net sıfır yol haritası için kilometre taşı yöntemi.'],
      ['CHSB', 'Cornell Hotel Sustainability Benchmarking Index; ülke ve segment bazlı otel kıyas verisi.'],
      ['VER', 'Doğrulanmış karbon kredisi; bir ton ' + CO2E + ' azaltımı veya uzaklaştırmayı temsil eder.']
    ];
    var top = chapter(c.n, 'Yöntem, veri ve kaynaklar', 'Hesaplar resmî HCMI v2.0 aracıyla aynı yöntemi izler; Türkiye elektriği için Enerji ve Tabii Kaynaklar Bakanlığı\'nın tüketim noktası emisyon faktörü kullanılır.')
      + '<div class="cols2 blk"><div><h3>Hesaplama adımları</h3>' + ol + '</div>'
      + '<div><h3>Veri kalitesi</h3><p class="sm">Veri tamlığı <b>' + R.completeness.score + ' / 100</b>. Doğrulama durumu: ' + esc(M.VERIFY[h.verify]) + '.</p>'
      + (msgs ? '<ul class="plain sm">' + msgs + '</ul>' : '')
      + '<p class="sm mut">Bu rapor tesisin bildirdiği verilerle hazırlanmış bir tarama hesabıdır. Doğrulanmış envanter için bağımsız doğrulama gerekir. '
      + 'Hesap motoru resmî Excel aracıyla 67 senaryoda karşılaştırılarak doğrulandı.</p></div></div>';
    var factors = '<div class="blk"><h3>Kullanılan emisyon faktörleri</h3>' + tbl + '</div>';
    var bottom = '<div class="blk"><h3>Terimler</h3><dl class="gloss">' + gl.map(function (g) { return '<div><dt>' + g[0] + '</dt><dd>' + g[1] + '</dd></div>'; }).join('') + '</dl></div>'
      + '<p class="note">Yöntem kaynakları: HCMI v2.0 (Sustainable Hospitality Alliance, Ekim 2022); GHG Protocol Kurumsal Standart ve Kapsam 2 Kılavuzu; Net Zero Methodology for Hotels 2. baskı (2023); '
      + 'CHSB 2026 (Cornell); ETKB Elektrik Tüketim Noktası Emisyon Faktörleri; DEFRA 2025 dönüşüm faktörleri.</p>';
    // 11 faktör satırına kadar her şey bir sayfaya sığar; fazlasında faktör tablosu kendi sayfasına geçer
    return rows.length <= 11 ? top + factors + bottom : [top + bottom, chapter(c.n, 'Kullanılan emisyon faktörleri', '') + '<div class="blk">' + tbl + '</div>'];
  }

  function declarationPage(c) {
    var s = c.s, h = s.hotel, R = c.R, m = R.metrics, sc = R.scopes, T = R.totals, I = R.intensity, M = NS.model;
    var grid = R.grid ? fx(R.grid.value, 3) + ' kg ' + CO2E + '/kWh (' + (R.grid.origin === 'tr' ? 'ETKB ' + R.grid.basisYear + ', ' + (R.grid.connection === 'transmission' ? 'iletim' : 'dağıtım') + ' hattı' : 'HCMI v2.0') + ')' : '—';
    var L = [
      ['Tesis', esc(h.name || '—') + (h.city ? ', ' + esc(h.city) : '')], ['Raporlama yılı', yearOf(h) || '—'],
      ['Oda / satılan oda-gece', fx(h.rooms, 0) + ' / ' + fx(h.occupiedRooms, 0)], ['Yöntem', 'HCMI v2.0, GHG Protocol Kurumsal Standart'],
      ['Şebeke elektriği faktörü', grid], ['Oda-gece başına karbon', fx(m.cpor, 1) + ' kg ' + CO2E],
      ['Toplantı alanı', fx(m.meetH, 4) + ' kg ' + CO2E + ' / m²·saat'], ['Kapsam 1', tn(sc.s1) + ' t ' + CO2E],
      ['Kapsam 2, konum bazlı', tn(sc.s2Location) + ' t ' + CO2E], ['Kapsam 2, piyasa bazlı', tn(sc.s2Market) + ' t ' + CO2E],
      ['Kapsam 3, dış çamaşırhane', tn(sc.s3Laundry) + ' t ' + CO2E], ['HCMI ayak izi toplamı', '<b>' + tn(T.hcmiT) + ' t ' + CO2E + '</b>'],
      ['Alan yoğunluğu', fx(I.co2m2, 1) + ' kg ' + CO2E + ' / m² / yıl'], ['Enerji yoğunluğu', fx(I.kwhm2, 0) + ' kWh / m² / yıl'],
      ['Yenilenebilir elektrik payı', pc(R.renewable.elecPct, 1)], ['Doğrulama durumu', esc(M.VERIFY[h.verify])]
    ];
    if (sc.uplift > 1e-9) { L.splice(8, 0, ['HCMI tahmini ek', tn(sc.uplift) + ' t ' + CO2E]); }
    var dl = '<dl class="decl">' + L.map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>'; }).join('') + '</dl>';
    var sign = '<div class="sign"><div><span>Ad soyad</span></div><div><span>Unvan</span></div><div><span>İmza ve kaşe</span></div><div><span>Tarih</span></div></div>';
    return chapter(c.n, 'Karbon ayak izi beyanı', 'Bu sayfa kurumsal müşterilere ve tur operatörlerine tek başına verilebilir.')
      + '<div class="panel decl-p">' + dl + '<p class="sm">Bu beyandaki değerler, tesisin bildirdiği verilerle HCMI v2.0 yöntemine göre hesaplanmıştır. Değerler karbon kredisi (dengeleme) '
      + 'düşülmeden önceki brüt emisyonu gösterir; HCMI kuralı gereği krediler brüt emisyondan düşülmez.</p></div>'
      + '<div class="blk"><h3>Tesis adına onay</h3>' + sign + '</div>';
  }

  /** Son sayfanın altındaki deniz bandı: kapakla aynı desen, rapor künyesi */
  function backBand(c) {
    var h = c.s.hotel, R = c.R, M = NS.model;
    return '<div class="back">' + isobathSvg((h.name || '') + '|' + (h.city || '') + '|' + yearOf(h) + '|arka', 210, 64, 1.1)
      + '<div class="back-in"><div><span class="wm">cOmmited</span><p>Bu rapor Commited Turizm Karbon Hesaplayıcısı ile oluşturulmuştur.<br>commitedevents.app</p></div>'
      + '<dl class="meta"><div><dt>Rapor no</dt><dd>' + esc(c.opts.reportId) + '</dd></div><div><dt>Oluşturma tarihi</dt><dd>' + dateTr(c.opts.generatedAt) + '</dd></div>'
      + '<div><dt>Uygulama</dt><dd>Turizm Karbon Hesaplayıcısı ' + esc(M.APP_VERSION) + '</dd></div><div><dt>HCMI motoru ve veri özeti</dt><dd>' + esc(R.result.engineVersion) + ', '
      + esc(String(R.result.dataSha256 || '').slice(0, 12)) + '</dd></div></dl></div></div>';
  }

  // ------------------------------------------------------------------ stil
  function css(fontCss) {
    return fontCss + '\n' + [
      '@page{size:A4;margin:0}',
      '*{box-sizing:border-box}',
      'html{-webkit-print-color-adjust:exact;print-color-adjust:exact}',
      'body{margin:0;font-family:"DM Sans","DM Sans Variable",system-ui,sans-serif;color:#0E2233;font-size:9.25pt;line-height:1.5;font-optical-sizing:auto;font-kerning:normal;text-rendering:geometricPrecision}',
      'sub{font-size:68%;line-height:0;vertical-align:-0.25em}',
      'b{font-weight:600}',
      '.page{width:210mm;height:297mm;position:relative;overflow:hidden;break-after:page;page-break-after:always;background:#fff}',
      '.page:last-child{break-after:auto;page-break-after:auto}',
      '@media screen{body{background:#C9D7E0;padding:8mm 0}.page{margin:0 auto 8mm;box-shadow:0 2px 12px rgba(5,48,77,.25)}}',
      '.run{position:absolute;top:9mm;left:17mm;right:17mm;display:flex;justify-content:space-between;font-size:7.5pt;color:#4A6578;padding-bottom:1.6mm;border-bottom:0.25mm solid #CFE0EA}',
      '.foot{position:absolute;bottom:8.5mm;left:17mm;right:17mm;display:flex;justify-content:space-between;font-size:7.5pt;color:#4A6578}',
      '.foot .pg{font-variant-numeric:tabular-nums}',
      '.body{position:absolute;top:19mm;left:17mm;right:17mm;bottom:15mm}',
      '.chap{display:flex;align-items:baseline;gap:0;margin:2.5mm 0 2.5mm}',
      '.chap-n{font-size:12pt;font-weight:600;color:#0B6FA0;width:9mm;flex:none}',
      'h2{font-size:21pt;line-height:1.12;font-weight:600;letter-spacing:-0.012em;margin:0}',
      '.take{font-size:12pt;line-height:1.42;font-weight:420;margin:0 0 6mm;padding-left:9mm;max-width:165mm;color:#0E2233}',
      '.take.nonum{padding-left:0}',
      'h3{font-size:10pt;font-weight:600;margin:0 0 2.2mm;letter-spacing:-0.003em}',
      'h4{font-size:8.5pt;font-weight:600;margin:0 0 1.5mm}',
      'p{margin:0 0 2mm}',
      '.blk{margin-bottom:6mm}',
      '.note{font-size:7.8pt;color:#4A6578;line-height:1.45;margin-top:2mm}',
      '.sm{font-size:8.2pt;line-height:1.45}',
      '.mut{color:#4A6578}',
      '.sw{display:inline-block;width:2.5mm;height:2.5mm;border-radius:0.6mm;margin-right:1.4mm;vertical-align:-0.15mm}',
      '.ic{width:3.3mm;height:3.3mm;flex:none;vertical-align:-0.6mm}',
      '.panel{background:#EBF5FA;border-radius:2.2mm;padding:3.6mm 4.5mm 2.4mm;margin-bottom:4.5mm}',
      '.panel h3{margin-bottom:1.5mm}',
      '.panel p{font-size:8.6pt}',
      '.cols2{display:grid;grid-template-columns:1fr 1fr;gap:8mm}',
      '.cols3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6mm}',
      // KPI satırı: kart değil, üstte kalın çizgi olan cetvel düzeni
      '.kpis{display:grid;grid-template-columns:repeat(4,1fr);border-top:0.6mm solid #0E2233;margin-bottom:6.5mm}',
      '.kpis.three{grid-template-columns:repeat(3,1fr)}',
      '.kpi{padding:2.6mm 3.5mm 0 0}',
      '.kpi+.kpi{border-left:0.25mm solid #CFE0EA;padding-left:3.5mm}',
      '.kpi .l{font-size:7.8pt;color:#4A6578}',
      '.kpi .v{font-size:20pt;font-weight:600;line-height:1.1;margin-top:1.2mm;letter-spacing:-0.015em;white-space:nowrap}',
      '.kpi .v small{font-size:8.2pt;font-weight:500;margin-left:1.2mm;letter-spacing:0;color:#0E2233}',
      '.kpi .s{font-size:7.8pt;color:#4A6578;margin-top:1mm;line-height:1.35}',
      // kapsam çubuğu
      '.sbar,.alloc-bar{display:flex;gap:0.55mm;height:5.2mm;margin:1mm 0 2.2mm}',
      '.sbar span,.alloc-bar span{display:block;height:100%}',
      '.sbar span:first-child,.alloc-bar span:first-child{border-radius:1mm 0 0 1mm}',
      '.sbar span:last-child,.alloc-bar span:last-child{border-radius:0 1mm 1mm 0}',
      '.slab,.alloc-lab{display:grid;grid-template-columns:repeat(3,1fr);gap:5mm;font-size:8.6pt}',
      '.alloc-lab{grid-template-columns:1fr 1fr}',
      // yatay çubuklar
      '.hbars{display:grid;gap:1.3mm}',
      '.hb-row{display:grid;grid-template-columns:64mm 1fr;align-items:center;font-size:8.4pt}',
      '.hb-l{padding-right:3mm;line-height:1.25}',
      '.hb-track{position:relative;height:4.4mm;display:flex;align-items:center}',
      '.hb-bar{display:block;height:3.2mm;border-radius:0 0.9mm 0.9mm 0}',
      '.hb-v{margin-left:1.8mm;white-space:nowrap;font-variant-numeric:tabular-nums}',
      // tablolar
      'table.t{width:100%;border-collapse:collapse;font-size:8.3pt;line-height:1.35}',
      'table.t th{text-align:left;font-weight:500;color:#4A6578;font-size:7.4pt;padding:1.3mm 1.8mm 1.3mm 0;border-bottom:0.35mm solid #0E2233;vertical-align:bottom}',
      'table.t td{padding:1.45mm 1.8mm 1.45mm 0;border-bottom:0.2mm solid #DCE9F0;vertical-align:middle}',
      'table.t .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}',
      'table.t th.num{text-align:right}',
      'table.t td:last-child,table.t th:last-child{padding-right:0}',
      'table.t tr.total td{border-top:0.35mm solid #0E2233;border-bottom:none;font-weight:600}',
      'table.grades td{padding-top:1.1mm;padding-bottom:1.1mm}',
      'table.factors td{padding-top:1.15mm;padding-bottom:1.15mm}',
      'table.gp td{padding-top:1.2mm;padding-bottom:1.2mm}',
      'table.grades tr.cur td{background:#F3F8FB}',
      '.gl{display:inline-grid;place-items:center;width:5.2mm;height:5.2mm;border-radius:50%;font-weight:700;font-size:8.4pt}',
      // ölçek ve grafik
      'svg.scale{display:block;margin:1mm 0 2.5mm}',
      'svg.chart{display:block;margin-top:1.5mm}',
      '.legend{display:flex;gap:6mm;font-size:7.8pt;color:#0E2233;align-items:center}',
      '.legend span{display:inline-flex;align-items:center;gap:1.6mm}',
      '.legend .ln{display:inline-block;width:7mm;border-top:0.7mm solid #0B6FA0}',
      '.legend .ln.dash{border-top:0.4mm dashed #4A6578}',
      '.legend .wash{display:inline-block;width:5mm;height:3mm;background:rgba(212,100,58,.18);border-radius:0.6mm}',
      // endeks satırları
      '.ix{display:grid;gap:0}',
      '.ix-head,.ix-row{display:grid;grid-template-columns:40mm 64mm 30mm 1fr;align-items:center;column-gap:3mm}',
      '.ix-head{font-size:7.2pt;color:#4A6578;padding-bottom:1.2mm;border-bottom:0.35mm solid #0E2233}',
      '.ix-scale{position:relative;height:3.2mm}',
      '.ix-scale i{position:absolute;top:0;font-style:normal;transform:translateX(-50%);white-space:nowrap}',
      '.ix-scale i:first-child{transform:none}.ix-scale i:last-child{transform:translateX(-100%)}',
      '.ix-row{padding:2mm 0;border-bottom:0.2mm solid #DCE9F0;font-size:8.4pt}',
      '.ix-l{line-height:1.25}',
      '.ix-track{position:relative;height:4.4mm}',
      '.ix-bar{position:absolute;left:0;top:0.6mm;height:3.2mm;background:#0B6FA0;border-radius:0 0.9mm 0.9mm 0}',
      '.ix-ref{position:absolute;left:50%;top:-0.8mm;bottom:-0.8mm;border-left:0.35mm solid #0E2233}',
      '.ix-v{position:absolute;top:0.2mm;margin-left:1.4mm;font-size:7.4pt;color:#4A6578;font-variant-numeric:tabular-nums}',
      '.ix-n{font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.ix-d{display:flex;align-items:center;gap:1.4mm;white-space:nowrap}',
      // listeler
      'ul.ticks{list-style:none;margin:0;padding:0;display:grid;gap:2mm}',
      'ul.ticks li{display:flex;gap:2.2mm;align-items:flex-start;font-size:8.8pt;line-height:1.42}',
      'ul.ticks li .ic{margin-top:0.55mm}',
      'ul.ticks.tx{gap:1.6mm;margin-top:3mm}',
      'ul.ticks.tx li{font-size:8.2pt}',
      '.bound ul{margin:0;padding-left:3.6mm;font-size:8.2pt;line-height:1.42}',
      '.bound li{margin-bottom:0.7mm}',
      '.bound h4{padding-bottom:1.2mm;border-bottom:0.35mm solid #0E2233;margin-bottom:2mm}',
      'ol.steps{margin:0;padding-left:4.6mm;font-size:8.3pt;line-height:1.42}',
      'ol.steps li{margin-bottom:1.1mm}',
      'ol.recs{margin:0 0 3mm;padding-left:4.6mm;font-size:8.4pt;line-height:1.42}',
      'ol.recs li{margin-bottom:1.6mm}',
      'ul.plain{margin:0 0 2mm;padding-left:3.6mm}',
      '.dq{display:flex;gap:2mm;align-items:flex-start}',
      '.dq .ic{margin-top:0.3mm}',
      // tanım listeleri
      'dl.facts{display:grid;grid-template-columns:1fr 1fr;column-gap:10mm;margin:0}',
      'dl.facts div{display:grid;grid-template-columns:44mm 1fr;padding:1.55mm 0;border-bottom:0.2mm solid #DCE9F0;font-size:8.6pt}',
      'dl.facts dt{color:#4A6578}dl.facts dd{margin:0;font-weight:500}',
      'dl.gloss{display:grid;grid-template-columns:1fr 1fr;column-gap:8mm;row-gap:1.5mm;margin:0;font-size:7.7pt;line-height:1.38}',
      'dl.gloss dt{font-weight:600}dl.gloss dd{margin:0;color:#29435A}',
      'dl.decl{display:grid;grid-template-columns:1fr 1fr;column-gap:9mm;margin:0 0 3mm}',
      'dl.decl div{display:grid;grid-template-columns:40mm 1fr;padding:1.35mm 0;border-bottom:0.2mm solid #CFE0EA;font-size:8.5pt}',
      'dl.decl dt{color:#4A6578}dl.decl dd{margin:0;font-weight:500}',
      '.decl-p{padding-top:4mm}',
      'dl.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:4mm;margin:6mm 0 0;font-size:7.8pt;border-top:0.25mm solid #CFE0EA;padding-top:3mm}',
      'dl.meta dt{color:#4A6578}dl.meta dd{margin:0}',
      '.sign{display:grid;grid-template-columns:1fr 1fr 1fr 0.7fr;gap:6mm;margin-top:4mm;margin-bottom:8mm}',
      '.sign div{border-bottom:0.3mm solid #0E2233;height:16mm;position:relative}',
      '.sign span{position:absolute;bottom:-5mm;font-size:7.6pt;color:#4A6578}',
      // ölçüm çubuğu ve etiket
      '.meter{height:3.6mm;background:#DCE9F0;border-radius:1.8mm;overflow:hidden;margin-top:1mm}',
      '.meter span{display:block;height:100%;background:#0B6FA0;border-radius:1.8mm}',
      '.meter-l{font-size:8.4pt;margin-top:1.2mm}.meter-l b{font-size:13pt}',
      '.cols-tx{display:grid;grid-template-columns:1.25fr 1fr;gap:8mm}',
      '.tag{display:inline-block;font-size:6.8pt;font-weight:600;color:#0B6FA0;background:#E2EFF6;border-radius:1mm;padding:0.15mm 1.3mm;margin-left:1mm;vertical-align:0.2mm}',
      'table.measures tr:not(.on) td:first-child{color:#29435A}',
      '.mb{display:flex;align-items:center;gap:1.6mm}',
      '.mb span{display:block;height:3mm;border-radius:0 0.8mm 0.8mm 0;min-width:0.6mm}',
      '.mb em{font-style:normal;font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.plan p{font-size:8.6pt}',
      // içindekiler
      '.toc{margin-top:7mm;border-top:0.6mm solid #0E2233;padding-top:3mm}',
      '.toc ol{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr 1fr;grid-auto-flow:column;column-gap:10mm}',
      '.toc li{display:flex;align-items:baseline;gap:3mm;padding:1.5mm 0;border-bottom:0.2mm solid #DCE9F0;font-size:8.8pt}',
      '.toc-n{color:#0B6FA0;font-weight:600;width:4mm}.toc-t{flex:1}.toc-p{color:#4A6578;font-variant-numeric:tabular-nums}',
      // küçük istatistik satırı
      '.mini{display:grid;grid-template-columns:repeat(4,1fr);gap:4mm;margin:0 0 3mm;font-size:8pt}',
      '.mini div{border-left:0.6mm solid #0B6FA0;padding-left:2.4mm}',
      '.mini span{display:block;color:#4A6578}.mini b{font-size:11pt}',
      'table.gp td,table.gp th{white-space:normal}',
      // son sayfa bandı
      '.back{position:absolute;left:0;right:0;bottom:0;height:64mm;background:linear-gradient(170deg,#064A73 0%,#042A47 60%,#03203A 100%);color:#F2F9FC;overflow:hidden}',
      '.back svg.iso{position:absolute;inset:0;width:210mm;height:64mm}',
      '.back-in{position:absolute;left:17mm;right:17mm;top:12mm;display:grid;grid-template-columns:1fr 1.5fr;gap:10mm}',
      '.back-in p{font-size:8.6pt;color:#DDEFF8;margin:2mm 0 0;line-height:1.5}',
      '.back dl.meta{grid-template-columns:1fr 1fr;margin:0;border-top:0.3mm solid rgba(255,255,255,.3);padding-top:2.5mm;row-gap:3mm}',
      '.back dl.meta dt{color:#8FD0EE}.back dl.meta dd{color:#FFFFFF;font-size:8.4pt}',
      '.page.last .foot{color:#BFE2F4}',
      // kapak
      '.cover{background:linear-gradient(165deg,#0A6E9F 0%,#064A73 34%,#042A47 70%,#03203A 100%);color:#F2F9FC}',
      '.cover svg.iso{position:absolute;inset:0;width:210mm;height:297mm}',
      '.cv-top{position:absolute;top:15mm;left:17mm;right:17mm;display:flex;justify-content:space-between;align-items:flex-start}',
      '.wm{display:block;font-size:18pt;font-weight:700;letter-spacing:-0.025em;line-height:1}',
      '.wm-s{display:block;font-size:7.8pt;color:#BFE2F4;margin-top:1.4mm}',
      '.cv-year{text-align:right;font-size:8.4pt;color:#BFE2F4;line-height:1.35}',
      '.cv-year strong{display:block;font-size:25pt;color:#FFFFFF;font-weight:600;line-height:1.08;letter-spacing:-0.015em;margin:0.6mm 0}',
      '.cv-sample{display:block;margin-top:2.4mm;border:0.3mm solid rgba(255,255,255,.55);border-radius:5mm;padding:0.6mm 2.6mm;font-size:7.2pt;color:#FFFFFF}',
      '.cv-title{position:absolute;left:17mm;right:17mm;top:84mm}',
      '.cv-title h1{font-size:44pt;line-height:1.02;font-weight:600;letter-spacing:-0.025em;margin:0;max-width:170mm;color:#FFFFFF}',
      '.cv-title h1.l{font-size:34pt;line-height:1.05}.cv-title h1.xl{font-size:26pt;line-height:1.1}',
      '.cv-sub{font-size:12.5pt;color:#DDEFF8;margin:4mm 0 0}',
      '.cv-fig{position:absolute;left:17mm;right:17mm;top:150mm}',
      '.cv-l{font-size:9.5pt;color:#8FD0EE}',
      '.cv-row{display:flex;align-items:flex-end;justify-content:space-between;gap:8mm;margin-top:1mm}',
      '.cv-num{font-size:66pt;font-weight:600;line-height:0.95;letter-spacing:-0.035em;color:#FFFFFF;white-space:nowrap}',
      '.cv-num span{font-size:14pt;font-weight:500;letter-spacing:0;margin-left:2.6mm;color:#DDEFF8}',
      '.cv-cmp{display:flex;gap:3.6mm;align-items:center;font-size:8.8pt;color:#DDEFF8;line-height:1.4;max-width:84mm;margin-bottom:1.5mm}',
      '.cv-cmp b{color:#FFFFFF}',
      '.cv-grade{width:14mm;height:14mm;border-radius:50%;background:#E8C547;color:#0E2233;display:grid;place-items:center;font-size:21pt;font-weight:700;flex:none}',
      '.cover svg.scale{margin-top:6mm}',
      '.cv-meta{position:absolute;left:17mm;right:17mm;bottom:21mm;display:grid;grid-template-columns:repeat(3,1fr);gap:4.2mm 8mm;margin:0;border-top:0.3mm solid rgba(255,255,255,.3);padding-top:4.5mm}',
      '.cv-meta dt{font-size:7.4pt;color:#8FD0EE}.cv-meta dd{margin:0.6mm 0 0;font-size:9pt;color:#FFFFFF}',
      '.cv-foot{position:absolute;left:17mm;right:17mm;bottom:10mm;font-size:7.4pt;color:#BFE2F4;display:flex;justify-content:space-between}',
      // otel logosu: kapakta ve özette beyaz zemin, sayfa başlıklarında küçük
      '.cv-logo,.op-logo{background:#FFFFFF;border-radius:2.4mm;display:flex;align-items:center;justify-content:center;box-shadow:0 1mm 4mm rgba(0,0,0,.18)}',
      '.cv-logo{height:22mm;min-width:30mm;max-width:66mm;padding:3mm 4.5mm}',
      '.cv-logo img{display:block;max-width:57mm;max-height:16mm;width:auto;height:auto;object-fit:contain}',
      '.op-logo{height:17mm;min-width:24mm;max-width:56mm;padding:2.4mm 3.6mm}',
      '.op-logo img{display:block;max-width:48mm;max-height:12mm;width:auto;height:auto;object-fit:contain}',
      '.run-l{display:flex;align-items:center;gap:2.2mm}',
      '.run-logo{display:block;height:4.6mm;max-width:24mm;width:auto;object-fit:contain}',
      // ikinci KPI satırı ve beşli KPI
      '.kpis.k2{border-top-width:0.3mm;margin-top:-2.5mm}',
      '.kpis.k2 .v,.kpis.five .v{font-size:15.5pt}',
      '.kpis.five .kpi{padding-right:2.4mm}.kpis.five .kpi+.kpi{padding-left:2.6mm}',
      // halkalar
      '.rings{display:grid;gap:5mm}',
      '.rg{display:flex;gap:3.5mm;align-items:center}',
      '.rg>div{min-width:0}',
      'svg.ring{width:21mm;height:21mm;flex:none;display:block}',
      '.rg b{display:block;font-size:8.8pt;margin:0.8mm 0 0.8mm}',
      '.rg p{margin:0;font-size:7.8pt;line-height:1.4}',
      'table.res td{padding-top:1.7mm;padding-bottom:1.7mm}',
      // tek sayfalık özet
      '.op-top{position:absolute;left:0;right:0;top:0;height:64mm;background:linear-gradient(165deg,#0A6E9F 0%,#064A73 40%,#042A47 80%,#03203A 100%);color:#F2F9FC;overflow:hidden}',
      '.op-top svg.iso{position:absolute;inset:0;width:210mm;height:64mm}',
      '.op-head{position:absolute;top:10mm;left:17mm;right:17mm;display:flex;justify-content:space-between;align-items:flex-start}',
      '.op .cv-year strong{font-size:22pt}',
      '.op-title{position:absolute;left:17mm;right:17mm;bottom:7mm}',
      '.op-title h1{font-size:28pt;line-height:1.05;font-weight:600;letter-spacing:-0.02em;margin:0;color:#FFFFFF}',
      '.op-title h1.l{font-size:24pt}.op-title h1.xl{font-size:19pt;line-height:1.12}',
      '.op-title p{font-size:10.5pt;color:#DDEFF8;margin:2mm 0 0}',
      '.op-body{position:absolute;top:70mm;left:17mm;right:17mm;bottom:15mm}',
      '.op .kpis{margin-bottom:5mm}.op .blk{margin-bottom:4.6mm}',
      '.op svg.scale{margin-bottom:1mm}',
      '.hbars.compact{gap:1mm}.hbars.compact .hb-row{grid-template-columns:33mm 1fr;font-size:7.9pt}',
      'dl.oprs{margin:0}',
      'dl.oprs div{display:grid;grid-template-columns:34mm 1fr;padding:1.25mm 0;border-bottom:0.2mm solid #DCE9F0;font-size:8.2pt;line-height:1.35}',
      'dl.oprs dt{color:#4A6578}dl.oprs dd{margin:0;font-weight:500}',
      '.op-p{margin-bottom:0;height:100%}.op-p p{font-size:8.3pt;line-height:1.45}',
      'dl.op-meta{display:grid;grid-template-columns:1fr 1.25fr 1fr 0.7fr;gap:2.4mm 6mm;margin:0;border-top:0.35mm solid #0E2233;padding-top:2.6mm;font-size:7.8pt}',
      'dl.op-meta dt{color:#4A6578}dl.op-meta dd{margin:0.3mm 0 0;font-weight:500}',
      // sayfa A4'e sığmazsa (uzun ad, çok önlem, tahmin notları, İngilizce metin): önce aralıklar, sonra yazı küçülür
      '.page.fit1 .blk{margin-bottom:3.6mm}.page.fit1 .take{margin-bottom:4mm}.page.fit1 .kpis{margin-bottom:4.5mm}.page.fit1 .panel{margin-bottom:3.2mm}.page.fit1 p{margin-bottom:1.4mm}.page.fit1 table.t td{padding-top:1mm;padding-bottom:1mm}',
      '.page.fit2 .body{font-size:8.6pt}.page.fit2 .take{font-size:11pt}.page.fit2 .sm,.page.fit2 .panel p,.page.fit2 .note{font-size:7.5pt}.page.fit2 table.t{font-size:7.8pt}.page.fit2 .hb-row{font-size:7.9pt}',
      '.page.fit3 .body{top:17.5mm;bottom:13.5mm;font-size:8.2pt}.page.fit3 .take{font-size:10.4pt}.page.fit3 .sm,.page.fit3 .panel p,.page.fit3 .note{font-size:7.1pt}.page.fit3 table.t{font-size:7.4pt}',
      '.op.fit1 .kpis{margin-bottom:3.4mm}.op.fit1 .blk{margin-bottom:3.2mm}.op.fit1 dl.oprs div{padding:0.8mm 0}.op.fit1 .hbars.compact{gap:0.5mm}.op.fit1 .note{margin-top:1.4mm}',
      '.op.fit2 .op-p p,.op.fit2 dl.oprs div{font-size:7.7pt;line-height:1.38}.op.fit2 .hbars.compact .hb-row{font-size:7.5pt}.op.fit2 .note,.op.fit2 dl.op-meta{font-size:7.2pt}.op.fit2 .op-body h3{font-size:9.4pt;margin-bottom:1.6mm}.op.fit2 .panel{padding-top:3mm;padding-bottom:1.8mm}',
      '.op.fit3 .op-body{top:67.5mm;bottom:13.5mm}.op.fit3 .kpi .v{font-size:17pt}.op.fit3 .kpi .s,.op.fit3 .kpi .l{font-size:7.2pt}.op.fit3 .op-p p,.op.fit3 dl.oprs div{font-size:7.3pt}.op.fit3 .note,.op.fit3 dl.op-meta{font-size:6.8pt}',
      // ekranda üst araç çubuğu (yazdırmada görünmez)
      '.tb{position:sticky;top:0;z-index:10;background:#05304D;color:#F2F9FC;font-size:10pt;line-height:1.45;margin:-8mm 0 8mm;padding:3mm 0;box-shadow:0 2px 10px rgba(3,32,58,.3)}',
      '.tb-in{max-width:210mm;margin:0 auto;display:flex;gap:6mm;align-items:center;justify-content:space-between;padding:0 4mm}',
      '.tb button{font:inherit;font-weight:600;background:#E8C547;color:#0E2233;border:0;border-radius:2mm;padding:2.4mm 5mm;cursor:pointer;white-space:nowrap}',
      '.tb button:hover{background:#F0D365}.tb button:focus-visible{outline:0.6mm solid #FFFFFF;outline-offset:0.6mm}',
      '@media print{.tb{display:none!important}body{padding:0!important;background:#fff!important}.page{margin:0!important;box-shadow:none!important}}'
    ].join('\n');
  }

  // Araç çubuğu (yalnız ekranda): "PDF olarak kaydet" tarayıcının yazdırma penceresini açar.
  function toolbar(summary) {
    return '<div class="tb" role="region" aria-label="Rapor araçları"><div class="tb-in"><div><b>' + (summary ? 'Özetiniz hazır.' : 'Raporunuz hazır.') + '</b> PDF olarak kaydetmek için düğmeye basın; '
      + 'açılan pencerede hedef olarak <b>PDF olarak kaydet</b> seçeneğini seçin.</div><button type="button" id="tb-print">PDF olarak kaydet</button></div></div>';
  }
  // Düğmenin betiği sayfaların SONUNA konur: yazı tipi dosyası geç gelse (ya da hiç gelmese) bile
  // rapor beklemeden görünür. Basmadan önce yazı tipi en çok 3 saniye beklenir, gelmezse yedek yazı tipiyle basılır.
  function toolbarScript() {
    return '<script>(function(){var b=document.getElementById("tb-print");if(!b){return;}'
      + 'function fonts(cb){var done=false,fin=function(){if(!done){done=true;cb();}};setTimeout(fin,3000);'
      + 'var l=document.getElementById("rfont");'
      + 'var after=function(){void document.body.offsetHeight;if(document.fonts&&document.fonts.ready){document.fonts.ready.then(fin,fin);}else{fin();}};'
      + 'if(!l||l.sheet){after();}else{l.addEventListener("load",after);l.addEventListener("error",fin);}}'
      + 'b.addEventListener("click",function(){b.disabled=true;fonts(function(){b.disabled=false;window.print();});});'
      + 'try{b.focus();}catch(e){}})();</script>';
  }

  /** Bir sayfanın içeriği A4'e sığmıyorsa (alt bilgiye ya da son sayfadaki banda taşıyorsa) o sayfaya .fit1 → .fit3
      sınıflarını sırayla ekler. Açılışta, yazı tipi yüklenince ve yazdırmadan önce çalışır; İngilizce ekranda
      çeviriden sonra app.js window.__fitPages()'i yeniden çağırır. */
  function fitScript() {
    return '<script>(function(){'
      + 'function over(pg,b){var lim=b.getBoundingClientRect().bottom,bk=pg.querySelector(".back"),m=0,k=b.children,j,r;'
      + 'if(bk){lim=Math.min(lim,bk.getBoundingClientRect().top);}'
      + 'for(j=0;j<k.length;j++){r=k[j].getBoundingClientRect();if(r.height>0&&r.bottom>m){m=r.bottom;}}return m>lim+0.1;}'
      + 'function fit(){var ps=document.querySelectorAll(".page"),n,i;for(n=0;n<ps.length;n++){var pg=ps[n],b=pg.querySelector(".op-body")||pg.querySelector(".body");if(!b){continue;}'
      + 'for(i=1;i<=3;i++){pg.classList.remove("fit"+i);}for(i=1;i<=3&&over(pg,b);i++){pg.classList.add("fit"+i);}}}'
      + 'window.__fitPages=fit;fit();window.addEventListener("load",fit);window.addEventListener("beforeprint",fit);'
      + 'if(document.fonts&&document.fonts.ready){document.fonts.ready.then(fit,function(){});}})();</script>';
  }

  /** Rapor oluşturulabilir mi? Düğme durumu ve açıklaması için. */
  function canBuild(s, R) {
    if (!R || !R.started) { return { ok: false, reason: 'Raporu oluşturmak için önce Adım 1\'deki tesis verilerini girin.' }; }
    if (!R.usable) { return { ok: false, reason: 'Hesap henüz tamamlanmadı: Adım 1\'deki "Veri kontrolü" listesindeki hataları düzeltin.' }; }
    if (!s || !s.hotel || !isNum(s.hotel.year)) { return { ok: false, reason: 'Rapor yılını girin (Adım 1, Tesis).' }; }
    if (!isNum(R.metrics && R.metrics.cpor)) { return { ok: false, reason: 'Satılan oda-gece sayısını girin (Adım 1).' }; }
    return { ok: true, reason: '' };
  }

  // media="print" + onload: yazı tipi stil dosyası sayfanın açılışını bekletmez (yavaş ağ, engelleyici eklenti).
  var GOOGLE_FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    + '<link id="rfont" rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300..800&display=swap" media="print" onload="this.media=\'all\'">';

  // ------------------------------------------------------------------ tek sayfalık özet
  /** Tur operatörleri ve kurumsal müşteriler için tek A4: ana göstergeler, kıyas, kaynaklar, plan. */
  function onePager(c) {
    var s = c.s, h = s.hotel, R = c.R, T = R.totals, m = R.metrics, b = R.bench, sc = R.scopes, E = R.esg || {}, pg = E.perGuest || {};
    var sn = R.scenario, P = R.path, I = R.intensity || {}, X = h.extras || {}, ref = hasRef(b), segN = SEG_NICE[h.segment] || 'segment';
    var sub = [h.city, isNum(h.rooms) ? fx(h.rooms, 0) + ' oda' : null, SEG_NICE[h.segment] || star(b.segment && b.segment.tr)].filter(Boolean).join(', ');
    var nl = String(h.name || '').length, hcls = nl > 40 ? ' class="xl"' : nl > 24 ? ' class="l"' : '';
    var after = sn && sn.any && sn.valid ? sn.afterCpor : null;
    var top = '<div class="op-top">' + isobathSvg((h.name || '') + '|' + (h.city || '') + '|' + yearOf(h) + '|ozet', 210, 64, 1)
      + '<div class="op-head">' + (c.logo ? logoPlate(c, 'op-logo') : '<div class="brand"><span class="wm">cOmmited</span><span class="wm-s">Turizm Karbon Hesaplayıcısı</span></div>')
      + '<div class="cv-year">Sürdürülebilirlik özeti<strong>' + yearOf(h) + '</strong>' + period(h)
      + (c.opts.sample ? '<span class="cv-sample">Örnek rapor: gerçek bir tesise ait değildir</span>' : '') + '</div></div>'
      + '<div class="op-title"><h1' + hcls + '>' + esc(h.name || 'Tesis') + '</h1><p>' + esc(sub) + '</p></div></div>';
    var ren = R.renewable && isNum(R.renewable.elecPct) ? R.renewable.elecPct : null;
    var kp = '<div class="kpis">'
      + kpi('HCMI karbon ayak izi', tn(T.hcmiT), 't ' + CO2E, 'Kapsam 1, 2, dış çamaşırhane')
      + kpi('Oda-gece başına', fx(m.cpor, 1), 'kg ' + CO2E, ref ? 'Not ' + b.grade.letter + ': ortalamanın ' + diffText(b.ratio) : 'Satılan oda-gece başına')
      + (isNum(pg.co2Kg) ? kpi('Kişi başı karbon', fx(pg.co2Kg, 1), 'kg ' + CO2E, 'Misafir gecelemesi başına')
        : kpi('Toplantı alanı', fx(m.meetH, 3), 'kg / m²·saat', 'Yılda 365 gün × 10 saat'))
      + kpi('Yenilenebilir elektrik', pc(ren, ren > 0 && ren < 10 ? 1 : 0), '', 'GES ve YEK-G / I-REC')
      + '</div>';
    var parts = [
      { name: 'Kapsam 1', t: sc.s1All, color: COLORS.s1, desc: 'Yakıtlar, araçlar, soğutucu gaz' },
      { name: 'Kapsam 2', t: sc.s2Market, color: COLORS.s2, desc: 'Satın alınan elektrik' },
      { name: 'Kapsam 3', t: sc.s3Laundry, color: COLORS.s3, desc: 'Dış çamaşırhane' }
    ].filter(function (p) { return p.t > 0.0005; });
    var scale = ref ? '<div class="blk"><h3>Oda-gece başına karbon kıyası, kg ' + CO2E + '</h3>' + cporScale(m.cpor, after, b.ref, false, true)
      + '<p class="note">Kaynak: CHSB 2026 Türkiye, ' + esc(segN) + ' ortalaması ' + fx(b.ref, 1) + ' kg. Kıyas notu ' + b.grade.letter + ': ' + esc(lc(b.grade.label)) + '.</p></div>' : '';
    var src = R.sources.filter(function (x) { return x.hcmi && x.t > 0.0005; });
    var scopeColor = function (x) { return x.scope === 1 ? COLORS.s1 : x.scope === 2 ? COLORS.s2 : COLORS.s3; };
    // kaynak kullanımı ve toplum
    var gn = E.guestNights, per = '', orn = pos(h.occupiedRooms) ? h.occupiedRooms : null;
    var L = [];
    var kwh = gn ? pg.kwh : (pos(I.ownKwh) && orn ? I.ownKwh / orn : null);
    if (isNum(kwh)) { L.push(['Enerji', fx(kwh, 1) + ' kWh' + per]); }
    var wl = gn ? (isNum(pg.waterM3) ? pg.waterM3 * 1000 : null) : I.waterL;
    if (isNum(wl)) { L.push(['Su', fx(wl, 0) + ' litre' + per]); }
    var wk = gn ? pg.wasteKg : I.wasteKg;
    if (isNum(wk)) { L.push(['Atık', fx(wk, wk < 10 ? 2 : 1) + ' kg' + (isNum(E.recycleRate) ? ' <span class="mut">(geri kazanım ' + pc(E.recycleRate * 100, 0) + ')</span>' : '')]); }
    var ck = gn ? pg.chemKg : E.chemPerRoomKg;
    if (isNum(ck)) { L.push(['Kimyasal', fx(ck, 2) + ' kg' + per]); }
    if (isNum(E.localPct)) { L.push(['Yerel satın alma', pc(E.localPct, 0) + ' <span class="mut">(' + tlShort(E.purchaseLocalTl) + ')</span>']); }
    if (isNum(E.trainedPct)) { L.push(['Çevre eğitimi', pc(E.trainedPct, 0) + ' <span class="mut">(' + fx(E.staffTrained, 0) + ' / ' + fx(E.staff, 0) + ' çalışan)</span>']); }
    var res = L.length ? '<div><h3>Kaynak kullanımı, ' + (gn ? 'misafir gecelemesi' : 'satılan oda-gece') + ' başına</h3><dl class="oprs">' + L.map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>'; }).join('') + '</dl></div>' : '';
    var srcBlk = '<div><h3>En büyük emisyon kaynakları</h3>' + sourceBars(src, scopeColor, 5, 50, 'compact') + '</div>';
    // plan ve net sıfır
    var plan;
    if (sn && sn.any && sn.valid) {
      var names = R.ranking.filter(function (r) { return sn.applied.indexOf(r.id) >= 0; }).map(function (r) { return lc(r.tr); });
      // tek sayfaya sığsın: en çok üç önlem adı (sıralama en büyük azaltımdan), gerisi sayıyla
      var shown = names.length > 4 ? names.slice(0, 3).join(', ') + ' ve ' + (names.length - 3) + ' önlem daha' : names.join(', ');
      plan = 'Seçilen ' + names.length + ' önlem: ' + shown + '. Yıllık azaltım <b>' + tn(sn.savedT) + ' t ' + CO2E + '</b> (' + pc(sn.savedT / T.hcmiT * 100, 0) + '); yatırım '
        + tlShort(sn.capexTl) + ', geri ödeme ' + fx(sn.paybackYears, 1) + ' yıl.';
    } else {
      var best = R.ranking.filter(function (r) { return r.id !== 'green' && isNum(r.reductionT) && r.reductionT > 0; }).sort(function (a2, b2) { return b2.reductionT - a2.reductionT; }).slice(0, 3);
      plan = 'Henüz önlem seçilmedi.' + (best.length ? ' En büyük azaltım potansiyeli: ' + best.map(function (r) { return lc(r.tr) + ' (' + tn(r.reductionT) + ' t)'; }).join(', ') + '.' : '');
    }
    var nz = P ? 'Bina enerjisi emisyonu, baz yıl ' + P.baseYear + ': ' + tn(P.baseT) + ' t.'
      + (P.m2030 ? ' ' + P.m2030.year + ' kilometre taşı (NZMFH 2. baskı): üst sınır ' + tn(P.m2030.targetTco2e) + ' t, plan ' + tn(P.m2030.planTco2e) + ' t; '
        + (P.m2030.met ? 'karşılanıyor.' : 'açık ' + tn(P.m2030.gapTco2e) + ' t.') : '')
      : 'Net sıfır patikası için rapor yılı ve bina enerjisi verisi gerekir.';
    var grid = R.grid ? (R.grid.origin === 'tr' ? 'ETKB ' + R.grid.basisYear + ', ' + fx(R.grid.value, 3) + ' kg/kWh' : 'HCMI v2.0 ülke tablosu') : '—';
    var meta = '<dl class="op-meta">'
      + '<div><dt>Yöntem</dt><dd>HCMI v2.0, GHG Protocol</dd></div>'
      + '<div><dt>Elektrik emisyon faktörü</dt><dd>' + grid + '</dd></div>'
      + '<div><dt>Bağımsız doğrulama</dt><dd>' + esc(NS.model.VERIFY[h.verify]) + '</dd></div>'
      + '<div><dt>Veri tamlığı</dt><dd>' + R.completeness.score + ' / 100</dd></div></dl>'
      + '<p class="note">Değerler karbon kredisi düşülmeden önceki brüt emisyondur (HCMI) ve "karbon nötr", "iklim dostu" gibi genel çevre iddialarına dayanak değildir (AB 2024/825). '
      + 'Net sıfır patikası bir planlama aracıdır. Su, atık, kimyasal, satın alma ve çalışan verileri tesis kayıtlarına dayanır.</p>';
    var body = kp
      + '<div class="blk"><h3>Kapsamlara göre dağılım</h3>' + scopeBar(parts) + '</div>'
      + scale
      + '<div class="cols2 blk">' + srcBlk + (res || '<div></div>') + '</div>'
      + '<div class="cols2 blk"><div class="panel op-p"><h3>Azaltım planı</h3><p>' + plan + '</p></div><div class="panel op-p"><h3>Net sıfır yol haritası</h3><p>' + nz + '</p></div></div>'
      + meta;
    return '<section class="page op">' + top + '<div class="op-body">' + body + '</div>'
      + '<footer class="foot"><span>Commited Turizm Karbon Hesaplayıcısı ile hazırlanmıştır · commitedevents.app</span><span>Rapor no ' + esc(c.opts.reportId) + ' · ' + dateTr(c.opts.generatedAt) + '</span></footer></section>';
  }

  function build(s, R, opts) {
    opts = opts || {};
    var can = canBuild(s, R);
    if (!can.ok) { throw new Error(can.reason); }
    var h = s.hotel;
    var gen = Object.prototype.toString.call(opts.generatedAt) === '[object Date]' ? opts.generatedAt : new Date();
    var rid = opts.reportId || ('CMT-' + (h.year || '') + '-' + (hashStr((h.name || '') + '|' + gen.toISOString().slice(0, 10)) >>> 0).toString(16).toUpperCase().slice(0, 6));
    var logo = NS.model && NS.model.logoOf ? NS.model.logoOf(h.logo) : null;
    var c = { s: s, R: R, logo: logo, opts: { generatedAt: gen, reportId: rid, sample: !!opts.sample } };
    var summary = opts.variant === 'summary';
    var title = (isNum(h.year) ? h.year + ' ' : '') + (summary ? 'Sürdürülebilirlik Özeti' : 'Sürdürülebilirlik Raporu');
    var pages;
    if (summary) {
      pages = onePager(c);
    } else {
      // Bölümler: verisi olmayan bölüm çıkar; numaralar ve içindekiler sayfa numaraları kendiliğinden (kapak 1, özet 2)
      var sections = [
        { title: 'Tesis ve raporlama sınırları', fn: profilePage },
        { title: 'Karbon ayak izi', fn: footprintPage },
        { title: 'Kıyas: CHSB 2026 Türkiye', fn: benchmarkPage },
        { title: 'Kaynaklar, tedarik ve çalışanlar', fn: peoplePage, skip: !peopleData(c) },
        { title: 'Azaltım planı', fn: reductionPage },
        { title: 'Net sıfır yol haritası', fn: netZeroPage, skip: !R.path },
        { title: 'Uyum, etkinlik ve dengeleme', fn: compliancePage },
        { title: 'Yöntem, veri ve kaynaklar', fn: methodPage },
        { title: 'Karbon ayak izi beyanı', fn: declarationPage }
      ].filter(function (x) { return !x.skip; });
      sections.forEach(function (x, i) { x.num = String(i + 1); });
      // Bölümler bir veya birkaç sayfa döndürebilir; içindekiler her bölümün ilk sayfasını gösterir.
      var bySection = sections.map(function (x) { c.n = x.num; var r = x.fn(c); return (Array.isArray(r) ? r : [r]).filter(Boolean); });
      var next = 3;
      c.toc = sections.map(function (x, i) { var t = { num: x.num, title: x.title, page: next }; next += bySection[i].length; return t; });
      var bodies = [summaryPage(c)];
      bySection.forEach(function (arr) { bodies = bodies.concat(arr); });
      var total = bodies.length + 1;
      var runLogo = logo ? '<img class="run-logo" src="' + esc(logo) + '" alt="">' : '';
      pages = cover(c) + bodies.map(function (b, i) {
        var last = i === bodies.length - 1;
        return '<section class="page' + (last ? ' last' : '') + '"><header class="run"><span class="run-l">' + runLogo + esc(h.name || 'Tesis') + '</span><span>' + title + '</span></header><div class="body">' + b + '</div>'
          + (last ? backBand(c) : '')
          + '<footer class="foot"><span>Commited Turizm Karbon Hesaplayıcısı ile hazırlanmıştır</span><span class="pg">' + (i + 2) + ' / ' + total + '</span></footer></section>';
      }).join('');
    }
    // Ekranda telefonda da tüm sayfa genişliği görünsün (A4 = 794 px)
    return '<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=860">'
      + '<title>' + esc((h.name || 'Tesis') + ' - ' + title) + '</title>'
      + (opts.fontCss ? '' : GOOGLE_FONTS) + '<style>' + css(opts.fontCss || '') + '</style></head><body>'
      + (opts.toolbar ? toolbar(summary) : '') + pages + fitScript() + (opts.toolbar ? toolbarScript() : '') + '</body></html>';
  }

  NS.report = { version: '1.1.0', build: build, canBuild: canBuild, _isobaths: isobaths };
})(typeof globalThis !== 'undefined' ? globalThis : self);
