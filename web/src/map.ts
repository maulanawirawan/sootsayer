// The globe: MapLibre GL JS v6 with globe projection, atmosphere, terrain,
// open satellite imagery, and Sootsayer's data layers.

import {
  addProtocol,
  GlobeControl,
  Map as MlMap,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
  type ImageSource,
  type MapMouseEvent,
  type RasterTileSource,
  type StyleSpecification,
} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';

import type { DayStatus, DistrictCollection, FireRow } from './types';

setWorkerUrl(workerUrl);

/** A JPEG with its end marker (FF D9) in the last 32 bytes, or any PNG; a JPEG without one was cut off. */
function completeImage(b: Uint8Array): boolean {
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    for (let i = b.length - 2; i >= Math.max(2, b.length - 32); i--) if (b[i] === 0xff && b[i + 1] === 0xd9) return true;
    return false;
  }
  return b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
}

// The EOX tile server now and then answers HTTP 200 with a JPEG cut short
// (seen: tile 3/2/5, 14,873 bytes, no end marker, about 1 load in 15), which
// Chrome reports as "The source image could not be decoded". Tiles requested
// as retry://host/path are fetched over https, checked, and fetched once more,
// bypassing the cache, when the body is incomplete.
addProtocol('retry', async (params, abort) => {
  const url = params.url.replace(/^retry:\/\//, 'https://');
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, { signal: abort.signal, cache: attempt ? 'reload' : 'default' });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const data = await res.arrayBuffer();
    if (completeImage(new Uint8Array(data))) return { data };
  }
  throw new Error(`incomplete image twice from ${new URL(url).host}`);
});

export type Bounds = [[number, number], [number, number]];

const GLOBE_VIEW = { center: [110.5, -1.2] as [number, number], zoom: 1.55, pitch: 0, bearing: 0 };

/** Height of the bottom panel plus its margin, measured, so the camera never hides things behind it. */
function bottomSpace(): number {
  const el = document.getElementById('bottom');
  return el ? Math.round(window.innerHeight - el.getBoundingClientRect().top) + 16 : 190;
}

/** Width taken by a side panel when it is shown (0 when hidden). */
function sideSpace(id: 'left' | 'right'): number {
  const el = document.getElementById(id);
  if (!el || el.classList.contains('hidden') || getComputedStyle(el).visibility === 'hidden') return 0;
  const r = el.getBoundingClientRect();
  return Math.round(id === 'left' ? r.right : window.innerWidth - r.left) + 16;
}

/** Room left for the panels; phones get less padding so the region still fills the view. */
function panelPadding(withRight = false): { top: number; bottom: number; left: number; right: number } {
  if (window.innerWidth < 700) return { top: 120, bottom: bottomSpace() + 40, left: 20, right: 20 };
  return { top: 80, bottom: bottomSpace(), left: Math.max(40, sideSpace('left')), right: Math.max(70, withRight ? sideSpace('right') : 0) };
}

/** Slow start, slow finish: reads as a camera move rather than a jump. */
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Toggleable layer groups (legend checkboxes). Day/night imagery is handled by setImageryMode. */
export const LAYER_GROUPS = {
  smoke: ['smoke'],
  fires: ['fires-glow', 'fires'],
  pillars: ['pillars', 'pillars-hit'],
  districts: ['districts-fill', 'districts-line'],
} as const;
export type LayerGroup = keyof typeof LAYER_GROUPS;

export function gibsTiles(date: string): string {
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`;
}

/** VIIRS Day/Night Band of the same night: city lights and fires glowing in the dark. */
export function gibsNightTiles(date: string): string {
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_DayNightBand_At_Sensor_Radiance/default/${date}/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png`;
}

const CHANGE_RAMP = [
  'interpolate', ['linear'], ['number', ['feature-state', 'change'], 0],
  -0.3, '#5aa9e6', 0, '#ddd6c6', 0.3, '#f6c453', 0.6, '#f08a24', 0.9, '#d6452b',
] as const;

