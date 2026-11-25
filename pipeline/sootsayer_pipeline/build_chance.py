"""Haze-day chance (outlook v3): a statistical correction of the CAMS forecast.

For each region with the October 2026 forecast replay, this trains one
logistic regression per lead day with scikit-learn (model output statistics,
the way weather services correct model output):

    chance = 1 / (1 + exp(-(a + b ln F + c ln Y)))

F = forecast district PM10 of that day (the CAMS run available at 06:00 WIB
on the first window day), Y = district PM10 of the day before the window
(hindsight, known that morning), both floored at 1 ug/m3. Target: a haze day
in hindsight (district PM10 >= 100 ug/m3, archived CAMS data, not stations).

Honest test: purged leave-one-week-out. For each issue week (1-7, 8-14, 15-21,
22-31 Oct) a fold model is trained without that week and without any pair
whose target day or input day falls on a day the week's targets cover. The
Rust engine then computes the chances the app shows and the test table
(chance-check) from those fold models; this script stops if the engine's
chance and scikit-learn's probability ever differ by more than 0.0006.

Output: web/public/data/<region>/chance-2026-10.json, listed in regions.json.

Run:  uv run --project pipeline --extra ml python -m sootsayer_pipeline.build_chance [--region kalimantan]
"""

from __future__ import annotations

import argparse
import json
from datetime import UTC, date, datetime, timedelta

from . import REGIONS, Region
from .build_reference import write_index
from .chance import FILE, engine_model
from .engine import district_pm10, load_reference
from .engine import run as run_engine
from .http import write_json

FLOOR = 1.0  # engine/src/method.rs CHANCE_FLOOR_UGM3
HAZE = 100.0  # engine/src/method.rs HAZE_PM10_UGM3 (training target only)
C_REG = 1.0
WEEKS = [(1, 7), (8, 14), (15, 21), (22, 31)]
TOLERANCE = 0.0006  # the engine rounds to 0.001
ATTRIBUTION = ("Contains modified Copernicus Atmosphere Monitoring Service information 2026. Neither the "
               "European Commission nor ECMWF is responsible for any use that may be made of the "
               "Copernicus information or data it contains.")


def iso_plus(iso: str, n: int) -> str:
    return (date.fromisoformat(iso) + timedelta(days=n)).isoformat()


def week_of(iso: str) -> int:
    day = date.fromisoformat(iso).day
    return next(i for i, (a, b) in enumerate(WEEKS) if a <= day <= b)


def samples(r: Region):
    """Every (district, issue day, lead day) pair with its inputs and target."""
    districts, _ = load_reference(r.id)
    replay = json.loads((r.data_dir / "replay-2026-10.json").read_text(encoding="utf-8"))
    fc = json.loads((r.data_dir / "replay-2026-10-forecast.json").read_text(encoding="utf-8"))
    hind = district_pm10(districts, replay["cams"]["pm10_ugm3"])
    day_index = {d: i for i, d in enumerate(replay["days"])}
    codes = [f["properties"]["code"] for f in districts]
    rows = []
    for i, d0 in enumerate(fc["issue_dates"]):
        forecast = district_pm10(districts, [list(col) for col in zip(*fc["pm10_ugm3"][i])])
        before = day_index.get(iso_plus(d0, -1))
        for k in range(fc["lead_days"]):
            target = iso_plus(d0, k)
            ti = day_index.get(target)
            for code in codes:
                rows.append({
                    "issue": d0, "lead": k, "district": code, "target": target,
                    "F": forecast[code][k],
                    "Y": hind[code][before] if before is not None else None,
                    "truth": hind[code][ti] if ti is not None else None,
                })
    return districts, replay, fc, rows


def usable(s: dict) -> bool:
    return s["F"] is not None and s["Y"] is not None and s["truth"] is not None


