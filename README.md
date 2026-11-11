# Sootsayer

**Peramal jelaga untuk puskesmas.** The soot-sayer for community clinics.

**Live app: [sootsayer.vercel.app](https://sootsayer.vercel.app)** ·
[October 2026 replay, Pulang Pisau](https://sootsayer.vercel.app/?mode=replay&date=2026-10-15&district=KT-pulang-pisau)

Satellites already see the fires, and air-quality apps already show the smoke.
Nobody tells the puskesmas who is coming. Sootsayer forecasts where wildfire
smoke will settle over Kalimantan in the next five days and turns it into an
expected change in respiratory visits for every district and mapped
puskesmas, always with a 95% range, plus a short prep plan. Everything runs on
a real 3D globe built from open data.

![Replay of 15 October 2026: smoke over Central and South Kalimantan, district outlook, puskesmas pillars, and the detail panel](docs/img/replay-2026-10-15.jpg)

## Why

The 2026 haze season in Indonesia was severe:

- Kemenkes counted [401,586 ISPA cases](https://go.kompas.com/read/2026/11/04/203113274/ministry-of-health-ispa-cases-due-to-forest-fires-reach-401586-in-7-provinces)
  linked to forest and land fires in 7 provinces and 63 districts by early November.
- CREA estimated [3,560 deaths from fire smoke in September 2026 alone](https://energyandcleanair.org/indonesias-air-pollution-deaths-surged-by-42-in-september-as-government-resists-declaring-karhutla-a-national-emergency/).
- The government set up [477 rumah oksigen](https://voi.id/en/news/599566) and emergency
  health posts and handed out 5.3 million masks. Those allocation decisions were
  made after the surge arrived.

Sootsayer is decision support for that moment: which districts to prepare
first, how many extra visits to expect, and how big a clean-air room has to be.

## What it does

- **Real 3D globe.** MapLibre GL JS v6 globe with atmosphere and terrain, the
  NASA satellite photo of the selected day, Sentinel-2 cloudless base, NASA
  FIRMS fire detections, and the Copernicus CAMS smoke field.
- **Five-day outlook.** Each district-day is classified as clear, haze, or
  fire-haze with the definitions of a puskesmas study in Central Kalimantan
  (Phung et al. 2025), and the study's relative risks give the expected change
  in respiratory visits, by haze duration, with 95% ranges.
- **Priority list** for posko and rumah oksigen, ranked by expected relative
  change, so districts with no puskesmas in OpenStreetMap still show up.
- **Puskesmas view.** Expected visits per day for 339 OpenStreetMap
  puskesmas, an editable baseline (your own records stay in your browser), and
  a clean-air room calculator.
- **Replay of October 2026** from archived CAMS smoke data and 156,658 NASA
  FIRMS fire detections over Kalimantan (17 Sep – 31 Oct), for days with no haze.
- **Agents can ask it.** An MCP server gives Kiro (or any MCP client) the same
  numbers: `priority`, `haze_outlook`, `clinic_plan`, `list_districts`.
- **Honest by design.** Every number shows its range and source, failed
  sources are named on screen, and the method's limits sit next to the numbers.

## The chimera

| Part | Technology | Job |
|---|---|---|
| Engine | **Rust** (one crate, three faces: library, native CLI, **WebAssembly** with a hand-written C ABI) | Classification, duration, relative risk, expected visits, priority, fire-to-district assignment, clean-air sizing |
| Globe | **TypeScript + Vite + MapLibre GL JS v6** (WebGL2, globe projection, terrain) | The 3D view, timeline, panels, Bahasa Indonesia and English |
| Edge | **Vercel functions** | Cache and trim CAMS (Open-Meteo) and NASA FIRMS, which the browser cannot read directly |
| Data | **Python + uv + Shapely** | Districts (geoBoundaries), puskesmas (OpenStreetMap), CAMS grid, October 2026 replay |
| Agents | **MCP** (Python SDK v2) | The outlook as tools for AI agents, on the same Rust engine |

The browser and the agent tool run the same Rust code. `web/scripts/check-parity.mjs`
pushes one real October input through the WebAssembly module and the native
CLI and requires byte-identical output.

## Method in one paragraph

A district-day is a haze day when its daily mean PM10 is at least 100 µg/m³,
and a fire-haze day when it also has a satellite fire detection. Consecutive
haze days are grouped as 1–3, 4–14, or 15+. Relative risks come from Table 4
of [Phung et al. 2025](https://doi.org/10.1093/ije/dyaf169): for example, after
15+ haze days a regency puskesmas sees **+83% respiratory visits (95% range +32%
to +154%)**. The city profile (Palangka Raya) showed no increase, and even a
drop during long haze, which the app explains as patients shifting to
hospitals and posko. Details, assumptions, and limits: [docs/METHOD.md](docs/METHOD.md).
Sources and licenses: [docs/DATA.md](docs/DATA.md).

## Run it locally

Requirements: Node 22, Rust (with `wasm32-unknown-unknown` for engine changes),
Python 3.12 with [uv](https://docs.astral.sh/uv/).

```powershell
npm install --prefix web
npm run dev --prefix web             # http://localhost:5173 (serves api/*.ts too)
```

Useful links: `/?mode=replay&date=2026-10-15&district=KT-pulang-pisau` opens the
October replay on Pulang Pisau; add `&intro=0` to skip the intro.

Engine and data:

```powershell
cargo test --manifest-path engine/Cargo.toml          # 20 unit + 5 property-based tests
node web/scripts/engine-check.mjs                      # tests, WASM, CLI, parity
uv run --project pipeline python -m sootsayer_pipeline.build_reference
uv run --project pipeline python -m sootsayer_pipeline.build_replay   # set FIRMS_MAP_KEY for replay fires
```

MCP server (stdio), already registered for Kiro in `.kiro/settings/mcp.json`:

```powershell
uv run --project mcp-server python mcp-server/server.py
```

## Deploy

Production runs on Vercel at [sootsayer.vercel.app](https://sootsayer.vercel.app).
`vercel.json` builds `web/` and deploys `api/air.ts` and `api/fires.ts` as
functions; `.vercelignore` keeps the engine, pipeline, and MCP folders out of
the upload (the browser uses the prebuilt `web/src/wasm/sootsayer_engine.wasm`).
No secrets are needed for the live view.

## Built with Kiro

- **Spec-driven:** `.kiro/specs/haze-clinic-outlook/` holds the requirements
  (EARS), design, and tasks. The design changed twice when the build found
  facts: OpenStreetMap maps only part of the puskesmas, so ranking moved to
  relative change; and Open-Meteo's per-minute limit, so live requests moved to
  368 land and coast cells.
- **Steering:** `.kiro/steering/` sets the house rules (real data only, ranges
  not single numbers, limits on screen), the sources and licenses, and the
  layout.
- **Hooks:** `engine-check-on-save` runs tests, rebuilds WASM and CLI, and
  checks parity whenever engine code is saved; `method-citation-check` keeps
  study numbers and citations consistent; `house-rules-ui-check` reviews UI
  edits against the steering.
- **Property-based testing:** proptest guards the engine's invariants.
- **MCP:** the Sootsayer MCP server lets an agent in Kiro answer "which
  districts need rumah oksigen this week?" from the same engine as the app.

## License

Code: MIT, see [LICENSE](LICENSE). Data keeps its own licenses (CC BY 4.0,
CC BY 3.0 IGO, ODbL, NASA open data), listed in [docs/DATA.md](docs/DATA.md).
