// Puskesmas lists as CSV: export the current list as a template, and import a
// health office's own list. Parsing is strict (rows that cannot be read are
// listed with their row number, never guessed); the file never leaves the
// browser.

import type { Puskesmas } from './types';

const MAX_ROWS = 5000;
const MAX_NAME = 120;

export interface ParsedRow {
  row: number;
  id: string | null;
  name: string;
  lat: number;
  lon: number;
  baseline: number | null;
}

/** Problem keys are i18n keys (web/src/i18n.ts); `detail` fills {detail}. */
export type CsvProblem = 'csvNoRows' | 'csvMissingCols' | 'csvTooMany' | 'csvBadName' | 'csvBadCoord' | 'csvBadBaseline';

export interface ParseResult {
  rows: ParsedRow[];
  problems: { row: number; problem: CsvProblem; detail?: string }[];
}

const ALIASES: Record<string, string[]> = {
  id: ['id', 'kode', 'code', 'osm_id'],
  name: ['name', 'nama', 'nama_puskesmas', 'puskesmas'],
  lat: ['lat', 'latitude', 'lintang'],
  lon: ['lon', 'lng', 'long', 'longitude', 'bujur'],
  baseline: ['baseline_visits_per_day', 'baseline', 'kunjungan_per_hari', 'kunjungan_pernapasan_per_hari', 'visits_per_day'],
};

function quote(v: string): string {
  return /[",;\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(list: Puskesmas[], baselines: Record<string, number>): string {
  const head = ['id', 'name', 'lat', 'lon', 'district_code', 'baseline_visits_per_day'];
  const lines = list.map((p) =>
    [p.id, p.name, String(p.lat), String(p.lon), p.district_code, String(baselines[p.id] ?? p.baseline ?? '')].map(quote).join(','),
  );
  return [head.join(','), ...lines].join('\r\n') + '\r\n';
}

/** RFC 4180-style split with quotes; `sep` is ',', ';' or a tab. */
function splitRecords(text: string, sep: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"' && field === '') {
      quoted = true;
    } else if (c === sep) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      out.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    out.push(row);
  }
  return out.filter((r) => r.some((f) => f.trim() !== ''));
}

function number(raw: string, decimalComma: boolean): number | null {
  let s = raw.trim();
  if (s === '') return null;
  if (decimalComma) s = s.replace(',', '.');
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(s)) return NaN;
  return Number(s);
}

export function parsePuskesmasCsv(text: string): ParseResult {
  const clean = text.replace(/^\uFEFF/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const counts = { ',': (firstLine.match(/,/g) ?? []).length, ';': (firstLine.match(/;/g) ?? []).length, '\t': (firstLine.match(/\t/g) ?? []).length };
  const sep = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ',') as ',' | ';' | '\t';
  // Spreadsheets in Indonesian locales write "2,5" and separate fields with ";".
  const decimalComma = sep !== ',';
  const records = splitRecords(clean, sep);
  const problems: ParseResult['problems'] = [];
  if (records.length < 2) return { rows: [], problems: [{ row: 1, problem: 'csvNoRows' }] };
  const header = records[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const col = (k: keyof typeof ALIASES) => header.findIndex((h) => ALIASES[k].includes(h));
  const idx = { id: col('id'), name: col('name'), lat: col('lat'), lon: col('lon'), baseline: col('baseline') };
  const missing = (['name', 'lat', 'lon'] as const).filter((k) => idx[k] < 0);
  if (missing.length) return { rows: [], problems: [{ row: 1, problem: 'csvMissingCols', detail: missing.join(', ') }] };
  const rows: ParsedRow[] = [];
  for (let r = 1; r < records.length; r++) {
    const rowNo = r + 1;
    if (rows.length >= MAX_ROWS) {
      problems.push({ row: rowNo, problem: 'csvTooMany', detail: String(MAX_ROWS) });
      break;
    }
    const f = records[r];
    const name = (f[idx.name] ?? '').trim();
    const lat = number(f[idx.lat] ?? '', decimalComma);
    const lon = number(f[idx.lon] ?? '', decimalComma);
    const baseline = idx.baseline >= 0 ? number(f[idx.baseline] ?? '', decimalComma) : null;
    const rawId = idx.id >= 0 ? (f[idx.id] ?? '').trim() : '';
    if (!name || name.length > MAX_NAME) {
      problems.push({ row: rowNo, problem: 'csvBadName', detail: String(MAX_NAME) });
    } else if (lat === null || lon === null || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      problems.push({ row: rowNo, problem: 'csvBadCoord' });
    } else if (baseline !== null && (!Number.isFinite(baseline) || baseline < 0 || baseline > 1000)) {
      problems.push({ row: rowNo, problem: 'csvBadBaseline' });
    } else {
      rows.push({ row: rowNo, id: /^[A-Za-z0-9:/._-]{1,60}$/.test(rawId) ? rawId : null, name, lat, lon, baseline });
    }
  }
  return { rows, problems };
}

export function download(filename: string, text: string, type = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
