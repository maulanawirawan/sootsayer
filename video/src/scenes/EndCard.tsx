// End card: drifting embers (deterministic, from the frame number), the name,
// the line, the links, and the limit that matters most.
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { CHAR, EMBER, hand, INK, MUTED, sans, serif } from '../fonts';
import { FPS } from '../timeline';
import { Grain } from '../ui/Grain';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const rand = (i: number) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export function EndCard({ lead = 0 }: { lead?: number }) {
  const f = useCurrentFrame() - lead;
  const t = f / FPS;
  const fadeIn = interpolate(f, [-lead, 0], [0, 1], clamp);
  const embers = Array.from({ length: 140 }, (_, i) => {
    const speed = 30 + rand(i) * 70;
    const x = rand(i + 500) * 1920 + Math.sin(t * (0.6 + rand(i + 9)) + i) * 26;
    const y = 1120 - ((rand(i + 900) * 1200 + t * speed) % 1240);
    const r = 1 + rand(i + 77) * 3.2;
    const a = (0.35 + 0.65 * rand(i + 3)) * (0.6 + 0.4 * Math.sin(t * 6 + i * 3));
    return <circle key={i} cx={x} cy={y} r={r} fill={i % 4 ? EMBER : '#ffd28a'} opacity={a * 0.8} />;
  });
  const a = (from: number) => interpolate(t, [from, from + 0.8], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const out = interpolate(t, [6.2, 7.0], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 55%, #1c1410 0%, ${CHAR} 65%)`, opacity: out * fadeIn }}>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, filter: 'blur(0.4px)' }}>
        {embers}
      </svg>
      <AbsoluteFill style={{ display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 150, color: INK, letterSpacing: 6, opacity: a(0.2), textShadow: '0 0 40px rgba(245,165,36,0.35)' }}>Sootsayer</div>
          <div style={{ fontFamily: hand, fontWeight: 700, fontSize: 58, color: EMBER, opacity: a(0.9), marginTop: -6 }}>from the fire pixel to the clinic queue</div>
          <div style={{ fontFamily: sans, fontSize: 30, color: INK, opacity: a(1.7), marginTop: 46 }}>sootsayer.vercel.app · github.com/maulanawirawan/sootsayer</div>
          <div style={{ fontFamily: sans, fontSize: 22, color: MUTED, opacity: a(2.4), marginTop: 22 }}>
            Decision support for health offices, not medical advice · open data: NASA FIRMS, NASA GIBS, Copernicus CAMS, OpenStreetMap, geoBoundaries
          </div>
          <div style={{ fontFamily: sans, fontSize: 22, color: MUTED, opacity: a(2.8), marginTop: 10 }}>
            Built with Kiro for Kiroween 2026 · this video is code too (Remotion + three.js, original score), in the repo's video/ folder
          </div>
        </div>
      </AbsoluteFill>
      <Grain frame={f} opacity={0.06} />
    </AbsoluteFill>
  );
}