def features(rows):
    import numpy as np

    f = np.array([s["F"] for s in rows], dtype=float)
    y = np.array([s["Y"] for s in rows], dtype=float)
    return np.column_stack([np.log(np.maximum(f, FLOOR)), np.log(np.maximum(y, FLOOR))])


def fit(rows, lead_days: int) -> list[list[float]]:
    """One logistic regression per lead day: [intercept, b (ln F), c (ln Y)]."""
    import numpy as np
    from sklearn.linear_model import LogisticRegression

    out = []
    for k in range(lead_days):
        part = [s for s in rows if s["lead"] == k and usable(s)]
        target = np.array([s["truth"] >= HAZE for s in part], dtype=int)
        if len(set(target.tolist())) < 2:
            raise SystemExit(f"lead day {k}: training data has only one class; cannot fit")
        m = LogisticRegression(C=C_REG, max_iter=1000).fit(features(part), target)
        out.append([float(m.intercept_[0]), float(m.coef_[0][0]), float(m.coef_[0][1])])
    return out


def probability(coef: list[float], s: dict) -> float:
    import math

    z = coef[0] + coef[1] * math.log(max(s["F"], FLOOR)) + coef[2] * math.log(max(s["Y"], FLOOR))
    return 1.0 / (1.0 + math.exp(-z))


def purged_training(rows, week: int, issues: list[str]):
    """Training pairs for the fold that leaves out `week`."""
    test = [d for d in issues if week_of(d) == week]
    first, last = test[0], iso_plus(test[-1], 4)  # days the test targets cover
    keep = []
    for s in rows:
        if week_of(s["issue"]) == week:
            continue
        if first <= s["target"] <= last or first <= iso_plus(s["issue"], -1) <= last:
            continue
        keep.append(s)
    return test, keep


def engine_chances(districts, replay, fc, folds, fold_of_issue):
    """The chances the app shows: the engine's outlook in forecast mode, per
    issue day, with that week's fold model (mirrors web/src/data.ts)."""
    days_all = replay["days"]
    out = {}
    for i, d0 in enumerate(fc["issue_dates"]):
        d_idx = days_all.index(d0)
        end = min(d_idx + fc["lead_days"] - 1, len(days_all) - 1)
        days = days_all[: end + 1]
        cells = [series[: end + 1] for series in replay["cams"]["pm10_ugm3"]]
        cells = [list(s) for s in cells]
        for k in range(fc["lead_days"]):
            if d_idx + k <= end:
                for c in range(len(cells)):
                    cells[c][d_idx + k] = fc["pm10_ugm3"][i][k][c]
        pm = district_pm10(districts, cells)
        inp = {
            "days": days, "window_start": d0,
            "districts": [{"code": f["properties"]["code"], "name": f["properties"]["name"],
                           "profile": f["properties"]["profile"], "pm10_ugm3": pm[f["properties"]["code"]],
                           "fire_count": [None] * len(days)} for f in districts],
            "puskesmas": [],
            "haze_chance_model": engine_model(folds[fold_of_issue[d0]]),
        }
        res = run_engine("outlook", inp)
        for d in res["districts"]:
            for day in d["days"]:
                if day["in_window"]:
                    out[(d0, day["date"], d["code"])] = day["haze_chance"]
    return out