function style(imageryDate: string): StyleSpecification {
  return {
    version: 8,
    projection: { type: 'globe' },
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sky: {
      'sky-color': '#0a0f1e',
      'horizon-color': '#3a2a3c',
      'sky-horizon-blend': 0.55,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 4, 0.85, 7, 0.15],
    },
    light: { anchor: 'map', position: [1.5, 90, 80] },
    sources: {
      s2: {
        type: 'raster',
        tiles: ['retry://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg'],
        tileSize: 256,
        maxzoom: 14,
        attribution:
          '<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless 2016</a> by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016 &amp; 2017), CC BY 4.0',
      },
      gibs: {
        type: 'raster',
        tiles: [gibsTiles(imageryDate)],
        tileSize: 256,
        maxzoom: 9,
        attribution:
          'Day imagery: <a href="https://earthdata.nasa.gov/gibs" target="_blank" rel="noopener">NASA GIBS</a> (VIIRS NOAA-20 true colour)',
      },
      'gibs-night': {
        type: 'raster',
        tiles: [gibsNightTiles(imageryDate)],
        tileSize: 256,
        maxzoom: 8,
        attribution:
          'Night imagery: <a href="https://earthdata.nasa.gov/gibs" target="_blank" rel="noopener">NASA GIBS</a> (VIIRS NOAA-20 Day/Night Band)',
      },
      terrain: {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: 14,
        attribution:
          'Terrain: <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">AWS Terrain Tiles</a> (SRTM, GMTED2010, ETOPO1 and others)',
      },
      hillshade: {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: 12,
      },
      omt: {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet',
        attribution:
          '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
      },
    },
    terrain: { source: 'terrain', exaggeration: 1.6 },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#0c1118' } },
      { id: 's2', type: 'raster', source: 's2', paint: { 'raster-brightness-max': 0.9, 'raster-saturation': -0.05 } },
      {
        id: 'gibs',
        type: 'raster',
        source: 'gibs',
        paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 6.5, 0.85, 9.5, 0] },
      },
      {
        id: 'gibs-night',
        type: 'raster',
        source: 'gibs-night',
        layout: { visibility: 'none' },
        paint: {
          'raster-opacity': ['interpolate', ['linear'], ['zoom'], 7, 1, 9.5, 0.2],
          'raster-contrast': 0.25,
          'raster-saturation': -1,
        },
      },
      {
        id: 'hillshade',
        type: 'hillshade',
        source: 'hillshade',
        paint: { 'hillshade-exaggeration': 0.22, 'hillshade-shadow-color': '#120d0a', 'hillshade-highlight-color': '#fff6e0' },
      },
    ],
  };
}

type Corners = [[number, number], [number, number], [number, number], [number, number]];

export interface SootMap {
  map: MlMap;
  setImagery(date: string): void;
  setImageryMode(visible: boolean, night: boolean): void;
  /** `key` identifies the frame; the same key twice does not reload the image. */
  setSmoke(key: string, draw: () => HTMLCanvasElement, coordinates: Corners): void;
  setFires(rows: FireRow[], date: string): number;
  setDistricts(fc: DistrictCollection): void;
  setDistrictDay(states: Map<string, { change: number | null; status: DayStatus }>): void;
  setPillars(fc: GeoJSON.FeatureCollection): void;
  selectDistrict(code: string | null): void;
  setGroupVisible(group: LayerGroup, visible: boolean): void;
  flyIn(bounds: Bounds, duration?: number): void;
  flyToDistrict(code: string): void;
  focusPoint(lngLat: [number, number]): void;
  selectPuskesmas(id: string | null): void;
  onDistrict(cb: (code: string) => void): void;
  onPuskesmas(cb: (id: string) => void): void;
}

