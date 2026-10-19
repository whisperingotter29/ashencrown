// Pixel UI kit: paints every 9-slice frame of the UI (plum windows with gold trim and gold corner
// brackets, plum sheets, ink wells, item slots with rarity rims, plum and gold buttons, tabs,
// cream key caps...) in the master palette (docs/ART_STYLE.md) as tiny pixel images at startup and exposes them to CSS as border-images
// (--img-*). Everything is scaled by the UI pixel unit --u with nearest-neighbour, so frames stay
// perfectly crisp. Also renders big pixel-font titles (logo, banners) into upscaled images.
import { Pix, C, hash2 } from '../px/pix.js';
import { RARITY_PAL } from '../render/elements.js';

const K = {};
const toURL = (p) => p.canvas().toDataURL();

const mul = (c, k) => { c = C(c); return [Math.max(0, Math.min(255, Math.round(c[0] * k))), Math.max(0, Math.min(255, Math.round(c[1] * k))), Math.max(0, Math.min(255, Math.round(c[2] * k))), c[3]]; };
const mix = (a, b, t) => { a = C(a); b = C(b); return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t), Math.round(a[3] + (b[3] - a[3]) * t)]; };
const h = (x, y, s) => hash2(x, y, s);

// Paint an N x N 9-slice. paint(x, y, info) -> colour | null, where info carries
//   d     distance (in pixels) from the outer edge
//   side  'top' | 'left' | 'bottom' | 'right' (nearest edge, diagonals split at corners)
//   t     coordinate along that edge, cx / cy distance to the nearest vertical / horizontal edge
// `cut` clips the outermost corner pixels for a soft pixel corner.
function nine(N, paint, cut = 0, W = N, H = N) {
  const p = new Pix(W, H);
  const inside = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const cx = Math.min(x, W - 1 - x), cy = Math.min(y, H - 1 - y);
    return !(cut && cx + cy < cut);
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inside(x, y)) continue;
    const cx = Math.min(x, W - 1 - x), cy = Math.min(y, H - 1 - y);
    let d = Math.min(cx, cy);
    // pixels on the cut diagonal count as outline
    const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
    if (edge) d = 0;
    const side = cy <= cx ? (y < H / 2 ? 'top' : 'bottom') : (x < W / 2 ? 'left' : 'right');
    const t = side === 'top' || side === 'bottom' ? x : y;
    const c = paint(x, y, { d, side, t, cx, cy, edge });
    if (c) p.set(x, y, c);
  }
  return p;
}
const lit = (side) => (side === 'top' ? 1.14 : side === 'left' ? 1.04 : side === 'right' ? 0.86 : 0.74);

// ---------------------------------------------------------------- palette
// master palette (src/px/palette.js): violet-black ink outlines, plum panels, gold and cream
// frames, aether / teal accents
const P = {
  out: '#140f1c', ink2: '#090410',
  frame: ['#4a1a48', '#3a1640', '#351135', '#2c1030', '#24102a'],   // plum frame band, outside -> in
  gold: '#c99a3a', goldHi: '#f6e39a', goldMid: '#e8c35a', goldLo: '#9a6424', goldDeep: '#6a3e1c',
  panel: '#1d1424', panelHi: '#241a2e', panelLo: '#170f1e',
  sheet: '#2b1e3a', sheetHi: '#32233f', sheetLo: '#251a32', sheetEdge: '#4a3266', sheetLit: '#6a4a8a',
  iron: '#c99a3a', ironHi: '#f6e39a', ironLo: '#9a6424', ironOut: '#140f1c', rivet: '#fff4dc',
  slot: '#1a1322', slotLo: '#0e0914', slotHi: '#3a2850',
  cream: '#f3e1b5', creamHi: '#fff4dc', sand: '#e2c494',
  aether: '#a026ef', aetherHi: '#c860f0', aetherDeep: '#4a1664', teal: '#4a9488', tealHi: '#7cbca8',
};

// plum frame band with a faint grain running along the edge
function woodPx(d, side, t, seed, band = P.frame) {
  const k = band[Math.min(band.length - 1, d)];
  let c = mul(k, lit(side));
  const g = h(Math.floor(t / 4), d * 7 + seed, 11);
  if (g < 0.16) c = mul(c, 0.9);
  else if (g > 0.93) c = mul(c, 1.1);
  return c;
}

