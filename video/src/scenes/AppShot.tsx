// A shot of the real app: the recorded clip in a charcoal frame, a subtitle
// and source line below it, a charcoal ring on the element being explained,
// a gentle punch-in toward it, and a ripple where the recorder clicked.
import { AbsoluteFill, Easing, interpolate, OffthreadVideo, useCurrentFrame } from 'remotion';
import type { ClipMeta } from '../Demo';
import { CHAR } from '../fonts';
import { clipUrl, FPS, type Placed } from '../timeline';
import { Captions, Chapter } from '../ui/Caption';
import { Grain } from '../ui/Grain';
import { ClickRipple, Ring } from '../ui/Ring';

export const FRAME = { x: 192, y: 34, w: 1536, h: 864 };
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** What the live recording actually showed, in one line (read from its #priority text). */
function liveNote(meta: ClipMeta): string {
  const text = meta.marks.find((m) => m.name === 'priority')?.box?.text ?? '';
  const day = meta.marks.find((m) => m.name === 'today')?.box?.text?.replace(/\s*today\s*/i, '').trim();
  const when = day ? `, ${day}` : '';
  return /No haze days/i.test(text)
    ? `Recorded live${when}: no haze days in the next five days, and the app says so plainly`
    : `Recorded live${when}: the latest CAMS run, with 95% ranges`;
}

/**
 * `lead`: frames this shot starts before its own slot. After the cold open the
 * clip plays full-bleed under the burning paper (`bleed`) and then settles into
 * the frame; between other shots the lead is a short crossfade.
 */
export function AppShot({ shot, meta, lead, bleed }: { shot: Placed; meta: ClipMeta; lead: number; bleed: boolean }) {
  const f = useCurrentFrame();
  const local = (f - lead) / FPS; // seconds since the shot's own slot began
  const fadeIn = bleed ? 1 : interpolate(f, [0, Math.max(1, lead)], [0, 1], clamp);
  const rate = shot.rate ?? 1;
  const trimBefore = Math.max(0, Math.round(((shot.from ?? 0) - (lead / FPS) * rate) * FPS));
  const clipT = trimBefore / FPS + (f / FPS) * rate; // clip seconds on screen
  const k = FRAME.w / meta.viewport.width; // CSS px of the recording -> frame px
  const captions = shot.captions ?? [];

  // full-bleed under the burning paper, then settle into the frame
  const settle = bleed ? interpolate(f, [lead, lead + 30], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) }) : 1;
  const bleedScale = 1920 / FRAME.w;
  const scale0 = interpolate(settle, [0, 1], [bleedScale, 1]);
  const ox = interpolate(settle, [0, 1], [-FRAME.x, 0]);
  const oy = interpolate(settle, [0, 1], [-FRAME.y, 0]);

  // punch-in toward the ringed element while a caption with `punch` shows
  let punch = 1;
  let origin = '50% 50%';
  for (const c of captions) {
    if (!c.punch || !c.ring) continue;
    const m = meta.marks.find((x) => x.name === c.ring && x.box);
    if (!m?.box) continue;
    const p = interpolate(local, [c.at, c.at + 0.9, c.until - 0.6, c.until], [0, 1, 1, 0], { ...clamp, easing: Easing.inOut(Easing.cubic) });
    if (p > 0) {
      punch = 1 + (c.punch - 1) * p;
      origin = `${((m.box.x + m.box.w / 2) * k).toFixed(0)}px ${((m.box.y + m.box.h / 2) * k).toFixed(0)}px`;
    }
  }

  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 40%, #191a1f 0%, ${CHAR} 70%)`, opacity: fadeIn }}>
      <div
        style={{
          position: 'absolute',
          left: FRAME.x,
          top: FRAME.y,
          width: FRAME.w,
          height: FRAME.h,
          transform: `translate(${ox}px, ${oy}px) scale(${scale0})`,
          transformOrigin: '0 0',
          borderRadius: 14 * settle,
          overflow: 'hidden',
          boxShadow: settle > 0.5 ? '0 0 0 1px rgba(255,238,205,0.14), 0 24px 80px rgba(0,0,0,0.6), 0 0 60px rgba(245,150,50,0.10)' : 'none',
        }}
      >
        <div style={{ position: 'absolute', inset: 0, transform: `scale(${punch})`, transformOrigin: origin }}>
          <OffthreadVideo src={clipUrl(shot.clip as string)} trimBefore={trimBefore} playbackRate={rate} muted style={{ width: FRAME.w, height: FRAME.h }} />
          {captions.map((c, i) => {
            if (!c.ring) return null;
            const m = meta.marks.find((x) => x.name === c.ring && x.box);
            if (!m?.box) return null;
            const b = { x: m.box.x * k, y: m.box.y * k, w: m.box.w * k, h: m.box.h * k };
            return <Ring key={i} box={b} t={local} at={c.at} until={c.until} seed={i + 3} />;
          })}
          {meta.clicks.map((c, i) => (
            <ClickRipple key={i} x={c.x * k} y={c.y * k} t={clipT} at={c.t} />
          ))}
        </div>
        {shot.chapter && local >= 0 ? <Chapter t={local} text={shot.chapter} /> : null}
      </div>
      <div style={{ opacity: settle }}>
        <Captions t={local} captions={captions} top={FRAME.y + FRAME.h + 26} sub={(s) => s.replace('{liveNote}', liveNote(meta))} />
      </div>
      <Grain frame={f} opacity={0.05} />
    </AbsoluteFill>
  );
}
