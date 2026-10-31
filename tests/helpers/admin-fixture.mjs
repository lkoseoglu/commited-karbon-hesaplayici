// Yönetim paneli testleri için örnek Firestore içeriği (birim ve uçtan uca testler aynı veriyi kullanır).
// T: loadApp() ile yüklenen TURIZM; now: ms. Zamanlar now'a göredir, böylece "son 30 gün" ve haftalar sabit kalır.
const DAY = 864e5;

export function adminFixture(T, now) {
  const M = T.model;
  const ts = (daysAgo) => ({ seconds: Math.floor((now - daysAgo * DAY) / 1000) });
  const J = (x) => JSON.parse(JSON.stringify(x));
  const SRC = 'turizm-karbon-hesaplayici';

  const hotel = (name, year, tweak) => {
    const s = M.exampleState(); s.mode = 'otel'; s.agency = M.emptyAgency();
    s.hotel.name = name; s.hotel.year = year;
    if (tweak) tweak(s.hotel);
    return J(s);
  };
  const rec = (st, extra) => ({ type: 'hotel', source: SRC, appVersion: '6.2.0', sector: 'Turizm — Otel (HCMI v2.0)',
    company: st.hotel.name, year: st.hotel.year, inputs: st, ...extra });

  const deniz24 = hotel('Deniz Otel', 2024, (h) => { h.energy[0].total = 1600000; });
  const deniz25 = hotel('Deniz Otel', 2025);
  const kale = hotel('Kale Otel', 2025, (h) => { h.city = 'Nevşehir'; h.energy.forEach((r) => { if (typeof r.total === 'number') r.total *= 3; }); h.measures = []; });
  const agency = (() => { const s = M.exampleState(); s.mode = 'acente'; s.hotel = M.emptyHotel(); return J(s); })();
  const legacy = { ...M.LEGACY_EXAMPLE, h_name: 'Zeytin Pansiyon', h_city: 'Ayvalık', h_year: '2023' };

  const firms = [
    { uid: 'u_deniz', data: { name: 'Deniz Otel', type: 'otel', city: 'Muğla', email: 'deniz@otel.test', source: SRC, createdAt: ts(40), lastSavedAt: ts(5) } },
    { uid: 'u_mavi', data: { name: 'Mavi Tur', type: 'acente', city: 'İzmir', email: 'info@mavitur.test', source: SRC, createdAt: ts(10) } },
    { uid: 'u_yeni', data: { name: 'Yeni Üye Otel', type: 'otel', city: 'Antalya', email: 'yeni@otel.test', source: SRC, createdAt: ts(2) } },
    { uid: 'u_zeytin', data: { name: 'Zeytin Pansiyon', type: 'pansiyon', city: 'Ayvalık', email: 'zeytin@pansiyon.test', source: SRC, createdAt: ts(20) } },
    { uid: 'u_k3', data: { name: 'Çelik Tedarik A.Ş.', email: 'k3@firma.test', createdAt: ts(60) } }   // Kapsam 3 üyesi: sayılmaz
  ];
  const items = [
    { uid: 'u_deniz', id: 'd24', data: rec(deniz24, { userEmail: 'deniz@otel.test', total: 1100000, createdAt: ts(35) }) },
    { uid: 'u_deniz', id: 'd25', data: rec(deniz25, { userEmail: 'deniz@otel.test', total: 1059600, cpor: 34.4, grade: 'B', createdAt: ts(5) }) },
    { uid: 'u_kale', id: 'k25', data: rec(kale, { userEmail: 'kale@otel.test', total: 3000000, createdAt: ts(3) }) },        // profili yok
    { uid: 'u_zeytin', id: 'z23', data: { type: 'hotel', source: SRC, company: 'Zeytin Pansiyon', year: 2023, total: 1037970, cpor: 33.67, grade: 'B',
        userEmail: 'zeytin@pansiyon.test', inputs: legacy, createdAt: ts(18) } },                                              // eski sürüm kaydı
    { uid: 'u_mavi', id: 'm1', data: { type: 'agency', source: SRC, company: 'Mavi Tur', sector: 'Turizm — Acente / tur operatörü', total: 1128000,
        userEmail: 'info@mavitur.test', inputs: agency, createdAt: ts(9) } },
    { uid: 'u_k3', id: 'b1', data: { type: 'buyer', company: 'Çelik Tedarik A.Ş.', total: 52000, userEmail: 'k3@firma.test', createdAt: ts(30) } }
  ];
  return { firms, items };
}

/** Saplama Firestore'u için yol → belge sözlüğü (window.__fbTest.db) */
export function adminFixtureDb(fx) {
  const db = {};
  fx.firms.forEach((f) => { db['firms/' + f.uid] = f.data; });
  fx.items.forEach((i) => { db['reports/' + i.uid + '/items/' + i.id] = i.data; });
  return db;
}
