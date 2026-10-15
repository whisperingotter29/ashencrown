// Canvas-painted item and skill icons (cached as data URLs).
import { RARITY, MATERIALS } from '../data/items.js';
import { TOMES } from '../data/tomes.js';

import { Pix } from '../px/pix.js';

const cache = new Map();
const S = 64;
export const ICON_N = 20;

// Turn a 64px vector-painted icon into a 20px pixel sprite: area-sample each output pixel,
// keep only solid coverage, posterise the colour, then add a dark outline and top-left rim.
function pixelize(cv, n = ICON_N) {
  const src = cv.getContext('2d').getImageData(0, 0, S, S).data;
  const p = new Pix(n, n);
  const k = S / n, sub = 4;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let j = 0; j < sub; j++) for (let i = 0; i < sub; i++) {
      const sx = Math.min(S - 1, Math.floor((x + (i + 0.5) / sub) * k)), sy = Math.min(S - 1, Math.floor((y + (j + 0.5) / sub) * k));
      const o = (sy * S + sx) * 4, al = src[o + 3] / 255;
      r += src[o] * al; g += src[o + 1] * al; b += src[o + 2] * al; a += al;
    }
    const cov = a / (sub * sub);
    if (cov < 0.42) continue;
    const q = (v) => Math.min(255, Math.round(v / a / 20) * 20);
    p.set(x, y, [q(r), q(g), q(b), 255]);
  }
  p.rim(1.15, 0.82);
  p.outline([14, 9, 8, 255]);
  return p.canvas();
}

function c2d() { const c = document.createElement('canvas'); c.width = c.height = S; return [c, c.getContext('2d')]; }

function metal(item) {
  const m = MATERIALS.find((x) => x.id === item.material);
  return m ? m.color : '#b0b0b8';
}

function poly(g, pts, fill, stroke = '#000') {
  g.beginPath(); g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath(); g.fillStyle = fill; g.fill(); g.lineWidth = 2; g.strokeStyle = stroke; g.stroke();
}

