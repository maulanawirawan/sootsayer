# Design — haze-clinic-outlook

## Overview

```
                 build time                                   run time
OSM (Overpass) ─┐                               ┌─ /api/air   (CAMS via Open-Meteo, 368 cells -> daily means, edge cache 6 h)
geoBoundaries ──┼─ pipeline/ ─> web/public/data ┤
CAMS archive ───┤   (Python)    districts.geojson├─ /api/fires (FIRMS NRT CSV -> Kalimantan JSON, edge cache 30 min)
FIRMS archive* ─┘               puskesmas.json  │
                                grid.json       ▼
                                replay-*.json   browser: MapLibre globe + engine.wasm (Rust)
                                api/_grid.ts     │
                                                 └─ mcp-server/ (MCP SDK v2 MCPServer) -> engine CLI (same Rust code)
* only when FIRMS_MAP_KEY is set
```

Each part does what it is best at: Python for one-off geodata work, Rust for
the deterministic math that must match in the browser and in the agent tool,
TypeScript and WebGL for the globe, and Vercel functions for caching sources
that cannot be called from a browser.

## Components

### 1. Engine (`engine/`, Rust crate `sootsayer-engine`, edition 2024)
- `method.rs`: the only home of study numbers (threshold, RR table, default
  baselines, clean-air target), each with its citation.
- `outlook.rs`: input validation, day classification, duration, relative
  risk, expected visits per puskesmas, and the district priority list.
- `geo.rs`: point-in-polygon (even-odd ray casting, holes supported) to count
  fire detections per district per day.
- `plan.rs`: clean-air room sizing.
- `dates.rs`: ISO date parsing and contiguity checks (no clock, no time zones).
- `lib.rs` `json` module: `outlook`, `clean_air`, `fire_counts`, each JSON in
  and a JSON envelope out (`{"ok":true,"result":…}` or `{"ok":false,"error":…}`).
- `wasm.rs`: C-ABI exports `ss_alloc`, `ss_free`, `ss_outlook`,
  `ss_clean_air`, `ss_fire_counts` over linear memory; no wasm-bindgen. Built
  with `cargo build --target wasm32-unknown-unknown --release` (about 200 kB).
- `bin/sootsayer.rs`: CLI `sootsayer outlook|clean-air|fire-counts [--input FILE] [--pretty]`.

