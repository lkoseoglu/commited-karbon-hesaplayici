// Yönetim paneli (turizm-admin.html): giriş ve yetki, özet, liste, otel ayrıntısı (salt okunur), Excel,
// yedek okuma yolu, erişilebilirlik ve telefon. Gerçek Chromium, Firebase saplamalı.
//   npm run test:e2e    (ya da: node --test tests/e2e/turizm-admin.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { AxeBuilder } from '@axe-core/playwright';
import { serve, launch, newPage } from './helpers.mjs';
import { loadScripts, APP_SCRIPTS } from '../helpers/load-hcmi.mjs';
import { adminFixture, adminFixtureDb } from '../helpers/admin-fixture.mjs';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const { srv, base } = await serve();
const browser = await launch();
test.after(async () => { await browser.close(); srv.close(); });

const node = loadScripts([...APP_SCRIPTS, 'assets/js/turizm/admin.js']);   // aynı hesap Node'da: ekranla karşılaştırmak için
const T = node.TURIZM;
const ADMIN = 'levent.koseoglu@commited.app', PASS = 'sifre123';
const fmt = (x, d) => node.NUM.format(x, d);

async function open({ db = null, current = null, denyGroup = false, ...vp } = {}) {
  const data = db || adminFixtureDb(adminFixture(T, Date.now()));
  const p = await newPage(browser, { width: 1280, height: 900, ...vp });
  await p.addInitScript(({ data, current, denyGroup, ADMIN, PASS }) => {
    window.__fbTest = { users: { [ADMIN]: PASS, 'deniz@otel.test': 'otel123' }, current, listeners: [], calls: [], db: data, denyGroup };
  }, { data, current, denyGroup, ADMIN, PASS });
  await p.goto(base + 'turizm-admin.html', { waitUntil: 'load' });
  return p;
}
async function login(p, email = ADMIN, pass = PASS) {
  await p.waitForSelector('#gate-form:not([hidden])');
  await p.fill('#g_email', email); await p.fill('#g_pass', pass); await p.click('#g_login');
}
async function admin(opts) { const p = await open(opts); await login(p); await p.waitForSelector('.adm-list, .adm .dcard'); return p; }
const text = (p, sel) => p.$eval(sel, (e) => e.textContent.trim());
const texts = (p, sel) => p.$$eval(sel, (es) => es.map((e) => e.textContent.trim()));
async function axe(p, label) {
  await p.waitForFunction(() => { const t = document.getElementById('toast');
    return !t || (!t.classList.contains('show') && getComputedStyle(t).opacity === '0'); }, null, { timeout: 5000 });
  const r = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const out = r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ') + ' -> ' + ((n.any[0] && n.any[0].message) || '')).join(' | ')}`);
  assert.deepEqual(out, [], label + ' ihlalleri:\n' + out.join('\n'));
}
async function noHScroll(p) {
  const w = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  assert.ok(w[0] <= w[1], `yatay kaydırma var: ${w[0]} > ${w[1]}`);
}

