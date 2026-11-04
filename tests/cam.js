const { chromium } = require('playwright');
const URL = 'http://localhost:8765/index.html';
const out = []; const ok = (n, c, x) => out.push((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : ''));
async function run(name, initScript, perms, fn) {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await b.newContext({ viewport: { width: 412, height: 860 }, permissions: perms, geolocation: { latitude: 7.18, longitude: 2.06, accuracy: 8 } });
  if (initScript) await ctx.addInitScript(initScript);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await p.waitForTimeout(600);
  await fn(p); ok(name + ' : aucune erreur JS', errs.length === 0, errs.join(' | '));
  await b.close();
}
(async () => {
  // 1. caméra refusée
  await run('refus', null, ['geolocation'], async p => {
    await p.click('#btnTorch'); await p.waitForSelector('#shInfo.open', { timeout: 8000 }).catch(() => {});
    const t = await p.textContent('#iTitle').catch(() => ''); ok('caméra refusée : aide affichée', /bloquée/.test(t), t);
    ok('bouton réactivé', !(await p.$eval('#btnTorch', b => b.disabled)) && /Allumer/.test(await p.textContent('#btnTorch')));
    await p.screenshot({ path: '/tmp/cam_denied.png' });
  });
  // 2. premier réglage refusé (OverconstrainedError), deuxième accepté
  await run('repli', () => { const g = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); let n = 0; navigator.mediaDevices.getUserMedia = c => { n++; window.__gum = n; if (n === 1) { const e = new Error('x'); e.name = 'OverconstrainedError'; return Promise.reject(e); } return g(c); }; }, ['geolocation', 'camera'], async p => {
    await p.click('#btnTorch'); const on = await p.waitForFunction(() => GT.S.torchOn, null, { timeout: 8000 }).then(() => true).catch(() => false);
    ok('réglage refusé puis réglage simple : torche allumée', on, 'essais ' + await p.evaluate(() => window.__gum));
  });
  // 3. caméra qui ne répond jamais
  await run('silence', () => { navigator.mediaDevices.getUserMedia = () => new Promise(() => { }); }, ['geolocation', 'camera'], async p => {
    await p.click('#btnTorch'); await p.waitForTimeout(1500);
    ok('pendant l\'attente : bouton « Démarrage de la caméra… »', /Démarrage/.test(await p.textContent('#btnTorch')));
    await p.waitForSelector('#shInfo.open', { timeout: 32000 }).catch(() => {});
    const t = await p.textContent('#iTitle').catch(() => ''); ok('sans réponse : aide après 25 s', /Pas de réponse/.test(t), t);
  });
  // 4. caméra occupée
  await run('occupée', () => { navigator.mediaDevices.getUserMedia = () => { const e = new Error('busy'); e.name = 'NotReadableError'; return Promise.reject(e); }; }, ['geolocation', 'camera'], async p => {
    await p.click('#btnTorch'); await p.waitForSelector('#shInfo.open', { timeout: 8000 }).catch(() => {});
    ok('caméra occupée : aide adaptée', /occupée/.test(await p.textContent('#iTitle').catch(() => '')));
  });
  console.log(out.join('\n'));
})();
