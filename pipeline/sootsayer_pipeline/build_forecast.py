"""Forecast-as-issued replay for October 2026 (needs ADS_API_KEY and the "ads" extra).

The hindsight replay (build_replay) shows archived model data: what CAMS said
about each day once that day was over. This builder adds what a health office
could actually have seen in the morning. For each replay window start D
(1-31 Oct 2026) it takes the CAMS global forecast that was available at
06:00 WIB on D: the run of 12:00 UTC on D-1, which CAMS publishes before
22:00 UTC (05:00 WIB). Daily means over UTC+7 days:

    D = lead 5-28 h, D+1 = 29-52 h, D+2 = 53-76 h, D+3 = 77-100 h,
    D+4 = lead 101-120 h (00:00-19:59 WIB, 20 hours; the run ends at 120 h).

Cells: CAMS points lie on a 0.4 degree grid at multiples of 0.4. Sumatra cell
centres coincide with them; Kalimantan centres lie halfway between two points
in longitude and take the mean of both.

Output: web/public/data/<region>/replay-2026-10-forecast.json, including a
forecast check computed by the Rust engine: for each lead day, how many
district haze days the forecast caught, missed, or raised falsely, compared
with the hindsight replay (archived model data, not station measurements).

Run:  uv run --project pipeline --extra ads python -m sootsayer_pipeline.build_forecast --region kalimantan
"""

from __future__ import annotations

import argparse
import json
import time
import zipfile
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from . import CACHE, DEFAULT_REGION, REGIONS, Region, env, region
from .engine import district_pm10, load_reference
from .engine import run as run_engine
from .http import write_json

ADS_URL = "https://ads.atmosphere.copernicus.eu/api"
DATASET = "cams-global-atmospheric-composition-forecasts"
RUN_HOUR_UTC = 12
LEADS = list(range(5, 121))
LEAD_DAYS = 5
MIN_HOURS = 4  # same rule as the live daily means
FIRST_ISSUE, LAST_ISSUE = date(2026, 10, 1), date(2026, 10, 31)
# Runs of 12:00 UTC from 30 Sep to 30 Oct in one request per region:
# 31 runs x 116 lead hours x 2 variables = 7,192 fields (ADS limit 10,000).
CHUNKS = [("2026-09-30", "2026-10-30")]
DOI = "10.24381/04a0b097"
# Citation and attribution as the dataset's "References" section on the ADS asks.
ATTRIBUTION = ("Contains modified Copernicus Atmosphere Monitoring Service information 2026. Neither the "
               "European Commission nor ECMWF is responsible for any use that may be made of the "
               "Copernicus information or data it contains.")
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def source_text(accessed: date) -> str:
    return (f"Copernicus Atmosphere Monitoring Service (2021): CAMS global atmospheric composition forecasts. "
            f"Copernicus Atmosphere Monitoring Service (CAMS) Atmosphere Data Store, DOI: {DOI} "
            f"(Accessed on {accessed.day:02d}-{MONTHS[accessed.month - 1]}-{accessed.year}). "
            f"Run of 12:00 UTC the day before each morning, available before 22:00 UTC (05:00 WIB). "
            f"CC BY 4.0. {ATTRIBUTION}")


def ads_client():
    from ecmwf.datastores import Client

    key = env("ADS_API_KEY")
    if not key:
        raise SystemExit("ADS_API_KEY is not set (environment or .env)")
    return Client(url=ADS_URL, key=key, progress=False)


def area_for(grids: list[dict]) -> list[float]:
    """[N, W, S, E] covering every cell centre of every region and the CAMS points beside them.

    One request covers all regions: ADS prices a request by its number of
    fields, not by its area, and queues one request of ours at a time."""
    lons = [x for g in grids for x in g["lons"]]
    lats = [y for g in grids for y in g["lats"]]
    return [max(lats) + 0.1, min(lons) - 0.3, min(lats) - 0.1, max(lons) + 0.3]