const DRAW = {
  sword(g, col, acc) { g.save(); g.translate(32, 32); g.rotate(-Math.PI / 4); poly(g, [-4, -26, 4, -26, 4, 10, -4, 10], col); poly(g, [-4, -26, 0, -32, 4, -26], col); poly(g, [-12, 10, 12, 10, 12, 14, -12, 14], acc); poly(g, [-3, 14, 3, 14, 3, 26, -3, 26], '#5a3a20'); g.restore(); },
  greatsword(g, col, acc) { g.save(); g.translate(32, 32); g.rotate(-Math.PI / 4); poly(g, [-6, -30, 6, -30, 6, 12, -6, 12], col); poly(g, [-6, -30, 0, -36, 6, -30], col); poly(g, [-15, 12, 15, 12, 15, 17, -15, 17], acc); poly(g, [-3, 17, 3, 17, 3, 30, -3, 30], '#5a3a20'); g.restore(); },
  dagger(g, col, acc) { g.save(); g.translate(32, 34); g.rotate(-Math.PI / 4); poly(g, [-4, -18, 4, -18, 3, 4, -3, 4], col); poly(g, [-4, -18, 0, -24, 4, -18], col); poly(g, [-9, 4, 9, 4, 9, 8, -9, 8], acc); poly(g, [-2.5, 8, 2.5, 8, 2.5, 18, -2.5, 18], '#5a3a20'); g.restore(); },
  mace(g, col, acc) { g.save(); g.translate(32, 32); g.rotate(-Math.PI / 4); poly(g, [-2.5, -8, 2.5, -8, 2.5, 28, -2.5, 28], '#5a3a20'); g.beginPath(); g.arc(0, -16, 10, 0, Math.PI * 2); g.fillStyle = col; g.fill(); g.stroke(); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; poly(g, [Math.cos(a) * 9, -16 + Math.sin(a) * 9, Math.cos(a + 0.3) * 15, -16 + Math.sin(a + 0.3) * 15, Math.cos(a + 0.5) * 9, -16 + Math.sin(a + 0.5) * 9], acc); } g.restore(); },
  spear(g, col, acc) { g.save(); g.translate(32, 32); g.rotate(-Math.PI / 4); poly(g, [-2, -16, 2, -16, 2, 32, -2, 32], '#6a4a2a'); poly(g, [0, -32, 6, -18, 0, -12, -6, -18], col); poly(g, [-6, -14, 6, -14, 6, -11, -6, -11], acc); g.restore(); },
  halberd(g, col, acc) { g.save(); g.translate(32, 32); g.rotate(-Math.PI / 4); poly(g, [-2, -24, 2, -24, 2, 32, -2, 32], '#6a4a2a'); poly(g, [0, -32, 4, -24, -4, -24], col); poly(g, [2, -22, 16, -26, 18, -12, 2, -12], col); poly(g, [-2, -20, -10, -17, -2, -14], acc); g.restore(); },
  bow(g, col) { g.beginPath(); g.lineWidth = 5; g.strokeStyle = '#000'; g.arc(18, 32, 26, -1.1, 1.1); g.stroke(); g.lineWidth = 3; g.strokeStyle = col; g.arc(18, 32, 26, -1.1, 1.1); g.stroke(); g.beginPath(); g.lineWidth = 1; g.strokeStyle = '#e8e0d0'; g.moveTo(18 + Math.cos(-1.1) * 26, 32 + Math.sin(-1.1) * 26); g.lineTo(18 + Math.cos(1.1) * 26, 32 + Math.sin(1.1) * 26); g.stroke(); poly(g, [14, 31, 54, 31, 54, 33, 14, 33], '#c8b890', '#000'); poly(g, [54, 28, 60, 32, 54, 36], '#a8b0b8'); },
  crossbow(g, col, acc) { poly(g, [28, 14, 36, 14, 36, 56, 28, 56], '#6a4a2a'); g.beginPath(); g.lineWidth = 5; g.strokeStyle = '#000'; g.arc(32, 34, 22, -2.6, -0.54); g.stroke(); g.lineWidth = 3; g.strokeStyle = col; g.arc(32, 34, 22, -2.6, -0.54); g.stroke(); poly(g, [26, 50, 38, 50, 38, 58, 26, 58], acc); },
  staff(g, col, acc, glow) { g.save(); g.translate(32, 32); g.rotate(-Math.PI / 5); poly(g, [-2.5, -18, 2.5, -18, 2.5, 30, -2.5, 30], '#6a4a2a'); g.beginPath(); g.arc(0, -22, 8, 0, Math.PI * 2); const gr = g.createRadialGradient(0, -22, 1, 0, -22, 9); gr.addColorStop(0, '#fff'); gr.addColorStop(1, glow || '#80b0ff'); g.fillStyle = gr; g.fill(); g.lineWidth = 2; g.strokeStyle = acc; g.stroke(); g.restore(); },
  wand(g, col, acc, glow) { g.save(); g.translate(32, 34); g.rotate(-Math.PI / 4); poly(g, [-2, -10, 2, -10, 2.5, 22, -2.5, 22], '#5a3a20'); poly(g, [0, -22, 5, -14, 0, -8, -5, -14], glow || '#c0a0ff'); g.restore(); },
  shield(g, col, acc) { poly(g, [12, 10, 52, 10, 52, 32, 32, 56, 12, 32], col); poly(g, [20, 16, 44, 16, 44, 30, 32, 46, 20, 30], acc); },
  helm(g, col, acc) { g.beginPath(); g.moveTo(14, 44); g.lineTo(14, 26); g.quadraticCurveTo(14, 10, 32, 10); g.quadraticCurveTo(50, 10, 50, 26); g.lineTo(50, 44); g.closePath(); g.fillStyle = col; g.fill(); g.lineWidth = 2; g.strokeStyle = '#000'; g.stroke(); poly(g, [20, 28, 44, 28, 44, 32, 20, 32], '#1a1410'); poly(g, [30, 32, 34, 32, 34, 44, 30, 44], acc); },
  chest(g, col, acc) { poly(g, [16, 12, 26, 8, 38, 8, 48, 12, 54, 26, 46, 28, 46, 56, 18, 56, 18, 28, 10, 26], col); poly(g, [26, 8, 32, 18, 38, 8], acc); poly(g, [18, 42, 46, 42, 46, 46, 18, 46], acc); },
  gloves(g, col, acc) { poly(g, [18, 54, 18, 30, 22, 16, 27, 16, 27, 28, 30, 12, 35, 12, 35, 28, 38, 14, 43, 14, 43, 30, 46, 22, 50, 24, 46, 54], col); poly(g, [18, 46, 46, 46, 46, 54, 18, 54], acc); },
  legs(g, col, acc) { poly(g, [16, 10, 48, 10, 50, 56, 36, 56, 32, 26, 28, 56, 14, 56], col); poly(g, [16, 10, 48, 10, 48, 16, 16, 16], acc); },
  boots(g, col, acc) { poly(g, [16, 10, 32, 10, 32, 40, 52, 44, 52, 54, 16, 54], col); poly(g, [16, 22, 32, 22, 32, 26, 16, 26], acc); },
  ring(g, col, acc, glow) { g.beginPath(); g.lineWidth = 8; g.strokeStyle = '#000'; g.arc(32, 38, 15, 0, Math.PI * 2); g.stroke(); g.lineWidth = 5; g.strokeStyle = '#d8b050'; g.arc(32, 38, 15, 0, Math.PI * 2); g.stroke(); poly(g, [32, 12, 40, 22, 32, 30, 24, 22], glow || '#ff4060'); },
  amulet(g, col, acc, glow) { g.beginPath(); g.lineWidth = 2; g.strokeStyle = '#d8b050'; g.moveTo(14, 8); g.quadraticCurveTo(32, 36, 50, 8); g.stroke(); g.beginPath(); g.arc(32, 40, 12, 0, Math.PI * 2); g.fillStyle = '#d8b050'; g.fill(); g.strokeStyle = '#000'; g.stroke(); g.beginPath(); g.arc(32, 40, 7, 0, Math.PI * 2); g.fillStyle = glow || '#40a0ff'; g.fill(); },
  tome(g, col, acc, glow) { poly(g, [14, 10, 48, 8, 50, 54, 16, 56], col); poly(g, [18, 12, 46, 10, 47, 52, 19, 54], '#e8dcc0', 'rgba(0,0,0,0.4)'); poly(g, [16, 10, 22, 10, 22, 56, 16, 56], col); g.beginPath(); g.arc(34, 31, 8, 0, Math.PI * 2); g.fillStyle = glow || '#ffd060'; g.fill(); },
  potion(g, col) { poly(g, [28, 8, 36, 8, 36, 20, 48, 34, 48, 54, 16, 54, 16, 34, 28, 20], 'rgba(200,220,230,0.4)'); poly(g, [18, 36, 46, 36, 46, 52, 18, 52], col); poly(g, [26, 4, 38, 4, 38, 10, 26, 10], '#7a5a3a'); },
  gem(g, col) { poly(g, [32, 8, 52, 24, 44, 54, 20, 54, 12, 24], col); poly(g, [32, 8, 40, 24, 32, 54, 24, 24], 'rgba(255,255,255,0.25)', 'rgba(0,0,0,0.3)'); },
  fists(g, col) { DRAW.gloves(g, '#c8a080', '#8a6a4a'); },
};

