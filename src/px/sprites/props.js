// Procedural pixel-art props for the world scatter. Each prop returns { frames: [Pix], emis?: Pix }
// with the pivot (ox, oy) at the base centre. Plants get sway frames; crystals get emissive layers.
//
// Drawn natively at the art density (PPU 16): every generator gets its size factor already
// multiplied by ART, so a prop covers the same patch of world as it always did, while 1-px
// details (outlines, glints, needles, leaf tips, cracks) stay 1 px and the extra pixels go into
// leaf clusters, bark fissures, rock facets and petals.
import { Pix, C, ART, shade, light, dark, mixc, alpha, srand, hash2 } from '../pix.js';

const A = ART;
const cache = new Map();

export function propSprite(id, variant = 0, scale = 1) {
  const bucket = scale < 0.85 ? 0 : scale < 1.3 ? 1 : 2;
  const key = id + ':' + variant + ':' + bucket;
  let s = cache.get(key);
  if (!s) {
    const sz = [0.75, 1, 1.35][bucket];
    const fn = GEN[id] || GEN.rock;
    s = fn(srand(hashKey(id) * 31 + variant * 977 + bucket), sz * A, variant);
    // one free pixel on every side for the selective outline, then crop the empty margins
    const done = new Map();
    s.frames = s.frames.map((f) => { if (!done.has(f)) { const q = padPix(f, 1, 1, 1, 1); q.outlineSel(); done.set(f, q.trim(0)); } return done.get(f); });
    if (s.emis) s.emis = s.emis.trim(0);
    cache.set(key, s);
  }
  return s;
}
const hashKey = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };

// ------------------------------------------------------------------ shared helpers (other modules)
export function ramp(base) { base = C(base); return [dark(base, 0.52), dark(base, 0.76), base, light(base, 1.16)]; }

// Banded, top-left-lit blob with a noisy edge (canopies, rocks, bushes)
export function blob(p, cx, cy, rx, ry, base, rnd, o = {}) {
  const R = o.ramp || ramp(base);
  const seed = Math.floor(rnd() * 1000);
  const bump = o.bump ?? 0.18;
  for (let y = Math.floor(cy - ry - 2); y <= Math.ceil(cy + ry + 2); y++) for (let x = Math.floor(cx - rx - 2); x <= Math.ceil(cx + rx + 2); x++) {
    const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
    const ang = Math.atan2(ny, nx);
    const edge = 1 + bump * (Math.sin(ang * (o.lobes || 5) + seed) * 0.6 + (hash2(Math.round(ang * 8), seed, 3) - 0.5) * 0.8);
    const d = Math.sqrt(nx * nx + ny * ny);
    if (d > edge) continue;
    let l = -0.62 * nx - 0.78 * ny + 0.15 + (o.flat ? 0.3 : 0);
    l += (hash2(x, y, seed) - 0.5) * (o.texture ?? 0.35);
    if (d > edge - 0.18 && ny > 0) l -= 0.35;   // darker rim at the bottom
    const idx = l > 0.55 ? 3 : l > -0.05 ? 2 : l > -0.55 ? 1 : 0;
    p.set(x, y, R[idx]);
  }
  return p;
}

// ------------------------------------------------------------------ local helpers
// five-tone ramp: deep shadow, shadow, base, light, highlight (shadows cool, lights warm)
export function ramp5(base) { base = C(base); return [dark(base, 0.42), dark(base, 0.66), base, light(base, 1.14), light(base, 1.32)]; }
export const pal = (...hex) => hex.map((h) => C(h));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// smooth value noise (organic clusters instead of salt-and-pepper speckle)
export function vn(x, y, cell, seed) {
  const fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy);
  let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
const lvl = (l, t = [0.68, 0.24, -0.2, -0.62]) => (l > t[0] ? 4 : l > t[1] ? 3 : l > t[2] ? 2 : l > t[3] ? 1 : 0);

// palettes
const BARK = pal('#24181a', '#3a2820', '#563c2a', '#76563a', '#987650');
const BARK_GREY = pal('#2e2a2c', '#4a4440', '#6a6258', '#8e8474', '#b0a690');
const BONE = pal('#5a4c44', '#9a8a78', '#cfc2aa', '#e8dcc4', '#fff6e4');
const MARBLE = pal('#6e6658', '#a69c86', '#cfc4aa', '#e6dcc4', '#fbf4e2');
const FOLIAGE = {
  oak: pal('#16302a', '#22492e', '#326a32', '#4e8e38', '#86b84c'),
  oakBig: pal('#132a28', '#1e422c', '#2c602f', '#468436', '#78ac48'),
  olive: pal('#33433a', '#4e6048', '#6e8260', '#93a67a', '#c2cea0'),
  cypress: pal('#14281f', '#1e3e2a', '#2c5532', '#43733c', '#6a9850'),
  pine: pal('#0f2526', '#183a33', '#24533e', '#36704a', '#5a905c'),
  bush: pal('#183626', '#24522c', '#367230', '#56963a', '#90c452'),
  palm: pal('#163a26', '#225a2a', '#3a7e30', '#60a43a', '#a2d05a'),
};

function mk(w, h, oy) { const p = new Pix(Math.max(3, Math.round(w)), Math.max(3, Math.round(h))); p.ox = Math.floor(p.w / 2); p.oy = oy ?? p.h - 2; return p; }
function padPix(p, l, t, r, b) {
  const q = new Pix(p.w + l + r, p.h + t + b); q.ox = p.ox + l; q.oy = p.oy + t;
  for (let y = 0; y < p.h; y++) q.d.set(p.d.subarray(y * p.w * 4, (y + 1) * p.w * 4), ((y + t) * q.w + l) * 4);
  return q;
}
function emisFor(p) { const e = new Pix(p.w, p.h); e.ox = p.ox; e.oy = p.oy; return e; }
// soft baked contact shadow (alpha 70: casts no outline and no directional shadow)
function shadowOval(p, cx, cy, rx, ry) {
  rx = Math.max(2, rx); ry = Math.max(1, ry);
  for (let y = Math.floor(-ry); y <= Math.ceil(ry); y++) for (let x = Math.floor(-rx); x <= Math.ceil(rx); x++) {
    const X = Math.round(cx + x), Y = Math.round(cy + y);
    if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1 && !p.a(X, Y)) p.set(X, Y, [10, 6, 12, 70]);
  }
}

// shear a sprite: rows near the top shift more (wind sway frames); amplitude in old design px
function sway(pix, amps = [-1, 0, 1, 0]) {
  const M = Math.ceil(2 * A * Math.max(...amps.map(Math.abs)));
  pix = padPix(pix, M, 0, M, 0);
  return amps.map((a) => {
    if (!a) return pix;
    const q = new Pix(pix.w, pix.h); q.ox = pix.ox; q.oy = pix.oy;
    for (let y = 0; y < pix.h; y++) {
      const t = 1 - y / pix.oy;
      const sh = Math.round(a * Math.max(0, t) * Math.max(0, t) * 2 * A);
      for (let x = 0; x < pix.w; x++) {
        const k = (y * pix.w + x) * 4;
        if (!pix.d[k + 3]) continue;
        q.set(x + sh, y, [pix.d[k], pix.d[k + 1], pix.d[k + 2], pix.d[k + 3]]);
      }
    }
    return q;
  });
}

