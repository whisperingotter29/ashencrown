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
import { Pix, C, PPU, ART, ap, light, dark, shade, mixc, hash2, srand, bayer } from '../pix.js';
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
const WIN = C('#ffc070');

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
export const shadeAt = (p, x, y, k) => { const c = p.get(x | 0, y | 0); if (c && c[3]) p.set(x, y, shade(c, k)); };
// rounded-top opening (doors, arched windows): is column i, row ly (from the top) inside?
function archIn(i, ly, w) { const r = w / 2, dy = Math.max(0, r - ly); return Math.abs(i + 0.5 - r) <= Math.sqrt(Math.max(0, r * r - dy * dy)) + 0.2; }

// Lumpy stone mass lit from the top-left: chunky facets (jittered cells with their own tilt),
// chiselled seams, a shadowed underside and a few cracks. o.leafy turns the cells into rounded
// leaf clumps (hedges, bushes).
export function stoneMass(p, cx, cy, rx, ry, base, seed = 1, o = {}) {
  const R = o.ramp || ramp(base);
  const bump = o.bump ?? 0.16, lobes = o.lobes || 6, cell = o.facet || ap(4), tilt = o.tilt ?? 0.55;
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
export function fillWall(p, x0, y0, w, h, base, kind, seed = 0) {
  const c = C(base);
  x0 = Math.round(x0); y0 = Math.round(y0); w = Math.round(w); h = Math.round(h);
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const lx = x - x0, ly = y - y0;
    let col = c;
    const n = hash2(x, y, seed);
    if (kind === 'brick') {
      const row = Math.floor(ly / BR), off = row % 2 ? BW >> 1 : 0, rx = (lx + off) % BW, ry = ly % BR, bi = Math.floor((lx + off) / BW);
      if (ry === BR - 1 || rx === 0) col = dark(c, 0.66);
      else {
        col = shade(c, 0.9 + hash2(bi, row, seed + 7) * 0.16);
        if (ry === 0) col = light(col, 1.06); else if (ry === BR - 2 || rx === BW - 1) col = shade(col, 0.9);
        if (n < 0.05) col = shade(col, 0.84);
      }
    } else if (kind === 'block') {
      const row = Math.floor(ly / KR), off = Math.floor(hash2(row, 3, seed) * KW), rx = (lx + off) % KW, ry = ly % KR, bi = Math.floor((lx + off) / KW);
      if (ry === KR - 1 || rx === 0) col = dark(c, 0.68);
      else {
        col = shade(c, 0.9 + hash2(bi, row, seed + 7) * 0.14);
        if (ry === 0 || rx === 1) col = light(col, 1.08);
        else if (ry === KR - 2 || rx === KW - 1) col = dark(col, 0.86);
        const chip = hash2(bi, row, seed + 9);
        if (chip < 0.3 && ((ry === 0 && rx <= 2) || (ry === 1 && rx === 1))) col = dark(c, 0.76);
        else if (chip > 0.8 && ry >= KR - 3 && rx >= KW - 2) col = dark(c, 0.76);
        else if (n < 0.04) col = dark(col, 0.86);
        else if (n > 0.975) col = light(col, 1.1);
      }
    } else if (kind === 'plank') {
      const rx = lx % PW, bi = Math.floor(lx / PW);
      const jy = (ly + Math.floor(hash2(bi, 1, seed) * 23)) % ap(11);
      if (rx === PW - 1) col = dark(c, 0.62);
      else {
        col = shade(c, 0.92 + hash2(bi, 2, seed) * 0.14);
        if (rx === 0) col = light(col, 1.06);
        if (hash2(x, Math.floor(ly / 3), seed + 1) < 0.14) col = shade(col, 0.88);
        if (jy === 0) col = dark(c, 0.7);
        else if (jy === 2 && (rx === 1 || rx === PW - 3)) col = dark(c, 0.5);
      }
    } else if (kind === 'adobe') {
      const v = vnoise(x, y, seed, ap(4));
      col = v < 0.3 ? shade(c, 0.94) : v > 0.74 ? light(c, 1.04) : c;
      if (n < 0.05) col = dark(col, 0.9); else if (n > 0.975) col = light(col, 1.1);
    } else if (kind === 'marble') {
      const row = Math.floor(ly / MC), ry = ly % MC, rx = (lx + (row % 2) * MC) % (MC * 2);
      if (ry === MC - 1) col = dark(c, 0.86);
      else if (rx === 0) col = dark(c, 0.92);
      else {
        if (ry === 0) col = light(c, 1.04);
        const v = vnoise(x + y * 0.6, y, seed + 2, ap(5));
        if (Math.abs(v - 0.5) < 0.022) col = mixc(col, '#a8a090', 0.4);
        else if (n > 0.975) col = mixc(col, '#a8a090', 0.22);
      }
    } else {
      // plaster: soft patches and specks
      if (vnoise(x, y, seed, ap(5)) < 0.26) col = shade(c, 0.95);
      if (n < 0.05) col = dark(col, 0.92); else if (n > 0.98) col = light(col, 1.05);
    }
    // vertical shading: lit left, shadowed right
    if (lx === 0) col = light(col, 1.1); else if (lx === w - 1) col = dark(col, 0.8);
    if (ly === h - 1) col = dark(col, 0.75);
    p.set(x, y, col);
  }
}
// One pixel of a roof pattern. rb counts rows up from the bottom of the slope so every eave row is
// a whole course; RR is the course height (foreshortened on the back slope).
function roofPx(kind, col, x, lx, rb, RR, seed) {
  if (kind === 'tile') {
    const TW = ap(4), row = Math.floor(rb / RR), ry = RR - 1 - (rb % RR), off = row % 2 ? TW >> 1 : 0, tx = (lx + off) % TW, ti = Math.floor((lx + off) / TW);
    const tv = hash2(ti, row, seed + 11);
    const k = tv < 0.12 ? shade(col, 0.9) : tv > 0.9 ? light(col, 1.05) : col;
    if (ry === RR - 1) return tx === 0 || tx === TW - 1 ? dark(col, 0.52) : dark(col, 0.72);
    if (tx === TW - 1) return dark(k, 0.78);
    if (tx === 0) return light(k, 1.1);
    if (tx === TW - 2) return shade(k, 0.92);
    return k;
  }
  if (kind === 'slate') {
    const SR = Math.max(2, RR - 1), SW = ap(5), row = Math.floor(rb / SR), ry = SR - 1 - (rb % SR), off = row % 2 ? SW >> 1 : 0, sx = (lx + off) % SW, si = Math.floor((lx + off) / SW);
    let k = shade(col, 0.88 + hash2(si, row, seed + 13) * 0.18);
    if (ry === SR - 1) return dark(col, 0.66);
    if (sx === 0) return dark(col, 0.8);
    if (ry === 0 && sx === 1) k = light(k, 1.1);
    return k;
  }
  if (kind === 'thatch') {
    const LR = RR + 1, row = Math.floor(rb / LR), ry = LR - 1 - (rb % LR);
    const s = hash2(x, row, seed);
    if (ry >= LR - 1 - (s < 0.33 ? 1 : 0)) return dark(col, 0.66);
    if (hash2(x, row * 7 + (ry >> 1), seed + 3) < 0.28) return dark(col, 0.84);
    return s > 0.82 ? light(col, 1.08) : col;
  }
  if (kind === 'cloth') return Math.floor(lx / ap(4)) % 2 ? mixc(col, '#f0e8d8', 0.35) : col;
  return col;
}
// Roof of tile rows seen from the front: lighter toward the eave, darkest at the ridge.
// ro.ridge (0..1) adds a foreshortened back slope above a ridge cap; ro.moss sprinkles moss.
export function fillRoof(p, x0, y0, w, h, base, kind = 'tile', seed = 0, snow = 0, ro = {}) {
  const c = C(base);
  x0 = Math.round(x0); y0 = Math.round(y0); w = Math.round(w); h = Math.round(h);
  const RB = ro.ridge ? Math.max(3, Math.round(h * ro.ridge)) : 0;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const ly = y - y0, lx = x - x0;
    let col;
    if (ly < RB) col = roofPx(kind, mixc(dark(c, 0.5), dark(c, 0.66), ly / RB), x, lx, RB - 1 - ly, ap(2), seed + 1);
    else col = roofPx(kind, mixc(dark(c, 0.8), light(c, 1.1), (ly - RB) / Math.max(1, h - RB - 1)), x, lx, h - 1 - ly, ap(3), seed);
    if (ro.moss && ly > RB + 2 && vnoise(x, y, seed + 9, ap(4)) > 1 - ro.moss * 0.5 && hash2(x, y, 4) < 0.75) col = mixc(col, '#4a6a2a', 0.55);
    if (lx === 0) col = light(col, 1.08); else if (lx === w - 1) col = dark(col, 0.82);
    p.set(x, y, col);
  }
  // ridge cap (or the top edge) and the eave line
  for (let x = x0; x < x0 + w; x++) {
    const lx = x - x0;
    if (RB) {
      p.set(x, y0 + RB - 1, dark(c, 0.46));
      p.set(x, y0 + RB, lx % 5 === 4 ? dark(c, 0.62) : light(dark(c, 0.86), 1.14));
      p.set(x, y0 + RB + 1, dark(c, 0.6));
    }
    p.set(x, y0, dark(c, 0.5));
    p.set(x, y0 + h - 1, dark(c, 0.6));
  }
  if (snow) for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const t = (y - y0) / Math.max(1, h - 1);
    const thr = snow + (vnoise(x, 0, seed + 3, ap(7)) - 0.5) * 0.2 + (hash2(x, 1, seed) - 0.5) * 0.04;
    if (t >= thr) continue;
    p.set(x, y, t > thr - 0.06 ? '#b8c4d8' : hash2(x, y, 5) < 0.05 ? '#ffffff' : mixc(C('#f0f4fa'), C('#d8e0ec'), t / Math.max(0.01, thr)));
  }
}
// Window with a lit-top / shaded-bottom frame, a glass glint, mullions, optional shutters,
// lattice (desert) and flower box. The warm lamplight lives on the emissive layer.
export function windowAt(p, e, x, y, w, h, frame, o = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const f = C(frame), fl = light(f, 1.12), fd = dark(f, 0.68);
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
  const lc = C(o.color || WIN);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (!inG(i, j)) continue;
    if (o.dark) { p.set(x + i, y + j, '#1a1418'); continue; }
    if (o.lattice && (i + j) % 2 === 0 && j > 0) { p.set(x + i, y + j, o.lattice); continue; }
    let g = C('#2a3442');
    if (j === 0 || !inG(i, j - 1)) g = C('#1e2632');
    else if (i >= 1 && j >= 1 && i + j === 2) g = C('#6a7a8c');
    else if (i >= 1 && j >= 1 && i + j === 3) g = C('#46566a');
    p.set(x + i, y + j, g);
    let k = lc;
    if (j === 0) k = shade(lc, 0.82); else if (j === h - 1 || i === w - 1) k = shade(lc, 0.9);
    if (i + j <= 1 + (j === 0 ? 0 : 1) && j > 0 && i <= 1) k = C('#fff0c0');
    e.set(x + i, y + j, k);
  }
  if (o.mullion && w >= 3 && !o.dark) {
    const mx = x + Math.floor(w / 2), my = y + Math.floor(h / 2);
    for (let j = 0; j < h; j++) if (inG(mx - x, j)) { p.set(mx, y + j, f); e.clear(mx, y + j); }
    for (let i = 0; i < w; i++) { p.set(x + i, my, i === 0 ? fl : f); e.clear(x + i, my); }
  }
  if (o.shutters) {
    const s = C(o.shutters), SW = ap(2);
    for (const sx of [x - 1 - SW, x + w + 1]) for (let j = -1; j <= h; j++) for (let i = 0; i < SW; i++) {
      let col = (j + 1) % 2 ? s : dark(s, 0.78);
      if (i === 0) col = light(col, 1.1); else if (i === SW - 1) col = dark(col, 0.82);
      if (j === -1) col = light(s, 1.15);
      p.set(sx + i, y + j, col);
    }
  }
  // sill with a thin shadow under it
  p.rect(x - 2, y + h + 1, w + 4, 1, o.snow ? C('#eef2f8') : light(f, 1.05));
  for (let i = -1; i <= w; i++) shadeAt(p, x + i, y + h + 2, 0.76);
  if (o.flowers) {
    const fc = C(o.flowers);
    p.rect(x - 1, y + h + 2, w + 2, ap(2), '#6a4628'); p.rect(x - 1, y + h + 2, w + 2, 1, '#8a6038');
    for (let i = -1; i <= w; i++) p.set(x + i, y + h + 1, hash2(i, x, 3) < 0.5 ? (hash2(i, y, 4) < 0.5 ? fc : light(fc, 1.2)) : (i % 2 ? '#3a6a2a' : '#5a8a3a'));
  }
}
// Plank door (or a dark doorway with o.dark): grain, iron straps, a ring handle and a frame that
// follows the arch. o.fw: frame thickness, o.stones: alternating voussoir blocks.
export function doorAt(p, x, yb, w, h, wood, o = {}) {
  x = Math.round(x); yb = Math.round(yb); w = Math.round(w); h = Math.round(h);
  const c = C(wood), fr = C(o.frame || dark(wood, 0.6));
  const top = yb - h + 1;
  const inD = (i, ly) => i >= 0 && i < w && ly >= 0 && ly < h && (!o.arch || archIn(i, ly, w));
  const pw = ap(2);
  for (let ly = 0; ly < h; ly++) for (let i = 0; i < w; i++) {
    if (!inD(i, ly)) continue;
    let col;
    if (o.dark) col = ly < 2 || !inD(i, ly - 2) ? C('#16121a') : i === 0 ? C('#100c12') : C('#0a080c');
    else {
      const seam = i % pw === pw - 1 && i < w - 1;
      col = seam ? dark(c, 0.68) : i === 0 ? light(c, 1.12) : i === w - 1 ? dark(c, 0.8) : shade(c, 0.94 + hash2(Math.floor(i / pw), 3, 7) * 0.12);
      if (!seam && hash2(x + i, Math.floor((top + ly) / 3), 5) < 0.1) col = shade(col, 0.88);
      if (!inD(i, ly - 1) || !inD(i, ly - 2)) col = dark(col, 0.72);
    }
    p.set(x + i, top + ly, col);
  }
  if (!o.dark && h >= ap(8)) for (const sy of [Math.round(h * 0.26), Math.round(h * 0.74)]) {
    for (let i = 0; i < w - 1; i++) if (inD(i, sy)) p.set(x + i, top + sy, i % 3 === 1 ? '#6a6266' : '#2e282c');
    if (inD(0, sy)) p.set(x - 1, top + sy, '#2e282c');
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
      let col = fr;
      if (o.stones) col = Math.floor((i + 64 + (top + ly)) / ap(3)) % 2 ? light(fr, 1.14) : fr;
      if (kk === fw && (i < 0 || ly < 0) && (ly < 0 || i < w / 2)) col = light(col, 1.06);
      if (o.stones && (i + top + ly) % ap(3) === 0) col = dark(fr, 0.72);
      p.set(x + i, top + ly, col);
    }
  }
  if (!o.dark) { const hx = x + w - 1 - ap(1), hy = yb - Math.floor(h / 2); p.set(hx, hy, '#e8c868'); p.set(hx, hy + 1, '#8a6a2a'); p.set(hx - 1, hy + 1, '#5a4420'); }
}

