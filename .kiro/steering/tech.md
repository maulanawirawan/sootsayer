# Tech

## Stack (the stitched technologies)
1. **Rust engine** (`engine/`): the outlook math. One crate, three faces:
   a library, a native CLI (`sootsayer`), and a WebAssembly module the browser
   loads. No network access and no clock inside the engine; callers pass data in.
2. **Web app** (`web/`): TypeScript + Vite + MapLibre GL JS v6 (globe
   projection, raster-dem terrain, sky/atmosphere). Runs the engine through WASM.
3. **Edge functions** (`api/`): Vercel functions in TypeScript that proxy and
   cache public sources the browser cannot call directly (FIRMS has no CORS) and
   shrink hourly data to daily means.
4. **Data pipeline** (`pipeline/`): Python 3.12 with uv. Builds the static
   reference data (district boundaries, puskesmas) and the replay snapshot of
   the October 2026 haze peak.
5. **MCP server** (`mcp/`): Python FastMCP. Exposes the outlook to agents by
   calling the engine CLI.

## Data sources (all open; attribution is shown in the app)
| Layer | Source | Access | License |
|---|---|---|---|
| Smoke field (PM2.5, PM10) | Copernicus CAMS global, 0.4° (~45 km), 3-hourly, 5-day forecast, archive since Aug 2022, via Open-Meteo Air Quality API | no key, CORS ok | CC BY 4.0; free for non-commercial use |
| Fire detections | NASA FIRMS VIIRS NOAA-20 NRT CSV (24h / 48h / 7d, Southeast Asia) | no key, no CORS (proxy) | NASA open data |
| Fire history (replay) | NASA FIRMS area API | free MAP_KEY | NASA open data |
| Day imagery | NASA GIBS `VIIRS_NOAA20_CorrectedReflectance_TrueColor` and `MODIS_Terra_CorrectedReflectance_TrueColor`, EPSG:3857, up to z9 | no key, CORS ok | NASA open data |
| Base imagery | EOX Sentinel-2 cloudless **2016** (`s2cloudless_3857`) | no key, CORS ok | CC BY 4.0 (later years are NC-SA: do not use) |
| Terrain | AWS Terrain Tiles, Terrarium encoding | no key, CORS ok | open, attribution required |
| Labels and boundaries basemap | OpenFreeMap vector tiles | no key, CORS ok | OpenMapTiles + OSM (ODbL) |
| Puskesmas locations | OpenStreetMap via Overpass API | no key | ODbL |
| District boundaries | geoBoundaries ADM2 (Indonesia) | no key | as stated by geoBoundaries for IDN |

## Method constants (from Phung et al. 2025, Int J Epidemiol, doi:10.1093/ije/dyaf169)
- Haze day: daily mean PM10 ≥ 100 µg/m³. Fire-haze day: haze day with ≥1 fire
  detection in the district.
- Relative risks come from Table 4 (main model, cumulative over lag 0–5),
  by profile and duration. They live in one place: `engine/src/method.rs`.
- Default baselines (daily respiratory visits per puskesmas) come from Table 2:
  kota 5.9, kabupaten 2.5. Users replace them with their own records.

## Toolchain (verified on this machine)
- Rust 1.98 / cargo, target `wasm32-unknown-unknown`
- Node 22, npm 10.9
- Python 3.12 (`py`), uv 0.11
- Vercel CLI 54 (deploys only with the owner's explicit approval)

## Common commands
```powershell
# Engine: tests (unit + property-based) and CLI
cargo test --manifest-path engine/Cargo.toml
cargo run --manifest-path engine/Cargo.toml --bin sootsayer -- outlook --input <file.json>

# Engine -> WebAssembly (copied into web/src/wasm/)
npm run wasm --prefix web

# Web app
npm install --prefix web
npm run dev --prefix web      # local dev server, proxies /api/* to the sources
npm run build --prefix web

# Data pipeline (reference data + replay snapshot)
uv run --project pipeline python -m pipeline.build_reference
uv run --project pipeline python -m pipeline.build_replay

# MCP server
uv run --project mcp python mcp/server.py
```

## Rules of thumb
- Units live in field names: `pm10_ugm3`, `pm25_ugm3`, `visits_per_day`.
- Dates are ISO `YYYY-MM-DD`. Daily means use UTC+7 (WIB) for all of
  Kalimantan; the one-hour WITA offset is ignored and documented.
- The engine is deterministic: same input, same output. Property-based tests
  guard the invariants (range ordering, no-haze means no change, monotonic
  duration effect in the kabupaten profile).
- MapLibre v6 is ESM-only and needs `setWorkerUrl()` with Vite's
  `?worker&url` import. WebGL2 is required.
- Fail loud on bad input; never fill gaps with invented values.
