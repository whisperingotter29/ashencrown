// Hand-built monster designs: the Gilded Reach. See kit.js for the design format and
// docs/BESTIARY.md for the concepts.
import { C, R, ramp, pal5, layer, put, blob, tube, horn, slab, facet, shard, wing, ik, stride, sin, cos, lerp, glow, flame, eyeGlow, eyeBead, teeth, spots, stripes, crack, over, rimLight, light, dark, mixc, hash2, WHITE, VOID, BONE } from './kit.js';

// enemy id -> { design, name, body? }: folded into src/data/enemies.js at integration
export const assign = {
  marble_sentinel: { design: 'lamassu', name: 'Lamassu', body: 'quadruped' },
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
};
