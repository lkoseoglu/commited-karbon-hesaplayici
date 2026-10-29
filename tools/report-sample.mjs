// Örnek PDF raporu ve tek sayfalık özet üretir: hesap motoru (Node vm) → assets/js/turizm/report.js → HTML → Chromium → PDF.
// Kullanım (repo kökünde):
//   node tools/report-sample.mjs [çıktı-klasörü] [--no-logo]
//   → <klasör>/ornek-surdurulebilirlik-raporu.pdf + sayfa-XX.png, ornek-surdurulebilirlik-ozeti.pdf + ozet-01.png, HTML'ler
// Örnek otel, kurgusal logoyla (tests/fixtures/ornek-logo.png) basılır; --no-logo ile logosuz.
// Sitede rapor tarayıcıda üretilir (app.js → "PDF raporu oluştur" / "Tek sayfalık özet"); bu betik tasarımı denetlemek,
// örnek PDF hazırlamak ve sayfa taşmalarını ölçmek içindir. DM Sans yazı tipi devDependency'den gelir (internet gerekmez).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { loadApp, ROOT } from '../tests/helpers/load-hcmi.mjs';

const args = process.argv.slice(2);
const OUT = path.resolve(args.find((a) => !a.startsWith('--')) || path.join(ROOT, 'cikti-rapor'));
const withLogo = !args.includes('--no-logo');
fs.mkdirSync(OUT, { recursive: true });

const ctx = loadApp();
const T = ctx.TURIZM;
const st = T.model.exampleState();
st.hotel.taxonomy = { t_izleme: true, t_su: true };          // taksonomi bölümü dolu görünsün
if (withLogo) {
  st.hotel.logo = T.model.logoOf('data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'tests/fixtures/ornek-logo.png')).toString('base64'));
}
const R = T.compute(st);

const FONT_DIR = path.join(ROOT, 'node_modules/@fontsource-variable/dm-sans/files');
const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const LATIN_EXT = 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';
const fontCss = [['dm-sans-latin-ext-opsz-normal.woff2', LATIN_EXT], ['dm-sans-latin-opsz-normal.woff2', LATIN]]
  .map(([f, range]) => `@font-face{font-family:'DM Sans';font-style:normal;font-weight:100 1000;font-display:block;`
    + `src:url('file://${path.join(FONT_DIR, f)}') format('woff2');unicode-range:${range}}`).join('\n');

const exe = [process.env.CHROME_PATH, '/opt/google/chrome/chrome', '/usr/bin/google-chrome'].find((p) => p && fs.existsSync(p));
const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const out = { errors: [] };
for (const [variant, base, png] of [['report', 'ornek-surdurulebilirlik-raporu', 'sayfa'], ['summary', 'ornek-surdurulebilirlik-ozeti', 'ozet']]) {
  const html = T.report.build(st, R, { generatedAt: new Date(), sample: true, fontCss, variant });
  const htmlPath = path.join(OUT, base + '.html');
  fs.writeFileSync(htmlPath, html);
  const page = await browser.newPage();
  page.on('pageerror', (e) => out.errors.push(variant + ': ' + e.message));
  await page.goto('file://' + htmlPath, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  // Her sayfada gövdenin altında kalan boşluk (mm); eksi değer taşma demektir
  out[variant] = await page.evaluate(() => [...document.querySelectorAll('.page')].map((p, i) => {
    const body = p.querySelector('.body, .op-body'); if (!body) { return null; }
    const last = [...body.children].pop(), bb = body.getBoundingClientRect(), lb = last ? last.getBoundingClientRect() : bb;
    const back = p.querySelector('.back'), limit = back ? back.getBoundingClientRect().top - 4 * 3.7795 : bb.bottom;
    // gövdeden taşan tek tek öğeler (sağa da)
    const wide = [...body.querySelectorAll('*')].some((e) => e.getBoundingClientRect().right > bb.right + 1);
    return [i + 1, Math.round((limit - lb.bottom) / 3.7795 * 10) / 10, wide ? 'SAĞA TAŞMA' : ''];
  }).filter(Boolean));
  const pdfPath = path.join(OUT, base + '.pdf');
  await page.pdf({ path: pdfPath, preferCSSPageSize: true, printBackground: true });
  await page.close();
  try { execFileSync('pdftoppm', ['-r', process.env.DPI || '80', '-png', pdfPath, path.join(OUT, png)]); } catch (e) { /* pdftoppm yoksa görüntü yok */ }
}
await browser.close();
console.log(JSON.stringify(out));
const bad = (rows) => rows.some(([, mm, w]) => mm < 0 || w);
if (out.errors.length || bad(out.report) || bad(out.summary)) { process.exitCode = 1; }
