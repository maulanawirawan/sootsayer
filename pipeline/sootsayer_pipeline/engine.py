"""Build engine inputs from Sootsayer data and run the Rust engine CLI.

The web app builds the same input shape in TypeScript and runs the same Rust
code compiled to WebAssembly, so numbers match across the app and agents.
"""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Any

from . import REPO, WEB_DATA

ENGINE_DIR = REPO / "engine"
BIN_NAME = "sootsayer.exe" if os.name == "nt" else "sootsayer"


class EngineRejected(RuntimeError):
    """The engine refused the input; the message says why."""


def engine_binary() -> Path:
    """Path to the release CLI, building it with cargo when it is missing."""
    path = ENGINE_DIR / "target" / "release" / BIN_NAME
    if not path.exists():
        subprocess.run(["cargo", "build", "--release", "--bin", "sootsayer",
                        "--manifest-path", str(ENGINE_DIR / "Cargo.toml")], check=True)
    return path


def run(command: str, payload: dict) -> Any:
    """Run `sootsayer <command>` with JSON on stdin; return the result object."""
    proc = subprocess.run([str(engine_binary()), command], input=json.dumps(payload).encode(),
                          capture_output=True, check=False)
    try:
        envelope = json.loads(proc.stdout.decode("utf-8"))
    except json.JSONDecodeError as e:
        raise RuntimeError(f"engine produced no JSON (exit {proc.returncode}): {proc.stderr.decode()[:300]}") from e
    if not envelope.get("ok"):
        raise EngineRejected(envelope.get("error", "unknown engine error"))
    return envelope["result"]


def load_reference() -> tuple[list[dict], list[dict]]:
    districts = json.loads((WEB_DATA / "districts.geojson").read_text(encoding="utf-8"))["features"]
    puskesmas = json.loads((WEB_DATA / "puskesmas.json").read_text(encoding="utf-8"))
    return districts, puskesmas


def district_pm10(districts: list[dict], pm10_cells: list[list[float | None]]) -> dict[str, list[float | None]]:
    """Daily district PM10: mean over the district's grid cells (known values only)."""
    n_days = len(pm10_cells[0]) if pm10_cells else 0
    out = {}
    for f in districts:
        cells = f["properties"]["cells"]
        series = []
        for d in range(n_days):
            vals = [pm10_cells[c][d] for c in cells if pm10_cells[c][d] is not None]
            # Plain left-to-right mean, no rounding: web/src/data.ts does exactly
            # the same, so both feed the engine identical numbers.
            series.append(sum(vals) / len(vals) if vals else None)
        out[f["properties"]["code"]] = series
    return out


def multipolygon(geometry: dict) -> list:
    if geometry["type"] == "Polygon":
        return [geometry["coordinates"]]
    if geometry["type"] == "MultiPolygon":
        return geometry["coordinates"]
    raise ValueError(f"unsupported geometry {geometry['type']}")


def fire_counts(districts: list[dict], days: list[str], fire_rows: list[list]) -> dict[str, list[int]]:
    payload = {
        "days": days,
        "districts": [{"code": f["properties"]["code"], "multipolygon": multipolygon(f["geometry"])}
                      for f in districts],
        "fires": [[r[0], r[1], r[2]] for r in fire_rows],
    }
    return run("fire-counts", payload)["counts"]


def outlook_input(days: list[str], window_start: str, districts: list[dict],
                  pm10_by_district: dict[str, list[float | None]],
                  fires_by_district: dict[str, list[int | None]] | None,
                  fire_days_known: set[str] | None,
                  puskesmas: list[dict], baselines: dict[str, float] | None = None,
                  profiles: dict[str, str] | None = None) -> dict:
    """Engine input. Fire counts are null on days without fire data (future
    days, or days outside the FIRMS window), never zero by assumption."""
    known = fire_days_known or set()
    dist = []
    for f in districts:
        p = f["properties"]
        counts = (fires_by_district or {}).get(p["code"])
        fc = [(counts[i] if counts is not None and day in known else None) for i, day in enumerate(days)]
        dist.append({
            "code": p["code"],
            "name": p["name"],
            "profile": (profiles or {}).get(p["code"], p["profile"]),
            "pm10_ugm3": pm10_by_district[p["code"]],
            "fire_count": fc,
        })
    pk = [{"id": q["id"], "name": q["name"], "district_code": q["district_code"],
           "baseline_visits_per_day": (baselines or {}).get(q["id"])} for q in puskesmas]
    return {"days": days, "window_start": window_start, "districts": dist, "puskesmas": pk}
