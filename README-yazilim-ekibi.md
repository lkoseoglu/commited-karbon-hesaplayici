# Commited Turizm Karbon Hesaplayıcıları — Yazılım Ekibi Kılavuzu

commitedevents.app (Squarespace) sitesine iframe ile gömülen, sunucu gerektirmeyen (hesabı tamamen
tarayıcıda yapan) karbon hesaplama modülleri. GitHub Pages üzerinden yayınlanır:
`https://lkoseoglu.github.io/commited-karbon-hesaplayici/<dosya>.html`

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
- İki sayfanın hero alanının üstünde **aynı menü** var (`.cm-switch`). CSS ve HTML iki dosyada
  birebir aynıdır; değiştirirseniz ikisini birlikte değiştirin. Bağlantılar göreli olduğu için iframe
  içinde sayfa değiştirir.
- Kapsam 3 sayfası Turizm sayfasıyla aynı renk paletine ve fonta (DM Sans) geçirildi.
- `karbon-hesaplayici.html` artık yalnızca **yönlendirme**: commitedevents.app/karbon-hesaplayici
  sayfasındaki iframe bu adresi çağırıyor. Squarespace iframe'i `kapsam3-karbon-hesaplayici.html`'e
  çevrildikten sonra silinebilir. Eski tam kod git geçmişinde.

## Dosyalar

| Dosya | Görev |
|---|---|
| `turizm-karbon-hesaplayici.html` | Turizm Karbon Hesaplayıcı (otel HCMI + acente). Bağımlılık yok, tek dosya. |
| `kapsam3-karbon-hesaplayici.html` | Kapsam 3 Karbon Hesaplayıcı (turizm tedarik zinciri). Firebase (giriş/kayıt), SheetJS (Excel), jsPDF (PDF) CDN'den yüklenir. |
| `karbon-admin.html` | Kapsam 3 hesaplayıcısının yönetici paneli: emisyon ve harcama faktörlerini düzenler, Firestore'a (`config/current`) yazar. Herkese açık sayfaya konmaz. |
| `config.default.json` | Kapsam 3 hesaplayıcısının tüm parametreleri (v4.0). Tek doğru kaynak. |
| `tools/inject-config.py` | `config.default.json`'u kapsam3 ve admin dosyalarındaki gömülü `DEFAULT_CONFIG`'e yazar. |
| `karbon-hesaplayici.html` | Eski adres → `kapsam3-karbon-hesaplayici.html` yönlendirmesi. |
| `karbon-metodoloji.html/.pdf` | Eski KOBİ modülünün metodoloji sayfası (tekstil içerir; güncellenmesi gerekiyor, bkz. açık işler). |
| `karbon-mavisehir-rotary.html`, `karbon-rotary-admin.html` | Bağımsız kişisel hesaplayıcı (Rotary); bu değişiklikten etkilenmedi. |

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
    ⚠️ Bu değerler bu oturumda kaynak veri setine erişilemediği için birebir doğrulanamadı;
    OWID `ghg-per-kg-poore` CSV'siyle karşılaştırılıp gerekirse `config.default.json`'da düzeltilmeli.
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

1. Squarespace: menüdeki "Firma Karbon Hesaplayıcı -ÜCRETSİZ" → "Kapsam 3 Karbon Hesaplayıcı";
   o sayfanın iframe adresini `kapsam3-karbon-hesaplayici.html` yapın, sayfadaki açıklama metnini
   Kapsam 3'e göre yenileyin. Sonra `karbon-hesaplayici.html` yönlendirmesi silinebilir.
2. `food_*` faktörlerini kaynağıyla doğrulayın (yukarıda).
3. `karbon-metodoloji.html/.pdf` hâlâ tekstil anlatıyor; turizm + Kapsam 3'e göre yeniden yazılmalı.
4. Kapsam 3'te yalnız 3.1 ve 3.4 var. Turizm için 3.5 (atık), 3.6 (iş seyahati), 3.7 (personel
   ulaşımı) ve 3.11/misafir ulaşımı eklenmek istenirse `computeBuyer()` sonucuna yeni `cats`
   anahtarları ve ayrı bir giriş kartı eklemek yeterli; rapor/PDF/Excel `cats` üzerinden çalışıyor.
5. Firestore'da eski "tedarikçi" tipi kayıtlı raporlar görüntülenebilir (renderResult'taki supplier
   dalı geriye uyumluluk için duruyor), ama yeni tedarikçi formu yok.

## Squarespace'e gömme

```html
<iframe src="https://lkoseoglu.github.io/commited-karbon-hesaplayici/kapsam3-karbon-hesaplayici.html"
        style="width:100%;height:1400px;border:0;display:block" title="Kapsam 3 Karbon Hesaplayıcı"></iframe>
```

