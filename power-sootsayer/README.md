# Sootsayer power for Kiro

Lets Kiro (IDE, CLI, or Crew) answer "which puskesmas will fill up with
breathless patients this week?" from the same Rust engine as
[sootsayer.vercel.app](https://sootsayer.vercel.app), and prepare a
ready-to-send briefing for a health office.

## Install

1. Clone the repo: `git clone https://github.com/maulanawirawan/sootsayer`.
2. Install [uv](https://docs.astral.sh/uv/) and Rust (the server builds the
   engine CLI on first use with `cargo build --release`).
3. Set `SOOTSAYER_HOME` to the clone's absolute path. If your Kiro version
   does not expand variables in `args`, replace `${SOOTSAYER_HOME}` in
   `mcp.json` with that path.
4. In Kiro: Powers panel → Add Custom Power → Import power from a folder
   (this folder) or from GitHub with the repository URL.

## What it adds

- MCP tools: `list_regions`, `list_districts`, `priority`, `haze_outlook`,
  `clinic_plan`, `daily_brief`.
- Skills: `haze-briefing` (the steps and rules for a Dinkes briefing) and
  `add-a-region` (how to cover another region, and what another country
  needs).

Live data comes from Copernicus CAMS via Open-Meteo (free tier, non-commercial)
and NASA FIRMS. Every estimate carries its 95% range and the method's limits.
