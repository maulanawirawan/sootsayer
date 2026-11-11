# Data sources and licenses

Sootsayer uses only open data. Every source is credited in the app's footer.

| Layer | Source | How it is used | License / terms |
|---|---|---|---|
| Smoke (PM2.5, PM10) | [Copernicus CAMS](https://atmosphere.copernicus.eu/) global atmospheric composition forecast, 0.4° (~45 km), via the [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api) | Live: `/api/air`, 14 past days + 5 forecast days, daily means in UTC+7, 368 cells over land and coast. Replay: archive for 17 Sep – 31 Oct 2026 in `web/public/data/replay-2026-10.json` | CC BY 4.0; Open-Meteo's free API is for non-commercial use (commercial use needs a subscription) |
| Fire detections | [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/), VIIRS NOAA-20 near real time, Southeast Asia CSV | Live: `/api/fires` (7 days), filtered to Kalimantan, dates converted to UTC+7. Replay: 156,658 detections for 17 Sep – 31 Oct 2026 from the FIRMS area API (`VIIRS_NOAA20_NRT`; standard processing ended at 31 Jul 2026 when built), counted per district per day by the engine at build time; points in `replay-2026-10-fires.json` | NASA open data; cite FIRMS |
| Day imagery | [NASA GIBS](https://earthdata.nasa.gov/gibs) `VIIRS_NOAA20_CorrectedReflectance_TrueColor` | Satellite photo of the selected day (yesterday for today and forecast days) | NASA open data |
| Base imagery | [Sentinel-2 cloudless 2016](https://s2maps.eu) by EOX IT Services GmbH | Detail when zoomed in | CC BY 4.0 for the 2016 mosaic. Later EOX mosaics are CC BY-NC-SA; Sootsayer does not use them |
| Terrain | [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Terrarium) | 3D relief and hillshade | Open; credits SRTM, GMTED2010, ETOPO1 and others |
| Labels, country lines | [OpenFreeMap](https://openfreemap.org) vector tiles, © [OpenMapTiles](https://www.openmaptiles.org/), © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors | Place labels and borders | ODbL (data), free service |
| Puskesmas | OpenStreetMap via the Overpass API | 339 facilities named "Puskesmas…", "UPT Puskesmas…", or "PKM…"; streets, pustu, and duplicates removed | ODbL |
| Districts | [geoBoundaries](https://www.geoboundaries.org/) gbOpen IDN ADM2 (2020), from BPS, WFP, and OCHA ROAP; provinces from IDN ADM1 (2017, OpenStreetMap) | 56 Kalimantan districts, simplified to ~450 m | CC BY 3.0 IGO (ADM2); ODbL (ADM1) |
| Method | Phung et al. 2025, Int J Epidemiol, doi:10.1093/ije/dyaf169 | Relative risks and baselines, see [METHOD.md](METHOD.md) | Open-access article |

## What is not used, and why

- **ISPU index values.** ISPU is defined for station measurements; the app
  shows model PM2.5 in µg/m³ with the WHO 2021 24-hour guideline (15 µg/m³)
  marked, and never labels a model value as an ISPU number.
- **Official puskesmas coordinates.** No open dataset with coordinates was
  found. The app says how many puskesmas OpenStreetMap maps in each district.
- **Proprietary basemaps or 3D tiles** (Google, Mapbox, Esri, Cesium ion).

## Freshness and fair use

- `/api/air` is cached at the edge for 6 hours and in a warm function for
  30 minutes. CAMS runs twice a day. One refresh asks Open-Meteo for 368
  locations, which stays under the free tier's 600 calls per minute.
- `/api/fires` is cached for 30 minutes.
- When a source fails, the UI names it, shows the affected days as "no data",
  and marks the outlook incomplete.

## Rebuilding the static data

```powershell
uv run --project pipeline python -m sootsayer_pipeline.build_reference   # districts, puskesmas, grid
uv run --project pipeline python -m sootsayer_pipeline.build_replay      # October 2026 replay
```

Fires in the replay need a free FIRMS MAP_KEY
([request one here](https://firms.modaps.eosdis.nasa.gov/api/map_key/)). Put
it in a `.env` file at the repo root (copy `.env.example`; `.env` is
git-ignored) or in the `FIRMS_MAP_KEY` environment variable. The builder asks
FIRMS which dates have standard-processing data and uses near-real-time data
for the rest, in requests of at most 5 days (the area API limit), and keeps
detections whose UTC+7 date falls in the replay.

Raw downloads are cached in `pipeline/.cache/` (not committed).
