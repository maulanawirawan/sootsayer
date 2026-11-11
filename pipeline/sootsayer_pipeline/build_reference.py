"""Build static reference data for the web app and the MCP server, per region.

Outputs (web/public/data/<region>/):
  districts.geojson   districts (geoBoundaries ADM2), simplified, with profile,
                      province, sampling cells, and a label point
  puskesmas.json      puskesmas from OpenStreetMap, assigned to districts
  grid.json           the CAMS sampling grid (0.4 degrees)
  reference-meta.json sources, licenses, counts, build time
Plus web/public/data/regions.json (index of regions) and api/_grid.ts (the
grids the edge function requests).

Run:  uv run --project pipeline python -m sootsayer_pipeline.build_reference [--region ID ...]
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from datetime import UTC, datetime

from shapely import STRtree
from shapely.geometry import Point, mapping, shape
from shapely.prepared import prep

from . import DEFAULT_REGION, GRID_STEP_DEG, REGIONS, WEB_DATA, Region, region
from .http import fetch_cached, overpass, write_json

GB_BASE = "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/IDN/"
SIMPLIFY_DEG = 0.004  # about 450 m; plenty for a 45 km smoke grid
ROUND = 4  # about 11 m

EXCLUDE_NAME = re.compile(r"pembantu|pustu|keliling|poskesdes|polindes|apotek|klinik pratama", re.I)
# The name must start with Puskesmas (optionally after UPT/UPTD) or PKM. This
# keeps out streets and places named after one, such as "Jalan Puskesmas".
PUSKESMAS_NAME = re.compile(r"^\s*(uptd?\.?\s+)?(puskesmas|pkm)\b", re.I)
NOT_A_FACILITY_TAGS = ("highway", "railway", "waterway", "place", "landuse", "natural", "route")
# geoBoundaries IDN ADM2 also holds lakes and reservoirs as their own features
# ("Danau" is a multi-part feature of lakes across Indonesia, "Danau Toba",
# "Waduk Cirata"). They are not districts.
WATER_BODY = re.compile(r"^(danau|waduk)\b", re.I)


def slug(text: str) -> str:
    t = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")


def round_coords(obj):
    if isinstance(obj, (list, tuple)):
        if obj and isinstance(obj[0], (int, float)):
            return [round(obj[0], ROUND), round(obj[1], ROUND)]
        return [round_coords(o) for o in obj]
    return obj


def load_geojson(level: str) -> dict:
    url = f"{GB_BASE}{level}/geoBoundaries-IDN-{level}_simplified.geojson"
    return json.loads(fetch_cached(url, suffix=".geojson", timeout=300))


def build_grid(r: Region) -> dict:
    west, south, east, north = r.bbox
    nx = int(round((east - west) / GRID_STEP_DEG)) + 1
    ny = int(round((north - south) / GRID_STEP_DEG)) + 1
    # "+ 0.0" turns a rounded -0.0 into 0.0.
    lons = [round(west + i * GRID_STEP_DEG, 1) + 0.0 for i in range(nx)]
    lats = [round(north - j * GRID_STEP_DEG, 1) + 0.0 for j in range(ny)]  # north -> south
    lons = [x for x in lons if x <= east + 1e-9]
    lats = [y for y in lats if y >= south - 1e-9]
    cells = [[lon, lat] for lat in lats for lon in lons]  # row-major, row 0 = north
    return {"step_deg": GRID_STEP_DEG, "lons": lons, "lats": lats, "cells": cells,
            "order": "row-major from north-west; index = row * len(lons) + col"}


def build_districts(r: Region, grid: dict) -> tuple[list[dict], list[str]]:
    adm1 = load_geojson("ADM1")
    provinces = []
    for f in adm1["features"]:
        iso = f["properties"].get("shapeISO")
        if iso in r.provinces:
            provinces.append((iso, prep(shape(f["geometry"]))))
    if len(provinces) != len(r.provinces):
        raise SystemExit(f"{r.id}: expected {len(r.provinces)} provinces, found {len(provinces)}")

    cell_points = [Point(lon, lat) for lon, lat in grid["cells"]]
    tree = STRtree(cell_points)

    adm2 = load_geojson("ADM2")
    districts = []
    skipped: list[str] = []
    seen_kota = set()
    for f in adm2["features"]:
        geom = shape(f["geometry"])
        rep = geom.representative_point()
        iso = next((iso for iso, p in provinces if p.contains(rep)), None)
        if iso is None:
            continue
        name = f["properties"]["shapeName"].strip()
        if WATER_BODY.match(name):
            skipped.append(name)
            continue
        prov_code, prov_name = r.provinces[iso]
        profile = "kota" if name in r.kota else "kabupaten"
        if profile == "kota":
            seen_kota.add(name)
        pg = prep(geom)
        inside = [int(i) for i in tree.query(geom) if pg.contains(cell_points[int(i)])]
        if not inside:
            inside = [int(tree.nearest(rep))]
            cells_rule = "nearest"
        else:
            cells_rule = "inside"
        simple = geom.simplify(SIMPLIFY_DEG, preserve_topology=True)
        districts.append({
            "code": f"{prov_code}-{slug(name)}",
            "name": name,
            "province": prov_name,
            "profile": profile,
            "cells": sorted(inside),
            "cells_rule": cells_rule,
            "label": [round(rep.x, ROUND), round(rep.y, ROUND)],
            "area_km2": round(geom.area * (111.32 ** 2), 0),  # rough, for display only
            "geometry": round_coords(mapping(simple)),
            "source_id": f["properties"]["shapeID"],
        })
    missing = r.kota - seen_kota
    if missing:
        raise SystemExit(f"{r.id}: kota names not found in geoBoundaries ADM2: {sorted(missing)}")
    codes = [d["code"] for d in districts]
    if len(set(codes)) != len(codes):
        raise SystemExit(f"{r.id}: district codes are not unique")
    districts.sort(key=lambda d: (d["province"], d["name"]))
    return districts, skipped


def build_puskesmas(r: Region, districts: list[dict]) -> tuple[list[dict], dict]:
    west, south, east, north = r.bbox
    q = (f'[out:json][timeout:240];nwr["name"~"puskesmas|^pkm ",i]({south},{west},{north},{east});'
         "out center tags;")
    data = overpass(q)
    shapes = [(d["code"], prep(shape(d["geometry"])), shape(d["geometry"])) for d in districts]
    out, stats = [], {"osm_elements": len(data["elements"]), "excluded_by_name": 0,
                      "excluded_not_facility": 0, "outside_region": 0, "duplicates": 0,
                      "snapped_to_nearest": 0}
    seen = []
    for el in data["elements"]:
        tags = el.get("tags", {})
        name = tags.get("name", "").strip()
        if any(t in tags for t in NOT_A_FACILITY_TAGS):
            stats["excluded_not_facility"] += 1
            continue
        if not PUSKESMAS_NAME.search(name) or EXCLUDE_NAME.search(name):
            stats["excluded_by_name"] += 1
            continue
        lat = el.get("lat", el.get("center", {}).get("lat"))
        lon = el.get("lon", el.get("center", {}).get("lon"))
        if lat is None or lon is None:
            continue
        pt = Point(lon, lat)
        code = next((c for c, p, _ in shapes if p.contains(pt)), None)
        if code is None:
            # Coastal points can fall just outside simplified boundaries: snap
            # to the nearest district if it is within about 3 km.
            best = min(shapes, key=lambda s: s[2].distance(pt))
            if best[2].distance(pt) <= 0.03:
                code = best[0]
                stats["snapped_to_nearest"] += 1
            else:
                stats["outside_region"] += 1
                continue
        # One puskesmas per name per district: OSM often has both a node and a
        # building outline for the same facility, sometimes far apart.
        key = (code, " ".join(name.lower().split()))
        if key in seen:
            stats["duplicates"] += 1
            continue
        seen.append(key)
        out.append({
            "id": f"osm:{el['type']}/{el['id']}",
            "name": name,
            "lon": round(lon, 5),
            "lat": round(lat, 5),
            "district_code": code,
        })
    out.sort(key=lambda p: (p["district_code"], p["name"]))
    return out, stats


def fetch_cells(grid: dict, districts: list[dict]) -> list[int]:
    """Cells worth requesting live: every district cell plus one ring around
    them, so coastal smoke still renders. Skipping open-sea cells keeps one
    refresh under Open-Meteo's free-tier limit of 600 calls per minute."""
    nx, ny = len(grid["lons"]), len(grid["lats"])
    used = {c for d in districts for c in d["cells"]}
    ring = set()
    for c in used:
        r, k = divmod(c, nx)
        for dr in (-1, 0, 1):
            for dk in (-1, 0, 1):
                if 0 <= r + dr < ny and 0 <= k + dk < nx:
                    ring.add((r + dr) * nx + (k + dk))
    return sorted(ring)


