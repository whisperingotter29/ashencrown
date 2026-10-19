// Hand-built monster designs: the Frostreach. See kit.js for the design format and
// docs/BESTIARY.md for the concepts.
import { C, R, ramp, pal5, layer, put, blob, tube, horn, slab, facet, shard, wing, drape, ik, stride, sin, cos, lerp, clamp, bez, glow, eyeGlow, eyeBead, eyeBall, teeth, maw, crack, spots, over, rimLight, tint, light, dark, mixc, hash2, bayer, cyl, blank, underside, WHITE, VOID, BONE, BONE_D, MAW, MAW_D, TONGUE, EYE_DARK, CREAM } from './kit.js';

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
      const clen = 14 * u, grounded = (h) => Math.asin(clamp((oy - 3 * u - h[1]) / clen, -1, 1));
      let hand, ang;
      if (wind) { hand = U(1.5, -9.5); ang = -2.3; }
      else if (strike) { hand = U(9.5, -2.5); ang = grounded(hand); }
      else if (hurt) { hand = U(7, 0); ang = 1.1; }
      else if (run) { hand = U(6.5, -2 + sin(t) * 0.3); ang = -2.35 + sin(t) * 0.08; }
      else { hand = U(9.2, -3.6 + sin(t) * 0.2); ang = grounded(hand); }
      if (!wind && !run && !hurt) { /* the trunk leans forward onto its root ball */ }
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
      limb(A, sh, hand, 5 * u, 5.4 * u, 2.6 * u, 2.9 * u, 2.4 * u, skin, 1, { tex: 6 });
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
};