// ------------------------------------------------------------------ houses
export const STYLE = {
  desert: { wall: ['#c89a6a', '#b8845a', '#d8aa78', '#a87048'], roof: ['#a86a42', '#8a5030'], trim: '#6a3a24', cloth: ['#a02a20', '#d8a040', '#2a4a7a', '#7a2a5a'] },
  marble: { wall: ['#e8e0cc', '#d8cfb8', '#f0e8d8'], roof: ['#b8583a', '#a04a30', '#c86848'], trim: '#c8a050', cloth: ['#d8b040', '#a02020', '#f0e8d0'] },
  wood: { wall: ['#7a5a3a', '#8a6a48', '#6a4a30'], roof: ['#4a5a30', '#5a4a30', '#3a4a2a', '#7a5a30'], trim: '#3a2a1a', cloth: ['#4a7a3a', '#a08040', '#6a3a7a'] },
  stone: { wall: ['#7a7a80', '#6a6a72', '#8a8478'], roof: ['#3a4250', '#4a4a58', '#2a3240'], trim: '#3a3030', cloth: ['#3a5a8a', '#8a2a2a', '#5a3a7a'] },
  camp: { wall: ['#8a7058', '#a08060', '#6a5a48'], roof: ['#6a5040', '#7a6048'], trim: '#3a2a1a', cloth: ['#3a5a8a', '#8a2a2a', '#c0a060'] },
  port: { wall: ['#8a7a68', '#7a6a58', '#a09078'], roof: ['#5a3a2a', '#3a4a5a', '#6a3a2a'], trim: '#2a2a2a', cloth: ['#e0e0d0', '#2a5a7a', '#a03020'] },
};

