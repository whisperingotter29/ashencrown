// Monster kit: the drawing toolkit and frame builder for the hand-built monster designs.
//
// A design is a plain object (see docs/BESTIARY.md and the regional files next to this one):
//
//   my_monster: {
//     view: 'side',            // 'side' (faces right, mirrored by the actor) or 'front' (never mirrored)
//     box: [26, 22],           // body extents in design units (1 unit = u px; u = size * ART * scale).
//                              // The hero stands 25 units tall at size 1; a regular size-1 mob is
//                              // about 14-28 units tall. Leave a few units of margin for swings.
//     scale: 1,                // multiplies u (shrink a design drawn with big numbers)
//     pivot: 0.5,              // where the feet sit across the box (0 = left edge, 1 = right edge)
//     idle: 4, run: 4,         // frame counts (defaults 4 / 4); atk is always [wind-up, strike], hurt one frame
//     fly: 0,                  // frames of a flying loop (dragons), 0 = none
//     idleFps: 3,              // idle loop speed (default 2.5)
//     hover: false,            // floats: the actor bobs it and drops it on death
//     fall: true,              // topples over on death (default: true unless hover)
//     flap: 0,                 // > 0: always plays the run loop at this fps (wing-beaters)
//     draw(F, o, pose) { ... } // paints one frame into F.p (colour) and F.e (emissive glow)
//   }
//
// draw() gets
//   F    = { p, e, u, s, ox, oy, W, H, gy }  p/e: Pix buffers; (ox, oy) the pivot = ground point under
//          the body; gy = oy (the ground line). Put F.mouth = [x, y] (buffer pixels) where spit, bolts
//          and breath come out, on any frame.
//   o    = { s, c1, c2, c3, ... } the enemy template's three colours (body, accent, glow), already
//          snapped to the palette. Designs mostly use their own fixed ramps but may tint from these.
//   pose = { act: 'idle' | 'run' | 'atk' | 'hurt' | 'fly', i, n, t, atk, hurt }
//          t is the loop phase 0..1 (i / n). atk: 1 = wind-up, 2 = strike. hurt: true on the hit frame.
//
// Coordinates: x right, y down, in buffer pixels. Work in design units times F.u and round late.
// Drawing model (the same as the stock creatures in creatures.js):
//   - Paint a part flat into its own layer (layer(F)), shade it (tube / blob shade themselves; flat
//     shapes go through cyl()), then put(F.p, layer) composites it with a 1-px inner contour so near
//     parts read in front of far ones. Far parts first.
//   - Glowing pixels go into F.e as well as F.p (glow(), flame(), eyeGlow() do both).
//   - finish() outlines the whole silhouette in INK and crops; the builder calls it for you.
// Style rules: docs/ART_STYLE.md (top-left light, 3-4 flat tone bands, clusters not noise, ink outline,
// hue-shifted ramps, glows only for magic / eyes / fire).
import { Pix, C, light, dark, mixc, hash2, srand, ART, ap, OUTLINE, CREAM, bayer } from '../../pix.js';
import { RAMPS as PAL, INK, CREAM_HI } from '../../palette.js';
import { mk, blank, ramp5, balls, ball, put, cyl, finish, lowY, topY, underside, fillGaps, clipOut, carve, spike, furN, clump, scaleN, LX, LY, LZ, tone as toneOf, EYE_DARK, BONE, BONE_D, MAW, MAW_D, TONGUE, WHITE, VOID } from '../draw.js';

export { Pix, C, light, dark, mixc, hash2, srand, ART, ap, OUTLINE, CREAM, CREAM_HI, INK, PAL, bayer };
export { mk, blank, ramp5, balls, ball, put, cyl, finish, lowY, topY, underside, fillGaps, clipOut, carve, spike, furN, clump, scaleN, EYE_DARK, BONE, BONE_D, MAW, MAW_D, TONGUE, WHITE, VOID };

const TAU = Math.PI * 2;
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const R = Math.round;
export const sin = (t) => Math.sin(t * TAU);      // one cycle per unit of t
export const cos = (t) => Math.cos(t * TAU);

// ------------------------------------------------------------------ colours
// 5-tone ramp (deep, shadow, mid, base, light) from a base colour, or from a palette ramp name and
// index: ramp('#8a3434') or ramp('red', 3).
export function ramp(base, i) {
  if (typeof base === 'string' && PAL[base]) { const r = PAL[base]; base = r[clamp(i ?? Math.floor(r.length / 2), 0, r.length - 1)]; }
  return ramp5(base);
}
// a ramp straight from a palette ramp, picking 5 consecutive steps ending at index top
export function pal5(name, top) {
  const r = PAL[name];
  top = clamp(top ?? r.length - 1, 4, r.length - 1);
  return r.slice(top - 4, top + 1).map((h) => C(h));
}
export const glowC = (c, k = 1.35) => light(C(c), k);

