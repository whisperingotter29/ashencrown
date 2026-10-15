// Pixel UI kit: paints every 9-slice frame of the UI (wooden windows with iron corner brackets,
// parchment sheets, dark wells, item slots with rarity rims, wooden plank buttons, physical tabs,
// key caps...) as tiny pixel images at startup and exposes them to CSS as border-images
// (--img-*). Everything is scaled by the UI pixel unit --u with nearest-neighbour, so frames stay
// perfectly crisp. Also renders big pixel-font titles (logo, banners) into upscaled images.
import { Pix, C, hash2 } from '../px/pix.js';

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
const P = {
  out: '#1a0f0a',
  wood: ['#c99258', '#a8723f', '#94623a', '#7e5030', '#653d22'],   // across the plank, outside -> in
  leather: '#2c1f17',
  parch: '#ead6ac', parchHi: '#f5e7c8', parchLo: '#dcc391', parchEdge: '#b8925a', parchBurn: '#8a6236',
  iron: '#7f8893', ironHi: '#c6cdd6', ironLo: '#4b525b', ironOut: '#1e2126', rivet: '#eef2f6',
  slot: '#2e2119', slotLo: '#0c0805', slotHi: '#5e4330',
  gold: '#e8c47a', goldHi: '#fff0c0', goldLo: '#8a6420',
};

// plank-coloured wood with grain streaks running along the edge
function woodPx(d, side, t, seed, band = P.wood) {
  const k = band[Math.min(band.length - 1, d)];
  let c = mul(k, lit(side));
  const g = h(Math.floor(t / 3), d * 7 + seed, 11);
  if (g < 0.22) c = mul(c, 0.86);
  else if (g > 0.9) c = mul(c, 1.08);
  if (h(t, d + seed, 5) < 0.06) c = mul(c, 0.78);   // knots & nicks
  return c;
}

// iron corner bracket inside an S x S corner square; (u, v) measured from the outer corner
function bracket(u, v, S) {
  const arm = 4, len = S - 1;
  const on = (a, b) => a >= 0 && b >= 0 && a < len && b < len && (a < arm || b < arm);
  if (!on(u, v)) return null;
  if (!on(u - 1, v) || !on(u + 1, v) || !on(u, v - 1) || !on(u, v + 1) || u === 0 || v === 0) return P.ironOut;
  // rivets
  if ((u === 2 && v === 2)) return P.rivet;
  if ((u === 3 && v === 3) || (u === 3 && v === 2) || (u === 2 && v === 3)) return P.ironLo;
  if ((u === len - 3 && v === 1) || (u === 1 && v === len - 3)) return '#d6dce2';
  // bevel: lit edges facing the outside of the frame
  if (u === 1 || v === 1) return P.ironHi;
  if ((v === arm - 1 && u >= arm) || (u === arm - 1 && v >= arm)) return P.ironLo;
  return h(u, v, 3) < 0.15 ? mul(P.iron, 0.92) : P.iron;
}
function cornerUV(x, y, N, W = N, H = N) {
  const u = x < W / 2 ? x : W - 1 - x, v = y < H / 2 ? y : H - 1 - y;
  return [u, v];
}

function leatherPx(x, y) {
  const n = h(x, y, 21);
  if ((x + y * 3) % 7 === 0 && n < 0.5) return '#33241b';
  if (n < 0.12) return '#251a13';
  if (n > 0.93) return '#35271d';
  return P.leather;
}
function parchPx(x, y, seed = 0) {
  const n = h(x, y, 31 + seed);
  if (n < 0.1) return P.parchLo;
  if (n > 0.94) return P.parchHi;
  if (h(Math.floor(x / 5), y, 9 + seed) < 0.05) return '#e2cb9c';   // fibres
  return P.parch;
}

