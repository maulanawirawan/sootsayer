# Sootsayer Morning Brief (Kiro Crew app)

Every morning at 06:00 WIB, a Kiro Crew agent asks the
[Sootsayer](https://sootsayer.vercel.app) engine where wildfire haze will hit
Indonesia's community clinics (puskesmas) over the next five days, and
delivers the health-office briefing word for word: priority districts for
emergency posts and oxygen houses with 95% ranges, the haze-day chance and
watch list, data times, failed sources, and the method's limits.

The numbers never come from a language model. The Sootsayer Rust engine
writes the briefing; the agent only fetches it and forwards it intact, so
the WhatsApp group of a district health office (Dinas Kesehatan) gets the same
bytes the web app shows.

Built for Kiroween 2026 inside the [Sootsayer repository](https://github.com/maulanawirawan/sootsayer).

## What it brings to Kiro Crew

| Part | File | What it does |
|---|---|---|
| Schedule | `app.json` → `crons[morning-brief]` | `0 6 * * *` in `Asia/Jakarta`, strict (no random start delay), so the briefing is ready when the office opens. Ships **paused**: you resume it after setup and choose where the result goes. |
| Agent | `agents/morning-briefer.json` (`sootsayer-morning-briefer`) | Briefs only from the Sootsayer tools, under nine rules: no invented numbers, every estimate with its 95% range, a chance is a chance (not a range), watch districts are "possible, prepare", failed sources named, limits kept, no medical advice, plain calm Bahasa Indonesia first. |
| Skill | `skills/haze-morning-brief/SKILL.md` | The order of calls for each question a health office asks: the daily briefing, "where first?", one district, one clinic, "how far can we trust it?". |
| MCP server | `app.json` → `mcpServers.sootsayer`, `bin/sootsayer_mcp.py` | Starts the Sootsayer MCP server from your clone. Its seven tools are read-only and listed in `autoApprove`, so the 06:00 run never waits for a click nobody is there to give. |

The tools: `list_regions`, `list_districts`, `priority`, `haze_outlook`,
`clinic_plan`, `daily_brief`, `forecast_check`. They cover Kalimantan (56
districts) and Sumatra's peatland provinces (40 districts), live or as an
October 2026 replay.

## What a run looks like

At 06:00 WIB the schedule sends the agent one message: for Kalimantan, then
Sumatra, call `daily_brief(mode="live", lang="id")`, copy its text exactly,
add one line with the region and the data times, and say plainly if a source
failed. If a tool fails, the agent reports the failing tool and region
instead of writing a briefing itself.

A briefing line looks like this (October 2026 replay, as forecast that
morning):

```
1. Hulu Sungai Utara: +83% (+32% … +154%); 5 hari kabut, profil kabupaten, 8 puskesmas terpetakan, peluang hari kabut tertinggi >99% (15 Okt)
Waspada: belum hari kabut menurut prakiraan, tetapi peluangnya 30% atau lebih:
Melawi 66% (15 Okt), Kayong Utara 64% (15 Okt), Banjar 51% (19 Okt), Barito Utara 34% (15 Okt)
```

Between runs, anyone in Kiro Crew can ask the agent directly: "Which
districts need oxygen houses this week?", "How many patients should
Puskesmas Jabiren prepare for?", "How right was the forecast in October?".

## Set it up

1. Clone the repository and build the engine once:
   ```
   git clone https://github.com/maulanawirawan/sootsayer
   cargo build --release --manifest-path sootsayer/engine/Cargo.toml
   ```
2. Install [uv](https://docs.astral.sh/uv/) and set `SOOTSAYER_REPO` to the
   clone, then restart Kiro Crew so it sees the variable:
   - Windows: `setx SOOTSAYER_REPO D:\github\sootsayer`
   - macOS / Linux: `export SOOTSAYER_REPO=~/sootsayer` (in your shell profile)
3. Install and enable the app:
   ```
   kirocrew app install /path/to/sootsayer/crew/sootsayer-morning-brief
   kirocrew app enable sootsayer-morning-brief
   ```
   Kiro Crew asks you to trust a third-party app before it enables it
   (Settings → Security → Third-party apps). Read `bin/sootsayer_mcp.py` first:
   it only checks the clone and starts `uv run` on the repository's
   `mcp-server/server.py`.
4. On the **Schedule** page, resume `morning-brief` and pick where its result
   is delivered (a chat, or a channel you connected to Kiro Crew).

If `SOOTSAYER_REPO` is missing, the engine is not built, or uv is not on
PATH, the server stops at once with a message that says which one.

## Limits (the same as the app's)

- The visit estimates come from one study of six puskesmas in Central
  Kalimantan (Phung et al. 2025, Int J Epidemiol); the effect was clear in
  Pulang Pisau and absent in Palangka Raya city; elsewhere they are applied by
  analogy.
- Smoke is a model estimate (Copernicus CAMS, about 45 km), not station
  measurements. The haze-day chance was trained on one month (October 2026);
  in live mode it is applied by analogy.
- Decision support for clinic load, not medical advice for any person.

## Licence

MIT, like the rest of Sootsayer. Data notices: see `docs/DATA.md` in the
repository.
