// Türkiye referans verisi (assets/js/tr-reference.js): resmî şebeke faktörleri, ülke adları, fatura ipuçları.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHCMI } from '../helpers/load-hcmi.mjs';

const ctx = loadHCMI(['assets/js/tr-reference.js']);
const H = ctx.HCMI, D = ctx.HCMI_DATA, T = ctx.TR_REFERENCE;
const plain = (x) => JSON.parse(JSON.stringify(x));

// Bakanlık bilgi formlarından okunan değerler (kgCO2e/kWh = tCO2e/MWh), 2026-10-20'de doğrulandı.
const OFFICIAL = {
  2020: { generation: 0.420, transmission: 0.427, distribution: 0.462 },
  2021: { generation: 0.439, transmission: 0.445, distribution: 0.479 },
  2022: { generation: 0.442, transmission: 0.445, distribution: 0.478 },
  2023: { generation: 0.434, transmission: 0.436, distribution: 0.469 }
};

test('şebeke faktörü tablosu resmî rakamlarla aynı', () => {
  for (const [y, v] of Object.entries(OFFICIAL)) {
    const row = T.gridYears[y];
    assert.ok(row, `${y} satırı yok`);
    for (const k of ['generation', 'transmission', 'distribution']) assert.equal(row[k], v[k], `${y}/${k}`);
  }
  assert.equal(Object.keys(T.gridYears).length, 4);
  assert.equal(T.firstGridYear, 2020);
  assert.equal(T.lastGridYear, 2023);
});

test('tablo değişmezleri: tüketim noktası faktörü ≥ iletim ≥ üretim; makul aralık', () => {
  for (const [y, r] of Object.entries(T.gridYears)) {
    assert.ok(r.distribution >= r.transmission && r.transmission >= r.generation, `${y} sıralama`);
    for (const k of ['generation', 'transmission', 'distribution']) assert.ok(r[k] > 0.3 && r[k] < 0.7, `${y}/${k} = ${r[k]}`);
    assert.ok(T.sources[r.source], `${y}: kaynak kaydı yok`);
  }
});

