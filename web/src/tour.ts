// Presentation mode (?tour=1): a scripted walk through the real app for demo
// videos and briefings. Every step drives the normal UI with real data; the
// captions come from i18n. Space pauses, → skips ahead, Esc ends the tour.
// ?pace=1.5 slows every step down by half.

import { t, type Key } from './i18n';

export interface TourApi {
  region(): string;
  setRegion(id: string, mode: 'live' | 'replay', date?: string): Promise<void>;
  setMode(mode: 'live' | 'replay', date?: string): Promise<void>;
  select(date: string): void;
  replayDays(): string[];
  openDistrict(code: string): boolean;
  openPuskesmas(name: RegExp): boolean;
  openBrief(): void;
  closePanel(): void;
  flyIn(duration?: number): void;
  flyGlobe(): void;
}

interface Step {
  caption: Key;
  ms: number;
  run?: (api: TourApi, wait: (ms: number) => Promise<void>) => Promise<void> | void;
}

const STEPS: Step[] = [
  { caption: 'tour1', ms: 5000, run: (api) => api.flyGlobe() },
  {
    caption: 'tour2',
    ms: 7000,
    run: async (api) => {
      await api.setRegion('kalimantan', 'replay', '2026-10-01');
      api.flyIn(6000);
    },
  },
  {
    caption: 'tour3',
    ms: 1500,
    run: async (api, wait) => {
      for (const d of api.replayDays().filter((x) => x <= '2026-10-14')) {
        api.select(d);
        await wait(650);
      }
    },
  },
  { caption: 'tour4', ms: 6000 },
  { caption: 'tour5', ms: 7000, run: (api) => void api.openDistrict('KT-pulang-pisau') },
  { caption: 'tour6', ms: 8000, run: (api) => void api.openPuskesmas(/anjir serapat/i) },
  { caption: 'tour7', ms: 9000, run: (api) => api.openBrief() },
  {
    caption: 'tour8',
    ms: 8000,
    run: async (api) => {
      api.closePanel();
      await api.setRegion('sumatra', 'replay', '2026-10-07');
    },
  },
  {
    caption: 'tour9',
    ms: 7000,
    run: async (api) => {
      await api.setRegion('kalimantan', 'live');
    },
  },
  { caption: 'tour10', ms: 6000 },
];

export async function runTour(api: TourApi, pace = 1): Promise<void> {
  const k = Math.min(4, Math.max(0.25, pace));
  const bar = document.createElement('div');
  bar.id = 'tour';
  bar.innerHTML = `<div class="caption"></div><div class="controls">${t('tourControls')}</div>`;
  document.body.append(bar);
  const caption = bar.querySelector('.caption') as HTMLElement;
  let paused = false;
  let skip = false;
  let stopped = false;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === ' ') {
      paused = !paused;
      bar.classList.toggle('paused', paused);
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      skip = true;
    } else if (e.key === 'Escape') {
      stopped = true;
    }
  };
  window.addEventListener('keydown', onKey);
  // Waits that respect pause, skip, and stop.
  const wait = async (ms: number) => {
    let left = ms * k;
    while (left > 0 && !skip && !stopped) {
      await new Promise((r) => setTimeout(r, 100));
      if (!paused) left -= 100;
    }
  };
  try {
    for (const step of STEPS) {
      if (stopped) break;
      skip = false;
      caption.textContent = t(step.caption);
      bar.classList.remove('show');
      void bar.offsetWidth; // restart the fade-in
      bar.classList.add('show');
      await step.run?.(api, wait);
      await wait(step.ms);
    }
  } finally {
    window.removeEventListener('keydown', onKey);
    bar.remove();
  }
}
