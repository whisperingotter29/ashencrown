// Procedural pixel creatures. Side-view bodies (quadrupeds, dragons, arachnids, flyers, serpent
// heads) face right and are mirrored by the actor; blobs, wraiths and floating eyes are drawn
// front-on. Every frame is { pix, emis } with the pivot on the ground under the body.
// Golems and treants reuse the humanoid generator with extra features (see human.js).
//
// Pixel density: every body is rasterised natively at today's PPU. Geometry is laid out in the old
// design units times u = size * ART (pixels per design unit), so a creature covers the same patch
// of world at any density; outlines, eye glints, claws, teeth and texture flecks stay 1 px. Parts
// are drawn into layers and composited with a 1-px inner contour where a near part overlaps a far
// one, the way hand-drawn sprites separate legs, heads and wings from the body.
import { Pix, C, light, dark, mixc, hash2, bayer, ART, ap, OUTLINE } from '../pix.js';

const cache = new Map();
const EYE_DARK = C('#140c10');
const BONE = C('#eee4cc');
const BONE_D = C('#b4a488');
const MAW = C('#3a0c12');
const MAW_D = C('#22060a');
const TONGUE = C('#b8444e');
const WHITE = C('#ffffff');
const VOID = C('#0c060c');

// ------------------------------------------------------------------ helpers
function mk(w, h, ox, oy) { const p = new Pix(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h))); p.ox = Math.round(ox); p.oy = Math.round(oy); return p; }
const blank = (p) => mk(p.w, p.h, p.ox, p.oy);
const lerp = (a, b, t) => a + (b - a) * t;
const lerpP = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

// 5-tone ramp: deep shadow, shadow, mid, base, highlight (shadows cool, highlights warm)
const RAMPS = new Map();
function ramp5(base) {
  const b = C(base), k = b.join(',');
  let r = RAMPS.get(k);
  if (!r) { r = [dark(b, 0.45), dark(b, 0.63), dark(b, 0.81), b, light(b, 1.15)]; RAMPS.set(k, r); }
  return r;
}
const dimR = (R, k) => R.map((c) => dark(c, k));

// light from the top-left and a little toward the viewer
const LX = -0.48, LY = -0.62, LZ = 0.62;
const tone = (l) => (l > 0.8 ? 4 : l > 0.32 ? 3 : l > -0.08 ? 2 : l > -0.5 ? 1 : 0);
// fur: 1-px wide strands, 4 px long, with a random phase per column (jagged band edges)
const furN = (x, y, sd) => hash2(x, Math.floor((y + Math.floor(hash2(x, 3, sd) * 4)) / 4), sd) - 0.5;
// scales: staggered 4x3 cells, each a lit top and a dark rounded lower edge
const scaleN = (x, y) => {
  const r = Math.floor(y / 3), lx = ((x + (r & 1) * 2) % 4 + 4) % 4, ly = ((y % 3) + 3) % 3;
  if (ly === 2 && (lx === 1 || lx === 2)) return -0.2;
  if (ly === 1 && (lx === 0 || lx === 3)) return -0.1;
  return ly === 0 && (lx === 1 || lx === 2) ? 0.08 : 0;
};

// Union of ellipses shaded as one form: each pixel takes the normal of the ellipse it sits
// deepest in, so a chest or hump grows out of the body without a seam.
// list: [[cx, cy, rx, ry], ...]
function balls(p, list, R, o = {}) {
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
      if (o.fur) l += furN(x, y, o.fur) * 0.24;
      else if (o.tex) l += (hash2(x, y, o.tex) - 0.5) * 0.2;
      if (o.scales) l += scaleN(x, y);
      let t = tone(l);
      if (t === 4 && o.matte) t = 3;
      p.set(x, y, R[t]);
    }
  }
  return p;
}
const ball = (p, cx, cy, rx, ry, R, o) => balls(p, [[cx, cy, rx, ry]], R, o);

// Paint src over dst. With contour, dst pixels just outside src turn into a dark selective
// line, so the near part reads in front of what it overlaps.
// contour 'drop' only darkens below/right of the part (a cast edge rather than a full line).
function put(dst, src, contour = true) {
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
function cyl(L, R, o = {}) {
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
function lowY(L, x) { if (x < 0 || x >= L.w) return -1; for (let y = L.h - 1; y >= 0; y--) if (L.d[(y * L.w + x) * 4 + 3] > 100) return y; return -1; }
function topY(L, x) { if (x < 0 || x >= L.w) return -1; for (let y = 0; y < L.h; y++) if (L.d[(y * L.w + x) * 4 + 3] > 100) return y; return -1; }
// recolour the bottom n pixels of every column (pale bellies, throats)
function underside(L, cols, x0 = 0, x1 = L.w - 1) {
  for (let x = Math.max(0, Math.round(x0)); x <= Math.min(L.w - 1, Math.round(x1)); x++) {
    const y = lowY(L, x);
    if (y < 0) continue;
    for (let k = 0; k < cols.length; k++) if (L.a(x, y - k)) L.set(x, y - k, cols[k]);
  }
}
// fill 1-px pinholes a thin polygon leaves behind
function fillGaps(L, c) {
  const h = [];
  for (let y = 1; y < L.h - 1; y++) for (let x = 1; x < L.w - 1; x++) if (!L.a(x, y) && ((L.a(x - 1, y) && L.a(x + 1, y)) || (L.a(x, y - 1) && L.a(x, y + 1)))) h.push(x, y);
  for (let i = 0; i < h.length; i += 2) L.set(h[i], h[i + 1], c);
}
// clear the part of a layer that sits inside an ellipse (lets the form underneath keep its shading)
function clipOut(L, cx, cy, rx, ry) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) L.clear(x, y);
  }
}
// small swept-back spike pointing up
function spike(L, x, y, w, h, c, tip) {
  L.poly([[x - w / 2, y + 0.5], [x + w / 2, y + 0.5], [x - w * 0.4, y - h]], c);
  if (tip) L.set(Math.round(x - w * 0.4), Math.round(y - h) + 1, tip);
}
// clear a disc out of a layer (scallops, notches)
function carve(L, cx, cy, r) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
    if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) L.clear(x, y);
  }
}

