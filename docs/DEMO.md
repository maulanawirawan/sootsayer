# crosscheck — 3-minute demo script

Target: under 3 minutes, public YouTube. Written to also compete for the
**Best Demo** bonus.

**Setup before recording:** a terminal in the repo root, `sample-findings.json`
open in one pane, and an MCP-capable agent connected to `mcp/server.py` in
another.

| Time | On screen | What you say |
|------|-----------|--------------|
| 0:00–0:20 | Title card, then the messy findings file | "Every automated tool dumps a report like this — data-quality alerts, lint warnings, uptime checks. Most of it is noise or wrong, and nobody has time to check it. **crosscheck is the trust stamp for the agentic economy.**" |
| 0:20–0:50 | Scroll `sample-findings.json` (5 items) | "Five findings. Some real, some noise, one even points at a public reference. A human would burn an hour sorting these." |
| 0:50–1:30 | Run `crosscheck run sample-findings.json` | "The Rust core parses it instantly and prints a summary table. Then the Python checker goes item by item — checking each against public data sources and our local rules — and labels them: verified, needs-evidence, or likely false positive." |
| 1:30–2:05 | Open `reports/report-*.md` | "Here is the report. Two sections only: **Backed by evidence** and **Needs a human**. The noise is gone. And every single line carries a receipt: what was checked, which source backed it, and a fingerprint." |
| 2:05–2:40 | An AI agent calls crosscheck over MCP | "Now the real trick. An AI agent calls crosscheck over MCP before it publishes. It submits its findings, crosscheck drops the one it can't back up, and hands back receipts. Agents can verify each other now, automatically. A Kiro agent hook even re-checks the report the moment it is saved." |
| 2:40–3:00 | Tamper one line, run `crosscheck verify` | **The money shot.** "Watch. I change one word in a verified line and re-check the report." *(run `crosscheck verify` — the receipt mismatch flags)* "Caught. Every line comes with a receipt you can re-check yourself. **AI writes everything now — crosscheck is how you trust it.**" |

## The single most memorable moment

The live `verify` catching a tampered line at 2:40. It proves the receipts are
real, not decoration — the whole promise, "evidence, or it's not in the
report," made tangible in five seconds.

## Notes for the write-up and bonus prizes

- **Built-with-Kiro write-up:** walk through the `.kiro/specs/report-pipeline/`
  spec, the steering docs, the `report-lint` hook firing on save, and the MCP
  server. Judges score "implementation of Kiro" directly, so show each one.
- **Bonus Blog:** the same story — "the missing quality layer for the agentic
  economy" — makes a strong post; link the demo video and the repo.
- **Social Blitz:** lead every clip with the one-liner and the tampered-line
  reveal.
