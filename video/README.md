# The Sootsayer demo video, as code

Every frame of the demo video comes from this folder. There is no stock
footage, no AI-generated video, no image or 3D asset, and no recorded music.

| Part | How it is made |
|---|---|
| Cold open (0:00–0:30) | A **three.js** scene (`src/scenes/ColdOpen.tsx`, shaders in `src/three/glsl.ts`) rendered by **Remotion**: the coastlines (Natural Earth) and the 96 district borders of Kalimantan and Sumatra (geoBoundaries) draw themselves on procedural paper; the **9,766 real NASA FIRMS detections of 14 Oct 2026** ignite as embers; the real Copernicus CAMS PM2.5 of that day becomes charcoal hatching; the 339 OpenStreetMap puskesmas appear as rings; then the page burns away from the fires and reveals the real app underneath. Paper, hatching, embers, sparks and the burn are noise and maths in GLSL. |
| Product shots | The **real app**, recorded frame by frame by `scripts/record-app.cjs`: Playwright's paused clock drives the app's time (camera flights, timers), so each frame is exactly 1/30 s and every camera move is smooth whatever the machine. A ripple marks each click (headless recording has no cursor). |
| Captions and rings | `src/timeline.json`: one subtitle and one source line per shot, in the margin under the footage, never over the UI. A hand-drawn charcoal ring points at the element being explained, positioned from element boxes measured during the recording. |
| "Built with Kiro" shots | Typeset from `src/kiro.generated.json`, which `scripts/prepare-kiro.mjs` collects from the repo and from commands it runs: the spec and its counts, the steering house rules, the hooks, the real `cargo test` and parity output, and a real `daily_brief` result of the MCP server's tool function. |
| Score | "Ember", synthesised by `scripts/score.py` with numpy (drone, pad, bell, heartbeat, crackle, riser); its cue points come from the same timeline, so accents land on cuts. No samples, so no copyright claims. |
| Fonts | Inter, Caveat, JetBrains Mono, Cormorant Garamond (SIL Open Font License, loaded with `@remotion/google-fonts`). |

## Build it

```powershell
npm install --prefix video
npm run dev --prefix web                          # the app, in another terminal
node video/scripts/prepare-data.mjs <ne_50m_land.geojson>   # Natural Earth 1:50m land
node video/scripts/prepare-kiro.mjs               # runs the tests and the parity check
node video/scripts/record-app.cjs                 # about 20 minutes, writes public/clips/
uv run --no-project --python 3.12 --with numpy python video/scripts/score.py
npx --prefix video remotion render video/src/index.ts Demo video/out/sootsayer-demo.mp4 --gl=angle
```

Generated files (`public/clips/`, `public/data/`, `public/audio/`, `out/`) are not
committed; the scripts above rebuild them. Remotion is free for individuals
and small teams under its own license (remotion.dev/license); three.js is MIT.
