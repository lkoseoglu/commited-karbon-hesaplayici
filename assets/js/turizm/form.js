/* =========================================================================
   Turizm hesaplayıcısı — FORM  (assets/js/turizm/form.js)
   -------------------------------------------------------------------------
   Ekrandaki alanları durum nesnesine bağlar. Kural basittir:
     <input data-bind="hotel.area.rooms" data-type="num">  →  state.hotel.area.rooms
   data-type: text | select | bool | radio | year | int | num | factor
     num/int/factor Türkçe yazımla okunur (1.480.000 · 12,5), alandan çıkınca biçimlenir.
     Okunamayan değer kırmızıyla işaretlenir ve hesaba BOŞ olarak girer (sessiz tahmin yok).
   Dinamik listeler (enerji defteri, YEK-G belgeleri, soğutucu gazlar, çamaşırhane enerjisi)
   burada çizilir; yapı değişince (satır ekle/sil, tür/birim değiştir) yeniden çizilir.
   Olaylar tek noktadan (olay devri) dinlenir; satırlar yeniden çizilse de bağ kopmaz.

   init({ state:()=>durum, changed:(yol, tür)=>void })
   Dışa: globalThis.TURIZM.form
   ========================================================================= */
(function (root) {
  'use strict';

  var NS = root.TURIZM = root.TURIZM || {};
  var doc = root.document;
  var U = null, M = null, api = null;
  var openRows = {};                       // ayrıntıları açık enerji satırları (yeniden çizimde korunur)

  var KIND = { num: 'amount', int: 'amount', factor: 'factor' };
  var QUICK = {
    grid: 'Şebeke elektriği', natural_gas: 'Doğal gaz', lpg: 'LPG', diesel_stat: 'Jeneratör / kazan motorini',
    fuel_oil_2: 'Fuel-oil (kalorifer)', diesel_mob: 'Araç motorini', gasoline_mob: 'Araç benzini',
    onsite_renew: 'GES öz tüketim', hot_water: 'Bölgesel ısıtma', ppa: 'PPA elektrik'
  };
  var QUICK_ORDER = ['grid', 'natural_gas', 'lpg', 'diesel_stat', 'fuel_oil_2', 'diesel_mob', 'gasoline_mob', 'onsite_renew', 'hot_water', 'ppa'];
  var MEASURE_GROUPS = [['verimlilik', 'Enerji verimliliği'], ['yenilenebilir', 'Yenilenebilir enerji ve elektrifikasyon'],
                        ['ulaşım', 'Ulaşım'], ['su-atık-gaz', 'Su, atık ve soğutucu gazlar']];
  var HEAT_GROUPS = { gas: 1, liquid: 1, solid: 1 };

  function st() { return api.state(); }
  function typeById(id) { return root.HCMI_DATA.energyTypes.filter(function (t) { return t.id === id; })[0] || null; }
  function isHeating(r) {
    if (r.heating === true || r.heating === false) { return r.heating; }
    return (root.MEASURES.heatingDefault || []).indexOf(r.typeId) >= 0;
  }

  // ------------------------------------------------------------------ okuma / gösterme
  function parseFor(input) {
    var type = input.getAttribute('data-type'), raw = input.value;
    if (type === 'text') { return { ok: true, value: raw }; }
    if (type === 'year') {
      var t = String(raw).trim();
      if (t === '') { return { ok: true, value: null }; }
      if (!/^\d{4}$/.test(t)) { return { ok: false, msg: '4 haneli bir yıl yazın, örn. 2025' }; }
      var y = +t;
      if (y < 1990 || y > 2100) { return { ok: false, msg: '1990 ile 2100 arasında bir yıl yazın' }; }
      return { ok: true, value: y };
    }
    var v = root.NUM.parse(raw, { kind: KIND[type] || 'amount' });
    if (v === null) { return { ok: true, value: null }; }
    if (typeof v !== 'number' || isNaN(v)) { return { ok: false, msg: 'Sayı yazın, örn. 1.480.000 veya 12,5' }; }
    var min = input.getAttribute('data-min'), max = input.getAttribute('data-max');
    if (min !== null && v < +min) { return { ok: false, msg: +min === 0 ? 'Negatif olamaz' : 'En az ' + root.NUM.format(+min, 2) + ' olabilir' }; }
    if (max !== null && v > +max) { return { ok: false, msg: 'En fazla ' + root.NUM.format(+max, 2) + ' olabilir' }; }
    if (type === 'int') { v = Math.round(v); }
    return { ok: true, value: v };
  }
  function display(type, v, input) {
    if (v === null || v === undefined) { return ''; }
    if (type === 'text' || type === 'select' || type === 'year') { return String(v); }
    if (typeof v !== 'number' || !isFinite(v)) { return ''; }
    var d = input && input.getAttribute('data-digits');
    if (type === 'int') { return root.NUM.format(v, 0); }
    if (type === 'factor') { return root.NUM.format(v, d ? +d : 6); }
    return root.NUM.format(v, d ? +d : 2);
  }

  function describedBy(input, id, on) {
    var list = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean).filter(function (x) { return x !== id; });
    if (on) { list.push(id); }
    if (list.length) { input.setAttribute('aria-describedby', list.join(' ')); } else { input.removeAttribute('aria-describedby'); }
  }
  function markInvalid(input, msg) {
    if (!input.id) { return; }
    var id = input.id + '-err', e = doc.getElementById(id);
    if (msg) {
      input.setAttribute('aria-invalid', 'true');
      if (!e) {
        e = U.h('span', { class: 'ferr', id: id });
        var anchor = input.closest('.inwrap') || input;
        anchor.parentNode.insertBefore(e, anchor.nextSibling);
      }
      e.textContent = msg;
      describedBy(input, id, true);
    } else {
      input.removeAttribute('aria-invalid');
      if (e) { e.parentNode.removeChild(e); }
      describedBy(input, id, false);
    }
  }

  // ------------------------------------------------------------------ olaylar
  function onInput(ev) {
    var t = ev.target;
    if (!t.matches || !t.matches('input[data-bind]')) { return; }
    var type = t.getAttribute('data-type');
    if (type === 'bool' || type === 'radio') { return; }
    var r = parseFor(t);
    markInvalid(t, r.ok ? null : r.msg);
    var path = t.getAttribute('data-bind');
    M.setPath(st(), path, r.ok ? r.value : null);
    api.changed(path, 'input');
  }

  function onBlur(ev) {
    var t = ev.target;
    if (!t.matches || !t.matches('input[data-bind]')) { return; }
    var type = t.getAttribute('data-type');
    if (type === 'text') {
      var tv = t.value.trim();
      if (tv !== t.value) { t.value = tv; M.setPath(st(), t.getAttribute('data-bind'), tv); api.changed(t.getAttribute('data-bind'), 'change'); }
      return;
    }
    if (type === 'bool' || type === 'radio') { return; }
    var r = parseFor(t);
    if (r.ok) { t.value = display(type, r.value, t); markInvalid(t, null); }
  }

  function onChange(ev) {
    var t = ev.target, s = st(), i;
    if (t.hasAttribute('data-row-type')) {
      i = +t.getAttribute('data-row-type');
      var row = s.hotel.energy[i]; if (!row) { return; }
      M.setRowType(row, t.value);
      renderLedger(); focusId('et-' + row.id); api.changed('hotel.energy.' + i + '.typeId', 'structure'); return;
    }
    if (t.hasAttribute('data-row-unit')) {
      i = +t.getAttribute('data-row-unit');
      var r2 = s.hotel.energy[i]; if (!r2) { return; }
      M.setRowUnit(r2, t.value);
      renderLedger(); focusId('eu-' + r2.id); api.changed('hotel.energy.' + i + '.unit', 'structure'); return;
    }
    if (t.hasAttribute('data-heating')) {
      i = +t.getAttribute('data-heating');
      if (s.hotel.energy[i]) { s.hotel.energy[i].heating = !!t.checked; api.changed('hotel.energy.' + i + '.heating', 'change'); }
      return;
    }
    if (t.hasAttribute('data-measure')) {
      var id = t.getAttribute('data-measure'), order = root.MEASURES.order;
      var set = {}; s.hotel.measures.forEach(function (k) { set[k] = true; });
      if (t.checked) { set[id] = true; } else { delete set[id]; }
      s.hotel.measures = order.filter(function (k) { return set[k]; });
      api.changed('hotel.measures', 'change'); return;
    }
    if (t.hasAttribute('data-tax')) {
      var k = t.getAttribute('data-tax');
      if (t.checked) { s.hotel.taxonomy[k] = true; } else { delete s.hotel.taxonomy[k]; }
      api.changed('hotel.taxonomy', 'change'); return;
    }
    if (t.hasAttribute('data-laundry-type')) {
      i = +t.getAttribute('data-laundry-type');
      if (s.hotel.laundry.items[i]) { M.setLaundryItemType(s.hotel.laundry.items[i], t.value); renderLaundry(); focusId('lt-' + i); api.changed('hotel.laundry.items', 'structure'); }
      return;
    }
    if (t.hasAttribute('data-laundry-unit')) {
      i = +t.getAttribute('data-laundry-unit');
      if (s.hotel.laundry.items[i]) { M.setLaundryItemUnit(s.hotel.laundry.items[i], t.value); renderLaundry(); focusId('lu-' + i); api.changed('hotel.laundry.items', 'structure'); }
      return;
    }
    if (t.id === 'add_type') {
      var v = t.value; if (!v) { return; }
      var nr = M.addEnergyRow(s, v);
      renderLedger();
      if (nr) { focusId('ea-' + nr.id); api.changed('hotel.energy', 'structure'); }
      return;
    }
    if (!t.matches('[data-bind]')) { return; }
    var type = t.getAttribute('data-type'), path = t.getAttribute('data-bind'), val;
    if (type === 'bool') { val = !!t.checked; }
    else if (type === 'radio') { if (!t.checked) { return; } val = t.value; }
    else if (type === 'select') { val = t.value; }
    else { return; }                       // metin alanları "input" olayında işlenir
    M.setPath(s, path, val);
    api.changed(path, 'change');
  }

  function onClick(ev) {
    var b = ev.target.closest ? ev.target.closest('button') : null;
    if (!b) { return; }
    var s = st(), i;
    if (b.hasAttribute('data-row-del')) {
      i = +b.getAttribute('data-row-del');
      var removed = s.hotel.energy.splice(i, 1)[0];
      if (removed) { delete openRows[removed.id]; }
      renderLedger();
      var next = s.hotel.energy[i] || s.hotel.energy[i - 1];
      focusId(next ? 'ed-del-' + next.id : 'add_type');
      api.changed('hotel.energy', 'structure');
      U.toast((removed ? M.typeLabel(removed.typeId) : 'Satır') + ' silindi');
      return;
    }
    if (b.hasAttribute('data-row-more')) {
      var rid = b.getAttribute('data-row-more'), panel = doc.getElementById('ed-' + rid);
      if (!panel) { return; }
      panel.hidden = !panel.hidden; openRows[rid] = !panel.hidden;
      b.setAttribute('aria-expanded', String(!panel.hidden));
      return;
    }
    if (b.hasAttribute('data-quick')) {
      var nr = M.addEnergyRow(s, b.getAttribute('data-quick'));
      renderLedger();
      if (nr) { focusId('ea-' + nr.id); api.changed('hotel.energy', 'structure'); }
      return;
    }
    if (b.id === 'add_market') { if (M.addMarket(s)) { renderMarket(); focusId('mk-k-' + (s.hotel.market.length - 1)); api.changed('hotel.market', 'structure'); } return; }
    if (b.hasAttribute('data-del-market')) { s.hotel.market.splice(+b.getAttribute('data-del-market'), 1); renderMarket(); focusId('add_market'); api.changed('hotel.market', 'structure'); return; }
    if (b.id === 'add_ref') { if (M.addRefrigerant(s)) { renderRefs(); focusId('rk-' + (s.hotel.refrigerants.items.length - 1)); api.changed('hotel.refrigerants', 'structure'); } return; }
    if (b.hasAttribute('data-del-ref')) { s.hotel.refrigerants.items.splice(+b.getAttribute('data-del-ref'), 1); renderRefs(); focusId('add_ref'); api.changed('hotel.refrigerants', 'structure'); return; }
    if (b.id === 'add_laundry') { if (M.addLaundryItem(s, 'grid')) { renderLaundry(); focusId('lk-' + (s.hotel.laundry.items.length - 1)); api.changed('hotel.laundry.items', 'structure'); } return; }
    if (b.hasAttribute('data-del-laundry')) { s.hotel.laundry.items.splice(+b.getAttribute('data-del-laundry'), 1); renderLaundry(); focusId('add_laundry'); api.changed('hotel.laundry.items', 'structure'); }
  }

  function focusId(id) {
    var e = doc.getElementById(id);
    if (e && !e.hidden) { try { e.focus({ preventScroll: false }); } catch (x) { e.focus(); } }
  }

  // ------------------------------------------------------------------ küçük kurucular
  function input(attrs, value) {
    var a = Object.assign({ type: 'text', autocomplete: 'off', spellcheck: 'false' }, attrs);
    if (a['data-type'] !== 'text' && !a.inputmode) { a.inputmode = 'decimal'; }
    var e = U.h('input', a);
    e.value = display(a['data-type'], value, e);
    return e;
  }
  function field(labelText, forId, control, unitText, extraClass) {
    var wrapKids = [control];
    if (unitText) { wrapKids.push(U.h('span', { class: 'unit', text: unitText })); }
    return U.h('div', { class: 'f' + (extraClass ? ' ' + extraClass : '') }, [
      U.h('label', { for: forId, text: labelText }),
      U.h('div', { class: 'inwrap' }, wrapKids)
    ]);
  }
  function options(sel, list, value) {
    U.clear(sel);
    list.forEach(function (o) { sel.appendChild(U.h('option', { value: o.value, text: o.label, selected: String(o.value) === String(value) })); });
    if (value !== undefined && value !== null) { sel.value = String(value); }
  }

  // ------------------------------------------------------------------ enerji defteri
  function typeSelect(r, i, used) {
    var sel = U.h('select', { id: 'et-' + r.id, 'data-row-type': String(i), 'aria-label': 'Satır ' + (i + 1) + ': enerji kaynağı' });
    M.energyTypeGroups().forEach(function (g) {
      var og = U.h('optgroup', { label: g.label });
      g.options.forEach(function (o) {
        og.appendChild(U.h('option', { value: o.value, text: o.label, selected: o.value === r.typeId, disabled: !!used[o.value] && o.value !== r.typeId }));
      });
      sel.appendChild(og);
    });
    sel.value = r.typeId;
    return sel;
  }

  function ledgerRow(r, i, used) {
    var id = r.id, p = 'hotel.energy.' + i + '.', name = M.typeLabel(r.typeId), t = typeById(r.typeId);
    var unitName = M.unitShort(r.unit);
    var unitSel = U.h('select', { id: 'eu-' + id, 'data-row-unit': String(i), 'aria-label': name + ' — birim' });
    options(unitSel, M.unitOptions(r.typeId), r.unit);
    var amt = input({ id: 'ea-' + id, 'data-bind': p + 'total', 'data-type': 'num', 'data-min': '0', 'aria-label': name + ' — yıllık miktar (' + unitName + ')', placeholder: '0' }, r.total);
    var price = input({ id: 'ep-' + id, 'data-bind': p + 'price', 'data-type': 'num', 'data-min': '0', 'data-digits': '4', 'aria-label': name + ' — birim fiyat, TL / ' + unitName, placeholder: '—' }, r.price);
    var isOpen = !!openRows[id];

    // ayrıntılar
    var hint = root.TR_REFERENCE ? root.TR_REFERENCE.hint(r.typeId) : '';
    var efName = 'efm-' + id;
    var efManual = input({ id: 'ef-' + id, 'data-bind': p + 'manualEf', 'data-type': 'factor', 'data-min': '0', placeholder: 'ör. 0,25' }, r.manualEf);
    var more = U.h('div', { class: 'c-more', id: 'ed-' + id, hidden: !isOpen }, [
      hint ? U.h('p', { class: 'mini', text: hint }) : null,
      U.h('div', { class: 'radios inline', role: 'radiogroup', 'aria-label': name + ' — emisyon faktörü' }, [
        U.h('label', { class: 'opt sm' }, [
          U.h('input', { type: 'radio', name: efName, value: 'default', 'data-bind': p + 'efMode', 'data-type': 'radio', checked: r.efMode !== 'manual' }),
          U.h('span', {}, [U.h('b', { text: 'Varsayılan faktör' }), U.h('small', { id: 'efd-' + id, text: '—' })])
        ]),
        U.h('label', { class: 'opt sm' }, [
          U.h('input', { type: 'radio', name: efName, value: 'manual', 'data-bind': p + 'efMode', 'data-type': 'radio', checked: r.efMode === 'manual' }),
          U.h('span', {}, [U.h('b', { text: 'Kendi faktörüm' }), U.h('small', { text: 'Tedarikçinizin bildirdiği değer' })])
        ])
      ]),
      U.h('div', { class: 'grid tight' }, [
        field('Emisyon faktörü', 'ef-' + id, efManual, 'kgCO₂e/kWh', 'ef-manual'),
        field('Özel alanların tüketimi', 'pa-' + id,
          input({ id: 'pa-' + id, 'data-bind': p + 'privateActual', 'data-type': 'num', 'data-min': '0' }, r.privateActual), unitName, 'c-private')
      ]),
      (t && t.stationary && HEAT_GROUPS[t.group]) ? U.h('label', { class: 'chk sm' }, [
        U.h('input', { type: 'checkbox', 'data-heating': String(i), checked: isHeating(r) }),
        U.h('span', { text: 'Isıtma ve sıcak suda kullanılıyor (ısıtma önlemleri bu yakıtı da azaltır)' })
      ]) : null
    ]);

    return U.h('div', { class: 'lrow', id: 'row-' + id, 'data-row': String(i), 'data-type-id': r.typeId }, [
      U.h('div', { class: 'c-type' }, [U.h('div', { class: 'inwrap' }, [typeSelect(r, i, used)])]),
      U.h('div', { class: 'c-amt' }, [U.h('div', { class: 'inwrap' }, [amt])]),
      U.h('div', { class: 'c-unit' }, [U.h('div', { class: 'inwrap' }, [unitSel])]),
      U.h('div', { class: 'c-price' }, [U.h('div', { class: 'inwrap' }, [price, U.h('span', { class: 'unit', text: 'TL/' + unitName })])]),
      U.h('div', { class: 'c-out' }, [
        U.h('output', { id: 'eo-' + id, for: 'ea-' + id, 'aria-live': 'off', text: '—' }),
        U.h('span', { class: 'wbar', 'aria-hidden': 'true' }, [U.h('i', { id: 'ew-' + id })])
      ]),
      U.h('div', { class: 'c-act' }, [
        U.h('button', { type: 'button', class: 'ibtn more', 'data-row-more': id, 'aria-expanded': String(isOpen), 'aria-controls': 'ed-' + id, title: 'Ayrıntılar', 'aria-label': name + ' — ayrıntılar' }, [U.h('span', { 'aria-hidden': 'true', text: '⋯' })]),
        U.h('button', { type: 'button', class: 'ibtn del', id: 'ed-del-' + id, 'data-row-del': String(i), title: 'Satırı sil', 'aria-label': name + ' satırını sil' }, [U.h('span', { 'aria-hidden': 'true', text: '×' })])
      ]),
      more,
      U.h('p', { class: 'row-msg', id: 'em-' + id, hidden: true })
    ]);
  }

  function renderAddControls(used) {
    var chips = U.el('quick_add'); U.clear(chips);
    QUICK_ORDER.forEach(function (k) {
      if (!used[k]) { chips.appendChild(U.h('button', { type: 'button', class: 'chip', 'data-quick': k, text: '+ ' + QUICK[k] })); }
    });
    var sel = U.el('add_type'); U.clear(sel);
    sel.appendChild(U.h('option', { value: '', text: '+ Başka enerji kaynağı ekle…' }));
    M.energyTypeGroups().forEach(function (g) {
      var og = U.h('optgroup', { label: g.label });
      g.options.forEach(function (o) { if (!used[o.value]) { og.appendChild(U.h('option', { value: o.value, text: o.label })); } });
      if (og.children.length) { sel.appendChild(og); }
    });
    sel.value = '';
    var full = st().hotel.energy.length >= M.LIMITS.energyRows;
    sel.disabled = full; chips.hidden = full;
  }

  function renderLedger() {
    var s = st(), host = U.el('ledger_rows');
    U.clear(host);
    var used = {}; s.hotel.energy.forEach(function (r) { used[r.typeId] = true; });
    s.hotel.energy.forEach(function (r, i) { host.appendChild(ledgerRow(r, i, used)); });
    U.show('ledger_empty', !s.hotel.energy.length);
    renderAddControls(used);
  }

  // ------------------------------------------------------------------ diğer listeler
  function delBtn(attr, i, label) {
    var a = { type: 'button', class: 'ibtn del', title: label, 'aria-label': label };
    a[attr] = String(i);
    return U.h('button', a, [U.h('span', { 'aria-hidden': 'true', text: '×' })]);
  }

  function renderMarket() {
    var s = st(), host = U.el('market_rows'); U.clear(host);
    s.hotel.market.forEach(function (m, i) {
      host.appendChild(U.h('div', { class: 'lrow2' }, [
        field('Açıklama', 'mk-d-' + i, input({ id: 'mk-d-' + i, 'data-bind': 'hotel.market.' + i + '.description', 'data-type': 'text', maxlength: '80', placeholder: 'ör. YEK-G 2025' }, m.description)),
        field('Belgeyle karşılanan elektrik', 'mk-k-' + i, input({ id: 'mk-k-' + i, 'data-bind': 'hotel.market.' + i + '.kwh', 'data-type': 'num', 'data-min': '0', placeholder: 'ör. 500.000' }, m.kwh), 'kWh'),
        delBtn('data-del-market', i, 'Belgeyi sil')
      ]));
    });
    U.el('add_market').hidden = s.hotel.market.length >= M.LIMITS.marketRows;
  }

  function renderRefs() {
    var s = st(), host = U.el('ref_rows'); U.clear(host);
    var opts = M.refrigerantOptions();
    s.hotel.refrigerants.items.forEach(function (it, i) {
      var sel = U.h('select', { id: 'rg-' + i, 'data-bind': 'hotel.refrigerants.items.' + i + '.rfId', 'data-type': 'select' });
      var common = U.h('optgroup', { label: 'Sık kullanılanlar' }), rest = U.h('optgroup', { label: 'Diğer (HCMI listesi)' });
      opts.forEach(function (o) { (o.common ? common : rest).appendChild(U.h('option', { value: o.value, text: o.label, selected: o.value === it.rfId })); });
      sel.appendChild(common); sel.appendChild(rest); sel.value = it.rfId;
      host.appendChild(U.h('div', { class: 'lrow2' }, [
        field('Gaz', 'rg-' + i, sel),
        field('Yıllık dolum', 'rk-' + i, input({ id: 'rk-' + i, 'data-bind': 'hotel.refrigerants.items.' + i + '.kg', 'data-type': 'num', 'data-min': '0', placeholder: 'ör. 11' }, it.kg), 'kg'),
        delBtn('data-del-ref', i, 'Gazı sil')
      ]));
    });
    U.el('add_ref').hidden = s.hotel.refrigerants.items.length >= M.LIMITS.refrigerantRows;
  }

  function renderLaundry() {
    var s = st(), host = U.el('laundry_rows'); U.clear(host);
    s.hotel.laundry.items.forEach(function (it, i) {
      var sel = U.h('select', { id: 'lt-' + i, 'data-laundry-type': String(i) });
      M.energyTypeGroups().forEach(function (g) {
        if (g.group === 'mobile') { return; }
        var og = U.h('optgroup', { label: g.label });
        g.options.forEach(function (o) { og.appendChild(U.h('option', { value: o.value, text: o.label, selected: o.value === it.typeId })); });
        sel.appendChild(og);
      });
      sel.value = it.typeId;
      var us = U.h('select', { id: 'lu-' + i, 'data-laundry-unit': String(i) });
      options(us, M.unitOptions(it.typeId), it.unit);
      host.appendChild(U.h('div', { class: 'lrow2 l3' }, [
        field('Enerji türü', 'lt-' + i, sel),
        field('Bize düşen miktar', 'lk-' + i, input({ id: 'lk-' + i, 'data-bind': 'hotel.laundry.items.' + i + '.total', 'data-type': 'num', 'data-min': '0' }, it.total)),
        field('Birim', 'lu-' + i, us),
        delBtn('data-del-laundry', i, 'Satırı sil')
      ]));
    });
    U.el('add_laundry').hidden = s.hotel.laundry.items.length >= M.LIMITS.laundryItems;
  }

  function renderSplit() {
    var host = U.el('a_split_rows'); if (!host) { return; }
    U.clear(host);
    M.AGENCY_SEG_IDS.forEach(function (k) {
      var tr = NS.agency.SEG_TR[k], a = st().agency.splitRows[k];
      host.appendChild(U.h('tr', {}, [
        U.h('th', { scope: 'row', text: tr }),
        U.h('td', { class: 'ip' }, [input({ id: 'a_n_' + k, class: 'tin', 'data-bind': 'agency.splitRows.' + k + '.n', 'data-type': 'int', 'data-min': '0', 'aria-label': tr + ' oda-gece', placeholder: '0' }, a.n)]),
        U.h('td', { class: 'ip' }, [input({ id: 'a_c_' + k, class: 'tin', 'data-bind': 'agency.splitRows.' + k + '.c', 'data-type': 'num', 'data-min': '0', 'aria-label': tr + ' katsayı' }, a.c)]),
        U.h('td', { id: 'as_' + k, text: '—' })
      ]));
    });
  }

  // ------------------------------------------------------------------ bir kez kurulanlar
  function renderMeasures() {
    var host = U.el('measures'); if (!host) { return; }
    U.clear(host);
    var list = root.MEASURES.list;
    MEASURE_GROUPS.forEach(function (g) {
      var items = list.filter(function (m) { return m.group === g[0]; });
      if (!items.length) { return; }
      var box = U.h('fieldset', { class: 'fs' }, [U.h('legend', { text: g[1] })]);
      var checks = U.h('div', { class: 'checks' });
      items.forEach(function (m) {
        checks.appendChild(U.h('label', { class: 'chk mchk', id: 'mrow_' + m.id }, [
          U.h('input', { type: 'checkbox', 'data-measure': m.id, id: 'm_' + m.id }),
          U.h('span', {}, [U.h('b', { text: m.tr }), U.h('small', { text: m.note })]),
          U.h('span', { class: 'w', id: 'mw_' + m.id, text: '—' })
        ]));
        if (m.id === 'pv') {
          checks.appendChild(U.h('div', { class: 'grid sub-params' }, [
            field('GES kurulu gücü', 'h_pv_kwp', input({ id: 'h_pv_kwp', 'data-bind': 'hotel.pv.kwp', 'data-type': 'num', 'data-min': '0', placeholder: 'ör. 250' }, null), 'kWp'),
            field('GES birim yatırım', 'h_pv_cost', input({ id: 'h_pv_cost', 'data-bind': 'hotel.pv.costTlPerKwp', 'data-type': 'num', 'data-min': '0' }, null), 'TL/kWp')
          ]));
        }
      });
      box.appendChild(checks);
      host.appendChild(box);
    });
  }

  function renderTaxonomy() {
    var host = U.el('tax_checks'); if (!host) { return; }
    U.clear(host);
    M.TAXONOMY.forEach(function (t) {
      host.appendChild(U.h('label', { class: 'chk' }, [
        U.h('input', { type: 'checkbox', 'data-tax': t.id, id: t.id }),
        U.h('span', {}, [U.h('b', { text: t.title }), t.detail ? U.h('small', { text: t.detail }) : null]),
        U.h('span', { class: 'w', text: t.w + ' puan' })
      ]));
    });
  }

  function staticOptions() {
    options(U.el('h_segment'), root.BENCH.segments.map(function (s) { return { value: s.id, label: s.tr }; }), 'resort5');
    options(U.el('h_verify'), Object.keys(M.VERIFY).map(function (k) { return { value: k, label: M.VERIFY[k] }; }), 'none');
    options(U.el('h_country'), M.countryOptions(), 'Turkey');
    renderSplit();
    renderMeasures();
    renderTaxonomy();
  }

  function syncRegions() {
    var s = st(), sel = U.el('h_region'); if (!sel) { return; }
    var regs = M.regionOptions(s.hotel.country);
    options(sel, regs, s.hotel.region);
    U.show('f_region', regs.length > 1);
  }

  // ------------------------------------------------------------------ durum → ekran
  function fill() {
    var s = st(), active = doc.activeElement;
    syncRegions();
    Array.prototype.forEach.call(doc.querySelectorAll('[data-bind]'), function (e) {
      var path = e.getAttribute('data-bind'), type = e.getAttribute('data-type'), v = M.getPath(s, path);
      if (type === 'bool') { e.checked = !!v; return; }
      if (type === 'radio') { e.checked = (e.value === v); return; }
      if (e.tagName === 'SELECT') { if (v !== undefined && v !== null) { e.value = String(v); } return; }
      if (e === active) { return; }                                   // yazılan alana dokunma
      e.value = display(type, v, e);
      markInvalid(e, null);
    });
    Array.prototype.forEach.call(doc.querySelectorAll('[data-measure]'), function (e) { e.checked = s.hotel.measures.indexOf(e.getAttribute('data-measure')) >= 0; });
    Array.prototype.forEach.call(doc.querySelectorAll('[data-tax]'), function (e) { e.checked = !!s.hotel.taxonomy[e.getAttribute('data-tax')]; });
  }

  /** Tüm dinamik listeleri çiz ve değerleri doldur (yükleme, örnek, kayıt açma) */
  function renderAll() {
    renderLedger(); renderMarket(); renderRefs(); renderLaundry(); renderSplit();
    fill();
  }

  function init(opts) {
    U = NS.ui; M = NS.model; api = opts;
    staticOptions();
    var app = U.el('app') || doc.body;
    app.addEventListener('input', onInput);
    app.addEventListener('change', onChange);
    app.addEventListener('focusout', onBlur);
    app.addEventListener('click', onClick);
    renderAll();
  }

  NS.form = { init: init, renderAll: renderAll, renderLedger: renderLedger, fill: fill, syncRegions: syncRegions,
              parseFor: parseFor, display: display, isHeating: isHeating };
})(typeof globalThis !== 'undefined' ? globalThis : self);
