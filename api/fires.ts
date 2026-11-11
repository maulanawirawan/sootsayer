// GET /api/fires?range=7d   (24h | 48h | 7d)
// NASA FIRMS VIIRS NOAA-20 near-real-time detections for Southeast Asia,
// filtered to Kalimantan. FIRMS does not send CORS headers, so the browser
// cannot read it directly; this function relays and trims it (2 MB -> ~100 kB).

import { KALIMANTAN_BBOX, fetchWithTimeout, json, sourceError, utcToWibDate } from './_shared.js';

const SOURCE = 'NASA FIRMS';
const RANGES = new Set(['24h', '48h', '7d']);

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const range = url.searchParams.get('range') ?? '7d';
  if (!RANGES.has(range)) return json({ error: 'range must be 24h, 48h or 7d', source: SOURCE }, { status: 400 });
  const csvUrl = `https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_SouthEast_Asia_${range}.csv`;
  try {
    const res = await fetchWithTimeout(csvUrl, 25_000, { headers: { 'User-Agent': 'sootsayer/0.1' } });
    if (!res.ok) throw new Error(`FIRMS HTTP ${res.status}`);
    const text = await res.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lines.length === 0) throw new Error('FIRMS returned an empty file');
    const header = lines[0].split(',');
    const col = (name: string) => {
      const i = header.indexOf(name);
      if (i < 0) throw new Error(`FIRMS CSV has no '${name}' column`);
      return i;
    };
    const [iLat, iLon, iDate, iTime, iFrp, iConf, iDn] = [
      col('latitude'), col('longitude'), col('acq_date'), col('acq_time'), col('frp'), col('confidence'), col('daynight'),
    ];
    const { west, south, east, north } = KALIMANTAN_BBOX;
    const rows: (string | number | null)[][] = [];
    let minDate = '9999-99-99';
    let maxDate = '0000-00-00';
    for (let k = 1; k < lines.length; k++) {
      const c = lines[k].split(',');
      const lat = Number(c[iLat]);
      const lon = Number(c[iLon]);
      if (!(lon >= west && lon <= east && lat >= south && lat <= north)) continue;
      const date = utcToWibDate(c[iDate], c[iTime]);
      if (!date) continue;
      if (date < minDate) minDate = date;
      if (date > maxDate) maxDate = date;
      const frp = Number(c[iFrp]);
      rows.push([
        Math.round(lon * 1e4) / 1e4,
        Math.round(lat * 1e4) / 1e4,
        date,
        c[iTime].padStart(4, '0'),
        Number.isFinite(frp) ? frp : null,
        c[iConf],
        c[iDn],
      ]);
    }
    return json(
      {
        generated_at: new Date().toISOString(),
        source: 'NASA FIRMS, VIIRS NOAA-20 near real-time (C2), Southeast Asia',
        range,
        columns: ['lon', 'lat', 'date_wib', 'time_utc', 'frp_mw', 'confidence', 'daynight'],
        dates: rows.length ? [minDate, maxDate] : [],
        count: rows.length,
        rows,
      },
      { cache: 'public, s-maxage=1800, stale-while-revalidate=1800' },
    );
  } catch (err) {
    return sourceError(SOURCE, err);
  }
}
