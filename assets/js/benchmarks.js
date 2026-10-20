/* =========================================================================
   Kıyas verileri ve A-E notu  (assets/js/benchmarks.js)
   -------------------------------------------------------------------------
   Kaynak: Cornell Hotel Sustainability Benchmarking (CHSB) Index 2026,
   Türkiye satırları, 2024 takvim yılı verisi (yaklaşık 31.000 otel).
   Cornell eCommons: hdl.handle.net/1813/120192

   Değerler segmentteki tesislerin ORTALAMASIDIR (ortanca değil); her hücrenin
   arkasında 8-149 tesis vardır. Eski sayfadaki rakamlarla birebir aynıdır
   (proje belgesi: claude/otel-hcmi-modulu.md).

   Klasik betik: globalThis.BENCH atar. DOM'a bağımlı değildir.
   ========================================================================= */
(function (root) {
  'use strict';

  var SOURCE = {
    id: 'chsb-2026-tr',
    title: 'Cornell Hotel Sustainability Benchmarking (CHSB) Index 2026 — Türkiye',
    year: 2024,
    handle: 'hdl.handle.net/1813/120192',
    note: 'Segment ortalamaları; HCMI oda-gece (Measure1), toplantı (Measure7), karbon (Measure4), enerji (Measure6), su (Measure8), atık (Measure15).'
  };

  /* cpor  : kgCO2e / satılan oda-gece (HCMI)
     meet  : kgCO2e / m² · saat toplantı alanı (HCMI)
     co2m2 : kgCO2e / m² · yıl
     kwhm2 : kWh / m² · yıl
     water : litre / dolu oda-gece
     waste : kg / dolu oda   (null: CHSB'de satır yok)
     proxy : o segmentte satırı olmayan ölçüler başka segmentten alındıysa açıklama */
  var SEGMENTS = [
    { id: 'lux',     tr: 'Lüks (STR Luxury)',                    cpor: 59.6, meet: 0.0616, co2m2: 107.3, kwhm2: 335.4, water: 1353, waste: 6.1,  n: '11–30 tesis' },
    { id: 'resort5', tr: '5★ tatil köyü / resort',               cpor: 48.9, meet: 0.0480, co2m2: 103.5, kwhm2: 314.3, water: 970,  waste: 4.9,  n: '20 tesis (alan ölçüleri)',
      proxy: 'CHSB 2026\'da Türkiye için "Full Service Resort" segmentinde oda-gece, toplantı, su ve atık satırı yok; bu dört değer 5 yıldız ortalamasından alındı. Alan ve enerji yoğunluğu resort segmentinin kendi verisidir.' },
    { id: 's5',      tr: '5 yıldız',                             cpor: 48.9, meet: 0.0480, co2m2: 88.8,  kwhm2: 273.8, water: 970,  waste: 4.9,  n: '21–73 tesis' },
    { id: 's4',      tr: '4 yıldız',                             cpor: 37.9, meet: 0.0476, co2m2: 75.2,  kwhm2: 229.9, water: 553,  waste: 3.4,  n: '26–61 tesis' },
    { id: 's3',      tr: '3 yıldız',                             cpor: 25.4, meet: 0.0231, co2m2: 55.1,  kwhm2: 170.4, water: 527,  waste: null, n: '30–64 tesis' },
    { id: 'limited', tr: 'Apart / pansiyon / limited service',   cpor: 20.2, meet: 0.0220, co2m2: 47.3,  kwhm2: 143.9, water: 377,  waste: 1.6,  n: '25–50 tesis' }
  ];

  var byId = {};
  SEGMENTS.forEach(function (s) { byId[s.id] = s; });

  /* Acente sekmesindeki konaklama katsayıları (oda-gece başına kgCO2e) — aynı kaynak.
     Resort satırı yoktur: acentelerde 5 yıldız katsayısı kullanılır. */
  var AGENCY_SEGMENTS = [
    { id: 'lux',     tr: 'Lüks',             cpor: 59.6 },
    { id: 's5',      tr: '5 yıldız',         cpor: 48.9 },
    { id: 's4',      tr: '4 yıldız',         cpor: 37.9 },
    { id: 's3',      tr: '3 yıldız',         cpor: 25.4 },
    { id: 'limited', tr: 'Apart / pansiyon', cpor: 20.2 }
  ];

  /* 5 yıldızlı otellerde oda-gece emisyonu (kgCO2e) — CHSB 2026, ülke karşılaştırması */
  var FIVE_STAR_BY_COUNTRY = {
    'Fransa': 11.2, 'İspanya': 20.2, 'Birleşik Krallık': 20.7, 'Yunanistan': 23.8,
    'Almanya': 26.1, 'İtalya': 38.3, 'Türkiye': 48.9
  };

  /* Not, emisyonun segment referansına ORANIDIR: düşük oran = iyi. */
  var GRADES = [
    { letter: 'A', max: 0.60, tone: 'good',  label: 'referansın çok altında (öncü)' },
    { letter: 'B', max: 0.85, tone: 'brand', label: 'ortalamadan iyi' },
    { letter: 'C', max: 1.15, tone: 'warn',  label: 'ortalama bandında' },
    { letter: 'D', max: 1.50, tone: 'bad',   label: 'ortalamadan yüksek' },
    { letter: 'E', max: Infinity, tone: 'bad', label: 'azaltım önceliği yüksek' }
  ];

  function segment(id) { return byId[id] || null; }

  /** @param {number} ratio  hotel CPOR / referans CPOR */
  function grade(ratio) {
    if (typeof ratio !== 'number' || !isFinite(ratio) || ratio < 0) {
      return { letter: '—', tone: 'muted', label: 'veri bekleniyor', max: null };
    }
    for (var i = 0; i < GRADES.length; i++) {
      if (ratio <= GRADES[i].max) { return { letter: GRADES[i].letter, tone: GRADES[i].tone, label: GRADES[i].label, max: GRADES[i].max }; }
    }
    return { letter: 'E', tone: 'bad', label: GRADES[4].label, max: Infinity };
  }

  /**
   * Bir değeri referansla kıyasla.
   * @returns {{ratio:(number|null), deltaPct:(number|null), text:string, direction:('below'|'above'|'same'|null)}}
   *   "segment ortalamasında" = ±%3 bandı (eski sayfayla aynı kural)
   */
  function compare(value, ref) {
    if (typeof value !== 'number' || !isFinite(value) || typeof ref !== 'number' || !(ref > 0)) {
      return { ratio: null, deltaPct: null, text: '—', direction: null };
    }
    var ratio = value / ref, p = ratio - 1;
    if (Math.abs(p) < 0.03) { return { ratio: ratio, deltaPct: p * 100, text: 'segment ortalamasında', direction: 'same' }; }
    var pct = Math.round(Math.abs(p) * 100);
    return { ratio: ratio, deltaPct: p * 100, text: '%' + pct + (p < 0 ? ' altında' : ' üzerinde'), direction: p < 0 ? 'below' : 'above' };
  }

  /** CPOR için not: referans verilmezse segmentin CHSB değeri kullanılır. */
  function gradeFor(cpor, segmentId, customRef) {
    var seg = segment(segmentId);
    var ref = (typeof customRef === 'number' && customRef > 0) ? customRef : (seg ? seg.cpor : null);
    var ratio = (typeof cpor === 'number' && isFinite(cpor) && ref > 0) ? cpor / ref : null;
    return { ref: ref, ratio: ratio, grade: grade(ratio === null ? NaN : ratio) };
  }

  root.BENCH = {
    version: '1.0.0',
    source: SOURCE,
    segments: SEGMENTS,
    agencySegments: AGENCY_SEGMENTS,
    fiveStarByCountry: FIVE_STAR_BY_COUNTRY,
    grades: GRADES,
    segment: segment,
    grade: grade,
    compare: compare,
    gradeFor: gradeFor
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
