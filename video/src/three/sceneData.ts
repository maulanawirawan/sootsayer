import { useEffect, useState } from 'react';
import { continueRender, delayRender, staticFile } from 'remotion';

export interface SceneFacts {
  days: string[];
  firesKalimantan14Oct: number;
  firesTotal: { kalimantan: number; sumatra: number };
  puskesmas: { kalimantan: number; sumatra: number };
  districts: { kalimantan: number; sumatra: number };
}

export interface SceneData {
  land: number[][];
  world: number[][];
  districts: number[][];
  smoke: { lon: number; lat: number; pm25: number[] }[];
  puskesmas: [number, number][];
  facts: SceneFacts;
  /** lon, lat, day index, FRP (MW), Kalimantan rows first, then Sumatra */
  fires: Float32Array;
}

let cache: Promise<SceneData> | null = null;

function load(): Promise<SceneData> {
  cache ??= Promise.all([
    fetch(staticFile('data/scene.json')).then((r) => r.json()),
    fetch(staticFile('data/fires.bin')).then((r) => r.arrayBuffer()),
  ]).then(([s, b]) => ({ ...s, fires: new Float32Array(b) }));
  return cache;
}

/** Real data for the cold open; the render waits until it is loaded. */
export function useSceneData(): SceneData | null {
  const [data, setData] = useState<SceneData | null>(null);
  const [handle] = useState(() => delayRender('scene data'));
  useEffect(() => {
    load()
      .then((d) => {
        setData(d);
        continueRender(handle);
      })
      .catch((e) => {
        console.error(e);
        throw e;
      });
  }, [handle]);
  return data;
}