const SLOT_ICON = { helm: 'helm', chest: 'chest', gloves: 'gloves', legs: 'legs', boots: 'boots' };
const ELEM_GLOW = { fire: '#ff6a20', frost: '#70c8ff', lightning: '#c0d0ff', void: '#a060ff', holy: '#ffe080', rot: '#70d040' };

export function itemIconKind(item) {
  if (item.kind === 'weapon') return item.type;
  if (item.kind === 'shield') return 'shield';
  if (item.kind === 'armor') return SLOT_ICON[item.slot];
  if (item.kind === 'trinket') return item.slot;
  if (item.kind === 'tome') return 'tome';
  return 'gem';
}

export function itemIcon(item) {
  const kind = itemIconKind(item);
  const col = item.kind === 'tome' ? TOMES[item.tome]?.color : metal(item);
  const r = RARITY[item.rarity];
  const key = `${kind}|${col}|${item.rarity}|${item.element || ''}|${item.gem || ''}`;
  let url = cache.get(key);
  if (url) return url;
  const [c, g] = c2d();
  // rarity backdrop
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 34);
  gr.addColorStop(0, r.color + '55'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  const acc = r.index >= 3 ? r.color : '#a07a40';
  const glowC = item.element ? ELEM_GLOW[item.element] : item.kind === 'trinket' ? ({ Ruby: '#ff3040', Sapphire: '#3060ff', Topaz: '#ffc030', Amethyst: '#a050ff', Emerald: '#30d060', Onyx: '#303030', Opal: '#e0f0ff', Garnet: '#a01030', Jade: '#40a060', Moonstone: '#c0d0ff' })[item.gem] : null;
  (DRAW[kind] || DRAW.gem)(g, col || '#b0b0b8', acc, glowC);
  if (item.element && kind !== 'staff' && kind !== 'wand') { g.globalCompositeOperation = 'source-atop'; g.fillStyle = ELEM_GLOW[item.element] + '40'; g.fillRect(0, 0, S, S); g.globalCompositeOperation = 'source-over'; }
  url = pixelize(c).toDataURL();
  cache.set(key, url);
  return url;
}

