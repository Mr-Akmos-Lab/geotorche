'use strict';
/* GéoTorche : des fichiers cachés dans le monde réel.
   Tout fonctionne sur l'appareil : rien n'est envoyé sur internet. */
const APP_VERSION = '1.1.1';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const te = new TextEncoder();
const td = new TextDecoder();
const IN_FRAME = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
const HOSTED = !IN_FRAME && window.isSecureContext && location.protocol === 'https:';

/* ============================== Utilitaires ============================== */
function b64enc(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function b64dec(str) { const s = atob(str); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
function b64url(u8) { return b64enc(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function unb64url(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return b64dec(s); }
function rand(n) { return crypto.getRandomValues(new Uint8Array(n)); }
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function b32(u8) { let bits = 0, val = 0, out = ''; for (const b of u8) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } } if (bits) out += B32[(val << (5 - bits)) & 31]; return out; }
function newId() { return 'gt' + b32(rand(8)).toLowerCase(); }
function concat(...arrs) { let n = 0; for (const a of arrs) n += a.length; const o = new Uint8Array(n); let p = 0; for (const a of arrs) { o.set(a, p); p += a.length; } return o; }
function u32(n) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n); return b; }
function rdU32(u8, off) { return new DataView(u8.buffer, u8.byteOffset + off, 4).getUint32(0); }
function f32b64(a) { return b64enc(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)); }
function b64f32(s) { const u = b64dec(s); return new Float32Array(u.buffer, u.byteOffset, u.byteLength / 4); }
const frNum = (x, d) => x.toFixed(d).replace('.', ',');
function fmtBytes(n) { if (n < 1024) return n + ' o'; if (n < 1048576) return frNum(n / 1024, 1) + ' Ko'; return frNum(n / 1048576, 1) + ' Mo'; }
function fmtDist(m) { if (m < 1000) return Math.round(m) + ' m'; return frNum(m / 1000, m < 10000 ? 2 : 1) + ' km'; }
function fmtDate(t) { try { return new Date(t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return String(t); } }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function slug(s) { return (String(s || 'cachette').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 40)) || 'cachette'; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const R_EARTH = 6371008.8, DEG = Math.PI / 180;
function distM(a, b) { const dLa = (b.lat - a.lat) * DEG, dLo = (b.lon - a.lon) * DEG; const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLo / 2) ** 2; return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h))); }
function bearing(a, b) { const y = Math.sin((b.lon - a.lon) * DEG) * Math.cos(b.lat * DEG); const x = Math.cos(a.lat * DEG) * Math.sin(b.lat * DEG) - Math.sin(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.cos((b.lon - a.lon) * DEG); return (Math.atan2(y, x) / DEG + 360) % 360; }
function offsetM(lat, lon, d, angRad) { return { lat: lat + (d * Math.cos(angRad)) / 111320, lon: lon + (d * Math.sin(angRad)) / (111320 * Math.cos(lat * DEG)) }; }
function angDiff(a, b) { return ((a - b + 540) % 360) - 180; }
const CARD = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest'];
const cardinal = b => CARD[Math.round(b / 45) % 8];
function guessType(name) {
  const e = (name.split('.').pop() || '').toLowerCase();
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', md: 'text/plain', mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', opus: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })[e] || 'application/octet-stream';
}
const LS = {
  get(k, d) { try { const v = localStorage.getItem('gt_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('gt_' + k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } },
  del(k) { try { localStorage.removeItem('gt_' + k); } catch (e) { } }
};

let toastTimer = null;
function toast(msg, kind) {
  const t = $('#toast'); t.textContent = msg; t.className = 'show' + (kind ? ' ' + kind : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = ''; }, 3600);
}
function busy(text) { $('#busyT').textContent = text; $('#busy').hidden = false; }
function unbusy() { $('#busy').hidden = true; }
function vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { } }

/* ============================== Plus Codes ============================== */
const Plus = (() => {
  const A = '23456789CFGHJMPQRVWX';
  const PR = [20, 1, 0.05, 0.0025, 0.000125];
  const clean = c => String(c).toUpperCase().replace(/\s/g, '');
  function isValid(c) {
    c = clean(c); const p = c.indexOf('+');
    if (p < 0 || p !== c.lastIndexOf('+') || p > 8 || p % 2 === 1) return false;
    const body = c.replace('+', '');
    if (/0/.test(body)) { if (!/^[^0]*0+$/.test(c.slice(0, p))) return false; if (c.length > p + 1) return false; }
    for (const ch of body.replace(/0/g, '')) if (A.indexOf(ch) < 0) return false;
    return c.length - p - 1 !== 1;
  }
  function isFull(c) { c = clean(c); return isValid(c) && c.indexOf('+') === 8 && A.indexOf(c[0]) < 9 && A.indexOf(c[1]) < 18; }
  function isShort(c) { c = clean(c); return isValid(c) && c.indexOf('+') < 8 && !/0/.test(c); }
  function decode(code) {
    const c = clean(code).replace('+', '').replace(/0+$/, '');
    let lat = -90, lon = -180;
    const pairs = Math.min(c.length, 10);
    for (let i = 0; i + 1 < pairs; i += 2) { lat += A.indexOf(c[i]) * PR[i / 2]; lon += A.indexOf(c[i + 1]) * PR[i / 2]; }
    let latS = PR[pairs / 2 - 1], lonS = latS;
    if (c.length > 10) {
      let rs = 0.000125, cs = 0.000125;
      for (let i = 10; i < Math.min(c.length, 15); i++) { rs /= 5; cs /= 4; const d = A.indexOf(c[i]); lat += Math.floor(d / 4) * rs; lon += (d % 4) * cs; }
      latS = rs; lonS = cs;
    }
    return { lat: lat + latS / 2, lon: lon + lonS / 2, latS, lonS };
  }
  function encode(lat, lon) {
    lat = clamp(lat, -90, 90); if (lat === 90) lat -= 0.0000625;
    lon = ((lon + 180) % 360 + 360) % 360 - 180;
    let la = lat + 90, lo = lon + 180, out = '';
    for (let i = 0; i < 5; i++) {
      const a = Math.min(19, Math.floor(la / PR[i] + 1e-9)); la -= a * PR[i];
      const b = Math.min(19, Math.floor(lo / PR[i] + 1e-9)); lo -= b * PR[i];
      out += A[a] + A[b]; if (i === 3) out += '+';
    }
    return out;
  }
  function recoverNearest(shortCode, refLat, refLon) {
    const c = clean(shortCode);
    const pad = 8 - c.indexOf('+');
    const res = Math.pow(20, 2 - pad / 2), half = res / 2;
    const full = encode(refLat, refLon).slice(0, pad) + c;
    const d = decode(full); let lat = d.lat, lon = d.lon;
    if (refLat + half < lat && lat - res >= -90) lat -= res; else if (refLat - half > lat && lat + res <= 90) lat += res;
    if (refLon + half < lon) lon -= res; else if (refLon - half > lon) lon += res;
    return { lat, lon, latS: d.latS, lonS: d.lonS };
  }
  return { isValid, isFull, isShort, decode, encode, recoverNearest };
})();

/* ============================== Lecture de coordonnées ============================== */
function parseCoords(input, ref) {
  let t = String(input || '').trim();
  if (!t) throw new Error('Rien à lire.');
  try { t = decodeURIComponent(t); } catch (e) { /* texte brut */ }
  const okc = (lat, lon, src) => {
    lat = +lat; lon = +lon;
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error('Coordonnées hors limites (latitude entre -90 et 90, longitude entre -180 et 180).');
    return { lat, lon, src };
  };
  const num = s => parseFloat(String(s).replace(',', '.'));
  let m;
  if ((m = t.match(/!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/))) return okc(m[1], m[2], 'lien de carte');
  if ((m = t.match(/@(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/))) return okc(m[1], m[2], 'lien de carte');
  if ((m = t.match(/[?&](?:q|query|ll|destination|center|daddr)=(?:loc:)?\s*(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/i))) return okc(m[1], m[2], 'lien de carte');
  if ((m = t.match(/geo:\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/i))) return okc(m[1], m[2], 'lien geo');
  if ((m = t.match(/(?:^|[\s,;(])([23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{0,7})(?=$|[\s,;)])/i))) {
    const code = m[1].toUpperCase();
    if (Plus.isFull(code)) { const d = Plus.decode(code); return okc(d.lat, d.lon, 'Plus Code'); }
    if (Plus.isShort(code)) {
      if (!ref) throw new Error('Code court : activez la position (ou le mode test) pour le compléter, ou donnez le code complet, 8 caractères avant le +.');
      const d = Plus.recoverNearest(code, ref.lat, ref.lon); return okc(d.lat, d.lon, 'Plus Code court');
    }
  }
  if ((m = t.match(/lat[a-zé]*\.?\s*[:=]?\s*(-?\d{1,3}(?:[.,]\d+)?)\s*[,;\s]*\s*lo?n[a-z]*\.?\s*[:=]?\s*(-?\d{1,3}(?:[.,]\d+)?)/i))) return okc(num(m[1]), num(m[2]), 'texte');
  const dms = parseDMS(t); if (dms) return okc(dms.lat, dms.lon, 'degrés minutes secondes');
  if ((m = t.match(/^\s*\(?\s*(-?\d{1,3},\d+)\s*(?:;|\s+|\s*\/\s*|\s*\|\s*)\s*(-?\d{1,3},\d+)\s*\)?\s*$/))) return okc(num(m[1]), num(m[2]), 'texte');
  if ((m = t.match(/(-?\d{1,3}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)/))) return okc(m[1], m[2], 'texte');
  throw new Error('Format non reconnu. Exemples : 7.18765, 2.06321 | Lat:7,18765 Long:2,06321 | 7°11\'15"N 2°03\'48"E | lien Google Maps | Plus Code.');
}
function parseDMS(t) {
  const n = s => parseFloat(String(s).replace(',', '.'));
  const prefix = /^\s*[NSEWO]\s*\d/i.test(t);
  const core = '(\\d{1,3}(?:[.,]\\d+)?)\\s*[°º]\\s*(?:(\\d{1,2}(?:[.,]\\d+)?)\\s*[\'′’]\\s*)?(?:(\\d{1,2}(?:[.,]\\d+)?)\\s*(?:"|″|\'\'|”)\\s*)?';
  const re = prefix ? new RegExp('([NSEWO])\\s*' + core, 'gi') : new RegExp(core + '([NSEWO])', 'gi');
  let lat = null, lon = null, mm;
  while ((mm = re.exec(t))) {
    const hemi = (prefix ? mm[1] : mm[4]).toUpperCase();
    const g = prefix ? mm.slice(2, 5) : mm.slice(1, 4);
    let v = n(g[0]) + (g[1] ? n(g[1]) / 60 : 0) + (g[2] ? n(g[2]) / 3600 : 0);
    if (hemi === 'S' || hemi === 'W' || hemi === 'O') v = -v;
    if (hemi === 'N' || hemi === 'S') lat = v; else lon = v;
  }
  return lat !== null && lon !== null ? { lat, lon } : null;
}

/* ============================== Stockage (IndexedDB) ============================== */
const Store = (() => {
  let dbp = null; const mem = new Map(); const memKV = new Map();
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      let req; try { req = indexedDB.open('geotorche', 1); } catch (e) { rej(e); return; }
      req.onupgradeneeded = () => { const d = req.result; if (!d.objectStoreNames.contains('caps')) d.createObjectStore('caps', { keyPath: 'id' }); if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv'); };
      req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); req.onblocked = () => rej(new Error('bloqué'));
    }).catch(() => null);
    return dbp;
  }
  function run(store, mode, fn) {
    return db().then(d => {
      if (!d) return fn(null);
      return new Promise((res, rej) => {
        let out; const tx = d.transaction(store, mode); const s = tx.objectStore(store);
        const r = fn(s); if (r && 'onsuccess' in r) r.onsuccess = () => { out = r.result; };
        tx.oncomplete = () => res(out); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('Stockage plein ?'));
      });
    });
  }
  return {
    async persistent() { return db().then(d => !!d); },
    put: rec => run('caps', 'readwrite', s => s ? s.put(rec) : (mem.set(rec.id, rec), null)),
    get: id => run('caps', 'readonly', s => s ? s.get(id) : null).then(r => r || mem.get(id) || null),
    all: () => run('caps', 'readonly', s => s ? s.getAll() : null).then(r => r || Array.from(mem.values())),
    del: id => run('caps', 'readwrite', s => s ? s.delete(id) : (mem.delete(id), null)),
    kvGet: (k, d) => run('kv', 'readonly', s => s ? s.get(k) : null).then(r => r !== undefined && r !== null ? r : (memKV.has(k) ? memKV.get(k) : d)),
    kvSet: (k, v) => run('kv', 'readwrite', s => s ? s.put(v, k) : (memKV.set(k, v), null))
  };
})();

/* ============================== Chiffrement ============================== */
const Crypt = {
  ITER: 600000,          // PBKDF2-HMAC-SHA256, recommandation OWASP
  CELL_ITER: 20000,      // coût par case pour le lieu secret
  secret(pw, tag) { return te.encode(String(pw || '').normalize('NFC').trim() + '\u0000' + String(tag || '')); },
  async pbkdf2(bytes, salt, iter) {
    const k = await crypto.subtle.importKey('raw', bytes, 'PBKDF2', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, k, 256));
  },
  async seal(raw, data, aad) {
    const iv = rand(12); const k = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
    return { iv, ct: new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, k, data)) };
  },
  async open(raw, iv, ct, aad) {
    const k = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad }, k, ct));
  }
};

/* Lieu secret : le sol est découpé en cases de 20 m ; la case exacte entre dans la clé. */
const Cells = {
  proj(lat, lon, lat0) { return { y: lat * 111320, x: lon * 111320 * Math.cos(lat0 * DEG) }; },
  cellOf(lat, lon, c) { const p = this.proj(lat, lon, c.lat0); return [Math.floor(p.y / c.size), Math.floor(p.x / c.size)]; },
  around(lat, lon, r, c, max = 40) {
    const p = this.proj(lat, lon, c.lat0), s = c.size, out = [];
    const i0 = Math.floor((p.y - r) / s), i1 = Math.floor((p.y + r) / s), j0 = Math.floor((p.x - r) / s), j1 = Math.floor((p.x + r) / s);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const ny = clamp(p.y, i * s, (i + 1) * s), nx = clamp(p.x, j * s, (j + 1) * s);
      if (Math.hypot(ny - p.y, nx - p.x) <= r) out.push({ i, j, d: Math.hypot((i + 0.5) * s - p.y, (j + 0.5) * s - p.x) });
    }
    return out.sort((a, b) => a.d - b.d).slice(0, max);
  },
  material(master, i, j) { return concat(master, te.encode('|case:' + i + ',' + j)); }
};

