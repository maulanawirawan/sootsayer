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
   the October 2026 haze peak, per region. A region (`REGIONS` in
   `pipeline/sootsayer_pipeline/__init__.py`) is data only: bbox on the 0.4°
   grid, provinces by geoBoundaries ADM1 `shapeISO`, and the list of cities.
   Shipped: `kalimantan` (5 provinces) and `sumatra` (Riau, Jambi, Sumatera
   Selatan).
5. **MCP server** (`mcp-server/`): MCP Python SDK v2 (`MCPServer`, formerly
   FastMCP). Exposes the outlook and the briefing to agents by calling the
   engine CLI. A custom agent (`.kiro/agents/sootsayer-briefer.md`) and a Kiro
   power (`power-sootsayer/`) wrap it.

## Data sources (all open; attribution is shown in the app)
| Layer | Source | Access | License |
|---|---|---|---|
| Smoke field (PM2.5, PM10) | Copernicus CAMS global, 0.4° (~45 km), 3-hourly, 5-day forecast, archive since Aug 2022, via Open-Meteo Air Quality API | no key, CORS ok | CC BY 4.0; free for non-commercial use |
| Smoke as forecast (replay) | CAMS global atmospheric composition forecasts, Atmosphere Data Store (DOI 10.24381/04a0b097), 12:00 UTC runs, hourly leads | free account, `ADS_API_KEY`, build time only | CC BY 4.0 + "Contains modified Copernicus Atmosphere Monitoring Service information 2026" and the EC/ECMWF disclaimer |
| Fire detections | NASA FIRMS VIIRS NOAA-20 NRT CSV (24h / 48h / 7d, Southeast Asia) | no key, no CORS (proxy) | NASA open data |
| Fire history (replay) | NASA FIRMS area API | free MAP_KEY | NASA open data |
| Day imagery | NASA GIBS `VIIRS_NOAA20_CorrectedReflectance_TrueColor` and `MODIS_Terra_CorrectedReflectance_TrueColor`, EPSG:3857, up to z9 | no key, CORS ok | NASA open data |
| Night imagery | NASA GIBS `VIIRS_NOAA20_DayNightBand_At_Sensor_Radiance`, EPSG:3857 `GoogleMapsCompatible_Level8`, PNG | no key, CORS ok | NASA open data |
| Waiting-room factors | Barn et al. 2008 (indoor/outdoor PM2.5 in forest-fire smoke), Holder et al. 2022 (Corsi–Rosenthal box CADR) | literature, in `method.rs` | cited |
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
# Engine: tests (unit + property-based), then WASM + CLI + parity in one go
cargo test --manifest-path engine/Cargo.toml
node web/scripts/engine-check.mjs

# CLI by hand
cargo run --release --manifest-path engine/Cargo.toml --bin sootsayer -- outlook --input <file.json> --pretty

# Web app (dev server also serves api/*.ts through a Vite plugin)
npm install --prefix web
npm run dev --prefix web
npm run build --prefix web

# Data pipeline (reference data for every region, replay per region)
pipeline/.venv/Scripts/python.exe -m sootsayer_pipeline.build_reference [--region sumatra]
pipeline/.venv/Scripts/python.exe -m sootsayer_pipeline.build_replay --region sumatra
# Replay as forecast (Atmosphere Data Store, needs ADS_API_KEY; one cached request for both regions)
uv run --project pipeline --extra ads python -m sootsayer_pipeline.build_forecast --region kalimantan --region sumatra

# MCP server (stdio)
uv run --project mcp-server python mcp-server/server.py
```

## Fair use of free APIs
- Open-Meteo free tier: 600 calls/min, 10,000/day, non-commercial. A location
  with more than 14 days counts as days/14 calls, so one live refresh of 19
  days costs about 1.36 calls per location: `/api/air?region=kalimantan` asks
  for 368 locations (~500 calls), `region=sumatra` for 186 (~253). Keep the
  edge cache on, request one region at a time, and do not loop requests while
  testing (a 429 shows up as a named CAMS failure). All of Indonesia would be
  1,956 locations (~2,655 calls per refresh): over the per-minute limit.
- The replay builder pauses 65 s between uncached 100-location archive
  requests (45 days weigh ~321 calls each).
- FIRMS NRT CSVs need no key; the area API (replay fires) needs a free MAP_KEY
  in `FIRMS_MAP_KEY`, never committed.
- Atmosphere Data Store: at most 10,000 fields per request (the forecast
  replay uses 7,192), and a new request is rejected while one of ours is
  queued for the same dataset, so send one at a time and wait. The key lives in
  `ADS_API_KEY`, never committed or printed.

## Rules of thumb
- Units live in field names: `pm10_ugm3`, `pm25_ugm3`, `visits_per_day`.
- Dates are ISO `YYYY-MM-DD`. Daily means use UTC+7 (WIB) for every region;
  the one-hour WITA offset in part of Kalimantan is ignored and documented.
- Text that leaves the app (briefings) is written by the engine
  (`engine/src/brief.rs`), never by a language model, so the web app and the
  MCP tool send the same bytes.
- The engine is deterministic: same input, same output. Property-based tests
  guard the invariants (range ordering, no-haze means no change, monotonic
  duration effect in the kabupaten profile).
- MapLibre v6 is ESM-only and needs `setWorkerUrl()` with Vite's
  `?worker&url` import. WebGL2 is required.
- Fail loud on bad input; never fill gaps with invented values.