// ------------------------------------------------------------------ layers
// a blank layer the size of the frame
export const layer = (F) => blank(F.p);

// ------------------------------------------------------------------ paths
// points along a quadratic (3 pts) or cubic (4 pts) bezier, or a polyline (any other count)
export function bez(pts, n = 16) {
  if (pts.length === 3 || pts.length === 4) {
    const out = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n, m = 1 - t;
      if (pts.length === 3) out.push([m * m * pts[0][0] + 2 * m * t * pts[1][0] + t * t * pts[2][0], m * m * pts[0][1] + 2 * m * t * pts[1][1] + t * t * pts[2][1]]);
      else out.push([m * m * m * pts[0][0] + 3 * m * m * t * pts[1][0] + 3 * m * t * t * pts[2][0] + t * t * t * pts[3][0], m * m * m * pts[0][1] + 3 * m * m * t * pts[1][1] + 3 * m * t * t * pts[2][1] + t * t * t * pts[3][1]]);
    }
    return out;
  }
  return pts;
}
// two-bone IK: the joint between root a and end b for bone lengths l1, l2. bend = 1 bends the joint
// to the right of the a->b direction (a knee pointing forward for a leg drawn top to bottom facing
// right uses bend = -1), -1 to the left.
export function ik(a, b, l1, l2, bend = 1) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  let d = Math.hypot(dx, dy) || 0.001;
  const dd = Math.min(d, l1 + l2 - 0.01);
  const ca = clamp((l1 * l1 + dd * dd - l2 * l2) / (2 * l1 * dd), -1, 1);
  const ang = Math.atan2(dy, dx) + bend * Math.acos(ca);
  return [a[0] + Math.cos(ang) * l1, a[1] + Math.sin(ang) * l1];
}
// a walk cycle foot offset: phase t 0..1 -> [dx, lift] for a stride of len and a step height
export function stride(t, len, lift) {
  t = ((t % 1) + 1) % 1;
  return [Math.cos(t * TAU) * len * 0.5, Math.max(0, Math.sin(t * TAU)) * lift];
}
export const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

// ------------------------------------------------------------------ shaded forms
// light value -> tone index (0 deep .. 4 light): the same bands as the stock creatures
export const toneIdx = toneOf;

// A tapered tube along a path, lit as a real cylinder from the top-left (limbs, tails, tentacles,
// horns, necks, roots, worm bodies). pts: path points (use bez() for curves); r: radius, either a
// number, [r0, r1] (tapers along the path) or a function of t 0..1.
// o: { lift, rings: spacing px (dark grooves across the tube, worms / insect legs), ringC, matte,
//      tex: seed (clumped texture), fur: seed, scales: true, cap: false (flat ends), clipY }
export function tube(L, pts, r, Rm, o = {}) {
  const rf = typeof r === 'function' ? r : Array.isArray(r) ? (t) => lerp(r[0], r[1], t) : () => r;
  // resample to ~0.5 px steps
  const seg = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); total += l; }
  const S = [];
  if (pts.length === 1 || total < 0.01) S.push([pts[0][0], pts[0][1], rf(0), 0]);
  else {
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const n = Math.max(1, Math.ceil(seg[i - 1] * 2));
      for (let k = i === 1 ? 0 : 1; k <= n; k++) {
        const f = k / n, d = acc + seg[i - 1] * f, t = d / total;
        S.push([lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f), rf(t), d]);
      }
      acc += seg[i - 1];
    }
  }
  const w = L.w, best = new Float32Array(w * L.h).fill(2), NX = new Float32Array(w * L.h), NY = new Float32Array(w * L.h), DD = new Float32Array(w * L.h);
  const touched = [];
  for (let si = 0; si < S.length; si++) {
    const [sx, sy, rr0, d] = S[si];
    const rr = Math.max(0.55, rr0);
    // flat ends: skip the end caps beyond the path
    for (let y = Math.floor(sy - rr - 1); y <= Math.ceil(sy + rr + 1); y++) {
      if (y < 0 || y >= L.h || (o.clipY !== undefined && y > o.clipY)) continue;
      for (let x = Math.floor(sx - rr - 1); x <= Math.ceil(sx + rr + 1); x++) {
        if (x < 0 || x >= w) continue;
        const nx = (x + 0.5 - sx) / rr, ny = (y + 0.5 - sy) / rr, q = nx * nx + ny * ny;
        if (q > 1) continue;
        const i = y * w + x;
        if (best[i] === 2) touched.push(i);
        if (q < best[i]) { best[i] = q; NX[i] = nx; NY[i] = ny; DD[i] = d; }
      }
    }
  }
  const rc = o.ringC ? C(o.ringC) : null;
  for (const i of touched) {
    const x = i % w, y = (i / w) | 0, q = best[i];
    let l = NX[i] * LX + NY[i] * LY + Math.sqrt(Math.max(0, 1 - q)) * LZ + (o.lift || 0);
    if (o.fur) l += furN(x, y, o.fur) * 0.25;
    else if (o.tex) l += clump(x, y, o.tex) * 0.22;
    if (o.scales) l += scaleN(x, y);
    let t = toneIdx(l);
    if (t === 4 && o.matte) t = 3;
    let c = Rm[t];
    if (o.rings && (DD[i] % o.rings) < 1 && q < 0.92) c = rc || Rm[Math.max(0, t - 2)];
    L.set(x, y, c);
  }
  return L;
}
// a single horn / tusk / claw / spine: a tube tapering from w at the root to a point, along a
// quadratic curve root -> ctrl -> tip
export function horn(L, root, ctrl, tip, w, Rm, o = {}) {
  return tube(L, bez([root, ctrl, tip], 18), (t) => Math.max(0.5, w * 0.5 * (1 - t) ** (o.pow ?? 0.9)), Rm, o);
}

