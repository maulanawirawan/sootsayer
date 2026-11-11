// Sootsayer web app: wires data, the WebAssembly engine, the globe, and the UI.

import './style.css';

import { download, parsePuskesmasCsv, toCsv } from './csv';
import {
  addDays,
  asForecast,
  buildOutlookInput,
  districtMean,
  loadLive,
  loadOverrides,
  loadReference,
  loadRegions,
  loadForecastReplay,
  loadReplay,
  loadReplayFires,
  multipolygon,
  saveImported,
  saveOverrides,
  todayWib,
  type Dataset,
  type Reference,
} from './data';
import { engine, loadEngine } from './engine';
import { fmtDate, hasKey, lang, setLang, t } from './i18n';
import { createMap, hexagon, LAYER_GROUPS, type Bounds, type LayerGroup, type SootMap } from './map';
import { renderSmoke, smokeCoordinates } from './smoke';
import { runTour, type TourApi } from './tour';
import type {
  CleanAirOutput,
  DayStatus,
  ForecastReplayFile,
  OutlookOutput,
  Profile,
  Puskesmas,
  RegionInfo,
  RegionsIndex,
} from './types';
import * as ui from './ui';

type Selection = { kind: 'district'; code: string } | { kind: 'puskesmas'; id: string } | { kind: 'brief' } | { kind: 'help' } | null;
type Mode = 'live' | 'replay';

const REPLAY_DEFAULT_DAY = '2026-10-15';
const PLAY_MS = 1400;

interface State {
  regions: RegionsIndex;
  ref: Reference;
  map: SootMap;
  ds: Dataset;
  fireCounts: Record<string, number[]>;
  overrides: ReturnType<typeof loadOverrides>;
  selected: string;
  selection: Selection;
  outlook: OutlookOutput;
  /** Classification of every day in the dataset, for the timeline dots. */
  summary: Map<string, DayStatus>;
  playing: boolean;
  timer: number;
  layers: ui.LayerToggles;
  csv: { ok: string | null; problems: string[] };
  notice: string | null;
  /** Replay view: what happened (hindsight) or what was forecast that morning. */
  view: View;
  forecast: ForecastReplayFile | null;
  /** The replay as forecast for the selected morning; null in every other view. */
  fds: Dataset | null;
}

type View = 'hindsight' | 'forecast';

let S: State;

/** The dataset the outlook, the smoke layer, and the briefing use right now. */
function viewDs(): Dataset {
  return S.fds ?? S.ds;
}

function forecastFile(): string | null {
  return S.ref.region.replay?.forecast?.file ?? null;
}

function regionLabel(r: RegionInfo): string {
  const key = `region_${r.id}`;
  return hasKey(key) ? t(key) : r.name;
}

function regionBounds(r: RegionInfo): Bounds {
  const [w, s, e, n] = r.bbox;
  return [
    [w, s],
    [e, n],
  ];
}

/** NASA GIBS has complete daily images up to yesterday (UTC+7). */
function imageryFor(date: string): { date: string; latest: boolean } {
  const latest = addDays(todayWib(), -1);
  return date <= latest ? { date, latest: false } : { date: latest, latest: true };
}

function shapes(ref: Reference) {
  return ref.districts.features.map((f) => ({ code: f.properties.code, multipolygon: multipolygon(f) }));
}

function computeFireCounts(ref: Reference, ds: Dataset): Record<string, number[]> {
  if (ds.fireCounts) return ds.fireCounts; // replay: counted by the same engine at build time
  if (!ds.fires.length) return {};
  try {
    return engine.fireCounts({
      days: ds.days,
      districts: shapes(ref),
      fires: ds.fires.map((r) => [r[0], r[1], r[2]] as [number, number, string]),
    }).counts;
  } catch (e) {
    ds.errors.push({ source: 'engine (fire counts)', error: e instanceof Error ? e.message : String(e) });
    return {};
  }
}

