import { serve, launch, newPage } from './helpers.mjs';
const { srv, base } = await serve();
const b = await launch();
for (const f of ['turizm-karbon-hesaplayici.html', 'kapsam3-karbon-hesaplayici.html']) {
  const p = await newPage(b, { width: 1280, height: 900 });
  await p.goto(base + f, { waitUntil: 'load' });
  await p.waitForTimeout(600);
  console.log(f, 'title=', await p.title(), 'errors=', JSON.stringify(p.errors));
  await p.screenshot({ path: '/tmp/claude-0/-home-claude/0621e7eb-eeba-553e-bf4b-1b6659cab414/scratchpad/before-' + f.slice(0, 5) + '.png' });
}
await b.close(); srv.close();
