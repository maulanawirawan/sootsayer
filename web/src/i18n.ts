// Bahasa Indonesia first, English second (product steering).

export type Lang = 'id' | 'en';

const STRINGS = {
  tagline: { id: 'Peramal jelaga untuk puskesmas', en: 'The soot-sayer for community clinics' },
  intro: {
    id: 'Satelit melihat api. Aplikasi udara melihat asap. Sootsayer memperkirakan puskesmas mana yang akan dipenuhi pasien sesak, lima hari ke depan.',
    en: 'Satellites see the fire. Air apps see the smoke. Sootsayer estimates which puskesmas will fill with breathless patients over the next five days.',
  },
  enter: { id: 'Masuk ke {region}', en: 'Fly to {region}' },
  region_kalimantan: { id: 'Kalimantan', en: 'Kalimantan' },
  region_sumatra: { id: 'Sumatra', en: 'Sumatra' },
  regionLabel: { id: 'Wilayah', en: 'Region' },
  replayMissing: { id: 'Putar ulang belum tersedia untuk {region}; menampilkan mode langsung.', en: 'No replay for {region} yet; showing live mode.' },
  briefButton: { id: 'Briefing untuk Dinkes', en: 'Briefing for the health office' },
  briefTitle: { id: 'Briefing siap kirim', en: 'Ready-to-send briefing' },
  briefNote: {
    id: 'Teks dan angka ditulis oleh engine Rust yang sama dengan peta dan server MCP, bukan oleh model bahasa. Kirim apa adanya.',
    en: 'Text and numbers come from the same Rust engine as the map and the MCP server, not from a language model. Send it as is.',
  },
  briefFailed: { id: 'Briefing tidak bisa dibuat', en: 'Could not build the briefing' },
  briefCopy: { id: 'Salin', en: 'Copy' },
  briefCopied: { id: 'Tersalin', en: 'Copied' },
  briefWhatsApp: { id: 'Bagikan ke WhatsApp', en: 'Share on WhatsApp' },
  briefDownload: { id: 'Unduh .txt', en: 'Download .txt' },
  briefPrint: { id: 'Cetak', en: 'Print' },
  pkmListTitle: { id: 'Daftar puskesmas', en: 'Puskesmas list' },
  pkmSourceOsm: { id: 'Sumber: OpenStreetMap, {n} puskesmas.', en: 'Source: OpenStreetMap, {n} puskesmas.' },
  pkmSourceUser: { id: 'Sumber: daftar Anda ({file}), {n} puskesmas, diimpor {date}.', en: 'Source: your list ({file}), {n} puskesmas, imported {date}.' },
  csvExport: { id: 'Unduh CSV', en: 'Download CSV' },
  csvImport: { id: 'Impor CSV', en: 'Import CSV' },
  csvReset: { id: 'Kembali ke OSM', en: 'Back to OSM' },
  csvHelp: {
    id: 'Kolom: name, lat, lon, dan opsional baseline_visits_per_day. Pemisah koma atau titik koma. Unduh daftar OSM sebagai templat, perbaiki, lalu impor.',
    en: 'Columns: name, lat, lon, and optional baseline_visits_per_day. Comma or semicolon separated. Download the OSM list as a template, fix it, then import.',
  },
  csvPrivacy: { id: 'File dibaca di browser ini saja dan tidak diunggah ke mana pun.', en: 'The file is read in this browser only and is not uploaded anywhere.' },
  csvDone: { id: '{n} puskesmas diimpor.', en: '{n} puskesmas imported.' },
  csvRejected: { id: '{n} baris ditolak:', en: '{n} rows rejected:' },
  csvNothing: { id: 'Tidak ada baris yang bisa diimpor; daftar sebelumnya tetap dipakai.', en: 'No row could be imported; the previous list stays in use.' },
  csvRowOutside: { id: 'baris {row}: titik di luar kabupaten/kota {region}', en: 'row {row}: point is outside the {region} districts' },
  csvNoRows: { id: 'baris {row}: perlu baris judul dan minimal satu baris data', en: 'row {row}: a header and at least one data row are needed' },
  csvMissingCols: { id: 'baris {row}: kolom tidak ada: {detail}', en: 'row {row}: missing column(s): {detail}' },
  csvTooMany: { id: 'baris {row}: lebih dari {detail} baris; sisanya tidak dibaca', en: 'row {row}: more than {detail} rows; the rest was not read' },
  csvBadName: { id: 'baris {row}: nama harus 1 sampai {detail} karakter', en: 'row {row}: name must be 1 to {detail} characters' },
  csvBadCoord: { id: 'baris {row}: lat/lon harus derajat desimal (contoh -2.21 dan 113.92)', en: 'row {row}: lat/lon must be decimal degrees (for example -2.21 and 113.92)' },
  csvBadBaseline: { id: 'baris {row}: baseline_visits_per_day harus angka 0 sampai 1000', en: 'row {row}: baseline_visits_per_day must be a number from 0 to 1000' },
  osmEdit: { id: 'Perbaiki di OpenStreetMap', en: 'Fix in OpenStreetMap' },
  pkmUser: { id: 'dari daftar Anda', en: 'from your list' },
  crBox: { id: 'Pakai kotak Corsi–Rosenthal (uji EPA)', en: 'Use a Corsi–Rosenthal box (EPA test)' },
  indoorTitle: { id: 'PM2.5 di dalam ruang, {date}', en: 'Indoor PM2.5, {date}' },
  indoorOutdoor: { id: 'Di luar (CAMS, rata-rata kabupaten/kota)', en: 'Outdoors (CAMS, district mean)' },
  indoorWithout: { id: 'Tanpa pembersih udara', en: 'Without air cleaners' },
  indoorWith: { id: 'Dengan pembersih udara HEPA', en: 'With HEPA air cleaners' },
  indoorNote: {
    id: 'Rentang = faktor infiltrasi terukur di rumah saat asap kebakaran hutan (musim dingin sampai musim panas), bukan rentang 95%. Jendela atau jalusi terbuka bisa memasukkan lebih banyak asap: tutup ruangan dulu.',
    en: 'Range = measured infiltration in homes during forest-fire smoke (winter to summer means), not a 95% range. Open windows or louvres can let in more smoke: close the room first.',
  },
  indoorUnknown: { id: 'PM2.5 luar ruang belum ada untuk hari ini.', en: 'No outdoor PM2.5 for this day yet.' },
  layerNight: { id: 'Malam', en: 'Night' },
  imageryNight: { id: 'Citra malam NASA {date} (VIIRS Day/Night Band)', en: 'NASA night image {date} (VIIRS Day/Night Band)' },
  tourControls: { id: 'Spasi: jeda · →: lanjut · Esc: keluar', en: 'Space: pause · →: next · Esc: exit' },
  tour1: {
    id: 'Musim kabut 2026: Kemenkes mencatat 401.586 kasus ISPA terkait karhutla di 7 provinsi per 2 November.',
    en: 'The 2026 haze season: Indonesia’s health ministry counted 401,586 respiratory infections linked to fires in 7 provinces by 2 November.',
  },
  tour2: {
    id: 'Semua data terbuka: citra NASA hari itu, titik api NASA FIRMS, dan asap model Copernicus CAMS.',
    en: 'All open data: NASA’s satellite image of the day, NASA FIRMS fire detections, and the Copernicus CAMS smoke model.',
  },
  tour3: {
    id: 'Tiap kabupaten/kota diklasifikasi per hari: hari kabut, kabut berapi, dan berapa hari berturut-turut (Phung dkk. 2025).',
    en: 'Every district-day is classified: haze day, fire-haze day, and how many days in a row (Phung et al. 2025).',
  },
  tour4: {
    id: 'Prioritas posko dan rumah oksigen, diurutkan menurut perkiraan perubahan kunjungan, selalu dengan rentang 95%.',
    en: 'Priority for posko and oxygen houses, ranked by the expected change in visits, always with the 95% range.',
  },
  tour5: {
    id: 'Rincian kabupaten: perkiraan per hari, rentangnya, dan batas metode tepat di sebelah angka.',
    en: 'District detail: the daily estimate, its range, and the method limits right next to the numbers.',
  },
  tour6: {
    id: 'Puskesmas: kunjungan per hari, baseline yang bisa diganti dengan catatan sendiri, dan ruang udara bersih.',
    en: 'Puskesmas: visits per day, a baseline you replace with your own records, and a clean-air room plan.',
  },
  tour7: {
    id: 'Briefing siap kirim untuk Dinkes, ditulis oleh engine yang sama. Kiro Crew bisa mengirimnya tiap pagi lewat MCP.',
    en: 'A ready-to-send briefing for the health office, written by the same engine. Kiro Crew can send it every morning over MCP.',
  },
  tour8: {
    id: 'Sumatra: Riau, Jambi, dan Sumatera Selatan, dengan metode dan batas yang sama.',
    en: 'Sumatra: Riau, Jambi, and South Sumatra, with the same method and the same limits.',
  },
  tour9: {
    id: 'Mode langsung: prakiraan lima hari ke depan, diperbarui setiap hari dari sumber terbuka.',
    en: 'Live mode: the next five days, refreshed every day from open sources.',
  },
  tour10: { id: 'Sootsayer: dari titik api ke antrean puskesmas.', en: 'Sootsayer: from the fire pixel to the clinic queue.' },
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

const urlLang = new URLSearchParams(location.search).get('lang');
let current: Lang = urlLang === 'en' || urlLang === 'id' ? urlLang : (localStorage.getItem('sootsayer.lang') as Lang) || 'id';

/** A key built at run time (for example `region_${id}`), when it exists. */
export function hasKey(key: string): key is Key {
  return Object.prototype.hasOwnProperty.call(STRINGS, key);
}

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
