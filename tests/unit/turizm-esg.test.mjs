// Karbon dışı sürdürülebilirlik göstergeleri (model.js esg, compute.js esgOf, JSON) ve
// AB 2024/825 ifade denetimi. Bu göstergeler karbon hesabına girmez; rapor ve kişi başı kutular içindir.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadApp, ROOT } from '../helpers/load-hcmi.mjs';

const ctx = loadApp();
const { TURIZM } = ctx;
const M = TURIZM.model, C = TURIZM.compute, X = TURIZM.texts;
const plain = (x) => JSON.parse(JSON.stringify(x));
const near = (a, b, msg = '', tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} ${a} ≠ ${b}`);
const ex = () => M.exampleState();

// ------------------------------------------------------------------ model
test('esg: boş durumda tüm alanlar boş; normalize sayıya çevirir, negatif ve bilinmeyeni atar', () => {
  assert.deepEqual(plain(M.emptyHotel().esg), { chemicalsKg: null, purchaseTotalTl: null, purchaseLocalTl: null, staff: null, staffTrained: null });
  const s = M.normalize({ schema: M.SCHEMA, hotel: { esg: { chemicalsKg: '15.600', purchaseTotalTl: -5, staff: 'abc', hack: 1 } } });
  assert.equal(s.hotel.esg.chemicalsKg, 15600);
  assert.equal(s.hotel.esg.purchaseTotalTl, null);
  assert.equal(s.hotel.esg.staff, null);
  assert.ok(!('hack' in s.hotel.esg));
});

test('esg: yalnız rapor göstergesi girilmiş form boş sayılmaz; eski kayıt aktarımında esg boş kalır', () => {
  const s = M.emptyState(); s.hotel.esg.staff = 20;
  assert.equal(M.hotelIsEmpty(s.hotel), false);
  const legacy = M.fromLegacy(M.LEGACY_EXAMPLE).state;
  assert.deepEqual(Object.values(legacy.hotel.esg), [null, null, null, null, null]);
  assert.deepEqual(plain(ex().hotel.esg), plain(M.EXAMPLE_ESG));
});

test('esg: karbon sonuçlarını değiştirmez', () => {
  const a = ex(), b = ex(); b.hotel.esg = M.emptyEsg();
  const Ra = C(a), Rb = C(b);
  assert.equal(Ra.totals.hcmiT, Rb.totals.hcmiT);
  assert.equal(Ra.totals.fullT, Rb.totals.fullT);
  assert.equal(Ra.completeness.score, Rb.completeness.score);
});

// ------------------------------------------------------------------ compute
test('esg: örnek otelin kişi başı göstergeleri ve oranları', () => {
  const s = ex(), R = C(s), E = R.esg, h = s.hotel;
  assert.equal(E.guestNights, 47300);
  near(E.localPct, 65); near(E.trainedPct, 110 / 145 * 100);
  near(E.recycleRate, 55 / 220);
  near(E.perGuest.waterM3, 19000 / 47300);
  near(E.perGuest.chemKg, 15600 / 47300);
  near(E.perGuest.wasteKg, 220000 / 47300);
  near(E.perGuest.kwh, R.intensity.ownKwh / 47300);
  near(E.perGuest.co2Kg, R.totals.hcmiT * 1000 / 47300);
  near(E.chemPerRoomKg, 15600 / h.occupiedRooms);
  near(E.guestsPerRoom, 47300 / 26280);
  assert.equal(E.any, true);
});

test('esg: tutarsız girişte oran hesaplanmaz ve uyarı verilir', () => {
  const s = ex(); s.hotel.esg.purchaseLocalTl = 200000000; s.hotel.esg.staffTrained = 500;
  const R = C(s);
  assert.equal(R.esg.localPct, null); assert.equal(R.esg.trainedPct, null);
  const codes = R.messages.warnings.map((w) => w.code);
  assert.ok(codes.includes('localExceeds')); assert.ok(codes.includes('trainedExceeds'));
  assert.equal(R.messages.warnings.find((w) => w.code === 'localExceeds').path, 'hotel.esg.purchaseLocalTl');
  const s2 = ex(); s2.hotel.esg.purchaseTotalTl = null; s2.hotel.esg.staff = null;
  const info = C(s2).messages.info.map((w) => w.code);
  assert.ok(info.includes('localNoTotal')); assert.ok(info.includes('trainedNoStaff'));
});

test('esg: misafir gecelemesi yoksa kişi başı değerler boş', () => {
  const s = ex(); s.hotel.guestNights = null;
  const E = C(s).esg;
  assert.deepEqual(Object.values(E.perGuest), [null, null, null, null, null]);
  near(E.localPct, 65);
});

test('JSON çıktısı: sürdürülebilirlik bloğu; logo JSON\'a girmez', () => {
  const s = ex(); s.hotel.logo = 'data:image/png;base64,iVBORw0KGgo=';
  const R = C(s), o = X.exportObject(s, R);
  assert.equal(o.sustainability.chemicalsKg, 15600);
  assert.equal(o.sustainability.localPurchasePct, 65);
  assert.equal(o.sustainability.wasteRecycledPct, 25);
  assert.equal(o.sustainability.perGuestNight.waterM3, Math.round(19000 / 47300 * 1000) / 1000);
  assert.ok(!JSON.stringify(o).includes('base64'), 'logo JSON çıktısına girmez');
});

// ------------------------------------------------------------------ logo
test('logo: yalnız küçük PNG/JPEG data URL kabul edilir; logo tek başına formu doldurmuş saymaz', () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  assert.equal(M.normalize({ hotel: { logo: png } }).hotel.logo, png);
  assert.equal(M.normalize({ hotel: { logo: 'data:image/jpeg;base64,/9j/4AAQ' } }).hotel.logo, 'data:image/jpeg;base64,/9j/4AAQ');
  for (const bad of ['data:image/svg+xml;base64,PHN2Zz4=', 'javascript:alert(1)', 'data:image/png;base64,AAA" onerror="x', 'https://x.com/a.png',
    'data:text/html;base64,PGI+', 42, {}, 'data:image/png;base64,' + 'A'.repeat(M.LOGO_MAX_CHARS)]) {
    assert.equal(M.normalize({ hotel: { logo: bad } }).hotel.logo, null, String(bad).slice(0, 40));
  }
  const s = M.emptyState(); s.hotel.logo = png;
  assert.equal(M.hotelIsEmpty(s.hotel), true);
  assert.equal(M.emptyHotel().logo, null);
  assert.equal(ex().hotel.logo, null);
});

// ------------------------------------------------------------------ AB 2024/825 ifade denetimi
test('AB 2024/825: ekranlarda ve raporda "karbon nötr" yalnız tırnak içinde, yasak örneği olarak geçer', () => {
  const files = ['turizm-karbon-hesaplayici.html', 'kapsam3-karbon-hesaplayici.html', 'assets/js/turizm/texts.js',
    'assets/js/turizm/render.js', 'assets/js/turizm/report.js', 'assets/js/measures.js'];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of src.matchAll(/(.)(karbon[ -]nötr|iklim nötr|carbon[ -]neutral|climate[ -]neutral)/gi)) {
      assert.ok(['"', '“', '\'', '‘'].includes(m[1]) || src.slice(m.index - 5, m.index + 1) === '&quot;',
        f + ': tırnaksız "' + m[2] + '" → ' + src.slice(Math.max(0, m.index - 60), m.index + 40));
    }
    for (const w of ['çevre dostu otel', 'yeşil konaklama', 'iklim dostu tatil', 'green electricity', 'yeşil elektriğe']) {
      const i = src.toLocaleLowerCase('tr').indexOf(w);
      if (i >= 0) { assert.ok(['"', '“'].includes(src[i - 1]) || src.slice(i - 6, i) === '&quot;', f + ': "' + w + '" yalnız yasak örneği olarak geçebilir'); }
    }
  }
});