function finish(p, e) {
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
function eye(p, e, x, y, o, n = 2, brow = null) {
  x = Math.round(x); y = Math.round(y);
  if (o.tame) {
    if (n <= 1) { p.set(x, y, EYE_DARK); p.set(x, y - 1, '#f0f0f0'); return; }
    p.rect(x, y, n, n, EYE_DARK); p.set(x, y, '#e8ecf0');
    if (brow) for (let k = -1; k < n; k++) p.set(x + k, y - 1, brow);
    return;
  }
  const c = C(o.c3), hi = light(c, 1.35), h = Math.max(1, n - 1);
  p.rect(x, y, n, h, c); e.rect(x, y, n, h, c);
  if (n >= 2) { p.set(x + n - 1, y, hi); e.set(x + n - 1, y, hi); }
  if (brow) for (let k = -1; k < n; k++) p.set(x + k, y - 1, brow);
}
const eyeN = (u) => (u >= 2.6 ? 3 : u >= 1.15 ? 2 : 1);

// ------------------------------------------------------------------ public
// spec: { body, s, c1, c2, c3, kind, saddle, tame, glass, lure, caps } -> { views, sideOnly, height, seat, mouth }
export function creatureSprites(spec) {
  const key = JSON.stringify(spec);
  let s = cache.get(key);
  if (s) return s;
  switch (spec.body) {
    case 'quadruped': case 'dragon': s = quadSet(spec); break;
    case 'arachnid': s = arachSet(spec); break;
    case 'serpent': s = serpentSet(spec); break;
    case 'blob': s = blobSet(spec); break;
    case 'wraith': s = wraithSet(spec); break;
    case 'flyer': s = flyerSet(spec); break;
    case 'eye': s = eyeSet(spec); break;
    default: s = quadSet({ ...spec, body: 'quadruped' });
  }
  cache.set(key, s);
  return s;
}

// infer the visual sub-kind of a template
export function creatureKind(tpl) {
  const n = tpl.name || '';
  if (tpl.body === 'quadruped') {
    if (tpl.bear) return 'bear';
    if (tpl.tusks) return 'boar';
    if (/Rat/.test(n)) return 'rat';
    if (/Lion/.test(n)) return 'cat';
    return 'canine';
  }
  if (tpl.body === 'arachnid') return tpl.crab ? 'crab' : tpl.shell === 'glass' ? 'beetle' : tpl.spider ? 'spider' : 'scorpion';
  if (tpl.body === 'serpent') return tpl.shell === 'glass' ? 'glass' : /worm/i.test(n) ? 'worm' : /Leviathan/.test(n) ? 'sea' : 'eel';
  if (tpl.body === 'flyer') return /Gull/.test(n) ? 'gull' : /Harpy/.test(n) ? 'harpy' : 'vulture';
  return null;
}

// ================================================================== quadrupeds & dragons
const QF = {
  canine: { bl: 1, bh: 1, ll: 1.1, hh: 1, neck: 1.5, snout: 0.95 },
  bear: { bl: 1.05, bh: 1.5, ll: 0.75, hh: 1.05, neck: 0, snout: 0.75 },
  boar: { bl: 1, bh: 1.35, ll: 0.7, hh: 1.05, neck: 0, snout: 1.0 },
  cat: { bl: 1.05, bh: 1.05, ll: 1.05, hh: 1, neck: 1, snout: 0.55 },
  rat: { bl: 1.05, bh: 0.9, ll: 0.55, hh: 0.9, neck: 0.5, snout: 1.1 },
  horse: { bl: 1.1, bh: 1.15, ll: 1.6, hh: 1.05, neck: 5, snout: 1.25 },
  stag: { bl: 1.05, bh: 1.05, ll: 1.65, hh: 0.95, neck: 4.5, snout: 1.0 },
  dragon: { bl: 1.25, bh: 1.2, ll: 0.8, hh: 1.0, neck: 5, snout: 1.15 },
};
function quadSet(o) {
  if (o.body === 'dragon') o = { ...o, kind: 'dragon' };
  const f = QF[o.kind] || QF.canine;
  const s = o.s, u = s * ART, kind = o.kind;
  const D = {
    s, u, f,
    BL: Math.max(ap(8), Math.round(15 * u * f.bl)), BH: Math.max(ap(4), Math.round(6.5 * u * f.bh)),
    LL: Math.max(3, Math.round(5 * u * f.ll)), HH: Math.max(ap(4), Math.round(5.5 * u * f.hh)), NK: Math.round(f.neck * u),
    tail: Math.round((kind === 'dragon' ? 13 : kind === 'rat' ? 10 : 7) * u),
  };
  D.W = D.BL + D.HH * 3 + D.tail + D.NK + ap(14);
  D.H = D.BH + D.LL + D.NK + D.HH + Math.round((kind === 'stag' ? 10 : kind === 'dragon' ? 16 : 5) * u) + ap(10);
  D.ox = ap(5) + D.tail + Math.round(D.BL / 2); D.oy = D.H - 2;
  const fr = (pose) => quadFrame(o, D, pose);
  const out = {
    views: { side: {
      idle: [fr({ leg: -1, bob: 0, ref: true }), fr({ leg: -1, bob: 1 })],
      run: [0, 1, 2, 3].map((l) => fr({ leg: l, bob: l % 2 })),
      atk: [fr({ leg: -1, atk: 1 }), fr({ leg: -1, atk: 2 })],
      hurt: [fr({ leg: -1, hurt: true })],
      fly: kind === 'dragon' ? [fr({ leg: -1, fly: 0 }), fr({ leg: -1, fly: 1 })] : null,
    } },
    sideOnly: true,
    height: D.LL + D.BH + D.NK + D.HH,
  };
  out.seat = D.seat; out.mouth = D.mouth;
  return out;
}

// spiky noisy ellipse (lion mane, ruffs), banded and lit from the top-left
function mane(p, cx, cy, rx, ry, R, seed, spikes = 9) {
  for (let y = Math.floor(cy - ry * 1.3); y <= Math.ceil(cy + ry * 1.3); y++) for (let x = Math.floor(cx - rx * 1.3); x <= Math.ceil(cx + rx * 1.3); x++) {
    const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
    const ang = Math.atan2(ny, nx), d = Math.hypot(nx, ny);
    const edge = 0.9 + 0.26 * Math.abs(Math.sin(ang * spikes * 0.5 + seed)) ** 0.7 + (hash2(Math.round(ang * 12), seed, 5) - 0.5) * 0.1;
    if (d > edge) continue;
    let l = -0.55 * nx - 0.72 * ny + 0.12 + furN(x, y, seed) * 0.4;
    if (d > edge - 0.22) l -= 0.3;
    p.set(x, y, R[l > 0.6 ? 4 : l > 0.05 ? 3 : l > -0.4 ? 2 : l > -0.85 ? 1 : 0]);
  }
}

function quadFrame(o, D, pose) {
  const { u, BL, BH, LL, HH, NK, f } = D;
  const kind = o.kind;
  const p = mk(D.W, D.H, D.ox, D.oy), e = blank(p);
  const R = ramp5(o.c1), A = ramp5(o.c2), Rd = dimR(R, 0.7);
  const dragon = kind === 'dragon', hooved = kind === 'horse' || kind === 'stag', furry = !dragon && !hooved;
  const fly = pose.fly !== undefined;
  const m1 = Math.max(1, Math.round(u * 0.75));                 // one design pixel of motion
  const lunge = pose.atk === 1 ? -Math.max(2, Math.round(u)) : pose.atk === 2 ? Math.max(3, Math.round(2.2 * u)) : pose.hurt ? -2 : 0;
  const rx = BL / 2, ry = BH / 2;
  const bx = D.ox + lunge;
  const by = D.oy - LL - Math.round(ry) - (pose.bob ? m1 : 0) + (pose.atk === 1 ? m1 : 0) - (fly ? ap(2) : 0);
  const gy = D.oy;
  const hipY = by + Math.round(ry * 0.3);
  const fxh = bx + Math.round(rx * 0.6), hxh = bx - Math.round(rx * 0.6);
  const lw = Math.max(3, 1.7 * u * (kind === 'bear' ? 1.5 : dragon ? 1.3 : hooved ? 0.9 : 1));

  // ---- legs: muscled upper limb, slimmer lower limb, paw with claws or a hoof
  const leg = (x0, phase, far, hind) => {
    let sw = hind ? -0.25 : 0.25, lift = 0;
    if (pose.leg >= 0) { const th = Math.PI / 2 * (pose.leg + phase); sw = Math.round(Math.cos(th) * 1000) / 1000; lift = Math.max(0, Math.round(-Math.sin(th) * 1000) / 1000); }
    if (!hind && pose.atk === 2) sw = 1.2;
    if (!hind && pose.atk === 1) sw = -0.3;
    if (fly) { sw = hind ? -0.8 : 0.6; lift = 2; }
    const col = far ? Rd : R;
    const hx = x0 + (far ? Math.max(1, Math.round(u * 0.6)) : 0);
    const fx = Math.round(hx + sw * LL * 0.55), fy = gy - Math.round(lift * Math.max(1, u * 1.2));
    const kx = Math.round((hx + fx) / 2 + (hind ? -1 : 1) * Math.max(1, u * 0.9)), ky = Math.round((hipY + fy) / 2);
    const L = blank(p);
    L.taper(hx, hipY - lw * 0.3, kx, ky, lw * (hind ? 1.75 : 1.45), lw * 0.95, col[3]);
    L.taper(kx, ky, fx, fy - 1, lw * 0.95, lw * (hooved ? 0.62 : 0.76), col[3]);
    cyl(L, col);
    if (hooved) {
      const hw = Math.max(2, Math.round(lw * 0.72)), hh = Math.max(2, Math.round(u * 0.85));
      const Hc = ramp5(dark(o.c2, 0.62));
      const x = fx - (hw >> 1);
      L.rect(x, fy - hh + 1, hw + 1, hh, Hc[2]);
      L.rect(x, fy - hh + 1, hw + 1, 1, Hc[3]);
      L.set(x, fy - hh + 1, Hc[4]); L.set(x + hw, fy, Hc[1]);
      if (kind === 'horse') for (let k = 0; k <= hw; k += 2) L.set(x + k, fy - hh, (far ? dimR(A, 0.75) : A)[3]);   // feathering
    } else {
      const pr = Math.max(1.6, lw * 0.58);
      ball(L, fx + pr * 0.35, fy + 0.5 - pr * 0.6, pr * 1.12, pr * 0.62, col, { matte: true });
      if (u >= 1.1) {
        const n = kind === 'bear' || dragon ? 3 : u >= 1.5 ? 2 : 1, cc = mixc(dragon ? light(o.c2, 1.1) : BONE, col[1], 0.3);
        const tx = Math.round(fx + pr * 1.35);
        for (let k = 0; k < n; k++) L.set(tx - k * 2, fy, far ? dark(cc, 0.75) : cc);
      }
    }
    put(p, L, !far);
  };

  // ---- dragon wings: membrane panels between finger bones, scalloped trailing edge
  const wingUp = fly ? pose.fly === 0 : pose.atk === 1;
  const shX = bx + Math.round(rx * 0.25), shY = by - Math.round(ry * 0.7);
  const wing = (far) => {
    const Wr = far ? dimR(A, 0.68) : A, bone = far ? Rd : R;
    const ox = far ? ap(2) : 0, oy = far ? -ap(1) : 0;
    const spread = fly || pose.atk;
    let pts;
    if (!spread) pts = [[shX + ox, shY + oy], [bx - rx * 0.7 + ox, shY - 6 * u + oy], [bx - rx * 0.9 + ox, shY + 2 * u + oy], [bx - rx * 0.1, shY + ry * 0.6]];
    else if (wingUp) pts = [[shX + ox, shY + oy], [shX - 2 * u + ox, shY - 13 * u + oy], [shX - 10 * u + ox, shY - 10 * u + oy], [shX - 13 * u + ox, shY - 3 * u + oy], [bx - rx * 0.5, shY + ry * 0.4]];
    else pts = [[shX + ox, shY + oy], [shX - 5 * u + ox, shY - 5 * u + oy], [shX - 14 * u + ox, shY - 2 * u + oy], [shX - 12 * u + ox, shY + 4 * u + oy], [bx - rx * 0.5, shY + ry * 0.5]];
    // more fingers: a tip between each pair of trailing points, pushed out so the edge fans
    const fan = [pts[0], pts[1]];
    for (let i = 2; i < pts.length - 1; i++) {
      fan.push(pts[i]);
      const q = pts[i + 1], m = lerpP(pts[i], q, 0.5);
      const dx = m[0] - pts[1][0], dy = m[1] - pts[1][1], dl = Math.hypot(dx, dy) || 1;
      const push = Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]) * 0.16;
      if (i < pts.length - 2 || spread) fan.push([m[0] + dx / dl * push, m[1] + dy / dl * push]);
    }
    fan.push(pts[pts.length - 1]);
    const n = fan.length, L = blank(p);
    L.poly(fan, Wr[2]);
    fillGaps(L, Wr[2]);
    // scallops: a shallow bite out of each trailing-edge span
    const cxm = fan.reduce((a, q) => a + q[0], 0) / n, cym = fan.reduce((a, q) => a + q[1], 0) / n;
    for (let i = 2; i < n - 1; i++) {
      const [ax, ay] = fan[i], [bx2, by2] = fan[i + 1];
      const len = Math.hypot(bx2 - ax, by2 - ay);
      if (len < 4) continue;
      const mx = (ax + bx2) / 2, my = (ay + by2) / 2;
      let nx = -(by2 - ay) / len, ny = (bx2 - ax) / len;
      if (nx * (mx - cxm) + ny * (my - cym) < 0) { nx = -nx; ny = -ny; }
      const r = len * 0.5, depth = Math.max(1, len * 0.14);
      carve(L, mx + nx * (r - depth), my + ny * (r - depth), r);
    }
    // bones: thick arm, finger rays from the wrist
    const BM = blank(p);
    const aw = u >= 2.4 ? 3 : u >= 1.6 ? 2 : 1;
    BM.line(fan[0][0], fan[0][1], fan[1][0], fan[1][1], WHITE, aw);
    for (let i = 2; i < n - 1; i++) BM.line(fan[1][0], fan[1][1], fan[i][0], fan[i][1], WHITE, u >= 3 ? 2 : 1);
    // membrane: lit where it stretches near a bone, shadowed along the trailing edge
    const rib = Math.max(1, Math.round(u * 0.7));
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
      if (!L.a(x, y) || BM.a(x, y)) continue;
      if (!L.a(x, y + 1) || !L.a(x + 1, y)) { L.set(x, y, Wr[1]); continue; }
      let near = false;
      for (let k = 1; k <= rib && !near; k++) near = BM.a(x - k, y) || BM.a(x, y - k) || BM.a(x + k, y) || BM.a(x, y + k);
      if (near) L.set(x, y, Wr[3]);
    }
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) if (BM.a(x, y) && L.a(x, y)) L.set(x, y, BM.a(x, y - 1) ? bone[1] : bone[3]);
    L.line(fan[0][0], fan[0][1] - 1, fan[1][0], fan[1][1] - 1, bone[4]);
    for (let i = 2; i < n - 1; i++) L.set(Math.round(fan[i][0]), Math.round(fan[i][1]), Wr[4]);
    L.set(Math.round(fan[1][0]) + 1, Math.round(fan[1][1]) - 1, far ? BONE_D : BONE);
    L.set(Math.round(fan[1][0]) + 1, Math.round(fan[1][1]) - 2, far ? BONE_D : BONE);
    put(p, L, !far);
  };
  if (dragon) wing(true);

  // ---- far legs
  leg(fxh, 2, true, false);
  leg(hxh, 0, true, true);

  // ---- tail
  const tbx = bx - Math.round(rx) + 1, tby = by - Math.round(ry * 0.25);
  const wag = (pose.leg >= 0 ? [0, 1, 0, -1][pose.leg] : pose.bob ? 1 : 0) * m1;
  const T = D.tail;
  const TL = blank(p);
  switch (kind) {
    case 'dragon': {
      const pts = [[tbx, tby], [tbx - T * 0.4, tby + ry * 0.6], [tbx - T * 0.75, tby + ry * 0.2 + wag], [tbx - T, tby - ry * 0.4 + wag]];
      for (let i = 0; i < 3; i++) TL.taper(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], BH * (0.55 - i * 0.17), BH * (0.38 - i * 0.15), R[3]);
      cyl(TL, R, { wide: true });
      underside(TL, [A[2], A[3]], pts[3][0], pts[0][0] - 1);
      for (let i = 1; i < 4; i++) { const [x, y] = pts[i]; spike(TL, x, y - BH * (0.24 - i * 0.06), Math.max(2, 1.3 * u), Math.max(2, 1.4 * u * (1.2 - i * 0.2)), A[3], A[4]); }
      const [sx, sy] = pts[3];
      TL.poly([[sx + 0.5 * u, sy - 2.2 * u], [sx - 3.2 * u, sy], [sx + 0.5 * u, sy + 2.2 * u], [sx - 0.4 * u, sy]], A[3]);
      TL.line(sx + 0.5 * u, sy - 2.2 * u, sx - 3.2 * u, sy, A[4]);
      TL.line(sx - 3.2 * u, sy, sx + 0.5 * u, sy + 2.2 * u, A[1]);
      break;
    }
    case 'horse': {
      TL.taper(tbx, tby, tbx - 2.2 * u, tby + 2.4 * u, 2.6 * u, 2.2 * u, A[3]);
      const n = Math.max(3, Math.round(2.4 * u));
      for (let k = 0; k < n; k++) {
        const t = k / (n - 1) - 0.5;
        TL.line(tbx - 1.6 * u + t * u, tby + 1.6 * u, tbx - 3.2 * u + t * 2 * u, tby + 7 * u + Math.abs(t) * 1.4 * u - wag, A[[2, 3, 1, 3, 2][k % 5]], Math.max(1, Math.round(u * 0.55)));
      }
      TL.set(Math.round(tbx - 0.5 * u), Math.round(tby - 0.4 * u), A[4]);
      break;
    }
    case 'bear': ball(TL, tbx - 1, tby, 1.5 * u, 1.3 * u, R, { fur: 2 }); break;
    case 'rat': {
      const rc = ramp5('#c89090');
      for (let i = 0; i < T; i++) {
        const x = tbx - i, y = tby + Math.round(Math.sin(i / T * 3 + wag * 0.5) * 2 * u + i * 0.15);
        TL.set(x, y, i % 3 === 2 ? rc[2] : rc[3]);
        if (i < T * 0.45 && u >= 1.2) TL.set(x, y + 1, rc[1]);
      }
      break;
    }
    case 'boar': {
      TL.line(tbx, tby, tbx - 1.4 * u, tby - 1.2 * u, R[2], Math.max(1, Math.round(u * 0.5)));
      TL.line(tbx - 1.4 * u, tby - 1.2 * u, tbx - 2 * u, tby - 0.4 * u, R[2]);
      TL.set(Math.round(tbx - 2 * u), Math.round(tby - 0.4 * u) + 1, A[1]);
      break;
    }
    case 'stag': ball(TL, tbx - 1, tby - 1, 1.3 * u, 1.2 * u, ramp5('#f0ece0'), { matte: true }); break;
    case 'cat': {
      const C2 = blank(p);
      C2.taper(tbx, tby, tbx - T * 0.6, tby - T * 0.4 + wag, Math.max(2, u * 1.1), Math.max(2, u * 0.9), R[3]);
      cyl(C2, R); put(TL, C2, false);
      ball(TL, tbx - T * 0.65, tby - T * 0.45 + wag, 1.3 * u, 1.3 * u, A, { fur: 6 });
      break;
    }
    default: {
      TL.taper(tbx, tby, tbx - T * 0.85, tby - T * 0.55 + wag, 2.6 * u, 1.6 * u, R[3]);
      cyl(TL, R, { wide: u >= 1.4 });
      const tip = blank(p);
      tip.taper(tbx - T * 0.6, tby - T * 0.4 + wag, tbx - T * 0.92, tby - T * 0.6 + wag, 1.8 * u, 1.1 * u, A[3]);
      cyl(tip, A); put(TL, tip, false);
      // a couple of fur strands along the brush
      if (u >= 1.4) for (let k = 1; k <= 2; k++) TL.line(tbx - T * (0.2 + k * 0.15), tby - T * (0.12 + k * 0.1) + wag * 0.5 + 1, tbx - T * (0.38 + k * 0.15), tby - T * (0.24 + k * 0.1) + wag, R[2]);
    }
  }
  put(p, TL, false);

  // ---- body: one form made of barrel, chest and haunch masses
  const B = blank(p);
  const mass = [[bx, by, rx, ry]];
  if (kind === 'canine' || kind === 'cat' || kind === 'rat') mass.push([bx + rx * 0.45, by + ry * 0.05, rx * 0.5, ry * 1.06]);
  if (kind === 'bear') mass.push([bx + rx * 0.35, by - ry * 0.35, rx * 0.55, ry * 0.75]);
  if (kind === 'boar') mass.push([bx + rx * 0.3, by - ry * 0.1, rx * 0.6, ry * 0.95]);
  if (hooved) mass.push([bx + rx * 0.55, by - ry * 0.05, rx * 0.42, ry * 0.88], [bx - rx * 0.58, by - ry * 0.08, rx * 0.42, ry * 0.86]);
  if (dragon) mass.push([bx + rx * 0.5, by - ry * 0.1, rx * 0.5, ry * 0.95]);
  balls(B, mass, R, { fur: furry ? 3 : 0, tex: dragon ? 6 : 0, scales: dragon && u >= 1.5 });
  // darker saddle of fur along the back
  if (kind === 'canine' || kind === 'rat' || kind === 'cat' || kind === 'bear') {
    for (let y = Math.round(by - ry * 1.2); y <= by; y++) for (let x = Math.round(bx - rx * 0.85); x <= bx + rx * 0.65; x++) {
      const nx = (x + 0.5 - bx) / rx, ny = (y + 0.5 - by) / ry;
      if (nx * nx + ny * ny <= 1 && ny < -0.42 - (furN(x, y, 7) + 0.5) * 0.28) B.over(x, y, ny < -0.86 ? A[4] : ny < -0.6 ? A[3] : A[2]);
    }
  }
  // pale belly plates (dragons)
  if (dragon) {
    const pw = Math.max(2, Math.round(u * 1.4));
    for (let x = Math.round(bx - rx * 0.75); x <= bx + rx * 0.95; x++) {
      const yb = lowY(B, x);
      if (yb < 0) continue;
      const sep = (x - Math.round(bx)) % pw === 0;
      const rows = u >= 1.8 ? 3 : 2;
      for (let k = 0; k < rows; k++) B.set(x, yb - k, sep ? A[1] : k === rows - 1 ? A[4] : A[3 - (k === 0 ? 1 : 0)]);
    }
  }
  // bristles (boars) / dorsal spikes (dragons)
  if (kind === 'boar') {
    for (let x = Math.round(bx - rx * 0.8); x <= bx + rx * 0.55; x++) {
      const y = topY(B, x);
      if (y < 0) continue;
      const hgt = 1 + Math.floor(hash2(x, 2, 9) * Math.max(2, u * 1.2));
      for (let k = 1; k <= hgt; k++) B.set(x, y - k, k === hgt ? A[3] : A[2]);
    }
  }
  if (dragon) {
    const step = Math.max(3, Math.round(2.6 * u));
    for (let x = Math.round(bx - rx * 0.75); x <= bx + rx * 0.45; x += step) {
      const y = topY(B, x);
      if (y >= 0) spike(B, x, y + 1, Math.max(2, 1.5 * u), Math.max(2, 1.8 * u), A[3], A[4]);
    }
  }
  put(p, B, true);

  // ---- neck & head
  const HL = blank(p);
  const nbx = bx + Math.round(rx * 0.72), nby = by - Math.round(ry * 0.35);
  let hcx, hcy;
  if (hooved || dragon) { hcx = nbx + NK * 0.7 + HH * 0.25; hcy = nby - NK - HH * 0.3; }
  else { hcx = bx + rx + HH * 0.2; hcy = by - ry * 0.45 - NK * 0.6; }
  if (pose.atk === 1) { hcx -= Math.max(1, u); hcy += Math.max(1, u * 0.8); }
  if (pose.atk === 2) { hcx += Math.max(1, u * 1.4); hcy += dragon ? -u : 0; }
  if (pose.hurt) hcy -= m1;
  hcx = Math.round(hcx); hcy = Math.round(hcy);
  if (NK > 0) {
    const N = blank(p);
    N.taper(nbx, nby, hcx - HH * 0.25, hcy + HH * 0.15, BH * 0.72, HH * 0.75, R[3]);
    cyl(N, R, { wide: true });
    if (dragon) {
      underside(N, [A[2], A[3]], nbx, hcx);
      for (let k = 1; k < 5; k++) { const t = k / 5; spike(N, nbx + (hcx - nbx) * t, nby + (hcy - nby) * t - BH * 0.36 * (1 - t) - HH * 0.32 * t, Math.max(2, 1.2 * u), Math.max(2, 1.4 * u), A[3], A[4]); }
    }
    put(HL, N, false);
    if (kind === 'horse') {
      // crest of mane with strands hanging down the near side, forelock between the ears
      const M = blank(p);
      M.taper(nbx - 1, nby - BH * 0.4, hcx - HH * 0.45, hcy - HH * 0.38, Math.max(3, 2.3 * u), Math.max(2, 1.6 * u), A[3]);
      cyl(M, A);
      for (let x = 0; x < M.w; x++) {
        const y = lowY(M, x);
        if (y < 0) continue;
        const k = Math.round(hash2(x, 1, 5) * 1.6 * u);
        for (let j = 1; j <= k; j++) M.set(x, y + j, j === k ? A[1] : A[2]);
      }
      put(HL, M, false);
    }
  }
  // lion mane behind the skull
  if (kind === 'cat' && o.mane !== false) mane(HL, hcx - HH * 0.2, hcy + HH * 0.15, HH * 0.95, HH * 0.9, A, 11);
  const ex = Math.round(hcx - HH * 0.15), ey = Math.round(hcy - HH * 0.42);
  // ears behind the skull
  if (kind === 'canine') {
    HL.poly([[ex - 1.6 * u, ey + 1], [ex + 1.4 * u, ey + 1], [ex - 0.8 * u, ey - 3.2 * u]], R[3]);
    if (u >= 1.2) HL.poly([[ex - 0.9 * u, ey + 1], [ex + 0.5 * u, ey + 1], [ex - 0.6 * u, ey - 2 * u]], dark(o.c2, 0.55));
    HL.line(ex - 1.6 * u, ey + 1, ex - 0.8 * u, ey - 3.2 * u, R[4]);
  } else if (hooved) {
    HL.poly([[ex - 1.2 * u, ey + 1], [ex + 0.8 * u, ey + 1], [ex - 1.4 * u, ey - 2.6 * u]], R[3]);
    if (u >= 1.6) HL.line(ex - 0.6 * u, ey, ex - 1.2 * u, ey - 1.8 * u, R[1]);
  } else if (kind === 'rat') { ball(HL, ex - 0.5 * u, ey - 0.6 * u, 2 * u, 2 * u, R); HL.ellipse(ex - 0.3 * u, ey - 0.4 * u, 1.1 * u, 1.1 * u, '#d89898'); }
  else if (kind === 'bear') { ball(HL, ex, ey, 1.5 * u, 1.4 * u, R, { fur: 4 }); HL.ellipse(ex + 0.2 * u, ey + 0.2 * u, 0.6 * u, 0.6 * u, R[1]); }
  else if (kind === 'cat') { ball(HL, ex, ey - 0.5 * u, 1.3 * u, 1.3 * u, R); HL.ellipse(ex + 0.2 * u, ey - 0.3 * u, 0.55 * u, 0.55 * u, R[1]); }
  // skull (hooved heads get a heavy cheek so the head reads as a wedge, not a tube)
  const skull = [[hcx, hcy, HH * 0.55, HH * 0.5]];
  if (hooved) skull.push([hcx + HH * 0.12, hcy + HH * 0.22, HH * 0.5, HH * 0.42]);
  balls(HL, skull, R, { fur: furry ? 9 : 0, scales: dragon && u >= 1.5 });
  // snout / jaws
  const SL = HH * f.snout;
  const sy = Math.round(hcy + HH * 0.18);
  const tipX = Math.round(hcx + HH * 0.25 + SL);
  const sh0 = HH * 0.6, sh1 = HH * (kind === 'rat' ? 0.18 : hooved || kind === 'bear' ? 0.45 : 0.36);
  const open = pose.atk === 2 ? Math.max(2, Math.round(HH * 0.32)) : 0;
  const mx0 = Math.round(hcx + HH * 0.15);
  let J = null;
  if (open) {
    // maw, tongue and the dropped lower jaw, tucked behind the cheek
    const MJ = blank(p);
    MJ.poly([[mx0, sy], [tipX, sy - 1], [tipX - 1, sy + open + 1], [mx0, sy + 2]], MAW);
    MJ.line(mx0 + 1, sy + Math.round(open * 0.6), tipX - 3, sy + Math.round(open * 0.7), TONGUE, Math.max(1, Math.round(u * 0.6)));
    J = blank(p);
    J.taper(hcx, sy + 1, tipX - 1, sy + open + 1, sh0 * 0.55, sh1 * 0.7, R[3]);
    cyl(J, R);
    put(MJ, J, false);
    clipOut(MJ, hcx, hcy - 1, HH * 0.42, HH * 0.36);
    put(HL, MJ, false);
  }
  const S = blank(p);
  S.taper(mx0, sy - (open ? 1 : 0), tipX, sy - (open ? 1 : 0), sh0, sh1, R[3]);
  if (hooved) S.ellipse(tipX - sh1 * 0.45, sy - (open ? 1 : 0) + sh1 * 0.12, sh1 * 0.62, sh1 * 0.58, R[3]);   // soft muzzle
  cyl(S, R, { wide: HH >= 10 });
  clipOut(S, hcx, hcy - 1, HH * 0.42, HH * 0.36);
  if (dragon) for (let x = mx0 + 2; x < tipX - 1; x += 3) { const y = topY(S, x); if (y >= 0) S.set(x, y + 1, R[4]); }   // brow scales
  put(HL, S, false);
  if (open) {
    // teeth along both jaws, longer fangs at the front
    for (let x = mx0 + 2; x < tipX; x += 2) { const y = lowY(S, x); if (y >= 0) HL.set(x, y + 1, BONE); }
    const fx = tipX - 2, fy = lowY(S, fx);
    if (fy >= 0 && kind !== 'rat' && !hooved) { HL.set(fx, fy + 1, BONE); HL.set(fx, fy + 2, BONE_D); }
    if (kind === 'rat') { HL.rect(tipX - 2, lowY(S, tipX - 2) + 1, 2, 2, '#f0e0a0'); }
    for (let x = mx0 + 3; x < tipX - 2; x += 3) { const y = topY(J, x); if (y >= 0) HL.set(x, y - 1, BONE_D); }
    if (dragon) e.disc(tipX - 2, sy + open * 0.5, Math.max(1, open * 0.55), o.c3);
  } else {
    // lip line with a down-turned corner
    const ly = sy + Math.round(sh1 / 2);
    HL.line(Math.round(hcx + HH * 0.3), ly, tipX - 1, ly, dark(o.c1, 0.42));
    if (!hooved) HL.set(Math.round(hcx + HH * 0.3) - 1, ly + 1, dark(o.c1, 0.42));
    if ((kind === 'canine' || kind === 'cat') && u >= 1.3) HL.set(Math.round(hcx + HH * 0.3) + 2, ly + 1, BONE);   // a fang peeks out
  }
  // nose
  const ny = sy - Math.round(sh1 / 2) - (open ? 1 : 0);
  if (kind === 'boar') {
    const pc = ramp5(mixc(o.c1, '#d89080', 0.45));
    HL.ellipse(tipX, sy - (open ? 1 : 0), Math.max(1, u * 0.5), Math.max(1.2, sh1 * 0.62), pc[2]);
    HL.set(tipX, ny + 1, pc[4]); HL.set(tipX, sy, pc[0]); if (u >= 1.6) HL.set(tipX, sy - 2, pc[0]);
  } else if (hooved || dragon) {
    HL.set(tipX - 1, ny + 1, R[0]); if (u >= 2) HL.set(tipX - 2, ny + 1, R[1]);
  } else {
    const nw = u >= 1.5 ? 2 : 1, nc = kind === 'rat' ? C('#d07080') : dark(o.c1, 0.28);
    HL.rect(tipX - nw + 1, ny, nw, nw, nc);
    if (nw > 1) HL.set(tipX - 1, ny, mixc(nc, '#ffffff', 0.45));
  }
  if (kind === 'boar') {
    // curved tusk from the lower jaw
    const t0x = tipX - HH * 0.35, t0y = sy + 1, t1x = tipX - HH * 0.12, t1y = sy - HH * 0.45;
    HL.line(t0x, t0y, t1x, t1y, BONE, u >= 2 ? 2 : 1);
    HL.line(t0x + 1, t0y, t1x + 1, t1y + 1, BONE_D);
    HL.set(Math.round(t1x), Math.round(t1y) - 1, WHITE);
  }
  if (kind === 'cat' && u >= 1.4) for (let k = 0; k < 2; k++) HL.line(tipX - 1, sy + k, tipX + Math.round(u * 1.2), sy - 1 + k * 2, mixc(o.c3, '#ffffff', 0.5));   // whiskers
  // eye
  eye(HL, e, hcx + HH * 0.12, hcy - HH * 0.12, o, eyeN(u), u >= 1.3 ? R[1] : null);
  // front ears / horns / antlers
  if (kind === 'boar') { HL.poly([[ex - 0.5 * u, ey + 1], [ex + 2 * u, ey + 1], [ex + 2.6 * u, ey + 2.6 * u]], R[2]); HL.line(ex - 0.5 * u, ey + 1, ex + 2 * u, ey + 1, R[4]); }
  if (hooved) HL.set(ex - 1, ey - Math.round(2 * u), light(o.c1, 1.3));
  if (kind === 'horse') for (let k = 0; k < Math.max(3, Math.round(2 * u)); k++) HL.set(Math.round(hcx - HH * 0.1) + k, Math.round(hcy - HH * 0.48) + (k > 1 ? 1 : 0) + (k > 3 ? 1 : 0), k % 2 ? A[2] : A[3]);
  if (o.antlers || kind === 'stag') {
    const ac = C(o.antlerColor || '#d8c8a8');
    const bw = u >= 2 ? 2 : 1;
    for (const [dx, col, hi] of [[ap(2), dark(ac, 0.72), dark(ac, 0.85)], [0, ac, light(ac, 1.15)]]) {
      const ax = ex + dx, ay = ey;
      HL.line(ax, ay, ax - 2 * u, ay - 5 * u, col, bw); HL.line(ax - 2 * u, ay - 5 * u, ax - 1 * u, ay - 9 * u, col, bw);
      HL.line(ax - 1.3 * u, ay - 3 * u, ax + 1.5 * u, ay - 5.5 * u, col); HL.line(ax - 1.8 * u, ay - 6.5 * u, ax + 1 * u, ay - 9 * u, col);
      HL.line(ax - 2.2 * u, ay - 4.6 * u, ax - 3.6 * u, ay - 7 * u, col);
      for (const [tx, ty] of [[1.5, -5.5], [1, -9], [-1, -9], [-3.6, -7]]) HL.set(Math.round(ax + tx * u), Math.round(ay + ty * u), hi);
      if (o.c3 && !o.tame) e.set(Math.round(ax - 1 * u), Math.round(ay - 9 * u), o.c3);
    }
  }
  if (dragon) {
    const hc = ramp5(light(o.c2, 1.2));
    const HN = blank(p);
    HN.taper(ex + 1, ey + 1, ex - 3 * u, ey - 2.5 * u, Math.max(2, u * 1.1), 1, hc[3]);
    cyl(HN, hc);
    HN.taper(ex + 2, ey + 2, ex - 2 * u + 1, ey - 1.4 * u, Math.max(2, u * 0.8), 1, hc[1]);
    HN.set(Math.round(ex - 3 * u), Math.round(ey - 2.5 * u) - 1, '#f8f0e0');
    put(HL, HN, false);
  }
  put(p, HL, true);
  // dragons: near wing after body
  if (dragon) wing(false);
  // ---- near legs
  leg(fxh, 0, false, false);
  leg(hxh, 2, false, true);
  // ---- saddle (mounts): blanket with trim, leather seat with cantle and pommel, girth and stirrup
  if (o.saddle) {
    const SC = ramp5(o.saddle), TR = ramp5('#c8a050');
    const x0 = Math.round(bx - rx * 0.42), x1 = Math.round(bx + rx * 0.3);
    const top = by - Math.round(ry);
    const bl = Math.round(ry * 1.1);
    for (let x = x0 - ap(1); x <= x1 + ap(1); x++) {
      const t0 = topY(B, x);
      if (t0 < 0) continue;
      for (let y = t0; y <= top + bl; y++) if (B.a(x, y)) p.set(x, y, y === top + bl ? TR[3] : y === top + bl - 1 ? SC[1] : (x === x0 - ap(1) || x === x1 + ap(1)) ? SC[1] : SC[2]);
      if (((x - x0) & 3) === 1 && B.a(x, top + bl)) p.set(x, top + bl, TR[4]);
    }
    const st = Math.round(ry * 0.5);
    for (let x = x0; x <= x1; x++) for (let y = top - 1; y <= top + st; y++) p.set(x, y, y === top - 1 ? SC[4] : y === top + st ? SC[1] : SC[3]);
    const ch = Math.max(2, Math.round(u * 1.2)), cw = Math.max(2, Math.round(u));
    p.rect(x0, top - 1 - ch, cw, ch, SC[2]); p.set(x0, top - 1 - ch, SC[4]);
    p.rect(x1 - cw + 1, top - ch, cw, ch, SC[2]); p.set(x1 - cw + 1, top - ch, SC[4]);
    const gx = Math.round(bx);
    p.line(gx, top + st + 1, gx, Math.round(by + ry * 0.75), '#3a2a1a', u >= 2 ? 2 : 1);
    const sx = gx - Math.max(2, Math.round(u));
    p.line(sx, top + st + 1, sx, Math.round(by + ry * 0.6), '#2a1e14');
    const sw = Math.max(3, Math.round(u * 1.4));
    p.rect(sx - (sw >> 1), Math.round(by + ry * 0.6) + 1, sw, 2, '#a8a8b0'); p.set(sx - (sw >> 1), Math.round(by + ry * 0.6) + 1, '#e0e0e8');
    if (sw >= 3) p.set(sx - (sw >> 1) + 1, Math.round(by + ry * 0.6) + 2, '#3a3a44');
    if (pose.ref) D.seat = [Math.round(bx - D.ox), top - D.oy];
  }
  if (pose.atk === 2 || !D.mouth) D.mouth = [tipX - D.ox, sy - D.oy];
  if (o.glow2) for (let x = Math.round(bx - rx * 0.6); x < bx + rx * 0.6; x += Math.max(3, Math.round(3 * ART))) { const y = Math.round(by - ry * 0.2 + Math.sin(x / ART) * 1.5 * ART); if (p.a(x, y)) { p.set(x, y, o.c3); e.set(x, y, o.c3); } }
  return finish(p, e);
}

