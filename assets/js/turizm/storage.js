/* =========================================================================
   Turizm hesaplayıcısı — TARAYICI BELLEĞİ  (assets/js/turizm/storage.js)
   -------------------------------------------------------------------------
   Kullanıcı "bu tarayıcıda saklansın" kutusunu işaretlerse durum yalnız kendi
   tarayıcısında (localStorage) tutulur; sunucuya gitmez. Kutu kapalıysa kayıt silinir.

   Anahtar  : commited-turizm-v2   (yeni şema, model.js)
   Eski     : commited-hotel-v1    (eski sayfa; yalnız OKUNUR ve aktarılır, silinmez —
                                    eski sayfa canlıyken aynı alan adında onu da kullanıyor)
   Gizli pencere / engellenmiş depolama: her işlem try/catch içinde, sayfa bozulmaz.
   Dışa: globalThis.TURIZM.storage
   ========================================================================= */
(function (root) {
  'use strict';

  var NS = root.TURIZM = root.TURIZM || {};
  var KEY = 'commited-turizm-v2', LEGACY_KEY = 'commited-hotel-v1';

  function store() { try { return root.localStorage || null; } catch (e) { return null; } }

  /** Kutu işaretliyse kaydet, değilse sil. @returns {boolean} işlem yapılabildi mi */
  function save(state) {
    var s = store(); if (!s) { return false; }
    try {
      if (!state || !state.options || !state.options.saveLocal) { s.removeItem(KEY); return true; }
      s.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) { return false; }
  }

  /** @returns {null | {state, notes, legacy, from:'v2'|'v1'}} */
  function load() {
    var s = store(); if (!s) { return null; }
    try {
      var raw = s.getItem(KEY);
      if (raw) { var r = NS.model.load(JSON.parse(raw)); r.from = 'v2'; return r; }
      var old = s.getItem(LEGACY_KEY);
      if (old) {
        var o = JSON.parse(old);
        if (!o || o.opt_save === false) { return null; }
        var r2 = NS.model.load(o); r2.from = 'v1'; r2.state.options.saveLocal = true; return r2;
      }
    } catch (e) { /* bozuk kayıt: yok say */ }
    return null;
  }

  function clear() { var s = store(); if (!s) { return; } try { s.removeItem(KEY); } catch (e) { /* yok */ } }

  NS.storage = { KEY: KEY, LEGACY_KEY: LEGACY_KEY, save: save, load: load, clear: clear };
})(typeof globalThis !== 'undefined' ? globalThis : self);
