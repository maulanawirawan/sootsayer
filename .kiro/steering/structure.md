# Structure

```
sootsayer/
├─ engine/                    # Rust crate "sootsayer-engine" (edition 2024)
│  ├─ Cargo.toml
│  ├─ src/
│  │  ├─ lib.rs               # modules + json entry points (shared by CLI and WASM)
│  │  ├─ method.rs            # study constants with citations (the only place)
│  │  ├─ model.rs             # input/output types (serde)
│  │  ├─ outlook.rs           # validation, classification, duration, visits, priority
│  │  ├─ geo.rs               # point-in-polygon fire counts per district per day
│  │  ├─ plan.rs              # clean-air room sizing
│  │  ├─ dates.rs             # ISO dates, contiguity
│  │  ├─ wasm.rs              # C-ABI exports for the browser (JSON in, JSON out)
│  │  └─ bin/sootsayer.rs     # native CLI (MCP server, pipeline, parity check)
│  └─ tests/properties.rs     # proptest invariants
├─ web/                       # Vite + TypeScript + MapLibre GL JS v6
│  ├─ index.html
│  ├─ public/data/            # generated reference data + replay snapshot
│  ├─ scripts/                # build-wasm, check-parity, engine-check
│  └─ src/
│     ├─ main.ts              # app state and wiring
│     ├─ map.ts               # globe, sources, layers, interactions
│     ├─ data.ts              # loaders + engine input builder
│     ├─ engine.ts            # loads engine.wasm, typed calls
│     ├─ smoke.ts             # PM2.5 -> translucent smoke image
│     ├─ ui.ts                # panels, timeline, legend, charts
│     ├─ i18n.ts              # Bahasa Indonesia + English strings
│     ├─ types.ts             # data and engine types
│     └─ wasm/                # built engine .wasm (committed; Vercel has no Rust)
├─ api/                       # Vercel functions (cached proxies)
│  ├─ air.ts                  # CAMS via Open-Meteo -> daily means
│  ├─ fires.ts                # FIRMS NRT CSV -> Kalimantan JSON
│  ├─ _shared.ts              # helpers (not a route)
│  └─ _grid.ts                # generated grid + live cell list (not a route)
├─ pipeline/                  # Python (uv): reference data, replay, shared clients
├─ mcp-server/                # MCP server (MCP Python SDK v2)
├─ docs/                      # METHOD.md, DATA.md, DEMO.md, img/
├─ .kiro/
│  ├─ steering/               # product.md, tech.md, structure.md
│  ├─ specs/haze-clinic-outlook/
│  ├─ hooks/                  # engine-check-on-save, method-citation-check, house-rules-ui-check
│  └─ settings/mcp.json       # registers the Sootsayer MCP server
├─ vercel.json, package.json  # deploy config; root package marks api/ as ESM
├─ README.md, BUSINESS.md, LICENSE
```

## Where things go
- A new study number or threshold: `engine/src/method.rs` only, with the
  table and page it came from in a comment, and the same value in
  `docs/METHOD.md`. Never hard-code it anywhere else.
- Anything that touches the network: `api/` (run time) or `pipeline/` (build
  time and MCP). The engine and the rendering code stay network-free.
- Generated data (`web/public/data/*`, `api/_grid.ts`, `web/src/wasm/*`) is
  never edited by hand; regenerate it.
- User-facing text: `web/src/i18n.ts`, both languages.

## Data flow
```
NASA FIRMS ──┐                         ┌─> globe layers (fires, smoke, imagery)
CAMS (O-M) ──┼─> api/ (cache, daily) ──┤
             │                         └─> engine.wasm ─> outlook + plan ─> panels
OSM, geoBoundaries ─> pipeline/ ─> web/public/data/ ─┘
                                   └─> mcp-server/ ─> engine CLI ─> agent answers
```

## Tracked on purpose
`.kiro/` is committed (specs, steering, hooks, settings). Never add it to `.gitignore`.
