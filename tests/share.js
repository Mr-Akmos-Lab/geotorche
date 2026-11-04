const { chromium } = require('playwright');
const fs = require('fs');
const URL = 'http://localhost:8765/';
const out = []; const ok = (n, c, x) => out.push((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : ''));
(async () => {
  const b = await chromium.launch();
  // ---- expéditeur : crée une cachette et la partage
  const c1 = await b.newContext({ viewport: { width: 412, height: 860 }, permissions: ['geolocation'], geolocation: { latitude: 6.442851, longitude: 2.334446, accuracy: 6 } });
  await c1.addInitScript(() => {
    window.__shared = null;
    navigator.canShare = d => !!(d && d.files && d.files.every(f => /\.(txt|pdf|jpg|png)$/i.test(f.name)));
    navigator.share = async d => { window.__shared = { text: d.text, title: d.title, files: await Promise.all((d.files || []).map(async f => ({ name: f.name, type: f.type, body: await f.text() }))) }; };
  });
  const p1 = await c1.newPage(); const errs = []; p1.on('pageerror', e => errs.push(e.message));
  await p1.goto(URL); await p1.waitForTimeout(500);
  await p1.evaluate(async () => {
    const out = await GT.buildCapsule({ label: 'Presentation_FIELD_Actions', hint: 'Eau', note: 'Bonjour X', files: [], pw: 'mot de passe solide', tag: false, place: { mode: 'visible', lat: 6.442851, lon: 2.334446, acc: 6, radius: 25 } });
    await GT.Store.put({ id: out.meta.id, meta: out.meta, ct: out.ct, added: Date.now(), own: { tag: null } }); await GT.loadCaps();
  });
  await p1.click('nav.tabs button[data-view=liste]'); await p1.click('[data-act=share]'); await p1.waitForSelector('#shShare.open');
  const shownText = await p1.inputValue('#sText');
  ok('message : lien de l\'application', shownText.includes('https://mr-akmos-lab.github.io/geotorche/'));
  ok('message : étapes pour le destinataire', /1\. Ouvre GéoTorche/.test(shownText) && /2\. Importe le fichier joint/.test(shownText) && /3\. Va sur place/.test(shownText));
  ok('bouton renommé', /Envoyer la cachette et le message/.test(await p1.textContent('#sFile')));
  await p1.click('#sFile'); await p1.waitForTimeout(500);
  const sh = await p1.evaluate(() => window.__shared);
  ok('partage en un geste : fichier + message ensemble', !!(sh && sh.files.length === 1 && sh.text && sh.text.includes('Presentation_FIELD_Actions')), sh && sh.files[0] && sh.files[0].name);
  ok('fichier texte accepté par le menu Partager', !!(sh && /\.geotorche\.txt$/.test(sh.files[0].name) && sh.files[0].type === 'text/plain'));
  ok('contenu illisible en clair', !!(sh && !sh.files[0].body.includes('Bonjour X')));
  fs.writeFileSync('/tmp/recu.geotorche.txt', sh.files[0].body);
  ok('expéditeur : aucune erreur JS', errs.length === 0, errs.join(' | '));
  // ---- destinataire 1 : importe le .txt avec le bouton Importer
  const c2 = await b.newContext({ viewport: { width: 412, height: 860 } }); const p2 = await c2.newPage();
  await p2.goto(URL); await p2.click('nav.tabs button[data-view=liste]'); await p2.setInputFiles('#lImport', '/tmp/recu.geotorche.txt'); await p2.waitForTimeout(800);
  ok('destinataire : import du .txt', /Presentation_FIELD_Actions/.test(await p2.textContent('#lList')));
  const dek = await p2.evaluate(async () => { const c = GT.S.caps[0]; const d = await GT.unwrapVisible(c.meta, 'mot de passe solide', ''); const data = await GT.openWithDek(c, d); return data.note; });
  ok('destinataire : contenu intact après le voyage', dek === 'Bonjour X');
  // ancien format .gtch toujours accepté
  const gtch = await p1.evaluate(() => { const c = GT.S.caps[0]; return Array.from(GT.serialize(c.meta, c.ct)); });
  fs.writeFileSync('/tmp/ancien.gtch', Buffer.from(gtch));
  const c3 = await b.newContext(); const p3 = await c3.newPage(); await p3.goto(URL); await p3.click('nav.tabs button[data-view=liste]'); await p3.setInputFiles('#lImport', '/tmp/ancien.gtch'); await p3.waitForTimeout(800);
  ok('ancien fichier .gtch toujours importable', /Presentation_FIELD_Actions/.test(await p3.textContent('#lList')));
  // ---- destinataire 2 : « Partager > GéoTorche » (service worker)
  const c4 = await b.newContext({ viewport: { width: 412, height: 860 } }); const p4 = await c4.newPage(); const e4 = []; p4.on('pageerror', e => e4.push(e.message));
  await p4.goto(URL); await p4.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller || false, null, { timeout: 4000 }).catch(() => {});
  if (!(await p4.evaluate(() => !!navigator.serviceWorker.controller))) { await p4.reload(); await p4.waitForTimeout(800); }
  ok('service worker actif', await p4.evaluate(() => !!navigator.serviceWorker.controller));
  const body = fs.readFileSync('/tmp/recu.geotorche.txt', 'utf8');
  const status = await p4.evaluate(async body => { const fd = new FormData(); fd.append('title', 'x'); fd.append('capsule', new File([body], 'presentation.geotorche.txt', { type: 'text/plain' })); const r = await fetch('partage', { method: 'POST', body: fd }); return r.url; }, body);
  ok('le service worker reçoit le fichier et redirige', /\?partage=1$/.test(status), status);
  await p4.goto(URL + '?partage=1'); await p4.waitForTimeout(1200);
  const st = await p4.evaluate(() => ({ n: GT.S.caps.length, label: GT.S.caps[0] && GT.S.caps[0].meta.label, active: GT.S.activeId === (GT.S.caps[0] && GT.S.caps[0].id), url: location.href, toast: document.querySelector('#toast').textContent }));
  ok('« Partager > GéoTorche » : cachette importée et sélectionnée', st.n === 1 && st.label === 'Presentation_FIELD_Actions' && st.active, st.toast);
  ok('adresse nettoyée après import', !/partage/.test(st.url));
  ok('destinataire : aucune erreur JS', e4.length === 0, e4.join(' | '));
  const mf = await (await p4.request.get(URL + 'manifest.webmanifest')).json();
  ok('manifeste : GéoTorche apparaît dans le menu Partager', mf.share_target && mf.share_target.action === './partage' && mf.share_target.params.files[0].accept.includes('text/plain'));
  console.log(out.join('\n'));
  console.log('\nTotal :', out.filter(x => x.startsWith('PASS')).length, 'réussis,', out.filter(x => x.startsWith('FAIL')).length, 'échecs');
  await b.close();
})().catch(e => { console.log(out.join('\n')); console.error('CRASH', e); process.exit(1); });