// ================================================================== arachnids
function arachSet(o) {
  const s = o.s, u = s * ART;
  const W = Math.round(32 * u) + ap(14), H = Math.round(26 * u) + ap(12);
  const D = { s, u, W, H, ox: Math.round(W / 2), oy: H - 2 };
  const fr = (pose) => arachFrame(o, D, pose);
  const out = {
    views: { side: {
      idle: [fr({ leg: -1, bob: 0 }), fr({ leg: -1, bob: 1 })],
      run: [0, 1, 2, 3].map((l) => fr({ leg: l })),
      atk: [fr({ leg: -1, atk: 1 }), fr({ leg: -1, atk: 2 })],
      hurt: [fr({ leg: -1, hurt: true })],
    } },
    sideOnly: true,
    height: Math.round((o.kind === 'scorpion' ? 14 : o.kind === 'spider' ? 13 : 10) * u),
  };
  out.mouth = D.mouth;
  return out;
}
function arachFrame(o, D, pose) {
  const { u } = D;
  const kind = o.kind;
  const p = mk(D.W, D.H, D.ox, D.oy), e = blank(p);
  const R = ramp5(o.c1), A = ramp5(o.c2);
  const glass = kind === 'beetle' && o.glass;
  const m1 = Math.max(1, Math.round(u * 0.75));
  const lunge = pose.atk === 1 ? -Math.max(2, Math.round(u)) : pose.atk === 2 ? Math.max(3, Math.round(2 * u)) : pose.hurt ? -2 : 0;
  const gy = D.oy;
  const bodyLift = kind === 'spider' ? 5.5 * u : kind === 'scorpion' ? 3.2 * u : kind === 'crab' ? 4.5 * u : 3.6 * u;
  const cx = D.ox + lunge, cy = Math.round(gy - bodyLift - (pose.bob ? m1 : 0) - (pose.atk === 1 && kind !== 'scorpion' ? u : 0));
  const lw = Math.max(1, Math.round(1.1 * u)), lw2 = Math.max(1, Math.round(0.85 * u));
  // legs: 4 per side (crabs 3), jointed high above the body so they read against it; far side first
  const nLegs = kind === 'crab' ? 3 : 4;
  const span = kind === 'spider' ? 10.5 * u : kind === 'crab' ? 9 * u : kind === 'scorpion' ? 7.5 * u : 6.5 * u;
  const topLeg = cy - (kind === 'spider' ? 6.5 : kind === 'crab' ? 5 : 3.6) * u;
  const hipSpan = (kind === 'spider' ? 5 : kind === 'scorpion' ? 7 : 6) * u;
  const hipX0 = kind === 'spider' ? cx + 2 * u : cx;
  const LA = kind === 'crab' ? R : A, LAd = dimR(LA, 0.62);
  const legs = (far) => {
    const L = blank(p), col = far ? LAd : LA;
    for (let i = 0; i < nLegs; i++) {
      const t = i / (nLegs - 1);
      const dir = 1 - t * 2;                      // front legs reach forward, back legs backward
      const hx = hipX0 + (0.5 - t) * hipSpan + (far ? ap(1) : 0), hy = cy + (far ? -ap(1) : 0);
      let shift = 0, lift = 0;
      if (pose.leg >= 0) { const q = (pose.leg + i + (far ? 2 : 0)) % 4; shift = [1, 0, -1, 0][q] * 1.6 * u; lift = q === 3 ? Math.max(1, Math.round(u)) : 0; }
      let fx = hx + dir * span * 0.75 + Math.sign(dir || 1) * span * 0.25 + shift, fy = gy - lift;
      if (i === 0 && pose.atk === 1 && (kind === 'spider' || kind === 'beetle')) { fx = hx + span * 0.9; fy = cy - 4 * u; }
      const kx = hx + (fx - hx) * 0.4, ky = topLeg + (far ? ap(1) : 0) - Math.abs(dir) * u;
      // lower leg bends once more at an ankle a little outward
      const ax = kx + (fx - kx) * 0.62 + Math.sign(fx - kx) * u * 0.35, ay = ky + (fy - ky) * 0.62;
      L.line(hx, hy, kx, ky, col[3], lw);
      L.line(kx, ky, ax, ay, col[2], lw2);
      L.line(ax, ay, fx, fy, col[1], 1);
      if (lw >= 2) L.line(hx, hy - 1, kx, ky - 1, col[4]);
      L.set(Math.round(kx), Math.round(ky) - 1, col[4]);
      L.set(Math.round(ax), Math.round(ay), col[3]);
      L.set(Math.round(fx), Math.round(fy), col[0]);
      // bristles on spider legs
      if (kind === 'spider' && u >= 1.4) for (let k = 1; k < 4; k++) { const q = k / 4; L.set(Math.round(kx + (ax - kx) * q) + (dir >= 0 ? 1 : -1), Math.round(ky + (ay - ky) * q) - 1, col[0]); }
    }
    put(p, L, far ? false : 'drop');
  };
  legs(true);
  // scorpion tail (behind): segments with joint rings, venom bulb and a glowing barb
  if (kind === 'scorpion') {
    const segs = 6;
    let px = cx - 6 * u, py = cy - u;
    const strike = pose.atk === 2, cock = pose.atk === 1;
    const AT = ramp5(mixc(o.c2, o.c1, 0.45));
    let ang = 0;
    for (let i = 0; i < segs; i++) {
      const t = (i + 1) / segs;
      ang = Math.PI * (strike ? 0.15 + t * 0.95 : cock ? 0.55 + t * 0.85 : 0.4 + t * 0.95);
      const Ls = 3.3 * u * (1 - t * 0.2);
      const nx = px - Math.cos(ang) * Ls, ny = py - Math.sin(ang) * Ls;
      const rr = 1.8 * u * (1 - t * 0.35);
      const SG = blank(p);
      ball(SG, nx, ny, rr, rr * 0.92, i % 2 ? R : AT, { tex: 20 + i });
      if (rr >= 2.5) SG.set(Math.round(nx - rr * 0.35), Math.round(ny - rr * 0.45), (i % 2 ? R : AT)[4]);
      put(p, SG, true);
      px = nx; py = ny;
    }
    const sc = C(o.c3);
    // bulb then a curved barb
    const SB = blank(p);
    ball(SB, px + 0.6 * u, py + 0.2 * u, 1.3 * u, 1.1 * u, A);
    put(p, SB, true);
    const bx1 = px + 2.6 * u, by1 = py + 1.6 * u;
    p.line(px + 1.4 * u, py + 0.4 * u, bx1, by1, sc, Math.max(1, Math.round(u * 0.7)));
    p.set(Math.round(bx1) + 1, Math.round(by1) + 1, light(sc, 1.3));
    e.line(px + 1.4 * u, py + 0.4 * u, bx1, by1, sc); e.set(Math.round(bx1) + 1, Math.round(by1) + 1, sc);
    if (strike) { p.set(Math.round(bx1) + 1, Math.round(by1) + 3, sc); e.set(Math.round(bx1) + 1, Math.round(by1) + 3, sc); }
    D.mouth = [Math.round(px - D.ox), Math.round(py - D.oy)];
  }
  // abdomen + cephalothorax / shell
  if (kind === 'spider') {
    const B = blank(p);
    const ax = cx - 4.5 * u, ay = cy - 2.2 * u, arx = 5.2 * u, ary = 4.3 * u;
    ball(B, ax, ay, arx, ary, R, { fur: 2 });
    // stray bristles on the silhouette
    for (let k = 0; k < 9; k++) { const a = Math.PI * (1.05 + k * 0.11); B.set(Math.round(ax + Math.cos(a) * (arx + 0.6)), Math.round(ay + Math.sin(a) * (ary + 0.6)), R[2]); }
    // chevron markings down the back
    const mx = ax + 0.3 * u, my = ay - 1.2 * u;
    B.poly([[mx - 1.5 * u, my - 2 * u], [mx + 1.5 * u, my - 2 * u], [mx, my]], A[3]); B.poly([[mx, my], [mx - 1.5 * u, my + 2 * u], [mx + 1.5 * u, my + 2 * u]], A[2]);
    B.set(Math.round(mx - 1.2 * u), Math.round(my - 2 * u), A[4]);
    if (u >= 1.6) for (let k = 0; k < 3; k++) B.set(Math.round(mx - (2.6 + k * 1.1) * u), Math.round(my + (0.4 + k * 0.4) * u), A[2]);
    B.set(Math.round(ax - arx), Math.round(ay + ary * 0.25), R[0]);   // spinnerets
    put(p, B, true);
    const Hd = blank(p);
    ball(Hd, cx + 2.5 * u, cy, 3.4 * u, 2.7 * u, R, { tex: 4 });
    // chelicerae and fangs
    ball(Hd, cx + 5 * u, cy + 0.9 * u, Math.max(1, 1.2 * u), Math.max(1, 1.1 * u), R, { matte: true });
    put(p, Hd, true);
    const fo = pose.atk === 2 ? Math.max(1, Math.round(u * 0.6)) : 0;
    p.line(cx + 5.2 * u, cy + 1.4 * u, cx + 5.6 * u + fo, cy + 2.8 * u, BONE); p.set(Math.round(cx + 5.6 * u + fo), Math.round(cy + 2.8 * u) + 1, BONE_D);
    // eye cluster: two big eyes with glints and a row of small ones
    const c3 = C(o.c3), en = u >= 3.5 ? 3 : u >= 2.2 ? 2 : 1;
    for (const [dx, dy, big] of [[4.2, -1.5, 1], [5.1, -0.9, 1], [3.5, -0.8, 0], [4.7, -2.1, 0], [3.3, -1.8, 0], [5.6, -1.6, 0]]) {
      const x = Math.round(cx + dx * u), y = Math.round(cy + dy * u), n = big ? en : 1;
      p.rect(x, y, n, n, c3); e.rect(x, y, n, n, c3);
      if (big && n > 1) { p.set(x, y, light(c3, 1.4)); e.set(x, y, light(c3, 1.4)); }
    }
    D.mouth = [Math.round(cx + 5 * u - D.ox), Math.round(cy - D.oy)];
  } else if (kind === 'scorpion') {
    for (let i = 0; i < 4; i++) {
      const B = blank(p);
      const rr = ramp5(i % 2 ? o.c1 : light(o.c1, 1.05));
      ball(B, cx - 4 * u + i * 2.6 * u, cy, 2.6 * u, 2.3 * u - i * 0.1 * u, rr, { tex: i + 1 });
      // ridge highlight along the top of each plate
      const x0 = Math.round(cx - 5 * u + i * 2.6 * u);
      for (let x = x0; x < x0 + 2 * u; x++) { const y = topY(B, x); if (y >= 0) B.set(x, y + 1, rr[4]); }
      put(p, B, true);
    }
    const Hd = blank(p);
    ball(Hd, cx + 5 * u, cy + 0.2 * u, 2.6 * u, 2 * u, R, { tex: 9 });
    put(p, Hd, true);
    eye(p, e, cx + 5.4 * u, cy - 1 * u, o, eyeN(u * 0.8), R[1]);
  } else if (kind === 'crab') {
    const B = blank(p);
    ball(B, cx, cy, 7.5 * u, 4 * u, R, { tex: 6 });
    // knobbly shell: lit bumps and pits
    for (let i = 0; i < 8; i++) {
      const x = Math.round(cx + (hash2(i, 3, 1) - 0.5) * 11 * u), y = Math.round(cy - hash2(i, 5, 1) * 3 * u);
      if (!B.a(x, y)) continue;
      B.over(x, y, A[4]); B.over(x + 1, y, A[3]); B.over(x, y + 1, R[1]);
    }
    // serrated front edge
    for (let k = 0; k < 3; k++) spike(B, cx + (4.2 + k * 1.1) * u, cy - (3 - k * 0.8) * u, Math.max(2, u), Math.max(1, u * 0.9), R[3], R[4]);
    put(p, B, true);
    // eye stalks
    for (const dx of [2.5, 4]) { p.line(cx + dx * u, cy - 3 * u, cx + dx * u, cy - 6 * u, R[2], u >= 2 ? 2 : 1); eye(p, e, cx + dx * u, cy - 6.5 * u, o, eyeN(u * 0.75)); }
    D.mouth = [Math.round(cx + 6 * u - D.ox), Math.round(cy - D.oy)];
  } else {
    // beetle / glass shell
    const Hd = blank(p);
    ball(Hd, cx + 4.8 * u, cy + 0.5 * u, 2.6 * u, 2.2 * u, R, { tex: 3 });
    ball(Hd, cx + 3 * u, cy - 0.4 * u, 2.3 * u, 2.7 * u, R, { tex: 5 });   // pronotum
    put(p, Hd, true);
    const SR = glass ? ramp5(mixc(o.c1, o.c2, 0.18)) : R;
    const B = blank(p);
    ball(B, cx - 1 * u, cy - 1 * u, 7.5 * u, 4.4 * u, SR, { tex: 8, lift: 0.1 });
    // wing seam and a sheen streak along the top of the elytra
    B.line(cx - 7 * u, cy - 0.5 * u, cx + 4 * u, cy - 1.5 * u, SR[0]);
    for (let x = Math.round(cx - 5 * u); x <= cx + 2 * u; x++) { const y = topY(B, x); if (y >= 0) B.set(x, y + Math.max(1, Math.round(u * 0.6)), SR[4]); }
    if (glass) {
      // glowing glass ridges
      const gc = C(o.c2);
      for (let k = 0; k < 3; k++) { const x0 = cx - (5 - k * 3.5) * u, y0 = cy - 3 * u + k * ART; B.line(x0, y0, x0 + 2 * u, y0 + 3 * u, gc); e.line(x0, y0, x0 + 2 * u, y0 + 3 * u, gc); e.set(Math.round(x0), Math.round(y0), light(gc, 1.3)); }
      B.set(Math.round(cx - 3 * u), Math.round(cy - 3 * u), WHITE); B.set(Math.round(cx - 3 * u) + 1, Math.round(cy - 3 * u), light(gc, 1.4));
    } else B.set(Math.round(cx - 3 * u), Math.round(cy - 3 * u), R[4]);
    put(p, B, true);
    // horn / mandibles
    p.line(cx + 7 * u, cy + 0.5 * u, cx + 8.5 * u + (pose.atk === 2 ? ap(1) : 0), cy - 1.5 * u, light(o.c2, 1.1), u >= 2 ? 2 : 1);
    p.line(cx + 7 * u, cy + 1.2 * u, cx + 8.2 * u, cy + 1.8 * u + (pose.atk === 2 ? ap(1) : 0), dark(o.c2, 0.8));
    eye(p, e, cx + 5.6 * u, cy - 0.4 * u, o, eyeN(u * 0.8));
    D.mouth = [Math.round(cx + 7 * u - D.ox), Math.round(cy - D.oy)];
  }
  // pincers / claws in front
  if (kind === 'scorpion' || kind === 'crab') {
    const big = kind === 'crab' ? 1.5 : 1;
    const raise = pose.atk === 1 ? -3 * u : pose.atk === 2 ? 1 * u : 0;
    const reach = pose.atk === 2 ? 2.5 * u : 0;
    const PR = kind === 'crab' ? R : ramp5(mixc(o.c2, o.c1, 0.3));
    for (const far of [true, false]) {
      const col = far ? dimR(PR, 0.65) : PR;
      const L = blank(p);
      const ax = cx + (kind === 'crab' ? 5 : 6) * u + (far ? ap(1) : 0), ay = cy + (far ? -1 : 1) * u;
      const hx2 = ax + 4 * u + reach, hy2 = ay - 2 * u * big + raise;
      L.taper(ax, ay, hx2, hy2, Math.max(2, 1.4 * u), Math.max(2, 1.1 * u), col[3]);
      cyl(L, col);
      ball(L, hx2 + 1.5 * u * big, hy2, 2.2 * u * big, 1.6 * u * big, col);
      const opn = pose.atk === 1 ? 1.5 * u : 0.3 * u;
      const F = blank(p);
      F.taper(hx2 + 2 * u * big, hy2 - 0.5, hx2 + 4.4 * u * big, hy2 - opn - 0.5, Math.max(2, u * big * 0.9), 1, col[3]);
      F.taper(hx2 + 2 * u * big, hy2 + 1, hx2 + 4 * u * big, hy2 + opn * 0.5 + 1, Math.max(1, u * 0.8), 1, col[2]);
      cyl(F, col);
      put(L, F, false);
      // serrated inner edge and dark tips
      if (u * big >= 2) for (let k = 0; k < 3; k++) L.set(Math.round(hx2 + (2.6 + k * 0.6) * u * big), Math.round(hy2 - opn * (0.2 + k * 0.2)), far ? BONE_D : BONE);
      L.set(Math.round(hx2 + 4.4 * u * big), Math.round(hy2 - opn - 0.5), col[0]);
      put(p, L, !far);
    }
  }
  legs(false);
  return finish(p, e);
}

