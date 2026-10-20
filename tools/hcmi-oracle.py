#!/usr/bin/env python3
"""
HCMI altın-referans (golden) üretici  —  tools/hcmi-oracle.py
==============================================================

Resmî "HCMI v2.0 Tool Example.xlsx" dosyasını LibreOffice ile açar, her senaryonun
girdilerini Excel hücrelerine yazar, tabloyu yeniden hesaplatır ve sonuçları
`tests/golden/hcmi-oracle.json` dosyasına kaydeder. Motorun (assets/js/hcmi-engine.js)
Excel ile aynı sonucu verdiği tests/unit/hcmi-engine.test.mjs içinde sınanır.

Bu betik yalnız referans YENİLERKEN çalıştırılır (yeni senaryo, yeni resmî sürüm).
Her testte çalışmaz — bu yüzden CI'a LibreOffice kurmak gerekmez.

KULLANIM
    python3 tools/hcmi-oracle.py --workbook "/yol/HCMI v2.0 Tool Example.xlsx" --launch
    (--launch: LibreOffice'i kendisi başlatır ve sonunda kapatır.
     Başlatmadan bağlanmak için:
       soffice --headless --invisible --norestore \\
         --accept="socket,host=127.0.0.1,port=2002;urp;StarOffice.ComponentContext" &
     sonra --launch olmadan çalıştırın.)

NEDEN "EXAMPLE" DOSYASI?  Boş araçta üç formül eksik (H24 EF bölgesi, K23, J16);
örnek dosyada hepsi var. Hesap mantığı iki dosyada da aynıdır.

GEREKSİNİM: LibreOffice + python3-uno.  Süre: ~3-6 dakika (büyük dosya açılışı dahil).
"""
import argparse
import hashlib
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import hcmi_scenarios as SCN  # noqa: E402

import uno  # noqa: E402
from com.sun.star.beans import PropertyValue  # noqa: E402

S1 = "1. Hotel Details and Result"
S2 = "2. Energy Consumption"
SA = "Tab A - Outsourced Laundry "
SB = "Tab B - Refrigerants"
SC = "Tab C - Client Report"

PRESET = {SCN.GRID: 16, SCN.GAS: 17, SCN.FO2: 18}
FREE_ROWS = [19, 20, 21, 22]
TOGGLE = {"manual": "Yes (manually add)", "default1pct": "Yes (default to 1% of total emissions)", "none": "No don't add"}
SQ = {"sqm": "Square meters", "sqft": "Square feet"}


