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

// carved glyphs (our own little pictograms), n px tall at (x, y) top-left: 0 sun, 1 water, 2 eye,
// 3 reed, 4 bird, 5 hand, 6 loop-cross, 7 steps. Strokes into L (and e when given).
function glyph(L, e, x, y, n, kind, c) {
  const cc = C(c), q = (a) => R(a * n);
  const ln = (a, b, c2, d) => { L.line(x + q(a), y + q(b), x + q(c2), y + q(d), cc); if (e) e.line(x + q(a), y + q(b), x + q(c2), y + q(d), cc); };
  const ring = (cx, cy, r) => { L.ring(x + cx * n, y + cy * n, r * n, cc, 1); if (e) e.ring(x + cx * n, y + cy * n, r * n, cc, 1); };
  const dot = (a, b) => { L.set(x + q(a), y + q(b), cc); if (e) e.set(x + q(a), y + q(b), cc); };
  switch (kind % 8) {
    case 0: ring(0.5, 0.5, 0.48); dot(0.5, 0.5); break;
    case 1: for (const yy of [0.25, 0.7]) { ln(0, yy, 0.25, yy - 0.2); ln(0.25, yy - 0.2, 0.5, yy); ln(0.5, yy, 0.75, yy - 0.2); ln(0.75, yy - 0.2, 1, yy); } break;
    case 2: ln(0, 0.4, 0.5, 0.15); ln(0.5, 0.15, 1, 0.4); ln(0, 0.4, 0.5, 0.65); ln(0.5, 0.65, 1, 0.4); dot(0.5, 0.4); ln(0.3, 0.65, 0.2, 1); break;
    case 3: ln(0.5, 0, 0.5, 1); ln(0.5, 0.2, 0.15, 0.05); ln(0.5, 0.45, 0.85, 0.3); ln(0.2, 1, 0.8, 1); break;
    case 4: ln(0.2, 0.2, 0.45, 0.35); ln(0.45, 0.35, 0.45, 0.8); ln(0.45, 0.8, 1, 0.75); ln(0.45, 0.45, 0.9, 0.5); ln(0.3, 0.8, 0.3, 1); break;
    case 5: ln(0, 0.8, 0.7, 0.8); ln(0.7, 0.8, 1, 0.5); ln(0.15, 0.8, 0.15, 0.2); ln(0.4, 0.8, 0.4, 0.1); ln(0.6, 0.8, 0.6, 0.25); break;
    case 6: ring(0.5, 0.27, 0.25); ln(0.5, 0.52, 0.5, 1); ln(0.1, 0.62, 0.9, 0.62); break;
    default: ln(0, 1, 0.33, 1); ln(0.33, 1, 0.33, 0.66); ln(0.33, 0.66, 0.66, 0.66); ln(0.66, 0.66, 0.66, 0.33); ln(0.66, 0.33, 1, 0.33); ln(1, 0.33, 1, 0);
  }
  return L;
}

