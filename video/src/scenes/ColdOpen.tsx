// Cold open, 0:00-0:30: a charcoal map drawn from real data, set on fire by
// the real NASA FIRMS detections of 14 Oct 2026, hatched with the real CAMS
// smoke of that day, dotted with the real puskesmas, then burnt through to
// reveal the real app underneath. three.js via @remotion/three; no assets.
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { EMBER, hand, INK, MUTED, sans } from '../fonts';
import { EMBER_FRAG, EMBER_VERT, PAPER_FRAG, PAPER_VERT, RING_FRAG, RING_VERT, SPARK_FRAG, SPARK_VERT } from '../three/glsl';
import { type SceneData, useSceneData } from '../three/sceneData';
import { FPS } from '../timeline';
import { Grain } from '../ui/Grain';

export const COLD_OPEN_FRAMES = 30 * FPS;
const W = 1920;
const H = 1080;
const LON0 = 113;
const ORIGIN: [number, number] = [113.9, -2.6]; // Central Kalimantan fire cluster
const T = {
  coast: [0.3, 5.5],
  districts: [2.0, 7.6],
  ignite: [8.6, 11.8],
  dusk: [12.2, 14.4],
  hatch: [12.0, 16.0],
  clinics: [20.4, 22.4],
  burn: [25.4, 29.4],
};

const rand = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const CHARCOAL = new THREE.Color('#221e1a');
const CHALK = new THREE.Color('#d9cfbd');
const sec = (frame: number) => frame / FPS;
const ramp = (t: number, [a, b]: number[], ease = Easing.inOut(Easing.cubic)) =>
  interpolate(t, [a, b], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });

/** Segments of rings, nearest ring to the origin first, with a slight hand wobble. */
function segments(rings: number[][], z: number, wobble: number): Float32Array {
  const withDist = rings.map((r) => {
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < r.length; i += 2) {
      sx += r[i];
      sy += r[i + 1];
    }
    const n = r.length / 2;
    return { r, d: Math.hypot(sx / n - ORIGIN[0], sy / n - ORIGIN[1]) };
  });
  withDist.sort((a, b) => a.d - b.d);
  const out: number[] = [];
  let k = 0;
  for (const { r } of withDist) {
    for (let i = 0; i + 3 < r.length; i += 2) {
      const j0 = (rand(k++) - 0.5) * wobble;
      const j1 = (rand(k++) - 0.5) * wobble;
      out.push(r[i] - LON0 + j0, r[i + 1] + j1, z, r[i + 2] - LON0 + j1, r[i + 3] - j0, z);
    }
  }
  return new Float32Array(out);
}

function lineObject(rings: number[][], width: number, color: string, opacity: number, z: number, wobble: number) {
  const geom = new LineSegmentsGeometry();
  geom.setPositions(segments(rings, z, wobble));
  const mat = new LineMaterial({ color: new THREE.Color(color), linewidth: width, transparent: true, opacity, depthWrite: false });
  mat.resolution.set(W, H);
  const obj = new LineSegments2(geom, mat);
  obj.frustumCulled = false;
  const total = (geom.attributes.instanceStart as THREE.InterleavedBufferAttribute).count;
  return { obj, mat, total, geom };
}

/** PM2.5 of one day on a 0.4 degree texture (value / 500), lightly blurred so it reads as smoke. */
function pmTexture(data: SceneData, day: number) {
  const box = { lon0: 94, lat0: -7.6, nx: 70, ny: 42, step: 0.4 };
  let a = new Float32Array(box.nx * box.ny);
  for (const c of data.smoke) {
    const v = c.pm25[day];
    if (v < 0) continue;
    const i = Math.round((c.lon - box.lon0) / box.step);
    const j = Math.round((c.lat - box.lat0) / box.step);
    if (i >= 0 && i < box.nx && j >= 0 && j < box.ny) a[j * box.nx + i] = Math.max(a[j * box.nx + i], Math.min(1, v / 500));
  }
  for (let pass = 0; pass < 2; pass++) {
    const b = new Float32Array(a.length);
    for (let j = 0; j < box.ny; j++)
      for (let i = 0; i < box.nx; i++) {
        let s = 0;
        let n = 0;
        for (let dj = -1; dj <= 1; dj++)
          for (let di = -1; di <= 1; di++) {
            const ii = i + di;
            const jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= box.nx || jj >= box.ny) continue;
            s += a[jj * box.nx + ii];
            n++;
          }
        b[j * box.nx + i] = s / n;
      }
    a = b;
  }
  const tex = new THREE.DataTexture(a, box.nx, box.ny, THREE.RedFormat, THREE.FloatType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return { tex, box: new THREE.Vector4(box.lon0, box.lat0, box.nx * box.step, box.ny * box.step) };
}

