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
      eyeGlow(F, X(hx - 0.2), Y(hy - 0.6 + up), 1, 1, ec);
      eyeGlow(F, X(hx + 2.1), Y(hy - 0.6 + up), 1, 1, ec);
      crack(F.p, X(hx - 0.9), Y(hy - 2.2), 1.75, (hurt ? 5 : 2) * u, AE_D, 3, F.e);
      const vy = idle ? sin(t * 2) * 0.4 : 0, vx = run ? -1.2 : w1 ? -0.4 : 0;
      wisp(F, bkx + (vx - 0.2) * u, bky - 0.5 * u + vy * u, 1.9 * u, 1.8 * u, AE, 0.62);
      wisp(F, bkx + (vx * 2 - 1.2) * u, bky - 2.1 * u + vy * u, 1.4 * u, 1.2 * u, AE_D, 0.45);
      if (w2) glow(F, X(tcx + 1.2), Y(tcy), 1.2 * u, AE, { halo: true });
    },
  },
};
