// Shared pixel-drawing helpers for creature sprites: 5-tone ramps, shaded ellipse unions, layer
// compositing with inner contours, cylinder shading, trimming, eyes. Used by the stock creature
// bodies (creatures.js) and the hand-built monster designs (monsters/).
import { Pix, C, light, dark, mixc, hash2, ART, ap, OUTLINE, CREAM } from '../pix.js';
import { rampStep, capChroma } from '../lookTone.js';
// palette constants (src/px/palette.js): ink-plum eyes, cream bone, maroon maws, cream glints
export const EYE_DARK = C('#1d0814');
export const BONE = C(CREAM);
export const BONE_D = C('#cfa978');
export const MAW = C('#4a1420');
export const MAW_D = C('#2a0e18');
export const TONGUE = C('#a94a68');
export const WHITE = C('#fff4dc');
export const VOID = C('#140913');

// ------------------------------------------------------------------ helpers
export function mk(w, h, ox, oy) { const p = new Pix(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h))); p.ox = Math.round(ox); p.oy = Math.round(oy); return p; }
export const blank = (p) => mk(p.w, p.h, p.ox, p.oy);
export const lerp = (a, b, t) => a + (b - a) * t;
export const lerpP = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

// 5-tone ramp: deep shadow, shadow, mid, base, highlight. Taken from the base's own master ramp
// where it sits on one (src/px/palette.js); otherwise hue-shifted dark() / light(), shadows cool
// toward plum with their chroma held near the base's, highlights warm toward cream
export const RAMPS = new Map();
export const down = (b, n, k) => { const s = rampStep(b, -n); return s ? C(s) : capChroma(dark(b, k), b); };
export function ramp5(base) {
  const b = C(base), k = b.join(',');
  let r = RAMPS.get(k);
  if (!r) { const u = rampStep(b, 1); r = [down(b, 3, 0.45), down(b, 2, 0.63), down(b, 1, 0.81), b, u ? C(u) : light(b, 1.15)]; RAMPS.set(k, r); }
  return r;
}
export const dimR = (R, k) => R.map((c) => dark(c, k));

// light from the top-left and a little toward the viewer
export const LX = -0.48, LY = -0.62, LZ = 0.62;
export const tone = (l) => (l > 0.8 ? 4 : l > 0.32 ? 3 : l > -0.08 ? 2 : l > -0.5 ? 1 : 0);
// fur: 1-px wide strands, 4 px long, with a random phase per column (jagged band edges)
export const furN = (x, y, sd) => { const c = x >> 1; return hash2(c, Math.floor((y + Math.floor(hash2(c, 3, sd) * 5)) / 5), sd) - 0.5; };
// texture clusters: 3x2 bricks offset every other row (never per-pixel speckle)
export const clump = (x, y, sd) => hash2(Math.floor((x + ((y >> 1) & 1) * 2) / 3), y >> 1, sd) - 0.5;
// scales: staggered 4x3 cells, each a lit top and a dark rounded lower edge
export const scaleN = (x, y) => {
  const r = Math.floor(y / 3), lx = ((x + (r & 1) * 2) % 4 + 4) % 4, ly = ((y % 3) + 3) % 3;
  if (ly === 2 && (lx === 1 || lx === 2)) return -0.2;
  if (ly === 1 && (lx === 0 || lx === 3)) return -0.1;
  return ly === 0 && (lx === 1 || lx === 2) ? 0.08 : 0;
};

// Union of ellipses shaded as one form: each pixel takes the normal of the ellipse it sits
// deepest in, so a chest or hump grows out of the body without a seam.
// list: [[cx, cy, rx, ry], ...]
export function balls(p, list, R, o = {}) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const b of list) { b[2] = Math.max(0.6, b[2]); b[3] = Math.max(0.6, b[3]); x0 = Math.min(x0, b[0] - b[2]); x1 = Math.max(x1, b[0] + b[2]); y0 = Math.min(y0, b[1] - b[3]); y1 = Math.max(y1, b[1] + b[3]); }
  for (let y = Math.floor(y0) - 1; y <= Math.ceil(y1) + 1; y++) {
    if (o.clipY !== undefined && y > o.clipY) continue;
    for (let x = Math.floor(x0) - 1; x <= Math.ceil(x1) + 1; x++) {
      let best = 2, bx = 0, by = 0;
      for (const [cx, cy, rx, ry] of list) {
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry, d = nx * nx + ny * ny;
        if (d < best) { best = d; bx = nx; by = ny; }
      }
      if (best > 1) continue;
      let l = bx * LX + by * LY + Math.sqrt(1 - best) * LZ + (o.lift || 0);
      if (o.fur) l += furN(x, y, o.fur) * 0.2;
      else if (o.tex) l += clump(x, y, o.tex) * 0.22;
      if (o.scales) l += scaleN(x, y);
      let t = tone(l);
      if (t === 4 && o.matte) t = 3;
      p.set(x, y, R[t]);
    }
  }
  return p;
}
export const ball = (p, cx, cy, rx, ry, R, o) => balls(p, [[cx, cy, rx, ry]], R, o);

