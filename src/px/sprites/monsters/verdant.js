// Hand-built monster designs: the Verdant Wilds. See kit.js for the design format and
// docs/BESTIARY.md for the concepts. Rust earth, teal grass, rose and lavender flora; toxic green
// glows for rot, ember for shrine fire.
import { C, R, ramp, pal5, layer, put, blob, tube, horn, slab, facet, shard, wing, drape, ik, stride, sin, cos, lerp, clamp, bez, rot, glow, flame, eyeGlow, eyeBead, eyeBall, teeth, maw, spots, stripes, crack, over, rimLight, tint, light, dark, mixc, hash2, srand, WHITE, VOID, BONE, BONE_D, MAW, MAW_D, TONGUE, CREAM, INK } from './kit.js';

const TAU = Math.PI * 2;
const EYE_DK = '#2a0e18';

// ------------------------------------------------------------------ local helpers
// a pixel into both the colour and the emissive buffer
const lit = (F, x, y, c) => { F.p.set(R(x), R(y), C(c)); F.e.set(R(x), R(y), C(c)); };
// a point along a polyline / bezier sample list at fraction f
const along = (P, f) => { const k = clamp(f, 0, 1) * (P.length - 1), i = Math.floor(k), j = Math.min(P.length - 1, i + 1), r = k - i; return [lerp(P[i][0], P[j][0], r), lerp(P[i][1], P[j][1], r)]; };
// a bramble: a tapered vine along a curve with hooked thorns on alternating sides
function bramble(L, pts, r, Rm, thornC, o = {}) {
  const P = bez(pts, 24);
  tube(L, P, r, Rm, { matte: true });
  const tc = C(thornC), td = dark(tc, 0.7), every = o.every ?? 0.16, len = o.len ?? 2;
  for (let f = o.start ?? 0.12, k = 0; f < 0.96; f += every, k++) {
    const a = along(P, f), b = along(P, f + 0.03), dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
    const nx = -dy / d * (k & 1 ? 1 : -1), ny = dx / d * (k & 1 ? 1 : -1);
    const rr = typeof r === 'number' ? r : Array.isArray(r) ? lerp(r[0], r[1], f) : r(f);
    const x0 = a[0] + nx * rr * 0.7, y0 = a[1] + ny * rr * 0.7;
    const x1 = x0 + nx * len + dx / d * len * 0.6, y1 = y0 + ny * len + dy / d * len * 0.6;
    L.line(x0, y0, x1, y1, tc);
    L.set(R(x0), R(y0), td);
  }
  return L;
}
// a rose: 0 tight green bud with a red tip, 1 opening cup, 2 full bloom, 3 shedding
function rose(F, L, x, y, stage, s, Rp, Gr) {
  if (stage === 0) {
    blob(L, [[x, y, s * 0.7, s * 0.95]], Gr);
    L.ellipse(x, y - s * 0.55, s * 0.4, s * 0.45, Rp[3]);
    L.set(R(x - 1), R(y + s * 0.2), Gr[4]);
    return;
  }
  if (stage === 1) {
    blob(L, [[x, y, s * 0.95, s * 0.9]], Rp);
    L.ellipse(x, y - s * 0.45, s * 0.55, s * 0.35, Rp[1]);
    L.poly([[x - s, y + s * 0.2], [x - s * 0.3, y + s * 1.1], [x - s * 0.9, y + s * 0.9]], Gr[3]);
    L.poly([[x + s, y + s * 0.2], [x + s * 0.3, y + s * 1.1], [x + s * 0.9, y + s * 0.9]], Gr[2]);
    return;
  }
  // bloom: five petals round a dark whorl and a pale heart
  const n = 5;
  for (let k = 0; k < n; k++) {
    const a = k / n * TAU - Math.PI / 2 + (stage === 3 ? 0.3 : 0);
    if (stage === 3 && k % 2) continue;
    L.ellipse(x + Math.cos(a) * s * 0.75, y + Math.sin(a) * s * 0.75, s * 0.62, s * 0.62, k < 2 ? Rp[4] : k < 4 ? Rp[3] : Rp[2]);
  }
  L.disc(x, y, s * 0.62, Rp[2]);
  L.disc(x - s * 0.15, y - s * 0.15, s * 0.36, Rp[1]);
  L.set(R(x - s * 0.1), R(y - s * 0.1), C('#f6e39a'));
  L.set(R(x - s * 0.5), R(y - s * 0.75), Rp[4]);
}

