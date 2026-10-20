// Hand-built monster designs: the Frostreach. See kit.js for the design format and
// docs/BESTIARY.md for the concepts.
import { C, R, fillGaps, ramp, pal5, layer, put, blob, tube, horn, slab, facet, shard, wing, drape, ik, stride, sin, cos, lerp, clamp, bez, glow, eyeGlow, eyeBead, eyeBall, teeth, maw, crack, spots, over, rimLight, tint, light, dark, mixc, hash2, bayer, cyl, blank, underside, WHITE, VOID, BONE, BONE_D, MAW, MAW_D, TONGUE, EYE_DARK, CREAM } from './kit.js';

// ------------------------------------------------------------------ local helpers
const TAU = Math.PI * 2;
const cols = (...h) => h.map((c) => C(c));
// shared Frostreach ramps (dark -> light, 5 tones)
const ICE = cols('#243e7b', '#3e6aa8', '#6aa0d0', '#a8d0ec', '#e6f4fc');
const SNOW = cols('#5c6088', '#8a8eb6', '#b2b4d4', '#dcdcec', '#f6f2ea');
const AUR = ['#1f6f6a', '#2fa088', '#5cd0a0', '#8ae8b8', '#7ab8e8', '#9a7ae0', '#c860f0', '#f5afd6'];

// resample a polyline to points ~step px apart: [x, y, s] with s = 0..1 along the length
function walk(pts, step = 0.5) {
  const out = [];
  let total = 0;
  const seg = [];
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); total += l; }
  if (total < 0.01) return [[pts[0][0], pts[0][1], 0]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const n = Math.max(1, Math.ceil(seg[i - 1] / step));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) { const f = k / n; out.push([lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f), (acc + seg[i - 1] * f) / total]); }
    acc += seg[i - 1];
  }
  return out;
}
// An aurora ribbon along a path: a glowing band with vertical curtain rays, its hue running along
// the colour list from root to tip, wobbling sideways and dithering out toward the tip.
// hw(s): half-width; o: { phase, amp (px), freq, fade (s where it starts to dissolve), from (s to
// start at), solid (paint the inner band into p as well, so it is outlined), alpha (fringe alpha),
// ray (ray offset: animates the curtain stripes), dim (0..1 darker), off (px the band branches
// sideways by its tip) }
function ribbon(F, pts, hw, list, o = {}) {
  const S = walk(pts, 0.5), cc = list.map((c) => (o.dim ? dark(C(c), 1 - o.dim) : C(c)));
  const hi = cc.map((c) => light(c, 1.16)), lo = cc.map((c) => dark(c, 0.78));
  const ph = o.phase || 0, amp = o.amp || 0, fq = o.freq || 1.4, fade = o.fade ?? 0.72, from = o.from || 0, ray = o.ray || 0;
  const al = o.alpha ?? 190, seen = new Set();
  for (let i = 0; i < S.length; i++) {
    const [x, y, s] = S[i];
    if (s < from) continue;
    const a = S[Math.max(0, i - 3)], b = S[Math.min(S.length - 1, i + 3)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const nx = -ty, ny = tx, f = (s - from) / Math.max(0.01, 1 - from), wob = Math.sin((s * fq - ph) * TAU) * amp * f + (o.off || 0) * f * f;
    const cx = x + nx * wob, cy = y + ny * wob, w = Math.max(0.6, hw(s));
    for (let d = -w; d <= w; d += 0.5) {
      const px = Math.floor(cx + nx * d), py = Math.floor(cy + ny * d), key = py * 4096 + px;
      if (seen.has(key)) continue;
      seen.add(key);
      if (s > fade && bayer(px, py) < (s - fade) / (1 - fade)) continue;
      const k = Math.min(cc.length - 1, Math.floor(f * (cc.length - 0.01)));
      const e = d / w;                                   // -1 .. 1 across the band
      const rayHit = ((px + ray) % 3 + 3) % 3 === 0;
      let c = e > 0.35 ? hi[k] : e < -0.55 ? lo[k] : cc[k];
      if (rayHit && e > -0.6) c = hi[Math.min(cc.length - 1, k + 1)];
      const edge = Math.abs(e) > 0.78;
      if (o.solid && !edge && s < fade) { F.p.set(px, py, c); F.e.set(px, py, c); }
      else F.e.set(px, py, [c[0], c[1], c[2], edge ? Math.round(al * 0.6) : al]);
    }
  }
  return F;
}
// a hanging icicle: a downward shard from (x, y), len long, w half-width at the root
function icicle(L, x, y, len, w, Rm = ICE) {
  L.poly([[x - w, y], [x + w, y], [x + w * 0.2, y + len]], Rm[3]);
  L.line(x - w + 0.5, y, x - w * 0.2 + 0.5, y + len * 0.6, Rm[4]);
  L.line(x + w - 0.5, y, x + w * 0.4, y + len * 0.7, Rm[2]);
  return L;
}
// two-bone limb from root a to end b: returns the joint
function limb(L, a, b, l1, l2, r0, r1, r2, Rm, bend, o) {
  const j = ik(a, b, l1, l2, bend);
  tube(L, [a, j], [r0, r1], Rm, o);
  tube(L, [j, b], [r1, r2], Rm, o);
  return j;
}
// A broad rounded owl wing from the shoulder S: leading edge along angle a, the feather fan
// sweeping to a + spread; scalloped trailing edge, pale coverts, dark chevron bars, dark tips.
function owlWing(L, S, a, len, spread, Rm, o = {}) {
  const n = o.n ?? 7, T = blank(L), sg = Math.sign(spread) || 1;
  const at = (ang, r) => [S[0] + Math.cos(ang) * r, S[1] + Math.sin(ang) * r];
  const pts = [S, at(a - 0.1 * sg, len * 0.46)], notches = [];
  for (let k = 0; k < n; k++) {
    const f = k / (n - 1), ang = a + spread * f, r = len * lerp(1, 0.48, f ** 1.3);
    pts.push(at(ang, r));
    if (k < n - 1) { const nn = at(ang + spread / (n - 1) * 0.5, r * 0.84); pts.push(nn); notches.push([nn, ang]); }
  }
  pts.push(at(a + spread * 1.2, len * 0.22));
  T.poly(pts, Rm[3]);
  fillGaps(T, Rm[3]);
  cyl(T, Rm, { wide: len > 18 });
  // coverts: a lighter band along the leading edge
  const cv = blank(L);
  cv.poly([S, at(a - 0.1 * sg, len * 0.46), at(a + spread * 0.3, len * 0.5), at(a + spread * 0.8, len * 0.3)], Rm[4]);
  for (let i = 3; i < cv.d.length; i += 4) if (cv.d[i] && !T.d[i]) cv.d[i] = 0;
  // feather separation lines
  for (const [q, ang] of notches) T.line(q[0], q[1], q[0] - Math.cos(ang) * len * 0.22, q[1] - Math.sin(ang) * len * 0.22, Rm[1]);
  put(T, cv, false);
  // chevron bars in rows across the fan
  if (o.bar) {
    const bc = C(o.bar);
    for (const rf of [0.42, 0.6, 0.78]) for (let k = 0; k <= 10; k++) {
      const ang = a + spread * (k / 10), q = at(ang, len * rf * lerp(1, 0.6, k / 10));
      if ((k + R(rf * 10)) % 2) continue;
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 1], [2, 1]]) if (T.a(R(q[0]) + dx, R(q[1]) + dy) > 100) T.set(R(q[0]) + dx, R(q[1]) + dy, bc);
    }
  }
  return put(L, T, o.contour ?? true);
}
// a point on a body tilted by pitch (radians) about (cx, cy); dx, dy in pixels
const lerpP = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const tilt = (cx, cy, a) => (dx, dy) => [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)];
// snap a layer's top edge to a colour (rime frosting on fur, snow on ledges)
function frostTop(L, c, n = 1, x0 = 0, x1 = L.w - 1, seed = 1) {
  const cc = C(c);
  for (let x = Math.max(0, R(x0)); x <= Math.min(L.w - 1, R(x1)); x++) {
    let y = -1;
    for (let yy = 0; yy < L.h; yy++) if (L.a(x, yy) > 100) { y = yy; break; }
    if (y < 0) continue;
    const m = n + (hash2(x >> 1, 3, seed) > 0.6 ? 1 : 0);
    for (let k = 0; k < m; k++) if (L.a(x, y + k) > 100) L.set(x, y + k, cc);
  }
  return L;
}

// enemy id -> { design, name }: folded into src/data/enemies.js at integration
export const assign = {
  frost_wolf: { design: 'aurora_fox', name: 'Aurora Fox' },
  ice_wraith: { design: 'rime_banshee', name: 'Rime Banshee' },
  frost_troll: { design: 'snowdrift_troll', name: 'Snowdrift Troll' },
  frozen_knight: { design: 'encased_knight', name: 'Encased Knight' },
  snow_harpy: { design: 'strix', name: 'Strix' },
  ice_golem: { design: 'glacier_golem', name: 'Glacier Golem' },
  crystal_spider: { design: 'geode_spider', name: 'Geode Spider' },
  mine_horror: { design: 'mine_horror', name: 'The Mine Horror' },
};

