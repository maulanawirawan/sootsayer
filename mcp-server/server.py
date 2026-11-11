"""Sootsayer MCP server.

Gives an AI agent (for example inside Kiro or Kiro Crew) the same outlook the
web app shows. Data comes from the same open sources and the numbers and the
briefing text come from the same Rust engine (its native CLI; the web app runs
it as WebAssembly).

Run:  uv run --project mcp-server python mcp-server/server.py
"""

from __future__ import annotations

import json
import time
import unicodedata
import urllib.parse
from datetime import date, timedelta
from typing import Any, Literal

from mcp.server.mcpserver import MCPServer

from sootsayer_pipeline import DEFAULT_REGION, REGIONS
from sootsayer_pipeline.engine import district_pm10, fire_counts, load_reference, outlook_input, run
from sootsayer_pipeline.sources import cams_daily, firms_nrt

# MCP Python SDK v2: FastMCP is now MCPServer (same decorators).
mcp = MCPServer("sootsayer")

APP_URL = "https://sootsayer.vercel.app"
REPLAY_DEFAULT_DAY = "2026-10-15"
LIVE_TTL_S = 30 * 60

Mode = Literal["live", "replay"]
Lang = Literal["id", "en"]


def _load_regions() -> dict[str, dict]:
    out = {}
    for rid, r in REGIONS.items():
        if not (r.data_dir / "districts.geojson").exists():
            continue
        districts, puskesmas = load_reference(rid)
        grid = json.loads((r.data_dir / "grid.json").read_text(encoding="utf-8"))
        out[rid] = {"region": r, "districts": districts, "puskesmas": puskesmas, "grid": grid}
    return out


REFS = _load_regions()
_CACHE: dict[str, tuple[float, Any]] = {}
# CADR presets come from the engine (engine/src/method.rs), never from here.
CR_BOX = run("clean-air", {"floor_area_m2": 1, "ceiling_height_m": 1, "unit_cadr_m3h": 1})["presets"][0]


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return " ".join(s.replace("kabupaten", "").replace("kab.", "").split())


def _today_wib() -> str:
    return time.strftime("%Y-%m-%d", time.gmtime(time.time() + 7 * 3600))


def _plus(d: str, n: int) -> str:
    return (date.fromisoformat(d) + timedelta(days=n)).isoformat()


def _region(region: str) -> dict:
    if region not in REFS:
        raise ValueError(f"unknown region '{region}'; known: {', '.join(REFS)}")
    return REFS[region]


