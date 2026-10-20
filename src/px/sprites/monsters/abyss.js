// Hand-built monster designs: the abyss, the last bosses. See kit.js for the design format and
// docs/BESTIARY.md for the concepts.
import { Pix, C, R, PAL, pal5, ramp, layer, put, blob, tube, cyl, bez, ik, stride, sin, cos, lerp, clamp, glow, flame, eyeGlow, teeth, spots, over, rimLight, tint, light, dark, mixc, hash2, srand, bayer, facet, shard, lowY, carve, WHITE, VOID, BONE, BONE_D, MAW_D, TONGUE } from './kit.js';

// ------------------------------------------------------------------ local helpers
// The bosses here are drawn big (up to ~300 px frames), so tubes and slabs are painted into a
// cropped scratch layer around the part and pasted back, instead of a full-frame buffer each.
function paste(L, T, bx, by) {
  const w = T.w, h = T.h, S = T.d, D = L.d, LW = L.w, LH = L.h;
  for (let y = 0; y < h; y++) {
    const yy = y + by;
    if (yy < 0 || yy >= LH) continue;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, a = S[i + 3];
      if (!a) continue;
      const xx = x + bx;
      if (xx < 0 || xx >= LW) continue;
      if (a === 255) { const j = (yy * LW + xx) * 4; D[j] = S[i]; D[j + 1] = S[i + 1]; D[j + 2] = S[i + 2]; D[j + 3] = 255; }
      else L.set(xx, yy, [S[i], S[i + 1], S[i + 2], a]);
    }
  }
  return L;
}
function box(pts, pad) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  const bx = Math.floor(x0 - pad), by = Math.floor(y0 - pad);
  return [bx, by, Math.ceil(x1 + pad) - bx + 1, Math.ceil(y1 + pad) - by + 1];
}
// tube() in a cropped layer
function tb(L, pts, r, Rm, o = {}) {
  let rm = typeof r === 'number' ? r : Array.isArray(r) ? Math.max(r[0], r[1]) : 0;
  if (typeof r === 'function') for (let k = 0; k <= 12; k++) rm = Math.max(rm, r(k / 12));
  const [bx, by, w, h] = box(pts, rm + 2);
  const T = new Pix(w, h);
  tube(T, pts.map((p) => [p[0] - bx, p[1] - by]), r, Rm, o.clipY !== undefined ? { ...o, clipY: o.clipY - by } : o);
  return paste(L, T, bx, by);
}
// horn() in a cropped layer
const hn = (L, root, ctrl, tip, w, Rm, o = {}) => tb(L, bez([root, ctrl, tip], 18), (t) => Math.max(0.5, w * 0.5 * (1 - t) ** (o.pow ?? 0.9)), Rm, o);
// slab() in a cropped layer: a flat polygon lit as a slab (light top-left edge, dark bottom-right)
function sl(L, pts, Rm, o = {}) {
  const [bx, by, w, h] = box(pts, 2);
  const T = new Pix(w, h);
  T.poly(pts.map((p) => [p[0] - bx, p[1] - by]), o.c ? C(o.c) : Rm[3]);
  cyl(T, Rm, o);
  return paste(L, T, bx, by);
}
// a glowing stroke into both buffers (veins of light, cracks of fire, sound rings): w px thick,
// a hot core line down the middle when wide enough
function glowLine(F, pts, w, c, core) {
  const cc = C(c), co = core ? C(core) : null;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    for (const L of [F.p, F.e]) { L.line(x0, y0, x1, y1, cc, w); if (co && w >= 2) L.line(x0, y0, x1, y1, co, 1); }
  }
}
// a jagged branching path (veins, lightning-like seams): from (x, y) heading a, len px, seeded
function vein(x, y, a, len, seed, wob = 0.7, step = 3) {
  const r = srand(seed * 313 + 11), pts = [[x, y]];
  for (let d = 0; d < len; d += step) { a += (r() - 0.5) * wob; x += Math.cos(a) * step; y += Math.sin(a) * step; pts.push([x, y]); }
  return pts;
}
// emissive pixel into both buffers
const ep = (F, x, y, c) => { F.p.set(R(x), R(y), C(c)); F.e.set(R(x), R(y), C(c)); };
const eRect = (F, x, y, w, h, c) => { F.p.rect(R(x), R(y), Math.max(1, R(w)), Math.max(1, R(h)), C(c)); F.e.rect(R(x), R(y), Math.max(1, R(w)), Math.max(1, R(h)), C(c)); };
const eDisc = (F, x, y, r, c) => { F.p.disc(x, y, r, C(c)); F.e.disc(x, y, r, C(c)); };
// a stepped glowing halo (dithered, emissive only) round (x, y)
function halo(F, x, y, r0, r1, c, a = 0.45) {
  const cc = C(c);
  for (let yy = Math.floor(y - r1); yy <= y + r1; yy++) for (let xx = Math.floor(x - r1); xx <= x + r1; xx++) {
    const d = Math.hypot(xx + 0.5 - x, yy + 0.5 - y);
    if (d > r0 && d < r1 && bayer(xx, yy) < (1 - (d - r0) / (r1 - r0)) * a) F.e.set(xx, yy, [cc[0], cc[1], cc[2], 150]);
  }
}
// a part drawn into its own colour + glow layers; commit() composites it over L and makes its glow
// replace whatever glow sat under it (so a hidden seam never shines through a near part)
const part = (F) => ({ p: layer(F), e: layer(F) });
function commit(F, L, q, contour = true) {
  put(L, q.p, contour);
  const S = q.p.d, E = q.e.d, D = F.e.d;
  for (let i = 0; i < S.length; i += 4) {
    if (S[i + 3] <= 100) continue;
    if (E[i + 3]) { D[i] = E[i]; D[i + 1] = E[i + 1]; D[i + 2] = E[i + 2]; D[i + 3] = E[i + 3]; } else D[i + 3] = 0;
  }
}
// glowing seams over a part, kept inside it: n jagged cracks from seeded points in an ellipse
function seams(q, cx, cy, rx, ry, n, c, core, seed, w = 1, len = 0) {
  const r = srand(seed * 97 + 1);
  for (let k = 0; k < n; k++) {
    const a0 = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.7;
    const x = cx + Math.cos(a0) * rx * d, y = cy + Math.sin(a0) * ry * d;
    const pts = vein(x, y, r() * Math.PI * 2, len || Math.max(rx, ry) * (0.7 + r() * 0.6), seed * 13 + k, 1.1, Math.max(2, Math.min(rx, ry) * 0.3));
    let run = [];
    for (const pt of pts) {
      if (q.p.a(R(pt[0]), R(pt[1])) > 100) run.push(pt);
      else { if (run.length > 1) glowLine(q, run, w, c, core); run = []; }
    }
    if (run.length > 1) glowLine(q, run, w, c, core);
  }
}
const AE = PAL.aether.map((c) => C(c));   // violet -> magenta -> pink-white
const EM = PAL.ember.map((c) => C(c));    // maroon -> orange -> pale yellow

// enemy id -> { design, name, body? }: folded into src/data/enemies.js at integration
export const assign = {
  void_heart: { design: 'void_heart', name: 'The Void Heart' },
  ashen_king: { design: 'ashen_king', name: 'Aurel, the Ashen King' },
  hollow_king: { design: 'hollow_king', name: 'The Hollow King' },
  crown_herald: { design: 'crown_herald', name: 'The Crown Herald' },
  void_herald: { design: 'rift_herald', name: 'Herald of the Rift' },
};

