// Bahasa Indonesia first, English second (product steering).

export type Lang = 'id' | 'en';

const STRINGS = {
  tagline: { id: 'Peramal jelaga untuk puskesmas', en: 'The soot-sayer for community clinics' },
  intro: {
    id: 'Satelit melihat api. Aplikasi udara melihat asap. Sootsayer memperkirakan puskesmas mana yang akan dipenuhi pasien sesak, lima hari ke depan.',
    en: 'Satellites see the fire. Air apps see the smoke. Sootsayer estimates which puskesmas will fill with breathless patients over the next five days.',
  },
  enter: { id: 'Masuk ke Kalimantan', en: 'Fly to Kalimantan' },
  modeLive: { id: 'Langsung', en: 'Live' },
  modeReplay: { id: 'Putar ulang Okt 2026', en: 'Replay Oct 2026' },
  loading: { id: 'Memuat data terbuka…', en: 'Loading open data…' },
  sources: { id: 'Sumber data', en: 'Data sources' },
  updated: { id: 'diperbarui', en: 'updated' },
  failed: { id: 'gagal', en: 'failed' },
  sourceFailed: { id: 'Sumber gagal: {source}. Hari tanpa data ditandai “data kosong”.', en: 'Source failed: {source}. Days without data are marked “no data”.' },
  today: { id: 'hari ini', en: 'today' },
  forecast: { id: 'prakiraan', en: 'forecast' },
  history: { id: 'riwayat', en: 'history' },
  play: { id: 'Putar', en: 'Play' },
  pause: { id: 'Jeda', en: 'Pause' },
  status_clear: { id: 'Bersih', en: 'Clear' },
  status_haze: { id: 'Hari kabut', en: 'Haze day' },
  status_fire_haze: { id: 'Kabut berapi', en: 'Fire-haze day' },
  status_unknown: { id: 'Data kosong', en: 'No data' },
  daysInRow: { id: '{n} hari berturut-turut', en: '{n} days in a row' },
  profile_kota: { id: 'Profil kota (Palangka Raya)', en: 'City profile (Palangka Raya)' },
  profile_kabupaten: { id: 'Profil kabupaten (Pulang Pisau)', en: 'Regency profile (Pulang Pisau)' },
  priorityTitle: { id: 'Prioritas posko & rumah oksigen', en: 'Priority for posko & oxygen houses' },
  priorityHint: {
    id: 'Diurutkan menurut perkiraan perubahan kunjungan pernapasan selama {n} hari mulai {date}.',
    en: 'Ranked by the expected change in respiratory visits over {n} days from {date}.',
  },
  noHaze: {
    id: 'Tidak ada hari kabut di jendela ini. Buka “Putar ulang Okt 2026” untuk melihat puncak episode asap.',
    en: 'No haze days in this window. Open “Replay Oct 2026” to see the peak of the smoke episode.',
  },
  pkmShort: { id: 'pkm', en: 'clinics' },
  hazeDaysShort: { id: '{n}× hari kabut', en: '{n} haze days' },
  fireHazeDaysShort: { id: '{n}× kabut berapi', en: '{n} with local fires' },
  layerImagery: { id: 'Citra NASA', en: 'NASA image' },
  layerSmoke: { id: 'Asap', en: 'Smoke' },
  layerFires: { id: 'Api', en: 'Fires' },
  layerPillars: { id: 'Pilar', en: 'Pillars' },
  layerDistricts: { id: 'Kabupaten', en: 'Districts' },
  incomplete: { id: 'data belum lengkap', en: 'incomplete data' },
  change: { id: 'Perubahan kunjungan pernapasan', en: 'Change in respiratory visits' },
  range95: { id: 'rentang 95%', en: '95% range' },
  expected: { id: 'Perkiraan kunjungan pernapasan per hari', en: 'Expected respiratory visits per day' },
  extraWindow: { id: 'Tambahan kunjungan, {n} hari', en: 'Extra visits over {n} days' },
  windowDays: { id: 'rata-rata {n} hari', en: 'mean over {n} days' },
  baseline: { id: 'Kunjungan pernapasan normal per hari', en: 'Usual respiratory visits per day' },
  baselineDefault: {
    id: 'Nilai bawaan dari studi (Tabel 2). Ganti dengan catatan puskesmas Anda.',
    en: 'Study default (Table 2). Replace it with your own records.',
  },
  baselineUser: { id: 'Nilai dari Anda (tersimpan di browser ini).', en: 'Your value (saved in this browser).' },
  shiftNote: {
    id: 'Angka di bawah 0% di profil kota berarti pasien bergeser dari puskesmas ke RS, posko, atau rumah oksigen. Itu bukan kabar baik.',
    en: 'Below 0% in the city profile means patients shift away from the puskesmas to hospitals, posko, or oxygen houses. It is not good news.',
  },
  mappedPuskesmas: { id: '{n} puskesmas terpetakan di OpenStreetMap', en: '{n} puskesmas mapped in OpenStreetMap' },
  osmGap: {
    id: 'OpenStreetMap baru memuat sebagian puskesmas. Peringkat memakai perubahan relatif, jadi kabupaten tanpa puskesmas terpetakan tetap terlihat.',
    en: 'OpenStreetMap lists only some puskesmas. Ranking uses the relative change, so districts with none mapped still show up.',
  },
  cleanAir: { id: 'Ruang udara bersih', en: 'Clean-air room' },
  area: { id: 'Luas lantai (m²)', en: 'Floor area (m²)' },
  height: { id: 'Tinggi plafon (m)', en: 'Ceiling height (m)' },
  unitCadr: { id: 'CADR satu purifier (m³/jam)', en: 'CADR of one purifier (m³/h)' },
  unitCadrHint: { id: 'Lihat label alat. 1 cfm = 1,7 m³/jam.', en: 'See the device label. 1 cfm = 1.7 m³/h.' },
  cleanAirResult: {
    id: 'Butuh {units} unit untuk {ach} pertukaran udara bersih per jam ({cadr} m³/jam).',
    en: 'Needs {units} units for {ach} clean air changes per hour ({cadr} m³/h).',
  },
  limitsTitle: { id: 'Batas metode', en: 'Method limits' },
  methodSource: { id: 'Sumber metode', en: 'Method source' },
  legendSmoke: { id: 'Asap: PM2.5 model, rata-rata harian (µg/m³)', en: 'Smoke: modelled PM2.5, daily mean (µg/m³)' },
  legendWho: { id: 'Pedoman WHO 24 jam', en: 'WHO 24-hour guideline' },
  legendFires: { id: 'Titik api satelit (hari terpilih)', en: 'Satellite fire detections (selected day)' },
  legendPillars: { id: 'Pilar: perkiraan kunjungan per puskesmas', en: 'Pillars: expected visits per puskesmas' },
  imagery: { id: 'Citra satelit NASA {date}', en: 'NASA satellite image {date}' },
  imageryLatest: { id: 'citra terbaru yang tersedia', en: 'latest available image' },
  replayLabel: {
    id: 'Hindsight: memakai data model arsip, bukan prakiraan yang terbit pada hari itu.',
    en: 'Hindsight: uses archived model data, not the forecast issued on that day.',
  },
  replayNoFires: {
    id: 'Data api historis tidak dimuat (perlu FIRMS MAP_KEY saat build), jadi putar ulang memakai definisi hari kabut saja.',
    en: 'Historical fire data is not loaded (needs a FIRMS MAP_KEY at build time), so the replay uses the haze-day definition only.',
  },
  futureFires: { id: 'Hari prakiraan belum punya data api; dihitung sebagai hari kabut biasa.', en: 'Forecast days have no fire data yet; they count as plain haze days.' },
  close: { id: 'Tutup', en: 'Close' },
  clickHint: { id: 'Klik kabupaten/kota atau pilar puskesmas untuk rincian.', en: 'Click a district or a puskesmas pillar for details.' },
  pm10: { id: 'PM10 kabupaten', en: 'District PM10' },
  fireCount: { id: 'titik api', en: 'fire detections' },
  district: { id: 'Kabupaten/kota', en: 'District' },
  lang: { id: 'EN', en: 'ID' },
} as const;

export type Key = keyof typeof STRINGS;

let current: Lang = (localStorage.getItem('sootsayer.lang') as Lang) || 'id';

export function lang(): Lang {
  return current;
}

export function setLang(l: Lang): void {
  current = l;
  localStorage.setItem('sootsayer.lang', l);
  document.documentElement.lang = l;
}

export function t(key: Key, vars: Record<string, string | number> = {}): string {
  let s: string = STRINGS[key][current];
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function fmtNumber(n: number, digits = 1): string {
  return n.toLocaleString(current === 'id' ? 'id-ID' : 'en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtPercent(x: number): string {
  const v = Math.round(x * 100);
  return `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v)}%`;
}

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(current === 'id' ? 'id-ID' : 'en-GB', {
    ...opts,
    timeZone: 'UTC',
  });
}
