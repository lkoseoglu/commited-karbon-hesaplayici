// İngilizce (v6.4): ?lang=en ve "English" düğmesi. Gerçek Chromium, Firebase saplamalı.
// 1) Kapsam: birçok veri durumunda (segmentler, önlemsiz/tüm önlemler, doğrulama durumları, yıl yok,
//    toplantı alanı yok, yurt dışı, kendi referansı, eksik veri) ekranda, panelde, PDF raporunda, özette ve
//    panoya kopyalanan metinlerde Türkçe metin kalmamalı. Kalan varsa test hangi metin olduğunu yazar:
//    çevirisini assets/js/turizm/i18n-en.js'e ekleyin.
// 2) Canlı geçiş: Türkçe ⇄ İngilizce; sayılar yeni yazımla, alanlar korunur, Türkçe metin geri gelir.
// 3) İngilizce sayı girişi (1,480,000 · 12.5) ve erişilebilirlik (axe, açık/koyu).
import test from 'node:test';
import assert from 'node:assert/strict';
import { AxeBuilder } from '@axe-core/playwright';
import { serve, launch, newPage } from './helpers.mjs';

const PAGE = 'turizm-karbon-hesaplayici.html';
const { srv, base } = await serve();
const browser = await launch();
test.after(async () => { await browser.close(); srv.close(); });

const MEMBER = { uid: 'u_en', email: 'en@otel.test', emailVerified: true };
async function open({ lang = 'en', guest = false, ...vp } = {}) {
  const p = await newPage(browser, { width: 1280, height: 900, ...vp });
  if (!guest) {
    await p.addInitScript((m) => {
      window.__fbTest = { users: { [m.email]: 'gizli123' }, current: m, listeners: [], calls: [],
        db: { ['firms/' + m.uid]: { name: 'Deniz Otel', type: 'otel', city: 'Muğla', email: m.email, source: 'turizm-karbon-hesaplayici' } } };
    }, MEMBER);
  }
  await p.addInitScript((l) => { try { localStorage.setItem('turizm.lang', l); } catch (e) { /* yok */ } }, lang);
  await p.goto(base + PAGE + '?lang=' + lang, { waitUntil: 'load' });
  await p.waitForFunction(() => !!window.__tour && window.__tour.account() !== 'none');
  return p;
}
const settle = (p) => p.waitForTimeout(250);

// Türkçe harf içeren metinler (özel adlar hariç). Tarayıcıda çalışır.
function turkishLeft(scope) {
  const PROPER = /Türkiye|Muğla|Danışmanlık A\.Ş\.|TÜRSAB|EVÇED|Deniz Otel/g;
  const TR = /[çğıöşüÇĞİÖŞÜ]/;
  const I = window.TURIZM.i18n, T = window.TURIZM, out = new Set();
  const bad = (s) => TR.test(String(s).replace(PROPER, ''));
  const walk = (root) => {
    const w = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) {
        let e = n.parentNode, skip = false;
        for (; e && e.nodeType === 1; e = e.parentNode) { if (/^(SCRIPT|STYLE|NOSCRIPT)$/.test(e.tagName) || e.getAttribute('translate') === 'no') { skip = true; break; } }
        if (!skip && bad(n.nodeValue)) out.add(n.nodeValue.trim().slice(0, 140));
      } else {
        for (const a of ['placeholder', 'title', 'aria-label', 'alt']) { const v = n.getAttribute(a); if (v && bad(v)) out.add('[' + a + '] ' + v.slice(0, 140)); }
      }
    }
  };
  if (scope === 'report') {
    // PDF raporu ve özet (rapor penceresinde olduğu gibi: HTML → çeviri) + panoya kopyalanan metinler
    const s = window.__tour.state(), R = window.__tour.result();
    if (T.report.canBuild(s, R).ok) {
      for (const variant of ['report', 'summary']) {
        const d = new DOMParser().parseFromString(T.report.build(s, R, { toolbar: true, variant, sample: T.model.isSampleName(s.hotel.name) }), 'text/html');
        I.apply(d); walk(d.documentElement);
        if (bad(d.title)) out.add('[title] ' + d.title);
      }
    }
    let txt = '';
    if (R && R.usable) txt += T.texts.declaration(s, R) + '\n' + T.texts.executive(s, R) + '\n';
    txt += T.texts.agencySummary(s, T.agency.compute(s.agency));
    I.tLines(txt).split('\n').forEach((l) => { if (bad(l)) out.add('[pano] ' + l.trim().slice(0, 140)); });
  } else {
    document.querySelectorAll('details').forEach((d) => { d.open = true; });
    walk(document.querySelector(scope || 'main'));
  }
  I.missing().forEach((k) => { if (bad(k)) out.add('[sözlükte yok] ' + k.slice(0, 140)); });
  return [...out];
}

