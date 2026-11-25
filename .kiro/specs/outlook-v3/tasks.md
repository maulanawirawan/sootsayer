# Outlook v3: tasks

- [x] 1. Engine: chance model types, deterministic ln/exp, chance per window day, peaks, model id (R1)
- [x] 2. Engine: chance-check entry point (CLI, WASM, JSON) with contingency table, Brier, reliability (R2.3)
- [x] 3. Engine: briefing with peak chance per ranked line, watch list and model line in both languages (R3)
- [x] 4. Engine: unit and property tests; method constants in method.rs and METHOD.md (R1, R2)
- [x] 5. Pipeline: build_chance with scikit-learn, purged fold models, agreement check, regions.json entry (R2.1, R2.2, R2.5)
- [x] 6. Parity: forecast-mode outlook and briefing with a fold model, chance check vs the stored table (R2.4)
- [x] 7. Web: load the chance file, pick final or fold model by mode, chance column, peak and watch line, check card, help (R2.6, R2.7, R4.5, R4.6)
- [x] 8. Web: start card and plain sentences in the district and puskesmas panels, both languages (R4.1 to R4.4)
- [x] 9. MCP: same model choice as the web app, chance in the tools' answers and caveats (R2.6)
- [x] 10. Docs: METHOD.md section, DATA.md file entry, README, steering (tech, structure), briefer agent rule

## Decisions made while building
- The watch level moved from 0.5 (design) to 0.3: at 0.5 the held-out test
  caught about as many haze days as the raw rule (Kalimantan +1 day 79% vs
  75%, Sumatra 51% vs 49%); at 0.3 it caught 88% and 70%, with more false
  alarms (25% and 40% of warnings). For clinic preparation a missed haze day
  costs more. Chosen after the test, so METHOD.md says a new season is the
  real test.
- Chances read ">99%" and "<1%" at the ends: a forecast is never certain.
- The guided tour button says "about 75 seconds": its steps add up to 74 s.

## Verification
- `cargo test`: 38 unit tests and 10 property tests pass.
- `node web/scripts/engine-check.mjs`: every parity line identical, including
  the forecast-mode outlook and briefing with a fold model and the chance's
  test table (WASM == CLI == pipeline).
- build_chance: engine chance vs scikit-learn probability, largest difference
  0.0005 over every pair (the rounding).
- Browser (dev server): start card, plain sentences, chance column and watch
  list in "What was forecast", no chance in "What happened", live note in
  Sumatra, briefing lines; no console errors.
