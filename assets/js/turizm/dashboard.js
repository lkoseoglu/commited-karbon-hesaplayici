/* =========================================================================
   Turizm hesaplayıcısı — OTEL PANELİ: VERİ KATMANI  (assets/js/turizm/dashboard.js)
   -------------------------------------------------------------------------
   Panelin (Adım şeridindeki "Panel") gösterdiği her sayı burada hazırlanır.
   DOM'a dokunmaz; Node testleri doğrudan çalıştırır. Çizim: dashboard-view.js.

   model(state, R, hist, opts) → panel görünüm modeli
     R    = TURIZM.compute(state)  (o anki yıl, ekranda düzenlenen veri)
     hist = history(...) çıktısı   (önceki yıllar; boş dizi olabilir)
     opts = { sample: bool }       (örnek otel: geçmiş "örnek" diye etiketlenir)
   history(records, state, opts) → önceki yılların özetleri. Hesaba kayıtlı her
     kayıt (inputs) BUGÜNKÜ yöntemle yeniden hesaplanır; böylece yıllar aynı
     faktörler ve aynı HCMI motoruyla karşılaştırılır. Aynı tesisin (ad eşleşmesi)
     her yıl için en son kaydı alınır; ekrandaki yıl geçmişe girmez.
   sampleRecords(state) → yalnız örnek otel için 3 yıllık ÖRNEK geçmiş (gerçek değil).
   Dışa: globalThis.TURIZM.dashboard
   ========================================================================= */
