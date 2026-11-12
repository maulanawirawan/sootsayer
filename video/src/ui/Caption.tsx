import { Easing, interpolate } from 'remotion';
import { EMBER, INK, MUTED, sans } from '../fonts';
import type { Caption } from '../timeline';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** Subtitle + source line, in the margin under the footage (never over the UI). */
export function Captions({ t, captions, top, sub }: { t: number; captions: Caption[]; top: number; sub?: (s: string) => string }) {
  return (
    <>
      {captions.map((c, i) => {
        if (t < c.at - 0.05 || t > c.until + 0.05) return null;
        const a = interpolate(t, [c.at, c.at + 0.35, c.until - 0.3, c.until], [0, 1, 1, 0], clamp);
        const y = interpolate(t, [c.at, c.at + 0.5], [10, 0], { ...clamp, easing: Easing.out(Easing.cubic) });
        return (
          <div key={i} style={{ position: 'absolute', left: 0, right: 0, top, textAlign: 'center', opacity: a, transform: `translateY(${y}px)` }}>
            <div style={{ fontFamily: sans, fontWeight: 600, fontSize: 40, color: INK, letterSpacing: -0.2 }}>{c.text}</div>
            {c.sub ? (
              <div style={{ fontFamily: sans, fontWeight: 400, fontSize: 23, color: MUTED, marginTop: 8 }}>{sub ? sub(c.sub) : c.sub}</div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

/** Big chapter title over the footage, then gone. */
export function Chapter({ t, text, scrim = 0.6 }: { t: number; text: string; scrim?: number }) {
  if (t > 2.6 || t < 0) return null;
  const a = interpolate(t, [0, 0.4, 2.0, 2.5], [0, 1, 1, 0], clamp);
  const [n, ...rest] = text.split('  ');
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: `rgba(8,9,12,${scrim * a})`, opacity: a, zIndex: 5, borderRadius: 14 }}>
      <div style={{ textAlign: 'center', transform: `scale(${interpolate(t, [0, 2.5], [0.98, 1.02])})` }}>
        <div style={{ fontFamily: sans, fontSize: 26, fontWeight: 600, letterSpacing: 6, color: EMBER }}>{n}</div>
        <div style={{ fontFamily: sans, fontSize: 64, fontWeight: 700, color: INK, marginTop: 10, letterSpacing: -0.5 }}>{rest.join(' ')}</div>
      </div>
    </div>
  );
}