// Union of ellipses lit as one form (bodies, heads, bellies, caps). list: [[cx, cy, rx, ry], ...]
// o: { lift, fur, tex, scales, matte, clipY }
export const blob = (L, list, Rm, o) => balls(L, list.map((b) => b.slice()), Rm, o);

// Flat polygon shaded as a lit slab (cyl: light top-left edge, dark bottom-right edge).
// o: { wide: two-px shadow band, lit: false (no light edge), c: fill colour (default Rm[3]) }
export function slab(L, pts, Rm, o = {}) {
  const T = blank(L);
  T.poly(pts, o.c ? C(o.c) : Rm[3]);
  cyl(T, Rm, o);
  return put(L, T, false);
}
// Flat polygon in one colour (facets of crystals, armour planes, shadows inside a part)
export function facet(L, pts, c) { L.poly(pts, C(c)); return L; }
// A crystal / shard / blade: lit left facet, shadowed right facet, a bright ridge; base at (x, y),
// pointing at angle a (radians, 0 = right, -PI/2 = up), length len, half-width w
export function shard(L, x, y, a, len, w, Rm, o = {}) {
  const ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca;
  const tip = [x + ca * len, y + sa * len], l = [x + px * w, y + py * w], r = [x - px * w, y - py * w];
  const mid = [x + ca * len * 0.18, y + sa * len * 0.18];
  // which side faces the light (top-left)
  const litLeft = px * LX + py * LY > 0;
  facet(L, [l, tip, mid], litLeft ? Rm[4] : Rm[2]);
  facet(L, [r, tip, mid], litLeft ? Rm[2] : Rm[4]);
  L.line(mid[0], mid[1], tip[0], tip[1], o.ridge ? C(o.ridge) : Rm[3]);
  if (o.e) { o.e.poly([l, tip, r], o.glow ? C(o.glow) : Rm[3]); }
  return L;
}

// ------------------------------------------------------------------ cloth, wings, fins
// Hanging cloth / robe / shroud: top edge centred at (cx, top) wTop wide, widening to wBot at the
// hem h below. The hem is scalloped (o.wave px, o.phase 0..1, o.teeth count) and can be ragged.
// o: { folds: count of vertical fold lines, trim: hem colour, ragged: true, lean: px the hem
//      trails behind (positive = to the left), alpha }
export function drape(L, cx, top, wTop, wBot, h, Rm, o = {}) {
  const T = blank(L);
  const teeth = o.teeth ?? Math.max(3, R(wBot / 3)), amp = o.wave ?? Math.max(1, h * 0.06), ph = o.phase || 0;
  const lean = o.lean || 0;
  const pts = [[cx - wTop / 2, top], [cx + wTop / 2, top]];
  const N = Math.max(8, R(wBot));
  for (let k = 0; k <= N; k++) {
    const f = 1 - k / N, x = cx - lean + (f - 0.5) * wBot;
    let y = top + h + Math.sin((f * teeth + ph) * TAU) * amp;
    if (o.ragged) y += (hash2(k, 7, o.seed || 3) - 0.5) * amp * 2.4;
    pts.push([x, y]);
  }
  T.poly(pts, Rm[3]);
  // vertical folds: a light and a dark streak pair
  const folds = o.folds ?? Math.max(1, R(wBot / 7));
  for (let k = 1; k <= folds; k++) {
    const f = k / (folds + 1);
    const x0 = cx + (f - 0.5) * wTop * 0.8, x1 = cx - lean + (f - 0.5) * wBot * 0.92;
    const y0 = top + h * 0.25, y1 = top + h + 2;
    for (let s = 0; s <= 1; s += 1 / Math.max(4, h)) {
      const x = R(lerp(x0, x1, s)), y = R(lerp(y0, y1, s));
      if (T.a(x, y)) T.set(x, y, Rm[2]);
      if (T.a(x - 1, y) && s > 0.2) T.set(x - 1, y, Rm[4]);
    }
  }
  cyl(T, Rm, { wide: wBot > 10 });
  if (o.trim) { const tc = C(o.trim); for (let x = 0; x < T.w; x++) { const y = lowY(T, x); if (y >= 0 && y > top + h * 0.5) { T.set(x, y, tc); } } }
  if (o.alpha !== undefined) for (let i = 3; i < T.d.length; i += 4) if (T.d[i]) T.d[i] = Math.round(T.d[i] * o.alpha);
  return put(L, T, false);
}

