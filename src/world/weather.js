// Weather: each biome cycles its own weather; crisp pixel layers (rain streaks, snow, sand,
// embers) wrap around the view, with lightning strikes and ground splashes. Fog and haze drift as
// big dithered banks in the biome's own muted tone rather than washing the whole view (see
// docs/ART_STYLE.md); particle colours come from the master palette.
import { lightning as boltFx, flash, burst } from '../render/vfx.js';
import { scene } from '../px/scene.js';
import { ART, ap, bayer } from '../px/pix.js';
import { R } from '../render/renderer.js';
import { view } from '../px/view.js';
import { BIOMES } from '../data/world.js';
import { G } from '../game.js';
import { atmo, isNight } from './atmosphere.js';
import { RNG } from '../core/rng.js';
import { damp, lerp } from '../core/math.js';
import { bus } from '../core/events.js';

export const WEATHER_DEFS = {
  clear: { name: 'Clear', overcast: 0, storm: 0, fog: 0, layers: [] },
  haze: { name: 'Heat Haze', overcast: 0.15, storm: 0, fog: 0.45, fogTint: '#a8705a', fogTintAmt: 0.3, layers: [['dust', 0.5]] },
  cloudy: { name: 'Overcast', overcast: 0.6, storm: 0, fog: 0.15, layers: [] },
  rain: { name: 'Rain', overcast: 0.85, storm: 0.3, fog: 0.35, layers: [['rain', 0.6]], wet: true },
  thunderstorm: { name: 'Thunderstorm', overcast: 1, storm: 1, fog: 0.4, layers: [['rain', 1]], lightning: true, wet: true },
  sandstorm: { name: 'Sandstorm', overcast: 0.45, storm: 0.4, fog: 1.6, fogTint: '#a8644c', fogTintAmt: 0.6, layers: [['sand', 1], ['dust', 1]], wind: 3, slow: 0.15 },
  glassstorm: { name: 'Glass Storm', overcast: 0.6, storm: 0.6, fog: 1.0, fogTint: '#7a1e30', fogTintAmt: 0.5, layers: [['glass', 1], ['sand', 0.5]], wind: 3.5, hurts: 0.018, danger: true },
  emberfall: { name: 'Ember-Fall', overcast: 0.3, storm: 0, fog: 0.35, fogTint: '#7a2e20', fogTintAmt: 0.3, layers: [['emberfall', 1], ['ash', 0.6]] },
  snow: { name: 'Snowfall', overcast: 0.7, storm: 0.1, fog: 0.45, fogTint: '#a4a6c8', fogTintAmt: 0.3, layers: [['snow', 0.7]] },
  blizzard: { name: 'Blizzard', overcast: 0.95, storm: 0.6, fog: 1.8, fogTint: '#b4b6d6', fogTintAmt: 0.6, layers: [['blizzard', 1]], wind: 3, chill: true, danger: true },
  fog: { name: 'Fog', overcast: 0.5, storm: 0, fog: 1.7, layers: [] },
  sporebloom: { name: 'Spore Bloom', overcast: 0.3, storm: 0, fog: 0.5, fogTint: '#6a4a8a', fogTintAmt: 0.35, layers: [['spores', 1]] },
  aurora: { name: 'Aurora', overcast: 0, storm: 0, fog: 0.1, aurora: 1, layers: [['snow', 0.15]] },
  voidstorm: { name: 'Void Storm', overcast: 0.85, storm: 0.7, fog: 0.9, fogTint: '#4a2a6a', fogTintAmt: 0.6, layers: [['motes', 1]], lightning: true, voidBolts: true, danger: true },
};

// Ambient particles by biome (always present at low intensity)
const AMBIENT = { wastes: [['embers', 0.5], ['dust', 0.25]], gilded: [['pollen', 0.6]], verdant: [['pollen', 0.3], ['fireflies', 0]], frost: [['snow', 0.12]], coast: [['pollen', 0.15]], maw: [['motes', 0.4], ['embers', 0.2]], deep: [['deepmotes', 1]] };

