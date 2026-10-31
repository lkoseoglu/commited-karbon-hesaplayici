// Squarespace "Özel CSS" için hareketli deniz zemini üretir (yalnız hesaplayıcı sayfaları).
//
// Kullanım:  node tools/deniz-dalga-uret.mjs > docs/squarespace-deniz-dalgalari.css
//
// Neden üretici? Dalga çizgileri birkaç sinüsün toplamıdır ve döşeme (1440 px) boyunca
// kesintisiz tekrar etmesi gerekir; elle yazılan Bézier eğrilerinde birleşim yerinde kırık
// oluşuyordu. Burada her dalga, döşeme genişliğinde tam sayıda tekrar eden sinüslerden
// örneklenir ve Catmull-Rom yöntemiyle yumuşak Bézier yoluna çevrilir.
//
// Katmanlar (arkadan öne):
//   body::before          su yüzeyinden süzülen ışık hüzmeleri (yavaşça salınır)
//   #siteWrapper::before  arka dalga (en ağır akan, açık renk)
//   #siteWrapper::after   orta dalga
//   body::after           ön dalga (en koyu, en hızlı)
// Hepsi position:fixed + z-index:-1 olduğu için sayfa içeriğinin ve hesaplayıcı penceresinin
// arkasında kalır, tıklamayı engellemez (pointer-events:none). "Hareketi azalt" ayarı açık
// cihazlarda dalgalar durur, çizim kalır.
//
// Squarespace Özel CSS'i LESS ile derler: calc() ve negatif konumlar kullanılmadı
// (eski LESS sürümleri calc içinde hesap yapabiliyor); bu yüzden genişlik left/right ile verildi.

const PAGES = ['collection-6a7c6126fae79c31708febfa', 'collection-6a670c5a88ee2d075a23ced5'];   // Turizm, Kapsam 3
const TILE_W = 1440, TILE_H = 600;

