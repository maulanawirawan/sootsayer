"""Build the October 2026 replay snapshot from archived open data.

Output: web/public/data/replay-2026-10.json

- CAMS daily means for every grid cell, 17 Sep - 31 Oct 2026 (14 days of
  history before the 1 October window so haze durations start correctly).
- NASA FIRMS VIIRS NOAA-20 fire detections for the same days when a free
  FIRMS_MAP_KEY is available (environment variable or REPO/.env). Without a key
  the replay is haze-only and the app says so.

Run:  uv run --project pipeline python -m sootsayer_pipeline.build_replay
"""

from __future__ import annotations

import csv
import io
import json
import urllib.parse
from datetime import UTC, date, datetime, timedelta

from . import WEB_DATA, env
from .http import fetch, write_json
from .sources import FIRMS_MAX_DAYS, cams_daily, firms_area

START, WINDOW_START, END = "2026-09-17", "2026-10-01", "2026-10-31"
SP, NRT = "VIIRS_NOAA20_SP", "VIIRS_NOAA20_NRT"


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
        print(f"note: FIRMS availability check failed ({e}); falling back to SP-then-NRT per request")
        return {}


def fetch_fires(key: str) -> tuple[list[list], list[dict]]:
    """Detections whose UTC+7 date falls in START..END.

    FIRMS dates are UTC, so the requests start one UTC day early: the evening of
    16 Sep UTC is the early morning of 17 Sep in Kalimantan.
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
        got = firms_area(key, d.isoformat(), span, source)
        if not got and source == SP:
            # Standard processing lags by weeks; use near real time instead.
            source, got = NRT, firms_area(key, d.isoformat(), span, NRT)
        requests.append({"utc_start": d.isoformat(), "days": span, "source": source, "rows": len(got)})
        rows += got
        d += timedelta(days=span)
    seen, kept = set(), []
    for r in rows:
        k = (r[0], r[1], r[2], r[3])
        if START <= r[2] <= END and k not in seen:
            seen.add(k)
            kept.append(r)
    return kept, requests


def main() -> None:
    grid = json.loads((WEB_DATA / "grid.json").read_text(encoding="utf-8"))
    days, pm25, pm10, cams_meta = cams_daily(grid["cells"], start_date=START, end_date=END, cache=True)
    expected = date_range(START, END)
    if days != expected:
        raise SystemExit(f"CAMS days mismatch: got {days[:3]}..{days[-3:]} ({len(days)}), want {len(expected)}")

    key = env("FIRMS_MAP_KEY")
    fires: list[list] = []
    requests: list[dict] = []
    fire_note = "FIRMS_MAP_KEY not set at build time: replay uses the haze-only definition."
    if key:
        fires, requests = fetch_fires(key)
        used = sorted({r["source"] for r in requests})
        fire_note = f"NASA FIRMS {', '.join(used)} via the area API; dates converted from UTC to UTC+7."

    missing = sum(v is None for row in pm10 for v in row)
    out = {
        "generated_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "days": days,
        "window_start": WINDOW_START,
        "cams": {"pm25_ugm3": pm25, "pm10_ugm3": pm10, "missing_values": missing, **cams_meta},
        "fires": {"available": bool(key), "note": fire_note, "requests": requests,
                  "columns": ["lon", "lat", "date_wib", "time_utc", "frp_mw", "confidence", "daynight"],
                  "rows": fires},
        "label": "Replay: archived CAMS model data (hindsight), not the forecast issued on each day.",
    }
    size = write_json(WEB_DATA / "replay-2026-10.json", out)
    per_day = {}
    for r in fires:
        per_day[r[2]] = per_day.get(r[2], 0) + 1
    print(f"days={len(days)} cells={len(pm10)} missing_pm10={missing} fires={len(fires)} bytes={size}")
    if requests:
        print("FIRMS requests:", json.dumps(requests))
        peak = sorted(per_day.items(), key=lambda kv: -kv[1])[:3]
        print("busiest days:", peak)


if __name__ == "__main__":
    main()
