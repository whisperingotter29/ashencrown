// Procedural pixel-art props for the world scatter. Each prop returns { frames: [Pix], emis?: Pix }
// with the pivot (ox, oy) at the base centre. Plants get sway frames; crystals get emissive layers.
import { Pix, C, shade, light, dark, mixc, alpha, srand, hash2, bayer } from '../pix.js';

const cache = new Map();

export function propSprite(id, variant = 0, scale = 1) {
  const bucket = scale < 0.85 ? 0 : scale < 1.3 ? 1 : 2;
  const key = id + ':' + variant + ':' + bucket;
  let s = cache.get(key);
  if (!s) {
    const sz = [0.75, 1, 1.35][bucket];
    const fn = GEN[id] || GEN.rock;
    s = fn(srand(hashKey(id) * 31 + variant * 977 + bucket), sz, variant);
    for (const f of new Set(s.frames)) f.outline();
    cache.set(key, s);
  }
  return s;
}
const hashKey = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };

// ------------------------------------------------------------------ helpers
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
// leafy canopy cluster made of several blobs, with leaf-texture flecks
function canopy(p, cx, cy, r, base, rnd, n = 4, squash = 0.8) {
  const R = ramp(base);
  const parts = [];
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, d = i === 0 ? 0 : r * (0.35 + rnd() * 0.35);
    parts.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d * squash - (i === 0 ? 0 : r * 0.1), r * (i === 0 ? 0.78 : 0.5 + rnd() * 0.25)]);
  }
  parts.sort((a, b) => a[1] - b[1]);
  for (const [x, y, rr] of parts) blob(p, x, y, rr, rr * squash, base, rnd, { ramp: R, bump: 0.22, lobes: 6, texture: 0.5 });
  // highlight flecks
  for (let k = 0; k < r * r * 0.25; k++) {
    const x = Math.round(cx + (rnd() - 0.6) * r * 1.3), y = Math.round(cy + (rnd() - 0.7) * r * squash);
    p.over(x, y, R[3]);
  }
  return p;
}
function trunk(p, x, yb, yt, w, base) {
  const R = ramp(base);
  for (let y = yt; y <= yb; y++) {
    const ww = w + (yb - y < 2 ? 1 : 0);
    for (let i = 0; i < ww; i++) p.set(x - Math.floor(ww / 2) + i, y, i === 0 ? R[3] : i === ww - 1 ? R[0] : R[2]);
    if ((y * 7) % 5 === 0) p.set(x, y, R[1]);
  }
}
function tuft(p, x, y, n, h, base, rnd, lean = 0.6, spread = 4) {
  const R = ramp(base);
  for (let i = 0; i < n; i++) {
    const bx = x + Math.round((rnd() - 0.5) * spread * 2), hh = Math.max(2, Math.round(h * (0.6 + rnd() * 0.5)));
    const lx = Math.round((rnd() - 0.5) * 2 * lean * hh * 0.5);
    for (let k = 0; k < hh; k++) {
      const t = k / hh;
      p.set(bx + Math.round(lx * t * t), y - k, t < 0.3 ? R[1] : t < 0.75 ? R[2] : R[3]);
    }
  }
}
function crystal(p, x, yb, h, w, base, lean = 0) {
  const R = [dark(base, 0.45), dark(base, 0.75), C(base), light(base, 1.35)];
  for (let k = 0; k < h; k++) {
    const t = k / h;
    const ww = t > 0.72 ? Math.max(1, Math.round(w * (1 - t) / 0.28)) : w;
    const cx = x + Math.round(lean * k);
    for (let i = 0; i < ww; i++) {
      const xi = cx - Math.floor(ww / 2) + i;
      p.set(xi, yb - k, i < ww / 2 - 0.5 ? R[3] : i === Math.floor(ww / 2) ? R[2] : R[1]);
    }
    if (ww > 2) p.set(cx + Math.ceil(ww / 2) - 1, yb - k, R[0]);
  }
}
// shear a sprite: rows near the top shift more (wind sway frames)
function sway(pix, amps = [-1, 0, 1, 0]) {
  return amps.map((a) => {
    if (!a) return pix;
    const q = new Pix(pix.w, pix.h); q.ox = pix.ox; q.oy = pix.oy;
    for (let y = 0; y < pix.h; y++) {
      const t = 1 - y / pix.oy;
      const sh = Math.round(a * Math.max(0, t) * Math.max(0, t) * 2);
      for (let x = 0; x < pix.w; x++) {
        const k = (y * pix.w + x) * 4;
        if (!pix.d[k + 3]) continue;
        q.set(x + sh, y, [pix.d[k], pix.d[k + 1], pix.d[k + 2], pix.d[k + 3]]);
      }
    }
    return q;
  });
}
function mk(w, h, oy) { const p = new Pix(w, h); p.ox = Math.floor(w / 2); p.oy = oy ?? h - 2; return p; }
function shadowOval(p, cx, cy, rx, ry) { for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1 && !p.a(cx + x, cy + y)) p.set(cx + x, cy + y, [10, 6, 12, 70]); }

