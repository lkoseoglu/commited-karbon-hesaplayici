// Turizm sayfası veri modeli (assets/js/turizm/model.js): boş durum, normalize, eski kayıt aktarımı,
// HCMI girdisine çeviri, satır işlemleri, form yolları.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from '../helpers/load-hcmi.mjs';

const ctx = loadApp();
const M = ctx.TURIZM.model, H = ctx.HCMI, D = ctx.HCMI_DATA;
const plain = (x) => JSON.parse(JSON.stringify(x));

test('boş durum: şema, hazır enerji satırları, boş sayılır', () => {
  const s = plain(M.emptyState());
  assert.equal(s.schema, 'commited.turizm.state/2');
  assert.equal(s.appVersion, M.APP_VERSION);
  assert.equal(s.mode, 'otel');
  assert.deepEqual(s.hotel.energy.map((r) => r.typeId), ['grid', 'natural_gas', 'lpg', 'diesel_stat', 'diesel_mob', 'gasoline_mob', 'onsite_renew']);
  assert.deepEqual(s.hotel.energy.map((r) => r.id), ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7']);
  assert.ok(s.hotel.energy.every((r) => r.total === null), 'sayfa boş açılır');
  assert.equal(s.hotel.energy[0].price, 4.2); assert.equal(s.hotel.energy[1].price, 16); assert.equal(s.hotel.energy[2].price, null);
  assert.equal(s.hotel.country, 'Turkey'); assert.equal(s.hotel.connection, 'distribution');
  assert.equal(s.hotel.refrigerants.mode, 'manual'); assert.equal(s.hotel.mobileFuels, 'manual');
  assert.equal(s.options.saveLocal, false);
  assert.equal(M.isEmpty(M.emptyState()), true);
  assert.deepEqual(plain(M.normalize(M.emptyState())), s, 'normalize boş durumu değiştirmez');
});

test('normalize: çöp girdi boş duruma döner; bilinmeyen alanlar atılır', () => {
  for (const x of [null, undefined, 42, 'metin', [], true]) assert.deepEqual(plain(M.normalize(x)), plain(M.emptyState()));
  const s = plain(M.normalize({ schema: 'commited.turizm.state/2', hacker: '<script>', hotel: { bogus: 1, name: '  Otel \u0007 A  ' } }));
  assert.equal(s.hacker, undefined); assert.equal(s.hotel.bogus, undefined);
  assert.equal(s.hotel.name, 'Otel   A');
  assert.equal(plain(M.normalize({ hotel: { name: 'x'.repeat(500) } })).hotel.name.length, 120);
});

test('normalize: seçimler doğrulanır, sayılar çevrilir', () => {
  const s = plain(M.normalize({
    mode: 'acente',
    hotel: {
      segment: 'uydurma', verify: 'third', country: 'Atlantis', region: 'x', connection: 'transmission', year: '2024',
      rooms: '120', area: { conditioned: '11.500', rooms: 5200, meeting: 'abc' }, occupiedRooms: '26.280',
      refrigerants: { mode: 'bilinmez', items: [{ rfId: 'rf04', kg: '11,5' }, { rfId: 'yok', kg: 3 }] },
      mobileFuels: 'default1pct', privateSpace: { has: true, method: 'share', sharePct: '12,5' },
      laundry: { outsourced: true, method: 'estimate', tonnageKg: null, items: [{ typeId: 'grid', unit: 'kWh', total: 10 }, { typeId: 'yok' }] },
      measures: ['led', 'led', 'uydurma', 'pv'], taxonomy: { t_sert: true, t_bina: 'evet', t_hayali: true },
      netZero: { start: 1800, done: '2031' }, benchRef: -3
    }
  }));
  const h = s.hotel;
  assert.equal(s.mode, 'acente');
  assert.equal(h.segment, 'resort5'); assert.equal(h.verify, 'third');
  assert.equal(h.country, 'Turkey'); assert.equal(h.region, 'Turkey'); assert.equal(h.connection, 'transmission');
  assert.equal(h.year, 2024); assert.equal(h.rooms, 120);
  assert.equal(h.area.conditioned, 11500, 'Türkçe binlik ayraç'); assert.equal(h.area.meeting, null);
  assert.equal(h.occupiedRooms, 26280);
  assert.equal(h.refrigerants.mode, 'manual');
  assert.deepEqual(h.refrigerants.items, [{ rfId: 'rf04', kg: 11.5 }]);
  assert.equal(h.mobileFuels, 'default1pct');
  assert.deepEqual(h.privateSpace, { has: true, method: 'share', sharePct: 12.5 });
  assert.equal(h.laundry.method, 'estimate'); assert.equal(h.laundry.items.length, 1);
  assert.deepEqual(h.measures, ['led', 'pv']);
  assert.deepEqual(h.taxonomy, { t_sert: true });
  assert.deepEqual(h.netZero, { start: null, done: 2031 });
  assert.equal(h.benchRef, null);
});

test('normalize: enerji satırları — geçersiz tür atılır, birim düzeltilir, kimlikler tekil, sınırlar', () => {
  const s = plain(M.normalize({ hotel: { energy: [
    { id: 'e1', typeId: 'grid', unit: 'kWh', total: 5 },
    { id: 'e1', typeId: 'natural_gas', unit: 'parsek', total: '1.000' },
    { typeId: 'uydurma', total: 3 },
    { id: 'x9', typeId: 'lpg', unit: 'kg', total: 2, efMode: 'manual', manualEf: '0,25', heating: 'evet' }
  ] } }));
  assert.deepEqual(s.hotel.energy.map((r) => [r.id, r.typeId, r.unit, r.total]), [['e1', 'grid', 'kWh', 5], ['e2', 'natural_gas', 'CuM', 1000], ['e3', 'lpg', 'kg', 2]]);
  assert.equal(s.hotel.energy[2].efMode, 'manual'); assert.equal(s.hotel.energy[2].manualEf, 0.25); assert.equal(s.hotel.energy[2].heating, null);
  const many = Array.from({ length: 40 }, () => ({ typeId: 'grid', unit: 'kWh' }));
  assert.equal(M.normalize({ hotel: { energy: many } }).hotel.energy.length, M.LIMITS.energyRows);
  assert.equal(M.normalize({ hotel: { energy: [] } }).hotel.energy.length, 0, 'kullanıcı tüm satırları silebilir');
  assert.equal(M.normalize({ hotel: { market: [{ kwh: 1 }, { kwh: 2 }, { kwh: 3 }] } }).hotel.market.length, 2);
});

test('normalize idempotent ve girdiyi değiştirmez', () => {
  const raw = plain(M.exampleState()); raw.hotel.energy[0].total = '1.480.000';
  const snapshot = JSON.stringify(raw);
  const a = plain(M.normalize(raw)), b = plain(M.normalize(a));
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(raw), snapshot);
  assert.equal(a.hotel.energy[0].total, 1480000);
});