// A wing from the shoulder at (x, y).
//   a       direction of the arm / leading edge (radians: 0 = right, -PI/2 = up, -2.4 = up and back
//           for a right-facing creature)
//   len     reach from the shoulder to the farthest tip
//   spread  fan angle from the leading edge to the last finger / feather; its sign picks the side
//           the membrane hangs on (for a right-facing creature with a raised wing use a negative
//           spread when a points up-right, positive when a points up-left; try both)
//   kind    'bat' (arm, thumb claw, finger bones, scalloped membrane), 'feather' (a fan of separate
//           tapered feathers with coverts), 'insect' (two translucent veined lobes), 'fin' (spines
//           with shallow webbing)
//   o       { bone: ramp for bones / quills, n: fingers or feathers, alpha (insect), e: Pix for
//           glowing insect wings, claw: false }
export function wing(L, x, y, a, len, spread, Rm, kind = 'bat', o = {}) {
  const n = o.n ?? (kind === 'feather' ? 7 : kind === 'insect' ? 2 : 4);
  const sg = Math.sign(spread) || 1;
  if (kind === 'bat' || kind === 'fin') {
    const B = o.bone || Rm.map((c) => light(c, 1.22));
    const elbow = [x + Math.cos(a - sg * 0.35) * len * 0.26, y + Math.sin(a - sg * 0.35) * len * 0.26];
    const wrist = [elbow[0] + Math.cos(a + sg * 0.1) * len * 0.3, elbow[1] + Math.sin(a + sg * 0.1) * len * 0.3];
    const tips = [];
    for (let k = 0; k < n; k++) {
      const f = n === 1 ? 0 : k / (n - 1), aa = a + sg * 0.12 + (spread - sg * 0.12) * f, l = len * lerp(0.56, 0.36, f);
      tips.push([wrist[0] + Math.cos(aa) * l, wrist[1] + Math.sin(aa) * l]);
    }
    const back = [x + Math.cos(a + spread * 1.15) * len * 0.34, y + Math.sin(a + spread * 1.15) * len * 0.34];
    const T = blank(L);
    const mem = [[x, y], elbow, wrist, tips[0]];
    const pull = kind === 'fin' ? 0.05 : 0.2;
    for (let k = 1; k < n; k++) {
      const p0 = tips[k - 1], p1 = tips[k], m = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
      mem.push([lerp(m[0], wrist[0], pull), lerp(m[1], wrist[1], pull)], p1);
    }
    const last = tips[n - 1], m2 = [(last[0] + back[0]) / 2, (last[1] + back[1]) / 2];
    mem.push([lerp(m2[0], wrist[0], pull * 0.6), lerp(m2[1], wrist[1], pull * 0.6)], back);
    T.poly(mem, Rm[2]);
    // the membrane is lit near the arm and darkens toward the trailing edge
    for (let yy = 0; yy < T.h; yy++) for (let xx = 0; xx < T.w; xx++) {
      if (!T.a(xx, yy)) continue;
      const d = Math.hypot(xx + 0.5 - wrist[0], yy + 0.5 - wrist[1]) / (len * 0.5);
      if (d < 0.35) T.set(xx, yy, Rm[3]);
    }
    cyl(T, Rm, { lit: false });
    put(L, T, false);
    const bw = Math.max(0.6, len / 22);
    tube(L, [[x, y], elbow, wrist], [bw * 1.7, bw * 1.2], B);
    for (const t of tips) tube(L, [wrist, t], [bw, bw * 0.5], B);
    if (kind === 'bat' && o.claw !== false) horn(L, wrist, [wrist[0] + Math.cos(a - sg * 0.7) * len * 0.06, wrist[1] + Math.sin(a - sg * 0.7) * len * 0.06], [wrist[0] + Math.cos(a - sg * 1.1) * len * 0.12, wrist[1] + Math.sin(a - sg * 1.1) * len * 0.12], bw * 1.8, ramp(CREAM));
    return L;
  }
  if (kind === 'feather') {
    const arm = [x + Math.cos(a) * len * 0.55, y + Math.sin(a) * len * 0.55];
    const fw = Math.max(1.2, len / 6.5);
    const Rd = Rm.map((c) => dark(c, 0.85));
    // primaries: roots spread along the arm from its tip back to the shoulder, each feather angled
    // further round the fan, drawn back to front so the outer ones overlap the inner ones
    for (let k = n - 1; k >= 0; k--) {
      const f = n === 1 ? 0 : k / (n - 1);
      const bx = lerp(arm[0], x, f * 0.85), by = lerp(arm[1], y, f * 0.85);
      const aa = a + sg * 0.15 + (spread - sg * 0.15) * f, fl = len * lerp(0.62, 0.4, f);
      const tip = [bx + Math.cos(aa) * fl, by + Math.sin(aa) * fl];
      const F2 = blank(L);
      tube(F2, [[bx, by], tip], (t) => fw * 0.5 * (t < 0.6 ? 1 : Math.max(0.25, (1 - t) / 0.4)), k % 2 ? Rd : Rm, { matte: true });
      F2.line(bx, by, lerp(bx, tip[0], 0.8), lerp(by, tip[1], 0.8), Rm[1]);
      put(L, F2, true);
    }
    // coverts: a scalloped band along the arm
    const C2 = blank(L);
    for (let k = 0; k <= 4; k++) { const f = k / 4, cx = lerp(x, arm[0], f), cy = lerp(y, arm[1], f); C2.ellipse(cx + Math.cos(a + sg * 1.5) * fw * 0.45, cy + Math.sin(a + sg * 1.5) * fw * 0.45, fw * 0.55, fw * 0.55, Rm[3]); }
    cyl(C2, Rm);
    put(L, C2, true);
    tube(L, [[x, y], arm], [fw * 0.42, fw * 0.28], Rm, { matte: true });
    return L;
  }
  // insect: translucent lobes with veins
  const al = o.alpha ?? 150;
  for (let k = 0; k < n; k++) {
    const aa = a + spread * k, l = len * (k ? 0.72 : 1);
    const cx = x + Math.cos(aa) * l * 0.5, cy = y + Math.sin(aa) * l * 0.5;
    const W2 = blank(L);
    for (let yy = Math.floor(cy - l); yy <= cy + l; yy++) for (let xx = Math.floor(cx - l); xx <= cx + l; xx++) {
      const dx = xx + 0.5 - cx, dy = yy + 0.5 - cy;
      const [ux, uy] = rot(dx, dy, -aa);
      if ((ux / (l * 0.5)) ** 2 + (uy / (l * 0.2)) ** 2 <= 1) W2.set(xx, yy, [...Rm[uy < 0 ? 4 : 3].slice(0, 3), al]);
    }
    const vein = Rm[1];
    W2.line(x, y, x + Math.cos(aa) * l * 0.95, y + Math.sin(aa) * l * 0.95, vein);
    for (let v = 1; v <= 3; v++) { const f = v / 4, bx = x + Math.cos(aa) * l * f, by = y + Math.sin(aa) * l * f; W2.line(bx, by, bx + Math.cos(aa + 0.6) * l * 0.18, by + Math.sin(aa + 0.6) * l * 0.18, vein); }
    if (o.e) for (let i = 0; i < W2.d.length; i += 4) if (W2.d[i + 3] === 255) o.e.set((i >> 2) % W2.w, ((i >> 2) / W2.w) | 0, glowC(Rm[3]));
    put(L, W2, false);
  }
  return L;
}