// a tapered limb (branch, root, stem) shaded across its width: lit on the side facing up-left
export function limb(p, x0, y0, x1, y1, w0, w1, R, o = {}) {
  const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1, L = Math.sqrt(L2);
  let nx = -dy / L, ny = dx / L;
  if (nx * -0.6 + ny * -0.8 < 0) { nx = -nx; ny = -ny; }
  const m = Math.max(w0, w1) / 2 + 1;
  const seed = o.seed || 0;
  for (let y = Math.floor(Math.min(y0, y1) - m); y <= Math.ceil(Math.max(y0, y1) + m); y++) for (let x = Math.floor(Math.min(x0, x1) - m); x <= Math.ceil(Math.max(x0, x1) + m); x++) {
    const px = x + 0.5 - x0, py = y + 0.5 - y0;
    const t = clamp((px * dx + py * dy) / L2, 0, 1);
    const qx = px - t * dx, qy = py - t * dy;
    const w = Math.max(0.55, (w0 + (w1 - w0) * t) / 2);
    if (qx * qx + qy * qy > w * w) continue;
    const u = (qx * nx + qy * ny) / w;
    let i = w < 1.2 ? (u > 0 ? 2 : 1) : u > 0.5 ? 3 : u > -0.3 ? 2 : u > -0.78 ? 1 : 0;
    if (o.grain && w >= 1.5 && i > 0 && vn(t * L * 0.35, u * 3 + seed, 1.6, seed + 5) < 0.3) i--;
    p.set(x, y, R[i]);
  }
}
// vertical trunk with root flare, bark fissures and a lit left side
export function trunk(p, cx, yb, yt, w0, w1, R, rnd, o = {}) {
  const seed = Math.floor(rnd() * 999), H = Math.max(1, yb - yt), flare = o.flare ?? Math.max(2, w0 * 0.6);
  for (let y = Math.floor(yt); y <= yb; y++) {
    const t = (y - yt) / H;
    let w = w1 + (w0 - w1) * Math.pow(t, 1.4);
    const fb = yb - y;
    if (fb < flare) w += (flare - fb) * (flare - fb) / flare * 0.9;
    const xc = cx + (o.bend || 0) * (1 - t) * (1 - t);
    const xa = Math.round(xc - w / 2), xb = Math.round(xc + w / 2);
    for (let x = xa; x < Math.max(xa + 1, xb); x++) {
      const u = (x + 0.5 - xc) / Math.max(0.6, w / 2);
      let i = u < -0.55 ? 3 : u < 0.2 ? 2 : u < 0.7 ? 1 : 0;
      // fissures: dark vertical streaks that wander a little, each with a lit ridge on its left
      if (w > 2.5) {
        const f = vn((x - xc) * 1.25 + 40, y * 0.2, 1.3, seed), fl = vn((x - 1 - xc) * 1.25 + 40, y * 0.2, 1.3, seed);
        if (f < 0.3) i = Math.max(0, i - 2); else if (f < 0.38) i = Math.max(0, i - 1); else if (fl < 0.3 && u < 0.4) i = Math.min(4, i + 1);
      }
      if (i === 3 && hash2(x, y, seed) < 0.12) i = 4;
      p.set(x, y, R[i]);
    }
  }
  // knot
  if (o.knot !== false && H > 8 * A) { const ky = Math.round(yt + H * (0.35 + rnd() * 0.3)), kx = Math.round(cx + (rnd() - 0.5) * w0 * 0.3); p.over(kx, ky, R[0]); p.over(kx + 1, ky, R[1]); p.over(kx, ky - 1, R[3]); }
  // roots spreading at the foot
  for (let k = 0; k < (o.roots ?? 2); k++) for (const sd of [-1, 1]) {
    const L = (2 + rnd() * 2.5) * A * (w0 / (4 * A));
    limb(p, cx + sd * w0 * 0.35, yb - 1 - k, cx + sd * (w0 * 0.5 + L), yb + 0.5, Math.max(1.5, w0 * 0.35), 1, R);
  }
}
// leafy crown: many small lit clumps inside a set of ellipses, back to front, each with its own
// highlight and a dark crease under it, so foliage reads as chunky clusters rather than noise
export function crown(p, parts, R, rnd, o = {}) {
  let X0 = 1e9, X1 = -1e9, Y0 = 1e9, Y1 = -1e9;
  for (const [cx, cy, rx, ry] of parts) { X0 = Math.min(X0, cx - rx); X1 = Math.max(X1, cx + rx); Y0 = Math.min(Y0, cy - ry); Y1 = Math.max(Y1, cy + ry); }
  const CX = (X0 + X1) / 2, CY = (Y0 + Y1) / 2, RX = Math.max(1, (X1 - X0) / 2), RY = Math.max(1, (Y1 - Y0) / 2);
  // the widest part holding a point (0 = outside): clumps shrink where the crown narrows
  const inside = (x, y) => { let m = 0; for (const [cx, cy, rx, ry] of parts) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) m = Math.max(m, rx); return m; };
  const cr = o.clump ?? 3.4 * A, asp = o.aspect ?? 0.85, sp = cr * (o.spacing ?? 1.15);
  const clumps = [];
  let row = 0;
  for (let y = Y0 + sp * 0.35 * asp; y <= Y1; y += sp * asp * 0.9, row++) for (let x = X0 + sp * (row % 2 ? 0.25 : 0.75); x <= X1; x += sp) {
    const jx = x + (rnd() - 0.5) * sp * 0.6, jy = y + (rnd() - 0.5) * sp * asp * 0.6;
    const m = inside(jx, jy);
    if (!m) continue;
    clumps.push([jx, jy, cr * (0.85 + rnd() * 0.4) * clamp(m / (cr * 1.6), 0.45, 1), rnd() * 6.28]);
  }
  clumps.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  // optional shadowed under-fill so a narrow crown never shows gaps between its puffs
  if (o.fill) for (let y = Math.floor(Y0); y <= Math.ceil(Y1); y++) for (let x = Math.floor(X0); x <= Math.ceil(X1); x++) if (inside(x + 0.5, y + 0.5) && !p.a(x, y)) p.set(x, y, R[1]);
  const seed = Math.floor(rnd() * 1000), bias = o.bias || 0, edgeN = o.edge ?? 0.12, lobes = o.lobes ?? 6;
  for (const [ccx, ccy, r, ph] of clumps) {
    const gx = (ccx - CX) / RX, gy = (ccy - CY) / RY;
    const gl = -0.5 * gx - 0.75 * gy;
    const ry = r * asp;
    for (let y = Math.floor(ccy - ry - 2); y <= Math.ceil(ccy + ry + 2); y++) for (let x = Math.floor(ccx - r - 2); x <= Math.ceil(ccx + r + 2); x++) {
      const nx = (x + 0.5 - ccx) / r, ny = (y + 0.5 - ccy) / ry;
      const d2 = nx * nx + ny * ny;
      // scalloped puff outline: small leaf lumps around the rim
      const edge = 1 + 0.16 * Math.sin(Math.atan2(ny, nx) * lobes + ph) + (hash2(x, y, seed) - 0.5) * edgeN;
      if (d2 > edge * edge) continue;
      // leafy band borders: the thresholds wander in small clusters
      let l = gl * 0.5 + (-0.55 * nx - 0.8 * ny) * 0.62 + bias + (vn(x, y, 1.6 * A, seed) - 0.5) * 0.34;
      if (d2 > 0.5 * edge * edge && ny > 0.15) l -= 0.42;                   // crease under the puff
      p.set(x, y, R[lvl(l)]);
    }
  }
  // leaf glints on the sunny side: a lit pixel pair on the upper-left rim of a puff
  for (const [ccx, ccy, r] of clumps) {
    const gx = (ccx - CX) / RX, gy = (ccy - CY) / RY;
    if (-0.5 * gx - 0.75 * gy > 0 && rnd() < 0.8) { const x = Math.round(ccx - r * 0.45), y = Math.round(ccy - r * asp * 0.6); p.over(x, y, R[4]); p.over(x + 1, y, R[4]); }
  }
  return clumps;
}
// grass blades: 1-px strokes fanning out from a tight root, curved, dark at the root and light at
// the tip, with gaps between the tips so a tuft never reads as a solid block
function blades(p, x, yb, n, h, R, rnd, o = {}) {
  const spread = o.spread ?? 3 * A, fan = o.lean ?? 0.6;
  const list = [];
  for (let i = 0; i < n; i++) {
    const f = (i + 0.2 + rnd() * 0.6) / n - 0.5;
    list.push({ bx: x + f * 2 * spread, hh: Math.max(3, h * (0.6 + rnd() * 0.5) * (1 - Math.abs(f) * 0.6)), lx: f * fan * 2.4 + (rnd() - 0.5) * 0.35 + (o.dir || 0), back: rnd() < 0.35 });
  }
  list.sort((a, b) => (b.back - a.back) || (b.hh - a.hh));
  for (const b of list) {
    const shift = b.back ? 1 : 0;
    const bend = b.lx * b.hh * 0.6;
    let lx = null;
    for (let k = 0; k < b.hh; k++) {
      const t = k / b.hh;
      const xx = Math.round(b.bx + bend * t * t), yy = yb - k;
      const i = Math.max(0, (t < 0.25 ? 0 : t < 0.55 ? 1 : t < 0.85 ? 2 : 3) - shift);
      p.set(xx, yy, R[i]);
      if (lx !== null && Math.abs(xx - lx) > 1) p.set((xx + lx) >> 1, yy + 1, R[i]);   // keep the stroke connected
      lx = xx;
    }
    if (!b.back && R[4]) p.set(Math.round(b.bx + bend), yb - Math.round(b.hh) + 1, R[4]);
  }
  // dense dark root
  for (let k = -Math.round(spread * 0.6); k <= Math.round(spread * 0.6); k++) p.set(Math.round(x + k), yb, R[0]);
}
// zig-zag crack over existing pixels
export function crack(p, x, y, len, c, rnd, dir = 1) {
  for (let k = 0; k < len; k++) {
    p.over(Math.round(x), Math.round(y), c);
    y += 1; x += (rnd() < 0.5 ? 0 : dir) * (rnd() < 0.7 ? 1 : 0);
    if (rnd() < 0.15) dir = -dir;
  }
}
// moss / snow cap: covers the top few pixels of every column, with drips
export function capTop(p, R, rnd, amt = 1, o = {}) {
  const seed = Math.floor(rnd() * 999);
  for (let x = 0; x < p.w; x++) {
    let top = -1;
    for (let y = 0; y < p.h; y++) if (p.a(x, y) > 200) { top = y; break; }
    if (top < 0) continue;
    const n = vn(x, 0, 2.5 * A, seed);
    let depth = Math.round((1 + n * 3) * amt * A);
    if (o.drip && hash2(x, 1, seed) < 0.18) depth += Math.round((1 + hash2(x, 2, seed) * 2.5) * A * amt);
    for (let k = 0; k < depth; k++) {
      if (p.a(x, top + k) < 200) break;
      p.set(x, top + k, R[k === 0 ? (n > 0.55 ? 4 : 3) : k === depth - 1 ? 1 : 2]);
    }
  }
}

// ---------- faceted boulder: polygonal outline, Voronoi facets lit from the top-left, crisp facet
// edges (dark cracks on the shadow side, a 1-px ridge where two lit faces meet), sparse specks
export function boulder(p, cx, cy, rx, ry, R, rnd, o = {}) {
  const seed = Math.floor(rnd() * 1000);
  const lobes = o.lobes ?? 5, bump = o.bump ?? 0.12, flatB = o.flatBottom ?? 0.55;
  const nf = o.facets ?? Math.max(4, Math.round((rx * ry) / (16 * A * A)));
  const F = [];
  for (let i = 0; i < nf; i++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * 0.85;
    const fx = Math.cos(a) * d, fy = Math.sin(a) * d * 0.9 - 0.1;
    // facet normal: the dome normal at the seed, tilted at random
    let nx = fx * 0.95 + (rnd() - 0.5) * 0.95, ny = fy * 0.95 + (rnd() - 0.5) * 0.9 - (o.flatTop ? 0.35 : 0);
    const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny));
    F.push({ x: cx + fx * rx, y: cy + fy * ry, l: (-0.5 * nx - 0.68 * ny + 0.55 * nz) });
  }
  const id = new Int16Array((Math.ceil(rx * 2) + 5) * (Math.ceil(ry * 2) + 5)).fill(-1);
  const bx0 = Math.floor(cx - rx - 2), by0 = Math.floor(cy - ry - 2), bw = Math.ceil(rx * 2) + 5;
  const ID = (x, y) => { const i = (y - by0) * bw + (x - bx0); return x < bx0 || y < by0 || x >= bx0 + bw || i >= id.length ? -1 : id[i]; };
  for (let y = by0; y < by0 + Math.ceil(ry * 2) + 5; y++) for (let x = bx0; x < bx0 + bw; x++) {
    const nx = (x + 0.5 - cx) / rx; let ny = (y + 0.5 - cy) / ry;
    if (ny > flatB) ny = flatB + (ny - flatB) * 2.2;        // flatter base sitting on the ground
    const ang = Math.atan2(ny, nx);
    const edge = 1 + bump * (Math.sin(ang * lobes + seed) * 0.6 + (hash2(Math.round(ang * 5), seed, 3) - 0.5) * 0.9);
    if (nx * nx + ny * ny > edge * edge) continue;
    let best = 0, bd = 1e9;
    for (let k = 0; k < F.length; k++) { const ddx = x - F[k].x, ddy = (y - F[k].y) * 1.2; const dd = ddx * ddx + ddy * ddy; if (dd < bd) { bd = dd; best = k; } }
    id[(y - by0) * bw + (x - bx0)] = best;
  }
  for (let y = by0; y < by0 + Math.ceil(ry * 2) + 5; y++) for (let x = bx0; x < bx0 + bw; x++) {
    const k = ID(x, y);
    if (k < 0) continue;
    const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
    let l = F[k].l * 0.8 + (-0.45 * nx - 0.6 * ny) * 0.5 - 0.1 + (vn(x, y, 3 * A, seed) - 0.5) * 0.16;
    if (ID(x, y + 1) < 0) l -= 0.5;                               // ground contact
    let i = lvl(l, [0.62, 0.3, -0.05, -0.42]);
    const kr = ID(x + 1, y), kd = ID(x, y + 1);
    if ((kr >= 0 && kr !== k) || (kd >= 0 && kd !== k)) {
      const other = F[kr >= 0 && kr !== k ? kr : kd].l;
      i = F[k].l > 0.35 && other > 0.35 ? Math.min(4, i + 1) : Math.max(0, Math.min(i, 2) - 1);
    }
    const sp = hash2(x, y, seed + 1);
    if (sp < 0.035 && i > 0) i--; else if (sp > 0.975 && i < 4) i++;
    p.set(x, y, R[i]);
  }
}

