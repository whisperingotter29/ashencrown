// Procedural pixel buildings in 3/4 top-down view: a front wall with doors and windows under a
// big tiled roof (Zelda-style), plus the town kit (stalls, braziers, lamps, fountains, banners,
// walls, towers) and site pieces (waystones, dungeon mouths, shrines, relics). Every sprite's
// pivot sits on the ground at the middle of its front edge. Windows / runes go to the emissive
// layer so they glow at night.
//
// Everything is rasterised natively at PPU art pixels per world unit (see docs/PIXEL_DENSITY.md):
// world sizes go through PPU, design-pixel geometry through ap(), and 1-px details (mortar joints,
// glints, nail heads, outlines) stay 1 px. Texture periods (bricks, planks, roof tiles) are sized
// in today's pixels so they keep their world size.
//
// Style (docs/ART_STYLE.md): every material is a short hue-shifted ramp from src/px/palette.js
// (shadows lean plum, highlights lean cream), shaded in 3-4 flat bands lit from the upper left.
// Texture comes only from clusters (brick and stone courses, plank seams, tile rows, stains);
// there is no per-pixel speckle and no dithering on sprites. Silhouettes get the ink outline.
import { Pix, C, PPU, ART, ap, light, dark, mixc, hash2, srand } from '../pix.js';
import { RAMPS, INK, INK_SOFT, CREAM, CREAM_HI } from '../palette.js';
import { ramp } from './props.js';
import { weaponSprite } from './weapons.js';

const cache = new Map();
export const memo = (k, f) => { let s = cache.get(k); if (!s) { s = f(); cache.set(k, s); } return s; };
export function mk(w, h) { const p = new Pix(Math.ceil(w), Math.ceil(h)); p.ox = Math.floor(p.w / 2); p.oy = p.h - 1; return p; }
export function done(p, e, extra = {}) {
  p.outlineSel();
  let any = false;
  if (e) for (let i = 3; i < e.d.length; i += 4) if (e.d[i]) { any = true; break; }
  return { pix: p, emis: any ? e : null, ...extra };
}
// palette shorthands
const P = RAMPS;
const pc = (ramp, i) => C(P[ramp][i]);
// A 5-step hue-shifted material ramp around one base colour: [deep, shadow, base, light, top].
// Cached: generators call this per fill, never per pixel.
const r5cache = new Map();
export function R5(base) {
  const key = typeof base === 'string' ? base : base.join(',');
  let r = r5cache.get(key);
  if (!r) { const c = C(base); r = [dark(c, 0.52), dark(c, 0.74), c, light(c, 1.13), light(c, 1.28)]; r5cache.set(key, r); }
  return r;
}
const ri = (i) => (i < 0 ? 0 : i > 4 ? 4 : i);
// warm lamplight (emissive layer) and the dark plum glass seen by day
const WIN = C(P.ember[4]), WIN_HOT = C(P.ember[5]), WIN_EDGE = C(P.ember[3]);
const GLASS = [C(INK), C('#2a1838'), C('#3c2a4e'), C('#5a4672')];
// snow on roofs and ledges: lavender-blue with slate shadows
const SNOW = [C('#6e7a9a'), C('#a4aed0'), C('#d4dcee'), C('#eef1f8')];
const IRON = R5('#3a3440'), GOLD = P.gold.map((c) => C(c)), WOOD = P.wood.map((c) => C(c));
// Stepped flame colours as CSS strings [edge, body, hot, core] for the live flames drawn by the
// structures and dungeon code: warm colours burn in the ember ramp, any other colour (aether,
// frost, fae) in its own hue-shifted ramp. Cached per colour.
const flameCache = new Map();
export function flamePalette(color) {
  let f = flameCache.get(color);
  if (!f) {
    const c = C(color), warm = c[0] > c[2] + 40 && c[0] > 180 && c[1] > c[2] && c[0] >= c[1];
    const R = warm ? [P.ember[2], P.ember[3], P.ember[4], P.ember[5]].map((h) => C(h)) : (() => { const r = R5(c); return [r[1], r[2], r[3], r[4]]; })();
    f = R.map((v) => `rgb(${v[0]},${v[1]},${v[2]})`);
    flameCache.set(color, f);
  }
  return f;
}

// texture periods in today's pixels (same world size as the original design)
const BR = ap(3), BW = ap(6);       // brick course / brick length
const KR = ap(5), KW = ap(10);      // block course / block length
const PW = ap(4);                   // plank width
const MC = ap(6);                   // marble course

// ------------------------------------------------------------------ small helpers
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// smooth value noise (cell in px), for low-frequency tone patches
function vnoise(x, y, s, cell) {
  const fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy);
  let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
// nearest jittered grid point: chunky facets (rock) and leaf clumps (hedges)
const V = { id: 0, edge: 0, dx: 0, dy: 0 };
function vor(x, y, cell, s) {
  const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
  let d1 = 1e9, d2 = 1e9;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = gx + i, cy = gy + j;
    const px = (cx + 0.15 + hash2(cx, cy, s) * 0.7) * cell, py = (cy + 0.15 + hash2(cx, cy, s + 1) * 0.7) * cell;
    const d = (x + 0.5 - px) ** 2 + (y + 0.5 - py) ** 2;
    if (d < d1) { d2 = d1; d1 = d; V.id = cx * 7919 + cy * 31; V.dx = x + 0.5 - px; V.dy = y + 0.5 - py; } else if (d < d2) d2 = d;
  }
  V.edge = Math.sqrt(d2) - Math.sqrt(d1);
  return V;
}
// darken (k < 1, hue leaning plum) or lighten (k > 1, leaning cream) one existing pixel
export const shadeAt = (p, x, y, k) => { const c = p.get(x | 0, y | 0); if (c && c[3]) p.set(x, y, k < 1 ? dark(c, k) : light(c, k)); };
// rounded-top opening (doors, arched windows): is column i, row ly (from the top) inside?
function archIn(i, ly, w) { const r = w / 2, dy = Math.max(0, r - ly); return Math.abs(i + 0.5 - r) <= Math.sqrt(Math.max(0, r * r - dy * dy)) + 0.2; }

// Lumpy stone mass lit from the top-left: chunky facets (jittered cells with their own tilt),
// chiselled seams, a shadowed underside and a few cracks. o.leafy turns the cells into rounded
// leaf clumps (hedges, bushes).
export function stoneMass(p, cx, cy, rx, ry, base, seed = 1, o = {}) {
  const R = o.ramp || ramp(base);
  const bump = o.bump ?? 0.16, lobes = o.lobes || 6, cell = o.facet || ap(4), tilt = o.tilt ?? 0.45;
  const ph = hash2(seed, 0, 1) * 6.283;
  const ex = 1 + bump * 1.1;
  for (let y = Math.floor(cy - ry * ex - 1); y <= Math.ceil(cy + ry * ex + 1); y++) for (let x = Math.floor(cx - rx * ex - 1); x <= Math.ceil(cx + rx * ex + 1); x++) {
    const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
    const ang = Math.atan2(ny, nx);
    const edge = 1 + bump * (Math.sin(ang * lobes + ph) * 0.6 + (vnoise(ang * 2.5 + 20, 0.5, seed, 1) - 0.5) * 1.1);
    const d = Math.hypot(nx, ny);
    if (d > edge || (o.flatBase && ny > o.flatBase)) continue;
    vor(x, y, cell, seed);
    let l = -0.58 * nx - 0.8 * ny + 0.18 + (hash2(V.id, 3, seed) - 0.5) * tilt + (o.lift || 0);
    if (o.leafy) l += (-(V.dx + V.dy) / cell) * 0.9;
    if (d > edge - 0.12 && ny > 0.1) l -= 0.35;
    let idx = l > 0.5 ? 3 : l > -0.05 ? 2 : l > -0.5 ? 1 : 0;
    if (V.edge < 1 && idx > 0 && (o.leafy || hash2(V.id, 5, seed) < (o.seams ?? 0.3))) idx--;
    p.set(x, y, R[idx]);
    if (o.emis && o.emisAt && o.emisAt(x, y, idx)) o.emis.set(x, y, o.emisAt(x, y, idx));
  }
  if (o.leafy) return;
  const rnd = srand(seed * 31 + 7);
  const n = o.cracks ?? Math.round((rx * ry) / 300);
  for (let k = 0; k < n; k++) {
    let x = cx + (rnd() - 0.5) * rx * 1.2, y = cy + (rnd() - 0.65) * ry * 1.1;
    const dx = rnd() < 0.5 ? -1 : 1;
    for (let s = 0, L = 3 + Math.floor(rnd() * ap(5)); s < L; s++) {
      const X = Math.round(x), Y = Math.round(y);
      if (!p.a(X, Y)) break;
      p.set(X, Y, R[0]);
      if (s === 0 && p.a(X - 1, Y)) p.set(X - 1, Y, R[3]);
      y += 1; if (rnd() < 0.55) x += dx;
    }
  }
}

