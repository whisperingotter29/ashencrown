// Day/night cycle, biome-tinted light, fog and lightning for the pixel renderer. The scene's
// ambient colour multiplies everything (dark blue nights, warm golden hours); point lights from
// torches, spells and lanterns punch through it. Dungeons and the Deep override the outdoors.
import { R } from '../render/renderer.js';
import { BIOMES } from '../data/world.js';
import { clamp, lerp, smoothstep } from '../core/math.js';
import { C } from '../px/pix.js';

export const DAY_LENGTH = 24 * 60; // real seconds per in-game day

export const atmo = {
  timeOfDay: 0.33,      // 0 midnight, .25 dawn, .5 noon, .75 dusk
  day: 1,
  biome: 'wastes',
  overcast: 0, storm: 0, fogBoost: 0, darkness: 0,
  lightning: 0,
  indoor: false,        // dungeons override everything
  indoorCfg: null,
  freezeTime: false,
  sky: { visible: true }, // compatibility: there is no sky dome in top-down
  mix: null,
};

const rgb = (h) => { const c = C(h); return [c[0] / 255, c[1] / 255, c[2] / 255]; };
const mixv = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
function paletteFor(id) {
  const b = BIOMES[id];
  return { sun: rgb(b.sun), fog: rgb(b.fog), fogNight: rgb(b.fogNight), warm: b.grade?.warm || 0 };
}
const PAL = Object.fromEntries(Object.keys(BIOMES).map((k) => [k, paletteFor(k)]));

export function initAtmosphere() { atmo.mix = { ...paletteFor('wastes') }; }

export function sunElevation() { return Math.sin((atmo.timeOfDay - 0.25) * Math.PI * 2); }
export function isNight() { return sunElevation() < -0.08; }
export function timePhase() {
  const t = atmo.timeOfDay;
  if (t < 0.22 || t > 0.8) return 'night';
  if (t < 0.3) return 'dawn';
  if (t > 0.7) return 'dusk';
  return 'day';
}
export function clockString() {
  const mins = Math.floor(atmo.timeOfDay * 24 * 60);
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const NIGHT = [0.3, 0.34, 0.56], GOLD = [1.0, 0.8, 0.62], GREY = [0.78, 0.8, 0.84];
export function updateAtmosphere(dt, focus, camDist, weather) {
  if (!atmo.freezeTime) {
    atmo.timeOfDay += dt / DAY_LENGTH;
    if (atmo.timeOfDay >= 1) { atmo.timeOfDay -= 1; atmo.day++; }
  }
  R.white = Math.max(R.white * Math.exp(-dt * 10), atmo.lightning * 0.55);
  atmo.lightning = Math.max(0, atmo.lightning - dt * 4);
  if (atmo.indoor) { applyIndoor(); return; }

  // blend toward the biome under the player
  const P = atmo.mix, T = PAL[atmo.biome] || PAL.gilded, k = 1 - Math.exp(-dt * 0.8);
  P.sun = mixv(P.sun, T.sun, k); P.fog = mixv(P.fog, T.fog, k); P.fogNight = mixv(P.fogNight, T.fogNight, k); P.warm = lerp(P.warm, T.warm, k);

  const elev = sunElevation();
  const day = smoothstep(-0.12, 0.18, elev);
  const golden = smoothstep(0.42, 0.04, elev) * smoothstep(-0.14, 0.04, elev);
  const night = 1 - day;
  const ov = weather.overcast || 0, st = weather.storm || 0;
  atmo.overcast = ov; atmo.storm = st;

  // daylight: near-white, gently tinted by the biome sun; warm at golden hour; deep blue at night
  let amb = mixv([1, 1, 1], mixv([1, 1, 1], P.sun, 0.18), 1);
  amb = mixv(amb, GOLD, golden * 0.7);
  amb = mixv(amb, GREY, ov * 0.55 * day);
  amb = mixv(amb, NIGHT, night);
  const dim = lerp(1, 0.72, st) * lerp(1, 0.9, ov);
  R.ambient = amb.map((v) => clamp(v * dim, 0, 1));
  R.lightBoost = lerp(1, 1.25, night);

  // fog: weather fog and storms veil the view in the biome's fog colour
  let fog = mixv(P.fog, P.fogNight, night);
  if (weather.fogTint) fog = mixv(fog, rgb(typeof weather.fogTint === 'string' ? weather.fogTint : '#' + weather.fogTint.getHexString?.()), weather.fogTintAmt || 0);
  R.fog.color = fog.map((v) => Math.round(v * 255));
  R.fog.amount = clamp((weather.fog || 0) * 0.42 + st * 0.12 + (atmo.fogBoost || 0), 0, 0.7);
  R.vignette = 0.5 + night * 0.15;
}

function applyIndoor() {
  const cfg = atmo.indoorCfg || { fog: '#0a0808', ambient: '#403040', light: '#ffa050' };
  if (cfg.deep) {
    R.ambient = [0.48, 0.52, 0.7];
    R.fog.amount = 0.08; R.fog.color = [20, 24, 40];
  } else {
    const a = rgb(cfg.ambient || '#c8b4a4');
    R.ambient = a.map((v) => v * 0.3 + 0.05);
    const f = C(cfg.fog);
    R.fog.amount = 0; R.fog.color = [f[0], f[1], f[2]];
  }
  R.lightBoost = 1.15;
  R.vignette = 0.7;
}