// ================================================================== The Void Heart
// Root: the heart weighed against a feather; the sacred heart. Twist: the heart has no chambers,
// only an eye. A giant anatomical heart, dark as the void, whose front is one great lidded eye; the
// eyelids are heart muscle and blink on every beat. Its severed arteries rise like a crown of open
// pipes that breathe aether, and torn veins trail below it like roots. Coronary veins of aether
// light up with each beat (the weak points).
const voidHeart = {
  view: 'front', box: [30, 36], hover: true, idle: 6, idleFps: 5, scale: 0.9,
  draw(F, o, P) {
    const { u, ox, oy } = F;
    const t = P.t, idle = P.act === 'idle', run = P.act === 'run', w1 = P.atk === 1, w2 = P.atk === 2, hurt = P.hurt;
    const MU = pal5('plum', 4), MUd = MU.map((c) => dark(c, 0.78));
    const VE = pal5('lavender', 5), VEd = VE.map((c) => dark(c, 0.75));
    const SC = ramp(o.c2 || '#e0d0ff');
    // lub-dub: a hard squeeze, a softer one, then rest
    const beat = idle ? [0, 1, 0.45, 0, 0, 0][P.i] : run ? [0, 0.7, 0.2, 0][P.i] : w1 ? -0.7 : w2 ? 1.3 : hurt ? 0.5 : 0;
    const k = 1 - beat * 0.05, U = u * k;
    const sw = idle ? sin(t) : run ? sin(t) * 1.6 : w1 ? -1 : 0;
    const cx = ox + (run ? sin(t) * 0.7 * u : 0) + (hurt ? -1.2 * u : 0);
    const cy = oy - 20 * u + (w1 ? -1.2 * u : w2 ? 0.8 * u : 0) + (idle ? sin(t) * 0.3 * u : 0);
    const hot = beat > 0.4 || w2;
    const vc = hot ? AE[5] : AE[3], vcore = hot ? AE[6] : AE[4];
    const L = layer(F);
    // torn veins trailing below like roots, swaying (behind the body)
    const TT = layer(F);
    for (let j = 0; j < 4; j++) {
      const x0 = cx + (-5.2 + j * 3.4) * U, y0 = cy + (5 + (j === 2 ? 4 : j === 1 ? 2.5 : 1)) * U;
      const ln = (j === 2 ? 9 : j === 1 ? 10 : 7.5) * u, ph = t + j * 0.27;
      const swing = (run ? -2.2 * u : 0) + sin(ph) * 1.1 * u;
      const pts = bez([[x0, y0], [x0 + (j - 1.5) * 1.2 * u + swing * 0.4, y0 + ln * 0.5], [x0 + (j - 1.5) * 0.8 * u + swing, y0 + ln]], 10);
      tb(TT, pts, [1.25 * U, 0.45 * u], j % 2 ? VEd : VE);
      // a drop of aether falling from each torn end
      const end = pts[pts.length - 1], dt = (t * 2 + j * 0.37) % 1;
      if (idle || run) eDisc(F, end[0], end[1] + dt * 2.4 * u + 1.2 * u, Math.max(0.8, 0.45 * u), dt > 0.5 ? AE[3] : AE[4]);
    }
    put(L, TT, false);
    // the vena cava behind, rising on the left
    const BV = layer(F);
    const vcTip = [cx - 6.2 * U + sw * 0.4 * u, cy - 13.2 * U];
    tb(BV, bez([[cx - 4.6 * U, cy - 5 * U], [cx - 5.6 * U, cy - 9 * U], vcTip], 12), [2 * U, 1.6 * U], VEd);
    put(L, BV, false);
    // the heart: two atria over a tapering ventricle whose apex hooks to the right
    const H = layer(F);
    blob(H, [[cx - 4.6 * U, cy - 4.2 * U, 6 * U, 5.4 * U], [cx + 4.2 * U, cy - 4.6 * U, 6.6 * U, 5.6 * U], [cx + 0.4 * U, cy + 1.4 * U, 9.6 * U, 7.4 * U],
      [cx + 2.2 * U, cy + 7.2 * U, 5.4 * U, 5 * U], [cx + 3.4 * U, cy + 10.6 * U, 2.6 * U, 2.6 * U]], hurt ? MU.map((c) => mixc(c, '#f5afd6', 0.25)) : MU, { tex: 5 });
    // the groove between the ventricles and a fat cap on the atria
    for (let s = 0; s <= 1; s += 0.02) {
      const x = lerp(cx + 5.2 * U, cx + 3.6 * U, s) + Math.sin(s * 3) * U, y = lerp(cy - 1.5 * U, cy + 12 * U, s);
      over(H, x, y, MU[0]); over(H, x - 1, y, MU[1]);
    }
    spots(H, cx - 4.4 * U, cy - 7.4 * U, 3 * U, 1.4 * U, 3, 0.7 * U, '#996f76', 3);
    spots(H, cx + 3.4 * U, cy - 8.2 * U, 3.2 * U, 1.2 * U, 3, 0.6 * U, '#996f76', 5);
    put(L, H, true);
    put(F.p, L, false);
    // coronary veins of aether wrapping the muscle (the glowing weak points): dark violet vessels
    // with a hot core, branching as they run down to the apex
    const vw = Math.max(2, R(0.5 * u)) + (hot ? 1 : 0);
    const run1 = (pts, w) => {
      const q = bez(pts, 18).filter(([px, py]) => H.a(R(px), R(py)));
      for (let i = 1; i < q.length; i++) { F.p.line(q[i - 1][0], q[i - 1][1] + 1, q[i][0], q[i][1] + 1, AE[0], w); }
      glowLine(F, q, w, AE[2], null);
      glowLine(F, q, 1, vc, null);
      if (hot) for (let i = 2; i < q.length; i += 5) ep(F, q[i][0], q[i][1], vcore);
    };
    run1([[cx + 2 * U, cy - 6 * U], [cx + 4.6 * U, cy + 1 * U], [cx + 3.4 * U, cy + 6 * U], [cx + 4.8 * U, cy + 12 * U]], vw);
    run1([[cx + 3.4 * U, cy - 5.6 * U], [cx + 10 * U, cy - 4 * U], [cx + 9.6 * U, cy + 2 * U], [cx + 7.4 * U, cy + 7 * U]], vw);
    run1([[cx - 1.2 * U, cy - 5.6 * U], [cx - 8 * U, cy - 4.6 * U], [cx - 9.4 * U, cy + 2 * U], [cx - 4 * U, cy + 8.4 * U]], vw);
    run1([[cx - 6.4 * U, cy - 3 * U], [cx - 6 * U, cy + 0 * U], [cx - 7.4 * U, cy + 3 * U]], Math.max(1, vw - 1));
    run1([[cx + 9.4 * U, cy - 1 * U], [cx + 7.2 * U, cy + 2 * U], [cx + 6.4 * U, cy + 4.6 * U]], Math.max(1, vw - 1));
    run1([[cx + 3.8 * U, cy + 3 * U], [cx + 1.4 * U, cy + 6 * U], [cx + 0.2 * U, cy + 7.6 * U]], Math.max(1, vw - 1));
    // the aortic arch and pulmonary trunk: the crown of severed pipes
    const FV = layer(F);
    const aTip = [cx - 3.2 * U + sw * 0.5 * u, cy - 14.6 * U + (w1 ? -1.2 * u : 0)];
    tb(FV, bez([[cx + 0.6 * U, cy - 6 * U], [cx + 1.2 * U, cy - 15 * U], aTip], 14), [2.6 * U, 2.1 * U], VE);
    const pBase = [cx + 3.4 * U, cy - 7 * U], pFork = [cx + 5.4 * U - sw * 0.3 * u, cy - 11.2 * U];
    tb(FV, [pBase, pFork], [2 * U, 1.8 * U], VE);
    const p1 = [cx + 8.6 * U - sw * 0.6 * u, cy - 13 * U + (w1 ? -1 * u : 0)], p2 = [cx + 4.6 * U - sw * 0.4 * u, cy - 15.4 * U + (w1 ? -1 * u : 0)];
    tb(FV, bez([pFork, [pFork[0] + 2 * U, pFork[1] - 0.6 * U], p1], 8), [1.6 * U, 1.3 * U], VE);
    tb(FV, bez([pFork, [pFork[0] - 0.4 * U, pFork[1] - 2 * U], p2], 8), [1.5 * U, 1.2 * U], VE);
    put(F.p, FV, true);
    // open ends: a void lumen ringed in aether, breathing light
    const lumen = (x, y, rx, ry) => {
      F.p.ellipse(x, y, rx + 1, ry + 1, VE[1]);
      F.p.ellipse(x, y, rx, ry, VOID);
      F.p.ellipse(x - rx * 0.1, y + ry * 0.15, rx * 0.6, ry * 0.5, AE[1]);
      ep(F, x, y + ry * 0.2, beat > 0.4 || w2 ? AE[5] : AE[3]);
      F.e.ellipse(x, y, rx * 0.6, ry * 0.5, AE[2]);
    };
    lumen(aTip[0], aTip[1], 2 * U, 1.1 * U);
    lumen(p1[0], p1[1], 1.3 * U, 0.8 * U);
    lumen(p2[0], p2[1], 1.2 * U, 0.75 * U);
    lumen(vcTip[0], vcTip[1], 1.5 * U, 0.85 * U);
    // aether breath puffing from the pipes on the beat (and the strike)
    if (hot || w1) for (const [x, y, n] of [[aTip[0], aTip[1], 3], [p1[0], p1[1], 2], [p2[0], p2[1], 2]]) for (let j = 0; j < n; j++) {
      const yy = y - (1.6 + j * 1.5) * u, xx = x + sin(j * 0.3 + t) * 0.6 * u;
      eDisc(F, xx, yy, Math.max(0.8, (0.9 - j * 0.2) * u), j ? AE[3] : AE[5]);
    }
    // the eye: an almond lidded by heart muscle
    const ex = cx + 0.4 * U, ey = cy + 0.4 * U, ew = 5.8 * U;
    const open = hurt ? 0 : w1 || w2 ? 1 : idle ? [0.78, 0.5, 0.66, 0.78, 0.12, 0.62][P.i] : 0.74;
    const eh = 3.9 * U * open;
    const inEye = (x, y) => { const dx = (x + 0.5 - ex) / ew; if (Math.abs(dx) >= 1) return false; return Math.abs(y + 0.5 - ey) <= eh * Math.pow(1 - dx * dx, 0.85); };
    // swollen lids: a raised rim of muscle round the almond
    const LD = layer(F);
    const lidH = 3.9 * U * Math.max(0.35, open) + 1.6 * U;
    for (let y = Math.floor(ey - lidH - 2); y <= ey + lidH + 2; y++) for (let x = Math.floor(ex - ew - 2 * U); x <= ex + ew + 2 * U; x++) {
      const dx = (x + 0.5 - ex) / (ew + 1.6 * U);
      if (Math.abs(dx) >= 1) continue;
      if (Math.abs(y + 0.5 - ey) <= lidH * Math.pow(1 - dx * dx, 0.85)) LD.set(x, y, MU[3]);
    }
    cyl(LD, MU, { wide: true });
    put(F.p, LD, true);
    if (open > 0.05) {
      const ix = ex + (w2 ? 0 : 0.6 * U), iy = ey + 0.2 * U, ir = 3.3 * U;
      for (let y = Math.floor(ey - eh - 1); y <= ey + eh + 1; y++) for (let x = Math.floor(ex - ew); x <= ex + ew; x++) {
        if (!inEye(x, y)) continue;
        const d = Math.hypot(x + 0.5 - ix, y + 0.5 - iy);
        // sclera shaded under the upper lid; iris in stepped rings
        let c = (y + 0.5 - (ey - eh)) < 1.4 * U ? SC[2] : (x + 0.5 - ex) > ew * 0.55 ? SC[2] : SC[3];
        if (d < ir) c = d > ir - Math.max(1, 0.5 * U) ? AE[1] : d > ir * 0.62 ? AE[2] : AE[3];
        F.p.set(x, y, c);
        if (d < ir) F.e.set(x, y, c);
      }
      // the pupil: a slit that dilates into a well of light on the strike
      if (w2) { eDisc(F, ix, iy, 1.9 * U, VOID); eDisc(F, ix, iy, 1.2 * U, AE[5]); eDisc(F, ix - 0.2 * U, iy - 0.2 * U, 0.6 * U, AE[6]); }
      else {
        const pw = w1 ? 0.5 * U : 0.9 * U, ph = Math.min(eh * 0.95, 2.8 * U);
        F.p.ellipse(ix, iy, pw, ph, VOID); F.e.ellipse(ix, iy, pw, ph, VOID);
        ep(F, ix, iy - ph * 0.3, AE[4]);
      }
      F.p.set(R(ix - ir * 0.5), R(iy - ir * 0.5), WHITE); F.p.set(R(ix - ir * 0.5) + 1, R(iy - ir * 0.5), WHITE);
      // lash line
      for (let x = Math.floor(ex - ew); x <= ex + ew; x++) {
        const dx = (x + 0.5 - ex) / ew;
        if (Math.abs(dx) >= 1) continue;
        const yy = ey - eh * Math.pow(1 - dx * dx, 0.85);
        F.p.set(x, R(yy) - 1, MU[0]); F.p.set(x, R(yy), MUd[0]);
      }
    } else {
      // squeezed shut: a dark seam with creases
      F.p.line(ex - ew, ey, ex + ew, ey, MU[0], Math.max(1, R(0.5 * u)));
      for (const s of [-1, 1]) F.p.line(ex + s * ew * 0.6, ey - 1.6 * U, ex + s * ew * 0.9, ey - 0.6 * U, MU[1]);
    }
    if (hurt) {
      // a vein bursts: a spray of aether off the upper right
      for (let j = 0; j < 5; j++) eDisc(F, cx + (7 + j * 1.2) * U, cy - (3 + j * 0.9 + (j % 2) * 0.8) * U, Math.max(0.8, (0.9 - j * 0.12) * u), j % 2 ? AE[3] : AE[5]);
    }
    // wind-up: motes of aether drawn in toward the eye
    if (w1) for (let j = 0; j < 10; j++) { const a = j / 10 * Math.PI * 2 + 0.3, d = (j % 2 ? 9.5 : 11.5) * U; eDisc(F, ex + Math.cos(a) * d * 1.05, ey + Math.sin(a) * d * 0.9, Math.max(0.8, 0.55 * u), j % 2 ? AE[3] : AE[5]); }
    F.mouth = [ex, ey];
  },
};


