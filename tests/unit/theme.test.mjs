// Deniz temasi tutarlilik testleri: koyu mod iki yerde ayni mi, sayfalarda sabit renk var mi,
// kullanilan her degisken tanimli mi, dalga isaretlemesi iki sayfada ayni mi.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const THEME = stripComments(rd('assets/css/theme-sea.css'));
// v6 önizlemesi canlıya taşınınca (tools/promote-v6.py) -v6 dosyası yönlendirme sayfasına döner; o zaman denetlenmez.
const PAGES = ['turizm-karbon-hesaplayici.html', 'kapsam3-karbon-hesaplayici.html', 'turizm-karbon-hesaplayici-v6.html']
  .filter((f) => fs.existsSync(path.join(ROOT, f)) && rd(f).includes('<header class="hero">'));
const APP_PAGE = PAGES.find((f) => rd(f).includes('assets/css/turizm-app.css'));
// Sayfanın yüklediği yerel stil dosyaları (tema dosyası hariç) da sayfa stili sayılır
const linkedCss = (html) => [...html.matchAll(/<link rel="stylesheet" href="(assets\/css\/[^"]+\.css)">/g)]
  .map((m) => m[1]).filter((f) => !/theme-sea\.css$/.test(f)).map((f) => rd(f)).join('\n');

// "{ ... }" blogunu dengeli sayarak al
function block(css, startIdx) {
  const open = css.indexOf('{', startIdx); let d = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') d++;
    if (css[i] === '}') { d--; if (!d) return css.slice(open + 1, i); }
  }
  throw new Error('blok kapanmadi');
}
const tokens = (body) => {
  const m = {}; const re = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi; let x;
  while ((x = re.exec(body))) m[x[1]] = x[2].trim().replace(/\s+/g, ' ');
  return m;
};

const lightBlock = block(THEME, THEME.indexOf(':root{'));
const mediaBlock = block(THEME, THEME.indexOf('@media (prefers-color-scheme: dark)'));
const darkMedia = block(mediaBlock, mediaBlock.indexOf(':root:not([data-theme="light"])'));
const darkAttr = block(THEME, THEME.indexOf(':root[data-theme="dark"]'));
const LIGHT = tokens(lightBlock), DARK_M = tokens(darkMedia), DARK_A = tokens(darkAttr);

test('koyu mod iki yerde ayni degerlere sahip', () => {
  assert.deepEqual(DARK_M, DARK_A);
  assert.ok(Object.keys(DARK_M).length > 40, 'koyu blok bos gorunuyor');
});

test('koyu moddaki her degisken acik temada da tanimli', () => {
  for (const k of Object.keys(DARK_M)) assert.ok(k in LIGHT, k + ' acik temada yok');
});

test('temel degiskenler hem acik hem koyu temada tanimli', () => {
  const need = ['--bg', '--surface', '--ink', '--muted', '--line', '--brand', '--deep', '--on-deep', '--accent', '--on-accent',
    '--hero-a', '--hero-b', '--hero-c', '--hero-ink', '--series', '--good', '--warn', '--bad', '--on-brand', '--scrim'];
  for (const k of need) { assert.ok(k in LIGHT, 'acik: ' + k); assert.ok(k in DARK_M, 'koyu: ' + k); }
});