// a course of fitted foundation stones
function foundation(p, x, y, w, h, base, seed) {
  const c = C(base);
  let sx = x, k = 0;
  while (sx < x + w) {
    const sw = ap(3) + Math.floor(hash2(k, 1, seed) * ap(3)), tone = 0.86 + hash2(k, 2, seed) * 0.22;
    for (let i = 0; i < sw && sx + i < x + w; i++) for (let j = 0; j < h; j++) {
      let col = shade(c, tone);
      if (i === 0) col = dark(c, 0.62); else if (j === 0) col = light(col, 1.12); else if (j === h - 1) col = dark(col, 0.8);
      p.set(sx + i, y + j, col);
    }
    sx += sw; k++;
  }
}
// overlapping horizontal weatherboards (port houses)
function clapboard(p, x0, y0, w, h, base, seed) {
  const c = C(base), BH = ap(3);
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const lx = x - x0, ly = y - y0, row = Math.floor(ly / BH), ry = ly % BH, tv = hash2(row, 1, seed);
    let col = shade(c, 0.9 + tv * 0.14);
    if (ry === 0) col = dark(c, 0.62);
    else if (ry === 1) col = shade(col, 0.86);
    else if (ry === BH - 1) col = light(col, 1.06);
    if (ry > 0 && hash2(x >> 2, y, seed) < 0.08) col = shade(col, 0.9);
    if (ry > 0 && (lx + Math.floor(tv * 37)) % ap(24) === 0) col = dark(c, 0.7);
    if (lx < 2) col = lx === 0 ? light(dark(c, 0.8), 1.1) : dark(c, 0.8);
    else if (lx >= w - 2) col = dark(c, lx === w - 1 ? 0.66 : 0.78);
    p.set(x, y, col);
  }
}
// alternating long / short corner stones (stone houses)
function quoins(p, x0, y0, w, h, base) {
  const c = light(base, 1.14);
  for (let y = y0, k = 0; y < y0 + h; y += KR, k++) {
    const qw = k % 2 ? ap(3) : ap(5), hh = Math.min(KR - 1, y0 + h - y);
    for (const [qx, side] of [[x0, 0], [x0 + w - qw, 1]]) {
      for (let j = 0; j < hh; j++) for (let i = 0; i < qw; i++) {
        let col = c;
        if (j === 0 || (side === 0 && i === 0)) col = light(c, 1.08);
        else if (j === hh - 1 || (side === 1 && i === qw - 1) || (side === 0 && i === qw - 1)) col = dark(c, 0.84);
        if (hash2(qx + i, y + j, 2) < 0.05) col = dark(col, 0.88);
        p.set(qx + i, y + j, col);
      }
      if (y + hh < y0 + h) p.rect(qx, y + hh, qw, 1, dark(base, 0.62));
    }
  }
}
function dormer(p, e, cx, y, roofC, trim, faceC) {
  const ww = ap(4) + 1, wh = ap(4) + 1, x = cx - (ww >> 1), rc = C(roofC);
  p.rect(x - 2, y - 2, ww + 4, wh + 4, faceC); p.rect(x - 2, y - 2, 1, wh + 4, light(faceC, 1.1)); p.rect(x + ww + 1, y - 2, 1, wh + 4, dark(faceC, 0.8));
  windowAt(p, e, x, y, ww, wh, trim, { mullion: true });
  const gh = ap(4), gy = y - 3;
  for (let j = 0; j <= gh; j++) {
    const hw = Math.round((j / gh) * ((ww >> 1) + 4));
    for (let i = -hw; i <= hw; i++) p.set(cx + i, gy - gh + j, j === gh ? dark(rc, 0.6) : Math.abs(i) >= hw - 1 ? dark(rc, 0.7) : i < 0 ? light(rc, 1.05) : dark(rc, 0.84));
  }
}
// small things stood against the front wall
function clutter(p, x, yb, kind, seed) {
  if (kind === 'barrel') {
    const w = ramp('#7a5232'), W = ap(6), H = ap(8);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const u = (i + 0.5) / W; let col = w[u < 0.3 ? 3 : u < 0.65 ? 2 : 1];
      if (i % 3 === 2) col = dark(col, 0.86);
      if (j === 2 || j === H - 3) col = '#3a3438';
      p.set(x + i, yb - H + 1 + j, col);
    }
    p.rect(x + 1, yb - H, W - 2, 1, w[0]); p.rect(x + 1, yb - H + 1, W - 2, 1, w[1]);
  } else if (kind === 'crate') {
    const W = ap(7), H = ap(6), c = C('#8a6a40');
    fillWall(p, x, yb - H + 1, W, H, c, 'plank', seed);
    p.line(x + 1, yb - 1, x + W - 2, yb - H + 2, dark(c, 0.62));
    p.rect(x, yb - H + 1, W, 1, light(c, 1.12));
  } else if (kind === 'logs') {
    for (let k = 0; k < 5; k++) {
      const lx = x + 2 + (k % 3) * ap(3) + (k >= 3 ? ap(1.5) : 0), ly = yb - 2 - (k >= 3 ? ap(3) : 0);
      p.disc(lx + 0.5, ly + 0.5, ap(1.6), '#6a4a2c'); p.disc(lx + 0.5, ly + 0.5, ap(1.6) - 1, '#c8a070'); p.set(lx, ly, '#8a6440');
    }
  } else if (kind === 'pots') {
    for (let k = 0; k < 2; k++) {
      const R = ramp(k ? '#b8784a' : '#a86a42'), px = x + k * ap(5), r = ap(2.5) - k;
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
    const cx = x0 + Math.floor(W / 2);
    if (style === 'camp') return tent(p, e, S, r, W, Hh + RH, o.snow);
    if (style === 'mushroom') return mushroomHouse(p, e, r, W, Hh);
    // ---- foundation
    if (style === 'port') {
      p.rect(x0, yb - FH + 1, W, FH, '#241c18');
      for (let x = x0 + 1; x < x0 + W - 2; x += ap(8)) { p.rect(x, yb - FH + 1, ap(2), FH, '#5a4430'); p.set(x, yb - FH + 1, '#7a5e40'); }
      p.rect(x0 + W - ap(2) - 1, yb - FH + 1, ap(2), FH, '#5a4430');
    } else foundation(p, x0 - 1, yb - FH + 1, W + 2, FH, style === 'marble' ? '#c8c0a8' : style === 'desert' ? dark(wallC, 0.8) : '#5a5048', seed);
    // ---- front wall
    if (style === 'desert') {
      fillWall(p, x0, wallTop, W, wH, wallC, 'adobe', seed);
      // splash-darkened base, hairline cracks and a patch of bare mud brick
      for (let j = 0; j < ap(3); j++) for (let x = x0; x < x0 + W; x++) if (j > 0 || bayer(x, j) < 0.5) shadeAt(p, x, yb - FH - j, 0.9);
      for (let k = 0; k < 3; k++) {
        let x = x0 + 3 + Math.floor(r() * (W - 6)), y = wallTop + ap(3) + Math.floor(r() * wH * 0.5);
        for (let s = 0; s < ap(5); s++) { shadeAt(p, x, y, 0.72); y++; if (r() < 0.5) x += r() < 0.5 ? -1 : 1; }
      }
      const bx = x0 + ap(3) + Math.floor(r() * (W * 0.25)), by = wallTop + Math.floor(wH * (0.5 + r() * 0.2));
      fillWall(p, bx, by, ap(7), ap(4), dark(wallC, 0.86), 'brick', seed + 3);
      p.rect(bx - 1, by - 1, ap(7) + 2, 1, light(wallC, 1.08));
    } else if (style === 'marble') fillWall(p, x0, wallTop, W, wH, wallC, 'marble', seed);
    else if (style === 'stone') { fillWall(p, x0, wallTop, W, wH, wallC, 'block', seed); quoins(p, x0, wallTop, W, wH, wallC); }
    else if (style === 'port') clapboard(p, x0, wallTop, W, wH, wallC, seed);
    else {
      const plasterC = pick(['#cdbb98', '#c8b088', '#d8c8a8']);
      fillWall(p, x0, wallTop, W, wH, plasterC, 'plaster', seed);
      // timber frame: braces, posts, rails, a sill beam, pegs
      const tc = C(wallC), tl = light(tc, 1.1), td = dark(tc, 0.74);
      const midY = wallTop + Math.floor(Hh * 0.5);
      const p1 = x0 + Math.floor(W / 3) - 1, p2 = x0 + Math.floor((W * 2) / 3) - 1;
      p.line(x0 + 2, midY - 2, p1 - 1, wallTop + 3, td, 2); p.line(x0 + 2, midY - 3, p1 - 1, wallTop + 2, tc);
      p.line(x0 + W - 3, midY - 2, p2 + 2, wallTop + 3, td, 2); p.line(x0 + W - 3, midY - 3, p2 + 2, wallTop + 2, tc);
      for (const x of [x0, x0 + W - 2, p1, p2]) { p.rect(x, wallTop, 2, wH, tc); p.rect(x + 1, wallTop, 1, wH, td); }
      for (const ry of [wallTop, midY, yb - FH - 1]) { p.rect(x0, ry, W, 2, tc); p.rect(x0, ry, W, 1, tl); }
      for (const x of [x0, x0 + W - 2, p1, p2]) for (const ry of [wallTop, midY]) p.set(x, ry + 1, td);
      // a little exposed brick where the plaster fell off
      if (r() < 0.6) { const bx = x0 + ap(3) + Math.floor(r() * (W - ap(12))), by = midY + ap(4) + Math.floor(r() * ap(4)); fillWall(p, bx, by, ap(5), ap(3), '#9a5a40', 'brick', seed + 2); }
    }
    // ---- eave shadow across the top of the wall
    for (let j = 0; j <= ap(2); j++) for (let x = x0; x < x0 + W; x++) if (j < ap(2) || bayer(x, j) < 0.5) shadeAt(p, x, wallTop + j, j < ap(2) - 1 ? 0.7 : 0.82);
    // ---- door + windows
    const dw = Math.max(ap(5), Math.round(W * 0.16)), dh = Math.min(Hh - ap(3) - FH, ap(20));
    const dx = cx - Math.floor(dw / 2), doorTop = yb - FH - dh + 1;
    const stoneFrame = style === 'stone' || style === 'marble' || style === 'desert';
    doorAt(p, dx, yb - FH, dw, dh, style === 'desert' ? '#5a3420' : style === 'marble' ? '#5a3a24' : '#3e2616', { arch: style !== 'wood' && style !== 'port', frame: style === 'marble' ? '#c8a050' : style === 'stone' ? light(wallC, 1.12) : style === 'desert' ? dark(wallC, 0.78) : null, fw: stoneFrame ? 2 : 1, stones: style === 'stone' });
    // doorstep
    p.rect(dx - 2, yb - FH + 1, dw + 4, FH, style === 'marble' ? '#e0d8c4' : '#8a8478'); p.rect(dx - 2, yb - FH + 1, dw + 4, 1, style === 'marble' ? '#f4eee0' : '#a8a298'); p.rect(dx - 2, yb, dw + 4, 1, '#4a4440');
    const wwid = style === 'desert' ? ap(3) : ap(4) + 1, whgt = style === 'desert' ? ap(6) : ap(5) + 1;
    const wy = wallTop + Math.max(ap(3), Math.floor(Hh * 0.28));
    const winX = [cx - Math.floor(W * 0.3) - (wwid >> 1), cx + Math.floor(W * 0.3) - (wwid >> 1)];
    const frameC = style === 'marble' ? '#d8ccb0' : style === 'stone' ? '#5a5a58' : S.trim;
    if (W >= ap(40)) for (const wx of winX) windowAt(p, e, wx, wy, wwid, whgt, frameC, { mullion: style !== 'desert', arch: style === 'desert', lattice: style === 'desert' ? '#4a2a18' : null, snow: o.snow, shutters: style === 'wood' && r() < 0.6 ? pick(['#4a6a3a', '#6a3a2a', '#3a4a6a']) : null, flowers: (style === 'wood' || style === 'stone' || style === 'port') && !o.snow && r() < 0.4 ? pick(['#e04050', '#f0d040', '#e080c0', '#f0f0f0']) : null });
    const uw = ap(4) + 1, uwy = wallTop + ap(2) + 2;
    if (Hh > ap(26) && style !== 'desert' && uwy + uw + 4 < doorTop - 2) windowAt(p, e, cx - (uw >> 1), uwy, uw, uw, frameC, { mullion: true, snow: o.snow });
    // a wall lantern beside the door
    if ((style === 'wood' || style === 'stone' || style === 'port') && r() < 0.5) {
      const lx = dx + dw + ap(2) + 1, ly = doorTop + ap(2);
      p.rect(lx - 1, ly - 1, 3, 1, '#2a2420'); p.rect(lx - 1, ly, 3, ap(3), '#2a2420'); p.rect(lx, ly + 1, 1, ap(3) - 2, '#ffc060');
      e.rect(lx, ly + 1, 1, ap(3) - 2, '#ffd080'); p.rect(lx - 2, ly - 2, 5, 1, '#3a3230');
    }
    // ---- portico (marble)
    if (style === 'marble') {
      for (const fx of [0.06, 0.32, 0.68, 0.94]) column(p, x0 + Math.round(W * fx) - ap(1.5), yb - FH, wH, ap(3) + 1, '#f0e8d8');
      const ex = x0 - ap(2), ew = W + ap(4), ey = wallTop - ap(2);
      const rows = ['#fffaf0', '#e8e0c8', '#c8a050', '#e8e0c8', '#a8a090'];
      rows.forEach((col, j) => p.rect(ex, ey + j, ew, 1, col));
      for (let x = ex + 1; x < ex + ew; x += 3) p.set(x, ey + 3, '#b8b098');
    }
    // ---- roof
    const ry0 = wallTop - RH;
    if (style === 'desert') {
      // flat roof: the top surface with a parapet lip, beam ends below
      fillWall(p, x0 - 1, ry0 + 2, W + 2, RH - 2, light(wallC, 1.12), 'adobe', seed + 1);
      const PH = ap(2);
      p.rect(x0 - 1, ry0, W + 2, PH, dark(wallC, 0.9)); p.rect(x0 - 1, ry0, W + 2, 1, light(wallC, 1.06));
      p.rect(x0 - 1, wallTop - PH, W + 2, PH, dark(wallC, 0.82)); p.rect(x0 - 1, wallTop - PH, W + 2, 1, light(wallC, 1.04));
      p.rect(x0 + 1, ry0 + PH, W - 2, 1, dark(wallC, 0.74)); p.rect(x0 + 1, ry0 + PH, 1, RH - PH * 2, dark(wallC, 0.86));
      p.clear(x0 - 1, ry0); p.clear(x0 + W, ry0);
      for (let x = x0 + ap(3); x < x0 + W - ap(3); x += ap(6)) { p.rect(x, wallTop + 1, 3, 3, '#5a3a24'); p.set(x, wallTop + 1, '#7a5232'); p.set(x + 2, wallTop + 3, '#3a2214'); shadeAt(p, x + 1, wallTop + 4, 0.8); }
      // rooftop clutter: a hatch and a drying rug
      const hx = x0 + ap(4) + Math.floor(r() * (W * 0.3)), hy = ry0 + PH + ap(3);
      if (hy + ap(4) < wallTop - PH - 1) { p.rect(hx, hy, ap(5), ap(4), '#5a3a24'); p.rect(hx + 1, hy + 1, ap(5) - 2, ap(4) - 2, '#1e1410'); p.rect(hx, hy, ap(5), 1, '#7a5232'); }
      if (r() < 0.45) dome(p, e, cx, ry0 + Math.floor(RH * 0.6), Math.min(W, D) * 0.28, r() < 0.3 ? '#d8a040' : pick(['#e0c8a0', '#6a9ab0', '#c8a070']), r() < 0.35);
      else {
        // striped awning over the door with a scalloped hem
        const aw = Math.round(W * 0.7), ax = cx - Math.floor(aw / 2), AH = ap(5), ay = doorTop - ap(6), SW = ap(3);
        const cc = C(pick(S.cloth)), cw = C('#f0e8d8');
        for (let y = 0; y <= AH; y++) for (let x = 0; x < aw; x++) {
          const st = Math.floor(x / SW) % 2, sx = x % SW;
          if (y === AH && (sx === 0 || sx === SW - 1)) continue;
          let col = st ? cc : cw;
          if (y === 0) col = light(col, 1.1); else if (y >= AH - 1) col = dark(col, 0.78); else if (y >= AH - 2) col = shade(col, 0.9);
          if (sx === SW - 1 && y < AH - 1) col = shade(col, 0.92);
          p.set(ax + x, ay + y, col);
        }
        for (let j = 1; j <= ap(2); j++) for (let x = 0; x < aw; x++) shadeAt(p, ax + x, ay + AH + j, 0.78);
        for (const sx of [ax, ax + aw - 2]) { p.rect(sx, ay + AH, 2, yb - FH - ay - AH + 1, '#4a3020'); p.rect(sx, ay + AH, 1, yb - FH - ay - AH + 1, '#6a4a30'); }
      }
    } else {
      const kind = style === 'stone' ? 'slate' : style === 'wood' && r() < 0.3 ? 'thatch' : 'tile';
      const rc = kind === 'thatch' ? mixc(roofC, '#b89850', 0.65) : roofC;
      fillRoof(p, x0 - ov, ry0, W + ov * 2, RH, rc, kind, seed, o.snow ? 0.55 : 0, { ridge: 0.2, moss: !o.snow && (style === 'wood' || style === 'port') ? 0.22 : 0 });
      if (style === 'wood' || style === 'port') for (const vx of [x0 - ov, x0 + W + ov - 2]) { p.rect(vx, ry0 + 1, 2, RH - 1, dark(trim, 1.2)); p.rect(vx, ry0 + 1, 1, RH - 1, light(trim, 1.3)); }
      if (style === 'marble') for (let x = x0 - ov + 1; x < x0 + W + ov - 1; x += ap(3)) { p.rect(x, ry0 + RH - 2, 2, 2, '#e8e0c8'); p.set(x, ry0 + RH - 2, '#fffaf0'); }
      // chimney with its shadow on the roof
      if (style !== 'marble') {
        const chw = ap(5), chh = ap(10);
        const chx = x0 + Math.round(W * (r() < 0.5 ? 0.22 : 0.72)), chy = ry0 + Math.floor(RH * 0.35);
        for (let j = -Math.round(chh * 0.4); j < 4; j++) for (let i = 0; i < 3; i++) shadeAt(p, chx + chw + i, chy + j, 0.74);
        fillWall(p, chx, chy - chh + 1, chw, chh, '#6a6058', 'brick', seed + 5);
        for (let j = 0; j < 2; j++) for (let i = 0; i < chw; i++) shadeAt(p, chx + i, chy - chh + 1 + j, 0.7);
        const cy0 = chy - chh - 2;
        p.rect(chx - 1, cy0, chw + 2, 3, '#4a4038'); p.rect(chx - 1, cy0, chw + 2, 1, o.snow ? '#eef2f8' : '#6a6058'); p.rect(chx + 1, cy0 + 1, chw - 2, 1, '#161012');
        p.rect(chx - 1, chy + 1, chw + 2, 1, dark(roofC, 0.55));
        o.chimney = [chx + (chw >> 1) - p.ox, cy0 - 1 - p.oy];
      }
      if (W >= ap(50) && style !== 'marble') dormer(p, e, cx, ry0 + Math.floor(RH * 0.5), rc, S.trim, style === 'stone' ? C(wallC) : style === 'port' ? C(wallC) : C('#cdbb98'));
      // icicles along the eave
      if (o.snow) for (let x = x0 - ov; x < x0 + W + ov; x++) if (hash2(x, seed, 7) < 0.22) { const L = 1 + Math.floor(hash2(x, 2, seed) * ap(3)); for (let k = 0; k < L; k++) p.set(x, wallTop + k, k === L - 1 ? '#ffffff' : '#c8e0f0'); }
    }
    // ---- things leaning on the wall
    if (r() < 0.65) {
      const kind = style === 'desert' ? 'pots' : style === 'marble' ? null : pick(style === 'port' ? ['barrel', 'crate', 'crate'] : ['barrel', 'crate', 'logs']);
      if (kind) clutter(p, r() < 0.5 ? x0 + ap(2) : x0 + W - ap(2) - ap(9), yb, kind, seed);
    }
    if (o.snow) for (let x = x0 - 1; x <= x0 + W; x++) if (hash2(x, 9, seed) < 0.5) p.set(x, yb - FH + 1, '#eef2f8');
    return done(p, e, { chimney: o.chimney || null, footprint: [w, d] });
  });
}
// fluted column: x = left edge, yb = ground row, h = total height, w = shaft width
function column(p, x, yb, h, w, col) {
  const c = C(col), R4 = [dark(c, 0.7), shade(c, 0.88), c, light(c, 1.1)];
  const capH = ap(2), baseH = ap(2);
  for (let y = yb - h + capH + 1; y <= yb - baseH; y++) for (let i = 0; i < w; i++) {
    const u = (i + 0.5) / w;
    let idx = u < 0.25 ? 3 : u < 0.55 ? 2 : u < 0.8 ? 1 : 0;
    if (w >= 5 && i > 0 && i < w - 1 && i % 2 === 0) idx = Math.max(0, idx - 1);
    p.set(x + i, y, R4[idx]);
  }
  p.rect(x - 1, yb - h + 1, w + 2, capH, R4[3]); p.rect(x - 1, yb - h + capH, w + 2, 1, R4[1]); p.set(x + w, yb - h + 1, R4[2]);
  p.rect(x - 1, yb - baseH + 1, w + 2, baseH, R4[2]); p.rect(x - 1, yb - baseH + 1, w + 2, 1, R4[3]); p.rect(x - 1, yb, w + 2, 1, R4[1]);
}
function dome(p, e, cx, yb, r, col, onion) {
  const R = ramp(col), Rh = r * (onion ? 1.5 : 1), drum = ap(3);
  // drum
  for (let y = yb - drum + 1; y <= yb; y++) for (let x = Math.round(cx - r * 0.9); x <= cx + r * 0.9; x++) {
    const u = (x + 0.5 - cx) / (r * 0.9);
    let c = u < -0.4 ? light(C('#e8d8b8'), 1.04) : u < 0.4 ? C('#d8c8a8') : C('#b0a088');
    if (y === yb - drum + 1) c = light(c, 1.1);
    if (Math.abs(((x - cx) % ap(4) + ap(4)) % ap(4) - ap(2)) < 1 && y > yb - drum + 1) c = '#2a2018';
    p.set(x, y, c);
  }
  const base = yb - drum;
  for (let y = Math.floor(base - Rh); y <= base; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
    const ny = (base - y) / Rh, nx = (x + 0.5 - cx) / r;
    const wdt = onion ? Math.sin(Math.min(1, ny * 1.25) * Math.PI) * 0.9 + (ny < 0.4 ? 0.4 : 0) : Math.sqrt(Math.max(0, 1 - ny * ny));
    if (Math.abs(nx) > wdt) continue;
    const l = -0.6 * nx + 0.55 * ny + (hash2(x, y, 3) - 0.5) * 0.15;
    let c = R[l > 0.45 ? 3 : l > 0 ? 2 : l > -0.4 ? 1 : 0];
    for (let k = -3; k <= 3; k++) if (Math.abs(x + 0.5 - (cx + (k / 4) * wdt * r)) < 0.5 && ny > 0.08 && ny < 0.92) c = dark(c, 0.86);
    if (y === base) c = dark(c, 0.8);
    p.set(x, y, c);
  }
  const tip = Math.floor(base - Rh);
  p.rect(Math.round(cx), tip - ap(3), 1, ap(3), '#d8b050'); p.disc(Math.round(cx) + 0.5, tip - ap(3), 1.6, '#e8c060'); p.set(Math.round(cx), tip - ap(3) - 1, '#fff0a0');
}
function tent(p, e, S, r, W, H, snow) {
  const cc = C(S.cloth[Math.floor(r() * S.cloth.length)]);
  const body = C(S.wall[Math.floor(r() * S.wall.length)]), Rm = ramp(body);
  const cx = p.w / 2, yb = p.h - 1, R0 = W * 0.5, top = Math.round(yb - Math.min(H, W * 0.8));
  const band = top + Math.round((yb - top) * 0.55);
  // guy ropes behind the body
  for (const sd of [-1, 1]) { const ax = cx + sd * R0 * 0.62, ay = band - ap(3); p.line(ax, ay, cx + sd * (R0 + ap(3)), yb, '#a89070'); p.set(Math.round(cx + sd * (R0 + ap(3))), yb, '#3a2a1a'); }
  for (let y = top; y <= yb; y++) {
    const t = (y - top) / (yb - top), half = R0 * Math.sqrt(t) + 1;
    for (let x = Math.floor(cx - half); x <= cx + half; x++) {
      const u = (x + 0.5 - (cx - half)) / (2 * half);
      let col = Rm[u < 0.22 ? 3 : u < 0.6 ? 2 : u > 0.84 ? 0 : 1];
      if (Math.floor(u * 8) % 2) col = shade(col, 0.94);
      const su = u * 8;
      if (Math.abs(su - Math.round(su)) * (2 * half / 8) < 0.5 && u > 0.06 && u < 0.94) col = dark(col, 0.82);
      if (hash2(x, y, 9) < 0.05) col = shade(col, 0.9);
      if (y > yb - ap(3)) col = dark(col, 0.8);
      const dy = y - band;
      if (dy === -1) col = light(cc, 1.12); else if (dy === 0) col = (x + y) % 4 < 2 ? cc : dark(cc, 0.7); else if (dy === 1) col = dark(cc, 0.75);
      if (snow && t < 0.22 + (vnoise(x, 0, 4, ap(3)) - 0.5) * 0.12) col = t > 0.16 ? C('#c0ccdc') : C('#eef2f8');
      p.set(x, y, col);
    }
  }
  // door flap, rolled back to the right
  const dh = ap(14), dwh = ap(4);
  p.poly([[cx - dwh, yb + 1], [cx, yb - dh], [cx + dwh, yb + 1]], '#2a1a12');
  p.poly([[cx - dwh + 2, yb + 1], [cx, yb - dh + ap(4)], [cx + dwh - 2, yb + 1]], '#1a100a');
  p.poly([[cx, yb - dh], [cx + dwh + 2, yb + 1], [cx + dwh - 1, yb + 1]], light(body, 1.18));
  p.line(cx, yb - dh, cx + dwh + 2, yb, light(body, 1.3));
  p.rect(Math.round(cx + dwh - 1), yb - Math.round(dh * 0.45), 3, 1, cc);
  // pole and pennant
  p.rect(Math.round(cx) - 1, top - ap(4), 2, ap(5), '#4a3020'); p.rect(Math.round(cx) - 1, top - ap(4), 1, ap(5), '#6a4a30');
  p.poly([[cx + 1, top - ap(4)], [cx + ap(6), top - ap(2.5)], [cx + 1, top - ap(1)]], cc);
  return done(p, null, { footprint: [W / PPU, W / PPU] });
}
function mushroomHouse(p, e, r, W, Hh) {
  const cx = p.w / 2, yb = p.h - 1;
  const stem = ramp('#e8dcc8'), cap = ramp(['#8a3a9a', '#c04040', '#4a8a9a'][Math.floor(r() * 3)]);
  const sw = W * 0.22;
  for (let y = yb - Hh; y <= yb; y++) {
    const t = (y - (yb - Hh)) / Hh, half = sw * (1 + Math.max(0, t - 0.75) * 0.7);
    for (let x = Math.round(cx - half); x <= cx + half; x++) {
      const u = (x + 0.5 - (cx - half)) / (2 * half);
      let col = stem[u < 0.25 ? 3 : u < 0.62 ? 2 : u < 0.86 ? 1 : 0];
      if (hash2(x, Math.floor(y / 4), 4) < 0.16) col = shade(col, 0.93);
      p.set(x, y, col);
    }
  }
  doorAt(p, Math.round(cx) - ap(3), yb, ap(6), ap(12), '#5a3a24', { arch: true });
  windowAt(p, e, Math.round(cx) + ap(4), yb - Hh + ap(8), ap(3), ap(3), '#5a3a24', { color: C('#c0ff80'), arch: true });
  const cy = yb - Hh, rx = W * 0.6, ry = W * 0.32;
  // gills under the rim
  for (let y = Math.floor(cy); y <= cy + ry * 0.42; y++) for (let x = Math.floor(cx - rx * 0.92); x <= cx + rx * 0.92; x++) {
    const nx = (x + 0.5 - cx) / (rx * 0.92), ny = (y + 0.5 - cy) / (ry * 0.42);
    if (nx * nx + ny * ny > 1 || ny < 0) continue;
    p.set(x, y, Math.round(Math.atan2(ny, nx) * 14) % 2 ? '#a8987e' : '#8a7a64');
  }
  // cap: a lumpy dome lit from the top-left, rim shadow, spots
  const ph = r() * 6;
  for (let y = Math.floor(cy - ry - 2); y <= cy + ry * 0.35; y++) for (let x = Math.floor(cx - rx - 2); x <= cx + rx + 2; x++) {
    const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
    const ang = Math.atan2(ny, nx), edge = 1 + 0.07 * Math.sin(ang * 7 + ph);
    if (ny > 0.35 || nx * nx + ny * ny > edge * edge) continue;
    const l = -0.55 * nx - 0.75 * ny + (hash2(x, y, 2) - 0.5) * 0.12;
    let col = cap[l > 0.55 ? 3 : l > 0 ? 2 : l > -0.4 ? 1 : 0];
    if (ny > 0.22) col = dark(col, 0.82);
    p.set(x, y, col);
  }
  for (let k = 0; k < 8; k++) {
    const sx = cx + (r() - 0.5) * rx * 1.5, sy = cy - r() * ry * 0.75 - 1, s = 1.3 + r() * ap(1.2);
    p.ellipse(sx, sy, s * 1.3, s, '#f4ecec'); p.set(Math.round(sx + s * 0.6), Math.round(sy + s * 0.5), '#c8b8b8'); p.set(Math.round(sx - s * 0.5), Math.round(sy - s * 0.4), '#ffffff');
  }
  return done(p, e, { footprint: [W / PPU, W / PPU] });
}

