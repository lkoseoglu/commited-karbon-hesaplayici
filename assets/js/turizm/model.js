/* =========================================================================
   Turizm hesaplayıcısı — VERİ MODELİ  (assets/js/turizm/model.js)
   -------------------------------------------------------------------------
   Sayfanın TEK durum nesnesi (state) burada tanımlanır. Ekrandaki her alan bu
   nesnedeki bir yola bağlıdır (ör. data-bind="hotel.area.rooms").

     emptyState()          boş form (sayfa boş açılır)
     normalize(obj)        dışarıdan gelen veriyi (tarayıcı belleği, bulut kaydı, JSON)
                           eksiksiz ve güvenli bir duruma çevirir
     fromLegacy(map)       ESKİ sayfanın (v4/v5) "alan kimliği → değer" haritasını aktarır
     load(obj)             şemayı tanır: yeni durum mu, eski harita mı
     buildInput(state)     HCMI motoru girdisi + satır eşlemesi
     calcOptions(state)    motor seçenekleri (Türkiye şebeke faktörü)
     gridInfo(state)       kullanılan şebeke faktörü ve kaynağı (ekranda gösterilir)
     measuresBase(...)     azaltım simülatörünün (measures.js) tabanı
     applyExample(state,w) "örnekle doldur" (eski sayfanın Muğla örneği + rapor göstergeleri)
     satır işlemleri       addEnergyRow, removeRow, setRowType, setRowUnit (birim değişince
                           miktar ve fiyat aynı enerjiye karşılık gelecek şekilde çevrilir)

   DOM'a bağımlı değildir; tests/unit/turizm-model.test.mjs doğrudan çalıştırır.
   Ön koşul: hcmi-data.js, hcmi-engine.js, tr-reference.js, benchmarks.js, measures.js
   Dışa: globalThis.TURIZM.model
   ========================================================================= */