function wavePath(terms, mid, samples = 48) {
  const pts = [];
  for (let i = 0; i < samples; i++) {
    const x = (i / samples) * TILE_W, t = i / samples;
    const y = mid + terms.reduce((s, [amp, k, ph]) => s + amp * Math.sin(2 * Math.PI * k * t + ph), 0);
    pts.push([x, y]);
  }
  const P = (i) => { const n = pts.length; const j = ((i % n) + n) % n; const w = Math.floor(i / n); return [pts[j][0] + w * TILE_W, pts[j][1]]; };
  const f = (v) => (Math.round(v * 10) / 10).toString();
  let d = `M0 ${f(pts[0][1])}`;
  for (let i = 0; i < samples; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}

function waveSvg({ terms, fill, fillOp, stroke, strokeOp, glowOp }) {
  const line = wavePath(terms, 50);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${TILE_W} ${TILE_H}' preserveAspectRatio='none'>`
    + `<path d='${line} V${TILE_H} H0Z' fill='${fill}' fill-opacity='${fillOp}'/>`
    + `<path d='${line}' fill='none' stroke='${stroke}' stroke-opacity='${glowOp}' stroke-width='9'/>`
    + `<path d='${line}' fill='none' stroke='${stroke}' stroke-opacity='${strokeOp}' stroke-width='1.6'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27')}")`;
}

// Genlik (px), döşeme başına tekrar sayısı, faz
const LAYERS = {
  back:  { terms: [[20, 2, 0.3], [7, 3, 1.1], [3, 7, 2.4]], fill: '#bfe6f7', fillOp: 0.06, stroke: '#ffffff', strokeOp: 0.30, glowOp: 0.07 },
  mid:   { terms: [[15, 3, 0.7], [6, 5, 2.0], [2.5, 8, 0.5]], fill: '#03203a', fillOp: 0.30, stroke: '#bfe6f7', strokeOp: 0.22, glowOp: 0.06 },
  front: { terms: [[12, 4, 1.4], [5, 7, 0.4], [2, 11, 1.9]], fill: '#021a30', fillOp: 0.42, stroke: '#bfe6f7', strokeOp: 0.16, glowOp: 0.05 }
};

const sel = (suffix) => PAGES.map((p) => `body#${p}${suffix}`).join(',\n');

const rays = [
  // [başlangıç, tepe, bitiş açısı (derece), opaklık]; yelpaze 135-225 derece (aşağı doğru)
  [4, 7, 10, 0.07], [15, 17.5, 20, 0.05], [25, 29, 33, 0.09], [37, 39.5, 42, 0.05],
  [46, 49, 52, 0.08], [56, 58.5, 61, 0.05], [65, 68.5, 72, 0.08], [77, 79.5, 82, 0.05]
].map(([a, b, c, o]) => `rgba(255,255,255,0) ${a}deg,rgba(255,255,255,${o}) ${b}deg,rgba(255,255,255,0) ${c}deg`).join(',');

const css = `/* =========================================================================
   8) HAREKETLI DENIZ ZEMINI (2026-10-31)
   "Deniz" temasinin (1-7) ustune eklenir; yalnizca hesaplayici sayfalari.
   Isik huzmeleri + uc kat dalga, icerigin ve hesaplayici penceresinin arkasinda.
   Kaynak ve uretici: GitHub depo, tools/deniz-dalga-uret.mjs
   Geri almak icin: bu blogun tamamini silmek yeterlidir (1-7 aynen kalir).
   ========================================================================= */

/* 8a) Su yuzeyinden suzulen isik huzmeleri (yavasca salinir) */
${sel('::before')}{content:"";position:fixed;z-index:-1;pointer-events:none;top:-35vh;left:0;right:0;height:135vh;background:conic-gradient(from 135deg at 50% 0%,rgba(255,255,255,0) 0deg,${rays},rgba(255,255,255,0) 90deg);-webkit-mask-image:linear-gradient(180deg,rgba(0,0,0,0) 18%,#000 30%,rgba(0,0,0,.5) 55%,rgba(0,0,0,0) 85%);mask-image:linear-gradient(180deg,rgba(0,0,0,0) 18%,#000 30%,rgba(0,0,0,.5) 55%,rgba(0,0,0,0) 85%);transform-origin:50% 0;animation:cmDenizSalin 22s ease-in-out infinite alternate,cmDenizParilti 9s ease-in-out infinite alternate}

/* 8b) Uc kat dalga: arkadaki agir, ondeki daha hizli akar (derinlik hissi) */
${sel(' #siteWrapper::before')},
${sel(' #siteWrapper::after')},
${sel('::after')}{content:"";position:fixed;z-index:-1;pointer-events:none;left:0;right:-1440px;bottom:0;background-repeat:repeat-x;background-position:0 0;background-size:1440px 600px;will-change:transform}
${sel(' #siteWrapper::before')}{height:62vh;background-image:${waveSvg(LAYERS.back)};animation:cmDenizAk 120s linear infinite,cmDenizKabar 9s ease-in-out infinite alternate}
${sel(' #siteWrapper::after')}{height:44vh;background-image:${waveSvg(LAYERS.mid)};animation:cmDenizAk 80s linear infinite,cmDenizKabar 7s ease-in-out infinite alternate}
${sel('::after')}{height:26vh;background-image:${waveSvg(LAYERS.front)};animation:cmDenizAk 54s linear infinite,cmDenizKabar 6s ease-in-out infinite alternate}

@keyframes cmDenizAk{from{transform:translate3d(0,0,0)}to{transform:translate3d(-1440px,0,0)}}
@keyframes cmDenizKabar{from{translate:0 0}to{translate:0 10px}}
@keyframes cmDenizSalin{from{transform:rotate(-2deg)}to{transform:rotate(2deg)}}
@keyframes cmDenizParilti{from{opacity:.65}to{opacity:1}}

/* 8c) "Hareketi azalt" acik cihazlarda dalgalar durur, cizim kalir */
@media (prefers-reduced-motion: reduce){
${sel('::before')},
${sel(' #siteWrapper::before')},
${sel(' #siteWrapper::after')},
${sel('::after')}{animation:none !important}
}
`;

process.stdout.write(css);
