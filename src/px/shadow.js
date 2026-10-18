// Directional pixel shadows. Every standing sprite casts its silhouette onto the ground, sheared
// away from the sun: a pixel h px above the sprite's pivot lands at (x + h*lx, pivot + h*lz). The
// sun swings from the east (shadows lean left) to the west (shadows lean right) and the shadows
// stretch at dawn and dusk; at night, indoors and underground the cast shadows fade out and only
// the soft contact blobs under the feet remain.
//
// Silhouettes are baked once per sprite frame and sun angle (cached on the Pix), with a solid core
// and a dithered penumbra toward the far tip. All cast shadows go into one opaque layer that is
// tinted and composited once, so overlapping shadows never double-darken.
//
// Drawables opt in with castShadow(sctx); the renderer calls drawCastShadows() in its shadow stage,
// before any sprite is drawn, so shadows never cover sprites.
import { Pix, ART, bayer } from './pix.js';
import { view } from './view.js';
import { atmo, sunElevation } from '../world/atmosphere.js';
import { BIOMES } from '../data/world.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// current sun projection (updated once per frame)
export const sun = {
  lx: 0.3, lz: 0.5,      // ground offset per pixel of height
  a: 0.45,               // cast shadow opacity (0 = no cast shadows)
  cast: true,            // false at night / indoors: contact blobs only
  key: '',               // bake key for the quantised direction
  color: 'rgb(22,16,40)',
  frame: 0,
};

const Q = 12;            // direction quantisation (1/Q px per px of height)
let lastT = -1;
export function updateSun() {
  sun.frame++;
  const t = atmo.timeOfDay;
  if (t === lastT && sun.key && sun._ind === atmo.indoor && shadowOpts.enabled) return;
  lastT = t; sun._ind = atmo.indoor;
  if (atmo.indoor) { sun.cast = false; sun.a = 0; return; }
  const elev = sunElevation();
  const day = smooth(0.02, 0.2, elev);
  // 0 at sunrise, 1 at sunset; the sun is always a little "north" so shadows fall toward the
  // camera and stay readable below the feet instead of hiding behind the body
  const p = clamp((t - 0.25) / 0.5, 0, 1);
  const ang = (138 - p * 118) * Math.PI / 180;
  const L = clamp(0.4 / Math.max(0.2, elev), 0.4, 1.6);
  const lx = Math.round(Math.cos(ang) * L * Q) / Q, lz = Math.max(2 / Q, Math.round(Math.sin(ang) * L * Q) / Q);
  sun.lx = lx; sun.lz = lz;
  sun.key = lx + ',' + lz;
  const weather = 1 - 0.65 * (atmo.overcast || 0) - 0.5 * (atmo.storm || 0);
  sun.a = 0.46 * day * clamp(weather, 0.15, 1);
  sun.cast = sun.a > 0.03;
  const tint = BIOMES[atmo.biome]?.shadowTint;
  if (tint !== sun._tint) {
    sun._tint = tint;
    let r = 22, g = 16, b = 40;
    if (tint) { const n = parseInt(tint.slice(1), 16); r = Math.round(((n >> 16) & 255) * 0.28); g = Math.round(((n >> 8) & 255) * 0.24); b = Math.round((n & 255) * 0.32); }
    sun.color = `rgb(${r},${g},${b})`;
  }
}

// ------------------------------------------------------------------ baking
// o.cap: heights above this many px are treated as a flat roof (buildings), so their depth doesn't
// stretch the shadow; o.thr: minimum source alpha that casts (skips baked soft shadow ovals)
let budget = 0;
const BUDGET = Math.round(60000 * ART * ART);   // source pixels baked per frame (sprites carry ART^2 more pixels now)
function bake(p, lx, lz, cap, thr) {
  const w = p.w, h = p.h, oy = p.oy, d = p.d;
  // forward-map every casting pixel (x relative to the sprite, y relative to the pivot); sub-steps
  // fill the gaps when the shadow is stretched longer than the sprite is tall
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(lx), Math.abs(lz))));
  const pts = [];
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, hmax = 1;
  for (let y = 0; y < h; y++) {
    const raw = oy - y;
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] < thr) continue;
      for (let k = 0; k < n; k++) {
        const hh0 = raw + k / n;
        let tx, ty, hh;
        if (hh0 <= 0) { hh = 0; tx = x; ty = -raw; }                                       // at / below the pivot: on the ground
        else if (hh0 > cap) { hh = cap; tx = x + cap * lx; ty = cap * lz - (hh0 - cap); }  // roof: flat, translated
        else { hh = hh0; tx = x + hh * lx; ty = hh * lz; }
        tx = Math.round(tx); ty = Math.round(ty);
        pts.push(tx, ty, hh);
        if (tx < x0) x0 = tx; if (tx > x1) x1 = tx; if (ty < y0) y0 = ty; if (ty > y1) y1 = ty;
        if (hh > hmax) hmax = hh;
      }
    }
  }
  if (x1 < x0) return null;
  const S = new Pix(x1 - x0 + 1, y1 - y0 + 1);
  S.ox = p.ox - x0; S.oy = -y0;
  const sw = S.w, sd = S.d;
  const hv = new Float32Array(sw * S.h);     // lowest source height per shadow pixel (for the penumbra)
  for (let k = 0; k < pts.length; k += 3) {
    const i = (pts[k + 1] - y0) * sw + (pts[k] - x0), hh = pts[k + 2];
    if (!sd[i * 4 + 3] || hh < hv[i]) hv[i] = hh;
    sd[i * 4 + 3] = 255;
  }
  const ax = x0, ay = y0;
  // penumbra: solid near the base, dithered toward the far tip, and a checkered rim
  const out = new Uint8ClampedArray(sd.length);
  const soft0 = hmax * 0.55;
  for (let Y = 0; Y < S.h; Y++) for (let X = 0; X < sw; X++) {
    const i = Y * sw + X;
    if (!sd[i * 4 + 3]) continue;
    const edge = X === 0 || X === sw - 1 || Y === 0 || Y === S.h - 1 || !sd[(i - 1) * 4 + 3] || !sd[(i + 1) * 4 + 3] || !sd[(i - sw) * 4 + 3] || !sd[(i + sw) * 4 + 3];
    const far = hv[i] > soft0 ? (hv[i] - soft0) / Math.max(1, hmax - soft0) : 0;
    const keep = edge && far > 0 ? 0.5 - far * 0.2 : 1 - far * 0.6;
    if (keep < 1 && bayer(X + ax, Y + ay) >= keep) continue;
    out[i * 4 + 3] = 255;
  }
  sd.set(out);
  budget -= w * h * n;
  return S;
}

