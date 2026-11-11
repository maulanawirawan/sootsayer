# Sootsayer — who it is for and how it can sustain itself

## The problem, in money and lives

Haze seasons repeat. In 2026, health offices in Kalimantan and Sumatra had to
decide where to send staff, masks, oxygen, and nebulisers while the smoke was
already there. Every day of lead time lets a puskesmas extend hours, call in
staff, prepare a clean-air room, and ask the province for oxygen before the
queue forms.

## Users and buyers

| Who | What they get | Who pays |
|---|---|---|
| Dinas Kesehatan (district and province) | Five-day outlook per district and puskesmas, priority list for posko and rumah oksigen | Free open-source app; paid setup and support for an official instance |
| Puskesmas heads | Expected visits for their own puskesmas, clean-air room sizing | Free |
| Kemenkes crisis centre, BNPB, BPBD | Province-wide picture across Kalimantan and Sumatra, agent briefings via MCP | Government contract for hosting, SLA, and integration |
| NGOs and donors (humanitarian groups running health posts) | Where to place mobile clinics and oxygen | Grants or sponsorship of the public instance |
| Plantation and forestry companies with fire-prevention duties | Health impact around their concessions for CSR planning | Paid reports |

## Revenue options

1. **Open core.** The app, engine, and MCP server stay MIT-licensed and free.
2. **Managed instance.** Hosting with a commercial Open-Meteo plan (its free
   API is non-commercial), uptime guarantees, and data refresh.
3. **Integration.** Import real puskesmas visit counts (from the health
   office's own records) so baselines stop being study defaults, plus
   WhatsApp or SMS alerts to puskesmas heads.
4. **Validation and training.** Calibrate the relative risks with local 2026
   visit data together with a university partner, then train district teams.

## Costs to run

Static site plus two cached functions on Vercel. The main paid line at scale is
the commercial weather and air-quality API; NASA FIRMS and GIBS are free.

## What makes it stick

- The numbers come with ranges and sources, which is what an official needs to
  defend a decision.
- Local baselines and validation make the outlook better every season.
- MCP lets the outlook flow into the agents and reports offices already use.
