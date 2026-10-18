// Master palette. Every sprite, tile and effect picks its colours from these ramps so the whole
// game reads as one painting: dusty warm earth, muted teal greens, mauve and rose accents, cool
// blue cloth, violet-black ink for outlines and the deepest shadows, cream for the top highlight,
// and saturated violet / magenta reserved for aether (magic, glowing eyes, the brightest effects).
// See docs/ART_STYLE.md for the rules.
//
// Ramps run dark -> light. Shadows drift toward violet / plum (warm colours toward maroon, cool
// colours toward indigo); highlights drift toward warm cream. Backgrounds sit low and muted
// (lightness ~0.25-0.45, saturation ~0.15-0.35); characters and pickups sit brighter and more
// saturated so they read against them.

export const INK = '#140f1c';      // outlines, deepest shadow
export const INK_SOFT = '#231a2c'; // outline of things that should sit back (terrain detail)
export const CREAM = '#f3e1b5';    // top highlight, cloth trim, bone, parchment
export const CREAM_HI = '#fff4dc';
export const PLUM = '#2a1838';     // where shadows lean
export const SHADOW = 'rgba(20,12,30,0.42)'; // ground contact shadows

export const RAMPS = {
  // ground
  dirt: ['#2e2224', '#4a2a24', '#5f3025', '#704a3a', '#7a5340', '#875e42', '#a8705a', '#bc7c70'],
  clay: ['#3e1c22', '#662b2c', '#8a4238', '#9c615b', '#bc7c70', '#d9a08a', '#ecc6a8'],
  sand: ['#5e4a47', '#8a6a52', '#b08a64', '#cfa978', '#e2c494', '#efdab4', '#f6e9cc'],
  grass: ['#1a2328', '#232e32', '#2f3d3b', '#3c4e47', '#4b6152', '#5f7660', '#7a8f6c'],
  moss: ['#1d2a26', '#2c3d32', '#3d553d', '#557048', '#6f8a52', '#94a866'],
  // flora / accents
  mauve: ['#2a1420', '#3e1c2c', '#55323d', '#674952', '#7b576f', '#996f76', '#a96a7c', '#cc949e'],
  rose: ['#4a1a30', '#7a2f4a', '#a94a68', '#cc6a86', '#e48fb0', '#f4bccf'],
  lavender: ['#2e1f45', '#4a3266', '#6a4a8a', '#8a58a3', '#a87cc0', '#c8a4dc'],
  // stone and metal
  stone: ['#1f1d26', '#2f2c38', '#4e4b53', '#66626a', '#827d82', '#a29c9c', '#c4bdb6'],
  slate: ['#1a1f2c', '#2a3240', '#3e4a5a', '#525c83', '#6e7a9a', '#96a2bc'],
  steel: ['#22262e', '#3a4048', '#4a5259', '#6a7276', '#828882', '#b6bdbd', '#e2e6e0'],
  gold: ['#3e2418', '#6a3e1c', '#9a6424', '#c99a3a', '#e8c35a', '#f6e39a'],
  wood: ['#2a1a1c', '#3f2622', '#5a3628', '#77492f', '#94603c', '#b07e52'],
  // cloth
  blue: ['#120c30', '#1a0f47', '#172d64', '#243e7b', '#3973af', '#5a8fc8', '#8cb8de'],
  teal: ['#0f2228', '#1a3a40', '#245458', '#2f7070', '#4a9488', '#7cbca8'],
  red: ['#2a0e18', '#4a1420', '#60282c', '#8a3434', '#b04a3e', '#d9765a'],
  green: ['#152018', '#22341f', '#33502c', '#4a6e36', '#6a8c44', '#90ac5c'],
  plum: ['#1d0814', '#351135', '#4a1a48', '#6a2a5e', '#8a4078', '#b06a98'],
  skin: ['#3b1e22', '#60323a', '#8a5048', '#b07062', '#d9967e', '#f0bea0', '#fbcebd'],
  // aether: magic, glowing eyes, the hottest effects
  aether: ['#2f0d48', '#4a1664', '#691fc4', '#a026ef', '#c860f0', '#f5afd6', '#fff4fb'],
  ember: ['#3a0e10', '#7a1e14', '#c2401c', '#ec7a2a', '#f8b848', '#fff0b0'],
  frost: ['#141c3a', '#243e7b', '#3e6aa8', '#6aa0d0', '#a8d0ec', '#e6f4fc'],
  water: ['#0f1a30', '#172d50', '#1f4064', '#285878', '#396586', '#5a8aa2', '#8cb4c4'],
};

// pick from a ramp by 0..1 position (clamped)
export function rampAt(name, t) {
  const r = RAMPS[name];
  return r[Math.max(0, Math.min(r.length - 1, Math.round(t * (r.length - 1))))];
}

// ------------------------------------------------------------------ hue-shifted shading
// HSL helpers in 0..1 (hue 0..1). Kept local and allocation-light: sprite generation calls the
// shade helpers a lot, but only once per cached sprite.
export function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
const hue2 = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
export function hsl2rgb(h, s, l) {
  if (s <= 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return [Math.round(hue2(p, q, h + 1 / 3) * 255), Math.round(hue2(p, q, h) * 255), Math.round(hue2(p, q, h - 1 / 3) * 255)];
}
// move hue h toward target hue by at most amt (all 0..1), the short way round
function towardHue(h, target, amt) {
  let d = target - h;
  if (d > 0.5) d -= 1; else if (d < -0.5) d += 1;
  const step = Math.sign(d) * Math.min(Math.abs(d), amt);
  return (h + step + 1) % 1;
}
const SHADOW_HUE = 290 / 360; // plum-violet
const LIGHT_HUE = 44 / 360;   // warm cream

// shadow: darker, a little more saturated, hue leaning toward plum-violet (rust -> maroon,
// teal -> indigo, blue -> violet). Greys pick up a violet cast instead of going neutral.
export function shiftDark(c, k) {
  let [h, s, l] = rgb2hsl(c[0], c[1], c[2]);
  const amt = Math.min(1, Math.max(0, 1 - k));
  if (s < 0.06) { h = 265 / 360; s = 0.06 + amt * 0.16; }
  else {
    h = towardHue(h, SHADOW_HUE, amt * 0.11);
    // HSL saturation inflates chroma when a pale colour drops below mid lightness, so also cap
    // by the source chroma: pale skin shades to dusky rose, not vivid orange
    const chroma = (1 - Math.abs(2 * l - 1)) * s * (1 + amt * 0.45), room = 1 - Math.abs(2 * l * k - 1);
    s = Math.min(1, s * (1 + amt * 0.45), room > 0 ? chroma / room : 1);
  }
  l = l * k;
  const o = hsl2rgb(h, s, l);
  o.push(c[3]);
  return o;
}
// highlight: lighter, hue leaning toward warm cream, slightly less saturated at the very top
export function shiftLight(c, k) {
  let [h, s, l] = rgb2hsl(c[0], c[1], c[2]);
  const amt = Math.min(1, Math.max(0, k - 1));
  if (s < 0.06) { h = LIGHT_HUE; s = 0.05 + amt * 0.2; }
  else h = towardHue(h, LIGHT_HUE, amt * 0.12);
  l = Math.min(0.97, l * k + amt * 0.06);
  s = s * (1 - Math.max(0, l - 0.7) * 0.5);
  const o = hsl2rgb(h, s, l);
  o.push(c[3]);
  return o;
}
