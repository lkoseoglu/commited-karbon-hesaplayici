/* =========================================================================
   Azaltım önlemleri simülatörü  (assets/js/measures.js)
   -------------------------------------------------------------------------
   13 önlemin etkisini HCMI girdisine uygular; sonucu HCMI motoru (hcmi-engine.js)
   hesaplar. Böylece "önce" ve "sonra" aynı resmî yöntemle hesaplanır.

   KATSAYILAR (COEF) eski sayfadaki sektör ortalaması göstergelerle AYNIDIR ve
   bağlayıcı değildir (gerçek rakam için enerji etüdü gerekir). Yatırım tutarları
   oda sayısı / alanla ölçeklenen gösterge değerlerdir (TL, 2026 başı varsayımı).
   Hepsi tek yerde (COEF ve DEFAULTS) durur: yazılım ekibi buradan ayarlar.

   Önlemler eski sayfadaki SIRAYLA uygulanır (etkileşim hesaba girer):
     led, keycard, bms, hr, water, linen, st, hp, waste, refrig, ev, pv, green

   Eski sayfadan bilinçli farklar:
     • "Isıtma yakıtı" yalnız doğal gaz değil; kalorifer yakıtları (fuel-oil 1-6),
       kerosen ve LNG de dahildir. LPG/propan/bütan mutfakta yakıldığı için
       varsayılan olarak dışarıda; satırda heating:true ile açılır.
     • Çatı GES üretimi şebeke alımından düşülür VE ayrı bir "Onsite Renewable"
       satırı olarak eklenir (yenilenebilir pay HCMI'ya göre görünsün).
     • YEK-G primi yalnız yeni alınan sertifika miktarına uygulanır.

   Ön koşul: hcmi-data.js (HCMI_DATA). Hesap motoru dışarıdan verilir (calc), böylece
   bu modül motorun kendisine doğrudan bağımlı değildir.
   Klasik betik: globalThis.MEASURES atar. DOM'a bağımlı değildir.
   ========================================================================= */
