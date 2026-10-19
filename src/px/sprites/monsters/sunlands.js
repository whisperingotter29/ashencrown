// Hand-built monster designs: sunlands, the great bosses of the Crimson Wastes and the Gilded Reach.
// See kit.js for the design format and docs/BESTIARY.md for the concepts.
import { C, R, ramp, pal5, layer, put, blob, tube, horn, slab, facet, shard, drape, ik, stride, sin, cos, lerp, clamp, glow, flame, rune, eyeGlow, teeth, spots, stripes, crack, over, rimLight, tint, light, dark, mixc, hash2, bez, cyl, blank, bayer, WHITE, VOID, BONE, BONE_D, MAW_D, INK, CREAM, PAL } from './kit.js';

// ------------------------------------------------------------------ local helpers
const TAU = Math.PI * 2;
const HOT = ['#7a1e14', '#c2401c', '#ec7a2a', '#f8b848', '#fff0b0'];   // ember, dark -> light
const hurtC = '#f5afd6';

// paint colour c over the pixels of L that sit inside polygon pts and currently hold colour `only`
// (or any colour when only is null): facets inside an already shaded part
function facetOn(L, pts, c, only = null) {
  const M = blank(L);
  M.poly(pts, [255, 255, 255, 255]);
  const cc = C(c), oc = only ? C(only) : null;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(L.h - 1, Math.ceil(y1)); y++) for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(L.w - 1, Math.ceil(x1)); x++) {
    if (!M.a(x, y) || L.a(x, y) < 100) continue;
    const i = (y * L.w + x) * 4;
    if (oc && (L.d[i] !== oc[0] || L.d[i + 1] !== oc[1] || L.d[i + 2] !== oc[2])) continue;
    L.d[i] = cc[0]; L.d[i + 1] = cc[1]; L.d[i + 2] = cc[2];
  }
  return L;
}
// an irregular faceted block of stone (rubble, broken masonry): lit top-left facet, dark lower-right
function rock(L, cx, cy, rx, ry, Rm, seed = 1, a = 0, contour = true) {
  const n = 6, pts = [];
  for (let k = 0; k < n; k++) {
    const ang = a + (k / n) * TAU + (hash2(k, seed, 3) - 0.5) * 0.55;
    const rr = 0.8 + hash2(k, seed, 7) * 0.28;
    pts.push([cx + Math.cos(ang) * rx * rr, cy + Math.sin(ang) * ry * rr]);
  }
  const T = blank(L);
  T.poly(pts, Rm[3]);
  cyl(T, Rm, { wide: rx > 5 });
  const lit = [[cx - rx * 0.05, cy - ry * 0.05]], dk = [[cx + rx * 0.1, cy + ry * 0.1]];
  for (const p of pts) {
    const dx = (p[0] - cx) / rx, dy = (p[1] - cy) / ry, d = dx * -0.6 + dy * -0.8;
    if (d > 0.05) lit.push([lerp(cx, p[0], 0.82), lerp(cy, p[1], 0.82)]);
    if (d < -0.35) dk.push([lerp(cx, p[0], 0.86), lerp(cy, p[1], 0.86)]);
  }
  const sortA = (arr) => { const c0 = arr[0]; return [c0, ...arr.slice(1).sort((p, q) => Math.atan2(p[1] - c0[1], p[0] - c0[0]) - Math.atan2(q[1] - c0[1], q[0] - c0[0]))]; };
  if (lit.length >= 3) facetOn(T, sortA(lit), Rm[4], Rm[3]);
  if (dk.length >= 3) facetOn(T, sortA(dk), Rm[2], Rm[3]);
  return put(L, T, contour);
}
// a hanging / stretched chain along a path of points: alternating ring links and edge-on bars
function chain(L, pts, s, Rm) {
  const P = bez(pts, 24);
  let acc = 0, k = 0;
  const T = blank(L);
  for (let i = 1; i < P.length; i++) {
    const [ax, ay] = P[i - 1], [bx, by] = P[i], l = Math.hypot(bx - ax, by - ay);
    acc += l;
    while (acc >= s) {
      acc -= s;
      const f = 1 - acc / Math.max(0.001, l), x = lerp(ax, bx, f), y = lerp(ay, by, f);
      const dx = (bx - ax) / (l || 1), dy = (by - ay) / (l || 1);
      if (k % 2 === 0) {
        tube(T, [[x - dx * s * 0.55, y - dy * s * 0.55], [x + dx * s * 0.55, y + dy * s * 0.55]], s * 0.42, Rm);
        T.set(R(x), R(y), Rm[0]);
        if (s >= 5) T.set(R(x + dx), R(y + dy), Rm[0]);
      } else tube(T, [[x - dx * s * 0.5, y - dy * s * 0.5], [x + dx * s * 0.5, y + dy * s * 0.5]], Math.max(0.6, s * 0.2), Rm);
      k++;
    }
  }
  return put(L, T, true);
}
// a rising puff of sand: stacked clumpy balls that widen and drift as they climb (t animates)
function plume(F, x, y, h, w, t, Rm, drift = 0.3) {
  const L = layer(F);
  const n = 4;
  for (let k = n - 1; k >= 0; k--) {
    const f = ((k + t) % n) / n;
    const r = w * (0.35 + f * 0.55);
    const px = x + Math.sin((f + t) * TAU) * w * 0.15 + f * h * drift, py = y - f * h;
    blob(L, [[px, py, r, r * 0.85]], Rm, { tex: 5 + k });
  }
  return put(F.p, L, false);
}
// a falling sand stream from (x, y0) to (x, y1): a 2-tone ribbon broken into moving grains
function sandStream(L, x, y0, y1, w, t, Rm, wob = 0) {
  for (let y = R(y0); y <= y1; y++) {
    const f = (y - y0) / Math.max(1, y1 - y0);
    const xx = x + Math.sin((f * 2 + t) * TAU) * wob;
    const ww = Math.max(1, w * (1 - f * 0.25));
    for (let i = 0; i < ww; i++) {
      const gx = R(xx - ww / 2 + i);
      const grain = hash2(gx >> 1, (y + R(t * 24)) >> 1, 11);
      L.set(gx, y, grain > 0.75 ? Rm[4] : i < ww * 0.4 ? Rm[3] : Rm[2]);
    }
  }
  return L;
}
// fluted column drum: a slab with vertical fluting and a jagged broken top (or a capital)
function column(L, cx, top, bot, w, Rm, seed = 1, broken = true) {
  const T = blank(L), pts = [[cx - w / 2, bot], [cx + w / 2, bot]];
  const n = 5;
  for (let k = n; k >= 0; k--) {
    const f = k / n, x = cx - w / 2 + f * w;
    pts.push([x, top + (broken ? (hash2(k, seed, 5) - 0.3) * w * 0.55 : 0)]);
  }
  T.poly(pts, Rm[3]);
  cyl(T, Rm, { wide: w > 8 });
  const fl = Math.max(3, R(w / 2.6));
  for (let k = 1; k < fl; k++) {
    const x = R(cx - w / 2 + (k / fl) * w);
    for (let y = R(top); y <= bot; y++) if (T.a(x, y) && T.a(x, y - 2)) { T.set(x, y, Rm[2]); if (T.a(x - 1, y - 2) && k < fl / 2) T.set(x - 1, y, Rm[4]); }
  }
  return put(L, T, true);
}
// an angular glowing eye: polygon pts in a dark socket grown by pad px, lit with ramp G (5 colours)
function slitEye(F, pts, G, pad = 1) {
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const grow = (k) => pts.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
  const span = Math.max(...pts.map(([x]) => Math.abs(x - cx)));
  F.p.poly(grow(1 + pad / Math.max(1, span)), C(MAW_D));
  for (const L of [F.p, F.e]) { L.poly(pts, C(G[3])); L.poly(grow(0.55).map(([x, y]) => [x, y - 0.5]), C(G[4])); }
  return F;
}
// a glass bulb (hourglass): faint tinted fill, a pale rim, a cream streak on the lit side. neck: +1
// narrows to a neck at the bottom, -1 at the top. fill(L, inside) paints the contents first.
function bulb(F, L, cx, cy, rx, ry, neck, Gl, fill) {
  const T = blank(L);
  const inside = (x, y) => {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    // a pear: the ellipse pinched toward the neck end
    const pinch = 1 - Math.max(0, dy * neck) * 0.55;
    return (dx / pinch) ** 2 + dy * dy <= 1;
  };
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) if (inside(x, y)) T.set(x, y, [...C(Gl[2]).slice(0, 3), 70]);
  if (fill) fill(T, inside);
  // rim and glare
  for (let y = Math.floor(cy - ry) - 1; y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx) - 1; x <= cx + rx + 1; x++) {
    if (!inside(x, y)) continue;
    if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) T.set(x, y, (x < cx && y < cy + ry * 0.3) ? Gl[4] : Gl[3]);
  }
  for (let a = 3.5; a < 4.3; a += 0.05) { const x = R(cx + Math.cos(a) * rx * 0.72), y = R(cy + Math.sin(a) * ry * 0.7); T.set(x, y, Gl[4]); T.set(x + 1, y, Gl[4]); }
  T.set(R(cx + rx * 0.45), R(cy - ry * 0.55), WHITE);
  return put(L, T, false);
}
// rotate a point about a centre
const rotP = (p, c, a) => { const x = p[0] - c[0], y = p[1] - c[1], ca = Math.cos(a), sa = Math.sin(a); return [c[0] + x * ca - y * sa, c[1] + x * sa + y * ca]; };