// ================================================================== serpents (head + segments)
function serpentSet(o) {
  const s = o.s, u = s * ART;
  const r0 = Math.max(ap(3), 4.2 * u);
  const W = Math.round(r0 * 4 + ap(12)), H = Math.round(r0 * 4 + ap(10));
  const D = { s, u, r0, W, H, ox: Math.round(W / 2 - r0 * 0.4), oy: H - 2 };
  const fr = (pose) => serpentHead(o, D, pose);
  const segs = [];
  const N = 14;
  for (let i = 0; i < N; i++) segs.push(segSprite(o, Math.max(ap(1.6), r0 * (0.95 - (i / N) * 0.6)), i, u));
  const views = { side: { idle: [fr({}), fr({ bob: 1, tongue: true })], run: [fr({}), fr({ bob: 1 })], atk: [fr({ atk: 1 }), fr({ atk: 2 })], hurt: [fr({ hurt: true })] } };
  return { views, sideOnly: true, segs, height: Math.round(r0 * 2.4), mouth: D.mouth, r0 };
}
function serpentHead(o, D, pose) {
  const { u, r0 } = D;
  const p = mk(D.W, D.H, D.ox, D.oy), e = blank(p);
  const R = ramp5(o.c1), A = ramp5(o.c2);
  const kind = o.kind;
  const m1 = Math.max(1, Math.round(u * 0.75));
  const lunge = pose.atk === 2 ? Math.round(2 * u) : pose.atk === 1 ? -Math.round(u) : 0;
  const cx = D.ox + lunge, cy = Math.round(D.oy - r0 * 1.15 - (pose.bob ? m1 : 0) - (pose.atk === 1 ? u : 0));
  const glass = kind === 'glass';
  if (kind === 'sea') {
    // webbed frill behind the skull
    const F = blank(p);
    const base = [cx - r0 * 0.6, cy - r0 * 0.3];
    const tips = [0, 1, 2, 3].map((k) => [cx - r0 * (1.4 + k * 0.25), cy - r0 * (1.3 - k * 0.3)]);
    for (let k = 0; k < 3; k++) F.poly([base, tips[k], lerpP(tips[k], tips[k + 1], 0.5), tips[k + 1]], k % 2 ? A[2] : A[3]);
    for (let k = 0; k < 4; k++) { F.line(base[0], base[1], tips[k][0], tips[k][1], A[4], Math.max(1, Math.round(u * 0.6))); F.set(Math.round(tips[k][0]), Math.round(tips[k][1]), WHITE); }
    put(p, F, false);
  }
  if (kind === 'sea' || kind === 'eel') {
    // swept dorsal fin with rays, behind the skull
    const F = blank(p);
    const f0 = [cx - r0 * 0.55, cy - r0 * 0.62], f1 = [cx + r0 * 0.15, cy - r0 * 0.78], ft = [cx - r0 * 0.45, cy - r0 * 1.55];
    F.poly([f0, f1, ft], A[3]);
    for (let k = 1; k < 3; k++) F.line(lerp(f0[0], f1[0], k / 3), lerp(f0[1], f1[1], k / 3), lerp(ft[0], f1[0], k * 0.12), lerp(ft[1], f1[1], k * 0.12), A[2]);
    F.line(ft[0], ft[1], f1[0], f1[1], A[1]); F.line(f0[0], f0[1], ft[0], ft[1], A[4]);
    put(p, F, false);
  }
  if (kind === 'worm') {
    const B = blank(p);
    ball(B, cx, cy, r0 * 1.1, r0 * 1.05, R, { tex: 2 });
    // annular ring grooves with a lit lip
    for (let k = -1; k <= 1; k++) {
      const x = Math.round(cx + k * r0 * 0.55 - r0 * 0.2);
      for (let y = Math.round(cy - r0 * 1.1); y <= cy + r0 * 1.1; y++) { if (B.a(x, y)) B.set(x, y, A[1]); if (B.a(x - 1, y)) B.set(x - 1, y, R[4]); }
    }
    put(p, B, false);
    const open = pose.atk === 2 ? r0 * 0.75 : pose.atk === 1 ? r0 * 0.4 : r0 * 0.2;
    const mcx = cx + r0 * 0.95, mrx = Math.max(1, r0 * 0.38), mry = Math.max(1, open);
    ball(p, mcx, cy, mrx, mry, [MAW_D, MAW_D, MAW, MAW, mixc(MAW, '#ffffff', 0.15)]);
    // rings of teeth around the maw
    const nT = Math.max(5, Math.round(mry * 1.3));
    for (let k = 0; k < nT; k++) {
      const a = -Math.PI / 2 + Math.PI * k / (nT - 1);
      p.set(Math.round(mcx + Math.cos(a) * mrx * 0.85), Math.round(cy + Math.sin(a) * mry * 0.9), k % 2 ? BONE_D : BONE);
      if (mry >= 4) p.set(Math.round(mcx + Math.cos(a) * mrx * 0.4), Math.round(cy + Math.sin(a) * mry * 0.55), BONE_D);
    }
    // mandibles
    for (const sg of [-1, 1]) p.line(cx + r0 * 0.8, cy + sg * (open + 1), cx + r0 * 1.5, cy + sg * (open * 0.6), light(o.c2, 1.2), Math.max(1, Math.round(u * 0.8)));
    D.mouth = [Math.round(cx + r0 - D.ox), Math.round(cy - D.oy)];
  } else {
    // snake/eel head: skull + long jaw
    const B = blank(p);
    ball(B, cx, cy, r0, r0 * 0.85, R, { tex: 4, scales: !glass && u >= 1.5 });
    const open = pose.atk === 2 ? Math.round(r0 * 0.6) : 0;
    const tip = Math.round(cx + r0 * 1.9);
    if (open) {
      const MJ = blank(p);
      MJ.poly([[cx + r0 * 0.3, cy + 1], [tip, cy - 1], [tip - 1, cy + open + 1], [cx + r0 * 0.3, cy + 2]], MAW);
      MJ.line(cx + r0 * 0.7, cy + open * 0.55, tip - 3, cy + open * 0.65, TONGUE, Math.max(1, Math.round(u * 0.5)));
      const J = blank(p);
      J.taper(cx, cy + r0 * 0.4, tip - 1, cy + open + 1, r0 * 0.7, r0 * 0.3, R[3]);
      cyl(J, R); underside(J, [A[2]]);
      put(MJ, J, false);
      clipOut(MJ, cx - r0 * 0.05, cy - r0 * 0.05, r0 * 0.82, r0 * 0.66);
      put(B, MJ, false);
    }
    const S = blank(p);
    S.taper(cx + r0 * 0.2, cy - (open ? 1 : 0), tip, cy - 1 - (open ? 1 : 0), r0 * 1.2, r0 * 0.55, R[3]);
    cyl(S, R, { wide: r0 >= 9 });
    clipOut(S, cx - r0 * 0.05, cy - r0 * 0.05, r0 * 0.82, r0 * 0.66);
    put(B, S, false);
    // brow ridge
    B.line(cx + r0 * 0.25, cy - r0 * 0.62, tip - r0 * 0.5, cy - r0 * 0.3, R[4]);
    if (!open) {
      B.line(cx + r0 * 0.5, cy + r0 * 0.2, tip - 1, cy, dark(o.c1, 0.42));
      B.set(Math.round(cx + r0 * 0.5) - 1, Math.round(cy + r0 * 0.2) + 1, dark(o.c1, 0.42));
    } else {
      // fangs
      const fx = tip - Math.max(2, Math.round(r0 * 0.25)), fy = lowY(S, fx);
      if (fy >= 0) { B.line(fx, fy + 1, fx, fy + Math.max(2, Math.round(open * 0.45)), BONE); B.set(fx + 1, fy + 1, BONE_D); }
      for (let x = Math.round(cx + r0 * 0.6); x < fx - 1; x += 2) { const y = lowY(S, x); if (y >= 0) B.set(x, y + 1, BONE_D); }
    }
    B.set(tip - 1, cy - Math.round(r0 * 0.25) - (open ? 1 : 0), R[0]);   // nostril
    eye(B, e, cx + r0 * 0.55, cy - r0 * 0.35, o, eyeN(u), R[1]);
    if (kind === 'sea') for (let k = 0; k < 4; k++) { const x = Math.round(cx - r0 * 0.55 + k * r0 * 0.42), y = Math.round(cy + r0 * (0.32 + (k % 2) * 0.12)); B.set(x, y, o.c3); e.set(x, y, o.c3); }
    if (glass) for (let k = 0; k < 3; k++) { const x = Math.round(cx - r0 * 0.4 + k * r0 * 0.5), y = Math.round(cy - r0 * 0.6 + k * ART); B.line(x, y, x + Math.round(u), y + Math.round(u * 0.6), o.c2); e.line(x, y, x + Math.round(u), y + Math.round(u * 0.6), o.c2); }
    put(p, B, false);
    // flickering forked tongue
    if (pose.tongue && !open) {
      const tx = tip + Math.max(2, Math.round(u * 1.4)), ty = cy;
      p.line(tip, cy, tx, ty, TONGUE); p.set(tx + 1, ty - 1, TONGUE); p.set(tx + 1, ty + 1, TONGUE);
    }
    D.mouth = [Math.round(tip - D.ox), Math.round(cy - D.oy)];
  }
  return finish(p, e);
}
function segSprite(o, r, i, u) {
  const kind = o.kind;
  const n = Math.ceil(r * 2 + 6 + 2 * u);
  const p = mk(n, n, n / 2, n / 2), e = mk(n, n, n / 2, n / 2);
  const R = ramp5(o.c1), A = ramp5(o.c2);
  const c = n / 2;
  ball(p, c, c, r, r * 0.92, R, { tex: 10 + i, scales: kind !== 'worm' && kind !== 'glass' && u >= 1.5 });
  if (kind === 'worm') {
    // ring groove with a lit lip, tiny bristles top and bottom
    const x = Math.round(c + r * 0.3);
    for (let y = Math.round(c - r); y <= c + r; y++) { if (p.a(x, y)) p.set(x, y, A[1]); if (p.a(x - 1, y)) p.set(x - 1, y, R[4]); }
  } else if (kind === 'glass') {
    const x = Math.round(c - r * 0.3), y = Math.round(c - r * 0.4);
    p.line(x, y, x + r * 0.6, y + r * 0.5, o.c2); e.line(x, y, x + r * 0.6, y + r * 0.5, o.c2);
    if (r >= 5) { p.line(x + r * 0.6, y + r * 0.5, x + r * 0.3, y + r * 0.9, o.c2); e.line(x + r * 0.6, y + r * 0.5, x + r * 0.3, y + r * 0.9, o.c2); }
    p.set(x - 1, y - 1, WHITE);
  } else {
    // dorsal ridge and a pale belly band
    const rw = Math.max(1, Math.round(r * 0.28));
    for (let k = -rw; k <= rw; k++) p.set(Math.round(c + k), Math.round(c - r * 0.92) - (Math.abs(k) < rw ? 1 : 0), A[Math.abs(k) < rw ? 3 : 2]);
    p.set(Math.round(c) - 1, Math.round(c - r * 0.92) - 1, A[4]);
    for (let x = Math.round(c - r * 0.6); x <= c + r * 0.6; x++) { const y = lowY(p, x); if (y >= 0) { p.set(x, y, A[2]); if (r >= 4) p.set(x, y - 1, (x & 1) ? A[3] : A[2]); } }
    if (kind === 'sea' && i % 2 === 0) { const sx = Math.round(c + r * 0.15), sy = Math.round(c + r * 0.35); p.set(sx, sy, o.c3); e.set(sx, sy, o.c3); }
    if (kind === 'sea') spike(p, c + r * 0.15, Math.round(c - r * 0.86), Math.max(2, r * 0.38), Math.max(ap(2), 1.6 * u), A[3], A[4]);
  }
  if (i % 3 === 0 && kind !== 'worm') { const gx = Math.round(c - r * 0.4), gy = Math.round(c - r * 0.45); p.over(gx, gy, light(o.c1, 1.4)); if (r >= 6) p.over(gx + 1, gy, light(o.c1, 1.25)); }
  p.outlineSel();
  let emis = false;
  for (let k = 3; k < e.d.length; k += 4) if (e.d[k]) { emis = true; break; }
  return { pix: p, emis: emis ? e : null };
}

