// Sootsayer web app: wires data, the WebAssembly engine, the globe, and the UI.

import './style.css';

import {
  addDays,
  buildOutlookInput,
  loadLive,
  loadOverrides,
  loadReference,
  loadReplay,
  loadReplayFires,
  multipolygon,
  saveOverrides,
  type Dataset,
  type Reference,
} from './data';
import { engine, loadEngine } from './engine';
import { fmtDate, lang, setLang, t } from './i18n';
import { createMap, hexagon, LAYER_GROUPS, type LayerGroup, type SootMap } from './map';
import { renderSmoke, smokeCoordinates } from './smoke';
import type { CleanAirOutput, DayStatus, OutlookOutput, Profile } from './types';
import * as ui from './ui';

type Selection = { kind: 'district'; code: string } | { kind: 'puskesmas'; id: string } | null;

const REPLAY_DEFAULT_DAY = '2026-10-15';
const PLAY_MS = 1400;

interface State {
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
}

let S: State;

function todayWib(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

/** NASA GIBS has complete daily images up to yesterday (UTC+7). */
function imageryFor(date: string): { date: string; latest: boolean } {
  const latest = addDays(todayWib(), -1);
  return date <= latest ? { date, latest: false } : { date: latest, latest: true };
}

function computeFireCounts(ref: Reference, ds: Dataset): Record<string, number[]> {
  if (ds.fireCounts) return ds.fireCounts; // replay: counted by the same engine at build time
  if (!ds.fires.length) return {};
  try {
    return engine.fireCounts({
      days: ds.days,
      districts: ref.districts.features.map((f) => ({ code: f.properties.code, multipolygon: multipolygon(f) })),
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

function recompute(): void {
  const { ref, ds } = S;
  const last = ds.days[ds.days.length - 1];
  const windowStart = ds.mode === 'live' ? ds.anchor : S.selected;
  const plus4 = addDays(S.selected, 4);
  const lastDay = ds.mode === 'live' ? last : plus4 < last ? plus4 : last;
  S.outlook = engine.outlook(buildOutlookInput(ref, ds, S.fireCounts, S.overrides, windowStart, lastDay));
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

function renderHeader(mode?: 'live' | 'replay'): void {
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
}

function toggleLayer(group: keyof ui.LayerToggles, on: boolean): void {
  S.layers[group] = on;
  S.map.setGroupVisible(group as LayerGroup, on);
}

function renderSelection(): void {
  const sel = S.selection;
  if (!sel) {
    S.map.selectDistrict(null);
    ui.closePanel();
    return;
  }
  if (sel.kind === 'district') {
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
    ui.renderPuskesmasPanel(S.outlook, p, d, S.selected, (v) => setBaseline(sel.id, v), cleanAir, clearSelection);
  }
}

function render(): void {
  const { ref, ds, map, outlook } = S;
  renderHeader();
  const di = ds.days.indexOf(S.selected);
  map.setSmoke(renderSmoke(ref.grid, ds.pm25, di), smokeCoordinates(ref.grid));
  const img = imageryFor(S.selected);
  map.setImagery(img.date);
  const imageryNote =
    t('imagery', { date: fmtDate(img.date, { day: 'numeric', month: 'short', year: 'numeric' }) }) +
    (img.latest ? ` (${t('imageryLatest')})` : '');
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
  ui.renderPriority(outlook, (code) => {
    S.selection = { kind: 'district', code };
    S.map.flyToDistrict(code);
    renderSelection();
  });
  ui.renderStatus(ds, ref.meta, imageryNote);
  renderSelection();
}

function select(date: string): void {
  if (!S.ds.days.includes(date)) return;
  S.selected = date;
  if (S.ds.mode === 'replay') recompute();
  render();
  const url = new URL(location.href);
  url.searchParams.set('date', date);
  history.replaceState(null, '', url);
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

function cleanAir(area: number, height: number, unitCadr: number): CleanAirOutput | string {
  try {
    return engine.cleanAir({ floor_area_m2: area, ceiling_height_m: height, unit_cadr_m3h: unitCadr });
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

async function switchMode(mode: 'live' | 'replay', preferredDate?: string): Promise<void> {
  stopPlay();
  ui.setLoading(true);
  try {
    const ds = mode === 'live' ? await loadLive(S.ref) : await loadReplay();
    const fireCounts = computeFireCounts(S.ref, ds);
    S.ds = ds;
    S.fireCounts = fireCounts;
    S.summary = summarize(S.ref, ds, fireCounts);
    const fallback = mode === 'live' ? ds.anchor : ds.selectable.includes(REPLAY_DEFAULT_DAY) ? REPLAY_DEFAULT_DAY : ds.selectable[0];
    S.selected = preferredDate && ds.selectable.includes(preferredDate) ? preferredDate : fallback;
    recompute();
    const url = new URL(location.href);
    url.searchParams.set('mode', mode);
    url.searchParams.set('date', S.selected);
    history.replaceState(null, '', url);
    render();
    if (ds.pointsFile) {
      // The outlook already uses the build-time counts; the points only draw the map layer.
      loadReplayFires(ds.pointsFile)
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

async function boot(): Promise<void> {
  setLang(lang());
  const params = new URLSearchParams(location.search);
  const mode = params.get('mode') === 'replay' ? 'replay' : 'live';
  renderHeader(mode);
  // The intro shows at once over the spinning-up globe; data loads behind it.
  let entered = params.get('intro') === '0';
  let flyIn: (() => void) | null = null;
  if (!entered) {
    ui.showIntro(() => {
      entered = true;
      flyIn?.();
    });
  } else {
    ui.setLoading(true);
  }
  try {
    const [ref] = await Promise.all([loadReference(), loadEngine()]);
    const map = await createMap(ui.$('#map'), addDays(todayWib(), -1), ref.districts);
    flyIn = () => map.flyIn();
    S = {
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
      layers: { imagery: true, smoke: true, fires: true, pillars: true, districts: true },
    };
    if (import.meta.env.DEV) (window as unknown as { sootsayer: State }).sootsayer = S;
    for (const g of Object.keys(LAYER_GROUPS) as LayerGroup[]) map.setGroupVisible(g, S.layers[g]);
    map.onDistrict((code) => {
      S.selection = { kind: 'district', code };
      renderSelection();
    });
    map.onPuskesmas((id) => {
      S.selection = { kind: 'puskesmas', id };
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
    }
    // Fly in now if the visitor already pressed "enter" (or skipped the intro).
    if (entered) map.flyIn();
  } catch (e) {
    ui.setLoading(false);
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    ui.$('#loading').classList.remove('hidden');
    ui.$('#loading').innerHTML = `<strong>Sootsayer</strong><br>${msg.replace(/[<>&]/g, '')}`;
    throw e;
  }
}

void boot();