/* ============================== Format de cachette (.gtch) ============================== */
const MAGIC = te.encode('GTCH');
function serialize(meta, ct) { const h = te.encode(JSON.stringify(meta)); return concat(MAGIC, new Uint8Array([1]), u32(h.length), h, ct); }
function capsuleSize(meta, ct) { return 9 + te.encode(JSON.stringify(meta)).length + ct.length; }
/* Une cachette reçue est une donnée étrangère : tout est vérifié avant usage. */
function validateMeta(meta) {
  const bad = why => { throw new Error('Cachette refusée : ' + why + ' invalide.'); };
  const isObj = o => !!o && typeof o === 'object' && !Array.isArray(o);
  const fin = (x, a, b) => typeof x === 'number' && isFinite(x) && x >= a && x <= b;
  const str = (x, n) => typeof x === 'string' && x.length <= n;
  const b64n = (x, n) => { if (typeof x !== 'string' || x.length > 4 * n || !/^[A-Za-z0-9+/]+={0,2}$/.test(x)) return false; try { return b64dec(x).length === n; } catch (e) { return false; } };
  if (!isObj(meta) || meta.v !== 1) bad('format');
  if (typeof meta.id !== 'string' || !/^gt[0-9a-z]{6,20}$/.test(meta.id)) bad('identifiant');
  if (!str(meta.label, 120) || !meta.label.trim()) bad('nom');
  if (meta.hint != null && !str(meta.hint, 300)) bad('indice');
  if (meta.created != null && !str(meta.created, 40)) bad('date');
  const P = meta.place;
  if (!isObj(P) || (P.mode !== 'visible' && P.mode !== 'secret') || !fin(P.lat, -90, 90) || !fin(P.lon, -180, 180) || !fin(P.radius, 1, 5000)) bad('lieu');
  if (P.acc != null && !fin(P.acc, 0, 100000)) bad('précision');
  if (P.heading != null && !fin(P.heading, 0, 360)) bad('direction');
  if (P.pitch != null && !fin(P.pitch, -90, 90)) bad('inclinaison');
  const L = meta.lock;
  if (!isObj(L) || L.kdf !== 'PBKDF2-SHA256' || !Number.isInteger(L.iter) || L.iter < 100000 || L.iter > 3000000) bad('clé');
  if (!b64n(L.salt, 16) || !b64n(L.piv, 12) || !b64n(L.wiv, 12) || !b64n(L.wct, 48)) bad('clé');
  if (P.mode === 'secret') {
    const c = L.cell;
    if (!isObj(c) || c.size !== 20 || !fin(c.lat0, -90, 90) || !Number.isInteger(c.iter) || c.iter < 1000 || c.iter > 200000 || !b64n(c.salt, 16)) bad('case');
  } else if (L.cell != null) bad('case');
  if (meta.look != null) {
    const k = meta.look;
    if (!isObj(k) || !Array.isArray(k.sigs) || k.sigs.length < 1 || k.sigs.length > 3) bad('photos');
    for (const s of k.sigs) if (!isObj(s) || !b64n(s.h, 512) || !b64n(s.c, 112) || !b64n(s.l, 1024)) bad('photos');
    if (k.thumb != null && !(typeof k.thumb === 'string' && k.thumb.length < 80000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(k.thumb))) bad('photo indice');
  }
  if (meta.tag != null && !(isObj(meta.tag) && meta.tag.required === true)) bad('étiquette');
  if (typeof meta.pw !== 'boolean') bad('mot de passe');
  if (meta.opt != null && !(isObj(meta.opt) && typeof meta.opt.burn === 'boolean')) bad('options');
  if (!fin(meta.size, 0, 2e9) || !fin(meta.files, 0, 1000)) bad('taille');
  return meta;
}
function parseCapsule(bytes) {
  let u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // version enregistrée depuis l'aperçu : JSON {"geotorche":1,"data":"<base64>"}
  if (u.length && u[0] === 0x7b) { try { const j = JSON.parse(td.decode(u)); if (j && j.geotorche === 1 && typeof j.data === 'string') u = b64dec(j.data); } catch (e) { /* pas du JSON */ } }
  if (u.length < 9 || td.decode(u.subarray(0, 4)) !== 'GTCH') throw new Error("Ce fichier n'est pas une cachette GéoTorche.");
  if (u[4] !== 1) throw new Error('Version de cachette inconnue : mettez à jour GéoTorche.');
  const n = rdU32(u, 5); if (n > 2000000 || 9 + n > u.length) throw new Error('Cachette incomplète ou trop grosse.');
  let meta; try { meta = JSON.parse(td.decode(u.subarray(9, 9 + n))); } catch (e) { throw new Error('Cachette illisible.'); }
  validateMeta(meta);
  const ct = u.slice(9 + n); if (ct.length < 16) throw new Error('Cachette vide ou tronquée.');
  return { meta, ct };
}
/* Les données publiques (nom, lieu, photos, options…) sont liées au chiffrement :
   la moindre modification en route empêche l'ouverture. */
function canon(o) {
  if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']';
  if (o && typeof o === 'object') return '{' + Object.keys(o).sort().filter(k => o[k] !== undefined).map(k => JSON.stringify(k) + ':' + canon(o[k])).join(',') + '}';
  return JSON.stringify(o === undefined ? null : o);
}
const aadCache = new WeakMap();
async function metaAAD(meta) {
  if (aadCache.has(meta)) return aadCache.get(meta);
  const L = meta.lock || {};
  const pub = { v: meta.v, id: meta.id, label: meta.label, hint: meta.hint || '', created: meta.created || '', place: meta.place, look: meta.look || null, tag: meta.tag || null, pw: !!meta.pw, opt: meta.opt || null, files: meta.files, size: meta.size, lock: { kdf: L.kdf, iter: L.iter, salt: L.salt, cell: L.cell || null } };
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(canon(pub))));
  const aad = concat(te.encode(meta.id + '|'), h); aadCache.set(meta, aad); return aad;
}

async function buildCapsule(o) {
  const id = newId(), salt = rand(16);
  const tagSecret = o.tag ? b32(rand(10)) : '';
  const bufs = await Promise.all(o.files.map(f => f.arrayBuffer().then(b => new Uint8Array(b))));
  const header = te.encode(JSON.stringify({ note: o.note || '', files: o.files.map((f, i) => ({ name: f.name || ('fichier-' + (i + 1)), type: f.type || guessType(f.name || ''), size: bufs[i].length })) }));
  const plain = concat(u32(header.length), header, ...bufs);
  const lock = { kdf: 'PBKDF2-SHA256', iter: Crypt.ITER, salt: b64enc(salt) };
  const P = o.place; let place, cellIJ = null;
  if (P.mode === 'secret') {
    const zr = P.zone || 300, ang = Math.random() * 2 * Math.PI, d = Math.sqrt(Math.random()) * zr * 0.6;
    const zc = offsetM(P.lat, P.lon, d, ang);
    lock.cell = { size: 20, lat0: Math.round(zc.lat * 100) / 100, iter: Crypt.CELL_ITER, salt: b64enc(rand(16)) };
    cellIJ = Cells.cellOf(P.lat, P.lon, lock.cell);
    place = { mode: 'secret', lat: +zc.lat.toFixed(6), lon: +zc.lon.toFixed(6), radius: zr, acc: P.acc ? Math.round(P.acc) : null };
  } else {
    place = { mode: 'visible', lat: +(+P.lat).toFixed(7), lon: +(+P.lon).toFixed(7), radius: P.radius || 25, acc: P.acc ? Math.round(P.acc) : null };
  }
  if (o.aim && o.aim.heading != null) { place.heading = Math.round(o.aim.heading) % 360; if (o.aim.pitch != null) place.pitch = Math.round(o.aim.pitch); }
  const look = o.sigs && o.sigs.length ? { sigs: o.sigs.slice(0, 3).map(Vision.pack), thumb: o.thumb || null } : null;
  const meta = {
    v: 1, id, app: 'GéoTorche ' + APP_VERSION, label: o.label, hint: o.hint || '', created: new Date().toISOString(),
    place, look, tag: o.tag ? { required: true } : null, pw: !!o.pw, lock,
    opt: { burn: !!o.burn }, size: plain.length, files: o.files.length
  };
  const aad = await metaAAD(meta);
  const dek = rand(32);
  const payload = await Crypt.seal(dek, plain, aad);
  const master = await Crypt.pbkdf2(Crypt.secret(o.pw, tagSecret), salt, Crypt.ITER);
  const kek = cellIJ ? await Crypt.pbkdf2(Cells.material(master, cellIJ[0], cellIJ[1]), b64dec(lock.cell.salt), lock.cell.iter) : master;
  const w = await Crypt.seal(kek, dek, aad);
  Object.assign(lock, { piv: b64enc(payload.iv), wiv: b64enc(w.iv), wct: b64enc(w.ct) });
  aadCache.delete(meta);
  return { meta, ct: payload.ct, tagSecret };
}

/* Types que le navigateur peut afficher sans risque ; le reste est traité comme un fichier brut
   (une page HTML ou un SVG piégé ne doit pas s'exécuter dans l'application). */
function safeType(t) { return /^(image\/(png|jpeg|gif|webp|bmp|avif)|video\/(mp4|webm|ogg|quicktime)|audio\/(mpeg|mp4|ogg|wav|webm|aac|x-m4a)|application\/pdf|text\/plain|text\/csv)$/.test(String(t || '')) ? t : 'application/octet-stream'; }
function decodePayload(plain) {
  const n = rdU32(plain, 0); if (4 + n > plain.length) throw new Error('contenu');
  const h = JSON.parse(td.decode(plain.subarray(4, 4 + n)));
  if (!h || !Array.isArray(h.files) || h.files.length > 1000) throw new Error('contenu');
  let p = 4 + n; const files = [];
  for (const f of h.files) {
    const size = f && Number.isInteger(f.size) && f.size >= 0 ? f.size : -1;
    if (size < 0 || p + size > plain.length) throw new Error('contenu');
    const name = String((f && f.name) || 'fichier').replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 200);
    const type = safeType(f.type || guessType(name));
    files.push({ name, type, blob: new Blob([plain.subarray(p, p + size)], { type }), size }); p += size;
  }
  return { note: typeof h.note === 'string' ? h.note : '', files };
}

/* Lieu donné : la clé dépend du mot de passe (et de l'étiquette). */
async function unwrapVisible(meta, pw, tag) {
  const master = await Crypt.pbkdf2(Crypt.secret(pw, tag), b64dec(meta.lock.salt), meta.lock.iter);
  return Crypt.open(master, b64dec(meta.lock.wiv), b64dec(meta.lock.wct), await metaAAD(meta));
}
/* Lieu secret : on essaie les cases autour de la position. Renvoie la clé ou null. */
async function tryCells(meta, master, pos, tried, maxTry = 8) {
  const c = meta.lock.cell, aad = await metaAAD(meta);
  const r = clamp((pos.acc || 20) + (meta.place.acc || 10), 15, 60);
  const cand = Cells.around(pos.lat, pos.lon, r, c, 60).filter(x => !tried.has(x.i + ',' + x.j)).slice(0, maxTry);
  for (const x of cand) {
    tried.add(x.i + ',' + x.j);
    const kek = await Crypt.pbkdf2(Cells.material(master, x.i, x.j), b64dec(c.salt), c.iter);
    try { return await Crypt.open(kek, b64dec(meta.lock.wiv), b64dec(meta.lock.wct), aad); } catch (e) { /* mauvaise case */ }
  }
  return null;
}
async function openWithDek(rec, dek) {
  const plain = await Crypt.open(dek, b64dec(rec.meta.lock.piv), rec.ct, await metaAAD(rec.meta));
  return decodePayload(plain);
}