// ================================================================== blobs (front)
function blobSet(o) {
  const s = o.s, u = s * ART;
  const W = Math.round(22 * u) + ap(12), H = Math.round(26 * u) + ap(12);
  const D = { s, u, W, H, ox: Math.round(W / 2), oy: H - 2 };
  const fr = (pose) => blobFrame(o, D, pose);
  return {
    views: { down: {
      idle: [fr({ sq: 0 }), fr({ sq: 1 })],
      run: [fr({ sq: -2, hop: 2 }), fr({ sq: 0, hop: 1 }), fr({ sq: 2 }), fr({ sq: 1 })],
      atk: [fr({ sq: 3 }), fr({ sq: -3, mouth: true })],
      hurt: [fr({ sq: 1, hurt: true })],
    } },
    sideOnly: false, frontOnly: true, height: Math.round(13 * u),
  };
}
function blobFrame(o, D, pose) {
  const { s, u } = D;
  const p = mk(D.W, D.H, D.ox, D.oy), e = blank(p);
  const R = ramp5(o.c1), A = ramp5(o.c2);
  const sq = pose.sq || 0, sk = 0.6 * ART * Math.max(1, s);
  const rx = 7.5 * u + sq * sk, ry = 6.5 * u - sq * sk;
  const lift = Math.round((pose.hop || 0) * ART * Math.max(1, s));
  const cx = D.ox, cy = D.oy - ry - lift + 1, floor = D.oy - lift;
  // lure stalk behind
  if (o.lure) {
    const bx = cx + rx * 0.55, by = cy - ry - 6 * u + sq * ART;
    const lw = Math.max(1, Math.round(u * 0.7));
    p.line(cx + rx * 0.1, cy - ry * 0.8, cx + rx * 0.35, by + 1, R[2], lw);
    p.line(cx + rx * 0.35, by + 1, bx, by, R[2], lw);
    if (lw > 1) p.line(cx + rx * 0.1 - 1, cy - ry * 0.8, cx + rx * 0.35 - 1, by + 1, R[4]);
    const lr = 1.6 * u, c3 = C(o.c3);
    p.disc(bx, by + 0.5, lr, c3); e.disc(bx, by + 0.5, lr, c3);
    p.disc(bx - lr * 0.2, by + 0.3, lr * 0.55, light(c3, 1.3)); e.disc(bx - lr * 0.2, by + 0.3, lr * 0.55, light(c3, 1.3));
    p.set(Math.round(bx - lr * 0.45), Math.round(by - lr * 0.4), WHITE);
  }
  ball(p, cx, cy, rx, ry, R, { clipY: floor, tex: 5 });
  // keep spots and bubbles off the face band so they never read as extra eyes
  const fy0 = cy - ry * 0.05;
  const offFace = (x, y) => (Math.abs(x - cx) < rx * 0.55 && y > fy0 - ry * 0.32 && y < fy0 + ry * 0.62 ? [cx + Math.sign(x - cx || 1) * rx * (0.6 + Math.abs(x - cx) / rx * 0.4), y - ry * 0.12] : [x, y]);
  // a darker core seen through the jelly, and suspended bubbles
  ball(p, cx + rx * 0.08, cy + ry * 0.2, rx * 0.5, ry * 0.42, R.map((c) => alphaC(dark(c, 0.8), 150)), { clipY: floor });
  for (let k = 0; k < 3; k++) {
    const br = Math.max(1, (0.5 + hash2(k, 7, 3) * 0.5) * u * 0.8);
    const [x, y] = offFace(cx + (hash2(k, 1, 9) - 0.5) * rx * 1.1, cy + (hash2(k, 2, 9) - 0.2) * ry * 0.7);
    if (br >= 1.8) p.ring(x, y, br, light(o.c1, 1.35), 1); else p.set(Math.round(x), Math.round(y), light(o.c1, 1.35));
    p.set(Math.round(x - br * 0.4), Math.round(y - br * 0.5), light(o.c1, 1.7));
  }
  // translucent bright underside
  for (let x = Math.round(cx - rx); x <= cx + rx; x++) for (let y = Math.round(cy + ry * 0.55); y <= floor; y++) if (p.a(x, y) && !p.a(x, y + 1)) { p.set(x, y, light(o.c1, 1.25)); if (p.a(x, y - 1) && u >= 1.6) p.set(x, y - 1, light(o.c1, 1.08)); }
  // glossy highlight: a curved streak and a hard glint
  const hl = light(o.c1, 1.6);
  for (let a = 3.5; a <= 4.4; a += 0.08) { const hx = cx + Math.cos(a) * rx * 0.72, hy = cy + Math.sin(a) * ry * 0.72; p.over(Math.round(hx), Math.round(hy), hl); if (u >= 2.2) p.over(Math.round(hx) + 1, Math.round(hy) + 1, light(o.c1, 1.3)); }
  p.set(Math.round(cx - rx * 0.5), Math.round(cy - ry * 0.55), WHITE);
  if (u >= 2) p.set(Math.round(cx - rx * 0.5) + 1, Math.round(cy - ry * 0.55), mixc(WHITE, o.c1, 0.3));
  // spots
  for (let k = 0; k < 4; k++) {
    const [x, y] = offFace(cx + (hash2(k, 1, 4) - 0.5) * rx * 1.4, cy + (hash2(k, 2, 4) - 0.3) * ry * 0.9);
    const sr = Math.max(0.8, u * 0.9), sr2 = Math.max(0.8, u * 0.7);
    p.ellipse(x, y, sr, sr2, A[1]);
    if (sr >= 1.4) { p.set(Math.round(x - sr * 0.4), Math.round(y - sr2 * 0.4), A[2]); }
  }
  // mushroom caps: gills underneath, pale spots on top
  if (o.caps) for (const [dx, r] of [[-0.45, 0.32], [0.1, 0.42], [0.5, 0.28]]) {
    const x = cx + dx * rx, y = cy - ry * 0.75 - r * rx * 0.2;
    const crx = r * rx, cry = r * rx * 0.6;
    p.rect(Math.round(x - crx * 0.2), Math.round(y), Math.max(2, Math.round(crx * 0.4)), Math.max(1, Math.round(cry * 0.6)), ramp5('#e8dcd0')[2]);
    ball(p, x, y, crx, cry, A, { clipY: y + 1 });
    for (let xx = Math.round(x - crx + 1); xx <= x + crx - 1; xx++) if (p.a(xx, Math.round(y) + 1)) p.set(xx, Math.round(y) + 1, (xx & 1) ? A[0] : A[1]);
    const sp = '#f8f0f0';
    p.set(Math.round(x - crx * 0.3), Math.round(y - cry * 0.45), sp); p.set(Math.round(x + crx * 0.3), Math.round(y - cry * 0.15), sp);
    if (crx >= 4) { p.set(Math.round(x - crx * 0.3) + 1, Math.round(y - cry * 0.45), sp); p.set(Math.round(x + crx * 0.05), Math.round(y - cry * 0.7), sp); p.set(Math.round(x - crx * 0.65), Math.round(y - cry * 0.05), sp); }
  }
  // face
  const ey = Math.round(cy - ry * 0.05);
  const ew = Math.max(2, Math.min(7, Math.round(u * 0.85))), eh = ew + 1;
  const c3 = C(o.c3), hi = light(c3, 1.4);
  for (const sg of [-1, 1]) {
    const x = Math.round(cx + sg * rx * 0.32 - (sg < 0 ? ew - 1 : 0));
    if (pose.hurt) { for (let k = 0; k < eh; k++) { p.set(x + Math.round(k * (ew - 1) / (eh - 1)), ey + k, EYE_DARK); p.set(x + ew - 1 - Math.round(k * (ew - 1) / (eh - 1)), ey + k, EYE_DARK); } continue; }
    if (ew >= 4) { p.rrect(x, ey, ew, eh, c3, 1); e.rrect(x, ey, ew, eh, c3, 1); p.rect(x + 1, ey + 1, Math.max(1, ew >> 1), Math.max(1, eh >> 1), hi); e.rect(x + 1, ey + 1, Math.max(1, ew >> 1), Math.max(1, eh >> 1), hi); }
    else { p.rect(x, ey, ew, eh, c3); e.rect(x, ey, ew, eh, c3); p.set(x + (sg < 0 ? 0 : ew - 1), ey, hi); e.set(x + (sg < 0 ? 0 : ew - 1), ey, hi); }
    p.rect(x, ey + eh, ew, 1, dark(o.c1, 0.6));
  }
  if (pose.mouth) {
    const mrx = Math.max(1, rx * 0.3), mry = Math.max(1, ry * 0.25), my = cy + ry * 0.4;
    p.ellipse(cx, my, mrx, mry, '#2a0a10');
    p.ellipse(cx, my + mry * 0.4, mrx * 0.6, mry * 0.45, '#5a1a22');
    for (let x = Math.round(cx - mrx * 0.7); x <= cx + mrx * 0.7; x += 2) p.set(x, Math.round(my - mry * 0.75), BONE);
  } else {
    const my = Math.round(cy + ry * 0.35);
    p.line(cx - rx * 0.15, my, cx + rx * 0.15, my, dark(o.c1, 0.4));
    p.set(Math.round(cx - rx * 0.15) - 1, my - 1, dark(o.c1, 0.4)); p.set(Math.round(cx + rx * 0.15) + 1, my - 1, dark(o.c1, 0.4));
  }
  return finish(p, e);
}
const alphaC = (c, a) => [c[0], c[1], c[2], a];