def build(r: Region) -> None:
    import sklearn

    districts, replay, fc, rows = samples(r)
    issues = fc["issue_dates"]
    lead_days = fc["lead_days"]
    final = {"id": f"{r.id}-2026-10", "coefficients": fit(rows, lead_days)}
    folds, fold_of_issue = [], {}
    for w in range(len(WEEKS)):
        test, train = purged_training(rows, w, issues)
        a, b = WEEKS[w]
        folds.append({
            "id": f"{r.id}-2026-10-without-{a}-{b}-oct",
            "issue_dates": [test[0], test[-1]],
            "training_pairs": sum(1 for s in train if usable(s)),
            "coefficients": fit(train, lead_days),
        })
        for d in test:
            fold_of_issue[d] = w

    # The engine must reproduce scikit-learn's probabilities.
    shown = engine_chances(districts, replay, fc, folds, fold_of_issue)
    worst, compared = 0.0, 0
    last_day = replay["days"][-1]
    for s in rows:
        # The app's window ends with the replay (31 Oct); later targets have no outlook day.
        if s["F"] is None or s["Y"] is None or s["target"] > last_day:
            continue
        p_engine = shown.get((s["issue"], s["target"], s["district"]))
        if p_engine is None:
            raise SystemExit(f"engine gave no chance for {s['district']} {s['issue']} +{s['lead']}")
        p_sklearn = probability(folds[fold_of_issue[s["issue"]]]["coefficients"][s["lead"]], s)
        worst = max(worst, abs(p_engine - p_sklearn))
        compared += 1
    if worst > TOLERANCE:
        raise SystemExit(f"[{r.id}] engine and scikit-learn disagree by {worst:.6f} (> {TOLERANCE}); not writing")

    pairs = [[fold_of_issue[s["issue"]], s["lead"], s["F"], s["Y"], s["truth"]] for s in rows]
    check = run_engine("chance-check", {"lead_days": lead_days, "models": [engine_model(f) for f in folds], "pairs": pairs})
    trained = [s for s in rows if usable(s)]
    out = {
        "generated_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "region": r.id,
        "method": (f"Model output statistics: one logistic regression per lead day (scikit-learn {sklearn.__version__} "
                   f"LogisticRegression, L2, C={C_REG}, lbfgs), evaluated by the Sootsayer engine."),
        "inputs": ["ln of the forecast district PM10 of the day (CAMS run of 12:00 UTC the day before the window, ADS)",
                   "ln of the district PM10 of the day before the window (hindsight, known that morning)",
                   "both floored at 1 ug/m3"],
        "target": "a haze day in hindsight: district daily mean PM10 >= 100 ug/m3 (archived CAMS data, not stations)",
        "training": {"issue_dates": [issues[0], issues[-1]], "pairs": len(trained),
                     "haze_share": round(sum(1 for s in trained if s["truth"] >= HAZE) / len(trained), 3)},
        "final": final,
        "folds": folds,
        "test": "purged leave-one-week-out: each week is scored by a model trained without it and without the days its targets cover",
        "check": check,
        "agreement": {"pairs": compared, "max_abs_diff": round(worst, 6), "tolerance": TOLERANCE,
                      "note": "engine chance (rounded to 0.001) vs scikit-learn probability, every pair"},
        "source": f"Copernicus CAMS global forecasts (ADS, DOI 10.24381/04a0b097) and archive (Open-Meteo), CC BY 4.0. {ATTRIBUTION}",
    }
    size = write_json(r.data_dir / FILE, out)
    print(f"[{r.id}] {FILE}: {size} bytes; trained on {len(trained)} pairs; engine vs scikit-learn max diff {worst:.6f}")
    for row in check["leads"]:
        print(f"[{r.id}] lead +{row['lead_day']}: hits={row['hits']} misses={row['misses']} false_alarms={row['false_alarms']} "
              f"pod={row['pod']:.3f} far={row['far']:.3f} brier={row['brier']:.3f} (raw {row['brier_raw']:.3f})")
    print(f"[{r.id}] reliability: " + ", ".join(
        f"{b['from']:.1f}-{b['to']:.1f}: {b['mean_chance'] or 0:.2f} vs {b['observed'] or 0:.2f} (n={b['n']})" for b in check["reliability"]))


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--region", action="append", choices=sorted(REGIONS), help="region (repeatable); default: every region with a forecast replay")
    args = ap.parse_args(argv)
    ids = args.region or [rid for rid, r in REGIONS.items() if (r.data_dir / "replay-2026-10-forecast.json").exists()]
    for rid in ids:
        build(REGIONS[rid])
    write_index()
    print("regions.json updated")


if __name__ == "__main__":
    main()
