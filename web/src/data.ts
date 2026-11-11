// Loading open data (static files, edge functions, replay) and building the
// engine input. Mirrors pipeline/sootsayer_pipeline/engine.py so the MCP
// server and the browser feed the engine identical numbers.

import type {
  AirResponse,
  DistrictCollection,
  DistrictFeature,
  FireRow,
  FiresResponse,
  Grid,
  OutlookInput,
  Profile,
  Puskesmas,
  ReferenceMeta,
  ReplayFile,
  SourceError,
} from './types';

export interface Reference {
  grid: Grid;
  districts: DistrictCollection;
  puskesmas: Puskesmas[];
  meta: ReferenceMeta;
  byCode: Map<string, DistrictFeature>;
}

export interface Dataset {
  mode: 'live' | 'replay';
  /** Every day with data, history first. */
  days: string[];
  /** Days the timeline offers (live: all; replay: October). */
  selectable: string[];
  /** Live: today (UTC+7). Replay: first replay day. */
  anchor: string;
  pm25: (number | null)[][];
  pm10: (number | null)[][];
  fires: FireRow[];
  fireDaysKnown: Set<string>;
  errors: SourceError[];
  stamps: { label: string; when: string }[];
  replayFiresAvailable?: boolean;
}

class NamedError extends Error {
  constructor(public source: string, message: string) {
    super(message);
  }
}

async function getJson<T>(url: string, source: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new NamedError(source, e instanceof Error ? e.message : String(e));
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as Partial<SourceError>;
      if (body.error) detail = body.error;
    } catch {
      /* not JSON */
    }
    throw new NamedError(source, detail);
  }
  return (await res.json()) as T;
}

function asSourceError(e: unknown, fallback: string): SourceError {
  if (e instanceof NamedError) return { source: e.source, error: e.message };
  return { source: fallback, error: e instanceof Error ? e.message : String(e) };
}

export async function loadReference(): Promise<Reference> {
  const [grid, districts, puskesmas, meta] = await Promise.all([
    getJson<Grid>('/data/grid.json', 'grid'),
    getJson<DistrictCollection>('/data/districts.geojson', 'districts'),
    getJson<Puskesmas[]>('/data/puskesmas.json', 'puskesmas'),
    getJson<ReferenceMeta>('/data/reference-meta.json', 'reference'),
  ]);
  const byCode = new Map(districts.features.map((f) => [f.properties.code, f]));
  return { grid, districts, puskesmas, meta, byCode };
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * 86_400_000).toISOString().slice(0, 10);
}