test('eski örnek kaydı eksiksiz aktarılır (fromLegacy)', () => {
  const { state, notes } = M.fromLegacy(M.LEGACY_EXAMPLE);
  const s = plain(state), h = s.hotel;
  assert.deepEqual(plain(notes), []);
  assert.equal(h.name, 'Örnek Tatil Köyü'); assert.equal(h.city, 'Muğla'); assert.equal(h.year, 2025); assert.equal(h.rooms, 120);
  assert.deepEqual(h.area, { conditioned: 11500, rooms: 5200, meeting: 900 });
  assert.equal(h.occupiedRooms, 26280); assert.equal(h.guestNights, 47300);
  const by = Object.fromEntries(h.energy.map((r) => [r.typeId, r]));
  assert.deepEqual([by.grid.total, by.grid.price], [1480000, 4.2]);
  assert.deepEqual([by.natural_gas.total, by.natural_gas.unit, by.natural_gas.price], [92000, 'CuM', 16]);
  assert.deepEqual([by.lpg.total, by.lpg.price], [5500, null]);
  assert.deepEqual([by.diesel_stat.total, by.diesel_mob.total, by.gasoline_mob.total, by.onsite_renew.total], [3200, 7800, 2400, 95000]);
  assert.equal(h.energy.length, 7, 'sıfır olan fuel-oil / bölgesel ısıtma satırı açılmaz');
  assert.deepEqual(h.market, []);
  assert.deepEqual(h.refrigerants, { mode: 'manual', items: [{ rfId: 'rf04', kg: 11 }] });
  assert.deepEqual(h.laundry, { outsourced: true, method: 'tonnage', tonnageKg: 128000, items: [] });
  assert.deepEqual(h.extras, { waterM3: 19000, wasteLandfillT: 165, wasteRecycledT: 55 });
  assert.deepEqual(h.pv, { kwp: 250, costTlPerKwp: 16000 });
  assert.deepEqual(h.prices, { waterTlPerM3: 48, laundryTlPerKg: 22, verTlPerT: 400 });
  assert.deepEqual(h.measures, ['led', 'water', 'pv']);
  assert.deepEqual(h.netZero, { start: 2026, done: 2030 });
  assert.deepEqual(h.event, { m2: 400, hours: 24, guests: 150, nights: 300 });
  assert.equal(h.benchRef, null);
  const a = s.agency;
  assert.deepEqual([a.paket, a.yolcu, a.icucus, a.kisadis, a.uzundis, a.otobus, a.transfer, a.gece, a.ofis], [120, 3600, 1800000, 2400000, 0, 900000, 60000, 7200, 18000]);
  assert.equal(a.seg, 's4'); assert.equal(a.cpor, 37.9); assert.equal(a.split, false);
  assert.deepEqual(a.splitRows.s5, { n: 2400, c: 48.9 });
  assert.equal(M.isEmpty(state), false);
});