// ------------------------------------------------------------------ faces
// A glowing eye: w x h block of colour c with a light corner, into both p and e (hostile eyes)
export function eyeGlow(F, x, y, w, h, c, o = {}) {
  x = R(x); y = R(y); w = Math.max(1, R(w)); h = Math.max(1, R(h));
  const cc = C(c), hi = light(cc, 1.4), dk = dark(cc, 0.7);
  for (const L of [F.p, F.e]) {
    if (w >= 3 && h >= 3) L.rrect(x, y, w, h, cc, 1); else L.rect(x, y, w, h, cc);
    L.set(x + (o.left ? 0 : w - 1), y, hi);
    if (w >= 3 && h >= 3) L.rect(x + 1, y + 1, Math.max(1, w >> 1), Math.max(1, h >> 1), hi);
  }
  if (o.pupil && w >= 3) F.p.rect(x + (o.left ? 0 : w - 2), y + h - 2, 1, 2, dk);
  if (o.brow) F.p.line(x - 1, y - 1, x + w, y - 1 + (o.brow > 0 ? -1 : 1), C(o.brow === true ? INK : o.brow));
  return F;
}
// a dark bead eye with a cream glint (tame, beastly or comical)
export function eyeBead(L, x, y, n = 2) {
  x = R(x); y = R(y);
  if (n <= 1) { L.set(x, y, EYE_DARK); L.set(x, y - 1, WHITE); return L; }
  L.rect(x, y, n, n, EYE_DARK); L.set(x + n - 1, y, WHITE);
  return L;
}
// a big round eye: sclera, iris colour c (glowing into e), slit or round pupil, lid
export function eyeBall(F, x, y, r, c, o = {}) {
  const p = F.p;
  p.disc(x, y, r, C(o.sclera || '#f3e1b5'));
  if (r >= 2.5) p.ring(x, y, r, C('#cfa978'), 1);
  const ir = r * (o.iris ?? 0.62), lx = x + (o.look?.[0] || 0) * r * 0.3, ly = y + (o.look?.[1] || 0) * r * 0.3;
  p.disc(lx, ly, ir, C(c)); F.e.disc(lx, ly, ir, C(c));
  if (ir >= 2.5) { p.ring(lx, ly, ir, dark(c, 0.6), 1); }
  if (o.slit) p.rect(R(lx - 0.5), R(ly - ir * 0.8), Math.max(1, R(ir * 0.35)), Math.max(2, R(ir * 1.6)), VOID);
  else p.disc(lx, ly, Math.max(0.6, ir * 0.42), VOID);
  p.set(R(lx - ir * 0.45), R(ly - ir * 0.45), WHITE);
  if (o.lid) { const lc = C(o.lid); for (let xx = Math.floor(x - r); xx <= x + r; xx++) for (let yy = Math.floor(y - r); yy <= y - r + r * 2 * o.lidAmt; yy++) if ((xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2 <= r * r) p.set(xx, yy, lc); }
  return F;
}
// a row of fangs along the line a -> b, pointing down (dir 1) or up (dir -1)
export function teeth(L, a, b, n, len, dir = 1, c = BONE) {
  for (let k = 0; k < n; k++) {
    const f = (k + 0.5) / n, x = lerp(a[0], b[0], f), y = lerp(a[1], b[1], f), w = Math.max(1, Math.abs(b[0] - a[0]) / n * 0.8);
    L.poly([[x - w / 2, y], [x + w / 2, y], [x, y + dir * len]], C(c));
    if (len >= 2) L.set(R(x - w / 2), R(y), BONE_D);
  }
  return L;
}
// an open maw: dark ellipse, tongue, and fangs top and bottom
export function maw(L, cx, cy, rx, ry, o = {}) {
  L.ellipse(cx, cy, rx, ry, MAW_D);
  L.ellipse(cx, cy + ry * 0.45, rx * 0.65, ry * 0.4, o.tongue ? C(o.tongue) : TONGUE);
  const n = o.teeth ?? Math.max(2, R(rx / 1.5));
  if (n) { teeth(L, [cx - rx * 0.85, cy - ry * 0.85], [cx + rx * 0.85, cy - ry * 0.85], n, Math.max(1, ry * 0.5), 1); teeth(L, [cx - rx * 0.7, cy + ry * 0.9], [cx + rx * 0.7, cy + ry * 0.9], Math.max(1, n - 1), Math.max(1, ry * 0.4), -1); }
  return L;
}

// ------------------------------------------------------------------ light, fire, magic
// a glowing orb with stepped rings (lanterns, cores, lures); into p and e
export function glow(F, x, y, r, c, o = {}) {
  const cc = C(c), hi = light(cc, 1.35), core = C(o.core || '#fff4dc');
  for (const L of [F.p, F.e]) {
    L.disc(x, y, r, cc);
    if (r >= 2) L.disc(x - r * 0.15, y - r * 0.15, r * 0.62, hi);
    if (r >= 3.5) L.disc(x - r * 0.25, y - r * 0.25, r * 0.28, core);
  }
  if (o.halo) for (let yy = Math.floor(y - r * 2); yy <= y + r * 2; yy++) for (let xx = Math.floor(x - r * 2); xx <= x + r * 2; xx++) {
    const d = Math.hypot(xx + 0.5 - x, yy + 0.5 - y);
    if (d > r && d < r * 1.9 && bayer(xx, yy) < (1 - (d - r) / (r * 0.9)) * 0.45) F.e.set(xx, yy, [...cc.slice(0, 3), 140]);
  }
  return F;
}
// A flame tongue standing on (x, y), h tall and w wide; t 0..1 animates the flicker.
// Uses the ember ramp unless o.ramp (5+ colours dark -> light) is given. Into p and e.
export function flame(F, x, y, h, w, t = 0, o = {}) {
  const rp = (o.ramp || PAL.ember).map((c) => C(c));
  const bands = [[1, rp[2]], [0.72, rp[3]], [0.48, rp[4]], [0.24, rp[Math.min(5, rp.length - 1)]]];
  for (const [k, col] of bands) {
    const hh = h * (0.55 + 0.45 * k), ww = w * k;
    for (let yy = Math.floor(y - hh); yy <= y; yy++) {
      const f = (y - yy) / hh;                          // 0 at the base, 1 at the tip
      const sway = Math.sin((f * 1.6 + t) * TAU) * w * 0.18 * f;
      const half = ww * 0.5 * Math.sqrt(Math.max(0, 1 - f)) * (f < 0.15 ? 0.7 + f * 2 : 1);
      for (let xx = Math.floor(x + sway - half); xx <= x + sway + half; xx++) { F.p.set(xx, yy, col); F.e.set(xx, yy, col); }
    }
  }
  // a loose ember above
  const ex = R(x + Math.sin(t * TAU) * w * 0.3), ey = R(y - h * (1.05 + ((t * 2) % 1) * 0.25));
  F.p.set(ex, ey, rp[4]); F.e.set(ex, ey, rp[4]);
  return F;
}
// emissive glyph / rune: a tiny random stroke figure of size n px at (x, y)
export function rune(F, x, y, n, c, seed = 1) {
  const cc = C(c), r = srand(seed * 977 + 13);
  x = R(x); y = R(y);
  const pts = [[0, 0], [n, 0], [0, n], [n, n], [n >> 1, 0], [n >> 1, n], [0, n >> 1], [n, n >> 1]];
  for (let k = 0; k < 3; k++) {
    const a = pts[Math.floor(r() * pts.length)], b = pts[Math.floor(r() * pts.length)];
    F.p.line(x + a[0], y + a[1], x + b[0], y + b[1], cc); F.e.line(x + a[0], y + a[1], x + b[0], y + b[1], cc);
  }
  return F;
}
// a jagged crack from (x, y) heading at angle a for len px; glowing when F is passed for e
export function crack(L, x, y, a, len, c, seed = 1, e = null) {
  const r = srand(seed * 131 + 7), cc = C(c);
  let px = x, py = y;
  for (let k = 0; k < len; k += 2) {
    a += (r() - 0.5) * 1.1;
    const nx = px + Math.cos(a) * 2, ny = py + Math.sin(a) * 2;
    L.line(px, py, nx, ny, cc); if (e) e.line(px, py, nx, ny, cc);
    if (r() < 0.18) { const ba = a + (r() < 0.5 ? 0.9 : -0.9); L.line(nx, ny, nx + Math.cos(ba) * 2.5, ny + Math.sin(ba) * 2.5, cc); if (e) e.line(nx, ny, nx + Math.cos(ba) * 2.5, ny + Math.sin(ba) * 2.5, cc); }
    px = nx; py = ny;
  }
  return L;
}

// ------------------------------------------------------------------ surface detail
// paint only over pixels that already exist
export function over(L, x, y, c) { if (L.a(R(x), R(y)) > 100) L.set(R(x), R(y), C(c)); return L; }
// clustered spots / blotches inside an ellipse region, only over existing pixels
export function spots(L, cx, cy, rx, ry, n, size, c, seed = 1) {
  const r = srand(seed * 71 + 5), cc = C(c);
  for (let k = 0; k < n; k++) {
    const a = r() * TAU, d = Math.sqrt(r());
    const x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d, s = Math.max(0.6, size * (0.6 + r() * 0.6));
    for (let yy = Math.floor(y - s); yy <= y + s; yy++) for (let xx = Math.floor(x - s); xx <= x + s; xx++) if ((xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2 <= s * s) over(L, xx, yy, cc);
  }
  return L;
}
// stripes across a region: every `gap` px along direction a, a band `w` px wide (over existing)
export function stripes(L, x0, y0, x1, y1, a, gap, w, c) {
  const cc = C(c), ca = Math.cos(a), sa = Math.sin(a);
  for (let y = Math.floor(y0); y <= y1; y++) for (let x = Math.floor(x0); x <= x1; x++) {
    const d = ((x * ca + y * sa) % gap + gap) % gap;
    if (d < w) over(L, x, y, cc);
  }
  return L;
}
// rim: a 1-px light line along the top-left edge of everything in L (separates a part from a dark
// background), and optionally a dark line along the bottom-right edge
export function rimLight(L, c, dk = null) {
  const cc = C(c), dc = dk ? C(dk) : null, w = L.w, h = L.h;
  const A = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) A[i] = L.d[i * 4 + 3] > 100 ? 1 : 0;
  const a = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : A[y * w + x]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!A[y * w + x]) continue;
    if (!a(x - 1, y) || !a(x, y - 1)) L.set(x, y, cc);
    else if (dc && (!a(x + 1, y) || !a(x, y + 1))) L.set(x, y, dc);
  }
  return L;
}
// tint a whole layer toward c by k (hurt flash variations, frost, petrified parts)
export function tint(L, c, k) {
  const cc = C(c);
  for (let i = 0; i < L.d.length; i += 4) if (L.d[i + 3]) { L.d[i] = lerp(L.d[i], cc[0], k); L.d[i + 1] = lerp(L.d[i + 1], cc[1], k); L.d[i + 2] = lerp(L.d[i + 2], cc[2], k); }
  return L;
}
// a ground shadow is drawn by the engine: never paint one into the sprite.

