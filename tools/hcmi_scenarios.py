"""
HCMI altın-referans senaryoları  (tools/hcmi_scenarios.py)
=========================================================

Her senaryo, hesap motorunun girdi biçiminde (assets/js/hcmi-engine.js →
`emptyInput()`) yazılır. tools/hcmi-oracle.py bu senaryoları resmî Excel'e
girer, LibreOffice ile hesaplatır ve sonucu tests/golden/hcmi-oracle.json'a
yazar. tests/unit/hcmi-engine.test.mjs motoru aynı girdilerle çalıştırıp
Excel sonucuyla karşılaştırır.

Senaryo eklemek için aşağıdaki listeye bir `sc(...)` satırı yeterlidir;
ardından `python3 tools/hcmi-oracle.py ...` komutunu yeniden çalıştırın.

Kısıtlar (Excel şablonunun yapısı gereği):
  * Şebeke elektriği, Doğal gaz, Fuel Oil 2 hazır satırlardır (satır 16-18);
    diğer enerji türleri en çok 4 serbest satıra (19-22) sığar.
  * Çamaşırhane payı girişinde (A.1) ilk satır şebeke elektriğidir.
"""
import copy

GRID = "Purchased Electricity (Grid)"
GAS = "Natural Gas"
FO2 = "Fuel Oil 2"
FO4, FO6 = "Fuel Oil 4", "Fuel Oil 6"
LPG, BUT, PRO = "Liquefied Petroleum Gas (LPG)", "Butane", "Propane"
DSL, GSL = "Diesel (Stationary)", "Gasoline (Stationary)"
DSL_M, GSL_M, GSL_B = "Diesel (Mobile)", "Gasoline (Mobile)", "Gasoline (Mobile) Biofuel Blend"
STEAM, HOTW, CHW = "Purchased Steam", "Purchased Hot Water", "Purchased Chilled Water"
PPA, ONS = "Purchased Electricity (PPA)", "Onsite Renewable Energy"
KER, ETH, CHAR, BIO, WOOD = "Kerosene", "Ethanol", "Charcoal", "Biomass", "Biofuel Wood Waste"
BIOG, LAND, USED = "Biogas (captured methane)", "Biofuel Landfill gas (50/50)", "Biofuel Used Oil"
TOWN, TOKYO = "Towngas (HK)", "Tokyo Gas (Tokyo)"
LNG, CNG = "Liquefied Natural Gas (LNG)", "Compressed Natural Gas (CNG)"

TR_OVERRIDES = [
    {"country": "Turkey", "region": "Turkey", "typeId": "grid", "value": 0.469, "id": "tr-grid"},
    {"country": "Turkey", "region": "Turkey", "typeId": "ppa", "value": 0.469, "id": "tr-grid"},
]


def hotel(country="Turkey", region=None, unit="sqm", rooms_area=18000, meeting_area=900, cond=22000, rooms=120, occ=30000):
    return {"country": country, "region": region or country, "areaUnit": unit, "roomsArea": rooms_area,
            "meetingArea": meeting_area, "conditionedArea": cond, "rooms": rooms, "occupiedRooms": occ}


def row(t, unit, total, priv=0, mode="default", ef=None):
    d = {"type": t, "unit": unit, "total": total, "privateActual": priv, "efMode": mode}
    if ef is not None:
        d["manualEf"] = ef
    return d


def base_input(h=None, energy=None):
    return {
        "hotel": h or hotel(),
        "supplementary": {"refrigerants": "none", "mobileFuels": "none",
                          "privateSpace": {"has": False, "actual": False, "shareKnown": False, "sharePct": 0}},
        "energy": energy or [],
        "marketPurchases": [],
        "laundry": {"outsourced": False, "shareKnown": False, "items": [], "tonnageKnown": False,
                    "tonnage": 0, "tonnageUnit": "Metric Tonne"},
        "refrigerantAmountsKg": {},
        "client": None,
    }


def std_energy():
    """Türkiye'de tipik 120 odalı otel."""
    return [row(GRID, "kWh", 2400000), row(GAS, "CuM", 180000), row(DSL, "L", 4000),
            row(DSL_M, "L", 6000), row(GSL_M, "L", 1500), row(LPG, "kg", 3000)]


def merge(d, patch):
    for k, v in patch.items():
        if isinstance(v, dict) and isinstance(d.get(k), dict):
            merge(d[k], v)
        else:
            d[k] = copy.deepcopy(v)
    return d