// gold corner bracket inside an S x S corner square; (u, v) measured from the outer corner
function bracket(u, v, S) {
  const arm = 4, len = S - 1;
  const on = (a, b) => a >= 0 && b >= 0 && a < len && b < len && (a < arm || b < arm);
  if (!on(u, v)) return null;
  if (!on(u - 1, v) || !on(u + 1, v) || !on(u, v - 1) || !on(u, v + 1) || u === 0 || v === 0) return P.ironOut;
  if ((u === 2 && v === 2)) return P.rivet;
  if ((u === 3 && v === 3) || (u === 3 && v === 2) || (u === 2 && v === 3)) return P.ironLo;
  if ((u === len - 3 && v === 1) || (u === 1 && v === len - 3)) return P.cream;
  if (u === 1 || v === 1) return P.ironHi;
  if ((v === arm - 1 && u >= arm) || (u === arm - 1 && v >= arm)) return P.ironLo;
  return P.iron;
}
function cornerUV(x, y, N, W = N, H = N) {
  const u = x < W / 2 ? x : W - 1 - x, v = y < H / 2 ? y : H - 1 - y;
  return [u, v];
}

// window fill: deep plum-ink with sparse 2-3 px clusters (no salt-and-pepper)
function leatherPx(x, y) {
  const n = h(Math.floor(x / 3), Math.floor(y / 2), 21);
  if (n < 0.06) return P.panelLo;
  if (n > 0.95) return P.panelHi;
  return P.panel;
}
function parchPx(x, y, seed = 0) {
  const n = h(Math.floor(x / 3), Math.floor(y / 2), 31 + seed);
  if (n < 0.07) return P.sheetLo;
  if (n > 0.95) return P.sheetHi;
  return P.sheet;
}

