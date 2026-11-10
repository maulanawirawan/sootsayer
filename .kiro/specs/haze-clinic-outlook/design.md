# Design — haze-clinic-outlook

## Overview

```
                 build time                                   run time
OSM (Overpass) ─┐                               ┌─ /api/air   (Open-Meteo CAMS grid -> daily means, cached 3 h)
geoBoundaries ──┼─ pipeline/ ─> web/public/data ┤
CAMS archive ───┤   (Python)    districts.json  ├─ /api/fires (FIRMS NRT CSV -> Kalimantan JSON, cached 30 min)
FIRMS archive* ─┘               puskesmas.json  │
                                grid.json       ▼
                                replay-*.json   browser: MapLibre globe + engine.wasm (Rust)
                                                 │
                                                 └─ mcp/ (FastMCP) -> engine CLI (same Rust code)
* only when FIRMS_MAP_KEY is set
```

Each part does what it is best at: Python for one-off geodata work, Rust for
the deterministic math that must match in the browser and in the agent tool,
TypeScript and WebGL for the globe, and Vercel functions for caching sources
that cannot be called from a browser.

## Components

### 1. Engine (`engine/`, Rust crate `sootsayer-engine`)
- `method.rs`: the only home of study numbers (threshold, RR tables, default
  baselines, clean-air defaults), each with its citation.
- `outlook.rs`: per-district day classification, duration, relative risk, and
  per-puskesmas expected visits.
- `geo.rs`: point-in-polygon (even-odd ray casting, holes supported) to assign
  fire detections to districts.
- `plan.rs`: clean-air room sizing and district priority.
- `wasm.rs`: `alloc`, `dealloc`, `outlook_json`, `plan_json`, `assign_json`.
  JSON in, JSON out, no wasm-bindgen needed. Built with
  `cargo build --target wasm32-unknown-unknown --release`.
- `bin/sootsayer.rs`: `outlook`, `plan`, `assign` subcommands reading JSON from
  a file or stdin.

### 2. Web app (`web/`)
- MapLibre GL JS v6, `projection: globe`, `sky` with atmosphere blend,
  `raster-dem` terrain (AWS Terrarium), EOX s2cloudless 2016 base, NASA GIBS
  true-colour of the selected date on top (fades out above z9), OpenFreeMap
  labels and boundaries.
- Smoke: daily mean PM2.5 per grid cell rendered into a small canvas, shown as
  an `image` source with linear resampling, coloured by ISPU bands.