test('eski kayıt: ayrıntılı alanlar, notlar ve eşlemeler', () => {
  const { state, notes } = M.fromLegacy({
    h_name: 'Otel', h_elec_grid: '1000', h_fueloil: '500', h_district: '2500', h_elec_rec: '300', h_meeting_hours: '1200',
    h_ref_type: '3922', h_ref_kg: '4', h_verify: 'Bağımsız üçüncü taraf doğrulandı', h_segment: 's4', h_ref_cpor: '30',
    p_elec: '', p_gas: '17.5', opt_save: true, opt_asplit: true, a_n_s4: '100', a_c_s4: '40', t_sert: true, m_ev: true, m_yok: true
  });
  const h = plain(state).hotel;
  assert.equal(notes.length, 3, notes.join(' | '));
  assert.ok(notes.some((n) => /Fuel oil 2/.test(n)) && notes.some((n) => /sıcak su/.test(n)) && notes.some((n) => /365 gün/.test(n)));
  const by = Object.fromEntries(h.energy.map((r) => [r.typeId, r]));
  assert.equal(by.fuel_oil_2.total, 500); assert.equal(by.fuel_oil_2.unit, 'L');
  assert.equal(by.hot_water.total, 2500); assert.equal(by.hot_water.unit, 'kWh');
  assert.equal(new Set(h.energy.map((r) => r.id)).size, h.energy.length, 'kimlikler tekil');
  assert.deepEqual(h.market, [{ description: 'YEK-G / I-REC', kwh: 300 }]);
  assert.deepEqual(h.refrigerants.items, [{ rfId: 'rf03', kg: 4 }], 'R-404A');
  assert.equal(h.verify, 'third'); assert.equal(h.segment, 's4'); assert.equal(h.benchRef, 30, 'segmentten farklı referans korunur');
  assert.equal(by.grid.price, null, 'boş bırakılmış fiyat boş kalır'); assert.equal(by.natural_gas.price, 17.5, 'eski sayfada nokta ondalıktır');
  assert.equal(state.options.saveLocal, true);
  assert.equal(state.agency.split, true); assert.deepEqual(plain(state.agency.splitRows.s4), { n: 100, c: 40 });
  assert.deepEqual(h.taxonomy, { t_sert: true }); assert.deepEqual(h.measures, ['ev']);
  const gwp = { '2088': 'rf04', '1430': 'rf02', '3922': 'rf03', '1774': 'rf24', '675': 'rf06', '1': 'rf37' };
  for (const [g, id] of Object.entries(gwp)) assert.equal(M.fromLegacy({ h_ref_type: g, h_ref_kg: '1' }).state.hotel.refrigerants.items[0].rfId, id, g);
  assert.equal(M.fromLegacy({ h_ref_cpor: '48.9', h_segment: 's5' }).state.hotel.benchRef, null, 'segment değeriyle aynıysa özel referans sayılmaz');
  assert.deepEqual(plain(M.fromLegacy(null).state), plain(M.emptyState()));
});

