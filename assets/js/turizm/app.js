/* =========================================================================
   Turizm hesaplayıcısı — DENETLEYİCİ  (assets/js/turizm/app.js)
   -------------------------------------------------------------------------
   Sayfanın akışı: durum (model.js) → hesap (compute.js) → ekran (render.js).
     • Yazarken 140 ms bekleyip yeniden hesaplar; seçim/işaret değişince hemen.
     • "Bu tarayıcıda saklansın" işaretliyse her hesaptan sonra kaydeder (storage.js).
     • Sekmeler (Otel / Acente), örnekle doldur, formu temizle, kopyala / yazdır.
     • "PDF raporu oluştur" / "Tek sayfalık özet": report.js'in ürettiği belgeyi yeni sekmede açar.
     • Panel (adım şeridinin başındaki "Panel"): dashboard.js + dashboard-view.js. Panel açıkken adım
       bölümleri gizlenir; bir adıma tıklanınca adımlara dönülür. Önceki yıllar cloud.js'ten
       (setHistory) gelir; örnek otelde etiketli örnek geçmiş gösterilir.
       Kapak logosu: seçilen görsel tarayıcıda en çok 600 × 240 piksele küçültülür (PNG/JPEG data URL,
       state.hotel.logo); sunucuya yalnız kullanıcı "Hesabıma kaydet" derse kayıtla birlikte gider.
     • Üyelik şartı (v6.3): giriş yapmamış ziyaretçi otel ve acente formlarına veri giremez. Bir alana
       tıklayınca ya da yazınca üyelik penceresi açılır (cloud.js, "turizm:needauth"), değer değişmez.
       Örnek veriler, sonuçlar, panel, rapor, gezinme ve formu temizleme serbesttir. Üyelik modülü
       yüklenemezse (account 'offline') hesaplayıcı eskisi gibi üyeliksiz çalışır.
     • window.__tour: üyelik modülünün (cloud.js) kullandığı arayüz — eski sayfayla
       aynı adlar: collect, apply, isEmpty, summary, mode, setMode, toast.
   Dışa: globalThis.TURIZM.app
   ========================================================================= */