# Requests for past runs come from the MARS archive, which the Data Store
# limits to 60 running requests for all users together (job QoS, Nov 2026:
# 849 queued), so a wait of many hours is normal. --max-hours changes it.
MAX_WAIT_S = 8 * 3600
DONE = ("successful", "failed", "rejected", "dismissed", "deleted")


def wait_for(remote, t0: float, tag: str) -> str:
    """Poll an ADS job until it ends; return its final status."""
    last = None
    while (status := remote.status) not in DONE:
        if status != last:
            print(f"[{tag}]   {time.time() - t0:6.0f} s {status}", flush=True)
            last = status
        if time.time() - t0 > MAX_WAIT_S:
            raise SystemExit(f"[{tag}] ADS job {remote.request_id} still {status} after {MAX_WAIT_S // 3600} h; "
                             f"rerun with --job {remote.request_id} to keep waiting for it")
        time.sleep(60)  # gentle polling; the Data Stores flag aggressive clients
    return status


def download(grids: list[dict], job: str | None = None) -> list[Path]:
    """Fetch every missing chunk into the cache, one request at a time.

    ADS rejects a request while another one of ours is queued for the same
    dataset ("Maximum number queued requests ... request data sequentially"),
    so each chunk waits for the previous one, and a rejection waits and retries.
    ADS queue times depend on the load and can be hours. `job` attaches to a
    request submitted earlier (for example by a run that timed out) instead of
    queueing a new one.
    """
    folder = CACHE / "ads"
    folder.mkdir(parents=True, exist_ok=True)
    targets = [folder / f"cams-forecast-{d0}-{d1}-{RUN_HOUR_UTC:02d}z.zip" for d0, d1 in CHUNKS]
    todo = [(t, d0, d1) for t, (d0, d1) in zip(targets, CHUNKS) if not t.exists()]
    if not todo:
        return targets
    client = ads_client()
    box = area_for(grids)
    tag = "ads"
    t0 = time.time()
    if job:
        if len(todo) != 1:
            raise SystemExit(f"--job needs exactly one missing chunk, {len(todo)} are missing")
        target = todo[0][0]
        remote = client.get_remote(job)
        print(f"[{tag}] waiting for job {job}", flush=True)
        if (status := wait_for(remote, t0, tag)) != "successful":
            raise SystemExit(f"[{tag}] ADS job {job} ended as {status}")
        remote.download(str(target))
        print(f"[{tag}] {target.name}: {target.stat().st_size // 1024} kB after {time.time() - t0:.0f} s", flush=True)
        return targets
    for target, d0, d1 in todo:
        request = {
            "variable": ["particulate_matter_10um", "particulate_matter_2.5um"],
            "date": [f"{d0}/{d1}"],
            "time": [f"{RUN_HOUR_UTC:02d}:00"],
            "leadtime_hour": [str(h) for h in LEADS],
            "type": ["forecast"],
            "area": [round(v, 2) for v in box],
            "data_format": "netcdf_zip",
        }
        cost = client.estimate_costs(DATASET, request)
        print(f"[{tag}] {d0}..{d1}: cost {cost.get('cost')} of {cost.get('limit')}", flush=True)
        # One submission, never an automatic resubmission: since October 2026
        # the Data Stores may suspend accounts that resubmit repeatedly or send
        # requests in parallel (ECMWF forum, "Data Stores Service protection
        # measures", 22 Oct 2026). A rejected or failed job stops the build.
        remote = client.submit(DATASET, request)
        print(f"[{tag}] submitted {d0}..{d1} as {remote.request_id}", flush=True)
        status = wait_for(remote, t0, tag)
        if status != "successful":
            raise SystemExit(f"[{tag}] ADS job {remote.request_id} ended as {status}; not resubmitting. "
                             f"Check it on the ADS 'Your requests' page, then rerun (or use --job).")
        remote.download(str(target))
        print(f"[{tag}] {target.name}: {target.stat().st_size // 1024} kB after {time.time() - t0:.0f} s", flush=True)
    return targets