export function simpleIcon(kind, color) {
  const key = `s|${kind}|${color}`;
  let url = cache.get(key);
  if (url) return url;
  const [c, g] = c2d();
  (DRAW[kind] || DRAW.gem)(g, color, '#a07a40', color);
  url = pixelize(c).toDataURL();
  cache.set(key, url);
  return url;
}


// ---------------------------------------------------------------- skill / spell icons
// Drawn directly on the 20px pixel grid (no downsampling): a bevelled medallion banded in the
// ability's element colour, with a hand-placed 12px glyph for the ability type in bone white,
// outlined in the element's darkest shade and drop-shadowed. Crisp at every integer scale.
const ICON_EL = {
  physical: '#6c7888', fire: '#d4481a', frost: '#2a88cc', lightning: '#5464e0', rot: '#4a9a2a', nature: '#3e9a34',
  void: '#6c2ad2', holy: '#d8a020', water: '#2a78c4', sand: '#c08a3a', blood: '#a81424', sound: '#b050c8', earth: '#8a6030',
};
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
const scaleC = (c, k, add = 0) => [Math.max(0, Math.min(255, Math.round(c[0] * k + add))), Math.max(0, Math.min(255, Math.round(c[1] * k + add))), Math.max(0, Math.min(255, Math.round(c[2] * k + add))), 255];