export default {
  // Aurora Fox (frost_wolf): the Finnish fire-fox, revontulet. A lean russet fox with rime-frosted
  // guard hairs whose great brush of a tail turns, half way along, into the northern lights; the
  // aurora streams behind it when it runs and flares up when it is about to pounce.
  aurora_fox: {
    view: 'side', box: [44, 34], pivot: 0.58, idle: 4, run: 4, idleFps: 4,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const fur = cols('#4a1420', '#7a2f2c', '#a8483a', '#cf6a3e', '#ec9a5a'), furD = fur.map((c) => dark(c, 0.8));
      const bib = cols('#8a7a96', '#b8a8b0', '#e2d2c0', '#f3e1b5', '#fff4dc');
      const sock = cols('#140f1c', '#1d0814', '#2a1420', '#3e1c2c', '#55323d'), sockD = sock.map((c) => dark(c, 0.85));
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle', wind = P.atk === 1, strike = P.atk === 2, hurt = P.hurt;
      // body pose
      let bx = ox, by = oy - 9 * u, pitch = 0;
      if (idle) by += sin(t) * 0.35 * u;
      if (run) { by += (-Math.abs(sin(t)) * 1.4 + 0.5) * u; pitch = -sin(t) * 0.1; }
      if (wind) { by += 2.2 * u; bx -= 1.5 * u; pitch = 0.1; }
      if (strike) { bx += 3 * u; by -= 0.8 * u; pitch = -0.06; }
      if (hurt) { bx -= 1.6 * u; by -= 0.3 * u; pitch = -0.16; }
      const B = tilt(bx, by, pitch);
      const U = (dx, dy) => B(dx * u, dy * u);
      const L = layer(F);
      // ---- tail: a fur brush that bursts into aurora. Root on the rump, path by pose
      const root = U(-6.6, -1.6);
      const T = (dx, dy) => [root[0] + dx * u, root[1] + dy * u];
      let tp;
      if (run) { const w = sin(t) * 1.4; tp = [root, T(-6, -1.5 + w), T(-13, -3.5 - w), T(-22, -6 + w)]; }
      else if (wind) tp = [root, T(-4, -3), T(-5, -13), T(0.5, -21)];
      else if (strike) tp = [root, T(-6, 0.5), T(-13, -1), T(-21, -3)];
      else if (hurt) tp = [root, T(-4, 1), T(-7, 2), T(-11, -1)];
      else { const w = sin(t) * 0.8; tp = [root, T(-6, 0.5), T(-10 + w, -9), T(-5 + w * 1.5, -19)]; }
      const tpath = bez(tp, 28);
      // aurora: three curtains, offset in phase so the tip splits into streamers
      const aw = (wind ? 1.3 : hurt ? 0.55 : 1) * u, spd = run ? 1 : 0.5, dim = hurt ? 0.3 : 0;
      const fade = hurt ? 0.45 : wind ? 0.82 : 0.74;
      ribbon(F, tpath, (s) => (1.3 + 2.6 * Math.sin(Math.min(1, s * 1.15) * Math.PI * 0.7)) * aw, AUR.slice(0, 7), { from: 0.3, phase: t * spd, amp: 1.4 * u, freq: 1.2, fade, solid: true, ray: R(t * 6), alpha: 170, dim });
      ribbon(F, tpath, (s) => (0.7 + 1.1 * Math.sin(Math.min(1, s * 1.1) * Math.PI)) * aw, AUR.slice(2), { from: 0.48, phase: t * spd + 0.33, amp: 1.8 * u, freq: 1.6, off: 5 * aw, fade: fade + 0.08, solid: true, ray: R(t * 6) + 1, alpha: 200, dim });
      ribbon(F, tpath, (s) => (0.6 + 0.9 * Math.sin(Math.min(1, s * 1.1) * Math.PI)) * aw, AUR.slice(3), { from: 0.55, phase: t * spd + 0.66, amp: 1.6 * u, freq: 1.9, off: -4.4 * aw, fade: fade + 0.1, solid: true, ray: R(t * 6) + 2, alpha: 210, dim });
      // the fur brush itself, thick in the middle, its tip paling to cream before it burns into light
      const TL = layer(F);
      const brush = tpath.slice(0, 15);
      tube(TL, brush, (s) => (1.3 + 2.2 * Math.sin(Math.min(1, s * 1.05) * Math.PI * 0.9)) * u, fur, { fur: 5 });
      const [qx, qy] = brush[brush.length - 1];
      for (let y = 0; y < TL.h; y++) for (let x = 0; x < TL.w; x++) {
        if (!TL.a(x, y)) continue;
        const d = Math.hypot(x + 0.5 - qx, y + 0.5 - qy);
        if (d < 3 * u) TL.set(x, y, d < 1.6 * u ? bib[4] : x + y < qx + qy ? bib[3] : bib[2]);
      }
      put(L, TL, false);
      // ---- legs: coat-coloured upper legs, dark stockings
      const legs = (far) => {
        const Lg = layer(F), Rm = far ? sockD : sock, Fm = far ? furD : fur;
        const fh = U(4.2 + (far ? 1 : 0), 1), bh = U(-4.6 + (far ? 1 : 0), 0.8);
        let ff, bf;
        if (run) {
          const a = stride(t + (far ? 0.12 : 0), 8 * u, 2.6 * u), b = stride(t + 0.5 + (far ? 0.12 : 0), 8 * u, 2.6 * u);
          ff = [fh[0] + a[0] + 1 * u, oy - a[1]]; bf = [bh[0] + b[0] - 0.5 * u, oy - b[1]];
        } else if (strike) { ff = [fh[0] + 5.5 * u, fh[1] + 4 * u - (far ? 0.6 * u : 0)]; bf = [bh[0] - 4.5 * u, oy]; }
        else if (wind) { ff = [fh[0] + 1.4 * u, oy]; bf = [bh[0] + 0.6 * u, oy]; }
        else { ff = [fh[0] + 0.6 * u - (far ? 1.2 * u : 0), oy]; bf = [bh[0] - 0.2 * u + (far ? 0.8 * u : 0), oy]; }
        const fk = ik(fh, ff, 4.3 * u, 4.6 * u, -1), bk = ik(bh, bf, 4.2 * u, 5 * u, 1);
        tube(Lg, [fh, fk], [1.5 * u, 0.9 * u], Fm, { fur: 3 });
        tube(Lg, [bh, bk], [1.9 * u, 0.9 * u], Fm, { fur: 3 });
        const S2 = layer(F);
        tube(S2, [lerpP(fh, fk, 0.7), fk, ff], [0.85 * u, 0.6 * u], Rm);
        tube(S2, [lerpP(bh, bk, 0.75), bk, bf], [0.85 * u, 0.6 * u], Rm);
        blob(S2, [[ff[0] + 0.5 * u, ff[1] - 0.5 * u, 1.1 * u, 0.65 * u], [bf[0] + 0.5 * u, bf[1] - 0.5 * u, 1.1 * u, 0.65 * u]], Rm);
        put(Lg, S2, true);
        put(L, Lg, far);
      };
      legs(true);
      // ---- body: deep chest, tucked waist, haunch; cream belly; rime along the back
      let hx, hy, jaw = 0;
      if (strike) { [hx, hy] = U(10, -2.4); jaw = 1; }
      else if (wind) { [hx, hy] = U(8.4, -2); }
      else if (hurt) { [hx, hy] = U(7.4, -6.4); }
      else if (run) { [hx, hy] = U(9, -4.4 + sin(t) * 0.4); }
      else { [hx, hy] = U(8.2, -5.2); }
      const Bd = layer(F);
      tube(Bd, [U(4.2, -1.2), [hx - 1 * u, hy + 0.6 * u]], [3 * u, 2.3 * u], fur, { fur: 9 });
      const c1 = U(3.6, -0.6), c2 = U(-0.4, 0.2), c3 = U(-4.6, -0.4);
      blob(Bd, [[c1[0], c1[1], 4.2 * u, 3.6 * u], [c2[0], c2[1], 4.8 * u, 2.6 * u], [c3[0], c3[1], 3.5 * u, 3.2 * u]], fur, { fur: 7 });
      underside(Bd, [bib[2], bib[3]], c2[0] - 3 * u, c1[0] + 3 * u);
      frostTop(Bd, '#f3e1b5', 1, c3[0] - 2 * u, c1[0] + 1 * u, 2);
      put(L, Bd, true);
      legs(false);
      // ---- head (drawn half again as big: chunky proportions)
      const Hd = layer(F);
      const v = u * 1.3;
      const flick = idle && P.i === 2 ? 1 : 0, flat = hurt ? 1 : wind ? 0.45 : 0;
      const ear = (Ld, bx0, tipx, tipy, Rm) => {
        slab(Ld, [[bx0 - 1.3 * v, hy - 1 * v], [bx0 + 1.3 * v, hy - 1.5 * v], [tipx, tipy]], Rm);
        Ld.poly([[bx0 - 0.5 * v, hy - 1.5 * v], [bx0 + 0.7 * v, hy - 1.7 * v], [lerp(bx0, tipx, 0.66), lerp(hy - 1.6 * v, tipy, 0.66)]], bib[2]);
        Ld.poly([[lerp(bx0 - 1.3 * v, tipx, 0.6), lerp(hy - 1 * v, tipy, 0.6)], [lerp(bx0 + 1.3 * v, tipx, 0.6), lerp(hy - 1.5 * v, tipy, 0.6)], [tipx, tipy]], sock[1]);
      };
      ear(Hd, hx - 1.4 * v, hx - 2.4 * v - flat * 3 * v, hy - 5.2 * v + flat * 3 * v, furD);
      // skull + cheek ruff that flares out behind the jaw
      blob(Hd, [[hx, hy, 2.5 * v, 2.2 * v], [hx - 1 * v, hy + 1.3 * v, 2 * v, 1.4 * v]], fur, { fur: 11 });
      Hd.poly([[hx - 2.6 * v, hy + 0.2 * v], [hx - 3.6 * v, hy + 2.2 * v], [hx - 1.6 * v, hy + 1.6 * v], [hx - 2.4 * v, hy + 2.9 * v], [hx - 0.2 * v, hy + 2.2 * v]], bib[3]);
      const sn = jaw ? 0.5 * v : 0;
      // long tapering snout
      slab(Hd, [[hx + 0.8 * v, hy - 1.5 * v], [hx + 4.8 * v, hy - 0.1 * v - sn], [hx + 4.6 * v, hy + 0.7 * v - sn], [hx + 1 * v, hy + 1.1 * v]], fur);
      const jy = hy + 0.9 * v, ja = jaw ? 0.6 : wind ? 0.12 : 0;
      const jt = [hx + 0.8 * v + Math.cos(ja) * 3.6 * v, jy + Math.sin(ja) * 3.6 * v];
      if (jaw) {
        Hd.poly([[hx + 0.8 * v, hy + 0.1 * v], [hx + 4.6 * v, hy + 0.7 * v - sn], jt, [hx + 0.8 * v, jy + 1 * v]], MAW_D);
        Hd.poly([[hx + 1.4 * v, jy + 0.4 * v], [jt[0] - 0.6 * v, jt[1] - 0.4 * v], [hx + 2 * v, jy + 0.9 * v]], TONGUE);
        teeth(Hd, [hx + 2.2 * v, hy + 0.5 * v - sn * 0.5], [hx + 4.4 * v, hy + 0.7 * v - sn], 2, 1 * v, 1);
      }
      slab(Hd, [[hx + 0.6 * v, jy - 0.2 * v], jt, [jt[0] - 0.4 * v, jt[1] + 0.7 * v], [hx + 0.4 * v, jy + 1.1 * v]], bib);
      if (jaw) teeth(Hd, [hx + 1.8 * v, jy + 0.5 * v], [jt[0] - 0.6 * v, jt[1] - 0.2 * v], 2, 0.8 * v, -1);
      // cream cheek patch under the eye line
      Hd.poly([[hx - 0.6 * v, hy + 0.5 * v], [hx + 3.6 * v, hy + 0.5 * v - sn * 0.4], [hx + 4.3 * v, hy + 0.7 * v - sn], [hx + 0.6 * v, hy + 1.3 * v], [hx - 1.2 * v, hy + 1.8 * v]], bib[3]);
      Hd.line(hx - 0.4 * v, hy + 0.5 * v, hx + 3.4 * v, hy + 0.5 * v - sn * 0.4, bib[4]);
      // nose
      Hd.rect(R(hx + 4.4 * v), R(hy - 0.3 * v - sn), Math.max(1, R(0.9 * v)), Math.max(1, R(0.8 * v)), sock[0]);
      // near ear over the skull
      ear(Hd, hx + 0.5 * v, hx + 0.4 * v - flat * 3.4 * v + flick * 1.2 * v, hy - 5.6 * v + flat * 3.4 * v + flick * 0.5 * v, fur);
      put(L, Hd, true);
      put(F.p, L, false);
      // eye: a narrow sly slit of aurora green under a dark brow, squeezed shut when hurt
      const ex = hx + 0.9 * v, ey = hy - 0.8 * v;
      if (hurt || (idle && P.i === 3)) { F.p.line(ex - 0.2 * v, ey + 0.2 * v, ex + 1.6 * v, ey + 0.6 * v, sock[0]); if (hurt) F.p.line(ex - 0.2 * v, ey + 1 * v, ex + 1.4 * v, ey + 0.6 * v, sock[0]); }
      else {
        eyeGlow(F, ex, ey, Math.max(2, 1.7 * v), Math.max(1, 0.8 * v), wind || strike ? '#f5afd6' : '#8ae8b8');
        F.p.line(ex - 0.5 * v, ey - 0.5 * v, ex + 1.9 * v, ey - (wind || strike ? -0.1 : 0.9) * v, sock[0]);
      }
      // a smirk at the back of the mouth
      if (!jaw) F.p.line(hx + 1.2 * v, hy + 1.1 * v, hx + 2.4 * v, hy + 0.85 * v, sock[2]);
      F.mouth = [hx + 4.8 * v, hy + 0.5 * v];
    },
  },
  // Rime Banshee (ice_wraith): the bean sídhe of the high passes. A bridal veil frozen stiff
  // mid-billow, its hem grown into icicles, a crooked crown of icicles on the hood. There is no
  // face under it, only a smooth snow mask split by one crack of blue light, and the crack is
  // what screams: it tears open into a jagged mouth when she wails.
  rime_banshee: {
    view: 'front', box: [34, 34], pivot: 0.5, idle: 4, run: 4, idleFps: 4, hover: true, fall: false, scale: 0.8,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const veil = SNOW, inner = cols('#1d0814', '#2e1f45', '#4a3266', '#6a5a8a', '#8a7aa8'), bone = cols('#3e4a5a', '#6e7a9a', '#96a2bc', '#c4cce0', '#eef0f6');
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle', wind = P.atk === 1, strike = P.atk === 2, hurt = P.hurt;
      const cx = ox + (hurt ? -1 * u : 0), sway = (idle || run ? sin(t) : 0) * 0.6 * u;
      const hy = oy - 25 * u + (idle ? sin(t) * 0.5 * u : 0) + (wind ? -1.2 * u : strike ? 0.6 * u : hurt ? 0.8 * u : 0);
      const lean = run ? 2.6 * u : strike ? -0.6 * u : 0;
      // ---- blowing snow under the hem (glow only, translucent)
      for (let k = 0; k < 16; k++) {
        const a = (k / 16 + t * 0.5) * TAU, rr = (2 + (k % 4) * 2) * u;
        const x = R(cx + Math.cos(a) * rr - lean * 0.6), y = R(oy - 1 * u + Math.sin(a) * rr * 0.3 - (k % 3) * 1.2 * u);
        F.e.set(x, y, [232, 240, 250, 150]); if (k % 3 === 0) F.e.set(x + 1, y, [232, 240, 250, 110]);
      }
      const L = layer(F);
      // ---- the veil: the dark inside first, then the frozen outer cloth, hem frozen into points
      const top = hy - 2 * u, hem = oy - 3 * u, wB = (wind ? 22 : strike ? 21 : run ? 17 : 18) * u;
      drape(L, cx + sway * 0.3, top + 4 * u, 8 * u, wB * 0.9, hem - top - 2 * u, inner, { teeth: 7, wave: 1.4 * u, phase: t + 0.5, lean: lean * 0.9, folds: 3, ragged: true, seed: 3 });
      const Vl = layer(F);
      drape(Vl, cx + sway * 0.5, top, 5 * u, wB, hem - top - 1 * u, veil, { teeth: 5, wave: 2.2 * u, phase: t, lean: lean, folds: 4, trim: '#f6f2ea', ragged: true, seed: 9 });
      // split the veil up the middle so the dark inside shows between the two falls
      for (let y = R(hem - 9 * u); y <= hem + 3 * u; y++) {
        const f = (y - (hem - 9 * u)) / (12 * u), half = f * 3.2 * u, mxx = cx - lean * 0.6 * f + sway * 0.4;
        for (let x = R(mxx - half); x <= mxx + half; x++) Vl.clear(x, y);
      }
      put(L, Vl, true);
      // icicles hanging from the hem points
      const Ic = layer(F);
      for (let k = 0; k < 6; k++) {
        const f = (k + 0.5) / 6, x = cx - lean + (f - 0.5) * wB * 0.88 + sway * 0.4;
        if (Math.abs(f - 0.5) < 0.12) continue;
        const y = hem - 0.4 * u + Math.sin((f * 5 + t) * TAU) * 1.4 * u;
        icicle(Ic, x, y, (2.4 + ((k * 7) % 5) * 0.8) * u * (hurt ? 0.6 : 1), 0.8 * u);
      }
      put(L, Ic, false);
      // ---- arms: thin, with bell sleeves that hang in tatters; hands of bone with icicle fingers
      let wr, fa, fl;
      if (wind) { wr = [9, -6]; fa = -1.3; fl = 7; }
      else if (strike) { wr = [12.5, 2]; fa = -0.15; fl = 8; }
      else if (hurt) { wr = [3.6, 1.6]; fa = -1.9; fl = 4; }
      else if (run) { wr = [9.5, 8.5 + sin(t) * 0.6]; fa = 1.3; fl = 6; }
      else { wr = [9.6 + sin(t + 0.25) * 0.5, 9 + sin(t) * 0.8]; fa = 1.25; fl = 6.5; }
      const arm = (side) => {
        const A = layer(F), sh = [cx + side * 3.2 * u + sway * 0.4, hy + 4.8 * u], w = [cx + side * wr[0] * u - lean * 0.4, hy + wr[1] * u];
        const el = ik(sh, w, 5.4 * u, 6 * u, side > 0 ? -1 : 1);
        // sleeve: a long tattered bell hanging from the forearm
        const dn = wind ? 0.6 : 1, sl = [lerp(el[0], w[0], 0.1), lerp(el[1], w[1], 0.1)];
        A.poly([sl, [w[0] + side * 0.6 * u, w[1] - 0.8 * u], [w[0] + side * 1.6 * u, w[1] + 4.2 * u * dn], [w[0] - side * 0.2 * u, w[1] + 2.4 * u * dn], [w[0] - side * 1.6 * u, w[1] + 4.6 * u * dn], [lerp(el[0], w[0], 0.5) - side * 1.2 * u, lerp(el[1], w[1], 0.5) + 2.2 * u * dn]], veil[3]);
        cyl(A, veil);
        tube(A, [sh, el, w], (q) => (1.3 + q * 0.4) * u, veil, { tex: 4 });
        blob(A, [[w[0], w[1] + 0.4 * u, 1 * u, 0.9 * u]], bone);
        for (let k = 0; k < 4; k++) {
          const aa = (side > 0 ? fa : Math.PI - fa) + (k - 1.5) * 0.26 * side, len = fl * u * (k === 1 || k === 2 ? 1 : 0.75);
          shard(A, w[0] + Math.cos(aa) * 0.6 * u, w[1] + 0.4 * u + Math.sin(aa) * 0.6 * u, aa, len, 0.5 * u, ICE);
        }
        put(L, A, true);
      };
      arm(-1); arm(1);
      // ---- hood: a pointed peak of frozen cloth framing a dark opening
      const H = layer(F);
      blob(H, [[cx + sway * 0.2, hy, 4.4 * u, 5 * u], [cx + sway * 0.2, hy - 3.6 * u, 2.6 * u, 3.2 * u]], veil, { tex: 6 });
      H.ellipse(cx + sway * 0.2, hy + 0.9 * u, 3 * u, 3.9 * u, VOID);
      put(L, H, true);
      // ---- crooked icicle crown (one spike snapped short)
      const Cr = layer(F);
      for (const [aa, len] of [[-0.95, 3.2], [-0.5, 5], [-0.08, 7.2], [0.36, 4.6], [0.78, 1.8]]) {
        const a = -Math.PI / 2 + aa, bx0 = cx + sway * 0.2 + Math.cos(a) * 3.4 * u, by0 = hy - 3.4 * u + Math.sin(a) * 2.6 * u;
        shard(Cr, bx0, by0, a + aa * 0.25, len * u * (wind ? 1.15 : 1), 0.85 * u, ICE);
      }
      put(L, Cr, true);
      // ---- the mask: smooth snow, tilted, no features
      const Mk = layer(F), mx = cx + sway * 0.2 + 0.2 * u, my = hy + 1.2 * u;
      blob(Mk, [[mx, my, 2.3 * u, 3.3 * u]], cols('#6e7a9a', '#b2b4d4', '#dcdcec', '#f2f0f0', '#fff8ec'));
      if (hurt) for (let y = R(my - 3.4 * u); y <= my; y++) for (let x = R(mx); x <= mx + 2.6 * u; x++) if ((x - mx) > (y - my + 3.4 * u) * 0.55 + 0.3 * u) Mk.clear(x, y);
      put(L, Mk, true);
      put(F.p, L, false);
      // the crack: a jagged seam of blue light that is her eyes and mouth at once
      const cy0 = my - 3.1 * u, cy1 = my + 3.2 * u;
      const zig = [[mx + 0.4 * u, cy0], [mx - 0.4 * u, my - 1.4 * u], [mx + 0.5 * u, my - 0.2 * u], [mx - 0.3 * u, my + 1 * u], [mx + 0.4 * u, my + 2.2 * u], [mx - 0.1 * u, cy1]];
      const lc = C('#3e6aa8'), mc = C('#6aa0d0'), pc = C('#a8d0ec'), hc = C('#e6f4fc');
      const both = (fn) => { fn(F.p); fn(F.e); };
      if (strike || wind) {
        const wd = (strike ? 2 : 1) * u;
        const side = (k) => zig.map(([x, y], i) => [x + k * wd * Math.sin((i / (zig.length - 1)) * Math.PI) * (i % 2 ? (k > 0 ? 0.7 : 1.4) : (k > 0 ? 1.4 : 0.7)), y]);
        const l1 = side(-1), r1 = side(1).reverse(), l2 = side(-0.5), r2 = side(0.5).reverse();
        both((Ld) => { Ld.poly([...l1, ...r1], mc); Ld.poly([...l2, ...r2], pc); for (let i = 1; i < zig.length; i++) Ld.line(zig[i - 1][0], zig[i - 1][1], zig[i][0], zig[i][1], hc); });
        if (strike) for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + 0.3, d = (4.2 + (k % 2) * 1.6) * u; shard(F.p, mx + Math.cos(a) * d, my + 0.6 * u + Math.sin(a) * d * 0.8, a, 2 * u, 0.6 * u, ICE); }
      } else {
        const core = idle && P.i === 1 ? hc : pc;
        both((Ld) => {
          for (let i = 1; i < zig.length; i++) Ld.line(zig[i - 1][0], zig[i - 1][1], zig[i][0], zig[i][1], i === 1 || i === zig.length - 1 ? mc : core);
          // hairline branches where eyes would be, weeping down the cheeks
          Ld.line(mx - 0.4 * u, my - 1.4 * u, mx - 1.8 * u, my - 1.1 * u, mc); Ld.line(mx - 1.8 * u, my - 1.1 * u, mx - 1.9 * u, my + 0.4 * u, lc);
          Ld.line(mx + 0.5 * u, my - 0.2 * u, mx + 1.7 * u, my - 0.9 * u, mc);
        });
      }
      if (hurt) both((Ld) => Ld.line(mx + 0.3 * u, my - 0.4 * u, mx + 1.6 * u, my - 2.6 * u, hc));
      F.mouth = [mx, my + 1 * u];
    },
  },
  // Snowdrift Troll (frost_troll): the mountain troll who sleeps so long the snow piles on him.
  // His hunched back is a drift with a cornice that overhangs his face like a hood, icicles
  // dripping from its lip. One great tusk curls up past his nose (the other snapped off long ago),
  // and his club is a whole frozen pine, swung root-ball first.
  snowdrift_troll: {
    view: 'side', box: [46, 40], pivot: 0.4, idle: 4, run: 4, idleFps: 2.5, scale: 0.72,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const skin = cols('#2a2a40', '#3e4a5a', '#5a6788', '#7c8aa8', '#a0aec4'), skinD = skin.map((c) => dark(c, 0.8));
      const fur = cols('#2a1420', '#3e1c2c', '#55323d', '#6e5060', '#8a6a78');
      const tusk = cols('#6a5a5a', '#a08a78', '#cfa978', '#f3e1b5', '#fff4dc');
      const wood = cols('#2a1a1c', '#3f2622', '#5a3628', '#77492f', '#94603c'), root = cols('#1d0814', '#2a1a1c', '#3f2622', '#55323d', '#674952');
      const nose = cols('#3e2a40', '#55405a', '#7a6080', '#9a7f9e', '#b8a0b8');
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle', wind = P.atk === 1, strike = P.atk === 2, hurt = P.hurt;
      let bx = ox, by = oy - 13 * u, lean = 0;
      if (idle) by += sin(t) * 0.4 * u;
      if (run) { by += -Math.abs(sin(t)) * 0.8 * u; lean = 0.08; }
      if (wind) { bx -= 1.5 * u; by -= 0.8 * u; lean = -0.16; }
      if (strike) { bx += 2 * u; by += 1.4 * u; lean = 0.3; }
      if (hurt) { bx -= 1.5 * u; lean = -0.2; }
      const B = tilt(bx, by + 4 * u, lean), U = (dx, dy) => B(dx * u, (dy - 4) * u);
      const L = layer(F);
      // ---- club: the hand grips the thin end, the root ball rests on the snow or swings
      const clen = 12 * u, grounded = (h) => Math.asin(clamp((oy - 3 * u - h[1]) / clen, -1, 1));
      let hand, ang;
      if (wind) { hand = U(1.5, -9.5); ang = -2.3; }
      else if (strike) { hand = U(10.4, 0.6); ang = grounded(hand); }
      else if (hurt) { hand = U(7, 0); ang = 1.1; }
      else if (run) { hand = U(6.5, -2 + sin(t) * 0.3); ang = -2.35 + sin(t) * 0.08; }
      else { hand = U(9.6, 0.2 + sin(t) * 0.2); ang = grounded(hand); }
      const ball = [hand[0] + Math.cos(ang) * clen, hand[1] + Math.sin(ang) * clen];
      const club = (Ld) => {
        const Cl = layer(F);
        const butt = [hand[0] - Math.cos(ang) * 1.6 * u, hand[1] - Math.sin(ang) * 1.6 * u];
        tube(Cl, [butt, ball], [1.2 * u, 2.1 * u], wood, { tex: 3 });
        for (const f of [0.38, 0.62]) {
          const q = [lerp(butt[0], ball[0], f), lerp(butt[1], ball[1], f)], sg = f < 0.5 ? -1 : 1;
          horn(Cl, q, [q[0] + Math.cos(ang + sg * 0.9) * 1.2 * u, q[1] + Math.sin(ang + sg * 0.9) * 1.2 * u], [q[0] + Math.cos(ang + sg * 0.7) * 2.6 * u, q[1] + Math.sin(ang + sg * 0.7) * 2.6 * u], 1.1 * u, wood);
        }
        for (let k = 0; k < 7; k++) {
          const a = ang + (k - 3) * 0.5, l = (3.6 + (k % 3) * 1.4) * u;
          const r0 = [ball[0] + Math.cos(a) * 1.6 * u, ball[1] + Math.sin(a) * 1.6 * u];
          horn(Cl, r0, [r0[0] + Math.cos(a + 0.4) * l * 0.5, r0[1] + Math.sin(a + 0.4) * l * 0.5], [r0[0] + Math.cos(a - 0.2) * l, r0[1] + Math.sin(a - 0.2) * l], 1.1 * u, root);
        }
        blob(Cl, [[ball[0], ball[1], 3.6 * u, 3.2 * u], [ball[0] + Math.cos(ang) * 1.4 * u, ball[1] + Math.sin(ang) * 1.4 * u, 2.6 * u, 2.6 * u]], root, { tex: 5 });
        spots(Cl, ball[0], ball[1], 2.6 * u, 2.4 * u, 4, 0.9 * u, '#827d82', 4);
        spots(Cl, ball[0] - 0.6 * u, ball[1] - 0.6 * u, 2 * u, 1.6 * u, 3, 0.6 * u, '#a29c9c', 5);
        frostTop(Cl, '#a8d0ec', 1, Math.min(butt[0], ball[0]) - 5 * u, Math.max(butt[0], ball[0]) + 5 * u, 3);
        put(Ld, Cl, true);
      };
      const legs = (far) => {
        const Lg = layer(F), Rm = far ? skinD : skin;
        const hip = U(far ? 0.6 : -1.6, 3.6);
        let foot;
        if (run) { const [dx, lift] = stride(t + (far ? 0.5 : 0), 6 * u, 2 * u); foot = [hip[0] + dx + 0.5 * u, oy - lift]; }
        else if (strike) foot = [hip[0] + (far ? 3.5 : -2.5) * u, oy];
        else if (wind) foot = [hip[0] + (far ? 2 : -1.5) * u, oy];
        else foot = [hip[0] + (far ? 1.6 : -0.8) * u, oy];
        limb(Lg, hip, [foot[0], foot[1] - 1 * u], 4.6 * u, 4.4 * u, 2.6 * u, 2.2 * u, 1.9 * u, Rm, -1, { tex: 2 });
        blob(Lg, [[foot[0] + 0.8 * u, foot[1] - 1 * u, 2.6 * u, 1.3 * u]], Rm);
        for (let k = 0; k < 3; k++) Lg.set(R(foot[0] + (2 + k * 0.9) * u), R(foot[1] - 0.4 * u), tusk[2]);
        put(L, Lg, !far);
      };
      const farArm = () => {
        const A = layer(F), sh = U(1.5, -5.5), hd = wind ? U(-0.5, -10) : strike ? U(8.5, -1.5) : U(3.5, 2 + (run ? -sin(t) * 0.8 : 0));
        limb(A, sh, hd, 5 * u, 5 * u, 2.2 * u, 2.4 * u, 2 * u, skinD, 1, { tex: 6 });
        blob(A, [[hd[0], hd[1], 1.9 * u, 1.7 * u]], skinD);
        put(L, A, true);
      };
      if (!wind) farArm();
      legs(true);
      // ---- body: pot belly, barrel chest, a huge hunched back under a shaggy mantle
      const Bd = layer(F);
      blob(Bd, [[...U(1.2, 1.5), 5 * u, 4.6 * u], [...U(3, -3.2), 5.2 * u, 4.6 * u], [...U(-1.2, -6.2), 6.4 * u, 5.8 * u]], skin, { tex: 7 });
      for (const k of [0, 1]) { const q = U(3.6 + k * 0.4, 1 + k * 1.8); Bd.line(q[0] - 2 * u, q[1], q[0] + 1.2 * u, q[1] + 0.4 * u, skin[1]); }
      const Fm = layer(F);
      blob(Fm, [[...U(-1.4, -7.6), 7 * u, 5.2 * u], [...U(3.2, -6.4), 3.6 * u, 3.2 * u]], fur, { fur: 4 });
      for (let k = 0; k < 9; k++) { const q = U(-7 + k * 1.35, -3.8 + Math.abs(k - 5) * 0.2); Fm.poly([[q[0] - 0.8 * u, q[1] - 1 * u], [q[0] + 0.8 * u, q[1] - 1 * u], [q[0] + 0.1 * u, q[1] + (1.6 + (k % 3) * 0.8) * u]], k % 2 ? fur[2] : fur[1]); }
      put(Bd, Fm, true);
      put(L, Bd, true);
      // ---- the snowdrift: piled on the hump, a cornice hanging out over the brow
      const Sn = layer(F), sw = idle ? sin(t) * 0.3 * u : run ? sin(t) * 0.4 * u : 0;
      blob(Sn, [[...U(-1.8, -10.8), 6.6 * u, 3.4 * u], [...U(2.4, -10.2), 4.6 * u, 2.6 * u], [...U(6.2, -9.2), 3.6 * u, 1.6 * u], [...U(-5.8, -9.2), 2.8 * u, 2.4 * u]], SNOW, { tex: 2 });
      const sp = U(-3.4, -13.2);
      Sn.poly([[sp[0] - 1.3 * u, sp[1] + 0.6 * u], [sp[0] + 1.3 * u, sp[1] + 0.6 * u], [sp[0] + sw, sp[1] - 3.4 * u]], C('#33502c'));
      Sn.poly([[sp[0] - 0.8 * u, sp[1] - 0.8 * u], [sp[0] + 0.8 * u, sp[1] - 0.8 * u], [sp[0] + sw, sp[1] - 3.4 * u]], C('#4a6e36'));
      Sn.set(R(sp[0] - 0.6 * u), R(sp[1] - 0.6 * u), SNOW[4]);
      put(L, Sn, true);
      // ---- head: thrust out under the cornice: heavy brow, bulb nose, underbite, one great tusk
      const [hx, hy0] = U(8.4, -6.6), hy = hy0 + (hurt ? -1 * u : 0);
      const Hd = layer(F);
      // pointed ear
      Hd.poly([[hx - 2.4 * u, hy - 0.6 * u], [hx - 1.2 * u, hy + 0.6 * u], [hx - 4.4 * u, hy - 1.8 * u + (P.i === 2 && idle ? 0.6 * u : 0)]], skin[2]);
      blob(Hd, [[hx, hy, 3.1 * u, 2.8 * u], [hx + 1.3 * u, hy + 2.3 * u, 3.1 * u, 1.8 * u]], skin, { tex: 8 });
      const jo = strike ? 1.2 * u : wind ? 0.6 * u : hurt ? 0.5 * u : 0;
      if (jo) Hd.ellipse(hx + 2.4 * u, hy + 2.5 * u, 1.8 * u, jo, MAW_D);
      // lower lip line of the underbite, little stubby teeth
      Hd.line(hx + 0.4 * u, hy + 2.2 * u + jo, hx + 4 * u, hy + 1.8 * u + jo, skin[1]);
      teeth(Hd, [hx + 1.2 * u, hy + 2.1 * u + jo], [hx + 3.4 * u, hy + 1.9 * u + jo], 3, 0.8 * u, -1, '#e2d2c0');
      blob(Hd, [[hx + 3.3 * u, hy + 0.4 * u, 2 * u, 1.8 * u]], nose);
      horn(Hd, [hx + 2 * u, hy + 2.6 * u + jo], [hx + 2.2 * u, hy + 1.8 * u], [hx + 2.4 * u, hy + 1.3 * u], 1 * u, tusk.map((c) => dark(c, 0.8)));
      put(L, Hd, true);
      const Tk = layer(F);
      horn(Tk, [hx + 3.8 * u, hy + 2.8 * u + jo], [hx + 6.6 * u, hy + 1.6 * u], [hx + 5.6 * u, hy - 3.8 * u + jo * 0.3], 1.8 * u, tusk);
      put(L, Tk, true);
      // icicles off the cornice lip
      const Ic = layer(F);
      for (let k = 0; k < 3; k++) { const q = U(3.4 + k * 1.5, -8.4 + k * 0.1); icicle(Ic, q[0], q[1], (1.4 + (k % 2) * 1.4) * u * (hurt ? 0.6 : 1), 0.55 * u); }
      put(L, Ic, false);
      // ---- near leg, then club and near arm over everything
      legs(false);
      if (wind) farArm();
      club(L);
      const A = layer(F), sh = U(3.4, -5);
      limb(A, sh, hand, 5 * u, 5.6 * u, 2.6 * u, 2.9 * u, 2.4 * u, skin, 1, { tex: 6 });
      blob(A, [[hand[0], hand[1], 2.3 * u, 2 * u]], skin);
      A.line(hand[0] - 1 * u, hand[1] - 0.6 * u, hand[0] + 0.8 * u, hand[1] - 0.8 * u, skin[1]);
      put(L, A, true);
      put(F.p, L, false);
      // eyes: two tiny cold sparks in the shade of the drift, under a heavy brow
      if (hurt) { F.p.line(hx + 0.4 * u, hy - 1 * u, hx + 2 * u, hy - 0.4 * u, VOID); F.p.line(hx + 0.4 * u, hy - 0.2 * u, hx + 2 * u, hy - 0.6 * u, VOID); }
      else if (idle && P.i === 3) F.p.line(hx + 0.4 * u, hy - 0.6 * u, hx + 2 * u, hy - 0.6 * u, VOID);
      else { eyeGlow(F, hx + 0.7 * u, hy - 1 * u, Math.max(2, R(1.2 * u)), Math.max(1, R(0.8 * u)), '#a8d0ec'); F.p.line(hx - 0.4 * u, hy - 1.8 * u, hx + 2.6 * u, hy - (wind || strike ? 1 : 1.4) * u, skin[0]); }
      // the slam: snow and ice thrown up where the root ball lands
      if (strike) for (let k = 0; k < 7; k++) { const a = -Math.PI / 2 + (k - 3) * 0.4, d = (3.4 + (k % 2) * 2) * u; const x = ball[0] + Math.cos(a) * d, y = oy - 1 * u + Math.sin(a) * d * 0.7; F.p.rect(R(x), R(y), Math.max(1, R(0.9 * u)), Math.max(1, R(0.9 * u)), k % 2 ? SNOW[4] : ICE[3]); }
    },
  },
  // Encased Knight (frozen_knight): a knight of a drowned order who froze in the pass with his
  // shield arm raised. The ice never let go: his left side is sealed in a coffin-shaped block that
  // moves with him and serves as his shield; you can see his own gauntlet inside it. The free arm
  // still swings the greatsword. Crimson tabard, rime plume, a visor that glows like a cold lamp.
  encased_knight: {
    view: 'side', box: [40, 34], pivot: 0.42, idle: 4, run: 4, idleFps: 3,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const steel = cols('#1a1f2c', '#2a3240', '#3e4a5a', '#5a6680', '#8a96b0'), steelD = steel.map((c) => dark(c, 0.8));
      const cloth = cols('#2a0e18', '#4a1420', '#60282c', '#8a3434', '#b04a3e'), clothD = cloth.map((c) => dark(c, 0.82));
      const blade = cols('#3e4a5a', '#6e7a9a', '#96a2bc', '#c4cce0', '#eef0f6');
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle', wind = P.atk === 1, strike = P.atk === 2, hurt = P.hurt;
      let bx = ox, by = oy - 9.5 * u, lean = 0;
      if (idle) by += sin(t) * 0.25 * u;
      if (run) { by -= Math.abs(sin(t)) * 0.7 * u; lean = 0.06; }
      if (wind) { bx -= 1 * u; lean = -0.1; }
      if (strike) { bx += 1.8 * u; by += 0.8 * u; lean = 0.18; }
      if (hurt) { bx -= 1.4 * u; lean = -0.15; }
      const B = tilt(bx, by, lean), U = (dx, dy) => B(dx * u, dy * u);
      const L = layer(F);
      // ---- cape: frozen stiff, swinging only at the ragged hem
      const capeTop = U(-1.8, -7.6);
      drape(L, capeTop[0] - 1 * u, capeTop[1], 3.4 * u, 6.4 * u, 9.6 * u, clothD, { lean: (run ? 3.4 : strike ? 2 : 1.2) * u + sin(t) * 0.3 * u, teeth: 4, wave: 0.8 * u, phase: t, ragged: true, folds: 2, trim: '#a8d0ec', seed: 4 });
      // ---- legs
      const legs = (far) => {
        const Lg = layer(F), Rm = far ? steelD : steel;
        const hip = U(far ? 0.8 : -0.6, 0.4);
        let foot;
        if (run) { const [dx, lift] = stride(t + (far ? 0.5 : 0), 5.4 * u, 1.8 * u); foot = [hip[0] + dx, oy - lift]; }
        else if (strike) foot = [hip[0] + (far ? 3.2 : -2.6) * u, oy];
        else if (wind) foot = [hip[0] + (far ? 2 : -1.6) * u, oy];
        else foot = [hip[0] + (far ? 1.4 : -0.9) * u, oy];
        const knee = limb(Lg, hip, [foot[0], foot[1] - 1 * u], 4.6 * u, 4.4 * u, 1.7 * u, 1.4 * u, 1.3 * u, Rm, -1);
        blob(Lg, [[knee[0] + 0.3 * u, knee[1], 1.4 * u, 1.2 * u]], Rm);
        slab(Lg, [[foot[0] - 1.4 * u, foot[1] - 2 * u], [foot[0] + 1 * u, foot[1] - 2 * u], [foot[0] + 2.8 * u, foot[1] - 0.2 * u], [foot[0] - 1.4 * u, foot[1] - 0.2 * u]], Rm);
        put(L, Lg, !far);
      };
      legs(true);
      // ---- the ice coffin, fused to the far arm, held before him as a shield
      const cg = wind ? U(6.8, -2.6) : strike ? U(8, -1) : hurt ? U(5.8, -0.6) : U(6.4, -1 + (run ? sin(t) * 0.3 : 0));
      const ca = wind ? -0.12 : strike ? 0.1 : hurt ? -0.2 : -0.05;
      const CQ = tilt(cg[0], cg[1], ca), Q = (dx, dy) => CQ(dx * u, dy * u);
      const coffin = [Q(-1.8, -10.8), Q(1.8, -10.8), Q(4.3, -6.2), Q(2.2, 7), Q(-2, 7), Q(-4.3, -6.2)];
      const Ci = layer(F);
      const mid = Q(0, -1.6), inset = coffin.map(([x, y]) => [lerp(x, mid[0], 0.22), lerp(y, mid[1], 0.12)]);
      Ci.poly(coffin, ICE[3]);
      // lid bevel: the lit left rim, the shadowed right rim, the recessed lid between
      facet(Ci, [coffin[0], coffin[1], inset[1], inset[0]], ICE[4]);
      facet(Ci, [coffin[5], coffin[0], inset[0], inset[5]], ICE[4]);
      facet(Ci, [coffin[4], coffin[5], inset[5], inset[4]], mixc(ICE[3], ICE[4], 0.5));
      facet(Ci, [coffin[1], coffin[2], inset[2], inset[1]], ICE[2]);
      facet(Ci, [coffin[2], coffin[3], inset[3], inset[2]], ICE[1]);
      facet(Ci, [coffin[3], coffin[4], inset[4], inset[3]], ICE[1]);
      Ci.poly(inset, mixc(ICE[2], ICE[3], 0.55));
      // the frozen arm inside: vambrace and fist, seen dim through the ice
      const ghost = steel.map((c) => mixc(c, ICE[1], 0.3));
      tube(Ci, [Q(-2.6, -6.4), Q(-0.4, -2.8), Q(1, -5.8)], [1.2 * u, 0.9 * u], ghost);
      blob(Ci, [[...Q(1.1, -6.4), 1.2 * u, 1.1 * u]], ghost);
      for (let k = 0; k < 3; k++) over(Ci, ...Q(0.6 + k * 0.5, -7.2), ghost[1]);
      // a travelling glint and a few trapped bubbles
      const gl = (P.i + (run ? 2 : 0)) % 4;
      for (const k of [0, 2]) { const a2 = Q(-2 + gl * 1.1 + k * 0.4, 5 - k * 0.2), b2 = Q(-0.4 + gl * 1.1 + k * 0.4, -2 - k * 0.2); Ci.line(a2[0], a2[1], b2[0], b2[1], ICE[4]); }
      for (const [dx, dy] of [[-0.6, 2], [0.8, 3.6], [-1.2, 4.6]]) over(Ci, ...Q(dx, dy), ICE[4]);
      if (hurt) crack(Ci, ...Q(0.4, -9), 1.7, 9 * u, ICE[4], 7);
      for (let k = 0; k < 2; k++) icicle(Ci, ...Q(-1 + k * 2, 6.8), (1.2 + k * 0.8) * u, 0.5 * u);
      put(L, Ci, true);
      // ---- torso: breastplate under a crimson tabard, the left shoulder vanishing into the ice
      const Tr = layer(F);
      blob(Tr, [[...U(0.6, -4.6), 3.4 * u, 3.6 * u], [...U(0.2, -0.8), 2.8 * u, 2.4 * u]], steel);
      slab(Tr, [[...U(-1.8, -6.2)], [...U(2.6, -6.2)], [...U(3, 1.8)], [...U(0.6, 2.8)], [...U(-2.2, 1.6)]], cloth, { wide: true });
      // a faded sigil on the tabard: a pale snowflake-star
      const sg = U(0.6, -2.4);
      Tr.line(sg[0] - 1 * u, sg[1], sg[0] + 1 * u, sg[1], cloth[4]); Tr.line(sg[0], sg[1] - 1.2 * u, sg[0], sg[1] + 1.2 * u, cloth[4]);
      Tr.set(R(sg[0]), R(sg[1]), '#f3e1b5');
      // belt
      Tr.line(...U(-2, 0.4), ...U(3, 0.4), steel[0], Math.max(1, R(0.7 * u)));
      put(L, Tr, true);
      // ---- helm: a great helm with a T-visor, crest of frozen plume swept back, one dent
      const hc = U(1, -9.4), Hd = layer(F);
      slab(Hd, [[hc[0] - 2.4 * u, hc[1] - 2.6 * u], [hc[0] + 2.2 * u, hc[1] - 2.8 * u], [hc[0] + 2.8 * u, hc[1] + 0.6 * u], [hc[0] + 2 * u, hc[1] + 2.6 * u], [hc[0] - 2.4 * u, hc[1] + 2.4 * u]], steel, { wide: true });
      Hd.rect(R(hc[0] + 0.4 * u), R(hc[1] - 0.6 * u), Math.max(2, R(2.6 * u)), Math.max(1, R(0.7 * u)), VOID);
      Hd.rect(R(hc[0] + 1.6 * u), R(hc[1] - 0.6 * u), Math.max(1, R(0.6 * u)), Math.max(2, R(2.4 * u)), VOID);
      // breaths: little rivets
      for (let k = 0; k < 3; k++) Hd.set(R(hc[0] + 2.2 * u), R(hc[1] + 0.9 * u + k * 0.6 * u), steel[1]);
      // rime plume: three swept icicles from the crown
      for (let k = 0; k < 3; k++) {
        const r0 = [hc[0] - (0.6 + k * 1.1) * u, hc[1] - 2.6 * u], a = -1.9 - k * 0.32 - (run ? 0.25 : 0) + (idle ? sin(t) * 0.04 : 0);
        shard(Hd, r0[0], r0[1], a, (4.4 - k * 0.9) * u, 0.75 * u, ICE);
      }
      put(L, Hd, true);
      legs(false);
      // ---- sword arm and greatsword
      let hand, sa;
      if (wind) { hand = U(-1.6, -11); sa = -2.5; }
      else if (strike) { hand = U(6.4, -3); sa = 0.55; }
      else if (hurt) { hand = U(3, -1.6); sa = -1.1; }
      else if (run) { hand = U(1.8, -3.4 + sin(t) * 0.3); sa = -2.35 + sin(t) * 0.05; }
      else { hand = U(1.8, -3.4 + sin(t) * 0.15); sa = -2.25; }
      const A = layer(F), sh = U(0.6, -6.6);
      limb(A, sh, hand, 3.6 * u, 3.6 * u, 1.5 * u, 1.3 * u, 1.2 * u, steel, 1);
      const S2 = layer(F);
      const dx = Math.cos(sa), dy = Math.sin(sa), tip = [hand[0] + dx * 15 * u, hand[1] + dy * 15 * u], gx0 = [hand[0] + dx * 1.2 * u, hand[1] + dy * 1.2 * u];
      // blade with a rime-crusted edge, crossguard, grip, pommel
      const bw = 1 * u, nx = -dy, ny = dx;
      slab(S2, [[gx0[0] + nx * bw, gx0[1] + ny * bw], [tip[0] - dx * 2 * u + nx * bw * 0.8, tip[1] - dy * 2 * u + ny * bw * 0.8], tip, [tip[0] - dx * 2 * u - nx * bw * 0.8, tip[1] - dy * 2 * u - ny * bw * 0.8], [gx0[0] - nx * bw, gx0[1] - ny * bw]], blade);
      S2.line(gx0[0], gx0[1], tip[0] - dx * 1.5 * u, tip[1] - dy * 1.5 * u, blade[2]);
      for (let k = 2; k < 13; k += 2.5) { const q = [hand[0] + dx * k * u + nx * bw, hand[1] + dy * k * u + ny * bw]; S2.rect(R(q[0]), R(q[1]), 1, 1, ICE[4]); }
      tube(S2, [[gx0[0] + nx * 2.4 * u, gx0[1] + ny * 2.4 * u], [gx0[0] - nx * 2.4 * u, gx0[1] - ny * 2.4 * u]], 0.6 * u, steel);
      tube(S2, [[hand[0] - dx * 2.4 * u, hand[1] - dy * 2.4 * u], gx0], 0.55 * u, cloth);
      blob(S2, [[hand[0] - dx * 2.8 * u, hand[1] - dy * 2.8 * u, 0.8 * u, 0.8 * u]], steel);
      put(L, S2, true);
      blob(A, [[hand[0], hand[1], 1.2 * u, 1.1 * u]], steel);
      blob(A, [[...U(0.4, -6.8), 2 * u, 1.6 * u]], steel);
      put(L, A, true);
      put(F.p, L, false);
      // visor glow: a cold lamp in the slit (gutters when struck)
      const vc = hurt ? '#3e6aa8' : wind || strike ? '#e6f4fc' : idle && P.i === 2 ? '#e6f4fc' : '#a8d0ec';
      eyeGlow(F, hc[0] + 0.6 * u, hc[1] - 0.7 * u, Math.max(3, R(2 * u)), Math.max(1, R(0.8 * u)), vc);
      // the cleave: a frost arc trailing the blade
      if (strike) for (let k = 0; k <= 40; k++) {
        const f = k / 40, a = sa - 1.7 + f * 1.6, th = Math.sin(f * Math.PI) * 1.8 * u;
        for (let r1 = 15 * u - th; r1 <= 15 * u; r1 += 0.5) { const x = hand[0] + Math.cos(a) * r1, y = hand[1] + Math.sin(a) * r1, c = r1 > 15 * u - th * 0.45 ? ICE[4] : ICE[3]; F.p.set(R(x), R(y), c); F.e.set(R(x), R(y), c); }
      }
      if (hurt) for (let k = 0; k < 4; k++) F.p.rect(R(cg[0] + (3 + k) * u), R(cg[1] - (6 - k * 2.4) * u), Math.max(1, R(0.8 * u)), Math.max(1, R(0.8 * u)), ICE[3]);
    },
  },
  // Strix (snow_harpy): the Roman night-owl of ill omen. A barred snowy owl that wears a pale
  // porcelain woman's face; it flies in profile but keeps its head turned to stare at you, two
  // gold owl eyes burning in the mask's empty holes, painted lips parted round a hooked beak.
  strix: {
    view: 'side', box: [44, 40], pivot: 0.55, idle: 4, run: 4, idleFps: 6, flap: 11,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const fth = cols('#5c6088', '#9a9ec2', '#d2d2e8', '#efeef2', '#fff8ec'), fthD = fth.map((c) => dark(c, 0.8));
      const bar = C('#3e4a5a'), mask = cols('#8a6a6a', '#c49a8a', '#e2c4a8', '#f3e1b5', '#fff4dc');
      const talon = cols('#140f1c', '#1d0814', '#2a1420', '#3e1c2c', '#55323d');
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle', wind = P.atk === 1, strike = P.atk === 2, hurt = P.hurt;
      // wing beat phase: 0 up, 1 level, 2 down, 3 level (run = the flap loop; idle a lazier one)
      const ph = run || idle ? [0, 1, 2, 1][P.i] : wind ? 0 : strike ? 3 : 2;
      const bob = [1, 0, -1, 0][run || idle ? P.i : 1] * 0.8 * u;
      let cx = ox, cy = oy - 13 * u + bob, pitch = 0.18;
      if (wind) { cx -= 1.5 * u; cy -= 1.5 * u; pitch = -0.1; }
      if (strike) { cx += 2.5 * u; cy += 1.5 * u; pitch = 0.55; }
      if (hurt) { cx -= 1.4 * u; pitch = -0.2; }
      const B = tilt(cx, cy, pitch), U = (dx, dy) => B(dx * u, dy * u);
      const L = layer(F);
      // chevron barring: rows of little dark V clusters over a white form
      const barring = (Ld, x0, y0, x1, y1, seed, n = 2) => {
        for (let y = y0; y < y1; y += 2 * u) for (let x = x0 + ((y / (2 * u)) & 1) * 1.6 * u; x < x1; x += 3.2 * u) {
          if (hash2(R(x), R(y), seed) > 0.8) continue;
          over(Ld, x, y, bar); if (n > 1) { over(Ld, x - 1, y - 1, bar); over(Ld, x + 1, y - 1, bar); }
        }
      };
      const wingA = [[-1.55, -1.35], [-2.85, -0.85], [2.2, 0.75], [-3.0, -0.6]][ph];
      const sh = U(0.4, -2.4);
      // far wing
      const Wf = layer(F);
      owlWing(Wf, [sh[0] + 1 * u, sh[1] - 0.6 * u], wingA[0] + 0.15, 18 * u, wingA[1], fthD, { bar: '#2a3240', contour: false, n: 8 });
      put(L, Wf, false);
      // tail fan
      const Tl = layer(F);
      for (let k = 0; k < 4; k++) { const a = Math.PI * 0.62 + pitch + (k - 1.5) * 0.18; const r0 = U(-2.4, 3.4); tube(Tl, [r0, [r0[0] + Math.cos(a) * 5.5 * u, r0[1] + Math.sin(a) * 5.5 * u]], [1.1 * u, 0.8 * u], fth, { matte: true }); }
      barring(Tl, 0, 0, Tl.w, Tl.h, 7, 1);
      put(L, Tl, true);
      // legs: feathered trousers, dark talons; hang in flight, thrust forward on the strike
      const legs = (far) => {
        const Lg = layer(F), Rm = far ? fthD : fth;
        const hip = U(far ? 1.2 : 0.2, 3.6);
        const reach = strike ? [hip[0] + 6 * u, hip[1] + 3 * u] : wind ? [hip[0] + 1 * u, hip[1] + 2 * u] : [hip[0] - 0.6 * u + (far ? 0.6 * u : 0), hip[1] + 4.2 * u];
        tube(Lg, [hip, reach], [1.6 * u, 1.2 * u], Rm, { fur: 2 });
        const open = strike ? 0.9 : 0.35, dir = Math.atan2(reach[1] - hip[1], reach[0] - hip[0]);
        for (let k = 0; k < 3; k++) {
          const a = dir + (k - 1) * open, tp = [reach[0] + Math.cos(a) * 2.6 * u, reach[1] + Math.sin(a) * 2.6 * u];
          horn(Lg, reach, [lerp(reach[0], tp[0], 0.6), lerp(reach[1], tp[1], 0.6) - 0.3 * u], [tp[0] + Math.cos(a + 1.4) * 0.8 * u, tp[1] + Math.sin(a + 1.4) * 0.8 * u], 0.8 * u, talon);
        }
        put(L, Lg, !far);
      };
      legs(true);
      // body: a round barred egg, fluffing out jagged when hurt
      const Bd = layer(F);
      blob(Bd, [[...U(0, 0.6), 4.6 * u, 5.2 * u], [...U(1.2, -2.6), 3.6 * u, 3 * u]], fth, { fur: 6 });
      barring(Bd, 0, 0, Bd.w, Bd.h, 2);
      if (hurt) for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU, q = U(Math.cos(a) * 5.2, 0.6 + Math.sin(a) * 5.8); Bd.poly([[q[0] - 1 * u, q[1]], [q[0] + 1 * u, q[1]], [q[0] + Math.cos(a) * 1.6 * u, q[1] + Math.sin(a) * 1.6 * u]], fth[3]); }
      put(L, Bd, true);
      legs(false);
      // near wing over the body
      owlWing(L, sh, wingA[0], 20 * u, wingA[1], fth, { bar: '#3e4a5a', n: 8 });
      put(F.p, L, false);
      const Wb = layer(F);
      put(F.p, Wb, false);
      // ---- head, turned to face us: ear tufts, a ruff, and the mask
      const tiltH = wind ? 0.32 : hurt ? -0.25 : idle ? sin(t) * 0.06 : 0;
      const hc = U(2.6, -7.6), Hq = tilt(hc[0], hc[1], tiltH), H = (dx, dy) => Hq(dx * u, dy * u);
      const Hd = layer(F);
      for (const sg of [-1, 1]) slab(Hd, [H(sg * 2.2, -2.6), H(sg * 3.8, -6.2 + (sg > 0 ? 0.6 : 0)), H(sg * 0.8, -3.6)], fth);
      blob(Hd, [[...H(0, 0), 4.6 * u, 4.2 * u]], fth, { fur: 8 });
      barring(Hd, hc[0] - 5 * u, hc[1] - 5 * u, hc[0] + 5 * u, hc[1] - 2.4 * u, 9, 1);
      put(L, Hd, true);
      const Mk = layer(F);
      // an oval porcelain woman's face, a little too small for the head
      blob(Mk, [[...H(0, 0.3), 2.9 * u, 3.6 * u]], mask);
      Mk.line(...H(0.3, -0.4), ...H(0.5, 1.1), mask[2]);
      Mk.set(...H(0.6, 1.2).map(R), mask[1]);
      // painted brows (one arched higher), rouge, a crack across the cheek
      Mk.line(...H(-2.2, -1.9), ...H(-0.6, -2.1), mask[0]); Mk.line(...H(0.6, -2.2), ...H(2.2, -2.6), mask[0]);
      over(Mk, ...H(-1.8, 1), '#cc6a86'); over(Mk, ...H(1.9, 1), '#cc6a86');
      if (hurt || P.i % 2 || wind || strike) crack(Mk, ...H(1.2, 0.2), 0.7 + tiltH, 3.4 * u, mask[0], 3);
      // almond eye holes
      const eye = (sx) => { const q = H(sx * 1.35, -0.7); Mk.ellipse(q[0], q[1], 1.35 * u, 0.9 * u, VOID); return q; };
      const e1 = eye(-1), e2 = eye(1);
      // parted painted lips with the beak hooking through
      const mq = H(0, 2.3), op = strike || wind ? 0.8 * u : 0.3 * u;
      Mk.ellipse(mq[0], mq[1], 1.3 * u, op + 0.35 * u, C('#a94a68'));
      Mk.ellipse(mq[0], mq[1], 0.8 * u, op * 0.7, MAW_D);
      Mk.poly([[mq[0] - 0.6 * u, mq[1] - op - 0.5 * u], [mq[0] + 0.6 * u, mq[1] - op - 0.5 * u], [mq[0] + 0.1 * u, mq[1] + 0.3 * u + op * 0.4]], C('#cfa978'));
      put(L, Mk, true);
      put(F.p, L, false);
      // the owl's own eyes behind the holes: huge, gold, unblinking (shut when hurt)
      for (const q of [e1, e2]) {
        if (hurt) { F.p.line(q[0] - 1 * u, q[1], q[0] + 1 * u, q[1], C('#8a6a6a')); continue; }
        for (const Ld of [F.p, F.e]) { Ld.ellipse(q[0], q[1], 1.1 * u, 0.7 * u, C('#e8c35a')); Ld.set(R(q[0] - 0.5 * u), R(q[1] - 0.3 * u), C('#f6e39a')); }
        F.p.rect(R(q[0]), R(q[1] - 0.4 * u), 1, Math.max(1, R(0.8 * u)), VOID);
      }
      F.mouth = [mq[0], mq[1]];
    },
  },
  // Glacier Golem (ice_golem): a calved block of the old glacier that got up and walked. It has no
  // head: its top is a ridge of séracs under a snow cap. Deep in the blue ice a whole woolly
  // mammoth is frozen mid-stride, a dark shape with one eye still lit; its two great tusks have
  // broken out through the front of the ice and the golem gores with them.
  glacier_golem: {
    view: 'side', box: [46, 40], pivot: 0.44, idle: 4, run: 4, idleFps: 2.5, scale: 0.74,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const ice = ICE, iceD = ICE.map((c) => dark(c, 0.8)), shadowM = cols('#140f2c', '#1d1a3e', '#2a2850', '#383862', '#4a4a78');
      const tusk = cols('#6a5a5a', '#a08a78', '#cfa978', '#f3e1b5', '#fff4dc'), rock = cols('#1f1d26', '#2f2c38', '#4e4b53', '#66626a', '#827d82');
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle', wind = P.atk === 1, strike = P.atk === 2, hurt = P.hurt;
      let bx = ox, by = oy - 7 * u, lean = 0;
      if (idle) by += sin(t) * 0.25 * u;
      if (run) { by -= Math.abs(sin(t)) * 0.8 * u; lean = sin(t) * 0.05; }
      if (wind) { bx -= 1.2 * u; lean = -0.14; by -= 0.6 * u; }
      if (strike) { bx += 2.2 * u; lean = 0.2; by += 0.6 * u; }
      if (hurt) { bx -= 1.2 * u; lean = -0.1; }
      const B = tilt(bx, by, lean), U = (dx, dy) => B(dx * u, dy * u);
      const L = layer(F);
      // ---- arms of stacked ice blocks hanging at the flanks, moraine-stone fists
      const arm = (far) => {
        const A = layer(F), Rm = far ? iceD : ice, sh = U(far ? 2 : -5.4, -14);
        let hd;
        if (wind) hd = U(far ? 4 : -3, -28);
        else if (strike) hd = [U(far ? 13 : 11, 0)[0], oy - 2.4 * u];
        else if (run) hd = U((far ? 4 : -5.5) + sin(t + (far ? 0.5 : 0)) * 2.6, -2.6);
        else hd = U(far ? 4.5 : -6.4, -2.6 + (idle ? sin(t) * 0.2 : 0));
        const el = ik(sh, hd, 6.5 * u, 6.5 * u, wind ? -1 : 1);
        const blk = (a2, b2, w) => { const dx = b2[0] - a2[0], dy = b2[1] - a2[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * w, ny = dx / l * w; slab(A, [[a2[0] + nx, a2[1] + ny], [b2[0] + nx * 0.9, b2[1] + ny * 0.9], [b2[0] - nx * 0.9, b2[1] - ny * 0.9], [a2[0] - nx, a2[1] - ny]], Rm, { wide: true }); };
        blk(sh, el, 2.5 * u); blk(el, hd, 2.2 * u);
        blob(A, [[hd[0], hd[1], 3 * u, 2.8 * u]], Rm);
        spots(A, hd[0], hd[1], 2.4 * u, 2.2 * u, 4, 1 * u, far ? rock[2] : rock[3], far ? 3 : 8);
        frostTop(A, SNOW[3], 1, 0, A.w, 4);
        put(L, A, true);
      };
      arm(true);
      const legs = (far) => {
        const Lg = layer(F), Rm = far ? iceD : ice, hip = U(far ? 3 : -3, -1);
        let foot = [hip[0], oy];
        if (run) { const [dx, lift] = stride(t + (far ? 0.5 : 0), 4.5 * u, 1.6 * u); foot = [hip[0] + dx, oy - lift]; }
        else if (strike) foot = [hip[0] + (far ? 2 : -2) * u, oy];
        slab(Lg, [[hip[0] - 2.6 * u, hip[1]], [hip[0] + 2.6 * u, hip[1]], [foot[0] + 3 * u, foot[1]], [foot[0] - 2.8 * u, foot[1]]], Rm, { wide: true });
        Lg.line(foot[0] - 2.4 * u, foot[1] - 1, foot[0] + 2.6 * u, foot[1] - 1, SNOW[3]);
        put(L, Lg, !far);
      };
      legs(true);
      // ---- the glacier block: a sérac ridge on top, a sheer front face
      const Bd = layer(F);
      const top = [U(-9, -15), U(-7.4, -21.5), U(-5.6, -18.6), U(-3, -25.4), U(-0.6, -20.4), U(1.8, -26.6), U(3.8, -20.6), U(6.2, -23.6), U(8.2, -18.4), U(10.4, -17)];
      if (hurt) top.splice(5, 1, U(2, -21.6));
      Bd.poly([...top, U(11, -6), U(9.8, 0.4), U(-9, 0.4), U(-10.4, -8)], ice[3]);
      facet(Bd, [U(-10.4, -8), U(-9, -15), U(-6.8, -14), U(-7.6, 0.4), U(-9, 0.4)], ice[2]);
      facet(Bd, [U(8.2, -18.4), U(10.4, -17), U(11, -6), U(9.8, 0.4), U(7.4, 0.4), U(8.4, -10)], ice[2]);
      // blue strata and a moraine band of grit near the foot
      for (const [y, c] of [[-16, ice[2]], [-3.4, ice[1]], [-1.6, rock[2]]]) for (let x = -10; x <= 11; x += 0.5) { const q = U(x, y + Math.sin(x * 0.7) * 0.5); over(Bd, q[0], q[1], c); }
      // the mammoth inside, mid-stride, facing the same way: hump, domed brow, curled trunk
      const M = layer(F);
      for (const [lx, ph] of [[-5.2, 0.5], [-2.8, 0], [2.2, 0.5], [4.4, 0]]) tube(M, [U(lx, -8), U(lx + (ph ? -0.6 : 0.6), -4.6)], [1.5 * u, 1.2 * u], shadowM, { matte: true });
      blob(M, [[...U(-0.8, -10.2), 6.4 * u, 4 * u], [...U(-2.6, -12.6), 3.8 * u, 3 * u], [...U(4.8, -12), 2.9 * u, 3 * u], [...U(5.4, -14.4), 1.8 * u, 1.6 * u]], shadowM, { matte: true });
      tube(M, [U(7, -11), U(8.2, -8), U(7.4, -5.6), U(6.2, -6)], [1.3 * u, 0.6 * u], shadowM);
      // shaggy fringe along the belly
      for (let k = 0; k < 7; k++) { const q = U(-6 + k * 1.6, -6.6); M.poly([[q[0] - 0.7 * u, q[1] - 0.6 * u], [q[0] + 0.7 * u, q[1] - 0.6 * u], [q[0], q[1] + 1.1 * u]], shadowM[2]); }
      rimLight(M, mixc(shadowM[4], ice[2], 0.5));
      put(Bd, M, false);
      // glints sweeping across the face, and a crevasse
      const gl = (P.i + (run ? 1 : 0)) % 4;
      for (const k of [0, 1.2]) { const a2 = U(-7 + gl * 3 + k, -2), b2 = U(-4.4 + gl * 3 + k, -15); Bd.line(a2[0], a2[1], b2[0], b2[1], ice[4]); }
      crack(Bd, ...U(-4.6, -22), 1.4, 6 * u, ice[1], 4);
      if (hurt) crack(Bd, ...U(8.4, -17), 2.2, 12 * u, ice[4], 11);
      // snow lying on the sérac slopes
      frostTop(Bd, SNOW[3], 2, 0, Bd.w, 5);
      frostTop(Bd, SNOW[4], 1, 0, Bd.w, 6);
      put(L, Bd, true);
      // ---- the tusks: two great ivory sweeps broken out of the front face (the far one snapped)
      const tw = wind ? -0.35 : strike ? 0.3 : idle ? sin(t) * 0.03 : 0;
      const Tf = layer(F);
      horn(Tf, U(9.8, -12.4), U(15, -11.6 + tw * 8), U(15.4, -16.4 + tw * 10), 2.8 * u, tusk.map((c) => dark(c, 0.78)), { pow: 0.35 });
      put(L, Tf, true);
      const Tn = layer(F);
      horn(Tn, U(9.6, -9.6), U(18.6, -8 + tw * 8), U(16.4, -18.6 + tw * 11), 3.4 * u, tusk, { pow: 0.6 });
      blob(Tn, [[...U(10, -9.8), 2 * u, 2.2 * u], [...U(10.2, -12.4), 1.6 * u, 1.6 * u]], ice);
      put(L, Tn, true);
      legs(false);
      arm(false);
      put(F.p, L, false);
      // the mammoth's eye, lit through the ice; it gutters when the golem is struck
      const eq = U(5.6, -13);
      eyeGlow(F, eq[0] - 0.6 * u, eq[1] - 0.4 * u, Math.max(2, R(1.4 * u)), Math.max(1, R(0.9 * u)), hurt ? '#3e6aa8' : wind || strike ? '#e6f4fc' : idle && P.i === 2 ? '#e6f4fc' : '#a8d0ec');
      if (idle || run) for (let k = 0; k < 5; k++) { const q = U(-7 + k * 3.4 - t * 4, -27 + ((k * 3 + P.i) % 4) * 0.8); F.e.set(R(q[0]), R(q[1]), [236, 240, 250, 170]); }
      if (strike) for (let k = 0; k < 8; k++) { const a2 = -Math.PI / 2 + (k - 3.5) * 0.36, d = (3 + (k % 3) * 1.6) * u; shard(F.p, U(12, 0)[0] + Math.cos(a2) * d * 0.4, oy - 1 * u, a2, d, 0.7 * u, ice); }
    },
  },
  // Geode Spider (crystal_spider): the miners' tale of the rock that bites. Its abdomen is a
  // geode: a rough grey stone egg split open along the top, packed with amethyst-to-frost crystal
  // spires that catch the light as it scuttles. Stone legs with crystal tips, a cluster of gem eyes.
  geode_spider: {
    view: 'side', box: [40, 28], pivot: 0.5, idle: 4, run: 4, idleFps: 3, scale: 1.1,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const rockR = cols('#1f1a2c', '#3e3650', '#5a5070', '#7a7090', '#9a92ac'), rockD = rockR.map((c) => dark(c, 0.8));
      const am = cols('#2f0d48', '#4a1664', '#7a3ab0', '#a060d0', '#d4b4ec'), fr = cols('#243e7b', '#3e6aa8', '#4f86c4', '#a8d0ec', '#e6f4fc');
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle', wind = P.atk === 1, strike = P.atk === 2, hurt = P.hurt;
      let bx = ox, by = oy - 6.6 * u, pitch = 0;
      if (idle) by += sin(t) * 0.2 * u;
      if (run) by -= Math.abs(sin(t * 2)) * 0.5 * u;
      if (wind) { bx -= 1.4 * u; by -= 1.2 * u; pitch = -0.28; }
      if (strike) { bx += 2.4 * u; by += 0.6 * u; pitch = 0.12; }
      if (hurt) { bx -= 1.2 * u; pitch = -0.12; }
      const B = tilt(bx, by, pitch), U = (dx, dy) => B(dx * u, dy * u);
      const L = layer(F);
      // ---- legs: 4 a side, knees high, crystal-tipped feet
      const legs = (far) => {
        const Lg = layer(F), Rm = far ? rockD : rockR;
        for (let k = 0; k < 4; k++) {
          const hip = U(3.4 - k * 0.9 + (far ? 0.6 : 0), 0.2);
          const spread = [10, 5.2, -1.6, -8][k] + (far ? 1.2 : 0);
          let foot = [bx + spread * u, oy];
          if (run) { const [dx, lift] = stride(t * 2 + (k % 2 ? 0.5 : 0) + (far ? 0.5 : 0), 3 * u, 1.6 * u); foot = [foot[0] + dx, oy - lift]; }
          if (idle && k === 0 && !far && P.i === 1) foot = [foot[0] + 0.6 * u, oy - 1.4 * u];
          if (wind && k < 2) foot = [U(spread * 0.6 + 4, -6 - (1 - k) * 2)[0], U(0, -6 - (1 - k) * 2)[1]];
          if (strike && k < 2) foot = [bx + (spread + 3) * u, oy - (k ? 0 : 0.4) * u];
          if (hurt) foot = [lerp(foot[0], hip[0], 0.3), oy - (k % 2) * 0.8 * u];
          const kn = [lerp(hip[0], foot[0], 0.42), Math.min(hip[1], foot[1]) - (3.4 - Math.abs(k - 1.5) * 0.5 + (far ? 0.4 : 0)) * u];
          tube(Lg, [hip, kn], [0.9 * u, 0.75 * u], Rm, { rings: R(2.2 * u) });
          tube(Lg, [kn, foot], [0.75 * u, 0.4 * u], Rm);
          // the crystal tip of each foot
          const dx = foot[0] - kn[0], dy = foot[1] - kn[1], l = Math.hypot(dx, dy) || 1;
          shard(Lg, foot[0] - dx / l * 1.4 * u, foot[1] - dy / l * 1.4 * u, Math.atan2(dy, dx), 1.8 * u, 0.5 * u, far ? am : fr);
          Lg.set(R(kn[0]), R(kn[1] - 0.6 * u), Rm[4]);
        }
        put(L, Lg, !far);
      };
      legs(true);
      // ---- the geode abdomen: rough stone, split along the top
      const Ab = layer(F), ac = U(-4.4, -2.6);
      blob(Ab, [[ac[0], ac[1], 6.4 * u, 5.4 * u], [ac[0] - 1 * u, ac[1] + 1 * u, 5.6 * u, 4.6 * u]], rockR, { tex: 3 });
      spots(Ab, ac[0] - 1 * u, ac[1] + 1.4 * u, 5 * u, 3.6 * u, 7, 0.9 * u, rockR[2], 9);
      spots(Ab, ac[0] - 2 * u, ac[1] - 1 * u, 3.6 * u, 2.4 * u, 4, 0.7 * u, rockR[4], 3);
      // the split: a jagged lens of dark cavity, lined with a pale chalcedony rind
      const cav = [];
      for (let k = 0; k <= 10; k++) { const f = k / 10, x = ac[0] + (f - 0.5) * 10.4 * u, top = ac[1] - 5.6 * u + Math.abs(f - 0.5) * 3.4 * u; cav.push([x, top - (k % 2 ? 0.6 * u : 0)]); }
      for (let k = 10; k >= 0; k--) { const f = k / 10, x = ac[0] + (f - 0.5) * 9 * u; cav.push([x, ac[1] - 1.4 * u + Math.abs(f - 0.5) * 2.2 * u + (k % 2 ? 0.5 * u : 0)]); }
      const Cv = layer(F);
      Cv.poly(cav, am[0]);
      for (const Ld of [Cv]) for (let y = 0; y < Ld.h; y++) for (let x = 0; x < Ld.w; x++) if (Ld.a(x, y) && (!Ld.a(x, y + 1) || !Ld.a(x - 1, y) || !Ld.a(x + 1, y))) Ld.set(x, y, '#c4cce0');
      for (let i = 3; i < Cv.d.length; i += 4) if (Cv.d[i] && !Ab.d[i]) Cv.d[i] = 0;
      put(Ab, Cv, false);
      // inner glow on the cavity floor
      for (let k = 0; k < 4; k++) { const q = U(-7 + k * 2, -4.4); F.e.rect(R(q[0]), R(q[1]), Math.max(1, R(1.2 * u)), 1, [160, 120, 220, 120]); }
      put(L, Ab, true);
      // ---- crystal spires rising out of the split: violet at the root, frost-pale at the tips
      const Cr = layer(F), flare = wind ? 1.2 : hurt ? 0.7 : 1;
      const spires = [[-8.2, -2.1, 3.2, 1], [-6.6, -1.7, 4.6, 0], [-5, -1.3, 6.4, 1], [-3.6, -1.5, 5.2, 0], [-2.4, -1.15, 7.2, 1], [-1, -0.8, 4.6, 0], [0.2, -0.5, 3, 1]];
      spires.forEach(([dx, a, len, kind], i) => {
        if (hurt && i === 4) len = 2.4;
        const q = U(dx, -4.6 - (Math.abs(dx + 4) < 2 ? 1 : 0)), Rm = kind ? am : fr;
        shard(Cr, q[0], q[1], a + pitch, len * u * flare, (0.9 + len * 0.08) * u, Rm, { ridge: '#e6f4fc' });
      });
      put(L, Cr, true);
      // ---- cephalothorax + head with mandibles of crystal
      const Th = layer(F);
      blob(Th, [[...U(3.2, -1), 3.2 * u, 2.5 * u], [...U(6.4, -1.4), 2.3 * u, 2 * u]], rockR, { tex: 5 });
      put(L, Th, true);
      const jaw = strike ? 0.7 : wind ? 0.5 : 0;
      const Mn = layer(F);
      for (const sg of [-1, 1]) {
        const r0 = U(7.8, 0.2 + sg * 0.3);
        horn(Mn, r0, [r0[0] + 1.6 * u, r0[1] + (0.6 + sg * jaw) * u], [r0[0] + 1.2 * u + jaw * u, r0[1] + (2.4 + sg * jaw * 1.6) * u], 1.2 * u, sg > 0 ? fr : am);
      }
      put(L, Mn, true);
      legs(false);
      put(F.p, L, false);
      // the gem eyes: a cluster of little lit crystals, the two front ones bigger
      const ey = U(7, -2.6), ec = hurt ? '#4a3266' : wind || strike ? '#e6f4fc' : '#a87cc0';
      eyeGlow(F, ey[0], ey[1], Math.max(2, R(1.1 * u)), Math.max(1, R(1 * u)), ec);
      eyeGlow(F, ey[0] - 1.6 * u, ey[1] - 0.6 * u, Math.max(1, R(0.8 * u)), Math.max(1, R(0.8 * u)), ec);
      for (const [dx, dy] of [[-0.6, -1.4], [-2.6, -0.2], [0.8, -1]]) { const q = U(7 + dx, -2.6 + dy); for (const Ld of [F.p, F.e]) Ld.set(R(q[0]), R(q[1]), C('#a8d0ec')); }
      // a glint that hops between spires; crystal shards spray when hit
      const sp = spires[(P.i * 3 + (run ? 1 : 0)) % spires.length], gq = U(sp[0] + Math.cos(sp[1]) * sp[3] * 0 + Math.cos(sp[1] + pitch) * sp[2] * 0.7, -4.6 + Math.sin(sp[1] + pitch) * sp[2] * 0.7);
      for (const Ld of [F.p, F.e]) { Ld.set(R(gq[0]), R(gq[1]), WHITE); Ld.set(R(gq[0]) - 1, R(gq[1]), C('#e6f4fc')); Ld.set(R(gq[0]), R(gq[1]) - 1, C('#e6f4fc')); }
      if (hurt) for (let k = 0; k < 5; k++) { const q = U(-2.4 + k * 1.2 - 2, -12 + (k % 2) * 2); shard(F.p, q[0], q[1], -1 - k * 0.5, 1.6 * u, 0.5 * u, k % 2 ? am : fr); }
    },
  },
  // The Mine Horror (mine_horror): what the miners woke. The front of a giant star-nosed mole
  // (velvet fur, shovel hands, a squint, two yellow incisors) grown onto a long armoured centipede.
  // Its nose is a spiralled drill ringed by a corona of fleshy star-fingers. Along its back it
  // carries the lanterns of the crews it ate, staked into its plates like trophies; they swing as
  // it moves and they are its weak points.
  mine_horror: {
    view: 'side', box: [70, 40], pivot: 0.6, idle: 6, run: 4, idleFps: 5, scale: 0.78,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const fur = cols('#140f1c', '#1d1426', '#2e2238', '#433452', '#5e4c6e'), furD = fur.map((c) => dark(c, 0.85));
      const plate = cols('#1a1f2c', '#2a3240', '#3e4a5a', '#525c83', '#6e7a9a'), plateD = plate.map((c) => dark(c, 0.8));
      const flesh = cols('#4a1a30', '#7a2f4a', '#a94a68', '#cc6a86', '#e48fb0'), claw = cols('#6a5a5a', '#a08a78', '#cfa978', '#f3e1b5', '#fff4dc');
      const iron = cols('#140f1c', '#22262e', '#3a4048', '#4a5259', '#6a7276'), rust = C('#8a4238'), brass = cols('#3e2418', '#6a3e1c', '#9a6424', '#c99a3a', '#e8c35a');
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle', wind = P.atk === 1, strike = P.atk === 2, hurt = P.hurt;
      let bx = ox, by = oy, rear = 0;
      if (wind) { bx -= 2 * u; rear = 4; }
      if (strike) { bx += 4 * u; rear = -3.4; }
      if (hurt) { bx -= 2 * u; rear = 1.6; }
      const U = (dx, dy) => [bx + dx * u, by + dy * u];
      const L = layer(F);
      // ---- centipede spine: neck -> tail, undulating
      const N = 9, wave = (i) => (idle ? sin(t + i * 0.12) * 0.5 : run ? sin(t * 2 + i * 0.25) * 0.9 : 0);
      const spine = bez([U(3, -11 - rear * 0.5), U(-7, -6.6), U(-20, -5.6), U(-31, -9.6)], N - 1).map(([x, y], i) => [x, y + wave(i) * u]);
      const rad = (i) => (4.6 - i * 0.32) * u;
      // far legs, all segments
      const segLegs = (far) => {
        const Lg = layer(F), Rm = far ? iron.map((c) => dark(c, 0.8)) : iron;
        for (let i = 0; i < N; i++) {
          const [cx, cy] = spine[i], r = rad(i), hip = [cx + (far ? 1 : -0.4) * u, cy + r * 0.6];
          let foot = [cx + (far ? 1.6 : -0.8) * u + 1.4 * u, oy];
          if (run) { const [dx, lift] = stride(t * 2 + i * 0.22 + (far ? 0.5 : 0), 3 * u, 1.2 * u); foot = [foot[0] + dx, oy - lift]; }
          else if (idle) foot = [foot[0] + sin(t + i * 0.3) * 0.4 * u, oy];
          const kn = [lerp(hip[0], foot[0], 0.3) + 1.4 * u, Math.min(hip[1], foot[1]) - 0.4 * u + (foot[1] - hip[1]) * 0.3];
          tube(Lg, [hip, kn], [0.8 * u, 0.6 * u], Rm);
          tube(Lg, [kn, foot], [0.6 * u, 0.3 * u], Rm);
        }
        put(L, Lg, !far);
      };
      segLegs(true);
      // segments, tail first: chitin plates with a rusted rim and a ridge
      for (let i = N - 1; i >= 0; i--) {
        const [cx, cy] = spine[i], r = rad(i), Sg = layer(F);
        blob(Sg, [[cx, cy, r * 1.05, r * 0.86]], plate, { tex: 11 + i });
        // rusted rim along the back edge, a pale ridge on top
        for (let a = 1.9; a < 4.3; a += 0.04) over(Sg, cx + Math.cos(a) * r * 0.98, cy + Math.sin(a) * r * 0.82, rust);
        for (let a = 3.9; a < 5.2; a += 0.05) over(Sg, cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.5, plate[4]);
        put(L, Sg, true);
      }
      // tail spike
      const tl = spine[N - 1];
      horn(L, tl, [tl[0] - 3 * u, tl[1] - 1 * u], [tl[0] - 4.6 * u, tl[1] - 4.4 * u + wave(N) * u], 2 * u, plate);
      // ---- trophies: a pickaxe driven into a plate, lanterns staked along the back
      const pk = spine[5], Pk = layer(F);
      tube(Pk, [[pk[0] - 0.6 * u, pk[1] - 1.6 * u], [pk[0] - 4 * u, pk[1] - 8 * u]], 0.55 * u, cols('#2a1a1c', '#3f2622', '#5a3628', '#77492f', '#94603c'));
      horn(Pk, [pk[0] - 4 * u, pk[1] - 8 * u], [pk[0] - 2 * u, pk[1] - 9.4 * u], [pk[0] - 0.4 * u, pk[1] - 8.6 * u], 1.2 * u, iron);
      horn(Pk, [pk[0] - 4 * u, pk[1] - 8 * u], [pk[0] - 5.6 * u, pk[1] - 7.6 * u], [pk[0] - 6.6 * u, pk[1] - 6 * u], 1.2 * u, iron);
      put(L, Pk, true);
      const lamps = [];
      [1, 3, 7].forEach((i, k) => {
        const [cx, cy] = spine[i], r = rad(i), base = [cx + 0.4 * u, cy - r * 0.8];
        const top = [base[0] - 1.2 * u + k * 0.4 * u, base[1] - (4.6 - k * 0.6) * u];
        const Lp = layer(F);
        tube(Lp, [base, top], 0.45 * u, iron);
        Lp.line(top[0], top[1], top[0] + 1.6 * u, top[1] - 0.4 * u, iron[3]);
        const sw = (idle ? sin(t + k * 0.33) * 0.35 : run ? sin(t * 2 + k * 0.3) * 0.5 : wind ? -0.4 : strike ? 0.6 : 0.2);
        const hook = [top[0] + 1.6 * u, top[1] - 0.4 * u], lc = [hook[0] + Math.sin(sw) * 2.2 * u, hook[1] + Math.cos(sw) * 2.2 * u];
        Lp.line(hook[0], hook[1], lc[0], lc[1] - 1.2 * u, iron[2]);
        // the lantern: brass cap, iron cage, glowing glass
        Lp.rect(R(lc[0] - 1.1 * u), R(lc[1] - 1.4 * u), R(2.2 * u), R(0.6 * u), brass[3]);
        Lp.rect(R(lc[0] - 1 * u), R(lc[1] - 0.9 * u), R(2 * u), R(2.6 * u), iron[2]);
        Lp.rect(R(lc[0] - 1.1 * u), R(lc[1] + 1.6 * u), R(2.2 * u), R(0.5 * u), brass[2]);
        put(L, Lp, true);
        lamps.push(lc);
      });
      segLegs(false);
      // ---- the mole: shoulders and neck in velvet fur
      const hx = U(12.4, -17.4 - rear)[0], hy = U(12.4, -17.4 - rear)[1];
      const farArm = () => {
        const A = layer(F), sh = U(6.4, -11 - rear * 0.6);
        const palm = wind ? U(13, -24) : strike ? U(19, -4) : hurt ? U(9, -6) : U(11 + (run ? sin(t * 2) * 1.6 : 0), -1.6 - (run ? Math.max(0, sin(t * 2)) * 1.6 : 0));
        const el = ik(sh, palm, 5.6 * u, 6 * u, 1);
        tube(A, [sh, el, palm], [2.6 * u, 1.8 * u], furD, { fur: 3 });
        blob(A, [[palm[0] + 0.6 * u, palm[1] - 0.4 * u, 2.4 * u, 1.6 * u]], flesh.map((c) => dark(c, 0.8)));
        for (let k = 0; k < 4; k++) { const r0 = [palm[0] + 2 * u, palm[1] - 1.2 * u + k * 0.8 * u]; horn(A, r0, [r0[0] + 1.8 * u, r0[1] - 0.2 * u], [r0[0] + 3 * u, r0[1] + 1.2 * u], 0.9 * u, claw.map((c) => dark(c, 0.8))); }
        put(L, A, true);
      };
      farArm();
      const Bd = layer(F);
      blob(Bd, [[...U(3.4, -11 - rear * 0.5), 6.2 * u, 5.8 * u], [...U(7.6, -14.6 - rear * 0.8), 4.6 * u, 4.6 * u]], fur, { fur: 5 });
      // velvet sheen: a soft lit crescent across the shoulders
      for (let a = 3.6; a < 4.9; a += 0.03) over(Bd, U(3.4, -11 - rear * 0.5)[0] + Math.cos(a) * 4.8 * u, U(3.4, -11 - rear * 0.5)[1] + Math.sin(a) * 4.4 * u, fur[4]);
      put(L, Bd, true);
      // head: wedge-shaped skull, a tiny squinting eye, the incisors
      const Hd = layer(F);
      blob(Hd, [[hx, hy, 4.6 * u, 3.8 * u], [hx + 2.6 * u, hy + 0.6 * u, 3 * u, 2.6 * u]], fur, { fur: 9 });
      const jaw = strike ? 1.6 * u : wind ? 1 * u : 0;
      Hd.ellipse(hx + 3 * u, hy + 3 * u + jaw * 0.3, 2.2 * u, 0.6 * u + jaw * 0.6, MAW_D);
      for (const dx of [2.6, 3.6]) Hd.rect(R(hx + dx * u), R(hy + 2.4 * u), Math.max(2, R(0.9 * u)), R(1.6 * u + jaw * 0.4), dx > 3 ? claw[2] : claw[3]);
      put(L, Hd, true);
      // the star-nose: a corona of fleshy fingers around a spiralled drill
      const nb = [hx + 5.4 * u, hy + 0.2 * u], spin = (idle || run ? P.i : 0) * 0.25 + (wind ? 0.5 : 0);
      const Ns = layer(F);
      for (let k = 0; k < 11; k++) {
        const a = -1.75 + (k / 10) * 3.5, wr = sin(t * 2 + k * 0.37) * (hurt ? 0.5 : 0.18), l = (2.4 + (k % 2) * 0.7) * u * (hurt ? 1.25 : 1);
        horn(Ns, nb, [nb[0] + Math.cos(a + wr) * l * 0.6, nb[1] + Math.sin(a + wr) * l * 0.6], [nb[0] + Math.cos(a + wr * 2) * l, nb[1] + Math.sin(a + wr * 2) * l], 1.1 * u, flesh, { pow: 0.4 });
      }
      put(L, Ns, true);
      const Dr = layer(F), dl = (strike ? 8.4 : 6.4) * u, dw = 2.2 * u;
      Dr.poly([[nb[0], nb[1] - dw], [nb[0] + dl, nb[1]], [nb[0], nb[1] + dw]], flesh[3]);
      for (let k = 0; k < 6; k++) {
        const f = ((k + spin * 2) % 6) / 6, x0 = nb[0] + f * dl * 0.92;
        const hw = dw * (1 - f);
        Dr.line(x0, nb[1] - hw, x0 + 1.4 * u * (1 - f), nb[1] + hw, flesh[1]);
        Dr.line(x0 + 1, nb[1] - hw, x0 + 1 + 1.4 * u * (1 - f), nb[1] + hw * 0.2, flesh[4]);
      }
      put(L, Dr, true);
      // near arm: a shovel hand with long cream claws
      const A = layer(F), sh = U(5, -9.6 - rear * 0.6);
      const palm = wind ? U(11, -25) : strike ? U(20.4, -2.6) : hurt ? U(8, -4) : U(9.4 + (run ? -sin(t * 2) * 1.6 : 0), -1.6 - (run ? Math.max(0, -sin(t * 2)) * 1.6 : 0));
      const el = ik(sh, palm, 5.6 * u, 6 * u, 1);
      tube(A, [sh, el, palm], [2.9 * u, 2 * u], fur, { fur: 4 });
      blob(A, [[palm[0] + 0.6 * u, palm[1] - 0.4 * u, 2.6 * u, 1.8 * u]], flesh);
      for (let k = 0; k < 4; k++) { const r0 = [palm[0] + 2.2 * u, palm[1] - 1.3 * u + k * 0.85 * u]; horn(A, r0, [r0[0] + 2 * u, r0[1] - 0.2 * u], [r0[0] + 3.4 * u, r0[1] + 1.3 * u], 1 * u, claw); }
      put(L, A, true);
      put(F.p, L, false);
      // the squint: nearly blind, a slit of dim gold
      const ex = hx + 1.6 * u, ey = hy - 1 * u;
      if (hurt) F.p.line(ex - 0.6 * u, ey - 0.4 * u, ex + 1 * u, ey + 0.4 * u, fur[4]);
      else { eyeGlow(F, ex - 0.4 * u, ey, Math.max(2, R(1.2 * u)), Math.max(1, R(0.5 * u)), wind || strike ? '#f8b848' : '#c99a3a'); F.p.line(ex - 1 * u, ey - 0.8 * u, ex + 1.2 * u, ey - 0.3 * u, fur[0]); }
      // the lanterns' glass: warm light, the weak points (they gutter when it is hurt)
      lamps.forEach((lc, k) => {
        const flick = hurt ? 0 : (idle ? P.i + k : 0) % 3 === 0 ? 1 : 0;
        glow(F, lc[0], lc[1] + 0.4 * u, 0.85 * u, hurt ? '#c2401c' : '#f8b848', { core: flick ? '#fff4dc' : '#fff0b0', halo: !hurt });
      });
      F.mouth = [nb[0] + dl, nb[1]];
    },
  },
};