function useScene(data: SceneData) {
  return useMemo(() => {
    const day = data.facts.days.indexOf('2026-10-14');
    const pm = pmTexture(data, day);
    const paper = new THREE.ShaderMaterial({
      vertexShader: PAPER_VERT,
      fragmentShader: PAPER_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uDusk: { value: 0 },
        uHatch: { value: 0 },
        uBurn: { value: 0 },
        uPm: { value: pm.tex },
        uPmBox: { value: pm.box },
        uBurnOrigin: { value: new THREE.Vector2(...ORIGIN) },
        uRes: { value: new THREE.Vector2(W, H) },
      },
      transparent: true,
    });
    const coast = lineObject(data.land, 2.6, '#221e1a', 0.9, 0.01, 0.02);
    const coastSmudge = lineObject(data.land, 7, '#3a332b', 0.12, 0.005, 0.06);
    const districts = lineObject(data.districts, 1.15, '#2b2620', 0.55, 0.012, 0.012);

    // fires of 14 Oct, Kalimantan rows only (the first firesTotal.kalimantan rows)
    const nK = data.facts.firesTotal.kalimantan;
    const pos: number[] = [];
    const seed: number[] = [];
    const heat: number[] = [];
    const t0: number[] = [];
    for (let r = 0; r < nK; r++) {
      if (data.fires[r * 4 + 2] !== day) continue;
      const k = pos.length / 3;
      pos.push(data.fires[r * 4] - LON0, data.fires[r * 4 + 1], 0.03);
      seed.push(rand(k + 7));
      heat.push(Math.min(1, Math.max(0.25, Math.log1p(data.fires[r * 4 + 3]) / 4.5)));
      t0.push(T.ignite[0] + (T.ignite[1] - T.ignite[0]) * rand(k * 3 + 1));
    }
    const eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    eg.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
    eg.setAttribute('aHeat', new THREE.Float32BufferAttribute(heat, 1));
    eg.setAttribute('aT0', new THREE.Float32BufferAttribute(t0, 1));
    const embersMat = new THREE.ShaderMaterial({
      vertexShader: EMBER_VERT,
      fragmentShader: EMBER_FRAG,
      uniforms: { uTime: { value: 0 }, uSize: { value: 1.25 }, uBurn: { value: 0 }, uDusk: { value: 0 }, uBurnOrigin: { value: new THREE.Vector2(...ORIGIN) } },
      transparent: true,
      depthWrite: false,
    });
    const embers = new THREE.Points(eg, embersMat);
    embers.frustumCulled = false;
    const igniteTimes = Float32Array.from(t0).sort();

    // Kalimantan puskesmas (OpenStreetMap)
    const nP = data.facts.puskesmas.kalimantan;
    const pp: number[] = [];
    const pt: number[] = [];
    data.puskesmas.slice(0, nP).forEach(([lon, lat], i) => {
      pp.push(lon - LON0, lat, 0.04);
      pt.push(T.clinics[0] + (T.clinics[1] - T.clinics[0]) * rand(i + 99));
    });
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
    pg.setAttribute('aT0', new THREE.Float32BufferAttribute(pt, 1));
    const ringsMat = new THREE.ShaderMaterial({
      vertexShader: RING_VERT,
      fragmentShader: RING_FRAG,
      uniforms: { uTime: { value: 0 }, uSize: { value: 1.6 }, uPulse: { value: 0 }, uBurn: { value: 0 }, uBurnOrigin: { value: new THREE.Vector2(...ORIGIN) } },
      transparent: true,
      depthWrite: false,
    });
    const clinics = new THREE.Points(pg, ringsMat);
    clinics.frustumCulled = false;

    // sparks along the burn front
    const sp: number[] = [];
    const sf: number[] = [];
    const ss: number[] = [];
    for (let i = 0; i < 2600; i++) {
      const lon = 103 + rand(i * 5 + 1) * 22;
      const lat = -8 + rand(i * 5 + 2) * 18;
      sp.push(lon - LON0, lat, 0.05);
      sf.push(Math.hypot(lon - ORIGIN[0], lat - ORIGIN[1]) / 14 + rand(i * 5 + 3) * 0.42);
      ss.push(rand(i * 5 + 4));
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sg.setAttribute('aField', new THREE.Float32BufferAttribute(sf, 1));
    sg.setAttribute('aSeed', new THREE.Float32BufferAttribute(ss, 1));
    const sparksMat = new THREE.ShaderMaterial({
      vertexShader: SPARK_VERT,
      fragmentShader: SPARK_FRAG,
      uniforms: { uTime: { value: 0 }, uBurn: { value: 0 }, uBurnStart: { value: T.burn[0] } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const sparks = new THREE.Points(sg, sparksMat);
    sparks.frustumCulled = false;

    // camera path: one smooth curve, slow push toward Central Kalimantan
    const camPath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-2.2, -17.5, 24),
      new THREE.Vector3(-0.8, -14.0, 19.5),
      new THREE.Vector3(0.2, -12.2, 16.2),
      new THREE.Vector3(0.9, -10.9, 13.8),
      new THREE.Vector3(1.1, -10.3, 12.6),
    ]);
    const lookPath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.2, 0.3, 0),
      new THREE.Vector3(0.3, -0.2, 0),
      new THREE.Vector3(0.7, -0.8, 0),
      new THREE.Vector3(1.0, -1.3, 0),
      new THREE.Vector3(1.0, -1.5, 0),
    ]);
    return { paper, coast, coastSmudge, districts, embers, embersMat, igniteTimes, clinics, ringsMat, sparks, sparksMat, camPath, lookPath };
  }, [data]);
}

