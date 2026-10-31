// Yönetim paneli veri katmanı (assets/js/turizm/admin.js): yönetici kontrolü, kayıtların otel / acente / üye
// listelerine dönüşmesi, sayıların hesapla aynı olması, haftalar, satış fırsatları, arama-süzme-sıralama, Excel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts, APP_SCRIPTS } from '../helpers/load-hcmi.mjs';
import { adminFixture } from '../helpers/admin-fixture.mjs';

const ctx = loadScripts([...APP_SCRIPTS, 'assets/js/turizm/admin.js']);
const T = ctx.TURIZM, M = T.model, A = T.admin;
const J = (x) => JSON.parse(JSON.stringify(x));           // vm bağlamındaki diziler: ana bağlama çevir
const near = (a, b, msg = '', tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} ${a} ≠ ${b}`);
const NOW = new Date(2026, 9, 31, 12, 0, 0).getTime();    // 31 Ekim 2026 cumartesi, yerel saat
const DAY = 864e5;
const fx = adminFixture(T, NOW);
const m = A.build({ ...fx, now: NOW });
const H = (name) => m.hotels.find((x) => x.name === name);

test('yönetici: yalnız tanımlı e-postalar (büyük/küçük harf duyarsız)', () => {
  assert.equal(A.isAdmin('levent.koseoglu@commited.app'), true);
  assert.equal(A.isAdmin(' CommitedApp@gmail.com '), true);
  assert.equal(A.isAdmin('lkoseoglu@hotmail.com'), true);
  assert.equal(A.isAdmin('deniz@otel.test'), false);
  assert.equal(A.isAdmin(''), false); assert.equal(A.isAdmin(null), false);
});

test('zaman damgaları: Timestamp, {seconds}, sayı, metin', () => {
  assert.equal(A.ms({ toMillis: () => 1234 }), 1234);
  assert.equal(A.ms({ seconds: 10, nanoseconds: 5e6 }), 10005);
  assert.equal(A.ms(42), 42);
  assert.equal(A.ms('2026-10-31T00:00:00Z'), Date.UTC(2026, 9, 31));
  assert.equal(A.ms(null), null); assert.equal(A.ms({}), null);
  assert.equal(A.dateTr(new Date(2026, 9, 5).getTime()), '05.10.2026');
});

test('özet: turizm üyeleri ve kayıtları sayılır, Kapsam 3 sayılmaz', () => {
  assert.deepEqual(J(m.counts).members, 5);
  assert.equal(m.counts.hotels, 3); assert.equal(m.counts.agencies, 1); assert.equal(m.counts.records, 5);
  assert.equal(m.counts.newMembers30, 4, 'Deniz Otel 40 gün önce üye oldu');
  assert.equal(m.counts.newRecords30, 4, 'Deniz Otel 2024 kaydı 35 gün önce');
  near(m.counts.totalT, m.counts.hotelsT + m.counts.agenciesT);
  assert.ok(!m.members.some((x) => x.email === 'k3@firma.test'));
  assert.equal(m.empty, false);
});

test('oteller: aynı otelin kayıtları tek satır; son yıl bugünkü yöntemle, sayılar hesapla aynı', () => {
  const d = H('Deniz Otel');
  assert.equal(d.count, 2); assert.deepEqual(J(d.years), [2024, 2025]); assert.equal(d.year, 2025);
  assert.equal(d.latestId, 'd25');
  const s = M.exampleState(); s.hotel.name = 'Deniz Otel'; s.agency = M.emptyAgency();
  const R = T.compute(s);
  near(d.cpor, R.metrics.cpor, 'CPOR'); near(d.totalT, R.totals.hcmiT, 'toplam');
  assert.equal(d.grade, 'B'); assert.equal(d.completeness, R.completeness.score);
  near(d.scalePos, R.bench.scalePos); near(d.remainingT, R.offsets.remainingT);
  assert.equal(d.segmentLabel, R.bench.segment.tr); assert.equal(d.city, 'Muğla'); assert.equal(d.email, 'deniz@otel.test');
  assert.equal(d.measures, 3); assert.equal(d.verify, 'none');
  // eski sürüm kaydı aktarılıp hesaplanır
  const z = H('Zeytin Pansiyon');
  assert.equal(z.legacy, true); assert.equal(z.year, 2023); assert.equal(z.usable, true); assert.ok(z.totalT > 0);
  // profili olmayan hesabın oteli: e-posta kayıttan
  const k = H('Kale Otel');
  assert.equal(k.email, 'kale@otel.test'); assert.equal(k.grade, 'E'); assert.ok(k.cpor > 48.9 * 1.5);
  // en son etkinlik önce
  assert.deepEqual(J(m.hotels.map((x) => x.name)), ['Kale Otel', 'Deniz Otel', 'Zeytin Pansiyon']);
});

test('fırsat etiketleri: doğrulamaya hazır, D ve E, güncelleme bekliyor; beklenen yıl takvime göre kayar', () => {
  assert.equal(m.expectYear, 2025);
  assert.deepEqual(J(H('Deniz Otel').tags), ['verify']);
  assert.deepEqual(J(H('Kale Otel').tags), ['verify', 'high']);
  assert.deepEqual(J(H('Zeytin Pansiyon').tags), ['verify', 'stale']);
  assert.deepEqual(J(m.opps.idle.map((x) => x.name)), ['Yeni Üye Otel']);
  near(m.opps.offsetT, m.hotels.reduce((a, x) => a + x.remainingT, 0));
  near(m.opps.offsetTl, m.opps.offsetT * 400); assert.equal(m.opps.verPrice, 400);
  // bağımsız doğrulanmış otel "doğrulamaya hazır" sayılmaz
  const fx2 = adminFixture(T, NOW);
  fx2.items.find((i) => i.id === 'd25').data.inputs.hotel.verify = 'third';
  assert.deepEqual(J(A.build({ ...fx2, now: NOW }).hotels.find((x) => x.name === 'Deniz Otel').tags), []);
  // 2027 Mart: 2025 verisi artık eski (2026 bekleniyor)
  const later = A.build({ ...adminFixture(T, NOW), now: new Date(2027, 2, 1).getTime() });
  assert.equal(later.expectYear, 2026);
  assert.ok(later.hotels.find((x) => x.name === 'Deniz Otel').tags.includes('stale'));
});

test('kıyas notu dağılımı ve filo şeridi', () => {
  assert.deepEqual(J(m.gradeCounts), { A: 0, B: 2, C: 0, D: 0, E: 1, none: 0 });
  assert.equal(m.fleet.length, 3);
  for (let i = 1; i < m.fleet.length; i++) assert.ok(m.fleet[i].scalePos >= m.fleet[i - 1].scalePos);
  assert.equal(m.fleet[m.fleet.length - 1].name, 'Kale Otel');
});

test('acenteler ve üyeler', () => {
  const a = m.agencies[0];
  assert.equal(a.name, 'Mavi Tur'); assert.equal(a.city, 'İzmir'); assert.equal(a.count, 1);
  const st = M.load(fx.items.find((i) => i.id === 'm1').data.inputs).state;
  near(a.totalT, T.agency.compute(st.agency).totalT); assert.equal(a.passengers, st.agency.yolcu);
  const kale = m.members.find((x) => x.uid === 'u_kale');
  assert.equal(kale.name, 'Kale Otel'); assert.equal(kale.typeLabel, 'Otel / tatil köyü');
  near(kale.joinedAt, NOW - 3 * DAY, 'profili yoksa üyelik ilk kaydı', 1e-6);
  const deniz = m.members.find((x) => x.uid === 'u_deniz');
  assert.equal(deniz.records, 2); assert.equal(deniz.hotels, 2); assert.deepEqual(J(deniz.tags), []);
  assert.deepEqual(J(m.members.find((x) => x.uid === 'u_yeni').tags), ['idle']);
  assert.equal(m.members[0].name, 'Yeni Üye Otel', 'en yeni üye önce');
});

test('haftalar: son 12 hafta pazartesi başlar, bu hafta işaretli, sayılar doğru kovada', () => {
  assert.equal(m.weeks.length, 12);
  assert.ok(m.weeks.every((w) => new Date(w.start).getDay() === 1));
  assert.equal(m.weeks[11].current, true); assert.equal(m.weeks.filter((w) => w.current).length, 1);
  assert.equal(m.weeks[11].label, '26 Eki');
  assert.equal(m.weeks[11].members, 2); assert.equal(m.weeks[11].records, 2);
  assert.equal(m.weeks.reduce((a, w) => a + w.members, 0), 5);
  assert.equal(m.weeks.reduce((a, w) => a + w.records, 0), 5);
  assert.equal(m.weeks.reduce((a, w) => a + w.agencies, 0), 1);
});

test('arama, süzme, sıralama: Türkçe harfler, boş değerler sonda, sıra kararlı', () => {
  assert.deepEqual(J(A.query(m.hotels, { q: 'AYVALIK' }).map((x) => x.name)), ['Zeytin Pansiyon']);
  assert.deepEqual(J(A.query(m.agencies, { q: 'izmir' }).map((x) => x.name)), ['Mavi Tur']);
  assert.deepEqual(J(A.query(m.hotels, { q: 'kale@' }).map((x) => x.name)), ['Kale Otel']);
  assert.deepEqual(J(A.query(m.hotels, { filter: 'high' }).map((x) => x.name)), ['Kale Otel']);
  assert.deepEqual(J(A.query(m.members, { filter: 'idle' }).map((x) => x.name)), ['Yeni Üye Otel']);
  assert.deepEqual(J(A.query(m.hotels, { sort: 'cpor', dir: 'desc' }).map((x) => x.name))[0], 'Kale Otel');
  assert.deepEqual(J(A.query(m.hotels, { sort: 'name', dir: 'asc' }).map((x) => x.name)), ['Deniz Otel', 'Kale Otel', 'Zeytin Pansiyon']);
  const rows = [{ name: 'a', v: null, tags: [] }, { name: 'b', v: 2, tags: [] }, { name: 'c', v: 1, tags: [] }, { name: 'd', v: 2, tags: [] }];
  assert.deepEqual(J(A.query(rows, { sort: 'v', dir: 'asc' }).map((x) => x.name)), ['c', 'b', 'd', 'a']);
  assert.deepEqual(J(A.query(rows, { sort: 'v', dir: 'desc' }).map((x) => x.name)), ['b', 'd', 'c', 'a']);
});

test('otel ayrıntısı: otelin kendi paneli, önceki yılı aynı yöntemle', () => {
  const d = A.detail(H('Deniz Otel'));
  assert.equal(d.model.ok, true); assert.equal(d.model.name, 'Deniz Otel'); assert.equal(d.model.sample, false);
  assert.deepEqual(J(d.model.trend.byId.total.points.map((p) => p.year)), [2024, 2025]);
  assert.match(d.model.hero.delta.text, /^2024'e göre %[\d,]+ daha az$/);
  const z = A.detail(H('Zeytin Pansiyon'));
  assert.equal(z.model.ok, true); assert.equal(z.model.trend.years, 1);
  assert.equal(A.detail(null), null);
});

test('Excel sayfaları: başlıklar, sayılar sayı olarak, tarih Türkçe', () => {
  const sh = A.sheets(m);
  assert.deepEqual(J(sh.map((s) => s.name)), ['Oteller', 'Acenteler', 'Üyeler']);
  const ot = sh[0].rows;
  assert.equal(ot.length, 4); assert.equal(ot[0][0], 'Otel'); assert.equal(ot[0].length, sh[0].widths.length);
  const kale = ot.find((r) => r[0] === 'Kale Otel');
  assert.equal(typeof kale[5], 'number'); assert.equal(kale[6], 'E'); assert.match(kale[15], /^\d{2}\.\d{2}\.\d{4}$/);
  assert.equal(kale[17], 'Doğrulamaya hazır, D ve E');
  assert.equal(sh[1].rows.length, 2); assert.equal(sh[2].rows.length, 6);
  assert.ok(!JSON.stringify(sh).includes('Çelik Tedarik'));
});

test('bozuk ya da eksik veride çökmez; boş veri boş model', () => {
  const junk = [null, {}, { uid: 'x' }, { uid: 'x', id: '1', data: null }, { uid: 'x', id: '2', data: { type: 'hotel', inputs: 'metin' } },
    { uid: 'x', id: '3', data: { type: 'hotel', company: 'Girdisiz Otel', total: 500000, cpor: 40, grade: 'C' } },
    { uid: 'y', id: '4', data: { type: 'agency', company: 'Boş Acente', inputs: { schema: 'commited.turizm.state/2' } } }];
  const b = A.build({ firms: [null, { uid: 'z' }, { uid: 'w', data: { source: 'turizm-karbon-hesaplayici' } }], items: junk, now: NOW });
  const g = b.hotels.find((x) => x.name === 'Girdisiz Otel');
  assert.equal(g.usable, false); assert.equal(g.cpor, 40); assert.equal(g.grade, 'C'); near(g.totalT, 500);
  assert.equal(b.fleet.length, 0);
  assert.ok(b.members.some((x) => x.uid === 'w'));
  const e = A.build({ firms: [], items: [], now: NOW });
  assert.equal(e.empty, true); assert.equal(e.counts.records, 0); assert.equal(e.weeks.length, 12);
  assert.equal(A.build().ok, true);
});