### 2. Web app (`web/`)
- MapLibre GL JS v6 (ESM, `setWorkerUrl` with Vite's `?worker&url`),
  `projection: globe`, `sky` atmosphere blend, `raster-dem` terrain (AWS
  Terrarium, exaggeration 1.6) plus hillshade, EOX s2cloudless 2016 base, NASA
  GIBS true colour of the selected date (fades out above z9), OpenFreeMap
  labels and country lines.
- Smoke: daily mean PM2.5 per cell drawn into a small canvas with a
  transparent border and softened outer cells, shown as an `image` source with
  linear resampling, in a smoke-like ramp (WHO 15 µg/m³ marked in the legend).
- Fires: `circle` layers (core and glow), colour by FRP.
- Districts: `fill` by relative change on the selected day (feature state),
  outline, selected outline.
- Puskesmas: `fill-extrusion` hexagons (11 km across, 7 km of height per
  expected visit per day, deliberately exaggerated for an island-wide view);
  a hidden `circle` layer handles clicks (fill-extrusion picking is unreliable
  on globe at low zoom, maplibre-gl-js #8248).
- Panels: intro, mode (live / replay), timeline with play, priority list,
  district and puskesmas detail (range chart, day table, sources, limits),
  editable baseline and profile (saved in localStorage), clean-air form, layer
  toggles, always-visible attribution. Bahasa Indonesia and English.
- Deep links: `?mode=replay&date=2026-10-15&district=KT-pulang-pisau`,
  `&puskesmas=<osm id>`, `&intro=0`.

### 3. Edge functions (`api/`, Vercel, Node runtime, Web-standard `GET`)
- `GET /api/air?past_days=14&forecast_days=5`: requests the 368 cells in
  `FETCH_CELLS` (district cells plus one ring) in chunks of 100, two at a
  time, converts hourly PM2.5/PM10 to daily means in UTC+7, and returns all
  594 grid cells with null for cells not requested. Edge cache
  `s-maxage=21600, stale-while-revalidate=21600`, plus a 30-minute in-memory
  memo in a warm instance. One refresh stays under Open-Meteo's free-tier
  limit of 600 calls per minute.
- `GET /api/fires?range=7d`: fetches the FIRMS NOAA-20 Southeast Asia CSV,
  keeps detections inside the Kalimantan bounding box, converts dates to
  UTC+7, returns rows `[lon, lat, date_wib, time_utc, frp_mw, confidence,
  daynight]`. Edge cache `s-maxage=1800`.
- Both retry once on network errors and 429/5xx. Errors return
  `{error, source}` with HTTP 502 and `no-store`, so the UI can name the source.
- The same handler files serve `/api/*` in local development through a small
  Vite plugin (`web/vite.config.ts`).

### 4. Pipeline (`pipeline/`, Python 3.12 + uv)
- `build_reference`: the 56 districts of the five Kalimantan provinces from
  geoBoundaries ADM2 (filtered by ADM1 shapeISO, simplified to ~450 m); the
  nine cities from an explicit list use the kota profile (the file names
  Kotabaru Regency "Kota Baru"); puskesmas from Overpass whose name starts with
  Puskesmas, UPT/UPTD Puskesmas, or PKM, excluding streets and other
  non-facility features, pustu, and same-name duplicates in a district; the
  0.4° grid, each district's cells, `FETCH_CELLS`, and `api/_grid.ts`.
- `build_replay`: CAMS archive for 17 Sep – 31 Oct 2026 (14 days of history
  before the replay window) as daily means for all 594 cells; FIRMS area API
  for the same dates when `FIRMS_MAP_KEY` is set.
- `engine.py`, `sources.py`: shared with the MCP server (data clients, engine
  input builder, CLI runner).

### 5. MCP server (`mcp-server/`, MCP Python SDK v2 `MCPServer`)
- Tools `list_districts`, `priority(mode, date, top)`,
  `haze_outlook(district, mode, date)`,
  `clinic_plan(puskesmas, unit_cadr_m3h, floor_area_m2, ceiling_height_m,
  baseline_visits_per_day, mode, date)`.
- Builds the same engine input as the web app, runs the engine CLI, returns its
  JSON plus a plain-language summary. Live data is cached for 30 minutes.
- Registered for Kiro in `.kiro/settings/mcp.json`.

## Data models

### Engine input (`OutlookInput`)
```json
{
  "days": ["2026-09-17", "..."],
  "window_start": "2026-10-15",
  "districts": [
    {"code": "KT-pulang-pisau", "name": "Pulang Pisau", "profile": "kabupaten",
     "pm10_ugm3": [312.4, null, "..."], "fire_count": [12, 0, null, "..."]}
  ],
  "puskesmas": [
    {"id": "osm:node/123", "name": "Puskesmas …", "district_code": "KT-pulang-pisau",
     "baseline_visits_per_day": null}
  ]
}
```
`days` is contiguous; arrays align with it; `null` means no data. Days before
`window_start` are history used for duration; the window runs to the last day.

### Engine output (`OutlookOutput`, abridged)
```json
{
  "method": {"citation": "...", "doi": "10.1093/ije/dyaf169", "haze_pm10_ugm3": 100,
             "rr_source": "...", "baseline_source": "...", "limits": ["..."]},
  "districts": [{"code": "...", "profile": "kabupaten", "complete": true,
    "haze_days": 5, "fire_haze_days": 0,
    "window_mean_change": {"point": 0.828, "low": 0.317, "high": 1.537},
    "days": [{"date": "...", "in_window": true, "status": "haze|fire_haze|clear|unknown",
              "duration_days": 29, "duration_group": "15+",
              "rr": {"point": 1.828, "low": 1.317, "high": 2.537}, "fire_data": false}]}],
  "puskesmas": [{"id": "...", "baseline_visits_per_day": 2.5, "baseline_source": "default_kabupaten",
    "days": [{"date": "...", "expected": {"point": 4.57, "low": 3.29, "high": 6.34},
              "extra": {"point": 2.07, "low": 0.79, "high": 3.84}}],
    "window_extra": {"point": 10.35, "low": 3.96, "high": 19.21}, "complete": true}],
  "priority": [{"district_code": "...", "rank": 1, "mean_change": {"...": 0},
                "window_extra": {"...": 0}, "haze_days": 5, "fire_haze_days": 0,
                "puskesmas_count": 8, "complete": true}]
}
```

## Method

### Classification (Phung et al. 2025, Table 1)
- `pm10 == null` → `unknown`.
- `pm10 < 100` → `clear`; duration resets to 0.
- `pm10 ≥ 100` and `fire_count > 0` → `fire_haze`; `fire_count == null` →
  `haze` with `fire_data: false`; otherwise `haze`.
- Duration counts consecutive haze or fire-haze days. A `clear` or `unknown`
  day ends the run, and the next haze day starts again at 1. This never
  overstates duration when data is missing.

### Relative risks (Table 4, main model, cumulative lag 0–5)

| Profile | Definition | 1–3 days | 4–14 days | ≥15 days |
|---|---|---|---|---|
| kabupaten (Pulang Pisau) | haze | 1.195 (0.877–1.629) | 1.573 (1.201–2.060) | 1.828 (1.317–2.537) |
| kabupaten (Pulang Pisau) | fire-haze | 1.317 (0.908–1.912) | 1.700 (1.111–2.601) | 1.881 (1.138–3.108) |
| kota (Palangka Raya) | haze | 0.992 (0.833–1.181) | 0.968 (0.821–1.141) | 0.703 (0.561–0.883) |
| kota (Palangka Raya) | fire-haze | 0.929 (0.732–1.180) | 0.970 (0.755–1.247) | 1.333 (0.169–10.496) |

Notes:
- The abstract reports fire-haze in Pulang Pisau as +74.4% (CI 18.9–164.6%),
  while Table 4 gives 1.774 (1.189–2.646). The geometric mean of the interval is
  1.774, so the table value is used and the mismatch is documented.
- Applying a cumulative lag 0–5 RR as a daily multiplier is exact for a
  sustained episode (every lag day exposed) and an approximation in the first
  days; the 1–3 day group partly absorbs this. Documented in `docs/METHOD.md`.
- Kota values below 1 mean visits shift away from puskesmas (the authors point
  to hospitals, posko, and rumah oksigen). The UI says this is not good news.

### Expected visits
`expected = baseline × rr` for the point, low, and high values; `extra =
expected − baseline`. Window totals add the window days. A puskesmas or
district with any `unknown` window day is `complete: false` and its totals
cover known days only.

### Default baselines (Table 2, daily mean respiratory visits, 2015–2019)
- kota: mean of Kereng Bangkirai 2.6, Menteng 9.4, Tangkiling 5.6 → 5.9
- kabupaten: mean of Bereng 2.5, Bukit Rawi 1.8, Pulang Pisau 3.2 → 2.5

### Clean-air room sizing
`volume = area × height`; `cadr_needed = volume × target_ach`;
`units = ceil(cadr_needed / unit_cadr)`. Default target 5 air changes per hour
of clean air (US CDC/NIOSH "Aim for 5"); the unit CADR is always an input.

### Priority
`mean_change` = mean of `rr − 1` over known window days (point, low, high).
Sort complete districts by `mean_change.point` descending, then fire-haze
days, then haze days. Incomplete districts are listed separately with their
partial numbers.

Why not absolute extra visits: the reference build found 339 puskesmas in
OpenStreetMap for Kalimantan's 56 districts, and four districts with none
mapped (Kota Pontianak, Kubu Raya, Katingan, Kotawaringin Timur). Ranking by
absolute visits would make those districts look calm. Absolute extra visits are
still shown, labelled with the number of mapped puskesmas they cover.

## Error handling
- A failed source gives a named banner (`CAMS (Open-Meteo)`, `NASA FIRMS`)
  and the outlook switches to the documented fallback (haze-only without
  fires) or `unknown` days without PM10.
- The engine rejects malformed input (misaligned arrays, unknown fields,
  non-contiguous days, NaN) with a clear error; it never guesses.
- Static data carries `generated_at` and source names; the UI shows them.

## Testing strategy
- Rust unit tests: classification edges (99.9 vs 100), duration groups at 3/4
  and 14/15, null handling, every RR cell (ordering and geometric-mean check),
  point-in-polygon with holes, envelope errors.
- Property-based tests (proptest): `low ≤ point ≤ high` for every output;
  clear days give `expected == baseline`; in the kabupaten profile the RR point
  never decreases as an unbroken run grows; purifier count covers the room and
  is minimal; same input gives the same output.
- `web/scripts/check-parity.mjs`: one real October input through the WASM
  module and the native CLI must give byte-identical JSON.
- Web: TypeScript check and production build; headless-browser screenshots of
  intro, live, replay, and puskesmas views during development.

## How Kiro is used
- **Spec:** this spec drives the build; tasks are ticked as they land, and the
  design was revised when the build found facts (OSM coverage, API limits).
- **Steering:** product house rules (real data, ranges, limits), tech sources
  and licenses, and the structure keep every change consistent.
- **Hooks:** engine check on save (tests, WASM, CLI, parity); study-constant
  citation check; UI house-rules check.
- **MCP:** the Sootsayer MCP server lets an agent in Kiro query the outlook.
