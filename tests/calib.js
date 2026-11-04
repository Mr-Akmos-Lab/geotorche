const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('pageerror', e.message));
  await page.goto('http://localhost:8765/index.html');
  const res = await page.evaluate(async () => {
    const man = await (await fetch('vis/manifest.json')).json();
    const load = f => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = 'vis/' + f; });
    const refs = {};
    for (const [n, f] of Object.entries(man.refs)) { const i = await load(f); refs[n] = [GT.Vision.grab(i, i.naturalWidth, i.naturalHeight, GT.Vision.REF_FRAC)]; }
    const sc = async (n, f) => { const i = await load(f); return GT.Vision.scoreSource(i, i.naturalWidth, i.naturalHeight, refs[n]); };
    const pos = [], neg = [];
    for (const [n, f] of man.pos) pos.push({ n, f, s: await sc(n, f) });
    for (const [n, f, k] of man.neg) neg.push({ n, f, k, s: await sc(n, f) });
    // temps de calcul
    const i = await load(man.refs.coffee); const t0 = performance.now(); for (let k = 0; k < 20; k++) GT.Vision.scoreSource(i, 640, 640, refs.coffee.concat(refs.coffee, refs.coffee)); const ms = (performance.now() - t0) / 20;
    return { pos, neg, ms };
  });
  const q = (a, p) => { const s = a.map(x => x.s).sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))].toFixed(3); };
  console.log('pos n', res.pos.length, 'min', q(res.pos, 0), 'p10', q(res.pos, 0.1), 'med', q(res.pos, 0.5));
  for (const k of ['near', 'other']) { const a = res.neg.filter(x => x.k === k); console.log(k, 'n', a.length, 'med', q(a, 0.5), 'p90', q(a, 0.9), 'p98', q(a, 0.98), 'max', q(a, 1)); }
  for (const T of [0.55, 0.6, 0.62, 0.64, 0.66, 0.68, 0.7, 0.72]) {
    const tpr = res.pos.filter(x => x.s >= T).length / res.pos.length, fn = res.neg.filter(x => x.s >= T);
    console.log('T', T, 'TPR', tpr.toFixed(2), 'FP near', fn.filter(x => x.k === 'near').length, 'FP other', fn.filter(x => x.k === 'other').length);
  }
  console.log('worst pos', res.pos.sort((a, b) => a.s - b.s).slice(0, 8).map(x => x.f + ':' + x.s.toFixed(2)).join(' '));
  console.log('worst neg', res.neg.sort((a, b) => b.s - a.s).slice(0, 8).map(x => x.n + '<-' + x.f + ':' + x.s.toFixed(2)).join(' '));
  console.log('ms per frame (3 refs x 3 scales):', res.ms.toFixed(1));
  await browser.close();
})();