// ---------- prismatic crystal: lit left face, shadowed right face, bright ridge, pointed tip
function crystal(p, em, x, yb, h, w, R, lean, glowC) {
  const tip = Math.max(2, w * 0.9);
  for (let k = 0; k < h; k++) {
    const t = k / h, fromTop = h - k;
    const ww = fromTop < tip ? Math.max(1, w * fromTop / tip) : w;
    const cxk = x + lean * k;
    const xa = Math.round(cxk - ww / 2), xb = Math.max(xa + 1, Math.round(cxk + ww / 2));
    const ridge = xa + Math.floor((xb - xa) * 0.42);
    for (let xx = xa; xx < xb; xx++) {
      let i = xx === xa ? 4 : xx < ridge ? 3 : xx === ridge ? 4 : xx === xb - 1 ? 0 : 1;
      if (fromTop < tip) i = xx <= ridge ? (xx === xa ? 4 : 3) : 2;                 // tip facets
      if (k < 2) i = Math.max(0, i - 1);                                            // base in shadow
      p.set(xx, yb - k, R[i]);
    }
    // inner glow core
    if (em && fromTop > 2 && k > 1 && t < 0.8) em.set(Math.round(cxk - ww * 0.12), yb - k, alpha(glowC, 150 + Math.round(70 * (1 - t))));
  }
  // horizontal fracture glints
  for (let f = 0; f < Math.floor(h / (7 * A)); f++) {
    const k = Math.round(h * (0.2 + f * 0.27)), cxk = x + lean * k;
    p.over(Math.round(cxk - w / 2) + 1, yb - k, R[4]); p.over(Math.round(cxk - w / 2) + 2, yb - k - 1, R[4]);
  }
  if (em) em.set(Math.round(x + lean * (h - 2)), yb - h + 2, alpha('#ffffff', 220));
}