// cast the shadow of a sprite whose pivot sits at low-res pixel (x, y); o.h = pivot height above the
// ground in px (riders, hovering bodies, jumps), o.cap / o.thr as in bake()
export function castSprite(sctx, p, x, y, o = {}) {
  if (!p || !sun.cast) return;
  const cap = o.cap || 9999, thr = o.thr || 140;
  let c = p._sh;
  if (!c || c.key !== sun.key || c.cap !== cap) {
    if (budget > 0 || !c) {
      const S = bake(p, sun.lx, sun.lz, cap, thr);
      c = p._sh = { key: sun.key, cap, S };
    }
  }
  const S = c.S;
  if (!S) return;
  const H = o.h || 0, k = o.k || 1;
  const dx = Math.round(x + H * sun.lx) - S.ox * k, dy = Math.round(y + H * sun.lz) - S.oy * k;
  if (dx > view.W || dy > view.H || dx + S.w * k < 0 || dy + S.h * k < 0) return;
  if (k === 1) sctx.drawImage(S.canvas(), dx, dy);
  else sctx.drawImage(S.canvas(), dx, dy, S.w * k, S.h * k);
}

// a thin pole between two points at heights h0 / h1 px above the ground (weapons, staffs)
export function castLine(sctx, x0, y0, h0, x1, y1, h1, w = 1) {
  if (!sun.cast) return;
  const ax = Math.round(x0 + h0 * sun.lx), ay = Math.round(y0 + h0 * sun.lz);
  const bx = Math.round(x1 + h1 * sun.lx), by = Math.round(y1 + h1 * sun.lz);
  const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1);
  for (let i = 0; i <= n; i++) sctx.fillRect(Math.round(ax + (bx - ax) * i / n), Math.round(ay + (by - ay) * i / n), w, w);
}

// ------------------------------------------------------------------ the shadow stage
let layer = null, lc = null;
export const shadowOpts = { enabled: true };   // cast shadows on / off (contact blobs stay)
export function drawCastShadows(ctx, list) {
  updateSun();
  budget = BUDGET;
  if (!shadowOpts.enabled) sun.cast = false;
  if (!sun.cast) return;
  const W = view.W, H = view.H;
  if (!layer) { layer = document.createElement('canvas'); lc = layer.getContext('2d'); }
  if (layer.width !== W || layer.height !== H) { layer.width = W; layer.height = H; lc.imageSmoothingEnabled = false; }
  lc.globalCompositeOperation = 'source-over';
  lc.clearRect(0, 0, W, H);
  lc.fillStyle = '#000';
  let any = false;
  for (const o of list) if (o.castShadow && !o.hidden) { o.castShadow(lc); any = true; }
  if (!any) return;
  // tint the merged silhouettes and lay them down once
  lc.globalCompositeOperation = 'source-in';
  lc.fillStyle = sun.color;
  lc.fillRect(0, 0, W, H);
  lc.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = sun.a;
  ctx.drawImage(layer, 0, 0);
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------ contact blobs
// soft dithered ellipse under the feet; bigger and softer when there is no sun to cast from
const blobs = new Map();
export function contactBlob(ctx, x, y, rx, ry, a = 1) {
  rx = Math.max(2, Math.round(rx)); ry = Math.max(1, Math.round(ry));
  const key = rx * 100 + ry;
  let p = blobs.get(key);
  if (!p) {
    p = new Pix(rx * 2 + 1, ry * 2 + 1); p.ox = rx; p.oy = ry;
    for (let j = -ry; j <= ry; j++) for (let i = -rx; i <= rx; i++) {
      const d = (i * i) / ((rx + 0.5) * (rx + 0.5)) + (j * j) / ((ry + 0.5) * (ry + 0.5));
      if (d > 1) continue;
      // three bands: dark core, mid, dithered rim
      const al = d < 0.35 ? 120 : d < 0.7 ? 84 : (bayer(i + rx, j + ry) < 0.5 ? 60 : 0);
      if (al) p.set(i + rx, j + ry, [14, 8, 20, al]);
    }
    blobs.set(key, p);
  }
  ctx.globalAlpha = a;
  ctx.drawImage(p.canvas(), Math.round(x) - p.ox, Math.round(y) - p.oy);
  ctx.globalAlpha = 1;
}