// Paint src over dst. With contour, dst pixels just outside src turn into a dark selective
// line, so the near part reads in front of what it overlaps.
// contour 'drop' only darkens below/right of the part (a cast edge rather than a full line).
export function put(dst, src, contour = true) {
  const w = dst.w, h = dst.h, S = src.d, D = dst.d, W4 = w * 4, drop = contour === 'drop';
  if (contour) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (S[i + 3] > 40 || D[i + 3] < 100) continue;
    if ((x > 0 && S[i - 1] > 100) || (y > 0 && S[i - W4 + 3] > 100) || (!drop && ((x < w - 1 && S[i + 7] > 100) || (y < h - 1 && S[i + W4 + 3] > 100)))) {
      D[i] = OUTLINE[0] * 0.55 + D[i] * 0.24; D[i + 1] = OUTLINE[1] * 0.55 + D[i + 1] * 0.22; D[i + 2] = OUTLINE[2] * 0.55 + D[i + 2] * 0.26 + 4;
    }
  }
  for (let i = 0; i < S.length; i += 4) {
    const a = S[i + 3];
    if (!a) continue;
    if (a === 255) { D[i] = S[i]; D[i + 1] = S[i + 1]; D[i + 2] = S[i + 2]; D[i + 3] = 255; }
    else dst.set((i >> 2) % w, ((i >> 2) / w) | 0, [S[i], S[i + 1], S[i + 2], a]);
  }
  return dst;
}

// Recolour a flat-filled layer as a lit cylinder: highlight on the top/left edge, shadow on the
// bottom/right edge (two bands when wide), base colour inside.
export function cyl(L, R, o = {}) {
  const w = L.w, h = L.h, d = L.d;
  const A = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) A[i] = d[i * 4 + 3] > 100 ? 1 : 0;
  const a = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : A[y * w + x]);
  const lit = o.lit === false ? R[3] : R[4];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!A[y * w + x]) continue;
    let c;
    if (!a(x + 1, y) || !a(x, y + 1)) c = R[1];
    else if (o.wide && (!a(x + 2, y) || !a(x, y + 2))) c = R[2];
    else if (!a(x - 1, y) || !a(x, y - 1)) c = lit;
    else c = R[3];
    const i = (y * w + x) * 4;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
  return L;
}
// lowest opaque pixel in a column (or -1)
export function lowY(L, x) { if (x < 0 || x >= L.w) return -1; for (let y = L.h - 1; y >= 0; y--) if (L.d[(y * L.w + x) * 4 + 3] > 100) return y; return -1; }
export function topY(L, x) { if (x < 0 || x >= L.w) return -1; for (let y = 0; y < L.h; y++) if (L.d[(y * L.w + x) * 4 + 3] > 100) return y; return -1; }
// recolour the bottom n pixels of every column (pale bellies, throats)
export function underside(L, cols, x0 = 0, x1 = L.w - 1) {
  for (let x = Math.max(0, Math.round(x0)); x <= Math.min(L.w - 1, Math.round(x1)); x++) {
    const y = lowY(L, x);
    if (y < 0) continue;
    for (let k = 0; k < cols.length; k++) if (L.a(x, y - k)) L.set(x, y - k, cols[k]);
  }
}
// fill 1-px pinholes a thin polygon leaves behind
export function fillGaps(L, c) {
  const h = [];
  for (let y = 1; y < L.h - 1; y++) for (let x = 1; x < L.w - 1; x++) if (!L.a(x, y) && ((L.a(x - 1, y) && L.a(x + 1, y)) || (L.a(x, y - 1) && L.a(x, y + 1)))) h.push(x, y);
  for (let i = 0; i < h.length; i += 2) L.set(h[i], h[i + 1], c);
}
// clear the part of a layer that sits inside an ellipse (lets the form underneath keep its shading)
export function clipOut(L, cx, cy, rx, ry) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) L.clear(x, y);
  }
}
// small swept-back spike pointing up
export function spike(L, x, y, w, h, c, tip) {
  L.poly([[x - w / 2, y + 0.5], [x + w / 2, y + 0.5], [x - w * 0.4, y - h]], c);
  if (tip) L.set(Math.round(x - w * 0.4), Math.round(y - h) + 1, tip);
}
// clear a disc out of a layer (scallops, notches)
export function carve(L, cx, cy, r) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
    if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) L.clear(x, y);
  }
}

export function finish(p, e) {
  p.outlineSel();
  // trim both buffers to their content (pivot kept), so big bodies don't carry empty margins
  let x0 = p.w, y0 = p.h, x1 = -1, y1 = -1, emis = false;
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const i = (y * p.w + x) * 4 + 3;
    if (e.d[i]) emis = true;
    if (p.d[i] || e.d[i]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return { pix: p, emis: null };
  const crop = (s) => {
    const q = new Pix(x1 - x0 + 1, y1 - y0 + 1);
    for (let y = y0; y <= y1; y++) q.d.set(s.d.subarray((y * s.w + x0) * 4, (y * s.w + x1 + 1) * 4), (y - y0) * q.w * 4);
    q.ox = s.ox - x0; q.oy = s.oy - y0;
    return q;
  };
  return { pix: crop(p), emis: emis ? crop(e) : null };
}

// side-view eye: hostile eyes glow (c3) under a brow, tame eyes are dark with a glint
export function eye(p, e, x, y, o, n = 2, brow = null) {
  x = Math.round(x); y = Math.round(y);
  if (o.tame) {
    if (n <= 1) { p.set(x, y, EYE_DARK); p.set(x, y - 1, WHITE); return; }
    p.rect(x, y, n, n, EYE_DARK); p.set(x, y, WHITE);
    if (brow) for (let k = -1; k < n; k++) p.set(x + k, y - 1, brow);
    return;
  }
  const c = C(o.c3), hi = light(c, 1.35), h = Math.max(1, n - 1);
  p.rect(x, y, n, h, c); e.rect(x, y, n, h, c);
  if (n >= 2) { p.set(x + n - 1, y, hi); e.set(x + n - 1, y, hi); }
  if (brow) for (let k = -1; k < n; k++) p.set(x + k, y - 1, brow);
}
export const eyeN = (u) => (u >= 2.6 ? 3 : u >= 1.15 ? 2 : 1);
export const alphaC = (c, a) => [c[0], c[1], c[2], a];