(function (root) {
  'use strict';

  var NS = root.TURIZM = root.TURIZM || {};

  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function pos(x) { return isNum(x) && x > 0; }
  function f(x, d) { return root.NUM.format(x, d === undefined ? 1 : d); }

  /**
   * Panelde yıllara göre izlenen göstergeler.
   * better: 'down' = azalması iyi, 'up' = artması iyi. digits: ekranda ondalık.
   */
  var METRICS = [
    { id: 'total', label: 'Toplam ayak izi', short: 'Toplam', unit: 't CO₂e', digits: 1, better: 'down',
      sub: 'Kapsam 1, 2 ve dış çamaşırhane' },
    { id: 'cpor', label: 'Oda-gece başına', short: 'Oda-gece', unit: 'kg CO₂e', digits: 1, better: 'down',
      sub: 'Satılan oda-gece başına (HCMI)' },
    { id: 'perGuest', label: 'Kişi başı', short: 'Kişi başı', unit: 'kg CO₂e', digits: 1, better: 'down',
      sub: 'Misafir gecelemesi başına' },
    { id: 'meet', label: 'Toplantı alanı', short: 'Toplantı', unit: 'kg CO₂e / m²·saat', digits: 3, better: 'down',
      sub: 'Yılda 365 gün × 10 saat (HCMI)' },
    { id: 'co2m2', label: 'Alan başına karbon', short: 'Karbon / m²', unit: 'kg CO₂e / m²', digits: 1, better: 'down',
      sub: 'Yıllık, iklimlendirilen alan' },
    { id: 'kwhm2', label: 'Enerji yoğunluğu', short: 'Enerji / m²', unit: 'kWh / m²', digits: 0, better: 'down',
      sub: 'Tesis içi enerji, yıllık' },
    { id: 'water', label: 'Su', short: 'Su', unit: 'litre / oda-gece', digits: 0, better: 'down',
      sub: 'Satılan oda-gece başına' },
    { id: 'waste', label: 'Atık', short: 'Atık', unit: 'kg / dolu oda', digits: 1, better: 'down',
      sub: 'Depolama ve geri dönüşüm' },
    { id: 'renew', label: 'Yenilenebilir elektrik', short: 'Yenilenebilir', unit: '%', digits: 1, better: 'up',
      sub: 'GES ve YEK-G / I-REC payı' }
  ];
  var BY_ID = {};
  METRICS.forEach(function (m) { BY_ID[m.id] = m; });

  /** Yıllar sekmesinde seçilebilen göstergeler (sırasıyla) */
  var TREND_IDS = ['total', 'cpor', 'perGuest', 'kwhm2', 'water'];
  /** Gösterge kartları (üst şerit); CPOR ana kartta durduğu için burada yok */
  var TILE_IDS = ['total', 'meet', 'co2m2', 'kwhm2', 'water', 'waste'];
  /** Kartlardaki segment kıyası: R.bench içindeki alan */
  var BENCH_KEY = { co2m2: 'co2m2', kwhm2: 'kwhm2', water: 'water', waste: 'waste', meet: 'meet' };

  // ------------------------------------------------------------------ bir yılın özeti
  function snapshot(s, R) {
    var h = s.hotel, ok = !!(R && R.usable && R.started);
    var E = (R && R.esg) || {}, pg = E.perGuest || {}, I = (R && R.intensity) || {};
    return {
      year: isNum(h.year) ? h.year : null,
      ok: ok,
      total: ok ? R.totals.hcmiT : null,
      cpor: ok ? R.metrics.cpor : null,
      perGuest: ok && isNum(pg.co2Kg) ? pg.co2Kg : null,
      meet: ok ? R.metrics.meetH : null,
      co2m2: ok ? I.co2m2 : null,
      kwhm2: ok ? I.kwhm2 : null,
      water: ok ? I.waterL : null,
      waste: ok ? I.wasteKg : null,
      renew: ok ? R.renewable.elecPct : null,
      building: ok ? R.totals.buildingT : null,
      grade: ok && R.bench.grade && R.bench.grade.letter !== '—' ? R.bench.grade.letter : null
    };
  }

  // ------------------------------------------------------------------ geçmiş yıllar
  function nameKey(x) { return String(x || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr'); }

  /**
   * records: [{ id, year, company, createdAt (ms), inputs }]  (cloud.js "Kayıtlarım" ile aynı kayıtlar)
   * Aynı tesis: ad eşleşmesi (büyük/küçük harf ve boşluk duyarsız). Ekrandaki tesisin adı boşsa tümü.
   */
  function history(records, cur, opts) {
    var M = NS.model, byYear = {}, out = [];
    var ch = cur && cur.hotel ? cur.hotel : {};
    var curKey = nameKey(ch.name), curYear = isNum(ch.year) ? ch.year : null;
    (records || []).forEach(function (r) {
      if (!r || !r.inputs || typeof r.inputs !== 'object') { return; }
      var st;
      try { st = M.load(r.inputs).state; } catch (e) { return; }
      var y = isNum(st.hotel.year) ? st.hotel.year : (isNum(r.year) ? r.year : null);
      if (!isNum(y) || y === curYear) { return; }
      var key = nameKey(st.hotel.name || r.company);
      if (curKey && key && key !== curKey) { return; }
      var t = isNum(r.createdAt) ? r.createdAt : 0;
      if (byYear[y] && byYear[y].t >= t) { return; }
      byYear[y] = { t: t, st: st, id: r.id || null };
    });
    Object.keys(byYear).forEach(function (y) {
      var e = byYear[y], R;
      try { R = NS.compute(e.st); } catch (err) { return; }
      var snap = snapshot(e.st, R);
      if (!snap.ok || !(snap.total > 0)) { return; }     // hesap tamamlanmamış ya da boş kayıt
      snap.id = e.id; snap.sample = !!(opts && opts.sample);
      out.push(snap);
    });
    out.sort(function (a, b) { return a.year - b.year; });
    return out;
  }

  /**
   * Örnek otel için ÖRNEK geçmiş: aynı tesisin üç önceki yılı, daha yüksek tüketim, daha az GES,
   * önlem yok. Ekranda "örnek" diye etiketlenir; gerçek bir tesisin verisi değildir.
   */
  var SAMPLE_STEPS = [
    { dy: -3, energy: 1.18, onsite: 0, occ: 0.92, water: 1.14, waste: 1.10 },
    { dy: -2, energy: 1.11, onsite: 0.45, occ: 0.97, water: 1.08, waste: 1.06 },
    { dy: -1, energy: 1.05, onsite: 0.8, occ: 0.99, water: 1.04, waste: 1.02 }
  ];
  function sampleRecords(s) {
    var M = NS.model, y = isNum(s.hotel.year) ? s.hotel.year : 2025;
    return SAMPLE_STEPS.map(function (k, i) {
      var st = M.clone(s), h = st.hotel;
      h.year = y + k.dy;
      h.measures = [];
      h.energy.forEach(function (r) {
        if (!isNum(r.total)) { return; }
        r.total = r.typeId === 'onsite_renew' ? r.total * k.onsite : r.total * k.energy;
      });
      if (isNum(h.occupiedRooms)) { h.occupiedRooms = Math.round(h.occupiedRooms * k.occ); }
      if (isNum(h.guestNights)) { h.guestNights = Math.round(h.guestNights * k.occ); }
      if (isNum(h.extras.waterM3)) { h.extras.waterM3 = Math.round(h.extras.waterM3 * k.water); }
      if (isNum(h.extras.wasteLandfillT)) { h.extras.wasteLandfillT = Math.round(h.extras.wasteLandfillT * k.waste); }
      return { id: 'ornek-' + h.year, year: h.year, company: h.name, createdAt: i + 1, inputs: st };
    });
  }

  // ------------------------------------------------------------------ Türkçe ek (yıllar)
  /**
   * Yılın okunuşuna göre ek: 2024'e, 2022'ye, 2030'a; 2025'te, 2030'da; 2022'den, 2023'ten.
   * Son okunan sözcük: birler basamağı, birler 0 ise onlar, ikisi de 0 ise yüz / bin.
   */
  var UNITS = [null, ['r', 0], ['V', 0], ['h', 0], ['h', 0], ['h', 0], ['V', 1], ['V', 0], ['z', 0], ['z', 1]];   // bir, iki, üç, dört, beş, altı, yedi, sekiz, dokuz
  var TENS = [null, ['n', 1], ['V', 0], ['z', 1], ['h', 1], ['V', 0], ['h', 1], ['h', 0], ['n', 0], ['n', 1]];   // on, yirmi, otuz, kırk, elli, altmış, yetmiş, seksen, doksan
  function lastWord(n) {
    n = Math.abs(Math.round(n));
    if (n % 10) { return UNITS[n % 10]; }
    if (n % 100) { return TENS[(n % 100) / 10]; }
    if (n % 1000) { return ['z', 0]; }                     // yüz
    return n === 0 ? ['r', 1] : ['n', 0];                  // sıfır / bin
  }
  /** kind: 'dat' (-e/-a), 'loc' (-de/-da), 'abl' (-den/-dan) — 'V' ünlüyle, 'h' sert ünsüzle biter; ikinci öğe 1 = kalın ünlü */
  function sfx(n, kind) {
    var w = lastWord(n), back = w[1] === 1, vowel = w[0] === 'V', hard = w[0] === 'h';
    var e = back ? 'a' : 'e';
    if (kind === 'loc') { return String(n) + '\'' + (hard ? 't' : 'd') + e; }
    if (kind === 'abl') { return String(n) + '\'' + (hard ? 't' : 'd') + e + 'n'; }
    return String(n) + '\'' + (vowel ? 'y' : '') + e;
  }

  // ------------------------------------------------------------------ değişim metni
  /**
   * prev → cur değişimi. better: true = iyileşme, false = kötüleşme, null = değişmedi / bilinmiyor.
   * text  : "2024'e göre %5,2 daha az"     (önceki yılla kıyas, kartlarda)
   * since : "2022'den bu yana %15 azaldı"   (ilk yılla kıyas, yıllar grafiğinde)
   * Yüzde göstergelerinde (yenilenebilir) fark puan olarak verilir.
   */
  function delta(metricId, prev, cur, prevYear) {
    var m = BY_ID[metricId];
    if (!m || !isNum(prev) || !isNum(cur)) { return null; }
    var hasY = isNum(prevYear);
    var vs = hasY ? sfx(prevYear, 'dat') + ' göre ' : 'Önceki yıla göre ', from = hasY ? sfx(prevYear, 'abl') + ' bu yana ' : 'Önceki yıldan bu yana ';
    if (m.unit === '%') {
      var dp = cur - prev;
      if (Math.abs(dp) < 0.05) { return { pct: 0, pts: 0, better: null, dir: 'same', text: vs + 'değişmedi', since: from + 'değişmedi' }; }
      var amt = f(Math.abs(dp), 1) + ' puan ' + (dp > 0 ? 'arttı' : 'azaldı');
      return { pct: null, pts: dp, better: m.better === 'up' ? dp > 0 : dp < 0, dir: dp > 0 ? 'up' : 'down', text: vs + amt, since: from + amt };
    }
    if (!(prev > 0)) { return null; }
    var p = (cur - prev) / prev * 100;
    if (Math.abs(p) < 0.5) { return { pct: 0, better: null, dir: 'same', text: vs + 'değişmedi', since: from + 'değişmedi' }; }
    var down = p < 0, pc = '%' + f(Math.abs(p), Math.abs(p) < 10 ? 1 : 0);
    return { pct: p, better: m.better === 'down' ? down : !down, dir: down ? 'down' : 'up',
             text: vs + pc + (down ? ' daha az' : ' daha fazla'), since: from + pc + (down ? ' azaldı' : ' arttı') };
  }

  // ------------------------------------------------------------------ en büyük kaynak ve kaldıraç
  var HEAT_IDS = { natural_gas: 1, lng: 1, lpg: 1, fuel_oil_1: 1, fuel_oil_2: 1, fuel_oil_4: 1, fuel_oil_5: 1, fuel_oil_6: 1, kerosene: 1 };
  var MOBILE_IDS = { diesel_mob: 1, gasoline_mob: 1, gasoline_bio: 1 };
  /** Kaynağı azaltan önlemler (measures.js katsayılarıyla aynı mantık) */
  function leversFor(srcId) {
    if (srcId === 'grid') { return ['pv', 'bms', 'keycard', 'led', 'hr', 'green']; }
    if (HEAT_IDS[srcId]) { return ['st', 'hr', 'bms', 'hp', 'water']; }
    if (MOBILE_IDS[srcId]) { return ['ev']; }
    if (srcId === 'laundry') { return ['linen']; }
    if (srcId === 'waste') { return ['waste']; }
    if (srcId === 'water') { return ['water', 'linen']; }
    if (/^rf/.test(srcId) || srcId === 'uplift') { return ['refrig']; }
    return [];
  }
  function lever(R) {
    var src = (R.sources || []).filter(function (x) { return x.hcmi && x.t > 0; });
    if (!src.length) { return null; }
    var tot = src.reduce(function (a, x) { return a + x.t; }, 0), top = src[0];
    var ids = leversFor(top.id), byId = {};
    (R.ranking || []).forEach(function (r) { byId[r.id] = r; });
    var cands = ids.map(function (id) { return byId[id]; }).filter(function (r) { return r && r.applied !== false && pos(r.reductionT); });
    var open = cands.filter(function (r) { return !r.selected; });
    open.sort(function (a, b) { return (a.id === 'green') - (b.id === 'green') || b.reductionT - a.reductionT; });   // YEK-G verimlilikten sonra
    return {
      source: { id: top.id, label: top.label, t: top.t, share: tot > 0 ? top.t / tot : null },
      measure: open[0] || null,
      planned: cands.filter(function (r) { return r.selected; }).map(function (r) { return r.tr; })
    };
  }

  // ------------------------------------------------------------------ sıradaki adımlar
  /**
   * Plana eklenmemiş, uygulanabilir önlemler: en çok azaltandan başlayarak n tane.
   * YEK-G / I-REC verimlilik önlemlerinin yerine geçmesin diye en sona konur (measures.js notu).
   */
  function nextSteps(R, n) {
    var list = (R.ranking || []).filter(function (r) { return !r.selected && r.applied !== false && pos(r.reductionT); });
    var main = list.filter(function (r) { return r.id !== 'green'; }).sort(function (a, b) { return b.reductionT - a.reductionT; });
    var out = main.slice(0, n || 3);
    var green = list.filter(function (r) { return r.id === 'green'; })[0];
    if (green) { out.push(green); }
    return out.map(function (r) {
      var pays = isNum(r.paybackYears) && r.paybackYears > 0;
      return {
        id: r.id, label: r.tr, reductionT: r.reductionT, capexTl: r.capexTl, netSavingsTl: r.netSavingsTl,
        paybackYears: pays ? r.paybackYears : null,
        selfFunding: isNum(r.costTlPerT) && r.costTlPerT < 0,
        afterOthers: r.id === 'green'
      };
    });
  }

  // ------------------------------------------------------------------ plan ve hedef
  function planInfo(R) {
    var sc = R.scenario || {}, P = R.path, out = {
      any: !!sc.any && !!sc.valid, savedT: sc.savedT, savedPct: null, capexTl: sc.capexTl, netSavingsTl: sc.netSavingsTl,
      paybackYears: sc.paybackYears, afterCpor: sc.afterCpor,
      afterGrade: sc.afterGrade && sc.afterGrade.letter !== '—' ? sc.afterGrade.letter : null,
      selected: (R.ranking || []).filter(function (r) { return r.selected; }).map(function (r) {
        return { id: r.id, label: r.tr, reductionT: r.reductionT, applied: r.applied !== false };
      }),
      target: null
    };
    if (pos(R.totals && R.totals.hcmiT) && isNum(sc.savedT)) { out.savedPct = sc.savedT / R.totals.hcmiT * 100; }
    if (P && P.m2030) {
      var need = P.baseT - P.m2030.targetTco2e, have = P.baseT - P.m2030.planTco2e;
      out.target = {
        year: 2030, met: P.m2030.met, gapT: P.m2030.gapTco2e,
        needT: need, haveT: have,
        coverage: need > 1e-9 ? Math.max(have, 0) / need : (have >= -1e-9 ? 1 : 0)
      };
    }
    return out;
  }

  /** Net sıfır yolu: hedef ve plan çizgileri + geçmiş yılların bina enerjisi emisyonu (aynı temel) */
  function pathInfo(R, hist) {
    var P = R.path;
    if (!P || !P.series) { return null; }
    var actual = (hist || []).filter(function (x) { return isNum(x.building); }).map(function (x) { return { year: x.year, t: x.building, sample: !!x.sample }; });
    actual.push({ year: P.baseYear, t: P.baseT, current: true });
    actual.sort(function (a, b) { return a.year - b.year; });
    return {
      baseYear: P.baseYear, baseT: P.baseT, planT: P.planT, start: P.start, done: P.done,
      years: P.series.years.slice(), target: P.series.target.slice(), plan: P.series.plan.slice(),
      actual: actual.filter(function (a) { return a.year <= P.baseYear; }),
      milestones: (P.evaluation || []).map(function (e) {
        return { year: e.year, targetT: e.targetTco2e, planT: e.planTco2e, gapT: e.gapTco2e, met: e.met };
      }),
      firstGap: P.firstGap ? { year: P.firstGap.year, gapT: P.firstGap.gapTco2e } : null
    };
  }

  // ------------------------------------------------------------------ ana model
  function model(s, R, hist, opts) {
    opts = opts || {};
    var h = s.hotel, ok = !!(R && R.started && R.usable);
    if (!ok) {
      return { ok: false, started: !!(R && R.started), name: h.name || '', year: isNum(h.year) ? h.year : null };
    }
    var cur = snapshot(s, R);
    hist = (hist || []).filter(function (x) { return x && isNum(x.year) && x.year !== cur.year; });
    // önceki yıl: ekrandaki yıldan önceki en son kayıt (ekrandaki yıl geçmiş bir yılsa sonraki yıllar kıyasa girmez)
    var before = hist.filter(function (x) { return !isNum(cur.year) || x.year < cur.year; });
    var prev = before.length ? before[before.length - 1] : null;
    var b = R.bench, seg = b.segment, E = R.esg || {}, pg = E.perGuest || {};
    var yr = function (x) { return isNum(x.year) ? x.year : Infinity; };
    var years = hist.concat([cur]).sort(function (p, q) { return yr(p) - yr(q); });

    function spark(id) {
      var pts = years.filter(function (y) { return isNum(y[id]) && isNum(y.year); }).map(function (y) { return { year: y.year, v: y[id], sample: !!y.sample }; });
      return pts.length >= 2 ? pts : null;
    }
    var tiles = TILE_IDS.map(function (id) {
      var m = BY_ID[id], v = cur[id], key = BENCH_KEY[id];
      var cmp = key && b[key] && isNum(b[key].ratio) ? b[key] : null;
      return {
        id: id, label: m.label, unit: m.unit, digits: m.digits, value: v, sub: m.sub,
        delta: prev ? delta(id, prev[id], v, prev.year) : null,
        vsSegment: cmp ? { ratio: cmp.ratio, text: cmp.text === 'segment ortalamasında' ? 'Segment ortalamasında' : 'Segment ortalamasının ' + cmp.text,
                           better: cmp.direction === 'same' ? null : cmp.direction === 'below', ref: seg ? seg[key] : null } : null,
        spark: spark(id)
      };
    });

    var trend = {};
    TREND_IDS.forEach(function (id) {
      var pts = years.filter(function (y) { return isNum(y.year) && isNum(y[id]); }).map(function (y) {
        return { year: y.year, v: y[id], sample: !!y.sample, current: y === cur };
      });
      var first = pts[0], last = pts[pts.length - 1];
      trend[id] = {
        id: id, label: BY_ID[id].short, unit: BY_ID[id].unit, digits: BY_ID[id].digits, points: pts,
        change: pts.length >= 2 ? delta(id, first.v, last.v, first.year) : null
      };
    });

    var src = (R.sources || []).filter(function (x) { return x.hcmi && x.t > 0; });
    var srcTot = src.reduce(function (a, x) { return a + x.t; }, 0);
    var top = src.slice(0, 6), rest = src.slice(6);
    if (rest.length) { top.push({ id: 'other', label: 'Diğer (' + rest.length + ' kalem)', t: rest.reduce(function (a, x) { return a + x.t; }, 0), other: true }); }
    var sc = R.scopes;

    var after = R.scenario && R.scenario.any && R.scenario.valid ? R.scenario.afterCpor : null;
    var verify = h.verify === 'third' ? 'Bağımsız üçüncü taraf doğruladı' : h.verify === 'internal' ? 'İç inceleme yapıldı' : 'İç hesaplama, doğrulanmadı';
    return {
      ok: true, sample: !!opts.sample,
      name: h.name || 'Tesisiniz', year: cur.year, city: h.city || '', rooms: h.rooms,
      segmentLabel: seg ? seg.tr : '', logo: h.logo || null,
      hero: {
        cpor: cur.cpor, grade: cur.grade, gradeLabel: b.grade ? b.grade.label : '', ratio: b.ratio, ref: b.ref,
        refIsCustom: !!b.refIsCustom, scalePos: b.scalePos, ticks: b.ticks,
        afterCpor: after, afterPos: isNum(after) && isNum(b.ref) && b.ref > 0 ? Math.min(Math.max((after / b.ref - 0.4) / 1.4, 0), 1) : null,
        afterGrade: R.scenario && R.scenario.afterGrade && R.scenario.afterGrade.letter !== '—' ? R.scenario.afterGrade.letter : null,
        delta: prev ? delta('cpor', prev.cpor, cur.cpor, prev.year) : null,
        total: cur.total, perGuest: cur.perGuest, completeness: R.completeness ? R.completeness.score : null,
        verify: verify, verified: h.verify === 'third'
      },
      tiles: tiles,
      trend: { ids: TREND_IDS.slice(), byId: trend, years: years.length, sample: hist.some(function (x) { return x.sample; }) },
      sources: {
        total: srcTot,
        scopes: sc ? [
          { id: 's1', label: 'Kapsam 1', desc: 'Yakıtlar, araçlar, soğutucu gaz', t: sc.s1All },
          { id: 's2', label: 'Kapsam 2', desc: 'Satın alınan elektrik', t: sc.s2Market },
          { id: 's3', label: 'Kapsam 3', desc: 'Dış çamaşırhane', t: sc.s3Laundry }
        ].filter(function (p) { return p.t > 0.0005; }) : [],
        top: top.map(function (x) { return { id: x.id, label: x.label, t: x.t, share: srcTot > 0 ? x.t / srcTot : null, other: !!x.other }; }),
        lever: lever(R)
      },
      path: pathInfo(R, hist),
      plan: planInfo(R),
      next: nextSteps(R, 3),
      people: {
        renew: R.renewable ? R.renewable.elecPct : null,
        recycle: isNum(E.recycleRate) ? E.recycleRate * 100 : null,
        local: E.localPct, trained: E.trainedPct,
        localTl: E.purchaseLocalTl, totalTl: E.purchaseTotalTl, staff: E.staff, staffTrained: E.staffTrained,
        wasteT: E.wasteT,
        perGuest: { waterL: isNum(pg.waterM3) ? pg.waterM3 * 1000 : null, wasteKg: pg.wasteKg, chemKg: pg.chemKg, kwh: pg.kwh },
        guestNights: E.guestNights
      },
      readiness: {
        completeness: R.completeness ? R.completeness.score : null,
        missing: R.completeness ? R.completeness.missing.map(function (m) { return { name: m.name, path: m.path }; }) : [],
        taxonomy: R.taxonomy ? R.taxonomy.score : null, taxonomyRec: R.taxonomy && R.taxonomy.recs.length ? R.taxonomy.recs[0] : null,
        verify: verify, verifyId: h.verify
      },
      offsets: R.offsets ? { remainingT: R.offsets.remainingT, costTl: R.offsets.costTl } : null
    };
  }

  NS.dashboard = {
    version: '1.0.0', METRICS: METRICS, TREND_IDS: TREND_IDS, TILE_IDS: TILE_IDS,
    model: model, snapshot: snapshot, history: history, sampleRecords: sampleRecords,
    delta: delta, sfx: sfx, lever: lever, nextSteps: nextSteps, planInfo: planInfo, pathInfo: pathInfo
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
