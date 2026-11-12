import { Easing, interpolate } from 'remotion';
import { EMBER, INK, MUTED, sans } from '../fonts';
import type { Caption } from '../timeline';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** `*word*` -> the one ember word of a line (a glow, not a colour shout). */
export function Ember({ text }: { text: string }) {
  return (
    <>
      {text.split('*').map((part, i) =>
        i % 2 ? (
          <span key={i} style={{ color: EMBER, textShadow: '0 0 18px rgba(245,150,40,0.45)' }}>
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/** Subtitle + source line, in the margin under the footage (never over the UI). */
export function Captions({ t, captions, top, sub }: { t: number; captions: Caption[]; top: number; sub?: (s: string) => string }) {
  return (
    <>
      {captions.map((c, i) => {
        if (t < c.at - 0.05 || t > c.until + 0.05) return null;
        const a = interpolate(t, [c.at, c.at + 0.35, c.until - 0.3, c.until], [0, 1, 1, 0], clamp);
        const y = interpolate(t, [c.at, c.at + 0.5], [12, 0], { ...clamp, easing: Easing.out(Easing.cubic) });
        return (
          <div key={i} style={{ position: 'absolute', left: 60, right: 60, top, textAlign: 'center', opacity: a, transform: `translateY(${y}px)` }}>
            <div style={{ fontFamily: sans, fontWeight: 600, fontSize: 46, lineHeight: 1.15, color: INK, letterSpacing: -0.3 }}>
              <Ember text={c.text} />
            </div>
            {c.sub ? (
              <div style={{ fontFamily: sans, fontWeight: 400, fontSize: 26, color: MUTED, marginTop: 9 }}>{sub ? sub(c.sub) : c.sub}</div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

/** Small chapter label in the top margin, like the cold open's "1/3 · THE PROBLEM". */
export function ChapterLabel({ t, text, left, top }: { t: number; text: string; left: number; top: number }) {
  if (t < 0 || t > 6) return null;
  const a = interpolate(t, [0.3, 0.9, 5.2, 6], [0, 1, 1, 0], clamp);
  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        zIndex: 5,
        opacity: a,
        fontFamily: sans,
        fontSize: 22,
        fontWeight: 600,
        letterSpacing: 3,
        color: EMBER,
        textShadow: '0 0 12px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.9)',
      }}
    >
      {text.replace('  ', ' · ').toUpperCase()}
    </div>
  );
}
