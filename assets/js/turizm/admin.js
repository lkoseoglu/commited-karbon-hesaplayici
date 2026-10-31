/* =========================================================================
   Turizm hesaplayıcısı — YÖNETİM PANELİ: VERİ  (assets/js/turizm/admin.js)
   -------------------------------------------------------------------------
   Commited yöneticisinin paneli (turizm-admin.html) için saf hesap katmanı:
     · Firestore'dan gelen üye profilleri (firms/{uid}) ve kayıtlar (reports/{uid}/items)
       → oteller, acenteler, üyeler
     · her otelin SON kaydı (en yeni yıl, aynı yılda en son kaydedilen) bugünkü yöntemle
       yeniden hesaplanır (model.load + compute): listedeki sayılar otelin kendi panelinde
       gördüğüyle aynıdır; eski sürümün kayıtları da aktarılıp hesaplanır
     · özet sayılar, son 12 hafta, kıyas notu dağılımı, satış fırsatları,
       arama / süzme / sıralama, Excel sayfaları
   Yalnız turizm kayıtları (type 'hotel' | 'agency') sayılır; Kapsam 3 kayıtları
   karbon-admin.html'deki "Firma Raporları" sekmesindedir.
   DOM'a dokunmaz; Node'da test edilir (tests/unit/turizm-admin.test.mjs).
   Dışa: globalThis.TURIZM.admin
   ========================================================================= */
