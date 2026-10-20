// Türkçe sayı girişi (assets/js/num-input.js): "1.234,5" biçimi doğru okunmalı,
// belirsiz / bozuk yazım SESSİZCE düzeltilmemeli (NaN dönmeli).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts } from '../helpers/load-hcmi.mjs';

const { NUM } = loadScripts(['assets/js/num-input.js']);
const parse = (s, o) => NUM.parse(s, o);

function isNaNValue(v) { return typeof v === 'number' && Number.isNaN(v); }

test('Türkçe yazım: nokta binlik, virgül ondalık', () => {
  const cases = [
    ['1.234,5', 1234.5], ['1.234.567,89', 1234567.89], ['1,5', 1.5], ['0,469', 0.469],
    ['1.480.000', 1480000], ['12.345.678', 12345678], ['1.234', 1234], ['123.456', 123456],
    ['12,5', 12.5], ['0,5', 0.5], [',5', 0.5], ['00,5', 0.5], ['1234,56', 1234.56], ['1234', 1234],
    ['1 480 000', 1480000], ['1 480 000,5', 1480000.5], ['  42  ', 42]
  ];
  for (const [text, want] of cases) assert.equal(parse(text), want, `"${text}"`);
});

test('İngilizce yazım da doğru okunur (iki ayraç birlikte ya da çoklu virgül)', () => {
  const cases = [['1,234,567.89', 1234567.89], ['1,234.5', 1234.5], ['1,234,567', 1234567], ['12.5', 12.5], ['0.5', 0.5], ['5.', 5], ['.5', 0.5]];
  for (const [text, want] of cases) assert.equal(parse(text), want, `"${text}"`);
});

test('tek virgül HER ZAMAN ondalıktır (Türkçe kural): "1,234" = 1,234', () => {
  assert.equal(parse('1,234'), 1.234);
});

test('tek noktalı 3 haneli yazım "amount" modunda binliktir, "factor" modunda ondalıktır', () => {
  assert.equal(parse('1.234'), 1234);
  assert.equal(parse('1.234', { kind: 'factor' }), 1.234);
  assert.equal(parse('2.045', { kind: 'factor' }), 2.045);
  assert.equal(parse('0.469', { kind: 'factor' }), 0.469);
  assert.equal(parse('0.469'), 0.469, 'sıfırla başlayan "0.469" binlik olamaz');
  assert.equal(parse('1234.567'), 1234.567, '4 haneli baş kısım binlik olamaz');
  assert.equal(parse('1.5'), 1.5);
  assert.equal(parse('1.23'), 1.23);
});

test('işaret, yüzde ve TL simgesi', () => {
  assert.equal(parse('-3,2'), -3.2);
  assert.equal(parse('−3,2'), -3.2, 'Unicode eksi');
  assert.equal(parse('+4'), 4);
  assert.equal(parse('%12'), 12);
  assert.equal(parse('12%'), 12);
  assert.equal(parse('₺1.500'), 1500);
  assert.equal(parse('1.500₺'), 1500);
  assert.ok(isNaNValue(parse('-5', { allowNegative: false })));
  assert.equal(parse('5', { allowNegative: false }), 5);
});

test('boş değerler null döner (NaN değil)', () => {
  for (const v of ['', '   ', ' ', null, undefined]) assert.equal(parse(v), null, JSON.stringify(v));
});

test('geçersiz yazım NaN döner, sessizce tahmin edilmez', () => {
  const bad = ['abc', '12 kWh', '1,2,3', '1.2.3', '1..2', '1,,2', '--5', '5-', '.', ',', '1.234,5.6', '12,34.5',
    '1.234.5,6', '1e5', 'Infinity', '0x10', '1,5,', '₺', '%', '1.2.345', '12.34.567'];
  for (const text of bad) assert.ok(isNaNValue(parse(text)), `"${text}" NaN olmalı, geldi: ${parse(text)}`);
});

test('sayı girdisi olduğu gibi geçer; sonsuz / NaN geçersizdir', () => {
  assert.equal(parse(5), 5);
  assert.equal(parse(0), 0);
  assert.equal(parse(-2.5), -2.5);
  assert.ok(isNaNValue(parse(NaN)));
  assert.ok(isNaNValue(parse(Infinity)));
});

test('format: Türkçe biçim, locale\'e bağlı değil', () => {
  assert.equal(NUM.format(1234.5), '1.234,5');
  assert.equal(NUM.format(1234567.891, 2), '1.234.567,89');
  assert.equal(NUM.format(0.469, 3), '0,469');
  assert.equal(NUM.format(1000), '1.000');
  assert.equal(NUM.format(999.999, 2), '1.000');
  assert.equal(NUM.format(-1234.5), '-1.234,5');
  assert.equal(NUM.format(0), '0');
  assert.equal(NUM.format(5, 2, 2), '5,00');
  assert.equal(NUM.format(5.5, 3, 1), '5,5');
  assert.equal(NUM.format(-0.001, 2), '0', 'sıfıra yuvarlanan değer eksi yazılmaz');
  assert.equal(NUM.format(123456789), '123.456.789');
});

test('format: geçersiz değer boş metin verir', () => {
  for (const v of [NaN, Infinity, -Infinity, null, undefined, '12', {}]) assert.equal(NUM.format(v), '', String(v));
});

test('gidiş-dönüş: parse(format(x)) = x (rastgele ama tekrarlanabilir değerler)', () => {
  let seed = 123456789;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < 2000; i++) {
    const mag = Math.pow(10, Math.floor(rnd() * 9));           // 1 … 1e8
    const x = Math.round(rnd() * mag * 1e4) / 1e4 * (rnd() < 0.2 ? -1 : 1);
    const text = NUM.format(x, 4);
    const back = parse(text);
    assert.ok(Math.abs(back - x) <= 5e-5, `${x} → "${text}" → ${back}`);
  }
  for (const x of [1234, 1.234, 123456, 0.5, 1000.5, 999999.99, 1e6]) {
    assert.ok(Math.abs(parse(NUM.format(x, 6)) - x) < 1e-9, String(x));
  }
});

test('attach / read: DOM olmadan da güvenli (null alan)', () => {
  assert.equal(NUM.read(null), null);
  assert.doesNotThrow(() => NUM.attach(null));
  assert.equal(NUM.read({ value: '1.234,5' }), 1234.5);
  assert.equal(NUM.read({ value: '' }), null);
});