// ================================================================== wraiths (front / back)
function wraithSet(o) {
  const s = o.s, u = s * ART;
  const W = Math.round(24 * u) + ap(10), H = Math.round(30 * u) + ap(10);
  const D = { s, u, W, H, ox: Math.round(W / 2), oy: H - 2 };
  const v = (view) => {
    const fr = (pose) => wraithFrame(o, D, view, pose);
    return { idle: [0, 1, 2].map((t) => fr({ t })), run: [0, 1, 2].map((t) => fr({ t, lean: 1 })), atk: [fr({ t: 0, atk: 1 }), fr({ t: 1, atk: 2 })], hurt: [fr({ t: 0, hurt: true })] };
  };
  return { views: { down: v('down'), up: v('up') }, sideOnly: false, height: Math.round(24 * u) };
}
function wraithFrame(o, D, view, pose) {
  const { u } = D;
  const p = mk(D.W, D.H, D.ox, D.oy), e = blank(p);
  const R = ramp5(o.c1), A = ramp5(o.c2), Rd = dimR(R, 0.72);
  const cx = D.ox, bottom = D.oy, top = Math.round(bottom - 24 * u);
  const shY = top + Math.round(9 * u), hemY = bottom - Math.round(2 * u);
  // tattered robe: cylinder shading, soft vertical folds, a trim band and a dithered ragged hem
  const RB = blank(p);
  const fold = Math.max(3, Math.round(3 * u));
  const trimY = Math.round(hemY - 3 * u);
  for (let y = shY; y <= bottom; y++) {
    const t = (y - shY) / (bottom - shY);
    const half = 3.5 * u + t * 3.5 * u;
    for (let x = Math.round(cx - half); x <= cx + half; x++) {
      const q = (x + 0.5 - (cx - half)) / (2 * half);
      if (y > hemY - 2 * u) {
        // jagged dithered tatters that drift each frame
        const jag = Math.abs(Math.sin((x / ART + pose.t * 2.3) * 0.9)) * 3 * u;
        if (y > hemY + jag - 2 * u && bayer(x, y) > 0.5 - (bottom - y) / (4 * u)) continue;
      }
      let k = q < 0.1 ? 4 : q < 0.55 ? 3 : q < 0.84 ? 2 : 1;
      const fx = ((Math.round(x - cx) % fold) + fold) % fold;
      if (t > 0.1 && q > 0.08 && q < 0.92) { if (fx === 0) k = Math.max(1, k - 1); else if (fx === 1 && k === 3) k = 4; }
      if (y === trimY || y === trimY + 1) RB.set(x, y, y === trimY ? A[3] : A[1]);
      else RB.set(x, y, R[k]);
    }
  }
  // trim pattern
  for (let x = 0; x < RB.w; x += 3) if (RB.a(x, trimY)) RB.set(x, trimY, A[4]);
  put(p, RB, false);
  // arms: wide sleeves, dark cuffs, bony fingers
  const armUp = pose.atk === 1, armOut = pose.atk === 2;
  const hand = ramp5(o.hand || '#d8d0c0');
  for (const sg of [-1, 1]) {
    const ax = cx + sg * 4 * u, ay = shY + u;
    const hx = armUp ? cx + sg * 6 * u : armOut ? cx + sg * 3.5 * u : cx + sg * 6.5 * u;
    const hy = armUp ? top + 2 * u : armOut ? shY + 9 * u : shY + 8 * u;
    const SL = blank(p);
    SL.taper(ax, ay, hx, hy, 3 * u, 2.6 * u, R[3]);
    cyl(SL, sg < 0 ? R : Rd, { wide: u >= 1.6 });
    // cuff opening
    const cfx = Math.round(hx), cfy = Math.round(hy + (armUp ? 0.6 * u : -0.6 * u));
    SL.ellipse(cfx, cfy, Math.max(1, 1.1 * u), Math.max(1, 0.6 * u), VOID);
    put(p, SL, true);
    // fingers point along the arm's reach
    const fl = Math.max(2, Math.round(1.25 * u)), dirY = armUp ? -1 : 1;
    const hy0 = Math.round(hy + (armUp ? -0.8 * u : 0.8 * u));
    const fs = Math.max(1.5, u * 0.9);
    p.rect(Math.round(hx - fs), hy0 - (armUp ? 0 : 1), Math.round(fs * 2) + 1, 1, hand[2]);
    for (let k = -1; k <= 1; k++) {
      const fxp = Math.round(hx + k * fs);
      for (let j = 0; j < fl; j++) p.set(fxp, hy0 + dirY * j, j === fl - 1 ? hand[1] : j === 0 ? hand[4] : hand[3]);
    }
    if (armUp || armOut) { const c3 = C(o.c3); for (let k = -1; k <= 1; k++) e.set(Math.round(hx + k * Math.max(1.5, u * 0.9)), hy0 + dirY * (fl - 1), c3); e.set(Math.round(hx), Math.round(hy), c3); }
  }
  // hood with a peak, mantle across the shoulders
  const hy = top + Math.round(5 * u);
  const HD = blank(p);
  ball(HD, cx, hy, 4.6 * u, 5 * u, R);
  HD.poly([[cx - 1.4 * u, top + 1.2 * u], [cx + 1.6 * u, top + 1.2 * u], [cx - 0.4 * u, top - 1.2 * u]], R[3]);
  HD.set(Math.round(cx - 0.4 * u), Math.round(top - 1.2 * u) + 1, R[4]);
  const mY = Math.round(hy + 4.4 * u);
  for (let x = Math.round(cx - 5 * u); x <= cx + 5 * u; x++) for (let k = 0; k < Math.max(2, Math.round(u)); k++) if (HD.a(x, mY + k) || k === 0) HD.set(x, mY + k, k === 0 ? A[3] : A[2]);
  if (view === 'down') {
    // face opening: lit inner rim, black void, glowing eyes
    HD.ellipse(cx, hy + u * 0.8, 2.8 * u + 1, 3 * u + 1, R[1]);
    HD.ellipse(cx, hy + u * 0.8, 2.8 * u, 3 * u, VOID);
    for (let x = Math.round(cx - 2.6 * u); x <= cx + 2.6 * u; x++) { const y = topY(HD, x); void y; }
    const gy = Math.round(hy + u * 0.5);
    const ew = u >= 2.6 ? 3 : 2, eh = u >= 2.6 ? 2 : 1;
    const c3 = C(o.c3);
    for (const sg of [-1, 1]) {
      const x = Math.round(cx + sg * 1.3 * u) - (sg < 0 ? ew - 1 : 0);
      if (pose.hurt) { HD.rect(x, gy, ew, 1, '#2a2030'); continue; }
      HD.rect(x, gy, ew, eh, c3); e.rect(x, gy, ew, eh, c3);
      HD.set(x + (sg < 0 ? ew - 1 : 0), gy, light(c3, 1.4)); e.set(x + (sg < 0 ? ew - 1 : 0), gy, light(c3, 1.4));
    }
  } else {
    HD.line(cx, hy - 3 * u, cx, hy + 4 * u, R[1]);
    HD.line(cx - 1, hy - 3 * u, cx - 1, hy + 3 * u, R[4]);
    for (const sg of [-1, 1]) HD.line(cx + sg * 2.4 * u, hy - 1.5 * u, cx + sg * 3.2 * u, hy + 3.5 * u, R[2]);
  }
  put(p, HD, true);
  return finish(p, e);
}

