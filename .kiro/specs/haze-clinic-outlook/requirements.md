# Requirements — haze-clinic-outlook

## Introduction

Sootsayer's first feature turns open satellite and atmospheric data into a
five-day outlook of respiratory visits for each puskesmas in Kalimantan, plus a
short prep plan, shown on a realistic 3D globe. It targets the decisions health
offices were making by hand during the 2026 haze: where to send staff and
masks, and where to open posko and rumah oksigen.

Scope of this spec: the five Kalimantan provinces, the live outlook (today plus
five forecast days), and a replay of October 2026.

Method source: Phung et al. 2025, International Journal of Epidemiology,
doi:10.1093/ije/dyaf169 (six puskesmas, Palangka Raya and Pulang Pisau,
2015–2019).

## Requirement 1 — A real 3D view of the haze

**User story:** As a Dinkes officer, I want to see the real haze situation on a
realistic globe, so that I trust what the outlook is based on.

**Acceptance criteria**

1.1. WHEN the app loads, THE SYSTEM SHALL render a 3D globe with atmosphere,
satellite imagery, and terrain elevation, using only the open sources listed in
`docs/DATA.md`, and SHALL show their attribution on screen.

1.2. WHEN the user selects a date, THE SYSTEM SHALL show the NASA true-colour
image of that date and the satellite fire detections available for that date.

1.3. THE SYSTEM SHALL draw the modelled smoke field (CAMS PM2.5) for the
selected day with a legend in µg/m³ that includes the Indonesian ISPU bands.

1.4. IF a data source fails or returns data older than expected, THEN THE
SYSTEM SHALL name the source and the data time on screen, and SHALL NOT present
that data as current.

## Requirement 2 — A five-day respiratory-visit outlook with ranges

**User story:** As a Dinkes officer, I want each puskesmas and district to show
how many respiratory visits to expect in the next five days, with a range, so
that I can move resources before the surge.

**Acceptance criteria**

2.1. THE SYSTEM SHALL classify each district-day as a haze day when the
district's daily mean PM10 is at least 100 µg/m³, and as a fire-haze day when it
is a haze day with at least one fire detection inside the district.

2.2. THE SYSTEM SHALL compute, for every haze day, the number of consecutive
haze days up to and including that day, and group it as 1–3, 4–14, or 15 or more.

2.3. THE SYSTEM SHALL compute expected daily visits as baseline × relative
risk, with lower and upper values from the published 95% interval, using the
relative-risk table for the district's profile (kota or kabupaten), the
definition (haze or fire-haze), and the duration group.

2.4. WHEN a day is not a haze day, THE SYSTEM SHALL set expected visits equal to
the baseline with no change.

2.5. THE SYSTEM SHALL show every estimate together with its range and its
source, and SHALL show the study's limits next to the numbers.

2.6. WHEN the user edits a puskesmas baseline or the district profile, THE
SYSTEM SHALL recompute the outlook in the browser without a server round trip.

## Requirement 3 — A prep plan

**User story:** As a puskesmas head, I want concrete preparations tied to the
outlook, so that the numbers turn into action.

**Acceptance criteria**

3.1. WHEN the user enters a room's floor area and ceiling height, THE SYSTEM
SHALL compute the clean air delivery rate needed for the target air changes per
hour and the number of air purifiers of a given rated CADR, rounding up.

3.2. THE SYSTEM SHALL rank districts for posko and rumah oksigen priority by
expected extra visits over the outlook window, and SHALL show the inputs behind
each rank.

3.3. IF a district's outlook is incomplete because a source failed, THEN THE
SYSTEM SHALL mark its rank as incomplete instead of ranking it low.

## Requirement 4 — Agents can ask for the outlook

**User story:** As an AI agent working for a health office, I want to query the
outlook over MCP, so that I can answer questions and draft briefings from the
same numbers the app shows.

**Acceptance criteria**

4.1. WHEN an agent calls `haze_outlook` with a district name or code, THE
SYSTEM SHALL return the daily classification, expected visits with ranges, the
data times, and the method source.

4.2. WHEN an agent calls `clinic_plan` with a puskesmas id and room size, THE
SYSTEM SHALL return the clean-air sizing and the outlook for that puskesmas.

4.3. THE MCP tools SHALL use the same engine as the web app, so that both give
identical numbers for identical inputs.

## Requirement 5 — Replay of a real episode

**User story:** As a judge or a new user, I want to replay October 2026 with
archived data, so that the tool is meaningful even on a clear day.

**Acceptance criteria**

5.1. THE SYSTEM SHALL offer a replay mode for 1–31 October 2026 built from
archived CAMS data, and from archived FIRMS data when a FIRMS MAP_KEY was
available at build time.

5.2. WHEN fire history is not available for the replay, THE SYSTEM SHALL use the
haze-day definition only and SHALL say so on screen.

## Out of scope (for this spec)

- Provinces outside Kalimantan.
- Mask and medicine quantities that need age-structured population data.
- Individual medical advice, logins, and any personal data.
