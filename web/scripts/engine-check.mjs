// One command for the "engine changed" hook, portable across shells:
// 1) cargo test (unit + property-based), 2) rebuild the WebAssembly module,
// 3) rebuild the CLI, 4) check that CLI and WASM still agree byte for byte.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifest = path.join(repo, 'engine', 'Cargo.toml');

const steps = [
  ['engine tests', 'cargo', ['test', '--manifest-path', manifest, '--quiet']],
  ['wasm build', 'node', [path.join(repo, 'web', 'scripts', 'build-wasm.mjs')]],
  ['cli build', 'cargo', ['build', '--release', '--bin', 'sootsayer', '--manifest-path', manifest, '--quiet']],
  ['cli/wasm parity', 'node', [path.join(repo, 'web', 'scripts', 'check-parity.mjs')]],
];

for (const [label, cmd, args] of steps) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: repo, shell: process.platform === 'win32' });
  if (r.status !== 0) {
    console.error(`engine-check: ${label} failed`);
    process.exit(r.status ?? 1);
  }
  console.log(`engine-check: ${label} ok`);
}