// ------------------------------------------------------------------ town kit
function goods(p, x, y, kind, r) {
  if (kind === 'fruit') {
    const g = C(['#c04030', '#e08a30', '#60a040', '#d8c040'][Math.floor(r() * 4)]);
    for (let k = 0; k < 5; k++) { const fx = x + (k % 3) * 3 + (k >= 3 ? 1.5 : 0), fy = y - (k >= 3 ? 3 : 0); p.disc(fx + 1.5, fy - 1, 1.8, g); p.set(fx + 1, fy - 2, light(g, 1.35)); p.set(fx + 2, fy, dark(g, 0.7)); }
  } else if (kind === 'bread') {
    for (let k = 0; k < 2; k++) { p.ellipse(x + 3 + k * 5, y - 2, 3, 2, '#c8904a'); p.rect(x + 1 + k * 5, y - 3, 4, 1, '#e0b070'); p.set(x + 3 + k * 5, y - 2, '#8a5a2a'); }
  } else if (kind === 'jars') {
    for (let k = 0; k < 3; k++) { const c = C(['#a86a42', '#6a8aa0', '#c8b890'][k]); p.rect(x + k * 4, y - 5, 3, 5, c); p.set(x + k * 4, y - 5, light(c, 1.3)); p.rect(x + k * 4, y - 6, 3, 1, dark(c, 0.7)); p.rect(x + k * 4 + 2, y - 4, 1, 4, dark(c, 0.8)); }
  } else if (kind === 'cloth') {
    for (let k = 0; k < 3; k++) { const c = C(['#8a2a6a', '#2a6a8a', '#c8a040', '#4a8a3a'][Math.floor(r() * 4)]); p.rect(x, y - 3 - k * 2, 11 - k, 2, c); p.rect(x, y - 3 - k * 2, 11 - k, 1, light(c, 1.2)); p.set(x + 10 - k, y - 2 - k * 2, dark(c, 0.6)); }
  } else {
    for (let k = 0; k < 3; k++) { p.ellipse(x + 3 + k * 3, y - 1 - (k % 2), 3, 1.2, '#a8b0b8'); p.set(x + 1 + k * 3, y - 1 - (k % 2), '#e0e8f0'); p.set(x + 6 + k * 3, y - 1 - (k % 2), '#6a7078'); }
  }
}
export function stallSprite(cloth, seed = 0) {
  return memo('stall' + cloth + seed, () => {
    const W = ap(30), H = ap(26);
    const p = mk(W, H), e = mk(W, H);
    const c = C(cloth), r = srand(seed + 5), yb = H - 1;
    const px0 = ap(2), px1 = W - ap(2) - 2, awY = ap(1) + 1, AH = ap(6), ctop = ap(15);
    // shadowed back of the booth with a shelf of wares
    p.rect(px0 + 2, awY + AH, px1 - px0 - 2, ctop - awY - AH, '#3a2a22');
    p.rect(px0 + 2, awY + AH + ap(4), px1 - px0 - 2, 2, '#6a4a30'); p.rect(px0 + 2, awY + AH + ap(4), px1 - px0 - 2, 1, '#8a6440');
    for (let x = px0 + 4; x < px1 - 4; x += 5) { const jc = C(['#a86a42', '#6a8aa0', '#c8b890', '#7a5a8a'][Math.floor(r() * 4)]); p.rect(x, awY + AH + ap(4) - 4, 3, 4, jc); p.set(x, awY + AH + ap(4) - 4, light(jc, 1.25)); }
    for (const x of [px0, px1]) { p.rect(x, awY + 2, 2, yb - awY - 3, '#4a3020'); p.rect(x, awY + 2, 1, yb - awY - 3, '#6a4a30'); }
    // counter: top board, plank front with a hanging cloth, dark base
    p.rect(ap(1), ctop, W - 2 * ap(1), 1, '#a8885a'); p.rect(ap(1), ctop + 1, W - 2 * ap(1), 1, '#8a6a44'); p.rect(ap(1), ctop + 2, W - 2 * ap(1), 1, '#5a3e24');
    fillWall(p, ap(2), ctop + 3, W - 2 * ap(2), yb - ctop - 4, '#7a5a38', 'plank', seed);
    p.rect(ap(2), yb - 1, W - 2 * ap(2), 2, '#3a2a1a');
    const dw = Math.round(W * 0.5), dx0 = (W - dw) >> 1;
    for (let j = 0; j < ap(6); j++) for (let i = 0; i < dw; i++) {
      if (j === ap(6) - 1 && i % 2) continue;
      const fold = Math.sin(i * 0.9);
      let col = fold > 0.4 ? light(c, 1.1) : fold < -0.5 ? dark(c, 0.78) : c;
      if (j === 0) col = light(c, 1.2); else if (j >= ap(6) - 2) col = dark(col, 0.85);
      p.set(dx0 + i, ctop + 3 + j, col);
    }
    // wares on the counter
    const kinds = ['fruit', 'bread', 'jars', 'cloth', 'fish'];
    for (let x = ap(3), k = 0; x < W - ap(9); x += 13, k++) goods(p, x, ctop - 1, kinds[(seed + k + Math.floor(r() * 2)) % kinds.length], r);
    // striped awning with a scalloped valance
    const SW = ap(3);
    for (let y = 0; y <= AH; y++) for (let x = 0; x < W - 2; x++) {
      const st = Math.floor(x / SW) % 2, sx = x % SW;
      if (y === AH && (sx === 0 || sx === SW - 1)) continue;
      let col = st ? c : C('#f0e8d8');
      if (y === 0) col = light(col, 1.2); else if (y >= AH - 1) col = dark(col, 0.72); else if (y > AH * 0.6) col = shade(col, 0.9);
      if (sx === SW - 1 && y < AH - 1) col = shade(col, 0.92);
      p.set(1 + x, awY + y, col);
    }
    for (let j = 1; j <= 2; j++) for (let x = px0 + 2; x < px1; x++) shadeAt(p, x, awY + AH + j, 0.7);
    return done(p, e);
  });
}
// braziers: bowl on legs; flames are drawn live by the structure (animated)
export function brazierSprite(big = 1) {
  return memo('brazier' + big, () => {
    const s = big * ART;
    const p = mk(Math.round(14 * s) + 6, Math.round(16 * s) + 6);
    const cx = p.w / 2, yb = p.h - 1;
    const I = ramp('#4a4448');
    const by = yb - 8 * s, lw = Math.max(1, Math.round(0.8 * s));
    for (const dx of [0, -3, 3]) {
      p.line(cx + dx * s, yb - 1, cx + dx * s * 0.6, by + 1, dx === 0 ? I[0] : I[1], lw);
      if (dx) { p.rect(Math.round(cx + dx * s) - 1, yb - 1, 3, 2, I[1]); p.set(Math.round(cx + dx * s) - 1, yb - 1, I[2]); }
    }
    p.line(cx - 2.2 * s, yb - 3.6 * s, cx + 2.2 * s, yb - 3.6 * s, I[1]);
    // bowl
    for (let y = Math.floor(by); y <= by + 3 * s; y++) for (let x = Math.floor(cx - 5.6 * s); x <= cx + 5.6 * s; x++) {
      const nx = (x + 0.5 - cx) / (5.6 * s), ny = (y + 0.5 - by) / (3 * s);
      if (nx * nx + ny * ny > 1 || ny < 0) continue;
      let col = I[nx < -0.45 ? 3 : nx < 0.15 ? 2 : nx < 0.6 ? 1 : 0];
      if (y === Math.round(by + 1.3 * s)) col = (x % 3 === 0) ? I[3] : I[0];
      p.set(x, y, col);
    }
    p.ellipse(cx, by, 5.6 * s, 1.8 * s, I[2]);
    for (let x = Math.floor(cx - 5.6 * s); x <= cx + 5.6 * s; x++) for (let y = Math.floor(by - 1.8 * s); y < by; y++) if (p.a(x, y)) p.set(x, y, I[3]);
    // glowing coals
    const e = new Pix(p.w, p.h); e.ox = p.ox; e.oy = p.oy;
    for (let y = Math.floor(by - 1.3 * s); y <= by + 1.2 * s; y++) for (let x = Math.floor(cx - 4.6 * s); x <= cx + 4.6 * s; x++) {
      const nx = (x + 0.5 - cx) / (4.6 * s), ny = (y + 0.5 - (by - 0.3 * s)) / (1.25 * s);
      if (nx * nx + ny * ny > 1) continue;
      const n = hash2(x, y, 7);
      const col = n < 0.18 ? C('#4a2020') : n > 0.8 ? C('#ffe090') : C('#ff8030');
      p.set(x, y, col);
      if (n >= 0.18) e.set(x, y, n > 0.8 ? '#ffd080' : '#ff9030');
    }
    return done(p, e, { fireAt: [0, -Math.round(9 * s)] });
  });
}
export function lampSprite(color = '#ffc060') {
  return memo('lamp' + color, () => {
    const W = ap(9) | 1, H = ap(40);
    const p = mk(W, H), e = mk(W, H);
    const cx = W >> 1, yb = H - 1, lc = C(color);
    // post: 3 px, lit left; stone foot
    p.rect(cx - 1, ap(9), 3, yb - ap(9) - 2, '#3a2a1a'); p.rect(cx - 1, ap(9), 1, yb - ap(9) - 2, '#5a4028'); p.rect(cx + 1, ap(9), 1, yb - ap(9) - 2, '#2a1c12');
    p.rect(cx - 3, yb - 3, 7, 4, '#5a5450'); p.rect(cx - 3, yb - 3, 7, 1, '#7a7470'); p.rect(cx - 2, yb - 5, 5, 2, '#4a4440'); p.rect(cx - 2, yb - 5, 5, 1, '#6a6460');
    // lantern: cap, glass cage, base
    const ly = ap(2) + 1, lh = ap(5);
    p.poly([[cx - 4.5, ly], [cx + 5.5, ly], [cx + 3.5, ly - 3], [cx - 2.5, ly - 3]], '#2a2420'); p.rect(cx - 2, ly - 3, 4, 1, '#4a4038');
    p.rect(cx, ly - 5, 1, 2, '#2a2420'); p.set(cx, ly - 6, '#d8b050');
    p.rect(cx - 3, ly, 7, lh + 2, '#2a2420');
    p.rect(cx - 2, ly + 1, 5, lh, lc); e.rect(cx - 2, ly + 1, 5, lh, lc);
    p.rect(cx, ly + 1, 1, lh, '#3a3028'); e.clear(cx, ly + 1); for (let j = 0; j < lh; j++) e.clear(cx, ly + 1 + j);
    p.set(cx - 1, ly + 3, '#fff8e0'); e.set(cx - 1, ly + 3, '#fff8e0'); e.set(cx + 1, ly + 3, light(lc, 1.3)); e.set(cx - 1, ly + 4, light(lc, 1.3));
    p.rect(cx - 3, ly + lh + 1, 7, 1, '#4a4038'); p.rect(cx - 2, ly + lh + 2, 5, 1, '#2a2420');
    return done(p, e, { lightAt: [0, -(yb - ly - 3)] });
  });
}
// Fountain: a round stone basin (block wall + rim), rippling water, a column with a bowl and
// falling water arcs. basinAt is the rim centre relative to the pivot (front-bottom of the basin).
export function fountainSprite(r = 3, stone = '#e0d8c4', frame = 0) {
  return memo('fountain' + r + stone + frame, () => {
    const R = Math.round(r * PPU), ry = Math.round(R * 0.48), hw = ap(5), RW = ap(3);
    const colH = ap(22), n = R * 2 + ap(8);
    const p = mk(n, ry * 2 + hw + colH + ap(14)), e = mk(p.w, p.h);
    const cx = p.w / 2, yb = p.h - 1, cy = yb - ry - hw;
    const S = ramp(stone);
    // outer wall
    for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
      const nx = (x + 0.5 - cx) / R; if (Math.abs(nx) > 1) continue;
      const yf = cy + ry * Math.sqrt(1 - nx * nx);
      const seg = Math.floor((Math.asin(nx) / Math.PI + 0.5) * 12), segL = Math.floor((Math.asin(clamp((x - 0.5 - cx) / R, -1, 1)) / Math.PI + 0.5) * 12);
      for (let y = Math.floor(cy); y <= yf + hw; y++) {
        const ly = y - yf;
        let col = S[nx < -0.5 ? 3 : nx < 0.2 ? 2 : nx < 0.7 ? 1 : 0];
        if (seg !== segL && ly > 0) col = dark(col, 0.78);
        if (Math.round(ly) === Math.round(hw / 2)) col = dark(col, 0.86);
        if (ly > hw - 1.5) col = dark(col, 0.72);
        p.set(x, y, col);
      }
    }
    // rim ring + inner back wall
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - R - 1); x <= cx + R + 1; x++) {
      const nx = (x + 0.5 - cx) / R, ny = (y + 0.5 - cy) / ry;
      const d = nx * nx + ny * ny;
      if (d > 1) continue;
      const ix = (x + 0.5 - cx) / (R - RW), iy = (y + 0.5 - cy) / (ry - RW * 0.6);
      if (ix * ix + iy * iy <= 1) continue;
      const a = Math.atan2(ny, nx), seg = Math.round(((a / Math.PI) * 9 + 18) * 1);
      let col = ny < 0 ? S[2] : S[3];
      if (Math.abs((a / Math.PI) * 9 - Math.round((a / Math.PI) * 9)) < 0.08) col = S[1];
      if (d > 0.9 && ny > 0) col = S[2];
      if (hash2(x, y, seg) < 0.05) col = shade(col, 0.92);
      p.set(x, y, col);
    }
    // water: inner back wall in shade, then the surface with ripples
    const wr = R - RW, wry = ry - RW * 0.6;
    for (let y = Math.floor(cy - wry); y <= cy + wry; y++) for (let x = Math.floor(cx - wr); x <= cx + wr; x++) {
      const nx = (x + 0.5 - cx) / wr, ny = (y + 0.5 - cy) / wry;
      const d = nx * nx + ny * ny;
      if (d > 1) continue;
      const wy = (y + 0.5 - cy - 2) / (wry - 2);
      let col;
      if (nx * nx + wy * wy > 1) col = S[0];
      else col = C(d < 0.35 ? '#2e6a80' : d > 0.8 ? '#4a8aa0' : '#3a7a90');
      p.set(x, y, col);
    }
    for (let k = 0; k < 3; k++) {
      const rr = ((k * 0.33 + frame * 0.083) % 1) * 0.85 + 0.15;
      for (let a = 0; a < Math.PI * 2; a += 0.09) {
        if (Math.sin(a * 5 + k * 2 + frame) < -0.3) continue;
        const x = Math.round(cx + Math.cos(a) * (wr - 2) * rr), y = Math.round(cy + 2 + Math.sin(a) * (wry - 3) * rr);
        if (p.get(x, y)?.[2] > 120 && p.get(x, y)?.[0] < 100) p.set(x, y, rr > 0.7 ? '#5a9ab0' : '#7ac0d4');
      }
    }
    for (let k = 0; k < 10; k++) { const a = hash2(k, frame, 3) * 6.283, d = 0.3 + hash2(k, frame, 4) * 0.6; const x = cx + Math.cos(a) * wr * d, y = cy + 2 + Math.sin(a) * (wry - 3) * d; if (p.get(Math.round(x), Math.round(y))?.[0] < 100) p.set(x, y, '#c0f0ff'); }
    // column, bowl and spout
    const ct = Math.round(cy) - colH, CW = ap(4) + 1, cl = Math.round(cx) - (CW >> 1);
    for (let y = ct; y <= cy + 1; y++) for (let i = 0; i < CW; i++) p.set(cl + i, y, S[i === 0 ? 3 : i < CW * 0.5 ? 2 : i < CW - 1 ? 1 : 0]);
    p.rect(cl - 1, Math.round(cy) - 2, CW + 2, 3, S[2]); p.rect(cl - 1, Math.round(cy) - 2, CW + 2, 1, S[3]);
    const bry = ap(2), brx = ap(6);
    p.ellipse(cx, ct + 1, brx, bry + 1, S[0]); p.ellipse(cx, ct, brx, bry, S[3]); p.ellipse(cx, ct, brx - 2, bry - 1, '#4a8aa0');
    const st = ct - ap(4);
    p.rect(Math.round(cx) - 1, st, 3, ct - st, S[2]); p.rect(Math.round(cx) - 1, st, 1, ct - st, S[3]); p.disc(Math.round(cx) + 0.5, st, 2, S[3]);
    // water: a short jet, then arcs falling from the bowl into the basin
    const wc = C('#c0f0ff'), wd = C('#80c8e0');
    for (let k = 1; k <= ap(3); k++) if ((k + frame) % 3) { p.set(Math.round(cx), st - k, wc); e.set(Math.round(cx), st - k, '#60b0d0'); }
    for (const sd of [-1, 1]) for (let k = 0; k <= 14; k++) {
      const t = k / 14, x = cx + sd * (brx - 1 + t * ap(9)), y = ct + 1 + t * t * (cy - ct + 2);
      if ((k + frame) % 4 === 0) continue;
      p.set(x, y, wc); p.set(x + sd, y + 1, wd); e.set(x, y, '#60b0d0');
      if (k === 14) { p.set(x - 1, y - 1, wc); p.set(x + 1, y - 1, wc); }
    }
    return done(p, e, { basinAt: [0, Math.round(cy) - yb] });
  });
}
export function bannerSprite(color, h = 7, frame = 0) {
  return memo('banner' + color + h + frame, () => {
    const H = Math.round(h * PPU * 0.75);
    const p = mk(ap(18), H + ap(4));
    const c = C(color), Rm = [dark(c, 0.58), dark(c, 0.8), c, light(c, 1.16)];
    const px = ap(4) - 1, y0 = ap(2) + 1, gold = C('#d8b050');
    p.rect(px, y0, 2, H, '#4a3020'); p.rect(px, y0, 1, H, '#6a4a30');
    p.disc(px + 1, y0 - 1, 1.8, gold); p.set(px, y0 - 2, '#fff0a0');
    const cw = ap(10), cl = px + 3, by = y0 + ap(2);
    p.rect(px + 2, by, cw + 3, 2, '#5a3a24'); p.rect(px + 2, by, cw + 3, 1, '#7a5a38'); p.set(px + cw + 4, by, gold); p.set(px + cw + 4, by + 1, gold);
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
        if (j === 0 || j === 1) col = j ? gold : light(gold, 1.1);
        p.set(cl + i + sw, y, col);
      }
    }
    // emblem: a gold lozenge with a dark heart
    const ey = by + 2 + ap(4) + 2, ex = cl + (cw >> 1);
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const m = Math.abs(dx) + Math.abs(dy);
      if (m > 3) continue;
      p.set(ex + dx + sway(ey + dy - by - 2), ey + dy, m <= 1 ? dark(c, 0.5) : dx + dy < 0 ? light(gold, 1.15) : gold);
    }
    return done(p, null);
  });
}
// battlement merlons along a wall top
function merlons(p, x0, w, y, color, snow) {
  const c = C(color), mw = ap(3), mh = ap(3);
  for (let x = x0 + ap(1); x + mw <= x0 + w; x += ap(6)) for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) {
    let col = j < 2 ? light(c, j ? 1.12 : 1.22) : light(c, 1.04);
    if (i === 0) col = light(col, 1.06); else if (i === mw - 1) col = dark(col, 0.82);
    if (snow && j === 0) col = C('#eef2f8');
    p.set(x + i, y + j, col);
  }
}
// curtain wall segment (width in px) / round tower
export function wallSprite(wpx, color, h = 4.2, seed = 0, snow = false) {
  return memo('wall' + wpx + color + h + seed + snow, () => {
    const H = Math.round(h * PPU * 0.8), T = ap(9);
    const p = mk(wpx + 2, H + T + ap(4));
    const x0 = 1, yb = p.h - 1;
    fillWall(p, x0, yb - H + 1, wpx, H, color, 'block', seed);
    fillWall(p, x0, yb - H - T + 1, wpx, T, light(color, 1.15), 'block', seed + 3);
    p.rect(x0, yb - H - T + 1, wpx, 1, dark(color, 0.8));
    merlons(p, x0, wpx, yb - H - T - 2, light(color, 1.05), snow);
    if (snow) for (let x = x0; x < x0 + wpx; x++) if (hash2(x, 1, seed) < 0.7) { p.set(x, yb - H - T + 2, '#eef2f8'); p.set(x, yb - H + 1, '#eef2f8'); }
    return done(p, null);
  });
}
export function towerSprite(r, h, color, roof, seed = 0, flat = false) {
  return memo('tower' + r + h + color + roof + flat, () => {
    const R = Math.round(r * PPU), H = Math.round(h * PPU * 0.75);
    const p = mk(R * 2 + ap(6), H + R + ap(26)), e = mk(p.w, p.h);
    const cx = p.w / 2, yb = p.h - 1, c = C(color);
    const Rm = [dark(c, 0.62), dark(c, 0.82), c, light(c, 1.12)];
    const blk = (u) => (Math.asin(clamp(u, -1, 1)) / Math.PI + 0.5) * 9;
    for (let y = yb - H; y <= yb; y++) for (let x = Math.round(cx - R); x < cx + R; x++) {
      const u = (x + 0.5 - cx) / R, sh = -u * 0.55 + 0.15;
      const ly = yb - y, row = Math.floor(ly / KR), ry = ly % KR;
      let col = Rm[sh > 0.36 ? 3 : sh > 0 ? 2 : sh > -0.32 ? 1 : 0];
      const off = (row % 2) * 0.5;
      const b = Math.floor(blk(u) + off), bl = Math.floor(blk((x - 0.5 - cx) / R) + off);
      col = shade(col, 0.93 + hash2(b, row, seed + 3) * 0.12);
      if (ry === 0 || b !== bl) col = dark(col, 0.76); else if (ry === KR - 1) col = light(col, 1.05);
      if (ly < ap(3)) col = dark(col, 0.86);
      p.set(x, y, col);
    }
    // corbel band under the top
    const ty = yb - H;
    for (let x = Math.round(cx - R); x < cx + R; x++) for (let j = 1; j <= 2; j++) { const on = Math.floor((x - cx + 64) / 3) % 2; shadeAt(p, x, ty + j, on ? 0.72 : 1.0); }
    windowAt(p, e, Math.round(cx) - 1, yb - Math.round(H * 0.6), 3, ap(4) + 1, dark(color, 0.6), { arch: true });
    windowAt(p, e, Math.round(cx - R * 0.5) - 1, yb - Math.round(H * 0.32), 2, ap(3), dark(color, 0.6), { arch: true });
    if (flat) {
      // walk-top behind a ring of merlons
      const ery = R * 0.45;
      p.ellipse(cx, ty, R + 1, ery + 1, light(c, 1.2));
      p.ellipse(cx, ty, R - 2, ery - 1.5, dark(c, 0.78));
      p.ellipse(cx, ty + 1, R - 3, ery - 2.5, dark(c, 0.88));
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2, mx = Math.round(cx + Math.cos(a) * R) - 1, my = Math.round(ty + Math.sin(a) * ery);
        const mc = Math.sin(a) > 0 ? light(c, 1.08) : light(c, 1.0);
        p.rect(mx, my - 3, 3, 4, mc); p.rect(mx, my - 3, 3, 1, light(c, 1.25)); p.set(mx + 2, my, dark(c, 0.8));
      }
    } else {
      // conical tiled roof with an eave and a pennant
      const rc = C(roof), tip = ty - R - ap(14), RT = ap(2) + 1;
      for (let y = tip; y <= ty + ap(2); y++) {
        const t = (y - tip) / (ty + ap(2) - tip), half = (R + ap(2)) * t;
        for (let x = Math.floor(cx - half); x <= cx + half; x++) {
          const u = (x + 0.5 - cx) / Math.max(1, half);
          let col = u < -0.45 ? light(rc, 1.14) : u < 0.1 ? rc : u < 0.55 ? dark(rc, 0.84) : dark(rc, 0.68);
          const ly = ty + ap(2) - y;
          if (ly % RT === 0) col = dark(col, 0.74);
          else if ((Math.floor((u + 1) * half * 0.5) + Math.floor(ly / RT)) % 3 === 0) col = shade(col, 0.9);
          if (y >= ty + ap(2) - 1) col = dark(rc, 0.58);
          p.set(x, y, col);
        }
      }
      p.rect(Math.round(cx), tip - ap(4), 1, ap(4), '#3a3030'); p.set(Math.round(cx), tip - ap(4) - 1, '#d8b050');
      p.poly([[cx + 1, tip - ap(4)], [cx + ap(5), tip - ap(3)], [cx + 1, tip - ap(2)]], '#a02a20');
    }
    void seed;
    return done(p, e);
  });
}
export function pierSprite(len, wid) {
  return memo('pier' + len + wid, () => {
    const p = mk(wid, len); p.oy = len - 1;
    const c = C('#7a5a3a'), BH = ap(3);
    for (let y = 0; y < len; y++) for (let x = 0; x < wid; x++) {
      const row = Math.floor(y / BH), ry = y % BH;
      let col;
      if (ry === BH - 1) col = C('#2a2420');
      else {
        col = shade(c, 0.88 + hash2(row, 1, 4) * 0.18);
        if (ry === 0) col = light(col, 1.08);
        if (hash2(x >> 2, y, 7) < 0.1) col = shade(col, 0.9);
        if (ry === 1 && (x === 2 || x === wid - 3)) col = C('#3a3030');
      }
      if (x < 2 || x >= wid - 2) col = x === 0 ? C('#6a4a30') : C('#4a3020');
      p.set(x, y, col);
    }
    return done(p, null);
  });
}
export function boatSprite(color = '#5a3a24', sail = '#e8e0d0') {
  return memo('boat' + color + sail, () => {
    const W = ap(46), H = ap(70);
    const p = mk(W, H);
    const c = C(color), Rc = ramp(color), cx = W >> 1, yb = H - 1;
    // rigging behind the sail
    const mt = yb - ap(66);
    p.line(cx + 1, mt + 2, cx - ap(18), yb - ap(15), '#3a3030'); p.line(cx + 1, mt + 2, cx + ap(17), yb - ap(15), '#3a3030');
    // hull
    const hy = yb - ap(12), hrx = ap(19), hry = ap(8);
    p.ellipse(cx, yb - ap(10), ap(20), ap(9), Rc[0]);
    p.ellipse(cx, hy, hrx, hry, Rc[1]);
    for (let k = 1; k <= 3; k++) for (let x = cx - hrx; x <= cx + hrx; x++) {
      const nx = (x + 0.5 - cx) / hrx; if (Math.abs(nx) > 0.98) continue;
      const y = Math.round(hy + Math.sqrt(1 - nx * nx) * (hry - 1) + k * 2 - 1);
      if (p.a(x, y)) p.set(x, y, dark(Rc[1], 0.78));
    }
    p.ellipse(cx, hy - 1, ap(16), ap(5.5), Rc[3]);
    p.ellipse(cx, hy - 1, ap(15), ap(4.5), Rc[2]);
    for (let x = cx - ap(14); x < cx + ap(14); x += 4) for (let y = hy - ap(4); y <= hy + ap(3); y++) if (p.get(x, y)?.[0] === Rc[2][0]) p.set(x, y, dark(Rc[2], 0.84));
    for (const tx of [-ap(8), ap(6)]) { p.rect(cx + tx - 1, hy - ap(4) + 1, 3, ap(8) - 1, Rc[1]); p.rect(cx + tx - 1, hy - ap(4) + 1, 1, ap(8) - 1, Rc[3]); }
    // mast + boom
    p.rect(cx, mt, 3, hy - mt, '#4a3020'); p.rect(cx, mt, 1, hy - mt, '#6a4a30');
    p.rect(cx + 2, yb - ap(26), ap(14), 2, '#5a3a24');
    // sail with seams and a soft billow
    const s = C(sail), S4 = [dark(s, 0.7), dark(s, 0.86), s, light(s, 1.06)];
    const sy0 = yb - ap(62), sy1 = yb - ap(26);
    for (let y = sy0; y < sy1; y++) {
      const t = (y - sy0) / (sy1 - sy0), half = ap(4) + t * ap(12), bil = Math.sin(t * Math.PI) * 2;
      for (let x = Math.round(cx + 3); x < cx + 3 + half + bil; x++) {
        const u = (x - cx - 3) / (half + bil);
        let col = S4[u < 0.25 ? 3 : u < 0.65 ? 2 : u < 0.88 ? 1 : 0];
        if ((y - sy0) % ap(4) === 0) col = dark(col, 0.88);
        p.set(x, y, col);
      }
    }
    p.rect(cx + ap(6), sy0 + ap(14), 4, 3, mixc(s, '#a08060', 0.3));
    p.poly([[cx + 1, mt], [cx + ap(6), mt + 2], [cx + 1, mt + 4]], '#a03020');
    return done(p, null);
  });
}