function build() {
  // ---------------------------------------------------------- windows: gold-trimmed plum frame, gold corners, ink panel
  {
    const N = 40, B = 9;
    K.wood = toURL(nine(N, (x, y, { d, side, t }) => {
      const [u, v] = cornerUV(x, y, N);
      if (u < B && v < B) { const b = bracket(u, v, B); if (b) return b; }
      if (d === 0) return P.out;
      if (d === 1) return side === 'top' || side === 'left' ? P.goldHi : P.goldLo;
      if (d <= 4) return woodPx(d - 2, side, t, 1);
      if (d === 5) return side === 'top' || side === 'left' ? P.gold : P.goldLo;
      if (d === 6) return P.out;
      if (d === 7) return side === 'top' || side === 'left' ? P.ink2 : '#2e2040';
      if (d === 8) return side === 'top' || side === 'left' ? '#140c1a' : '#241a2e';
      return leatherPx(x, y);
    }));
  }
  // slim frame (HUD action bar, nameplates)
  {
    const N = 28, B = 7;
    K.plank = toURL(nine(N, (x, y, { d, side, t }) => {
      const [u, v] = cornerUV(x, y, N);
      if (u < B && v < B) { const b = bracket(u, v, B); if (b) return b; }
      if (d === 0) return P.out;
      if (d === 1) return side === 'top' || side === 'left' ? P.goldHi : P.goldLo;
      if (d <= 3) return woodPx(d - 2, side, t, 7);
      if (d === 4) return side === 'top' || side === 'left' ? P.gold : P.goldLo;
      if (d === 5) return P.out;
      if (d === 6) return side === 'top' || side === 'left' ? P.ink2 : '#2e2040';
      return leatherPx(x, y);
    }));
  }
  // frame ring without fill (minimap, portraits)
  {
    const N = 28, B = 7;
    K.woodRing = toURL(nine(N, (x, y, { d, side, t }) => {
      const [u, v] = cornerUV(x, y, N);
      if (u < B && v < B) { const b = bracket(u, v, B); if (b) return b; }
      if (d === 0) return P.out;
      if (d === 1) return side === 'top' || side === 'left' ? P.goldHi : P.goldLo;
      if (d <= 3) return woodPx(d - 2, side, t, 3);
      if (d === 4) return side === 'top' || side === 'left' ? P.gold : P.goldLo;
      if (d === 5) return P.out;
      if (d === 6) return side === 'top' || side === 'left' ? P.ink2 : '#2e2040';
      return null;
    }));
  }
  // ---------------------------------------------------------- plum sheet (sub-panels inside windows)
  K.sheet = toURL(nine(48, (x, y, { d, side }) => {
    if (d === 0) return P.out;
    if (d === 1) return side === 'bottom' || side === 'right' ? P.sheetEdge : P.sheetLit;
    if (d === 2) return side === 'bottom' || side === 'right' ? '#231830' : '#3a2850';
    return parchPx(x, y);
  }, 2));
  // card with a cream rim and gold studs (tooltips, item detail)
  K.card = toURL(nine(48, (x, y, { d, side, t }) => {
    const [u, v] = cornerUV(x, y, 48);
    if (u === 2 && v === 2) return P.goldHi;
    if ((u === 3 && v === 2) || (u === 2 && v === 3)) return P.goldLo;
    if (d === 0) return P.out;
    if (d === 1) return side === 'top' || side === 'left' ? P.cream : P.sand;
    if (d === 2) return side === 'top' || side === 'left' ? P.gold : P.goldLo;
    if (d === 3) return P.out;
    return parchPx(x, y, 4);
  }, 1));
  // dark inset well (bag grid, lists)
  K.well = toURL(nine(24, (x, y, { d, side }) => {
    if (d === 0) return P.out;
    const tl = side === 'top' || side === 'left';
    if (d === 1) return tl ? P.ink2 : '#3a2850';
    if (d === 2) return tl ? '#110b17' : '#241a2e';
    return h(Math.floor(x / 3), y, 41) < 0.05 ? '#1a1322' : '#150f1c';
  }, 1));
  // slightly lighter panel inset on a sheet (sub-sections), no bevel
  K.inset = toURL(nine(24, (x, y, { d, side }) => {
    if (d === 0) return P.sheetEdge;
    const tl = side === 'top' || side === 'left';
    if (d === 1) return tl ? '#231830' : P.sheetLit;
    return h(Math.floor(x / 3), y, 43) < 0.06 ? '#342642' : '#382a48';
  }, 1));

  // ---------------------------------------------------------- slots (B = 5): ink wells with coloured rims
  const slotPaint = (o = {}) => (x, y, { d, side }) => {
    const tl = side === 'top' || side === 'left';
    if (d === 0) return o.rim || P.out;
    if (d === 1) return o.r1 ? (typeof o.r1 === 'function' ? o.r1(tl, side) : o.r1) : tl ? P.slotLo : P.slotHi;
    if (d === 2) return o.r2 ? (typeof o.r2 === 'function' ? o.r2(tl, side) : o.r2) : tl ? '#120c18' : '#2a1e38';
    if (o.glow && d <= 4 && (side === 'bottom' || d === 3) && (x + y) % 2 === 0) return o.glow;
    if (d === 3 && side === 'top') return o.fillLo || '#150f1c';
    return o.fill || P.slot;
  };
  K.slot = toURL(nine(16, slotPaint(), 1));
  K.slotHover = toURL(nine(16, slotPaint({ rim: P.cream, r1: (tl) => (tl ? '#6a4a8a' : P.creamHi), r2: (tl) => (tl ? '#140c1a' : '#4a3266'), fill: '#2a1e38', fillLo: '#231830' }), 1));
  K.slotSel = toURL(nine(16, (x, y, info) => {
    const [u, v] = cornerUV(x, y, 16);
    if (info.d === 0) return u + v <= 3 ? P.creamHi : P.goldHi;
    if (info.d === 1) return u + v <= 3 ? P.creamHi : P.goldMid;
    if (info.d === 2) return P.goldLo;
    return slotPaint({ fill: '#2a1e38', fillLo: '#231830' })(x, y, info);
  }, 1));
  K.slotActive = toURL(nine(16, slotPaint({ rim: P.goldHi, r1: (tl) => (tl ? P.gold : P.goldMid), r2: P.goldDeep, fill: '#2a1a2a', fillLo: '#241624', glow: '#6a3e1c' }), 1));
  K.slotDrop = toURL(nine(16, slotPaint({ rim: P.tealHi, r1: (tl) => (tl ? '#245458' : P.tealHi), r2: '#1a3a40', fill: '#15222a', fillLo: '#121c24' }), 1));
  K.slotGhost = toURL(nine(16, slotPaint({ rim: '#2a1e38', r1: '#150f1c', r2: '#150f1c', fill: '#150f1c', fillLo: '#150f1c' }), 1));
  for (const [r, col] of Object.entries(RARITY_PAL)) {
    const c = C(col);
    K['slotR' + r[0].toUpperCase() + r.slice(1)] = toURL(nine(16, slotPaint({
      r1: (tl) => (tl ? mul(c, 0.62) : mul(c, 1.08)),
      r2: (tl) => (tl ? mul(c, 0.3) : mul(c, 0.46)),
      fill: mix(P.slot, c, r === 'common' ? 0.02 : 0.08), fillLo: mix('#150f1c', c, 0.05),
      glow: r === 'common' ? null : mul(c, 0.42),
    }), 1));
  }

  // ---------------------------------------------------------- buttons (B = 5)
  const btn = (o) => nine(16, (x, y, { d, side, t, cy }) => {
    if (d === 0) return o.rim || P.out;
    // 2px lip under the button (pressed buttons lose it)
    if (side === 'bottom' && d <= 2 && !o.down) return d === 1 ? o.lip[0] : o.lip[1];
    if (side === 'top' && d === 1) return o.down ? o.lip[1] : o.hi;
    if (side === 'left' && d === 1) return mix(o.hi, o.face[0], 0.5);
    if (side === 'right' && d === 1) return mul(o.face[2], 0.85);
    const row = y < 5 ? 0 : y < 11 ? 1 : 2;
    return C(o.face[row]);
  }, 1);
  // plum, a lighter plum on hover, gold-cream primary, crimson danger, cream "on"
  K.btn = toURL(btn({ face: ['#5a2a5e', '#4a1a48', '#3e1640'], hi: '#8a4078', lip: ['#24102a', P.out] }));
  K.btnHover = toURL(btn({ face: ['#6a2a5e', '#5a2456', '#4a1a48'], hi: '#b06a98', lip: ['#2c1030', P.out], rim: P.ink2 }));
  K.btnDown = toURL(btn({ face: ['#3e1640', '#4a1a48', '#4a1a48'], hi: '#8a4078', lip: ['#24102a', P.out], down: true }));
  K.btnPrimary = toURL(btn({ face: [P.goldHi, P.goldMid, P.gold], hi: P.creamHi, lip: [P.goldLo, '#3e2418'] }));
  K.btnPrimaryHover = toURL(btn({ face: ['#fff0b0', P.goldHi, P.goldMid], hi: P.creamHi, lip: [P.goldLo, '#3e2418'], rim: P.ink2 }));
  K.btnOn = toURL(btn({ face: [P.creamHi, P.cream, '#e2cfa6'], hi: P.creamHi, lip: ['#9a8494', '#4a3266'] }));
  K.btnRed = toURL(btn({ face: ['#b04a3e', '#8a3434', '#60282c'], hi: '#d9765a', lip: ['#4a1420', P.out] }));
  K.btnRedHover = toURL(btn({ face: ['#c85a4a', '#a04040', '#7a3030'], hi: '#f0a088', lip: ['#4a1420', P.out], rim: P.ink2 }));
  // gold button (close X, small icon buttons)
  const metal = (hi) => nine(12, (x, y, { d, side }) => {
    if (d === 0) return P.ironOut;
    if (side === 'bottom' && d <= 1) return P.goldDeep;
    if (d === 1) return side === 'top' || side === 'left' ? (hi ? P.creamHi : P.ironHi) : P.ironLo;
    return hi ? P.goldHi : y < 6 ? P.goldMid : P.iron;
  }, 1);
  K.metal = toURL(metal(false));
  K.metalHover = toURL(metal(true));

  // ---------------------------------------------------------- tabs (open at the bottom)
  const tab = (o) => nine(16, (x, y, { d, side, t }) => {
    const bottom = y >= 13;
    const cx = Math.min(x, 15 - x), cy = y;
    if (cx + cy < 2) return null;
    if ((cx + cy === 2) || x === 0 || x === 15 || y === 0) return bottom && (x === 0 || x === 15) ? P.out : P.out;
    if (y === 1) return o.hi;
    if (x === 1) return mix(o.hi, o.face, 0.5);
    if (x === 14) return mul(o.face, 0.8);
    return C(o.face);
  }, 0);
  K.tab = toURL(tab({ face: '#351135', hi: '#6a2a5e' }));
  K.tabHover = toURL(tab({ face: '#4a1a48', hi: '#8a4078' }));
  K.tabOn = toURL(tab({ face: '#5a2456', hi: P.goldHi }));

  // ---------------------------------------------------------- title plaque: plum, gold inlay, gold caps
  K.plate = toURL(nine(24, (x, y, { d, side, t }) => {
    const [u, v] = cornerUV(x, y, 24);
    if (u <= 2 && v <= 7) { // gold end caps (top/bottom corners on left and right ends)
      if (u === 0 || v === 0) return P.ironOut;
      if (u === 1 && v === 1) return P.rivet;
      return u === 1 || v === 1 ? P.ironHi : P.iron;
    }
    if (d === 0) return P.out;
    if (d === 1) return side === 'bottom' ? P.out : '#6a2a5e';
    if (d === 2) return P.goldMid;
    if (d === 3) return P.out;
    return woodPx(2, 'top', x + y * 3, 17, ['#351135', '#2c1030', '#24102a']);
  }, 1));

  // ---------------------------------------------------------- key caps
  K.keycap = toURL(nine(10, (x, y, { d, side }) => {
    if (d === 0) return P.out;
    if (side === 'bottom' && d === 1) return '#9a8494';
    if (side === 'bottom' && d === 2) return P.sand;
    if (side === 'top' && d === 1) return P.creamHi;
    return P.cream;
  }, 1));
  K.keycapDark = toURL(nine(10, (x, y, { d, side }) => {
    if (d === 0) return P.ink2;
    if (side === 'bottom' && d === 1) return '#1d1424';
    if (side === 'top' && d === 1) return '#6a4a8a';
    return '#3a2850';
  }, 1));
  // small chip (filters, tags) on the plum sheets
  K.chip = toURL(nine(10, (x, y, { d, side }) => {
    if (d === 0) return P.out;
    if (d === 1) return side === 'top' || side === 'left' ? '#6a4a8a' : '#2a1e38';
    return '#3a2850';
  }, 1));
  K.chipOn = toURL(nine(10, (x, y, { d, side }) => {
    if (d === 0) return P.ink2;
    if (d === 1) return side === 'top' || side === 'left' ? P.aetherHi : P.aetherDeep;
    return '#691fc4';
  }, 1));

  // ---------------------------------------------------------- HUD pieces
  // dark translucent strip (toasts, prompts, tracker) with a gold rim
  K.strip = toURL(nine(10, (x, y, { d, side }) => {
    if (d === 0) return P.ink2;
    if (d === 1) return side === 'top' || side === 'left' ? P.gold : P.goldDeep;
    return [24, 16, 34, 226];
  }, 1));
  K.stripGold = toURL(nine(10, (x, y, { d, side }) => {
    if (d === 0) return P.ink2;
    if (d === 1) return side === 'top' || side === 'left' ? P.goldHi : P.gold;
    return [36, 22, 44, 236];
  }, 1));
  // tooltip (dark) for the HUD and small hints
  K.tip = toURL(nine(10, (x, y, { d, side }) => {
    if (d === 0) return P.out;
    if (d === 1) return side === 'top' || side === 'left' ? P.cream : P.goldLo;
    return [29, 20, 36, 248];
  }, 1));
  // bars: dark well with an outline
  K.bar = toURL(nine(6, (x, y, { d, side }) => (d === 0 ? P.out : d === 1 ? (side === 'top' || side === 'left' ? P.ink2 : '#2e2040') : '#120c18')));
  // legacy names used by older markup
  K.panel = K.wood;
  K.goldFrame = K.woodRing;
  K.btnDisabled = K.btn;

  // horizontal rules: dithered gold (dark panels) and lavender (plum sheets)
  const rule = (a, b) => { const p = new Pix(64, 1); for (let x = 0; x < 64; x++) { const tt = 1 - Math.abs(x - 31.5) / 32; if (((x * 7) % 4) / 4 < tt * 1.4) p.set(x, 0, tt > 0.6 ? a : b); } return toURL(p); };
  K.rule = rule(P.goldMid, P.goldLo);
  K.ruleInk = rule('#8a58a3', '#4a3266');
  // modal dim: 2x2 checker of ink for a dithered backdrop
  const dim = new Pix(2, 2); dim.set(0, 0, [9, 4, 16, 200]); dim.set(1, 1, [9, 4, 16, 200]); dim.set(1, 0, [9, 4, 16, 128]); dim.set(0, 1, [9, 4, 16, 128]);
  K.dim = toURL(dim);
  // scrollbar thumb: a small gold peg
  K.thumb = toURL(nine(8, (x, y, { d, side }) => (d === 0 ? P.out : d === 1 ? (side === 'left' || side === 'top' ? P.goldHi : P.goldLo) : P.gold), 1));
}

