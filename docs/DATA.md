# Data sources and licenses

Sootsayer uses only open data. Every source is credited in the app's footer.

## Regions

| Region | Provinces | Districts | Puskesmas in OSM | CAMS grid / live cells | Replay fires (17 Sep – 31 Oct 2026) |
|---|---|---|---|---|---|
| `kalimantan` | Kalimantan Barat, Tengah, Selatan, Timur, Utara | 56 (9 kota) | 339 (4 districts with none) | 594 / 368 | 156,658 detections |
| `sumatra` | Riau, Jambi, Sumatera Selatan | 40 (8 kota) | 167 (10 districts with none) | 340 / 186 | 44,932 detections |

Each region lives in `web/public/data/<region>/`, listed in
`web/public/data/regions.json`. A region is data only; the engine is the same.

## Sources

| Layer | Source | How it is used | License / terms |
|---|---|---|---|
| Smoke (PM2.5, PM10) | [Copernicus CAMS](https://atmosphere.copernicus.eu/) global atmospheric composition forecast, 0.4° (~45 km), via the [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api) | Live: `/api/air?region=…`, 14 past days + 5 forecast days, daily means in UTC+7, land and coast cells only. Replay: archive for 17 Sep – 31 Oct 2026 per region | CC BY 4.0; Open-Meteo's free API is for non-commercial use (commercial use needs a subscription) |
| Smoke as forecast (replay) | CAMS global atmospheric composition forecasts from the [Copernicus Atmosphere Data Store](https://ads.atmosphere.copernicus.eu/) (DOI [10.24381/04a0b097](https://doi.org/10.24381/04a0b097)) | Runs of 12:00 UTC from 30 Sep to 30 Oct 2026, PM10 and PM2.5, lead 5–120 h, one request for both regions; daily means per cell and window morning in `replay-2026-10-forecast.json`, with the forecast check. See [METHOD.md](METHOD.md#replay-as-forecast-and-the-forecast-check) | CC BY 4.0. Contains modified Copernicus Atmosphere Monitoring Service information 2026; neither the European Commission nor ECMWF is responsible for any use that may be made of the Copernicus information or data it contains |
| Fire detections | [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/), VIIRS NOAA-20 near real time, Southeast Asia CSV | Live: `/api/fires?region=…` (7 days), filtered to the region, dates converted to UTC+7. Replay: FIRMS area API (`VIIRS_NOAA20_NRT`; standard processing ended at 31 Jul 2026 when built), counted per district per day by the engine at build time; points in `replay-2026-10-fires.json` | NASA open data; cite FIRMS |
| Day imagery | [NASA GIBS](https://earthdata.nasa.gov/gibs) `VIIRS_NOAA20_CorrectedReflectance_TrueColor` | Satellite photo of the selected day (yesterday for today and forecast days) | NASA open data |
| Night imagery | NASA GIBS `VIIRS_NOAA20_DayNightBand_At_Sensor_Radiance` | Optional night layer of the same date: city lights and fires | NASA open data |
| Base imagery | [Sentinel-2 cloudless 2016](https://s2maps.eu) by EOX IT Services GmbH | Detail when zoomed in | CC BY 4.0 for the 2016 mosaic. Later EOX mosaics are CC BY-NC-SA; Sootsayer does not use them |
| Terrain | [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Terrarium) | 3D relief and hillshade | Open; credits SRTM, GMTED2010, ETOPO1 and others |
| Labels, country lines | [OpenFreeMap](https://openfreemap.org) vector tiles, © [OpenMapTiles](https://www.openmaptiles.org/), © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors | Place labels and borders | ODbL (data), free service |
| Puskesmas | OpenStreetMap via the Overpass API | Facilities named "Puskesmas…", "UPT Puskesmas…", or "PKM…"; streets, pustu, and duplicates removed. A health office can replace the list with its own CSV, kept in the browser | ODbL |
| Districts | [geoBoundaries](https://www.geoboundaries.org/) gbOpen IDN ADM2 (2020), from BPS, WFP, and OCHA ROAP; provinces from IDN ADM1 (2017, OpenStreetMap) | Districts per region, simplified to ~450 m; lake features ("Danau", "Danau Toba", "Waduk Cirata") skipped | CC BY 3.0 IGO (ADM2); ODbL (ADM1) |
| Method | Phung et al. 2025, Int J Epidemiol, doi:10.1093/ije/dyaf169 | Relative risks and baselines, see [METHOD.md](METHOD.md) | Open-access article |
| Waiting room | Barn et al. 2008, J Expo Sci Environ Epidemiol 18:503–511; Holder et al. 2022, Indoor Air 32:e13163 | Indoor/outdoor PM2.5 factors in forest-fire smoke; Corsi–Rosenthal box CADR | Cited values, see [METHOD.md](METHOD.md) |

## What is not used, and why

- **ISPU index values.** ISPU is defined for station measurements; the app
  shows model PM2.5 in µg/m³ with the WHO 2021 24-hour guideline (15 µg/m³)
  marked, and never labels a model value as an ISPU number.
- **Official puskesmas coordinates.** No open dataset with coordinates was
  found. The app says how many puskesmas OpenStreetMap maps in each district,
  links each one to its OSM page for corrections, and accepts a health
  office's own list as CSV.
- **Open-Meteo's `pm10_previous_dayN` variables.** They return no values for
  the CAMS air-quality domain (checked for October and November 2026), so the
  forecast as issued on each replay morning comes from the Atmosphere Data
  Store instead, which needs a free account.
- **Proprietary basemaps or 3D tiles** (Google, Mapbox, Esri, Cesium ion).

## Freshness and fair use

- `/api/air` is cached at the edge for 6 hours and in a warm function for
  30 minutes, per region. CAMS runs twice a day. Open-Meteo counts a location
  with more than 14 days as days/14 calls, so one 19-day refresh costs about
  500 weighted calls for Kalimantan and 253 for Sumatra, under the free tier's
  600 per minute for either region alone.
- All of Indonesia (516 districts) would need 1,956 live cells, about 2,655
  weighted calls per refresh and about 10,600 per day with a 6-hour cache: over
  both free-tier limits. That is why coverage is limited to the haze regions.
- `/api/fires` is cached for 30 minutes.
- When a source fails, the UI names it, shows the affected days as "no data",
  and marks the outlook incomplete. An unknown `region` is an HTTP 400.

## Rebuilding the static data

```powershell
pipeline/.venv/Scripts/python.exe -m sootsayer_pipeline.build_reference                 # every region
pipeline/.venv/Scripts/python.exe -m sootsayer_pipeline.build_reference --region sumatra
pipeline/.venv/Scripts/python.exe -m sootsayer_pipeline.build_replay --region sumatra   # October 2026 replay
```

Fires in the replay need a free FIRMS MAP_KEY
([request one here](https://firms.modaps.eosdis.nasa.gov/api/map_key/)). Put
it in a `.env` file at the repo root (copy `.env.example`; `.env` is
git-ignored) or in the `FIRMS_MAP_KEY` environment variable. The builder asks
FIRMS which dates have standard-processing data and uses near-real-time data
for the rest, in requests of at most 5 days (the area API limit), and keeps
detections whose UTC+7 date falls in the replay. Error messages never include
the request URL, because it carries the key.

The CAMS archive requests pause 65 seconds between uncached chunks of 100
locations (45 days weigh about 321 calls each), so a build stays under the
per-minute limit. Raw downloads are cached in `pipeline/.cache/` (not committed).

The forecast replay needs a free
[Atmosphere Data Store](https://ads.atmosphere.copernicus.eu/) account: accept
the CC-BY licence of the dataset once, then put the API key from your ADS
profile in `.env` as `ADS_API_KEY`. Then:

```powershell
uv run --project pipeline --extra ads python -m sootsayer_pipeline.build_forecast --region kalimantan --region sumatra
```

One request covers both regions: 31 runs × 116 lead hours × 2 variables =
7,192 fields, under the 10,000-field limit per request. While one of our
requests was queued, the Data Store rejected further ones for the same dataset
("request data sequentially"), so the builder sends one request at a time and
waits; queue times depend on the load and can be hours. The download is cached in `pipeline/.cache/ads/`, so a rebuild needs
no new request.
