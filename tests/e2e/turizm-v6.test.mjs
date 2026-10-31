// Turizm v6 önizleme sayfası: uçtan uca davranış (gerçek Chromium, Firebase saplamalı).
//   npm run test:e2e    (ya da: node --test tests/e2e/turizm-v6.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { AxeBuilder } from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import { serve, launch, newPage, ROOT } from './helpers.mjs';
import { loadApp } from '../helpers/load-hcmi.mjs';

// Önizleme dururken -v6 dosyası, canlıya taşındıktan sonra (tools/promote-v6.py) asıl adres sınanır.
const PAGE = fs.readFileSync(path.join(ROOT, 'turizm-karbon-hesaplayici-v6.html'), 'utf8').includes('data-preview-flag')
  ? 'turizm-karbon-hesaplayici-v6.html' : 'turizm-karbon-hesaplayici.html';
const { srv, base } = await serve();
const browser = await launch();
test.after(async () => { await browser.close(); srv.close(); });

const node = loadApp();                                   // aynı hesap Node'da: ekranla karşılaştırmak için
const ex = node.TURIZM.compute(node.TURIZM.model.exampleState());

async function open(opts = {}) {
  const p = await newPage(browser, { width: 1280, height: 900, ...opts });
  await p.goto(base + PAGE, { waitUntil: 'load' });
  await p.waitForFunction(() => !!window.__tour);
  return p;
}
const settle = (p) => p.waitForTimeout(260);           // yazma gecikmesi (140 ms) + çizim
const text = (p, sel) => p.$eval(sel, (e) => e.textContent.trim());
async function noHScroll(p) {
  const w = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  assert.ok(w[0] <= w[1], `yatay kaydırma var: ${w[0]} > ${w[1]}`);
}
async function axe(p, label) {
  // Bildirim (toast) solarken taranırsa yarı saydam yazı yanlışlıkla düşük kontrast sayılır (yavaş makinede
  // GitHub Actions'ta görüldü); taramadan önce bildirimin tamamen kaybolması beklenir.
  await p.waitForFunction(() => { const t = document.getElementById('toast');
    return !t || (!t.classList.contains('show') && getComputedStyle(t).opacity === '0'); }, null, { timeout: 5000 });
  const r = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const out = r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ') + ' -> ' + ((n.any[0] && n.any[0].message) || '')).join(' | ')}`);
  assert.deepEqual(out, [], label + ' ihlalleri:\n' + out.join('\n'));
}

test('boş açılış: hata yok, sonuçlar boş, örnek düğmesi var, telefonda taşma yok', async () => {
  for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const p = await open(vp);
    assert.equal(await text(p, '#s_total'), '—');
    assert.equal(await text(p, '#s_grade'), '—');
    assert.equal(await p.evaluate(() => window.__tour.isEmpty()), true);
    assert.equal(await p.locator('#ledger_rows .lrow').count(), 7);
    assert.ok(await p.locator('#h_notice [data-example="otel"]').count());
    assert.equal(await p.locator('#msgs li').count(), 0, 'boş formda uyarı yağmuru yok');
    await noHScroll(p);
    assert.deepEqual(p.errors, []);
    await p.context().close();
  }
});

