# Requirements — outlook-v2

## Introduction

The first spec (`haze-clinic-outlook`) built the five-day outlook for
Kalimantan. This spec turns it into something a health office can act on and
pass on, and extends it beyond Kalimantan without changing the method:

- a briefing text a Dinkes can send as is, written by the engine;
- the Sumatra peatland provinces, through data-only region packs;
- the waiting room: indoor PM2.5 and a Corsi–Rosenthal box preset;
- the health office's own puskesmas list (CSV in and out);
- presentation mode, night imagery, and a phone layout;
- agent surfaces: an MCP briefing tool, a custom Kiro agent, a Kiro power.

House rules from `.kiro/steering/product.md` apply to every requirement:
real data only, ranges next to every estimate, limits on screen, failed or old
sources named, decision support only.

## Requirement 1 — A briefing a health office can send

**User story:** As a Dinkes officer, I want a short text with this window's
priority districts, so that I can send it to puskesmas heads on WhatsApp or
print it for the morning meeting.

1.1. WHEN the user opens the briefing, THE SYSTEM SHALL produce, in the current
language (Bahasa Indonesia or English), a plain-text briefing with the region,
the window dates, the mode (live or replay as hindsight), up to five ranked
districts with their mean change in visits and its 95% range, the haze and
fire-haze days, the profile, the mapped puskesmas count, the incomplete
districts, the data times, any failed source, the method source, every method
limit, and a line that it is not medical advice.

1.2. THE SYSTEM SHALL generate the briefing text in the engine, so that the
web app (WebAssembly) and the MCP tool (native CLI) return byte-identical text
for identical input.

1.3. WHEN no district with complete data has a haze day in the window, THE
SYSTEM SHALL say so instead of listing districts.

1.4. THE SYSTEM SHALL offer copy, share to WhatsApp, download as .txt, and
print, without sending the text anywhere by itself.

1.5. IF the metadata given to the engine is malformed (control characters, a
non-https link, an out-of-range count), THEN THE SYSTEM SHALL refuse it with a
clear error instead of writing a briefing.

## Requirement 2 — More than Kalimantan

**User story:** As a provincial health office in Sumatra, I want the same
outlook for my districts, so that the tool covers the provinces where the 2026
haze hit.

2.1. THE SYSTEM SHALL support regions as data packs (boundaries, puskesmas,
CAMS grid, live cell list, optional replay) built by the pipeline, with no
region-specific code in the engine.

2.2. THE SYSTEM SHALL ship the Kalimantan region (5 provinces) and a Sumatra
region (Riau, Jambi, Sumatera Selatan), each with an October 2026 replay.

2.3. WHEN the user switches region, THE SYSTEM SHALL load that region's data,
keep the mode and date where possible, and fly to it.

2.4. THE SYSTEM SHALL request one region per live refresh and stay within
Open-Meteo's free tier (600 calls per minute) for that region.

2.5. THE SYSTEM SHALL state, next to the numbers and in every briefing, that
outside Central Kalimantan the study's estimates are applied by analogy.

2.6. IF an edge function receives an unknown region, THEN it SHALL answer
HTTP 400 naming the valid regions, never fall back silently.

## Requirement 3 — The waiting room

**User story:** As a puskesmas head, I want to know how smoky my waiting room
gets and what a purifier changes, so that I can prepare a clean-air room.

3.1. WHEN the district's outdoor daily mean PM2.5 is known for the selected day,
THE SYSTEM SHALL show indoor PM2.5 without and with a HEPA air cleaner, from
infiltration factors measured during forest-fire smoke, as a low–high span
labelled as not a 95% interval, with its source.

3.2. THE SYSTEM SHALL offer a Corsi–Rosenthal box CADR preset from a published
test, with its source and the caveat that home builds vary.

3.3. IF the outdoor PM2.5 is unknown, THEN THE SYSTEM SHALL say so and show no
indoor estimate.

## Requirement 4 — The health office's own puskesmas list

**User story:** As a Dinkes data officer, I want to load our official
puskesmas list, so that the outlook covers every puskesmas, not only those in
OpenStreetMap.

4.1. THE SYSTEM SHALL export the current list as CSV (id, name, lat, lon,
district code, baseline) to serve as a template.

4.2. WHEN the user imports a CSV (comma, semicolon, or tab separated; decimal
commas allowed with semicolons), THE SYSTEM SHALL place every row in a district
with the engine's point-in-polygon, use its baseline when given, and list every
rejected row with its row number and reason.

4.3. THE SYSTEM SHALL keep the imported list in the browser only, name it as
the source with the file name and import date, and allow going back to OSM.

4.4. IF no row can be imported, THEN THE SYSTEM SHALL keep the previous list.

## Requirement 5 — Presentation and reach

**User story:** As a presenter (or a judge), I want the app to tell its own
story with real data, and to read well on a phone.

5.1. WHEN the URL has `tour=1`, THE SYSTEM SHALL play a captioned walk through
the real app (globe, replay, priority, district, puskesmas, briefing, Sumatra,
live) that can be paused, skipped, or ended from the keyboard.

5.2. THE SYSTEM SHALL offer the NASA VIIRS Day/Night Band image of the selected
date as a night layer, credited like the day image.

5.3. THE SYSTEM SHALL keep the controls, the priority list, the timeline, and
the attribution usable on a 390 px wide screen.

5.4. THE SYSTEM SHALL not log image decoding errors caused by its own updates
(the first smoke frame, imagery switched while loading).

## Requirement 6 — Agents

**User story:** As an AI agent working for a health office (Kiro, Kiro Crew),
I want tools and instructions that keep the numbers honest.

6.1. THE MCP server SHALL offer `list_regions` and `daily_brief`, and its
existing tools SHALL accept every region.

6.2. THE repository SHALL include a custom Kiro agent that briefs only from
the MCP tools and keeps ranges, data times, failed sources, and limits.

6.3. THE repository SHALL include a Kiro power (manifest, MCP config, skills)
for the briefing and for adding a region.

## Out of scope (for this spec)

- Replaying the forecast as issued on each day (needs the CAMS forecast archive
  from the Copernicus Atmosphere Data Store with the owner's account).
- Provinces with little fire haze and other countries. All of Indonesia would
  need about 1,956 live cells, about 2,655 weighted Open-Meteo calls per
  refresh, more than the free tier's 600 per minute. Other countries also need
  a local study of clinic visits during smoke.
- Sending messages (WhatsApp, Telegram) from the app; a Kiro Crew job can do
  that with `daily_brief`.