// ------------------------------------------------------------------ frame sets
const POSES = (d) => {
  const idle = d.idle ?? 4, run = d.run ?? 4, fly = d.fly ?? 0;
  const out = { idle: [], run: [], atk: [], hurt: [] };
  for (let i = 0; i < idle; i++) out.idle.push({ act: 'idle', i, n: idle, t: i / idle, atk: 0, hurt: false });
  for (let i = 0; i < run; i++) out.run.push({ act: 'run', i, n: run, t: i / run, atk: 0, hurt: false });
  out.atk.push({ act: 'atk', i: 0, n: 2, t: 0, atk: 1, hurt: false }, { act: 'atk', i: 1, n: 2, t: 0.5, atk: 2, hurt: false });
  out.hurt.push({ act: 'hurt', i: 0, n: 1, t: 0, atk: 0, hurt: true });
  if (fly) { out.fly = []; for (let i = 0; i < fly; i++) out.fly.push({ act: 'fly', i, n: fly, t: i / fly, atk: 0, hurt: false }); }
  return out;
};

// Build the actor sprite set for a design: { views, sideOnly, frontOnly, height, mouth, hover, fall, flapFps, idleFps, segs? }
export function buildDesign(d, o) {
  const u = o.s * ART * (d.scale ?? 1);
  const W = R(d.box[0] * u) + ap(18), H = R(d.box[1] * u) + ap(16);
  const ox = R(ap(9) + d.box[0] * u * (d.pivot ?? 0.5)), oy = H - ap(4);
  let mouth = null;
  const frame = (pose) => {
    const p = mk(W, H, ox, oy);
    const F = { p, e: blank(p), u, s: o.s, ox, oy, W, H, gy: oy, mouth: null };
    d.draw(F, o, pose);
    if (F.mouth && !mouth) mouth = [R(F.mouth[0] - ox), R(F.mouth[1] - oy)];
    return finish(F.p, F.e);
  };
  const P = POSES(d), V = {};
  for (const k of Object.keys(P)) V[k] = P[k].map(frame);
  const side = (d.view || 'side') === 'side';
  const hover = !!d.hover;
  // height above the ground line, measured on the first idle frame
  const f0 = V.idle[0].pix;
  const out = {
    views: side ? { side: V } : { down: V },
    sideOnly: side, frontOnly: !side,
    height: Math.max(ap(8), f0.oy - (hover ? R(d.hoverPx ?? 0) : 0)),
    mouth: mouth || [0, -R(f0.oy * 0.6)],
    hover, fall: d.fall ?? !hover, flapFps: d.flap || 0, idleFps: d.idleFps ?? 2.5,
  };
  // serpents: body segments behind the head, drawn by d.seg(F, o, i, r) for i = 0..13
  if (d.seg) {
    const N = 14, r0 = (d.segR ?? 4) * u;
    out.segs = [];
    for (let i = 0; i < N; i++) {
      const r = Math.max(ap(1.6), r0 * (0.95 - (i / N) * (d.segTaper ?? 0.6)));
      const n = Math.ceil(r * 2.6 + 8);
      const p = mk(n, n, n / 2, n / 2);
      const F = { p, e: blank(p), u, s: o.s, ox: n / 2, oy: n / 2, W: n, H: n, cx: n / 2, cy: n / 2 };
      d.seg(F, o, i, r, N);
      p.outlineSel();
      let em = false;
      for (let k = 3; k < F.e.d.length; k += 4) if (F.e.d[k]) { em = true; break; }
      out.segs.push({ pix: p, emis: em ? F.e : null });
    }
    out.r0 = r0;
  }
  return out;
}
