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
  RegionInfo,
  RegionsIndex,
  ReplayFile,
  ReplayFiresFile,
  SourceError,
} from './types';

export interface Reference {
  region: RegionInfo;
  grid: Grid;
  districts: DistrictCollection;
  /** OpenStreetMap puskesmas from the reference build. */
  osmPuskesmas: Puskesmas[];
  /** What the outlook uses: the OSM list, or the user's imported list. */
  puskesmas: Puskesmas[];
  imported: ImportedList | null;
  meta: ReferenceMeta;
  byCode: Map<string, DistrictFeature>;
}

export interface Dataset {
  mode: 'live' | 'replay';
  region: string;
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
  /** Fire counts per district per day computed at build time (replay). */
  fireCounts?: Record<string, number[]>;
  /** Replay fire points load after the first frame. */
  pointsFile?: string;
}

export class NamedError extends Error {
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

export function loadRegions(): Promise<RegionsIndex> {
  return getJson<RegionsIndex>('/data/regions.json', 'regions');
}

const refCache = new Map<string, Promise<Reference>>();

export function loadReference(region: RegionInfo): Promise<Reference> {
  let hit = refCache.get(region.id);
  if (!hit) {
    const base = `/data/${region.id}`;
    hit = Promise.all([
      getJson<Grid>(`${base}/grid.json`, 'grid'),
      getJson<DistrictCollection>(`${base}/districts.geojson`, 'districts'),
      getJson<Puskesmas[]>(`${base}/puskesmas.json`, 'puskesmas'),
      getJson<ReferenceMeta>(`${base}/reference-meta.json`, 'reference'),
    ]).then(([grid, districts, osm, meta]) => {
      const byCode = new Map(districts.features.map((f) => [f.properties.code, f]));
      const imported = loadImported(region.id);
      return {
        region,
        grid,
        districts,
        osmPuskesmas: osm,
        puskesmas: imported ? imported.rows : osm,
        imported,
        meta,
        byCode,
      };
    });
    hit.catch(() => refCache.delete(region.id));
    refCache.set(region.id, hit);
  }
  return hit;
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * 86_400_000).toISOString().slice(0, 10);
}

export function todayWib(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

export async function loadLive(ref: Reference): Promise<Dataset> {
  const r = encodeURIComponent(ref.region.id);
  const [air, fires] = await Promise.allSettled([
    getJson<AirResponse>(`/api/air?region=${r}&past_days=14&forecast_days=5`, 'CAMS (Open-Meteo)'),
    getJson<FiresResponse>(`/api/fires?region=${r}&range=7d`, 'NASA FIRMS'),
  ]);
  const errors: SourceError[] = [];
  const stamps: Dataset['stamps'] = [];
  const nCells = ref.grid.cells.length;
  let days: string[];
  let anchor: string;
  let pm25: (number | null)[][];
  let pm10: (number | null)[][];
  if (air.status === 'fulfilled' && air.value.cells === nCells) {
    days = air.value.days;
    anchor = days.includes(air.value.today) ? air.value.today : days[Math.max(0, days.length - 5)];
    pm25 = air.value.pm25_ugm3;
    pm10 = air.value.pm10_ugm3;
    stamps.push({ label: 'CAMS (Open-Meteo)', when: air.value.generated_at });
  } else {
    if (air.status === 'fulfilled') {
      // Never draw another grid's numbers onto this region.
      errors.push({ source: 'CAMS (Open-Meteo)', error: `grid mismatch: ${air.value.cells} cells vs ${nCells}` });
    } else {
      errors.push(asSourceError(air.reason, 'CAMS (Open-Meteo)'));
    }
    anchor = todayWib();
    days = Array.from({ length: 5 }, (_, i) => addDays(anchor, i));
    pm25 = Array.from({ length: nCells }, () => days.map(() => null));
    pm10 = Array.from({ length: nCells }, () => days.map(() => null));
  }
  let rows: FireRow[] = [];
  const fireDaysKnown = new Set<string>();
  if (fires.status === 'fulfilled') {
    rows = fires.value.rows;
    stamps.push({ label: 'NASA FIRMS', when: fires.value.generated_at });
    // The 7-day feed covers the last seven days up to now; forecast days have
    // no fire data, so their counts stay unknown (null), never zero.
    const first = addDays(anchor, -6);
    for (const d of days) if (d >= first && d <= anchor) fireDaysKnown.add(d);
  } else {
    errors.push(asSourceError(fires.reason, 'NASA FIRMS'));
  }
  return { mode: 'live', region: ref.region.id, days, selectable: days, anchor, pm25, pm10, fires: rows, fireDaysKnown, errors, stamps };
}

export async function loadReplay(ref: Reference): Promise<Dataset> {
  const info = ref.region.replay;
  if (!info) throw new NamedError('replay', `no replay for ${ref.region.name}`);
  const rep = await getJson<ReplayFile>(`/data/${ref.region.id}/${info.file}`, 'replay');
  const selectable = rep.days.filter((d) => d >= rep.window_start);
  const counted = rep.fires.available && rep.fires.district_counts;
  return {
    mode: 'replay',
    region: ref.region.id,
    days: rep.days,
    selectable,
    anchor: rep.window_start,
    pm25: rep.cams.pm25_ugm3,
    pm10: rep.cams.pm10_ugm3,
    fires: [],
    fireDaysKnown: counted ? new Set(rep.days) : new Set(),
    errors: [],
    stamps: [{ label: 'replay', when: rep.generated_at }],
    replayFiresAvailable: Boolean(counted),
    fireCounts: counted ? rep.fires.district_counts : undefined,
    pointsFile: rep.fires.points_file ?? undefined,
  };
}

/** Load the replay's fire points for the map (about 1 MB gzipped). */
export async function loadReplayFires(regionId: string, file: string): Promise<FireRow[]> {
  const f = await getJson<ReplayFiresFile>(`/data/${regionId}/${file}`, 'NASA FIRMS (replay points)');
  return f.rows.map(([lon, lat, day, frp]) => [lon, lat, f.days[day], '', frp, '', ''] as FireRow);
}

/** Daily district mean over the district's cells (known values only), for PM10 or PM2.5. */
export function districtMean(ref: Reference, cells: (number | null)[][], nDays: number): Map<string, (number | null)[]> {
  const out = new Map<string, (number | null)[]>();
  for (const f of ref.districts.features) {
    const series: (number | null)[] = [];
    for (let d = 0; d < nDays; d++) {
      let sum = 0;
      let n = 0;
      for (const c of f.properties.cells) {
        const v = cells[c]?.[d];
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

// ---------- the user's own settings (kept in this browser only) ----------

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

export interface ImportedList {
  file: string;
  imported_at: string;
  rows: Puskesmas[];
}

const importedKey = (regionId: string) => `sootsayer.puskesmas.${regionId}`;

export function loadImported(regionId: string): ImportedList | null {
  try {
    const raw = localStorage.getItem(importedKey(regionId));
    if (!raw) return null;
    const v = JSON.parse(raw) as ImportedList;
    return Array.isArray(v.rows) && v.rows.length ? v : null;
  } catch {
    return null;
  }
}

export function saveImported(ref: Reference, list: ImportedList | null): void {
  if (list) localStorage.setItem(importedKey(ref.region.id), JSON.stringify(list));
  else localStorage.removeItem(importedKey(ref.region.id));
  ref.imported = list;
  ref.puskesmas = list ? list.rows : ref.osmPuskesmas;
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
  const pm = districtMean(ref, ds.pm10, ds.days.length);
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
      baseline_visits_per_day: o.baselines[p.id] ?? p.baseline ?? null,
    })),
  };
}
