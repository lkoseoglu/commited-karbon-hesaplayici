/* =========================================================================
   HCMI v2.0 hesap motoru  (assets/js/hcmi-engine.js)
   -------------------------------------------------------------------------
   Resmî "HCMI v2.0 Tool.xlsx" dosyasındaki hesabın JavaScript karşılığıdır.
   Arayüzden ve tarayıcıdan bağımsızdır: saf fonksiyonlar, DOM yok.

   Ön koşul : assets/js/hcmi-data.js önce yüklenmiş olmalı (HCMI_DATA).
   Dışa     : globalThis.HCMI

   DOĞRULUK : tests/unit/hcmi-engine.test.mjs, resmî Excel'in LibreOffice ile
              yeniden hesaplanmış çıktısından üretilen altın referansla
              (tests/golden/hcmi-oracle.json) karşılaştırır. Resmî örnek dosya
              toplamı: 981,4313816617498 tCO2e.

   EXCEL'DEN BİLİNÇLİ SAPMALAR (sonuçta `warnings` / `errors` ile görünür):
     1. Faktörü olmayan (boş) hücreler Excel'de sessizce 0 sayılır; burada
        "faktör yok" hatasıdır (satır emisyonu hesaplanmaz, sonuç `incomplete`).
     2. Birim, enerji türü için tanımlı değilse Excel 0 kWh sayar; burada hatadır.
     3. Aynı enerji türü iki satırda olamaz (Excel'de çamaşırhane payı iki kez eklenirdi).
     4. Dış çamaşırhane ana anahtarı "1. Hotel Details" H34'tür (Excel'de Tab A!H14
        de etkiliydi; tutarsız bir yapıydı).
     5. Çamaşırhane payının düşeceği enerji satırı girdide yoksa, Excel'in hazır
        satırları (Şebeke / Doğal gaz / Fuel Oil 2) gibi sıfır tüketimli satır
        kendiliğinden eklenir (`autoAdded`). Excel'de bu satırlar şablonda hazırdır.
     6. Kapsam 2'ye PPA elektriği de dahildir (`scopes.scope2Tco2e`). Resmî aracın
        sınıflandırması (PPA'nın Kapsam 1'e düşmesi) `parity` alanında durur.
   ========================================================================= */
