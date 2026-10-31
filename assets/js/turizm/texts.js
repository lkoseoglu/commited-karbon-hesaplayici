/* =========================================================================
   Turizm hesaplayıcısı — ÇIKTI METİNLERİ  (assets/js/turizm/texts.js)
   -------------------------------------------------------------------------
   Kopyalanan / paylaşılan her metin burada üretilir:
     declaration(state, R)   kurumsal müşteriye verilecek beyan metni
     executive(state, R)     yönetici özeti (WhatsApp ile de paylaşılır)
     exportObject(state, R)  JSON çıktısı (şema: commited.hotel.hcmi/2)
     agencySummary(state, A) acente özeti
     whatsappUrl(text)
   R = TURIZM.compute(state), A = TURIZM.agency.compute(state.agency).
   Saf fonksiyonlar; DOM'a dokunmaz. Dışa: globalThis.TURIZM.texts
   ========================================================================= */
(function (root) {
  'use strict';

  var NS = root.TURIZM = root.TURIZM || {};
  var SIGN = 'Hesap: commitedevents.app — cOmmited';
  var LINE = '----------------------------------------';

  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function f(x, d) { return isNum(x) ? root.NUM.format(x, d === undefined ? 1 : d) : '—'; }
  function t(x) { return isNum(x) ? root.NUM.format(x, Math.abs(x) < 100 ? 1 : 0) : '—'; }       // ton: 100 altı 1 ondalık
  function tl(x) { return isNum(x) ? root.NUM.format(Math.round(x), 0) : '—'; }
  function pct01(x) { return isNum(x) ? root.NUM.pct(root.NUM.format(x * 100, 0)) : '—'; }
  function pct100(x) { return isNum(x) ? root.NUM.pct(root.NUM.format(x, 0)) : '—'; }
  function r2(x, d) { if (!isNum(x)) { return null; } var p = Math.pow(10, d); return Math.round(x * p) / p; }

  function title(s) {
    var h = s.hotel;
    return (h.name || 'Tesis') + (h.city ? ' (' + h.city + ')' : '');
  }
  function gridLine(R) {
    var g = R.grid; if (!g || !isNum(g.value)) { return null; }
    if (g.origin === 'tr') {
      return 'Şebeke elektriği faktörü: ' + f(g.value, 3) + ' kgCO2e/kWh (ETKB ' + g.basisYear + ', '
        + (g.connection === 'transmission' ? 'iletim' : 'dağıtım') + ' hattı tüketim noktası)';
    }
    return 'Şebeke elektriği faktörü: ' + f(g.value, 3) + ' kgCO2e/kWh (HCMI v2.0 ülke tablosu)';
  }

  /** Kurumsal müşteri / RFP beyanı */
  function declaration(s, R) {
    var h = s.hotel, m = R.metrics, sc = R.scopes, T = R.totals, I = R.intensity;
    if (!R.usable || !sc) { return ''; }
    var out = [
      'KARBON AYAK İZİ BEYANI — ' + title(s),
      'Raporlama yılı: ' + (isNum(h.year) ? h.year : '—') + ' · ' + f(h.rooms, 0) + ' oda · ' + f(h.occupiedRooms, 0) + ' satılan oda-gece',
      'Metodoloji: HCMI v2.0 (Hotel Carbon Measurement Initiative) · GHG Protocol Kurumsal Standart'
    ];
    var gl = gridLine(R); if (gl) { out.push(gl); }
    out.push(LINE);
    out.push('Oda-gece başına karbon (CPOR): ' + f(m.cpor, 1) + ' kgCO2e');
    out.push('Toplantı alanı: ' + f(m.meetH, 4) + ' kgCO2e/m2/saat' + (isNum(m.meetY) ? ' · ' + f(m.meetY, 0) + ' kgCO2e/m2/yıl' : ''));
    out.push('Kapsam 1: ' + t(sc.s1) + ' tCO2e');
    if (sc.uplift > 1e-9) { out.push('HCMI tahmini ek (soğutucu gaz / araç yakıtı, %' + f((R.result.breakdown.upliftFactor - 1) * 100, 0) + '): ' + t(sc.uplift) + ' tCO2e'); }
    out.push('Kapsam 2 (konum bazlı): ' + t(sc.s2Location) + ' tCO2e');
    out.push('Kapsam 2 (piyasa bazlı): ' + t(sc.s2Market) + ' tCO2e');
    out.push('Kapsam 3 (dış çamaşırhane): ' + t(sc.s3Laundry) + ' tCO2e');
    out.push('HCMI ayak izi toplamı: ' + t(T.hcmiT) + ' tCO2e');
    out.push('Alan yoğunluğu: ' + f(I.co2m2, 1) + ' kgCO2e/m2/yıl');
    out.push('Enerji yoğunluğu: ' + f(I.kwhm2, 0) + ' kWh/m2/yıl');
    out.push('Yenilenebilir elektrik payı: ' + pct100(R.renewable.elecPct));
    out.push('Doğrulama durumu: ' + NS.model.VERIFY[h.verify]);
    out.push(LINE);
    out.push('Not: Değerler dengeleme (karbon kredisi) öncesi brüt emisyonu gösterir; HCMI kuralı gereği krediler brüt emisyondan düşülmez.');
    out.push('Bu değerler "karbon nötr", "iklim nötr" ya da "çevre dostu" gibi genel iddialara dayanak olarak kullanılamaz (AB 2024/825).');
    out.push(SIGN);
    return out.join('\n');
  }

  /** Yönetici özeti */
  function executive(s, R) {
    var h = s.hotel, T = R.totals, sc = R.scenario, b = R.bench;
    if (!R.usable) { return ''; }
    var out = [
      'Otel Karbon Özeti — ' + (h.name || 'Tesis') + (isNum(h.year) ? ' (' + h.year + ')' : ''),
      'HCMI ayak izi: ' + t(T.hcmiT) + ' tCO2e · tam envanter ' + t(T.fullT) + ' tCO2e',
      'CPOR: ' + f(R.metrics.cpor, 1) + ' kgCO2e/oda-gece — kıyas notu ' + b.grade.letter + ' (' + b.grade.label + ', referans ' + f(b.ref, 1) + ')'
    ];
    if (sc.any && sc.valid) {
      out.push('Seçilen önlemlerle azaltım: ' + t(sc.savedT) + ' tCO2e/yıl (' + (T.hcmiT > 0 ? pct01(sc.savedT / T.hcmiT) : '—') + ')');
      out.push('Yıllık işletme tasarrufu: ' + tl(sc.netSavingsTl) + ' TL · yatırım ' + tl(sc.capexTl) + ' TL'
        + (isNum(sc.paybackYears) ? ' · geri ödeme ' + f(sc.paybackYears, 1) + ' yıl' : ''));
    }
    var p = R.path;
    if (p && p.m2030) {
      out.push('2030 hedefi (NZMFH): bina enerjisi emisyonu ' + t(p.m2030.targetTco2e) + ' tCO2e · açık ' + t(p.m2030.gapTco2e) + ' tCO2e');
    }
    var o = R.offsets;
    out.push('Kalan emisyonu dengeleme maliyeti (karbon kredisi; brüt emisyondan düşülmez): ' + t(o.remainingT) + ' tCO2e/yıl = ' + tl(o.costTl) + ' TL/yıl'
      + (isNum(o.perRoomNightTl) ? ' (' + f(o.perRoomNightTl, 2) + ' TL/oda-gece)' : ''));
    out.push('Taksonomi hazırlık skoru: ' + R.taxonomy.score + '/100');
    out.push(SIGN);
    return out.join('\n');
  }

  /** JSON çıktısı (yazılım ekipleri ve Commited için) */
  function exportObject(s, R) {
    var h = s.hotel, res = R.result, M = NS.model, I = R.intensity, m = R.metrics;
    var energy = R.input.energy.map(function (row, k) {
      var r = res.rows[k] || {};
      return { type: row.type, typeId: (root.HCMI_DATA.energyTypes.filter(function (x) { return x.name === row.type; })[0] || {}).id,
               unit: row.unit, amount: row.total, kwh: r2(r.kwhExLaundry, 1), ef: r.ef, efSource: r.efSource,
               tco2e: isNum(r.otherKg) ? r2(r.otherKg / 1000, 3) : null };
    });
    var p = R.path;
    return {
      schema: 'commited.hotel.hcmi/2',
      generated: new Date().toISOString(),
      app: { name: 'turizm-karbon-hesaplayici', version: M.APP_VERSION, engine: res.engineVersion, hcmiDataSha256: res.dataSha256 },
      property: { name: h.name, city: h.city, country: h.country, region: h.region, segment: h.segment, rooms: h.rooms,
                  reportingYear: h.year, verification: M.VERIFY[h.verify] },
      areas: { conditionedM2: h.area.conditioned, guestroomM2: h.area.rooms, meetingM2: h.area.meeting,
               guestroomShare: r2(m.shareRooms, 4), meetingShare: r2(m.shareMeet, 4) },
      occupancy: { occupiedRoomNights: h.occupiedRooms, guestNights: h.guestNights },
      gridFactor: R.grid ? { value: R.grid.value, origin: R.grid.origin, basisYear: R.grid.basisYear, connection: R.grid.connection,
                             source: R.grid.source ? R.grid.source.title : 'HCMI v2.0', url: R.grid.source ? R.grid.source.url : null } : null,
      energy: energy,
      marketPurchases: R.input.marketPurchases,
      refrigerants: { mode: h.refrigerants.mode, items: (res.refrigerants || []).map(function (x) { return { id: x.id, name: x.name, gwp: x.gwp, kg: x.kg, tco2e: r2(x.tco2e, 3) }; }) },
      mobileFuels: h.mobileFuels,
      laundry: { outsourced: h.laundry.outsourced, method: h.laundry.outsourced ? h.laundry.method : null,
                 tonnageT: res.laundry.tonnageT !== null ? r2(res.laundry.tonnageT, 3) : null, tco2e: R.usable ? r2(res.scopes.scope3LaundryTco2e, 3) : null },
      hcmi: R.usable ? {
        scope1T: r2(res.scopes.scope1Tco2e, 2), upliftT: r2(res.breakdown.upliftTco2e, 2),
        scope2LocationT: r2(res.scopes.scope2LocationTco2e, 2), scope2MarketT: r2(res.scopes.scope2MarketTco2e, 2),
        scope3LaundryT: r2(res.scopes.scope3LaundryTco2e, 2), footprintT: r2(res.total.tco2e, 2),
        carbonPerOccupiedRoomKg: r2(m.cpor, 2), meetingPerM2PerHourKg: r2(m.meetH, 5), meetingPerM2PerYearKg: r2(m.meetY, 2),
        renewableElectricityPct: r2(R.renewable.elecPct, 2), renewableEnergyPct: r2(R.renewable.energyPct, 2)
      } : null,
      fullInventory: { totalT: r2(R.totals.fullT, 2), waterWasteT: r2(R.totals.extrasT, 2),
                       water: { m3: h.extras.waterM3 }, waste: { landfillT: h.extras.wasteLandfillT, recycledT: h.extras.wasteRecycledT } },
      intensity: { kgCo2ePerM2: r2(I.co2m2, 2), kwhPerM2: r2(I.kwhm2, 1), litresWaterPerRoomNight: r2(I.waterL, 0),
                   wasteKgPerOccupiedRoom: r2(I.wasteKg, 2), areaBasis: I.areaBasis },
      benchmark: { source: 'CHSB 2026 Türkiye', segment: h.segment, referenceCporKg: R.bench.ref, customReference: R.bench.refIsCustom,
                   ratio: r2(R.bench.ratio, 3), grade: R.bench.grade.letter },
      reduction: { selected: h.measures.slice(), applied: R.scenario.applied, savingT: r2(R.scenario.savedT, 2),
                   newFootprintT: r2(R.scenario.afterT, 2), newCporKg: r2(R.scenario.afterCpor, 2),
                   annualNetSavingTry: isNum(R.scenario.netSavingsTl) ? Math.round(R.scenario.netSavingsTl) : null,
                   capexTry: isNum(R.scenario.capexTl) ? Math.round(R.scenario.capexTl) : null, paybackYears: r2(R.scenario.paybackYears, 2) },
      netZero: p ? { method: 'Net Zero Methodology for Hotels, 2. baskı (2023), Tablo 3, Kategori 1', basis: 'Bina enerjisi: sabit yakıtlar (Kapsam 1) + satın alınan elektrik ve ısı (Kapsam 2, piyasa bazlı); araç yakıtı, soğutucu gaz ve dış çamaşırhane hariç',
                     baselineYear: p.baseYear, baselineBuildingT: r2(p.baseT, 2), planBuildingT: r2(p.planT, 2), planStart: p.start, planDone: p.done,
                     milestones: p.evaluation.map(function (e) { return { year: e.year, targetT: r2(e.targetTco2e, 2), reductionPct: r2(e.reductionPct, 1), planT: r2(e.planTco2e, 2), gapT: r2(e.gapTco2e, 2), met: e.met }; }) } : null,
      offsets: { remainingT: r2(R.offsets.remainingT, 2), verCount: R.offsets.verCount, costTry: isNum(R.offsets.costTl) ? Math.round(R.offsets.costTl) : null,
                 perRoomNightTry: r2(R.offsets.perRoomNightTl, 2), verPriceTryPerT: h.prices.verTlPerT },
      sustainability: R.esg ? {
        note: 'Karbon hesabına girmez; sürdürülebilirlik raporu göstergeleri. Kişi başı = misafir gecelemesi başına.',
        chemicalsKg: h.esg.chemicalsKg, purchaseTotalTry: h.esg.purchaseTotalTl, purchaseLocalTry: h.esg.purchaseLocalTl,
        localPurchasePct: r2(R.esg.localPct, 2), staff: h.esg.staff, staffTrained: h.esg.staffTrained, staffTrainedPct: r2(R.esg.trainedPct, 1),
        wasteRecycledPct: isNum(R.esg.recycleRate) ? r2(R.esg.recycleRate * 100, 1) : null,
        perGuestNight: { kwh: r2(R.esg.perGuest.kwh, 2), waterM3: r2(R.esg.perGuest.waterM3, 3), wasteKg: r2(R.esg.perGuest.wasteKg, 3),
                         chemicalsKg: r2(R.esg.perGuest.chemKg, 3), kgCo2e: r2(R.esg.perGuest.co2Kg, 2) }
      } : null,
      taxonomyScore: R.taxonomy.score,
      note: 'Tarama hesabı. Doğrulanmış envanter için bağımsız doğrulama gerekir.'
    };
  }

  function agencySummary(s, A) {
    var st = A.stay, out = [
      'Turizm Karbon Hesaplayıcısı — Acente / Tur Operatörü',
      'Yıllık toplam: ' + f(A.totalT, 1) + ' tCO₂e'
    ];
    if (isNum(A.perGuestKg)) { out.push('Misafir başına: ' + f(A.perGuestKg, 1) + ' kgCO₂e'); }
    if (isNum(A.perTourT)) { out.push('Tur başına: ' + f(A.perTourT, 2) + ' tCO₂e'); }
    if (st.nights > 0) {
      out.push('Konaklama: ' + f(st.nights, 0) + ' oda-gece × ' + f(st.cpor, 1) + ' kgCO₂e/oda-gece' + (st.split ? ' (ağırlıklı ortalama)' : '')
        + ' = ' + f(st.kg / 1000, 1) + ' tCO₂e');
      var used = st.rows.filter(function (r) { return r.n > 0; });
      if (used.length > 1) {
        used.forEach(function (r) { out.push('  · ' + r.tr + ': ' + f(r.n, 0) + ' oda-gece × ' + f(r.c, 1) + ' = ' + f(r.kg / 1000, 1) + ' tCO₂e'); });
      }
    }
    out.push('Konaklama katsayı kaynağı: CHSB 2026 Türkiye ortalamaları');
    out.push('Hesap: commitedevents.app · HCMI / DEFRA faktörleri');
    return out.join('\n');
  }

  function whatsappUrl(text) { return 'https://wa.me/?text=' + encodeURIComponent(text || ''); }

  NS.texts = { declaration: declaration, executive: executive, exportObject: exportObject, agencySummary: agencySummary, whatsappUrl: whatsappUrl,
               fmt: { f: f, t: t, tl: tl, pct01: pct01, pct100: pct100 } };
})(typeof globalThis !== 'undefined' ? globalThis : self);
