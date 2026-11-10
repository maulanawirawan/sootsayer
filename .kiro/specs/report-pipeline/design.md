# Design — report-pipeline

## Overview

report-pipeline stitches four technologies into one flow:

```
sample-findings.json
  |
  v  (1) Rust CLI  - cli/
      parse + validate + summary table + normalized JSON
  |
  v  (2) Python checker - checker/
      local rules (rules.yaml) + public-source lookups + labels + receipts
  |
  +--> (4) Markdown report - reports/report-<timestamp>.md
  |
  +--> (3) MCP server - mcp/server.py (same checker, exposed as an agent tool)
```

Each part does what it is best at: Rust for fast, strict parsing and a crisp
summary; Python for flexible checking and I/O; MCP for agent reach; Markdown for
a report a human actually reads.

## Components

### 1. Rust CLI (`cli/`, crate `crosscheck`)
- Subcommands: `run <file> [--offline]` and `verify <report>`.
- `run`: read the findings file, validate against the schema, print a summary
  table to stdout, write a normalized file to `out/normalized.json`, then invoke
  the Python checker, passing the normalized file and the `--offline` flag.
- `verify`: invoke the Python checker's verify path on the given report.
- Fails loud: invalid JSON or schema means a clear message, a non-zero exit, and
  no report.
- Dependencies: serde / serde_json, plus a light argument parser.

### 2. Python checker (`checker/crosscheck_checker/`)
- `load.py` — read normalized findings and `rules.yaml`.
- `rules.py` — match rules against items (fields + title substring) into
  confirm / noise / note.
- `sources.py` — best-effort lookups on public data sources (OSV.dev, NVD) for
  items carrying a reference id or package+version; short timeout; offline-safe.
- `label.py` — combine rule and source evidence into one label.
- `receipt.py` — build the deterministic fingerprint and receipt (shared with
  verify).
- `report.py` — render the Markdown report.
- `verify.py` — parse receipts from a report and recompute fingerprints.
- `cli.py` — the entry point the Rust core calls, with `check` and `verify` modes.

### 3. MCP server (`mcp/server.py`, FastMCP)
- One tool, `check_findings(findings) -> result`, that runs the checker
  in-process and returns items split into `backed_by_evidence` and
  `needs_review`, each with label, evidence, and receipt.

### 4. Markdown report (`reports/`)
- Header: run time, input name, mode (online/offline), summary counts.
- Sections: "Backed by evidence" (verified only), "Needs a human"
  (needs-evidence), "Set aside" (likely false positive).
- Each item line is followed by its evidence and a receipt line.

## Data models

### Input finding
```json
{
  "id": "F-001",
  "source": "data-quality",
  "title": "short human title",
  "detail": "longer description",
  "severity": "info | low | medium | high",
  "reference_id": "optional id in a public data source, or null",
  "package": "optional component name, or null",
  "version": "optional component version, or null"
}
```
Required: `id`, `source`, `title`. The rest are optional.

### Checked item (checker output)
Input finding plus:
```json
{
  "label": "verified | needs-evidence | likely false positive",
  "evidence": [ { "source": "rule:R-03", "note": "..." } ],
  "receipt": {
    "finding_id": "F-001",
    "label": "verified",
    "sources": ["rule:R-03", "osv.dev"],
    "fingerprint": "ab12cd34ef56",
    "checked_at": "2026-11-11T09:00:00Z"
  }
}
```

### Receipt fingerprint
`sha256( id | title | detail | label | sorted(sources) )`, first 12 hex chars.
Deterministic: the same input and rules give the same fingerprint. Used by the
report and by `verify` to detect a changed line.

### rules.yaml
```yaml
rules:
  - id: R-03
    when: { source: "data-quality", title_contains: "null rate" }
    outcome: confirm
    note: "known data-quality signal we trust"
  - id: R-07
    when: { source: "lint", title_contains: "line too long" }
    outcome: noise
    note: "style-only; not worth a human"
```

## Labeling algorithm
1. Collect rule outcomes for the item (confirm / noise / note).
2. If online and the item has a reference id or package+version, query the
   public data source(s); a matching entry is confirming evidence.
3. Decide:
   - a noise rule matched AND no confirming evidence -> **likely false positive**
   - at least one confirming evidence (confirm rule or source match) -> **verified**
   - otherwise -> **needs-evidence**
4. Offline or lookup failed: only rules contribute; an item that would have
   relied on a lookup stays **needs-evidence** (never verified by default).

## Offline and error handling
- Network off, `--offline`, or timeout: skip lookups, add an evidence note
  "lookup skipped"; labels fall back to rules only.
- Missing or invalid findings file: the Rust core stops before any Python runs.
- Missing checker or a Python error: the Rust core reports it and exits non-zero.

## How Kiro features are used
- **Spec:** this `report-pipeline` spec (requirements -> design -> tasks).
- **Steering:** `.kiro/steering/` keeps product, tech, and structure consistent,
  including the plain-wording rule.
- **Hook:** `report-lint.kirohook` re-checks each report on save (house rule).
- **MCP:** the checker is exposed as an agent tool.

## Testing strategy
- A fixed `sample-findings.json` (5 items) drives an end-to-end run with a known
  split of labels when offline.
- Receipt determinism: run twice offline; fingerprints match.
- Tamper test: change a verified line, then `verify` flags the mismatch.
- Invalid-input test: a broken JSON file exits non-zero and writes no report.
