# crosscheck

**Double-check your automated reports before a human ever reads them.**

Automated tools spit out long reports — data-quality alerts, lint warnings,
uptime checks — and a lot of it is noise or plain wrong. crosscheck reads a
findings list, checks every item against public data sources and your own
local rules, labels each one, and writes a clean Markdown report. The house
rule is simple:

> **If it can't be backed by evidence, it doesn't go in the report.**

Every line that does make it in carries a **receipt**: what was checked, which
source backed it, and a short fingerprint you can re-check later.

## Why it exists

AI agents now generate everything and verify almost nothing. Reports pile up
faster than anyone can read them, so the real problems hide inside walls of
"maybe." crosscheck is the quality layer for that world — the stamp that says
*a human can trust this.*

## The chimera: four technologies, one pipeline

crosscheck is a Kiroween **Frankenstein** entry — four very different
technologies stitched into one tool, each doing the job it is best at.

| Stage | Technology | Job |
|-------|------------|-----|
| 1. Core CLI | **Rust** | Parse the findings file fast, validate it, print a summary table |
| 2. Checker | **Python** | Check each item against public data sources + a local YAML rules file, assign a label |
| 3. Agent surface | **MCP server (FastMCP)** | Let AI coding agents call crosscheck as a tool before they publish |
| 4. Output | **Markdown report** | One report per run: what was checked, what evidence was found, what still needs a human |

## Labels

Every item gets exactly one label:

- **verified** — backed by at least one source (a public data source or a
  local rule), with the evidence captured.
- **needs-evidence** — can't confirm it or rule it out yet; a human should look.
- **likely false positive** — a local rule, or a missing/absent reference,
  says this is probably noise.

The report keeps a hard line between **Backed by evidence** and **Needs a
human**. Nothing unproven slips into the trusted section.

## Quick start

> The full build lands right after the spec is approved. These are the
> intended commands the spec is written against.

```bash
# 1. Build the Rust core
cargo build --release --manifest-path cli/Cargo.toml

# 2. Run the pipeline on a findings file
./cli/target/release/crosscheck run sample-findings.json
#   -> prints a summary table
#   -> writes reports/report-<timestamp>.md

# Offline mode: local rules only, no network lookups
./cli/target/release/crosscheck run sample-findings.json --offline

# Re-check a report you already have
./cli/target/release/crosscheck verify reports/report-<timestamp>.md
```

Call it from an AI agent over MCP:

```bash
python mcp/server.py        # exposes crosscheck as an MCP tool
```

## Built with Kiro

This project was built inside Kiro, using its features end to end:

- **Spec-driven development** — the first feature lives in
  `.kiro/specs/report-pipeline/` as requirements, design, and tasks, written
  and approved before any code.
- **Steering docs** — `.kiro/steering/` holds the product, tech, and structure
  guidance Kiro follows on every turn.
- **Agent hook** — `.kiro/hooks/report-lint.kirohook` re-checks each generated
  report the moment it is saved, enforcing the house rule automatically.
- **MCP server** — crosscheck ships as an MCP tool so other agents can call it.

## Why this wins

- **Real value:** the agentic economy generates mountains of reports and
  checks none of them. crosscheck is the missing trust layer, with a clean
  service model (see [BUSINESS.md](BUSINESS.md)).
- **Genuine Frankenstein:** Rust + Python + an MCP protocol surface + public
  data sources + local YAML rules + Markdown, welded into one pipeline where
  each part does what it is best at.
- **One memorable line:** *"AI writes everything now — crosscheck is the stamp
  that says you can trust it, and every line comes with a receipt you can
  re-check."*
- **Deep Kiro use:** spec, steering, hook, and MCP all pull their weight.

Full demo plan: [docs/DEMO.md](docs/DEMO.md).

## Origins

crosscheck grew out of an earlier personal experiment of mine (secai), which
explored triaging findings and insisting on evidence before anything enters a
report. All code in this repository is new — written from scratch during the
Kiroween 2026 period with Kiro, with nothing copied or linked from that
experiment or anywhere else.

## License

MIT — see [LICENSE](LICENSE).
