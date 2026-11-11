// Requirement 4.3: the agent tool (native CLI) and the web app (WebAssembly)
// must give identical numbers for identical input. This builds one real input
// from the October 2026 replay, runs it through both, and compares the bytes.
//
//   node web/scripts/check-parity.mjs [YYYY-MM-DD]
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const data = (f) => JSON.parse(readFileSync(path.join(repo, 'web', 'public', 'data', f), 'utf8'));
const day = process.argv[2] ?? '2026-10-15';

const replay = data('replay-2026-10.json');
const districts = data('districts.geojson').features;
const puskesmas = data('puskesmas.json');
// With FIRMS data in the replay, fire-haze days are exercised too.
const counts = replay.fires?.available ? replay.fires.district_counts ?? null : null;

const end = Math.min(replay.days.indexOf(day) + 4, replay.days.length - 1);
if (replay.days.indexOf(day) < 0) throw new Error(`${day} is not in the replay`);
const days = replay.days.slice(0, end + 1);
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
const json = JSON.stringify(input);

// WebAssembly
const wasm = await WebAssembly.instantiate(readFileSync(path.join(repo, 'web', 'src', 'wasm', 'sootsayer_engine.wasm')), {});
const ex = wasm.instance.exports;
const bytes = new TextEncoder().encode(json);
const ptr = ex.ss_alloc(bytes.length);
new Uint8Array(ex.memory.buffer, ptr, bytes.length).set(bytes);
const res = ex.ss_outlook(ptr, bytes.length);
const len = new DataView(ex.memory.buffer).getUint32(res, true);
const fromWasm = new TextDecoder().decode(new Uint8Array(ex.memory.buffer, res + 4, len));

// Native CLI
const exe = path.join(repo, 'engine', 'target', 'release', process.platform === 'win32' ? 'sootsayer.exe' : 'sootsayer');
if (!existsSync(exe)) throw new Error('build the CLI first: cargo build --release --manifest-path engine/Cargo.toml');
const cli = spawnSync(exe, ['outlook'], { input: json, maxBuffer: 64 * 1024 * 1024 });
const fromCli = cli.stdout.toString('utf8').trim();

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
console.log(`input: ${days.length} days, ${input.districts.length} districts, ${input.puskesmas.length} puskesmas, window ${day}`);
console.log(`wasm  ${sha(fromWasm)}  ${fromWasm.length} bytes`);
console.log(`cli   ${sha(fromCli)}  ${fromCli.length} bytes`);
if (fromWasm !== fromCli) {
  console.error('MISMATCH between WebAssembly and native CLI output');
  process.exit(1);
}
console.log('identical');
