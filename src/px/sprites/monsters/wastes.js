// Hand-built monster designs: Crimson Wastes. See kit.js for the design format and
// docs/BESTIARY.md for the concepts.
import { C, R, ramp, pal5, layer, put, blob, tube, horn, slab, facet, shard, ik, stride, sin, cos, lerp, glow, flame, eyeGlow, eyeBead, teeth, maw, spots, stripes, crack, over, rimLight, light, dark, mixc, hash2, WHITE, VOID, BONE, MAW_D } from './kit.js';

// enemy id -> { design, name, body? }: folded into src/data/enemies.js at integration
export const assign = {
  glass_beetle: { design: 'kiln_scarab', name: 'Kiln Scarab' },
};

export default {
  // Kiln Scarab (glass_beetle): a black-glazed scarab that spits and rolls a ball of molten glass.
  // The ball is the silhouette: a glowing sphere bigger than its head, swirled like a marble.
  kiln_scarab: {
    view: 'side', box: [30, 17], pivot: 0.42, idleFps: 4,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const shell = pal5('plum', 4), glaze = ramp('#3e1c2c'), leg = ramp('#2a1420');
      const hot = [C('#7a1e14'), C('#c2401c'), C('#ec7a2a'), C('#f8b848'), C('#fff0b0')];
      const t = P.t;
      const rock = P.act === 'atk' ? (P.atk === 1 ? -2 : 3) : P.act === 'run' ? sin(t) * 0.5 : 0;
      // ball: in front, rolls on the ground
      const br = 5.2 * u, push = P.atk === 2 ? 3.2 * u : P.atk === 1 ? -0.6 * u : 0;
      const bx = ox + 11.5 * u + push, by = oy - br;
      // body
      const bodyX = ox - 1.5 * u + rock * u * 0.5, bodyY = oy - 7.4 * u + (P.act === 'idle' ? sin(t) * 0.3 * u : 0);
      const L = layer(F);
      // far legs (dark), three a side
      const legs = (far) => {
        const Lg = layer(F), Rl = far ? leg.map((c) => dark(c, 0.8)) : leg;
        for (let k = 0; k < 3; k++) {
          const hip = [bodyX + (k - 1) * 3.4 * u + (far ? 1.2 * u : 0), bodyY + 2.2 * u];
          const ph = P.act === 'run' ? t + k / 3 + (far ? 0.5 : 0) : 0;
          const [dx, lift] = stride(ph, 3.2 * u, 1.6 * u);
          const foot = [hip[0] + (k - 1) * 2.4 * u + dx + (k === 2 ? 1.6 * u : 0), oy - lift];
          const knee = ik(hip, foot, 3.8 * u, 4.2 * u, k === 2 ? 1 : -1);
          tube(Lg, [hip, knee], [0.9 * u, 0.7 * u], Rl);
          tube(Lg, [knee, foot], [0.7 * u, 0.4 * u], Rl);
          // tibial spurs: a row of tiny thorns down the shin
          for (let f = 0.25; f < 0.9; f += 0.3) { const sx = lerp(knee[0], foot[0], f), sy = lerp(knee[1], foot[1], f); Lg.set(R(sx + (k === 2 ? -1 : 1)), R(sy), Rl[3]); }
          Lg.set(R(knee[0]), R(knee[1] - 1), Rl[4]);
        }
        put(L, Lg, !far);
      };
      legs(true);
      // abdomen + thorax under the shell
      blob(L, [[bodyX - 0.5 * u, bodyY + 1.4 * u, 5.4 * u, 3 * u]], glaze);
      // head + shovel clypeus pushing the ball, little horn
      const H = layer(F), hx = bodyX + 7.4 * u, hy = bodyY + 1.6 * u;
      blob(H, [[hx, hy, 2.4 * u, 2 * u]], glaze);
      slab(H, [[hx + 0.8 * u, hy - 1.8 * u], [hx + 3.6 * u, hy - 0.6 * u], [hx + 3.2 * u, hy + 0.8 * u], [hx + 0.6 * u, hy + 0.4 * u]], glaze);
      horn(H, [hx + 1.2 * u, hy - 1.4 * u], [hx + 1.6 * u, hy - 4.8 * u], [hx + 3.8 * u, hy - 6 * u], 1.6 * u, shell);
      // antennae: little clubs
      const aw = P.act === 'idle' ? sin(t * 2) * 0.6 * u : 0;
      H.line(hx + 1.6 * u, hy - 0.6 * u, hx + 3.4 * u, hy - 2.8 * u + aw, glaze[2]);
      H.disc(hx + 3.6 * u, hy - 3 * u + aw, Math.max(0.8, 0.7 * u), glaze[4]);
      put(L, H, true);
      // pronotum: the thorax shield in front of the wing cases, a separate glossy plate
      const T = layer(F);
      blob(T, [[bodyX + 4.6 * u, bodyY + 0.2 * u, 2.8 * u, 2.9 * u]], shell);
      over(T, bodyX + 3.8 * u, bodyY - 1.8 * u, '#f4bccf');
      put(L, T, true);
      // elytra dome: glossy black glaze with a seam, iridescent rose streaks, crackle
      const S = layer(F);
      blob(S, [[bodyX, bodyY - 0.6 * u, 5.8 * u, 4.4 * u], [bodyX - 3 * u, bodyY + 0.6 * u, 3.4 * u, 3 * u]], shell, { clipY: R(bodyY + 2.2 * u) });
      const seamX = (x) => bodyY - 0.6 * u - 4.4 * u * Math.sqrt(Math.max(0, 1 - ((x - bodyX) / (5.8 * u)) ** 2)) + 1.2 * u;
      for (let x = R(bodyX - 5 * u); x <= bodyX + 5 * u; x++) over(S, x, R(seamX(x)), shell[0]);
      // glaze shine: two curved highlight streaks and a hard glint
      for (let a = 3.6; a <= 4.6; a += 0.06) over(S, bodyX + Math.cos(a) * 4.3 * u, bodyY - 0.6 * u + Math.sin(a) * 3.2 * u, '#b06a98');
      for (let a = 3.9; a <= 4.3; a += 0.08) over(S, bodyX + Math.cos(a) * 3.2 * u, bodyY - 0.6 * u + Math.sin(a) * 2.2 * u, '#f4bccf');
      over(S, bodyX - 2.2 * u, bodyY - 3.6 * u, WHITE);
      // glass crackle glowing faintly where the kiln heat got in
      if (u >= 1.2) crack(S, bodyX + 1.5 * u, bodyY + 1.4 * u, -1.3, 4 * u, hot[1], 3, null);
      put(L, S, true);
      legs(false);
      put(F.p, L, false);
      // the molten ball: hot rings, a swirl that turns as it rolls, cooled glass skin on top-left
      const spin = (P.act === 'run' ? t : P.act === 'atk' ? P.atk * 0.3 : 0) + (push / (br * 6.28));
      for (const Lr of [F.p, F.e]) Lr.disc(bx, by, br, hot[1]);
      F.p.disc(bx + 0.3 * u, by + 0.3 * u, br * 0.82, hot[2]); F.e.disc(bx + 0.3 * u, by + 0.3 * u, br * 0.82, hot[2]);
      F.p.disc(bx + 0.6 * u, by + 0.5 * u, br * 0.5, hot[3]); F.e.disc(bx + 0.6 * u, by + 0.5 * u, br * 0.5, hot[3]);
      for (let k = 0; k < 2; k++) {
        const a0 = (spin + k * 0.5) * Math.PI * 2;
        for (let s = 0; s < 1; s += 0.04) {
          const a = a0 + s * 3.2, rr = br * (0.25 + s * 0.6);
          const x = R(bx + Math.cos(a) * rr), y = R(by + Math.sin(a) * rr);
          F.p.set(x, y, hot[4]); F.e.set(x, y, hot[4]);
        }
      }
      // cooled dark glass crust over the top-left (it reads as a sphere, not a sun)
      for (let y = R(by - br); y <= by + br; y++) for (let x = R(bx - br); x <= bx + br; x++) {
        const dx = (x + 0.5 - bx) / br, dy = (y + 0.5 - by) / br;
        if (dx * dx + dy * dy > 1) continue;
        const l = -dx * 0.6 - dy * 0.75;
        if (l > 0.55 && hash2(x >> 1, y >> 1, 4) > 0.35) { F.p.set(x, y, '#4a1420'); F.e.clear(x, y); }
        else if (l > 0.4 && hash2(x >> 1, y >> 1, 4) > 0.6) { F.p.set(x, y, '#7a1e14'); F.e.clear(x, y); }
      }
      F.p.set(R(bx - br * 0.45), R(by - br * 0.55), WHITE);
      // eye: an ember behind the clypeus
      eyeGlow(F, hx - 0.2 * u, hy - 0.6 * u, Math.max(1, 0.9 * u), Math.max(1, 0.9 * u), P.hurt ? '#f5afd6' : hot[3]);
      F.mouth = [bx, by];
    },
  },
};