// ------------------------------------------------------------------ texture fills
// Masonry / timber / plaster fill. Every pixel takes one step of the material's 5-step ramp:
// joints in the shadow steps, faces on the base, a 1-px lit lip on the top-left of each unit, and
// a few whole units a step darker or lighter (cluster variation, never per-pixel speckle).
export function fillWall(p, x0, y0, w, h, base, kind, seed = 0) {
  const R = R5(base), mid = mixc(R[1], R[2], 0.5), soft = mixc(R[1], R[2], 0.7);
  x0 = Math.round(x0); y0 = Math.round(y0); w = Math.round(w); h = Math.round(h);
  const tone = (a, b, s) => { const t = hash2(a, b, s); return t < 0.2 ? 1 : t > 0.88 ? 3 : 2; };
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const lx = x - x0, ly = y - y0;
    let k = 2, col = null;
    if (kind === 'brick') {
      const row = Math.floor(ly / BR), off = row % 2 ? BW >> 1 : 0, rx = (lx + off) % BW, ry = ly % BR, bi = Math.floor((lx + off) / BW);
      if (ry === BR - 1) k = 0;
      else if (rx === 0) k = 1;
      else {
        k = tone(bi, row, seed + 7);
        if (ry === 0 && rx < BW - 1) k = ri(k + 1);
        else if (rx === BW - 1 && k > 1) k--;
      }
    } else if (kind === 'block') {
      const row = Math.floor(ly / KR), off = Math.floor(hash2(row, 3, seed) * KW), rx = (lx + off) % KW, ry = ly % KR, bi = Math.floor((lx + off) / KW);
      if (ry === KR - 1) k = 0;
      else if (rx === 0) k = 1;
      else {
        k = tone(bi, row, seed + 7);
        if (ry === 0 || rx === 1) k = ri(k + 1);
        else if (ry === KR - 2) k = ri(k - 1);
        // chipped corners: small clusters a step down
        const chip = hash2(bi, row, seed + 9);
        if (chip < 0.28 && ((ry <= 1 && rx <= 3) || (ry === 2 && rx === 1))) k = 1;
        else if (chip > 0.8 && ry >= KR - 3 && rx >= KW - 3) k = 1;
      }
    } else if (kind === 'plank') {
      const rx = lx % PW, bi = Math.floor(lx / PW);
      const jy = (ly + Math.floor(hash2(bi, 1, seed) * 23)) % ap(11);
      if (rx === PW - 1) k = 0;
      else {
        k = tone(bi, 2, seed) === 1 ? 1 : 2;
        if (rx === 0) k = 3;
        // grain: short dashes, a few pixels long, one step down
        const gy = Math.floor(ly / ap(3));
        if (rx >= 2 && rx === 2 + Math.floor(hash2(bi, gy, seed + 1) * (PW - 3)) && hash2(bi, gy, seed + 2) < 0.4) k = ri(k - 1);
        if (jy === 0) k = 0;
        else if (jy === 2 && (rx === 1 || rx === PW - 3)) k = 0;
      }
    } else if (kind === 'adobe') {
      // a few big flat patches of sun-bleached and stained mud
      const v = vnoise(x, y, seed, ap(8));
      k = v > 0.8 ? 3 : 2;
      if (v < 0.22) col = mid;
    } else if (kind === 'marble') {
      const row = Math.floor(ly / MC), ry = ly % MC, rx = (lx + (row % 2) * MC) % (MC * 2);
      if (ry === MC - 1) k = 1;
      else if (rx === 0) k = 1;
      else {
        k = hash2(Math.floor((lx + (row % 2) * MC) / (MC * 2)), row, seed + 3) < 0.2 ? 3 : 2;
        if (ry === 0) k = 3;
        const v = vnoise(x + y * 0.6, y, seed + 2, ap(6));
        if (Math.abs(v - 0.5) < 0.025) col = mid;
      }
    } else {
      // plaster: a few large soft stains in one in-between tone
      if (vnoise(x, y, seed, ap(8)) < 0.2) col = soft;
    }
    if (!col) col = R[k];
    // wall edges: lit left, shadowed right and along the foot
    if (lx === 0) col = R[3]; else if (lx === w - 1) col = R[1];
    if (ly === h - 1) col = R[1];
    p.set(x, y, col);
  }
}
// One pixel of a roof pattern. rb counts rows up from the bottom of the slope so every eave row is
// a whole course; RR is the course height (foreshortened on the back slope).
// One pixel of a roof pattern as a ramp index around the band index b. rb counts rows up from
// the bottom of the slope so every eave row is a whole course; RR is the course height
// (foreshortened on the back slope).
function roofPx(kind, b, x, lx, rb, RR, seed) {
  if (kind === 'tile') {
    const TW = ap(4), row = Math.floor(rb / RR), ry = RR - 1 - (rb % RR), off = row % 2 ? TW >> 1 : 0, tx = (lx + off) % TW, ti = Math.floor((lx + off) / TW);
    const tv = hash2(ti, row, seed + 11), k = tv < 0.12 ? b - 1 : tv > 0.95 ? b + 1 : b;
    if (ry === RR - 1) return b - 2;                                  // shadow under the course above
    if (ry === RR - 2 && (tx === TW - 1 || tx === 0)) return b - 1;  // rounded tile ends
    if (tx === TW - 1) return b - 1;                                  // gap between tiles
    if (ry === 0 && tx > 0 && tx < TW - 2) return k + 1;              // lit lip
    return k;
  }
  if (kind === 'slate') {
    const SR = Math.max(2, RR - 1), SW = ap(5), row = Math.floor(rb / SR), ry = SR - 1 - (rb % SR), off = Math.floor(hash2(row, 5, seed) * SW), sx = (lx + off) % SW, si = Math.floor((lx + off) / SW);
    const k = hash2(si, row, seed + 13) < 0.2 ? b - 1 : b;
    if (ry === SR - 1) return b - 2;
    if (sx === 0) return b - 1;
    if (ry === 0) return k + 1;
    return k;
  }
  if (kind === 'thatch') {
    const LR = RR + 1, row = Math.floor(rb / LR), ry = LR - 1 - (rb % LR);
    const s = hash2(Math.floor(x / 2), row, seed);
    if (ry >= LR - 1 - (s < 0.33 ? 1 : 0)) return b - 2;   // ragged layer edge
    // straw: vertical strands two pixels wide
    if (hash2(Math.floor(x / 2), row * 7, seed + 3) < 0.3 && ry > 0) return b - 1;
    if (ry === 0 && s > 0.5) return b + 1;
    return b;
  }
  if (kind === 'cloth') return Math.floor(lx / ap(4)) % 2 ? b + 1 : b;
  return b;
}
// Roof of tile rows seen from the front, in flat bands: a shadowed back slope and ridge cap, a
// darker course under the ridge, then the lit main slope down to the eave. ro.ridge (0..1) adds
// the foreshortened back slope; ro.moss grows moss clusters.
export function fillRoof(p, x0, y0, w, h, base, kind = 'tile', seed = 0, snow = 0, ro = {}) {
  const R = R5(base), M = P.moss.map((c) => C(c));
  x0 = Math.round(x0); y0 = Math.round(y0); w = Math.round(w); h = Math.round(h);
  const RB = ro.ridge ? Math.max(3, Math.round(h * ro.ridge)) : 0;
  const upper = RB + Math.max(ap(3), Math.round((h - RB) * 0.18));
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const ly = y - y0, lx = x - x0;
    let k;
    if (ly < RB) k = roofPx(kind, 1, x, lx, RB - 1 - ly, ap(2), seed + 1) - (ly < RB * 0.5 ? 1 : 0);
    else k = roofPx(kind, ly < upper ? 1 : 2, x, lx, h - 1 - ly, ap(3), seed);
    let col = R[ri(k)];
    if (ro.moss && ly > RB + 2) {
      const v = vnoise(x, y, seed + 9, ap(5));
      if (v > 1 - ro.moss * 0.32) col = v > 1 - ro.moss * 0.1 ? M[3] : ri(k) <= 1 ? M[1] : M[2];
    }
    if (lx === 0) col = R[ri(k + 1)]; else if (lx >= w - 2) col = R[ri(Math.min(k, 2) - 1)];
    p.set(x, y, col);
  }
  // ridge cap (or the top edge) and the eave line
  for (let x = x0; x < x0 + w; x++) {
    const lx = x - x0;
    if (RB) {
      p.set(x, y0 + RB - 1, R[0]);
      p.set(x, y0 + RB, lx % ap(4) === ap(4) - 1 ? R[1] : R[4]);
      p.set(x, y0 + RB + 1, R[1]);
    }
    p.set(x, y0, R[0]);
    p.set(x, y0 + h - 1, R[0]);
    p.set(x, y0 + h - 2, R[1]);
  }
  if (snow) for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const t = (y - y0) / Math.max(1, h - 1);
    // stepped drift edge: the threshold moves in 3-px runs, not per pixel
    const thr = snow + (vnoise(Math.floor(x / 3) * 3, 0, seed + 3, ap(7)) - 0.5) * 0.22;
    if (t >= thr) { if (t < thr + 0.05) shadeAt(p, x, y, 0.72); continue; }
    p.set(x, y, t > thr - 0.05 ? SNOW[1] : y === y0 || (x - x0) === 0 ? SNOW[3] : t > thr * 0.55 ? SNOW[2] : SNOW[3]);
  }
}
// Window: a frame lit on the top-left, a deep plum pane with one cool glint by day, mullions,
// optional shutters, lattice (desert) and flower box. Warm ember lamplight lives on the emissive
// layer so it only shows at night.
export function windowAt(p, e, x, y, w, h, frame, o = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const FR = R5(frame), f = FR[2], fl = FR[3], fd = FR[1];
  const inG = (i, j) => i >= 0 && j >= 0 && i < w && j < h && (!o.arch || archIn(i, j, w));
  // frame: everything around the glass, lit on the top-left, shaded on the bottom-right
  for (let j = -1; j <= h; j++) for (let i = -1; i <= w; i++) {
    if (inG(i, j)) continue;
    let near = false;
    for (let dj = -1; dj <= 1 && !near; dj++) for (let di = -1; di <= 1; di++) if (inG(i + di, j + dj)) { near = true; break; }
    if (!near) continue;
    const tl = inG(i + 1, j) || inG(i, j + 1), br = inG(i - 1, j) || inG(i, j - 1);
    p.set(x + i, y + j, tl && !br ? fl : br && !tl ? fd : f);
  }
  const lc = o.color ? R5(o.color) : null;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (!inG(i, j)) continue;
    if (o.dark) { p.set(x + i, y + j, GLASS[0]); continue; }
    if (o.lattice && (i + j) % 2 === 0 && j > 0) { p.set(x + i, y + j, o.lattice); continue; }
    // pane: ink under the lintel, plum body, a short lavender glint on the upper left
    let g = GLASS[1];
    if (j === 0 || !inG(i, j - 1)) g = GLASS[0];
    else if (i >= 1 && j >= 1 && i + j === 2) g = GLASS[3];
    else if (i >= 1 && j >= 1 && i + j === 3) g = GLASS[2];
    p.set(x + i, y + j, g);
    // night: hot core low in the pane, ember body, deeper ember under the lintel
    let k = lc ? lc[2] : WIN;
    if (j === 0) k = lc ? lc[1] : WIN_EDGE;
    else if (j >= h - 2 && i >= 1 && i <= w - 2) k = lc ? lc[4] : WIN_HOT;
    e.set(x + i, y + j, k);
  }
  if (o.mullion && w >= 3 && !o.dark) {
    const mx = x + Math.floor(w / 2), my = y + Math.floor(h / 2);
    for (let j = 0; j < h; j++) if (inG(mx - x, j)) { p.set(mx, y + j, f); e.clear(mx, y + j); }
    for (let i = 0; i < w; i++) { p.set(x + i, my, i === 0 ? fl : f); e.clear(x + i, my); }
  }
  if (o.shutters) {
    const S = R5(o.shutters), SW = ap(2);
    for (const sx of [x - 1 - SW, x + w + 1]) for (let j = -1; j <= h; j++) for (let i = 0; i < SW; i++) {
      // slats: two-pixel boards with a shadow line under each
      let k = (j + 1) % 3 === 2 ? 1 : 2;
      if (i === 0 && k === 2) k = 3; else if (i === SW - 1) k = 1;
      if (j === -1) k = 3;
      p.set(sx + i, y + j, S[k]);
    }
  }
  // sill with a plum shadow line under it
  p.rect(x - 2, y + h + 1, w + 4, 1, o.snow ? SNOW[3] : FR[3]);
  for (let i = -1; i <= w; i++) shadeAt(p, x + i, y + h + 2, 0.7);
  if (o.flowers) {
    const fc = R5(o.flowers), M = P.moss;
    p.rect(x - 1, y + h + 2, w + 2, ap(2), WOOD[2]); p.rect(x - 1, y + h + 2, w + 2, 1, WOOD[3]);
    // blooms in 2-px clumps over leaves
    for (let i = -1; i <= w; i++) {
      const cl = Math.floor((i + 1) / 2), bloom = hash2(cl, x, 3) < 0.55;
      p.set(x + i, y + h + 1, bloom ? (hash2(cl, y, 4) < 0.5 ? fc[2] : fc[3]) : (cl % 2 ? M[2] : M[3]));
      if (bloom && hash2(cl, y, 5) < 0.4) p.set(x + i, y + h, fc[(i & 1) ? 2 : 3]);
    }
  }
}
// Plank door (or a dark doorway with o.dark): wood-ramp boards, iron straps, a ring handle and a
// frame that follows the arch. o.fw: frame thickness, o.stones: alternating voussoir blocks.
export function doorAt(p, x, yb, w, h, wood, o = {}) {
  x = Math.round(x); yb = Math.round(yb); w = Math.round(w); h = Math.round(h);
  const R = R5(wood), FR = R5(o.frame || dark(wood, 0.6));
  const top = yb - h + 1;
  const inD = (i, ly) => i >= 0 && i < w && ly >= 0 && ly < h && (!o.arch || archIn(i, ly, w));
  const pw = ap(2);
  for (let ly = 0; ly < h; ly++) for (let i = 0; i < w; i++) {
    if (!inD(i, ly)) continue;
    let col;
    if (o.dark) col = ly < 2 || !inD(i, ly - 2) ? GLASS[1] : i === 0 ? C(INK_SOFT) : GLASS[0];
    else {
      const seam = i % pw === pw - 1 && i < w - 1, bi = Math.floor(i / pw);
      let k = seam ? 0 : i === 0 ? 3 : i === w - 1 ? 1 : hash2(bi, 3, 7) < 0.3 ? 1 : 2;
      // grain dashes along each board
      if (!seam && k === 2 && i % pw === 0 && hash2(bi, Math.floor((top + ly) / ap(3)), 5) < 0.35) k = 1;
      if (!inD(i, ly - 1) || !inD(i, ly - 2)) k = Math.max(0, k - 1);
      col = R[k];
    }
    p.set(x + i, top + ly, col);
  }
  if (!o.dark && h >= ap(8)) for (const sy of [Math.round(h * 0.26), Math.round(h * 0.74)]) {
    for (let i = 0; i < w - 1; i++) if (inD(i, sy)) p.set(x + i, top + sy, i % 3 === 1 ? IRON[3] : IRON[1]);
    if (inD(0, sy)) p.set(x - 1, top + sy, IRON[0]);
  }
  // frame ring (dilated outline of the opening, open at the bottom)
  const fw = o.fw || 1;
  let ring = new Set();
  const inside = (i, ly) => inD(i, ly) || ring.has(i + ',' + ly);
  for (let k = 1; k <= fw; k++) {
    const add = [];
    for (let ly = -k; ly < h; ly++) for (let i = -k; i < w + k; i++) {
      if (inside(i, ly)) continue;
      if (inside(i - 1, ly) || inside(i + 1, ly) || inside(i, ly + 1) || inside(i - 1, ly + 1) || inside(i + 1, ly + 1)) add.push([i, ly, k]);
    }
    for (const [i, ly, kk] of add) {
      ring.add(i + ',' + ly);
      let fk = 2;
      if (o.stones) fk = Math.floor((i + 64 + (top + ly)) / ap(3)) % 2 ? 3 : 2;
      if (kk === fw && (i < 0 || ly < 0) && (ly < 0 || i < w / 2)) fk = Math.min(4, fk + 1);
      if (o.stones && (i + top + ly) % ap(3) === 0) fk = 1;
      p.set(x + i, top + ly, FR[fk]);
    }
  }
  if (!o.dark) { const hx = x + w - 1 - ap(1), hy = yb - Math.floor(h / 2); p.set(hx, hy, GOLD[4]); p.set(hx, hy + 1, GOLD[2]); p.set(hx - 1, hy + 1, GOLD[1]); }
}

// ------------------------------------------------------------------ houses
// Town styles, all from the master ramps: plaster and stone in cream / clay / stone / sand,
// timber in wood, roofs in rose-maroon, slate, teal or plum tiles. wallStone: the town's curtain
// walls and gate towers (a step darker than the houses so they sit back).
export const STYLE = {
  desert: { wall: ['#c8a07e', '#bc9070', '#d0aa88', '#b08068'], roof: ['#a8705a', '#9c615b'], trim: '#662b2c', cloth: ['#a94a68', '#c99a3a', '#243e7b', '#2f7070'], wallStone: '#b08068' },
  marble: { wall: ['#dccaa6', '#d2be9c', '#e2d2b2'], roof: ['#8e4a46', '#7e3c40', '#9a5a50'], trim: '#c99a3a', cloth: ['#c99a3a', '#8a3434', '#e2c494'], wallStone: '#b8aa94' },
  wood: { wall: ['#5a3628', '#77492f', '#4e3026'], roof: ['#2f5a58', '#7a2f4a', '#5e3a4a', '#8a4238'], trim: '#3f2622', cloth: ['#2f7070', '#c99a3a', '#a94a68', '#6a4a8a'], wallStone: '#6c6874' },
  stone: { wall: ['#77727a', '#6c6874', '#80787a'], roof: ['#3e4a5a', '#4a3a58', '#34405a'], trim: '#2f2c38', cloth: ['#243e7b', '#8a3434', '#6a4a8a'], wallStone: '#6c6874' },
  camp: { wall: ['#94705a', '#a8805e', '#7a5a4a'], roof: ['#6a4a3a', '#7a5a48'], trim: '#3f2622', cloth: ['#2f7070', '#8a3434', '#c99a3a'], wallStone: '#7a5a4a' },
  port: { wall: ['#5e7a78', '#646a86', '#8a6a5e'], roof: ['#7a2f4a', '#3e4a5a', '#8a4238'], trim: '#2f2c38', cloth: ['#e2c494', '#2f7070', '#8a3434'], wallStone: '#7a6a66' },
};
const PLASTER = ['#d6c2a2', '#ccb698', '#dccab0'];

// a course of fitted foundation stones
function foundation(p, x, y, w, h, base, seed) {
  const R = R5(base);
  let sx = x, k = 0;
  while (sx < x + w) {
    const sw = ap(3) + Math.floor(hash2(k, 1, seed) * ap(3)), t = hash2(k, 2, seed), tk = t < 0.3 ? 1 : t > 0.8 ? 3 : 2;
    for (let i = 0; i < sw && sx + i < x + w; i++) for (let j = 0; j < h; j++) {
      let kk = tk;
      if (i === 0) kk = 0; else if (j === 0) kk = Math.min(4, tk + 1); else if (j === h - 1) kk = 1;
      p.set(sx + i, y + j, R[kk]);
    }
    sx += sw; k++;
  }
}
// overlapping horizontal weatherboards (port houses)
function clapboard(p, x0, y0, w, h, base, seed) {
  const R = R5(base), BH = ap(3);
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const lx = x - x0, ly = y - y0, row = Math.floor(ly / BH), ry = ly % BH, tv = hash2(row, 1, seed);
    let k = tv < 0.25 ? 1 : 2;
    if (ry === 0) k = 0;                 // shadow under the board above
    else if (ry === BH - 1) k = 3;       // lit lower lip
    if (ry > 0 && (lx + Math.floor(tv * 37)) % ap(24) === 0) k = 0;   // butt joints
    if (lx < 2) k = lx === 0 ? 3 : 1;
    else if (lx >= w - 2) k = lx === w - 1 ? 0 : 1;
    p.set(x, y, R[k]);
  }
}
// alternating long / short corner stones (stone houses)
function quoins(p, x0, y0, w, h, base) {
  const R = R5(light(base, 1.12)), J = R5(base)[0];
  for (let y = y0, k = 0; y < y0 + h; y += KR, k++) {
    const qw = k % 2 ? ap(3) : ap(5), hh = Math.min(KR - 1, y0 + h - y);
    for (const [qx, side] of [[x0, 0], [x0 + w - qw, 1]]) {
      for (let j = 0; j < hh; j++) for (let i = 0; i < qw; i++) {
        let kk = 2;
        if (j === 0 || (side === 0 && i === 0)) kk = 3;
        else if (j === hh - 1 || i === qw - 1) kk = 1;
        p.set(qx + i, y + j, R[kk]);
      }
      if (y + hh < y0 + h) p.rect(qx, y + hh, qw, 1, J);
    }
  }
}
function dormer(p, e, cx, y, roofC, trim, faceC) {
  const ww = ap(4) + 1, wh = ap(4) + 1, x = cx - (ww >> 1), RC = R5(roofC), FC = R5(faceC);
  p.rect(x - 2, y - 2, ww + 4, wh + 4, FC[2]); p.rect(x - 2, y - 2, 1, wh + 4, FC[3]); p.rect(x + ww + 1, y - 2, 1, wh + 4, FC[1]);
  windowAt(p, e, x, y, ww, wh, trim, { mullion: true });
  const gh = ap(4), gy = y - 3;
  for (let j = 0; j <= gh; j++) {
    const hw = Math.round((j / gh) * ((ww >> 1) + 4));
    for (let i = -hw; i <= hw; i++) p.set(cx + i, gy - gh + j, j === gh ? RC[0] : Math.abs(i) >= hw - 1 ? RC[1] : i < 0 ? RC[3] : RC[2]);
  }
}
// small things stood against the front wall
function clutter(p, x, yb, kind, seed) {
  if (kind === 'barrel') {
    const w = WOOD, W = ap(6), H = ap(8);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const u = (i + 0.5) / W; let col = w[u < 0.3 ? 4 : u < 0.65 ? 3 : 2];
      if (i % 3 === 2) col = w[u < 0.65 ? 2 : 1];
      if (j === 2 || j === H - 3) col = u < 0.3 ? IRON[3] : IRON[1];
      p.set(x + i, yb - H + 1 + j, col);
    }
    p.rect(x + 1, yb - H, W - 2, 1, w[1]); p.rect(x + 1, yb - H + 1, W - 2, 1, w[2]);
  } else if (kind === 'crate') {
    const W = ap(7), H = ap(6), c = P.wood[4];
    fillWall(p, x, yb - H + 1, W, H, c, 'plank', seed);
    p.line(x + 1, yb - 1, x + W - 2, yb - H + 2, WOOD[1]);
    p.rect(x, yb - H + 1, W, 1, WOOD[5]);
  } else if (kind === 'logs') {
    for (let k = 0; k < 5; k++) {
      const lx = x + 2 + (k % 3) * ap(3) + (k >= 3 ? ap(1.5) : 0), ly = yb - 2 - (k >= 3 ? ap(3) : 0);
      p.disc(lx + 0.5, ly + 0.5, ap(1.6), WOOD[2]); p.disc(lx + 0.5, ly + 0.5, ap(1.6) - 1, P.sand[3]); p.set(lx, ly, WOOD[4]);
    }
  } else if (kind === 'pots') {
    for (let k = 0; k < 2; k++) {
      const R = R5(k ? P.clay[4] : P.clay[3]), px = x + k * ap(5), r = ap(2.5) - k;
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { if (i * i + j * j > r * r + 1) continue; const l = -i - j; p.set(px + r + i, yb - r + j, R[l > 2 ? 3 : l > -1 ? 2 : l > -3 ? 1 : 0]); }
      p.rect(px + r - 1, yb - 2 * r - 2, 3, 2, R[1]); p.rect(px + r - 2, yb - 2 * r - 3, 5, 1, R[3]);
    }
  }
}

