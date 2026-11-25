# Outlook v3: design

## Overview
```
pipeline/build_chance.py  (scikit-learn, build time)
  replay-2026-10.json + replay-2026-10-forecast.json
    -> features per (district, issue day, lead day)
    -> LogisticRegression per lead day: final model + 4 purged fold models
    -> engine chance-check on held-out chances -> test table
    -> web/public/data/<region>/chance-2026-10.json, listed in regions.json
engine (Rust, WASM + CLI)
  outlook(input with haze_chance_model) -> haze_chance per window day,
    peak per district and in the priority list
  chance-check(models, pairs) -> per lead day table, Brier, reliability
  brief -> peak chance per ranked line, watch list, model line
web + MCP
  live: final model; replay "What was forecast": fold model of that week;
  replay "What happened": no model
```

## Decisions
### D1 Logistic regression per lead day (MOS), not deep learning
One month of
   district-days (about 1,600 pairs per lead day and region) is far too little
   for a neural network, and a health office has to be able to read the
   method in one line. MOS is how weather services have corrected model
   output since the 1970s (Glahn and Lowry 1972). Two inputs: the forecast
   district PM10 of that day and the district PM10 of the day before the
   window, both on a log scale. Alternatives considered: gradient boosting
   (more parameters than the data supports, harder to evaluate in Rust),
   persistence alone (worse than the raw forecast in the feasibility run).
### D2 The chance is an extra layer
Haze-day classification, duration,
   relative risks and ranking stay the study's method on PM10 >= 100. The
   chance tells how likely that haze day is; it never changes a visit
   estimate.
### D3 Purged leave-one-week-out
Neighbouring days are correlated, so a
   random split would flatter the model. Each fold leaves out one issue week,
   plus every training pair whose target day or input day falls on a day the
   left-out week's targets cover (issue day to issue day + 4).
### D4 Fold models in the replay
Every chance shown in the October replay
   comes from a model that did not see that week. Live mode uses the model
   trained on all of October, by analogy: it was trained on the 12:00 UTC runs
   from the Atmosphere Data Store, and live mode reads the latest CAMS run
   through Open-Meteo.
### D5 Deterministic maths
`ln` and `exp` are written with + − × ÷ and
   rounding only (range reduction plus a series), because the platform libm
   does not promise identical bits on WebAssembly and native. The chance is
   rounded to 0.001.
### D6 The engine computes the test table
, from held-out chances it computes
   itself with the fold models, so the parity check can compare WASM, CLI and
   the stored file. scikit-learn trains; the pipeline checks that the engine
   reproduces scikit-learn's probabilities within 0.0006 (rounding is 0.0005).
### D7 Watch threshold 0.3
Planned as 0.5 ("more likely than not"); changed to 0.3 during the build,
after the held-out test showed that 0.5 caught barely more haze days than
the raw rule (see tasks.md, "Decisions made while building"). It lives in
`method.rs` with the floor of 1 µg/m³, and in `docs/METHOD.md`.
### D8 Plain sentences are templates
in `web/src/i18n.ts` filled with engine
   numbers; no number is computed in the UI.

## Data shapes
Engine input (outlook): `haze_chance_model: {id, coefficients: [[a, b, c], ...]}`,
one row per lead day: chance = 1 / (1 + e^−(a + b ln F + c ln Y)).

Engine output: `days[].haze_chance`, `peak_haze_chance: {chance, date}` on
districts and priority entries, `haze_chance_model` (id).

Chance check input: `{lead_days, models: [...], pairs: [[model, lead, F, Y, truth], ...]}`.
Output: per lead day the contingency table at the alert threshold, `brier`,
`brier_raw`, plus `reliability` (five bins: n, mean chance, observed share).

File `chance-2026-10.json`: method text, library version, inputs, final model,
fold models with their issue weeks, the engine's test table, the agreement
with scikit-learn, sample counts, generation time and the CAMS attribution.

## Testing
- Unit: ln/exp against known values, chance bounds, missing inputs, bad
  models, the contingency table, Brier and bins.
- Property: chance in [0, 1]; a model with a positive slope never lowers the
  chance when the forecast PM10 rises; no model means no chance and an
  unchanged outlook otherwise.
- Parity: a forecast-mode outlook and briefing with a fold model, and the
  chance check, WASM == CLI == pipeline.
