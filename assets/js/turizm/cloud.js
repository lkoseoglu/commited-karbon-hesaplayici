/* =====================================================================
   Turizm hesaplayıcısı — ÜYELİK VE BULUT KAYDI  (assets/js/turizm/cloud.js)
   - Firebase projesi Kapsam 3 hesaplayıcısıyla aynıdır (kobi-karbon-hesaplama).
   - Firebase dinamik yüklenir: CDN'e ulaşılamazsa hesaplayıcı yine çalışır,
     yalnız üyelik düğmeleri gizlenir.
   - Tesis profili  : firms/{uid}               (firestore.rules: kullanıcı kendi dokümanı, admin okur)
   - Kayıtlar       : reports/{uid}/items/{id}   type = 'hotel' | 'agency'
     Admin panelindeki "Firma Raporları" sekmesi bunları da listeler
     (type, sector, company, total [kg], userEmail, createdAt alanları DEĞİŞMEDİ).
   - inputs alanı: v6'da yeni şema ('commited.turizm.state/2'); eski sayfanın
     kayıtları (alan kimliği haritası) açılırken model.js ile otomatik aktarılır.
   Sayfayla iletişim yalnız window.__tour üzerinden (app.js).
   - Panel: oturum açılınca ve her kayıttan sonra otel kayıtları setHistory ile panele verilir
     (önceki yıllar aynı yöntemle yeniden hesaplanır); setAccount panelin davet metnini seçer.
   - Üyelik şartı (v6.3): app.js giriş yapmamış ziyaretçinin veri girme denemesinde "turizm:needauth"
     olayını yayar; burada üyelik penceresi açıklama notuyla açılır. setAccount('guest' | 'user') veri
     girişini kilitler / açar; Firebase yüklenemezse setAccount('offline') ile hesaplayıcı üyeliksiz çalışır.
   ===================================================================== */
const firebaseConfig = {
  apiKey: "AIzaSyA908koeADcOLR2ROU6R7fARAqjC1v-inc",
  authDomain: "kobi-karbon-hesaplama.firebaseapp.com",
  projectId: "kobi-karbon-hesaplama",
  storageBucket: "kobi-karbon-hesaplama.firebasestorage.app",
  messagingSenderId: "148732593523",
  appId: "1:148732593523:web:505abef73a48a29469b106"
};
const V = "10.12.0";
const $ = (id) => document.getElementById(id);
const T = () => window.__tour;
let A = null, F = null, auth = null, db = null, user = null, profile = null, authMode = "register", pendingSave = false, registering = false;

const ERR = {
  "auth/invalid-email": "Geçersiz e-posta adresi.",
  "auth/missing-password": "Şifre girin.",
  "auth/weak-password": "Şifre en az 6 karakter olmalı.",
  "auth/email-already-in-use": "Bu e-posta zaten kayıtlı — \"Giriş yap\" sekmesini kullanın.",
  "auth/invalid-credential": "E-posta veya şifre hatalı.",
  "auth/user-not-found": "Bu e-postayla kayıtlı hesap yok.",
  "auth/wrong-password": "E-posta veya şifre hatalı.",
  "auth/too-many-requests": "Çok fazla deneme yapıldı; biraz sonra tekrar deneyin.",
  "auth/popup-blocked": "Açılır pencere engellendi; tarayıcı izin verince tekrar deneyin.",
  "auth/popup-closed-by-user": "Google penceresi kapatıldı.",
  "auth/unauthorized-domain": "Bu alan adı Firebase'de yetkili değil (yazılım ekibi: Authentication → Settings → Authorized domains).",
  "permission-denied": "Kayıt izni yok (Firestore kuralları)."
};
const errText = (e) => ERR[(e && e.code) || ""] || (e && e.message) || "Beklenmeyen bir hata oluştu.";
const showErr = (m) => { $("authErr").textContent = m || ""; };
// Sayı ve tarih seçili dilde (i18n.js: Türkçe 1.234,5 · İngilizce 1,234.5)
const fmtKg = (kg) => (kg >= 1000 ? globalThis.NUM.format(kg / 1000, 1) + " tCO₂e" : globalThis.NUM.format(Math.round(kg), 0) + " kgCO₂e");
const isEn = () => !!(globalThis.TURIZM && globalThis.TURIZM.i18n && globalThis.TURIZM.i18n.lang() === "en");
const fmtDate = (d, withTime) => (withTime ? d.toLocaleString(isEn() ? "en-GB" : "tr-TR") : d.toLocaleDateString(isEn() ? "en-GB" : "tr-TR"));
const el = (tag, attrs = {}, kids = []) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === "text") e.textContent = v; else if (k === "class") e.className = v; else e.setAttribute(k, v); }
  kids.forEach((c) => e.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
  return e;
};
const whenReady = () => new Promise((res) => { if (window.__tour) res(); else window.addEventListener("turizm:ready", () => res(), { once: true }); });