test('her faktörün kaynağı kayıtlı: ad, yayıncı, https bağlantı, hesaplama tarihi', () => {
  for (const [id, s] of Object.entries(T.sources)) {
    assert.match(id, /^etkb-20\d\d$/);
    assert.match(s.title, /Emisyon Faktörleri/);
    assert.match(s.publisher, /Enerji ve Tabii Kaynaklar Bakanlığı/);
    assert.match(s.url, /^https:\/\/enerji\.gov\.tr\//);
    assert.match(s.calcPublished, /^20\d\d-\d\d-\d\d$/);
  }
  assert.equal(T.sources['etkb-2020'].docNo, null, '2020 doküman numarası doğrulanmadı, uydurulmamalı');
  assert.equal(T.checkedOn, '2026-10-20');
});

test('gridFactor: yayımlanmış yıllar birebir, varsayılan dağıtım hattı', () => {
  const g = T.gridFactor(2023);
  assert.equal(g.value, 0.469); assert.equal(g.unit, 'kgCO2e/kWh');
  assert.equal(g.requestedYear, 2023); assert.equal(g.basisYear, 2023);
  assert.equal(g.exact, true); assert.equal(g.reason, null); assert.equal(g.message, null);
  assert.equal(g.connection, 'distribution'); assert.equal(g.sourceId, 'etkb-2023');
  assert.equal(g.source.publisher, T.sources['etkb-2023'].publisher);
  assert.equal(T.gridFactor(2023, 'transmission').value, 0.436);
  assert.equal(T.gridFactor(2022).value, 0.478);
  assert.equal(T.gridFactor(2021).value, 0.479);
  assert.equal(T.gridFactor(2020).value, 0.462);
  assert.equal(T.gridFactor(2023.4).basisYear, 2023, 'yıl yuvarlanır');
  assert.equal(T.gridFactor(2023, 'garip').connection, 'distribution', 'bilinmeyen bağlantı türü varsayılana döner');
});

test('gridFactor: yayımlanmamış yıl → en güncel yayımlanmış değer, açıkça belirtilir', () => {
  for (const y of [2024, 2025, 2026, 2031]) {
    const g = T.gridFactor(y);
    assert.equal(g.value, 0.469, String(y)); assert.equal(g.basisYear, 2023); assert.equal(g.requestedYear, y);
    assert.equal(g.exact, false); assert.equal(g.reason, 'notPublished');
    assert.ok(g.message.includes(String(y)) && g.message.includes('2023'), g.message);
  }
});

test('gridFactor: seri öncesi ve yıl girilmemiş durumlar', () => {
  const old = T.gridFactor(2019);
  assert.equal(old.value, 0.462); assert.equal(old.basisYear, 2020); assert.equal(old.reason, 'beforeSeries'); assert.equal(old.exact, false);
  assert.ok(old.message.includes('2019') && old.message.includes('2020'));
  for (const y of [undefined, null, NaN, 'abc', '', '  ', true, [], {}]) {
    const g = T.gridFactor(y);
    assert.equal(g.value, 0.469, String(y)); assert.equal(g.reason, 'noYear'); assert.equal(g.requestedYear, null);
    assert.ok(g.message.length > 10);
  }
});

test('efOverrides: yalnız şebeke elektriği; motor biçimine uygun', () => {
  const o = plain(T.efOverrides(2024));
  assert.deepEqual(o, [{ country: 'Turkey', region: 'Turkey', typeId: 'grid', value: 0.469, id: 'tr-grid-2023-distribution' }]);
  assert.equal(plain(T.efOverrides(2022, 'transmission'))[0].value, 0.445);
  assert.equal(plain(T.efOverrides(2022, 'transmission'))[0].id, 'tr-grid-2022-transmission');
});

const hotel = () => {
  const inp = H.emptyInput();
  inp.hotel = { country: 'Turkey', region: 'Turkey', areaUnit: 'sqm', roomsArea: 5200, meetingArea: 900, conditionedArea: 11500, rooms: 120, occupiedRooms: 26280 };
  inp.energy[0].total = 1480000;
  return inp;
};

test('motor entegrasyonu: HCMI\'da Türkiye şebeke faktörü yok → geçersiz; geçersiz kılma ile elle girişle aynı sonuç', () => {
  const plainRun = H.calculate(hotel());
  assert.equal(plainRun.valid, false);
  assert.ok(plain(plainRun.errors).some((e) => e.code === 'noDefaultEf'), 'HCMI boşluğu görünür kalmalı');

  const viaOverride = H.calculate(hotel(), { efOverrides: T.efOverrides(2023) });
  assert.equal(viaOverride.valid, true);
  const manual = hotel(); manual.energy[0].efMode = 'manual'; manual.energy[0].manualEf = 0.469;
  const viaManual = H.calculate(manual);
  assert.equal(viaOverride.total.tco2e, viaManual.total.tco2e);
  assert.ok(Math.abs(viaOverride.total.tco2e - 694.12) < 1e-9, `beklenen 1.480.000 kWh × 0,469 = 694,12 t, gelen ${viaOverride.total.tco2e}`);
  assert.match(viaOverride.rows[0].efSource, /override:tr-grid-2023-distribution/, 'faktörün nereden geldiği satırda görünür');
});

test('PPA, buhar ve soğutma için ulusal varsayılan UYDURULMAZ: motor elle faktör ister', () => {
  const inp = hotel();
  inp.energy.push({ type: 'Purchased Chilled Water', unit: 'kWh', total: 1000, privateActual: 0, efMode: 'default', manualEf: null });
  const r = H.calculate(inp, { efOverrides: T.efOverrides(2023) });
  assert.equal(r.valid, false);
  assert.ok(plain(r.errors).some((e) => e.code === 'noDefaultEf'));
});

test('tüm HCMI ülkeleri için Türkçe ad var; Türkiye önde; Türkçe sıralama', () => {
  const names = H.countries().map((c) => c.country);
  assert.equal(names.length, 260);
  const missing = names.filter((n) => !Object.prototype.hasOwnProperty.call(T.countryNames, n));
  assert.deepEqual(plain(missing), [], `Türkçe adı eksik ülkeler: ${missing.join(', ')}`);
  const labels = names.map((n) => T.countryLabel(n));
  assert.ok(labels.every((l) => typeof l === 'string' && l.length > 0));
  assert.equal(new Set(labels).size, labels.length, 'Türkçe adlar tekil olmalı');
  assert.equal(T.countryLabel('Turkey'), 'Türkiye');
  assert.equal(T.countryLabel('Bilinmeyen Ülke'), 'Bilinmeyen Ülke', 'listede yoksa özgün ad döner');

  const opts = T.countryOptions(H.countries());
  assert.equal(opts.length, 260);
  assert.equal(opts[0].value, 'Turkey'); assert.equal(opts[0].label, 'Türkiye');
  const rest = opts.slice(1).map((o) => o.label);
  const sorted = rest.slice().sort((a, b) => a.localeCompare(b, 'tr'));
  assert.deepEqual(rest, sorted);
  assert.equal(plain(T.countryOptions(['Germany', 'Turkey', 'Austria'])).map((o) => o.label).join('|'), 'Türkiye|Almanya|Avusturya');
  assert.deepEqual(plain(T.countryOptions([])), []);
  assert.deepEqual(plain(T.countryOptions()), []);
});

test('fatura ipuçları ve hızlı ekle listesi geçerli HCMI enerji türlerine işaret eder', () => {
  const ids = new Set(D.energyTypes.map((t) => t.id));
  for (const [id, text] of Object.entries(T.hints)) {
    assert.ok(ids.has(id), `ipucu anahtarı HCMI'da yok: ${id}`);
    assert.ok(text.length > 10, id);
  }
  for (const id of T.commonTypes) assert.ok(ids.has(id), `hızlı ekle türü yok: ${id}`);
  assert.equal(new Set(T.commonTypes).size, T.commonTypes.length);
  assert.equal(T.hint('grid'), T.hints.grid);
  assert.equal(T.hint('yok'), '');
});

test('kullanılmayan faktörler gerekçesiyle kayıtlı (marjinal faktörler)', () => {
  assert.ok(T.notUsed.length >= 1);
  for (const n of T.notUsed) { assert.ok(n.id && n.label && n.reason && n.source, n.id); }
  assert.match(plain(T.notUsed)[0].reason, /GHG Protokol/);
});