function summarize(ref: Reference, ds: Dataset, fireCounts: Record<string, number[]>): Map<string, DayStatus> {
  const full = engine.outlook(buildOutlookInput(ref, ds, fireCounts, S?.overrides ?? loadOverrides(), ds.days[0], ds.days[ds.days.length - 1]));
  const out = new Map<string, DayStatus>();
  full.days.forEach((date, i) => {
    const statuses = full.districts.map((d) => d.days[i].status);
    out.set(
      date,
      statuses.includes('fire_haze') ? 'fire_haze' : statuses.includes('haze') ? 'haze' : statuses.every((s) => s === 'unknown') ? 'unknown' : 'clear',
    );
  });
  return out;
}

function windowBounds(): { start: string; last: string } {
  const { ds } = S;
  const last = ds.days[ds.days.length - 1];
  const start = ds.mode === 'live' ? ds.anchor : S.selected;
  const plus4 = addDays(S.selected, 4);
  return { start, last: ds.mode === 'live' ? last : plus4 < last ? plus4 : last };
}

function outlookInput() {
  const w = windowBounds();
  return buildOutlookInput(S.ref, viewDs(), S.fireCounts, S.overrides, w.start, w.last);
}

function recompute(): void {
  S.fds = null;
  if (S.ds.mode === 'replay' && S.view === 'forecast' && S.forecast) {
    S.fds = asForecast(S.ds, S.forecast, S.selected);
    S.notice = S.fds ? null : t('forecastMissing', { date: fmtDate(S.selected) });
  }
  S.outlook = engine.outlook(outlookInput());
}

/** Load the forecast replay of this region when the forecast view needs it. */
async function ensureForecast(): Promise<void> {
  const file = forecastFile();
  if (S.view !== 'forecast' || S.ds?.mode !== 'replay' || !file || S.forecast?.region === S.ref.region.id) return;
  try {
    S.forecast = await loadForecastReplay(S.ref.region.id, file);
  } catch (e) {
    // Never leave "what was forecast" selected over hindsight data.
    S.forecast = null;
    S.view = 'hindsight';
    S.ds.errors.push({ source: 'Copernicus CAMS (ADS)', error: e instanceof Error ? e.message : String(e) });
  }
}

async function setView(v: View): Promise<void> {
  if (v === S.view) return;
  S.view = v;
  await ensureForecast();
  recompute();
  render();
  setUrl();
}

function pillars(dayIdx: number): GeoJSON.FeatureCollection {
  const where = new Map(S.ref.puskesmas.map((p) => [p.id, p]));
  return {
    type: 'FeatureCollection',
    features: S.outlook.puskesmas.flatMap((p) => {
      const q = where.get(p.id);
      if (!q) return [];
      const day = p.days[dayIdx];
      const known = Boolean(day?.expected);
      const expected = day?.expected?.point ?? p.baseline_visits_per_day;
      const change = known && p.baseline_visits_per_day > 0 ? expected / p.baseline_visits_per_day - 1 : 0;
      return [
        {
          type: 'Feature' as const,
          properties: { id: p.id, expected, change, known, center: [q.lon, q.lat] },
          geometry: { type: 'Polygon' as const, coordinates: [hexagon(q.lon, q.lat)] },
        },
      ];
    }),
  };
}

function link(extra: Record<string, string> = {}): string | null {
  // The engine only accepts https links (a dev server on http gets none).
  if (location.protocol !== 'https:') return null;
  const q = new URLSearchParams({ region: S.ref.region.id, mode: S.ds.mode, ...(S.ds.mode === 'replay' ? { date: S.selected } : {}), ...extra });
  return `${location.origin}/?${q}`;
}

