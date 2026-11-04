#!/usr/bin/env python3
"""Assemble GéoTorche : un seul index.html autonome + fichiers PWA."""
import json, pathlib, zipfile
from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).parent
SRC, DIST = ROOT / "src", ROOT / "dist"
DIST.mkdir(exist_ok=True)

css = (SRC / "style.css").read_text(encoding="utf-8")
body = (SRC / "body.html").read_text(encoding="utf-8")
app = (SRC / "app.js").read_text(encoding="utf-8")
jsqr = (SRC / "jsqr.min.js").read_text(encoding="utf-8")
qrgen = (SRC / "qrcode.min.js").read_text(encoding="utf-8")

html = f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0c0d10">
<meta name="description" content="GéoTorche : cachez un fichier dans un lieu réel. Il ne s'ouvre que sur place, éclairé par la torche, avec le mot de passe.">
<meta name="apple-mobile-web-app-capable" content="yes">
<link rel="icon" type="image/png" href="icon-192.png">
<link rel="apple-touch-icon" href="icon-192.png">
<title>GéoTorche</title>
<style>
{css}
</style>
</head>
<body>
{body}
<script>/* jsQR 1.4.0, Apache-2.0, https://github.com/cozmo/jsQR */
{jsqr}
</script>
<script>/* qrcode-generator 2.0.4, MIT, Kazuhiko Arase */
{qrgen}
</script>
<script>
{app}
</script>
</body>
</html>
"""
CSP = ("default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; "
       "img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self'; worker-src 'self'; "
       "object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'")
(DIST / "artifact.html").write_text(html, encoding="utf-8")
html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="' + CSP + '">', 1)
html = html.replace('<link rel="icon"', '<link rel="manifest" href="manifest.webmanifest">\n<link rel="icon"', 1)
(DIST / "index.html").write_text(html, encoding="utf-8")

# Icônes : carré sombre, faisceau ambre, fichier au centre
def icon(n):
    im = Image.new("RGBA", (n, n), (12, 13, 16, 255))
    d = ImageDraw.Draw(im)
    for i in range(40, 0, -1):
        a = int(70 * (1 - i / 40) ** 1.6)
        r = n * 0.43 * i / 40
        d.ellipse([n / 2 - r, n * 0.5 - r, n / 2 + r, n * 0.5 + r], fill=(255, 181, 71, a))
    w, h = n * 0.3, n * 0.37
    l, t = n / 2 - w / 2, n * 0.5 - h / 2
    f = w * 0.3
    d.polygon([(l, t), (l + w - f, t), (l + w, t + f), (l + w, t + h), (l, t + h)], fill=(255, 181, 71, 255))
    d.polygon([(l + w - f, t), (l + w - f, t + f), (l + w, t + f)], fill=(201, 132, 32, 255))
    for k in range(3):
        y = t + h * (0.45 + k * 0.16)
        d.line([(l + w * 0.18, y), (l + w * (0.82 if k < 2 else 0.6), y)], fill=(27, 19, 5, 255), width=max(2, n // 40))
    return im

for n in (192, 512):
    icon(n).save(DIST / f"icon-{n}.png")

manifest = {
    "name": "GéoTorche", "short_name": "GéoTorche", "lang": "fr",
    "description": "Des fichiers cachés dans le monde réel, révélés par la torche.",
    "start_url": "./", "scope": "./", "display": "standalone", "orientation": "portrait",
    "background_color": "#0c0d10", "theme_color": "#0c0d10",
    "icons": [{"src": "icon-192.png", "sizes": "192x192", "type": "image/png"},
              {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"}],
    "share_target": {
        "action": "./partage", "method": "POST", "enctype": "multipart/form-data",
        "params": {"title": "title", "text": "text",
                   "files": [{"name": "capsule", "accept": ["text/plain", ".txt", ".gtch", ".json", "application/json", "application/octet-stream"]}]}
    },
}
(DIST / "manifest.webmanifest").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")

sw = """// GéoTorche : fonctionnement hors connexion
const C = 'geotorche-v3';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C && x !== 'geotorche-partage').map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  // « Partager > GéoTorche » depuis WhatsApp : on garde le fichier reçu, puis on ouvre l'application
  if (e.request.method === 'POST' && u.origin === location.origin && u.pathname.endsWith('/partage')) {
    e.respondWith((async () => {
      try {
        const fd = await e.request.formData();
        const cache = await caches.open('geotorche-partage');
        let i = 0;
        for (const f of fd.getAll('capsule')) if (f && typeof f !== 'string') await cache.put(new URL('partage-recu-' + Date.now() + '-' + (i++), self.registration.scope).href, new Response(f));
      } catch (err) { /* rien reçu */ }
      return Response.redirect(new URL('./?partage=1', self.registration.scope).href, 303);
    })());
    return;
  }
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(C).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html'))));
});
"""
(DIST / "sw.js").write_text(sw, encoding="utf-8")

with zipfile.ZipFile(ROOT / "GeoTorche.zip", "w", zipfile.ZIP_DEFLATED) as z:
    for name in ("index.html", "manifest.webmanifest", "sw.js", "icon-192.png", "icon-512.png"):
        z.write(DIST / name, name)
print("ok", (DIST / "index.html").stat().st_size, "octets")
