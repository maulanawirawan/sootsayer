// Packs the real data the video draws, from the app's own data packs
// (web/public/data) and Natural Earth land (public domain), into
// video/public/data/. Nothing here is invented: every point, line and number
// in the 3D cold open comes from these files.
//   node scripts/prepare-data.mjs [path/to/ne_50m_land.geojson]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const out = path.resolve(here, '..', 'public', 'data');
fs.mkdirSync(out, { recursive: true });
const read = (...p) => JSON.parse(fs.readFileSync(path.join(...p), 'utf8'));
const data = (region, file) => read(repo, 'web', 'public', 'data', region, file);

const BOX = { w: 86, e: 140, s: -16, n: 26 };
const q = (v) => Math.round(v * 100) / 100;

/** Flatten rings to [lon, lat, ...] arrays, dropping points closer than `tol` degrees. */
function rings(geometry, tol) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  const outRings = [];
  for (const poly of polys) {
    for (const ring of poly) {
      const flat = [];
      let px = 1e9;
      let py = 1e9;
      for (const [x, y] of ring) {
        if (Math.abs(x - px) < tol && Math.abs(y - py) < tol) continue;
        flat.push(q(x), q(y));
        px = x;
        py = y;
      }
      if (flat.length >= 8) outRings.push(flat);
    }
  }
  return outRings;
}

// 1. Natural Earth land, clipped to the box around Southeast Asia
const nePath = process.argv[2] || path.join(process.env.TEMP || '', 'sootsayer-video', 'ne', 'ne_50m_land.geojson');
const ne = JSON.parse(fs.readFileSync(nePath, 'utf8'));
const land = [];
for (const f of ne.features) {
  for (const r of rings(f.geometry, 0.04)) {
    let inBox = false;
    for (let i = 0; i < r.length; i += 2) if (r[i] > BOX.w && r[i] < BOX.e && r[i + 1] > BOX.s && r[i + 1] < BOX.n) inBox = true;
    if (inBox) land.push(r);
  }
}

// 1b. All land, coarser, for the globe's land mask (drawn into a canvas at render time)
const world = [];
for (const f of ne.features) world.push(...rings(f.geometry, 0.2));

// 2. District boundaries of both regions
const districts = [];
for (const region of ['kalimantan', 'sumatra']) {
  for (const f of data(region, 'districts.geojson').features) districts.push(...rings(f.geometry, 0.01));
}

// 3. Fire detections (FIRMS VIIRS NOAA-20) of both replays: lon, lat, day index, FRP
const days = data('kalimantan', 'replay-2026-10.json').days;
const fireRows = [];
const perDay = { kalimantan: new Array(days.length).fill(0), sumatra: new Array(days.length).fill(0) };
for (const region of ['kalimantan', 'sumatra']) {
  const f = data(region, 'replay-2026-10-fires.json');
  if (f.days.join() !== days.join()) throw new Error(`${region}: fire days differ from the replay days`);
  for (const [lon, lat, day, frp] of f.rows) {
    fireRows.push(lon, lat, day, frp ?? 0);
    perDay[region][day] += 1;
  }
}
fs.writeFileSync(path.join(out, 'fires.bin'), Buffer.from(new Float32Array(fireRows).buffer));

// 4. CAMS PM2.5 daily means per grid cell (hindsight replay), both regions
const smoke = [];
for (const region of ['kalimantan', 'sumatra']) {
  const grid = data(region, 'grid.json');
  const rep = data(region, 'replay-2026-10.json');
  grid.cells.forEach(([lon, lat], c) => smoke.push({ lon, lat, pm25: rep.cams.pm25_ugm3[c].map((v) => (v === null ? -1 : Math.round(v))) }));
}

// 5. Puskesmas (OpenStreetMap) of both regions
const puskesmas = [];
for (const region of ['kalimantan', 'sumatra']) for (const p of data(region, 'puskesmas.json')) puskesmas.push([q(p.lon), q(p.lat)]);

const i14 = days.indexOf('2026-10-14');
const facts = {
  days,
  firesKalimantan14Oct: perDay.kalimantan[i14],
  firesTotal: { kalimantan: perDay.kalimantan.reduce((a, b) => a + b, 0), sumatra: perDay.sumatra.reduce((a, b) => a + b, 0) },
  perDay,
  puskesmas: { kalimantan: data('kalimantan', 'puskesmas.json').length, sumatra: data('sumatra', 'puskesmas.json').length },
  districts: { kalimantan: data('kalimantan', 'districts.geojson').features.length, sumatra: data('sumatra', 'districts.geojson').features.length },
};
fs.writeFileSync(path.join(out, 'scene.json'), JSON.stringify({ land, world, districts, smoke, puskesmas, facts }));
console.log(
  `land rings ${land.length}, district rings ${districts.length}, fires ${fireRows.length / 4}, smoke cells ${smoke.length}, puskesmas ${puskesmas.length}; ` +
    `14 Oct Kalimantan fires ${facts.firesKalimantan14Oct}; totals ${JSON.stringify(facts.firesTotal)}`,
);
