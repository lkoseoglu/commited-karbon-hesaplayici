# KOBİ Karbon Ayak İzi Modülü — Yazılım Ekibi Kılavuzu

commitedevents.app (Squarespace) sitesine gömülmek üzere hazırlanmış, sunucu gerektirmeyen (tamamen tarayıcıda çalışan) bir karbon ayak izi hesaplama modülüdür. Tekstil ve turizm sektörlerine göre Kapsam 1/2/3 emisyonu hesaplar, iki dillidir (TR/EN).

## Dosyalar

| Dosya | Görev |
|---|---|
| `karbon-hesaplayici.html` | Ziyaretçilerin kullandığı hesaplayıcı. Squarespace'e gömülür. |
| `karbon-admin.html` | Yönetici paneli. Faktör ve soruları düzenler, `config.json` üretir. Herkese açık **yayınlanmaz**; sadece site sahibi kullanır. |
| `config.default.json` | Tüm parametrelerin kaynağı (emisyon faktörleri + sorular). İnsan-okunur referans. |

Üç dosyada da aynı varsayılan ayar (`DEFAULT_CONFIG`) gömülüdür; bu sayede her HTML tek başına çalışır.

## Nasıl çalışır (mimari)

- Backend yok. Hesaplama `kullanıcı girdisi × emisyon faktörü` ile tarayıcıda yapılır.
- Ayarların yüklenme önceliği: `localStorage['karbonConfig']` varsa o, yoksa dosyaya gömülü `DEFAULT_CONFIG`.
- `localStorage` yalnızca **aynı tarayıcıda** geçerlidir → admin panelinde "Kaydet" dediğinizde değişikliği yalnız o bilgisayardaki hesaplayıcı önizlemede görür. **Ziyaretçilere yansıması için aşağıdaki yayına alma adımı gerekir.**

## Yayına alma akışı (parametre güncellemesi)

1. Site sahibi `karbon-admin.html` dosyasını tarayıcıda açar (çift tıklayarak da olur).
2. Faktör/soru değişikliklerini yapar → **"Kaydet"** (tarayıcıda önizleme) → **"JSON indir"** ile `config.json` alır.
3. `config.json` içeriğini yazılım ekibine iletir.
4. Ekip, `karbon-hesaplayici.html` içindeki `const DEFAULT_CONFIG = { ... };` bloğunu indirilen JSON ile **birebir değiştirir** (aynısını `karbon-admin.html` içinde de yapmak, admin'in "Varsayılana dön" davranışını güncel tutar).
5. Güncellenen `karbon-hesaplayici.html` içeriği Squarespace'te yeniden yayınlanır.

> Alternatif (opsiyonel iyileştirme): `config.json`'u bir CDN/statik host'a koyup hesaplayıcıya `fetch` ile yükletmek. Böylece HTML'e dokunmadan güncelleme yapılır. Mevcut sürüm bilinçli olarak bağımlılıksız (fetch'siz) tutulmuştur.

## Squarespace'e gömme

**Yöntem A — Code Block (tek sayfa):**
1. Hesaplayıcı sayfasını açın → içerik alanına **Code** bloğu ekleyin.
2. `karbon-hesaplayici.html` dosyasının **tamamını** yapıştırın.
3. Kaydedin. (Code Block bazı planlarda `<script>` çalıştırır; çalışmazsa Yöntem B.)

**Yöntem B — Embed / iframe (önerilen, en garantisi):**
1. `karbon-hesaplayici.html`'i site dosyalarınıza / bir statik host'a yükleyin (ör. Squarespace'in izin verdiği bir barındırma veya `github pages`).
2. Hesaplayıcı sayfasına bir **Embed/Code** bloğu ekleyip iframe ile çağırın:
   ```html
   <iframe src="HESAPLAYICI_URL" style="width:100%;height:1200px;border:0" title="Karbon Hesaplayıcı"></iframe>
   ```
3. `karbon-admin.html`'i **herkese açık sayfaya koymayın** — yerel bilgisayarda açın veya şifre korumalı gizli bir sayfada tutun.

## Config şeması (kısa referans)

```jsonc
{
  "meta": { "version", "updated", "notice": {tr,en} },
  "factors": {
    "<anahtar>": { "name": {tr,en}, "value": <kgCO2e/birim>, "unit": "...", "scope": 1|2|3 }
  },
  "sectors": {
    "<anahtar>": {
      "name": {tr,en}, "icon": "🧵",
      "questions": [
        { "id", "factorKey": "<factors anahtarı>", "name": {tr,en}, "unitLabel": {tr,en} }
      ]
    }
  },
  "benchmarks": { "tree_kg_per_year", "car_km_equiv_factor" }
}
```
- `scope`: 1 = doğrudan (yakıt yakma), 2 = satın alınan enerji (elektrik/buhar), 3 = diğer (hammadde, atık, su, taşıma...).
- Her `questions[].factorKey`, `factors` içindeki bir anahtarla eşleşmelidir (admin bunu otomatik listeler).

## Önemli not — emisyon faktörleri

`config.default.json` içindeki faktörler **VARSAYILAN referans** değerlerdir (IPCC/DEFRA/literatür yaklaşık değerleri). Resmi/denetime tabi raporlama öncesinde güncel ve ülkeye özel değerlerle (Türkiye Ulusal Sera Gazı Envanteri, güncel DEFRA/IPCC) admin panelinden doğrulanmalıdır. Bu bir tam yaşam döngüsü (LCA) aracı değil, **temel seviye** tahmin aracıdır.

## İyileştirme fikirleri (dev ekibi için)
- PDF çıktısını markalı şablona bağlamak (şu an tarayıcı yazdır/PDF kullanıyor).
- Alıcı modunda tedarikçi raporu (JSON) içe aktarma ile otomatik toplama.
- Config'i uzak `fetch` ile yükleme + basit şifreli admin.
- Verilerin isteğe bağlı olarak bir tabloya/CRM'e kaydı.

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

`karbon-hesaplayici.html` içindeki **"Alıcıyım — tedarikçilerimin emisyonlarını topluyorum"** akışı,
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