/* ============================== Vision : empreinte d'une scène ============================== */
const Vision = (() => {
  const N = 64;
  const cv = document.createElement('canvas'); cv.width = cv.height = N;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const FRACS = [0.42, 0.55, 0.7];
  const REF_FRAC = 0.55;
  function grab(src, sw, sh, frac) {
    const side = Math.min(sw, sh) * frac;
    cx.drawImage(src, (sw - side) / 2, (sh - side) / 2, side, side, 0, 0, N, N);
    return compute(cx.getImageData(0, 0, N, N).data);
  }
  function compute(d) {
    const g = new Float32Array(N * N), col = new Float32Array(28);
    for (let i = 0, k = 0; i < N * N; i++, k += 4) {
      const r = d[k] / 255, gg = d[k + 1] / 255, b = d[k + 2] / 255;
      g[i] = 0.299 * r + 0.587 * gg + 0.114 * b;
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), v = mx, s = mx ? (mx - mn) / mx : 0;
      if (s > 0.22 && v > 0.18) {
        let h; const dl = mx - mn;
        if (mx === r) h = ((gg - b) / dl) % 6; else if (mx === gg) h = (b - r) / dl + 2; else h = (r - gg) / dl + 4;
        h = (h * 60 + 360) % 360;
        col[Math.floor(h / 30) % 12 * 2 + (s > 0.55 ? 1 : 0)] += 1;
      } else col[24 + Math.min(3, Math.floor(v * 4))] += 0.6;
    }
    let cs = 0; for (const x of col) cs += x; if (cs) for (let i = 0; i < 28; i++) col[i] /= cs;
    let m = 0; for (const x of g) m += x; m /= g.length;
    let sd = 0; for (const x of g) sd += (x - m) ** 2; sd = Math.sqrt(sd / g.length) + 1e-3;
    for (let i = 0; i < g.length; i++) g[i] = (g[i] - m) / sd;
    const hog = new Float32Array(128);
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
      const gx = g[y * N + x + 1] - g[y * N + x - 1], gy = g[(y + 1) * N + x] - g[(y - 1) * N + x];
      const mag = Math.hypot(gx, gy); if (!mag) continue;
      let a = Math.atan2(gy, gx); if (a < 0) a += Math.PI;
      const fb = a / Math.PI * 8 - 0.5; const b0 = (Math.floor(fb) + 8) % 8, b1 = (b0 + 1) % 8, f = fb - Math.floor(fb);
      const cell = (y >> 4) * 4 + (x >> 4);
      hog[cell * 8 + b0] += mag * (1 - f); hog[cell * 8 + b1] += mag * f;
    }
    norm(hog); for (let i = 0; i < 128; i++) hog[i] = Math.min(hog[i], 0.2); norm(hog);
    const lay = new Float32Array(256);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) lay[(y >> 2) * 16 + (x >> 2)] += g[y * N + x] / 16;
    let lm = 0; for (const x of lay) lm += x; lm /= 256; let ls = 0; for (const x of lay) ls += (x - lm) ** 2; ls = Math.sqrt(ls / 256) + 1e-6;
    for (let i = 0; i < 256; i++) lay[i] = (lay[i] - lm) / ls;
    return { h: hog, c: col, l: lay };
  }
  function norm(v) { let s = 0; for (const x of v) s += x * x; s = Math.sqrt(s) || 1; for (let i = 0; i < v.length; i++) v[i] /= s; }
  function ncc(a, b, dx, dy) {
    let s = 0, n = 0;
    for (let y = Math.max(0, -dy); y < Math.min(16, 16 - dy); y++) for (let x = Math.max(0, -dx); x < Math.min(16, 16 - dx); x++) { s += a[y * 16 + x] * b[(y + dy) * 16 + x + dx]; n++; }
    return n ? s / n : 0;
  }
  function compare(a, b) {
    let hc = 0; for (let i = 0; i < 128; i++) hc += a.h[i] * b.h[i];
    let ci = 0; for (let i = 0; i < 28; i++) ci += Math.min(a.c[i], b.c[i]);
    let best = -1; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) best = Math.max(best, ncc(a.l, b.l, dx, dy));
    return 0.45 * hc + 0.15 * ci + 0.4 * Math.max(0, best);
  }
  function scoreSource(src, sw, sh, refs) {
    let best = 0;
    for (const f of FRACS) { const s = grab(src, sw, sh, f); for (const r of refs) best = Math.max(best, compare(s, r)); }
    return best;
  }
  const pack = s => ({ h: f32b64(s.h), c: f32b64(s.c), l: f32b64(s.l) });
  const unpack = p => ({ h: b64f32(p.h), c: b64f32(p.c), l: b64f32(p.l) });
  function thumb(src, sw, sh, frac = REF_FRAC, size = 160) {
    const c = document.createElement('canvas'); c.width = c.height = size; const side = Math.min(sw, sh) * frac;
    c.getContext('2d').drawImage(src, (sw - side) / 2, (sh - side) / 2, side, side, 0, 0, size, size);
    return c.toDataURL('image/jpeg', 0.62);
  }
  return { N, FRACS, REF_FRAC, grab, compute, compare, scoreSource, pack, unpack, thumb, T_ON: 0.62, T_OFF: 0.56 };
})();

/* ============================== QR (étiquette) ============================== */
const QR = (() => {
  let det = null, detTried = false;
  const cv = document.createElement('canvas'); const cx = cv.getContext('2d', { willReadFrequently: true });
  async function detector() {
    if (detTried) return det; detTried = true;
    try { if ('BarcodeDetector' in window) { const f = await window.BarcodeDetector.getSupportedFormats(); if (f.includes('qr_code')) det = new window.BarcodeDetector({ formats: ['qr_code'] }); } } catch (e) { det = null; }
    return det;
  }
  async function scan(src, sw, sh) {
    if (!sw || !sh) return null;
    const d = await detector();
    if (d) { try { const r = await d.detect(src); if (r && r[0]) return r[0].rawValue; } catch (e) { /* repli jsQR */ } }
    if (typeof jsQR !== 'function') return null;
    const k = Math.min(1, 720 / Math.max(sw, sh)); cv.width = Math.round(sw * k); cv.height = Math.round(sh * k);
    cx.drawImage(src, 0, 0, cv.width, cv.height);
    const img = cx.getImageData(0, 0, cv.width, cv.height);
    const r = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
    return r ? r.data : null;
  }
  function svg(text) { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); }
  function pngDataURL(text, caption) {
    const q = qrcode(0, 'M'); q.addData(text); q.make();
    const n = q.getModuleCount(), cell = 12, m = 4, W = (n + 2 * m) * cell, H = W + 70;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) x.fillRect((k + m) * cell, (r + m) * cell, cell, cell);
    x.font = '600 26px system-ui, sans-serif'; x.textAlign = 'center'; x.fillText(caption.slice(0, 34), W / 2, W + 26);
    x.font = '20px system-ui, sans-serif'; x.fillText('GéoTorche : à coller sur l\'objet', W / 2, W + 56);
    return c.toDataURL('image/png');
  }
  const parse = s => { const m = /^GT1:(gt[0-9a-z]{6,20}):([0-9A-Z]{8,32})$/.exec(String(s || '').trim()); return m ? { id: m[1], secret: m[2] } : null; };
  return { scan, svg, pngDataURL, parse };
})();

/* ============================== Capteurs ============================== */
const Geo = {
  pos: null, watchId: null, state: 'idle', sim: null, err: '', listeners: new Set(),
  start() {
    if (this.watchId != null || this.state === 'off') return;
    if (!('geolocation' in navigator)) { this.fail('absent'); return; }
    try {
      this.state = 'wait';
      this.watchId = navigator.geolocation.watchPosition(p => this.update(p),
        e => this.fail(e.code === 1 ? 'refusée' : 'passagère', e),
        { enableHighAccuracy: true, maximumAge: 1500, timeout: 25000 });
    } catch (e) { this.fail('bloquée'); }
    updatePills();
  },
  update(p) { const c = p.coords; this.pos = { lat: c.latitude, lon: c.longitude, acc: Math.max(1, c.accuracy || 999), ts: p.timestamp || Date.now(), sim: false }; this.state = 'ok'; this.emit(); },
  fail(why) {
    // signal perdu ou lent : passager (intérieur, nuages) ; seul un refus d'autorisation est définitif
    if (why === 'passagère') { this.lostAt = Date.now(); if (!this.pos) { this.state = 'wait'; updatePills(); } return; }
    this.state = 'off'; this.err = why;
    if (this.watchId != null) { try { navigator.geolocation.clearWatch(this.watchId); } catch (e) { } this.watchId = null; }
    updatePills(); sensorsBlocked();
  },
  get cur() { return this.sim ? { lat: this.sim.lat, lon: this.sim.lon, acc: this.sim.acc, ts: Date.now(), sim: true } : this.pos; },
  setSim(lat, lon, acc = 6) { this.sim = { lat, lon, acc }; this.emit(); },
  clearSim() { this.sim = null; if (this.state === 'off') this.state = 'idle'; this.emit(); this.start(); },
  age() { return this.sim || !this.pos ? 0 : Date.now() - this.pos.ts; },
  refresh() { // à l'arrêt, certains téléphones ne donnent plus de nouvelles positions
    if (this.sim || this.state !== 'ok' || this.pulling || this.age() < 15000) return;
    this.pulling = true;
    try { navigator.geolocation.getCurrentPosition(p => { this.pulling = false; this.update(p); }, () => { this.pulling = false; }, { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 }); } catch (e) { this.pulling = false; }
  },
  emit() { updatePills(); const c = this.cur; this.listeners.forEach(f => { try { f(c); } catch (e) { } }); },
  measure(ms, onProg) {
    if (this.sim) return Promise.resolve({ lat: this.sim.lat, lon: this.sim.lon, acc: this.sim.acc, n: 1, sim: true });
    if (this.state === 'off') return Promise.reject(new Error('La position est refusée ou indisponible ici. Saisissez des coordonnées, ou utilisez le mode test.'));
    this.start();
    const samples = [], t0 = Date.now();
    return new Promise((res, rej) => {
      const f = p => { if (!p || p.sim) return; if (samples.length && samples[samples.length - 1].ts === p.ts && samples[samples.length - 1].lat === p.lat) return; samples.push(p); };
      this.listeners.add(f);
      if (this.pos && Date.now() - this.pos.ts < 4000) f(this.pos);
      // certains téléphones espacent les mises à jour à l'arrêt : on demande aussi des positions fraîches
      const pull = () => { try { navigator.geolocation.getCurrentPosition(p => this.update(p), () => { }, { enableHighAccuracy: true, maximumAge: 0, timeout: 4000 }); } catch (e) { } };
      pull(); const pv = setInterval(pull, 1500);
      const iv = setInterval(() => {
        const el = Date.now() - t0, best = samples.reduce((m, s) => Math.min(m, s.acc), 999);
        onProg && onProg(samples.length, best, Math.min(1, el / ms));
        const good = samples.filter(s => s.acc <= 5).length >= 5;
        if (el >= ms || good || this.state === 'off') {
          clearInterval(iv); clearInterval(pv); this.listeners.delete(f);
          if (!samples.length) return rej(new Error(this.state === 'off' ? 'Position refusée ou indisponible.' : 'Aucune position reçue. Approchez-vous d\'une fenêtre ou sortez, puis réessayez.'));
          samples.sort((a, b) => a.acc - b.acc);
          const keep = samples.slice(0, Math.max(1, Math.ceil(samples.length / 2)));
          let sw = 0, la = 0, lo = 0; for (const s of keep) { const w = 1 / (s.acc * s.acc); sw += w; la += s.lat * w; lo += s.lon * w; }
          res({ lat: la / sw, lon: lo / sw, acc: Math.max(2, Math.round(keep[0].acc)), n: samples.length });
        }
      }, 250);
    });
  }
};

const Compass = {
  heading: null, pitch: null, src: null, sim: null, started: false, lastTs: 0,
  async start() {
    if (this.started) return true;
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r = await DeviceOrientationEvent.requestPermission(); if (r !== 'granted') { updatePills(); return false; }
      }
    } catch (e) { updatePills(); return false; }
    window.addEventListener('deviceorientationabsolute', e => this.handle(e, false), true);
    window.addEventListener('deviceorientation', e => { if (e.webkitCompassHeading != null) this.handle(e, true); else if (e.absolute === true && this.src !== 'abs') this.handle(e, false); }, true);
    this.started = true; setTimeout(updatePills, 1500); return true;
  },
  handle(e, ios) {
    if (e.alpha == null && e.webkitCompassHeading == null) return;
    let h = null, p = null;
    if (e.beta != null && e.gamma != null) { p = Math.asin(clamp(-Math.cos(e.beta * DEG) * Math.cos(e.gamma * DEG), -1, 1)) / DEG; }
    if (ios) { h = e.webkitCompassHeading; this.src = 'ios'; }
    else {
      const a = e.alpha * DEG, b = (e.beta || 0) * DEG, g = (e.gamma || 0) * DEG;
      if (p != null && Math.abs(p) > 65) h = (360 - e.alpha) % 360;
      else {
        const E = -Math.cos(a) * Math.sin(g) - Math.sin(a) * Math.sin(b) * Math.cos(g);
        const Nn = -Math.sin(a) * Math.sin(g) + Math.cos(a) * Math.sin(b) * Math.cos(g);
        h = (Math.atan2(E, Nn) / DEG + 360) % 360;
      }
      this.src = 'abs';
    }
    if (h == null || !isFinite(h)) return;
    this.heading = this.heading == null ? h : (this.heading + angDiff(h, this.heading) * 0.22 + 360) % 360;
    this.pitch = p == null ? null : (this.pitch == null ? p : this.pitch * 0.75 + p * 0.25);
    const first = !this.lastTs; this.lastTs = performance.now(); if (first) updatePills();
  },
  get value() { if (this.sim != null) return this.sim; return this.heading != null && performance.now() - this.lastTs < 3000 ? this.heading : null; },
  get live() { return this.sim == null && this.heading != null && performance.now() - this.lastTs < 3000; }
};

const Cam = {
  stream: null, track: null, lamp: false, tok: 0, onEnded: null,
  async start(video) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Caméra indisponible ici.');
    this.stop(); const tok = this.tok;
    const named = (name, msg) => { const e = new Error(msg || name); e.name = name; return e; };
    const cancelled = () => named('Cancelled', 'annulé');
    // Du plus précis au plus simple : certains téléphones refusent les réglages détaillés.
    const tries = [
      { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
      { audio: false, video: { facingMode: 'environment' } },
      { audio: false, video: true }
    ];
    let st = null, last = null;
    for (const c of tries) {
      const p = navigator.mediaDevices.getUserMedia(c);
      try {
        st = await Promise.race([p, sleep(25000).then(() => { throw named('TimeoutError', 'délai'); })]);
        break;
      } catch (e) {
        last = e;
        if (e && e.name === 'TimeoutError') p.then(x => x.getTracks().forEach(t => t.stop())).catch(() => { });
        if (!e || ['NotAllowedError', 'SecurityError', 'TimeoutError'].includes(e.name) || tok !== this.tok) break;
      }
    }
    if (!st) throw last || named('NotFoundError');
    if (tok !== this.tok) { st.getTracks().forEach(t => t.stop()); throw cancelled(); }
    this.stream = st; this.track = st.getVideoTracks()[0];
    if (this.track) this.track.addEventListener('ended', () => { if (tok === this.tok && this.onEnded) this.onEnded(); });
    video.srcObject = st; video.muted = true; video.setAttribute('playsinline', '');
    try { await Promise.race([video.play(), sleep(3000)]); } catch (e) { /* lecture auto */ }
    for (let i = 0; i < 60 && !video.videoWidth && tok === this.tok; i++) await sleep(50);
    if (tok !== this.tok) throw cancelled();
    if (!video.videoWidth) { this.stop(); throw named('NotReadableError', 'aucune image'); }
    return true;
  },
  canLamp() { try { const c = this.track && this.track.getCapabilities && this.track.getCapabilities(); return !!(c && c.torch); } catch (e) { return false; } },
  async setLamp(on) { try { await this.track.applyConstraints({ advanced: [{ torch: on }] }); this.lamp = on; return true; } catch (e) { return false; } },
  stop() { this.tok++; if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); } this.stream = null; this.track = null; this.lamp = false; }
};