test('giriş: oturum yokken giriş kutusu; yönetici olmayan hesap reddedilir ve hiçbir kayıt okunmaz', async () => {
  const p = await open();
  await p.waitForSelector('#gate-form:not([hidden])');
  assert.equal(await p.isVisible('#adm-app'), false);
  await p.fill('#g_email', ADMIN); await p.fill('#g_pass', 'yanlis'); await p.click('#g_login');
  await p.waitForFunction(() => document.getElementById('g_err').textContent.length > 0);
  assert.equal(await text(p, '#g_err'), 'E-posta veya şifre hatalı.');
  await p.fill('#g_email', 'deniz@otel.test'); await p.fill('#g_pass', 'otel123'); await p.click('#g_login');
  await p.waitForSelector('#gate-denied:not([hidden])');
  assert.match(await text(p, '#gate-msg'), /deniz@otel\.test hesabıyla giriş yaptınız\. Bu sayfa yalnız Commited yöneticileri içindir/);
  assert.equal(await p.isVisible('#adm-app'), false);
  const reads = await p.evaluate(() => window.__fbTest.calls.filter((c) => c[0] === 'getDocs'));
  assert.deepEqual(reads, [], 'yönetici olmayan hesapla veri okunmamalı');
  await p.click('#g_out');
  await p.waitForSelector('#gate-form:not([hidden])');
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('yönetici: özet sayılar, kıyas şeridi, haftalar ve satış fırsatları hesapla aynı', async () => {
  const p = await admin();
  const m = T.admin.build({ ...adminFixture(T, Date.now()), now: Date.now() });
  assert.equal(await text(p, '#adm-who'), ADMIN);
  const kpi = await texts(p, '.ah-kpis dd');
  assert.ok(kpi[0].startsWith('5') && kpi[0].includes('son 30 günde 4 yeni'), kpi[0]);
  assert.ok(kpi[1].startsWith('3') && kpi[1].includes('1 otel güncelleme bekliyor'), kpi[1]);
  assert.equal(kpi[2], '1');
  assert.ok(kpi[3].startsWith('5'));
  assert.ok(kpi[4].startsWith(fmt(m.counts.totalT, 0)), kpi[4] + ' ≠ ' + fmt(m.counts.totalT, 0));
  // kıyas şeridi: her otel bir nokta; dağılım ekran okuyucuya metin olarak
  assert.equal(await p.locator('.ah-dot').count(), 3);
  assert.deepEqual(await texts(p, '.ah-counts span'), ['0 otel', '2 otel', '0 otel', '0 otel', '1 otel']);
  assert.match(await text(p, '.ah-fleet .sr-only'), /B notunda 2, C notunda 0, D notunda 0, E notunda 1 otel\./);
  // haftalar: 12 sütun, bu hafta vurgulu; gösterge değişir; tablo eşi
  assert.equal(await p.locator('[data-chart="weeks"] g.colg').count(), 12);
  assert.equal(await p.locator('[data-chart="weeks"] g.colg.cur').count(), 1);
  assert.match(await text(p, '#ac-weeks + .dc-sub'), /^Son 12 hafta: 5 yeni üye\./);
  await p.click('[data-adm-metric="records"]');
  assert.match(await text(p, '#ac-weeks + .dc-sub'), /^Son 12 hafta: 5 kaydedilen hesap\./);
  assert.equal(await p.evaluate(() => document.activeElement.getAttribute('data-adm-metric')), 'records', 'odak düğmede kalır');
  await p.click('[data-adm-tbl]');
  assert.equal(await p.locator('#atbl-weeks tbody tr').count(), 12);
  // ipucu klavyeyle de açılır
  await p.focus('[data-chart="weeks"] g.colg >> nth=11');
  assert.match(await text(p, '[data-chart="weeks"] .dtip'), /bu hafta/);
  // satış fırsatları
  assert.deepEqual(await texts(p, '.opps .opp-n b'), ['3', '1', '1', '1']);
  assert.deepEqual(await texts(p, '.opps .opp-t'), ['Doğrulamaya hazır', 'Kıyasın üstünde (D ve E)', 'Güncelleme bekliyor', 'Hesap kaydetmemiş üye']);
  assert.match(await text(p, '.opp-off'), new RegExp('kalan yıllık emisyon ' + fmt(m.opps.offsetT, 0).replace('.', '\\.') + ' t CO₂e'));
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('liste: arama, süzgeç, sıralama, sekmeler; fırsattan listeye; Excel dosyası', async () => {
  const p = await admin();
  const names = async () => p.$$eval('#adm-tbl tbody th .linkbtn, #adm-tbl tbody th > span:first-child', (es) => es.map((e) => e.textContent.trim()));
  assert.equal(await text(p, '#adm-tbl tbody tr:first-child th .cell-sub'), 'Nevşehir, 5★ tatil köyü / resort');
  assert.deepEqual(await names(), ['Kale Otel', 'Deniz Otel', 'Zeytin Pansiyon'], 'son kayda göre');
  await p.fill('#adm-q', 'AYVALIK');
  assert.deepEqual(await names(), ['Zeytin Pansiyon']);
  assert.equal(await text(p, '#adm-count'), '1 / 3 otel gösteriliyor');
  await p.fill('#adm-q', '');
  await p.click('.al-chips [data-adm-filter="high"]');
  assert.deepEqual(await names(), ['Kale Otel']);
  assert.equal(await p.getAttribute('.al-chips [data-adm-filter="high"]', 'aria-pressed'), 'true');
  await p.click('.al-chips [data-adm-filter="all"]');
  await p.click('[data-adm-sort="cpor"]');
  assert.deepEqual(await names(), ['Kale Otel', 'Deniz Otel', 'Zeytin Pansiyon']);
  assert.equal(await p.getAttribute('th:has([data-adm-sort="cpor"])', 'aria-sort'), 'descending');
  await p.click('[data-adm-sort="cpor"]');
  assert.equal((await names())[2], 'Kale Otel');
  assert.equal(await p.getAttribute('th:has([data-adm-sort="cpor"])', 'aria-sort'), 'ascending');
  assert.equal(await p.evaluate(() => document.activeElement.getAttribute('data-adm-sort')), 'cpor', 'odak sıralama düğmesinde kalır');
  // sekmeler
  await p.click('[data-adm-tab="agencies"]:not([data-adm-filter])');
  assert.deepEqual(await names(), ['Mavi Tur']);
  await p.click('[data-adm-tab="members"]:not([data-adm-filter])');
  assert.equal(await p.locator('#adm-tbl tbody tr').count(), 5);
  await p.click('.al-chips [data-adm-filter="idle"]');
  assert.deepEqual(await names(), ['Yeni Üye Otel']);
  // satış fırsatından listeye: otel sekmesi, ilgili süzgeç
  await p.click('.opps [data-adm-filter="stale"]');
  assert.equal(await p.getAttribute('[data-adm-tab="hotels"]:not([data-adm-filter])', 'aria-pressed'), 'true');
  assert.equal(await p.getAttribute('.al-chips [data-adm-filter="stale"]', 'aria-pressed'), 'true');
  assert.deepEqual(await names(), ['Zeytin Pansiyon']);
  assert.equal(await p.evaluate(() => document.activeElement.id), 'ac-list');
  // Excel: üç sayfa, sayılar sayı
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#adm-xlsx')]);
  assert.match(dl.suggestedFilename(), /^commited-turizm-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const wb = XLSX.readFile(await dl.path());
  assert.deepEqual(wb.SheetNames, ['Oteller', 'Acenteler', 'Üyeler']);
  const ot = XLSX.utils.sheet_to_json(wb.Sheets.Oteller, { header: 1 });
  assert.equal(ot.length, 4); assert.equal(ot[0][0], 'Otel');
  const kale = ot.find((r) => r[0] === 'Kale Otel');
  assert.equal(typeof kale[5], 'number'); assert.equal(kale[6], 'E');
  assert.equal(XLSX.utils.sheet_to_json(wb.Sheets['Üyeler'], { header: 1 }).length, 6);
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('otel ayrıntısı: otelin kendi paneli salt okunur, önceki yıl aynı yöntemle; PDF rapor; listeye dönüş', async () => {
  const p = await admin();
  await p.click('[data-adm-open] >> text=Deniz Otel');
  await p.waitForSelector('#adm-dash .dhero');
  assert.equal(await text(p, '#dash-h'), 'Deniz Otel');
  assert.equal(await p.evaluate(() => document.activeElement.id), 'dash-h');
  const s = T.model.exampleState(); s.hotel.name = 'Deniz Otel';
  const R = T.compute(s);
  assert.equal(await text(p, '#adm-dash .dh-num .sr-only'), fmt(R.metrics.cpor, 1) + ' kg CO₂e satılan oda-gece başına');
  assert.match(await text(p, '#adm-dash .dh-delta'), /^2024'e göre %[\d,]+ daha az$/);
  assert.equal(await p.locator('#adm-dash [data-chart="trend"] g.colg').count(), 2);
  assert.match(await text(p, '.ad-meta'), /deniz@otel\.test.*2 kayıt.*2024, 2025/);
  // salt okunur: önlem ekle / çıkar, kaydet, rapor, veri girin, adım bağlantıları yok
  for (const sel of ['.btn-add', '[data-dash-act]', '[data-cloud-save]', '[data-auth]', '.plansel button', '.dacts']) {
    assert.equal(await p.locator('#adm-dash ' + sel).count(), 0, sel);
  }
  assert.equal(await text(p, '#adm-dash .d-next .dc-h4'), 'Önerilen önlemler');
  // PDF raporu yeni sekmede, otelin kendi verisiyle
  const [pop] = await Promise.all([p.context().waitForEvent('page'), p.click('[data-adm-report="report"]')]);
  await pop.waitForLoadState('domcontentloaded');
  assert.ok((await pop.content()).includes('Deniz Otel'));
  await pop.close();
  // listeye dönüş: düğmeyle; odak otelin adına
  await p.click('[data-adm-back]');
  await p.waitForSelector('.adm-list');
  assert.equal(await p.evaluate(() => document.activeElement.textContent), 'Deniz Otel');
  // tarayıcının geri düğmesiyle de
  await p.click('[data-adm-open] >> text=Kale Otel');
  await p.waitForSelector('#adm-dash .dhero');
  await p.goBack();
  await p.waitForSelector('.adm-list');
  assert.equal(await p.isVisible('#adm-app'), true);
  // eski sürüm kaydı: not ve tek yıl
  await p.click('[data-adm-open] >> text=Zeytin Pansiyon');
  await p.waitForSelector('#adm-dash .dhero');
  assert.match(await text(p, '.adm-detail > .notice'), /önceki sürümüyle yapılmış/);
  assert.match(await text(p, '#adm-dash .d-trend .dc-empty'), /yalnız 2023 verisini kaydetmiş/);
  // şeritteki noktaya tıklayınca da ayrıntı açılır
  await p.click('[data-adm-back]'); await p.waitForSelector('.adm-list');
  await p.click('.ah-dot >> nth=2');
  await p.waitForSelector('#adm-dash .dhero');
  assert.equal(await text(p, '#dash-h'), 'Kale Otel');
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('yedek okuma: toplu okuma izni yoksa kayıtlar üye profilleri üzerinden okunur ve not gösterilir', async () => {
  const p = await admin({ denyGroup: true });
  assert.match(await text(p, '#adm-main .adm > .notice'), /üye profilleri üzerinden okundu/);
  assert.equal(await text(p, '[data-adm-tab="hotels"]:not([data-adm-filter])'), 'Oteller (2)', 'profili olmayan Kale Otel görünmez');
  const reads = await p.evaluate(() => window.__fbTest.calls.filter((c) => c[0] === 'getDocs').map((c) => c[1]));
  assert.ok(reads.includes('group:items') && reads.includes('reports/u_deniz/items'), reads.join(', '));
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('oturum açıksa doğrudan panel; boş veride davet; çıkışta veri ekrandan kalkar', async () => {
  const p = await open({ db: {}, current: { uid: 'u_admin', email: ADMIN, emailVerified: true } });
  await p.waitForSelector('.adm .dcard');
  assert.match(await text(p, '#adm-main'), /Henüz üye ya da kayıt yok/);
  assert.deepEqual(await texts(p, '.ah-kpis dd'), ['0son 30 günde yeni üye yok', '0', '0', '0son 30 günde yok', '0t CO₂e, son kayıtların toplamı']);
  assert.match(await text(p, '.ah-none'), /Hesabı tamamlanmış otel yok/);
  await p.click('#adm-logout');
  await p.waitForSelector('#gate-form:not([hidden])');
  assert.equal(await p.evaluate(() => document.getElementById('adm-main').textContent), '');
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

for (const scheme of ['light', 'dark']) {
  test(`yönetim paneli erişilebilirlik (${scheme}): giriş, genel görünüm, üyeler, otel ayrıntısı; telefonda taşma yok`, async () => {
    const p = await open({ colorScheme: scheme });
    await p.waitForSelector('#gate-form:not([hidden])');
    await axe(p, 'giriş');
    await login(p); await p.waitForSelector('.adm-list');
    await axe(p, 'genel');
    await p.click('[data-adm-tab="members"]:not([data-adm-filter])');
    await p.click('[data-adm-tbl]');
    await axe(p, 'üyeler ve hafta tablosu');
    await p.click('[data-adm-tab="hotels"]:not([data-adm-filter])');
    await p.click('[data-adm-open] >> text=Deniz Otel'); await p.waitForSelector('#adm-dash .dhero');
    await axe(p, 'otel ayrıntısı');
    await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
    await noHScroll(p);
    await p.click('[data-adm-back]'); await p.waitForSelector('.adm-list'); await p.waitForTimeout(300);
    await noHScroll(p);
    assert.deepEqual(p.errors, []);
    await p.context().close();
  });
}