// glyph painter on a 12 x 12 mask
function glyph(fn) {
  const m = new Uint8Array(144);
  const set = (x, y) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < 12 && y < 12) m[y * 12 + x] = 1; };
  const clr = (x, y) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < 12 && y < 12) m[y * 12 + x] = 0; };
  const g = {
    R: (x, y, w, h) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j); },
    X: (x, y, w, h) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) clr(x + i, y + j); },
    L: (x0, y0, x1, y1) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1; for (let i = 0; i <= n; i++) set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n); },
    D: (cx, cy, r) => { for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) if (Math.hypot(x - cx, y - cy) <= r + 0.25) set(x, y); },
    E: (cx, cy, r) => { for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) if (Math.hypot(x - cx, y - cy) <= r + 0.25) clr(x, y); },
    O: (cx, cy, r, a0 = 0, a1 = 360) => { for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) { const d = Math.hypot(x - cx, y - cy); let a = (Math.atan2(y - cy, x - cx) * 180) / Math.PI; if (a < 0) a += 360; if (Math.abs(d - r) < 0.6 && a >= a0 && a <= a1) set(x, y); } },
    P: (pts) => { for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) { let inside = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside; } if (inside) set(x, y); } },
  };
  fn(g);
  return m;
}
const GLYPHS = {
  melee: (g) => { g.P([[10, 0], [11, 1], [4, 8], [3, 7]]); g.L(9, 1, 3, 7); g.L(1, 6, 5, 10); g.L(2, 6, 5, 9); g.L(1, 10, 2, 9); g.R(0, 10, 2, 2); },
  dash: (g) => { g.R(2, 5, 5, 2); g.P([[6, 1.5], [11.5, 6], [6, 10.5]]); g.R(0, 2, 3, 1); g.R(0, 9, 3, 1); g.R(1, 5, 1, 2); },
  spin: (g) => { g.O(6, 6, 4.6, 0, 300); g.O(6, 6, 3.8, 0, 300); g.P([[9.5, 0], [12, 3.5], [8, 4.5]]); g.D(6, 6, 1); },
  flurry: (g) => { g.L(0, 8, 5, 1); g.L(1, 8, 6, 1); g.L(3, 11, 9, 3); g.L(4, 11, 10, 3); g.L(7, 11, 11, 6); },
  volley: (g) => { for (const [x, y] of [[4, 1], [8, 2], [10, 6]]) { g.L(1, 10, x, y); g.R(x - 1, y - 1, 2, 2); } g.R(0, 10, 2, 2); },
  shot: (g) => { g.L(1, 10, 9, 2); g.L(2, 10, 10, 2); g.P([[11.5, 0.5], [11.5, 5.5], [6.5, 0.5]]); g.L(0, 8, 2, 10); g.L(1, 11, 3, 9); },
  barrage: (g) => { g.D(3, 8, 1.6); g.D(7, 3, 1.6); g.D(9.5, 8.5, 1.6); g.L(0, 11, 2, 9); g.L(4, 6, 5, 5); g.L(7, 11, 8, 10); },
  projectile: (g) => { g.D(7.5, 4.5, 3.2); g.L(0, 11, 4, 7); g.L(1, 11, 5, 7); g.R(0, 8, 1, 1); g.R(3, 11, 1, 1); },
  cone: (g) => { g.P([[1, 6], [11.5, 0.5], [11.5, 11.5]]); g.E(1, 6, 2.5); g.R(0, 5, 2, 2); },
  nova: (g) => { g.D(6, 6, 2); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.L(6 + Math.cos(a) * 3.6, 6 + Math.sin(a) * 3.6, 6 + Math.cos(a) * 5.4, 6 + Math.sin(a) * 5.4); } },
  ground: (g) => { g.D(5, 7, 3); g.L(7, 4, 11, 0); g.L(8, 5, 11, 2); g.L(6, 3, 9, 0); g.R(0, 11, 12, 1); },
  rain: (g) => { for (const [x, y] of [[1, 0], [5, 2], [9, 0], [3, 6], [7, 7], [10, 5]]) g.R(x, y, 1, 3); g.R(0, 11, 12, 1); },
  zone: (g) => { g.O(6, 6, 5); g.D(6, 6, 1); g.R(3, 4, 1, 1); g.R(8, 3, 1, 1); g.R(4, 8, 1, 1); g.R(8, 8, 1, 1); },
  aura: (g) => { g.O(6, 6, 5.2); g.O(6, 6, 2.8); g.D(6, 6, 0.8); },
  chain: (g) => { g.P([[7.5, 0], [2, 6.5], [5.5, 6.5], [3.5, 11.5], [10, 4.5], [6.5, 4.5], [9, 0]]); },
  buff: (g) => { g.P([[6, 0.5], [11.5, 6], [8, 6], [8, 11.5], [4, 11.5], [4, 6], [0.5, 6]]); },
  heal: (g) => { g.R(4, 1, 4, 10); g.R(1, 4, 10, 4); },
  summon: (g) => { g.D(6, 5, 4.5); g.R(3, 8, 6, 3); g.X(3, 4, 2, 2); g.X(7, 4, 2, 2); g.X(5, 7, 2, 1); g.X(4, 10, 1, 1); g.X(7, 10, 1, 1); },
  blink: (g) => { g.R(0, 5, 2, 2); g.R(3, 5, 2, 2); g.P([[6, 1.5], [11.5, 6], [6, 10.5]]); },
  dashblink: (g) => { g.R(0, 5, 2, 2); g.R(3, 5, 2, 2); g.P([[6, 1.5], [11.5, 6], [6, 10.5]]); },
  teleport: (g) => { g.O(6, 6, 5, 200, 360); g.O(6, 6, 5, 0, 20); g.O(6, 6, 3, 20, 200); g.D(6, 6, 1); g.P([[0, 4], [3, 8], [0, 9]]); g.P([[12, 8], [9, 4], [12, 3]]); },
  beam: (g) => { g.R(2, 5, 10, 2); g.D(2, 6, 2.2); g.R(5, 2, 1, 1); g.R(8, 9, 1, 1); g.R(10, 3, 1, 1); },
  line: (g) => { g.P([[0, 11.5], [2.5, 5], [5, 11.5]]); g.P([[3.5, 11.5], [6, 0.5], [8.5, 11.5]]); g.P([[7, 11.5], [9.5, 4], [12, 11.5]]); },
  leap: (g) => { for (let i = 0; i <= 8; i++) { const x = 1 + i, y = 9 - Math.round(7 * Math.sin((i / 8) * Math.PI) * 1); if (i % 2 === 0) g.R(x, y, 1, 1); } g.P([[8, 7], [12, 7], [10, 11.5]]); g.R(0, 11, 5, 1); },
  flask: (g) => { g.R(5, 0, 3, 4); g.R(4, 0, 5, 1); g.D(6.5, 7.5, 3.8); },
  totem: (g) => { g.R(4, 1, 4, 11); g.R(1, 3, 10, 2); g.X(5, 6, 1, 1); g.X(7, 6, 1, 1); g.X(5, 9, 2, 1); },
  trap: (g) => { g.R(0, 9, 12, 2); for (let i = 0; i < 4; i++) g.P([[i * 3, 9], [i * 3 + 1.5, 4], [i * 3 + 3, 9]]); g.R(5, 11, 2, 1); },
  wall: (g) => { g.R(0, 1, 12, 10); g.X(0, 4, 12, 1); g.X(0, 7, 12, 1); g.X(4, 1, 1, 3); g.X(9, 1, 1, 3); g.X(2, 5, 1, 2); g.X(7, 5, 1, 2); g.X(5, 8, 1, 3); g.X(10, 8, 1, 3); },
  stealth: (g) => { g.D(6, 6, 5.2); g.E(8.5, 4, 4.4); },
  passive: (g) => { g.P([[6, 0], [12, 6], [6, 12], [0, 6]]); g.P([[6, 3.5], [8.5, 6], [6, 8.5], [3.5, 6]].map(([x, y]) => [x, y])); g.X(5, 5, 2, 2); },
  crown: (g) => { g.R(1, 8, 10, 3); g.P([[1, 8.5], [1, 3.5], [4.5, 7]]); g.P([[3.5, 7.5], [6, 2], [8.5, 7.5]]); g.P([[7.5, 7], [11, 3.5], [11, 8.5]]); g.D(1, 2, 0.8); g.D(6, 1, 0.8); g.D(11, 2, 0.8); g.X(5, 9, 2, 1); },
  star: (g) => { g.P([[6, 0], [7.5, 4.5], [12, 4.5], [8.5, 7.5], [10, 12], [6, 9], [2, 12], [3.5, 7.5], [0, 4.5], [4.5, 4.5]]); },
};
GLYPHS.flurry2 = GLYPHS.flurry;
const glyphCache = new Map();
function glyphMask(type) { if (!glyphCache.has(type)) glyphCache.set(type, glyph(GLYPHS[type] || GLYPHS.star)); return glyphCache.get(type); }

