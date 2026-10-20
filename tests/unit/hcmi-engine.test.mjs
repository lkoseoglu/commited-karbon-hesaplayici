// HCMI hesap motoru testleri.
//  1) Altın referans: resmî Excel'in LibreOffice ile hesaplanmış çıktısı (tests/golden/hcmi-oracle.json)
//     ile motor çıktısı her senaryoda aynı olmalı.
//  2) Hata yolları, Türkiye katmanı, değişmezler (metamorfik testler), veri bütünlüğü.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadHCMI, ROOT } from '../helpers/load-hcmi.mjs';

const ctx = loadHCMI();
const H = ctx.HCMI;
const D = ctx.HCMI_DATA;
const GOLD = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/golden/hcmi-oracle.json'), 'utf8'));

// vm içinde üretilen nesnelerin prototipi farklıdır; deepStrictEqual için düz JSON'a çeviriyoruz.
const plain = (x) => JSON.parse(JSON.stringify(x));

const REL = 1e-12, ABS = 1e-9;
function same(actual, expected, label) {
  const e = (expected === '' || expected === undefined) ? null : expected;
  if (e === null) { assert.ok(actual === null || actual === undefined, `${label}: Excel boş, motor ${actual}`); return; }
  assert.ok(typeof actual === 'number' && isFinite(actual), `${label}: motor sayı vermedi (${actual}), Excel ${e}`);
  const tol = Math.max(ABS, Math.abs(e) * REL);
  assert.ok(Math.abs(actual - e) <= tol, `${label}: motor ${actual} ≠ Excel ${e} (fark ${actual - e})`);
}

// ------------------------------------------------------------------ 1) altın referans
test('altın referans dosyası beklenen sayıda senaryo içeriyor', () => {
  assert.ok(GOLD.scenarios.length >= 60, `senaryo sayısı ${GOLD.scenarios.length}`);
  assert.match(GOLD.meta.workbook, /HCMI/);
});

for (const sc of GOLD.scenarios) {
  test(`Excel ile aynı sonuç: ${sc.id} — ${sc.title}`, () => {
    const r = H.calculate(sc.input, sc.options);
    const x = sc.excel;
    const s1 = x.sheet1, s2 = x.sheet2;
    same(r.total.tco2e, s1.total, 'H47 toplam');
    same(r.total.guestroomsTco2e, s1.guestrooms, 'H48 oda');
    same(r.total.meetingsTco2e, s1.meetings, 'H49 toplantı');
    same(r.total.cporKg, s1.cpor, 'H50 oda başına');
    same(r.total.meetingKgPerAreaHour, s1.meetingKgPerAreaHour, 'H51 toplantı');
    same(r.total.kgPerAreaYear, s1.kgPerAreaYear, 'H52 alan');
    same(r.renewable.kwh, s1.renewableKwh, 'H55');
    same(r.renewable.pctOfElectricity, s1.renewablePctElectricity, 'H56');
    same(r.renewable.pctOfEnergy, s1.renewablePctEnergy, 'H57');
    same(r.parity.scope1Tco2e, s1.scope1Official, 'H60 Kapsam 1 (resmî sınıflandırma)');
    same(r.parity.scope2Tco2e, s1.scope2Official, 'H61 Kapsam 2');
    same(r.parity.scope3LaundryTco2e, s1.scope3Laundry, 'H62 çamaşırhane');
    same(r.energy.laundryKwh, s2.K23, 'K23');
    same(r.energy.totalKwh, s2.L23, 'L23');
    same(r.energy.otherKg, s2.M23, 'M23');
    same(r.energy.laundryKg, s2.N23, 'N23');
    same(r.energy.netKg, s2.R23, 'R23');
    same(r.market.appliedKwh, s2.K32, 'K32');
    same(r.market.creditTco2e * 1000, s2.M32, 'M32');
    same(r.breakdown.refrigerantTco2e, x.tabB.K62 === null ? 0 : x.tabB.K62, 'Tab B K62');

    // satır satır
    for (const xr of x.rows) {
      if (!xr.type) continue;
      const er = r.rows.find((q) => q.type === xr.type);
      const num = (v) => (typeof v === 'number' ? v : 0);
      if (!er) {
        for (const c of 'KLMNR') assert.ok(Math.abs(num(xr[c])) < 1e-9, `${xr.type}: motorda satır yok ama Excel ${c}=${xr[c]}`);
        continue;
      }
      same(er.laundryKwh, num(xr.K), `${xr.type} K`);
      same(er.kwh, num(xr.L), `${xr.type} L`);
      same(er.otherKg, num(xr.M), `${xr.type} M`);
      same(er.laundryKg, num(xr.N), `${xr.type} N`);
      same(er.netKg, num(xr.R), `${xr.type} R`);
      const efX = xr.O === 'Manual' ? xr.P : xr.Q;
      if (typeof efX === 'number') same(er.ef, efX, `${xr.type} EF`);
    }

    if (sc.input.client) {
      const c = H.clientReport(r, sc.input.client);
      same(c.guestroomsKg, x.tabC.H20, 'Tab C H20');
      same(c.meetingsKg, x.tabC.H21, 'Tab C H21');
      same(c.totalKg, x.tabC.H22, 'Tab C H22');
    }
  });
}

