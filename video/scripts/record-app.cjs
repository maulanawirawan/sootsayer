// Records the real Sootsayer app frame by frame for the demo video.
//
// Playwright's fake clock drives Date, timers, requestAnimationFrame and
// performance.now, so each output frame is exactly 1/30 s of app time: camera
// flights come out smooth whatever the machine speed. Network and tile
// decoding still run in real time; before each frame the recorder waits until
// the map's tiles are loaded (as on a fast connection).
//
// Needs the dev server (npm run dev --prefix web) for window.sootsayer.
//   node scripts/record-app.cjs [clip ...]       (default: all clips)
// Output: public/clips/<clip>.mp4 and <clip>.json (duration, marks, clicks).
const { chromium } = require('playwright-core');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const BASE = process.env.SOOTSAYER_URL || 'http://localhost:5173';
const FPS = 30;
const VIEW = { width: 1600, height: 900 };
const DPR = 1.2; // 1920x1080 pixels, UI 20% larger than a 1080p desktop
const OUT = path.resolve(__dirname, '..', 'public', 'clips');
const TMP = path.join(process.env.TEMP || '.', 'sootsayer-frames');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const JABIREN = 'osm:way/422325112';

/** Each clip: url, optional prepare() run on the clock without capture, then timed steps. */
const CLIPS = {
  'globe-flyin': {
    url: '/?region=kalimantan&mode=replay&date=2026-10-01&lang=en',
    seconds: 14.5,
    steps: [{ at: 6.0, click: '#enter' }],
    marks: [{ at: 1.0, name: 'intro', selector: '.intro-card' }, { at: 1.0, name: 'enter', selector: '#enter' }],
  },
  'replay-play': {
    url: '/?region=kalimantan&mode=replay&date=2026-10-01&intro=0&lang=en',
    prepare: 7600,
    seconds: 19.8,
    steps: [{ at: 0.4, click: '#play' }, { at: 19.2, click: '#play' }],
    marks: [{ at: 1.0, name: 'play', selector: '#play' }, { at: 1.0, name: 'legend', selector: '.legend-keys .statuses' }, { at: 19.6, name: 'priority', selector: '#priority ol.priority' }],
  },
  district: {
    url: '/?region=kalimantan&mode=replay&date=2026-10-14&intro=0&lang=en',
    prepare: 7600,
    seconds: 12,
    steps: [
      { at: 0.8, click: 'button.row[data-code="KT-pulang-pisau"]' },
      { at: 7.9, click: '#right details.limits summary' },
      { at: 8.1, eval: () => document.querySelector('#right details.limits')?.scrollIntoView({ block: 'end' }) },
    ],
    marks: [
      { at: 0.5, name: 'row', selector: 'button.row[data-code="KT-pulang-pisau"]' },
      { at: 4.0, name: 'kpiWindow', selector: '#right .kpi', contains: '5 days' },
      { at: 9.0, name: 'limits', selector: '#right details.limits ul' },
    ],
  },
  puskesmas: {
    url: '/?region=kalimantan&mode=replay&date=2026-10-14&intro=0&lang=en',
    prepare: 7600,
    seconds: 14,
    steps: [
      { at: 0.8, clickLngLat: JABIREN },
      { at: 8.1, eval: () => document.querySelector('#ca-crbox')?.scrollIntoView({ block: 'center' }) },
      { at: 8.6, click: '#ca-crbox' },
      { at: 11.0, eval: () => document.querySelector('#ca-indoor')?.scrollIntoView({ block: 'end' }) },
    ],
    marks: [
      { at: 4.2, name: 'kpi', selector: '#right .kpi', contains: 'Expected respiratory visits per day' },
      { at: 9.4, name: 'cleanAir', selector: '#ca-out' },
      { at: 11.8, name: 'indoor', selector: '#ca-indoor table' },
    ],
  },
  briefing: {
    url: '/?region=kalimantan&mode=replay&date=2026-10-14&intro=0&lang=id',
    prepare: 7600,
    seconds: 10,
    steps: [{ at: 0.6, click: '#brief-open' }, { at: 5.0, click: '#lang' }],
    marks: [{ at: 0.3, name: 'button', selector: '#brief-open' }, { at: 3.0, name: 'share', selector: '#right .buttons' }, { at: 7.0, name: 'textEn', selector: 'pre.brief' }],
  },
  sumatra: {
    url: '/?region=kalimantan&mode=replay&date=2026-10-07&intro=0&lang=en',
    prepare: 7600,
    seconds: 7.5,
    steps: [{ at: 0.6, clickText: ['#regions button', 'Sumatra'] }],
    marks: [{ at: 0.3, name: 'region', selector: '#regions' }],
  },
  'forecast-view': {
    url: '/?region=kalimantan&mode=replay&date=2026-10-14&intro=0&lang=en',
    prepare: 7600,
    seconds: 12,
    steps: [{ at: 1.2, clickText: ['#views button', 'What was forecast'] }],
    marks: [{ at: 0.8, name: 'views', selector: '#views' }, { at: 6.0, name: 'check', selector: '#check' }],
  },
  // The night image of 14 Oct exists on NASA GIBS; today's may not be processed yet.
  'night-replay': {
    url: '/?region=kalimantan&mode=replay&date=2026-10-14&night=1&intro=0&lang=en',
    prepare: 7600,
    seconds: 7,
    steps: [{ at: 0.1, eval: () => window.sootsayer.map.map.easeTo({ bearing: window.sootsayer.map.map.getBearing() + 16, pitch: 52, duration: 7000, easing: (t) => t }) }],
    marks: [],
  },
  'live-today': {
    url: '/?region=kalimantan&mode=live&intro=0&lang=en',
    prepare: 7600,
    seconds: 5.5,
    steps: [{ at: 0.1, eval: () => window.sootsayer.map.map.easeTo({ bearing: window.sootsayer.map.map.getBearing() - 8, duration: 5500, easing: (t) => t }) }],
    marks: [{ at: 1.0, name: 'priority', selector: '#priority' }, { at: 1.0, name: 'today', selector: '.chip.today' }],
  },
};