/* ============================== État ============================== */
const S = {
  view: 'torche', caps: [], activeId: LS.get('active', ''), torchOn: false, still: null,
  tags: Object.create(null), armed: Object.create(null), ev: Object.create(null), vis: Object.create(null), zone: Object.create(null),
  icons: [], cellBusy: false, warm: 0
};
async function loadCaps() { S.caps = (await Store.all()).sort((a, b) => (b.added || 0) - (a.added || 0)); renderTargets(); }
const capById = id => S.caps.find(c => c.id === id) || null;

/* ============================== Interface : commun ============================== */
function show(view) {
  if (view !== 'torche') torchOff();
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'v-' + view));
  $$('nav.tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
  S.view = view;
  if (view === 'liste') renderList();
  if (view === 'torche') resizeStage();
}
function openSheet(id) { $$('.sheet.open').forEach(s => s.classList.remove('open')); $('#' + id).classList.add('open'); $('#backdrop').classList.add('open'); }
function closeSheets() { $$('.sheet.open').forEach(s => s.classList.remove('open')); $('#backdrop').classList.remove('open'); }
function updatePills() {
  const g = $('#pGps'), c = $('#pCmp'), p = Geo.cur;
  if (Geo.sim) { g.className = 'pill warn'; g.textContent = 'Position simulée'; }
  else if (p && Geo.state === 'ok' && Geo.age() > 45000) { g.className = 'pill warn'; g.textContent = 'GPS ancien'; }
  else if (p && Geo.state === 'ok') { g.className = 'pill ' + (p.acc <= 15 ? 'on' : 'warn'); g.textContent = 'GPS ± ' + Math.round(p.acc) + ' m'; }
  else if (Geo.state === 'off') { g.className = 'pill off'; g.textContent = 'GPS bloqué'; }
  else if (Geo.state === 'wait') { g.className = 'pill warn'; g.textContent = 'GPS…'; }
  else { g.className = 'pill'; g.textContent = 'Activer le GPS'; }
  if (Compass.sim != null) { c.className = 'pill warn'; c.textContent = 'Cap simulé'; }
  else if (Compass.live) { c.className = 'pill on'; c.textContent = 'Boussole'; }
  else if (Compass.started) { c.className = 'pill off'; c.textContent = 'Sans boussole'; }
  else { c.className = 'pill'; c.textContent = 'Boussole'; }
}
let blockedShown = false;
function sensorsBlocked() {
  if (blockedShown || Geo.sim) return;
  if (!IN_FRAME && Geo.state !== 'off') return;
  blockedShown = true;
  const b = $('#demoBanner');
  b.innerHTML = IN_FRAME
    ? '<b>Aperçu limité.</b> Ici, la caméra et le GPS sont bloqués par la page. Utilisez le bouton <b>Test</b> pour simuler, ou installez l\'application (onglet Aide).'
    : '<b>Position indisponible.</b> Autorisez la localisation pour ce site dans le navigateur, ou utilisez le bouton <b>Test</b>.';
  b.hidden = false;
}

/* ============================== Torche ============================== */
function renderTargets() {
  const sel = $('#target'); const cur = S.activeId;
  sel.innerHTML = '<option value="">Cible : la plus proche</option>' + S.caps.map(c => '<option value="' + esc(c.id) + '">' + esc(c.meta.label) + '</option>').join('');
  sel.value = capById(cur) ? cur : ''; if (!capById(cur)) S.activeId = '';
}
function currentTarget() {
  if (S.activeId && capById(S.activeId)) return capById(S.activeId);
  const shown = S.caps.find(c => S.ev[c.id] && S.ev[c.id].reveal); if (shown) return shown;
  const tagged = S.caps.find(c => S.tags[c.id]); if (tagged) return tagged;
  const pos = Geo.cur; if (!pos) return S.caps[0] || null;
  let best = null, bk = Infinity;
  for (const c of S.caps) {
    const ev = S.ev[c.id], P = c.meta.place;
    const k = ev && ev.inZone ? P.radius + (P.mode === 'secret' ? 1000 : 0) : 1e6 + distM(pos, P) - P.radius;
    if (k < bk) { bk = k; best = c; }
  }
  return best;
}
function evaluate(c) {
  const m = c.meta, P = m.place, pos = Geo.cur, h = Compass.value;
  const ev = { dist: null, brg: null, inZone: false, coarse: false, fine: false, reveal: false, rel: null, why: '', warm: 0, by: '' };
  const tag = S.tags[m.id];
  if (pos) {
    ev.dist = distM(pos, P); ev.brg = bearing(pos, P);
    const slack = Math.min(pos.acc, Math.max(P.radius, 10) * 2), edge = P.radius + slack;
    ev.inZone = S.zone[m.id] ? ev.dist <= edge + Math.max(5, P.radius * 0.15) : ev.dist <= edge;
    S.zone[m.id] = ev.inZone;
    ev.stale = Geo.age() > 45000;
  }
  ev.coarse = !!tag || ev.inZone;
  if (h != null) {
    if (ev.coarse) { if (P.heading != null) ev.rel = angDiff(P.heading, h); }
    else if (ev.brg != null) ev.rel = angDiff(ev.brg, h);
  }
  if (tag) { ev.fine = true; ev.by = 'étiquette'; ev.warm = 1; }
  else if (m.tag) { ev.fine = false; const v = S.vis[m.id]; ev.warm = v ? clamp((v.ema - 0.4) / (Vision.T_ON - 0.4), 0, 1) * 0.8 : 0; }
  else if (m.look) { const v = S.vis[m.id]; ev.fine = !!(v && v.on); ev.by = 'vue'; ev.warm = v ? clamp((v.ema - 0.4) / (Vision.T_ON - 0.4), 0, 1) : 0; }
  else if (P.heading != null && h != null) { const d = Math.abs(angDiff(P.heading, h)); ev.fine = d <= 30; ev.by = 'direction'; ev.warm = clamp(1 - d / 120, 0, 1); }
  else if (P.heading != null && h == null) { ev.fine = true; ev.by = 'zone'; }
  else { ev.fine = true; ev.by = 'zone'; }
  if (P.mode === 'secret') {
    const a = S.armed[m.id];
    ev.cell = !!(a && a.dek);
    ev.near = ev.cell && (!pos || !a.at || distM(pos, a.at) <= Math.max(30, (pos.acc || 0) + 20));
    ev.reveal = ev.cell && ev.near && (tag || ev.fine);
  }
  else ev.reveal = ev.coarse && ev.fine;
  if (!ev.coarse && ev.dist != null) ev.warm = Math.max(ev.warm * 0.3, clamp(1 - (ev.dist - P.radius) / 300, 0, 1) * 0.35);
  return ev;
}
function hintFor(c, ev) {
  const m = c.meta, P = m.place, pos = Geo.cur, out = { t: m.label, l: '', meter: null, btn: null };
  const secret = P.mode === 'secret', armed = S.armed[m.id];
  if (ev.reveal) { out.t = 'Trouvé : ' + m.label; out.l = 'Touchez l\'icône dans la lumière pour ouvrir.'; out.meter = 1; return out; }
  if (secret && !armed) {
    out.l = 'Lieu secret' + (pos ? (ev.dist <= P.radius ? ' : vous êtes dans la zone indiquée (' + fmtDist(P.radius) + ').' : ' : zone à ' + fmtDist(ev.dist) + ' vers le ' + cardinal(ev.brg) + '.') : '.') + ' Entrez le mot de passe pour que la torche reconnaisse l\'endroit exact.';
    out.btn = { text: 'Entrer le mot de passe', fn: () => openUnlock(c.id) };
    if (m.tag && !S.tags[m.id]) out.l += ' Scannez aussi l\'étiquette.';
    return out;
  }
  if (pos && ev.stale && !Geo.sim) out.pre = 'Position ancienne (pas de signal récent). ';
  if (!pos) { out.l = Geo.state === 'off' ? 'Position indisponible. Utilisez le mode Test, ou scannez l\'étiquette si l\'objet en porte une.' : 'En attente de la position GPS…'; return out; }
  if (secret) {
    if (armed && armed.dek && !ev.near) { out.l = 'Vous vous êtes éloigné de l\'endroit reconnu (' + fmtDist(distM(pos, armed.at)) + '). Revenez-y.'; return out; }
    if (armed && !armed.dek) {
      out.l = ev.dist > P.radius ? 'Zone à ' + fmtDist(ev.dist) + ' vers le ' + cardinal(ev.brg) + '. ' : 'Dans la zone. ';
      out.l += 'Marchez : la torche cherche l\'endroit exact (' + armed.tried.size + ' cases testées).';
      if (pos.acc > 30) out.l += ' Précision GPS faible (± ' + Math.round(pos.acc) + ' m).';
      if (armed.tried.size >= 40 && ev.dist <= P.radius) out.l += ' Toujours rien : le mot de passe est peut-être faux.';
      out.btn = { text: 'Ressaisir le mot de passe', fn: () => openUnlock(c.id) };
      return out;
    }
    if (m.look && !ev.fine) { out.l = 'Endroit reconnu. Balayez avec la torche pour retrouver l\'objet photographié.'; out.meter = ev.warm; return out; }
    if (m.tag && !S.tags[m.id]) { out.l = 'Endroit reconnu. Visez l\'étiquette QR collée sur l\'objet.'; return out; }
  }
  if (!ev.coarse) {
    out.l = 'À ' + fmtDist(Math.max(0, ev.dist)) + ' vers le ' + cardinal(ev.brg) + (ev.rel != null ? (Math.abs(ev.rel) < 20 ? ' : droit devant.' : ev.rel > 0 ? ' : tournez à droite.' : ' : tournez à gauche.') : '.') + (pos.acc > 40 ? ' GPS imprécis (± ' + Math.round(pos.acc) + ' m).' : '');
    out.meter = ev.warm; return out;
  }
  if (!S.torchOn && !S.still) { out.l = 'Vous êtes dans la zone. Allumez la torche et balayez lentement.'; return out; }
  if (m.tag) { out.l = 'Dans la zone. Cherchez l\'objet' + (m.look ? ' (la jauge chauffe quand il est en vue)' : '') + ', puis visez l\'étiquette QR collée dessus.'; out.meter = m.look ? ev.warm : null; if (m.look && m.look.thumb) out.thumb = m.look.thumb; return out; }
  if (m.look) { out.l = ev.warm > 0.65 ? 'Chaud ! Gardez l\'objet dans le cercle.' : ev.warm > 0.3 ? 'Plus chaud… balayez doucement.' : 'Dans la zone. Balayez la pièce avec la torche.'; if (P.heading != null && ev.rel != null && Math.abs(ev.rel) > 35) out.l += ev.rel > 0 ? ' Plutôt à droite.' : ' Plutôt à gauche.'; out.meter = ev.warm; if (m.look.thumb) out.thumb = m.look.thumb; return out; }
  if (P.heading != null) { out.l = ev.rel == null ? 'Dans la zone.' : (Math.abs(ev.rel) <= 30 ? 'Gardez cette direction.' : (ev.rel > 0 ? 'Tournez à droite.' : 'Tournez à gauche.')); out.meter = ev.warm; return out; }
  out.l = 'Dans la zone.'; return out;
}
let lastHint = '';
function updateHint() {
  const c = currentTarget();
  const T = $('#hintT'), L = $('#hintL'), M = $('#hintM'), R = $('#hintR');
  if (!c) { T.textContent = 'Aucune cachette'; L.textContent = 'Cachez un fichier (onglet Cacher) ou importez une cachette reçue (onglet Cachettes).'; M.hidden = true; R.hidden = true; return; }
  const ev = S.ev[c.id] || evaluate(c), h = hintFor(c, ev);
  const key = h.t + '|' + (h.pre || '') + h.l + '|' + (h.btn ? h.btn.text : '') + '|' + (h.thumb ? 1 : 0);
  if (h.meter != null) { M.hidden = false; M.firstChild.style.width = Math.round(h.meter * 100) + '%'; } else M.hidden = true;
  if (key === lastHint) return; lastHint = key;
  T.textContent = h.t; L.textContent = (h.pre || '') + h.l;
  if (h.btn || h.thumb) {
    R.hidden = false; R.innerHTML = '';
    if (h.thumb) { const i = new Image(); i.src = h.thumb; i.style.cssText = 'flex:0 0 54px;width:54px;height:54px;border-radius:9px;object-fit:cover'; i.alt = 'Indice'; R.appendChild(i); }
    if (h.btn) { const b = document.createElement('button'); b.className = 'btn sm primary'; b.type = 'button'; b.textContent = h.btn.text; b.onclick = h.btn.fn; R.appendChild(b); }
  } else R.hidden = true;
}