function emptyFc(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

/** Hexagon around a point, about `km` kilometres across. */
export function hexagon(lon: number, lat: number, km = 11): number[][] {
  const r = km / 2 / 111.32;
  const rx = r / Math.cos((lat * Math.PI) / 180);
  const ring: number[][] = [];
  for (let i = 0; i <= 6; i++) {
    const a = (Math.PI / 3) * (i % 6) + Math.PI / 6;
    ring.push([lon + rx * Math.cos(a), lat + r * Math.sin(a)]);
  }
  return ring;
}

export async function createMap(
  container: HTMLElement,
  imageryDate: string,
  districts: DistrictCollection,
): Promise<SootMap> {
  const map = new MlMap({
    container,
    style: style(imageryDate),
    ...GLOBE_VIEW,
    maxPitch: 75,
    attributionControl: false,
    canvasContextAttributes: { antialias: true },
  });
  // Same console output as MapLibre's default error handler, plus the source
  // that failed, so a broken layer can be traced instead of guessed.
  map.on('error', (ev) => {
    const e = ev as unknown as { error?: Error; sourceId?: string; tile?: { tileID?: { canonical?: { z: number; x: number; y: number } } } };
    const c = e.tile?.tileID?.canonical;
    const where = `${e.sourceId ? `source ${e.sourceId}` : ''}${c ? ` tile ${c.z}/${c.x}/${c.y}` : ''}`;
    console.error(`[map] ${where ? `${where}: ` : ''}${e.error?.name ?? 'Error'}: ${e.error?.message ?? 'unknown'}`);
  });
  // Attribution is rendered by the app itself (always visible, see #attribution
  // in index.html) so the bottom panel never hides it.
  map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
  map.addControl(new GlobeControl(), 'top-right');

  await map.once('load');

  // The smoke source and layer are created from the first real frame (see
  // setSmoke): replacing a placeholder image that is still decoding makes
  // Chrome log "The source image could not be decoded".

  map.addSource('districts', { type: 'geojson', data: districts as unknown as GeoJSON.FeatureCollection, promoteId: 'code' });
  map.addLayer({
    id: 'districts-fill',
    type: 'fill',
    source: 'districts',
    paint: {
      'fill-color': ['case', ['boolean', ['feature-state', 'known'], false], CHANGE_RAMP as never, '#6b6b6b'],
      'fill-opacity': [
        'case',
        ['boolean', ['feature-state', 'hover'], false], 0.5,
        ['!', ['boolean', ['feature-state', 'known'], false]], 0.22,
        ['boolean', ['feature-state', 'haze'], false], 0.36,
        0.03,
      ],
    },
  });
  map.addLayer({
    id: 'districts-line',
    type: 'line',
    source: 'districts',
    paint: { 'line-color': '#f3ead8', 'line-opacity': 0.35, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.4, 9, 1.4] },
  });
  map.addLayer({
    id: 'country-line',
    type: 'line',
    source: 'omt',
    'source-layer': 'boundary',
    filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
    paint: { 'line-color': '#fff3d6', 'line-opacity': 0.55, 'line-width': 1.1, 'line-dasharray': [3, 2] },
  });

  map.addSource('fires', { type: 'geojson', data: emptyFc() });
  map.addLayer({
    id: 'fires-glow',
    type: 'circle',
    source: 'fires',
    paint: {
      'circle-color': '#ff5a1f',
      'circle-opacity': 0.35,
      'circle-blur': 1,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 5, 6, 9, 10, 18],
      'circle-pitch-alignment': 'map',
    },
  });
  map.addLayer({
    id: 'fires',
    type: 'circle',
    source: 'fires',
    paint: {
      'circle-color': ['interpolate', ['linear'], ['coalesce', ['get', 'frp'], 5], 0, '#ffd166', 30, '#ff9f1c', 150, '#ff4d00'],
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 2, 6, 3, 10, 5.5],
      'circle-pitch-alignment': 'map',
    },
  });

  map.addSource('pillars', { type: 'geojson', data: emptyFc() });
  map.addLayer({
    id: 'pillars',
    type: 'fill-extrusion',
    source: 'pillars',
    paint: {
      'fill-extrusion-color': [
        'case', ['boolean', ['get', 'known'], false],
        ['interpolate', ['linear'], ['get', 'change'], -0.3, '#5aa9e6', 0, '#ddd6c6', 0.3, '#f6c453', 0.6, '#f08a24', 0.9, '#d6452b'],
        '#777777',
      ],
      // Exaggerated on purpose so pillars read at a whole-island view (7 km of
      // height per expected respiratory visit per day), and lower when zoomed
      // in so a close-up still shows the land around them.
      'fill-extrusion-height': [
        'interpolate', ['linear'], ['zoom'],
        5, ['*', ['get', 'expected'], 7000],
        8, ['*', ['get', 'expected'], 2400],
        11, ['*', ['get', 'expected'], 700],
      ],
      'fill-extrusion-base': 0,
      'fill-extrusion-opacity': 0.92,
    },
  });
  map.addSource('pillar-points', { type: 'geojson', data: emptyFc() });
  map.addLayer({
    id: 'pillars-hit',
    type: 'circle',
    source: 'pillar-points',
    paint: { 'circle-radius': 9, 'circle-color': '#000', 'circle-opacity': 0.001 },
  });

  map.addLayer({
    id: 'district-selected',
    type: 'line',
    source: 'districts',
    filter: ['==', ['get', 'code'], ''],
    paint: { 'line-color': '#ffffff', 'line-width': 2.4, 'line-opacity': 0.95 },
  });
  // Ring on the ground around the selected puskesmas pillar.
  map.addLayer({
    id: 'pillar-selected',
    type: 'circle',
    source: 'pillar-points',
    filter: ['==', ['get', 'id'], ''],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 9, 8, 22, 11, 40],
      'circle-color': 'rgba(0, 0, 0, 0)',
      'circle-stroke-color': '#fff6d8',
      'circle-stroke-width': 2.5,
      'circle-stroke-opacity': 0.95,
      'circle-pitch-alignment': 'map',
    },
  });

  map.addLayer({
    id: 'place-labels',
    type: 'symbol',
    source: 'omt',
    'source-layer': 'place',
    filter: ['match', ['get', 'class'], ['city', 'town'], true, false],
    layout: {
      'text-field': ['coalesce', ['get', 'name:id'], ['get', 'name_int'], ['get', 'name']],
      'text-font': ['Noto Sans Regular'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 4, 10, 8, 13],
      'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
      'text-radial-offset': 0.6,
    },
    paint: { 'text-color': '#fff7e6', 'text-halo-color': '#120e0b', 'text-halo-width': 1.4, 'text-opacity': 0.9 },
  });

  let hovered: string | null = null;
  const setHover = (code: string | null) => {
    if (hovered) map.setFeatureState({ source: 'districts', id: hovered }, { hover: false });
    hovered = code;
    if (code) map.setFeatureState({ source: 'districts', id: code }, { hover: true });
  };
  map.on('mousemove', 'districts-fill', (e) => {
    const code = e.features?.[0]?.properties?.code as string | undefined;
    if (code && code !== hovered) setHover(code);
  });
  map.on('mouseleave', 'districts-fill', () => setHover(null));
  map.on('mouseenter', 'pillars-hit', () => (map.getCanvas().style.cursor = 'pointer'));
  map.on('mouseleave', 'pillars-hit', () => (map.getCanvas().style.cursor = ''));

  const districtCbs: ((code: string) => void)[] = [];
  const puskesmasCbs: ((id: string) => void)[] = [];
  map.on('click', (e: MapMouseEvent) => {
    const hit = map.queryRenderedFeatures(e.point, { layers: ['pillars-hit'] });
    const id = hit[0]?.properties?.id as string | undefined;
    if (id) {
      puskesmasCbs.forEach((cb) => cb(id));
      return;
    }
    const d = map.queryRenderedFeatures(e.point, { layers: ['districts-fill'] });
    const code = d[0]?.properties?.code as string | undefined;
    if (code) districtCbs.forEach((cb) => cb(code));
  });

  let current = districts;
  let smokeKey = '';
  const hidden = new Set<string>();
  const bboxOf = (code: string): Bounds | null => {
    const f = current.features.find((x) => x.properties.code === code);
    if (!f) return null;
    let [w, s, e, n] = [180, 90, -180, -90];
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys)
      for (const ring of poly)
        for (const [x, y] of ring) {
          w = Math.min(w, x);
          s = Math.min(s, y);
          e = Math.max(e, x);
          n = Math.max(n, y);
        }
    return [
      [w, s],
      [e, n],
    ];
  };

  let imageryDate0 = imageryDate;
  return {
    map,
    setImagery(date) {
      if (date === imageryDate0) return;
      imageryDate0 = date;
      (map.getSource('gibs') as RasterTileSource).setTiles([gibsTiles(date)]);
      (map.getSource('gibs-night') as RasterTileSource).setTiles([gibsNightTiles(date)]);
    },
    setImageryMode(visible, night) {
      map.setLayoutProperty('gibs', 'visibility', visible && !night ? 'visible' : 'none');
      map.setLayoutProperty('gibs-night', 'visibility', visible && night ? 'visible' : 'none');
    },
    setSmoke(key, draw, coordinates) {
      // Re-sending the same frame aborts the image that is still loading,
      // which Chrome reports as "The source image could not be decoded".
      if (key === smokeKey) return;
      smokeKey = key;
      const url = draw().toDataURL('image/png');
      const src = map.getSource('smoke') as ImageSource | undefined;
      if (src) {
        src.updateImage({ url, coordinates });
        return;
      }
      map.addSource('smoke', { type: 'image', url, coordinates });
      map.addLayer(
        {
          id: 'smoke',
          type: 'raster',
          source: 'smoke',
          layout: { visibility: hidden.has('smoke') ? 'none' : 'visible' },
          paint: { 'raster-resampling': 'linear', 'raster-fade-duration': 0 },
        },
        'districts-fill',
      );
    },
    setDistricts(fc) {
      current = fc;
      map.removeFeatureState({ source: 'districts' });
      (map.getSource('districts') as GeoJSONSource).setData(fc as unknown as GeoJSON.FeatureCollection);
    },
    setFires(rows, date) {
      const features = rows
        .filter((r) => r[2] === date)
        .map((r) => ({
          type: 'Feature' as const,
          properties: { frp: r[4], conf: r[5] },
          geometry: { type: 'Point' as const, coordinates: [r[0], r[1]] },
        }));
      (map.getSource('fires') as GeoJSONSource).setData({ type: 'FeatureCollection', features });
      return features.length;
    },
    setDistrictDay(states) {
      for (const [code, s] of states) {
        map.setFeatureState(
          { source: 'districts', id: code },
          {
            known: s.status !== 'unknown',
            haze: s.status === 'haze' || s.status === 'fire_haze',
            change: s.change ?? 0,
          },
        );
      }
    },
    setPillars(fc) {
      (map.getSource('pillars') as GeoJSONSource).setData(fc);
      const points: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: fc.features.map((f) => ({
          type: 'Feature',
          properties: { id: f.properties?.id },
          geometry: { type: 'Point', coordinates: f.properties?.center },
        })),
      };
      (map.getSource('pillar-points') as GeoJSONSource).setData(points);
    },
    selectDistrict(code) {
      map.setFilter('district-selected', ['==', ['get', 'code'], code ?? '']);
    },
    selectPuskesmas(id) {
      map.setFilter('pillar-selected', ['==', ['get', 'id'], id ?? '']);
    },
    setGroupVisible(group, visible) {
      for (const id of LAYER_GROUPS[group]) {
        if (visible) hidden.delete(id);
        else hidden.add(id);
        // The smoke layer appears with the first frame and then takes this setting.
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
      }
    },
    flyIn(bounds, duration = 6500) {
      const cam = map.cameraForBounds(bounds, { padding: panelPadding(), bearing: -12, pitch: 42 });
      if (cam) map.flyTo({ ...cam, bearing: -12, pitch: 42, duration, essential: true, curve: 1.5, easing: easeInOutCubic });
    },
    flyToDistrict(code) {
      const b = bboxOf(code);
      if (!b) return;
      // The detail panel opens on the right, so leave room for it.
      const padding = window.innerWidth < 700 ? { top: 120, bottom: bottomSpace() + 140, left: 20, right: 20 } : { ...panelPadding(), right: Math.max(430, sideSpace('right')) };
      const bearing = map.getBearing();
      const cam = map.cameraForBounds(b, { padding, bearing, pitch: 48, maxZoom: 8.5 });
      if (cam) map.flyTo({ ...cam, bearing, pitch: 48, duration: 2600, curve: 1.3, essential: true, easing: easeInOutCubic });
    },
    focusPoint(lngLat) {
      // A drone-like glide: tilt in, keep the bearing, stop clear of the panels.
      // From far out (the globe) it flies in an arc; nearby it eases.
      const pad = window.innerWidth < 700 ? { top: 120, bottom: bottomSpace() + 140, left: 20, right: 20 } : { ...panelPadding(), right: Math.max(450, sideSpace('right')) };
      const far = map.getZoom() < 5;
      const bearing = far ? -12 : map.getBearing();
      const cam = { center: lngLat, zoom: Math.max(map.getZoom(), 8.2), pitch: 58, bearing, padding: pad, easing: easeInOutCubic, essential: true };
      if (far) map.flyTo({ ...cam, duration: 5200, curve: 1.5 });
      else map.easeTo({ ...cam, duration: 2400 });
    },
    onDistrict(cb) {
      districtCbs.push(cb);
    },
    onPuskesmas(cb) {
      puskesmasCbs.push(cb);
    },
  };
}