(function (root) {
  'use strict';

  var D = root.HCMI_DATA;
  if (!D) { throw new Error('HCMI_DATA yüklenmemiş: önce assets/js/hcmi-data.js yükleyin.'); }

  var VERSION = '1.0.0';

  // ------------------------------------------------------------ sabit adlar
  var GRID = 'Purchased Electricity (Grid)', PPA = 'Purchased Electricity (PPA)', ONSITE = 'Onsite Renewable Energy';
  var STEAM = 'Purchased Steam', HOTW = 'Purchased Hot Water', CHILLED = 'Purchased Chilled Water';
  var GAS = 'Natural Gas', FO2 = 'Fuel Oil 2';
  var PRESET_ROWS = [GRID, GAS, FO2];                      // Excel şablonundaki hazır satırlar
  var SCOPE2_OFFICIAL = set([GRID, STEAM, HOTW, CHILLED]);  // resmî H61
  var SCOPE2_HEADLINE = set([GRID, STEAM, HOTW, CHILLED, PPA]);

  function set(list) { var o = {}; list.forEach(function (k) { o[k] = 1; }); return o; }
  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function n0(x) { return isNum(x) ? x : 0; }
  function has(x) { return x !== undefined && x !== null && x !== ''; }
  function push(list, code, text, path, extra) {
    var o = { code: code, message: text, path: path || '' };
    if (extra) { for (var k in extra) { o[k] = extra[k]; } }
    list.push(o);
  }

  // ------------------------------------------------------------ veri dizinleri
  var typeByName = {}, typeById = {}, unitByAbb = {}, regionByKey = {};
  D.energyTypes.forEach(function (t, i) { t.index = i; typeByName[t.name] = t; typeById[t.id] = t; });
  D.units.forEach(function (u) { unitByAbb[u.abb] = u; });
  D.regions.forEach(function (r) { regionByKey[r.c + '|' + r.r] = r; });

  // ------------------------------------------------------------ veri erişimi
  function countries() {
    var map = {}, out = [];
    D.regions.forEach(function (r) {
      if (!map[r.c]) { map[r.c] = { country: r.c, regions: [], hasGridFactor: false }; out.push(map[r.c]); }
      map[r.c].regions.push(r.r);
      if (r.g !== null) { map[r.c].hasGridFactor = true; }
    });
    return out;
  }

  function unitsFor(typeName) {
    var t = typeByName[typeName]; if (!t) { return []; }
    return D.units.filter(function (u) { return t.kwhPerUnit[u.abb] !== undefined; })
      .map(function (u) { return { abb: u.abb, tr: u.tr, name: u.name, cat: u.cat, kwhPerUnit: t.kwhPerUnit[u.abb] }; });
  }

  function energyTypes() {
    return D.energyTypes.map(function (t) {
      return { id: t.id, name: t.name, tr: t.tr, group: t.group, stationary: t.stationary,
               defaultUnit: t.defaultUnit, units: unitsFor(t.name) };
    });
  }

  function toKwh(typeName, unit, amount) {
    var t = typeByName[typeName]; if (!t) { return NaN; }
    var f = t.kwhPerUnit[unit]; if (f === undefined) { return NaN; }
    return amount * f;
  }

  /**
   * Bölge + enerji türü için varsayılan faktör (kgCO2e/kWh).
   * Sıra: 1) overrides (ör. Türkiye şebeke faktörü)  2) resmî HCMI tablosu.
   * @returns {{value:(number|null), source:string, overrideId:(string|undefined)}}
   */
  function defaultEf(country, region, typeName, overrides) {
    var reg = regionByKey[country + '|' + region];
    var t = typeByName[typeName];
    if (!reg || !t) { return { value: null, source: 'unknown' }; }
    var list = overrides || [];
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o.country === country && o.region === region && o.typeId === t.id && isNum(o.value)) {
        return { value: o.value, source: 'override', overrideId: o.id };
      }
    }
    var v;
    if (typeName === GRID) { v = reg.g; }
    else if (typeName === PPA) { v = ('ppa' in reg) ? reg.ppa : reg.g; }
    else if (typeName === CHILLED) { v = reg.ch; }
    else { v = D.profiles[reg.p][D.profileTypes.indexOf(t.id)]; }
    return { value: (v === null || v === undefined) ? null : v, source: 'hcmi' };
  }

  function emptyInput() {
    return {
      hotel: { country: 'Turkey', region: 'Turkey', areaUnit: 'sqm', roomsArea: 0, meetingArea: 0,
               conditionedArea: 0, rooms: 0, occupiedRooms: 0 },
      supplementary: {
        refrigerants: 'none', mobileFuels: 'none',            // 'manual' | 'default1pct' | 'none'
        privateSpace: { has: false, actual: false, shareKnown: false, sharePct: 0 }
      },
      energy: [{ type: GRID, unit: 'kWh', total: 0, privateActual: 0, efMode: 'default', manualEf: null }],
      marketPurchases: [],                                     // [{ description, kwh }]
      laundry: { outsourced: false, shareKnown: false, items: [],
                 tonnageKnown: false, tonnage: 0, tonnageUnit: 'Metric Tonne' },
      refrigerantAmountsKg: {},                                // { rf01: kg, ... }
      client: null                                             // { roomNights, meetingArea, meetingHours }
    };
  }

  // ------------------------------------------------------------------ hesap
  /**
   * @param {object} input     bkz. emptyInput()
   * @param {object} [options] { efOverrides: [{country, region, typeId, value, id}] }
   * @returns {object} sonuç (bkz. dosyanın sonundaki "ÇIKTI ŞEMASI")
   */
  function calculate(input, options) {
    options = options || {};
    var errors = [], warnings = [], info = [];
    var inp = input || emptyInput();
    var hotel = inp.hotel || {};
    var supp = inp.supplementary || {};
    var priv = supp.privateSpace || {};
    var overrides = options.efOverrides || [];

    // ---- bölge
    var country = hotel.country, regionName = hotel.region || hotel.country;
    var reg = regionByKey[country + '|' + regionName];
    if (!reg) { push(errors, 'region', 'Ülke / bölge resmî HCMI tablosunda bulunamadı: ' + country + ' / ' + regionName, 'hotel.region'); }

    // ---- alanlar ve sayaçlar
    var roomsArea = n0(hotel.roomsArea), meetingArea = n0(hotel.meetingArea), occupied = n0(hotel.occupiedRooms);
    [['roomsArea', roomsArea, 'Oda ve koridor alanı'], ['meetingArea', meetingArea, 'Toplantı alanı'],
     ['occupiedRooms', occupied, 'Dolu oda sayısı']].forEach(function (a) {
      if (a[1] < 0) { push(errors, 'negative', a[2] + ' negatif olamaz.', 'hotel.' + a[0]); }
    });
    if (hotel.areaUnit !== 'sqm' && hotel.areaUnit !== 'sqft') { push(errors, 'areaUnit', 'Alan birimi m² veya fit² olmalı.', 'hotel.areaUnit'); }

    // ---- özel alan (Excel H37-H39, I39)
    var sharePct = n0(priv.sharePct);
    var estimateShare = !!(priv.has && !priv.actual && priv.shareKnown);        // Excel: H39="Yes"
    if (estimateShare && !(sharePct > 0 && sharePct < 1)) {
      push(errors, 'sharePct', 'Özel alan oranı %0 ile %100 arasında olmalı.', 'supplementary.privateSpace.sharePct');
    }

    // ---- enerji satırları (girdi)
    var rowsIn = (inp.energy || []).filter(function (r) { return r && has(r.type); });
    var seen = {};
    rowsIn.forEach(function (r, i) {
      if (!typeByName[r.type]) { push(errors, 'type', 'Bilinmeyen enerji türü: ' + r.type, 'energy[' + i + '].type'); }
      else if (seen[r.type]) { push(errors, 'duplicate', '"' + typeByName[r.type].tr + '" iki kez girilmiş; tek satırda toplayın.', 'energy[' + i + '].type'); }
      seen[r.type] = true;
    });

    // ---- dış çamaşırhane: tür -> kWh  (Excel: sheet 2 K sütunu)
    var laundry = inp.laundry || {};
    var laundryByType = {}, laundryInfo = { mode: 'none', tonnageT: null, items: [] };
    if (laundry.outsourced) {
      if (laundry.shareKnown) {
        laundryInfo.mode = 'share';
        (laundry.items || []).forEach(function (it, i) {
          if (!it || !has(it.type)) { return; }
          var t = typeByName[it.type];
          if (!t || t.kwhPerUnit[it.unit] === undefined) {
            push(errors, 'laundryUnit', 'Çamaşırhane satırı ' + (i + 1) + ': birim bu enerji türü için geçerli değil.', 'laundry.items[' + i + ']');
            return;
          }
          var k = n0(it.total) * t.kwhPerUnit[it.unit];
          if (laundryByType[it.type] === undefined) { laundryByType[it.type] = k; }   // Excel VLOOKUP: ilk eşleşme
          laundryInfo.items.push({ type: it.type, kwh: k });
        });
      } else {
        var tonne;
        if (laundry.tonnageKnown) {
          laundryInfo.mode = 'tonnage';
          if (laundry.tonnageUnit === 'Metric Tonne') { tonne = n0(laundry.tonnage); }
          else if (laundry.tonnageUnit === 'US ton') { tonne = n0(laundry.tonnage) * D.laundry.usTonToMetricTonne; }
          else { tonne = NaN; push(errors, 'laundryTonnageUnit', 'Çamaşır tonajı için birim seçin (metrik ton / ABD tonu).', 'laundry.tonnageUnit'); }
        } else {
          laundryInfo.mode = 'estimate';
          tonne = occupied * D.laundry.tonnePerOccupiedRoom;
        }
        laundryInfo.tonnageT = tonne;
        if (isNum(tonne)) {
          D.laundry.estimate.forEach(function (e) {
            var unitFactor = typeByName[e.type].kwhPerUnit[e.unit];
            var kwh = (e.perTonne * tonne) * unitFactor;
            laundryByType[e.type] = kwh;
            laundryInfo.items.push({ type: e.type, kwh: kwh, perTonne: e.perTonne, unit: e.unit });
          });
        }
      }
    }

    // çamaşırhane payının düşeceği satır yoksa sıfır tüketimli satır ekle (Excel'de hazır satırlar)
    var rowSpecs = rowsIn.slice();
    var haveType = {}; rowSpecs.forEach(function (r) { haveType[r.type] = true; });
    var autoTypes = [];
    PRESET_ROWS.concat(Object.keys(laundryByType)).forEach(function (name) {
      if (laundryByType[name] !== undefined && !haveType[name] && typeByName[name]) {
        haveType[name] = true; autoTypes.push(name);
        rowSpecs.push({ type: name, unit: typeByName[name].defaultUnit, total: 0, privateActual: 0, efMode: 'default', _auto: true });
      }
    });

    // ---- satır satır (Excel sheet 2: H..R)
    var rows = [], totK = 0, totL = 0, totM = 0, totN = 0, incomplete = false, gridRow = null;
    rowSpecs.forEach(function (r, i) {
      var t = typeByName[r.type];
      var row = { type: r.type, id: t ? t.id : null, tr: t ? t.tr : r.type, unit: r.unit, total: n0(r.total),
                  privateUsed: 0, kwhExLaundry: 0, laundryKwh: 0, kwh: 0, ef: null, efSource: null,
                  efMode: r.efMode === 'manual' ? 'manual' : 'default', otherKg: 0, laundryKg: 0, netKg: 0,
                  ok: true, stationary: t ? t.stationary : false, autoAdded: !!r._auto };
      rows.push(row);
      if (!t) { row.ok = false; incomplete = true; return; }
      if (r.type === GRID && !gridRow) { gridRow = row; }

      var conv = t.kwhPerUnit[r.unit];
      if (conv === undefined) {
        push(errors, 'unit', '"' + t.tr + '": "' + (r.unit || 'birim yok') + '" bu enerji türü için geçerli bir birim değil.', 'energy[' + i + '].unit');
        row.ok = false; incomplete = true; conv = 0;
      }
      if (row.total < 0) { push(errors, 'negative', '"' + t.tr + '": tüketim negatif olamaz.', 'energy[' + i + '].total'); row.ok = false; }

      // özel alan: tahmin (J) varsa o, yoksa gerçek (I)
      var p;
      if (estimateShare && t.stationary) { p = sharePct * row.total; }
      else { p = priv.has ? n0(r.privateActual) : 0; }
      if (p < 0) { push(errors, 'negative', '"' + t.tr + '": özel alan tüketimi negatif olamaz.', 'energy[' + i + '].privateActual'); p = 0; row.ok = false; }
      if (p > row.total) {
        push(errors, 'privateTooLarge', '"' + t.tr + '": özel alan tüketimi toplam tüketimden büyük olamaz.', 'energy[' + i + '].privateActual');
        row.ok = false;
      }
      row.privateUsed = p;

      var K = laundryByType[r.type] !== undefined ? laundryByType[r.type] : 0;
      var L = (row.total - p) * conv + K;                      // Excel: ($H-$I)*dönüşüm + $K
      row.kwhExLaundry = L - K; row.laundryKwh = K; row.kwh = L;

      // emisyon faktörü
      var ef = null, src = null;
      if (row.efMode === 'manual') {
        if (isNum(r.manualEf) && r.manualEf >= 0) { ef = r.manualEf; src = 'manual'; }
        else { push(errors, 'manualEf', '"' + t.tr + '": elle faktör seçildi ama faktör girilmedi.', 'energy[' + i + '].manualEf'); }
      } else if (reg) {
        var d = defaultEf(country, regionName, r.type, overrides);
        if (d.value !== null) { ef = d.value; src = d.source === 'override' ? 'override:' + (d.overrideId || '') : 'hcmi'; }
        else if (row.kwh > 0) {
          push(errors, 'noDefaultEf', '"' + t.tr + '": bu bölge için varsayılan emisyon faktörü yok; elle faktör girin.', 'energy[' + i + '].efMode', { typeId: t.id });
        }
      }
      row.ef = ef; row.efSource = src;
      if (ef === null) {
        if (row.kwh > 0) { row.ok = false; incomplete = true; }
      } else {
        row.otherKg = (L - K) * ef;                            // M
        row.laundryKg = K * ef;                                // N
        row.netKg = L * ef;                                    // R (şebeke için aşağıda REC düşülür)
      }
      totK += K; totL += L; totM += row.otherKg; totN += row.laundryKg;
    });

    // ---- piyasa bazlı yenilenebilir elektrik (REC / YEK-G / I-REC) — Excel bölüm 2.1
    var market = (inp.marketPurchases || []);
    var recRaw = 0, recRawKg = 0;
    market.forEach(function (m, i) {
      var v = n0(m && m.kwh);
      if (v < 0) { push(errors, 'negative', 'Piyasa bazlı alım negatif olamaz.', 'marketPurchases[' + i + ']'); v = 0; }
      recRaw += v;
    });
    var recKwh = 0, recKg = 0;
    if (recRaw > 0) {
      if (!gridRow) {
        push(warnings, 'recNoGrid', 'Yenilenebilir elektrik alımı girildi ama şebeke elektriği satırı yok; mahsup edilemedi.', 'marketPurchases');
      } else {
        recKwh = recRaw < gridRow.kwh ? recRaw : gridRow.kwh;            // K32: şebeke tüketimiyle sınırlı
        if (gridRow.ef !== null) {
          market.forEach(function (m) { recRawKg += n0(m && m.kwh) * gridRow.ef; });   // M30 + M31
          recKg = recRawKg < gridRow.otherKg ? recRawKg : gridRow.otherKg;            // M32: şebekenin "diğer" emisyonuyla sınırlı
        }
        if (recRaw > gridRow.kwh) {
          push(warnings, 'recCapped', 'Yenilenebilir elektrik alımı şebeke tüketimini aşıyor; HCMI kuralı gereği şebeke tüketimiyle sınırlandı.', 'marketPurchases');
        }
      }
    }
    if (gridRow && gridRow.ef !== null) { gridRow.netKg = gridRow.kwh * gridRow.ef - recKg; }   // R16 = L16*EF - M32
    var totR = 0; rows.forEach(function (r) { totR += r.netKg; });

    // ---- soğutucu gaz (Tab B) ve %1 / %2 yükleme (H47)
    var refMode = supp.refrigerants || 'none', mobMode = supp.mobileFuels || 'none';
    [['refrigerants', refMode], ['mobileFuels', mobMode]].forEach(function (a) {
      if (a[1] !== 'manual' && a[1] !== 'default1pct' && a[1] !== 'none') { push(errors, 'mode', 'Geçersiz seçenek: ' + a[0], 'supplementary.' + a[0]); }
    });
    var refrigerants = [], K62 = 0;
    if (refMode === 'manual') {
      D.refrigerants.forEach(function (rf) {
        var kg = n0((inp.refrigerantAmountsKg || {})[rf.id]);
        if (kg < 0) { push(errors, 'negative', rf.name + ': miktar negatif olamaz.', 'refrigerantAmountsKg.' + rf.id); kg = 0; }
        var tco2 = (kg * rf.gwp) / 1000;
        K62 += tco2;
        if (kg > 0) { refrigerants.push({ id: rf.id, name: rf.name, kg: kg, gwp: rf.gwp, tco2e: tco2 }); }
      });
      if (!refrigerants.length) {
        push(warnings, 'refNone', 'Soğutucu gaz "elle gireceğim" seçildi ama miktar girilmedi; kaçak emisyonu 0 sayıldı. Tahmini %1 yükleme için "tahmin et" seçeneğini kullanın.', 'supplementary.refrigerants');
      }
    }
    var mobileRows = rows.filter(function (r) { return !r.stationary && r.total > 0; });
    if (mobMode === 'default1pct' && mobileRows.length) {
      push(warnings, 'mobileDouble', 'Araç / ekipman yakıtı hem satır olarak girilmiş hem de %1 tahmin seçilmiş; çift sayım olabilir.', 'supplementary.mobileFuels');
    }
    if (mobMode === 'none' && !mobileRows.length) {
      push(info, 'mobileMissing', 'Araç / ekipman yakıtı girilmedi: bir satır ekleyin ya da %1 tahmin seçeneğini kullanın.', 'supplementary.mobileFuels');
    }

    var energyT = totR / 1000;
    var d1 = refMode === 'default1pct', d2 = mobMode === 'default1pct';
    var total, upliftFactor;
    if (d1 && d2) { upliftFactor = D.uplift.both; total = energyT * upliftFactor; }
    else if (d1 || d2) { upliftFactor = D.uplift.one; total = energyT * upliftFactor + K62; }
    else { upliftFactor = 1; total = energyT + K62; }
    var refT = (refMode === 'manual') ? K62 : 0;
    var upliftT = total - refT - energyT;

    // ---- alan bazlı dağıtım ve yoğunluklar (H48-H52)
    var areaSum = roomsArea + meetingArea;
    var guestT = areaSum > 0 ? (roomsArea / areaSum) * total : null;
    var meetT = areaSum > 0 ? (meetingArea / areaSum) * total : null;
    var cporKg = (guestT !== null && occupied > 0) ? (guestT / occupied) * 1000 : null;
    var meetKg = (meetT !== null && meetingArea > 0)
      ? meetT / D.meeting.daysPerYear * 1000 / D.meeting.hoursPerDay / meetingArea : null;
    var kgPerAreaYear = areaSum > 0 ? 1000 * (total / areaSum) : null;
    if (areaSum <= 0) { push(errors, 'area', 'Oda + toplantı alanı sıfır; alan bazlı değerler hesaplanamadı.', 'hotel.roomsArea'); }
    if (!(occupied > 0)) { push(errors, 'occupied', 'Dolu oda sayısı girilmedi; oda başına değer hesaplanamadı.', 'hotel.occupiedRooms'); }
    if (areaSum > 0 && !(meetingArea > 0)) { push(warnings, 'noMeeting', 'Toplantı alanı 0: toplantı metriği hesaplanmaz, tüm ayak izi odalara yazılır.', 'hotel.meetingArea'); }

    // ---- yenilenebilir göstergeleri (H55-H57)
    function kwhOf(name) { var s = 0; rows.forEach(function (r) { if (r.type === name) { s += r.kwh; } }); return s; }
    function kgOf(typeSet) { var s = 0; rows.forEach(function (r) { if (typeSet[r.type]) { s += r.otherKg; } }); return s; }
    var onsiteL = kwhOf(ONSITE), ppaL = kwhOf(PPA), gridL = kwhOf(GRID);
    var renKwh = onsiteL + ppaL + recKwh, renDen = gridL + ppaL + onsiteL;
    var renewable = {
      kwh: renKwh,
      pctOfElectricity: renDen > 0 ? ((recKwh + ppaL + onsiteL) / renDen) * 100 : null,
      pctOfEnergy: totL > 0 ? (renKwh / totL) * 100 : null,
      onsiteKwh: onsiteL, ppaKwh: ppaL, marketKwh: recKwh
    };

    // ---- kapsamlar (H60-H62)
    var s2OfficialKg = kgOf(SCOPE2_OFFICIAL), s2HeadlineKg = kgOf(SCOPE2_HEADLINE);
    var parity = {
      scope1Tco2e: (totM - s2OfficialKg) / 1000 + refT,        // H60 (PPA burada Kapsam 1'e düşer)
      scope2Tco2e: (s2OfficialKg - recKg) / 1000,              // H61
      scope3LaundryTco2e: totN / 1000                          // H62
    };
    var scopes = {
      scope1Tco2e: (totM - s2HeadlineKg) / 1000 + refT,
      scope2Tco2e: (s2HeadlineKg - recKg) / 1000,              // piyasa bazlı (resmî araç yalnız bunu raporlar)
      scope2LocationTco2e: s2HeadlineKg / 1000,                // sertifika mahsubu öncesi
      scope2MarketTco2e: (s2HeadlineKg - recKg) / 1000,
      scope3LaundryTco2e: totN / 1000
    };

    // ---- çamaşırhane uyarıları
    if (laundry.outsourced && laundryInfo.mode === 'estimate') {
      info.push({ code: 'laundryEstimate', message: 'Çamaşırhane enerjisi dolu oda sayısından tahmin edildi (' + (laundryInfo.tonnageT || 0).toFixed(1) + ' ton). Tedarikçinizden gerçek pay alırsanız sonuç iyileşir.', path: 'laundry' });
    }
    if (laundry.outsourced && laundryInfo.mode === 'share' && !laundryInfo.items.length) {
      push(warnings, 'laundryEmpty', 'Çamaşırhane payı "biliyorum" seçildi ama enerji girilmedi.', 'laundry.items');
    }

    return {
      engineVersion: VERSION,
      dataSha256: D.meta.sha256,
      valid: errors.length === 0,
      incomplete: incomplete,
      errors: errors, warnings: warnings, info: info,

      total: {
        tco2e: total,
        guestroomsTco2e: guestT, meetingsTco2e: meetT,
        cporKg: cporKg, meetingKgPerAreaHour: meetKg, kgPerAreaYear: kgPerAreaYear
      },
      breakdown: { energyTco2e: energyT, refrigerantTco2e: refT, upliftTco2e: upliftT, upliftFactor: upliftFactor },
      scopes: scopes,
      market: { requestedKwh: recRaw, appliedKwh: recKwh, creditTco2e: recKg / 1000 },
      renewable: renewable,
      energy: { totalKwh: totL, laundryKwh: totK, otherKg: totM, laundryKg: totN, netKg: totR },
      rows: rows,
      laundry: laundryInfo,
      refrigerants: refrigerants,
      autoAddedTypes: autoTypes,
      parity: parity,
      areaUnit: hotel.areaUnit
    };
  }

  /** Tab C — müşteriye özel rapor (kgCO2e) */
  function clientReport(result, client) {
    client = client || {};
    var roomNights = n0(client.roomNights), area = n0(client.meetingArea), hours = n0(client.meetingHours);
    var cpor = result && result.total ? result.total.cporKg : null;
    var mk = result && result.total ? result.total.meetingKgPerAreaHour : null;
    var g = (cpor !== null && cpor !== undefined) ? roomNights * cpor : null;
    var m = (mk !== null && mk !== undefined) ? area * hours * mk : null;
    return { guestroomsKg: g, meetingsKg: m, totalKg: (g || 0) + (m || 0) };
  }

  root.HCMI = {
    version: VERSION,
    constants: { GRID: GRID, PPA: PPA, ONSITE: ONSITE, STEAM: STEAM, HOT_WATER: HOTW, CHILLED: CHILLED, GAS: GAS, FUEL_OIL_2: FO2 },
    modes: D.toggles,
    countries: countries,
    energyTypes: energyTypes,
    unitsFor: unitsFor,
    toKwh: toKwh,
    defaultEf: defaultEf,
    refrigerants: function () { return D.refrigerants.slice(); },
    emptyInput: emptyInput,
    calculate: calculate,
    clientReport: clientReport,
    data: D
  };

  /* ÇIKTI ŞEMASI (calculate)
     valid, incomplete          : hata yok / bazı satırların faktörü yok
     errors[], warnings[], info[] : { code, message (Türkçe), path }
     total      : tco2e, guestroomsTco2e, meetingsTco2e, cporKg, meetingKgPerAreaHour, kgPerAreaYear
     breakdown  : energyTco2e, refrigerantTco2e, upliftTco2e, upliftFactor
     scopes     : scope1Tco2e, scope2Tco2e, scope2LocationTco2e, scope2MarketTco2e, scope3LaundryTco2e
     market     : requestedKwh, appliedKwh, creditTco2e
     renewable  : kwh, pctOfElectricity, pctOfEnergy, onsiteKwh, ppaKwh, marketKwh
     energy     : totalKwh, laundryKwh, otherKg, laundryKg, netKg
     rows[]     : type, tr, unit, total, privateUsed, kwhExLaundry, laundryKwh, kwh, ef, efSource,
                  otherKg, laundryKg, netKg, ok, autoAdded
     parity     : resmî Excel sınıflandırması (scope1/scope2/scope3)
  */
})(typeof globalThis !== 'undefined' ? globalThis : self);
