// Build the Rust engine for the browser and copy it into src/wasm/.
// Vercel's build image has no Rust toolchain, so the .wasm file is committed;
// run `npm run wasm` after changing anything in engine/.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = path.resolve(web, '..', 'engine', 'Cargo.toml');

execFileSync('cargo', ['build', '--manifest-path', manifest, '--lib', '--release', '--target', 'wasm32-unknown-unknown'], {
  stdio: 'inherit',
});

const built = path.resolve(web, '..', 'engine', 'target', 'wasm32-unknown-unknown', 'release', 'sootsayer_engine.wasm');
const dest = path.resolve(web, 'src', 'wasm', 'sootsayer_engine.wasm');
mkdirSync(path.dirname(dest), { recursive: true });
copyFileSync(built, dest);
console.log(`engine.wasm -> ${path.relative(web, dest)} (${statSync(dest).size} bytes)`);
