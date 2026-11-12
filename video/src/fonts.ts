// Open-licensed fonts (SIL Open Font License) from Google Fonts.
import { loadFont as loadCaveat } from '@remotion/google-fonts/Caveat';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';

import { loadFont as loadSerif } from '@remotion/google-fonts/CormorantGaramond';

export const serif = loadSerif('normal', { weights: ['600', '700'], subsets: ['latin'] }).fontFamily;
export const hand = loadCaveat('normal', { weights: ['500', '700'], subsets: ['latin'] }).fontFamily;
export const sans = loadInter('normal', { weights: ['400', '500', '600', '700'], subsets: ['latin'] }).fontFamily;
export const mono = loadMono('normal', { weights: ['400', '600'], subsets: ['latin'] }).fontFamily;

export const INK = '#f2ebdd';
export const MUTED = '#a89f90';
export const EMBER = '#f5a524';
export const CHAR = '#0d0e11';
