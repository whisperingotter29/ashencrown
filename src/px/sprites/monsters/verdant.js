// Hand-built monster designs: the Verdant Wilds. See kit.js for the design format and
// docs/BESTIARY.md for the concepts. Rust earth, teal grass, rose and lavender flora; toxic green
// glows for rot, ember for shrine fire.
import { C, R, ramp, pal5, layer, put, blob, tube, horn, slab, facet, shard, wing, drape, ik, stride, sin, cos, lerp, clamp, bez, rot, glow, flame, eyeGlow, eyeBead, eyeBall, teeth, maw, spots, stripes, crack, over, rimLight, tint, light, dark, mixc, hash2, srand, cyl, WHITE, VOID, BONE, BONE_D, MAW, MAW_D, TONGUE, CREAM, INK } from './kit.js';

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
// cyl() shading on a layer already filled flat: light top-left edges, deep bottom-right (two bands)
const cylL = (L, Rm) => cyl(L, Rm, { wide: true });
const hurt0 = (P) => P.hurt;
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

// a pitcher plant jug along an axis from base (x, y) at angle a: bulb, waist, flared rim, lid.
// lid 0 shut .. 1 thrown wide. Returns the mouth centre.
function pitcher(F, L, x, y, a, len, w, lid, Rg, Rr, o = {}) {
  const ux = Math.cos(a), uy = Math.sin(a);
  const rf = (t) => (t < 0.32 ? lerp(0.68, 1, t / 0.32) : t < 0.78 ? lerp(1, 0.6, (t - 0.32) / 0.46) : lerp(0.6, 0.74, (t - 0.78) / 0.22)) * w;
  const pts = []; for (let k = 0; k <= 12; k++) pts.push([x + ux * len * k / 12, y + uy * len * k / 12]);
  const J = layer(F);
  tube(J, pts, rf, Rg, { tex: o.seed || 3 });
  // red mottling over the upper half, thickest under the rim
  const rr = srand(o.seed || 3);
  for (let k = 0; k < 14; k++) {
    const t = 0.4 + rr() * 0.55, side = (rr() - 0.5) * 1.6, r0 = rf(t);
    const px = x + ux * len * t - uy * side * r0, py = y + uy * len * t + ux * side * r0;
    over(J, px, py, Rr[t > 0.75 ? 1 : 2]); over(J, px + 1, py, Rr[2]); if (t > 0.6) over(J, px, py + 1, Rr[1]);
  }
  // the fringed wing running down the front of the jug
  for (let t = 0.15; t < 0.75; t += 0.07) { const r0 = rf(t) * 0.92, px = x + ux * len * t + uy * r0, py = y + uy * len * t - ux * r0; J.set(R(px), R(py), Rg[4]); J.set(R(px + uy * 1.2), R(py - ux * 1.2), Rg[2]); }
  put(L, J, true);
  // peristome: a ribbed red rim seen a little from above, a dark throat with a pool of glowing digestive fluid
  const mx = x + ux * len, my = y + uy * len, rw = rf(1) * 1.05;
  const P2 = layer(F);
  slab(P2, ellPts(mx, my, rw, rw * 0.5, a + Math.PI / 2), Rr, { wide: true });
  facet(P2, ellPts(mx + ux * 0.4, my + uy * 0.4, rw * 0.68, rw * 0.3, a + Math.PI / 2), MAW_D);
  for (let k = 0; k < 7; k++) { const th = Math.PI + k / 6 * Math.PI, px = mx + Math.cos(th) * rw * 0.86 * -uy + Math.sin(th) * rw * 0.43 * ux, py = my + Math.cos(th) * rw * 0.86 * ux + Math.sin(th) * rw * 0.43 * uy; over(P2, px, py, Rr[1]); }
  put(L, P2, true);
  // lid: hinged on the back of the rim, it lies over the mouth when shut and swings back when open
  const hx = mx + uy * rw * 0.9, hy = my - ux * rw * 0.9;      // hinge on the side facing up-left of the axis
  const la = a + Math.PI / 2 - 0.3 - lid * 1.9;
  const lc = [hx + Math.cos(la) * rw * 0.95 + ux * 0.6 * rw, hy + Math.sin(la) * rw * 0.95 + uy * 0.6 * rw];
  const Ld = layer(F);
  slab(Ld, ellPts(lc[0], lc[1], rw * 1.05, rw * 0.62, la), lid > 0.5 ? Rr : Rg, { wide: true });
  put(L, Ld, true);
  return [mx + ux * 0.4, my + uy * 0.4];
}

