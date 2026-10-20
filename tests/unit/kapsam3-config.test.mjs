// Kapsam 3 hesaplayıcısının parametreleri (config.default.json):
//  - gıda faktörleri Our World in Data / Poore & Nemecek (2018) verisiyle birebir (2026-10-20'de CSV'den okundu)
//  - sayfalara gömülü DEFAULT_CONFIG, config.default.json ile aynı (tools/inject-config.py unutulmasın)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT } from '../helpers/load-hcmi.mjs';

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.default.json'), 'utf8'));

// ourworldindata.org/grapher/ghg-per-kg-poore.csv (kgCO2e / kg ürün, tedarik zinciri dahil).
// Zeytinyağı o tabloda yok; food-emissions-supply-chain.csv aşamalarının toplamı 5,4249 → 5,42.
const OWID = {
  food_beef_kg: 99.48, food_lamb_kg: 39.72, food_chicken_kg: 9.87, food_fish_kg: 13.63, food_prawn_kg: 26.87,
  food_cheese_kg: 23.88, food_milk_kg: 3.15, food_eggs_kg: 4.67, food_rice_kg: 4.45, food_wheat_kg: 1.57,
  food_oliveoil_kg: 5.42, food_tomato_kg: 2.09, food_veg_kg: 0.53, food_potato_kg: 0.46, food_fruit_kg: 1.05,
  food_citrus_kg: 0.39, food_coffee_kg: 28.53, food_choc_kg: 46.65, food_wine_kg: 1.79
};

test('gıda faktörleri OWID / Poore & Nemecek değerleriyle birebir', () => {
  const food = Object.keys(cfg.factors).filter((k) => k.startsWith('food_'));
  assert.deepEqual(food.sort(), Object.keys(OWID).sort(), 'liste değişti: OWID tablosunu da güncelleyin');
  for (const [k, v] of Object.entries(OWID)) {
    assert.equal(cfg.factors[k].value, v, k);
    assert.equal(cfg.factors[k].unit, 'kgCO2e/kg', k);
    assert.match(cfg.factors[k].src, /Poore & Nemecek/, k);
  }
});

test('konaklama ve ulaşım faktörleri Turizm hesaplayıcısıyla aynı kaynaktan', () => {
  const ctx = {}; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/benchmarks.js'), 'utf8'), ctx);
  const seg = Object.fromEntries(ctx.BENCH.agencySegments.map((a) => [a.id, a.cpor]));
  const stay = Object.keys(cfg.factors).filter((k) => k.startsWith('stay_'));
  assert.ok(stay.length >= 5);
  const want = { stay_lux_night: seg.lux, stay_5_night: seg.s5, stay_4_night: seg.s4, stay_3_night: seg.s3, stay_apart_night: seg.limited };
  for (const [k, v] of Object.entries(want)) if (cfg.factors[k]) assert.equal(cfg.factors[k].value, v, k);
});

for (const page of ['kapsam3-karbon-hesaplayici.html', 'karbon-admin.html']) {
  test(page + ': gömülü DEFAULT_CONFIG, config.default.json ile aynı', () => {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const i = html.indexOf('const DEFAULT_CONFIG = ');
    assert.ok(i > 0, 'DEFAULT_CONFIG yok');
    const j = html.indexOf('\n};\n', i);
    const embedded = JSON.parse(html.slice(i + 'const DEFAULT_CONFIG = '.length, j + 2));
    assert.deepEqual(embedded, cfg, 'python3 tools/inject-config.py çalıştırın');
  });
}
