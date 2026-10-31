# Commited Turizm Karbon Hesaplayıcıları — Yazılım Ekibi Kılavuzu

commitedevents.app (Squarespace) sitesine iframe ile gömülen, sunucu gerektirmeyen (hesabı tamamen
tarayıcıda yapan) karbon hesaplama modülleri. GitHub Pages üzerinden yayınlanır:
`https://lkoseoglu.github.io/commited-karbon-hesaplayici/<dosya>.html`

## 2026-10-31 — Üyelik şartı ve parlayan örnek düğmesi (v6.3)

> **Durum:** onay bekliyor; `uyelik-sarti` dalında. Canlıya alınınca bu satır güncellenecek.

**İstek (Levent Bey):** "Otel karbon modülünde kullanıcı giriş yapmadan ya da kaydı olmadan veri girişine
başlayamasın." İki sekmede de (otel ve acente) geçerli; ziyaretçi örneği görebilir. Ayrıca canlıda gözden kaçan
"120 odalı örnek" bağlantısı "daha görünür yap, parlat" isteğiyle düğmeye çevrildi.

**Nasıl çalışır** (`assets/js/turizm/app.js`, "Üyelik şartı" bloğu):
- Hesap durumu: `none` (yükleniyor), `guest`, `user`, `offline`. `none` ve `guest` kilitlidir (`gated()`).
- `#app` üzerinde yakalama aşamasında dinleyiciler, yalnız `#panel-otel, #panel-acente` içinde:
  fareyle alana basma (`pointerdown`), işaret kutusu ve düzenleme düğmeleri (`click`, liste `EDIT_BTN`),
  klavyeyle yazma (`keydown`; Tab, Esc ve gezinme serbest) engellenir; `input/change` güvenlik ağı yapıştırma ve
  otomatik doldurmayı geri alır. Engellenince `turizm:needauth` olayı gönderilir; `cloud.js` kayıt penceresini
  `#authNote` açıklamasıyla açar. Pencere zaten açıksa yeniden açmaz.
- Serbest olanlar: örnek, temizle, sonuçlar, panel (önlem ekle/çıkar hariç), rapor, gezinme.
- Üyelik modülü (Firebase) yüklenemezse ya da 10 sn içinde yanıt gelmezse durum `offline` olur ve hesaplayıcı
  üyeliksiz çalışır (hizmet kesintisinde hesaplayıcı kilitli kalmasın diye).
- `body.gated` sınıfı durum için; bildirim şeritleri durum değişince yenilenir (`noticeKind`).

**Örnek düğmesi:** `U.notice` artık `{ actions: [...] }` parçası alır ve şeridin altına gerçek düğmeler çizer
(`.notice-acts`; tür `primary`, `ghost` ya da `shine`). Örnek düğmesi `btn shine`: altın (`--accent`), hafif hale
(`--accent-glow`), birkaç saniyede bir üzerinden geçen ışık (`--shine`, `@keyframes btn-shine`; hareketi azaltan
cihazda ışık geçmez). Panelin boş ekranındaki "Örnek otelle görün" de aynı sınıfı kullanır. `--shine` ve
`--accent-glow` tema dosyasının üç bloğuna da eklendi.

**Testler:** `tests/e2e/turizm-v6.test.mjs` içinde 2 yeni test (ziyaretçi veri giremez, örnek/panel serbest, üye olunca
yazar; üyelik modülü yüklenemezse hesaplayıcı üyeliksiz çalışır). Diğer testler varsayılan olarak üye oturumuyla
açılır (`open({ guest: true })` ziyaretçi). Toplam 268 birim + 31 uçtan uca test.

## 2026-10-31 — Squarespace: hareketli deniz zemini (yalnız hesaplayıcı sayfaları)

> **Durum:** onay bekliyor. Squarespace → Tasarım → Özel CSS'in **sonuna** eklenecek (1-7 numaralı "deniz" bloğu
> aynen kalır). Geri almak için 8 numaralı bloğu silmek yeterli.

**İstek:** "Arkadaki düz mavi duvar kağıdı daha alımlı olabilir mi? Hareket eden dalga vb." Zemin hesaplayıcının
değil, Squarespace sayfasının gövdesidir (`body#collection-...` ile yalnız Turizm ve Kapsam 3 sayfaları).