test('load: şemayı tanır', () => {
  const a = M.load(plain(M.exampleState()));
  assert.equal(a.legacy, false); assert.equal(a.state.hotel.name, 'Örnek Tatil Köyü');
  const b = M.load({ h_name: 'Eski Otel', h_elec_grid: '10' });
  assert.equal(b.legacy, true); assert.equal(b.state.hotel.name, 'Eski Otel');
  const c = M.load({ foo: 1 });
  assert.equal(c.legacy, false); assert.deepEqual(plain(c.state), plain(M.emptyState()));
  assert.equal(M.load({ schema: 'commited.turizm.state/3', hotel: { name: 'Gelecek' } }).state.hotel.name, 'Gelecek', 'ileri sürüm en iyi çabayla okunur');
});

test('buildInput: örnek, ölçüm testindeki HCMI girdisiyle birebir aynı', () => {
  const { input, rowIndex } = M.buildInput(M.exampleState());
  const row = (type, unit, total, price) => ({ type, unit, total, privateActual: 0, efMode: 'default', manualEf: null, ...(price ? { price } : {}) });
  assert.deepEqual(plain(input), {
    hotel: { country: 'Turkey', region: 'Turkey', areaUnit: 'sqm', roomsArea: 5200, meetingArea: 900, conditionedArea: 11500, rooms: 120, occupiedRooms: 26280 },
    supplementary: { refrigerants: 'manual', mobileFuels: 'manual', privateSpace: { has: false, actual: false, shareKnown: false, sharePct: 0 } },
    energy: [
      row('Purchased Electricity (Grid)', 'kWh', 1480000, 4.2), row('Natural Gas', 'CuM', 92000, 16),
      row('Liquefied Petroleum Gas (LPG)', 'kg', 5500), row('Diesel (Stationary)', 'L', 3200, 54),
      row('Diesel (Mobile)', 'L', 7800, 54), row('Gasoline (Mobile)', 'L', 2400, 54), row('Onsite Renewable Energy', 'kWh', 95000)
    ],
    marketPurchases: [],
    laundry: { outsourced: true, shareKnown: false, items: [], tonnageKnown: true, tonnage: 128, tonnageUnit: 'Metric Tonne' },
    refrigerantAmountsKg: { rf04: 11 },
    client: null
  });
  assert.deepEqual(plain(rowIndex), [0, 1, 2, 3, 4, 5, 6]);
});

test('buildInput: boş satırlar atlanır, eşleme doğru; özel alan, çamaşırhane ve yeşil elektrik seçenekleri', () => {
  const s = M.emptyState(), h = s.hotel;
  h.energy[0].total = 1000; h.energy[0].privateActual = 100; h.energy[3].total = 50; h.energy[3].heating = true;
  h.privateSpace = { has: true, method: 'actual', sharePct: null };
  h.market = [{ description: '', kwh: 400 }, { description: 'x', kwh: null }];
  h.laundry = { outsourced: true, method: 'share', tonnageKg: 5000, items: [{ typeId: 'natural_gas', unit: 'CuM', total: 10 }, { typeId: 'grid', unit: 'kWh', total: null }] };
  h.refrigerants = { mode: 'manual', items: [{ rfId: 'rf04', kg: 2 }, { rfId: 'rf04', kg: 3 }, { rfId: 'rf06', kg: null }] };
  const { input, rowIndex } = M.buildInput(s);
  assert.deepEqual(plain(rowIndex), [0, 3]);
  assert.equal(input.energy[0].privateActual, 100); assert.equal(input.energy[1].heating, true);
  assert.deepEqual(plain(input.supplementary.privateSpace), { has: true, actual: true, shareKnown: false, sharePct: 0 });
  assert.deepEqual(plain(input.marketPurchases), [{ description: 'YEK-G / I-REC', kwh: 400 }]);
  assert.deepEqual(plain(input.laundry), { outsourced: true, shareKnown: true, items: [{ type: 'Natural Gas', total: 10, unit: 'CuM' }], tonnageKnown: false, tonnage: 5, tonnageUnit: 'Metric Tonne' });
  assert.deepEqual(plain(input.refrigerantAmountsKg), { rf04: 5 }, 'aynı gaz iki satırdaysa toplanır');
  h.privateSpace = { has: true, method: 'share', sharePct: 10 };
  const i2 = M.buildInput(s).input;
  assert.equal(i2.energy[0].privateActual, 0, 'oran yönteminde satır payı motor tarafından hesaplanır');
  assert.deepEqual(plain(i2.supplementary.privateSpace), { has: true, actual: false, shareKnown: true, sharePct: 0.1 });
  h.refrigerants.mode = 'default1pct';
  assert.deepEqual(plain(M.buildInput(s).input.refrigerantAmountsKg), {}, 'tahmin seçiliyse miktarlar gönderilmez');
});

