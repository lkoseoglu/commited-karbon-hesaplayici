// Erisilebilirlik (axe-core, WCAG 2.1 A/AA): iki sayfa x acik/koyu x bos/dolu/sonuc ekranlari.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AxeBuilder } from '@axe-core/playwright';
import { serve, launch, newPage } from './helpers.mjs';

const { srv, base } = await serve();
const browser = await launch();
test.after(async () => { await browser.close(); srv.close(); });

async function axe(page, label) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const out = r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ') + ' -> ' + (n.any[0] && n.any[0].message || '')).join(' | ')}`);
  assert.deepEqual(out, [], label + ' ihlalleri:\n' + out.join('\n'));
}

for (const scheme of ['light', 'dark']) {
  test(`turizm (${scheme}): bos, dolu ve acente ekranlari`, async () => {
    const p = await newPage(browser, { colorScheme: scheme, width: 1280, height: 900 });
    await p.goto(base + 'turizm-karbon-hesaplayici.html', { waitUntil: 'load' });
    await p.waitForTimeout(400);
    await axe(p, 'turizm bos');
    await p.click('[data-example="otel"]'); await p.waitForTimeout(500);
    await axe(p, 'turizm otel dolu');
    await p.evaluate(() => window.__tour.setMode('acente')); await p.click('[data-example="acente"]'); await p.waitForTimeout(400);
    await axe(p, 'turizm acente');
    assert.deepEqual(p.errors, []);
    await p.context().close();
  });
  test(`kapsam3 (${scheme}): acilis, form ve sonuc ekranlari`, async () => {
    const p = await newPage(browser, { colorScheme: scheme, width: 1280, height: 900 });
    await p.goto(base + 'kapsam3-karbon-hesaplayici.html', { waitUntil: 'load' });
    await p.waitForTimeout(400);
    await axe(p, 'kapsam3 acilis');
    await p.evaluate(() => window.loadExample()); await p.waitForTimeout(300);
    await axe(p, 'kapsam3 form');
    await p.evaluate(() => window.calcBuyer()); await p.waitForTimeout(600);
    await axe(p, 'kapsam3 sonuc');
    assert.deepEqual(p.errors, []);
    await p.context().close();
  });
}