def write_api_grid() -> None:
    """The edge functions need each region's grid and live cells; emit them as
    a TypeScript module from the grid.json files present."""
    entries = []
    ids = []
    for rid, r in REGIONS.items():
        path = r.data_dir / "grid.json"
        if not path.exists():
            continue
        g = json.loads(path.read_text(encoding="utf-8"))
        west, south, east, north = r.bbox
        ids.append(rid)
        entries.append(
            f"  {rid}: {{\n"
            f"    name: {json.dumps(r.name)},\n"
            f"    bbox: {{ west: {west}, south: {south}, east: {east}, north: {north} }},\n"
            f"    lons: {json.dumps(g['lons'])},\n"
            f"    lats: {json.dumps(g['lats'])},\n"
            f"    // {len(g['fetch_cells'])} of {len(g['cells'])} cells requested live (district cells plus one ring).\n"
            f"    fetch: {json.dumps(g['fetch_cells'])},\n"
            f"  }},\n"
        )
    text = (
        "// Generated by pipeline/sootsayer_pipeline/build_reference.py. Do not edit.\n"
        f"// CAMS sampling grids per region: step {GRID_STEP_DEG} degrees, cells row-major from the\n"
        "// north-west, so cell i is [lons[i % lons.length], lats[Math.floor(i / lons.length)]].\n"
        "export interface RegionGrid {\n"
        "  name: string;\n"
        "  bbox: { west: number; south: number; east: number; north: number };\n"
        "  lons: readonly number[];\n"
        "  lats: readonly number[];\n"
        "  fetch: readonly number[];\n"
        "}\n"
        f"export const REGION_IDS = {json.dumps(ids)} as const;\n"
        "export type RegionId = (typeof REGION_IDS)[number];\n"
        f"export const DEFAULT_REGION: RegionId = {json.dumps(DEFAULT_REGION)};\n"
        "export const REGIONS: Record<RegionId, RegionGrid> = {\n"
        + "".join(entries)
        + "};\n"
        "export function isRegion(x: string | null): x is RegionId {\n"
        "  return x !== null && (REGION_IDS as readonly string[]).includes(x);\n"
        "}\n"
    )
    path = WEB_DATA.parents[1].parent / "api" / "_grid.ts"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")


