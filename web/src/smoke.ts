// Smoke rendering: CAMS PM2.5 daily means -> a small translucent image that
// MapLibre stretches over Kalimantan with linear resampling. The colours are
// smoke-like (pale to dark brown) so the layer reads as haze over the
// satellite image, not as a rainbow.

import type { Grid } from './types';

type RGBA = [number, number, number, number];

/** PM2.5 (µg/m³) stops. 15 = WHO 2021 24-hour guideline. */
export const SMOKE_STOPS: [number, RGBA][] = [
  [0, [236, 230, 214, 0]],
  [15, [236, 230, 214, 0.06]],
  [55, [224, 204, 166, 0.26]],
  [150, [203, 164, 114, 0.46]],
  [250, [168, 121, 75, 0.6]],
  [500, [118, 80, 50, 0.74]],
  [1000, [72, 48, 33, 0.86]],
];

export function smokeColor(v: number): RGBA {
  const s = SMOKE_STOPS;
  if (v <= s[0][0]) return s[0][1];
  for (let i = 1; i < s.length; i++) {
    const [x1, c1] = s[i];
    if (v <= x1) {
      const [x0, c0] = s[i - 1];
      const k = (v - x0) / (x1 - x0);
      return [0, 1, 2, 3].map((j) => c0[j] + (c1[j] - c0[j]) * k) as RGBA;
    }
  }
  return s[s.length - 1][1];
}

/**
 * One pixel per grid cell, row 0 = north, plus a transparent one-cell border
 * and softened outer cells, so the edge of the data area fades out instead of
 * drawing a visible rectangle. Null cells stay transparent.
 */
export function renderSmoke(grid: Grid, pm25: (number | null)[][], dayIndex: number): HTMLCanvasElement {
  const nx = grid.lons.length;
  const ny = grid.lats.length;
  const canvas = document.createElement('canvas');
  canvas.width = nx + 2;
  canvas.height = ny + 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const img = ctx.createImageData(nx + 2, ny + 2);
  for (let row = 0; row < ny; row++) {
    for (let col = 0; col < nx; col++) {
      const v = pm25[row * nx + col]?.[dayIndex];
      if (v === null || v === undefined) continue;
      const edge = Math.min(row, col, ny - 1 - row, nx - 1 - col);
      const fade = edge === 0 ? 0.35 : edge === 1 ? 0.7 : 1;
      const [r, g, b, a] = smokeColor(v);
      const o = ((row + 1) * (nx + 2) + (col + 1)) * 4;
      img.data[o] = r;
      img.data[o + 1] = g;
      img.data[o + 2] = b;
      img.data[o + 3] = Math.round(a * fade * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Image corners for MapLibre. Pixel centres sit on the grid cell centres; the
 * extent includes the one-cell transparent border drawn by renderSmoke.
 */
export function smokeCoordinates(grid: Grid): [[number, number], [number, number], [number, number], [number, number]] {
  const h = grid.step_deg * 1.5;
  const west = grid.lons[0] - h;
  const east = grid.lons[grid.lons.length - 1] + h;
  const north = grid.lats[0] + h;
  const south = grid.lats[grid.lats.length - 1] - h;
  return [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ];
}

/** Legend gradient with the stops spaced evenly (labels show the values). */
export function smokeLegendCss(): string {
  const n = SMOKE_STOPS.length - 1;
  const parts = SMOKE_STOPS.map(([, [r, g, b, a]], i) => `rgba(${r},${g},${b},${Math.max(a, 0.05)}) ${(i / n) * 100}%`);
  return `linear-gradient(90deg, ${parts.join(', ')})`;
}