def read_runs(paths: list[Path]):
    """{run start (UTC datetime): (leads, lat, lon, pm10, pm25)} with pm in ug/m3, shape (lead, lat, lon)."""
    import netCDF4
    import numpy as np

    runs = {}
    for path in paths:
        with zipfile.ZipFile(path) as z:
            names = [n for n in z.namelist() if n.endswith(".nc")]
            if len(names) != 1:
                raise SystemExit(f"{path.name}: expected one .nc file, found {names}")
            data = z.read(names[0])
        ds = netCDF4.Dataset("inmemory.nc", memory=data)
        refs = netCDF4.num2date(ds.variables["forecast_reference_time"][:], ds.variables["forecast_reference_time"].units,
                                only_use_cftime_datetimes=False, only_use_python_datetimes=True)
        leads = [int(round(float(h))) for h in ds.variables["forecast_period"][:]]
        lat = np.round(np.asarray(ds.variables["latitude"][:], float), 3)
        lon = np.round(np.asarray(ds.variables["longitude"][:], float), 3)
        pm10 = np.asarray(ds.variables["pm10"][:].filled(np.nan), float) * 1e9  # kg m-3 -> ug m-3
        pm25 = np.asarray(ds.variables["pm2p5"][:].filled(np.nan), float) * 1e9
        for k, ref in enumerate(refs):
            start = ref.replace(tzinfo=UTC)
            runs[start] = (leads, lat, lon, pm10[:, k], pm25[:, k])
        ds.close()
    return runs


def cell_index(lat, lon, cells):
    """For each cell: (lat index, [lon indices]) of the CAMS points it takes."""
    import numpy as np

    out = []
    for x, y in cells:
        j = np.where(np.isclose(lat, y, atol=1e-3))[0]
        if len(j) != 1:
            raise SystemExit(f"cell ({x}, {y}): latitude not on the CAMS grid")
        exact = np.where(np.isclose(lon, x, atol=1e-3))[0]
        if len(exact) == 1:
            out.append((int(j[0]), [int(exact[0])]))
            continue
        pair = [int(i) for i in np.where(np.isclose(np.abs(lon - x), 0.2, atol=1e-3))[0]]
        if len(pair) != 2:
            raise SystemExit(f"cell ({x}, {y}): no CAMS points 0.2 deg either side")
        out.append((int(j[0]), pair))
    return out


def daily_windows(runs, cells):
    """pm10/pm25[issue][lead day][cell] (ug/m3, 1 decimal, None when < MIN_HOURS hours)."""
    import numpy as np

    issues = [FIRST_ISSUE + timedelta(days=i) for i in range((LAST_ISSUE - FIRST_ISSUE).days + 1)]
    pm10_out, pm25_out, run_names = [], [], []
    index = None
    for d in issues:
        start = datetime(d.year, d.month, d.day, RUN_HOUR_UTC, tzinfo=UTC) - timedelta(days=1)
        if start not in runs:
            raise SystemExit(f"missing CAMS run {start:%Y-%m-%d %H:%M} UTC for window {d}")
        leads, lat, lon, pm10, pm25 = runs[start]
        if index is None:
            index = cell_index(lat, lon, cells)
        days10 = [[[] for _ in cells] for _ in range(LEAD_DAYS)]
        days25 = [[[] for _ in cells] for _ in range(LEAD_DAYS)]
        for li, hours in enumerate(leads):
            wib = (start + timedelta(hours=hours) + timedelta(hours=7)).date()
            k = (wib - d).days
            if not 0 <= k < LEAD_DAYS:
                continue
            for c, (j, iis) in enumerate(index):
                v10 = float(np.nanmean(pm10[li, j, iis]))
                v25 = float(np.nanmean(pm25[li, j, iis]))
                if np.isfinite(v10):
                    days10[k][c].append(v10)
                if np.isfinite(v25):
                    days25[k][c].append(v25)

        def means(days):
            return [[round(sum(v) / len(v), 1) if len(v) >= MIN_HOURS else None for v in cellv] for cellv in days]

        pm10_out.append(means(days10))
        pm25_out.append(means(days25))
        run_names.append(f"{start:%Y-%m-%dT%H:%MZ}")
    return [d.isoformat() for d in issues], run_names, pm10_out, pm25_out


