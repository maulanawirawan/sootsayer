# Requirements — report-pipeline

## Introduction

report-pipeline is crosscheck's first feature: take a findings list as JSON,
double-check every item against public data sources and a local rules file,
label each item, and produce a Markdown report that keeps anything unproven out
of the trusted section. Every reported line carries a re-checkable receipt. The
same checker is exposed over MCP so AI agents can call it before they publish.

House rule for the whole feature: **if an item cannot be backed by evidence, it
does not go in the trusted part of the report.**

## Requirement 1 — A reviewer gets labeled, evidence-backed findings

**User story:** As a report reviewer, I want each incoming finding checked and
labeled, so that I only spend time on the items that are backed by evidence.

**Acceptance criteria**

1.1. WHEN crosscheck reads a valid findings file, THE SYSTEM SHALL assign every
item exactly one label: verified, needs-evidence, or likely false positive.

1.2. WHEN an item is backed by at least one source (a local rule marked
`confirm`, or a matching entry in a public data source), THE SYSTEM SHALL label
it verified and record the backing source as evidence.

1.3. WHEN a local rule marks an item's pattern as `noise` and no confirming
evidence exists, THE SYSTEM SHALL label it likely false positive and record the
rule as the reason.

1.4. WHEN an item can be neither confirmed nor ruled out, THE SYSTEM SHALL label
it needs-evidence.

1.5. IF the findings file is missing or is not valid JSON, THEN THE SYSTEM SHALL
stop with a clear message and a non-zero exit code, and SHALL NOT write a report.

## Requirement 2 — One command produces a trustworthy report

**User story:** As a pipeline operator, I want a single command that turns a
findings file into a clean Markdown report, so that the output is trustworthy
and reproducible.

**Acceptance criteria**

2.1. WHEN the operator runs `crosscheck run <file>`, THE SYSTEM SHALL print a
summary table (counts per label) and write one Markdown report to
`reports/report-<timestamp>.md`.

2.2. THE report SHALL contain a "Backed by evidence" section listing only
verified items, a "Needs a human" section for needs-evidence items, and a "Set
aside" section for likely false positive items.

2.3. THE report SHALL attach to every listed item a receipt containing the item
id, its label, the backing sources, a short fingerprint, and the time it was
checked.

2.4. WHEN the network is unavailable or `--offline` is passed, THE SYSTEM SHALL
skip public-source lookups, rely on local rules only, and SHALL NOT label any
item verified solely because a lookup could not run.

2.5. WHEN the same findings file and rules are run again, THE SYSTEM SHALL
produce the same labels and the same fingerprints.

## Requirement 3 — An agent can verify before it publishes

**User story:** As an AI coding agent, I want to call crosscheck over MCP before
I publish my findings, so that anything I cannot back with evidence is dropped
and what remains carries a receipt the next reader can re-check.

**Acceptance criteria**

3.1. WHEN an agent calls the crosscheck MCP tool with a list of findings, THE
SYSTEM SHALL return each item with its label, evidence, and receipt.

3.2. THE MCP tool SHALL clearly separate items that are backed by evidence from
those that are not, so the agent can drop or hold the unproven ones.

3.3. WHEN `crosscheck verify <report>` is run, THE SYSTEM SHALL recompute each
line's fingerprint and report any receipt that no longer matches.

## Out of scope (for this spec)

- Hosted or paid tiers and dashboards (see `BUSINESS.md`).
- Sources beyond OSV.dev and the NVD public API.
- Any output format other than Markdown.