Turizm hesaplayıcısının gömme kodu ve Squarespace tuzakları için proje dokümanı `otel-hcmi-modulu.md`'ye bakın.
`karbon-admin.html`'i herkese açık sayfaya koymayın.

---

## Mavişehir Rotary kişisel hesaplayıcı (`karbon-mavisehir-rotary.html`) — v2 notları

Bu dosya, kurumsal hesaplayıcıdan bağımsız, **kişisel** karbon ayak izi modülüdür ve
GitHub Pages üzerinden `commitedevents.app`'e iframe ile gömülür.

### v2 ile gelenler
- **Kişiye özel öneriler:** kullanıcının kendi verisiyle simüle edilip en çok kazandıran 3 adım listelenir.
- **"Ne olurdu?" simülatörü:** araç/uçuş/ev enerjisi/tüketim kaydırıcıları + beslenme ve yeşil elektrik seçimi; ayak izi, skor ve ağaç karşılığı anlık güncellenir.
- **Komite sıralaması:** skorboard'a üçüncü sekme. Komite artık serbest metin değil, `COMMITTEES` dizisinden gelen açılır liste.
- **Gelişim takibi:** her kayıtta kullanıcının dokümanına `history[]` eklenir (son 24 ölçüm), Skorboard sekmesinde çubuk grafik olarak gösterilir.
- **Paylaşım kartı:** 1080×1080 canvas ile markalı skor kartı; indir / WhatsApp / LinkedIn / native paylaşım.
- **Ağaç bağışı:** ayak izini dengeleyecek ağaç sayısı + bağış talebi formu. Talep hem Firestore'a (`rotary_mavisehir_bagis`) yazılır hem de FormSubmit ile admin e-postasına gider; ikisi de başarısız olursa `mailto:` bağlantısı sunulur.
- **Sağlamlaştırma:** Firebase config artık başka dosyadan regex ile çekilmiyor, doğrudan gömülü. Firebase SDK **dinamik** import edilir — CDN engellenirse hesaplayıcı yine çalışır, sadece giriş/skorboard kapanır. Boş/aşırı girdi uyarısı eklendi. Sayfa yüksekliğini `postMessage` ile üst pencereye bildirir.

### Ayarların yeri
`<script type="module">` bloğunun başındaki **AYARLAR** kutusu:
`COL`, `COL_DONATE`, `ADMIN_EMAIL`, `MAIL_ENDPOINT`, `PAGE_URL`, `TREE_KG_YEAR`, `firebaseConfig`, `COMMITTEES`.

### Bağış e-postası — ilk kurulum
`MAIL_ENDPOINT` varsayılan olarak FormSubmit kullanır. İlk gönderimde FormSubmit,
`ADMIN_EMAIL` adresine bir **aktivasyon** e-postası yollar; oradaki bağlantıya bir kez tıklanmadan
sonraki talepler iletilmez. Aktivasyondan sonra FormSubmit size rastgele bir kod verir;
e-posta adresini gizlemek için `MAIL_ENDPOINT`'i
`https://formsubmit.co/ajax/<verilen-kod>` olarak güncelleyin.

### Squarespace iframe — otomatik yükseklik
Sayfa, içerik yüksekliği değiştikçe üst pencereye mesaj gönderir. Code Block'taki iframe'i
şu şekilde sararsanız iframe içerikle birlikte büyüyüp küçülür (mobilde alt taraf kesilmez):

```html
<iframe id="karbonFrame"
  src="https://lkoseoglu.github.io/commited-karbon-hesaplayici/karbon-mavisehir-rotary.html"
  style="width:100%;height:1600px;border:0;display:block" title="Karbon Ayak İzi Hesaplayıcısı"></iframe>
<script>
window.addEventListener('message', function(e){
  if(e.data && e.data.type === 'commited-carbon-height'){
    var f = document.getElementById('karbonFrame');
    if(f) f.style.height = (e.data.height + 24) + 'px';
  }
});
</script>
```

### Firestore kuralları
`firestore.rules` içine `rotary_mavisehir_bagis` koleksiyonu eklendi (üye kendi talebini yazar,
yalnız admin okur). Kuralları Firebase konsolundan **yayınlamayı** unutmayın.

---

## Alıcı modülü (Kapsam 3.1 / 3.4) — v3.1 notları

> 2026-10-19 itibarıyla bu modül `kapsam3-karbon-hesaplayici.html` dosyasındadır (config v4.0, turizm odaklı). Aşağıdaki motor açıklaması geçerlidir; faktör listeleri ve örnekler için yukarıdaki v4.0 bölümüne bakın.