def load_default_units():
    spec = importlib.util.spec_from_file_location("bhd", os.path.join(HERE, "build-hcmi-data.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return {name: meta[3] for name, meta in m.ENERGY_META.items()}, {name: meta[0] for name, meta in m.ENERGY_META.items()}


DEFAULT_UNIT, TYPE_ID = load_default_units()


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for ch in iter(lambda: f.read(1 << 20), b""):
            h.update(ch)
    return h.hexdigest()


# ------------------------------------------------------------------ UNO yardımcıları
def connect(port, tries=60):
    local = uno.getComponentContext()
    resolver = local.ServiceManager.createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver", local)
    last = None
    for _ in range(tries):
        try:
            ctx = resolver.resolve(f"uno:socket,host=127.0.0.1,port={port};urp;StarOffice.ComponentContext")
            return ctx
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1)
    raise SystemExit(f"LibreOffice'e bağlanılamadı: {last}")


def pv(name, value):
    p = PropertyValue()
    p.Name, p.Value = name, value
    return p


class Book:
    def __init__(self, doc):
        self.doc = doc
        self.sheets = {n: doc.Sheets.getByName(n) for n in (S1, S2, SA, SB, SC)}
        self.h24_formula = self.cell(S1, "H24").getFormula()

    def cell(self, sheet, addr):
        return self.sheets[sheet].getCellRangeByName(addr)

    def put(self, sheet, addr, value):
        c = self.cell(sheet, addr)
        if value is None or value == "":
            c.clearContents(23)
        elif isinstance(value, bool):
            c.setString("Yes" if value else "No")
        elif isinstance(value, (int, float)):
            c.setValue(float(value))
        else:
            c.setString(str(value))

    def get(self, sheet, addr):
        c = self.cell(sheet, addr)
        t = c.getType().value  # EMPTY / VALUE / TEXT / FORMULA
        if t == "EMPTY":
            return None
        if t == "VALUE":
            return c.getValue()
        if t == "TEXT":
            s = c.getString().strip()
            return s if s != "" else None
        # FORMULA
        if c.getError() != 0:
            return {"error": c.getError(), "text": c.getString()}
        if c.FormulaResultType2 == 1:  # VALUE
            return c.getValue()
        s = c.getString().strip()   # hücre biçimi metni boşluklarla doldurabiliyor
        return s if s != "" else None


def ef_override(scn, typ, mode):
    """Engine 'varsayılan' faktör yerine override uygulanıyorsa Excel'de 'Manual' olarak girilir."""
    if mode == "manual":
        return None
    h = scn["input"]["hotel"]
    for o in scn["options"].get("efOverrides", []):
        if o["country"] == h["country"] and o["region"] == h["region"] and o["typeId"] == TYPE_ID[typ]:
            return o["value"]
    return None


def apply_scenario(bk, scn):
    inp = scn["input"]
    h, sup, priv = inp["hotel"], inp["supplementary"], inp["supplementary"]["privateSpace"]

    # ---- 1. Hotel Details
    bk.put(S1, "H21", h["country"])
    if h["country"] == "United States":
        bk.put(S1, "H22", None)
        bk.cell(S1, "H24").setString(h["region"])          # eGRID alt bölgesi doğrudan
    else:
        bk.cell(S1, "H24").setFormula(bk.h24_formula)
        bk.put(S1, "H22", h["region"] if h["country"] in ("Australia", "Canada", "China") else None)
    bk.put(S1, "H25", h["roomsArea"])
    bk.put(S1, "H26", h["meetingArea"])
    bk.put(S1, "H27", h["conditionedArea"])
    bk.put(S1, "H28", SQ[h["areaUnit"]])
    bk.put(S1, "H29", h["rooms"])
    bk.put(S1, "H30", h["occupiedRooms"])
    bk.put(S1, "H34", "Yes" if inp["laundry"]["outsourced"] else "No")
    bk.put(S1, "H35", TOGGLE[sup["refrigerants"]])
    bk.put(S1, "H36", TOGGLE[sup["mobileFuels"]])
    bk.put(S1, "H37", "Yes" if priv["has"] else "No")
    if priv["has"]:
        bk.put(S1, "H38", "Yes" if priv["actual"] else "No")
        if priv["actual"]:
            bk.put(S1, "H39", None)
            bk.put(S1, "I39", None)
        else:
            bk.put(S1, "H39", "Yes" if priv["shareKnown"] else "No")
            bk.put(S1, "I39", priv["sharePct"] if priv["shareKnown"] else None)
    else:
        for a in ("H38", "H39", "I39"):
            bk.put(S1, a, None)

    # ---- 2. Energy: hangi satırlar? (motorun "otomatik ekleme" kuralının aynısı)
    rows = [dict(r) for r in inp["energy"] if r.get("type")]
    have = {r["type"] for r in rows}
    lau = inp["laundry"]
    needed = []
    if lau["outsourced"]:
        if lau["shareKnown"]:
            needed = [it["type"] for it in lau["items"] if it.get("type")]
        else:
            needed = [SCN.GRID, SCN.GAS, SCN.FO2]
    for t in needed:
        if t not in have:
            rows.append({"type": t, "unit": DEFAULT_UNIT[t], "total": 0, "privateActual": 0, "efMode": "default"})
            have.add(t)

    placement = {}
    free = list(FREE_ROWS)
    for r in rows:
        if r["type"] in PRESET:
            placement[PRESET[r["type"]]] = r
        else:
            if not free:
                raise SystemExit(f"{scn['id']}: serbest satır sayısı (4) aşıldı")
            placement[free.pop(0)] = r

    for xl in range(16, 23):
        r = placement.get(xl)
        if r is None and xl in (16, 17, 18):
            typ = {16: SCN.GRID, 17: SCN.GAS, 18: SCN.FO2}[xl]
            bk.put(S2, f"E{xl}", typ)
            bk.put(S2, f"G{xl}", DEFAULT_UNIT[typ])
            for c in "HIP":
                bk.put(S2, f"{c}{xl}", None)
            bk.put(S2, f"O{xl}", "Default")
            continue
        if r is None:
            for c in "EGHIOP":
                bk.put(S2, f"{c}{xl}", None)
            continue
        bk.put(S2, f"E{xl}", r["type"])
        bk.put(S2, f"G{xl}", r["unit"])
        bk.put(S2, f"H{xl}", r.get("total", 0))
        bk.put(S2, f"I{xl}", r.get("privateActual") or None)
        mode = r.get("efMode", "default")
        ov = ef_override(scn, r["type"], mode)
        if mode == "manual":
            bk.put(S2, f"O{xl}", "Manual")
            bk.put(S2, f"P{xl}", r.get("manualEf"))
        elif ov is not None:
            bk.put(S2, f"O{xl}", "Manual")
            bk.put(S2, f"P{xl}", ov)
        else:
            bk.put(S2, f"O{xl}", "Default")
            bk.put(S2, f"P{xl}", None)

    mk = inp.get("marketPurchases", [])
    bk.put(S2, "K27", "Yes" if mk else "No")
    for i, a in enumerate((30, 31)):
        if i < len(mk):
            bk.put(S2, f"E{a}", mk[i].get("description") or "Market purchase")
            bk.put(S2, f"K{a}", mk[i]["kwh"])
        else:
            bk.put(S2, f"E{a}", None)
            bk.put(S2, f"K{a}", None)

    # ---- Tab A
    for a in ("H14", "H15", "H17", "K17", "E23", "E24", "H22", "H23", "H24", "K22", "K23", "K24"):
        bk.put(SA, a, None)
    if lau["outsourced"]:
        if lau["shareKnown"]:
            bk.put(SA, "H14", "Yes")
            extra = [22, 23, 24]
            for it in lau["items"]:
                if not it.get("type"):
                    continue
                if it["type"] == SCN.GRID:
                    ar = 22
                else:
                    ar = [x for x in (23, 24) if x in extra and x != 22][0]
                    extra.remove(ar)
                    bk.put(SA, f"E{ar}", it["type"])
                bk.put(SA, f"H{ar}", it["total"])
                bk.put(SA, f"K{ar}", it["unit"])
        else:
            bk.put(SA, "H14", "No")
            bk.put(SA, "H15", "Yes" if lau["tonnageKnown"] else "No")
            if lau["tonnageKnown"]:
                bk.put(SA, "H17", lau["tonnage"])
                bk.put(SA, "K17", lau["tonnageUnit"])

    # ---- Tab B
    rf_ids = [f"rf{i:02d}" for i in range(1, 42)]
    xl_rows = list(range(19, 23)) + list(range(25, 62))
    amounts = inp.get("refrigerantAmountsKg", {})
    bk.put(SB, "H14", "Yes" if sup["refrigerants"] == "manual" else "No")
    for rid, xr in zip(rf_ids, xl_rows):
        bk.put(SB, f"E{xr}", amounts.get(rid) if sup["refrigerants"] == "manual" else None)

    # ---- Tab C
    cl = inp.get("client")
    for a, k in (("H13", "roomNights"), ("H14", "meetingArea"), ("H15", "meetingHours")):
        bk.put(SC, a, cl[k] if cl else None)

    bk.doc.calculateAll()


OUT_S1 = {"total": "H47", "guestrooms": "H48", "meetings": "H49", "cpor": "H50", "meetingKgPerAreaHour": "H51",
          "kgPerAreaYear": "H52", "renewableKwh": "H55", "renewablePctElectricity": "H56", "renewablePctEnergy": "H57",
          "scope1Official": "H60", "scope2Official": "H61", "scope3Laundry": "H62"}
OUT_S2 = {"K23": "K23", "L23": "L23", "M23": "M23", "N23": "N23", "R23": "R23", "K32": "K32", "M32": "M32"}


def read_results(bk):
    res = {"sheet1": {}, "sheet2": {}, "rows": [], "tabB": {}, "tabC": {}}
    for k, a in OUT_S1.items():
        res["sheet1"][k] = bk.get(S1, a)
    for k, a in OUT_S2.items():
        res["sheet2"][k] = bk.get(S2, a)
    for xl in range(16, 23):
        res["rows"].append({
            "row": xl, "type": bk.get(S2, f"E{xl}"), "K": bk.get(S2, f"K{xl}"), "L": bk.get(S2, f"L{xl}"),
            "M": bk.get(S2, f"M{xl}"), "N": bk.get(S2, f"N{xl}"), "O": bk.get(S2, f"O{xl}"),
            "P": bk.get(S2, f"P{xl}"), "Q": bk.get(S2, f"Q{xl}"), "R": bk.get(S2, f"R{xl}")})
    res["tabB"]["K62"] = bk.get(SB, "K62")
    for k in ("H20", "H21", "H22"):
        res["tabC"][k] = bk.get(SC, k)
    return res


def problems(res):
    bad = []
    def chk(name, v):
        if isinstance(v, dict) and "error" in v:
            bad.append(f"{name}: hücre hatası {v}")
    for k, v in res["sheet1"].items():
        chk("S1." + k, v)
    for k, v in res["sheet2"].items():
        chk("S2." + k, v)
    for r in res["rows"]:
        for c in "KLMNQR":
            chk(f"S2.{c}{r['row']}", r[c])
        # Q (varsayılan faktör) yalnız "Default" seçiliyse önemlidir; R her durumda sayı olmalı
        if r["type"] and r["O"] == "Default" and isinstance(r["Q"], str):
            bad.append(f"S2.Q{r['row']} varsayılan faktör yok: {r['Q']!r}")
        if r["type"] and isinstance(r["R"], str):
            bad.append(f"S2.R{r['row']} metin döndü: {r['R']!r}")
    return bad


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--workbook", required=True, help="Resmî 'HCMI v2.0 Tool Example.xlsx'")
    ap.add_argument("--out", default=os.path.join(HERE, "..", "tests", "golden", "hcmi-oracle.json"))
    ap.add_argument("--port", type=int, default=2002)
    ap.add_argument("--launch", action="store_true", help="LibreOffice'i bu betik başlatsın")
    ap.add_argument("--only", help="Yalnız bu kimliklerle başlayan senaryolar (virgülle)")
    args = ap.parse_args()

    proc, prof = None, None
    if args.launch:
        prof = tempfile.mkdtemp(prefix="lo-profile-")
        proc = subprocess.Popen([
            "soffice", "--headless", "--invisible", "--norestore", "--nologo", "--nodefault",
            f"-env:UserInstallation=file://{prof}",
            f"--accept=socket,host=127.0.0.1,port={args.port};urp;StarOffice.ComponentContext"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        ctx = connect(args.port)
        desktop = ctx.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", ctx)
        t0 = time.time()
        url = uno.systemPathToFileUrl(os.path.abspath(args.workbook))
        doc = desktop.loadComponentFromURL(url, "_blank", 0, (pv("Hidden", True), pv("ReadOnly", False)))
        print(f"dosya açıldı ({time.time() - t0:.0f} sn)", flush=True)
        bk = Book(doc)

        want = [s for s in SCN.SCENARIOS if not args.only or any(s["id"].startswith(p) for p in args.only.split(","))]
        out, bad_all = [], {}
        for i, scn in enumerate(want, 1):
            t1 = time.time()
            apply_scenario(bk, scn)
            res = read_results(bk)
            bad = problems(res)
            if bad:
                bad_all[scn["id"]] = bad
            out.append({"id": scn["id"], "title": scn["title"], "options": scn["options"], "input": scn["input"], "excel": res})
            print(f"[{i:2d}/{len(want)}] {scn['id']:<34s} H47={res['sheet1']['total']!s:<24.24} ({time.time() - t1:.1f} sn)", flush=True)
        doc.close(True)

        meta = {"workbook": os.path.basename(args.workbook), "workbookSha256": sha256(args.workbook),
                "libreoffice": subprocess.run(["soffice", "--version"], capture_output=True, text=True).stdout.strip(),
                "generatedAt": time.strftime("%Y-%m-%d"), "count": len(out)}
        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump({"meta": meta, "scenarios": out}, f, ensure_ascii=False, indent=1)
        print(f"yazıldı: {os.path.abspath(args.out)}  ({len(out)} senaryo)")
        if bad_all:
            print("\nDİKKAT — Excel'in hata/metin döndürdüğü senaryolar (senaryoyu düzeltin):")
            for k, v in bad_all.items():
                print(" ", k)
                for line in v[:6]:
                    print("     ", line)
    finally:
        if proc:
            proc.terminate()
            try:
                proc.wait(timeout=15)
            except Exception:  # noqa: BLE001
                proc.kill()


if __name__ == "__main__":
    main()
