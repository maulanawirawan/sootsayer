# Product: crosscheck

## What it is
crosscheck double-checks automated reports before a human reads them. It takes
a findings list (JSON), checks every item against public data sources and a
local rules file, labels each item, and writes a clean Markdown report.

## Who it is for
- Individuals and teams drowning in noisy automated reports: data-quality
  alerts, lint warnings, uptime checks, and the like.
- AI agents that generate findings and need them checked before publishing —
  they call crosscheck over MCP.

## The house rule (never break this)
If an item cannot be backed by evidence, it does not go in the trusted part of
the report. Evidence first, always.

## Labels (exactly one per item)
- **verified** — backed by at least one source, with evidence captured.
- **needs-evidence** — cannot confirm or rule it out; a human should look.
- **likely false positive** — a rule, or a missing reference, says it is
  probably noise.

## Receipts
Every line in a report carries a receipt: what was checked, which source backed
it, the label, and a short fingerprint so the line can be re-checked later.

## Wording rule (important)
Keep all wording light, plain, and friendly. This is a quality-control tool for
general reports. No security jargon anywhere in code, comments, or docs (avoid
"vulnerability", "exploit", "attack", "threat", and similar). Describe external
sources plainly as "public data sources".

## Positioning
crosscheck is the trust layer for the agentic economy: AI writes everything,
crosscheck is the stamp that says a human can trust it.
