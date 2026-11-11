# Structure

```
sootsayer/
├─ engine/                    # Rust crate "sootsayer-engine" (edition 2024)
│  ├─ Cargo.toml
│  ├─ src/
│  │  ├─ lib.rs               # modules + json entry points (shared by CLI and WASM)
│  │  ├─ method.rs            # study and literature constants with citations (the only place)
│  │  ├─ model.rs             # input/output types (serde)
│  │  ├─ outlook.rs           # validation, classification, duration, visits, priority
│  │  ├─ brief.rs             # briefing text for health offices (id/en), deterministic
│  │  ├─ geo.rs               # point-in-polygon: fire counts per district per day, locate points
│  │  ├─ plan.rs              # clean-air room sizing, indoor PM2.5, CADR presets
│  │  ├─ dates.rs             # ISO dates, contiguity
│  │  ├─ wasm.rs              # C-ABI exports for the browser (JSON in, JSON out)
│  │  └─ bin/sootsayer.rs     # native CLI (MCP server, pipeline, parity check)
│  └─ tests/properties.rs     # proptest invariants
├─ web/                       # Vite + TypeScript + MapLibre GL JS v6
│  ├─ index.html
│  ├─ public/data/            # generated: regions.json + one folder per region
│  │  ├─ regions.json         # index of regions (counts, replay availability)
│  │  ├─ kalimantan/          # districts.geojson, puskesmas.json, grid.json,
│  │  └─ sumatra/             #   reference-meta.json, replay-2026-10(.json, -fires.json)
│  ├─ scripts/                # build-wasm, check-parity (every region), engine-check
│  └─ src/
│     ├─ main.ts              # app state and wiring (region, mode, date, selection)
│     ├─ map.ts               # globe, sources, layers (day/night imagery), interactions
│     ├─ data.ts              # loaders per region + engine input builder + local lists
│     ├─ engine.ts            # loads engine.wasm, typed calls
│     ├─ csv.ts               # puskesmas CSV export/import (strict parsing)
│     ├─ tour.ts              # presentation mode (?tour=1)
│     ├─ smoke.ts             # PM2.5 -> translucent smoke image
│     ├─ ui.ts                # panels, timeline, legend, charts, briefing, lists
│     ├─ i18n.ts              # Bahasa Indonesia + English strings
│     ├─ types.ts             # data and engine types
│     └─ wasm/                # built engine .wasm (committed; Vercel has no Rust)
├─ api/                       # Vercel functions (cached proxies), all take ?region=
│  ├─ air.ts                  # CAMS via Open-Meteo -> daily means
│  ├─ fires.ts                # FIRMS NRT CSV -> region JSON
│  ├─ _shared.ts              # helpers incl. region parameter (not a route)
│  └─ _grid.ts                # generated grids + live cell lists per region (not a route)
├─ pipeline/                  # Python (uv): region packs, reference data, replay, shared clients
├─ mcp-server/                # MCP server (MCP Python SDK v2): outlook + daily_brief
├─ power-sootsayer/           # Kiro power: plugin.json, mcp.json, skills/
├─ docs/                      # METHOD.md, DATA.md, DEMO.md, img/
├─ .kiro/
│  ├─ steering/               # product.md, tech.md, structure.md
│  ├─ specs/                  # haze-clinic-outlook/ (v1), outlook-v2/
│  ├─ agents/                 # sootsayer-briefer.md (custom agent)
│  ├─ hooks/                  # engine-check-on-save, method-citation-check, house-rules-ui-check
│  └─ settings/mcp.json       # registers the Sootsayer MCP server
├─ vercel.json, package.json  # deploy config; root package marks api/ as ESM
├─ README.md, BUSINESS.md, LICENSE
```

## Where things go
- A new study number or threshold: `engine/src/method.rs` only, with the
  table and page it came from in a comment, and the same value in
  `docs/METHOD.md`. Never hard-code it anywhere else (the web app and the MCP
  server read presets from the engine's output).
- A new region: one `Region` entry in `pipeline/sootsayer_pipeline/__init__.py`,
  then `build_reference --region <id>` (and `build_replay`), a `region_<id>`
  label in `web/src/i18n.ts`, and a note in `docs/METHOD.md` that the study is
  applied by analogy there. No engine change.
- Anything that touches the network: `api/` (run time) or `pipeline/` (build
  time and MCP). The engine and the rendering code stay network-free.
- Generated data (`web/public/data/*`, `api/_grid.ts`, `web/src/wasm/*`) is
  never edited by hand; regenerate it.
- User-facing text: `web/src/i18n.ts`, both languages. Text that leaves the
  app (briefings): `engine/src/brief.rs`, both languages.
- The user's own data (baselines, profiles, imported puskesmas lists) stays in
  the browser (`localStorage`); nothing is uploaded.

## Data flow
```
NASA FIRMS ──┐                                   ┌─> globe layers (fires, smoke, day/night imagery)
CAMS (O-M) ──┼─> api/?region= (cache, daily) ────┤
             │                                   └─> engine.wasm ─> outlook, plan, brief ─> panels
OSM, geoBoundaries ─> pipeline/ (REGIONS) ─> web/public/data/<region>/ ─┘
                                   └─> mcp-server/ ─> engine CLI ─> agent answers, daily_brief
```

## Tracked on purpose
`.kiro/` is committed (specs, steering, hooks, agents, settings). Never add it to `.gitignore`.