test('calcOptions ve gridInfo: Türkiye ETKB faktörü yıl ve bağlantıya göre; diğer ülkeler HCMI', () => {
  const s = M.emptyState();
  s.hotel.year = 2022; s.hotel.connection = 'transmission';
  assert.deepEqual(plain(M.calcOptions(s)), { efOverrides: [{ country: 'Turkey', region: 'Turkey', typeId: 'grid', value: 0.445, id: 'tr-grid-2022-transmission' }] });
  const g = plain(M.gridInfo(s));
  assert.equal(g.value, 0.445); assert.equal(g.origin, 'tr'); assert.equal(g.basisYear, 2022); assert.equal(g.exact, true);
  s.hotel.year = 2025; s.hotel.connection = 'distribution';
  assert.equal(M.gridInfo(s).reason, 'notPublished');
  s.hotel.country = 'Germany'; s.hotel.region = H.countries().find((c) => c.country === 'Germany').regions[0];
  assert.deepEqual(plain(M.calcOptions(s)), {});
  const gd = M.gridInfo(s);
  assert.equal(gd.origin, 'hcmi'); assert.ok(gd.value > 0.2 && gd.value < 0.8, String(gd.value));
  const noGrid = H.countries().find((c) => !c.hasGridFactor && c.country !== 'Turkey');
  if (noGrid) {
    s.hotel.country = noGrid.country; s.hotel.region = noGrid.regions[0];
    const gn = M.gridInfo(s); assert.equal(gn.value, null); assert.match(gn.message, /kendi faktörüm/);
  }
});

test('satır işlemleri: ekle, tür ve birim değiştir (aynı enerji ve maliyet korunur)', () => {
  const s = M.emptyState();
  assert.equal(M.addEnergyRow(s, 'grid'), null, 'aynı tür ikinci kez eklenmez');
  const fo = M.addEnergyRow(s, 'fuel_oil_2');
  assert.equal(fo.id, 'e8'); assert.equal(fo.unit, 'L');
  assert.equal(M.addEnergyRow(s, 'uydurma'), null);
  const gas = s.hotel.energy[1];
  gas.total = 92000; gas.price = 16; gas.privateActual = 1000;
  const k = D.energyTypes.find((t) => t.id === 'natural_gas').kwhPerUnit;
  const kwhBefore = gas.total * k.CuM, costBefore = gas.total * gas.price;
  M.setRowUnit(gas, 'kWh');
  assert.equal(gas.unit, 'kWh');
  assert.ok(Math.abs(gas.total * k.kWh - kwhBefore) < 0.01, 'enerji korunur');
  assert.ok(Math.abs(gas.total * gas.price - costBefore) < 0.5, 'maliyet korunur');
  assert.ok(Math.abs(gas.privateActual - 1000 * k.CuM) < 0.01);
  M.setRowUnit(gas, 'parsek'); assert.equal(gas.unit, 'kWh', 'geçersiz birim yok sayılır');
  gas.efMode = 'manual'; gas.manualEf = 0.3;
  M.setRowType(gas, 'lpg');
  assert.equal(gas.typeId, 'lpg'); assert.equal(gas.unit, 'kWh', 'LPG de kWh destekler'); assert.equal(gas.efMode, 'default'); assert.equal(gas.manualEf, null);
  M.setRowType(gas, 'chilled_water'); assert.equal(gas.unit, 'kWh');
  const r = s.hotel.energy[0]; r.unit = 'kWh'; M.setRowType(r, 'diesel_stat'); assert.equal(r.unit, 'kWh');
  const d = s.hotel.energy[3]; M.setRowType(d, 'towngas_hk'); assert.equal(d.unit, 'Unit', 'litre geçersiz → varsayılan birim');
  for (let i = 0; i < 30; i++) M.addEnergyRow(s, D.energyTypes[i % D.energyTypes.length].id);
  assert.ok(s.hotel.energy.length <= M.LIMITS.energyRows);
  assert.equal(M.addMarket(s) !== null && M.addMarket(s) !== null && M.addMarket(s) === null, true, 'en fazla 2 belge satırı');
  const rf = M.addRefrigerant(s); assert.equal(rf.rfId, 'rf06', 'kullanılmayan ilk yaygın gaz');
  const li = M.addLaundryItem(s, 'natural_gas'); li.total = 10; M.setLaundryItemUnit(li, 'kWh');
  assert.ok(Math.abs(li.total - 10 * k.CuM) < 1e-3);
});