/* --- dessin de la torche --- */
const fx = { cvs: null, ctx: null, W: 0, H: 0, dpr: 1 };
function resizeStage() {
  const c = $('#fx'), r = c.getBoundingClientRect(); fx.dpr = Math.min(2, window.devicePixelRatio || 1);
  fx.W = c.width = Math.max(1, Math.round(r.width * fx.dpr)); fx.H = c.height = Math.max(1, Math.round(r.height * fx.dpr));
  fx.cvs = c; fx.ctx = c.getContext('2d');
}
function mediaBox() {
  const v = S.still ? $('#still') : $('#vid');
  const vw = S.still ? v.naturalWidth : v.videoWidth, vh = S.still ? v.naturalHeight : v.videoHeight;
  return { el: v, vw, vh };
}
function beamRadius() {
  const { vw, vh } = mediaBox();
  const W = fx.W, H = fx.H;
  if (!vw || !vh) return Math.min(W, H) * 0.28;
  const sc = Math.max(W / vw, H / vh);
  return 0.5 * Vision.REF_FRAC * Math.min(vw, vh) * sc;
}
function drawStage(t) {
  if (!fx.ctx) resizeStage();
  const x = fx.ctx, W = fx.W, H = fx.H, d = fx.dpr, cx = W / 2, cy = H / 2;
  const lit = S.torchOn || S.still;
  x.clearRect(0, 0, W, H);
  x.fillStyle = lit ? 'rgba(4,5,7,0.66)' : 'rgba(4,5,7,1)'; x.fillRect(0, 0, W, H);
  const R = lit ? beamRadius() : Math.min(W, H) * 0.2;
  const c = currentTarget(); const ev = c ? S.ev[c.id] : null; const warm = S.warm;
  if (lit) {
    x.save(); x.globalCompositeOperation = 'destination-out';
    const g = x.createRadialGradient(cx, cy, R * 0.82, cx, cy, R * 1.25); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, R * 1.25, 0, Math.PI * 2); x.fill(); x.restore();
    x.fillStyle = 'rgba(255,190,90,' + (0.03 + 0.14 * warm) + ')'; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fill();
  } else {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, R * 1.6); g.addColorStop(0, 'rgba(255,190,90,0.10)'); g.addColorStop(1, 'rgba(255,190,90,0)');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, R * 1.6, 0, Math.PI * 2); x.fill();
  }
  x.lineWidth = 2 * d; x.strokeStyle = 'rgba(255,211,132,' + (0.22 + 0.55 * warm) + ')';
  x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.stroke();
  // flèche de direction au bord du faisceau
  if (c && ev && !ev.reveal && ev.rel != null) {
    const a = ev.rel * DEG, rr = R + 16 * d, px = cx + Math.sin(a) * rr, py = cy - Math.cos(a) * rr;
    x.save(); x.translate(px, py); x.rotate(a); x.fillStyle = 'rgba(255,181,71,0.95)';
    x.beginPath(); x.moveTo(0, -12 * d); x.lineTo(10 * d, 6 * d); x.lineTo(0, 1 * d); x.lineTo(-10 * d, 6 * d); x.closePath(); x.fill(); x.restore();
  }
  // icônes révélées
  S.icons = [];
  const shown = S.caps.filter(k => S.ev[k.id] && S.ev[k.id].reveal);
  shown.forEach((k, i) => {
    const e = S.ev[k.id]; const P = k.meta.place;
    let ix = cx + (i - (shown.length - 1) / 2) * 92 * d, iy = cy;
    if (e.rel != null && Math.abs(e.rel) < 40 && !S.tags[k.id] && !(k.meta.look)) ix += (e.rel / 50) * (W / 2);
    if (P.pitch != null && Compass.pitch != null && Compass.live) iy += clamp(-(P.pitch - Compass.pitch) / 65 * H, -R * 0.5, R * 0.5);
    const pulse = 1 + 0.05 * Math.sin((t || 0) / 220);
    drawIcon(x, ix, iy, d * pulse, k.meta);
    S.icons.push({ id: k.id, x: ix, y: iy, r: 46 * d });
  });
}
function drawIcon(x, cx, cy, s, meta) {
  const w = 54 * s, h = 66 * s, l = cx - w / 2, t = cy - h / 2, f = 15 * s;
  x.save(); x.shadowColor = 'rgba(255,181,71,0.8)'; x.shadowBlur = 24 * s;
  x.fillStyle = '#ffb547';
  x.beginPath(); x.moveTo(l + 8 * s, t); x.lineTo(l + w - f, t); x.lineTo(l + w, t + f); x.lineTo(l + w, t + h - 8 * s);
  x.quadraticCurveTo(l + w, t + h, l + w - 8 * s, t + h); x.lineTo(l + 8 * s, t + h); x.quadraticCurveTo(l, t + h, l, t + h - 8 * s);
  x.lineTo(l, t + 8 * s); x.quadraticCurveTo(l, t, l + 8 * s, t); x.closePath(); x.fill(); x.restore();
  x.fillStyle = '#c98420'; x.beginPath(); x.moveTo(l + w - f, t); x.lineTo(l + w - f, t + f); x.lineTo(l + w, t + f); x.closePath(); x.fill();
  x.strokeStyle = '#1b1305'; x.lineWidth = 3 * s; x.lineCap = 'round';
  for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(l + 12 * s, t + (28 + i * 10) * s); x.lineTo(l + w - (i === 2 ? 22 : 12) * s, t + (28 + i * 10) * s); x.stroke(); }
  const label = meta.label.length > 26 ? meta.label.slice(0, 25) + '…' : meta.label;
  x.font = '600 ' + Math.round(14 * s) + 'px system-ui, sans-serif'; x.textAlign = 'center';
  const tw = x.measureText(label).width + 16 * s;
  x.fillStyle = 'rgba(12,13,16,0.85)'; x.fillRect(cx - tw / 2, t + h + 8 * s, tw, 24 * s);
  x.fillStyle = '#ffe2b0'; x.fillText(label, cx, t + h + 25 * s);
}

/* --- boucle --- */
let tA = 0, tQ = 0, tC = 0, tD = 0, tG = 0; const wasRevealed = Object.create(null);
function loop(t) {
  requestAnimationFrame(loop);
  if (S.view !== 'torche' || document.hidden) return;
  if (S.torchOn && t - tA > 170) { tA = t; analyzeFrame(); }
  if (S.torchOn && t - tQ > 420) { tQ = t; scanFrameQR(); }
  if (t - tC > 1300) { tC = t; cellTick(); }
  if (t - tG > 5000) { tG = t; Geo.refresh(); updatePills(); }
  if (t - tD < 33) return; tD = t;
  for (const c of S.caps) {
    const ev = S.ev[c.id] = evaluate(c);
    if (ev.reveal && !wasRevealed[c.id]) { vibrate([60, 40, 60]); toast('Trouvé : ' + c.meta.label, 'good'); }
    wasRevealed[c.id] = ev.reveal;
  }
  const c = currentTarget(); const w = c && S.ev[c.id] ? (S.ev[c.id].reveal ? 1 : S.ev[c.id].warm) : 0;
  S.warm = S.warm * 0.85 + w * 0.15;
  drawStage(t); updateHint();
}
/* Compare l'image du faisceau aux photos de chaque cachette proche (quelques ms par cachette). */
function lookReady(c) { const ev = S.ev[c.id]; return !!(c.meta.look && ev && (c.meta.place.mode === 'secret' ? ev.cell && ev.near : ev.coarse)); }
function analyzeFrame(single) {
  const { el, vw, vh } = mediaBox(); if (!vw) return;
  let n = 0;
  for (const c of S.caps) {
    if (!c.meta.look) continue;
    const v = S.vis[c.id] || (S.vis[c.id] = { score: 0, ema: 0, on: false });
    if (!lookReady(c) || n >= 4) { v.ema *= 0.8; v.on = v.on && v.ema >= Vision.T_OFF; continue; }
    n++;
    if (!c._refs) c._refs = c.meta.look.sigs.map(Vision.unpack);
    const sc = Vision.scoreSource(el, vw, vh, c._refs);
    v.score = sc; v.ema = single ? sc : v.ema * 0.6 + sc * 0.4;
    if (!v.on && v.ema >= Vision.T_ON) v.on = true; else if (v.on && v.ema < Vision.T_OFF) v.on = false;
  }
  return n;
}
let qrBusy = false;
async function scanFrameQR() {
  if (qrBusy) return; qrBusy = true;
  try { const { el, vw, vh } = mediaBox(); const s = await QR.scan(el, vw, vh); if (s) onQR(s); } catch (e) { } finally { qrBusy = false; }
}
function onQR(s) {
  const q = QR.parse(s);
  if (!q) { if (!onQR.warned) { onQR.warned = true; toast('Ce QR code n\'est pas une étiquette GéoTorche.'); } return; }
  if (S.tags[q.id] === q.secret) return;
  S.tags[q.id] = q.secret;
  const c = capById(q.id);
  if (!c) { toast('Étiquette reconnue, mais cette cachette n\'est pas sur ce téléphone. Importez-la d\'abord.'); return; }
  S.activeId = q.id; $('#target').value = q.id; vibrate(80);
  toast('Étiquette de « ' + c.meta.label + ' » reconnue.', 'good');
}
async function cellTick() {
  if (S.cellBusy) return; const pos = Geo.cur; if (!pos) return;
  const ids = Object.keys(S.armed).filter(id => S.armed[id] && S.armed[id].master && !S.armed[id].dek && capById(id));
  if (!ids.length) return;
  S.cellBusy = true;
  try {
    for (const id of ids) {
      const a = S.armed[id], c = capById(id);
      const dek = await tryCells(c.meta, a.master, pos, a.tried, 6);
      if (dek) { a.dek = dek; a.at = pos; }
    }
  } finally { S.cellBusy = false; }
}

function clearStill() { if (S.still) { URL.revokeObjectURL(S.still); S.still = null; } const i = $('#still'); i.hidden = true; i.removeAttribute('src'); }
const CAM_HELP = {
  NotAllowedError: ['La caméra est bloquée', 'La caméra a été refusée pour ce site.<ol><li>Touchez le <b>cadenas</b> à gauche de l\'adresse, en haut.</li><li>Ouvrez <b>Autorisations</b> (ou <b>Paramètres du site</b>), puis <b>Caméra</b>, et choisissez <b>Autoriser</b>.</li><li>Rechargez la page, puis rallumez la torche.</li></ol>Si rien ne change, vérifiez que Chrome a lui-même le droit d\'utiliser la caméra : <b>Paramètres du téléphone</b>, <b>Applications</b>, <b>Chrome</b>, <b>Autorisations</b>, <b>Appareil photo</b>.'],
  NotReadableError: ['La caméra est occupée', 'Une autre application utilise sans doute la caméra (appareil photo, appel vidéo, WhatsApp, lampe de poche). Fermez-la complètement, puis réessayez. Si cela continue, redémarrez Chrome.'],
  TimeoutError: ['Pas de réponse de la caméra', 'Le téléphone n\'a pas répondu. Une demande d\'autorisation attend peut-être en bas de l\'écran ou dans la barre d\'adresse : acceptez-la, puis réessayez. Sinon, fermez les autres applications qui utilisent la caméra.'],
  NotFoundError: ['Aucune caméra trouvée', 'Le navigateur ne trouve pas de caméra sur cet appareil.'],
  SecurityError: ['Caméra interdite ici', 'Cette page ne peut pas utiliser la caméra. Ouvrez l\'adresse sécurisée de l\'application (https) dans Chrome.']
};
function camHelp(name) {
  const k = name === 'TrackStartError' || name === 'AbortError' ? 'NotReadableError' : name === 'OverconstrainedError' ? 'NotFoundError' : name === 'PermissionDeniedError' ? 'NotAllowedError' : name;
  const h = CAM_HELP[k] || ['Caméra indisponible', 'La caméra n\'a pas pu démarrer (' + esc(name || 'erreur inconnue') + ').'];
  $('#iTitle').textContent = h[0];
  $('#iBody').innerHTML = '<div class="small">' + h[1] + '</div><p class="note">En attendant, « Éclairer avec une photo » fonctionne sans la caméra en direct.</p>';
  openSheet('shInfo');
}
let lampHinted = false;
async function torchOn() {
  const btn = $('#btnTorch'); if (btn.disabled) return;
  btn.disabled = true; btn.textContent = 'Démarrage de la caméra…';
  Geo.start(); try { await Promise.race([Compass.start(), sleep(5000)]); } catch (e) { }
  clearStill();
  let perm = null;
  try { if (navigator.permissions && navigator.permissions.query) perm = (await navigator.permissions.query({ name: 'camera' })).state; } catch (e) { }
  const ask = setTimeout(() => toast('Autorisez la caméra si le téléphone le demande.'), perm === 'granted' ? 6000 : 1200);
  try {
    if (perm === 'denied') { const e = new Error('refus'); e.name = 'NotAllowedError'; throw e; }
    await Cam.start($('#vid'));
    if (S.view !== 'torche') { Cam.stop(); return; }
    S.torchOn = true; btn.textContent = 'Éteindre la torche';
    const lamp = Cam.canLamp(); $('#btnLamp').hidden = !lamp;
    if (lamp && !lampHinted) { lampHinted = true; setTimeout(() => toast('La torche, c\'est la caméra. Pour éclairer une pièce sombre, touchez « Lampe ».'), 900); }
    Cam.onEnded = () => { torchOff(); toast('La caméra a été interrompue.'); };
  } catch (e) {
    S.torchOn = false;
    if (e && e.name === 'Cancelled') return;
    if (IN_FRAME) { toast('Caméra bloquée dans cet aperçu. Utilisez « Éclairer avec une photo ».', 'bad'); sensorsBlocked(); }
    else camHelp(e && e.name);
  } finally {
    clearTimeout(ask); btn.disabled = false;
    if (!S.torchOn) btn.textContent = 'Allumer la torche';
    resizeStage();
  }
}
function torchOff() { Cam.stop(); Cam.onEnded = null; S.torchOn = false; $('#vid').srcObject = null; $('#btnTorch').textContent = 'Allumer la torche'; $('#btnLamp').hidden = true; }
async function photoLight(file) {
  if (!file) return;
  torchOff(); Geo.start(); clearStill();
  const img = $('#still'); const url = URL.createObjectURL(file);
  try { await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('Image illisible.')); img.src = url; }); }
  catch (e) { URL.revokeObjectURL(url); toast(e.message, 'bad'); return; }
  img.hidden = false; S.still = url;
  try { const s = await QR.scan(img, img.naturalWidth, img.naturalHeight); if (s) onQR(s); } catch (e) { }
  for (const c of S.caps) S.ev[c.id] = evaluate(c);
  const n = analyzeFrame(true);
  const c = currentTarget();
  if (c && c.meta.look && !(S.vis[c.id] && S.vis[c.id].on)) {
    if (lookReady(c)) toast('Pas reconnu sur cette photo. Cadrez l\'objet au centre, comme sur la photo d\'origine.');
    else { const ev = S.ev[c.id]; toast(c.meta.place.mode === 'secret' ? 'Il faut d\'abord que la torche reconnaisse l\'endroit exact.' : 'Approchez-vous d\'abord de la zone (' + (ev && ev.dist != null ? 'à ' + fmtDist(ev.dist) : 'position inconnue') + ').'); }
  }
  return n;
}