- Fires: `circle` layer, radius by FRP, glow by confidence.
- Districts: `fill` coloured by relative change on the selected day; outline.
- Puskesmas: `fill-extrusion` hexagon pillars, height by expected visits,
  colour by change; a hidden `circle` layer handles clicks (fill-extrusion
  picking is unreliable on globe at low zoom, maplibre-gl-js #8248).
- Panels: mode (live / replay), timeline with play, district or puskesmas
  detail (chart with range band, table, sources), clean-air sizing form,
  priority list, method limits, attribution. Bahasa Indonesia and English.

### 3. Edge functions (`api/`, Vercel, Node runtime)
- `GET /api/air?past_days=14&forecast_days=5`: requests the fixed Kalimantan
  grid from `grid.json` (chunks of ≤ 200 points), converts hourly PM2.5/PM10 to
  daily means in UTC+7, returns `{generated_at, model, days[], cells: {pm25[][], pm10[][]}}`.
  Cache: `s-maxage=10800, stale-while-revalidate=3600`.
- `GET /api/fires?range=7d`: fetches the FIRMS NOAA-20 Southeast Asia CSV,
  keeps detections inside the Kalimantan bounding box, returns compact rows
  `[lat, lon, date, time, frp, confidence, daynight]`. Cache: `s-maxage=1800`.
- Errors return `{error, source, status}` with HTTP 502 so the UI can name the
  failing source.

### 4. Pipeline (`pipeline/`, Python + uv)
- `build_reference`: districts of the five Kalimantan provinces from
  geoBoundaries ADM2 (simplified), profile from the name (Kota → kota, else
  kabupaten), puskesmas from Overpass (name matches Puskesmas, excluding
  Puskesmas Pembantu), assigned to districts; grid cell centres at 0.4° over
  the Kalimantan bounding box, with the cell list per district.
- `build_replay`: CAMS archive for 17 Sep – 31 Oct 2026 (14 days of history
  before the replay window) as daily means; FIRMS area API for the same dates
  when `FIRMS_MAP_KEY` is set.

### 5. MCP server (`mcp/`)
- Tools `list_districts`, `haze_outlook(district, mode)`,
  `clinic_plan(puskesmas_id, floor_area_m2, ceiling_height_m, unit_cadr_m3h, mode)`.
- Builds the same engine input as the web app (shared JSON shape), runs the
  engine CLI, returns its JSON plus a short plain-language summary.

## Data models

### Engine input (`OutlookInput`)
```json
{
  "days": ["2026-10-01", "..."],
  "window_start": "2026-10-15",
  "districts": [
    {"code": "IDN-ADM2-xxxx", "name": "Pulang Pisau", "profile": "kabupaten",
     "pm10_ugm3": [312.4, null, "..."], "fire_count": [12, 0, null, "..."]}
  ],
  "puskesmas": [
    {"id": "osm:node/123", "name": "Puskesmas Bereng", "district_code": "IDN-ADM2-xxxx",
     "baseline_visits_per_day": null}
  ]
}
```
`days` is contiguous; arrays align with it; `null` means no data. Days before
`window_start` are history used for duration; the window runs to the last day.

### Engine output (`OutlookOutput`, abridged)
```json
{
  "method": {"citation": "...", "doi": "10.1093/ije/dyaf169", "haze_pm10_ugm3": 100},
  "districts": [{"code": "...", "profile": "kabupaten", "complete": true,
    "days": [{"date": "...", "status": "haze|fire_haze|clear|unknown",
              "duration_days": 9, "duration_group": "4-14",
              "rr": {"point": 1.700, "low": 1.111, "high": 2.601},
              "fire_data": true}]}],
  "puskesmas": [{"id": "...", "baseline_visits_per_day": 2.5, "baseline_source": "default_kabupaten",
    "days": [{"date": "...", "expected": {"point": 4.3, "low": 2.8, "high": 6.5},
              "extra": {"point": 1.8, "low": 0.3, "high": 4.0}}],
    "window_extra": {"point": 9.1, "low": 1.2, "high": 20.4}, "complete": true}],
  "priority": [{"district_code": "...", "rank": 1, "window_extra": {"...": 0},
                "haze_days": 5, "fire_haze_days": 4, "puskesmas_count": 7, "complete": true}]
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
  to hospitals, posko, and rumah oksigen). The UI labels these as "shift", not
  as good news.

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
of clean air (CDC ventilation guidance); default unit CADR is an input, never
assumed silently.

### Priority
`mean_change` = mean of `rr − 1` over known window days (point, low, high).
Sort complete districts by `mean_change.point` descending, then fire-haze
days, then haze days. Incomplete districts are listed separately with their
partial numbers.

Why not absolute extra visits: the reference build found 366 puskesmas in
OpenStreetMap for Kalimantan, roughly 4 in 10 of the official count, and three
districts with none mapped (including Kotawaringin Timur). Ranking by absolute
visits would make those districts look calm. Absolute extra visits are still
shown, labelled with the number of mapped puskesmas they cover.

## Error handling
- A failed source gives a named banner (`FIRMS`, `CAMS`, `GIBS`) and the
  outlook switches to the documented fallback (haze-only without fires) or
  `unknown` days without PM10.
- The engine rejects malformed input (misaligned arrays, unknown profile,
  non-contiguous days) with a clear error; it never guesses.
- Static data carries `generated_at` and source versions; the UI shows them.

## Testing strategy
- Rust unit tests: classification edges (99.9 vs 100), duration groups at 3/4
  and 14/15, null handling, RR lookup for every table cell, point-in-polygon
  with holes.
- Property-based tests (proptest): `low ≤ point ≤ high` for every output;
  clear days give `expected == baseline`; in the kabupaten profile the RR point
  never decreases as an unbroken haze run grows; CADR units never under-cover
  the room.
- Same input through CLI and WASM gives byte-identical JSON (checked by the
  MCP smoke test against the web build artefact).
- Web: type check and production build; a manual checklist for the globe.

## How Kiro is used
- **Spec:** this spec drives the build; tasks are ticked as they land.
- **Steering:** product house rules (real data, ranges, limits), tech sources
  and licenses, and the structure keep every change consistent.
- **Hooks:** run engine tests on save; check that study constants keep their
  citations; check UI changes against the house rules.
- **MCP:** the Sootsayer MCP server lets an agent in Kiro query the outlook.