function renderHeader(mode?: Mode): void {
  ui.$('#brand-tagline').textContent = t('tagline');
  const live = ui.$<HTMLButtonElement>('#mode-live');
  const replay = ui.$<HTMLButtonElement>('#mode-replay');
  live.textContent = t('modeLive');
  replay.textContent = t('modeReplay');
  const m = mode ?? S?.ds?.mode;
  live.classList.toggle('active', m === 'live');
  replay.classList.toggle('active', m === 'replay');
  ui.$('#lang').textContent = t('lang');
  ui.$('#hint').textContent = t('clickHint');
  ui.$('#help').title = t('help');
  ui.$('#help').setAttribute('aria-label', t('help'));
  if (S?.regions) {
    const box = ui.$('#regions');
    box.setAttribute('aria-label', t('regionLabel'));
    box.innerHTML = S.regions.regions
      .map((r) => `<button type="button" data-region="${r.id}" class="${r.id === S.ref?.region.id ? 'active' : ''}">${regionLabel(r)}</button>`)
      .join('');
    box.querySelectorAll<HTMLButtonElement>('button[data-region]').forEach((b) =>
      b.addEventListener('click', () => void switchRegion(b.dataset.region as string, { fly: true })),
    );
  }
}

function applyImagery(): void {
  S.map.setImageryMode(S.layers.imagery, S.layers.night);
}

function toggleLayer(group: keyof ui.LayerToggles, on: boolean): void {
  S.layers[group] = on;
  if (group === 'imagery' || group === 'night') applyImagery();
  else S.map.setGroupVisible(group as LayerGroup, on);
  if (group === 'night') render();
}

function districtPm25(code: string, date: string): number | null {
  const di = S.ds.days.indexOf(date);
  if (di < 0) return null;
  return districtMean(S.ref, S.ds.pm25, S.ds.days.length).get(code)?.[di] ?? null;
}

function briefText(): { text: string; title: string } {
  const ds = viewDs();
  const b = engine.brief({
    outlook: outlookInput(),
    lang: lang(),
    region_name: S.ref.region.name,
    mode: S.fds ? 'forecast' : S.ds.mode,
    // Source names only (no words to translate); the briefing's mode line
    // already says when the data is a hindsight replay.
    data_times: ds.stamps.map((s) => ({
      source: s.label !== 'replay' ? s.label : S.ds.replayFiresAvailable ? 'Copernicus CAMS + NASA FIRMS' : 'Copernicus CAMS',
      time: s.when,
    })),
    errors: ds.errors.map((e) => ({
      source: e.source.replace(/\s+/g, ' ').trim().slice(0, 120) || 'source',
      error: e.error.replace(/\s+/g, ' ').trim().slice(0, 300) || 'unknown error',
    })),
    top: 5,
    link: link(),
  });
  return { text: b.text, title: b.title };
}

function renderSelection(): void {
  const sel = S.selection;
  S.map.selectPuskesmas(sel?.kind === 'puskesmas' ? sel.id : null);
  if (!sel) {
    S.map.selectDistrict(null);
    ui.closePanel();
    return;
  }
  if (sel.kind === 'help') {
    ui.renderHelp(Boolean(forecastFile()), `/?tour=1&lang=${lang()}&region=${S.ref.region.id}`, clearSelection);
    return;
  }
  if (sel.kind === 'brief') {
    try {
      const b = briefText();
      ui.renderBrief(b.text, b.title, clearSelection);
    } catch (e) {
      // The engine refuses bad metadata loudly; say so instead of breaking the page.
      ui.openPanel(`<h2>${t('briefFailed')}</h2><p class="muted small">${(e instanceof Error ? e.message : String(e)).replace(/[<>&]/g, '')}</p>`, clearSelection);
    }
  } else if (sel.kind === 'district') {
    const d = S.outlook.districts.find((x) => x.code === sel.code);
    const f = S.ref.byCode.get(sel.code);
    if (!d || !f) return;
    S.map.selectDistrict(sel.code);
    ui.renderDistrictPanel(S.outlook, d, f.properties, S.selected, (p) => setProfile(sel.code, p), clearSelection);
  } else {
    const p = S.outlook.puskesmas.find((x) => x.id === sel.id);
    const d = p && S.outlook.districts.find((x) => x.code === p.district_code);
    if (!p || !d) return;
    S.map.selectDistrict(d.code);
    const outdoor = districtPm25(d.code, S.selected);
    ui.renderPuskesmasPanel(S.outlook, p, d, S.selected, (v) => setBaseline(sel.id, v), (a, h, c) => cleanAir(a, h, c, outdoor), clearSelection);
  }
}

