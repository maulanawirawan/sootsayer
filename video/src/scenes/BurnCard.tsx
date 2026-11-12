// Chapter card that writes itself and then burns away into the shot under
// it: the cold open's fire, carried into every chapter. three.js, no assets:
// the card is drawn into a canvas with the film's fonts and burnt in GLSL.
import { ThreeCanvas } from '@remotion/three';
import { useEffect, useMemo, useState } from 'react';
import { continueRender, delayRender, Easing, interpolate, useCurrentFrame } from 'remotion';
import * as THREE from 'three';
import { EMBER, INK, sans, serif } from '../fonts';
import { CARD_FRAG, CARD_VERT } from '../three/glsl';
import { FPS } from '../timeline';

// write, hold to read, then burn from the bottom up so the title goes last
export const CARD = { write: [0.2, 1.0], burn: [1.6, 2.55], seconds: 2.55 } as const;
const W = 1920;
const H = 1080;
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

const quoted = (family: string) => `"${family.replace(/["']/g, '')}"`;

function drawCard(kicker: string, title: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.clearRect(0, 0, W, H);
  g.textAlign = 'center';
  g.fillStyle = EMBER;
  g.font = `600 30px ${quoted(sans)}`;
  const spaced = kicker.toUpperCase().split('').join(String.fromCharCode(8202));
  g.fillText(spaced, W / 2, H / 2 - 92);
  g.fillStyle = INK;
  g.font = `700 132px ${quoted(serif)}`;
  g.fillText(title, W / 2, H / 2 + 40);
  g.strokeStyle = EMBER;
  g.globalAlpha = 0.7;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(W / 2 - 160, H / 2 + 92);
  g.lineTo(W / 2 + 160, H / 2 + 92);
  g.stroke();
  return c;
}

function Card({ kicker, title, t }: { kicker: string; title: string; t: number }) {
  const material = useMemo(() => {
    const tex = new THREE.CanvasTexture(drawCard(kicker, title));
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.ShaderMaterial({
      vertexShader: CARD_VERT,
      fragmentShader: CARD_FRAG,
      uniforms: {
        uCard: { value: tex },
        uWrite: { value: 0 },
        uBurn: { value: 0 },
        uAspect: { value: W / H },
        uOrigin: { value: new THREE.Vector2(0.5, -0.15) },
      },
      transparent: true,
      depthTest: false,
    });
  }, [kicker, title]);
  material.uniforms.uWrite.value = interpolate(t, [...CARD.write], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
  material.uniforms.uBurn.value = interpolate(t, [...CARD.burn], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
  return (
    <mesh material={material} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}

/** `chapter` is "2/3  Built with Kiro": the number becomes the kicker. */
export function BurnCard({ chapter }: { chapter: string }) {
  const f = useCurrentFrame();
  const t = f / FPS;
  const [n, ...rest] = chapter.split('  ');
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender('card fonts'));
  useEffect(() => {
    Promise.all([document.fonts.load(`700 132px ${quoted(serif)}`), document.fonts.load(`600 30px ${quoted(sans)}`)])
      .then(() => {
        setReady(true);
        continueRender(handle);
      })
      .catch(() => {
        setReady(true);
        continueRender(handle);
      });
  }, [handle]);
  if (t > CARD.seconds) return null;
  return ready ? (
    <ThreeCanvas width={W} height={H} gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }} style={{ position: 'absolute', inset: 0, zIndex: 20 }}>
      <Card kicker={`Chapter ${n.replace('/', ' / ')}`} title={rest.join(' ')} t={t} />
    </ThreeCanvas>
  ) : null;
}