SCENARIOS = []


def sc(sid, title, patch=None, *, h=None, energy=None, overrides=False, options=None):
    inp = base_input(h, copy.deepcopy(energy) if energy is not None else std_energy())
    if patch:
        merge(inp, patch)
    opts = dict(options or {})
    if overrides or (inp["hotel"]["country"] == "Turkey" and "efOverrides" not in opts):
        opts["efOverrides"] = TR_OVERRIDES
    SCENARIOS.append({"id": sid, "title": title, "input": inp, "options": opts})


# ---------------------------------------------------------------------------
# 1) RESMİ ÖRNEK DOSYA VE VARYANTLARI (ABD / CAMX)
# ---------------------------------------------------------------------------
def example_input():
    i = base_input(hotel("United States", "CAMX", "sqm", 4080, 1360, 8000, 180, 50000), [
        row(GRID, "kWh", 2540802, 381120.3), row(GAS, "MMBtu", 14356, 2153.4), row(FO2, "L", 657, 98.55),
        row(GSL_M, "L", 1000), row(DSL_M, "L", 30000)])
    i["supplementary"] = {"refrigerants": "manual", "mobileFuels": "manual",
                          "privateSpace": {"has": True, "actual": True, "shareKnown": False, "sharePct": 0}}
    i["marketPurchases"] = [{"description": "REC", "kwh": 2000000}]
    i["laundry"] = {"outsourced": True, "shareKnown": False, "items": [], "tonnageKnown": True,
                    "tonnage": 347, "tonnageUnit": "Metric Tonne"}
    return i


def ex(sid, title, patch=None, drop_energy=None, row_patch=None):
    i = example_input()
    if drop_energy:
        i["energy"] = [r for r in i["energy"] if r["type"] not in drop_energy]
    for r in i["energy"]:
        if row_patch and r["type"] in row_patch:
            r.update(row_patch[r["type"]])
    if patch:
        merge(i, patch)
    SCENARIOS.append({"id": sid, "title": title, "input": i, "options": {}})


ex("example-official", "Resmi örnek dosya (ABD / CAMX, 981,43 tCO2e)")
ex("example-no-rec", "Örnek: yenilenebilir elektrik alımı yok", {"marketPurchases": []})
ex("example-rec-exceeds-grid", "Örnek: REC şebeke tüketimini aşıyor (üst sınır)", {"marketPurchases": [{"description": "REC", "kwh": 9000000}]})
ex("example-rec-two-lines", "Örnek: iki ayrı REC satırı", {"marketPurchases": [{"description": "A", "kwh": 1200000}, {"description": "B", "kwh": 800000}]})
ex("example-tonnage-us-ton", "Örnek: çamaşır tonajı ABD tonu", {"laundry": {"tonnage": 400, "tonnageUnit": "US ton"}})
ex("example-laundry-estimate", "Örnek: çamaşır tonajı bilinmiyor (dolu odadan tahmin)", {"laundry": {"tonnageKnown": False}})
ex("example-laundry-share", "Örnek: çamaşırhane payı biliniyor (A.1)", {"laundry": {"shareKnown": True, "items": [
    {"type": GRID, "total": 150000, "unit": "kWh"}, {"type": GAS, "total": 3000, "unit": "Therm"},
    {"type": LPG, "total": 4000, "unit": "kg"}]}})
ex("example-no-laundry", "Örnek: çamaşırhane dışarıda değil", {"laundry": {"outsourced": False}})
ex("example-private-estimate", "Örnek: özel alan oranla tahmin (%15)", {"supplementary": {"privateSpace": {"has": True, "actual": False, "shareKnown": True, "sharePct": 0.15}}})
ex("example-private-none", "Örnek: özel alan yok", {"supplementary": {"privateSpace": {"has": False}}},
   row_patch={GRID: {"privateActual": 0}, GAS: {"privateActual": 0}, FO2: {"privateActual": 0}})