// Örnek üzerine kurulan veri durumları (collect → değiştir → apply). "hist": hesapta önceki iki yılın kaydı var.
const ALL_MEASURES = ['led', 'keycard', 'bms', 'hr', 'pv', 'hp', 'st', 'green', 'ev', 'water', 'linen', 'waste', 'refrig'];
const SCENARIOS = {
  'örnek': () => {},
  'lüks': (c) => { c.hotel.segment = 'lux'; },
  '5 yıldız': (c) => { c.hotel.segment = 's5'; },
  '4 yıldız, önlemsiz': (c) => { c.hotel.segment = 's4'; c.hotel.measures = []; },
  '3 yıldız, tüm önlemler': (c) => { c.hotel.segment = 's3'; c.hotel.measures = ALL_MEASURES; },
  'apart, iç inceleme': (c) => { c.hotel.segment = 'limited'; c.hotel.verify = 'internal'; },
  'bağımsız doğrulama, geç plan': (c) => { c.hotel.verify = 'third'; c.hotel.netZero = { start: 2031, done: 2040 }; },
  'yıl yok, toplantı yok, göstergeler yok': (c) => { c.hotel.year = null; c.hotel.area.meeting = null; c.hotel.esg = {}; },
  'yurt dışı (Almanya)': (c) => { c.hotel.country = 'Germany'; c.hotel.region = null; },
  'kendi referansı': (c) => { c.hotel.benchRef = 30; },
  'kendi referansı yüksek, lüks': (c) => { c.hotel.benchRef = 90; c.hotel.segment = 'lux'; },
  'tahminler': (c) => { c.hotel.refrigerants = { mode: 'estimate', items: [] }; c.hotel.mobileFuels = 'estimate'; c.hotel.laundry = { outsourced: true, method: 'estimate', tonnageKg: null, items: [] }; },
  'özel alan': (c) => { c.hotel.privateSpace = { has: true, method: 'share', sharePct: 12 }; },
  'taksonomi dolu': (c) => { c.hotel.taxonomy = { t_sert: true, t_bina: true, t_sifir: true, t_su: true, t_izleme: true, t_koruma: true }; },
  'taksonomi yarım': (c) => { c.hotel.taxonomy = { t_sert: true, t_su: true }; },
  'etkinlik yok': (c) => { c.hotel.event = { m2: null, hours: null, guests: null, nights: null }; },
  'eksik veri': (c) => { c.hotel.occupiedRooms = null; c.hotel.energy = c.hotel.energy.slice(0, 1); },
  'gerçek ad, geçmiş yıllar': (c) => { c.hotel.name = 'Deniz Otel'; c.hist = true; },
  'gerçek ad, geçmiş yok': (c) => { c.hotel.name = 'Deniz Otel'; },
  'acente bölmesiz, lüks': (c) => { c.agency.split = false; c.agency.seg = 'lux'; },
  'acente tur yok, uzun uçuş': (c) => { c.agency.paket = null; c.agency.uzundis = 900000; c.agency.split = false; c.agency.seg = 'limited'; },
  'acente üç satır': (c) => { c.agency.split = true; Object.keys(c.agency.splitRows).forEach((k, i) => { c.agency.splitRows[k].n = i < 3 ? 1000 * (i + 1) : null; }); },
  'acente konaklamasız': (c) => { c.agency.split = false; c.agency.gece = null; }
};

