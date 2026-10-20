/* =========================================================================
   Turizm hesaplayıcısı — HESAP KATMANI  (assets/js/turizm/compute.js)
   -------------------------------------------------------------------------
   compute(state) → ekranda görünen HER sayı. Saf fonksiyondur: DOM'a dokunmaz,
   aynı durum için hep aynı sonucu verir. Hesabın kendisi resmî modüllerdedir:
     HCMI v2.0 motoru (hcmi-engine.js)      → ayak izi, kapsamlar, metrikler
     Türkiye şebeke faktörü (tr-reference.js) → elektrik faktörü (rapor yılı)
     CHSB 2026 Türkiye kıyası (benchmarks.js) → segment kıyası ve A–E notu
     Azaltım simülatörü (measures.js)        → önlemlerin etkisi, MACC sıralaması
     NZMFH 2. baskı (pathway.js)             → net sıfır patikası
   Bu dosya yalnız bunları birleştirir, ekran için hazırlar ve veri kontrolü
   mesajlarını üretir.

   Ön koşul: model.js ve yukarıdaki modüller. Dışa: globalThis.TURIZM.compute
   ========================================================================= */
(function (root) {
  'use strict';

  var NS = root.TURIZM = root.TURIZM || {};

  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function n0(x) { return isNum(x) ? x : 0; }
  function pos(x) { return isNum(x) && x > 0; }
  function div(a, b) { return isNum(a) && isNum(b) && b !== 0 ? a / b : null; }

  // Satır türleri → kapsam (HCMI başlık sınıflandırması: PPA Kapsam 2)
  var SCOPE2_IDS = { grid: 1, ppa: 1, steam: 1, hot_water: 1, chilled_water: 1 };
  // "Yakıt" sayılan türler (veri tamlığı için)
  var FUEL_GROUPS = { gas: 1, liquid: 1, solid: 1 };

  // Motor mesajlarının bu sayfanın seçenek adlarıyla yazılmış karşılıkları
  var MSG_TEXT = {
    area: 'Oda ve toplantı alanı girilmedi; oda-gece ve toplantı metrikleri hesaplanamıyor.',
    occupied: 'Satılan (dolu) oda-gece sayısı girilmedi; oda-gece başına karbon hesaplanamıyor.',
    refNone: 'Soğutucu gaz: "dolum miktarını biliyorum" seçili ama miktar girilmedi; kaçak 0 sayıldı. Bilmiyorsanız "HCMI tahmini (+%1)" seçeneğini işaretleyin.',
    mobileDouble: 'Araç yakıtı hem enerji tablosuna girilmiş hem de "HCMI tahmini (+%1)" seçilmiş; çift sayım olur. Tabloya girdiyseniz "tabloya girdim" seçeneğini işaretleyin.',
    recNoGrid: 'Yeşil elektrik belgesi girildi ama şebeke elektriği satırı boş; mahsup edilemedi.',
    laundryEmpty: 'Dış çamaşırhane: "çamaşırhanenin bizim için harcadığı enerjiyi biliyorum" seçili ama enerji girilmedi.',
    noMeeting: 'Toplantı alanı girilmedi: toplantı metriği hesaplanmaz, ayak izinin tamamı konuk odalarına yazılır.'
  };
  var SUPPRESS = { mobileMissing: 1 };     // "aracımız yok" açık bir seçimdir; ayrıca uyarmaya gerek yok
  var DOWNGRADE = { noMeeting: 'info' };

  /** Motor yolunu (energy[3].manualEf) durum yoluna (hotel.energy.5.manualEf) çevir */
  function mapPath(p, rowIndex) {
    if (!p) { return ''; }
    var m = /^energy\[(\d+)\]\.?(\w*)/.exec(p);
    if (m) {
      var i = rowIndex[+m[1]];
      if (i === undefined) { return 'hotel.energy'; }
      var f = { type: 'typeId', efMode: 'manualEf', '': 'total' }[m[2]] || m[2];
      return 'hotel.energy.' + i + '.' + f;
    }
    if (/^marketPurchases/.test(p)) { return 'hotel.market'; }
    if (/^refrigerantAmountsKg/.test(p)) { return 'hotel.refrigerants'; }
    if (/^laundry\.tonnage/.test(p)) { return 'hotel.laundry.tonnageKg'; }
    if (/^laundry/.test(p)) { return 'hotel.laundry.outsourced'; }
    return {
      'hotel.region': 'hotel.country', 'hotel.roomsArea': 'hotel.area.rooms', 'hotel.meetingArea': 'hotel.area.meeting',
      'hotel.occupiedRooms': 'hotel.occupiedRooms', 'supplementary.privateSpace.sharePct': 'hotel.privateSpace.sharePct',
      'supplementary.refrigerants': 'hotel.refrigerants.mode', 'supplementary.mobileFuels': 'hotel.mobileFuels'
    }[p] || '';
  }

  /** HCMI sonucu: "alan" ve "dolu oda" eksikliği dışında hata yoksa toplam güvenilirdir */
  var SOFT = { area: 1, occupied: 1 };
  function totalUsable(r) {
    return !!r && !r.incomplete && isNum(r.total.tco2e) && r.errors.every(function (e) { return SOFT[e.code]; });
  }
  /** measures.js için: alan / dolu oda eksik olsa da toplam hesaplanabiliyorsa geçerli say */
  function calcRelaxed(input, options) {
    var r = root.HCMI.calculate(input, options);
    if (!r.valid && totalUsable(r)) {
      var c = {}; for (var k in r) { if (Object.prototype.hasOwnProperty.call(r, k)) { c[k] = r[k]; } }
      c.valid = true; c.relaxed = true;
      return c;
    }
    return r;
  }
  /**
   * NZMFH Kategori 1 "Facility Emissions Intensity": binanın ENERJİ kullanımından doğan Kapsam 1 + 2
   * (sabit yakıtlar + satın alınan elektrik/ısı; YEK-G mahsubu sonrası). Araç yakıtı, soğutucu gaz
   * kaçağı, HCMI tahmini ek ve dış çamaşırhane bu kategoriye girmez (NZMFH §3.1.1).
   */
  function buildingOf(r) {
    if (!totalUsable(r)) { return null; }
    var kg = 0;
    r.rows.forEach(function (x) { if (x.stationary && x.ok && x.ef !== null) { kg += x.otherKg; } });
    kg -= r.market.creditTco2e * 1000;
    return Math.max(kg, 0) / 1000;
  }

  // ------------------------------------------------------------------ veri tamlığı
  function completeness(s) {
    var h = s.hotel, I = root.HCMI_DATA;
    var byId = {}; I.energyTypes.forEach(function (t) { byId[t.id] = t; });
    var rowHas = function (pred) { return h.energy.some(function (r) { return pos(r.total) && pred(r); }); };
    var refOk = h.refrigerants.mode !== 'manual' || h.refrigerants.items.some(function (it) { return pos(it.kg); });
    var items = [
      { w: 5, ok: isNum(h.year), name: 'rapor yılı', path: 'hotel.year' },
      { w: 5, ok: pos(h.rooms), name: 'oda sayısı', path: 'hotel.rooms' },
      { w: 10, ok: pos(h.area.conditioned), name: 'toplam alan', path: 'hotel.area.conditioned' },
      { w: 10, ok: pos(h.area.rooms), name: 'oda alanı', path: 'hotel.area.rooms' },
      { w: 5, ok: pos(h.area.meeting), name: 'toplantı alanı', path: 'hotel.area.meeting' },
      { w: 15, ok: pos(h.occupiedRooms), name: 'satılan oda-gece', path: 'hotel.occupiedRooms' },
      { w: 5, ok: pos(h.guestNights), name: 'misafir gecelemesi', path: 'hotel.guestNights' },
      { w: 20, ok: rowHas(function (r) { return r.typeId === 'grid'; }), name: 'şebeke elektriği', path: 'hotel.energy' },
      { w: 10, ok: rowHas(function (r) { var t = byId[r.typeId]; return t && FUEL_GROUPS[t.group] && t.stationary; }), name: 'yakıt tüketimi', path: 'hotel.energy' },
      { w: 5, ok: refOk, name: 'soğutucu gaz', path: 'hotel.refrigerants.mode' },
      { w: 5, ok: pos(h.extras.waterM3), name: 'su', path: 'hotel.extras.waterM3' },
      { w: 5, ok: pos(h.extras.wasteLandfillT) || pos(h.extras.wasteRecycledT), name: 'atık', path: 'hotel.extras.wasteLandfillT' }
    ];
    var score = 0, missing = [];
    items.forEach(function (it) { if (it.ok) { score += it.w; } else { missing.push({ name: it.name, path: it.path, w: it.w }); } });
    return { score: score, missing: missing };
  }

  // ------------------------------------------------------------------ taksonomi
  function taxonomy(s) {
    var M = NS.model, score = 0, recs = [];
    M.TAXONOMY.forEach(function (t) {
      if (s.hotel.taxonomy[t.id]) { score += t.w; } else { recs.push(t.reco); }
    });
    return { score: score, recs: score >= 100 ? ['Taksonomi raporlamasına güçlü bir temelle hazırsınız. Doğrulanmış envanter için bizimle görüşün.'] : recs.slice(0, 3) };
  }

  // ------------------------------------------------------------------ mesajlar
  function messages(s, res, rowIndex, grid, started) {
    var out = { errors: [], warnings: [], info: [] };
    if (!started) { return out; }
    function add(level, code, text, path, row) {
      var o = { code: code, message: text, path: path || '' };
      if (row !== undefined && row !== null) { o.row = row; }
      out[level].push(o);
    }
    [['errors', res.errors], ['warnings', res.warnings], ['info', res.info]].forEach(function (pair) {
      pair[1].forEach(function (m) {
        if (SUPPRESS[m.code]) { return; }
        var level = DOWNGRADE[m.code] || pair[0];
        var path = mapPath(m.path, rowIndex);
        var rm = /^hotel\.energy\.(\d+)\./.exec(path);
        add(level, m.code, MSG_TEXT[m.code] || m.message, path, rm ? +rm[1] : null);
      });
    });
    var h = s.hotel, sum = n0(h.area.rooms) + n0(h.area.meeting);
    if (pos(h.area.conditioned) && sum > h.area.conditioned * 1.001) {
      add('warnings', 'areaExceeds', 'Oda + toplantı alanı, toplam iklimlendirilen alanı aşıyor. Toplam alan oda ve toplantı alanlarını da içermelidir; ortak alanlar aradaki farktır.', 'hotel.area.conditioned');
    }
    if (h.laundry.outsourced && h.laundry.method === 'tonnage' && !pos(h.laundry.tonnageKg)) {
      add('warnings', 'laundryNoAmount', 'Dış çamaşırhane: yıkanan miktarı (kg) girin ya da "bilmiyorum — dolu oda sayısından tahmin et" seçeneğini işaretleyin.', 'hotel.laundry.tonnageKg');
    }
    if (h.privateSpace.has && h.privateSpace.method === 'actual' && !h.energy.some(function (r) { return pos(r.privateActual); })) {
      add('info', 'privateNone', 'Özel alan seçildi ama hiçbir satırda özel alan tüketimi girilmedi. Satırın "Ayrıntılar" bölümünden girin ya da "yalnız alan oranını biliyorum" seçin.', 'hotel.privateSpace.method');
    }
    if (!isNum(h.year)) {
      add('info', 'noYear', 'Rapor yılı girilmedi: elektrik faktörü için yayımlanmış en güncel yıl, net sıfır patikası için 2025 kullanıldı.', 'hotel.year');
    } else if (grid && grid.reason === 'notPublished') {
      add('info', 'gridYear', grid.message, 'hotel.year');
    } else if (grid && grid.reason === 'beforeSeries') {
      add('info', 'gridYear', grid.message, 'hotel.year');
    }
    if (grid && grid.origin === 'hcmi' && grid.value === null) {
      var hasGrid = h.energy.some(function (r) { return r.typeId === 'grid' && pos(r.total) && r.efMode !== 'manual'; });
      if (hasGrid) { add('info', 'gridNoDefault', grid.message, 'hotel.country'); }
    }
    return out;
  }

  // ------------------------------------------------------------------ kaynak dökümü
  function sources(s, res, extras) {
    var list = [], H = root.HCMI_DATA, byName = {};
    H.energyTypes.forEach(function (t) { byName[t.name] = t; });
    res.rows.forEach(function (r) {
      var t = byName[r.type]; if (!t || !(r.otherKg > 0)) { return; }
      var kg = r.otherKg;
      if (t.id === 'grid') { kg = Math.max(kg - res.market.creditTco2e * 1000, 0); }
      var label = t.id === 'grid' ? 'Şebeke elektriği' + (res.market.creditTco2e > 0 ? ' (piyasa bazlı)' : '') : t.tr;
      list.push({ id: t.id, label: label, t: kg / 1000, scope: SCOPE2_IDS[t.id] ? 2 : 1, hcmi: true });
    });
    res.refrigerants.forEach(function (rf) {
      list.push({ id: rf.id, label: 'Soğutucu gaz kaçağı (' + NS.model.refrigerantLabel(rf.id) + ')', t: rf.tco2e, scope: 1, hcmi: true });
    });
    if (res.breakdown.upliftTco2e > 1e-9) {
      list.push({ id: 'uplift', label: 'HCMI tahmini ek (soğutucu gaz / araç yakıtı)', t: res.breakdown.upliftTco2e, scope: 1, hcmi: true });
    }
    if (res.scopes.scope3LaundryTco2e > 1e-9) {
      list.push({ id: 'laundry', label: 'Dış çamaşırhane', t: res.scopes.scope3LaundryTco2e, scope: 3, hcmi: true });
    }
    var X = root.MEASURES.extrasEf;
    var w = n0(extras.waterM3) * X.waterKgPerM3 / 1000;
    var ws = (n0(extras.wasteLandfillT) * X.landfillKgPerT + n0(extras.wasteRecycledT) * X.recycleKgPerT) / 1000;
    if (w > 0) { list.push({ id: 'water', label: 'Su (HCMI dışı)', t: w, scope: 3, hcmi: false }); }
    if (ws > 0) { list.push({ id: 'waste', label: 'Atık (HCMI dışı)', t: ws, scope: 3, hcmi: false }); }
    list.sort(function (a, b) { return b.t - a.t; });
    return list;
  }

  // ------------------------------------------------------------------ ana hesap
  function compute(state) {
    var M = NS.model, H = root.HCMI, B = root.BENCH, P = root.NZPATH, MS = root.MEASURES;
    var s = state, h = s.hotel;
    var built = M.buildInput(s), input = built.input, opts = M.calcOptions(s);
    var res = H.calculate(input, opts);
    var grid = M.gridInfo(s);
    var started = !M.hotelIsEmpty(h);
    var usable = totalUsable(res);

    // ---- toplamlar
    var base = M.measuresBase(s, input);
    var extrasT = MS.extrasTco2e(base.extras);
    var hcmiT = usable ? res.total.tco2e : null;
    var totals = {
      hcmiT: hcmiT,
      buildingT: buildingOf(res),
      laundryT: usable ? res.scopes.scope3LaundryTco2e : null,
      upliftT: usable ? res.breakdown.upliftTco2e : null,
      extrasT: extrasT,
      fullT: usable ? hcmiT + extrasT : null
    };

    // ---- metrikler
    var area = n0(h.area.conditioned) > 0 ? n0(h.area.conditioned) : n0(h.area.rooms) + n0(h.area.meeting);
    var hcmiArea = n0(h.area.rooms) + n0(h.area.meeting);
    var metrics = {
      cpor: usable ? res.total.cporKg : null,
      meetH: usable ? res.total.meetingKgPerAreaHour : null,
      meetY: usable && pos(h.area.meeting) && isNum(res.total.meetingsTco2e) ? res.total.meetingsTco2e * 1000 / h.area.meeting : null,
      kgPerHcmiArea: usable ? res.total.kgPerAreaYear : null,
      shareRooms: hcmiArea > 0 ? n0(h.area.rooms) / hcmiArea : null,
      shareMeet: hcmiArea > 0 ? n0(h.area.meeting) / hcmiArea : null,
      guestroomsT: usable ? res.total.guestroomsTco2e : null,
      meetingsT: usable ? res.total.meetingsTco2e : null
    };
    var ownKwh = res.energy.totalKwh - res.energy.laundryKwh;
    var intensity = {
      areaM2: area,
      areaBasis: n0(h.area.conditioned) > 0 ? 'conditioned' : (hcmiArea > 0 ? 'hcmi' : null),
      co2m2: usable && area > 0 ? hcmiT * 1000 / area : null,
      kwhm2: area > 0 && ownKwh > 0 ? ownKwh / area : null,
      waterL: pos(h.extras.waterM3) && pos(h.occupiedRooms) ? h.extras.waterM3 * 1000 / h.occupiedRooms : null,
      wasteKg: (pos(h.extras.wasteLandfillT) || pos(h.extras.wasteRecycledT)) && pos(h.occupiedRooms)
        ? (n0(h.extras.wasteLandfillT) + n0(h.extras.wasteRecycledT)) * 1000 / h.occupiedRooms : null,
      ownKwh: ownKwh
    };

    // ---- kıyas
    var seg = B.segment(h.segment);
    var g = B.gradeFor(metrics.cpor, h.segment, h.benchRef);
    var ratio = g.ratio;
    var bench = {
      segment: seg, ref: g.ref, refIsCustom: isNum(h.benchRef) && h.benchRef > 0, ratio: ratio, grade: g.grade,
      scalePos: isNum(ratio) ? Math.min(Math.max((ratio - 0.4) / 1.4, 0), 1) : null,
      ticks: [0.4, 0.6, 0.85, 1.15, 1.5, 1.8].map(function (k) { return isNum(g.ref) ? g.ref * k : null; }),
      co2m2: B.compare(intensity.co2m2, seg && seg.co2m2),
      kwhm2: B.compare(intensity.kwhm2, seg && seg.kwhm2),
      water: B.compare(intensity.waterL, seg && seg.water),
      waste: B.compare(intensity.wasteKg, seg && seg.waste),
      meet: B.compare(metrics.meetH, seg && seg.meet)
    };

    // ---- kaynaklar ve kapsamlar
    var src = usable ? sources(s, res, base.extras) : [];
    var scopes = usable ? {
      s1: res.scopes.scope1Tco2e, uplift: res.breakdown.upliftTco2e, s1All: res.scopes.scope1Tco2e + res.breakdown.upliftTco2e,
      s2Location: res.scopes.scope2LocationTco2e, s2Market: res.scopes.scope2MarketTco2e, s3Laundry: res.scopes.scope3LaundryTco2e,
      s3Other: extrasT, recCreditT: res.market.creditTco2e, recAppliedKwh: res.market.appliedKwh
    } : null;
    var renewable = {
      elecPct: res.renewable.pctOfElectricity, energyPct: res.renewable.pctOfEnergy,
      kwh: res.renewable.kwh, onsiteKwh: res.renewable.onsiteKwh, ppaKwh: res.renewable.ppaKwh, marketKwh: res.renewable.marketKwh
    };

    // satır bazında (enerji defteri): durumdaki satır sırasına göre
    var rowResults = h.energy.map(function () { return null; });
    built.rowIndex.forEach(function (i, k) {
      var r = res.rows[k]; if (!r) { return; }
      rowResults[i] = { kwh: r.kwhExLaundry, ef: r.ef, efSource: r.efSource, t: r.ok && r.ef !== null ? r.otherKg / 1000 : null, ok: r.ok };
    });

    // ---- azaltım senaryosu (adım 3)
    var params = {};
    var scen = MS.evaluate(base, h.measures, calcRelaxed, params, opts);
    var rank = MS.ranking(base, calcRelaxed, params, opts);
    var scenOk = scen.valid && usable;
    var afterRes = scen.after;
    var afterCpor = scenOk && afterRes ? afterRes.total.cporKg : null;
    var scenario = {
      valid: scenOk, any: h.measures.length > 0,
      savedT: scenOk ? scen.reductionTco2e : null,
      savedFullT: scenOk ? scen.reductionFullTco2e : null,
      afterT: scenOk ? scen.afterTco2e : hcmiT,
      afterFullT: scenOk ? scen.afterTco2e + MS.extrasTco2e(scen.extras) : totals.fullT,
      afterBuildingT: scenOk ? buildingOf(afterRes) : totals.buildingT,
      afterCpor: afterCpor,
      afterGrade: B.gradeFor(afterCpor, h.segment, h.benchRef).grade,
      capexTl: scen.capexTl, opexTl: scen.opexTl, savingsTl: scen.savingsTl, netSavingsTl: scen.netSavingsTl,
      paybackYears: scen.paybackYears, applied: scen.applied, notes: scen.notes
    };
    var ranking = rank.map(function (r) {
      return { id: r.id, tr: r.tr, group: r.group, selected: h.measures.indexOf(r.id) >= 0, applied: r.applied,
               reductionT: usable ? r.reductionFullTco2e : null, reductionHcmiT: usable ? r.reductionTco2e : null,
               capexTl: r.capexTl, netSavingsTl: r.netSavingsTl, paybackYears: r.paybackYears,
               costTlPerT: usable ? r.costTlPerTco2e : null, notes: r.notes };
    });

    // ---- net sıfır (adım 4) — NZMFH Kategori 1: bina enerjisi emisyonu (Kapsam 1 + 2)
    var baseYear = isNum(h.year) ? h.year : 2025;
    var cls = P.classOf(baseYear);
    var baseF = totals.buildingT, planF = scenario.afterBuildingT;
    var path = null;
    if (isNum(baseF) && baseF > 0) {
      var start = isNum(h.netZero.start) ? Math.max(h.netZero.start, baseYear) : baseYear + 1;
      var done = isNum(h.netZero.done) ? Math.max(h.netZero.done, start) : Math.max(2030, start);
      var planFn = function (y) { return P.planAt(baseF, isNum(planF) ? planF : baseF, start, done, y); };
      var ms = P.milestones({ baseYear: baseYear, baseTco2e: baseF, areaM2: area });
      var ev = P.evaluate(ms, planFn);
      var to = Math.max(2050, baseYear + 1);
      var series = P.series(ms, planFn, baseYear, to);
      var m30 = ev.filter(function (e) { return e.year === 2030; })[0] || null;
      path = {
        baseYear: baseYear, yearGiven: isNum(h.year), cls: cls, start: start, done: done,
        baseT: baseF, planT: isNum(planF) ? planF : baseF,
        milestones: ms, evaluation: ev, series: series, m2030: m30,
        firstGap: ev.filter(function (e) { return !e.met; })[0] || null
      };
    }

    // ---- dengeleme
    var ver = n0(h.prices.verTlPerT);
    var remaining = scenario.afterT;
    var offsets = {
      remainingT: remaining, verCount: isNum(remaining) ? Math.ceil(remaining - 1e-9) : null,
      costTl: isNum(remaining) ? remaining * ver : null,
      perRoomNightTl: isNum(remaining) && pos(h.occupiedRooms) ? remaining * ver / h.occupiedRooms : null,
      perGuestTl: isNum(remaining) && pos(h.guestNights) ? remaining * ver / h.guestNights : null,
      gap2030CostTl: path && path.m2030 ? path.m2030.gapTco2e * ver : null
    };

    // ---- etkinlik (adım 5) — HCMI Tab C
    var e = h.event;
    var cr = usable ? H.clientReport(res, { roomNights: n0(e.nights), meetingArea: n0(e.m2), meetingHours: n0(e.hours) }) : null;
    var event = {
      valid: !!cr && (pos(e.nights) || (pos(e.m2) && pos(e.hours))),
      meetingKg: cr ? cr.meetingsKg : null, stayKg: cr ? cr.guestroomsKg : null, totalKg: cr ? cr.totalKg : null,
      perPersonKg: cr && pos(e.guests) ? cr.totalKg / e.guests : null,
      costTl: cr ? cr.totalKg / 1000 * ver : null
    };

    return {
      started: started, usable: usable, valid: res.valid,
      input: input, rowIndex: built.rowIndex, options: opts, grid: grid, result: res,
      totals: totals, metrics: metrics, intensity: intensity, bench: bench,
      sources: src, scopes: scopes, renewable: renewable, rows: rowResults,
      scenario: scenario, ranking: ranking, path: path, offsets: offsets, event: event,
      completeness: completeness(s), taxonomy: taxonomy(s),
      messages: messages(s, res, built.rowIndex, grid, started)
    };
  }

  NS.compute = compute;
  NS.computeHelpers = { totalUsable: totalUsable, calcRelaxed: calcRelaxed, mapPath: mapPath, completeness: completeness, taxonomy: taxonomy };
})(typeof globalThis !== 'undefined' ? globalThis : self);
