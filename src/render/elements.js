// Element colours, shared by the pixel VFX (vfx.js) and the GPU magic layer (magic.js).
// ELEM_COLORS: [light, main] pairs used all over the game. PALETTE adds a hot core and a deep
// edge for the shader effects. Everything comes from the master ramps in src/px/palette.js
// (docs/ART_STYLE.md): aether violet / magenta / pink for arcane and shadow, ember for fire,
// frost for ice, pale yellow-cream with a violet edge for lightning, teal and moss with cream for
// nature, gold and cream for holy.
//
// Other modules still pass their own hex colours to the effect functions. pal() maps any colour to
// the nearest master-palette colour (cached), so every effect, spark and number lands in palette.
import { C } from '../px/pix.js';
import { RAMPS, CREAM, CREAM_HI } from '../px/palette.js';

const A = RAMPS.aether, E = RAMPS.ember, F = RAMPS.frost, Au = RAMPS.gold;
export const ELEM_COLORS = {
  physical: [CREAM_HI, RAMPS.stone[6]], fire: [E[4], E[3]], frost: [F[5], F[3]], lightning: [E[5], A[4]],
  rot: [RAMPS.moss[5], RAMPS.moss[3]], nature: [CREAM, RAMPS.teal[4]], void: [A[5], A[3]], holy: [CREAM_HI, Au[4]],
  water: [F[4], F[2]], sand: [RAMPS.sand[5], RAMPS.sand[3]], blood: [RAMPS.rose[5], RAMPS.red[4]], sound: [RAMPS.rose[5], RAMPS.rose[3]], earth: [RAMPS.clay[6], RAMPS.dirt[6]],
};
// the colours the table held before the palette pass: callers that hard-code them still resolve
// to their element
const LEGACY_ELEM = {
  physical: ['#ffffff', '#c8c0b0'], fire: ['#ffd080', '#ff5010'], frost: ['#f0fcff', '#50b8ff'], lightning: ['#ffffff', '#90a8ff'],
  rot: ['#d0ffa0', '#50b030'], nature: ['#e0ffa0', '#60c030'], void: ['#e8d0ff', '#8030ff'], holy: ['#fffff0', '#ffc840'],
  water: ['#e0ffff', '#30a0e0'], sand: ['#fff0c0', '#e0a040'], blood: ['#ffb0b0', '#c00818'], sound: ['#fff0ff', '#e070f0'], earth: ['#f0e0c0', '#a07040'],
};

// hot: the core (pale, warm), c1: light band, c2: main colour, deep: the saturated edge
const P = (hot, c1, c2, deep) => ({ hot: C(hot), c1: C(c1), c2: C(c2), deep: C(deep) });
export const PALETTE = {
  physical: P(CREAM_HI, CREAM, RAMPS.stone[5], RAMPS.stone[3]),
  fire: P(E[5], E[4], E[3], E[2]),
  frost: P(F[5], F[4], F[3], F[1]),
  lightning: P('#fffaf0', E[5], A[4], A[2]),
  void: P(A[6], A[5], A[3], A[2]),
  holy: P(CREAM_HI, Au[5], Au[4], Au[2]),
  rot: P('#e8ecb0', RAMPS.moss[5], RAMPS.moss[3], RAMPS.moss[1]),
  nature: P(CREAM_HI, CREAM, RAMPS.teal[4], RAMPS.teal[2]),
  blood: P(RAMPS.rose[5], RAMPS.red[5], RAMPS.red[4], RAMPS.red[1]),
  water: P(F[5], F[4], F[2], F[1]),
  sand: P(RAMPS.sand[6], RAMPS.sand[5], RAMPS.sand[3], RAMPS.sand[1]),
  earth: P(RAMPS.clay[6], RAMPS.clay[5], RAMPS.dirt[6], RAMPS.dirt[2]),
  sound: P(A[6], RAMPS.rose[5], RAMPS.rose[3], RAMPS.plum[3]),
};