// enemy id -> { design, name, body? }: folded into src/data/enemies.js at integration
export const assign = {
  thornwolf: { design: 'briarback', name: 'Briarback' },
  fungal_shambler: { design: 'toadstool_trudger', name: 'Toadstool Trudger' },
  spore_sprite: { design: 'will_o_moth', name: "Will-o'-Moth" },
  elder_boar: { design: 'shrine_boar', name: 'Shrine Boar' },
  moss_troll: { design: 'hillock_troll', name: 'Hillock Troll' },
  giant_spider: { design: 'pitcher_spider', name: 'Pitcher Spider' },
  treant: { design: 'leshy', name: 'Leshy' },
  maze_warden: { design: 'topiary_warden', name: 'Topiary Warden' },
  rot_heart: { design: 'rot_heart', name: 'The Rot Heart' },
  spore_queen: { design: 'spore_queen', name: 'The Spore Queen' },
  broodmother: { design: 'broodmother', name: 'The Broodmother' },
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
    view: 'side', box: [30, 24], pivot: 0.44, idleFps: 2.5, scale: 0.84,
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
        if (w1) return [mx + (far ? 2.6 : 4.4) * u, oy - (far ? 18.4 : 19) * u];
        if (w2) return [mx + (far ? 11 : 12.4) * u, oy - 2 * u];
        if (hurt) return [mx + (far ? 7 : 9) * u, oy - 3.6 * u];
        if (run) { const [dx, lift] = stride(t + (far ? 0.5 : 0), 5 * u, 2.4 * u); return [mx + 10 * u + dx, oy - 2 * u - lift]; }
        return [mx + (far ? 10 : 12) * u + k * 0, oy - 2.1 * u];
      };
      const arm = (far) => {
        const A = layer(F), Rs = far ? skinD : skin;
        const sh = [mx + (far ? 3.6 : 4.6) * u, my + (w1 ? 3 : 5.6) * u], h = handAt(far);
        const el = ik(sh, h, 4.6 * u, 4.6 * u, w1 ? 1 : -1);
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
      const fx = mx + 7.6 * u + lean * 9 * u, fy = my + 1.2 * u;
      const Fc = layer(F);
      const jaw = w1 ? 1.2 * u : w2 ? 0.8 * u : hurt ? 0.5 * u : 0;
      const nose = pal5('mauve', 7), faceR = pal5('stone', 7);
      blob(Fc, [[fx, fy, 3 * u, 2.6 * u]], faceR, { tex: 3 });
      blob(Fc, [[fx + 0.8 * u, fy + 2.6 * u + jaw, 3 * u, 1.5 * u]], faceR);
      Fc.ellipse(fx + 1.2 * u, fy + 1.7 * u + jaw * 0.5, 2.4 * u, jaw * 0.6 + 0.45 * u, C(MAW_D));
      horn(Fc, [fx + 0.2 * u, fy + 2.4 * u + jaw], [fx + 0.3 * u, fy + 1.2 * u + jaw], [fx + 0 * u, fy + 0.4 * u + jaw], 1.1 * u, ramp(CREAM));
      horn(Fc, [fx + 2.8 * u, fy + 2.2 * u + jaw], [fx + 3 * u, fy + 1.2 * u + jaw], [fx + 2.8 * u, fy + 0.7 * u + jaw], 0.9 * u, ramp(CREAM));
      blob(Fc, [[fx + 2.8 * u, fy - 0.2 * u, 1.8 * u, 1.5 * u], [fx + 3.6 * u, fy + 0.4 * u, 1 * u, 0.9 * u]], nose);
      Fc.set(R(fx + 3.8 * u), R(fy + 0.9 * u), nose[0]);
      // brow overhang of turf
      blob(Fc, [[fx - 0.6 * u, fy - 2.4 * u, 3.6 * u, 1.3 * u]], moss, { tex: 5 });
      for (let k = 0; k < 4; k++) Fc.line(fx + (-2 + k * 1.3) * u, fy - 1.6 * u, fx + (-2.2 + k * 1.3) * u, fy - (0.8 + (k % 2) * 0.5) * u, moss[1]);
      if (w1) arm(false);
      put(L, Fc, true);
      // the rowan sapling: a thin trunk out of the crown, three leaf sprays, red berry clusters
      const sway = run ? sin(t + 0.3) * 1.4 * u : idle ? sin(t) * 0.6 * u : w1 ? -2 * u : w2 ? 2.4 * u : hurt ? -1.6 * u : 0;
      const base = [mx - 1.2 * u + lean * 18 * u, my - 8.2 * u], top = [base[0] + 1 * u + sway, base[1] - 6 * u];
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
      if (!w1) arm(false);
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
  // Pitcher Spider (giant_spider): a pitcher plant that learned to walk. Its abdomen is the jug,
  // red-mouthed and lidded, sloshing with glowing digestive fluid; its legs are vine tendrils that
  // curl at the tips. It flips the lid to spit sticky nectar-web, and bites with sap-green fangs.
  pitcher_spider: {
    view: 'side', box: [30, 22], pivot: 0.5, idleFps: 3,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const Rg = pal5('green', 5), Rr = pal5('red', 5), vine = pal5('moss', 5), vineD = pal5('moss', 4), body = pal5('plum', 5);
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle';
      const w1 = P.atk === 1, w2 = P.atk === 2, hurt = P.hurt;
      const lunge = w2 ? 2.6 * u : w1 ? -1 * u : hurt ? -1 * u : 0;
      const bob = run ? Math.abs(sin(t * 2)) * -0.5 * u : idle ? sin(t) * 0.25 * u : w1 ? -0.8 * u : 0;
      const bx = ox + lunge, by = oy - 7 * u + bob;
      const L = layer(F);
      // vine legs: hip on the cephalothorax, knee arched high, a curled tendril for a foot
      const legs = (far) => {
        const Lg = layer(F), Rl = far ? vineD : vine;
        for (let k = 0; k < 4; k++) {
          const hip = [bx + (1.4 + k * 1.2) * u + (far ? 0.6 * u : 0), by + 0.2 * u];
          const reach = [-8.6, -4.2, 4.6, 10.2][k] + (far ? -1 : 0);
          const ph = t + k * 0.25 + (far ? 0.5 : 0);
          let [dx, lift] = run ? stride(ph, 3.4 * u, 1.8 * u) : [0, 0];
          if (idle && k === 3 && !far && P.i === 2) lift = 1 * u;
          let foot = [hip[0] + reach * u + dx, oy - 0.4 * u - lift];
          if (w1 && k === 3) foot = [hip[0] + 6 * u, by - 6 * u + (far ? 1 * u : 0)];
          if (w2 && k === 3) foot = [hip[0] + 9 * u, oy - 2.6 * u + (far ? -1 * u : 0)];
          if (hurt) foot = [hip[0] + reach * 0.6 * u, oy - 1.4 * u];
          const knee = [lerp(hip[0], foot[0], 0.42), Math.min(hip[1], foot[1]) - (3.4 + Math.abs(reach) * 0.16 - (hurt ? 1.6 : 0)) * u];
          tube(Lg, [hip, knee], [0.75 * u, 0.55 * u], Rl, { rings: Math.max(3, R(1.6 * u)) });
          tube(Lg, [knee, foot], [0.55 * u, 0.35 * u], Rl);
          // a leaf at the knee and a curling tendril at the foot
          blob(Lg, [[knee[0] + (reach > 0 ? 0.6 : -0.6) * u, knee[1] - 0.6 * u, 0.9 * u, 0.5 * u]], Rg);
          const sd = reach > 0 ? 1 : -1;
          for (let a = 0; a < 4.2; a += 0.5) Lg.set(R(foot[0] + sd * (0.8 * u + Math.cos(a) * 0.8 * u * (1 - a / 6))), R(foot[1] - 0.8 * u - Math.sin(a) * 0.8 * u * (1 - a / 6)), Rl[2]);
        }
        put(L, Lg, !far);
      };
      legs(true); legs(false);
      // the pitcher abdomen tilted up and back; the lid opens on the wind-up and the jug tips on the spit
      const lid = w1 ? 1 : w2 ? 0.75 : hurt ? 0 : idle ? [0.1, 0.18, 0.1, 0.02][P.i] : 0.12;
      const ja = (w2 ? -1.45 : w1 ? -2.05 : hurt ? -1.75 : -1.9) + (run ? sin(t * 2) * 0.05 : 0);
      const mouth = pitcher(F, L, bx - 0.6 * u, by + 0.4 * u, ja, 9.6 * u, 3.8 * u, lid, Rg, Rr, { seed: 5 });
      // cephalothorax: a hunched plum body, sap-tipped fangs
      const B = layer(F);
      blob(B, [[bx + 3 * u, by - 0.4 * u, 3.6 * u, 2.8 * u], [bx + 5.8 * u, by - 0.2 * u, 2.4 * u, 2.2 * u]], body, { tex: 4 });
      for (let k = 0; k < 3; k++) B.line(bx + (1 + k * 1.4) * u, by - 2.6 * u, bx + (1.6 + k * 1.4) * u, by - 1.4 * u, body[1]);
      const fo = w2 ? 1.2 * u : w1 ? -0.4 * u : 0, fs = w1 ? 0.8 * u : 0;
      // chelicerae: two thick fangs hanging under the face, sap-green at the tips; spread on the wind-up
      for (const [dx, sh] of [[0, -1], [1.1, 1]]) {
        const r0 = [bx + (6.2 + dx) * u, by + 1 * u], tip = [bx + (7 + dx) * u + fo + sh * fs, by + 4 * u];
        tube(B, bez([r0, [r0[0] + 1.4 * u, r0[1] + 1.2 * u], tip]), [1.1 * u, 0.5 * u], body.map((c) => dark(c, 0.72)));
        B.set(R(tip[0]), R(tip[1]), Rg[4]); B.set(R(tip[0]), R(tip[1] - 1), Rg[3]);
      }
      put(L, B, true);
      put(F.p, L, false);
      // eyes: a cluster, two big and four small, red glow
      const ec = hurt ? '#f5afd6' : o.c3 || '#d45454';
      if (hurt) { F.p.line(bx + 4.8 * u, by - 1.2 * u, bx + 6.4 * u, by - 0.8 * u, C(EYE_DK)); }
      else {
        // glossy black domes, each with a red ember of light
        for (const [dx, dy, r] of [[5.8, -1.4, 0.95], [7.3, -0.8, 0.75], [4.6, -2.4, 0.55], [5.6, -2.9, 0.5], [6.7, -2.4, 0.5], [7.9, -1.7, 0.45]]) {
          const x = bx + dx * u, y = by + dy * u;
          F.p.disc(x, y, Math.max(0.8, r * u), C(VOID));
          lit(F, x - r * u * 0.3, y - r * u * 0.3, ec);
          if (r > 0.7) lit(F, x + r * u * 0.2, y - r * u * 0.3, ec);
        }
      }
      // the fluid in the throat glows; a drip hangs off the rim, and a glob flies on the spit
      if (lid > 0.5) { lit(F, mouth[0], mouth[1], ROT_G); lit(F, mouth[0] + 1, mouth[1], ROT_M); lit(F, mouth[0] - 1, mouth[1], ROT_M); }
      if (idle && P.i > 0) { const dy = [0, 1, 2.2, 3.4][P.i] * u; lit(F, mouth[0] + 2 * u, mouth[1] + 1 * u + dy, ROT_M); }
      if (w2) glow(F, mouth[0] + 3 * u, mouth[1] - 1.6 * u, 1.4 * u, ROT_M, { core: '#f6e39a' });
      F.mouth = [mouth[0], mouth[1]];
    },
  },
  // Leshy (treant): the lord of the deep wood. A stag's skull for a face, its antlers grown out
  // into living branches in leaf; a bark body, a beard of hanging moss, twig-fingered arms to the
  // knee. The knots in its bark are eyes too: they open one after another, the forest watching.
  leshy: {
    view: 'side', box: [24, 27], pivot: 0.42, idleFps: 2.5, scale: 0.66,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const bark = pal5('wood', 5), barkD = bark.map((c) => dark(c, 0.78)), bone = pal5('sand', 6), boneD = pal5('sand', 4);
      const moss = pal5('moss', 5), leaf = pal5('green', 5), gc = o.c3 || '#94d256';
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle';
      const w1 = P.atk === 1, w2 = P.atk === 2, hurt = P.hurt;
      const sway = idle ? sin(t) * 0.35 * u : run ? sin(t * 2) * 0.3 * u : 0;
      const lean = w1 ? -0.1 : w2 ? 0.16 : hurt ? -0.12 : run ? 0.05 : 0;
      const bx = ox + (w2 ? 1 * u : w1 ? -0.6 * u : hurt ? -0.8 * u : 0);
      const L = layer(F);
      const top = (y) => [bx + sway + (oy - y) * lean, y];
      // root legs
      const leg = (far, ph) => {
        const Lg = layer(F), Rl = far ? barkD : bark;
        const hip = top(oy - 9.6 * u); hip[0] += far ? -1.2 * u : 1 * u;
        let [dx, lift] = run ? stride(ph, 4.6 * u, 1.6 * u) : [w2 ? (far ? -1.6 : 2) * u : 0, 0];
        const foot = [bx + (far ? -1.4 : 1.2) * u + dx, oy - 1 * u - lift];
        const knee = ik(hip, foot, 5 * u, 5 * u, -1);
        tube(Lg, [hip, knee], [1.8 * u, 1.3 * u], Rl, { tex: 3 });
        tube(Lg, [knee, foot], [1.3 * u, 1.1 * u], Rl, { tex: 3 });
        for (const a of [-0.3, 0.4, 1.2]) horn(Lg, foot, [foot[0] + Math.cos(a) * 1.2 * u, foot[1] + 0.6 * u], [foot[0] + Math.cos(a) * 2.4 * u, foot[1] + 0.9 * u], 1 * u, Rl);
        put(L, Lg, !far);
      };
      // arms: long, twig fingers
      const arm = (far) => {
        const A = layer(F), Rl = far ? barkD : bark;
        const sh = top(oy - 16.4 * u); sh[0] += far ? -0.6 * u : 1.4 * u;
        let hand;
        if (w1 && !far) hand = [sh[0] - 1 * u, sh[1] - 7 * u];
        else if (w2 && !far) hand = [sh[0] + 8.4 * u, sh[1] + 5 * u];
        else if (hurt) hand = [sh[0] + (far ? 1 : 3) * u, sh[1] + 7 * u];
        else { const sw = run ? sin(t + (far ? 0.5 : 0)) * 2.4 * u : idle ? sin(t + (far ? 0.3 : 0)) * 0.5 * u : 0; hand = [sh[0] + 1.6 * u + sw, sh[1] + 9.4 * u]; }
        const el = ik(sh, hand, 5 * u, 5.2 * u, w1 && !far ? -1 : 1);
        tube(A, [sh, el], [1.3 * u, 1 * u], Rl, { tex: 5 });
        tube(A, [el, hand], [1 * u, 0.8 * u], Rl, { tex: 5 });
        // twig fingers fanning from the hand along the forearm direction
        const fa = Math.atan2(hand[1] - el[1], hand[0] - el[0]);
        for (const k of [-0.55, -0.1, 0.4]) { const a = fa + k * (w1 || w2 ? 1.6 : 1); A.line(hand[0], hand[1], hand[0] + Math.cos(a) * 2.6 * u, hand[1] + Math.sin(a) * 2.6 * u, Rl[2]); A.line(hand[0] + 1, hand[1], hand[0] + Math.cos(a) * 2.4 * u + 1, hand[1] + Math.sin(a) * 2.4 * u, Rl[1]); }
        put(L, A, !far);
        return hand;
      };
      arm(true); leg(true, t + 0.5);
      // bark body: hips, barrel chest hunched forward, shoulders; grain lines and glowing knots
      const B = layer(F);
      const hp = top(oy - 10.4 * u), ch = top(oy - 14.4 * u), shd = top(oy - 17 * u);
      blob(B, [[hp[0], hp[1], 3.2 * u, 2.8 * u], [ch[0] + 0.6 * u, ch[1], 4 * u, 4.2 * u], [shd[0] + 1 * u, shd[1], 3.6 * u, 2.4 * u]], bark, { tex: 6 });
      for (const dx of [-1.8, 0.6, 2.6]) for (let y = R(shd[1]); y < hp[1] + 2 * u; y += 1) { const x = R(lerp(shd[0], hp[0], (y - shd[1]) / (hp[1] - shd[1])) + dx * u + Math.sin(y * 0.4 + dx) * 0.6); if ((y >> 2) % 3) over(B, x, y, bark[1]); }
      put(L, B, true);
      leg(false, t);
      // the skull head on a short neck, antlers grown into leafy boughs
      const nod = w1 ? -1.4 * u : w2 ? 1.4 * u : hurt ? -1 * u : run ? sin(t * 2) * 0.3 * u : 0;
      const hx = shd[0] + 4 * u, hy = shd[1] - 1.8 * u + nod;
      const H = layer(F);
      tube(H, [[shd[0] + 1.6 * u, shd[1]], [hx - 0.6 * u, hy + 0.6 * u]], [2 * u, 1.6 * u], bark, { tex: 4 });
      // antlers: far then near, each a main beam back and up with three tines, leaves at the tips
      const antler = (Rm, ox2, s, fwd) => {
        const b0 = [hx - 0.4 * u + ox2, hy - 1.6 * u], tilt = w1 ? -1.2 * u : w2 ? 1 * u : 0;
        const beam = bez([b0, [b0[0] + (fwd ? 1.2 : -3) * u * s + tilt, b0[1] - 2.8 * u * s], [b0[0] + (fwd ? 2.6 : -1.4) * u * s + tilt, b0[1] - 8 * u * s]], 14);
        tube(H, beam, [0.7 * u, 0.35 * u], Rm);
        const tips = [beam[beam.length - 1]];
        const tines = fwd ? [[0.35, 2.2, -1.4], [0.65, 2.2, -1.8]] : [[0.25, 2.6, -1.2], [0.5, 2.8, -2.2], [0.75, 2.2, -2.4], [0.88, -1.8, -1.6]];
        for (const [f, dx, dy] of tines) {
          const b = along(beam, f), tp = [b[0] + dx * u * s + tilt * 0.4, b[1] + dy * u * s];
          horn(H, b, [lerp(b[0], tp[0], 0.6), lerp(b[1], tp[1], 0.3)], tp, 0.7 * u * s, Rm);
          tips.push(tp);
        }
        return tips;
      };
      const tipsF = antler(boneD, 1.2 * u, 0.85, true);
      const tipsN = antler(bone, 0, 1, false);
      // leaf tufts budding on some tips (shaken off when hurt)
      [...tipsF, ...tipsN].forEach(([x, y], k) => {
        if (k % 2 || (hurt && k % 4)) return;
        const fl = idle ? sin(t + k * 0.21) * 0.3 * u : run ? -0.4 * u : 0;
        blob(H, [[x + fl, y - 0.3 * u, 1 * u, 0.7 * u], [x + 0.7 * u + fl, y + 0.2 * u, 0.6 * u, 0.5 * u]], k < tipsF.length ? leaf.map((c) => dark(c, 0.85)) : leaf, { tex: k });
      });
      // skull: cranium and a long tapering muzzle, jaw opens on the wind-up and strike
      const jaw = w1 ? 0.45 : w2 ? 0.3 : hurt ? 0.2 : 0;
      blob(H, [[hx, hy, 2.4 * u, 2.1 * u]], bone);
      slab(H, [[hx + 0.6 * u, hy - 1.8 * u], [hx + 4.4 * u, hy + 0.4 * u], [hx + 4.8 * u, hy + 1.4 * u], [hx + 3.6 * u, hy + 1.6 * u], [hx + 0.4 * u, hy + 1.4 * u]], bone);
      const jr = [hx + 0.6 * u, hy + 1.6 * u], jt = [jr[0] + Math.cos(jaw) * 3.8 * u, jr[1] + Math.sin(jaw) * 3.8 * u];
      if (jaw) { H.poly([[jr[0], jr[1] - 0.4 * u], [hx + 4.4 * u, hy + 1.3 * u], jt], C(MAW_D)); teeth(H, [hx + 1.6 * u, hy + 1.4 * u], [hx + 4.2 * u, hy + 1.4 * u], 3, Math.max(1, 0.6 * u), 1, BONE_D); }
      tube(H, [jr, jt], [0.7 * u, 0.5 * u], boneD);
      // nasal slit and a crack
      H.line(hx + 2.6 * u, hy - 0.4 * u, hx + 3.8 * u, hy + 0.4 * u, boneD[1]);
      H.set(R(hx + 4.2 * u), R(hy + 0.6 * u), C(VOID));
      crack(H, hx - 1 * u, hy - 1.4 * u, 0.6, 2.4 * u, boneD[1], 4);
      // eye socket
      H.ellipse(hx + 0.7 * u, hy - 0.2 * u, 1.1 * u, 0.9 * u, C(VOID));
      // the moss beard hanging from the jaw, swaying
      const bs = idle ? sin(t + 0.2) * 0.6 * u : run ? -1 * u : w2 ? -1.2 * u : 0;
      for (let k = 0; k < 5; k++) {
        const x0 = hx - 0.6 * u + k * 0.9 * u, y0 = hy + 1.8 * u, ln = (4.4 + (k % 2) * 1.6 - k * 0.3) * u;
        tube(H, bez([[x0, y0], [x0 + bs * 0.5, y0 + ln * 0.6], [x0 + bs - 0.4 * u, y0 + ln]]), [0.9 * u, 0.4 * u], k % 2 ? moss.map((c) => dark(c, 0.88)) : moss);
      }
      put(L, H, true);
      const hand = arm(false);
      put(F.p, L, false);
      // glowing knots: bark eyes that open in turn on the idle; all wide on the attack
      const knots = [[-1.2, -13.4], [1.6, -11], [-0.4, -9.4], [2.2, -15.2]];
      knots.forEach(([dx, dy], k) => {
        const [x, y] = top(oy + dy * u); const kx = x + dx * u;
        const open = w1 || w2 || (idle ? (P.i + k) % 4 !== 0 : !hurt);
        F.p.ellipse(kx, y, 1 * u, 0.75 * u, barkD[0]);
        F.p.ring(kx, y, 1 * u, bark[4], 1);
        if (open) { lit(F, kx, y, gc); if (u > 2) lit(F, kx + 1, y, gc); }
        else F.p.line(kx - 0.6 * u, y, kx + 0.6 * u, y, bark[1]);
      });
      // the skull's eye: a green ember in the socket, guttering when hurt
      if (hurt) lit(F, hx + 0.8 * u, hy - 0.1 * u, '#4a6e36');
      else eyeGlow(F, hx + 0.4 * u, hy - 0.6 * u, Math.max(2, 0.9 * u), Math.max(2, 0.8 * u), gc);
      // a leaf tumbling down on the idle, a swirl of torn leaves on the swipe
      if (idle) { const lx = hx - 3 * u + sin(t) * 2 * u, ly = hy - 4 * u + t * 12 * u; F.p.rect(R(lx), R(ly), 2, 1, leaf[3]); F.p.set(R(lx), R(ly + 1), leaf[1]); }
      if (w2) for (let k = 0; k < 5; k++) { const a = -0.8 + k * 0.45, x = hand[0] + Math.cos(a) * 3.4 * u, y = hand[1] + Math.sin(a) * 3.4 * u; F.p.rect(R(x), R(y), 2, 2, leaf[k % 2 ? 4 : 2]); }
    },
  },
  // Topiary Warden (maze_warden): the garden labyrinth's guard, a box hedge clipped into a chess
  // knight on a carved plinth. It moves the way a knight moves, in hops; its arms are garden
  // shears that never stop snipping. A labyrinth glyph glows on the plinth.
  topiary_warden: {
    view: 'side', box: [26, 24], pivot: 0.42, idleFps: 4,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const hedge = pal5('green', 5), hedgeD = hedge.map((c) => dark(c, 0.8)), st = pal5('sand', 4), steel = pal5('steel', 6), wood = pal5('wood', 5);
      const gc = o.c3 || '#c1f798';
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle';
      const w1 = P.atk === 1, w2 = P.atk === 2, hurt = P.hurt;
      const hop = run ? [0, 3.2, 2.2, 0][P.i] * u : 0, squash = run && P.i === 3 ? 0.08 : run && P.i === 0 ? 0.04 : 0;
      const px = ox + (w2 ? 1.6 * u : w1 ? -0.6 * u : hurt ? -0.8 * u : 0), base = oy - hop;
      const lean = w1 ? -0.12 : w2 ? 0.14 : hurt ? -0.1 : run ? [0.04, -0.06, 0.06, 0.02][P.i] : 0;
      const L = layer(F);
      // the far shear arm, behind the hedge
      const shear = (far) => {
        const A = layer(F), Sr = far ? steel.map((c) => dark(c, 0.75)) : steel, Wr = far ? wood.map((c) => dark(c, 0.8)) : wood;
        const sh = [px + (far ? -0.6 : 1) * u, base - 9 * u];
        let H, a, open;
        if (w1) { H = [px + (far ? 2.4 : 3.6) * u, base - 13.4 * u]; a = -0.9; open = 0.9; }
        else if (w2) { H = [px + (far ? 7 : 8.4) * u, base - 8.4 * u]; a = 0.08; open = 0.02; }
        else if (hurt) { H = [px + (far ? 3.6 : 4.8) * u, base - 6 * u]; a = 0.9; open = 0.5; }
        else { H = [px + (far ? 4.8 : 6) * u, base - 7.4 * u + (run ? -hop * 0.2 : 0)]; a = 0.35; open = idle ? [0.15, 0.45, 0.15, 0.45][P.i] * (far ? 0.6 : 1) : 0.3; }
        // handles: two wooden grips running back into the hedge
        const back = a + Math.PI;
        for (const sd of [-1, 1]) { const ha = back + sd * open * 0.5; tube(A, [[H[0] + Math.cos(ha) * 4.2 * u, H[1] + Math.sin(ha) * 4.2 * u], H], [0.8 * u, 0.6 * u], Wr); }
        tube(A, [sh, [H[0] + Math.cos(back) * 3.6 * u, H[1] + Math.sin(back) * 3.6 * u]], [1.2 * u, 1 * u], far ? hedgeD : hedge, { tex: 2 });
        // blades: two long steel shards hinged at the pivot
        for (const sd of [-1, 1]) shard(A, H[0], H[1], a + sd * open * 0.5, 6 * u, 0.9 * u, Sr);
        A.disc(H[0], H[1], Math.max(1, 0.6 * u), C('#e8c35a'));
        put(L, A, true);
        return [H[0] + Math.cos(a) * 6 * u, H[1] + Math.sin(a) * 6 * u];
      };
      shear(true);
      // plinth: a moulded base block with a carved labyrinth glyph
      const Pl = layer(F);
      slab(Pl, [[px - 5 * u, base], [px + 5 * u, base], [px + 5 * u, base - 1.2 * u], [px - 5 * u, base - 1.2 * u]], st);
      slab(Pl, [[px - 4.1 * u, base - 1.1 * u], [px + 4.1 * u, base - 1.1 * u], [px + 4.1 * u, base - 3.4 * u], [px - 4.1 * u, base - 3.4 * u]], st, { wide: true });
      slab(Pl, [[px - 4.7 * u, base - 3.3 * u], [px + 4.7 * u, base - 3.3 * u], [px + 4.3 * u, base - 4.4 * u], [px - 4.3 * u, base - 4.4 * u]], st);
      spots(Pl, px - 4 * u, base - 0.8 * u, 1.6 * u, 0.8 * u, 3, 0.6 * u, '#557048', 2);
      if (hurt) crack(Pl, px + 2 * u, base - 3.4 * u, 1.6, 2.4 * u, st[0], 5);
      put(L, Pl, true);
      // the hedge knight: one clipped silhouette, lit flat planes and leafy clumps
      const by = base - 4.4 * u;
      const K = [[-3.6, 0], [3.8, 0], [3.4, -1.8], [2.6, -3.2], [3.2, -4.6], [4.6, -6], [6.4, -6.6], [6.9, -8.2], [6.2, -9.6], [4.2, -10.6], [3.6, -12], [2.8, -13.2], [2.1, -12], [1.3, -12.8], [0.5, -11.2], [-1.4, -10.2], [-2.6, -8.2], [-3.2, -5.6], [-3, -3], [-3.9, -1.4]];
      const Hd = layer(F);
      Hd.poly(K.map(([x, y]) => [px + x * u, by + y * u * (1 - squash)]), hedge[3]);
      // crenellated mane clipped into steps down the back
      for (let k = 0; k < 4; k++) { const x = px + (-1.6 - k * 0.55) * u, y = by + (-10 + k * 1.5) * u; Hd.rect(R(x - 1.2 * u), R(y), R(1.4 * u), R(1.1 * u), hedge[3]); }
      // collar ring round the base of the piece
      Hd.ellipse(px + 0.1 * u, by - 0.4 * u, 4.4 * u, 1.2 * u, hedge[3]);
      const Hs = skew(Hd, lean, by);
      // shade: lit top-left planes, deep bottom-right, then leafy clumps over everything
      const T2 = layer(F); for (let i = 0; i < Hs.d.length; i += 4) if (Hs.d[i + 3]) { T2.d[i] = hedge[3][0]; T2.d[i + 1] = hedge[3][1]; T2.d[i + 2] = hedge[3][2]; T2.d[i + 3] = 255; }
      cylL(T2, hedge);
      for (let y = 0; y < T2.h; y++) for (let x = 0; x < T2.w; x++) {
        if (!T2.a(x, y)) continue;
        const n = hash2(Math.floor((x + ((y >> 1) & 1) * 2) / 3), y >> 1, 21);
        if (n > 0.86) T2.set(x, y, hedge[4]); else if (n < 0.12) T2.set(x, y, hedge[1]);
      }
      // the clipped collar line and the cheek plane
      for (let x = R(px - 4 * u); x < px + 4.2 * u; x++) over(T2, x + lean * 0.4 * u, R(by + 0.6 * u), hedge[1]);
      put(L, T2, true);
      shear(false);
      put(F.p, L, false);
      // eye: a clipped hollow with a green light deep in it; nostril; the glyph on the plinth
      const sk = (x, y) => [x + (by - y) * lean, y];
      const [ex, ey] = sk(px + 3.4 * u, by - 9 * u);
      F.p.ellipse(ex, ey, 1.2 * u, 0.9 * u, C(hedgeD[0]));
      if (hurt) lit(F, ex, ey, '#557048');
      else eyeGlow(F, ex - 0.4 * u, ey - 0.3 * u, Math.max(2, 1 * u), Math.max(2, 0.8 * u), gc);
      const [nx, ny] = sk(px + 6.2 * u, by - 7.6 * u); F.p.rect(R(nx), R(ny), 2, 2, C(hedgeD[0]));
      // labyrinth glyph: a small square spiral of light, brighter on the attack
      const gx = px - 1.4 * u, gy = base - 1.5 * u, gs = Math.max(0.6, u * 0.45), gcol = w1 || w2 ? gc : mixc(C(gc), C(st[1]), 0.35);
      const spiral = [[0, 0], [6, 0], [6, 4], [0, 4], [0, 2], [4, 2]];
      for (let k = 1; k < spiral.length; k++) { const [a0, b0] = spiral[k - 1], [a1, b1] = spiral[k]; F.p.line(gx + a0 * gs, gy - b0 * gs, gx + a1 * gs, gy - b1 * gs, gcol); F.e.line(gx + a0 * gs, gy - b0 * gs, gx + a1 * gs, gy - b1 * gs, gcol); }
      // clippings: leaves fly when it snips or is hit; dust puffs when it lands a hop
      if (w2 || hurt) for (let k = 0; k < 6; k++) { const x = px + (w2 ? 8 + k * 0.9 : 1 + k * 1.2) * u, y = by - (w2 ? 4 + (k % 3) * 1.6 : 12 - k * 0.8) * u; F.p.rect(R(x), R(y), 2, 2, hedge[k % 2 ? 4 : 2]); }
      if (run && P.i === 3) puff(F, px, oy - 0.6 * u, 4.4 * u, '#a8705a', 11, 0.55);
    },
  },
  // The Rot Heart (rot_heart): the forest's heart, gone to rot. A ribbed gourd grown into the
  // shape of a heart, a lopsided jack-o'-lantern grin carved into it and lit from inside with
  // green rot-light. Its arteries are vines; three of them rise into a crown of seed pods that
  // glow with every beat (the weak points). It waddles on its roots, and flies keep it company.
  rot_heart: {
    view: 'front', box: [30, 34], idle: 6, idleFps: 5,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const flesh = pal5('red', 5), rotR = pal5('mauve', 4), vine = pal5('green', 4), vineD = pal5('green', 3), root = pal5('wood', 5);
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle';
      const w1 = P.atk === 1, w2 = P.atk === 2, hurt = P.hurt;
      // the beat: lub-dub then rest
      const beat = idle ? [0.06, -0.05, 0.04, 0, -0.015, 0][P.i] : w1 ? 0.1 : w2 ? -0.08 : hurt ? -0.06 : 0;
      const kx = 1 + beat * 0.6 + (w2 ? 0.08 : 0), ky = 1 + beat - (w2 ? 0.04 : 0);
      const glowK = idle ? [1, 0.6, 0.9, 0.45, 0.4, 0.45][P.i] : w1 ? 1.2 : w2 ? 1.1 : hurt ? 0.2 : 0.6;
      const lean = run ? sin(t) * 0.07 : hurt ? -0.05 : 0;
      const cx = ox + (run ? sin(t) * 0.6 * u : 0), cy = oy - 14.4 * u - (run ? Math.abs(sin(t)) * 0.8 * u : 0) + (w2 ? 1 * u : 0);
      const L = layer(F);
      // roots: two behind, three in front; a waddle steps them
      const rootLeg = (x0, x1, far, ph) => {
        const Rg = layer(F), Rr = far ? root.map((c) => dark(c, 0.78)) : root;
        const lift = run ? Math.max(0, sin(t + ph)) * 1.4 * u : 0;
        const a = [cx + x0 * u, cy + 4 * u], b = [cx + x1 * u, oy - 0.8 * u - lift];
        tube(Rg, bez([a, [lerp(a[0], b[0], 0.2), lerp(a[1], b[1], 0.7)], b]), [2 * u, 1.1 * u], Rr, { tex: 3 });
        for (const d of [-1.4, 0, 1.4]) horn(Rg, b, [b[0] + d * 1 * u, b[1] + 0.4 * u], [b[0] + d * 2 * u, b[1] + 0.9 * u], 0.9 * u, Rr);
        put(L, Rg, !far);
      };
      rootLeg(-3.4, -9.6, true, 0.5); rootLeg(4, 10, true, 0); rootLeg(-2, -5.6, false, 0); rootLeg(2.6, 6.6, false, 0.5);
      // the crown: three artery-vines rising out of the top, each ending in a glowing seed pod
      const crown = [[-1.2, -5, -7.4, -0.5], [0, 0.6, -10, 0.2], [1.2, 5.4, -6.6, 0.4]];
      const pods = [];
      const Cr = layer(F);
      crown.forEach(([x0, x1, h, ph], k) => {
        const sw = idle ? sin(t + ph) * 0.5 * u : run ? sin(t + ph) * 1.2 * u : w1 ? 0 : w2 ? (k - 1) * 1.6 * u : 0;
        const a = [cx + x0 * u * kx, cy - 6.6 * u * ky], b = [cx + (x1 + (k - 1) * (w1 ? 1.4 : 0)) * u + sw, cy + (h - 8 - (w1 ? 2 : 0)) * u * ky];
        const PP = bez([a, [a[0] + (k - 1) * 0.6 * u, lerp(a[1], b[1], 0.6)], b], 14);
        tube(Cr, PP, [1.5 * u, 0.9 * u], vine, { tex: 4 + k });
        // a leaf off each stalk
        const lp = along(PP, 0.5), sd = k === 0 ? -1 : 1;
        blob(Cr, [[lp[0] + sd * 1.6 * u, lp[1] - 0.4 * u, 1.6 * u, 0.8 * u]], vine);
        pods.push(b);
      });
      put(L, Cr, true);
      // the heart-gourd: two upper lobes, a full belly, a lopsided tip; ribbed, rotting low down
      const H = layer(F);
      const lobes = [[cx - 5.2 * u * kx, cy - 4.4 * u * ky, 6.6 * u * kx, 6.2 * u * ky], [cx + 5 * u * kx, cy - 4 * u * ky, 6.2 * u * kx, 5.8 * u * ky], [cx, cy + 1 * u * ky, 9.4 * u * kx, 6.4 * u * ky], [cx + 0.6 * u, cy + 5.6 * u * ky, 6 * u * kx, 4.6 * u * ky], [cx + 1 * u, cy + 9.2 * u * ky, 2.8 * u * kx, 3 * u * ky]];
      blob(H, lobes, flesh, { tex: 9 });
      // gourd ribs: dark grooves with a lit lip, following the curve of the belly
      for (let y = 0; y < H.h; y++) for (let x = 0; x < H.w; x++) {
        if (!H.a(x, y)) continue;
        const ny = (y + 0.5 - cy) / (11 * u * ky), w = Math.sqrt(Math.max(0.05, 1 - ny * ny)), nx = (x + 0.5 - cx) / (10.6 * u * kx * w);
        for (const r of [-0.72, -0.36, 0.04, 0.42, 0.76]) {
          const d = (nx - r) * 10.6 * u * kx * w;
          if (d >= 0 && d < 1) H.set(x, y, flesh[1]);
          else if (d >= 1 && d < 2 && ny < 0.3) H.set(x, y, flesh[4]);
        }
      }
      // rot: the lower part darkens toward mauve-brown, with mould patches
      for (let y = R(cy + 4 * u); y < H.h; y++) for (let x = 0; x < H.w; x++) {
        if (!H.a(x, y)) continue;
        const n = hash2(Math.floor((x + ((y >> 1) & 1) * 2) / 3), y >> 1, 33);
        if (n < (y - cy - 4 * u) / (7 * u)) H.set(x, y, rotR[n < 0.2 ? 1 : 2]);
      }
      spots(H, cx - 6.4 * u, cy + 4 * u, 2.4 * u, 2 * u, 5, 0.9 * u, '#a29c9c', 7);
      spots(H, cx + 7.6 * u, cy - 1 * u, 1.6 * u, 2 * u, 4, 0.8 * u, '#a29c9c', 8);
      spots(H, cx - 6.4 * u, cy + 4 * u, 1.6 * u, 1.4 * u, 3, 0.5 * u, '#c4bdb6', 9);
      // the gourd stem stump between the lobes, where the arteries leave
      blob(H, [[cx + 0.1 * u, cy - 7.6 * u * ky, 2 * u, 1.6 * u]], vineD);
      // carved eyes (one bigger) and the jagged grin, cut through to the light
      const eye = (ex, ey, sz, sl) => [[ex - sz, ey + sz * 0.5 + sl], [ex + sz, ey + sz * 0.5 - sl], [ex + sz * 0.2, ey - sz * 0.8]];
      const squint = hurt ? 0.35 : w1 ? 0.75 : 1;
      const eL = eye(cx - 4.6 * u, cy - 3.6 * u, 3.2 * u, -0.9 * u).map(([x, y]) => [x, lerp(cy - 3.8 * u, y, squint)]);
      const eR = eye(cx + 4.4 * u, cy - 3.2 * u, 2.5 * u, 0.7 * u).map(([x, y]) => [x, lerp(cy - 3.2 * u, y, squint)]);
      const open = w2 ? 2 : w1 ? 0.35 : hurt ? 0.6 : run ? 0.9 : idle ? [1.25, 1.05, 1.15, 1, 1, 1][P.i] : 1;
      const gy = cy + 2.6 * u, gw = 7 * u * kx;
      // a lopsided jack-o'-lantern grin: fangs down from the top lip, pegs up from the bottom
      const grinTop = [], grinBot = [];
      const N = 10;
      for (let k = 0; k <= N; k++) {
        const f = k / N, x = cx - gw + f * gw * 2, curve = Math.sin(f * Math.PI) * 2.2 * u - f * 0.8 * u;
        grinTop.push([x, gy - 1.4 * u * open + curve * 0.4 + (k % 2 && k > 1 && k < N - 1 ? 1.6 * u : 0)]);
        grinBot.push([x, gy + 1.4 * u * open + curve + (k % 2 === 0 && k > 1 && k < N - 1 ? -1.4 * u * Math.min(1, open) : 0)]);
      }
      const grin = [...grinTop, ...grinBot.slice().reverse()];
      const cut = (pts) => { facet(H, pts, flesh[0]); };
      cut(eL); cut(eR); cut(grin);
      put(L, H, true);
      // side arteries: vines wrapping down over the shoulders
      const V = layer(F);
      for (const [sd, ph] of [[-1, 0], [1, 0.4]]) {
        const P2 = bez([[cx + sd * 0.8 * u, cy - 7 * u * ky], [cx + sd * 8 * u * kx, cy - 12 * u * ky], [cx + sd * 12.6 * u * kx, cy - 2 * u + (idle ? sin(t + ph) * 0.3 * u : 0)], [cx + sd * 7.4 * u * kx, cy + 7 * u * ky]], 18);
        tube(V, P2, [0.9 * u, 0.45 * u], vineD, { tex: 2 });
        for (const f of [0.3, 0.75]) { const q = along(P2, f); blob(V, [[q[0] + sd * 1 * u, q[1] - 0.3 * u, 1 * u, 0.6 * u]], vine); }
      }
      put(L, V, true);
      put(F.p, skew(L, lean, oy), false);
      // the light inside: the cut-outs glow rot-green, brightest on the beat
      const g = (k) => (glowK >= k ? ROT_G : glowK >= k * 0.6 ? ROT_M : ROT_D);
      const fillGlow = (pts) => {
        const T = layer(F); T.poly(pts, C(ROT_D));
        const T2 = skew(T, lean, oy);
        for (let y = 0; y < T2.h; y++) for (let x = 0; x < T2.w; x++) {
          if (!T2.a(x, y)) continue;
          const rim = !T2.a(x, y - 1) || !T2.a(x - 1, y), edge = !T2.a(x + 1, y) || !T2.a(x, y + 1);
          const deep = T2.a(x, y - 3) && T2.a(x - 2, y) && T2.a(x + 2, y) && T2.a(x, y + 2);
          const c = rim ? C(flesh[0]) : edge ? C(ROT_D) : deep ? C(g(0.8)) : C(g(1.4));
          F.p.set(x, y, c); if (!rim) F.e.set(x, y, c);
        }
      };
      fillGlow(eL); fillGlow(eR); fillGlow(grin);
      // the pods: glowing seed bulbs, the weak points, pulsing with the beat
      pods.forEach(([x, y], k) => {
        const [sx2] = [x + (oy - y) * lean];
        const r = (1.9 + (w1 ? 0.7 : 0) + beat * 6) * u;
        F.p.ellipse(sx2, y, r + 1, r * 1.2 + 1, C(vineD[1]));
        glow(F, sx2, y, r, glowK > 0.8 ? ROT_G : ROT_M, { core: '#f6e39a', halo: w1 || (idle && P.i === 0) });
        F.p.line(sx2 - r * 0.6, y - r * 1.1, sx2, y - r * 1.5, C(vineD[0]));
      });
      // ooze from the corners of the grin; flies circling
      if (!hurt) for (const [sd, ph] of [[-1, 0], [1, 0.5]]) { const d = ((t + ph) % 1) * 3 * u, x = cx + sd * (gw - 0.6 * u), y = gy + 1.6 * u + d; lit(F, x, y, ROT_M); lit(F, x, y + 1, ROT_M); }
      for (let k = 0; k < 3; k++) { const a = (t + k / 3) * TAU, x = cx + Math.cos(a) * 12 * u, y = cy - 9 * u + Math.sin(a) * 3 * u + k * 2 * u; F.p.rect(R(x), R(y), 2, 1, C(EYE_DK)); F.p.set(R(x), R(y - 1), C('#a29c9c')); }
      // the burst: a cloud of rot spores out of the grin
      if (w2) { puff(F, cx, gy + 1 * u, 7 * u, '#94a866', 13, 0.7); for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; glow(F, cx + Math.cos(a) * 13 * u, cy + Math.sin(a) * 9 * u, 1 * u, ROT_G); } }
      F.mouth = [cx, gy];
    },
  },
  // The Spore Queen (spore_queen): a mushroom lady. Her skirt is a great plum cap whose gills fall
  // to the ground like petticoats; a lace veil of fungal net (the veiled-lady stinkhorn) hangs from
  // a crown of glowing toadstools. A porcelain face that never quite wakes. Three puff-ball
  // attendants bob round her hem and cough spores when she commands.
  spore_queen: {
    view: 'front', box: [34, 38], idle: 6, idleFps: 4,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const cap = pal5('plum', 5), gill = pal5('rose', 5), skin = ramp('#c8a4dc'), lace = C('#efdab4'), puffR = pal5('sand', 6), puffT = pal5('gold', 4);
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle';
      const w1 = P.atk === 1, w2 = P.atk === 2, hurt = P.hurt;
      const sway = idle ? sin(t) * 0.5 * u : run ? sin(t) * 0.8 * u : 0;
      const lean = run ? 0.04 * sin(t) : hurt ? -0.06 : 0;
      const flare = w2 ? 1.18 : w1 ? 1.06 : 1;
      const cx = ox, wy = oy - 15 * u - (w1 ? 1 * u : 0);   // waist
      const glowK = w1 || w2 ? 1.3 : hurt ? 0.3 : idle ? [1, 0.85, 0.7, 0.75, 0.9, 1][P.i] : 0.9;
      const L = layer(F);
      // puff-ball attendants (the far one first)
      const puffs = [[-13.6, -3, 0], [13.4, -4.4, 0.33], [-11, -22, 0.66]];
      const attendant = ([dx, dy, ph], k) => {
        const bob = idle ? Math.abs(sin(t + ph)) * -1.6 * u : run ? Math.abs(sin(t * 2 + ph)) * -1.2 * u : w1 ? -2.4 * u : w2 ? -0.6 * u : 0;
        const x = cx + dx * u * (w2 ? 1.1 : 1), y = oy + dy * u + bob - 2.2 * u, r = (k === 2 ? 2 : 2.6) * u;
        const A = layer(F);
        blob(A, [[x, y, r, r * 0.92]], puffR);
        spots(A, x - r * 0.2, y - r * 0.5, r * 0.6, r * 0.35, 4, 0.4 * u, puffT[2], k + 3);
        A.set(R(x - r * 0.5), R(y - r * 0.55), C(WHITE));
        // a tiny face: two dots and an o
        A.rect(R(x - 0.9 * u), R(y), Math.max(1, R(0.5 * u)), Math.max(1, R(0.6 * u)), C(EYE_DK)); A.rect(R(x + 0.5 * u), R(y), Math.max(1, R(0.5 * u)), Math.max(1, R(0.6 * u)), C(EYE_DK));
        if (w2) A.disc(x, y + 1 * u, Math.max(0.8, 0.5 * u), C(MAW_D));
        put(F.p, A, false);
        if (w2) puff(F, x, y - r * 1.2, 2.6 * u, '#94a866', 20 + k, 0.7);
        else if (idle && (P.i + k * 2) % 6 === 0) for (let q = 0; q < 3; q++) lit(F, x + (q - 1) * 0.8 * u, y - r - (1 + q) * 0.8 * u, ROT_M);
      };
      // arms (drawn behind the skirt edge when lowered)
      const arm = (sd) => {
        const A = layer(F);
        const sh = [cx + sd * 3 * u + sway * 0.2, wy - 6.6 * u];
        const hand = w1 ? [cx + sd * 4.6 * u, wy - 16.6 * u] : w2 ? [cx + sd * 12.6 * u, wy - 8.6 * u] : hurt ? [cx + sd * 5 * u, wy - 1.6 * u] : [cx + sd * 7 * u + sway * 0.5, wy + 0.4 * u + (idle ? sin(t + sd * 0.25) * 0.6 * u : 0)];
        const el = ik(sh, hand, 4.6 * u, 4.8 * u, sd > 0 ? (w1 ? -1 : 1) : (w1 ? 1 : -1));
        tube(A, [sh, el], [0.9 * u, 0.7 * u], skin);
        tube(A, [el, hand], [0.7 * u, 0.5 * u], skin);
        // hyphae sleeves: threads trailing from the forearm
        for (let f = 0.2; f < 0.95; f += 0.25) { const q = [lerp(el[0], hand[0], f), lerp(el[1], hand[1], f)]; A.line(q[0], q[1], q[0] - sd * 0.4 * u + sway * 0.3, q[1] + (2.4 + f * 1.4) * u, C(lace, 200)); }
        // long fingers
        const fa = Math.atan2(hand[1] - el[1], hand[0] - el[0]);
        for (const k of [-0.4, 0, 0.4]) A.line(hand[0], hand[1], hand[0] + Math.cos(fa + k) * 1.6 * u, hand[1] + Math.sin(fa + k) * 1.6 * u, skin[3]);
        put(L, A, true);
        return hand;
      };
      attendant(puffs[2], 2);
      const hx = cx + sway * 0.3 + (hurt ? -0.6 * u : 0), hy = wy - 10.4 * u + (hurt ? 0.6 * u : 0);
      // the skirt: a domed cap from the waist to the knee, then the gill fringe down to the ground
      const S = layer(F);
      const capH = 9.6 * u, rimY = wy + capH, rimW = 12 * u * flare;
      // gill petticoat: a bell of radiating rose pleats, hem waving
      const G = layer(F);
      const hem = (x) => oy - 0.8 * u + Math.sin((x - cx) / u * 0.9 + t * TAU) * (run || w2 ? 0.9 : 0.5) * u - (w2 ? 1.4 * u : 0);
      for (let y = R(rimY - 1 * u); y < oy + 1; y++) {
        const f = (y - rimY) / (oy - rimY), hw = rimW * (0.9 + f * 0.22);
        for (let x = Math.floor(cx - hw); x <= cx + hw; x++) {
          if (y > hem(x)) continue;
          const a = Math.atan2(x - cx, (y - (wy + 2 * u)) * 1.4), band = Math.floor(a * 14 + 100) % 2;
          G.set(x, y, gill[band ? 2 : 3]);
          if (Math.abs(x - cx) > hw - 1.5 * u) G.set(x, y, gill[1]);
        }
      }
      for (let x = Math.floor(cx - rimW * 1.1); x <= cx + rimW * 1.1; x++) { const y = R(hem(x)); if (G.a(x, y)) G.set(x, y, gill[4]); }
      put(S, G, false);
      // the cap: plum dome with cream warts, a lit rim, a drooping edge
      const Cp = layer(F);
      blob(Cp, [[cx, rimY, rimW, capH * 1.05], [cx, rimY - capH * 0.4, rimW * 0.72, capH * 0.8]], cap, { clipY: R(rimY + 0.8 * u) });
      for (let x = Math.floor(cx - rimW); x <= cx + rimW; x++) { const y = R(rimY + 0.8 * u - Math.abs(Math.sin((x - cx) / u * 0.7)) * 0.6 * u); if (Cp.a(x, y)) { Cp.set(x, y, cap[0]); Cp.set(x, y - 1, cap[1]); } }
      for (const [dx, dy, r] of [[-7, -2.6, 1.2], [-3, -6, 1], [2.6, -4, 1.3], [7.4, -2, 0.9], [-0.6, -1.4, 0.8], [5, -7, 0.8], [-5.6, -6.6, 0.7]]) { Cp.ellipse(cx + dx * u * flare, rimY + dy * u, r * u, r * 0.7 * u, C('#cfa978')); Cp.ellipse(cx + dx * u * flare - 0.3, rimY + dy * u - 0.3, r * 0.8 * u, r * 0.55 * u, C(CREAM)); }
      put(S, Cp, true);
      // the bodice: overlapping little cap-scales up a slim torso
      const B = layer(F);
      blob(B, [[cx, wy - 3.4 * u, 2.6 * u, 3.8 * u], [cx, wy - 6.4 * u, 3.4 * u, 1.6 * u]], skin);
      for (let r = 0; r < 3; r++) for (let k = -1; k <= 1; k++) { const x = cx + k * 1.6 * u + (r % 2) * 0.8 * u, y = wy - (0.8 + r * 1.6) * u; if (Math.abs(x - cx) < 2.4 * u) { B.ellipse(x, y, 1 * u, 0.7 * u, cap[3]); B.ellipse(x - 0.2 * u, y - 0.2 * u, 0.6 * u, 0.4 * u, cap[4]); } }
      put(S, B, true);
      const hands = [];
      if (!w1 && !w2) { hands.push(arm(-1), arm(1)); }
      // the veil: a lace net of fungal mesh falling from the circlet, behind the head and shoulders
      const Vl = layer(F), veilTop = hy - 2.2 * u, veilBot = wy + 1 * u;
      for (let y = R(veilTop); y < veilBot; y++) {
        const f = (y - veilTop) / (veilBot - veilTop), hw = lerp(3, 7.6, Math.sqrt(f)) * u + (idle ? sin(t + f * 0.5) * 0.4 * u : run ? f * 1.2 * u : 0);
        for (let x = Math.floor(hx - hw); x <= hx + hw; x++) {
          const gx = x - hx, gyy = y - R(veilTop), cell = Math.max(3, R(1.1 * u)), edge = Math.abs(gx) > hw - 1;
          if (hurt && x > hx && f > 0.4) continue;
          if (edge || (gx + gyy) % cell === 0 || ((gx - gyy) % cell + cell) % cell === 0) Vl.set(x, y, C(lace, edge ? 255 : 200));
        }
      }
      put(L, Vl, false);
      put(L, S, true);
      if (w1 || w2) hands.push(arm(-1), arm(1));
      // head: a porcelain face on a slender neck
      const Hh = layer(F);
      tube(Hh, [[cx, wy - 7 * u], [hx, hy + 2 * u]], 0.9 * u, skin);
      blob(Hh, [[hx, hy, 2.8 * u, 3 * u], [hx, hy + 1.5 * u, 2.1 * u, 2 * u]], skin);
      put(L, Hh, true);
      // crown: a woven circlet of mycelium with five toadstools of different heights rising from it
      const Cw = layer(F), crownPts = [];
      Cw.ellipse(hx, hy - 2.2 * u, 2.8 * u, 0.8 * u, skin[1]);
      Cw.ellipse(hx, hy - 2.4 * u, 2.6 * u, 0.5 * u, skin[3]);
      [[-3.6, 1, 0.85], [-1.9, 3, 1], [0.1, 4.6, 1.25], [2, 2.6, 0.95], [3.7, 0.9, 0.8]].forEach(([dx, h, r], k) => {
        const bx = hx + dx * 0.7 * u, by = hy - 2.4 * u, tx = hx + dx * u * 1.15, ty = by - h * u * (w1 ? 1.2 : 1);
        tube(Cw, [[bx, by], [tx, ty]], 0.35 * u, skin);
        crownPts.push([tx, ty, r * u, k]);
      });
      put(L, Cw, true);
      put(F.p, skew(L, lean, oy), false);
      // the toadstool caps glow; the veil of lace net hangs from them to the shoulders
      for (const [x, y, r, k] of crownPts) {
        const c = glowK > 1 ? ROT_G : (k % 2 ? ROT_M : ROT_G);
        F.p.ellipse(x, y, r * 1.2 + 1, r * 0.8 + 1, C(ROT_D)); for (const Lr of [F.p, F.e]) { Lr.ellipse(x, y, r * 1.2, r * 0.8, C(c)); Lr.rect(R(x - r * 1.1), R(y), R(r * 2.2), 1, C(ROT_D)); }
        lit(F, x - r * 0.4, y - r * 0.3, '#f6e39a');
        if (glowK > 1) lit(F, x, y - r * 1.6, ROT_G);
      }
      // the face: lidded and serene; the eyes open (glowing) to command, squeeze when hurt
      const ex = 1.1 * u, ey = hy - 0.1 * u;
      for (const sd of [-1, 1]) {
        const x = hx + sd * ex;
        if (w1 || w2) eyeGlow(F, x - 0.5 * u, ey - 0.4 * u, Math.max(2, 1 * u), Math.max(1, 0.7 * u), ROT_G);
        else if (hurt) { F.p.line(x - 0.6 * u, ey - 0.4 * u, x + 0.6 * u, ey, C(EYE_DK)); }
        else { F.p.line(x - 0.6 * u, ey, x + 0.6 * u, ey, C(cap[1])); F.p.set(R(x + sd * 0.6 * u), R(ey + 1), C(cap[1])); }
      }
      F.p.rect(R(hx - 0.5 * u), R(hy + 1.6 * u), Math.max(2, R(1 * u)), Math.max(1, R((w2 ? 0.8 : 0.35) * u)), C(cap[1]));
      // a blush of spore-dust on the cheeks
      for (const sd of [-1, 1]) F.p.set(R(hx + sd * 1.6 * u), R(hy + 0.9 * u), C(gill[3]));
      // attendants in front
      attendant(puffs[0], 0); attendant(puffs[1], 1);
      // drifting spores, and the volley ring on the strike
      const n = w2 ? 10 : 4;
      for (let k = 0; k < n; k++) {
        if (w2) { const a = k / n * TAU; glow(F, cx + Math.cos(a) * 15 * u, wy - 2 * u + Math.sin(a) * 11 * u, 0.9 * u, ROT_G); }
        else { const ph = (t + k / n) % 1; lit(F, cx + [-9, -3, 4, 9][k] * u + sin(ph) * u, wy - 4 * u - ph * 12 * u, ROT_M); }
      }
      if (w1) for (const h of hands) glow(F, h[0], h[1] - 0.8 * u, 1.2 * u, ROT_G, { halo: true });
      F.mouth = [hx, hy - 4 * u];
    },
  },
  // The Broodmother (broodmother): a great hunched spider that carries her nursery with her: a
  // basket of woven silk and twigs on her back, full of egg sacs lit from inside like paper
  // lanterns, spiderlings crawling over the weave. Her legs arch high over her body like the ribs
  // of a cage; a tiara of eight eyes, two of them enormous.
  broodmother: {
    view: 'side', box: [44, 30], pivot: 0.52, idle: 6, idleFps: 4, scale: 0.86,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const fur = pal5('mauve', 4), furL = pal5('mauve', 6), furD = fur.map((c) => dark(c, 0.8)), band = C('#996f76');
      const silk = pal5('sand', 6), twig = pal5('wood', 4), egg = ['#7a1e14', '#c2401c', '#ec7a2a', '#f8b848', '#fff0b0'].map((c) => C(c));
      const ec = hurt0(P) ? '#f5afd6' : o.c3 || '#f13e3e';
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle';
      const w1 = P.atk === 1, w2 = P.atk === 2, hurt = P.hurt;
      const lunge = w2 ? 3 * u : w1 ? -1.6 * u : hurt ? -1.4 * u : 0;
      const rear = w1 ? 2.2 * u : 0;
      const bob = run ? -Math.abs(sin(t * 2)) * 0.8 * u : idle ? sin(t) * 0.3 * u : hurt ? 0.8 * u : 0;
      const bx = ox + lunge, by = oy - 9.6 * u + bob;
      const L = layer(F);
      // legs: femur up to a high knee, tibia down to a hooked foot; pale bands at the joints
      const legs = (far) => {
        const Lg = layer(F), Rl = far ? furD : fur;
        for (let k = 0; k < 4; k++) {
          const hip = [bx + (2.6 + k * 1.6) * u + (far ? 0.8 * u : 0), by + 0.6 * u - (k < 2 ? rear * 0.5 : 0)];
          const reach = [-17, -9, 6.4, 15][k] + (far ? -1.6 : 0);
          const ph = t + [0, 0.5, 0.25, 0.75][k] + (far ? 0.5 : 0);
          let [dx, lift] = run ? stride(ph, 5 * u, 2.4 * u) : [0, 0];
          if (idle && k === (P.i % 4) && !far) lift = 1.2 * u;
          let foot = [hip[0] + reach * u + dx, oy - 0.3 * u - lift];
          if (w1 && k >= 2) foot = [hip[0] + (k === 3 ? 9 : 5) * u, by - (k === 3 ? 12 : 9) * u + (far ? 1.4 * u : 0)];
          if (w2 && k >= 2) foot = [hip[0] + (k === 3 ? 15 : 9) * u, oy - (k === 3 ? 1.4 : 0.6) * u + (far ? -1 * u : 0)];
          if (hurt) foot = [hip[0] + reach * 0.62 * u, oy - 1.2 * u];
          const kh = (6.6 + Math.abs(reach) * 0.22 - (hurt ? 2.6 : 0)) * u;
          const knee = w1 && k >= 2 ? [hip[0] + 3 * u, hip[1] - 9 * u] : [lerp(hip[0], foot[0], 0.4), Math.min(hip[1], foot[1]) - kh];
          tube(Lg, [hip, knee], [1.25 * u, 0.9 * u], Rl, { fur: 3 + k });
          tube(Lg, [knee, foot], [0.85 * u, 0.4 * u], Rl, { fur: 7 + k });
          // pale joint bands and a hooked claw
          for (const q of [knee, [lerp(knee[0], foot[0], 0.55), lerp(knee[1], foot[1], 0.55)]]) Lg.ellipse(q[0], q[1], 0.9 * u, 0.9 * u, far ? dark(band, 0.8) : band);
          Lg.line(foot[0], foot[1], foot[0] + (reach > 0 ? 1 : -1) * 0.8 * u, foot[1] + 0.6 * u, Rl[0]);
        }
        put(L, Lg, !far);
      };
      legs(true);
      // abdomen: a great furred sack behind, the nursery basket riding on top of it
      const A = layer(F);
      const ax = bx - 6 * u, ay = by - 2.2 * u - rear * 0.4;
      blob(A, [[ax, ay, 8.6 * u, 6.6 * u], [ax - 4 * u, ay + 1.6 * u, 4.6 * u, 4.4 * u]], fur, { fur: 11 });
      // chevron markings down the back of the abdomen
      for (let k = 0; k < 3; k++) { const x = ax - (3 + k * 2.2) * u, y = ay + (1.2 + k * 0.6) * u; A.line(x - 1 * u, y - 1 * u, x, y, furL[3]); A.line(x, y, x + 1 * u, y - 1 * u, furL[3]); }
      // spinnerets
      blob(A, [[ax - 8.4 * u, ay + 2.6 * u, 1.2 * u, 1 * u]], furD);
      put(L, A, true);
      // the nursery: a woven dome of silk bands and twig ribs, eggs glowing through the gaps
      const N = layer(F);
      const nx = ax + 0.6 * u, ny = ay - 5.4 * u, nrx = 7.4 * u, nry = 5 * u;
      blob(N, [[nx, ny, nrx, nry]], silk, { clipY: R(ny + nry * 0.6) });
      // weave: diagonal silk bands crossing, shaded
      for (let y = Math.floor(ny - nry); y <= ny + nry; y++) for (let x = Math.floor(nx - nrx); x <= nx + nrx; x++) {
        if (!N.a(x, y)) continue;
        const d1 = ((x + y) % 6 + 6) % 6, d2 = ((x - y) % 6 + 6) % 6;
        if (d1 === 0 || d2 === 0) N.set(x, y, silk[1]);
      }
      // twig ribs over the dome
      for (const f of [-0.7, -0.25, 0.25, 0.7]) {
        const P2 = []; for (let a = -Math.PI * 0.95; a <= -0.05; a += 0.15) P2.push([nx + Math.cos(a) * nrx * Math.abs(f) * (f < 0 ? -1 : 1) * -Math.cos(a) * 0 + nx * 0 + (nx + f * nrx * Math.sin(-a) * 0) + f * nrx * Math.abs(Math.sin(a)) * 0 + f * nrx * 0.95 * Math.sqrt(Math.max(0, 1 - Math.cos(a) ** 2)) * 0 + Math.cos(a) * 0 + f * nrx * Math.sin(-a) * 0.98 - nx + nx, ny + Math.cos(a) * -nry * 0 + Math.sin(a) * nry * Math.cos(Math.asin(clamp(f, -1, 1))) * 0.98]);
        tube(N, P2, 0.45 * u, twig);
      }
      // the rim: a twisted rope of silk where the basket meets the back
      tube(N, bez([[nx - nrx, ny + nry * 0.45], [nx, ny + nry * 0.9], [nx + nrx, ny + nry * 0.45]], 16), 0.8 * u, silk, { rings: 3, ringC: silk[2] });
      put(L, N, true);
      // head + cephalothorax: furred, hunched, pedipalps and fangs forward
      const B = layer(F);
      const cx2 = bx + 4.6 * u, cy2 = by - rear * 0.6;
      blob(B, [[cx2, cy2, 5 * u, 3.8 * u], [cx2 + 3.4 * u, cy2 + 0.4 * u, 3 * u, 3 * u]], fur, { fur: 13 });
      const hx = cx2 + 5.4 * u, hy = cy2 + 0.6 * u;
      // pedipalps: short furred feelers that twitch
      const pt = idle ? sin(t * 2) * 0.6 * u : w1 ? -1.6 * u : 0;
      for (const [dx, far] of [[0, true], [0.8, false]]) tube(B, bez([[hx - 0.6 * u + dx, hy + 1 * u], [hx + 1.8 * u + dx, hy + 0.2 * u + pt], [hx + 2.6 * u + dx, hy + 2.6 * u + pt]]), [0.8 * u, 0.6 * u], far ? furD : fur, { fur: 5 });
      // chelicerae and fangs: spread wide on the wind-up, clamped forward on the strike
      const spread = w1 ? 0.7 : w2 ? -0.2 : idle ? [0, 0.1, 0, 0.15, 0, 0.05][P.i] : 0.1;
      for (const [sd, Rm] of [[-1, furD], [1, fur]]) {
        const r0 = [hx + 0.2 * u, hy + 1.6 * u], a = Math.PI / 2 - 0.3 + sd * spread;
        const m = [r0[0] + Math.cos(a - 0.6) * 2.2 * u, r0[1] + Math.sin(a - 0.6) * 2.2 * u];
        blob(B, [[lerp(r0[0], m[0], 0.5), lerp(r0[1], m[1], 0.5), 1.2 * u, 1.4 * u]], Rm, { fur: 2 });
        horn(B, m, [m[0] + Math.cos(a) * 1.6 * u, m[1] + Math.sin(a) * 1.2 * u], [m[0] - 0.4 * u + Math.cos(a + 0.8) * 2.4 * u, m[1] + Math.sin(a + 0.8) * 2.2 * u], 1 * u, ramp('#cfa978'));
      }
      put(L, B, true);
      legs(false);
      put(F.p, L, false);
      // the eggs: lantern-lit sacs nestled in the weave, pulsing one after another; weak points
      const eggs = [[-4.6, -1.6, 1.8], [-1.4, -3.4, 2.1], [2.2, -2.2, 1.9], [4.8, -0.4, 1.5], [0.6, 0.2, 1.6]];
      eggs.forEach(([dx, dy, r], k) => {
        const pulse = idle ? (P.i % 5 === k ? 1.2 : 0.8) : w1 || w2 ? 1.3 : hurt ? 0.4 : 0.9;
        const x = nx + dx * u, y = ny + dy * u, rr2 = r * u;
        F.p.ellipse(x, y, rr2 + 1, rr2 * 1.15 + 1, silk[0]);
        for (const Lr of [F.p, F.e]) { Lr.ellipse(x, y, rr2, rr2 * 1.15, pulse > 1 ? egg[3] : pulse > 0.6 ? egg[2] : egg[1]); Lr.ellipse(x - rr2 * 0.2, y - rr2 * 0.25, rr2 * 0.55, rr2 * 0.6, pulse > 1 ? egg[4] : egg[3]); }
        // silk wrap lines over each sac
        F.p.line(x - rr2, y - rr2 * 0.2, x + rr2, y + rr2 * 0.3, C(silk[3], 210));
        F.p.line(x - rr2 * 0.8, y + rr2 * 0.6, x + rr2 * 0.7, y - rr2 * 0.7, C(silk[3], 180));
        // a dark curled shape inside: something waiting
        F.p.set(R(x + rr2 * 0.1), R(y + rr2 * 0.2), egg[0]); F.p.set(R(x + rr2 * 0.3), R(y + rr2 * 0.1), egg[0]);
      });
      // spiderlings crawling over the weave
      for (let k = 0; k < 4; k++) {
        const a = -Math.PI * (0.15 + ((t + k * 0.27) % 1) * 0.7), x = nx + Math.cos(a) * nrx * 0.98, y = ny + Math.sin(a) * nry * 0.98;
        F.p.rect(R(x - 1), R(y - 1), 2, 2, C(fur[0]));
        for (const d of [-1, 1]) { F.p.set(R(x + d * 2), R(y - 1), C(fur[1])); F.p.set(R(x + d * 2), R(y + 1), C(fur[1])); }
        lit(F, x, y - 1, ec);
      }
      // loose silk threads trailing from the basket, swaying
      for (const [dx, ln] of [[-6, 8], [-2.6, 5]]) { const x = nx + dx * u, y = ny + 2.4 * u, sw = idle ? sin(t + dx) * 0.8 * u : run ? -2 * u : 0; F.p.line(x, y, x + sw - 1 * u, y + ln * u, C(silk[4], 200)); }
      // the tiara of eyes: two huge, two medium, four small, in an arc over the brow
      const eyes = [[-0.6, -1.6, 1.25], [1.6, -1.1, 1.05], [-2, -2.8, 0.7], [0.6, -3, 0.7], [-3.2, -1.8, 0.5], [2.4, -2.6, 0.5], [-1, -4, 0.45], [1.8, -3.9, 0.4]];
      eyes.forEach(([dx, dy, r], k) => {
        const x = hx + dx * u, y = hy + dy * u, rr2 = Math.max(1, r * u);
        F.p.disc(x, y, rr2 + 0.6, C(VOID));
        if (hurt && r > 0.6) { F.p.line(x - rr2, y, x + rr2, y, C(ec)); return; }
        for (const Lr of [F.p, F.e]) Lr.disc(x, y, rr2, C(ec));
        if (rr2 >= 2) { F.p.disc(x + rr2 * 0.2, y + rr2 * 0.2, rr2 * 0.45, C(dark(C(ec), 0.5))); }
        lit(F, x - rr2 * 0.4, y - rr2 * 0.4, '#fff4dc');
      });
      // the web shot leaves from between the fangs
      F.mouth = [hx + 1.4 * u, hy + 3.2 * u];
      if (w2) { for (let k = 0; k < 5; k++) F.p.line(hx + 2 * u, hy + 3 * u, hx + (5 + k) * u, hy + (1 + k * 0.8) * u, C(silk[4], 200)); }
    },
  },
};
