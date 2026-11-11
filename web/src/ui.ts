// Panels, timeline, legend, and charts. Plain DOM, no framework.

import { fmtDate, fmtNumber, fmtPercent, t, type Key } from './i18n';
import { SMOKE_STOPS, smokeLegendCss } from './smoke';
import type {
  CleanAirOutput,
  DayStatus,
  DistrictOutlook,
  DistrictProps,
  ForecastReplayFile,
  OutlookOutput,
  Profile,
  PuskesmasOutlook,
  Range,
  ReferenceMeta,
} from './types';
import type { Dataset } from './data';

export const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing element ${sel}`);
  return el;
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export function statusLabel(s: DayStatus): string {
  return t(`status_${s}` as Key);
}

function rangeText(r: Range, unit: 'percent' | 'visits'): string {
  if (unit === 'percent') return `${fmtPercent(r.point)} <span class="muted">(${fmtPercent(r.low)} … ${fmtPercent(r.high)})</span>`;
  return `${fmtNumber(r.point)} <span class="muted">(${fmtNumber(r.low)} … ${fmtNumber(r.high)})</span>`;
}

// ---------- loading, intro, errors ----------

export function setLoading(on: boolean): void {
  const el = $('#loading');
  const introVisible = !$('#intro').classList.contains('hidden');
  el.textContent = t('loading');
  // The intro card already covers the wait; do not stack a spinner on it.
  el.classList.toggle('hidden', !on || introVisible);
}

export function showIntro(region: string, onEnter: () => void): void {
  const el = $('#intro');
  el.innerHTML = `
    <div class="intro-card">
      <h1>Sootsayer</h1>
      <p class="tagline">${esc(t('tagline'))}</p>
      <p>${esc(t('intro'))}</p>
      <button id="enter" class="primary">${esc(t('enter', { region }))}</button>
    </div>`;
  el.classList.remove('hidden');
  $('#enter').addEventListener('click', () => {
    el.classList.add('hidden');
    onEnter();
  });
}

export function renderStatus(
  ds: Dataset,
  meta: ReferenceMeta,
  imageryNote: string,
  notice: string | null = null,
  forecastNote: string | null = null,
): void {
  const errors = ds.errors
    .map((e) => `<div class="banner error">${esc(t('sourceFailed', { source: e.source }))}<br><span class="muted">${esc(e.error)}</span></div>`)
    .join('');
  const notes: string[] = notice ? [notice] : [];
  if (forecastNote) {
    // Replay as forecast: the window is what was known that morning.
    notes.push(forecastNote, t('futureFires'));
  } else if (ds.mode === 'replay') {
    notes.push(t('replayLabel'));
    if (!ds.replayFiresAvailable) notes.push(t('replayNoFires'));
  } else {
    notes.push(t('futureFires'));
  }
  const stamps = ds.stamps
    .map((s) => `<li>${esc(s.label)} · ${esc(t('updated'))} ${esc(new Date(s.when).toLocaleString())}</li>`)
    .join('');
  const refSources = meta.sources.map((s) => `<li>${esc(s.layer)}: ${esc(s.name)} (${esc(s.license)})</li>`).join('');
  // Re-rendering must not close a list the user opened.
  const open = $('#status').querySelector('details')?.open ? ' open' : '';
  $('#status').innerHTML = `
    ${errors}
    ${notes.map((n) => `<div class="banner note">${esc(n)}</div>`).join('')}
    <details${open}>
      <summary>${esc(t('sources'))}</summary>
      <ul class="sources">${stamps}<li>${esc(imageryNote)}</li>${refSources}</ul>
    </details>`;
}

// ---------- priority ----------

export function renderPriority(out: OutlookOutput, onPick: (code: string) => void, onBrief: () => void): void {
  const windowDays = out.days.filter((d) => d >= out.window_start).length;
  const ranked = out.priority.filter((p) => p.complete && p.mean_change && p.haze_days > 0).slice(0, 10);
  const incomplete = out.priority.filter((p) => !p.complete);
  const rows = ranked
    .map(
      (p) => `
      <li><button class="row" data-code="${esc(p.district_code)}">
        <span class="rank">${p.rank}</span>
        <span class="name">${esc(p.district_name)}</span>
        <span class="value">${rangeText(p.mean_change as Range, 'percent')}</span>
        <span class="meta">${esc(t('hazeDaysShort', { n: p.haze_days }))}${p.fire_haze_days ? `, ${esc(t('fireHazeDaysShort', { n: p.fire_haze_days }))}` : ''} · ${p.puskesmas_count} ${esc(t('pkmShort'))}</span>
      </button></li>`,
    )
    .join('');
  const inc = incomplete.length
    ? `<p class="muted small">${incomplete.length} ${esc(t('incomplete'))}: ${incomplete
        .slice(0, 6)
        .map((p) => esc(p.district_name))
        .join(', ')}${incomplete.length > 6 ? '…' : ''}</p>`
    : '';
  $('#priority').innerHTML = `
    <h2>${esc(t('priorityTitle'))}</h2>
    <p class="muted small">${esc(t('priorityHint', { n: windowDays, date: fmtDate(out.window_start) }))}</p>
    ${ranked.length ? `<ol class="priority">${rows}</ol>` : `<p class="muted">${esc(t('noHaze'))}</p>`}
    ${inc}
    <button id="brief-open" class="secondary">✉ ${esc(t('briefButton'))}</button>
    <p class="muted small">${esc(t('osmGap'))}</p>`;
  $('#priority')
    .querySelectorAll<HTMLButtonElement>('button.row')
    .forEach((b) => b.addEventListener('click', () => onPick(b.dataset.code as string)));
  $('#brief-open').addEventListener('click', onBrief);
}

// ---------- forecast check (replay as forecast) ----------

export function renderViews(show: boolean, view: 'hindsight' | 'forecast', onView: (v: 'hindsight' | 'forecast') => void): void {
  const el = $('#views');
  el.classList.toggle('hidden', !show);
  if (!show) {
    el.innerHTML = '';
    return;
  }
  el.setAttribute('aria-label', t('viewLabel'));
  el.innerHTML = `
    <button type="button" data-view="hindsight" class="${view === 'hindsight' ? 'active' : ''}">${esc(t('viewHindsight'))}</button>
    <button type="button" data-view="forecast" class="${view === 'forecast' ? 'active' : ''}">${esc(t('viewForecast'))}</button>`;
  el.querySelectorAll<HTMLButtonElement>('button[data-view]').forEach((b) =>
    b.addEventListener('click', () => onView(b.dataset.view as 'hindsight' | 'forecast')),
  );
}

export function renderCheck(fc: ForecastReplayFile | null): void {
  const el = $('#check');
  if (!fc) {
    el.innerHTML = '';
    return;
  }
  const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);
  const rows = fc.check.leads
    .map((r) => {
      const events = r.hits + r.misses;
      const label = r.lead_day === 0 ? t('checkLead0') : t('checkLead', { n: r.lead_day });
      const caught = events ? t('checkCaught', { hits: r.hits, events, pct: pct(r.pod) }) : t('checkNoEvents');
      return `<tr><td>${esc(label)}</td><td>${esc(caught)}</td><td>${esc(t('checkFalse', { n: r.false_alarms, pct: pct(r.far) }))}</td></tr>`;
    })
    .join('');
  const day = (iso: string) => String(Number(iso.slice(8, 10)));
  const first = fc.issue_dates[0];
  const last = fc.issue_dates[fc.issue_dates.length - 1];
  el.innerHTML = `
    <h3>${esc(t('checkTitle'))}</h3>
    <p class="muted small">${esc(t('checkHint', { from: day(first), to: day(last) }))}</p>
    <table class="days check"><tbody>${rows}</tbody></table>
    <p class="muted small">${esc(t('checkDefs', { threshold: fmtNumber(fc.check.threshold_pm10_ugm3, 0) }))}</p>
    <p class="muted small">${esc(t('checkSource'))}</p>`;
}

// ---------- puskesmas list (OSM or the user's own CSV) ----------

export function renderPuskesmasList(
  source: { kind: 'osm'; n: number } | { kind: 'user'; n: number; file: string; date: string },
  message: { ok: string | null; problems: string[] },
  on: { exportCsv: () => void; importCsv: (file: File) => void; reset: () => void },
): void {
  const el = $('#pkm-list');
  const wasOpen = el.querySelector<HTMLDetailsElement>('details.pkm-list')?.open ?? false;
  const label =
    source.kind === 'osm'
      ? t('pkmSourceOsm', { n: source.n })
      : t('pkmSourceUser', { n: source.n, file: source.file, date: fmtDate(source.date, { day: 'numeric', month: 'short', year: 'numeric' }) });
  const problems = message.problems.length
    ? `<details class="problems" open><summary>${esc(t('csvRejected', { n: message.problems.length }))}</summary><ul>${message.problems
        .slice(0, 30)
        .map((p) => `<li>${esc(p)}</li>`)
        .join('')}${message.problems.length > 30 ? '<li>…</li>' : ''}</ul></details>`
    : '';
  el.innerHTML = `
    <details class="pkm-list">
      <summary>${esc(t('pkmListTitle'))} · <span class="muted">${esc(label)}</span></summary>
      <p class="muted small">${esc(t('csvHelp'))}</p>
      <div class="buttons">
        <button id="csv-export" class="secondary">⬇ ${esc(t('csvExport'))}</button>
        <label class="secondary file">⬆ ${esc(t('csvImport'))}<input id="csv-import" type="file" accept=".csv,.txt,text/csv"></label>
        ${source.kind === 'user' ? `<button id="csv-reset" class="secondary">${esc(t('csvReset'))}</button>` : ''}
      </div>
      <p class="muted small">${esc(t('csvPrivacy'))}</p>
      ${message.ok ? `<div class="banner note">${esc(message.ok)}</div>` : ''}
      ${problems}
    </details>`;
  if (wasOpen || message.ok || message.problems.length) el.querySelector('details')?.setAttribute('open', '');
  $('#csv-export').addEventListener('click', on.exportCsv);
  el.querySelector('#csv-reset')?.addEventListener('click', on.reset);
  const input = $<HTMLInputElement>('#csv-import');
  input.addEventListener('change', () => {
    const f = input.files?.[0];
    if (f) on.importCsv(f);
  });
}

// ---------- briefing ----------

export function renderBrief(text: string, title: string, onClose: () => void): void {
  const el = openPanel(
    `<h2>${esc(t('briefTitle'))}</h2>
     <p class="muted small">${esc(t('briefNote'))}</p>
     <div class="buttons">
       <button id="brief-copy" class="secondary">${esc(t('briefCopy'))}</button>
       <a class="secondary button" href="https://wa.me/?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">${esc(t('briefWhatsApp'))}</a>
       <button id="brief-download" class="secondary">${esc(t('briefDownload'))}</button>
       <button id="brief-print" class="secondary">${esc(t('briefPrint'))}</button>
     </div>
     <pre class="brief" id="brief-text">${esc(text)}</pre>`,
    onClose,
  );
  el.classList.add('brief-panel');
  const copy = el.querySelector<HTMLButtonElement>('#brief-copy');
  copy?.addEventListener('click', () => {
    void navigator.clipboard.writeText(text).then(() => {
      copy.textContent = t('briefCopied');
    });
  });
  el.querySelector('#brief-download')?.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([text + '\n'], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase()}.txt`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  el.querySelector('#brief-print')?.addEventListener('click', () => window.print());
}