test('resmî örnek dosya: toplam birebir 981,4313816617498 tCO2e', () => {
  const sc = GOLD.scenarios.find((s) => s.id === 'example-official');
  const r = H.calculate(sc.input, sc.options);
  assert.equal(r.total.tco2e, 981.4313816617498);
  assert.equal(r.parity.scope1Tco2e, 733.2557132376351);
  assert.equal(r.parity.scope2Tco2e, 32.969850617385354);
  assert.equal(r.parity.scope3LaundryTco2e, 215.20581780672936);
  assert.equal(r.total.cporKg, 14.721470724926247);
});

// ------------------------------------------------------------------ 2) veri bütünlüğü
test('veri dosyası: sayılar ve Türkiye satırı', () => {
  assert.equal(D.regions.length, 337);
  assert.equal(D.energyTypes.length, 32);
  assert.equal(D.units.length, 27);
  assert.equal(D.refrigerants.length, 41);
  assert.equal(D.profiles.length, 14);
  assert.deepEqual(plain(D.uplift), { one: 1.01, both: 1.02 });
  assert.deepEqual(plain(D.meeting), { daysPerYear: 365, hoursPerDay: 10 });
  const tr = D.regions.find((r) => r.c === 'Turkey');
  assert.equal(tr.g, null, 'resmî tabloda Türkiye şebeke faktörü yok');
  assert.match(D.meta.sha256, /^[0-9a-f]{64}$/);
});

test('birim dönüşümü: 1 m³ doğal gaz, 1 MMBtu, 1 L motorin', () => {
  assert.equal(H.toKwh('Natural Gas', 'CuM', 1), 10.639499728323601);
  assert.equal(H.toKwh('Natural Gas', 'MMBtu', 1), 293.05579);
  assert.equal(H.toKwh('Diesel (Stationary)', 'L', 1), 10.684123065071914);
  assert.ok(Number.isNaN(H.toKwh('Purchased Electricity (Grid)', 'L', 1)), 'elektrik litre ile ölçülmez');
});

// ------------------------------------------------------------------ 3) Türkiye ve hata yolları
function trInput(patch = {}) {
  const i = H.emptyInput();
  i.hotel = { country: 'Turkey', region: 'Turkey', areaUnit: 'sqm', roomsArea: 18000, meetingArea: 900, conditionedArea: 22000, rooms: 120, occupiedRooms: 30000 };
  i.energy = [
    { type: 'Purchased Electricity (Grid)', unit: 'kWh', total: 2400000, efMode: 'default' },
    { type: 'Natural Gas', unit: 'CuM', total: 180000, efMode: 'default' },
  ];
  return Object.assign(i, patch);
}
const TR_OVR = [{ country: 'Turkey', region: 'Turkey', typeId: 'grid', value: 0.469, id: 'tr-grid' }];

test('Türkiye: varsayılan şebeke faktörü yok → hata ve eksik sonuç', () => {
  const r = H.calculate(trInput());
  assert.equal(r.valid, false);
  assert.equal(r.incomplete, true);
  assert.ok(r.errors.some((e) => e.code === 'noDefaultEf'));
});

