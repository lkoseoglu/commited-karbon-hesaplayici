// Ekran goruntuleri: node tests/e2e/shots.mjs <cikti-klasoru> [turizm|kapsam3]
import fs from 'node:fs';
import { serve, launch, newPage } from './helpers.mjs';
const out = process.argv[2] || '/tmp/shots';
const only = process.argv[3];
fs.mkdirSync(out, { recursive: true });
const { srv, base } = await serve();
const b = await launch();
const sets = [
  ['light', { width: 1280, height: 900, colorScheme: 'light' }],
  ['dark', { width: 1280, height: 900, colorScheme: 'dark' }],
  ['mob', { width: 390, height: 844, colorScheme: 'light' }],
];
for (const [name, opt] of sets) {
  if (!only || only === 'turizm') {
    const p = await newPage(b, opt);
    await p.goto(base + 'turizm-karbon-hesaplayici.html', { waitUntil: 'load' });
    await p.waitForTimeout(500);
    await p.screenshot({ path: `${out}/tur_${name}_top.png` });
    await p.click('[data-example="otel"]'); await p.waitForTimeout(500);
    await p.evaluate(() => document.getElementById('s_total').scrollIntoView({ block: 'start' }));
    await p.evaluate(() => { const e = document.querySelector('#sec-result, #sec-kiyas, [id^="sec-"]:nth-of-type(2)'); });
    await p.screenshot({ path: `${out}/tur_${name}_filled.png`, fullPage: true });
    console.log('turizm', name, p.errors);
    await p.context().close();
  }
  if (!only || only === 'kapsam3') {
    const p = await newPage(b, opt);
    await p.goto(base + 'kapsam3-karbon-hesaplayici.html', { waitUntil: 'load' });
    await p.waitForTimeout(500);
    await p.screenshot({ path: `${out}/k3_${name}_top.png` });
    await p.evaluate(() => window.loadExample()); await p.waitForTimeout(300);
    await p.screenshot({ path: `${out}/k3_${name}_form.png`, fullPage: true });
    await p.evaluate(() => window.calcBuyer()); await p.waitForTimeout(700);
    await p.screenshot({ path: `${out}/k3_${name}_result.png`, fullPage: true });
    console.log('kapsam3', name, p.errors);
    await p.context().close();
  }
}
await b.close(); srv.close();
