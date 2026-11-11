# Tasks — haze-clinic-outlook

- [x] 1. Engine core: classification, duration, relative risk, expected visits
  - Types in `model.rs`, constants with citations in `method.rs`, logic in
    `outlook.rs`; strict input validation.
  - Unit tests for thresholds, duration groups, nulls, and every RR cell.
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 2. Engine plan and geometry
  - Clean-air sizing in `plan.rs`; district priority in `outlook.rs` (ranked
    by relative change after the OSM coverage finding); point-in-polygon in
    `geo.rs` to count fire detections per district per day.
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 3. Property-based tests for engine invariants
  - proptest: range ordering, clear-day identity, monotonic duration effect
    (kabupaten), purifier coverage and minimality, determinism.
  - _Requirements: 2.3, 2.4, 3.1_

- [x] 4. Engine faces: CLI and WebAssembly
  - `sootsayer outlook|clean-air|fire-counts` reading JSON from file or stdin.
  - C-ABI exports in `wasm.rs`; `npm run wasm` builds and copies the module.
  - `web/scripts/check-parity.mjs` proves CLI and WASM agree byte for byte.
  - _Requirements: 2.6, 4.3_

- [x] 5. Reference data pipeline
  - 56 districts (geoBoundaries ADM2), 339 puskesmas (OSM Overpass, streets
    and duplicates removed), 594-cell CAMS grid, 368 live cells, `api/_grid.ts`.
  - _Requirements: 1.1, 2.1_

- [x] 6. Replay snapshot for October 2026
  - CAMS archive as daily means for 17 Sep – 31 Oct 2026 (594 cells, no gaps).
  - FIRMS history: runs only with `FIRMS_MAP_KEY`; until then the replay is
    haze-only and says so on screen.
  - _Requirements: 5.1, 5.2_

- [x] 7. Edge functions
  - `/api/air` (cell subset, daily means, 6 h edge cache, 30 min memo) and
    `/api/fires` (Kalimantan NRT detections, UTC+7 dates, 30 min cache);
    retries and named errors.
  - _Requirements: 1.2, 1.3, 1.4_

- [x] 8. Globe and layers
  - MapLibre v6 globe, atmosphere, terrain and hillshade, s2cloudless 2016,
    GIBS true colour by date, OpenFreeMap labels, smoke canvas, fires,
    districts, puskesmas pillars, layer toggles, in-app attribution.
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 9. Outlook UI
  - Intro, mode switch, timeline with play, detail panels with range charts and
    sources, editable baseline and profile, priority list, limits note,
    source-failure banners, Bahasa Indonesia and English, deep links.
  - _Requirements: 1.4, 2.5, 2.6, 3.2, 3.3, 5.2_

- [x] 10. Clean-air room form
  - Area, height, unit CADR → required CADR and unit count, from the engine.
  - _Requirements: 3.1_

- [x] 11. MCP server
  - `list_districts`, `priority`, `haze_outlook`, `clinic_plan` over the engine
    CLI (MCP Python SDK v2); tested with a stdio client; registered in
    `.kiro/settings/mcp.json`.
  - _Requirements: 4.1, 4.2, 4.3_

- [ ] 12. Docs and deploy
  - [x] README, `docs/METHOD.md`, `docs/DATA.md`, `docs/DEMO.md`,
    `BUSINESS.md`, `vercel.json`.
  - [ ] Public GitHub repo, Vercel deploy, and FIRMS MAP_KEY for replay fires:
    waiting for the owner's approval.
  - _Requirements: 1.1, 2.5_
