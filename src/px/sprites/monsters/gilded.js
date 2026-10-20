// Hand-built monster designs: the Gilded Reach. See kit.js for the design format and
// docs/BESTIARY.md for the concepts.
import { C, R, ramp, pal5, layer, put, blob, tube, horn, slab, facet, shard, wing, drape, bez, ik, stride, sin, cos, lerp, clamp, rot, glow, flame, eyeGlow, eyeBead, eyeBall, teeth, maw, rune, spots, stripes, crack, over, rimLight, tint, light, dark, mixc, hash2, srand, bayer, cyl, blank, lowY, topY, WHITE, VOID, BONE, BONE_D, MAW_D, TONGUE, INK, CREAM, PAL } from './kit.js';

// ------------------------------------------------------------------ local helpers
const TAU = Math.PI * 2;
// design units -> buffer pixels for one frame: X(x), Y(y), and whole point lists
const UX = (F) => (x) => F.ox + x * F.u;
const UY = (F) => (y) => F.oy + y * F.u;
const PU = (F, pts) => pts.map(([x, y]) => [F.ox + x * F.u, F.oy + y * F.u]);
const AE = '#c860f0', AE_D = '#a026ef', AE_DD = '#691fc4', HURT = '#f5afd6';
// a fading, dithered wisp of magic light (emissive only, no outline): ellipse at (x, y) in px
function wisp(F, x, y, rx, ry, c, k = 0.55, a = 170) {
  const cc = C(c);
  for (let yy = Math.floor(y - ry); yy <= y + ry; yy++) for (let xx = Math.floor(x - rx); xx <= x + rx; xx++) {
    const d = Math.hypot((xx + 0.5 - x) / rx, (yy + 0.5 - y) / ry);
    if (d < 1 && bayer(xx, yy) < (1 - d) * k * 2) F.e.set(xx, yy, [cc[0], cc[1], cc[2], a]);
  }
}
// a small glowing eye of n x m pixels in one flat colour (eyeGlow lightens a 1-px eye to white)
function dot(F, x, y, c, w = 1, h = 1) { const cc = C(c); F.p.rect(R(x), R(y), w, h, cc); F.e.rect(R(x), R(y), w, h, cc); }
// A gear: a disc with n square teeth, turned by phase (1 = one tooth pitch), shaded as a lit slab,
// with a hub ring. o: { tooth: tooth depth px, squash: y scale, hub: false, contour, c: hub colour }
function cog(L, cx, cy, r, n, phase, Rm, o = {}) {
  const T = blank(L), ri = r - Math.max(1, o.tooth ?? r * 0.24), sq = o.squash ?? 1;
  for (let y = Math.floor(cy - r * sq - 1); y <= cy + r * sq + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
    const dx = x + 0.5 - cx, dy = (y + 0.5 - cy) / sq, d = Math.hypot(dx, dy);
    if (d > r) continue;
    if (d > ri) { const a = (Math.atan2(dy, dx) / TAU) * n + phase; if ((((a % 1) + 1) % 1) > 0.5) continue; }
    T.set(x, y, Rm[3]);
  }
  cyl(T, Rm, { wide: r > 7 });
  if (o.hub !== false && r >= 3) {
    const hr = Math.max(1, ri * 0.45);
    for (let a = 0; a < TAU; a += 0.6 / Math.max(2, ri)) { const x = cx + Math.cos(a) * ri * 0.78, y = cy + Math.sin(a) * ri * 0.78 * sq; over(T, x, y, Math.cos(a) * -0.5 + Math.sin(a) * -0.6 > 0 ? Rm[1] : Rm[4]); }
    T.ellipse(cx, cy, hr, hr * sq, o.c ? C(o.c) : Rm[1]);
    if (hr >= 1.5) T.set(R(cx - hr * 0.4), R(cy - hr * 0.4 * sq), Rm[4]);
  }
  return put(L, T, o.contour ?? true);
}
// A front-facing skull centred on its cranium (x, y) px, cranium radius r px: brow, deep sockets,
// a nose hole, a toothed jaw (o.open px drops it). Returns the socket centres (for eye glows).
function skull(L, x, y, r, Rb, o = {}) {
  const op = o.open || 0;
  blob(L, [[x, y + r * 1.12 + op, r * 0.55, r * 0.3]], Rb);
  blob(L, [[x, y, r, r * 0.9], [x, y + r * 0.72, r * 0.68, r * 0.42]], Rb);
  const ex = r * 0.4, ey = y + r * 0.18, er = Math.max(0.7, r * 0.27);
  for (const s of [-1, 1]) L.ellipse(x + s * ex, ey, er * (s === (o.wink || 0) ? 0.6 : 1), er * 1.1, VOID);
  if (r >= 3) L.poly([[x - r * 0.12, y + r * 0.66], [x + r * 0.12, y + r * 0.66], [x, y + r * 0.42]], VOID); else L.set(R(x), R(y + r * 0.55), VOID);
  if (r >= 2.5) { const ty = R(y + r * 0.98); for (let xx = Math.floor(x - r * 0.45); xx <= x + r * 0.45; xx += 2) L.set(xx, ty, Rb[1]); if (op >= 1) L.rect(R(x - r * 0.4), ty + 1, Math.max(1, R(r * 0.8)), Math.max(1, R(op)), VOID); }
  return [[x - ex, ey], [x + ex, ey]];
}
// an ellipse hole: paint an opening (void) with a glow deep inside, into p and e
function hole(F, L, x, y, rx, ry, c) {
  L.ellipse(x, y, rx, ry, VOID);
  if (c) { const cc = C(c); L.ellipse(x + rx * 0.15, y + ry * 0.2, rx * 0.5, ry * 0.5, cc); F.e.ellipse(x + rx * 0.15, y + ry * 0.2, rx * 0.5, ry * 0.5, cc); }
}

// enemy id -> { design, name, body? }: folded into src/data/enemies.js at integration
export const assign = {
  marble_sentinel: { design: 'lamassu', name: 'Lamassu', body: 'quadruped' },
  gilded_revenant: { design: 'legionary', name: 'Death-Mask Legionary' },
  hollow_senator: { design: 'hollow_senator', name: 'Hollow Senator' },
  gilded_lion: { design: 'clockwork_lion', name: 'Clockwork Lion' },
  plague_rat: { design: 'rat_king', name: 'Rat King' },
  ghoul: { design: 'lantern_ghoul', name: 'Ghoul' },
  wraith: { design: 'candle_wraith', name: 'Candle Wraith' },
  bone_warden: { design: 'bone_warden', name: 'The Bone Warden' },
};

