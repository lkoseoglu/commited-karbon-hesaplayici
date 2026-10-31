// İngilizce çeviri katmanı (assets/js/turizm/i18n.js + i18n-en.js) ve İngilizce sayı yazımı (num-input.js).
// Tarayıcı gerekmez: dosyalar Node içinde yüklenir; ekrandaki kapsam tests/e2e/turizm-en.test.mjs'te denenir.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT } from '../helpers/load-hcmi.mjs';

// Sözlüğü de yakalayarak yükle (I.add çağrılarını kaydet)
function load() {
  const ctx = {}; ctx.globalThis = ctx; ctx.self = ctx; vm.createContext(ctx);
  const run = (f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  run('assets/js/num-input.js'); run('assets/js/tr-reference.js'); run('assets/js/turizm/i18n.js');
  const dict = {}, add = ctx.TURIZM.i18n.add;
  ctx.TURIZM.i18n.add = (d) => { Object.assign(dict, d); add(d); };
  run('assets/js/turizm/i18n-en.js');
  ctx.TURIZM.i18n.setLang('en');
  return { I: ctx.TURIZM.i18n, NUM: ctx.NUM, dict };
}
const { I, NUM, dict } = load();

test('sözlük: İngilizce değerlerde Türkçe harf yok (özel adlar hariç), anahtarlar benzersiz şablon', () => {
  const PROPER = /Türkiye|Muğla|EVÇED|TÜRSAB|Danışmanlık A\.Ş\./g;            // özel adlar Türkçe kalır
  const bad = Object.entries(dict).filter(([, v]) => /[çğıöşüÇĞİÖŞÜ]/.test(String(v).replace(PROPER, ''))).map(([k, v]) => k + ' → ' + v);
  assert.deepEqual(bad, []);
  assert.ok(Object.keys(dict).length > 1500, 'sözlük ' + Object.keys(dict).length + ' giriş');
  // {#n} sırası: değerdeki en büyük indis anahtardaki sayı adedini aşmamalı
  const over = Object.entries(dict).filter(([k, v]) => {
    const n = (I.key(k).match(/\{#\}/g) || []).length;
    return (String(v).match(/\{#(\d+)\}/g) || []).some((x) => +x.slice(2, -1) > n);
  }).map(([k]) => k);
  assert.deepEqual(over, []);
});

test('şablon: sayılar {#}, sıra değişimi {#1}/{#2}, yüzde 12% olur', () => {
  assert.equal(I.key('120 odalı örnek   tatil köyü'), '{#} odalı örnek tatil köyü');
  assert.equal(I.t("2024'e göre 5.2% daha az"), '5.2% less than in 2024');           // sayıların yeri değişir
  assert.equal(I.t('Segmentte %23 altında'), '23% below the segment average');       // %23 → 23%
  assert.equal(I.t('Henüz yalnız 2025 verisi var.'), 'Only 2025 data so far.');
  assert.equal(I.t('Bu metin sözlükte yok ve çevrilmez'), 'Bu metin sözlükte yok ve çevrilmez');
  assert.ok(I.missing().includes('Bu metin sözlükte yok ve çevrilmez'));
});

test('kalıplar: değişken parçalı cümleler', () => {
  const cases = [
    ['Kıyas şeridi: tesisiniz 34.4 kg ile B bandında; lüks (STR Luxury) ortalaması 59.6 kg; planınızla 26.5 kg.',
      'Benchmark strip: your property is in band B at 34.4 kg; luxury (STR Luxury) average 59.6 kg; with your plan 26.5 kg.'],
    ['Kıyas şeridi: tesisiniz 34.4 kg ile C bandında; kendi referansınız 30 kg.', 'Benchmark strip: your property is in band C at 34.4 kg; your own reference 30 kg.'],
    ["2023'ten bu yana 12% azaldı.", 'Down 12% since 2023.'],
    ["2022'den bu yana değişmedi. Yıldızlı yıllar örnek verilerdir.", 'Unchanged since 2022. Years marked with a star are sample data.'],
    ["2024'e göre değişmedi", 'Unchanged from 2024'],
    ['Önceki yıla göre 3.0 puan arttı', 'Up 3.0 points from the previous year'],
    ['Eksik: rapor yılı, toplantı alanı', 'Missing: reporting year, meeting space'],
    ['Karşılanıyor: mutlak azaltım, seviye eşiği (45 kgCO₂e/m²)', 'Met: absolute reduction, level threshold (45 kgCO₂e/m²)'],
    ['Seçilen 13 önlem: çatı GES, BMS kurulumu ve HVAC devreye alma, güneş kollektörü (termal) ve 10 önlem daha. Yıllık azaltım',
      '13 selected measures: rooftop solar PV, BMS installation and HVAC commissioning, solar thermal collectors and 10 more. Annual reduction'],
    ['Not C: ortalamanın 9% altında', 'Grade C: 9% below the average'],
    ['Su tüketimi segment ortalamasının 31% üzerinde.', 'Water consumption is 31% above the segment average.'],
    ['+ Doğal gaz', '+ Natural gas']
  ];
  for (const [tr, en] of cases) { assert.equal(I.t(tr), en, tr); }
});

test('panoya kopyalanan metin: madde işaretleri korunur, "Etiket: değer" iki parça çevrilir', () => {
  const out = I.tLines('Yıllık toplam: 1,234.5 tCO₂e\n  · 5 yıldız: 2,400 oda-gece × 48.9 = 117.4 tCO₂e');
  assert.equal(out, 'Annual total: 1,234.5 tCO₂e\n  · 5 star: 2,400 room nights × 48.9 = 117.4 tCO₂e');
});

test('sabit metindeki Türkçe sayılar İngilizce yazılır; zaten İngilizce olan sayıya dokunulmaz', () => {
  const cases = [['1.550 kWh/kWp', '1,550 kWh/kWp'], ['%12,5 pay', '%12.5 pay'], ['0,048 kg', '0.048 kg'], ['1.480.000 ya da 12,5', '1,480,000 ya da 12.5'],
    ['4,684,000 TRY', '4,684,000 TRY'], ['1,059.6 t', '1,059.6 t'], ['0.048 kg', '0.048 kg'], ['yıl 2025, 120 oda', 'yıl 2025, 120 oda']];
  for (const [a, b] of cases) { assert.equal(I.enNums(a), b, a); }
});

test('İngilizce sayı yazımı ve girişi (NUM.setLocale)', () => {
  NUM.setLocale('en');
  assert.equal(NUM.format(1234567.891, 1), '1,234,567.9');
  assert.equal(NUM.parse('1,480,000'), 1480000);
  assert.equal(NUM.parse('12.5'), 12.5);
  assert.equal(NUM.parse('1,234.5'), 1234.5);
  assert.equal(NUM.pct('12'), '12%');
  NUM.setLocale('tr');
  assert.equal(NUM.format(1234567.891, 1), '1.234.567,9');
  assert.equal(NUM.parse('1.480.000'), 1480000);
  assert.equal(NUM.parse('12,5'), 12.5);
  assert.equal(NUM.pct('12'), '%12');
  NUM.setLocale('en');
});