function Scene({ data, t }: { data: SceneData; t: number }) {
  const s = useScene(data);
  const camera = useThree((st) => st.camera) as THREE.PerspectiveCamera;
  const gl = useThree((st) => st.gl);
  gl.setClearColor(0x000000, 0);

  const u = interpolate(t, [0, 30], [0, 1], { easing: Easing.inOut(Easing.sin), extrapolateRight: 'clamp' });
  camera.position.copy(s.camPath.getPoint(u));
  camera.lookAt(s.lookPath.getPoint(u));
  camera.updateProjectionMatrix();

  const burn = ramp(t, T.burn, Easing.in(Easing.quad)) * 1.5;
  const dusk = ramp(t, T.dusk);
  const pulsePhase = t > 23 ? ((t - 23) % 1.6) / 1.6 : 1;
  const pulse = t > 23 ? Math.exp(-pulsePhase * 6) : 0;
  s.paper.uniforms.uTime.value = t;
  s.paper.uniforms.uDusk.value = dusk;
  s.paper.uniforms.uHatch.value = ramp(t, T.hatch);
  s.paper.uniforms.uBurn.value = burn;
  s.embersMat.uniforms.uTime.value = t;
  s.embersMat.uniforms.uDusk.value = dusk;
  s.embersMat.uniforms.uBurn.value = burn;
  s.ringsMat.uniforms.uTime.value = t;
  s.ringsMat.uniforms.uPulse.value = pulse;
  s.ringsMat.uniforms.uBurn.value = burn;
  s.sparksMat.uniforms.uTime.value = t;
  s.sparksMat.uniforms.uBurn.value = burn;
  s.coast.geom.instanceCount = Math.floor(s.coast.total * ramp(t, T.coast, Easing.inOut(Easing.quad)));
  s.coastSmudge.geom.instanceCount = Math.floor(s.coastSmudge.total * ramp(t, [T.coast[0] + 0.6, T.coast[1] + 0.8], Easing.inOut(Easing.quad)));
  s.districts.geom.instanceCount = Math.floor(s.districts.total * ramp(t, T.districts, Easing.inOut(Easing.quad)));
  // charcoal lines turn to pale chalk as the page darkens, and go with the burnt paper
  const lineFade = 1 - ramp(t, [T.burn[0] + 0.8, T.burn[1] - 0.6]);
  s.coast.mat.color.lerpColors(CHARCOAL, CHALK, dusk);
  s.districts.mat.color.lerpColors(CHARCOAL, CHALK, dusk);
  s.coastSmudge.mat.color.lerpColors(CHARCOAL, CHALK, dusk);
  s.coast.mat.opacity = 0.9 * lineFade * (1 - 0.25 * dusk);
  s.coastSmudge.mat.opacity = 0.12 * lineFade;
  s.districts.mat.opacity = 0.55 * lineFade * (1 - 0.3 * dusk);


  return (
    <>
      <mesh material={s.paper} renderOrder={0}>
        <planeGeometry args={[140, 90, 1, 1]} />
      </mesh>
      <primitive object={s.coastSmudge.obj} renderOrder={1} />
      <primitive object={s.districts.obj} renderOrder={2} />
      <primitive object={s.coast.obj} renderOrder={3} />
      <primitive object={s.clinics} renderOrder={4} />
      <primitive object={s.embers} renderOrder={5} />
      <primitive object={s.sparks} renderOrder={6} />
    </>
  );
}

