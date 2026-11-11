// Shapes of the static data files, the edge-function responses, and the
// engine's JSON. Engine types mirror engine/src/model.rs.

export type Profile = 'kota' | 'kabupaten';
export type DayStatus = 'clear' | 'haze' | 'fire_haze' | 'unknown';
export type DurationGroup = '1-3' | '4-14' | '15+';

export interface Range {
  point: number;
  low: number;
  high: number;
}

// ---------- static reference data ----------

export interface Grid {
  step_deg: number;
  lons: number[];
  lats: number[];
  cells: [number, number][];
}

export interface DistrictProps {
  code: string;
  name: string;
  province: string;
  profile: Profile;
  cells: number[];
  cells_rule: 'inside' | 'nearest';
  label: [number, number];
  area_km2: number;
  puskesmas_mapped: number;
  source_id: string;
}

export interface DistrictFeature {
  type: 'Feature';
  properties: DistrictProps;
  geometry: { type: 'Polygon'; coordinates: number[][][] } | { type: 'MultiPolygon'; coordinates: number[][][][] };
}

export interface DistrictCollection {
  type: 'FeatureCollection';
  features: DistrictFeature[];
}

export interface Puskesmas {
  id: string;
  name: string;
  lon: number;
  lat: number;
  district_code: string;
  /** Usual respiratory visits per day from an imported list (user data). */
  baseline?: number | null;
}

export interface RegionInfo {
  id: string;
  name: string;
  bbox: [number, number, number, number];
  provinces: string[];
  districts: number;
  kota: number;
  puskesmas: number;
  reference_generated_at: string;
  replay: {
    file: string;
    window_start: string;
    first_day: string;
    last_day: string;
    fires: boolean;
    generated_at: string;
    /** The forecast available on each morning (from the Atmosphere Data Store), when built. */
    forecast?: { file: string; first_issue: string; last_issue: string; generated_at: string } | null;
  } | null;
}

export interface LeadCheck {
  lead_day: number;
  pairs: number;
  missing: number;
  hits: number;
  misses: number;
  false_alarms: number;
  correct_negatives: number;
  pod: number | null;
  far: number | null;
  accuracy: number | null;
}

export interface CheckOutput {
  threshold_pm10_ugm3: number;
  leads: LeadCheck[];
  definitions: string;
}

/** replay-2026-10-forecast.json: [issue][lead day][cell] daily means in ug/m3. */
export interface ForecastReplayFile {
  generated_at: string;
  region: string;
  issue_dates: string[];
  runs: string[];
  lead_days: number;
  pm10_ugm3: (number | null)[][][];
  pm25_ugm3: (number | null)[][][];
  check: CheckOutput;
  source: string;
}

export interface RegionsIndex {
  default: string;
  regions: RegionInfo[];
}

export interface ReferenceMeta {
  generated_at: string;
  sources: { layer: string; name: string; origin?: string; license: string; url: string }[];
  counts: Record<string, number>;
  notes: string[];
}

// ---------- live data (edge functions) and replay ----------

export interface AirResponse {
  generated_at: string;
  source: string;
  region?: string;
  today: string;
  days: string[];
  cells: number;
  pm25_ugm3: (number | null)[][];
  pm10_ugm3: (number | null)[][];
}

/** [lon, lat, date_wib, time_utc, frp_mw, confidence, daynight] */
export type FireRow = [number, number, string, string, number | null, string, string];

export interface FiresResponse {
  generated_at: string;
  source: string;
  range: string;
  dates: string[];
  count: number;
  rows: FireRow[];
}

export interface ReplayFile {
  generated_at: string;
  days: string[];
  window_start: string;
  cams: { pm25_ugm3: (number | null)[][]; pm10_ugm3: (number | null)[][]; source: string; license: string };
  fires: {
    available: boolean;
    note: string;
    total?: number;
    /** district code -> detections per day, counted by the Rust engine at build time */
    district_counts?: Record<string, number[]>;
    points_file?: string | null;
  };
  label: string;
}

/** Compact replay fire points: [lon, lat, day index, FRP in MW]. */
export interface ReplayFiresFile {
  days: string[];
  columns: string[];
  rows: [number, number, number, number | null][];
  source: string;
}

export interface SourceError {
  error: string;
  source: string;
}

// ---------- engine IO ----------

export interface OutlookInput {
  days: string[];
  window_start: string;
  districts: {
    code: string;
    name: string;
    profile: Profile;
    pm10_ugm3: (number | null)[];
    fire_count: (number | null)[];
  }[];
  puskesmas: { id: string; name: string; district_code: string; baseline_visits_per_day: number | null }[];
}

export interface DistrictDay {
  date: string;
  in_window: boolean;
  pm10_ugm3: number | null;
  fire_count: number | null;
  status: DayStatus;
  duration_days: number;
  duration_group: DurationGroup | null;
  rr: Range | null;
  fire_data: boolean;
}

export interface DistrictOutlook {
  code: string;
  name: string;
  profile: Profile;
  days: DistrictDay[];
  complete: boolean;
  haze_days: number;
  fire_haze_days: number;
  window_mean_change: Range | null;
}

export interface PuskesmasDay {
  date: string;
  in_window: boolean;
  expected: Range | null;
  extra: Range | null;
}

export interface PuskesmasOutlook {
  id: string;
  name: string;
  district_code: string;
  baseline_visits_per_day: number;
  baseline_source: 'user' | 'default_kota' | 'default_kabupaten';
  days: PuskesmasDay[];
  window_extra: Range;
  complete: boolean;
}

export interface PriorityEntry {
  district_code: string;
  district_name: string;
  rank: number | null;
  mean_change: Range | null;
  window_extra: Range;
  haze_days: number;
  fire_haze_days: number;
  puskesmas_count: number;
  complete: boolean;
}

export interface OutlookOutput {
  method: {
    citation: string;
    doi: string;
    haze_pm10_ugm3: number;
    rr_source: string;
    baseline_source: string;
    limits: string[];
  };
  days: string[];
  window_start: string;
  districts: DistrictOutlook[];
  puskesmas: PuskesmasOutlook[];
  priority: PriorityEntry[];
}

export interface CleanAirInput {
  floor_area_m2: number;
  ceiling_height_m: number;
  unit_cadr_m3h: number;
  target_ach?: number | null;
  outdoor_pm25_ugm3?: number | null;
}

/** A low-high span that is not a confidence interval. */
export interface Span {
  low: number;
  high: number;
}

export interface CleanAirOutput {
  volume_m3: number;
  target_ach: number;
  cadr_needed_m3h: number;
  unit_cadr_m3h: number;
  units: number;
  delivered_ach: number;
  source: string;
  indoor: {
    outdoor_pm25_ugm3: number;
    without_cleaner_ugm3: Span;
    with_cleaner_ugm3: Span;
    source: string;
  } | null;
  presets: { name: string; cadr_m3h: number; source: string }[];
}

export interface FireCountOutput {
  days: string[];
  counts: Record<string, number[]>;
  outside_districts: number;
  outside_days: number;
}

export interface LocateOutput {
  located: ({ district_code: string; snapped: boolean } | null)[];
}

export type Lang = 'id' | 'en';

export interface BriefInput {
  outlook: OutlookInput;
  lang: Lang;
  region_name: string;
  mode: 'live' | 'replay' | 'forecast';
  data_times?: { source: string; time: string }[];
  errors?: { source: string; error: string }[];
  top?: number;
  link?: string | null;
}

export interface BriefOutput {
  lang: Lang;
  title: string;
  text: string;
  window_start: string;
  window_end: string;
  ranked: number;
  complete: boolean;
}
