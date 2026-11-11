// Requirement 4.3: the agent tool (native CLI) and the web app (WebAssembly)
// must give identical output for identical input. For every region with an
// October 2026 replay, this builds one real input, runs the outlook and the
// briefing (both languages) through both faces, and compares the bytes.
//
//   node web/scripts/check-parity.mjs [YYYY-MM-DD]
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dataDir = path.join(repo, 'web', 'public', 'data');
const read = (...p) => JSON.parse(readFileSync(path.join(dataDir, ...p), 'utf8'));
const day = process.argv[2] ?? '2026-10-15';

const wasm = await WebAssembly.instantiate(readFileSync(path.join(repo, 'web', 'src', 'wasm', 'sootsayer_engine.wasm')), {});
const ex = wasm.instance.exports;
function viaWasm(entry, json) {
  const bytes = new TextEncoder().encode(json);
  const ptr = ex.ss_alloc(bytes.length);
  new Uint8Array(ex.memory.buffer, ptr, bytes.length).set(bytes);
  const res = ex[entry](ptr, bytes.length);
  const len = new DataView(ex.memory.buffer).getUint32(res, true);
  const out = new TextDecoder().decode(new Uint8Array(ex.memory.buffer, res + 4, len));
  ex.ss_free(res, len + 4);
  ex.ss_free(ptr, bytes.length);
  return out;
}

const exe = path.join(repo, 'engine', 'target', 'release', process.platform === 'win32' ? 'sootsayer.exe' : 'sootsayer');
if (!existsSync(exe)) throw new Error('build the CLI first: cargo build --release --manifest-path engine/Cargo.toml');
function viaCli(command, json) {
  const cli = spawnSync(exe, [command], { input: json, maxBuffer: 64 * 1024 * 1024 });
  return cli.stdout.toString('utf8').trim();
}

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
let failed = false;
function compare(label, entry, command, payload) {
  const json = JSON.stringify(payload);
  const a = viaWasm(entry, json);
  const b = viaCli(command, json);
  const ok = a === b && a.startsWith('{"ok":true');
  console.log(`${ok ? 'identical' : 'MISMATCH '}  ${label.padEnd(30)} wasm ${sha(a)} cli ${sha(b)} ${a.length} bytes`);
  if (!ok) failed = true;
}

const { regions } = read('regions.json');
for (const region of regions.filter((r) => r.replay)) {
  const replay = read(region.id, region.replay.file);
  const districts = read(region.id, 'districts.geojson').features;
  const puskesmas = read(region.id, 'puskesmas.json');
  // With FIRMS data in the replay, fire-haze days are exercised too.
  const counts = replay.fires?.available ? replay.fires.district_counts ?? null : null;
  const at = replay.days.indexOf(day);
  if (at < 0) throw new Error(`${day} is not in the ${region.id} replay`);
  const days = replay.days.slice(0, Math.min(at + 4, replay.days.length - 1) + 1);
  const pm10 = replay.cams.pm10_ugm3;
  const input = {
    days,
    window_start: day,
    districts: districts.map((f) => ({
      code: f.properties.code,
      name: f.properties.name,
      profile: f.properties.profile,
      // Same plain mean as web/src/data.ts and pipeline/sootsayer_pipeline/engine.py.
      pm10_ugm3: days.map((_, d) => {
        let sum = 0;
        let n = 0;
        for (const c of f.properties.cells) {
          const v = pm10[c][d];
          if (v !== null) {
            sum += v;
            n += 1;
          }
        }
        return n ? sum / n : null;
      }),
      fire_count: days.map((_, d) => (counts ? (counts[f.properties.code]?.[d] ?? null) : null)),
    })),
    puskesmas: puskesmas.map((p) => ({ id: p.id, name: p.name, district_code: p.district_code, baseline_visits_per_day: null })),
  };
  console.log(`${region.id}: ${days.length} days, ${input.districts.length} districts, ${input.puskesmas.length} puskesmas, window ${day}`);
  compare(`${region.id} outlook`, 'ss_outlook', 'outlook', input);
  for (const lang of ['id', 'en']) {
    compare(`${region.id} brief (${lang})`, 'ss_brief', 'brief', {
      outlook: input,
      lang,
      region_name: region.name,
      mode: 'replay',
      data_times: [{ source: counts ? 'Copernicus CAMS + NASA FIRMS' : 'Copernicus CAMS', time: replay.generated_at }],
      top: 5,
      link: `https://sootsayer.vercel.app/?region=${region.id}&mode=replay&date=${day}`,
    });
  }
}
// Forecast check: WASM == CLI, and both equal the table the Python pipeline
// stored (so the JS and Python input builders agree too).
const meanOf = (cellIdx, value) => {
  let sum = 0;
  let n = 0;
  for (const c of cellIdx) {
    const v = value(c);
    if (v !== null && v !== undefined) {
      sum += v;
      n += 1;
    }
  }
  return n ? sum / n : null;
};
for (const region of regions.filter((r) => r.replay?.forecast)) {
  const fc = read(region.id, region.replay.forecast.file);
  const replay = read(region.id, region.replay.file);
  const districts = read(region.id, 'districts.geojson').features;
  const pairs = [];
  fc.issue_dates.forEach((start, i) => {
    for (let k = 0; k < fc.lead_days; k++) {
      const d = new Date(`${start}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + k);
      const di = replay.days.indexOf(d.toISOString().slice(0, 10));
      for (const f of districts) {
        const cells = f.properties.cells;
        const forecast = meanOf(cells, (c) => fc.pm10_ugm3[i][k][c]);
        const hindsight = di < 0 ? null : meanOf(cells, (c) => replay.cams.pm10_ugm3[c][di]);
        pairs.push([k, forecast, hindsight]);
      }
    }
  });
  const payload = { lead_days: fc.lead_days, pairs };
  compare(`${region.id} forecast check`, 'ss_forecast_check', 'forecast-check', payload);
  const fromWasm = JSON.parse(viaWasm('ss_forecast_check', JSON.stringify(payload))).result;
  const same = JSON.stringify(fromWasm) === JSON.stringify(fc.check);
  console.log(`${same ? 'identical' : 'MISMATCH '}  ${`${region.id} check vs pipeline`.padEnd(30)} ${pairs.length} pairs`);
  if (!same) failed = true;
}
if (failed) {
  console.error('MISMATCH between WebAssembly and native CLI output');
  process.exit(1);
}
