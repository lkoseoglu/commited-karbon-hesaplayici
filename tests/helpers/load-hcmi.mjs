// HCMI veri + motor dosyalarini (klasik <script> dosyalari) Node icinde yukler.
// Tarayicidaki davranisla ayni: dosyalar globalThis.HCMI_DATA / globalThis.HCMI atar.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Verilen klasik betik dosyalarini (repo köküne göre yol) bos bir baglamda sirayla calistirir.
// HCMI'ya ihtiyac duymayan moduller (sayi girisi, kiyas, yol haritasi) icin.
export function loadScripts(files = []) {
  const ctx = {};
  ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  return ctx;
}

export function loadHCMI(extra = []) {
  return loadScripts(['assets/js/hcmi-data.js', 'assets/js/hcmi-engine.js', ...extra]);
}

// Turizm sayfasinin (v6) hesap katmani: sayfadaki <script> sirasiyla AYNI olmali.
export const APP_SCRIPTS = ['assets/js/hcmi-data.js', 'assets/js/hcmi-engine.js', 'assets/js/tr-reference.js', 'assets/js/benchmarks.js',
  'assets/js/pathway.js', 'assets/js/measures.js', 'assets/js/num-input.js', 'assets/js/turizm/model.js', 'assets/js/turizm/compute.js',
  'assets/js/turizm/agency.js', 'assets/js/turizm/texts.js', 'assets/js/turizm/storage.js', 'assets/js/turizm/report.js'];

export function loadApp(extraGlobals = {}) {
  const ctx = loadScripts(APP_SCRIPTS);
  Object.assign(ctx, extraGlobals);
  return ctx;
}