function todayWib(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

export async function loadLive(ref: Reference): Promise<Dataset> {
  const [air, fires] = await Promise.allSettled([
    getJson<AirResponse>('/api/air?past_days=14&forecast_days=5', 'CAMS (Open-Meteo)'),
    getJson<FiresResponse>('/api/fires?range=7d', 'NASA FIRMS'),
  ]);
  const errors: SourceError[] = [];
  const stamps: Dataset['stamps'] = [];
  const nCells = ref.grid.cells.length;
  let days: string[];
  let anchor: string;
  let pm25: (number | null)[][];
  let pm10: (number | null)[][];
  if (air.status === 'fulfilled') {
    if (air.value.cells !== nCells) {
      errors.push({ source: 'CAMS (Open-Meteo)', error: `grid mismatch: ${air.value.cells} cells vs ${nCells}` });
    }
    days = air.value.days;
    anchor = days.includes(air.value.today) ? air.value.today : days[Math.max(0, days.length - 5)];
    pm25 = air.value.pm25_ugm3;
    pm10 = air.value.pm10_ugm3;
    stamps.push({ label: 'CAMS', when: air.value.generated_at });
  } else {
    errors.push(asSourceError(air.reason, 'CAMS (Open-Meteo)'));
    anchor = todayWib();
    days = Array.from({ length: 5 }, (_, i) => addDays(anchor, i));
    pm25 = Array.from({ length: nCells }, () => days.map(() => null));
    pm10 = Array.from({ length: nCells }, () => days.map(() => null));
  }
  let rows: FireRow[] = [];
  const fireDaysKnown = new Set<string>();
  if (fires.status === 'fulfilled') {
    rows = fires.value.rows;
    stamps.push({ label: 'FIRMS', when: fires.value.generated_at });
    // The 7-day feed covers the last seven days up to now; forecast days have
    // no fire data, so their counts stay unknown (null), never zero.
    const first = addDays(anchor, -6);
    for (const d of days) if (d >= first && d <= anchor) fireDaysKnown.add(d);
  } else {
    errors.push(asSourceError(fires.reason, 'NASA FIRMS'));
  }
  return { mode: 'live', days, selectable: days, anchor, pm25, pm10, fires: rows, fireDaysKnown, errors, stamps };
}

export async function loadReplay(): Promise<Dataset> {
  const rep = await getJson<ReplayFile>('/data/replay-2026-10.json', 'replay');
  const selectable = rep.days.filter((d) => d >= rep.window_start);
  return {
    mode: 'replay',
    days: rep.days,
    selectable,
    anchor: rep.window_start,
    pm25: rep.cams.pm25_ugm3,
    pm10: rep.cams.pm10_ugm3,
    fires: rep.fires.rows,
    fireDaysKnown: rep.fires.available ? new Set(rep.days) : new Set(),
    errors: [],
    stamps: [{ label: 'replay', when: rep.generated_at }],
    replayFiresAvailable: rep.fires.available,
  };
}

/** Daily district PM10: plain mean over the district's cells (known values only). */
export function districtPm10(ref: Reference, pm10: (number | null)[][], nDays: number): Map<string, (number | null)[]> {
  const out = new Map<string, (number | null)[]>();
  for (const f of ref.districts.features) {
    const series: (number | null)[] = [];
    for (let d = 0; d < nDays; d++) {
      let sum = 0;
      let n = 0;
      for (const c of f.properties.cells) {
        const v = pm10[c][d];
        if (v !== null && v !== undefined) {
          sum += v;
          n += 1;
        }
      }
      series.push(n ? sum / n : null);
    }
    out.set(f.properties.code, series);
  }
  return out;
}

export function multipolygon(f: DistrictFeature): number[][][][] {
  return f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
}

export interface Overrides {
  baselines: Record<string, number>;
  profiles: Record<string, Profile>;
}

export function loadOverrides(): Overrides {
  try {
    return {
      baselines: JSON.parse(localStorage.getItem('sootsayer.baselines') ?? '{}'),
      profiles: JSON.parse(localStorage.getItem('sootsayer.profiles') ?? '{}'),
    };
  } catch {
    return { baselines: {}, profiles: {} };
  }
}

export function saveOverrides(o: Overrides): void {
  localStorage.setItem('sootsayer.baselines', JSON.stringify(o.baselines));
  localStorage.setItem('sootsayer.profiles', JSON.stringify(o.profiles));
}

export function buildOutlookInput(
  ref: Reference,
  ds: Dataset,
  fireCounts: Record<string, number[]>,
  o: Overrides,
  windowStart: string,
  lastDay: string,
): OutlookInput {
  const end = ds.days.indexOf(lastDay) >= 0 ? ds.days.indexOf(lastDay) : ds.days.length - 1;
  const days = ds.days.slice(0, end + 1);
  const pm = districtPm10(ref, ds.pm10, ds.days.length);
  return {
    days,
    window_start: windowStart,
    districts: ref.districts.features.map((f) => {
      const code = f.properties.code;
      const counts = fireCounts[code];
      return {
        code,
        name: f.properties.name,
        profile: o.profiles[code] ?? f.properties.profile,
        pm10_ugm3: (pm.get(code) ?? []).slice(0, days.length),
        fire_count: days.map((d, i) => (counts && ds.fireDaysKnown.has(d) ? counts[i] : null)),
      };
    }),
    puskesmas: ref.puskesmas.map((p) => ({
      id: p.id,
      name: p.name,
      district_code: p.district_code,
      baseline_visits_per_day: o.baselines[p.id] ?? null,
    })),
  };
}
