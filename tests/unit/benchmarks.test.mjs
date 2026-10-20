// Kıyas verileri ve A-E notu (assets/js/benchmarks.js).
// Rakamlar eski sayfadaki CHSB 2026 Türkiye tablosuyla ve proje belgesiyle birebir aynı olmalı.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts } from '../helpers/load-hcmi.mjs';

const { BENCH: B } = loadScripts(['assets/js/benchmarks.js']);
const plain = (x) => JSON.parse(JSON.stringify(x));

test('CHSB 2026 Türkiye segment tablosu (eski sayfayla aynı)', () => {
  const want = {
    lux:     [59.6, 0.0616, 107.3, 335.4, 1353, 6.1],
    resort5: [48.9, 0.0480, 103.5, 314.3, 970, 4.9],
    s5:      [48.9, 0.0480, 88.8, 273.8, 970, 4.9],
    s4:      [37.9, 0.0476, 75.2, 229.9, 553, 3.4],
    s3:      [25.4, 0.0231, 55.1, 170.4, 527, null],
    limited: [20.2, 0.0220, 47.3, 143.9, 377, 1.6]
  };
  assert.deepEqual(plain(B.segments.map((s) => s.id)), Object.keys(want));
  for (const s of B.segments) {
    assert.deepEqual([s.cpor, s.meet, s.co2m2, s.kwhm2, s.water, s.waste], want[s.id], s.id);
    assert.ok(s.tr && s.n, `${s.id}: ad ve tesis sayısı yazılı olmalı`);
  }
  assert.ok(B.segment('resort5').proxy, 'resort satırı vekil değer uyarısı taşımalı');
  assert.equal(B.segment('s5').proxy, undefined);
  assert.equal(B.segment('yok'), null);
});

test('kaynak kaydı', () => {
  assert.equal(B.source.year, 2024);
  assert.match(B.source.handle, /1813\/120192/);
});

test('acente konaklama katsayıları ve ülke karşılaştırması', () => {
  assert.deepEqual(plain(B.agencySegments.map((s) => [s.id, s.cpor])),
    [['lux', 59.6], ['s5', 48.9], ['s4', 37.9], ['s3', 25.4], ['limited', 20.2]]);
  assert.equal(B.fiveStarByCountry['Türkiye'], 48.9);
  assert.equal(B.fiveStarByCountry['Fransa'], 11.2);
  assert.equal(Object.keys(B.fiveStarByCountry).length, 7);
});

test('A-E not sınırları: ≤0,60 A · ≤0,85 B · ≤1,15 C · ≤1,50 D · üstü E', () => {
  const at = (r) => B.grade(r).letter;
  assert.equal(at(0), 'A'); assert.equal(at(0.6), 'A'); assert.equal(at(0.6000001), 'B');
  assert.equal(at(0.85), 'B'); assert.equal(at(0.8500001), 'C');
  assert.equal(at(1.15), 'C'); assert.equal(at(1.1500001), 'D');
  assert.equal(at(1.5), 'D'); assert.equal(at(1.5000001), 'E'); assert.equal(at(99), 'E');
});

test('geçersiz oran not vermez', () => {
  for (const r of [NaN, -0.1, Infinity, null, undefined, '0.5']) {
    const g = B.grade(r);
    assert.equal(g.letter, '—', String(r)); assert.equal(g.tone, 'muted'); assert.equal(g.label, 'veri bekleniyor');
  }
});

test('not tonları renk sınıfına eşlenir', () => {
  assert.deepEqual(['A', 'B', 'C', 'D', 'E'].map((l) => B.grades.find((g) => g.letter === l).tone), ['good', 'brand', 'warn', 'bad', 'bad']);
});

test('compare: ±%3 bandı "segment ortalamasında", dışı yüzde ile', () => {
  assert.equal(B.compare(49, 48.9).text, 'segment ortalamasında');
  assert.equal(B.compare(48.9 * 1.029, 48.9).direction, 'same');
  assert.equal(B.compare(40, 48.9).text, '%18 altında');
  assert.equal(B.compare(40, 48.9).direction, 'below');
  assert.equal(B.compare(60, 48.9).text, '%23 üzerinde');
  assert.equal(B.compare(60, 48.9).direction, 'above');
  assert.ok(Math.abs(B.compare(60, 48.9).ratio - 60 / 48.9) < 1e-12);
  for (const [v, r] of [[NaN, 1], [1, 0], [1, -3], [1, NaN], ['1', 1], [1, null]]) {
    assert.deepEqual(plain(B.compare(v, r)), { ratio: null, deltaPct: null, text: '—', direction: null }, `${v}/${r}`);
  }
});

test('gradeFor: eski sayfanın örnek oteli (CPOR 33,67, 5★ resort) B notu alır', () => {
  const g = B.gradeFor(33.67, 'resort5');
  assert.equal(g.ref, 48.9);
  assert.ok(Math.abs(g.ratio - 33.67 / 48.9) < 1e-12);
  assert.equal(g.grade.letter, 'B');
});

test('gradeFor: kendi referansınız verilirse o kullanılır; veri yoksa not yok', () => {
  assert.equal(B.gradeFor(30, 'resort5', 60).ref, 60);
  assert.equal(B.gradeFor(30, 'resort5', 60).grade.letter, 'A');
  assert.equal(B.gradeFor(30, 'resort5', 0).ref, 48.9, 'geçersiz özel referans yok sayılır');
  assert.equal(B.gradeFor(NaN, 's4').grade.letter, '—');
  assert.equal(B.gradeFor(30, 'bilinmeyen').grade.letter, '—');
  assert.equal(B.gradeFor(30, 'bilinmeyen', 40).grade.letter, 'B');
});