test('İngilizce kapsam: veri durumlarında ekranda, panelde, raporda ve kopyalanan metinde Türkçe kalmıyor', async () => {
  const p = await open();
  const left = {};
  const note = (where, list) => { if (list.length) left[where] = list; };
  note('boş', await p.evaluate(turkishLeft, 'main'));
  await p.click('#h_notice [data-example="otel"]'); await settle(p);
  await p.click('#tab-acente'); await p.click('#a_notice [data-example="acente"]'); await settle(p);
  note('acente', await p.evaluate(turkishLeft, 'main'));
  await p.click('#tab-otel'); await settle(p);
  const base0 = await p.evaluate(() => window.__tour.collect());
  for (const [name, mut] of Object.entries(SCENARIOS)) {
    const c = JSON.parse(JSON.stringify(base0)); mut(c);
    const hist = !!c.hist; delete c.hist;
    await p.evaluate(([x, withHist]) => {
      window.__tour.apply(x);
      const past = (dy, k) => {
        const s = JSON.parse(JSON.stringify(x)); s.hotel.year = x.hotel.year + dy; s.hotel.measures = [];
        s.hotel.energy.forEach((r) => { if (r.total) { r.total = Math.round(r.total * k); } });
        return { id: 'r' + dy, year: s.hotel.year, company: s.hotel.name, createdAt: Date.now() + dy, inputs: s };
      };
      window.__tour.setHistory(withHist ? [past(-2, 1.15), past(-1, 1.07)] : []);
      window.__tour.setView('steps');
    }, [c, hist]);
    await settle(p);
    note(name + ' · adımlar', await p.evaluate(turkishLeft, 'main'));
    await p.evaluate(() => window.__tour.setView('dash')); await settle(p);
    note(name + ' · panel', await p.evaluate(turkishLeft, '#panel-dash'));
    note(name + ' · rapor/pano', await p.evaluate(turkishLeft, 'report'));
  }
  assert.deepEqual(left, {}, 'İngilizcede Türkçe kalan metinler (i18n-en.js\'e ekleyin):\n' + JSON.stringify(left, null, 1));
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('canlı geçiş: Türkçe → English → Türkçe; sayılar ve metin dile göre, veriler korunur', async () => {
  const p = await open({ lang: 'tr' });
  await p.click('#h_notice [data-example="otel"]'); await settle(p);
  assert.equal(await p.textContent('#s_total'), '1.060');
  assert.equal(await p.inputValue('#h_roomnights'), '26.280');
  await p.click('.lang-sw [data-lang="en"]'); await settle(p);
  assert.equal(await p.getAttribute('html', 'lang'), 'en');
  assert.equal(await p.getAttribute('.lang-sw [data-lang="en"]', 'aria-pressed'), 'true');
  assert.match(p.url(), /[?&]lang=en/);
  assert.equal(await p.textContent('#s_total'), '1,060');
  assert.equal(await p.inputValue('#h_roomnights'), '26,280');
  assert.equal(await p.inputValue('#h_name'), 'Sample Resort');            // örnek adı da dile uyar
  assert.match(await p.textContent('#h_notice'), /^Sample data loaded/);
  assert.equal(await p.textContent('.steps a[data-step="adim3"]'), '3Reduce');
  // İngilizce yazımla giriş
  await p.fill('#h_roomnights', '27,500'); await p.press('#h_roomnights', 'Tab'); await settle(p);
  assert.equal(await p.evaluate(() => window.__tour.state().hotel.occupiedRooms), 27500);
  await p.fill('#h_area_meeting', '900.5'); await p.press('#h_area_meeting', 'Tab'); await settle(p);
  assert.equal(await p.evaluate(() => window.__tour.state().hotel.area.meeting), 900.5);
  // Türkçeye dönüş
  await p.click('.lang-sw [data-lang="tr"]'); await settle(p);
  assert.equal(await p.getAttribute('html', 'lang'), 'tr');
  assert.doesNotMatch(p.url(), /lang=en/);
  assert.equal(await p.inputValue('#h_roomnights'), '27.500');
  assert.equal(await p.inputValue('#h_name'), 'Örnek Tatil Köyü');
  assert.match(await p.textContent('#h_notice'), /^Örnek veriler yüklendi/);
  assert.equal(await p.textContent('.steps a[data-step="adim3"]'), '3Azalt');
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('İngilizce: ziyaretçi bildirimi, kayıt penceresi ve PDF raporu sekmesi İngilizce', async () => {
  const p = await open({ guest: true });
  assert.match(await p.textContent('#h_notice'), /^Sign up or log in to enter your data\./);
  assert.equal(await p.textContent('#h_notice .notice-acts .btn.shine'), 'Fill in with a 120-room sample resort');
  await p.click('#h_name'); await p.waitForSelector('#authModal:not([hidden])');
  assert.match(await p.textContent('#authNote'), /^Sign up free or log in to enter your data/);
  assert.equal(await p.textContent('#authTitle'), 'Register your property for free');
  await p.keyboard.press('Escape');
  await p.click('#h_notice [data-example="otel"]'); await settle(p);
  assert.equal(await p.inputValue('#h_name'), 'Sample Resort');
  const [rp] = await Promise.all([p.context().waitForEvent('page'), p.click('#btn-report')]);
  await rp.waitForLoadState('load');
  assert.equal(await rp.getAttribute('html', 'lang'), 'en');
  assert.equal(await rp.title(), 'Sample Resort - 2025 Sustainability Report');
  assert.match(await rp.textContent('.tb'), /Your report is ready\./);
  await rp.close();
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

// Rapor ve tek sayfalık özet: hiçbir sayfada içerik alt bilgiye ya da son sayfadaki banda taşmaz
// (çok önlem, tahmin notları ve daha uzun İngilizce metinde sayfa kendini sığdırır: .fit1–.fit3).
test('rapor ve özet sayfaları A4\'e sığar: Türkçe ve İngilizce, tüm önlemler ve tahminler', async () => {
  const overflow = () => [...document.querySelectorAll('.page')].map((pg, i) => {
    const b = pg.querySelector('.op-body') || pg.querySelector('.body'); if (!b) { return null; }
    let m = 0; b.querySelectorAll('*').forEach((e) => { const r = e.getBoundingClientRect(); if (r.height > 0 && r.bottom > m) { m = r.bottom; } });
    const lim = (pg.querySelector('.back') || pg.querySelector('.foot')).getBoundingClientRect().top;
    return m > lim + 1 ? (i + 1) + '. sayfa ' + Math.round(m - lim) + ' px' : null;
  }).filter(Boolean);
  for (const lang of ['tr', 'en']) {
    const p = await open({ lang });
    await p.click('#h_notice [data-example="otel"]'); await settle(p);
    const c = await p.evaluate(() => window.__tour.collect());
    c.hotel.measures = ALL_MEASURES; c.hotel.segment = 'limited'; c.hotel.name = 'Deniz Kenarı Butik Otel ve Spa Merkezi';
    c.hotel.refrigerants = { mode: 'estimate', items: [] }; c.hotel.mobileFuels = 'estimate';
    c.hotel.laundry = { outsourced: true, method: 'estimate', tonnageKg: null, items: [] };
    await p.evaluate((x) => { window.__tour.apply(x); window.__tour.setView('steps'); }, c); await settle(p);
    for (const btn of ['#btn-report', '#btn-summary']) {
      const [rp] = await Promise.all([p.context().waitForEvent('page'), p.click(btn)]);
      await rp.waitForLoadState('load'); await rp.waitForTimeout(300);
      assert.deepEqual(await rp.evaluate(overflow), [], lang + ' ' + btn + ': taşan sayfa');
      await rp.close();
    }
    assert.deepEqual(p.errors, []);
    await p.context().close();
  }
});

for (const scheme of ['light', 'dark']) {
  test(`İngilizce erişilebilirlik (${scheme}): adımlar, panel, pencere`, async () => {
    const p = await open({ colorScheme: scheme });
    await p.click('#h_notice [data-example="otel"]'); await settle(p);
    const check = async (label) => {
      await p.waitForFunction(() => { const t = document.getElementById('toast'); return !t || (!t.classList.contains('show') && getComputedStyle(t).opacity === '0'); }, null, { timeout: 5000 });
      const r = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const out = r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
      assert.deepEqual(out, [], label + ' ihlalleri:\n' + out.join('\n'));
    };
    await check('adımlar');
    await p.evaluate(() => window.__tour.setView('dash')); await settle(p);
    await check('panel');
    await p.context().close();
  });
}