function renderPuskesmasList(): void {
  const imp = S.ref.imported;
  ui.renderPuskesmasList(
    imp ? { kind: 'user', n: imp.rows.length, file: imp.file, date: imp.imported_at.slice(0, 10) } : { kind: 'osm', n: S.ref.osmPuskesmas.length },
    S.csv,
    { exportCsv, importCsv: (f) => void importCsv(f), reset: resetCsv },
  );
}

function render(): void {
  const { ref, map, outlook } = S;
  const ds = viewDs();
  renderHeader();
  ui.renderViews(S.ds.mode === 'replay' && Boolean(forecastFile()), S.view, (v) => void setView(v));
  const di = ds.days.indexOf(S.selected);
  const smokeKey = `${ref.region.id}|${ds.mode}|${S.fds ? `forecast:${S.selected}` : 'hindsight'}|${ds.stamps.map((s) => s.when).join(',')}|${di}`;
  map.setSmoke(smokeKey, () => renderSmoke(ref.grid, ds.pm25, di), smokeCoordinates(ref.grid));
  const img = imageryFor(S.selected);
  map.setImagery(img.date);
  const when = fmtDate(img.date, { day: 'numeric', month: 'short', year: 'numeric' });
  const imageryNote = (S.layers.night ? t('imageryNight', { date: when }) : t('imagery', { date: when })) + (img.latest ? ` (${t('imageryLatest')})` : '');
  const firesShown = map.setFires(ds.fires, S.selected);
  const oi = outlook.days.indexOf(S.selected);
  map.setDistrictDay(
    new Map(
      outlook.districts.map((d) => {
        const x = d.days[oi];
        return [d.code, { change: x?.rr ? x.rr.point - 1 : null, status: x?.status ?? 'unknown' }];
      }),
    ),
  );
  map.setPillars(pillars(oi));
  ui.renderLegend(imageryNote, firesShown, S.selected, S.layers, toggleLayer);
  ui.renderTimeline(ds, S.selected, (d) => S.summary.get(d) ?? 'unknown', S.playing, select, togglePlay);
  ui.renderPriority(
    outlook,
    (code) => {
      S.selection = { kind: 'district', code };
      S.map.flyToDistrict(code);
      renderSelection();
    },
    openBrief,
  );
  renderPuskesmasList();
  ui.renderCheck(S.fds ? S.forecast : null);
  const issue = S.fds && S.forecast ? S.forecast.issue_dates.indexOf(S.selected) : -1;
  const forecastNote =
    issue >= 0 && S.forecast
      ? t('forecastLabel', { date: fmtDate(S.selected, { day: 'numeric', month: 'long', year: 'numeric' }), run: S.forecast.runs[issue] })
      : null;
  ui.renderStatus(ds, ref.meta, imageryNote, S.notice, forecastNote);
  renderSelection();
}

function setUrl(): void {
  const url = new URL(location.href);
  url.searchParams.set('region', S.ref.region.id);
  url.searchParams.set('mode', S.ds.mode);
  url.searchParams.set('date', S.selected);
  if (S.ds.mode === 'replay' && S.view === 'forecast') url.searchParams.set('view', 'forecast');
  else url.searchParams.delete('view');
  history.replaceState(null, '', url);
}

function select(date: string): void {
  if (!S.ds.days.includes(date)) return;
  S.selected = date;
  if (S.ds.mode === 'replay') recompute();
  render();
  setUrl();
}

function stopPlay(): void {
  S.playing = false;
  window.clearInterval(S.timer);
}

function togglePlay(): void {
  if (S.playing) {
    stopPlay();
  } else {
    S.playing = true;
    const list = S.ds.selectable;
    if (list.indexOf(S.selected) >= list.length - 1) S.selected = list[0];
    S.timer = window.setInterval(() => {
      const i = list.indexOf(S.selected);
      if (i < 0 || i >= list.length - 1) {
        stopPlay();
        render();
        return;
      }
      select(list[i + 1]);
    }, PLAY_MS);
  }
  render();
}