(function (root) {
  'use strict';

  var NS = root.TURIZM = root.TURIZM || {};
  var SCHEMA = 'commited.turizm.state/2';
  var SCHEMA_PREFIX = 'commited.turizm.state/';
  var APP_VERSION = '6.3.0';

  // ------------------------------------------------------------------ sabitler
  var SEGMENTS = ['resort5', 'lux', 's5', 's4', 's3', 'limited'];          // benchmarks.js kimlikleri
  var VERIFY = {
    none: 'Doğrulanmadı — iç hesaplama',
    internal: 'İç inceleme tamamlandı',
    third: 'Bağımsız üçüncü taraf doğrulandı'
  };
  var SUPP_MODES = ['manual', 'default1pct', 'none'];
  var CONNECTIONS = ['distribution', 'transmission'];
  var LAUNDRY_METHODS = ['tonnage', 'estimate', 'share'];
  var PRIVATE_METHODS = ['actual', 'share'];
  var AGENCY_SEG_IDS = ['lux', 's5', 's4', 's3', 'limited'];
  var AGENCY_FIELDS = ['paket', 'yolcu', 'icucus', 'kisadis', 'uzundis', 'otobus', 'transfer', 'gece', 'ofis'];
  var LIMITS = { energyRows: 24, marketRows: 2, laundryItems: 3, refrigerantRows: 12, text: 120 };

  // Boş formda hazır gelen enerji satırları (eski sayfadaki alanların karşılığı) ve gösterge fiyatlar.
  // Fiyat, satırın kendi birimi başına TL'dir; yalnız azaltım önlemlerinin TL tasarrufu için kullanılır.
  var DEFAULT_ROWS = [
    ['grid', 'kWh', 4.2], ['natural_gas', 'CuM', 16], ['lpg', 'kg', null], ['diesel_stat', 'L', 54],
    ['diesel_mob', 'L', 54], ['gasoline_mob', 'L', 54], ['onsite_renew', 'kWh', null]
  ];
  var DEFAULT_PRICES = { waterTlPerM3: 48, laundryTlPerKg: 22, verTlPerT: 400 };
  var DEFAULT_PV_COST = 16000;                                               // TL/kWp (measures.js ile aynı)
  var AGENCY_DEFAULT_CPOR = { lux: 59.6, s5: 48.9, s4: 37.9, s3: 25.4, limited: 20.2 };  // benchmarks.js yoksa

  // Sürdürülebilirlik raporu göstergeleri (karbon hesabına GİRMEZ; yalnız rapor ve kişi başı göstergeler)
  //   chemicalsKg      yıllık temizlik / havuz / çamaşır kimyasalı, kg
  //   purchaseTotalTl  yıllık toplam satın alma (mal + hizmet), TL
  //   purchaseLocalTl  bunun yerel tedarikçilerden yapılan kısmı, TL ("yerel" tanımını otel yapar; raporda yazılır)
  //   staff            yıl içindeki ortalama çalışan sayısı
  //   staffTrained     çevre / sürdürülebilirlik eğitimi alan çalışan sayısı
  var ESG_FIELDS = ['chemicalsKg', 'purchaseTotalTl', 'purchaseLocalTl', 'staff', 'staffTrained'];
  var EXAMPLE_ESG = { chemicalsKg: 15600, purchaseTotalTl: 96000000, purchaseLocalTl: 62400000, staff: 145, staffTrained: 110 };

  // Rapor kapağındaki otel logosu: tarayıcıda küçültülmüş PNG/JPEG (data URL). Başka biçim ve büyük dosya kabul edilmez.
  var LOGO_RE = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+\/]+={0,2}$/;
  var LOGO_MAX_CHARS = 400000;
  function logoOf(x) { return typeof x === 'string' && x.length <= LOGO_MAX_CHARS && LOGO_RE.test(x) ? x : null; }

  // Türkiye Yeşil Taksonomisi hazırlık kontrolü (eski sayfayla aynı ağırlıklar ve öneriler)
  var TAXONOMY = [
    { id: 't_sert', w: 40, title: 'Tanınan sürdürülebilirlik sertifikam var',
      detail: 'GSTC, Yeşil Anahtar, Yeşil Küre, Mavi Bayrak, Çevre Dostu Otel, Greening Hotels, TGA Sürdürülebilir Turizm vb.',
      reco: 'Yeşil Anahtar veya GSTC tanınırlıklı bir sertifika süreci başlatın — taksonomide "önemli katkı"nın anahtarı.' },
    { id: 't_bina', w: 15, title: 'Yeşil bina belgesi veya Enerji Kimlik Belgesi B ve üzeri',
      detail: 'LEED Altın+, BREEAM Çok İyi+, DGNB Altın+, EDGE, EKB B+',
      reco: 'Enerji Kimlik Belgesi\'nizi B ve üzerine taşıyın veya LEED/BREEAM/EDGE değerlendirmesi yaptırın.' },
    { id: 't_sifir', w: 15, title: 'Sıfır Atık Belgesi',
      detail: 'Taksonomi kriteri Platin seviyeyi işaret ediyor',
      reco: 'Sıfır Atık Belgesi\'ni alın; Platin seviye taksonomi kriterinde sayılıyor.' },
    { id: 't_su', w: 10, title: 'Su armatürleri verimli',
      detail: 'Musluk ≤6 L/dk, duş ≤8 L/dk, rezervuar ≤6 L (DNSH kriteri)',
      reco: 'Armatürleri verimli modellerle değiştirin: musluk ≤6 L/dk, duş ≤8 L/dk (DNSH eşiği).' },
    { id: 't_izleme', w: 10, title: 'Enerji ve su tüketimini düzenli izliyor, yıllık raporluyorum',
      detail: '',
      reco: 'Aylık enerji–su izleme ve yıllık raporlama düzeni kurun.' },
    { id: 't_koruma', w: 10, title: 'Cironun en az %1\'i doğa koruma/restorasyona gidiyor',
      detail: 'Konaklama–biyoçeşitlilik kriteri',
      reco: 'Destinasyonunuzda bir koruma projesine yıllık ciro %1 katkı planlayın (biyoçeşitlilik kriteri).' }
  ];

  // Sık kullanılan soğutucu gazlar listenin başında, okunur adlarla
  var REFRIGERANT_LABELS = {
    rf04: 'R-410A', rf06: 'R-32 (HFC-32)', rf02: 'R-134a', rf03: 'R-404A', rf24: 'R-407C', rf01: 'R-22 (HCFC-22)',
    rf37: 'R-290 (propan)', rf38: 'R-600a (izobütan)', rf27: 'R-507A', rf23: 'R-407A'
  };
  var COMMON_REFRIGERANTS = ['rf04', 'rf06', 'rf02', 'rf03', 'rf24', 'rf01', 'rf37', 'rf38', 'rf27', 'rf23'];

  var GROUP_TR = {
    electricity: 'Elektrik', gas: 'Gaz yakıtlar', liquid: 'Sıvı yakıtlar', solid: 'Katı yakıtlar ve biyokütle',
    district: 'Satın alınan ısı, buhar, soğutma', mobile: 'Araç ve iş makinesi yakıtları'
  };
  var GROUP_ORDER = ['electricity', 'gas', 'liquid', 'mobile', 'district', 'solid'];
  var UNIT_SHORT = {
    kWh: 'kWh', MWh: 'MWh', CuM: 'm³', L: 'litre', kg: 'kg', MT: 'ton', GJ: 'GJ', MJ: 'MJ', kL: 'm³ (sıvı)',
    Therm: 'therm', DTH: 'dekatherm', kBtu: 'kBtu', MMBtu: 'MMBtu', Gal: 'galon', kGal: 'bin galon', Bar: 'varil',
    ML: 'megalitre', cuft: 'fit³', CCF: 'yüz fit³', MCF: 'bin fit³', cuyd: 'yarda³', lb: 'pound', klb: 'bin pound',
    'UK ton': 'İng. ton', 'US ton': 'ABD ton', 'Ton-Hr': 'ton-saat', Unit: 'birim'
  };
  var UNIT_PREFERENCE = ['kWh', 'CuM', 'L', 'kg', 'MWh', 'MT', 'kL', 'GJ', 'MJ'];

  // ------------------------------------------------------------------ dizinler (gecikmeli)
  var IX = null;
  function index() {
    if (IX) { return IX; }
    var d = root.HCMI_DATA;
    if (!d) { throw new Error('HCMI_DATA yüklenmemiş: önce assets/js/hcmi-data.js yükleyin.'); }
    var byId = {}, byName = {}, rf = {}, regions = {};
    d.energyTypes.forEach(function (t) { byId[t.id] = t; byName[t.name] = t; });
    d.refrigerants.forEach(function (r) { rf[r.id] = r; });
    d.regions.forEach(function (r) { (regions[r.c] = regions[r.c] || []).push(r.r); });
    IX = { D: d, byId: byId, byName: byName, rf: rf, regions: regions };
    return IX;
  }
  function measureIds() { return (root.MEASURES && root.MEASURES.order) ? root.MEASURES.order.slice() : []; }
  function agencyDefaults() {
    var o = {};
    if (root.BENCH && root.BENCH.agencySegments) { root.BENCH.agencySegments.forEach(function (a) { o[a.id] = a.cpor; }); }
    AGENCY_SEG_IDS.forEach(function (k) { if (!(k in o)) { o[k] = AGENCY_DEFAULT_CPOR[k]; } });
    return o;
  }

  // ------------------------------------------------------------------ küçük yardımcılar
  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function n0(x) { return isNum(x) ? x : 0; }
  function has(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  /** Sayıya çevir: sayı → kendisi; metin → Türkçe yazımla okunur; diğer → null */
  function num(x) {
    if (typeof x === 'number') { return isFinite(x) ? x : null; }
    if (typeof x === 'string') {
      var v = root.NUM ? root.NUM.parse(x) : Number(x);
      return isNum(v) ? v : null;
    }
    return null;
  }
  /** Eski sayfa değeri: <input type="number"> metni ("1480000", "4.2") — nokta HER ZAMAN ondalıktır */
  function legacyNum(x) {
    if (typeof x === 'number') { return isFinite(x) ? x : null; }
    if (typeof x !== 'string' || x.trim() === '') { return null; }
    var v = Number(x.trim());
    return isFinite(v) ? v : null;
  }
  function year(x) {
    var v = num(x);
    if (v === null) { return null; }
    v = Math.round(v);
    return v >= 1990 && v <= 2100 ? v : null;
  }
  function text(x) {
    if (typeof x !== 'string') { return ''; }
    return x.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, LIMITS.text);
  }
  function oneOf(v, list, def) { return list.indexOf(v) >= 0 ? v : def; }
  function round(x, d) { var p = Math.pow(10, d); return Math.round(x * p) / p; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ------------------------------------------------------------------ boş durum
  function energyRow(typeId, unit, id, price) {
    return { id: id, typeId: typeId, unit: unit, total: null, price: price === undefined ? null : price,
             privateActual: null, efMode: 'default', manualEf: null, heating: null };
  }

  function emptyAgency() {
    var c = agencyDefaults(), rows = {};
    AGENCY_SEG_IDS.forEach(function (k) { rows[k] = { n: null, c: c[k] }; });
    return { paket: null, yolcu: null, icucus: null, kisadis: null, uzundis: null, otobus: null, transfer: null,
             seg: 's4', gece: null, cpor: c.s4, ofis: null, split: false, splitRows: rows };
  }

  function emptyEsg() {
    var o = {}; ESG_FIELDS.forEach(function (k) { o[k] = null; }); return o;
  }

  function emptyHotel() {
    return {
      name: '', city: '', segment: 'resort5', year: null, rooms: null, verify: 'none', logo: null,
      country: 'Turkey', region: 'Turkey', connection: 'distribution',
      area: { conditioned: null, rooms: null, meeting: null },
      occupiedRooms: null, guestNights: null,
      energy: DEFAULT_ROWS.map(function (d, i) { return energyRow(d[0], d[1], 'e' + (i + 1), d[2]); }),
      market: [],
      refrigerants: { mode: 'manual', items: [{ rfId: 'rf04', kg: null }] },
      mobileFuels: 'manual',
      privateSpace: { has: false, method: 'actual', sharePct: null },
      laundry: { outsourced: false, method: 'tonnage', tonnageKg: null, items: [] },
      extras: { waterM3: null, wasteLandfillT: null, wasteRecycledT: null },
      esg: emptyEsg(),
      pv: { kwp: null, costTlPerKwp: DEFAULT_PV_COST },
      prices: { waterTlPerM3: DEFAULT_PRICES.waterTlPerM3, laundryTlPerKg: DEFAULT_PRICES.laundryTlPerKg, verTlPerT: DEFAULT_PRICES.verTlPerT },
      benchRef: null,
      measures: [],
      netZero: { start: null, done: 2030 },
      taxonomy: {},
      event: { m2: null, hours: null, guests: null, nights: null }
    };
  }

  function emptyState() {
    return { schema: SCHEMA, appVersion: APP_VERSION, mode: 'otel', hotel: emptyHotel(), agency: emptyAgency(), options: { saveLocal: false } };
  }

  // ------------------------------------------------------------------ normalize
  function normEnergyRow(r) {
    if (!r || typeof r !== 'object') { return null; }
    var t = index().byId[r.typeId]; if (!t) { return null; }
    return {
      id: (typeof r.id === 'string' && /^e\d{1,5}$/.test(r.id)) ? r.id : null,
      typeId: t.id,
      unit: t.kwhPerUnit[r.unit] !== undefined ? r.unit : t.defaultUnit,
      total: num(r.total), price: num(r.price), privateActual: num(r.privateActual),
      efMode: r.efMode === 'manual' ? 'manual' : 'default', manualEf: num(r.manualEf),
      heating: r.heating === true ? true : (r.heating === false ? false : null)
    };
  }
  function normLaundryItem(it) {
    if (!it || typeof it !== 'object') { return null; }
    var t = index().byId[it.typeId]; if (!t) { return null; }
    return { typeId: t.id, unit: t.kwhPerUnit[it.unit] !== undefined ? it.unit : t.defaultUnit, total: num(it.total) };
  }
  function assignIds(rows) {
    var seen = {}, max = 0;
    rows.forEach(function (r) { if (r.id) { var n = +r.id.slice(1); if (n > max) { max = n; } } });
    rows.forEach(function (r) {
      if (!r.id || seen[r.id]) { max += 1; r.id = 'e' + max; }
      seen[r.id] = true;
    });
    return rows;
  }

  function normalizeAgency(a) {
    var o = emptyAgency(), c = agencyDefaults();
    if (!a || typeof a !== 'object') { return o; }
    AGENCY_FIELDS.forEach(function (k) { o[k] = num(a[k]); });
    o.seg = oneOf(a.seg, AGENCY_SEG_IDS.concat(['custom']), 's4');
    o.cpor = has(a, 'cpor') ? num(a.cpor) : c[o.seg] || c.s4;
    o.split = a.split === true;
    var rows = a.splitRows || {};
    AGENCY_SEG_IDS.forEach(function (k) {
      var r = rows[k] || {};
      o.splitRows[k] = { n: num(r.n), c: has(r, 'c') ? num(r.c) : c[k] };
    });
    return o;
  }

  /**
   * Dışarıdan gelen herhangi bir nesneyi eksiksiz duruma çevirir. Bilinmeyen alanlar atılır,
   * geçersiz seçimler varsayılana döner, sayılar sayıya çevrilir. Girdiyi DEĞİŞTİRMEZ.
   */
  function normalize(raw) {
    var s = emptyState();
    if (!raw || typeof raw !== 'object') { return s; }
    var I = index();
    s.mode = raw.mode === 'acente' ? 'acente' : 'otel';
    var h = raw.hotel && typeof raw.hotel === 'object' ? raw.hotel : {}, o = s.hotel;

    o.name = text(h.name); o.city = text(h.city);
    o.segment = oneOf(h.segment, SEGMENTS, 'resort5');
    o.year = year(h.year);
    o.rooms = num(h.rooms);
    o.verify = oneOf(h.verify, Object.keys(VERIFY), 'none');
    o.logo = logoOf(h.logo);
    o.country = I.regions[h.country] ? h.country : 'Turkey';
    var regs = I.regions[o.country];
    o.region = regs.indexOf(h.region) >= 0 ? h.region : regs[0];
    o.connection = oneOf(h.connection, CONNECTIONS, 'distribution');
    var a = h.area || {};
    o.area = { conditioned: num(a.conditioned), rooms: num(a.rooms), meeting: num(a.meeting) };
    o.occupiedRooms = num(h.occupiedRooms); o.guestNights = num(h.guestNights);

    if (Array.isArray(h.energy)) {
      o.energy = assignIds(h.energy.slice(0, LIMITS.energyRows).map(normEnergyRow).filter(Boolean));
    }
    if (Array.isArray(h.market)) {
      o.market = h.market.slice(0, LIMITS.marketRows).filter(function (m) { return m && typeof m === 'object'; })
        .map(function (m) { return { description: text(m.description), kwh: num(m.kwh) }; });
    }
    var rf = h.refrigerants || {};
    o.refrigerants.mode = oneOf(rf.mode, SUPP_MODES, 'manual');
    if (Array.isArray(rf.items)) {
      o.refrigerants.items = rf.items.slice(0, LIMITS.refrigerantRows)
        .filter(function (it) { return it && I.rf[it.rfId]; })
        .map(function (it) { return { rfId: it.rfId, kg: num(it.kg) }; });
    }
    o.mobileFuels = oneOf(h.mobileFuels, SUPP_MODES, 'manual');
    var ps = h.privateSpace || {};
    o.privateSpace = { has: ps.has === true, method: oneOf(ps.method, PRIVATE_METHODS, 'actual'), sharePct: num(ps.sharePct) };
    var L = h.laundry || {};
    o.laundry = {
      outsourced: L.outsourced === true, method: oneOf(L.method, LAUNDRY_METHODS, 'tonnage'), tonnageKg: num(L.tonnageKg),
      items: Array.isArray(L.items) ? L.items.slice(0, LIMITS.laundryItems).map(normLaundryItem).filter(Boolean) : []
    };
    var ex = h.extras || {};
    o.extras = { waterM3: num(ex.waterM3), wasteLandfillT: num(ex.wasteLandfillT), wasteRecycledT: num(ex.wasteRecycledT) };
    var es = h.esg || {};
    ESG_FIELDS.forEach(function (k) { var v = num(es[k]); o.esg[k] = v !== null && v >= 0 ? v : null; });
    var pv = h.pv || {};
    o.pv = { kwp: num(pv.kwp), costTlPerKwp: has(pv, 'costTlPerKwp') ? num(pv.costTlPerKwp) : DEFAULT_PV_COST };
    var pr = h.prices || {};
    Object.keys(DEFAULT_PRICES).forEach(function (k) { o.prices[k] = has(pr, k) ? num(pr[k]) : DEFAULT_PRICES[k]; });
    var br = num(h.benchRef); o.benchRef = br !== null && br > 0 ? br : null;
    var ids = measureIds(), seenM = {};
    o.measures = Array.isArray(h.measures) ? h.measures.filter(function (k) {
      var ok = ids.indexOf(k) >= 0 && !seenM[k]; seenM[k] = true; return ok;
    }) : [];
    var nz = h.netZero || {};
    o.netZero = { start: year(nz.start), done: has(nz, 'done') ? year(nz.done) : 2030 };
    var tx = h.taxonomy || {};
    o.taxonomy = {};
    TAXONOMY.forEach(function (t) { if (tx[t.id] === true) { o.taxonomy[t.id] = true; } });
    var ev = h.event || {};
    o.event = { m2: num(ev.m2), hours: num(ev.hours), guests: num(ev.guests), nights: num(ev.nights) };

    s.agency = normalizeAgency(raw.agency);
    s.options = { saveLocal: !!(raw.options && raw.options.saveLocal === true) };
    return s;
  }

  // ------------------------------------------------------------------ eski sayfa aktarımı
  var LEGACY_VERIFY = { 'Doğrulanmadı — iç hesaplama': 'none', 'İç inceleme tamamlandı': 'internal', 'Bağımsız üçüncü taraf doğrulandı': 'third' };
  var LEGACY_GWP_TO_RF = { '2088': 'rf04', '1430': 'rf02', '3922': 'rf03', '1774': 'rf24', '675': 'rf06', '1': 'rf37' };
  var LEGACY_KEYS = ['h_name', 'h_elec_grid', 'h_roomnights', 'h_area_total', 'h_gas', 'a_paket', 'a_icucus'];

  function looksLegacy(o) {
    return !!o && typeof o === 'object' && !o.schema && LEGACY_KEYS.some(function (k) { return has(o, k); });
  }

  /**
   * Eski sayfanın collect() çıktısını (bulut kayıtlarında "inputs", tarayıcı belleğinde
   * "commited-hotel-v1") yeni duruma çevirir.
   * @returns {{state:object, notes:string[]}}  notes: kullanıcıya gösterilecek aktarım notları
   */
  function fromLegacy(m) {
    var s = emptyState(), notes = [];
    if (!m || typeof m !== 'object') { return { state: s, notes: notes }; }
    var L = function (k) { return legacyNum(m[k]); };
    var T = function (k) { return typeof m[k] === 'string' ? m[k] : ''; };
    var B = function (k) { return m[k] === true || m[k] === 'true'; };
    var P = function (k, def) { return has(m, k) ? L(k) : def; };      // alan hiç yoksa varsayılan
    var h = s.hotel;

    h.name = text(T('h_name')); h.city = text(T('h_city'));
    h.segment = oneOf(T('h_segment'), SEGMENTS, 'resort5');
    h.year = year(L('h_year'));
    h.rooms = L('h_rooms');
    h.verify = LEGACY_VERIFY[T('h_verify')] || 'none';
    h.area = { conditioned: L('h_area_total'), rooms: L('h_area_rooms'), meeting: L('h_area_meeting') };
    h.occupiedRooms = L('h_roomnights'); h.guestNights = L('h_guestnights');
    if (L('h_meeting_hours') > 0) {
      notes.push('Toplantı salonu kullanım saati artık girilmiyor: HCMI v2.0 toplantı metriği salonun yılda 365 gün × 10 saat kullanılabilir olduğu varsayımıyla hesaplanır.');
    }

    function setRow(typeId, total, price) {
      var r = h.energy.filter(function (x) { return x.typeId === typeId; })[0];
      if (!r) { return; }
      r.total = total;
      if (price !== undefined) { r.price = price; }
    }
    setRow('grid', L('h_elec_grid'), P('p_elec', 4.2));
    setRow('natural_gas', L('h_gas'), P('p_gas', 16));
    setRow('lpg', L('h_lpg'));
    setRow('diesel_stat', L('h_gen'), P('p_fuel', 54));
    setRow('diesel_mob', L('h_veh_diesel'), P('p_fuel', 54));
    setRow('gasoline_mob', L('h_veh_petrol'), P('p_fuel', 54));
    setRow('onsite_renew', L('h_elec_onsite'));
    var next = h.energy.length;
    if (L('h_fueloil') > 0) {
      next += 1; var fo = energyRow('fuel_oil_2', 'L', 'e' + next, null); fo.total = L('h_fueloil'); h.energy.push(fo);
      notes.push('Fuel-oil / kalorifer yakıtı "Fuel oil 2" satırına aktarıldı. Yakıtınız ağır fuel-oil ise satır türünü "Fuel oil 6" yapın.');
    }
    if (L('h_district') > 0) {
      next += 1; var dh = energyRow('hot_water', 'kWh', 'e' + next, null); dh.total = L('h_district'); h.energy.push(dh);
      notes.push('Bölgesel ısıtma / soğutma "Satın alınan sıcak su" satırına aktarıldı. Soğutma alıyorsanız türü "soğutulmuş su" yapıp tedarikçinizin faktörünü girin.');
    }
    if (L('h_elec_rec') > 0) { h.market = [{ description: 'YEK-G / I-REC', kwh: L('h_elec_rec') }]; }

    var kg = L('h_ref_kg');
    var rfId = LEGACY_GWP_TO_RF[String(has(m, 'h_ref_type') ? m.h_ref_type : '2088')] || 'rf04';
    h.refrigerants = { mode: 'manual', items: [{ rfId: rfId, kg: kg > 0 ? kg : null }] };

    var lk = L('h_laundry');
    if (lk > 0) { h.laundry = { outsourced: true, method: 'tonnage', tonnageKg: lk, items: [] }; }

    h.extras = { waterM3: L('h_water'), wasteLandfillT: L('h_waste'), wasteRecycledT: L('h_recycle') };
    h.pv = { kwp: L('h_pv_kwp'), costTlPerKwp: P('h_pv_cost', DEFAULT_PV_COST) };
    h.prices = { waterTlPerM3: P('p_water', DEFAULT_PRICES.waterTlPerM3), laundryTlPerKg: P('p_laundry', DEFAULT_PRICES.laundryTlPerKg),
                 verTlPerT: P('p_ver', DEFAULT_PRICES.verTlPerT) };

    var ref = L('h_ref_cpor'), seg = root.BENCH ? root.BENCH.segment(h.segment) : null;
    if (ref > 0 && (!seg || Math.abs(ref - seg.cpor) > 0.05)) { h.benchRef = ref; }

    h.measures = measureIds().filter(function (id) { return B('m_' + id); });
    h.netZero = { start: year(L('nz_start')), done: has(m, 'nz_done') ? year(L('nz_done')) : 2030 };
    TAXONOMY.forEach(function (t) { if (B(t.id)) { h.taxonomy[t.id] = true; } });
    h.event = { m2: L('e_m2'), hours: L('e_hours'), guests: L('e_guests'), nights: L('e_nights') };

    var ag = s.agency, c = agencyDefaults();
    AGENCY_FIELDS.forEach(function (k) { ag[k] = L('a_' + k); });
    ag.seg = oneOf(T('a_seg'), AGENCY_SEG_IDS.concat(['custom']), 's4');
    ag.cpor = P('a_cpor', c.s4);
    ag.split = B('opt_asplit');
    AGENCY_SEG_IDS.forEach(function (k) { ag.splitRows[k] = { n: L('a_n_' + k), c: P('a_c_' + k, c[k]) }; });

    s.options.saveLocal = B('opt_save');
    return { state: normalize(s), notes: notes };
  }

  /**
   * Herhangi bir kayıttan durum üret.
   * @returns {{state:object, notes:string[], legacy:boolean}}
   */
  function load(obj) {
    if (obj && typeof obj === 'object' && typeof obj.schema === 'string' && obj.schema.indexOf(SCHEMA_PREFIX) === 0) {
      return { state: normalize(obj), notes: [], legacy: false };
    }
    if (looksLegacy(obj)) {
      var r = fromLegacy(obj);
      return { state: r.state, notes: r.notes, legacy: true };
    }
    return { state: emptyState(), notes: [], legacy: false };
  }

  // ------------------------------------------------------------------ HCMI girdisi
  /**
   * Durumdan HCMI motoru girdisi üret. Boş (0 ya da girilmemiş) enerji satırları hesaba girmez.
   * @returns {{input:object, rowIndex:number[]}}  rowIndex[k] = input.energy[k]'nin durumdaki satır sırası
   */
  function buildInput(s) {
    var I = index(), h = s.hotel;
    var inp = root.HCMI.emptyInput();
    inp.hotel = { country: h.country, region: h.region, areaUnit: 'sqm',
                  roomsArea: n0(h.area.rooms), meetingArea: n0(h.area.meeting), conditionedArea: n0(h.area.conditioned),
                  rooms: n0(h.rooms), occupiedRooms: n0(h.occupiedRooms) };
    var ps = h.privateSpace, actual = !!ps.has && ps.method === 'actual';
    inp.supplementary = {
      refrigerants: h.refrigerants.mode, mobileFuels: h.mobileFuels,
      privateSpace: { has: !!ps.has, actual: actual, shareKnown: !!ps.has && ps.method === 'share', sharePct: n0(ps.sharePct) / 100 }
    };
    var rowIndex = [];
    inp.energy = [];
    h.energy.forEach(function (r, i) {
      if (!isNum(r.total) || r.total === 0) { return; }
      var t = I.byId[r.typeId]; if (!t) { return; }
      var row = { type: t.name, unit: r.unit, total: r.total, privateActual: actual ? n0(r.privateActual) : 0,
                  efMode: r.efMode === 'manual' ? 'manual' : 'default', manualEf: isNum(r.manualEf) ? r.manualEf : null };
      if (isNum(r.price)) { row.price = r.price; }                      // measures.js (motor yok sayar)
      if (r.heating === true || r.heating === false) { row.heating = r.heating; }
      inp.energy.push(row); rowIndex.push(i);
    });
    inp.marketPurchases = h.market.filter(function (m) { return isNum(m.kwh) && m.kwh !== 0; })
      .map(function (m) { return { description: m.description || 'YEK-G / I-REC', kwh: m.kwh }; });
    var L = h.laundry, out = !!L.outsourced;
    inp.laundry = {
      outsourced: out, shareKnown: out && L.method === 'share',
      items: (out && L.method === 'share') ? L.items.filter(function (it) { return isNum(it.total) && it.total !== 0; })
        .map(function (it) { return { type: I.byId[it.typeId].name, total: it.total, unit: it.unit }; }) : [],
      tonnageKnown: out && L.method === 'tonnage', tonnage: n0(L.tonnageKg) / 1000, tonnageUnit: 'Metric Tonne'
    };
    var amounts = {};
    if (h.refrigerants.mode === 'manual') {
      h.refrigerants.items.forEach(function (it) {
        if (I.rf[it.rfId] && isNum(it.kg) && it.kg !== 0) { amounts[it.rfId] = (amounts[it.rfId] || 0) + it.kg; }
      });
    }
    inp.refrigerantAmountsKg = amounts;
    inp.client = null;
    return { input: inp, rowIndex: rowIndex };
  }

  /** Motor seçenekleri: Türkiye'de şebeke elektriği için ETKB faktörü (rapor yılı + bağlantı türü) */
  function calcOptions(s) {
    if (s.hotel.country === 'Turkey' && root.TR_REFERENCE) {
      return { efOverrides: root.TR_REFERENCE.efOverrides(s.hotel.year, s.hotel.connection) };
    }
    return {};
  }

  /** Kullanılan şebeke faktörü ve kaynağı */
  function gridInfo(s) {
    var h = s.hotel;
    if (h.country === 'Turkey' && root.TR_REFERENCE) {
      var g = root.TR_REFERENCE.gridFactor(h.year, h.connection);
      return { value: g.value, origin: 'tr', basisYear: g.basisYear, exact: g.exact, reason: g.reason, message: g.message,
               connection: g.connection, source: g.source, sourceId: g.sourceId };
    }
    var d = root.HCMI.defaultEf(h.country, h.region, root.HCMI.constants.GRID, []);
    return { value: d.value, origin: 'hcmi', basisYear: null, exact: true, reason: d.value === null ? 'noDefault' : null,
             message: d.value === null ? 'Bu ülke için HCMI tablosunda şebeke faktörü yok; elektrik satırında "kendi faktörüm" seçip tedarikçinizin faktörünü girin.' : null,
             connection: null, source: null, sourceId: 'hcmi' };
  }

  /** measures.js tabanı */
  function measuresBase(s, input) {
    var h = s.hotel;
    var area = n0(h.area.conditioned) > 0 ? n0(h.area.conditioned) : n0(h.area.rooms) + n0(h.area.meeting);
    return {
      input: input,
      extras: { waterM3: n0(h.extras.waterM3), wasteLandfillT: n0(h.extras.wasteLandfillT), wasteRecycledT: n0(h.extras.wasteRecycledT) },
      facility: { rooms: n0(h.rooms), areaM2: area },
      pv: { kwp: n0(h.pv.kwp), costTlPerKwp: n0(h.pv.costTlPerKwp) },
      prices: { waterTlPerM3: n0(h.prices.waterTlPerM3), laundryTlPerKg: n0(h.prices.laundryTlPerKg) }
    };
  }

  // ------------------------------------------------------------------ boşluk denetimi
  function anyNum(list) { return list.some(function (x) { return isNum(x) && x !== 0; }); }
  function hotelIsEmpty(h) {
    if (h.name || h.city) { return false; }
    if (anyNum([h.year, h.rooms, h.occupiedRooms, h.guestNights, h.area.conditioned, h.area.rooms, h.area.meeting])) { return false; }
    if (h.energy.some(function (r) { return isNum(r.total) && r.total !== 0; })) { return false; }
    if (h.market.some(function (m) { return isNum(m.kwh) && m.kwh !== 0; })) { return false; }
    if (h.refrigerants.items.some(function (it) { return isNum(it.kg) && it.kg !== 0; })) { return false; }
    if (h.laundry.outsourced) { return false; }
    if (anyNum([h.extras.waterM3, h.extras.wasteLandfillT, h.extras.wasteRecycledT, h.pv.kwp])) { return false; }
    if (anyNum(ESG_FIELDS.map(function (k) { return h.esg[k]; }))) { return false; }
    if (anyNum([h.event.m2, h.event.hours, h.event.guests, h.event.nights])) { return false; }
    if (h.measures.length || Object.keys(h.taxonomy).length) { return false; }
    return true;
  }
  function agencyIsEmpty(a) {
    if (anyNum(AGENCY_FIELDS.map(function (k) { return a[k]; }))) { return false; }
    return !AGENCY_SEG_IDS.some(function (k) { return isNum(a.splitRows[k].n) && a.splitRows[k].n !== 0; });
  }
  function isEmpty(s) { return hotelIsEmpty(s.hotel) && agencyIsEmpty(s.agency); }

  // ------------------------------------------------------------------ örnek
  // Eski sayfanın örneği (Muğla, 120 odalı tatil köyü + örnek acente). Aktarım yolundan geçirilir;
  // böylece eski kayıtların aktarımı da her "örnekle doldur"da sınanmış olur.
  var LEGACY_EXAMPLE = {
    h_name: 'Örnek Tatil Köyü', h_city: 'Muğla', h_year: '2025', h_rooms: '120', h_segment: 'resort5',
    h_area_total: '11500', h_area_rooms: '5200', h_area_meeting: '900',
    h_roomnights: '26280', h_guestnights: '47300', h_elec_grid: '1480000', h_elec_onsite: '95000', h_elec_rec: '0',
    h_district: '0', h_gas: '92000', h_lpg: '5500', h_fueloil: '0', h_gen: '3200', h_veh_diesel: '7800', h_veh_petrol: '2400',
    h_ref_type: '2088', h_ref_kg: '11', h_laundry: '128000', h_water: '19000', h_waste: '165', h_recycle: '55', h_pv_kwp: '250',
    nz_start: '2026', nz_done: '2030',
    m_led: true, m_pv: true, m_water: true,
    e_m2: '400', e_hours: '24', e_guests: '150', e_nights: '300',
    a_paket: '120', a_yolcu: '3600', a_icucus: '1800000', a_kisadis: '2400000', a_uzundis: '0', a_otobus: '900000',
    a_transfer: '60000', a_gece: '7200', a_ofis: '18000', a_seg: 's4', a_cpor: '37.9',
    a_n_lux: '0', a_n_s5: '2400', a_n_s4: '3600', a_n_s3: '1200', a_n_limited: '0'
  };
  function exampleState() {
    var s = fromLegacy(LEGACY_EXAMPLE).state;
    s.hotel.esg = clone(EXAMPLE_ESG);                                   // eski sayfada bu alanlar yoktu
    return s;
  }

  /** Yalnız bir sekmeyi örnekle doldur: which = 'otel' | 'acente'. Durumu değiştirir ve döndürür. */
  function applyExample(s, which) {
    var ex = exampleState();
    if (which === 'acente') { s.agency = ex.agency; } else { s.hotel = ex.hotel; }
    return s;
  }

  // ------------------------------------------------------------------ satır işlemleri
  function nextRowId(rows) {
    var max = 0;
    rows.forEach(function (r) { var n = +String(r.id || 'e0').slice(1); if (n > max) { max = n; } });
    return 'e' + (max + 1);
  }
  /** Enerji satırı ekle. Aynı tür zaten varsa eklemez (HCMI: bir tür tek satırda). @returns satır | null */
  function addEnergyRow(s, typeId) {
    var t = index().byId[typeId]; if (!t) { return null; }
    var rows = s.hotel.energy;
    if (rows.length >= LIMITS.energyRows) { return null; }
    if (rows.some(function (r) { return r.typeId === typeId; })) { return null; }
    var r = energyRow(typeId, t.defaultUnit, nextRowId(rows), null);
    rows.push(r);
    return r;
  }
  /** Satır türünü değiştir: birim geçersizse türün varsayılan birimine döner; elle faktör sıfırlanır */
  function setRowType(row, typeId) {
    var t = index().byId[typeId]; if (!t || row.typeId === typeId) { return row; }
    row.typeId = typeId;
    if (t.kwhPerUnit[row.unit] === undefined) { row.unit = t.defaultUnit; }
    row.efMode = 'default'; row.manualEf = null; row.heating = null;
    return row;
  }
  /**
   * Birimi değiştir. Miktar, özel alan payı ve fiyat AYNI ENERJİYE karşılık gelecek şekilde çevrilir
   * (HCMI'nın kendi dönüşüm katsayılarıyla). Böylece yanlışlıkla birim değiştirmek sonucu bozmaz.
   */
  function setRowUnit(row, unit) {
    var t = index().byId[row.typeId]; if (!t) { return row; }
    var kOld = t.kwhPerUnit[row.unit], kNew = t.kwhPerUnit[unit];
    if (kNew === undefined || unit === row.unit) { return row; }
    if (kOld) {
      var f = kOld / kNew;
      if (isNum(row.total)) { row.total = round(row.total * f, 4); }
      if (isNum(row.privateActual)) { row.privateActual = round(row.privateActual * f, 4); }
      if (isNum(row.price)) { row.price = round(row.price / f, 6); }
    }
    row.unit = unit;
    return row;
  }
  function addMarket(s) {
    if (s.hotel.market.length >= LIMITS.marketRows) { return null; }
    var m = { description: '', kwh: null }; s.hotel.market.push(m); return m;
  }
  function addRefrigerant(s, rfId) {
    var items = s.hotel.refrigerants.items;
    if (items.length >= LIMITS.refrigerantRows) { return null; }
    var used = {}; items.forEach(function (it) { used[it.rfId] = true; });
    var id = rfId && index().rf[rfId] ? rfId : COMMON_REFRIGERANTS.filter(function (k) { return !used[k]; })[0] || 'rf04';
    var it = { rfId: id, kg: null }; items.push(it); return it;
  }
  function addLaundryItem(s, typeId) {
    var items = s.hotel.laundry.items;
    if (items.length >= LIMITS.laundryItems) { return null; }
    var t = index().byId[typeId || 'grid']; if (!t) { return null; }
    var it = { typeId: t.id, unit: t.defaultUnit, total: null }; items.push(it); return it;
  }
  function setLaundryItemUnit(it, unit) {
    var t = index().byId[it.typeId]; if (!t) { return it; }
    var kOld = t.kwhPerUnit[it.unit], kNew = t.kwhPerUnit[unit];
    if (kNew === undefined || unit === it.unit) { return it; }
    if (kOld && isNum(it.total)) { it.total = round(it.total * kOld / kNew, 4); }
    it.unit = unit;
    return it;
  }
  function setLaundryItemType(it, typeId) {
    var t = index().byId[typeId]; if (!t) { return it; }
    it.typeId = typeId;
    if (t.kwhPerUnit[it.unit] === undefined) { it.unit = t.defaultUnit; }
    return it;
  }

  // ------------------------------------------------------------------ yol ile erişim (form bağlama)
  function getPath(o, path) {
    var parts = String(path).split('.'), cur = o;
    for (var i = 0; i < parts.length; i++) {
      if (cur === null || cur === undefined) { return undefined; }
      cur = cur[parts[i]];
    }
    return cur;
  }
  function setPath(o, path, value) {
    var parts = String(path).split('.'), cur = o;
    for (var i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] === null || typeof cur[parts[i]] !== 'object') { return false; }
      cur = cur[parts[i]];
    }
    var last = parts[parts.length - 1];
    if (Array.isArray(cur)) {
      var k = Number(last);
      if (!(k >= 0 && k < cur.length && Math.floor(k) === k)) { return false; }
    } else if (!(last in cur)) { return false; }                          // bilinmeyen alan yaratılmaz
    cur[last] = value;
    return true;
  }

  // ------------------------------------------------------------------ seçenek listeleri (arayüz)
  function typeLabel(typeId) { var t = index().byId[typeId]; return t ? t.tr : typeId; }
  function unitShort(abb) {
    if (UNIT_SHORT[abb]) { return UNIT_SHORT[abb]; }
    var u = index().D.units.filter(function (x) { return x.abb === abb; })[0];
    return u ? u.tr : abb;
  }
  /** Bir enerji türünün birimleri: varsayılan birim önce, sonra Türkiye'de yaygın olanlar */
  function unitOptions(typeId) {
    var t = index().byId[typeId]; if (!t) { return []; }
    var list = Object.keys(t.kwhPerUnit);
    list.sort(function (a, b) {
      var ra = a === t.defaultUnit ? -1 : (UNIT_PREFERENCE.indexOf(a) < 0 ? 99 : UNIT_PREFERENCE.indexOf(a));
      var rb = b === t.defaultUnit ? -1 : (UNIT_PREFERENCE.indexOf(b) < 0 ? 99 : UNIT_PREFERENCE.indexOf(b));
      return ra - rb;
    });
    return list.map(function (abb) { return { value: abb, label: unitShort(abb) }; });
  }
  /** Enerji türleri, gruplu: [{group, label, options:[{value,label}]}] */
  function energyTypeGroups() {
    var I = index(), out = [];
    GROUP_ORDER.forEach(function (g) {
      var opts = I.D.energyTypes.filter(function (t) { return t.group === g; }).map(function (t) { return { value: t.id, label: t.tr }; });
      if (opts.length) { out.push({ group: g, label: GROUP_TR[g] || g, options: opts }); }
    });
    return out;
  }
  function refrigerantLabel(id) {
    var r = index().rf[id];
    return REFRIGERANT_LABELS[id] || (r ? r.name : id);
  }
  function refrigerantOptions() {
    var I = index();
    var common = COMMON_REFRIGERANTS.filter(function (k) { return I.rf[k]; });
    var rest = I.D.refrigerants.map(function (r) { return r.id; }).filter(function (k) { return common.indexOf(k) < 0; });
    return common.concat(rest).map(function (k) {
      var r = I.rf[k];
      return { value: k, label: (REFRIGERANT_LABELS[k] || r.name) + ' · GWP ' + r.gwp, gwp: r.gwp, common: common.indexOf(k) >= 0 };
    });
  }
  function countryOptions() {
    var names = Object.keys(index().regions);
    return root.TR_REFERENCE ? root.TR_REFERENCE.countryOptions(names) : names.map(function (n) { return { value: n, label: n }; });
  }
  function regionOptions(country) {
    return (index().regions[country] || []).map(function (r) { return { value: r, label: r }; });
  }

  NS.model = {
    version: APP_VERSION,
    SCHEMA: SCHEMA, APP_VERSION: APP_VERSION, LIMITS: LIMITS,
    SEGMENTS: SEGMENTS, VERIFY: VERIFY, TAXONOMY: TAXONOMY, CONNECTIONS: CONNECTIONS,
    AGENCY_SEG_IDS: AGENCY_SEG_IDS, AGENCY_FIELDS: AGENCY_FIELDS,
    DEFAULT_ROWS: DEFAULT_ROWS, DEFAULT_PRICES: DEFAULT_PRICES, DEFAULT_PV_COST: DEFAULT_PV_COST,
    LEGACY_EXAMPLE: LEGACY_EXAMPLE, ESG_FIELDS: ESG_FIELDS, EXAMPLE_ESG: EXAMPLE_ESG, LOGO_MAX_CHARS: LOGO_MAX_CHARS,
    emptyState: emptyState, emptyHotel: emptyHotel, emptyAgency: emptyAgency, emptyEsg: emptyEsg, logoOf: logoOf,
    normalize: normalize, fromLegacy: fromLegacy, looksLegacy: looksLegacy, load: load,
    buildInput: buildInput, calcOptions: calcOptions, gridInfo: gridInfo, measuresBase: measuresBase,
    isEmpty: isEmpty, hotelIsEmpty: hotelIsEmpty, agencyIsEmpty: agencyIsEmpty,
    exampleState: exampleState, applyExample: applyExample,
    addEnergyRow: addEnergyRow, setRowType: setRowType, setRowUnit: setRowUnit, nextRowId: nextRowId,
    addMarket: addMarket, addRefrigerant: addRefrigerant,
    addLaundryItem: addLaundryItem, setLaundryItemUnit: setLaundryItemUnit, setLaundryItemType: setLaundryItemType,
    getPath: getPath, setPath: setPath,
    typeLabel: typeLabel, unitShort: unitShort, unitOptions: unitOptions, energyTypeGroups: energyTypeGroups,
    refrigerantOptions: refrigerantOptions, refrigerantLabel: refrigerantLabel,
    countryOptions: countryOptions, regionOptions: regionOptions,
    agencyDefaults: agencyDefaults, clone: clone
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
