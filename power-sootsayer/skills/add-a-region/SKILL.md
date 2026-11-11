---
name: add-a-region
description: Add a new region (a set of provinces) to Sootsayer, or plan Sootsayer for another country. Use when someone asks to cover another part of Indonesia or another place in the world.
---

# Add a region to Sootsayer

Sootsayer's engine does not know about places. A region is data: boundaries,
a puskesmas list, a CAMS grid, and (optionally) a replay snapshot. Adding an
Indonesian region is a pipeline run. Another country also needs a local study.

## Inside Indonesia

1. In `pipeline/sootsayer_pipeline/__init__.py`, add a `Region` to
   `REGIONS`: an id, a name, a bbox `(west, south, east, north)` aligned to
   0.4 degrees, the provinces by geoBoundaries ADM1 `shapeISO`, and the
   explicit list of cities (kota) as named in geoBoundaries ADM2.
2. Run `pipeline/.venv/Scripts/python.exe -m sootsayer_pipeline.build_reference --region <id>`.
   It writes `web/public/data/<id>/`, `web/public/data/regions.json`, and
   `api/_grid.ts`. Check the printed counts and the districts without
   mapped puskesmas.
3. Check Open-Meteo fair use: the printed `live_cells` times about 1.36 is
   the weighted calls of one live refresh. Keep each region under 600 calls
   per minute; the app asks for one region at a time.
4. Optional replay: `python -m sootsayer_pipeline.build_replay --region <id>`
   (fires need a free FIRMS MAP_KEY in `.env`).
5. Add `region_<id>` to `web/src/i18n.ts` (both languages), run
   `node web/scripts/engine-check.mjs` (parity covers every region with a
   replay) and `npm run build --prefix web`.
6. Say on screen and in `docs/METHOD.md` that the study's estimates are used
   by analogy there.

## Outside Indonesia

Do not reuse the Central Kalimantan relative risks. Find a local study of
clinic or emergency visits during smoke with relative risks and 95%
intervals, add its table to `engine/src/method.rs` as new profiles with the
citation, mirror it in `docs/METHOD.md`, and extend the property tests. The
rest (CAMS, FIRMS, GIBS, geoBoundaries, OpenStreetMap) is global open data.
