// Turizm hesaplayıcısında ekrana çıkan bütün Türkçe metinleri toplar (İngilizce sözlük için).
//
// Kullanım:  node tools/i18n-topla.mjs [çıktı.json]      (varsayılan: tools/i18n-kaynak.json)
//            node tools/i18n-topla.mjs --eksik             yalnız İngilizce sözlükte OLMAYANLARI listeler
//            node tools/i18n-topla.mjs --en [çıktı.json]   sayfayı İNGİLİZCE açar; ekranda Türkçe harf içeren
//                                                          (yani çevrilmemiş) metinleri listeler
//
// Sayfa gerçek Chromium'da (Firebase saplamalı) açılır ve şu durumlardan geçirilir: ziyaretçi ve üye,
// boş ve örnekli form, bütün açılır bölümler, hatalı girişler, panel, acente, kayıt penceresi,
// "Kayıtlarım", bildirimler; ayrıca PDF raporu ve tek sayfalık özet (HTML), panoya kopyalanan
// beyan ve özet metinleri. Her metin i18n.js'teki şablon anahtarına çevrilir ("Bu tesis {#}").
import fs from 'node:fs';
import path from 'node:path';
import { serve, launch, newPage, ROOT } from '../tests/e2e/helpers.mjs';

const onlyMissing = process.argv.includes('--eksik');
const EN = process.argv.includes('--en');
const LANG = EN ? 'en' : 'tr';
const OUT = process.argv.slice(2).find((a) => !a.startsWith('--')) || path.join(ROOT, 'tools/i18n-kaynak.json');
const PAGE = 'turizm-karbon-hesaplayici.html';
const MEMBER = { uid: 'u_topla', email: 'topla@otel.test', emailVerified: true };

const found = new Map();
function add(items, where) {
  for (const it of items) {
    if (!it.key) continue;
    const e = found.get(it.key) || { key: it.key, ornek: it.s, nerede: [], n: 0 };
    if (!e.nerede.includes(where)) e.nerede.push(where);
    e.n++; found.set(it.key, e);
  }
}

// Sayfada çalışır: görünür/gizli bütün metin düğümleri ve çevrilen öznitelikler
function collectInPage(rootSel) {
  const I = window.TURIZM.i18n, out = [];
  const wordy = I.lang() === 'en' ? (s) => /[ÇĞİÖŞÜçğıöşü]/.test(s) : (s) => /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(s);
  const skip = (el) => { for (let e = el; e && e.nodeType === 1; e = e.parentNode) { if (/^(SCRIPT|STYLE|NOSCRIPT)$/.test(e.tagName) || e.getAttribute('translate') === 'no') return true; } return false; };
  const rootEl = rootSel ? document.querySelector(rootSel) : document.body;
  const w = document.createTreeWalker(rootEl, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    if (n.nodeType === 3) { if (wordy(n.nodeValue) && !skip(n.parentNode)) out.push({ s: n.nodeValue, key: I.key(n.nodeValue) }); }
    else if (!skip(n)) {
      for (const a of ['placeholder', 'title', 'aria-label', 'alt', 'aria-roledescription']) {
        const v = n.getAttribute(a); if (v && wordy(v)) out.push({ s: v, key: I.key(v) });
      }
    }
  }
  if (!rootSel && wordy(document.title)) out.push({ s: document.title, key: I.key(document.title) });
  return out;
}
// Rapor HTML'i: DOMParser ile metin düğümleri
function collectHtml(html) {
  const I = window.TURIZM.i18n, out = [];
  const d = new DOMParser().parseFromString(html, 'text/html');
  const en = I.lang() === 'en';
  if (en) I.apply(d);                                   // uygulamadaki gibi: rapor sekmesi açılınca çevrilir
  const wordy = en ? (s) => /[ÇĞİÖŞÜçğıöşü]/.test(s) : (s) => /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(s);
  const w = d.createTreeWalker(d.documentElement, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    if (n.nodeType === 3) {
      if (wordy(n.nodeValue) && !/^(SCRIPT|STYLE)$/.test(n.parentNode.tagName)) out.push({ s: n.nodeValue, key: I.key(n.nodeValue) });
    } else {
      for (const a of ['aria-label', 'title', 'alt']) { const v = n.getAttribute(a); if (v && wordy(v)) out.push({ s: v, key: I.key(v) }); }
    }
  }
  return out;
}
function collectLines(text) {
  const I = window.TURIZM.i18n, out = [];
  const en = I.lang() === 'en';
  String(text || '').split('\n').forEach((line) => {
    const m = line.match(/^(\s*(?:[•·*\-–—]\s+|\d+[.)]\s+)?)(.*?)(\s*)$/);
    const body = m[2];
    if (!(en ? /[ÇĞİÖŞÜçğıöşü]/ : /[A-Za-zÇĞİÖŞÜçğıöşü]/).test(body)) return;
    out.push({ s: body, key: I.key(body) });
    if (en) return;
    const kv = body.match(/^(.+?):\s+(.*)$/);
    if (kv) { out.push({ s: kv[1] + ':', key: I.key(kv[1] + ':') }); if (/[A-Za-zçğıöşü]/.test(kv[2])) out.push({ s: kv[2], key: I.key(kv[2]) }); }
  });
  return out;
}