function build() {
  // ---------------------------------------------------------- windows: wood frame, iron corners, leather
  {
    const N = 40, B = 9;
    K.wood = toURL(nine(N, (x, y, { d, side, t }) => {
      const [u, v] = cornerUV(x, y, N);
      if (u < B && v < B) { const b = bracket(u, v, B); if (b) return b; }
      if (d === 0) return P.out;
      if (d <= 5) return woodPx(d - 1, side, t, 1);
      if (d === 6) return '#140c08';
      if (d === 7) return side === 'top' || side === 'left' ? '#0e0806' : '#4a3424';
      if (d === 8) return side === 'top' || side === 'left' ? '#1e150f' : '#33241a';
      return leatherPx(x, y);
    }));
  }
  // slim plank frame (HUD action bar, nameplates)
  {
    const N = 28, B = 7;
    K.plank = toURL(nine(N, (x, y, { d, side, t }) => {
      const [u, v] = cornerUV(x, y, N);
      if (u < B && v < B) { const b = bracket(u, v, B); if (b) return b; }
      if (d === 0) return P.out;
      if (d <= 4) return woodPx(d - 1, side, t, 7, ['#c48c54', '#9c6a3a', '#865834', '#6c4428']);
      if (d === 5) return '#140c08';
      if (d === 6) return side === 'top' || side === 'left' ? '#0e0806' : '#3e2c1e';
      return leatherPx(x, y);
    }));
  }
  // wood ring without fill (minimap, portraits)
  {
    const N = 28, B = 7;
    K.woodRing = toURL(nine(N, (x, y, { d, side, t }) => {
      const [u, v] = cornerUV(x, y, N);
      if (u < B && v < B) { const b = bracket(u, v, B); if (b) return b; }
      if (d === 0) return P.out;
      if (d <= 4) return woodPx(d - 1, side, t, 3, ['#c48c54', '#9c6a3a', '#865834', '#6c4428']);
      if (d === 5) return '#140c08';
      if (d === 6) return side === 'top' || side === 'left' ? '#000000' : '#3e2c1e';
      return null;
    }));
  }
  // ---------------------------------------------------------- parchment sheet
  K.sheet = toURL(nine(48, (x, y, { d, side }) => {
    if (d === 0) return '#4a2c18';
    if (d === 1) return h(x, y, 2) < 0.3 ? P.parchBurn : P.parchEdge;
    if (d === 2) return side === 'bottom' || side === 'right' ? '#c8a670' : '#d8bd86';
    return parchPx(x, y);
  }, 2));
  // parchment card with a wooden rim and brass studs (tooltips, item detail)
  K.card = toURL(nine(48, (x, y, { d, side, t }) => {
    const [u, v] = cornerUV(x, y, 48);
    if (u === 2 && v === 2) return '#ffe6a0';
    if ((u === 3 && v === 2) || (u === 2 && v === 3)) return '#a07830';
    if (d === 0) return P.out;
    if (d <= 2) return woodPx(d, side, t, 13, ['#c48c54', '#93603a', '#6e4426']);
    if (d === 3) return '#3a2414';
    return parchPx(x, y, 4);
  }, 1));
  // dark inset well (bag grid, lists on the leather)
  K.well = toURL(nine(24, (x, y, { d, side }) => {
    if (d === 0) return '#0c0705';
    const tl = side === 'top' || side === 'left';
    if (d === 1) return tl ? '#080503' : '#4e3726';
    if (d === 2) return tl ? '#130d09' : '#2e2017';
    return h(x, y, 41) < 0.08 ? '#221810' : '#1d140e';
  }, 1));
  // dark cloth panel on parchment (sub-sections), no bevel
  K.inset = toURL(nine(24, (x, y, { d, side }) => {
    if (d === 0) return '#5a3a20';
    const tl = side === 'top' || side === 'left';
    if (d === 1) return tl ? '#bfa070' : '#f6e8c8';
    return h(x, y, 43) < 0.1 ? '#dcc496' : '#e2cc9e';
  }, 1));

  // ---------------------------------------------------------- slots (B = 5)
  const slotPaint = (o = {}) => (x, y, { d, side }) => {
    const tl = side === 'top' || side === 'left';
    if (d === 0) return o.rim || '#100a06';
    if (d === 1) return o.r1 ? (typeof o.r1 === 'function' ? o.r1(tl, side) : o.r1) : tl ? P.slotLo : P.slotHi;
    if (d === 2) return o.r2 ? (typeof o.r2 === 'function' ? o.r2(tl, side) : o.r2) : tl ? '#170f0a' : '#3c2b1f';
    if (o.glow && d <= 4 && (side === 'bottom' || d === 3) && (x + y) % 2 === 0) return o.glow;
    if (d === 3 && side === 'top') return o.fillLo || '#241911';
    return o.fill || P.slot;
  };
  K.slot = toURL(nine(16, slotPaint(), 1));
  K.slotHover = toURL(nine(16, slotPaint({ rim: '#f2cc80', r1: (tl) => (tl ? '#6a4a22' : '#ffe6a8'), r2: (tl) => (tl ? '#1e140c' : '#5a4430'), fill: '#3a2a1e', fillLo: '#30231a' }), 1));
  K.slotSel = toURL(nine(16, (x, y, info) => {
    const [u, v] = cornerUV(x, y, 16);
    if (info.d === 0) return u + v <= 3 ? '#ffffff' : '#fff0c0';
    if (info.d === 1) return u + v <= 3 ? '#fff6d8' : '#e8b850';
    if (info.d === 2) return '#7a5418';
    return slotPaint({ fill: '#3e2d1f', fillLo: '#33251a' })(x, y, info);
  }, 1));
  K.slotActive = toURL(nine(16, slotPaint({ rim: '#ffe08a', r1: (tl) => (tl ? '#c88a24' : '#ffd060'), r2: '#6a4614', fill: '#3a2a16', fillLo: '#33240f', glow: '#6a4a18' }), 1));
  K.slotDrop = toURL(nine(16, slotPaint({ rim: '#a8f088', r1: (tl) => (tl ? '#2e6a20' : '#80e060'), r2: '#1c3a14', fill: '#24301c', fillLo: '#1e2818' }), 1));
  K.slotGhost = toURL(nine(16, slotPaint({ rim: '#3a2a1e', r1: '#20160f', r2: '#20160f', fill: '#20160f', fillLo: '#20160f' }), 1));
  const RAR = { common: '#8a8274', uncommon: '#3fae38', rare: '#3a7ee8', epic: '#9a52ea', legendary: '#f0861c', mythic: '#f02a3c' };
  for (const [r, col] of Object.entries(RAR)) {
    const c = C(col);
    K['slotR' + r[0].toUpperCase() + r.slice(1)] = toURL(nine(16, slotPaint({
      r1: (tl) => (tl ? mul(c, 0.62) : mul(c, 1.08)),
      r2: (tl) => (tl ? mul(c, 0.28) : mul(c, 0.44)),
      fill: mix(P.slot, c, r === 'common' ? 0.02 : 0.08), fillLo: mix('#241911', c, 0.05),
      glow: r === 'common' ? null : mul(c, 0.42),
    }), 1));
  }

  // ---------------------------------------------------------- wooden plank buttons (B = 5)
  const btn = (o) => nine(16, (x, y, { d, side, t, cy }) => {
    if (d === 0) return o.rim || P.out;
    // 2px lip under the plank (pressed buttons lose it)
    if (side === 'bottom' && d <= 2 && !o.down) return d === 1 ? o.lip[0] : o.lip[1];
    if (side === 'top' && d === 1) return o.down ? o.lip[1] : o.hi;
    if (side === 'left' && d === 1) return mix(o.hi, o.face[0], 0.5);
    if (side === 'right' && d === 1) return mul(o.face[2], 0.85);
    const row = y < 5 ? 0 : y < 11 ? 1 : 2;
    let c = C(o.face[row]);
    if (o.grain !== false) { const g = h(Math.floor(x / 4), y, o.seed || 2); if (g < 0.18) c = mul(c, 0.9); }
    return c;
  }, 1);
  const WOODF = ['#a8723f', '#8e5c34', '#7a4c2a'];
  K.btn = toURL(btn({ face: WOODF, hi: '#d29a62', lip: ['#4a2a16', '#2a170c'] }));
  K.btnHover = toURL(btn({ face: ['#bc844c', '#a06a3c', '#8a5a32'], hi: '#f0c080', lip: ['#5a3418', '#2a170c'], rim: '#3a1c0a' }));
  K.btnDown = toURL(btn({ face: ['#7a4c2a', '#865530', '#8e5c34'], hi: '#d29a62', lip: ['#4a2a16', '#2a170c'], down: true }));
  K.btnPrimary = toURL(btn({ face: ['#e4b456', '#cc9636', '#b07a26'], hi: '#fff0b0', lip: ['#6a4210', '#3a2208'], seed: 5 }));
  K.btnPrimaryHover = toURL(btn({ face: ['#f4c868', '#dca846', '#c08a30'], hi: '#ffffff', lip: ['#7a4c14', '#3a2208'], rim: '#3a1c0a', seed: 5 }));
  K.btnOn = toURL(btn({ face: ['#f0dcb0', '#e6cc98', '#d8ba84'], hi: '#fffaf0', lip: ['#8a6236', '#4a2c14'], grain: false }));
  K.btnRed = toURL(btn({ face: ['#b04a30', '#963a24', '#7e2e1c'], hi: '#e88060', lip: ['#4a140a', '#2a0a04'], seed: 9 }));
  K.btnRedHover = toURL(btn({ face: ['#c85a3c', '#ac462c', '#923622'], hi: '#ffa080', lip: ['#5a1a0c', '#2a0a04'], rim: '#3a0a04', seed: 9 }));
  // iron button (close X, small icon buttons)
  const metal = (hi) => nine(12, (x, y, { d, side }) => {
    if (d === 0) return P.ironOut;
    if (side === 'bottom' && d <= 1) return '#30353c';
    if (d === 1) return side === 'top' || side === 'left' ? (hi ? '#eef2f6' : P.ironHi) : P.ironLo;
    return hi ? '#99a3ae' : y < 6 ? '#8a939e' : P.iron;
  }, 1);
  K.metal = toURL(metal(false));
  K.metalHover = toURL(metal(true));

  // ---------------------------------------------------------- physical tabs (open at the bottom)
  const tab = (o) => nine(16, (x, y, { d, side, t }) => {
    const bottom = y >= 13;
    const cx = Math.min(x, 15 - x), cy = y;
    if (cx + cy < 2) return null;
    if ((cx + cy === 2) || x === 0 || x === 15 || y === 0) return bottom && (x === 0 || x === 15) ? P.out : P.out;
    if (y === 1) return o.hi;
    if (x === 1) return mix(o.hi, o.face, 0.5);
    if (x === 14) return mul(o.face, 0.8);
    let c = C(o.face);
    if (o.grain !== false && h(Math.floor(x / 4), y, 3) < 0.2) c = mul(c, 0.9);
    return c;
  }, 0);
  K.tab = toURL(tab({ face: '#6e4628', hi: '#9a6a40' }));
  K.tabHover = toURL(tab({ face: '#86562f', hi: '#c08a52' }));
  K.tabOn = toURL(tab({ face: '#a8723f', hi: '#f0c070' }));

  // ---------------------------------------------------------- title plaque: dark wood, brass inlay, iron caps
  K.plate = toURL(nine(24, (x, y, { d, side, t }) => {
    const [u, v] = cornerUV(x, y, 24);
    if (u <= 2 && v <= 7) { // iron end caps (top/bottom corners on left and right ends)
      if (u === 0 || v === 0) return P.ironOut;
      if (u === 1 && v === 1) return P.rivet;
      return u === 1 || v === 1 ? P.ironHi : P.iron;
    }
    if (d === 0) return P.out;
    if (d === 1) return side === 'bottom' ? '#2a170c' : '#8a5a32';
    if (d === 2) return '#d8a850';
    if (d === 3) return '#3a2214';
    return woodPx(2, 'top', x + y * 3, 17, ['#6a4224', '#5e3a20', '#53331c']);
  }, 1));

  // ---------------------------------------------------------- key caps
  K.keycap = toURL(nine(10, (x, y, { d, side }) => {
    if (d === 0) return P.out;
    if (side === 'bottom' && d === 1) return '#8a6a40';
    if (side === 'bottom' && d === 2) return '#c8a870';
    if (side === 'top' && d === 1) return '#fffaf0';
    return '#f2e2bc';
  }, 1));
  K.keycapDark = toURL(nine(10, (x, y, { d, side }) => {
    if (d === 0) return '#000000';
    if (side === 'bottom' && d === 1) return '#1a120c';
    if (side === 'top' && d === 1) return '#6a5a48';
    return '#3a3028';
  }, 1));
  // small chip (filters, tags)
  K.chip = toURL(nine(10, (x, y, { d, side }) => {
    if (d === 0) return '#3a2414';
    if (d === 1) return side === 'top' || side === 'left' ? '#f8ecd0' : '#b8925a';
    return '#e2cb9a';
  }, 1));
  K.chipOn = toURL(nine(10, (x, y, { d, side }) => {
    if (d === 0) return '#1a0f0a';
    if (d === 1) return side === 'top' || side === 'left' ? '#8a5a32' : '#2a170c';
    return '#4a2e1a';
  }, 1));

  // ---------------------------------------------------------- HUD pieces
  // dark translucent strip (toasts, prompts, tracker) with a warm bronze rim
  K.strip = toURL(nine(10, (x, y, { d, side }) => {
    if (d === 0) return '#0a0605';
    if (d === 1) return side === 'top' || side === 'left' ? '#a07a40' : '#5a3e1e';
    return [16, 11, 8, 222];
  }, 1));
  K.stripGold = toURL(nine(10, (x, y, { d, side }) => {
    if (d === 0) return '#0a0605';
    if (d === 1) return side === 'top' || side === 'left' ? '#ffe0a0' : '#a07a30';
    return [24, 16, 8, 232];
  }, 1));
  // tooltip (dark) for the HUD and small hints
  K.tip = toURL(nine(10, (x, y, { d, side }) => {
    if (d === 0) return P.out;
    if (d === 1) return side === 'top' || side === 'left' ? '#c09a54' : '#6a4a24';
    return [18, 12, 9, 248];
  }, 1));
  // bars: dark well with an outline
  K.bar = toURL(nine(6, (x, y, { d, side }) => (d === 0 ? '#0c0806' : d === 1 ? (side === 'top' || side === 'left' ? '#040302' : '#2a2018') : '#0a0706')));
  // legacy names used by older markup
  K.panel = K.wood;
  K.goldFrame = K.woodRing;
  K.btnDisabled = K.btn;

  // horizontal rules: dithered gold (dark backgrounds) and ink (parchment)
  const rule = (a, b) => { const p = new Pix(64, 1); for (let x = 0; x < 64; x++) { const tt = 1 - Math.abs(x - 31.5) / 32; if (((x * 7) % 4) / 4 < tt * 1.4) p.set(x, 0, tt > 0.6 ? a : b); } return toURL(p); };
  K.rule = rule('#e8c47a', '#a8884a');
  K.ruleInk = rule('#6a4426', '#a07a4a');
  // modal dim: 2x2 checker of black for a dithered backdrop
  const dim = new Pix(2, 2); dim.set(0, 0, [8, 4, 2, 200]); dim.set(1, 1, [8, 4, 2, 200]); dim.set(1, 0, [8, 4, 2, 128]); dim.set(0, 1, [8, 4, 2, 128]);
  K.dim = toURL(dim);
  // scrollbar thumb: a tiny wooden peg
  K.thumb = toURL(nine(8, (x, y, { d, side }) => (d === 0 ? P.out : d === 1 ? (side === 'left' || side === 'top' ? '#d29a62' : '#5a3418') : '#a06a3a'), 1));
}

// UI pixel unit: 2 CSS px on laptops, 3 on tall screens
function unit() { return window.innerHeight >= 1000 ? 3 : 2; }

export function initPixelKit() {
  build();
  const root = document.documentElement.style;
  for (const [k, v] of Object.entries(K)) root.setProperty('--img-' + k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()), `url(${v})`);
  const setU = () => { const u = unit(); root.setProperty('--u', u + 'px'); document.documentElement.dataset.u = u; };
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
    const bands = (o.bands || ['#fff4c8', '#ffd878', '#f0a848', '#c86a28']).map((c) => C(c));
    const outline = C(o.outline || '#1a0c06'), shadow = o.shadow === false ? null : C(o.shadow || '#000000');
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
    if (o.glint !== false) for (let x = 0; x < w; x++) if (on(x, top) && x % 7 === 2) p.set(x + 1, top + 1, '#ffffff');
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