// ================================================================== Aurel, the Ashen King
// Root: the phoenix king who would not stay burned; Ozymandias; kintsugi. Twist: the emperor came
// back as ash, and the ash was mended with molten gold. A towering king of charcoal ash whose every
// crack is a seam of living gold-fire; his gilded death mask (the face of the Echo in the Gilded
// Reach) is half broken away over a charred skull with one burning eye. His crown is a ring of
// gold sun-rays that are on fire, his cape smoulders into embers at the hem, and an open fissure
// in his belly shows the furnace inside (the weak point). Idle: both hands on the pommel of a
// planted greatsword. Run: he drags the blade, striking sparks. Attack: the blade goes up over the
// crown, then comes down in an arc of fire.
const ashenKing = {
  view: 'side', box: [54, 58], pivot: 0.38, scale: 1.24, idle: 6, idleFps: 5,
  draw(F, o, P) {
    const { u, ox, oy } = F;
    const t = P.t, idle = P.act === 'idle', run = P.act === 'run', w1 = P.atk === 1, w2 = P.atk === 2, hurt = P.hurt;
    const AS = ['#1f1d26', '#2f2c38', '#45414c', '#5c5862', '#8e888c'].map((c) => C(c)), ASd = AS.map((c) => dark(c, 0.8));
    const CH = ['#140f1c', '#1f1d26', '#2f2c38', '#45414c', '#66626a'].map((c) => C(c));
    const GO = pal5('gold', 5), GOd = GO.map((c) => dark(c, 0.78));
    const CP = pal5('red', 4);
    const IR = pal5('steel', 5);
    const LE = pal5('wood', 4);
    const pulse = idle ? [0.3, 0.6, 1, 0.8, 0.5, 0.3][P.i] : w1 || w2 || hurt ? 1 : 0.6;
    const SEAM = pulse > 0.7 ? EM[4] : EM[3], CORE = hurt ? WHITE : pulse > 0.7 ? EM[5] : EM[4];
    const sw = Math.max(2, R(0.42 * u));
    // pose
    const lean = idle ? 0 : run ? 0.9 : w1 ? -1.5 : w2 ? 2.6 : -2;
    const bob = run ? -Math.abs(sin(t)) * 0.8 * u : 0;
    const breath = idle ? [0, 0.15, 0.3, 0.3, 0.15, 0][P.i] * u : 0;
    const hipX = ox + (w2 ? 1.2 * u : hurt ? -0.8 * u : 0), hipY = oy - 13.4 * u + bob + (w2 ? 1.2 * u : w1 ? 0.4 * u : 0);
    const sx = hipX + 0.8 * u + lean * u, sy = oy - 24.4 * u + bob - breath + (w2 ? 1.8 * u : 0) + (hurt ? 0.5 * u : 0) + (w1 ? 0.3 * u : 0);
    const H = 1.34 * u;
    const hx = sx + 1.2 * u + lean * 0.35 * u, hy = sy - 5.5 * u + (hurt ? 0.4 * u : 0) + (w2 ? 0.4 * u : 0);
    // the greatsword: the grip hand and the way the blade points
    let gh, ga;
    if (idle) { gh = [ox + 8.4 * u, sy + 2.4 * u]; ga = Math.PI / 2; }
    else if (run) { gh = [hipX + 2 * u, hipY + 1.2 * u]; ga = Math.PI - 0.66; }
    else if (w1) { gh = [sx - 3.8 * u, sy - 9.6 * u]; ga = -Math.PI / 2 - 0.75; }
    else if (w2) { gh = [sx + 7.8 * u, sy + 5.6 * u]; ga = 0.48; }
    else { gh = [sx + 4.2 * u, sy + 4.6 * u]; ga = -1.15; }
    const gdx = Math.cos(ga), gdy = Math.sin(ga);
    const at = (d, s) => [gh[0] + gdx * d - gdy * s, gh[1] + gdy * d + gdx * s];
    const BL = 20 * u, G0 = 1.4 * u;
    const L = layer(F);
    // ---- the arc of fire behind the strike
    if (w2) {
      const c0 = [sx, sy + 1 * u], rr = 18.5 * u;
      for (let a = -2.3; a <= 0.48; a += 0.01) {
        const f = (a + 2.3) / 2.78, th = (0.3 + f * 2.8) * u;
        for (let d = -th; d <= th; d += 0.7) {
          const x = c0[0] + Math.cos(a) * (rr + d), y = c0[1] + Math.sin(a) * (rr + d);
          const k = Math.abs(d) / th, c = k < 0.3 ? EM[5] : k < 0.65 ? EM[4] : EM[3];
          if (f > 0.15 || k < 0.6) ep(F, x, y, c);
        }
      }
    }
    // ---- cape of embers: royal red that chars and burns away into sparks at the hem
    const CA = part(F);
    const wv = idle ? sin(t) * 0.8 * u : run ? -3 * u + sin(t * 2) * 0.6 * u : w1 ? -1.2 * u : w2 ? -5.5 * u : -2.4 * u;
    const lift = w2 ? -3.4 * u : run ? -1.6 * u : 0;
    const back = bez([[sx - 2.8 * u, sy - 0.6 * u], [sx - 7.6 * u + wv * 0.4, sy + 5 * u], [ox - 12 * u + wv * 0.8, oy - 8 * u + lift * 0.5], [ox - 13.6 * u + wv, oy - 0.8 * u + lift]], 14);
    const hemEnd = [ox + 0.4 * u, oy - 1 * u + lift * 0.2];
    const hem = [], b0 = back[back.length - 1];
    for (let k = 1; k <= 16; k++) {
      const f = k / 16, x = lerp(b0[0], hemEnd[0], f), y = lerp(b0[1], hemEnd[1], f);
      hem.push([x, y - (k % 2 ? 0 : 1.2 * u) - hash2(k, P.i, 5) * 0.9 * u]);
    }
    CA.p.poly([[sx + 1 * u, sy - 1 * u], ...back, ...hem, [sx - 0.4 * u, sy + 9 * u]], CP[3]);
    cyl(CA.p, CP, { wide: true });
    for (let k = 0; k < 4; k++) {
      const f = (k + 0.6) / 4.4, top = [sx - 1.4 * u - k * 0.5 * u, sy + 1.4 * u], bot = [lerp(b0[0], hemEnd[0], f), lerp(b0[1], hemEnd[1], f) - 1 * u];
      for (let s2 = 0; s2 <= 1; s2 += 0.01) {
        const x = R(lerp(top[0], bot[0], s2) + Math.sin(s2 * 3 + k) * 0.6 * u), y = R(lerp(top[1], bot[1], s2));
        if (CA.p.a(x, y) && CA.p.a(x + 2, y)) { CA.p.set(x, y, CP[1]); if (s2 > 0.15) CA.p.set(x + 1, y, CP[4]); }
      }
    }
    for (let k = 1; k < back.length; k++) { const [x, y] = back[k]; for (let j = 1; j <= 2; j++) if (CA.p.a(R(x) + j, R(y))) CA.p.set(R(x) + j, R(y), j === 1 ? GO[3] : GO[1]); }
    for (const [f, up] of [[0.28, 2.8], [0.6, 4.4], [0.82, 2.2]]) {
      const x = lerp(b0[0], hemEnd[0], f), y = lerp(b0[1], hemEnd[1], f) - up * u, r = (0.7 + f * 0.4) * u;
      CA.p.ellipse(x, y, r + 1.2, r * 0.8 + 1.2, EM[2]); CA.e.ellipse(x, y, r + 1.2, r * 0.8 + 1.2, EM[2]);
      CA.p.ellipse(x, y, r + 0.4, r * 0.8 + 0.4, EM[4]); CA.e.ellipse(x, y, r + 0.4, r * 0.8 + 0.4, EM[4]);
      carve(CA.p, x, y, r * 0.8);
    }
    for (let x = 0; x < CA.p.w; x++) {
      const y = lowY(CA.p, x);
      if (y < 0 || x > hemEnd[0]) continue;
      const cols = [EM[4], EM[3], EM[3], EM[2], CP[0]];
      for (let k = 0; k < cols.length; k++) if (CA.p.a(x, y - k) > 100) { CA.p.set(x, y - k, cols[k]); if (k < 4) CA.e.set(x, y - k, cols[k]); }
    }
    commit(F, L, CA, false);
    // ---- the greatsword: steel with a fuller of molten gold, a sun-disc crossguard
    const sword = () => {
      const q = part(F);
      tb(q.p, [at(-3.6 * u, 0), at(G0 - 0.4 * u, 0)], 0.75 * u, LE);
      for (let d = -3 * u; d < 0; d += 1.2 * u) { const [x, y] = at(d, 0); q.p.line(...at(d, -0.7 * u), ...at(d + 0.5 * u, 0.7 * u), LE[1]); }
      blob(q.p, [[...at(-4 * u, 0), 1.15 * u, 1.15 * u]], GO);
      const tipD = G0 + BL, bw = 1.5 * u;
      sl(q.p, [at(G0, bw), at(tipD - 3.6 * u, bw * 0.92), at(tipD, 0), at(tipD - 3.6 * u, -bw * 0.92), at(G0, -bw)], IR, { wide: true });
      const lit = gdy * 0.48 - gdx * 0.62 > 0 ? 1 : -1;
      facet(q.p, [at(G0 + 0.6 * u, lit * (bw - 1)), at(tipD - 3.6 * u, lit * (bw * 0.92 - 1)), at(tipD - 0.9 * u, 0), at(G0 + 0.6 * u, 0)], IR[3]);
      q.p.line(...at(G0 + 0.6 * u, lit * (bw - 1)), ...at(tipD - 3.6 * u, lit * (bw * 0.92 - 1)), IR[4]);
      glowLine(q, [at(G0 + 1.2 * u, 0), at(tipD - 5 * u, 0)], Math.max(2, R(0.45 * u)), EM[3], pulse > 0.7 ? EM[5] : EM[4]);
      sl(q.p, [at(G0 - 0.7 * u, 4 * u), at(G0 + 0.5 * u, 3.4 * u), at(G0 + 0.5 * u, -3.4 * u), at(G0 - 0.7 * u, -4 * u)], GO);
      for (const sd of [-1, 1]) blob(q.p, [[...at(G0 - 0.1 * u, sd * 4.1 * u), 0.85 * u, 0.85 * u]], GO);
      blob(q.p, [[...at(G0, 0), 1.7 * u, 1.7 * u]], GO);
      eDisc(q, ...at(G0, 0), 0.85 * u, pulse > 0.7 ? EM[4] : EM[3]);
      return q;
    };
    // ---- arms: ash plate, gold couters, flared gold cuffs, compact gauntlets
    const arm = (far, hand, bend = 1) => {
      const q = part(F), Rm = far ? ASd : AS, Gm = far ? GOd : GO;
      const sh = [sx + (far ? -1.6 * u : 0.2 * u), sy + 1 * u];
      const el = ik(sh, hand, w1 ? 5.8 * u : 5.2 * u, w1 ? 5.6 * u : 5 * u, bend);
      tb(q.p, [sh, el], [1.8 * u, 1.4 * u], Rm, { tex: 4 });
      tb(q.p, [el, hand], [1.4 * u, 1.15 * u], Rm, { tex: 4 });
      const lp = (k) => [lerp(el[0], hand[0], k), lerp(el[1], hand[1], k)];
      tb(q.p, [lp(0.6), lp(0.84)], [1.35 * u, 1.75 * u], Gm, { matte: true });
      blob(q.p, [[el[0], el[1], 1.25 * u, 1.25 * u]], Gm);
      const ax = (hand[0] - el[0]) / 5, ay = (hand[1] - el[1]) / 5;
      blob(q.p, [[hand[0], hand[1], 1.05 * u, 0.95 * u], [hand[0] + ax * 0.12 * u, hand[1] + ay * 0.12 * u + 0.45 * u, 0.85 * u, 0.75 * u]], Gm);
      q.p.set(R(hand[0] + 0.3 * u), R(hand[1] + 0.2 * u), Gm[1]); q.p.set(R(hand[0] - 0.3 * u), R(hand[1] + 0.3 * u), Gm[1]);
      if (!far) seams(q, lerp(sh[0], el[0], 0.5), lerp(sh[1], el[1], 0.5), 1.4 * u, 1.4 * u, 2, SEAM, CORE, 7, sw, 3.4 * u);
      return q;
    };
    const farHand = run ? at(0, 0) : at(-2.3 * u, 0);
    const nearHand = run ? [sx + 3 * u + sin(t) * 2.6 * u, sy + 7.4 * u - Math.abs(cos(t)) * u] : gh;
    // ---- legs: ash greaves, gold knee cops, gold-toed sabatons
    const leg = (far) => {
      const q = part(F), Rm = far ? ASd : AS, Gm = far ? GOd : GO;
      const hip = [hipX + (far ? -1.4 * u : 1.2 * u), hipY];
      let fx, lf = 0;
      if (run) { const [dx, l] = stride(far ? t + 0.5 : t, 10 * u, 2.8 * u); fx = hip[0] + dx + 0.6 * u; lf = l; }
      else fx = hip[0] + (far ? (w2 ? -6 : w1 ? -4 : hurt ? -3.8 : -3.2) : (w2 ? 6 : w1 ? 3 : hurt ? 2 : 2.8)) * u;
      const fy = oy - lf, ank = [fx, fy - 1.8 * u];
      const kn = ik(hip, ank, 6.4 * u, 5.8 * u, -1);
      tb(q.p, [hip, kn], [2.5 * u, 2 * u], Rm, { tex: 6 });
      tb(q.p, [kn, ank], [2 * u, 1.5 * u], Rm, { tex: 6 });
      sl(q.p, [[ank[0] - 1.8 * u, ank[1] - 0.5 * u], [ank[0] + 1.1 * u, ank[1] - 0.8 * u], [fx + 3.6 * u, fy - 0.7 * u], [fx + 3.8 * u, fy], [fx - 2 * u, fy]], Rm);
      sl(q.p, [[fx + 2 * u, fy - 1 * u], [fx + 3.6 * u, fy - 0.7 * u], [fx + 3.8 * u, fy], [fx + 1.8 * u, fy]], Gm);
      q.p.line(ank[0] - 1.4 * u, ank[1] + 0.2 * u, fx + 2 * u, fy - 1.2 * u, Gm[3]);
      blob(q.p, [[kn[0] + 0.4 * u, kn[1], 1.6 * u, 1.5 * u]], Gm);
      hn(q.p, [kn[0] + 1.2 * u, kn[1] - 0.2 * u], [kn[0] + 2 * u, kn[1] - 0.6 * u], [kn[0] + 2.4 * u, kn[1] - 1.6 * u], 1 * u, Gm);
      if (!far) seams(q, lerp(hip[0], ank[0], 0.5), lerp(hip[1], ank[1], 0.5), 1.8 * u, 4 * u, 3, SEAM, CORE, 11, sw, 4 * u);
      return q;
    };
    // ---- pauldrons: ash domes in gold-rimmed lames, three sun-ray spikes
    const pauld = (far) => {
      const q = part(F), Rm = far ? ASd : AS, Gm = far ? GOd : GO;
      const px0 = sx + (far ? -2.2 * u : 0), py0 = sy + (far ? -0.6 * u : 0.4 * u);
      for (let k = 0; k < 3; k++) hn(q.p, [px0 + (-1.8 + k * 1.6) * u, py0 - 1.4 * u], [px0 + (-2.8 + k * 1.4) * u, py0 - 3.6 * u], [px0 + (-4.4 + k * 1.3) * u, py0 - (5.4 - k * 0.7) * u], 1.5 * u, Gm);
      const rim = (cx, cy, rx, ry) => {
        for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
          const dx = (x + 0.5 - cx) / rx;
          if (Math.abs(dx) >= 1) continue;
          const y = R(cy + ry * Math.sqrt(1 - dx * dx)) - 1;
          if (q.p.a(x, y)) { q.p.set(x, y, Gm[2]); q.p.set(x, y - 1, Gm[3]); if (u > 3.5) q.p.set(x, y - 2, Gm[4]); }
        }
      };
      blob(q.p, [[px0 + 0.4 * u, py0 + 3.2 * u, 2.6 * u, 1.3 * u]], Rm); rim(px0 + 0.4 * u, py0 + 3.2 * u, 2.6 * u, 1.3 * u);
      blob(q.p, [[px0, py0 + 1.9 * u, 3.4 * u, 1.5 * u]], Rm); rim(px0, py0 + 1.9 * u, 3.4 * u, 1.5 * u);
      blob(q.p, [[px0 - 0.2 * u, py0, 4 * u, 3 * u]], Rm, { tex: 2 }); rim(px0 - 0.2 * u, py0, 4 * u, 3 * u);
      if (!far) { spots(q.p, px0 - 1.4 * u, py0 - 1.8 * u, 1.8 * u, 0.8 * u, 3, 0.5 * u, '#a29c9c', 4); seams(q, px0 - 0.4 * u, py0 - 0.2 * u, 2.6 * u, 1.6 * u, 2, SEAM, CORE, 19, sw, 3.8 * u); }
      return q;
    };
    // ---- torso: an ash cuirass split by a fissure of fire
    const torso = () => {
      const q = part(F);
      blob(q.p, [[sx + 0.6 * u, sy + 2.6 * u, 4.9 * u, 4.6 * u], [sx - 1.2 * u, sy + 3.6 * u, 4 * u, 4.8 * u], [sx + 0.6 * u, sy + 7.4 * u, 4.6 * u, 3.4 * u], [hipX + 0.4 * u, hipY - 3 * u, 3.8 * u, 3.4 * u]], AS, { tex: 3 });
      // plackart groove and the gold belt
      const band = (y0, n, cs) => { for (let x = Math.floor(hipX - 5 * u); x <= sx + 6 * u; x++) for (let k = 0; k < n; k++) { const y = R(y0 + (x - hipX) * 0.1) + k; if (q.p.a(x, y) > 100) q.p.set(x, y, cs[Math.min(k, cs.length - 1)]); } };
      band(hipY - 1.8 * u, Math.max(3, R(1.2 * u)), [GO[4], GO[3], GO[3], GO[3], GO[1]]);
      // the fissure: a lens of fire rimmed in gold across the belly
      const fz = [[sx - 1.6 * u, sy + 6.2 * u], [sx + 0.6 * u, sy + 6.4 * u], [sx + 2.4 * u, sy + 6.9 * u], [sx + 3.8 * u, sy + 7.3 * u], [sx + 4.6 * u, sy + 7.9 * u], [sx + 5 * u, sy + 9.2 * u],
        [sx + 3.4 * u, sy + 9 * u], [sx + 1.8 * u, sy + 8.9 * u], [sx + 0.4 * u, sy + 8.4 * u], [sx - 0.8 * u, sy + 7.6 * u]];
      const sh = (pts, k) => pts.map(([x, y]) => [lerp(x, sx + 1.8 * u, k), lerp(y, sy + 7.8 * u, k)]);
      q.p.poly(fz.map(([x, y]) => [x - 1.5, y - 1.5]), GO[4]);
      q.p.poly(fz.map(([x, y]) => [x + 1.5, y + 1.5]), GO[1]);
      q.p.poly(fz, EM[2]); q.e.poly(fz, EM[2]);
      q.p.poly(sh(fz, 0.3), EM[3]); q.e.poly(sh(fz, 0.3), EM[3]);
      q.p.poly(sh(fz, 0.62), pulse > 0.7 ? EM[5] : EM[4]); q.e.poly(sh(fz, 0.62), pulse > 0.7 ? EM[5] : EM[4]);
      seams(q, sx + 0.6 * u, sy + 4 * u, 4 * u, 4.4 * u, 6, SEAM, CORE, 3, sw, 5 * u);
      seams(q, hipX, hipY - 3 * u, 3 * u, 2 * u, 2, SEAM, CORE, 5, sw, 3 * u);
      return q;
    };
    // ---- tassets: three gold-edged plates over the hips; a red tabard with a gold sun hangs in front
    const tassets = () => {
      const q = part(F);
      for (let k = 0; k < 3; k++) {
        const x0 = hipX + (-2.9 + k * 2.4) * u + (run ? sin(t + k * 0.2) * 0.4 * u : 0), y0 = hipY - 1 * u;
        const fan = (k - 1) * 1.1 * u, yb = y0 + (4.2 + (k === 1 ? 0.8 : 0)) * u;
        const tp2 = [[x0 - 1.5 * u, y0], [x0 + 1.5 * u, y0], [x0 + 1.9 * u + fan, yb - 0.3 * u], [x0 + 0.3 * u + fan, yb + 0.4 * u], [x0 - 1.4 * u + fan, yb]];
        sl(q.p, tp2, k === 0 ? ASd : AS, { wide: true });
        q.p.line(tp2[4][0], tp2[4][1] - 1, tp2[3][0], tp2[3][1] - 1, GO[3], Math.max(1, R(0.4 * u))); q.p.line(tp2[3][0], tp2[3][1] - 1, tp2[2][0], tp2[2][1] - 1, GO[3], Math.max(1, R(0.4 * u)));
        q.p.set(R(x0), R(y0 + 1.2 * u), GO[4]);
      }
      const tw = idle ? sin(t) * 0.3 * u : run ? -1.6 * u + sin(t * 2) * 0.5 * u : w2 ? -2 * u : w1 ? 0.6 * u : -1 * u;
      const x0 = hipX + 1.4 * u, x1 = hipX + 4.2 * u, top = hipY - 1.6 * u, len = 8.6 * u;
      const tp = [[x0, top], [x1, top], [x1 + 0.6 * u + tw, top + len], [x0 + 0.3 * u + tw, top + len + 0.5 * u]];
      sl(q.p, tp, CP, { wide: true });
      q.p.line(tp[3][0], tp[3][1] - 1, tp[2][0], tp[2][1] - 1, GO[3], Math.max(1, R(0.45 * u)));
      const ec = [lerp(x0, x1, 0.5) + tw * 0.45, top + len * 0.45];
      q.p.ring(ec[0], ec[1], 1.2 * u, GO[3], Math.max(1, R(0.35 * u)));
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; q.p.set(R(ec[0] + Math.cos(a) * 1.75 * u), R(ec[1] + Math.sin(a) * 1.75 * u), GO[4]); }
      q.p.disc(ec[0], ec[1], 0.5 * u, GO[4]);
      return q;
    };
    const ft = idle ? t : run ? t * 2 : 0.3;
    // ---- the crown fire, behind the head
    const crownFire = () => {
      const q = part(F);
      const fh = hurt ? 2.6 * H : w1 ? 9.6 * H : w2 ? 7.4 * H : (7 + sin(t) * 0.7) * H;
      flame(q, hx - 0.5 * H - (w2 ? 1 * u : run ? 0.8 * u : 0), hy - 2.6 * H, fh, 7.4 * H, ft);
      if (!hurt) flame(q, hx - 2.2 * H - (w2 ? 1.4 * u : run ? 1 * u : 0), hy - 2.4 * H, fh * 0.62, 3.4 * H, ft + 0.45);
      return q;
    };
    // ---- head: gorget, charred skull, the broken gold mask
    const head = () => {
      const q = part(F);
      blob(q.p, [[hx - 0.9 * H, hy + 3.9 * H, 2.9 * H, 1.6 * H]], GO);
      blob(q.p, [[hx - 0.4 * H, hy + 0.1 * H, 3.2 * H, 3.4 * H], [hx + 1.2 * H, hy + 1.9 * H, 1.9 * H, 1.7 * H]], CH, { tex: 8 });
      spots(q.p, hx - 1.6 * H, hy - 1 * H, 1.4 * H, 1.8 * H, 4, 0.35 * H, '#66626a', 8);
      const M = [[0.4, -3.1], [2.6, -2.7], [3, -1.5], [3.05, -1], [3.75, 0.5], [3.15, 0.85], [3.3, 1.2], [3, 1.5], [3.25, 1.85], [3.1, 2.8], [2.4, 3.3],
        [1.6, 3.1], [1.3, 2.3], [1.8, 1.7], [1, 1.1], [0.8, 0.3], [0, -0.1], [-0.6, -1], [-0.8, -2.4]].map(([x, y]) => [hx + x * H, hy + y * H]);
      sl(q.p, M, GO, { wide: true });
      q.p.line(hx + 1 * H, hy - 1.75 * H, hx + 3 * H, hy - 1.55 * H, GO[1]);
      q.p.line(hx + 2.95 * H, hy + 1.5 * H, hx + 3.2 * H, hy + 1.5 * H, GO[1]);
      q.p.line(hx + 1.2 * H, hy - 2.6 * H, hx + 2.5 * H, hy - 2.4 * H, GO[4]);
      q.p.line(hx + 2.2 * H, hy + 0.2 * H, hx + 2.5 * H, hy + 0.9 * H, GO[2]);
      // the burning eye under the brow, and a lick of flame from it
      const ex = hx + 1.85 * H, ey = hy - 0.8 * H;
      q.p.ellipse(ex, ey, 1.05 * H, 0.6 * H, VOID);
      if (hurt) { q.p.line(ex - H, ey, ex + H, ey + 0.3 * H, EM[3]); q.e.line(ex - H, ey, ex + H, ey + 0.3 * H, EM[3]); }
      else { eDisc(q, ex + 0.25 * H, ey + 0.05 * H, 0.55 * H, EM[4]); ep(q, ex + 0.35 * H, ey - 0.15 * H, EM[5]); flame(q, ex - 0.5 * H, ey - 0.3 * H, 2 * H, 1 * H, ft + 0.3); }
      glowLine(q, [[hx + 1.6 * H, hy + 3.1 * H], [hx + 1.3 * H, hy + 2.3 * H], [hx + 1.8 * H, hy + 1.7 * H], [hx + 1 * H, hy + 1.1 * H], [hx + 0.8 * H, hy + 0.3 * H]], 2, EM[2], EM[3]);
      seams(q, hx + 2.2 * H, hy - 1.2 * H, 1.2 * H, 1.2 * H, 1, SEAM, CORE, 23, 1, 2.6 * H);
      seams(q, hx - 1.2 * H, hy + 1 * H, 1.6 * H, 1.6 * H, 2, EM[2], EM[3], 29, 1, 2.6 * H);
      return q;
    };
    // ---- the crown: a gold band and five sun-rays fanned round the head, each tipped with fire
    const crown = () => {
      const q = part(F);
      const cb = hy - 2.75 * H;
      for (let k = 0; k < 5; k++) {
        const f = k / 4, bx = lerp(hx - 2.6 * H, hx + 2.2 * H, f), by = lerp(cb, cb - 0.5 * H, f);
        const a = lerp(-2.3, -0.9, f) + (w2 ? -0.12 : 0), ln = [3.6, 4.8, 6, 4.8, 3.8][k] * H;
        shard(q.p, bx, by, a, ln, 0.78 * H, GO);
      }
      sl(q.p, [[hx - 3.1 * H, cb - 0.35 * H], [hx + 2.7 * H, cb - 0.85 * H], [hx + 2.9 * H, cb + 0.7 * H], [hx - 3.1 * H, cb + 0.95 * H]], GO, { wide: true });
      for (let k = 0; k < 3; k++) eDisc(q, hx + (-1.8 + k * 1.8) * H, cb + 0.1 * H - k * 0.15 * H, 0.42 * H, k === 1 ? EM[4] : EM[3]);
      for (let k = 0; k < 5; k++) {
        const f = k / 4, bx = lerp(hx - 2.6 * H, hx + 2.2 * H, f), by = lerp(cb, cb - 0.5 * H, f);
        const a = lerp(-2.3, -0.9, f) + (w2 ? -0.12 : 0), ln = [3.6, 4.8, 6, 4.8, 3.8][k] * H;
        if (!hurt) flame(q, bx + Math.cos(a) * ln, by + Math.sin(a) * ln + 0.5 * H, (1.5 + (k === 2 ? 0.7 : 0)) * H * (w1 ? 1.4 : 1), 1.1 * H, ft + k * 0.21);
      }
      return q;
    };
    // ---- assemble, far to near
    commit(F, L, pauld(true));
    if (run) commit(F, L, sword());
    commit(F, L, arm(true, farHand, w1 ? -1 : 1));
    commit(F, L, leg(true));
    commit(F, L, leg(false));
    commit(F, L, torso());
    commit(F, L, tassets());
    commit(F, L, crownFire());
    if (w1) commit(F, L, sword());
    commit(F, L, head());
    commit(F, L, crown());
    if (w1) commit(F, L, arm(false, nearHand, -1));
    commit(F, L, pauld(false));
    if (!run && !w1) commit(F, L, sword());
    if (!w1) commit(F, L, arm(false, nearHand, 1));
    put(F.p, L, false);
    // ---- embers lifting off the cape, ash flakes off the shoulders, sparks off the dragged blade
    for (let k = 0; k < 10; k++) {
      const f = hash2(k, 3, 7), ph = (t + hash2(k, 5, 7)) % 1;
      const x = lerp(b0[0], hemEnd[0], f) - ph * (3 + f * 2) * u + sin(ph + k * 0.3) * 0.6 * u, y = lerp(b0[1], hemEnd[1], f) - 1.5 * u - ph * 8 * u;
      const c = ph < 0.4 ? EM[4] : ph < 0.75 ? EM[3] : EM[2];
      if (k % 3 === 0) eRect(F, x, y, 2, 2, c); else ep(F, x, y, c);
    }
    for (let k = 0; k < 4; k++) {
      const ph = (t + k * 0.25 + 0.1) % 1, x = sx - (1.5 + k) * u - ph * 3 * u, y = sy - 2 * u - ph * 6 * u;
      F.p.rect(R(x), R(y), 2, 1, C('#a29c9c')); F.p.set(R(x), R(y) + 1, AS[2]);
    }
    if (run) {
      const tip = at(G0 + BL, 0);
      for (let k = 0; k < 7; k++) { const a = -2.5 - hash2(k, P.i, 9) * 0.8, d = (1 + hash2(k, P.i, 4) * 3.4) * u; const x = tip[0] + Math.cos(a) * d, y = oy - 0.4 * u + Math.sin(a) * d; if (k % 3 === 0) eRect(F, x, y, 2, 2, EM[4]); else ep(F, x, y, k % 2 ? EM[5] : EM[4]); }
    }
    if (hurt) {
      F.p.poly([[hx + 4.4 * H, hy - 3.4 * H], [hx + 5.6 * H, hy - 4 * H], [hx + 5.2 * H, hy - 2.6 * H]], GO[4]);
      for (let k = 0; k < 7; k++) { const a = -0.4 - k * 0.45, d = (4.4 + hash2(k, 1, 2) * 2.4) * u; F.p.rect(R(sx + 1.8 * u + Math.cos(a) * d), R(sy + 4.4 * u + Math.sin(a) * d), 2, 2, k % 2 ? AS[3] : C('#a29c9c')); }
    }
    F.mouth = [sx + 2 * u, sy + 7.8 * u];
  },
};