// A severed colossus hand seen roughly palm-on: wrist at w, fingers pointing along angle a, size s
// (px per hand unit). kind: 'open' | 'fist' | 'point' | 'cup'. Cut wrist with a gold cuff.
function stoneHand(L, w, a, s, kind, Rm, Gm, mirror = 1) {
  const ca = Math.cos(a), sa = Math.sin(a), px = -sa * mirror, py = ca * mirror;
  const at = (f, g) => [w[0] + ca * f * s + px * g * s, w[1] + sa * f * s + py * g * s];
  const T = blank(L);
  // wrist stump and cuff
  tube(T, [at(-0.8, 0), at(0.4, 0)], 0.95 * s, Rm, { tex: 3 });
  const c0 = at(-0.6, 0);
  T.ellipse(c0[0], c0[1], Math.max(1, 0.9 * s * Math.abs(py) + 0.35 * s), Math.max(1, 0.9 * s * Math.abs(px) + 0.35 * s), Rm[1]);
  tube(T, [at(-0.3, 0), at(0.1, 0)], 1.05 * s, Gm);
  // palm
  const pc = at(1.3, 0);
  blob(T, [[pc[0], pc[1], 1.25 * s, 1.25 * s], [at(1.9, 0.1)[0], at(1.9, 0.1)[1], 1.1 * s, 1.1 * s]], Rm, { tex: 5 });
  // fingers
  const fin = [[-0.75, 0.95], [-0.25, 1.1], [0.25, 1.05], [0.75, 0.85]];
  for (let k = 0; k < 4; k++) {
    const [g, l] = fin[k], b = at(2.5, g);
    let tip;
    if (kind === 'fist' || (kind === 'point' && k !== 1)) { blob(T, [[at(2.7, g)[0], at(2.7, g)[1], 0.48 * s, 0.48 * s]], Rm); continue; }
    if (kind === 'cup') tip = at(2.5 + l * 1.4, g * 0.6);
    else tip = at(2.5 + l * (kind === 'point' ? 2.6 : 2), g * (kind === 'open' ? 1.7 : 1));
    tube(T, [b, tip], [0.42 * s, 0.32 * s], Rm, { tex: 7 });
    if (kind === 'open' || kind === 'point') T.set(R(lerp(b[0], tip[0], 0.55)), R(lerp(b[1], tip[1], 0.55)), Rm[1]);
  }
  // thumb
  tube(T, [at(1.2, -1.1), at(2.2, kind === 'fist' ? -0.8 : -2)], [0.5 * s, 0.38 * s], Rm, { tex: 9 });
  return put(L, T, true);
}

// dissolve the bottom of a layer into a dithered fade between y0 (solid) and y1 (gone)
function fadeOut(L, y0, y1) {
  for (let y = Math.max(0, R(y0)); y < L.h; y++) {
    const f = (y - y0) / Math.max(1, y1 - y0);
    for (let x = 0; x < L.w; x++) if (L.a(x, y) && (f >= 1 || bayer(x >> 1, y >> 1) < f)) L.clear(x, y);
  }
  return L;
}

// enemy id -> { design, name, body? }: folded into src/data/enemies.js at integration
export const assign = {
  colossus_heart: { design: 'colossus_heart', name: 'Heart of Ozymar' },
  sand_king: { design: 'sand_king', name: 'The Sand-King' },
  obelisk_keeper: { design: 'obelisk_keeper', name: 'Obelisk Keeper' },
};

