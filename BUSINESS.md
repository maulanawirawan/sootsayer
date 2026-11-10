# crosscheck — business model

## The one-liner

AI agents generate everything and verify almost nothing. crosscheck is the
quality layer that checks their output and stamps what is trustworthy —
offered as a service other agents and teams can call.

## Who pays, and for what

| Buyer | Pain | What they pay for |
|-------|------|-------------------|
| Agent builders / AI platforms | Their agents emit reports nobody can trust | A hosted MCP endpoint that verifies findings and returns receipts, billed per verified report |
| Data & platform teams | Drowning in noisy automated alerts | Shared rules, a team dashboard, and an audit trail of receipts |
| Individual developers / OSS | Want a quick sanity check locally | The free, open-source CLI |

## Tiers

**Free — Local** (open source, MIT)
- The Rust CLI + Python checker + Markdown reports
- Local YAML rules and offline checks, unlimited
- For individuals, OSS maintainers, and anyone trying it out

**Pro — Verified**
- Everything in Free, plus live public-source lookups and evidence receipts
- The `verify` command to re-check any past report
- Hosted MCP endpoint, higher volume
- Billed per seat, or per batch of checks

**Team / Platform**
- Everything in Pro, plus shared rule sets, a team dashboard, and a searchable
  history of receipts
- SSO, priority sources, and a support SLA
- Billed per organization

**Usage-based MCP (for agent platforms)**
- Embed crosscheck inside your own agent product
- Pay per verified report, with volume pricing
- The "trust stamp" as an API your agents call before they publish

## Why now

The cost of generating a report fell to almost zero; the cost of trusting one
did not. Every new agent makes the pile bigger. crosscheck turns "here are 300
maybes" into "here are 12 you can act on, each with a receipt" — and that gap
is where the value, and the willingness to pay, lives.

## What makes it stick

- **Rules and receipts compound:** every run adds to a team's shared rules and
  receipt history, which makes the next run better and the tool harder to leave.
- **Protocol-native:** shipping as an MCP tool means crosscheck sits inside
  other agents' workflows by default, not as a separate dashboard nobody opens.
