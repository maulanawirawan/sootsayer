import { Composition } from 'remotion';
import { Demo, demoFrames } from './Demo';
import { ColdOpen, COLD_OPEN_FRAMES } from './scenes/ColdOpen';
import { FPS } from './timeline';

export const Root = () => (
  <>
    <Composition id="Demo" component={Demo} durationInFrames={demoFrames()} fps={FPS} width={1920} height={1080} />
    <Composition id="ColdOpen" component={ColdOpen} durationInFrames={COLD_OPEN_FRAMES} fps={FPS} width={1920} height={1080} />
  </>
);
