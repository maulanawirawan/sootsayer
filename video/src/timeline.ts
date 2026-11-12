import { staticFile } from 'remotion';
import raw from './timeline.json';

export const FPS = raw.fps;

export interface Caption {
  at: number;
  until: number;
  /** `*word*` marks the one ember word of the line. */
  text: string;
  sub?: string;
  /** Name of a mark recorded with the clip (element box): the camera pushes in on it and a charcoal ring is drawn. */
  ring?: string;
  /** Zoom override; by default the zoom makes the ringed box comfortably readable. */
  punch?: number;
  /** A low hit lands with this caption (sparingly: the biggest number of the film). */
  hit?: boolean;
}

export interface Shot {
  id: string;
  kind: 'cold' | 'app' | 'kiro' | 'end';
  seconds: number;
  clip?: string;
  from?: number;
  rate?: number;
  chapter?: string;
  /** Show the chapter as a small label over the footage (no title card). */
  label?: boolean;
  panel?: 'spec' | 'hooks' | 'tests' | 'mcp';
  /** Hooks panel: seconds (after the panel starts) at which each "caught" stamp lands. */
  stamps?: number[];
  captions?: Caption[];
  optional?: boolean;
}

export interface Placed extends Shot {
  start: number; // frame
  frames: number;
}

/** Shots placed one after another. Optional shots are kept only when their clip
 * exists, and chapters are numbered over the shots that remain ("2/4  Title"). */
export function placeShots(available: Set<string>): Placed[] {
  let t = 0;
  const out: Placed[] = [];
  for (const s of raw.shots as Shot[]) {
    if (s.optional && s.clip && !available.has(s.clip)) continue;
    const frames = Math.round(s.seconds * FPS);
    out.push({ ...s, start: t, frames });
    t += frames;
  }
  const chapters = out.filter((s) => s.chapter);
  chapters.forEach((s, i) => (s.chapter = `${i + 1}/${chapters.length}  ${s.chapter}`));
  return out;
}

export const clipUrl = (name: string) => staticFile(`clips/${name}.mp4`);