const settle = (p) => p.waitForTimeout(250);
const { srv, base } = await serve();
const browser = await launch();

async function open(opts = {}) {
  const { guest, ...vp } = opts;
  const p = await newPage(browser, { width: 1280, height: 900, ...vp });
  if (!guest) {
    await p.addInitScript((m) => {
      window.__fbTest = { users: { [m.email]: 'gizli123' }, current: m, listeners: [], calls: [],
        db: { ['firms/' + m.uid]: { name: 'Test Oteli', type: 'otel', city: 'Muğla', email: m.email, source: 'turizm-karbon-hesaplayici' } } };
    }, MEMBER);
  }
  await p.addInitScript((l) => { try { localStorage.setItem('turizm.lang', l); } catch (e) {} }, LANG);
  await p.goto(base + PAGE + '?lang=' + LANG, { waitUntil: 'load' });
  await p.waitForFunction(() => !!window.__tour && window.__tour.account() !== 'none');
  await settle(p);
  return p;
}
const grab = async (p, where, sel) => add(await p.evaluate(collectInPage, sel || null), where);
const openAllDetails = (p) => p.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));

// 1) ziyaretçi
{
  const p = await open({ guest: true });
  await grab(p, 'ziyaretci-bos');
  await p.click('#h_name'); await p.waitForSelector('#authModal:not([hidden])'); await grab(p, 'pencere-kayit');
  const loginTab = await p.$('#authModal [data-tab="login"]'); if (loginTab) { await loginTab.click(); await settle(p); await grab(p, 'pencere-giris'); }
  await p.keyboard.press('Escape');
  await p.click('#tab-acente'); await settle(p); await grab(p, 'ziyaretci-acente');
  await p.click('#tab-otel');
  await p.click('#h_notice [data-example="otel"]'); await settle(p); await grab(p, 'ziyaretci-ornek');
  await p.context().close();
}
// 2) üye: boş, örnek, açılır bölümler, önlemler, panel, kayıt, Kayıtlarım
{
  const p = await open();
  await grab(p, 'uye-bos');
  await openAllDetails(p); await grab(p, 'uye-bos-acik');
  await p.click('#h_notice [data-example="otel"]'); await settle(p);
  await openAllDetails(p); await grab(p, 'uye-ornek');
  // bütün önlemleri işaretle, sonra kaldır (plan metinleri)
  const boxes = await p.$$('#panel-otel input[type="checkbox"][id^="m_"]');
  for (const b of boxes) { await b.check().catch(() => {}); }
  await settle(p); await grab(p, 'uye-tum-onlemler');
  for (const b of boxes) { await b.uncheck().catch(() => {}); }
  // seçenekler: her <select> için her seçenek (metin değişen durumlar)
  const sels = await p.$$eval('#panel-otel select[data-bind]', (ss) => ss.map((s) => ({ id: s.id, vals: [...s.options].map((o) => o.value) })));
  for (const s of sels) {
    if (!s.id) continue;
    for (const v of s.vals) { await p.selectOption('#' + s.id, v).catch(() => {}); await p.waitForTimeout(60); await grab(p, 'secenek-' + s.id, '#panel-otel'); }
  }
  await p.click('#h_notice [data-clear="otel"]').catch(() => {}); await settle(p);
  await p.click('#h_notice [data-example="otel"]').catch(() => {}); await settle(p);
  const confirm = await p.$('#h_notice [data-confirm="otel"]'); if (confirm) { await grab(p, 'onay'); await confirm.click(); await settle(p); }
  // hatalı ve eksik girişler
  await p.fill('#h_roomnights', 'abc'); await p.press('#h_roomnights', 'Tab'); await settle(p); await grab(p, 'hatali');
  await p.fill('#h_roomnights', ''); await p.press('#h_roomnights', 'Tab'); await settle(p); await grab(p, 'eksik');
  await p.fill('#h_roomnights', '-5'); await p.press('#h_roomnights', 'Tab'); await settle(p); await grab(p, 'negatif');
  await p.click('#h_notice [data-clear="otel"]').catch(() => {}); await settle(p);
  await p.click('#h_notice [data-example="otel"]').catch(() => {}); await settle(p);
  const c2 = await p.$('#h_notice [data-confirm="otel"]'); if (c2) { await c2.click(); await settle(p); }
  // enerji defteri: hızlı ekle, ayrıntılar
  for (const q of await p.$$('#quick_add [data-quick]')) { await q.click().catch(() => {}); await p.waitForTimeout(40); }
  for (const m of await p.$$('[data-row-more]')) { await m.click().catch(() => {}); }
  await settle(p); await grab(p, 'defter');
  // çıktılar: bildirimler (toast) ve rapor mesajları
  for (const id of ['btn-decl', 'btn-copy', 'btn-json', 'btn-mail']) {
    const b = await p.$('#' + id); if (b) { await b.click().catch(() => {}); await p.waitForTimeout(120); await grab(p, 'toast-' + id, '#toast'); }
  }
  // panoya kopyalanan metinler
  add(await p.evaluate(collectLines, await p.evaluate(() => { const T = window.TURIZM; const s = window.__tour.state(); const R = window.__tour.result(); return T.i18n.tLines(T.texts.declaration(s, R) + '\n' + T.texts.executive(s, R)); })), 'pano-otel');
  // PDF raporu ve özet
  const html = await p.evaluate(() => { const T = window.TURIZM; const s = window.__tour.state(); const R = window.__tour.result();
    return [T.report.build(s, R, { toolbar: true, variant: 'report' }), T.report.build(s, R, { toolbar: true, variant: 'summary' })]; });
  add(await p.evaluate(collectHtml, html[0]), 'rapor'); add(await p.evaluate(collectHtml, html[1]), 'ozet');
  add(await p.evaluate(() => window.TURIZM.i18n.missing().map((k) => ({ s: k, key: k }))), 'eksik-t');
  // panel
  await p.evaluate(() => window.__tour.setView('dash')); await settle(p); await openAllDetails(p); await grab(p, 'panel');
  for (const b of await p.$$('#panel-dash [data-dash-act="add"]')) { await b.click().catch(() => {}); await p.waitForTimeout(40); }
  await settle(p); await grab(p, 'panel-onlemli');
  // hesaba kaydet + Kayıtlarım
  await p.evaluate(() => window.__tour.setView('steps')); await settle(p);
  const save = await p.$('#outputs [data-cloud-save]'); if (save) { await save.click(); await p.waitForTimeout(600); await grab(p, 'kaydet'); }
  const rec = await p.$('#acct [data-act="records"]'); if (rec) { await rec.click(); await p.waitForTimeout(600); await grab(p, 'kayitlarim'); await p.keyboard.press('Escape'); }
  await p.evaluate(() => window.__tour.setView('dash')); await settle(p); await grab(p, 'panel-gecmis');
  // acente
  await p.evaluate(() => window.__tour.setView('steps'));
  await p.click('#tab-acente'); await settle(p); await openAllDetails(p); await grab(p, 'acente-bos');
  await p.click('#a_notice [data-example="acente"]').catch(() => {}); await settle(p); await openAllDetails(p); await grab(p, 'acente-ornek');
  add(await p.evaluate(collectLines, await p.evaluate(() => { const T = window.TURIZM; const s = window.__tour.state(); return T.i18n.tLines(T.texts.agencySummary(s, T.agency.compute(s.agency))); })), 'pano-acente');
  const asels = await p.$$eval('#panel-acente select[data-bind]', (ss) => ss.map((s) => ({ id: s.id, vals: [...s.options].map((o) => o.value) })));
  for (const s of asels) { if (!s.id) continue; for (const v of s.vals) { await p.selectOption('#' + s.id, v).catch(() => {}); await p.waitForTimeout(60); await grab(p, 'secenek-' + s.id, '#panel-acente'); } }
  // çıkış
  const lo = await p.$('#acct [data-act="logout"]'); if (lo) { await lo.click(); await settle(p); await grab(p, 'cikis'); }
  await p.context().close();
}
// 3) telefon genişliği (kısa etiketler)
{
  const p = await open({ width: 390, height: 844 });
  await grab(p, 'telefon');
  await p.context().close();
}

await browser.close(); srv.close();

let list = [...found.values()];
if (onlyMissing) {
  // Sözlükte olmayanlar: İngilizce sözlüğü yükleyip has() ile sor
  const vm = await import('node:vm');
  const ctx = { console, URLSearchParams, URL, setTimeout, clearTimeout };
  ctx.globalThis = ctx; vm.createContext(ctx);
  for (const f of ['assets/js/num-input.js', 'assets/js/turizm/i18n.js', 'assets/js/turizm/i18n-en.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  ctx.TURIZM.i18n.setLang('en');
  list = list.filter((e) => !ctx.TURIZM.i18n.has(e.ornek));
}
fs.writeFileSync(OUT, JSON.stringify(list, null, 1));
console.log((onlyMissing ? 'eksik ' : 'toplam ') + list.length + ' metin → ' + OUT);
