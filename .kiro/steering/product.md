# Product: Sootsayer

## What it is
Sootsayer foretells where wildfire smoke (haze) will settle over the next five
days and what that means for each puskesmas: how many extra respiratory visits
to expect, with a range, and what to prepare. It shows everything on a real 3D
globe: NASA satellite imagery of the selected day, terrain, satellite fire
detections, and the modelled smoke field.

Indonesian tagline: "Peramal jelaga untuk puskesmas."

## Coverage
Kalimantan (5 provinces) and Sumatra's peatland provinces (Riau, Jambi,
Sumatera Selatan), where the 2026 haze hit. The study is from Central
Kalimantan; everywhere else its estimates are applied by analogy, and the app
says so. Other regions are data packs (see structure.md); other countries need
a local study before any number is shown.

## Who it is for
- Dinas Kesehatan (district and provincial health offices) deciding where to
  send staff, masks, and oxygen, and where to open posko and rumah oksigen.
- Puskesmas heads preparing for a surge.
- AI agents (for example inside Kiro or Kiro Crew) that query the outlook and
  forward the engine's briefing over MCP.

## House rules (never break these)
1. Real data only. The product never shows mock or made-up data. Every layer
   and every number names its source and the time it refers to.
2. Ranges, not single numbers. Every estimate shows its 95% interval next to
   the point value, plus the study it comes from.
3. Say the limits on screen. The method comes from one study of six puskesmas
   in Central Kalimantan (Phung et al. 2025). The effect was clear in Pulang
   Pisau and absent in Palangka Raya city. The app says so where the numbers
   appear.
4. Never present stale data as current. If a source fails or is old, the UI
   shows which source and how old, and the outlook is marked incomplete.
5. Decision support, not diagnosis. The app estimates load on clinics; it does
   not give medical advice to individuals.

## Wording
- Bahasa Indonesia first, English second. Plain words a puskesmas head would use.
- Calm and specific. No alarmist language, no fear marketing.
- The Kiroween night-and-smoke look belongs to the visuals, never to the health
  wording.

## Key terms (use these consistently)
- **Hari kabut (haze day):** a day when the district's daily mean PM10 is at
  least 100 µg/m³.
- **Kabut berapi (fire-haze day):** a haze day with at least one satellite fire
  detection inside the district.
- **Durasi (duration):** consecutive haze days up to that day, grouped 1–3,
  4–14, and 15 or more.
- **Profil kota / profil kabupaten:** which study area's estimates are applied
  (Palangka Raya city or Pulang Pisau regency).

## Positioning
Satellites already see the fire, and air apps already show the smoke. Nobody
tells the puskesmas who is coming. Sootsayer connects the fire pixel to the
clinic queue.
