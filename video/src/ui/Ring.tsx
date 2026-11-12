import { interpolate } from 'remotion';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

const rand = (i: number) => {
  const x = Math.sin(i * 91.7 + 13.1) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * A hand-drawn charcoal loop around a box (in frame pixels), drawn on over 0.6 s.
 * `zoom` is the camera zoom it will be seen at, so the stroke and the gap
 * around the box keep the same on-screen size.
 */
export function Ring({ box, t, at, until, seed = 1, zoom = 1 }: { box: { x: number; y: number; w: number; h: number }; t: number; at: number; until: number; seed?: number; zoom?: number }) {
  if (t < at || t > until) return null;
  const draw = interpolate(t, [at, at + 0.6], [0, 1], clamp);
  const fade = interpolate(t, [until - 0.35, until], [1, 0], clamp);
  const u = 1 / zoom;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const rx = box.w / 2 + 22 * u;
  const ry = box.h / 2 + 16 * u;
  const paths = [0, 1, 2].map((k) => {
    const pts: string[] = [];
    const a0 = -2.2 + rand(seed * 7 + k) * 0.5;
    const turns = 1.08 + 0.05 * k;
    for (let i = 0; i <= 64; i++) {
      const a = a0 + (i / 64) * Math.PI * 2 * turns;
      const j = 1 + (rand(seed * 31 + k * 97 + i) - 0.5) * 0.035 + k * 0.025;
      pts.push(`${(cx + Math.cos(a) * rx * j).toFixed(1)},${(cy + Math.sin(a) * ry * j).toFixed(1)}`);
    }
    return `M${pts.join(' L')}`;
  });
  return (
    <svg
      style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none', filter: `drop-shadow(0 0 ${(5 * u).toFixed(1)}px rgba(0,0,0,0.9))` }}
      width="100%"
      height="100%"
    >
      <defs>
        <filter id={`rough-${seed}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={1} seed={seed} />
          <feDisplacementMap in="SourceGraphic" scale={2.2 * u} />
        </filter>
      </defs>
      <g filter={`url(#rough-${seed})`} opacity={fade}>
        {paths.map((d, k) => (
          <path
            key={k}
            d={d}
            pathLength={1}
            fill="none"
            stroke={k === 0 ? 'rgba(255, 244, 222, 0.97)' : 'rgba(245, 165, 36, 0.6)'}
            strokeWidth={(k === 0 ? 4.5 : 2.2) * u}
            strokeLinecap="round"
            strokeDasharray="1 1"
            strokeDashoffset={1 - draw}
          />
        ))}
      </g>
    </svg>
  );
}

/** A soft ripple where the recorder clicked (headless recordings have no cursor). */
export function ClickRipple({ x, y, t, at }: { x: number; y: number; t: number; at: number }) {
  const age = t - at;
  if (age < -0.25 || age > 0.8) return null;
  const pre = interpolate(age, [-0.25, 0], [0, 1], clamp);
  const r = interpolate(age, [0, 0.8], [10, 46], clamp);
  const a = age < 0 ? pre : interpolate(age, [0, 0.8], [1, 0], clamp);
  return (
    <svg style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }} width="100%" height="100%">
      <circle cx={x} cy={y} r={age < 0 ? 12 : r} fill="none" stroke="rgba(255,236,200,0.95)" strokeWidth={3} opacity={a} />
      <circle cx={x} cy={y} r={7} fill="rgba(245,165,36,0.9)" opacity={a} />
    </svg>
  );
}
