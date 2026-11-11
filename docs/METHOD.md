# Method

Sootsayer turns a smoke forecast into an expected change in respiratory visits
at puskesmas. Every number below lives in one place in the code,
[`engine/src/method.rs`](../engine/src/method.rs), with its citation.

## Source study

Phung VLH, Ueda K, Yulianti N, et al. *Effects of smoke haze on respiratory
clinic visits in Central Kalimantan, Indonesia according to different haze
characteristics.* International Journal of Epidemiology, 2025.
doi:[10.1093/ije/dyaf169](https://doi.org/10.1093/ije/dyaf169), open access at
[PMC12533422](https://pmc.ncbi.nlm.nih.gov/articles/PMC12533422/).

Daily respiratory visits at six puskesmas in Palangka Raya City and Pulang
Pisau Regency, 2015–2019, analysed with a space-time-stratified case-crossover
design (conditional quasi-Poisson, distributed lag over 0–5 days).

## Where it is applied

| Region | Provinces | Districts | Status |
|---|---|---|---|
| Kalimantan | Kalimantan Barat, Tengah, Selatan, Timur, Utara | 56 (9 kota) | Study area (Central Kalimantan) and its neighbours |
| Sumatra | Riau, Jambi, Sumatera Selatan | 40 (8 kota) | By analogy: peatland fire provinces outside the study |

The study covers two districts of Central Kalimantan. Everywhere else,
including the other Kalimantan provinces and Sumatra, the same relative risks
are applied by analogy, and the app says so in its limits. Riau and Sumatera
Selatan are among the seven provinces in the Kemenkes karhutla ISPA reports of
2026; Jambi lies between them. A region is data only (boundaries, puskesmas,
grid), so the engine is the same for every region.

## Step 1: classify each district-day

| Status | Rule (study Table 1) |
|---|---|
| Haze day | district daily mean PM10 ≥ 100 µg/m³ |
| Fire-haze day | haze day with at least one satellite fire detection in the district |
| Clear | PM10 below 100 µg/m³ |
| Unknown | no PM10 value; never guessed |

- District PM10 is the plain mean of the CAMS grid cells whose centres fall in
  the district (or the nearest cell for small districts).
- Fire detections are assigned to districts by point-in-polygon in the engine.
- Forecast days have no fire data yet. They count as haze days, not as
  fire-haze or clear days.
- Daily means use UTC+7 (WIB) for every region; the one-hour WITA offset in
  part of Kalimantan is ignored.

## Step 2: duration

Consecutive haze or fire-haze days up to and including the day, grouped as
1–3, 4–14, or 15 or more (study definition). A clear or unknown day ends the
run, so missing data never makes a run look longer. The live view loads 14 past
days so the 15+ group is reachable on the first forecast day.

## Step 3: relative risk

Cumulative relative risk of respiratory visits on a haze day compared with a
non-haze day, lag 0–5, study Table 4 (main model), with 95% intervals:

| Profile | Definition | 1–3 days | 4–14 days | 15+ days |
|---|---|---|---|---|
| kabupaten (Pulang Pisau) | haze | 1.195 (0.877–1.629) | 1.573 (1.201–2.060) | 1.828 (1.317–2.537) |
| kabupaten (Pulang Pisau) | fire-haze | 1.317 (0.908–1.912) | 1.700 (1.111–2.601) | 1.881 (1.138–3.108) |
| kota (Palangka Raya) | haze | 0.992 (0.833–1.181) | 0.968 (0.821–1.141) | 0.703 (0.561–0.883) |
| kota (Palangka Raya) | fire-haze | 0.929 (0.732–1.180) | 0.970 (0.755–1.247) | 1.333 (0.169–10.496) |

Cities (kota) use the kota profile: 9 in Kalimantan and 8 in Sumatra, from an
explicit list per region. All regencies use the kabupaten profile. A health
office can switch a district's profile in the app.

Note on a discrepancy in the paper: the abstract gives fire-haze in Pulang Pisau
as +74.4% (CI 18.9–164.6%), while Table 4 gives 1.774 (1.189–2.646). The
geometric mean of that interval is 1.774, so Sootsayer uses the table. The
engine's tests check every cell this way (point within 3% of √(low × high)).

## Step 4: expected visits

`expected = baseline × RR` for the point, low, and high values, and
`extra = expected − baseline`. Default baselines (respiratory visits per
puskesmas per day, study Table 2, 2015–2019):

- kota: mean of Kereng Bangkirai 2.6, Menteng 9.4, Tangkiling 5.6 → **5.9**
- kabupaten: mean of Bereng 2.5, Bukit Rawi 1.8, Pulang Pisau 3.2 → **2.5**

A puskesmas head should replace the default with their own records: one by
one in the puskesmas panel, or as a column of an imported puskesmas list.
Both stay in the browser only.

## Step 5: priority for posko and rumah oksigen

Districts are ranked by the mean of `RR − 1` over the five-day window (the
expected relative change in visits), then by fire-haze days and haze days.
Absolute extra visits are not the ranking key because OpenStreetMap does not
map every puskesmas. It lists 339 across Kalimantan's 56 districts, with four
districts having none (Kota Pontianak, Kubu Raya, Katingan, Kotawaringin
Timur), and 167 across Sumatra's 40, with ten having none. Districts with
missing data are listed as incomplete, never ranked low.

## Clean-air room

`volume = area × height`, `CADR needed = volume × 5`, `units = ⌈CADR needed ÷
unit CADR⌉`. The target of 5 air changes per hour of clean air comes from the
US CDC/NIOSH "Aim for 5" guidance (Ventilation in Buildings, 2023), which was
written for respiratory viruses; Sootsayer uses it as a practical target for a
clean-air room during smoke and says so. The unit CADR comes from the device
label, or from the one preset below.

**Corsi–Rosenthal box preset: 682 m³/h.** In a US EPA chamber test with
simulated wildfire smoke, a single-filter box fan gave 111.2 cfm and the
Corsi–Rosenthal design (four MERV-13 filters and a 20-inch box fan) gave 261%
more: 111.2 × 3.61 = 401.4 cfm = 682 m³/h (Holder AL, Halliday HS, Virtaranta
L. *Impact of do-it-yourself air cleaner design on the reduction of simulated
wildfire smoke in a controlled chamber environment.* Indoor Air
2022;32(11):e13163). Home builds vary with the fan and filters, and
smoke-loaded filters lose much of their CADR; the app says so.

## Indoor PM2.5 in the waiting room

`indoor = outdoor PM2.5 × Finf`, where outdoor PM2.5 is the district's daily
mean from CAMS for the selected day and Finf is the infiltration factor
measured in homes during forest-fire and wood smoke in British Columbia (Barn
P, Larson T, Noullett M, Kennedy S, Copes R, Brauer M. *Infiltration of forest
fire and residential wood smoke: an evaluation of air cleaner effectiveness.*
J Expo Sci Environ Epidemiol 2008;18(5):503–511):

| Condition | Finf, winter mean | Finf, summer mean |
|---|---|---|
| No HEPA air cleaner | 0.27 | 0.61 |
| HEPA air cleaner in place | 0.10 | 0.19 |

The app shows the span between the winter and summer means. **It is not a 95%
interval**, and the app labels it that way. A puskesmas waiting room with open
louvres or doors can let in more smoke than these homes did, so the advice
next to the numbers is to close the room first. Example: at 844.6 µg/m³
outdoors (Palangka Raya, 15 Oct 2026), the measured factors give about
228–515 µg/m³ indoors without a cleaner and 84–160 µg/m³ with one.

## Assumptions and limits (also shown in the app and in every briefing)

1. One study, six puskesmas, two districts, 2015–2019. The authors call the
   overall result inconclusive.
2. The effect was clear in Pulang Pisau and absent in Palangka Raya city, where
   long haze even lowered puskesmas visits (patients moving to hospitals, posko,
   and rumah oksigen, or puskesmas reaching capacity). Values below 0% in the
   kota profile mean a shift away from the puskesmas, not good news.
3. Outside Central Kalimantan the study's estimates are applied by analogy:
   the other Kalimantan provinces and Sumatra were not part of the study.
4. Cumulative lag 0–5 RRs are applied as daily multipliers. This is exact for a
   sustained episode where every lag day is exposed and an approximation in the
   first days; the 1–3 day group partly absorbs it.
5. Smoke values are CAMS model estimates on a ~45 km grid, not station data.
   The study estimated PM10 from satellite aerosol optical depth; the two are
   not calibrated against each other. Local smoke can be missed (Balikpapan
   reported a surge in October 2026 while its CAMS PM10 stayed below 100).

Not yet validated against 2026 visit records. That is the first thing a
health office pilot should do.

## Briefing text

The briefing a health office can send (WhatsApp, Telegram, email, print) is
written by the engine (`engine/src/brief.rs`), in Bahasa Indonesia or English,
from the same outlook the map shows. It always lists the ranked districts with
their 95% ranges, the incomplete districts, the data times, any failed source,
the method source, the five limits above, and the line that it is not medical
advice. The MCP tool `daily_brief` returns the same bytes, so an agent (for
example a Kiro Crew job each morning) forwards text it did not write.

## Verification in this repo

- 28 unit tests and 7 property-based tests (proptest) in `engine/`: range
  ordering, clear-day identity, monotonic duration effect, purifier coverage,
  determinism, indoor estimates ordered and lower with a cleaner, and every
  briefing carrying its ranges, limits, and disclaimer.
- `node web/scripts/check-parity.mjs` runs a real October input of every
  region through the WebAssembly module and the native CLI, for the outlook
  and for the briefing in both languages, and requires byte-identical output.