/* ---------- modal ---------- */
let lastFocus = null;
const GATE_NOTE = "Verilerinizi girmek için ücretsiz üye olun ya da giriş yapın. Kayıt bir dakika sürer; verileriniz hesabınızda saklanır, her cihazdan devam edersiniz.";
function openModal(view, mode, note) {
  if ($("authModal").hidden) lastFocus = document.activeElement;
  $("authModal").hidden = false;
  ["authForms", "profForm", "recList"].forEach((id) => { $(id).hidden = id !== view; });
  showErr("");
  const n = $("authNote");
  if (n) { n.textContent = note || ""; n.hidden = !note; }
  if (view === "authForms") setAuthMode(mode || authMode);
  if (view === "profForm") {
    const st = T() && T().state ? T().state() : null;
    $("pf_name").value = (profile && profile.name) || (st && st.hotel.name) || "";
    $("pf_city").value = (profile && profile.city) || (st && st.hotel.city) || "";
  }
  const first = $("authModal").querySelector(view === "recList" ? ".mclose" : (view === "profForm" ? "#pf_name" : "#authGoogle"));
  if (first) setTimeout(() => first.focus(), 0);
}
function closeModal() {
  $("authModal").hidden = true; pendingSave = false;
  if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) { /* yok */ } }
}
function setAuthMode(m) {
  authMode = m;
  document.querySelector("#authModal .mbox").classList.toggle("login", m === "login");
  document.querySelectorAll("#authModal .mtabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === m));
  $("authSubmit").textContent = m === "login" ? "Giriş yap" : "Üye ol";
  $("authTitle").textContent = m === "login" ? "Hesabınıza giriş yapın" : "Tesisinizi ücretsiz kaydedin";
  $("r_pass").setAttribute("autocomplete", m === "login" ? "current-password" : "new-password");
  showErr("");
}
/* Odak modal içinde kalsın (Tab / Shift+Tab) */
function trapFocus(ev) {
  if (ev.key !== "Tab" || $("authModal").hidden) return;
  const items = [...$("authModal").querySelectorAll("button,input,select,a[href]")].filter((x) => !x.disabled && x.offsetParent !== null);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
  else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
}

/* ---------- hesap çubuğu ---------- */
function renderBar() {
  const bar = $("acct");
  if (!bar) return;
  bar.textContent = "";
  if (!user) {
    bar.append(
      el("button", { class: "btn acct-cta", type: "button", "data-auth": "register", text: "Ücretsiz üye olun" }),
      el("button", { class: "btn acct-ghost", type: "button", "data-auth": "login", text: "Giriş yapın" }),
      el("span", { class: "acct-note", text: "Veri girmek için ücretsiz üye olun; verileriniz her cihazda hazır olsun, her yıl yeni ölçümünüzü ekleyin." })
    );
  } else {
    const nm = (profile && profile.name) || user.displayName || "Hesabım";
    bar.append(
      el("span", { class: "acct-who" }, ["✓ " + nm, el("small", { text: user.email || "" })]),
      el("button", { class: "btn acct-cta", type: "button", "data-act": "save", text: "Hesabıma kaydet" }),
      el("button", { class: "btn acct-ghost", type: "button", "data-act": "records", text: "Kayıtlarım" }),
      el("button", { class: "btn acct-ghost", type: "button", "data-act": "logout", text: "Çıkış" })
    );
  }
}

/* ---------- profil ---------- */
async function loadProfile() {
  try {
    const s = await F.getDoc(F.doc(db, "firms", user.uid));
    profile = s.exists() ? s.data() : null;
  } catch (e) { profile = null; }
}
function fillIfEmpty(id, value) {
  const x = $(id);
  if (x && value && !x.value) { x.value = value; x.dispatchEvent(new Event("input", { bubbles: true })); }
}
async function writeProfile(p) {
  const data = Object.assign({}, p, {
    email: user.email || "", source: "turizm-karbon-hesaplayici",
    kvkkAccepted: true, kvkkAcceptedAt: F.serverTimestamp(), updatedAt: F.serverTimestamp()
  });
  if (!profile) data.createdAt = F.serverTimestamp();
  await F.setDoc(F.doc(db, "firms", user.uid), data, { merge: true });
  profile = Object.assign({}, profile || {}, p);
  fillIfEmpty("h_name", p.name); fillIfEmpty("h_city", p.city);
}

/* ---------- kayıtlar ---------- */
async function listRecords() {
  const q = F.query(F.collection(db, "reports", user.uid, "items"), F.orderBy("createdAt", "desc"));
  const snap = await F.getDocs(q);
  const out = [];
  snap.forEach((d) => { const r = d.data(); if (r.type === "hotel" || r.type === "agency") out.push(Object.assign({ id: d.id }, r)); });
  return out;
}
/* Panel için: otel kayıtları (inputs ile) — her yılın en son kaydını dashboard.js seçer */
async function refreshHistory() {
  if (!user || !T() || !T().setHistory) return;
  try {
    const recs = await listRecords();
    T().setHistory(recs.filter((r) => r.type === "hotel" && r.inputs).map((r) => ({
      id: r.id, year: r.year || null, company: r.company || "", inputs: r.inputs,
      createdAt: r.createdAt && r.createdAt.toMillis ? r.createdAt.toMillis() : (r.createdAt && typeof r.createdAt.seconds === "number" ? r.createdAt.seconds * 1000 : 0)
    })));
  } catch (e) { /* panel geçmişsiz çalışır */ }
}
function loadRecord(r) {
  if (!r || !r.inputs) return;
  const res = T().apply(r.inputs);
  T().setMode(r.type === "agency" ? "acente" : "otel");
  const dt = r.createdAt && r.createdAt.toDate ? fmtDate(r.createdAt.toDate()) : "";
  // Tarih ve tesis adı ayrı metin parçası: İngilizce çeviri (i18n.js) cümleyi bulabilsin
  const parts = [{ b: "Kayıtlı verileriniz yüklendi" }, " (" + (r.company || "") + (r.year ? " · " + r.year : "") + ")"];
  if (dt) parts.push(" · ", "kayıt", " " + dt);
  parts.push(". ", "Değiştirip \"Hesabıma kaydet\" derseniz yeni bir kayıt olarak eklenir; eski kayıtlar silinmez.");
  if (res && res.legacy) parts.push(" Bu kayıt önceki sürümle yapılmıştı; yeni yönteme aktarıldı, sonuçlar biraz farklı olabilir (Metodoloji → Önceki sürümden farklar).");
  if (res && res.notes && res.notes.length) parts.push({ list: res.notes });
  T().notice(r.type === "agency" ? "agency" : "hotel", parts);
}
async function openRecords() {
  openModal("recList");
  const box = $("recItems");
  box.textContent = "";
  box.append(el("p", { class: "mini", text: "Yükleniyor…" }));
  try {
    const recs = await listRecords();
    box.textContent = "";
    if (!recs.length) { box.append(el("p", { class: "mini", text: "Henüz kaydınız yok. Verilerinizi girip \"Hesabıma kaydet\" deyin." })); return; }
    recs.forEach((r) => {
      const dt = r.createdAt && r.createdAt.toDate ? fmtDate(r.createdAt.toDate(), true) : "";
      const meta = el("small", {}, [r.type === "agency" ? "Acente" : "Otel / HCMI", " · " + dt]);
      if (r.cpor != null) meta.append(" · ", globalThis.NUM.format(+r.cpor, 1) + " kg/oda-gece");
      if (!(r.inputs && r.inputs.schema)) meta.append(" · ", "önceki sürüm");
      const b = el("button", { type: "button", class: "rec" }, [
        el("span", {}, [(r.company || "Tesis") + (r.year ? " · " + r.year : ""), meta]),
        el("b", { text: fmtKg(r.total || 0) })
      ]);
      b.addEventListener("click", () => { loadRecord(r); closeModal(); T().toast("Kayıt yüklendi"); });
      box.appendChild(b);
    });
  } catch (e) { box.textContent = ""; box.append(el("p", { class: "merr", text: "Kayıtlar okunamadı: " + errText(e) })); }
}
async function saveRecord() {
  const msgs = document.querySelectorAll("[data-cloud-msg]");
  const say = (m) => msgs.forEach((x) => { x.textContent = m; });
  if (!user) { pendingSave = true; openModal("authForms", "register"); showErr("Kaydetmek için ücretsiz üye olun veya giriş yapın."); return; }
  if (!profile || !profile.name) { pendingSave = true; openModal("profForm"); return; }
  const sm = T().summary();
  if (!(sm.total > 0)) { say("Kaydedilecek bir sonuç yok — önce verilerinizi girin."); T().toast("Önce verilerinizi girin"); return; }
  say("Kaydediliyor…");
  try {
    const company = (sm.type === "hotel" ? sm.name : "") || profile.name;
    const rec = {
      type: sm.type, source: "turizm-karbon-hesaplayici", appVersion: T().version,
      sector: sm.type === "agency" ? "Turizm — Acente / tur operatörü" : "Turizm — Otel (HCMI v2.0)",
      company: company, year: sm.year || null, total: Math.round(sm.total),
      cpor: sm.cpor == null ? null : sm.cpor, grade: sm.grade || null,
      inputs: T().collect(), hcmi: sm.hcmi || null,
      userEmail: user.email || ""
    };
    /* JSON gidiş-dönüşü: Firestore'un kabul etmediği undefined/NaN değerlerini temizler */
    const clean = JSON.parse(JSON.stringify(rec));
    clean.createdAt = F.serverTimestamp();
    await F.addDoc(F.collection(db, "reports", user.uid, "items"), clean);
    F.setDoc(F.doc(db, "firms", user.uid), { lastSavedAt: F.serverTimestamp(), lastTotalKg: Math.round(sm.total) }, { merge: true }).catch(() => {});
    say("✓ Hesabınıza kaydedildi (" + fmtKg(sm.total) + "). \"Kayıtlarım\"dan istediğiniz zaman açabilirsiniz.");
    T().toast("Hesabınıza kaydedildi");
    refreshHistory();
  } catch (e) { say("Kaydedilemedi: " + errText(e)); }
}

/* ---------- olaylar ---------- */
function bind() {
  document.addEventListener("click", (ev) => {
    const t = ev.target.closest("[data-auth],[data-act],[data-cloud-save],[data-auth-close],[data-tab]");
    if (!t) { if (ev.target.id === "authModal") closeModal(); return; }
    if (t.dataset.auth) openModal("authForms", t.dataset.auth);
    else if (t.hasAttribute("data-auth-close")) closeModal();
    else if (t.dataset.tab) setAuthMode(t.dataset.tab);
    else if (t.hasAttribute("data-cloud-save") || t.dataset.act === "save") saveRecord();
    else if (t.dataset.act === "records") openRecords();
    else if (t.dataset.act === "logout") A.signOut(auth).then(() => T().toast("Çıkış yapıldı"));
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !$("authModal").hidden) closeModal();
    trapFocus(ev);
  });
  // app.js: giriş yapmamış ziyaretçi veri girmeye çalıştı
  document.addEventListener("turizm:needauth", () => {
    if (user) return;
    if (!$("authModal").hidden && !$("authForms").hidden) return;     // pencere zaten açık
    openModal("authForms", "register", GATE_NOTE);
  });

  $("authSubmit").addEventListener("click", async () => {
    const email = $("r_email").value.trim(), pass = $("r_pass").value;
    showErr("");
    try {
      if (authMode === "login") {
        await A.signInWithEmailAndPassword(auth, email, pass);
      } else {
        const name = $("r_name").value.trim();
        if (!name) return showErr("Tesis / işletme adını yazın.");
        if (!$("r_kvkk").checked) return showErr("Devam etmek için Aydınlatma Metni onayını işaretleyin.");
        $("authSubmit").disabled = true;
        registering = true;
        const cred = await A.createUserWithEmailAndPassword(auth, email, pass);
        user = cred.user;
        await writeProfile({ name: name, type: $("r_type").value, city: $("r_city").value.trim() });
        registering = false;
        A.sendEmailVerification(user).catch(() => {});
        renderBar();
        if (T().setAccount) T().setAccount("user");
        const again = pendingSave; closeModal();
        T().toast("Üyeliğiniz oluşturuldu");
        if (again) saveRecord();
      }
    } catch (e) { registering = false; showErr(errText(e)); }
    finally { $("authSubmit").disabled = false; }
  });
  $("authGoogle").addEventListener("click", async () => {
    showErr("");
    try { await A.signInWithPopup(auth, new A.GoogleAuthProvider()); }
    catch (e) {
      if (e && e.code === "auth/popup-blocked") { try { await A.signInWithRedirect(auth, new A.GoogleAuthProvider()); return; } catch (e2) { /* aşağıda */ } }
      showErr(errText(e));
    }
  });
  $("authReset").addEventListener("click", async () => {
    const email = $("r_email").value.trim();
    if (!email) return showErr("Önce e-posta adresinizi yazın.");
    try { await A.sendPasswordResetEmail(auth, email); showErr(""); T().toast("Şifre sıfırlama e-postası gönderildi"); }
    catch (e) { showErr(errText(e)); }
  });
  $("profSave").addEventListener("click", async () => {
    const name = $("pf_name").value.trim();
    if (!name) return showErr("Tesis / işletme adını yazın.");
    if (!$("pf_kvkk").checked) return showErr("Devam etmek için Aydınlatma Metni onayını işaretleyin.");
    try {
      await writeProfile({ name: name, type: $("pf_type").value, city: $("pf_city").value.trim() });
      renderBar();
      const again = pendingSave; closeModal();
      T().toast("Kaydınız tamamlandı");
      if (again) saveRecord();
    } catch (e) { showErr(errText(e)); }
  });
}

