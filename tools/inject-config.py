#!/usr/bin/env python3
"""config.default.json'u HTML dosyalarındaki gömülü DEFAULT_CONFIG bloğuna yazar.

Kullanım (depo kökünde):  python3 tools/inject-config.py
Admin panelinden "JSON indir" ile alınan config'i önce config.default.json'a kaydedin,
sonra bu komutu çalıştırın. Elle kopyala-yapıştır gerekmez.
"""
import json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
TARGETS = ["kapsam3-karbon-hesaplayici.html", "karbon-admin.html"]
MARK = "const DEFAULT_CONFIG = "

cfg = json.loads((ROOT / "config.default.json").read_text(encoding="utf-8"))
block = MARK + json.dumps(cfg, ensure_ascii=False, indent=1) + ";\n"
for name in TARGETS:
    p = ROOT / name
    s = p.read_text(encoding="utf-8")
    i = s.find(MARK)
    if i < 0:
        sys.exit(f"{name}: DEFAULT_CONFIG bulunamadı")
    j = s.index("\n};\n", i) + 4
    p.write_text(s[:i] + block + s[j:], encoding="utf-8")
    print(f"{name}: güncellendi (v{cfg['meta']['version']})")
