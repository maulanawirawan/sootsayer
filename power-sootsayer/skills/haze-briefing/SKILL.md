---
name: haze-briefing
description: Prepare a haze briefing for an Indonesian health office (Dinkes) or puskesmas with the Sootsayer MCP tools. Use when someone asks where haze will hit clinics, which districts need posko or oxygen houses, or for a daily briefing text.
---

# Haze briefing with Sootsayer

## Step 1: check the server

Call `list_regions`. If it fails, the server is not running: see the power's
README (clone the repo, set `SOOTSAYER_HOME`, install uv and Rust).

## Step 2: pick region, mode, date, language

- Region: `kalimantan` (5 provinces, 56 districts) or `sumatra` (Riau,
  Jambi, Sumatera Selatan; 40 districts).
- Mode: `live` (today plus four forecast days) or `replay` (October 2026,
  hindsight). A replay date is the first day of a five-day window,
  1 to 31 October 2026.
- Language: `id` first, `en` on request.

## Step 3: get the text

Call `daily_brief(region, mode, date, lang)`. Return `text` exactly as
written. The engine wrote it; it already holds the ranked districts with 95%
ranges, incomplete districts, data times, failed sources, the method source,
and the limits.

## Step 4: answer follow-up questions

- One district: `haze_outlook(district, mode, date)`.
- One puskesmas and its waiting room: `clinic_plan(puskesmas, ...)`.
  Without a purifier CADR the plan uses a Corsi-Rosenthal box from a US EPA
  test; pass the device label's CADR when known.

## Rules

- Never write a number that a tool did not return, and never drop its range.
- Replay is hindsight; say so.
- Decision support for clinic load, not medical advice for individuals.