(function (root) {
  'use strict';

  /* ---------------------------------------------------------------- katsayılar */
  var COEF = {
    led:     { lightingShare: 0.12, lightingSaving: 0.55, capexPerRoom: 2500 },   // aydınlatma elektriğin %12'si, LED+kontrol %55 tasarruf
    keycard: { elecSaving: 0.07, capexPerRoom: 6000 },
    bms:     { elecSaving: 0.09, heatSaving: 0.06, capexPerM2: 300 },
    hr:      { elecSaving: 0.02, heatSaving: 0.10, capexPerM2: 180 },
    water:   { waterSaving: 0.25, heatSaving: 0.08, capexPerRoom: 3200 },
    linen:   { laundrySaving: 0.12, waterSaving: 0.06, capexPerRoom: 1200 },
    st:      { heatSaving: 0.25, capexPerRoom: 5000 },
    hp:      { share: 0.45, cop: 3.2, capexPerRoom: 9000 },                       // yakıtın %45'i elektriğe, COP 3,2
    waste:   { shiftShare: 0.55, capexFixed: 120000, capexPerRoom: 300 },         // depolamadan geri dönüşüme kayan pay
    refrig:  { leakCut: 0.55, capexFixed: 180000 },
    ev:      { share: 0.70, energyRatio: 0.30, litresPerVehicleYear: 3000, capexPerVehicle: 1400000 },
    pv:      { yieldKwhPerKwp: 1550, capexPerKwp: 16000 },                        // Türkiye ortalaması
    green:   { premiumTlPerKwh: 0.12 }                                            // YEK-G / I-REC sertifika primi
  };

  var DEFAULTS = {
    refrigerantPriceTlPerKg: 1200,   // TL/kg soğutucu gaz
    lifetimeYears: 10                // karbon maliyetini yıllıklandırma ömrü (MACC)
  };

  // HCMI dışı kalemler (su, atık) — eski sayfadaki DEFRA tabanlı katsayılar (kgCO2e)
  var EXTRAS_EF = { waterKgPerM3: 0.41, landfillKgPerT: 446, recycleKgPerT: 21 };

  // Isıtma / sıcak su önlemlerinin etkilediği yakıtlar (varsayılan). Satırda heating:true|false ile değişir.
  var HEATING_DEFAULT = ['natural_gas', 'lng', 'fuel_oil_1', 'fuel_oil_2', 'fuel_oil_4', 'fuel_oil_5', 'fuel_oil_6', 'kerosene'];
  var MOBILE_FUEL_IDS = ['diesel_mob', 'gasoline_mob', 'gasoline_bio'];
  var SQFT_TO_SQM = 0.09290304;

  var LIST = [
    { id: 'led',     group: 'verimlilik',    tr: 'LED dönüşümü ve aydınlatma kontrolü',
      note: 'Aydınlatma otel elektriğinin yaklaşık %12\'sidir; LED ve kontrolle bunun %55\'i tasarruf edilir.' },
    { id: 'keycard', group: 'verimlilik',    tr: 'Oda enerji otomasyonu',
      note: 'Anahtar kart / varlık sensörüyle boş odada klima ve aydınlatma kesilir; elektrik %7 düşer.' },
    { id: 'bms',     group: 'verimlilik',    tr: 'BMS kurulumu ve HVAC devreye alma',
      note: 'Set değerleri, çalışma saatleri ve havalandırma debilerinin optimizasyonu; elektrik %9, ısıtma yakıtı %6 düşer.' },
    { id: 'hr',      group: 'verimlilik',    tr: 'Isı geri kazanım',
      note: 'Atık su ve havalandırma egzozundan ön ısıtma; elektrik %2, ısıtma yakıtı %10 düşer.' },
    { id: 'pv',      group: 'yenilenebilir', tr: 'Çatı GES',
      note: 'Öz tüketim; üretim şebeke elektriğinden düşer (Türkiye ortalaması 1.550 kWh/kWp/yıl).' },
    { id: 'hp',      group: 'yenilenebilir', tr: 'Sıcak su için ısı pompası',
      note: 'Isıtma yakıtının %45\'i elektriğe döner (COP 3,2). Türkiye şebeke faktörüyle net kazanç sınırlıdır; GES veya YEK-G ile birlikte belirgin büyür.' },
    { id: 'st',      group: 'yenilenebilir', tr: 'Güneş kollektörü (termal)',
      note: 'Termal sistemle sıcak su ön ısıtma; ısıtma yakıtı %25 düşer.' },
    { id: 'green',   group: 'yenilenebilir', tr: 'YEK-G / I-REC yenilenebilir elektrik belgesi',
      note: 'Fiziksel tüketim değişmez, yalnızca piyasa bazlı Kapsam 2 sıfırlanır. Verimlilik önlemlerinin yerine değil, onlardan sonra uygulanır. Sertifika primi işletme maliyetidir.' },
    { id: 'ev',      group: 'ulaşım',        tr: 'Elektrikli servis araçları',
      note: 'Araç yakıtının %70\'i elektriğe döner; yatırım, yılda 3.000 litre yakıtın yerini alan araç başına hesaplanır.' },
    { id: 'water',   group: 'su-atık-gaz',   tr: 'Verimli su armatürleri',
      note: 'Musluk ≤6 L/dk, duş ≤8 L/dk; su %25, sıcak su ısıtma yakıtı %8 düşer.' },
    { id: 'linen',   group: 'su-atık-gaz',   tr: 'Havlu / çarşaf programı',
      note: 'Misafir onaylı değişim ve verimli yıkama çevrimiyle dış çamaşırhane hacmi %12, su %6 düşer.' },
    { id: 'waste',   group: 'su-atık-gaz',   tr: 'Kaynakta ayrıştırma ve kompost',
      note: 'Depolamaya giden atığın %55\'i geri dönüşüme ve komposta kayar.' },
    { id: 'refrig',  group: 'su-atık-gaz',   tr: 'Soğutucu gaz kaçak yönetimi',
      note: 'Kaçak %55 azalır. Soğutucu gaz miktarı elle girilmişse hesaplanır; "tahmin et" seçiliyse etkisi ayrı gösterilemez.' }
  ];
  var ORDER = ['led', 'keycard', 'bms', 'hr', 'water', 'linen', 'st', 'hp', 'waste', 'refrig', 'ev', 'pv', 'green'];

  /* ---------------------------------------------------------------- yardımcılar */
  function num(x) { return typeof x === 'number' && isFinite(x) ? x : 0; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function merge(a, b) {
    var o = {}, k;
    for (k in a) { if (Object.prototype.hasOwnProperty.call(a, k)) { o[k] = a[k]; } }
    for (k in (b || {})) { if (Object.prototype.hasOwnProperty.call(b, k) && b[k] !== undefined && b[k] !== null) { o[k] = b[k]; } }
    return o;
  }
  /** COEF'i params.coef ile (iki düzeyli) birleştir */
  function coefOf(params) {
    var out = {}, k, over = (params && params.coef) || {};
    for (k in COEF) { if (Object.prototype.hasOwnProperty.call(COEF, k)) { out[k] = merge(COEF[k], over[k]); } }
    return out;
  }

  function dataIndex() {
    var D = root.HCMI_DATA; if (!D) { throw new Error('HCMI_DATA yüklenmemiş.'); }
    var byId = {}, byName = {};
    D.energyTypes.forEach(function (t) { byId[t.id] = t; byName[t.name] = t; });
    return { D: D, byId: byId, byName: byName };
  }

  /** Satırın kWh değeri */
  function rowKwh(ix, r) {
    var t = ix.byName[r.type]; if (!t) { return 0; }
    var f = t.kwhPerUnit[r.unit]; return f === undefined ? 0 : num(r.total) * f;
  }
  function findRow(ix, inp, typeId) {
    var t = ix.byId[typeId]; if (!t) { return null; }
    for (var i = 0; i < inp.energy.length; i++) { if (inp.energy[i].type === t.name) { return inp.energy[i]; } }
    return null;
  }
  function ensureRow(ix, inp, typeId, unit) {
    var r = findRow(ix, inp, typeId); if (r) { return r; }
    var t = ix.byId[typeId];
    r = { type: t.name, unit: unit || t.defaultUnit, total: 0, privateActual: 0, efMode: 'default', manualEf: null, planAdded: true };
    inp.energy.push(r); return r;
  }
  /** Satıra kWh ekle / çıkar (satırın kendi birimine çevirerek); sonuç sıfırın altına inmez */
  function addKwh(ix, row, kwh) {
    var t = ix.byName[row.type], f = t && t.kwhPerUnit[row.unit];
    if (!f) { return; }
    row.total = Math.max(num(row.total) + kwh / f, 0);
  }
  function isHeating(ix, r) {
    var t = ix.byName[r.type]; if (!t) { return false; }
    if (r.heating === true) { return true; }
    if (r.heating === false) { return false; }
    return HEATING_DEFAULT.indexOf(t.id) >= 0;
  }

  function laundryKg(ix, inp) {
    var L = inp.laundry; if (!L || !L.outsourced || L.shareKnown) { return 0; }
    var t;
    if (L.tonnageKnown) { t = num(L.tonnage) * (L.tonnageUnit === 'US ton' ? ix.D.laundry.usTonToMetricTonne : 1); }
    else { t = num(inp.hotel && inp.hotel.occupiedRooms) * ix.D.laundry.tonnePerOccupiedRoom; }
    return t * 1000;
  }
  function refrigerantKg(inp) {
    var s = 0, a = inp.refrigerantAmountsKg || {};
    Object.keys(a).forEach(function (k) { s += num(a[k]); });
    return s;
  }

  /** Yatırım ölçeği için oda sayısı ve alan (m²). base.facility verilmişse o, yoksa HCMI girdisinden. */
  function facilityOf(base) {
    var h = (base.input && base.input.hotel) || {}, f = base.facility || {};
    var k = h.areaUnit === 'sqft' ? SQFT_TO_SQM : 1;
    var fromHotel = (num(h.conditionedArea) > 0 ? num(h.conditionedArea) : num(h.roomsArea) + num(h.meetingArea)) * k;
    return { rooms: num(f.rooms) > 0 ? num(f.rooms) : num(h.rooms), areaM2: num(f.areaM2) > 0 ? num(f.areaM2) : fromHotel };
  }

  /* ---------------------------------------------------------------- uygulama */
  /**
   * Önlemleri tabana uygula.
   * @param {object} base    { input (HCMI girdisi; energy satırlarında isteğe bağlı price [TL/satır birimi], heating),
   *                           extras:{waterM3, wasteLandfillT, wasteRecycledT},
   *                           facility:{rooms, areaM2}  (yoksa HCMI girdisinden),
   *                           pv:{kwp, costTlPerKwp?},  prices:{waterTlPerM3, laundryTlPerKg} }
   * @param {string[]} ids   uygulanacak önlem kimlikleri (sıra ORDER'a göre belirlenir)
   * @param {object} [params] { refrigerantPriceTlPerKg, lifetimeYears, coef:{<önlem>:{<katsayı>:değer}} }
   * @returns {{input, extras, applied, notes, capexTl, opexTl, savingsTl, netSavingsTl}}
   *   applied: gerçekten etki üreten önlemler; notes: uygulanamayan / sınırlı olanların nedeni
   */
  function apply(base, ids, params) {
    var ix = dataIndex(), P = merge(DEFAULTS, params), C = coefOf(params);
    var sel = {}; (ids || []).forEach(function (k) { sel[k] = true; });
    var inp = clone(base.input);
    inp.energy = (inp.energy || []).filter(function (r) { return r && r.type; });
    inp.marketPurchases = inp.marketPurchases || [];
    inp.refrigerantAmountsKg = inp.refrigerantAmountsKg || {};
    var ex = merge({ waterM3: 0, wasteLandfillT: 0, wasteRecycledT: 0 }, base.extras);
    var fac = facilityOf(base);
    var prices = merge({ waterTlPerM3: 0, laundryTlPerKg: 0 }, base.prices);
    var rooms = fac.rooms, A = fac.areaM2;
    var capex = 0, opex = 0, notes = [], applied = [];

    // "önce" değerleri (TL tasarrufu için)
    var before = {
      rows: inp.energy.map(function (r) { return { type: r.type, total: num(r.total), price: num(r.price) }; }),
      waterM3: num(ex.waterM3), laundryKg: laundryKg(ix, inp), refKg: refrigerantKg(inp)
    };

    function grid() { return findRow(ix, inp, 'grid'); }
    // Yüzde azaltımlar satırın özel alan payını da orantılı küçültür (HCMI: özel alan > toplam hatadır)
    function scaleRows(filter, mult) {
      inp.energy.forEach(function (r) {
        if (filter(r)) { r.total = num(r.total) * mult; r.privateActual = num(r.privateActual) * mult; }
      });
    }
    function heatingFilter(r) { return isHeating(ix, r); }
    function scaleGrid(mult) { var g = grid(); scaleRows(function (r) { return r === g; }, mult); }
    function scaleLaundry(mult) {
      var L = inp.laundry; if (!L || !L.outsourced) { return false; }
      if (L.shareKnown) { (L.items || []).forEach(function (it) { it.total = num(it.total) * mult; }); return true; }
      var tonne;
      if (L.tonnageKnown) {
        tonne = num(L.tonnage) * (L.tonnageUnit === 'US ton' ? ix.D.laundry.usTonToMetricTonne : 1);
      } else { tonne = num(inp.hotel && inp.hotel.occupiedRooms) * ix.D.laundry.tonnePerOccupiedRoom; }
      L.tonnageKnown = true; L.tonnage = tonne * mult; L.tonnageUnit = 'Metric Tonne';
      return true;
    }
    function skip(id, text) { notes.push({ id: id, text: text }); }

    ORDER.forEach(function (k) {
      if (!sel[k]) { return; }
      var c = C[k], done = true;
      switch (k) {
        case 'led':
          scaleGrid(1 - c.lightingShare * c.lightingSaving); capex += rooms * c.capexPerRoom; break;
        case 'keycard':
          scaleGrid(1 - c.elecSaving); capex += rooms * c.capexPerRoom; break;
        case 'bms':
          scaleGrid(1 - c.elecSaving); scaleRows(heatingFilter, 1 - c.heatSaving); capex += A * c.capexPerM2; break;
        case 'hr':
          scaleGrid(1 - c.elecSaving); scaleRows(heatingFilter, 1 - c.heatSaving); capex += A * c.capexPerM2; break;
        case 'water':
          ex.waterM3 = num(ex.waterM3) * (1 - c.waterSaving); scaleRows(heatingFilter, 1 - c.heatSaving);
          capex += rooms * c.capexPerRoom; break;
        case 'linen':
          if (!scaleLaundry(1 - c.laundrySaving)) {
            skip(k, 'Dış çamaşırhane kullanılmadığı için havlu/çarşaf programının karbon etkisi yok; yalnız su etkisi uygulandı.');
          }
          ex.waterM3 = num(ex.waterM3) * (1 - c.waterSaving); capex += rooms * c.capexPerRoom; break;
        case 'st':
          scaleRows(heatingFilter, 1 - c.heatSaving); capex += rooms * c.capexPerRoom; break;
        case 'hp': {
          var fuelKwh = 0;
          inp.energy.forEach(function (r) { if (heatingFilter(r)) { fuelKwh += rowKwh(ix, r); } });
          if (fuelKwh <= 0) { skip(k, 'Isıtma yakıtı girilmediği için ısı pompası etkisi hesaplanamadı.'); done = false; break; }
          scaleRows(heatingFilter, 1 - c.share);
          addKwh(ix, ensureRow(ix, inp, 'grid', 'kWh'), fuelKwh * c.share / c.cop);
          capex += rooms * c.capexPerRoom; break;
        }
        case 'waste': {
          var shifted = num(ex.wasteLandfillT) * c.shiftShare;
          if (shifted <= 0) { skip(k, 'Depolanan atık miktarı girilmediği için atık önleminin etkisi hesaplanamadı.'); done = false; break; }
          ex.wasteLandfillT = num(ex.wasteLandfillT) - shifted; ex.wasteRecycledT = num(ex.wasteRecycledT) + shifted;
          capex += c.capexFixed + rooms * c.capexPerRoom; break;
        }
        case 'refrig':
          if ((inp.supplementary || {}).refrigerants !== 'manual' || refrigerantKg(inp) <= 0) {
            skip(k, 'Soğutucu gaz miktarı elle girilmediği için kaçak azaltımının karbon etkisi hesaplanamadı.'); done = false; break;
          }
          Object.keys(inp.refrigerantAmountsKg).forEach(function (id) { inp.refrigerantAmountsKg[id] = num(inp.refrigerantAmountsKg[id]) * (1 - c.leakCut); });
          capex += c.capexFixed; break;
        case 'ev': {
          var savedKwh = 0, savedL = 0;
          inp.energy.forEach(function (r) {
            var t = ix.byName[r.type];
            if (!t || MOBILE_FUEL_IDS.indexOf(t.id) < 0) { return; }
            var cut = rowKwh(ix, r) * c.share, perL = t.kwhPerUnit.L;
            savedKwh += cut; if (perL) { savedL += cut / perL; }
            r.total = num(r.total) * (1 - c.share); r.privateActual = num(r.privateActual) * (1 - c.share);
          });
          if (savedKwh <= 0) { skip(k, 'Araç yakıtı girilmediği için elektrikli araç etkisi hesaplanamadı.'); done = false; break; }
          addKwh(ix, ensureRow(ix, inp, 'grid', 'kWh'), savedKwh * c.energyRatio);
          capex += c.capexPerVehicle * Math.max(1, Math.ceil(savedL / c.litresPerVehicleYear)); break;
        }
        case 'pv': {
          var kwp = num(base.pv && base.pv.kwp);
          var costKwp = (base.pv && num(base.pv.costTlPerKwp) > 0) ? num(base.pv.costTlPerKwp) : c.capexPerKwp;
          if (kwp <= 0) { skip(k, 'GES kurulu gücü girilmediği için çatı GES etkisi hesaplanamadı.'); done = false; break; }
          var gen = kwp * c.yieldKwhPerKwp, g = grid(), gk = g ? rowKwh(ix, g) : 0, used = Math.min(gen, gk);
          if (used <= 0) { skip(k, 'Şebeke elektriği girilmediği için çatı GES etkisi hesaplanamadı.'); done = false; break; }
          addKwh(ix, g, -used);
          addKwh(ix, ensureRow(ix, inp, 'onsite_renew', 'kWh'), used);
          if (gen > gk) { skip(k, 'GES üretimi şebeke tüketimini aşıyor; fazlası hesaba katılmadı (öz tüketim varsayımı).'); }
          capex += kwp * costKwp; break;
        }
        case 'green': {
          var g2 = grid(), remaining = g2 ? rowKwh(ix, g2) : 0;
          if (remaining <= 0) { skip(k, 'Şebeke elektriği girilmediği için YEK-G / I-REC etkisi hesaplanamadı.'); done = false; break; }
          var existing = 0; inp.marketPurchases.forEach(function (m) { existing += num(m && m.kwh); });
          inp.marketPurchases = [{ description: 'YEK-G / I-REC (plan)', kwh: remaining }];
          opex += Math.max(remaining - existing, 0) * c.premiumTlPerKwh; break;
        }
      }
      if (done) { applied.push(k); }
    });

    // Özel alan tüketimi hiçbir satırda toplamı aşmasın (PV / dönüşüm sonrası da geçerli girdi kalsın)
    inp.energy.forEach(function (r) { r.privateActual = Math.min(num(r.privateActual), num(r.total)); });

    // ---- TL tasarrufu: satır fiyatı × azalan miktar
    var savings = 0;
    inp.energy.forEach(function (r) {
      var b = before.rows.filter(function (x) { return x.type === r.type; })[0];
      var price = num(r.price) || (b ? b.price : 0);
      savings += ((b ? b.total : 0) - num(r.total)) * price;
    });
    savings += (before.waterM3 - num(ex.waterM3)) * num(prices.waterTlPerM3);
    savings += (before.laundryKg - laundryKg(ix, inp)) * num(prices.laundryTlPerKg);
    savings += (before.refKg - refrigerantKg(inp)) * P.refrigerantPriceTlPerKg;

    return {
      input: inp, extras: ex, applied: applied, notes: notes,
      capexTl: capex, opexTl: opex, savingsTl: savings, netSavingsTl: savings - opex
    };
  }

  /** HCMI dışı kalemler (su, atık) — tCO2e */
  function extrasTco2e(extras) {
    var e = extras || {};
    return (num(e.waterM3) * EXTRAS_EF.waterKgPerM3 + num(e.wasteLandfillT) * EXTRAS_EF.landfillKgPerT
            + num(e.wasteRecycledT) * EXTRAS_EF.recycleKgPerT) / 1000;
  }

  function usable(r) { return !!(r && r.valid && !r.incomplete && r.total && typeof r.total.tco2e === 'number' && isFinite(r.total.tco2e)); }

  function evalWith(before, base, ids, calc, params, calcOptions) {
    var plan = apply(base, ids, params), after = calc(plan.input, calcOptions);
    var ok = usable(before) && usable(after);
    var bT = ok ? before.total.tco2e : null, aT = ok ? after.total.tco2e : null;
    var bX = extrasTco2e(base.extras), aX = extrasTco2e(plan.extras);
    return {
      valid: ok,
      before: before, after: after,
      beforeTco2e: bT, afterTco2e: aT,
      reductionTco2e: ok ? bT - aT : null,
      reductionFullTco2e: ok ? (bT + bX) - (aT + aX) : null,   // su + atık dahil tam envanter
      capexTl: plan.capexTl, opexTl: plan.opexTl, savingsTl: plan.savingsTl, netSavingsTl: plan.netSavingsTl,
      paybackYears: plan.netSavingsTl > 0 ? plan.capexTl / plan.netSavingsTl : null,
      applied: plan.applied, notes: plan.notes, input: plan.input, extras: plan.extras
    };
  }

  /**
   * Önlem(ler)i uygula ve HCMI ile hesapla.
   * @param {Function} calc  HCMI.calculate(input, options) — sonucu döndürür
   * @param {object} [calcOptions]  motora iletilir (örn. { efOverrides: TR_REFERENCE.efOverrides(2025) })
   * @returns {{valid, before, after, beforeTco2e, afterTco2e, reductionTco2e, reductionFullTco2e,
   *            capexTl, opexTl, savingsTl, netSavingsTl, paybackYears, applied, notes, input, extras}}
   *   valid=false: girdi eksik / hatalı (HCMI sonucu geçersiz); azaltım değerleri null olur.
   */
  function evaluate(base, ids, calc, params, calcOptions) {
    return evalWith(calc(base.input, calcOptions), base, ids, calc, params, calcOptions);
  }

  /**
   * Her önlemi TEK BAŞINA değerlendir ve karbon maliyetine göre sırala (MACC).
   * costTlPerTco2e = yatırım/(azaltım × ömür) − net yıllık tasarruf/azaltım ; negatif = kendini amorti eder.
   * Satırların toplamı, önlemler birbirini etkilediği için senaryo toplamından farklıdır.
   */
  function ranking(base, calc, params, calcOptions) {
    var P = merge(DEFAULTS, params), b = calc(base.input, calcOptions);
    return LIST.map(function (m) {
      var r = evalWith(b, base, [m.id], calc, params, calcOptions);
      var red = r.reductionFullTco2e;
      var has = r.valid && red > 1e-9;
      return {
        id: m.id, tr: m.tr, group: m.group, applied: r.applied.indexOf(m.id) >= 0, notes: r.notes,
        reductionTco2e: r.reductionTco2e, reductionFullTco2e: red,
        capexTl: r.capexTl, netSavingsTl: r.netSavingsTl, paybackYears: r.paybackYears,
        costTlPerTco2e: has ? r.capexTl / (red * P.lifetimeYears) - r.netSavingsTl / red : null
      };
    }).sort(function (a, c) {
      var ca = a.costTlPerTco2e === null ? Infinity : a.costTlPerTco2e;
      var cc = c.costTlPerTco2e === null ? Infinity : c.costTlPerTco2e;
      return ca === cc ? 0 : (ca < cc ? -1 : 1);
    });
  }

  root.MEASURES = {
    version: '1.0.0',
    coef: COEF,
    defaults: DEFAULTS,
    extrasEf: EXTRAS_EF,
    heatingDefault: HEATING_DEFAULT,
    list: LIST,
    order: ORDER,
    facility: facilityOf,
    apply: apply,
    evaluate: evaluate,
    ranking: ranking,
    extrasTco2e: extrasTco2e
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
