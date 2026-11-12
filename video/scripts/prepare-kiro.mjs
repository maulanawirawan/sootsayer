// Collects the real Kiro artifacts and real command output the "Built with
// Kiro" shots typeset: spec excerpts and counts, steering house rules, hook
// definitions, test and parity output, and a real daily_brief result from the
// MCP server's tool function. Nothing is written by hand here.
//   node scripts/prepare-kiro.mjs
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const out = path.resolve(here, '..', 'src', 'kiro.generated.json');
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8').replace(/\r\n/g, '\n');
const run = (cmd) => execSync(cmd, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 }).replace(/\r\n/g, '\n');

/** Join hard-wrapped markdown lines into paragraphs and list items; drop ** emphasis marks. */
function paragraphs(lines) {
  const out = [];
  for (const raw of lines) {
    const l = raw.replace(/\*\*/g, '').trimEnd();
    const starts = /^(#|\d+\.\d+\.|\d+\.|- |User story)/.test(l.trim());
    if (!l.trim()) out.push('');
    else if (starts || !out.length || out[out.length - 1] === '') out.push(l.trim());
    else out[out.length - 1] += ` ${l.trim()}`;
  }
  return out.filter((l, i) => l || (i > 0 && out[i - 1]));
}

// Spec counts, from the files
const specs = ['haze-clinic-outlook', 'outlook-v2'];
let requirements = 0;
let criteria = 0;
let tasks = 0;
let decisions = 0;
for (const s of specs) {
  const req = read(`.kiro/specs/${s}/requirements.md`);
  requirements += (req.match(/^## Requirement/gm) || []).length;
  criteria += (req.match(/^\d+\.\d+\.\s/gm) || []).length; // numbered acceptance criteria (EARS)
  tasks += (read(`.kiro/specs/${s}/tasks.md`).match(/^- \[[x ]\] \d+\./gm) || []).length;
  decisions += (read(`.kiro/specs/${s}/design.md`).match(/^### D\d+/gm) || []).length;
}
const v2 = read('.kiro/specs/outlook-v2/requirements.md');
const req1 = paragraphs(v2.slice(v2.indexOf('## Requirement 1'), v2.indexOf('## Requirement 2')).trim().split('\n'));
const tasksV2 = read('.kiro/specs/outlook-v2/tasks.md').split('\n').filter((l) => /^- \[[x ]\] \d+\./.test(l));

// Steering: the house rules
const product = read('.kiro/steering/product.md');
const rules = paragraphs(product.slice(product.indexOf('## House rules'), product.indexOf('## Wording')).trim().split('\n'));

// Hooks
const hooks = ['engine-check-on-save', 'house-rules-ui-check', 'method-citation-check'].map((id) => {
  const h = JSON.parse(read(`.kiro/hooks/${id}.json`)).hooks[0];
  return { id, name: h.name, trigger: h.trigger, matcher: h.matcher, action: h.action.type, command: h.action.command ?? null };
});

// Tests (unit + property) and parity, run now
const test = run('cargo test --manifest-path engine/Cargo.toml 2>&1');
const testLines = test.split('\n').filter((l) => /^test .* \.\.\. ok$|^test result:/.test(l.trim()));
const props = testLines.filter((l) => /^test [a-z_]+ \.\.\. ok$/.test(l.trim()) && !l.includes('::'));
const results = testLines.filter((l) => l.startsWith('test result:') && !/ 0 passed/.test(l));
const parity = run('node web/scripts/check-parity.mjs 2>&1').split('\n').filter((l) => /^(identical|MISMATCH)/.test(l));

// A real daily_brief from the MCP server's tool function (replay of 14 Oct 2026, English)
const py = [
  'import json, sys',
  "sys.path.insert(0, 'mcp-server')",
  'import server',
  "r = server.daily_brief(region='kalimantan', mode='replay', date='2026-10-14', lang='en')",
  "print(json.dumps({'text': r['text'], 'keys': sorted(r)}))",
].join('; ');
const brief = JSON.parse(run(`uv run --quiet --project mcp-server python -c "${py}"`).trim().split('\n').pop());
const tools = [...read('mcp-server/server.py').matchAll(/@mcp\.tool\(\)\s*\ndef (\w+)/g)].map((m) => m[1]);

const data = {
  counts: { specs: specs.length, requirements, criteria, tasks, decisions },
  req1,
  tasksV2,
  rules,
  hooks,
  tests: { props, results },
  parity,
  mcp: { tools, call: "daily_brief(region='kalimantan', mode='replay', date='2026-10-14', lang='en')", text: brief.text, keys: brief.keys },
  findings: [
    { hook: 'house-rules-ui-check', file: 'web/src/data.ts', what: 'An English source label would have appeared inside the Indonesian briefing.', fix: 'Source name and run time only' },
    { hook: 'house-rules-ui-check', file: 'web/src/main.ts', what: 'A failed forecast load would have kept the "What was forecast" label over hindsight data.', fix: 'Fall back to hindsight and name the source' },
    { hook: 'house-rules-ui-check', file: 'web/src/ui.ts', what: "The legend's ' WHO' tick label was hard-coded outside i18n.ts.", fix: 'Moved to i18n.ts (id + en)' },
  ],
};
fs.writeFileSync(out, JSON.stringify(data, null, 1));
console.log(`counts ${JSON.stringify(data.counts)}; props ${props.length}; results ${results.length}; parity lines ${parity.length}; tools ${tools.length}; brief ${brief.text.length} chars`);

