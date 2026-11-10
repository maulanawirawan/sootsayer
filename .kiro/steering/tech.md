# Tech

## Stack (the four stitched technologies)
1. **Rust CLI core** (`cli/`) — parses findings JSON, validates it, prints a
   summary table, writes a normalized file, and runs the pipeline. Built with
   cargo.
2. **Python checker** (`checker/`) — reads the normalized findings, applies
   local YAML rules and public-source lookups, assigns labels, writes the
   report. Python 3.12.
3. **MCP server** (`mcp/`) — a FastMCP server exposing crosscheck as a tool for
   agents.
4. **Markdown report** — the output, one file per run in `reports/`.

## Toolchain (verified present on this machine)
- Rust 1.98 / cargo
- Python 3.12 (via `py`), uv 0.11 for environments and running the MCP server
- git 2.47

## Dependencies (keep minimal)
- Python: PyYAML for the rules file; the standard library (`urllib`, `json`,
  `hashlib`) for lookups and fingerprints. Add `fastmcp` for the MCP server only.
- Rust: a small, well-known set (serde / serde_json for JSON, a light argument
  parser). Prefer the standard library where practical.

## Public data sources
Look items up on OSV.dev and the NVD public API when an item carries a
reference id. In code and docs, describe them only as "public data sources".
Lookups are best-effort with a short timeout.

## Offline behavior
If the network is unavailable, or `--offline` is passed, skip lookups and fall
back to local rules. An item that cannot be confirmed becomes needs-evidence —
never verified by default.

## Common commands
```bash
# Build the Rust core
cargo build --release --manifest-path cli/Cargo.toml

# Run the pipeline
./cli/target/release/crosscheck run sample-findings.json [--offline]

# Re-check a report
./cli/target/release/crosscheck verify reports/<file>.md

# Run the MCP server
uv run --with fastmcp python mcp/server.py
```

## Rules of thumb
- Fail loud on malformed input: if the findings file is invalid, stop with a
  clear message rather than guessing.
- Deterministic output: the same input and rules produce the same receipts and
  fingerprints every time.
