// The globe: MapLibre GL JS v6 with globe projection, atmosphere, terrain,
// open satellite imagery, and Sootsayer's data layers.

import {
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

const GLOBE_VIEW = { center: [114.5, -0.8] as [number, number], zoom: 1.55, pitch: 0, bearing: 0 };
/** Indonesian Kalimantan, framed by fitBounds so it fills the space between the panels. */
const KALIMANTAN_BOUNDS: [[number, number], [number, number]] = [
  [108.8, -4.2],
  [119.0, 4.3],
];
const PANEL_PADDING = { top: 80, bottom: 170, left: 370, right: 70 };

/** Toggleable layer groups (legend checkboxes). */
export const LAYER_GROUPS = {
  imagery: ['gibs'],
  smoke: ['smoke'],
  fires: ['fires-glow', 'fires'],
  pillars: ['pillars', 'pillars-hit'],
  districts: ['districts-fill', 'districts-line'],
} as const;
export type LayerGroup = keyof typeof LAYER_GROUPS;

export function gibsTiles(date: string): string {
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`;
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
        tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg'],
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
        id: 'hillshade',
        type: 'hillshade',
        source: 'hillshade',
        paint: { 'hillshade-exaggeration': 0.22, 'hillshade-shadow-color': '#120d0a', 'hillshade-highlight-color': '#fff6e0' },
      },
    ],
  };
}

export interface SootMap {
  map: MlMap;
  setImagery(date: string): void;
  setSmoke(canvas: HTMLCanvasElement, coordinates: [[number, number], [number, number], [number, number], [number, number]]): void;
  setFires(rows: FireRow[], date: string): number;
  setDistrictDay(states: Map<string, { change: number | null; status: DayStatus }>): void;
  setPillars(fc: GeoJSON.FeatureCollection): void;
  selectDistrict(code: string | null): void;
  setGroupVisible(group: LayerGroup, visible: boolean): void;
  flyIn(): void;
  flyToDistrict(code: string): void;
  onDistrict(cb: (code: string) => void): void;
  onPuskesmas(cb: (id: string) => void): void;
}

function emptyFc(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

function transparentPixel(): string {
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 1;
  return c.toDataURL('image/png');
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
  // Attribution is rendered by the app itself (always visible, see #attribution
  // in index.html) so the bottom panel never hides it.
  map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
  map.addControl(new GlobeControl(), 'top-right');

  await map.once('load');

  map.addSource('smoke', {
    type: 'image',
    // Transparent 1x1 image until the first smoke frame is drawn.
    url: transparentPixel(),
    coordinates: [
      [108.4, 4.6],
      [119.2, 4.6],
      [119.2, -4.2],
      [108.4, -4.2],
    ],
  });
  map.addLayer({ id: 'smoke', type: 'raster', source: 'smoke', paint: { 'raster-resampling': 'linear', 'raster-fade-duration': 0 } });

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
      // Exaggerated on purpose so pillars read at a whole-island view:
      // 7 km of height per expected respiratory visit per day.
      'fill-extrusion-height': ['*', ['get', 'expected'], 7000],
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

  const bboxOf = (code: string): [[number, number], [number, number]] | null => {
    const f = districts.features.find((x) => x.properties.code === code);
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

  return {
    map,
    setImagery(date) {
      (map.getSource('gibs') as RasterTileSource).setTiles([gibsTiles(date)]);
    },
    setSmoke(canvas, coordinates) {
      (map.getSource('smoke') as ImageSource).updateImage({ url: canvas.toDataURL('image/png'), coordinates });
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
    setGroupVisible(group, visible) {
      for (const id of LAYER_GROUPS[group]) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    },
    flyIn() {
      const cam = map.cameraForBounds(KALIMANTAN_BOUNDS, { padding: PANEL_PADDING, bearing: -12, pitch: 42 });
      if (cam) map.flyTo({ ...cam, bearing: -12, pitch: 42, duration: 6500, essential: true, curve: 1.6 });
    },
    flyToDistrict(code) {
      const b = bboxOf(code);
      if (b) map.fitBounds(b, { padding: { top: 90, bottom: 190, left: 370, right: 430 }, pitch: 45, duration: 2200, maxZoom: 8.5 });
    },
    onDistrict(cb) {
      districtCbs.push(cb);
    },
    onPuskesmas(cb) {
      puskesmasCbs.push(cb);
    },
  };
}