function clearSelection(): void {
  S.selection = null;
  renderSelection();
}

/** Glide the camera to a puskesmas, keeping it clear of the open panels. */
function focusPuskesmas(id: string): void {
  const p = S.ref.puskesmas.find((x) => x.id === id);
  if (p) S.map.focusPoint([p.lon, p.lat]);
}

function openBrief(): void {
  S.selection = { kind: 'brief' };
  renderSelection();
}

function setProfile(code: string, p: Profile): void {
  const base = S.ref.byCode.get(code)?.properties.profile;
  if (p === base) delete S.overrides.profiles[code];
  else S.overrides.profiles[code] = p;
  saveOverrides(S.overrides);
  recompute();
  render();
}

function setBaseline(id: string, v: number | null): void {
  if (v === null) delete S.overrides.baselines[id];
  else S.overrides.baselines[id] = v;
  saveOverrides(S.overrides);
  recompute();
  render();
}

function cleanAir(area: number, height: number, unitCadr: number, outdoor: number | null): CleanAirOutput | string {
  try {
    return engine.cleanAir({ floor_area_m2: area, ceiling_height_m: height, unit_cadr_m3h: unitCadr, outdoor_pm25_ugm3: outdoor });
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

// ---------- puskesmas CSV ----------

function exportCsv(): void {
  download(`sootsayer-puskesmas-${S.ref.region.id}.csv`, toCsv(S.ref.puskesmas, S.overrides.baselines));
}

async function importCsv(file: File): Promise<void> {
  const parsed = parsePuskesmasCsv(await file.text());
  const problems = parsed.problems.map((p) => t(p.problem, { row: p.row, detail: p.detail ?? '' }));
  const rows: Puskesmas[] = [];
  if (parsed.rows.length) {
    const located = engine.locate({ districts: shapes(S.ref), points: parsed.rows.map((r) => [r.lon, r.lat]) }).located;
    const used = new Set<string>();
    parsed.rows.forEach((r, i) => {
      const at = located[i];
      if (!at) {
        problems.push(t('csvRowOutside', { row: r.row, region: regionLabel(S.ref.region) }));
        return;
      }
      let id = r.id ?? `user:${r.row}`;
      while (used.has(id)) id = `${id}-${r.row}`;
      used.add(id);
      rows.push({ id, name: r.name, lon: r.lon, lat: r.lat, district_code: at.district_code, baseline: r.baseline });
    });
  }
  if (rows.length) {
    saveImported(S.ref, { file: file.name.slice(0, 80), imported_at: new Date().toISOString(), rows });
    S.csv = { ok: t('csvDone', { n: rows.length }), problems };
    S.selection = null;
    S.summary = summarize(S.ref, S.ds, S.fireCounts);
    recompute();
  } else {
    S.csv = { ok: t('csvNothing'), problems };
  }
  render();
}

function resetCsv(): void {
  saveImported(S.ref, null);
  S.csv = { ok: null, problems: [] };
  S.selection = null;
  recompute();
  render();
}

// ---------- region and mode ----------

async function switchMode(mode: Mode, preferredDate?: string): Promise<void> {
  stopPlay();
  ui.setLoading(true);
  try {
    let m = mode;
    S.notice = null;
    if (m === 'replay' && !S.ref.region.replay) {
      S.notice = t('replayMissing', { region: regionLabel(S.ref.region) });
      m = 'live';
    }
    const ds = m === 'live' ? await loadLive(S.ref) : await loadReplay(S.ref);
    const fireCounts = computeFireCounts(S.ref, ds);
    S.ds = ds;
    S.fds = null;
    S.fireCounts = fireCounts;
    S.summary = summarize(S.ref, ds, fireCounts);
    const fallback = m === 'live' ? ds.anchor : ds.selectable.includes(REPLAY_DEFAULT_DAY) ? REPLAY_DEFAULT_DAY : ds.selectable[0];
    S.selected = preferredDate && ds.selectable.includes(preferredDate) ? preferredDate : fallback;
    await ensureForecast();
    recompute();
    setUrl();
    render();
    if (ds.pointsFile) {
      // The outlook already uses the build-time counts; the points only draw the map layer.
      loadReplayFires(ds.region, ds.pointsFile)
        .then((rows) => {
          if (S.ds !== ds) return;
          ds.fires = rows;
          render();
        })
        .catch((e: unknown) => {
          ds.errors.push({ source: 'NASA FIRMS (replay points)', error: e instanceof Error ? e.message : String(e) });
          if (S.ds === ds) render();
        });
    }
  } finally {
    ui.setLoading(false);
  }
}

async function switchRegion(id: string, opts: { fly?: boolean; mode?: Mode; date?: string } = {}): Promise<void> {
  const info = S.regions.regions.find((r) => r.id === id);
  if (!info || (S.ref && S.ref.region.id === id && !opts.mode)) return;
  stopPlay();
  ui.setLoading(true);
  try {
    const ref = await loadReference(info);
    S.ref = ref;
    S.selection = null;
    S.forecast = null;
    S.csv = { ok: null, problems: [] };
    S.map.setDistricts(ref.districts);
    await switchMode(opts.mode ?? S.ds?.mode ?? 'live', opts.date ?? (S.ds?.mode === 'replay' ? S.selected : undefined));
    if (opts.fly) S.map.flyIn(regionBounds(info), 3500);
  } finally {
    ui.setLoading(false);
  }
}

// ---------- boot ----------

/** Keep the side panels between the top bar and the bottom panel, whatever their heights (wrapped legend or credits). */
function watchLayout(): void {
  const root = document.documentElement;
  const bottom = ui.$('#bottom');
  const top = ui.$('#topbar');
  const apply = () => {
    root.style.setProperty('--bottom-space', `${Math.round(window.innerHeight - bottom.getBoundingClientRect().top)}px`);
    root.style.setProperty('--top-y', `${Math.round(top.getBoundingClientRect().bottom + 10)}px`);
  };
  const ro = new ResizeObserver(apply);
  ro.observe(bottom);
  ro.observe(top);
  window.addEventListener('resize', apply);
  apply();
}

async function boot(): Promise<void> {
  setLang(lang());
  watchLayout();
  const params = new URLSearchParams(location.search);
  const mode: Mode = params.get('mode') === 'replay' ? 'replay' : 'live';
  const tour = params.get('tour') === '1';
  renderHeader(mode);
  // The intro shows at once over the spinning-up globe; data loads behind it.
  let entered = params.get('intro') === '0' || tour;
  let flyIn: (() => void) | null = null;
  const regionsP = loadRegions();
  if (!entered) {
    void regionsP.then((idx) => {
      const r = idx.regions.find((x) => x.id === params.get('region')) ?? idx.regions.find((x) => x.id === idx.default) ?? idx.regions[0];
      ui.showIntro(regionLabel(r), () => {
        entered = true;
        flyIn?.();
      });
    });
  } else {
    ui.setLoading(true);
  }
  try {
    const [regions] = await Promise.all([regionsP, loadEngine()]);
    const info = regions.regions.find((r) => r.id === params.get('region')) ?? regions.regions.find((r) => r.id === regions.default) ?? regions.regions[0];
    const ref = await loadReference(info);
    // Start the day imagery on the date the link asks for: switching tiles
    // right after the first load aborts them mid-decode.
    const dateParam = params.get('date');
    const firstDay = mode === 'replay' ? (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : REPLAY_DEFAULT_DAY) : todayWib();
    const map = await createMap(ui.$('#map'), imageryFor(firstDay).date, ref.districts);
    flyIn = () => map.flyIn(regionBounds(S.ref.region));
    S = {
      regions,
      ref,
      map,
      ds: undefined as unknown as Dataset,
      fireCounts: {},
      overrides: loadOverrides(),
      selected: '',
      selection: null,
      outlook: undefined as unknown as OutlookOutput,
      summary: new Map(),
      playing: false,
      timer: 0,
      layers: { imagery: true, night: params.get('night') === '1', smoke: true, fires: true, pillars: true, districts: true },
      csv: { ok: null, problems: [] },
      notice: null,
      view: params.get('view') === 'forecast' ? 'forecast' : 'hindsight',
      forecast: null,
      fds: null,
    };
    if (import.meta.env.DEV) (window as unknown as { sootsayer: State }).sootsayer = S;
    for (const g of Object.keys(LAYER_GROUPS) as LayerGroup[]) map.setGroupVisible(g, S.layers[g]);
    applyImagery();
    map.onDistrict((code) => {
      S.selection = { kind: 'district', code };
      renderSelection();
    });
    map.onPuskesmas((id) => {
      S.selection = { kind: 'puskesmas', id };
      renderSelection();
      focusPuskesmas(id);
    });
    ui.$('#help').addEventListener('click', () => {
      S.selection = S.selection?.kind === 'help' ? null : { kind: 'help' };
      renderSelection();
    });
    ui.$('#mode-live').addEventListener('click', () => void switchMode('live'));
    ui.$('#mode-replay').addEventListener('click', () => void switchMode('replay'));
    ui.$('#lang').addEventListener('click', () => {
      setLang(lang() === 'id' ? 'en' : 'id');
      render();
    });
    await switchMode(mode, params.get('date') ?? undefined);
    // Deep links for demos: ?district=KT-pulang-pisau or ?puskesmas=osm:node/123
    const district = params.get('district');
    const puskesmas = params.get('puskesmas');
    if (puskesmas && S.outlook.puskesmas.some((p) => p.id === puskesmas)) {
      S.selection = { kind: 'puskesmas', id: puskesmas };
      renderSelection();
    } else if (district && S.ref.byCode.has(district)) {
      S.selection = { kind: 'district', code: district };
      renderSelection();
    } else if (params.get('brief') === '1') {
      openBrief();
    }
    if (tour) {
      void runTour(tourApi(), Number(params.get('pace')) || 1);
    } else if (entered) {
      // Fly in now if the visitor already pressed "enter" (or skipped the intro),
      // straight to the linked puskesmas or district when there is one.
      const sel = S.selection;
      if (sel?.kind === 'puskesmas') focusPuskesmas(sel.id);
      else if (sel?.kind === 'district') map.flyToDistrict(sel.code);
      else map.flyIn(regionBounds(S.ref.region));
    }
  } catch (e) {
    ui.setLoading(false);
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    ui.$('#loading').classList.remove('hidden');
    ui.$('#loading').innerHTML = `<strong>Sootsayer</strong><br>${msg.replace(/[<>&]/g, '')}`;
    throw e;
  }
}

function tourApi(): TourApi {
  return {
    region: () => S.ref.region.id,
    setRegion: (id, mode, date) => switchRegion(id, { mode, date, fly: true }),
    setMode: (mode, date) => switchMode(mode, date),
    select,
    replayDays: () => S.ds.selectable,
    openDistrict: (code) => {
      if (!S.ref.byCode.has(code)) return false;
      S.selection = { kind: 'district', code };
      S.map.flyToDistrict(code);
      renderSelection();
      return true;
    },
    openPuskesmas: (pattern) => {
      const p = S.ref.puskesmas.find((x) => pattern.test(x.name));
      if (!p) return false;
      S.selection = { kind: 'puskesmas', id: p.id };
      renderSelection();
      return true;
    },
    openBrief,
    closePanel: clearSelection,
    flyIn: (duration) => S.map.flyIn(regionBounds(S.ref.region), duration),
    flyGlobe: () => S.map.map.jumpTo({ center: [110.5, -1.2], zoom: 1.55, pitch: 0, bearing: 0 }),
  };
}

void boot();