ex("example-private-unknown", "Örnek: özel alan var ama oran da gerçek tüketim de yok", {"supplementary": {"privateSpace": {"has": True, "actual": False, "shareKnown": False}}})
ex("example-refrigerant-manual", "Örnek: soğutucu gaz elle girildi", {"refrigerantAmountsKg": {"rf02": 12.5, "rf03": 8, "rf04": 50, "rf09": 3.2, "rf29": 20}})
ex("example-refrigerant-default", "Örnek: soğutucu %1 tahmin", {"supplementary": {"refrigerants": "default1pct"}})
ex("example-mobile-default", "Örnek: araç yakıtı %1 tahmin", {"supplementary": {"mobileFuels": "default1pct"}}, drop_energy=[GSL_M, DSL_M])
ex("example-both-default", "Örnek: ikisi de tahmin (x1,02)", {"supplementary": {"refrigerants": "default1pct", "mobileFuels": "default1pct"}}, drop_energy=[GSL_M, DSL_M])
ex("example-ref-manual-mobile-default", "Örnek: soğutucu elle + araç tahmin", {"supplementary": {"mobileFuels": "default1pct"}, "refrigerantAmountsKg": {"rf04": 40, "rf02": 5}}, drop_energy=[GSL_M, DSL_M])
ex("example-ref-default-mobile-manual", "Örnek: soğutucu tahmin + araç elle", {"supplementary": {"refrigerants": "default1pct"}})
ex("example-sqft", "Örnek: alanlar fit² olarak", {"hotel": {"areaUnit": "sqft", "roomsArea": 43917, "meetingArea": 14639, "conditionedArea": 86111}})
ex("example-no-meeting", "Örnek: toplantı alanı yok", {"hotel": {"meetingArea": 0}})
ex("example-big-meeting", "Örnek: toplantı alanı çok büyük", {"hotel": {"meetingArea": 12000}})
ex("example-no-occupied", "Örnek: dolu oda 0 (oda başına değer hesaplanamaz)", {"hotel": {"occupiedRooms": 0}})
ex("example-manual-ef-grid", "Örnek: şebeke faktörü elle", row_patch={GRID: {"efMode": "manual", "manualEf": 0.31}})

# ---------------------------------------------------------------------------
# 2) TÜRKİYE (şebeke faktörü ETKB 0,469 — elle faktör yolu) VE DİĞER BÖLGELER
# ---------------------------------------------------------------------------
sc("tr-baseline", "Türkiye: standart 120 odalı otel")
sc("tr-recs", "Türkiye: YEK-G ile kısmi mahsup", {"marketPurchases": [{"description": "YEK-G", "kwh": 900000}]})
sc("tr-recs-full", "Türkiye: YEK-G tüm elektriği kapsıyor", {"marketPurchases": [{"description": "I-REC", "kwh": 2400000}]})
sc("tr-laundry-estimate", "Türkiye: dış çamaşırhane, tonaj tahmini", {"laundry": {"outsourced": True, "shareKnown": False, "tonnageKnown": False}})
sc("tr-laundry-tonnage", "Türkiye: dış çamaşırhane, 180 ton", {"laundry": {"outsourced": True, "shareKnown": False, "tonnageKnown": True, "tonnage": 180, "tonnageUnit": "Metric Tonne"}})
sc("tr-laundry-share", "Türkiye: dış çamaşırhane payı (elektrik + LPG)", {"laundry": {"outsourced": True, "shareKnown": True, "items": [
    {"type": GRID, "total": 90000, "unit": "kWh"}, {"type": LPG, "total": 2500, "unit": "kg"}]}})
sc("tr-private-estimate", "Türkiye: özel alan %8 tahmin", {"supplementary": {"privateSpace": {"has": True, "actual": False, "shareKnown": True, "sharePct": 0.08}}})
sc("tr-private-actual", "Türkiye: özel alan gerçek tüketim", {"supplementary": {"privateSpace": {"has": True, "actual": True}}},
   energy=[row(GRID, "kWh", 2400000, 150000), row(GAS, "CuM", 180000, 9000), row(DSL_M, "L", 6000)])
sc("tr-refrigerant", "Türkiye: soğutucu gaz elle", {"supplementary": {"refrigerants": "manual", "mobileFuels": "manual"}, "refrigerantAmountsKg": {"rf02": 30, "rf04": 45, "rf03": 10}})
sc("tr-uplift-both", "Türkiye: iki tahmin (x1,02)", {"supplementary": {"refrigerants": "default1pct", "mobileFuels": "default1pct"}},
   energy=[row(GRID, "kWh", 2400000), row(GAS, "CuM", 180000)])
sc("tr-ppa-onsite", "Türkiye: PPA + GES + şebeke", {"marketPurchases": [{"description": "x", "kwh": 300000}]},
   energy=[row(GRID, "kWh", 1500000), row(GAS, "CuM", 150000), row(PPA, "kWh", 600000), row(ONS, "kWh", 250000)])