// w, d, h in world units; returns sprite + footprint
export function houseSprite(style, w, d, h, seed, o = {}) {
  const key = ['house', style, w.toFixed(1), d.toFixed(1), h.toFixed(1), seed, o.snow ? 1 : 0, o.variant || 0].join(':');
  return memo(key, () => {
    const r = srand(seed * 7 + 3);
    const S = STYLE[style] || STYLE.wood;
    const pick = (a) => a[Math.floor(r() * a.length)];
    const W = Math.round(w * PPU), D = Math.round(d * PPU), Hh = Math.round(h * PPU * 0.72);
    const ov = ap(2), M = ap(4), FH = ap(2);
    const RH = style === 'desert' ? Math.round(D * 0.42) : Math.round(D * 0.48 + h * PPU * 0.28);
    const top = ap(14);
    const p = mk(W + ov * 2 + M * 2, Hh + RH + top), e = mk(p.w, p.h);
    const x0 = M + ov, yb = p.h - 1, wallTop = yb - Hh + 1, wH = Hh - FH;
    const wallC = pick(S.wall), roofC = pick(S.roof), trim = C(S.trim);
    const WR = R5(wallC);
    const cx = x0 + Math.floor(W / 2);
    if (style === 'camp') return tent(p, e, S, r, W, Hh + RH, o.snow);
    if (style === 'mushroom') return mushroomHouse(p, e, r, W, Hh);
    // ---- foundation
    if (style === 'port') {
      p.rect(x0, yb - FH + 1, W, FH, INK_SOFT);
      for (let x = x0 + 1; x < x0 + W - 2; x += ap(8)) { p.rect(x, yb - FH + 1, ap(2), FH, WOOD[2]); p.set(x, yb - FH + 1, WOOD[4]); }
      p.rect(x0 + W - ap(2) - 1, yb - FH + 1, ap(2), FH, WOOD[2]);
    } else foundation(p, x0 - 1, yb - FH + 1, W + 2, FH, style === 'marble' ? '#b8aa94' : style === 'desert' ? WR[1] : P.stone[3], seed);
    // ---- front wall
    if (style === 'desert') {
      fillWall(p, x0, wallTop, W, wH, wallC, 'adobe', seed);
      // splash-darkened base (a flat band), hairline cracks and a patch of bare mud brick
      for (let j = 0; j < ap(3); j++) for (let x = x0 + 1; x < x0 + W - 1; x++) p.set(x, yb - FH - j, j === ap(3) - 1 && (x >> 2) % 3 === 0 ? WR[2] : WR[1]);
      for (let k = 0; k < 3; k++) {
        let x = x0 + 3 + Math.floor(r() * (W - 6)), y = wallTop + ap(4) + Math.floor(r() * wH * 0.45);
        for (let s = 0; s < ap(5); s++) { p.set(x, y, WR[0]); if (s === 0) p.set(x + 1, y, WR[3]); y++; if (r() < 0.5) x += r() < 0.5 ? -1 : 1; }
      }
      const bx = x0 + ap(3) + Math.floor(r() * (W * 0.25)), by = wallTop + Math.floor(wH * (0.5 + r() * 0.2));
      fillWall(p, bx, by, ap(7), ap(4), P.clay[3], 'brick', seed + 3);
      p.rect(bx - 1, by - 1, ap(7) + 2, 1, WR[3]);
    } else if (style === 'marble') fillWall(p, x0, wallTop, W, wH, wallC, 'marble', seed);
    else if (style === 'stone') { fillWall(p, x0, wallTop, W, wH, wallC, 'block', seed); quoins(p, x0, wallTop, W, wH, wallC); }
    else if (style === 'port') clapboard(p, x0, wallTop, W, wH, wallC, seed);
    else {
      fillWall(p, x0, wallTop, W, wH, pick(PLASTER), 'plaster', seed);
      // timber frame: braces, posts, rails, a sill beam, pegs
      const TR = R5(wallC), tc = TR[2], tl = TR[3], td = TR[0];
      const midY = wallTop + Math.floor(Hh * 0.5);
      const p1 = x0 + Math.floor(W / 3) - 1, p2 = x0 + Math.floor((W * 2) / 3) - 1;
      p.line(x0 + 2, midY - 2, p1 - 1, wallTop + 3, td, 2); p.line(x0 + 2, midY - 3, p1 - 1, wallTop + 2, tc);
      p.line(x0 + W - 3, midY - 2, p2 + 2, wallTop + 3, td, 2); p.line(x0 + W - 3, midY - 3, p2 + 2, wallTop + 2, tc);
      for (const x of [x0, x0 + W - 2, p1, p2]) { p.rect(x, wallTop, 2, wH, tc); p.rect(x + 1, wallTop, 1, wH, td); }
      for (const ry of [wallTop, midY, yb - FH - 1]) { p.rect(x0, ry, W, 2, tc); p.rect(x0, ry, W, 1, tl); }
      for (const x of [x0, x0 + W - 2, p1, p2]) for (const ry of [wallTop, midY]) p.set(x, ry + 1, td);
      // a little exposed brick where the plaster fell off
      if (r() < 0.6) { const bx = x0 + ap(3) + Math.floor(r() * (W - ap(12))), by = midY + ap(4) + Math.floor(r() * ap(4)); fillWall(p, bx, by, ap(5), ap(3), P.clay[3], 'brick', seed + 2); }
    }
    // ---- eave shadow across the top of the wall: two flat plum bands
    for (let j = 0; j <= ap(2); j++) for (let x = x0; x < x0 + W; x++) shadeAt(p, x, wallTop + j, j < ap(2) - 1 ? 0.62 : 0.8);
    // ---- door + windows
    const dw = Math.max(ap(5), Math.round(W * 0.16)), dh = Math.min(Hh - ap(3) - FH, ap(20));
    const dx = cx - Math.floor(dw / 2), doorTop = yb - FH - dh + 1;
    const stoneFrame = style === 'stone' || style === 'marble' || style === 'desert';
    doorAt(p, dx, yb - FH, dw, dh, style === 'desert' || style === 'marble' ? P.wood[3] : P.wood[2], { arch: style !== 'wood' && style !== 'port', frame: style === 'marble' ? P.gold[3] : style === 'stone' ? light(wallC, 1.12) : style === 'desert' ? WR[1] : null, fw: stoneFrame ? 2 : 1, stones: style === 'stone' });
    // doorstep
    const ST = R5(style === 'marble' ? '#cdbfa6' : P.stone[4]);
    p.rect(dx - 2, yb - FH + 1, dw + 4, FH, ST[2]); p.rect(dx - 2, yb - FH + 1, dw + 4, 1, ST[3]); p.rect(dx - 2, yb, dw + 4, 1, ST[0]);
    const wwid = style === 'desert' ? ap(3) : ap(4) + 1, whgt = style === 'desert' ? ap(6) : ap(5) + 1;
    const wy = wallTop + Math.max(ap(3), Math.floor(Hh * 0.28));
    const winX = [cx - Math.floor(W * 0.3) - (wwid >> 1), cx + Math.floor(W * 0.3) - (wwid >> 1)];
    const frameC = style === 'marble' ? '#cdbfa6' : style === 'stone' ? P.stone[2] : S.trim;
    if (W >= ap(40)) for (const wx of winX) windowAt(p, e, wx, wy, wwid, whgt, frameC, { mullion: style !== 'desert', arch: style === 'desert', lattice: style === 'desert' ? C(P.wood[1]) : null, snow: o.snow, shutters: style === 'wood' && r() < 0.6 ? pick([P.teal[3], P.rose[1], P.slate[2]]) : null, flowers: (style === 'wood' || style === 'stone' || style === 'port') && !o.snow && r() < 0.4 ? pick([P.rose[3], P.gold[4], P.lavender[4], CREAM]) : null });
    const uw = ap(4) + 1, uwy = wallTop + ap(2) + 2;
    if (Hh > ap(26) && style !== 'desert' && uwy + uw + 4 < doorTop - 2) windowAt(p, e, cx - (uw >> 1), uwy, uw, uw, frameC, { mullion: true, snow: o.snow });
    // a wall lantern beside the door (ember glass; glows at night)
    if ((style === 'wood' || style === 'stone' || style === 'port') && r() < 0.5) {
      const lx = dx + dw + ap(2) + 1, ly = doorTop + ap(2);
      p.rect(lx - 1, ly - 1, 3, 1, INK_SOFT); p.rect(lx - 1, ly, 3, ap(3), INK_SOFT); p.rect(lx, ly + 1, 1, ap(3) - 2, P.ember[3]);
      e.rect(lx, ly + 1, 1, ap(3) - 2, P.ember[5]); p.rect(lx - 2, ly - 2, 5, 1, IRON[2]);
    }
    // ---- portico (marble)
    if (style === 'marble') {
      for (const fx of [0.06, 0.32, 0.68, 0.94]) column(p, x0 + Math.round(W * fx) - ap(1.5), yb - FH, wH, ap(3) + 1, '#e2d4b8');
      const ex = x0 - ap(2), ew = W + ap(4), ey = wallTop - ap(2);
      const MR = R5('#d8c8a8');
      const rows = [MR[4], MR[3], GOLD[3], MR[2], MR[1]];
      rows.forEach((col, j) => p.rect(ex, ey + j, ew, 1, col));
      for (let x = ex + 1; x < ex + ew; x += 3) p.set(x, ey + 3, MR[1]);
    }
    // ---- roof
    const ry0 = wallTop - RH;
    if (style === 'desert') {
      // flat roof: the top surface with a parapet lip, beam ends below
      fillWall(p, x0 - 1, ry0 + 2, W + 2, RH - 2, light(wallC, 1.1), 'adobe', seed + 1);
      const PH = ap(2), TR = R5(light(wallC, 1.1));
      p.rect(x0 - 1, ry0, W + 2, PH, WR[2]); p.rect(x0 - 1, ry0, W + 2, 1, WR[3]);
      p.rect(x0 - 1, wallTop - PH, W + 2, PH, WR[1]); p.rect(x0 - 1, wallTop - PH, W + 2, 1, WR[3]);
      p.rect(x0 + 1, ry0 + PH, W - 2, 1, TR[1]); p.rect(x0 + 1, ry0 + PH, 1, RH - PH * 2, TR[1]);
      p.clear(x0 - 1, ry0); p.clear(x0 + W, ry0);
      for (let x = x0 + ap(3); x < x0 + W - ap(3); x += ap(6)) { p.rect(x, wallTop + 1, 3, 3, WOOD[2]); p.set(x, wallTop + 1, WOOD[4]); p.set(x + 2, wallTop + 3, WOOD[0]); shadeAt(p, x + 1, wallTop + 4, 0.72); }
      // rooftop clutter: a hatch and a drying rug
      const hx = x0 + ap(4) + Math.floor(r() * (W * 0.3)), hy = ry0 + PH + ap(3);
      if (hy + ap(4) < wallTop - PH - 1) { p.rect(hx, hy, ap(5), ap(4), WOOD[2]); p.rect(hx + 1, hy + 1, ap(5) - 2, ap(4) - 2, INK); p.rect(hx, hy, ap(5), 1, WOOD[4]); }
      if (r() < 0.45) dome(p, e, cx, ry0 + Math.floor(RH * 0.6), Math.min(W, D) * 0.28, r() < 0.3 ? P.gold[3] : pick(['#dcc6a2', P.teal[3], '#c8987a']), r() < 0.35);
      else {
        // striped awning over the door with a scalloped hem
        const aw = Math.round(W * 0.7), ax = cx - Math.floor(aw / 2), AH = ap(5), ay = doorTop - ap(6), SW = ap(3);
        const CR = R5(pick(S.cloth)), CW = R5('#e2cfae');
        for (let y = 0; y <= AH; y++) for (let x = 0; x < aw; x++) {
          const st = Math.floor(x / SW) % 2, sx = x % SW;
          if (y === AH && (sx === 0 || sx === SW - 1)) continue;
          const R = st ? CR : CW;
          let k = 2;
          if (y === 0) k = 3; else if (y >= AH - 1) k = 1;
          if (sx === SW - 1 && y < AH - 1 && k > 1) k--;
          p.set(ax + x, ay + y, R[k]);
        }
        for (let j = 1; j <= ap(2); j++) for (let x = 0; x < aw; x++) shadeAt(p, ax + x, ay + AH + j, 0.7);
        for (const sx of [ax, ax + aw - 2]) { p.rect(sx, ay + AH, 2, yb - FH - ay - AH + 1, WOOD[1]); p.rect(sx, ay + AH, 1, yb - FH - ay - AH + 1, WOOD[3]); }
      }
    } else {
      const kind = style === 'stone' ? 'slate' : style === 'wood' && r() < 0.3 ? 'thatch' : 'tile';
      const rc = kind === 'thatch' ? '#9a7a4e' : roofC;
      fillRoof(p, x0 - ov, ry0, W + ov * 2, RH, rc, kind, seed, o.snow ? 0.55 : 0, { ridge: 0.2, moss: !o.snow && (style === 'wood' || style === 'port') ? 0.22 : 0 });
      if (style === 'wood' || style === 'port') { const BR5 = R5(trim); for (const vx of [x0 - ov, x0 + W + ov - 2]) { p.rect(vx, ry0 + 1, 2, RH - 1, BR5[2]); p.rect(vx, ry0 + 1, 1, RH - 1, BR5[4]); } }
      if (style === 'marble') { const MR = R5('#d8c8a8'); for (let x = x0 - ov + 1; x < x0 + W + ov - 1; x += ap(3)) { p.rect(x, ry0 + RH - 2, 2, 2, MR[2]); p.set(x, ry0 + RH - 2, MR[4]); } }
      // chimney with its shadow on the roof
      if (style !== 'marble') {
        const chw = ap(5), chh = ap(10);
        const chx = x0 + Math.round(W * (r() < 0.5 ? 0.22 : 0.72)), chy = ry0 + Math.floor(RH * 0.35);
        for (let j = -Math.round(chh * 0.4); j < 4; j++) for (let i = 0; i < 3; i++) shadeAt(p, chx + chw + i, chy + j, 0.66);
        const CH = style === 'stone' ? P.stone[3] : '#8a5e56';
        fillWall(p, chx, chy - chh + 1, chw, chh, CH, 'brick', seed + 5);
        for (let j = 0; j < 2; j++) for (let i = 0; i < chw; i++) shadeAt(p, chx + i, chy - chh + 1 + j, 0.66);
        const cy0 = chy - chh - 2, CR = R5(CH);
        p.rect(chx - 1, cy0, chw + 2, 3, CR[1]); p.rect(chx - 1, cy0, chw + 2, 1, o.snow ? SNOW[3] : CR[3]); p.rect(chx + 1, cy0 + 1, chw - 2, 1, INK);
        p.rect(chx - 1, chy + 1, chw + 2, 1, R5(roofC)[0]);
        o.chimney = [chx + (chw >> 1) - p.ox, cy0 - 1 - p.oy];
      }
      if (W >= ap(50) && style !== 'marble') dormer(p, e, cx, ry0 + Math.floor(RH * 0.5), rc, S.trim, style === 'stone' || style === 'port' ? wallC : PLASTER[0]);
      // icicles along the eave, in two-pixel clumps
      if (o.snow) for (let x = x0 - ov; x < x0 + W + ov; x++) if (hash2(x >> 1, seed, 7) < 0.3) { const L = 1 + Math.floor(hash2(x >> 1, 2, seed) * ap(3)) - (x & 1); for (let k = 0; k < L; k++) p.set(x, wallTop + k, k === L - 1 ? P.frost[5] : P.frost[4]); }
    }
    // ---- things leaning on the wall
    if (r() < 0.65) {
      const kind = style === 'desert' ? 'pots' : style === 'marble' ? null : pick(style === 'port' ? ['barrel', 'crate', 'crate'] : ['barrel', 'crate', 'logs']);
      if (kind) clutter(p, r() < 0.5 ? x0 + ap(2) : x0 + W - ap(2) - ap(9), yb, kind, seed);
    }
    if (o.snow) for (let x = x0 - 1; x <= x0 + W; x++) if (hash2(x >> 2, 9, seed) < 0.6) p.set(x, yb - FH + 1, SNOW[2]);
    return done(p, e, { chimney: o.chimney || null, footprint: [w, d] });
  });
}
// fluted column: x = left edge, yb = ground row, h = total height, w = shaft width
function column(p, x, yb, h, w, col) {
  const R = R5(col), R4 = [R[1], mixc(R[1], R[2], 0.5), R[2], R[3]];
  const capH = ap(2), baseH = ap(2);
  for (let y = yb - h + capH + 1; y <= yb - baseH; y++) for (let i = 0; i < w; i++) {
    const u = (i + 0.5) / w;
    let idx = u < 0.25 ? 3 : u < 0.55 ? 2 : u < 0.8 ? 1 : 0;
    if (w >= 5 && i > 0 && i < w - 1 && i % 2 === 0) idx = Math.max(0, idx - 1);
    p.set(x + i, y, R4[idx]);
  }
  p.rect(x - 1, yb - h + 1, w + 2, capH, R[4]); p.rect(x - 1, yb - h + capH, w + 2, 1, R[1]); p.set(x + w, yb - h + 1, R[2]);
  p.rect(x - 1, yb - baseH + 1, w + 2, baseH, R[2]); p.rect(x - 1, yb - baseH + 1, w + 2, 1, R[3]); p.rect(x - 1, yb, w + 2, 1, R[1]);
}
function dome(p, e, cx, yb, r, col, onion) {
  const R = R5(col), Rh = r * (onion ? 1.5 : 1), drum = ap(3), DR = R5('#d6c4a2');
  // drum
  for (let y = yb - drum + 1; y <= yb; y++) for (let x = Math.round(cx - r * 0.9); x <= cx + r * 0.9; x++) {
    const u = (x + 0.5 - cx) / (r * 0.9);
    let c = u < -0.4 ? DR[3] : u < 0.4 ? DR[2] : DR[1];
    if (y === yb - drum + 1) c = DR[4];
    if (Math.abs(((x - cx) % ap(4) + ap(4)) % ap(4) - ap(2)) < 1 && y > yb - drum + 1) c = INK_SOFT;
    p.set(x, y, c);
  }
  const base = yb - drum;
  for (let y = Math.floor(base - Rh); y <= base; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
    const ny = (base - y) / Rh, nx = (x + 0.5 - cx) / r;
    const wdt = onion ? Math.sin(Math.min(1, ny * 1.25) * Math.PI) * 0.9 + (ny < 0.4 ? 0.4 : 0) : Math.sqrt(Math.max(0, 1 - ny * ny));
    if (Math.abs(nx) > wdt) continue;
    const l = -0.6 * nx + 0.55 * ny;
    let k = l > 0.5 ? 4 : l > 0.12 ? 3 : l > -0.35 ? 2 : 1;
    // ribs a step down
    for (let q = -3; q <= 3; q++) if (Math.abs(x + 0.5 - (cx + (q / 4) * wdt * r)) < 0.5 && ny > 0.08 && ny < 0.92) k = Math.max(0, k - 1);
    if (y === base) k = 0;
    p.set(x, y, R[k]);
  }
  const tip = Math.floor(base - Rh);
  p.rect(Math.round(cx), tip - ap(3), 1, ap(3), GOLD[3]); p.disc(Math.round(cx) + 0.5, tip - ap(3), 1.6, GOLD[4]); p.set(Math.round(cx), tip - ap(3) - 1, GOLD[5]);
}
function tent(p, e, S, r, W, H, snow) {
  const CC = R5(S.cloth[Math.floor(r() * S.cloth.length)]);
  const body = C(S.wall[Math.floor(r() * S.wall.length)]), Rm = R5(body);
  const cx = p.w / 2, yb = p.h - 1, R0 = W * 0.5, top = Math.round(yb - Math.min(H, W * 0.8));
  const band = top + Math.round((yb - top) * 0.55);
  // guy ropes behind the body
  for (const sd of [-1, 1]) { const ax = cx + sd * R0 * 0.62, ay = band - ap(3); p.line(ax, ay, cx + sd * (R0 + ap(3)), yb, P.sand[2]); p.set(Math.round(cx + sd * (R0 + ap(3))), yb, WOOD[1]); }
  for (let y = top; y <= yb; y++) {
    const t = (y - top) / (yb - top), half = R0 * Math.sqrt(t) + 1;
    for (let x = Math.floor(cx - half); x <= cx + half; x++) {
      const u = (x + 0.5 - (cx - half)) / (2 * half);
      let k = u < 0.22 ? 3 : u < 0.6 ? 2 : u > 0.84 ? 0 : 1;
      // hide panels: seams between eight gores
      const su = u * 8;
      if (Math.abs(su - Math.round(su)) * (2 * half / 8) < 0.5 && u > 0.06 && u < 0.94) k = Math.max(0, k - 1);
      if (y > yb - ap(3)) k = Math.max(0, Math.min(k, 2) - 1);
      let col = Rm[k];
      const dy = y - band;
      if (dy === -1) col = CC[3]; else if (dy === 0) col = (x + y) % 4 < 2 ? CC[2] : CC[1]; else if (dy === 1) col = CC[0];
      if (snow && t < 0.22 + (vnoise(Math.floor(x / 3) * 3, 0, 4, ap(3)) - 0.5) * 0.12) col = t > 0.16 ? SNOW[1] : u < 0.5 ? SNOW[3] : SNOW[2];
      p.set(x, y, col);
    }
  }
  // door flap, rolled back to the right
  const dh = ap(14), dwh = ap(4);
  p.poly([[cx - dwh, yb + 1], [cx, yb - dh], [cx + dwh, yb + 1]], GLASS[1]);
  p.poly([[cx - dwh + 2, yb + 1], [cx, yb - dh + ap(4)], [cx + dwh - 2, yb + 1]], GLASS[0]);
  p.poly([[cx, yb - dh], [cx + dwh + 2, yb + 1], [cx + dwh - 1, yb + 1]], Rm[3]);
  p.line(cx, yb - dh, cx + dwh + 2, yb, Rm[4]);
  p.rect(Math.round(cx + dwh - 1), yb - Math.round(dh * 0.45), 3, 1, CC[2]);
  // pole and pennant
  p.rect(Math.round(cx) - 1, top - ap(4), 2, ap(5), WOOD[1]); p.rect(Math.round(cx) - 1, top - ap(4), 1, ap(5), WOOD[3]);
  p.poly([[cx + 1, top - ap(4)], [cx + ap(6), top - ap(2.5)], [cx + 1, top - ap(1)]], CC[2]);
  return done(p, null, { footprint: [W / PPU, W / PPU] });
}
function mushroomHouse(p, e, r, W, Hh) {
  const cx = p.w / 2, yb = p.h - 1;
  const stem = R5('#dcc8aa'), cap = R5([P.plum[4], P.rose[2], P.teal[3]][Math.floor(r() * 3)]);
  const sw = W * 0.22;
  for (let y = yb - Hh; y <= yb; y++) {
    const t = (y - (yb - Hh)) / Hh, half = sw * (1 + Math.max(0, t - 0.75) * 0.7);
    for (let x = Math.round(cx - half); x <= cx + half; x++) {
      const u = (x + 0.5 - (cx - half)) / (2 * half);
      let k = u < 0.25 ? 3 : u < 0.62 ? 2 : u < 0.86 ? 1 : 0;
      // vertical fibres: short dashes a step down
      if (k >= 2 && hash2(x, Math.floor(y / ap(4)), 4) < 0.14) k--;
      p.set(x, y, stem[k]);
    }
  }
  doorAt(p, Math.round(cx) - ap(3), yb, ap(6), ap(12), P.wood[2], { arch: true });
  windowAt(p, e, Math.round(cx) + ap(4), yb - Hh + ap(8), ap(3), ap(3), P.wood[2], { color: P.aether[5], arch: true });
  const cy = yb - Hh, rx = W * 0.6, ry = W * 0.32;
  // gills under the rim
  for (let y = Math.floor(cy); y <= cy + ry * 0.42; y++) for (let x = Math.floor(cx - rx * 0.92); x <= cx + rx * 0.92; x++) {
    const nx = (x + 0.5 - cx) / (rx * 0.92), ny = (y + 0.5 - cy) / (ry * 0.42);
    if (nx * nx + ny * ny > 1 || ny < 0) continue;
    p.set(x, y, Math.round(Math.atan2(ny, nx) * 14) % 2 ? stem[1] : stem[0]);
  }
  // cap: a lumpy dome lit from the top-left in flat bands, rim shadow, spots
  const ph = r() * 6;
  for (let y = Math.floor(cy - ry - 2); y <= cy + ry * 0.35; y++) for (let x = Math.floor(cx - rx - 2); x <= cx + rx + 2; x++) {
    const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
    const ang = Math.atan2(ny, nx), edge = 1 + 0.07 * Math.sin(ang * 7 + ph);
    if (ny > 0.35 || nx * nx + ny * ny > edge * edge) continue;
    const l = -0.55 * nx - 0.75 * ny;
    let k = l > 0.62 ? 4 : l > 0.2 ? 3 : l > -0.3 ? 2 : 1;
    if (ny > 0.22) k = Math.max(0, k - 1);
    p.set(x, y, cap[k]);
  }
  const SP = R5(CREAM);
  for (let k = 0; k < 8; k++) {
    const sx = cx + (r() - 0.5) * rx * 1.5, sy = cy - r() * ry * 0.75 - 1, s = 1.3 + r() * ap(1.2);
    p.ellipse(sx, sy, s * 1.3, s, SP[2]); p.set(Math.round(sx + s * 0.6), Math.round(sy + s * 0.5), SP[1]); p.set(Math.round(sx - s * 0.5), Math.round(sy - s * 0.4), SP[4]);
  }
  return done(p, e, { footprint: [W / PPU, W / PPU] });
}

