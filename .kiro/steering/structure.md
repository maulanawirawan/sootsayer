# Structure

```
crosscheck/
├─ cli/                      # Rust CLI core (crate: crosscheck)
│  ├─ Cargo.toml
│  └─ src/main.rs
├─ checker/                  # Python checker + Markdown report generator
│  └─ crosscheck_checker/    # package code
├─ mcp/                      # FastMCP server exposing crosscheck as a tool
│  └─ server.py
├─ reports/                  # generated Markdown reports (one per run)
├─ rules.yaml                # local rules the checker applies
├─ sample-findings.json      # 5 generic sample items for the demo
├─ docs/
│  └─ DEMO.md                # 3-minute demo script
├─ .kiro/
│  ├─ steering/              # product.md, tech.md, structure.md
│  ├─ specs/report-pipeline/ # requirements.md, design.md, tasks.md
│  └─ hooks/                 # report-lint.json
├─ README.md
├─ BUSINESS.md
├─ LICENSE
└─ .gitignore
```

## Where things go
- New checks or rules: `rules.yaml` plus the checker package in `checker/`.
- CLI behavior (arguments, summary table, pipeline wiring): `cli/src/`.
- Agent-facing tools: `mcp/server.py`.
- Reports are written to `reports/` and never hand-edited; regenerate instead.

## Data flow
```
findings JSON
  -> Rust CLI        (validate + summary table + normalized JSON)
  -> Python checker  (local rules + public-source lookups + labels + receipts)
  -> Markdown report (reports/report-<timestamp>.md)
```

## Tracked on purpose
`.kiro/` is committed (specs, steering, hooks). Never add it to `.gitignore`.