// ------------------------------------------------------------------ palette mapping
// OKLab is close enough to perceptual for picking the nearest swatch
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
function oklab(c) {
  const r = lin(c[0]), g = lin(c[1]), b = lin(c[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
// swatches effects may land on (the darkest steps are left out: an effect never goes near-black)
const POOL_RAMPS = ['aether', 'ember', 'frost', 'gold', 'red', 'rose', 'lavender', 'plum', 'teal', 'moss', 'green', 'blue', 'water', 'sand', 'clay', 'dirt', 'skin', 'steel', 'stone', 'mauve'];
const POOL = [];
for (const name of POOL_RAMPS) {
  const r = RAMPS[name];
  for (let i = 1; i < r.length; i++) { const c = C(r[i]); POOL.push({ hex: r[i], ramp: name, i, lab: oklab(c) }); }
}
// two effect-only extensions: cream itself, and the moss ramp carried up toward cream so heals and
// nature sparks have a light green to land on
const RMP = { ...RAMPS, cream: [CREAM, CREAM_HI], leaf: [RAMPS.moss[3], RAMPS.moss[4], RAMPS.moss[5], '#b4cc84', '#dce8b0'] };
for (const name of ['cream', 'leaf']) for (const [i, hex] of RMP[name].entries()) POOL.push({ hex, ramp: name, i, lab: oklab(C(hex)) });

// colours that should not go by plain nearest-swatch: pure whites become warm cream, the old
// pale-blue weapon swing becomes cream, alarm reds stay readable
const FIXED = {
  '#ffffff': CREAM_HI, '#fff': CREAM_HI, '#fffff0': CREAM_HI, '#fffaf0': '#fffaf0', '#c8dcff': CREAM, '#fff0d0': CREAM, '#fff4d0': CREAM_HI, '#ffe8d0': CREAM, '#ffe0c0': CREAM,
  '#d8d0c0': RAMPS.stone[6], '#6ad060': RAMPS.green[5], '#5aa0ff': RAMPS.blue[5], '#b070ff': A[4], '#ff9a30': E[3], '#ff3a4a': '#cc4a5a',
  '#ff3020': RAMPS.red[5], '#ff4020': E[2], '#ff5a4a': RAMPS.red[5], '#c01020': RAMPS.red[4], '#ffd040': E[4], '#ffd060': Au[4], '#ffe080': Au[5],
};
const mapCache = new Map();
function nearest(c, lab) {
  // LCh distance with a strong hue term: a saturated green stays green even when the nearest
  // swatch by lightness is a yellow; greys only care about lightness and warmth
  const ch = Math.hypot(lab[1], lab[2]), hu = Math.atan2(lab[2], lab[1]);
  let best = null, bd = 1e9;
  for (const s of POOL) {
    const sc = Math.hypot(s.lab[1], s.lab[2]);
    let dh = Math.abs(Math.atan2(s.lab[2], s.lab[1]) - hu); if (dh > Math.PI) dh = Math.PI * 2 - dh;
    const dl = (s.lab[0] - lab[0]) * 0.9, dc = (sc - ch) * 0.9, hw = dh * ch * 1.6;
    const d = dl * dl + dc * dc + hw * hw;
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}
// any colour -> nearest master-palette hex (hex string or [r,g,b(,a)] in, hex string out)
export function pal(colorIn) {
  if (colorIn == null) return CREAM_HI;
  const key = typeof colorIn === 'string' ? colorIn.toLowerCase() : colorIn.slice(0, 3).join(',');
  let v = mapCache.get(key);
  if (v) return v;
  if (typeof colorIn === 'string' && FIXED[key]) v = FIXED[key];
  else if (typeof colorIn === 'string' && key.startsWith('rgb')) { const m = key.match(/[\d.]+/g) || [255, 255, 255]; const c = [+m[0], +m[1], +m[2]]; v = nearest(c, oklab(c)).hex; }
  else if (typeof colorIn === 'string' && !colorIn.startsWith('#')) v = colorIn;     // css names: leave
  else { const c = C(colorIn); v = nearest(c, oklab(c)).hex; }
  mapCache.set(key, v);
  return v;
}
// same, but at least `minL` OKLab lightness (walks up the swatch's ramp): readable text and sparks
const lightCache = new Map();
export function palLight(colorIn, minL = 0.72) {
  const key = (typeof colorIn === 'string' ? colorIn.toLowerCase() : String(colorIn)) + '|' + minL;
  let v = lightCache.get(key);
  if (v) return v;
  v = pal(colorIn);
  const s = POOL.find((p) => p.hex === v);
  if (s && s.lab[0] < minL) {
    const r = RMP[s.ramp];
    for (let i = s.i + 1; i < r.length; i++) { v = r[i]; if (oklab(C(v))[0] >= minL) break; }
  }
  lightCache.set(key, v);
  return v;
}

// colour -> element (most callers only pass a colour)
const byColor = new Map();
for (const tbl of [ELEM_COLORS, LEGACY_ELEM]) for (const [el, [a, b]] of Object.entries(tbl)) { if (!byColor.has(b.toLowerCase())) byColor.set(b.toLowerCase(), el); if (!byColor.has(a.toLowerCase())) byColor.set(a.toLowerCase(), el); }
byColor.set('#ffffff', 'physical');
byColor.set(CREAM_HI.toLowerCase(), 'physical');
export function elementOf(colorOrEl) {
  if (!colorOrEl) return 'physical';
  if (PALETTE[colorOrEl]) return colorOrEl;
  if (typeof colorOrEl === 'string') return byColor.get(colorOrEl.toLowerCase()) || null;
  return null;
}

// palette for an element, or one built from the ramp an arbitrary colour falls on
const custom = new Map();
export function paletteOf(colorOrEl) {
  const el = elementOf(colorOrEl);
  if (el) return PALETTE[el];
  let p = custom.get(colorOrEl);
  if (p) return p;
  const hex = pal(colorOrEl), s = POOL.find((q) => q.hex === hex);
  const r = s && RMP[s.ramp] ? RMP[s.ramp] : RAMPS.aether, i = s ? s.i : 3, at = (k) => r[Math.max(0, Math.min(r.length - 1, k))];
  p = P(at(r.length - 1) === hex ? CREAM_HI : at(r.length - 1), at(i + 1), hex, at(i - 2));
  custom.set(colorOrEl, p);
  return p;
}

// rarity colours on the master palette: still six clearly different hues (cream-grey, moss green,
// blue, aether violet, ember orange, crimson), at the same value band as the rest of the art
export const RARITY_PAL = { common: RAMPS.stone[6], uncommon: RAMPS.green[5], rare: RAMPS.blue[5], epic: A[4], legendary: E[3], mythic: '#cc4a5a' };
export const rarityPal = (id) => RARITY_PAL[id] || RARITY_PAL.common;

export const ELEM_CODE = { physical: 0, fire: 1, frost: 2, lightning: 3, void: 4, holy: 5, rot: 6, nature: 6, blood: 7, water: 8, sand: 9, earth: 9, sound: 10 };
