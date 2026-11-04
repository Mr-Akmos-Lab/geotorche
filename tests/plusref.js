const { OpenLocationCode } = require('/home/claude/vendor/node_modules/open-location-code/openlocationcode.js');
const o = new OpenLocationCode();
const pts = [[7.18765, 2.06321], [6.36536, 2.41833], [47.365590, 8.524997], [-33.8688, 151.2093], [0.0001, -0.0001], [12.5, -1.5], [9.3077, 2.3158], [6.9302, 2.0726]];
const out = [];
for (const [la, lo] of pts) {
  const full = o.encode(la, lo), full11 = o.encode(la, lo, 11);
  const d = o.decode(full), d11 = o.decode(full11);
  const short = o.shorten(full, la + 0.01, lo - 0.01);
  const rec = o.recoverNearest(short, la + 0.02, lo + 0.015);
  const dr = o.decode(rec);
  out.push({ la, lo, full, full11, c: [d.latitudeCenter, d.longitudeCenter], c11: [d11.latitudeCenter, d11.longitudeCenter], short, recRef: [la + 0.02, lo + 0.015], rec: [dr.latitudeCenter, dr.longitudeCenter] });
}
console.log(JSON.stringify(out));
