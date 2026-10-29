// PDF sürdürülebilirlik raporu (assets/js/turizm/report.js): sayfa yapısı, sayıların hesapla aynı olması,
// eksik / uç verilerde raporun bozulmaması ve muhasebe tutarlılığı (defter satırları = HCMI toplamı).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from '../helpers/load-hcmi.mjs';

const ctx = loadApp();
const T = ctx.TURIZM, M = T.model, NUM = ctx.NUM;
const GEN = new Date('2026-10-21T09:00:00+03:00');
const f1 = (x) => NUM.format(x, 1, 1);
const fx1 = (x) => NUM.format(x, 1);
const pages = (html) => (html.match(/<section class="page/g) || []).length;
function run(mut) { const st = M.exampleState(); if (mut) { mut(st.hotel, st); } return { st, R: T.compute(st) }; }
function build(st, R, opts) { return T.report.build(st, R, Object.assign({ generatedAt: GEN }, opts || {})); }
function clean(html) { assert.doesNotMatch(html, /NaN|undefined|Infinity|\[object |null kg|null t\b/); }

test('örnek tesis: 11 sayfa, ana sayılar hesapla aynı, boş değer yok', () => {
  const { st, R } = run();
  const html = build(st, R);
  assert.equal(pages(html), 11);
  clean(html);
  for (const v of [R.totals.hcmiT, R.scopes.s1, R.scopes.s2Market, R.scopes.s3Laundry, R.path.baseT, R.path.planT, R.scenario.savedT, R.offsets.remainingT]) {
    assert.ok(html.includes(f1(v)), 'eksik: ' + f1(v));
  }
  assert.ok(html.includes('>' + NUM.format(R.metrics.cpor, 1) + '<'), 'kapakta oda-gece başına karbon');
  assert.ok(html.includes('Kıyas notu ' + R.bench.grade.letter));
  // içindekiler: 9 bölüm, sayfa numaraları 3'ten başlar ve artar; bölüm numaraları 1–9
  const toc = [...html.matchAll(/<span class="toc-p">(\d+)<\/span>/g)].map((m) => +m[1]);
  assert.deepEqual(toc, [3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.deepEqual([...html.matchAll(/<span class="chap-n">(\d+)<\/span>/g)].map((m) => +m[1]), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.match(html, /<title>Örnek Tatil Köyü - 2025 Sürdürülebilirlik Raporu<\/title>/);
  assert.doesNotMatch(html, /id="tb-print"/, 'araç çubuğu yalnız istenince');
  assert.doesNotMatch(html, /Örnek rapor: gerçek bir tesise/, 'örnek etiketi yalnız istenince');
});

test('araç çubuğu, örnek etiketi ve yazı tipi seçenekleri', () => {
  const { st, R } = run();
  const html = build(st, R, { toolbar: true, sample: true, fontCss: '@font-face{font-family:"DM Sans"}' });
  assert.match(html, /id="tb-print"/);
  assert.match(html, /window\.print\(\)/);
  assert.match(html, /@media print\{\.tb\{display:none!important\}/);
  assert.match(html, /Örnek rapor: gerçek bir tesise ait değildir/);
  assert.doesNotMatch(html, /fonts\.googleapis\.com/, 'fontCss verilince Google Fonts yüklenmez');
  assert.match(build(st, R), /fonts\.googleapis\.com\/css2\?family=DM\+Sans/);
});

test('canBuild: boş form, yıl yok, hesap tamam', () => {
  const empty = M.emptyState();
  const R0 = T.compute(empty);
  assert.equal(T.report.canBuild(empty, R0).ok, false);
  assert.throws(() => build(empty, R0));
  const { st, R } = run((h) => { h.year = null; });
  const c = T.report.canBuild(st, R);
  assert.equal(c.ok, false);
  assert.match(c.reason, /yıl/i);
  const ok = run();
  assert.deepEqual({ ...T.report.canBuild(ok.st, ok.R) }, { ok: true, reason: '' });
});

test('defter tutarlılığı: satırlar + soğutucu gaz + tahmini ek + çamaşırhane − YEK-G = HCMI toplamı', () => {
  const cases = [
    run(),
    run((h) => { h.market = [{ description: 'YEK-G', kwh: 400000 }]; }),
    run((h) => { h.refrigerants = { mode: 'default1pct', items: [] }; }),
    run((h) => { h.laundry.outsourced = false; })
  ];
  for (const { R } of cases) {
    assert.ok(R.usable);
    const rows = R.rows.reduce((a, r) => a + (r.t || 0), 0);
    const refr = (R.result.refrigerants || []).reduce((a, r) => a + r.tco2e, 0);
    const sum = rows + refr + R.scopes.uplift + R.scopes.s3Laundry - R.scopes.recCreditT;
    assert.ok(Math.abs(sum - R.totals.hcmiT) < 1e-6, sum + ' ≠ ' + R.totals.hcmiT);
  }
});

test('YEK-G ve bilinmeyen soğutucu gaz satırları rapora girer', () => {
  const a = run((h) => { h.market = [{ description: 'YEK-G', kwh: 400000 }]; });
  const ha = build(a.st, a.R); clean(ha);
  assert.match(ha, /YEK-G \/ I-REC belgeleri \(piyasa bazlı düşüm\)/);
  assert.ok(ha.includes('−' + f1(a.R.scopes.recCreditT)));
  const b = run((h) => { h.refrigerants = { mode: 'default1pct', items: [] }; });
  const hb = build(b.st, b.R); clean(hb);
  assert.match(hb, /HCMI tahmini ek: bilinmeyen soğutucu gaz/);
  assert.ok(hb.includes(f1(b.R.scopes.uplift)));
});

test('eksik ya da farklı veriler raporu bozmaz', () => {
  const variants = {
    'önlem yok': (h) => { h.measures = []; },
    'çamaşırhane yok': (h) => { h.laundry.outsourced = false; },
    'su ve atık yok': (h) => { h.extras = { waterM3: null, wasteLandfillT: null, wasteRecycledT: null }; },
    'toplantı alanı yok': (h) => { h.area.meeting = 0; h.event = { m2: null, hours: null, guests: null, nights: null }; },
    'etkinlik yok': (h) => { h.event = { m2: null, hours: null, guests: null, nights: null }; },
    'üçüncü taraf doğrulama': (h) => { h.verify = 'third'; },
    '4 yıldız segment': (h) => { h.segment = 's4'; },
    'tüm taksonomi': (h) => { M.TAXONOMY.forEach((t) => { h.taxonomy[t.id] = true; }); }
  };
  for (const [name, mut] of Object.entries(variants)) {
    const { st, R } = run(mut);
    if (!T.report.canBuild(st, R).ok) { continue; }               // hesap tamamlanmıyorsa rapor zaten açılmaz
    const html = build(st, R);
    clean(html);
    assert.ok(pages(html) >= 10, name);
  }
  const noM = run((h) => { h.measures = []; });
  assert.match(build(noM.st, noM.R), /Henüz önlem seçilmedi/);
  const noW = run((h) => { h.extras = { waterM3: null, wasteLandfillT: null, wasteRecycledT: null }; });
  const hw = build(noW.st, noW.R);
  assert.match(hw, /Kaynaklar, tedarik ve çalışanlar/, 'kimyasal, tedarik ve çalışan verisi varken bölüm kalır');
  assert.doesNotMatch(hw, /<div class="l">Su<\/div>|<td>Su<\/td>|Geri kazanılan atık/, 'girilmeyen su ve atık basılmaz');
  const allTx = run((h) => { M.TAXONOMY.forEach((t) => { h.taxonomy[t.id] = true; }); });
  assert.match(build(allTx.st, allTx.R), /tüm maddeler işaretli/);
});

test('uzun ad küçük başlıkla, kullanıcı metni HTML olarak çalışmaz', () => {
  const long = run((h) => { h.name = 'Çok Uzun Adlı Termal Sağlık ve Spor Oteli Kongre Merkezi Örnek'; });
  assert.match(build(long.st, long.R), /<h1 class="xl">Çok Uzun Adlı/);
  const evil = run((h) => { h.name = '<img src=x onerror=alert(1)>'; h.city = '"><script>alert(2)</script>'; });
  const html = build(evil.st, evil.R);
  assert.doesNotMatch(html, /<img src=x|<script>alert/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('çok sayıda enerji satırı: defter kendi sayfasına geçer, içindekiler kayar', () => {
  const st = M.exampleState();
  const extra = ['butane', 'propane', 'lng', 'cng', 'gasoline_stat', 'fuel_oil_1', 'fuel_oil_2', 'fuel_oil_4', 'fuel_oil_5', 'fuel_oil_6',
    'landfill_gas', 'biogas', 'used_oil', 'wood_waste', 'biomass', 'gasoline_bio', 'charcoal', 'kerosene', 'ethanol', 'steam'];
  for (const id of extra) {
    const r = M.addEnergyRow(st, id); if (!r) { continue; }
    r.total = 100;
    if (!T.compute(st).usable) { st.hotel.energy.pop(); }           // Türkiye için varsayılan faktörü olmayan türü bırak
  }
  assert.ok(st.hotel.energy.length >= 15, 'satır sayısı ' + st.hotel.energy.length);
  const R = T.compute(st);
  const html = build(st, R);
  clean(html);
  assert.ok(pages(html) >= 11, 'sayfa ' + pages(html));
  assert.match(html, /<h2>Enerji ve emisyon defteri<\/h2>/);
  const toc = [...html.matchAll(/<span class="toc-p">(\d+)<\/span>/g)].map((m) => +m[1]);
  assert.equal(toc[0], 3); assert.equal(toc[1], 4); assert.equal(toc[2], 6, 'kıyas bölümü bir sayfa kayar');
  assert.ok(toc.every((p, i) => i === 0 || p > toc[i - 1]));
  // grafik en çok 8 kaynak + "Diğer" gösterir
  assert.match(html, /Diğer \(\d+ kalem\)/);
});

test('kapak deseni tesise özgü ama tekrarlanabilir', () => {
  const a = T.report._isobaths('Otel A|Muğla|2025', 210, 297, 22, 2.6);
  const a2 = T.report._isobaths('Otel A|Muğla|2025', 210, 297, 22, 2.6);
  const b = T.report._isobaths('Otel B|Muğla|2025', 210, 297, 22, 2.6);
  assert.equal(JSON.stringify(a), JSON.stringify(a2));
  assert.notEqual(JSON.stringify(a), JSON.stringify(b));
  assert.ok(a.length >= 10);
});

// ------------------------------------------------------------------ karbon dışı göstergeler, logo, tek sayfalık özet
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('kaynaklar bölümü: kişi başı göstergeler, oranlar ve tablo hesapla aynı', () => {
  const { st, R } = run();
  const html = build(st, R), E = R.esg;
  assert.match(html, /<h2>Kaynaklar, tedarik ve çalışanlar<\/h2>/);
  for (const v of [fx1(E.perGuest.co2Kg), NUM.format(E.perGuest.waterM3 * 1000, 0), NUM.format(E.perGuest.chemKg, 2), NUM.format(E.perGuest.kwh, 1)]) {
    assert.ok(html.includes(v), 'eksik: ' + v);
  }
  assert.match(html, /aria-label="Yerel satın alma: %65"/);
  assert.match(html, /aria-label="Çevre eğitimi alan çalışan: %76"/);
  assert.match(html, /aria-label="Geri kazanılan atık: %25"/);
  assert.match(html, /96,0 milyon TL satın almanın 62,4 milyon TL kadarı/);
  // yönetici özetinde ikinci gösterge satırı
  assert.match(html, /Kişi başı karbon/); assert.match(html, /Yerel satın alma/);
});

test('kaynaklar bölümü: veri yoksa çıkar, bölüm numaraları ve içindekiler kayar', () => {
  const { st, R } = run((h) => { h.extras = { waterM3: null, wasteLandfillT: null, wasteRecycledT: null }; h.esg = M.emptyEsg(); h.guestNights = null; });
  const html = build(st, R);
  clean(html);
  assert.doesNotMatch(html, /Kaynaklar, tedarik ve çalışanlar/);
  assert.equal(pages(html), 10);
  assert.deepEqual([...html.matchAll(/<span class="chap-n">(\d+)<\/span>/g)].map((m) => +m[1]), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual([...html.matchAll(/<span class="toc-p">(\d+)<\/span>/g)].map((m) => +m[1]), [3, 4, 5, 6, 7, 8, 9, 10]);
  assert.doesNotMatch(html, /Kişi başı karbon/, 'misafir gecelemesi yoksa kişi başı satırı yok');
});

test('kaynaklar bölümü: misafir gecelemesi yoksa oda-gece başına gösterilir; tutarsız oran basılmaz', () => {
  const a = run((h) => { h.guestNights = null; });
  const ha = build(a.st, a.R); clean(ha);
  assert.match(ha, /Kaynak kullanımı, satılan oda-gece başına/);
  assert.doesNotMatch(ha, /Misafir gecelemesi başına<\/th>/);
  const b = run((h) => { h.esg.purchaseLocalTl = 200000000; });
  const hb = build(b.st, b.R); clean(hb);
  assert.doesNotMatch(hb, /Yerel satın alma: %/);
  assert.match(hb, /Yıllık toplam satın alma 96,0 milyon TL\./);
});

test('logo: kapakta, sayfa başlıklarında ve özette; geçersiz logo basılmaz', () => {
  const { st, R } = run((h) => { h.logo = PNG; });
  const html = build(st, R);
  assert.match(html, /<div class="cv-logo"><img src="data:image\/png;base64,/);
  assert.equal((html.match(/class="run-logo"/g) || []).length, pages(html) - 1, 'kapak dışındaki her sayfada');
  assert.match(html, /cOmmited Turizm Karbon Hesaplayıcısı ile hazırlandı/);
  assert.match(build(st, R, { variant: 'summary' }), /<div class="op-logo"><img src="data:image\/png;base64,/);
  const plain = build(run().st, run().R);
  assert.doesNotMatch(plain, /class="cv-logo"|class="run-logo"/);
  assert.match(plain, /<span class="wm">cOmmited<\/span>/);
  const bad = run((h) => { h.logo = 'javascript:alert(1)'; });       // normalize'dan geçmemiş durum bile basılmaz
  assert.doesNotMatch(build(bad.st, bad.R), /javascript:|class="cv-logo"/);
});

test('tek sayfalık özet: bir sayfa, ana sayılar, araç çubuğu ve ifade kuralı', () => {
  const { st, R } = run();
  const html = build(st, R, { variant: 'summary', toolbar: true, sample: true });
  clean(html);
  assert.equal(pages(html), 1);
  assert.match(html, /<title>Örnek Tatil Köyü - 2025 Sürdürülebilirlik Özeti<\/title>/);
  for (const v of [f1(R.totals.hcmiT), NUM.format(R.metrics.cpor, 1), fx1(R.esg.perGuest.co2Kg), '%65', '%76']) { assert.ok(html.includes(v), 'eksik: ' + v); }
  assert.match(html, /Özetiniz hazır\./);
  assert.match(html, /Örnek rapor: gerçek bir tesise ait değildir/);
  assert.doesNotMatch(html, /class="toc-p"/);
  assert.match(html, /Seçilen 3 önlem/);
});

test('AB 2024/825: raporda ve özette "karbon nötr" / "iklim nötr" yalnız tırnak içinde', () => {
  const { st, R } = run();
  for (const html of [build(st, R), build(st, R, { variant: 'summary' })]) {
    const low = html.toLocaleLowerCase('tr');
    for (const m of low.matchAll(/(.)(karbon nötr|iklim nötr|iklim dostu|yeşil otel)/g)) {
      assert.equal(m[1], '"', 'tırnaksız: ' + low.slice(Math.max(0, m.index - 40), m.index + 30));
    }
  }
});