Eski `karbon-hesaplayici.html` içindeki **"Alıcıyım — tedarikçilerimin emisyonlarını topluyorum"** akışı,
elle girilen kg CO₂e değerlerini toplamak yerine artık hibrit bir Kapsam 3.1 motoru çalıştırır.
Config sürümü **3.1**'e çıkarıldı (eski 3.0 bulut config'i artık yok sayılır; admin panelinden
bir kez "Buluta kaydet" demek yeterlidir).

### Satır başına üç yöntem

| Yöntem (`method`) | Hesap | Veri kalitesi |
|---|---|---|
| `supplier` | `tedarikçi toplam emisyonu (t) × 1000 × (sizin alımınız ÷ tedarikçinin toplamı)` — tahsis ciro/harcama **veya** fiziksel miktar üzerinden | 1 (üçüncü taraf doğrulamalı) / 2 (beyan) |
| `activity` | `miktar (kg) × malzeme emisyon faktörü` (`CONFIG.purchaseMaterials`) | 3 |
| `spend` | `harcama (₺) ÷ USD kuru × kategori faktörü (kgCO₂e/USD)` (`CONFIG.spendFactors`) | 5 |

Her satıra ayrıca opsiyonel **tedarik nakliyesi (Kapsam 3.4)** eklenebilir:
`ton × km × mod faktörü` (`CONFIG.freightModes`: karayolu / demiryolu / deniz / hava).

### Toplamda hesaplananlar

- **Kapsama analizi:** "yıllık toplam satın alma harcaması" girilirse, kapsanmayan harcama
  portföyün ağırlıklı yoğunluğuyla (yoksa genel kategori faktörüyle) ekstrapole edilir ve
  5/5 kalite ile toplama eklenir — rapor eksik kalmaz.
- **Veri kalitesi skoru:** emisyonla ağırlıklı 1-5 ortalama (`CONFIG.dqScale`), birincil veri payı (%),
  ve ağırlıklı **belirsizlik aralığı** (±%).
- **Pareto:** emisyonun %80'ini oluşturan tedarikçi sayısı ve ilk 10 için yatay bar.
- **Yoğunluk ve aykırı değer:** `kg CO₂e / 1.000 ₺`; medyanın `buyerScenario.outlierMultiple` katını
  aşan satırlar işaretlenir.
- **Öncelik listesi:** `emisyon payı × veri kalitesi puanı` sıralamasıyla "önce kimden birincil
  veri istenmeli" ilk 5.
- **Azaltım senaryosu:** üç kaydırıcı — (a) ilk N tedarikçi yeşil elektrik (`greenElecShare`),
  (b) karayolu → deniz mod değişimi (ton·km faktör oranından), (c) geri dönüşümlü muadil
  malzeme (`recycledPairs` faktör çiftinden). Tüm varsayımlar ekranda yazar.

### Excel

- **Şablon indir:** 4 sayfalı `.xlsx` (tedarikçi satırları + kategori kodları + malzeme kodları + yöntem kodları).
- **Excel'den yükle / Yapıştır:** aynı sütun sırası; başlık satırı atlanır, bilinmeyen kod/kategori
  güvenli varsayılana düşer.
- Rapor Excel'i alıcı için tedarikçi bazında döküm + kapsama + öncelik listesi içerir; PDF'e
  KPI kutuları, kapsama çubuğu, ilk 12 tedarikçi ve öncelik listesi eklendi.

### Yeni config alanları

`spendBase` (USD kuru + kaynak/uyarı metni), `spendFactors` (32 satın alma kategorisi, kgCO₂e/USD),
`purchaseMaterials` (3.1 malzeme listesi), `freightModes`, `dqScale` (1-5 + belirsizlik %),
`buyerScenario` (senaryo varsayımları, aykırı değer eşiği). Ayrıca `factors` içine çelik, paslanmaz,
alüminyum, bakır, çimento, cam, kağıt, ahşap, deri, kauçuk, geri dönüşümlü muadilleri ve
demiryolu/hava kargo faktörleri eklendi.

Hepsi admin panelindeki yeni **"Harcama Faktörleri"** sekmesinden (ve mevcut "Emisyon Faktörleri"
sekmesinden) düzenlenebilir.

> Harcama bazlı faktörlerin varsayılanları EPA *Supply Chain GHG Emission Factors v1.3*
> (2022 USD, alıcı fiyatı) referansıyla türetilmiştir. Tarama (screening) amaçlıdır; fiyat
> ve kur farkları nedeniyle belirsizliği yüksektir — resmi raporlama öncesi doğrulanmalıdır.