test('Türkiye: override ile elle faktör aynı sonucu verir', () => {
  const a = H.calculate(trInput(), { efOverrides: TR_OVR });
  const b = trInput(); b.energy[0].efMode = 'manual'; b.energy[0].manualEf = 0.469;
  const c = H.calculate(b);
  assert.equal(a.valid, true);
  assert.equal(a.total.tco2e, c.total.tco2e);
  assert.equal(a.rows[0].efSource, 'override:tr-grid');
  assert.equal(c.rows[0].efSource, 'manual');
  // elle hesap: 2.400.000 kWh x 0,469 + 180.000 m3 x 10,6395 kWh x 0,202543197
  const exp = (2400000 * 0.469 + 180000 * 10.639499728323601 * 0.202543197) / 1000;
  assert.ok(Math.abs(a.total.tco2e - exp) < 1e-9, `${a.total.tco2e} ≠ ${exp}`);
});

test('hata: geçersiz birim, yinelenen tür, eksik elle faktör, negatif, özel alan > toplam', () => {
  const i = trInput();
  i.energy = [
    { type: 'Purchased Electricity (Grid)', unit: 'L', total: 100 },
    { type: 'Natural Gas', unit: 'CuM', total: 10 },
    { type: 'Natural Gas', unit: 'CuM', total: 10 },
    { type: 'Diesel (Stationary)', unit: 'L', total: 5, efMode: 'manual' },
    { type: 'Kerosene', unit: 'L', total: -5 },
  ];
  const r = H.calculate(i, { efOverrides: TR_OVR });
  const codes = r.errors.map((e) => e.code);
  for (const c of ['unit', 'duplicate', 'manualEf', 'negative']) assert.ok(codes.includes(c), 'beklenen hata yok: ' + c);
  const j = trInput(); j.supplementary.privateSpace = { has: true, actual: true };
  j.energy[0].privateActual = 3000000;
  assert.ok(H.calculate(j, { efOverrides: TR_OVR }).errors.some((e) => e.code === 'privateTooLarge'));
});

test('bilinçli sapma: Excel boş faktörü 0 sayar, motor "faktör yok" hatası verir (Türkiye soğutulmuş su)', () => {
  const i = trInput();
  i.energy.push({ type: 'Purchased Chilled Water', unit: 'kWh', total: 100000 });
  const r = H.calculate(i, { efOverrides: TR_OVR });
  assert.equal(r.incomplete, true);
  assert.ok(r.errors.some((e) => e.code === 'noDefaultEf' && e.typeId === 'chilled_water'));
});

test('bilinmeyen bölge ve alan birimi hata verir, çökmez', () => {
  const i = trInput(); i.hotel.country = 'Atlantis'; i.hotel.areaUnit = 'acre';
  const r = H.calculate(i);
  assert.ok(r.errors.some((e) => e.code === 'region'));
  assert.ok(r.errors.some((e) => e.code === 'areaUnit'));
});

test('boş girdi çökmeden sonuç verir', () => {
  const r = H.calculate(H.emptyInput());
  assert.equal(r.total.tco2e, 0);
  assert.equal(r.total.cporKg, null);
  assert.ok(r.errors.length > 0);
  assert.doesNotThrow(() => H.calculate(null));
  assert.doesNotThrow(() => H.calculate({}));
});

test('çamaşırhane tahmini: hazır satırlar kendiliğinden eklenir', () => {
  const i = trInput();
  i.energy = [{ type: 'Purchased Electricity (Grid)', unit: 'kWh', total: 1000000 }];
  i.laundry = { outsourced: true, shareKnown: false, tonnageKnown: false, items: [], tonnage: 0, tonnageUnit: 'Metric Tonne' };
  const r = H.calculate(i, { efOverrides: TR_OVR });
  assert.deepEqual(plain(r.autoAddedTypes).sort(), ['Fuel Oil 2', 'Natural Gas']);
  const t = i.hotel.occupiedRooms * D.laundry.tonnePerOccupiedRoom;
  assert.ok(Math.abs(r.energy.laundryKwh - (180 * t + 1560 * t + 111 * t * 10.684123065071914)) < 1e-6);
  assert.ok(r.scopes.scope3LaundryTco2e > 0);
});