// lean a whole layer: shift each row sideways by (y0 - y) * k px (positive k tips the top forward)
function skew(L, k, y0) {
  if (!k) return L;
  const N = layer({ p: L });
  for (let y = 0; y < L.h; y++) {
    const dx = Math.round((y0 - y) * k);
    for (let x = 0; x < L.w; x++) { const i = (y * L.w + x) * 4; if (L.d[i + 3]) { const nx = x + dx; if (nx >= 0 && nx < L.w) { const j = (y * L.w + nx) * 4; N.d[j] = L.d[i]; N.d[j + 1] = L.d[i + 1]; N.d[j + 2] = L.d[i + 2]; N.d[j + 3] = L.d[i + 3]; } } }
  }
  return N;
}
// a soft spore puff: stepped dithered rings of motes, glowing specks into e
function puff(F, x, y, r, c, seed = 1, k = 1) {
  const cc = C(c), hi = light(cc, 1.3), rr = srand(seed);
  for (let n = 0; n < 7; n++) {
    const a = rr() * TAU, d = Math.sqrt(rr()) * r * 0.75, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d * 0.7, pr = r * (0.3 + rr() * 0.25);
    for (let yy = Math.floor(py - pr); yy <= py + pr; yy++) for (let xx = Math.floor(px - pr); xx <= px + pr; xx++) {
      const q = Math.hypot(xx + 0.5 - px, yy + 0.5 - py) / pr;
      if (q <= 1 && bay(xx, yy) < (1.15 - q) * k) F.p.set(xx, yy, [...cc.slice(0, 3), 200]);
    }
  }
  for (let n = 0; n < 6; n++) { const a = rr() * TAU, d = rr() * r; lit(F, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, hi); }
}
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bay = (x, y) => (BAY[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

// polygon of a dome (half ellipse) standing on (cx, cy), its crown pointing along angle a
function domePts(cx, cy, rx, ry, a, n = 14) {
  const ux = Math.cos(a), uy = Math.sin(a), px = -uy, py = ux, pts = [];
  for (let k = 0; k <= n; k++) { const th = Math.PI * k / n, s1 = Math.cos(th) * rx, s2 = Math.sin(th) * ry; pts.push([cx + px * s1 + ux * s2, cy + py * s1 + uy * s2]); }
  return pts;
}

// polygon of an ellipse centred on (cx, cy) with its long axis along angle a
function ellPts(cx, cy, rx, ry, a, n = 22) {
  const ca = Math.cos(a), sa = Math.sin(a), pts = [];
  for (let k = 0; k < n; k++) { const th = k / n * TAU, x = Math.cos(th) * rx, y = Math.sin(th) * ry; pts.push([cx + x * ca - y * sa, cy + x * sa + y * ca]); }
  return pts;
}
const ROT_G = '#bef46b', ROT_M = '#90ac5c', ROT_D = '#4a6e36';   // rot-green glow (core, mid, deep)

// enemy id -> { design, name, body? }: folded into src/data/enemies.js at integration
export const assign = {
  thornwolf: { design: 'briarback', name: 'Briarback' },
  fungal_shambler: { design: 'toadstool_trudger', name: 'Toadstool Trudger' },
  spore_sprite: { design: 'will_o_moth', name: "Will-o'-Moth" },
  elder_boar: { design: 'shrine_boar', name: 'Shrine Boar' },
  moss_troll: { design: 'hillock_troll', name: 'Hillock Troll' },
};

export default {
  // Briarback (thornwolf): the black dog of the hedgerows. A lean dusk-mauve wolf whose mane is a
  // tangle of brambles; the wild roses along its spine are shut buds that blow open blood-red
  // when it lunges. Its snout is plated in bark like an old hawthorn.
  briarback: {
    view: 'side', box: [32, 20], pivot: 0.48, idleFps: 3,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const fur = pal5('mauve', 5), furD = fur.map((c) => dark(c, 0.78)), furL = pal5('mauve', 7);
      const vine = pal5('green', 4), vineD = pal5('green', 3);
      const bark = pal5('wood', 5), Rp = pal5('red', 5), Gr = pal5('green', 5), TH = '#7a2f4a';
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle';
      const w1 = P.atk === 1, w2 = P.atk === 2, hurt = P.hurt;
      const lunge = w2 ? 3.2 * u : w1 ? -1.8 * u : hurt ? -1.4 * u : 0;
      const bob = run ? -Math.abs(sin(t)) * 1.1 * u : idle ? sin(t) * 0.25 * u : w1 ? 1.3 * u : 0;
      const tilt = run ? sin(t) * 0.5 : w2 ? -0.6 : w1 ? 1.4 : hurt ? -1.6 : 0;          // head pitch, units
      const bx = ox + lunge, by = oy - 8.4 * u + bob;
      const L = layer(F);
      // legs: digitigrade, a paw blob at the foot
      const leg = (hx, ph, far, front) => {
        const Lg = layer(F), Rl = far ? furD : fur;
        const hip = [hx, by + 0.8 * u];
        let dx = 0, lift = 0;
        if (run) [dx, lift] = stride(ph, 6.6 * u, 2.4 * u);
        else if (w1) dx = front ? 1.4 * u : -0.4 * u;
        else if (w2) { dx = front ? 3.8 * u : -3.6 * u; lift = front ? 1.4 * u : 0; }
        else if (hurt) dx = front ? 1.6 * u : 1 * u;
        const foot = [hx + dx + (front ? 0.8 * u : -0.6 * u), oy - lift - 0.7 * u];
        const knee = ik(hip, foot, 3.8 * u, 4.2 * u, front ? 1 : -1);
        tube(Lg, [hip, knee], [front ? 1.5 * u : 1.9 * u, 1 * u], Rl, { fur: 5 });
        tube(Lg, [knee, foot], [0.85 * u, 0.7 * u], Rl);
        blob(Lg, [[foot[0] + 0.5 * u, foot[1] + 0.15 * u, 1.2 * u, 0.65 * u]], Rl);
        put(L, Lg, !far);
      };
      leg(bx + 4.4 * u, t + 0.12, true, true); leg(bx - 5 * u, t + 0.62, true, false);
      // tail: a brush that frays into a bramble whip
      const tw = run ? sin(t + 0.3) * 1.8 * u : idle ? sin(t) * 0.7 * u : w2 ? -1.4 * u : w1 ? 1 * u : 0;
      const T = layer(F);
      bramble(T, [[bx - 7.4 * u, by - 1.6 * u], [bx - 11 * u, by - 3 * u + tw * 0.4], [bx - 13.6 * u, by - 1.2 * u + tw], [bx - 14 * u, by + 1.8 * u + tw]], [0.8 * u, 0.35 * u], vineD, TH, { every: 0.24 });
      blob(T, [[bx - 8.6 * u, by - 2 * u + tw * 0.2, 2.2 * u, 1.5 * u]], fur, { fur: 9 });
      put(L, T, true);
      // body: haunch, barrel, deep chest and neck as one furred form
      const B = layer(F);
      blob(B, [[bx - 4.8 * u, by - 0.4 * u, 3.6 * u, 3.3 * u], [bx - 0.6 * u, by + 0.2 * u, 4.8 * u, 2.9 * u], [bx + 3.6 * u, by - 0.2 * u, 3.8 * u, 3.8 * u], [bx + 6.2 * u, by - 2.6 * u + tilt * 0.4 * u, 2.4 * u, 2.8 * u]], fur, { fur: 3 });
      // pale belly line
      for (let x = R(bx - 4 * u); x < bx + 2 * u; x++) over(B, x, R(by + 2.8 * u), fur[1]);
      put(L, B, true);
      // spine roses: shut buds; they open on the wind-up and bloom blood-red on the strike
      const stage = w2 ? 2 : w1 ? 1 : hurt ? 3 : 0;
      const Rs = layer(F);
      const buds = [[bx - 0.6 * u, by - 2.6 * u], [bx - 3.6 * u, by - 2.9 * u], [bx - 6.4 * u, by - 3.3 * u]];
      buds.forEach(([x, y], k) => {
        const sw = idle ? sin(t + k * 0.3) * 0.4 * u : run ? -sin(t) * 0.5 * u : 0;
        const top = [x - 0.4 * u + sw, y - 1.5 * u];
        tube(Rs, [[x, y], top], 0.45 * u, vineD);
        rose(F, Rs, top[0], top[1] - 0.4 * u, stage, (stage === 2 ? 1.75 : stage ? 1.45 : 1.15) * u, Rp, Gr);
      });
      put(L, Rs, true);
      // bramble mane: a dense ruff of tangled canes round the neck, hooked runners bristling out
      const M = layer(F), sh = run ? sin(t + 0.2) * 0.5 * u : idle ? sin(t) * 0.3 * u : 0, bristle = w1 || w2 ? 1.25 : 1;
      const mx = bx + 4.6 * u, my = by - 3.2 * u + tilt * 0.3 * u;
      blob(M, [[mx, my, 3.6 * u, 3.4 * u], [mx + 1.6 * u, my + 2.6 * u, 2.4 * u, 2.6 * u], [mx - 2 * u, my - 0.6 * u, 2.6 * u, 2.4 * u]], vine, { tex: 11 });
      const runners = [
        [-2.9, 6.4, -0.6], [-2.4, 7, 0.7], [-1.95, 7.6, -0.7], [-1.5, 7, 0.6], [-1.05, 6, -0.6], [-3.3, 5.2, -0.5], [0.9, 5.6, 0.7],
      ];
      runners.forEach(([a, l, c], k) => {
        const L2 = l * u * (a < 0 ? bristle : 1);
        const p0 = [mx + Math.cos(a) * 1.5 * u, my + Math.sin(a) * 1.5 * u];
        const p1 = [mx + Math.cos(a) * L2 * 0.7 + sh, my + Math.sin(a) * L2 * 0.7];
        const p2 = [mx + Math.cos(a + c) * L2 + sh * 1.3, my + Math.sin(a + c) * L2];
        bramble(M, [p0, p1, p2], [1 * u, 0.4 * u], k % 2 ? vineD : vine, TH, { every: 0.3, start: 0.45, len: 1.6 });
      });
      // tangle: a few dark cane loops across the ruff, and caught leaves
      for (const [a0, rr] of [[0.3, 2.2], [2.4, 1.7], [4.2, 2.6]]) for (let a = a0; a < a0 + 2.2; a += 0.12) over(M, mx + Math.cos(a) * rr * u, my + Math.sin(a) * rr * 0.9 * u, vine[0]);
      for (const [dx, dy] of [[-1.2, -2.2], [1.6, -1.2], [-2.4, 0.8], [1.4, 2.4]]) { M.ellipse(mx + dx * u, my + dy * u, 0.9 * u, 0.55 * u, Gr[4]); over(M, mx + dx * u + 0.5 * u, my + dy * u + 0.3 * u, Gr[2]); }
      put(L, M, true);
      // head: broad skull, bark-plated wedge muzzle, short laid-back ears
      const hx = bx + 8.8 * u, hy = by - 4.4 * u + tilt * u;
      const H = layer(F);
      const ea = w2 || hurt ? 1.4 * u : 0, ef = idle && P.i === 2 ? 0.6 * u : 0;
      slab(H, [[hx - 2.6 * u, hy - 1.4 * u], [hx - 0.8 * u, hy - 2 * u], [hx - 2.6 * u - ea - ef, hy - 5.2 * u + ea * 0.6]], furD);
      slab(H, [[hx - 1.4 * u, hy - 1.8 * u], [hx + 0.6 * u, hy - 2 * u], [hx - 1 * u - ea - ef, hy - 5.6 * u + ea * 0.6]], fur);
      over(H, hx - 1.1 * u - ea, hy - 3.4 * u, furD[0]);
      blob(H, [[hx, hy, 2.8 * u, 2.5 * u], [hx - 0.8 * u, hy + 1 * u, 2.2 * u, 1.9 * u]], fur, { fur: 6 });
      // lower jaw: drops open on the strike
      const jaw = w2 ? 0.6 : w1 ? 0.2 : hurt ? 0.3 : 0;
      const jx = hx + 0.8 * u, jy = hy + 1.5 * u;
      const jt = [jx + Math.cos(jaw) * 4.4 * u, jy + Math.sin(jaw) * 4.4 * u];
      if (jaw > 0.1) {
        H.poly([[jx, jy - 0.8 * u], [hx + 5.4 * u, hy + 0.9 * u], jt, [jx, jy + 0.6 * u]], C(MAW_D));
        teeth(H, [hx + 2 * u, hy + 1.3 * u], [hx + 5 * u, hy + 1.1 * u], 3, Math.max(1, 0.9 * u), 1);
        teeth(H, [lerp(jx, jt[0], 0.4), lerp(jy, jt[1], 0.4) - 0.4 * u], [lerp(jx, jt[0], 0.9), lerp(jy, jt[1], 0.9) - 0.4 * u], 2, Math.max(1, 0.8 * u), -1);
      }
      tube(H, [[jx - 0.6 * u, jy], jt], [1 * u, 0.6 * u], furD);
      // the muzzle: overlapping bark plates, lit top edges, dark seams, a black nose
      slab(H, [[hx + 0.4 * u, hy - 2 * u], [hx + 3 * u, hy - 1.3 * u], [hx + 5.6 * u, hy - 0.5 * u], [hx + 5.8 * u, hy + 0.6 * u], [hx + 5 * u, hy + 1.2 * u], [hx + 0.8 * u, hy + 1.8 * u]], bark, { wide: u > 2 });
      for (const f of [0.3, 0.62]) { const x = lerp(hx + 0.6 * u, hx + 5.6 * u, f); H.line(x, hy - 1.6 * u + f * 1.4 * u, x - 0.6 * u, hy + 1.6 * u, bark[1]); H.line(x + 1, hy - 1.5 * u + f * 1.4 * u, x + 1.6 * u, hy - 1.1 * u + f * 1.4 * u, bark[4]); }
      H.rect(R(hx + 5 * u), R(hy - 0.6 * u), Math.max(2, R(1 * u)), Math.max(1, R(0.9 * u)), C(VOID)); H.set(R(hx + 5 * u), R(hy - 0.6 * u), bark[4]);
      // pale cheek ruff
      blob(H, [[hx - 1.4 * u, hy + 2 * u, 1.3 * u, 0.9 * u]], furL);
      put(L, H, true);
      // near legs
      leg(bx - 4.2 * u, t + 0.5, false, false); leg(bx + 5.2 * u, t, false, true);
      put(F.p, L, false);
      // eye: a slit of sap-green light under a heavy bark brow; squeezed shut when hurt
      const ec = o.c3 || '#a0d060';
      if (hurt) { F.p.line(hx + 0.2 * u, hy - 0.9 * u, hx + 1.8 * u, hy - 0.3 * u, C(INK)); F.p.line(hx + 0.2 * u, hy - 0.1 * u, hx + 1.4 * u, hy - 0.4 * u, C(INK)); }
      else eyeGlow(F, hx + 0.2 * u, hy - 0.9 * u, Math.max(2, 1.4 * u), Math.max(1, 0.8 * u), ec);
      F.p.line(hx - 0.4 * u, hy - 1.4 * u, hx + 2 * u, hy - 1.1 * u + (w1 || w2 ? 0.6 * u : 0), bark[0]);
      F.mouth = [hx + 5 * u, hy + 1 * u];
    },
  },
  // Toadstool Trudger (fungal_shambler): a fly-agaric the size of a hut that has pulled itself up
  // by the roots and goes trudging about half asleep, a sleep bubble at its lips. It drags a
  // smaller lilac toadstool like a club, and wakes up only to swing it.
  toadstool_trudger: {
    view: 'side', box: [30, 25], pivot: 0.4, idleFps: 2,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const cap = pal5('red', 5), stem = pal5('sand', 5), gill = pal5('sand', 3), root = pal5('wood', 5), lil = pal5('lavender', 5);
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle';
      const w1 = P.atk === 1, w2 = P.atk === 2, hurt = P.hurt;
      const sx = ox + (w2 ? 1.2 * u : w1 ? -0.8 * u : hurt ? -0.8 * u : 0);
      const lean = run ? sin(t) * 0.06 : w1 ? -0.12 : w2 ? 0.16 : hurt ? -0.14 : 0;
      const sq = hurt ? 0.9 : w1 ? 1.06 : w2 ? 0.94 : idle ? 1 + sin(t) * 0.025 : 1 - Math.abs(sin(t)) * 0.04;
      const L = layer(F);
      // root legs: a far and a near root foot under a cup-shaped volva
      const legs = (far) => {
        const Lg = layer(F), Rl = far ? root.map((c) => dark(c, 0.8)) : root;
        const side = far ? -1 : 1, ph = run ? t + (far ? 0.5 : 0) : 0;
        const [dx, lift] = run ? stride(ph, 4.4 * u, 1.6 * u) : [w2 ? side * 1.4 * u : w1 ? -side * 0.6 * u : 0, 0];
        const hip = [sx + side * 1.4 * u, oy - 3.2 * u], foot = [sx + side * 2 * u + dx, oy - 0.6 * u - lift];
        tube(Lg, [hip, [lerp(hip[0], foot[0], 0.5) + side * 0.6 * u, lerp(hip[1], foot[1], 0.5)], foot], [1.5 * u, 1.1 * u], Rl, { tex: 4 });
        // splayed root toes
        for (const a of [-0.5, 0.2, 0.9]) tube(Lg, [foot, [foot[0] + Math.cos(a) * 1.8 * u, foot[1] + 0.5 * u + Math.sin(a) * 0.3 * u]], [0.6 * u, 0.3 * u], Rl);
        put(L, Lg, !far);
      };
      legs(true);
      // the body: volva cup, barrel stem, ring and cap, leaned and squashed as one piece
      const B = layer(F), top = oy - 3 * u;
      const sy = (k) => top - (top - k) * sq;
      blob(B, [[sx, oy - 3.4 * u, 3.6 * u, 1.9 * u]], root, { tex: 5 });
      blob(B, [[sx, sy(oy - 8 * u), 3.5 * u, 4.8 * u * sq], [sx + 0.2 * u, sy(oy - 11.6 * u), 2.7 * u, 2.6 * u]], stem, { tex: 8 });
      // fibrous streaks down the stem
      for (const fx of [-1.6, 0.4, 2.2]) for (let y = sy(oy - 11 * u); y < oy - 5 * u; y += 2) over(B, sx + fx * u + (y % 4 ? 0 : 1), y, stem[2]);
      // ragged ring (annulus) under the cap
      const ry = sy(oy - 13.4 * u);
      blob(B, [[sx + 0.2 * u, ry, 3.6 * u, 1.1 * u]], stem);
      for (let k = 0; k < 5; k++) { const x = sx - 3 * u + k * 1.5 * u; B.poly([[x, ry], [x + 1.4 * u, ry], [x + 0.7 * u, ry + (1.2 + (k % 2) * 0.8) * u]], stem[k % 2 ? 2 : 3]); }
      // cap: gills underneath, then the red dome with cream warts; a torn notch at the back
      const cx = sx + 0.4 * u, cy = sy(oy - 15.6 * u), crx = 8.6 * u, cry = 6.2 * u * (hurt ? 0.88 : 1);
      B.ellipse(cx, cy + 0.6 * u, crx * 0.94, 1.7 * u, gill[2]);
      for (let k = -6; k <= 6; k++) B.line(cx + k * crx * 0.13, cy + 0.2 * u, cx + k * crx * 0.15, cy + 1.9 * u, gill[0]);
      const Cp = layer(F);
      blob(Cp, [[cx, cy, crx, cry], [cx - 1 * u, cy - 1.6 * u, crx * 0.78, cry * 0.95]], cap, { clipY: R(cy + 0.5 * u) });
      Cp.ellipse(cx - 7.4 * u, cy - 0.4 * u, 1.3 * u, 1.1 * u, [0, 0, 0, 0]);
      for (let y = Math.floor(cy - 1.6 * u); y <= cy; y++) for (let x = Math.floor(cx - 8.8 * u); x <= cx - 6.4 * u; x++) if (Math.hypot(x + 0.5 - (cx - 7.6 * u), (y + 0.5 - (cy - 0.6 * u)) * 1.2) < 1.2 * u) Cp.clear(x, y);
      const warts = [[-4.2, -4], [-0.6, -5.4], [3, -3.8], [-6, -1.4], [0.9, -2.2], [5.6, -1.2], [-2.8, -1.8], [6.8, -0.1]];
      warts.forEach(([dx, dy], k) => {
        if (hurt && k % 3 === 1) return;
        const wx = cx + dx * u, wy = cy + dy * u * (cry / (6.2 * u)), r = (k % 3 === 0 ? 1.1 : 0.8) * u;
        Cp.ellipse(wx, wy + 0.4, r, r * 0.75, C('#cfa978'));
        Cp.ellipse(wx - 0.3, wy, r * 0.85, r * 0.6, C(CREAM));
      });
      put(B, Cp, false);
      // face on the stem: heavy-lidded sleepy eyes, a small round mouth with a sleep bubble
      const fx = sx + 1.4 * u, fy = sy(oy - 9.2 * u);
      const open = w1 || w2;
      for (const [ex, er] of [[fx - 1.2 * u, 0.85], [fx + 1.5 * u, 1]]) {
        if (open) {
          B.ellipse(ex, fy, 1.2 * u * er, 1.2 * u * er, C('#fff4dc'));
          B.ellipse(ex + 0.3 * u, fy + 0.1 * u, 0.6 * u * er, 0.7 * u * er, C(VOID));
        } else if (hurt) {
          B.line(ex - 0.9 * u, fy - 0.7 * u, ex + 0.7 * u, fy, C(EYE_DK)); B.line(ex - 0.9 * u, fy + 0.7 * u, ex + 0.7 * u, fy, C(EYE_DK));
        } else {
          // shut, drooping eyes: a dark lash curve with a heavy lid above it
          const drop = idle && P.i === 3 ? 0.3 * u : 0;
          B.ellipse(ex, fy - 0.2 * u, 1.3 * u * er, 0.9 * u, stem[2]);
          for (let a = 0.15; a <= Math.PI - 0.15; a += 0.12) B.set(R(ex + Math.cos(a) * 1.2 * u * er), R(fy + drop + Math.sin(a) * 0.55 * u), C(EYE_DK));
          B.set(R(ex - 1.1 * u * er), R(fy + drop + 0.6 * u), C(EYE_DK));
        }
      }
      // brows: sleepy slant, angry V when awake
      if (open) { B.line(fx - 2.2 * u, fy - 1.8 * u, fx - 0.2 * u, fy - 1.1 * u, stem[0]); B.line(fx + 0.4 * u, fy - 1.1 * u, fx + 2.6 * u, fy - 1.9 * u, stem[0]); }
      const mx = fx + 0.6 * u, my = fy + 2 * u;
      if (open) maw(B, mx, my + 0.3 * u, 1.5 * u, (w2 ? 1.3 : 0.9) * u, { teeth: 0 });
      else { B.ellipse(mx, my, 0.8 * u, 0.7 * u, C(MAW_D)); B.set(R(mx), R(my + 0.3 * u), C(TONGUE)); }
      put(L, skew(B, lean, oy), true);
      legs(false);
      // the club arm: a root arm on the near side gripping a lilac toadstool by the stalk
      const sh = [sx + 2.8 * u + lean * 5 * u, oy - 5.4 * u];
      const hand = w1 ? [sx + 4.6 * u, oy - 12.4 * u] : w2 ? [sx + 7 * u, oy - 6 * u] : hurt ? [sx + 5 * u, oy - 3.4 * u] : [sx + 6 * u + (run ? sin(t) * 0.8 * u : 0), oy - 4.4 * u + (idle ? sin(t) * 0.3 * u : 0)];
      const ca = w1 ? -2.2 : w2 ? 0.6 : hurt ? 0.3 : run ? -0.5 + sin(t) * 0.12 : -0.35;
      const head = [hand[0] + Math.cos(ca) * 5.4 * u, hand[1] + Math.sin(ca) * 5.4 * u];
      const A = layer(F);
      tube(A, [[hand[0] - Math.cos(ca) * 0.8 * u, hand[1] - Math.sin(ca) * 0.8 * u], head], [0.9 * u, 1.1 * u], stem);
      // club cap: a lilac dome facing along the swing, gills on its flat underside
      const nx = Math.cos(ca), ny = Math.sin(ca);
      A.line(head[0] - ny * 2.6 * u, head[1] + nx * 2.6 * u, head[0] + ny * 2.6 * u, head[1] - nx * 2.6 * u, gill[1]);
      slab(A, domePts(head[0] + nx * 0.4 * u, head[1] + ny * 0.4 * u, 3 * u, 3 * u, ca), lil, { wide: u > 2.2 });
      spots(A, head[0] + nx * 2 * u, head[1] + ny * 2 * u, 1.6 * u, 1.6 * u, 3, 0.45 * u, '#f3e1b5', 4);
      tube(A, [sh, [lerp(sh[0], hand[0], 0.5) + 0.6 * u, lerp(sh[1], hand[1], 0.5) + 0.8 * u], hand], [1.2 * u, 0.9 * u], root, { tex: 2 });
      blob(A, [[hand[0], hand[1], 1.2 * u, 1.1 * u]], root);
      put(L, A, true);
      put(F.p, L, false);
      // the sleep bubble grows and shrinks on the breath; pops when it wakes
      if (idle || run) {
        const br = (idle ? [0.7, 1.3, 1.8, 1.1][P.i] : 0.8) * u, bxx = mx + 1.2 * u + br + lean * (oy - my), byy = my - 0.6 * u - br * 0.6;
        F.p.disc(bxx, byy, br, C('#c8a4dc', 120));
        F.p.ring(bxx, byy, br, C('#e6d0f0'), 1);
        F.p.set(R(bxx - br * 0.35), R(byy - br * 0.35), WHITE);
      }
      // the slam knocks loose a cloud of glowing spores
      if (w2) puff(F, head[0] + 1.6 * u, oy - 1.6 * u, 4 * u, '#c8a4dc', 7, 0.8);
      if (w1) for (let k = 0; k < 3; k++) lit(F, head[0] + (k - 1) * 1.4 * u, head[1] - 2.6 * u - k * 0.6 * u, o.c3 || '#c070ff');
    },
  },
  // Will-o'-Moth (spore_sprite): the marsh light that leads travellers off the path is a moth,
  // and its body is a dandelion clock. The fluff glows from a seed-heart inside; every wingbeat
  // shakes loose a lit seed that drifts down like a will-o'-the-wisp. Luna tails trail below.
  will_o_moth: {
    view: 'front', box: [30, 26], scale: 1.6, idle: 4, idleFps: 9, hover: true,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const lav = pal5('lavender', 5), lavD = pal5('lavender', 3).map((c) => C(c)), rs = pal5('rose', 5), fluff = pal5('sand', 6);
      const t = P.t, w1 = P.atk === 1, w2 = P.atk === 2, hurt = P.hurt;
      const cx = ox, cy = oy - 13 * u + (P.act === 'run' ? sin(t * 2) * 0.4 * u : 0);
      // wing beat: -1 high, +1 low
      const beat = w1 ? -1.3 : w2 ? 1.15 : hurt ? 0.7 : [-1, -0.25, 0.9, 0.2][P.i % 4];
      const L = layer(F);
      // a wing outline in local units (right side), rotated by the beat and squashed by foreshortening
      const place = (pts, sd, rootX, rootY, a, sq) => pts.map(([x, y]) => { const [rx, ry] = rot(x, y * sq, a); return [rootX + sd * rx, rootY + ry]; });
      const wingSide = (sd) => {
        const W = layer(F), torn = hurt && sd > 0;
        const a = beat * 0.42, sq = 1 - Math.abs(beat) * 0.25;
        // hind wing: a rose lobe ending in a long curling luna tail
        const Lh = 6.8 * u, hr = [cx + sd * 1 * u, cy + 1.2 * u];
        const hw = place([[0, 0], [0.7 * Lh, -0.05 * Lh], [1.05 * Lh, 0.4 * Lh], [0.85 * Lh, 0.85 * Lh], [0.45 * Lh, 0.95 * Lh], [0.1 * Lh, 0.55 * Lh]], sd, hr[0], hr[1], a * 0.6, sq);
        const tl = place(bez([[0.6 * Lh, 0.8 * Lh], [0.62 * Lh, 1.3 * Lh], [1.25 * Lh + (torn ? -0.3 * Lh : 0), 1.42 * Lh]], 10), sd, hr[0], hr[1], a * 0.6, 1);
        tube(W, tl, [0.6 * u, 0.35 * u], rs, { matte: true });
        slab(W, hw, rs, { wide: true });
        W.disc(tl[tl.length - 1][0], tl[tl.length - 1][1], Math.max(1, 0.7 * u), rs[2]);
        // fore wing: a long lilac triangle, darker outer margin, a staring eyespot near the apex
        const Lf = (torn ? 10 : 13) * u, fr = [cx + sd * 1.2 * u, cy - 0.8 * u];
        const outer = [[0, -0.05 * Lf], [0.45 * Lf, -0.36 * Lf], [1 * Lf, -0.5 * Lf], [1.02 * Lf, -0.2 * Lf], [0.86 * Lf, 0.14 * Lf], [0.42 * Lf, 0.26 * Lf], [0.05 * Lf, 0.16 * Lf]];
        const inner = [[0.1 * Lf, -0.02 * Lf], [0.45 * Lf, -0.28 * Lf], [0.86 * Lf, -0.38 * Lf], [0.86 * Lf, -0.16 * Lf], [0.72 * Lf, 0.06 * Lf], [0.4 * Lf, 0.16 * Lf], [0.1 * Lf, 0.1 * Lf]];
        slab(W, place(outer, sd, fr[0], fr[1], a, sq), lavD, { wide: true });
        slab(W, place(inner, sd, fr[0], fr[1], a, sq), lav);
        // veins fanning from the root
        for (const [vx, vy] of [[0.8, -0.36], [0.8, -0.1], [0.62, 0.12]]) { const [px, py] = place([[vx * Lf, vy * Lf]], sd, fr[0], fr[1], a, sq)[0]; W.line(fr[0] + sd * 1 * u, fr[1], px, py, lav[2]); }
        const [ex, ey] = place([[0.64 * Lf, -0.16 * Lf]], sd, fr[0], fr[1], a, sq)[0], er = Math.max(1.2, 1.5 * u * sq);
        W.disc(ex, ey, er + 1, rs[1]); W.disc(ex, ey, er, rs[3]); W.disc(ex, ey, er * 0.5, C(VOID)); W.set(R(ex - er * 0.35), R(ey - er * 0.4), WHITE);
        put(L, W, true);
      };
      wingSide(-1); wingSide(1);
      // a slim furry thorax behind the clock, little dangling legs
      blob(L, [[cx, cy + 1 * u, 1.8 * u, 4.4 * u]], lavD.map((c) => C(c)));
      for (const sd of [-1, 1]) L.line(cx + sd * 1.4 * u, cy + 4 * u, cx + sd * 2.2 * u, cy + 6.2 * u, lav[0]);
      put(F.p, L, false);
      // the dandelion clock: a see-through sphere of pappus; radiating filaments end in tufts
      const pr = (w1 ? 5.4 : w2 ? 4.8 : hurt ? 4.2 : 4.8) * u, rr = srand(5);
      const D = layer(F);
      blob(D, [[cx, cy, pr * 0.84, pr * 0.84]], fluff);
      const N = 30;
      for (let k = 0; k < N; k++) {
        if (hurt && k % 3 === 1) continue;
        const a = k / N * TAU + rr() * 0.12, d = pr * (1.02 + rr() * 0.14), litSide = Math.cos(a) * -0.5 + Math.sin(a) * -0.6 > -0.15;
        D.line(cx + Math.cos(a) * pr * 0.62, cy + Math.sin(a) * pr * 0.62, cx + Math.cos(a) * d, cy + Math.sin(a) * d, litSide ? fluff[4] : fluff[2]);
      }
      put(F.p, D, true);
      // the seed-heart glows through the fluff
      const core = w1 ? 2.4 : w2 ? 2.1 : 1.6;
      for (let yy = Math.floor(cy - pr); yy <= cy + pr; yy++) for (let xx = Math.floor(cx - pr); xx <= cx + pr; xx++) {
        const d = Math.hypot(xx + 0.5 - cx, yy + 0.5 - cy) / (core * u * 2);
        if (d < 1 && bay(xx, yy) < (1 - d) * 0.9) { F.p.set(xx, yy, C(ROT_M)); F.e.set(xx, yy, C(ROT_M, 200)); }
      }
      glow(F, cx, cy, core * u, ROT_G, { core: '#f6e39a' });
      // head: a fuzzy knob on top with two big compound eyes and plumed antennae (one bent)
      const hy = cy - pr * 0.92;
      const Hh = layer(F);
      blob(Hh, [[cx, hy, 2.4 * u, 1.9 * u]], lavD.map((c) => C(c)), { fur: 3 });
      const ant = (sd, bent) => {
        const p0 = [cx + sd * 1 * u, hy - 1.4 * u], tip = bent ? [cx + sd * 4.4 * u, hy - 4.4 * u] : [cx + sd * 4.6 * u, hy - 6.8 * u + (w1 ? -0.8 * u : 0)];
        const mid = bent ? [cx + sd * 2.6 * u, hy - 5.8 * u] : [cx + sd * 1.6 * u, hy - 5.8 * u];
        const P2 = bez([p0, mid, tip], 10);
        for (let k = 0; k < P2.length; k++) { Hh.set(R(P2[k][0]), R(P2[k][1]), lav[1]); if (k > 2 && k % 2 === 0) { Hh.set(R(P2[k][0] + sd), R(P2[k][1] - 1), lav[3]); Hh.set(R(P2[k][0] - sd), R(P2[k][1] - 1), lav[3]); } }
      };
      ant(-1, false); ant(1, true);
      put(F.p, Hh, true);
      for (const sd of [-1, 1]) {
        const ex = cx + sd * 1.2 * u, ey = hy + 0.1 * u;
        if (hurt) F.p.line(ex - 0.8 * u, ey, ex + 0.8 * u, ey, C(EYE_DK));
        else { F.p.ellipse(ex, ey, 1.1 * u, 1 * u, C(EYE_DK)); lit(F, ex - 0.3 * u * sd, ey - 0.3 * u, ROT_G); }
      }
      // shed seeds: lit pappus parachutes drifting down (and blasting out on the strike)
      const n = w2 ? 7 : 3;
      for (let k = 0; k < n; k++) {
        let x, y;
        if (w2) { const a = k / n * TAU + 0.3; x = cx + Math.cos(a) * pr * 1.8; y = cy + Math.sin(a) * pr * 1.6; }
        else { const ph = (t + k / n) % 1; x = cx + [-5, 1.5, 6][k] * u + sin(ph + k * 0.3) * 1.2 * u; y = cy + pr + 1.5 * u + ph * 6 * u; }
        lit(F, x, y, ROT_G); F.p.set(R(x - 1), R(y - 1), fluff[4]); F.p.set(R(x + 1), R(y - 1), fluff[4]); F.p.set(R(x), R(y - 1), fluff[3]);
      }
      F.mouth = [cx, cy];
    },
  },
  // Shrine Boar (elder_boar): an old forest boar that a village once enshrined and forgot. Moss
  // has grown over its back like a hillside and a little stone lantern still stands in it, lit
  // from inside; a straw shrine rope with paper streamers is knotted round its tusks. One tusk is
  // snapped off. When it charges the lantern flame roars up.
  shrine_boar: {
    view: 'side', box: [32, 22], pivot: 0.44, idleFps: 3,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const fur = pal5('wood', 5), furD = fur.map((c) => dark(c, 0.78)), moss = pal5('moss', 5), st = pal5('stone', 6);
      const snoutR = pal5('mauve', 7), rope = pal5('gold', 4), tusk = ramp(CREAM), hoof = pal5('wood', 4).map((c) => dark(c, 0.7));
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle';
      const w1 = P.atk === 1, w2 = P.atk === 2, hurt = P.hurt;
      const lunge = w2 ? 2.6 * u : w1 ? -1.2 * u : hurt ? -1.2 * u : 0;
      const bob = run ? -Math.abs(sin(t)) * 0.9 * u : idle ? sin(t) * 0.2 * u : w1 ? 0.8 * u : 0;
      const bx = ox + lunge, by = oy - 7.6 * u + bob;
      const L = layer(F);
      const leg = (lx, ph, far, front) => {
        const Lg = layer(F), Rl = far ? furD : fur;
        const hip = [lx, by + 1.6 * u];
        let dx = 0, lift = 0;
        if (run) [dx, lift] = stride(ph, 5 * u, 1.8 * u);
        else if (w1 && front && !far) { dx = 1.2 * u; lift = 1.8 * u; }
        else if (w2) dx = front ? 1.6 * u : -1.8 * u;
        const foot = [lx + dx, oy - lift - 0.9 * u];
        const knee = ik(hip, foot, 3 * u, 3.1 * u, front ? 1 : -1);
        tube(Lg, [hip, knee], [1.9 * u, 1.3 * u], Rl, { fur: 4 });
        tube(Lg, [knee, foot], [1.1 * u, 0.9 * u], Rl);
        slab(Lg, [[foot[0] - 1.1 * u, foot[1] - 0.2 * u], [foot[0] + 1.2 * u, foot[1] - 0.2 * u], [foot[0] + 1.5 * u, foot[1] + 0.9 * u], [foot[0] - 1.1 * u, foot[1] + 0.9 * u]], hoof);
        put(L, Lg, !far);
      };
      leg(bx + 4.4 * u, t + 0.5, true, true); leg(bx - 5.2 * u, t, true, false);
      // tail: a thin whip with a tuft
      const tw = run ? sin(t) * 1 * u : idle ? sin(t * 2) * 0.6 * u : 0;
      tube(L, bez([[bx - 8.4 * u, by - 1 * u], [bx - 10 * u, by - 0.4 * u + tw], [bx - 10.4 * u, by + 1.6 * u + tw]]), [0.5 * u, 0.4 * u], furD);
      blob(L, [[bx - 10.4 * u, by + 2.2 * u + tw, 0.8 * u, 1 * u]], furD);
      // body: a high hump of shoulder over a short barrel and rump
      const B = layer(F);
      blob(B, [[bx + 3.2 * u, by - 1.2 * u, 5.4 * u, 5 * u], [bx - 1.2 * u, by + 0.4 * u, 5.8 * u, 4 * u], [bx - 5.6 * u, by + 0.2 * u, 3.6 * u, 3.6 * u]], fur, { fur: 7 });
      // moss mantle over the back: a thick cushion with a ragged hem and a few tiny flowers
      const Mo = layer(F);
      blob(Mo, [[bx + 3 * u, by - 2.6 * u, 5.4 * u, 4.4 * u], [bx - 1.4 * u, by - 1.4 * u, 6 * u, 3.6 * u], [bx - 5.6 * u, by - 1.4 * u, 3.6 * u, 3 * u]], moss, { tex: 5 });
      for (let y = 0; y < Mo.h; y++) for (let x = 0; x < Mo.w; x++) {
        const hem = by - 0.6 * u + Math.sin(x * 0.9) * 0.6 * u + (hash2(x >> 1, 3, 9) - 0.5) * 1.2 * u - (x > bx + 5 * u ? (x - bx - 5 * u) * 0.5 : 0);
        if (y > hem) Mo.clear(x, y);
      }
      for (const [dx, dy, r] of [[-6.4, -3.6, 1.4], [-3.4, -4.6, 1.6], [2.4, -6.6, 1.5], [5.4, -6, 1.2], [-0.6, -5.4, 1.2]]) blob(Mo, [[bx + dx * u, by + dy * u, r * u, r * 0.8 * u]], moss, { tex: 6 });
      put(B, Mo, 'drop');
      for (const [dx, dy, c] of [[-4, -3.6, '#cc6a86'], [5, -5.2, '#a87cc0'], [-7, -2.4, '#e48fb0'], [1.6, -5.6, '#f3e1b5']]) { B.set(R(bx + dx * u), R(by + dy * u), C(c)); B.set(R(bx + dx * u + 1), R(by + dy * u), C(c)); B.set(R(bx + dx * u), R(by + dy * u - 1), light(c, 1.2)); }
      // bristle crest poking through the moss at the withers
      for (let k = 0; k < 5; k++) { const x = bx + (5 + k * 1) * u, y = by - (5.2 - k * 0.6) * u; B.line(x, y + 1.4 * u, x + 1 * u, y - 0.6 * u, furD[0]); B.line(x + 1, y + 1.4 * u, x + 1 + 1 * u, y - 0.4 * u, fur[1]); }
      put(L, B, true);
      // the stone lantern standing in the moss: plinth, post, firebox, swept roof, finial
      const lx = bx - 1.6 * u, ly = by - 4.8 * u;
      const Ln = layer(F), v = 0.95 * u;
      slab(Ln, [[lx - 2.2 * v, ly], [lx + 2.2 * v, ly], [lx + 1.8 * v, ly - 1 * v], [lx - 1.8 * v, ly - 1 * v]], st);
      slab(Ln, [[lx - 0.8 * v, ly - 0.9 * v], [lx + 0.8 * v, ly - 0.9 * v], [lx + 0.8 * v, ly - 3.2 * v], [lx - 0.8 * v, ly - 3.2 * v]], st);
      slab(Ln, [[lx - 2 * v, ly - 3 * v], [lx + 2 * v, ly - 3 * v], [lx + 2 * v, ly - 3.9 * v], [lx - 2 * v, ly - 3.9 * v]], st);
      const fb = ly - 3.9 * v, ft = fb - 3 * v;
      slab(Ln, [[lx - 1.7 * v, fb], [lx + 1.7 * v, fb], [lx + 1.7 * v, ft], [lx - 1.7 * v, ft]], st, { wide: true });
      // roof with upturned eaves
      slab(Ln, [[lx - 3.4 * v, ft + 0.2 * v], [lx - 2.6 * v, ft - 0.6 * v], [lx - 0.4 * v, ft - 2.4 * v], [lx + 0.4 * v, ft - 2.4 * v], [lx + 2.6 * v, ft - 0.6 * v], [lx + 3.4 * v, ft + 0.2 * v], [lx + 2.4 * v, ft + 0.1 * v], [lx - 2.4 * v, ft + 0.1 * v]], st, { wide: true });
      blob(Ln, [[lx, ft - 3 * v, 0.8 * v, 0.9 * v]], st);
      Ln.set(R(lx), R(ft - 3.9 * v), st[2]);
      // moss creeping up the plinth
      spots(Ln, lx - 1 * v, ly - 1.2 * v, 1.6 * v, 1 * v, 3, 0.6 * v, moss[3], 3);
      const tiltK = run ? sin(t + 0.25) * 0.08 : w2 ? -0.14 : w1 ? 0.08 : hurt ? -0.1 : 0;
      put(L, skew(Ln, tiltK, ly), true);
      // head: heavy wedge carried low, snout disc, small hot eye, ear
      const lift = w2 ? -1.8 * u : w1 ? 1.2 * u : hurt ? -1 * u : 0;
      const hx = bx + 8.2 * u, hy = by + 0.6 * u + lift;
      const H = layer(F);
      const ea = idle && P.i === 1 ? -0.8 * u : run ? -0.6 * u : 0;
      slab(H, [[hx - 2.4 * u, hy - 2.4 * u], [hx - 0.8 * u, hy - 2.8 * u], [hx - 2.6 * u + ea, hy - 5 * u]], furD);
      blob(H, [[hx, hy, 3.4 * u, 3 * u], [hx + 2.6 * u, hy + 0.9 * u, 2.4 * u, 1.9 * u]], fur, { fur: 8 });
      blob(H, [[hx + 4.9 * u, hy + 1 * u, 0.9 * u, 1.6 * u]], snoutR);
      H.set(R(hx + 5.1 * u), R(hy + 0.6 * u), C(VOID)); H.set(R(hx + 5.1 * u), R(hy + 1.6 * u), C(VOID));
      // mouth line and far tusk
      H.line(hx + 1.4 * u, hy + 2.6 * u, hx + 4.2 * u, hy + 2.2 * u, furD[0]);
      horn(H, [hx + 3 * u, hy + 2.2 * u], [hx + 5.6 * u, hy + 2.4 * u], [hx + 6.6 * u, hy - 1.6 * u], 1.4 * u, tusk.map((c) => dark(c, 0.86)));
      put(L, H, true);
      // the shrine rope knotted round both tusks, paper streamers below, then the near tusk (snapped short)
      const T = layer(F);
      const ra = [hx + 2.6 * u, hy + 2.8 * u], rb = [hx + 4.6 * u, hy + 2.2 * u];
      const sag = run ? 0.4 * u : 1 * u;
      const RP = bez([[ra[0] - 0.4 * u, ra[1]], [lerp(ra[0], rb[0], 0.5) - (run ? 1 * u : 0), ra[1] + sag + 1.4 * u], [rb[0] + 0.4 * u, rb[1]]], 12);
      tube(T, RP, 0.7 * u, rope, { rings: 2, ringC: rope[1] });
      blob(T, [[rb[0] + 0.2 * u, rb[1], 0.9 * u, 0.8 * u]], rope);
      // shide: zigzag paper streamers, blown back when running, swinging on the idle
      const sw = run ? -1 : w2 ? -0.7 : idle ? sin(t) * 0.35 : 0.1;
      [0.3, 0.7].forEach((f, k) => {
        const [sx0, sy0] = along(RP, f);
        let x = sx0, y = sy0 + 0.4 * u;
        for (let z = 0; z < 3; z++) {
          const nx = x + (z % 2 ? 0.6 : -0.6) * u + sw * 0.8 * u, ny = y + 0.9 * u - Math.abs(sw) * 0.25 * u;
          T.poly([[x - 0.4 * u, y], [x + 0.4 * u, y], [nx + 0.4 * u, ny], [nx - 0.4 * u, ny]], C(k ? '#e2c494' : '#efdab4'));
          T.set(R(nx + 0.3 * u), R(ny), C('#b08a64'));
          x = nx; y = ny;
        }
      });
      horn(T, [hx + 2.2 * u, hy + 2.4 * u], [hx + 5 * u, hy + 3 * u], [hx + 5.6 * u, hy - 0.6 * u], 1.9 * u, tusk);
      for (let y = R(hy - 1 * u); y < hy + 0.3 * u; y++) for (let x = R(hx + 4.4 * u); x < hx + 6.4 * u; x++) T.clear(x, y);
      T.line(hx + 4.8 * u, hy + 0.4 * u, hx + 5.8 * u, hy + 0.3 * u, tusk[1]);
      put(L, T, true);
      leg(bx - 4.4 * u, t + 0.5, false, false); leg(bx + 5.4 * u, t, false, true);
      put(F.p, L, false);
      // the lantern fire: a window of light in the firebox; it gutters when hurt and roars on the charge
      const fh = hurt ? 0.9 : w2 ? 3.8 : w1 ? 2.6 : 2.1 + (idle ? [0, 0.4, -0.2, 0.3][P.i] : 0.2);
      const [wx, wy] = [lx + (tiltK * (ly - (fb - 0.3 * v))), fb - 0.3 * v];
      F.p.rect(R(wx - 1 * v), R(fb - 2.5 * v), Math.max(2, R(2 * v)), Math.max(2, R(2.2 * v)), C('#3a0e10'));
      flame(F, wx, wy, fh * v, 1.9 * v, t + (w2 ? 0.3 : 0));
      // eye: a small ember under a heavy brow, squeezed shut when hurt
      if (hurt) F.p.line(hx + 0.6 * u, hy - 0.6 * u, hx + 2 * u, hy - 0.2 * u, C(EYE_DK));
      else eyeGlow(F, hx + 0.8 * u, hy - 0.9 * u, Math.max(2, 1.1 * u), Math.max(1, 0.8 * u), '#f8b848');
      F.p.line(hx - 0.2 * u, hy - 1.6 * u, hx + 2.4 * u, hy - 1 * u + (w1 || w2 ? 0.4 * u : 0), furD[0]);
    },
  },
  // Hillock Troll (moss_troll): from a distance it is a hummock in the meadow. Close up the hill
  // has a face under its turf brow, tiny ember eyes and two boulder fists. A rowan sapling, the old
  // charm against trolls, has rooted in its scalp and it has never noticed; a wren nests there and
  // bolts whenever the hill gets up.
  hillock_troll: {
    view: 'side', box: [30, 25], pivot: 0.44, idleFps: 2.5,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const moss = pal5('moss', 5), grass = pal5('grass', 6), skin = pal5('stone', 6), skinD = skin.map((c) => dark(c, 0.8));
      const bark = pal5('wood', 5), leaf = pal5('green', 5), st = pal5('stone', 5);
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle';
      const w1 = P.atk === 1, w2 = P.atk === 2, hurt = P.hurt;
      const breath = idle ? sin(t) * 0.35 * u : 0;
      const lean = run ? sin(t) * 0.04 : w1 ? -0.14 : w2 ? 0.12 : hurt ? -0.1 : 0;
      const shift = w2 ? 1.2 * u : w1 ? -1 * u : hurt ? -0.8 * u : run ? sin(t) * 0.4 * u : 0;
      const mx = ox - 1.2 * u + shift, my = oy - 9.4 * u - breath * 0.5;
      const L = layer(F);
      // arm with a boulder fist; hand positions per pose
      const handAt = (far) => {
        const k = far ? -1 : 1;
        if (w1) return [mx + (far ? 3.6 : 5.6) * u, oy - (far ? 20 : 21) * u];
        if (w2) return [mx + (far ? 11 : 12.4) * u, oy - 2 * u];
        if (hurt) return [mx + (far ? 7 : 9) * u, oy - 3.6 * u];
        if (run) { const [dx, lift] = stride(t + (far ? 0.5 : 0), 5 * u, 2.4 * u); return [mx + 10 * u + dx, oy - 2 * u - lift]; }
        return [mx + (far ? 9 : 10.6) * u + k * 0, oy - 2.1 * u];
      };
      const arm = (far) => {
        const A = layer(F), Rs = far ? skinD : skin;
        const sh = [mx + (far ? 4.4 : 5.6) * u, my + 1.2 * u], h = handAt(far);
        const el = ik(sh, h, 5.4 * u, 5.4 * u, w1 ? 1 : -1);
        tube(A, [sh, el], [2.6 * u, 2 * u], Rs, { tex: 3 });
        tube(A, [el, h], [2 * u, 1.8 * u], Rs, { tex: 3 });
        // the fist: a boulder with knuckle grooves and a tuft of moss on top
        const fr = w2 ? 3.4 : 3;
        blob(A, [[h[0] + 0.4 * u, h[1], fr * u, fr * 0.8 * u], [h[0] + 1.6 * u, h[1] + 0.6 * u, 1.8 * u, 1.6 * u]], Rs, { tex: 6 });
        for (let k = 0; k < 3; k++) A.line(h[0] + (1 + k * 0.9) * u, h[1] - 1.4 * u, h[0] + (1.4 + k * 0.9) * u, h[1] + 0.2 * u, Rs[1]);
        blob(A, [[h[0] - 0.4 * u, h[1] - 1.8 * u, 1.4 * u, 0.8 * u]], moss, { tex: 2 });
        put(L, A, !far);
      };
      arm(true);
      // stubby legs at the back
      const leg = (lx, ph, far) => {
        const Lg = layer(F), Rs = far ? skinD : skin;
        const [dx, lift] = run ? stride(ph, 3 * u, 1.2 * u) : [0, 0];
        const foot = [lx + dx, oy - lift - 1 * u];
        tube(Lg, [[lx, my + 6 * u], foot], [2.2 * u, 1.8 * u], Rs, { tex: 2 });
        blob(Lg, [[foot[0] + 0.8 * u, foot[1] + 0.2 * u, 2.2 * u, 1.1 * u]], Rs);
        put(L, Lg, !far);
      };
      leg(mx - 1 * u, t + 0.5, true);
      // the hill: a bare grey belly under a turf mantle with stones and flowers
      const B = layer(F);
      blob(B, [[mx + 1.2 * u, my + 3.4 * u, 7.6 * u, 5.2 * u], [mx + 5.6 * u, my + 1.4 * u, 4 * u, 4 * u]], skin, { tex: 4 });
      const T = layer(F);
      blob(T, [[mx, my, 9.6 * u, 8.6 * u + breath], [mx + 5 * u, my - 0.6 * u, 4.6 * u, 4.4 * u], [mx - 5 * u, my + 3 * u, 5 * u, 5 * u]], moss, { tex: 7 });
      // grassy crown band (lighter, top-left) and tussock tufts breaking the outline
      for (const [dx, dy, r] of [[-6, -5.8, 1.5], [-2.4, -8.4, 1.6], [2.6, -8, 1.4], [6.4, -5, 1.4], [-8.6, -1.4, 1.3]]) blob(T, [[mx + dx * u, my + dy * u, r * u, r * 0.8 * u]], grass.slice(1).concat([C('#94a866')]), { tex: 4 });
      // the turf hem: ragged where it hangs over the face and belly
      for (let y = 0; y < T.h; y++) for (let x = 0; x < T.w; x++) {
        const f = (x - mx) / u, hem = my + (f > 1 ? 2.8 - (f - 1) * 0.35 : 5.8 - f * 0.6) * u + (hash2(x >> 1, 7, 4) - 0.5) * 1.4 * u;
        if (y > hem && f > -6) T.clear(x, y);
      }
      // embedded stones and a scatter of meadow flowers
      for (const [dx, dy, r] of [[-4, -1.6, 1.3], [3.6, -3.4, 0.9]]) blob(T, [[mx + dx * u, my + dy * u, r * u, r * 0.8 * u]], st);
      for (const [dx, dy, c] of [[-1.6, -5.4, '#e48fb0'], [4.4, -6, '#c8a4dc'], [-6.4, -3, '#f3e1b5'], [1, -2.6, '#e48fb0'], [-3.6, 2, '#c8a4dc']]) { const x = R(mx + dx * u), y = R(my + dy * u); T.set(x, y, C(c)); T.set(x + 1, y, C(c)); T.set(x, y + 1, dark(c, 0.8)); }
      put(B, T, 'drop');
      put(L, skew(B, lean, oy), true);
      // the face under the turf brow: big pitted nose, underbite with two stub tusks, tiny eyes
      const fx = mx + 7.2 * u + lean * 9 * u, fy = my + 2.6 * u;
      const Fc = layer(F);
      const jaw = w1 ? 1.2 * u : w2 ? 0.8 * u : hurt ? 0.5 * u : 0;
      blob(Fc, [[fx + 0.6 * u, fy + 2.2 * u + jaw, 3 * u, 1.6 * u]], skin);
      if (jaw) Fc.ellipse(fx + 1 * u, fy + 1.4 * u + jaw * 0.5, 2.2 * u, jaw * 0.7 + 0.4 * u, C(MAW_D));
      horn(Fc, [fx + 0.4 * u, fy + 1.8 * u + jaw], [fx + 0.5 * u, fy + 0.6 * u + jaw], [fx + 0.2 * u, fy - 0.2 * u + jaw], 1.1 * u, ramp(CREAM));
      horn(Fc, [fx + 2.6 * u, fy + 1.6 * u + jaw], [fx + 2.8 * u, fy + 0.6 * u + jaw], [fx + 2.6 * u, fy + 0.1 * u + jaw], 0.9 * u, ramp(CREAM));
      blob(Fc, [[fx + 2.4 * u, fy - 0.6 * u, 2 * u, 1.7 * u]], skin, { tex: 9 });
      Fc.set(R(fx + 3.4 * u), R(fy + 0.4 * u), skin[0]); Fc.set(R(fx + 2.2 * u), R(fy - 1.2 * u), skin[1]);
      // brow overhang of turf
      blob(Fc, [[fx - 0.2 * u, fy - 2.4 * u, 3.4 * u, 1.2 * u]], moss, { tex: 5 });
      for (let k = 0; k < 4; k++) Fc.line(fx + (-2 + k * 1.3) * u, fy - 1.6 * u, fx + (-2.2 + k * 1.3) * u, fy - (0.8 + (k % 2) * 0.5) * u, moss[1]);
      put(L, Fc, true);
      // the rowan sapling: a thin trunk out of the crown, three leaf sprays, red berry clusters
      const sway = run ? sin(t + 0.3) * 1.4 * u : idle ? sin(t) * 0.6 * u : w1 ? -2 * u : w2 ? 2.4 * u : hurt ? -1.6 * u : 0;
      const base = [mx - 1.2 * u + lean * 18 * u, my - 8.2 * u], top = [base[0] + 1 * u + sway, base[1] - 7.4 * u];
      const S = layer(F);
      const SP = bez([base, [base[0] - 0.4 * u, base[1] - 4 * u], top], 12);
      tube(S, SP, [0.8 * u, 0.4 * u], bark);
      const sprays = [[0.55, -1, 2.4], [0.8, 1, 2.2], [1, 0, 2.6]];
      for (const [f, sd, r] of sprays) {
        const [x, y] = along(SP, f), lx = x + sd * 1.8 * u + sway * 0.2, ly = y - 0.8 * u;
        S.line(x, y, lx, ly, bark[2]);
        if (hurt && sd > 0) continue;
        blob(S, [[lx, ly, r * u, r * 0.6 * u], [lx + sd * 1 * u, ly + 0.4 * u, r * 0.6 * u, r * 0.45 * u]], leaf, { tex: 3 });
      }
      for (const [dx, dy] of [[-0.6, 1.2], [1.4, 0.4]]) { const [x, y] = along(SP, 0.82); S.disc(x + dx * u, y + dy * u, Math.max(1, 0.55 * u), C('#b04a3e')); S.set(R(x + dx * u - 0.3 * u), R(y + dy * u - 0.3 * u), C('#d9765a')); }
      put(L, S, true);
      leg(mx + 3 * u, t, false);
      arm(false);
      put(F.p, L, false);
      // tiny ember eyes under the brow (squeezed when hurt)
      for (const [ex, n] of [[fx - 0.4 * u, 1], [fx + 1.2 * u, 1]]) {
        if (hurt) F.p.line(ex - 0.4 * u, fy - 1.1 * u, ex + 0.4 * u, fy - 1.1 * u, C(EYE_DK));
        else { F.p.rect(R(ex - 0.5 * u), R(fy - 1.6 * u), Math.max(2, R(0.9 * u)), Math.max(2, R(0.8 * u)), C(VOID)); lit(F, ex, fy - 1.2 * u, '#f8b848'); }
      }
      // the wren: perched and bobbing, or bolting into the air when the hill heaves
      const [tx, ty] = along(SP, 0.72);
      const flown = w1 || w2 || hurt;
      const wx = flown ? tx - 4 * u + (w2 ? -2 * u : 0) : tx + 1.2 * u, wy = flown ? ty - 6 * u : ty - 0.9 * u + (idle && P.i % 2 ? -0.3 * u : 0);
      const wr = pal5('wood', 5);
      F.p.ellipse(wx, wy, 1.2 * u, 0.9 * u, wr[3]); F.p.ellipse(wx - 0.3 * u, wy - 0.3 * u, 0.6 * u, 0.4 * u, wr[4]);
      F.p.disc(wx + 0.9 * u, wy - 0.6 * u, 0.7 * u, wr[3]);
      F.p.set(R(wx + 1.6 * u), R(wy - 0.6 * u), C('#e8c35a'));
      F.p.set(R(wx + 1 * u), R(wy - 0.8 * u), C(EYE_DK));
      F.p.line(wx - 1 * u, wy - 0.2 * u, wx - 1.8 * u, wy - 1.4 * u, wr[2]);
      if (flown) { F.p.line(wx - 0.4 * u, wy - 0.6 * u, wx - 1.6 * u, wy - 2 * u + (P.atk === 2 ? 2.4 * u : 0), wr[2]); F.p.line(wx + 0.2 * u, wy - 0.6 * u, wx + 0.8 * u, wy - 2.2 * u + (P.atk === 2 ? 2.4 * u : 0), wr[4]); }
      // slam: a burst of turf and dust off the fists
      if (w2) { const h = handAt(false); puff(F, h[0] + 1 * u, oy - 1 * u, 3.4 * u, '#a8705a', 3, 0.7); for (let k = 0; k < 4; k++) F.p.rect(R(h[0] + (k - 1.5) * 1.8 * u), R(oy - 3 * u - (k % 2) * 1.6 * u), 2, 2, C(moss[2])); }
    },
  },
};