// ------------------------------------------------------------------ town kit
function goods(p, x, y, kind, r) {
  if (kind === 'fruit') {
    const g = R5([P.red[4], P.ember[3], P.green[4], P.gold[4]][Math.floor(r() * 4)]);
    for (let k = 0; k < 5; k++) { const fx = x + (k % 3) * 3 + (k >= 3 ? 1.5 : 0), fy = y - (k >= 3 ? 3 : 0); p.disc(fx + 1.5, fy - 1, 1.8, g[2]); p.set(fx + 1, fy - 2, g[4]); p.set(fx + 2, fy, g[0]); }
  } else if (kind === 'bread') {
    const B5 = R5(P.wood[5]);
    for (let k = 0; k < 2; k++) { p.ellipse(x + 3 + k * 5, y - 2, 3, 2, B5[2]); p.rect(x + 1 + k * 5, y - 3, 4, 1, B5[4]); p.set(x + 3 + k * 5, y - 2, B5[0]); }
  } else if (kind === 'jars') {
    for (let k = 0; k < 3; k++) { const J = R5([P.clay[3], P.teal[4], P.sand[3]][k]); p.rect(x + k * 4, y - 5, 3, 5, J[2]); p.set(x + k * 4, y - 5, J[4]); p.rect(x + k * 4, y - 6, 3, 1, J[0]); p.rect(x + k * 4 + 2, y - 4, 1, 4, J[1]); }
  } else if (kind === 'cloth') {
    for (let k = 0; k < 3; k++) { const c = R5([P.plum[4], P.teal[3], P.gold[3], P.green[3]][Math.floor(r() * 4)]); p.rect(x, y - 3 - k * 2, 11 - k, 2, c[2]); p.rect(x, y - 3 - k * 2, 11 - k, 1, c[3]); p.set(x + 10 - k, y - 2 - k * 2, c[0]); }
  } else {
    const F = P.steel;
    for (let k = 0; k < 3; k++) { p.ellipse(x + 3 + k * 3, y - 1 - (k % 2), 3, 1.2, F[4]); p.set(x + 1 + k * 3, y - 1 - (k % 2), F[6]); p.set(x + 6 + k * 3, y - 1 - (k % 2), F[2]); }
  }
}
export function stallSprite(cloth, seed = 0) {
  return memo('stall' + cloth + seed, () => {
    const W = ap(30), H = ap(26);
    const p = mk(W, H), e = mk(W, H);
    const CR = R5(cloth), CW = R5('#e2cfae'), r = srand(seed + 5), yb = H - 1;
    const px0 = ap(2), px1 = W - ap(2) - 2, awY = ap(1) + 1, AH = ap(6), ctop = ap(15);
    // shadowed back of the booth with a shelf of wares
    p.rect(px0 + 2, awY + AH, px1 - px0 - 2, ctop - awY - AH, '#2e1e28');
    p.rect(px0 + 2, awY + AH + ap(4), px1 - px0 - 2, 2, WOOD[2]); p.rect(px0 + 2, awY + AH + ap(4), px1 - px0 - 2, 1, WOOD[4]);
    for (let x = px0 + 4; x < px1 - 4; x += 5) { const J = R5([P.clay[3], P.teal[4], P.sand[3], P.lavender[3]][Math.floor(r() * 4)]); p.rect(x, awY + AH + ap(4) - 4, 3, 4, J[2]); p.set(x, awY + AH + ap(4) - 4, J[4]); p.rect(x + 2, awY + AH + ap(4) - 3, 1, 3, J[1]); }
    for (const x of [px0, px1]) { p.rect(x, awY + 2, 2, yb - awY - 3, WOOD[1]); p.rect(x, awY + 2, 1, yb - awY - 3, WOOD[3]); }
    // counter: top board, plank front with a hanging cloth, dark base
    p.rect(ap(1), ctop, W - 2 * ap(1), 1, WOOD[5]); p.rect(ap(1), ctop + 1, W - 2 * ap(1), 1, WOOD[4]); p.rect(ap(1), ctop + 2, W - 2 * ap(1), 1, WOOD[1]);
    fillWall(p, ap(2), ctop + 3, W - 2 * ap(2), yb - ctop - 4, P.wood[3], 'plank', seed);
    p.rect(ap(2), yb - 1, W - 2 * ap(2), 2, WOOD[0]);
    const dw = Math.round(W * 0.5), dx0 = (W - dw) >> 1;
    for (let j = 0; j < ap(6); j++) for (let i = 0; i < dw; i++) {
      if (j === ap(6) - 1 && i % 2) continue;
      // folds: 2-3 px wide bands, lit and shadowed
      const f = Math.floor(i / 3) % 3;
      let k = f === 0 ? 3 : f === 2 ? 1 : 2;
      if (j === 0) k = 4; else if (j >= ap(6) - 2) k = Math.max(0, k - 1);
      p.set(dx0 + i, ctop + 3 + j, CR[k]);
    }
    // wares on the counter
    const kinds = ['fruit', 'bread', 'jars', 'cloth', 'fish'];
    for (let x = ap(3), k = 0; x < W - ap(9); x += 13, k++) goods(p, x, ctop - 1, kinds[(seed + k + Math.floor(r() * 2)) % kinds.length], r);
    // striped awning with a scalloped valance, three flat bands
    const SW = ap(3);
    for (let y = 0; y <= AH; y++) for (let x = 0; x < W - 2; x++) {
      const st = Math.floor(x / SW) % 2, sx = x % SW;
      if (y === AH && (sx === 0 || sx === SW - 1)) continue;
      const R = st ? CR : CW;
      let k = y === 0 ? 4 : y >= AH - 1 ? 1 : y > AH * 0.55 ? 2 : 3;
      if (sx === SW - 1 && y < AH - 1) k = Math.max(1, k - 1);
      p.set(1 + x, awY + y, R[k]);
    }
    for (let j = 1; j <= 2; j++) for (let x = px0 + 2; x < px1; x++) shadeAt(p, x, awY + AH + j, 0.62);
    return done(p, e);
  });
}
// braziers: iron bowl on legs; flames are drawn live by the structure (animated). The coals sit
// in stepped ember rings, hottest in the middle.
export function brazierSprite(big = 1) {
  return memo('brazier' + big, () => {
    const s = big * ART;
    const p = mk(Math.round(14 * s) + 6, Math.round(16 * s) + 6);
    const cx = p.w / 2, yb = p.h - 1;
    const I = IRON;
    const by = yb - 8 * s, lw = Math.max(1, Math.round(0.8 * s));
    for (const dx of [0, -3, 3]) {
      p.line(cx + dx * s, yb - 1, cx + dx * s * 0.6, by + 1, dx === 0 ? I[0] : I[1], lw);
      if (dx) { p.rect(Math.round(cx + dx * s) - 1, yb - 1, 3, 2, I[1]); p.set(Math.round(cx + dx * s) - 1, yb - 1, I[3]); }
    }
    p.line(cx - 2.2 * s, yb - 3.6 * s, cx + 2.2 * s, yb - 3.6 * s, I[1]);
    // bowl
    for (let y = Math.floor(by); y <= by + 3 * s; y++) for (let x = Math.floor(cx - 5.6 * s); x <= cx + 5.6 * s; x++) {
      const nx = (x + 0.5 - cx) / (5.6 * s), ny = (y + 0.5 - by) / (3 * s);
      if (nx * nx + ny * ny > 1 || ny < 0) continue;
      let col = I[nx < -0.45 ? 3 : nx < 0.15 ? 2 : nx < 0.6 ? 1 : 0];
      if (y === Math.round(by + 1.3 * s)) col = (x % 3 === 0) ? I[4] : I[0];
      p.set(x, y, col);
    }
    p.ellipse(cx, by, 5.6 * s, 1.8 * s, I[2]);
    for (let x = Math.floor(cx - 5.6 * s); x <= cx + 5.6 * s; x++) for (let y = Math.floor(by - 1.8 * s); y < by; y++) if (p.a(x, y)) p.set(x, y, I[3]);
    // glowing coals: concentric ember bands with a few dark clinkers
    const e = new Pix(p.w, p.h); e.ox = p.ox; e.oy = p.oy;
    const E = P.ember;
    for (let y = Math.floor(by - 1.3 * s); y <= by + 1.2 * s; y++) for (let x = Math.floor(cx - 4.6 * s); x <= cx + 4.6 * s; x++) {
      const nx = (x + 0.5 - cx) / (4.6 * s), ny = (y + 0.5 - (by - 0.3 * s)) / (1.25 * s);
      const d = nx * nx + ny * ny;
      if (d > 1) continue;
      const clinker = vnoise(x, y, 7, 2.2) > 0.72;
      const k = clinker ? 1 : d > 0.62 ? 2 : d > 0.25 ? 3 : 4;
      p.set(x, y, E[k]);
      if (!clinker) e.set(x, y, E[k + 1]);
    }
    return done(p, e, { fireAt: [0, -Math.round(9 * s)] });
  });
}
export function lampSprite(color = P.ember[4]) {
  return memo('lamp' + color, () => {
    const W = ap(9) | 1, H = ap(40);
    const p = mk(W, H), e = mk(W, H);
    const cx = W >> 1, yb = H - 1, L = R5(color), S = R5(P.stone[3]);
    // post: 3 px, lit left; stone foot
    p.rect(cx - 1, ap(9), 3, yb - ap(9) - 2, WOOD[1]); p.rect(cx - 1, ap(9), 1, yb - ap(9) - 2, WOOD[3]); p.rect(cx + 1, ap(9), 1, yb - ap(9) - 2, WOOD[0]);
    p.rect(cx - 3, yb - 3, 7, 4, S[1]); p.rect(cx - 3, yb - 3, 7, 1, S[3]); p.rect(cx - 2, yb - 5, 5, 2, S[2]); p.rect(cx - 2, yb - 5, 5, 1, S[4]);
    // lantern: cap, glass cage, base
    const ly = ap(2) + 1, lh = ap(5);
    p.poly([[cx - 4.5, ly], [cx + 5.5, ly], [cx + 3.5, ly - 3], [cx - 2.5, ly - 3]], IRON[1]); p.rect(cx - 2, ly - 3, 4, 1, IRON[3]);
    p.rect(cx, ly - 5, 1, 2, IRON[1]); p.set(cx, ly - 6, GOLD[4]);
    p.rect(cx - 3, ly, 7, lh + 2, IRON[1]);
    p.rect(cx - 2, ly + 1, 5, lh, L[2]); e.rect(cx - 2, ly + 1, 5, lh, L[3]);
    p.rect(cx - 2, ly + 1, 5, 1, L[1]); e.rect(cx - 2, ly + 1, 5, 1, L[2]);
    for (let j = 0; j < lh; j++) { p.set(cx, ly + 1 + j, IRON[2]); e.clear(cx, ly + 1 + j); }
    p.set(cx - 1, ly + 3, L[4]); e.set(cx - 1, ly + 3, L[4]); e.set(cx + 1, ly + 3, L[4]); e.set(cx - 1, ly + 4, L[4]);
    p.rect(cx - 3, ly + lh + 1, 7, 1, IRON[3]); p.rect(cx - 2, ly + lh + 2, 5, 1, IRON[1]);
    return done(p, e, { lightAt: [0, -(yb - ly - 3)] });
  });
}
// Fountain: a round stone basin (block wall + rim), rippling water, a column with a bowl and
// falling water arcs. basinAt is the rim centre relative to the pivot (front-bottom of the basin).
export function fountainSprite(r = 3, stone = '#d2c4a6', frame = 0) {
  return memo('fountain' + r + stone + frame, () => {
    const R = Math.round(r * PPU), ry = Math.round(R * 0.48), hw = ap(5), RW = ap(3);
    const colH = ap(22), n = R * 2 + ap(8);
    const p = mk(n, ry * 2 + hw + colH + ap(14)), e = mk(p.w, p.h);
    const cx = p.w / 2, yb = p.h - 1, cy = yb - ry - hw;
    const S5 = R5(stone), S = [S5[0], S5[1], S5[2], S5[3]];
    const Wt = P.water.map((c) => C(c));
    // outer wall
    for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
      const nx = (x + 0.5 - cx) / R; if (Math.abs(nx) > 1) continue;
      const yf = cy + ry * Math.sqrt(1 - nx * nx);
      const seg = Math.floor((Math.asin(nx) / Math.PI + 0.5) * 12), segL = Math.floor((Math.asin(clamp((x - 0.5 - cx) / R, -1, 1)) / Math.PI + 0.5) * 12);
      for (let y = Math.floor(cy); y <= yf + hw; y++) {
        const ly = y - yf;
        let k = nx < -0.5 ? 3 : nx < 0.2 ? 2 : nx < 0.7 ? 1 : 0;
        if (seg !== segL && ly > 0) k = Math.max(0, k - 1);
        if (Math.round(ly) === Math.round(hw / 2)) k = Math.max(0, k - 1);
        if (ly > hw - 1.5) k = 0;
        p.set(x, y, S5[k]);
      }
    }
    // rim ring + inner back wall
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - R - 1); x <= cx + R + 1; x++) {
      const nx = (x + 0.5 - cx) / R, ny = (y + 0.5 - cy) / ry;
      const d = nx * nx + ny * ny;
      if (d > 1) continue;
      const ix = (x + 0.5 - cx) / (R - RW), iy = (y + 0.5 - cy) / (ry - RW * 0.6);
      if (ix * ix + iy * iy <= 1) continue;
      const a = Math.atan2(ny, nx);
      let col = ny < 0 ? S[2] : S5[4];
      if (Math.abs((a / Math.PI) * 9 - Math.round((a / Math.PI) * 9)) < 0.08) col = S[1];
      if (d > 0.9 && ny > 0) col = S[2];
      p.set(x, y, col);
    }
    // water: inner back wall in shade, then the surface in flat teal-blue bands with ripples
    const wr = R - RW, wry = ry - RW * 0.6;
    for (let y = Math.floor(cy - wry); y <= cy + wry; y++) for (let x = Math.floor(cx - wr); x <= cx + wr; x++) {
      const nx = (x + 0.5 - cx) / wr, ny = (y + 0.5 - cy) / wry;
      const d = nx * nx + ny * ny;
      if (d > 1) continue;
      const wy = (y + 0.5 - cy - 2) / (wry - 2);
      let col;
      if (nx * nx + wy * wy > 1) col = S[0];
      else col = d < 0.35 ? Wt[3] : d > 0.8 ? Wt[5] : Wt[4];
      p.set(x, y, col);
    }
    const isWater = (c) => c && c[2] > c[0] + 20;
    for (let k = 0; k < 3; k++) {
      const rr = ((k * 0.33 + frame * 0.083) % 1) * 0.85 + 0.15;
      for (let a = 0; a < Math.PI * 2; a += 0.09) {
        if (Math.sin(a * 5 + k * 2 + frame) < -0.3) continue;
        const x = Math.round(cx + Math.cos(a) * (wr - 2) * rr), y = Math.round(cy + 2 + Math.sin(a) * (wry - 3) * rr);
        if (isWater(p.get(x, y))) p.set(x, y, rr > 0.7 ? Wt[5] : Wt[6]);
      }
    }
    for (let k = 0; k < 8; k++) { const a = hash2(k, frame, 3) * 6.283, d = 0.3 + hash2(k, frame, 4) * 0.6; const x = Math.round(cx + Math.cos(a) * wr * d), y = Math.round(cy + 2 + Math.sin(a) * (wry - 3) * d); if (isWater(p.get(x, y)) && isWater(p.get(x + 1, y))) { p.set(x, y, P.frost[5]); p.set(x + 1, y, Wt[6]); } }
    // column, bowl and spout
    const ct = Math.round(cy) - colH, CW = ap(4) + 1, cl = Math.round(cx) - (CW >> 1);
    for (let y = ct; y <= cy + 1; y++) for (let i = 0; i < CW; i++) p.set(cl + i, y, S[i === 0 ? 3 : i < CW * 0.5 ? 2 : i < CW - 1 ? 1 : 0]);
    p.rect(cl - 1, Math.round(cy) - 2, CW + 2, 3, S[2]); p.rect(cl - 1, Math.round(cy) - 2, CW + 2, 1, S[3]);
    const bry = ap(2), brx = ap(6);
    p.ellipse(cx, ct + 1, brx, bry + 1, S[0]); p.ellipse(cx, ct, brx, bry, S[3]); p.ellipse(cx, ct, brx - 2, bry - 1, Wt[5]);
    const st = ct - ap(4);
    p.rect(Math.round(cx) - 1, st, 3, ct - st, S[2]); p.rect(Math.round(cx) - 1, st, 1, ct - st, S[3]); p.disc(Math.round(cx) + 0.5, st, 2, S[3]);
    // water: a short jet, then arcs falling from the bowl into the basin
    const wc = C(P.frost[5]), wd = C(P.frost[4]), we = C(P.frost[3]);
    for (let k = 1; k <= ap(3); k++) if ((k + frame) % 3) { p.set(Math.round(cx), st - k, wc); e.set(Math.round(cx), st - k, we); }
    for (const sd of [-1, 1]) for (let k = 0; k <= 14; k++) {
      const t = k / 14, x = cx + sd * (brx - 1 + t * ap(9)), y = ct + 1 + t * t * (cy - ct + 2);
      if ((k + frame) % 4 === 0) continue;
      p.set(x, y, wc); p.set(x + sd, y + 1, wd); e.set(x, y, we);
      if (k === 14) { p.set(x - 1, y - 1, wc); p.set(x + 1, y - 1, wc); }
    }
    return done(p, e, { basinAt: [0, Math.round(cy) - yb] });
  });
}
export function bannerSprite(color, h = 7, frame = 0) {
  return memo('banner' + color + h + frame, () => {
    const H = Math.round(h * PPU * 0.75);
    const p = mk(ap(18), H + ap(4));
    const R = R5(color), Rm = [R[0], R[1], R[2], R[3]];
    const px = ap(4) - 1, y0 = ap(2) + 1, gold = GOLD[4];
    p.rect(px, y0, 2, H, WOOD[1]); p.rect(px, y0, 1, H, WOOD[3]);
    p.disc(px + 1, y0 - 1, 1.8, GOLD[3]); p.set(px, y0 - 2, GOLD[5]);
    const cw = ap(10), cl = px + 3, by = y0 + ap(2);
    p.rect(px + 2, by, cw + 3, 2, WOOD[2]); p.rect(px + 2, by, cw + 3, 1, WOOD[4]); p.set(px + cw + 4, by, gold); p.set(px + cw + 4, by + 1, GOLD[3]);
    const ch = Math.max(ap(7), Math.round(H * 0.5));
    const sway = (j) => Math.round(Math.sin(j * 0.22 + frame * 2) * 1.4 * (j / ch));
    for (let j = 0; j < ch; j++) {
      const y = by + 2 + j, sw = sway(j);
      for (let i = 0; i < cw; i++) {
        if (j > ch - ap(4) && Math.abs(i + 0.5 - cw / 2) < (j - (ch - ap(4))) * 0.9) continue;
        const fold = Math.sin(i * 0.72 + frame * 1.3 + j * 0.05);
        let idx = fold > 0.45 ? 3 : fold > -0.2 ? 2 : fold > -0.7 ? 1 : 0;
        if (i === 0) idx = Math.min(3, idx + 1); else if (i === cw - 1) idx = Math.max(0, idx - 1);
        let col = Rm[idx];
        if (j === 0 || j === 1) col = j ? GOLD[3] : GOLD[4];
        p.set(cl + i + sw, y, col);
      }
    }
    // emblem: a gold lozenge with a dark heart
    const ey = by + 2 + ap(4) + 2, ex = cl + (cw >> 1);
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const m = Math.abs(dx) + Math.abs(dy);
      if (m > 3) continue;
      p.set(ex + dx + sway(ey + dy - by - 2), ey + dy, m <= 1 ? R[0] : dx + dy < 0 ? GOLD[5] : GOLD[4]);
    }
    return done(p, null);
  });
}
// battlement merlons along a wall top
function merlons(p, x0, w, y, color, snow) {
  const R = R5(color), mw = ap(3), mh = ap(3);
  for (let x = x0 + ap(1); x + mw <= x0 + w; x += ap(6)) for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) {
    let k = j < 2 ? (j ? 3 : 4) : 2;
    if (i === mw - 1) k = 1; else if (i === 0 && k < 4) k++;
    let col = R[k];
    if (snow && j === 0) col = SNOW[3];
    p.set(x + i, y + j, col);
  }
}
// curtain wall segment (width in px) / round tower
export function wallSprite(wpx, color, h = 4.2, seed = 0, snow = false) {
  return memo('wall' + wpx + color + h + seed + snow, () => {
    const H = Math.round(h * PPU * 0.8), T = ap(9), R = R5(color);
    const p = mk(wpx + 2, H + T + ap(4));
    const x0 = 1, yb = p.h - 1;
    fillWall(p, x0, yb - H + 1, wpx, H, color, 'block', seed);
    fillWall(p, x0, yb - H - T + 1, wpx, T, R[3], 'block', seed + 3);
    p.rect(x0, yb - H - T + 1, wpx, 1, R[1]);
    p.rect(x0, yb - H + 1, wpx, 1, R[4]);
    merlons(p, x0, wpx, yb - H - T - 2, light(color, 1.05), snow);
    if (snow) for (let x = x0; x < x0 + wpx; x++) if (hash2(x >> 2, 1, seed) < 0.7) { p.set(x, yb - H - T + 2, SNOW[3]); p.set(x, yb - H + 1, SNOW[2]); }
    return done(p, null);
  });
}
export function towerSprite(r, h, color, roof, seed = 0, flat = false) {
  return memo('tower' + r + h + color + roof + flat, () => {
    const R = Math.round(r * PPU), H = Math.round(h * PPU * 0.75);
    const p = mk(R * 2 + ap(6), H + R + ap(26)), e = mk(p.w, p.h);
    const cx = p.w / 2, yb = p.h - 1, R5c = R5(color);
    const blk = (u) => (Math.asin(clamp(u, -1, 1)) / Math.PI + 0.5) * 9;
    for (let y = yb - H; y <= yb; y++) for (let x = Math.round(cx - R); x < cx + R; x++) {
      const u = (x + 0.5 - cx) / R, sh = -u * 0.55 + 0.15;
      const ly = yb - y, row = Math.floor(ly / KR), ry = ly % KR;
      // four flat bands across the drum: lit left, base, shadow, deep right edge
      let k = sh > 0.36 ? 3 : sh > 0 ? 2 : sh > -0.32 ? 1 : 0;
      const off = (row % 2) * 0.5;
      const b = Math.floor(blk(u) + off), bl = Math.floor(blk((x - 0.5 - cx) / R) + off);
      if (k >= 1 && k <= 2 && hash2(b, row, seed + 3) < 0.18) k--;
      if (ry === 0 || b !== bl) k = Math.max(0, k - 1); else if (ry === KR - 1 && k < 3) k++;
      if (ly < ap(3)) k = Math.max(0, k - 1);
      p.set(x, y, R5c[k]);
    }
    // corbel band under the top
    const ty = yb - H;
    for (let x = Math.round(cx - R); x < cx + R; x++) for (let j = 1; j <= 2; j++) { const on = Math.floor((x - cx + 64) / 3) % 2; if (on) shadeAt(p, x, ty + j, 0.66); }
    windowAt(p, e, Math.round(cx) - 1, yb - Math.round(H * 0.6), 3, ap(4) + 1, dark(color, 0.6), { arch: true });
    windowAt(p, e, Math.round(cx - R * 0.5) - 1, yb - Math.round(H * 0.32), 2, ap(3), dark(color, 0.6), { arch: true });
    if (flat) {
      // walk-top behind a ring of merlons
      const ery = R * 0.45;
      p.ellipse(cx, ty, R + 1, ery + 1, R5c[4]);
      p.ellipse(cx, ty, R - 2, ery - 1.5, R5c[1]);
      p.ellipse(cx, ty + 1, R - 3, ery - 2.5, R5c[2]);
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2, mx = Math.round(cx + Math.cos(a) * R) - 1, my = Math.round(ty + Math.sin(a) * ery);
        const mc = Math.sin(a) > 0 ? R5c[3] : R5c[2];
        p.rect(mx, my - 3, 3, 4, mc); p.rect(mx, my - 3, 3, 1, R5c[4]); p.set(mx + 2, my, R5c[1]);
      }
    } else {
      // conical tiled roof with an eave and a pennant
      const RC = R5(roof), tip = ty - R - ap(14), RT = ap(2) + 1;
      for (let y = tip; y <= ty + ap(2); y++) {
        const t = (y - tip) / (ty + ap(2) - tip), half = (R + ap(2)) * t;
        for (let x = Math.floor(cx - half); x <= cx + half; x++) {
          const u = (x + 0.5 - cx) / Math.max(1, half);
          let k = u < -0.45 ? 3 : u < 0.1 ? 2 : u < 0.55 ? 1 : 0;
          const ly = ty + ap(2) - y;
          if (ly % RT === 0) k = Math.max(0, k - 1);
          else if (ly % RT === RT - 1 && k < 3) k++;
          if (y >= ty + ap(2) - 1) k = 0;
          p.set(x, y, RC[k]);
        }
      }
      p.rect(Math.round(cx), tip - ap(4), 1, ap(4), IRON[1]); p.set(Math.round(cx), tip - ap(4) - 1, GOLD[4]);
      p.poly([[cx + 1, tip - ap(4)], [cx + ap(5), tip - ap(3)], [cx + 1, tip - ap(2)]], P.red[3]);
    }
    void seed;
    return done(p, e);
  });
}
export function pierSprite(len, wid) {
  return memo('pier' + len + wid, () => {
    const p = mk(wid, len); p.oy = len - 1;
    const BH = ap(3), R = R5(P.wood[3]);
    for (let y = 0; y < len; y++) for (let x = 0; x < wid; x++) {
      const row = Math.floor(y / BH), ry = y % BH;
      let col;
      if (ry === BH - 1) col = C(INK_SOFT);
      else {
        let k = hash2(row, 1, 4) < 0.3 ? 1 : 2;
        if (ry === 0) k++;
        col = R[k];
        if (ry === 1 && (x === 2 || x === wid - 3)) col = IRON[1];
      }
      if (x < 2 || x >= wid - 2) col = x === 0 ? R[3] : R[0];
      p.set(x, y, col);
    }
    return done(p, null);
  });
}
export function boatSprite(color = P.wood[2], sail = '#e2d4b4') {
  return memo('boat' + color + sail, () => {
    const W = ap(46), H = ap(70);
    const p = mk(W, H);
    const Rc = R5(color), cx = W >> 1, yb = H - 1;
    // rigging behind the sail
    const mt = yb - ap(66);
    p.line(cx + 1, mt + 2, cx - ap(18), yb - ap(15), INK_SOFT); p.line(cx + 1, mt + 2, cx + ap(17), yb - ap(15), INK_SOFT);
    // hull
    const hy = yb - ap(12), hrx = ap(19), hry = ap(8);
    p.ellipse(cx, yb - ap(10), ap(20), ap(9), Rc[0]);
    p.ellipse(cx, hy, hrx, hry, Rc[1]);
    for (let k = 1; k <= 3; k++) for (let x = cx - hrx; x <= cx + hrx; x++) {
      const nx = (x + 0.5 - cx) / hrx; if (Math.abs(nx) > 0.98) continue;
      const y = Math.round(hy + Math.sqrt(1 - nx * nx) * (hry - 1) + k * 2 - 1);
      if (p.a(x, y)) p.set(x, y, Rc[0]);
    }
    p.ellipse(cx, hy - 1, ap(16), ap(5.5), Rc[3]);
    p.ellipse(cx, hy - 1, ap(15), ap(4.5), Rc[2]);
    for (let x = cx - ap(14); x < cx + ap(14); x += 4) for (let y = hy - ap(4); y <= hy + ap(3); y++) if (p.get(x, y)?.[0] === Rc[2][0]) p.set(x, y, Rc[1]);
    for (const tx of [-ap(8), ap(6)]) { p.rect(cx + tx - 1, hy - ap(4) + 1, 3, ap(8) - 1, Rc[1]); p.rect(cx + tx - 1, hy - ap(4) + 1, 1, ap(8) - 1, Rc[3]); }
    // mast + boom
    p.rect(cx, mt, 3, hy - mt, WOOD[1]); p.rect(cx, mt, 1, hy - mt, WOOD[3]);
    p.rect(cx + 2, yb - ap(26), ap(14), 2, WOOD[2]);
    // sail with seams and a soft billow
    const S5 = R5(sail), S4 = [S5[1], mixc(S5[1], S5[2], 0.5), S5[2], S5[3]];
    const sy0 = yb - ap(62), sy1 = yb - ap(26);
    for (let y = sy0; y < sy1; y++) {
      const t = (y - sy0) / (sy1 - sy0), half = ap(4) + t * ap(12), bil = Math.sin(t * Math.PI) * 2;
      for (let x = Math.round(cx + 3); x < cx + 3 + half + bil; x++) {
        const u = (x - cx - 3) / (half + bil);
        let k = u < 0.25 ? 3 : u < 0.65 ? 2 : u < 0.88 ? 1 : 0;
        if ((y - sy0) % ap(4) === 0) k = Math.max(0, k - 1);
        p.set(x, y, S4[k]);
      }
    }
    p.rect(cx + ap(6), sy0 + ap(14), 4, 3, S5[1]);
    p.poly([[cx + 1, mt], [cx + ap(6), mt + 2], [cx + 1, mt + 4]], P.red[3]);
    return done(p, null);
  });
}

