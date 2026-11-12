# Tasks — outlook-v2

- [x] 1. Engine: briefing text
  - `brief.rs` (id/en words, percent rounding equal to the web, date spans,
    refused metadata), `json::brief`, `ss_brief`, CLI `brief`.
  - Unit tests and a property test (limits, disclaimer, ranges, determinism).
  - _Requirements: 1.1, 1.2, 1.3, 1.5_

- [x] 2. Engine: waiting room and point location
  - `FINF_*`, `INDOOR_SOURCE`, `CR_BOX_*`, fifth limit and `LIMITS_ID` in
    `method.rs`; `indoor_estimate` and `presets` in `plan.rs`;
    `geo::locate` with snapping, `ss_locate`, CLI `locate`.
  - _Requirements: 3.1, 3.2, 3.3, 4.2_

- [x] 3. Pipeline: region packs
  - `Region` and `REGIONS`; per-region folders; `regions.json`;
    `api/_grid.ts` for all regions; lakes skipped; replay per region with a
    paced CAMS archive request; FIRMS errors never print the key.
  - Kalimantan rebuilt byte-identical to v1 (districts, puskesmas, grid).
  - Sumatra: 40 districts, 167 puskesmas, replay 17 Sep – 31 Oct 2026 with
    44,932 FIRMS detections.
  - _Requirements: 2.1, 2.2_

- [x] 4. Edge functions take `region`
  - `regionParam` (400 on unknown), per-region bbox and live cells.
  - _Requirements: 2.4, 2.6_

- [x] 5. Web: region switch, briefing panel, CSV, waiting room
  - Region buttons, data per region, briefing panel (copy, WhatsApp, .txt,
    print), puskesmas list panel (export, import, reset, rejected rows),
    indoor table and CR preset, OSM edit link.
  - _Requirements: 1.4, 2.3, 2.5, 3.1–3.3, 4.1–4.4_

- [x] 6. Web: tour, night layer, phone layout, clean console
  - `tour.ts`, Day/Night Band layer, phone CSS, print CSS, smoke source from
    the first frame, imagery starts on the link's date, map error listener.
  - _Requirements: 5.1–5.4_

- [x] 7. MCP server and Kiro surfaces
  - `list_regions`, `daily_brief`, region-aware tools, CR preset from the
    engine; `.kiro/agents/sootsayer-briefer.md`; `power-sootsayer/`.
  - _Requirements: 6.1–6.3_

- [x] 8. Parity and docs
  - `check-parity.mjs` covers every region and the briefing in both languages.
  - METHOD, DATA, DEMO, README, steering updated.
  - _Requirements: 1.2_

- [ ] 9. Owner actions (not doable by the agent)
  - [x] Add `list_regions` and `daily_brief` to `autoApprove` in
    `.kiro/settings/mcp.json` (agent writes to that folder are blocked).
  - [x] Approve the push to `main` (it deploys production).
  - [x] Copernicus ADS account and key (the CC-BY licence was already accepted).
  - [ ] Add `forecast_check` to `autoApprove`.
  - [ ] Kiro Crew is installed; schedule the morning briefing.

- [ ] 10. Replay as forecast and the forecast check
  - [x] Engine: `check.rs`, CLI `forecast-check`, `ss_forecast_check`,
    `BriefMode::Forecast`, unit and property tests.
  - [x] Pipeline: `build_forecast.py` (one ADS request for both regions,
    cached), `ads` extra, forecast entry in `regions.json`; `district_pm10`
    sums like the web.
  - [x] Web: view switch, `asForecast`, run banner, check card,
    `view=forecast` in the URL, ADS credit in the footer.
  - [x] MCP: `mode="forecast"` and `forecast_check`.
  - [x] Parity: forecast check WASM == CLI == the pipeline's table.
  - [ ] Build both regions from the ADS download, test in the browser, and
    add the check results to METHOD.md and README.
  - _Requirements: 7.1–7.5_
