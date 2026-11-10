"""Build the October 2026 replay snapshot from archived open data.

Output: web/public/data/replay-2026-10.json

- CAMS daily means for every grid cell, 17 Sep - 31 Oct 2026 (14 days of
  history before the 1 October window so haze durations start correctly).
- FIRMS fire detections for the same dates when FIRMS_MAP_KEY is set; without
  a key the replay is haze-only and says so.

Run:  uv run --project pipeline python -m sootsayer_pipeline.build_replay
"""

from __future__ import annotations

import json
import os
from datetime import UTC, date, datetime, timedelta

from . import WEB_DATA
from .http import write_json
from .sources import cams_daily, firms_area

START, WINDOW_START, END = "2026-09-17", "2026-10-01", "2026-10-31"


def date_range(a: str, b: str) -> list[str]:
    d0, d1 = date.fromisoformat(a), date.fromisoformat(b)
    return [(d0 + timedelta(days=i)).isoformat() for i in range((d1 - d0).days + 1)]


def main() -> None:
    grid = json.loads((WEB_DATA / "grid.json").read_text(encoding="utf-8"))
    days, pm25, pm10, cams_meta = cams_daily(grid["cells"], start_date=START, end_date=END, cache=True)
    expected = date_range(START, END)
    if days != expected:
        raise SystemExit(f"CAMS days mismatch: got {days[:3]}..{days[-3:]} ({len(days)}), want {len(expected)}")

    key = os.environ.get("FIRMS_MAP_KEY", "").strip()
    fires: list[list] = []
    fire_note = "FIRMS_MAP_KEY not set at build time: replay uses the haze-only definition."
    if key:
        d = date.fromisoformat(START)
        while d.isoformat() <= END:
            span = min(10, (date.fromisoformat(END) - d).days + 1)
            fires += firms_area(key, d.isoformat(), span)
            d += timedelta(days=span)
        fire_note = "NASA FIRMS VIIRS NOAA-20 standard/NRT archive via the area API."

    missing = sum(v is None for row in pm10 for v in row)
    out = {
        "generated_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "days": days,
        "window_start": WINDOW_START,
        "cams": {"pm25_ugm3": pm25, "pm10_ugm3": pm10, "missing_values": missing, **cams_meta},
        "fires": {"available": bool(key), "note": fire_note,
                  "columns": ["lon", "lat", "date", "time", "frp_mw", "confidence", "daynight"],
                  "rows": fires},
        "label": "Replay: archived CAMS model data (hindsight), not the forecast issued on each day.",
    }
    size = write_json(WEB_DATA / "replay-2026-10.json", out)
    print(f"days={len(days)} cells={len(pm10)} missing_pm10={missing} fires={len(fires)} bytes={size}")


if __name__ == "__main__":
    main()
