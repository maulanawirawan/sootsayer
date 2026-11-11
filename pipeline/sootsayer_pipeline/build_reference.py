"""Build static reference data for the web app and the MCP server.

Outputs (web/public/data/):
  districts.geojson  Kalimantan districts (geoBoundaries ADM2), simplified,
                     with profile, province, sampling cells, and a label point
  puskesmas.json     puskesmas from OpenStreetMap, assigned to districts
  grid.json          the CAMS sampling grid (0.4 degrees)
  reference-meta.json sources, licenses, counts, build time

Run:  uv run --project pipeline python -m sootsayer_pipeline.build_reference
"""

from __future__ import annotations

import json
import re
import unicodedata
from datetime import UTC, datetime

from shapely import STRtree
from shapely.geometry import Point, mapping, shape
from shapely.prepared import prep

from . import GRID_STEP_DEG, KALIMANTAN_BBOX, KALIMANTAN_KOTA, KALIMANTAN_PROVINCES, WEB_DATA
from .http import fetch_cached, overpass, write_json

GB_BASE = "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/IDN/"
SIMPLIFY_DEG = 0.004  # about 450 m; plenty for a 45 km smoke grid
ROUND = 4  # about 11 m

EXCLUDE_NAME = re.compile(r"pembantu|pustu|keliling|poskesdes|polindes|apotek|klinik pratama", re.I)
# The name must start with Puskesmas (optionally after UPT/UPTD) or PKM. This
# keeps out streets and places named after one, such as "Jalan Puskesmas".
PUSKESMAS_NAME = re.compile(r"^\s*(uptd?\.?\s+)?(puskesmas|pkm)\b", re.I)
NOT_A_FACILITY_TAGS = ("highway", "railway", "waterway", "place", "landuse", "natural", "route")


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


def build_grid() -> dict:
    west, south, east, north = KALIMANTAN_BBOX
    nx = int(round((east - west) / GRID_STEP_DEG)) + 1
    ny = int(round((north - south) / GRID_STEP_DEG)) + 1
    lons = [round(west + i * GRID_STEP_DEG, 1) for i in range(nx)]
    lats = [round(north - j * GRID_STEP_DEG, 1) for j in range(ny)]  # north -> south
    lons = [x for x in lons if x <= east + 1e-9]
    lats = [y for y in lats if y >= south - 1e-9]
    cells = [[lon, lat] for lat in lats for lon in lons]  # row-major, row 0 = north
    return {"step_deg": GRID_STEP_DEG, "lons": lons, "lats": lats, "cells": cells,
            "order": "row-major from north-west; index = row * len(lons) + col"}


def build_districts(grid: dict) -> list[dict]:
    adm1 = load_geojson("ADM1")
    provinces = []
    for f in adm1["features"]:
        iso = f["properties"].get("shapeISO")
        if iso in KALIMANTAN_PROVINCES:
            provinces.append((iso, prep(shape(f["geometry"]))))
    if len(provinces) != len(KALIMANTAN_PROVINCES):
        raise SystemExit(f"expected {len(KALIMANTAN_PROVINCES)} Kalimantan provinces, found {len(provinces)}")

    cell_points = [Point(lon, lat) for lon, lat in grid["cells"]]
    tree = STRtree(cell_points)

    adm2 = load_geojson("ADM2")
    districts = []
    seen_kota = set()
    for f in adm2["features"]:
        geom = shape(f["geometry"])
        rep = geom.representative_point()
        iso = next((iso for iso, p in provinces if p.contains(rep)), None)
        if iso is None:
            continue
        prov_code, prov_name = KALIMANTAN_PROVINCES[iso]
        name = f["properties"]["shapeName"].strip()
        profile = "kota" if name in KALIMANTAN_KOTA else "kabupaten"
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
    missing = KALIMANTAN_KOTA - seen_kota
    if missing:
        raise SystemExit(f"kota names not found in geoBoundaries ADM2: {sorted(missing)}")
    codes = [d["code"] for d in districts]
    if len(set(codes)) != len(codes):
        raise SystemExit("district codes are not unique")
    districts.sort(key=lambda d: (d["province"], d["name"]))
    return districts


def build_puskesmas(districts: list[dict]) -> tuple[list[dict], dict]:
    west, south, east, north = KALIMANTAN_BBOX
    q = (f'[out:json][timeout:240];nwr["name"~"puskesmas|^pkm ",i]({south},{west},{north},{east});'
         "out center tags;")
    data = overpass(q)
    shapes = [(d["code"], prep(shape(d["geometry"])), shape(d["geometry"])) for d in districts]
    out, stats = [], {"osm_elements": len(data["elements"]), "excluded_by_name": 0,
                      "excluded_not_facility": 0, "outside_kalimantan": 0, "duplicates": 0,
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
                stats["outside_kalimantan"] += 1
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


def write_api_grid(grid: dict) -> None:
    """The edge function needs the same cells; emit them as a TS module."""
    pairs = ",".join(f"[{lon},{lat}]" for lon, lat in grid["cells"])
    text = (
        "// Generated by pipeline/sootsayer_pipeline/build_reference.py. Do not edit.\n"
        f"// CAMS sampling grid over Kalimantan: {len(grid['lons'])} x {len(grid['lats'])} cells, "
        f"step {grid['step_deg']} degrees, row-major from the north-west.\n"
        f"export const GRID_LONS = {json.dumps(grid['lons'])} as const;\n"
        f"export const GRID_LATS = {json.dumps(grid['lats'])} as const;\n"
        f"export const CELLS: ReadonlyArray<readonly [number, number]> = [{pairs}];\n"
        f"// {len(grid['fetch_cells'])} cells requested live (district cells plus one ring).\n"
        f"export const FETCH_CELLS: readonly number[] = {json.dumps(grid['fetch_cells'])};\n"
    )
    path = WEB_DATA.parents[1].parent / "api" / "_grid.ts"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")


def main() -> None:
    grid = build_grid()
    districts = build_districts(grid)
    puskesmas, pstats = build_puskesmas(districts)

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
    write_api_grid(grid)
    sizes = {
        "grid.json": write_json(WEB_DATA / "grid.json", grid),
        "districts.geojson": write_json(WEB_DATA / "districts.geojson",
                                        {"type": "FeatureCollection", "features": features}),
        "puskesmas.json": write_json(WEB_DATA / "puskesmas.json", puskesmas),
    }
    meta = {
        "generated_at": now,
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
            "kota": sum(d["profile"] == "kota" for d in districts),
            "grid_cells": len(grid["cells"]),
            "puskesmas": len(puskesmas),
            "districts_without_mapped_puskesmas": sum(v == 0 for v in per_district.values()),
            **{f"puskesmas_{k}": v for k, v in pstats.items()},
        },
        "notes": [
            "OpenStreetMap does not list every puskesmas; the app shows how many are mapped per district.",
            "District profile: the nine Kalimantan cities use the kota profile, all regencies the kabupaten profile.",
        ],
        "bytes": sizes,
    }
    write_json(WEB_DATA / "reference-meta.json", meta)
    print(json.dumps(meta["counts"], indent=2))
    print(json.dumps(sizes, indent=2))


if __name__ == "__main__":
    main()
