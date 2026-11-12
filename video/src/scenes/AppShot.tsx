// A shot of the real app: the recorded clip in a charcoal frame, a subtitle
// and source line below it, and a camera on the recording: for every caption
// with a ring it pushes in on the element being explained (so the ring and
// the number are readable), holds still, then moves on. A ripple marks clicks.
import { AbsoluteFill, Easing, interpolate, OffthreadVideo, useCurrentFrame } from 'remotion';
import type { ClipMeta } from '../Demo';
import { CHAR } from '../fonts';
import { clipUrl, FPS, type Caption, type Placed } from '../timeline';
import { Captions, ChapterLabel } from '../ui/Caption';
import { Grain } from '../ui/Grain';
import { ClickRipple, Ring } from '../ui/Ring';

export const FRAME = { x: 192, y: 34, w: 1536, h: 864 };
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const ease = Easing.inOut(Easing.cubic);

type Box = { x: number; y: number; w: number; h: number };
type View = { x: number; y: number; s: number };
const HOME: View = { x: 0, y: 0, s: 1 };

/** Zoom that makes the box comfortably readable: ~46% of the frame width or ~34% of its height. */
function autoZoom(b: Box): number {
  return Math.min(2.4, Math.max(1.3, Math.min((FRAME.w * 0.46) / b.w, (FRAME.h * 0.34) / b.h)));
}

/** The view (top-left in frame px, and zoom) that centres the box as far as the frame allows. */
function viewOn(b: Box, s: number): View {
  const vw = FRAME.w / s;
  const vh = FRAME.h / s;
  const x = Math.min(Math.max(b.x + b.w / 2 - vw / 2, 0), FRAME.w - vw);
  const y = Math.min(Math.max(b.y + b.h / 2 - vh / 2, 0), FRAME.h - vh);
  return { x, y, s };
}

function lerpView(a: View, b: View, p: number): View {
  // zoom interpolates in log space so a push-in reads as a constant camera speed
  const s = Math.exp(Math.log(a.s) + (Math.log(b.s) - Math.log(a.s)) * p);
  return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p, s };
}

/** Camera keyframes over the shot's local time: home -> each ringed box -> home, never two cuts. */
function cameraAt(t: number, captions: Caption[], boxOf: (name: string) => Box | null): View {
  const stops: { t0: number; t1: number; v: View }[] = [];
  for (const c of captions) {
    const b = c.ring ? boxOf(c.ring) : null;
    if (!b) continue;
    stops.push({ t0: c.at, t1: c.until, v: viewOn(b, c.punch ?? autoZoom(b)) });
  }
  if (!stops.length) return HOME;
  const IN = 0.9;
  const OUT = 0.75;
  let prev: View = HOME;
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    const next = stops[i + 1];
    if (t < s.t0) return prev === HOME ? HOME : prev;
    if (t < s.t0 + IN) return lerpView(prev, s.v, ease((t - s.t0) / IN));
    // move straight on to the next box when it follows closely; otherwise come back out
    const chained = next && next.t0 - s.t1 < 0.9;
    const leaveAt = chained ? next.t0 : s.t1 - OUT;
    if (t < leaveAt) return s.v;
    if (chained) {
      prev = s.v;
      continue;
    }
    if (t < s.t1) return lerpView(s.v, HOME, ease((t - leaveAt) / OUT));
    prev = HOME;
  }
  return HOME;
}

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
 * the frame; between other shots the lead is a short push-through.
 */
export function AppShot({ shot, meta, lead, bleed }: { shot: Placed; meta: ClipMeta; lead: number; bleed: boolean }) {
  const f = useCurrentFrame();
  const local = (f - lead) / FPS; // seconds since the shot's own slot began
  const rate = shot.rate ?? 1;
  const trimBefore = Math.max(0, Math.round(((shot.from ?? 0) - (lead / FPS) * rate) * FPS));
  const clipT = trimBefore / FPS + (f / FPS) * rate; // clip seconds on screen
  const k = FRAME.w / meta.viewport.width; // CSS px of the recording -> frame px
  const captions = shot.captions ?? [];
  const boxOf = (name: string): Box | null => {
    const m = meta.marks.find((x) => x.name === name && x.box);
    return m?.box ? { x: m.box.x * k, y: m.box.y * k, w: m.box.w * k, h: m.box.h * k } : null;
  };

  // full-bleed under the burning paper, then settle into the frame
  const settle = bleed ? interpolate(f, [lead, lead + 30], [0, 1], { ...clamp, easing: ease }) : 1;
  const bleedScale = 1920 / FRAME.w;
  const scale0 = interpolate(settle, [0, 1], [bleedScale, 1]);
  const ox = interpolate(settle, [0, 1], [-FRAME.x, 0]);
  const oy = interpolate(settle, [0, 1], [-FRAME.y, 0]);
  // push-through from the previous shot
  const enter = bleed || !lead ? 1 : interpolate(f, [0, lead], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const enterScale = 1 + 0.06 * (1 - enter);
  const enterBlur = 7 * (1 - enter);

  const cam = cameraAt(local, captions, boxOf);
  // a short, decaying shake when the film's biggest number lands
  const hit = captions.find((c) => c.hit);
  const age = hit ? local - (hit.at + 0.85) : -1;
  const shake = age > 0 && age < 0.45 ? 5 * Math.exp(-age * 9) : 0;
  const sx = shake * Math.sin(f * 2.7);
  const sy = shake * Math.cos(f * 3.3);

  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 40%, #191a1f 0%, ${CHAR} 70%)`, opacity: enter }}>
      <div
        style={{
          position: 'absolute',
          left: FRAME.x,
          top: FRAME.y,
          width: FRAME.w,
          height: FRAME.h,
          transform: `translate(${ox + sx}px, ${oy + sy}px) scale(${scale0 * enterScale})`,
          transformOrigin: bleed ? '0 0' : '50% 50%',
          filter: enterBlur > 0.2 ? `blur(${enterBlur.toFixed(1)}px)` : undefined,
          borderRadius: 14 * settle,
          overflow: 'hidden',
          boxShadow: settle > 0.5 ? '0 0 0 1px rgba(255,238,205,0.14), 0 24px 80px rgba(0,0,0,0.6), 0 0 60px rgba(245,150,50,0.10)' : 'none',
        }}
      >
        <div style={{ position: 'absolute', left: 0, top: 0, width: FRAME.w, height: FRAME.h, transformOrigin: '0 0', transform: `scale(${cam.s}) translate(${-cam.x}px, ${-cam.y}px)` }}>
          <OffthreadVideo src={clipUrl(shot.clip as string)} trimBefore={trimBefore} playbackRate={rate} muted style={{ width: FRAME.w, height: FRAME.h }} />
          {captions.map((c, i) => {
            const b = c.ring ? boxOf(c.ring) : null;
            return b ? <Ring key={i} box={b} t={local} at={c.at + 0.75} until={c.until} seed={i + 3} zoom={c.punch ?? autoZoom(b)} /> : null;
          })}
          {meta.clicks.map((c, i) => (
            <ClickRipple key={i} x={c.x * k} y={c.y * k} t={clipT} at={c.t} />
          ))}
        </div>
      </div>
      {shot.chapter && shot.label ? <ChapterLabel t={local} text={shot.chapter} left={FRAME.x + 4} top={6} /> : null}
      <div style={{ opacity: settle }}>
        <Captions t={local} captions={captions} top={FRAME.y + FRAME.h + 22} sub={(s) => s.replace('{liveNote}', liveNote(meta))} />
      </div>
      <Grain frame={f} opacity={0.05} />
    </AbsoluteFill>
  );
}
