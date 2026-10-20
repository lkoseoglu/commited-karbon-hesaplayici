/* =========================================================================
   Net sıfır yol haritası  (assets/js/pathway.js)
   -------------------------------------------------------------------------
   Kaynak: "Net Zero Methodology for Hotels", 2. Baskı, Haziran 2023
   (Greenview / WTTC / PATA / Sustainable Hospitality Alliance),
   Bölüm 3.1.4 ve Tablo 3 "Hotel Net-Zero 2025-2050 Performance Milestones",
   Kategori 1 "Facility Emissions Intensity" (Kapsam 1 + 2, kgCO2e/m²).

   Tablo 3 her yıl için üç ölçüt verir ve "EN AZ BİRİNİN" sağlanmasını ister:
     1) mutlak azaltım (baz yıla göre %)        2) yoğunluk azaltımı (baz yıla göre %)
     3) seviye eşiği (kgCO2e/m²)
   Ek olarak Kapsam 1 için dengeleme (offset) üst sınırı (kgCO2e/m²) ve
   enerji verimliliği hedefi vardır.

   YORUM KURALLARI (bu aracın okuması — kaynak metinde açıkça yazanlar işaretli):
     • Yüzdeler 2019 baz yılına göredir (Tablo 3 dipnot 18). "Yıllık doğrusal eşdeğer"
       ifadesi kaynakta VARDIR; 2019'dan sonraki baz yıllar için yüzde
       p × (Y − baz) / (Y − 2019) olarak ölçeklenir.
     • 2030'a kadar pratik kural (Bölüm 3.1.4, açık): baz yoğunluğunun
       yılda %3 (baz yıl < 2012), %4 (2012–2019), %5 (2020 ve sonrası) azaltılması;
       yıllık oran HER ZAMAN sabit baz yıl değerinin yüzdesidir, bir önceki yılın değil.
       Bu araç 2030'a kadar Tablo 3'ün doğrusal eşdeğeri ile bu kuralın DAHA SIKI olanını
       uygular (2019 baz yılında sonuç yayımlanmış Tablo 3 rakamlarıdır: %25 ve %45).
     • 2050'de baz yıla göre %99 azaltım (Tablo 3, açık) ve kalan emisyonun dengelenmesi.
     • Bu aracın tek yılın verisiyle çalışması nedeniyle alan sabit varsayılır; bu
       durumda yoğunluk azaltımı ölçütü mutlak azaltımdan sıkı olur ve bağlayıcı olmaz.
     • Hedef çizgisi = üç ölçütün EN GEVŞEĞİ (en az biri yeter). En sıkı ölçüt ayrıca verilir.

   Hedef bir "bilimsel hedef beyanı" değildir (SBTi onayı gerekir).
   Klasik betik: globalThis.NZPATH atar. DOM'a bağımlı değildir.
   ========================================================================= */