(function (root) {
  'use strict';

  var NS = root.TURIZM = root.TURIZM || {};

  /** Yönetici e-postaları: karbon-admin.html'deki ADMIN_EMAILS ile aynı. Asıl koruma firestore.rules → isAdmin(). */
  var ADMIN_EMAILS = ['levent.koseoglu@commited.app', 'commitedapp@gmail.com', 'lkoseoglu@hotmail.com'];
  var SOURCE = 'turizm-karbon-hesaplayici';
  var DAY = 864e5;
  var VERIFY_MIN = 90;                       // doğrulamaya hazır: veri tamlığı en az bu (100 üzerinden)
  var MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  var TYPE_TR = { otel: 'Otel / tatil köyü', pansiyon: 'Butik otel / pansiyon', acente: 'Acente / tur operatörü', diger: 'Diğer' };
  var VERIFY_TR = { none: 'Doğrulanmadı', internal: 'İç inceleme', third: 'Bağımsız doğrulama' };
  var GRADES = ['A', 'B', 'C', 'D', 'E'];

  /** Satış fırsatı etiketleri (listede süzgeç olarak da kullanılır) */
  var TAGS = {
    verify: { label: 'Doğrulamaya hazır', short: 'Doğrulamaya hazır' },
    high: { label: 'Kıyasın üstünde (D ve E)', short: 'D ve E' },
    stale: { label: 'Güncelleme bekliyor', short: 'Güncelleme bekliyor' },
    idle: { label: 'Hesap kaydetmemiş üye', short: 'Hesap kaydetmemiş' }
  };

  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function isAdmin(email) { return !!email && ADMIN_EMAILS.indexOf(String(email).trim().toLowerCase()) >= 0; }
  function key(x) { return String(x === null || x === undefined ? '' : x).trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr'); }
  function sum(rows, f) { return rows.reduce(function (a, r) { var v = r[f]; return a + (isNum(v) ? v : 0); }, 0); }
  function maxOf(list) { var m = null; list.forEach(function (v) { if (isNum(v) && (m === null || v > m)) { m = v; } }); return m; }
  function minOf(list) { var m = null; list.forEach(function (v) { if (isNum(v) && (m === null || v < m)) { m = v; } }); return m; }

  /** Firestore zaman damgası → ms (Timestamp.toMillis, {seconds}, sayı ya da tarih metni) */
  function ms(v) {
    if (v === null || v === undefined) { return null; }
    if (isNum(v)) { return v; }
    if (typeof v === 'string') { var t = Date.parse(v); return isNum(t) ? t : null; }
    if (typeof v.toMillis === 'function') { try { return v.toMillis(); } catch (e) { return null; } }
    if (isNum(v.seconds)) { return v.seconds * 1000 + (isNum(v.nanoseconds) ? Math.floor(v.nanoseconds / 1e6) : 0); }
    return null;
  }
  /** 31.10.2026 */
  function dateTr(t) {
    if (!isNum(t)) { return ''; }
    var d = new Date(t), p = function (x) { return (x < 10 ? '0' : '') + x; };
    return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear();
  }

  // ------------------------------------------------------------------ kayıtlar
  /**
   * items: [{ uid, id, path?, data }] → turizm kayıtları. Kayıttaki inputs bugünkü şemaya aktarılır
   * (eski sürümün alan kimliği haritası dahil); hesap yalnız gerektiğinde yapılır.
   */
  function records(items) {
    var M = NS.model, out = [];
    (items || []).forEach(function (it) {
      if (!it || !it.data || typeof it.data !== 'object') { return; }
      var d = it.data, type = d.type;
      if (type !== 'hotel' && type !== 'agency') { return; }
      var st = null, legacy = false;
      if (d.inputs && typeof d.inputs === 'object') {
        try { var L = M.load(d.inputs); st = L.state; legacy = !!L.legacy; } catch (e) { st = null; }
      }
      var hy = st && isNum(st.hotel.year) ? st.hotel.year : null;
      out.push({
        uid: it.uid || null, id: it.id || null, type: type,
        company: String(d.company || '').trim(), email: String(d.userEmail || '').trim(),
        name: type === 'hotel' ? String((st && st.hotel.name) || d.company || '').trim() : String(d.company || '').trim(),
        year: type === 'hotel' ? (hy !== null ? hy : (isNum(d.year) ? d.year : null)) : null,
        createdAt: ms(d.createdAt),
        total: isNum(d.total) ? d.total : null, cpor: isNum(d.cpor) ? d.cpor : null, grade: d.grade || null,
        appVersion: d.appVersion || null, legacy: legacy, state: st, inputs: d.inputs || null
      });
    });
    return out;
  }
  /** a, b'den daha yeni mi: önce raporlama yılı, aynı yılda kayıt zamanı */
  function newer(a, b) {
    var ya = isNum(a.year) ? a.year : -Infinity, yb = isNum(b.year) ? b.year : -Infinity;
    if (ya !== yb) { return ya > yb; }
    return (a.createdAt || 0) > (b.createdAt || 0);
  }
  function groupBy(list, f) {
    var map = {}, order = [];
    list.forEach(function (x) { var k = f(x); if (!map[k]) { map[k] = []; order.push(k); } map[k].push(x); });
    return order.map(function (k) { return { key: k, list: map[k] }; });
  }

  // ------------------------------------------------------------------ oteller
  function hotelRow(g, firms, expectYear) {
    var list = g.list.slice().sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
    var latest = list.reduce(function (a, r) { return newer(r, a) ? r : a; });
    var st = latest.state, h = st ? st.hotel : null, R = null;
    if (st) { try { R = NS.compute(st); } catch (e) { R = null; } }
    var ok = !!(R && R.started && R.usable);
    var snap = ok ? NS.dashboard.snapshot(st, R) : null;
    var seg = ok && R.bench && R.bench.segment ? R.bench.segment : null;
    var firm = firms[latest.uid] || {};
    var years = list.map(function (r) { return r.year; }).filter(isNum)
      .filter(function (y, i, a) { return a.indexOf(y) === i; }).sort(function (a, b) { return a - b; });
    var row = {
      key: g.key, uid: latest.uid, kind: 'hotel',
      name: (h && h.name) || latest.company || firm.name || 'Adsız tesis',
      city: (h && h.city) || firm.city || '',
      email: latest.email || firm.email || '',
      segmentLabel: seg ? seg.tr : '',
      rooms: h && isNum(h.rooms) ? h.rooms : null,
      year: latest.year, usable: ok,
      cpor: ok ? R.metrics.cpor : latest.cpor,
      grade: ok ? snap.grade : (GRADES.indexOf(latest.grade) >= 0 ? latest.grade : null),
      totalT: ok ? R.totals.hcmiT : (isNum(latest.total) ? latest.total / 1000 : null),
      completeness: R && R.completeness ? R.completeness.score : null,
      scalePos: ok && R.bench && isNum(R.bench.scalePos) ? R.bench.scalePos : null,
      ratio: ok && R.bench ? R.bench.ratio : null,
      verify: h && VERIFY_TR[h.verify] ? h.verify : 'none',
      measures: h && h.measures ? h.measures.length : 0,
      remainingT: ok && R.offsets && isNum(R.offsets.remainingT) ? R.offsets.remainingT : null,
      count: list.length, years: years,
      firstAt: minOf(list.map(function (r) { return r.createdAt; })),
      lastAt: maxOf(list.map(function (r) { return r.createdAt; })),
      legacy: latest.legacy, appVersion: latest.appVersion,
      latestId: latest.id, records: list, tags: []
    };
    if (ok && isNum(row.completeness) && row.completeness >= VERIFY_MIN && row.verify !== 'third') { row.tags.push('verify'); }
    if (row.grade === 'D' || row.grade === 'E') { row.tags.push('high'); }
    if (isNum(row.year) && row.year < expectYear) { row.tags.push('stale'); }
    return row;
  }

  // ------------------------------------------------------------------ acenteler
  function agencyRow(g, firms) {
    var list = g.list.slice().sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
    var latest = list[list.length - 1], firm = firms[latest.uid] || {};
    var a = latest.state ? latest.state.agency : null, A = null;
    if (a) { try { A = NS.agency.compute(a); } catch (e) { A = null; } }
    var ok = !!(A && A.started);
    return {
      key: g.key, uid: latest.uid, kind: 'agency',
      name: latest.company || firm.name || 'Adsız acente',
      city: firm.city || '', email: latest.email || firm.email || '',
      totalT: ok ? A.totalT : (isNum(latest.total) ? latest.total / 1000 : null),
      passengers: a && isNum(a.yolcu) && a.yolcu > 0 ? a.yolcu : null,
      perGuestKg: ok && isNum(A.perGuestKg) ? A.perGuestKg : null,
      count: list.length,
      firstAt: minOf(list.map(function (r) { return r.createdAt; })),
      lastAt: maxOf(list.map(function (r) { return r.createdAt; })),
      records: list, tags: []
    };
  }

  // ------------------------------------------------------------------ üyeler
  /** Turizm üyeleri: profil kaynağı turizm hesaplayıcısı olanlar + turizm kaydı olan herkes */
  function memberRows(firmList, recs) {
    var by = {}, order = [];
    function get(uid) { if (!by[uid]) { by[uid] = { uid: uid, name: '', type: '', city: '', email: '', joinedAt: null, turizm: false, records: 0, hotels: 0, agencies: 0, lastAt: null }; order.push(uid); } return by[uid]; }
    (firmList || []).forEach(function (f) {
      if (!f || !f.uid) { return; }
      var d = f.data || {}, m = get(f.uid);
      m.name = String(d.name || '').trim(); m.type = d.type || ''; m.city = String(d.city || '').trim();
      m.email = String(d.email || '').trim();
      m.joinedAt = ms(d.createdAt) || ms(d.kvkkAcceptedAt) || null;
      m.turizm = d.source === SOURCE;
    });
    recs.forEach(function (r) {
      if (!r.uid) { return; }
      var m = get(r.uid);
      m.turizm = true; m.records++;
      if (r.type === 'hotel') { m.hotels++; } else { m.agencies++; }
      if (isNum(r.createdAt) && (m.lastAt === null || r.createdAt > m.lastAt)) { m.lastAt = r.createdAt; }
      if (!m.email) { m.email = r.email; }
      if (!m.name) { m.name = r.type === 'hotel' ? r.name : r.company; }
      if (!m.type) { m.type = r.type === 'agency' ? 'acente' : 'otel'; }
    });
    // profili olmayan (ya da tarihsiz) üyede üyelik: ilk kaydı
    recs.forEach(function (r) {
      var m = by[r.uid];
      if (m && !isNum(m.joinedAt) && isNum(r.createdAt)) { m.firstRec = isNum(m.firstRec) ? Math.min(m.firstRec, r.createdAt) : r.createdAt; }
    });
    return order.map(function (u) { return by[u]; }).filter(function (m) { return m.turizm; }).map(function (m) {
      var joined = isNum(m.joinedAt) ? m.joinedAt : (isNum(m.firstRec) ? m.firstRec : null);
      return {
        key: m.uid, uid: m.uid, kind: 'member', name: m.name || m.email || 'Adsız üye',
        type: m.type, typeLabel: TYPE_TR[m.type] || '', city: m.city, email: m.email,
        joinedAt: joined, records: m.records, hotels: m.hotels, agencies: m.agencies, lastAt: m.lastAt,
        tags: m.records ? [] : ['idle']
      };
    });
  }

  // ------------------------------------------------------------------ haftalar
  function weekStart(t) {
    var d = new Date(t); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (d.getDay() + 6) % 7);          // pazartesi
    return d;
  }
  /** Son `count` hafta (pazartesi başlar, yerel saat): yeni üye ve kaydedilen hesap sayıları */
  function weeks(members, recs, now, count) {
    count = count || 12;
    var cur = weekStart(now), out = [];
    for (var i = count - 1; i >= 0; i--) {
      var a = new Date(cur.getTime()); a.setDate(a.getDate() - 7 * i);
      var b = new Date(a.getTime()); b.setDate(b.getDate() + 7);
      out.push({ start: a.getTime(), end: b.getTime(), label: a.getDate() + ' ' + MONTHS[a.getMonth()],
                 members: 0, records: 0, hotels: 0, agencies: 0, current: i === 0 });
    }
    function put(t, f) {
      if (!isNum(t)) { return; }
      for (var j = 0; j < out.length; j++) { if (t >= out[j].start && t < out[j].end) { f(out[j]); return; } }
    }
    members.forEach(function (m) { put(m.joinedAt, function (w) { w.members++; }); });
    recs.forEach(function (r) { put(r.createdAt, function (w) { w.records++; if (r.type === 'hotel') { w.hotels++; } else { w.agencies++; } }); });
    return out;
  }

  // ------------------------------------------------------------------ ana model
  /**
   * input: { firms: [{uid, data}], items: [{uid, id, data}], now: ms, mode?: 'group' | 'firms' }
   * Dönen model DOM'suzdur; admin-view.js çizer.
   */
  function build(input) {
    input = input || {};
    var now = isNum(input.now) ? input.now : Date.now();
    var firmList = (input.firms || []).filter(function (f) { return f && f.uid; });
    var firms = {};
    firmList.forEach(function (f) {
      var d = f.data || {};
      firms[f.uid] = { name: String(d.name || '').trim(), city: String(d.city || '').trim(), email: String(d.email || '').trim() };
    });
    var recs = records(input.items);
    var expectYear = new Date(now).getFullYear() - 1;      // beklenen son raporlama yılı (geçen takvim yılı)

    var hotels = groupBy(recs.filter(function (r) { return r.type === 'hotel'; }), function (r) { return (r.uid || '?') + '|' + key(r.name || 'adsız'); })
      .map(function (g) { return hotelRow(g, firms, expectYear); });
    var agencies = groupBy(recs.filter(function (r) { return r.type === 'agency'; }), function (r) { return (r.uid || '?') + '|' + key(r.company || 'adsız'); })
      .map(function (g) { return agencyRow(g, firms); });
    var members = memberRows(firmList, recs);

    var byLast = function (a, b) { return (b.lastAt || 0) - (a.lastAt || 0); };
    hotels.sort(byLast); agencies.sort(byLast);
    members.sort(function (a, b) { return (b.joinedAt || 0) - (a.joinedAt || 0); });

    var gradeCounts = { A: 0, B: 0, C: 0, D: 0, E: 0, none: 0 };
    hotels.forEach(function (x) { if (GRADES.indexOf(x.grade) >= 0 && x.usable) { gradeCounts[x.grade]++; } else { gradeCounts.none++; } });
    var fleet = hotels.filter(function (x) { return x.usable && isNum(x.scalePos); }).map(function (x) {
      return { key: x.key, name: x.name, city: x.city, cpor: x.cpor, grade: x.grade, scalePos: x.scalePos, segmentLabel: x.segmentLabel };
    }).sort(function (a, b) { return a.scalePos - b.scalePos; });

    var tagged = function (t) { return hotels.filter(function (x) { return x.tags.indexOf(t) >= 0; }); };
    var verPrice = NS.model.DEFAULT_PRICES.verTlPerT;     // tek fiyat: otellerin kendi fiyat varsayımı değil
    var offsetT = sum(hotels, 'remainingT');
    var since = now - 30 * DAY;
    var counts = {
      members: members.length, hotels: hotels.length, agencies: agencies.length, records: recs.length,
      newMembers30: members.filter(function (m) { return isNum(m.joinedAt) && m.joinedAt >= since; }).length,
      newRecords30: recs.filter(function (r) { return isNum(r.createdAt) && r.createdAt >= since; }).length,
      hotelsT: sum(hotels, 'totalT'), agenciesT: sum(agencies, 'totalT')
    };
    counts.totalT = counts.hotelsT + counts.agenciesT;

    var byKey = {};
    hotels.forEach(function (x) { byKey[x.key] = x; });
    return {
      ok: true, now: now, mode: input.mode || 'group', expectYear: expectYear,
      counts: counts, gradeCounts: gradeCounts, fleet: fleet,
      weeks: weeks(members, recs, now, 12),
      opps: {
        verify: tagged('verify'), high: tagged('high'), stale: tagged('stale'),
        idle: members.filter(function (m) { return !m.records; }),
        offsetT: offsetT, offsetTl: offsetT * verPrice, verPrice: verPrice, verifyMin: VERIFY_MIN
      },
      hotels: hotels, agencies: agencies, members: members, byKey: byKey,
      empty: !recs.length && !members.length
    };
  }

  // ------------------------------------------------------------------ otel ayrıntısı
  /** Listeden seçilen otelin panel modeli: son kayıt + aynı otelin diğer yılları (bugünkü yöntemle) */
  function detail(row) {
    if (!row || !row.records || !row.records.length) { return null; }
    var latest = row.records.filter(function (r) { return r.id === row.latestId; })[0] || row.records[row.records.length - 1];
    if (!latest.state) { return null; }
    var st = latest.state, R = NS.compute(st);
    var others = row.records.filter(function (r) { return r !== latest && r.inputs; }).map(function (r) {
      return { id: r.id, year: r.year, company: r.name || r.company, createdAt: r.createdAt || 0, inputs: r.inputs };
    });
    var hist = NS.dashboard.history(others, st);
    return { state: st, R: R, hist: hist, model: NS.dashboard.model(st, R, hist, { sample: false }) };
  }

  // ------------------------------------------------------------------ arama, süzme, sıralama
  /**
   * rows: hotels | agencies | members; o: { q, filter: 'all' | 'verify' | 'high' | 'stale' | 'idle', sort, dir: 'asc' | 'desc' }
   * Boş değerler sıralamada her zaman sonda kalır.
   */
  function query(rows, o) {
    o = o || {};
    var q = key(o.q || ''), f = o.filter || 'all';
    var out = (rows || []).filter(function (r) {
      if (f !== 'all' && (!r.tags || r.tags.indexOf(f) < 0)) { return false; }
      if (!q) { return true; }
      return [r.name, r.city, r.email, r.segmentLabel, r.typeLabel].some(function (x) { return key(x).indexOf(q) >= 0; });
    });
    if (o.sort) {
      var k = o.sort, dir = o.dir === 'asc' ? 1 : -1;
      var blank = function (v) { return v === null || v === undefined || v === '' || (typeof v === 'number' && !isFinite(v)); };
      out = out.map(function (r, i) { return { r: r, i: i }; }).sort(function (a, b) {
        var x = a.r[k], y = b.r[k], bx = blank(x), by = blank(y);
        if (bx || by) { return bx && by ? a.i - b.i : bx ? 1 : -1; }
        var c = typeof x === 'string' || typeof y === 'string' ? String(x).localeCompare(String(y), 'tr') : x - y;
        return c ? c * dir : a.i - b.i;
      }).map(function (x) { return x.r; });
    }
    return out;
  }

  // ------------------------------------------------------------------ Excel
  function r1(x) { return isNum(x) ? Math.round(x * 10) / 10 : null; }
  function r2(x) { return isNum(x) ? Math.round(x * 100) / 100 : null; }
  /** Excel sayfaları: [{ name, widths, rows: [[başlıklar], ...] }] (sayılar sayı olarak kalır) */
  function sheets(m) {
    var tagTxt = function (r) { return r.tags.map(function (t) { return TAGS[t] ? TAGS[t].short : t; }).join(', '); };
    return [
      { name: 'Oteller', widths: [28, 14, 24, 7, 7, 12, 9, 12, 11, 18, 9, 14, 9, 18, 12, 12, 30, 30],
        rows: [['Otel', 'Şehir', 'Segment', 'Oda', 'Yıl', 'Oda-gece başına kg CO₂e', 'Kıyas notu', 'Toplam t CO₂e', 'Veri tamlığı',
                'Doğrulama', 'Önlem sayısı', 'Planlardan sonra kalan t', 'Kayıt sayısı', 'Kaydedilen yıllar', 'İlk kayıt', 'Son kayıt', 'E-posta', 'Fırsat']]
          .concat(m.hotels.map(function (r) {
            return [r.name, r.city, r.segmentLabel, r.rooms, r.year, r2(r.cpor), r.grade || '', r1(r.totalT), r.completeness,
                    VERIFY_TR[r.verify] || '', r.measures, r1(r.remainingT), r.count, r.years.join(', '), dateTr(r.firstAt), dateTr(r.lastAt), r.email, tagTxt(r)];
          })) },
      { name: 'Acenteler', widths: [28, 14, 12, 10, 12, 9, 12, 30],
        rows: [['Acente', 'Şehir', 'Toplam t CO₂e', 'Yolcu', 'Yolcu başı kg CO₂e', 'Kayıt sayısı', 'Son kayıt', 'E-posta']]
          .concat(m.agencies.map(function (r) {
            return [r.name, r.city, r1(r.totalT), r.passengers, r1(r.perGuestKg), r.count, dateTr(r.lastAt), r.email];
          })) },
      { name: 'Üyeler', widths: [28, 22, 14, 30, 12, 9, 12],
        rows: [['Ad', 'Tür', 'Şehir', 'E-posta', 'Üyelik', 'Kayıt sayısı', 'Son kayıt']]
          .concat(m.members.map(function (r) {
            return [r.name, r.typeLabel, r.city, r.email, dateTr(r.joinedAt), r.records, dateTr(r.lastAt)];
          })) }
    ];
  }

  NS.admin = {
    version: '1.0.0', ADMIN_EMAILS: ADMIN_EMAILS.slice(), SOURCE: SOURCE, VERIFY_MIN: VERIFY_MIN,
    TAGS: TAGS, TYPE_TR: TYPE_TR, VERIFY_TR: VERIFY_TR, GRADES: GRADES,
    isAdmin: isAdmin, ms: ms, dateTr: dateTr, records: records, build: build, detail: detail,
    query: query, sheets: sheets, weeks: weeks
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