export default {
  // Lamassu (marble_sentinel): the gate guardian of the old empire. A marble bull with a crowned,
  // bearded human face and great straight-feathered wings; the beard is braided gold rows.
  lamassu: {
    view: 'side', box: [34, 30], pivot: 0.42, idleFps: 2.5, scale: 0.66,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const M = pal5('sand', 6), Md = M.map((c) => dark(c, 0.86)), G = pal5('gold', 5), Gd = G.map((c) => dark(c, 0.8));
      const t = P.t, run = P.act === 'run', charge = P.act === 'atk';
      const dip = charge ? (P.atk === 1 ? -1.2 * u : 1.6 * u) : 0;               // head lowers into the charge
      const bob = run ? Math.abs(sin(t)) * -0.8 * u : P.act === 'idle' ? sin(t) * 0.3 * u : 0;
      const bx = ox, by = oy - 12.5 * u + bob;                                       // barrel centre
      const L = layer(F);
      // far wing first: a darker copy raised behind the near one
      const flap = run ? sin(t) * 0.18 : P.act === 'idle' ? sin(t) * 0.04 : charge ? -0.25 : 0;
      wing(L, bx + 1 * u, by - 4 * u, -2.2 + flap, 14 * u, 1.15, Md, 'feather', { n: 7 });
      // far legs
      const leg = (hipX, ph, far) => {
        const Lg = layer(F), Rl = far ? Md : M;
        const hip = [hipX, by + 2 * u];
        const [dx, lift] = run ? stride(ph, 6 * u, 2.4 * u) : [charge && P.atk === 2 ? (hipX > bx ? 2.5 * u : -2.5 * u) : 0, 0];
        const foot = [hipX + dx, oy - lift - 1.2 * u];
        const knee = ik(hip, foot, 5.6 * u, 5.4 * u, hipX > bx ? -1 : 1);
        tube(Lg, [hip, knee], [2.6 * u, 2 * u], Rl, { tex: 3 });
        tube(Lg, [knee, foot], [1.8 * u, 1.6 * u], Rl, { tex: 3 });
        // gold hoof band and hoof
        slab(Lg, [[foot[0] - 1.9 * u, foot[1] - 0.6 * u], [foot[0] + 1.9 * u, foot[1] - 0.6 * u], [foot[0] + 2.2 * u, foot[1] + 1.2 * u], [foot[0] - 1.9 * u, foot[1] + 1.2 * u]], far ? Gd : G);
        put(L, Lg, !far);
      };
      leg(bx + 6.5 * u, t + 0.5, true); leg(bx - 6 * u, t, true);
      // tail: a braided cord with a gold tassel
      const tl = layer(F), tw = run ? sin(t) * 1.2 * u : sin(t) * 0.5 * u;
      tube(tl, [[bx - 9 * u, by - 1 * u], [bx - 12 * u, by + 1 * u + tw], [bx - 12.5 * u, by + 6 * u + tw]], [1 * u, 0.6 * u], Md);
      blob(tl, [[bx - 12.6 * u, by + 7.2 * u + tw, 1.3 * u, 1.8 * u]], G);
      put(L, tl, true);
      // body: chest, barrel, rump; carved fur curls in rows on the chest
      const B = layer(F);
      blob(B, [[bx + 5.5 * u, by - 0.5 * u, 6.8 * u, 6 * u], [bx, by + 0.4 * u, 8 * u, 5.2 * u], [bx - 6.2 * u, by - 0.2 * u, 5.4 * u, 5 * u]], M, { tex: 7 });
      for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) {
        const cx = bx + (4.6 + k * 1.7 - r * 0.6) * u, cy = by + (-2 + r * 2) * u;
        over(B, cx, cy, M[1]); over(B, cx + 1, cy, M[1]); over(B, cx, cy - 1, M[4]);
      }
      // gold harness band around the barrel
      for (let y = R(by - 5 * u); y <= by + 5.6 * u; y++) for (let w = 0; w < Math.max(2, R(1.1 * u)); w++) { const x = R(bx - 1 * u + w + (y - by) * 0.18); if (B.a(x, y)) B.set(x, y, w === 0 ? G[4] : G[3]); }
      put(L, B, true);
      // near legs
      leg(bx - 5 * u, t + 0.5, false); leg(bx + 7.5 * u, t, false);
      // near wing over the body: rows of long straight feathers, gilded leading edge
      wing(L, bx + 1.5 * u, by - 4.5 * u, -2.35 + flap, 15 * u, 1.1, M, 'feather', { n: 7 });
      // head: a man's face on a thick neck, tall horned crown, square braided beard
      const hx = bx + 11.5 * u, hy = by - 9 * u + dip;
      const v = u; { const u = v * 1.55;   // the head is drawn half again as big: chunky proportions
      const Hd = layer(F);
      tube(Hd, [[bx + 7 * v, by - 3 * v], [hx - 1 * v, hy + 2 * v]], [3.6 * v, 3 * v], M, { tex: 7 });
      // beard: a trapezoid of gold braid rows
      const bTop = hy + 1.6 * u, bBot = hy + 6.4 * u + (charge ? 0.6 * u : 0);
      slab(Hd, [[hx - 2.6 * u, bTop], [hx + 2.6 * u, bTop], [hx + 2 * u, bBot], [hx - 2.2 * u, bBot - 0.6 * u]], Gd, { wide: true });
      for (let y = bTop + 1.2 * u; y < bBot - 0.4 * u; y += 1.6 * u) for (let x = hx - 2 * u; x < hx + 2 * u; x += 1.2 * u) { over(Hd, x, y, G[4]); over(Hd, x + 1, y + 1, G[1]); }
      // face
      blob(Hd, [[hx, hy - 0.6 * u, 3 * u, 3 * u], [hx + 2.2 * u, hy + 0.4 * u, 1.1 * u, 1.4 * u]], M);
      // nose bridge + brow
      facet(Hd, [[hx + 2.4 * u, hy - 1.6 * u], [hx + 3.2 * u, hy + 0.6 * u], [hx + 2.2 * u, hy + 0.8 * u]], M[3]);
      Hd.line(hx + 0.4 * u, hy - 1.8 * u, hx + 2.6 * u, hy - 1.7 * u, M[1]);
      // moustache curl
      Hd.line(hx + 1 * u, hy + 1.2 * u, hx + 2.8 * u, hy + 1.2 * u, G[2]);
      // crown: a tall cylinder with three stacked horn pairs curling round it, a feathered top
      const cTop = hy - 7 * u, cBot = hy - 2.8 * u;
      slab(Hd, [[hx - 2.4 * u, cBot], [hx + 2.6 * u, cBot], [hx + 2.2 * u, cTop], [hx - 2 * u, cTop]], M, { wide: true });
      for (let k = 0; k < 2; k++) {
        const y = cBot - (1.2 + k * 2) * u;
        horn(Hd, [hx - 1.6 * u, y], [hx + 1.2 * u, y + 1.2 * u], [hx + 3.4 * u, y - 0.6 * u], 1.1 * u, G);
      }
      slab(Hd, [[hx - 2.6 * u, cTop + 0.2 * u], [hx + 2.8 * u, cTop + 0.2 * u], [hx + 2.2 * u, cTop - 1.4 * u], [hx - 2 * u, cTop - 1.4 * u]], G);
      for (let x = hx - 1.6 * u; x <= hx + 1.8 * u; x += 1.1 * u) { Hd.line(x, cTop - 1.4 * u, x + 0.3 * u, cTop - 3 * u, G[3]); Hd.set(R(x + 0.3 * u), R(cTop - 3 * u), G[4]); }
      // ear with a gold ring
      blob(Hd, [[hx - 1.6 * u, hy - 0.4 * u, 0.9 * u, 1.4 * u]], M);
      Hd.set(R(hx - 1.6 * u), R(hy + 1.2 * u), G[4]);
      put(L, Hd, true);
      put(F.p, L, false);
      // inlaid lapis eye, glowing gold when it means harm
      eyeGlow(F, hx + 1.2 * u, hy - 1.2 * u, Math.max(2, 1.2 * u), Math.max(1, 0.8 * u), P.hurt ? '#f5afd6' : o.c3 || '#e8c35a', { brow: true });
      if (P.hurt) crack(F.p, hx - 0.5 * u, hy - 3 * u, 1.2, 5 * u, M[0], 9);
      F.mouth = [hx + 2.4 * u, hy + 1.8 * u];
      }
    },
  },
  // Death-Mask Legionary (gilded_revenant): a legionary with no one left inside. A crested helm, a
  // gold death-mask, a hooped cuirass and two empty gauntlets hover in formation, held together by
  // violet ghost-light; the near gauntlet drives its pilum out on the strike, the sun shield guards
  // the front. The pieces scatter apart when hit.
  legionary: {
    view: 'side', box: [30, 31], pivot: 0.4, idleFps: 3, hover: true,
    draw(F, o, P) {
      const { u } = F, X = UX(F), Y = UY(F);
      const G = pal5('gold', 5), Bz = pal5('gold', 4), Bzd = Bz.map((c) => dark(c, 0.8)), S = pal5('steel', 5), Rr = pal5('red', 5), Rd = Rr.map((c) => dark(c, 0.8)), W = pal5('wood', 5);
      const t = P.t, idle = P.act === 'idle', run = P.act === 'run', w1 = P.atk === 1, w2 = P.atk === 2, hurt = P.hurt;
      const bob = (ph, a = 0.5) => (idle ? sin(t + ph) * a : run ? sin(t * 2 + ph) * a * 0.6 : 0);
      const lean = run ? 0.8 : w1 ? -1 : w2 ? 1.4 : hurt ? -1.2 : 0;
      // piece anchors in design units: each piece floats on its own phase
      const cx = lean * 0.5, cy = -10.8 + bob(0);
      const hx = 0.6 + lean * 1.2 + (hurt ? -1.2 : 0), hy = -21.4 + bob(0.3) + (hurt ? -2 : 0) + (w1 ? -0.5 : 0);
      const sx = 5.8 + lean * 0.9 + (w2 ? 1.4 : 0) + (hurt ? -0.2 : 0), sy = -10.2 + bob(0.55) + (hurt ? 1.2 : 0);
      let gx = 3.4 + lean + (run ? sin(t) * 0.7 : 0), gy = -15.6 + bob(0.8), ga = 0.1;
      if (w1) { gx = -4.2; gy = -18.4; ga = -0.16; }
      if (w2) { gx = 11.6; gy = -14.6; ga = 0.02; }
      if (hurt) { gx = 1.4; gy = -18.4; ga = -0.55; }
      const L = layer(F);
      // ghost-light in the empty neck between collar and mask
      const gl = idle ? 0.5 + sin(t * 2) * 0.14 : 0.58;
      wisp(F, X(lerp(cx + 0.5, hx + 0.6, 0.5)), Y(lerp(cy - 4.2, hy + 3, 0.5)), 1.9 * u, 2.6 * u, AE_D, gl);
      // pteruges: crimson leather tongues with gold studs, trailing when it moves
      const Pt = layer(F), sw = (run ? -1.1 : 0) + (w2 ? -0.8 : 0) + (w1 ? 0.5 : 0) + (idle ? sin(t + 0.4) * 0.35 : 0);
      const y0 = cy + 2.8;
      for (let k = 0; k < 5; k++) {
        const x = cx - 2.8 + k * 1.4, len = 3.2 - Math.abs(k - 2) * 0.35 + (k % 2) * 0.3, s2 = sw * (0.8 + k * 0.1);
        slab(Pt, PU(F, [[x - 0.65, y0], [x + 0.65, y0], [x + 0.55 + s2, y0 + len], [x - 0.55 + s2, y0 + len]]), k % 2 ? Rd : Rr);
        over(Pt, X(x + s2), Y(y0 + len) - 1, G[4]);
      }
      put(L, Pt, true);
      // cuirass: a chest of hooped plates with gilt edges, round an empty barrel
      const Cu = layer(F);
      blob(Cu, [[X(cx + 0.5), Y(cy - 1), 3.6 * u, 3.4 * u], [X(cx), Y(cy + 1.6), 2.9 * u, 2.2 * u]], S);
      for (let k = 0; k < 3; k++) {
        const by = cy - 0.4 + k * 1.45;
        for (let x = Math.floor(X(cx - 4.4)); x <= X(cx + 4.4); x++) {
          const f = (x - X(cx)) / (4 * u), yy = Y(by) + f * f * 1.1 * u;
          over(Cu, x, yy, S[0]); over(Cu, x, yy + 1, S[4]);
        }
      }
      // shoulder lames
      blob(Cu, [[X(cx - 0.3), Y(cy - 3), 2.6 * u, 1.7 * u]], S, { lift: 0.1 });
      for (let a = 3.3; a <= 6.1; a += 0.05) { over(Cu, X(cx - 0.3) + Math.cos(a) * 1.5 * u, Y(cy - 2.8) + Math.sin(a) * 0.9 * u, S[1]); over(Cu, X(cx - 0.3) + Math.cos(a) * 2.5 * u, Y(cy - 2.9) + Math.sin(a) * 1.6 * u, G[3]); }
      // gold buckles down the chest
      for (let k = 0; k < 3; k++) { const bx = X(cx + 3.3 - k * 0.25), by = Y(cy - 0.9 + k * 1.45); over(Cu, bx, by, G[4]); over(Cu, bx - 1, by, G[3]); }
      // the empty collar: a dark opening with ghost-light down inside
      hole(F, Cu, X(cx + 0.6), Y(cy - 4.1), 1.8 * u, 0.65 * u, AE_DD);
      put(L, Cu, true);
      // helm: tall crimson crest, bronze bowl, flared neck guard; hollow under the brim
      const Hm = layer(F), cs = run ? -1.2 : w1 ? -0.7 : w2 ? 0.5 : idle ? sin(t + 0.6) * 0.45 : 0;
      const ccx = hx - 0.9, ccy = hy - 2.6;
      const outer = [], inner = [];
      for (let k = 0; k <= 14; k++) {
        const a = Math.PI * (1.02 + 0.98 * (k / 14)), f = k / 14;
        outer.push([ccx + Math.cos(a) * 4.3 + cs * (1 - f) * 0.9, ccy + Math.sin(a) * (4.5 - Math.abs(cs) * 0.3 * (1 - f))]);
        inner.unshift([ccx + Math.cos(a) * 2.2, ccy + Math.sin(a) * 1.2 + 0.4]);
      }
      const Cr = layer(F);
      slab(Cr, PU(F, [...outer, ...inner]), Rr, { wide: true });
      for (let k = 1; k < 14; k += 2) { const p = PU(F, [outer[k], inner[14 - k]]); for (let s = 0.15; s < 0.85; s += 0.08) over(Cr, lerp(p[0][0], p[1][0], s), lerp(p[0][1], p[1][1], s), Rr[2]); }
      for (let k = 0; k <= 14; k += 2) { const p = PU(F, [outer[k]])[0]; Cr.set(R(p[0] + (k / 14 - 0.5) * 1.5), R(p[1]) - 1, Rr[3]); }
      put(Hm, Cr, false);
      const Bw = layer(F);
      slab(Bw, PU(F, [[hx - 2.4, hy - 1.6], [hx - 1, hy - 0.8], [hx - 2.7, hy + 1.3], [hx - 4.8, hy + 1.1]]), Bz);
      blob(Bw, [[X(hx - 0.2), Y(hy - 1.5), 3.1 * u, 2.7 * u]], Bz, { clipY: R(Y(hy - 0.5)) });
      Bw.line(X(hx - 2.9), Y(hy - 0.6), X(hx + 2.9), Y(hy - 0.8), Bz[1]);
      Bw.line(X(hx - 2.7), Y(hy - 1.1), X(hx + 2.7), Y(hy - 1.3), Bz[4]);
      Bw.ellipse(X(hx - 1.4), Y(hy + 0.3), 1.5 * u, 1 * u, VOID);
      put(Hm, Bw, true);
      // the death-mask: a serene pale-gold face, eyes shut but burning through the lids
      const Mk = layer(F), mx = hx + 0.9, my = hy + 0.7;
      blob(Mk, [[X(mx), Y(my), 2.2 * u, 2.7 * u], [X(mx + 2), Y(my + 0.1), 0.7 * u, 1.1 * u]], G, { lift: 0.3 });
      Mk.line(X(mx - 0.3), Y(my - 1.1), X(mx + 1.7), Y(my - 1.3), G[1]);
      Mk.line(X(mx + 0.5), Y(my + 1.5), X(mx + 1.9), Y(my + 1.4), G[0]);
      over(Mk, X(mx + 0.5), Y(my + 1.5) - 1, G[1]);
      crack(Mk, X(mx - 0.9), Y(my + 0.4), 1.2, (hurt ? 4.5 : 2.2) * u, G[0], 4);
      put(Hm, Mk, true);
      // cheek guard over the near side of the face
      slab(Hm, PU(F, [[hx - 1.5, hy - 0.6], [hx + 0.1, hy - 0.5], [hx + 0.1, hy + 1.8], [hx - 0.7, hy + 2.7], [hx - 1.5, hy + 2.2]]), Bz);
      put(L, Hm, true);
      // sun shield: a gilt rim, a crimson field, a gold sun of eight short rays round a raised boss
      const Sh = layer(F), srx = 3.2 * u, sry = 4.6 * u, shx = X(sx), shy = Y(sy);
      blob(Sh, [[shx, shy, srx, sry]], G);
      blob(Sh, [[shx + 0.1 * u, shy + 0.1 * u, srx - 0.6 * u, sry - 0.6 * u]], Rr, { lift: -0.1 });
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU + 0.39, ca = Math.cos(a), sa = Math.sin(a), lit = ca * -0.48 + sa * -0.62;
        Sh.line(shx + ca * 1.2 * u, shy + sa * 1.4 * u, shx + ca * 2 * u, shy + sa * 2.9 * u, lit > 0.2 ? G[4] : G[3]);
      }
      blob(Sh, [[shx + 0.1 * u, shy, 1.05 * u, 1.3 * u]], G, { lift: 0.15 });
      Sh.set(R(shx - 0.6 * u), R(shy - 0.8 * u), WHITE);
      put(L, Sh, true);
      // pilum: wooden shaft, long iron shank, small pyramid head; the near gauntlet grips it
      const Sp = layer(F), dx = Math.cos(ga), dy = Math.sin(ga);
      const butt = [gx - dx * 7, gy - dy * 7], sh0 = [gx + dx * 4.6, gy + dy * 4.6], tip = [gx + dx * 10, gy + dy * 10];
      tube(Sp, PU(F, [butt, sh0]), 0.48 * u, W);
      tube(Sp, PU(F, [sh0, tip]), 0.3 * u, S);
      Sp.disc(X(sh0[0]), Y(sh0[1]), 0.6 * u, S[3]);
      shard(Sp, X(tip[0]), Y(tip[1]), ga, 2.4 * u, 0.85 * u, S);
      put(L, Sp, true);
      const Ng = layer(F);
      slab(Ng, PU(F, [[gx - 0.5, gy - 1.1], [gx - 0.5, gy + 1.1], [gx - 2.6, gy + 1.5], [gx - 2.6, gy - 1.5]]), Bz);
      blob(Ng, [[X(gx), Y(gy), 1.25 * u, 1.15 * u]], G);
      Ng.line(X(gx + 0.1), Y(gy - 0.9), X(gx + 0.1), Y(gy + 0.9), G[1]);
      hole(F, Ng, X(gx - 2.6), Y(gy), 0.45 * u, 1.35 * u, AE);
      put(L, Ng, true);
      put(F.p, L, false);
      // eyes: violet light through closed gilt lids
      const ec = hurt ? HURT : AE;
      eyeGlow(F, X(mx + 0.2), Y(my - 0.6), Math.max(2, 1.4 * u), Math.max(1, 0.6 * u), ec);
      eyeGlow(F, X(mx + 1.8), Y(my - 0.7), 1, Math.max(1, 0.6 * u), ec);
      // the gauntlet flies out of formation on the strike, trailing its tether of light
      if (w2) { wisp(F, X(gx - 5), Y(gy), 3.4 * u, 1.1 * u, AE_D, 0.55); }
      if (hurt) wisp(F, X(hx), Y(hy + 4), 2.6 * u, 1.4 * u, HURT, 0.4);
      if (run) for (let k = 0; k < 3; k++) wisp(F, X(cx - 4.5 - k * 1.8), Y(cy - 2 + k * 1.6 + sin(t + k * 0.3) * 0.5), 1.4 * u, 0.9 * u, AE_D, 0.42 - k * 0.08);
    },
  },
  // Hollow Senator (hollow_senator): a senator's toga hanging on nothing, crowned by a cracked marble
  // bust with a gilt laurel. The back of the skull has broken away and the void it speaks with wells
  // out of it; the nose is chipped off. A broken statue hand floats from the toga holding a wax voting
  // tablet, and the pages of its last decree orbit it. It votes against you: the tablet fires.
  hollow_senator: {
    view: 'side', box: [28, 30], pivot: 0.45, idleFps: 3, hover: true,
    draw(F, o, P) {
      const { u } = F, X = UX(F), Y = UY(F);
      const Mb = ramp('#d0c8c0'), Mbd = Mb.map((c) => dark(c, 0.86)), Tg = pal5('sand', 5), Pl = pal5('plum', 5), G = pal5('gold', 5), W = pal5('wood', 5), Pg = pal5('sand', 6);
      const t = P.t, idle = P.act === 'idle', run = P.act === 'run', w1 = P.atk === 1, w2 = P.atk === 2, hurt = P.hurt;
      const bob = idle ? sin(t) * 0.45 : run ? sin(t * 2) * 0.2 : 0;
      const lean = run ? 1 : w1 ? -0.8 : w2 ? 1 : hurt ? -1.4 : 0;
      const tx = lean * 0.6, top = -15.4 + bob;
      // the decree's pages orbit the body (screen y drops toward the viewer)
      const pr = w1 ? 0.75 : w2 ? 1.25 : hurt ? 1.35 : 1;
      const pages = [0, 1, 2].map((k) => {
        const a = (t + k / 3 + (run ? 0.08 : 0)) * TAU, z = Math.sin(a);
        return { x: tx + Math.cos(a) * 7.8 * pr - (run ? 1.5 : 0), y: -10.5 + z * 2.2 + sin(t * 2 + k * 0.37) * 0.6 + (hurt ? -k * 1.2 : 0), z, ang: Math.cos(a) * 0.45 + (k - 1) * 0.35 + (hurt ? k : 0) };
      });
      const page = (L, p) => {
        const R0 = p.z < 0 ? Pg.map((c) => dark(c, 0.82)) : Pg;
        const cs = [[-1.4, -1.8], [1.1, -1.8], [1.4, -1.4], [1.4, 1.8], [-1.4, 1.8]].map(([x, y]) => { const [a, b] = rot(x, y, p.ang); return [p.x + a, p.y + b]; });
        const Lp = layer(F);
        slab(Lp, PU(F, cs), R0);
        for (let k = 0; k < 3; k++) { const [ax, ay] = rot(-0.8, -0.9 + k * 0.9, p.ang), [bx, by] = rot(k === 2 ? 0.1 : 0.7, -0.9 + k * 0.9, p.ang); Lp.line(X(p.x + ax), Y(p.y + ay), X(p.x + bx), Y(p.y + by), Pl[1]); }
        put(L, Lp, true);
      };
      const L = layer(F);
      for (const p of pages) if (p.z < 0) page(L, p);
      // toga: cream wool belled out over nothing, a broad purple senator's border along the hem
      const Tl = layer(F), trail = (run ? 2.6 : w2 ? 1.3 : w1 ? -0.6 : idle ? sin(t) * 0.6 : 0) * u;
      drape(Tl, X(tx), Y(top), 6 * u, 12 * u, 12.6 * u, Tg, { folds: 3, lean: trail, phase: t, teeth: 4, ragged: true, seed: 5, wave: 0.8 * u });
      blob(Tl, [[X(tx + 0.1), Y(top + 1.4), 3.7 * u, 2.4 * u]], Tg);
      for (let x = 0; x < Tl.w; x++) { const y = lowY(Tl, x); if (y > Y(top + 6)) { Tl.set(x, y, Pl[2]); if (Tl.a(x, y - 1)) Tl.set(x, y - 1, Pl[3]); if (Tl.a(x, y - 2)) Tl.set(x, y - 2, Pl[4]); } }
      // the sinus: a heavy fold slung from the far shoulder down across the chest to the near arm
      const Sn = layer(F), sw = idle ? sin(t + 0.2) * 0.3 : 0;
      slab(Sn, PU(F, [[tx - 3.4, top + 0.4], [tx - 1.2, top - 0.2], [tx + 4.4 + sw, top + 5.6], [tx + 4.6 + sw, top + 8.8], [tx + 3.2 + sw, top + 9.6], [tx + 0.6, top + 6]]), Tg, { wide: true });
      for (let s = 0; s <= 1; s += 0.03) { const x = X(lerp(tx - 3.3, tx + 3.4 + sw, s)), y = Y(lerp(top + 1.5, top + 9.4, s)); over(Sn, x, y, Pl[3]); over(Sn, x, y - 1, Pl[4]); }
      put(Tl, Sn, true);
      // deep folds falling to the hem
      for (const [fx, f0] of [[-3, 4], [-0.6, 7.5], [2.6, 9.5]]) for (let y = Y(top + f0); y < Y(top + 13); y++) { const f = (y - Y(top + f0)) / (Y(top + 13) - Y(top + f0)), x = X(tx + fx + f * fx * 0.35) - trail * f * 0.9; over(Tl, x, y, Tg[1]); over(Tl, x - 1, y, Tg[4]); }
      put(L, Tl, true);
      // the broken statue hand and its wax tablet (the vote it casts against you)
      let hdx = tx + 4.4, hdy = -9.6 + bob * 0.6, ta = 0.12;
      if (w1) { hdx = tx + 2.2; hdy = -18.8; ta = -0.3; }
      if (w2) { hdx = tx + 7.6; hdy = -12; ta = 0.45; }
      if (hurt) { hdx = tx + 3; hdy = -7.8; ta = 0.6; }
      const Hn = layer(F), tcx = hdx + 1.4, tcy = hdy - 1;
      const tb = [[-1.6, -2.1], [1.6, -2.1], [1.6, 2.1], [-1.6, 2.1]].map(([x, y]) => { const [a, b] = rot(x, y, ta); return [tcx + a, tcy + b]; });
      slab(Hn, PU(F, tb), W);
      const ti = [[-1, -1.5], [1, -1.5], [1, 1.5], [-1, 1.5]].map(([x, y]) => { const [a, b] = rot(x, y, ta); return [tcx + a, tcy + b]; });
      facet(Hn, PU(F, ti), w1 || w2 ? '#4a1a48' : '#3e1c2c');
      tube(Hn, PU(F, [[hdx - 1.8, hdy + 1.3], [hdx - 0.2, hdy + 0.3]]), 0.8 * u, Mb);
      Hn.ellipse(X(hdx - 1.9), Y(hdy + 1.35), 0.55 * u, 0.65 * u, Mbd[1]);
      blob(Hn, [[X(hdx), Y(hdy), 1 * u, 0.9 * u], [X(hdx + 0.5), Y(hdy - 0.5), 0.5 * u, 0.7 * u]], Mb);
      put(L, Hn, true);
      // the scratched vote: a "V" that burns when it is cast
      { const vc = C(w1 || w2 ? AE : G[3]), c0 = rot(-0.6, -0.9, ta), c1 = rot(0, 0.9, ta), c2 = rot(0.6, -0.9, ta);
        for (const L2 of w1 || w2 ? [F.p, F.e] : [F.p]) { L2.line(X(tcx + c0[0]), Y(tcy + c0[1]), X(tcx + c1[0]), Y(tcy + c1[1]), vc); L2.line(X(tcx + c1[0]), Y(tcy + c1[1]), X(tcx + c2[0]), Y(tcy + c2[1]), vc); } }
      wisp(F, X(hdx - 2), Y(hdy + 1.4), 1.3 * u, 1.1 * u, AE_D, 0.5);
      F.mouth = [X(tcx), Y(tcy)];
      // the bust: a big haughty Roman head turned three-quarters, a stern brow, a chipped nose
      const hx = tx + 0.7 + (hurt ? -0.9 : 0) + (w1 ? -0.3 : 0), hy = -19 + bob * 1.2 + (hurt ? -0.3 : 0) + (w1 ? -0.3 : 0);
      const up = w1 ? -0.4 : hurt ? -0.5 : 0;
      const Hd = layer(F);
      tube(Hd, PU(F, [[hx + 0.2, hy + 2.6], [tx + 0.2, top + 0.8]]), 1.7 * u, Mb);
      blob(Hd, [[X(hx), Y(hy - 0.5), 3.3 * u, 3.3 * u], [X(hx + 0.7), Y(hy + 1.5 + up * 0.3), 2.5 * u, 2 * u]], Mb);
      blob(Hd, [[X(hx - 2.8), Y(hy + 0.1), 0.7 * u, 1.1 * u]], Mb);
      // brow ridge frowning toward the nose, sunken blank eyes
      Hd.line(X(hx - 0.9), Y(hy - 1.3 + up), X(hx + 0.8), Y(hy - 0.9 + up), Mb[0]);
      Hd.line(X(hx + 1.5), Y(hy - 0.9 + up), X(hx + 2.9), Y(hy - 1.3 + up), Mb[0]);
      Hd.rect(R(X(hx - 0.6)), R(Y(hy - 0.6 + up)), Math.max(2, R(1.2 * u)), 1, Mb[1]);
      Hd.rect(R(X(hx + 1.7)), R(Y(hy - 0.6 + up)), Math.max(2, R(1 * u)), 1, Mb[1]);
      // the nose: a long ridge, its tip broken off flat
      slab(Hd, PU(F, [[hx + 1.0, hy - 0.8 + up], [hx + 1.7, hy - 0.8 + up], [hx + 2.3, hy + 0.9 + up], [hx + 1.1, hy + 0.9 + up]]), Mb);
      Hd.line(X(hx + 1.2), Y(hy + 0.9 + up), X(hx + 2.2), Y(hy + 0.9 + up), Mbd[0]);
      // the mouth: a cold downturned line, opening when it speaks
      if (w1 || w2) Hd.ellipse(X(hx + 1.3), Y(hy + 2.1 + up), 0.9 * u, (w2 ? 0.8 : 0.5) * u, VOID);
      else { Hd.line(X(hx + 0.6), Y(hy + 2.1 + up), X(hx + 2.1), Y(hy + 2.1 + up), Mb[0]); Hd.set(R(X(hx + 0.6)) - 1, R(Y(hy + 2.1 + up)) + 1, Mb[0]); Hd.set(R(X(hx + 2.1)) + 1, R(Y(hy + 2.1 + up)) + 1, Mb[0]); }
      // the crown of the skull has broken away at the back: hollow, the void wells out of it
      const bkx = X(hx - 1.9), bky = Y(hy - 3);
      for (let y = Math.floor(bky - 2 * u); y <= bky + 1.6 * u; y++) for (let x = Math.floor(bkx - 2.2 * u); x <= bkx + 1.8 * u; x++) {
        const d = Math.hypot((x + 0.5 - bkx) / (1.8 * u), (y + 0.5 - bky) / (1.5 * u)) + hash2(x >> 1, y >> 1, 7) * 0.3;
        if (d < 1 && Hd.a(x, y)) Hd.clear(x, y);
      }
      Hd.ellipse(bkx + 0.6 * u, bky + 0.7 * u, 1.1 * u, 0.7 * u, VOID);
      put(L, Hd, true);
      // laurel: a band of gilt leaves across the brow, purple ribbons at the nape
      const Lr = layer(F), rb = idle ? sin(t + 0.5) * 0.4 : run ? -0.9 : 0;
      tube(Lr, PU(F, [[hx - 2.6, hy - 0.6], [hx - 3.3 + rb, hy + 0.9], [hx - 3.5 + rb * 1.5, hy + 2.3]]), 0.45 * u, Pl);
      for (let k = 0; k <= 6; k++) { const f = k / 6, lx = lerp(hx - 2.5, hx + 3, f), ly = hy - 1.9 + Math.sin(f * Math.PI) * 0.5 - (1 - f) * 0.4 + up * f; facet(Lr, PU(F, [[lx - 0.8, ly + 0.2], [lx - 0.3, ly - 0.8], [lx + 0.6, ly - 0.3], [lx + 0.1, ly + 0.5]]), k % 2 ? G[3] : G[4]); }
      put(L, Lr, true);
      for (const p of pages) if (p.z >= 0) page(L, p);
      put(F.p, L, false);
      // glows: violet pupils in the blank stone eyes, a hairline crack, the welling void
      const ec = hurt ? HURT : AE;
      dot(F, X(hx - 0.2), Y(hy - 0.6 + up), ec); dot(F, X(hx + 2.1), Y(hy - 0.6 + up), ec);
      { const cx0 = R(X(hx - 0.9)), cy0 = R(Y(hy - 2.4)), zz = [[0, 0], [1, 1], [1, 2], [0, 3], [0, 4], [1, 5]].slice(0, hurt ? 6 : 4);
        for (const [a, b] of zz) { F.p.set(cx0 + a, cy0 + b, C(AE_D)); F.e.set(cx0 + a, cy0 + b, C(AE_D)); } }
      const vy = idle ? sin(t * 2) * 0.4 : 0, vx = run ? -1.2 : w1 ? -0.4 : 0;
      wisp(F, bkx + (vx - 0.2) * u, bky - 0.5 * u + vy * u, 1.9 * u, 1.8 * u, AE, 0.62);
      wisp(F, bkx + (vx * 2 - 1.2) * u, bky - 2.1 * u + vy * u, 1.4 * u, 1.2 * u, AE_D, 0.45);
      if (w2) glow(F, X(tcx + 1.2), Y(tcy), 1.2 * u, AE, { halo: true });
    },
  },
  // Clockwork Lion (gilded_lion): a gilded temple automaton, its plates gone green with verdigris in
  // the seams. Its mane is a great toothed cog that ticks round behind the head (a smaller one meshes
  // with it), a hole in its flank shows the gears turning, and a wind-up key turns in its back. The
  // jaw is a hinged trap. When it is hit, the mainspring boings out of its side.
  clockwork_lion: {
    view: 'side', box: [36, 28], pivot: 0.46, idleFps: 4, scale: 0.88,
    draw(F, o, P) {
      const { u } = F, X = UX(F), Y = UY(F);
      const G = pal5('gold', 5), Gd = pal5('gold', 4), Gf = G.map((c) => dark(c, 0.78)), V = pal5('teal', 5), Vd = V.map((c) => dark(c, 0.8)), S = pal5('steel', 5);
      const t = P.t, idle = P.act === 'idle', run = P.act === 'run', w1 = P.atk === 1, w2 = P.atk === 2, hurt = P.hurt;
      const bob = run ? -Math.abs(sin(t)) * 0.9 : idle ? sin(t) * 0.25 : 0;
      const push = w1 ? -1.4 : w2 ? 2 : hurt ? -1.2 : 0, rise = w2 ? 1.4 : w1 ? -0.5 : hurt ? 0.8 : 0;
      const bx = push, by = -9.6 + bob + (w1 ? 1.1 : 0);
      const shX = bx + 4.6, shY = by + 0.6 - rise, hpX = bx - 5.4, hpY = by + 0.4 + rise * 0.25;
      const hx = bx + 9.6 + (w2 ? 1 : 0), hy = by - 5.4 - rise * 1.3 + (w1 ? 0.9 : 0) + (hurt ? -0.6 : 0);
      const L = layer(F);
      // legs: gilt plated thighs, verdigris knee bolts, bronze rods, gilt paws with steel claws
      const foot = (root, ph, fore) => {
        if (run) { const [dx, lift] = stride(ph, 6, 2); return [root[0] + dx + (fore ? 0.6 : -0.4), -lift]; }
        if (w1) return [root[0] + (fore ? 1.8 : -1.8), 0];
        if (w2) return fore ? [root[0] + (ph ? 3.4 : 5.4), ph ? -1.2 : -4.2] : [root[0] - (ph ? 2.6 : 3.8), 0];
        if (hurt) return [root[0] + (fore ? 1.2 : -1.6), 0];
        return [root[0] + (fore ? 0.6 : -0.4), 0];
      };
      const leg = (root, ph, fore, far) => {
        const Lg = layer(F), Gx = far ? Gf : G, Vx = far ? Vd : V, Bx = far ? Gd.map((c) => dark(c, 0.8)) : Gd;
        const ft = foot(root, ph, fore), knee = ik(root, ft, 4.4, 4.3, fore ? -1 : 1);
        tube(Lg, PU(F, [knee, ft]), [1 * u, 0.8 * u], Bx);
        tube(Lg, PU(F, [root, knee]), [2.2 * u, 1.4 * u], Gx);
        Lg.line(X(lerp(root[0], knee[0], 0.25)), Y(lerp(root[1], knee[1], 0.25)), X(lerp(root[0], knee[0], 0.8)), Y(lerp(root[1], knee[1], 0.8)), Gx[1]);
        Lg.disc(X(knee[0]), Y(knee[1]), 0.85 * u, Vx[2]); Lg.set(R(X(knee[0]) - 0.3 * u), R(Y(knee[1]) - 0.3 * u), Vx[4]);
        blob(Lg, [[X(ft[0] + 0.5), Y(ft[1] - 0.8), 1.6 * u, 0.95 * u]], Gx);
        for (let k = 0; k < 2; k++) Lg.line(X(ft[0] + 1.6 + k * 0.1), Y(ft[1] - 0.9 + k * 0.7), X(ft[0] + 2.4 + k * 0.1), Y(ft[1] - 0.2 + k * 0.6), S[far ? 2 : 4]);
        put(L, Lg, !far);
      };
      leg([shX + 0.8, shY], t + 0.5, true, true); leg([hpX + 0.8, hpY], t, false, true);
      // tail: a segmented brass chain ending in a plumb weight
      const ts = idle ? sin(t) * 0.8 : run ? sin(t * 2) * 1.2 : w2 ? -1.4 : w1 ? 0.8 : 0;
      const Tl = layer(F), tp = [[bx - 8.4, by - 1.6], [bx - 11.8, by - 3.4 + ts * 0.4], [bx - 12.2 + ts * 0.3, by - 7.6 + ts]];
      tube(Tl, PU(F, bez(tp, 14)), [0.75 * u, 0.5 * u], Gd, { rings: Math.max(2, R(1.2 * u)), ringC: Vd[1] });
      blob(Tl, [[X(tp[2][0] - 0.2), Y(tp[2][1] - 0.9), 0.9 * u, 1.3 * u]], G);
      Tl.line(X(tp[2][0] - 0.2), Y(tp[2][1] - 2.4), X(tp[2][0] - 0.2), Y(tp[2][1] - 3), G[2]);
      put(L, Tl, true);
      // body: a gilt barrel of plates with verdigris in the seams and along the belly
      const B = layer(F);
      blob(B, [[X(bx + 4.2), Y(by - 0.6 - rise * 0.6), 4.6 * u, 4.6 * u], [X(bx - 0.4), Y(by + 0.2), 6.2 * u, 3.7 * u], [X(bx - 5.4), Y(by - 0.4 + rise * 0.2), 3.8 * u, 3.9 * u]], G);
      spots(B, X(bx - 0.5), Y(by + 3), 7 * u, 0.9 * u, 7, 0.8 * u, V[2], 3);
      spots(B, X(bx - 0.5), Y(by + 3.4), 7 * u, 0.6 * u, 5, 0.6 * u, V[1], 4);
      for (const sxu of [2.2, -3.6]) {
        for (let y = Y(by - 4.2); y <= Y(by + 3.6); y++) { const x = X(bx + sxu) + Math.sin((y - Y(by)) / (4 * u)) * u * 0.6; over(B, x, y, V[1]); }
        for (let k = 0; k < 4; k++) over(B, X(bx + sxu + 0.7) + Math.sin(((-3 + k * 2) * u) / (4 * u)) * u * 0.6, Y(by - 3 + k * 2), G[4]);
      }
      // the flank hatch: open, gears turning inside
      const hcx = X(bx - 0.7), hcy = Y(by + 0.3), hrx = 2.8 * u, hry = 2.4 * u;
      B.ellipse(hcx, hcy, hrx, hry, Vd[0]);
      const Gr = layer(F), gp = idle ? t : run ? t * 2 : w1 ? 0.4 : w2 ? 0.8 : 0.1;
      cog(Gr, hcx - 0.8 * u, hcy + 0.6 * u, 2.2 * u, 9, gp, S, { contour: false });
      cog(Gr, hcx + 1.4 * u, hcy - 0.9 * u, 1.4 * u, 6, -gp * 1.5 + 0.25, Gd, { contour: false });
      for (let y = 0; y < Gr.h; y++) for (let x = 0; x < Gr.w; x++) if (Gr.a(x, y) && ((x + 0.5 - hcx) / hrx) ** 2 + ((y + 0.5 - hcy) / hry) ** 2 > 0.8) Gr.clear(x, y);
      put(B, Gr, false);
      for (let a = 0; a < TAU; a += 0.04) { const x = hcx + Math.cos(a) * hrx, y = hcy + Math.sin(a) * hry, l = -Math.cos(a) * 0.48 - Math.sin(a) * 0.62; over(B, x, y, l > 0 ? G[0] : G[4]); }
      put(L, B, true);
      // the wind-up key: it turns, so the bow swings between full face and edge-on
      const kx = bx - 2, ky = by - 4.2 - rise * 0.1, th = (idle ? t : run ? t * 2 : w1 ? 0.15 : w2 ? 0.45 : 0.3) * TAU, cw = Math.cos(th);
      const Ky = layer(F), KR = cw < 0 ? Gf : G;
      tube(Ky, PU(F, [[kx, ky + 0.6], [kx, ky - 2]]), 0.45 * u, S);
      Ky.ellipse(X(kx), Y(ky - 1.6), 0.9 * u, 0.4 * u, Gd[2]);
      const lw = Math.max(0.35, Math.abs(cw) * 1.5);
      blob(Ky, [[X(kx - lw), Y(ky - 3.6), lw * u, 1.4 * u], [X(kx + lw), Y(ky - 3.6), lw * u, 1.4 * u]], KR);
      if (Math.abs(cw) > 0.6) { Ky.disc(X(kx - lw), Y(ky - 3.6), 0.45 * u, VOID); Ky.disc(X(kx + lw), Y(ky - 3.6), 0.45 * u, VOID); }
      put(L, Ky, true);
      // the mane: a great toothed cog round the head (verdigris in its face), a small one meshing at its crown
      const mp = idle ? t : run ? t * 2 : w1 ? 0.3 : w2 ? 0.55 : 0.15, mx = hx - 0.8, my = hy + 0.2;
      cog(L, X(mx - 4.6), Y(my - 5), 2.6 * u, 7, -mp * 1.4 + 0.2, Gf, { tooth: 1.1 * u });
      const Mn = layer(F);
      cog(Mn, X(mx), Y(my), 6.4 * u, 11, mp, Gd, { tooth: 1.9 * u, hub: false });
      for (let y = Math.floor(Y(my) - 4.4 * u); y <= Y(my) + 4.4 * u; y++) for (let x = Math.floor(X(mx) - 4.4 * u); x <= X(mx) + 4.4 * u; x++) {
        const d = Math.hypot(x + 0.5 - X(mx), y + 0.5 - Y(my)) / u;
        if (d > 3.3 && d < 4.3) over(Mn, x, y, (x - X(mx)) * -0.48 + (y - Y(my)) * -0.62 > 0 ? V[3] : V[1]);
      }
      put(L, Mn, true);
      leg([shX, shY], t, true, false); leg([hpX, hpY], t + 0.5, false, false);
      // head: a blocky gilt lion mask, square muzzle, a hinged trap of a jaw, brow over a furnace eye
      const H = layer(F), ja = w1 ? 0.32 : w2 ? 0.7 : hurt ? 0.25 : idle ? Math.max(0, sin(t)) * 0.06 : 0.05;
      const jaw = (x, y) => { const [a, b] = rot(x, y, ja); return [hx + 0.3 + a, hy + 1.4 + b]; };
      if (ja > 0.15) facet(H, PU(F, [jaw(0, 0), [hx + 4.4, hy + 1.3], jaw(4, 0.3)]), MAW_D);
      slab(H, PU(F, [jaw(-0.3, -0.5), jaw(3.9, -0.1), jaw(3.9, 0.7), jaw(0.6, 1.3)]), Gd);
      if (ja > 0.15) teeth(H, PU(F, [jaw(1.4, -0.1)])[0], PU(F, [jaw(3.6, -0.1)])[0], 3, Math.max(1, 0.9 * u), -1, S[4]);
      blob(H, [[X(hx), Y(hy - 0.2), 2.6 * u, 2.6 * u]], G);
      slab(H, PU(F, [[hx + 0.8, hy - 1.6], [hx + 3.6, hy - 1], [hx + 4.4, hy + 0.2], [hx + 4.4, hy + 1.5], [hx + 0.8, hy + 1.7]]), G);
      // nose pad, mouth seam, whisker rivets
      facet(H, PU(F, [[hx + 3.6, hy - 1], [hx + 4.5, hy - 0.4], [hx + 4.5, hy + 0.5], [hx + 3.8, hy + 0.4]]), Gd[0]);
      H.line(X(hx + 1.3), Y(hy + 1.6), X(hx + 4.3), Y(hy + 1.5), Gd[0]);
      H.set(R(X(hx + 2.4)), R(Y(hy + 0.7)), G[1]); H.set(R(X(hx + 3.2)), R(Y(hy + 0.6)), G[1]);
      // ear with a verdigris hollow
      blob(H, [[X(hx - 1), Y(hy - 2.6), 1.1 * u, 1.1 * u]], G);
      H.disc(X(hx - 0.8), Y(hy - 2.4), 0.55 * u, V[1]);
      // eye socket and a heavy scowling brow
      H.ellipse(X(hx + 1.7), Y(hy - 0.5), 1.1 * u, 0.8 * u, Gd[0]);
      slab(H, PU(F, [[hx + 0.2, hy - 2], [hx + 3.4, hy - 1.3], [hx + 3, hy - 0.8], [hx + 0.4, hy - 1.2]]), G);
      put(L, H, true);
      put(F.p, L, false);
      dot(F, X(hx + 1.2), Y(hy - 0.8), hurt ? HURT : '#f8b848', 2, hurt ? 1 : 2); dot(F, X(hx + 2), Y(hy - 0.8), '#fff0b0');
      // hurt: the mainspring boings out of the hatch, a tooth flies off
      if (hurt) {
        const Sg = layer(F);
        for (let k = 0; k < 12; k++) { const f = k / 11, x = lerp(hcx, X(bx - 5), f) + (k % 2 ? 1 : -1) * 0.9 * u, y = lerp(hcy, Y(by - 6.5), f); const f2 = (k + 1) / 11; Sg.line(x, y, lerp(hcx, X(bx - 5), f2) + (k % 2 ? -1 : 1) * 0.9 * u, lerp(hcy, Y(by - 6.5), f2), S[k % 2 ? 4 : 2]); }
        put(F.p, Sg, false);
        F.p.rect(R(X(bx + 2)), R(Y(by - 7)), 2, 2, G[3]);
      }
      F.mouth = [X(hx + 4.4), Y(hy + 1.3)];
    },
  },
  // Rat King (plague_rat): three plague rats whose tails have grown into one knot, so they go
  // everywhere together, each pulling its own way. The leader wears a crimped bottle cap as a crown;
  // one rides the pile sniffing the air, one is dragged along backwards. Sickly green eyes.
  rat_king: {
    view: 'side', box: [24, 16], pivot: 0.5, idleFps: 5, scale: 2.2,
    draw(F, o, P) {
      const { u } = F, X = UX(F), Y = UY(F);
      const t = P.t, idle = P.act === 'idle', run = P.act === 'run', w1 = P.atk === 1, w2 = P.atk === 2, hurt = P.hurt;
      const Sk = pal5('skin', 5), TOX = '#94ca5e';
      const furA = ramp('#7a6458'), furB = ramp('#6e6670'), furC = ramp('#5e4a44');
      const bob = run ? -Math.abs(sin(t * 2)) * 0.6 : 0, jolt = hurt ? -0.6 : 0;
      const L = layer(F);
      const K = [0.1, -2.7 + bob + jolt];               // the knot of tails, low between the rumps
      // one rat: body along angle ang from (cx, cy); belly side stays down whichever way it faces
      const rat = (cx, cy, ang, Rf, o2) => {
        const d = [Math.cos(ang), Math.sin(ang)], pp = d[0] >= 0 ? [-d[1], d[0]] : [d[1], -d[0]];
        const A = (a, b) => [cx + d[0] * a + pp[0] * b, cy + d[1] * a + pp[1] * b];
        const Lr = layer(F), sc = o2.sc || 1, Rk = o2.far ? Sk.map((c) => dark(c, 0.82)) : Sk;
        // feet (grounded rats scurry)
        if (o2.feet) for (const [fa, ph] of [[1.6, 0], [-1.9, 0.5], [1.1, 0.5], [-2.4, 0]]) {
          const root = A(fa * sc, 1.2 * sc), [dx, lift] = run ? stride(t * 2 + ph + (o2.fp || 0), 1.6, 0.8) : [0, 0];
          tube(Lr, PU(F, [root, [root[0] + dx * Math.sign(d[0] || 1), -lift - 0.3]]), [0.45 * u, 0.4 * u], Rk);
          Lr.set(R(X(root[0] + dx * Math.sign(d[0] || 1) + 0.4 * Math.sign(d[0] || 1))), R(Y(-lift - 0.3)), Rk[4]);
        }
        // body, head, tapering snout
        blob(Lr, [[...PU(F, [A(-2 * sc, 0)])[0], 2.3 * sc * u, 2.3 * sc * u], [...PU(F, [A(-0.2 * sc, -0.1)])[0], 2.4 * sc * u, 2.4 * sc * u], [...PU(F, [A(1.5 * sc, 0.1)])[0], 2 * sc * u, 2 * sc * u]], Rf, { fur: o2.seed || 3 });
        const hd = A(3.1 * sc, -0.1 * sc), sn = (o2.sniff || 0);
        blob(Lr, [[X(hd[0]), Y(hd[1]), 1.7 * sc * u, 1.6 * sc * u]], Rf, { fur: o2.seed || 3 });
        const s0 = A(3.6 * sc, 0.2 * sc), s1 = A(5.5 * sc, 0.5 * sc + sn);
        tube(Lr, PU(F, [s0, s1]), [1.15 * sc * u, 0.45 * u], Rf);
        Lr.set(R(X(s1[0]) + d[0]), R(Y(s1[1])), Rk[3]);
        // the bite: rodent incisors under the snout, a dark gape
        if (o2.bite) { const m = A(4.8 * sc, 1 * sc + sn * 0.5); Lr.disc(X(m[0]), Y(m[1]), 0.7 * u, MAW_D); Lr.rect(R(X(m[0]) + d[0]), R(Y(m[1]) - 1), 1, 2, BONE); }
        // ear: a round pink cup behind the eye
        const ea = A(2.5 * sc, -1.6 * sc);
        blob(Lr, [[X(ea[0]), Y(ea[1]), 1 * sc * u, 1.05 * sc * u]], Rk);
        Lr.disc(X(ea[0]) + 0.3 * u * d[0], Y(ea[1]) + 0.2 * u, 0.45 * sc * u, Rk[1]);
        put(L, Lr, !o2.far);
        return { eye: A(3.9 * sc, -0.7 * sc), head: hd, A, rump: A(-3.6 * sc, 0.4), tw: o2.tw || 0 };
      };
      // the one riding the pile, sniffing the air (behind)
      const bA = idle ? -2.25 + sin(t) * 0.3 : run ? -2.45 : w1 ? -1.9 : w2 ? -1.1 : -2.6;
      const rb = rat(-0.2, -6.6 + bob + jolt, bA, furB, { far: true, sc: 0.85, seed: 5, sniff: idle ? sin(t * 2) * 0.3 : 0, bite: w2 });
      // the one dragged backwards (facing away)
      const cA = Math.PI + (idle ? sin(t + 0.3) * 0.15 : run ? -0.2 : w1 ? 0.25 : w2 ? -0.25 : 0.4);
      const rc = rat(-3.8 + (run ? -0.4 : 0), -2.5 + bob + jolt, cA, furC, { sc: 0.9, seed: 7, feet: true, fp: 0.25, sniff: idle ? sin(t * 2 + 0.5) * 0.3 : 0, bite: w2, tw: -1 });
      // the king: leading, crowned
      const aA = idle ? sin(t * 2) * 0.05 : run ? -0.04 : w1 ? -0.3 : w2 ? 0.12 : -0.2;
      const ax = 4.4 + (w1 ? -0.8 : w2 ? 2 : hurt ? -0.5 : 0) + (run ? 0.3 : 0);
      const ra = rat(ax, -3 + bob + jolt + (w1 ? -0.3 : 0), aA, furA, { seed: 3, feet: true, sniff: idle ? sin(t * 2 + 0.2) * 0.35 : 0, bite: w2 || w1, tw: 1 });
      // the knot: three tails run in and wind into a tangle of loops in front
      const Kn = layer(F);
      for (const r of [rb, rc, ra]) { const r0 = r.rump; tube(Kn, PU(F, bez([r0, [lerp(r0[0], K[0], 0.5) + r.tw, lerp(r0[1], K[1], 0.5) + 0.8], K], 10)), [0.55 * u, 0.42 * u], Sk); }
      put(L, Kn, true);
      for (let k = 0; k < 3; k++) {
        const a0 = k * 2.1 + (idle ? t * 1.2 : run ? t * 3 : 0), Lk = layer(F), pts = [];
        for (let q = 0; q <= 16; q++) { const a = a0 + (q / 16) * TAU; pts.push([K[0] + Math.cos(a) * 1.7 + Math.cos(a0) * 1.1, K[1] + Math.sin(a) * 1.3 + Math.sin(a0) * 0.6]); }
        tube(Lk, PU(F, pts), 0.4 * u, k === 1 ? Sk.map((c) => dark(c, 0.86)) : Sk);
        put(L, Lk, true);
      }
      // bottle-cap crown, crimped rim, worn tilted; it pops off when hit
      const cp = ra.A(3.2, -2.1), cx = cp[0], cy = cp[1] + (hurt ? -1.6 : 0), tilt = (hurt ? 0.5 : 0.22) + (idle ? sin(t) * 0.06 : 0);
      const Cr = layer(F), G = pal5('gold', 5), cw = 2.1, ch = 1;
      const cpt = (x, y) => { const [a, b] = rot(x, y, tilt); return [cx + a, cy + b]; };
      slab(Cr, PU(F, [cpt(-cw, -ch), cpt(cw, -ch), cpt(cw, ch * 0.6), cpt(-cw, ch * 0.6)]), G);
      for (let k = 0; k < 6; k++) { const p0 = cpt(-cw + k * (2 * cw / 5), ch * 0.6); Cr.rect(R(X(p0[0])), R(Y(p0[1])), 1, 1, k % 2 ? G[1] : G[3]); }
      const top = cpt(0, -ch);
      Cr.ellipse(X(top[0]), Y(top[1]), cw * u, 0.55 * u, G[4]);
      Cr.ellipse(X(top[0]) + 0.2 * u, Y(top[1]), cw * 0.45 * u, 0.3 * u, pal5('red', 5)[3]);
      put(L, Cr, true);
      put(F.p, L, false);
      // eyes: sickly green beads, squeezed shut when hurt
      for (const r of [rb, rc, ra]) {
        if (hurt) F.p.line(X(r.eye[0]) - 1, Y(r.eye[1]), X(r.eye[0]) + 1, Y(r.eye[1]), C(INK));
        else dot(F, X(r.eye[0]), Y(r.eye[1]), TOX, r === ra ? 2 : 1, 1);
      }
      if (w2) { const m = ra.A(5.6, 1.4); dot(F, X(m[0]), Y(m[1]) + 1, TOX); dot(F, X(m[0]) - 1, Y(m[1]) + 3, '#6a8c44'); }
    },
  },
  // Ghoul (ghoul): a gaunt grave-eater that lopes on its knuckles, shoulder blades jutting like
  // wings, a long tongue lolling. On a chain round its neck swings its lantern: a skull with a corpse
  // candle burning inside, green light pouring from the sockets and lighting its face from below.
  lantern_ghoul: {
    view: 'side', box: [30, 22], pivot: 0.45, idleFps: 4, scale: 1.1,
    draw(F, o, P) {
      const { u } = F, X = UX(F), Y = UY(F);
      const Sk = ramp('#a3a88e'), Skd = Sk.map((c) => dark(c, 0.8)), Bn = pal5('sand', 6), Tg = ramp('#a94a68'), Ir = pal5('steel', 4);
      const GF = ['#152018', '#33502c', '#4a8a3a', '#7ac04e', '#b0e070', '#effcd0'], GL = '#94ca5e';
      const t = P.t, idle = P.act === 'idle', run = P.act === 'run', w1 = P.atk === 1, w2 = P.atk === 2, hurt = P.hurt;
      const br = idle ? sin(t) * 0.35 : 0;
      const gal = run ? sin(t) : 0;                                  // gallop rock: front up / hind up
      const push = w1 ? -1.2 : w2 ? 2.4 : hurt ? -1.4 : 0, rear = w1 ? 2.2 : hurt ? 0.8 : w2 ? -0.8 : 0;
      const hip = [-3.6 + push * 0.6, -8.6 + gal * 0.5], sh = [2.4 + push, -12 - br - gal * 0.7 - rear];
      const hd = [sh[0] + 4.6 + (w2 ? 1 : 0), sh[1] + 1.8 + (w1 ? -1 : 0) + (hurt ? -1 : 0)];
      const L = layer(F);
      // limbs: long arms on knuckles (elbows back), crouched haunches (knees forward)
      const arm = (far) => {
        const Lg = layer(F), Rs = far ? Skd : Sk, root = [sh[0] - (far ? 0.6 : 0), sh[1] + 1];
        let hand;
        if (run) { const [dx, lift] = stride(t + (far ? 0.12 : 0), 7, 3); hand = [root[0] + 2.4 + dx, -lift]; }
        else if (w1) hand = far ? [root[0] + 1.5, 0] : [root[0] + 4.2, root[1] - 3.2];
        else if (w2) hand = far ? [root[0] + 3, 0] : [root[0] + 8.5, root[1] + 3];
        else if (hurt) hand = [root[0] + 1.8, 0];
        else hand = [root[0] + (far ? 3.6 : 2.8), 0];
        const el = ik(root, hand, 6, 6.2, 1);
        tube(Lg, PU(F, [root, el]), [1.4 * u, 0.9 * u], Rs);
        tube(Lg, PU(F, [el, hand]), [0.9 * u, 0.75 * u], Rs);
        // knuckles and three long claws
        const up = w1 && !far, dir = up ? -1 : 1;
        blob(Lg, [[X(hand[0] + 0.4), Y(hand[1] - 0.6 * dir), 1.1 * u, 0.8 * u]], Rs);
        for (let k = 0; k < 3; k++) horn(Lg, [X(hand[0] + 0.6 + k * 0.4), Y(hand[1] - 0.5 * dir)], [X(hand[0] + 1.5 + k * 0.5), Y(hand[1] - 0.2 * dir)], [X(hand[0] + 1.9 + k * 0.5), Y(hand[1] + (w2 && !far ? 1.4 : 0.1) * dir)], 0.6 * u, Bn);
        put(L, Lg, !far);
      };
      const legr = (far) => {
        const Lg = layer(F), Rs = far ? Skd : Sk, root = [hip[0] + (far ? 0.6 : 0), hip[1] + 0.6];
        let ft;
        if (run) { const [dx, lift] = stride(t + 0.5 + (far ? 0.12 : 0), 6, 2.4); ft = [root[0] - 1 + dx, -lift]; }
        else ft = [root[0] - (w2 ? 2.6 : w1 ? 0.2 : 1.2) - (far ? 0.6 : 0), 0];
        const kn = ik(root, ft, 4.6, 4.8, -1);
        tube(Lg, PU(F, [root, kn]), [1.8 * u, 1.1 * u], Rs);
        tube(Lg, PU(F, [kn, ft]), [0.9 * u, 0.7 * u], Rs);
        blob(Lg, [[X(ft[0] + 0.8), Y(ft[1] - 0.5), 1.4 * u, 0.6 * u]], Rs);
        horn(Lg, [X(ft[0] + 1.8), Y(ft[1] - 0.6)], [X(ft[0] + 2.4), Y(ft[1] - 0.6)], [X(ft[0] + 2.8), Y(ft[1])], 0.5 * u, Bn);
        put(L, Lg, !far);
      };
      arm(true); legr(true);
      // body: a starved, hunched torso, ribs showing, spine knuckles, blades jutting up
      const B = layer(F);
      blob(B, [[X(hip[0]), Y(hip[1] - 0.4), 3 * u, 2.6 * u], [X(lerp(hip[0], sh[0], 0.5)), Y(lerp(hip[1], sh[1], 0.55) + 0.6), 3.2 * u, 2.6 * u], [X(sh[0]), Y(sh[1] + 0.8), 3.2 * u, 3 * u]], Sk);
      // shoulder blades: two bony wings standing up off the back
      for (const [dx, k] of [[-2.2, 0.8], [-0.4, 1]]) horn(B, [X(sh[0] + dx), Y(sh[1] - 0.6)], [X(sh[0] + dx - 0.8), Y(sh[1] - 3.4 * k)], [X(sh[0] + dx - 2.2), Y(sh[1] - 4.6 * k)], 2.6 * u, Sk);
      // spine knuckles along the top of the back
      for (let k = 1; k < 5; k++) { const f = k / 5, x = X(lerp(hip[0] - 0.6, sh[0] - 2.2, f)), y = Y(lerp(hip[1] - 2.9, sh[1] - 1.3, f)); B.set(R(x), R(y), Sk[4]); B.set(R(x) + 1, R(y), Sk[4]); B.set(R(x), R(y) + 1, Sk[2]); }
      // ribs: dark grooves curving down the flank
      for (let k = 0; k < 4; k++) { const rx = lerp(hip[0] + 1.6, sh[0] - 0.6, k / 3); for (let s = 0; s <= 1; s += 0.08) over(B, X(rx + s * 0.9), Y(lerp(hip[1], sh[1], 0.5 + k * 0.08) - 0.4 + s * 2.4), Sk[1]); }
      // the neck, thrust out low
      tube(B, PU(F, [[sh[0] + 0.6, sh[1] + 0.6], [hd[0] - 1.6, hd[1] + 0.4]]), [2 * u, 1.4 * u], Sk);
      // the sunken belly
      for (let x = X(hip[0] + 0.5); x < X(sh[0] - 0.6); x++) { const y = lowY(B, R(x)); if (y > 0) { B.set(R(x), y, Skd[1]); } }
      put(L, B, true);
      legr(false);
      arm(false);
      // head: a long hairless skull of a face, ears swept back, a lipless grin, the tongue lolling
      const H = layer(F), mo = w1 ? 0.9 : w2 ? 1.4 : hurt ? 0.6 : 0.55;
      const ew = idle ? sin(t + 0.4) * 0.3 : run ? -0.5 : 0;
      horn(H, [X(hd[0] - 1), Y(hd[1] - 1.3)], [X(hd[0] - 2.6), Y(hd[1] - 2.8 + ew)], [X(hd[0] - 4.6), Y(hd[1] - 3 + ew)], 1.7 * u, Sk);
      // the jaw hangs open under the snout: a dark gape, a row of crooked teeth
      slab(H, PU(F, [[hd[0] - 0.6, hd[1] + 0.8], [hd[0] + 3.8, hd[1] + 1.2 + mo * 0.3], [hd[0] + 3.6, hd[1] + 2 + mo], [hd[0] + 0.2, hd[1] + 2.2 + mo * 0.5]]), Skd);
      blob(H, [[X(hd[0]), Y(hd[1] - 0.6), 2.5 * u, 2.4 * u], [X(hd[0] + 2.3), Y(hd[1] + 0.1), 1.8 * u, 1.2 * u]], Sk);
      H.line(X(hd[0] + 0.2), Y(hd[1] + 0.5), X(hd[0] + 1.2), Y(hd[1] + 0.2), Sk[1]);
      facet(H, PU(F, [[hd[0] + 0.4, hd[1] + 1.1], [hd[0] + 4.2, hd[1] + 1], [hd[0] + 3.8, hd[1] + 1.5 + mo], [hd[0] + 0.8, hd[1] + 1.6 + mo * 0.5]]), MAW_D);
      teeth(H, [X(hd[0] + 0.8), Y(hd[1] + 1)], [X(hd[0] + 4.1), Y(hd[1] + 1)], 4, Math.max(2, 1 * u), 1, BONE);
      teeth(H, [X(hd[0] + 1.2), Y(hd[1] + 1.6 + mo * 0.7)], [X(hd[0] + 3.6), Y(hd[1] + 1.6 + mo * 0.9)], 3, Math.max(1, 0.6 * u), -1, BONE);
      // a deep sunken socket under a beetling brow, a slit of a nostril
      H.ellipse(X(hd[0] + 1.1), Y(hd[1] - 0.7), 1.1 * u, 0.8 * u, Skd[0]);
      H.line(X(hd[0] - 0.4), Y(hd[1] - 1.7), X(hd[0] + 2.4), Y(hd[1] - 1.3), Sk[4]);
      H.set(R(X(hd[0] + 3.9)), R(Y(hd[1] - 0.3)), Skd[0]);
      // the tongue: thin, long, lolling out of the side of the grin
      const tl = w2 ? 4.6 : w1 ? 2 : 3, ta = idle ? sin(t + 0.3) * 0.5 : run ? -0.8 : w2 ? 1.2 : 0;
      tube(H, PU(F, bez([[hd[0] + 2.4, hd[1] + 1.6 + mo * 0.6], [hd[0] + 3.4 + ta * 0.4, hd[1] + 2.2 + tl * 0.4], [hd[0] + 3 + ta, hd[1] + 2 + tl]], 10)), [0.55 * u, 0.38 * u], Tg);
      put(L, H, true);
      // the lantern: a skull on a chain from the neck, swinging; the corpse candle burns inside
      const sw = idle ? sin(t) * 0.35 : run ? -0.5 - gal * 0.3 : w1 ? -0.4 : w2 ? 0.5 : hurt ? -0.7 : 0;
      const nk = [hd[0] - 1.6, hd[1] + 1.4], cl = 4.2, sk = [nk[0] + Math.sin(sw) * cl, nk[1] + Math.cos(sw) * cl];
      const Ln = layer(F);
      for (let k = 0; k <= 5; k++) { const f = k / 5, x = X(lerp(nk[0], sk[0], f)), y = Y(lerp(nk[1], sk[1] - 1.6, f)); Ln.set(R(x), R(y), k % 2 ? Ir[1] : Ir[3]); }
      blob(Ln, [[X(sk[0]), Y(sk[1]), 2.2 * u, 2 * u], [X(sk[0] + 0.3), Y(sk[1] + 1.8), 1.4 * u, 0.9 * u]], Bn);
      Ln.rect(R(X(sk[0] - 0.9)), R(Y(sk[1] - 0.6)), 2, 2, VOID); Ln.rect(R(X(sk[0] + 0.5)), R(Y(sk[1] - 0.6)), 2, 2, VOID);
      Ln.set(R(X(sk[0] + 0.2)), R(Y(sk[1] + 0.9)), VOID);
      for (let k = 0; k < 3; k++) Ln.set(R(X(sk[0] - 0.6 + k * 0.7)), R(Y(sk[1] + 2.1)), Bn[1]);
      Ln.rect(R(X(sk[0] - 1.4)), R(Y(sk[1] - 2.2)), R(2.8 * u), 1, Ir[2]);
      put(L, Ln, true);
      put(F.p, L, false);
      // light: green corpse-light through the skull's sockets and a flame out of its crown
      const ft = hurt ? 0.45 : 1;
      dot(F, X(sk[0] - 0.9) + 1, Y(sk[1] - 0.6) + 1, GL); dot(F, X(sk[0] + 0.5) + 1, Y(sk[1] - 0.6) + 1, GL);
      flame(F, X(sk[0] + 0.1), Y(sk[1] - 1.9), (1.8 * ft + (idle ? sin(t * 2) * 0.3 : 0)) * u, 1.3 * u, t, { ramp: GF });
      wisp(F, X(sk[0]), Y(sk[1] - 0.5), 4 * u, 3.2 * u, GF[3], 0.22, 110);
      // its own eyes catch the light
      if (hurt) F.p.line(X(hd[0] + 0.5), Y(hd[1] - 0.6), X(hd[0] + 1.6), Y(hd[1] - 0.5), C(INK));
      else dot(F, X(hd[0] + 0.8), Y(hd[1] - 0.9), '#a4f689', 2, 1);
      if (!hurt) { const dp = Y(hd[1] + 2 + tl) + (idle ? (t * 8) % 3 : 1); F.p.set(R(X(hd[0] + 3 + ta)), R(dp + 1), Tg[4]); }
    },
  },
  // Candle Wraith (wraith): a tattered grave-shroud with a tall church candle standing in its collar
  // where the head should be. The violet corpse-flame on the wick is its face, two eye holes burnt
  // through it; its hands are wax, forever dripping. It gutters when struck.
  candle_wraith: {
    view: 'front', box: [22, 30], pivot: 0.5, idleFps: 5, hover: true,
    draw(F, o, P) {
      const { u } = F, X = UX(F), Y = UY(F);
      const Sh = ramp('#9a96b4'), Shd = Sh.map((c) => dark(c, 0.78)), Wx = ramp('#ecdcb4'), AEf = PAL.aether.map((c) => C(c));
      const t = P.t, idle = P.act === 'idle', run = P.act === 'run', w1 = P.atk === 1, w2 = P.atk === 2, hurt = P.hurt;
      const bob = idle ? sin(t) * 0.4 : 0, top = -15.5 + bob + (hurt ? 0.6 : 0);
      const L = layer(F);
      // far tatters: a darker inner lining showing behind the hem
      const lean = (run ? 1.8 : idle ? sin(t) * 0.5 : w2 ? -0.8 : 0) * u;
      drape(L, X(0), Y(top + 2), 7 * u, 11 * u, 12.6 * u, Shd.map((c) => dark(c, 0.8)), { folds: 0, lean: -lean * 0.6, phase: t + 0.5, teeth: 6, ragged: true, seed: 9, wave: 1.1 * u });
      // the shroud: hangs from bony shoulders, ragged hem trailing into nothing
      const Sd = layer(F);
      drape(Sd, X(0), Y(top + 0.8), 5 * u, 11.6 * u, 13.4 * u, Sh, { folds: 3, lean, phase: t, teeth: 7, ragged: true, seed: 4, wave: 1.4 * u });
      blob(Sd, [[X(0), Y(top + 1.8), 3.8 * u, 2.3 * u]], Sh);
      put(L, Sd, true);
      // the empty hood, fallen back round the candle's foot like a cowl
      const Hd = layer(F);
      blob(Hd, [[X(0), Y(top + 0.2), 3.3 * u, 1.7 * u], [X(-0.6), Y(top - 0.6), 2.6 * u, 1.4 * u]], Sh);
      Hd.ellipse(X(0.1), Y(top + 0.1), 2 * u, 0.85 * u, Shd[0]);
      put(L, Hd, true);
      // sleeves and wax hands
      const hand = (s) => {
        const Lh = layer(F);
        let hx = s * 5.4, hy = -8.6 + bob + (idle ? sin(t + (s > 0 ? 0.5 : 0)) * 0.4 : 0);
        if (w1) { hx = s * 6.2; hy = -17; }
        if (w2) { hx = s * 4.2; hy = -6.4; }
        if (hurt) { hx = s * 6; hy = -10.6; }
        if (run) { hx = s * 5 - 1.2; hy = -9.6; }
        const sl = [s * 3, top + 2];
        // a bell sleeve with a long tatter hanging from its cuff
        tube(Lh, PU(F, bez([sl, [lerp(sl[0], hx, 0.6), lerp(sl[1], hy, 0.2) - (w1 ? 2 : 0)], [hx - s * 0.8, hy - 0.9]], 10)), [1.2 * u, 1.9 * u], Sh);
        const cf = [hx - s * 0.8, hy - 0.9], tl = (w1 ? 2 : 3.4) + (idle ? sin(t + 0.3) * 0.4 : 0);
        slab(Lh, PU(F, [[cf[0] - 1.5, cf[1]], [cf[0] + 1.5, cf[1]], [cf[0] - s * 0.6 - (run ? 1.4 : 0), cf[1] + tl]]), Sh);
        // the wax hand: a lump of palm and long fingers that sag and drip
        const up = w1 ? -1 : 1;
        blob(Lh, [[X(hx), Y(hy), 1.3 * u, 1.2 * u]], Wx);
        for (let k = 0; k < 3; k++) {
          const fx = hx + s * (k * 0.6) - s * 0.5, fl = 2.8 - Math.abs(k - 1) * 0.5 + (w2 ? 1 : 0);
          tube(Lh, PU(F, bez([[fx, hy + up * 0.5], [fx + s * (w1 ? 0.8 : 0.5), hy + up * fl * 0.6], [fx + s * (w1 ? 0.9 : 0.3), hy + up * fl]], 6)), [0.5 * u, 0.4 * u], Wx);
          if (!w1) Lh.disc(X(fx + s * 0.3), Y(hy + fl), 0.5 * u, Wx[4]);
        }
        put(L, Lh, true);
        // a drop of wax forming and falling under the hand
        const dp = (t * 2 + (s > 0 ? 0.5 : 0)) % 1;
        if (!w1) { L.set(R(X(hx + s * 0.4)), R(Y(hy + 3.6) + dp * 3 * u), Wx[4]); L.set(R(X(hx + s * 0.4)), R(Y(hy + 3.6) + dp * 3 * u) + 1, Wx[3]); }
        return [hx, hy];
      };
      hand(-1); hand(1);
      // the candle: a tall ivory taper standing in the collar, runs of wax down its sides
      const cb = top + 0.4, ct = top - 6.4, cw = 1.6, cl = -0.7, Cd = layer(F);
      slab(Cd, PU(F, [[-cw, cb], [cw, cb], [cw + cl, ct], [-cw + cl, ct]]), Wx, { wide: true });
      for (const [dx, len, w] of [[-1.2, 2.6, 0.7], [0.3, 1.4, 0.6], [1.1, 3.6, 0.6], [-0.4, 4.4, 0.5]]) {
        const x = X(dx + cl * 0.9);
        for (let y = Y(ct); y <= Y(ct + len); y++) for (let k = 0; k < Math.max(1, R(w * u)); k++) over(Cd, x + k, y, k === 0 ? Wx[4] : Wx[3]);
        Cd.disc(x + 0.5, Y(ct + len), 0.55 * u, Wx[4]);
      }
      // the crater of melted wax at the top, the wick
      Cd.ellipse(X(cl), Y(ct), cw * u, 0.5 * u, Wx[2]);
      Cd.line(X(cl), Y(ct), X(cl), Y(ct - 0.8), C(INK));
      put(L, Cd, true);
      put(F.p, L, false);
      // the face-flame: a violet teardrop, two eyes burnt through it, a mouth when it lunges
      const fh = (hurt ? 4.4 : w1 ? 10.6 : w2 ? 9 : run ? 8.6 : 8.6 + (idle ? sin(t * 2) * 0.6 : 0)) * u;
      const fw = (hurt ? 4 : w2 ? 7.4 : 6.4) * u, fx0 = X(cl), fy0 = Y(ct - 0.3);
      const tilt = run ? -0.9 : hurt ? 0.9 : idle ? sin(t + 0.25) * 0.3 : 0;
      const shape = (f) => (f < 0.38 ? Math.sqrt(Math.max(0, 1 - ((0.38 - f) / 0.38) ** 2)) : (1 - (f - 0.38) / 0.62) ** 0.85);
      const bands = [[1, AEf[3]], [0.8, AEf[4]], [0.55, AEf[5]], [0.28, AEf[6]]];
      for (const [k, col] of bands) {
        const hh = fh * (0.45 + 0.55 * k), ww = fw * k;
        for (let yy = Math.floor(fy0 - hh); yy <= fy0; yy++) {
          const f = (fy0 - yy) / hh, sway = (Math.sin((f * 1.3 + t) * TAU) * 0.12 * fw + tilt * u * 1.6) * f ** 1.4;
          const half = (ww / 2) * shape(f);
          for (let xx = Math.floor(fx0 + sway - half); xx <= fx0 + sway + half; xx++) { F.p.set(xx, yy, col); F.e.set(xx, yy, col); }
        }
      }
      // eyes and mouth: holes burnt through the flame (dark, no glow)
      const ey = R(fy0 - fh * 0.4), ex = fw * 0.16, ewid = Math.max(2, R(1.1 * u)), eh = hurt ? 1 : w1 ? Math.max(2, R(1 * u)) : Math.max(3, R(1.8 * u));
      for (const s of [-1, 1]) {
        const x0 = R(fx0 + s * ex - (s < 0 ? ewid : 0) + tilt * u * 0.5 * 0.6);
        const eh2 = s > 0 && !hurt ? Math.max(1, eh - 1) : eh, ey2 = ey + eh - eh2;
        F.p.rect(x0, ey2, ewid, eh2, VOID);
        for (let yy = ey2; yy < ey2 + eh2; yy++) for (let xx = x0; xx < x0 + ewid; xx++) F.e.clear(xx, yy);
        if (w1) F.p.set(x0 + (s < 0 ? ewid : -1), ey - 1, VOID);
      }
      if (w2 || w1) { const mw = Math.max(2, R((w2 ? 1.6 : 1) * u)), mh = Math.max(1, R((w2 ? 1.2 : 0.6) * u)), mx = R(fx0 - mw / 2), my = R(fy0 - fh * 0.16); F.p.rect(mx, my, mw, mh, VOID); for (let yy = my; yy < my + mh; yy++) for (let xx = mx; xx < mx + mw; xx++) F.e.clear(xx, yy); }
      wisp(F, fx0, fy0 - fh * 0.45, fw * 1.1, fh * 0.7, AEf[3], 0.3, 120);
    },
  },
  // The Bone Warden (bone_warden): the ossuary's keeper, built from the bones it guards like a
  // chapel's bone chandelier. A ring of candle-bearing skulls turns slowly about its head, a bronze
  // bell with a skull for a clapper hangs in a ribcage of femurs and tolls as it moves, skulls cap
  // its shoulders and knees. It carries a halberd of a spine with a shoulder-blade axe.
  bone_warden: {
    view: 'front', box: [36, 46], pivot: 0.5, idle: 6, idleFps: 5, scale: 0.9,
    draw(F, o, P) {
      const { u } = F, X = UX(F), Y = UY(F);
      const Bn = pal5('sand', 5), Bd = Bn.map((c) => dark(c, 0.8)), Bz = pal5('gold', 4), Fe = pal5('steel', 4), Wx = ramp('#ecdcb4'), V = pal5('teal', 5);
      const t = P.t, idle = P.act === 'idle', run = P.act === 'run', w1 = P.atk === 1, w2 = P.atk === 2, hurt = P.hurt;
      const sway = run ? sin(t) * 0.7 : idle ? sin(t) * 0.25 : 0;
      const sink = w2 ? 1.8 : w1 ? -0.6 : hurt ? 0.7 : run ? -Math.abs(sin(t)) * 0.6 : idle ? sin(t * 2) * 0.2 : 0;
      const lean = (w1 ? -0.8 : w2 ? 1 : hurt ? -1.1 : 0) + sway * 0.5;
      const by = (y) => y + sink, bx = (x, k = 1) => x + lean * k;
      const L = layer(F);
      // ---------------- the chandelier crown: ring, skulls, candles; back half first
      const hx = bx(0, 1.2), hy = by(-33.4) + (hurt ? -0.4 : 0);
      const ccx = hx + sway * 0.4, ccy = hy - 4.2, crx = 8.6, cry = 2.1, spin = (idle ? t : run ? t * 0.5 : 0) * (TAU / 6);
      const ring = (front) => {
        const Rg = layer(F);
        for (let a = 0; a < TAU; a += 0.02) { const z = Math.sin(a); if ((z >= 0) !== front) continue; const x = X(ccx + Math.cos(a) * crx), y = Y(ccy + z * cry); Rg.rect(R(x), R(y), 1, Math.max(2, R(0.7 * u)), z > 0.3 ? Fe[3] : Fe[1]); }
        put(L, Rg, false);
        const sk = [];
        for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + spin + 0.26, z = Math.sin(a); if ((z >= 0) !== front) continue; sk.push([Math.cos(a), z, k]); }
        sk.sort((p, q) => p[1] - q[1]);
        for (const [c, z, k] of sk) {
          const Sk = layer(F), r = (1.45 + z * 0.3) * u, x = X(ccx + c * crx), y = Y(ccy + z * cry) - r * 0.6;
          skull(Sk, x, y, r, z < 0 ? Bd : Bn);
          Sk.rect(R(x - 0.35 * u), R(y - r - 1.8 * u), Math.max(2, R(0.7 * u)), R(1.9 * u), Wx[z < 0 ? 2 : 3]);
          Sk.set(R(x - 0.35 * u), R(y - r - 1.8 * u), Wx[4]);
          put(L, Sk, true);
          cands.push([x, y - r - 1.8 * u, k, z]);
        }
      };
      const cands = [];
      ring(false);
      // ---------------- legs: femur bundles, skull kneecaps, broad bone feet
      const leg = (s) => {
        const Lg = layer(F), hip = [bx(s * 3.4, 0.3), by(-11.6)];
        const lift = run ? Math.max(0, sin(t + (s > 0 ? 0.5 : 0))) * 2.4 : 0;
        const ft = [s * 4.6 + (w2 ? s * 0.8 : 0) + (run ? sin(t + (s > 0 ? 0.5 : 0)) * 0.6 * s : 0), -lift];
        const kn = [lerp(hip[0], ft[0], 0.5) + s * 0.6, lerp(hip[1], ft[1], 0.52)];
        tube(Lg, PU(F, [hip, kn]), [1.5 * u, 1.2 * u], Bn);
        tube(Lg, PU(F, [[hip[0] - s * 1.1, hip[1] + 0.6], [kn[0] - s * 1, kn[1]]]), [0.9 * u, 0.8 * u], Bd);
        tube(Lg, PU(F, [kn, [ft[0] - s * 0.4, ft[1] - 1.4]]), [1.1 * u, 0.9 * u], Bn);
        tube(Lg, PU(F, [[kn[0] + s * 0.9, kn[1] + 0.6], [ft[0] + s * 0.6, ft[1] - 1.4]]), [0.6 * u, 0.5 * u], Bd);
        slab(Lg, PU(F, [[ft[0] - 2.4, ft[1] - 1.8], [ft[0] + 2.4, ft[1] - 1.8], [ft[0] + 3, ft[1]], [ft[0] - 3, ft[1]]]), Bn);
        for (let k = -1; k <= 1; k++) Lg.line(X(ft[0] + k * 1.4), Y(ft[1] - 0.4), X(ft[0] + k * 1.6), Y(ft[1]), Bn[1]);
        put(L, Lg, true);
        skull(L, X(kn[0]), Y(kn[1] - 0.6), 1.55 * u, Bn);
      };
      leg(-1); leg(1);
      // ---------------- pelvis basin and the stacked spine
      const Pv = layer(F);
      blob(Pv, [[X(bx(-2.6, 0.4)), Y(by(-13)), 3.2 * u, 2.2 * u], [X(bx(2.6, 0.4)), Y(by(-13)), 3.2 * u, 2.2 * u], [X(bx(0, 0.4)), Y(by(-12)), 1.6 * u, 1.8 * u]], Bn);
      Pv.ellipse(X(bx(-2.4, 0.4)), Y(by(-12.6)), 1 * u, 0.9 * u, VOID); Pv.ellipse(X(bx(2.4, 0.4)), Y(by(-12.6)), 1 * u, 0.9 * u, VOID);
      for (let k = 0; k < 4; k++) blob(Pv, [[X(bx(0, 0.5 + k * 0.1)), Y(by(-14.6 - k * 1.1)), 1.1 * u, 0.6 * u]], k % 2 ? Bd : Bn);
      put(L, Pv, true);
      // ---------------- the ribcage: a dark cavity, the bell hanging in it, femur ribs over it
      const rcx = bx(0, 0.8), rcy = by(-22.4);
      const Cv = layer(F);
      Cv.ellipse(X(rcx), Y(rcy), 6.6 * u, 6.4 * u, C('#2a1838'));
      Cv.ellipse(X(rcx), Y(rcy + 1), 5.2 * u, 4.6 * u, C('#351135'));
      put(L, Cv, true);
      const ba = idle ? sin(t) * 0.22 : run ? sin(t) * 0.4 : w1 ? -0.45 : w2 ? 0.65 : hurt ? 0.5 : 0;
      const hang = [rcx, rcy - 5.4], bp = (x, y) => { const [a, b] = rot(x, y, ba); return [hang[0] + a, hang[1] + b]; };
      const Bl = layer(F);
      for (let k = 0; k < 3; k++) { const p0 = bp(0, k * 0.6); Bl.rect(R(X(p0[0])), R(Y(p0[1])), 1, 2, Fe[k % 2 ? 1 : 3]); }
      // clapper: a small skull swinging further than the bell
      const cl = [hang[0] + Math.sin(ba * 1.6) * 7.6, hang[1] + Math.cos(ba * 1.6) * 7.6];
      const bell = [bp(-1.4, 1.6), bp(1.4, 1.6), bp(1.8, 2.4), bp(2.2, 5), bp(3.2, 6.8), bp(-3.2, 6.8), bp(-2.2, 5), bp(-1.8, 2.4)];
      slab(Bl, PU(F, bell), Bz, { wide: true });
      blob(Bl, [[...PU(F, [bp(0, 2)])[0], 1.7 * u, 1.1 * u]], Bz);
      // bands round the waist and the lip, a green bloom of verdigris
      for (const yy of [3.4, 6.2]) { const a0 = PU(F, [bp(-3, yy)])[0], a1 = PU(F, [bp(3, yy)])[0]; for (let s2 = 0; s2 <= 1; s2 += 0.05) over(Bl, lerp(a0[0], a1[0], s2), lerp(a0[1], a1[1], s2), Bz[4]); }
      spots(Bl, ...PU(F, [bp(1, 4.8)])[0], 1.4 * u, 1 * u, 3, 0.6 * u, V[2], 8);
      const lip = PU(F, [bp(0, 6.9)])[0];
      Bl.ellipse(lip[0], lip[1], 3 * u, 0.7 * u, C('#4a1420'));
      put(L, Bl, true);
      skull(L, X(cl[0]), Y(cl[1]), 1.1 * u, Bn);
      // ribs: curved femurs wrapping from the breastbone round the cavity, knuckled ends
      const Rb = layer(F);
      for (let k = 0; k < 6; k++) {
        const y0 = rcy - 5.6 + k * 2.1, w = 6.9 - Math.abs(k - 2.2) * 0.55;
        for (const s of [-1, 1]) {
          tube(Rb, PU(F, bez([[rcx + s * 0.9, y0], [rcx + s * (w + 0.6), y0 - 0.4], [rcx + s * (w - 1.4), y0 + 2.6]], 12)), [0.75 * u, 0.55 * u], k % 2 ? Bd : Bn);
          blob(Rb, [[X(rcx + s * (w - 1.4)), Y(y0 + 2.6), 0.7 * u, 0.6 * u]], Bn);
        }
      }
      slab(Rb, PU(F, [[rcx - 0.9, rcy - 6.2], [rcx + 0.9, rcy - 6.2], [rcx + 0.7, rcy - 1.6], [rcx, rcy - 0.8], [rcx - 0.7, rcy - 1.6]]), Bn);
      put(L, Rb, true);
      // ---------------- arms: the free one hangs with bone claws
      const arm = (s, hand) => {
        const Lg = layer(F), sh = [bx(s * 8.2, 1), by(-27.2)], el = ik(sh, hand, 6.6, 6.6, s > 0 ? 1 : -1);
        tube(Lg, PU(F, [sh, el]), [1.3 * u, 1 * u], Bn);
        tube(Lg, PU(F, [el, hand]), [1 * u, 0.8 * u], Bn);
        tube(Lg, PU(F, [[el[0] + s * 0.6, el[1] + 0.4], [hand[0] + s * 0.6, hand[1] - 0.4]]), 0.45 * u, Bd);
        blob(Lg, [[X(el[0]), Y(el[1]), 1.2 * u, 1 * u]], Bn);
        blob(Lg, [[X(hand[0]), Y(hand[1]), 1.3 * u, 1.1 * u]], Bn);
        put(L, Lg, true);
        return hand;
      };
      const lh = w1 ? [bx(-11.2), by(-30)] : w2 ? [bx(-9), by(-17)] : hurt ? [bx(-11), by(-22)] : [bx(-9.6) + (run ? -sin(t) * 0.8 : 0), by(-15.6) + (idle ? sin(t) * 0.3 : 0)];
      arm(-1, lh);
      for (let k = 0; k < 3; k++) horn(L, [X(lh[0] - 0.6 + k * 0.6), Y(lh[1] + 0.6)], [X(lh[0] - 0.8 + k * 0.7), Y(lh[1] + 2)], [X(lh[0] - 0.2 + k * 0.6), Y(lh[1] + 3)], 0.6 * u, Bn);
      // ---------------- shoulders: a skull on each
      for (const s of [-1, 1]) skull(L, X(bx(s * 8.4)), Y(by(-28.4)), 2.3 * u, Bn);
      // ---------------- the head: a great skull under its crown of skulls
      const Nk = layer(F);
      for (let k = 0; k < 2; k++) blob(Nk, [[X(lerp(rcx, hx, 0.4 + k * 0.3)), Y(by(-29.4 - k * 1.1)), 1.1 * u, 0.6 * u]], Bd);
      put(L, Nk, true);
      const op = (w1 ? 1.6 : w2 ? 2.2 : hurt ? 1.2 : idle && P.i === 3 ? 0.8 : 0) * u;
      const eyes = skull(L, X(hx), Y(hy), 3.5 * u, Bn, { open: op, wink: hurt ? 1 : 0 });
      // iron crown rods from the ring down to the temples
      for (const s of [-1, 1]) L.line(X(hx + s * 2.6), Y(hy - 2.2), X(ccx + s * 4.4), Y(ccy + 1.7), Fe[2]);
      ring(true);
      // garlands of finger bones swinging from the ring to the shoulders
      for (const s of [-1, 1]) {
        const a = [X(ccx + s * crx * 0.8), Y(ccy + cry * 0.6)], b = [X(bx(s * 8.4)), Y(by(-30.6))], m = [lerp(a[0], b[0], 0.5) + sway * u * 0.5, Math.max(a[1], b[1]) + 2.4 * u];
        const pts = bez([a, m, b], 9);
        pts.forEach(([x, y], i) => { if (i % 2 === 0) L.ellipse(x, y, 0.55 * u, 0.4 * u, i % 4 ? Bd[3] : Bn[4]); else L.set(R(x), R(y), Fe[1]); });
      }
      // ---------------- the spine halberd, gripped in the near hand
      let g = [bx(10.6), by(-15.4)], ha = 0.05 + (run ? sin(t) * 0.05 : 0);
      if (w1) { g = [bx(9.4), by(-29.6)]; ha = 0.5; }
      if (w2) { g = [bx(3.2), by(-17.4)]; ha = -2.3; }
      if (hurt) { g = [bx(11.4), by(-17)]; ha = 0.28; }
      const dr = [Math.sin(ha), -Math.cos(ha)], pr = [Math.cos(ha), Math.sin(ha)], at = (d, p = 0) => [g[0] + dr[0] * d + pr[0] * p, g[1] + dr[1] * d + pr[1] * p];
      const Hb = layer(F);
      tube(Hb, PU(F, [at(-14.2), at(17)]), 0.5 * u, Bd);
      for (let d = -13.6; d < 16.4; d += 1.3) { const q = at(d); blob(Hb, [[X(q[0]), Y(q[1]), 0.85 * u, 0.85 * u]], Math.round(d / 1.3) % 2 ? Bn : Bd); }
      // the axe: a shoulder blade; the back hook: a jawbone; the tip: a rib spike
      slab(Hb, PU(F, [at(12.8, 0.4), at(18, 0.4), at(19.4, 3.4), at(16.6, 5.4), at(13.4, 4.8)]), Bn, { wide: true });
      Hb.line(...PU(F, [at(14, 1.4)])[0], ...PU(F, [at(17.6, 2.4)])[0], Bn[1]);
      horn(Hb, PU(F, [at(15.2, -0.4)])[0], PU(F, [at(15.8, -2.6)])[0], PU(F, [at(14, -3.4)])[0], 1.2 * u, Bn);
      horn(Hb, PU(F, [at(16.6)])[0], PU(F, [at(18.6, -0.3)])[0], PU(F, [at(21.4)])[0], 1.3 * u, Bn);
      put(L, Hb, true);
      arm(1, g);
      for (let k = 0; k < 3; k++) L.line(X(g[0] - 1.1), Y(g[1] - 0.6 + k * 0.6), X(g[0] + 1.1), Y(g[1] - 0.6 + k * 0.6), Bn[1]);
      put(F.p, L, false);
      // ---------------- light: candle flames, ember eyes, the glow inside the bell
      for (const [x, y, k, z] of cands) {
        if (hurt && k === 1) { F.p.set(R(x), R(y - 2), C('#827d82')); F.p.set(R(x + 1), R(y - 4), C('#66626a')); continue; }
        flame(F, x, y, (1.7 + (idle ? sin(t * 2 + k * 0.3) * 0.25 : 0)) * u * (z < 0 ? 0.85 : 1), 1.1 * u, t + k * 0.17);
      }
      const ec = hurt ? HURT : '#f8b848';
      for (const [ex, ey] of eyes) dot(F, ex - 0.4 * u, ey - 0.3 * u, ec, Math.max(2, R(0.8 * u)), Math.max(2, R(0.8 * u)));
      dot(F, eyes[1][0] - 0.4 * u + 1, eyes[1][1] - 0.3 * u, '#fff0b0');
      wisp(F, lip[0], lip[1] + 0.4 * u, 3 * u, 1.6 * u, '#ec7a2a', 0.5, 150);
      dot(F, lip[0] - 1.5 * u, lip[1], '#f8b848', R(3 * u), 1);
      // the toll: rings of sound spreading from the bell on the slam
      if (w2 || hurt) for (const rr of [5.4, 7.6]) for (let a = -0.9; a <= 0.9; a += 0.05) for (const s of [-1, 1]) { const x = lip[0] + s * Math.cos(a) * rr * u, y = lip[1] - 2 * u + Math.sin(a) * rr * u * 0.8; if (bayer(R(x), R(y)) < 0.7) F.e.set(R(x), R(y), C('#f8b848')); }
      // the slam: shards of the floor kicked up where the axe lands
      if (w2) { const q = PU(F, [at(18.6, 3)])[0]; for (let k = 0; k < 6; k++) F.p.rect(R(q[0] + (k - 3) * 1.4 * u), R(q[1] - (k % 3) * 1.1 * u - 2), 2, 2, Bn[k % 2 ? 1 : 3]); }
    },
  },
};