// Screen-wrapped pixel weather layers. Speeds, wobble and streak lengths are written in the old
// design pixels (10 px/unit) and scaled to the art grid below, so rain falls as fast across the
// world as it always did; flakes and motes stay 1-2 px. `glow` layers are drawn after lighting so
// embers, glass and spores shine at night.
const LAYERS0 = {
  rain: { n: 650, vel: [40, 330], len: 5, color: '#8cb4c4', alpha: 0.55, streak: true },
  snow: { n: 420, vel: [10, 26], wob: 9, color: '#ecebf6', alpha: 0.9, size: 1 },
  blizzard: { n: 900, vel: [170, 55], wob: 14, color: '#dcdcf0', alpha: 0.85, streak: true, len: 3 },
  sand: { n: 700, vel: [220, 8], wob: 18, color: '#c48e74', alpha: 0.6, streak: true, len: 3 },
  dust: { n: 120, vel: [30, 2], wob: 10, color: '#a8705a', alpha: 0.14, size: 4 },
  glass: { n: 260, vel: [200, 20], wob: 12, color: '#ff2a48', alpha: 1, glow: true, twinkle: 1 },
  embers: { n: 140, vel: [12, -9], wob: 10, color: '#ec7a2a', alpha: 1, glow: true, twinkle: 1 },
  emberfall: { n: 320, vel: [10, 16], wob: 10, color: '#ec7a2a', alpha: 1, glow: true, twinkle: 1 },
  ash: { n: 220, vel: [9, 13], wob: 7, color: '#3a2a34', alpha: 0.75, size: 1 },
  spores: { n: 220, vel: [3, -6], wob: 8, color: '#c860f0', alpha: 0.9, glow: true, twinkle: 1 },
  fireflies: { n: 70, vel: [0, 0], wob: 14, color: '#f6e39a', alpha: 1, glow: true, twinkle: 2 },
  pollen: { n: 110, vel: [6, -1], wob: 6, color: '#f3e1b5', alpha: 0.7, glow: true },
  motes: { n: 200, vel: [2, -5], wob: 12, color: '#a026ef', alpha: 1, glow: true, twinkle: 1 },
  deepmotes: { n: 180, vel: [1, -3], wob: 10, color: '#7cd8c8', alpha: 0.9, glow: true, twinkle: 1 },
};
const LAYERS = Object.fromEntries(Object.entries(LAYERS0).map(([k, c]) => [k, { ...c, vel: [c.vel[0] * ART, c.vel[1] * ART], wob: (c.wob || 0) * ART, len: c.len ? ap(c.len) : 0 }]));

const layers = {};
const state = {
  perBiome: {},
  current: 'clear',
  def: WEATHER_DEFS.clear,
  blend: { overcast: 0, storm: 0, fog: 0, aurora: 0 },
  layerTarget: {},
  boltTimer: 5,
  hurtTimer: 0,
  rng: new RNG(1234),
};