// ------------------------------------------------------------------ generators
const GEN = {
  // ---- grasses
  dune_grass: (r, s) => { const p = mk(14, 14); tuft(p, 7, 12, 9, 9 * s, '#c8a060', r, 0.9); return { frames: sway(p) }; },
  grass_gold: (r, s) => { const p = mk(14, 13); tuft(p, 7, 11, 11, 8 * s, '#c8b060', r, 0.7); return { frames: sway(p) }; },
  grass_green: (r, s) => { const p = mk(14, 13); tuft(p, 7, 11, 11, 7 * s, '#5a9a3a', r, 0.6); return { frames: sway(p) }; },
  tundra_grass: (r, s) => { const p = mk(14, 12); tuft(p, 7, 10, 9, 6 * s, '#8a9070', r, 0.6); return { frames: sway(p) }; },
  sea_grass: (r, s) => { const p = mk(14, 14); tuft(p, 7, 12, 10, 9 * s, '#5a9a70', r, 1); return { frames: sway(p) }; },
  flowers: (r, s) => {
    const p = mk(14, 12);
    tuft(p, 7, 10, 8, 6 * s, '#6a8a3a', r, 0.5);
    const cols = ['#e04040', '#f0e0a0', '#e8a030', '#c050c0', '#80a0ff'];
    for (let i = 0; i < 5; i++) { const x = 3 + Math.floor(r() * 8), y = 3 + Math.floor(r() * 4); const c = C(cols[Math.floor(r() * cols.length)]); p.set(x, y, c); p.set(x + 1, y, c); p.set(x, y - 1, light(c)); p.set(x + 1, y + 1, '#f8e890'); }
    return { frames: sway(p, [-1, 0, 1, 0]) };
  },
  fern: (r, s) => {
    const p = mk(18, 14);
    const R = ramp('#4a8a3a');
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + (i / 6) * Math.PI;
      const L = (6 + r() * 2) * s;
      for (let k = 0; k <= L; k++) {
        const x = 9 + Math.cos(a) * k, y = 12 + Math.sin(a) * k * 0.7 + (k * k) / (L * 3);
        p.set(x, y, k < L * 0.4 ? R[1] : R[2]);
        if (k % 2 === 0) { p.set(x + Math.sin(a), y - 1, R[3]); }
      }
    }
    return { frames: sway(p, [-1, 0, 1, 0]) };
  },
  bush: (r, s) => { const p = mk(22, 18); canopy(p, 11, 10, 7 * s, '#3a7a30', r, 4, 0.75); return { frames: sway(p, [0, 0, 1, 0]) }; },

  // ---- trees
  oak: (r, s) => {
    const p = mk(Math.round(36 * s), Math.round(44 * s));
    const cx = p.w / 2, base = p.h - 2;
    shadowOval(p, cx, base, 9 * s, 2.5 * s);
    trunk(p, Math.round(cx), base, Math.round(base - 18 * s), Math.max(3, Math.round(4 * s)), '#5a4030');
    p.line(cx, base - 12 * s, cx + 5 * s, base - 18 * s, '#5a4030', 2);
    canopy(p, cx, base - 24 * s, 12 * s, '#3d7a32', r, 5, 0.85);
    return { frames: sway(p, [0, 0, 1, 0]) };
  },
  oak_big: (r, s) => {
    const p = mk(Math.round(52 * s), Math.round(64 * s));
    const cx = p.w / 2, base = p.h - 2;
    shadowOval(p, cx, base, 14 * s, 3.5 * s);
    trunk(p, Math.round(cx), base, Math.round(base - 26 * s), Math.max(5, Math.round(7 * s)), '#4a3626');
    for (const sd of [-1, 1]) p.line(cx, base - 2, cx + sd * 6 * s, base, '#3a2a1e', 2);
    p.line(cx, base - 18 * s, cx - 9 * s, base - 28 * s, '#4a3626', 3);
    p.line(cx, base - 20 * s, cx + 10 * s, base - 30 * s, '#4a3626', 3);
    canopy(p, cx, base - 36 * s, 18 * s, '#2e6a2a', r, 7, 0.82);
    return { frames: sway(p, [0, 0, 1, 0]) };
  },
  olive: (r, s) => {
    const p = mk(Math.round(32 * s), Math.round(34 * s));
    const cx = p.w / 2, base = p.h - 2;
    shadowOval(p, cx, base, 8 * s, 2 * s);
    p.taper(cx, base, cx + 2, base - 9 * s, 4 * s, 2.5 * s, '#6a5a48');
    p.taper(cx + 2, base - 9 * s, cx - 3, base - 14 * s, 2.5 * s, 2, '#6a5a48');
    canopy(p, cx, base - 19 * s, 10 * s, '#8a9a6a', r, 5, 0.7);
    return { frames: sway(p, [0, 0, 1, 0]) };
  },
  cypress: (r, s) => {
    const h = Math.round(46 * s), p = mk(Math.round(16 * s), h + 2);
    const cx = p.w / 2, base = p.h - 2;
    shadowOval(p, cx, base, 5 * s, 1.5 * s);
    trunk(p, Math.round(cx), base, base - 4, 2, '#4a3a2a');
    const R = ramp('#3a6a32');
    for (let y = 0; y < h - 4; y++) {
      const t = y / (h - 4);
      const w = Math.max(1, Math.round(6.5 * s * Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95)) * (t < 0.2 ? 0.9 + t : 1)));
      const yy = base - 4 - y;
      for (let x = -w; x <= w; x++) {
        const l = -x / w * 0.8 + (hash2(x, yy, 4) - 0.5) * 0.7 + (y % 5 === 0 ? -0.3 : 0);
        p.set(cx + x, yy, R[l > 0.45 ? 3 : l > -0.2 ? 2 : l > -0.7 ? 1 : 0]);
      }
    }
    return { frames: sway(p, [0, 0, 1, 0]) };
  },
  pine: (r, s) => pine(r, s, false),
  pine_snow: (r, s) => pine(r, s, true),
  dead_tree: (r, s) => {
    const p = mk(Math.round(30 * s), Math.round(40 * s));
    const cx = p.w / 2, base = p.h - 2;
    shadowOval(p, cx, base, 6 * s, 1.5 * s);
    p.taper(cx, base, cx, base - 22 * s, 4 * s, 2, '#8a7a68');
    const br = (x0, y0, a, L, w) => { const x1 = x0 + Math.cos(a) * L, y1 = y0 + Math.sin(a) * L; p.taper(x0, y0, x1, y1, w, 1, '#8a7a68'); if (L > 4) { br(x1, y1, a - 0.5, L * 0.55, Math.max(1, w - 1)); br(x1, y1, a + 0.45, L * 0.5, Math.max(1, w - 1)); } };
    br(cx, base - 16 * s, -2.3, 9 * s, 2); br(cx, base - 20 * s, -0.8, 9 * s, 2); br(cx, base - 22 * s, -1.6, 7 * s, 2);
    p.rim(1.15, 0.8);
    return { frames: [p] };
  },
  dead_pine: (r, s) => {
    const p = mk(Math.round(24 * s), Math.round(44 * s));
    const cx = p.w / 2, base = p.h - 2;
    shadowOval(p, cx, base, 5 * s, 1.5 * s);
    p.taper(cx, base, cx, base - 38 * s, 3.5 * s, 1, '#5a4a40');
    for (let i = 0; i < 6; i++) { const y = base - (10 + i * 5) * s, L = (8 - i) * s; for (const sd of [-1, 1]) { p.line(cx, y, cx + sd * L, y + L * 0.45, '#5a4a40'); p.set(cx + sd * L, y + L * 0.45 - 1, '#e8eef5'); } }
    return { frames: [p] };
  },
  palm: (r, s) => {
    const p = mk(Math.round(44 * s), Math.round(52 * s));
    const cx = p.w / 2 - 4 * s, base = p.h - 2;
    shadowOval(p, cx + 6 * s, base, 8 * s, 2 * s);
    // ringed, leaning trunk
    let x = cx, y = base;
    const R = ramp('#8a6a48');
    for (let k = 0; k < 34 * s; k++) {
      x += 0.12 + k * 0.006; y -= 1;
      p.set(x - 1, y, R[3]); p.set(x, y, R[2]); p.set(x + 1, y, R[1]); if (k % 3 === 0) p.set(x, y, R[0]);
    }
    const G = ramp('#4a9a3a');
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * 0.55 + (r() - 0.5) * 0.2;
      const L = (12 + r() * 5) * s;
      for (let k = 0; k <= L; k++) {
        const fx = x + Math.cos(a) * k, fy = y + Math.sin(a) * k * 0.6 + (k * k) / (L * 1.6);
        p.set(fx, fy, G[2]); p.set(fx, fy - 1, G[3]);
        if (k % 2 && k > 2) { p.set(fx + Math.sin(a) * 2, fy + 1, G[1]); p.set(fx - Math.sin(a) * 2, fy + 1, G[1]); }
      }
    }
    p.disc(x, y + 1, 1.6, '#5a4030');
    return { frames: sway(p, [0, 0, 1, 0]) };
  },

  // ---- rocks
  sandstone_rock: (r, s) => {
    const p = mk(Math.round(34 * s), Math.round(26 * s));
    const cx = p.w / 2, base = p.h - 3;
    blob(p, cx, base - 7 * s, 13 * s, 8 * s, '#b0583c', r, { bump: 0.12, flat: true });
    blob(p, cx + 4 * s, base - 14 * s, 7 * s, 5 * s, '#c06a48', r, { bump: 0.1 });
    // strata
    for (let y = 0; y < p.h; y += 3) for (let x = 0; x < p.w; x++) if (p.a(x, y) && hash2(x >> 2, y, 7) < 0.6) p.over(x, y, dark(p.get(x, y), 0.85));
    return { frames: [p] };
  },
  mossy_rock: (r, s) => { const p = rockGen(r, s, '#6a6a5e'); mossTop(p, '#4a8a2a', r); return { frames: [p] }; },
  snow_rock: (r, s) => { const p = rockGen(r, s, '#5a6474'); mossTop(p, '#eef2f8', r, 0.55); return { frames: [p] }; },
  ash_rock: (r, s) => { const p = rockGen(r, s, '#3a3438'); for (let i = 0; i < 6; i++) p.over(Math.floor(r() * p.w), Math.floor(r() * p.h * 0.6), '#ff7a30'); return { frames: [p] }; },
  deep_rock: (r, s) => ({ frames: [rockGen(r, s, '#2e2a38')] }),
  coast_rock: (r, s) => {
    const p = mk(Math.round(26 * s), Math.round(30 * s));
    const base = p.h - 3;
    const R = ramp('#3a3e44');
    for (let i = 0; i < 5; i++) {
      const x = 4 + Math.floor(r() * (p.w - 8)), h = Math.round((8 + r() * 14) * s), w = 4;
      for (let k = 0; k < h; k++) for (let j = 0; j < w; j++) p.set(x + j, base - k - Math.round(i * 0.5), j === 0 ? R[3] : j === w - 1 ? R[0] : R[2]);
      for (let j = 0; j < w; j++) p.set(x + j, base - h - Math.round(i * 0.5), '#6a7a6a');
    }
    return { frames: [p] };
  },
  stalagmite: (r, s) => {
    const p = mk(Math.round(18 * s), Math.round(34 * s));
    const cx = p.w / 2, base = p.h - 2;
    const R = ramp('#5a5048');
    const h = 30 * s;
    for (let k = 0; k < h; k++) { const w = Math.max(1, Math.round(6 * s * (1 - k / h))); for (let x = -w; x <= w; x++) p.set(cx + x, base - k, R[x < -w / 3 ? 3 : x > w / 3 ? 1 : 2]); if (k % 6 === 0) p.set(cx, base - k, R[0]); }
    return { frames: [p] };
  },
  red_pillar: (r, s) => {
    const p = mk(Math.round(30 * s), Math.round(56 * s));
    const cx = p.w / 2, base = p.h - 2;
    const R = ramp('#b0603e');
    const h = 48 * s;
    for (let k = 0; k < h; k++) {
      const t = k / h;
      const w = Math.round((8 + Math.sin(t * 9) * 1.5 + (t < 0.1 ? 3 : 0)) * s * (1 - t * 0.25));
      for (let x = -w; x <= w; x++) p.set(cx + x, base - k, R[x < -w / 2 ? 3 : x > w / 2 ? 1 : (k % 7 === 0 ? 1 : 2)]);
    }
    blob(p, cx, base - h, 10 * s, 4 * s, '#8a4430', r, { bump: 0.1 });
    return { frames: [p] };
  },

  // ---- crystals
  glass_shard: (r, s) => crystals(r, s, '#2a0a14', '#ff2848'),
  ice_crystal: (r, s) => crystals(r, s, '#9ad0f0', '#c8f0ff'),
  void_crystal: (r, s) => crystals(r, s, '#2a1840', '#b070ff'),
  crystal_blue: (r, s) => crystals(r, s, '#1a3a5a', '#60d0ff'),

  // ---- ruins
  column: (r, s) => {
    const p = mk(Math.round(18 * s), Math.round(62 * s));
    const cx = p.w / 2, base = p.h - 2;
    columnPix(p, cx, base, 54 * s, 5 * s, '#e6dcc4', false);
    return { frames: [p] };
  },
  column_broken: (r, s) => {
    const p = mk(Math.round(40 * s), Math.round(34 * s));
    const cx = 10 * s, base = p.h - 2;
    columnPix(p, cx, base, 24 * s, 5 * s, '#e0d6be', true);
    // fallen drum
    const R = ramp('#d8ceb6');
    for (let x = 0; x < 16 * s; x++) for (let y = 0; y < 8 * s; y++) p.set(cx + 8 * s + x, base - y, R[y < 2 ? 3 : y > 6 * s ? 1 : x % 3 === 0 ? 1 : 2]);
    p.ellipse(cx + 8 * s, base - 4 * s, 2, 4 * s, '#b8ae96');
    mossTop(p, '#8a9a5a', r, 0.3);
    return { frames: [p] };
  },
  marble_block: (r, s) => {
    const p = mk(Math.round(30 * s), Math.round(24 * s));
    const base = p.h - 2;
    const R = ramp('#ddd2b8');
    const box = (x, y, w, h) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) p.set(x + i, y + j, R[j < h * 0.35 ? 3 : i > w - 3 ? 1 : 2]); for (let i = 0; i < w; i++) p.set(x + i, y + Math.round(h * 0.35), R[1]); };
    box(2, base - 12 * s, 20 * s, 12 * s);
    box(10 * s, base - 20 * s, 12 * s, 8 * s);
    mossTop(p, '#8a9a5a', r, 0.4);
    return { frames: [p] };
  },
  statue_frag: (r, s) => {
    // a giant marble face lying on its cheek, gold laurel on the brow
    const p = mk(Math.round(44 * s), Math.round(32 * s));
    const cx = p.w / 2, base = p.h - 3;
    blob(p, cx, base - 11 * s, 18 * s, 11 * s, '#e4dac2', r, { bump: 0.05, texture: 0.15 });
    const R = ramp('#e4dac2');
    // eye socket, nose, lips (face looking up-right)
    p.ellipse(cx + 2 * s, base - 15 * s, 3 * s, 1.6 * s, R[0]);
    p.ellipse(cx + 2 * s, base - 8 * s, 3 * s, 1.6 * s, R[0]);
    p.line(cx + 7 * s, base - 13 * s, cx + 10 * s, base - 11 * s, R[1], 2);
    p.line(cx + 12 * s, base - 14 * s, cx + 12 * s, base - 8 * s, R[1]);
    for (let i = 0; i < 6; i++) { const yy = base - (4 + i * 3.3) * s; p.ellipse(cx - 12 * s, yy, 2.5, 1.4, '#e8c860'); p.set(cx - 13 * s, yy - 1, '#fff0a0'); }
    mossTop(p, '#a8a868', r, 0.25);
    return { frames: [p] };
  },
  rib_bones: (r, s) => {
    const p = mk(Math.round(54 * s), Math.round(30 * s));
    const base = p.h - 4;
    const bone = ramp('#e8dcc4');
    // spine
    for (let x = 4; x < p.w - 10; x++) { p.set(x, base, bone[2]); p.set(x, base - 1, bone[3]); if (x % 4 === 0) p.set(x, base + 1, bone[1]); }
    for (let i = 0; i < 6; i++) {
      const x = 8 + i * 6 * s, hh = (20 - Math.abs(i - 2.5) * 3) * s;
      for (let k = 0; k < hh; k++) { const bend = Math.round(Math.sin(k / hh * Math.PI) * 3); p.set(x - bend, base - k, bone[k < hh * 0.5 ? 2 : 3]); p.set(x - bend + 1, base - k, bone[1]); }
    }
    blob(p, p.w - 8 * s, base - 4 * s, 7 * s, 5 * s, '#e8dcc4', r, { bump: 0.06 });
    p.disc(p.w - 6 * s, base - 5 * s, 1.6 * s, '#3a2a20');
    return { frames: [p] };
  },
  bone_spike: (r, s) => {
    const p = mk(Math.round(30 * s), Math.round(36 * s));
    const cx = p.w / 2, base = p.h - 2;
    const bone = ramp('#d8ccb8');
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i - 1) * 0.45, L = (26 + r() * 6) * s;
      for (let k = 0; k < L; k++) {
        const t = k / L, w = Math.max(1, Math.round(3 * s * (1 - t)));
        const x = cx + (i - 1) * 6 + Math.cos(a) * k + t * t * 6 * (i - 1), y = base + Math.sin(a) * k;
        for (let j = -w; j <= w; j++) p.set(x + j, y, bone[j < 0 ? 3 : j > 0 ? 1 : 2]);
      }
    }
    return { frames: [p] };
  },
  fallen_log: (r, s) => {
    const p = mk(Math.round(48 * s), Math.round(18 * s));
    const base = p.h - 3;
    const R = ramp('#5a4232');
    for (let x = 4; x < p.w - 6; x++) for (let y = 0; y < 9 * s; y++) p.set(x, base - y, R[y > 7 * s ? 3 : y < 2 ? 0 : (x + y * 3) % 7 === 0 ? 1 : 2]);
    p.ellipse(p.w - 6, base - 4.5 * s, 3, 4.5 * s, '#b09070');
    p.ring(p.w - 6, base - 4.5 * s, 2.2 * s, '#8a6a50');
    mossTop(p, '#4a8a2a', r, 0.5);
    return { frames: [p] };
  },
  driftwood: (r, s) => {
    const p = mk(Math.round(36 * s), Math.round(14 * s));
    const base = p.h - 3;
    p.taper(4, base - 3, p.w - 6, base - 4, 5 * s, 3 * s, '#c8b8a0');
    p.line(p.w * 0.55, base - 5, p.w * 0.7, base - 10 * s, '#b8a890', 2);
    p.rim(1.12, 0.8);
    return { frames: [p] };
  },

  // ---- plants & oddities
  ashthorn: (r, s) => {
    const p = mk(Math.round(30 * s), Math.round(26 * s));
    const cx = p.w / 2, base = p.h - 2;
    const em = new Pix(p.w, p.h); em.ox = p.ox; em.oy = p.oy;
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI * (0.1 + r() * 0.8), L = (8 + r() * 10) * s;
      p.taper(cx, base, cx + Math.cos(a) * L, base + Math.sin(a) * L, 2, 1, '#3a2622');
      if (r() < 0.6) { const ex = cx + Math.cos(a) * L * 0.8, ey = base + Math.sin(a) * L * 0.8; em.set(ex, ey, '#ff8a30'); em.set(ex + 1, ey, '#ffc060'); }
    }
    return { frames: [p], emis: em };
  },
  coral: (r, s) => {
    const p = mk(Math.round(26 * s), Math.round(24 * s));
    const cx = p.w / 2, base = p.h - 2;
    const cols = ['#e07a6a', '#f0a050', '#c05a8a'];
    const br = (x, y, a, L, c, d) => { const x1 = x + Math.cos(a) * L, y1 = y + Math.sin(a) * L; p.taper(x, y, x1, y1, 3, 2, c); p.disc(x1, y1, 1.5, light(c)); if (d > 0) { br(x1, y1, a - 0.5, L * 0.6, c, d - 1); br(x1, y1, a + 0.5, L * 0.6, c, d - 1); } };
    for (let i = 0; i < 3; i++) br(cx + (i - 1) * 4, base, -Math.PI / 2 + (i - 1) * 0.4, 8 * s, cols[i], 2);
    return { frames: sway(p, [0, 0, 1, 0]) };
  },
  mushroom_giant: (r, s) => {
    const p = mk(Math.round(40 * s), Math.round(50 * s));
    const cx = p.w / 2, base = p.h - 2;
    shadowOval(p, cx, base, 8 * s, 2 * s);
    trunk(p, Math.round(cx), base, Math.round(base - 26 * s), Math.round(6 * s), '#d8d0c0');
    const em = new Pix(p.w, p.h); em.ox = p.ox; em.oy = p.oy;
    // cap: dome with gills underside
    const capY = base - 28 * s;
    for (let x = -16 * s; x <= 16 * s; x++) em.set(cx + x, capY + 2, '#c070ff');
    blob(p, cx, capY - 3 * s, 17 * s, 9 * s, '#6a2a8a', r, { bump: 0.06, texture: 0.2 });
    for (let i = 0; i < 9; i++) { const x = cx + (r() - 0.5) * 26 * s, y = capY - 3 * s - r() * 8 * s; if (p.a(x, y)) { em.disc(x, y, 1.2 + r(), '#f0b0ff'); } }
    return { frames: [p], emis: em };
  },
  mushroom_small: (r, s) => {
    const p = mk(18, 14);
    for (let i = 0; i < 3; i++) {
      const x = 4 + i * 5 + Math.floor(r() * 2), h = 3 + Math.floor(r() * 4), c = i === 1 ? '#c04030' : '#a06040';
      p.rect(x, 12 - h, 2, h, '#e0d8c8');
      blob(p, x + 1, 12 - h - 1, 3, 2, c, r, { bump: 0.05, texture: 0.1 });
      if (i === 1) { p.set(x, 12 - h - 2, '#fff0e0'); p.set(x + 2, 12 - h - 1, '#fff0e0'); }
    }
    return { frames: [p] };
  },
  fungal_stalk: (r, s) => {
    const p = mk(Math.round(32 * s), Math.round(52 * s));
    const cx = p.w / 2, base = p.h - 2;
    p.taper(cx, base, cx + 3, base - 36 * s, 6 * s, 4 * s, '#3a4a48');
    const em = new Pix(p.w, p.h); em.ox = p.ox; em.oy = p.oy;
    blob(p, cx + 3, base - 40 * s, 13 * s, 5 * s, '#1a3a3a', r, { bump: 0.05 });
    for (let x = -11 * s; x <= 11 * s; x++) em.set(cx + 3 + x, base - 36 * s, '#60ffc0');
    for (let i = 0; i < 6; i++) em.disc(cx + (r() - 0.5) * 18 * s, base - (10 + r() * 22) * s, 1, '#80ffd0');
    return { frames: [p], emis: em };
  },
  glow_moss: (r, s) => {
    const p = mk(Math.round(30 * s), Math.round(12 * s), Math.round(10 * s));
    blob(p, p.w / 2, p.h / 2, 13 * s, 4 * s, '#1e3a34', r, { bump: 0.25, flat: true });
    const em = new Pix(p.w, p.h); em.ox = p.ox; em.oy = p.oy;
    for (let i = 0; i < 9; i++) em.set(Math.floor(p.w / 2 + (r() - 0.5) * 22 * s), Math.floor(p.h / 2 + (r() - 0.5) * 6 * s), '#70ffd0');
    return { frames: [p], emis: em };
  },
  rock: (r, s) => ({ frames: [rockGen(r, s, '#6a6460')] }),
};

