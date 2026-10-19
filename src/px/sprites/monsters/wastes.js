// Hand-built monster designs: Crimson Wastes. See kit.js for the design format and
// docs/BESTIARY.md for the concepts.
import { C, R, PAL, ramp, pal5, layer, put, blob, tube, horn, slab, facet, shard, wing, drape, ik, stride, sin, cos, lerp, clamp, bez, rot, glow, flame, eyeGlow, blank, eyeBead, teeth, maw, spots, stripes, crack, over, rimLight, tint, light, dark, mixc, hash2, srand, cyl, carve, clipOut, WHITE, VOID, BONE, BONE_D, MAW, MAW_D, TONGUE } from './kit.js';

// ------------------------------------------------------------------ local helpers
const TAU = Math.PI * 2;
// a 5-tone ramp straight from hex steps (dark -> light)
const P5 = (a) => a.map((h) => C(h));
// shared ramps of the Crimson Wastes
const RUST = P5(['#3e1c22', '#662b2c', '#8a4238', '#b04a3e', '#d9765a']);
const MAROON = P5(['#1d0814', '#2a1420', '#3e1c2c', '#55323d', '#674952']);
const BONEP = P5(['#5e4a47', '#8a6a52', '#cfa978', '#e2c494', '#f3e1b5']);
const ASH = P5(['#1f1d26', '#2f2c38', '#4e4b53', '#66626a', '#827d82']);
const SMOKE = P5(['#2f2c38', '#4e4b53', '#674952', '#7b576f', '#996f76']);
const BRASS = pal5('gold', 5);
const HOT = P5(['#7a1e14', '#c2401c', '#ec7a2a', '#f8b848', '#fff0b0']);
const HURT = '#f5afd6';
// a puff of smoke / dust: a lit lump of 2-3 ellipses, flat bands
function puff(L, x, y, r, Rm, seed = 1) {
  const q = srand(seed * 31 + 3);
  const list = [[x, y, r, r * 0.85]];
  for (let k = 0; k < 2; k++) { const a = q() * TAU; list.push([x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.5, r * (0.55 + q() * 0.25), r * (0.5 + q() * 0.2)]); }
  blob(L, list, Rm, { matte: true });
  return L;
}
// worms: a deep red hide, a pale sand-scoured belly, petals a shade darker, teeth of rose glass
const WORM = P5(['#2a0e18', '#4a1420', '#60282c', '#8a3434', '#b04a3e']);
const WORM_BELLY = P5(['#60282c', '#8a4238', '#9c615b', '#bc7c70', '#d9a08a']);
const PETAL = P5(['#1d0814', '#2a0e18', '#4a1420', '#60282c', '#8a3434']);
const GLASS_T = P5(['#7a2f4a', '#cc6a86', '#e48fb0', '#f4bccf', '#fff4dc']);
// rib grooves across a worm body: a dark groove with a lit lip on its left, bowed a little
function wormRibs(L, cx, cy, r, xs, Rm) {
  for (const k of xs) { const gx = cx + k; for (let y = R(cy - r * 1.1); y <= cy + r; y++) { const x = R(gx + Math.abs(y - cy) * 0.14); if (L.a(x, y) && L.a(x + 1, y)) { L.set(x, y, Rm[0]); L.set(x + 1, y, Rm[1]); } if (L.a(x - 1, y)) L.set(x - 1, y, Rm[4]); } }
}
// the pale underside of a worm, two px deep
function wormBelly(L, x0, x1, Rm) {
  for (let x = R(x0); x <= x1; x++) { let y1 = -1; for (let y = L.h - 1; y >= 0; y--) if (L.a(x, y)) { y1 = y; break; } if (y1 > 0) { L.set(x, y1, Rm[2]); if (L.a(x, y1 - 1)) L.set(x, y1 - 1, (x & 2) ? Rm[3] : Rm[2]); } }
}
// one petal of a worm's flower mouth, opened out from (x, y) at angle a: a red back rim round a
// pink inner face with a dark midrib and two glass teeth at its root
function olgoiPetal(L, x, y, a, len, w, back, flesh, u) {
  const T = blank(L), ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca;
  const tip = [x + ca * len, y + sa * len];
  const pts = [];
  for (let k = 0; k <= 12; k++) { const f = k / 12, ww = Math.sin(Math.PI * Math.pow(f, 0.8)) * w * 0.5; pts.push([x + ca * len * f + px * ww, y + sa * len * f + py * ww]); }
  for (let k = 12; k >= 0; k--) { const f = k / 12, ww = Math.sin(Math.PI * Math.pow(f, 0.8)) * w * 0.5; pts.push([x + ca * len * f - px * ww, y + sa * len * f - py * ww]); }
  T.poly(pts, back[3]); cyl(T, back);
  const I = blank(L), ins = [];
  for (let k = 0; k <= 10; k++) { const f = 0.12 + k / 10 * 0.74, ww = Math.sin(Math.PI * Math.pow(f, 0.8)) * w * 0.32; ins.push([x + ca * len * f + px * ww, y + sa * len * f + py * ww]); }
  for (let k = 10; k >= 0; k--) { const f = 0.12 + k / 10 * 0.74, ww = Math.sin(Math.PI * Math.pow(f, 0.8)) * w * 0.32; ins.push([x + ca * len * f - px * ww, y + sa * len * f - py * ww]); }
  I.poly(ins, flesh[3]); cyl(I, flesh, { lit: false });
  I.line(x + ca * len * 0.2, y + sa * len * 0.2, x + ca * len * 0.78, y + sa * len * 0.78, flesh[1]);
  put(T, I, false);
  for (const sg of [-1, 1]) shard(T, x + ca * len * 0.3 + px * sg * w * 0.18, y + sa * len * 0.3 + py * sg * w * 0.18, a + Math.PI, Math.max(1.5, len * 0.22), Math.max(0.6, w * 0.1), GLASS_T);
  put(L, T, true);
  return L;
}
// an emissive speck (1-2 px) into both buffers
function spark(F, x, y, c, n = 1) { const cc = C(c); F.p.rect(R(x), R(y), n, n, cc); F.e.rect(R(x), R(y), n, n, cc); }