// ================================================================== flyers (side)
function flyerSet(o) {
  const s = o.s, u = s * ART;
  const W = Math.round(30 * u) + ap(12), H = Math.round(28 * u) + ap(10);
  const D = { s, u, W, H, ox: Math.round(W / 2), oy: H - 2 };
  const fr = (pose) => flyerFrame(o, D, pose);
  return {
    views: { side: {
      idle: [0, 1, 2, 1].map((w) => fr({ w })),
      run: [0, 1, 2, 1].map((w) => fr({ w })),
      atk: [fr({ w: 0, atk: 1 }), fr({ w: 3, atk: 2 })],
      hurt: [fr({ w: 2, hurt: true })],
    } },
    sideOnly: true, height: Math.round(10 * u), flapFps: 12,
  };
}
function flyerFrame(o, D, pose) {
  const { u } = D;
  const p = mk(D.W, D.H, D.ox, D.oy), e = blank(p);
  const kind = o.kind;
  const body = ramp5(o.c1), wingR = ramp5(kind === 'gull' ? o.c2 : mixc(o.c1, o.c2, 0.25));
  const headC = kind === 'vulture' ? ramp5(o.c2) : body;
  const beak = ramp5(kind === 'gull' ? o.c3 : '#e0c080');
  const tilt = pose.atk === 2 ? 2 * u : 0;
  const cx = D.ox, cy = Math.round(D.oy - 7 * u);
  const shX = cx + u, shY = cy - 2 * u;
  const one = ap(1);
  const wing = (far) => {
    const W = far ? dimR(wingR, 0.7) : wingR;
    const fo = far ? -one : 0;
    let pts;
    switch (pose.w) {
      case 0: pts = [[shX, shY + fo], [shX - 3 * u, shY - 10 * u + fo], [shX - 8 * u, shY - 8 * u + fo], [shX - 5 * u, shY + fo]]; break;
      case 1: pts = [[shX, shY + fo], [shX - 6 * u, shY - 5 * u + fo], [shX - 12 * u, shY - 3 * u + fo], [shX - 4 * u, shY + one + fo]]; break;
      case 2: pts = [[shX, shY + fo], [shX - 5 * u, shY + 5 * u + fo], [shX - 10 * u, shY + 7 * u + fo], [shX - 6 * u, shY + 1.5 * u + fo]]; break;
      default: pts = [[shX, shY + fo], [shX - 6 * u, shY - 2 * u + fo], [shX - 12 * u, shY + fo], [shX - 4 * u, shY + 2 * one + fo]];
    }
    const L = blank(p);
    L.poly(pts, W[2]);
    fillGaps(L, W[2]);
    // coverts: the inner part of the wing a tone lighter
    L.poly([pts[0], lerpP(pts[0], pts[1], 0.85), lerpP(pts[0], pts[2], 0.48), lerpP(pts[0], pts[3], 0.75)], W[3]);
    // primaries: notched feather tips along the outer and trailing edges, with separation lines
    const nF = Math.max(2, Math.round(u * 1.6));
    for (let k = 1; k <= nF; k++) {
      const q = lerpP(pts[1], pts[2], k / (nF + 1) * 0.9 + 0.1);
      const d = Math.hypot(pts[0][0] - q[0], pts[0][1] - q[1]) || 1;
      const len = Math.max(2, 1.2 * u);
      L.line(q[0], q[1], q[0] + (pts[0][0] - q[0]) / d * len, q[1] + (pts[0][1] - q[1]) / d * len, W[1]);
    }
    // gull wingtips are black with a white mirror spot
    if (kind === 'gull') {
      const tip = pts[2], tr = Math.max(2, 1.8 * u);
      for (let y = Math.floor(tip[1] - tr); y <= tip[1] + tr; y++) for (let x = Math.floor(tip[0] - tr); x <= tip[0] + tr; x++) if (L.a(x, y) && Math.hypot(x - tip[0], y - tip[1]) < tr) L.set(x, y, far ? '#1a1a22' : '#2a2a34');
      L.set(Math.round(tip[0] + (pts[0][0] - tip[0]) * 0.12), Math.round(tip[1] + (pts[0][1] - tip[1]) * 0.12), far ? '#a0a0a8' : '#f0f0f0');
    }
    // lit leading edge
    L.line(pts[0][0], pts[0][1], pts[1][0], pts[1][1], W[4], u >= 2.2 ? 2 : 1);
    put(p, L, !far);
  };
  wing(true);
  // tail fan with feather lines
  const TL = blank(p);
  const tp = [[cx - 4 * u, cy - u], [cx - 9 * u, cy - 2 * u + tilt * 0.5], [cx - 9 * u, cy + 2 * u], [cx - 4 * u, cy + u]];
  TL.poly(tp, body[2]);
  for (let k = 1; k < 3; k++) TL.line(cx - 4 * u, cy, cx - 9 * u, cy - 2 * u + tilt * 0.5 + k * (4 * u - tilt * 0.5) / 3, body[1]);
  TL.line(tp[0][0], tp[0][1], tp[1][0], tp[1][1], body[3]);
  put(p, TL, false);
  // body: feathered, pale breast band underneath
  const B = blank(p);
  ball(B, cx, cy + tilt * 0.3, 5 * u, 3.2 * u, body, { tex: 3 });
  if (kind !== 'gull') for (let x = Math.round(cx - 3 * u); x <= cx + 3 * u; x++) { const y = lowY(B, x); if (y >= 0) { B.set(x, y - 1, body[4]); if ((x & 1) && u >= 1.4) B.set(x, y - 2, body[3]); } }
  // feather scallops on the back
  if (u >= 1.4) for (let k = 0; k < 4; k++) { const x = Math.round(cx - 2.6 * u + k * 1.6 * u), y = topY(B, x); if (y >= 0) { B.set(x, y + 2, body[2]); B.set(x + 1, y + 3, body[2]); } }
  put(p, B, true);
  // talons
  const tc = ramp5('#c8a060');
  const tx = pose.atk === 2 ? cx + 3 * u : cx;
  const fy = cy + 5 * u;
  p.line(cx, cy + 2.5 * u, tx + u, fy, tc[3], u >= 2 ? 2 : 1); p.line(cx - u, cy + 2.5 * u, tx, fy, tc[2]);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1]]) p.set(Math.round(tx + u) + dx * Math.max(1, Math.round(u * 0.6)), Math.round(fy) + dy, '#2a2018');
  // head
  const hx = Math.round(cx + 5.2 * u), hy = Math.round(cy - 2.4 * u + tilt);
  const HL = blank(p);
  if (kind === 'vulture') {
    const N = blank(p); N.taper(cx + 3 * u, cy - u, hx, hy, 2.4 * u, 1.6 * u, headC[3]); cyl(N, headC); put(HL, N, false);
    // fluffy ruff
    mane(HL, cx + 3 * u, cy - 1.2 * u, 2 * u, 1.5 * u, body, 4, 10);
  }
  ball(HL, hx, hy, 2.3 * u, 2.1 * u, headC);
  if (kind === 'harpy') for (let k = 0; k < 3; k++) HL.line(hx - u, hy - 1.6 * u, hx - (2.4 + k * 0.6) * u, hy - (2.2 - k * 0.9) * u, headC[k === 1 ? 4 : 3]);   // crest
  // beak: hooked upper mandible, lower mandible drops open on the strike
  const bOpen = pose.atk === 2 ? Math.max(1, Math.round(u * 0.8)) : 0;
  const hook = kind === 'vulture' || kind === 'harpy' ? 1.2 : 0.4;
  if (bOpen) HL.poly([[hx + 1.5 * u, hy + 0.5 * u], [hx + 3.6 * u, hy + 0.9 * u + bOpen], [hx + 1.5 * u, hy + 1.1 * u + bOpen * 0.5]], beak[1]);
  HL.poly([[hx + 1.5 * u, hy - 0.6 * u], [hx + 4.5 * u, hy + hook * u], [hx + 1.5 * u, hy + 0.9 * u]], beak[3]);
  HL.line(hx + 1.5 * u, hy - 0.6 * u, hx + 4.2 * u, hy + hook * u - 1, beak[4]);
  HL.set(Math.round(hx + 4.5 * u) - 1, Math.round(hy + hook * u), beak[0]);
  if (kind === 'gull' && u >= 1.2) HL.set(Math.round(hx + 3.2 * u), Math.round(hy + 0.6 * u), '#c03020');
  eye(HL, e, hx + 0.6 * u, hy - 0.5 * u, o, u >= 2 ? 2 : 1, kind === 'vulture' ? headC[1] : null);
  put(p, HL, true);
  wing(false);
  return finish(p, e);
}

