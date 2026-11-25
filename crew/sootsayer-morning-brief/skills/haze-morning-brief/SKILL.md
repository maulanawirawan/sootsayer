---
description: How to prepare the Sootsayer haze briefing for a district health office from the Sootsayer MCP tools, without losing a range, a chance's source, a data time, a failed source or a limit.
always: false
---
# Haze morning brief

Sootsayer estimates how many extra respiratory visits each puskesmas can
expect from wildfire haze over the next five days, from Copernicus CAMS smoke,
NASA FIRMS fires and one puskesmas study (Phung et al. 2025). The Rust engine
writes the briefing text; your job is to fetch it and deliver it intact.

## Order of calls
1. Daily briefing: `daily_brief(region, mode="live", lang="id")` for
   `kalimantan`, then `sumatra`. Return each `text` exactly.
2. "Where first?": `priority(region, mode="live")`. Quote `ranked` with each
   `mean_change` and its 95% range, then `watch` (no haze day by the forecast
   rule, but a haze-day chance at or above the watch level that chance_note`n   names) as "possible, prepare".
3. One district: `haze_outlook(district, mode="live")`. Its `summary` is safe
   to quote; keep `chance_note` with any chance.
4. One clinic: `clinic_plan(puskesmas, ...)` for expected visits and a
   clean-air waiting room; quote the sources it returns.
5. "How far can we trust it?": `forecast_check(region)`. Quote rates with their
   counts and every caveat: it is model against model, not stations.

## Never
- Never write a briefing or a number yourself, even when a tool fails. Report
  the failing tool, region and error instead.
- Never present replay (October 2026) data as today's.
- Never give medical advice to a person.

## Modes
- `live`: today's CAMS forecast and NASA FIRMS fires. The haze-day chance here
  comes from a model trained on October 2026, applied by analogy.
- `forecast` (with `date`, 1-31 Oct 2026): the forecast that was available at
  06:00 WIB that morning; chances from a model that never saw that week.
- `replay` (with `date`): hindsight, archived model data, no chance.