// ================================================================== The Hollow King
// Root: "within the hollow crown that rounds the mortal temples of a king keeps Death his court"
// (Richard II); the sleeping king under the hill. Twist: nobody is in the armour. A gaunt suit of
// violet-black gothic plate holds only the night: its open helm frames a starry void with a pale
// crescent moon for a face, a star-pricked hole gapes where the heart was, and void shows at every
// joint. His crown floats a hand above the helm, tilted, a hollow ring you can see into. His cape
// is the night sky with a crown-shaped constellation, and his blade is cut from the same night.
// Idle: the blade rests on his shoulder. Attack: pulled back low, then swept round in a crescent.
const hollowKing = {
  view: 'side', box: [50, 50], pivot: 0.44, scale: 1.02, idle: 6, idleFps: 4,
  draw(F, o, P) {
    const { u, ox, oy } = F;
    const t = P.t, idle = P.act === 'idle', run = P.act === 'run', w1 = P.atk === 1, w2 = P.atk === 2, hurt = P.hurt;
    const AR = ['#16111f', '#251d38', '#3a3057', '#594d84', '#9384c4'].map((c) => C(c)), ARd = AR.map((c) => dark(c, 0.78));
    const GO = pal5('gold', 4), GOd = GO.map((c) => dark(c, 0.78));
    const NI = ['#0d0a1a', '#151030', '#1e1846', '#2a2260', '#3a3080'].map((c) => C(c));
    const LV = pal5('lavender', 5);
    const MO = C(o.c3 || '#ffd080'), MOh = light(MO, 1.25);
    const STAR = C('#fff4dc');
    // the night inside: a void fill with seeded stars that twinkle by frame
    const night = (L, cx, cy, rx, ry, seed, n = 6) => {
      L.ellipse(cx, cy, rx, ry, VOID);
      const r = srand(seed);
      for (let k = 0; k < n; k++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.8, x = R(cx + Math.cos(a) * rx * d), y = R(cy + Math.sin(a) * ry * d);
        const tw = (k + P.i) % 3 === 0;
        L.set(x, y, tw ? STAR : LV[2]);
        if (tw && rx > 3) { L.set(x + 1, y, LV[1]); L.set(x - 1, y, LV[1]); }
      }
    };
    const lean = idle ? 0 : run ? 0.8 : w1 ? -1.4 : w2 ? 1.8 : -1.6;
    const bob = run ? -Math.abs(sin(t)) * 0.6 * u : 0;
    const breath = idle ? sin(t) * 0.25 * u : 0;
    const hipX = ox + (w2 ? 0.8 * u : hurt ? -0.6 * u : 0), hipY = oy - 14.4 * u + bob + (w1 ? 0.6 * u : w2 ? 0.8 * u : 0);
    const sx = hipX + 0.6 * u + lean * u, sy = oy - 25.6 * u + bob + breath + (w1 ? 0.8 * u : w2 ? 1 * u : 0) + (hurt ? 0.4 * u : 0);
    const hx = sx + 1 * u + lean * 0.3 * u, hy = sy - 4.6 * u;
    // the sword
    let gh, ga;
    if (idle || run) { gh = [sx + 2.8 * u, sy + 5 * u + (run ? sin(t * 2) * 0.3 * u : 0)]; ga = -Math.PI / 2 - (run ? 0.8 : 0.62); }
    else if (w1) { gh = [sx - 3.4 * u, sy + 4 * u]; ga = Math.PI + 0.22; }
    else if (w2) { gh = [sx + 6.4 * u, sy + 3.6 * u]; ga = 0.06; }
    else { gh = [sx + 3.4 * u, sy + 4.6 * u]; ga = -1.25; }
    const gdx = Math.cos(ga), gdy = Math.sin(ga);
    const at = (d, s2) => [gh[0] + gdx * d - gdy * s2, gh[1] + gdy * d + gdx * s2];
    const BL = 18 * u, G0 = 1.2 * u;
    const L = layer(F);
    // ---- the crescent slash
    if (w2) {
      const c0 = [sx + 1 * u, sy + 3.4 * u], rr = 16 * u;
      for (let a = -1.5; a <= 0.75; a += 0.012) {
        const f = (a + 1.5) / 2.25, th = Math.sin(f * Math.PI) * 2.8 * u + 0.5;
        for (let d = 0; d <= th; d += 0.7) {
          const x = c0[0] + Math.cos(a) * (rr - d), y = c0[1] + Math.sin(a) * (rr - d) * 0.9;
          ep(F, x, y, d < th * 0.3 ? MOh : d < th * 0.7 ? LV[4] : AE[3]);
        }
      }
    }
    // ---- cape of night: starred, lavender-edged, a crown constellation
    const CA = part(F);
    const wv = idle ? sin(t) * 1 * u : run ? -3.4 * u + sin(t * 2) * 0.6 * u : w1 ? 1.4 * u : w2 ? -4.6 * u : -2.8 * u;
    const lift = w2 ? -2.4 * u : run ? -1.4 * u : 0;
    const back = bez([[sx - 2.4 * u, sy - 0.8 * u], [sx - 8 * u + wv * 0.4, sy + 4 * u], [ox - 14 * u + wv * 0.8, oy - 9 * u + lift * 0.5], [ox - 16 * u + wv, oy - 0.6 * u + lift]], 16);
    const b0 = back[back.length - 1], hemEnd = [ox + 0.8 * u, oy - 0.4 * u + lift * 0.2];
    const hem = [];
    for (let k = 1; k <= 12; k++) { const f = k / 12; hem.push([lerp(b0[0], hemEnd[0], f), lerp(b0[1], hemEnd[1], f) + Math.sin((f * 3 + t) * Math.PI * 2) * 0.6 * u]); }
    CA.p.poly([[sx + 0.8 * u, sy - 1.2 * u], ...back, ...hem, [sx - 0.6 * u, sy + 9 * u]], NI[3]);
    cyl(CA.p, NI, { wide: true });
    for (let k = 0; k < 3; k++) {
      const f = (k + 0.7) / 3.6, top = [sx - 1.4 * u - k * 0.6 * u, sy + 1.6 * u], bot = [lerp(b0[0], hemEnd[0], f), lerp(b0[1], hemEnd[1], f) - 1 * u];
      for (let s2 = 0; s2 <= 1; s2 += 0.01) {
        const x = R(lerp(top[0], bot[0], s2) + Math.sin(s2 * 3 + k) * 0.7 * u), y = R(lerp(top[1], bot[1], s2));
        if (CA.p.a(x, y) && CA.p.a(x + 2, y)) { CA.p.set(x, y, NI[1]); if (s2 > 0.15) CA.p.set(x + 1, y, NI[4]); }
      }
    }
    // lavender edge down the back and along the hem
    for (let k = 1; k < back.length; k++) { const [x, y] = back[k]; for (let j = 1; j <= 2; j++) if (CA.p.a(R(x) + j, R(y))) CA.p.set(R(x) + j, R(y), j === 1 ? LV[4] : LV[2]); }
    for (let x = 0; x < CA.p.w; x++) { const y = lowY(CA.p, x); if (y < 0 || x > hemEnd[0]) continue; CA.p.set(x, y, LV[3]); CA.p.set(x, y - 1, LV[1]); }
    // scattered stars, twinkling
    for (let k = 0; k < 22; k++) {
      const fx = hash2(k, 1, 31), fy = hash2(k, 2, 31);
      const y = lerp(sy + 3 * u, oy - 2 * u, fy), x = lerp(sx - 2 * u, lerp(sx - 4 * u, b0[0] + 1.5 * u, fy), fx);
      if (CA.p.a(R(x), R(y)) < 100 || CA.p.a(R(x) + 2, R(y)) < 100) continue;
      const tw = (k + P.i) % 4 === 0;
      CA.p.set(R(x), R(y), tw ? STAR : LV[3]); if (tw) CA.e.set(R(x), R(y), STAR);
    }
    // the constellation: five stars in the shape of a crown, joined by faint lines
    const cc = [lerp(sx - 3 * u, b0[0], 0.5), lerp(sy + 9 * u, oy - 5 * u, 0.4)];
    const cst = [[-2.4, 0.4], [-1.8, -1.8], [0, -0.4], [1.8, -2], [2.4, 0.6]].map(([x, y]) => [cc[0] + x * u, cc[1] + y * u]);
    if (cst.every(([x, y]) => CA.p.a(R(x), R(y)) > 100)) {
      for (let k = 1; k < cst.length; k++) CA.p.line(cst[k - 1][0], cst[k - 1][1], cst[k][0], cst[k][1], NI[4]);
      CA.p.line(cst[0][0], cst[0][1], cst[4][0], cst[4][1], NI[4]);
      for (const [x, y] of cst) { eRect(CA, x - 0.5, y - 0.5, 2, 2, MO); }
    }
    commit(F, L, CA, false);
    // ---- the night blade: a sword-shaped hole in the world, lavender-edged, a crescent guard
    const sword = () => {
      const q = part(F);
      tb(q.p, [at(-2.8 * u, 0), at(G0 - 0.3 * u, 0)], 0.6 * u, LV.map((c) => dark(c, 0.7)));
      blob(q.p, [[...at(-3.1 * u, 0), 0.75 * u, 0.75 * u]], GO);
      ep(q, ...at(-3.1 * u, 0), MO);
      const tipD = G0 + BL, bw = 1.2 * u;
      const bl = [at(G0, bw), at(tipD - 3 * u, bw), at(tipD, 0), at(tipD - 3 * u, -bw), at(G0, -bw)];
      q.p.poly(bl, VOID);
      for (let k = 1; k < bl.length; k++) q.p.line(bl[k - 1][0], bl[k - 1][1], bl[k][0], bl[k][1], LV[3]);
      q.p.line(bl[4][0], bl[4][1], bl[0][0], bl[0][1], LV[3]);
      for (let k = 0; k < 7; k++) { const p2 = at(G0 + (1.5 + k * 2.3) * u, (hash2(k, 4, 9) - 0.5) * bw); const tw = (k + P.i) % 3 === 0; q.p.set(R(p2[0]), R(p2[1]), tw ? STAR : LV[2]); if (tw) q.e.set(R(p2[0]), R(p2[1]), STAR); }
      // crescent crossguard: two horns curling toward the blade
      for (const sd of [-1, 1]) hn(q.p, at(G0, 0), at(G0 - 0.6 * u, sd * 2.6 * u), at(G0 + 1.6 * u, sd * 3.4 * u), 1.6 * u, GO);
      blob(q.p, [[...at(G0, 0), 0.9 * u, 0.9 * u]], GO);
      return q;
    };
    // ---- void showing at a joint: a ring of violet glow with a star
    const joint = (q, x, y, r) => { eDisc(q, x, y, r, AE[1]); eDisc(q, x, y, r * 0.6, AE[2]); ep(q, x, y, STAR); };
    const arm = (far, hand, bend = 1) => {
      const q = part(F), Rm = far ? ARd : AR, Gm = far ? GOd : GO;
      const sh = [sx + (far ? -1.4 * u : 0.2 * u), sy + 1.2 * u];
      const el = ik(sh, hand, 5 * u, 5 * u, bend);
      const lp = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
      joint(q, el[0], el[1], 1 * u);
      tb(q.p, [lp(sh, el, 0.05), lp(sh, el, 0.78)], [1.45 * u, 1.2 * u], Rm);
      tb(q.p, [lp(el, hand, 0.22), lp(el, hand, 0.8)], [1.15 * u, 1.45 * u], Rm);
      tb(q.p, [lp(el, hand, 0.8), lp(el, hand, 0.9)], 1.5 * u, Gm, { matte: true });
      // long pointed gauntlet fingers
      const ax = (hand[0] - el[0]) / 5, ay = (hand[1] - el[1]) / 5;
      blob(q.p, [[hand[0], hand[1], 1 * u, 0.9 * u]], Rm);
      hn(q.p, hand, [hand[0] + ax * 0.5 * u, hand[1] + ay * 0.5 * u + 0.6 * u], [hand[0] + ax * 0.6 * u - 0.4 * u, hand[1] + ay * 0.6 * u + 1.5 * u], 0.9 * u, Rm);
      return q;
    };
    const nearHand = idle || w2 || hurt || run ? gh : at(-1.8 * u, 0);
    const farHand = idle ? [sx - 1 * u + sin(t) * 0.2 * u, hipY + 1 * u] : run ? [sx - 2.6 * u - sin(t) * 2 * u, hipY - 0.4 * u] : w1 ? gh : w2 ? at(-1.8 * u, 0) : [sx - 3.4 * u, sy + 6 * u];
    const leg = (far) => {
      const q = part(F), Rm = far ? ARd : AR, Gm = far ? GOd : GO;
      const hip = [hipX + (far ? -1.2 * u : 1 * u), hipY];
      let fx, lf = 0;
      if (run) { const [dx, l] = stride(far ? t + 0.5 : t, 9 * u, 2.4 * u); fx = hip[0] + dx + 0.6 * u; lf = l; }
      else fx = hip[0] + (far ? (w2 ? -5 : w1 ? -2.4 : hurt ? -3.4 : -2.2) : (w2 ? 5 : w1 ? 4 : hurt ? 1.6 : 2)) * u;
      const fy = oy - lf, ank = [fx, fy - 1.6 * u];
      const kn = ik(hip, ank, 6.8 * u, 6.4 * u, -1);
      const lp = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
      joint(q, kn[0], kn[1], 1 * u);
      tb(q.p, [lp(hip, kn, 0), lp(hip, kn, 0.82)], [1.9 * u, 1.5 * u], Rm);
      tb(q.p, [lp(kn, ank, 0.18), ank], [1.5 * u, 1.1 * u], Rm);
      // pointed gothic poleyn and a long pointed sabaton
      hn(q.p, [kn[0] - 0.2 * u, kn[1] - 0.6 * u], [kn[0] + 1.4 * u, kn[1] - 0.2 * u], [kn[0] + 1.8 * u, kn[1] + 1.4 * u], 1.8 * u, Gm);
      sl(q.p, [[ank[0] - 1.4 * u, ank[1] - 0.3 * u], [ank[0] + 0.9 * u, ank[1] - 0.5 * u], [fx + 4.6 * u, fy - 0.2 * u], [fx + 3.4 * u, fy], [fx - 1.6 * u, fy]], Rm);
      return q;
    };
    const pauld = (far) => {
      const q = part(F), Rm = far ? ARd : AR, Gm = far ? GOd : GO;
      const px0 = sx + (far ? -1.8 * u : 0), py0 = sy + (far ? -0.4 * u : 0.4 * u);
      // the haute-piece: a tall guard plate rising beside the neck
      sl(q.p, [[px0 + 0.6 * u, py0 - 0.6 * u], [px0 + 1.8 * u, py0 - 4.2 * u], [px0 + 2.6 * u, py0 - 3.6 * u], [px0 + 2.4 * u, py0 - 0.2 * u]], Rm, { wide: true });
      q.p.line(px0 + 1.8 * u, py0 - 4.2 * u, px0 + 2.6 * u, py0 - 3.6 * u, Gm[4]);
      blob(q.p, [[px0 + 0.2 * u, py0 + 2.4 * u, 2.8 * u, 1.3 * u]], Rm);
      blob(q.p, [[px0, py0, 3.3 * u, 2.6 * u]], Rm);
      if (!far) { spots(q.p, px0 - 1.2 * u, py0 - 1.2 * u, 1.2 * u, 0.6 * u, 2, 0.45 * u, '#b8aee0', 3); q.p.set(R(px0 - 1.4 * u), R(py0 - 1.6 * u), STAR); }
      for (let x = Math.floor(px0 - 3.3 * u); x <= px0 + 3.3 * u; x++) {
        const dx = (x + 0.5 - px0) / (3.3 * u);
        if (Math.abs(dx) >= 1) continue;
        const y = R(py0 + 2.6 * u * Math.sqrt(1 - dx * dx)) - 1;
        q.p.set(x, y, Gm[3]); q.p.set(x, y - 1, Gm[2]);
      }
      return q;
    };
    const torso = () => {
      const q = part(F);
      blob(q.p, [[sx + 0.4 * u, sy + 2.8 * u, 3.8 * u, 4 * u], [sx - 0.8 * u, sy + 3.4 * u, 3 * u, 4 * u], [hipX + 0.5 * u, hipY - 3.6 * u, 3 * u, 3.6 * u]], AR);
      spots(q.p, sx - 0.6 * u, sy + 1.2 * u, 1.6 * u, 1 * u, 2, 0.45 * u, '#b8aee0', 6);
      // the gothic ridge down the breastplate
      for (let y = R(sy + 0.4 * u); y < hipY - 1.6 * u; y++) { const x = R(sx + 3.6 * u - (y - sy) * 0.18); if (q.p.a(x, y)) { q.p.set(x, y, AR[4]); q.p.set(x + 1, y, AR[1]); } }
      // the hollow where the heart was: a star-pricked hole in the plate
      const cx = sx + 0.9 * u, cy = sy + 7.2 * u, r = 1.35 * u;
      q.p.disc(cx, cy, r + 1.2, GO[2]); q.p.disc(cx - 0.6, cy - 0.6, r + 0.6, GO[3]);
      night(q.p, cx, cy, r, r, 77, 4);
      q.e.disc(cx, cy, r, AE[1]);
      ep(q, cx + 0.3 * u, cy - 0.2 * u, STAR);
      // fauld lames and the gold waist band
      for (let k = 0; k < 3; k++) { const y0 = hipY - 1.6 * u + k * 1.4 * u; for (let x = Math.floor(hipX - 3 * u); x <= hipX + 3.4 * u; x++) if (q.p.a(x, R(y0))) q.p.set(x, R(y0), k === 0 ? GO[3] : AR[1]); }
      return q;
    };
    const tassets = () => {
      const q = part(F);
      for (let k = 0; k < 2; k++) {
        const x0 = hipX + (-1.4 + k * 2.6) * u, y0 = hipY - 0.8 * u, sw2 = run ? sin(t + k * 0.5) * 0.5 * u : 0;
        sl(q.p, [[x0 - 1.5 * u, y0], [x0 + 1.5 * u, y0], [x0 + 1.9 * u + sw2, y0 + 5.6 * u], [x0 + 0.2 * u + sw2, y0 + 6.4 * u], [x0 - 1.3 * u + sw2, y0 + 5.6 * u]], k ? AR : ARd, { wide: true });
        q.p.line(x0 - 1.3 * u + sw2, y0 + 5.6 * u - 1, x0 + 0.2 * u + sw2, y0 + 6.4 * u - 1, GO[3]); q.p.line(x0 + 0.2 * u + sw2, y0 + 6.4 * u - 1, x0 + 1.9 * u + sw2, y0 + 5.6 * u - 1, GO[3]);
      }
      return q;
    };
    // ---- helm: a tall armet whose open face shows the night and the crescent moon
    const helm = () => {
      const q = part(F);
      blob(q.p, [[hx - 0.6 * u, hy + 3.6 * u, 2.4 * u, 1.4 * u]], AR);
      blob(q.p, [[hx, hy, 3.4 * u, 3.8 * u], [hx - 0.4 * u, hy - 1.6 * u, 3.1 * u, 3 * u]], AR);
      spots(q.p, hx - 1.8 * u, hy - 2.6 * u, 1 * u, 0.7 * u, 2, 0.45 * u, '#b8aee0', 2);
      q.p.set(R(hx - 1.8 * u), R(hy - 2.8 * u), STAR);
      // a crest ridge over the top
      for (let a = -2.7; a <= -0.5; a += 0.03) { const x = R(hx - 0.2 * u + Math.cos(a) * 3.4 * u), y = R(hy - 0.6 * u + Math.sin(a) * 3.9 * u); q.p.set(x, y, AR[4]); }
      // the face opening, framed in gold
      const fx = hx + 1.3 * u, fy = hy + 0.5 * u, frx = 1.9 * u, fry = 2.7 * u;
      q.p.ellipse(fx, fy, frx + 1.2, fry + 1.2, GO[2]); q.p.ellipse(fx - 0.6, fy - 0.6, frx + 0.6, fry + 0.6, GO[3]);
      night(q.p, fx, fy, frx, fry, 41, 5);
      q.e.ellipse(fx, fy, frx, fry, AE[0]);
      // the moon: a crescent, horns toward the front; it wanes when struck
      const mr = 1.7 * u, mx = fx - 0.1 * u, my = fy - 0.2 * u, cut = hurt ? 0.45 * mr : w1 || w2 ? 0.9 * mr : (0.68 + sin(t) * 0.06) * mr;
      for (let y = Math.floor(my - mr); y <= my + mr; y++) for (let x = Math.floor(mx - mr); x <= mx + mr; x++) {
        const d1 = Math.hypot(x + 0.5 - mx, y + 0.5 - my), d2 = Math.hypot(x + 0.5 - (mx + cut), y + 0.5 - (my - 0.15 * mr));
        if (d1 <= mr && d2 > mr * 0.92) { const c = (x + 0.5 - mx) < -mr * 0.45 ? MOh : MO; q.p.set(x, y, c); q.e.set(x, y, c); }
      }
      // gorget band
      q.p.line(hx - 2.6 * u, hy + 3 * u, hx + 1.6 * u, hy + 3.4 * u, GO[3], Math.max(1, R(0.4 * u)));
      return q;
    };
    // ---- the hollow crown: a ring seen from just above, floating and tilted
    const crown = () => {
      const q = part(F);
      const fl = idle ? sin(t) * 0.6 * u : run ? -sin(t * 2) * 0.4 * u : w1 ? 0.6 * u : w2 ? -0.8 * u : -2.4 * u;
      const tl = idle ? -0.22 + sin(t + 0.2) * 0.08 : hurt ? -0.55 : w2 ? -0.1 : -0.25;
      const cx = hx - 0.2 * u + (hurt ? -1 * u : 0), cy = hy - 6.8 * u + fl, rx = 3 * u, ry = 1 * u, hgt = 1.6 * u;
      const rp = (x, y) => { const [a, b] = [x * Math.cos(tl) - y * Math.sin(tl), x * Math.sin(tl) + y * Math.cos(tl)]; return [cx + a, cy + b]; };
      const ring = (y0, s0, s1) => { const pts = []; for (let k = 0; k <= 16; k++) { const a = lerp(s0, s1, k / 16); pts.push(rp(Math.cos(a) * rx, y0 + Math.sin(a) * ry)); } return pts; };
      // back half of the band (dark inside), then points, then the front half
      const backB = [...ring(0, Math.PI, Math.PI * 2), ...ring(hgt, Math.PI * 2, Math.PI).reverse().reverse()];
      q.p.poly([...ring(0, Math.PI, Math.PI * 2), ...ring(hgt, Math.PI * 2, Math.PI)], GOd[1]);
      for (let k = 0; k < 5; k++) {
        const a = Math.PI + (k + 0.5) / 5 * Math.PI, bx = Math.cos(a) * rx, by = Math.sin(a) * ry;
        const tipH = (k === 2 ? 2.6 : 1.9) * u;
        q.p.poly([rp(bx - 0.6 * u, by), rp(bx + 0.6 * u, by), rp(bx, by - tipH)], GOd[2]);
      }
      q.p.poly([...ring(0, 0, Math.PI), ...ring(hgt, Math.PI, 0)], GO[3]);
      for (let k = 0; k < 5; k++) {
        const a = (k + 0.5) / 5 * Math.PI, bx = Math.cos(a) * rx, by = Math.sin(a) * ry;
        const tipH = (k === 2 ? 3 : 2.2) * u;
        q.p.poly([rp(bx - 0.65 * u, by + 0.1 * u), rp(bx + 0.65 * u, by + 0.1 * u), rp(bx, by - tipH)], k < 2 ? GO[4] : GO[3]);
        const tp = rp(bx, by - tipH);
        eDisc(q, tp[0], tp[1], 0.45 * u, AE[3]);
      }
      // top rim line, the inner void and a gem on the front
      const top = ring(0, 0, Math.PI); for (let k = 1; k < top.length; k++) q.p.line(top[k - 1][0], top[k - 1][1], top[k][0], top[k][1], GO[4]);
      const g = rp(0, ry + hgt * 0.5); eDisc(q, g[0], g[1], 0.55 * u, AE[3]); ep(q, g[0] - 0.2 * u, g[1] - 0.2 * u, AE[5]);
      // a thread of the void rising from the helm to the crown
      for (let k = 0; k < 4; k++) { const f = (k + 0.5) / 4, y = lerp(hy - 3.6 * u, cy + hgt, f), x = lerp(hx - 0.2 * u, cx, f) + sin(f + t) * 0.4 * u; ep(F, x, y, k % 2 ? AE[2] : AE[3]); }
      return q;
    };
    commit(F, L, pauld(true));
    if (idle || run) commit(F, L, sword());
    commit(F, L, arm(true, farHand, 1));
    if (w1) commit(F, L, sword());
    commit(F, L, leg(true));
    commit(F, L, leg(false));
    commit(F, L, torso());
    commit(F, L, tassets());
    commit(F, L, helm());
    commit(F, L, pauld(false));
    if (w2 || hurt) commit(F, L, sword());
    commit(F, L, arm(false, nearHand, w1 ? -1 : 1));
    commit(F, L, crown());
    put(F.p, L, false);
    // motes of night drifting up off him; stars spill from the chest when hit
    for (let k = 0; k < 5; k++) { const ph = (t + k * 0.2) % 1, x = sx - 1 * u + hash2(k, 2, 3) * 4 * u - ph * 2 * u, y = sy + 6 * u - ph * 9 * u; ep(F, x, y, ph < 0.5 ? AE[3] : AE[2]); }
    if (hurt) for (let k = 0; k < 7; k++) { const a = -0.3 + k * 0.35, d = (2.6 + hash2(k, 3, 3) * 2.2) * u; ep(F, sx + 0.9 * u + Math.cos(a) * d, sy + 7.2 * u + Math.sin(a) * d, k % 2 ? STAR : LV[4]); }
    F.mouth = [hx + 1.3 * u, hy + 0.5 * u];
  },
};