export function skillIcon(def, element) {
  const elId = element || def.element || 'physical';
  const type = def.type === 'sig' || String(def.id || '').startsWith('sig_') ? 'crown' : def.type;
  const baseHex = def.color || ICON_EL[elId] || ICON_EL.physical;
  const key = `k2|${type}|${baseHex}`;
  let url = cache.get(key);
  if (url) return url;
  const N = 20, p = new Pix(N, N);
  const base = hex(baseHex);
  const hi = scaleC(base, 1.25, 30), mid = base, lo = scaleC(base, 0.62), deep = scaleC(base, 0.32), out = [16, 10, 8, 255];
  // medallion: clipped corners, outline, bevel, banded fill with a dithered seam between bands
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const cx = Math.min(x, N - 1 - x), cy = Math.min(y, N - 1 - y);
    if (cx + cy < 2) continue;
    if (cx === 0 || cy === 0 || cx + cy === 2) { p.set(x, y, out); continue; }
    if (cx + cy === 3 || ((x === 1 || y === 1) && cx + cy > 3)) { p.set(x, y, x < N / 2 && y < N / 2 ? scaleC(hi, 1.1, 10) : x === 1 || y === 1 ? hi : lo); continue; }
    if (x === N - 2 || y === N - 2) { p.set(x, y, deep); continue; }
    const band = y < 7 ? hi : y < 13 ? mid : lo;
    let c = band;
    if (y === 7 && (x % 2)) c = hi;
    if (y === 13 && (x % 2)) c = mid;
    p.set(x, y, c);
  }
  // glyph: drop shadow, element-dark outline, bone-white face with a lit top edge
  const m = glyphMask(type), ox = 4, oy = 4;
  const on = (x, y) => x >= 0 && y >= 0 && x < 12 && y < 12 && m[y * 12 + x];
  for (let y = -1; y <= 12; y++) for (let x = -1; x <= 12; x++) {
    if (on(x, y)) continue;
    if (on(x - 1, y - 1)) p.set(ox + x, oy + y, deep);
  }
  for (let y = -1; y <= 12; y++) for (let x = -1; x <= 12; x++) {
    if (on(x, y)) continue;
    if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) p.set(ox + x, oy + y, deep);
  }
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) if (on(x, y)) p.set(ox + x, oy + y, on(x, y - 1) ? [250, 240, 220, 255] : [255, 255, 250, 255]);
  // shade the lower-right of the glyph a touch for volume
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) if (on(x, y) && !on(x + 1, y + 1) && on(x, y - 1)) p.set(ox + x, oy + y, [214, 200, 178, 255]);
  url = p.canvas().toDataURL();
  cache.set(key, url);
  return url;
}
