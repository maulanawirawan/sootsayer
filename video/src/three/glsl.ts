// GLSL for the charcoal cold open. Everything is procedural: paper fibres,
// hatching, embers and the burn are noise and maths, no textures or models.

export const NOISE = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int k = 0; k < 5; k++){ s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
`;

export const PAPER_VERT = /* glsl */ `
varying vec2 vMap;   // lon, lat
void main(){
  vMap = position.xy + vec2(113.0, 0.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const PAPER_FRAG = /* glsl */ `
${NOISE}
uniform float uTime, uDusk, uHatch, uBurn;
uniform sampler2D uPm;
uniform vec4 uPmBox;       // lon0, lat0, lon span, lat span
uniform vec2 uBurnOrigin;  // lon, lat
uniform vec2 uRes;         // canvas size in pixels
varying vec2 vMap;

// >= 0 everywhere, so nothing burns before uBurn rises (see the -0.12 below)
float burnField(vec2 m){
  return distance(m, uBurnOrigin) / 14.0 + fbm(m * 0.55 + 3.0) * 0.42;
}

void main(){
  // paper: low-frequency mottling + fibres + tooth
  float mott = fbm(vMap * 0.35);
  float fib = fbm(vec2(vMap.x * 9.0, vMap.y * 2.2) + 5.0);
  float tooth = vnoise(vMap * 85.0);
  vec3 paper = mix(vec3(0.925, 0.895, 0.83), vec3(0.85, 0.81, 0.73), mott * 0.7);
  paper -= (fib - 0.5) * 0.035 + (tooth - 0.5) * 0.03;

  // smoke as charcoal hatching, density from CAMS PM2.5 (texture is pm / 500)
  vec2 uv = (vMap - uPmBox.xy) / uPmBox.zw;
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  float pm = texture2D(uPm, uv).r * inside;
  float dens = smoothstep(0.03, 0.75, pm) * uHatch;
  float wob = (fbm(vMap * 1.7 + uTime * 0.05) - 0.5) * 0.9;
  float d1 = abs(fract((vMap.x + vMap.y) * 5.2 + wob) - 0.5);
  float d2 = abs(fract((vMap.x - vMap.y) * 5.2 - wob * 0.7 + 0.25) - 0.5);
  float w1 = 0.04 + 0.30 * dens;
  float w2 = 0.30 * smoothstep(0.45, 1.0, dens);
  float grain = 0.65 + 0.35 * vnoise(vMap * 40.0);
  float stroke = max(smoothstep(w1, w1 - 0.06, d1) * step(0.02, dens), smoothstep(w2, w2 - 0.06, d2) * step(0.01, w2));
  float ink = stroke * grain * smoothstep(0.0, 0.15, dens);

  // dusk: the smoke dims the page, so the embers read as light
  vec2 ndc = gl_FragCoord.xy / uRes * 2.0 - 1.0;
  float vig = 1.0 - smoothstep(0.45, 1.5, length(ndc * vec2(0.9, 1.0)));
  vec3 col = paper * mix(1.0, 0.4, uDusk) * mix(1.0, vig, 0.25 + 0.3 * uDusk);
  // charcoal hatching darkens the light page; on the dark page it turns to pale smoke
  col = mix(col * (1.0 - 0.62 * ink), col + vec3(0.30, 0.27, 0.24) * ink, uDusk);

  // burn: a front from the fires outward, charred band, glowing edge, then a hole
  float e = uBurn * 1.6 - burnField(vMap) - 0.12;
  if (e > 0.06) discard;
  float glow = smoothstep(-0.005, 0.03, e) * (1.0 - smoothstep(0.03, 0.06, e));
  float char = smoothstep(-0.10, -0.005, e);
  col = mix(col, col * 0.18 + vec3(0.06, 0.03, 0.02), char * 0.92);
  col += vec3(1.0, 0.42, 0.08) * glow * 1.35 + vec3(1.0, 0.82, 0.5) * glow * glow * 0.55;
  gl_FragColor = vec4(col, 1.0);
}
`;

// Same front as the paper's burn: points go out with the paper they sit on.
const BURNT = /* glsl */ `
float burntAway(vec3 p, float burn, vec2 origin){
  vec2 m = p.xy + vec2(113.0, 0.0);
  float e = burn * 1.6 - (distance(m, origin) / 14.0 + fbm(m * 0.55 + 3.0) * 0.42) - 0.12;
  return smoothstep(-0.02, 0.05, e);
}
`;

export const EMBER_VERT = /* glsl */ `
${NOISE}
${BURNT}
attribute float aSeed;
attribute float aHeat;
attribute float aT0;
uniform float uTime, uSize, uBurn;
uniform vec2 uBurnOrigin;
varying float vA;
varying float vHeat;
void main(){
  float age = uTime - aT0;
  vA = smoothstep(0.0, 0.35, age) * (1.0 - burntAway(position, uBurn, uBurnOrigin));
  float flick = 0.72 + 0.28 * sin(uTime * 9.0 + aSeed * 41.0) * sin(uTime * 5.3 + aSeed * 17.0);
  vHeat = aHeat * flick;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize * (0.55 + vHeat) * (260.0 / -mv.z) * vA;
  gl_Position = projectionMatrix * mv;
}
`;

export const EMBER_FRAG = /* glsl */ `
uniform float uDusk;
varying float vA;
varying float vHeat;
void main(){
  vec2 p = gl_PointCoord - 0.5;
  float r = length(p);
  if (r > 0.5) discard;
  float core = smoothstep(0.16, 0.0, r);
  float halo = smoothstep(0.5, 0.05, r);
  vec3 col = mix(vec3(0.78, 0.18, 0.03), vec3(1.0, 0.86, 0.45), core * vHeat);
  float a = (halo * (0.35 + 0.35 * uDusk) + core) * vA;
  gl_FragColor = vec4(col * (0.75 + 0.7 * vHeat), a);
}
`;

export const RING_VERT = /* glsl */ `
${NOISE}
${BURNT}
attribute float aT0;
uniform float uTime, uSize, uPulse, uBurn;
uniform vec2 uBurnOrigin;
varying float vA;
void main(){
  vA = smoothstep(0.0, 0.5, uTime - aT0) * (1.0 - burntAway(position, uBurn, uBurnOrigin));
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize * (1.0 + 0.35 * uPulse) * (260.0 / -mv.z) * vA;
  gl_Position = projectionMatrix * mv;
}
`;

export const RING_FRAG = /* glsl */ `
uniform float uPulse;
varying float vA;
void main(){
  float r = length(gl_PointCoord - 0.5);
  float ring = smoothstep(0.46, 0.40, r) * smoothstep(0.26, 0.32, r);
  float dot = smoothstep(0.12, 0.06, r);
  float a = max(ring, dot) * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(mix(vec3(0.95, 0.92, 0.85), vec3(1.0, 0.75, 0.35), uPulse), a * (0.85 + 0.15 * uPulse));
}
`;

// Chapter card: the card (a canvas texture) writes itself in from the left
// with an ember edge, then burns away from a point, showing the shot below.
export const CARD_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export const CARD_FRAG = /* glsl */ `
${NOISE}
uniform sampler2D uCard;
uniform float uWrite, uBurn, uAspect;
uniform vec2 uOrigin;   // burn origin in uv
varying vec2 vUv;
void main(){
  vec4 card = texture2D(uCard, vUv);
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  // ink written in from the left, with a soft hot edge
  float wx = uWrite * 1.15 - 0.05;
  float ink = smoothstep(wx + 0.02, wx - 0.02, vUv.x + (vnoise(vec2(vUv.y * 40.0, 3.0)) - 0.5) * 0.02);
  float edge = smoothstep(0.03, 0.0, abs(vUv.x - wx)) * step(0.001, uWrite) * step(uWrite, 0.999);
  vec3 bg = vec3(0.043, 0.047, 0.059) * (0.85 + 0.3 * fbm(p * 3.0));
  float vig = 1.0 - smoothstep(0.35, 1.05, length((vUv - 0.5) * vec2(1.2, 1.0)));
  bg *= 0.7 + 0.3 * vig;
  vec3 col = mix(bg, card.rgb, card.a * ink);
  col += vec3(1.0, 0.55, 0.15) * edge * card.a * 1.5;
  // burn from uOrigin outward, same look as the cold open's paper
  vec2 o = vec2(uOrigin.x * uAspect, uOrigin.y);
  float field = distance(p, o) / 1.1 + fbm(p * 4.0 + 7.0) * 0.38;
  float e = uBurn * 2.0 - field - 0.08;
  if (e > 0.05) discard;
  float glow = smoothstep(-0.004, 0.025, e) * (1.0 - smoothstep(0.025, 0.05, e));
  float charr = smoothstep(-0.09, -0.004, e);
  col = mix(col, col * 0.15 + vec3(0.05, 0.025, 0.015), charr * 0.9);
  col += vec3(1.0, 0.42, 0.08) * glow * 1.4 + vec3(1.0, 0.82, 0.5) * glow * glow * 0.6;
  gl_FragColor = vec4(col, 1.0);
}
`;

export const SPARK_VERT = /* glsl */ `
attribute float aField;
attribute float aSeed;
uniform float uTime, uBurn, uBurnStart;
varying float vA;
void main(){
  // time at which the burn front reaches this spark: uBurn * 1.6 = aField
  float age = clamp((uBurn * 1.6 - aField - 0.12) / 0.12, 0.0, 6.0);
  vec3 p = position + vec3(sin(aSeed * 31.0) * 0.22 * age, 0.12 * age + cos(aSeed * 17.0) * 0.1 * age, age * (0.12 + aSeed * 0.18));
  vA = step(0.0001, age) * (1.0 - smoothstep(0.6, 3.0, age));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = (1.2 + 2.6 * aSeed) * (110.0 / -mv.z) * vA;
  gl_Position = projectionMatrix * mv;
}
`;

export const SPARK_FRAG = /* glsl */ `
varying float vA;
void main(){
  float r = length(gl_PointCoord - 0.5);
  if (r > 0.5) discard;
  float c = smoothstep(0.5, 0.0, r);
  gl_FragColor = vec4(vec3(1.0, 0.62, 0.18) * (0.6 + c), c * vA);
}
`;
