# Sootsayer: the demo video

The demo video is code. `video/` renders it with Remotion and three.js from
real data and real recordings of the app, with an original synthesised score
(how it is built: [video/README.md](../video/README.md)). No voice and no
narrator: every shot carries one English subtitle with one ember word and one
source line, in the margin under the footage. For every element being
explained, the camera pushes in on the recording and a charcoal ring is drawn
around it.

Length 2:55 (under the 3-minute limit), 1920×1080, 30 fps, H.264 + AAC.
Chapters: 1/4 The problem (0:00) · 2/4 From the fire pixel to the clinic
queue (0:30) · 3/4 Can you trust it? (1:40) · 4/4 Built with Kiro (1:55).

| # | Time | Shot | Subtitle (ember word in *italics*) |
|---|---|---|---|
| 1 | 0:00 | three.js: the map draws itself from Natural Earth coastlines and geoBoundaries district borders, to the sound of charcoal | Kalimantan, October 2026. |
| 2 | 0:08 | the 9,766 NASA FIRMS detections of 14 Oct ignite as embers; the counter counts them | *9,766* satellite fire detections in one day. |
| 3 | 0:14 | the page darkens; the CAMS PM2.5 of that day becomes hatching | *At least 425,167* respiratory infections from fire haze, 20 Aug – 5 Nov. |
| 4 | 0:20 | 339 OpenStreetMap puskesmas appear as rings, over a heartbeat | Satellites see the fire. Air apps see the smoke. *Nobody tells the clinics who is coming.* |
| 5 | 0:25 | the paper burns away from the fires and reveals the real app; one big hit | (the app's start card: three plain steps) |
| 6 | 0:30 | real app: fly-in from the globe to Kalimantan | A five-day haze outlook for *every district and clinic*. · Kalimantan: 56 districts, *339 mapped puskesmas*. |
| 7 | 0:40 | replay 1 → 14 Oct at 1.5×; the camera pushes onto the timeline, the legend, the pillars | October 2026, *replayed day by day*. · Haze day: PM10 ≥ 100 µg/m³. With a satellite fire: *fire-haze day*. · Pillars: *expected respiratory visits* at each puskesmas. |
| 8 | 0:53 | Pulang Pisau: the ranked row, the plain sentence with the 5-day change (one hit), the run of fire-haze days, the method limits | Where should posko and oxygen houses *open first*? · Pulang Pisau: *+88%* respiratory visits expected (95% range +14% to +211%). · A fire-haze day, *28 days in a row*. · The study's *limits* stay next to the numbers. |
| 9 | 1:08 | Puskesmas Jabiren: the plain sentence with the visits, clean-air room with the Corsi–Rosenthal preset, indoor PM2.5 | Puskesmas Jabiren, 14 Oct: *4.7* respiratory visits a day expected (2.8 to 7.8). · Plan a *clean-air waiting room*. |
| 10 | 1:22 | the briefing for the health office, in English; push-in on Share and on the first ranked line | One button: a briefing the health office can *send as is*. · Written by the *Rust engine*, not a language model. |
| 11 | 1:33 | Sumatra | *Sumatra* too: Riau, Jambi, South Sumatra. |
| 12 | 1:40 | chapter card "Can you trust it?" burns away into the "What was forecast" view of 15 Oct: the haze-day chance in Pulang Pisau's panel, then the Watch list | What did the forecast say *at 06:00 that morning*? · Machine learning turns it into a *haze-day chance*. · *Watch*: haze the raw forecast would miss. |
| 13 | 1:55 | chapter card "Built with Kiro" burns away into the real spec | *Spec-driven*: requirements, design decisions, tasks. |
| 14 | 2:06 | steering house rules, the hooks, and their real findings stamped CAUGHT BY HOOK → fixed | Steering sets the house rules. *Hooks* check every edit against them. |
| 15 | 2:16 | the real `cargo test` and parity output | *Property-based tests*, and one engine everywhere. |
| 16 | 2:24 | the MCP tools and a real `daily_brief` result | Kiro gets the *same engine* as MCP tools. |
| 17 | 2:34 | the NASA night image of 14 Oct, slow orbit | The same night from space: *the fires and the cities*. |
| 18 | 2:41 | live mode as recorded that day (12 Nov, no haze, and the subtitle says so) | Live: *the next five days*, every morning. |
| 19 | 2:47 | end card: riser and hit, embers, the links, and the credits every data source asks for | Sootsayer — from the fire pixel to the clinic queue |

The figures in shot 12 are the app's own held-out test of the haze-day chance
(one day ahead, Kalimantan: a chance of 30% or more caught 421 of 480 district
haze days, the raw forecast 361; 138 false alarms against 69). Each week is
scored by a model that never saw it, against the model's own later estimate,
not stations, and the app says so next to the numbers.

## Sound
Original, synthesised in `video/scripts/score.py`; every cue is read from the
timeline, so it lands on the picture.
- Music: a low D drone, a dark pad that opens as the page darkens, a slow
  pulse under the product, brighter chords for Kiro, the drone again at the end.
- Effects only where the picture really does something: charcoal scratching
  while the map and the words draw themselves, fire crackle in every burn, a
  heartbeat under "who is coming?", a riser and a hit at the reveal, soft air
  on the four real camera flights, a quiet click on each recorded click, one
  hit on +88%, a slam and a burn on each of the two chapter cards, three
  stamps for the hooks' catches, a riser and a hit on the title.
- No bells, chimes, synth blips or per-cut stingers. The music ducks under
  the six hits (the first a soft one at the ignition). One shared room
  (reverb). −16 LUFS integrated, −1.5 dBTP.

## Checks against the rules
- Under three minutes; shows the app working in a desktop browser.
- English on screen throughout, including the briefing (the app also writes it
  in Bahasa Indonesia).
- No third-party trademarks or logos on screen, no stock footage, and no
  copyrighted music.
- The end card carries the notices the data sources ask for in video (list in
  [DATA.md](DATA.md), "Permissions and required notices").
- Fonts under the SIL Open Font License; Remotion used under its free
  license for individuals.

## Kiro write-up checklist
- Specs: `haze-clinic-outlook` (v1) and `outlook-v2`: 12 requirements, 48
  EARS acceptance criteria, 10 design decisions, 22 tasks.
- Steering: house rules that shaped the UI (ranges, limits, named failures).
- Hooks: they fire on the agent's own edits too. The house-rules hook flagged
  an English label inside the Indonesian briefing, a failed forecast load that
  would have kept the forecast label over hindsight data, and a hard-coded
  legend label outside i18n.ts; earlier reviews found English-only CSV errors
  and METHOD.md missing new constants (all fixed). An agent edit to
  `engine/src/check.rs` rebuilt the WASM module and the CLI through
  `engine-check-on-save`.
- Property-based testing: eight proptest invariants, including "every
  briefing carries its limits and a range on every ranked line" and "the
  forecast check counts every pair once".
- MCP: seven tools, including `daily_brief` and `forecast_check`.
- Custom agent: `.kiro/agents/sootsayer-briefer.md`.
- Power: `power-sootsayer/` (MCP config and two skills).