// lowest opaque pixel of a column (or -1)
const lowY2 = (L, x) => { for (let y = L.h - 1; y >= 0; y--) if (L.a(x, y) > 100) return y; return -1; };
// ---- stained glass
const GLASS = {
  ruby: ['#4a1420', '#8a1e2c', '#c22a3c', '#e8506a', '#f48a9a'],
  rose: ['#4a1a30', '#7a2f4a', '#a94a68', '#e48fb0', '#f4bccf'],
  amber: ['#7a1e14', '#c2401c', '#ec7a2a', '#f8b848', '#fff0b0'],
  violet: ['#2f0d48', '#4a1664', '#691fc4', '#a026ef', '#c860f0'],
  blue: ['#120c30', '#172d64', '#243e7b', '#3973af', '#8cb8de'],
};
const LEAD = ['#140f1c', '#1a1f2c', '#2a3240', '#3e4a5a', '#6e7a9a'];
const GLASS_MIX = ['ruby', 'ruby', 'rose', 'amber', 'ruby', 'violet', 'rose', 'ruby', 'rose', 'amber', 'ruby', 'blue'];
const inPoly = (pts, x, y) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
// Fill a shape with lead-lined panes (a Voronoi of seeds). Works in local units: toLocal(px, py)
// maps a pixel centre to local coords, inside(lx, ly) tests the shape. seeds: [{ x, y, pal, lit }].
// Writes into L (colour) and e (glow of lit panes, may be null). lead: line width in px; px: u.
function stained(L, e, box, toLocal, inside, seeds, u, o = {}) {
  const lead = (o.lead ?? 2) / u, glowK = o.glow ?? 0.55;
  const [x0, y0, x1, y1] = box;
  const id = new Int16Array(L.w * L.h).fill(-1);
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(L.h - 1, y1); y++) for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(L.w - 1, x1); x++) {
    const [lx, ly] = toLocal(x + 0.5, y + 0.5);
    if (!inside(lx, ly)) continue;
    let b1 = 1e9, b2 = 1e9, k1 = 0;
    for (let k = 0; k < seeds.length; k++) { const dx = lx - seeds[k].x, dy = ly - seeds[k].y, d = dx * dx + dy * dy; if (d < b1) { b2 = b1; b1 = d; k1 = k; } else if (d < b2) b2 = d; }
    const d1 = Math.sqrt(b1), d2 = Math.sqrt(b2);
    if (d2 - d1 < lead) { L.set(x, y, LEAD[ly > seeds[k1].y ? 3 : 2]); continue; }
    const sd = seeds[k1], G = GLASS[sd.pal];
    // flat bands inside each pane: lit toward the top-left, dark toward the bottom-right
    const rx = lx - sd.x, ry = ly - sd.y, l = -rx * 0.6 + ry * 0.8;
    const ti = l > 0.75 ? 4 : l > 0.15 ? 3 : l > -0.7 ? 2 : 1;
    L.set(x, y, G[ti]);
    id[y * L.w + x] = k1;
    if (e && sd.lit) e.set(x, y, C(G[Math.min(4, ti + 1)]).map((v, i) => (i === 3 ? 255 : v * glowK + 255 * (1 - glowK) * 0)));
  }
  // a lead border round the whole shape
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(L.h - 1, y1); y++) for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(L.w - 1, x1); x++) {
    if (id[y * L.w + x] < 0) continue;
    const out = (xx, yy) => !L.a(xx, yy);
    if (out(x - 1, y) || out(x, y - 1)) { L.set(x, y, LEAD[3]); if (e) e.clear(x, y); }
    else if (out(x + 1, y) || out(x, y + 1) || out(x + 2, y) || out(x, y + 2)) { L.set(x, y, LEAD[1]); if (e) e.clear(x, y); }
  }
  return L;
}
// jittered seeds over a local rectangle
function seedGrid(x0, y0, x1, y1, step, seed, pals = GLASS_MIX, litP = 0.4, litT = 0) {
  const out = [];
  let k = 0;
  for (let y = y0; y <= y1; y += step * 0.85) for (let x = x0 + ((k & 1) ? step * 0.5 : 0); x <= x1; x += step, k++) {
    const h = hash2(R(x * 10), R(y * 10), seed);
    out.push({ x: x + (hash2(k, 1, seed) - 0.5) * step * 0.6, y: y + (hash2(k, 2, seed) - 0.5) * step * 0.6, pal: pals[Math.floor(h * pals.length) % pals.length], lit: ((h * 7 + litT) % 1) < litP });
  }
  return out;
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
  ash_lich: { design: 'ash_lich', name: 'The Ash Lich' },
  glass_wyrm: { design: 'glass_wyrm', name: 'The Glass Wyrm' },
  ozymar: { design: 'ozymar', name: 'Ozymar the Unburied' },
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
      const S = pal5('slate', 5), Sd = S.map((c) => dark(c, 0.78)), G = pal5('gold', 5), Gd = G.map((c) => dark(c, 0.86)), H = pal5('sand', 5), Hd = H.map((c) => dark(c, 0.88));
      const AE = ['#4a1664', '#691fc4', '#a026ef', '#c860f0', '#f5afd6'];
      const lean = run ? 1.6 : hurt ? -1.4 : 0;
      const rise = wind ? 3 : hit ? -2.4 : idle ? sin(t) * 0.4 : run ? 0.6 : 0;
      const X = (x, y = 0) => ox + (x + lean * (y - 4) / 30) * u, Y = (y) => oy - (y + rise) * u;
      const L = layer(F);
      // ---- the hands: positions on a tilted orbit; far ones first
      const kinds = ['open', 'fist', 'point', 'cup'];
      const hands = kinds.map((kind, k) => {
        let a = (k / 4 + 0.125 + (idle ? sin(t + k * 0.25) * 0.02 : run ? -0.04 : 0)) * TAU;
        let hx = Math.cos(a) * 10.5, hy = 18 + Math.sin(a) * 3.2 + (idle ? sin(t * 2 + k * 0.3) * 0.5 : 0), depth = Math.sin(a);
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
      const bw = 3.7, tw = 2.6, b0 = 3, b1 = 33;
      slab(B, [[X(bw, b0), Y(b0)], [X(bw + 1.6, b0 + 0.8), Y(b0 + 0.8)], [X(tw + 1.1, b1 + 0.4), Y(b1 + 0.4)], [X(tw, b1), Y(b1)]], Sd);
      slab(B, [[X(-bw, b0), Y(b0)], [X(bw, b0), Y(b0)], [X(tw, b1), Y(b1)], [X(-tw, b1), Y(b1)]], S, { wide: true });
      // a carved inset panel down the face, for the glyph tears
      const pt = 19.6, pb = 4.8;
      for (let y = R(Y(pt)); y <= Y(pb); y++) {
        const f = (Y(pb) - y) / (Y(pb) - Y(pt)), hw = lerp(bw - 1.3, tw + 0.2, (lerp(pb, pt, f) - b0) / (b1 - b0)) * u;
        const cx = X(0, lerp(pb, pt, f));
        for (let x = R(cx - hw); x <= cx + hw; x++) {
          const edgeL = x < cx - hw + 1, edgeR = x > cx + hw - 1, edgeT = y < Y(pt) + 1, edgeB = y > Y(pb) - 1;
          B.set(x, y, edgeL || edgeT ? S[1] : edgeR || edgeB ? S[4] : S[2]);
        }
      }
      // cracks in the basalt
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
      const ex = X(0, 24.6), ey = Y(24.6);
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
      slab(Lt, [[X(-3.5, 27.6), Y(27.6)], [X(-0.4, 27.6), Y(27)], [X(3.6, 27.6), Y(28)], [X(3.4, 28.8), Y(29)], [X(-0.2, 28.8), Y(28.1)], [X(-3.3, 28.8), Y(28.7)]], S, { wide: true });
      facet(Lt, [[X(2.2, 27.6), Y(27.7)], [X(3, 28.8), Y(28.9)], [X(2.6, 27.6), Y(28.3)]], S[1]);
      put(F.p, Lt, true);
      // a column of glyphs down the panel; a pulse of light runs down it like a tear
      const pulse = idle ? P.i / 6 : run ? 0.3 : 0.9, gn = Math.max(5, R(2.6 * u));
      for (let r2 = 0; r2 < 4; r2++) {
        const y = 18.6 - r2 * 3.5;
        const lit = wind || hit || Math.abs((r2 / 4) - pulse) < 0.22;
        glyph(F.p, lit && !hurt ? F.e : null, R(X(0, y) - gn / 2), R(Y(y)), gn, [0, 2, 4, 6][r2], hurt ? S[0] : lit ? AE[3] : S[0]);
      }
      // tear grooves under the eye
      for (const c of [-1.6, 0, 1.6]) { const x = R(ex + c * u); for (let y = R(ey + 1.9 * u); y < Y(20); y++) { F.p.set(x, y, C(hurt ? S[0] : AE[1])); if (wind || hit) F.e.set(x, y, C(AE[2])); } }
      // the near hands
      const L2 = layer(F);
      hands.filter((h) => h.depth >= 0).forEach((h) => {
        const far = false, sc = 1.45 * u;
        stoneHand(L2, [X(h.hx, h.hy) - Math.cos(h.ang) * 1.6 * sc, Y(h.hy) - Math.sin(h.ang) * 1.6 * sc], h.ang, sc, h.kind, H, G, h.hx > 0 ? -1 : 1);
      });
      put(F.p, L2, false);
      // the beam's first flare on the strike
      if (hit) for (let k = 0; k < 8; k++) {
        const a = k / 8 * TAU + 0.2, r0 = 2.6 * u, r1 = (k % 2 ? 4.6 : 6.4) * u;
        for (const Lr of [F.p, F.e]) Lr.line(ex + Math.cos(a) * r0 * 1.3, ey + Math.sin(a) * r0 * 0.8, ex + Math.cos(a) * r1 * 1.3, ey + Math.sin(a) * r1 * 0.8, C(k % 2 ? AE[3] : AE[4]), 2);
      }
      if (hurt) for (let j = 0; j < 3; j++) rock(F.p, X(3.4 + j * 1.5, 28 - j * 2), Y(28 - j * 2), 0.8 * u, 0.6 * u, S, 70 + j);
      F.mouth = [ex, ey];
    },
  },
  // The Ash Lich (ash_lich): a court sorcerer who had himself cremated and would not stop burning.
  // His body is the iron brazier of his own pyre: the ribcage a curved grate full of fire, three
  // tripod legs with claw feet dangling under a robe of ash that crumbles as it falls. The skull is
  // lit from below by the fire; a crown of melted candles drips wax over one socket.
  ash_lich: {
    view: 'front', box: [32, 42], pivot: 0.5, idle: 6, idleFps: 6, hover: true,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const t = P.t, idle = P.act === 'idle', run = P.act === 'run', wind = P.atk === 1, hit = P.atk === 2, hurt = P.hurt;
      const IR = pal5('steel', 4), IRd = IR.map((c) => dark(c, 0.78)), AS = pal5('stone', 5), BN = pal5('sand', 6), WX = pal5('red', 5);   // deep red wax
      const BK = ramp('#3a2a2c');   // charred bone
      const lean = run ? -1.4 : hurt ? 1.2 : 0;
      const bob = idle ? sin(t) * 0.4 : 0;
      const X = (x, y = 0) => ox + (x + lean * (y - 10) / 25) * u, Y = (y) => oy - (y + bob) * u;
      const fireK = hurt ? 0.45 : wind ? 1.5 : hit ? 1.25 : 1;
      const L = layer(F);
      // ---- the mantle of ash: two tattered panels hanging open from the shoulders
      for (const side of [-1, 1]) {
        const M = layer(F), pts = [[X(side * 3.8, 23), Y(23.4)], [X(side * 7.6, 23), Y(23)], [X(side * 9.4, 20), Y(19.5)]];
        const hemO = side * (11.2 + (run ? -1 : 0)), hemI = side * 4.4;
        const n = 7;
        for (let k = 0; k <= n; k++) {
          const f = k / n, x = lerp(hemO, hemI, f), sway = idle ? sin(t + f * 0.6) * 0.5 : run ? 2 * f : 0;
          const y = lerp(5, 9, f) + (k % 2 ? 1.6 + hash2(k, side + 3, 2) * 1.4 : 0);
          pts.push([X(x + sway, y), Y(y)]);
        }
        pts.push([X(side * 3.6, 14), Y(14)]);
        M.poly(pts, AS[3]);
        cyl(M, AS, { wide: true });
        // folds
        for (let k = 1; k <= 3; k++) { const f = k / 4; M.line(X(side * lerp(4.8, 7.4, f), 22), Y(22), X(side * lerp(5, 10.6, f), 8), Y(8), AS[2]); }
        // smouldering hem
        for (let x = 0; x < M.w; x++) { const y = lowY2(M, x); if (y > 0 && hash2(x >> 1, 3, side + 5) > 0.55) { M.set(x, y, C(HOT[1])); F.e.set(x, y, C(HOT[1])); if (hash2(x, 4, 1) > 0.6) { M.set(x, y - 1, C(HOT[2])); F.e.set(x, y - 1, C(HOT[2])); } } }
        put(L, M, true);
      }
      // ---- tripod legs: three iron legs with lion-claw feet, swinging under the grate
      const legs = [[-3.6, 3, 0.2], [0.4, 2.2, 0.55], [3.8, 3.2, 0.85]];
      for (const [lx, ly, ph] of legs) {
        const sw = idle ? sin(t + ph) * 0.6 : run ? 1.6 : hurt ? -0.8 : 0;
        const top = [X(lx * 0.45, 13), Y(13)], foot = [X(lx + sw, ly), Y(ly)];
        const Lg = layer(F);
        tube(Lg, bez([top, [lerp(top[0], foot[0], 0.3) + lx * 0.3 * u, lerp(top[1], foot[1], 0.5)], foot], 10), [0.8 * u, 0.55 * u], ph === 0.55 ? IRd : IR);
        blob(Lg, [[lerp(top[0], foot[0], 0.45), lerp(top[1], foot[1], 0.45), 0.9 * u, 0.6 * u]], IR);
        blob(Lg, [[foot[0], foot[1], 1.2 * u, 0.9 * u]], IR);
        for (const d of [-1, 0, 1]) horn(Lg, [foot[0] + d * 0.7 * u, foot[1] + 0.3 * u], [foot[0] + d * 1.1 * u, foot[1] + 1 * u], [foot[0] + d * 1.3 * u, foot[1] + 1.4 * u], 0.6 * u, IRd);
        put(L, Lg, true);
      }
      put(F.p, L, false);
      // ---- the fire inside the grate (behind the bars)
      const fx = X(0, 18);
      for (const Lr of [F.p, F.e]) { Lr.ellipse(fx, Y(15.5), 4 * u, 2.6 * u, C(HOT[1])); Lr.ellipse(fx, Y(15.2), 3 * u, 1.6 * u, C(HOT[2])); }
      flame(F, fx - 1.8 * u, Y(15), 7 * fireK * u, 3.6 * u, t, {});
      flame(F, fx + 2 * u, Y(15), 6 * fireK * u, 3.2 * u, t + 0.4, {});
      flame(F, fx, Y(14.6), 10 * fireK * u, 4.8 * u, t + 0.2, {});
      // ---- the grate: an iron basket shaped like a ribcage, a spine down the middle
      const G2 = layer(F);
      const rimY = Y(23.2), botY = Y(13.2);
      const ribX = (f, y) => { const k = (rimY - y) / (rimY - botY); return X(0, 18) + f * lerp(5.8, 2.4, k * k) * u; };
      for (const f of [-1, 1]) { const pts = []; for (let y = rimY; y <= botY; y += 1) pts.push([ribX(f, y), y]); tube(G2, pts, Math.max(0.6, 0.5 * u), IR); }
      for (let k = 0; k < 4; k++) {
        const y = lerp(rimY + 1.8 * u, botY - 1.4 * u, k / 3.3);
        for (const side of [-1, 1]) {
          const pts = []; for (let f = 0; f <= 1.001; f += 0.1) pts.push([ribX(side * f, y), y - Math.sin(f * Math.PI * 0.9) * 1.1 * u + f * 0.8 * u]);
          tube(G2, pts, Math.max(0.6, 0.48 * u), k % 2 ? IRd : IR);
        }
      }
      tube(G2, [[X(0, 23), rimY], [X(0, 13), botY]], 0.65 * u, IR, { rings: Math.max(2, R(1.2 * u)), ringC: IR[0] });
      blob(G2, [[X(0, 13), botY, 2.8 * u, 1.1 * u]], IR);
      // rim: a heavy iron ring with spiked finials at the shoulders
      const Rm = layer(F), rcx = X(0, 23);
      Rm.ellipse(rcx, rimY, 6.6 * u, 1.6 * u, IR[3]);
      for (let y = R(rimY - 0.9 * u); y <= rimY + 0.9 * u; y++) for (let x = R(rcx - 5.4 * u); x <= rcx + 5.4 * u; x++) if (((x + 0.5 - rcx) / (5.4 * u)) ** 2 + ((y + 0.5 - rimY + 0.1 * u) / (0.85 * u)) ** 2 <= 1) Rm.clear(x, y);
      cyl(Rm, IR, {});
      for (const side of [-1, 1]) {
        horn(Rm, [rcx + side * 6 * u, rimY], [rcx + side * 7.4 * u, rimY - 1.4 * u], [rcx + side * 7.6 * u, rimY - 3.6 * u], 1.3 * u, IR);
        horn(Rm, [rcx + side * 4 * u, rimY - 0.8 * u], [rcx + side * 4.6 * u, rimY - 2 * u], [rcx + side * 4.4 * u, rimY - 3 * u], 0.9 * u, IRd);
      }
      put(G2, Rm, true);
      put(F.p, G2, true);
      // ---- arms: charred bone in ash sleeves
      const sL = [X(-6.4, 22), Y(22)], sR = [X(6.4, 22), Y(22)];
      const castH = wind ? [X(-9.5, 32), Y(32)] : hit ? [X(-12.5, 21), Y(21)] : hurt ? [X(-10, 15), Y(15)] : [X(-10.4, 18.5), Y(18.5) + (idle ? sin(t) * 0.4 * u : 0)];
      const offH = wind ? [X(10, 29), Y(29)] : hit ? [X(9.6, 17), Y(17)] : hurt ? [X(10.6, 16), Y(16)] : [X(9.6, 15), Y(15) + (idle ? cos(t) * 0.3 * u : 0)];
      const arm = (sh, hand, side) => {
        const A = layer(F);
        const el = ik(sh, hand, 5 * u, 5.2 * u, side);
        const dx = el[0] - sh[0], dy = el[1] - sh[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
        // the sleeve hangs open, wider at the cuff
        const c0 = [el[0] - nx * 2.4 * u, el[1] - ny * 2.4 * u + 1.2 * u], c1 = [el[0] + nx * 2.2 * u, el[1] + ny * 2.2 * u + 1.8 * u];
        const sp = [[sh[0] + nx * 1.6 * u, sh[1] + ny * 1.6 * u], [sh[0] - nx * 1.6 * u, sh[1] - ny * 1.6 * u]];
        for (let k = 0; k <= 6; k++) { const f = k / 6, d = k % 2 ? 2.2 * u : 0; sp.push([lerp(c0[0], c1[0], f), lerp(c0[1], c1[1], f) + d]); }
        const SL = AS.map((c) => dark(c, 0.78));
        A.poly(sp, SL[3]);
        cyl(A, SL, { wide: true });
        for (let k = 1; k < 6; k += 2) { const f = k / 6; const x = lerp(c0[0], c1[0], f), y = lerp(c0[1], c1[1], f) + 2.2 * u; for (const Lr of [A, F.e]) Lr.set(R(x), R(y) - 1, C(HOT[1])); }
        tube(A, [el, hand], [0.85 * u, 0.6 * u], BK);
        for (let k = -1; k <= 1; k++) {
          const a = Math.atan2(hand[1] - el[1], hand[0] - el[0]) + k * 0.5;
          const tip = [hand[0] + Math.cos(a) * 2.4 * u, hand[1] + Math.sin(a) * 2.4 * u];
          tube(A, [hand, [lerp(hand[0], tip[0], 0.5) + Math.cos(a + 1.2 * side) * 0.5 * u, lerp(hand[1], tip[1], 0.5) + Math.sin(a + 1.2 * side) * 0.5 * u], tip], [0.45 * u, 0.25 * u], BK);
        }
        blob(A, [[hand[0], hand[1], 1.1 * u, 1 * u]], BK);
        put(F.p, A, true);
        for (const Lr of [F.p, F.e]) Lr.set(R(hand[0]), R(hand[1]), C(HOT[3]));
      };
      arm(sR, offH, -1); arm(sL, castH, 1);
      // ---- the skull, lit from below by its own fire
      const hx = X(0, 28) + (hurt ? 1 * u : 0), hy = Y(27.8) + (hurt ? 0.4 * u : 0);
      const Sk = layer(F);
      tube(Sk, [[X(0, 23), rimY], [hx, hy + 2 * u]], 0.8 * u, IRd, { rings: Math.max(2, R(0.8 * u)) });
      blob(Sk, [[hx, hy - 0.6 * u, 3.9 * u, 3.7 * u], [hx, hy + 1.6 * u, 2.8 * u, 2 * u]], BN, { tex: 3 });
      for (let y = R(hy + 0.4 * u); y < hy + 4 * u; y++) for (let x = R(hx - 4 * u); x <= hx + 4 * u; x++) if (Sk.a(x, y)) Sk.set(x, y, mixc(Sk.get(x, y), C(HOT[2]), y > hy + 1.8 * u ? 0.5 : 0.3));
      // brow ridge shadow, sockets (the right one bigger), nose
      Sk.line(hx - 3 * u, hy - 1.7 * u, hx + 3 * u, hy - 1.9 * u, BN[2]);
      Sk.ellipse(hx - 1.6 * u, hy - 0.3 * u, 1.3 * u, 1.2 * u, C(VOID));
      Sk.ellipse(hx + 1.7 * u, hy - 0.3 * u, 1.5 * u, 1.4 * u, C(VOID));
      Sk.poly([[hx - 0.5 * u, hy + 1.7 * u], [hx + 0.5 * u, hy + 1.7 * u], [hx, hy + 0.6 * u]], C(VOID));
      put(F.p, Sk, true);
      const jaw = wind ? 1.6 * u : hit ? 2 * u : idle && P.i === 3 ? 0.7 * u : 0.2 * u;
      const Jw = layer(F);
      blob(Jw, [[hx, hy + 3.2 * u + jaw, 2.3 * u, 1 * u]], BN.map((c) => mixc(c, C(HOT[2]), 0.4)));
      teeth(Jw, [hx - 1.8 * u, hy + 2.6 * u + jaw], [hx + 1.8 * u, hy + 2.6 * u + jaw], 5, Math.max(1, 0.5 * u), -1, BONE);
      put(F.p, Jw, true);
      teeth(F.p, [hx - 1.9 * u, hy + 2.3 * u], [hx + 1.9 * u, hy + 2.3 * u], 6, Math.max(1, 0.6 * u), 1, BONE);
      if (jaw > 0.5 * u) for (const Lr of [F.p, F.e]) Lr.ellipse(hx, hy + 2.7 * u + jaw * 0.5, 1.4 * u, jaw * 0.35, C(HOT[3]));
      if (hurt) { F.p.line(hx - 2.6 * u, hy - 0.3 * u, hx - 0.7 * u, hy, C(HOT[0]), 2); F.p.line(hx + 0.7 * u, hy, hx + 2.8 * u, hy - 0.4 * u, C(HOT[0]), 2); }
      else {
        eyeGlow(F, hx - 2 * u, hy - 0.7 * u, 1 * u, 1 * u, HOT[3]);
        eyeGlow(F, hx + 1.1 * u, hy - 0.8 * u, 1.3 * u, 1.3 * u, wind ? HOT[4] : HOT[3]);
      }
      // ---- crown of melted candles fused to the cranium, wax over the left socket
      const cands = [[-2.6, 1.9, -0.35], [-0.85, 3.1, -0.08], [1.05, 3.9, 0.06], [2.9, 2.3, 0.42]];
      const Cd = layer(F);
      const tops = [];
      for (const [cx, ch, tilt] of cands) {
        const base = [hx + cx * u, hy - 3.4 * u + Math.abs(cx) * 0.35 * u];
        const top = [base[0] + Math.sin(tilt) * ch * u, base[1] - Math.cos(tilt) * ch * u];
        tops.push(top);
        tube(Cd, [base, top], 0.72 * u, WX);
        // a pooled lip of wax at the top and a drip running down
        blob(Cd, [[top[0], top[1] + 0.2 * u, 0.85 * u, 0.4 * u]], WX);
        Cd.rect(R(base[0] + (cx < 0 ? -0.8 : 0.3) * u), R(lerp(base[1], top[1], 0.6)), Math.max(1, R(0.45 * u)), Math.max(2, R(ch * 0.5 * u)), WX[4]);
      }
      tube(Cd, [[hx - 2.4 * u, hy - 3.2 * u], [hx - 2.1 * u, hy - 2 * u], [hx - 1.6 * u, hy - 1 * u]], [0.75 * u, 0.55 * u], WX);
      blob(Cd, [[hx - 1.6 * u, hy - 0.9 * u, 0.6 * u, 0.6 * u]], WX);
      put(F.p, Cd, true);
      tops.forEach((top, k) => {
        F.p.set(R(top[0]), R(top[1]) - 1, C('#3a2a24'));
        if (!hurt) flame(F, top[0], top[1] - 1, (wind ? 3.8 : 2.6) * u, 1.5 * u, t + k * 0.23, {});
        else for (let j = 0; j < 3; j++) F.p.set(R(top[0] + (j % 2)), R(top[1] - 2 - j * 1.5), AS[2]);   // snuffed: a wisp of smoke
      });
      // ---- the fireball: in the casting hand on the wind-up, thrown on the strike
      if (wind) glow(F, castH[0], castH[1] - 2.2 * u, 2.2 * u, HOT[2], { core: HOT[4], halo: true });
      if (hit) glow(F, castH[0] - 2.4 * u, castH[1], 2.8 * u, HOT[2], { core: HOT[4], halo: true });
      // ---- falling ash: flakes drifting down from the mantle
      for (let k = 0; k < 16; k++) {
        const side = k % 2 ? 1 : -1, fxk = side * (4 + hash2(k, 3, 5) * 9), f = (hash2(k, 9, 5) + t * (run ? 0.5 : 1)) % 1;
        const yy = 20 - f * 19, xx = fxk + Math.sin((f + k * 0.3) * TAU) * 0.8 + (run ? f * 4 : 0);
        F.p.rect(R(X(xx, yy)), R(Y(yy)), 2, k % 3 ? 1 : 2, AS[k % 3 + 2]);
        if (k % 5 === 0) { F.p.set(R(X(xx, yy)) + 1, R(Y(yy)), C(HOT[2])); F.e.set(R(X(xx, yy)) + 1, R(Y(yy)), C(HOT[2])); }
      }
      F.mouth = wind ? [castH[0], castH[1] - 2.2 * u] : hit ? [castH[0] - 2.4 * u, castH[1]] : [castH[0], castH[1]];
    },
  },
  // The Glass Wyrm (glass_wyrm): the storm-glass of the Wastes, fused by lightning into the windows of
  // a drowned cathedral and then into a serpent. Every segment is a leaded window lit from within;
  // its head is the chapel itself: a pointed-arch snout, a rose window for an eye under a stone
  // drip-mould, and a crocketed spire for a crest. Its teeth are clear glass shards.
  glass_wyrm: {
    view: 'side', box: [28, 30], pivot: 0.36, idle: 6, idleFps: 5, segR: 3.6, segTaper: 0.55,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const t = P.t, idle = P.act === 'idle', run = P.act === 'run', wind = P.atk === 1, hit = P.atk === 2, hurt = P.hurt;
      // head pose: the neck pivot, the tilt (nose up), the jaw
      const bob = idle ? sin(t) * 0.8 : run ? sin(t) * 0.9 : 0;
      const nx = ox - 1 * u + (wind ? -2.5 * u : hit ? 3.5 * u : hurt ? -2 * u : 0), ny = oy - (4.6 + bob + (wind ? 3 : hit ? 1.2 : 0)) * u;
      const tilt = wind ? 0.32 : hit ? -0.12 : hurt ? 0.22 : idle ? sin(t - 0.15) * 0.06 : run ? cos(t) * 0.05 : 0;
      const jawA = wind ? 0.62 : hit ? 0.3 : hurt ? 0.25 : idle ? 0.05 + Math.max(0, sin(t + 0.1)) * 0.12 : 0.06;
      const ca = Math.cos(tilt), sa = Math.sin(tilt);
      const S = (lx, ly) => [nx + (lx * ca - ly * sa) * u, ny - (lx * sa + ly * ca) * u];
      const toL = (px, py) => { const dx = (px - nx) / u, dy = -(py - ny) / u; return [dx * ca + dy * sa, -dx * sa + dy * ca]; };
      const box = [0, 0, F.W - 1, F.H - 1];
      const allLit = wind || hit;
      const pulse = idle ? P.i / 6 : run ? P.i / 4 : 0.5;
      // shapes in local units (y up), the snout a pointed gothic arch
      const cran = [[-3.4, 4.8], [1.5, 6.8], [7.5, 5.8], [12.4, 3], [14.6, 0.6], [14.2, -0.3], [7, -0.5], [0.5, -1], [-3.6, 0.2]];
      const hinge = [0.6, -0.6];
      const jaw = [[-0.6, -0.6], [12.6, -0.5], [12.2, -1.6], [7, -2.8], [1, -3.1], [-1.6, -2]];
      const cj = Math.cos(jawA), sj = Math.sin(jawA);
      const jawLocal = (lx, ly) => { const dx = lx - hinge[0], dy = ly - hinge[1]; return [hinge[0] + dx * cj - dy * sj, hinge[1] + dx * sj + dy * cj]; };   // undo the jaw's drop
      const jawS = (jx, jy) => { const dx = jx - hinge[0], dy = jy - hinge[1]; return S(hinge[0] + dx * cj + dy * sj, hinge[1] - dx * sj + dy * cj); };
      const Lw = layer(F);
      // ---- the spire crest (behind the cranium): crocketed, two lit lancets, a quatrefoil finial
      const spireBase = [[-3, 5], [2.4, 6.4]], apex = [-1.6 + (run ? -cos(t) * 0.3 : 0), 20];
      const Sp = layer(F);
      const sp0 = S(spireBase[0][0], spireBase[0][1]), sp1 = S(spireBase[1][0], spireBase[1][1]), spA = S(apex[0], apex[1]);
      slab(Sp, [sp0, sp1, spA], LEAD.map((c) => C(c)).map((c, i) => (i === 0 ? c : light(c, 1.25))), { wide: true });
      // lancet windows
      for (const [lx, w, h] of [[-1.1, 0.8, 7], [0.8, 0.7, 5.2]]) {
        const b = [lx, 7.2 + (lx > 0 ? 0.3 : 0)];
        const pts = [S(b[0] - w / 2, b[1]), S(b[0] + w / 2, b[1]), S(b[0] + w / 2, b[1] + h - w), S(b[0], b[1] + h), S(b[0] - w / 2, b[1] + h - w)];
        Sp.poly(pts, C(GLASS.ruby[2]));
        const lit2 = allLit || ((lx < 0 ? 0 : 0.5) + pulse) % 1 < 0.6;
        facetOn(Sp, [pts[0], S(b[0], b[1]), S(b[0], b[1] + h - 0.3), pts[4]], GLASS.ruby[3]);
        if (lit2) F.e.poly(pts, C(GLASS.ruby[3]));
      }
      // crockets: little hooks climbing both edges
      for (let k = 1; k < 7; k++) {
        const f = k / 7.4;
        for (const [b, side] of [[spireBase[0], -1], [spireBase[1], 1]]) {
          const x = lerp(b[0], apex[0], f), y = lerp(b[1], apex[1], f);
          const r0 = S(x, y), r1 = S(x + side * 0.9, y + 0.5), r2 = S(x + side * 0.7, y + 1.1);
          horn(Sp, r0, r1, r2, 0.75 * u, LEAD.map((c) => light(C(c), 1.3)));
        }
      }
      put(Lw, Sp, true);
      // finial: a quatrefoil of glass
      const fin = S(apex[0], apex[1] + 0.9);
      put(F.p, Lw, false);
      const Lh = layer(F);
      // ---- the mouth: molten light between the jaws, glass-shard teeth
      const Mo = layer(F);
      const mouthPoly = [S(-0.6, -0.6), S(12.6, -0.5), jawS(12.6, -0.5), jawS(-0.6, -0.6)];
      Mo.poly(mouthPoly, C(MAW_D));
      put(Lh, Mo, false);
      if (jawA > 0.15) {
        const mc = S(5.5, -0.8 - jawA * 3);
        for (const Lr of [Lh, F.e]) { Lr.ellipse(mc[0], mc[1], 4.5 * u, jawA * 2.4 * u, C(GLASS.rose[2])); Lr.ellipse(mc[0] - 0.5 * u, mc[1], 2.6 * u, jawA * 1.4 * u, C(GLASS.rose[4])); }
      }
      // ---- lower jaw
      const Jw = layer(F);
      const jawSeeds = seedGrid(-1, -2.6, 12, -0.8, 2.9, 41, GLASS_MIX, 0.4, pulse);
      stained(Jw, F.e, box, (px, py) => jawLocal(...toL(px, py)), (lx, ly) => inPoly(jaw, lx, ly), jawSeeds, u, { lead: 2 });
      put(Lh, Jw, true);
      // teeth: clear glass shards along both jaws
      const TG = ['#7a2f4a', '#cc6a86', '#e8c8d0', '#f4dce4', '#fff4fb'].map((c) => C(c));
      for (let k = 0; k < 6; k++) {
        const x = 2.4 + k * 1.75;
        const up = jawS(x, -0.7 - (k === 5 ? 0.3 : 0));
        shard(Lh, up[0], up[1], -Math.PI / 2 - tilt - jawA * 0.3 + (k % 2 ? 0.15 : -0.1), (k % 2 ? 1.3 : 1.8) * u, 0.42 * u, TG);
        const dn = S(x + 0.8, -0.4);
        shard(Lh, dn[0], dn[1], Math.PI / 2 - tilt + (k % 2 ? -0.1 : 0.15), (k % 2 ? 1.9 : 1.4) * u, 0.42 * u, TG);
      }
      // ---- cranium
      const Cr = layer(F);
      const crSeeds = seedGrid(-3, 0.2, 14, 6.6, 3.1, 17, GLASS_MIX, 0.42, pulse);
      stained(Cr, F.e, box, toL, (lx, ly) => inPoly(cran, lx, ly) && !((lx - 4.6) ** 2 + (ly - 2.8) ** 2 < 3.3 ** 2), crSeeds, u, { lead: 2 });
      if (hurt) { crack(Cr, S(9, 2)[0], S(9, 2)[1], 2.6, 6 * u, '#fff4fb', 3); crack(Cr, S(1, 4)[0], S(1, 4)[1], 1, 4 * u, '#fff4fb', 8); }
      put(Lh, Cr, true);
      // ---- the rose window eye: a stone ring, radial tracery, petals, a glowing heart
      const ec = S(4.6, 2.8), er = 3.15 * u;
      const Ey = layer(F);
      Ey.disc(ec[0], ec[1], er, C(LEAD[2]));
      const spin = (idle ? P.i / 6 : run ? P.i / 4 : 0) * (TAU / 8) + (wind ? 0.2 : 0);
      for (let y = R(ec[1] - er); y <= ec[1] + er; y++) for (let x = R(ec[0] - er); x <= ec[0] + er; x++) {
        const dx = x + 0.5 - ec[0], dy = y + 0.5 - ec[1], d = Math.hypot(dx, dy) / er;
        if (d > 0.84 || d < 0.38) continue;
        const a = (Math.atan2(dy, dx) - spin + TAU * 2) % TAU, seg2 = Math.floor(a / (TAU / 8)), fa = (a / (TAU / 8)) % 1;
        if (fa < 0.12 || fa > 0.88 || Math.abs(d - 0.62) < 0.035) continue;   // tracery
        const G = GLASS[seg2 % 2 ? 'amber' : 'rose'], ti = (-dx * 0.6 - dy * 0.8) / er > 0.2 ? 3 : 2;
        Ey.set(x, y, G[d > 0.62 ? ti : ti + 1]);
        if (!hurt) F.e.set(x, y, C(G[d > 0.62 ? 2 : 3]));
      }
      Ey.ring(ec[0], ec[1], er, C(LEAD[3]), Math.max(1, R(0.35 * u)));
      put(Lh, Ey, true);
      put(F.p, Lh, false);
      // the heart of the rose: a violet iris with a slit, squeezed dark when hurt
      if (hurt) F.p.disc(ec[0], ec[1], er * 0.36, C(GLASS.violet[1]));
      else {
        glow(F, ec[0], ec[1], er * 0.36, wind ? GLASS.rose[3] : GLASS.violet[3], { core: '#fff4fb' });
        F.p.rect(R(ec[0] + 0.2 * u), R(ec[1] - er * 0.3), Math.max(1, R(0.4 * u)), Math.max(2, R(er * 0.6)), C(VOID));
      }
      // drip-mould brow: a stone arch over the eye, pulled low into a scowl at the front
      const Bw = layer(F);
      tube(Bw, bez([S(1, 4.6), S(3, 7), S(6.6, 6.4), S(8.8, 3.6)], 18), [0.7 * u, 0.55 * u], LEAD.map((c) => light(C(c), 1.45)));
      horn(Bw, S(8.4, 4), S(9.4, 3.4), S(9.6, 2.4), 0.9 * u, LEAD.map((c) => light(C(c), 1.45)));
      put(F.p, Bw, true);
      glow(F, fin[0], fin[1], 1 * u, GLASS.rose[2], { core: GLASS.rose[4] });
      for (const [dx, dy] of [[-0.9, 0], [0.9, 0], [0, 0.9]]) { const q = S(apex[0] + dx, apex[1] + 0.9 + dy); glow(F, q[0], q[1], 0.6 * u, GLASS.ruby[3]); }
      F.mouth = S(11, -1.2 - jawA * 2);
    },
    // one body segment: a round leaded window in a stone ring; every other one a rose window,
    // the rest a mosaic of panes; a little crocketed pinnacle on top
    seg(F, o, i, r, N) {
      const { cx, cy } = F, p = F.p, u = F.u;
      const T = blank(p);
      T.disc(cx, cy, r, C(LEAD[2]));
      const inner = r - Math.max(2, r * 0.14);
      if (i % 2 === 0) {
        const pals = ['ruby', i % 4 ? 'amber' : 'violet'];
        for (let y = Math.floor(cy - inner); y <= cy + inner; y++) for (let x = Math.floor(cx - inner); x <= cx + inner; x++) {
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy) / inner;
          if (d > 1) continue;
          const a = (Math.atan2(dy, dx) + TAU + i * 0.3) % TAU, sg = Math.floor(a / (TAU / 6)), fa = (a / (TAU / 6)) % 1;
          if ((d > 0.3 && (fa < 0.1 || fa > 0.9)) || Math.abs(d - 0.3) < 0.08 || Math.abs(d - 0.7) < 0.05) { T.set(x, y, C(LEAD[1])); continue; }
          const G = GLASS[d < 0.3 ? 'rose' : pals[sg % 2]], ti = (-dx * 0.6 - dy * 0.8) / inner > 0.25 ? 3 : 2;
          T.set(x, y, G[ti]);
          if ((sg + i) % 3 === 0 || d < 0.3) F.e.set(x, y, C(G[2]));
        }
      } else {
        const seeds = [];
        for (let k = 0; k < 7; k++) { const a = k / 6 * TAU + i, d = k ? 0.62 : 0; seeds.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, pal: GLASS_MIX[(k * 3 + i) % GLASS_MIX.length], lit: (k + i) % 3 === 0 }); }
        stained(T, F.e, [cx - inner - 1, cy - inner - 1, cx + inner + 1, cy + inner + 1], (px, py) => [(px - cx) / inner, -(py - cy) / inner], (lx, ly) => lx * lx + ly * ly <= 1, seeds, inner, { lead: Math.max(1.5, r * 0.08) });
      }
      // stone ring with a lit top-left
      for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
        if (d > r || d < inner) continue;
        const l = (-dx * 0.6 - dy * 0.8) / r;
        T.set(x, y, C(l > 0.45 ? LEAD[4] : l > -0.2 ? LEAD[3] : LEAD[2]));
      }
      T.set(R(cx - r * 0.45), R(cy - r * 0.62), WHITE);
      put(p, T, false);
      // pinnacle on top
      if (r > 6) {
        const P2 = blank(p), h = r * 0.7, w = r * 0.32, bx = cx - r * 0.1, by = cy - r * 0.88;
        slab(P2, [[bx - w, by + 2], [bx + w, by + 2], [bx - w * 0.2, by - h]], LEAD.map((c) => light(C(c), 1.3)));
        put(p, P2, true);
        p.set(R(bx - w * 0.2), R(by - h) - 1, C(GLASS.rose[3])); F.e.set(R(bx - w * 0.2), R(by - h) - 1, C(GLASS.rose[3]));
      }
    },
  },
  // Ozymar the Unburied (ozymar): the colossus whose trunkless legs still stand somewhere in the
  // dunes, rising chest-deep out of a moving sand-sea. Half his face has fallen away; behind it a
  // furnace burns where the eye was, and the other half keeps its cold, sneering calm. There is a
  // heart-shaped hole in his chest with the chains still hanging from it: his heart walks on its
  // own (colossus_heart). One arm is whole; the other broke at the elbow, and its forearm floats on
  // the sand that pours out of the stump.
  ozymar: {
    view: 'front', box: [36, 29], pivot: 0.5, idle: 6, idleFps: 4,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const t = P.t, idle = P.act === 'idle', run = P.act === 'run', wind = P.atk === 1, hit = P.atk === 2, hurt = P.hurt;
      const ST = pal5('sand', 6), STd = ST.map((c) => dark(c, 0.86)), SD = pal5('sand', 4).map((c) => dark(c, 0.9)), PT = pal5('clay', 4), G = pal5('gold', 5), LA = pal5('blue', 5), IR = ramp('#4a5259');
      const HOL = [C('#140f1c'), C('#1d0f16'), C('#2a1a20'), C('#3e1c22'), C('#662b2c')];
      const breathe = idle ? sin(t) * 0.25 : 0;
      const lean = run ? sin(t) * 0.6 : hurt ? 1.2 : 0;
      const sink = wind ? -1.2 : hit ? 1.4 : run ? Math.abs(sin(t)) * 0.4 : 0;
      const X = (x, y = 0) => ox + (x + lean * Math.max(0, y - 4) / 22) * u, Y = (y) => oy - (y + (y > 3 ? breathe - sink : 0)) * u;
      const L = layer(F);
      // ---- the sand-sea mound he rises from (ripples run outward)
      const Md = layer(F);
      blob(Md, [[X(0), Y(1.4), 14.5 * u, 3.6 * u], [X(-7), Y(2.6), 6.5 * u, 2.6 * u], [X(6), Y(2.8), 7.5 * u, 2.6 * u], [X(run ? 9 : 0), Y(2), 5 * u, 3 * u]], SD, { tex: 3, clipY: oy });
      for (let k = 0; k < 3; k++) {
        const f = ((k + t * (run ? 2 : 1)) % 3) / 3, rx = (5 + f * 9) * u, ry = (1.4 + f * 1.6) * u;
        for (let a = 3.3; a < 6.1; a += 0.02) over(Md, X(0) + Math.cos(a) * rx, Y(2.8) + Math.sin(a) * ry + ry * 0.3, SD[k === 1 ? 4 : 2]);
      }
      put(L, Md, false);
      // ---- arms: the whole one and the broken one
      const shL = [X(-9.4, 13.6), Y(13.6)], shR = [X(9.4, 13.6), Y(13.6)];
      const fistL = wind ? [X(-7, 27), Y(27)] : hit ? [X(-9, 2.2), Y(2.2) + sink * u] : hurt ? [X(-13.4, 7), Y(7)] : run ? [X(-12 + sin(t) * 1.5, 4.6), Y(4.6)] : [X(-12, 3.8), Y(3.8)];
      const elL = ik(shL, fistL, 6 * u, 6.2 * u, wind ? -1 : 1);
      const stumpR = wind ? [X(11.4, 19.6), Y(19.6)] : hit ? [X(12, 9.4), Y(9.4)] : [X(12.4, 8.6), Y(8.6)];
      const fl = idle ? sin(t) * 0.3 * u : 0;
      const foreR = wind ? [[X(10.4, 23.4), Y(23.4)], [X(8.4, 27.2), Y(27.2)]] : hit ? [[X(11.4, 6.2), Y(6.2)], [X(9.4, 2.2), Y(2.2) + sink * u]] : hurt ? [[X(14.6, 6.6), Y(6.6)], [X(15.2, 3), Y(3)]] : run ? [[X(13.2, 6.6 - cos(t)), Y(6.6 - cos(t))], [X(13 - sin(t) * 1.2, 3.4), Y(3.4)]] : [[X(13.4, 6.8), Y(6.8) + fl], [X(13, 3.4), Y(3.4) + fl]];
      const A = layer(F);
      tube(A, [shL, elL], [2.3 * u, 2 * u], ST, { matte: true });
      tube(A, [elL, fistL], [2 * u, 1.8 * u], ST, { matte: true });
      blob(A, [[fistL[0], fistL[1], 2.5 * u, 2.2 * u]], ST, { matte: true });
      for (let k = -1; k <= 1; k++) A.line(fistL[0] + k * 0.9 * u, fistL[1] + 0.3 * u, fistL[0] + k * 0.9 * u, fistL[1] + 1.8 * u, ST[1]);
      const am = [lerp(shL[0], elL[0], 0.5), lerp(shL[1], elL[1], 0.5)];
      tube(A, [[am[0], am[1] - 0.6 * u], [am[0], am[1] + 0.6 * u]], 2.4 * u, G);
      tube(A, [shR, stumpR], [2.3 * u, 2.1 * u], ST, { matte: true });
      A.ellipse(stumpR[0], stumpR[1] + 1.2 * u, 1.7 * u, 0.8 * u, C(HOL[2]));
      for (let k = -2; k <= 2; k++) A.set(R(stumpR[0] + k * 0.8 * u), R(stumpR[1] + 1.9 * u + (k % 2 ? 0.5 * u : 0)), ST[1]);
      tube(A, foreR, [2 * u, 1.8 * u], STd, { matte: true });
      blob(A, [[foreR[1][0], foreR[1][1], 2.4 * u, 2.1 * u]], STd, { matte: true });
      A.ellipse(foreR[0][0], foreR[0][1] - 1.1 * u, 1.5 * u, 0.6 * u, STd[1]);
      put(L, A, true);
      sandStream(L, stumpR[0], stumpR[1] + 1.6 * u, foreR[0][1] - 1 * u, 1.6 * u, t * 2, SD, 0.3 * u);
      // ---- the torso: a chiselled block, chest planes lit on the left
      const T = layer(F);
      blob(T, [[X(0, 11.4), Y(11.4), 8.6 * u, 4.8 * u], [X(0, 6), Y(6), 5.4 * u, 3.8 * u], [X(-8.8, 13.6), Y(13.6), 2.9 * u, 2.5 * u], [X(8.8, 13.6), Y(13.6), 2.9 * u, 2.5 * u], [X(0, 14.6), Y(14.6), 6.6 * u, 1.8 * u]], ST, { matte: true });
      // carved pectoral and abdominal lines
      for (const side of [-1, 1]) for (let a = 0.15; a < 1.45; a += 0.03) over(T, X(side * 0.3, 10) + Math.sin(a) * 7 * u * side, Y(10.1) - Math.cos(a) * 1.6 * u + 1.6 * u, ST[1]);
      T.line(X(0, 12), Y(14.6), X(0, 3), Y(3), ST[1], 2);
      for (const y of [7.6, 5.4]) { T.line(X(-3.8, y), Y(y), X(-0.6, y), Y(y + 0.2), ST[1]); T.line(X(0.6, y), Y(y + 0.2), X(3.8, y), Y(y), ST[1]); }
      // a lit pectoral plane on the left
      facetOn(T, [[X(-7.2, 13.6), Y(13.6)], [X(-0.6, 14.4), Y(14.4)], [X(-0.6, 10.6), Y(10.6)], [X(-6.4, 10.8), Y(10.8)]], ST[4], ST[3]);
      // cracks
      crack(T, X(-2, 13), Y(13), 1.9, 6 * u, ST[0], 4);
      // the empty heart: a heart-shaped hole, broken chains hanging from its rim
      const hcx = X(3.6, 9.6), hcy = Y(9.6);
      const heart = (k, c) => { T.disc(hcx - 1.3 * k * u, hcy - 0.5 * k * u, 1.6 * k * u, c); T.disc(hcx + 1.3 * k * u, hcy - 0.5 * k * u, 1.6 * k * u, c); T.poly([[hcx - 2.9 * k * u, hcy - 0.1 * k * u], [hcx + 2.9 * k * u, hcy - 0.1 * k * u], [hcx, hcy + 3.2 * k * u]], c); };
      heart(1.14, ST[1]); heart(0.96, HOL[1]);
      put(L, T, true);
      for (const Lr of [L, F.e]) { Lr.ellipse(hcx, hcy + 1.5 * u, 1.8 * u, 0.8 * u, C(HOT[1])); Lr.ellipse(hcx, hcy + 1.5 * u, 0.9 * u, 0.4 * u, C(HOT[3])); }
      for (const d of [-1, 1]) chain(L, [[hcx + d * 2.2 * u, hcy - 0.6 * u], [hcx + d * 2.6 * u, hcy + 1.6 * u], [hcx + d * 2.2 * u + (idle ? sin(t + d * 0.2) * 0.3 * u : 0), hcy + 3.8 * u - d * 0.8 * u]], 0.9 * u, IR);
      // ---- the head: striped nemes, the face half fallen away
      const hx = X(0, 20) + (hurt ? 1.2 * u : wind ? -0.3 * u : 0), hy = Y(20.4) + (wind ? -0.8 * u : hit ? 0.5 * u : 0);
      const Hd = layer(F);
      for (const side of [-1, 1]) slab(Hd, [[hx + side * 4.4 * u, hy - 0.2 * u], [hx + side * 7.6 * u, hy + 0.8 * u], [hx + side * 7 * u, hy + 7.4 * u], [hx + side * 4.4 * u, hy + 7.4 * u]], G, { wide: true });
      slab(Hd, [[hx - 5 * u, hy - 6.6 * u], [hx + 5 * u, hy - 6.6 * u], [hx + 8 * u, hy + 0.8 * u], [hx + 4.4 * u, hy + 1.2 * u], [hx - 4.4 * u, hy + 1.2 * u], [hx - 8 * u, hy + 0.8 * u]], G, { wide: true });
      for (let y = R(hy - 6.6 * u); y < hy + 7.4 * u; y++) if (((y - R(hy - 6.6 * u)) % R(1.4 * u)) < R(0.65 * u)) for (let x = R(hx - 8.2 * u); x <= hx + 8.2 * u; x++) {
        if (!Hd.a(x, y)) continue;
        const i = (y * Hd.w + x) * 4;
        let ti = 3; for (let q = 0; q < 5; q++) if (Hd.d[i] === G[q][0] && Hd.d[i + 1] === G[q][1]) ti = q;
        Hd.set(x, y, LA[ti]);
      }
      // the face
      blob(Hd, [[hx, hy + 0.2 * u, 4 * u, 4.8 * u]], ST, { matte: true });
      facetOn(Hd, [[hx - 4 * u, hy - 4.6 * u], [hx, hy - 4.6 * u], [hx - 0.2 * u, hy + 5 * u], [hx - 4 * u, hy + 5 * u]], ST[4], ST[3]);
      // carved features on the surviving half: brow, kohl-lined eye, nose, a sneering lip
      Hd.line(hx - 3.4 * u, hy - 2.2 * u, hx - 0.4 * u, hy - 1.8 * u, ST[1], Math.max(1, R(0.45 * u)));
      Hd.ellipse(hx - 1.8 * u, hy - 0.7 * u, 1.4 * u, 0.65 * u, HOL[2]);
      Hd.line(hx - 3.2 * u, hy - 0.7 * u, hx - 4 * u, hy - 0.3 * u, HOL[2], Math.max(1, R(0.35 * u)));
      Hd.line(hx + 0.1 * u, hy - 1 * u, hx - 0.5 * u, hy + 1.6 * u, ST[1], Math.max(1, R(0.35 * u)));
      Hd.line(hx - 0.5 * u, hy + 1.6 * u, hx + 0.4 * u, hy + 1.9 * u, ST[1], 2);
      Hd.line(hx - 2.2 * u, hy + 3.1 * u, hx - 0.1 * u, hy + 2.8 * u, PT[1], Math.max(1, R(0.4 * u)));
      Hd.line(hx - 2.2 * u, hy + 3.1 * u, hx - 2.7 * u, hy + 2.5 * u, PT[1], Math.max(1, R(0.35 * u)));
      // the uraeus, snapped to a stump
      blob(Hd, [[hx - 0.6 * u, hy - 6.6 * u, 1.1 * u, 1 * u]], G);
      // the break: right of a jagged line the face is hollow; the corner of the headcloth is gone
      const jag = [[-7, 0.2], [-4.6, 1], [-2.8, 0.3], [-1, 1.2], [0.8, 0.6], [2.6, 1.8], [4.4, 1.4], [5.6, 3.6]];
      const jagX = (y) => { const yy = (y - hy) / u; for (let k = 1; k < jag.length; k++) if (yy <= jag[k][0]) { const f = (yy - jag[k - 1][0]) / (jag[k][0] - jag[k - 1][0]); return hx + lerp(jag[k - 1][1], jag[k][1], clamp(f, 0, 1)) * u; } return hx + 3.6 * u; };
      for (let y = R(hy - 5 * u); y <= hy + 5.2 * u; y++) for (let x = R(hx - 4.2 * u); x <= hx + 4.4 * u; x++) {
        if (((x + 0.5 - hx) / (4 * u)) ** 2 + ((y + 0.5 - hy - 0.2 * u) / (4.8 * u)) ** 2 > 1) continue;
        const jx = jagX(y);
        if (x < jx - 0.7 * u) continue;
        Hd.set(x, y, x < jx ? ST[4] : x < jx + 0.8 * u || y < hy - 3.6 * u ? HOL[2] : HOL[1]);
      }
      // the top corner of the nemes snapped off along a jagged edge
      for (let y = R(hy - 7 * u); y < hy + 0.4 * u; y++) for (let x = R(hx + 1.2 * u); x < hx + 8.6 * u; x++) {
        const edge = (x - hx - 1.2 * u) * 0.95 - (y - hy + 7 * u) - hash2(x >> 2, y >> 2, 3) * 1.4 * u;
        if (edge > 0.6 * u && (((x + 0.5 - hx) / (4 * u)) ** 2 + ((y + 0.5 - hy - 0.2 * u) / (4.8 * u)) ** 2 > 1 || x > jagX(y) + 1.4 * u)) Hd.clear(x, y);
        else if (edge > -0.2 * u && Hd.a(x, y) && x > jagX(y) + 0.6 * u) Hd.set(x, y, G[1]);
      }
      // braided false beard, its tip snapped
      tube(Hd, [[hx - 0.5 * u, hy + 4.6 * u], [hx - 0.4 * u, hy + 8.2 * u]], [1.2 * u, 1 * u], LA, { rings: Math.max(3, R(1.1 * u)), ringC: G[3] });
      put(L, Hd, true);
      put(F.p, L, false);
      // ---- the furnace eye in the hollow, flames licking out of the break
      const fx = hx + 2.4 * u, fy = hy - 0.8 * u;
      const fk = hurt ? 0.5 : wind ? 1.5 : hit ? 1.3 : 1;
      glow(F, fx, fy, (wind ? 2 : 1.6) * u, hurt ? hurtC : HOT[2], { core: HOT[4], halo: true });
      flame(F, fx + 1.2 * u, fy - 1.8 * u, 4.4 * fk * u, 2.6 * u, t, {});
      flame(F, fx + 2.6 * u, fy - 3.8 * u, 2.8 * fk * u, 1.8 * u, t + 0.5, {});
      for (let k = 0; k < 3; k++) crack(F.p, fx - 1 * u, fy + (k - 1) * 0.6 * u, Math.PI + (k - 1) * 0.5, 2 * u, HOT[3], 20 + k, F.e);
      // the cold eye on the whole side: a dull gold glint
      eyeGlow(F, hx - 2.3 * u, hy - 1 * u, 1 * u, 0.7 * u, hurt ? '#9a6424' : '#e8c35a');
      // sand trickling from the broken face over the shoulder
      sandStream(F.p, hx + 4.2 * u, hy + 5.4 * u, Y(13), 1.1 * u, t * 2 + 0.3, SD);
      if (hit) { plume(F, fistL[0] + 1 * u, Y(1.6), 6 * u, 3 * u, 0.2, SD, -0.3); plume(F, foreR[1][0] - 1 * u, Y(1.6), 6 * u, 3 * u, 0.6, SD, 0.3); }
      if (hurt) for (let j = 0; j < 4; j++) rock(F.p, hx + (5 + j * 1.6) * u, hy - (2 - j * 1.4) * u, 0.9 * u, 0.7 * u, ST, 90 + j);
      F.mouth = [fx, fy];
    },
  },
};
