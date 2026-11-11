# Design — outlook-v2

## Overview

```
pipeline (Region packs) ──> web/public/data/<region>/ ──┐
   REGIONS = {kalimantan, sumatra}    regions.json       ├─> web app: region switch, briefing, CSV, waiting room, tour, night
                                      api/_grid.ts ──────┤
                                                         └─> api/air?region=…  api/fires?region=…
engine (Rust) ── outlook · fire-counts · locate · clean-air (+indoor) · brief
   │  same bytes via WASM (browser) and CLI (MCP)
   └─> mcp-server: list_regions · list_districts · priority · haze_outlook · clinic_plan · daily_brief
            └─> Kiro (custom agent sootsayer-briefer, power-sootsayer) · Kiro Crew (scheduled job)
```

## Decisions

### D1. The briefing is written by the engine, not by a language model
`engine/src/brief.rs` turns an outlook input plus metadata (language, region
name, mode, data times, failed sources, link) into plain text. Reasons:
- one text everywhere: the web panel and `daily_brief` return the same bytes
  (checked by `check-parity.mjs` in both languages and both regions);
- an agent forwards numbers it did not write, so it cannot drop a range or a
  limit;
- the engine has no clock, so callers pass data times; it refuses control
  characters and non-https links, so metadata cannot inject lines.

Rejected: letting the agent write the briefing from tool JSON (numbers could be
rounded or ranges dropped), and a server-side sender (phone numbers are
personal data; Kiro Crew already has channels).

### D2. Regions are data, not code
`pipeline/sootsayer_pipeline/__init__.py` holds `REGIONS`: id, name, bbox on
the 0.4° CAMS grid, provinces by geoBoundaries ADM1 `shapeISO`, and the
explicit list of cities. `build_reference` writes one folder per region,
`regions.json`, and `api/_grid.ts` (grids and live cells for every region).
The engine, the web UI, and the MCP server read whatever regions exist.

- Sumatra pack: Riau, Jambi, Sumatera Selatan; 40 districts (8 kota), 167 OSM
  puskesmas, 340 grid cells, 186 live cells. Kemenkes' 2026 karhutla ISPA
  reports name Riau and Sumatera Selatan; Jambi lies between them.
- geoBoundaries ADM2 also contains lakes as features ("Danau", "Danau Toba",
  "Waduk Cirata"); the pipeline skips them by name.
- Live cost per refresh: Kalimantan 368 cells ≈ 500 weighted calls; Sumatra
  186 ≈ 253. The app asks for one region at a time.
- All of Indonesia (516 districts) would need 1,956 live cells ≈ 2,655
  weighted calls per refresh: over the free tier's 600 per minute, and about
  10,600 per day at a 6-hour cache. Not built; documented.

### D3. Indoor PM2.5 is a measured ratio, not a ventilation model
`indoor = outdoor × Finf` with Finf measured during forest-fire smoke (Barn et
al. 2008): 0.27–0.61 without HEPA, 0.10–0.19 with HEPA (winter to summer
means). A mass-balance model would need the room's air-exchange rate, which no
puskesmas knows; a measured ratio with its spread is honest about that. The
span is labelled "not a 95% interval". Waiting rooms with open louvres can be
worse, so the advice says to close the room first.

### D4. Corsi–Rosenthal box preset
682 m³/h from the US EPA chamber test (Holder et al. 2022: 111.2 cfm single
filter, +261% for the four-filter box = 401.4 cfm). The constant lives in
`method.rs`; the web UI and the MCP server read it from the engine's output
(`presets`), never hard-code it.

### D5. Imported puskesmas lists stay in the browser
CSV parsing is in `web/src/csv.ts` (strict: every rejected row is named); the
district of each row comes from the engine's new `locate` entry point
(point-in-polygon, snapping within 0.03° like the pipeline). Lists are stored
per region in `localStorage` and shown as the source with file name and date.
Export writes the same columns, so the OSM list is the template. Problem
messages are i18n keys.

### D6. Presentation mode drives the real app
`web/src/tour.ts` calls the same functions as the buttons (region, mode, date,
district, puskesmas, briefing). Captions are i18n strings; the one statistic
(401,586 ISPA cases) names Kemenkes and its date. Space pauses, → skips, Esc
ends, `pace` scales the timing.

### D7. Night imagery
NASA GIBS `VIIRS_NOAA20_DayNightBand_At_Sensor_Radiance`
(GoogleMapsCompatible_Level8, PNG) for the selected date, checked to return
tiles for October 2026. Shown in grey scale as an alternative to the day image.

### D8. The console stays clean
"The source image could not be decoded" came from images replaced while they
were still decoding: a 1×1 placeholder replaced by the first smoke frame,
identical smoke frames re-sent, and day imagery switched from yesterday to the
link's date right after load. Fixes: the smoke source is created from the first
real frame, frames are keyed and sent once, and the map starts on the link's
date. A map `error` listener now names the failing source.

### D9. Agent surfaces
- MCP: `list_regions`, `daily_brief`; every tool accepts any region; replay
  and live data times are passed to the briefing; failed sources become one-line
  errors.
- `.kiro/agents/sootsayer-briefer.md`: tools limited to `read` and
  `@sootsayer`, MCP calls allowed, rules for ranges, data times, hindsight,
  kota shifts, and no medical advice.
- `power-sootsayer/`: `plugin.json`, `mcp.json` (`SOOTSAYER_HOME`), skills
  `haze-briefing` and `add-a-region`.
- Kiro Crew: no code; a scheduled Crew job calls `daily_brief` and posts the
  text to Telegram (documented, not tested here).

## Testing

- Engine: 28 unit tests (briefing content, clear windows, refused metadata,
  percent rounding equal to the web, date spans, indoor estimate, CR preset,
  locate inside/snapped/outside) and 7 property tests (adds: indoor estimate
  ordered and lower with a cleaner; every briefing has its limits, disclaimer,
  and a range on every ranked line; briefing deterministic).
- Parity: outlook and briefing (id, en) for both regions, WASM == CLI.
- Browser (headless Chrome): both regions in replay, briefing panel, puskesmas
  panel with the CR preset and indoor table, night layer, phone width, intro,
  tour, CSV import with a semicolon file, decimal commas, a row without
  coordinates and a row outside the region.
- Edge functions: `/api/air?region=sumatra` (340 cells, 186 requested),
  `/api/fires?region=sumatra`, and HTTP 400 for an unknown region.

## How Kiro shaped this spec

- Every UI edit was reviewed against the checklist of the
  `house-rules-ui-check` hook. The review found two violations: English-only
  CSV error messages, and an English source label inside the Indonesian
  briefing. Both were fixed before moving on.
- The checklist of the `method-citation-check` hook found that
  `docs/METHOD.md` lacked the new constants (infiltration factors, CR box) and
  the fifth limit; METHOD.md was rewritten to match `method.rs` value for value.
- The command behind the `engine-check-on-save` hook (tests, WASM, CLI,
  parity) was run after each engine change.
- Not verified: whether Kiro fires these PostFileSave hooks for edits the
  agent makes itself. During this build the checks were run explicitly; a save
  from the editor is the case the hooks are written for.
