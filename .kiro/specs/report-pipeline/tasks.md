# Tasks — report-pipeline

- [ ] 1. Rust CLI skeleton and strict input handling
  - Create the `crosscheck` crate in `cli/` with `run` and `verify` subcommands
    and an `--offline` flag.
  - Read and validate the findings file against the schema; on bad input, print
    a clear message and exit non-zero without writing anything.
  - Print a summary table and write `out/normalized.json`.
  - _Requirements: 1.5, 2.1, 2.4_

- [ ] 2. Sample findings and local rules
  - Add `sample-findings.json` with 5 generic items (data-quality, two lint,
    uptime, and one carrying a reference id / package for a live lookup).
  - Add `rules.yaml` with a few plain confirm / noise / note rules.
  - _Requirements: 1.2, 1.3_

- [ ] 3. Python checker core (rules + labels, offline-safe)
  - Load normalized findings and `rules.yaml`; match rules to items.
  - Assign a label using the labeling algorithm, with no network required.
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ] 4. Public-source lookups
  - Query OSV.dev and the NVD public API for items with a reference id or
    package+version; best-effort, short timeout, honoring `--offline`.
  - Attach matches as evidence; never mark verified just because a lookup failed.
  - _Requirements: 1.2, 2.4_

- [ ] 5. Evidence receipts
  - Build the deterministic fingerprint and receipt record for each item in a
    shared module used by both the report and verify.
  - _Requirements: 2.3, 2.5_

- [ ] 6. Markdown report generator
  - Render the three sections with the house rule enforced (only verified items
    in "Backed by evidence"), a summary line, and a receipt under each item.
  - _Requirements: 2.1, 2.2, 2.3_

- [ ] 7. End-to-end wiring and verify
  - Make Rust `run` invoke the checker and write the report; make `verify`
    recompute fingerprints from a report and flag any mismatch.
  - Confirm the `report-lint` hook validates a freshly written report.
  - _Requirements: 2.1, 2.5, 3.3_

- [ ] 8. MCP server (FastMCP)
  - Expose a `check_findings` tool that runs the checker and returns items split
    into backed-by-evidence and needs-review, each with label, evidence, receipt.
  - _Requirements: 3.1, 3.2_
