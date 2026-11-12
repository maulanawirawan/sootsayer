import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import clips from './clips.generated.json';
import { CHAR } from './fonts';
import { AppShot } from './scenes/AppShot';
import { ColdOpen } from './scenes/ColdOpen';
import { EndCard } from './scenes/EndCard';
import { KiroShot } from './scenes/KiroShot';
import { FPS, placeShots } from './timeline';

export type ClipMeta = {
  name: string;
  seconds: number;
  viewport: { width: number; height: number };
  marks: { name: string; t: number; box: { x: number; y: number; w: number; h: number; text?: string } | null }[];
  clicks: { t: number; x: number; y: number }[];
};

const META = clips as Record<string, ClipMeta>;
const shots = placeShots(new Set(Object.keys(META)));
/** The fly-in clip starts under the burning paper, this long before its own slot. */
export const LEAD = Math.round(4.5 * FPS);
/** Every later shot fades in over the end of the previous one. */
export const XFADE = 9;

export const demoFrames = () => shots[shots.length - 1].start + shots[shots.length - 1].frames;

export function Demo() {
  return (
    <AbsoluteFill style={{ background: CHAR }}>
      {shots.map((s, i) => {
        const afterCold = i > 0 && shots[i - 1].kind === 'cold';
        const lead = afterCold ? LEAD : i > 0 ? XFADE : 0;
        if (s.kind === 'app' && s.clip) {
          return (
            <Sequence key={s.id} from={s.start - lead} durationInFrames={s.frames + lead} name={s.id}>
              <AppShot shot={s} meta={META[s.clip]} lead={lead} bleed={afterCold} />
            </Sequence>
          );
        }
        if (s.kind === 'kiro')
          return (
            <Sequence key={s.id} from={s.start - lead} durationInFrames={s.frames + lead} name={s.id}>
              <KiroShot shot={s} lead={lead} />
            </Sequence>
          );
        if (s.kind === 'end')
          return (
            <Sequence key={s.id} from={s.start - lead} durationInFrames={s.frames + lead} name={s.id}>
              <EndCard lead={lead} />
            </Sequence>
          );
        return null;
      })}
      {/* The cold open is drawn last so the app shows through the burnt paper. */}
      {shots
        .filter((s) => s.kind === 'cold')
        .map((s) => (
          <Sequence key={s.id} from={s.start} durationInFrames={s.frames} name={s.id}>
            <ColdOpen chapter={s.chapter} />
          </Sequence>
        ))}
      <Audio src={staticFile('audio/score.wav')} />
    </AbsoluteFill>
  );
}
