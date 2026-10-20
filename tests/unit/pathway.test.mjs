// Net sıfır yol haritası (assets/js/pathway.js).
// Kaynak: Net Zero Methodology for Hotels, 2. Baskı (Haziran 2023), Tablo 3 ve Bölüm 3.1.4.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts } from '../helpers/load-hcmi.mjs';

const { NZPATH: N } = loadScripts(['assets/js/pathway.js']);
const plain = (x) => JSON.parse(JSON.stringify(x));
const near = (a, b, msg, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} ≠ ${b}`);

test('Tablo 3 rakamları kaynak metinle aynı (Kategori 1: tesis emisyon yoğunluğu)', () => {
  assert.deepEqual(plain(N.yardsticks), [2025, 2030, 2035, 2040, 2050]);
  assert.equal(N.tableBaseYear, 2019);
  const T = plain(N.table3);
  assert.deepEqual(T[2025], { absPct: 25, intPct: 41, level: 57, offsetCap: 12, energyEff: 10 });
  assert.deepEqual(T[2030], { absPct: 45, intPct: 72, level: 45, offsetCap: 7, energyEff: 20, absPctHigh: 50 });
  assert.deepEqual(T[2035], { absPct: 60, intPct: 88, level: 34, offsetCap: 5, energyEff: 25 });
  assert.deepEqual(T[2040], { absPct: 73, intPct: 95, level: 23, offsetCap: 2, energyEff: 30 });
  assert.deepEqual(T[2050], { absPct: 99, intPct: 99, level: null, offsetCap: null, energyEff: null });
  assert.match(N.source.title, /Net Zero Methodology for Hotels/);
  assert.equal(N.source.date, '2023-06');
});

test('baz yıl sınıfı: <2012 → %3, 2012-2019 → %4, 2020+ → %5', () => {
  const c = (y) => plain(N.classOf(y));
  assert.deepEqual([c(2011).id, c(2011).annualPct], ['og', 3]);
  assert.deepEqual([c(2012).id, c(2012).annualPct], ['prior', 4]);
  assert.deepEqual([c(2019).id, c(2019).annualPct], ['prior', 4]);
  assert.deepEqual([c(2020).id, c(2020).annualPct], ['recent', 5]);
  assert.deepEqual([c(2025).id, c(2025).annualPct], ['recent', 5]);
  assert.equal(c('2015').annualPct, 4, 'metin olarak gelen yıl');
  assert.equal(c(2015.4).baseYear, 2015);
  assert.equal(c(NaN).baseYear, 2025, 'yıl girilmediyse 2025 varsayılır');
  assert.equal(c(undefined).annualPct, 5);
  for (const v of [null, '', '  ', true, [], {}]) assert.equal(c(v).baseYear, 2025, `${JSON.stringify(v)} → baz yıl girilmedi`);
});

test('2019 baz yılında gereken azaltım yayımlanmış Tablo 3 ile birebir aynı', () => {
  const R = (y, k) => N.requiredReduction(y, 2019, k);
  near(R(2025, 'abs'), 0.25); near(R(2025, 'int'), 0.41);
  near(R(2030, 'abs'), 0.45); near(R(2030, 'int'), 0.72);
  near(R(2035, 'abs'), 0.60); near(R(2035, 'int'), 0.88);
  near(R(2040, 'abs'), 0.73); near(R(2040, 'int'), 0.95);
  near(R(2050, 'abs'), 0.99); near(R(2050, 'int'), 0.99);
});

test('eski baz yıl: pratik kural (yılda %4 / %3, sabit baz değerin yüzdesi) Tablo 3\'ten sıkıysa o geçerli', () => {
  const R = (by, y, k) => N.requiredReduction(y, by, k);
  near(R(2015, 2025, 'abs'), 0.40); near(R(2015, 2025, 'int'), 0.41);
  near(R(2015, 2030, 'abs'), 0.60); near(R(2015, 2030, 'int'), 0.72);
  near(R(2015, 2035, 'abs'), 0.60); near(R(2015, 2035, 'int'), 0.88);
  near(R(2005, 2025, 'abs'), 0.60); near(R(2005, 2030, 'abs'), 0.75); near(R(2005, 2035, 'abs'), 0.75);
  near(R(2005, 2040, 'abs'), 0.75); near(R(2005, 2035, 'int'), 0.88);
  near(R(1990, 2030, 'abs'), 0.99, 'üst sınır %99');
});

test('yeni baz yıl (≥2020): yılda %5 ve Tablo 3\'ün doğrusal eşdeğeri, hangisi sıkıysa', () => {
  const R = (by, y, k) => N.requiredReduction(y, by, k);
  near(R(2025, 2030, 'abs'), 0.25);                                 // 5×%5 ; tablo 0,45·5/11 = 0,2045
  near(R(2025, 2030, 'int'), 0.72 * 5 / 11);
  near(R(2025, 2035, 'abs'), 0.60 * 10 / 16);
  near(R(2025, 2035, 'int'), 0.88 * 10 / 16);
  near(R(2025, 2040, 'abs'), 0.73 * 15 / 21);
  near(R(2025, 2040, 'int'), 0.95 * 15 / 21);
  near(R(2025, 2050, 'abs'), 0.99);
  near(R(2023, 2025, 'abs'), 0.10);
  near(R(2027, 2030, 'abs'), 0.15);
  near(R(2027, 2035, 'abs'), 0.30);
});

test('baz yıl ve öncesi için gereken azaltım yok; 2050\'de baz yıl ne olursa %99', () => {
  assert.equal(N.requiredReduction(2025, 2025, 'abs'), 0);
  assert.equal(N.requiredReduction(2025, 2026, 'abs'), 0);
  assert.equal(N.requiredReduction(2030, 2030, 'int'), 0);
  assert.equal(N.requiredReduction(2031, 2019, 'abs'), 0, 'tabloda olmayan yıl');
  for (const by of [1990, 2005, 2015, 2019, 2022, 2029]) near(N.requiredReduction(2050, by, 'abs'), 0.99, `2050/${by}`);
});

test('değişmezler: azaltım yıllara göre azalmaz, ≤ %99, yoğunluk ölçütü mutlak ölçütten gevşek değildir', () => {
  for (const by of [1990, 2000, 2005, 2011, 2012, 2015, 2019, 2020, 2022, 2025, 2027, 2029]) {
    for (const kind of ['abs', 'int']) {
      let last = 0;
      for (const y of N.yardsticks) {
        const r = N.requiredReduction(y, by, kind);
        assert.ok(r >= 0 && r <= 0.99 + 1e-12, `${by}/${y}/${kind}: ${r}`);
        assert.ok(r >= last - 1e-12, `${by}/${y}/${kind} azalıyor: ${r} < ${last}`);
        last = r;
      }
    }
    for (const y of N.yardsticks) {
      assert.ok(N.requiredReduction(y, by, 'int') >= N.requiredReduction(y, by, 'abs') - 1e-12, `${by}/${y} int < abs`);
    }
  }
});

test('dönüm noktaları: 2019 baz yılı, 1.000 tCO₂e, 10.000 m²', () => {
  const ms = N.milestones({ baseYear: 2019, baseTco2e: 1000, areaM2: 10000 });
  assert.deepEqual(plain(ms.map((m) => m.year)), [2019, 2025, 2030, 2035, 2040, 2050]);
  assert.equal(ms[0].kind, 'baseline'); assert.equal(ms[0].allowedTco2e, 1000); assert.equal(ms[0].reductionPct, 0);
  const by = Object.fromEntries(ms.map((m) => [m.year, m]));

  const m25 = by[2025];
  near(m25.tests.find((t) => t.id === 'abs').allowedTco2e, 750);
  near(m25.tests.find((t) => t.id === 'int').allowedTco2e, 590);
  near(m25.tests.find((t) => t.id === 'level').allowedTco2e, 570);
  near(m25.tests.find((t) => t.id === 'level').requiredReductionPct, 43);
  near(m25.allowedTco2e, 750, 'esnek hedef: en az biri yeter → en gevşek ölçüt');
  near(m25.strictTco2e, 570, 'sıkı hedef: üçünün en sıkısı');
  near(m25.reductionPct, 25);
  assert.equal(m25.levelKgPerM2, 57); near(m25.levelTco2e, 570);
  assert.equal(m25.offsetCapKgPerM2, 12); near(m25.offsetCapTco2e, 120);
  assert.equal(m25.energyEffPct, 10);
  assert.equal(m25.renewableElectricityPct, null);

  near(by[2030].allowedTco2e, 550); near(by[2030].strictTco2e, 280); near(by[2030].offsetCapTco2e, 70);
  assert.deepEqual(plain(by[2030].renewableElectricityPct), { mature: 100, developing: 50 });
  near(by[2035].allowedTco2e, 400); near(by[2035].strictTco2e, 120);
  near(by[2040].allowedTco2e, 270); near(by[2040].strictTco2e, 50);
  near(by[2050].allowedTco2e, 10); near(by[2050].strictTco2e, 10);
  assert.equal(by[2050].levelKgPerM2, null); assert.equal(by[2050].offsetCapKgPerM2, null);
  assert.equal(by[2050].tests.length, 2, '2050\'de seviye eşiği yok');
});

test('dönüm noktaları: alan yoksa seviye ölçütü yok; baz geçersizse hedef 0; yıl listesi baz yıla göre kısalır', () => {
  const noArea = N.milestones({ baseYear: 2019, baseTco2e: 1000, areaM2: 0 });
  for (const m of noArea.slice(1)) {
    assert.equal(m.tests.find((t) => t.id === 'level'), undefined, String(m.year));
    assert.equal(m.levelTco2e, null); assert.equal(m.offsetCapTco2e, null);
  }
  const noBase = N.milestones({ baseYear: 2019, baseTco2e: 0, areaM2: 10000 });
  assert.ok(noBase.every((m) => m.allowedTco2e === 0 && m.strictTco2e === 0));
  assert.deepEqual(plain(N.milestones({ baseYear: 2026, baseTco2e: 500, areaM2: 8000 }).map((m) => m.year)), [2026, 2030, 2035, 2040, 2050]);
  assert.deepEqual(plain(N.milestones({ baseYear: 2050, baseTco2e: 500, areaM2: 8000 }).map((m) => m.year)), [2050]);
  const bare = N.milestones();
  assert.equal(bare[0].year, 2025, 'parametresiz çağrı çökmez; baz yıl 2025 varsayılır');
  assert.equal(bare.length, 5);
});

test('çok verimli otel: hedef baz yılın üstüne çıkmaz', () => {
  // 300 t / 10.000 m² = 30 kg/m² — 2025 seviye eşiği (57 kg/m² = 570 t) zaten karşılanıyor
  const ms = N.milestones({ baseYear: 2019, baseTco2e: 300, areaM2: 10000 });
  assert.equal(ms[1].allowedTco2e, 300);
  assert.ok(ms.every((m) => m.allowedTco2e <= 300 && m.strictTco2e <= 300));
});

test('hedef çizgisi: dönüm noktaları arasında doğrusal ara değer', () => {
  const ms = N.milestones({ baseYear: 2019, baseTco2e: 1000, areaM2: 10000 });
  near(N.targetAt(ms, 2000), 1000); near(N.targetAt(ms, 2019), 1000);
  near(N.targetAt(ms, 2022), 875); near(N.targetAt(ms, 2025), 750);
  near(N.targetAt(ms, 2050), 10); near(N.targetAt(ms, 2080), 10);
  near(N.targetAt(ms, 2022, 'strictTco2e'), 785);
  assert.ok(Number.isNaN(N.targetAt([], 2030)));
});

test('plan çizgisi: başlangıca kadar baz, bitişte plan, arası doğrusal', () => {
  const P = (y) => N.planAt(1000, 400, 2026, 2030, y);
  assert.equal(P(2020), 1000); assert.equal(P(2026), 1000);
  near(P(2028), 700); assert.equal(P(2030), 400); assert.equal(P(2040), 400);
  assert.equal(N.planAt(1000, 400, 2026, 2026, 2027), 400, 'bitiş = başlangıç → anında');
  assert.equal(N.planAt(1000, 400, 2026, 2020, 2027), 400);
});

test('değerlendirme: plan 700 t sabit', () => {
  const ms = N.milestones({ baseYear: 2019, baseTco2e: 1000, areaM2: 10000 });
  const ev = N.evaluate(ms, () => 700);
  assert.deepEqual(plain(ev.map((e) => e.year)), [2025, 2030, 2035, 2040, 2050]);
  assert.equal(ev[0].met, true); assert.equal(ev[0].gapTco2e, 0);
  assert.deepEqual(plain(ev[0].passedTests.map((t) => [t.id, t.ok])), [['abs', true], ['int', false], ['level', false]]);
  assert.equal(ev[1].met, false); near(ev[1].gapTco2e, 150);
  near(ev[2].gapTco2e, 300); near(ev[3].gapTco2e, 430); near(ev[4].gapTco2e, 690);
  near(ev[1].targetTco2e, 550); near(ev[1].strictTco2e, 280); near(ev[1].offsetCapTco2e, 70);
});

test('grafik dizisi: yıl sayısı ve uç değerler', () => {
  const ms = N.milestones({ baseYear: 2019, baseTco2e: 1000, areaM2: 10000 });
  const s = N.series(ms, (y) => 1000 - (y - 2019) * 10, 2019, 2050);
  assert.equal(s.years.length, 32); assert.equal(s.target.length, 32); assert.equal(s.plan.length, 32);
  assert.equal(s.years[0], 2019); assert.equal(s.years[31], 2050);
  near(s.target[0], 1000); near(s.target[31], 10); near(s.plan[31], 690);
});

test('Kapsam 1 dengeleme üst sınırı: min(Kapsam 1, sınır kg/m² × alan)', () => {
  near(N.scope1OffsetAllowance(2030, 10000, 100), 70);
  near(N.scope1OffsetAllowance(2030, 10000, 30), 30);
  near(N.scope1OffsetAllowance(2025, 10000, 1e9), 120);
  assert.equal(N.scope1OffsetAllowance(2030, 10000, -5), 0);
  assert.equal(N.scope1OffsetAllowance(2030, 0, 100), null);
  assert.equal(N.scope1OffsetAllowance(2050, 10000, 100), null);
  assert.equal(N.scope1OffsetAllowance(2045, 10000, 100), null);
});

test('niceMax: eksen üst sınırı için yuvarlak sayı', () => {
  for (const v of [0, -5, NaN, undefined]) assert.equal(N.niceMax(v), 1, String(v));
  assert.equal(N.niceMax(87), 100); assert.equal(N.niceMax(1234), 1500); assert.equal(N.niceMax(10), 10);
  assert.equal(N.niceMax(1), 1); assert.equal(N.niceMax(1.1), 1.2); assert.equal(N.niceMax(999), 1000);
  near(N.niceMax(0.04), 0.04, '', 1e-15);
  for (const v of [3, 17, 250, 4321, 98765]) assert.ok(N.niceMax(v) >= v, String(v));
});
