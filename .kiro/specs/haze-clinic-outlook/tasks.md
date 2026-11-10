# Tasks — haze-clinic-outlook

- [ ] 1. Engine core: classification, duration, relative risk, expected visits
  - Types in `model.rs`, constants with citations in `method.rs`, logic in
    `outlook.rs`; strict input validation.
  - Unit tests for thresholds, duration groups, nulls, and every RR cell.
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [ ] 2. Engine plan and geometry
  - Clean-air sizing and district priority in `plan.rs`; point-in-polygon in
    `geo.rs` to assign fire detections to districts.
  - _Requirements: 3.1, 3.2, 3.3_

- [ ] 3. Property-based tests for engine invariants
  - proptest: range ordering, clear-day identity, monotonic duration effect
    (kabupaten), CADR coverage.
  - _Requirements: 2.3, 2.4, 3.1_

- [ ] 4. Engine faces: CLI and WebAssembly
  - `sootsayer outlook|plan|assign` reading JSON from file or stdin.
  - C-ABI exports in `wasm.rs`; `npm run wasm` builds and copies the module.
  - _Requirements: 2.6, 4.3_

- [ ] 5. Reference data pipeline
  - Districts (geoBoundaries ADM2, five Kalimantan provinces, simplified),
    puskesmas (OSM Overpass), CAMS grid cells and district cell lists.
  - _Requirements: 1.1, 2.1_

- [ ] 6. Replay snapshot for October 2026
  - CAMS archive as daily means for 17 Sep – 31 Oct 2026; FIRMS history when
    `FIRMS_MAP_KEY` is set, otherwise haze-only with a flag.
  - _Requirements: 5.1, 5.2_

- [ ] 7. Edge functions
  - `/api/air` (grid daily means, cached) and `/api/fires` (Kalimantan NRT
    detections, cached); named errors.
  - _Requirements: 1.2, 1.3, 1.4_

- [ ] 8. Globe and layers
  - MapLibre v6 globe, atmosphere, terrain, s2cloudless 2016, GIBS true colour
    by date, OpenFreeMap labels, smoke canvas, fires, districts, puskesmas
    pillars; attribution.
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] 9. Outlook UI
  - Mode switch, timeline with play, detail panel with range chart and
    sources, editable baseline and profile, priority list, limits note,
    stale-data banners, Bahasa Indonesia and English.
  - _Requirements: 1.4, 2.5, 2.6, 3.2, 3.3, 5.2_

- [ ] 10. Clean-air room form
  - Area, height, target ACH, unit CADR → required CADR and unit count.
  - _Requirements: 3.1_

- [ ] 11. MCP server
  - `list_districts`, `haze_outlook`, `clinic_plan` over the engine CLI; smoke
    test that CLI and WASM outputs match.
  - _Requirements: 4.1, 4.2, 4.3_

- [ ] 12. Docs and deploy
  - README, `docs/METHOD.md`, `docs/DATA.md` (sources and licenses),
    `docs/DEMO.md`, `BUSINESS.md`; `vercel.json`; deploy only after the owner
    approves.
  - _Requirements: 1.1, 2.5_