/* ---------- oturum değişimi ---------- */
async function onUser(u) {
  user = u;
  if (registering) return;           /* kayıt akışı profili kendisi yazıp çubuğu güncelliyor */
  profile = null;
  if (u) {
    await loadProfile();
    renderBar();
    if (T().setAccount) T().setAccount("user");
    if (!profile || !profile.name) { openModal("profForm"); return; }
    const again = pendingSave;
    if (!$("authModal").hidden && !$("authForms").hidden) closeModal();
    if (again) { saveRecord(); return; }
    if (T().isEmpty()) {
      try {
        const recs = await listRecords();
        if (recs.length) {
          loadRecord(recs[0]); T().toast("Son kaydınız yüklendi");
          if (recs[0].type !== "agency" && T().setView) T().setView("dash");
        }
      } catch (e) { /* sessiz */ }
    }
    refreshHistory();
  } else {
    renderBar();
    if (T().setAccount) T().setAccount("guest");
    if (T().setHistory) T().setHistory([]);
  }
}

(async () => {
  await whenReady();
  bind();
  try {
    const base = "https://www.gstatic.com/firebasejs/" + V + "/";
    const [appM, authM, fsM] = await Promise.all([
      import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js")
    ]);
    A = authM; F = fsM;
    const app = appM.initializeApp(firebaseConfig, "turizm");
    auth = A.getAuth(app); db = F.getFirestore(app);
    await A.setPersistence(auth, A.browserLocalPersistence).catch(() => {});
    A.getRedirectResult(auth).catch(() => {});
    A.onAuthStateChanged(auth, (u) => { onUser(u); });
  } catch (e) {
    console.warn("Üyelik modülü yüklenemedi; hesaplayıcı üyeliksiz çalışıyor.", e);
    const bar = $("acct"); if (bar) bar.hidden = true;
    document.querySelectorAll("[data-cloud-save]").forEach((b) => { b.hidden = true; });
    if (T() && T().setAccount) T().setAccount("offline");          // veri girişi kilitli kalmasın
  }
})();
