// Look colours -> master palette. Race skins, cloth, enemy hides, mount coats and item metals come
// from many data tables; the sprite generators run every one of them through here so characters
// and creatures are all painted from the same ramps (docs/ART_STYLE.md, src/px/palette.js).
//
//   tone(c)  body / cloth / skin / metal: the nearest colour of the master ramps (perceptual, OKLab),
//            ground-only ramps left out so bodies never melt into the terrain
//   glow(c)  eyes, runes, magic parts: kept saturated and bright but never neon or pure white
//   pale(c)  boots and wraps: the same hue lifted into the pale, dusty band, then snapped
//
// Results are cached per colour, so the cost is one lookup per sprite build.
import { RAMPS, CREAM, CREAM_HI, shiftLight } from './palette.js';

const BODY_RAMPS = ['mauve', 'rose', 'lavender', 'stone', 'slate', 'steel', 'gold', 'wood', 'blue', 'teal', 'red', 'green', 'plum', 'skin', 'clay', 'sand', 'moss', 'frost', 'water'];

const hexRgb = (h) => {
  if (Array.isArray(h)) return [h[0], h[1], h[2]];
  let s = String(h).replace('#', '');
  if (s.length === 3) s = s.split('').map((x) => x + x).join('');
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
function oklab(c) {
  const r = lin(c[0]), g = lin(c[1]), b = lin(c[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

let BODY = null;
function bodySet() {
  if (BODY) return BODY;
  BODY = [];
  const add = (h) => BODY.push({ h, lab: oklab(hexRgb(h)) });
  for (const k of BODY_RAMPS) {
    const r = RAMPS[k];
    for (const h of r) add(h);
    // two pale steps past the top of each ramp (the way light() continues it toward cream), so
    // pastel and bright inputs keep their hue instead of all landing on cream
    const top = [...hexRgb(r[r.length - 1]), 255];
    add(toHex(shiftLight(top, 1.16).slice(0, 3))); add(toHex(shiftLight(top, 1.3).slice(0, 3)));
  }
  add(CREAM);
  return BODY;
}

// distance in OKLCh: value first (it is what reads at a glance), then hue; losing chroma costs
// little, so a neon colour lands on the dusty ramp colour of the same hue and value
function nearest(c) {
  const q = oklab(hexRgb(c)), qc = Math.hypot(q[1], q[2]), qh = Math.atan2(q[2], q[1]);
  // very saturated inputs (neon lime, hot pink) keep their hue and may drop in value instead
  const hot = Math.max(0, Math.min(1, (qc - 0.13) / 0.12)), wl = 1.1 - hot * 0.4, wh = 1.3 + hot * 1.4, wc = 1.3;
  let best = null, bd = Infinity;
  for (const e of bodySet()) {
    const ec = Math.hypot(e.lab[1], e.lab[2]), eh = Math.atan2(e.lab[2], e.lab[1]);
    const dl = (q[0] - e.lab[0]) * wl, dc = (qc - ec) * (ec > qc ? 1.7 : wc);   // adding colour costs more than losing it
    let da = Math.abs(qh - eh); if (da > Math.PI) da = 2 * Math.PI - da;
    const dh = 2 * (Math.min(qc, ec + 0.04) + 0.02) * Math.sin(da / 2) * wh;
    const d = dl * dl + dc * dc + dh * dh;
    if (d < bd) { bd = d; best = e.h; }
  }
  return best;
}

const cacheT = new Map(), cacheG = new Map(), cacheP = new Map();
export function tone(c) {
  if (!c) return c;
  const k = Array.isArray(c) ? c.join(',') : c;
  let v = cacheT.get(k);
  if (!v) { v = nearest(c); cacheT.set(k, v); }
  return v;
}

// HSL helpers (0..1)
function hsl(c) {
  const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
const hue2 = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
function rgb(h, s, l) {
  if (s <= 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return [hue2(p, q, h + 1 / 3) * 255, hue2(p, q, h) * 255, hue2(p, q, h - 1 / 3) * 255];
}

export function glow(c) {
  if (!c) return c;
  const k = Array.isArray(c) ? c.join(',') : c;
  let v = cacheG.get(k);
  if (!v) {
    const [h, s, l] = hsl(hexRgb(c));
    if (s < 0.12 && l > 0.8) v = CREAM_HI;            // white glows read as warm cream light
    else v = toHex(rgb(h, Math.min(0.86, Math.max(0.5, s)), Math.min(0.8, Math.max(0.58, l))));
    cacheG.set(k, v);
  }
  return v;
}

// boots and wraps: sage and stone greys, pale hide and slate (steel / stone / sand / slate ramps)
const BOOTS = ['#828882', '#b6bdbd', '#827d82', '#a29c9c', '#c4bdb6', '#b08a64', '#cfa978', '#6e7a9a', '#96a2bc'];
export function pale(c) {
  if (!c) return c;
  const k = Array.isArray(c) ? c.join(',') : c;
  let v = cacheP.get(k);
  if (!v) {
    const [h, s, l] = hsl(hexRgb(c));
    const q = oklab(rgb(h, Math.min(0.14, s), Math.max(0.52, Math.min(0.7, l + 0.2))));
    let bd = Infinity;
    for (const b of BOOTS) { const e = oklab(hexRgb(b)), d = (q[0] - e[0]) ** 2 * 1.5 + (q[1] - e[1]) ** 2 + (q[2] - e[2]) ** 2; if (d < bd) { bd = d; v = b; } }
    cacheP.set(k, v);
  }
  return v;
}

// ------------------------------------------------------------------ shading along the ramps
// A snapped colour sits on one of the master ramps; its shadow and light steps are that ramp's
// neighbours (blue cloth: #3973af -> #243e7b -> #172d64, light #5a8fc8). Off-ramp colours fall back
// to dark() / light(), with the shadow's chroma held near the base's so pale colours (skin, cream)
// don't turn into vivid orange when darkened.
let INDEX = null;
function rampIndex() {
  if (INDEX) return INDEX;
  INDEX = new Map();
  for (const k of Object.keys(RAMPS)) RAMPS[k].forEach((h, i) => { const key = h.toLowerCase(); if (!INDEX.has(key)) INDEX.set(key, { r: RAMPS[k], i }); });
  return INDEX;
}
const keyOf = (c) => (Array.isArray(c) ? toHex(c.slice(0, 3)) : String(c).toLowerCase());
// the ramp colour n steps from c (negative = darker), or null when c is off-ramp or the ramp ends
export function rampStep(c, n) {
  const e = rampIndex().get(keyOf(c));
  if (!e) return null;
  const j = e.i + n;
  return j >= 0 && j < e.r.length ? e.r[j] : null;
}

function fromOklab(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rl = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, gl = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const g = (v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055);
  return [g(rl), g(gl), g(bl)];
}
// cap the OKLab chroma of colour d at f x the chroma of ref (keeps d's hue and lightness)
export function capChroma(d, ref, f = 1.15) {
  const q = oklab(hexRgb(d)), r = oklab(hexRgb(ref));
  const cq = Math.hypot(q[1], q[2]), cmax = Math.hypot(r[1], r[2]) * f + 0.012;
  if (cq <= cmax) return d;
  const k = cmax / cq;
  const o = fromOklab(q[0], q[1] * k, q[2] * k).map((v) => Math.max(0, Math.min(255, Math.round(v))));
  if (Array.isArray(d)) { o.push(d[3] ?? 255); return o; }
  return toHex(o);
}
