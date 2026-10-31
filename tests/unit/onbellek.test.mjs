// Tarayıcı önbelleği: GitHub Pages her dosyayı 10 dakika önbellekte tutar. Yeni sürüm yayınlanınca eski bir
// JavaScript dosyasının yeni sayfayla karışmaması için sayfalardaki yerel dosya bağlantıları uygulama sürümünü taşır
// ("assets/js/turizm/app.js?v=6.4.0"). Sürüm (assets/js/turizm/model.js APP_VERSION) artırılınca bu bağlantılar da
// aynı sürüme çekilmeli; bu test unutulmasını engeller.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP_VERSION = fs.readFileSync(path.join(ROOT, 'assets/js/turizm/model.js'), 'utf8').match(/APP_VERSION = '([^']+)'/)[1];

for (const page of ['turizm-karbon-hesaplayici.html', 'turizm-admin.html']) {
  test(page + ': yerel dosya bağlantıları uygulama sürümünü taşır (?v=' + APP_VERSION + ')', () => {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const refs = [...html.matchAll(/(?:src|href)="(assets\/[^"]+\.(?:js|css)(?:\?[^"]*)?)"/g)].map((m) => m[1]);
    assert.ok(refs.length > 5, 'bağlantı bulunamadı');
    const wrong = refs.filter((r) => !r.endsWith('?v=' + APP_VERSION));
    assert.deepEqual(wrong, [], 'sürümü eksik ya da eski bağlantılar');
    for (const r of refs) { assert.ok(fs.existsSync(path.join(ROOT, r.split('?')[0])), r + ' dosyası yok'); }
  });
}
