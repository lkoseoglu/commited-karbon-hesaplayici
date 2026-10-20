/* =========================================================================
   Turizm hesaplayıcısı — ACENTE / TUR OPERATÖRÜ hesabı  (assets/js/turizm/agency.js)
   -------------------------------------------------------------------------
   Eski sayfadaki acente hesabının birebir aynısıdır (sayılar değişmez):
     ulaşım  : yolcu-km × DEFRA 2025 faktörü (uçuşlarda ışınımsal etki dahil)
     konaklama: oda-gece × CPOR (CHSB 2026 Türkiye segment ortalaması ya da tedarikçinin kendi değeri)
     ofis    : kWh × Türkiye şebeke faktörü (ETKB, yayımlanmış en güncel yıl)
   Saf fonksiyon; DOM'a dokunmaz. Dışa: globalThis.TURIZM.agency
   ========================================================================= */
(function (root) {
  'use strict';

  var NS = root.TURIZM = root.TURIZM || {};

  // kgCO2e / birim — DEFRA 2025 (eski sayfayla aynı)
  var EF = {
    icucus: 0.246,     // iç hat uçuş, yolcu-km (RF dahil)
    kisadis: 0.154,    // dış hat kısa (<3.700 km), yolcu-km
    uzundis: 0.191,    // dış hat uzun, yolcu-km
    otobus: 0.027,     // otobüs / karayolu tur, yolcu-km
    transfer: 0.17,    // transfer aracı, araç-km
    treeKgPerYear: 25  // 1 ağacın yıllık yaklaşık emilimi (bilgilendirme)
  };
  var LABELS = {
    icucus: 'İç hat uçuş', kisadis: 'Dış hat kısa', uzundis: 'Dış hat uzun', otobus: 'Otobüs / tur',
    transfer: 'Transfer', stay: 'Konaklama', office: 'Ofis'
  };
  var SEG_TR = { lux: 'Lüks', s5: '5 yıldız', s4: '4 yıldız', s3: '3 yıldız', limited: 'Apart / pansiyon' };

  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function p0(x) { return isNum(x) && x > 0 ? x : 0; }        // eski sayfa: yalnız pozitif değerler sayılır

  function officeEf() {
    return root.TR_REFERENCE ? root.TR_REFERENCE.gridFactor(null).value : 0.469;
  }

  /** Konaklama satırı: tek katsayı ya da segmentlere dağıtılmış tablo */
  function stay(a) {
    if (!a.split) {
      var n = p0(a.gece), c = p0(a.cpor);
      return { kg: n * c, nights: n, cpor: c, split: false, rows: [] };
    }
    var tn = 0, tkg = 0, rows = [];
    NS.model.AGENCY_SEG_IDS.forEach(function (k) {
      var r = a.splitRows[k] || {}, n2 = p0(r.n), c2 = p0(r.c), kg = n2 * c2;
      tn += n2; tkg += kg;
      rows.push({ id: k, tr: SEG_TR[k], n: n2, c: c2, kg: kg });
    });
    return { kg: tkg, nights: tn, cpor: tn > 0 ? tkg / tn : 0, split: true, rows: rows };
  }

  /**
   * @param {object} a  durumdaki agency nesnesi (model.js)
   * @returns {{totalKg, totalT, perGuestKg, perTourT, trees, parts:[{id,label,kg}], stay, factors, started}}
   */
  function compute(a) {
    var st = stay(a), eo = officeEf();
    var parts = [
      { id: 'icucus', kg: p0(a.icucus) * EF.icucus },
      { id: 'kisadis', kg: p0(a.kisadis) * EF.kisadis },
      { id: 'uzundis', kg: p0(a.uzundis) * EF.uzundis },
      { id: 'otobus', kg: p0(a.otobus) * EF.otobus },
      { id: 'transfer', kg: p0(a.transfer) * EF.transfer },
      { id: 'stay', kg: st.kg },
      { id: 'office', kg: p0(a.ofis) * eo }
    ];
    var kg = 0;
    parts.forEach(function (p) { p.label = LABELS[p.id]; kg += p.kg; });
    return {
      started: !NS.model.agencyIsEmpty(a),
      totalKg: kg, totalT: kg / 1000,
      perGuestKg: p0(a.yolcu) > 0 ? kg / a.yolcu : null,
      perTourT: p0(a.paket) > 0 ? kg / 1000 / a.paket : null,
      trees: Math.round(kg / EF.treeKgPerYear),
      parts: parts, stay: st,
      factors: { icucus: EF.icucus, kisadis: EF.kisadis, uzundis: EF.uzundis, otobus: EF.otobus, transfer: EF.transfer, officeKwh: eo, tree: EF.treeKgPerYear }
    };
  }

  NS.agency = { compute: compute, EF: EF, LABELS: LABELS, SEG_TR: SEG_TR };
})(typeof globalThis !== 'undefined' ? globalThis : self);