sc("tr-district", "Türkiye: buhar + sıcak su + soğutma (bölgesel)", None,
   energy=[row(GRID, "kWh", 1200000), row(STEAM, "GJ", 800), row(HOTW, "MWh", 300), row(CHW, "Ton-Hr", 150000, mode="manual", ef=0.14)])
sc("tr-lpg-only", "Türkiye: LPG ve motorin, doğal gaz yok", None,
   energy=[row(GRID, "kWh", 900000), row(LPG, "L", 12000), row(DSL, "L", 8000), row(FO4, "kg", 5000)])
sc("tr-small-pension", "Türkiye: küçük butik otel", None,
   h=hotel(rooms_area=1800, meeting_area=60, cond=2200, rooms=25, occ=5200),
   energy=[row(GRID, "kWh", 180000), row(LPG, "kg", 1800), row(GSL_M, "L", 300)])
sc("tr-resort", "Türkiye: büyük tatil köyü", None,
   h=hotel(rooms_area=62000, meeting_area=4200, cond=80000, rooms=480, occ=140000),
   energy=[row(GRID, "MWh", 14200), row(GAS, "CuM", 1100000), row(FO6, "kg", 60000), row(DSL_M, "L", 42000), row(GSL_M, "L", 9000)])

sc("de-baseline", "Almanya: varsayılan faktörler", None, h=hotel("Germany", "Germany"))
sc("uk-baseline", "Birleşik Krallık", None, h=hotel("United Kingdom", "United Kingdom"))
sc("gr-baseline", "Yunanistan", None, h=hotel("Greece", "Greece"))
sc("cy-baseline", "Kıbrıs", None, h=hotel("Cyprus", "Cyprus"))
sc("it-baseline", "İtalya", None, h=hotel("Italy", "Italy"))
sc("es-recs", "İspanya + REC", {"marketPurchases": [{"description": "GoO", "kwh": 1000000}]}, h=hotel("Spain", "Spain"))
sc("sg-baseline", "Singapur (PPA faktörü yok, şebeke var)", None, h=hotel("Singapore", "Singapore"))
sc("eg-manual-grid", "Mısır: şebeke faktörü yok → elle", None, h=hotel("Egypt", "Egypt"),
   energy=[row(GRID, "kWh", 3000000, mode="manual", ef=0.52), row(GAS, "CuM", 200000), row(DSL_M, "L", 5000)])
sc("ca-alberta", "Kanada / Alberta", None, h=hotel("Canada", "Alberta"))
sc("au-victoria", "Avustralya / Victoria", None, h=hotel("Australia", "Victoria"))
sc("cn-guangdong", "Çin / Guangdong: şebeke faktörü tabloda yok → elle", None, h=hotel("China", "Guangdong"),
   energy=[row(GRID, "kWh", 2400000, mode="manual", ef=0.5703), row(GAS, "CuM", 180000), row(DSL_M, "L", 6000)])
sc("us-aznm", "ABD / AZNM", None, h=hotel("United States", "AZNM"))
sc("us-nyup", "ABD / NYUP", None, h=hotel("United States", "NYUP"))
sc("mx-baseline", "Meksika", None, h=hotel("Mexico", "Mexico"))
sc("pl-baseline", "Polonya", None, h=hotel("Poland", "Poland"))

# ---------------------------------------------------------------------------
# 3) BİRİMLER VE ENERJİ TÜRLERİ (her senaryo en çok 7 satır)
# ---------------------------------------------------------------------------
sc("units-1", "Birimler: MWh, m³, kg, L, kg, L", None, h=hotel("Germany", "Germany"),
   energy=[row(GRID, "MWh", 2100), row(GAS, "CuM", 150000), row(LPG, "kg", 2000), row(DSL, "L", 5000),
           row(FO6, "kg", 8000), row(KER, "L", 900)])
sc("units-2", "Birimler: GJ, MMBtu, kg, L, Gal, kg", None, h=hotel("United Kingdom", "United Kingdom"),
   energy=[row(GRID, "GJ", 7000), row(GAS, "MMBtu", 9000), row(BUT, "kg", 700), row(PRO, "L", 3000),
           row(FO4, "Gal", 2500), row(CHAR, "kg", 1200)])