/** src/clips.generated.json: metadata of every recorded clip, read by the composition. */
function writeIndex() {
  const index = {};
  if (fs.existsSync(OUT)) {
    for (const f of fs.readdirSync(OUT).filter((x) => x.endsWith('.json'))) {
      const m = JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));
      if (fs.existsSync(path.join(OUT, `${m.name}.mp4`))) index[m.name] = m;
    }
  }
  fs.writeFileSync(path.resolve(__dirname, '..', 'src', 'clips.generated.json'), JSON.stringify(index, null, 1));
}

/** Box of the first element matching `selector` (and whose text contains `contains`, if given). */
async function boxOf(page, selector, contains) {
  return page.evaluate(
    ([sel, text]) => {
      const el = [...document.querySelectorAll(sel)].find((e) => !text || e.textContent.includes(text));
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.left, y: b.top, w: b.width, h: b.height, text: el.innerText.slice(0, 400) };
    },
    [selector, contains ?? null],
  );
}

async function settle(page, maxMs = 1500) {
  // Wait (in real time) until the map has its tiles; app time stays put, but
  // callbacks already due (zero-delay timers used by tile processing) still run.
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const ok = await page.evaluate(() => {
      const m = window.sootsayer?.map?.map;
      return !m || m.areTilesLoaded();
    });
    if (ok) return;
    await page.clock.runFor(0);
    await new Promise((r) => setTimeout(r, 30));
  }
}