def forecast_check(r: Region, issues, pm10_issued) -> dict:
    """Haze days forecast vs the hindsight replay, per lead day, by the engine."""
    districts, _ = load_reference(r.id)
    replay = json.loads((r.data_dir / "replay-2026-10.json").read_text(encoding="utf-8"))
    hind = district_pm10(districts, replay["cams"]["pm10_ugm3"])
    day_index = {d: i for i, d in enumerate(replay["days"])}
    pairs = []
    for i, d0 in enumerate(issues):
        # cells x lead days, so district_pm10 sees one "day" per lead
        cells_by_lead = [list(col) for col in zip(*pm10_issued[i])]
        fc = district_pm10(districts, cells_by_lead)
        for k in range(LEAD_DAYS):
            day = (date.fromisoformat(d0) + timedelta(days=k)).isoformat()
            di = day_index.get(day)
            for f in districts:
                code = f["properties"]["code"]
                truth = hind[code][di] if di is not None else None
                pairs.append([k, fc[code][k], truth])
    return run_engine("forecast-check", {"lead_days": LEAD_DAYS, "pairs": pairs})


def grid_of(r: Region) -> dict:
    return json.loads((r.data_dir / "grid.json").read_text(encoding="utf-8"))


def build(r: Region, paths: list[Path]) -> None:
    grid = grid_of(r)
    runs = read_runs(paths)
    issues, run_names, pm10, pm25 = daily_windows(runs, grid["cells"])
    check = forecast_check(r, issues, pm10)
    accessed = max(datetime.fromtimestamp(p.stat().st_mtime, UTC).date() for p in paths)
    out = {
        "generated_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "region": r.id,
        "issue_dates": issues,
        "runs": run_names,
        "lead_days": LEAD_DAYS,
        "day_hours": "UTC+7 days; D = lead 5-28 h ... D+4 = lead 101-120 h (00:00-19:59 WIB)",
        "pm10_ugm3": pm10,
        "pm25_ugm3": pm25,
        "check": check,
        "source": source_text(accessed),
        "cells": "Sumatra cells are CAMS points; Kalimantan cells take the mean of the two CAMS points 0.2 deg west and east",
    }
    size = write_json(r.data_dir / "replay-2026-10-forecast.json", out)
    print(f"[{r.id}] issues={len(issues)} bytes={size}")
    for row in check["leads"]:
        print(f"[{r.id}] lead +{row['lead_day']}: hits={row['hits']} misses={row['misses']} "
              f"false_alarms={row['false_alarms']} correct_negatives={row['correct_negatives']} "
              f"pod={row['pod']} far={row['far']}")


def main(argv: list[str] | None = None) -> None:
    global MAX_WAIT_S
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--region", action="append", choices=sorted(REGIONS),
                    help=f"region to build (repeatable); default: {DEFAULT_REGION}")
    ap.add_argument("--download-only", action="store_true", help="only fetch the CAMS runs into the cache")
    ap.add_argument("--job", help="ADS request id submitted earlier: wait for it instead of queueing a new request")
    ap.add_argument("--max-hours", type=float, default=MAX_WAIT_S / 3600, help="give up waiting after this many hours")
    args = ap.parse_args(argv)
    MAX_WAIT_S = int(args.max_hours * 3600)
    # The cached download always covers every region, so building one region
    # later never needs a second ADS request.
    paths = download([grid_of(r) for r in REGIONS.values() if (r.data_dir / "grid.json").exists()], args.job)
    print(f"[ads] cached: {[p.name for p in paths]}")
    if args.download_only:
        return
    for rid in args.region or [DEFAULT_REGION]:
        build(region(rid), paths)
    from .build_reference import write_index

    write_index()


if __name__ == "__main__":
    main()