// ------------------------------------------------------------------ generators
const GEN = {
  // ---- grasses
  dune_grass: (r, s) => { const p = mk(16 * A, 3 * A + 11 * s); blades(p, p.w / 2, p.h - 2, 11, 9.5 * s, ramp5('#c8a060'), r, { lean: 0.9, dir: 0.25, spread: 3.4 * A }); return { frames: sway(p) }; },
  grass_gold: (r, s) => { const p = mk(16 * A, 3 * A + 10 * s); blades(p, p.w / 2, p.h - 2, 12, 8.5 * s, ramp5('#c8b060'), r, { lean: 0.7 }); return { frames: sway(p) }; },
  grass_green: (r, s) => { const p = mk(16 * A, 3 * A + 9 * s); blades(p, p.w / 2, p.h - 2, 12, 7.5 * s, pal('#1e4a26', '#2e6a2c', '#4a8e34', '#6eb040', '#a4d45a'), r, { lean: 0.65 }); return { frames: sway(p) }; },
  tundra_grass: (r, s) => { const p = mk(16 * A, 3 * A + 8 * s); blades(p, p.w / 2, p.h - 2, 10, 6.5 * s, ramp5('#8a9070'), r, { lean: 0.6 }); for (let i = 0; i < 4; i++) p.over(Math.round(p.w / 2 + (r() - 0.5) * 6 * A), Math.round(p.h - 3 - r() * 4 * s), '#eef4f8'); return { frames: sway(p) }; },
  sea_grass: (r, s) => { const p = mk(18 * A, 3 * A + 11 * s); blades(p, p.w / 2, p.h - 2, 11, 9.5 * s, ramp5('#5a9a70'), r, { lean: 1 }); return { frames: sway(p) }; },
  flowers: (r, s, v) => {
    const p = mk(16 * A, 4 * A + 7 * s), cx = p.w / 2, yb = p.h - 2;
    blades(p, cx, yb, 9, 6 * s, pal('#22401e', '#34582a', '#4e7a34', '#6e9a3e', '#9cbe5a'), r, { lean: 0.6 });
    const kinds = [['#e04040', '#ff8a70', '#8a1a20'], ['#f4f0e0', '#ffffff', '#a8a090'], ['#e8a030', '#ffd070', '#9a5a18'], ['#c050c0', '#f0a0f0', '#6a2070'], ['#6a80f0', '#b0c4ff', '#30307a']];
    const pick = [kinds[v % 5], kinds[(v + 2) % 5]];
    const n = 4 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const [base, hi, lo] = pick[i % 2].map((h) => C(h));
      const x = Math.round(cx + (r() - 0.5) * 9 * A), y = Math.round(yb - (3 + r() * 4) * s);
      limb(p, x, yb - 1, x, y + 1, 1, 1, pal('#22401e', '#34582a', '#4e7a34', '#6e9a3e'));
      if (r() < 0.65) {
        // five-pixel blossom: lit petals up-left, shaded petals down-right, warm centre
        p.set(x, y - 1, hi); p.set(x - 1, y, hi); p.set(x + 1, y, base); p.set(x, y + 1, lo); p.set(x, y, '#f8e070');
        if (s > 1.4) { p.set(x - 1, y - 1, base); p.set(x + 1, y + 1, lo); p.set(x + 1, y - 1, base); p.set(x - 1, y + 1, base); }
      } else { p.set(x, y, hi); p.set(x + 1, y, base); p.set(x, y + 1, lo); p.set(x + 1, y + 1, lo); }
    }
    return { frames: sway(p, [-1, 0, 1, 0]) };
  },
  fern: (r, s) => {
    const p = mk(26 * s, 17 * s), cx = p.w / 2, yb = p.h - 2;
    const R = pal('#173a22', '#24542a', '#3a7832', '#5a9a3a', '#8cc254');
    const fronds = [];
    for (let i = 0; i < 7; i++) fronds.push({ a: Math.PI * 1.1 + ((i + 0.5) / 7) * Math.PI * 0.8 + (r() - 0.5) * 0.15, L: (8 + r() * 2.5) * s, back: i % 2 === 0 });
    fronds.sort((a, b) => b.back - a.back || Math.abs(Math.cos(b.a)) - Math.abs(Math.cos(a.a)));
    for (const f of fronds) {
      const sh = f.back ? 1 : 0;
      let px = cx, py = yb;
      for (let k = 0; k <= f.L; k += 0.5) {
        const x = cx + Math.cos(f.a) * k, y = yb + Math.sin(f.a) * k + (k * k) / (f.L * 4.5);
        p.set(x, y, R[Math.max(0, (k < f.L * 0.3 ? 1 : 2) - sh)]);
        // alternating leaflets, shorter toward the tip, lit on top
        const kk = Math.round(k * 2);
        if (kk % 3 === 0 && k > 1 && k < f.L - 0.5) {
          const ll = Math.max(1, Math.round((1 - k / f.L) * 3 * A * 0.8));
          const side = (kk / 3) % 2 ? 1 : -1;
          const ox = -Math.sin(f.a) * side, oy = Math.cos(f.a) * side * 0.72;
          for (let j = 1; j <= ll; j++) p.set(x + ox * j * 0.9, y + oy * j * 0.9 + j * 0.35, R[Math.max(0, (side < 0 ? 3 : 2) - sh)]);
        }
        px = x; py = y;
      }
      p.set(px, py, R[4 - sh]);
    }
    return { frames: sway(p, [-1, 0, 1, 0]) };
  },
  bush: (r, s, v) => {
    const p = mk(22 * s + 4 * A, 15 * s + 3 * A), cx = p.w / 2, yb = p.h - 2;
    shadowOval(p, cx, yb, 8 * s, 2 * s);
    crown(p, [[cx, yb - 6 * s, 8.5 * s, 5.5 * s], [cx - 4 * s, yb - 4 * s, 5 * s, 3.6 * s], [cx + 4.5 * s, yb - 4.2 * s, 5 * s, 3.6 * s]], FOLIAGE.bush, r, { clump: 2.9 * s, aspect: 0.8 });
    if (v % 2) for (let i = 0; i < 7; i++) {   // berries or blossoms
      const x = Math.round(cx + (r() - 0.5) * 13 * s), y = Math.round(yb - 3 * s - r() * 7 * s);
      if (p.a(x, y) < 200) continue;
      const c = v === 1 ? pal('#8a1a2a', '#d8384a', '#ff8a8a') : pal('#c8a8b8', '#f4eef0', '#ffffff');
      p.set(x, y, c[1]); p.set(x + 1, y, c[0]); p.set(x, y - 1, c[2]);
    }
    return { frames: sway(p, [0, 0, 1, 0]) };
  },

  // ---- trees
  oak: (r, s) => {
    const p = mk(38 * s, 46 * s), cx = p.w / 2, base = p.h - 2;
    shadowOval(p, cx, base, 9 * s, 2.5 * s);
    trunk(p, cx, base, base - 21 * s, 4.4 * s, 2.8 * s, BARK, r);
    limb(p, cx + 0.5 * s, base - 13 * s, cx + 5.5 * s, base - 19 * s, 1.8 * s, 1 * s, BARK);
    limb(p, cx - 0.5 * s, base - 15 * s, cx - 5 * s, base - 21 * s, 1.6 * s, 0.9 * s, BARK);
    const j = () => (r() - 0.5) * 2 * s;
    crown(p, [[cx + j(), base - 26 * s, 11.5 * s, 9.5 * s], [cx - 7 * s + j(), base - 22 * s, 6.5 * s, 5.5 * s], [cx + 7 * s + j(), base - 22.5 * s, 6.5 * s, 5.5 * s], [cx + j(), base - 19.5 * s, 7 * s, 4.5 * s]], FOLIAGE.oak, r, { clump: 3.5 * s });
    return { frames: sway(p, [0, 0, 1, 0]) };
  },
  oak_big: (r, s) => {
    const p = mk(54 * s, 66 * s), cx = p.w / 2, base = p.h - 2;
    shadowOval(p, cx, base, 14 * s, 3.5 * s);
    trunk(p, cx, base, base - 30 * s, 7.5 * s, 4.6 * s, BARK, r, { roots: 3, flare: 3.5 * s });
    limb(p, cx - 1 * s, base - 18 * s, cx - 10 * s, base - 29 * s, 3 * s, 1.4 * s, BARK, { grain: true, seed: 3 });
    limb(p, cx + 1 * s, base - 20 * s, cx + 11 * s, base - 31 * s, 3 * s, 1.4 * s, BARK, { grain: true, seed: 7 });
    limb(p, cx, base - 26 * s, cx + 2 * s, base - 36 * s, 2.6 * s, 1.4 * s, BARK);
    const j = () => (r() - 0.5) * 3 * s;
    crown(p, [[cx + j(), base - 40 * s, 17 * s, 13 * s], [cx - 11 * s + j(), base - 33 * s, 9 * s, 8 * s], [cx + 11 * s + j(), base - 34 * s, 9 * s, 8 * s], [cx + j(), base - 30 * s, 10 * s, 6 * s], [cx - 4 * s + j(), base - 48 * s, 8 * s, 5 * s]], FOLIAGE.oakBig, r, { clump: 4.1 * s });
    return { frames: sway(p, [0, 0, 1, 0]) };
  },
  olive: (r, s) => {
    const p = mk(34 * s, 35 * s), cx = p.w / 2, base = p.h - 2;
    shadowOval(p, cx, base, 8 * s, 2 * s);
    // two strands twisting round each other
    const B = BARK_GREY;
    limb(p, cx - 1 * s, base, cx + 2.5 * s, base - 9 * s, 3 * s, 2 * s, B, { grain: true, seed: 2 });
    limb(p, cx + 1.5 * s, base, cx - 0.5 * s, base - 8 * s, 2.4 * s, 1.8 * s, B);
    limb(p, cx + 2.5 * s, base - 9 * s, cx - 3 * s, base - 15 * s, 2.2 * s, 1.2 * s, B);
    limb(p, cx + 2 * s, base - 9 * s, cx + 6 * s, base - 14 * s, 1.6 * s, 1 * s, B);
    crown(p, [[cx, base - 19 * s, 10.5 * s, 6.5 * s], [cx - 6 * s, base - 16.5 * s, 5 * s, 3.6 * s], [cx + 6.5 * s, base - 17 * s, 5 * s, 3.6 * s]], FOLIAGE.olive, r, { clump: 2.5 * s, aspect: 0.75, edge: 0.3, lobes: 8 });
    for (let i = 0; i < 5; i++) { const x = Math.round(cx + (r() - 0.5) * 14 * s), y = Math.round(base - 15 * s - r() * 6 * s); if (p.a(x, y) > 200) { p.set(x, y, '#3a2a40'); p.set(x, y - 1, '#6a5a78'); } }
    return { frames: sway(p, [0, 0, 1, 0]) };
  },
  cypress: (r, s) => {
    const h = 46 * s, p = mk(18 * s, h + 2), cx = p.w / 2, base = p.h - 2;
    shadowOval(p, cx, base, 5 * s, 1.5 * s);
    trunk(p, cx, base, base - 5 * s, 2.2 * s, 1.8 * s, BARK, r, { roots: 0, knot: false, flare: 1 });
    const parts = [];
    for (let k = 0; k < 9; k++) {
      const t = k / 9, y = base - 4 * s - t * (h - 9 * s);
      const w = 6.2 * s * (t < 0.32 ? 0.72 + (t / 0.32) * 0.28 : Math.pow(1 - (t - 0.32) / 0.68, 0.85));
      parts.push([cx + (r() - 0.5) * 0.8 * s, y, Math.max(0.9 * s, w), 4.2 * s * (1 - t * 0.55)]);
    }
    crown(p, parts, FOLIAGE.cypress, r, { clump: 2.1 * s, aspect: 1.3, spacing: 1.0, lobes: 5, fill: true });
    // pointed tip
    let ty = 0; while (ty < p.h && !p.a(Math.round(cx), ty)) ty++;
    for (let k = 1; k <= Math.round(2 * A); k++) p.set(Math.round(cx), ty - k, FOLIAGE.cypress[k > 2 ? 3 : 2]);
    return { frames: sway(p, [0, 0, 1, 0]) };
  },
  pine: (r, s) => pine(r, s, false),
  pine_snow: (r, s) => pine(r, s, true),
  dead_tree: (r, s) => {
    const p = mk(36 * s, 42 * s), cx = p.w / 2, base = p.h - 2;
    shadowOval(p, cx, base, 6 * s, 1.5 * s);
    const B = pal('#3a3230', '#5e544a', '#8a7a68', '#a89880', '#c8b8a0');
    trunk(p, cx, base, base - 22 * s, 4 * s, 2.2 * s, B, r, { roots: 2, flare: 1.6 * s });
    const br = (x0, y0, a, L, w, d) => {
      const x1 = x0 + Math.cos(a) * L, y1 = y0 + Math.sin(a) * L;
      limb(p, x0, y0, x1, y1, w, Math.max(1, w * 0.55), B);
      if (d > 0 && L > 2.5 * A) { br(x1, y1, a - 0.5 - r() * 0.2, L * 0.58, Math.max(1, w * 0.6), d - 1); br(x1, y1, a + 0.45 + r() * 0.2, L * 0.52, Math.max(1, w * 0.6), d - 1); }
    };
    br(cx, base - 16 * s, -2.3, 9 * s, 2.2 * s, 3); br(cx, base - 20 * s, -0.8, 9 * s, 2.2 * s, 3); br(cx, base - 22 * s, -1.6, 7 * s, 2 * s, 2);
    return { frames: [p] };
  },
  dead_pine: (r, s) => {
    const p = mk(24 * s, 45 * s), cx = p.w / 2, base = p.h - 2;
    shadowOval(p, cx, base, 5 * s, 1.5 * s);
    const B = pal('#2a2224', '#3e3432', '#5a4a40', '#76624e', '#968066');
    limb(p, cx, base, cx, base - 38 * s, 3.6 * s, 1, B, { grain: true, seed: 4 });
    for (let i = 0; i < 8; i++) {
      const y = base - (9 + i * 3.9) * s, L0 = (8.5 - i * 0.95) * s;
      for (const sd of [-1, 1]) {
        if (r() < 0.18) continue;
        const L = L0 * (0.6 + r() * 0.5), droop = 0.25 + r() * 0.35;
        const ex = cx + sd * L, ey = y + L * droop;
        limb(p, cx, y, ex, ey, Math.max(1.2, 0.9 * s / A * 1.6), 1, B);
        // a short twig and a ridge of snow along the upper side
        if (L > 3 * A) limb(p, cx + sd * L * 0.6, y + L * droop * 0.6, cx + sd * L * 0.8, y + L * droop * 0.6 - 1.4 * A, 1, 1, B);
        for (let k = 0.45; k <= 1.001; k += 1 / Math.max(2, L)) p.set(cx + sd * L * k, y + L * droop * k - 1, k > 0.8 ? '#ffffff' : '#dfe8f2');
      }
    }
    p.set(cx, base - 38 * s - 1, '#e8eef5');
    return { frames: [p] };
  },
  palm: (r, s) => {
    const p = mk(46 * s, 54 * s), cx = p.w / 2 - 4 * s, base = p.h - 2;
    shadowOval(p, cx + 6 * s, base, 8 * s, 2 * s);
    // ringed, leaning trunk
    const R = pal('#3a2618', '#5a4028', '#8a6a48', '#a88a62', '#c8aa80');
    let x = cx, y = base;
    const n = Math.round(34 * s / A * 1.0) * A;
    const pts = [];
    for (let k = 0; k < n; k++) { x += (0.12 + k * 0.006 / A) / 1; y -= 1; pts.push([x, y]); }
    for (let k = 0; k < pts.length; k++) {
      const [tx, ty] = pts[k], w = 2.6 * s * (1 - k / pts.length * 0.35);
      const ring = k % Math.round(2.6 * A) === 0;
      for (let i = Math.round(-w / 2); i < Math.round(w / 2); i++) {
        const u = (i + 0.5) / (w / 2);
        let c = u < -0.4 ? 3 : u < 0.3 ? 2 : u < 0.75 ? 1 : 0;
        if (ring) c = Math.max(0, c - 1);
        else if (k % Math.round(2.6 * A) === 1 && u < 0) c = Math.min(4, c + 1);
        p.set(tx + i, ty, R[c]);
      }
    }
    const G = FOLIAGE.palm;
    const fronds = [];
    for (let i = 0; i < 8; i++) fronds.push({ a: -Math.PI / 2 + (i - 3.5) * 0.5 + (r() - 0.5) * 0.2, L: (12 + r() * 5) * s });
    fronds.sort((a, b) => Math.abs(a.a + Math.PI / 2) < Math.abs(b.a + Math.PI / 2) ? -1 : 1);
    for (const f of fronds) {
      for (let k = 0; k <= f.L; k += 0.5) {
        const fx = x + Math.cos(f.a) * k, fy = y + Math.sin(f.a) * k * 0.6 + (k * k) / (f.L * 1.6);
        const t = k / f.L;
        p.set(fx, fy, G[t < 0.3 ? 2 : 3]); p.set(fx, fy - 1, G[t < 0.5 ? 3 : 4]);
        // hanging leaflets on both sides, longer mid-frond
        if (Math.round(k * 2) % 3 === 0 && k > 1.5) {
          const ll = Math.round((Math.sin(t * Math.PI) * 3.2 + 1) * A * 0.75);
          for (let j = 1; j <= ll; j++) { p.set(fx - j * 0.45, fy + j, G[j > ll * 0.6 ? 0 : 1]); p.set(fx + j * 0.45, fy + j, G[j > ll * 0.6 ? 1 : 2]); }
        }
      }
    }
    // coconuts
    for (const [ox, oy] of [[-1.5, 1.5], [1.2, 1.8], [0, 2.6]]) { const ccx = x + ox * A, ccy = y + oy * A; p.disc(ccx, ccy, 1.4 * A, '#4a3020'); p.set(Math.round(ccx - 0.6 * A), Math.round(ccy - 0.6 * A), '#8a6a40'); }
    return { frames: sway(p, [0, 0, 1, 0]) };
  },

  // ---- rocks
  sandstone_rock: (r, s) => {
    const p = mk(34 * s, 27 * s), cx = p.w / 2, base = p.h - 3;
    const R = pal('#5a2a24', '#8a4232', '#b0583c', '#cc7650', '#e89a6a');
    boulder(p, cx - 1 * s, base - 7 * s, 13 * s, 8 * s, R, r, { bump: 0.1, flatTop: true, facets: 6 });
    boulder(p, cx + 4 * s, base - 13 * s, 7.5 * s, 5 * s, R, r, { bump: 0.08, flatTop: true, facets: 4, flatBottom: 0.3 });
    // strata: wind-cut layers every ~4 px, a dark seam with a lit lip above it
    const seed = Math.floor(r() * 99);
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      if (p.a(x, y) < 200) continue;
      const yy = y + Math.sin(x * 0.18 / A + seed) * 1.2;
      const m = ((Math.floor(yy) % Math.round(3.6 * A)) + Math.round(3.6 * A)) % Math.round(3.6 * A);
      if (m === 0 && vn(x, y, 3 * A, seed) < 0.75) p.set(x, y, dark(p.get(x, y), 0.78));
      else if (m === 1 && hash2(x, y, seed) < 0.5) p.set(x, y, light(p.get(x, y), 1.06));
    }
    return { frames: [p] };
  },
  mossy_rock: (r, s) => { const p = rockGen(r, s, '#6a6a5e'); capTop(p, pal('#1e3a1a', '#2e5422', '#4a7a2a', '#6a9e34', '#9cc84a'), r, 0.8, { drip: true }); return { frames: [p] }; },
  snow_rock: (r, s) => { const p = rockGen(r, s, '#5a6474'); capTop(p, pal('#8a9ab0', '#b8c6d8', '#dfe8f2', '#f4f8fc', '#ffffff'), r, 0.7); return { frames: [p] }; },
  ash_rock: (r, s) => {
    const p = rockGen(r, s, '#3a3438');
    const em = emisFor(p);
    for (let i = 0; i < 4; i++) {   // glowing fissures
      let x = Math.round(p.w * (0.25 + r() * 0.5)), y = Math.round(p.h * (0.3 + r() * 0.3));
      for (let k = 0; k < 3 * A; k++) { if (p.a(x, y) > 200) { p.set(x, y, '#ff7a30'); em.set(x, y, '#ff7a30'); } y++; x += r() < 0.4 ? 1 : 0; }
    }
    return { frames: [p], emis: em };
  },
  deep_rock: (r, s) => ({ frames: [rockGen(r, s, '#2e2a38')] }),
  coast_rock: (r, s) => {
    // a knot of basalt columns: hexagonal lit tops, three-tone shafts, a wet weedy foot
    const p = mk(28 * s, 31 * s), base = p.h - 3;
    const R = pal('#1a1e22', '#2a3036', '#3c444c', '#56606a', '#7a868e');
    const cw = Math.max(4, Math.round(3.8 * s / A * A)), cols = [];
    const n = Math.max(3, Math.floor((p.w - 4 * A) / cw));
    for (const row of [0, 1]) for (let i = 0; i < n - row; i++) {
      if (r() < 0.2) continue;
      cols.push({ x: Math.round(2 * A + i * cw + row * cw / 2), h: (row ? 5 + r() * 9 : 9 + r() * 13) * s * (1 - Math.abs(i / (n - 1) - 0.5) * 0.6), w: cw, d: row ? 0 : Math.round(2.5 * A) });
    }
    cols.sort((a, b) => a.d - b.d || a.x - b.x);
    for (const c of cols) {
      const x0 = c.x, th = Math.max(2, Math.round(c.w * 0.5)), y1 = base - c.d, top = Math.round(y1 - c.h);
      for (let y = top; y <= y1; y++) for (let j = 0; j < c.w; j++) {
        let i = j === 0 ? 3 : j < c.w * 0.45 ? 2 : j === c.w - 1 ? 0 : 1;
        if (y > y1 - 2 * A) i = Math.max(0, i - 1);                                    // wet base
        if (hash2(x0 + j, Math.floor((y - top) / (3.2 * A)), 9) < 0.12 && j > 0 && j < c.w - 1) i = Math.max(0, i - 1);
        if ((y - top) % Math.round(5 * A) === 0 && y > top + th) i = Math.max(0, i - 1);   // cooling joints
        p.set(x0 + j, y, R[i]);
      }
      for (let k = 0; k < th; k++) for (let j = 0; j < c.w; j++) {
        const inset = k === 0 || k === th - 1 ? 1 : 0;
        if (j < inset || j >= c.w - inset) continue;
        p.set(x0 + j, top - th + 1 + k, k === th - 1 ? R[1] : k === 0 ? R[4] : j < c.w / 2 ? R[4] : R[3]);
      }
      for (let j = 0; j < c.w; j++) if (hash2(x0 + j, y1, 3) < 0.55) { const yy = y1 - Math.round(hash2(j, y1, 4) * 2 * A); p.set(x0 + j, yy, hash2(j, 1, x0) < 0.5 ? '#2a5a3a' : '#4a7a4a'); if (hash2(j, 2, x0) < 0.3) p.set(x0 + j, yy - 1, '#d8d0c0'); }
    }
    return { frames: [p] };
  },
  stalagmite: (r, s) => {
    const p = mk(18 * s, 35 * s), cx = p.w / 2, base = p.h - 2;
    const R = pal('#2a2422', '#3e3632', '#5a5048', '#7a6e62', '#9a8e80');
    const spike = (x, h, w) => {
      for (let k = 0; k < h; k++) {
        const t = k / h, ww = Math.max(0.6, w * (1 - t) * (1 + 0.08 * Math.sin(k * 0.9 / A)));
        for (let xx = Math.round(x - ww); xx <= Math.round(x + ww); xx++) {
          const u = (xx + 0.5 - x) / ww;
          let i = u < -0.45 ? 3 : u < 0.3 ? 2 : u < 0.75 ? 1 : 0;
          if (k % Math.round(4 * A) === 0 && i > 0) i--;
          if (i === 3 && k % Math.round(4 * A) === 1) i = 4;
          p.set(xx, base - k, R[i]);
        }
      }
    };
    spike(cx + 3.5 * s, 11 * s, 2.4 * s);
    spike(cx, 30 * s, 5.6 * s);
    spike(cx - 4 * s, 8 * s, 2 * s);
    p.over(Math.round(cx - 1), Math.round(base - 30 * s + 2), R[4]);
    return { frames: [p] };
  },
  red_pillar: (r, s) => {
    const p = mk(30 * s, 57 * s), cx = p.w / 2, base = p.h - 2;
    const R = pal('#4e2620', '#7a3e2e', '#b0603e', '#c87a50', '#e09a68');
    const h = 48 * s, seed = Math.floor(r() * 99);
    for (let k = 0; k < h; k++) {
      const t = k / h;
      const w = (8 + Math.sin(t * 9) * 1.5 + (t < 0.1 ? 3 * (1 - t / 0.1) : 0)) * s * (1 - t * 0.25);
      const band = Math.floor((k + Math.sin(k * 0.3) * 0.5) / (3.5 * A));
      for (let x = Math.round(-w); x <= Math.round(w); x++) {
        const u = x / w;
        let i = u < -0.55 ? 3 : u < 0.35 ? 2 : u < 0.8 ? 1 : 0;
        if (band % 3 === 1 && i > 0 && i < 3) i = i === 2 ? 3 : 2;               // pale layers
        if ((k % Math.round(3.5 * A)) === 0 && vn(x, k, 2 * A, seed) < 0.6) i = Math.max(0, i - 1);
        if (i === 3 && u < -0.8 && hash2(x, k, seed) < 0.3) i = 4;
        p.set(cx + x, base - k, R[i]);
      }
    }
    // cap rock
    const C2 = pal('#3a1e1a', '#5a2e24', '#8a4430', '#a85a40', '#c47a58');
    boulder(p, cx, base - h - 1 * s, 10.5 * s, 4 * s, C2, r, { bump: 0.08, flatTop: true, facets: 5, flatBottom: 0.2 });
    return { frames: [p] };
  },

  // ---- crystals
  glass_shard: (r, s) => crystals(r, s, '#3e0c1a', '#ff2848'),
  ice_crystal: (r, s) => crystals(r, s, '#7ab0d8', '#c8f0ff'),
  void_crystal: (r, s) => crystals(r, s, '#3a2060', '#b070ff'),
  crystal_blue: (r, s) => crystals(r, s, '#1e4a72', '#60d0ff'),

  // ---- ruins
  column: (r, s) => {
    const p = mk(18 * s, 63 * s), cx = p.w / 2, base = p.h - 2;
    columnPix(p, cx, base, 54 * s, 4.8 * s, MARBLE, false, r);
    capTop(p, pal('#3a4a2a', '#56683a', '#7a8a4a', '#9aac5a', '#c0cc7a'), r, 0.35);
    return { frames: [p] };
  },
  column_broken: (r, s) => {
    const p = mk(40 * s, 35 * s), cx = 10 * s, base = p.h - 2;
    columnPix(p, cx, base, 24 * s, 4.8 * s, MARBLE, true, r);
    // fallen drum lying on its side, fluted, end face toward the viewer's left
    const x0 = Math.round(cx + 9 * s), len = Math.round(15 * s), rr = 4 * s;
    for (let x = 0; x < len; x++) for (let y = Math.round(-rr); y <= Math.round(rr); y++) {
      const v = (y + 0.5) / rr;
      if (Math.abs(v) > 1) continue;
      let i = v < -0.55 ? 4 : v < -0.1 ? 3 : v < 0.45 ? 2 : v < 0.8 ? 1 : 0;
      if (Math.abs(Math.round(y + rr)) % Math.round(1.6 * A) === 0 && i > 0 && i < 4) i--;
      if (x === len - 1) i = Math.max(0, i - 1);
      p.set(x0 + x, base - rr + y, MARBLE[i]);
    }
    p.ellipse(x0, base - rr + 0.5, 1.6 * A, rr, MARBLE[3]);
    p.ring(x0, base - rr + 0.5, rr * 0.6, MARBLE[2]);
    crack(p, x0 + len * 0.5, base - rr * 1.6, 3 * A, MARBLE[1], r);
    capTop(p, pal('#3a4a2a', '#56683a', '#7a8a4a', '#9aac5a', '#c0cc7a'), r, 0.45, { drip: true });
    return { frames: [p] };
  },
  marble_block: (r, s) => {
    const p = mk(30 * s, 25 * s), base = p.h - 2;
    const box = (x, y, w, h) => {
      x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
      const top = Math.round(h * 0.34);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const chipped = (i === 0 || i === w - 1) && (j === 0 || j === h - 1);
        if (chipped) continue;
        let k = j < top ? (j === 0 ? 4 : 3) : i > w - 2 * A ? 1 : 2;
        if (j === top) k = 1;
        if (j === h - 1) k = Math.max(0, k - 1);
        if (k === 2 && vn(x + i, y + j, 2.5 * A, 7) > 0.78) k = 3;                // veining
        p.set(x + i, y + j, MARBLE[k]);
      }
      crack(p, x + w * (0.3 + r() * 0.4), y + top + 1, Math.round(h * 0.5), MARBLE[1], r);
    };
    box(2 * A, base - 12 * s, 20 * s, 12 * s);
    box(10 * s, base - 20 * s, 12 * s, 8 * s);
    capTop(p, pal('#3a4a2a', '#56683a', '#7a8a4a', '#9aac5a', '#c0cc7a'), r, 0.4, { drip: true });
    return { frames: [p] };
  },
  statue_frag: (r, s) => {
    // a giant marble face lying on its cheek, gold laurel on the brow
    const p = mk(44 * s, 33 * s), cx = p.w / 2, base = p.h - 3;
    boulder(p, cx, base - 11 * s, 18 * s, 11 * s, MARBLE, r, { bump: 0.04, facets: 4, lobes: 3 });
    // soften facets into a rounded head
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      if (p.a(x, y) < 200) continue;
      const nx = (x - cx) / (18 * s), ny = (y - (base - 11 * s)) / (11 * s);
      p.set(x, y, MARBLE[lvl(-0.5 * nx - 0.75 * ny + 0.1 + (vn(x, y, 2 * A, 3) - 0.5) * 0.2 - (ny > 0.75 ? 0.5 : 0), [0.6, 0.15, -0.3, -0.7])]);
    }
    const R = MARBLE;
    // eyes (closed lids), brow, nose, lips; the face looks up-right
    for (const ey of [-15, -8]) {
      p.ellipse(cx + 2 * s, base + ey * s, 3 * s, 1.5 * s, R[1]);
      for (let i = -2; i <= 2; i++) p.set(Math.round(cx + 2 * s + i * s * 0.9), Math.round(base + ey * s + Math.abs(i) * 0.3), R[0]);
      p.set(Math.round(cx + 2 * s - 2), Math.round(base + ey * s - 2), R[4]);
      limb(p, cx - 2.5 * s, base + (ey - 1.5) * s, cx - 2.5 * s, base + (ey + 1.5) * s, 1.2 * s, 1.2 * s, R);
    }
    limb(p, cx + 6 * s, base - 13.5 * s, cx + 10 * s, base - 11.5 * s, 2.4 * s, 2.4 * s, R);
    p.set(Math.round(cx + 10.5 * s), Math.round(base - 11 * s), R[0]);
    p.line(cx + 12 * s, base - 14 * s, cx + 12 * s, base - 8 * s, R[1]);
    p.line(cx + 13 * s, base - 13 * s, cx + 13 * s, base - 9 * s, R[0]);
    p.line(cx + 11 * s, base - 13 * s, cx + 11 * s, base - 10 * s, R[3]);
    // laurel wreath
    const G = pal('#6a4a18', '#a87a28', '#d8a840', '#f0cc60', '#fff0a0');
    for (let i = 0; i < 7; i++) {
      const yy = base - (3.5 + i * 2.9) * s, xx = cx - 12.5 * s + Math.sin(i * 0.9) * 0.6 * s;
      for (const sd of [-1, 1]) {
        const lx = xx + sd * 1.5 * A, ly = yy - 0.5 * A;
        p.ellipse(lx, ly, 1.6 * A, 0.9 * A, G[2]);
        p.set(Math.round(lx - 1), Math.round(ly - 1), G[4]); p.set(Math.round(lx + 1), Math.round(ly + 0.5), G[1]);
      }
      p.set(Math.round(xx), Math.round(yy), G[0]);
    }
    for (let k = 0; k < 3; k++) crack(p, cx + (r() - 0.2) * 14 * s, base - 18 * s + r() * 8 * s, Math.round(5 * A), R[1], r);
    capTop(p, pal('#4a5a32', '#6a7a42', '#8a9a5a', '#a8b46a', '#c8d088'), r, 0.3);
    return { frames: [p] };
  },
  rib_bones: (r, s) => {
    const p = mk(54 * s, 31 * s), base = p.h - 4;
    // spine: a chain of vertebrae
    for (let x = Math.round(4 * A); x < p.w - 10 * s; x++) {
      const v = (x % Math.round(2.6 * A));
      p.set(x, base, BONE[v === 0 ? 1 : 2]); p.set(x, base - 1, BONE[v === 0 ? 2 : 3]);
      if (s > 1.2 * A || v !== 0) p.set(x, base + 1, BONE[1]);
      if (v === 1) p.set(x, base - 2, BONE[4]);
    }
    for (let i = 0; i < 6; i++) {
      const x = 8 * A + i * 6 * s, hh = (20 - Math.abs(i - 2.5) * 3) * s;
      const w = Math.max(1.4, 1.5 * s / A);
      for (let k = 0; k < hh; k++) {
        const bend = Math.sin(k / hh * Math.PI) * 3 * s / A * 1.1;
        const xx = Math.round(x - bend), t = k / hh;
        p.set(xx, base - k, BONE[t < 0.15 ? 2 : 3]);
        if (w > 1.5 || t < 0.6) p.set(xx + 1, base - k, BONE[1]);
        if (t > 0.3 && t < 0.7 && k % 3 === 0) p.set(xx - 1, base - k, BONE[4]);
      }
      p.set(Math.round(x - Math.sin(Math.PI * (hh - 1) / hh) * 3 * s / A * 1.1), Math.round(base - hh), BONE[1]);
    }
    // skull lying at the end of the spine
    const sx = p.w - 8 * s, sy = base - 4 * s;
    boulder(p, sx, sy, 7 * s, 5 * s, BONE, r, { bump: 0.05, facets: 3, lobes: 3 });
    p.ellipse(sx + 2 * s, sy - 1 * s, 1.8 * s, 1.5 * s, '#2a1a18');
    p.set(Math.round(sx + 2 * s - 1), Math.round(sy - 1 * s - 1), '#4a3428');
    p.ellipse(sx - 3 * s, sy + 1 * s, 1.2 * s, 0.8 * s, '#3a2a20');
    for (let k = 0; k < 4; k++) p.set(Math.round(sx + (k - 1.5) * 1.6 * A), Math.round(sy + 4 * s), k % 2 ? BONE[1] : BONE[3]);
    return { frames: [p] };
  },
  bone_spike: (r, s) => {
    const p = mk(36 * s, 38 * s), cx = p.w / 2, base = p.h - 2;
    for (const i of [0, 2, 1]) {
      const a = -Math.PI / 2 + (i - 1) * 0.45, L = (26 + r() * 6) * s;
      for (let k = 0; k < L; k++) {
        const t = k / L, w = Math.max(0.6, 3 * s * (1 - t));
        const x = cx + (i - 1) * 6 * A + Math.cos(a) * k + t * t * 6 * A * (i - 1), y = base + Math.sin(a) * k;
        for (let j = Math.round(-w); j <= Math.round(w); j++) {
          const u = j / Math.max(1, w);
          let c = u < -0.5 ? 3 : u < 0.3 ? 2 : u < 0.75 ? 1 : 0;
          if (k % Math.round(5 * A) === 0 && t < 0.7) c = Math.max(0, c - 1);       // growth rings
          if (c === 3 && t > 0.2 && t < 0.8 && j === Math.round(-w)) c = 4;
          p.set(x + j, y, BONE[c]);
        }
      }
    }
    return { frames: [p] };
  },
  fallen_log: (r, s) => {
    const p = mk(48 * s, 19 * s), base = p.h - 3;
    const R = BARK, rr = 4.5 * s, cy = base - rr;
    const x0 = Math.round(4 * A), x1 = Math.round(p.w - 6 * A), seed = Math.floor(r() * 99);
    for (let x = x0; x < x1; x++) for (let y = Math.round(-rr); y < Math.round(rr); y++) {
      const v = (y + 0.5) / rr;
      let i = v < -0.6 ? 3 : v < 0 ? 2 : v < 0.6 ? 1 : 0;
      if (vn(x * 0.3, y * 1.2, 1.3, seed) < 0.3 && i > 0) i--;                    // bark furrows along the log
      if (i === 3 && hash2(x, y, seed) < 0.15) i = 4;
      p.set(x, Math.round(cy + y), R[i]);
    }
    // cut end with growth rings
    const ex = x1 - 1;
    p.ellipse(ex, cy, 2 * A, rr, '#c8a478');
    for (let k = 1; k < 3; k++) p.ring(ex, cy, rr * k / 3, '#9a7650');
    p.set(ex, Math.round(cy), '#6a4a30');
    // broken end
    for (let y = Math.round(-rr); y < Math.round(rr); y++) if (hash2(y, 0, seed) < 0.5) p.clear(x0, Math.round(cy + y));
    capTop(p, pal('#1e3a1a', '#2e5422', '#4a7a2a', '#6a9e34', '#9cc84a'), r, 0.7, { drip: true });
    // a couple of shelf fungi
    for (let k = 0; k < 2; k++) { const fx = Math.round(x0 + (0.3 + k * 0.35) * (x1 - x0)), fy = Math.round(cy + rr * 0.3); p.rect(fx, fy, Math.round(2.2 * A), 1, '#e0c890'); p.rect(fx, fy + 1, Math.round(2.2 * A), 1, '#a08050'); }
    return { frames: [p] };
  },
  driftwood: (r, s) => {
    const p = mk(36 * s, 15 * s), base = p.h - 3;
    const R = pal('#5a5248', '#8a7e6e', '#b8a890', '#d4c6ae', '#eee2cc');
    limb(p, 4 * A, base - 3 * A, p.w - 6 * A, base - 4 * A, 5 * s, 3 * s, R, { grain: true, seed: 5 });
    limb(p, p.w * 0.55, base - 5 * A, p.w * 0.7, base - 10 * s, 2 * s / A * 1.4, 1, R);
    limb(p, p.w * 0.3, base - 4 * A, p.w * 0.22, base - 7 * s, 1.6, 1, R);
    return { frames: [p] };
  },

  // ---- plants & oddities
  ashthorn: (r, s) => {
    const p = mk(40 * s, 29 * s), cx = p.w / 2, base = p.h - 2;
    const em = emisFor(p);
    const R = pal('#120c0e', '#22161a', '#3a2622', '#54382e', '#6e4a3a');
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI * (0.1 + r() * 0.8), L = (8 + r() * 10) * s;
      const ex = cx + Math.cos(a) * L, ey = base + Math.sin(a) * L;
      limb(p, cx, base, ex, ey, 2.2 * A, 1, R);
      // thorns
      for (let k = 0.3; k < 0.9; k += 0.2) { const tx = cx + Math.cos(a) * L * k, ty = base + Math.sin(a) * L * k, sd = (k * 10) % 2 < 1 ? 1 : -1; p.set(tx - Math.sin(a) * sd * 1.5, ty + Math.cos(a) * sd * 1.5, R[1]); }
      if (r() < 0.6) { const kx = cx + Math.cos(a) * L * 0.85, ky = base + Math.sin(a) * L * 0.85; em.set(kx, ky, '#ff8a30'); em.set(kx + 1, ky, '#ffc060'); em.set(kx, ky - 1, '#ff6a20'); p.set(kx, ky, '#ff8a30'); p.set(kx + 1, ky, '#ffc060'); }
    }
    return { frames: [p], emis: em };
  },
  coral: (r, s) => {
    const p = mk(32 * s, 27 * s), cx = p.w / 2, base = p.h - 2;
    const cols = ['#e07a6a', '#f0a050', '#c05a8a'];
    const br = (x, y, a, L, c, d) => {
      const x1 = x + Math.cos(a) * L, y1 = y + Math.sin(a) * L, R = ramp5(c);
      limb(p, x, y, x1, y1, 3 * A, 2 * A, R);
      p.disc(x1, y1, 1.5 * A, R[3]); p.set(Math.round(x1 - 1), Math.round(y1 - 1), R[4]);
      if (d > 0) { br(x1, y1, a - 0.5, L * 0.6, c, d - 1); br(x1, y1, a + 0.5, L * 0.6, c, d - 1); }
    };
    for (const i of [0, 2, 1]) br(cx + (i - 1) * 4 * A, base, -Math.PI / 2 + (i - 1) * 0.4, 8 * s, cols[i], 2);
    // polyp dots
    for (let k = 0; k < 10; k++) { const x = Math.round(cx + (r() - 0.5) * 18 * s), y = Math.round(base - r() * 16 * s); if (p.a(x, y) > 200) p.set(x, y, '#fff0e0'); }
    return { frames: sway(p, [0, 0, 1, 0]) };
  },
  mushroom_giant: (r, s) => {
    const p = mk(40 * s, 51 * s), cx = p.w / 2, base = p.h - 2;
    shadowOval(p, cx, base, 8 * s, 2 * s);
    const stem = pal('#7a7068', '#b0a698', '#d8d0c0', '#ece6d8', '#fffaf0');
    trunk(p, cx, base, base - 27 * s, 6.5 * s, 5 * s, stem, r, { roots: 0, knot: false, flare: 2.5 * s });
    const em = emisFor(p);
    const capY = base - 28 * s;
    // ragged ring (annulus) on the stem
    for (let x = Math.round(-4 * s); x <= Math.round(4 * s); x++) { const yy = Math.round(base - 20 * s + Math.abs(x) * 0.25 + (hash2(x, 3, 1) < 0.4 ? 1 : 0)); p.set(cx + x, yy, stem[x < 0 ? 3 : 1]); p.set(cx + x, yy + 1, stem[0]); }
    // gills: a glowing band of radial lines under the cap
    for (let x = Math.round(-15 * s); x <= Math.round(15 * s); x++) for (let k = 0; k < Math.round(2.4 * A); k++) {
      const y = Math.round(capY + 1 + k + Math.abs(x) * 0.04);
      const gill = (x + 100) % 2 === 0;
      p.set(cx + x, y, gill ? '#3a1a4a' : '#7a3a9a');
      if (!gill) em.set(cx + x, y, alpha('#c070ff', 200));
    }
    const R = pal('#2a0e3a', '#45185e', '#6a2a8a', '#8a44aa', '#b070cc');
    for (let y = Math.round(capY - 13 * s); y <= capY + 1; y++) for (let x = Math.round(cx - 18 * s); x <= cx + 18 * s; x++) {
      const nx = (x + 0.5 - cx) / (17 * s), ny = (y + 0.5 - (capY + 1)) / (12 * s);
      if (ny > 0 || nx * nx + ny * ny > 1 + (hash2(Math.round(Math.atan2(ny, nx) * 9), 0, 5) - 0.5) * 0.06) continue;
      let l = -0.55 * nx - 0.85 * (ny + 0.5) * 1.1;
      if (ny > -0.18) l -= 0.45;
      p.set(x, y, R[lvl(l)]);
    }
    // pale spots, glowing at night
    for (let i = 0; i < 11; i++) {
      const a = Math.PI + r() * Math.PI, d = 0.3 + r() * 0.62;
      const x = cx + Math.cos(a) * 15 * s * d, y = capY + 1 + Math.sin(a) * 10.5 * s * d;
      if (p.a(x, y) < 200) continue;
      const rr = (0.8 + r() * 0.9) * A;
      p.ellipse(x, y, rr, rr * 0.8, '#e8b8f8');
      p.set(Math.round(x - rr * 0.4), Math.round(y - rr * 0.4), '#ffffff');
      em.ellipse(x, y, rr, rr * 0.8, '#f0b0ff');
    }
    return { frames: [p], emis: em };
  },
  mushroom_small: (r, s, v) => {
    const p = mk(22 * A, 16 * A), base = p.h - 2;
    const stem = pal('#8a8072', '#bab09e', '#e0d8c8', '#f0eadc', '#ffffff');
    const order = [0, 2, 1];
    for (const i of order) {
      const x = Math.round(4.5 * A + i * 5 * A + r() * 1.5 * A), h = Math.round((3 + r() * 4) * A * (i === 1 ? 1.1 : 0.85));
      const red = i === 1 ? v % 2 === 0 : v % 2 === 1;
      const cap = red ? pal('#5a1410', '#8a2218', '#c04030', '#e0604a', '#ff9a80') : pal('#4a2a18', '#6a4026', '#a06040', '#c0845a', '#e0b080');
      const sw = Math.max(2, Math.round(1.6 * A));
      for (let k = 0; k < h; k++) for (let j = 0; j < sw; j++) p.set(x + j, base - k, stem[j === 0 ? 3 : j === sw - 1 ? 1 : 2]);
      const cw = 2.8 * A * (i === 1 ? 1.1 : 0.9), ch = 2 * A, cy = base - h;
      for (let y = Math.round(cy - ch); y <= cy + 1; y++) for (let xx = Math.round(x + sw / 2 - cw - 1); xx <= x + sw / 2 + cw + 1; xx++) {
        const nx = (xx + 0.5 - (x + sw / 2)) / cw, ny = (y + 0.5 - (cy + 1)) / (ch + 1);
        if (ny > 0.05 || nx * nx + ny * ny > 1) continue;
        let l = -0.6 * nx - 0.9 * (ny + 0.45);
        if (ny > -0.25) l -= 0.5;
        p.set(xx, y, cap[lvl(l, [0.62, 0.2, -0.2, -0.6])]);
      }
      if (red) { p.set(x - 1, Math.round(cy - ch * 0.5), '#fff0e0'); p.set(x + sw + 1, Math.round(cy - ch * 0.2), '#fff0e0'); p.set(x + 1, Math.round(cy - ch), '#fff0e0'); }
    }
    return { frames: [p] };
  },
  fungal_stalk: (r, s) => {
    const p = mk(32 * s + 8 * A, 54 * s), cx = p.w / 2 - 1.5 * A, base = p.h - 2;
    const R = pal('#141e1e', '#22302e', '#34484a', '#4a6264', '#66807e');
    limb(p, cx, base, cx + 3 * A, base - 36 * s, 6 * s, 4 * s, R, { grain: true, seed: 9 });
    // segment rings
    for (let k = 1; k < 6; k++) { const t = k / 6, y = base - 36 * s * t, x = cx + 3 * A * t, w = (6 - 2 * t) * s / 2; for (let j = Math.round(-w); j <= Math.round(w); j++) p.over(Math.round(x + j), Math.round(y), R[j < 0 ? 2 : 0]); }
    const em = emisFor(p);
    const capC = pal('#0a1a1a', '#123030', '#1a3a3a', '#2a5250', '#3e6e68');
    blob(p, cx + 3 * A, base - 40 * s, 13 * s, 5 * s, '#1a3a3a', r, { bump: 0.05, ramp: capC.slice(0, 4), texture: 0.12 });
    for (let x = Math.round(-11 * s); x <= Math.round(11 * s); x++) { em.set(cx + 3 * A + x, base - 36 * s, '#60ffc0'); if (x % 2 === 0) em.set(cx + 3 * A + x, base - 36 * s - 1, alpha('#60ffc0', 140)); p.set(cx + 3 * A + x, base - 36 * s, '#3a8a70'); }
    for (let i = 0; i < 7; i++) { const x = cx + (r() - 0.5) * 18 * s, y = base - (10 + r() * 22) * s; em.set(x, y, '#80ffd0'); if (r() < 0.5) { em.set(x + 1, y, alpha('#80ffd0', 120)); em.set(x, y + 1, alpha('#80ffd0', 120)); } }
    for (let i = 0; i < 6; i++) { const x = Math.round(cx + 3 * A + (r() - 0.5) * 18 * s), y = Math.round(base - 40 * s - r() * 3 * s); if (p.a(x, y) > 200) { p.set(x, y, '#5ad0a0'); em.set(x, y, '#80ffd0'); } }
    return { frames: [p], emis: em };
  },
  glow_moss: (r, s) => {
    const p = mk(32 * s, 14 * s, Math.round(11 * s));
    const R = pal('#0a1a18', '#122a26', '#1e3a34', '#2c5048', '#40665a');
    crown(p, [[p.w / 2, p.h / 2, 13 * s, 4 * s]], R, r, { clump: 2.2 * A, aspect: 0.6, bias: -0.1 });
    const em = emisFor(p);
    for (let i = 0; i < 14; i++) {
      const x = Math.floor(p.w / 2 + (r() - 0.5) * 22 * s), y = Math.floor(p.h / 2 + (r() - 0.5) * 6 * s);
      if (p.a(x, y) < 200) continue;
      p.set(x, y, '#70ffd0'); em.set(x, y, '#70ffd0');
      if (r() < 0.4) { em.set(x + 1, y, alpha('#70ffd0', 110)); em.set(x, y - 1, alpha('#70ffd0', 110)); }
    }
    return { frames: [p], emis: em };
  },
  rock: (r, s) => ({ frames: [rockGen(r, s, '#6a6460')] }),
};