const MARGIN = ap(40);
function makeLayer(id, cfg) {
  const n = cfg.n;
  const P = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { P[i * 3] = Math.random() * 3200; P[i * 3 + 1] = Math.random() * 3200; P[i * 3 + 2] = Math.random(); }
  layers[id] = { cfg, P, alpha: 0 };
}
// draw every visible layer of the given kind (lit or glowing) into the low-res buffer
function drawLayers(ctx, glow) {
  const Wm = view.W + MARGIN * 2, Hm = view.H + MARGIN * 2;
  const t = performance.now() / 1000;
  for (const L of Object.values(layers)) {
    if (L.alpha < 0.01 || !!L.cfg.glow !== glow) continue;
    const c = L.cfg, n = Math.floor(c.n * Math.min(1, 0.2 + L.alpha));
    ctx.fillStyle = c.color;
    const vx = c.vel[0] * (state.wind || 1), vy = c.vel[1];
    for (let i = 0; i < n; i++) {
      const s = L.P[i * 3 + 2];
      let x = L.P[i * 3] - view.x0, y = L.P[i * 3 + 1] - view.y0;
      if (c.wob) { x += Math.sin(t * (0.8 + s) + s * 40) * c.wob; y += Math.cos(t * (0.6 + s) + s * 30) * c.wob * 0.4; }
      x = ((x % Wm) + Wm) % Wm - MARGIN; y = ((y % Hm) + Hm) % Hm - MARGIN;
      let a = c.alpha * L.alpha;
      if (c.twinkle) a *= 0.35 + 0.65 * Math.max(0, Math.sin(t * (3 + c.twinkle * 2) + s * 60));
      if (a < 0.05) continue;
      ctx.globalAlpha = Math.min(1, a);
      const X = Math.round(x), Y = Math.round(y);
      if (c.streak) {
        // a 1-px streak along the motion, a little shorter for the far (slow) particles
        const len = Math.max(2, Math.round((c.len || 5) * (0.7 + s * 0.3))), sp = Math.hypot(vx, vy) || 1;
        for (let k = 0; k < len; k++) ctx.fillRect(Math.round(X - (vx / sp) * k), Math.round(Y - (vy / sp) * k), 1, 1);
      } else if (c.size >= 3) {
        // dust puff: a small diamond, the core denser than the rim
        ctx.fillRect(X - 2, Y, 5, 1); ctx.fillRect(X - 1, Y - 1, 3, 3); ctx.fillRect(X, Y - 2, 1, 5);
      } else if (s > 0.9) { ctx.fillRect(X - 1, Y, 3, 1); ctx.fillRect(X, Y - 1, 1, 3); }
      else ctx.fillRect(X, Y, s > 0.6 ? 2 : 1, s > 0.6 ? 2 : 1);
    }
  }
  ctx.globalAlpha = 1;
}
function stepLayers(dt) {
  for (const L of Object.values(layers)) {
    if (L.alpha < 0.01) continue;
    const vx = L.cfg.vel[0] * (state.wind || 1), vy = L.cfg.vel[1];
    for (let i = 0; i < L.cfg.n; i++) { const s = 0.75 + L.P[i * 3 + 2] * 0.5; L.P[i * 3] += vx * s * dt; L.P[i * 3 + 1] += vy * s * dt; }
  }
}
// rain splashes: tiny crisp rings on the ground
const splashes = [];
function drawSplashes(ctx) {
  ctx.fillStyle = '#a8c8d4';
  const now = performance.now() / 1000;
  for (let i = splashes.length - 1; i >= 0; i--) {
    const sp = splashes[i];
    const u = (now - sp.t) / 0.25;
    if (u >= 1) { splashes.splice(i, 1); continue; }
    const x = Math.round(sp.x - view.x0), y = Math.round(sp.y - view.y0), r = 1 + Math.round(u * 3);
    ctx.globalAlpha = 0.7 * (1 - u);
    // a flat crisp ring opening outward, with a droplet hopping up in the middle at first
    ctx.fillRect(x - r, y, 1, 1); ctx.fillRect(x + r, y, 1, 1);
    if (r > 1) { ctx.fillRect(x - r + 1, y - 1, 1, 1); ctx.fillRect(x + r - 1, y - 1, 1, 1); ctx.fillRect(x - r + 1, y + 1, 1, 1); ctx.fillRect(x + r - 1, y + 1, 1, 1); }
    if (u < 0.5) ctx.fillRect(x, y - 1 - Math.round(u * 4), 1, 1);
  }
  ctx.globalAlpha = 1;
}