// ================================================================== floating eyes (front)
function eyeSet(o) {
  const s = o.s, u = s * ART;
  const W = Math.round(22 * u) + ap(10), H = Math.round(28 * u) + ap(10);
  const D = { s, u, W, H, ox: Math.round(W / 2), oy: H - 2 };
  const fr = (pose) => eyeFrame(o, D, pose);
  // iris drawn by the actor so the eye can track its target
  const ir = Math.max(ap(1.4), 2.3 * u);
  const n = Math.ceil(ir * 2 + 2);
  const iris = mk(n, n, n / 2, n / 2), ie = mk(n, n, n / 2, n / 2);
  const c3 = C(o.c3), IR = ramp5(c3);
  iris.disc(n / 2, n / 2, ir, IR[2]); ie.disc(n / 2, n / 2, ir, c3);
  iris.disc(n / 2, n / 2, ir - 1, c3);
  // radial flecks
  if (ir >= 3) for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + 0.3; iris.set(Math.floor(n / 2 + Math.cos(a) * ir * 0.68), Math.floor(n / 2 + Math.sin(a) * ir * 0.68), IR[4]); }
  iris.disc(n / 2, n / 2, Math.max(0.7, ir * 0.42), '#0a0408');
  iris.set(Math.floor(n / 2 - ir * 0.5), Math.floor(n / 2 - ir * 0.5), WHITE);
  if (ir >= 4) iris.set(Math.floor(n / 2 - ir * 0.5) + 1, Math.floor(n / 2 - ir * 0.5), mixc(WHITE, c3, 0.4));
  const out = {
    views: { down: { idle: [fr({ t: 0 }), fr({ t: 1 })], run: [fr({ t: 0 }), fr({ t: 1 })], atk: [fr({ t: 0, atk: 1 }), fr({ t: 1, atk: 2 })], hurt: [fr({ t: 0, hurt: true })] } },
    sideOnly: false, frontOnly: true, height: Math.round(16 * u),
    iris: { pix: iris, emis: ie }, lookR: Math.max(1, 1.6 * u),
    _D: D,
  };
  out.eyeAt = [0, -Math.round(D.oy - D.cy)];
  out.mouth = D.mouth;
  return out;
}
function eyeFrame(o, D, pose) {
  const { u } = D;
  const p = mk(D.W, D.H, D.ox, D.oy), e = blank(p);
  const R = ramp5(o.c1), W = ramp5(o.c2);
  const r = 6.5 * u;
  const cx = D.ox, cy = Math.round(D.oy - 10 * u - r * 0.6);
  D.cy = cy;
  // tentacles: tapered, lit on one side, pale suckers underneath
  const TT = blank(p);
  for (let k = 0; k < 5; k++) {
    const bx = cx + (k - 2) * r * 0.35;
    let x = bx, y = cy + r * 0.6;
    for (let i = 0; i < 8; i++) {
      const nx = bx + Math.sin(i * 0.8 + k + pose.t * 1.6) * 1.6 * u, ny = y + 1.2 * u;
      TT.taper(x, y, nx, ny, Math.max(1.2, u * (1.7 - i * 0.17)), Math.max(1, u * (1.7 - (i + 1) * 0.17)), R[3]);
      x = nx; y = ny;
    }
  }
  cyl(TT, dimR(R, 0.85));
  if (u >= 1.4) for (let k = 0; k < 5; k++) for (let i = 1; i < 7; i += 2) {
    const bx = cx + (k - 2) * r * 0.35, x = bx + Math.sin(i * 0.8 + k + pose.t * 1.6) * 1.6 * u, y = cy + r * 0.6 + (i + 1) * 1.2 * u;
    if (TT.a(Math.round(x) + 1, Math.round(y))) TT.set(Math.round(x) + 1, Math.round(y), W[2]);
  }
  put(p, TT, false);
  const B = blank(p);
  ball(B, cx, cy, r, r, R, { tex: 7 });
  // a crown of short spines
  for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k - 2) * 0.42; spike(B, cx + Math.cos(a) * r * 0.88, cy + Math.sin(a) * r * 0.88 + 1, Math.max(2, u * 1.1), Math.max(2, u * 1.3), R[2], R[4]); }
  // eyeball and lids
  const er = r * 0.72;
  const lid = pose.atk === 1 ? 0.45 : pose.hurt ? 0.7 : 0;
  B.ellipse(cx, cy, er + 1, er + 1, R[0]);
  ball(B, cx, cy, er, er, W);
  for (let k = 0; k < 4; k++) {
    const a = k * 1.57 + 0.4;
    const v = mixc(o.c2, '#c03040', 0.5);
    const mx = cx + Math.cos(a) * er * 0.72, my = cy + Math.sin(a) * er * 0.68;
    B.line(cx + Math.cos(a) * er * 0.5, cy + Math.sin(a) * er * 0.5, mx, my, v);
    B.line(mx, my, cx + Math.cos(a + 0.3) * er * 0.95, cy + Math.sin(a + 0.3) * er * 0.9, v);
  }
  B.set(Math.round(cx - er * 0.55), Math.round(cy - er * 0.6), WHITE);
  if (lid > 0) {
    // upper lid slides down over the ball, its edge a dark crease with a lit lip
    const ly = cy - er + er * 2 * lid;
    for (let y = Math.floor(cy - er - 1); y <= ly; y++) for (let x = Math.floor(cx - er - 1); x <= cx + er + 1; x++) if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= er + 0.5) B.set(x, y, y >= Math.round(ly) - 1 ? R[4] : R[3]);
    for (let x = Math.floor(cx - er); x <= cx + er; x++) if (Math.hypot(x + 0.5 - cx, Math.round(ly) + 1.5 - cy) <= er) B.set(x, Math.round(ly) + 1, R[0]);
  }
  put(p, B, false);
  if (pose.atk === 2) { e.disc(cx, cy, er * 0.5, o.c3); }
  D.mouth = [0, cy - D.oy];
  return finish(p, e);
}
