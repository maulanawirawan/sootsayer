# How Sootsayer was built with Kiro

Sootsayer is a health product built fast with an AI agent, so the main risk
was the agent quietly breaking the product's promises: a number without its
range, an invented value, a stale source shown as current, an English line
inside an Indonesian briefing. The strategy was to write those promises down
once and have Kiro enforce them on every save, including on its own edits.
Everything below is in the repository: `.kiro/`, `power-sootsayer/` and
`crew/`.

## Kiro surfaces used

| Surface | What it did here |
|---|---|
| **Kiro IDE** | Specs, steering, agent hooks, the MCP server registration (`.kiro/settings/mcp.json`), the custom agent `sootsayer-briefer`, and most of the code. |
| **Kiro power** | `power-sootsayer/` packages the MCP server with two skills (`haze-briefing`, `add-a-region`) so another Kiro user gets the tools and the know-how in one install. |
| **Kiro Crew** | `crew/sootsayer-morning-brief/`: a Crew app with a 06:00 WIB schedule, an agent, a skill and the MCP server, so the briefing arrives without anyone opening the IDE. |

The IDE is where the product was designed and checked; Crew is where it runs
unattended. The same MCP tools and the same rules serve both.

## Specs: three, written before their code

| Spec | Requirements | EARS acceptance criteria | Design decisions | Tasks |
|---|---|---|---|---|
| `haze-clinic-outlook` (v1) | 5 | in v1+v2: 48 | in v1+v2: 10 | in v1+v2: 22 |
| `outlook-v2` | 7 | | | |
| `outlook-v3` | 4 | 22 | 8 | 10 |
| **Total** | **16** | **70** | **18** | **32** |

The specs changed when facts arrived, and the specs say why:
- OpenStreetMap maps only part of the puskesmas, so the priority list ranks
  districts by the relative change in visits, not by clinic counts.
- Open-Meteo's free tier allows 600 calls a minute; all of Indonesia would
  cost about 2,655 calls per refresh, so coverage stays with the haze regions.
- The forecast check showed that the first 7 hours of the first forecast day
  are the same data as the archive, so the app says that day flatters the
  forecast.
- `outlook-v3` planned the haze-day watch at a 50% chance. The held-out test
  showed 50% caught barely more haze days than the raw forecast, so the
  decision moved to 30%, and `tasks.md` records the change and its cost
  (more false alarms).

## Steering: the house rules

`.kiro/steering/product.md` holds five rules: real data only; a 95% range
next to every estimate; the method's limits on screen; never stale data as
current; decision support, not diagnosis. `tech.md` lists every source with
its licence and fair-use limits; `structure.md` says where things go (every
study number in `engine/src/method.rs` and nowhere else).

## Agent hooks: the rules, enforced on every save

| Hook | Fires on | Does |
|---|---|---|
| `engine-check-on-save` (command) | any `engine/**/*.rs` | runs the unit and property tests, rebuilds the WebAssembly module and the CLI, checks byte parity |
| `house-rules-ui-check` (agent) | any `web/src/*.ts` | reviews the change against the five house rules |
| `method-citation-check` (agent) | `engine/src/method.rs`, `docs/METHOD.md` | checks every constant has a citation and both files agree, value for value |

They fire on Kiro's own edits too, and they caught real problems before they
shipped:

| Hook | File | What it caught | Fix |
|---|---|---|---|
| house-rules-ui-check | `web/src/data.ts` | An English source label would have appeared inside the Indonesian briefing. | Source name and run time only |
| house-rules-ui-check | `web/src/main.ts` | A failed forecast load would have kept the "What was forecast" label over hindsight data. | Fall back to hindsight and name the failed source |
| house-rules-ui-check | `web/src/ui.ts` | A legend tick label was hard-coded outside the translation file. | Moved to `i18n.ts` (id + en) |
| method-citation-check | `docs/METHOD.md` | New constants of outlook v2 were missing from the method document. | Added, value for value |
| method-citation-check | `engine/src/method.rs` | The haze-day chance's two new constants (log floor, watch level) were not in METHOD.md. | Added, value for value |
| house-rules-ui-check | `web/src/data.ts` | The chance file's English source label would have shown in the Indonesian error banner. | The file name is the label |
| house-rules-ui-check | `web/src/i18n.ts` | The start card promised a "60-second tour"; the tour's steps add up to 74 s. | "About 75 seconds" |

## Property-based tests: requirements as invariants

Ten proptest invariants in `engine/tests/properties.rs`: ranges stay ordered;
a clear day changes nothing; the regency effect never shrinks during an
unbroken run; the same input gives the same output; purifier counts cover the
room and are minimal; indoor smoke is lower with a cleaner; every briefing
carries its limits, its disclaimer and a range on every ranked line; the
forecast check counts every pair once; the haze-day chance stays a
probability on window days only and never changes the study's estimates or
the ranking; more forecast smoke never lowers the chance. Plus 38 unit tests.

## One engine, so the agent cannot drift

The Rust engine writes the briefing text, not a language model, and it runs
in three places: the browser (WebAssembly), the CLI the MCP server calls, and
the pipeline. `web/scripts/check-parity.mjs` feeds real October inputs to the
WebAssembly module and the CLI and requires identical bytes for the outlook,
both briefings, the forecast check and the haze-day chance. The machine-
learning part follows the same rule: scikit-learn trains the chance model at
build time, the engine evaluates it with its own deterministic `ln` and
`exp`, and the build stops if the two ever differ by more than 0.0006.

## MCP, custom agent, Crew app

- **MCP server** (`mcp-server/`, Python SDK v2): seven tools, `list_regions`,
  `list_districts`, `priority`, `haze_outlook`, `clinic_plan`, `daily_brief`,
  `forecast_check`, each answering with the engine's numbers, data times,
  failed sources and caveats.
- **Custom agent** (`.kiro/agents/sootsayer-briefer.md`): briefs only from
  those tools and forwards `daily_brief` verbatim.
- **Kiro Crew app** (`crew/sootsayer-morning-brief/`): the same rules as an
  unattended 06:00 WIB job; see its README.

## The demo video is code too

`video/` renders the demo with Remotion and three.js: the opening is drawn
from real data, the product shots are the real app recorded frame by frame,
the Kiro shots are typeset from these files and from commands run at build
time, and the score is synthesised with numpy.
