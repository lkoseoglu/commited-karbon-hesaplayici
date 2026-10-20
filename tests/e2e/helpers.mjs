// Ortak test yardimcilari: statik sunucu + CDN/Firebase saplamalari + tarayici.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

export function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('yok'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, base: 'http://127.0.0.1:' + srv.address().port + '/' }));
  });
}

export async function launch() {
  // Yerel geliştirme ortamı / GitHub Actions (ubuntu-latest'te Chrome hazır gelir); bulunamazsa
  // Playwright'ın kendi Chromium'u kullanılır (npx playwright install chromium).
  const exe = [process.env.CHROME_PATH, '/opt/google/chrome/chrome', '/usr/bin/google-chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome']
    .find((p) => p && fs.existsSync(p));
  return chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
}

const read = (p) => fs.readFileSync(path.join(ROOT, p));
export async function newPage(browser, { width = 1280, height = 900, colorScheme = 'light', reducedMotion = 'no-preference', locale = 'tr-TR' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme, reducedMotion, locale, deviceScaleFactor: 1 });
  await ctx.route('https://www.gstatic.com/firebasejs/**', (route) => {
    const n = route.request().url().split('/').pop();
    const f = { 'firebase-app.js': 'firebase-app.js', 'firebase-auth.js': 'firebase-auth.js', 'firebase-firestore.js': 'firebase-firestore.js' }[n];
    if (!f) return route.fulfill({ status: 404, body: '' });
    route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(ROOT, 'tests/e2e/stubs', f)) });
  });
  await ctx.route('https://cdn.sheetjs.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: read('node_modules/xlsx/dist/xlsx.full.min.js') }));
  await ctx.route('https://cdnjs.cloudflare.com/ajax/libs/jspdf/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: read('node_modules/jspdf/dist/jspdf.umd.min.js') }));
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await ctx.route('https://fonts.gstatic.com/**', (r) => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.errors = errors;
  return page;
}