def write_index() -> dict:
    """web/public/data/regions.json: which regions exist and what each has."""
    regions = []
    for rid, r in REGIONS.items():
        meta_path = r.data_dir / "reference-meta.json"
        if not meta_path.exists():
            continue
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        replay = None
        rp = r.data_dir / "replay-2026-10.json"
        if rp.exists():
            rep = json.loads(rp.read_text(encoding="utf-8"))
            replay = {"file": rp.name, "window_start": rep["window_start"],
                      "first_day": rep["days"][0], "last_day": rep["days"][-1],
                      "fires": bool(rep["fires"]["available"]), "generated_at": rep["generated_at"],
                      "forecast": None}
            fp = r.data_dir / "replay-2026-10-forecast.json"
            if fp.exists():
                fc = json.loads(fp.read_text(encoding="utf-8"))
                replay["forecast"] = {"file": fp.name, "first_issue": fc["issue_dates"][0],
                                      "last_issue": fc["issue_dates"][-1], "generated_at": fc["generated_at"]}
        regions.append({
            "id": rid,
            "name": r.name,
            "bbox": list(r.bbox),
            "provinces": [name for _, name in r.provinces.values()],
            "districts": meta["counts"]["districts"],
            "kota": meta["counts"]["kota"],
            "puskesmas": meta["counts"]["puskesmas"],
            "reference_generated_at": meta["generated_at"],
            "replay": replay,
        })
    index = {"default": DEFAULT_REGION, "regions": regions}
    write_json(WEB_DATA / "regions.json", index)
    return index