// UI pixel unit: 2 CSS px on laptops, 3 on tall screens
function unit() { return window.innerHeight >= 1000 ? 3 : 2; }

export function initPixelKit() {
  build();
  const root = document.documentElement.style;
  for (const [k, v] of Object.entries(K)) root.setProperty('--img-' + k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()), `url(${v})`);
  // windows are laid out for a 1280 x 720 screen at --u 2; smaller screens shrink them uniformly
  // (snapped to quarter steps) instead of clipping or reflowing them
  const setU = () => {
    const u = unit();
    root.setProperty('--u', u + 'px');
    document.documentElement.dataset.u = u;
    const fit = u === 2 ? Math.min(1, window.innerWidth / 1280, window.innerHeight / 720) : 1;
    root.setProperty('--uiz', String(Math.max(0.5, Math.floor(fit * 4 + 0.001) / 4)));
  };
  setU();
  window.addEventListener('resize', setU);
}

// ---------------------------------------------------------------- pixel titles
// Render text in a pixel font at its native grid size, binarise it, colour it in horizontal
// bands, outline and drop-shadow it, and return an <img> scaled by an integer factor.
const FONT = { family: 'Jersey 10', px: 18.6667 };
export async function fontsReady() {
  try { await Promise.all([document.fonts.load(`${FONT.px}px '${FONT.family}'`), document.fonts.load("16px 'Silkscreen'")]); } catch (e) { /* fall back to whatever loaded */ }
}
const titleCache = new Map();
export function pixelTitle(text, o = {}) {
  const scale = o.scale || 4;
  const key = JSON.stringify([text, o.bands, o.outline, o.shadow, o.glint]);
  let url = titleCache.get(key), tw, th;
  if (url) { [url, tw, th] = url; } else {
    const bands = (o.bands || ['#fff4dc', '#f6e39a', '#e8c35a', '#c99a3a']).map((c) => C(c));
    const outline = C(o.outline || '#140f1c'), shadow = o.shadow === false ? null : C(o.shadow || '#090410');
    const cv = document.createElement('canvas');
    const g = cv.getContext('2d');
    g.font = `${FONT.px}px '${FONT.family}'`;
    const w = Math.ceil(g.measureText(text).width) + 6, hh = 26;
    cv.width = w; cv.height = hh;
    g.font = `${FONT.px}px '${FONT.family}'`;
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#fff';
    g.fillText(text, 3, 19);
    const src = g.getImageData(0, 0, w, hh).data;
    // find the ink rows so the colour bands span the letters, not the whole box
    let top = hh, bot = 0;
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) if (src[(y * w + x) * 4 + 3] > 110) { top = Math.min(top, y); bot = Math.max(bot, y); }
    const p = new Pix(w + 2, hh + 2);
    const on = (x, y) => x >= 0 && y >= 0 && x < w && y < hh && src[(y * w + x) * 4 + 3] > 110;
    if (shadow) for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) if (on(x, y)) p.set(x + 2, y + 2, shadow);
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
      if (on(x, y)) {
        const t = (y - top) / Math.max(1, bot - top);
        p.set(x + 1, y + 1, bands[Math.min(bands.length - 1, Math.floor(t * bands.length))]);
      } else if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) p.set(x + 1, y + 1, outline);
    }
    // a single bright pixel glint on the top row of the first letters
    if (o.glint !== false) for (let x = 0; x < w; x++) if (on(x, top) && x % 7 === 2) p.set(x + 1, top + 1, '#fff4dc');
    const t = p.trim(0);
    url = t.canvas().toDataURL(); tw = t.w; th = t.h;
    titleCache.set(key, [url, tw, th]);
  }
  const img = new Image();
  img.src = url;
  img.width = tw * scale; img.height = th * scale;
  img.className = 'px-title';
  img.alt = text;
  img.draggable = false;
  return img;
}