// ================================================================== The Crown Herald
// Root: the heralds who ride before a king; the trumpets of the last days; heraldry itself. Twist:
// the herald is only its livery. A great imperial crown hovers over an empty hood (two eyes glint
// in the dark under it), its arms are bell sleeves that end in long brass fanfare trumpets, and
// from each trumpet hangs a swallow-tailed banner with the crown on it. The quartered tabard and
// robe fray away below into void. Drawn front-on, symmetrical as a coat of arms.
const crownHerald = {
  view: 'front', box: [62, 46], hover: true, idle: 6, idleFps: 4, scale: 0.98,
  draw(F, o, P) {
    const { u, ox, oy } = F;
    const t = P.t, idle = P.act === 'idle', run = P.act === 'run', w1 = P.atk === 1, w2 = P.atk === 2, hurt = P.hurt;
    const RO = pal5('plum', 4), ROd = RO.map((c) => dark(c, 0.8));
    const LV = pal5('lavender', 5), LVd = LV.map((c) => dark(c, 0.82));
    const GO = pal5('gold', 5), GOd = GO.map((c) => dark(c, 0.8));
    const EYE = C(o.c3 || '#ffd080');
    const sway = idle ? sin(t) * 0.5 * u : run ? sin(t) * 1.2 * u : 0;
    const cx = ox + sway * 0.4, base = oy - 3 * u + (idle ? sin(t) * 0.3 * u : 0);
    const shY = base - 22 * u + (w1 ? 0.6 * u : w2 ? -0.6 * u : hurt ? 0.6 * u : 0);
    const L = layer(F);
    // ---- robe: a bell of plum cloth fraying into void tongues
    const RB = part(F);
    const hemY = base - 3 * u, hw = 8 * u + (w1 ? 0.8 * u : 0);
    const robe = [[cx - 4.4 * u, shY + 1 * u], [cx + 4.4 * u, shY + 1 * u]];
    for (let k = 0; k <= 16; k++) {
      const f = k / 16, x = cx + hw - f * hw * 2 + (run ? -sin(t) * 1.2 * u * (1 - Math.abs(f - 0.5)) : 0);
      const tongue = k % 2 ? 0 : (2.2 + hash2(k, 1, 4) * 1.6) * u + sin(t + k * 0.13) * 0.6 * u;
      robe.push([x, hemY + tongue]);
    }
    sl(RB.p, robe, RO, { wide: true });
    for (let k = 0; k < 4; k++) {
      const f = (k + 0.5) / 4, x0 = cx + (f - 0.5) * 7 * u, x1 = cx + (f - 0.5) * hw * 1.7;
      for (let s2 = 0.1; s2 <= 1; s2 += 0.01) { const x = R(lerp(x0, x1, s2)), y = R(lerp(shY + 4 * u, hemY + 1 * u, s2)); if (RB.p.a(x, y) && RB.p.a(x + 1, y)) { RB.p.set(x, y, RO[1]); RB.p.set(x + 1, y, RO[4]); } }
    }
    // the frayed tongues darken into the void with a violet glow at the tips
    for (let x = 0; x < RB.p.w; x++) {
      const y = lowY(RB.p, x);
      if (y < 0) continue;
      for (let k = 0; k < 3 * u; k++) if (RB.p.a(x, y - k) > 100) RB.p.set(x, y - k, k < 2 ? AE[1] : k < u ? RO[0] : ROd[1]);
      if (hash2(x >> 1, 3, P.i) > 0.8) { ep(RB, x, y, AE[2]); }
    }
    commit(F, L, RB, false);
    // ---- the tabard: quartered lavender and plum, gold-bordered, the crown at its heart
    const TB = part(F);
    const tw0 = 3.4 * u, tw1 = 4.6 * u, tTop = shY + 0.6 * u, tBot = base - 7 * u + (run ? 0 : sin(t) * 0.3 * u);
    const tpts = [[cx - tw0, tTop], [cx + tw0, tTop], [cx + tw1, tBot], [cx + tw1 * 0.5, tBot + 1.4 * u], [cx, tBot + 0.4 * u], [cx - tw1 * 0.5, tBot + 1.4 * u], [cx - tw1, tBot]];
    TB.p.poly(tpts, LV[3]);
    const midY = lerp(tTop, tBot, 0.58);
    for (let y = Math.floor(tTop); y <= tBot + 2 * u; y++) for (let x = Math.floor(cx - tw1); x <= cx + tw1; x++) {
      if (TB.p.a(x, y) < 100) continue;
      const q2 = (x < cx) !== (y < midY);
      TB.p.set(x, y, q2 ? RO[3] : LV[3]);
    }
    cyl(TB.p, LV, { wide: true });
    for (let y = Math.floor(tTop); y <= tBot + 2 * u; y++) for (let x = Math.floor(cx - tw1); x <= cx + tw1; x++) {
      if (TB.p.a(x, y) < 100) continue;
      const q2 = (x < cx) !== (y < midY), c = TB.p.get(x, y);
      if (q2) TB.p.set(x, y, mixc(c, RO[3], 0.75));
    }
    // gold border and seams
    for (let x = 0; x < TB.p.w; x++) { const y = lowY(TB.p, x); if (y >= 0) { TB.p.set(x, y, GO[3]); TB.p.set(x, y - 1, GO[2]); } }
    TB.p.line(cx, tTop, cx, tBot, GO[2]); TB.p.line(cx - tw1, midY, cx + tw1, midY, GO[2]);
    const sig = (L2, x, y, k) => {
      L2.poly([[x - 1.6 * k, y + 0.8 * k], [x + 1.6 * k, y + 0.8 * k], [x + 1.8 * k, y - 1 * k], [x + 0.9 * k, y - 0.1 * k], [x, y - 1.4 * k], [x - 0.9 * k, y - 0.1 * k], [x - 1.8 * k, y - 1 * k]], GO[3]);
      L2.line(x - 1.6 * k, y + 0.8 * k, x + 1.6 * k, y + 0.8 * k, GO[1]);
      L2.set(R(x - 1.2 * k), R(y - 0.2 * k), GO[4]);
    };
    TB.p.disc(cx, midY, 1.9 * u, GO[2]); TB.p.disc(cx, midY, 1.5 * u, RO[1]);
    sig(TB.p, cx, midY + 0.2 * u, 0.8 * u);
    sig(TB.p, cx - 1.9 * u, lerp(tTop, midY, 0.62), 0.6 * u); sig(TB.p, cx + 2.3 * u, lerp(midY, tBot, 0.5), 0.6 * u);
    commit(F, L, TB);
    // ---- trumpets in the sleeves, each hung with a banner
    const ang = idle ? -0.5 + sin(t) * 0.05 : run ? -0.42 : w1 ? -1.25 : w2 ? -0.22 : -0.15;
    const side = (sd) => {
      const q = part(F);
      const shoulder = [cx + sd * 4.2 * u, shY + 1.4 * u];
      const cuff = [cx + sd * (w1 ? 8.4 : 9.6) * u, shY + (w1 ? 1.6 : hurt ? 4.6 : 3.2) * u];
      // a wide bell sleeve with a gold cuff, its mouth dark
      tb(q.p, bez([shoulder, [lerp(shoulder[0], cuff[0], 0.5), shoulder[1] - 0.6 * u], cuff], 10), [1.9 * u, 3 * u], RO);
      q.p.ellipse(cuff[0], cuff[1], 1.2 * u, 3 * u, GO[3]); q.p.ellipse(cuff[0] - sd * 0.3, cuff[1], 0.8 * u, 2.7 * u, GO[2]);
      q.p.ellipse(cuff[0] + sd * 0.5 * u, cuff[1], 0.9 * u, 2.3 * u, VOID);
      // the trumpet: a long brass tube from inside the sleeve to a flared bell
      const a = sd > 0 ? ang : -Math.PI - ang, len = 14 * u, dx = Math.cos(a), dy = Math.sin(a), px = -dy, py = dx;
      const m = [cuff[0] + sd * 0.4 * u, cuff[1]], P_ = (f, o2 = 0) => [m[0] + dx * len * f + px * o2, m[1] + dy * len * f + py * o2];
      // the banner hangs from the tube (behind it): crown sigil, gold fringe, swallowtail
      const p1 = P_(0.14), p2 = P_(0.66);
      const bh = 8.4 * u, wind = idle ? sin(t + (sd > 0 ? 0 : 0.5)) * 0.9 * u : run ? -sd * 0.6 * u + sin(t * 2) * 1 * u : w2 ? -sd * 3 * u : w1 ? sd * 0.8 * u : 0;
      const droop = hurt ? 1.6 * u : 0, bottom = Math.max(p1[1], p2[1]) + bh;
      const ban = [p1, p2, [p2[0] + wind, bottom + droop], [lerp(p1[0], p2[0], 0.5) + wind, bottom - 2.4 * u + droop], [p1[0] + wind, bottom + droop]];
      sl(q.p, ban, LV, { wide: true });
      // a plum chief band across the top of the banner
      const chief = [p1, p2, [p2[0] + wind * 0.25, p2[1] + 2 * u], [p1[0] + wind * 0.25, p1[1] + 2 * u]];
      q.p.poly(chief, RO[3]);
      for (let k = 1; k <= 3; k++) { const A = ban[k], B = ban[(k + 1) % ban.length]; q.p.line(A[0], A[1] - 1, B[0], B[1] - 1, GO[3]); q.p.line(A[0], A[1] - 2, B[0], B[1] - 2, GO[2]); }
      sig(q.p, lerp(p1[0], p2[0], 0.5) + wind * 0.55, lerp(p1[1], p2[1], 0.5) + bh * 0.48, 1 * u);
      // tube, knops, the flaring bell
      tb(q.p, [m, P_(0.8)], 0.5 * u, GO);
      for (const f of [0.1, 0.4]) blob(q.p, [[...P_(f), 0.75 * u, 0.75 * u]], GO);
      tb(q.p, bez([P_(0.66), P_(0.88), P_(1)], 12), (k) => 0.5 * u + k * k * 2 * u, GO);
      // the mouth seen edge-on: a gold rim round a dark throat (blazing when it sounds)
      const mo = P_(1), ell = (cx2, cy2, ra, rb, c) => { const pts = []; for (let k = 0; k < 20; k++) { const th = k / 20 * Math.PI * 2; pts.push([cx2 + px * Math.cos(th) * ra + dx * Math.sin(th) * rb, cy2 + py * Math.cos(th) * ra + dy * Math.sin(th) * rb]); } q.p.poly(pts, c); return pts; };
      ell(mo[0], mo[1], 2.6 * u, 0.7 * u, GO[4]);
      const th = ell(mo[0] + dx * 0.2 * u, mo[1] + dy * 0.2 * u, 2 * u, 0.42 * u, w2 ? AE[5] : GOd[0]);
      if (w2) q.e.poly(th, AE[4]);
      return { q, bell: mo, dx, dy };
    };
    const SL = side(-1), SR = side(1);
    commit(F, L, SL.q); commit(F, L, SR.q);
    // ---- the hood: empty, two eyes in the dark
    const HD = part(F);
    const hy = shY - 3.2 * u;
    blob(HD.p, [[cx, hy + 0.6 * u, 4.4 * u, 3.8 * u], [cx, shY + 0.4 * u, 5 * u, 1.6 * u]], RO);
    HD.p.ellipse(cx, hy + 1 * u, 3 * u, 2.6 * u, VOID);
    HD.p.ellipse(cx, hy - 0.2 * u, 2.6 * u, 1 * u, RO[0]);
    const blink = idle && P.i === 4;
    for (const sd of [-1, 1]) {
      const ex = cx + sd * 1.2 * u - 0.5 * u, ey = hy + 1 * u + (w1 ? 0.3 * u : 0);
      if (hurt || blink) { HD.p.line(ex - 0.2 * u, ey + 0.4 * u, ex + 1.2 * u, ey + (hurt ? 0 : 0.4) * u + (hurt ? sd * 0.4 * u : 0), EYE); HD.e.line(ex - 0.2 * u, ey + 0.4 * u, ex + 1.2 * u, ey + 0.4 * u, EYE); }
      else {
        // stern, slanted eyes; the left a little larger
        const ew = (sd < 0 ? 1.4 : 1.2) * u, eh = (w1 ? 0.55 : 0.85) * u * (sd < 0 ? 1.15 : 1), x0 = sd < 0 ? ex - 0.2 * u : ex;
        const pts = sd < 0 ? [[x0, ey], [x0 + ew, ey + 0.4 * u], [x0 + ew, ey + eh + 0.3 * u], [x0, ey + eh]] : [[x0, ey + 0.4 * u], [x0 + ew, ey], [x0 + ew, ey + eh], [x0, ey + eh + 0.3 * u]];
        HD.p.poly(pts, EYE); HD.e.poly(pts, EYE);
        ep(HD, sd < 0 ? x0 + ew - 1 : x0 + ew - 1, ey + (sd < 0 ? 0.5 * u : 0.1 * u) + 1, WHITE);
      }
    }
    commit(F, L, HD);
    // ---- the crown: imperial, arched, floating over the hood
    const CR = part(F);
    const fl = idle ? sin(t + 0.25) * 0.7 * u : run ? -0.6 * u : w1 ? 0.8 * u : w2 ? -1.6 * u : -1.4 * u;
    const ccx = cx + (hurt ? 1.2 * u : 0), cb = hy - 4.6 * u + fl, cw = 5.4 * u, ch = 2.6 * u;
    const tl = hurt ? 0.26 : 0.07 + (idle ? sin(t) * 0.03 : 0);
    const rp = (x, y) => [ccx + x * Math.cos(tl) - y * Math.sin(tl), cb + x * Math.sin(tl) + y * Math.cos(tl)];
    // velvet cap inside the arches
    blob(CR.p, [[...rp(0, -3.2 * u), 4 * u, 2.8 * u]], RO.map((c) => light(c, 1.1)));
    // arches and the orb-cross
    for (const sd of [-1, 1]) tb(CR.p, bez([rp(sd * cw * 0.9, -ch * 0.6), rp(sd * cw * 0.8, -ch - 3.6 * u), rp(0, -ch - 4.4 * u)], 10), 0.6 * u, GO);
    tb(CR.p, [rp(0, -ch * 0.6), rp(0, -ch - 4.4 * u)], 0.55 * u, GO);
    blob(CR.p, [[...rp(0, -ch - 5.4 * u), 1.1 * u, 1.1 * u]], GO);
    tb(CR.p, [rp(0, -ch - 6.2 * u), rp(0, -ch - 8.2 * u)], 0.4 * u, GO); tb(CR.p, [rp(-0.9 * u, -ch - 7.4 * u), rp(0.9 * u, -ch - 7.4 * u)], 0.4 * u, GO);
    // band with points
    for (let k = 0; k < 5; k++) { const x = (-1 + k / 2) * cw * 0.9, h2 = (k % 2 ? 1.6 : 2.4) * u; CR.p.poly([rp(x - 0.9 * u, -ch * 0.5), rp(x + 0.9 * u, -ch * 0.5), rp(x, -ch * 0.5 - h2)], GO[3]); CR.p.set(...rp(x, -ch * 0.5 - h2 + 1).map(R), GO[4]); }
    sl(CR.p, [rp(-cw, -ch * 0.6), rp(cw, -ch * 0.6), rp(cw * 0.94, ch * 0.4), rp(-cw * 0.94, ch * 0.4)], GO, { wide: true });
    for (let k = 0; k < 5; k++) { const x = (-1 + k / 2) * cw * 0.72; const g = rp(x, -ch * 0.1); eDisc(CR, g[0], g[1], (k === 2 ? 0.8 : 0.55) * u, k % 2 ? AE[3] : EYE); ep(CR, g[0] - 0.25 * u, g[1] - 0.25 * u, WHITE); }
    commit(F, L, CR);
    put(F.p, L, false);
    // a thread of void holds the crown to the hood
    for (let k = 0; k < 3; k++) ep(F, cx + sin(t + k * 0.3) * 0.4 * u, lerp(cb + ch * 0.4, hy - 1.6 * u, (k + 0.5) / 3), AE[3]);
    // the fanfare: rings of sound from both bells
    if (w2) for (const S of [SL, SR]) {
      for (let k = 0; k < 3; k++) {
        const d = (1.4 + k * 2.2) * u, r = (2.6 + k * 1.3) * u, x = S.bell[0] + S.dx * d, y = S.bell[1] + S.dy * d;
        const px = -S.dy, py = S.dx, w = Math.max(2, R((1 - k * 0.25) * 0.5 * u));
        for (let a = -1; a <= 1; a += 0.03) { const xx = x + px * a * r + S.dx * (1 - a * a) * r * 0.45, yy = y + py * a * r + S.dy * (1 - a * a) * r * 0.45; eRect(F, xx, yy, w, w, k === 0 ? AE[5] : k === 1 ? AE[4] : AE[3]); }
      }
    }
    F.mouth = [cx, hy + 1 * u];
  },
};

