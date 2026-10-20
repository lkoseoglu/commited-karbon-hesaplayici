// Hızlı göz kontrolü: node tests/e2e/probe-v6.mjs <klasör>
import fs from 'node:fs';
import { serve, launch, newPage } from './helpers.mjs';
const out = process.argv[2] || '/tmp/shots';
fs.mkdirSync(out, { recursive: true });
const { srv, base } = await serve();
const b = await launch();
for (const [name, opt] of [['light', { width: 1280, height: 900 }], ['mob', { width: 390, height: 844 }], ['dark', { width: 1280, height: 900, colorScheme: 'dark' }]]) {
  const p = await newPage(b, opt);
  await p.goto(base + 'turizm-karbon-hesaplayici-v6.html', { waitUntil: 'load' });
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/v6_${name}_empty.png`, fullPage: true });
  await p.click('[data-example="otel"]');
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${out}/v6_${name}_filled.png`, fullPage: true });
  const info = await p.evaluate(() => ({ s: window.__tour && window.__tour.summary(), w: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  console.log(name, JSON.stringify({ total: info.s && info.s.total, cpor: info.s && info.s.cpor, grade: info.s && info.s.grade, scroll: info.w, client: info.cw }), 'errors=', JSON.stringify(p.errors));
  await p.context().close();
}
await b.close(); srv.close();