sc("units-3", "Birimler: MJ, therm, kg, m³, ton", None, h=hotel("Greece", "Greece"),
   energy=[row(GRID, "MJ", 8000000), row(GAS, "Therm", 120000), row(LNG, "kg", 2500), row(CNG, "CuM", 6000),
           row(WOOD, "MT", 30), row(BIOG, "CuM", 9000)])
sc("units-4", "Birimler: kBtu, DTH, Gal, ton", None, h=hotel("France", "France"),
   energy=[row(GRID, "kBtu", 5000000), row(GAS, "DTH", 9000), row(GSL, "Gal", 800), row(STEAM, "MT", 600),
           row(BIO, "US ton", 12), row(CHAR, "UK ton", 3)])
sc("units-5", "Birimler: mobil yakıt, biyokarışım, Towngas birimi", None, h=hotel("Italy", "Italy"),
   energy=[row(GRID, "kWh", 1800000), row(GAS, "CuM", 50000), row(GSL_B, "L", 2000), row(GSL_M, "Gal", 500),
           row(DSL_M, "kL", 12), row(TOWN, "Unit", 800)])
sc("units-6", "Birimler: soğutma ton-saat ve bölgesel", None, h=hotel("Cyprus", "Cyprus"),
   energy=[row(GRID, "kWh", 2600000), row(CHW, "Ton-Hr", 220000), row(HOTW, "GJ", 1500),
           row(STEAM, "klb", 400), row(GAS, "CCF", 4000), row(DSL_M, "Bar", 40)])
sc("units-7", "Birimler: Tokyo gazı, biyogaz, kullanılmış yağ, etanol", None, h=hotel("Poland", "Poland"),
   energy=[row(GRID, "kWh", 1700000), row(TOKYO, "CuM", 600), row(LAND, "CuM", 4000), row(USED, "L", 700),
           row(ETH, "L", 400)])
sc("units-8", "Birimler: büyük hacim birimleri", None, h=hotel("Spain", "Spain"),
   energy=[row(GRID, "MWh", 1900), row(GAS, "MCF", 3500), row(LPG, "Gal", 1800), row(DSL, "kGal", 3),
           row(FO2, "kL", 20), row(KER, "Bar", 15)])

# ---------------------------------------------------------------------------
# 4) YENİLENEBİLİR GÖSTERGELER
# ---------------------------------------------------------------------------
sc("ren-mixed", "Yenilenebilir: GES + PPA + REC bir arada", {"marketPurchases": [{"description": "REC", "kwh": 700000}]},
   h=hotel("Germany", "Germany"),
   energy=[row(GRID, "kWh", 2500000), row(GAS, "CuM", 100000), row(ONS, "kWh", 400000), row(PPA, "kWh", 500000)])
sc("ren-manual-ef-rec", "Yenilenebilir: şebeke faktörü elle + REC", {"marketPurchases": [{"description": "I-REC", "kwh": 1000000}]},
   energy=[row(GRID, "kWh", 2000000, mode="manual", ef=0.5), row(GAS, "CuM", 90000)])
sc("ren-rec-with-laundry", "Yenilenebilir: REC üst sınırı çamaşırhane elektriğini de içerir",
   {"marketPurchases": [{"description": "REC", "kwh": 2300000}],
    "laundry": {"outsourced": True, "shareKnown": False, "tonnageKnown": True, "tonnage": 200, "tonnageUnit": "Metric Tonne"}},
   energy=[row(GRID, "kWh", 2200000), row(GAS, "CuM", 120000)])
sc("ren-no-grid-row", "Yenilenebilir: yalnız PPA ve GES (şebeke tüketimi 0)", None,
   energy=[row(GRID, "kWh", 0), row(PPA, "kWh", 1800000), row(ONS, "kWh", 300000), row(GAS, "CuM", 100000)])

# ---------------------------------------------------------------------------
# 5) MÜŞTERİ RAPORU (Tab C)
# ---------------------------------------------------------------------------
sc("client-1", "Müşteri raporu: 75 oda-gece, 100 m² x 10 saat", {"client": {"roomNights": 75, "meetingArea": 100, "meetingHours": 10}})
sc("client-2", "Müşteri raporu: 410 oda-gece, 250 m² x 6 saat", {"client": {"roomNights": 410, "meetingArea": 250, "meetingHours": 6}},
   h=hotel("Germany", "Germany"))
sc("client-3", "Müşteri raporu: toplantı yok", {"client": {"roomNights": 120, "meetingArea": 0, "meetingHours": 0}}, h=hotel(meeting_area=0))