// enemy id -> { design, name, body? }: folded into src/data/enemies.js at integration
export const assign = {
  glass_beetle: { design: 'kiln_scarab', name: 'Kiln Scarab' },
  dune_hound: { design: 'cinder_jackal', name: 'Cinder Jackal' },
  ash_scorpion: { design: 'censer_scorpion', name: 'Censer Scorpion' },
  sand_wraith: { design: 'haboob_veil', name: 'Haboob Veil' },
  sandworm: { design: 'olgoi_worm', name: 'Olgoi Worm' },
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

  // Cinder Jackal (dune_hound): the necropolis jackal. Towering ears, a lean deep chest whose
  // ribcage stands open like a censer's bars round a live coal; the coal flares when it bites.
  // The tail is burnt out: it crumbles into drifting ash behind it.
  cinder_jackal: {
    view: 'side', box: [36, 28], pivot: 0.5, idleFps: 4,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle', a1 = P.atk === 1, a2 = P.atk === 2, hurt = P.hurt;
      const fur = RUST, furD = RUST.map((c) => dark(c, 0.8)), sad = MAROON, belly = P5(['#8a4238', '#9c615b', '#bc7c70', '#d9a08a', '#ecc6a8']);
      // body pose: gallop bob, crouch on the wind-up, stretch on the bite, flinch on the hit
      const bob = run ? -Math.abs(sin(t)) * 1.0 * u : idle ? sin(t) * 0.25 * u : 0;
      const lean = a1 ? -1.5 * u : a2 ? 2.2 * u : hurt ? -1.2 * u : 0;
      const bx = ox + lean * 0.5, by = oy - 12 * u + bob + (a1 ? 1.4 * u : 0);
      const L = layer(F);
      // ---- tail: a brush of fur that burns down into ash and drifts away
      const sway = run ? sin(t) * 1.2 * u : idle ? sin(t + 0.25) * 0.7 * u : a2 ? -1.2 * u : 0;
      const t0 = [bx - 7 * u, by - 1.2 * u], t1 = [bx - 11 * u, by - 0.6 * u + sway * 0.5], t2 = [bx - 14.5 * u, by - 3.2 * u + sway];
      const Tl = layer(F), tp = bez([t0, t1, t2], 20);
      // the living half of the brush, then the burnt half: ash grey, thinner, cracked with embers
      tube(Tl, tp.slice(0, 12), (q) => (1.2 + Math.sin(q * Math.PI * 0.9) * 1.3) * u, fur, { fur: 5 });
      tube(Tl, tp.slice(10), (q) => (1.9 - q * 1.1) * u, ASH, { matte: true });
      for (let k = 11; k < 20; k += 3) over(Tl, tp[k][0], tp[k][1] + ((k & 1) ? 1 : -1), ASH[4]);
      put(L, Tl, true);
      spark(F, tp[13][0], tp[13][1] + 1, HOT[1]); spark(F, tp[16][0], tp[16][1], HOT[2]);
      // flakes of ash drifting up and back off the tip, a few still glowing
      const drift = (P.act === 'run' ? t * 2 : t) % 1;
      for (let k = 0; k < 5; k++) {
        const f = (k / 5 + drift) % 1, x = t2[0] - (1 + f * 7) * u - (run ? f * 3 * u : 0), y = t2[1] - (0.6 + f * 3.5) * u + sin(f + k * 0.3) * 0.8 * u;
        const n = f < 0.6 ? 2 : 1;
        if (k === 1 || k === 3) spark(F, x, y, k === 1 ? HOT[2] : HOT[1], n);
        else { L.rect(R(x), R(y), n + 1, n, ASH[f < 0.4 ? 3 : 2]); L.set(R(x), R(y), ASH[4]); }
      }
      // ---- legs: long, thin, digitigrade; far pair first
      const leg = (hipX, hipY, ph, front, far) => {
        const Lg = layer(F), Rl = far ? furD : fur;
        const hip = [hipX, hipY];
        let dx = 0, lift = 0;
        if (run) [dx, lift] = stride(ph, 7 * u, 2.4 * u);
        else if (a1) dx = front ? 1.6 * u : -0.6 * u;
        else if (a2) dx = front ? 3 * u : -2.2 * u;
        const foot = [hipX + dx + (front ? 0.6 * u : -0.4 * u), oy - lift];
        if (front) {
          const knee = ik(hip, [foot[0], foot[1] - 1.2 * u], 4.8 * u, 4.6 * u, -1);
          tube(Lg, [hip, knee], [1.9 * u, 1.0 * u], Rl, { fur: 4 });
          tube(Lg, [knee, [foot[0], foot[1] - 1.2 * u]], [0.8 * u, 0.6 * u], Rl);
        } else {
          // thigh, shin, then a long hock to the paw
          const hock = [foot[0] - 1.6 * u, foot[1] - 3.4 * u];
          const knee = ik(hip, hock, 4.2 * u, 4.4 * u, -1);
          tube(Lg, [hip, knee], [2.2 * u, 1.2 * u], Rl, { fur: 4 });
          tube(Lg, [knee, hock], [1.1 * u, 0.7 * u], Rl);
          tube(Lg, [hock, [foot[0], foot[1] - 1 * u]], [0.7 * u, 0.6 * u], Rl);
        }
        blob(Lg, [[foot[0] + 0.5 * u, foot[1] - 0.7 * u, 1.2 * u, 0.7 * u]], Rl);
        Lg.set(R(foot[0] + 1.6 * u), R(foot[1] - 0.4 * u), BONEP[2]);
        put(L, Lg, !far);
      };
      leg(bx + 5.6 * u, by + 1.2 * u, t + 0.6, true, true);
      leg(bx - 5.2 * u, by + 0.2 * u, t + 0.1, false, true);
      // ---- body: deep chest, tucked waist, narrow rump; dark saddle along the back
      const B = layer(F);
      blob(B, [[bx + 4 * u, by, 4.6 * u, 4.4 * u], [bx - 0.5 * u, by - 0.6 * u, 4.6 * u, 2.8 * u], [bx - 5.2 * u, by - 0.4 * u, 3.4 * u, 3.2 * u]], fur, { fur: 6 });
      // saddle: the darker mantle over the back
      for (let x = R(bx - 8 * u); x <= bx + 6 * u; x++) {
        let y0 = -1; for (let y = 0; y < B.h; y++) if (B.a(x, y)) { y0 = y; break; }
        if (y0 < 0) continue;
        const d = R((1.4 + Math.sin(x * 0.7) * 0.4) * u);
        for (let k = 0; k < d; k++) over(B, x, y0 + k, k === 0 ? sad[4] : sad[3]);
      }
      // pale throat and belly line
      for (let x = R(bx - 3 * u); x <= bx + 7 * u; x++) { let y1 = -1; for (let y = B.h - 1; y >= 0; y--) if (B.a(x, y)) { y1 = y; break; } if (y1 > 0) { over(B, x, y1, belly[2]); over(B, x, y1 - 1, belly[3]); } }
      // the open ribcage: a dark hollow lit red from inside, the coal in it, bone bars over it
      const rx = bx + 3.6 * u, ry = by + 0.4 * u;
      B.ellipse(rx, ry, 3.7 * u, 3.4 * u, MAW_D);
      B.ellipse(rx + 0.3 * u, ry + 0.6 * u, 3.0 * u, 2.6 * u, hurt ? MAW : HOT[0]);
      put(L, B, true);
      put(F.p, L, false);
      // the coal: dim on the hit, flaring on the bite
      const cr = (hurt ? 1.1 : a2 ? 2.5 : a1 ? 2.0 : 1.6 + (idle ? sin(t) * 0.25 : 0)) * u;
      const lowFire = ['#3a0e10', '#7a1e14', '#7a1e14', '#c2401c', '#ec7a2a', '#f8b848'];
      if (!hurt) flame(F, rx + 0.3 * u, ry + 1.6 * u, (3.4 + (idle ? (P.i % 2) * 0.8 : 0) + (a1 ? 1 : 0)) * u, 3.4 * u, t, { ramp: lowFire });
      glow(F, rx + 0.3 * u, ry + 1.6 * u, cr, hurt ? HOT[1] : a2 ? HOT[3] : HOT[2], { core: hurt ? '#c2401c' : '#fff0b0', halo: a2 });
      if (a2) flame(F, rx + 0.2 * u, ry - 1.4 * u, 7.5 * u, 3.6 * u, 0.3);
      // rib bars: three bone arcs from the spine curving down and forward, 2 px each
      for (let k = 0; k < 3; k++) {
        const x0 = rx - 2.4 * u + k * 2.5 * u;
        for (const [x, y] of bez([[x0 - 0.4 * u, ry - 3.3 * u], [x0 + 1.6 * u, ry - 0.6 * u], [x0 + 0.6 * u, ry + 3.1 * u]], 24)) {
          F.p.set(R(x), R(y), BONEP[3]); F.p.set(R(x) + 1, R(y), BONEP[1]); F.e.clear(R(x), R(y)); F.e.clear(R(x) + 1, R(y));
        }
      }
      // ---- neck and head
      const hx = bx + 10.5 * u + (a2 ? 2.4 * u : a1 ? -1 * u : 0), hy = by - 6.8 * u + (a1 ? 2.2 * u : a2 ? 1.6 * u : hurt ? -1.2 * u : 0) + (run ? sin(t + 0.2) * 0.4 * u : 0);
      const H = layer(F);
      tube(H, [[bx + 5.8 * u, by - 3.4 * u], [hx - 2 * u, hy + 1.6 * u]], [2.4 * u, 2.1 * u], fur, { fur: 7 });
      const v = u; { const u = v * 1.22;   // the head runs big
      // far ear, then skull, snout, jaw, near ear
      const earBack = run ? 1.4 * u : a1 ? 2.2 * u : hurt ? 2.8 * u : 0;
      const twitch = idle && P.i === 2 ? 1.4 * u : 0;
      const ear = (dx, far, tw) => {
        const base0 = [hx - 2.2 * u + dx, hy - 0.9 * u], base1 = [hx + 1.0 * u + dx, hy - 1.8 * u], tip = [hx - 1.8 * u + dx * 1.8 - earBack + tw, hy - 9.4 * u + earBack * 0.4 + (far ? 0.6 * u : 0)];
        const Rm = far ? sad : fur;
        slab(H, [base0, base1, [lerp(base1[0], tip[0], 0.5) + 0.9 * u, lerp(base1[1], tip[1], 0.5)], tip, [lerp(base0[0], tip[0], 0.5) - 0.6 * u, lerp(base0[1], tip[1], 0.5)]], Rm, { wide: true });
        if (!far) { facet(H, [[base0[0] + 0.9 * u, base0[1] - 0.6 * u], [base1[0] - 0.5 * u, base1[1] - 0.2 * u], [lerp(base1[0], tip[0], 0.5) + 0.2 * u, lerp(base1[1], tip[1], 0.5)], [tip[0] + 0.2 * u, tip[1] + 1.8 * u]], '#7a2f4a'); facet(H, [[base0[0] + 1.6 * u, base0[1] - 0.8 * u], [base1[0] - 1.1 * u, base1[1] - 0.2 * u], [tip[0] + 0.4 * u, tip[1] + 3.6 * u]], '#a94a68'); }
        H.set(R(tip[0]), R(tip[1]), far ? sad[1] : sad[3]);
      };
      ear(1.8 * u, true, twitch);
      blob(H, [[hx, hy, 2.6 * u, 2.3 * u], [hx + 1.6 * u, hy + 0.6 * u, 1.8 * u, 1.5 * u]], fur, { fur: 8 });
      // jaw: hinges open on the bite
      const open = a2 ? 0.55 : a1 ? 0.18 : hurt ? 0.3 : 0;
      const jaw0 = [hx + 1 * u, hy + 1.5 * u], ja = 0.16 + open;
      const jawTip = [jaw0[0] + Math.cos(ja) * 4.6 * u, jaw0[1] + Math.sin(ja) * 4.6 * u];
      if (open > 0.1) {
        facet(H, [[hx + 1.4 * u, hy + 0.6 * u], [hx + 6.6 * u, hy + 0.9 * u], jawTip, jaw0], MAW_D);
        teeth(H, [hx + 2.6 * u, hy + 1.1 * u], [hx + 6 * u, hy + 1.3 * u], 3, Math.max(1, 0.9 * u), 1);
      }
      tube(H, [jaw0, jawTip], [0.9 * u, 0.6 * u], belly);
      // long snout
      tube(H, [[hx + 1.2 * u, hy - 0.2 * u], [hx + 6.4 * u, hy + 0.8 * u]], [1.6 * u, 0.85 * u], fur, { fur: 9 });
      eyeBead(H, hx + 6.6 * u, hy + 0.1 * u, Math.max(1, R(0.8 * u)));
      // a lip curl: a short dark line under the snout with a fang showing
      if (open <= 0.1) { H.line(hx + 2.2 * u, hy + 1.3 * u, hx + 5.4 * u, hy + 1.5 * u, sad[1]); H.set(R(hx + 3.6 * u), R(hy + 1.9 * u), BONEP[4]); }
      ear(0, false, 0);
      put(F.p, H, true);
      // an ember eye with a hard brow; squeezed shut on the hit
      if (hurt) F.p.line(hx + 0.4 * u, hy - 0.8 * u, hx + 1.8 * u, hy - 0.4 * u, VOID);
      else eyeGlow(F, hx + 0.5 * u, hy - 0.9 * u, Math.max(2, 1.3 * u), Math.max(1, 0.7 * u), a2 ? HOT[4] : HOT[3], { brow: sad[0] });
      F.mouth = [hx + 6 * u, hy + 1.5 * u];
      }
    },
  },

  // Censer Scorpion (ash_scorpion): a temple scorpion whose tail ends not in a sting but in a swinging
  // brass censer on a short chain. The censer is the silhouette: a pendulum hung over its own head,
  // smoking from its vents. It slams the censer down and flings burning incense from it.
  censer_scorpion: {
    view: 'side', box: [32, 24], pivot: 0.5, idleFps: 4,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle', a1 = P.atk === 1, a2 = P.atk === 2, hurt = P.hurt;
      const shell = P5(['#2a0e18', '#4a1420', '#60282c', '#8a3434', '#b04a3e']), rim = RUST, BRASS = pal5('gold', 4);
      const legR = P5(['#1d0814', '#2a0e18', '#3e1c22', '#55323d', '#7b576f']), legD = legR.map((c) => dark(c, 0.8));
      const bx = ox - 1 * u + (a1 ? -1 * u : a2 ? 1.2 * u : 0), by = oy - 5 * u + (idle ? sin(t) * 0.2 * u : 0) + (a1 ? 0.6 * u : 0) + (hurt ? -0.6 * u : 0);
      const L = layer(F);
      // ---- legs: four a side, knees high above the body; far side first
      const legs = (far) => {
        const Lg = layer(F), Rl = far ? legD : legR;
        for (let k = 0; k < 4; k++) {
          const hip = [bx + (k - 1.5) * 2.0 * u + (far ? 0.8 * u : 0), by + (far ? -0.6 * u : 1.4 * u)];
          const ph = run ? t + (k % 2 ? 0.5 : 0) + (far ? 0.25 : 0) : 0;
          const [dx, lift] = run ? stride(ph, 2.4 * u, 1.4 * u) : [0, 0];
          const foot = [hip[0] + (k - 1.5) * 3.4 * u + dx + (k < 2 ? -0.6 * u : 0.6 * u), oy - lift - (far ? 0.5 * u : 0)];
          const knee = [lerp(hip[0], foot[0], 0.5), hip[1] - (far ? 2.6 : 1.4) * u - lift * 0.4];
          tube(Lg, [hip, knee], [0.7 * u, 0.6 * u], Rl);
          tube(Lg, [knee, foot], [0.6 * u, 0.3 * u], Rl);
          Lg.set(R(knee[0]), R(knee[1] - 0.5 * u), Rl[4]);
        }
        put(L, Lg, !far);
      };
      legs(true);
      // ---- tail: five rings arching up and over, ending in a brass hook
      const tEnd = a1 ? [bx - 7 * u, by - 17 * u] : a2 ? [bx + 6 * u, by - 12.5 * u] : hurt ? [bx - 4 * u, by - 17.5 * u] : [bx - 1.5 * u + (run ? sin(t) * 0.6 * u : 0), by - 16 * u + (idle ? sin(t + 0.25) * 0.4 * u : 0)];
      const tc = a2 ? [bx - 8 * u, by - 19 * u] : [bx - 12 * u, by - 12 * u];
      const tp = bez([[bx - 6 * u, by - 1 * u], tc, tEnd], 30);
      const Tl = layer(F);
      tube(Tl, tp, (q) => (2.2 - q * 1.0) * u, shell, { rings: Math.max(3, R(2.6 * u)), ringC: shell[0] });
      // a lit knuckle at the top of each ring
      for (let k = 3; k < 30; k += 5) over(Tl, tp[k][0] - 0.6 * u, tp[k][1] - 0.8 * u, rim[3]);
      // the hook and a little brass cap where the sting should be
      const cap = tp[30];
      blob(Tl, [[cap[0], cap[1] - 0.2 * u, 1.1 * u, 1.1 * u]], BRASS);
      put(L, Tl, true);
      // ---- body: low carapace plates, the cephalothorax shield in front, ash dusting on the back
      const B = layer(F);
      blob(B, [[bx - 3.6 * u, by - 0.6 * u, 3.6 * u, 2.6 * u], [bx + 0.4 * u, by - 0.8 * u, 3.8 * u, 2.9 * u], [bx + 4.2 * u, by - 0.4 * u, 3.2 * u, 2.4 * u]], shell);
      for (let k = 0; k < 4; k++) { const x = R(bx + (-5.6 + k * 2.4) * u); for (let y = R(by - 4 * u); y < by + 2.5 * u; y++) if (B.a(x, y)) { B.set(x, y, shell[0]); if (B.a(x - 1, y)) B.set(x - 1, y, rim[3]); } }
      blob(B, [[bx + 4.6 * u, by - 2.6 * u, 2.0 * u, 1.3 * u]], shell);
      spots(B, bx - 2 * u, by - 2.6 * u, 4 * u, 0.8 * u, 6, 0.7 * u, ASH[3], 4);
      spots(B, bx - 2.5 * u, by - 2.9 * u, 3.4 * u, 0.5 * u, 4, 0.5 * u, ASH[4], 5);
      put(L, B, true);
      // ---- pincers: an arm and a fat chela each side, open on the wind-up, snapping on the strike
      const claw = (far) => {
        const C2 = layer(F), Rl = far ? legD : legR;
        const sh = [bx + 5 * u + (far ? 0.8 * u : 0), by + 0.4 * u - (far ? 0.6 * u : 0)];
        const reach = a2 ? 2.6 * u : a1 ? -1 * u : 0, raise = a1 ? 2.6 * u : 0;
        const el = [sh[0] + 2 * u + reach * 0.4, sh[1] - 2.4 * u - raise];
        const hand = [el[0] + 3.2 * u + reach, el[1] + 0.6 * u - raise * 0.3 + (idle ? sin(t + (far ? 0.5 : 0)) * 0.3 * u : 0)];
        tube(C2, [sh, el], [0.9 * u, 0.8 * u], Rl);
        tube(C2, [el, hand], [0.9 * u, 1.0 * u], Rl);
        const op = a1 ? 0.55 : a2 ? 0.05 : hurt ? 0.4 : 0.18 + (idle && P.i % 2 ? 0.12 : 0);
        horn(C2, [hand[0] + 1.8 * u, hand[1] + 0.6 * u], [hand[0] + 3.2 * u, hand[1] + 1.6 * u + op * 2 * u], [hand[0] + 4.4 * u, hand[1] + 0.4 * u + op * 1.6 * u], 1.5 * u, Rl);
        blob(C2, [[hand[0] + 0.8 * u, hand[1], 2.3 * u, 1.8 * u]], far ? Rl : rim, { lift: -0.15 });
        horn(C2, [hand[0] + 2 * u, hand[1] - 0.7 * u], [hand[0] + 3.8 * u, hand[1] - 1.6 * u - op * 3 * u], [hand[0] + 5.4 * u, hand[1] - 0.2 * u - op * 3 * u], 2.0 * u, far ? Rl : rim, { lift: -0.15 });
        put(L, C2, true);
      };
      claw(true);
      // face: a domed brow over two ember eyes, chelicerae below
      const fx = bx + 6.6 * u, fy = by - 0.6 * u;
      blob(L, [[fx - 0.6 * u, fy, 1.8 * u, 1.6 * u]], shell);
      tube(L, [[fx + 0.6 * u, fy + 0.8 * u], [fx + 1.8 * u, fy + 1.6 * u]], [0.6 * u, 0.4 * u], rim);
      legs(false);
      claw(false);
      put(F.p, L, false);
      if (hurt) { F.p.line(fx - 1 * u, fy - 0.8 * u, fx + 0.6 * u, fy - 0.4 * u, VOID); }
      else {
        // the eye mound on top of the head shield: two big ember eyes, a smaller pair down the side
        eyeGlow(F, bx + 3.6 * u, by - 3.6 * u, Math.max(2, 1.2 * u), Math.max(2, 1.0 * u), HOT[3], { brow: shell[0] });
        eyeGlow(F, bx + 5.2 * u, by - 3.2 * u, Math.max(2, 1.2 * u), Math.max(2, 1.0 * u), HOT[3]);
        spark(F, fx + 0.4 * u, fy - 0.8 * u, HOT[2]); spark(F, fx + 1.2 * u, fy - 0.4 * u, HOT[2]);
      }
      // ---- the censer: a short chain from the hook, swinging like a pendulum
      const sw = a1 ? -1.25 : a2 ? 1.05 : hurt ? -0.6 : run ? sin(t) * 0.5 : sin(t) * 0.32;
      const chainL = 4.6 * u, cr = 2.7 * u;
      const top = [cap[0] + Math.sin(sw) * chainL, cap[1] + 0.8 * u + Math.cos(sw) * chainL];
      for (let f = 0; f <= 1; f += 0.2) { const x = lerp(cap[0], top[0], f), y = lerp(cap[1] + 0.8 * u, top[1], f); F.p.rect(R(x), R(y), 1, 1, BRASS[f * 5 % 2 < 1 ? 2 : 4]); }
      const cx = top[0] + Math.sin(sw) * cr * 1.2, cy = top[1] + Math.cos(sw) * cr * 1.2;
      const Cn = layer(F);
      // smoke first, curling up and away from the swing
      const S = layer(F);
      const drift = idle || run ? t : a2 ? 0.5 : 0.2;
      for (let k = 0; k < 3; k++) {
        const f = (k / 3 + drift) % 1;
        const sx = cx - Math.sin(sw) * 3 * u - f * 3 * u + sin(f * 0.8 + k * 0.3) * 1.4 * u, sy = cy - cr - 1.5 * u - f * 7 * u;
        puff(S, sx, sy, (1.0 + f * 1.3) * u, SMOKE, k + 1);
      }
      if (a2 || hurt) for (let k = 0; k < 3; k++) puff(S, cx + (k - 1) * 3 * u, cy - cr - 1 * u + (k % 2) * u, 1.6 * u, SMOKE, k + 7);
      put(F.p, S, false);
      // the bowl: a brass half-sphere on a little foot, a rim band, then a tall pierced dome lid
      // with a finial; the lid's piercings glow from the coals inside
      blob(Cn, [[cx, cy + 0.6 * u, cr, cr * 0.75]], BRASS, { clipY: R(cy + 0.6 * u + cr * 0.75) });
      slab(Cn, [[cx - 0.9 * u, cy + cr * 0.75], [cx + 0.9 * u, cy + cr * 0.75], [cx + 1.3 * u, cy + cr * 0.75 + 1.2 * u], [cx - 1.3 * u, cy + cr * 0.75 + 1.2 * u]], BRASS);
      Cn.poly([[cx - cr * 0.85, cy + 0.2 * u], [cx + cr * 0.85, cy + 0.2 * u], [cx + cr * 0.5, cy - cr * 0.9], [cx, cy - cr * 1.35], [cx - cr * 0.5, cy - cr * 0.9]], BRASS[3]);
      Cn.line(cx - cr * 0.5, cy - cr * 0.9, cx, cy - cr * 1.35, BRASS[4]);
      Cn.disc(cx, cy - cr * 1.45, Math.max(0.8, 0.6 * u), BRASS[4]);
      for (let x = R(cx - cr); x <= cx + cr; x++) { over(Cn, x, R(cy + 0.4 * u), BRASS[1]); over(Cn, x, R(cy + 0.4 * u) - 1, BRASS[4]); }
      // shade the lid's right flank
      for (let y = R(cy - cr * 1.3); y <= cy; y++) for (let x = R(cx + 0.3 * u); x <= cx + cr; x++) if (Cn.a(x, y) && !Cn.a(x + 1, y)) { Cn.set(x, y, BRASS[1]); Cn.set(x - 1, y, BRASS[2]); }
      put(F.p, Cn, true);
      const vc = a2 ? HOT[3] : hurt ? HOT[0] : HOT[2];
      for (const [vx, vy] of [[-0.42, -0.2], [0.12, -0.2], [-0.16, -0.68]]) { const x = R(cx + vx * cr * 1.4), y = R(cy + vy * cr * 1.2); F.p.rect(x - 1, y, 1, 2, MAW_D); spark(F, x, y, vc); spark(F, x, y + 1, HOT[1]); }
      F.p.line(cx - cr * 0.6, cy + 0.4 * u + 2, cx + cr * 0.6, cy + 0.4 * u + 2, BRASS[2]);
      if (a2) for (let k = 0; k < 6; k++) { const a = -0.3 + k * 0.5; spark(F, cx + Math.cos(a) * (cr + 2 * u + (k % 2) * u), cy + Math.sin(a) * (cr + 1.5 * u), k % 2 ? HOT[2] : HOT[3], 2); }
      F.mouth = [cx, cy];
    },
  },

  // Haboob Veil (sand_wraith): a ghul of the dust storms. A floating gilt death-mask, wrapped in a
  // long scarf of blowing sand that streams off to one side; two empty sleeves of sand, and below
  // them a small whirlwind instead of legs. Sand runs from the mask's eyes like tears.
  haboob_veil: {
    view: 'front', box: [36, 31], pivot: 0.56, idleFps: 5, hover: true,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle', a1 = P.atk === 1, a2 = P.atk === 2, hurt = P.hurt;
      const SD = pal5('sand', 5), G = pal5('gold', 5), Gd = pal5('gold', 4);
      const RED = P5(['#3e1c22', '#662b2c', '#8a4238', '#9c615b', '#bc7c70']), REDl = P5(['#662b2c', '#8a4238', '#9c615b', '#bc7c70', '#d9a08a']);
      const spin = (idle ? t : run ? t * 2 : a2 ? 0.5 : 0.25);
      const cx = ox, top = oy - 13.5 * u, tipY = oy - 1 * u;
      const sway = (idle ? sin(t) : run ? sin(t) * 1.5 : 0) * 1.3 * u;
      const lift = a1 ? -1.6 * u : a2 ? 0.8 * u : 0;
      const hx = cx + (hurt ? 1.2 * u : 0), hy = oy - 22 * u + lift + (idle ? sin(t + 0.25) * 0.4 * u : 0);
      const L = layer(F);
      // ---- the scarf: a flat ribbon of red sand streaming off to the left, twisting as it waves
      const wv = (k) => sin(k * 0.55 - spin * 2) * (run ? 2.4 : 1.8) * u;
      const sc = [[hx + 2 * u, hy - 4.2 * u], [hx - 6 * u, hy - 5.6 * u + wv(1)], [hx - 11.5 * u, hy - 3 * u + wv(2)], [hx - 16.5 * u, hy - 5 * u + wv(3)], [hx - 21 * u, hy - 2.5 * u + wv(4)]];
      const scp = [];
      for (let k = 0; k < sc.length - 1; k++) scp.push(...bez([sc[k], [(sc[k][0] + sc[k + 1][0]) / 2, (sc[k][1] + sc[k + 1][1]) / 2 + (k % 2 ? 1.4 : -1.4) * u], sc[k + 1]], 10).slice(k ? 1 : 0));
      const Sc = layer(F), N = scp.length;
      for (let k = 0; k < N - 1; k++) {
        const q = k / (N - 1), [x0, y0] = scp[k], [x1, y1] = scp[k + 1];
        const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
        const tw = Math.cos(q * 2.6 * Math.PI + spin * TAU), w = (2.6 - q * 1.5) * u * (0.35 + 0.65 * Math.abs(tw));
        const q2 = (k + 1) / (N - 1), tw2 = Math.cos(q2 * 2.6 * Math.PI + spin * TAU), w2 = (2.6 - q2 * 1.5) * u * (0.35 + 0.65 * Math.abs(tw2));
        Sc.poly([[x0 + nx * w, y0 + ny * w], [x1 + nx * w2, y1 + ny * w2], [x1 - nx * w2, y1 - ny * w2], [x0 - nx * w, y0 - ny * w]], tw > 0 ? REDl[3] : RED[2]);
      }
      // a lit upper edge and a dark lower edge on the ribbon
      for (let x = 0; x < Sc.w; x++) { let y0 = -1, y1 = -1; for (let y = 0; y < Sc.h; y++) if (Sc.a(x, y)) { if (y0 < 0) y0 = y; y1 = y; } if (y0 >= 0) { Sc.set(x, y0, REDl[4]); Sc.set(x, y1, RED[1]); } }
      put(L, Sc, true);
      for (let k = 0; k < 7; k++) { const f = (k / 7 + spin) % 1, e = scp[N - 1]; L.rect(R(e[0] - (0.5 + f * 6) * u), R(e[1] + (k % 3 - 1) * 1.6 * u + f * 2 * u), f < 0.5 ? 2 : 1, f < 0.3 ? 2 : 1, k % 2 ? REDl[4] : RED[3]); }
      // ---- the whirlwind: a funnel of tilted rings, the front arcs lit, turning downward
      const W = layer(F);
      const tipX = cx + sway;
      // the column wobbles: each row's centre and width drift with the turning
      const mid = (y) => { const f = clamp((y - top) / (tipY - top), 0, 1); return [lerp(cx, tipX, f * f) + Math.sin(y / (2.6 * u) + spin * TAU) * 0.9 * u * (0.3 + f), lerp(6.2 * u, 0.8 * u, Math.pow(f, 0.75)) * (1 + 0.1 * Math.sin(y * 0.7 / u + spin * TAU * 2))]; };
      for (let y = R(top); y <= tipY - 2 * u; y++) { const [mx, half] = mid(y); for (let x = Math.floor(mx - half); x <= mx + half; x++) { const nx = (x + 0.5 - mx) / half; W.set(x, y, SD[nx > 0.45 ? 1 : nx < -0.4 ? 3 : 2]); } }
      // the bottom of the column breaks up into loose grit
      for (let k = 0; k < 6; k++) { const y = tipY - 2 * u + k * 0.45 * u, [mx] = mid(y); W.rect(R(mx + Math.sin(k * 2.1 + spin * TAU) * 1.2 * u), R(y), 2 - (k > 3), 1, SD[k % 2 ? 2 : 3]); }
      // spiral bands: tilted arcs, alternating pale sand and red dust, winding down as it turns
      const gap = Math.max(3, 2.3 * u), ph = (spin * gap * 2) % gap;
      let n = 0;
      for (let yy = top + ph; yy < tipY - 2.5 * u; yy += gap, n++) {
        const [mx, half] = mid(yy), ry = Math.max(1, half * 0.3), red = (n + Math.floor(spin * 2)) % 2 === 1;
        for (let a = 0.1; a < Math.PI * 0.8; a += 0.035) { const x = mx - Math.cos(a) * half, y = yy + Math.sin(a) * ry - (x - mx) * 0.18; const c = red ? (Math.cos(a) > 0.2 ? REDl[4] : REDl[3]) : (Math.cos(a) > 0.2 ? SD[4] : SD[3]); W.set(R(x), R(y), c); if (half > 3 * u) W.set(R(x), R(y) + 1, red ? REDl[2] : SD[2]); }
      }
      for (let k = 0; k < 5; k++) { const a = (k / 5 + spin) * TAU, y = lerp(top + 2 * u, tipY - 2 * u, k / 5), r = lerp(7.4, 2.6, k / 5) * u; if (Math.sin(a) < 0) continue; L.rect(R(cx + Math.cos(a) * r), R(y), 2, 1, SD[4]); }
      put(L, W, false);
      // ---- the cowl: red sand heaped round a dark hollow where a head should be
      const B = layer(F);
      blob(B, [[cx, oy - 15 * u + lift * 0.5, 6.6 * u, 4 * u], [hx, hy + 0.6 * u, 6 * u, 6.4 * u]], RED, { tex: 3 });
      B.ellipse(hx, hy + 0.6 * u, 4.8 * u, 5.6 * u, MAROON[0]);
      B.ellipse(hx, hy + 0.9 * u, 4.4 * u, 5 * u, MAROON[1]);
      put(L, B, true);
      // ---- sleeves: wide bell sleeves of red sand, empty, their cuffs fraying into grains
      const sleeve = (sg) => {
        const S2 = layer(F);
        const sh = [cx + sg * 5.2 * u, oy - 17 * u + lift];
        const pose = a1 ? [8.5, -8] : a2 ? [5, 4] : hurt ? [6, 2] : [7.5, 5.5];
        const cuff = [sh[0] + sg * pose[0] * u, sh[1] + pose[1] * u + (idle ? sin(t + (sg > 0 ? 0.5 : 0)) * 0.7 * u : run ? 1.5 * u : 0)];
        const dx = cuff[0] - sh[0], dy = cuff[1] - sh[1], d = Math.hypot(dx, dy), nx = -dy / d, ny = dx / d;
        const w0 = 1.8 * u, w1 = 3.4 * u;
        S2.poly([[sh[0] + nx * w0, sh[1] + ny * w0], [cuff[0] + nx * w1, cuff[1] + ny * w1], [cuff[0] - nx * w1, cuff[1] - ny * w1], [sh[0] - nx * w0, sh[1] - ny * w0]], RED[3]);
        cyl(S2, RED, { wide: true });
        // fold line down the sleeve and a dark open cuff, ragged
        S2.line(lerp(sh[0], cuff[0], 0.2), lerp(sh[1], cuff[1], 0.2), cuff[0] + nx * 1.2 * u, cuff[1] + ny * 1.2 * u, RED[1]);
        S2.ellipse(cuff[0], cuff[1], Math.max(1.4 * u, Math.abs(nx) * w1 * 0.9), Math.max(1.2 * u, Math.abs(ny) * w1 * 0.9), MAROON[0]);
        for (let k = -2; k <= 2; k++) { const x = cuff[0] + nx * k * 1.3 * u, y = cuff[1] + ny * k * 1.3 * u; S2.rect(R(x + dx / d * 1.2 * u), R(y + dy / d * 1.2 * u), Math.max(1, R(0.9 * u)), Math.max(1, R(0.9 * u)), RED[k & 1 ? 2 : 3]); }
        put(L, S2, true);
        for (let k = 0; k < 3; k++) { const f = (k / 3 + spin) % 1; L.rect(R(cuff[0] + (k - 1) * 0.9 * u), R(cuff[1] + 2.6 * u + f * 4 * u), 1, f < 0.5 ? 2 : 1, SD[3]); }
        if (a2) for (let k = 0; k < 5; k++) { const a = Math.atan2(dy, dx) + (k - 2) * 0.35; L.rect(R(cuff[0] + Math.cos(a) * (3 + k % 2 * 2) * u), R(cuff[1] + Math.sin(a) * (3 + k % 2 * 2) * u), 2, 2, SD[4]); }
      };
      sleeve(-1); sleeve(1);
      put(F.p, L, false);
      // ---- the gilt mask: a long calm face with heavy lids, a striped headband, a plaited beard
      const M = layer(F), mrx = 3.9 * u, mry = 4.8 * u;
      blob(M, [[hx, hy, mrx, mry], [hx, hy + 4 * u, 1.5 * u, 1.8 * u]], G);
      for (let y = R(hy - mry * 0.78); y <= hy - mry * 0.55; y++) for (let x = R(hx - mrx); x <= hx + mrx; x++) over(M, x, y, y === R(hy - mry * 0.78) ? G[4] : Gd[2]);
      for (let k = 0; k < 3; k++) for (let x = R(hx - 1.3 * u); x <= hx + 1.3 * u; x++) over(M, x, R(hy + 3.2 * u + k * 1.2 * u), '#243e7b');
      // brows, nose ridge, cheek shadow on the right
      for (const sg of [-1, 1]) M.line(hx + sg * 0.6 * u, hy - 1.7 * u, hx + sg * 2.8 * u, hy - 1.5 * u + (a1 ? -0.4 * u : 0), Gd[1]);
      M.line(hx + 0.4 * u, hy - 1.2 * u, hx + 0.6 * u, hy + 1 * u, Gd[2]);
      M.line(hx + 0.6 * u, hy + 1.1 * u, hx - 0.3 * u, hy + 1.3 * u, Gd[1]);
      for (let y = R(hy - 0.5 * u); y < hy + 2.5 * u; y++) over(M, R(hx + mrx * 0.82), y, Gd[2]);
      const mo = a2 ? 1.8 * u : a1 ? 0.6 * u : hurt ? 0.9 * u : 0;
      if (mo > 0) M.ellipse(hx, hy + 2.3 * u, 1.4 * u, mo, VOID);
      else M.line(hx - 1.1 * u, hy + 2.2 * u, hx + 1.1 * u, hy + 2.2 * u, Gd[1]);
      for (const sg of [-1, 1]) { M.ellipse(hx + sg * 1.6 * u, hy - 0.5 * u, 1.2 * u, 0.65 * u, VOID); M.line(hx + sg * 2.8 * u, hy - 0.5 * u, hx + sg * 3.6 * u, hy - 0.1 * u, '#172d64'); }
      if (hurt) { crack(M, hx - 0.8 * u, hy - mry, 1.75, 8 * u, Gd[0], 5); }
      put(F.p, M, true);
      const ec = a2 ? HOT[4] : HOT[3];
      if (!hurt) for (const sg of [-1, 1]) eyeGlow(F, hx + sg * 1.6 * u - 0.5 * u, hy - 0.8 * u, Math.max(1, 1 * u), Math.max(1, 0.6 * u), ec);
      // sand tears running down from the eye holes
      const drip = (idle ? t : 0.4);
      for (const sg of [-1, 1]) for (let k = 0; k < 2; k++) { const f = (k * 0.5 + drip + (sg > 0 ? 0.25 : 0)) % 1; F.p.rect(R(hx + sg * 1.7 * u), R(hy + 0.3 * u + f * 3.6 * u), 1, 2, SD[4]); }
      if (a2) for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 0.9 + 0.15; F.p.rect(R(hx + Math.cos(a) * (2 + k % 3) * u), R(hy + 3.4 * u + Math.sin(a) * (2.5 + (k % 2) * 1.5) * u), 2, 2, SD[k % 2 ? 4 : 3]); }
      F.mouth = [hx, hy + 2.4 * u];
    },
  },

  // Olgoi Worm (sandworm): the Mongolian death worm. A fat, ribbed red worm with no face at all
  // until its head opens: four thick petals peel back like a desert flower, lined with teeth of
  // rose glass round a dark throat. Two little heat-pits glow on the crown.
  olgoi_worm: {
    view: 'side', box: [30, 26], pivot: 0.42, idleFps: 3, segR: 4.8, segTaper: 0.55,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle', a1 = P.atk === 1, a2 = P.atk === 2, hurt = P.hurt;
      const Rd = WORM, Rl = WORM_BELLY;
      const FLESH = P5(['#4a1a30', '#7a2f4a', '#a94a68', '#cc6a86', '#e48fb0']);
      const r0 = 4.8 * u, hr = r0 * 1.08;
      const rear = a1 ? 2.6 * u : a2 ? 1.6 * u : hurt ? 0.6 * u : 0;
      const cx = ox + (a2 ? 2.4 * u : a1 ? -1.6 * u : hurt ? -1 * u : 0), cy = oy - r0 * 1.1 - rear + (idle ? sin(t) * 0.35 * u : run ? -Math.abs(sin(t)) * 0.8 * u : 0);
      const L = layer(F);
      // ---- head: a fat ribbed cylinder, a neck stub trailing back into the first segment
      const H = layer(F);
      blob(H, [[cx - 3.4 * u, cy + 0.6 * u + rear * 0.3, hr * 0.92, hr * 0.88], [cx, cy, hr, hr * 0.95]], Rd, { tex: 2 });
      wormRibs(H, cx, cy, hr, [-2.6 * u, 0.2 * u], Rd);
      wormBelly(H, cx - 7 * u, cx + hr, Rl);
      put(L, H, true);
      put(F.p, L, false);
      // ---- the flower mouth
      const mx = cx + hr * 0.78, my = cy;
      if (a1 || a2) {
        // open: four petals peeled back in an X round the throat (cheated a quarter-turn toward us)
        const k = a2 ? 1 : 0.7, len = (a2 ? 6.4 : 5) * u, w = (a2 ? 3.6 : 3) * u;
        const M = layer(F);
        for (const ang of [-2.3, 2.3, -0.75, 0.75]) olgoiPetal(M, mx + (Math.abs(ang) > 1.5 ? -0.6 * u : 0.6 * u), my, ang, len * (Math.abs(ang) > 1.5 ? 0.85 : 1), w, Rd, FLESH, u);
        // the throat: a dark disc ringed with glass fangs
        const tr = 2.6 * u * k;
        M.ellipse(mx, my, tr * 0.8, tr, MAW_D);
        M.ellipse(mx + 0.3 * u, my + 0.2 * u, tr * 0.4, tr * 0.5, VOID);
        for (let q = 0; q < 8; q++) { const a = q / 8 * TAU; shard(M, mx + Math.cos(a) * tr * 0.75, my + Math.sin(a) * tr * 0.92, a + Math.PI, Math.max(1.6, tr * 0.45), Math.max(0.6, 0.4 * u), GLASS_T); }
        put(F.p, M, true);
      } else {
        // closed bud: four petals meeting in a blunt point, seams showing; the tips part when it tastes the air
        const Bd = layer(F), tipX = mx + 4.6 * u - (hurt ? 0.8 * u : 0), gape = idle && P.i === 1 ? 1.2 * u : 0;
        slab(Bd, [[mx - 1 * u, my - hr * 0.86], [mx + 2.2 * u, my - hr * 0.62], [tipX, my - 0.5 * u - gape], [tipX - 0.6 * u, my + 0.6 * u + gape], [mx + 2 * u, my + hr * 0.64], [mx - 1 * u, my + hr * 0.86]], PETAL, { wide: true });
        Bd.line(mx + 0.4 * u, my - 0.2 * u, tipX - 0.2 * u, my, PETAL[0]);
        for (const [x, y] of bez([[mx - 0.6 * u, my + hr * 0.72], [mx + 1.6 * u, my + 1.6 * u], [tipX - 0.8 * u, my + 0.3 * u]], 14)) over(Bd, x, y, PETAL[1]);
        for (const [x, y] of bez([[mx - 0.2 * u, my - hr * 0.76], [mx + 1.8 * u, my - 1.8 * u], [tipX - 0.6 * u, my - 0.4 * u]], 14)) over(Bd, x, y + 1, PETAL[4]);
        if (gape) { Bd.line(tipX - 1.4 * u, my, tipX, my, MAW_D); Bd.set(R(tipX - 0.6 * u), R(my + 1), GLASS_T[4]); }
        put(F.p, Bd, true);
      }
      // heat-pits on the crown: the only "eyes" it has, flaring when it strikes, shut when hit
      if (!hurt) { const ec = a2 ? HOT[4] : HOT[3]; eyeGlow(F, cx + 0.6 * u, cy - hr * 0.8, Math.max(2, 1.1 * u), Math.max(1, 0.7 * u), ec); eyeGlow(F, cx + 2.6 * u, cy - hr * 0.64, Math.max(2, 1.1 * u), Math.max(1, 0.7 * u), ec); }
      else { F.p.line(cx + 0.4 * u, cy - hr * 0.8, cx + 1.8 * u, cy - hr * 0.7, VOID); F.p.line(cx + 2.4 * u, cy - hr * 0.62, cx + 3.6 * u, cy - hr * 0.56, VOID); }
      // sand sloughing off the back as it moves
      if (run || a2) for (let k = 0; k < 3; k++) { const f = (k / 3 + t) % 1; F.p.rect(R(cx - 2 * u - f * 3 * u), R(cy - hr * 0.95 + f * 2 * u), 2, 1, pal5('sand', 5)[3]); }
      F.mouth = [mx + 1 * u, my];
    },
    // one body ring: a fat red disc with rib grooves, a lit lip and a sand-scoured belly
    seg(F, o, i, r) {
      const { cx, cy } = F, L = F.p;
      blob(L, [[cx, cy, r, r * 0.92]], WORM, { tex: 10 + i });
      wormRibs(L, cx, cy, r, [-0.3 * r, 0.4 * r], WORM);
      wormBelly(L, cx - r, cx + r, WORM_BELLY);
      if (i % 3 === 1 && r >= 4) { L.set(R(cx - r * 0.5), R(cy - r * 0.45), WORM[4]); L.set(R(cx - r * 0.5) + 1, R(cy - r * 0.45), WORM[3]); }
    },
  },
};
