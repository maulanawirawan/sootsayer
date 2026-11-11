# Sootsayer — 3-minute demo script

Target: under 3 minutes, public YouTube, English voice or English subtitles.
Record the real app (deployed URL or `npm run dev`) with OBS at 1080p.
No third-party music or footage.

**Before recording:** open `/?mode=replay&date=2026-10-01` in one tab, and
Kiro with the Sootsayer MCP server enabled in another window.

| Time | On screen | Say |
|---|---|---|
| 0:00–0:15 | Intro card over the globe | "Indonesia's 2026 haze season: more than four hundred thousand respiratory infections by November. Satellites saw the fires. Air apps saw the smoke. Nobody told the puskesmas who was coming." |
| 0:15–0:30 | Press "Masuk ke Kalimantan"; the camera flies down to Borneo | "This is Sootsayer, the soot-sayer for community clinics. Everything here is real open data: NASA's satellite photo of that day, terrain, fire detections, and the Copernicus smoke model." |
| 0:30–1:00 | Press Play on the timeline (1 → 15 Oct); smoke thickens, districts turn orange, pillars rise | "Each day, every district is classified with the definitions of a puskesmas study from Central Kalimantan. Haze day, fire-haze day, and how many days in a row. The pillars are puskesmas: their height is expected respiratory visits." |
| 1:00–1:25 | Pause on 15 Oct; point at the priority list | "Here is what a health office needs: where to open posko and rumah oksigen first. Ranked by the expected change in visits, so districts with no puskesmas on the map still count." |
| 1:25–1:55 | Click Pulang Pisau; show +83% (+32% … +154%), the chart, the limits | "Pulang Pisau: twenty-nine days of haze, plus eighty-three percent respiratory visits, with a range from thirty-two to one hundred fifty-four. Never one number without its range and its source, and the study's limits are right here." |
| 1:55–2:20 | Click a puskesmas pillar; edit the baseline; fill the clean-air room form | "A puskesmas head types in their own usual visits, and gets a clean-air room plan: this waiting room needs three purifiers of three hundred cubic metres per hour." |
| 2:20–2:45 | Switch to Kiro; ask the agent "Which districts should get rumah oksigen first, and how sure are we?" The agent calls `priority` and `haze_outlook` | "The same Rust engine runs in the browser as WebAssembly and here as an MCP tool, with byte-identical numbers. An agent can draft the briefing for the health office." |
| 2:45–3:00 | Back to the globe, switch to Live (today) | "Live, it does this every day for the next five days. Sootsayer: from the fire pixel to the clinic queue." |

## Moments that must land

1. The fly-in from the globe to Borneo (first 30 seconds).
2. Play: smoke spreading and pillars rising over 15 days.
3. "+83% (+32% … +154%)" with the limits visible: honesty as a feature.
4. Kiro calling the MCP tool and getting the same numbers.

## Kiro write-up checklist

- Spec: requirements → design → tasks in `.kiro/specs/haze-clinic-outlook/`,
  and the two design changes found during the build.
- Steering: house rules that shaped the UI (ranges, limits, named failures).
- Hooks: engine check on save (tests, WASM, CLI, parity), citation check, UI
  house-rules check.
- Property-based testing: the five proptest invariants.
- MCP: the Sootsayer server and the question asked in the video.
