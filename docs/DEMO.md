# Sootsayer — 3-minute demo script

Target: under 3 minutes, public YouTube, English voice or English subtitles.
Record the real app (deployed URL or `npm run dev`) with OBS at 1080p.
No third-party music or footage.

**Before recording**
- Tab 1: `/?region=kalimantan&mode=replay&date=2026-10-01&lang=en`.
- Kiro with the Sootsayer MCP server connected (reconnect it after pulling:
  it has new tools), or the custom agent `sootsayer-briefer`.
- Optional hands-free take for B-roll: `/?tour=1&lang=en` (Space pauses,
  → skips, Esc ends; `&pace=1.5` is slower).

| Time | On screen | Say |
|---|---|---|
| 0:00–0:15 | Intro card over the globe | "Indonesia's 2026 haze season: by 2 November, the health ministry counted 401,586 respiratory infections linked to fires in seven provinces. Satellites saw the fires. Air apps saw the smoke. Nobody told the puskesmas who was coming." |
| 0:15–0:30 | Press "Fly to Kalimantan"; the camera flies down to Borneo | "This is Sootsayer, the soot-sayer for community clinics. Everything is real open data: NASA's satellite photo of that day, fire detections, terrain, and the Copernicus smoke model." |
| 0:30–0:55 | Press Play (1 → 14 Oct); smoke thickens, districts turn orange, pillars rise | "Every district-day is classified with the definitions of a puskesmas study from Central Kalimantan: haze day, fire-haze day, and how many days in a row. Pillars are puskesmas; their height is expected respiratory visits." |
| 0:55–1:15 | Pause on 14 Oct; point at the priority list; click Pulang Pisau | "Where to open posko and oxygen houses first. Pulang Pisau: plus eighty-eight percent respiratory visits, with a range from fourteen to two hundred eleven. Never one number without its range, its source, and the study's limits right here." |
| 1:15–1:40 | Click the Anjir Serapat pillar; press the Corsi–Rosenthal preset; show the indoor table | "A puskesmas head types in their usual visits and plans a clean-air waiting room: two do-it-yourself filter boxes from an EPA test, and how smoky the room gets with and without a cleaner, from measured smoke infiltration." |
| 1:40–2:00 | Press "Briefing for the health office"; show the text; press Share on WhatsApp | "One button gives the health office a briefing it can send as is, in Bahasa Indonesia or English. The Rust engine writes it, not a language model, so no range and no limit gets lost." |
| 2:00–2:15 | Press "Sumatra"; the camera flies to Riau, Jambi, South Sumatra on 7 Oct | "The same engine covers Sumatra's peatland provinces. Regions are just data: boundaries, puskesmas, a smoke grid." |
| 2:15–2:45 | Switch to Kiro; ask "Give me today's haze briefing for Kalimantan in Indonesian". The agent calls `daily_brief` | "The same Rust engine runs in the browser as WebAssembly and here as an MCP tool, byte for byte. A Kiro Crew job can post this to the health office's Telegram every morning." |
| 2:45–3:00 | Back to the globe, Live mode, night layer on | "Live, it does this every day for the next five days. Sootsayer: from the fire pixel to the clinic queue." |

## Moments that must land

1. The fly-in from the globe to Borneo (first 30 seconds).
2. Play: smoke spreading and pillars rising over two weeks.
3. "+88% (+14% … +211%)" with the limits visible: honesty as a feature.
4. The briefing: one button, a text a health office can send.
5. Kiro calling `daily_brief` and getting the same text.

## Kiro write-up checklist

- Specs: `haze-clinic-outlook` (v1) and `outlook-v2` (briefing, regions,
  waiting room, CSV, tour, agents), with the design decisions and what was not
  built and why.
- Steering: house rules that shaped the UI (ranges, limits, named failures).
- Hooks, with real catches: the UI house-rules hook flagged English-only CSV
  errors and an English label in the Indonesian briefing; the citation hook
  flagged METHOD.md missing the new constants. All fixed.
- Property-based testing: seven proptest invariants, including "every
  briefing carries its limits and a range on every ranked line".
- MCP: six tools, including `daily_brief`.
- Custom agent: `.kiro/agents/sootsayer-briefer.md`.
- Power: `power-sootsayer/` (MCP config and two skills).
- Kiro Crew: scheduled morning briefing (see README).