test('form yolları: getPath / setPath', () => {
  const s = M.emptyState();
  assert.equal(M.setPath(s, 'hotel.area.rooms', 5), true); assert.equal(s.hotel.area.rooms, 5);
  assert.equal(M.getPath(s, 'hotel.area.rooms'), 5);
  assert.equal(M.setPath(s, 'hotel.energy.2.total', 7), true); assert.equal(s.hotel.energy[2].total, 7);
  assert.equal(M.getPath(s, 'hotel.energy.2.total'), 7);
  assert.equal(M.setPath(s, 'hotel.energy.99.total', 7), false, 'olmayan satır yaratılmaz');
  assert.equal(M.setPath(s, 'hotel.uydurma', 1), false, 'bilinmeyen alan yaratılmaz');
  assert.equal(M.setPath(s, 'hotel.area.rooms.x', 1), false);
  assert.equal(M.getPath(s, 'hotel.yok.bu'), undefined);
});

test('seçenek listeleri: birimler, türler, soğutucu gazlar, ülkeler', () => {
  const u = M.unitOptions('natural_gas').map((o) => o.value);
  assert.equal(u[0], 'CuM'); assert.ok(u.includes('kWh') && u.includes('MWh'));
  assert.equal(M.unitShort('CuM'), 'm³'); assert.equal(M.unitShort('L'), 'litre');
  const groups = M.energyTypeGroups();
  const all = groups.flatMap((g) => g.options.map((o) => o.value));
  assert.equal(all.length, D.energyTypes.length); assert.equal(new Set(all).size, all.length);
  assert.equal(groups[0].label, 'Elektrik');
  const rf = M.refrigerantOptions();
  assert.equal(rf.length, D.refrigerants.length); assert.match(rf[0].label, /^R-410A · GWP 2100$/);
  assert.equal(M.refrigerantLabel('rf06'), 'R-32 (HFC-32)'); assert.match(M.refrigerantLabel('rf13'), /HFC-227ea/);
  const c = M.countryOptions();
  assert.equal(c[0].value, 'Turkey'); assert.equal(c[0].label, 'Türkiye'); assert.equal(c.length, 260);
  assert.deepEqual(plain(M.regionOptions('Turkey')), [{ value: 'Turkey', label: 'Turkey' }]);
  assert.equal(M.typeLabel('grid'), 'Şebekeden satın alınan elektrik');
});

test('örnekle doldurma yalnız seçilen sekmeyi değiştirir', () => {
  const s = M.emptyState(); s.hotel.name = 'Benim Otelim';
  M.applyExample(s, 'acente');
  assert.equal(s.hotel.name, 'Benim Otelim'); assert.equal(s.agency.icucus, 1800000);
  const s2 = M.emptyState(); s2.agency.paket = 5;
  M.applyExample(s2, 'otel');
  assert.equal(s2.agency.paket, 5); assert.equal(s2.hotel.name, 'Örnek Tatil Köyü');
  assert.equal(M.hotelIsEmpty(s2.hotel), false); assert.equal(M.agencyIsEmpty(M.emptyAgency()), true);
});