(function (root) {
  'use strict';

  var NS = root.TURIZM = root.TURIZM || {};
  var doc = root.document;
  var U, M, F, RN, S, X;
  var state = null, R = null, A = null, timer = null, pending = false;
  var view = 'steps', dashDirty = true, account = 'none', records = [], recVer = 0, histCache = { key: null, list: [] }, sampleHist = null;
  var STEP_IDS = ['adim1', 'adim2', 'adim3', 'adim4', 'adim5'];

  function isNum(x) { return typeof x === 'number' && isFinite(x); }

  // ------------------------------------------------------------------ hesap döngüsü
  function compute() {
    clearTimeout(timer); pending = false;
    try {
      R = NS.compute(state);
      A = NS.agency.compute(state.agency);
      RN.all(state, R, A);
      reportState();
      if (view === 'dash') { renderDash(); } else { dashDirty = true; }
    } catch (e) {
      if (root.console) { root.console.error(e); }
      U.notice('h_notice', [{ b: 'Hesaplamada beklenmeyen bir hata oluştu.' }, ' Sayfayı yenileyin; sorun sürerse info@commited.app adresine yazın.'], 'warn');
    }
    S.save(state);
    try { root.dispatchEvent(new root.CustomEvent('turizm:computed')); } catch (e) { /* eski tarayıcı */ }
  }
  function schedule(delay) {
    clearTimeout(timer); pending = true;
    if (!delay) { compute(); return; }
    timer = setTimeout(compute, delay);
  }
  function flush() { if (pending || !R) { compute(); } }

  function changed(path, how) {
    var h = state.hotel, a = state.agency;
    if (path === 'hotel.country') {
      var regs = M.regionOptions(h.country);
      h.region = regs.length ? regs[0].value : h.country;
      F.syncRegions();
    }
    if (path === 'hotel.segment') { h.benchRef = null; F.fill(); }
    if (path === 'agency.seg') {
      var d = M.agencyDefaults()[a.seg];
      if (isNum(d)) { a.cpor = d; F.fill(); }
    }
    if (path === 'agency.cpor') {
      var defs = M.agencyDefaults(), match = 'custom';
      Object.keys(defs).forEach(function (k) { if (isNum(a.cpor) && Math.abs(defs[k] - a.cpor) < 0.05) { match = k; } });
      if (a.seg !== match) { a.seg = match; var sel = U.el('a_seg'); if (sel) { sel.value = match; } }
    }
    if (path === 'options.saveLocal') {
      U.toast(state.options.saveLocal ? 'Veriler bu tarayıcıda saklanacak' : 'Bu tarayıcıdaki kayıt silindi');
    }
    schedule(how === 'input' ? 140 : 0);
  }

  // ------------------------------------------------------------------ sekmeler
  function setMode(m) {
    state.mode = m === 'acente' ? 'acente' : 'otel';
    var otel = state.mode === 'otel';
    U.el('panel-otel').hidden = !otel;
    U.el('panel-acente').hidden = otel;
    [['tab-otel', otel], ['tab-acente', !otel]].forEach(function (p) {
      var t = U.el(p[0]); t.setAttribute('aria-selected', String(p[1])); t.tabIndex = p[1] ? 0 : -1;
    });
    S.save(state);
  }
  function bindTabs() {
    var tabs = [U.el('tab-otel'), U.el('tab-acente')];
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { setMode(i === 0 ? 'otel' : 'acente'); });
      t.addEventListener('keydown', function (ev) {
        var k = ev.key, j = null;
        if (k === 'ArrowRight' || k === 'ArrowDown') { j = (i + 1) % tabs.length; }
        else if (k === 'ArrowLeft' || k === 'ArrowUp') { j = (i - 1 + tabs.length) % tabs.length; }
        else if (k === 'Home') { j = 0; } else if (k === 'End') { j = tabs.length - 1; }
        if (j === null) { return; }
        ev.preventDefault(); setMode(j === 0 ? 'otel' : 'acente'); tabs[j].focus();
      });
    });
  }

  // ------------------------------------------------------------------ üyelik şartı (veri girişi)
  // 'none': üyelik bilgisi henüz gelmedi · 'guest': giriş yok · 'user': giriş var · 'offline': üyelik modülü yok
  var GATE_SCOPE = '#panel-otel, #panel-acente';
  var EDIT_BTN = '[data-row-del],[data-quick],#add_market,[data-del-market],#add_ref,[data-del-ref],#add_laundry,[data-del-laundry],'
    + '#logo_pick,#logo_remove,[data-dash-act="add"],[data-dash-act="remove"]';
  var noticeKind = { otel: 'default', acente: 'default' };
  function gated() { return account === 'guest' || account === 'none'; }
  function editable(t) {
    if (!t || !t.closest || !t.closest(GATE_SCOPE)) { return null; }
    if (t.matches('input, select, textarea')) {
      var ty = (t.getAttribute('type') || '').toLowerCase();
      if (ty === 'button' || ty === 'submit' || ty === 'reset' || ty === 'hidden') { return null; }
      return (ty === 'checkbox' || ty === 'radio' || ty === 'file') ? 'toggle' : 'field';
    }
    return t.closest(EDIT_BTN) ? 'button' : null;
  }
  function askAccount() {
    if (account === 'none') { U.toast('Üyelik bilgisi yükleniyor; birkaç saniye sonra yeniden deneyin'); return; }
    // pencere zaten açıksa cloud.js yeniden açmaz
    try { doc.dispatchEvent(new root.CustomEvent('turizm:needauth', { detail: { mode: state.mode } })); } catch (e) { /* eski tarayıcı */ }
  }
  /** Yazma tuşu mu? (gezinme, Tab, Esc, kopyalama serbest) */
  function editKey(ev, kind) {
    var k = ev.key || '';
    if (k === 'Tab' || k === 'Escape' || k === 'Shift' || k === 'Control' || k === 'Alt' || k === 'Meta') { return false; }
    if (ev.ctrlKey || ev.metaKey) { return /^[vxzy]$/i.test(k); }
    if (kind === 'toggle') { return k === ' ' || k === 'Enter' || /^Arrow/.test(k); }
    if (k.length === 1 || k === 'Backspace' || k === 'Delete' || k === 'Enter') { return true; }
    return /^Arrow(Up|Down)$/.test(k) && ev.target.matches('select');
  }
  function bindGate() {
    var app = U.el('app') || doc.body;
    app.addEventListener('pointerdown', function (ev) {
      if (!gated() || editable(ev.target) !== 'field') { return; }
      ev.preventDefault();                                           // odak ve açılır liste yok
      askAccount();
    }, true);
    app.addEventListener('click', function (ev) {
      if (!gated()) { return; }
      var kind = editable(ev.target);
      if (kind !== 'toggle' && kind !== 'button') { return; }
      ev.preventDefault(); ev.stopPropagation();                      // işaret değişmez, form.js / app.js çalışmaz
      askAccount();
    }, true);
    app.addEventListener('keydown', function (ev) {
      if (!gated()) { return; }
      var kind = editable(ev.target);
      if ((kind === 'field' || kind === 'toggle') && editKey(ev, kind)) { ev.preventDefault(); ev.stopPropagation(); askAccount(); }
      else if (kind === 'button' && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); ev.stopPropagation(); askAccount(); }
    }, true);
    // son güvence: yapıştırma, sürükleme, tarayıcının otomatik doldurması → değer geri alınır
    ['input', 'change'].forEach(function (type) {
      app.addEventListener(type, function (ev) {
        if (!gated() || !editable(ev.target)) { return; }
        ev.stopPropagation();
        if (ev.target.type === 'file') { try { ev.target.value = ''; } catch (e) { /* yok */ } }
        F.renderAll();
        askAccount();
      }, true);
    });
    // üyelik bilgisi hiç gelmezse (betik engellendi, ağ yok) hesaplayıcı kilitli kalmasın
    setTimeout(function () { if (account === 'none') { setAccount('offline'); } }, 10000);
  }
  function setAccount(a) {
    var prev = account;
    account = a === 'user' || a === 'guest' || a === 'offline' ? a : 'none';
    doc.body.classList.toggle('gated', gated());
    if (prev !== account) {
      ['otel', 'acente'].forEach(function (w) {
        var empty = w === 'acente' ? M.agencyIsEmpty(state.agency) : M.hotelIsEmpty(state.hotel);
        if (noticeKind[w] === 'default' && empty) { defaultNotice(w); }
        else if (noticeKind[w] === 'example') { exampleNotice(w); }
      });
    }
    if (view === 'dash') { renderDash(); }
  }

  // ------------------------------------------------------------------ bildirimler
  function defaultNotice(which) {
    var ag = which === 'acente';
    noticeKind[ag ? 'acente' : 'otel'] = 'default';
    // Örnek düğmesi v6.3'ten beri cümle içi bağlantı değil, şeridin altında altın renkli, parlayan bir düğme
    // (canlıda gözden kaçıyordu; Levent Bey "daha görünür yap, parlat" dedi).
    var example = { text: ag ? 'Örnek bir acenteyle doldurun' : '120 odalı örnek tatil köyüyle doldurun', kind: 'shine', attrs: { 'data-example': ag ? 'acente' : 'otel' } };
    var parts, acts;
    if (gated()) {
      parts = [{ b: 'Verilerinizi girmek için üye olun ya da giriş yapın.' },
        ag ? ' Üyelik ve hesaplama ücretsizdir; verileriniz hesabınızda saklanır. Nasıl çalıştığını önce örnekle görebilirsiniz.'
           : ' Üyelik ve hesaplama ücretsizdir; verileriniz hesabınızda saklanır, her yıl yeni ölçümünüzü eklersiniz. Nasıl çalıştığını önce örnekle görebilirsiniz.'];
      acts = [{ text: 'Ücretsiz üye olun', kind: 'primary', attrs: { 'data-auth': 'register' } },
        { text: 'Giriş yapın', attrs: { 'data-auth': 'login' } }, example];
    } else {
      parts = [ag ? 'Alanlar boş. Acentenizin yıllık verilerini girdikçe sonuçlar anında güncellenir. Nasıl çalıştığını önce örnekle görebilirsiniz.'
                  : 'Alanlar boş. Tesisinizin 12 aylık verilerini girdikçe beş adımın tamamı anında güncellenir. Nasıl çalıştığını önce örnekle görebilirsiniz.'];
      acts = [example];
    }
    U.notice(ag ? 'a_notice' : 'h_notice', parts.concat([{ actions: acts }]));
  }
  function exampleNotice(which) {
    noticeKind[which === 'acente' ? 'acente' : 'otel'] = 'example';
    var parts = [{ b: 'Örnek veriler yüklendi — bunlar sizin verileriniz değildir.' }];
    if (gated()) {
      parts.push(' Kendi verilerinizi girmek için ', { button: { text: 'ücretsiz üye olun', attrs: { 'data-auth': 'register' } } }, ' ya da ',
        { button: { text: 'giriş yapın', attrs: { 'data-auth': 'login' } } }, '. ');
    } else {
      parts.push(' Kendi rakamlarınızı yazdıkça sonuçlar güncellenir. ');
    }
    if (which !== 'acente') { parts.push({ button: { text: 'Sonuçları panelde görün', attrs: { 'data-view': 'dash' } } }, ' · '); }
    parts.push({ button: { text: 'Örneği temizle', attrs: { 'data-clear': which } } });
    U.notice(which === 'acente' ? 'a_notice' : 'h_notice', parts);
  }

  // ------------------------------------------------------------------ örnek / temizle (iletişim kutusu yok; iki adımlı onay)
  function askInNotice(which, question, yesText, onYes) {
    var id = which === 'acente' ? 'a_notice' : 'h_notice';
    noticeKind[which === 'acente' ? 'acente' : 'otel'] = 'other';
    U.notice(id, [{ b: question }, ' ', { button: { text: yesText, attrs: { 'data-confirm': which } } }, ' · ', { button: { text: 'Vazgeç', attrs: { 'data-cancel': which } } }], 'warn');
    askInNotice.pending = { which: which, run: onYes };
    var b = U.el(id).querySelector('[data-confirm]'); if (b) { b.focus(); }
  }
  function loadExample(which) {
    M.applyExample(state, which);
    F.renderAll(); compute();
    exampleNotice(which);
    U.toast('Örnek veriler yüklendi');
  }
  function requestExample(which) {
    var empty = which === 'acente' ? M.agencyIsEmpty(state.agency) : M.hotelIsEmpty(state.hotel);
    if (empty) { loadExample(which); return; }
    askInNotice(which, 'Girdiğiniz değerlerin yerine örnek veriler yüklenecek.', 'Evet, örneği yükle', function () { loadExample(which); });
  }
  function clearPart(which) {
    if (which === 'acente') { state.agency = M.emptyAgency(); } else { state.hotel = M.emptyHotel(); }
    F.renderAll(); compute(); defaultNotice(which);
    U.toast('Form temizlendi');
  }

  function onAppClick(ev) {
    var b = ev.target.closest ? ev.target.closest('button,a') : null;
    if (!b) { return; }
    if (b.hasAttribute('data-example')) { requestExample(b.getAttribute('data-example')); return; }
    if (b.hasAttribute('data-clear')) { clearPart(b.getAttribute('data-clear')); return; }
    if (b.hasAttribute('data-confirm')) {
      var p = askInNotice.pending; askInNotice.pending = null;
      if (p && typeof p.run === 'function') { p.run(); }
      return;
    }
    if (b.hasAttribute('data-cancel')) {
      askInNotice.pending = null;
      var w = b.getAttribute('data-cancel');
      if (w === 'acente' ? M.agencyIsEmpty(state.agency) : M.hotelIsEmpty(state.hotel)) { defaultNotice(w); }
      else {
        noticeKind[w === 'acente' ? 'acente' : 'otel'] = 'other';
        U.notice(w === 'acente' ? 'a_notice' : 'h_notice', ['Verileriniz değişmedi. ',
          { button: { text: 'Örnek verileri göster', attrs: { 'data-example': w } } }, ' (girdiklerinizin yerine geçer; önce sorulur)']);
      }
      return;
    }
    if (b.hasAttribute('data-view')) { ev.preventDefault(); setView(b.getAttribute('data-view'), { focus: true }); return; }
    if (b.hasAttribute('data-step') && view === 'dash') { setView('steps', { scroll: false }); return; }   // bağlantı kendi adımına kaydırır
    if (b.hasAttribute('data-dash-act')) { dashAction(b.getAttribute('data-dash-act'), b.getAttribute('data-id')); return; }
    if (b.hasAttribute('data-goto')) { goTo(b.getAttribute('data-goto')); return; }
    if (b.hasAttribute('data-goto-id')) {
      if (view === 'dash') { setView('steps', { scroll: false }); }
      var t = U.el(b.getAttribute('data-goto-id'));
      if (t) { t.scrollIntoView({ block: 'center' }); try { t.focus({ preventScroll: true }); } catch (e) { t.focus(); } }
      return;
    }
    if (b.id === 'btn-reset') {
      if (b.getAttribute('data-armed') === '1') { b.removeAttribute('data-armed'); b.textContent = 'Formu temizle'; clearPart('otel'); return; }
      b.setAttribute('data-armed', '1'); b.textContent = 'Emin misiniz? Tüm otel verileri silinecek — evet, temizle';
      setTimeout(function () { if (b.getAttribute('data-armed') === '1') { b.removeAttribute('data-armed'); b.textContent = 'Formu temizle'; } }, 6000);
      return;
    }
    flush();
    var L = NS.i18n ? NS.i18n.tLines : function (x) { return x; };   // İngilizce seçiliyse metin de İngilizce
    if (b.id === 'btn-decl') { U.copy(R && R.usable && R.started ? L(X.declaration(state, R)) : '', 'Beyan metni kopyalandı'); }
    else if (b.id === 'btn-copy') { U.copy(R && R.usable && R.started ? L(X.executive(state, R)) : '', 'Yönetici özeti kopyalandı'); }
    else if (b.id === 'btn-json') { U.copy(R && R.started ? JSON.stringify(X.exportObject(state, R), null, 2) : '', 'JSON kopyalandı — yazılım ekibinize verebilirsiniz'); }
    else if (b.id === 'btn-mail') { U.copy('info@commited.app', 'E-posta adresi kopyalandı'); }
    else if (b.id === 'btn-acopy') { U.copy(A && A.started ? L(X.agencySummary(state, A)) : '', 'Özet kopyalandı'); }
    else if (b.id === 'btn-print') { printDeclaration(); }
    else if (b.id === 'btn-report') { openReport('report'); }
    else if (b.id === 'btn-summary') { openReport('summary'); }
    else if (b.id === 'logo_pick') { var fi = U.el('logo_file'); if (fi) { fi.click(); } }
    else if (b.id === 'logo_remove') { state.hotel.logo = null; U.setText('report_msg', 'Logo kaldırıldı.'); reportState.keep = true; schedule(0); }
  }

  // ------------------------------------------------------------------ PDF sürdürülebilirlik raporu
  function reportState() {
    var b = U.el('btn-report'); if (!b || !NS.report) { return; }
    var can = NS.report.canBuild(state, R);
    ['btn-report', 'btn-summary'].forEach(function (id) { var x = U.el(id); if (x) { x.setAttribute('aria-disabled', String(!can.ok)); } });
    logoPreview();
    if (reportState.keep) { reportState.keep = false; return; }       // logo iletisi bir kez görünsün
    if (!can.ok) { U.setText('report_msg', can.reason); }
    else if (reportState.shown !== 'opened') { U.setText('report_msg', ''); }
    else if (reportState.snap !== JSON.stringify(state.hotel)) {
      // Rapor açıldıktan sonra veri değiştiyse açık sekmedeki rapor eskidi
      U.setText('report_msg', 'Verileri değiştirdiniz. Güncel rapor için düğmeye yeniden basın.');
    }
  }
  function isSample() {
    if (M.isSampleName) { return M.isSampleName(state.hotel.name); }
    var ex = M.LEGACY_EXAMPLE && M.LEGACY_EXAMPLE.h_name;
    return !!ex && (state.hotel.name || '').trim() === ex;
  }
  function logoPreview() {
    var wrap = U.el('logo_prev'), img = U.el('logo_img'), rm = U.el('logo_remove'), pick = U.el('logo_pick');
    if (!wrap || !img) { return; }
    var logo = state.hotel.logo || '';
    if ((img.getAttribute('src') || '') !== logo) { if (logo) { img.setAttribute('src', logo); } else { img.removeAttribute('src'); } }
    wrap.hidden = !logo; if (rm) { rm.hidden = !logo; }
    if (pick) { pick.textContent = logo ? 'Logoyu değiştir' : 'Kapak için logo ekle'; }
  }
  var LOGO_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
  /** Logoyu en çok 600 × 240 piksele sığdırır; PNG (saydamlık korunur) ya da JPEG data URL döndürür.
   *  vec: SVG (vektör) baskıda net çıksın diye kutuya kadar büyütülür; aspect: boyutsuz SVG'nin en/boy oranı. */
  function rasterLogo(img, jpeg, vec, aspect) {
    var w = img.naturalWidth, h = img.naturalHeight, sizes = [[600, 240], [450, 180], [300, 120]];
    if (!(w > 0 && h > 0)) { w = 600; h = aspect > 0 ? 600 / aspect : 240; }   // bazı tarayıcılar boyutsuz SVG'de 0 verir
    for (var i = 0; i < sizes.length; i++) {
      var k = Math.min(sizes[i][0] / w, sizes[i][1] / h); if (!vec) { k = Math.min(1, k); }
      var cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
      var cv = doc.createElement('canvas'); cv.width = cw; cv.height = ch;
      var g = cv.getContext('2d');
      if (jpeg) { g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, cw, ch); }
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, cw, ch);
      var d = jpeg ? cv.toDataURL('image/jpeg', 0.9) : cv.toDataURL('image/png');
      if (M.logoOf(d)) { return d; }
    }
    return null;
  }
  function onLogoFile(ev) {
    var inp = ev.target, f = inp.files && inp.files[0];
    if (!f) { return; }
    inp.value = '';                                                        // aynı dosya yeniden seçilebilsin
    var fail = function (msg) { U.setText('report_msg', msg); U.toast('Logo eklenemedi'); };
    if (LOGO_TYPES.indexOf(f.type) < 0) { fail('Logo PNG, JPG, SVG ya da WebP dosyası olmalı.'); return; }
    if (f.size > 5 * 1024 * 1024) { fail('Logo dosyası 5 MB\'tan küçük olmalı.'); return; }
    var svg = f.type === 'image/svg+xml';
    var load = function (aspect) {
      var url = root.URL.createObjectURL(f), img = new root.Image();
      img.onload = function () {
        var data = null;
        try { data = rasterLogo(img, f.type === 'image/jpeg', svg, aspect); } catch (e) { data = null; }
        root.URL.revokeObjectURL(url);
        if (!data) { fail('Logo okunamadı. Başka bir dosya deneyin.'); return; }
        state.hotel.logo = data;
        U.setText('report_msg', 'Logo eklendi: raporun kapağında, sayfa başlıklarında ve özette görünecek.');
        reportState.keep = true; schedule(0);
      };
      img.onerror = function () { root.URL.revokeObjectURL(url); fail('Logo okunamadı. Başka bir dosya deneyin.'); };
      img.src = url;
    };
    // SVG: en/boy oranı viewBox'tan okunur (tarayıcı boyut vermezse bozulmasın)
    if (svg && f.text) {
      f.text().then(function (t) {
        var m = /viewBox\s*=\s*["']\s*-?[\d.]+[\s,]+-?[\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(t);
        load(m && +m[1] > 0 && +m[2] > 0 ? +m[1] / +m[2] : 0);
      }, function () { load(0); });
    } else { load(0); }
  }
  function bindLogo() {
    var fi = U.el('logo_file'); if (fi) { fi.addEventListener('change', onLogoFile); }
  }

  function openReport(variant) {
    var can = NS.report ? NS.report.canBuild(state, R) : { ok: false, reason: 'Rapor modülü yüklenemedi; sayfayı yenileyin.' };
    if (!can.ok) { U.setText('report_msg', can.reason); U.toast('Rapor için veriler eksik'); return; }
    var html, summary = variant === 'summary';
    try { html = NS.report.build(state, R, { toolbar: true, sample: isSample(), variant: summary ? 'summary' : 'report' }); }
    catch (e) {
      if (root.console) { root.console.error(e); }
      U.setText('report_msg', 'Rapor oluşturulamadı: ' + (e && e.message ? e.message : e)); return;
    }
    var w = root.open('', '_blank');
    if (!w) {
      U.setText('report_msg', 'Tarayıcınız yeni sekmeyi engelledi. Bu site için açılır pencerelere izin verip yeniden deneyin.');
      U.toast('Yeni sekme engellendi'); return;
    }
    w.document.open(); w.document.write(html); w.document.close();
    if (NS.i18n && NS.i18n.lang() === 'en') {                      // rapor sekmesi de İngilizce
      NS.i18n.apply(w.document);
      w.document.documentElement.lang = 'en';
      if (w.__fitPages) { w.__fitPages(); }                         // çeviri sonrası sayfaları A4'e sığdır
    }
    reportState.shown = 'opened'; reportState.snap = JSON.stringify(state.hotel);
    U.setText('report_msg', (summary ? 'Özet' : 'Rapor') + ' yeni sekmede açıldı. Oradaki "PDF olarak kaydet" düğmesiyle indirebilirsiniz.');
  }

  function printDeclaration() {
    if (!(R && R.started && R.usable)) { U.toast('Önce verilerinizi girin'); return; }
    doc.body.classList.add('print-decl');
    var done = function () { doc.body.classList.remove('print-decl'); root.removeEventListener('afterprint', done); };
    root.addEventListener('afterprint', done);
    root.print();
    setTimeout(done, 1500);
  }

  /** Veri kontrolündeki "Alana git": yolu ilgili alana çevirip odakla */
  function goTo(path) {
    if (view === 'dash') { setView('steps', { scroll: false }); }
    var target = null, m = /^hotel\.energy\.(\d+)\.(\w+)$/.exec(path);
    if (m) {
      var row = state.hotel.energy[+m[1]];
      if (row) {
        var map = { total: 'ea-', unit: 'eu-', typeId: 'et-', manualEf: 'ef-', privateActual: 'pa-', price: 'ep-' };
        var panel = U.el('ed-' + row.id);
        if ((m[2] === 'manualEf' || m[2] === 'privateActual') && panel) {
          panel.hidden = false;
          var btn = doc.querySelector('[data-row-more="' + row.id + '"]'); if (btn) { btn.setAttribute('aria-expanded', 'true'); }
        }
        target = U.el((map[m[2]] || 'ea-') + row.id);
        if (m[2] === 'manualEf' && target && target.closest('.ef-manual') && target.closest('.ef-manual').hidden) {
          target = doc.querySelector('#ed-' + row.id + ' input[value="manual"]');
        }
      }
    } else if (path === 'hotel.energy') { target = U.el('add_type'); }
    else if (path === 'hotel.market') { target = doc.querySelector('[data-bind^="hotel.market."]') || U.el('add_market'); }
    else if (path === 'hotel.refrigerants' || path === 'hotel.refrigerants.mode') { target = doc.querySelector('input[name="refmode"]:checked') || doc.querySelector('input[name="refmode"]'); }
    else if (path === 'hotel.mobileFuels') { target = doc.querySelector('input[name="mobmode"]:checked'); }
    else if (path === 'hotel.privateSpace.method' || path === 'hotel.privateSpace.sharePct') { var fp = U.el('fold-private'); if (fp) { fp.open = true; } target = doc.querySelector('[data-bind="' + path + '"]'); }
    else if (path === 'hotel.country') { var fc = U.el('fold-country'); if (fc) { fc.open = true; } target = U.el('h_country'); }
    else { target = doc.querySelector('[data-bind="' + path + '"]'); }
    if (!target) { return; }
    var fold = target.closest('details'); if (fold) { fold.open = true; }
    target.scrollIntoView({ block: 'center', behavior: root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
  }

  // ------------------------------------------------------------------ panel (gösterge paneli)
  /** v: 'dash' | 'steps'. opts.scroll: false ise kaydırma yok; opts.focus: panel başlığına odaklan */
  function setView(v, opts) {
    opts = opts || {};
    var dash = U.el('panel-dash');
    // Panel yalnız sayfada panel alanı ve çizici varsa açılır: eski ya da yarım yüklenmiş bir HTML ile
    // bu dosya birlikte yayında kalırsa adımlar gizlenmez, hesaplayıcı adımlarla çalışmaya devam eder.
    view = (v === 'dash' && dash && NS.dashboard && NS.dashView) ? 'dash' : 'steps';
    if (dash) { dash.hidden = view !== 'dash'; }
    STEP_IDS.forEach(function (id) { var sct = U.el(id); if (sct) { sct.hidden = view === 'dash'; } });
    var link = doc.querySelector('.steps a[data-view="dash"]');
    if (link) {
      link.classList.toggle('on', view === 'dash');
      if (view === 'dash') { link.setAttribute('aria-current', 'page'); } else { link.removeAttribute('aria-current'); }
    }
    if (view === 'dash') {
      Array.prototype.forEach.call(doc.querySelectorAll('.steps a[data-step]'), function (a) { a.classList.remove('on'); a.removeAttribute('aria-current'); });
      flush(); renderDash();
      if (opts.scroll !== false && dash) {
        var top = dash.getBoundingClientRect().top + (root.pageYOffset || 0) - 130;
        try { root.scrollTo({ top: Math.max(top, 0), behavior: 'auto' }); } catch (e) { root.scrollTo(0, Math.max(top, 0)); }
      }
      if (opts.focus) { var hd = U.el('dash-h'); if (hd) { hd.setAttribute('tabindex', '-1'); try { hd.focus({ preventScroll: true }); } catch (e2) { hd.focus(); } } }
    }
  }
  function pastYears() {
    var D = NS.dashboard; if (!D) { return []; }
    var key = recVer + '|' + (state.hotel.name || '').trim().toLocaleLowerCase('tr') + '|' + state.hotel.year;
    if (histCache.key !== key) { histCache = { key: key, list: records.length ? D.history(records, state) : [] }; }
    if (histCache.list.length) { return histCache.list; }
    if (isSample()) {
      if (!sampleHist || sampleHist.year !== state.hotel.year) {
        var ex = M.exampleState(); ex.hotel.year = state.hotel.year;
        ex.hotel.name = state.hotel.name;                       // Türkçe ya da İngilizce örnek adı
        sampleHist = { year: state.hotel.year, list: D.history(D.sampleRecords(ex), state, { sample: true }) };
      }
      return sampleHist.list;
    }
    return [];
  }
  function renderDash() {
    var host = U.el('panel-dash');
    if (!host || !NS.dashboard || !NS.dashView || !R) { return; }
    dashDirty = false;
    NS.dashView.render(host, NS.dashboard.model(state, R, pastYears(), { sample: isSample() }), { account: account });
  }
  function toggleMeasure(id, on) {
    var order = root.MEASURES.order, set = {};
    if (order.indexOf(id) < 0) { return; }
    state.hotel.measures.forEach(function (k) { set[k] = true; });
    if (on) { set[id] = true; } else { delete set[id]; }
    state.hotel.measures = order.filter(function (k) { return set[k]; });
    F.fill(); compute();
    U.toast(on ? 'Plana eklendi' : 'Plandan çıkarıldı');
  }
  function dashAction(act, id) {
    if (act === 'add' || act === 'remove') { toggleMeasure(id, act === 'add'); return; }
    if (act === 'report') { openReport('report'); return; }
    if (act === 'summary') { openReport('summary'); return; }
    if (act === 'field') { goTo(id); return; }
    if (act === 'claims') {
      setView('steps', { scroll: false });
      var c = U.el('claims_note'); if (c) { c.scrollIntoView({ block: 'center' }); c.setAttribute('tabindex', '-1'); try { c.focus({ preventScroll: true }); } catch (e) { c.focus(); } }
      return;
    }
    if (act === 'step') {
      setView('steps', { scroll: false });
      var t = U.el(id); if (t) { t.scrollIntoView({ block: 'start' }); var hh = t.querySelector('h2'); if (hh) { hh.setAttribute('tabindex', '-1'); try { hh.focus({ preventScroll: true }); } catch (e3) { hh.focus(); } } }
    }
  }

  // ------------------------------------------------------------------ adım şeridi
  function bindSteps() {
    var links = Array.prototype.slice.call(doc.querySelectorAll('.steps a[data-step]'));
    if (!('IntersectionObserver' in root) || !links.length) { return; }
    var current = null;
    var io = new root.IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { current = e.target.id; } });
      links.forEach(function (a) {
        var on = a.getAttribute('data-step') === current;
        a.classList.toggle('on', on);
        if (on) { a.setAttribute('aria-current', 'step'); } else { a.removeAttribute('aria-current'); }
      });
    }, { rootMargin: '-140px 0px -55% 0px', threshold: 0 });
    links.forEach(function (a) { var s = U.el(a.getAttribute('data-step')); if (s) { io.observe(s); } });
  }

  // ------------------------------------------------------------------ dış arayüz (cloud.js)
  function summary() {
    flush();
    if (state.mode === 'acente') {
      return { type: 'agency', total: A ? A.totalKg : 0, label: 'Acente / tur operatörü', name: '' };
    }
    var ok = R && R.started && R.usable;
    return {
      type: 'hotel', label: 'Otel (HCMI v2.0)', name: (state.hotel.name || '').trim(),
      total: ok ? R.totals.hcmiT * 1000 : 0,
      cpor: ok && isNum(R.metrics.cpor) ? Math.round(R.metrics.cpor * 100) / 100 : null,
      grade: ok && R.bench.grade.letter !== '—' ? R.bench.grade.letter : null,
      year: isNum(state.hotel.year) ? state.hotel.year : null,
      hcmi: ok ? X.exportObject(state, R) : null
    };
  }
  function apply(obj) {
    var r = M.load(obj);
    var keep = state.options.saveLocal;
    state = r.state; state.options.saveLocal = keep;
    F.renderAll(); setMode(state.mode); compute();
    return { notes: r.notes, legacy: r.legacy };
  }

  // ------------------------------------------------------------------ başlat
  function init() {
    U = NS.ui; M = NS.model; F = NS.form; RN = NS.render; S = NS.storage; X = NS.texts;
    var saved = S.load();
    state = saved ? saved.state : M.emptyState();
    F.init({ state: function () { return state; }, changed: changed });
    RN.methodology();
    bindTabs(); bindSteps(); bindLogo(); bindGate();
    doc.body.classList.toggle('gated', gated());
    defaultNotice('otel'); defaultNotice('acente');
    (U.el('app') || doc.body).addEventListener('click', onAppClick);
    // Dil değişince (i18n.js): sayıları yeni yazımla yeniden çiz; metinleri i18n katmanı çevirir
    doc.addEventListener('turizm:lang', function () {
      // Örnek tesisin adı da dile uyar (Örnek Tatil Köyü ⇄ Sample Resort); başka adlara dokunulmaz
      if (isSample() && M.SAMPLE_NAMES) { state.hotel.name = M.SAMPLE_NAMES[NS.i18n && NS.i18n.lang() === 'en' ? 'en' : 'tr']; }
      F.renderAll(); RN.methodology(); histCache.key = null; compute();
      if (view === 'dash') { renderDash(); } else { dashDirty = true; }
    });
    var resizeTimer = null;
    root.addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(function () { if (R) { NS.chart.draw(R.path, { svg: 'pathsvg', box: 'pathbox', tip: 'pathtip', empty: 'path_empty' }); } }, 150); });
    setMode(state.mode);
    compute();
    var hash = (root.location && root.location.hash) || '';
    if (hash === '#panel' || (saved && R && R.started && R.usable && !/^#adim/.test(hash))) { setView('dash', { scroll: false }); }
    if (saved) {
      var parts = [{ b: 'Bu tarayıcıda sakladığınız veriler yüklendi.' }];
      if (saved.from === 'v1') { parts.push(' Önceki sürümden yeni yönteme aktarıldı.'); }
      parts.push(' Saklamayı kapatmak için Adım 5\'teki kutunun işaretini kaldırın.');
      if (saved.notes && saved.notes.length) { parts.push({ list: saved.notes }); }
      U.notice('h_notice', parts); noticeKind.otel = 'other';
    }
    root.__tour = {
      version: M.APP_VERSION,
      collect: function () { flush(); var c = M.clone(state); delete c.options; return c; },
      apply: apply,
      isEmpty: function () { return M.isEmpty(state); },
      summary: summary,
      mode: function () { return state.mode; },
      setMode: function (m) { setMode(m); },
      toast: function (msg) { U.toast(msg); },
      notice: function (which, parts, tone) {
        var ag = which === 'agency' || which === 'acente'; noticeKind[ag ? 'acente' : 'otel'] = 'other';
        U.notice(ag ? 'a_notice' : 'h_notice', parts, tone);
      },
      state: function () { return state; },
      result: function () { flush(); return R; },
      // panel: hesaba kayıtlı kayıtlar (cloud.js) ve hesap durumu
      setHistory: function (list) { records = Array.isArray(list) ? list : []; recVer++; histCache.key = null; if (view === 'dash') { renderDash(); } else { dashDirty = true; } },
      setAccount: setAccount,                                   // 'user' | 'guest' | 'offline' (üyelik modülü yok)
      account: function () { return account; },
      setView: function (v) { setView(v, { scroll: false }); },
      view: function () { return view; }
    };
    try { root.dispatchEvent(new root.CustomEvent('turizm:ready')); } catch (e) { /* yok */ }
  }

  NS.app = { init: init, compute: compute, flush: flush };
  if (doc.readyState === 'loading') { doc.addEventListener('DOMContentLoaded', init); } else { init(); }
})(typeof globalThis !== 'undefined' ? globalThis : self);
