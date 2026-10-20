/* =========================================================================
   Türkiye referans verisi  (assets/js/tr-reference.js)
   -------------------------------------------------------------------------
   HCMI v2.0 resmî tablosunda Türkiye için şebeke elektriği faktörü YOKTUR
   ("Default EF not available"). Bu dosya o boşluğu, kaynağı belli resmî
   Türkiye verisiyle doldurur ve her değerin nereden geldiğini kayıt altında tutar.

   İçerik
     1. Şebeke elektriği faktörleri 2020-2023 (T.C. Enerji ve Tabii Kaynaklar
        Bakanlığı, Enerji Verimliliği ve Çevre Dairesi Bşk. bilgi formları)
     2. efOverrides(): HCMI motoruna verilecek "faktör geçersiz kılma" listesi
     3. Ülke adlarının Türkçesi (HCMI ülke listesinin tamamı)
     4. Fatura / birim ipuçları (arayüz metinleri)

   Klasik betik: globalThis.TR_REFERENCE atar. DOM'a ve HCMI'ya bağımlı DEĞİLDİR.
   Yeni yıl değerleri yayımlandığında YALNIZCA aşağıdaki GRID_YEARS tablosuna
   satır eklenir; başka kod değişmez. tests/unit/tr-reference.test.mjs tabloyu denetler.

   BİRİM: bilgi formlarındaki tCO2-eşd./MWh değeri sayısal olarak kgCO2e/kWh'tir.
   ========================================================================= */