// ---------- timeline ----------

export function renderTimeline(
  ds: Dataset,
  selected: string,
  dayStatus: (date: string) => DayStatus,
  playing: boolean,
  onSelect: (date: string) => void,
  onPlay: () => void,
): void {
  const chips = ds.selectable
    .map((d) => {
      const s = dayStatus(d);
      const kind = ds.mode === 'live' ? (d < ds.anchor ? 'past' : d === ds.anchor ? 'today' : 'future') : 'past';
      return `<button class="chip ${kind} ${d === selected ? 'selected' : ''}" data-date="${d}" title="${esc(statusLabel(s))}">
        <span class="dot ${s}"></span>${esc(fmtDate(d))}${kind === 'today' ? `<em>${esc(t('today'))}</em>` : ''}</button>`;
    })
    .join('');
  const el = $('#timeline');
  el.innerHTML = `
    <button id="play" class="play">${playing ? '⏸ ' + esc(t('pause')) : '▶ ' + esc(t('play'))}</button>
    <div class="chips">${chips}</div>`;
  el.querySelectorAll<HTMLButtonElement>('.chip').forEach((b) => b.addEventListener('click', () => onSelect(b.dataset.date as string)));
  $('#play').addEventListener('click', onPlay);
  el.querySelector('.chip.selected')?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

// ---------- legend ----------

export type LayerToggles = Record<'imagery' | 'night' | 'smoke' | 'fires' | 'pillars' | 'districts', boolean>;

/** Colour stops of the district and pillar fill (change in visits), same as CHANGE_RAMP in map.ts. */
const CHANGE_STOPS: [number, string][] = [
  [-0.3, '#5aa9e6'],
  [0, '#ddd6c6'],
  [0.3, '#f6c453'],
  [0.6, '#f08a24'],
  [0.9, '#d6452b'],
];

export function renderLegend(
  imageryNote: string,
  firesShown: number,
  selected: string,
  layers: LayerToggles,
  onToggle: (group: keyof LayerToggles, on: boolean) => void,
): void {
  const n = SMOKE_STOPS.length - 1;
  const ticks = SMOKE_STOPS.map(
    ([v], i) =>
      `<span style="left:${(i / n) * 100}%"${v === 15 ? ` class="who" title="${esc(t('legendWhoTitle'))}"` : ''}>${v}${v === 15 ? ` ${esc(t('legendWhoTick'))}` : ''}</span>`,
  ).join('');
  const toggle = (g: keyof LayerToggles, label: string) =>
    `<label class="toggle"><input type="checkbox" data-layer="${g}" ${layers[g] ? 'checked' : ''}>${esc(label)}</label>`;
  const ramp = `linear-gradient(90deg, ${CHANGE_STOPS.map(([, c], i) => `${c} ${(i / (CHANGE_STOPS.length - 1)) * 100}%`).join(', ')})`;
  const statuses = (['clear', 'haze', 'fire_haze', 'unknown'] as DayStatus[])
    .map((s) => `<span class="nowrap"><span class="dot ${s}"></span>${esc(statusLabel(s))}</span>`)
    .join('');
  const el = $('#legend');
  el.innerHTML = `
    <div class="legend-smoke">
      <div class="label">${esc(t('legendSmoke'))} · ${esc(fmtDate(selected, { day: 'numeric', month: 'long', year: 'numeric' }))}</div>
      <div class="bar" style="background:${smokeLegendCss()}"></div>
      <div class="ticks">${ticks}</div>
    </div>
    <div class="legend-keys">
      <span class="key statuses" title="${esc(t('helpTimeline'))}">${statuses}</span>
      <span class="key" title="${esc(t('helpColour'))}"><span class="ramp" style="background:${ramp}"></span><span class="muted">${fmtPercent(CHANGE_STOPS[0][0])} … ${fmtPercent(
        CHANGE_STOPS[CHANGE_STOPS.length - 1][0],
      )}</span> ${esc(t('legendChange'))}</span>
      <span class="key"><span class="sw fire"></span>${esc(t('legendFires'))}: ${fmtNumber(firesShown, 0)}</span>
      <span class="key"><span class="sw pillar"></span>${esc(t('legendPillars'))}</span>
      <span class="key muted">${esc(imageryNote)}</span>
      <span class="toggles">${toggle('imagery', t('layerImagery'))}${toggle('night', t('layerNight'))}${toggle('smoke', t('layerSmoke'))}${toggle(
        'fires',
        t('layerFires'),
      )}${toggle('pillars', t('layerPillars'))}${toggle('districts', t('layerDistricts'))}</span>
    </div>`;
  el.querySelectorAll<HTMLInputElement>('input[data-layer]').forEach((i) =>
    i.addEventListener('change', () => onToggle(i.dataset.layer as keyof LayerToggles, i.checked)),
  );
}

// ---------- charts ----------

export function rangeChart(
  days: string[],
  values: (Range | null)[],
  opts: { unit: 'percent' | 'visits'; windowStart: string; selected: string; baseline?: number },
): string {
  const W = 360;
  const H = 150;
  const P = { l: 40, r: 10, t: 10, b: 22 };
  const known = values.filter((v): v is Range => v !== null);
  if (!known.length) return `<p class="muted">${esc(t('status_unknown'))}</p>`;
  const lo = Math.min(...known.map((v) => v.low), opts.unit === 'percent' ? 0 : opts.baseline ?? 0);
  const hi = Math.max(...known.map((v) => v.high), opts.unit === 'percent' ? 0 : opts.baseline ?? 0);
  const pad = (hi - lo) * 0.08 || 0.1;
  const y0 = lo - pad;
  const y1 = hi + pad;
  const x = (i: number) => P.l + (i / Math.max(1, days.length - 1)) * (W - P.l - P.r);
  const y = (v: number) => H - P.b - ((v - y0) / (y1 - y0)) * (H - P.t - P.b);
  const segs: string[] = [];
  const bands: string[] = [];
  let cur: { i: number; v: Range }[] = [];
  const flush = () => {
    if (cur.length) {
      const top = cur.map((c) => `${x(c.i).toFixed(1)},${y(c.v.high).toFixed(1)}`);
      const bot = cur
        .slice()
        .reverse()
        .map((c) => `${x(c.i).toFixed(1)},${y(c.v.low).toFixed(1)}`);
      bands.push(`<polygon class="band" points="${[...top, ...bot].join(' ')}"/>`);
      segs.push(`<polyline class="line" points="${cur.map((c) => `${x(c.i).toFixed(1)},${y(c.v.point).toFixed(1)}`).join(' ')}"/>`);
    }
    cur = [];
  };
  values.forEach((v, i) => (v ? cur.push({ i, v }) : flush()));
  flush();
  const ref = opts.unit === 'percent' ? 0 : opts.baseline;
  const refLine =
    ref === undefined ? '' : `<line class="ref" x1="${P.l}" x2="${W - P.r}" y1="${y(ref).toFixed(1)}" y2="${y(ref).toFixed(1)}"/>`;
  const wi = days.indexOf(opts.windowStart);
  const si = days.indexOf(opts.selected);
  const windowRect =
    wi >= 0 ? `<rect class="window" x="${x(wi).toFixed(1)}" y="${P.t}" width="${(x(days.length - 1) - x(wi)).toFixed(1)}" height="${H - P.t - P.b}"/>` : '';
  const sel = si >= 0 ? `<line class="sel" x1="${x(si).toFixed(1)}" x2="${x(si).toFixed(1)}" y1="${P.t}" y2="${H - P.b}"/>` : '';
  const fmtY = (v: number) => (opts.unit === 'percent' ? fmtPercent(v) : fmtNumber(v));
  const yTicks = [y0 + pad, (y0 + y1) / 2, y1 - pad]
    .map((v) => `<text class="tick" x="${P.l - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${fmtY(v)}</text>`)
    .join('');
  const xTicks = [0, Math.floor((days.length - 1) / 2), days.length - 1]
    .map((i) => `<text class="tick" x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(fmtDate(days[i]))}</text>`)
    .join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${windowRect}${bands.join('')}${refLine}${segs.join('')}${sel}${yTicks}${xTicks}</svg>`;
}

// ---------- detail panels ----------

function limitsBlock(out: OutlookOutput): string {
  return `
    <details class="limits">
      <summary>${esc(t('limitsTitle'))}</summary>
      <ul>${out.method.limits.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      <p class="small">${esc(t('methodSource'))}: ${esc(out.method.citation)}
        <a href="https://doi.org/${esc(out.method.doi)}" target="_blank" rel="noopener">doi:${esc(out.method.doi)}</a>.
        ${esc(out.method.rr_source)}.</p>
    </details>`;
}

export function openPanel(html: string, onClose: () => void): HTMLElement {
  const el = $('#right');
  el.innerHTML = `<button class="close" aria-label="${esc(t('close'))}">×</button>${html}`;
  el.classList.remove('hidden');
  el.querySelector('.close')?.addEventListener('click', () => {
    el.classList.add('hidden');
    onClose();
  });
  return el;
}

export function closePanel(): void {
  $('#right').classList.add('hidden');
}

/** "How to read this map": one line per feature, in the current language. */
export function renderHelp(withForecast: boolean, tourUrl: string, onClose: () => void): void {
  const keys: Key[] = ['helpGlobe', 'helpColour', 'helpPillars', 'helpTimeline', 'helpPriority', 'helpBrief', 'helpModes'];
  if (withForecast) keys.push('helpForecast');
  keys.push('helpData', 'helpLimits');
  openPanel(
    `<h2>${esc(t('helpTitle'))}</h2>
     <ol class="help">${keys.map((k) => `<li>${esc(t(k))}</li>`).join('')}</ol>
     <a class="secondary button" href="${esc(tourUrl)}">▶ ${esc(t('helpTour'))}</a>`,
    onClose,
  );
}

export function renderDistrictPanel(
  out: OutlookOutput,
  d: DistrictOutlook,
  props: DistrictProps,
  selected: string,
  onProfile: (p: Profile) => void,
  onClose: () => void,
): void {
  const day = d.days.find((x) => x.date === selected);
  const win = d.days.filter((x) => x.in_window);
  const change = d.days.map((x) => (x.rr ? { point: x.rr.point - 1, low: x.rr.low - 1, high: x.rr.high - 1 } : null));
  const rows = win
    .map(
      (x) => `<tr class="${x.date === selected ? 'sel' : ''}">
        <td>${esc(fmtDate(x.date))}</td>
        <td><span class="dot ${x.status}"></span>${esc(statusLabel(x.status))}${x.duration_days ? ` <span class="muted">(${x.duration_days})</span>` : ''}</td>
        <td>${x.pm10_ugm3 === null ? '—' : fmtNumber(x.pm10_ugm3, 0)}</td>
        <td>${x.fire_count === null ? '—' : x.fire_count}</td>
        <td>${x.rr ? fmtPercent(x.rr.point - 1) : '—'}</td></tr>`,
    )
    .join('');
  const el = openPanel(
    `<h2>${esc(d.name)}</h2>
     <p class="muted">${esc(props.province)} · ${esc(t('mappedPuskesmas', { n: props.puskesmas_mapped }))}</p>
     <label class="field">${esc(t('district'))}:
       <select id="profile">
         <option value="kabupaten" ${d.profile === 'kabupaten' ? 'selected' : ''}>${esc(t('profile_kabupaten'))}</option>
         <option value="kota" ${d.profile === 'kota' ? 'selected' : ''}>${esc(t('profile_kota'))}</option>
       </select></label>
     ${day ? `<div class="big"><span class="dot ${day.status}"></span>${esc(statusLabel(day.status))}${day.duration_days ? ` · ${esc(t('daysInRow', { n: day.duration_days }))}` : ''}</div>` : ''}
     ${day?.rr ? `<div class="kpi"><div class="label">${esc(t('change'))}, ${esc(fmtDate(selected))}</div><div class="value">${rangeText({ point: day.rr.point - 1, low: day.rr.low - 1, high: day.rr.high - 1 }, 'percent')}</div></div>` : ''}
     ${d.window_mean_change ? `<div class="kpi"><div class="label">${esc(t('change'))} · ${esc(t('windowDays', { n: win.length }))}</div><div class="value">${rangeText(d.window_mean_change, 'percent')}</div></div>` : ''}
     ${rangeChart(d.days.map((x) => x.date), change, { unit: 'percent', windowStart: out.window_start, selected })}
     ${d.profile === 'kota' ? `<p class="note">${esc(t('shiftNote'))}</p>` : ''}
     <table class="days"><thead><tr><th></th><th></th><th>PM10</th><th>🔥</th><th>Δ</th></tr></thead><tbody>${rows}</tbody></table>
     ${limitsBlock(out)}`,
    onClose,
  );
  el.querySelector<HTMLSelectElement>('#profile')?.addEventListener('change', (e) => onProfile((e.target as HTMLSelectElement).value as Profile));
}

function osmEditUrl(id: string): string | null {
  const m = /^osm:(node|way|relation)\/(\d+)$/.exec(id);
  return m ? `https://www.openstreetmap.org/edit?${m[1]}=${m[2]}` : null;
}

export function renderPuskesmasPanel(
  out: OutlookOutput,
  p: PuskesmasOutlook,
  d: DistrictOutlook,
  selected: string,
  onBaseline: (v: number | null) => void,
  cleanAir: (area: number, height: number, unitCadr: number) => CleanAirOutput | string,
  onClose: () => void,
): void {
  const day = p.days.find((x) => x.date === selected);
  const windowDays = p.days.filter((x) => x.in_window).length;
  const edit = osmEditUrl(p.id);
  const origin = edit
    ? `<a href="${esc(edit)}" target="_blank" rel="noopener">${esc(t('osmEdit'))}</a>`
    : `<span>${esc(t('pkmUser'))}</span>`;
  const el = openPanel(
    `<h2>${esc(p.name)}</h2>
     <p class="muted">${esc(d.name)} · ${esc(t(`profile_${d.profile}` as Key))} · ${origin}</p>
     ${day?.expected ? `<div class="kpi"><div class="label">${esc(t('expected'))}, ${esc(fmtDate(selected))}</div><div class="value">${rangeText(day.expected, 'visits')}</div></div>` : `<div class="kpi"><div class="value">${esc(t('status_unknown'))}</div></div>`}
     <div class="kpi"><div class="label">${esc(t('extraWindow', { n: windowDays }))}</div><div class="value">${rangeText(p.window_extra, 'visits')}</div></div>
     ${rangeChart(p.days.map((x) => x.date), p.days.map((x) => x.expected), { unit: 'visits', windowStart: out.window_start, selected, baseline: p.baseline_visits_per_day })}
     <label class="field">${esc(t('baseline'))}
       <input id="baseline" type="number" min="0" step="0.1" value="${p.baseline_visits_per_day}"></label>
     <p class="muted small">${esc(p.baseline_source === 'user' ? t('baselineUser') : t('baselineDefault'))}</p>
     ${d.profile === 'kota' ? `<p class="note">${esc(t('shiftNote'))}</p>` : ''}
     <h3>${esc(t('cleanAir'))}</h3>
     <div class="grid3">
       <label class="field">${esc(t('area'))}<input id="ca-area" type="number" min="1" step="1" value="48"></label>
       <label class="field">${esc(t('height'))}<input id="ca-height" type="number" min="2" step="0.1" value="3"></label>
       <label class="field">${esc(t('unitCadr'))}<input id="ca-cadr" type="number" min="10" step="10" value="300"></label>
     </div>
     <p class="muted small">${esc(t('unitCadrHint'))} <button id="ca-crbox" class="link"></button></p>
     <div id="ca-out" class="kpi"></div>
     <div id="ca-indoor"></div>
     ${limitsBlock(out)}`,
    onClose,
  );
  const input = el.querySelector<HTMLInputElement>('#baseline');
  input?.addEventListener('change', () => {
    const v = Number(input.value);
    onBaseline(input.value.trim() === '' || !Number.isFinite(v) || v < 0 ? null : v);
  });
  const cadrInput = el.querySelector('#ca-cadr') as HTMLInputElement;
  const crButton = el.querySelector('#ca-crbox') as HTMLButtonElement;
  let crBox: CleanAirOutput['presets'][number] | undefined;
  const update = () => {
    const area = Number((el.querySelector('#ca-area') as HTMLInputElement).value);
    const height = Number((el.querySelector('#ca-height') as HTMLInputElement).value);
    const cadr = Number(cadrInput.value);
    const res = cleanAir(area, height, cadr);
    const box = el.querySelector('#ca-out') as HTMLElement;
    const indoorBox = el.querySelector('#ca-indoor') as HTMLElement;
    if (typeof res === 'string') {
      box.innerHTML = `<span class="muted">${esc(res)}</span>`;
      indoorBox.innerHTML = '';
      return;
    }
    crBox = res.presets[0];
    crButton.textContent = crBox ? `${t('crBox')}: ${fmtNumber(crBox.cadr_m3h, 0)} m³/h` : '';
    const usingCr = crBox !== undefined && Math.abs(cadr - crBox.cadr_m3h) < 0.5;
    box.innerHTML = `<div class="value">${res.units} ×</div><div class="small">${esc(
      t('cleanAirResult', { units: res.units, ach: fmtNumber(res.target_ach, 0), cadr: fmtNumber(res.cadr_needed_m3h, 0) }),
    )}</div><div class="muted small">${esc(res.source)}</div>${usingCr && crBox ? `<div class="muted small">${esc(crBox.source)}</div>` : ''}`;
    const i = res.indoor;
    const span = (s: { low: number; high: number }) => `${fmtNumber(s.low, 0)} … ${fmtNumber(s.high, 0)} µg/m³`;
    indoorBox.innerHTML = i
      ? `<h3>${esc(t('indoorTitle', { date: fmtDate(selected) }))}</h3>
         <table class="days indoor"><tbody>
           <tr><td>${esc(t('indoorOutdoor'))}</td><td>${fmtNumber(i.outdoor_pm25_ugm3, 0)} µg/m³</td></tr>
           <tr><td>${esc(t('indoorWithout'))}</td><td>${span(i.without_cleaner_ugm3)}</td></tr>
           <tr><td>${esc(t('indoorWith'))}</td><td>${span(i.with_cleaner_ugm3)}</td></tr>
         </tbody></table>
         <p class="muted small">${esc(t('indoorNote'))}</p>
         <p class="muted small">${esc(i.source)}</p>`
      : `<p class="muted small">${esc(t('indoorUnknown'))}</p>`;
  };
  crButton.addEventListener('click', () => {
    if (!crBox) return;
    cadrInput.value = String(crBox.cadr_m3h);
    update();
  });
  el.querySelectorAll('#ca-area, #ca-height, #ca-cadr').forEach((i) => i.addEventListener('input', update));
  update();
}
