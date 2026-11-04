const { chromium } = require('playwright');
const ref = JSON.parse(require('fs').readFileSync('/tmp/plusref.json', 'utf8'));
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('pageerror', e.message));
  await page.goto('http://localhost:8765/index.html');
  const r = await page.evaluate(async (ref) => {
    const out = []; const ok = (name, cond, extra) => out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
    const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
    // ---- coordonnées
    const cases = [
      ['7.18765, 2.06321', 7.18765, 2.06321],
      ['7.18765 2.06321', 7.18765, 2.06321],
      ['-33.8688, 151.2093', -33.8688, 151.2093],
      ['Lat:7,187650 Long:2,063210', 7.18765, 2.06321],
      ['Lat: 6.9302 Lon: 2.0726', 6.9302, 2.0726],
      ['latitude 6,9302 ; longitude 2,0726', 6.9302, 2.0726],
      ['7,18765 ; 2,06321', 7.18765, 2.06321],
      ['7,18765 2,06321', 7.18765, 2.06321],
      ['7°11\'15.5"N 2°03\'47.6"E', 7 + 11 / 60 + 15.5 / 3600, 2 + 3 / 60 + 47.6 / 3600],
      ['7° 11\' 15,5" N, 2° 3\' 47,6" E', 7 + 11 / 60 + 15.5 / 3600, 2 + 3 / 60 + 47.6 / 3600],
      ['N 7° 11.258\' E 2° 3.793\'', 7 + 11.258 / 60, 2 + 3.793 / 60],
      ['6°21\'55"N 2°25\'06"O', 6 + 21 / 60 + 55 / 3600, -(2 + 25 / 60 + 6 / 3600)],
      ['https://www.google.com/maps/place/Bohicon/@7.1782931,2.0666598,15z/data=!4m6', 7.1782931, 2.0666598],
      ['https://maps.google.com/?q=7.187650,2.063210', 7.18765, 2.06321],
      ['https://www.google.com/maps/search/?api=1&query=6.3653%2C2.4183', 6.3653, 2.4183],
      ['geo:7.18765,2.06321?z=18', 7.18765, 2.06321],
      ['https://www.google.com/maps/place/X/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d7.1876!4d2.0632', 7.1876, 2.0632],
    ];
    for (const [t, la, lo] of cases) { try { const p = GT.parseCoords(t); ok('coords ' + t.slice(0, 40), near(p.lat, la, 1e-6) && near(p.lon, lo, 1e-6), p.lat + ',' + p.lon + ' (' + p.src + ')'); } catch (e) { ok('coords ' + t.slice(0, 40), false, e.message); } }
    for (const bad of ['bonjour', '95.1, 2.0', '7.1, 200.5', '']) { let threw = false; try { GT.parseCoords(bad); } catch (e) { threw = true; } ok('rejette « ' + bad + ' »', threw); }
    // ---- plus codes
    for (const x of ref) {
      ok('plus encode ' + x.full, GT.Plus.encode(x.la, x.lo) === x.full, GT.Plus.encode(x.la, x.lo));
      const d = GT.Plus.decode(x.full); ok('plus decode ' + x.full, near(d.lat, x.c[0], 1e-9) && near(d.lon, x.c[1], 1e-9));
      const d11 = GT.Plus.decode(x.full11); ok('plus decode11 ' + x.full11, near(d11.lat, x.c11[0], 1e-9) && near(d11.lon, x.c11[1], 1e-9));
      const rr = GT.Plus.recoverNearest(x.short, x.recRef[0], x.recRef[1]); ok('plus recover ' + x.short, near(rr.lat, x.rec[0], 1e-9) && near(rr.lon, x.rec[1], 1e-9));
      const p = GT.parseCoords(x.full); ok('parse plus ' + x.full, near(p.lat, x.c[0], 1e-9));
      const ps = GT.parseCoords(x.short + ' Bohicon', { lat: x.recRef[0], lon: x.recRef[1] }); ok('parse short ' + x.short, near(ps.lat, x.rec[0], 1e-9) && near(ps.lon, x.rec[1], 1e-9));
    }
    { let threw = false; try { GT.parseCoords('Q7+37'); } catch (e) { threw = /Code court/.test(e.message); } ok('code court sans référence : message clair', threw); }
    // ---- chiffrement : lieu donné
    const t0 = performance.now(); await GT.Crypt.pbkdf2(new TextEncoder().encode('x'), new Uint8Array(16), 600000); const tK = performance.now() - t0;
    out.push('INFO PBKDF2 600k : ' + tK.toFixed(0) + ' ms (ordinateur de test ; un téléphone moyen est 2 à 5 fois plus lent)');
    const file = new File([new TextEncoder().encode('Recette secrète : 3 piments.')], 'recette.txt', { type: 'text/plain' });
    const img = new File([new Uint8Array(5000).map((_, i) => i % 251)], 'photo.bin', { type: 'application/octet-stream' });
    const cap = await GT.buildCapsule({ label: 'Test', hint: 'bol', note: 'Bonjour', files: [file, img], pw: 'mot de passe solide', tag: false, place: { mode: 'visible', lat: 7.18765, lon: 2.06321, acc: 8, radius: 25 }, aim: { heading: 123.4, pitch: -20 }, sigs: [], thumb: null });
    const bytes = GT.serialize(cap.meta, cap.ct); const back = GT.parseCapsule(bytes);
    ok('format .gtch aller-retour', back.meta.id === cap.meta.id && back.ct.length === cap.ct.length, bytes.length + ' octets');
    const dek = await GT.unwrapVisible(back.meta, 'mot de passe solide', '');
    const data = await GT.openWithDek({ meta: back.meta, ct: back.ct }, dek);
    ok('déchiffrement correct', data.note === 'Bonjour' && data.files.length === 2 && (await data.files[0].blob.text()) === 'Recette secrète : 3 piments.' && data.files[1].size === 5000);
    const b2 = new Uint8Array(await data.files[1].blob.arrayBuffer()); ok('octets binaires intacts', b2.every((v, i) => v === i % 251));
    let bad = false; try { await GT.unwrapVisible(back.meta, 'mauvais', ''); } catch (e) { bad = true; } ok('mauvais mot de passe refusé', bad);
    const tamper = back.ct.slice(); tamper[10] ^= 1; let tam = false; try { await GT.openWithDek({ meta: back.meta, ct: tamper }, dek); } catch (e) { tam = true; } ok('fichier altéré détecté', tam);
    const m2 = JSON.parse(JSON.stringify(back.meta)); m2.id = 'gtautre000000'; let sw = false; try { await GT.unwrapVisible(m2, 'mot de passe solide', ''); } catch (e) { sw = true; } ok('identifiant lié au chiffrement', sw);
    ok('direction enregistrée', back.meta.place.heading === 123 && back.meta.place.pitch === -20);
    ok('aucun secret en clair dans la cachette', !new TextDecoder().decode(bytes).includes('piments') && !new TextDecoder().decode(bytes).includes('Bonjour'));
    // ---- cachettes piégées
    const clone = () => JSON.parse(JSON.stringify(back.meta));
    const hostile = [
      ['id avec HTML', m => { m.id = 'x"><img src=x onerror=alert(1)>'; }],
      ['id __proto__', m => { m.id = '__proto__'; }],
      ['rayon en HTML', m => { m.place.radius = '<b>1</b>'; }],
      ['itérations énormes', m => { m.lock.iter = 1e9; }],
      ['photo indice distante', m => { m.look = { sigs: [], thumb: 'https://evil.example/p.jpg' }; }],
      ['nom trop long', m => { m.label = 'x'.repeat(500); }],
      ['latitude hors limites', m => { m.place.lat = 123; }],
    ];
    for (const [n, f] of hostile) { const m = clone(); f(m); let refused = false; try { GT.parseCapsule(GT.serialize(m, back.ct)); } catch (e) { refused = /refusée/.test(e.message); } ok('cachette piégée refusée : ' + n, refused); }
    const mt = clone(); mt.hint = 'Indice modifié en route'; const pt = GT.parseCapsule(GT.serialize(mt, back.ct)); let tamperedMeta = false; try { await GT.unwrapVisible(pt.meta, 'mot de passe solide', ''); } catch (e) { tamperedMeta = true; } ok('indice modifié en route : ouverture refusée', tamperedMeta);
    const dTrim = await GT.unwrapVisible(back.meta, '  mot de passe solide ', ''); ok('espaces autour du mot de passe ignorés', dTrim.length === 32);
    const capH = await GT.buildCapsule({ label: 'Page', note: '', files: [new File(['<script>alert(1)</script>'], 'piege.html', { type: 'text/html' }), new File(['<svg onload="alert(1)"/>'], 'p.svg', { type: 'image/svg+xml' }), new File([new Uint8Array(4)], 'a.png', { type: 'image/png' })], pw: 'mot de passe solide', tag: false, place: { mode: 'visible', lat: 7, lon: 2, acc: 5, radius: 25 } });
    const dH = await GT.unwrapVisible(capH.meta, 'mot de passe solide', ''); const pH = await GT.openWithDek({ meta: capH.meta, ct: capH.ct }, dH);
    ok('HTML et SVG reçus neutralisés', pH.files[0].type === 'application/octet-stream' && pH.files[1].type === 'application/octet-stream' && pH.files[2].type === 'image/png', pH.files.map(f => f.type).join(', '));
    ok('cachette créée valide', !!GT.parseCapsule(GT.serialize(capH.meta, capH.ct)));
    // ---- étiquette
    const capT = await GT.buildCapsule({ label: 'Tag', note: 'x', files: [], pw: 'mot de passe solide', tag: true, place: { mode: 'visible', lat: 7, lon: 2, acc: 5, radius: 25 } });
    ok('secret d\'étiquette généré', /^[0-9A-Z]{16}$/.test(capT.tagSecret), capT.tagSecret);
    let noTag = false; try { await GT.unwrapVisible(capT.meta, 'mot de passe solide', ''); } catch (e) { noTag = true; } ok('sans étiquette : refus', noTag);
    const dT = await GT.unwrapVisible(capT.meta, 'mot de passe solide', capT.tagSecret); ok('avec étiquette : ouvert', dT.length === 32);
    ok('QR étiquette lisible', JSON.stringify(GT.QR.parse('GT1:' + capT.meta.id + ':' + capT.tagSecret)) === JSON.stringify({ id: capT.meta.id, secret: capT.tagSecret }));
    const capTO = await GT.buildCapsule({ label: 'TagSeul', note: 'y', files: [], pw: '', tag: true, place: { mode: 'visible', lat: 7, lon: 2, acc: 5, radius: 25 } });
    const dTO = await GT.unwrapVisible(capTO.meta, '', capTO.tagSecret); ok('étiquette seule, sans mot de passe', dTO.length === 32 && capTO.meta.pw === false);
    // ---- lieu secret
    const P = { lat: 7.18765, lon: 2.06321 };
    const capS = await GT.buildCapsule({ label: 'Secret', note: 'trésor', files: [], pw: 'mot de passe solide', tag: false, place: { mode: 'secret', lat: P.lat, lon: P.lon, acc: 8, zone: 300 } });
    const zd = GT.Plus ? (function (a, b) { const R = 6371008.8, D = Math.PI / 180; const h = Math.sin((b.lat - a.lat) * D / 2) ** 2 + Math.cos(a.lat * D) * Math.cos(b.lat * D) * Math.sin((b.lon - a.lon) * D / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); })(P, capS.meta.place) : 0;
    ok('zone indice décalée et sans point exact', zd > 0 && zd <= 180 && capS.meta.place.mode === 'secret', 'décalage ' + zd.toFixed(0) + ' m');
    ok('point exact absent du fichier', !JSON.stringify(capS.meta).includes('7.18765'));
    ok('cachette lieu secret valide', !!GT.parseCapsule(GT.serialize(capS.meta, capS.ct)));
    { const m = JSON.parse(JSON.stringify(capS.meta)); m.lock.cell.size = 0; let r = false; try { GT.parseCapsule(GT.serialize(m, capS.ct)); } catch (e) { r = true; } ok('cachette piégée refusée : case de taille 0', r); }
    const master = await GT.Crypt.pbkdf2(GT.Crypt.secret('mot de passe solide', ''), Uint8Array.from(atob(capS.meta.lock.salt), c => c.charCodeAt(0)), capS.meta.lock.iter);
    const offs = (d, a) => ({ lat: P.lat + d * Math.cos(a) / 111320, lon: P.lon + d * Math.sin(a) / (111320 * Math.cos(P.lat * Math.PI / 180)) });
    let found = 0, tries = 0, slow = 0;
    for (let k = 0; k < 12; k++) { const q = offs(Math.random() * 15, Math.random() * 6.283); const tried = new Set(); let d = null; const ts = performance.now(); for (let i = 0; i < 8 && !d; i++) d = await GT.tryCells(capS.meta, master, { ...q, acc: 12 }, tried, 6); slow = Math.max(slow, performance.now() - ts); if (d) found++; tries += tried.size; }
    ok('lieu secret : reconnu à moins de 15 m (12 essais)', found === 12, found + '/12, ' + (tries / 12).toFixed(1) + ' cases en moyenne, pire ' + slow.toFixed(0) + ' ms');
    const far = offs(150, 1); const triedF = new Set(); let dF = null; for (let i = 0; i < 10; i++) dF = dF || await GT.tryCells(capS.meta, master, { ...far, acc: 12 }, triedF, 6);
    ok('lieu secret : refusé à 150 m', dF === null, triedF.size + ' cases testées');
    const masterBad = await GT.Crypt.pbkdf2(GT.Crypt.secret('faux', ''), Uint8Array.from(atob(capS.meta.lock.salt), c => c.charCodeAt(0)), capS.meta.lock.iter);
    const triedB = new Set(); let dB = null; for (let i = 0; i < 8; i++) dB = dB || await GT.tryCells(capS.meta, masterBad, { ...P, acc: 10 }, triedB, 6);
    ok('lieu secret : mauvais mot de passe jamais reconnu', dB === null);
    // ---- QR rendu puis relu par jsQR
    const url = GT.QR.pngDataURL('GT1:gtabc123def456:ABCDEFGH12345678', 'Test');
    const im = new Image(); await new Promise(r => { im.onload = r; im.src = url; });
    const read = await GT.QR.scan(im, im.naturalWidth, im.naturalHeight); ok('étiquette imprimée relue', read === 'GT1:gtabc123def456:ABCDEFGH12345678', read);
    return out;
  }, ref);
  console.log(r.join('\n'));
  console.log('\nTotal :', r.filter(x => x.startsWith('PASS')).length, 'réussis,', r.filter(x => x.startsWith('FAIL')).length, 'échecs');
  await browser.close();
})();
