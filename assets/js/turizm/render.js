/* =========================================================================
   Turizm hesaplayıcısı — SONUÇ EKRANLARI  (assets/js/turizm/render.js)
   -------------------------------------------------------------------------
   all(state, R, A): compute() ve agency.compute() sonuçlarını sayfaya yazar.
   Hesap YAPMAZ; yalnız gösterir. Tüm metin textContent ile yazılır.
   Dışa: globalThis.TURIZM.render
   ========================================================================= */
(function (root) {
  'use strict';

  // Paylaşılan düz metin seçili dilde (i18n.js; yoksa olduğu gibi)
  function lines(x) { var I = root.TURIZM && root.TURIZM.i18n; return I ? I.tLines(x) : x; }

  var NS = root.TURIZM = root.TURIZM || {};
  var U, M, F;
  var SCOPE_TR = { 1: 'Kapsam 1', 2: 'Kapsam 2', 3: 'Kapsam 3' };

  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function T(id, txt) { U.setText(id, txt); }
  function grade(elId, g) {
    var e = U.el(elId); if (!e) { return; }
    e.setAttribute('data-grade', g && g.letter && g.letter !== '—' ? g.letter : '');
  }

  // ------------------------------------------------------------------ özet şeridi
  function summary(s, R) {
    var on = R.started && R.usable, fm = U.fmt;
    T('s_total', on ? fm.t(R.totals.hcmiT) : '—');
    T('s_cpor', on ? fm.n(R.metrics.cpor, 1) : '—');
    T('s_meet', on ? fm.n(R.metrics.meetH, 4) : '—');
    T('s_grade', on ? R.bench.grade.letter : '—');
    grade('s_grade', on ? R.bench.grade : null);
    var st = U.el('st_adim1');
    if (st) {
      var nErr = R.messages.errors.length, nWarn = R.messages.warnings.length;
      st.className = 'st' + (nErr ? ' bad' : (nWarn ? ' warn' : (R.completeness.score >= 100 ? ' ok' : '')));
      st.textContent = nErr ? String(nErr) : (nWarn ? String(nWarn) : (R.completeness.score >= 100 ? '✓' : ''));
    }
  }

  // ------------------------------------------------------------------ adım 1
  function gridInfo(s, R) {
    var host = U.el('grid_info'); if (!host) { return; }
    U.clear(host);
    var g = R.grid, fm = U.fmt;
    var conn = U.el('h_conn'), connField = conn ? conn.closest('.f') : null;
    if (connField) { connField.hidden = g.origin !== 'tr'; }
    if (g.origin === 'tr') {
      host.appendChild(U.h('b', { text: 'Şebeke elektriği: ' + fm.n(g.value, 3) + ' kgCO₂e/kWh' }));
      host.appendChild(document.createTextNode(' — T.C. Enerji ve Tabii Kaynaklar Bakanlığı, ' + g.basisYear + ' tüketim noktası faktörü (' +
        (g.connection === 'transmission' ? 'iletim' : 'dağıtım') + ' hattı). '));
      if (g.source && g.source.url) { host.appendChild(U.h('a', { href: g.source.url, target: '_blank', rel: 'noopener', text: 'Kaynak belge' })); }
      if (g.message) { host.appendChild(U.h('span', { class: 'gi-note', text: ' ' + g.message })); }
    } else if (isNum(g.value)) {
      host.appendChild(U.h('b', { text: 'Şebeke elektriği: ' + fm.n(g.value, 3) + ' kgCO₂e/kWh' }));
      host.appendChild(document.createTextNode(' — HCMI v2.0 ülke tablosu (' + (root.TR_REFERENCE ? root.TR_REFERENCE.countryLabel(s.hotel.country) : s.hotel.country) + ').'));
    } else {
      host.appendChild(U.h('span', { class: 'gi-note', text: g.message || '' }));
    }
  }

  function areaNote(s, R) {
    var n = U.el('area_note'); if (!n) { return; }
    var warn = R.messages.warnings.some(function (m) { return m.code === 'areaExceeds'; });
    n.classList.toggle('bad', warn);
    if (warn) { n.textContent = 'Oda + toplantı alanı toplam alanı aşıyor. Toplam alan oda ve toplantı alanlarını da içermelidir — ortak alanlar aradaki farktır.'; return; }
    if (isNum(R.metrics.shareRooms)) {
      n.textContent = 'Ortak alanlar (lobi, restoran, mutfak, arka ofis) HCMI\'ye göre oda ve toplantı alanı oranında paylaştırılır. Bu tesiste oda payı '
        + U.fmt.pct01(R.metrics.shareRooms) + ', toplantı payı ' + U.fmt.pct01(R.metrics.shareMeet) + '.';
    } else {
      n.textContent = 'Ortak alanlar (lobi, restoran, mutfak, arka ofis) HCMI\'ye göre oda ve toplantı alanı oranında paylaştırılır.';
    }
  }

  function efLabel(s, R, r) {
    var H = root.HCMI, t = H.data.energyTypes.filter(function (x) { return x.id === r.typeId; })[0];
    if (!t) { return '—'; }
    var d = H.defaultEf(s.hotel.country, s.hotel.region, t.name, R.options.efOverrides || []);
    if (d.value === null) { return 'Bu ülke için yok — kendi faktörünüzü girin'; }
    var src = d.source === 'override' ? 'ETKB ' + R.grid.basisYear : 'HCMI v2.0';
    var perUnit = t.kwhPerUnit[r.unit] ? ' · ' + U.fmt.n(d.value * t.kwhPerUnit[r.unit], 3) + ' kg/' + M.unitShort(r.unit) : '';
    return src + ': ' + U.fmt.n(d.value, 4) + ' kgCO₂e/kWh' + (r.unit !== 'kWh' ? perUnit : '');
  }

  function ledger(s, R) {
    var total = R.usable ? R.totals.hcmiT : null, sumT = 0, sumKwh = 0, fm = U.fmt;
    var lg = U.el('ledger');
    if (lg) { lg.classList.toggle('show-private', !!s.hotel.privateSpace.has && s.hotel.privateSpace.method === 'actual'); }
    s.hotel.energy.forEach(function (r, i) {
      var res = R.rows[i], id = r.id;
      var out = U.el('eo-' + id), bar = U.el('ew-' + id), row = U.el('row-' + id), msg = U.el('em-' + id);
      if (!out) { return; }
      var txt = '—', w = 0;
      if (res) {
        if (res.t === null) { txt = 'faktör gerekli'; }
        else { txt = fm.t(res.t) + ' t'; sumT += res.t; sumKwh += res.kwh; w = isNum(total) && total > 0 ? res.t / total * 100 : 0; }
      }
      out.textContent = txt;
      out.classList.toggle('bad', !!res && res.t === null);
      if (bar) { bar.style.width = Math.min(Math.max(w, 0), 100).toFixed(1) + '%'; }
      var efd = U.el('efd-' + id); if (efd) { efd.textContent = efLabel(s, R, r); }
      var man = row && row.querySelector('.ef-manual'); if (man) { man.hidden = r.efMode !== 'manual'; }
      var rowMsgs = R.messages.errors.concat(R.messages.warnings).filter(function (m) { return m.row === i; });
      if (msg) { msg.hidden = !rowMsgs.length; msg.textContent = rowMsgs.map(function (m) { return m.message; }).join(' '); }
      if (row) { row.classList.toggle('has-err', R.messages.errors.some(function (m) { return m.row === i; })); }
      // hata varsa ayrıntılar açılsın (elle faktör girilecek yer)
      if (rowMsgs.some(function (m) { return m.code === 'noDefaultEf' || m.code === 'manualEf' || m.code === 'privateTooLarge'; })) {
        var panel = U.el('ed-' + id), btn = row && row.querySelector('[data-row-more]');
        if (panel && panel.hidden) { panel.hidden = false; if (btn) { btn.setAttribute('aria-expanded', 'true'); } }
      }
    });
    var foot = U.el('ledger_foot');
    if (foot) {
      foot.textContent = sumKwh > 0
        ? 'Toplam: ' + fm.n(sumKwh, 0) + ' kWh enerji · ' + fm.t(sumT) + ' tCO₂e'
          + (R.scopes && R.scopes.recCreditT > 0 ? ' (YEK-G mahsubu öncesi)' : '') + ' — dış çamaşırhane ve soğutucu gaz hariç'
        : '';
    }
  }

  function visibility(s) {
    var h = s.hotel;
    U.show('ref_box', h.refrigerants.mode === 'manual');
    U.show('laundry_box', !!h.laundry.outsourced);
    U.show('laundry_tonnage', h.laundry.method === 'tonnage');
    U.show('laundry_share', h.laundry.method === 'share');
    U.show('private_box', !!h.privateSpace.has);
    U.show('private_share', h.privateSpace.method === 'share');
    var fp = U.el('fold-private'); if (fp && h.privateSpace.has) { fp.open = true; }
    var fc = U.el('fold-country'); if (fc && h.country !== 'Turkey') { fc.open = true; }
  }

  var LEVEL_TR = { errors: 'Hata', warnings: 'Uyarı', info: 'Bilgi' };
  function check(s, R) {
    var c = R.completeness;
    T('r_complete', String(c.score));
    var bar = U.el('r_completebar'); if (bar) { bar.style.width = Math.max(c.score, 3) + '%'; }
    var note;
    if (!R.started) { note = 'Verilerinizi girdikçe eksikler burada listelenir.'; }
    else if (c.missing.length) {
      var names = c.missing.map(function (m) { return m.name; });
      note = 'Eksik: ' + names.slice(0, 4).join(', ') + (names.length > 4 ? ' ve ' + (names.length - 4) + ' alan daha' : '') + '.';
    } else { note = 'Tüm temel alanlar dolu. 12 aylık veri kullandıysanız metrikler kurumsal müşteriye verilebilir.'; }
    T('r_completenote', note);
    var ul = U.el('msgs'); if (!ul) { return; }
    U.clear(ul);
    // Formda okunamayan değerler (hesaba boş girdi) — motor bunları "girilmedi" sanır; kullanıcıya asıl nedeni söyle
    Array.prototype.forEach.call(document.querySelectorAll('#panel-otel input[aria-invalid="true"]'), function (inp) {
      var lab = document.querySelector('label[for="' + inp.id + '"]');
      var name = lab ? lab.textContent.trim() : (inp.getAttribute('aria-label') || 'Bir alan');
      ul.appendChild(U.h('li', { class: 'msg errors' }, [
        U.h('span', { class: 'lvl', text: 'Hata' }),
        U.h('span', { class: 'txt', text: '"' + name + '" alanındaki "' + inp.value + '" okunamadı; hesaba boş girdi. Yalnız sayı yazın (örn. 1.480.000 ya da 12,5).' }),
        U.h('button', { type: 'button', class: 'linkbtn goto', 'data-goto-id': inp.id, text: 'Alana git' })
      ]));
    });
    ['errors', 'warnings', 'info'].forEach(function (lvl) {
      R.messages[lvl].forEach(function (m) {
        var kids = [U.h('span', { class: 'lvl', text: LEVEL_TR[lvl] }), U.h('span', { class: 'txt', text: m.message })];
        if (m.path) { kids.push(U.h('button', { type: 'button', class: 'linkbtn goto', 'data-goto': m.path, text: 'Alana git' })); }
        ul.appendChild(U.h('li', { class: 'msg ' + lvl }, kids));
      });
    });
    if (R.started && !ul.children.length) { ul.appendChild(U.h('li', { class: 'msg ok' }, [U.h('span', { class: 'lvl', text: 'Tamam' }), U.h('span', { class: 'txt', text: 'Hesabı engelleyen bir sorun yok.' })])); }
  }

  // ------------------------------------------------------------------ adım 2
  function step2(s, R) {
    var on = R.started && R.usable, fm = U.fmt, m = R.metrics, seg = R.bench.segment;
    T('r_hcmi', on ? fm.t(R.totals.hcmiT) : '—');
    T('r_hcmi_sub', R.started && !R.usable ? 'Hesap tamamlanamadı — Adım 1\'deki veri kontrolüne bakın'
      : 'Kapsam 1 + Kapsam 2 (piyasa bazlı) + dış çamaşırhane' + (on && R.totals.upliftT > 1e-9 ? ' + HCMI tahmini ek ' + fm.t(R.totals.upliftT) + ' t' : ''));
    T('r_cpor', on ? fm.n(m.cpor, 1) : '—');
    T('r_cpor_sub', on && isNum(m.cpor) ? 'Oda payı ' + fm.t(m.guestroomsT) + ' tCO₂e ÷ ' + fm.n(s.hotel.occupiedRooms, 0) + ' satılan oda-gece' : 'Satılan oda-gece ve alanları girin');
    T('r_meet_h', on ? fm.n(m.meetH, 4) : '—');
    T('r_meet_sub', on && isNum(m.meetH)
      ? 'Toplantı payı ' + fm.pct01(m.shareMeet) + ' · ' + fm.n(m.meetY, 0) + ' kgCO₂e/m²/yıl · segment ortalaması ' + fm.n(seg && seg.meet, 4)
      : 'Toplantı alanını girin');
    T('r_ren_elec', on ? fm.pct100(R.renewable.elecPct) : '—');
    T('r_ren_sub', on && isNum(R.renewable.energyPct)
      ? 'Toplam enerjide ' + fm.pct100(R.renewable.energyPct) + ' · yerinde üretim, PPA ve YEK-G / I-REC'
      : 'Yerinde üretim (GES), PPA ve YEK-G / I-REC');

    var src = on ? R.sources : [];
    var emptyText = R.started && !R.usable ? 'Hesap tamamlanamadı — Adım 1\'deki "Veri kontrolü"ndeki hataları düzeltin.' : 'Verilerinizi girdikçe burada görünür.';
    U.bars(U.el('src_bars'), src.map(function (x) { return { label: x.label, value: x.t, tone: x.hcmi ? 's' + x.scope : 'x' }; }), { emptyText: emptyText });
    var full = R.totals.fullT;
    U.fillTable(U.el('src_table') && U.el('src_table').tBodies[0], src.map(function (x) {
      return [{ text: x.label, th: true }, fm.n(x.t, 1), isNum(full) && full > 0 ? fm.pct01(x.t / full) : '—', SCOPE_TR[x.scope] + (x.hcmi ? '' : ' · HCMI dışı')];
    }), 'Veri bekleniyor', 4);

    var sc = R.scopes;
    U.bars(U.el('scope_bars'), on && sc ? [
      { label: 'Kapsam 1 — yakıt, araç, soğutucu gaz', value: sc.s1All, tone: 's1' },
      { label: 'Kapsam 2 — elektrik ve ısı (piyasa bazlı)', value: sc.s2Market, tone: 's2' },
      { label: 'Kapsam 3 — dış çamaşırhane (HCMI)', value: sc.s3Laundry, tone: 's3' },
      { label: 'Kapsam 3 — su ve atık (HCMI dışı)', value: sc.s3Other, tone: 'x' }
    ] : [], { emptyText: emptyText });
    var rows = [];
    if (on && sc) {
      rows.push([{ text: 'Kapsam 1 — yakıtlar, araçlar, soğutucu gaz', th: true }, fm.n(sc.s1, 1)]);
      if (sc.uplift > 1e-9) { rows.push([{ text: 'HCMI tahmini ek (bilinmeyen soğutucu gaz / araç yakıtı)', th: true }, fm.n(sc.uplift, 1)]); }
      rows.push([{ text: 'Kapsam 2 — konum bazlı', th: true }, fm.n(sc.s2Location, 1)]);
      if (sc.recCreditT > 0) { rows.push([{ text: 'YEK-G / I-REC mahsubu (' + fm.n(sc.recAppliedKwh, 0) + ' kWh)', th: true }, '−' + fm.n(sc.recCreditT, 1)]); }
      rows.push([{ text: 'Kapsam 2 — piyasa bazlı (HCMI)', th: true }, fm.n(sc.s2Market, 1)]);
      rows.push([{ text: 'Kapsam 3 — dış çamaşırhane (HCMI)', th: true }, fm.n(sc.s3Laundry, 1)]);
      rows.push([{ text: 'HCMI ayak izi toplamı', th: true, cls: 'strong' }, { text: fm.n(R.totals.hcmiT, 1), cls: 'strong' }]);
      rows.push([{ text: 'Kapsam 3 — su ve atık (HCMI dışı)', th: true }, fm.n(sc.s3Other, 1)]);
      rows.push([{ text: 'Tam envanter (tarama)', th: true, cls: 'strong' }, { text: fm.n(R.totals.fullT, 1), cls: 'strong' }]);
    }
    U.fillTable(U.el('scope_table') && U.el('scope_table').tBodies[0], rows, 'Veri bekleniyor', 2);

    // kıyas
    var b = R.bench, bref = U.el('h_bref');
    if (bref) { bref.placeholder = seg ? fm.n(seg.cpor, 1) : ''; }
    T('r_ref_src', b.refIsCustom
      ? 'Kendi referansınız kullanılıyor. Alanı boşaltırsanız segment ortalamasına döner.'
      : (seg ? 'CHSB 2026 · Türkiye · ' + seg.tr + ' · ' + seg.n + (seg.proxy ? ' · vekil değer içerir' : '') + '. Kendi kaynağınızla değiştirebilirsiniz.' : '—'));
    grade('r_grade', on ? b.grade : null);
    T('r_grade_txt', on && b.grade.letter !== '—' ? b.grade.letter + ' · ' + b.grade.label : '—');
    var ratio = b.ratio;
    T('r_grade_sub', on && isNum(ratio)
      ? (Math.abs(ratio - 1) < 0.005 ? 'Referansla aynı düzeyde' : 'Referansın ' + fm.pct01(Math.abs(ratio - 1)) + (ratio < 1 ? ' altında' : ' üzerinde'))
        + ' (referans ' + fm.n(b.ref, 1) + ' kgCO₂e/oda-gece)'
      : 'Oda-gece ve alan verisi girin');
    var mark = U.el('r_mark');
    if (mark) { mark.hidden = !(on && isNum(b.scalePos)); if (on && isNum(b.scalePos)) { mark.style.left = (b.scalePos * 100).toFixed(1) + '%'; } }
    var ticks = U.el('r_ticks');
    if (ticks) {
      U.clear(ticks);
      var posPct = [0, 0.2 / 1.4, 0.45 / 1.4, 0.75 / 1.4, 1.1 / 1.4, 1];
      b.ticks.forEach(function (v, k) { ticks.appendChild(U.h('span', { style: 'left:' + (posPct[k] * 100).toFixed(1) + '%', text: isNum(v) ? fm.n(v, 0) : '—' })); });
    }

    // yoğunluklar
    var I = R.intensity;
    function rel(cmp, refVal, digits, unit) {
      if (!seg || !isNum(refVal)) { return 'Bu segmentte CHSB verisi yok'; }
      return 'Segment ortalaması ' + fm.n(refVal, digits) + ' ' + unit + (cmp.direction ? ' — ' + cmp.text : '');
    }
    T('r_int_m2', on ? fm.n(I.co2m2, 1) : '—'); T('r_m2_rel', rel(b.co2m2, seg && seg.co2m2, 1, 'kgCO₂e/m²'));
    T('r_int_kwh', R.started ? fm.n(I.kwhm2, 0) : '—'); T('r_kwh_rel', rel(b.kwhm2, seg && seg.kwhm2, 0, 'kWh/m²'));
    T('r_int_water', R.started ? fm.n(I.waterL, 0) : '—'); T('r_water_rel', rel(b.water, seg && seg.water, 0, 'L'));
    T('r_int_waste', R.started ? fm.n(I.wasteKg, 1) : '—'); T('r_waste_rel', rel(b.waste, seg && seg.waste, 1, 'kg'));
    T('r_full', on ? fm.t(R.totals.fullT) : '—');

    // kişi başı (misafir gecelemesi) ve rapor göstergeleri
    var E = R.esg, pg = E.perGuest, gnOk = isNum(E.guestNights);
    T('r_pg_kwh', R.started ? fm.n(pg.kwh, 1) : '—');
    T('r_pg_kwh_sub', !gnOk ? 'Misafir gecelemesini girin' : (isNum(pg.co2Kg) ? 'Karbon: ' + fm.n(pg.co2Kg, 1) + ' kgCO₂e/misafir-gece' : 'Enerji verisi girin'));
    T('r_pg_water', R.started ? fm.n(isNum(pg.waterM3) ? pg.waterM3 * 1000 : null, 0) : '—');
    T('r_pg_water_sub', !gnOk ? 'Misafir gecelemesini girin' : (isNum(pg.waterM3) ? 'Yıllık ' + fm.n(s.hotel.extras.waterM3, 0) + ' m³' : 'Su tüketimini girin'));
    T('r_pg_chem', R.started ? fm.n(pg.chemKg, 2) : '—');
    T('r_pg_chem_sub', !gnOk ? 'Misafir gecelemesini girin' : (isNum(pg.chemKg) ? 'Yıllık ' + fm.n(E.chemicalsKg, 0) + ' kg' : 'Kimyasal tüketimini girin'));
    T('r_local', R.started && isNum(E.localPct) ? fm.pct100(E.localPct) : '—');
    T('r_local_sub', isNum(E.localPct) ? fm.tl(E.purchaseLocalTl) + ' / ' + fm.tl(E.purchaseTotalTl) + ' TL' : 'Toplam ve yerel satın almayı girin');
  }

  // ------------------------------------------------------------------ adım 3
  function step3(s, R) {
    var sc = R.scenario, on = R.started && R.usable, fm = U.fmt;
    var saved = on && sc.valid ? sc.savedT : null;
    T('m_saving', isNum(saved) ? (saved < 0 ? '+' + fm.t(-saved) : fm.t(saved)) : '0');
    T('m_pct', isNum(saved) && R.totals.hcmiT > 0 ? fm.pct01(saved / R.totals.hcmiT) : '%0');
    T('m_left', on ? fm.t(sc.afterT) : '—');
    T('m_cpor', on ? fm.n(sc.afterCpor, 1) : '—');
    T('m_grade', on && sc.afterGrade.letter !== '—' ? sc.afterGrade.letter + ' · ' + sc.afterGrade.label : '—');
    T('m_money', fm.tl(sc.netSavingsTl || 0));
    T('m_capex', fm.tl(sc.capexTl || 0));
    T('m_payback', isNum(sc.paybackYears) ? fm.n(sc.paybackYears, 1) + ' yıl' : (sc.capexTl > 0 ? 'işletme tasarrufu yok' : '—'));

    var byId = {}; R.ranking.forEach(function (r) { byId[r.id] = r; });
    root.MEASURES.order.forEach(function (id) {
      var w = U.el('mw_' + id), r = byId[id]; if (!w || !r) { return; }
      var red = r.reductionT;
      w.textContent = on && isNum(red) && red > 1e-6 ? '−' + fm.n(red, 1) + ' t' : '—';
      w.title = r.notes && r.notes.length ? r.notes.map(function (n) { return n.text; }).join(' ') : '';
      var row = U.el('mrow_' + id); if (row) { row.classList.toggle('na', on && !(isNum(red) && red > 1e-6)); }
    });

    var notes = U.el('m_notes');
    if (notes) {
      U.clear(notes);
      (sc.notes || []).forEach(function (n) { notes.appendChild(U.h('li', { text: n.text })); });
    }

    var list = on ? R.ranking.filter(function (r) { return isNum(r.reductionT) && r.reductionT > 1e-6; }) : [];
    var maxAbs = 1; list.forEach(function (r) { if (isNum(r.costTlPerT)) { maxAbs = Math.max(maxAbs, Math.abs(r.costTlPerT)); } });
    var tbody = U.el('macc') && U.el('macc').tBodies[0];
    U.fillTable(tbody, list.map(function (r) {
      var w = isNum(r.costTlPerT) ? Math.max(Math.abs(r.costTlPerT) / maxAbs * 100, 3) : 3;
      var barEl = U.h('span', { class: 'minibar' + (isNum(r.costTlPerT) && r.costTlPerT < 0 ? ' neg' : ''), style: 'width:' + w.toFixed(0) + '%' });
      return [{ text: r.tr + (r.selected ? ' (seçili)' : ''), th: true, cls: r.selected ? 'strong' : null }, fm.n(r.reductionT, 1), fm.tl(r.netSavingsTl),
              fm.tl(r.capexTl), isNum(r.paybackYears) ? fm.n(r.paybackYears, 1) + ' yıl' : '—', { text: isNum(r.costTlPerT) ? fm.tl(r.costTlPerT) : '—', cls: 'strong' }, { node: barEl }];
    }), 'Önlem başına etki için tüketim verisi girin.', 7);
  }

  // ------------------------------------------------------------------ adım 4
  function step4(s, R) {
    var p = R.path, fm = U.fmt;
    var start = U.el('nz_start'); if (start) { start.placeholder = String((isNum(s.hotel.year) ? s.hotel.year : 2025) + 1); }
    var done = U.el('nz_done'); if (done) { done.placeholder = '2030'; }
    NS.chart.draw(p, { svg: 'pathsvg', box: 'pathbox', tip: 'pathtip', empty: 'path_empty' });
    T('pathdesc', NS.chart.describe(p));
    var rows = [];
    if (p) {
      rows.push([{ text: p.baseYear + ' (baz)', th: true }, fm.t(p.baseT), 'baz yıl', fm.t(p.baseT), '—', '—']);
      p.evaluation.forEach(function (e) {
        rows.push([{ text: String(e.year), th: true }, fm.t(e.targetTco2e), root.NUM.pct(fm.n(e.reductionPct, 0)), fm.t(e.planTco2e),
                   e.met ? '0' : fm.t(e.gapTco2e), { text: e.met ? 'Hedefte' : 'Açık var', cls: e.met ? 'ok' : 'bad' }]);
      });
    }
    U.fillTable(U.el('path_table') && U.el('path_table').tBodies[0], rows, 'Veri bekleniyor', 6);
    T('path_note', p
      ? 'Baz yıl ' + p.baseYear + (p.yearGiven ? '' : ' (rapor yılı girilmediği için varsayıldı)') + ' — ' + p.cls.label + ': yıllık ' + root.NUM.pct(p.cls.annualPct)
        + ' pratik kuralı. Hedef, her kilometre taşında üç NZMFH ölçütünden en az birini sağlayan en yüksek emisyondur. Grafik bina enerjisini (sabit yakıtlar + elektrik ve ısı) izler; araç yakıtı, soğutucu gaz ve dış çamaşırhane ayrı kategorilerdir.'
      : '');
    var m30 = p ? p.m2030 : null, o = R.offsets;
    T('nz_t2030', m30 ? fm.t(m30.targetTco2e) : '—');
    T('nz_r2030', m30 ? root.NUM.pct(fm.n(m30.reductionPct, 0)) : '—');
    T('nz_gap', m30 ? fm.t(m30.gapTco2e) : '—');
    T('nz_gap_sub', !p ? '—' : (!m30 ? 'Baz yılınız 2030 ya da sonrası; tablodaki sonraki kilometre taşlarına bakın.'
      : (m30.met ? 'Patikanın önündesiniz — seçilen önlemler 2030 hedefini karşılıyor.'
        : 'Hedefi tutturmak için ek azaltım ya da ' + fm.tl(o.gap2030CostTl) + ' TL/yıl dengeleme gerekir.')));
    var on = R.started && R.usable;
    T('nz_offset', on ? fm.t(o.remainingT) : '—');
    T('nz_offset_cost', on ? fm.tl(o.costTl) : '—');
    T('nz_per_night', on ? fm.n(o.perRoomNightTl, 2) : '—');
    T('ver_t', on ? fm.n(o.remainingT, 1) : '—');
    T('ver_n', on ? fm.n(o.verCount, 0) : '—');
    T('ver_cost', on ? fm.tl(o.costTl) : '—');
    T('ver_guest', on ? fm.n(o.perGuestTl, 2) : '—');
    var now = new Date().getFullYear();
    Array.prototype.forEach.call(document.querySelectorAll('#timeline li'), function (li) { li.classList.toggle('done', +li.getAttribute('data-y') <= now); });
    var tx = R.taxonomy;
    T('r_skor', String(tx.score));
    var sb = U.el('r_skorbar'); if (sb) { sb.style.width = Math.max(tx.score, 3) + '%'; }
    var ul = U.el('r_recs'); if (ul) { U.clear(ul); tx.recs.forEach(function (t) { ul.appendChild(U.h('li', { text: t })); }); }
  }

  // ------------------------------------------------------------------ adım 5
  function step5(s, R) {
    var h = s.hotel, on = R.started && R.usable, fm = U.fmt, sc = R.scopes;
    T('d_name', (h.name || 'Tesis adı girilmedi') + (h.city ? ' · ' + h.city : ''));
    T('d_meta', (isNum(h.year) ? h.year + ' rapor yılı' : 'Rapor yılı girilmedi') + ' · ' + fm.n(h.rooms, 0) + ' oda · ' + fm.n(h.occupiedRooms, 0) + ' satılan oda-gece');
    T('d_cpor', on ? fm.n(R.metrics.cpor, 1) : '—');
    T('d_meet', on ? fm.n(R.metrics.meetH, 4) : '—');
    T('d_s1', on ? fm.n(sc.s1, 1) : '—');
    U.show('d_uplift_row', on && sc.uplift > 1e-9);
    T('d_uplift', on ? fm.n(sc.uplift, 1) : '—');
    T('d_s2l', on ? fm.n(sc.s2Location, 1) : '—');
    T('d_s2m', on ? fm.n(sc.s2Market, 1) : '—');
    T('d_s3', on ? fm.n(sc.s3Laundry, 1) : '—');
    T('d_total', on ? fm.n(R.totals.hcmiT, 1) : '—');
    T('d_ren', on ? fm.pct100(R.renewable.elecPct) : '—');
    T('d_m2', on ? fm.n(R.intensity.co2m2, 1) : '—');
    var g = R.grid;
    T('d_grid', isNum(g.value) ? fm.n(g.value, 3) + ' kgCO₂e/kWh · ' + (g.origin === 'tr' ? 'ETKB ' + g.basisYear : 'HCMI v2.0') : '—');
    T('d_verify', M.VERIFY[h.verify]);
    var e = R.event;
    T('e_room', e.valid ? fm.n(e.meetingKg, 0) : '—');
    T('e_stay', e.valid ? fm.n(e.stayKg, 0) : '—');
    T('e_total', e.valid ? fm.n(e.totalKg, 0) : '—');
    T('e_pp', e.valid ? fm.n(e.perPersonKg, 1) : '—');
    T('e_cost', e.valid ? fm.tl(e.costTl) : '—');
    var wa = U.el('btn-wa');
    if (wa) { wa.href = NS.texts.whatsappUrl(on ? lines(NS.texts.executive(s, R)) : ''); }
  }

  // ------------------------------------------------------------------ acente
  function agency(s, A) {
    var fm = U.fmt, a = s.agency, on = A.started;
    T('ar_total', on ? fm.n(A.totalT, A.totalT < 100 ? 1 : 0) : '—');
    T('ar_trees', on ? 'Ölçek fikri: ≈ ' + fm.n(A.trees, 0) + ' ağacın bir yılda tuttuğu karbon' : 'Verilerinizi girin');
    T('ar_pp', on ? fm.n(A.perGuestKg, 1) : '—');
    T('ar_tour', on && isNum(A.perTourT) ? 'Tur başına ortalama ' + fm.n(A.perTourT, 2) + ' tCO₂e' : 'Tur sayısı girilince tur başına ortalama görünür');
    U.bars(U.el('ar_bars'), A.parts.map(function (p) { return { label: p.label, value: p.kg / 1000 }; }).sort(function (x, y) { return y.value - x.value; }),
      { format: function (v) { return fm.n(v, 1); } });
    U.show('a_split', a.split);
    Array.prototype.forEach.call(document.querySelectorAll('#panel-acente [data-split-off]'), function (f) {
      f.classList.toggle('off', a.split);
      Array.prototype.forEach.call(f.querySelectorAll('input,select'), function (x) { x.disabled = a.split; });
    });
    var st = A.stay;
    st.rows.forEach(function (r) { T('as_' + r.id, r.n > 0 ? fm.n(r.kg / 1000, 1) : '—'); });
    T('as_n', st.split && st.nights > 0 ? fm.n(st.nights, 0) : '—');
    T('as_w', st.split && st.nights > 0 ? fm.n(st.cpor, 1) : '—');
    T('as_t', st.split && st.nights > 0 ? fm.n(st.kg / 1000, 1) : '—');
    var wa = U.el('btn-awa'); if (wa) { wa.href = NS.texts.whatsappUrl(on ? lines(NS.texts.agencySummary(s, A)) : ''); }
  }

  // ------------------------------------------------------------------ metodoloji (bir kez)
  function methodology() {
    var fm = U.fmt, H = root.HCMI, D = root.HCMI_DATA, TR = root.TR_REFERENCE;
    var tb = U.el('meth_factors') && U.el('meth_factors').tBodies[0];
    if (tb) {
      function ef(id, unit) {
        var t = D.energyTypes.filter(function (x) { return x.id === id; })[0];
        var d = H.defaultEf('Turkey', 'Turkey', t.name, []);
        return d.value === null ? null : { perKwh: d.value, perUnit: d.value * t.kwhPerUnit[unit] };
      }
      function fuel(label, id, unit, unitTr) {
        var e = ef(id, unit);
        return [{ text: label, th: true }, e ? fm.n(e.perUnit, 3) + ' kgCO₂e/' + unitTr + ' (' + fm.n(e.perKwh, 4) + ' kgCO₂e/kWh)' : '—', 'HCMI v2.0, Türkiye'];
      }
      var gy = TR.gridYears, years = Object.keys(gy).sort();
      var last = years[years.length - 1];
      var rows = [
        [{ text: 'Şebeke elektriği — tüketim noktası', th: true },
         last + ': ' + fm.n(gy[last].distribution, 3) + ' (dağıtım) · ' + fm.n(gy[last].transmission, 3) + ' (iletim) kgCO₂e/kWh; ' +
         years.slice(0, -1).map(function (y) { return y + ': ' + fm.n(gy[y].distribution, 3); }).join(' · '),
         'T.C. Enerji ve Tabii Kaynaklar Bakanlığı (EVÇED), Elektrik Tüketim Noktası Emisyon Faktörleri'],
        fuel('Doğal gaz', 'natural_gas', 'CuM', 'm³'),
        fuel('LPG', 'lpg', 'kg', 'kg'),
        fuel('Motorin — jeneratör, kazan', 'diesel_stat', 'L', 'L'),
        fuel('Motorin — araç, iş makinesi', 'diesel_mob', 'L', 'L'),
        fuel('Benzin — araç', 'gasoline_mob', 'L', 'L'),
        fuel('Fuel oil 2 (kalorifer yakıtı)', 'fuel_oil_2', 'L', 'L'),
        fuel('Satın alınan buhar / sıcak su', 'hot_water', 'kWh', 'kWh'),
        [{ text: 'Satın alınan soğutulmuş su, PPA elektriği', th: true }, 'Türkiye için resmî varsayılan yok — tedarikçinin faktörü girilir', 'HCMI v2.0'],
        [{ text: 'Soğutucu gazlar (GWP)', th: true }, D.refrigerants.filter(function (r) { return ['rf04', 'rf06', 'rf02', 'rf03', 'rf24'].indexOf(r.id) >= 0; })
          .map(function (r) { return M.refrigerantLabel(r.id).split(' ')[0] + ' ' + r.gwp; }).join(' · ') + ' (toplam ' + D.refrigerants.length + ' gaz)', 'HCMI v2.0 listesi'],
        [{ text: 'Dış çamaşırhane', th: true }, 'Ton başına ' + D.laundry.estimate.map(function (e) {
          var t = D.energyTypes.filter(function (x) { return x.name === e.type; })[0];
          return fm.n(e.perTonne, 0) + ' ' + (e.unit === 'L' ? 'L' : e.unit) + ' ' + (t ? t.tr.split(' (')[0].toLowerCase() : e.type);
        }).join(' + ') + '; miktar bilinmiyorsa dolu oda başına ' + fm.n(D.laundry.tonnePerOccupiedRoom * 1000, 2) + ' kg çamaşır', 'HCMI v2.0'],
        [{ text: 'Bilinmeyen soğutucu gaz / araç yakıtı', th: true }, 'Toplam emisyona %' + fm.n((D.uplift.one - 1) * 100, 0) + ' (ikisi birden %' + fm.n((D.uplift.both - 1) * 100, 0) + ')', 'HCMI v2.0'],
        [{ text: 'Su temini + atıksu', th: true }, fm.n(root.MEASURES.extrasEf.waterKgPerM3, 2) + ' kgCO₂e/m³', 'DEFRA 2025'],
        [{ text: 'Atık: depolama / geri dönüşüm', th: true }, fm.n(root.MEASURES.extrasEf.landfillKgPerT, 0) + ' / ' + fm.n(root.MEASURES.extrasEf.recycleKgPerT, 0) + ' kgCO₂e/ton', 'DEFRA 2025'],
        [{ text: 'Uçuş: iç hat / kısa dış / uzun dış', th: true }, [NS.agency.EF.icucus, NS.agency.EF.kisadis, NS.agency.EF.uzundis].map(function (x) { return fm.n(x, 3); }).join(' / ') + ' kgCO₂e/yolcu-km (ışınımsal etki dahil)', 'DEFRA 2025'],
        [{ text: 'Otobüs / transfer aracı', th: true }, fm.n(NS.agency.EF.otobus, 3) + ' kgCO₂e/yolcu-km · ' + fm.n(NS.agency.EF.transfer, 2) + ' kgCO₂e/araç-km', 'DEFRA 2025'],
        [{ text: 'GES üretimi', th: true }, fm.n(root.MEASURES.coef.pv.yieldKwhPerKwp, 0) + ' kWh/kWp/yıl', 'Türkiye ortalama güneşlenme varsayımı'],
        [{ text: 'Ağaç eşdeğeri', th: true }, '1 ağaç ≈ ' + fm.n(NS.agency.EF.treeKgPerYear, 0) + ' kgCO₂/yıl', 'Bilgilendirme amaçlı yaygın kabul']
      ];
      U.fillTable(tb, rows);
    }
    T('meth_grid_note', 'Rapor yılının faktörü henüz yayımlanmadıysa yayımlanmış en güncel yıl kullanılır ve ekranda belirtilir (NZMFH §4.1). Bakanlığın ulusal marjinal faktörleri proje bazlı karbon kredisi hesapları içindir; kurumsal envanterde kullanılmaz. Faktörler ' + TR.checkedOn.split('-').reverse().join('.') + ' tarihinde kaynak belgelerden okundu.');

    var bb = U.el('meth_bench') && U.el('meth_bench').tBodies[0];
    if (bb) {
      U.fillTable(bb, root.BENCH.segments.map(function (sg) {
        var p = sg.proxy ? '*' : '';
        return [{ text: sg.tr, th: true }, fm.n(sg.cpor, 1) + p, fm.n(sg.meet, 4) + p, fm.n(sg.co2m2, 1), fm.n(sg.kwhm2, 1), fm.n(sg.water, 0) + p, (sg.waste === null ? '—' : fm.n(sg.waste, 1) + p)];
      }));
    }
    var mb = U.el('meth_measures') && U.el('meth_measures').tBodies[0];
    if (mb) {
      var C = root.MEASURES.coef;
      var capex = {
        led: 'Oda başına ' + fm.tl(C.led.capexPerRoom) + ' TL', keycard: 'Oda başına ' + fm.tl(C.keycard.capexPerRoom) + ' TL',
        bms: 'm² başına ' + fm.tl(C.bms.capexPerM2) + ' TL', hr: 'm² başına ' + fm.tl(C.hr.capexPerM2) + ' TL',
        pv: 'kWp başına ' + fm.tl(C.pv.capexPerKwp) + ' TL (sayfada değiştirilebilir)', hp: 'Oda başına ' + fm.tl(C.hp.capexPerRoom) + ' TL',
        st: 'Oda başına ' + fm.tl(C.st.capexPerRoom) + ' TL', green: 'Yatırım yok; prim ' + fm.n(C.green.premiumTlPerKwh, 2) + ' TL/kWh (işletme gideri)',
        ev: 'Araç başına ' + fm.tl(C.ev.capexPerVehicle) + ' TL (yılda ' + fm.tl(C.ev.litresPerVehicleYear) + ' L yakıt başına bir araç)',
        water: 'Oda başına ' + fm.tl(C.water.capexPerRoom) + ' TL', linen: 'Oda başına ' + fm.tl(C.linen.capexPerRoom) + ' TL',
        waste: fm.tl(C.waste.capexFixed) + ' TL + oda başına ' + fm.tl(C.waste.capexPerRoom) + ' TL', refrig: fm.tl(C.refrig.capexFixed) + ' TL sabit'
      };
      U.fillTable(mb, root.MEASURES.list.map(function (m) { return [{ text: m.tr, th: true }, m.note, capex[m.id] || '—']; }));
    }
  }

  function all(s, R, A) {
    U = NS.ui; M = NS.model; F = NS.form;
    summary(s, R);
    gridInfo(s, R); areaNote(s, R); ledger(s, R); visibility(s); check(s, R);
    step2(s, R); step3(s, R); step4(s, R); step5(s, R);
    agency(s, A);
  }

  NS.render = { all: all, methodology: function () { U = NS.ui; M = NS.model; methodology(); } };
})(typeof globalThis !== 'undefined' ? globalThis : self);
