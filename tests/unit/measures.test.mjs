// Azaltım önlemleri simülatörü (assets/js/measures.js) — HCMI motoruyla birlikte.
// Örnek otel: eski sayfanın "Örnek Tatil Köyü" verisi (Muğla, 120 oda). Katsayılar eski sayfadaki
// scenario() işleviyle aynıdır; yatırım tutarları da eski formüllerle birebir karşılaştırılır.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHCMI } from '../helpers/load-hcmi.mjs';

const ctx = loadHCMI(['assets/js/tr-reference.js', 'assets/js/measures.js']);
const H = ctx.HCMI, D = ctx.HCMI_DATA, T = ctx.TR_REFERENCE, M = ctx.MEASURES;
const plain = (x) => JSON.parse(JSON.stringify(x));
const near = (a, b, msg = '', tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} ${a} ≠ ${b}`);

const OPTS = { efOverrides: T.efOverrides(2023) };            // Türkiye şebeke faktörü 0,469
const typeById = (id) => D.energyTypes.find((t) => t.id === id);
const kwhOf = (id, unit, amount) => amount * typeById(id).kwhPerUnit[unit];

function exampleBase() {
  const row = (type, unit, total, price) => ({ type, unit, total, privateActual: 0, efMode: 'default', manualEf: null, ...(price ? { price } : {}) });
  return {
    input: {
      hotel: { country: 'Turkey', region: 'Turkey', areaUnit: 'sqm', roomsArea: 5200, meetingArea: 900, conditionedArea: 11500, rooms: 120, occupiedRooms: 26280 },
      supplementary: { refrigerants: 'manual', mobileFuels: 'manual', privateSpace: { has: false, actual: false, shareKnown: false, sharePct: 0 } },
      energy: [
        row('Purchased Electricity (Grid)', 'kWh', 1480000, 4.2),
        row('Natural Gas', 'CuM', 92000, 16),
        row('Liquefied Petroleum Gas (LPG)', 'kg', 5500),
        row('Diesel (Stationary)', 'L', 3200, 54),
        row('Diesel (Mobile)', 'L', 7800, 54),
        row('Gasoline (Mobile)', 'L', 2400, 54),
        row('Onsite Renewable Energy', 'kWh', 95000)
      ],
      marketPurchases: [],
      laundry: { outsourced: true, shareKnown: false, items: [], tonnageKnown: true, tonnage: 128, tonnageUnit: 'Metric Tonne' },
      refrigerantAmountsKg: { rf04: 11 },
      client: null
    },
    extras: { waterM3: 19000, wasteLandfillT: 165, wasteRecycledT: 55 },
    pv: { kwp: 250 },
    prices: { waterTlPerM3: 48, laundryTlPerKg: 22 }
  };
}
const rowOf = (res, name) => res.input.energy.find((r) => r.type === name);
const GRID = 'Purchased Electricity (Grid)', GAS = 'Natural Gas', LPG = 'Liquefied Petroleum Gas (LPG)';
const DSTAT = 'Diesel (Stationary)', DMOB = 'Diesel (Mobile)', GMOB = 'Gasoline (Mobile)', ONSITE = 'Onsite Renewable Energy';

test('örnek otel HCMI ile geçerli sonuç verir (Türkiye faktörü geçersiz kılma ile)', () => {
  const r = H.calculate(exampleBase().input, OPTS);
  assert.equal(r.valid, true, JSON.stringify(plain(r.errors)));
  assert.equal(r.incomplete, false);
  assert.ok(r.total.tco2e > 500 && r.total.tco2e < 2500, `toplam ${r.total.tco2e}`);
});

test('önlem seçilmezse girdi ve tutarlar değişmez', () => {
  const base = exampleBase();
  const res = M.apply(base, []);
  assert.deepEqual(plain(res.input), base.input);
  assert.deepEqual(plain(res.extras), base.extras);
  assert.equal(res.capexTl, 0); assert.equal(res.opexTl, 0); assert.equal(res.savingsTl, 0);
  assert.deepEqual(plain(res.applied), []); assert.deepEqual(plain(res.notes), []);
});

test('apply girdiyi bozmaz (derin kopya)', () => {
  const base = exampleBase();
  const before = JSON.stringify(base);
  M.apply(base, M.order);
  assert.equal(JSON.stringify(base), before);
});

test('13 önlem tanımlı, sıra ve gruplar tutarlı', () => {
  assert.equal(M.list.length, 13);
  assert.deepEqual(plain(M.order), ['led', 'keycard', 'bms', 'hr', 'water', 'linen', 'st', 'hp', 'waste', 'refrig', 'ev', 'pv', 'green']);
  assert.deepEqual(plain(M.list.map((m) => m.id)).sort(), plain(M.order).slice().sort());
  for (const m of M.list) { assert.ok(m.tr && m.note && m.group, m.id); assert.ok(M.coef[m.id], `katsayı yok: ${m.id}`); }
});

test('LED: aydınlatma payı %12 × tasarruf %55; yatırım oda başına 2.500 TL', () => {
  const r = M.apply(exampleBase(), ['led']);
  near(rowOf(r, GRID).total, 1480000 * (1 - 0.12 * 0.55));
  assert.equal(rowOf(r, GAS).total, 92000);
  assert.equal(r.capexTl, 120 * 2500);
  near(r.savingsTl, (1480000 - rowOf(r, GRID).total) * 4.2);
  assert.deepEqual(plain(r.applied), ['led']);
});

test('Oda enerji otomasyonu: elektrik −%7, yatırım 6.000 TL/oda', () => {
  const r = M.apply(exampleBase(), ['keycard']);
  near(rowOf(r, GRID).total, 1480000 * 0.93); assert.equal(r.capexTl, 720000);
});

test('BMS: elektrik −%9, ısıtma yakıtı −%6 (LPG dokunulmaz); yatırım 300 TL/m²', () => {
  const r = M.apply(exampleBase(), ['bms']);
  near(rowOf(r, GRID).total, 1480000 * 0.91); near(rowOf(r, GAS).total, 92000 * 0.94);
  assert.equal(rowOf(r, LPG).total, 5500, 'LPG mutfak yakıtı sayılır, ısıtma önleminden etkilenmez');
  assert.equal(r.capexTl, 11500 * 300);
  near(r.savingsTl, (1480000 * 0.09) * 4.2 + (92000 * 0.06) * 16);
});

test('Isı geri kazanım: elektrik −%2, ısıtma yakıtı −%10; yatırım 180 TL/m²', () => {
  const r = M.apply(exampleBase(), ['hr']);
  near(rowOf(r, GRID).total, 1480000 * 0.98); near(rowOf(r, GAS).total, 92000 * 0.90);
  assert.equal(r.capexTl, 11500 * 180);
});

test('Verimli armatür: su −%25, ısıtma yakıtı −%8; yatırım 3.200 TL/oda', () => {
  const r = M.apply(exampleBase(), ['water']);
  near(r.extras.waterM3, 19000 * 0.75); near(rowOf(r, GAS).total, 92000 * 0.92);
  assert.equal(r.capexTl, 120 * 3200);
  near(r.savingsTl, 19000 * 0.25 * 48 + 92000 * 0.08 * 16);
});

test('Havlu/çarşaf: dış çamaşırhane −%12, su −%6; ton → metrik ton', () => {
  const r = M.apply(exampleBase(), ['linen']);
  near(r.input.laundry.tonnage, 128 * 0.88); assert.equal(r.input.laundry.tonnageUnit, 'Metric Tonne');
  near(r.extras.waterM3, 19000 * 0.94); assert.equal(r.capexTl, 120 * 1200);
  near(r.savingsTl, 19000 * 0.06 * 48 + 128000 * 0.12 * 22);
});

test('Havlu/çarşaf: ABD tonu girilmişse metrik tona çevrilerek azaltılır; tonaj bilinmiyorsa HCMI tahmininden', () => {
  const us = exampleBase(); us.input.laundry.tonnage = 100; us.input.laundry.tonnageUnit = 'US ton';
  const r1 = M.apply(us, ['linen']);
  near(r1.input.laundry.tonnage, 100 * D.laundry.usTonToMetricTonne * 0.88); assert.equal(r1.input.laundry.tonnageUnit, 'Metric Tonne');

  const est = exampleBase(); est.input.laundry.tonnageKnown = false; est.input.laundry.tonnage = 0;
  const r2 = M.apply(est, ['linen']);
  assert.equal(r2.input.laundry.tonnageKnown, true);
  near(r2.input.laundry.tonnage, 26280 * D.laundry.tonnePerOccupiedRoom * 0.88);
});

test('Havlu/çarşaf: enerji payı biliniyorsa çamaşırhane enerji kalemleri küçülür', () => {
  const b = exampleBase();
  b.input.laundry = { outsourced: true, shareKnown: true, items: [{ type: GRID, total: 1000, unit: 'kWh' }, { type: GAS, total: 500, unit: 'CuM' }], tonnageKnown: false, tonnage: 0, tonnageUnit: 'Metric Tonne' };
  const r = M.apply(b, ['linen']);
  near(r.input.laundry.items[0].total, 880); near(r.input.laundry.items[1].total, 440);
});

test('Güneş kollektörü: ısıtma yakıtı −%25; yatırım 5.000 TL/oda', () => {
  const r = M.apply(exampleBase(), ['st']);
  near(rowOf(r, GAS).total, 92000 * 0.75); assert.equal(r.capexTl, 600000);
});

test('Isı pompası: yakıtın %45\'i COP 3,2 ile elektriğe geçer; yatırım 9.000 TL/oda', () => {
  const r = M.apply(exampleBase(), ['hp']);
  near(rowOf(r, GAS).total, 92000 * 0.55);
  near(rowOf(r, GRID).total, 1480000 + kwhOf('natural_gas', 'CuM', 92000) * 0.45 / 3.2);
  assert.equal(r.capexTl, 1080000);
});

test('Kaynakta ayrıştırma: depolanan atığın %55\'i geri dönüşüme; yatırım 120.000 + 300 TL/oda', () => {
  const r = M.apply(exampleBase(), ['waste']);
  near(r.extras.wasteLandfillT, 165 * 0.45); near(r.extras.wasteRecycledT, 55 + 165 * 0.55);
  assert.equal(r.capexTl, 120000 + 120 * 300);
});

test('Soğutucu gaz kaçak yönetimi: miktar −%55 (elle girilmişse); yatırım 180.000 TL', () => {
  const r = M.apply(exampleBase(), ['refrig']);
  near(r.input.refrigerantAmountsKg.rf04, 11 * 0.45); assert.equal(r.capexTl, 180000);
  near(r.savingsTl, 11 * 0.55 * 1200);
});

test('Elektrikli araç: araç yakıtının %70\'i, enerji oranı %30 ile elektriğe; araç başına 3.000 L', () => {
  const r = M.apply(exampleBase(), ['ev']);
  near(rowOf(r, DMOB).total, 7800 * 0.3); near(rowOf(r, GMOB).total, 2400 * 0.3);
  assert.equal(rowOf(r, DSTAT).total, 3200, 'sabit jeneratör dizeli araç değildir');
  const cutKwh = kwhOf('diesel_mob', 'L', 7800 * 0.7) + kwhOf('gasoline_mob', 'L', 2400 * 0.7);
  near(rowOf(r, GRID).total, 1480000 + cutKwh * 0.3);
  assert.equal(r.capexTl, 1400000 * Math.ceil((7800 * 0.7 + 2400 * 0.7) / 3000));   // 7.140 L → 3 araç
  assert.equal(r.capexTl, 4200000);
});

test('Çatı GES: üretim şebekeden düşer ve ayrı "Onsite Renewable" satırına eklenir; yatırım kWp başına 16.000 TL', () => {
  const r = M.apply(exampleBase(), ['pv']);
  near(rowOf(r, GRID).total, 1480000 - 250 * 1550); near(rowOf(r, ONSITE).total, 95000 + 250 * 1550);
  assert.equal(r.capexTl, 250 * 16000);
  near(r.savingsTl, 250 * 1550 * 4.2);
  const own = exampleBase(); own.pv = { kwp: 100, costTlPerKwp: 20000 };
  assert.equal(M.apply(own, ['pv']).capexTl, 2000000, 'kendi birim maliyetiniz kullanılır');
});

test('Çatı GES: onsite satırı yoksa eklenir; üretim şebeke tüketimini aşarsa fazlası sayılmaz ve not düşülür', () => {
  const b = exampleBase(); b.input.energy = b.input.energy.filter((r) => r.type !== ONSITE); b.input.energy[0].total = 300000;
  const r = M.apply(b, ['pv']);
  assert.equal(rowOf(r, GRID).total, 0); near(rowOf(r, ONSITE).total, 300000);
  assert.equal(rowOf(r, ONSITE).planAdded, true);
  assert.ok(plain(r.notes).some((n) => n.id === 'pv' && /aşıyor/.test(n.text)));
  assert.deepEqual(plain(r.applied), ['pv']);
});

test('YEK-G / I-REC: tüm kalan şebeke elektriği piyasa alımı olur; prim yalnız yeni sertifikaya', () => {
  const r = M.apply(exampleBase(), ['green']);
  assert.deepEqual(plain(r.input.marketPurchases), [{ description: 'YEK-G / I-REC (plan)', kwh: 1480000 }]);
  near(r.opexTl, 1480000 * 0.12); near(r.netSavingsTl, -1480000 * 0.12); assert.equal(r.capexTl, 0);

  const had = exampleBase(); had.input.marketPurchases = [{ description: 'mevcut', kwh: 500000 }];
  near(M.apply(had, ['green']).opexTl, (1480000 - 500000) * 0.12);
});

test('önlemler sabit sırayla uygulanır: giriş sırası sonucu değiştirmez; etkileşim hesaba girer', () => {
  const a = M.apply(exampleBase(), ['hp', 'bms']), b = M.apply(exampleBase(), ['bms', 'hp']);
  assert.deepEqual(plain(a.input), plain(b.input));
  const gasAfterBms = 92000 * 0.94;
  near(rowOf(a, GAS).total, gasAfterBms * 0.55);
  near(rowOf(a, GRID).total, 1480000 * 0.91 + kwhOf('natural_gas', 'CuM', gasAfterBms) * 0.45 / 3.2);
});

test('13 önlemin tamamı: hepsi uygulanır, yeşil elektrik en sonda kalan tüketimi karşılar', () => {
  const r = M.apply(exampleBase(), M.order);
  assert.deepEqual(plain(r.applied), plain(M.order)); assert.deepEqual(plain(r.notes), []);
  const grid = rowOf(r, GRID).total;
  assert.ok(grid > 0 && grid < 1480000);
  assert.equal(r.input.marketPurchases[0].kwh, grid, 'YEK-G miktarı = son şebeke tüketimi');
  const sumCapex = M.order.reduce((s, k) => s + M.apply(exampleBase(), [k]).capexTl, 0);
  near(r.capexTl, sumCapex, 'yatırım toplamı önlemlerin toplamıdır (etkileşimsiz)');
});

test('uygulanamayan önlemler: neden notla söylenir, yatırım eklenmez, "applied" listesine girmez', () => {
  const cases = [
    ['pv', (b) => { b.pv = { kwp: 0 }; }, /GES kurulu gücü/],
    ['refrig', (b) => { b.input.supplementary.refrigerants = 'default1pct'; }, /Soğutucu gaz miktarı/],
    ['ev', (b) => { b.input.energy = b.input.energy.filter((r) => !/Mobile/.test(r.type)); }, /Araç yakıtı/],
    ['hp', (b) => { b.input.energy = b.input.energy.filter((r) => r.type !== GAS); }, /Isıtma yakıtı/],
    ['waste', (b) => { b.extras.wasteLandfillT = 0; }, /atık miktarı/],
    ['green', (b) => { b.input.energy[0].total = 0; }, /Şebeke elektriği/]
  ];
  for (const [id, tweak, re] of cases) {
    const b = exampleBase(); tweak(b);
    const r = M.apply(b, [id]);
    assert.deepEqual(plain(r.applied), [], id);
    assert.equal(r.capexTl, 0, `${id}: yatırım eklenmemeli`);
    assert.equal(r.opexTl, 0, id);
    const n = plain(r.notes).find((x) => x.id === id);
    assert.ok(n && re.test(n.text), `${id}: not yok ya da beklenen metin değil → ${JSON.stringify(plain(r.notes))}`);
  }
});

test('havlu/çarşaf programı dış çamaşırhane yoksa yalnız su etkisiyle uygulanır ve not düşer', () => {
  const b = exampleBase(); b.input.laundry.outsourced = false;
  const r = M.apply(b, ['linen']);
  assert.deepEqual(plain(r.applied), ['linen']);
  near(r.extras.waterM3, 19000 * 0.94); assert.equal(r.input.laundry.tonnage, 128);
  assert.ok(plain(r.notes).some((n) => n.id === 'linen' && /Dış çamaşırhane/.test(n.text)));
});

test('ısıtma yakıtı: satırdaki heating bayrağı varsayılanı ezer; fuel-oil varsayılan ısıtma yakıtıdır', () => {
  const b = exampleBase();
  b.input.energy.find((r) => r.type === LPG).heating = true;
  b.input.energy.find((r) => r.type === GAS).heating = false;
  const r = M.apply(b, ['bms']);
  near(rowOf(r, LPG).total, 5500 * 0.94); assert.equal(rowOf(r, GAS).total, 92000);

  const fo = exampleBase(); fo.input.energy.push({ type: 'Fuel Oil 2', unit: 'L', total: 10000, privateActual: 0, efMode: 'default', manualEf: null });
  near(rowOf(M.apply(fo, ['st']), 'Fuel Oil 2').total, 7500);
});

test('katsayılar tek yerden ayarlanır; ayar yalnız o çağrıyı etkiler', () => {
  const r = M.apply(exampleBase(), ['keycard'], { coef: { keycard: { elecSaving: 0.10, capexPerRoom: 1000 } } });
  near(rowOf(r, GRID).total, 1480000 * 0.90); assert.equal(r.capexTl, 120000);
  assert.equal(M.coef.keycard.elecSaving, 0.07, 'varsayılan katsayı değişmemeli');
  near(rowOf(M.apply(exampleBase(), ['keycard']), GRID).total, 1480000 * 0.93);
  const g = M.apply(exampleBase(), ['refrig'], { refrigerantPriceTlPerKg: 2000 });
  near(g.savingsTl, 11 * 0.55 * 2000);
});

test('tesis ölçeği: m² / fit² dönüşümü, oda sayısı, açık değerler önceliklidir', () => {
  const f = (inp, fac) => plain(M.facility({ input: inp, facility: fac }));
  assert.deepEqual(f({ hotel: { areaUnit: 'sqm', conditionedArea: 11500, roomsArea: 1, meetingArea: 1, rooms: 120 } }), { rooms: 120, areaM2: 11500 });
  assert.deepEqual(f({ hotel: { areaUnit: 'sqm', conditionedArea: 0, roomsArea: 5200, meetingArea: 900, rooms: 120 } }), { rooms: 120, areaM2: 6100 });
  const sq = f({ hotel: { areaUnit: 'sqft', conditionedArea: 100000, rooms: 50 } });
  near(sq.areaM2, 9290.304); assert.equal(sq.rooms, 50);
  assert.deepEqual(f({ hotel: { areaUnit: 'sqm', conditionedArea: 11500, rooms: 120 } }, { rooms: 200, areaM2: 5000 }), { rooms: 200, areaM2: 5000 });
  assert.deepEqual(f({}), { rooms: 0, areaM2: 0 });
});

test('satır eklemek HCMI\'nın 7 satırlık Excel sınırını aşsa da motor geçerli sonuç verir', () => {
  const b = exampleBase();
  b.input.energy = b.input.energy.filter((r) => r.type !== ONSITE);
  b.input.energy.push({ type: 'Fuel Oil 2', unit: 'L', total: 10000, privateActual: 0, efMode: 'default', manualEf: null });
  assert.equal(b.input.energy.length, 7);
  const ev = M.evaluate(b, ['pv'], H.calculate, undefined, OPTS);
  assert.equal(ev.input.energy.length, 8);
  assert.equal(ev.valid, true, JSON.stringify(plain(ev.after.errors)));
  assert.ok(ev.reductionTco2e > 0);
});

test('özel alan tüketimi, azalan toplamı aşmaz (HCMI "privateTooLarge" hatası çıkmaz)', () => {
  const b = exampleBase();
  b.input.supplementary.privateSpace = { has: true, actual: true, shareKnown: false, sharePct: 0 };
  b.input.energy[0].total = 1000000; b.input.energy[0].privateActual = 900000;
  const ev = M.evaluate(b, ['pv', 'keycard'], H.calculate, undefined, OPTS);
  const g = ev.input.energy[0];
  assert.ok(g.privateActual <= g.total + 1e-9, `${g.privateActual} > ${g.total}`);
  assert.equal(ev.valid, true, JSON.stringify(plain(ev.after.errors)));
});

test('hiç şebeke satırı olmasa da ısı pompası kWh satırı ekler ve motor geçerli kalır', () => {
  const b = exampleBase();
  b.input.energy = [b.input.energy[1]];                          // yalnız doğal gaz
  const r = M.apply(b, ['hp']);
  const g = rowOf(r, GRID);
  assert.ok(g && g.unit === 'kWh' && g.total > 0 && g.planAdded === true);
  assert.equal(H.calculate(r.input, OPTS).valid, true);
});

test('evaluate: önlem yokken azaltım 0; geçersiz girdide valid=false ve azaltım null', () => {
  const none = M.evaluate(exampleBase(), [], H.calculate, undefined, OPTS);
  assert.equal(none.valid, true); assert.equal(none.reductionTco2e, 0); assert.equal(none.paybackYears, null);
  assert.equal(none.beforeTco2e, none.afterTco2e);

  const empty = { input: H.emptyInput(), extras: {}, pv: { kwp: 100 } };
  const bad = M.evaluate(empty, ['led', 'pv'], H.calculate, undefined, OPTS);
  assert.equal(bad.valid, false); assert.equal(bad.reductionTco2e, null); assert.equal(bad.reductionFullTco2e, null);
  assert.equal(bad.beforeTco2e, null);

  const noFactor = M.evaluate(exampleBase(), ['led'], H.calculate);          // Türkiye faktörü geçersiz kılması verilmedi
  assert.equal(noFactor.valid, false, 'HCMI\'da Türkiye şebeke faktörü yok → hesap geçersiz sayılır');
});

test('evaluate: azaltım HCMI motorunun kendi sonucuyla uyumlu (keycard: enerji kalemi tam olarak tasarruf × faktör kadar düşer)', () => {
  const ev = M.evaluate(exampleBase(), ['keycard'], H.calculate, undefined, OPTS);
  assert.equal(ev.valid, true);
  near(ev.before.breakdown.energyTco2e - ev.after.breakdown.energyTco2e, 1480000 * 0.07 * 0.469 / 1000, 'enerji azaltımı', 1e-9);
  near(ev.reductionTco2e, ev.before.total.tco2e - ev.after.total.tco2e);
  const up = ev.before.breakdown.upliftFactor;
  near(ev.reductionTco2e, 1480000 * 0.07 * 0.469 / 1000 * up, 'toplam azaltım = enerji azaltımı × HCMI ek yükü', 1e-9);
  near(ev.reductionFullTco2e, ev.reductionTco2e, 'su/atık değişmediği için tam envanter azaltımı aynı');
  near(ev.paybackYears, ev.capexTl / ev.netSavingsTl);
});

test('evaluate: YEK-G piyasa bazlı Kapsam 2\'yi sıfırlar (kredi = 1.480.000 kWh × 0,469)', () => {
  const ev = M.evaluate(exampleBase(), ['green'], H.calculate, undefined, OPTS);
  near(ev.after.market.creditTco2e, 1480000 * 0.469 / 1000);
  assert.ok(ev.reductionTco2e > 600);
  assert.equal(ev.paybackYears, null, 'yatırım yok, işletme maliyeti var → geri ödeme tanımsız');
  assert.ok(ev.netSavingsTl < 0);
});

test('evaluate: su ve atık önlemleri HCMI toplamını değiştirmez, tam envanter azaltımında görünür', () => {
  const w = M.evaluate(exampleBase(), ['waste'], H.calculate, undefined, OPTS);
  assert.equal(w.reductionTco2e, 0);
  near(w.reductionFullTco2e, 165 * 0.55 * (446 - 21) / 1000);
  const wa = M.evaluate(exampleBase(), ['water'], H.calculate, undefined, OPTS);
  near(wa.reductionFullTco2e - wa.reductionTco2e, 19000 * 0.25 * 0.41 / 1000);
});

test('evaluate: her önlem örnek otelde azaltım üretir; yönü beklenen sırada (ısı pompası küçük, YEK-G büyük)', () => {
  const red = Object.fromEntries(M.order.map((k) => [k, M.evaluate(exampleBase(), [k], H.calculate, undefined, OPTS).reductionFullTco2e]));
  for (const k of M.order) assert.ok(red[k] > 0, `${k}: azaltım ${red[k]}`);
  assert.ok(red.green > red.pv && red.pv > red.led, 'YEK-G > GES > LED');
  assert.ok(red.hp < red.st, 'Türkiye şebeke faktöründe ısı pompası güneş kollektöründen daha az kazandırır');
});

test('etkileşim: iki elektrik önlemi birlikte, ayrı ayrı toplamlarından az azaltır', () => {
  const one = (k) => M.evaluate(exampleBase(), [k], H.calculate, undefined, OPTS).reductionTco2e;
  const both = M.evaluate(exampleBase(), ['led', 'keycard'], H.calculate, undefined, OPTS).reductionTco2e;
  assert.ok(both < one('led') + one('keycard') - 1e-9);
  assert.ok(both > Math.max(one('led'), one('keycard')));
  const all = M.evaluate(exampleBase(), M.order, H.calculate, undefined, OPTS);
  assert.equal(all.valid, true, JSON.stringify(plain(all.after.errors)));
  assert.ok(all.afterTco2e >= 0 && all.afterTco2e < all.beforeTco2e * 0.2, `hepsi birlikte kalan ${all.afterTco2e} / ${all.beforeTco2e}`);
});

test('sıralama (MACC): 13 satır, maliyete göre artan; hesaplanamayanlar sonda; maliyet formülü', () => {
  const rk = plain(M.ranking(exampleBase(), H.calculate, undefined, OPTS));
  assert.equal(rk.length, 13);
  assert.deepEqual(rk.map((r) => r.id).sort(), plain(M.order).slice().sort());
  const costs = rk.map((r) => r.costTlPerTco2e);
  for (let i = 1; i < costs.length; i++) assert.ok(costs[i - 1] <= costs[i], `sıra bozuk: ${costs[i - 1]} > ${costs[i]}`);
  for (const r of rk) {
    near(r.costTlPerTco2e, r.capexTl / (r.reductionFullTco2e * 10) - r.netSavingsTl / r.reductionFullTco2e, r.id);
  }
  const led = rk.find((r) => r.id === 'led'), green = rk.find((r) => r.id === 'green');
  assert.ok(led.costTlPerTco2e < 0, 'LED kendini amorti eder (negatif maliyet)');
  assert.ok(green.costTlPerTco2e > 0 && green.costTlPerTco2e < 400, `YEK-G ≈ 0,12 TL/kWh ÷ 0,469 kg/kWh ≈ 256 TL/t, gelen ${green.costTlPerTco2e}`);
  assert.ok(rk.findIndex((r) => r.id === 'led') < rk.findIndex((r) => r.id === 'green'));
});

test('sıralama: ömür ayarı yıllıklandırmayı değiştirir; uygulanamayan önlem sonda ve "applied=false"', () => {
  const b = exampleBase(); b.pv = { kwp: 0 };
  const short = plain(M.ranking(b, H.calculate, { lifetimeYears: 5 }, OPTS)), long = plain(M.ranking(b, H.calculate, { lifetimeYears: 20 }, OPTS));
  const c = (rk, id) => rk.find((r) => r.id === id).costTlPerTco2e;
  assert.ok(c(short, 'bms') > c(long, 'bms'), 'daha uzun ömür → ton başına daha düşük maliyet');
  const pv = short[short.length - 1];
  assert.equal(pv.id, 'pv'); assert.equal(pv.applied, false); assert.equal(pv.costTlPerTco2e, null);
  assert.ok(pv.notes.length > 0);
});

test('sıralama geçersiz girdide çökmez, maliyetler null olur', () => {
  const rk = plain(M.ranking({ input: H.emptyInput(), extras: {} }, H.calculate, undefined, OPTS));
  assert.equal(rk.length, 13);
  assert.ok(rk.every((r) => r.costTlPerTco2e === null && r.reductionTco2e === null));
});

test('HCMI dışı kalemler: su ve atık emisyonu', () => {
  near(M.extrasTco2e({ waterM3: 19000, wasteLandfillT: 165, wasteRecycledT: 55 }), (19000 * 0.41 + 165 * 446 + 55 * 21) / 1000);
  assert.equal(M.extrasTco2e(), 0);
  assert.equal(M.extrasTco2e({ waterM3: NaN, wasteLandfillT: 'x' }), 0);
});