for (const f of PAGES) {
  const html = rd(f) + '\n' + linkedCss(rd(f));
  const css = stripComments([...rd(f).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n') + '\n' + linkedCss(rd(f)));
  // sayfada (stil blogu veya satir ici style="--c:...") tanimlanan degiskenler
  const localDefs = Object.fromEntries([...html.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => [m[1], 1]));

  test(f + ': tema dosyasini yukler', () => {
    assert.match(html, /<link rel="stylesheet" href="assets\/css\/theme-sea\.css">/);
  });

  test(f + ': sayfa stillerinde sabit renk kodu yok (yalniz Google marka mavisi)', () => {
    const hex = [...css.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)].map((m) => m[0].toUpperCase());
    const bad = hex.filter((h) => !['#4285F4'].includes(h));
    assert.deepEqual(bad, [], 'sabit renkler: ' + bad.join(', '));
  });

  test(f + ': kullanilan her var(--x) tanimli', () => {
    const used = new Set([...html.matchAll(/var\((--[a-z0-9-]+)/gi)].map((m) => m[1]));
    const missing = [...used].filter((k) => !(k in LIGHT) && !(k in localDefs));
    assert.deepEqual(missing, [], 'tanimsiz degiskenler: ' + missing.join(', '));
  });

  test(f + ': dalgali hero var ve dalgalar hero icinde', () => {
    assert.match(html, /<header class="hero">/);
    assert.match(html, /<div class="sea-waves" aria-hidden="true">/);
    assert.ok(html.indexOf('sea-waves') < html.indexOf('</header>'));
  });
}

test('dalga isaretlemesi tum sayfalarda ayni', () => {
  const grab = (f) => (rd(f).match(/<div class="sea-waves"[\s\S]*?<\/div>/) || [''])[0];
  for (const f of PAGES.slice(1)) assert.equal(grab(f), grab(PAGES[0]), f);
  assert.ok(grab(PAGES[0]).length > 300);
});

test('turizm-app.css yuklu ve sabit renk icermiyor (yazdirma icin yalniz renk adi)', () => {
  const css = stripComments(rd('assets/css/turizm-app.css'));
  assert.ok(APP_PAGE, 'turizm-app.css dosyasını yükleyen sayfa yok');
  const hex = [...css.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)].map((m) => m[0].toUpperCase()).filter((h) => h !== '#4285F4');
  assert.deepEqual(hex, []);
  assert.ok(!/rgba?\(/.test(css.replace(/@media print\{[\s\S]*$/, '')), 'rgb()/rgba() yerine tema degiskeni kullanin');
});

test('dalga animasyonu hareket azaltma tercihine saygi gosterir', () => {
  assert.match(THEME, /prefers-reduced-motion: reduce\)\{\.sea-waves svg\{animation:none/);
});

// Yönetim paneli (turizm-admin.html): dalgalı hero'su yok ama aynı tema kurallarına uyar
const ADMIN_PAGE = 'turizm-admin.html';
if (fs.existsSync(path.join(ROOT, ADMIN_PAGE))) {
  const page = rd(ADMIN_PAGE), linked = linkedCss(page);
  const css = stripComments([...page.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n') + '\n' + linked);
  const all = page + '\n' + linked;
  const localDefs = Object.fromEntries([...all.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => [m[1], 1]));
  test(ADMIN_PAGE + ': tema dosyasini ve turizm stillerini yukler; sabit renk yok; her var(--x) tanimli', () => {
    assert.match(page, /<link rel="stylesheet" href="assets\/css\/theme-sea\.css">/);
    assert.match(page, /<link rel="stylesheet" href="assets\/css\/turizm-admin\.css">/);
    const hex = [...css.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)].map((m) => m[0].toUpperCase()).filter((h) => h !== '#4285F4');
    assert.deepEqual(hex, [], 'sabit renkler: ' + hex.join(', '));
    const used = new Set([...all.matchAll(/var\((--[a-z0-9-]+)/gi)].map((m) => m[1]));
    const missing = [...used].filter((k) => !(k in LIGHT) && !(k in localDefs));
    assert.deepEqual(missing, [], 'tanimsiz degiskenler: ' + missing.join(', '));
  });
  test('turizm-admin.css: rgb()/rgba() yok; sayfa arama motorlarina kapali', () => {
    assert.ok(!/rgba?\(/.test(stripComments(rd('assets/css/turizm-admin.css'))), 'rgb()/rgba() yerine tema degiskeni kullanin');
    assert.match(page, /<meta name="robots" content="noindex,nofollow">/);
  });
}