// ================================================================== Herald of the Rift
// Root: the seraphim and cherubim (six wings, full of eyes) and the trumpet that opens the end of
// the world. Twist: the angel's head is the trumpet. A slender robed seraph of the void whose head
// is a silver trumpet pointed at you: the flared bell is its face, a rift spins in its throat, and
// the tube coils up behind into a loop that serves as its halo. Six pale wings fan round it, every
// feather set with an eye, blinking in waves. The bell's rim is dented on one side.
const riftHerald = {
  view: 'front', box: [46, 42], hover: true, idle: 6, idleFps: 5, scale: 1,
  draw(F, o, P) {
    const { u, ox, oy } = F;
    const t = P.t, idle = P.act === 'idle', run = P.act === 'run', w1 = P.atk === 1, w2 = P.atk === 2, hurt = P.hurt;
    const WG = ['#4a3266', '#6a4a8a', '#8a72b8', '#b8a4dc', '#e6daf4'].map((c) => C(c)), WGd = WG.map((c) => dark(c, 0.8));
    const RB = ['#140c1e', '#211433', '#33204d', '#4a3266', '#6a4a8a'].map((c) => C(c));
    const SV = pal5('steel', 6);
    const IRIS = C(o.c3 || '#a060ff'), SCL = C('#f3e1b5');
    const cx = ox + (run ? sin(t) * 0.5 * u : 0), base = oy - 2.6 * u + (idle ? sin(t) * 0.4 * u : 0) + (w1 ? -0.8 * u : 0);
    const shY = base - 18.4 * u;
    const L = layer(F);
    // ---- six wings, far pairs first: each a fan of broad feathers, an eye set in every other one
    const flap = idle ? sin(t) * 0.1 : run ? 0.22 + sin(t * 2) * 0.08 : w1 ? -0.28 : w2 ? 0.3 : 0.5;
    const wingFan = (root, a0, a1, len, n, Rm, sd, seed, fold) => {
      const q = part(F), eyes = [];
      for (let k = n - 1; k >= 0; k--) {
        const f = k / (n - 1), a = lerp(a0, a1, f), l = len * (0.82 + 0.18 * Math.sin(f * Math.PI)) * (1 - fold * 0.4);
        const tip = [root[0] + Math.cos(a) * l, root[1] + Math.sin(a) * l];
        const mid = [root[0] + Math.cos(a) * l * 0.5 + Math.cos(a + sd * 1.57) * 0.5 * u, root[1] + Math.sin(a) * l * 0.5 + Math.sin(a + sd * 1.57) * 0.5 * u];
        tb(q.p, bez([root, mid, tip], 10), (tt) => (tt < 0.62 ? 1.55 : Math.max(0.35, 1.55 * (1 - tt) / 0.38)) * u, k % 2 ? Rm.map((c) => dark(c, 0.9)) : Rm);
        // the quill
        const qs = bez([root, mid, tip], 10); for (let i = 3; i < 9; i++) q.p.set(R(qs[i][0]), R(qs[i][1]), Rm[1]);
        if (k % 2 === 0) eyes.push([root[0] + Math.cos(a) * l * 0.64, root[1] + Math.sin(a) * l * 0.64, seed * 7 + k]);
      }
      blob(q.p, [[root[0] + Math.cos((a0 + a1) / 2) * 1.8 * u, root[1] + Math.sin((a0 + a1) / 2) * 1.8 * u, 2.4 * u, 1.9 * u]], Rm, { matte: true });
      for (const [x, y, sd2] of eyes) {
        const closed = hurt || (idle && (sd2 + P.i) % 5 === 0) || (run && (sd2 + P.i) % 3 === 0);
        if (closed) { q.p.line(x - 1 * u, y, x + 1 * u, y + 0.3 * u, Rm[0]); q.p.line(x - 1 * u, y + 1, x + 1 * u, y + 0.3 * u + 1, Rm[2]); continue; }
        const big = w1 || w2 ? 1.2 : 1, ew = 1.25 * u * big, eh = 0.8 * u * big;
        q.p.ellipse(x, y, ew + 1, eh + 1, Rm[0]);
        q.p.ellipse(x, y, ew, eh, C('#f4ecff'));
        q.p.ellipse(x, y - eh * 0.75, ew * 0.9, Math.max(1, eh * 0.3), Rm[1]);
        eDisc(q, x + (w2 ? 0 : 0.15 * u), y + 0.1 * u, 0.6 * u * big, IRIS);
        ep(q, x + (w2 ? 0 : 0.15 * u), y + 0.1 * u, VOID);
        q.p.set(R(x - 0.2 * u), R(y - 0.2 * u), WHITE);
      }
      return q;
    };
    const pairs = [
      { r: [2, -1.4], a0: -2.1, a1: -1.2, len: 15, n: 5, far: true },
      { r: [2.8, 0.4], a0: -0.58, a1: -0.02, len: 13, n: 4, far: false },
      { r: [2.4, 2.6], a0: 0.42, a1: 0.95, len: 10, n: 4, far: false },
    ];
    const fold = hurt ? 1 : 0;
    for (const pr of pairs) for (const sd of [-1, 1]) {
      const root = [cx + sd * pr.r[0] * u, shY + pr.r[1] * u];
      const fl = (pr.far ? flap : -flap * 0.6) + (w1 ? -0.25 : 0);
      let a0 = pr.a0 + fl, a1 = pr.a1 + fl;
      if (sd < 0) { a0 = Math.PI - a0; a1 = Math.PI - a1; }
      commit(F, L, wingFan(root, a0, a1, pr.len * u, pr.n, pr.far ? WGd : WG, sd, (pr.len | 0) + (sd > 0 ? 1 : 2), fold), !pr.far);
    }
    // ---- robe: a slender column of void cloth, long sleeves to praying hands, trailing ribbons
    const RO = part(F);
    const hem = base - 6 * u;
    sl(RO.p, [[cx - 2.4 * u, shY - 0.6 * u], [cx + 2.4 * u, shY - 0.6 * u], [cx + 2.6 * u, shY + 4 * u], [cx + 4.4 * u, hem], [cx + 1.4 * u, hem + 0.8 * u], [cx - 1.4 * u, hem + 0.8 * u], [cx - 4.4 * u, hem], [cx - 2.6 * u, shY + 4 * u]], RB, { wide: true });
    for (const k of [-1, 1]) for (let s2 = 0.2; s2 <= 1; s2 += 0.01) { const x = R(cx + k * lerp(1.2, 2.6, s2) * u), y = R(lerp(shY + 4.6 * u, hem, s2)); if (RO.p.a(x, y)) { RO.p.set(x, y, RB[1]); RO.p.set(x + 1, y, RB[4]); } }
    for (let k = 0; k < 5; k++) {
      const x0 = cx + (-3.4 + k * 1.7) * u, sw2 = (idle ? sin(t + k * 0.2) : run ? -0.5 + sin(t * 2 + k * 0.3) * 0.5 : 0) * 1.2 * u;
      tb(RO.p, bez([[x0, hem - 0.5 * u], [x0 + sw2 * 0.5, hem + 2.4 * u], [x0 + sw2, hem + (3.6 + (k % 2) * 1.6) * u]], 8), [0.85 * u, 0.3 * u], k % 2 ? RB : RB.map((c) => light(c, 1.12)));
    }
    RO.p.line(cx - 4.4 * u, hem - 1, cx + 4.4 * u, hem - 1, WG[3]);
    for (let k = 0; k < 3; k++) { const y = lerp(shY + 6.4 * u, hem - 2 * u, k / 2); ep(RO, cx, y, AE[3]); ep(RO, cx - 1, y + 1, AE[2]); ep(RO, cx + 1, y + 1, AE[2]); }
    // sleeves meeting at the chest, pale hands pressed together
    for (const sd of [-1, 1]) tb(RO.p, bez([[cx + sd * 2.6 * u, shY + 0.4 * u], [cx + sd * 2.8 * u, shY + 3 * u], [cx + sd * 0.9 * u, shY + 4 * u]], 8), [1.2 * u, 1.5 * u], RB.map((c) => light(c, 1.15)));
    blob(RO.p, [[cx, shY + 3.2 * u, 0.9 * u, 1.7 * u]], WG);
    RO.p.line(cx, shY + 1.8 * u, cx, shY + 4.6 * u, WG[1]);
    commit(F, L, RO);
    // ---- the trumpet head: a flared bell on a funnel neck, facing you, a rift spinning in its throat
    const HD = part(F);
    const tilt = w1 ? -0.8 * u : w2 ? 0.5 * u : hurt ? 0.8 * u : 0;
    const by = shY - 10.6 * u + tilt, bx = cx + (hurt ? -0.6 * u : 0) + (run ? -0.4 * u : 0);
    const rx = 4.4 * u, ry = 2.9 * u, neckY = shY - 2.2 * u;
    // neck tube with a knop, then the bell's long concave flare up to the mouth
    tb(HD.p, [[cx, shY + 0.2 * u], [bx, neckY]], 0.7 * u, SV);
    blob(HD.p, [[lerp(cx, bx, 0.7), neckY + 0.6 * u, 1.2 * u, 0.7 * u]], SV);
    const flare = [], prof = (f) => 0.7 * u + (rx * 0.97 - 0.7 * u) * f ** 2.6, fy = (f) => lerp(neckY, by + ry * 0.35, f);
    for (let k = 0; k <= 16; k++) { const f = k / 16; flare.push([bx + prof(f), fy(f)]); }
    for (let k = 16; k >= 0; k--) { const f = k / 16; flare.push([bx - prof(f), fy(f)]); }
    sl(HD.p, flare, SV, { wide: true });
    // a lit streak down the left of the flare
    for (let k = 3; k <= 15; k++) { const f = k / 16; HD.p.set(R(bx - prof(f) * 0.55), R(fy(f)), SV[4]); }
    // the rim (dented on the right) and the throat
    const rim = [];
    for (let k = 0; k < 36; k++) { const a = k / 36 * Math.PI * 2, dent = Math.max(0, Math.cos(a + 0.6)) ** 6 * 0.9 * u; rim.push([bx + Math.cos(a) * (rx - dent), by + Math.sin(a) * (ry - dent * 0.6)]); }
    HD.p.poly(rim, SV[4]);
    HD.p.poly(rim.map(([x, y]) => [lerp(x, bx, 0.12), lerp(y, by - 0.2 * u, 0.12)]), SV[2]);
    HD.p.poly(rim.map(([x, y]) => [lerp(x, bx, 0.22), lerp(y, by - 0.2 * u, 0.22)]), VOID);
    const spin = (idle ? t : run ? t * 2 : 0.3) * Math.PI * 2, hot = w1 || w2;
    if (!hurt) for (let arm = 0; arm < 3; arm++) for (let s2 = 0; s2 < 1; s2 += 0.03) {
      const a = spin + arm * Math.PI * 2 / 3 + s2 * 4.2, r = s2 * 3 * u;
      ep(HD, bx + Math.cos(a) * r, by - 0.2 * u + Math.sin(a) * r * 0.62, s2 < 0.3 ? AE[5] : s2 < 0.65 ? AE[4] : AE[2]);
    }
    HD.p.ellipse(bx, by - 0.2 * u, (w2 ? 1.8 : hot ? 1.2 : 0.8) * u, (w2 ? 1.2 : hot ? 0.8 : 0.55) * u, w2 ? AE[6] : AE[5]); HD.e.ellipse(bx, by - 0.2 * u, (w2 ? 1.8 : hot ? 1.2 : 0.8) * u, (w2 ? 1.2 : hot ? 0.8 : 0.55) * u, w2 ? AE[6] : AE[5]);
    if (hurt) { HD.p.line(bx + 2.8 * u, by - 1.8 * u, bx + 1.6 * u, by - 0.4 * u, SV[0]); HD.p.line(bx + 1.6 * u, by - 0.4 * u, bx + 2.2 * u, by + 0.8 * u, SV[0]); }
    HD.p.set(R(bx - 3.4 * u), R(by - 1.4 * u), WHITE); HD.p.set(R(bx - 2.2 * u), R(by + 4.6 * u), WHITE);
    commit(F, L, HD);
    // a thin halo of aether points behind the bell
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2 + (idle ? t * 0.5 : 0); const x = bx + Math.cos(a) * 6.4 * u, y = by + 1 * u + Math.sin(a) * 5.4 * u; if (L.a(R(x), R(y)) < 100) ep(F, x, y, k % 3 ? AE[3] : AE[5]); }
    put(F.p, L, false);
    // the call: rings of aether thrown from the bell
    if (w2) for (let k = 0; k < 3; k++) { const r = (5.4 + k * 1.8) * u; for (let a = 0; a < Math.PI * 2; a += 0.04) if (k < 2 || Math.sin(a * 6) > 0) eRect(F, bx + Math.cos(a) * r, by + Math.sin(a) * r * 0.8, 2, 2, k ? AE[3] : AE[5]); }
    if (w1) for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + 0.2, d = (7.6 - (k % 2) * 1.4) * u; ep(F, bx + Math.cos(a) * d, by + Math.sin(a) * d * 0.8, AE[4]); }
    F.mouth = [bx, by + 0.3 * u];
  },
};

export default {
  void_heart: voidHeart,
  ashen_king: ashenKing,
  hollow_king: hollowKing,
  crown_herald: crownHerald,
  rift_herald: riftHerald,
};