async function record(browser, name, spec) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: DPR });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  // install() alone lets fake time keep flowing; pauseAt() freezes it, so
  // only runFor() moves the app (and its camera) forward.
  const T0 = Date.now();
  await page.clock.install({ time: T0 });
  await page.clock.pauseAt(T0 + 1000);
  await page.goto(BASE + spec.url, { waitUntil: 'load', timeout: 120000 });
  // Boot: let app time run while the data and the map load in real time.
  for (let i = 0; i < 600; i++) {
    const ready = await page.evaluate(() => Boolean(window.sootsayer?.map?.map?.loaded?.()) || Boolean(document.querySelector('.intro-card')));
    if (ready && i > 20) break;
    await page.clock.runFor(50);
    await new Promise((r) => setTimeout(r, 25));
  }
  // Wait (real time) until the app has its data: live data comes over the network.
  for (let i = 0; i < 900; i++) {
    const ready = await page.evaluate(() => Boolean(window.sootsayer?.outlook) && document.querySelector('#loading')?.classList.contains('hidden') !== false);
    if (ready) break;
    await page.clock.runFor(50);
    await new Promise((r) => setTimeout(r, 50));
  }
  // Prepare: run the opening fly-in without capturing it.
  for (let t = 0; t < (spec.prepare || 0); t += 100) {
    await page.clock.runFor(100);
    await settle(page, 300);
  }
  const dir = path.join(TMP, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const n = Math.round(spec.seconds * FPS);
  const done = new Set();
  const marks = [];
  const clicks = [];
  for (let i = 0; i < n; i++) {
    const t = i / FPS;
    for (const [k, step] of spec.steps.entries()) {
      if (done.has(k) || step.at > t) continue;
      done.add(k);
      if (step.click) {
        const b = await boxOf(page, step.click);
        if (b) clicks.push({ t, x: b.x + b.w / 2, y: b.y + b.h / 2 });
        await page.click(step.click, { timeout: 5000 });
      } else if (step.clickText) {
        const [sel, text] = step.clickText;
        const loc = page.locator(sel, { hasText: text }).first();
        const b = await loc.boundingBox();
        if (b) clicks.push({ t, x: b.x + b.width / 2, y: b.y + b.height / 2 });
        await loc.click({ timeout: 5000 });
      } else if (step.clickLngLat) {
        const p = await page.evaluate((id) => {
          const q = window.sootsayer.ref.puskesmas.find((x) => x.id === id);
          const pt = window.sootsayer.map.map.project([q.lon, q.lat]);
          return { x: pt.x, y: pt.y };
        }, step.clickLngLat);
        clicks.push({ t, x: p.x, y: p.y });
        await page.mouse.click(p.x, p.y);
      } else if (step.eval) {
        await page.evaluate(step.eval);
      }
    }
    for (const m of spec.marks) {
      if (Math.abs(m.at - t) < 0.5 / FPS) marks.push({ name: m.name, t, box: await boxOf(page, m.selector, m.contains) });
    }
    await page.clock.runFor(1000 / FPS);
    await settle(page);
    await page.screenshot({ path: path.join(dir, `f${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92 });
    if (i % 60 === 0) process.stdout.write(`\r[${name}] ${i}/${n}`);
  }
  await ctx.close();
  fs.mkdirSync(OUT, { recursive: true });
  execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', path.join(dir, 'f%05d.jpg'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(OUT, `${name}.mp4`)]);
  const meta = { name, url: spec.url, fps: FPS, frames: n, seconds: spec.seconds, viewport: VIEW, dpr: DPR, marks, clicks, errors };
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(meta, null, 1));
  writeIndex();
  console.log(`\r[${name}] ${n} frames -> public/clips/${name}.mp4; marks ${marks.filter((m) => m.box).length}/${marks.length}; errors ${errors.length}`);
}

(async () => {
  if (process.argv[2] === '--index') return writeIndex();
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CLIPS);
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--hide-scrollbars'],
  });
  for (const name of names) {
    if (!CLIPS[name]) throw new Error(`unknown clip ${name}`);
    await record(browser, name, CLIPS[name]);
  }
  await browser.close();
})().catch((e) => {
  console.error('\nrecord-app failed:', e.message);
  process.exit(1);
});
