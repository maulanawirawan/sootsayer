// Film grain from an SVG turbulence filter: procedural, re-seeded every frame.
import { AbsoluteFill } from 'remotion';

export function Grain({ frame, opacity }: { frame: number; opacity: number }) {
  if (opacity <= 0.001) return null;
  const id = `grain-${frame % 2}`;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', mixBlendMode: 'overlay', opacity }}>
      <svg width="100%" height="100%">
        <filter id={id}>
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={frame % 97} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#${id})`} />
      </svg>
    </AbsoluteFill>
  );
}
