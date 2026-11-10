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
               past_days: int | None = None, forecast_days: int | None = None, cache: bool = False):
    """Daily mean PM2.5 and PM10 (µg/m³, UTC+7 days) for each [lon, lat] cell.

    Returns (days, pm25, pm10, meta) where pm25[cell][day] may be None.
    """
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


def _parse_firms_csv(text: str) -> list[list]:
    rows = []
    for r in csv.DictReader(io.StringIO(text)):
        try:
            lat, lon = float(r["latitude"]), float(r["longitude"])
        except (KeyError, ValueError):
            continue
        if not _in_bbox(lon, lat):
            continue
        frp = float(r["frp"]) if r.get("frp") not in (None, "") else None
        rows.append([round(lon, 4), round(lat, 4), r["acq_date"], r.get("acq_time", ""),
                     frp, r.get("confidence", ""), r.get("daynight", "")])
    return rows


def firms_nrt(range_: str = "7d") -> tuple[list[list], dict]:
    """NOAA-20 VIIRS near-real-time detections in Kalimantan (no key needed)."""
    if range_ not in ("24h", "48h", "7d"):
        raise ValueError("range must be 24h, 48h, or 7d")
    url = FIRMS_NRT.format(range=range_)
    rows = _parse_firms_csv(fetch(url, timeout=120).decode("utf-8", "replace"))
    return rows, {"source": "NASA FIRMS VIIRS NOAA-20 NRT", "url": url}


def firms_area(map_key: str, start_date: str, days: int, source: str = "VIIRS_NOAA20_SP") -> list[list]:
    """FIRMS area API (needs a free MAP_KEY). At most 10 days per request."""
    w, s, e, n = KALIMANTAN_BBOX
    url = FIRMS_AREA.format(key=urllib.parse.quote(map_key), source=source,
                            bbox=f"{w},{s},{e},{n}", days=days, date=start_date)
    text = fetch(url, timeout=180).decode("utf-8", "replace")
    if text.lstrip().lower().startswith(("invalid", "error")):
        raise RuntimeError(f"FIRMS area API: {text[:200]}")
    return _parse_firms_csv(text)
