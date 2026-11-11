// GET /api/air?past_days=14&forecast_days=5
// Copernicus CAMS global forecast (via Open-Meteo) for the Kalimantan grid,
// reduced from hourly values to daily means in UTC+7.
//
// Fair use of Open-Meteo's free tier (600 calls/min, 10,000/day):
// - only cells over land plus one ring are requested (FETCH_CELLS); the rest
//   of the grid is returned as null;
// - the edge caches the response for 6 hours (CAMS runs twice a day);
// - a warm function instance reuses its last result for 30 minutes.

import { CELLS, FETCH_CELLS } from './_grid.js';
import { clampInt, fetchWithTimeout, json, sourceError, todayWib } from './_shared.js';

const ENDPOINT = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const CHUNK = 100;
const MIN_HOURS = 4;
const SOURCE = 'CAMS (Open-Meteo)';
const MEMO_MS = 30 * 60_000;

type Hourly = { time: string[]; pm2_5: (number | null)[]; pm10: (number | null)[] };

const memo = new Map<string, { at: number; body: unknown }>();

function dailyMeans(time: string[], values: (number | null)[], days: string[]): (number | null)[] {
  const sums = new Map<string, { s: number; n: number }>();
  time.forEach((t, i) => {
    const v = values[i];
    if (v === null || v === undefined || !Number.isFinite(v)) return;
    const d = t.slice(0, 10);
    const acc = sums.get(d) ?? { s: 0, n: 0 };
    acc.s += v;
    acc.n += 1;
    sums.set(d, acc);
  });
  return days.map((d) => {
    const acc = sums.get(d);
    return acc && acc.n >= MIN_HOURS ? Math.round((acc.s / acc.n) * 10) / 10 : null;
  });
}

async function fetchChunk(cells: (readonly [number, number])[], past: number, forecast: number): Promise<Hourly[]> {
  const q = new URLSearchParams({
    latitude: cells.map((c) => c[1].toFixed(1)).join(','),
    longitude: cells.map((c) => c[0].toFixed(1)).join(','),
    hourly: 'pm2_5,pm10',
    domains: 'cams_global',
    timezone: 'Asia/Jakarta',
    cell_selection: 'nearest',
    past_days: String(past),
    forecast_days: String(forecast),
  });
  const res = await fetchWithTimeout(`${ENDPOINT}?${q}`, 25_000, { headers: { 'User-Agent': 'sootsayer/0.1' } });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as unknown;
  const list = (Array.isArray(body) ? body : [body]) as { hourly?: Hourly; error?: boolean; reason?: string }[];
  if (list.length !== cells.length) throw new Error(`Open-Meteo returned ${list.length} locations for ${cells.length}`);
  return list.map((loc) => {
    if (loc.error || !loc.hourly) throw new Error(`Open-Meteo: ${loc.reason ?? 'no hourly data'}`);
    return loc.hourly;
  });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const past = clampInt(url.searchParams.get('past_days'), 0, 31, 14);
  const forecast = clampInt(url.searchParams.get('forecast_days'), 1, 7, 5);
  const cache = 'public, s-maxage=21600, stale-while-revalidate=21600';
  const key = `${past}/${forecast}/${todayWib()}`;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < MEMO_MS) return json(hit.body, { cache });
  try {
    const wanted = FETCH_CELLS.map((i) => CELLS[i]);
    const chunks: (readonly [number, number])[][] = [];
    for (let i = 0; i < wanted.length; i += CHUNK) chunks.push(wanted.slice(i, i + CHUNK));
    const hourly: Hourly[] = [];
    // Two requests at a time keeps the function quick without bursting the API.
    for (let i = 0; i < chunks.length; i += 2) {
      const part = await Promise.all(chunks.slice(i, i + 2).map((c) => fetchChunk(c, past, forecast)));
      for (const p of part) hourly.push(...p);
    }
    const days = Array.from(new Set(hourly[0].time.map((t) => t.slice(0, 10))));
    const empty = () => days.map(() => null);
    const pm25: (number | null)[][] = CELLS.map(empty);
    const pm10: (number | null)[][] = CELLS.map(empty);
    FETCH_CELLS.forEach((cell, k) => {
      pm25[cell] = dailyMeans(hourly[k].time, hourly[k].pm2_5, days);
      pm10[cell] = dailyMeans(hourly[k].time, hourly[k].pm10, days);
    });
    const body = {
      generated_at: new Date().toISOString(),
      source: 'Copernicus CAMS global atmospheric composition forecast, via Open-Meteo (CC BY 4.0)',
      model: 'cams_global',
      timezone: 'Asia/Jakarta (UTC+7)',
      today: todayWib(),
      days,
      cells: CELLS.length,
      requested_cells: FETCH_CELLS.length,
      pm25_ugm3: pm25,
      pm10_ugm3: pm10,
    };
    memo.set(key, { at: Date.now(), body });
    return json(body, { cache });
  } catch (err) {
    return sourceError(SOURCE, err);
  }
}