export default {
  // Heart of Ozymar (colossus_heart): the colossus's own heart, a gilded clay heart the size of a
  // house that broke out of its chest and walks on the two broken pillars it was chained to. Its
  // great vessels are chimneys that cough sand on every beat; its arms are floating rubble bound
  // by trickling sand; molten light leaks through its cracks and its scowl.
  colossus_heart: {
    view: 'front', box: [34, 33], pivot: 0.5, idle: 6, idleFps: 5,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const RD = pal5('red', 5), G = pal5('gold', 5), Gd = G.map((c) => dark(c, 0.82)), VN = pal5('plum', 5), SA = pal5('sand', 5), SAd = SA.map((c) => dark(c, 0.82));
      const IR = ramp('#4a5259'), ST = pal5('sand', 4);
      const t = P.t, idle = P.act === 'idle', run = P.act === 'run', wind = P.atk === 1, hit = P.atk === 2, hurt = P.hurt;
      // heartbeat: lub-dub then rest
      const beat = idle ? [0, 1, 0.35, 0.8, 0, 0][P.i] : run ? (P.i % 2 ? 0.5 : 0) : wind ? -0.6 : hit ? 1.2 : 1;
      const k = 1 - beat * 0.06;
      // legs: two broken pillars; walking lifts them in turn
      const lift = (side) => (run ? Math.max(0, sin(t + (side > 0 ? 0.5 : 0))) * 2.2 * u : 0);
      const sway = run ? sin(t) * 0.8 * u : hurt ? -1.2 * u : 0;
      const hx = ox + sway, hy = oy - 17.5 * u + (run ? -Math.abs(sin(t)) * 0.6 * u : 0) + (wind ? -1.5 * u : hit ? 1.6 * u : hurt ? 0.8 * u : 0);
      const L = layer(F);
      // ---- pillars, each still shackled with an iron band and a length of chain
      for (const side of [-1, 1]) {
        const px = ox + side * 4.6 * u, ly = lift(side);
        const Pl = layer(F);
        slab(Pl, [[px - 3 * u, oy - ly], [px + 3 * u, oy - ly], [px + 2.7 * u, oy - 1.8 * u - ly], [px - 2.7 * u, oy - 1.8 * u - ly]], SAd, { wide: true });
        column(Pl, px, hy + 3 * u, oy - 1.7 * u - ly, 4.2 * u, side < 0 ? SA : SAd, 3 + side);
        const by = hy + 9.5 * u - ly * 0.5;
        slab(Pl, [[px - 2.4 * u, by - 0.8 * u], [px + 2.4 * u, by - 0.8 * u], [px + 2.4 * u, by + 0.8 * u], [px - 2.4 * u, by + 0.8 * u]], IR);
        put(L, Pl, true);
      }
      // ---- rubble arms: sand binds the stones at the shoulder
      const armPath = (side) => {
        const sh = [hx + side * 7 * k * u, hy - 0.5 * u];
        let hand;
        if (wind) hand = [hx + side * 9 * u, hy - 12 * u];
        else if (hit) hand = [ox + side * 8.5 * u, oy - 2.6 * u];
        else if (hurt) hand = [hx + side * 13.5 * u, hy + 4 * u];
        else hand = [hx + side * 12 * u + (run ? sin(t + (side > 0 ? 0 : 0.5)) * 1.5 * u : 0), hy + 7.5 * u + (idle ? beat * 0.6 * u : 0)];
        const el = [lerp(sh[0], hand[0], 0.5) + side * 3 * u, lerp(sh[1], hand[1], 0.5) + (wind ? 1 * u : -1 * u)];
        return bez([sh, el, hand], 12);
      };
      for (const side of [-1, 1]) {
        const Sd = layer(F);
        tube(Sd, armPath(side), [1.1 * u, 0.6 * u], SAd, { tex: 4 });
        put(L, Sd, false);
      }
      const arm = (side) => {
        const path = armPath(side), hand = path[path.length - 1];
        const A = layer(F);
        const sizes = [1.7, 2, 2.2];
        for (let j = 0; j < 3; j++) {
          const p = path[R(2 + j * 3)];
          const jit = idle ? sin(t + j * 0.3) * 0.3 * u : 0;
          rock(A, p[0], p[1] + jit, sizes[j] * u, sizes[j] * 0.85 * u, j % 2 ? ST : SA, 11 + j * 7 + side, j * 0.7);
        }
        // the fist: a great block of masonry, a chunk of a carved wall
        const fx = hand[0], fy = hand[1];
        rock(A, fx, fy, 3.5 * u, 3.1 * u, SA, 31 + side, 0.3);
        A.line(fx - 2.2 * u, fy + 0.2 * u, fx + 2 * u, fy - 0.3 * u, SA[1]);
        A.line(fx - 0.6 * u, fy - 1.8 * u, fx - 0.4 * u, fy + 0.2 * u, SA[1]);
        A.line(fx + 0.6 * u, fy + 0.2 * u, fx + 0.8 * u, fy + 2 * u, SA[1]);
        if (hit) for (let j = 0; j < 4; j++) rock(A, fx + (j - 1.5) * 2.6 * u, oy - 0.6 * u - (j % 2) * u, 0.8 * u, 0.6 * u, SAd, 50 + j);
        put(L, A, true);
      };
      // ---- great vessels: the descending aorta goes behind the heart
      const vb = hy - 4 * k * u;
      const arch = bez([[hx + 1.2 * u, vb + 2 * u], [hx + 1.6 * u, hy - 16.5 * u], [hx - 8.5 * u, hy - 15.5 * u], [hx - 6.4 * u, hy - 1.5 * u]], 28);
      const Va = layer(F);
      tube(Va, arch, [2.3 * u, 1.9 * u], RD, { tex: 6 });
      // three branch stubs on the crest of the arch: the heart's crown
      for (let j = 0; j < 3; j++) {
        const p = arch[8 + j * 3];
        const tip = [p[0] + (1 - j) * 0.5 * u, p[1] - 2.6 * u - (j === 1 ? 0.8 * u : 0)];
        tube(Va, [[p[0], p[1]], tip], [0.9 * u, 0.75 * u], RD);
        Va.ellipse(tip[0], tip[1], 0.75 * u, 0.32 * u, RD[0]);
      }
      put(L, Va, true);
      // the two veins: open chimneys that cough sand
      const V = layer(F);
      const ch = (x0, x1, top, r) => {
        tube(V, bez([[x0, vb + 2 * u], [x0, top + 3 * u], [x1, top]], 10), [r * 1.1, r], VN, { tex: 3 });
        blob(V, [[x1, top, r * 1.35, r * 0.62]], VN);
        V.ellipse(x1, top - 0.15 * u, r * 0.85, r * 0.32, C(MAW_D));
      };
      ch(hx - 3 * u, hx - 3.6 * u, hy - 10.6 * u, 1.5 * u);
      ch(hx + 4.6 * u, hx + 6 * u, hy - 11.4 * u, 1.7 * u);
      put(L, V, true);
      // ---- the heart: red clay, half covered in square gold leaf
      const H = layer(F);
      blob(H, [[hx + 0.6 * u, hy + 0.6 * u, 7.4 * k * u, 6.4 * k * u], [hx - 4.6 * k * u, hy - 2.4 * u, 3.8 * k * u, 4.2 * k * u], [hx + 4.6 * k * u, hy - 3.4 * u, 3.6 * k * u, 3 * k * u], [hx + 3.2 * u, hy + 5.4 * k * u, 4.2 * k * u, 3.8 * k * u], [hx + 4.6 * u, hy + 8.6 * k * u, 2 * k * u, 2 * k * u]], RD, { tex: 9 });
      const lw = Math.max(3, R(2.2 * u)), lh = Math.max(3, R(1.8 * u));
      for (let y = 0; y < H.h; y++) for (let x = 0; x < H.w; x++) {
        if (!H.a(x, y)) continue;
        const row = Math.floor((y - hy) / lh), col = Math.floor((x - hx + (row & 1) * lw * 0.5) / lw);
        const lit = (-(x - hx) * 0.55 - (y - hy) * 0.8) / u;
        if (hash2(col, row, 21) + lit * 0.07 < 0.62) continue;
        if (((x - hx) / (6.2 * u)) ** 2 + ((y - hy - 0.4 * u) / (4.4 * u)) ** 2 < 1) continue;   // the face stays bare clay
        const i = (y * H.w + x) * 4;
        let ti = 3;
        for (let q = 0; q < 5; q++) if (H.d[i] === RD[q][0] && H.d[i + 1] === RD[q][1]) ti = q;
        const edge = ((x - hx + (row & 1) * lw * 0.5) % lw + lw) % lw === lw - 1 || ((y - hy) % lh + lh) % lh === lh - 1;
        H.set(x, y, edge ? G[Math.max(0, ti - 1)] : G[ti]);
      }
      // coronary groove down to the apex
      H.line(hx + 2.4 * u, hy + 4.6 * u, hx + 4.6 * u, hy + 9.4 * u, RD[0], Math.max(1, R(u * 0.35)));
      H.line(hx - 4.4 * u, hy - 6 * u, hx - 2.6 * u, hy - 3.6 * u, RD[0], Math.max(1, R(u * 0.35)));
      put(L, H, true);
      // chains: from the heart's sides down to the pillar bands, and one round its waist
      for (const side of [-1, 1]) {
        const px = ox + side * 4.6 * u, ly = lift(side);
        chain(L, [[hx + side * 6.8 * u, hy - 1 * u], [hx + side * 8.2 * u, hy + 5 * u], [px + side * 1.6 * u, hy + 9.5 * u - ly * 0.5]], 1.2 * u, IR);
      }
      const cy0 = hy + 6.2 * u;
      chain(L, [[hx - 6.4 * u, cy0 - 2.4 * u], [hx, cy0 + 3 * u], [hx + 7.6 * u, cy0 - 1.6 * u]], 1.2 * u, IR);
      // the lock: a gold heart-scarab clasp, its gem the colossus's last spark
      const sx = hx + 0.4 * u, sy = cy0 + 1.4 * u;
      const Sc = layer(F);
      blob(Sc, [[sx, sy, 2 * u, 1.6 * u], [sx, sy - 1.5 * u, 1.1 * u, 0.7 * u]], G);
      Sc.line(sx, sy - 0.9 * u, sx, sy + 1.5 * u, G[1]);
      for (const d of [-1, 1]) horn(Sc, [sx + d * 1.4 * u, sy - 0.2 * u], [sx + d * 2.8 * u, sy - 1.2 * u], [sx + d * 3.4 * u, sy + 0.4 * u], 1 * u, Gd);
      put(L, Sc, true);
      for (const side of [-1, 1]) arm(side);
      put(F.p, L, false);
      glow(F, sx, sy + 0.2 * u, 0.7 * u, hurt ? hurtC : HOT[2]);
      // ---- molten cracks and the face
      const cc = hurt ? hurtC : beat > 0.5 || wind ? HOT[4] : HOT[3];
      const ck = (x, y, a, n, sd) => { crack(F.p, x, y, a, n, cc, sd, F.e); crack(F.p, x + 1, y, a, n, cc, sd, F.e); };
      ck(hx + 4.4 * u, hy - 2 * u, 1.3, 4.5 * u, 7);
      ck(hx - 5.4 * u, hy + 1 * u, 1.9, 3.5 * u, 12);
      ck(hx + 6 * u, hy + 3 * u, 2.1, 3 * u, 3);
      // brow: a heavy scowl ridge, lower on one side
      const ex = hx + 0.2 * u, ey = hy - 1.8 * u;
      const Bw = layer(F);
      slab(Bw, [[ex - 5.6 * u, ey - 2 * u], [ex - 0.4 * u, ey - 0.4 * u], [ex + 0.4 * u, ey - 0.4 * u], [ex + 5.4 * u, ey - 3 * u], [ex + 5.2 * u, ey - 1.6 * u], [ex + 0.2 * u, ey + 0.6 * u], [ex - 5.4 * u, ey - 0.8 * u]], RD, { wide: true });
      put(F.p, Bw, true);
      if (hurt) {
        F.p.line(ex - 4 * u, ey + 0.6 * u, ex - 1.6 * u, ey + 1.1 * u, RD[0], 2);
        F.p.line(ex + 1.6 * u, ey + 1.1 * u, ex + 4.2 * u, ey + 0.4 * u, RD[0], 2);
      } else {
        const eh = wind ? 1 * u : 0;
        slitEye(F, [[ex - 4.6 * u, ey - 0.3 * u - eh * 0.5], [ex - 1.2 * u, ey + 0.8 * u - eh * 0.3], [ex - 1.4 * u, ey + 1.9 * u], [ex - 4.3 * u, ey + 1.3 * u + eh * 0.4]], HOT, 0.45 * u);
        slitEye(F, [[ex + 1.2 * u, ey + 0.6 * u - eh * 0.3], [ex + 5 * u, ey - 0.9 * u - eh * 0.6], [ex + 4.8 * u, ey + 1.5 * u + eh * 0.4], [ex + 1.4 * u, ey + 2.1 * u]], HOT, 0.45 * u);
      }
      // mouth: a jagged seam that splits open on the furnace inside
      const my = hy + 3 * u, open = wind ? 1.6 * u : hit ? 2.4 * u : hurt ? 1 * u : 0.35 * u;
      const top = [], btm = [];
      for (let j = 0; j <= 6; j++) {
        const f = j / 6, x = hx - 3.4 * u + f * 7 * u, z = (j % 2 ? -0.5 : 0.5) * u * 0.6;
        const bend = Math.sin(f * Math.PI) * open;
        top.push([x, my + z - bend * 0.4]); btm.push([x, my + z + bend]);
      }
      F.p.poly([...top, ...btm.slice().reverse()], C(MAW_D));
      if (open > 0.8 * u) {
        for (const Lr of [F.p, F.e]) { Lr.ellipse(hx + 0.2 * u, my + open * 0.35, 2.4 * u, open * 0.5, C(HOT[2])); Lr.ellipse(hx + 0.2 * u, my + open * 0.35, 1.2 * u, open * 0.3, C(HOT[4])); }
        teeth(F.p, [hx - 3 * u, my - open * 0.3], [hx + 3.2 * u, my - open * 0.3], 5, 0.9 * u, 1, RD[4]);
      } else for (const [x, y] of top) { F.p.set(R(x), R(y) + 1, C(HOT[2])); F.e.set(R(x), R(y) + 1, C(HOT[2])); }
      // ---- sand coughed from the veins on every beat
      const puffH = (beat > 0.5 ? 7 : 4.5) * u;
      plume(F, hx - 3.6 * u, hy - 11.4 * u, puffH, 2.3 * u, t * 2, SA, -0.25);
      plume(F, hx + 6 * u, hy - 12.2 * u, puffH * 1.1, 2.6 * u, t * 2 + 0.4, SA, 0.25);
      F.mouth = [hx, my];
    },
  },
  // The Sand-King (sand_king): a mummified pharaoh who made himself the waist of an hourglass so his
  // reign would never run out. Sand pours from the upper bulb into his funnel crown, through the
  // hollow of his unwrapped chest and on into the lower bulb he sits on. He rules with a crook topped
  // by a jackal's head, and blinds his enemies with a palmful of the hours.
  sand_king: {
    view: 'front', box: [30, 46], pivot: 0.5, idle: 6, idleFps: 5, hover: true, scale: 0.92,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const t = P.t, idle = P.act === 'idle', run = P.act === 'run', wind = P.atk === 1, hit = P.atk === 2, hurt = P.hurt;
      const G = pal5('gold', 5), Gd = G.map((c) => dark(c, 0.8)), WD = pal5('wood', 5), SA = pal5('sand', 4), LIN = pal5('sand', 6), SK = pal5('wood', 4);
      const LA = pal5('blue', 5), TE = pal5('teal', 5), RD = pal5('red', 4), GL = [C('#245458'), C('#4a9488'), C('#7cbca8'), C('#b4dcd0'), C('#e6f4ec')];
      const EYE = ['#7a1e14', '#c2401c', '#f8b848', '#f6e39a', '#fff0b0'];
      const lean = run ? sin(t) * 1.2 : hurt ? -1 : 0;                    // the top sways over the base
      const X = (x, y = 0) => ox + (x + lean * (y / 40)) * u, Y = (y) => oy - y * u;
      const L = layer(F);
      // ---- the frame: two ebony posts bowed into an hourglass, gold rings, a gold lintel
      for (const side of [-1, 1]) {
        const Po = layer(F);
        const path = bez([[X(side * 12.6, 4), Y(4)], [X(side * 3.6, 22), Y(22)], [X(side * 12.6, 39), Y(39)]], 24);
        tube(Po, path, (f) => (0.85 + 0.4 * Math.abs(Math.sin(f * Math.PI * 6))) * u, WD);
        for (const f of [0.03, 0.5, 0.97]) { const q = path[R(f * 24)]; blob(Po, [[q[0], q[1], 1.5 * u, 0.8 * u]], G); }
        // jackal-eared finials
        const fx = X(side * 12.6, 41);
        horn(Po, [fx - 0.7 * u, Y(40.5)], [fx - 0.9 * u, Y(42)], [fx - 0.5 * u, Y(44)], 1.1 * u, G);
        horn(Po, [fx + 0.7 * u, Y(40.5)], [fx + 0.9 * u, Y(42)], [fx + 0.5 * u, Y(44)], 1.1 * u, Gd);
        put(L, Po, true);
      }
      slab(L, [[X(-14), Y(1.8)], [X(14), Y(1.8)], [X(13.4), Y(4.4)], [X(-13.4), Y(4.4)]], WD, { wide: true });
      L.line(X(-13.4), Y(4.4), X(13.4), Y(4.4), G[4]);
      slab(L, [[X(-14, 39), Y(38.6)], [X(14, 39), Y(38.6)], [X(14.6, 41), Y(41.2)], [X(-14.6, 41), Y(41.2)]], G, { wide: true });
      for (let k = -4; k <= 4; k++) L.set(R(X(k * 2.8, 40)), R(Y(39.8)), LA[3]);
      // ---- lower bulb: a dune of spent hours
      const bcx = X(0, 9), bcy = Y(9.2);
      bulb(F, L, bcx, bcy, 9.6 * u, 4.6 * u, -1, GL, (T, inside) => {
        for (let y = R(bcy - 4.6 * u); y <= Y(4.4); y++) for (let x = R(bcx - 9.6 * u); x <= bcx + 9.6 * u; x++) {
          if (!inside(x, y)) continue;
          const dx = (x - bcx) / u, top = bcy - 2.4 * u + Math.abs(dx) * 0.35 * u;
          if (y < top) continue;
          const sh = dx * 0.5 + (y - top) / u * 0.6;
          T.set(x, y, y - top < 1 ? SA[4] : sh < 0.6 ? SA[3] : sh < 2 ? SA[2] : SA[1]);
        }
      });
      // ---- upper bulb: the hours still to come, draining through its neck
      const tcx = X(0, 35), tcy = Y(35.2);
      bulb(F, L, tcx, tcy, 9.6 * u, 3.6 * u, 1, GL, (T, inside) => {
        for (let y = R(tcy - 3.6 * u); y <= tcy + 3.6 * u; y++) for (let x = R(tcx - 9.6 * u); x <= tcx + 9.6 * u; x++) {
          if (!inside(x, y)) continue;
          const dx = (x - tcx) / u, top = tcy - 0.8 * u + Math.max(0, 2.2 - Math.abs(dx)) * 0.9 * u;
          if (y < top) continue;
          T.set(x, y, y - top < 1 ? SA[4] : dx < -2 ? SA[3] : SA[2]);
        }
      });
      if (hurt) crack(L, tcx + 3 * u, tcy - 2 * u, 1.8, 5 * u, GL[4], 4);
      // ---- the king
      const hx = X(0, 25) + (hurt ? -1 * u : idle ? sin(t) * 0.25 * u : 0), hy = Y(25.2) + (hurt ? 0.6 * u : 0);
      // a tattered maroon cape behind him
      drape(L, X(0, 20), Y(21.6), 9 * u, 13 * u, 9.6 * u, RD, { ragged: true, seed: 5, phase: t + (run ? 0.3 : 0), wave: 0.5 * u, folds: 4, lean: run ? sin(t) * u : 0 });
      const K = layer(F);
      for (const side of [-1, 1]) {
        const knee = [X(side * 2.2, 11), Y(11.5)], foot = [X(side * 2.4, 5) + (run ? side * sin(t) * 0.3 * u : 0), Y(5.6)];
        tube(K, [knee, foot], [1.5 * u, 1.2 * u], LIN, { rings: Math.max(3, R(1.3 * u)), ringC: LIN[1] });
        slab(K, [[foot[0] - 1.6 * u, foot[1] + 0.4 * u], [foot[0] + 1.6 * u, foot[1] + 0.4 * u], [foot[0] + 1.3 * u, foot[1] - 0.8 * u], [foot[0] - 1.3 * u, foot[1] - 0.8 * u]], G);
      }
      slab(K, [[X(-4, 15), Y(15)], [X(4, 15), Y(15)], [X(5.4, 10), Y(9.6)], [X(-5.4, 10), Y(9.6)]], LIN, { wide: true });
      for (let k = -3; k <= 3; k++) K.line(X(k * 1.2, 15), Y(14.4), X(k * 1.6, 10), Y(10), LIN[2]);
      put(L, K, true);
      sandStream(L, X(0, 9), Y(9.6), Y(7), 1.4 * u, t * 2, SA);
      const T = layer(F);
      // torso: wrapped linen, the chest torn open on a ribcage full of falling sand
      blob(T, [[X(0, 18), Y(18.6), 4.6 * u, 4.4 * u], [X(0, 15), Y(15.2), 3.8 * u, 1.6 * u]], LIN, { tex: 4 });
      for (let k = 0; k < 6; k++) { const y = Y(14.6 + k * 1.3); T.line(X(-5, 15), y + 1.2 * u, X(5, 15), y - 0.6 * u, LIN[2]); }
      const cvx = X(0.3, 18), cvy = Y(18.4);
      T.ellipse(cvx, cvy, 2.2 * u, 2.6 * u, C(MAW_D));
      sandStream(T, cvx, cvy - 2.4 * u, cvy + 2.4 * u, 1.3 * u, t * 2 + 0.3, SA, 0.2 * u);
      for (let k = 0; k < 3; k++) { const y = cvy - 1.6 * u + k * 1.3 * u; T.line(cvx - 2 * u, y, cvx - 0.4 * u, y + 0.5 * u, BONE_D); T.line(cvx + 2 * u, y, cvx + 0.4 * u, y + 0.5 * u, BONE_D); }
      T.line(cvx, cvy - 2.4 * u, cvx, cvy + 1 * u, BONE);
      slab(T, [[X(-4.2, 15), Y(15.6)], [X(4.2, 15), Y(15.6)], [X(4.2, 15), Y(14.4)], [X(-4.2, 15), Y(14.4)]], G);
      put(L, T, true);
      // arms: the crook hand (screen right) and the open hand of hours (screen left)
      const sR = [X(4.4, 21), Y(21)], sL = [X(-4.4, 21), Y(21)];
      const gripR = wind ? [X(6.5, 27), Y(27.5)] : hit ? [X(3, 14), Y(14.5)] : [X(7.4, 16), Y(16.4) + (idle ? sin(t) * 0.2 * u : 0)];
      const palm = wind ? [X(-8.5, 25), Y(26)] : hit ? [X(-9.5, 20), Y(20)] : hurt ? [X(-8.5, 14), Y(14)] : [X(-7.8, 17), Y(17.4) + (idle ? cos(t) * 0.3 * u : 0)];
      const A = layer(F);
      const elR = ik(sR, gripR, 4.2 * u, 4.6 * u, -1), elL = ik(sL, palm, 4.2 * u, 4.4 * u, 1);
      tube(A, [sR, elR, gripR], [1.4 * u, 1.1 * u], LIN, { rings: Math.max(3, R(1.2 * u)), ringC: LIN[1] });
      tube(A, [sL, elL, palm], [1.4 * u, 1.1 * u], LIN, { rings: Math.max(3, R(1.2 * u)), ringC: LIN[1] });
      for (const [x, y] of [gripR, palm]) blob(A, [[x, y, 1.2 * u, 1 * u]], SK);
      for (const [x, y] of [elR, elL]) blob(A, [[x, y, 1.1 * u, 0.7 * u]], G);
      put(L, A, true);
      // broad collar of gold, lapis and turquoise
      const Co = layer(F), cy0 = Y(22.4);
      const bands = [G, LA, G, TE, G];
      for (let k = 0; k < bands.length; k++) Co.ellipse(hx, cy0, (5.8 - k * 0.8) * u, (3.1 - k * 0.45) * u, bands[k][3]);
      for (let y = 0; y < Co.h; y++) if (y < cy0) for (let x = 0; x < Co.w; x++) Co.clear(x, y);
      cyl(Co, G, {});
      for (let k = 0; k < bands.length; k++) for (let a = 0.15; a < Math.PI - 0.1; a += 0.04) { const rx = (5.8 - k * 0.8 - 0.4) * u, ry = (3.1 - k * 0.45 - 0.22) * u; over(Co, hx + Math.cos(a) * rx, cy0 + Math.sin(a) * ry, bands[k][k % 2 ? 2 : 3]); }
      put(L, Co, true);
      // head: a linen-bound skull; the wrappings have parted over one burning eye
      const Hd = layer(F);
      blob(Hd, [[hx, hy, 3.6 * u, 3.9 * u], [hx, hy + 2 * u, 2.8 * u, 2.2 * u]], LIN, { tex: 2 });
      for (let k = 0; k < 6; k++) { const y = hy - 3.4 * u + k * 1.25 * u; Hd.line(hx - 3.8 * u, y + (k % 2 ? 0.4 : -0.3) * u, hx + 3.8 * u, y + (k % 2 ? -0.4 : 0.3) * u, LIN[2]); }
      // the gap in the bandages: dried dark skin across the eyes
      const fy = hy - 0.2 * u;
      blob(Hd, [[hx + 0.1 * u, fy, 3.2 * u, 1.5 * u]], SK);
      // nose ridge and a shrunken grin of teeth
      Hd.line(hx + 0.3 * u, fy + 0.6 * u, hx + 0.1 * u, fy + 1.8 * u, LIN[1]);
      blob(Hd, [[hx + 0.1 * u, hy + 2.5 * u, 1.9 * u, 0.85 * u]], SK);
      Hd.rect(R(hx - 1.4 * u), R(hy + 2.2 * u), R(2.9 * u), Math.max(2, R(0.6 * u)), C(MAW_D));
      teeth(Hd, [hx - 1.4 * u, hy + 2.2 * u], [hx + 1.5 * u, hy + 2.2 * u], 5, Math.max(1, 0.55 * u), 1, BONE);
      // a slipped strip of linen across the right eye
      slab(Hd, [[hx + 0.2 * u, fy - 1.4 * u], [hx + 3.8 * u, fy - 0.4 * u], [hx + 3.8 * u, fy + 1.1 * u], [hx + 0.4 * u, fy + 0.3 * u]], LIN.map((c) => dark(c, 0.86)));
      // plaited false beard
      tube(Hd, [[hx + 0.1 * u, hy + 3.3 * u], [hx + 0.2 * u, hy + 6.6 * u]], [0.95 * u, 0.75 * u], LA, { rings: Math.max(2, R(0.9 * u)), ringC: G[3] });
      blob(Hd, [[hx + 0.2 * u, hy + 6.8 * u, 0.95 * u, 0.6 * u]], G);
      put(L, Hd, true);
      // funnel crown: catches the sand from the neck of the upper bulb
      const Cr = layer(F), crT = Y(30.2);
      slab(Cr, [[hx - 2.8 * u, hy - 3.2 * u], [hx + 2.8 * u, hy - 3.2 * u], [hx + 4.6 * u, crT], [hx - 4.6 * u, crT]], G, { wide: true });
      for (const f of [0.35, 0.7]) { const y = lerp(hy - 3.2 * u, crT, f), w = lerp(2.8, 4.6, f) * u; Cr.line(hx - w + 1, y, hx + w - 1, y, LA[3], Math.max(1, R(0.5 * u))); }
      Cr.ellipse(hx, crT, 4.4 * u, 0.8 * u, Gd[1]);
      Cr.ellipse(hx, crT + 0.2 * u, 3.4 * u, 0.45 * u, SA[2]);
      // the uraeus: a little gold cobra rearing from the brow
      tube(Cr, bez([[hx - 0.4 * u, hy - 2.8 * u], [hx - 1.2 * u, hy - 4.6 * u], [hx - 0.2 * u, hy - 5.2 * u]], 8), [0.7 * u, 0.5 * u], G);
      blob(Cr, [[hx - 0.1 * u, hy - 5.4 * u, 0.9 * u, 0.7 * u]], G);
      put(L, Cr, true);
      sandStream(L, tcx, tcy + 3 * u, crT, 1 * u, t * 2, SA);
      // the crook: a gold staff banded in lapis, a black jackal's head for the hook
      const ang = wind ? -0.75 : hit ? -2.2 : run ? sin(t) * 0.08 : idle ? sin(t) * 0.04 : 0.1;
      const top = rotP([gripR[0], gripR[1] - 10 * u], gripR, ang), bot = rotP([gripR[0], gripR[1] + 9.5 * u], gripR, ang);
      const Ck = layer(F);
      tube(Ck, [bot, top], 0.65 * u, G, { rings: Math.max(3, R(2 * u)), ringC: LA[2] });
      const ux = Math.sin(ang), uy = -Math.cos(ang), px = Math.cos(ang), py = Math.sin(ang);   // up the staff, and across it
      const hd = [top[0] + ux * 0.6 * u, top[1] + uy * 0.6 * u];
      const JK = WD.map((c) => dark(c, 0.7));
      blob(Ck, [[top[0], top[1], 1.2 * u, 0.7 * u]], G);
      for (const e2 of [-0.6, 0.5]) horn(Ck, [hd[0] + px * e2 * u, hd[1] + py * e2 * u], [hd[0] + ux * 2.6 * u + px * e2 * u * 1.2, hd[1] + uy * 2.6 * u + py * e2 * u * 1.2], [hd[0] + ux * 4 * u + px * (e2 + 0.4) * u, hd[1] + uy * 4 * u + py * (e2 + 0.4) * u], 1.3 * u, e2 < 0 ? JK : WD);
      blob(Ck, [[hd[0] + ux * 0.6 * u, hd[1] + uy * 0.6 * u, 1.7 * u, 1.5 * u]], WD);
      tube(Ck, [[hd[0] + ux * 0.4 * u + px * 0.8 * u, hd[1] + uy * 0.4 * u + py * 0.8 * u], [hd[0] + px * 4 * u - ux * 0.4 * u, hd[1] + py * 4 * u - uy * 0.4 * u]], [1.1 * u, 0.55 * u], WD);
      put(L, Ck, true);
      put(F.p, L, false);
      const je = [hd[0] + ux * 1 * u + px * 0.7 * u, hd[1] + uy * 1 * u + py * 0.7 * u];
      eyeGlow(F, je[0] - 0.4 * u, je[1] - 0.3 * u, Math.max(1, 0.8 * u), Math.max(1, 0.6 * u), EYE[3]);
      if (hurt) F.p.line(hx - 2.4 * u, fy - 0.2 * u, hx - 0.6 * u, fy + 0.3 * u, C(INK), 2);
      else {
        const eh = wind || hit ? 1.4 * u : 1 * u;
        eyeGlow(F, hx - 2.1 * u, fy - eh * 0.5, 1.5 * u, eh, EYE[3]);
      }
      F.p.set(R(hx + 1.8 * u), R(fy + 0.8 * u), C(EYE[2])); F.e.set(R(hx + 1.8 * u), R(fy + 0.8 * u), C(EYE[2]));
      // the hours in his open hand: a little whirl of sand, a blast on the strike
      const vx = palm[0], vy = palm[1] - 1.6 * u, vr = (wind ? 3 : hit ? 4 : 1.8) * u;
      for (let k = 0; k < 3; k++) for (let s2 = 0; s2 < 1; s2 += 0.05) {
        const a = (t + k / 3 + s2 * 0.8) * TAU, rr = vr * (0.4 + s2 * 0.6), x = R(vx + Math.cos(a) * rr), y = R(vy - s2 * vr * 0.8 + Math.sin(a) * rr * 0.35);
        F.p.set(x, y, s2 > 0.7 ? SA[4] : SA[3]); if (s2 > 0.6) F.p.set(x + 1, y, SA[3]);
      }
      if (hit) plume(F, vx - 2 * u, vy, 5 * u, 2.4 * u, 0.3, SA, -0.6);
      F.mouth = [vx, vy];
    },
  },
  // Obelisk Keeper (obelisk_keeper): an obelisk that keeps watch over the hollow vault it was raised
  // on. One great carved eye under a heavy lintel, half-lidded and unimpressed; it weeps three lines
  // of glyphs that light up as they run down the shaft. Four severed colossus hands orbit it: one
  // open, one fist, one pointing judgement, one cupped. The eye opens wide to burn a beam.
  obelisk_keeper: {
    view: 'front', box: [32, 42], pivot: 0.5, idle: 6, idleFps: 4, hover: true,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const t = P.t, idle = P.act === 'idle', run = P.act === 'run', wind = P.atk === 1, hit = P.atk === 2, hurt = P.hurt;
      const S = pal5('stone', 5), Sd = S.map((c) => dark(c, 0.8)), G = pal5('gold', 5), Gd = G.map((c) => dark(c, 0.8)), H = pal5('sand', 5), Hd = H.map((c) => dark(c, 0.75));
      const AE = ['#4a1664', '#691fc4', '#a026ef', '#c860f0', '#f5afd6'];
      const lean = run ? 1.6 : hurt ? -1.4 : 0;
      const rise = wind ? 3 : hit ? -2.4 : idle ? sin(t) * 0.4 : run ? 0.6 : 0;
      const X = (x, y = 0) => ox + (x + lean * (y - 4) / 30) * u, Y = (y) => oy - (y + rise) * u;
      const L = layer(F);
      // ---- the hands: positions on a tilted orbit; far ones first
      const kinds = ['open', 'fist', 'point', 'cup'];
      const hands = kinds.map((kind, k) => {
        let a = (k / 4 + 0.125 + (idle ? sin(t + k * 0.25) * 0.02 : run ? -0.04 : 0)) * TAU;
        let hx = Math.cos(a) * 11.5, hy = 17 + Math.sin(a) * 3.2 + (idle ? sin(t * 2 + k * 0.3) * 0.5 : 0), depth = Math.sin(a);
        let ang = Math.atan2(-1, Math.cos(a) * 0.3) + (hx > 0 ? 0.5 : -0.5);   // fingers up and outward
        if (wind) { hy += 10 + depth; hx *= 0.8; ang = hx > 0 ? -0.9 : -2.2; }
        if (hit) { hy = 2.2 + depth * 0.8; hx *= 0.9; ang = Math.PI / 2 + (hx > 0 ? -0.3 : 0.3); }
        if (hurt) { hx *= 1.25; hy += 2; }
        if (run) { hy += 1.5; hx *= 0.9; }
        return { kind, k, hx, hy, depth, ang };
      });
      const drawHand = (h) => {
        const far = h.depth < 0;
        const sc = (far ? 1.15 : 1.45) * u;
        stoneHand(L, [X(h.hx, h.hy) - Math.cos(h.ang) * 1.6 * sc, Y(h.hy) - Math.sin(h.ang) * 1.6 * sc], h.ang, sc, h.kind, far ? Hd : H, far ? Gd : G, h.hx > 0 ? -1 : 1);
      };
      hands.filter((h) => h.depth < 0).forEach(drawHand);
      // ---- the shaft: a basalt needle, front face lit, right face in shadow
      const B = layer(F);
      const bw = 4.2, tw = 2.9, b0 = 4, b1 = 31;
      slab(B, [[X(bw, b0), Y(b0)], [X(bw + 1.6, b0 + 0.8), Y(b0 + 0.8)], [X(tw + 1.1, b1 + 0.4), Y(b1 + 0.4)], [X(tw, b1), Y(b1)]], Sd);
      slab(B, [[X(-bw, b0), Y(b0)], [X(bw, b0), Y(b0)], [X(tw, b1), Y(b1)], [X(-tw, b1), Y(b1)]], S, { wide: true });
      // the chipped top corner
      facet(B, [[X(-tw, b1), Y(b1) - 1], [X(-tw + 1.6, b1), Y(b1) - 1], [X(-tw, b1 - 2.4), Y(b1 - 2.4)]], [0, 0, 0, 0]);
      for (let y = R(Y(b1)); y <= Y(b1 - 2.4); y++) for (let x = R(X(-tw - 0.5, b1)); x <= X(-tw + 1.8, b1); x++) {
        const fy = (Y(b1 - 2.4) - y) / (2.4 * u), fx = (x - X(-tw, b1)) / (1.8 * u);
        if (fx < fy) B.clear(x, y);
      }
      // a carved inset panel down the face, for the glyph tears
      const pt = 18.6, pb = 6.2;
      for (let y = R(Y(pt)); y <= Y(pb); y++) {
        const f = (Y(pb) - y) / (Y(pb) - Y(pt)), hw = lerp(bw - 1.3, tw + 0.2, (lerp(pb, pt, f) - b0) / (b1 - b0)) * u;
        const cx = X(0, lerp(pb, pt, f));
        for (let x = R(cx - hw); x <= cx + hw; x++) {
          const edgeL = x < cx - hw + 1, edgeR = x > cx + hw - 1, edgeT = y < Y(pt) + 1, edgeB = y > Y(pb) - 1;
          B.set(x, y, edgeL || edgeT ? S[1] : edgeR || edgeB ? S[4] : S[2]);
        }
      }
      // cracks in the basalt
      crack(B, X(2, 10), Y(10), 1.2, 4 * u, S[0], 6);
      crack(B, X(-2.5, 27), Y(27), 2, 3 * u, S[0], 2);
      if (hurt) crack(B, X(1, 24), Y(24), 1.9, 7 * u, S[0], 13);
      put(L, B, true);
      // ---- the pyramidion: gold, a lit face and a shadowed face
      const Pd = layer(F);
      slab(Pd, [[X(tw, b1), Y(b1)], [X(tw + 1.1, b1 + 0.4), Y(b1 + 0.4)], [X(0.2, b1 + 5.4), Y(b1 + 5.4)]], Gd);
      slab(Pd, [[X(-tw - 0.3, b1), Y(b1)], [X(tw + 0.3, b1), Y(b1)], [X(0, b1 + 5.4), Y(b1 + 5.4)]], G, { wide: true });
      facetOn(Pd, [[X(-tw, b1), Y(b1) - 1], [X(-0.3, b1 + 5), Y(b1 + 5)], [X(-0.3, b1), Y(b1) - 1]], G[4], G[3]);
      put(L, Pd, true);
      // the eye: a carved almond socket under a heavy lintel
      const ex = X(0, 23), ey = Y(23);
      const open = hurt ? 0 : wind || hit ? 1 : idle && P.i === 4 ? 0.12 : run ? 0.6 : 0.5;
      const Ey = layer(F);
      const alm = (k, dy = 0) => { const pts = []; for (let j = 0; j <= 16; j++) { const f = j / 16, x = ex + (f - 0.5) * 6.4 * k * u, h = Math.sin(f * Math.PI) * 1.65 * k * u; pts.push([x, ey + h + dy]); } for (let j = 16; j >= 0; j--) { const f = j / 16, x = ex + (f - 0.5) * 6.4 * k * u, h = Math.sin(f * Math.PI) ** 0.8 * 1.9 * k * u; pts.push([x, ey - h + dy]); } return pts; };
      Ey.poly(alm(1.18, 0.1 * u), S[0]);
      Ey.poly(alm(1), C('#f3e1b5'));
      Ey.poly(alm(1).map(([x, y]) => [x, y]).filter((_, j) => j > 16).concat([[ex + 3.2 * u, ey], [ex - 3.2 * u, ey]]), C('#cfa978'));
      put(L, Ey, false);
      put(F.p, L, false);
      // iris and slit pupil, looking around while idle
      const look = idle ? [[0, 0], [0.5, 0], [0.5, 0.1], [0, 0], [-0.6, 0], [-0.4, 0.1]][P.i] : [0, 0.15];
      const ix = ex + look[0] * u * 1.6, iy = ey + look[1] * u;
      const ir = (wind || hit ? 1.7 : 1.45) * u;
      glow(F, ix, iy, ir, hurt ? hurtC : AE[2], { core: AE[4] });
      F.p.rect(R(ix - 0.3 * u), R(iy - ir * 0.8), Math.max(1, R(0.55 * u)), Math.max(2, R(ir * 1.6)), C(VOID));
      F.p.set(R(ix - ir * 0.5), R(iy - ir * 0.5), WHITE);
      // the stone lid comes down over the top of the eye
      if (open < 1) {
        const top = ey - 2 * u, lidY = lerp(ey + 1.7 * u, top, open);
        const A = alm(1.04);
        for (let y = R(top - 1); y <= lidY; y++) for (let x = R(ex - 3.4 * u); x <= ex + 3.4 * u; x++) {
          const f = (x - (ex - 3.2 * u)) / (6.4 * u);
          if (f < 0 || f > 1) continue;
          const h = Math.sin(f * Math.PI) ** 0.8 * 1.95 * u;
          if (y < ey - h || y > lidY + Math.sin(f * Math.PI) * 0.5 * u) continue;
          F.p.set(x, y, y > lidY + Math.sin(f * Math.PI) * 0.5 * u - 1.5 ? S[1] : y < ey - h + 1.5 ? S[4] : S[3]);
          F.e.clear(x, y);
        }
      }
      // lintel brow, cracked on one side
      const Lt = layer(F);
      slab(Lt, [[X(-4.4, 26), Y(25.2)], [X(4.6, 26), Y(25.7)], [X(4.3, 27), Y(27)], [X(-4.1, 27), Y(26.6)]], S, { wide: true });
      facet(Lt, [[X(2.6, 26), Y(25.4)], [X(3.4, 27), Y(26.9)], [X(2.9, 26), Y(26.2)]], S[1]);
      put(F.p, Lt, true);
      // three tears of glyphs down the panel; a pulse of light runs down them
      const pulse = idle ? P.i / 6 : run ? 0.3 : 0.9;
      for (let c = -1; c <= 1; c++) for (let r2 = 0; r2 < 4; r2++) {
        const y = 17.4 - r2 * 3, x = c * 1.9 - 0.6;
        const lit = wind || hit || Math.abs((r2 / 4) - pulse) < 0.3 || (r2 + c) % 3 === 0;
        const col = hurt ? S[1] : lit ? AE[3] : AE[0];
        if (lit && !hurt) rune(F, X(x, y), Y(y), Math.max(2, R(1.3 * u)), col, 7 + c * 5 + r2);
        else { const sc = C(col); const n = Math.max(2, R(1.3 * u)), xx = R(X(x, y)), yy = R(Y(y)); F.p.line(xx, yy, xx + n, yy + n, sc); F.p.line(xx + n, yy, xx, yy + n, sc); }
      }
      // tear grooves under the eye
      for (const c of [-1.6, 0, 1.6]) { const x = R(ex + c * u); for (let y = R(ey + 1.9 * u); y < Y(19); y++) { F.p.set(x, y, C(hurt ? S[0] : AE[1])); if (wind || hit) F.e.set(x, y, C(AE[2])); } }
      // the near hands
      const L2 = layer(F);
      hands.filter((h) => h.depth >= 0).forEach((h) => {
        const far = false, sc = 1.45 * u;
        stoneHand(L2, [X(h.hx, h.hy) - Math.cos(h.ang) * 1.6 * sc, Y(h.hy) - Math.sin(h.ang) * 1.6 * sc], h.ang, sc, h.kind, H, G, h.hx > 0 ? -1 : 1);
      });
      put(F.p, L2, false);
      // the beam's first flare on the strike
      if (hit) { for (const Lr of [F.p, F.e]) { Lr.ellipse(ex, ey + 2.8 * u, 2.2 * u, 1 * u, C(AE[3])); Lr.ellipse(ex, ey + 2.8 * u, 1.2 * u, 0.6 * u, C(AE[4])); } }
      if (hurt) for (let j = 0; j < 3; j++) rock(F.p, X(3 + j * 1.5, 26 - j * 2), Y(26 - j * 2), 0.8 * u, 0.6 * u, S, 70 + j);
      F.mouth = [ex, ey];
    },
  },
};