function pine(r, s, snow) {
  const p = mk(34 * s, 59 * s), cx = p.w / 2, base = p.h - 2;
  shadowOval(p, cx, base, 9 * s, 2.2 * s);
  trunk(p, cx, base, base - 11 * s, 3 * s, 2.2 * s, BARK, r, { roots: 1, knot: false, flare: 1.5 * s });
  const R = FOLIAGE.pine, seed = Math.floor(r() * 999);
  const tiers = 6;
  const SN = pal('#6a7c9a', '#9aaac4', '#ccd8e8', '#eaf2fa', '#ffffff');
  const T = new Int8Array(p.w * p.h).fill(-1), Lb = new Float32Array(p.w * p.h);
  const tooth = Math.max(3, Math.round(2.6 * A));
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const w = (15 - t * 11) * s, top = base - (8 + t * 37) * s, h = (13 - t * 4) * s;
    for (let y = 0; y < h + 3 * A; y++) {
      const yy = Math.round(top + y);
      const ww = Math.round(w * Math.min(1, y / h));
      for (let x = -ww; x <= ww; x++) {
        const ax = Math.abs(x);
        // drooping, toothed lower edge: branch tips hang lower toward the outside
        const edge = h + (ax / Math.max(1, w)) * 2.5 * A - ((ax + i * 3) % tooth) * 0.9 + (hash2(x, i, seed) < 0.3 ? 1 : 0);
        if (y > edge) continue;
        const ny = y / Math.max(1, edge);
        // needle strokes slant down and outward
        const stroke = (ax + y * 1.5 + (x < 0 ? 7 : 0)) % Math.max(3, Math.round(2 * A)) === 0;
        let l = -x / Math.max(1, ww) * 0.85 + (0.25 - ny) * 0.9 + (vn(x, yy, 2.2 * A, seed) - 0.5) * 0.35;
        if (stroke) l -= 0.3;
        if (y > edge - 1.5) l -= 0.55;
        const X = Math.round(cx + x);
        if (X < 0 || X >= p.w || yy < 0 || yy >= p.h) continue;
        p.set(X, yy, R[lvl(l, [0.7, 0.25, -0.2, -0.6])]);
        T[yy * p.w + X] = i; Lb[yy * p.w + X] = l;
      }
    }
  }
  // upper surface of every visible tier: a lit band of needles, or a snow load that is thicker in
  // the middle of each bough and drips over the toothed tips
  for (let X = 0; X < p.w; X++) {
    let run = 0, prev = -1;
    for (let Y = 0; Y < p.h; Y++) {
      const k = Y * p.w + X, ti = T[k];
      if (ti < 0) { run = 0; prev = -1; continue; }
      run = ti === prev ? run + 1 : 0; prev = ti;
      const l = Lb[k];
      if (snow) {
        const depth = (1.2 + vn(X, ti * 7, 2.5 * A, seed + 3) * 2.2) * A * (l > -0.4 ? 1 : 0.5);
        if (run < depth) p.set(X, Y, SN[lvl(l + 0.5 - run / depth * 0.5, [0.75, 0.35, -0.05, -0.45])]);
      } else if (run === 0 && l > -0.5) p.set(X, Y, R[Math.min(4, lvl(l, [0.7, 0.25, -0.2, -0.6]) + 1)]);
    }
  }
  // tip
  p.set(cx, Math.round(base - 46 * s) - 1, snow ? SN[4] : R[3]);
  return { frames: sway(p, [0, 0, 1, 0]) };
}
function rockGen(r, s, base) {
  const p = mk(36 * s, 26 * s), cx = p.w / 2, b = p.h - 3;
  const R = ramp5(base);
  if (r() < 0.7) boulder(p, cx + 8 * s, b - 3.5 * s, 6 * s, 4 * s, R.map((c) => shade(c, 0.92)), r, { bump: 0.14 });
  boulder(p, cx - 2 * s, b - 7 * s, 12 * s, 8 * s, R, r, { bump: 0.16 });
  if (r() < 0.5) boulder(p, cx - 11 * s, b - 1.5 * s, 3.2 * s, 2.2 * s, R, r, { bump: 0.1, facets: 2 });
  for (let i = 0; i < 2; i++) crack(p, cx + (r() - 0.5) * 12 * s, b - 12 * s + r() * 4 * s, Math.round(4 * A), R[0], r);
  return p;
}
function crystals(r, s, body, glowC) {
  const p = mk(34 * s, 44 * s), em = emisFor(p);
  const cx = p.w / 2, base = p.h - 2;
  const R = pal(dark(body, 0.45), dark(body, 0.72), body, light(body, 1.3), light(mixc(body, glowC, 0.5), 1.45));
  const n = 5, list = [];
  for (let i = 0; i < n; i++) {
    const k = i - (n - 1) / 2;
    list.push({ x: cx + k * 4.2 * s + (r() - 0.5) * 2 * A, h: (14 + r() * 20) * s * (Math.abs(k) < 1 ? 1.1 : Math.abs(k) < 2 ? 0.8 : 0.5), w: Math.max(3, Math.round((3.6 + r() * 2.6) * s)), lean: k * 0.13 + (r() - 0.5) * 0.08 });
  }
  list.sort((a, b) => b.h - a.h);
  for (const c of list) crystal(p, em, c.x, base, c.h, c.w, R, c.lean, glowC);
  // shards scattered at the foot
  for (let k = 0; k < 3; k++) { const x = Math.round(cx + (r() - 0.5) * 20 * s), y = base - Math.round(r() * 1.5); p.set(x, y, R[3]); p.set(x + 1, y, R[1]); p.set(x, y - 1, R[4]); }
  return { frames: [p], emis: em };
}
// fluted column: plinth with a torus moulding, tapering fluted shaft, capital; chips and cracks
function columnPix(p, cx, base, h, r, R, broken, rnd) {
  const ph = Math.round(3 * A), seed = Math.floor(rnd() * 99);
  // plinth + torus
  for (let y = 0; y < ph; y++) for (let x = Math.round(-r - 2 * A); x <= Math.round(r + 2 * A); x++) {
    const u = x / (r + 2 * A);
    p.set(cx + x, base - y, R[y === ph - 1 ? 4 : u > 0.75 ? 1 : y === 0 ? 1 : u < -0.6 ? 3 : 2]);
  }
  for (let x = Math.round(-r - 1 * A); x <= Math.round(r + 1 * A); x++) { const u = x / (r + A); p.set(cx + x, base - ph, R[u < -0.4 ? 3 : u > 0.6 ? 1 : 2]); p.set(cx + x, base - ph - 1, R[u < 0.2 ? 4 : 2]); }
  const top = broken ? h * 0.85 : h;
  const flute = Math.max(2, Math.round(1.3 * A));
  for (let y = ph + 2; y < top; y++) {
    const rr = r * (1 - (y / h) * 0.08);
    for (let x = Math.round(-rr); x <= Math.round(rr); x++) {
      const u = x / rr;
      let k = u < -0.7 ? 3 : u < 0.25 ? 2 : u < 0.75 ? 1 : 0;
      if (((x + 64) % flute) === 0 && Math.abs(u) < 0.9) k = Math.max(0, k - 1);            // flute groove
      else if (((x + 64) % flute) === 1 && u < 0.2) k = Math.min(4, k + 1);                 // flute ridge catches light
      if (broken && y > top - 4 * A && hash2(x, Math.floor(y / 2), 3 + seed) < (y - (top - 4 * A)) / (4 * A)) continue;
      if (k > 0 && vn(x, y, 3 * A, seed) > 0.82) k--;                                        // weathering stains
      p.set(cx + x, base - y, R[k]);
    }
  }
  if (!broken) {
    const cy = base - h;
    for (let x = Math.round(-r - 1 * A); x <= Math.round(r + 1 * A); x++) { const u = x / (r + A); p.set(cx + x, cy, R[u < -0.3 ? 3 : u > 0.6 ? 1 : 2]); p.set(cx + x, cy + 1, R[0]); }
    for (let y = 1; y <= Math.round(2.4 * A); y++) for (let x = Math.round(-r - 2 * A); x <= Math.round(r + 2 * A); x++) { const u = x / (r + 2 * A); p.set(cx + x, cy - y, R[y === Math.round(2.4 * A) ? 4 : u > 0.75 ? 1 : u < -0.6 ? 3 : 2]); }
  }
  crack(p, cx + (rnd() - 0.5) * r, base - top * (0.3 + rnd() * 0.4), Math.round(6 * A), R[1], rnd);
}
