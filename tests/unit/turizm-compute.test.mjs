// Turizm sayfası hesap katmanı (compute.js), acente hesabı (agency.js), çıktı metinleri (texts.js)
// ve tarayıcı belleği (storage.js). Hesabın kendisi resmî modüllerde olduğu için burada
// birleştirmenin doğruluğu, mesajlar ve eski sürümle bilinen farklar sınanır.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadApp, ROOT } from '../helpers/load-hcmi.mjs';

const ctx = loadApp();
const { TURIZM, HCMI: H, MEASURES: MS, NZPATH: P, BENCH: B, TR_REFERENCE: T } = ctx;
const M = TURIZM.model, C = TURIZM.compute, A = TURIZM.agency, X = TURIZM.texts;
const plain = (x) => JSON.parse(JSON.stringify(x));
const near = (a, b, msg = '', tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} ${a} ≠ ${b}`);
const ex = () => M.exampleState();
const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/golden/baseline-v4.json'), 'utf8'));

test('örnek otel: toplam, motorun doğrudan sonucuyla aynı (Türkiye 2025 → ETKB 2023 faktörü)', () => {
  const s = ex(), R = C(s);
  const direct = H.calculate(M.buildInput(s).input, { efOverrides: T.efOverrides(2023) });
  assert.equal(R.usable, true); assert.equal(R.valid, true);
  assert.equal(R.totals.hcmiT, direct.total.tco2e);
  assert.equal(R.metrics.cpor, direct.total.cporKg);
  assert.equal(R.metrics.meetH, direct.total.meetingKgPerAreaHour);
  // Bina enerjisi (NZMFH Kategori 1): sabit yakıtlar + elektrik; araç, soğutucu gaz, çamaşırhane hariç
  const building = direct.rows.filter((r) => r.stationary).reduce((a, r) => a + r.otherKg, 0) / 1000;
  near(R.totals.buildingT, building);
  near(R.totals.buildingT, (1480000 * 0.469 + 92000 * H.toKwh('Natural Gas', 'CuM', 1) * 0.202543197
    + 5500 * H.toKwh('Liquefied Petroleum Gas (LPG)', 'kg', 1) * 0.227741181 + 3200 * H.toKwh('Diesel (Stationary)', 'L', 1) * 0.268318934) / 1000, 'elle', 1e-9);
  near(R.totals.extrasT, (19000 * 0.41 + 165 * 446 + 55 * 21) / 1000);
  near(R.totals.fullT, R.totals.hcmiT + R.totals.extrasT);
  assert.equal(R.grid.value, 0.469); assert.equal(R.grid.basisYear, 2023);
});

test('örnek otel: sabitlenmiş yeni sonuçlar (değişirse bilerek güncellenmeli)', () => {
  const R = C(ex());
  near(R.totals.hcmiT, 1059.6077877066716, 'HCMI toplam', 1e-12);
  near(R.metrics.cpor, 34.37108875461419, 'CPOR', 1e-12);
  near(R.metrics.meetH, 0.04759073827561966, 'toplantı', 1e-12);
  assert.equal(R.bench.grade.letter, 'B');
  near(R.bench.ratio, 34.37108875461419 / 48.9);
  near(R.intensity.co2m2, 1059.6077877066716 * 1000 / 11500);
  near(R.intensity.waterL, 19000 * 1000 / 26280);
  near(R.intensity.wasteKg, 220 * 1000 / 26280);
});

test('eski sürümle fark bilinen nedenlerden: aynı örnek eski sayfada 1.037,97 t / 33,67 kg idi', () => {
  const R = C(ex());
  assert.equal(baseline.hotel.total, 1037970);
  const diff = R.totals.hcmiT - baseline.hotel.total / 1000;
  assert.ok(diff > 15 && diff < 30, `fark ${diff}`);
  // Elektrik aynı faktör (0,469): fark yalnız yakıt / soğutucu gaz / çamaşırhane faktörlerinden gelir
  const grid = R.sources.find((x) => x.id === 'grid');
  near(grid.t, 1480000 * 0.469 / 1000);
  // Eski: çamaşırhane 128.000 kg × 0,65 = 83,2 t ; HCMI: ton başına 180 kWh elektrik + 1.560 kWh gaz + 111 L fuel-oil
  const laundry = R.sources.find((x) => x.id === 'laundry');
  assert.ok(laundry.t > 83.2 && laundry.t < 100, String(laundry.t));
  // Eski toplantı metriği satılan salon saatine (1.200 sa) bölüyordu (0,142); HCMI 365 × 10 saat kullanır
  assert.ok(R.metrics.meetH < 0.05);
});

test('kaynak dökümü ve kapsamlar toplamı tutar', () => {
  const R = C(ex());
  const hcmiSum = R.sources.filter((x) => x.hcmi).reduce((a, x) => a + x.t, 0);
  near(hcmiSum, R.totals.hcmiT, 'HCMI kaynakları', 1e-9);
  near(R.sources.reduce((a, x) => a + x.t, 0), R.totals.fullT, 'tam envanter', 1e-9);
  const sc = R.scopes;
  near(sc.s1 + sc.uplift + sc.s2Market + sc.s3Laundry, R.totals.hcmiT, 'kapsamlar', 1e-9);
  assert.equal(sc.s2Location, sc.s2Market, 'YEK-G yokken konum = piyasa');
  for (let i = 1; i < R.sources.length; i++) assert.ok(R.sources[i - 1].t >= R.sources[i].t, 'büyükten küçüğe');
  assert.deepEqual(plain(R.sources.filter((x) => !x.hcmi).map((x) => x.id).sort()), ['waste', 'water']);
});

test('YEK-G mahsubu: piyasa bazlı Kapsam 2 ve kaynak satırı düşer, konum bazlı değişmez', () => {
  const s = ex(); s.hotel.market = [{ description: 'YEK-G', kwh: 500000 }];
  const R = C(s), R0 = C(ex());
  near(R.scopes.s2Location, R0.scopes.s2Location);
  near(R.scopes.s2Market, R0.scopes.s2Market - 500000 * 0.469 / 1000);
  const g = R.sources.find((x) => x.id === 'grid');
  near(g.t, (1480000 - 500000) * 0.469 / 1000); assert.match(g.label, /piyasa bazlı/);
  assert.ok(R.renewable.elecPct > R0.renewable.elecPct);
});

test('enerji defteri satır sonuçları durumdaki sıraya göre (boş satırlar atlanır)', () => {
  const s = M.emptyState(); s.hotel.energy[1].total = 1000; s.hotel.energy[4].total = 100;
  const R = C(s);
  assert.equal(R.rows[0], null); assert.equal(R.rows[2], null);
  near(R.rows[1].t, 1000 * H.toKwh('Natural Gas', 'CuM', 1) * H.defaultEf('Turkey', 'Turkey', 'Natural Gas').value / 1000);
  assert.ok(R.rows[4].t > 0); assert.equal(R.rows[4].efSource, 'hcmi');
});

test('birim değiştirmek sonucu değiştirmez (miktar aynı enerjiye çevrilir)', () => {
  const s = ex(), R0 = C(s);
  M.setRowUnit(s.hotel.energy[1], 'kWh'); M.setRowUnit(s.hotel.energy[0], 'MWh'); M.setRowUnit(s.hotel.energy[2], 'L');
  const R1 = C(s);
  near(R1.totals.hcmiT, R0.totals.hcmiT, 'toplam', 1e-9);
  near(R1.scenario.netSavingsTl, R0.scenario.netSavingsTl, 'TL tasarrufu', 1e-6);
});

test('boş form: sonuç yok, mesaj yok, patika yok', () => {
  const R = C(M.emptyState());
  assert.equal(R.started, false);
  assert.deepEqual(plain(R.messages), { errors: [], warnings: [], info: [] });
  assert.equal(R.path, null); assert.equal(R.completeness.score, 0);
  assert.equal(R.metrics.cpor, null); assert.equal(R.bench.grade.letter, '—');
});

test('yalnız elektrik girildi: toplam var, metrik yok; eksikler mesajla ve doğru alana bağlı', () => {
  const s = M.emptyState(); s.hotel.energy[0].total = 100000;
  const R = C(s);
  assert.equal(R.started, true); assert.equal(R.usable, true); assert.equal(R.valid, false);
  near(R.totals.hcmiT, 100000 * 0.469 / 1000);
  assert.equal(R.metrics.cpor, null);
  const e = plain(R.messages.errors);
  assert.deepEqual(e.map((m) => [m.code, m.path]), [['area', 'hotel.area.rooms'], ['occupied', 'hotel.occupiedRooms']]);
  assert.ok(R.messages.info.some((m) => m.code === 'noYear'));
  // önlemler yine hesaplanır (alan/oda eksikliği toplamı etkilemez)
  s.hotel.measures = ['led']; s.hotel.rooms = 10;
  const R2 = C(s);
  assert.equal(R2.scenario.valid, true);
  near(R2.scenario.savedT, 100000 * 0.12 * 0.55 * 0.469 / 1000);
});

test('motor hataları ilgili satıra bağlanır (durumdaki satır sırası)', () => {
  const s = M.emptyState(); s.hotel.energy[0].total = 1000;
  const cw = M.addEnergyRow(s, 'chilled_water'); cw.total = 500;
  const R = C(s), idx = s.hotel.energy.indexOf(cw);
  assert.equal(R.usable, false);
  const m = R.messages.errors.find((x) => x.code === 'noDefaultEf');
  assert.equal(m.path, `hotel.energy.${idx}.manualEf`); assert.equal(m.row, idx);
  cw.efMode = 'manual'; cw.manualEf = 0.12;
  const R2 = C(s);
  assert.equal(R2.usable, true); near(R2.rows[idx].t, 500 * 0.12 / 1000); assert.equal(R2.rows[idx].efSource, 'manual');
  // aynı tür iki dolu satırda → kullanılamaz
  const s3 = M.emptyState(); s3.hotel.energy[0].total = 10; s3.hotel.energy.push({ ...plain(s3.hotel.energy[0]), id: 'e9', total: 5 });
  const R3 = C(s3);
  assert.equal(R3.usable, false); assert.ok(R3.messages.errors.some((x) => x.code === 'duplicate'));
});

test('sayfa kontrolleri: alan aşımı, çamaşır miktarı, özel alan, yıl, araç seçimi', () => {
  const s = ex(); s.hotel.area.conditioned = 5000;
  s.hotel.laundry = { outsourced: true, method: 'tonnage', tonnageKg: null, items: [] };
  s.hotel.privateSpace = { has: true, method: 'actual', sharePct: null };
  s.hotel.mobileFuels = 'none'; s.hotel.energy = s.hotel.energy.filter((r) => !/_mob$/.test(r.typeId));
  const codes = (R) => [...R.messages.errors, ...R.messages.warnings, ...R.messages.info].map((m) => m.code);
  const R = C(s), c = codes(R);
  for (const k of ['areaExceeds', 'laundryNoAmount', 'privateNone', 'gridYear']) assert.ok(c.includes(k), k + ' yok: ' + c.join(','));
  assert.ok(!c.includes('mobileMissing'), '"aracımız yok" açık seçimdir, uyarı gösterilmez');
  s.hotel.year = 2023; assert.ok(!codes(C(s)).includes('gridYear'), '2023 yayımlanmış');
  s.hotel.year = 2019; assert.ok(codes(C(s)).includes('gridYear'), 'seri öncesi');
  const s2 = ex(); s2.hotel.refrigerants.items[0].kg = null;
  const w = C(s2).messages.warnings.find((m) => m.code === 'refNone');
  assert.match(w.message, /dolum miktarını biliyorum/); assert.equal(w.path, 'hotel.refrigerants.mode');
  const s3 = ex(); s3.hotel.area.meeting = null;
  const R3 = C(s3);
  assert.ok(R3.messages.info.some((m) => m.code === 'noMeeting'), 'toplantı alanı yok → bilgi (uyarı değil)');
  assert.equal(R3.metrics.meetH, null); near(R3.metrics.shareRooms, 1);
});

test('veri tamlığı ve taksonomi skoru', () => {
  const s = ex();
  assert.deepEqual(plain(C(s).completeness), { score: 100, missing: [] });
  s.hotel.extras.waterM3 = null; s.hotel.refrigerants.items[0].kg = null;
  const c = plain(C(s).completeness);
  assert.equal(c.score, 90); assert.deepEqual(c.missing.map((m) => m.name), ['soğutucu gaz', 'su']);
  s.hotel.refrigerants.mode = 'default1pct'; assert.equal(C(s).completeness.score, 95, 'HCMI tahmini de bir yanıttır');
  for (const t of M.TAXONOMY) s.hotel.taxonomy[t.id] = true;
  const tx = plain(C(s).taxonomy);
  assert.equal(tx.score, 100); assert.equal(tx.recs.length, 1); assert.match(tx.recs[0], /hazırsınız/);
  s.hotel.taxonomy = { t_sert: true };
  assert.equal(C(s).taxonomy.score, 40); assert.equal(C(s).taxonomy.recs.length, 3);
});

test('azaltım senaryosu ve sıralama measures.js ile birebir', () => {
  const s = ex(), R = C(s);
  const { input } = M.buildInput(s), base = M.measuresBase(s, input), opts = M.calcOptions(s);
  const direct = MS.evaluate(base, ['led', 'water', 'pv'], H.calculate, {}, opts);
  near(R.scenario.savedT, direct.reductionTco2e); near(R.scenario.capexTl, direct.capexTl); near(R.scenario.netSavingsTl, direct.netSavingsTl);
  assert.deepEqual(plain(R.scenario.applied), ['led', 'water', 'pv']);
  assert.ok(R.scenario.afterCpor < R.metrics.cpor);
  const rk = MS.ranking(base, H.calculate, {}, opts);
  assert.deepEqual(R.ranking.map((r) => r.id), rk.map((r) => r.id));
  assert.ok(R.ranking.find((r) => r.id === 'led').selected);
  for (let i = 1; i < R.ranking.length; i++) {
    const a = R.ranking[i - 1].costTlPerT, b = R.ranking[i].costTlPerT;
    if (a !== null && b !== null) assert.ok(a <= b, 'karbon maliyetine göre sıralı');
  }
  const s0 = ex(); s0.hotel.measures = [];
  const R0 = C(s0);
  assert.equal(R0.scenario.any, false); assert.equal(R0.scenario.savedT, 0); near(R0.scenario.afterT, R0.totals.hcmiT);
});

test('net sıfır patikası: bina enerjisi emisyonu (NZMFH Kategori 1) ile', () => {
  const R = C(ex()), p = R.path;
  near(p.baseT, R.totals.buildingT); near(p.planT, R.scenario.afterBuildingT);
  assert.ok(R.totals.buildingT < R.totals.hcmiT - R.totals.laundryT, 'araç ve soğutucu gaz hariç');
  assert.equal(p.baseYear, 2025); assert.equal(p.start, 2026); assert.equal(p.done, 2030); assert.equal(p.cls.id, 'recent');
  const ms = P.milestones({ baseYear: 2025, baseTco2e: R.totals.buildingT, areaM2: 11500 });
  assert.deepEqual(plain(p.milestones), plain(ms));
  assert.equal(p.series.years[0], 2025); assert.equal(p.series.years.at(-1), 2050);
  assert.equal(p.series.years.length, p.series.target.length);
  assert.equal(p.m2030.year, 2030);
  near(p.m2030.targetTco2e, ms.find((m) => m.year === 2030).allowedTco2e);
  const s = ex(); s.hotel.year = null;
  const R2 = C(s); assert.equal(R2.path.baseYear, 2025); assert.equal(R2.path.yearGiven, false);
  const s3 = ex(); s3.hotel.netZero = { start: 2028, done: 2027 };
  const p3 = C(s3).path; assert.equal(p3.start, 2028); assert.equal(p3.done, 2028, 'bitiş başlangıçtan önce olamaz');
});

test('dengeleme ve etkinlik hesabı (HCMI Tab C)', () => {
  const s = ex(), R = C(s);
  near(R.offsets.remainingT, R.scenario.afterT);
  near(R.offsets.costTl, R.scenario.afterT * 400);
  assert.equal(R.offsets.verCount, Math.ceil(R.scenario.afterT));
  near(R.offsets.perRoomNightTl, R.scenario.afterT * 400 / 26280);
  near(R.event.stayKg, 300 * R.metrics.cpor); near(R.event.meetingKg, 400 * 24 * R.metrics.meetH);
  near(R.event.totalKg, R.event.stayKg + R.event.meetingKg); near(R.event.perPersonKg, R.event.totalKg / 150);
  assert.equal(R.event.valid, true);
});

test('acente: eski sayfanın örneğiyle birebir aynı toplam (1.128.222 kg)', () => {
  const a = ex().agency, r = A.compute(a);
  assert.equal(r.totalKg, baseline.agency.total);
  assert.equal(r.totalKg, 1128222);
  near(r.perGuestKg, 1128222 / 3600); near(r.perTourT, 1128.222 / 120);
  assert.equal(r.trees, Math.round(1128222 / 25));
  assert.equal(r.factors.officeKwh, 0.469);
  assert.equal(r.stay.kg, 7200 * 37.9); assert.equal(r.started, true);
  a.split = true;
  const r2 = A.compute(a);
  assert.equal(r2.stay.kg, 2400 * 48.9 + 3600 * 37.9 + 1200 * 25.4);
  near(r2.stay.cpor, r2.stay.kg / 7200);
  assert.equal(A.compute(M.emptyAgency()).totalKg, 0); assert.equal(A.compute(M.emptyAgency()).started, false);
  a.icucus = -500; assert.equal(A.compute(a).parts[0].kg, 0, 'negatif değer sayılmaz (eski davranış)');
});

test('metinler: beyan, özet, JSON, acente özeti', () => {
  const s = ex(), R = C(s);
  const d = X.declaration(s, R);
  assert.match(d, /^KARBON AYAK İZİ BEYANI — Örnek Tatil Köyü \(Muğla\)/);
  assert.match(d, /Oda-gece başına karbon \(CPOR\): 34,4 kgCO2e/);
  assert.match(d, /Toplantı alanı: 0,0476 kgCO2e\/m2\/saat/);
  assert.match(d, /HCMI ayak izi toplamı: 1\.060 tCO2e/);
  assert.match(d, /Şebeke elektriği faktörü: 0,469 kgCO2e\/kWh \(ETKB 2023, dağıtım hattı tüketim noktası\)/);
  assert.match(d, /Doğrulama durumu: Doğrulanmadı — iç hesaplama/);
  assert.ok(!/HCMI tahmini ek/.test(d), 'tahmini ek yokken satır yazılmaz');
  const e = X.executive(s, R);
  assert.match(e, /^Otel Karbon Özeti — Örnek Tatil Köyü \(2025\)/);
  assert.match(e, /kıyas notu B/); assert.match(e, /2030 hedefi \(NZMFH\)/); assert.match(e, /Taksonomi hazırlık skoru: 0\/100/);
  const j = plain(X.exportObject(s, R));
  assert.equal(j.schema, 'commited.hotel.hcmi/2');
  assert.equal(j.hcmi.footprintT, Math.round(R.totals.hcmiT * 100) / 100);
  assert.equal(j.energy.length, 7); assert.equal(j.energy[0].typeId, 'grid'); assert.equal(j.energy[0].ef, 0.469);
  assert.equal(j.gridFactor.basisYear, 2023); assert.match(j.gridFactor.url, /^https:\/\/enerji\.gov\.tr\//);
  assert.equal(j.benchmark.grade, 'B'); assert.equal(j.netZero.milestones.length, 4);
  assert.ok(JSON.stringify(j).length < 20000);
  const ag = X.agencySummary(s, A.compute(s.agency));
  assert.match(ag, /Yıllık toplam: 1\.128,2 tCO₂e/); assert.match(ag, /Konaklama: 7\.200 oda-gece × 37,9/);
  assert.equal(X.whatsappUrl('a b&c'), 'https://wa.me/?text=a%20b%26c');
  const s2 = ex(); s2.hotel.refrigerants.mode = 'default1pct';
  assert.match(X.declaration(s2, C(s2)), /HCMI tahmini ek \(soğutucu gaz \/ araç yakıtı, %1\)/);
  assert.equal(X.declaration(M.emptyState(), C(M.emptyState())).length > 0, true, 'boş formda da metin üretilir (0 değerlerle)');
});

test('tarayıcı belleği: kutu işaretliyse saklar, değilse siler; eski anahtar aktarılır', () => {
  const mem = new Map();
  ctx.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const S = TURIZM.storage, s = ex();
  assert.equal(S.save(s), true); assert.equal(mem.has(S.KEY), false, 'kutu kapalı: saklanmaz');
  s.options.saveLocal = true; S.save(s);
  const back = S.load(); assert.equal(back.from, 'v2'); assert.equal(back.state.hotel.name, 'Örnek Tatil Köyü');
  s.options.saveLocal = false; S.save(s); assert.equal(mem.has(S.KEY), false, 'kutu kapatılınca silinir');
  mem.set(S.LEGACY_KEY, JSON.stringify({ ...M.LEGACY_EXAMPLE, opt_save: true }));
  const old = S.load(); assert.equal(old.from, 'v1'); assert.equal(old.legacy, true); assert.equal(old.state.options.saveLocal, true);
  assert.equal(old.state.hotel.energy[0].total, 1480000);
  mem.set(S.KEY, '{bozuk'); assert.equal(S.load(), null, 'bozuk kayıt sayfayı bozmaz');
  ctx.localStorage = { getItem() { throw new Error('engelli'); }, setItem() { throw new Error('engelli'); }, removeItem() { throw new Error('engelli'); } };
  assert.equal(S.load(), null); assert.equal(S.save(s), false);
  delete ctx.localStorage;
  assert.equal(S.load(), null);
});