function igniteCount(times: Float32Array, t: number) {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** A line of hand-lettered text that wipes in from the left and fades out. */
function Hand({ t, at, until, children, size, color, style }: { t: number; at: number; until: number; children: React.ReactNode; size: number; color: string; style?: React.CSSProperties }) {
  const wipe = ramp(t, [at, at + 0.9], Easing.out(Easing.cubic));
  const out = 1 - ramp(t, [until - 0.5, until]);
  if (t < at || t > until) return null;
  return (
    <div style={{ fontFamily: hand, fontWeight: 700, fontSize: size, lineHeight: 1.02, color, clipPath: `inset(-20% ${100 - wipe * 100}% -20% 0)`, opacity: out, ...style }}>
      {children}
    </div>
  );
}

function Sub({ t, at, until, children, color }: { t: number; at: number; until: number; children: React.ReactNode; color: string }) {
  const a = ramp(t, [at + 0.5, at + 1.2]) * (1 - ramp(t, [until - 0.5, until]));
  if (t < at || t > until) return null;
  return <div style={{ fontFamily: sans, fontSize: 25, fontWeight: 500, color, opacity: a, marginTop: 14, letterSpacing: 0.2 }}>{children}</div>;
}

export function ColdOpen({ chapter = '1/4  The problem' }: { chapter?: string }) {
  const frame = useCurrentFrame();
  const t = sec(frame);
  const data = useSceneData();
  const darkInk = '#1d1913';
  const light = t < 13.6;
  const ink = light ? darkInk : INK;
  const sub = light ? '#4a4239' : MUTED;
  // a soft halo of paper (or of night) behind the letters keeps them readable over the map lines
  const shadow = light ? '0 0 10px rgba(236,229,214,0.95), 0 0 22px rgba(236,229,214,0.8)' : '0 0 14px rgba(0,0,0,0.85), 0 2px 18px rgba(0,0,0,0.75)';
  const fires = data ? data.facts.firesKalimantan14Oct : 0;
  return (
    <AbsoluteFill>
      {data ? (
        <ThreeCanvas width={W} height={H} gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }} camera={{ fov: 32, near: 0.1, far: 400, position: [0, -16, 22] }}>
          <Scene data={data} t={t} />
        </ThreeCanvas>
      ) : null}
      <AbsoluteFill style={{ padding: '78px 96px', pointerEvents: 'none', textShadow: shadow }}>
        <div style={{ fontFamily: sans, fontSize: 22, fontWeight: 600, letterSpacing: 3, color: EMBER, opacity: (1 - ramp(t, [24.6, 25.4])) * ramp(t, [0.4, 1.2]) }}>
          {chapter.replace('  ', ' · ').toUpperCase()}
        </div>
        <div style={{ marginTop: 36, maxWidth: 1240 }}>
          <Hand t={t} at={0.9} until={7.9} size={104} color={ink}>Kalimantan, October 2026.</Hand>
          <Sub t={t} at={0.9} until={7.9} color={sub}>
            Every line is drawn from real data: coastlines (Natural Earth) and{' '}
            {data ? data.facts.districts.kalimantan + data.facts.districts.sumatra : 96} district borders of Kalimantan and Sumatra (geoBoundaries).
          </Sub>
          <Hand t={t} at={8.6} until={13.9} size={230} color={light ? '#b5400e' : EMBER} style={{ textShadow: light ? shadow : '0 0 30px rgba(245,140,40,0.55), 0 0 10px rgba(0,0,0,0.8)' }}>
            <FireCount data={data} t={t} total={fires} />
          </Hand>
          <Hand t={t} at={9.2} until={13.9} size={64} color={ink}>satellite fire detections in one day.</Hand>
          <Sub t={t} at={9.2} until={13.9} color={sub}>NASA FIRMS · VIIRS NOAA-20 · Kalimantan, 14 October 2026</Sub>
          <Hand t={t} at={14.5} until={20.1} size={104} color={EMBER} style={{ textShadow: '0 0 26px rgba(245,140,40,0.5), 0 0 12px rgba(0,0,0,0.85)' }}>
            At least 425,167
          </Hand>
          <Hand t={t} at={15.0} until={20.1} size={62} color={ink}>respiratory infections from fire haze, 20 Aug – 5 Nov.</Hand>
          <Sub t={t} at={15.0} until={20.1} color={sub}>Indonesian Ministry of Health, via The Jakarta Post (9 Nov 2026) · hatching = Copernicus CAMS PM2.5, 14 Oct</Sub>
          <Hand t={t} at={20.5} until={25.3} size={70} color={ink}>Satellites see the fire.</Hand>
          <Hand t={t} at={21.4} until={25.3} size={70} color={ink}>Air apps see the smoke.</Hand>
          <Hand t={t} at={22.8} until={25.3} size={78} color={EMBER}>Nobody tells the clinics who is coming.</Hand>
          <Sub t={t} at={20.5} until={25.3} color={sub}>Rings: {data?.facts.puskesmas.kalimantan ?? 339} puskesmas mapped in OpenStreetMap</Sub>
        </div>
      </AbsoluteFill>
      <Grain frame={frame} opacity={0.11 * (1 - ramp(t, [T.burn[0], T.burn[1]]))} />
    </AbsoluteFill>
  );
}

function FireCount({ data, t, total }: { data: SceneData | null; t: number; total: number }) {
  // The number counts the embers that have actually ignited on screen.
  const times = useMemo(() => {
    if (!data) return null;
    const day = data.facts.days.indexOf('2026-10-14');
    const nK = data.facts.firesTotal.kalimantan;
    const ts: number[] = [];
    let k = 0;
    for (let r = 0; r < nK; r++) {
      if (data.fires[r * 4 + 2] !== day) continue;
      ts.push(T.ignite[0] + (T.ignite[1] - T.ignite[0]) * rand(k * 3 + 1));
      k++;
    }
    return Float32Array.from(ts).sort();
  }, [data]);
  const n = times ? igniteCount(times, t) : 0;
  return <>{(t >= T.ignite[1] ? total : n).toLocaleString('en-US')}</>;
}