(function (root) {
  'use strict';

  var SOURCE = {
    id: 'nzmfh-2',
    title: 'Net Zero Methodology for Hotels, 2nd Edition',
    date: '2023-06',
    publisher: 'Greenview, WTTC, PATA, Sustainable Hospitality Alliance',
    sections: 'Bölüm 3.1.4 ve Tablo 3 (Kategori 1: Facility Emissions Intensity)'
  };

  var YARDSTICKS = [2025, 2030, 2035, 2040, 2050];
  var TABLE_BASE_YEAR = 2019;          // Tablo 3 dipnot 18-19

  /* absPct/intPct: baz yıla göre %, level: kgCO2e/m², offsetCap: Kapsam 1 dengeleme üst sınırı kgCO2e/m²,
     energyEff: kümülatif enerji azaltımı % ("veya sektör en iyisi") */
  var TABLE3 = {
    2025: { absPct: 25, intPct: 41, level: 57,   offsetCap: 12,   energyEff: 10 },
    2030: { absPct: 45, intPct: 72, level: 45,   offsetCap: 7,    energyEff: 20, absPctHigh: 50 },   // 45–50: 2020 anomali yılı nedeniyle aralık
    2035: { absPct: 60, intPct: 88, level: 34,   offsetCap: 5,    energyEff: 25 },
    2040: { absPct: 73, intPct: 95, level: 23,   offsetCap: 2,    energyEff: 30 },
    2050: { absPct: 99, intPct: 99, level: null, offsetCap: null, energyEff: null }
  };

  /* Kategori 3 "Energy Sources": yenilenebilir ELEKTRİK hedefi (%), şebeke karışımı DAHİL */
  var RENEWABLE_ELECTRICITY = {
    2030: { mature: 100, developing: 50 },
    2035: { mature: 100, developing: 75 },
    2040: { mature: 100, developing: 100 },
    2050: { mature: 100, developing: 100 }
  };

  var CLASSES = [
    { id: 'og',     annualPct: 3, label: 'Eski baz yıl (2012 öncesi)' },
    { id: 'prior',  annualPct: 4, label: 'Önceki baz yıl (2012–2019)' },
    { id: 'recent', annualPct: 5, label: 'Yeni baz yıl (2020 ve sonrası)' }
  ];

  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function clamp(x, lo, hi) { return Math.min(Math.max(x, lo), hi); }

  function classOf(baseYear) {
    // null, '', true gibi değerler Number() ile 0 olur; bunlar "baz yıl girilmedi" sayılmalı
    var given = typeof baseYear === 'number' || (typeof baseYear === 'string' && baseYear.trim() !== '');
    var by = given ? Math.round(Number(baseYear)) : NaN;
    if (!isFinite(by)) { by = 2025; }
    var c = by < 2012 ? CLASSES[0] : (by <= 2019 ? CLASSES[1] : CLASSES[2]);
    return { id: c.id, annualPct: c.annualPct, label: c.label, baseYear: by };
  }

  /**
   * Y yıllık dönüm noktasında, test için gereken azaltım oranı (0–0,99).
   * @param {number} y         dönüm noktası yılı (2025/2030/…)
   * @param {number} baseYear  baz yıl
   * @param {'abs'|'int'} kind mutlak / yoğunluk ölçütü
   */
  function requiredReduction(y, baseYear, kind) {
    var by = classOf(baseYear).baseYear, rate = classOf(by).annualPct / 100;
    if (!(y > by)) { return 0; }
    if (y === 2050) { return 0.99; }
    var row = TABLE3[y]; if (!row) { return 0; }
    var pct = (kind === 'int' ? row.intPct : row.absPct) / 100;
    var table = by > TABLE_BASE_YEAR ? pct * (y - by) / (y - TABLE_BASE_YEAR) : pct;
    if (y <= 2030) {
      // 2030'a kadar: Tablo 3'ün doğrusal eşdeğeri ile açık pratik kuralın (baz değerin yılda %3/%4/%5'i)
      // DAHA SIKI olanı. 2019 baz yılında bu tam olarak yayımlanmış Tablo 3 rakamlarıdır (%25 / %45).
      var rot = clamp(rate * (y - by), 0, 0.99);
      return clamp(Math.max(rot, table), 0, 0.99);
    }
    var r30 = clamp(rate * Math.max(2030 - by, 0), 0, 0.99);
    return clamp(Math.max(r30, table), 0, 0.99);
  }

  /**
   * Dönüm noktaları (baz yıl noktası + Y > baz olan yardstick yılları).
   * @param {{baseYear:number, baseTco2e:number, areaM2:number}} p   baseTco2e: tesis (Kapsam 1+2) emisyonu
   * @returns {Array<object>}
   */
  function milestones(p) {
    p = p || {};
    var by = classOf(p.baseYear).baseYear;
    var base = isNum(p.baseTco2e) && p.baseTco2e > 0 ? p.baseTco2e : 0;
    var area = isNum(p.areaM2) && p.areaM2 > 0 ? p.areaM2 : 0;
    var out = [{
      year: by, kind: 'baseline', tests: [],
      allowedTco2e: base, strictTco2e: base, reductionPct: 0,
      levelKgPerM2: null, levelTco2e: null, offsetCapKgPerM2: null, offsetCapTco2e: null,
      energyEffPct: 0, renewableElectricityPct: null
    }];
    YARDSTICKS.forEach(function (y) {
      if (y <= by) { return; }
      var row = TABLE3[y];
      var tests = [];
      [['abs', 'Mutlak azaltım'], ['int', 'Yoğunluk azaltımı']].forEach(function (k) {
        var red = requiredReduction(y, by, k[0]);
        tests.push({ id: k[0], label: k[1], requiredReductionPct: red * 100, allowedTco2e: base * (1 - red) });
      });
      if (row.level !== null && area > 0) {
        var lvT = row.level * area / 1000;
        tests.push({ id: 'level', label: 'Seviye eşiği (' + row.level + ' kgCO₂e/m²)',
                     requiredReductionPct: base > 0 ? clamp((1 - lvT / base) * 100, 0, 100) : 0, allowedTco2e: lvT });
      }
      var allowed = 0, strict = Infinity;
      tests.forEach(function (t) { allowed = Math.max(allowed, t.allowedTco2e); strict = Math.min(strict, t.allowedTco2e); });
      allowed = Math.min(allowed, base);                       // hedef baz yılın üstüne çıkmaz
      strict = isFinite(strict) ? Math.min(strict, base) : base;
      out.push({
        year: y, kind: 'yardstick', tests: tests,
        allowedTco2e: allowed, strictTco2e: strict,
        reductionPct: base > 0 ? (1 - allowed / base) * 100 : 0,
        levelKgPerM2: row.level, levelTco2e: (row.level !== null && area > 0) ? row.level * area / 1000 : null,
        offsetCapKgPerM2: row.offsetCap, offsetCapTco2e: (row.offsetCap !== null && area > 0) ? row.offsetCap * area / 1000 : null,
        energyEffPct: row.energyEff, renewableElectricityPct: RENEWABLE_ELECTRICITY[y] || null
      });
    });
    return out;
  }

  /** Dönüm noktaları arasında doğrusal ara değer (hedef çizgisi) */
  function targetAt(ms, y, field) {
    field = field || 'allowedTco2e';
    if (!ms || !ms.length) { return NaN; }
    if (y <= ms[0].year) { return ms[0][field]; }
    for (var k = 1; k < ms.length; k++) {
      if (y <= ms[k].year) {
        var a = ms[k - 1], b = ms[k], f = (y - a.year) / ((b.year - a.year) || 1);
        return a[field] + (b[field] - a[field]) * f;
      }
    }
    return ms[ms.length - 1][field];
  }

  /** Plan çizgisi: başlangıç yılına kadar baz, bitiş yılında plan değeri, arası doğrusal */
  function planAt(baseT, planT, startYear, doneYear, y) {
    if (y <= startYear) { return baseT; }
    if (doneYear <= startYear || y >= doneYear) { return planT; }
    return baseT + (planT - baseT) * ((y - startYear) / (doneYear - startYear));
  }

  /**
   * Her dönüm noktasında plan ile hedefi karşılaştır.
   * @param {Array} ms  milestones()
   * @param {(y:number)=>number} plan  yıla göre plan emisyonu (tCO2e)
   */
  function evaluate(ms, plan) {
    return ms.filter(function (m) { return m.kind === 'yardstick'; }).map(function (m) {
      var p = plan(m.year), gap = Math.max(p - m.allowedTco2e, 0);
      var passed = testResults(m, p);
      return {
        year: m.year, targetTco2e: m.allowedTco2e, strictTco2e: m.strictTco2e, planTco2e: p, gapTco2e: gap,
        met: gap <= 1e-9, passedTests: passed, reductionPct: m.reductionPct,
        offsetCapTco2e: m.offsetCapTco2e
      };
    });
  }
  function testResults(m, planT) {
    return m.tests.map(function (t) { return { id: t.id, label: t.label, ok: planT <= t.allowedTco2e + 1e-9 }; });
  }

  /** Grafik için yıl dizileri */
  function series(ms, plan, fromYear, toYear) {
    var years = [], target = [], planArr = [];
    for (var y = fromYear; y <= toYear; y++) {
      years.push(y); target.push(targetAt(ms, y)); planArr.push(plan(y));
    }
    return { years: years, target: target, plan: planArr };
  }

  /** Eksen üst sınırı için "güzel" sayı */
  function niceMax(v) {
    if (!(v > 0)) { return 1; }
    var e = Math.pow(10, Math.floor(Math.log10(v))), n = v / e;
    var steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10], m = 10;
    for (var k = 0; k < steps.length; k++) { if (n <= steps[k]) { m = steps[k]; break; } }
    return m * e;
  }

  /** Kapsam 1 dengeleme üst sınırı (tCO2e): min(Kapsam 1 emisyonu, sınır kgCO2e/m² × alan) */
  function scope1OffsetAllowance(year, areaM2, scope1Tco2e) {
    var row = TABLE3[year]; if (!row || row.offsetCap === null || !(areaM2 > 0)) { return null; }
    return Math.min(Math.max(scope1Tco2e || 0, 0), row.offsetCap * areaM2 / 1000);
  }

  root.NZPATH = {
    version: '1.0.0',
    source: SOURCE,
    yardsticks: YARDSTICKS,
    table3: TABLE3,
    tableBaseYear: TABLE_BASE_YEAR,
    renewableElectricity: RENEWABLE_ELECTRICITY,
    classes: CLASSES,
    classOf: classOf,
    requiredReduction: requiredReduction,
    milestones: milestones,
    targetAt: targetAt,
    planAt: planAt,
    evaluate: evaluate,
    series: series,
    niceMax: niceMax,
    scope1OffsetAllowance: scope1OffsetAllowance
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