**Katmanlar** (hepsi `position:fixed; z-index:-1; pointer-events:none`, içerik ve hesaplayıcı penceresinin arkasında):
`body::before` yukarıdan süzülen ışık hüzmeleri (yavaş salınım), `#siteWrapper::before/::after` ve `body::after` üç
kat dalga (120 / 80 / 54 sn'de bir döşeme kayar, hafifçe kabarır). Dalgalar SVG veri adresi olarak gömülüdür;
`tools/deniz-dalga-uret.mjs` üretir (`node tools/deniz-dalga-uret.mjs > docs/squarespace-deniz-dalgalari.css`).
LESS uyumu için `calc()` kullanılmadı. "Hareketi azalt" açık cihazlarda animasyon durur. Yatay kaydırma oluşmaz
(sabit konumlu öğeler sayfa genişliğine eklenmez; canlı sayfada denendi: `scrollWidth = clientWidth`).

## 2026-10-31 — Yönetim paneli (`turizm-admin.html`, yalnız Commited yöneticileri)

> **Durum:** 2026-10-31'de onaylandı ve canlıya alındı (GitHub web arayüzünden klasör klasör yüklendi):
> `https://lkoseoglu.github.io/commited-karbon-hesaplayici/turizm-admin.html`. Herkese açık sayfalara bağlanmaz;
> `karbon-admin.html`'in araç çubuğunda "Turizm yönetim paneli" bağlantısı var. `firestore.rules`'taki yeni okuma
> kuralı Firebase konsolunda ayrıca yayınlanmalıdır (aşağıda).

**Ne yapar:** turizm hesaplayıcısının kullanımını tek ekranda gösterir.
- Üst alan: üye, otel, acente, kaydedilen hesap sayıları, son kayıtların toplam emisyonu; bütün oteller A–E kıyas
  şeridinde birer nokta (otel panelindeki şeritle aynı ölçek; noktaya tıklayınca otelin ayrıntısı açılır).
- Haftalara göre (son 12 hafta): yeni üye ya da kaydedilen hesap; ipucu, klavye ve tablo eşi.
- Satış fırsatları: doğrulamaya hazır (veri tamlığı 90+, bağımsız doğrulaması yok), kıyasın üstünde (D ve E),
  güncelleme bekliyor (geçen takvim yılının verisi yok), hesap kaydetmemiş üye; planlardan sonra kalan emisyon
  ve VER 400 TL/t (`model.DEFAULT_PRICES`) ile dengeleme potansiyeli. "Listede gösterin" listeyi o süzgeçle açar.
- Liste: oteller / acenteler / üyeler; arama (ad, şehir, e-posta), süzgeç, sütuna göre sıralama, e-posta bağlantısı,
  **Excel'e aktarın** (üç sayfa: Oteller, Acenteler, Üyeler; SheetJS, kapsam3 sayfasıyla aynı CDN sürümü).
- Otel ayrıntısı: otelin kendi paneli **salt okunur** (`dashView.render(..., { readOnly: true })`: önlem ekle/çıkar,
  kaydet, rapor ve "veri girin" düğmeleri çıkmaz), önceki yılları aynı yöntemle; PDF raporu ve tek sayfalık özet
  yeni sekmede. Tarayıcının geri düğmesi listeye döner.

**Veri:** her otelin son kaydı (en yeni yıl, aynı yılda en son kaydedilen) `model.load` + `compute` ile **bugünkü
yöntemle** yeniden hesaplanır; listedeki sayılar otelin kendi panelinde gördüğüyle aynıdır, eski sürüm kayıtları da
aktarılır. Aynı otel = aynı hesap (uid) + aynı ad. Üye = profil kaynağı `turizm-karbon-hesaplayici` olan ya da turizm
kaydı bulunan hesap; Kapsam 3 kayıtları sayılmaz (onlar `karbon-admin.html` → Firma Raporları'nda).

**Giriş ve okuma** (`admin-cloud.js`): Firebase varsayılan uygulama adı `karbon-admin.html` ile aynı, yani orada
açılan yönetici oturumu burada da geçerli. Yönetici listesi `admin.js` → `ADMIN_EMAILS` (karbon-admin.html ile aynı
üç adres); yönetici olmayan hesapla hiçbir kayıt okunmaz. Asıl koruma `firestore.rules` → `isAdmin()`
(e-posta listede **ve doğrulanmış** olmalı; e-posta/şifre hesabı doğrulanmamışsa Google ile girin).
Okuma: `firms` (üye profilleri) + `collectionGroup('items')` (tek sorgu, sıralama yok, dizin gerekmez).
Kurallar toplu okumaya izin vermezse panel kayıtları üye profilleri üzerinden tek tek okur ve bunu bir notla
söyler (profili olmayan eski hesapların kayıtları o durumda görünmez). Tam liste için `firestore.rules`'a eklenen
şu blok **Firebase konsolunda yayınlanmalı** (Firestore → Kurallar → Yayınla); `karbon-admin.html`'in Firma
Raporları sekmesi de bunu ister:

```
match /{path=**}/items/{reportId} {
  allow read: if isAdmin();
}
```

**Kod:** `assets/js/turizm/admin.js` (saf; `build()`, `detail()`, `query()`, `sheets()`, `isAdmin()`, `ms()`),
`admin-view.js` (çizim, `window.__admin`), `admin-cloud.js` (ES modülü), `assets/css/turizm-admin.css`
(yalnız tema değişkenleri), `turizm-admin.html` (yalnız işaretleme, `noindex`). `dashboard-view.js`'e `ctx.readOnly`.

**Testler:** `tests/unit/turizm-admin.test.mjs` (12: yönetici kontrolü, zaman damgaları, sayıların hesapla aynı olması,
gruplama, eski kayıt, etiketler ve beklenen yıl, haftalar, arama-süzme-sıralama, ayrıntı, Excel, bozuk veri),
`tests/e2e/turizm-admin.test.mjs` (8: giriş ve ret, özet, liste ve Excel indirme, salt okunur ayrıntı ve PDF, yedek
okuma yolu, boş veri ve çıkış, axe açık/koyu, 390 px). Örnek veri: `tests/helpers/admin-fixture.mjs`; Firestore
saplamasına `collectionGroup` ve `denyGroup` eklendi. Tema testi yönetim sayfasını da denetler.

## 2026-10-29 — Otel paneli v6.2 (adım şeridinin başındaki "Panel")

> **Durum:** 2026-10-29'da onaylandı, 2026-10-31'de canlıya alındı (GitHub web arayüzünden klasör klasör yüklendi;
> Squarespace'te değişiklik gerekmedi). Geri dönüş: bu bölümden önceki sürümün dosyalarını GitHub geçmişinden geri yükleyin.
>
> **Birleştirme notu:** `assets/css/turizm-chat.css` başka bir çalışmanın ("Sohbetle doldurma", 2026-10-30) dört
> parçalık yüklemesinin ilk parçasıdır; sayfa bu dosyayı henüz kullanmıyor. O çalışma tamamlanırken
> `turizm-karbon-hesaplayici.html`, `assets/js/turizm/*.js`, bu kılavuz ve testler **bu paneli içeren güncel sürümün
> üstüne** birleştirilmelidir; panelden önceki sürümle üzerine yazılırsa panel kaybolur. `setView()` sayfada
> `#panel-dash` ya da çizici yoksa paneli açmaz, yani yarım bir birleştirmede de adımlar gizlenmez.

**Ne yapar:** otel kullanıcısına tek ekranda gösterge paneli. Adım şeridinin başına **Panel** eklendi; panel
açıkken beş adım gizlenir, bir adıma tıklanınca adımlara dönülür. Verisi tarayıcıda saklı olan ya da hesabına
giriş yapınca son kaydı yüklenen kullanıcı doğrudan panelde açılır (`#panel` adresi de paneli açar).

**İçerik** (diğer yazılımlar incelendi: otel tarafında Greenview Portal, Weeva, EarthCheck; genel karbon
muhasebesinde Watershed, Persefoni, Greenly, Sami; gayrimenkulde CRREM "hedeften sapma yılı"):
- Üst alan: tesisin kendi eş derinlik çizgileri (rapor kapağıyla aynı üretici) üstünde oda-gece başına karbon,
  önceki yıla göre değişim, kıyas notu ve A–E kıyas şeridi (tesis, segment ortalaması, planla varılan değer).
  Panel ilk açıldığında tek, düzenlenmiş bir an: çizgiler soldan taranır, işaret yerine iner, sonar halkası yayılır,
  sayı sayarak gelir. `prefers-reduced-motion` ile hiçbiri olmaz.
- Gösterge kartları (6): toplam, toplantı alanı, karbon/m², enerji/m², su/oda-gece, atık/dolu oda; her birinde
  CHSB segment kıyası, önceki yıla göre değişim ve yıllar çizgisi.
- Yıllara göre (sütun grafik; toplam, oda-gece, kişi başı, enerji/m², su), emisyonların kaynağı (kapsam şeridi,
  ilk 6 kaynak + "Diğer", en büyük kaynağı azaltan önlem), net sıfır yolu (gerçekleşen yıllar + plan + NZMFH
  sınırı, kilometre taşları, ilk açık yılı), eylem planı (önlem ekle / çıkar: hesap anında yenilenir, Adım 3'teki
  kutular da işaretlenir; 2030 hedefinin karşılanma oranı), kaynaklar-tedarik-çalışanlar, hazırlık ve paylaşım
  (veri tamlığı, taksonomi, doğrulama, AB 2024/825 notu, PDF rapor / özet / kaydet düğmeleri).
- Her grafikte ipucu (fare ve klavye) ve "Tablo olarak göster" (erişilebilir tablo eşi).

**Yıllar arası takip:** `cloud.js` oturum açılınca ve her kayıttan sonra otel kayıtlarını `__tour.setHistory()`
ile verir. `dashboard.history()` her kaydın `inputs` alanını **bugünkü yöntemle yeniden hesaplar** (yıllar aynı
faktörler ve aynı HCMI motoruyla karşılaştırılır), aynı tesisin (ad eşleşmesi) her yıl için en son kaydını alır,
ekrandaki yılı dışarıda bırakır. Önceki yıl = ekrandaki yıldan önceki en son kayıt. Örnek otelde (ad "Örnek Tatil
Köyü") gerçek geçmiş yoksa `sampleRecords()` ile 3 yıllık **örnek** geçmiş gösterilir ve "örnek" diye etiketlenir.
Giriş yapılmamışsa yıllar kartında ücretsiz üyelik daveti, giriş yapılmışsa "Hesabıma kaydet" görünür.

**Kod:**
- `assets/js/turizm/dashboard.js` (saf, Node'da test edilir): `model(state, R, hist, {sample})`, `history()`,
  `sampleRecords()`, `delta()` (önceki yıla göre metin ve yön), `sfx()` (Türkçe yıl ekleri: 2022'ye, 2025'te,
  2023'ten), `lever()`, `nextSteps()` (YEK-G / I-REC verimlilik önlemlerinden sonra), `planInfo()`, `pathInfo()`.
- `assets/js/turizm/dashboard-view.js`: DOM ve satır içi SVG çizimi (renkler yalnız CSS sınıflarından), ipuçları,
  gösterge seçimi, tablo aç/kapa, açılış animasyonu, odak koruma (önlem eklenince odak kaybolmaz).
- `app.js`: `setView('dash'|'steps')`, `renderDash()` (panel açıkken her hesaptan sonra), `toggleMeasure()`,
  `dashAction()` (`data-dash-act`: add, remove, report, summary, field, claims, step), `__tour.setHistory /
  setAccount / setView / view`. `cloud.js`: `refreshHistory()`.
- CSS: `turizm-app.css` "PANEL" bölümü (yalnız tema değişkenleri); `theme-sea.css`'e koyu üst alanda durum renkleri
  `--hero-good / --hero-bad / --hero-warn` eklendi (iki modda aynı). `appVersion` 6.2.0.

**Testler:** `tests/unit/turizm-dashboard.test.mjs` (7): Türkçe ekler, değişim yönü, geçmişin seçimi ve yeniden
hesabı (eski sürüm kaydı dahil), örnek geçmiş, modelin hesapla aynı olması, yıl sırası. `tests/e2e/turizm-v6.test.mjs`:
"panel: …" (boş davet, örnek, önlem ekle/çıkar, grafik seçimi, tablo, klavye ipucu, adımlara dönüş, telefonda taşma
yok) ve "panel: hesaba kaydedilen yıllar …" (iki yıl kaydedilir, 2024 aynı yöntemle yeniden hesaplanır, çıkışta
davet); erişilebilirlik testleri paneli de açık ve koyu modda tarar.

## 2026-10-29 — Sürdürülebilirlik raporu v6.1 (Adım 5): PDF rapor, tek sayfalık özet, kapak logosu, karbon dışı göstergeler

> **Durum:** 2026-10-29'da onaylandı ve canlıya alındı (GitHub web arayüzünden klasör klasör yüklendi; Squarespace'te
> değişiklik gerekmedi). Geri dönüş: bu bölümden önceki sürümün dosyalarını GitHub geçmişinden geri yükleyin.
> Bu sürüm iki çalışmanın birleşimidir: 21 Ekim'de onaylanan 10 sayfalık rapor tasarımı + 29 Ekim'de başka bir
> oturumda yapılan karbon dışı göstergeler ve AB 2024/825 ifade düzeltmeleri (o oturumun `claude/rapor-pdf.patch`
> dosyasındaki modal önizleme ve `turizm-report.css` alınmadı; rapor yeni sekmede açılan tek HTML'dir).

**Ne yapar:** otel hesabı tamamlanınca Adım 5'teki rapor kartında iki düğme var:
- **PDF raporu oluştur:** kapaklı A4 rapor (örnek otelde 11 sayfa) yeni sekmede açılır.
- **Tek sayfalık özet:** tur operatörleri ve kurumsal müşteriler için tek A4 sayfa.

Açılan sekmedeki **PDF olarak kaydet** düğmesi tarayıcının yazdırma penceresini açar (hedef: "PDF olarak kaydet").
Sunucu, ek kütüphane ya da üyelik gerekmez; belge tamamen tarayıcıda üretilir ve sayılar ekrandakilerle aynı
`compute(state)` sonucundan gelir. Kartta **Kapak için logo ekle** ile otel logosu yüklenir (aşağıda).

**Rapor sayfaları** (örnek otelde 11; bölüm numaraları ve içindekiler otomatik): kapak · yönetici özeti ve
içindekiler · 1 tesis ve raporlama sınırları · 2 karbon ayak izi (kapsam ve kaynak dağılımı, enerji ve emisyon
defteri) · 3 CHSB 2026 Türkiye kıyası · 4 kaynaklar, tedarik ve çalışanlar (misafir gecelemesi başına karbon,
enerji, su, atık, kimyasal; yenilenebilir elektrik, geri kazanım, yerel satın alma ve çevre eğitimi oranları) ·
5 azaltım planı · 6 NZMFH net sıfır yol haritası · 7 uyum, etkinlik ve dengeleme (Yeşil Taksonomi, etkinlik
örneği, kalan emisyon, "Bu raporun kullanımı (AB 2024/825)") · 8 yöntem, emisyon faktörleri, terimler ·
9 beyan (imza alanı) ve arka kapak bandı. Defter 12 satırı, faktör tablosu 11 satırı aşarsa kendi sayfasına
geçer. Net sıfır hesabı yoksa 6, kaynak/tedarik/çalışan verisi hiç yoksa 4 atlanır; boş bloklar basılmaz.

**Karbon dışı göstergeler (karbon hesabına girmez):**
- Yeni alanlar `hotel.esg`: `chemicalsKg` (kimyasal, kg/yıl), `purchaseTotalTl` ve `purchaseLocalTl` (toplam ve
  yerel tedarikçilerden satın alma, TL/yıl), `staff` (ortalama çalışan), `staffTrained` (çevre eğitimi alan).
  Ekranda Adım 1'de "Kimyasal, tedarik ve çalışanlar" kutusu; Adım 2'de 4 kişi başı kutusu (`#intens_guest`).
- `compute.js` → `R.esg` (`esgOf`): `perGuest {kwh, waterM3, wasteKg, chemKg, co2Kg}` (misafir gecelemesi
  başına = otel raporlarındaki "kişi başı"), `localPct`, `trainedPct`, `recycleRate`, `wasteT`, `any`.
  Yerel > toplam ya da eğitim alan > çalışan girilirse oran hesaplanmaz ve "Veri kontrolü"nde uyarı çıkar.
- JSON çıktısında `sustainability` bloğu; logo JSON'a girmez. `appVersion` 6.1.0.

**Kapak logosu:** `hotel.logo` = tarayıcıda en çok 600 × 240 piksele sığdırılmış PNG (JPEG ise JPEG) data URL.
PNG, JPEG, SVG, WebP kabul edilir (en çok 5 MB); SVG baskıda net çıksın diye kutuya kadar büyütülür, en/boy
oranı viewBox'tan okunur. `model.logoOf()` yalnız `data:image/png|jpeg;base64` biçimini ve en çok 400.000
karakteri kabul eder (başka her şey `null`; rapora `esc()` ile girer). Logo kapakta beyaz bir plakada, sayfa
başlıklarında küçük, özette üstte görünür; yoksa cOmmited yazısı. Tarayıcı belleğine ve kullanıcı "Hesabıma
kaydet" derse bulut kaydına durumla birlikte gider.

**AB 2024/825 (ECGT) ifadeleri:** ekranda, beyanda, özette ve raporda dengelemeye dayalı "karbon nötr / iklim
nötr" iddiası yok; "karbon nötr konaklama/etkinlik" yerine "dengeleme maliyeti"; "yeşil elektrik" yerine
"yenilenebilir elektrik belgesi" (Turizm + Kapsam 3); Adım 5'te "misafirlere nasıl anlatabilirsiniz"
(yapabilirsiniz / yapmayın) kutusu; Metodoloji'de "Çevresel iddialar" bölümü. `tests/unit/turizm-esg.test.mjs`
bu ifadelerin yalnız tırnak içinde, yasak örneği olarak geçebildiğini denetler.

**Kod:**
- `assets/js/turizm/report.js` → `TURIZM.report.build(state, R, opts)` belgenin HTML metnini döndürür (DOM'a
  dokunmaz; Node'da da çalışır). `opts.variant`: `'report'` (varsayılan) ya da `'summary'` (tek sayfa).
  `canBuild(state, R)` → `{ok, reason}`: düğmelerin durumu ve kullanıcıya gösterilen açıklama. Diğer `opts`:
  `toolbar` (ekrandaki kaydet çubuğu), `sample` (örnek otel etiketi), `fontCss` (yerel yazı tipi; verilmezse
  Google Fonts DM Sans), `generatedAt`, `reportId`.
- `app.js` → `reportState()` her hesapta düğmeleri (`aria-disabled`), logo önizlemesini ve açıklamayı günceller;
  `openReport(variant)` belgeyi `window.open('', '_blank')` + `document.write` ile açar. Açılır pencere
  engellenirse kullanıcıya söylenir. Belge açıldıktan sonra veri değişirse "düğmeye yeniden basın" uyarısı çıkar.
  Logo: `onLogoFile()` → `rasterLogo()`.
- Tasarım: sabit A4 sayfalar (`@page` kenar boşluğu 0, `print-color-adjust: exact`), grafikler satır içi SVG
  (mm biriminde), kapak deseni tesis adı, şehir ve yıldan üretilen eş yükselti çizgileri (`_isobaths`: her
  tesise özgü, her seferinde aynı). Kapsam renkleri S1 `#D4643A`, S2 `#0B6FA0`, S3 `#13906A`; A–E not renkleri.
  `CO<sub>2</sub>e` yazılır ve `≤`, `★` kullanılmaz (DM Sans'ta olmayan karakter başka yazı tipine düşmesin).
- Yazı tipi: belgedeki Google Fonts bağlantısı `media="print"` + `onload` ile yüklenir (yavaş ağda ya da
  engelleyici eklentide sayfa beklemez). "PDF olarak kaydet" yazı tipini en çok 3 sn bekler.
- Tema: logo önizleme zemini `--logo-plate` (theme-sea.css; koyu modda da beyaz).

**Denetim:**
```bash
node tools/report-sample.mjs /tmp/rapor            # örnek otel, kurgusal logoyla (tests/fixtures/ornek-logo.png):
node tools/report-sample.mjs /tmp/rapor --no-logo  #   ornek-surdurulebilirlik-raporu.pdf + ozeti.pdf + sayfa PNG'leri;
                                                   #   her sayfada kalan boşluğu (mm) yazar, taşma varsa hata döner
```
Yazı tipi dosyaları `@fontsource-variable/dm-sans` geliştirme bağımlılığından gelir (internet gerekmez).
Testler: `tests/unit/turizm-report.test.mjs` (15) sayfa sayısı, sayıların hesapla aynı olması, içindekiler, eksik
ve uç veriler, HTML kaçışı, defter satırları = HCMI toplamı, kaynaklar bölümü, özet, logo;
`tests/unit/turizm-esg.test.mjs` (9) göstergeler ve ifade denetimi; `tests/e2e/turizm-v6.test.mjs` rapor (11
sayfa, PDF 11 sayfa), özet (PDF 1 sayfa), logo yükleme/SVG/kaldırma, gösterge alanları ve uyarılar.

**Sıradaki:** İngilizce rapor (metinler şimdilik `report.js` içinde; çeviri için tek tabloya taşınmalı),
yıllar arası karşılaştırma (önceki yılın kaydı Firestore'da varsa).

## 2026-10-20 — Turizm v6: resmî HCMI motoru ve yeni ekranlar (2026-10-21'den beri CANLI)

> **Durum:** v6 2026-10-21'de canlıya alındı. `turizm-karbon-hesaplayici.html` artık v6'dır; commitedevents.app
> iframe'i bunu açar (Squarespace'te değişiklik yapılmadı). Eski sürüm (v5) `turizm-karbon-hesaplayici-v5.html`
> olarak arşivde; eski önizleme adresi `turizm-karbon-hesaplayici-v6.html` canlı sayfaya yönlendirir.
> Canlıya alımdan sonra 223 birim + 16 uçtan uca test geçti. Geri dönüş: aşağıdaki "Canlıya alma ve geri dönüş".

### Ne değişti (kullanıcı gözünden)

- **Enerji defteri:** faturalar tek tabloda; HCMI'nın 32 enerji türünün tamamı eklenebilir, her türün
  kendi birimleri var (m³, kWh, litre, kg, MWh, ton…). Her satırın karbonu yazarken görünür. Birim
  değiştirilince miktar ve fiyat **aynı enerjiye** çevrilir (yanlışlıkla birim değiştirmek sonucu bozmaz).
- **Türkçe sayı girişi:** `1.480.000` ve `12,5` doğru okunur (eski `type="number"` alanlar "1.480.000"i
  1,48 sanıyordu). Okunamayan değer kırmızıyla işaretlenir ve hesaba **boş** girer; sessiz tahmin yok.
- **Resmî hesap:** otel ayak izi resmî HCMI v2.0 Excel aracıyla birebir aynı motorla hesaplanır
  (67 senaryoda 1e-12 doğrulukla karşılaştırıldı). Türkiye şebeke elektriği faktörü Enerji ve Tabii
  Kaynaklar Bakanlığı'nın tüketim noktası faktörüdür; rapor yılına göre seçilir, kaynağı ekranda bağlantılıdır.
- **HCMI seçenekleri:** soğutucu gazlar (41 gaz, kg) ya da "bilmiyorum → %1", araç yakıtı ya da "%1",
  dış çamaşırhane (kg / dolu odadan tahmin / tedarikçi enerji payı), YEK-G / I-REC belgeleri (en çok 2),
  özel alanlar (rezidans, kiracı), ülke/bölge (HCMI'nın 260 ülkesi, Türkçe adlarla).
- **Veri kontrolü:** motorun ve sayfanın uyarıları tek listede; "Alana git" ilgili alanı açıp odaklar.
- **Net sıfır:** NZMFH 2. baskı Tablo 3, Kategori 1 (bina enerjisi) — üç ölçütten en az biri; tablo görünümü.
- **Çıktılar:** beyan, yönetici özeti, JSON (`commited.hotel.hcmi/2`), WhatsApp, **beyanı PDF olarak kaydet**
  (yalnız beyan kartı basılır), kapaklı **sürdürülebilirlik raporu** ve **tek sayfalık özet** (en üstteki bölüm).
- **Eski kayıtlar** (tarayıcıdaki `commited-hotel-v1` ve Firestore'daki eski `inputs`) açılırken
  otomatik aktarılır; aktarım notları kullanıcıya gösterilir.

### Sayılar neden değişti (aynı örnek otel: 1.038 → 1.060 tCO₂e, CPOR 33,7 → 34,4; not B aynı)

| Kalem | v5 | v6 (HCMI v2.0) |
|---|---|---|
| Doğal gaz | 2,045 kgCO₂e/m³ (DEFRA) | 2,155 kgCO₂e/m³ |
| Motorin (jeneratör) / (araç) | 2,56 / 2,56 kgCO₂e/L | 2,867 / 2,706 kgCO₂e/L |
| Benzin (araç) | 2,08 | 2,430 kgCO₂e/L |
| Dış çamaşırhane | 0,65 kgCO₂e/kg sabit | ton başına 180 kWh elektrik + 1.560 kWh gaz + 111 L fuel oil 2 (≈0,72 kg/kg) |
| R-410A | GWP 2088 | 2100 (HCMI listesi) |
| Toplantı metriği | ÷ satılan salon saati | ÷ (365 gün × 10 saat) — HCMI kuralı; "salon saati" alanı kaldırıldı |
| Şebeke elektriği | 0,469 (sabit) | rapor yılına göre ETKB; 2024+ için yayımlanmış en güncel (2023: 0,469) |

Acente hesabı **değişmedi** (örnek acente 1.128.222 kg, birebir).

### Mimari

```
assets/js/hcmi-data.js      resmî HCMI Excel'inden üretilmiş veri (tools/build-hcmi-data.py) — elle düzenlenmez
assets/js/hcmi-engine.js    HCMI v2.0 hesap motoru (saf fonksiyon)            → globalThis.HCMI
assets/js/tr-reference.js   Türkiye şebeke faktörleri (ETKB 2020-2023), ülke adları, fatura ipuçları → TR_REFERENCE
assets/js/benchmarks.js     CHSB 2026 Türkiye segment ortalamaları, A–E notu   → BENCH
assets/js/pathway.js        NZMFH 2. baskı net sıfır kilometre taşları         → NZPATH
assets/js/measures.js       13 azaltım önlemi, HCMI ile yeniden hesap, MACC     → MEASURES
assets/js/num-input.js      Türkçe sayı okuma / biçimleme                       → NUM
assets/js/turizm/model.js   sayfanın TEK durum nesnesi, eski kayıt aktarımı, HCMI girdisine çeviri
assets/js/turizm/compute.js ekrandaki her sayı: compute(state) (saf)
assets/js/turizm/agency.js  acente hesabı (v5 ile aynı)
assets/js/turizm/texts.js   beyan, özet, JSON, WhatsApp metinleri
assets/js/turizm/storage.js tarayıcı belleği (commited-turizm-v2; eski anahtarı okur)
assets/js/turizm/report.js  sürdürülebilirlik raporu ve tek sayfalık özet: build() HTML metni üretir (DOM'a dokunmaz)
assets/js/turizm/dashboard.js       otel paneli: model() ve history() (DOM'a dokunmaz)
assets/js/turizm/dashboard-view.js  otel paneli çizimi (DOM + satır içi SVG; readOnly: yönetim paneli)
assets/js/turizm/admin.js · admin-view.js · admin-cloud.js   yönetim paneli (turizm-admin.html): veri (saf) · çizim · giriş/okuma
assets/js/turizm/ui.js · form.js · render.js · chart.js · app.js   arayüz (DOM)
assets/js/turizm/cloud.js   Firebase üyelik ve kayıt (ES modülü; yüklenemezse sayfa üyeliksiz çalışır)
assets/css/turizm-app.css   sayfa stilleri (yalnız theme-sea.css değişkenleri; sabit renk yok)
```

Akış: **form alanı** (`data-bind="hotel.area.rooms"`) → **durum** (`model.js`) → `compute(state)` →
`render.all()`. Yazarken 140 ms bekleyip yeniden hesaplar. Hesap katmanı (model → compute → texts) DOM'a
dokunmaz; Node testleri aynı dosyaları doğrudan çalıştırır (`tests/helpers/load-hcmi.mjs` → `APP_SCRIPTS`,
sayfadaki `<script>` sırasıyla aynı olmalı).

**Durum şeması** (`commited.turizm.state/2`, ayrıntı `model.js` → `emptyState()`): `hotel` (tesis, alanlar,
doluluk, `energy[]` satırları `{id,typeId,unit,total,price,privateActual,efMode,manualEf,heating}`, `market[]`,
`refrigerants`, `mobileFuels`, `privateSpace`, `laundry`, `extras`, `pv`, `prices`, `benchRef`, `measures[]`,
`netZero`, `taxonomy`, `event`), `agency`, `options.saveLocal`. `normalize()` dışarıdan gelen her veriyi
(bellek, bulut, JSON) güvenli hale getirir; bilinmeyen alanları atar.

**Firestore kaydı** (`reports/{uid}/items/{id}`): alan adları v5 ile aynı (`type, sector, company, year,
total [kg], cpor, grade, userEmail, createdAt`) — admin paneli değişmeden okur. Yeni: `appVersion: "6.0.0"`,
`inputs` artık durum şeması (tarayıcı tercihi `options` buluta gitmez), `hcmi` JSON çıktısı `commited.hotel.hcmi/2`.
Firestore kurallarında değişiklik gerekmez.

**Eski kayıt aktarımı** (`model.fromLegacy`): v5 alan kimlikleri (`h_elec_grid`, `h_gas` …) enerji
satırlarına; fuel-oil → "Fuel oil 2", bölgesel ısıtma → "Satın alınan sıcak su", YEK-G → belge satırı,
soğutucu gaz GWP → HCMI gazı (2088→R-410A …), çamaşırhane kg → tonaj yöntemi; salon saati artık
kullanılmaz. Kullanıcıya aktarım notu gösterilir. Örnek otel de bu yoldan doldurulur (her "örnekle doldur"
aktarımı da sınar).

### Testler

```bash
npm install                     # bir kez
npm test                        # 268 birim testi: HCMI motoru (resmî Excel altın referansı), Türkiye faktörleri,
                                #   kıyas, net sıfır, önlemler, Türkçe sayı, durum modeli, hesap katmanı, rapor, panel,
                                #   yönetim paneli, göstergeler, tema
npm run test:e2e                # 31 uçtan uca test: Turizm sayfası (19) + Turizm ve Kapsam 3 erişilebilirliği (4)
                                #   + yönetim paneli (8)
node tests/e2e/probe-v6.mjs /tmp/ekran   # açık/koyu/telefon tam sayfa ekran görüntüleri
```

Uçtan uca testler gerçek Chromium'da çalışır, Firebase ve CDN'i saplar (internet gerekmez) ve şunları
denetler: boş açılış, örnek sonuçlarının Node hesabıyla aynı olması, Türkçe sayı ve hatalı giriş, enerji
satırı ekle/sil/birim/elle faktör, HCMI seçenekleri, önlemler ve patika, acente, tarayıcı belleği ve eski
anahtar aktarımı, üyelik (kayıt → kaydet → çıkış → giriş → son kayıt; eski kaydı "Kayıtlarım"dan açma),
üyelik şartı (ziyaretçi veri giremez, örnek ve panel serbest; üyelik modülü yüklenemezse kilit açılır),
kopyala/PDF, PDF sürdürülebilirlik raporu, axe (WCAG 2.1 AA) açık ve koyu modda, 390 px'te yatay kaydırma olmaması.
GitHub Actions (`.github/workflows/ci.yml`, 2026-10-21'den beri etkin) `main`'e her yüklemede ve her pull
request'te ikisini de çalıştırır; sonuç GitHub'da **Actions** sekmesinde görünür (elle: Actions → testler → Run workflow).

### Canlıya alma ve geri dönüş

2026-10-21'de yapıldı (GitHub'da "Turizm v6 canliya alindi; v5 arsivde" yüklemesi). İzlenen adımlar:

1. `python3 tools/promote-v6.py` — v5'i `turizm-karbon-hesaplayici-v5.html` olarak arşivler, v6'yı canlı
   adrese yazar (kendi bağlantısı ve önizleme şeridi düzeltilir), `-v6.html`'i yönlendirmeye çevirir.
   Script artık tekrar çalıştırılırsa "önizleme sayfası değil" deyip hiçbir şey yapmaz.
2. `npm test && npm run test:e2e` (testler iki durumu da tanır).
3. Üç HTML dosyası tek yüklemede GitHub'a gönderildi (`assets/` zaten yüklüydü).
4. Squarespace'te değişiklik **gerekmedi** (iframe adresi aynı).

**Geri dönüş** (v5'e dönmek gerekirse): `turizm-karbon-hesaplayici-v5.html`'in içeriğini
`turizm-karbon-hesaplayici.html`'e kopyalayıp GitHub'a yükleyin; `assets/` dosyaları yerinde kalabilir.
Kullanıcıların v6'da kaydettiği bulut kayıtları v5'te açılmaz (yeni `inputs` şeması); toplam, CPOR ve not
alanları aynı olduğu için yönetici panelinde görünmeye devam eder.

### Bilinen sınırlar / sıradaki işler

- Resmî Excel aracında 7 enerji satırı sınırı var; v6 24 satıra izin verir (hesap yöntemi aynı).
- Önlem katsayıları ve yatırım tutarları gösterge değerdir (`measures.js` → `COEF`); sektör verisiyle
  güncellenebilir. Isıtma önlemleri LPG'yi varsayılan olarak etkilemez (satırda "ısıtmada kullanılıyor").
- 2024 ve sonrası için ETKB tüketim noktası faktörü yayımlanınca yalnız `tr-reference.js` → `GRID_YEARS`
  tablosuna satır ekleyin (`tests/unit/tr-reference.test.mjs` rakamları denetler).
- Kapsam 3 sayfası: `food_*` faktörleri doğrulandı; EPA SEF (USD 2022) harcama faktörlerinin TL kuru ve
  enflasyon dönüşümü ayrıca gözden geçirilmeli. Kullanıcı adı ve kayıt başlıkları artık `esc()` ile yazılıyor
  (yalnız kullanıcının kendi tarayıcısını etkileyebilecek bir açıktı; 2026-10-21'de canlıya çıktı).

## 2026-10-19 değişikliği — tek ürün, iki menü, yalnız turizm

Sitede iki ayrı hesaplayıcı vardı: **Turizm Karbon Hesaplayıcı** (HCMI v2.0, otel + acente) ve
**Firma Karbon Hesaplayıcı** (KOBİ; tekstil + turizm sektör soruları, tedarikçi/alıcı modları).
Bunlar tek ürün altında birleştirildi:

| Menü | Dosya | Ne yapar |
|---|---|---|
| **Turizm Karbon Hesaplayıcı** | `turizm-karbon-hesaplayici.html` | Otelin kendi ayak izi (Kapsam 1-2 + dış çamaşırhane), HCMI oda-gece/toplantı metrikleri, CHSB 2026 kıyası, azaltım, net sıfır, rapor; acente sekmesi. Ayrıntı: proje dokümanı `otel-hcmi-modulu.md`. |
| **Kapsam 3 Karbon Hesaplayıcı** | `kapsam3-karbon-hesaplayici.html` | Turizm işletmesinin tedarik zinciri: satın alınan gıda, konaklama (oda-gece), uçuş/transfer, nevresim, kimyasal, hizmetler — Kapsam 3.1 + 3.4. Eski "alıcı modülü"nün turizme uyarlanmış hali. |

Kararlar:

- **Tekstil tamamen kaldırıldı** (sektör, sorular, malzemeler, örnekler, Excel şablonu).
- Eski firma hesaplayıcısındaki **turizm sektör formu kaldırıldı**, çünkü aynı işi daha gelişkin
  yapan Turizm Karbon Hesaplayıcı var (HCMI tahsisi, CHSB kıyası, senaryo, net sıfır). İki araç
  arasındaki gelişkin olan bu olduğu için o kaldı.
- Eski firma hesaplayıcısının **alıcı modülü** (hibrit Kapsam 3.1 motoru, veri kalitesi 1-5,
  kapsama/ekstrapolasyon, Pareto, öncelik listesi, Excel/PDF, Firebase giriş + bulut kayıt)
  turizmde karşılığı olmayan tek parça olduğu için **Kapsam 3 Karbon Hesaplayıcı** olarak korundu.
- İki sayfanın hero alanının üstünde **aynı menü** var (`.cm-switch`). Menünün CSS'i artık ortak tema
  dosyasındadır (`assets/css/theme-sea.css`); HTML'i iki dosyada aynıdır, değiştirirseniz ikisini birlikte
  değiştirin. Bağlantılar göreli olduğu için iframe içinde sayfa değiştirir.
- Kapsam 3 sayfası Turizm sayfasıyla aynı renk paletine ve fonta (DM Sans) geçirildi.
- `karbon-hesaplayici.html` artık yalnızca **yönlendirme**: commitedevents.app/karbon-hesaplayici
  sayfasındaki iframe bu adresi çağırıyor. Squarespace iframe'i `kapsam3-karbon-hesaplayici.html`'e
  çevrildikten sonra silinebilir. Eski tam kod git geçmişinde.

## 2026-10-20 değişikliği — "Deniz" teması (yeşil → mavi)

Ziyaretçi ana siteden (commitedevents.app) ayrıldığını hissetsin diye iki hesaplayıcının yeşil
görünümü **deniz mavisine** çevrildi: derin okyanus degradeli üst alan, altında hareket eden üç katmanlı
dalga, açık "deniz sisi" sayfa zemini, Commited sarısı (`--accent`) yalnız aktif menü ve vurgularda.

- **Tek kaynak:** `assets/css/theme-sea.css`. Renkler, koyu mod, üst alan (`.hero`), dalgalar
  (`.sea-waves`) ve ortak menü (`.cm-switch`) yalnız burada. Sayfalarda **sabit renk kodu yoktur**;
  hepsi `var(--...)` ile gelir. Tema değiştirmek için bu dosyadaki `:root` değişkenlerini düzenleyin.
- **Koyu mod iki yerde tanımlıdır ve ikisi aynı olmalıdır:** `@media (prefers-color-scheme: dark)` ve
  `:root[data-theme="dark"]`. `tests/unit/theme.test.mjs` eşitliği, sayfalarda sabit renk
  kalmadığını ve kullanılan her değişkenin tanımlı olduğunu denetler.
- **Dalga işaretlemesi** iki HTML'de aynıdır; `python3 tools/sea-waves-snippet.py` ile üretilir.
  `prefers-reduced-motion` açıksa dalgalar hareket etmez.
- **Yayın sırası:** `assets/css/theme-sea.css` dosyasını HTML'lerden **önce** yükleyin; yoksa canlı
  sayfa kısa süre biçimsiz görünür.
- Kapsam 3 PDF raporunun paleti de maviye çevrildi (`BRAND`, `FOAM`, `GRAY`, `LGRAY`, `C1-C3`).
- Kapsam 3'te etiketsiz form alanları için `a11yLabels()` eklendi (ekran okuyucu uyumu); `axe-core`
  testleri WCAG 2.1 A/AA'da iki sayfa × açık/koyu × boş/dolu/sonuç ekranlarını denetler.

### Squarespace sayfa zemini (2026-10-20, canlı)

iframe'in dışındaki yeşil Squarespace zemini de maviye çevrildi; **yalnız** iki hesaplayıcı sayfasında.
Kod, **Web Sitesi → Sayfalar → Özel Kod → Özel CSS** içinde, mevcut kodun en sonunda
`HESAPLAYICI SAYFALARI - "DENIZ" TEMASI (2026-10-20)` başlıklı blok. Ana sayfa ve diğer sayfalar yeşil kalır.

- Sayfalara özel olmasını `body#collection-<kimlik>` seçicileri sağlar:
  Turizm = `collection-6a7c6126fae79c31708febfa`, Kapsam 3 = `collection-6a670c5a88ee2d075a23ced5`.
  Yeni hesaplayıcı sayfası eklenirse kimliğini tarayıcı konsolunda `document.body.id` ile öğrenip her
  `body#collection-…` seçicisinin yanına ekleyin.
- Bloğun kaynağı `docs/squarespace-deniz-temasi.css` (yalnız yeni blok), sitenin **tüm** Özel CSS'inin
  o günkü yedeği `docs/squarespace-ozel-css-tamami.css`. Squarespace'te değişiklik yapıldıkça yedek
  güncellenmelidir; Squarespace CSS sürüm geçmişi tutmaz.
- Neleri değiştirir: sayfa zemini (açık denizden derin laciverte degrade), şeffaf üst menü ve bölümler,
  lacivert menü düğmeleri (aktif sayfa altın sarısı `#E8C547`), beyaz "hap" içinde logo, lacivert açılır
  menüler, beyaz düğmelerde lacivert yazı, yuvarlak köşeli ve gölgeli hesaplayıcı penceresi, mobil menü.
- Renkler iframe içindeki temayla aynı (`assets/css/theme-sea.css`): `#05304D`, `#064A73`, `#0A5F8F`, `#8FD0EE`.
- Geri almak için: Özel CSS'teki bloğun tamamını silin.
- Not: Squarespace Özel CSS derleyicisi LESS'tir; `~"…"` gibi LESS kaçışları normaldir. Kaydetmek için
  düzenleyicide **Kaydedin** düğmesine basın; Escape ile kapatmak değişikliği iptal eder.
- 8 numaralı blok (hareketli deniz zemini, 2026-10-31): kaynak `docs/squarespace-deniz-dalgalari.css`, üretici
  `tools/deniz-dalga-uret.mjs`. 1-7'nin **altına** eklenir; ayrıntı en üstteki "hareketli deniz zemini" bölümünde.

### Testler (tema turu; güncel komutlar için en üstteki v6 bölümüne bakın)

```bash
npm install                 # bir kez (Playwright, axe-core, SheetJS, jsPDF)
npm test                    # birim testleri (tema tutarlılığı + HCMI + v6 hesap katmanı)
node --test tests/e2e/a11y.test.mjs                       # erişilebilirlik (Chrome gerekir)
node tests/e2e/capture-baseline.mjs tests/golden/x.json   # örnek verilerle sayıları kaydeder
node tests/e2e/shots.mjs /tmp/ekran                       # açık/koyu/mobil ekran görüntüleri
```
E2E testleri CDN ve Firebase'i yerel saplamalarla (`tests/e2e/stubs`) değiştirir; internet gerekmez.
`tests/golden/baseline-v4.json` tema değişiminden önceki sayıları tutar (otel 1.038 t, acente 1.128 t,
Kapsam 3 1.418.888 kg); tema ve görünüm değişiklikleri bu sayıları değiştirmemelidir.

## Dosyalar

| Dosya | Görev |
|---|---|
| `turizm-karbon-hesaplayici.html` | Turizm Karbon Hesaplayıcı **v6 — canlıdaki** sürüm (2026-10-21'den beri; otel HCMI + acente). Yalnız işaretleme; davranış `assets/js/turizm/`, görünüm `assets/css/turizm-app.css`. |
| `turizm-karbon-hesaplayici-v5.html` | Önceki canlı sürüm (v5, tek dosya) — geri dönüş için arşiv; menüde yok. |
| `turizm-karbon-hesaplayici-v6.html` | Eski önizleme adresi; paylaşılmış bağlantılar çalışsın diye canlı sayfaya yönlendirir. |
| `assets/js/hcmi-data.js`, `hcmi-engine.js` | Resmî HCMI v2.0 Excel'inin verisi ve hesap motoru. Veri `tools/build-hcmi-data.py` ile üretilir; motor `tests/golden/hcmi-oracle.json` (LibreOffice ile hesaplatılmış resmî Excel çıktıları, `tools/hcmi-oracle.py` + `tools/hcmi_scenarios.py`) ile doğrulanır. |
| `assets/js/tr-reference.js`, `benchmarks.js`, `pathway.js`, `measures.js`, `num-input.js` | Türkiye faktörleri ve kaynakları · CHSB 2026 kıyası · NZMFH net sıfır · azaltım önlemleri · Türkçe sayı. Her birinin başında kaynak ve kurallar yazılı. |
| `assets/js/turizm/*.js`, `assets/css/turizm-app.css` | v6 sayfasının uygulama katmanı (yukarıdaki "Mimari"). |
| `tools/deniz-dalga-uret.mjs`, `docs/squarespace-deniz-dalgalari.css` | Squarespace Özel CSS'ine eklenecek hareketli deniz zemini (8 numaralı blok) ve onu üreten betik. |
| `tools/promote-v6.py` | v6 önizlemesini canlı adrese taşıdı (2026-10-21; v5 arşivlendi). Tekrar çalıştırılırsa hiçbir şey yapmaz. |
| `tools/report-sample.mjs` | Örnek otel için sürdürülebilirlik raporu, tek sayfalık özet ve sayfa görüntüleri üretir; sayfa taşmalarını ölçer (en üstteki "Sürdürülebilirlik raporu v6.1" bölümü). `tests/fixtures/ornek-logo.*` kurgusal örnek logodur. |
| `.github/workflows/ci.yml` | GitHub Actions: `main`'e her yüklemede ve her pull request'te birim + uçtan uca testler (2026-10-21'den beri etkin). |
| `kapsam3-karbon-hesaplayici.html` | Kapsam 3 Karbon Hesaplayıcı (turizm tedarik zinciri). Firebase (giriş/kayıt), SheetJS (Excel), jsPDF (PDF) CDN'den yüklenir. |
| `karbon-admin.html` | Kapsam 3 hesaplayıcısının yönetici paneli: emisyon ve harcama faktörlerini düzenler, Firestore'a (`config/current`) yazar. Herkese açık sayfaya konmaz. Araç çubuğunda turizm yönetim paneline bağlantı var. |
| `turizm-admin.html` | Turizm yönetim paneli (2026-10-31): üyeler, otellerin sonuçları, satış fırsatları, Excel, otel ayrıntısı. Yalnız yöneticiler; herkese açık sayfaya konmaz. Ayrıntı en üstteki bölümde. |
| `config.default.json` | Kapsam 3 hesaplayıcısının tüm parametreleri (v4.0). Tek doğru kaynak. |
| `tools/inject-config.py` | `config.default.json`'u kapsam3 ve admin dosyalarındaki gömülü `DEFAULT_CONFIG`'e yazar. |
| `karbon-hesaplayici.html` | Eski adres → `kapsam3-karbon-hesaplayici.html` yönlendirmesi. |
| `karbon-metodoloji.html/.pdf` | Eski KOBİ modülünün metodoloji sayfası (tekstil içerir; hesaplayıcılardan bağlantı **yok**). Turizm metodolojisi artık v6 sayfasının "Metodoloji" bölümünde, verilerden otomatik üretiliyor. Bu dosyalar kaldırılabilir ya da Kapsam 3'e göre yeniden yazılabilir. |
| `karbon-mavisehir-rotary.html`, `karbon-rotary-admin.html` | Bağımsız kişisel hesaplayıcı (Rotary); bu değişiklikten etkilenmedi. |
| `assets/css/theme-sea.css` | İki hesaplayıcının ortak "Deniz" teması: tüm renkler, koyu mod, üst alan, dalgalar, ortak menü. Sayfalarda sabit renk kodu yok. |
| `tools/sea-waves-snippet.py` | İki sayfadaki özdeş dalga (`.sea-waves`) işaretlemesini üretir. |
| `docs/squarespace-deniz-temasi.css` | Squarespace Özel CSS'ine eklenen "Deniz" zemin bloğu (yalnız yeni blok). |
| `docs/squarespace-ozel-css-tamami.css` | Sitenin **tüm** Özel CSS'inin 2026-10-20 tarihli birebir yedeği. |
| `tests/`, `package.json` | Birim testleri (tema tutarlılığı), uçtan uca ve erişilebilirlik testleri (Playwright + axe), sayı referansları (`tests/golden`). Ayrıntı: "Testler" bölümü. |

## Kapsam 3 hesaplayıcısı — config v4.0

- `meta.version` **4.0**. Hesaplayıcı ve admin, Firestore'daki `config/current` kaydını yalnız sürüm
  eşleşirse kullanır. Buluttaki eski 3.1 kaydı (tekstil içerir) bu yüzden **otomatik olarak yok sayılır**;
  admin panelinde bir kez "Buluta kaydet" demek bulut kaydını v4.0'a çeker.
- `sectors` boş (`{}`) — admin içe aktarma kontrolü bu anahtarı beklediği için duruyor. Admin'deki
  "Sektörler & Sorular" sekmesi gizlendi.
- `purchaseMaterials` (miktar × faktör listesi):
  - **Konaklama** `stay_*` — kgCO₂e/oda-gece, CHSB 2026 Türkiye ortalaması (Turizm hesaplayıcısının
    acente sekmesiyle aynı değerler: lüks 59,6 · 5★ 48,9 · 4★ 37,9 · 3★ 25,4 · apart 20,2).
  - **Yolcu ulaşımı** `flight_*`, `coach_pkm`, `transfer_vkm` — DEFRA 2025 (uçuşlarda RF dahil),
    Turizm hesaplayıcısıyla aynı.
  - **Gıda** `food_*` — kgCO₂e/kg, Poore & Nemecek (2018) / Our World in Data küresel ortalama.
    ✅ 2026-10-20'de OWID CSV'leriyle **birebir doğrulandı** (19 kalem; `ghg-per-kg-poore`, zeytinyağı
    `food-emissions-supply-chain` aşamalarının toplamı 5,42). `tests/unit/kapsam3-config.test.mjs` değerleri
    ve sayfalara gömülü kopyanın `config.default.json` ile aynı olduğunu denetler.
  - Dış çamaşırhane 0,65 kgCO₂e/kg (Turizm hesaplayıcısıyla eşitlendi; önceki 0,9), nevresim (pamuk),
    kimyasallar, ambalaj (kağıt/karton/plastik ve geri dönüşümlüleri), cam, ahşap/mobilya, catering öğünü.
- `spendFactors` (harcama bazlı, kgCO₂e/USD): önceki sürümdeki EPA SEF v1.3 değerleri **aynen** taşındı;
  yalnızca turizme göre yeniden adlandırıldı ve sıralandı. Turizmle ilgisi olmayanlar (çelik, alüminyum,
  çimento, deri, deniz taşımacılığı hizmeti) çıkarıldı; `textile` → `linen` (nevresim, havlu, perde,
  üniforma; aynı 0,45 değeri). Yeni değer uydurulmadı.
- `buyerScenario`: mod değişimi karayolu → **demiryolu**; "muadil" senaryosu artık turizm çiftlerini
  içerir (sığır/kuzu → tavuk, karides → balık, iç hat uçuş → otobüs, birincil → geri dönüşümlü ambalaj).
- `benchmarks.tree_kg_per_year` 21 → **25** (Turizm hesaplayıcısıyla aynı).

**Parametre güncelleme akışı:** admin panelinde düzenle → "Buluta kaydet" (anında siteye yansır).
Gömülü varsayılanı da güncellemek için "JSON indir" → dosyayı `config.default.json` olarak kaydet →
`python3 tools/inject-config.py` → commit.

### Düzeltilen hata

Azaltım senaryosundaki **muadil kaydırıcısı hesaba girmiyordu**: kaydırıcı %0'dayken bile sabit %35
azaltım uygulanıyordu (`applyScenario`, `*rc` → `*c`). Artık kaydırıcı, ilgili kalemlerin ne kadarının
muadile geçtiğini gösterir; azalma faktör çiftinden hesaplanır. Ayrıca adım şeridindeki etiketin
ikinci bir beyaz hap gibi çizilmesi düzeltildi.

### Doğrulama (yerel headless Chrome, "Örnek otel verisi" düğmesi)

120 odalı örnek tatil köyü, 12 kalem, toplam satın alma 19 milyon ₺:

| | Değer |
|---|---|
| Hesaplanan (12 kalem) | 1.188.879 kgCO₂e |
| Kapsanmayan 3,08 milyon ₺ ekstrapolasyonu | +230.009 kgCO₂e |
| **Toplam Kapsam 3** | **1.418.888 kgCO₂e** (3.1: 1.418.002 · 3.4: 886) |
| Muadil senaryosu %100 / %50 / %0 | −612.285 / −306.143 / 0 kg |
| Mod değişimi %100 | −654 kg |

Python ile bağımsız hesapla birebir aynı. Turizm hesaplayıcısının değerleri değişmedi (otel 1.038 tCO₂e,
CPOR 33,7; acente 1.128 tCO₂e). PDF, Excel rapor, Excel şablonu indir/geri yükle, TR/EN, iki sayfa
arası menü geçişi, eski adres yönlendirmesi ve admin paneli test edildi; konsol hatası yok; 390 px
genişlikte yatay kaydırma yok.

### Açık işler

1. ✅ Squarespace menü adı "Kapsam 3 Karbon Hesaplayıcı" yapıldı ve /karbon-hesaplayici sayfasının
   iframe'i `kapsam3-karbon-hesaplayici.html`'e çevrildi (2026-10-19/20). Kalan: `karbon-hesaplayici.html`
   yönlendirme dosyası artık silinebilir (kimse eski adresi kullanmıyorsa).
2. ✅ `food_*` faktörleri kaynağıyla doğrulandı (2026-10-20, yukarıda).
3. `karbon-metodoloji.html/.pdf` hâlâ tekstil anlatıyor; turizm + Kapsam 3'e göre yeniden yazılmalı.
4. Kapsam 3'te yalnız 3.1 ve 3.4 var. Turizm için 3.5 (atık), 3.6 (iş seyahati), 3.7 (personel
   ulaşımı) ve 3.11/misafir ulaşımı eklenmek istenirse `computeBuyer()` sonucuna yeni `cats`
   anahtarları ve ayrı bir giriş kartı eklemek yeterli; rapor/PDF/Excel `cats` üzerinden çalışıyor.
5. Firestore'da eski "tedarikçi" tipi kayıtlı raporlar görüntülenebilir (renderResult'taki supplier
   dalı geriye uyumluluk için duruyor), ama yeni tedarikçi formu yok.

## Turizm hesaplayıcısı — üyelik ve boş açılış (2026-10-19, ikinci tur)

**Boş açılış.** Sayfa artık örnek verilerle değil **boş** açılır. Örnek 120 odalı tatil köyü ve örnek
acente değerleri koddaki `EXAMPLE` nesnesinde durur; otel ve acente sekmelerindeki bildirimdeki
"örnekle doldurun" bağlantısı (`data-example="otel" | "acente"`) bunları yükler. Fiyat varsayımları,
CHSB kıyas değerleri, acente katsayıları ve net sıfır yılları parametre olduğu için dolu kalır.
Örnekte açık gelen azaltım önlemleri (LED, GES, su armatürü) da yalnız örnekle birlikte işaretlenir.

**Üyelik ("Kayıt yok" kaldırıldı).** Oteller/acenteler ücretsiz üye olup verilerini hesaplarına kaydeder:

| Ne | Nerede |
|---|---|
| Giriş | Firebase Auth, Kapsam 3 ile aynı proje (`kobi-karbon-hesaplama`). E-posta + şifre veya Google. Şifremi unuttum var. Kayıtta doğrulama e-postası gönderilir. |
| Tesis profili | `firms/{uid}` — `name`, `type` (otel/pansiyon/acente/diger), `city`, `email`, `kvkkAccepted`, `kvkkAcceptedAt`, `createdAt`, `lastSavedAt`, `lastTotalKg` |
| Kayıtlar | `reports/{uid}/items/{id}` — `type: "hotel" \| "agency"`, `company`, `year`, `total` (kgCO₂e), `cpor`, `grade`, `inputs` (formdaki tüm alanlar), `hcmi` (JSON çıktısının tamamı, `commited.hotel.hcmi/1`) |

- **Firestore kurallarında değişiklik gerekmez**: `firms/{uid}` ve `reports/{uid}/items` zaten
  "kullanıcı kendi dokümanı, admin okur" kuralıyla açık.
- "Hesabıma kaydet" her basışta **yeni** kayıt ekler (yıllık ölçüm geçmişi oluşur); eskiler silinmez.
- Giriş yapan kullanıcının formu boşsa **son kaydı otomatik yüklenir**; "Kayıtlarım" listesinden
  istenen kayıt açılır.
- Kayıt formunda Aydınlatma Metni onayı zorunlu (link: commitedevents.app/yeni-sayfa — doğru
  KVKK sayfasıysa bırakın, değilse `tourism` sayfasındaki 3 bağlantıyı güncelleyin).
- Firebase modülü **dinamik** yüklenir: CDN'e ulaşılamazsa hesaplayıcı çalışmaya devam eder,
  yalnız üyelik düğmeleri gizlenir.
- Yerel saklama (`opt_save`) ve canlı hesap yalnız `<main>` içindeki alanları kapsar; üyelik
  penceresindeki şifre alanı asla saklanmaz.
- Admin paneli "Firma Raporları" sekmesi bu kayıtları "Turizm · Otel / Turizm · Acente" diye
  gösterir; Kapsam 3 sayfasının "Raporlarım" listesi turizm kayıtlarını göstermez.
- Gizlilik metni (Metodoloji altı) üyelikle saklanan verileri anlatacak şekilde güncellendi.

**Test (yerel, Firebase sahte modülüyle):** boş açılışta hata yok; örnekle 1.038 tCO₂e / 33,7;
üye olmadan "kaydet" → üyelik penceresi; KVKK onayı ve 6 karakter şifre kontrolü; kayıt sonrası
bekleyen kayıt otomatik yapılır; acente kaydı 1.128 tCO₂e; yeniden açıp giriş yapınca son kayıt
yüklenir; "Kayıtlarım"dan otel kaydı geri yüklenir; şifre localStorage'a yazılmaz; 390 px'te
yatay kaydırma yok. Canlı Firebase ile kayıt/giriş, Firebase Authentication → Authorized domains
listesinde `lkoseoglu.github.io` olduğu sürece çalışır (Kapsam 3 sayfası aynı alan adında çalışıyor).

## Squarespace'e gömme (2026-10-19 itibarıyla canlıdaki kod)

Her iki hesaplayıcı sayfasında tek bir **Kod** bloğu var. Blok, ızgaranın neresinde durursa dursun
küçük betik masaüstünde (≥768 px) kutuyu **sayfaya göre ortalar** ve en fazla 1240 px genişletir;
mobilde blok zaten tam genişlik olduğu için dokunmaz. (Önceki `width:92vw` yöntemi blok ortadayken
kutuyu sağa taşırıyordu.) Squarespace düzenleme modunda betik çalışmaz; kutu orada dar görünür, bu normal.

```html
<div id="cm-embed-turizm" style="width:100%;height:88vh;min-height:700px">
  <iframe src="https://lkoseoglu.github.io/commited-karbon-hesaplayici/turizm-karbon-hesaplayici.html"
          title="Turizm Karbon Hesaplayıcı" style="width:100%;height:100%;border:0;display:block" loading="lazy"></iframe>
</div>
<script>
(function(){
  var w=document.getElementById('cm-embed-turizm'); if(!w) return;
  function fit(){
    w.style.marginLeft='0px'; w.style.width='100%';
    var vw=document.documentElement.clientWidth; if(vw<768) return;
    var W=Math.min(vw-48,1240), l=w.getBoundingClientRect().left;
    w.style.width=W+'px'; w.style.marginLeft=((vw-W)/2-l)+'px';
  }
  fit(); window.addEventListener('resize',fit); window.addEventListener('load',fit); setTimeout(fit,800);
})();
</script>
```

Kapsam 3 sayfasında (`/karbon-hesaplayici`) aynı kod `cm-embed-kapsam3` kimliği ve
`kapsam3-karbon-hesaplayici.html` adresiyle duruyor.

**Squarespace düzenleme ipuçları:** kod bloğunu seçmek için bölümün sol üstündeki **Katmanlar**
simgesinden "Kod"a çift tıklayın (iframe tıklamaları yutar). Kod panelini **Escape ile kapatmayın**
(değişiklik sessizce iptal olur); bölümün boş bir yerine tıklayıp sonra "Kaydedin" deyin.

### Üst menü (Squarespace)

- Sıra: Anasayfa · Turizm Karbon Hesaplayıcı · Kapsam 3 Karbon Hesaplayıcı · Karbon 101 · Etkinlikler · Aydınlatma Metni.
- "Yeni Sayfa" (`/yeni-sayfa-4`, yarım kalmış taslak) menüden **Bağlantılı Değil**'e taşındı; silinmedi.
- `/karbon-hesaplayici` sayfasının başlığı ve menü adı "Kapsam 3 Karbon Hesaplayıcı" yapıldı; URL aynı kaldı.
- Buton görünümü **Web Sitesi → Sayfalar → Özel Kod → Özel CSS** içinde,
  `/* ===== Üst menü — buton görünümü (2026-10-19) ===== */` başlıklı blokta. Bulunulan sayfa sarı
  (`#E8C547`), iki hesaplayıcı koyu yeşil (`#0B2E22`; hesaplayıcı sayfalarında deniz temasının bloğu bunu
  `#05304D`'ye çevirir, ana sayfada yeşil kalır); seçiciler `href="/turizm-karbon-hesaplayici"` ve
  `href="/karbon-hesaplayici"`. Sayfa adresi değişirse bu iki seçici güncellenmeli. Geri almak için bloğu silin.

`karbon-admin.html`'i herkese açık sayfaya koymayın.