// ------------------------------------------------------------------ site pieces
const GLYPH = [['010', '111', '010', '101', '010'], ['110', '011', '010', '110', '011'], ['111', '100', '111', '001', '111'], ['101', '111', '101', '010', '010'], ['011', '010', '111', '010', '110']];
// moss clumps (2-4 px clusters) over the opaque pixels of a sprite: o = { n, x0, y0, w, h, seed }
function mossClumps(p, x0, y0, w, h, n, seed, ramp = P.moss) {
  const M = ramp.map((c) => C(c));
  for (let k = 0; k < n; k++) {
    const x = Math.floor(x0 + hash2(k, 1, seed) * w), y = Math.floor(y0 + hash2(k, 2, seed) * h), s = 1 + Math.floor(hash2(k, 3, seed) * 2);
    for (let j = 0; j <= s; j++) for (let i = 0; i <= s + 1; i++) if (p.a(x + i, y + j) && (i + j) < s + 2) p.set(x + i, y + j, j === 0 ? M[3] : i === s + 1 ? M[1] : M[2]);
  }
}
export function waystoneSprite(active) {
  return memo('waystone' + active, () => {
    const W = ap(26), H = ap(64);
    const p = mk(W, H), e = mk(W, H);
    const cx = W >> 1, yb = H - 1;
    const SR5 = R5(P.stone[2]), SR = [SR5[0], SR5[1], SR5[2], SR5[3]], PL = R5(P.stone[3]);
    // plinth: two round steps of fitted stone
    p.ellipse(cx, yb - ap(3), ap(12), ap(4), PL[0]);
    p.ellipse(cx, yb - ap(4), ap(12), ap(3.6), PL[2]);
    p.ellipse(cx, yb - ap(5), ap(9), ap(2.6), PL[1]);
    p.ellipse(cx, yb - ap(5.6), ap(9), ap(2.2), PL[3]);
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; const x = Math.round(cx + Math.cos(a) * ap(10.5)), y = Math.round(yb - ap(4) + Math.sin(a) * ap(3.1)); if (Math.sin(a) > -0.2) p.set(x, y, PL[0]); }
    // obelisk: two visible faces split by a lit arris
    const sTop = yb - ap(46), sBot = yb - ap(5);
    for (let y = sTop; y <= sBot; y++) {
      const t = (y - sTop) / (sBot - sTop), half = ap(3) + t * ap(2.5);
      for (let x = Math.round(cx - half); x <= cx + half; x++) {
        const u = (x + 0.5 - cx) / half;
        const col = u < -0.7 ? SR[3] : u < -0.05 ? SR[2] : u < 0.12 ? SR5[4] : u < 0.75 ? SR[1] : SR[0];
        p.set(x, y, col);
      }
    }
    mossClumps(p, cx - ap(6), sBot - ap(7), ap(12), ap(6), 6, 3);
    p.poly([[cx - ap(3) - 0.5, sTop + 1], [cx + 0.5, sTop - ap(8)], [cx + ap(3) + 1.5, sTop + 1]], SR[1]);
    p.poly([[cx - ap(3) - 0.5, sTop + 1], [cx + 0.5, sTop - ap(8)], [cx + 0.5, sTop + 1]], SR[3]);
    // runes: carved dark when dormant, aether violet with a pink-white core once attuned
    const A = P.aether;
    for (let k = 0; k < 5; k++) {
      const g = GLYPH[k], gy = yb - ap(41) + k * ap(7), gx = cx - 1;
      for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j][i] === '1') {
        p.set(gx + i - 1, gy + j, active ? A[3] : SR[0]);
        if (active) e.set(gx + i - 1, gy + j, j === 0 || i === 0 ? A[5] : A[4]);
        else if (g[j + 1]?.[i] !== '1') p.set(gx + i - 1, gy + j + 1, SR[3]);
      }
    }
    // a crack
    for (let k = 0, x = cx + 2, y = sTop + ap(10); k < ap(6); k++) { p.set(x, y, SR[0]); y++; if (k % 2) x++; }
    return done(p, e, { crystalAt: [0, -ap(60)] });
  });
}
export function crystalSprite(color, h = 10) {
  return memo('cryst' + color + h, () => {
    const w = Math.max(9, Math.round(h * 0.72)) | 1;
    const p = mk(w + 2, h + 2), R = R5(color);
    const cx = (w + 2) / 2, ym = h * 0.42 + 1, T = [cx, 1], Rt = [w + 0.6, ym], Bt = [cx, h + 1], L = [1.4, ym], M = [cx - 0.5, ym];
    p.poly([T, Rt, M], R[2]);
    p.poly([T, M, L], R[4]);
    p.poly([L, M, Bt], R[1]);
    p.poly([M, Rt, Bt], R[0]);
    p.line(cx - 1, 3, cx - 1, ym, CREAM_HI);
    p.set(Math.round(cx - 2), Math.round(ym - 1), CREAM_HI);
    p.line(Math.round(cx), Math.round(ym + 1), Math.round(cx), h - 1, R[3]);
    p.outline(C(INK));
    return { pix: p, emis: p };
  });
}
// dungeon mouths by theme
export function entranceSprite(theme, biome, glowC) {
  return memo('ent' + theme + biome, () => {
    const r = srand(theme.length * 97 + 5);
    const W = ap(110), H = ap(96);
    const p = mk(W, H), e = mk(W, H);
    const cx = W >> 1, yb = H - 1;
    const masonry = ['cursed_crypt', 'marble_vault', 'frozen_citadel', 'dwarven_deephall'];
    let doorW = ap(26), doorH = ap(32), doorY = yb - ap(4);
    let rim = null, rimW = 0, inner = 'stairs';
    // wall torch: iron cup on a bracket, a stepped flame in the theme's light (ember by default)
    const FL = R5(glowC);
    const torch = (x, y) => {
      p.rect(x - 1, y, 3, ap(5), IRON[1]); p.rect(x - 1, y, 1, ap(5), IRON[3]); p.rect(x - 2, y - 1, 5, 2, IRON[0]);
      for (let j = 0; j < ap(4); j++) for (let i = -2; i <= 2; i++) {
        if (Math.abs(i) > 2 - j * 0.5) continue;
        const col = j < 2 && Math.abs(i) < 2 ? FL[4] : Math.abs(i) >= 2 - j * 0.5 - 0.5 ? FL[1] : FL[2];
        p.set(x + i, y - 2 - j, col); e.set(x + i, y - 2 - j, col);
      }
    };
    if (masonry.includes(theme)) {
      const wallC = theme === 'marble_vault' ? '#d2c2a2' : theme === 'frozen_citadel' ? '#8e98b8' : theme === 'dwarven_deephall' ? '#6a5a5c' : '#5a5266';
      const roofC = theme === 'marble_vault' ? P.gold[3] : theme === 'frozen_citadel' ? P.slate[2] : '#2f2c3a';
      const WR = R5(wallC);
      // facade
      const fx = cx - ap(34), fw = ap(68), ft = yb - ap(62);
      fillWall(p, fx, ft, fw, yb - ap(8) - ft, wallC, theme === 'marble_vault' ? 'marble' : 'block', 3);
      p.rect(fx, yb - ap(8) - 2, fw, 2, WR[1]); p.rect(fx, yb - ap(8) - 2, fw, 1, WR[3]);
      // pyramid roof in flat bands: lit left slope, shaded right slope, tile courses
      const rt = yb - ap(82), rbm = yb - ap(62), RC = R5(roofC);
      for (let y = rt; y <= rbm; y++) {
        const t = (y - rt) / (rbm - rt), half = ap(4) + t * ap(34);
        for (let x = Math.floor(cx - half); x <= cx + half; x++) {
          const u = (x + 0.5 - cx) / half;
          let k = u < 0 ? 3 : 2;
          if ((rbm - y) % 3 === 0) k--;
          if (Math.abs(u) > 1 - 1.6 / half) k = 1;
          if (Math.abs(x + 0.5 - cx) < 0.6) k = u < 0 ? 4 : 1;
          p.set(x, y, RC[k]);
        }
      }
      p.rect(Math.round(cx), rt - ap(3), 1, ap(3), theme === 'marble_vault' ? GOLD[4] : IRON[1]);
      // cornice with dentils
      const cy0 = yb - ap(63);
      p.rect(cx - ap(36), cy0, ap(72), ap(3), WR[3]); p.rect(cx - ap(36), cy0, ap(72), 1, WR[4]);
      for (let x = cx - ap(36) + 1; x < cx + ap(36); x += 3) p.set(x, cy0 + 3, WR[0]);
      p.rect(cx - ap(36), cy0 + ap(3), ap(72), 1, WR[1]);
      for (const sx of [-1, 1]) column(p, cx + sx * ap(24) - ap(2.5), yb - ap(8), ap(52), ap(5), light(wallC, 1.1));
      // steps (back first so the lower, wider ones sit in front)
      for (let i = 2; i >= 0; i--) {
        const sw = ap(44) - i * ap(4), sx = cx - (sw >> 1), sy = yb - 3 - i * 3 - 2;
        for (let j = 0; j < 5; j++) for (let x = sx; x < sx + sw; x++) {
          let col = j < 2 ? (j ? WR[3] : WR[4]) : j === 4 ? WR[0] : WR[1];
          if (j >= 2 && (x - sx + i * 5) % ap(8) === 0) col = WR[0];
          p.set(x, sy + j, col);
        }
      }
      for (const sx of [-1, 1]) torch(cx + sx * ap(16), yb - ap(46));
      if (theme === 'cursed_crypt') {
        const sy = yb - ap(72), BN = R5(CREAM);
        p.disc(cx + 0.5, sy, ap(4), BN[2]); p.rect(cx - 3, sy + 3, 7, 3, BN[1]); p.disc(cx - 0.5, sy - 1, ap(2), BN[3]);
        p.rect(cx - 3, sy - 1, 2, 3, INK); p.rect(cx + 2, sy - 1, 2, 3, INK); p.set(cx, sy + 2, INK);
        for (let i = -2; i <= 2; i += 2) p.set(cx + i, sy + 5, BN[0]);
        for (let k = 0; k < 4; k++) { let x = fx + 4 + Math.floor(r() * (fw - 8)), y = ft + 4 + Math.floor(r() * 30); for (let s = 0; s < ap(6); s++) { p.set(x, y, WR[0]); y++; if (r() < 0.5) x += r() < 0.5 ? -1 : 1; } }
        mossClumps(p, fx, yb - ap(8) - ap(12), fw, ap(12), 18, 11);
      }
      if (theme === 'marble_vault') { const sy = yb - ap(72); p.disc(cx + 0.5, sy, ap(3.4), GOLD[4]); p.disc(cx + 0.5, sy, ap(2.2), GOLD[3]); p.set(cx - 1, sy - 2, GOLD[5]); for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; p.set(Math.round(cx + Math.cos(a) * ap(5)), Math.round(sy + Math.sin(a) * ap(5)), GOLD[4]); } }
      if (theme === 'dwarven_deephall') for (let x = cx - ap(30); x < cx + ap(30); x += 6) { const gl = GLYPH[Math.floor(hash2(x, 1, 3) * 5)]; for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) if (gl[j + 1][i] === '1') { p.set(x + i, yb - ap(62) + 3 + j, P.ember[3]); e.set(x + i, yb - ap(62) + 3 + j, P.ember[4]); } }
      if (theme === 'frozen_citadel') {
        for (let x = cx - ap(37); x < cx + ap(37); x++) if (hash2(x >> 2, 2, 9) < 0.85) { p.set(x, cy0 - 1, SNOW[2]); p.set(x, cy0, SNOW[3]); }
        for (let x = cx - ap(36); x < cx + ap(36); x++) if (hash2(x >> 1, 4, 9) < 0.3) { const L = 2 + Math.floor(hash2(x >> 1, 5, 9) * ap(4)) - (x & 1); for (let k = 0; k < L; k++) p.set(x, cy0 + ap(3) + 1 + k, k === L - 1 ? P.frost[5] : P.frost[4]); }
        for (let y = rt; y < rt + ap(9); y++) for (let x = cx - ap(20); x < cx + ap(20); x++) if (p.a(x, y) && vnoise(Math.floor(x / 3) * 3, 0, 3, ap(4)) < 1 - (y - rt) / ap(9)) p.set(x, y, (y - rt) > ap(6) ? SNOW[1] : SNOW[3]);
        for (let i = 0; i < 3; i++) p.rect(cx - ap(22) + i * ap(2), yb - 5 - i * 3, ap(44) - i * ap(4), 1, SNOW[3]);
      }
      doorW = ap(22); doorH = ap(34); doorY = yb - ap(9);
      rim = theme === 'marble_vault' ? GOLD[3] : light(wallC, 1.08); rimW = ap(2);
    } else if (theme === 'buried_colossus') {
      const sandC = P.clay[4], sand = ramp(sandC);
      stoneMass(p, cx, yb - ap(20), ap(50), ap(20), sandC, 11, { facet: ap(8), tilt: 0.25, bump: 0.12, cracks: 0, ramp: sand });
      // wind ripples: long 1-px highlight streaks
      for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (p.a(x, y) && Math.sin(x * 0.45 + y * 1.7 + Math.sin(x * 0.1) * 3) > 0.93) p.set(x, y, sand[3]);
      fillWall(p, cx - ap(20), yb - ap(58), ap(40), ap(44), P.clay[3], 'block', 7);
      const LT = R5(P.clay[4]);
      p.rect(cx - ap(22), yb - ap(60), ap(44), ap(3), LT[2]); p.rect(cx - ap(22), yb - ap(60), ap(44), 1, LT[4]); p.rect(cx - ap(22), yb - ap(60) + ap(3), ap(44), 1, LT[0]);
      for (const sx of [-1, 1]) column(p, cx + sx * ap(18) - ap(2.5), yb - ap(12), ap(48), ap(5), P.clay[4]);
      // giant fingers rising beside the door (knuckle creases, nails)
      for (let k = 0; k < 4; k++) {
        const fx = cx - ap(46) + k * ap(6), tx = fx - ap(2) + k * ap(1), ty = yb - ap(40) - k * ap(4);
        const FR = R5(k % 2 ? '#c08a72' : '#d09a80');
        p.taper(fx, yb - ap(10), tx, ty, ap(8), ap(6), FR[1]);
        p.taper(fx - 1, yb - ap(10), tx - 1, ty, ap(6), ap(4), FR[2]);
        p.taper(fx - 3, yb - ap(10), tx - 3, ty + 1, ap(2), ap(1.4), FR[3]);
        for (const t of [0.35, 0.68]) { const x = fx + (tx - fx) * t, y = yb - ap(10) + (ty - yb + ap(10)) * t; p.line(x - ap(3.4), y, x + ap(3.2), y - 1, FR[0]); p.line(x - ap(3.4), y - 1, x - 1, y - 2, FR[3]); }
        p.ellipse(tx, ty + 1, ap(2.4), ap(2.6), FR[3]); p.ellipse(tx - 0.5, ty + 0.5, ap(1.4), ap(1.6), FR[4]); p.set(Math.round(tx) - 1, Math.round(ty), CREAM_HI);
      }
      stoneMass(p, cx - ap(40), yb - ap(7), ap(16), ap(6), sandC, 12, { facet: ap(8), tilt: 0.2, bump: 0.1, cracks: 0, ramp: sand, flatBase: 0.6 });
      doorW = ap(22); doorH = ap(36); doorY = yb - ap(12);
      rim = C(P.clay[2]); rimW = ap(2);
    } else if (theme === 'sunken_temple') {
      const sc = '#6a8a86', TS = R5('#557572');
      fillWall(p, cx - ap(16), yb - ap(48), ap(32), ap(38), '#4e6c6a', 'block', 5);
      fillWall(p, cx - ap(40), yb - ap(10), ap(80), ap(8), '#4e6c6c', 'block', 2);
      p.rect(cx - ap(40), yb - ap(10), ap(80), 1, TS[3]);
      for (const sx of [-30, -10, 10, 30]) column(p, cx + ap(sx) - ap(2.5), yb - ap(10), ap(46), ap(5), sc);
      const rt = yb - ap(74), rbm = yb - ap(56);
      for (let y = rt; y <= rbm; y++) {
        const t = (y - rt) / (rbm - rt), half = ap(6) + t * ap(36);
        for (let x = Math.floor(cx - half); x <= cx + half; x++) {
          let k = (rbm - y) % 3 ? 2 : 1;
          if (x < cx && k === 2) k = 3;
          if (Math.abs(x + 0.5 - cx) > half - 1.5) k = 0;
          p.set(x, y, TS[k]);
        }
      }
      p.rect(cx - ap(43), rbm, ap(86), ap(2), TS[3]); p.rect(cx - ap(43), rbm + ap(2), ap(86), 1, TS[0]);
      // hanging weed, barnacle clumps, puddles
      const WD = P.teal;
      for (let k = 0; k < 18; k++) { const x = cx - ap(40) + Math.floor(r() * ap(80)); let y = rbm + ap(2) + 1; const L = 2 + Math.floor(r() * ap(10)); for (let s = 0; s < L && y < yb; s++, y++) if (p.a(x, y)) { p.set(x + (s % 4 === 3 ? 1 : 0), y, s % 2 ? WD[2] : WD[3]); } }
      mossClumps(p, cx - ap(40), yb - ap(56), ap(80), ap(46), 22, 7, P.teal);
      const WT = P.water;
      for (const sx of [-1, 1]) { p.ellipse(cx + sx * ap(30), yb - 2, ap(7), ap(1.6), WT[3]); p.rect(Math.round(cx + sx * ap(30)) - 3, yb - 3, 4, 1, WT[6]); }
      doorW = ap(20); doorH = ap(30); doorY = yb - ap(11);
      rim = TS[3]; rimW = ap(2);
    } else if (theme === 'living_labyrinth') {
      const hedgeC = P.moss[1], hedge = ramp(hedgeC);
      for (const i of [-3, 3, -2, 2, -1, 1, 0]) stoneMass(p, cx + i * ap(13), yb - ap(26) - Math.abs(i) * ap(2), ap(10), ap(26) + Math.abs(i) * ap(2), hedgeC, 40 + i, { leafy: true, facet: ap(4), bump: 0.1, lobes: 8, ramp: hedge, flatBase: 0.95 });
      stoneMass(p, cx, yb - ap(62), ap(48), ap(13), P.moss[2], 47, { leafy: true, facet: ap(4), bump: 0.07, lobes: 9 });
      // rose and lavender blooms, two-pixel clusters
      for (let k = 0; k < 26; k++) { const x = Math.floor(r() * W), y = Math.floor(r() * H), fc = r() < 0.5 ? P.rose[3] : P.lavender[4]; if (p.a(x, y) && p.a(x, y - 1) && p.a(x + 1, y)) { p.set(x, y, fc); p.set(x + 1, y, fc); p.set(x, y - 1, light(fc, 1.2)); } }
      const LB = R5(glowC);
      p.disc(cx + 0.5, yb - ap(64), ap(3), LB[2]); e.disc(cx + 0.5, yb - ap(64), ap(3), LB[3]);
      p.disc(cx + 0.5, yb - ap(64), ap(1.2), LB[4]); e.disc(cx + 0.5, yb - ap(64), ap(1.2), LB[4]);
      doorW = ap(22); doorH = ap(38); doorY = yb - ap(2);
      rim = C(P.grass[0]); rimW = ap(1.5); inner = 'deep';
    } else {
      // cave mouth in a rock outcrop
      const rc = { glass_cavern: '#3a2230', void_rift: '#2e2440', dragon_lair: '#4e2a26', fungal_warren: '#3e3040', pirate_cove: '#4e4b53', bandit_hideout: biome === 'wastes' ? '#8a5048' : '#5e5050', beast_den: biome === 'frost' ? '#6e7a9a' : '#5e5048' }[theme] || '#5e5050';
      const RC = ramp(light(rc, 1.15));
      stoneMass(p, cx, yb - ap(36), ap(50), ap(36), rc, 21, { facet: ap(10), tilt: 0.75, lobes: 7, ramp: RC, cracks: 6, flatBase: 0.95 });
      for (let k = 0; k < 5; k++) stoneMass(p, cx - ap(40) + k * ap(20), yb - ap(12), ap(12), ap(11), rc, 30 + k, { facet: ap(7), tilt: 0.7, ramp: ramp(rc), cracks: 1, flatBase: 0.95 });
      if (biome === 'frost' || biome === 'verdant') {
        const caps = biome === 'frost' ? [SNOW[3], SNOW[2], SNOW[1]] : [C(P.moss[4]), C(P.moss[3]), C(P.moss[1])];
        for (let x = 0; x < p.w; x++) for (let y = 0; y < p.h; y++) if (p.a(x, y) && !p.a(x, y - 1)) {
          const L = ap(2) + Math.floor(hash2(x >> 1, 3, 5) * ap(2.5));
          for (let k = 0; k < L; k++) if (p.a(x, y + k)) p.set(x, y + k, k === 0 ? caps[0] : k === L - 1 ? caps[2] : caps[1]);
          if (biome === 'verdant' && hash2(x >> 1, 1, 7) < 0.12) for (let k = L; k < L + ap(5); k++) if (p.a(x, y + k)) p.set(x, y + k, k % 2 ? P.moss[2] : P.moss[3]);
        }
      }
      if (theme === 'glass_cavern' || theme === 'void_rift' || theme === 'dragon_lair' || theme === 'fungal_warren') {
        const HC = R5(theme === 'glass_cavern' ? P.rose[3] : theme === 'void_rift' ? P.aether[3] : theme === 'dragon_lair' ? P.ember[3] : P.aether[4]);
        for (let k = 0; k < 5; k++) {
          let x = cx + (r() - 0.5) * ap(80), y = yb - ap(20) - r() * ap(40);
          if (theme === 'glass_cavern' || theme === 'fungal_warren') {
            if (!p.a(Math.round(x), Math.round(y))) continue;
            if (theme === 'glass_cavern') { const s = ap(3) + r() * ap(3); p.poly([[x - s * 0.4, y], [x, y - s * 1.6], [x + s * 0.4, y]], HC[2]); p.poly([[x - s * 0.4, y], [x, y - s * 1.6], [x, y]], HC[4]); e.poly([[x - s * 0.4, y], [x, y - s * 1.6], [x + s * 0.4, y]], HC[3]); }
            else { p.rect(Math.round(x), Math.round(y) - 2, 1, 3, CREAM); p.ellipse(x + 0.5, y - 3, 2.5, 1.5, HC[2]); e.ellipse(x + 0.5, y - 3, 2.5, 1.5, HC[3]); }
          } else for (let s = 0; s < ap(10); s++) {
            const X = Math.round(x), Y = Math.round(y);
            if (p.a(X, Y)) { p.set(X, Y, HC[2]); e.set(X, Y, HC[3]); if (p.a(X + 1, Y)) { p.set(X + 1, Y, HC[1]); e.set(X + 1, Y, HC[2]); } }
            y += 1; x += r() < 0.5 ? -1 : 1;
          }
        }
      }
      if (theme === 'bandit_hideout' || theme === 'pirate_cove') {
        const WD = R5(P.wood[2]);
        for (const sx of [-1, 1]) { const x = cx + sx * ap(30) - 1; p.rect(x, yb - ap(34), ap(2), ap(32), WD[2]); p.rect(x, yb - ap(34), 1, ap(32), WD[3]); }
        p.rect(cx - ap(32), yb - ap(36), ap(64), ap(2) + 1, WD[2]); p.rect(cx - ap(32), yb - ap(36), ap(64), 1, WD[4]);
        for (let x = cx - ap(31); x < cx + ap(31); x += ap(6)) p.set(x, yb - ap(35), IRON[0]);
        const CL = R5(theme === 'pirate_cove' ? '#2a2234' : P.red[3]);
        for (let y = yb - ap(33); y < yb - ap(17); y++) for (let x = cx - ap(30) + 3; x < cx - ap(30) + ap(10); x++) {
          const f = Math.floor((x - cx) / 3) % 3;
          const col = f === 0 ? CL[3] : f === 2 || f === -1 ? CL[1] : CL[2];
          if (y >= yb - ap(18) && (x % 2)) continue;
          p.set(x, y, col);
        }
        if (theme === 'pirate_cove') { const sx = cx - ap(24), sy = yb - ap(28); p.disc(sx + 0.5, sy, ap(2), CREAM); p.set(sx - 1, sy, INK); p.set(sx + 1, sy, INK); p.line(sx - 3, sy + 4, sx + 3, sy + 7, CREAM); p.line(sx + 3, sy + 4, sx - 3, sy + 7, CREAM); }
      }
      doorW = ap(34); doorH = ap(30); doorY = yb - ap(2);
      rim = dark(rc, 0.55); rimW = ap(2); inner = 'deep';
    }
    // the dark doorway: an arched ink void with a lit jamb, a faint floor and steps leading down
    const dx0 = cx - Math.floor(doorW / 2), dTop = doorY - doorH;
    const inDoor = (x, y) => {
      if (y < dTop || y > doorY || x < dx0 || x >= dx0 + doorW) return false;
      const ly = y - dTop, r0 = doorW / 2, dy = Math.max(0, r0 - ly);
      return Math.abs(x + 0.5 - cx) <= Math.sqrt(Math.max(0, r0 * r0 - dy * dy)) + 0.3;
    };
    const RIM = rim ? R5(rim) : null;
    if (rim) for (let y = dTop - rimW; y <= doorY; y++) for (let x = dx0 - rimW; x < dx0 + doorW + rimW; x++) {
      if (inDoor(x, y)) continue;
      let near = false;
      for (let k = 1; k <= rimW && !near; k++) near = inDoor(x + k, y) || inDoor(x - k, y) || inDoor(x, y + k) || inDoor(x + k, y + k) || inDoor(x - k, y + k);
      if (!near) continue;
      let col = RIM[2];
      if (inner === 'stairs') {
        const a = Math.atan2(y - (dTop + doorW / 2), x + 0.5 - cx);
        col = Math.floor((a + 7) * 3.2) % 2 ? RIM[3] : RIM[2];
        if (Math.abs(x + 0.5 - cx) < 2 && y < dTop + 2) col = RIM[4];
      } else if (vnoise(x, y, 3, 2.5) > 0.66) col = RIM[3];
      p.set(x, y, col);
    }
    const VOID = [C(INK), C('#0e0a14'), C('#231a2c'), C('#2a1e34')];
    for (let y = dTop; y <= doorY; y++) for (let x = dx0; x < dx0 + doorW; x++) {
      if (!inDoor(x, y)) continue;
      const ly = y - dTop;
      let col = VOID[1];
      if (!inDoor(x - 2, y)) col = VOID[2];
      else if (!inDoor(x + 2, y)) col = VOID[0];
      if (ly > doorH - 3) col = VOID[2];
      else if (inner === 'stairs' && ly > doorH * 0.55) { const k = Math.floor((doorH - ly) / 3); if ((doorH - ly) % 3 === 0 && Math.abs(x + 0.5 - cx) < doorW / 2 - k * 2 - 1) col = VOID[3]; }
      p.set(x, y, col);
    }
    return done(p, e, { door: [0, doorY - yb, doorW, doorH] });
  });
}
export function shrineSprite() {
  return memo('shrine', () => {
    const W = ap(70), H = ap(46);
    const p = mk(W, H);
    const cx = W >> 1, yb = H - 1, r = srand(77);
    const DS = R5(P.stone[3]);
    // round dais of fitted flagstones
    const dy = yb - ap(8);
    p.ellipse(cx, dy + ap(2), ap(24), ap(8), DS[0]);
    p.ellipse(cx, dy, ap(24), ap(8), DS[2]);
    for (let y = Math.floor(dy - ap(8)); y <= dy + ap(8); y++) for (let x = cx - ap(24); x <= cx + ap(24); x++) {
      const nx = (x + 0.5 - cx) / ap(24), ny = (y + 0.5 - dy) / ap(8), d = Math.hypot(nx, ny);
      if (d > 1 || !p.a(x, y)) continue;
      const a = Math.atan2(ny, nx);
      let col = d < 0.55 ? DS[3] : DS[2];
      if (Math.abs(d - 0.55) < 0.06 || (d > 0.55 && Math.abs((a / Math.PI) * 6 - Math.round((a / Math.PI) * 6)) < 0.07) || (d < 0.55 && Math.abs((a / Math.PI) * 3 - Math.round((a / Math.PI) * 3)) < 0.1)) col = DS[1];
      else if (d > 0.93 && ny < 0) col = DS[4];
      p.set(x, y, col);
    }
    mossClumps(p, cx - ap(24), dy - ap(4), ap(48), ap(10), 10, 5);
    // standing stones around (back ones first)
    const stones = [];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; stones.push([cx + Math.cos(a) * ap(28), yb - ap(9) + Math.sin(a) * ap(9), i]); }
    stones.sort((a, b) => a[1] - b[1]);
    const st = R5(P.stone[2]);
    const drawStone = (x, y, i) => {
      const h = ap(18) + (i % 2) * ap(5), hw = ap(3);
      for (let yy = Math.round(y - h); yy <= y; yy++) {
        const t = (yy - (y - h)) / h, half = hw * (t < 0.12 ? 0.6 + t * 3.3 : 1);
        for (let xx = Math.round(x - half); xx <= x + half; xx++) {
          const u = (xx + 0.5 - x) / half;
          let col = u < -0.45 ? st[3] : u > 0.45 ? st[1] : st[2];
          if (t < 0.06) col = st[4];
          p.set(xx, yy, col);
        }
      }
      mossClumps(p, x - hw, y - h * 0.3, hw * 2, h * 0.3, 4, i + 20);
      // carved spiral rune
      const gx = Math.round(x) - 1, gy = Math.round(y - h * 0.62);
      for (const [a, b] of [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1], [1, 1]]) p.set(gx + a, gy + b, st[0]);
      void r;
    };
    for (const [x, y, i] of stones) if (y < dy) drawStone(x, y, i);
    // altar
    const ax = cx - ap(7), ay = yb - ap(20), AL = R5('#7a7070');
    fillWall(p, ax, ay, ap(14), ap(12), AL[2], 'block', 7);
    p.rect(ax - ap(1), ay - ap(2), ap(16), ap(2), AL[3]); p.rect(ax - ap(1), ay - ap(2), ap(16), 1, AL[4]); p.rect(ax - ap(1), ay, ap(16), 1, AL[0]);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; p.set(Math.round(cx + Math.cos(a) * 3), Math.round(ay + ap(6) + Math.sin(a) * 3), AL[0]); }
    p.set(cx, ay + ap(6), GOLD[4]);
    for (const [x, y, i] of stones) if (y >= dy) drawStone(x, y, i);
    return done(p, null, { orbAt: [0, -ap(34)] });
  });
}
// blade plunged point-down into a stone; the pommel end of the weapon sprite is its x = 0
export function relicSprite(taken) {
  return memo('relic' + taken, () => {
    const sw = taken ? null : weaponSprite({ type: 'sword', base: 'Longsword', color: '#c8d0d8', trim: '#c8a050', rarity: 4 });
    const L = sw ? sw.pix.w : 0, sink = Math.round(L * 0.16);
    const W = ap(40), H = Math.max(ap(50), L - sink + ap(18));
    const p = mk(W, H), cx = W >> 1, yb = H - 1;
    stoneMass(p, cx, yb - ap(7), ap(16), ap(7), '#6a5a5e', 33, { facet: ap(3), cracks: 3, flatBase: 0.8 });
    stoneMass(p, cx + ap(9), yb - ap(3), ap(5), ap(3), '#5a4a52', 34, { facet: ap(3), cracks: 0 });
    const entry = yb - ap(11);
    let topY = entry;
    if (sw) {
      topY = entry - (L - sink);
      for (let y = 0; y < sw.pix.h; y++) for (let x = 0; x < sw.pix.w; x++) {
        const i = (y * sw.pix.w + x) * 4;
        if (!sw.pix.d[i + 3] || topY + x > entry) continue;
        p.set(cx + (y - sw.pix.oy), topY + x, [sw.pix.d[i], sw.pix.d[i + 1], sw.pix.d[i + 2], 255]);
      }
      // the split where the blade enters the stone
      const SR = R5('#6a5a5e');
      p.rect(cx - 3, entry + 1, 7, 1, INK_SOFT); p.set(cx - 4, entry + 2, SR[0]); p.set(cx + 4, entry + 2, SR[0]); p.rect(cx - 3, entry, 7, 1, SR[4]);
    }
    return done(p, null, { orbAt: [0, -(yb - topY + ap(6))] });
  });
}

