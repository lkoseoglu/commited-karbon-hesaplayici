/* =====================================================================
   Commited Yönetim Paneli — GİRİŞ VE OKUMA  (assets/js/turizm/admin-cloud.js)
   - Firebase projesi hesaplayıcılarla aynıdır (kobi-karbon-hesaplama). Varsayılan uygulama adı
     karbon-admin.html ile aynı olduğu için orada açılan yönetici oturumu burada da geçerlidir.
   - Yönetici değilse (admin.js → ADMIN_EMAILS) hiçbir kayıt okunmaz. Asıl koruma sunucudadır:
     firestore.rules → isAdmin() (e-posta listede ve doğrulanmış olmalı).
   - Okuma: firms (üye profilleri) + collectionGroup('items') (bütün kayıtlar, tek sorgu, dizin gerekmez).
     Kurallar toplu okumaya izin vermezse (permission-denied) kayıtlar üye profilleri üzerinden tek tek
     okunur (mode: 'firms'); sayfa bunu bir notla belirtir. Ayrıntı: README-yazilim-ekibi.md
   Sayfayla iletişim window.__admin üzerinden (admin-view.js).
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
const W = () => window.__admin;
let A = null, F = null, auth = null, db = null, busy = false;

const ERR = {
  "auth/invalid-email": "Geçersiz e-posta adresi.",
  "auth/missing-password": "Şifrenizi yazın.",
  "auth/invalid-credential": "E-posta veya şifre hatalı.",
  "auth/user-not-found": "Bu e-postayla kayıtlı hesap yok.",
  "auth/wrong-password": "E-posta veya şifre hatalı.",
  "auth/too-many-requests": "Çok fazla deneme yapıldı; biraz sonra tekrar deneyin.",
  "auth/popup-blocked": "Açılır pencere engellendi; tarayıcı izin verince tekrar deneyin.",
  "auth/popup-closed-by-user": "Google penceresi kapatıldı.",
  "auth/unauthorized-domain": "Bu alan adı Firebase'de yetkili değil (yazılım ekibi: Authentication → Settings → Authorized domains).",
  "permission-denied": "Okuma izni yok (Firestore kuralları)."
};
const errText = (e) => ERR[(e && e.code) || ""] || (e && e.message) || "Beklenmeyen bir hata oluştu.";
const showErr = (m) => { $("g_err").textContent = m || ""; };

/* ---------- görünümler ---------- */
function gate(mode, text) {
  $("adm-gate").hidden = false;
  $("adm-app").hidden = true;
  $("gate-form").hidden = mode !== "login";
  $("gate-denied").hidden = mode !== "denied";
  $("gate-msg").textContent = text || "";
}
function showApp(user) {
  $("adm-gate").hidden = true;
  $("adm-app").hidden = false;
  $("adm-who").textContent = user.email || "";
  showErr("");
}

/* ---------- okuma ---------- */
async function load() {
  if (busy) return;
  busy = true;
  W().loading();
  const firms = [], items = [];
  let mode = "group";
  try {
    const fs = await F.getDocs(F.collection(db, "firms"));
    fs.forEach((d) => firms.push({ uid: d.id, data: d.data() }));
  } catch (e) {
    busy = false;
    W().message(e && e.code === "permission-denied"
      ? "Kayıtlar okunamadı: Firestore kuralları bu hesaba okuma izni vermiyor. Hesabın e-postası doğrulanmamış olabilir; Google ile giriş yapmayı deneyin ya da e-postanıza gelen doğrulama bağlantısına tıklayın."
      : "Kayıtlar okunamadı: " + errText(e) + " Bağlantınızı kontrol edip Yenile'ye basın.", "warn");
    return;
  }
  try {
    const g = await F.getDocs(F.collectionGroup(db, "items"));
    g.forEach((d) => {
      const p = (d.ref && d.ref.path) || "";
      if (p.indexOf("reports/") !== 0) return;              // yalnız reports/{uid}/items
      items.push({ uid: p.split("/")[1], id: d.id, data: d.data() });
    });
  } catch (e) {
    mode = "firms";                                         // toplu okuma izni yok: üye profilleri üzerinden
    await Promise.all(firms.map(async (f) => {
      try {
        const s = await F.getDocs(F.collection(db, "reports", f.uid, "items"));
        s.forEach((d) => items.push({ uid: f.uid, id: d.id, data: d.data() }));
      } catch (e2) { /* bu üyenin kayıtları okunamadı */ }
    }));
  }
  busy = false;
  try { W().show({ firms, items, now: Date.now(), mode }); }
  catch (e) { console.error(e); W().message("Kayıtlar okundu ama gösterilemedi: " + (e && e.message ? e.message : e), "warn"); }
}

/* ---------- oturum ---------- */
function onUser(u) {
  if (!u) {
    W().reset();
    gate("login", "Turizm hesaplayıcısının üyelerini, otellerin sonuçlarını ve satış fırsatlarını gösterir. Yönetici hesabınızla giriş yapın.");
    return;
  }
  if (!window.TURIZM.admin.isAdmin(u.email)) {
    W().reset();
    gate("denied", (u.email || "Bu") + " hesabıyla giriş yaptınız. Bu sayfa yalnız Commited yöneticileri içindir; bu hesabın kayıtları görme yetkisi yok.");
    return;
  }
  showApp(u);
  load();
}

function bind() {
  $("gate-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const email = $("g_email").value.trim(), pass = $("g_pass").value;
    if (!email || !pass) { showErr("E-posta adresinizi ve şifrenizi yazın."); return; }
    showErr("");
    $("g_login").disabled = true;
    try { await A.signInWithEmailAndPassword(auth, email, pass); $("g_pass").value = ""; }
    catch (e) { showErr(errText(e)); }
    finally { $("g_login").disabled = false; }
  });
  $("g_google").addEventListener("click", async () => {
    showErr("");
    try { await A.signInWithPopup(auth, new A.GoogleAuthProvider()); }
    catch (e) {
      if (e && e.code === "auth/popup-blocked") { try { await A.signInWithRedirect(auth, new A.GoogleAuthProvider()); return; } catch (e2) { /* aşağıda */ } }
      showErr(errText(e));
    }
  });
  $("g_out").addEventListener("click", () => { A.signOut(auth); });
  $("adm-logout").addEventListener("click", () => { A.signOut(auth); });
  $("adm-refresh").addEventListener("click", () => { load(); });
}

(async () => {
  try {
    const base = "https://www.gstatic.com/firebasejs/" + V + "/";
    const [appM, authM, fsM] = await Promise.all([
      import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js")
    ]);
    A = authM; F = fsM;
    const app = appM.initializeApp(firebaseConfig);         // varsayılan ad: karbon-admin.html ile aynı oturum
    auth = A.getAuth(app); db = F.getFirestore(app);
    await A.setPersistence(auth, A.browserLocalPersistence).catch(() => {});
    A.getRedirectResult(auth).catch(() => {});
    bind();
    A.onAuthStateChanged(auth, onUser);
  } catch (e) {
    console.warn("Giriş modülü yüklenemedi.", e);
    gate("error", "Giriş hizmetine ulaşılamadı. İnternet bağlantınızı kontrol edip sayfayı yenileyin.");
  }
})();