def _dataset(region: str, mode: Mode) -> dict:
    """Days, cell PM2.5/PM10, fire counts per district, and which days have fire data."""
    key = f"ds:{region}:{mode}"
    hit = _CACHE.get(key)
    if hit and (mode == "replay" or time.time() - hit[0] < LIVE_TTL_S):
        return hit[1]
    ref = _region(region)
    errors: list[dict] = []
    precomputed: dict[str, list[int]] | None = None
    if mode == "replay":
        path = ref["region"].data_dir / "replay-2026-10.json"
        if not path.exists():
            raise ValueError(f"no replay snapshot for region '{region}'")
        rep = json.loads(path.read_text(encoding="utf-8"))
        days, pm25, pm10 = rep["days"], rep["cams"]["pm25_ugm3"], rep["cams"]["pm10_ugm3"]
        # Fire counts per district per day were made by the same engine at build time.
        precomputed = rep["fires"].get("district_counts") or None
        rows = []
        known = set(days) if rep["fires"]["available"] and precomputed else set()
        anchor = rep["window_start"]
        # Source names only, the same as the web app, so both briefings match.
        label = "Copernicus CAMS + NASA FIRMS" if known else "Copernicus CAMS"
        stamps = [{"source": label, "time": rep["generated_at"]}]
        selectable = [d for d in days if d >= anchor]
    else:
        grid = ref["grid"]
        days, pm25, pm10, _ = cams_daily(grid["cells"], past_days=14, forecast_days=5, only=grid["fetch_cells"])
        fetched = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        stamps = [{"source": "CAMS (Open-Meteo)", "time": fetched}]
        anchor = _today_wib() if _today_wib() in days else days[-5]
        try:
            rows, _ = firms_nrt(ref["region"].bbox, "7d")
            known = {d for d in days if _plus(anchor, -6) <= d <= anchor}
            stamps.append({"source": "NASA FIRMS", "time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
        except Exception as e:  # FIRMS down: haze-only, and say so
            rows, known = [], set()
            # One line: the engine's briefing refuses control characters.
            errors.append({"source": "NASA FIRMS", "error": " ".join(str(e).split())[:300] or type(e).__name__})
        selectable = days
    counts = precomputed if precomputed is not None else (fire_counts(ref["districts"], days, rows) if rows else {})
    ds = {"region": region, "mode": mode, "days": days, "pm25": pm25, "pm10": pm10, "counts": counts,
          "known": known, "anchor": anchor, "selectable": selectable, "stamps": stamps, "errors": errors}
    _CACHE[key] = (time.time(), ds)
    return ds


def _window(ds: dict, day: str | None) -> tuple[str, str]:
    if ds["mode"] == "live":
        return ds["anchor"], ds["days"][-1]
    start = day if day in ds["selectable"] else REPLAY_DEFAULT_DAY
    return start, min(_plus(start, 4), ds["days"][-1])


def _input(region: str, mode: Mode, day: str | None, baselines: dict[str, float] | None = None) -> tuple[dict, dict]:
    ref, ds = _region(region), _dataset(region, mode)
    window_start, last = _window(ds, day)
    n = ds["days"].index(last) + 1
    days = ds["days"][:n]
    pm = {k: v[:n] for k, v in district_pm10(ref["districts"], ds["pm10"]).items()}
    counts = {k: v[:n] for k, v in ds["counts"].items()}
    inp = outlook_input(days, window_start, ref["districts"], pm, counts, ds["known"], ref["puskesmas"], baselines)
    return inp, ds


def _outlook(region: str, mode: Mode, day: str | None, baselines: dict[str, float] | None = None) -> tuple[dict, dict]:
    inp, ds = _input(region, mode, day, baselines)
    return run("outlook", inp), ds


def _find(items: list[dict], query: str, field: str = "name") -> list[dict]:
    q = _norm(query)
    exact = [x for x in items if _norm(x[field]) == q or x.get("code") == query or x.get("id") == query]
    return exact or [x for x in items if q in _norm(x[field])]


def _pct(r: dict | None) -> str:
    if not r:
        return "n/a"
    return f"{r['point'] * 100:+.0f}% (95% range {r['low'] * 100:+.0f}% to {r['high'] * 100:+.0f}%)"


def _link(region: str, mode: Mode, day: str | None = None, **extra: str) -> str:
    q = {"region": region, "mode": mode, **({"date": day} if day else {}), **extra}
    return f"{APP_URL}/?{urllib.parse.urlencode(q)}"


def _data(ds: dict) -> dict:
    return {"region": ds["region"], "mode": ds["mode"], "times": ds["stamps"], "errors": ds["errors"],
            "fire_data_days": sorted(ds["known"])}


@mcp.tool()
def list_regions() -> list[dict]:
    """Regions Sootsayer covers (each a set of Indonesian provinces with haze
    from land and forest fires), with district and puskesmas counts and
    whether an October 2026 replay snapshot exists."""
    out = []
    for rid, ref in REFS.items():
        r = ref["region"]
        out.append({"id": rid, "name": r.name, "provinces": [n for _, n in r.provinces.values()],
                    "districts": len(ref["districts"]), "puskesmas_mapped": len(ref["puskesmas"]),
                    "replay": (r.data_dir / "replay-2026-10.json").exists()})
    return out


@mcp.tool()
def list_districts(region: str | None = None) -> list[dict]:
    """List the districts (kabupaten/kota) Sootsayer covers, optionally for one
    region ("kalimantan" or "sumatra"), with profile and mapped puskesmas."""
    rids = [region] if region else list(REFS)
    return [{"region": rid, **{k: f["properties"][k] for k in ("code", "name", "province", "profile", "puskesmas_mapped")}}
            for rid in rids for f in _region(rid)["districts"]]


@mcp.tool()
def priority(region: str = DEFAULT_REGION, mode: Mode = "live", date: str | None = None, top: int = 10) -> dict:
    """Districts of one region ranked for posko and rumah oksigen by the
    expected relative change in respiratory visits over a five-day window.
    mode="live" uses today's CAMS forecast and NASA FIRMS fires; mode="replay"
    replays October 2026 from archived CAMS data (window starts at `date`,
    default 2026-10-15)."""
    out, ds = _outlook(region, mode, date)
    n = len(_region(region)["districts"])
    ranked = [p for p in out["priority"] if p["complete"] and p["haze_days"] > 0][: max(1, min(top, n))]
    return {
        "region": region,
        "window_start": out["window_start"],
        "window_days": [d for d in out["days"] if d >= out["window_start"]],
        "ranked": [{"rank": p["rank"], "district": p["district_name"], "code": p["district_code"],
                    "mean_change": p["mean_change"], "haze_days": p["haze_days"],
                    "fire_haze_days": p["fire_haze_days"], "puskesmas_mapped": p["puskesmas_count"]}
                   for p in ranked],
        "incomplete": [p["district_name"] for p in out["priority"] if not p["complete"]],
        "data": _data(ds),
        "method": out["method"],
        "app": _link(region, mode, out["window_start"] if mode == "replay" else None),
    }


def _find_district(query: str) -> tuple[str, dict] | dict:
    found = [(rid, p) for rid, ref in REFS.items()
             for p in _find([f["properties"] for f in ref["districts"]], query)]
    if len(found) != 1:
        return {"error": "district not found or ambiguous",
                "candidates": [f"{p['name']} ({rid})" for rid, p in found[:10]]}
    return found[0]


@mcp.tool()
def haze_outlook(district: str, mode: Mode = "live", date: str | None = None) -> dict:
    """Day-by-day haze classification and expected change in respiratory
    visits for one district (name or code, e.g. "Pulang Pisau" or "Ogan
    Komering Ilir"), with 95% ranges, data times, method source, and limits."""
    hit = _find_district(district)
    if isinstance(hit, dict):
        return hit
    rid, props = hit
    code = props["code"]
    out, ds = _outlook(rid, mode, date)
    d = next(x for x in out["districts"] if x["code"] == code)
    rank = next((p["rank"] for p in out["priority"] if p["district_code"] == code), None)
    window = [x for x in d["days"] if x["in_window"]]
    summary = (f"{d['name']} ({d['profile']} profile, {props['province']}): {d['haze_days']} haze day(s) in the "
               f"{len(window)}-day window from {out['window_start']}, of which {d['fire_haze_days']} with "
               f"local fires. Expected change in puskesmas respiratory visits: {_pct(d['window_mean_change'])}. "
               f"Priority rank in {REFS[rid]['region'].name}: {rank if rank else 'not ranked (incomplete data)'}.")
    return {
        "summary": summary,
        "district": {"code": code, "name": d["name"], "province": props["province"], "region": rid,
                     "profile": d["profile"], "puskesmas_mapped": props["puskesmas_mapped"]},
        "days": [{"date": x["date"], "status": x["status"], "duration_days": x["duration_days"],
                  "pm10_ugm3": None if x["pm10_ugm3"] is None else round(x["pm10_ugm3"], 1),
                  "fire_count": x["fire_count"], "fire_data": x["fire_data"],
                  "change": None if not x["rr"] else {k: round(v - 1, 4) for k, v in x["rr"].items()}}
                 for x in window],
        "mean_change": d["window_mean_change"],
        "complete": d["complete"],
        "data": _data(ds),
        "method": out["method"],
        "app": _link(rid, mode, out["window_start"] if mode == "replay" else None, district=code),
    }


@mcp.tool()
def clinic_plan(puskesmas: str, unit_cadr_m3h: float | None = None, floor_area_m2: float = 48.0,
                ceiling_height_m: float = 3.0, baseline_visits_per_day: float | None = None,
                mode: Mode = "live", date: str | None = None) -> dict:
    """Outlook for one puskesmas (name or OSM id) plus a clean-air room plan:
    expected respiratory visits per day with 95% ranges, extra visits over the
    window, how many purifiers of the given rated CADR (m3/h) a room needs for
    5 clean air changes per hour (without a CADR, a Corsi-Rosenthal box from a
    US EPA test is used), and indoor PM2.5 from measured infiltration factors
    for the window's first day. Pass the puskesmas' own usual daily
    respiratory visits as baseline_visits_per_day when known."""
    found = [(rid, p) for rid, ref in REFS.items() for p in _find(ref["puskesmas"], puskesmas)]
    if len(found) != 1:
        return {"error": "puskesmas not found or ambiguous",
                "candidates": [f"{m['name']} ({m['district_code']}, {m['id']})" for _, m in found[:10]]}
    rid, pk = found[0]
    baselines = {pk["id"]: baseline_visits_per_day} if baseline_visits_per_day is not None else None
    out, ds = _outlook(rid, mode, date, baselines)
    p = next(x for x in out["puskesmas"] if x["id"] == pk["id"])
    district = next(f for f in REFS[rid]["districts"] if f["properties"]["code"] == pk["district_code"])
    di = ds["days"].index(out["window_start"])
    pm25 = district_pm10([district], ds["pm25"])[pk["district_code"]][di]
    room_in = {"floor_area_m2": floor_area_m2, "ceiling_height_m": ceiling_height_m,
               "unit_cadr_m3h": unit_cadr_m3h if unit_cadr_m3h is not None else CR_BOX["cadr_m3h"]}
    if pm25 is not None:
        room_in["outdoor_pm25_ugm3"] = pm25
    room = run("clean-air", room_in)
    days = [x for x in p["days"] if x["in_window"]]
    extra = p["window_extra"]
    unit_label = f"{room['unit_cadr_m3h']:g} m3/h" + (" (Corsi-Rosenthal box)" if unit_cadr_m3h is None else "")
    summary = (f"{p['name']}: usual {p['baseline_visits_per_day']:g} respiratory visits/day "
               f"({p['baseline_source'].replace('_', ' ')}). Over {len(days)} days from {out['window_start']} "
               f"expect {extra['point']:+.1f} extra visits (95% range {extra['low']:+.1f} to {extra['high']:+.1f}). "
               f"A {floor_area_m2:g} m2 x {ceiling_height_m:g} m room needs {room['units']} purifier(s) of {unit_label}.")
    if room.get("indoor"):
        i = room["indoor"]
        summary += (f" With outdoor PM2.5 {i['outdoor_pm25_ugm3']:.0f} ug/m3 on {out['window_start']}, indoor PM2.5 is "
                    f"about {i['without_cleaner_ugm3']['low']:.0f}-{i['without_cleaner_ugm3']['high']:.0f} without air "
                    f"cleaners and {i['with_cleaner_ugm3']['low']:.0f}-{i['with_cleaner_ugm3']['high']:.0f} with HEPA "
                    "cleaners (measured infiltration in homes, Barn et al. 2008; not a 95% interval).")
    return {
        "summary": summary,
        "puskesmas": {"id": p["id"], "name": p["name"], "district_code": p["district_code"], "region": rid,
                      "lon": pk["lon"], "lat": pk["lat"]},
        "baseline_visits_per_day": p["baseline_visits_per_day"],
        "baseline_source": p["baseline_source"],
        "days": [{"date": x["date"], "expected": x["expected"], "extra": x["extra"]} for x in days],
        "window_extra": extra,
        "clean_air_room": room,
        "data": _data(ds),
        "method": out["method"],
        "app": _link(rid, mode, out["window_start"] if mode == "replay" else None, puskesmas=p["id"]),
    }


@mcp.tool()
def daily_brief(region: str = DEFAULT_REGION, mode: Mode = "live", date: str | None = None,
                lang: Lang = "id", top: int = 5) -> dict:
    """A ready-to-send haze briefing for a district health office (Dinkes):
    the priority districts with 95% ranges, incomplete districts, data times,
    failed sources, method source, and limits, in Bahasa Indonesia ("id") or
    English ("en"). The text is written by the Rust engine, not by a language
    model: send `text` verbatim (WhatsApp, Telegram, email, or print)."""
    inp, ds = _input(region, mode, date)
    out = run("brief", {
        "outlook": inp,
        "lang": lang,
        "region_name": REFS[region]["region"].name,
        "mode": mode,
        "data_times": ds["stamps"],
        "errors": ds["errors"],
        "top": max(1, min(top, 20)),
        "link": _link(region, mode, inp["window_start"] if mode == "replay" else None),
    })
    return {**out, "region": region, "mode": mode,
            "instructions": "Send `text` exactly as written. Do not round, drop ranges, or remove limits."}


if __name__ == "__main__":
    mcp.run()
