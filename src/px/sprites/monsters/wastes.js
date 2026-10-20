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
// a jagged lightning path from p heading at angle a for len, kinking every step (seeded, so the
// same bolt comes out every frame unless jit changes)
function zig(p, a, len, steps, seed, jit = 0.55) {
  const q = srand(seed), pts = [p.slice()];
  let [x, y] = p;
  for (let k = 1; k <= steps; k++) { const aa = a + (q() - 0.5) * jit * 2, l = len / steps; x += Math.cos(aa) * l; y += Math.sin(aa) * l; pts.push([x, y]); }
  return pts;
}
// a frozen bolt of fulgurite along a path: an angular, tapering strip of red glass (flat facets,
// lit top-left edge, a glint line inside it), sand crust in clusters, and a hot vein of light down
// its middle into F.e
function glassBolt(F, L, pts, w0, w1, vein, crust = true) {
  const T = blank(L), n = pts.length - 1;
  for (let k = 0; k < n; k++) {
    const [x0, y0] = pts[k], [x1, y1] = pts[k + 1], d = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / d, ny = (x1 - x0) / d;
    const wa = lerp(w0, w1, k / n), wb = lerp(w0, w1, (k + 1) / n);
    T.poly([[x0 + nx * wa, y0 + ny * wa], [x1 + nx * wb, y1 + ny * wb], [x1 - nx * wb, y1 - ny * wb], [x0 - nx * wa, y0 - ny * wa]], FULG[3]);
    T.disc(x1, y1, wb * 0.95, FULG[3]);
  }
  cyl(T, FULG, { wide: w0 > 2.5 });
  // a glint running inside the lit edge
  for (let k = 0; k < n; k++) {
    const [x0, y0] = pts[k], [x1, y1] = pts[k + 1], d = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / d, ny = (x1 - x0) / d;
    const sg = nx * -0.48 + ny * -0.62 > 0 ? 1 : -1, wa = lerp(w0, w1, k / n) * 0.45;
    if (wa >= 0.8) for (let f = 0.15; f < 0.85; f += 0.1) over(T, lerp(x0, x1, f) + nx * sg * wa, lerp(y0, y1, f) + ny * sg * wa, '#f4bccf');
  }
  if (crust) for (let k = 1; k < n; k += 2) { const [x, y] = pts[k]; over(T, x - 1, y + 1, '#8a6a52'); over(T, x, y + 1, '#b08a64'); over(T, x - 1, y + 2, '#8a6a52'); }
  put(L, T, true);
  if (vein) for (let k = 0; k < n; k++) F.e.line(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], C(vein));
}
const FULG = P5(['#2a0e18', '#4a1420', '#8a3434', '#b04a3e', '#d9765a']);
// a horizontal cone of fire (breath) from (x, y) toward +x, len long, opening to half-height h
function breath(F, x, y, len, h, t = 0) {
  const rp = PAL.ember.map((c) => C(c));
  for (const [k, col] of [[1, rp[2]], [0.75, rp[3]], [0.5, rp[4]], [0.25, rp[5]]]) {
    const ll = len * (0.6 + 0.4 * k);
    for (let xx = 0; xx <= ll; xx++) {
      const f = xx / ll, half = h * k * Math.sqrt(f) * (1 - f * 0.25) + 0.6, wob = Math.sin((f * 2 + t) * TAU) * h * 0.15 * f;
      for (let yy = Math.floor(y + wob - half); yy <= y + wob + half; yy++) { F.p.set(R(x + xx), yy, col); F.e.set(R(x + xx), yy, col); }
    }
  }
  for (let k = 0; k < 4; k++) spark(F, x + len * (0.7 + k * 0.12), y + (k % 2 ? -1 : 1) * h * (0.5 + k * 0.2), rp[4]);
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
  colossus_shard: { design: 'wandering_hand', name: 'Wandering Hand' },
  glass_elemental: { design: 'fulgurite', name: 'Fulgurite' },
  sunmad_pilgrim: { design: 'sun_pilgrim', name: 'Sun-Eaten Pilgrim' },
  drakeling: { design: 'kettle_drake', name: 'Kettle Drake' },
  carrion_vulture: { design: 'bone_vulture', name: 'Bone Vulture' },
  scorpion_queen: { design: 'scorpion_queen', name: 'The Scorpion Queen' },
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
    view: 'side', box: [32, 30], pivot: 0.45, idleFps: 3, segR: 4.8, segTaper: 0.55,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle', a1 = P.atk === 1, a2 = P.atk === 2, hurt = P.hurt;
      const Rd = WORM, Rl = WORM_BELLY;
      const FLESH = P5(['#4a1a30', '#7a2f4a', '#a94a68', '#cc6a86', '#e48fb0']);
      const r0 = 4.8 * u, hr = r0 * 1.08;
      const rear = a1 ? 3.4 * u : a2 ? -0.6 * u : hurt ? 1.4 * u : 0;
      const cx = ox + 1 * u + (a2 ? 3.4 * u : a1 ? -2.4 * u : hurt ? -1.4 * u : 0), cy = oy - r0 * 1.75 - rear + (idle ? sin(t) * 0.5 * u : run ? -Math.abs(sin(t)) * 0.9 * u : 0);
      const L = layer(F);
      // ---- the reared neck: ribbed, rising from the ground behind into the head
      const N0 = [ox - 7.5 * u, oy - r0 * 0.95], N1 = [ox - 3.5 * u + (a1 ? -1 * u : 0), oy - r0 * 1.0], N2 = [cx - 2.4 * u, cy + 0.8 * u];
      const Nk = layer(F);
      tube(Nk, bez([N0, N1, N2], 18), (q) => lerp(r0 * 0.85, hr * 0.92, q), Rd, { rings: Math.max(4, R(2.8 * u)), ringC: Rd[1], tex: 3, lift: 0.18 });
      wormBelly(Nk, N0[0] - r0, N2[0] + r0, Rl);
      put(L, Nk, true);
      // ---- head: a fat ribbed drum
      const H = layer(F);
      blob(H, [[cx, cy, hr, hr * 0.95]], Rd, { tex: 2 });
      wormRibs(H, cx, cy, hr, [-2.4 * u, 0.4 * u], Rd);
      wormBelly(H, cx - hr, cx + hr, Rl);
      put(L, H, true);
      put(F.p, L, false);
      // ---- the flower mouth
      const mx = cx + hr * 0.78, my = cy;
      if (a1 || a2) {
        // open: four petals peeled back in an X round the throat (cheated a quarter-turn toward us)
        const k = a2 ? 1.1 : 0.75, len = (a2 ? 7.6 : 5.4) * u, w = (a2 ? 4.2 : 3.4) * u;
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

  // Wandering Hand (colossus_shard): a hand broken off a fallen colossus, still walking. It goes on
  // its fingertips like a spider, the snapped wrist raised behind it shedding rubble. A hamsa eye
  // is carved into the back of the hand; one finger still wears the king's ruby ring. It leaps and
  // slams down palm-flat.
  wandering_hand: {
    view: 'side', box: [32, 24], pivot: 0.5, idleFps: 3, scale: 1.05,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle', a1 = P.atk === 1, a2 = P.atk === 2, hurt = P.hurt;
      const ST = pal5('clay', 4), STd = ST.map((c) => dark(c, 0.8)), IN = pal5('sand', 5), G = pal5('gold', 5);
      const NAIL = P5(['#8a6a52', '#b08a64', '#cfa978', '#e2c494', '#efdab4']);
      const hop = a1 ? -5.5 * u : a2 ? 4.2 * u : hurt ? -0.8 * u : run ? -Math.abs(sin(t * 2)) * 0.6 * u : 0;
      const tilt = a1 ? -0.12 : a2 ? 0.05 : hurt ? -0.18 : 0;
      const bx = ox - 1 * u + (a2 ? 1 * u : 0), by = oy - 11 * u + hop + (idle ? sin(t) * 0.2 * u : 0);
      const rp = (x, y) => { const [dx, dy] = rot(x * u, y * u, tilt); return [bx + dx, by + dy]; };
      const L = layer(F);
      // ---- fingers: knuckle, a high middle joint, the tip on the ground; far ones first
      const finger = (k) => {
        const far = k < 2, Rm = far ? STd : ST, Lg = layer(F);
        const kn = rp(3.6 + k * 0.7, 0.6 - (3 - k) * 0.45);
        let tip;
        if (a1) tip = [kn[0] + 1.5 * u, kn[1] + 4.2 * u];                                        // curled under in the leap
        else if (a2) tip = [kn[0] + 8.6 * u - k * 0.4 * u, oy - 0.8 * u];                           // splayed flat on the slam
        else {
          const ph = run ? t + [0, 0.5, 0.25, 0.75][k] : 0;
          const [dx, lift] = run ? stride(ph, 3.6 * u, 2 * u) : [0, 0];
          const tap = idle && (P.i === k % 4) ? 1.4 * u : 0;
          tip = [kn[0] + 4.6 * u + dx - k * 0.2 * u, oy - lift - tap];
        }
        const mid = a2 ? [lerp(kn[0], tip[0], 0.5), lerp(kn[1], tip[1], 0.5) - 0.6 * u] : ik(kn, tip, 4.6 * u, 5.4 * u, -1);
        tube(Lg, [kn, mid], [1.65 * u, 1.45 * u], Rm, { tex: 4 + k });
        tube(Lg, [mid, tip], [1.45 * u, 1.15 * u], Rm, { tex: 6 + k });
        // sandstone strata, knuckle creases, a chip off the joint, and a carved nail at the tip
        stripes(Lg, Math.min(kn[0], tip[0]) - 2 * u, Math.min(kn[1], mid[1]) - 2 * u, Math.max(kn[0], tip[0]) + 2 * u, tip[1] + 2 * u, 1.75 + tilt, Math.max(4, R(2.6 * u)), 1, Rm[1]);
        Lg.line(mid[0] - 0.6 * u, mid[1] - 0.4 * u, mid[0] + 0.4 * u, mid[1] + 0.6 * u, Rm[0]);
        if (k === 2) carve(Lg, mid[0] + 0.6 * u, mid[1] - 1.2 * u, 0.9 * u);
        const na = Math.atan2(tip[1] - mid[1], tip[0] - mid[0]);
        blob(Lg, [[tip[0] - Math.cos(na) * 0.9 * u - Math.sin(na) * 0.5 * u, tip[1] - Math.sin(na) * 0.9 * u + Math.cos(na) * 0.5 * u, 0.9 * u, 0.7 * u]], NAIL, { matte: true });
        // the ruby ring on the near index finger
        if (k === 3) {
          const rx = lerp(kn[0], mid[0], 0.55), ry = lerp(kn[1], mid[1], 0.55), a = Math.atan2(mid[1] - kn[1], mid[0] - kn[0]);
          for (let d = -1.6; d <= 1.6; d += 0.4) { const x = rx - Math.sin(a) * d * u, y = ry + Math.cos(a) * d * u; Lg.set(R(x), R(y), G[d < 0 ? 4 : 2]); Lg.set(R(x + Math.cos(a)), R(y + Math.sin(a)), G[1]); }
          const gx = rx - Math.sin(a) * 1.4 * u, gy = ry + Math.cos(a) * -1.4 * u;
          Lg.disc(gx, gy - 0.3 * u, 1.2 * u, '#8a3434'); Lg.disc(gx - 0.2 * u, gy - 0.5 * u, 0.7 * u, '#cc6a86'); Lg.set(R(gx - 0.5 * u), R(gy - 0.9 * u), WHITE);
        }
        put(L, Lg, !far);
      };
      finger(0); finger(1);
      // ---- the back of the hand and the broken wrist
      const B = layer(F);
      const w0 = rp(-5.5, -2.2), w1 = rp(-9.5, -6.2);
      tube(B, [w0, w1], [4 * u, 3.6 * u], ST, { tex: 2 });
      blob(B, [[...rp(-1, -0.6), 6.6 * u, 3.8 * u], [...rp(3.2, 0), 4.2 * u, 3.4 * u]], ST, { tex: 3 });
      // sandstone strata across the whole hand, chipped edges, a long crack
      stripes(B, bx - 14 * u, by - 12 * u, bx + 9 * u, by + 5 * u, 1.75 + tilt, Math.max(4, R(2.8 * u)), 1, ST[1]);
      for (let k = 0; k < 3; k++) { const a0 = rp(-4, -2.6 + k * 0.9), a3 = rp(3.4 + k * 0.5, -2.4 + k * 1.1); for (let f = 0; f <= 1; f += 0.08) over(B, lerp(a0[0], a3[0], f), lerp(a0[1], a3[1], f), ST[4]); }
      for (const [x, y, r] of [[-3, -4.2, 1.1], [1.5, -3.6, 0.9], [-7.5, -8.8, 1.2]]) { const c = rp(x, y); carve(B, c[0], c[1], r * u); }
      crack(B, ...rp(-6, -3), 0.35 + tilt, 6 * u, ST[0], 11);
      // the break: a rough face of paler inner stone, cracked, with rebar-like veins of old gold
      const bf = rp(-10.2, -7.0), bn = Math.atan2(w1[1] - w0[1], w1[0] - w0[0]);
      const brk = [];
      for (let k = 0; k < 14; k++) { const a = (k / 14) * TAU, rr = (3.6 + (k % 2 ? -0.9 : 0.2) + (k % 5 === 0 ? 0.5 : 0)) * u; brk.push([bf[0] + Math.cos(a) * rr * 0.62, bf[1] + Math.sin(a) * rr * 0.9]); }
      const Bk = layer(F);
      Bk.poly(brk, IN[2]); cyl(Bk, IN, { wide: true });
      for (let k = 0; k < 3; k++) crack(Bk, bf[0], bf[1], k * 2.1 + 0.3, 2.8 * u, IN[0], 20 + k);
      Bk.set(R(bf[0] - 0.5 * u), R(bf[1] - 0.8 * u), IN[4]);
      put(B, Bk, false);
      put(L, B, true);
      // the thumb, on the near side: a stubby leg of its own
      const Th = layer(F), tb = rp(0.4, 2.4);
      const ttip = a1 ? [tb[0] + 2 * u, tb[1] + 3 * u] : a2 ? [tb[0] - 2 * u, oy - 0.8 * u] : [tb[0] + 1.2 * u + (run ? sin(t + 0.3) * 1.4 * u : 0), oy - (run ? Math.max(0, sin(t + 0.3)) * 1.4 * u : 0)];
      const tm = ik(tb, ttip, 3.6 * u, 4.4 * u, 1);
      tube(Th, [tb, tm], [1.9 * u, 1.6 * u], ST, { tex: 9 });
      tube(Th, [tm, ttip], [1.6 * u, 1.3 * u], ST, { tex: 10 });
      blob(Th, [[ttip[0] - 0.8 * u, ttip[1] - 0.6 * u, 0.9 * u, 0.7 * u]], NAIL, { matte: true });
      finger(2); finger(3);
      put(L, Th, true);
      put(F.p, L, false);
      // ---- the hamsa eye carved into the back of the hand
      const [ex, ey] = rp(-1.2, -1.4);
      const E = layer(F), ew = 3.4 * u, eh = (hurt ? 0.4 : a1 ? 1.9 : idle && P.i === 3 ? 0.5 : 1.5) * u;
      const lid = (sg) => { const pts = []; for (let k = 0; k <= 12; k++) { const f = k / 12; pts.push([ex - ew + f * 2 * ew, ey + sg * Math.sin(f * Math.PI) * eh]); } return pts; };
      E.poly([...lid(-1), ...lid(1).reverse()], ST[0]);
      for (const sg of [-1, 1]) for (const [x, y] of lid(sg)) E.set(R(x), R(y + sg), sg < 0 ? ST[1] : ST[4]);
      // carved lashes / a dotted border like a talisman's
      for (let k = 1; k < 6; k++) { const f = k / 6, x = ex - ew * 1.25 + f * 2.5 * ew, y = ey - Math.sin(f * Math.PI) * (eh + 1.4 * u); over(E, x, y, ST[1]); }
      put(F.p, E, false);
      if (eh > 0.6 * u) eyeGlow(F, ex - 0.8 * u, ey - eh * 0.6, Math.max(2, 1.6 * u), Math.max(2, eh * 1.2), a2 ? HOT[4] : HOT[3], { pupil: true });
      else F.p.line(ex - ew * 0.8, ey, ex + ew * 0.8, ey, HOT[1]);
      if (hurt) { crack(F.p, ex + 1 * u, ey - 3 * u, 1.2, 6 * u, ST[0], 7); for (let k = 0; k < 3; k++) F.p.rect(R(ex - 3 * u - k * 1.5 * u), R(ey - 5 * u - (k % 2) * u), 2, 2, ST[3]); }
      // ---- rubble trickling from the break, and dust where it lands
      const drop = (idle || run) ? t : 0.5;
      for (let k = 0; k < 3; k++) { const f = (k / 3 + drop) % 1; F.p.rect(R(bf[0] - 0.5 * u + (k - 1) * 1.2 * u), R(bf[1] + 2.6 * u + f * (oy - bf[1] - 3 * u)), k === 1 ? 2 : 1, k === 1 ? 2 : 1, IN[k === 1 ? 2 : 3]); }
      if (a2) {
        const D = layer(F);
        for (const sg of [-1, 1]) for (let k = 0; k < 3; k++) puff(D, ox + sg * (8 + k * 3.4) * u + 2 * u, oy - (1.2 + (k % 2) * 1.2) * u, (1.8 - k * 0.3) * u, IN, k + (sg > 0 ? 4 : 0));
        put(F.p, D, false);
      }
      F.mouth = [ex, ey];
    },
  },

  // Fulgurite (glass_elemental): where lightning struck the dunes and fused the sand, the glass got
  // up and walked. A hovering figure of forked, crusted tubes of red glass, every fork a frozen bolt,
  // a white-hot crackling heart in its chest and glass shards circling it. Its head is a crown of
  // forks round a cracked node with one big eye and one small.
  fulgurite: {
    view: 'front', box: [32, 30], pivot: 0.5, idleFps: 5, hover: true,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle', a1 = P.atk === 1, a2 = P.atk === 2, hurt = P.hurt;
      const cx = ox + (run ? 1 * u : 0), cy = oy - 15 * u + (idle ? sin(t) * 0.4 * u : 0) + (a1 ? 0.8 * u : 0);
      const fl = idle ? P.i : run ? P.i + 2 : a2 ? 7 : a1 ? 5 : 9;     // which frame of crackle
      const L = layer(F);
      const veinA = HOT[2], veinB = HOT[3];
      // orbiting shards: the far ones behind the body, the near ones in front
      const orbit = (front) => {
        const n = 4, rr = (a2 ? 13.5 : a1 ? 6.5 : 11) * u, ry = (a2 ? 6 : 3) * u, sp = (idle ? t : run ? t * 1.5 : 0.1) * 0.25;
        for (let k = 0; k < n; k++) {
          const a = (k / n + sp) * TAU, z = Math.sin(a);
          if ((z >= 0) !== front) continue;
          const x = cx + Math.cos(a) * rr, y = cy + 1 * u + z * ry * 0.5 + (k % 2 ? -1.5 : 1) * u;
          shard(L, x, y, -1.2 + k * 0.9 + sp * 6, (front ? 3 : 2.2) * u, (front ? 1.0 : 0.8) * u, FULG);
        }
      };
      orbit(false);
      // ---- the lower body: one big frozen bolt zig-zagging down to a point, with two side forks
      const B = layer(F);
      const sw = run ? -0.8 * u : idle ? sin(t + 0.3) * 0.5 * u : 0;
      const main = [[cx, cy + 2 * u], [cx + 2.6 * u, cy + 5.6 * u], [cx - 1.4 * u + sw, cy + 8.4 * u], [cx + 1.6 * u + sw, cy + 11.4 * u], [cx - 0.2 * u + sw * 1.5, cy + 14 * u]];
      glassBolt(F, B, main, 2.4 * u, 0.4 * u, veinB);
      glassBolt(F, B, [main[1], [main[1][0] + 2.4 * u, main[1][1] + 2.4 * u], [main[1][0] + 2 * u, main[1][1] + 4.6 * u]], 1.0 * u, 0.3 * u, veinA, false);
      glassBolt(F, B, [main[2], [main[2][0] - 2.2 * u, main[2][1] + 1.6 * u], [main[2][0] - 2.4 * u, main[2][1] + 3.6 * u]], 0.9 * u, 0.3 * u, veinA, false);
      put(L, B, true);
      // ---- torso: a bloom of glass shards fanning up and out from the heart
      const T = layer(F);
      for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k - 2) * 0.42; shard(T, cx + (k - 2) * 0.6 * u, cy + 2.4 * u, a, (k === 2 ? 8.6 : k % 2 ? 7.4 : 6.2) * u, (k === 2 ? 2.4 : 2) * u, FULG); }
      for (const sg of [-1, 1]) shard(T, cx + sg * 1.2 * u, cy + 1 * u, Math.PI / 2 + sg * 0.45, 3.4 * u, 1.6 * u, FULG);
      put(L, T, true);
      // ---- arms: jagged bolts from tube-mouthed shoulders, forking into three prongs
      const arm = (sg) => {
        const A = layer(F);
        const sh = [cx + sg * 3.6 * u, cy - 4.4 * u];
        const reach = a1 ? [sg * 3.5, -4.5] : a2 ? [sg * 10, -6] : hurt ? [sg * 6, -1] : [sg * 7, 2.5 + (idle ? sin(t + (sg > 0 ? 0.5 : 0)) * 0.6 : 0)];
        const wr = [sh[0] + reach[0] * u, sh[1] + reach[1] * u + 2 * u];
        const el = [lerp(sh[0], wr[0], 0.5) - sg * 0.8 * u, lerp(sh[1], wr[1], 0.5) + 1.6 * u];
        glassBolt(F, A, [sh, el, wr], 1.6 * u, 1.0 * u, veinA);
        const base = Math.atan2(wr[1] - el[1], wr[0] - el[0]);
        for (let k = 0; k < 3; k++) glassBolt(F, A, zig(wr, base + (k - 1) * 0.6, (k === 1 ? 4.2 : 3.2) * u, 2, 60 + k + sg * 5, 0.5), 0.9 * u, 0.3 * u, k === 1 ? veinB : null, false);
        // the shoulder is the open mouth of a tube: a dark hollow with a lit lip
        A.disc(sh[0], sh[1] - 0.6 * u, 1.7 * u, FULG[4]); A.disc(sh[0] + 0.2 * u, sh[1] - 0.4 * u, 1.2 * u, FULG[0]);
        put(L, A, true);
        spark(F, sh[0] + 0.2 * u, sh[1] - 0.2 * u, HOT[2]);
      };
      arm(-1); arm(1);
      // ---- head: a faceted crystal node with a crown of three shards
      const H = layer(F), hx = cx + 0.4 * u + (hurt ? -1 * u : 0), hy = cy - 8.4 * u + (a1 ? 1 * u : 0);
      for (let k = 0; k < 3; k++) { if (hurt && k === 2) continue; shard(H, hx + (k - 1) * 1.8 * u, hy - 1.6 * u, -Math.PI / 2 + (k - 1) * 0.5, (k === 1 ? 6.4 : 4.4) * u, 1.3 * u, FULG); }
      slab(H, [[hx - 3 * u, hy - 1.2 * u], [hx - 0.6 * u, hy - 3 * u], [hx + 2.8 * u, hy - 1.6 * u], [hx + 2.4 * u, hy + 2 * u], [hx, hy + 3 * u], [hx - 2.6 * u, hy + 1.6 * u]], FULG, { wide: true });
      facet(H, [[hx - 2.6 * u, hy - 1.1 * u], [hx - 0.6 * u, hy - 2.6 * u], [hx - 0.2 * u, hy - 0.4 * u]], FULG[4]);
      facet(H, [[hx + 2.4 * u, hy + 1.8 * u], [hx, hy + 2.7 * u], [hx + 0.6 * u, hy + 0.6 * u]], FULG[1]);
      put(L, H, true);
      orbit(true);
      put(F.p, L, false);
      // the heart: white-hot, crackling, with arcs jumping off it
      const hr = (a1 ? 3.0 : a2 ? 2.8 : hurt ? 1.4 : 2.1 + (fl % 2) * 0.3) * u;
      glow(F, cx, cy, hr, hurt ? HOT[1] : HOT[3], { core: '#fff4dc', halo: a1 || a2 });
      const q = srand(fl * 17 + 3);
      for (let k = 0; k < (a1 || a2 ? 5 : 3); k++) {
        const a = q() * TAU, pts = zig([cx + Math.cos(a) * hr, cy + Math.sin(a) * hr], a, (2.5 + q() * 3) * u, 3, fl * 9 + k, 0.9);
        for (let j = 0; j < pts.length - 1; j++) { F.p.line(pts[j][0], pts[j][1], pts[j + 1][0], pts[j + 1][1], C(HOT[4])); F.e.line(pts[j][0], pts[j][1], pts[j + 1][0], pts[j + 1][1], C(HOT[4])); }
      }
      // eyes: one big, one small, unblinking ember; squeezed to slits on the hit
      if (hurt) { F.p.line(hx - 1.8 * u, hy, hx - 0.4 * u, hy + 0.4 * u, HOT[1]); F.p.line(hx + 0.6 * u, hy, hx + 1.6 * u, hy - 0.2 * u, HOT[1]); }
      else { eyeGlow(F, hx - 2 * u, hy - 0.8 * u, Math.max(2, 1.6 * u), Math.max(2, 1.4 * u), a2 ? HOT[4] : HOT[3]); eyeGlow(F, hx + 0.8 * u, hy - 0.2 * u, Math.max(1, 0.9 * u), Math.max(1, 0.9 * u), HOT[3]); }
      if (hurt) crack(F.p, hx + 1.5 * u, hy - 2.5 * u, 1.9, 5 * u, '#fff4dc', 4);
      F.mouth = [cx, cy];
    },
  },

  // Sun-Eaten Pilgrim (sunmad_pilgrim): a pilgrim who stared at the sun until it took his head. A
  // hunched linen robe singed black at the hem, bandaged feet, a staff hung with prayer bells, and
  // where the head should be a blazing brass sun disk with a blissful carved face lit from inside.
  sun_pilgrim: {
    view: 'side', box: [30, 31], pivot: 0.45, idleFps: 4,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle', a1 = P.atk === 1, a2 = P.atk === 2, hurt = P.hurt;
      const LIN = P5(['#674952', '#9c615b', '#cfa978', '#e2c494', '#efdab4']), LINd = LIN.map((c) => dark(c, 0.82));
      const G = pal5('gold', 5), WOOD = pal5('wood', 5), WRAP = P5(['#8a6a52', '#b08a64', '#cfa978', '#e2c494', '#f6e9cc']);
      const step = run ? sin(t) : 0, bob = run ? -Math.abs(sin(t)) * 0.7 * u : idle ? sin(t) * 0.3 * u : 0;
      const lean = a1 ? -1.2 * u : a2 ? 1.6 * u : hurt ? -1.4 * u : 0.4 * u;
      const bx = ox + lean * 0.3, sy = oy - 14.5 * u + bob + (a2 ? 0.8 * u : 0);
      const L = layer(F);
      // ---- far arm and the rosary hanging from it
      const far = layer(F);
      const fsh = [bx - 1 * u + lean, sy + 1.4 * u], fh = [bx - 2.6 * u + lean * 0.4 + (run ? -step * 1.4 * u : 0), sy + 7 * u];
      tube(far, [fsh, fh], [1.8 * u, 1.4 * u], LINd);
      blob(far, [[fh[0], fh[1] + 0.8 * u, 0.9 * u, 0.9 * u]], P5(['#3b1e22', '#60323a', '#8a5048', '#b07062', '#d9967e']));
      for (let k = 0; k < 4; k++) far.set(R(fh[0] + 0.4 * u), R(fh[1] + 2 * u + k * 1.1 * u), k === 3 ? G[4] : WOOD[2]);
      put(L, far, false);
      // ---- feet: bandaged, peeking under the hem
      for (const [sg, ph] of [[-1, 0.5], [1, 0]]) {
        const [dx, lift] = run ? stride(t + ph, 4 * u, 1.4 * u) : [sg * 1.2 * u, 0];
        const fx = bx + dx + 0.6 * u, fy = oy - lift;
        blob(L, [[fx, fy - 0.8 * u, 1.5 * u, 0.9 * u]], WRAP, { matte: true });
        L.line(fx - 0.8 * u, fy - 1.2 * u, fx + 0.4 * u, fy - 0.4 * u, WRAP[1]);
      }
      // ---- robe: a long linen shift, hunched forward, the hem singed and smouldering
      const Rb = layer(F);
      drape(Rb, bx + lean * 0.5, sy, 6 * u, 11 * u, oy - sy - 1.4 * u, LIN, { folds: 3, lean: run ? 1.2 * u : lean * -0.5, wave: 0.8 * u, phase: t, teeth: 5, ragged: true, seed: 3 });
      blob(Rb, [[bx + lean + 0.4 * u, sy + 0.6 * u, 4.2 * u, 3.4 * u]], LIN, { tex: 5 });   // the hunched shoulders
      // rope belt
      for (let x = R(bx - 4 * u); x <= bx + 4.6 * u; x++) { over(Rb, x, R(sy + 5.6 * u + (x - bx) * 0.08), WOOD[3]); over(Rb, x, R(sy + 5.6 * u + (x - bx) * 0.08) + 1, WOOD[1]); }
      Rb.line(bx + 2 * u, sy + 6 * u, bx + 2.6 * u, sy + 9.4 * u, WOOD[3]);
      // singed hem: a charred band, black at the edge, with embers living in it
      for (let x = 0; x < Rb.w; x++) {
        let y1 = -1; for (let y = Rb.h - 1; y >= 0; y--) if (Rb.a(x, y)) { y1 = y; break; }
        if (y1 < 0 || y1 < sy + 6 * u) continue;
        const d = 1 + R((hash2(x >> 1, 3, 7) * 1.6 + 0.8) * u * 0.8);
        for (let k = 0; k < d; k++) Rb.set(x, y1 - k, k === 0 ? MAROON[0] : k === 1 ? MAROON[1] : RUST[1]);
      }
      put(L, Rb, true);
      put(F.p, L, false);
      for (let k = 0; k < 4; k++) { const x = bx - 4 * u + k * 2.6 * u + (P.i % 2) * u, y = oy - 1.6 * u - (k % 2) * 0.6 * u; spark(F, x, y, k % 2 ? HOT[1] : HOT[2]); }
      if (!hurt && (idle || run)) spark(F, bx - 3 * u - t * 2 * u, oy - 3 * u - t * 3 * u, HOT[2]);
      // ---- the staff with its bells, in the near hand (behind the disk when raised overhead)
      const hand = a1 ? [bx + 6.4 * u, sy - 1.4 * u] : a2 ? [bx + 8 * u, sy + 2 * u] : [bx + 7.2 * u + (run ? step * 0.8 * u : 0), sy + 3.6 * u];
      const sa = a1 ? -2.2 : a2 ? -0.3 : -1.42 + (run ? step * 0.08 : 0);        // staff angle (up = -PI/2)
      const sTop = [hand[0] + Math.cos(sa) * 15 * u, hand[1] + Math.sin(sa) * 15 * u], sBot = [hand[0] - Math.cos(sa) * 6.6 * u, hand[1] - Math.sin(sa) * 6.6 * u];
      const drawStaff = () => {
      const Sf = layer(F);
      tube(Sf, [sBot, sTop], 0.6 * u, WOOD);
      // the crook: a hooked head of brass
      const ca = sa + 1.6, hk = [sTop[0] + Math.cos(sa) * 1.6 * u + Math.cos(ca) * 2.4 * u, sTop[1] + Math.sin(sa) * 1.6 * u + Math.sin(ca) * 2.4 * u];
      tube(Sf, bez([sTop, [sTop[0] + Math.cos(sa) * 3 * u, sTop[1] + Math.sin(sa) * 3 * u], hk], 10), 0.55 * u, G);
      put(F.p, Sf, true);
      // bells on cords, swinging behind the motion
      const swing = a1 ? 0.8 : a2 ? -0.9 : hurt ? 0.6 : (run ? sin(t + 0.25) * 0.5 : sin(t) * 0.25);
      const Bl = layer(F);
      for (let k = 0; k < 3; k++) {
        const an = [lerp(sTop[0], hk[0], k / 2.2), lerp(sTop[1], hk[1], k / 2.2) + 0.4 * u];
        const cl = (1.4 + k * 0.6) * u, bp = [an[0] + Math.sin(swing) * cl, an[1] + Math.cos(swing) * cl];
        Bl.line(an[0], an[1], bp[0], bp[1], WOOD[1]);
        blob(Bl, [[bp[0], bp[1] + 0.9 * u, 1.0 * u, 1.1 * u]], G, { clipY: R(bp[1] + 1.6 * u) });
        Bl.rect(R(bp[0] - 1.1 * u), R(bp[1] + 1.6 * u), Math.max(2, R(2.2 * u)), 1, G[1]);
        Bl.set(R(bp[0]), R(bp[1] + 2.2 * u), G[0]);
      }
      put(F.p, Bl, true);
      };
      if (a1) drawStaff();
      // ---- the sun disk: rays (the long ones burning), a brass face lit from within
      const hx = bx + 2 * u + lean * 1.2, hy = sy - 4.8 * u + (hurt ? -0.4 * u : 0), hr = 4.4 * u;
      const tiltA = hurt ? -0.35 : a1 ? -0.2 : a2 ? 0.2 : 0;
      const Rays = layer(F);
      for (let k = 0; k < 12; k++) {
        const a = k / 12 * TAU + tiltA + (idle ? t * 0.08 : 0), long = k % 2 === 0, rl = (long ? 7.8 : 6 ) * u;
        Rays.poly([[hx + Math.cos(a - 0.2) * hr * 0.9, hy + Math.sin(a - 0.2) * hr * 0.9], [hx + Math.cos(a) * rl, hy + Math.sin(a) * rl], [hx + Math.cos(a + 0.2) * hr * 0.9, hy + Math.sin(a + 0.2) * hr * 0.9]], G[long ? 3 : 2]);
      }
      cyl(Rays, G);
      put(F.p, Rays, true);
      // flames licking off the long upper rays
      // a corona of fire licking up off the top of the disk
      if (!hurt) for (let k = -1; k <= 1; k++) flame(F, hx + k * 2.4 * u, hy - hr * (k ? 0.85 : 1.0), (a1 || a2 ? 4.4 : 2.0 + ((k + 1 + P.i) % 3) * 0.6) * u, (k ? 1.6 : 2.2) * u, t + k * 0.3);
      const D = layer(F);
      blob(D, [[hx, hy, hr, hr]], G);
      D.ring(hx, hy, hr - 0.4 * u, G[1], Math.max(1, R(0.5 * u)));
      put(F.p, D, true);
      // the carved face: blissful upturned-arc eyes and a wide smile, all cut through to the fire inside
      const fc = a2 ? HOT[2] : hurt ? HOT[0] : HOT[1];
      const cut = (pts) => { for (const [x, y] of pts) { F.p.set(R(x), R(y), fc); F.e.set(R(x), R(y), fc); } };
      if (hurt) {
        for (const sg of [-1, 1]) cut(bez([[hx + sg * 2.2 * u - 0.6 * u, hy - 1.4 * u], [hx + sg * 1.4 * u, hy - 0.6 * u], [hx + sg * 0.8 * u - 0.2 * u, hy - 1.4 * u]], 8));
        F.p.ellipse(hx, hy + 1.6 * u, 0.9 * u, 1.1 * u, fc); F.e.ellipse(hx, hy + 1.6 * u, 0.9 * u, 1.1 * u, fc);
      } else {
        for (const sg of [-1, 1]) cut(bez([[hx + sg * 0.7 * u - 0.4 * u, hy - 0.6 * u], [hx + sg * 1.4 * u - 0.4 * u, hy - 1.8 * u], [hx + sg * 2.2 * u - 0.4 * u, hy - 0.6 * u]], 10));
        const op = a1 || a2 ? 0.9 * u : 0;
        cut(bez([[hx - 2 * u, hy + 1 * u], [hx, hy + 2.8 * u + op], [hx + 2 * u, hy + 1 * u]], 16));
        if (op) { F.p.ellipse(hx, hy + 2 * u, 1.1 * u, op * 0.8, fc); F.e.ellipse(hx, hy + 2 * u, 1.1 * u, op * 0.8, fc); }
        // cheeks: two little rays of heat
        for (const sg of [-1, 1]) { F.p.set(R(hx + sg * 2.8 * u), R(hy + 0.8 * u), G[4]); }
      }
      F.p.set(R(hx - hr * 0.5), R(hy - hr * 0.55), WHITE);
      if (!a1) drawStaff();
      // near arm: a sleeve reaching to the staff
      const NA = layer(F), nsh = [bx + 1.6 * u + lean, sy + 1 * u];
      const nel = ik(nsh, hand, 3.6 * u, 3.8 * u, a1 ? -1 : 1);
      tube(NA, [nsh, nel], [2 * u, 1.7 * u], LIN);
      tube(NA, [nel, hand], [1.7 * u, 1.9 * u], LIN);
      blob(NA, [[hand[0], hand[1], 1.0 * u, 1.0 * u]], P5(['#3b1e22', '#60323a', '#8a5048', '#b07062', '#d9967e']));
      put(F.p, NA, true);
      F.mouth = [hx + hr, hy];
    },
  },

  // Kettle Drake (drakeling): a hearth spirit grown into a drake. Its pot-belly is a cracked clay
  // kettle with the fire showing through the cracks, a lid on its back that rattles, stubby wings,
  // a teapot spout for a tail that whistles steam, and puffs of steam from its nostrils.
  kettle_drake: {
    view: 'side', box: [26, 20], pivot: 0.5, idleFps: 5, scale: 1.95,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle', a1 = P.atk === 1, a2 = P.atk === 2, hurt = P.hurt;
      const SC = P5(['#1d0814', '#2a1420', '#3e1c2c', '#55323d', '#7b576f']), SCd = SC.map((c) => dark(c, 0.82));
      const POT = P5(['#3e1c22', '#662b2c', '#8a4238', '#b04a3e', '#d9765a']), LID = P5(['#2a0e18', '#3e1c22', '#662b2c', '#8a4238', '#9c615b']);
      const G = pal5('gold', 5), STEAM = P5(['#7b576f', '#996f76', '#cc949e', '#e2c494', '#f6e9cc']);
      const bob = run ? -Math.abs(sin(t)) * 0.6 * u : idle ? sin(t) * 0.2 * u : 0;
      const bx = ox + (a1 ? -0.8 * u : a2 ? 0.8 * u : hurt ? -0.6 * u : 0), by = oy - 6.6 * u + bob;
      const kr = 5.6 * u;
      const L = layer(F);
      const flap = run ? sin(t * 2) * 0.35 : idle ? sin(t) * 0.12 : a1 ? -0.4 : a2 ? 0.25 : 0.3;
      // far wing: a stub of a bat wing behind the lid
      wing(L, bx - 1 * u, by - kr * 0.7, -2.2 + flap, 6 * u, 1.0, SCd, 'bat', { n: 3, claw: false });
      // legs: short, clawed
      const leg = (dx0, ph, far) => {
        const Lg = layer(F), Rm = far ? SCd : SC;
        const hip = [bx + dx0, by + kr * 0.5];
        const [dx, lift] = run ? stride(t + ph, 2.6 * u, 1.2 * u) : [0, 0];
        const foot = [hip[0] + dx + 0.4 * u, oy - lift];
        tube(Lg, [hip, foot], [1.7 * u, 1.3 * u], Rm);
        blob(Lg, [[foot[0] + 0.5 * u, foot[1] - 0.6 * u, 1.5 * u, 0.7 * u]], Rm);
        for (let k = 0; k < 2; k++) Lg.set(R(foot[0] + 1.4 * u), R(foot[1] - 0.2 * u - k * 0.5 * u), BONEP[4]);
        put(L, Lg, !far);
      };
      leg(3.2 * u, 0.5, true); leg(-2.4 * u, 0, true);
      // the spout tail: a tapering clay spout from the back of the kettle, with a flared lip
      const Sp = layer(F), sw = idle ? sin(t + 0.3) * 0.4 * u : run ? sin(t) * 0.6 * u : 0;
      const s0 = [bx - kr * 0.75, by + 1.2 * u], s1 = [bx - kr - 2.6 * u, by + 1 * u + sw], s2 = [bx - kr - 3.6 * u, by - 3.4 * u + sw];
      tube(Sp, bez([s0, s1, s2], 14), (q) => lerp(2.1, 0.9, q) * u, POT);
      tube(Sp, [[s2[0] + 0.3 * u, s2[1] + 0.6 * u], [s2[0] - 0.5 * u, s2[1] - 0.7 * u]], [1.0 * u, 1.3 * u], POT);
      Sp.disc(s2[0] - 0.5 * u, s2[1] - 0.8 * u, 0.6 * u, MAW_D);
      put(L, Sp, true);
      // the kettle: a round terracotta belly with a cream glaze band, a ring of painted dots
      const K = layer(F);
      blob(K, [[bx, by, kr, kr * 0.9]], POT, { tex: 2 });
      for (let x = R(bx - kr); x <= bx + kr; x++) for (let w = 0; w < Math.max(2, R(1.2 * u)); w++) { const y = R(by - 2 * u + w + Math.cos((x - bx) / kr * 1.4) * 0.6 * u); if (K.a(x, y)) K.set(x, y, w === 0 ? '#efdab4' : '#cfa978'); }
      for (let k = 0; k < 4; k++) over(K, bx - kr * 0.6 + k * kr * 0.4, by + 0.4 * u, POT[1]);
      // the drake's scaly back sits over the top of the kettle like a cosy
      for (let x = R(bx - kr); x <= bx + kr; x++) { let y0 = -1; for (let y = 0; y < K.h; y++) if (K.a(x, y)) { y0 = y; break; } if (y0 < 0) continue; const d = R((1.6 + Math.sin(x * 0.9) * 0.4) * u); for (let k = 0; k < d; k++) K.set(x, y0 + k, k === 0 ? SC[4] : k < 2 ? SC[3] : SC[2]); }
      put(L, K, true);
      put(F.p, L, false);
      // the fire inside showing through the cracks (brighter as it winds up)
      const cc = hurt ? HOT[1] : a1 ? HOT[4] : HOT[3];
      crack(F.p, bx + 1.6 * u, by + 1.6 * u, 1.9, kr * 0.6, cc, 5, F.e);
      crack(F.p, bx - 2 * u, by + 2 * u, 2.4, kr * 0.5, cc, 9, F.e);
      if (a1) crack(F.p, bx + 3 * u, by + 0.8 * u, 0.9, kr * 0.5, cc, 3, F.e);
      // the lid on its back, rattling; steam escaping under it
      const lift = a1 ? 2.2 * u : hurt ? 3 * u : idle && P.i % 2 ? 0.7 * u : run && P.i % 2 ? 0.5 * u : 0;
      const Ld = layer(F), ly = by - kr * 0.86 - lift, lt = hurt ? -0.4 : a1 ? 0.25 : idle && P.i === 1 ? 0.12 : 0;
      const [ldx, ldy] = rot(3.2 * u, 0, lt);
      slab(Ld, [[bx - ldx, ly - ldy], [bx + ldx, ly + ldy], [bx + ldx * 0.55 - ldy * 0.3, ly + ldy * 0.55 - 1.4 * u], [bx - ldx * 0.55, ly - ldy * 0.55 - 1.4 * u]], LID, { wide: true });
      blob(Ld, [[bx + ldy * 0.4, ly - 2.1 * u, 1.0 * u, 0.9 * u]], G);
      put(F.p, Ld, true);
      const St = layer(F), dr = (idle || run) ? t : 0.5, big = a1 || a2;
      if (lift > 0) for (let k = 0; k < 2; k++) puff(St, bx + (k ? 3 : -2.8) * u, ly + 0.4 * u - k * 1.2 * u, (0.7 + k * 0.2) * u, STEAM, k + 3);
      for (let k = 0; k < (big ? 3 : 2); k++) { const f = (k / (big ? 3 : 2) + dr) % 1; puff(St, s2[0] - 0.6 * u - f * 2 * u, s2[1] - 1.6 * u - f * (big ? 5 : 3.5) * u, (0.6 + f * (big ? 1.1 : 0.7)) * u, STEAM, k + 1); }
      put(F.p, St, false);
      // near legs and a near wing stub at the back
      const L2 = layer(F);
      leg(-1.4 * u, 0.5, false); leg(4.2 * u, 0, false);
      wing(L2, bx - 2.6 * u, by - kr * 0.55, -2.55 + flap, 5 * u, 1.0, SC, 'bat', { n: 3, claw: false });
      // head: big, round, on a short neck at the front of the pot; nubbly cream horns
      const hx = bx + kr + 1.4 * u + (a2 ? 1.4 * u : a1 ? -0.8 * u : 0), hy = by - kr * 0.72 + (a1 ? -0.8 * u : a2 ? 0.6 * u : hurt ? -0.6 * u : 0) + (run ? sin(t + 0.2) * 0.4 * u : 0);
      const H = layer(F);
      tube(H, [[bx + kr * 0.6, by - kr * 0.3], [hx - 1.2 * u, hy + 0.8 * u]], [2.6 * u, 2.2 * u], SC);
      horn(H, [hx - 1.8 * u, hy - 1.6 * u], [hx - 3 * u, hy - 3 * u], [hx - 4.2 * u, hy - 2.8 * u], 1.3 * u, BONEP);
      blob(H, [[hx, hy, 3.0 * u, 2.7 * u], [hx + 2.6 * u, hy + 0.8 * u, 2.0 * u, 1.5 * u]], SC);
      horn(H, [hx - 0.6 * u, hy - 2.1 * u], [hx - 0.8 * u, hy - 3.9 * u], [hx - 2.4 * u, hy - 4.6 * u], 1.5 * u, BONEP);
      // a terracotta chin and throat: the kettle glaze creeping up the neck
      for (let x = R(hx - 2 * u); x <= hx + 4 * u; x++) { let y1 = -1; for (let y = H.h - 1; y >= 0; y--) if (H.a(x, y)) { y1 = y; break; } if (y1 > 0) { H.set(x, y1, POT[2]); H.set(x, y1 - 1, POT[3]); } }
      const op = a2 ? 0.75 : a1 ? 0.25 : hurt ? 0.3 : 0;
      if (op > 0) {
        const jt = [hx + 3.4 * u, hy + 1.9 * u + op * 3 * u];
        facet(H, [[hx + 0.4 * u, hy + 0.9 * u], [hx + 4.4 * u, hy + 0.9 * u], jt, [hx + 0.2 * u, hy + 1.8 * u]], MAW_D);
        tube(H, [[hx + 0.2 * u, hy + 1.5 * u], jt], [1 * u, 0.7 * u], SC);
      }
      put(L2, H, true);
      put(F.p, L2, false);
      F.p.set(R(hx + 4.2 * u), R(hy + 0.2 * u), MAW_D);
      if (hurt) { F.p.line(hx - 0.4 * u, hy - 0.8 * u, hx + 1.2 * u, hy - 0.3 * u, VOID); }
      else eyeGlow(F, hx - 0.2 * u, hy - 1.4 * u, Math.max(2, 1.6 * u), Math.max(2, 1.5 * u), a1 || a2 ? HOT[4] : HOT[3], { pupil: true });
      if (a2) breath(F, hx + 4.4 * u, hy + 1.9 * u, 10 * u, 2.6 * u, 0.3);
      else if (!hurt) { const f = (idle ? t : 0.3); for (let k = 0; k < 2; k++) F.p.rect(R(hx + 4.8 * u + f * 2 * u + k * u), R(hy - 0.6 * u - f * 2 * u - k * u), 2 - k, 2 - k, STEAM[4 - k]); }
      F.mouth = [hx + 4.4 * u, hy + 1.9 * u];
    },
  },

  // Bone Vulture (carrion_vulture): a sky-burial vulture that wears the bleached skull of an ox as
  // a mask, one horn snapped off. Ragged black-brown wings, a bare red neck in a pale ruff, and a
  // necklace of vertebrae strung on sinew. Red eyes burn in the skull's sockets.
  bone_vulture: {
    view: 'side', box: [34, 26], pivot: 0.5, idleFps: 6, flap: 12, idle: 4, run: 4,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const t = P.t, a1 = P.atk === 1, a2 = P.atk === 2, hurt = P.hurt;
      const FE = P5(['#1d0814', '#2a1420', '#3f2622', '#5a3628', '#77492f']), FEd = FE.map((c) => dark(c, 0.8));
      const SKIN = P5(['#4a1a30', '#7a2f4a', '#a94a68', '#cc6a86', '#e48fb0']), RUFF = P5(['#8a6a52', '#b08a64', '#cfa978', '#e2c494', '#efdab4']);
      const BN = P5(['#8a6a52', '#b08a64', '#cfa978', '#e2c494', '#f6e9cc']);
      // the flap: wings sweep from high up to low behind; the body rises on the downstroke
      const ph = a1 ? 0 : a2 ? 0.62 : hurt ? 0.3 : t;
      const down = 0.5 - 0.5 * Math.cos(ph * TAU);
      const wa = a1 ? -1.55 : a2 ? -2.95 : -1.75 - down * 1.9;
      const bx = ox - 1 * u + (a2 ? 2 * u : a1 ? -1.2 * u : hurt ? -1.4 * u : 0), by = oy - 12 * u + down * -1.2 * u + (a1 ? -1.2 * u : a2 ? 1.6 * u : 0);
      const tiltB = a2 ? 0.35 : a1 ? -0.2 : hurt ? -0.3 : 0.1;
      const bp = (x, y) => { const [dx, dy] = rot(x * u, y * u, tiltB); return [bx + dx, by + dy]; };
      const L = layer(F);
      // far wing
      const ragged = (W) => { for (let k = 0; k < 3; k++) { const a = wa + 0.5 + k * 0.4, r = 13 * u; carve(W, bx + Math.cos(a) * r, by - 2 * u + Math.sin(a) * r, 1.2 * u); } };
      const Wf = layer(F);
      wing(Wf, ...bp(0.6, -2.2), wa + 0.2, 15 * u, 1.35, FEd, 'feather', { n: 7 });
      ragged(Wf);
      put(L, Wf, false);
      // talons: hanging, raised forward on the wind-up, thrust out on the strike
      const legs = (far) => {
        const Lg = layer(F), Rm = far ? SKIN.map((c) => dark(c, 0.8)) : P5(['#3e1c2c', '#55323d', '#674952', '#7b576f', '#996f76']);
        const hip = bp(far ? 0.6 : -0.4, 2.8);
        const foot = a2 ? [hip[0] + 6 * u, hip[1] + 3 * u] : a1 ? [hip[0] + 3.4 * u, hip[1] + 2.4 * u] : [hip[0] - 2.4 * u + (far ? 0.8 * u : 0), hip[1] + 2.6 * u - down * 0.5 * u];
        tube(Lg, [hip, foot], [1.0 * u, 0.6 * u], Rm);
        for (let k = 0; k < 3; k++) { const a = (a2 ? 0.2 : 1.2) + (k - 1) * 0.6; horn(Lg, foot, [foot[0] + Math.cos(a) * 1.2 * u, foot[1] + Math.sin(a) * 1.2 * u], [foot[0] + Math.cos(a + 0.6) * 2 * u, foot[1] + Math.sin(a + 0.6) * 2 * u], 0.7 * u, BN); }
        put(L, Lg, !far);
      };
      legs(true);
      // tail fan
      const Tl = layer(F);
      for (let k = 0; k < 4; k++) { const a = Math.PI - 0.2 + (k - 1.5) * 0.18 + tiltB; tube(Tl, [bp(-4.5, 0.6), [bp(-4.5, 0.6)[0] + Math.cos(a) * 5 * u, bp(-4.5, 0.6)[1] + Math.sin(a) * 5 * u]], [1.1 * u, 0.6 * u], k % 2 ? FE : FEd, { matte: true }); }
      put(L, Tl, true);
      // body: a hunched dark sack of feathers
      const B = layer(F);
      blob(B, [[...bp(0, 0.2), 5.2 * u, 3.8 * u], [...bp(-3, 0.8), 3.4 * u, 2.6 * u]], FE, { fur: 4 });
      put(L, B, true);
      legs(false);
      // the bare red neck rising out of a pale ruff
      const hx = bx + 6.8 * u + (a2 ? 2.4 * u : a1 ? -0.6 * u : 0), hy = by - 4.6 * u + (a1 ? -1.6 * u : a2 ? 2.4 * u : hurt ? -1 * u : 0);
      const N = layer(F);
      tube(N, bez([bp(3.2, -1.4), [bx + 6 * u, by - 1 * u], [hx - 1 * u, hy + 1.2 * u]], 10), [1.4 * u, 1.0 * u], SKIN);
      put(L, N, true);
      const Rf = layer(F);
      for (let k = 0; k < 6; k++) { const a = -1.9 + k * 0.5; const c = bp(3.6, -0.8); blob(Rf, [[c[0] + Math.cos(a) * 1.6 * u, c[1] + Math.sin(a) * 1.2 * u, 1.3 * u, 1.0 * u]], RUFF, { matte: true }); }
      put(L, Rf, true);
      // vertebrae necklace: a sagging string of little bone knuckles across the ruff
      const nk0 = bp(2.2, -1.6), nk1 = bp(5.6, -0.6);
      for (let k = 0; k <= 4; k++) { const f = k / 4, x = lerp(nk0[0], nk1[0], f), y = lerp(nk0[1], nk1[1], f) + Math.sin(f * Math.PI) * 2.6 * u, w = Math.max(2, R(1.3 * u)); L.rect(R(x - w / 2), R(y - 1), w, Math.max(2, R(1.1 * u)), BN[3]); L.set(R(x - w / 2), R(y - 1), BN[4]); L.set(R(x - w / 2) + w - 1, R(y - 1) + 1, BN[1]); if (k < 4) L.set(R(x + w / 2) + 1, R(y), MAROON[2]); }
      // ---- the ox-skull mask: long face, wide brow, one horn whole and one snapped short
      const S = layer(F), ha = hurt ? -0.35 : a2 ? 0.3 : 0;
      const sp = (x, y) => { const [dx, dy] = rot(x * u, y * u, ha); return [hx + dx, hy + dy]; };
      horn(S, sp(-0.4, -1.8), sp(-1.4, -4.6), sp(-4.6, -5.2), 1.6 * u, BN);     // far horn, whole, sweeping back
      // the hooked beak under the skull's snout
      horn(S, sp(3.6, 0.8), sp(5.4, 1.0), sp(5.2, 2.8), 1.5 * u, P5(['#2a1420', '#3e1c2c', '#55323d', '#674952', '#7b576f']));
      slab(S, [sp(-1.6, -2.2), sp(1.6, -2.4), sp(4.6, -0.4), sp(4.8, 1.0), sp(3.0, 1.6), sp(0.2, 1.4), sp(-1.8, 0.2)], BN, { wide: true });
      // eye socket, nasal cavity, cheek seam
      const so = sp(0.6, -0.8);
      S.ellipse(so[0], so[1], 1.3 * u, 1.0 * u, VOID);
      const nc = sp(3.6, 0.1); S.ellipse(nc[0], nc[1], 0.5 * u, 0.4 * u, BN[0]);
      const c0 = sp(1.6, 0.6), c1 = sp(3.4, 1.2); S.line(c0[0], c0[1], c1[0], c1[1], BN[1]);
      // near horn: snapped off short with a jagged end
      horn(S, sp(0.2, -2.0), sp(-0.6, -3.4), sp(-1.4, -3.6), 1.7 * u, BN, { pow: 0.4 });
      const hb = sp(-1.3, -3.6); S.set(R(hb[0]), R(hb[1]), BN[1]); S.set(R(hb[0]) + 1, R(hb[1]) + 1, BN[0]);
      if (hurt) crack(S, ...sp(1.4, -2.2), 1.4, 3.4 * u, BN[0], 6);
      put(L, S, true);
      // near wing
      const Wn = layer(F);
      wing(Wn, ...bp(-0.4, -2.4), wa, 16.5 * u, 1.35, FE, 'feather', { n: 8 });
      ragged(Wn);
      put(L, Wn, true);
      put(F.p, L, false);
      // eyes: an ember-red coal deep in the socket
      if (hurt) F.p.line(so[0] - 0.8 * u, so[1], so[0] + 0.6 * u, so[1] + 0.3 * u, '#c2401c');
      else eyeGlow(F, so[0] - 0.6 * u, so[1] - 0.5 * u, Math.max(2, 1.3 * u), Math.max(2, 1.1 * u), a2 ? HOT[3] : HOT[2]);
      // loose feathers knocked out by the hit
      if (hurt) for (let k = 0; k < 3; k++) { const x = bx - (2 + k * 2.6) * u, y = by - (4 + k * 1.6) * u; F.p.line(x, y, x + 1.4 * u, y + 0.6 * u, FE[3]); F.p.set(R(x), R(y), FE[4]); }
      F.mouth = sp(5, 2);
    },
  },

  // The Scorpion Queen (scorpion_queen): a brood-mother scorpion who carries her court on her back.
  // A gilded palanquin heaped with glowing eggs rides on her carapace, and her twin tails arch up
  // to be its canopy poles: the rose silk canopy hangs from her two stings. Her head-plate is a
  // jewelled crown. The eggs pulse; the canopy sways; when she strikes, both stings stab forward
  // and the canopy whips with them.
  scorpion_queen: {
    view: 'side', box: [52, 38], pivot: 0.5, idle: 6, idleFps: 5, scale: 0.85,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle', a1 = P.atk === 1, a2 = P.atk === 2, hurt = P.hurt;
      const SH = P5(['#1d0814', '#2a0e18', '#4a1420', '#60282c', '#8a3434']), SHd = SH.map((c) => dark(c, 0.78)), RIM = RUST;
      const LEG = P5(['#1d0814', '#2a0e18', '#3e1c22', '#55323d', '#7b576f']), LEGd = LEG.map((c) => dark(c, 0.8));
      const G = pal5('gold', 5), Gd = pal5('gold', 4), SILK = pal5('rose', 4), SILKd = pal5('rose', 3);
      const LAC = P5(['#2a0e18', '#4a1420', '#60282c', '#8a3434', '#b04a3e']);
      const bx = ox - 1 * u + (a1 ? -1.2 * u : a2 ? 1.6 * u : hurt ? -1 * u : 0), by = oy - 8.6 * u + (idle ? sin(t) * 0.25 * u : 0) + (a1 ? 0.6 * u : 0) + (run ? -Math.abs(sin(t * 2)) * 0.4 * u : 0);
      const L = layer(F);
      // ---- legs: four a side, knees high
      const legs = (far) => {
        const Lg = layer(F), Rl = far ? LEGd : LEG;
        for (let k = 0; k < 4; k++) {
          const hip = [bx + (k - 1.5) * 3.6 * u + (far ? 1.2 * u : 0), by + (far ? -0.6 : 2.2) * u];
          const ph = run ? t + (k % 2 ? 0.5 : 0) + (far ? 0.25 : 0) : 0;
          const [dx, lift] = run ? stride(ph, 3.6 * u, 1.8 * u) : [idle ? sin(t + k * 0.3) * 0.3 * u : 0, 0];
          const foot = [hip[0] + (k - 1.5) * 5.4 * u + dx + (k < 2 ? -1 : 1) * 1.2 * u, oy - lift - (far ? 0.6 * u : 0)];
          const knee = [lerp(hip[0], foot[0], 0.55), hip[1] - (far ? 4.2 : 2.4) * u - lift * 0.4];
          tube(Lg, [hip, knee], [1.2 * u, 1.0 * u], Rl, { rings: R(2.4 * u), ringC: Rl[0] });
          tube(Lg, [knee, foot], [1.0 * u, 0.4 * u], Rl);
          Lg.set(R(knee[0]), R(knee[1] - 0.8 * u), Rl[4]);
          // a gold anklet on the near legs
          if (!far) { const ax = lerp(knee[0], foot[0], 0.55), ay = lerp(knee[1], foot[1], 0.55); Lg.rect(R(ax - 0.8 * u), R(ay), R(1.6 * u), Math.max(1, R(0.5 * u)), G[3]); }
        }
        put(L, Lg, !far);
      };
      legs(true);
      // ---- twin tails: they leave the rear together and arch up to become the canopy's two poles
      const sway = idle ? sin(t) * 0.6 * u : run ? sin(t * 2) * 0.8 * u : 0;
      const pull = a1 ? -3.4 * u : a2 ? 3.8 * u : hurt ? -1.6 * u : 0;          // stings pulled back / stabbed forward
      const lift2 = a1 ? -1.8 * u : a2 ? 3.2 * u : 0;
      const poleR = [bx - 9 * u + pull * 0.6 + sway * 0.5, by - 19.5 * u + lift2 * 0.6], poleF = [bx + 4.2 * u + pull + sway, by - 20 * u + lift2];
      const root = [bx - 11.5 * u, by - 1 * u];
      const tailFar = bez([root, [bx - 16 * u, by - 3 * u], [bx - 15.5 * u, by - 17 * u], [poleR[0] - 1.6 * u, poleR[1] - 1.6 * u]], 34);
      const tailNear = bez([[root[0], root[1] + 1.2 * u], [bx - 25 * u, by - 9 * u], [bx - 14 * u, by - 31 * u + lift2 * 0.5], [poleF[0] - 1.6 * u, poleF[1] - 2.2 * u]], 44);
      const sting = (Lr, end, prev, Rm) => {
        const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        blob(Lr, [[end[0], end[1], 1.6 * u, 1.4 * u]], Rm);
        horn(Lr, [end[0] + Math.cos(a) * 1 * u, end[1] + Math.sin(a) * 1 * u], [end[0] + Math.cos(a) * 2.8 * u, end[1] + Math.sin(a) * 2.8 * u + 0.8 * u], [end[0] + Math.cos(a) * 2.2 * u + 1 * u, end[1] + 2.6 * u], 1.5 * u, BONEP);
        // the jewelled ring at the sting that the canopy hangs from
        Lr.ring(end[0] + Math.cos(a) * 2.2 * u + 1 * u, end[1] + 2.8 * u, 0.9 * u, G[3], Math.max(1, R(0.45 * u)));
      };
      const Tf = layer(F);
      tube(Tf, tailFar, (q) => (1.7 - q * 0.6) * u, SHd, { rings: R(2.6 * u), ringC: SHd[0] });
      sting(Tf, tailFar[34], tailFar[30], SHd);
      put(L, Tf, true);
      // ---- body: long carapace plates, gold-edged
      const B = layer(F);
      blob(B, [[bx + 5.6 * u, by - 0.4 * u, 5.4 * u, 4 * u], [bx + 0.4 * u, by - 1 * u, 5.6 * u, 4.4 * u], [bx - 4.8 * u, by - 0.8 * u, 5.2 * u, 4 * u], [bx - 9.2 * u, by - 0.4 * u, 3.8 * u, 3.2 * u]], SH, { tex: 4 });
      for (let k = 0; k < 4; k++) { const x0 = R(bx + (-7.2 + k * 4.8) * u); for (let y = R(by - 6 * u); y < by + 4.5 * u; y++) for (let d = 0; d < 2; d++) { const x = x0 + d + R((y - by) * 0.12); if (B.a(x, y)) B.set(x, y, d ? SH[0] : RIM[3]); } }
      // a jewelled stud on each plate
      for (let k = 0; k < 4; k++) { const x = bx + (-9.4 + k * 4.8) * u, y = by - 2.6 * u; B.rect(R(x), R(y), Math.max(2, R(0.8 * u)), Math.max(2, R(0.8 * u)), G[3]); B.set(R(x), R(y), G[4]); }
      put(L, B, true);
      // ---- the palanquin on her back: lacquered box, gilt rails, a cushion, a heap of eggs
      const pk = [bx - 3 * u, by - 4.8 * u], pw = 7 * u;
      const Pq = layer(F);
      slab(Pq, [[pk[0] - pw, pk[1] - 2.6 * u], [pk[0] + pw, pk[1] - 2.6 * u], [pk[0] + pw - 0.6 * u, pk[1] + 0.6 * u], [pk[0] - pw + 0.6 * u, pk[1] + 0.6 * u]], LAC, { wide: true });
      for (let x = R(pk[0] - pw); x <= pk[0] + pw; x++) { Pq.set(x, R(pk[1] - 2.6 * u), G[4]); Pq.set(x, R(pk[1] - 2.6 * u) + 1, G[2]); Pq.set(x, R(pk[1] + 0.2 * u), G[3]); }
      for (let k = -2; k <= 2; k++) { const x = pk[0] + k * pw * 0.42; Pq.rect(R(x - 0.3 * u), R(pk[1] - 2 * u), Math.max(1, R(0.6 * u)), R(2 * u), G[k % 2 ? 2 : 3]); Pq.set(R(x), R(pk[1] - 1 * u), '#cc6a86'); }
      blob(Pq, [[pk[0], pk[1] - 3.2 * u, pw * 0.92, 1.3 * u]], SILKd, { matte: true });
      put(L, Pq, true);
      put(F.p, L, false);
      // eggs: translucent amber shells lit from within, each a curled shadow inside, pulsing in turn
      const eggs = [[-4.6, -4.4, 1.6], [-1.6, -4.6, 1.8], [1.6, -4.4, 1.6], [4.4, -4.0, 1.4], [-3, -6.8, 1.6], [0.2, -7.1, 1.7], [3, -6.4, 1.4], [-0.9, -9.2, 1.5]];
      eggs.forEach(([ex, ey, er], k) => {
        const x = pk[0] + ex * u, y = pk[1] + ey * u, pulse = (idle || run) ? (Math.floor(t * 6 + k) % 3 === 0 ? 1 : 0) : a1 ? 1 : 0;
        const cracked = hurt && k === 5;
        const sh = cracked ? HOT[0] : pulse ? HOT[3] : HOT[2];
        for (const Lr of [F.p, F.e]) Lr.ellipse(x, y, er * u, er * 1.25 * u, sh);
        F.p.ellipse(x - 0.3 * u, y - 0.4 * u, er * 0.6 * u, er * 0.8 * u, pulse ? HOT[4] : HOT[3]); F.e.ellipse(x - 0.3 * u, y - 0.4 * u, er * 0.6 * u, er * 0.8 * u, pulse ? HOT[4] : HOT[3]);
        // the curled little scorpion inside
        F.p.ellipse(x + 0.3 * u, y + 0.4 * u, er * 0.35 * u, er * 0.45 * u, HOT[0]); F.p.set(R(x + 0.3 * u + er * 0.35 * u), R(y - 0.2 * u), HOT[0]);
        F.p.set(R(x - er * 0.5 * u), R(y - er * 0.8 * u), WHITE);
        if (cracked) crack(F.p, x - er * u, y - 0.5 * u, 0.2, er * 2 * u, MAROON[0], 4);
      });
      // ---- the near tail, over the palanquin
      const T2 = layer(F);
      tube(T2, tailNear, (q) => (2.0 - q * 0.8) * u, SH, { rings: R(2.8 * u), ringC: SH[0] });
      for (let k = 4; k < 44; k += 5) over(T2, tailNear[k][0] - 0.8 * u, tailNear[k][1] - 1 * u, RIM[3]);
      sting(T2, tailNear[44], tailNear[40], SH);
      put(F.p, T2, true);
      // ---- the canopy: a sagging valance of rose silk slung between the two stings, a gold-tasselled
      // fringe, and tied-back curtains falling to the palanquin at each end
      const hA = [poleR[0], poleR[1] + 1.4 * u], hB = [poleF[0], poleF[1] + 1.4 * u];
      const Cn = layer(F), sag = (a2 ? 1 : 2.4) * u + (idle ? sin(t) * 0.3 * u : 0), vh = 2.8 * u;
      const val = [];
      for (let k = 0; k <= 20; k++) { const f = k / 20; val.push([lerp(hA[0], hB[0], f), lerp(hA[1], hB[1], f) + Math.sin(f * Math.PI) * sag]); }
      // short tails of silk hanging from each hook, blowing back
      const tail = (h, sg) => {
        const bl = (idle ? sin(t + (sg > 0 ? 0 : 0.5)) * 0.8 : run ? -1.4 : a2 ? -1.8 : 0) * u;
        slab(Cn, [[h[0] - 1.2 * u, h[1]], [h[0] + 1.2 * u, h[1]], [h[0] + 1 * u + bl, h[1] + 6.5 * u], [h[0] - 0.2 * u + bl, h[1] + 7.4 * u], [h[0] - 1.4 * u + bl, h[1] + 6.2 * u]], SILKd, { wide: true });
        Cn.rect(R(h[0] - 1 * u), R(h[1] + 1.2 * u), R(2 * u), Math.max(2, R(0.7 * u)), G[3]);
      };
      tail(hA, 1); tail(hB, -1);
      const vp = [...val.map(([x, y]) => [x, y - vh * 0.4]), ...val.slice().reverse().map(([x, y], k) => [x, y + vh * 0.6 + Math.abs(Math.sin(k / 20 * Math.PI * 5)) * 1.2 * u])];
      slab(Cn, vp, SILK, { wide: true });
      put(F.p, Cn, true);
      for (let k = 2; k < 20; k += 4) { const [x, y] = val[k]; F.p.line(x, y + vh * 0.6 + 1.2 * u, x, y + vh * 0.6 + 2.6 * u, G[2]); F.p.rect(R(x - 0.4 * u), R(y + vh * 0.6 + 2.6 * u), Math.max(2, R(0.9 * u)), Math.max(2, R(1.1 * u)), G[3]); }
      for (let k = 0; k < 20; k += 2) F.p.set(R(val[k][0]), R(val[k][1] - vh * 0.4 + 1), G[4]);
      // ---- pincers: big gold-rimmed chelae
      const claw = (far) => {
        const C2 = layer(F), Rl = far ? SHd : SH;
        const sh = [bx + 9 * u + (far ? 1.2 * u : 0), by + 0.6 * u - (far ? 1 * u : 0)];
        const reach = a2 ? 4 * u : a1 ? -1.4 * u : 0, raise = a1 ? 4.2 * u : 0;
        const el = [sh[0] + 3 * u + reach * 0.4, sh[1] - 4 * u - raise];
        const hand = [el[0] + 4.6 * u + reach, el[1] + 1.2 * u - raise * 0.3 + (idle ? sin(t + (far ? 0.5 : 0)) * 0.4 * u : 0)];
        tube(C2, [sh, el], [1.6 * u, 1.3 * u], Rl, { rings: R(2.6 * u), ringC: Rl[0] });
        tube(C2, [el, hand], [1.4 * u, 1.6 * u], Rl);
        const op = a1 ? 0.6 : a2 ? 0.04 : hurt ? 0.4 : 0.15 + (idle && P.i % 3 === 0 ? 0.15 : 0);
        horn(C2, [hand[0] + 2.4 * u, hand[1] + 0.9 * u], [hand[0] + 4.4 * u, hand[1] + 2.2 * u + op * 3 * u], [hand[0] + 6.2 * u, hand[1] + 0.6 * u + op * 2.4 * u], 2.2 * u, Rl);
        blob(C2, [[hand[0] + 1 * u, hand[1], 3.4 * u, 2.5 * u]], far ? Rl : RIM, { lift: -0.2 });
        horn(C2, [hand[0] + 2.8 * u, hand[1] - 1 * u], [hand[0] + 5 * u, hand[1] - 2.4 * u - op * 4 * u], [hand[0] + 7.4 * u, hand[1] - 0.2 * u - op * 4 * u], 2.8 * u, far ? Rl : RIM, { lift: -0.2 });
        if (!far) for (let k = 0; k < 4; k++) over(C2, hand[0] - 0.8 * u + k * 0.9 * u, hand[1] + 2.0 * u, G[3]);
        put(F.p, C2, true);
      };
      claw(true);
      // ---- head and the crown carapace
      const hx = bx + 10.2 * u, hy = by - 1.4 * u;
      const Hd = layer(F);
      blob(Hd, [[hx, hy, 3.8 * u, 3.2 * u]], SH);
      tube(Hd, [[hx + 2 * u, hy + 1.6 * u], [hx + 3.6 * u, hy + 3 * u + (a1 || a2 ? 1 * u : 0)]], [1 * u, 0.6 * u], RIM);
      // crown: a gold band with five points, gems on the points, tilted on the hit
      const ct = hurt ? -0.3 : 0, cr = (x, y) => { const [dx, dy] = rot(x * u, y * u, ct); return [hx + dx, hy + dy]; };
      slab(Hd, [cr(-3.4, -2.4), cr(3.4, -2.8), cr(3.6, -0.8), cr(-3.4, -0.4)], G, { wide: true });
      for (let k = 0; k < 5; k++) { const x = -2.9 + k * 1.5; slab(Hd, [cr(x - 0.7, -2.5), cr(x + 0.7, -2.6), cr(x + 0.1, -5.2 - (k === 2 ? 1.6 : 0))], G); }
      put(F.p, Hd, true);
      for (let k = 0; k < 5; k++) { const [gx, gy] = cr(-2.8 + k * 1.5, -3.8 - (k === 2 ? 1.4 : 0)); F.p.rect(R(gx - 0.4 * u), R(gy), Math.max(2, R(0.8 * u)), Math.max(2, R(0.8 * u)), k === 2 ? '#cc6a86' : k % 2 ? '#3973af' : '#a94a68'); F.p.set(R(gx - 0.4 * u), R(gy), WHITE); }
      const band = cr(-2.2, -1.4); for (let k = 0; k < 3; k++) F.p.rect(R(band[0] + k * 2 * u), R(band[1]), Math.max(1, R(0.6 * u)), Math.max(1, R(0.6 * u)), k === 1 ? '#3973af' : '#cc6a86');
      claw(false);
      legs(false);
      // eyes: two great ember eyes under the crown and a row of small ones
      if (hurt) { F.p.line(hx - 0.4 * u, hy - 0.2 * u, hx + 1.6 * u, hy + 0.2 * u, VOID); }
      else {
        eyeGlow(F, hx - 0.2 * u, hy - 0.4 * u, Math.max(2, 1.4 * u), Math.max(2, 1.1 * u), a2 ? HOT[4] : HOT[3], { brow: SH[0] });
        eyeGlow(F, hx + 1.6 * u, hy - 0.2 * u, Math.max(2, 1.2 * u), Math.max(2, 1.0 * u), a2 ? HOT[4] : HOT[3]);
        for (let k = 0; k < 3; k++) spark(F, hx - 1.8 * u + k * 0.6 * u, hy + 0.9 * u, HOT[2]);
      }
      if (a2) for (let k = 0; k < 5; k++) spark(F, hx + (5 + k * 1.2) * u, hy + (2 + (k % 2)) * u, HOT[k % 2 ? 2 : 3], 2);
      F.mouth = [hx + 3.6 * u, hy + 2.6 * u];
    },
  },
};
