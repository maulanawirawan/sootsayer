"""Build the October 2026 replay snapshot of one region from archived open data.

Output: web/public/data/<region>/replay-2026-10.json (+ replay-2026-10-fires.json)

- CAMS daily means for every grid cell, 17 Sep - 31 Oct 2026 (14 days of
  history before the 1 October window so haze durations start correctly).
- NASA FIRMS VIIRS NOAA-20 fire detections for the same days when a free
  FIRMS_MAP_KEY is available (environment variable or REPO/.env). Without a key
  the replay is haze-only and the app says so.

Run:  uv run --project pipeline python -m sootsayer_pipeline.build_replay --region sumatra
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import urllib.parse
from datetime import UTC, date, datetime, timedelta

from . import DEFAULT_REGION, REGIONS, Region, env, region
from .engine import load_reference, multipolygon
from .engine import run as run_engine
from .http import fetch, write_json
from .sources import FIRMS_MAX_DAYS, cams_daily, firms_area

START, WINDOW_START, END = "2026-09-17", "2026-10-01", "2026-10-31"
SP, NRT = "VIIRS_NOAA20_SP", "VIIRS_NOAA20_NRT"
# Open-Meteo weighs a location with more than 14 days as days/14 calls, so
# 100 locations x 45 days weigh about 321 calls. One uncached chunk per 65 s
# keeps every 60-second window under the free tier's 600 calls per minute.
CAMS_PAUSE_S = 65.0


def date_range(a: str, b: str) -> list[str]:
    d0, d1 = date.fromisoformat(a), date.fromisoformat(b)
    return [(d0 + timedelta(days=i)).isoformat() for i in range((d1 - d0).days + 1)]


def availability(key: str) -> dict[str, tuple[str, str]]:
    """{source: (min_date, max_date)} from FIRMS' data availability endpoint."""
    url = f"https://firms.modaps.eosdis.nasa.gov/api/data_availability/csv/{urllib.parse.quote(key)}/ALL"
    try:
        text = fetch(url, timeout=60).decode("utf-8", "replace")
        return {r["data_id"]: (r["min_date"], r["max_date"]) for r in csv.DictReader(io.StringIO(text))
                if r.get("data_id") and r.get("min_date") and r.get("max_date")}
    except Exception as e:  # availability is a hint; the rows decide in the end
        # Only the error type: the URL carries the MAP_KEY.
        print(f"note: FIRMS availability check failed ({type(e).__name__}); falling back to SP-then-NRT")
        return {}


def fetch_fires(key: str, r: Region) -> tuple[list[list], list[dict]]:
    """Detections whose UTC+7 date falls in START..END.

    FIRMS dates are UTC, so the requests start one UTC day early: the evening of
    16 Sep UTC is the early morning of 17 Sep in Indonesia's western time zone.
    """
    avail = availability(key)
    sp_max = avail.get(SP, ("", ""))[1]
    d, end = date.fromisoformat(START) - timedelta(days=1), date.fromisoformat(END)
    rows: list[list] = []
    requests: list[dict] = []
    while d <= end:
        span = min(FIRMS_MAX_DAYS, (end - d).days + 1)
        last = (d + timedelta(days=span - 1)).isoformat()
        source = SP if sp_max and last <= sp_max else (NRT if sp_max else SP)
        got = firms_area(key, d.isoformat(), span, source, r.bbox)
        if not got and source == SP:
            # Standard processing lags by weeks; use near real time instead.
            source, got = NRT, firms_area(key, d.isoformat(), span, NRT, r.bbox)
        requests.append({"utc_start": d.isoformat(), "days": span, "source": source, "rows": len(got)})
        rows += got
        d += timedelta(days=span)
    seen, kept = set(), []
    for row in rows:
        k = (row[0], row[1], row[2], row[3])
        if START <= row[2] <= END and k not in seen:
            seen.add(k)
            kept.append(row)
    return kept, requests


def build(r: Region) -> None:
    folder = r.data_dir
    grid = json.loads((folder / "grid.json").read_text(encoding="utf-8"))
    days, pm25, pm10, cams_meta = cams_daily(grid["cells"], start_date=START, end_date=END, cache=True,
                                             pause_s=CAMS_PAUSE_S)
    expected = date_range(START, END)
    if days != expected:
        raise SystemExit(f"CAMS days mismatch: got {days[:3]}..{days[-3:]} ({len(days)}), want {len(expected)}")

    key = env("FIRMS_MAP_KEY")
    fires: list[list] = []
    requests: list[dict] = []
    counts: dict[str, list[int]] = {}
    outside = 0
    fire_note = "FIRMS_MAP_KEY not set at build time: replay uses the haze-only definition."
    if key:
        fires, requests = fetch_fires(key, r)
        used = sorted({q["source"] for q in requests})
        fire_note = f"NASA FIRMS {', '.join(used)} via the area API; dates converted from UTC to UTC+7."
        # Count per district per day with the Rust engine (the same code the
        # browser runs), so the browser does not have to place every point.
        districts, _ = load_reference(r.id)
        result = run_engine("fire-counts", {
            "days": days,
            "districts": [{"code": f["properties"]["code"], "multipolygon": multipolygon(f["geometry"])}
                          for f in districts],
            "fires": [[row[0], row[1], row[2]] for row in fires],
        })
        counts, outside = result["counts"], result["outside_districts"]

    missing = sum(v is None for row in pm10 for v in row)
    out = {
        "generated_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "region": r.id,
        "days": days,
        "window_start": WINDOW_START,
        "cams": {"pm25_ugm3": pm25, "pm10_ugm3": pm10, "missing_values": missing, **cams_meta},
        "fires": {"available": bool(key), "note": fire_note, "requests": requests,
                  "total": len(fires), "outside_districts": outside,
                  "district_counts": counts, "points_file": "replay-2026-10-fires.json" if key else None},
        "label": "Replay: archived CAMS model data (hindsight), not the forecast issued on each day.",
    }
    size = write_json(folder / "replay-2026-10.json", out)

    # The points themselves (for the map) go in a second file the app loads
    # after the first frame: [lon, lat, day index, FRP in MW], 3 decimals ~ 110 m
    # (a VIIRS pixel is 375 m).
    index = {d: i for i, d in enumerate(days)}
    points = [[round(row[0], 3), round(row[1], 3), index[row[2]], None if row[4] is None else round(row[4], 1)]
              for row in fires]
    psize = 0
    if key:
        psize = write_json(folder / "replay-2026-10-fires.json",
                           {"days": days, "columns": ["lon", "lat", "day", "frp_mw"], "rows": points,
                            "source": fire_note})
    per_day: dict[str, int] = {}
    for row in fires:
        per_day[row[2]] = per_day.get(row[2], 0) + 1
    print(f"[{r.id}] days={len(days)} cells={len(pm10)} missing_pm10={missing} fires={len(fires)} "
          f"outside_districts={outside} bytes={size} points_bytes={psize}")
    if requests:
        print(f"[{r.id}] FIRMS requests:", json.dumps(requests))
        peak = sorted(per_day.items(), key=lambda kv: -kv[1])[:3]
        print(f"[{r.id}] busiest days:", peak)


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--region", action="append", choices=sorted(REGIONS),
                    help=f"region to build (repeatable); default: {DEFAULT_REGION}")
    args = ap.parse_args(argv)
    for rid in args.region or [DEFAULT_REGION]:
        build(region(rid))
    from .build_reference import write_index

    write_index()


if __name__ == "__main__":
    main()