def build_region(r: Region) -> dict:
    grid = build_grid(r)
    districts, skipped = build_districts(r, grid)
    puskesmas, pstats = build_puskesmas(r, districts)

    per_district = {d["code"]: 0 for d in districts}
    for p in puskesmas:
        per_district[p["district_code"]] += 1

    features = []
    for d in districts:
        props = {k: v for k, v in d.items() if k != "geometry"}
        props["puskesmas_mapped"] = per_district[d["code"]]
        features.append({"type": "Feature", "properties": props, "geometry": d["geometry"]})

    now = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    grid["fetch_cells"] = fetch_cells(grid, districts)
    out = r.data_dir
    sizes = {
        "grid.json": write_json(out / "grid.json", grid),
        "districts.geojson": write_json(out / "districts.geojson",
                                        {"type": "FeatureCollection", "features": features}),
        "puskesmas.json": write_json(out / "puskesmas.json", puskesmas),
    }
    kota = sum(d["profile"] == "kota" for d in districts)
    meta = {
        "generated_at": now,
        "region": {"id": r.id, "name": r.name, "bbox": list(r.bbox),
                   "provinces": [name for _, name in r.provinces.values()]},
        "sources": [
            {"layer": "districts", "name": "geoBoundaries gbOpen IDN ADM2 (2020), simplified",
             "origin": "BPS, World Food Programme, OCHA ROAP", "license": "CC BY 3.0 IGO",
             "url": GB_BASE + "ADM2/"},
            {"layer": "provinces (filter only)", "name": "geoBoundaries gbOpen IDN ADM1 (2017)",
             "origin": "OpenStreetMap, Wambacher", "license": "ODbL 1.0", "url": GB_BASE + "ADM1/"},
            {"layer": "puskesmas", "name": "OpenStreetMap via Overpass API", "license": "ODbL 1.0",
             "url": "https://www.openstreetmap.org/copyright"},
        ],
        "counts": {
            "districts": len(districts),
            "kota": kota,
            "grid_cells": len(grid["cells"]),
            "live_cells": len(grid["fetch_cells"]),
            "puskesmas": len(puskesmas),
            "districts_without_mapped_puskesmas": sum(v == 0 for v in per_district.values()),
            **{f"puskesmas_{k}": v for k, v in pstats.items()},
        },
        "notes": [
            "OpenStreetMap does not list every puskesmas; the app shows how many are mapped per district.",
            f"District profile: the {kota} cities (kota) use the kota profile, all regencies the kabupaten profile.",
            *([f"Water bodies in the ADM2 file were skipped: {', '.join(sorted(set(skipped)))}."] if skipped else []),
        ],
        "bytes": sizes,
    }
    write_json(out / "reference-meta.json", meta)
    without = sorted(d["name"] for d in districts if per_district[d["code"]] == 0)
    print(f"[{r.id}] " + json.dumps(meta["counts"]))
    print(f"[{r.id}] districts without mapped puskesmas: {without}")
    print(f"[{r.id}] " + json.dumps(sizes))
    return meta


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--region", action="append", choices=sorted(REGIONS),
                    help="region to build (repeatable); default: all regions")
    args = ap.parse_args(argv)
    for rid in args.region or list(REGIONS):
        build_region(region(rid))
    write_api_grid()
    index = write_index()
    print("regions.json:", [(r["id"], r["districts"], r["puskesmas"]) for r in index["regions"]])


if __name__ == "__main__":
    main()
