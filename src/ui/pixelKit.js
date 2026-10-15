// Pixel UI kit: draws the 9-slice frames (panels, buttons, slots, tooltips, bars) as tiny pixel
// images at startup and exposes them to CSS as border-images, sets the UI pixel unit --u, and
// renders big pixel-font titles (logo, banners) into crisp upscaled images.
import { Pix, C } from '../px/pix.js';

const K = {};
const toURL = (p) => p.canvas().toDataURL();

// rings drawn from the outside in; each ring is a colour or a function (x, y, side) -> colour
function frame(size, rings, fill, o = {}) {
  const p = new Pix(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.min(x, y, size - 1 - x, size - 1 - y);
    // cut the outermost corner pixel(s) for a soft pixel corner
    const cx = Math.min(x, size - 1 - x), cy = Math.min(y, size - 1 - y);
    if (o.cut && cx + cy < o.cut) continue;
    const side = y <= x && y <= size - 1 - x && y < size / 2 ? 'top' : x < size / 2 && x <= y && x <= size - 1 - y ? 'left' : y >= size - 1 - x && y >= x ? 'bottom' : 'right';
    const r = rings[d];
    const c = r === undefined ? fill : typeof r === 'function' ? r(x, y, side) : r;
    if (c) p.set(x, y, c);
  }
  return p;
}
const bevel = (hi, mid, lo) => (x, y, side) => (side === 'top' || side === 'left' ? hi : side === 'bottom' || side === 'right' ? lo : mid);

function build() {
  const OUT = '#0c0806';
  // panel: outline, bevelled gold rim, dark gap, faint inner bevel, translucent dark fill
  const panel = frame(14, [OUT, bevel('#d8b060', '#a8803a', '#6a4a1e'), '#0e0907', bevel('#2a1c14', '#1c130e', '#120c09')], [22, 15, 11, 240], { cut: 1 });
  for (const [x, y] of [[2, 2], [11, 2], [2, 11], [11, 11]]) { panel.set(x, y, '#ffe8a0'); }
  K.panel = toURL(panel);
  // dark translucent strip panel (toasts, prompts, trackers)
  K.strip = toURL(frame(8, [OUT, bevel('#8a6a30', '#6a5228', '#4a3418')], [14, 10, 8, 225], { cut: 1 }));
  // tooltip
  K.tip = toURL(frame(8, [OUT, bevel('#b08a3a', '#8a6a30', '#5a4220')], [12, 8, 6, 248], { cut: 1 }));
  // buttons: raised face with a 2px bottom lip; pressed flips the bevel
  const btn = (face, hi, lo, rim) => toURL(frame(10, [OUT, rim || OUT, bevel(hi, face, lo), bevel(hi, face, lo)], face, { cut: 1 }));
  K.btn = btn('#3a2a1c', '#5e4630', '#1e140c', '#7a5c2c');
  K.btnHover = btn('#5a4026', '#8a6a40', '#2a1c10', '#e8c47a');
  K.btnDown = btn('#22170f', '#16100a', '#4a3828', '#e8c47a');
  K.btnPrimary = btn('#7a2a1c', '#b04a30', '#3a120c', '#e0905a');
  K.btnPrimaryHover = btn('#a03a24', '#d86a48', '#4a160e', '#ffd0a0');
  K.btnOn = btn('#6a4a26', '#9a7240', '#2e1f12', '#ffe8a0');
  // inset slot (skill bar, inventory cells)
  K.slot = toURL(frame(8, [OUT, bevel('#060403', '#100b08', '#4a3a28'), bevel('#0a0705', '#140e0a', '#2a2018')], '#140e0a', { cut: 0 }));
  K.slotHover = toURL(frame(8, ['#e8c47a', bevel('#060403', '#100b08', '#6a5438'), bevel('#0a0705', '#1a120c', '#2a2018')], '#1a120c', { cut: 0 }));
  // bars: dark well with an outline
  K.bar = toURL(frame(6, [OUT, bevel('#040302', '#0a0706', '#2a2018')], '#0a0706'));
  // gold frame for the minimap / portraits
  const gf = frame(14, [OUT, bevel('#ffe0a0', '#c8a050', '#7a5a24'), bevel('#a8803a', '#8a6a30', '#4a3418'), OUT], null, { cut: 2 });
  K.goldFrame = toURL(gf);
  // horizontal rule: dithered gold line fading out at both ends
  const rule = new Pix(64, 1);
  for (let x = 0; x < 64; x++) { const t = 1 - Math.abs(x - 31.5) / 32; if (((x * 7) % 4) / 4 < t * 1.4) rule.set(x, 0, t > 0.6 ? '#e8c47a' : '#a8884a'); }
  K.rule = toURL(rule);
  // modal dim: 2x2 checker of black for a dithered backdrop
  const dim = new Pix(2, 2); dim.set(0, 0, [0, 0, 0, 200]); dim.set(1, 1, [0, 0, 0, 200]); dim.set(1, 0, [0, 0, 0, 120]); dim.set(0, 1, [0, 0, 0, 120]);
  K.dim = toURL(dim);
}

// UI pixel unit: 2 CSS px on laptops, 3 on tall screens
function unit() { return window.innerHeight >= 1000 ? 3 : 2; }

export function initPixelKit() {
  build();
  const root = document.documentElement.style;
  for (const [k, v] of Object.entries(K)) root.setProperty('--img-' + k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()), `url(${v})`);
  const setU = () => root.setProperty('--u', unit() + 'px');
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
export function pixelTitle(text, o = {}) {
  const scale = o.scale || 4;
  const bands = (o.bands || ['#fff4c8', '#ffd878', '#f0a848', '#c86a28']).map((c) => C(c));
  const outline = C(o.outline || '#1a0c06'), shadow = o.shadow === false ? null : C(o.shadow || '#000000');
  const cv = document.createElement('canvas');
  const g = cv.getContext('2d');
  g.font = `${FONT.px}px '${FONT.family}'`;
  const w = Math.ceil(g.measureText(text).width) + 6, h = 26;
  cv.width = w; cv.height = h;
  g.font = `${FONT.px}px '${FONT.family}'`;
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#fff';
  g.fillText(text, 3, 19);
  const src = g.getImageData(0, 0, w, h).data;
  // find the ink rows so the colour bands span the letters, not the whole box
  let top = h, bot = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (src[(y * w + x) * 4 + 3] > 110) { top = Math.min(top, y); bot = Math.max(bot, y); }
  const p = new Pix(w + 2, h + 2);
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 110;
  if (shadow) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y)) p.set(x + 2, y + 2, shadow);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (on(x, y)) {
      const t = (y - top) / Math.max(1, bot - top);
      p.set(x + 1, y + 1, bands[Math.min(bands.length - 1, Math.floor(t * bands.length))]);
    } else if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) p.set(x + 1, y + 1, outline);
  }
  // a single bright pixel glint on the top row of the first letters
  if (o.glint !== false) for (let x = 0; x < w; x++) if (on(x, top) && x % 7 === 2) p.set(x + 1, top + 1, '#ffffff');
  const t = p.trim(0);
  const img = new Image();
  img.src = t.canvas().toDataURL();
  img.width = t.w * scale; img.height = t.h * scale;
  img.className = 'px-title';
  img.alt = text;
  return img;
}
