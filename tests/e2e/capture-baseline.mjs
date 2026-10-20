// Iki sayfanin ornek verilerle verdigi sayilari kaydeder. Tema degisikliginde sayilarin
// DEGISMEDIGINI kanitlamak icin kullanilir:  node tests/e2e/capture-baseline.mjs [cikti.json]
import fs from 'node:fs';
import { serve, launch, newPage } from './helpers.mjs';

export async function capture(base, browser) {
  const out = {};
  // --- Turizm: otel ---
  let p = await newPage(browser, { width: 1280, height: 900 });
  await p.goto(base + 'turizm-karbon-hesaplayici.html', { waitUntil: 'load' });
  await p.click('[data-example="otel"]');
  await p.waitForTimeout(400);
  out.hotel = await p.evaluate(() => {
    const s = window.__tour.summary();
    const t = (id) => (document.getElementById(id) || {}).textContent || '';
    return { total: s.total, cpor: s.cpor, grade: s.grade, s_total: t('s_total'), s_cpor: t('s_cpor'), s_meet: t('s_meet'), s_grade: t('s_grade') };
  });
  // --- Turizm: acente ---
  await p.evaluate(() => window.__tour.setMode('acente'));
  await p.click('[data-example="acente"]');
  await p.waitForTimeout(400);
  out.agency = await p.evaluate(() => ({ total: window.__tour.summary().total }));
  out.turizmErrors = p.errors.slice();
  await p.context().close();
  // --- Kapsam 3 ---
  p = await newPage(browser, { width: 1280, height: 900 });
  await p.goto(base + 'kapsam3-karbon-hesaplayici.html', { waitUntil: 'load' });
  await p.waitForTimeout(500);
  await p.evaluate(() => { window.loadExample(); });
  await p.waitForTimeout(300);
  await p.evaluate(() => { window.calcBuyer(); });
  await p.waitForTimeout(500);
  out.kapsam3 = await p.evaluate(() => {
    const t = (id) => (document.getElementById(id) || {}).textContent || '';
    return { total: t('total-num'), unit: t('total-unit') };
  });
  out.kapsam3Errors = p.errors.slice();
  await p.context().close();
  return out;
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const { srv, base } = await serve();
  const b = await launch();
  const r = await capture(base, b);
  await b.close(); srv.close();
  const file = process.argv[2];
  if (file) fs.writeFileSync(file, JSON.stringify(r, null, 2));
  console.log(JSON.stringify(r, null, 2));
}