/* --- ouverture --- */
let unlockId = null;
function failKey(id) { return 'fail_' + id; }
function lockedFor(id) { const f = LS.get(failKey(id), null); return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0; }
function noteFail(id) { const f = LS.get(failKey(id), { n: 0, until: 0 }); f.n++; f.until = f.n >= 3 ? Date.now() + Math.min(300, 5 * 2 ** (f.n - 3)) * 1000 : 0; LS.set(failKey(id), f); }
function openUnlock(id) {
  const c = capById(id); if (!c) return; unlockId = id; const m = c.meta, ev = S.ev[id] || evaluate(c);
  $('#uTitle').textContent = m.label; $('#uHint').textContent = m.hint ? 'Indice : ' + m.hint : '';
  const secretArm = m.place.mode === 'secret' && !(S.armed[id] && S.armed[id].dek);
  const items = [];
  if (m.place.mode === 'secret') items.push([!!(S.armed[id] && S.armed[id].dek), 'Endroit exact reconnu par la clé']);
  else items.push([ev.coarse, 'Dans la zone (' + fmtDist(m.place.radius) + ')']);
  if (m.look) items.push([ev.fine && ev.by === 'vue', 'Objet reconnu par la torche']);
  if (m.tag) items.push([!!S.tags[id], 'Étiquette QR scannée']);
  $('#uChecks').innerHTML = items.map(([ok, t]) => '<li class="' + (ok ? 'y' : 'n') + '">' + (ok ? '✓' : '○') + ' ' + esc(t) + '</li>').join('');
  $('#uPwBox').hidden = !m.pw; $('#uPw').value = ''; $('#uErr').textContent = '';
  $('#uGo').textContent = secretArm ? 'Armer la torche' : 'Ouvrir';
  if (m.tag && !S.tags[id]) $('#uErr').textContent = 'Il faut d\'abord scanner l\'étiquette collée sur l\'objet.';
  openSheet('shUnlock'); if (m.pw) setTimeout(() => $('#uPw').focus(), 250);
}
async function doUnlock() {
  const c = capById(unlockId); if (!c) return; const m = c.meta; const err = $('#uErr'); err.textContent = '';
  const wait = lockedFor(m.id); if (wait) { err.textContent = 'Trop d\'essais. Patientez ' + wait + ' s.'; return; }
  if (m.tag && !S.tags[m.id]) { err.textContent = 'Scannez d\'abord l\'étiquette QR collée sur l\'objet.'; return; }
  const pw = $('#uPw').value; if (m.pw && !pw) { err.textContent = 'Entrez le mot de passe.'; return; }
  const tag = S.tags[m.id] || '';
  if (m.place.mode === 'secret') {
    let a = S.armed[m.id];
    if (!a || !a.dek) {
      busy('Préparation de la clé…');
      try { const master = await Crypt.pbkdf2(Crypt.secret(pw, tag), b64dec(m.lock.salt), m.lock.iter); S.armed[m.id] = a = { master, tried: new Set(), dek: null }; }
      finally { unbusy(); }
      closeSheets(); S.activeId = m.id; $('#target').value = m.id; show('torche');
      toast('Torche armée. Marchez jusqu\'à l\'endroit : l\'icône apparaîtra dessus.', 'good');
      cellTick(); return;
    }
    return openPayload(c, a.dek, 'lieu secret');
  }
  busy('Déchiffrement…');
  let dek = null;
  try { dek = await unwrapVisible(m, pw, tag); }
  catch (e) { unbusy(); noteFail(m.id); journal(c, false, 'mot de passe'); err.textContent = m.tag ? 'Mot de passe incorrect (ou étiquette d\'une autre cachette).' : 'Mot de passe incorrect.'; const w = lockedFor(m.id); if (w) err.textContent += ' Patientez ' + w + ' s.'; return; }
  unbusy(); return openPayload(c, dek, m.look ? 'vue' : m.tag ? 'étiquette' : 'zone');
}
const objectURLs = [];
async function openPayload(c, dek, how) {
  let data;
  busy('Ouverture…');
  try { data = await openWithDek(c, dek); } catch (e) { unbusy(); toast('Cachette endommagée : impossible de la lire.', 'bad'); return; }
  unbusy(); LS.del(failKey(c.id)); journal(c, true, how);
  objectURLs.splice(0).forEach(u => URL.revokeObjectURL(u));
  const b = $('#vBody'); $('#vTitle').textContent = c.meta.label; b.innerHTML = '';
  if (data.note) { const n = document.createElement('div'); n.className = 'notebox'; n.textContent = data.note; b.appendChild(n); }
  for (const f of data.files) {
    const url = URL.createObjectURL(f.blob); objectURLs.push(url);
    const box = document.createElement('div'); box.className = 'card';
    box.innerHTML = '<div style="display:flex;justify-content:space-between;gap:8px"><b style="word-break:break-all">' + esc(f.name) + '</b><span class="mute small">' + fmtBytes(f.size) + '</span></div>';
    if (/^image\//.test(f.type)) { const i = new Image(); i.src = url; i.alt = f.name; box.appendChild(i); }
    else if (/^video\//.test(f.type)) { const v = document.createElement('video'); v.src = url; v.controls = true; v.playsInline = true; box.appendChild(v); }
    else if (/^audio\//.test(f.type)) { const a = document.createElement('audio'); a.src = url; a.controls = true; box.appendChild(a); }
    else if ((/^text\//.test(f.type) || /\.(md|json|html?|xml|svg|log|txt|csv)$/i.test(f.name)) && f.size < 400000) { const p = document.createElement('pre'); p.textContent = await f.blob.text(); box.appendChild(p); }
    const r = document.createElement('div'); r.className = 'row'; r.style.marginTop = '8px';
    if (!IN_FRAME && !IS_IOS && f.type !== 'application/octet-stream') { const o = document.createElement('a'); o.className = 'btn sm'; o.target = '_blank'; o.rel = 'noopener'; o.href = url; o.textContent = 'Ouvrir'; r.appendChild(o); }
    const sv = document.createElement('button'); sv.type = 'button'; sv.className = 'btn sm'; sv.textContent = 'Enregistrer'; sv.onclick = () => offerFile(f.blob, f.name);
    r.appendChild(sv); box.appendChild(r); b.appendChild(box);
  }
  if (!data.files.length && !data.note) b.innerHTML = '<p class="mute">Cachette vide.</p>';
  if (c.meta.opt && c.meta.opt.burn) {
    try { await Store.del(c.id); c.burned = true; } catch (e) { }
    const p = document.createElement('p'); p.className = 'note'; p.textContent = 'Lecture unique : la cachette vient d\'être effacée de ce téléphone. Enregistrez les fichiers avant de fermer.'; b.appendChild(p);
  }
  S.viewing = c.id; openSheet('shView');
}
async function closeViewer() {
  closeSheets(); const id = S.viewing; S.viewing = null;
  objectURLs.splice(0).forEach(u => URL.revokeObjectURL(u));
  const c = capById(id);
  if (c && c.burned) { delete S.armed[id]; delete S.tags[id]; await loadCaps(); toast('Cachette effacée de ce téléphone.'); }
}

/* ============================== Journal ============================== */
async function journal(c, ok, how) {
  const p = Geo.cur; const j = await Store.kvGet('journal', []);
  j.unshift({ t: Date.now(), id: c.id, label: c.meta.label, ok, how, lat: p ? +p.lat.toFixed(6) : null, lon: p ? +p.lon.toFixed(6) : null, acc: p ? Math.round(p.acc) : null, sim: !!(p && p.sim) });
  await Store.kvSet('journal', j.slice(0, 500));
  if (S.view === 'liste') renderJournal();
}
async function renderJournal() {
  const j = await Store.kvGet('journal', []); const el = $('#jList');
  if (!j.length) { el.innerHTML = '<p class="small mute">Aucune ouverture pour l\'instant.</p>'; return; }
  el.innerHTML = j.slice(0, 30).map(e => '<div class="jr"><span>' + (e.ok ? '<span class="ok">Ouvert</span>' : '<span class="bad">Refusé</span>') + ' · ' + esc(e.label) + '<br><span class="mute">' + (e.lat != null ? frNum(e.lat, 5) + ' ; ' + frNum(e.lon, 5) + ' (± ' + e.acc + ' m)' + (e.sim ? ', simulée' : '') : 'position inconnue') + '</span></span><span class="mute" style="white-space:nowrap">' + fmtDate(e.t) + '</span></div>').join('');
}
async function exportJournal() {
  const j = await Store.kvGet('journal', []); if (!j.length) { toast('Journal vide.'); return; }
  const cell = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const rows = [['Date', 'Heure', 'Cachette', 'Résultat', 'Méthode', 'Latitude', 'Longitude', 'Précision (m)', 'Position simulée'].map(cell).join(';')];
  for (const e of j.slice().reverse()) {
    const d = new Date(e.t);
    rows.push([d.toLocaleDateString('fr-FR'), d.toLocaleTimeString('fr-FR'), e.label, e.ok ? 'Ouvert' : 'Refusé', e.how || '', e.lat != null ? frNum(e.lat, 6) : '', e.lon != null ? frNum(e.lon, 6) : '', e.acc != null ? e.acc : '', e.sim ? 'oui' : 'non'].map(cell).join(';'));
  }
  offerFile(new Blob(['\ufeff' + rows.join('\r\n')], { type: 'text/csv' }), 'journal-geotorche.csv', () => copyText(rows.join('\n')));
}

/* ============================== Partage / import ============================== */
const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let dlNS = null;
function downloadsNS() {
  if (!dlNS) dlNS = (window.claude && typeof window.claude.use === 'function') ? Promise.race([window.claude.use('downloads'), sleep(10000).then(() => null)]).catch(() => null) : Promise.resolve(null);
  return dlNS;
}
/* Remettre un fichier à l'utilisateur : feuille de partage (iOS), téléchargement, ou demande de l'aperçu Claude. */
async function offerFile(blob, name, fallback) {
  if (IN_FRAME) {
    const dl = await downloadsNS();
    if (dl) {
      try { await dl.save({ filename: name, data: blob }); toast('Enregistré.', 'good'); }
      catch (e) { const c = e && e.code; toast(c === 'declined' ? 'Enregistrement annulé.' : c === 'rejected_extension' ? 'Ce type de fichier ne peut pas être enregistré depuis cet aperçu.' : 'Enregistrement impossible ici.'); if (c !== 'declined' && fallback) fallback(); }
      return false;
    }
    if (fallback) fallback(); else toast('Cet aperçu bloque les téléchargements : utilisez l\'application installée (voir Aide).');
    return false;
  }
  if (IS_IOS && navigator.canShare) {
    try { const f = new File([blob], name, { type: blob.type || 'application/octet-stream' }); if (navigator.canShare({ files: [f] })) { await navigator.share({ files: [f] }); return true; } }
    catch (e) { if (e && e.name === 'AbortError') return false; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 8000);
  return true;
}
function shareText(m) {
  const P = m.place, L = [];
  L.push('Je t\'ai caché « ' + m.label + ' ».');
  if (P.mode === 'visible') { L.push('Lieu : ' + P.lat.toFixed(6) + ', ' + P.lon.toFixed(6) + ' (rayon ' + P.radius + ' m)'); L.push('Carte : https://maps.google.com/?q=' + P.lat.toFixed(6) + ',' + P.lon.toFixed(6)); }
  else L.push('Zone : autour de ' + P.lat.toFixed(4) + ', ' + P.lon.toFixed(4) + ' (environ ' + P.radius + ' m). L\'endroit exact est à trouver.');
  if (m.hint) L.push('Indice : ' + m.hint);
  L.push('Ouvre le fichier joint avec GéoTorche, va sur place et éclaire avec la torche.');
  if (m.pw) L.push('Je te donne le mot de passe à part.');
  return L.join('\n');
}
let shareId = null;
function openShare(id) {
  const c = capById(id); if (!c) return; shareId = id;
  $('#sText').value = shareText(c.meta);
  $('#sLink').hidden = !(HOSTED && capsuleSize(c.meta, c.ct) <= 6000);
  $('#sTag').hidden = !(c.own && c.own.tag);
  openSheet('shShare');
}
async function shareFile() {
  const c = capById(shareId); if (!c) return;
  const bytes = serialize(c.meta, c.ct), name = slug(c.meta.label) + '.gtch';
  if (IN_FRAME) { // l'aperçu n'accepte que certaines extensions : on enveloppe la cachette dans un .json
    offerFile(new Blob([JSON.stringify({ geotorche: 1, label: c.meta.label, data: b64enc(bytes) })], { type: 'application/json' }), slug(c.meta.label) + '.geotorche.json');
    return;
  }
  try {
    const file = new File([bytes], name, { type: 'application/octet-stream' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'GéoTorche : ' + c.meta.label, text: shareText(c.meta) }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  if (await offerFile(new Blob([bytes], { type: 'application/octet-stream' }), name)) toast('Fichier « ' + name + ' » enregistré dans Téléchargements. Dans WhatsApp : Joindre, puis Document.', 'good');
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); toast('Copié.', 'good'); }
  catch (e) { const ta = $('#sText'); ta.value = t; ta.select(); try { document.execCommand('copy'); toast('Copié.', 'good'); } catch (e2) { toast('Copie impossible ici : sélectionnez le texte à la main.'); } }
}
async function importBytes(bytes, quiet) {
  const { meta, ct } = parseCapsule(bytes);
  const old = await Store.get(meta.id);
  await Store.put({ id: meta.id, meta, ct, added: Date.now(), own: old ? old.own : null });
  await loadCaps(); if (!quiet) toast((old ? 'Cachette mise à jour : ' : 'Cachette importée : ') + meta.label, 'good');
  return meta;
}
async function importFiles(list) {
  let n = 0;
  for (const f of list) { try { await importBytes(new Uint8Array(await f.arrayBuffer()), list.length > 1); n++; } catch (e) { toast(f.name + ' : ' + e.message, 'bad'); } }
  if (list.length > 1 && n) toast(n + ' cachette(s) importée(s).', 'good');
  renderList();
}

/* ============================== Liste ============================== */
function renderList() {
  const el = $('#lList'), pos = Geo.cur;
  if (!S.caps.length) { el.innerHTML = '<div class="card empty">Aucune cachette.<br>Créez-en une dans l\'onglet Cacher, ou importez un fichier .gtch reçu.</div>'; renderJournal(); return; }
  el.innerHTML = S.caps.map(c => {
    const m = c.meta, P = m.place, b = [];
    b.push('<span class="badge a">' + (P.mode === 'secret' ? 'Lieu secret' : 'Coordonnées') + '</span>');
    if (m.look) b.push('<span class="badge">Photo</span>'); if (P.heading != null) b.push('<span class="badge">Direction</span>');
    if (m.tag) b.push('<span class="badge">Étiquette</span>'); if (m.pw) b.push('<span class="badge">Mot de passe</span>');
    if (m.opt && m.opt.burn) b.push('<span class="badge">Lecture unique</span>'); if (c.own) b.push('<span class="badge">Créée ici</span>');
    const d = pos ? fmtDist(distM(pos, P)) : '';
    return '<div class="card cap"><div class="top"><span class="name">' + esc(m.label) + '</span><span class="dist">' + d + '</span></div>' +
      (m.hint ? '<div class="small mute">Indice : ' + esc(m.hint) + '</div>' : '') +
      '<div class="badges">' + b.join('') + '</div>' +
      '<div class="small mute">' + esc(fmtDate(m.created)) + ' · ' + esc(fmtBytes(+m.size || 0)) + ' · ' + (P.mode === 'secret' ? 'zone ' : 'rayon ') + esc(Math.round(+P.radius)) + ' m</div>' +
      '<div class="acts"><button class="btn sm primary" data-act="seek" data-id="' + esc(c.id) + '">Chercher</button><button class="btn sm" data-act="share" data-id="' + esc(c.id) + '">Partager</button><button class="btn sm danger" data-act="del" data-id="' + esc(c.id) + '">Supprimer</button></div></div>';
  }).join('');
  renderJournal();
}
let delArm = null;
async function listAction(act, id) {
  if (act === 'seek') { S.activeId = id; LS.set('active', id); $('#target').value = id; show('torche'); }
  else if (act === 'share') openShare(id);
  else if (act === 'del') {
    if (delArm !== id) { delArm = id; toast('Touchez encore « Supprimer » pour confirmer.'); setTimeout(() => { if (delArm === id) delArm = null; }, 4000); return; }
    delArm = null; await Store.del(id); delete S.armed[id]; delete S.tags[id]; await loadCaps(); renderList(); toast('Cachette supprimée.');
  }
}

/* ============================== Cacher ============================== */
const H = { files: [], mode: 'visible', pos: null, sigs: [], thumbs: [], aim: null };
function renderHideFiles() {
  const ul = $('#hFileList'); let tot = 0;
  ul.innerHTML = H.files.map((f, i) => { tot += f.size; return '<li><span style="word-break:break-all">' + esc(f.name) + '</span><span class="mute">' + fmtBytes(f.size) + ' <button class="btn sm" data-rm="' + i + '" type="button">×</button></span></li>'; }).join('');
  if (tot > 25 * 1048576) ul.insertAdjacentHTML('beforeend', '<li class="mute small">Total ' + fmtBytes(tot) + ' : la cachette sera lourde à envoyer.</li>');
}
function setMode(mode) {
  H.mode = mode; $$('#hMode button').forEach(b => b.classList.toggle('on', b.dataset.m === mode));
  const r = $('#hRadius');
  if (mode === 'secret') {
    $('#hModeNote').textContent = 'Le destinataire ne reçoit qu\'une zone approximative. L\'endroit exact (à 20 m près) fait partie de la clé : la torche ne le reconnaît que sur place. Idéal pour un jeu de piste.';
    r.min = 100; r.max = 2000; r.step = 50; r.value = 300; $('#hRadiusNote').textContent = 'Taille de la zone donnée comme indice. L\'endroit exact reste secret.';
  } else {
    $('#hModeNote').textContent = 'Le destinataire reçoit les coordonnées et est guidé jusqu\'au lieu.';
    r.min = 5; r.max = 300; r.step = 5; r.value = 25; $('#hRadiusNote').textContent = 'En intérieur, le GPS se trompe souvent de 10 à 40 m : gardez au moins 25 m et ajoutez la photo ou l\'étiquette pour viser l\'objet précis.';
  }
  radiusLabel();
}
function radiusLabel() { $('#hRadiusL').firstChild.textContent = H.mode === 'secret' ? 'Taille de la zone indice : ' : 'Rayon d\'ouverture : '; $('#hRadiusV').textContent = fmtDist(+$('#hRadius').value); }
function showPos() {
  const p = H.pos; const o = $('#hPosOut');
  if (!p) { o.textContent = ''; return; }
  o.innerHTML = '<b class="ok">Lieu enregistré</b> : ' + p.lat.toFixed(6) + ', ' + p.lon.toFixed(6) + (p.acc ? ' (± ' + Math.round(p.acc) + ' m' + (p.n ? ', ' + p.n + (p.n > 1 ? ' mesures' : ' mesure') : '') + ')' : '') + (p.src ? ' · ' + esc(p.src) : '') + (p.sim ? ' · simulée' : '');
  if (p.sim) o.innerHTML += '<br>Attention : position simulée (mode test). La cachette sera placée à ce point fictif.';
  if (p.acc && p.acc > 30) o.innerHTML += '<br>Précision faible : rapprochez-vous d\'une fenêtre et mesurez à nouveau, ou augmentez le rayon.';
}
async function measureHere() {
  const btn = $('#hMeasure'); btn.disabled = true; const o = $('#hPosOut');
  try {
    const p = await Geo.measure(15000, (n, best, f) => { o.textContent = 'Mesure en cours… ' + Math.round(f * 100) + ' % (' + n + ' points, meilleure précision ' + (best < 999 ? '± ' + Math.round(best) + ' m' : 'en attente') + ')'; });
    H.pos = p; showPos();
    if (H.mode === 'visible' && p.acc > +$('#hRadius').value) { $('#hRadius').value = Math.min(300, Math.ceil(p.acc / 5) * 5); radiusLabel(); }
  } catch (e) { o.innerHTML = '<span class="bad">' + esc(e.message) + '</span>'; }
  finally { btn.disabled = false; }
}
function typedCoords() {
  try { const p = parseCoords($('#hCoords').value, Geo.cur); H.pos = { lat: p.lat, lon: p.lon, acc: null, src: p.src }; showPos(); $('#hTypeBox').hidden = true; }
  catch (e) { $('#hPosOut').innerHTML = '<span class="bad">' + esc(e.message) + '</span>'; }
}
function pwScore(pw) {
  if (!pw) return 0; let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26; if (/[A-Z]/.test(pw)) pool += 26; if (/\d/.test(pw)) pool += 10; if (/[^a-zA-Z0-9]/.test(pw)) pool += 20;
  let bits = pw.length * Math.log2(Math.max(pool, 2));
  if (/^(.)\1+$/.test(pw) || /^(1234|azerty|qwerty|password|motdepasse|0000)/i.test(pw)) bits = Math.min(bits, 10);
  if (/\s/.test(pw.trim()) && pw.trim().split(/\s+/).length >= 3) bits += 15;
  return bits;
}
function pwMeter() {
  const b = pwScore($('#hPw').value), bar = $('#hPwBar');
  const lv = b === 0 ? [0, '#2a2e37', 'Au moins 8 caractères. Une phrase de 3 ou 4 mots est idéale.'] : b < 35 ? [25, '#ff7a6b', 'Faible : facile à deviner.'] : b < 55 ? [55, '#ffb547', 'Moyen.'] : b < 75 ? [80, '#9bd36b', 'Bon.'] : [100, '#62d394', 'Fort.'];
  bar.style.width = lv[0] + '%'; bar.style.background = lv[1]; $('#hPwNote').textContent = lv[2];
}
function resetHide() {
  H.files = []; H.pos = null; H.sigs = []; H.thumbs = []; H.aim = null;
  ['#hNote', '#hLabel', '#hHint', '#hPw', '#hPw2', '#hCoords'].forEach(s => { $(s).value = ''; });
  $('#hFiles').value = ''; $('#hTag').checked = false; $('#hBurn').checked = false; $('#hThumbClue').checked = false;
  renderHideFiles(); showPos(); renderAim(); pwMeter(); $('#hErr').textContent = '';
}
async function doHide() {
  const err = $('#hErr'); err.textContent = '';
  const label = $('#hLabel').value.trim(), note = $('#hNote').value, pw = $('#hPw').value, tag = $('#hTag').checked;
  if (!H.files.length && !note.trim()) return (err.textContent = 'Ajoutez un fichier ou un message.');
  if (!label) return (err.textContent = 'Donnez un nom à la cachette.');
  if (!H.pos) return (err.textContent = 'Enregistrez le lieu : mesurez votre position ou saisissez des coordonnées.');
  if (H.mode === 'secret' && !H.pos.acc) return (err.textContent = 'Le lieu secret doit être mesuré sur place (bouton Mesurer ma position), pas saisi.');
  if (!pw && !tag) return (err.textContent = 'Choisissez un mot de passe (ou exigez l\'étiquette QR).');
  if (pw && pw.length < 8) return (err.textContent = 'Mot de passe trop court : 8 caractères au moins.');
  if (pw !== $('#hPw2').value) return (err.textContent = 'Les deux mots de passe ne sont pas identiques.');
  const total = H.files.reduce((s, f) => s + f.size, 0); if (total > 150 * 1048576) return (err.textContent = 'Fichiers trop lourds (150 Mo au plus).');
  busy('Chiffrement… quelques secondes.');
  try {
    const r = +$('#hRadius').value;
    const out = await buildCapsule({
      label, hint: $('#hHint').value.trim(), note, files: H.files, pw, tag, burn: $('#hBurn').checked,
      place: { mode: H.mode, lat: H.pos.lat, lon: H.pos.lon, acc: H.pos.acc, radius: r, zone: r },
      aim: H.aim, sigs: H.sigs, thumb: $('#hThumbClue').checked && H.thumbs[0] ? H.thumbs[0] : null
    });
    await Store.put({ id: out.meta.id, meta: out.meta, ct: out.ct, added: Date.now(), own: { tag: out.tagSecret || null } });
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { }
    await loadCaps(); unbusy(); resetHide(); showDone(out.meta.id);
  } catch (e) { unbusy(); err.textContent = 'Échec : ' + (e && e.message ? e.message : e); }
}
function showDone(id) {
  const c = capById(id), m = c.meta, P = m.place;
  $('#dBody').innerHTML = '<dl class="kv"><dt>Nom</dt><dd>' + esc(m.label) + '</dd><dt>Lieu</dt><dd>' + (P.mode === 'secret' ? 'secret, zone de ' + P.radius + ' m' : P.lat.toFixed(6) + ', ' + P.lon.toFixed(6) + ' (rayon ' + P.radius + ' m)') + '</dd>' +
    '<dt>Torche</dt><dd>' + (m.look ? m.look.sigs.length + ' photo(s)' : 'sans photo') + (P.heading != null ? ', direction ' + P.heading + '°' : '') + '</dd><dt>Serrures</dt><dd>' + [m.pw ? 'mot de passe' : '', m.tag ? 'étiquette QR' : '', P.mode === 'secret' ? 'lieu dans la clé' : ''].filter(Boolean).join(', ') + '</dd><dt>Taille</dt><dd>' + fmtBytes(capsuleSize(m, c.ct)) + '</dd></dl>' +
    (m.tag ? '<p class="note"><b>Étape suivante :</b> imprimez l\'étiquette et collez-la sur l\'objet.</p><button class="btn" type="button" id="dTag" style="width:100%;margin-top:6px">Afficher l\'étiquette QR</button>' : '');
  openSheet('shDone');
  const t = $('#dTag'); if (t) t.onclick = () => showTag(id);
  $('#dShare').onclick = () => openShare(id);
  $('#dSeek').onclick = () => { closeSheets(); listAction('seek', id); };
}
function showTag(id) {
  const c = capById(id); if (!c || !c.own || !c.own.tag) { toast('Étiquette introuvable sur ce téléphone.'); return; }
  const text = 'GT1:' + c.id + ':' + c.own.tag;
  $('#tQr').innerHTML = QR.svg(text) + '<div class="cap">' + esc(c.meta.label) + '</div>';
  $('#tSave').onclick = async () => { const d = QR.pngDataURL(text, c.meta.label).split(',')[1]; const blob = new Blob([b64dec(d)], { type: 'image/png' }); offerFile(blob, 'etiquette-' + slug(c.meta.label) + '.png', () => toast('Faites une capture d\'écran de l\'étiquette.')); };
  openSheet('shTag');
}

/* --- viseur : photos de l'objet et direction --- */
const AIM = { heads: [], pitches: [], sigs: [], thumbs: [] };
async function openViseur() {
  AIM.heads = []; AIM.pitches = []; AIM.sigs = H.sigs.slice(); AIM.thumbs = H.thumbs.slice();
  $('#viseur').hidden = false; viseurLabel();
  Geo.start(); await Compass.start();
  try { await Cam.start($('#vVid')); if ($('#viseur').hidden) { Cam.stop(); return; } sizeRing(); $('#vTop').textContent = 'Cadrez l\'objet dans le cercle, depuis l\'endroit où la personne se tiendra. Variez un peu l\'angle entre les photos.'; $('#vShot').disabled = false; }
  catch (e) { if (e && e.name === 'Cancelled') return; $('#vTop').textContent = 'Caméra indisponible ici : utilisez « Choisir une photo » (cadrez l\'objet au centre).'; $('#vShot').disabled = true; }
}
function sizeRing() {
  const v = $('#vVid'), r = v.getBoundingClientRect(); const vw = v.videoWidth, vh = v.videoHeight; if (!vw) return;
  const sc = Math.max(r.width / vw, r.height / vh), d = Vision.REF_FRAC * Math.min(vw, vh) * sc;
  const ring = $('#vRing'); ring.style.width = ring.style.height = d + 'px';
}
function viseurLabel() {
  const n = AIM.sigs.length; $('#vShot').textContent = n >= 3 ? '3 photos prises' : 'Prendre la photo ' + (n + 1) + ' sur 3';
  $('#vShot').disabled = n >= 3 || !Cam.stream; $('#vDone').textContent = n ? 'Terminer (' + n + ')' : 'Terminer';
}
function snapAim() { const h = Compass.value; if (h != null) AIM.heads.push(h); if (Compass.pitch != null && Compass.live) AIM.pitches.push(Compass.pitch); }
function viseurShot() {
  const v = $('#vVid'); if (!v.videoWidth || AIM.sigs.length >= 3) return;
  AIM.sigs.push(Vision.grab(v, v.videoWidth, v.videoHeight, Vision.REF_FRAC)); AIM.thumbs.push(Vision.thumb(v, v.videoWidth, v.videoHeight));
  snapAim(); vibrate(30); viseurLabel(); toast('Photo ' + AIM.sigs.length + ' enregistrée.');
}
async function viseurPick(file) {
  if (!file) return; const img = new Image(); const url = URL.createObjectURL(file);
  try { await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; }); }
  catch (e) { toast('Image illisible.', 'bad'); return; }
  if (AIM.sigs.length >= 3) AIM.sigs.shift(), AIM.thumbs.shift();
  AIM.sigs.push(Vision.grab(img, img.naturalWidth, img.naturalHeight, Vision.REF_FRAC)); AIM.thumbs.push(Vision.thumb(img, img.naturalWidth, img.naturalHeight));
  snapAim(); URL.revokeObjectURL(url); viseurLabel(); toast('Photo ' + AIM.sigs.length + ' enregistrée.');
}
function circMean(arr) { let s = 0, c = 0; for (const a of arr) { s += Math.sin(a * DEG); c += Math.cos(a * DEG); } return (Math.atan2(s, c) / DEG + 360) % 360; }
function viseurDone(dirOnly) {
  if (dirOnly) { const h = Compass.value; if (h == null) { toast('Boussole indisponible.'); return; } AIM.heads = [h]; if (Compass.pitch != null && Compass.live) AIM.pitches = [Compass.pitch]; }
  H.sigs = AIM.sigs.slice(); H.thumbs = AIM.thumbs.slice();
  if (AIM.heads.length) H.aim = { heading: circMean(AIM.heads), pitch: AIM.pitches.length ? AIM.pitches.reduce((a, b) => a + b, 0) / AIM.pitches.length : null };
  closeViseur(); renderAim();
}
function closeViseur() { Cam.stop(); $('#vVid').srcObject = null; $('#viseur').hidden = true; }
function renderAim() {
  $('#hThumbs').innerHTML = H.thumbs.map(t => '<img alt="" src="' + t + '">').join('');
  $('#hThumbClueL').hidden = !H.thumbs.length;
  const parts = []; if (H.sigs.length) parts.push(H.sigs.length + ' photo(s) de l\'objet'); if (H.aim) parts.push('direction ' + Math.round(H.aim.heading) + '° (' + cardinal(H.aim.heading) + ')');
  $('#hAimOut').innerHTML = parts.length ? '<b class="ok">Torche réglée</b> : ' + parts.join(', ') + ' <button class="btn sm" type="button" id="hAimClear">Effacer</button>' : '';
  const b = $('#hAimClear'); if (b) b.onclick = () => { H.sigs = []; H.thumbs = []; H.aim = null; renderAim(); };
}

/* ============================== Mode test ============================== */
function openSim() {
  const p = Geo.cur; $('#simC').value = p ? p.lat.toFixed(6) + ', ' + p.lon.toFixed(6) : '';
  $('#simH').value = Compass.sim == null ? -1 : Compass.sim; simHLabel(); openSheet('shSim');
}
function simHLabel() { const v = +$('#simH').value; $('#simHV').textContent = v < 0 ? 'non (vraie boussole)' : v + '° (' + cardinal(v) + ')'; }
function simOnTarget(away) {
  const c = currentTarget(); if (!c) { toast('Aucune cachette.'); return; }
  const P = c.meta.place;
  if (P.mode === 'secret' && c.own == null && !away) toast('Lieu secret : seule la zone est connue, à vous de trouver l\'endroit.');
  const p = away ? offsetM(P.lat, P.lon, 120 + P.radius, Math.random() * 2 * Math.PI) : offsetM(P.lat, P.lon, Math.random() * Math.min(4, P.radius / 3), Math.random() * 2 * Math.PI);
  Geo.setSim(p.lat, p.lon, 6); $('#simC').value = p.lat.toFixed(6) + ', ' + p.lon.toFixed(6);
  if (P.heading != null && !away && Compass.value == null) { Compass.sim = P.heading; $('#simH').value = P.heading; simHLabel(); }
}

/* Cachette d'essai : pour voir tout le parcours en une minute, même sans capteurs. */
async function makeDemo() {
  let p = Geo.cur;
  if (!p) { Geo.setSim(48.858370, 2.294481, 6); p = Geo.cur; toast('Position simulée : pas de GPS ici.'); }
  const c = document.createElement('canvas'); c.width = 640; c.height = 420; const x = c.getContext('2d');
  const g = x.createRadialGradient(320, 200, 20, 320, 200, 380); g.addColorStop(0, '#3a2a10'); g.addColorStop(1, '#0c0d10');
  x.fillStyle = g; x.fillRect(0, 0, 640, 420); x.fillStyle = '#ffb547'; x.font = '700 64px system-ui, sans-serif'; x.textAlign = 'center';
  x.fillText('Bravo !', 320, 190); x.font = '28px system-ui, sans-serif'; x.fillStyle = '#eeece6'; x.fillText('Vous avez trouvé la cachette d\'essai.', 320, 250);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  busy('Création de la cachette d\'essai…');
  try {
    const out = await buildCapsule({ label: 'Cachette d\'essai', hint: 'Juste là où vous êtes', note: 'Ceci est une cachette d\'essai.\nMot de passe : essai1234', files: [new File([blob], 'bravo.png', { type: 'image/png' })], pw: 'essai1234', tag: false, place: { mode: 'visible', lat: p.lat, lon: p.lon, acc: p.acc, radius: 30 } });
    await Store.put({ id: out.meta.id, meta: out.meta, ct: out.ct, added: Date.now(), own: { tag: null } });
    await loadCaps(); S.activeId = out.meta.id; LS.set('active', out.meta.id); renderTargets();
  } finally { unbusy(); }
  closeSheets(); show('torche'); toast('Cachette d\'essai créée. Touchez l\'icône, mot de passe : essai1234', 'good');
}

/* ============================== Démarrage ============================== */
function bind() {
  $$('nav.tabs button').forEach(b => b.addEventListener('click', () => show(b.dataset.view)));
  $('#backdrop').addEventListener('click', () => { if (S.viewing) closeViewer(); else closeSheets(); });
  $$('[data-close]').forEach(b => b.addEventListener('click', closeSheets));
  $('#pGps').addEventListener('click', () => {
    if (Geo.sim) { openSim(); return; }
    if (Geo.state === 'off') { Geo.state = 'idle'; Geo.start(); setTimeout(() => { if (Geo.state === 'off') { toast('Position toujours refusée : autorisez-la dans les réglages du navigateur, ou utilisez le mode test.'); openSim(); } }, 1800); return; }
    Geo.start();
  });
  $('#btnSim').addEventListener('click', openSim); $('#aSim').addEventListener('click', openSim);
  $('#target').addEventListener('change', e => { S.activeId = e.target.value; LS.set('active', S.activeId); lastHint = ''; });
  $('#btnTorch').addEventListener('click', () => (S.torchOn ? torchOff() : torchOn()));
  $('#iRetry').addEventListener('click', () => { closeSheets(); torchOn(); });
  $('#iPhoto').addEventListener('click', () => { closeSheets(); $('#photoIn').click(); });
  $('#btnPhoto').addEventListener('click', () => $('#photoIn').click());
  $('#photoIn').addEventListener('change', e => { photoLight(e.target.files[0]); e.target.value = ''; });
  $('#btnLamp').addEventListener('click', async () => { const ok = await Cam.setLamp(!Cam.lamp); $('#btnLamp').textContent = Cam.lamp ? 'Lampe allumée' : 'Lampe'; if (!ok) toast('Lampe non disponible.'); });
  $('#fx').addEventListener('click', e => {
    const r = e.currentTarget.getBoundingClientRect(), x = (e.clientX - r.left) * fx.dpr, y = (e.clientY - r.top) * fx.dpr;
    const hit = S.icons.find(i => Math.hypot(i.x - x, i.y - y) <= i.r * 1.4);
    if (hit) { const c = capById(hit.id); if (c.meta.place.mode === 'secret' && S.armed[hit.id] && S.armed[hit.id].dek) openPayload(c, S.armed[hit.id].dek, 'lieu secret'); else openUnlock(hit.id); }
  });
  $('#uGo').addEventListener('click', doUnlock);
  $('#uPw').addEventListener('keydown', e => { if (e.key === 'Enter') doUnlock(); });
  $('#vClose').addEventListener('click', closeViewer);
  // cacher
  $('#hFilesBtn').addEventListener('click', () => $('#hFiles').click());
  $('#hFiles').addEventListener('change', e => { H.files = H.files.concat(Array.from(e.target.files)); e.target.value = ''; renderHideFiles(); if (!$('#hLabel').value && H.files[0]) $('#hLabel').value = H.files[0].name.replace(/\.[^.]+$/, '').slice(0, 80); });
  $('#hFileList').addEventListener('click', e => { const i = e.target.dataset.rm; if (i != null) { H.files.splice(+i, 1); renderHideFiles(); } });
  $$('#hMode button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.m)));
  $('#hRadius').addEventListener('input', radiusLabel);
  $('#hMeasure').addEventListener('click', measureHere);
  $('#hTypeBtn').addEventListener('click', () => { $('#hTypeBox').hidden = !$('#hTypeBox').hidden; if (!$('#hTypeBox').hidden) $('#hCoords').focus(); });
  $('#hCoordsOk').addEventListener('click', typedCoords);
  $('#hCoords').addEventListener('keydown', e => { if (e.key === 'Enter') typedCoords(); });
  $('#hPw').addEventListener('input', pwMeter);
  $('#hShowPw').addEventListener('change', e => { $('#hPw').type = $('#hPw2').type = e.target.checked ? 'text' : 'password'; });
  $('#hAim').addEventListener('click', openViseur);
  $('#hGo').addEventListener('click', doHide);
  $('#vShot').addEventListener('click', viseurShot);
  $('#vPick').addEventListener('click', () => $('#vPickIn').click());
  $('#vPickIn').addEventListener('change', e => { viseurPick(e.target.files[0]); e.target.value = ''; });
  $('#vDirOnly').addEventListener('click', () => viseurDone(true));
  $('#vDone').addEventListener('click', () => viseurDone(false));
  $('#vCancel').addEventListener('click', closeViseur);
  // liste
  $('#lImportBtn').addEventListener('click', () => $('#lImport').click());
  $('#lImport').addEventListener('change', e => { importFiles(Array.from(e.target.files)); e.target.value = ''; });
  $('#lList').addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) listAction(b.dataset.act, b.dataset.id); });
  $('#jCsv').addEventListener('click', exportJournal);
  $('#jClear').addEventListener('click', async () => { if (!confirmTwice('journal')) return; await Store.kvSet('journal', []); renderJournal(); });
  // partage
  $('#sFile').addEventListener('click', shareFile);
  $('#sCopy').addEventListener('click', () => copyText($('#sText').value));
  $('#sLink').addEventListener('click', () => { const c = capById(shareId); if (c) copyText(location.origin + location.pathname + '#c=' + b64url(serialize(c.meta, c.ct))); });
  $('#sTag').addEventListener('click', () => showTag(shareId));
  // test
  $('#simSet').addEventListener('click', () => { try { const p = parseCoords($('#simC').value, Geo.cur); Geo.setSim(p.lat, p.lon, 6); toast('Position simulée placée.'); } catch (e) { toast(e.message, 'bad'); } });
  $('#simOnTarget').addEventListener('click', () => simOnTarget(false));
  $('#simDemo').addEventListener('click', makeDemo);
  $('#simAway').addEventListener('click', () => simOnTarget(true));
  $('#simH').addEventListener('input', () => { const v = +$('#simH').value; Compass.sim = v < 0 ? null : v; simHLabel(); updatePills(); });
  $('#simOff').addEventListener('click', () => { Geo.clearSim(); Compass.sim = null; $('#simH').value = -1; simHLabel(); updatePills(); blockedShown = false; $('#demoBanner').hidden = true; toast('Capteurs réels.'); closeSheets(); });
  window.addEventListener('resize', () => { resizeStage(); if (!$('#viseur').hidden) sizeRing(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && S.torchOn) torchOff(); });
  Geo.listeners.add(() => { if (S.view === 'liste') { clearTimeout(bind.lt); bind.lt = setTimeout(renderList, 1500); } });
}
const confirmArm = {};
function confirmTwice(k) { if (confirmArm[k]) { delete confirmArm[k]; return true; } confirmArm[k] = 1; toast('Touchez encore pour confirmer.'); setTimeout(() => delete confirmArm[k], 4000); return false; }

async function init() {
  bind(); setMode('visible'); renderAim(); pwMeter();
  $('#ver').textContent = APP_VERSION;
  $('#envInfo').textContent = 'Cet écran : ' + (HOSTED ? 'adresse sécurisée, capteurs autorisables.' : IN_FRAME ? 'aperçu intégré, capteurs bloqués (mode test seulement).' : (window.isSecureContext ? 'contexte local.' : 'adresse non sécurisée : caméra et GPS refusés.'));
  LS.del('sim');
  await loadCaps();
  if (!(await Store.persistent())) toast('Stockage indisponible ici : les cachettes seront perdues à la fermeture.', 'bad');
  if (location.hash.startsWith('#c=')) {
    try { const meta = await importBytes(unb64url(location.hash.slice(3))); S.activeId = meta.id; renderTargets(); $('#target').value = meta.id; } catch (e) { toast('Lien de cachette illisible.', 'bad'); }
    try { history.replaceState(null, '', location.pathname); } catch (e) { }
  }
  if (IN_FRAME || !window.isSecureContext) sensorsBlocked();
  else if (navigator.permissions && navigator.permissions.query) { try { const st = await navigator.permissions.query({ name: 'geolocation' }); if (st.state === 'granted') Geo.start(); } catch (e) { } }
  updatePills(); resizeStage(); requestAnimationFrame(loop);
  if (HOSTED && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
  if (HOSTED) { const l = document.createElement('link'); l.rel = 'manifest'; l.href = 'manifest.webmanifest'; document.head.appendChild(l); }
}
window.GT = { parseCoords, Plus, Crypt, Cells, Vision, QR, buildCapsule, unwrapVisible, tryCells, openWithDek, serialize, parseCapsule, importBytes, Store, Geo, Compass, S, evaluate, loadCaps, capById };
init();