// ---- fog banks: big soft blobs drifting with the wind in the current haze tone. Fading effects are
// the one place dithering belongs, so each bank is an ordered-dithered shape (dense core, sparse
// rim) drawn into the pixel layer, which lets the lighting darken it at night.
const BANKS = [];
const bankShapes = [], bankTint = new Map();
function bankShape(i) {
  if (bankShapes[i]) return bankShapes[i];
  const w = ap(110 + (i % 3) * 30), h = ap(40 + (i % 2) * 14);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d'), img = g.createImageData(w, h);
  const lobes = [];
  for (let k = 0; k < 4; k++) lobes.push([w * (0.22 + k * 0.18 + Math.sin(i * 7.1 + k) * 0.05), h * (0.5 + Math.sin(i * 3.3 + k * 2.1) * 0.12), w * (0.2 + 0.06 * Math.cos(i + k)), h * (0.36 + 0.08 * Math.sin(i * 2 + k))]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let d = 0;
    for (const [cx, cy, rx, ry] of lobes) { const e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2; if (e < 1) d = Math.max(d, 1 - e); }
    const keep = d > 0.6 ? 0.5 : d > 0.32 ? 0.25 : d > 0.08 ? 0.125 : 0;
    if (keep && bayer(x, y) < keep) img.data[(y * w + x) * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return (bankShapes[i] = cv);
}
function tintedBank(i, col) {
  const key = i + ':' + col;
  let cv = bankTint.get(key);
  if (cv) return cv;
  if (bankTint.size > 48) bankTint.clear();
  const src = bankShape(i);
  cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height;
  const g = cv.getContext('2d');
  g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, cv.width, cv.height);
  bankTint.set(key, cv);
  return cv;
}
function drawFogBanks(ctx) {
  const a = Math.min(0.5, Math.max(0, ((G.weather?.fog || 0) - 0.3) * 0.42));
  if (a < 0.02) return;
  if (!BANKS.length) for (let i = 0; i < 9; i++) BANKS.push({ x: Math.random() * 3200, y: Math.random() * 3200, s: i % 6 });
  // tone: the haze colour, quantised so the tinted copies stay few
  const f = R.fog.color, q = (v) => Math.min(255, (v >> 3) << 3);
  const col = `rgb(${q(f[0])},${q(f[1])},${q(f[2])})`;
  const Wm = view.W + MARGIN * 6, Hm = view.H + MARGIN * 6;
  ctx.globalAlpha = a;
  for (const b of BANKS) {
    const cv = tintedBank(b.s, col);
    const x = ((b.x - view.x0) % Wm + Wm) % Wm - MARGIN * 3, y = ((b.y - view.y0) % Hm + Hm) % Hm - MARGIN * 3;
    ctx.drawImage(cv, Math.round(x - cv.width / 2), Math.round(y - cv.height / 2));
  }
  ctx.globalAlpha = 1;
}
function stepFogBanks(dt) { for (const b of BANKS) b.x += ap(6 + (b.s % 3) * 3) * (state.wind || 1) * dt; }

export function initWeather() {
  for (const [id, cfg] of Object.entries(LAYERS)) makeLayer(id, cfg);
  scene.persist.screen.push((ctx) => { drawFogBanks(ctx); drawSplashes(ctx); drawLayers(ctx, false); });
  scene.persist.emissives.push((ctx) => drawLayers(ctx, true));
  G.weather = { id: 'clear', def: WEATHER_DEFS.clear, overcast: 0, storm: 0, fog: 0, aurora: 0, fogTint: null, fogTintAmt: 0, wind: 1, name: 'Clear' };
}

function rollWeather(biome) {
  const b = BIOMES[biome];
  if (!b) return { id: 'clear', ends: G.time + 600 };
  let table = b.weather;
  // some weather only at night / day
  const night = isNight();
  table = table.filter(([w]) => (w === 'aurora' ? night : true) && (w === 'sporebloom' ? night || state.rng.f() < 0.3 : true));
  const id = state.rng.weighted(table);
  const dur = id === 'clear' ? 240 + state.rng.f() * 300 : 150 + state.rng.f() * 240;
  return { id, ends: G.time + dur };
}

export function forceWeather(biome, id, dur = 300) {
  state.perBiome[biome] = { id, ends: G.time + dur };
}

export function weatherFor(biome) {
  let w = state.perBiome[biome];
  if (!w || G.time > w.ends) { w = rollWeather(biome); state.perBiome[biome] = w; }
  return w.id;
}

export function updateWeather(dt, focus, indoor) {
  const biome = G.realm === 'deep' ? 'deep' : G.biome;
  const id = indoor ? 'clear' : weatherFor(biome);
  if (id !== state.current) {
    state.current = id;
    state.def = WEATHER_DEFS[id];
    bus.emit('weather', { id, def: state.def, biome });
  }
  const d = state.def;
  const k = 1 - Math.exp(-dt * 0.35);
  const W = G.weather;
  W.id = id; W.def = d; W.name = d.name;
  W.overcast = lerp(W.overcast, d.overcast, k);
  W.storm = lerp(W.storm, d.storm, k);
  W.fog = lerp(W.fog, indoor ? 0 : d.fog, k);
  W.aurora = lerp(W.aurora, d.aurora || 0, k);
  W.fogTintAmt = lerp(W.fogTintAmt, d.fogTint ? d.fogTintAmt : 0, k);
  if (d.fogTint) W.fogTint = d.fogTint;
  W.wind = lerp(W.wind, d.wind || 1, k);
  state.wind = W.wind;

  // particle layer targets
  const targets = {};
  if (!indoor) {
    for (const [lid, a] of AMBIENT[biome] || []) targets[lid] = Math.max(targets[lid] || 0, a);
    if (biome === 'verdant' && isNight()) targets.fireflies = 0.9;
    if (biome === 'coast' && isNight()) targets.fireflies = 0.3;
    for (const [lid, a] of d.layers) targets[lid] = Math.max(targets[lid] || 0, a);
  }
  for (const [lid, L] of Object.entries(layers)) L.alpha = damp(L.alpha, targets[lid] || 0, 0.6, dt);
  stepLayers(dt);
  stepFogBanks(dt);
  if ((layers.rain?.alpha || 0) > 0.05 && Math.random() < dt * 40 * layers.rain.alpha) splashes.push({ x: view.x0 + Math.random() * view.W, y: view.y0 + Math.random() * view.H, t: performance.now() / 1000 });
  if (splashes.length > 80) splashes.shift();

  // lightning
  if (!indoor && (d.lightning)) {
    state.boltTimer -= dt;
    if (state.boltTimer <= 0) {
      state.boltTimer = 3 + Math.random() * 9;
      const a = Math.random() * Math.PI * 2, r = 15 + Math.random() * 60;
      const x = focus.x + Math.cos(a) * r, z = focus.z + Math.sin(a) * r;
      const col = d.voidBolts ? '#c860f0' : '#e6e0ff';
      boltFx(x, focus.y + 90, z, x + (Math.random() - 0.5) * 6, focus.y, z + (Math.random() - 0.5) * 6, { color: col, segs: 16, jag: 5, dur: 0.3 });
      flash(x, focus.y + 6, z, col, 60, 60, 0.35);
      burst(x, focus.y + 0.5, z, { count: 18, speed: 9, color: col, life: 0.5, gravity: -10 });
      atmo.lightning = 0.6 + Math.random() * 0.4;
      bus.emit('thunder', { dist: r, x, z });
    }
  }
  // hazards on the player
  const p = G.player;
  state.hurtTimer -= dt;
  if (p && !p.dead && !indoor && state.hurtTimer <= 0) {
    state.hurtTimer = 1;
    const sheltered = G.inTown;
    if (d.hurts && !sheltered && !p.derived.flags.stormImmune) bus.emit('weatherHurt', { amount: d.hurts, element: 'physical', reason: 'The glass storm flays you. Find shelter!' });
    if (d.chill && !sheltered && p.derived.res.frost < 30) bus.emit('weatherChill', {});
  }
}

export function weatherSlow() {
  const d = state.def;
  return d.slow || 0;
}
