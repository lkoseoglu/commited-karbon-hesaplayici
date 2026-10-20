#!/usr/bin/env python3
"""Dalga (sea-waves) SVG isaretlemesini uretir. Iki sayfaya ayni metin yapistirilir.

Kullanim:  python3 tools/sea-waves-snippet.py        -> stdout'a yazar

Her katman 2400 birim genisliginde, 1200 birimlik iki ayni parcadan olusur; dalga
periyodu (1200 / 600 / 400) 1200'u tam boldugu icin kayma animasyonu dikissizdir.
Animasyon ve renkler assets/css/theme-sea.css icindedir.
"""
def layer(cls, period, amp, y0, h=64):
    half = period // 2
    d = f"M0,{y0} Q{period // 4},{y0 - amp} {half},{y0}"
    x = half
    while x < 2400:
        x += half
        d += f" T{x},{y0}"
    d += f" V{h} H0 Z"
    return f'    <svg class="{cls}" viewBox="0 0 2400 {h}" preserveAspectRatio="none"><path d="{d}"/></svg>'

def snippet():
    return "\n".join([
        '  <div class="sea-waves" aria-hidden="true">',
        layer("w1", 1200, 12, 30),
        layer("w2", 600, 9, 40),
        layer("w3", 400, 6, 50),
        '  </div>',
    ])

if __name__ == "__main__":
    print(snippet())