// ------------------------------------------------------------------ site pieces
const GLYPH = [['010', '111', '010', '101', '010'], ['110', '011', '010', '110', '011'], ['111', '100', '111', '001', '111'], ['101', '111', '101', '010', '010'], ['011', '010', '111', '010', '110']];
export function waystoneSprite(active) {
  return memo('waystone' + active, () => {
    const W = ap(26), H = ap(64);
    const p = mk(W, H), e = mk(W, H);
    const cx = W >> 1, yb = H - 1;
    const st = C('#4a4a52'), SR = [dark(st, 0.6), dark(st, 0.8), st, light(st, 1.22)];
    // plinth: two round steps of fitted stone
    p.ellipse(cx, yb - ap(3), ap(12), ap(4), '#4a4440');
    p.ellipse(cx, yb - ap(4), ap(12), ap(3.6), '#6a6460');
    p.ellipse(cx, yb - ap(5), ap(9), ap(2.6), '#5a5450');
    p.ellipse(cx, yb - ap(5.6), ap(9), ap(2.2), '#7a7470');
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; const x = Math.round(cx + Math.cos(a) * ap(10.5)), y = Math.round(yb - ap(4) + Math.sin(a) * ap(3.1)); if (Math.sin(a) > -0.2) p.set(x, y, '#3e3834'); }
    // obelisk: two visible faces split by a lit arris
    const sTop = yb - ap(46), sBot = yb - ap(5);
    for (let y = sTop; y <= sBot; y++) {
      const t = (y - sTop) / (sBot - sTop), half = ap(3) + t * ap(2.5);
      for (let x = Math.round(cx - half); x <= cx + half; x++) {
        const u = (x + 0.5 - cx) / half;
        let col = u < -0.7 ? SR[3] : u < -0.05 ? SR[2] : u < 0.12 ? light(SR[2], 1.1) : u < 0.75 ? SR[1] : SR[0];
        if (hash2(x, y, 5) < 0.06) col = shade(col, 0.88);
        if (t > 0.86 && hash2(x, y, 6) < 0.35 * (t - 0.86) / 0.14 * 2) col = mixc(col, '#4a6a3a', 0.6);
        p.set(x, y, col);
      }
    }
    p.poly([[cx - ap(3) - 0.5, sTop + 1], [cx + 0.5, sTop - ap(8)], [cx + ap(3) + 1.5, sTop + 1]], SR[1]);
    p.poly([[cx - ap(3) - 0.5, sTop + 1], [cx + 0.5, sTop - ap(8)], [cx + 0.5, sTop + 1]], SR[3]);
    // runes
    const rc = active ? C('#80c8ff') : SR[0];
    for (let k = 0; k < 5; k++) {
      const g = GLYPH[k], gy = yb - ap(41) + k * ap(7), gx = cx - 1;
      for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j][i] === '1') {
        p.set(gx + i - 1, gy + j, rc);
        if (active) e.set(gx + i - 1, gy + j, j === 0 || i === 0 ? '#c0e8ff' : '#80c8ff');
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
    const p = mk(w + 2, h + 2), c = C(color);
    const cx = (w + 2) / 2, ym = h * 0.42 + 1, T = [cx, 1], Rt = [w + 0.6, ym], Bt = [cx, h + 1], L = [1.4, ym], M = [cx - 0.5, ym];
    p.poly([T, Rt, M], c);
    p.poly([T, M, L], light(c, 1.35));
    p.poly([L, M, Bt], shade(c, 0.86));
    p.poly([M, Rt, Bt], dark(c, 0.62));
    p.line(cx - 1, 3, cx - 1, ym, '#ffffff');
    p.set(Math.round(cx - 2), Math.round(ym - 1), '#ffffff');
    p.line(Math.round(cx), Math.round(ym + 1), Math.round(cx), h - 1, light(c, 1.1));
    p.outline(dark(c, 0.4));
    return { pix: p, emis: p };
  });
}
// dungeon mouths by theme
export function entranceSprite(theme, biome, glowC) {
  return memo('ent' + theme + biome, () => {
    const r = srand(theme.length * 97 + 5);
    const W = ap(110), H = ap(96);
    const p = mk(W, H), e = mk(W, H);
    const cx = W >> 1, yb = H - 1, g = C(glowC);
    const masonry = ['cursed_crypt', 'marble_vault', 'frozen_citadel', 'dwarven_deephall'];
    let doorW = ap(26), doorH = ap(32), doorY = yb - ap(4);
    let rim = null, rimW = 0, inner = 'stairs';
    const torch = (x, y) => {
      p.rect(x - 1, y, 3, ap(5), '#3a3030'); p.rect(x - 1, y, 1, ap(5), '#5a4a40'); p.rect(x - 2, y - 1, 5, 2, '#2a2420');
      for (let j = 0; j < ap(4); j++) for (let i = -2; i <= 2; i++) {
        if (Math.abs(i) > 2 - j * 0.5) continue;
        const col = j < 2 && Math.abs(i) < 2 ? '#fff0b0' : glowC;
        p.set(x + i, y - 2 - j, col); e.set(x + i, y - 2 - j, col);
      }
    };
    if (masonry.includes(theme)) {
      const wallC = theme === 'marble_vault' ? '#e0d8c4' : theme === 'frozen_citadel' ? '#a8b8c8' : theme === 'dwarven_deephall' ? '#6a6058' : '#5a5860';
      const roofC = theme === 'marble_vault' ? '#c8a050' : '#3a3a44';
      const WR = ramp(wallC);
      // facade
      const fx = cx - ap(34), fw = ap(68), ft = yb - ap(62);
      fillWall(p, fx, ft, fw, yb - ap(8) - ft, wallC, theme === 'marble_vault' ? 'marble' : 'block', 3);
      p.rect(fx, yb - ap(8) - 2, fw, 2, WR[1]); p.rect(fx, yb - ap(8) - 2, fw, 1, WR[3]);
      // pyramid roof
      const rt = yb - ap(82), rbm = yb - ap(62), rc = C(roofC);
      for (let y = rt; y <= rbm; y++) {
        const t = (y - rt) / (rbm - rt), half = ap(4) + t * ap(34);
        for (let x = Math.floor(cx - half); x <= cx + half; x++) {
          const u = (x + 0.5 - cx) / half;
          let col = u < 0 ? light(rc, 1.1) : rc;
          if ((rbm - y) % 3 === 0) col = dark(col, 0.78);
          else if (Math.floor((x - cx + 64) / ap(3)) % 2 && (rbm - y) % 6 < 3) col = shade(col, 0.92);
          if (Math.abs(u) > 1 - 1.6 / half) col = dark(rc, 0.62);
          if (Math.abs(x + 0.5 - cx) < 0.6) col = u < 0 ? light(rc, 1.25) : dark(rc, 0.7);
          p.set(x, y, col);
        }
      }
      p.rect(Math.round(cx), rt - ap(3), 1, ap(3), theme === 'marble_vault' ? '#e8c060' : '#2a2a30');
      // cornice with dentils
      const cy0 = yb - ap(63);
      p.rect(cx - ap(36), cy0, ap(72), ap(3), light(wallC, 1.15)); p.rect(cx - ap(36), cy0, ap(72), 1, light(wallC, 1.3));
      for (let x = cx - ap(36) + 1; x < cx + ap(36); x += 3) p.set(x, cy0 + 3, WR[0]);
      p.rect(cx - ap(36), cy0 + ap(3), ap(72), 1, WR[1]);
      for (const sx of [-1, 1]) column(p, cx + sx * ap(24) - ap(2.5), yb - ap(8), ap(52), ap(5), light(wallC, 1.1));
      // steps (back first so the lower, wider ones sit in front)
      for (let i = 2; i >= 0; i--) {
        const sw = ap(44) - i * ap(4), sx = cx - (sw >> 1), sy = yb - 3 - i * 3 - 2;
        for (let j = 0; j < 5; j++) for (let x = sx; x < sx + sw; x++) {
          let col = j < 2 ? (j ? WR[3] : light(WR[3], 1.06)) : j === 4 ? WR[0] : WR[1];
          if (j >= 2 && (x - sx + i * 5) % ap(8) === 0) col = WR[0];
          p.set(x, sy + j, col);
        }
      }
      for (const sx of [-1, 1]) torch(cx + sx * ap(16), yb - ap(46));
      if (theme === 'cursed_crypt') {
        const sy = yb - ap(72);
        p.disc(cx + 0.5, sy, ap(4), '#d8d0c0'); p.rect(cx - 3, sy + 3, 7, 3, '#d8d0c0'); p.disc(cx - 0.5, sy - 1, ap(2), '#e8e0d0');
        p.rect(cx - 3, sy - 1, 2, 3, '#0a0808'); p.rect(cx + 2, sy - 1, 2, 3, '#0a0808'); p.set(cx, sy + 2, '#0a0808');
        for (let i = -2; i <= 2; i += 2) p.set(cx + i, sy + 5, '#6a6458');
        for (let k = 0; k < 4; k++) { let x = fx + 4 + Math.floor(r() * (fw - 8)), y = ft + 4 + Math.floor(r() * 30); for (let s = 0; s < ap(6); s++) { p.set(x, y, WR[0]); y++; if (r() < 0.5) x += r() < 0.5 ? -1 : 1; } }
        for (let k = 0; k < 40; k++) { const x = fx + Math.floor(r() * fw), y = yb - ap(8) - Math.floor(r() * r() * 30); if (p.a(x, y)) p.set(x, y, r() < 0.5 ? '#4a5a3a' : '#5a6a44'); }
      }
      if (theme === 'marble_vault') { const sy = yb - ap(72); p.disc(cx + 0.5, sy, ap(3.4), '#e8c060'); p.disc(cx + 0.5, sy, ap(2.2), '#c8a040'); p.set(cx - 1, sy - 2, '#fff0a0'); for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; p.set(Math.round(cx + Math.cos(a) * ap(5)), Math.round(sy + Math.sin(a) * ap(5)), '#e8c060'); } }
      if (theme === 'dwarven_deephall') for (let x = cx - ap(30); x < cx + ap(30); x += 6) { const gl = GLYPH[Math.floor(hash2(x, 1, 3) * 5)]; for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) if (gl[j + 1][i] === '1') { p.set(x + i, yb - ap(62) + 3 + j, '#ff9030'); e.set(x + i, yb - ap(62) + 3 + j, '#ffa040'); } }
      if (theme === 'frozen_citadel') {
        for (let x = cx - ap(37); x < cx + ap(37); x++) if (hash2(x, 2, 9) < 0.85) { p.set(x, cy0 - 1, '#eef2f8'); p.set(x, cy0, '#ffffff'); }
        for (let x = cx - ap(36); x < cx + ap(36); x++) if (hash2(x, 4, 9) < 0.25) { const L = 2 + Math.floor(hash2(x, 5, 9) * ap(4)); for (let k = 0; k < L; k++) p.set(x, cy0 + ap(3) + 1 + k, k === L - 1 ? '#ffffff' : '#c8e0f0'); }
        for (let y = rt; y < rt + ap(9); y++) for (let x = cx - ap(20); x < cx + ap(20); x++) if (p.a(x, y) && hash2(x, y, 3) < 0.9 - (y - rt) / ap(9)) p.set(x, y, (y - rt) > ap(6) ? '#c0ccdc' : '#eef2f8');
        for (let i = 0; i < 3; i++) p.rect(cx - ap(22) + i * ap(2), yb - 5 - i * 3, ap(44) - i * ap(4), 1, '#eef2f8');
      }
      doorW = ap(22); doorH = ap(34); doorY = yb - ap(9);
      rim = theme === 'marble_vault' ? C('#c8a050') : light(wallC, 1.08); rimW = ap(2);
    } else if (theme === 'buried_colossus') {
      const sand = ramp('#c8784a');
      stoneMass(p, cx, yb - ap(20), ap(50), ap(20), '#c8784a', 11, { facet: ap(8), tilt: 0.25, bump: 0.12, cracks: 0, ramp: sand });
      for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (p.a(x, y) && Math.sin(x * 0.45 + y * 1.7 + Math.sin(x * 0.1) * 3) > 0.93) p.set(x, y, light(p.get(x, y), 1.08));
      fillWall(p, cx - ap(20), yb - ap(58), ap(40), ap(44), '#b87a4a', 'block', 7);
      p.rect(cx - ap(22), yb - ap(60), ap(44), ap(3), '#c8885a'); p.rect(cx - ap(22), yb - ap(60), ap(44), 1, '#e0a070'); p.rect(cx - ap(22), yb - ap(60) + ap(3), ap(44), 1, '#7a4a2a');
      for (const sx of [-1, 1]) column(p, cx + sx * ap(18) - ap(2.5), yb - ap(12), ap(48), ap(5), '#c08050');
      // giant fingers rising beside the door (knuckle creases, nails)
      for (let k = 0; k < 4; k++) {
        const fx = cx - ap(46) + k * ap(6), tx = fx - ap(2) + k * ap(1), ty = yb - ap(40) - k * ap(4);
        const fc = k % 2 ? '#c88a5a' : '#d89a6a', FR = ramp(fc);
        p.taper(fx, yb - ap(10), tx, ty, ap(8), ap(6), FR[1]);
        p.taper(fx - 1, yb - ap(10), tx - 1, ty, ap(6), ap(4), FR[2]);
        p.taper(fx - 3, yb - ap(10), tx - 3, ty + 1, ap(2), ap(1.4), FR[3]);
        for (const t of [0.35, 0.68]) { const x = fx + (tx - fx) * t, y = yb - ap(10) + (ty - yb + ap(10)) * t; p.line(x - ap(3.4), y, x + ap(3.2), y - 1, FR[0]); p.line(x - ap(3.4), y - 1, x - 1, y - 2, FR[3]); }
        p.ellipse(tx, ty + 1, ap(2.4), ap(2.6), light(fc, 1.25)); p.ellipse(tx - 0.5, ty + 0.5, ap(1.4), ap(1.6), light(fc, 1.45)); p.set(Math.round(tx) - 1, Math.round(ty), '#fff0e0');
      }
      stoneMass(p, cx - ap(40), yb - ap(7), ap(16), ap(6), '#c8784a', 12, { facet: ap(8), tilt: 0.2, bump: 0.1, cracks: 0, ramp: sand, flatBase: 0.6 });
      doorW = ap(22); doorH = ap(36); doorY = yb - ap(12);
      rim = C('#8a5232'); rimW = ap(2);
    } else if (theme === 'sunken_temple') {
      const sc = '#7a9a90';
      fillWall(p, cx - ap(16), yb - ap(48), ap(32), ap(38), '#5a7a78', 'block', 5);
      fillWall(p, cx - ap(40), yb - ap(10), ap(80), ap(8), '#5a7a7a', 'block', 2);
      p.rect(cx - ap(40), yb - ap(10), ap(80), 1, '#8aaaa8');
      for (const sx of [-30, -10, 10, 30]) column(p, cx + ap(sx) - ap(2.5), yb - ap(10), ap(46), ap(5), sc);
      const rt = yb - ap(74), rbm = yb - ap(56);
      for (let y = rt; y <= rbm; y++) {
        const t = (y - rt) / (rbm - rt), half = ap(6) + t * ap(36);
        for (let x = Math.floor(cx - half); x <= cx + half; x++) {
          let col = (rbm - y) % 3 ? C('#6a8a88') : C('#5a7a78');
          if (x < cx) col = light(col, 1.06);
          if (Math.abs(x + 0.5 - cx) > half - 1.5) col = C('#4a6a68');
          p.set(x, y, col);
        }
      }
      p.rect(cx - ap(43), rbm, ap(86), ap(2), '#8aaaa8'); p.rect(cx - ap(43), rbm + ap(2), ap(86), 1, '#3a5a58');
      // weed, barnacles, puddles
      for (let k = 0; k < 18; k++) { const x = cx - ap(40) + Math.floor(r() * ap(80)); let y = rbm + ap(2) + 1; const L = 2 + Math.floor(r() * ap(10)); for (let s = 0; s < L && y < yb; s++, y++) if (p.a(x, y)) p.set(x + (s % 4 === 3 ? 1 : 0), y, s % 2 ? '#2a6a4a' : '#3a7a5a'); }
      for (let k = 0; k < 30; k++) { const x = cx - ap(40) + r() * ap(80), y = yb - ap(12) - r() * ap(44); if (p.a(x, y)) p.set(x, y, r() < 0.5 ? '#3a7a5a' : '#c8c0a8'); }
      for (const sx of [-1, 1]) { p.ellipse(cx + sx * ap(30), yb - 2, ap(7), ap(1.6), '#3a6a78'); p.rect(Math.round(cx + sx * ap(30)) - 3, yb - 3, 4, 1, '#8ad0e0'); }
      doorW = ap(20); doorH = ap(30); doorY = yb - ap(11);
      rim = C('#8aaaa0'); rimW = ap(2);
    } else if (theme === 'living_labyrinth') {
      const hedge = ramp('#2a4a24');
      for (const i of [-3, 3, -2, 2, -1, 1, 0]) stoneMass(p, cx + i * ap(13), yb - ap(26) - Math.abs(i) * ap(2), ap(10), ap(26) + Math.abs(i) * ap(2), '#2a4a24', 40 + i, { leafy: true, facet: ap(4), bump: 0.1, lobes: 8, ramp: hedge, flatBase: 0.95 });
      stoneMass(p, cx, yb - ap(62), ap(48), ap(13), '#335a2a', 47, { leafy: true, facet: ap(4), bump: 0.07, lobes: 9 });
      for (let k = 0; k < 30; k++) { const x = Math.floor(r() * W), y = Math.floor(r() * H); if (p.a(x, y) && p.a(x, y - 1)) p.set(x, y, r() < 0.5 ? '#e090c0' : '#f0f0d0'); }
      p.disc(cx + 0.5, yb - ap(64), ap(3), '#a0ff60'); e.disc(cx + 0.5, yb - ap(64), ap(3), '#a0ff60');
      p.disc(cx + 0.5, yb - ap(64), ap(1.2), '#f0ffd0'); e.disc(cx + 0.5, yb - ap(64), ap(1.2), '#f0ffd0');
      doorW = ap(22); doorH = ap(38); doorY = yb - ap(2);
      rim = C('#16280e'); rimW = ap(1.5); inner = 'deep';
    } else {
      // cave mouth in a rock outcrop
      const rc = { glass_cavern: '#2a1a20', void_rift: '#2a2034', dragon_lair: '#4a2a22', fungal_warren: '#3a3430', pirate_cove: '#4a4a48', bandit_hideout: biome === 'wastes' ? '#8a4a30' : '#5a5048', beast_den: biome === 'frost' ? '#6a7480' : '#5a5040' }[theme] || '#5a5048';
      const RC = ramp(light(rc, 1.15));
      stoneMass(p, cx, yb - ap(36), ap(50), ap(36), rc, 21, { facet: ap(10), tilt: 0.75, lobes: 7, ramp: RC, cracks: 6, flatBase: 0.95 });
      for (let k = 0; k < 5; k++) stoneMass(p, cx - ap(40) + k * ap(20), yb - ap(12), ap(12), ap(11), rc, 30 + k, { facet: ap(7), tilt: 0.7, ramp: ramp(rc), cracks: 1, flatBase: 0.95 });
      if (biome === 'frost' || biome === 'verdant') {
        const t1 = biome === 'frost' ? C('#ffffff') : C('#6a9a3a'), t2 = biome === 'frost' ? C('#dde6f2') : C('#4a7a2a'), t3 = biome === 'frost' ? C('#b8c4d8') : C('#2a4a1a');
        for (let x = 0; x < p.w; x++) for (let y = 0; y < p.h; y++) if (p.a(x, y) && !p.a(x, y - 1)) {
          const L = ap(2) + Math.floor(hash2(x, 3, 5) * ap(2.5));
          for (let k = 0; k < L; k++) if (p.a(x, y + k)) p.set(x, y + k, k === 0 ? t1 : k === L - 1 ? t3 : t2);
          if (biome === 'verdant' && hash2(x, 1, 7) < 0.12) for (let k = L; k < L + ap(5); k++) if (p.a(x, y + k)) p.set(x, y + k, k % 2 ? '#3a6a2a' : '#4a7a2a');
        }
      }
      if (theme === 'glass_cavern' || theme === 'void_rift' || theme === 'dragon_lair' || theme === 'fungal_warren') {
        const hc = theme === 'glass_cavern' ? '#ff4060' : theme === 'void_rift' ? '#a060ff' : theme === 'dragon_lair' ? '#ff7030' : '#c080ff';
        for (let k = 0; k < 5; k++) {
          let x = cx + (r() - 0.5) * ap(80), y = yb - ap(20) - r() * ap(40);
          if (theme === 'glass_cavern' || theme === 'fungal_warren') {
            if (!p.a(Math.round(x), Math.round(y))) continue;
            if (theme === 'glass_cavern') { const s = ap(3) + r() * ap(3); p.poly([[x - s * 0.4, y], [x, y - s * 1.6], [x + s * 0.4, y]], hc); p.poly([[x - s * 0.4, y], [x, y - s * 1.6], [x, y]], light(C(hc), 1.3)); e.poly([[x - s * 0.4, y], [x, y - s * 1.6], [x + s * 0.4, y]], hc); }
            else { p.rect(Math.round(x), Math.round(y) - 2, 1, 3, '#d8d0c0'); p.ellipse(x + 0.5, y - 3, 2.5, 1.5, hc); e.ellipse(x + 0.5, y - 3, 2.5, 1.5, hc); }
          } else for (let s = 0; s < ap(10); s++) {
            const X = Math.round(x), Y = Math.round(y);
            if (p.a(X, Y)) { p.set(X, Y, hc); e.set(X, Y, hc); }
            y += 1; x += r() < 0.5 ? -1 : 1;
          }
        }
      }
      if (theme === 'bandit_hideout' || theme === 'pirate_cove') {
        const wd = C('#5a3a22');
        for (const sx of [-1, 1]) { const x = cx + sx * ap(30) - 1; p.rect(x, yb - ap(34), ap(2), ap(32), wd); p.rect(x, yb - ap(34), 1, ap(32), light(wd, 1.2)); }
        p.rect(cx - ap(32), yb - ap(36), ap(64), ap(2) + 1, wd); p.rect(cx - ap(32), yb - ap(36), ap(64), 1, light(wd, 1.25));
        for (let x = cx - ap(31); x < cx + ap(31); x += ap(6)) p.set(x, yb - ap(35), '#2a2420');
        const cl = C(theme === 'pirate_cove' ? '#1a1a1a' : '#8a2a1a');
        for (let y = yb - ap(33); y < yb - ap(17); y++) for (let x = cx - ap(30) + 3; x < cx - ap(30) + ap(10); x++) {
          const fold = Math.sin((x - cx) * 0.9);
          let col = fold > 0.4 ? light(cl, 1.25) : fold < -0.5 ? dark(cl, 0.8) : cl;
          if (y >= yb - ap(18) && (x % 2)) continue;
          p.set(x, y, col);
        }
        if (theme === 'pirate_cove') { const sx = cx - ap(24), sy = yb - ap(28); p.disc(sx + 0.5, sy, ap(2), '#e8e0d0'); p.set(sx - 1, sy, '#1a1a1a'); p.set(sx + 1, sy, '#1a1a1a'); p.line(sx - 3, sy + 4, sx + 3, sy + 7, '#e8e0d0'); p.line(sx + 3, sy + 4, sx - 3, sy + 7, '#e8e0d0'); }
      }
      doorW = ap(34); doorH = ap(30); doorY = yb - ap(2);
      rim = dark(rc, 0.55); rimW = ap(2); inner = 'deep';
    }
    // the dark doorway: an arched void with a lit jamb, a faint floor and steps leading down
    const dx0 = cx - Math.floor(doorW / 2), dTop = doorY - doorH;
    const inDoor = (x, y) => {
      if (y < dTop || y > doorY || x < dx0 || x >= dx0 + doorW) return false;
      const ly = y - dTop, r0 = doorW / 2, dy = Math.max(0, r0 - ly);
      return Math.abs(x + 0.5 - cx) <= Math.sqrt(Math.max(0, r0 * r0 - dy * dy)) + 0.3;
    };
    if (rim) for (let y = dTop - rimW; y <= doorY; y++) for (let x = dx0 - rimW; x < dx0 + doorW + rimW; x++) {
      if (inDoor(x, y)) continue;
      let near = false;
      for (let k = 1; k <= rimW && !near; k++) near = inDoor(x + k, y) || inDoor(x - k, y) || inDoor(x, y + k) || inDoor(x + k, y + k) || inDoor(x - k, y + k);
      if (!near) continue;
      let col = rim;
      if (inner === 'stairs') {
        const a = Math.atan2(y - (dTop + doorW / 2), x + 0.5 - cx);
        col = Math.floor((a + 7) * 3.2) % 2 ? light(rim, 1.12) : rim;
        if (Math.abs(x + 0.5 - cx) < 2 && y < dTop + 2) col = light(rim, 1.25);
      } else if (hash2(x, y, 3) < 0.3) col = shade(rim, 1.2);
      p.set(x, y, col);
    }
    for (let y = dTop; y <= doorY; y++) for (let x = dx0; x < dx0 + doorW; x++) {
      if (!inDoor(x, y)) continue;
      const ly = y - dTop;
      let col = C('#06040a');
      if (!inDoor(x - 2, y)) col = C('#1a1420');
      else if (!inDoor(x + 2, y)) col = C('#0a080e');
      if (ly > doorH - 3) col = C('#1a1418');
      else if (inner === 'stairs' && ly > doorH * 0.55) { const k = Math.floor((doorH - ly) / 3); if ((doorH - ly) % 3 === 0 && Math.abs(x + 0.5 - cx) < doorW / 2 - k * 2 - 1) col = C('#241e28'); }
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
    // round dais of fitted flagstones
    const dy = yb - ap(8);
    p.ellipse(cx, dy + ap(2), ap(24), ap(8), '#4a4440');
    p.ellipse(cx, dy, ap(24), ap(8), '#7a7470');
    for (let y = Math.floor(dy - ap(8)); y <= dy + ap(8); y++) for (let x = cx - ap(24); x <= cx + ap(24); x++) {
      const nx = (x + 0.5 - cx) / ap(24), ny = (y + 0.5 - dy) / ap(8), d = Math.hypot(nx, ny);
      if (d > 1 || !p.a(x, y)) continue;
      const a = Math.atan2(ny, nx);
      let col = C(d < 0.55 ? '#86807a' : '#7a7470');
      if (Math.abs(d - 0.55) < 0.06 || (d > 0.55 && Math.abs((a / Math.PI) * 6 - Math.round((a / Math.PI) * 6)) < 0.07) || (d < 0.55 && Math.abs((a / Math.PI) * 3 - Math.round((a / Math.PI) * 3)) < 0.1)) col = C('#5a5450');
      else if (d > 0.93 && ny < 0) col = C('#9a948e');
      if (hash2(x, y, 4) < 0.05) col = C('#6a7a5a');
      p.set(x, y, col);
    }
    // standing stones around (back ones first)
    const stones = [];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; stones.push([cx + Math.cos(a) * ap(28), yb - ap(9) + Math.sin(a) * ap(9), i]); }
    stones.sort((a, b) => a[1] - b[1]);
    const st = ramp('#5a5650');
    const drawStone = (x, y, i) => {
      const h = ap(18) + (i % 2) * ap(5), hw = ap(3);
      for (let yy = Math.round(y - h); yy <= y; yy++) {
        const t = (yy - (y - h)) / h, half = hw * (t < 0.12 ? 0.6 + t * 3.3 : 1);
        for (let xx = Math.round(x - half); xx <= x + half; xx++) {
          const u = (xx + 0.5 - x) / half;
          let col = u < -0.45 ? st[3] : u > 0.45 ? st[1] : st[2];
          if (t < 0.06) col = st[3];
          if (hash2(xx, yy, i) < 0.07) col = shade(col, 0.88);
          if (t > 0.75 && hash2(xx, yy, i + 9) < (t - 0.75) * 2.2) col = mixc(col, '#4a6a3a', 0.65);
          p.set(xx, yy, col);
        }
      }
      // carved spiral rune
      const gx = Math.round(x) - 1, gy = Math.round(y - h * 0.62);
      for (const [a, b] of [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1], [1, 1]]) p.set(gx + a, gy + b, st[0]);
      for (let k = 0; k < 3; k++) p.set(Math.round(x - 2 + r() * 4), Math.round(y - h * r()), '#6a8a5a');
    };
    for (const [x, y, i] of stones) if (y < dy) drawStone(x, y, i);
    // altar
    const ax = cx - ap(7), ay = yb - ap(20);
    fillWall(p, ax, ay, ap(14), ap(12), '#7a7268', 'block', 7);
    p.rect(ax - ap(1), ay - ap(2), ap(16), ap(2), '#9a9288'); p.rect(ax - ap(1), ay - ap(2), ap(16), 1, '#b0a89e'); p.rect(ax - ap(1), ay, ap(16), 1, '#5a544c');
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; p.set(Math.round(cx + Math.cos(a) * 3), Math.round(ay + ap(6) + Math.sin(a) * 3), '#5a544c'); }
    p.set(cx, ay + ap(6), '#c8a050');
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
    stoneMass(p, cx, yb - ap(7), ap(16), ap(7), '#6a5a4a', 33, { facet: ap(3), cracks: 3, flatBase: 0.8 });
    stoneMass(p, cx + ap(9), yb - ap(3), ap(5), ap(3), '#5a4a3c', 34, { facet: ap(3), cracks: 0 });
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
      p.rect(cx - 3, entry + 1, 7, 1, '#2a2018'); p.set(cx - 4, entry + 2, '#3a2e24'); p.set(cx + 4, entry + 2, '#3a2e24'); p.rect(cx - 3, entry, 7, 1, '#8a7a68');
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
      const tc = C(top);
      for (let x = 0; x < p.w; x++) for (let y = 0; y < p.h; y++) if (p.a(x, y) && !p.a(x, y - 1)) {
        const L = ap(2) + Math.floor(hash2(x, 0, seed) * ap(2));
        for (let k = 0; k < L; k++) if (p.a(x, y + k)) p.set(x, y + k, k === L - 1 ? dark(tc, 0.82) : k === 0 ? light(tc, 1.06) : tc);
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
    const c = C(color), Rm = [dark(c, 0.62), dark(c, 0.8), c, light(c, 1.12)];
    const sh = ap(3);
    // plinth and torus
    for (let j = 0; j < 3; j++) for (let i = -ap(5); i <= ap(5); i++) p.set(cx + i, yb - 2 + j, j === 0 ? Rm[3] : j === 2 ? Rm[1] : i === -ap(5) ? Rm[3] : i === ap(5) ? Rm[1] : Rm[2]);
    for (let i = -ap(4); i <= ap(4); i++) p.set(cx + i, yb - 3, Math.abs(i) === ap(4) ? Rm[1] : i < 0 ? Rm[3] : Rm[2]);
    // fluted shaft
    for (let y = top; y < yb - 3; y++) for (let i = -sh; i <= sh; i++) {
      const u = i / sh;
      let idx = u < -0.55 ? 3 : u < 0.05 ? 2 : u < 0.6 ? 1 : 0;
      if (i % 2 === 0 && Math.abs(i) < sh) idx = Math.max(0, idx - 1);
      let col = Rm[idx];
      if (hash2(cx + i, y, seed) < 0.04) col = shade(col, 0.86);
      p.set(cx + i, y, col);
    }
    if (broken) {
      for (let i = -sh; i <= sh; i++) {
        const cut = 1 + Math.floor(hash2(i, seed, 2) * ap(3));
        for (let k = 0; k < cut; k++) p.clear(cx + i, top + k);
        p.set(cx + i, top + cut, i < 1 ? light(c, 1.24) : light(c, 1.08));
      }
      for (let y = yb - Math.round((yb - top) * 0.4); y < yb - 3; y++) for (let i = -sh; i <= sh; i++) if (hash2(cx + i, y, seed + 4) < 0.12 * ((y - top) / (yb - top))) p.set(cx + i, y, '#6a7a4a');
      // a fallen drum at the foot
      const fx = cx + (seed % 2 ? 1 : -1) * ap(6);
      p.ellipse(fx, yb - 2, ap(3), ap(2), Rm[1]); p.ellipse(fx - 0.5, yb - 2.5, ap(3) - 1, ap(2) - 1, Rm[2]); p.ellipse(fx - 1, yb - 3, ap(1.4), 1.2, Rm[3]);
    } else {
      p.rect(cx - ap(5), top - ap(3), ap(10) + 1, ap(3), Rm[2]); p.rect(cx - ap(5), top - ap(3), ap(10) + 1, 1, Rm[3]); p.rect(cx + ap(5), top - ap(3), 1, ap(3), Rm[1]);
      p.rect(cx - ap(4), top - 1, ap(8) + 1, 1, Rm[1]); p.rect(cx - ap(4) + 1, top, ap(8) - 1, 1, Rm[0]);
      for (const sd of [-1, 1]) p.set(cx + sd * (ap(5) - 1), top - 1, Rm[3]);
    }
    return done(p, null);
  });
}
export function ruinWallSprite(wu, hu, color, seed) {
  return memo('ruin' + wu + hu + color + seed, () => {
    const W = Math.round(wu * PPU), H = Math.round(hu * PPU * 0.7), TT = ap(6);
    const p = mk(W + 2, H + ap(10)), yb = p.h - 1;
    fillWall(p, 1, yb - H, W, H, color, 'block', seed);
    fillWall(p, 1, yb - H - TT, W, TT, light(color, 1.15), 'block', seed + 1);
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
      if (cut > 0 && p.a(x, ty)) { p.set(x, ty, light(color, 1.24)); if (p.a(x, ty + 1)) p.set(x, ty + 1, light(color, 1.08)); }
    }
    doorAt(p, Math.round(W / 2) - ap(5), yb, ap(10), Math.min(ap(18), H - ap(4)), '#2a2018', { arch: true, dark: true, frame: dark(color, 0.7) });
    // moss on the broken tops, hanging vines, rubble at the foot
    for (let x = 1; x <= W; x++) for (let y = 0; y < yb; y++) if (p.a(x, y) && !p.a(x, y - 1)) {
      if (hash2(x, 1, seed) < 0.45) p.set(x, y, hash2(x, 2, seed) < 0.5 ? '#7a8a50' : '#9aa070');
      if (hash2(x, 3, seed) < 0.08) { const L = ap(3) + Math.floor(hash2(x, 4, seed) * ap(8)); for (let k = 1; k < L; k++) if (p.a(x, y + k)) p.set(x, y + k, k % 3 === 2 ? '#7a9a50' : '#5a7040'); }
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
    p.ellipse(p.ox + 0.5, yb - 0.5, ap(3.5), ap(1.5), '#4a3a2c'); p.ellipse(p.ox, yb - 1, ap(2.5), ap(1), '#6a5440');
    p.set(p.ox - ap(2), yb - 1, '#8a7058'); p.set(p.ox + 1, yb - 2, '#7a6450');
    return { pix: p, emis: null };
  });
}
// a single block of curtain wall (overlapping blocks build walls along any curve)
export function wallBlock(color, h = 4.2, snow = false) {
  return memo('wblock' + color + h + snow, () => {
    const BWk = ap(18), H = Math.round(h * PPU * 0.7), T = ap(12);
    const p = mk(BWk, H + T + ap(3)), yb = p.h - 1;
    fillWall(p, 0, yb - H + 1, BWk, H, color, 'block', 3);
    fillWall(p, 0, yb - H - T + 1, BWk, T, light(color, 1.16), 'block', 5);
    p.rect(0, yb - H - T + 1, BWk, 1, dark(color, 0.84));
    p.rect(0, yb - H, BWk, 1, light(color, 1.28));
    merlons(p, 0, BWk, yb - H - T - 2, light(color, 1.08), snow);
    if (snow) for (let x = 0; x < BWk; x++) { p.set(x, yb - H - T + 2, '#eef2f8'); if (hash2(x, 3, 1) < 0.6) p.set(x, yb - H - T + 3, '#d8e0ec'); p.set(x, yb - H, '#eef2f8'); }
    return { pix: p, emis: null };
  });
}
