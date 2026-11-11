"""Clients for the live public sources (Copernicus CAMS via Open-Meteo, NASA FIRMS).

Shared by the replay builder and the MCP server so both read data the same way
the web app's edge functions do.
"""

from __future__ import annotations

import csv
import io
import json
import urllib.parse
from collections import defaultdict
from datetime import datetime, timedelta
from statistics import fmean

from . import KALIMANTAN_BBOX
from .http import fetch, fetch_cached

OPEN_METEO_AQ = "https://air-quality-api.open-meteo.com/v1/air-quality"
FIRMS_NRT = "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_SouthEast_Asia_{range}.csv"
FIRMS_AREA = "https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/{source}/{bbox}/{days}/{date}"

CHUNK = 100          # locations per Open-Meteo request
MIN_HOURS = 4        # hourly values needed for a daily mean


def _daily_means(times: list[str], values: list[float | None]) -> dict[str, float | None]:
    by_day: dict[str, list[float]] = defaultdict(list)
    days: list[str] = []
    for t, v in zip(times, values):
        d = t[:10]
        if d not in by_day:
            days.append(d)
            by_day[d]  # create the key
        if v is not None:
            by_day[d].append(float(v))
    return {d: (round(fmean(by_day[d]), 1) if len(by_day[d]) >= MIN_HOURS else None) for d in days}


def cams_daily(cells: list[list[float]], *, start_date: str | None = None, end_date: str | None = None,
               past_days: int | None = None, forecast_days: int | None = None, cache: bool = False,
               only: list[int] | None = None):
    """Daily mean PM2.5 and PM10 (µg/m³, UTC+7 days) for each [lon, lat] cell.

    `only` limits the request to those cell indices (the others come back as
    None), matching what api/air.ts does for live data.
    Returns (days, pm25, pm10, meta) where pm25[cell][day] may be None.
    """
    if only is not None:
        days, sub25, sub10, meta = cams_daily([cells[i] for i in only], start_date=start_date,
                                              end_date=end_date, past_days=past_days,
                                              forecast_days=forecast_days, cache=cache)
        pm25 = [[None] * len(days) for _ in cells]
        pm10 = [[None] * len(days) for _ in cells]
        for k, i in enumerate(only):
            pm25[i], pm10[i] = sub25[k], sub10[k]
        return days, pm25, pm10, meta
    params = {"hourly": "pm2_5,pm10", "domains": "cams_global", "timezone": "Asia/Jakarta",
              "cell_selection": "nearest"}
    if start_date and end_date:
        params |= {"start_date": start_date, "end_date": end_date}
    else:
        params |= {"past_days": past_days or 0, "forecast_days": forecast_days or 5}
    days: list[str] | None = None
    pm25: list[list[float | None]] = []
    pm10: list[list[float | None]] = []
    for i in range(0, len(cells), CHUNK):
        chunk = cells[i:i + CHUNK]
        q = params | {"latitude": ",".join(f"{c[1]:.1f}" for c in chunk),
                      "longitude": ",".join(f"{c[0]:.1f}" for c in chunk)}
        url = OPEN_METEO_AQ + "?" + urllib.parse.urlencode(q)
        raw = fetch_cached(url, suffix=".json", timeout=180) if cache else fetch(url, timeout=180)
        data = json.loads(raw)
        if isinstance(data, dict):
            if data.get("error"):
                raise RuntimeError(f"Open-Meteo error: {data.get('reason')}")
            data = [data]
        if len(data) != len(chunk):
            raise RuntimeError(f"Open-Meteo returned {len(data)} locations for {len(chunk)} requested")
        for loc in data:
            h = loc["hourly"]
            m25 = _daily_means(h["time"], h["pm2_5"])
            m10 = _daily_means(h["time"], h["pm10"])
            if days is None:
                days = list(m25.keys())
            pm25.append([m25.get(d) for d in days])
            pm10.append([m10.get(d) for d in days])
    meta = {"source": "Copernicus CAMS global atmospheric composition forecast via Open-Meteo",
            "license": "CC BY 4.0", "url": OPEN_METEO_AQ, "params": params}
    return days or [], pm25, pm10, meta


def _in_bbox(lon: float, lat: float) -> bool:
    w, s, e, n = KALIMANTAN_BBOX
    return w <= lon <= e and s <= lat <= n


def _wib_date(acq_date: str, acq_time: str) -> str | None:
    """FIRMS dates are UTC; Sootsayer's days are UTC+7 (same rule as api/fires.ts)."""
    try:
        t = str(acq_time).zfill(4)
        moment = datetime(*map(int, acq_date.split("-")), int(t[:2]), int(t[2:4]))
    except (ValueError, TypeError):
        return None
    return (moment + timedelta(hours=7)).date().isoformat()


def _parse_firms_csv(text: str) -> list[list]:
    rows = []
    for r in csv.DictReader(io.StringIO(text)):
        try:
            lat, lon = float(r["latitude"]), float(r["longitude"])
        except (KeyError, ValueError):
            continue
        if not _in_bbox(lon, lat):
            continue
        day = _wib_date(r.get("acq_date", ""), r.get("acq_time", ""))
        if day is None:
            continue
        frp = float(r["frp"]) if r.get("frp") not in (None, "") else None
        rows.append([round(lon, 4), round(lat, 4), day, str(r.get("acq_time", "")).zfill(4),
                     frp, r.get("confidence", ""), r.get("daynight", "")])
    return rows


def firms_nrt(range_: str = "7d") -> tuple[list[list], dict]:
    """NOAA-20 VIIRS near-real-time detections in Kalimantan (no key needed)."""
    if range_ not in ("24h", "48h", "7d"):
        raise ValueError("range must be 24h, 48h, or 7d")
    url = FIRMS_NRT.format(range=range_)
    rows = _parse_firms_csv(fetch(url, timeout=120).decode("utf-8", "replace"))
    return rows, {"source": "NASA FIRMS VIIRS NOAA-20 NRT", "url": url}


FIRMS_MAX_DAYS = 5  # the area API accepts DAY_RANGE 1..5


def firms_area(map_key: str, start_date: str, days: int, source: str) -> list[list]:
    """FIRMS area API (needs a free MAP_KEY), one request of at most 5 days.
    Returns rows dated in UTC+7, so a request can include detections from the
    evening before `start_date` (UTC) that fall on `start_date` locally."""
    if not 1 <= days <= FIRMS_MAX_DAYS:
        raise ValueError(f"FIRMS day range must be 1..{FIRMS_MAX_DAYS}")
    w, s, e, n = KALIMANTAN_BBOX
    url = FIRMS_AREA.format(key=urllib.parse.quote(map_key), source=source,
                            bbox=f"{w},{s},{e},{n}", days=days, date=start_date)
    text = fetch(url, timeout=180).decode("utf-8", "replace")
    head = text.lstrip()[:200]
    if not head.lower().startswith("latitude"):
        # FIRMS answers bad keys and limits with a plain-text message.
        raise RuntimeError(f"FIRMS area API ({source}): {head}")
    return _parse_firms_csv(text)