// generic rock / ruin pieces for landmarks
export function rockSprite(rx, ry, color, seed = 1, top = null) {
  return memo('rock' + rx + ry + color + seed + top, () => {
    const p = mk(rx * 2 + ap(6), ry * 2 + ap(6));
    stoneMass(p, p.w / 2, p.h - ry - ap(2), rx, ry, color, seed, { facet: Math.max(ap(4), Math.round(Math.min(rx, ry) / 3)), bump: 0.2, flatBase: 0.85 });
    if (top) {
      const TR = R5(top);
      for (let x = 0; x < p.w; x++) for (let y = 0; y < p.h; y++) if (p.a(x, y) && !p.a(x, y - 1)) {
        const L = ap(2) + Math.floor(hash2(x >> 1, 0, seed) * ap(2));
        for (let k = 0; k < L; k++) if (p.a(x, y + k)) p.set(x, y + k, k === L - 1 ? TR[1] : k === 0 ? TR[3] : TR[2]);
      }
    }
    return done(p, null);
  });
}
export function columnSprite(h, color, broken = 0, seed = 0) {
  return memo('col' + h + color + broken + seed, () => {
    const H = Math.round(h * PPU * 0.7), W = (ap(13) + (broken ? ap(8) : 0)) | 1;
    const p = mk(W, H + ap(6)), cx = W >> 1, yb = p.h - 1;
    const top = yb - Math.round(H * (broken ? 1 - broken : 1));
    const R = R5(color), Rm = [R[0], R[1], R[2], R[3]];
    const sh = ap(3);
    // plinth and torus
    for (let j = 0; j < 3; j++) for (let i = -ap(5); i <= ap(5); i++) p.set(cx + i, yb - 2 + j, j === 0 ? Rm[3] : j === 2 ? Rm[1] : i === -ap(5) ? Rm[3] : i === ap(5) ? Rm[1] : Rm[2]);
    for (let i = -ap(4); i <= ap(4); i++) p.set(cx + i, yb - 3, Math.abs(i) === ap(4) ? Rm[1] : i < 0 ? Rm[3] : Rm[2]);
    // fluted shaft
    for (let y = top; y < yb - 3; y++) for (let i = -sh; i <= sh; i++) {
      const u = i / sh;
      let idx = u < -0.55 ? 3 : u < 0.05 ? 2 : u < 0.6 ? 1 : 0;
      if (i % 2 === 0 && Math.abs(i) < sh) idx = Math.max(0, idx - 1);
      p.set(cx + i, y, Rm[idx]);
    }
    if (broken) {
      for (let i = -sh; i <= sh; i++) {
        const cut = 1 + Math.floor(hash2(i >> 1, seed, 2) * ap(3));
        for (let k = 0; k < cut; k++) p.clear(cx + i, top + k);
        p.set(cx + i, top + cut, i < 1 ? R[4] : R[3]);
      }
      mossClumps(p, cx - sh, yb - Math.round((yb - top) * 0.4), sh * 2, Math.round((yb - top) * 0.4), 4, seed + 4);
      // a fallen drum at the foot
      const fx = cx + (seed % 2 ? 1 : -1) * ap(6);
      p.ellipse(fx, yb - 2, ap(3), ap(2), Rm[1]); p.ellipse(fx - 0.5, yb - 2.5, ap(3) - 1, ap(2) - 1, Rm[2]); p.ellipse(fx - 1, yb - 3, ap(1.4), 1.2, Rm[3]);
    } else {
      p.rect(cx - ap(5), top - ap(3), ap(10) + 1, ap(3), Rm[2]); p.rect(cx - ap(5), top - ap(3), ap(10) + 1, 1, R[4]); p.rect(cx + ap(5), top - ap(3), 1, ap(3), Rm[1]);
      p.rect(cx - ap(4), top - 1, ap(8) + 1, 1, Rm[1]); p.rect(cx - ap(4) + 1, top, ap(8) - 1, 1, Rm[0]);
      for (const sd of [-1, 1]) p.set(cx + sd * (ap(5) - 1), top - 1, Rm[3]);
    }
    return done(p, null);
  });
}
export function ruinWallSprite(wu, hu, color, seed) {
  return memo('ruin' + wu + hu + color + seed, () => {
    const W = Math.round(wu * PPU), H = Math.round(hu * PPU * 0.7), TT = ap(6);
    const p = mk(W + 2, H + ap(10)), yb = p.h - 1, R = R5(color), M = P.moss.map((c) => C(c));
    fillWall(p, 1, yb - H, W, H, color, 'block', seed);
    fillWall(p, 1, yb - H - TT, W, TT, light(color, 1.13), 'block', seed + 1);
    // broken top: stepped along the block courses, crumbly at the edges
    const seg = ap(5);
    for (let x = 1; x <= W; x++) {
      const b = Math.floor((x - 1) / seg);
      const sm = (Math.sin((b * seg) / ART * 0.21 + seed) * 0.5 + 0.5) * H * 0.55;
      let cut = Math.round(sm / KR) * KR + Math.floor(hash2(b, seed, 5) * 2) * KR;
      const edge = (x - 1) % seg;
      if (edge === 0 || edge === seg - 1) cut += Math.floor(hash2(x, seed, 6) * 3);
      cut = Math.min(cut, H - ap(4));
      for (let y = yb - H - TT; y < yb - H - TT + cut; y++) p.clear(x, y);
      const ty = yb - H - TT + cut;
      if (cut > 0 && p.a(x, ty)) { p.set(x, ty, R[4]); if (p.a(x, ty + 1)) p.set(x, ty + 1, R[3]); }
    }
    doorAt(p, Math.round(W / 2) - ap(5), yb, ap(10), Math.min(ap(18), H - ap(4)), P.wood[1], { arch: true, dark: true, frame: dark(color, 0.7) });
    // moss on the broken tops (in runs a few pixels wide), hanging vines, rubble at the foot
    for (let x = 1; x <= W; x++) for (let y = 0; y < yb; y++) if (p.a(x, y) && !p.a(x, y - 1)) {
      const run = Math.floor(x / 3);
      if (hash2(run, 1, seed) < 0.45) { p.set(x, y, hash2(run, 2, seed) < 0.5 ? M[3] : M[4]); if (p.a(x, y + 1)) p.set(x, y + 1, M[2]); }
      if (hash2(x, 3, seed) < 0.06) { const L = ap(3) + Math.floor(hash2(x, 4, seed) * ap(8)); for (let k = 2; k < L; k++) if (p.a(x, y + k)) p.set(x, y + k, k % 3 === 2 ? M[3] : M[2]); }
      break;
    }
    for (let k = 0; k < Math.max(2, Math.round(W / ap(14))); k++) { const rx = 1 + hash2(k, 7, seed) * W; stoneMass(p, rx, yb - 2, ap(2) + hash2(k, 8, seed) * ap(2), ap(1.6), light(color, 1.05), seed * 7 + k, { facet: ap(2), cracks: 0, flatBase: 0.7 }); }
    return done(p, null);
  });
}