test('örnekle doldur: ekrandaki sonuç Node hesabıyla aynı', async () => {
  const p = await open();
  await p.click('#h_notice [data-example="otel"]'); await settle(p);
  assert.equal(await text(p, '#s_total'), '1.060');
  assert.equal(await text(p, '#s_cpor'), '34,4');
  assert.equal(await text(p, '#s_meet'), '0,0476');
  assert.equal(await text(p, '#s_grade'), 'B');
  const sm = await p.evaluate(() => window.__tour.summary());
  assert.ok(Math.abs(sm.total - ex.totals.hcmiT * 1000) < 1e-6, `${sm.total} ≠ ${ex.totals.hcmiT * 1000}`);
  assert.equal(sm.cpor, Math.round(ex.metrics.cpor * 100) / 100); assert.equal(sm.grade, 'B'); assert.equal(sm.year, 2025);
  assert.equal(sm.hcmi.schema, 'commited.hotel.hcmi/2');
  assert.equal(await p.inputValue('#ea-e1'), '1.480.000');
  assert.equal(await text(p, '#eo-e1'), '694 t');
  assert.match(await text(p, '#grid_info'), /0,469 kgCO₂e\/kWh/);
  assert.match(await text(p, '#d_name'), /Örnek Tatil Köyü · Muğla/);
  assert.equal(await text(p, '#r_complete'), '100');
  assert.ok(await p.locator('#macc tbody tr').count() >= 10);
  assert.equal(await p.locator('#pathsvg polyline').count(), 2, 'hedef ve plan çizgisi');
  assert.match(await text(p, '#h_notice'), /Örnek veriler yüklendi/);
  // dolu formda örnek yeniden istenirse onay sorulur (tarayıcı penceresi açılmaz)
  await p.click('#h_notice [data-clear="otel"]'); await settle(p);
  assert.equal(await text(p, '#s_total'), '—');
  await p.fill('#h_name', 'Benim Otelim'); await settle(p);
  await p.click('#h_notice [data-example="otel"]');
  assert.match(await text(p, '#h_notice'), /örnek veriler yüklenecek/);
  await p.click('#h_notice [data-cancel="otel"]');
  assert.equal(await p.inputValue('#h_name'), 'Benim Otelim', 'vazgeçince veri korunur');
  await p.click('#h_notice [data-example="otel"]'); await p.click('#h_notice [data-confirm="otel"]'); await settle(p);
  assert.equal(await p.inputValue('#h_name'), 'Örnek Tatil Köyü');
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('Türkçe sayı girişi: binlik nokta, ondalık virgül, hatalı değer işaretlenir', async () => {
  const p = await open();
  await p.fill('#ea-e1', '1.480.000'); await settle(p);
  assert.equal(await p.evaluate(() => window.__tour.state().hotel.energy[0].total), 1480000);
  assert.equal(await text(p, '#eo-e1'), '694 t');
  await p.fill('#h_area_rooms', '5200,5'); await p.press('#h_area_rooms', 'Tab'); await settle(p);
  assert.equal(await p.inputValue('#h_area_rooms'), '5.200,5', 'alandan çıkınca biçimlenir');
  assert.equal(await p.evaluate(() => window.__tour.state().hotel.area.rooms), 5200.5);
  await p.fill('#h_roomnights', '12 oda'); await settle(p);
  assert.equal(await p.getAttribute('#h_roomnights', 'aria-invalid'), 'true');
  assert.match(await text(p, '#h_roomnights-err'), /Sayı yazın/);
  assert.equal(await p.evaluate(() => window.__tour.state().hotel.occupiedRooms), null, 'okunamayan değer hesaba boş girer');
  assert.ok((await p.locator('#msgs li.errors').allTextContents()).some((t) => /"Satılan oda-gece" alanındaki "12 oda" okunamadı/.test(t)), 'veri kontrolü asıl nedeni söyler');
  await p.click('#msgs [data-goto-id="h_roomnights"]');
  assert.equal(await p.evaluate(() => document.activeElement.id), 'h_roomnights');
  await p.fill('#h_roomnights', '-5'); await settle(p);
  assert.match(await text(p, '#h_roomnights-err'), /Negatif olamaz/);
  await p.fill('#h_roomnights', '26.280'); await settle(p);
  assert.equal(await p.getAttribute('#h_roomnights', 'aria-invalid'), null);
  assert.equal(await p.locator('#h_roomnights-err').count(), 0);
  await p.fill('#h_year', '25'); await settle(p);
  assert.match(await text(p, '#h_year-err'), /4 haneli/);
  await p.fill('#h_year', '2022'); await settle(p);
  assert.match(await text(p, '#grid_info'), /0,478/, '2022 faktörü');
  await p.selectOption('#h_conn', 'transmission'); await settle(p);
  assert.match(await text(p, '#grid_info'), /0,445/, '2022 iletim');
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('enerji defteri: hızlı ekle, sil, birim değiştir, elle faktör', async () => {
  const p = await open();
  await p.click('#h_notice [data-example="otel"]'); await settle(p);
  const total0 = await p.evaluate(() => window.__tour.summary().total);
  // fuel-oil ekle
  await p.click('#quick_add [data-quick="fuel_oil_2"]'); await settle(p);
  assert.equal(await p.locator('#ledger_rows .lrow').count(), 8);
  const newId = await p.evaluate(() => window.__tour.state().hotel.energy.at(-1).id);
  assert.equal(await p.evaluate(() => document.activeElement.id), 'ea-' + newId, 'yeni satırın miktarına odaklanır');
  await p.keyboard.type('1000'); await settle(p);
  const total1 = await p.evaluate(() => window.__tour.summary().total);
  assert.ok(total1 > total0 + 2500, `${total1} - ${total0}`);
  assert.equal(await p.locator('#quick_add [data-quick="fuel_oil_2"]').count(), 0, 'eklenen tür hızlı ekle listesinden çıkar');
  // sil
  await p.click('#ed-del-' + newId); await settle(p);
  assert.equal(await p.locator('#ledger_rows .lrow').count(), 7);
  assert.ok(Math.abs((await p.evaluate(() => window.__tour.summary().total)) - total0) < 1e-6);
  // doğal gaz birimini kWh yap: toplam değişmez, miktar kWh'e çevrilir
  await p.selectOption('#eu-e2', 'kWh'); await settle(p);
  assert.ok(Math.abs((await p.evaluate(() => window.__tour.summary().total)) - total0) < 1e-3);
  const gas = await p.evaluate(() => window.__tour.state().hotel.energy[1]);
  assert.equal(gas.unit, 'kWh'); assert.ok(Math.abs(gas.total - 92000 * 10.639499728323601) < 0.01, String(gas.total));
  assert.match(await p.inputValue('#ea-e2'), /^978\.83[34],\d\d?$/);
  assert.match(await p.$eval('#row-e2 .c-price .unit', (e) => e.textContent), /TL\/kWh/);
  // aynı tür ikinci kez seçilemez
  assert.equal(await p.$eval('#et-e3 option[value="grid"]', (o) => o.disabled), true);
  // soğutulmuş su: Türkiye için faktör yok → hata, elle faktörle çözülür
  await p.selectOption('#add_type', 'chilled_water'); await settle(p);
  const cw = await p.evaluate(() => window.__tour.state().hotel.energy.at(-1).id);
  await p.keyboard.type('50000'); await settle(p);
  assert.equal(await text(p, '#eo-' + cw), 'faktör gerekli');
  assert.equal(await text(p, '#s_total'), '—', 'hatalı satır varken toplam gösterilmez');
  assert.ok(await p.locator('#msgs li.errors').count() >= 1);
  assert.equal(await p.isVisible('#ed-' + cw), true, 'ayrıntılar kendiliğinden açılır');
  await p.check(`#ed-${cw} input[value="manual"]`); await settle(p);
  await p.fill('#ef-' + cw, '0,1'); await settle(p);
  assert.equal(await text(p, '#eo-' + cw), '5 t');
  assert.notEqual(await text(p, '#s_total'), '—');
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('seçenekler: soğutucu gaz tahmini, araç yok, dış çamaşırhane, YEK-G, özel alan', async () => {
  const p = await open();
  await p.click('#h_notice [data-example="otel"]'); await settle(p);
  const t0 = await p.evaluate(() => window.__tour.result().totals.hcmiT);
  await p.check('input[name="refmode"][value="default1pct"]'); await settle(p);
  assert.equal(await p.isVisible('#ref_box'), false);
  const r1 = await p.evaluate(() => window.__tour.result());
  assert.ok(r1.totals.upliftT > 0); assert.ok(await p.isVisible('#d_uplift_row'));
  await p.check('input[name="refmode"][value="manual"]'); await settle(p);
  assert.ok(Math.abs((await p.evaluate(() => window.__tour.result().totals.hcmiT)) - t0) < 1e-9);
  // çamaşırhane: bilmiyorum → dolu odadan tahmin
  await p.check('input[name="lmethod"][value="estimate"]'); await settle(p);
  assert.equal(await p.isVisible('#laundry_tonnage'), false);
  assert.ok((await p.locator('#msgs li.info').allTextContents()).some((t) => /tahmin edildi/.test(t)));
  // çamaşırhaneyi kapat
  await p.uncheck('#l_out'); await settle(p);
  assert.equal(await p.isVisible('#laundry_box'), false);
  assert.equal(await p.evaluate(() => window.__tour.result().totals.laundryT), 0);
  // YEK-G belgesi
  await p.click('#add_market'); await p.fill('#mk-k-0', '500.000'); await settle(p);
  const r2 = await p.evaluate(() => window.__tour.result());
  assert.ok(r2.scopes.s2Market < r2.scopes.s2Location);
  assert.equal(await p.isVisible('#add_market'), true); await p.click('#add_market');
  assert.equal(await p.isVisible('#add_market'), false, 'en fazla iki belge');
  // özel alan oranı
  await p.click('#fold-private summary'); await p.check('#p_has'); await p.check('input[name="pmethod"][value="share"]');
  await p.fill('#p_pct', '10'); await settle(p);
  const r3 = await p.evaluate(() => window.__tour.result());
  assert.ok(r3.totals.hcmiT < r2.totals.hcmiT);
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('önlemler ve net sıfır: işaretleyince azaltım, sıralama ve patika güncellenir', async () => {
  const p = await open();
  await p.click('#h_notice [data-example="otel"]'); await settle(p);
  const saved0 = await text(p, '#m_saving');
  assert.equal(saved0, '243');
  await p.check('#m_keycard'); await settle(p);
  assert.notEqual(await text(p, '#m_saving'), saved0);
  assert.match(await p.$eval('#macc tbody', (e) => e.textContent), /Oda enerji otomasyonu \(seçili\)/);
  await p.uncheck('#m_led'); await p.uncheck('#m_pv'); await p.uncheck('#m_water'); await p.uncheck('#m_keycard'); await settle(p);
  assert.equal(await text(p, '#m_saving'), '0');
  assert.match(await text(p, '#nz_gap_sub'), /dengeleme gerekir/);
  await p.fill('#nz_done', '2028'); await settle(p);
  assert.equal(await p.evaluate(() => window.__tour.result().path.done), 2028);
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('acente sekmesi: eski sayfayla aynı toplam, segment katsayısı, dağıtım tablosu, klavye', async () => {
  const p = await open();
  await p.click('#tab-acente');
  assert.equal(await p.isVisible('#panel-acente'), true); assert.equal(await p.isVisible('#panel-otel'), false);
  await p.click('#a_notice [data-example="acente"]'); await settle(p);
  assert.equal(await p.evaluate(() => window.__tour.summary().total), 1128222);
  assert.equal(await text(p, '#ar_total'), '1.128');
  await p.selectOption('#a_seg', 's5'); await settle(p);
  assert.equal(await p.inputValue('#a_cpor'), '48,9');
  await p.fill('#a_cpor', '40'); await settle(p);
  assert.equal(await p.inputValue('#a_seg'), 'custom');
  await p.check('#opt_asplit'); await settle(p);
  assert.equal(await p.isDisabled('#a_gece'), true);
  assert.equal(await text(p, '#as_n'), '7.200');
  assert.equal(await text(p, '#as_w'), '39,5', '(2.400×48,9 + 3.600×37,9 + 1.200×25,4) / 7.200');
  // sekmeler klavyeyle
  await p.focus('#tab-acente'); await p.keyboard.press('ArrowLeft');
  assert.equal(await p.evaluate(() => document.activeElement.id), 'tab-otel');
  assert.equal(await p.isVisible('#panel-otel'), true);
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('tarayıcı belleği: kutu işaretliyse yeniden açılışta veriler gelir; eski sürüm kaydı aktarılır', async () => {
  const ctx = (await open()).context();
  const p = ctx.pages()[0];
  await p.click('#h_notice [data-example="otel"]'); await settle(p);
  await p.check('#opt_save'); await settle(p);
  await p.reload({ waitUntil: 'load' }); await p.waitForFunction(() => !!window.__tour); await settle(p);
  assert.equal(await text(p, '#s_total'), '1.060');
  assert.match(await text(p, '#h_notice'), /sakladığınız veriler yüklendi/);
  // geri dönen kullanıcı panelde açılır; bir adıma tıklayınca adımlara dönülür
  assert.equal(await p.isVisible('#panel-dash'), true);
  assert.equal(await p.isVisible('#adim5'), false);
  await p.click('.steps a[data-step="adim5"]'); await settle(p);
  assert.equal(await p.isVisible('#adim5'), true);
  await p.uncheck('#opt_save'); await settle(p);
  await p.reload({ waitUntil: 'load' }); await p.waitForFunction(() => !!window.__tour); await settle(p);
  assert.equal(await text(p, '#s_total'), '—');
  // eski sayfanın anahtarı (commited-hotel-v1) okunur ve yeni yönteme aktarılır
  await p.evaluate((m) => localStorage.setItem('commited-hotel-v1', JSON.stringify({ ...m, opt_save: true, h_fueloil: '500' })), node.TURIZM.model.LEGACY_EXAMPLE);
  await p.reload({ waitUntil: 'load' }); await p.waitForFunction(() => !!window.__tour); await settle(p);
  assert.match(await text(p, '#h_notice'), /Önceki sürümden yeni yönteme aktarıldı/);
  assert.match(await text(p, '#h_notice'), /Fuel oil 2/);
  assert.equal(await p.inputValue('#h_name'), 'Örnek Tatil Köyü');
  assert.equal(await p.locator('#ledger_rows .lrow').count(), 8);
  assert.equal(await p.isChecked('#opt_save'), true);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('üyelik: kayıt ol, kaydet (yeni şema), çıkış, giriş → son kayıt yüklenir; eski kayıt açılır', async () => {
  const p = await open();
  await p.click('#h_notice [data-example="otel"]'); await settle(p);
  await p.click('#outputs [data-cloud-save]');
  assert.equal(await p.isVisible('#authModal'), true);
  await p.fill('#r_name', 'Örnek Tatil Köyü'); await p.fill('#r_email', 'otel@example.com'); await p.fill('#r_pass', 'gizli123');
  await p.check('#r_kvkk'); await p.click('#authSubmit');
  await p.waitForFunction(() => Object.keys(window.__fbTest.db).some((k) => k.startsWith('reports/')));
  const rec = await p.evaluate(() => { const k = Object.keys(window.__fbTest.db).find((x) => x.startsWith('reports/')); return window.__fbTest.db[k]; });
  assert.equal(rec.type, 'hotel'); assert.equal(rec.company, 'Örnek Tatil Köyü'); assert.equal(rec.year, 2025);
  assert.equal(rec.total, Math.round(ex.totals.hcmiT * 1000)); assert.equal(rec.grade, 'B');
  assert.equal(rec.inputs.schema, 'commited.turizm.state/2'); assert.equal(rec.inputs.options, undefined, 'yerel tercih buluta gitmez');
  assert.equal(rec.hcmi.schema, 'commited.hotel.hcmi/2'); assert.equal(rec.appVersion, '6.2.0');
  assert.equal(rec.sector, 'Turizm — Otel (HCMI v2.0)');
  assert.ok(!JSON.stringify(rec).includes('gizli123'), 'şifre kayda girmez');
  // çıkış, formu temizle, giriş → son kayıt otomatik yüklenir
  await p.click('#acct [data-act="logout"]'); await settle(p);
  await p.click('#btn-reset'); await p.click('#btn-reset'); await settle(p);
  assert.equal(await p.evaluate(() => window.__tour.isEmpty()), true);
  await p.click('#acct [data-auth="login"]');
  await p.fill('#r_email', 'otel@example.com'); await p.fill('#r_pass', 'gizli123'); await p.click('#authSubmit');
  await p.waitForFunction(() => !window.__tour.isEmpty()); await settle(p);
  assert.equal(await text(p, '#s_total'), '1.060');
  assert.match(await text(p, '#h_notice'), /Kayıtlı verileriniz yüklendi/);
  // eski sürümle yapılmış bir kayıt "Kayıtlarım"dan açılır ve aktarılır
  await p.evaluate((m) => {
    const uid = window.__fbTest.current.uid;
    window.__fbTest.db['reports/' + uid + '/items/eski1'] = { type: 'hotel', company: 'Eski Kayıt Oteli', year: 2024, total: 1037970, cpor: 33.67,
      inputs: { ...m, h_name: 'Eski Kayıt Oteli', h_year: '2024' }, createdAt: { seconds: 1 } };
  }, node.TURIZM.model.LEGACY_EXAMPLE);
  await p.click('#acct [data-act="records"]');
  await p.waitForSelector('#recItems .rec');
  const items = await p.locator('#recItems .rec').allTextContents();
  assert.ok(items.some((t) => /Eski Kayıt Oteli/.test(t) && /önceki sürüm/.test(t)), items.join(' | '));
  await p.locator('#recItems .rec', { hasText: 'Eski Kayıt Oteli' }).click(); await settle(p);
  assert.equal(await p.inputValue('#h_name'), 'Eski Kayıt Oteli');
  assert.match(await text(p, '#h_notice'), /önceki sürümle yapılmıştı/);
  assert.match(await text(p, '#grid_info'), /0,469/, '2024 için en güncel yayımlanmış faktör (2023)');
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('çıktılar: beyan / özet / JSON panoya, PDF için yalnız beyan basılır', async () => {
  const p = await open();
  await p.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base.replace(/\/$/, '') });
  await p.click('#btn-decl');
  assert.match(await text(p, '#toast'), /Önce verilerinizi girin/);
  await p.click('#h_notice [data-example="otel"]'); await settle(p);
  await p.click('#btn-decl'); await p.waitForTimeout(150);
  const decl = await p.evaluate(() => navigator.clipboard.readText());
  assert.equal(decl, node.TURIZM.texts.declaration(node.TURIZM.model.exampleState(), ex));
  await p.click('#btn-json'); await p.waitForTimeout(150);
  const js = JSON.parse(await p.evaluate(() => navigator.clipboard.readText()));
  assert.equal(js.schema, 'commited.hotel.hcmi/2'); assert.equal(js.hcmi.footprintT, Math.round(ex.totals.hcmiT * 100) / 100);
  assert.match(await p.getAttribute('#btn-wa', 'href'), /^https:\/\/wa\.me\/\?text=Otel%20Karbon%20%C3%96zeti/);
  await p.evaluate(() => { window.__printed = []; window.print = () => window.__printed.push(document.body.className); });
  await p.click('#btn-print');
  assert.deepEqual(await p.evaluate(() => window.__printed), ['print-decl']);
  await p.emulateMedia({ media: 'print' });
  await p.evaluate(() => document.body.classList.add('print-decl'));
  assert.equal(await p.isVisible('#decl'), true); assert.equal(await p.isVisible('#adim1'), false); assert.equal(await p.isVisible('.hero'), false);
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('PDF raporu: eksik veride açılmaz; örnekte yeni sekmede 11 sayfa, yazdırma düğmesi, PDF 11 sayfa', async () => {
  const p = await open();
  const ctx = p.context();
  assert.equal(await p.getAttribute('#btn-report', 'aria-disabled'), 'true');
  assert.equal(await p.getAttribute('#btn-summary', 'aria-disabled'), 'true');
  await p.click('#btn-report', { force: true });                 // aria-disabled: düğme odaklanır ve tıklanır, nedenini söyler
  assert.match(await text(p, '#report_msg'), /tesis verilerini girin/);
  assert.equal(ctx.pages().length, 1, 'eksik veride yeni sekme açılmaz');
  await p.click('#h_notice [data-example="otel"]'); await settle(p);
  assert.equal(await p.getAttribute('#btn-report', 'aria-disabled'), 'false');
  const errs = [];
  ctx.on('page', (pg) => { pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error') { errs.push(m.text()); } }); });
  const [rp] = await Promise.all([ctx.waitForEvent('page'), p.click('#btn-report')]);
  await rp.waitForLoadState('load');
  assert.equal(await rp.locator('section.page').count(), 11);
  assert.equal(await rp.title(), 'Örnek Tatil Köyü - 2025 Sürdürülebilirlik Raporu');
  assert.equal(await rp.locator('h2', { hasText: 'Kaynaklar, tedarik ve çalışanlar' }).count(), 1);
  assert.match(await rp.textContent('.cv-num'), /^34,4/);
  assert.match(await rp.textContent('.cv-sample'), /Örnek rapor/);
  assert.equal(await rp.textContent('.cv-grade'), 'B');
  // "PDF olarak kaydet" yazdırma penceresini açar; araç çubuğu baskıda görünmez
  await rp.evaluate(() => { window.__p = 0; window.print = () => { window.__p++; }; });
  await rp.click('#tb-print');
  await rp.waitForFunction(() => window.__p === 1, null, { timeout: 5000 });   // yazı tipi en çok 3 sn beklenir
  await rp.emulateMedia({ media: 'print' });
  assert.equal(await rp.isVisible('#tb-print'), false);
  const pdf = await rp.pdf({ preferCSSPageSize: true, printBackground: true });
  assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length, 11, 'PDF sayfa sayısı');
  assert.match(await text(p, '#report_msg'), /yeni sekmede açıldı/);
  await p.fill('#h_name', 'Benim Otelim'); await settle(p);
  assert.match(await text(p, '#report_msg'), /düğmeye yeniden basın/, 'veri değişince açık rapor eskidi uyarısı');
  const [rp2] = await Promise.all([ctx.waitForEvent('page'), p.click('#btn-report')]);
  await rp2.waitForLoadState('load');
  assert.equal(await rp2.title(), 'Benim Otelim - 2025 Sürdürülebilirlik Raporu');
  assert.equal(await rp2.locator('.cv-sample').count(), 0, 'gerçek ad girilince örnek etiketi yok');
  assert.match(await text(p, '#report_msg'), /yeni sekmede açıldı/);
  assert.deepEqual(errs, []);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('tek sayfalık özet ve kapak logosu: logo yüklenir, rapora ve özete girer, kaldırılır', async () => {
  const p = await open();
  const ctx = p.context();
  await p.click('#h_notice [data-example="otel"]'); await settle(p);
  assert.equal(await p.isVisible('#logo_prev'), false);
  assert.equal(await text(p, '#logo_pick'), 'Kapak için logo ekle');
  // logo: gizli dosya alanına örnek (kurgusal) logo verilir; tarayıcıda küçültülüp PNG olur
  await p.setInputFiles('#logo_file', path.join(ROOT, 'tests/fixtures/ornek-logo.png'));
  await p.waitForFunction(() => /^data:image\/png;base64,/.test(window.__tour.state().hotel.logo || ''));
  await settle(p);
  assert.equal(await p.isVisible('#logo_prev'), true);
  assert.equal(await p.isVisible('#logo_remove'), true);
  assert.equal(await text(p, '#logo_pick'), 'Logoyu değiştir');
  assert.match(await text(p, '#report_msg'), /Logo eklendi/);
  const dims = await p.evaluate(() => new Promise((ok) => { const i = new Image(); i.onload = () => ok([i.width, i.height]); i.src = window.__tour.state().hotel.logo; }));
  assert.ok(dims[0] <= 600 && dims[1] <= 240, 'en çok 600 × 240: ' + dims);
  // boyutsuz (yalnız viewBox) kare SVG: oranı korunur ve baskı için kutuya kadar büyütülür
  const before = await p.evaluate(() => window.__tour.state().hotel.logo);
  await p.setInputFiles('#logo_file', { name: 'kare.svg', mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="#0B6FA0"/></svg>') });
  await p.waitForFunction((b) => { const l = window.__tour.state().hotel.logo; return l && l !== b; }, before);
  const sq = await p.evaluate(() => new Promise((ok) => { const i = new Image(); i.onload = () => ok([i.width, i.height]); i.src = window.__tour.state().hotel.logo; }));
  assert.deepEqual(sq, [240, 240], 'kare SVG 240 × 240 PNG olur');
  // desteklenmeyen dosya
  await p.setInputFiles('#logo_file', { name: 'logo.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
  assert.match(await text(p, '#report_msg'), /PNG, JPG, SVG ya da WebP/);
  // tam rapor: kapakta ve sayfa başlıklarında logo
  const [rp] = await Promise.all([ctx.waitForEvent('page'), p.click('#btn-report')]);
  await rp.waitForLoadState('load');
  assert.equal(await rp.locator('.cv-logo img').count(), 1);
  assert.equal(await rp.locator('.run-logo').count(), 10);
  assert.ok(await rp.evaluate(() => document.querySelector('.cv-logo img').naturalWidth > 0), 'logo görüntüsü çözülür');
  // tek sayfalık özet
  const [sp] = await Promise.all([ctx.waitForEvent('page'), p.click('#btn-summary')]);
  await sp.waitForLoadState('load');
  assert.equal(await sp.locator('section.page').count(), 1);
  assert.equal(await sp.title(), 'Örnek Tatil Köyü - 2025 Sürdürülebilirlik Özeti');
  assert.equal(await sp.locator('.op-logo img').count(), 1);
  assert.match(await sp.textContent('.tb'), /Özetiniz hazır/);
  const spdf = await sp.pdf({ preferCSSPageSize: true, printBackground: true });
  assert.equal((spdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length, 1, 'özet tek sayfa');
  assert.match(await text(p, '#report_msg'), /Özet yeni sekmede açıldı/);
  // logo kaldırılır
  await p.click('#logo_remove'); await settle(p);
  assert.equal(await p.evaluate(() => window.__tour.state().hotel.logo), null);
  assert.equal(await p.isVisible('#logo_prev'), false);
  assert.match(await text(p, '#report_msg'), /Logo kaldırıldı/);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('rapor göstergeleri: kimyasal, tedarik ve çalışan alanları kişi başı kutuları ve uyarıları günceller', async () => {
  const p = await open();
  await p.click('#h_notice [data-example="otel"]'); await settle(p);
  assert.equal(await text(p, '#r_local'), '%65');
  assert.equal(await text(p, '#r_pg_chem'), '0,33');
  assert.equal(await text(p, '#r_pg_water'), '402');
  await p.fill('#g_local', '48.000.000'); await settle(p);
  assert.equal(await text(p, '#r_local'), '%50');
  await p.fill('#g_local', '200.000.000'); await settle(p);
  assert.equal(await text(p, '#r_local'), '—');
  assert.match(await text(p, '#msgs'), /Yerel tedarikçilerden satın alma, toplam satın almadan büyük/);
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('panel: boşken davet; örnekle tek ekranda sonuçlar, önlem ekle / çıkar, grafik seçimi, tablo, adımlara dönüş', async () => {
  const p = await open();
  await p.click('.steps a[data-view="dash"]'); await settle(p);
  assert.equal(await p.isVisible('#panel-dash'), true);
  assert.equal(await p.isVisible('#adim1'), false, 'panelde adımlar gizli');
  assert.equal(await p.isVisible('.dash-empty'), true);
  await p.click('.dash-empty [data-example="otel"]'); await settle(p);
  // üst alan Node hesabıyla aynı (sayı açılışta sayarak gelir; ekran okuyucu metni hemen tam değer)
  const cpor = node.NUM.format(ex.metrics.cpor, 1);
  assert.equal(await text(p, '.dh-num .sr-only'), cpor + ' kg CO₂e satılan oda-gece başına');
  await p.waitForFunction((v) => document.querySelector('.dh-val').textContent === v, cpor);
  assert.equal(await text(p, '.dh-badge'), 'B');
  assert.match(await text(p, '.dh-delta'), /^2024'e göre %[\d,]+ daha az$/);
  assert.equal(await p.locator('.dh-chip').count(), 1, 'örnek etiketi');
  assert.equal(await p.locator('.dash-tiles .tile').count(), 6);
  assert.equal(await p.locator('[data-chart="trend"] g.colg').count(), 4, '3 örnek yıl + bu yıl');
  assert.equal(await p.locator('.mstones li').count(), 4);
  assert.ok(await p.locator('[data-chart="path"] svg').count());
  assert.match(await text(p, '#dc-next + .dc-sub'), /^3 önlem: yılda [\d.,]+ t azaltım/);
  // önlem ekle: durum, Adım 3 kutusu ve panel birlikte güncellenir
  await p.click('.nexts [data-dash-act="add"][data-id="bms"]'); await settle(p);
  assert.ok((await p.evaluate(() => window.__tour.state().hotel.measures)).includes('bms'));
  assert.equal(await p.isChecked('[data-measure="bms"]'), true);
  assert.match(await text(p, '#dc-next + .dc-sub'), /^4 önlem/);
  await p.click('.plansel [data-dash-act="remove"][data-id="bms"]'); await settle(p);
  assert.equal(await p.isChecked('[data-measure="bms"]'), false);
  assert.match(await text(p, '#dc-next + .dc-sub'), /^3 önlem/);
  // yıllar grafiğinde gösterge seçimi ve tablo
  await p.click('[data-dash-metric="cpor"]'); await settle(p);
  assert.equal(await p.getAttribute('[data-dash-metric="cpor"]', 'aria-pressed'), 'true');
  assert.match(await text(p, '#dc-trend + .dc-sub'), /^2022'den bu yana %\d+ azaldı/);
  await p.click('[data-dash-tbl="trend"]');
  assert.equal(await p.isVisible('#dtbl-trend'), true);
  assert.equal(await p.locator('#dtbl-trend tbody tr').count(), 4);
  // sütun ipucu klavyeyle de açılır
  await p.focus('[data-chart="trend"] g.colg >> nth=3');
  assert.match(await text(p, '[data-chart="trend"] .dtip'), /^2025.*34,4 kg CO₂e/);
  // bir adıma tıklanınca adımlara dönülür
  await p.click('.steps a[data-step="adim3"]'); await settle(p);
  assert.equal(await p.isVisible('#adim3'), true);
  assert.equal(await p.isVisible('#panel-dash'), false);
  assert.equal(await p.evaluate(() => window.__tour.view()), 'steps');
  // örnek bildirimindeki düğme paneli açar
  await p.click('#h_notice [data-view="dash"]'); await settle(p);
  assert.equal(await p.isVisible('#panel-dash'), true);
  // sayfada panel alanı yoksa (eski ya da yarım yüklenmiş HTML) panel açılmaz, adımlar gizlenmez
  await p.evaluate(() => { document.getElementById('panel-dash').remove(); window.__tour.setView('dash'); });
  assert.equal(await p.evaluate(() => window.__tour.view()), 'steps');
  assert.equal(await p.isVisible('#adim1'), true);
  assert.deepEqual(p.errors, []);
  await p.context().close();
  // telefonda yatay kaydırma yok
  const m = await open({ width: 390, height: 844 });
  await m.click('#h_notice [data-example="otel"]'); await settle(m);
  await m.click('.steps a[data-view="dash"]'); await settle(m);
  await noHScroll(m);
  assert.deepEqual(m.errors, []);
  await m.context().close();
});

test('panel: hesaba kaydedilen yıllar aynı yöntemle yan yana; çıkışta davet görünür', async () => {
  const p = await open();
  await p.click('#h_notice [data-example="otel"]'); await settle(p);
  await p.fill('#h_name', 'Deniz Otel'); await settle(p);
  const count = () => p.evaluate(() => Object.keys(window.__fbTest.db).filter((k) => k.startsWith('reports/')).length);
  await p.click('#outputs [data-cloud-save]');
  await p.fill('#r_name', 'Deniz Otel'); await p.fill('#r_email', 'deniz@example.com'); await p.fill('#r_pass', 'gizli123');
  await p.check('#r_kvkk'); await p.click('#authSubmit');
  await p.waitForFunction(() => Object.keys(window.__fbTest.db).some((k) => k.startsWith('reports/')));
  // önceki yıl: 2024, daha çok elektrik
  await p.fill('#h_year', '2024'); await p.fill('#ea-e1', '1.600.000'); await settle(p);
  await p.click('#outputs [data-cloud-save]');
  await p.waitForFunction(() => Object.keys(window.__fbTest.db).filter((k) => k.startsWith('reports/')).length === 2);
  assert.equal(await count(), 2);
  // ekranda yeniden 2025
  await p.fill('#h_year', '2025'); await p.fill('#ea-e1', '1.480.000'); await settle(p);
  await p.click('.steps a[data-view="dash"]'); await settle(p);
  assert.equal(await p.locator('.dh-chip').count(), 0, 'gerçek kayıtlarda örnek etiketi yok');
  assert.deepEqual(await p.locator('[data-chart="trend"] .dv-axis.cur').allTextContents(), ['2025']);
  assert.equal(await p.locator('[data-chart="trend"] g.colg').count(), 2);
  assert.match(await text(p, '.dh-delta'), /^2024'e göre %[\d,]+ daha az$/);
  // 2024 kaydı bugünkü yöntemle yeniden hesaplanır: Node'daki hesapla aynı
  const s24 = node.TURIZM.model.exampleState(); s24.hotel.name = 'Deniz Otel'; s24.hotel.year = 2024; s24.hotel.energy[0].total = 1600000;
  const t24 = node.NUM.format(node.TURIZM.compute(s24).totals.hcmiT, 1);
  assert.ok((await p.getAttribute('[data-chart="trend"] g.colg >> nth=0', 'aria-label')).startsWith('2024: ' + t24 + ' t CO₂e'));
  // çıkış: geçmiş temizlenir, üyelik daveti görünür
  await p.click('#acct [data-act="logout"]'); await settle(p);
  assert.equal(await p.locator('[data-chart="trend"]').count(), 0);
  assert.equal(await p.locator('.d-trend [data-auth="register"]').count(), 1);
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

for (const scheme of ['light', 'dark']) {
  test(`erişilebilirlik (${scheme}): boş, dolu, hatalı, acente`, async () => {
    const p = await open({ colorScheme: scheme });
    await axe(p, 'boş');
    await p.click('#h_notice [data-example="otel"]'); await settle(p);
    await p.click('[data-row-more="e1"]');
    await axe(p, 'dolu');
    await p.click('.steps a[data-view="dash"]'); await settle(p);
    await axe(p, 'panel');
    await p.click('[data-dash-tbl="path"]'); await settle(p);
    await axe(p, 'panel tablosu');
    await p.click('.steps a[data-step="adim1"]'); await settle(p);
    await p.fill('#h_roomnights', 'abc'); await p.selectOption('#add_type', 'chilled_water'); await p.keyboard.type('5'); await settle(p);
    await axe(p, 'hatalı');
    await p.click('#tab-acente'); await p.click('#a_notice [data-example="acente"]'); await settle(p);
    await axe(p, 'acente');
    await p.setViewportSize({ width: 390, height: 844 }); await settle(p);
    await noHScroll(p);
    assert.deepEqual(p.errors, []);
    await p.context().close();
  });
}