(function (root) {
  'use strict';

  var CHECKED_ON = '2026-10-20';

  // ------------------------------------------------------------------ kaynaklar
  var BASE = 'https://enerji.gov.tr/Media/Dizin/EVCED/tr/%C3%87evreVe%C4%B0klim/%C4%B0klimDe%C4%9Fi%C5%9Fikli%C4%9Fi/EmisyonFaktorleri/';
  var SOURCES = {
    'etkb-2023': {
      title: 'Türkiye Elektrik Üretimi ve Elektrik Tüketim Noktası Emisyon Faktörleri — 2023 hesaplama dönemi',
      publisher: 'T.C. Enerji ve Tabii Kaynaklar Bakanlığı, Enerji Verimliliği ve Çevre Dairesi Başkanlığı',
      docNo: 'ETKB-EVÇED-FRM-042 Rev.01', calcPublished: '2025-12-26',
      url: BASE + '2023_Turkiye_Elektrik_UretimiveElektrik_Tuketim_Noktasi_Emisyon_Faktorleri.pdf'
    },
    'etkb-2022': {
      title: 'Türkiye Elektrik Üretimi ve Elektrik Tüketim Noktası Emisyon Faktörleri — 2022 hesaplama dönemi',
      publisher: 'T.C. Enerji ve Tabii Kaynaklar Bakanlığı, Enerji Verimliliği ve Çevre Dairesi Başkanlığı',
      docNo: 'ETKB-EVÇED-FRM-042 Rev.01', calcPublished: '2024-12-06',
      url: 'https://enerji.gov.tr//Media/Dizin/EVCED/tr/%C3%87evreVe%C4%B0klim/%C4%B0klimDe%C4%9Fi%C5%9Fikli%C4%9Fi/EmisyonFaktorleri/2022_Uretim_Tuketim_EF.pdf'
    },
    'etkb-2021': {
      title: 'Türkiye Elektrik Üretimi ve Elektrik Tüketim Noktası Emisyon Faktörleri — 2021 hesaplama dönemi',
      publisher: 'T.C. Enerji ve Tabii Kaynaklar Bakanlığı, Enerji Verimliliği ve Çevre Dairesi Başkanlığı',
      docNo: 'ETKB-EVÇED-FRM-042 Rev.01', calcPublished: '2024-03-18',
      url: BASE + 'TEUVETN_Emisyon_Fakt%C3%B6rleri_Bilgi_Formu.pdf'
    },
    'etkb-2020': {
      title: 'Türkiye Elektrik Üretimi ve Elektrik Tüketim Noktası Emisyon Faktörleri — 2020 hesaplama dönemi',
      publisher: 'T.C. Enerji ve Tabii Kaynaklar Bakanlığı, Enerji Verimliliği ve Çevre Dairesi Başkanlığı',
      docNo: null, calcPublished: '2024-03-18',   // doküman numarası bu yıl için doğrulanmadı
      url: 'https://enerji.gov.tr//Media/Dizin/EVCED/tr/%C3%87evreVe%C4%B0klim/%C4%B0klimDe%C4%9Fi%C5%9Fikli%C4%9Fi/EmisyonFaktorleri/2020_Uretim_Tuketim_EF.pdf'
    }
  };

  // -------------------------------------------- şebeke elektriği (kgCO2e/kWh)
  // generation   : Türkiye geneli elektrik ÜRETİMİ (brüt üretim başına)
  // transmission : iletim hattından bağlı TÜKETİM NOKTASI
  // distribution : dağıtım hattından bağlı TÜKETİM NOKTASI  (otel / ticari tesis için varsayılan)
  var GRID_YEARS = {
    2020: { generation: 0.420, transmission: 0.427, distribution: 0.462, source: 'etkb-2020' },
    2021: { generation: 0.439, transmission: 0.445, distribution: 0.479, source: 'etkb-2021' },
    2022: { generation: 0.442, transmission: 0.445, distribution: 0.478, source: 'etkb-2022' },
    2023: { generation: 0.434, transmission: 0.436, distribution: 0.469, source: 'etkb-2023' }
  };

  var CONNECTIONS = {
    distribution: { id: 'distribution', tr: 'Dağıtım hattından bağlı (otel ve ticari tesislerin büyük çoğunluğu)', default: true },
    transmission: { id: 'transmission', tr: 'İletim hattından bağlı (doğrudan yüksek gerilim bağlantısı; nadir)', default: false }
  };

  // Hotel için KULLANILMAYAN faktörler — nedeni kayıtta dursun (danışmanlar sık sorar).
  var NOT_USED = [
    {
      id: 'marj-2023',
      label: 'Ulusal şebeke marjinal faktörleri (2023): faaliyet temelli marj 0,7134 · gelişim temelli marj 0,3567 · birleşik marj 0,6242 / 0,5350 tCO2/MWh',
      reason: 'Bu değerler proje bazlı karbon kredisi / yenilenebilir enerji azaltım hesabı içindir (UNFCCC CDM Tool 07). Kurumsal envanterde (GHG Protokolü, HCMI) şebeke ortalaması / tüketim noktası faktörü kullanılır.',
      source: 'Aynı bakanlığın "Türkiye Ulusal Elektrik Şebekesi Emisyon Faktörü Bilgi Formu" (ETKB-EVÇED-FRM-039)'
    }
  ];

  var yearsAsc = Object.keys(GRID_YEARS).map(Number).sort(function (a, b) { return a - b; });
  var FIRST_YEAR = yearsAsc[0], LAST_YEAR = yearsAsc[yearsAsc.length - 1];

  /**
   * Rapor yılı için şebeke elektriği faktörü.
   * Kural (Net Zero Methodology for Hotels §4.1): aynı takvim yılının en güncel faktörü;
   * o yıl yayımlanmadıysa yayımlanmış en yakın yıl kullanılır ve bu açıkça belirtilir.
   * @param {number} year        rapor yılı (ör. 2025)
   * @param {string} [connection] 'distribution' (varsayılan) | 'transmission'
   */
  function gridFactor(year, connection) {
    var conn = connection === 'transmission' ? 'transmission' : 'distribution';
    // null, '', true, [] gibi değerler Number() ile 0 olur; bunlar "yıl girilmedi" sayılmalı
    var given = typeof year === 'number' || (typeof year === 'string' && year.trim() !== '');
    var y = given ? Math.round(Number(year)) : NaN;
    var used, reason = null;
    if (!isFinite(y)) { used = LAST_YEAR; reason = 'noYear'; }
    else if (GRID_YEARS[y]) { used = y; }
    else if (y > LAST_YEAR) { used = LAST_YEAR; reason = 'notPublished'; }
    else { used = FIRST_YEAR; reason = 'beforeSeries'; }
    var row = GRID_YEARS[used], src = SOURCES[row.source];
    var message = null;
    if (reason === 'notPublished') {
      message = y + ' yılı için resmî tüketim noktası faktörü henüz yayımlanmadı; yayımlanmış en güncel değer (' + used + ') kullanıldı. Yeni yıl yayımlanınca hesabı yenileyin.';
    } else if (reason === 'beforeSeries') {
      message = y + ' yılı için resmî faktör serisi ' + FIRST_YEAR + ' ile başlıyor; en eski değer (' + used + ') kullanıldı.';
    } else if (reason === 'noYear') {
      message = 'Rapor yılı girilmedi; yayımlanmış en güncel değer (' + used + ') kullanıldı.';
    }
    return {
      value: row[conn], unit: 'kgCO2e/kWh',
      requestedYear: isFinite(y) ? y : null, basisYear: used, exact: reason === null,
      reason: reason, message: message,
      connection: conn,
      sourceId: row.source, source: src
    };
  }

  /**
   * HCMI motoruna verilecek geçersiz kılma listesi (options.efOverrides).
   * Yalnız şebeke elektriği için: PPA, buhar, soğutma gibi türlerde Türkiye faktörü
   * tedarikçiden alınmalıdır; resmî bir ulusal değer yoktur, motor "elle faktör gir" der.
   */
  function efOverrides(year, connection) {
    var g = gridFactor(year, connection);
    return [{
      country: 'Turkey', region: 'Turkey', typeId: 'grid', value: g.value,
      id: 'tr-grid-' + g.basisYear + '-' + g.connection
    }];
  }

  // ------------------------------------------------------------------ ülke adları
  var COUNTRY_TR = {
    'Afghanistan': 'Afganistan', 'Aland Islands': 'Åland Adaları', 'Albania': 'Arnavutluk', 'Algeria': 'Cezayir',
    'American Samoa, USA': 'Amerikan Samoası (ABD)', 'Andorra': 'Andorra', 'Angola': 'Angola', 'Anguilla': 'Anguilla',
    'Antarctica': 'Antarktika', 'Antigua and Barbuda': 'Antigua ve Barbuda', 'Argentina': 'Arjantin', 'Armenia': 'Ermenistan',
    'Aruba': 'Aruba', 'Australia': 'Avustralya', 'Austria': 'Avusturya', 'Azerbaijan': 'Azerbaycan', 'Bahamas': 'Bahamalar',
    'Bahrain': 'Bahreyn', 'Bangladesh': 'Bangladeş', 'Barbados': 'Barbados', 'Belarus': 'Belarus', 'Belgium': 'Belçika',
    'Belize': 'Belize', 'Benin': 'Benin', 'Bermuda': 'Bermuda', 'Bhutan': 'Butan', 'Bolivia': 'Bolivya', 'Bonaire': 'Bonaire',
    'Bosnia and Herzegovina': 'Bosna-Hersek', 'Botswana': 'Botsvana', 'Bouvet Island': 'Bouvet Adası', 'Brazil': 'Brezilya',
    'British Indian Ocean territory': 'Britanya Hint Okyanusu Toprakları', 'Brunei Darussalam': 'Brunei', 'Bulgaria': 'Bulgaristan',
    'Burkina Faso': 'Burkina Faso', 'Burundi': 'Burundi', 'Cambodia': 'Kamboçya', 'Cameroon': 'Kamerun', 'Canada': 'Kanada',
    'Cape Verde': 'Yeşil Burun', 'Cayman Islands': 'Cayman Adaları', 'Central African Republic': 'Orta Afrika Cumhuriyeti',
    'Chad': 'Çad', 'Chile': 'Şili', 'China': 'Çin', 'Christmas Island': 'Christmas Adası', 'Cocos (Keeling) Islands': 'Cocos (Keeling) Adaları',
    'Colombia': 'Kolombiya', 'Comoros': 'Komorlar', 'Cook Islands': 'Cook Adaları', 'Congo': 'Kongo Cumhuriyeti',
    'Costa Rica': 'Kosta Rika', "Côte d'Ivoire": 'Fildişi Sahili', 'Croatia': 'Hırvatistan', 'Cuba': 'Küba', 'Curacao': 'Curaçao',
    'Cyprus': 'Kıbrıs', 'Czech Republic': 'Çekya', 'Denmark': 'Danimarka', 'Djibouti': 'Cibuti',
    'Democratic Republic of the Congo': 'Kongo Demokratik Cumhuriyeti', 'Dominica': 'Dominika', 'Dominican Republic': 'Dominik Cumhuriyeti',
    'Ecuador': 'Ekvador', 'Egypt': 'Mısır', 'El Salvador': 'El Salvador', 'Equatorial Guinea': 'Ekvator Ginesi', 'Eritrea': 'Eritre',
    'Estonia': 'Estonya', 'Ethiopia': 'Etiyopya', 'Falkland Islands (Malvinas)': 'Falkland Adaları (Malvinas)', 'Faroe Islands': 'Faroe Adaları',
    'Fiji': 'Fiji', 'Finland': 'Finlandiya', 'France': 'Fransa', 'French Guiana': 'Fransız Guyanası', 'French Polynesia': 'Fransız Polinezyası',
    'French Southern Territories': 'Fransız Güney Toprakları', 'FYR of Macedonia': 'Kuzey Makedonya', 'Gabon': 'Gabon', 'Gambia': 'Gambiya',
    'Georgia': 'Gürcistan', 'Germany': 'Almanya', 'Ghana': 'Gana', 'Gibraltar': 'Cebelitarık', 'Greece': 'Yunanistan', 'Greenland': 'Grönland',
    'Grenada': 'Grenada', 'Guadeloupe': 'Guadeloupe', 'Guam, USA': 'Guam (ABD)', 'Guatemala': 'Guatemala', 'Guernsey': 'Guernsey',
    'Guinea': 'Gine', 'Guinea-Bissau': 'Gine-Bissau', 'Guyana': 'Guyana', 'Haiti': 'Haiti', 'Heard and Mcdonal Islands': 'Heard ve McDonald Adaları',
    'Holy See (Vatican City State)': 'Vatikan', 'Honduras': 'Honduras', 'Hong Kong, China': 'Hong Kong', 'Hungary': 'Macaristan',
    'Iceland': 'İzlanda', 'India': 'Hindistan', 'Indonesia': 'Endonezya', 'Iraq': 'Irak', 'Ireland': 'İrlanda', 'Isle of Man': 'Man Adası',
    'Islamic Republic of Iran': 'İran', 'Israel': 'İsrail', 'Italy': 'İtalya', 'Jamaica': 'Jamaika', 'Japan': 'Japonya', 'Jersey': 'Jersey',
    'Jordan': 'Ürdün', 'Kazakhstan': 'Kazakistan', 'Kenya': 'Kenya', 'Kiribati': 'Kiribati', 'Korea': 'Güney Kore', 'Kosovo': 'Kosova',
    'Kuwait': 'Kuveyt', 'Kyrgyzstan': 'Kırgızistan', 'Lao P.D.R.': 'Laos', 'Latvia': 'Letonya', 'Lebanon': 'Lübnan', 'Lesotho': 'Lesotho',
    'Liberia': 'Liberya', 'Libya': 'Libya', 'Liechtenstein': 'Lihtenştayn', 'Lithuania': 'Litvanya', 'Luxembourg': 'Lüksemburg',
    'Macau, China': 'Makao', 'Madagascar': 'Madagaskar', 'Malawi': 'Malavi', 'Malaysia': 'Malezya', 'Maldives': 'Maldivler', 'Mali': 'Mali',
    'Malta': 'Malta', 'Marshall Islands': 'Marshall Adaları', 'Martinique': 'Martinik', 'Mauritania': 'Moritanya', 'Mauritius': 'Mauritius',
    'Mayotte': 'Mayotte', 'Mexico': 'Meksika', 'Micronesia': 'Mikronezya', 'Monaco': 'Monako', 'Mongolia': 'Moğolistan', 'Montenegro': 'Karadağ',
    'Montserrat': 'Montserrat', 'Morocco': 'Fas', 'Mozambique': 'Mozambik', 'Myanmar': 'Myanmar', 'Namibia': 'Namibya', 'Nauru': 'Nauru',
    'Nepal': 'Nepal', 'Netherlands': 'Hollanda', 'Netherlands Antilles': 'Hollanda Antilleri', 'New Caledonia': 'Yeni Kaledonya',
    'New Zealand': 'Yeni Zelanda', 'Nicaragua': 'Nikaragua', 'Niger': 'Nijer', 'Nigeria': 'Nijerya', 'Niue': 'Niue', 'Norfolk Islands': 'Norfolk Adası',
    'North Korea': 'Kuzey Kore', 'Northern Mariana Islands': 'Kuzey Mariana Adaları', 'Norway': 'Norveç', 'Oman': 'Umman', 'Pakistan': 'Pakistan',
    'Palau': 'Palau', 'Palestinian Territory': 'Filistin', 'Panama': 'Panama', 'Papua New Guinea': 'Papua Yeni Gine', 'Paraguay': 'Paraguay',
    'Peru': 'Peru', 'Philippines': 'Filipinler', 'Pitcairn': 'Pitcairn Adaları', 'Poland': 'Polonya', 'Portugal': 'Portekiz',
    'Puerto Rico, USA': 'Porto Riko (ABD)', 'Qatar': 'Katar', 'Republic of Moldova': 'Moldova', 'Reunion': 'Réunion', 'Romania': 'Romanya',
    'Russian Federation': 'Rusya', 'Rwanda': 'Ruanda', 'Saint-Barthelemy': 'Saint-Barthélemy', 'Saint Helena': 'Saint Helena', 'Saba': 'Saba',
    'Saint Kitts and Nevis': 'Saint Kitts ve Nevis', 'Saint Lucia': 'Saint Lucia', 'Saint Martin': 'Saint Martin',
    'Saint Pierre and Miquelon': 'Saint Pierre ve Miquelon', 'Saint Vincent and the Grenadines': 'Saint Vincent ve Grenadinler', 'Samoa': 'Samoa',
    'San Marino': 'San Marino', 'Sao Tome and Principe': 'São Tomé ve Príncipe', 'Saudi Arabia': 'Suudi Arabistan', 'Senegal': 'Senegal',
    'Serbia': 'Sırbistan', 'Seychelles': 'Seyşeller', 'Sierra Leone': 'Sierra Leone', 'Singapore': 'Singapur', 'Sint Eustatius': 'Sint Eustatius',
    'Sint Maarten': 'Sint Maarten', 'Slovak Republic': 'Slovakya', 'Slovenia': 'Slovenya', 'Solomon Islands': 'Solomon Adaları', 'Somalia': 'Somali',
    'South Africa': 'Güney Afrika', 'South Georgia and the South Sandwich Islands': 'Güney Georgia ve Güney Sandwich Adaları',
    'South Sudan': 'Güney Sudan', 'Spain': 'İspanya', 'Sri Lanka': 'Sri Lanka', 'Sudan': 'Sudan', 'Suriname': 'Surinam',
    'Svalbard and Jan Mayen Islands': 'Svalbard ve Jan Mayen', 'Swaziland': 'Esvatini', 'Sweden': 'İsveç', 'Switzerland': 'İsviçre',
    'Syrian Arab Republic': 'Suriye', 'Taiwan': 'Tayvan', 'Tajikistan': 'Tacikistan', 'Tanzania': 'Tanzanya', 'Thailand': 'Tayland',
    'Timor-Leste': 'Doğu Timor', 'Togo': 'Togo', 'Tokelau': 'Tokelau', 'Tonga': 'Tonga', 'Trinidad and Tobago': 'Trinidad ve Tobago',
    'Tunisia': 'Tunus', 'Turkey': 'Türkiye', 'Turkmenistan': 'Türkmenistan', 'Turks and Caicos Islands': 'Turks ve Caicos Adaları',
    'Tuvalu': 'Tuvalu', 'Uganda': 'Uganda', 'Ukraine': 'Ukrayna', 'United Arab Emirates': 'Birleşik Arap Emirlikleri',
    'United Kingdom': 'Birleşik Krallık', 'United States': 'Amerika Birleşik Devletleri', 'US Minor Outlying Islands': 'ABD Küçük Dış Adaları',
    'Uruguay': 'Uruguay', 'Uzbekistan': 'Özbekistan', 'Vanuatu': 'Vanuatu', 'Venezuela': 'Venezuela', 'Vietnam': 'Vietnam',
    'Virgin Islands (British)': 'Britanya Virjin Adaları', 'Virgin Islands (US)': 'ABD Virjin Adaları', 'Wallis and Futuna Islands': 'Wallis ve Futuna',
    'Western Sahara': 'Batı Sahra', 'Yemen': 'Yemen', 'Zambia': 'Zambiya', 'Zimbabwe': 'Zimbabve',
    'Other': 'Diğer (listede olmayan ülke)', 'Other Africa': 'Diğer Afrika', 'Other Asia': 'Diğer Asya',
    'Other Non-OECD Europe & Eurasia': 'Diğer OECD dışı Avrupa ve Avrasya', 'Oceania (Non-OECD)': 'Okyanusya (OECD dışı)',
    'European Union': 'Avrupa Birliği (ortalama)', 'Caribbean': 'Karayipler'
  };

  function countryLabel(name) { return COUNTRY_TR[name] || name; }

  /**
   * Seçenek listesi: Türkiye en üstte, kalanı Türkçe ada göre sıralı.
   * @param {string[]|{country:string}[]} names  HCMI.countries() çıktısı ya da ad listesi
   */
  function countryOptions(names) {
    var list = (names || []).map(function (c) { return typeof c === 'string' ? c : c.country; });
    var cmp = function (a, b) { return a.label.localeCompare(b.label, 'tr'); };
    var out = list.map(function (n) { return { value: n, label: countryLabel(n) }; });
    var tr = out.filter(function (o) { return o.value === 'Turkey'; });
    var rest = out.filter(function (o) { return o.value !== 'Turkey'; }).sort(cmp);
    return tr.concat(rest);
  }

  // ------------------------------------------------------------------ fatura ipuçları
  var HINTS = {
    grid: 'Faturalardaki toplam aktif tüketim (kWh). Çatı GES\'in kendi ürettiği elektriği buraya yazmayın; ayrı satır açın.',
    natural_gas: 'Faturadaki Sm³ (m³) tüketimi. Faturada kWh de yazıyorsa birim olarak kWh seçip onu girebilirsiniz.',
    lpg: 'Tüp ya da dökme LPG; kilogram girin. Fatura litre veriyorsa birimi litre seçin.',
    diesel_stat: 'Jeneratör, kazan ve brülörde yakılan motorin. Araçlarda kullanılan için "Dizel (araç)" satırını kullanın.',
    diesel_mob: 'Servis, golf arabası, bahçe ve iş makineleri gibi tesis araçlarında yakılan motorin.',
    gasoline_mob: 'Tesis araçları ve bahçe ekipmanında yakılan benzin.',
    fuel_oil_2: 'Kalorifer yakıtı / fuel-oil; litre ya da kg olarak girin.',
    fuel_oil_6: 'Ağır fuel-oil (kazan yakıtı).',
    steam: 'Bölgesel ısıtma / buhar alımı. Emisyon faktörünü tedarikçinizden isteyin; yoksa HCMI varsayılanı kullanılır.',
    hot_water: 'Satın alınan sıcak su (bölgesel ısıtma). Faktörü tedarikçinizden isteyin.',
    chilled_water: 'Satın alınan soğutulmuş su (bölgesel soğutma). Türkiye için resmî varsayılan faktör yoktur; tedarikçinizin faktörünü elle girin.',
    onsite_renew: 'Çatı GES gibi tesisin kendi ürettiği ve kullandığı elektrik (kWh). Şebekeye verdiğiniz kısmı yazmayın.',
    ppa: 'Yenilenebilir enerji alım anlaşması (PPA) ile gelen elektrik. Türkiye için resmî varsayılan faktör yoktur; tedarikçinizin faktörünü elle girin.',
    biomass: 'Odun, pelet, biyokütle (kg).',
    wood_waste: 'Kazanda yakılan ahşap atığı (kg).',
    charcoal: 'Mangal / ızgara odun kömürü (kg).'
  };
  function hint(typeId) { return HINTS[typeId] || ''; }

  // Sık kullanılan, Türkiye'de otellerin çoğunun karşılaştığı enerji türleri (arayüzde "hızlı ekle")
  var COMMON_TYPES = ['grid', 'natural_gas', 'lpg', 'diesel_stat', 'fuel_oil_2', 'diesel_mob', 'onsite_renew'];

  root.TR_REFERENCE = {
    version: '1.0.0',
    checkedOn: CHECKED_ON,
    checkNote: 'Kaynak belgeler web üzerinden okunarak doğrulandı; yazılım ekibi / uzman onayı bekliyor.',
    sources: SOURCES,
    connections: CONNECTIONS,
    gridYears: GRID_YEARS,
    firstGridYear: FIRST_YEAR,
    lastGridYear: LAST_YEAR,
    notUsed: NOT_USED,
    gridFactor: gridFactor,
    efOverrides: efOverrides,
    countryNames: COUNTRY_TR,
    countryLabel: countryLabel,
    countryOptions: countryOptions,
    hints: HINTS,
    hint: hint,
    commonTypes: COMMON_TYPES
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
