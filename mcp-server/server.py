"""Sootsayer MCP server.

Gives an AI agent (for example inside Kiro) the same outlook the web app
shows. Data comes from the same open sources and the numbers come from the same
Rust engine (its native CLI; the web app runs it as WebAssembly).

Run:  uv run --project mcp-server python mcp-server/server.py
"""

from __future__ import annotations

import json
import time
import unicodedata
from datetime import date, timedelta
from typing import Any, Literal

from mcp.server.mcpserver import MCPServer

from sootsayer_pipeline import WEB_DATA
from sootsayer_pipeline.engine import (
    district_pm10,
    fire_counts,
    load_reference,
    outlook_input,
    run,
)
from sootsayer_pipeline.sources import cams_daily, firms_nrt

# MCP Python SDK v2: FastMCP is now MCPServer (same decorators).
mcp = MCPServer("sootsayer")

DISTRICTS, PUSKESMAS = load_reference()
GRID = json.loads((WEB_DATA / "grid.json").read_text(encoding="utf-8"))
_CACHE: dict[str, tuple[float, Any]] = {}
LIVE_TTL_S = 30 * 60

Mode = Literal["live", "replay"]


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return " ".join(s.replace("kabupaten", "").replace("kab.", "").split())


def _today_wib() -> str:
    return time.strftime("%Y-%m-%d", time.gmtime(time.time() + 7 * 3600))


def _plus(d: str, n: int) -> str:
    return (date.fromisoformat(d) + timedelta(days=n)).isoformat()


def _dataset(mode: Mode) -> dict:
    """Days, cell PM10, fire counts per district, and which days have fire data."""
    key = f"ds:{mode}"
    hit = _CACHE.get(key)
    if hit and (mode == "replay" or time.time() - hit[0] < LIVE_TTL_S):
        return hit[1]
    errors: list[str] = []
    precomputed: dict[str, list[int]] | None = None
    if mode == "replay":
        rep = json.loads((WEB_DATA / "replay-2026-10.json").read_text(encoding="utf-8"))
        days, pm10 = rep["days"], rep["cams"]["pm10_ugm3"]
        # Fire counts per district per day were made by the same engine at build time.
        precomputed = rep["fires"].get("district_counts") or None
        rows = []
        known = set(days) if rep["fires"]["available"] and precomputed else set()
        anchor, stamp = rep["window_start"], rep["generated_at"]
        selectable = [d for d in days if d >= anchor]
    else:
        days, _, pm10, _ = cams_daily(GRID["cells"], past_days=14, forecast_days=5, only=GRID["fetch_cells"])
        anchor = _today_wib() if _today_wib() in days else days[-5]
        try:
            rows, _ = firms_nrt("7d")
            known = {d for d in days if _plus(anchor, -6) <= d <= anchor}
        except Exception as e:  # FIRMS down: haze-only, and say so
            rows, known = [], set()
            errors.append(f"NASA FIRMS failed: {e}")
        stamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        selectable = days
    counts = precomputed if precomputed is not None else (fire_counts(DISTRICTS, days, rows) if rows else {})
    ds = {"mode": mode, "days": days, "pm10": pm10, "counts": counts, "known": known,
          "anchor": anchor, "selectable": selectable, "fetched_at": stamp, "errors": errors}
    _CACHE[key] = (time.time(), ds)
    return ds


def _outlook(mode: Mode, day: str | None, baselines: dict[str, float] | None = None) -> tuple[dict, dict]:
    ds = _dataset(mode)
    if mode == "live":
        window_start, last = ds["anchor"], ds["days"][-1]
    else:
        window_start = day if day in ds["selectable"] else "2026-10-15"
        last = min(_plus(window_start, 4), ds["days"][-1])
    n = ds["days"].index(last) + 1
    days = ds["days"][:n]
    pm = {k: v[:n] for k, v in district_pm10(DISTRICTS, ds["pm10"]).items()}
    counts = {k: v[:n] for k, v in ds["counts"].items()}
    inp = outlook_input(days, window_start, DISTRICTS, pm, counts, ds["known"], PUSKESMAS, baselines)
    return run("outlook", inp), ds


def _find(items: list[dict], query: str, field: str = "name") -> list[dict]:
    q = _norm(query)
    exact = [x for x in items if _norm(x[field]) == q or x.get("code") == query or x.get("id") == query]
    return exact or [x for x in items if q in _norm(x[field])]


def _pct(r: dict | None) -> str:
    if not r:
        return "n/a"
    return f"{r['point'] * 100:+.0f}% (95% range {r['low'] * 100:+.0f}% to {r['high'] * 100:+.0f}%)"


@mcp.tool()
def list_districts() -> list[dict]:
    """List the 56 Kalimantan districts Sootsayer covers, with their profile
    (kota or kabupaten) and how many puskesmas OpenStreetMap maps there."""
    return [{k: f["properties"][k] for k in ("code", "name", "province", "profile", "puskesmas_mapped")}
            for f in DISTRICTS]