function pine(r, s, snow) {
  const p = mk(Math.round(34 * s), Math.round(58 * s));
  const cx = p.w / 2, base = p.h - 2;
  shadowOval(p, cx, base, 9 * s, 2.2 * s);
  trunk(p, Math.round(cx), base, Math.round(base - 10 * s), 3, '#4a3628');
  const R = ramp('#2a5a3e');
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const w = (15 - t * 11) * s, top = base - (8 + t * 36) * s, h = (14 - t * 4) * s;
    for (let y = 0; y < h; y++) {
      const ww = Math.round(w * (y / h));
      for (let x = -ww; x <= ww; x++) {
        const yy = Math.round(top + y + (Math.abs(x) / Math.max(1, w)) * 2.5);
        const l = -x / Math.max(1, ww) * 0.9 + (hash2(x, yy, 9) - 0.5) * 0.6 - (y > h - 2 ? 0.6 : 0);
        p.set(cx + x, yy, R[l > 0.5 ? 3 : l > -0.15 ? 2 : l > -0.65 ? 1 : 0]);
        if (snow && y < 3 + (hash2(x, i, 2) * 2) && l > -0.6) p.set(cx + x, yy, l > 0.2 ? '#ffffff' : '#d8e4f0');
      }
    }
  }
  return { frames: sway(p, [0, 0, 1, 0]) };
}
function rockGen(r, s, base) {
  const p = mk(Math.round(32 * s), Math.round(24 * s));
  const cx = p.w / 2, b = p.h - 3;
  blob(p, cx - 2 * s, b - 7 * s, 12 * s, 8 * s, base, r, { bump: 0.16 });
  if (r() < 0.7) blob(p, cx + 8 * s, b - 4 * s, 6 * s, 4 * s, shade(base, 0.9), r, { bump: 0.14 });
  // cracks
  for (let i = 0; i < 3; i++) { let x = cx + (r() - 0.5) * 14 * s, y = b - 10 * s + r() * 6; for (let k = 0; k < 5; k++) { p.over(x, y, dark(base, 0.5)); x += r() < 0.5 ? 1 : 0; y += 1; } }
  return p;
}
function mossTop(p, color, r, amt = 0.7) {
  const R = ramp(color);
  for (let x = 0; x < p.w; x++) {
    let top = -1;
    for (let y = 0; y < p.h; y++) if (p.a(x, y) > 200) { top = y; break; }
    if (top < 0) continue;
    const depth = Math.round((1 + hash2(x, 3, 7) * 3) * amt * 2);
    for (let k = 0; k < depth; k++) p.over(x, top + k, R[k === 0 ? 3 : 2]);
  }
}
function crystals(r, s, body, glowC) {
  const p = mk(Math.round(30 * s), Math.round(40 * s));
  const em = new Pix(p.w, p.h); em.ox = p.ox; em.oy = p.oy;
  const cx = p.w / 2, base = p.h - 2;
  const n = 4;
  const list = [];
  for (let i = 0; i < n; i++) list.push({ x: cx + (i - (n - 1) / 2) * 5 * s + (r() - 0.5) * 3, h: (14 + r() * 20) * s * (i === 1 || i === 2 ? 1.1 : 0.75), w: Math.max(3, Math.round((4 + r() * 3) * s)), lean: (i - (n - 1) / 2) * 0.12 + (r() - 0.5) * 0.1 });
  list.sort((a, b) => b.h - a.h);
  for (const c of list) {
    crystal(p, c.x, base, c.h, c.w, body, c.lean);
    // glowing core line
    for (let k = 2; k < c.h * 0.7; k++) em.set(c.x + Math.round(c.lean * k), base - k, alpha(glowC, 200));
  }
  return { frames: [p], emis: em };
}
function columnPix(p, cx, base, h, r, color, broken) {
  const R = ramp(color);
  // base plinth
  for (let x = -r - 2; x <= r + 2; x++) for (let y = 0; y < 3; y++) p.set(cx + x, base - y, R[y === 2 ? 3 : x > r ? 1 : 2]);
  const top = broken ? h * 0.85 : h;
  for (let y = 3; y < top; y++) for (let x = -r; x <= r; x++) {
    let k = Math.abs(x) % 2 === 0 ? 2 : 1;      // flutes
    if (x <= -r + 1) k = 3; if (x >= r - 1) k = 0;
    if (broken && y > top - 4 && hash2(x, y, 3) < (y - (top - 4)) / 4) continue;
    p.set(cx + x, base - y, R[k]);
  }
  if (!broken) for (let x = -r - 2; x <= r + 2; x++) for (let y = 0; y < 3; y++) p.set(cx + x, base - h - y, R[y === 2 ? 3 : 2]);
}