test('girdi nesnesi değiştirilmez ve sonuç belirlenimcidir', () => {
  const i = trInput(); const copy = JSON.parse(JSON.stringify(i));
  const a = H.calculate(i, { efOverrides: TR_OVR });
  assert.deepEqual(plain(i), copy);
  assert.deepEqual(plain(H.calculate(i, { efOverrides: TR_OVR })), plain(a));
});

// ------------------------------------------------------------------ 4) değişmezler
test('değişmez: kapsamlar + yükleme = toplam; oda + toplantı payı = toplam', () => {
  for (const sc of GOLD.scenarios) {
    const r = H.calculate(sc.input, sc.options);
    const sum = r.scopes.scope1Tco2e + r.scopes.scope2Tco2e + r.scopes.scope3LaundryTco2e + r.breakdown.upliftTco2e;
    assert.ok(Math.abs(sum - r.total.tco2e) <= 1e-9 * Math.max(1, r.total.tco2e), `${sc.id}: ${sum} ≠ ${r.total.tco2e}`);
    const p = r.parity.scope1Tco2e + r.parity.scope2Tco2e + r.parity.scope3LaundryTco2e + r.breakdown.upliftTco2e;
    assert.ok(Math.abs(p - r.total.tco2e) <= 1e-9 * Math.max(1, r.total.tco2e), `${sc.id}: resmî ${p} ≠ ${r.total.tco2e}`);
    if (r.total.guestroomsTco2e !== null) {
      assert.ok(Math.abs(r.total.guestroomsTco2e + r.total.meetingsTco2e - r.total.tco2e) <= 1e-9 * Math.max(1, r.total.tco2e), sc.id);
    }
  }
});

test('değişmez: tüketim k katına çıkınca (REC ve soğutucu yokken) emisyon k katına çıkar', () => {
  const i = trInput();
  i.energy.push({ type: 'Diesel (Mobile)', unit: 'L', total: 5000 });
  const a = H.calculate(i, { efOverrides: TR_OVR });
  const j = JSON.parse(JSON.stringify(i)); j.energy.forEach((r) => { r.total *= 3; });
  const b = H.calculate(j, { efOverrides: TR_OVR });
  assert.ok(Math.abs(b.breakdown.energyTco2e - 3 * a.breakdown.energyTco2e) < 1e-9 * a.breakdown.energyTco2e);
});

test('değişmez: REC toplamı artırmak emisyonu azaltır ve şebeke tüketimini aşamaz', () => {
  const base = trInput();
  const e0 = H.calculate(base, { efOverrides: TR_OVR }).total.tco2e;
  const withRec = trInput(); withRec.marketPurchases = [{ description: 'YEK-G', kwh: 1000000 }];
  const e1 = H.calculate(withRec, { efOverrides: TR_OVR }).total.tco2e;
  assert.ok(e1 < e0);
  assert.ok(Math.abs((e0 - e1) - 1000000 * 0.469 / 1000) < 1e-9);
  const huge = trInput(); huge.marketPurchases = [{ description: 'YEK-G', kwh: 99999999 }];
  const rh = H.calculate(huge, { efOverrides: TR_OVR });
  assert.equal(rh.market.appliedKwh, 2400000);
  assert.ok(rh.warnings.some((w) => w.code === 'recCapped'));
  assert.ok(Math.abs(rh.scopes.scope2Tco2e) < 1e-9, 'tüm elektrik sertifikalıysa piyasa bazlı Kapsam 2 sıfır');
  assert.ok(rh.scopes.scope2LocationTco2e > 1000, 'konuma dayalı Kapsam 2 sertifikadan etkilenmez');
});

test('PPA: başlıkta Kapsam 2, resmî sınıflandırmada Kapsam 1', () => {
  const i = trInput();
  i.energy.push({ type: 'Purchased Electricity (PPA)', unit: 'kWh', total: 500000 });
  const r = H.calculate(i, { efOverrides: [...TR_OVR, { country: 'Turkey', region: 'Turkey', typeId: 'ppa', value: 0.469, id: 'tr-grid' }] });
  const ppaT = 500000 * 0.469 / 1000;
  assert.ok(Math.abs((r.scopes.scope2Tco2e - r.parity.scope2Tco2e) - ppaT) < 1e-9);
  assert.ok(Math.abs((r.parity.scope1Tco2e - r.scopes.scope1Tco2e) - ppaT) < 1e-9);
});
