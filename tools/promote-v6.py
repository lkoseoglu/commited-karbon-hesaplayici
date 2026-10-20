#!/usr/bin/env python3
"""Turizm v6 önizlemesini canlı adrese taşır ("canlıya al").

Kullanım (repo kökünde):   python3 tools/promote-v6.py [--dry-run]

Ne yapar
  1) Şu anki canlı sayfa  turizm-karbon-hesaplayici.html  →  turizm-karbon-hesaplayici-v5.html
     (arşiv; geri dönmek gerekirse bu dosyanın içeriği tekrar canlı adrese kopyalanır)
  2) turizm-karbon-hesaplayici-v6.html içeriği canlı adrese yazılır:
       - üst menüdeki kendi bağlantısı canlı adrese çevrilir
       - "Önizleme" şeridi kaldırılır
  3) turizm-karbon-hesaplayici-v6.html, paylaşılmış önizleme bağlantıları çalışmaya devam etsin
     diye canlı sayfaya yönlendiren küçük bir sayfaya dönüşür.

Sonra:  npm test && npm run test:e2e   →  değişen 3 HTML dosyasını GitHub'a yükleyin.
Squarespace'teki iframe adresi değişmez (turizm-karbon-hesaplayici.html).
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
LIVE = ROOT / 'turizm-karbon-hesaplayici.html'
ARCHIVE = ROOT / 'turizm-karbon-hesaplayici-v5.html'
PREVIEW = ROOT / 'turizm-karbon-hesaplayici-v6.html'

REDIRECT = """<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Turizm Karbon Hesaplayıcısı</title>
<meta http-equiv="refresh" content="0; url=turizm-karbon-hesaplayici.html">
<link rel="canonical" href="turizm-karbon-hesaplayici.html">
</head>
<body>
<p>Yeni sürüm artık asıl adreste: <a href="turizm-karbon-hesaplayici.html">Turizm Karbon Hesaplayıcısı</a></p>
<script>location.replace('turizm-karbon-hesaplayici.html' + location.hash);</script>
</body>
</html>
"""


def main(dry: bool) -> int:
    src = PREVIEW.read_text(encoding='utf-8')
    if 'data-preview-flag' not in src:
        print('turizm-karbon-hesaplayici-v6.html önizleme sayfası değil (zaten taşınmış olabilir). Hiçbir şey yapılmadı.')
        return 1
    live_html = src.replace('href="turizm-karbon-hesaplayici-v6.html" aria-current="page" data-self-link',
                            'href="turizm-karbon-hesaplayici.html" aria-current="page" data-self-link')
    live_html, n = re.subn(r'\n[ \t]*<p class="preview-flag[^\n]*</p>', '', live_html)
    if n != 1 or 'turizm-karbon-hesaplayici-v6.html' in live_html.split('<main')[0]:
        print('Beklenen işaretler bulunamadı; dosya elle değiştirilmiş olabilir. Hiçbir şey yapılmadı.')
        return 2
    live_html = live_html.replace('Turizm Karbon Hesaplayıcısı — sürüm 6 (ÖNİZLEME)', 'Turizm Karbon Hesaplayıcısı — sürüm 6')
    if dry:
        print('Deneme: dosyalar değiştirilmedi.')
        return 0
    ARCHIVE.write_text(LIVE.read_text(encoding='utf-8'), encoding='utf-8')
    LIVE.write_text(live_html, encoding='utf-8')
    PREVIEW.write_text(REDIRECT, encoding='utf-8')
    print('Tamam: canlı sayfa güncellendi, eski sürüm turizm-karbon-hesaplayici-v5.html olarak arşivlendi.')
    print('Şimdi: npm test && npm run test:e2e  — sonra 3 HTML dosyasını GitHub\'a yükleyin.')
    return 0


if __name__ == '__main__':
    sys.exit(main('--dry-run' in sys.argv))