// a weapon stuck point-down in the earth (battlefields)
export function stuckWeapon(type, seed) {
  return memo('stuck' + type + seed, () => {
    const w = weaponSprite({ type, color: '#8a8a90', trim: '#6a5a3a', rarity: 0 });
    const L = w.pix.w, sink = ap(3);
    const lean = (hash2(seed, 1, 2) - 0.5) * 0.5;
    const p = mk(w.pix.h + Math.ceil(Math.abs(lean) * L) * 2 + ap(8), L - sink + ap(2));
    const yb = p.h - 1;
    for (let y = 0; y < w.pix.h; y++) for (let x = 0; x < L; x++) {
      const i = (y * L + x) * 4;
      if (!w.pix.d[i + 3]) continue;
      const py = x - sink + ap(2) - 1;
      if (py > yb - 1) continue;
      p.set(Math.round(p.ox + (y - w.pix.oy) + lean * (x - L)), py, [w.pix.d[i], w.pix.d[i + 1], w.pix.d[i + 2], 255]);
    }
    // a little mound of churned earth
    const D = P.dirt;
    p.ellipse(p.ox + 0.5, yb - 0.5, ap(3.5), ap(1.5), D[2]); p.ellipse(p.ox, yb - 1, ap(2.5), ap(1), D[4]);
    p.set(p.ox - ap(2), yb - 1, D[6]); p.set(p.ox + 1, yb - 2, D[5]);
    return { pix: p, emis: null };
  });
}
// a single block of curtain wall (overlapping blocks build walls along any curve)
export function wallBlock(color, h = 4.2, snow = false) {
  return memo('wblock' + color + h + snow, () => {
    const BWk = ap(18), H = Math.round(h * PPU * 0.7), T = ap(12), R = R5(color);
    const p = mk(BWk, H + T + ap(3)), yb = p.h - 1;
    fillWall(p, 0, yb - H + 1, BWk, H, color, 'block', 3);
    // the walk-top (seen from above): a lit cap a step brighter than the face
    fillWall(p, 0, yb - H - T + 1, BWk, T, R[3], 'block', 5);
    p.rect(0, yb - H - T + 1, BWk, 1, R[1]);
    p.rect(0, yb - H, BWk, 1, R[4]);
    // plum shadow band under the cap lip
    for (let x = 0; x < BWk; x++) { shadeAt(p, x, yb - H + 1, 0.66); shadeAt(p, x, yb - H + 2, 0.8); }
    merlons(p, 0, BWk, yb - H - T - 2, light(color, 1.08), snow);
    if (snow) for (let x = 0; x < BWk; x++) { p.set(x, yb - H - T + 2, SNOW[3]); if (hash2(x >> 2, 3, 1) < 0.6) p.set(x, yb - H - T + 3, SNOW[2]); p.set(x, yb - H, SNOW[3]); }
    return { pix: p, emis: null };
  });
}
