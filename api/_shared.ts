// Helpers shared by the edge functions. Files starting with "_" are not routes.

export const KALIMANTAN_BBOX = { west: 108.6, south: -4.3, east: 119.2, north: 4.4 } as const;

export function json(body: unknown, init: { status?: number; cache?: string } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': init.cache ?? 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/** A named failure the UI can show: which source failed and why. */
export function sourceError(source: string, err: unknown, status = 502): Response {
  const message = err instanceof Error ? err.message : String(err);
  return json({ error: message, source }, { status, cache: 'no-store' });
}

export function clampInt(raw: string | null, min: number, max: number, fallback: number): number {
  const n = raw === null ? NaN : Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Today's date in Indonesia's western time zone (UTC+7), as YYYY-MM-DD. */
export function todayWib(now = new Date()): string {
  return new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

/** Convert a FIRMS UTC acquisition date + HHMM time into a UTC+7 date. */
export function utcToWibDate(dateUtc: string, hhmm: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateUtc);
  if (!m) return null;
  const t = hhmm.padStart(4, '0');
  const hh = Number(t.slice(0, 2));
  const mm = Number(t.slice(2, 4));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hh, mm) + 7 * 3600_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * fetch with a timeout and one retry on network errors or 429/5xx, because
 * the public sources occasionally drop a connection.
 */
export async function fetchWithTimeout(url: string, ms: number, init: RequestInit = {}, tries = 2): Promise<Response> {
  let last: unknown;
  for (let attempt = 0; attempt < tries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      if (res.status === 429 || res.status >= 500) {
        last = new Error(`HTTP ${res.status}`);
      } else {
        return res;
      }
    } catch (e) {
      last = e;
    } finally {
      clearTimeout(timer);
    }
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
  throw last instanceof Error ? last : new Error(String(last));
}
