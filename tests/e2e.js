const { chromium } = require('playwright');
const fs = require('fs'); const { execSync } = require('child_process');
const URL = 'http://localhost:8765/index.html', DIR = '/tmp/gt-profile', M = __dirname + '/media/';
const P = { latitude: 7.18765, longitude: 2.06321 };
const off = (dN, dE) => ({ latitude: P.latitude + dN / 111320, longitude: P.longitude + dE / (111320 * Math.cos(P.latitude * Math.PI / 180)) });
const results = []; const ok = (n, c, x) => { results.push((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
async function open(video, geo) {
  const ctx = await chromium.launchPersistentContext(DIR, {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=' + M + video],
    viewport: { width: 412, height: 860 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, permissions: ['geolocation', 'camera'], geolocation: { ...geo, accuracy: 6 }, locale: 'fr-FR'
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  page.errs = []; page.on('pageerror', e => page.errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') page.errs.push(m.text()); });
  await page.goto(URL); await page.waitForTimeout(800);
  return { ctx, page };
}
async function jitter(ctx, geo, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { await ctx.setGeolocation({ latitude: geo.latitude + (Math.random() - .5) * 2e-5, longitude: geo.longitude + (Math.random() - .5) * 2e-5, accuracy: 4 }); await new Promise(r => setTimeout(r, 250)); } }
async function measure(page, ctx, geo) { await page.click('#hMeasure'); await jitter(ctx, geo, 2500); await page.waitForSelector('#hPosOut b.ok', { timeout: 20000 }); }
async function waitFor(page, fn, arg, ms = 12000) { try { await page.waitForFunction(fn, arg, { timeout: ms, polling: 200 }); return true; } catch (e) { return false; } }
async function tapIcon(page, id) { const p = await page.evaluate(id => { const i = GT.S.icons.find(x => x.id === id); const r = document.querySelector('#fx').getBoundingClientRect(); return i ? { x: r.left + i.x / devicePixelRatio, y: r.top + i.y / devicePixelRatio } : null; }, id); if (!p) return false; await page.mouse.click(p.x, p.y); return true; }

(async () => {
  fs.rmSync(DIR, { recursive: true, force: true });
  // ---------- 1. Cacher (caméra : scène A) ----------
  let { ctx, page } = await open('A1.y4m', P);
  await page.click('nav.tabs button[data-view=cacher]');
  await page.setInputFiles('#hFiles', M + 'chat.jpg');
  await page.fill('#hNote', 'Bravo, tu as trouvé le bol !'); await page.fill('#hLabel', 'Photo du bol'); await page.fill('#hHint', 'Sur le plan de travail');
  await measure(page, ctx, P);
  ok('mesure de position', /Lieu enregistré/.test(await page.textContent('#hPosOut')), (await page.textContent('#hPosOut')).slice(0, 90));
  await page.click('#hAim'); await page.waitForFunction(() => document.querySelector('#vVid').videoWidth > 0, null, { timeout: 8000 });
  await page.waitForTimeout(400); await page.click('#vShot'); await page.waitForTimeout(300); await page.click('#vShot');
  await page.screenshot({ path: '/tmp/e_viseur.png' });
  await page.click('#vDone');
  ok('2 photos de l\'objet', (await page.$$('#hThumbs img')).length === 2);
  await page.fill('#hPw', 'bol bleu cuisine'); await page.fill('#hPw2', 'bol bleu cuisine');
  await page.click('#hGo'); await page.waitForSelector('#shDone.open', { timeout: 20000 });
  await page.waitForTimeout(300); await page.screenshot({ path: '/tmp/e_done.png' });
  await page.click('#dShare'); await page.waitForSelector('#shShare.open'); const share = await page.inputValue('#sText');
  ok('texte de partage', /Photo du bol/.test(share) && /maps.google.com/.test(share) && /mot de passe à part/.test(share));
  await page.click('#shShare [data-close]');
  // lieu secret
  await page.click('nav.tabs button[data-view=cacher]');
  await page.fill('#hNote', 'Le trésor est à toi.'); await page.fill('#hLabel', 'Trésor');
  await page.click('#hMode button[data-m=secret]'); await measure(page, ctx, P);
  await page.fill('#hPw', 'jeu de piste 2026'); await page.fill('#hPw2', 'jeu de piste 2026');
  await page.click('#hGo'); await page.waitForSelector('#shDone.open', { timeout: 20000 }); await page.click('#shDone [data-close]');
  // étiquette
  await page.click('#hMode button[data-m=visible]'); await page.fill('#hNote', 'Code du cadenas : 4821'); await page.fill('#hLabel', 'Clé du bureau');
  await measure(page, ctx, P); await page.check('#hTag');
  await page.fill('#hPw', 'bureau ferme a cle'); await page.fill('#hPw2', 'bureau ferme a cle');
  await page.click('#hGo'); await page.waitForSelector('#shDone.open', { timeout: 20000 });
  await page.click('#dTag'); await page.waitForSelector('#shTag.open'); await page.waitForTimeout(300); await page.screenshot({ path: '/tmp/e_tag.png' });
  const info = await page.evaluate(() => GT.S.caps.map(c => ({ id: c.id, label: c.meta.label, mode: c.meta.place.mode, tag: c.own && c.own.tag, look: !!c.meta.look, heading: c.meta.place.heading })));
  ok('3 cachettes créées', info.length === 3, info.map(x => x.label + ':' + x.mode).join(', '));
  const vis = info.find(x => x.label === 'Photo du bol'), sec = info.find(x => x.label === 'Trésor'), tag = info.find(x => x.label === 'Clé du bureau');
  const qrPng = await page.evaluate(t => GT.QR.pngDataURL(t, 'Clé du bureau'), 'GT1:' + tag.id + ':' + tag.tag);
  const gtch = await page.evaluate(id => { const c = GT.capById(id); return Array.from(GT.serialize(c.meta, c.ct)); }, vis.id);
  fs.writeFileSync('/tmp/photo-du-bol.gtch', Buffer.from(gtch));
  fs.writeFileSync(M + 'qr.png', Buffer.from(qrPng.split(',')[1], 'base64'));
  execSync(`python3 -c "
from PIL import Image
q=Image.open('${M}qr.png').convert('RGB'); bg=Image.open('${M}B.png').convert('RGB'); q=q.resize((380,int(380*q.size[1]/q.size[0]))).rotate(7,expand=True,fillcolor=(90,80,70)); bg.paste(q,((720-q.size[0])//2,(960-q.size[1])//2)); bg.save('${M}QR.png')"`);
  execSync(`ffmpeg -y -loglevel error -loop 1 -i ${M}QR.png -t 1 -r 5 -pix_fmt yuv420p ${M}QR.y4m`);
  ok('aucune erreur JS (cacher)', page.errs.length === 0, page.errs.join(' | '));
  await ctx.close();

  // ---------- 2. Retrouver : même scène, autre angle et lumière, à 5 m ----------
  ({ ctx, page } = await open('A2.y4m', off(3, 4)));
  await page.click('#btnTorch');
  const t0 = Date.now();
  const found = await waitFor(page, id => GT.S.ev[id] && GT.S.ev[id].reveal, vis.id);
  ok('torche : le bol est reconnu', found, ((Date.now() - t0) / 1000).toFixed(1) + ' s, score ' + (await page.evaluate(id => GT.S.vis[id] && GT.S.vis[id].ema.toFixed(3), vis.id)));
  await page.waitForTimeout(400); await page.screenshot({ path: '/tmp/e_found.png' });
  await tapIcon(page, vis.id); await page.waitForSelector('#shUnlock.open');
  for (let i = 0; i < 3; i++) { await page.fill('#uPw', 'mauvais ' + i); await page.click('#uGo'); await page.waitForTimeout(900); }
  const lockMsg = await page.textContent('#uErr'); ok('3 erreurs : attente imposée', /Patientez/.test(lockMsg), lockMsg);
  await page.waitForTimeout(5200);
  await page.fill('#uPw', 'bol bleu cuisine'); await page.click('#uGo');
  const opened = await waitFor(page, () => document.querySelector('#shView.open') && document.querySelector('#vBody img'), null, 15000);
  ok('fichier ouvert (photo affichée)', opened, await page.evaluate(() => document.querySelector('#vBody .notebox') && document.querySelector('#vBody .notebox').textContent));
  await page.waitForTimeout(400); await page.screenshot({ path: '/tmp/e_open.png' });
  await page.click('#vClose');
  // lieu secret : armer puis marcher
  await page.selectOption('#target', sec.id); await page.waitForTimeout(400);
  const armBtn = await page.$('#hintR button'); ok('bouton « Entrer le mot de passe » pour le lieu secret', !!armBtn);
  await ctx.setGeolocation({ ...off(140, -60), accuracy: 8 }); await page.waitForTimeout(300);
  await armBtn.click(); await page.waitForSelector('#shUnlock.open'); await page.fill('#uPw', 'faute de frappe'); await page.click('#uGo');
  await page.waitForTimeout(2500);
  const retry = await page.$('#hintR button'); const rt = retry ? await retry.textContent() : '';
  ok('lieu secret : mot de passe faux, on peut le ressaisir', /Ressaisir/.test(rt), rt);
  await retry.click(); await page.waitForSelector('#shUnlock.open'); await page.fill('#uPw', 'jeu de piste 2026'); await page.click('#uGo');
  await page.waitForTimeout(3500);
  ok('lieu secret : rien à 150 m', !(await page.evaluate(id => GT.S.ev[id].reveal, sec.id)), await page.textContent('#hintL'));
  await ctx.setGeolocation({ ...off(-4, 6), accuracy: 9 });
  const sfound = await waitFor(page, id => GT.S.ev[id] && GT.S.ev[id].reveal, sec.id, 10000);
  ok('lieu secret : l\'icône apparaît sur place', sfound, (await page.evaluate(id => GT.S.armed[id].tried.size, sec.id)) + ' cases testées au total');
  await page.waitForTimeout(300); await tapIcon(page, sec.id);
  ok('lieu secret : ouvert', await waitFor(page, () => /trésor/.test(document.querySelector('#vBody').textContent), null, 8000));
  await page.click('#vClose');
  // loin
  await page.selectOption('#target', vis.id); await ctx.setGeolocation({ ...off(200, 0), accuracy: 6 }); await page.waitForTimeout(1500);
  const farHint = await page.textContent('#hintL');
  ok('à 200 m : pas d\'icône, guidage', !(await page.evaluate(id => GT.S.ev[id].reveal, vis.id)) && /À (19\d|2\d\d) m vers le sud/.test(farHint), farHint);
  await page.screenshot({ path: '/tmp/e_far.png' });
  const j = await page.evaluate(() => GT.Store.kvGet('journal', []));
  ok('journal : 3 refus puis ouvertures', j.filter(e => !e.ok).length === 3 && j.filter(e => e.ok).length === 2, j.map(e => (e.ok ? 'ok' : 'non') + '@' + e.lat).join(' '));
  ok('aucune erreur JS (retrouver)', page.errs.length === 0, page.errs.join(' | '));
  await ctx.close();

  // ---------- 3. Autre scène (astronaute) au bon endroit : pas d'icône ----------
  ({ ctx, page } = await open('B.y4m', off(2, 1)));
  await page.selectOption('#target', vis.id); await page.click('#btnTorch'); await page.waitForTimeout(6000);
  const st = await page.evaluate(id => ({ r: GT.S.ev[id].reveal, s: GT.S.vis[id] && GT.S.vis[id].ema }), vis.id);
  ok('mauvaise scène : pas d\'icône', !st.r, 'score ' + (st.s || 0).toFixed(3));
  await page.screenshot({ path: '/tmp/e_wrong.png' });
  await ctx.close();

  // ---------- 4. Étiquette QR filmée ----------
  ({ ctx, page } = await open('QR.y4m', off(1, 2)));
  await page.click('#btnTorch');
  const tfound = await waitFor(page, id => GT.S.ev[id] && GT.S.ev[id].reveal, tag.id, 10000);
  ok('étiquette QR : reconnue et icône affichée', tfound);
  await page.waitForTimeout(300); await tapIcon(page, tag.id); await page.waitForSelector('#shUnlock.open');
  await page.fill('#uPw', 'bureau ferme a cle'); await page.click('#uGo');
  ok('étiquette QR : ouvert', await waitFor(page, () => /4821/.test(document.querySelector('#vBody').textContent), null, 8000));
  await page.click('#vClose');
  ok('aucune erreur JS (étiquette)', page.errs.length === 0, page.errs.join(' | '));
  await ctx.close();

  // ---------- 5. Import sur un autre téléphone ----------
  const b = await chromium.launch(); const c2 = await b.newContext({ viewport: { width: 412, height: 860 } }); const p2 = await c2.newPage();
  await p2.goto(URL); await p2.click('nav.tabs button[data-view=liste]'); await p2.setInputFiles('#lImport', '/tmp/photo-du-bol.gtch'); await p2.waitForTimeout(800);
  ok('import d\'une cachette reçue', /Photo du bol/.test(await p2.textContent('#lList')));
  await p2.screenshot({ path: '/tmp/e_list.png' });
  await b.close();

  console.log(results.join('\n'));
  console.log('\nTotal :', results.filter(x => x.startsWith('PASS')).length, 'réussis,', results.filter(x => x.startsWith('FAIL')).length, 'échecs');
})().catch(e => { console.log(results.join('\n')); console.error('CRASH', e); process.exit(1); });
