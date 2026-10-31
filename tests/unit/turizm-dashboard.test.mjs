// Otel paneli veri katmanı (assets/js/turizm/dashboard.js): sayıların hesapla aynı olması, yıllar arası
// geçmişin aynı yöntemle yeniden hesaplanması, Türkçe yıl ekleri, değişim yönü, kaldıraç ve sıradaki adımlar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from '../helpers/load-hcmi.mjs';

const ctx = loadApp();
const T = ctx.TURIZM, M = T.model, D = T.dashboard;
const A = (x) => JSON.parse(JSON.stringify(x));           // vm bağlamındaki diziler: ana bağlama çevir
const near = (a, b, msg = '', tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} ${a} ≠ ${b}`);
const ex = () => M.exampleState();
function rec(st, id, t) { return { id, year: st.hotel.year, company: st.hotel.name, createdAt: t, inputs: JSON.parse(JSON.stringify(st)) }; }

test('Türkçe yıl ekleri: okunuşa göre -e/-a, -ye/-ya, -de/-te, -den/-ten', () => {
  const dat = { 2019: "2019'a", 2020: "2020'ye", 2021: "2021'e", 2022: "2022'ye", 2023: "2023'e", 2024: "2024'e", 2025: "2025'e",
    2026: "2026'ya", 2027: "2027'ye", 2028: "2028'e", 2029: "2029'a", 2030: "2030'a", 2040: "2040'a", 2050: "2050'ye", 2000: "2000'e" };
  for (const [y, w] of Object.entries(dat)) { assert.equal(D.sfx(+y, 'dat'), w); }
  assert.equal(D.sfx(2035, 'loc'), "2035'te"); assert.equal(D.sfx(2030, 'loc'), "2030'da"); assert.equal(D.sfx(2040, 'loc'), "2040'ta");
  assert.equal(D.sfx(2022, 'abl'), "2022'den"); assert.equal(D.sfx(2023, 'abl'), "2023'ten"); assert.equal(D.sfx(2026, 'abl'), "2026'dan");
});

test('değişim: azalması iyi olanlarda düşüş iyileşme; yenilenebilirde artış iyi ve puanla', () => {
  const a = D.delta('cpor', 40, 36, 2024);
  assert.equal(a.better, true); assert.equal(a.dir, 'down');
  assert.equal(a.text, "2024'e göre %10 daha az"); assert.equal(a.since, "2024'ten bu yana %10 azaldı");
  const b = D.delta('total', 1000, 1050, 2022);
  assert.equal(b.better, false); assert.equal(b.text, "2022'ye göre %5 daha fazla");
  assert.equal(D.delta('kwhm2', 200, 200.4, 2024).dir, 'same');
  const r = D.delta('renew', 2.5, 5.9, 2023);
  assert.equal(r.better, true); assert.equal(r.text, "2023'e göre 3,4 puan arttı");
  assert.equal(D.delta('cpor', null, 30, 2024), null);
  assert.equal(D.delta('cpor', 0, 30, 2024), null);
});

test('geçmiş: her yılın en son kaydı, ekrandaki yıl hariç, aynı tesis, bugünkü yöntemle yeniden hesap', () => {
  const cur = ex();                                        // 2025, Örnek Tatil Köyü
  const y24a = ex(); y24a.hotel.year = 2024; y24a.hotel.energy[0].total = 1500000;
  const y24b = ex(); y24b.hotel.year = 2024; y24b.hotel.energy[0].total = 1600000;   // daha yeni kayıt
  const y23 = ex(); y23.hotel.year = 2023;
  const other = ex(); other.hotel.year = 2022; other.hotel.name = 'Başka Otel';
  const same25 = ex();                                     // ekrandaki yıl: geçmişe girmez
  const broken = { id: 'x', year: 2021, inputs: { schema: 'commited.turizm.state/2', hotel: { year: 2021 } } };
  const hist = D.history([rec(y24a, 'a', 10), rec(y24b, 'b', 20), rec(y23, 'c', 5), rec(other, 'd', 30), rec(same25, 'e', 40), broken, null], cur);
  assert.deepEqual(A(hist.map((h) => h.year)), [2023, 2024]);
  assert.equal(hist[1].id, 'b', '2024 için en son kayıt');
  near(hist[1].total, T.compute(M.load(JSON.parse(JSON.stringify(y24b))).state).totals.hcmiT, '2024 toplamı');
  assert.ok(hist.every((h) => h.ok && !h.sample));
  // ad boşsa tüm otel kayıtları
  const anon = ex(); anon.hotel.name = '';
  assert.deepEqual(A(D.history([rec(other, 'd', 30)], anon).map((h) => h.year)), [2022]);
  // eski sürümün kaydı (alan kimliği haritası) aktarılıp hesaplanır
  const legacy = { id: 'l', year: 2024, company: 'Örnek Tatil Köyü', createdAt: 1, inputs: { ...M.LEGACY_EXAMPLE, h_year: '2024' } };
  const lh = D.history([legacy], cur);
  assert.equal(lh.length, 1); assert.equal(lh[0].year, 2024); assert.ok(lh[0].total > 0);
});

test('örnek geçmiş: üç önceki yıl, önlemsiz, ayak izi yıllar içinde azalır', () => {
  const cur = ex();
  const recs = D.sampleRecords(cur);
  assert.deepEqual(A(recs.map((r) => r.year)), [2022, 2023, 2024]);
  assert.ok(recs.every((r) => r.inputs.hotel.measures.length === 0));
  const hist = D.history(recs, cur, { sample: true });
  assert.equal(hist.length, 3);
  assert.ok(hist.every((h) => h.sample));
  const R = T.compute(cur);
  const totals = hist.map((h) => h.total).concat([R.totals.hcmiT]);
  for (let i = 1; i < totals.length; i++) { assert.ok(totals[i] < totals[i - 1], 'azalmalı: ' + totals.join(' > ')); }
});

test('model: ana sayılar hesapla aynı; kartlar, kaynaklar, plan ve yol tutarlı', () => {
  const s = ex(), R = T.compute(s), hist = D.history(D.sampleRecords(s), s, { sample: true });
  const m = D.model(s, R, hist, { sample: true });
  assert.equal(m.ok, true); assert.equal(m.sample, true); assert.equal(m.name, 'Örnek Tatil Köyü'); assert.equal(m.year, 2025);
  near(m.hero.cpor, R.metrics.cpor); assert.equal(m.hero.grade, 'B'); near(m.hero.ref, 48.9);
  near(m.hero.total, R.totals.hcmiT); near(m.hero.afterCpor, R.scenario.afterCpor);
  assert.equal(m.hero.delta.better, true);
  assert.match(m.hero.delta.text, /^2024'e göre %[\d,]+ daha az$/);
  // kartlar
  assert.deepEqual(A(m.tiles.map((t) => t.id)), ['total', 'meet', 'co2m2', 'kwhm2', 'water', 'waste']);
  const kwh = m.tiles.find((t) => t.id === 'kwhm2');
  near(kwh.value, R.intensity.kwhm2); assert.equal(kwh.vsSegment.text, 'Segment ortalamasının %24 altında'); assert.equal(kwh.vsSegment.better, true);
  assert.equal(m.tiles.find((t) => t.id === 'waste').vsSegment.better, false);
  assert.equal(m.tiles.find((t) => t.id === 'meet').vsSegment.better, null, 'ortalamada');
  assert.ok(m.tiles.every((t) => t.spark && t.spark.length === 4));
  // yıllar
  assert.deepEqual(A(m.trend.byId.total.points.map((p) => p.year)), [2022, 2023, 2024, 2025]);
  assert.equal(m.trend.byId.total.points[3].current, true);
  assert.match(m.trend.byId.cpor.change.since, /^2022'den bu yana %\d+ azaldı$/);
  // kaynaklar: ilk 6 + "Diğer" toplamı HCMI kaynaklarına eşit; kapsamlar toplamı HCMI toplamı
  const srcSum = m.sources.top.reduce((a, x) => a + x.t, 0);
  near(srcSum, m.sources.total, 'kaynak toplamı', 1e-9);
  near(m.sources.scopes.reduce((a, x) => a + x.t, 0), R.totals.hcmiT, 'kapsam toplamı', 1e-9);
  assert.ok(m.sources.top.length <= 7);
  // kaldıraç: şebeke elektriği için YEK-G değil, verimlilik önlemi önerilir
  assert.equal(m.sources.lever.source.id, 'grid');
  assert.equal(m.sources.lever.measure.id, 'bms');
  // sıradaki adımlar: seçilenler yok, YEK-G en sonda
  assert.ok(m.next.every((x) => !s.hotel.measures.includes(x.id)));
  assert.equal(m.next[m.next.length - 1].id, 'green'); assert.equal(m.next[m.next.length - 1].afterOthers, true);
  for (let i = 1; i < m.next.length - 1; i++) { assert.ok(m.next[i].reductionT <= m.next[i - 1].reductionT); }
  // plan ve 2030
  assert.equal(m.plan.selected.length, 3); near(m.plan.savedT, R.scenario.savedT);
  assert.equal(m.plan.target.met, true); assert.ok(m.plan.target.coverage >= 1);
  // net sıfır yolu: geçmiş yıllar + baz yıl (bina enerjisi, aynı temel)
  assert.deepEqual(A(m.path.actual.map((a) => a.year)), [2022, 2023, 2024, 2025]);
  near(m.path.actual[3].t, R.path.baseT); assert.equal(m.path.firstGap.year, 2035);
  // karbon dışı
  assert.equal(m.people.local, 65); near(m.people.trained, 110 / 145 * 100); near(m.people.perGuest.waterL, 19000 * 1000 / 47300);
});

test('model: geçmiş yoksa değişim ve çizgi yok; ekrandaki yıl geçmiş bir yılsa sonraki yıllar kıyasa girmez', () => {
  const s = ex(), R = T.compute(s);
  const m = D.model(s, R, []);
  assert.equal(m.hero.delta, null); assert.equal(m.trend.years, 1);
  assert.ok(m.tiles.every((t) => t.delta === null && t.spark === null));
  // ekranda 2024, kayıtlarda 2023 ve 2025
  const cur = ex(); cur.hotel.year = 2024;
  const y23 = ex(); y23.hotel.year = 2023; const y25 = ex();
  const hist = D.history([rec(y23, 'a', 1), rec(y25, 'b', 2)], cur);
  const m2 = D.model(cur, T.compute(cur), hist);
  assert.deepEqual(A(m2.trend.byId.total.points.map((p) => p.year)), [2023, 2024, 2025]);
  assert.match(m2.hero.delta.text, /^2023'e göre/);
});

test('model: boş ya da eksik veride panel boş durum döndürür', () => {
  const e = M.emptyState();
  const m = D.model(e, T.compute(e), []);
  assert.equal(m.ok, false); assert.equal(m.started, false);
  const half = ex(); half.hotel.area = { conditioned: null, rooms: null, meeting: null }; half.hotel.occupiedRooms = null;
  const R = T.compute(half);
  if (!R.usable) { assert.equal(D.model(half, R, []).ok, false); }
});