@mcp.tool()
def priority(mode: Mode = "live", date: str | None = None, top: int = 10) -> dict:
    """Districts ranked for posko and rumah oksigen by the expected relative
    change in respiratory visits over a five-day window. mode="live" uses
    today's CAMS forecast and NASA FIRMS fires; mode="replay" replays October
    2026 from archived CAMS data (window starts at `date`, default 2026-10-15)."""
    out, ds = _outlook(mode, date)
    ranked = [p for p in out["priority"] if p["complete"] and p["haze_days"] > 0][: max(1, min(top, 56))]
    return {
        "window_start": out["window_start"],
        "window_days": [d for d in out["days"] if d >= out["window_start"]],
        "ranked": [{"rank": p["rank"], "district": p["district_name"], "code": p["district_code"],
                    "mean_change": p["mean_change"], "haze_days": p["haze_days"],
                    "fire_haze_days": p["fire_haze_days"], "puskesmas_mapped": p["puskesmas_count"]}
                   for p in ranked],
        "incomplete": [p["district_name"] for p in out["priority"] if not p["complete"]],
        "data": {"mode": mode, "fetched_at": ds["fetched_at"], "errors": ds["errors"],
                 "fire_data_days": sorted(ds["known"])},
        "method": out["method"],
    }


@mcp.tool()
def haze_outlook(district: str, mode: Mode = "live", date: str | None = None) -> dict:
    """Day-by-day haze classification and expected change in respiratory
    visits for one district (name or code, e.g. "Pulang Pisau"), with 95%
    ranges, data times, method source, and limits."""
    matches = _find([f["properties"] for f in DISTRICTS], district)
    if len(matches) != 1:
        return {"error": "district not found or ambiguous", "candidates": [m["name"] for m in matches[:10]]}
    code = matches[0]["code"]
    out, ds = _outlook(mode, date)
    d = next(x for x in out["districts"] if x["code"] == code)
    rank = next((p["rank"] for p in out["priority"] if p["district_code"] == code), None)
    window = [x for x in d["days"] if x["in_window"]]
    summary = (f"{d['name']} ({d['profile']} profile): {d['haze_days']} haze day(s) in the "
               f"{len(window)}-day window from {out['window_start']}, of which {d['fire_haze_days']} with "
               f"local fires. Expected change in puskesmas respiratory visits: {_pct(d['window_mean_change'])}. "
               f"Priority rank: {rank if rank else 'not ranked (incomplete data)'}.")
    return {
        "summary": summary,
        "district": {"code": code, "name": d["name"], "profile": d["profile"],
                     "puskesmas_mapped": matches[0]["puskesmas_mapped"]},
        "days": [{"date": x["date"], "status": x["status"], "duration_days": x["duration_days"],
                  "pm10_ugm3": None if x["pm10_ugm3"] is None else round(x["pm10_ugm3"], 1),
                  "fire_count": x["fire_count"], "fire_data": x["fire_data"],
                  "change": None if not x["rr"] else {k: round(v - 1, 4) for k, v in x["rr"].items()}}
                 for x in window],
        "mean_change": d["window_mean_change"],
        "complete": d["complete"],
        "data": {"mode": mode, "fetched_at": ds["fetched_at"], "errors": ds["errors"]},
        "method": out["method"],
    }


@mcp.tool()
def clinic_plan(puskesmas: str, unit_cadr_m3h: float, floor_area_m2: float = 48.0,
                ceiling_height_m: float = 3.0, baseline_visits_per_day: float | None = None,
                mode: Mode = "live", date: str | None = None) -> dict:
    """Outlook for one puskesmas (name or OSM id) plus a clean-air room plan:
    expected respiratory visits per day with 95% ranges, extra visits over the
    window, and how many purifiers of the given rated CADR (m3/h) a room needs
    for 5 clean air changes per hour. Pass the puskesmas' own usual daily
    respiratory visits as baseline_visits_per_day when known."""
    matches = _find(PUSKESMAS, puskesmas)
    if len(matches) != 1:
        return {"error": "puskesmas not found or ambiguous",
                "candidates": [f"{m['name']} ({m['district_code']}, {m['id']})" for m in matches[:10]]}
    pk = matches[0]
    baselines = {pk["id"]: baseline_visits_per_day} if baseline_visits_per_day is not None else None
    out, ds = _outlook(mode, date, baselines)
    p = next(x for x in out["puskesmas"] if x["id"] == pk["id"])
    room = run("clean-air", {"floor_area_m2": floor_area_m2, "ceiling_height_m": ceiling_height_m,
                             "unit_cadr_m3h": unit_cadr_m3h})
    days = [x for x in p["days"] if x["in_window"]]
    extra = p["window_extra"]
    summary = (f"{p['name']}: usual {p['baseline_visits_per_day']:g} respiratory visits/day "
               f"({p['baseline_source'].replace('_', ' ')}). Over {len(days)} days from {out['window_start']} "
               f"expect {extra['point']:+.1f} extra visits (95% range {extra['low']:+.1f} to {extra['high']:+.1f}). "
               f"A {floor_area_m2:g} m2 x {ceiling_height_m:g} m room needs {room['units']} purifier(s) "
               f"of {unit_cadr_m3h:g} m3/h.")
    return {
        "summary": summary,
        "puskesmas": {"id": p["id"], "name": p["name"], "district_code": p["district_code"],
                      "lon": pk["lon"], "lat": pk["lat"]},
        "baseline_visits_per_day": p["baseline_visits_per_day"],
        "baseline_source": p["baseline_source"],
        "days": [{"date": x["date"], "expected": x["expected"], "extra": x["extra"]} for x in days],
        "window_extra": extra,
        "clean_air_room": room,
        "data": {"mode": mode, "fetched_at": ds["fetched_at"], "errors": ds["errors"]},
        "method": out["method"],
    }


if __name__ == "__main__":
    mcp.run()
