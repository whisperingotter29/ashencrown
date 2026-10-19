// Hand-built monster designs: wildwood (great bosses of the wilds and the frozen kings). See kit.js
// for the design format and docs/BESTIARY.md for the concepts.
import { C, R, ramp, pal5, layer, put, blob, tube, horn, slab, facet, shard, wing, drape, stride, sin, lerp, clamp, bez, rot, glow, flame, rune, teeth, spots, stripes, crack, over, light, dark, mixc, hash2, BONE, CREAM } from './kit.js';

// ------------------------------------------------------------------ local helpers
const TAU = Math.PI * 2;
// small deterministic random stream
const rng = (seed) => { let a = (seed * 2654435761) >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
// one glowing pixel / line / disc into colour and emissive
const lit = (F, x, y, c) => { const cc = C(c); F.p.set(R(x), R(y), cc); F.e.set(R(x), R(y), cc); };
const litLine = (F, x0, y0, x1, y1, c) => { const cc = C(c); F.p.line(x0, y0, x1, y1, cc); F.e.line(x0, y0, x1, y1, cc); };
const litDisc = (F, x, y, r, c) => { const cc = C(c); F.p.disc(x, y, r, cc); F.e.disc(x, y, r, cc); };
const litEll = (F, x, y, rx, ry, c) => { const cc = C(c); F.p.ellipse(x, y, rx, ry, cc); F.e.ellipse(x, y, rx, ry, cc); };
// glow ramp from a glow colour: deep, mid, base, light, core
const glowRamp = (c) => { const b = C(c); return [dark(b, 0.45), dark(b, 0.7), b, light(b, 1.25), C('#fff4dc')]; };
const dimR = (Rm, k) => Rm.map((c) => dark(c, k));
// bark fissures: dashed 1-px lines running parallel to a path (offsets in px across it), painted
// only over pixels that already exist
function grain(L, pts, offs, c, seed = 1) {
  const cc = C(c);
  for (let j = 0; j < offs.length; j++) for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], d = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / d, ny = (bx - ax) / d;
    if (hash2(i >> 1, j, seed) < 0.28) continue;
    const o = offs[j];
    for (let s = 0; s <= 1; s += 0.5 / d) L.over(R(lerp(ax, bx, s) + nx * o), R(lerp(ay, by, s) + ny * o), cc);
  }
  return L;
}

// A mass of chunky leaf / needle clusters filling an ellipse, lit as one form from the top-left.
// Each cluster is its own little lit ball, lower ones overlapping upper ones (leaves hang).
function foliage(L, cx, cy, rx, ry, cell, Rm, seed, o = {}) {
  const r = rng(seed), pts = [];
  for (let y = -ry; y <= ry + 0.01; y += cell * 0.85) for (let x = -rx; x <= rx + 0.01; x += cell * 1.05) {
    const jx = x + (r() - 0.5) * cell * 0.7, jy = y + (r() - 0.5) * cell * 0.5;
    if ((jx / rx) ** 2 + (jy / ry) ** 2 > 1.02) continue;
    pts.push([cx + jx, cy + jy, cell * (0.62 + r() * 0.36)]);
  }
  pts.sort((a, b) => a[1] - b[1]);
  for (const [x, y, s] of pts) {
    const lift = -((x - cx) / rx) * 0.3 - ((y - cy) / ry) * 0.42 + (o.lift || 0);
    blob(L, [[x, y, s, s * 0.82]], Rm, { lift });
  }
  return L;
}
// Fill a polygon and shade it like slab() (lit top-left edge, dark bottom-right edge, base inside)
// but only inside its bounding box: cheap enough for dozens of small plates per frame.
function plate(L, pts, Rm, o = {}) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  x0 = Math.floor(x0) - 1; y0 = Math.floor(y0) - 1; x1 = Math.ceil(x1) + 1; y1 = Math.ceil(y1) + 1;
  const w = x1 - x0 + 1, h = y1 - y0 + 1, M = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const yy = y0 + y + 0.5, xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      if ((ay <= yy && by > yy) || (by <= yy && ay > yy)) xs.push(ax + (yy - ay) / (by - ay) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) if (x >= x0 && x <= x1) M[y * w + x - x0] = 1;
  }
  const m = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : M[y * w + x]);
  const lit = o.lit === false ? Rm[3] : Rm[4], base = o.c ? C(o.c) : Rm[3];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!M[y * w + x]) continue;
    let c;
    if (!m(x + 1, y) || !m(x, y + 1)) c = Rm[o.dk ?? 1];
    else if (o.wide && (!m(x + 2, y) || !m(x, y + 2))) c = Rm[2];
    else if (!m(x - 1, y) || !m(x, y - 1)) c = lit;
    else c = base;
    if (o.clip && !o.clip.a(x0 + x, y0 + y)) continue;
    L.set(x0 + x, y0 + y, c);
  }
  return L;
}
// Conifer needle sprays filling whatever is already painted in the mask layer M: rows of small
// arched sprays with hanging tips, lit per spray, the ramp picked by a global top-left light
// (ramps: array of 5-tone ramps from dark to light). Lower rows overlap upper ones.
function sprays(L, M, box, cell, ramps, seed, o = {}) {
  const [bx0, by0, bx1, by1] = box, r = rng(seed);
  const cxm = (bx0 + bx1) / 2, cym = (by0 + by1) / 2, rx = (bx1 - bx0) / 2, ry = (by1 - by0) / 2;
  let row = 0;
  for (let y = by0; y <= by1 + cell; y += cell * 0.62, row++) for (let x = bx0 - cell * 0.5 + (row & 1) * cell * 0.5; x <= bx1 + cell * 0.5; x += cell * 0.95) {
    const jx = x + (r() - 0.5) * cell * 0.7, jy = y + (r() - 0.5) * cell * 0.4;
    if (!M.a(R(jx), R(jy))) continue;
    const l = -((jx - cxm) / rx) * 0.55 - ((jy - cym) / ry) * 0.75 + (r() - 0.5) * 0.35 + (o.lift || 0);
    const k = clamp(Math.round((o.k0 ?? 1.2) + l * (o.k1 ?? 1.9)), 0, ramps.length - 1);
    const Rm = (o.pick && o.pick(jx, jy, r)) || ramps[k];
    const w = cell * (1.1 + r() * 0.55), h = cell * (0.5 + r() * 0.2), d = o.droop ?? 0.55, tl = r() < 0.5 ? 1 : -1;
    const pts = [[jx - w / 2, jy + h * (d + (tl > 0 ? 0.25 : 0))], [jx - w * 0.32, jy - h * 0.4], [jx + w * 0.08, jy - h * 0.55], [jx + w * 0.38, jy - h * 0.25], [jx + w / 2, jy + h * (d + (tl < 0 ? 0.25 : 0))]];
    // hanging needle tips along the lower edge
    const n = 4;
    for (let q = n; q >= 0; q--) { const f = q / n, ex = lerp(jx - w / 2, jx + w / 2, f); pts.push([ex, jy + h * (0.45 + (q % 2 ? 0.55 : 0.05))]); }
    plate(L, pts, Rm);
    // the frond's midrib
    for (let f = 0.15; f <= 0.85; f += 0.5 / w) { const ex = lerp(jx - w / 2, jx + w / 2, f); L.over(R(ex), R(jy - h * 0.1 + Math.abs(f - 0.45) * h * 0.9), Rm[2]); }
  }
  return L;
}
// A headstone: rounded top, w wide and h tall, standing on (x, y), tilted by a (radians)
function headstone(L, x, y, w, h, a, Rm, seed = 1) {
  const pts = [[-w / 2, 0], [w / 2, 0], [w / 2, -h + w / 2]];
  for (let k = 1; k < 8; k++) { const q = Math.PI * k / 8; pts.push([Math.cos(q) * w / 2, -h + w / 2 - Math.sin(q) * w / 2]); }
  pts.push([-w / 2, -h + w / 2]);
  const P = pts.map(([px, py]) => { const [rx, ry] = rot(px, py, a); return [x + rx, y + ry]; });
  const T = layer({ p: L });
  slab(T, P, Rm, { wide: w > 10 });
  // carved cross and a lichen patch
  const at = (px, py) => { const [rx, ry] = rot(px, py, a); return [x + rx, y + ry]; };
  const c0 = at(0, -h * 0.82), c1 = at(0, -h * 0.38), c2 = at(-w * 0.2, -h * 0.68), c3 = at(w * 0.2, -h * 0.68);
  T.line(c0[0], c0[1], c1[0], c1[1], Rm[1]); T.line(c2[0], c2[1], c3[0], c3[1], Rm[1]);
  const m = at(-w * 0.25, -h * 0.2);
  spots(T, m[0], m[1], w * 0.25, h * 0.12, 3, Math.max(0.8, w * 0.07), '#557048', seed);
  return put(L, T, true);
}

// ================================================================== The Yew Blight
// The churchyard yew, the tree that drinks from graves, grown into a hooded mourner. Its needle
// canopy hangs like a cowl with a drooping peak, a bark face glares from the shadow inside, its
// hollow trunk is a ribcage around a pulsing gall-heart, it walks on roots that clutch headstones,
// and its poison arils hang from the hood's hem like a procession's lanterns.
const yew_blight = {
  view: 'side', box: [46, 52], pivot: 0.5, scale: 0.72, idle: 6, idleFps: 4,
  draw(F, o, P) {
    const { u, ox, oy } = F;
    const t = P.t, idle = P.act === 'idle', run = P.act === 'run', w1 = P.atk === 1, w2 = P.atk === 2, hurt = P.hurt;
    const bark = ['#2a1420', '#3f2228', '#57343a', '#6e4a4a', '#8a6460'].map((c) => C(c)), barkD = dimR(bark, 0.8), barkS = dimR(bark, 0.62), flake = ramp('#8a5048');
    const yR = [ramp('#1a3a40'), ramp('#245458'), ramp('#2f7070'), pal5('teal', 5)], dead = ramp('#8a4238');
    const stone = pal5('stone', 6), stoneD = dimR(stone, 0.8);
    const G = glowRamp(o.c3 || '#bbf24d');
    const lean = w1 ? -0.14 : w2 ? 0.2 : hurt ? -0.1 : run ? 0.06 : sin(t) * 0.015;
    const bob = run ? -Math.abs(sin(t)) * 0.9 : idle ? sin(t) * 0.25 : w1 ? 0.7 : w2 ? -0.7 : 0;
    const X = (x, y) => [ox + (x + lean * Math.max(0, y - 8)) * u, oy - (y + (y > 3 ? bob : 0)) * u];
    const pulse = idle ? 0.5 + 0.5 * sin(t) : w1 ? 1 : w2 ? 0.85 : 0.35;
    const L = layer(F);

    // ---- root legs: arching up and out, gripping a headstone each
    const leg = (side, far, off = 0) => {
      const Lg = layer(F), Rm = far ? barkD : bark, Sm = far ? stoneD : stone;
      let [dx, lift] = run ? stride(t + (far ? 0.5 : 0), 7, 2.6) : [0, 0];
      if (w2) dx += side > 0 ? 3.5 : -1;
      if (w1) dx += side > 0 ? -1.5 : 0.5;
      const hip = X(side * 2.2 + off, 8.5), top = [ox + (side * 6.4 + off + dx) * u, oy - (lift + 6.2) * u];
      const ctrl = [lerp(hip[0], top[0], 0.55), Math.min(hip[1], top[1]) - 2.4 * u];
      tube(Lg, bez([hip, ctrl, top], 14), [2.3 * u, 1.3 * u], Rm, { tex: 4 });
      const tilt = side * 0.1 + (run ? -dx * 0.025 : 0) + (far ? -0.08 : 0);
      headstone(Lg, top[0] + side * 0.2 * u, oy - lift * u, 5.4 * u, 7 * u, tilt, Sm, far ? 3 : 5);
      // root fingers wrapping over the stone's shoulders and down its face
      for (let k = -1; k <= 1; k++) {
        const s0 = [top[0] - side * 0.6 * u, top[1] - 0.6 * u], s1 = [top[0] + k * 2 * u, top[1] + 0.4 * u], s2 = [top[0] + k * 2.5 * u + side * 0.3 * u, top[1] + (2.6 + Math.abs(k) * 0.8) * u];
        tube(Lg, bez([s0, s1, s2], 8), [0.8 * u, 0.3 * u], Rm);
      }
      put(L, Lg, !far);
    };
    leg(-1, true);
    // trailing roots dragging behind
    const Tr = layer(F);
    for (const [ex, ey, w] of [[-12.5, 0.6, 1.3], [-9, 0.4, 1.6]]) {
      const drag = run ? sin(t) * 0.8 : 0;
      tube(Tr, bez([X(-3, 5), X(-6.5 + drag, 3.4), [ox + (ex + drag) * u, oy - ey * u]], 12), [w * u, 0.35 * u], barkD, { tex: 4 });
    }
    put(L, Tr, true);

    // ---- bough arms with twig claws
    const arm = (side, far) => {
      const Lg = layer(F), Rm = far ? barkD : bark;
      const sh = side > 0 ? X(7.4, 24.6) : X(-2, 25);
      let el, hd;
      if (side > 0) {
        if (w1) { el = X(5, 33); hd = X(-1, 40); }
        else if (w2) { el = X(13.5, 22); hd = X(21, 12); }
        else if (hurt) { el = X(10, 24); hd = X(11, 18); }
        else { const sw = run ? sin(t + 0.5) * 1.6 : sin(t) * 0.5; el = X(11.5 + sw * 0.4, 21); hd = X(14 + sw, 14 + sw * 0.3); }
      } else {
        const sw = run ? -sin(t + 0.5) * 1.6 : sin(t + 0.3) * 0.5;
        el = X(-8.5, 22); hd = X(-11.5 + sw, 15 - sw * 0.3);
        if (w1) { el = X(-8, 20); hd = X(-12.5, 13); }
      }
      tube(Lg, bez([sh, [lerp(sh[0], el[0], 0.55), Math.min(sh[1], el[1]) - 1.4 * u], el], 10), [2.1 * u, 1.5 * u], Rm, { tex: 4 });
      tube(Lg, [el, hd], [1.5 * u, 0.9 * u], Rm, { tex: 4 });
      const da = Math.atan2(hd[1] - el[1], hd[0] - el[0]);
      for (let k = 0; k < 4; k++) {
        const a = da + (k - 1.5) * 0.45 * (w2 && side > 0 ? 1.3 : 1), l = (k === 0 || k === 3 ? 2.5 : 3.4) * u;
        const m = [hd[0] + Math.cos(a) * l * 0.55, hd[1] + Math.sin(a) * l * 0.55], tip = [hd[0] + Math.cos(a + 0.4) * l, hd[1] + Math.sin(a + 0.4) * l];
        tube(Lg, [hd, m, tip], [0.75 * u, 0.25 * u], Rm);
      }
      put(L, Lg, !far);
      return { hd, el };
    };
    const farArm = arm(-1, true);

    // ---- trunk: twisted stems around a hollow chest that opens toward the front
    const Tk = layer(F);
    blob(Tk, [[...X(-0.5, 7), 5.4 * u, 3.6 * u], [...X(-1, 17), 4 * u, 9 * u], [...X(1.5, 28), 3.4 * u, 4 * u]], bark, { tex: 4 });
    tube(Tk, bez([X(-4.4, 3), X(-5.6, 13), X(-3.2, 22), X(-2.2, 31)], 16), (q) => (2.4 - q * 0.6) * u, bark, { tex: 5 });
    tube(Tk, bez([X(3.6, 2.5), X(5.6, 7), X(5.4, 11.5)], 10), [2.2 * u, 1.4 * u], bark, { tex: 5 });
    tube(Tk, bez([X(5, 24), X(4.2, 28), X(2.6, 32)], 10), [1.6 * u, 1.8 * u], bark, { tex: 5 });
    tube(Tk, bez([X(-3, 6), X(-6.5, 3.2), X(-9.6, 0.6)], 10), [2 * u, 0.6 * u], bark, { tex: 4 });
    tube(Tk, bez([X(2.5, 5), X(6.8, 3), X(9.6, 0.6)], 10), [1.8 * u, 0.6 * u], bark, { tex: 4 });
    // fissured, fluted bark running up the stems
    grain(Tk, bez([X(-4.4, 3), X(-5.6, 13), X(-3.2, 22), X(-2.2, 31)], 16), [-1.4 * u, 0.2 * u, 1.6 * u], bark[1], 3);
    grain(Tk, bez([X(-0.5, 2), X(-2, 10), X(-1.5, 20)], 12), [-0.6 * u, 1.2 * u], bark[1], 4);
    grain(Tk, bez([X(3.6, 2.5), X(5.6, 7), X(5.4, 11.5)], 10), [-0.4 * u], bark[1], 5);
    // peeling red bark in clusters
    for (let k = 0; k < 10; k++) { const [px, py] = X(-5 + hash2(k, 3, 7) * 9, 4 + hash2(k, 5, 7) * 24); const x = R(px), y = R(py); for (const [a, b, c] of [[0, 0, 3], [1, 0, 3], [0, 1, 2], [1, 1, 2], [2, 0, 4]]) Tk.over(x + a, y + b, flake[c]); }
    // the hollow
    const hc = X(1.8, 17.4), hrx = (3.9 + (w1 ? 0.5 : 0)) * u, hry = (7.2 + (w1 ? 0.5 : 0)) * u;
    Tk.ellipse(hc[0], hc[1], hrx, hry, C('#2a1838'));
    Tk.ellipse(hc[0] + 0.6 * u, hc[1] + 0.6 * u, hrx * 0.82, hry * 0.84, C('#140913'));
    put(L, Tk, true);
    // gall-heart: a swollen knot on a sinew, glowing through its cracks; green light on the walls
    const hb = sin(t * (idle ? 1 : 2)) * 0.35 * u, hx = hc[0] + 0.4 * u, hy = hc[1] + 0.4 * u + hb;
    const hr = (2.3 + pulse * 0.5) * u;
    for (let y = R(hc[1] - hry); y <= hc[1] + hry; y++) for (let x = R(hc[0] - hrx); x <= hc[0] + hrx; x++) {
      const d = Math.hypot(x + 0.5 - hx, y + 0.5 - hy);
      if (((x + 0.5 - hc[0]) / hrx) ** 2 + ((y + 0.5 - hc[1]) / hry) ** 2 >= 0.95) continue;
      if (d < hr + (1.2 + pulse * 1.6) * u) F.p.set(x, y, d < hr + 0.9 * u ? G[1] : G[0]);
    }
    L.line(hx, hc[1] - hry, hx, hy - hr, barkS[2]);
    const HL = layer(F);
    blob(HL, [[hx, hy, hr, hr * 1.12], [hx - 0.4 * u, hy - hr * 0.85, hr * 0.45, hr * 0.45]], pal5('plum', 5), { tex: 3 });
    put(L, HL, false);
    // ribs: side view of a cage, from the spine at the back sweeping down to a sternum strand
    const Rb = layer(F);
    for (let k = 0; k < 4; k++) {
      const ys = 23.5 - k * 3.1, open = w1 ? 0.9 : 0;
      tube(Rb, bez([X(-2.6, ys), X(1.8, ys + 0.4 + open), X(5.5, ys - 2.6 + open * 0.5)], 12), (q) => (0.62 - q * 0.22) * u, bark);
    }
    tube(Rb, bez([X(5.6, 23.4), X(6.2, 17), X(5.4, 10.6)], 10), [0.6 * u, 0.5 * u], bark);
    put(L, Rb, true);

    leg(1, false);

    // ---- the face, seen inside the hood: bark in shadow, a burl nose, a long sagging mouth
    const face = X(4.6, 32.6);
    L.ellipse(face[0] + 0.4 * u, face[1] - 0.6 * u, 4.4 * u, 5.2 * u, C('#140913'));
    const Fc = layer(F);
    blob(Fc, [[face[0], face[1] + 0.6 * u, 3.6 * u, 4.4 * u], [face[0] + 2.6 * u, face[1] + 1.4 * u, 1.8 * u, 2.2 * u]], barkS, { tex: 4 });
    grain(Fc, [[face[0] - 1.6 * u, face[1] - 3 * u], [face[0] - 1.2 * u, face[1] + 4 * u]], [0, 1.4 * u], barkS[0], 8);
    const scream = w1 || w2;
    const mw = scream ? 1.6 : hurt ? 0.6 : 0.35;
    const mc = X(5.8, 29.4);
    Fc.ellipse(mc[0], mc[1], 2.6 * u, mw * u, C('#140913'));
    if (!scream) { Fc.line(mc[0] - 2.6 * u, mc[1] - 0.6 * u, mc[0] + 2.4 * u, mc[1] - 0.2 * u, C('#140913')); }
    else { for (let k = -1; k <= 1; k++) Fc.poly([[mc[0] + k * 1.4 * u - 0.5 * u, mc[1] - mw * u], [mc[0] + k * 1.4 * u + 0.5 * u, mc[1] - mw * u], [mc[0] + k * 1.4 * u, mc[1] - mw * u + 1.1 * u]], barkD[3]); }
    // brow ridge and nose burl catching the light from the hood's mouth
    tube(Fc, bez([X(2, 35.6), X(4.8, 35.2 - (w1 ? 0.5 : 0)), X(8.4, 34.6 + (hurt ? -0.6 : 0))], 10), [1.2 * u, 0.9 * u], barkD, { tex: 4 });
    blob(Fc, [[...X(8.4, 32.2), 1.3 * u, 1.6 * u]], barkD, { tex: 4 });
    put(L, Fc, true);

    // ---- hood of needles
    const cs = run ? sin(t - 0.15) * 0.5 : idle ? sin(t - 0.2) * 0.4 : w1 ? -0.5 : w2 ? 0.6 : 0;   // the peak lags the body
    const HX = (x, y) => X(x + cs * Math.max(0, y - 34) * 0.35, y);
    const M = layer(F);
    const ell = [[0.5, 37.5, 10.5, 8], [3.5, 43.2, 6.5, 4.6], [8.6, 45.4, 3.6, 2.6], [11.8, 44.6, 2.2, 1.9], [13.6, 43, 1.2, 1.3], [-7, 30, 5, 9.5], [-9.6, 22.5, 3, 4], [9.8, 31.5, 3, 6.5]];
    blob(M, ell.map(([x, y, rx, ry]) => [...HX(x, y), rx * u, ry * u]), yR[0], { tex: 9 });
    // the hood's mouth
    { const [a, b] = X(5.1, 33.2); for (let y = R(b - 5.2 * u); y <= b + 5.2 * u; y++) for (let x = R(a - 4.4 * u); x <= a + 4.4 * u; x++) if (((x + 0.5 - a) / (4.3 * u)) ** 2 + ((y + 0.5 - b) / (5 * u)) ** 2 <= 1) M.clear(x, y); }
    const bx0 = Math.min(HX(-12.5, 47.5)[0], HX(-12.5, 19)[0]), bx1 = Math.max(HX(14.5, 47.5)[0], HX(14.5, 19)[0]), by0 = HX(0, 47.5)[1], by1 = HX(0, 19)[1];
    const pick = (x, y, r) => (hash2(R(x / (5 * u)), R(y / (4 * u)), 17) > 0.8 ? dead : null);
    sprays(M, M, [bx0, by0, bx1, by1], 3.2 * u, yR, 11, { pick });
    // mildew bloom on the crown
    { const [a, b] = HX(-2, 42); spots(M, a, b, 3.5 * u, 2.2 * u, 4, 0.7 * u, '#94a866', 43); }
    put(L, M, true);
    // hood rim shadow over the face
    { const [a, b] = X(5.1, 33.2); for (let x = R(a - 3.6 * u); x <= a + 3.6 * u; x++) { const y = R(b - Math.sqrt(Math.max(0, 1 - ((x + 0.5 - a) / (4.3 * u)) ** 2)) * 5 * u); for (let k = 1; k <= R(1.2 * u); k++) if (L.a(x, y + k) && !M.a(x, y + k)) L.set(x, y + k, C('#140913')); } }

    // ---- near arm over everything
    const nearArm = arm(1, false);
    put(F.p, L, false);

    // ---- eyes: glowing knots deep in the hood; squeezed on hurt, blazing on the wind-up
    const eA = X(4.4, 33.6), eB = X(7.3, 33.4);
    const eh = hurt ? 0 : w1 ? 1.4 : idle && P.i === 4 ? 0 : 1;
    if (eh === 0) { litLine(F, eA[0] - 0.9 * u, eA[1] - 0.3 * u, eA[0] + 0.9 * u, eA[1] + 0.3 * u, G[2]); litLine(F, eB[0] - 0.7 * u, eB[1] + 0.3 * u, eB[0] + 0.7 * u, eB[1] - 0.2 * u, G[2]); }
    else {
      litEll(F, eA[0], eA[1], 0.95 * u, 0.75 * u * eh, G[2]); litEll(F, eA[0] + 0.15 * u, eA[1] - 0.1 * u, 0.5 * u, 0.4 * u * eh, G[3]);
      litEll(F, eB[0], eB[1], 0.7 * u, 0.6 * u * eh, G[2]); lit(F, eB[0], eB[1] - 0.2 * u, G[3]);
      lit(F, eA[0] + 0.3 * u, eA[1] - 0.3 * u, G[4]);
    }
    // the gall-heart's cracks, over the ribs where they show
    crack(F.p, hx - 0.3 * u, hy - hr * 0.6, 1.4, hr * 1.7, G[pulse > 0.6 ? 3 : 2], 4, F.e);
    crack(F.p, hx + 0.6 * u, hy - hr * 0.1, 2.2, hr * 1.2, G[2], 6, F.e);
    litDisc(F, hx + 0.3 * u, hy + 0.2 * u, Math.max(1, hr * 0.3 * (0.6 + pulse * 0.6)), G[3]);
    // re-cover the cracks with the near ribs so the heart sits inside the cage
    put(F.p, Rb, false);

    // ---- arils: glowing lantern-cups swinging from the hood's hem, its peak and the boughs
    const hang = [[-9.4, 19.6, 3, 0.3], [10.6, 25.4, 2.6, 0.6], [13.8, 42, 2.2, 0.85]];
    for (const [fx, fy, len, ph] of hang) {
      const swing = idle ? sin(t + ph) * 0.35 : run ? sin(t * 2 + ph) * 0.6 : w2 ? 0.8 : w1 ? -0.6 : 0.3;
      const top = HX(fx, fy), bx = top[0] + Math.sin(swing) * len * u, by = top[1] + Math.cos(swing) * len * u;
      F.p.line(top[0], top[1], bx, by - 0.9 * u, yR[1][1]);
      aril(F, bx, by, u, G, pulse);
    }
    for (const [b, ph] of [[nearArm, 0.2], [farArm, 0.6]]) {
      const swing = idle ? sin(t + ph) * 0.3 : run ? sin(t * 2 + ph) * 0.5 : 0;
      const tx = lerp(b.el[0], b.hd[0], 0.35), ty = lerp(b.el[1], b.hd[1], 0.35) + 1 * u;
      const bx = tx + Math.sin(swing) * 2.4 * u, by = ty + Math.cos(swing) * 2.4 * u;
      F.p.line(tx, ty, bx, by - 0.9 * u, yR[1][1]);
      aril(F, bx, by, u, G, pulse);
    }
    F.mouth = X(6, 29.4);
  },
};
// a yew aril: a glowing fleshy cup, open at the bottom with the dark seed showing, ribbed like a
// paper lantern
function aril(F, x, y, u, G, pulse) {
  const rx = 1.05 * u, ry = 1.3 * u;
  litEll(F, x, y, rx, ry, G[2]);
  litEll(F, x - rx * 0.3, y - ry * 0.3, rx * 0.45, ry * 0.5, G[3]);
  F.p.line(x + rx * 0.35, y - ry * 0.7, x + rx * 0.35, y + ry * 0.6, G[1]);
  if (pulse > 0.7) lit(F, x - rx * 0.4, y - ry * 0.5, G[4]);
  F.p.ellipse(x + 0.1 * u, y + ry * 0.75, rx * 0.5, ry * 0.32, C('#2a1838'));
  F.e.ellipse(x + 0.1 * u, y + ry * 0.75, rx * 0.5, ry * 0.32, C('#2a1838'));
}

// ================================================================== The Barrow King
// The barrow-wight's mound itself. A grassed burial mound with a ring of kerbstones and a rune
// menhir walks on the bony hands of the retainers buried under it; out of its passage-grave door
// leans the crowned skeleton king, grave-moss for a beard, his verdigris barrow blade in hand.
const barrow_king = {
  view: 'side', box: [54, 40], pivot: 0.36, scale: 1.3, idle: 6, idleFps: 4,
  draw(F, o, P) {
    const { u, ox, oy } = F;
    const t = P.t, idle = P.act === 'idle', run = P.act === 'run', w1 = P.atk === 1, w2 = P.atk === 2, hurt = P.hurt;
    const turf = pal5('moss', 5), earth = ramp('#674952'), stone = pal5('stone', 6), stoneD = dimR(stone, 0.8);
    const bone = [C('#5e4a47'), C('#8a6a52'), C('#cfa978'), C('#e2c494'), C('#f6e9cc')], gold = pal5('gold', 5);
    const bronze = ramp('#4a9488'), G = glowRamp(o.c3 || '#89f6c0');
    const tilt = w1 ? -0.08 : w2 ? 0.1 : hurt ? -0.06 : run ? 0.04 * sin(t * 2) : 0;
    const bob = run ? Math.abs(sin(t * 2)) * 0.6 : idle ? sin(t) * 0.15 : 0;
    const X = (x, y) => [ox + (x + tilt * Math.max(0, y - 2)) * u, oy - (y + (y > 1.2 ? bob : 0)) * u];
    const L = layer(F);

    // ---- the retainers' hands carrying the mound
    const hand = (x, ph, far) => {
      const Hd = layer(F), Bm = far ? dimR(bone, 0.72) : bone;
      let [dx, lift] = run ? stride(t * 2 + ph, 3.2, 1.6) : [0, 0];
      if (idle) lift = Math.max(0, sin(t + ph)) * 0.5;
      const wrist = X(x, 3.6), palm = [ox + (x + 0.9 + dx) * u, oy - (1.3 + lift) * u];
      tube(Hd, [wrist, palm], [0.8 * u, 0.65 * u], Bm);
      blob(Hd, [[palm[0], palm[1], 1 * u, 0.7 * u]], Bm);
      for (let k = 0; k < 4; k++) {
        const a = -0.5 + k * 0.42 + (lift > 0.2 ? -0.35 : 0), l = (k === 0 ? 1.5 : 2.1) * u;
        const kn = [palm[0] + Math.cos(a) * l * 0.6, palm[1] - 0.3 * u + Math.sin(a) * l * 0.25], tip = [palm[0] + Math.cos(a) * l, Math.min(oy - 0.3 * u, palm[1] + 0.9 * u + Math.sin(a) * l * 0.3)];
        tube(Hd, [[palm[0], palm[1]], kn, tip], [0.36 * u, 0.24 * u], Bm);
      }
      put(L, Hd, !far);
    };
    for (const [x, ph] of [[-12, 0.1], [-6.5, 0.45], [-1, 0.8], [4.5, 0.15]]) hand(x, ph, true);

    // ---- the rune menhir standing on the back of the mound
    const Mn = layer(F);
    plate(Mn, [X(-11.2, 11.5), X(-7.4, 12), X(-7.6, 23), X(-8.8, 26.6), X(-10.6, 24.4)], stone, { wide: true });
    put(L, Mn, true);
    for (let k = 0; k < 3; k++) { const [rx, ry] = X(-9.6, 15 + k * 3.2); rune(F, rx - 0.8 * u, ry - 0.8 * u, Math.max(3, R(1.6 * u)), k === 1 && idle && P.i % 3 === 0 ? G[2] : G[1], 24 + k * 3); }

    // ---- the mound: earth sides, a turf cap with a grass fringe, kerbstones round the rim
    const Md = layer(F), mc = X(-3, 6.8);
    blob(Md, [[mc[0], mc[1], 15 * u, 8.4 * u], [mc[0] + 5 * u, mc[1] + 1 * u, 9 * u, 6.8 * u]], earth, { tex: 5, clipY: R(oy - 2.4 * u) });
    const Tf = layer(F);
    blob(Tf, [[mc[0], mc[1] - 0.4 * u, 14.7 * u, 8.4 * u], [mc[0] + 5 * u, mc[1] + 0.6 * u, 9 * u, 6.8 * u]], turf, { tex: 7 });
    const edge = (x) => mc[1] - 1.4 * u + Math.sin(x * 0.21) * 0.9 * u + Math.sin(x * 0.07 + 1) * 1.1 * u;
    for (let y = 0; y < Tf.h; y++) for (let x = 0; x < Tf.w; x++) if (Tf.a(x, y) && y > edge(x)) Tf.clear(x, y);
    // grass fringe: tufts hanging over the earth line
    for (let x = 0; x < Tf.w; x += 2) { const y = R(edge(x)); if (Md.a(x, y + 1) && Tf.a(x, y - 1) && hash2(x >> 1, 3, 5) > 0.35) { Tf.set(x, y, turf[2]); Tf.set(x, y + 1, turf[2]); if (hash2(x, 4, 5) > 0.5) Tf.set(x, y + 2, turf[1]); } }
    put(Md, Tf, false);
    // grave-goods and bones poking out of the earth
    { const [a, b] = X(-10, 4.6); Md.disc(a, b, 1.1 * u, bone[3]); Md.set(R(a - 0.3 * u), R(b), C('#140913')); Md.set(R(a + 0.4 * u), R(b), C('#140913')); }
    { const [a, b] = X(-4, 3.6); Md.line(a - 1.6 * u, b, a + 1.4 * u, b - 0.6 * u, bone[3]); Md.line(a - 1.6 * u, b + 1, a + 1.4 * u, b - 0.6 * u + 1, bone[1]); }
    put(L, Md, true);
    const Gg = layer(F);
    tube(Gg, [X(-1.5, 12.8), X(2.4, 19.6)], 0.42 * u, ramp('#5a3628'));
    plate(Gg, [X(2.1, 19.2), X(3, 19.6), X(3.6, 22), X(2.7, 21.2)], pal5('steel', 4));
    { const [a, b] = X(-4.6, 13.4); blob(Gg, [[a, b, 2.2 * u, 1.3 * u]], ramp('#77492f')); Gg.ellipse(a + 0.3 * u, b - 0.2 * u, 0.7 * u, 0.45 * u, pal5('gold', 4)[3]); }
    { const [a, b] = X(-4.6, 12.4); for (let x = R(a - 2.6 * u); x <= a + 2.6 * u; x++) for (let y = R(b); y <= b + 1.2 * u; y++) if (Gg.a(x, y)) Gg.clear(x, y); }
    put(L, Gg, true);
    const Kb = layer(F);
    for (const [x, w, h] of [[-15.2, 2.6, 3.4], [-11.2, 3, 3.8], [-6.8, 2.8, 3.4], [-2.4, 3.2, 3.9], [2, 2.8, 3.5]]) {
      const yb = 2.2, [a0, b0] = X(x, yb), [a1, b1] = X(x + w, yb), [a2, b2] = X(x + w - 0.3, yb + h), [a3, b3] = X(x + 0.2, yb + h - 0.4);
      plate(Kb, [[a0, b0], [a1, b1], [a2, b2], [lerp(a2, a3, 0.5), b2 - 0.5 * u], [a3, b3]], stone);
    }
    spots(Kb, ...X(-6, 4), 9 * u, 1.2 * u, 6, 0.55 * u, turf[3], 7);
    put(L, Kb, true);
    for (const [x, ph] of [[-9.5, 0.3], [-3.5, 0.65], [2, 0.95]]) hand(x, ph, false);

    // ---- passage-grave door: two uprights, a heavy tilted lintel, darkness and wight-light inside
    const Dr = layer(F);
    plate(Dr, [X(7.4, 1.6), X(12.8, 1.6), X(12.8, 12.6), X(7.4, 12.6)], [C('#140913'), C('#140913'), C('#1d0814'), C('#140913'), C('#2a1838')]);
    put(L, Dr, false);
    // ghost-light deep in the passage
    { const [a, b] = X(10.1, 5.2); for (let y = R(b - 3.4 * u); y <= b + 3 * u; y++) for (let x = R(a - 2.4 * u); x <= a + 2.4 * u; x++) if (((x + 0.5 - a) / (2.4 * u)) ** 2 + ((y + 0.5 - b) / (3.4 * u)) ** 2 < 1 && bayer2(x, y) < 0.5 - Math.hypot((x - a) / (2.4 * u), (y - b) / (3.4 * u)) * 0.4) { F.p.set(x, y, G[0]); } }
    const Fr = layer(F);
    plate(Fr, [X(5.6, 1.2), X(7.8, 1.2), X(7.9, 12.8), X(5.5, 13.2)], stone, { wide: true });
    plate(Fr, [X(12.4, 1.2), X(14.6, 1.2), X(14.4, 12.4), X(12.2, 12.8)], stone, { wide: true });
    plate(Fr, [X(4.6, 12.6), X(15.8, 12), X(16.2, 14.6), X(4.8, 15.4)], stone, { wide: true });
    // spiral carving on the lintel, cup marks on the posts
    { const [a, b] = X(9, 13.7); for (let q = 0; q < 1; q += 0.04) { const rr = q * 1.1 * u, an = q * TAU * 1.6; Fr.set(R(a + Math.cos(an) * rr * 1.6), R(b + Math.sin(an) * rr * 0.7), stone[1]); } }
    { const [a, b] = X(13.4, 6); Fr.set(R(a), R(b), stone[1]); Fr.set(R(a), R(b + 3 * u), stone[1]); }
    spots(Fr, ...X(10, 15), 5 * u, 0.6 * u, 4, 0.6 * u, turf[3], 9);
    put(L, Fr, true);

    // ---- the king, leaning out of the door
    const lean = w1 ? -2.4 : w2 ? 3.4 : hurt ? -1.6 : run ? 1 : sin(t) * 0.25;
    const rise = w1 ? 1.2 : w2 ? -0.6 : hurt ? -0.8 : idle ? sin(t) * 0.25 : 0;
    const v = u; { const u = v * 1.32;
    const hip = X(10.2, 3.2), KX = (x, y) => [hip[0] + x * u, hip[1] - y * u];
    const sh = KX(1.2 + lean, 9.2 + rise), head = KX(2.6 + lean * 1.25, 12.6 + rise);
    const K = layer(F);
    // far arm: a bony hand clutching the door post
    const fsh = [sh[0] - 1.2 * u, sh[1] + 0.2 * u], fel = [lerp(fsh[0], X(7.6, 10)[0], 0.5), lerp(fsh[1], X(7.6, 10)[1], 0.5) + 1 * u], fhd = X(7.6, 10);
    tube(K, [fsh, fel], [0.6 * u, 0.5 * u], dimR(bone, 0.75)); tube(K, [fel, fhd], [0.5 * u, 0.45 * u], dimR(bone, 0.75));
    for (let k = 0; k < 3; k++) K.line(fhd[0], fhd[1] + k, fhd[0] - 1 * u, fhd[1] + k * 1.1 + 0.6 * u, bone[2]);
    // spine, pelvis and ribcage
    tube(K, bez([hip, [lerp(hip[0], sh[0], 0.5) - 0.6 * u, lerp(hip[1], sh[1], 0.5)], sh], 10), [0.55 * u, 0.6 * u], bone);
    blob(K, [[hip[0] + 0.2 * u, hip[1] - 0.2 * u, 1.3 * u, 0.8 * u]], dimR(bone, 0.6));
    const rc = [lerp(hip[0], sh[0], 0.62), lerp(hip[1], sh[1], 0.62)], ang = Math.atan2(sh[1] - hip[1], sh[0] - hip[0]);
    for (let k = 0; k < 4; k++) {
      const f = 0.42 + k * 0.15, cx = lerp(hip[0], sh[0], f), cy = lerp(hip[1], sh[1], f), w = (1.7 + Math.sin(f * 3) * 0.8) * u;
      const px = Math.cos(ang + Math.PI / 2), py = Math.sin(ang + Math.PI / 2);
      tube(K, bez([[cx - 0.4 * u, cy], [cx + w * 0.7 - px * 0.6 * u, cy - py * 0.6 * u + 0.5 * u], [cx + w * 1.1, cy + 0.9 * u]], 8), [0.42 * u, 0.32 * u], bone);
    }
    // gold torc and a rotted mail tabard hanging from the shoulders
    const Tb = layer(F);
    const tb0 = [sh[0] - 1.6 * u, sh[1] - 0.2 * u], tb1 = [sh[0] + 1.6 * u, sh[1] + 0.2 * u];
    plate(Tb, [tb0, tb1, [lerp(hip[0], sh[0], 0.45) + 2.2 * u, lerp(hip[1], sh[1], 0.45)], [lerp(hip[0], sh[0], 0.38) + 1.2 * u, lerp(hip[1], sh[1], 0.38) + 0.9 * u], [lerp(hip[0], sh[0], 0.5) - 0.2 * u, lerp(hip[1], sh[1], 0.5) - 0.2 * u], [lerp(hip[0], sh[0], 0.42) - 1.2 * u, lerp(hip[1], sh[1], 0.42) + 0.6 * u]], pal5('steel', 4), { wide: true });
    stripes(Tb, 0, 0, Tb.w, Tb.h, 0.5, 4, 1, '#3a4048');
    for (let y = 0; y < Tb.h; y++) for (let x = 0; x < Tb.w; x++) if (Tb.a(x, y) && ((x * 7 + y * 3) % 11 === 0)) Tb.clear(x, y);
    put(K, Tb, true);
    horn(K, [sh[0] - 1.4 * u, sh[1] - 0.3 * u], [sh[0], sh[1] + 1.2 * u], [sh[0] + 1.5 * u, sh[1] - 0.5 * u], 1 * u, gold);
    put(L, K, true);

    // ---- skull: big and chunky, jaw hanging, moss beard, a tilted crown
    const Hd = layer(F), hr = 2.5 * u;
    const jaw = hurt ? 1.4 : w2 ? 1.1 : w1 ? 0.6 : idle ? 0.15 + Math.max(0, sin(t * 2)) * 0.25 : 0.3;
    // moss beard trailing from the jaw
    const bsw = run ? -0.8 : idle ? sin(t + 0.3) * 0.4 : w2 ? -1 : 0;
    for (let k = 0; k < 5; k++) {
      const bx = head[0] + (0.2 + k * 0.45) * u, by = head[1] + hr * 0.95 + jaw * u * 0.6;
      tube(Hd, bez([[bx, by - 0.5 * u], [bx + bsw * u * 0.5, by + 1.6 * u], [bx + bsw * u - 0.4 * u, by + (2.8 + (k % 2) * 1.4) * u]], 8), [0.6 * u, 0.25 * u], turf);
    }
    blob(Hd, [[head[0], head[1], hr, hr * 0.92], [head[0] + 1.3 * u, head[1] + 0.9 * u, 1.3 * u, 1.1 * u]], bone);
    // jaw
    blob(Hd, [[head[0] + 1 * u, head[1] + hr * 0.75 + jaw * u, 1.5 * u, 0.75 * u]], bone);
    if (jaw > 0.4) Hd.rect(R(head[0] + 0.2 * u), R(head[1] + hr * 0.62), R(2 * u), R(jaw * u * 0.8), C('#140913'));
    teeth(Hd, [head[0] + 0.1 * u, head[1] + hr * 0.6], [head[0] + 2.4 * u, head[1] + hr * 0.6], 4, Math.max(1, 0.5 * u), 1, bone[4]);
    // sockets and nose
    Hd.ellipse(head[0] + 0.1 * u, head[1] - 0.05 * u, 0.8 * u, 0.85 * u, C('#140913'));
    Hd.ellipse(head[0] + 2.05 * u, head[1] - 0.05 * u, 0.5 * u, 0.75 * u, C('#140913'));
    // a heavy scowling brow ridge that dips between the sockets, and a cheekbone
    Hd.poly([[head[0] - 1.3 * u, head[1] - 1.5 * u], [head[0] + 2.9 * u, head[1] - 1.5 * u], [head[0] + 2.8 * u, head[1] - 0.75 * u], [head[0] + 1.25 * u, head[1] - 0.25 * u], [head[0] - 0.9 * u, head[1] - 0.95 * u]], bone[2]);
    Hd.line(head[0] - 0.9 * u, head[1] - 0.95 * u, head[0] + 1.25 * u, head[1] - 0.25 * u, bone[1]);
    Hd.line(head[0] + 1.25 * u, head[1] - 0.25 * u, head[0] + 2.8 * u, head[1] - 0.75 * u, bone[1]);
    Hd.line(head[0] - 0.6 * u, head[1] + 1.1 * u, head[0] + 0.8 * u, head[1] + 1 * u, bone[1]);
    Hd.poly([[head[0] + 1.6 * u, head[1] + 0.8 * u], [head[0] + 2.2 * u, head[1] + 0.8 * u], [head[0] + 1.9 * u, head[1] + 0.2 * u]], C('#140913'));
    crack(Hd, head[0] - 1.2 * u, head[1] - 1.8 * u, 0.9, 2.6 * u, bone[1], 5);
    // crown: tilted forward and to one side, four spikes, one bent
    const ct = (hurt ? -0.35 : w2 ? 0.25 : -0.12) + (idle ? sin(t) * 0.04 : 0);
    const cb = [head[0] - 0.1 * u, head[1] - hr * 0.72];
    const cp = (x, y) => { const [a, b] = rot(x * u, -y * u, ct); return [cb[0] + a, cb[1] + b]; };
    plate(Hd, [cp(-2.4, 0), cp(2.6, 0), cp(2.6, 1.4), cp(-2.4, 1.4)], gold);
    for (const [x, h, b] of [[-2, 2.2, 0], [-0.5, 3, 0], [1, 2.6, 0.5], [2.3, 2.2, 0]]) plate(Hd, [cp(x - 0.6, 1.2), cp(x + 0.6, 1.2), cp(x + b, 1.2 + h)], gold);
    put(L, Hd, true);
    // ---- near arm and the barrow blade
    const W = layer(F);
    let hilt, tip;
    if (w1) { hilt = KX(-1 + lean, 17.5); tip = X(-2, 35); }
    else if (w2) { hilt = X(21.5, 11); tip = X(35, 2.2); }
    else if (hurt) { hilt = X(14.5, 10); tip = X(19.5, 0.4); }
    else { const sw = idle ? sin(t) * 0.2 : run ? sin(t * 2) * 0.4 : 0; hilt = X(17.2 + lean * 0.5 + sw, 11 + rise * 0.5); tip = X(19.8 + sw, 0.2); }
    const nsh = [sh[0] + 0.8 * u, sh[1] + 0.3 * u], nel = [lerp(nsh[0], hilt[0], 0.5) - (w1 ? 1.5 : -0.5) * u, lerp(nsh[1], hilt[1], 0.5) + 1.2 * u];
    const ba = Math.atan2(tip[1] - hilt[1], tip[0] - hilt[0]), bl = Math.hypot(tip[0] - hilt[0], tip[1] - hilt[1]);
    const ax = Math.cos(ba), ay = Math.sin(ba), nx = -ay, ny = ax;
    const P0 = (f, w) => [hilt[0] + ax * bl * f + nx * w * u, hilt[1] + ay * bl * f + ny * w * u];
    // leaf-shaped blade, verdigris bronze, a fuller and glowing runes
    plate(W, [P0(0.12, 0.65), P0(0.6, 0.95), P0(1, 0), P0(0.6, -0.95), P0(0.12, -0.65)], bronze, { wide: true });
    W.line(...P0(0.15, 0), ...P0(0.85, 0), bronze[1]);
    tube(W, [P0(-0.08, 0), P0(0.1, 0)], 0.45 * u, ramp('#5a3628'));
    tube(W, [P0(0.1, -1.4), P0(0.1, 1.4)], 0.42 * u, gold);
    blob(W, [[...P0(-0.11, 0), 0.6 * u, 0.6 * u]], gold);
    tube(W, [nsh, nel], [0.6 * u, 0.5 * u], bone); tube(W, [nel, hilt], [0.5 * u, 0.45 * u], bone);
    blob(W, [[hilt[0], hilt[1], 0.75 * u, 0.7 * u]], bone);
    put(L, W, true);
    put(F.p, L, false);
    for (let k = 0; k < 3; k++) { const [a, b] = P0(0.3 + k * 0.17, 0.25); lit(F, a, b, G[w1 || w2 ? 3 : 1]); lit(F, a + ax * 1.5, b + ay * 1.5, G[w1 || w2 ? 2 : 1]); }
    if (w2) for (let k = 0; k < 3; k++) { const [a, b] = P0(0.55 + k * 0.17, -1.6 - k * 0.4); litLine(F, a, b, a + ax * 2.2 * u, b + ay * 2.2 * u, G[3]); }
    // wight-light eyes
    const eh = hurt ? 0 : 1, ec = G[w1 ? 4 : 3];
    if (eh) { litDisc(F, head[0] + 0.2 * u, head[1] + 0.05 * u, 0.36 * u, G[2]); lit(F, head[0] + 0.2 * u, head[1] - 0.1 * u, ec); litDisc(F, head[0] + 2.05 * u, head[1] + 0.05 * u, 0.24 * u, G[2]); }
    else { litLine(F, head[0] - 0.3 * u, head[1], head[0] + 0.8 * u, head[1] + 0.2 * u, G[1]); }
    // motes of wight-light drifting out of the passage
    if (idle || run) for (let k = 0; k < 3; k++) { const q = (t + k / 3) % 1, [a, b] = X(9.4 + k * 1.2 + sin(q + k) * 0.6, 4 + q * 9); lit(F, a, b, G[q < 0.6 ? 2 : 1]); }
    // dirt shaken loose on hurt
    if (hurt) for (let k = 0; k < 5; k++) { const [a, b] = X(-12 + k * 4.5, 1.2 + (k % 2) * 0.8); F.p.rect(R(a), R(b), 2, 2, earth[2]); }
    F.mouth = [head[0] + 1.8 * u, head[1] + hr * 0.7];
    }
  },
};
const bayer2 = (x, y) => [0, 0.5, 0.75, 0.25][(x & 1) + ((y & 1) << 1)];

// ================================================================== The Thorn Queen
// The queen of the fair folk as a moth: great dusk-moth wings with long trailing tails, a crown of
// briar roses, a gown woven of living brambles that trails thorns beneath her as she floats, and a
// cracked porcelain mask for a face. The painted eyespots on her wings are not paint: when she
// strikes they open and look at you.
const QSKIN = ['#4a3266', '#8a58a3', '#c8a4dc', '#e7d5ed', '#fff4fb'];
// a rose bloom: a lit ball with a dark spiral of petals and a pale lip
function rose(L, x, y, r, Rm) {
  blob(L, [[x, y, r, r * 0.9]], Rm);
  for (let q = 0.15; q < 1; q += 0.05) { const a = q * TAU * 1.7, rr = q * r * 0.8; L.set(R(x + Math.cos(a) * rr), R(y + Math.sin(a) * rr * 0.85), Rm[1]); }
  L.set(R(x - r * 0.4), R(y - r * 0.55), Rm[4]);
  return L;
}
// a bramble cane along a path with hooked thorns on its outer side
function bramble(L, pts, r, Rm, seed, thornC) {
  tube(L, pts, r, Rm);
  const rr = typeof r === 'number' ? r : Array.isArray(r) ? r[0] : r(0);
  const tc = C(thornC || Rm[4]);
  for (let i = 2; i < pts.length - 1; i += 2) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], d = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / d, ny = (bx - ax) / d, sd = hash2(i, 1, seed) < 0.5 ? 1 : -1;
    const l = rr * 1.9;
    L.poly([[bx + nx * sd * rr * 0.6 - (bx - ax) / d * rr * 0.5, by + ny * sd * rr * 0.6 - (by - ay) / d * rr * 0.5], [bx + nx * sd * rr * 0.6 + (bx - ax) / d * rr * 0.5, by + ny * sd * rr * 0.6 + (by - ay) / d * rr * 0.5], [bx + nx * sd * l - (bx - ax) / d * l * 0.4, by + ny * sd * l - (by - ay) / d * l * 0.4]], tc);
  }
  return L;
}
// A moth wing in banded scales from the root, along angle a, len long and wid deep.
// kind 'fore' (a hooked tip) or 'hind' (a round lobe with a long trailing tail). Returns the eyespot
// centre and radius.
function mothWing(L, root, a, len, wid, Rm, kind, o = {}) {
  const P = (x, y) => { const [rx, ry] = rot(x * len, y * wid, a); return [root[0] + rx, root[1] + ry]; };
  let shape;
  if (kind === 'fore') shape = [[0, -0.12], [0.35, -0.3], [0.75, -0.36], [1, -0.28], [1.04, -0.1], [0.96, 0.12], [0.8, 0.42], [0.58, 0.62], [0.36, 0.6], [0.12, 0.36]];
  else shape = [[0, -0.1], [0.3, -0.38], [0.6, -0.46], [0.82, -0.3], [0.9, 0], [0.84, 0.26], [0.95, 0.46], [1.25, 0.6], [1.42, 0.72], [1.3, 0.78], [0.9, 0.62], [0.62, 0.52], [0.3, 0.42], [0.08, 0.2]];
  const band = (k, c) => plate(L, shape.map(([x, y]) => P(x * k, y * k)), Rm, c ? { c } : {});
  band(1, Rm[1]); band(0.88); band(0.66, Rm[1]); band(0.6); band(0.34, o.base || Rm[4]);
  // veins
  for (let k = 0; k < 4; k++) { const [x, y] = shape[2 + k * 2] || shape[shape.length - 3]; const p0 = P(0.15, 0.05), p1 = P(x * 0.9, y * 0.9); L.line(p0[0], p0[1], p1[0], p1[1], Rm[2]); }
  // pale scalloped margin
  for (let i = 1; i < shape.length; i++) { const p = P(shape[i][0] * 0.95, shape[i][1] * 0.95); if (i % 2) L.over(R(p[0]), R(p[1]), C(o.margin || CREAM)); }
  return { at: P(kind === 'fore' ? 0.6 : 0.48, kind === 'fore' ? 0.1 : 0.08), r: wid * (kind === 'fore' ? 0.2 : 0.25) };
}
// a moth eyespot that can wake: painted rings with a dull iris and pupil; awake (open 0..1) the
// iris ignites, the pupil narrows to a slit and catches the light
function eyespot(F, x, y, r, open, Rm, G, look = 0) {
  F.p.disc(x, y, r, Rm[0]);
  F.p.disc(x, y, r * 0.82, C(CREAM));
  F.p.disc(x, y, r * 0.64, C('#2a1838'));
  const ir = r * 0.5, lx = x + look * r * 0.12;
  if (open > 0.05) {
    for (const L of [F.p, F.e]) { L.disc(lx, y, ir, G[2]); L.disc(lx - ir * 0.2, y - ir * 0.2, ir * 0.6, G[3]); }
    F.p.rect(R(lx - Math.max(0.5, ir * 0.18)), R(y - ir * 0.85 * open), Math.max(1, R(ir * 0.36)), Math.max(2, R(ir * 1.7 * open)), C('#140913'));
    lit(F, lx - ir * 0.45, y - ir * 0.45, G[4]);
  } else {
    F.p.disc(x, y, ir, Rm[2]);
    F.p.disc(x, y, ir * 0.45, C('#2a1838'));
    F.p.set(R(x - ir * 0.4), R(y - ir * 0.4), Rm[4]);
  }
}
const thorn_queen = {
  view: 'side', box: [50, 48], pivot: 0.38, scale: 1.12, idle: 6, idleFps: 4, hover: true, hoverPx: 0,
  draw(F, o, P) {
    const { u, ox, oy } = F;
    const t = P.t, idle = P.act === 'idle', run = P.act === 'run', w1 = P.atk === 1, w2 = P.atk === 2, hurt = P.hurt;
    const WG = pal5('lavender', 5), WGd = dimR(WG, 0.72), SK = QSKIN.map((c) => C(c)), ROSE = pal5('rose', 4), BR = ramp('#33502c'), HAIR = pal5('plum', 4), DR = ramp('#7a2f4a');
    const G = glowRamp(o.c3 || '#f689f6');
    const lean = run ? 0.18 : w1 ? -0.12 : w2 ? 0.22 : hurt ? -0.15 : 0;
    const fl = idle ? sin(t) * 0.5 : run ? sin(t * 2) * 0.4 : 0;
    const X = (x, y) => [ox + (x + lean * Math.max(0, y - 4)) * u, oy - (y + fl) * u];
    const L = layer(F);
    // wing beat: 0 = rest, + raised
    const beat = idle ? sin(t) * 0.1 : run ? sin(t * 2) * 0.28 : w1 ? 0.35 : w2 ? -0.3 : hurt ? -0.4 : 0;
    const open = w1 ? 0.7 : w2 ? 1 : hurt ? 0 : idle ? [0, 0, 0.3, 0, 0, 0][P.i] : 0;
    const spots = [];
    // ---- far wings (darker, raised a little more)
    const back = X(-1.6, 21.5);
    spots.push({ ...mothWing(L, back, -2.0 - beat - 0.14, 16 * u, 10.5 * u, WGd, 'fore', { margin: WG[3] }), R: WGd, o: 0 });
    mothWing(L, [back[0], back[1] + 1.5 * u], 2.3 + beat * 0.5, 11 * u, 8 * u, WGd, 'hind', { margin: WG[3] });
    // ---- hair streaming back
    const hsw = run ? 1.2 : w2 ? 1 : idle ? sin(t + 0.3) * 0.4 : 0;
    const Hr = layer(F);
    const hd = X(0.6, 28.4);
    tube(Hr, bez([[hd[0] - 0.5 * u, hd[1] - 2 * u], [hd[0] - 4.5 * u - hsw * u, hd[1] + 1 * u], [hd[0] - 4 * u - hsw * 1.6 * u, hd[1] + 7 * u], [hd[0] - 6.5 * u - hsw * 2.2 * u, hd[1] + 11 * u]], 18), (q) => (2.4 - q * 1.6) * u, HAIR, { tex: 3 });
    put(L, Hr, true);
    // ---- near wings over the hair
    const fw = mothWing(L, back, -2.2 - beat, 17.5 * u, 11.5 * u, WG, 'fore', { margin: SK[3], base: ROSE[2] });
    const hw = mothWing(L, [back[0], back[1] + 1.4 * u], 2.45 + beat * 0.5, 12.5 * u, 9 * u, WG, 'hind', { margin: SK[3], base: ROSE[2] });
    // rose band across the forewing
    put(F.p, L, false);
    const L2 = layer(F);
    // ---- gown: a bell of woven bramble canes with roses, ragged thorn hem trailing below
    const Gw = layer(F), wt = X(0, 15.8), hem = 3.4;
    const trail = run ? 2.6 : w2 ? 1.6 : idle ? sin(t + 0.5) * 0.5 : hurt ? -0.6 : 0;
    drape(Gw, wt[0], wt[1], 5 * u, 15 * u, (15.8 - hem) * u, BR, { lean: trail * u, teeth: 6, wave: 0.9 * u, phase: t, ragged: true, seed: 5, folds: 3 });
    // canes spiralling down the skirt
    for (let k = 0; k < 5; k++) {
      const x0 = -2 + k * 1.1, x1 = -7.2 + k * 3.4 - trail;
      bramble(Gw, bez([X(x0, 15), X(x0 + (k % 2 ? 2 : -2), 9.5), X(x1, hem + 0.6)], 14), [0.5 * u, 0.4 * u], BR, 30 + k, BR[4]);
    }
    for (const [x, y, r] of [[-4.6, 5.4, 1.4], [1.8, 6.6, 1.2], [5.2, 4.8, 1.35], [-1.2, 10.4, 1.05], [3.4, 11.6, 0.9]]) rose(Gw, ...X(x - trail * (1 - y / 15), y), r * u, ROSE);
    put(L2, Gw, true);
    // thorn tendrils reaching down to the ground
    const Td = layer(F);
    for (let k = 0; k < 4; k++) {
      const x = -5 + k * 3.3 - trail, sw = idle ? sin(t + k * 0.3) * 0.6 : run ? -1.5 - k * 0.3 : 0;
      bramble(Td, bez([X(x, hem + 1), X(x - 0.6 + sw, 1.6), [ox + (x - 1.2 + sw * 1.6) * u, oy - 0.1 * u]], 10), [0.42 * u, 0.15 * u], BR, 40 + k, BR[4]);
    }
    put(L2, Td, false);
    // ---- bodice of rose petals, slim arms
    const Bd = layer(F);
    plate(Bd, [X(-2.2, 23), X(2.8, 23), X(2.2, 18.6), X(1.4, 15.2), X(-1.2, 15.2), X(-2, 18.6)], DR, { wide: true });
    for (let k = 0; k < 5; k++) { const [a, b] = X(-1.6 + k * 0.95, 15.6 + (k % 2) * 0.8); Bd.poly([[a - 0.7 * u, b - 0.9 * u], [a + 0.7 * u, b - 0.9 * u], [a, b + 0.7 * u]], DR[k % 2 ? 2 : 4]); }
    Bd.line(...X(0.3, 22.4), ...X(0.2, 16.4), DR[1]);
    // neck
    tube(Bd, [X(0.4, 22.6), X(0.6, 24.2)], 0.8 * u, SK);
    put(L2, Bd, true);
    // ---- far arm: an open hand flung back, gathering thorns to throw
    const Fa = layer(F), fsh = X(-1.4, 22.2);
    const fhd = w1 ? X(-6, 26) : w2 ? X(-6.5, 18) : run ? X(-5.5, 17) : X(-4.2 + sin(t) * 0.3, 16.5);
    tube(Fa, [fsh, [lerp(fsh[0], fhd[0], 0.5), lerp(fsh[1], fhd[1], 0.5) + 0.6 * u], fhd], [0.8 * u, 0.6 * u], dimR(SK, 0.8));
    blob(Fa, [[fhd[0], fhd[1], 0.8 * u, 0.75 * u]], dimR(SK, 0.8));
    put(L2, Fa, true);
    put(F.p, L2, false);
    // ---- the head: a porcelain mask, briar crown, hair falling behind
    const v = u; { const u = v * 1.35;
    const Hd = layer(F);
    blob(Hd, [[hd[0] - 0.6 * u, hd[1] + 0.4 * u, 2.6 * u, 3 * u]], HAIR, { tex: 3 });
    // a standing ruff of rose-tipped thorns fanned out behind the head
    const Rf = layer(F);
    for (let k = 0; k < 9; k++) { const a = Math.PI * (0.62 + k * 0.13), l = (k % 2 ? 3.8 : 4.8) * u, b0 = [hd[0] - 0.2 * u, hd[1] + 1.6 * u]; horn(Rf, b0, [b0[0] + Math.cos(a + 0.25) * l * 0.5, b0[1] + Math.sin(a + 0.25) * l * 0.5], [b0[0] + Math.cos(a) * l, b0[1] + Math.sin(a) * l], 1.1 * u, k % 2 ? BR : DR); }
    put(Hd, Rf, true);
    const mt = idle ? sin(t) * 0.05 : w2 ? 0.12 : -0.08;
    const mk = [hd[0] + 0.7 * u, hd[1] + 0.1 * u], M = (x, y) => { const [a, b] = rot(x * u, y * u, mt); return [mk[0] + a, mk[1] + b]; };
    // the mask: a flat porcelain oval facing out, painted brows, almond holes, a small rose mouth
    const Mk = layer(F);
    const mpts = []; for (let k = 0; k < 20; k++) { const a = k / 20 * TAU; mpts.push(M(Math.cos(a) * 2.3, Math.sin(a) * (Math.sin(a) > 0 ? 3.2 : 2.6))); }
    plate(Mk, mpts, SK, { wide: true });
    const eye = (cx, w, h, s) => { const c = M(cx, -0.3); Mk.poly([M(cx - w, -0.3 + s * 0.15), M(cx - w * 0.2, -0.3 - h), M(cx + w, -0.3 - s * 0.15), M(cx + w * 0.1, -0.3 + h * 0.75)], C('#140913')); return c; };
    const e1 = eye(-1, 1.05, 0.85, 1), e2 = eye(1.1, 1.1, 0.9, -1);
    Mk.line(...M(-1.8, -1.4), ...M(-0.3, -1.25), SK[1]); Mk.line(...M(0.3, -1.3), ...M(1.9, -1.6), SK[1]);
    for (let x = -0.6; x <= 0.65; x += 0.15) { const p = M(x + 0.2, 1.55 + (1 - (x / 0.65) ** 2) * 0.22); Mk.set(R(p[0]), R(p[1]), ROSE[1]); }
    { const p = M(0.2, 1.95); Mk.set(R(p[0]), R(p[1]), ROSE[2]); Mk.set(R(p[0]) + 1, R(p[1]), ROSE[2]); }
    Mk.line(...M(1.3, 0.5), ...M(1.1, 1.6), ROSE[2]);
    crack(Mk, ...M(-1.6, -2.2), 1.1, 2.6 * u, SK[1], 7);
    put(Hd, Mk, true);
    if (hurt) {
      const sh = [M(0.1, -2.6), M(2.2, -1.6), M(1.9, 0.8), M(0.4, 0.2)];
      Hd.poly(sh, C('#140913'));
      F.p.poly(sh.map(([a, b]) => [a + 2.8 * u, b - 1.4 * u]), SK[3]);
    }
    // the briar crown: canes knotted in a ring, thorns up, three roses, set at a tilt
    const ct = w2 ? 0.2 : hurt ? -0.35 : -0.15;
    const cr = (x, y) => { const [a, b] = rot(x * u, -y * u, ct); return [mk[0] - 0.3 * u + a, mk[1] - 2.9 * u + b]; };
    bramble(Hd, bez([cr(-3, 0.2), cr(0, -0.8), cr(3.2, 0.4)], 12), 0.55 * u, BR, 51, BR[4]);
    for (const [x, h] of [[-2.4, 2.6], [-1, 3.6], [0.6, 3], [2.2, 3.8]]) horn(Hd, cr(x, 0.4), cr(x - 0.2, h * 0.6), cr(x + 0.5, h), 0.9 * u, BR);
    for (const [x, y, r] of [[-1.8, 1.4, 1.1], [0.2, 1.8, 1.25], [2.4, 1.2, 1]]) rose(Hd, ...cr(x, y), r * u, ROSE);
    put(F.p, Hd, true);
    // eyes behind the mask
    if (!hurt) { litDisc(F, e1[0], e1[1] + 0.05 * u, 0.36 * u, G[2]); litDisc(F, e2[0], e2[1] + 0.05 * u, 0.42 * u, G[3]); lit(F, e2[0], e2[1], G[4]); lit(F, e1[0], e1[1], G[3]); }
    else { litDisc(F, e2[0] - 0.2 * u, e2[1] - 0.4 * u, 0.5 * u, G[3]); lit(F, e2[0] - 0.2 * u, e2[1] - 0.4 * u, G[4]); }
    }
    // ---- near arm and the thorn spear: a rose cane with one great curved thorn for a blade
    const S = layer(F), nsh = X(1.6, 22.2);
    let hand, butt, tip;
    if (w1) { hand = X(-2.5, 20.5); butt = X(-15, 19.4); tip = X(5, 21.6); }
    else if (w2) { hand = X(9.5, 20); butt = X(-3, 19.4); tip = X(25, 21); }
    else if (hurt) { hand = X(4, 18); butt = X(1.5, 5); tip = X(8, 34); }
    else if (run) { hand = X(5, 18.5); butt = X(-10, 13); tip = X(17, 23.5); }
    else { const sw = sin(t) * 0.3; hand = X(5.2, 17.6 + sw); butt = X(5.6, 2.4 + sw); tip = X(6.6, 37 + sw); }
    const da = Math.atan2(tip[1] - butt[1], tip[0] - butt[0]), dl = Math.hypot(tip[0] - butt[0], tip[1] - butt[1]);
    const Q = (f, w) => [butt[0] + Math.cos(da) * dl * f - Math.sin(da) * w * u, butt[1] + Math.sin(da) * dl * f + Math.cos(da) * w * u];
    bramble(S, [Q(0, 0), Q(0.25, 0.15), Q(0.5, -0.1), Q(0.75, 0.1), Q(0.86, 0)], 0.42 * u, BR, 61, BR[4]);
    plate(S, [Q(0.84, -0.9), Q(0.92, -0.75), Q(1, 0.5), Q(0.9, 0.55), Q(0.84, 0.7)], ROSE.map((c) => light(c, 1.1)), { wide: true });
    rose(S, ...Q(0.82, 0), 1.2 * u, ROSE);
    tube(S, [nsh, [lerp(nsh[0], hand[0], 0.5), lerp(nsh[1], hand[1], 0.5) + 0.8 * u], hand], [0.65 * u, 0.5 * u], SK);
    blob(S, [[hand[0], hand[1], 0.75 * u, 0.7 * u]], SK);
    put(F.p, S, true);
    // ---- the wing eyes (the near pair open on the attack and when she blinks at you)
    eyespot(F, fw.at[0], fw.at[1], fw.r, open, WG, G, w2 ? 1 : 0);
    eyespot(F, hw.at[0], hw.at[1], hw.r, w1 || w2 ? open : idle ? [0, 0, 0, 0, 0.4, 0][P.i] : 0, WG, G, w2 ? 1 : 0);
    // drifting petal
    if (idle) { const q = t, [a, b] = X(-6 + q * 4, 14 - q * 10); F.p.rect(R(a), R(b), 2, 1, ROSE[3]); F.p.set(R(a), R(b) + 1, ROSE[2]); }
    if (w2) for (let k = 0; k < 3; k++) { const [a, b] = Q(1.05 + k * 0.06, (k - 1) * 0.8); litLine(F, a, b, a + Math.cos(da) * 2.4 * u, b + Math.sin(da) * 2.4 * u, G[3]); }
    F.mouth = w1 || w2 ? Q(0.92, 0) : X(-3.4, 18);
  },
};

// ================================================================== The Labyrinth Itself
// The maze's own gate, come to fetch you. A clipped hedge wall walks on its stone gatepost plinths;
// topiary towers stand on its shoulders (one tiered, one spiral-clipped and bent); its mouth is a
// stone archway with a wrought-iron portcullis for teeth, and inside the arch the maze goes on and
// on, corridor after corridor, with two eyes watching from the dark at the end.
// clipped-leaf texture over existing pixels: light and dark leaf clusters on 3x2 bricks
function leafy(L, Rm, seed, x0 = 0, y0 = 0, x1 = L.w - 1, y1 = L.h - 1, k = 1, only = null) {
  const ok = only ? new Set(only.map((c) => (c[0] << 16) | (c[1] << 8) | c[2])) : null;
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(L.h - 1, y1); y++) for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(L.w - 1, x1); x++) {
    if (!L.a(x, y)) continue;
    if (ok) { const i = (y * L.w + x) * 4; if (!ok.has((L.d[i] << 16) | (L.d[i + 1] << 8) | L.d[i + 2])) continue; }
    // leaves in little mounds on a jittered 5x4 grid: a lit cap over a shadowed underside
    const row = Math.floor(y / 4), sh = Math.floor(hash2(row, 7, seed) * 5), cx = Math.floor((x + sh) / 5), h = hash2(cx, row, seed);
    const lx = (x + sh) % 5, ly = y % 4;
    if (h > 1 - 0.2 * k) { if ((ly === 1 && lx >= 1 && lx <= 3) || (ly === 0 && lx === 2)) L.set(x, y, Rm[4]); else if (ly === 2 && lx >= 1 && lx <= 3) L.set(x, y, Rm[2]); }
    else if (h < 0.14 * k) { if (ly === 2 && lx >= 1 && lx <= 3) L.set(x, y, Rm[1]); else if (ly === 3 && lx === 2) L.set(x, y, Rm[1]); }
  }
  return L;
}
const maze_warden_elder = {
  view: 'front', box: [48, 42], pivot: 0.5, scale: 0.9, idle: 6, idleFps: 4,
  draw(F, o, P) {
    const { u, ox, oy } = F;
    const t = P.t, idle = P.act === 'idle', run = P.act === 'run', w1 = P.atk === 1, w2 = P.atk === 2, hurt = P.hurt;
    const HG = pal5('green', 4), HGt = pal5('green', 5), HGd = dimR(HG, 0.8), HGs = dimR(HG, 0.62), ST = pal5('stone', 6), STd = dimR(ST, 0.82), IRON = pal5('steel', 3);
    const G = glowRamp(o.c3 || '#c1f798');
    // the wall rocks side to side as it walks; rises on the wind-up, drops on the slam
    const rock = run ? sin(t) * 0.05 : hurt ? -0.05 : idle ? sin(t) * 0.008 : 0;
    const lift = w1 ? 1 : w2 ? -1 : run ? Math.abs(sin(t)) * 0.8 : idle ? sin(t) * 0.2 : 0;
    const X = (x, y) => { const yy = y + (y > 3 ? lift : 0); return [ox + (x + rock * yy) * u, oy - (yy - Math.abs(x) * 0 + rock * x * 0.6) * u]; };
    const L = layer(F);
    // ---- gatepost plinths for feet
    for (const sd of [-1, 1]) {
      const ph = run ? Math.max(0, sin(t + (sd > 0 ? 0.5 : 0))) * 1.6 : 0;
      const fx = sd * 8.5, w = 3;
      const Pl = layer(F);
      plate(Pl, [[ox + (fx - w) * u, oy - (ph + 0.2) * u], [ox + (fx + w) * u, oy - (ph + 0.2) * u], [ox + (fx + w - 0.4) * u, oy - (ph + 4.6) * u], [ox + (fx - w + 0.4) * u, oy - (ph + 4.6) * u]], ST, { wide: true });
      plate(Pl, [[ox + (fx - w - 0.6) * u, oy - (ph + 0.2) * u], [ox + (fx + w + 0.6) * u, oy - (ph + 0.2) * u], [ox + (fx + w + 0.6) * u, oy - (ph + 1.4) * u], [ox + (fx - w - 0.6) * u, oy - (ph + 1.4) * u]], ST);
      Pl.line(ox + (fx - w + 0.6) * u, oy - (ph + 3) * u, ox + (fx + w - 0.6) * u, oy - (ph + 3) * u, ST[2]);
      spots(Pl, ox + fx * u, oy - (ph + 2) * u, w * u, 1.4 * u, 3, 0.5 * u, HG[2], 3 + sd);
      put(L, Pl, true);
    }
    // ---- arms of clipped hedge with stone-cuffed topiary fists (far side first: both are near)
    const arm = (sd) => {
      const Ar = layer(F), sh = X(sd * 13.6, 17.5);
      let fist;
      if (w1) fist = X(sd * 16.5, 31.5);
      else if (w2) fist = [ox + sd * 11.5 * u, oy - 2.4 * u];
      else if (hurt) fist = X(sd * 18, 8);
      else { const sw = run ? sin(t + (sd > 0 ? 0.5 : 0)) * 1.4 : sin(t + (sd > 0 ? 0.3 : 0)) * 0.4; fist = X(sd * 19 + sw * 0.3, 6.5 + sw); }
      const el = [lerp(sh[0], fist[0], 0.5) + sd * 2 * u, lerp(sh[1], fist[1], 0.5) - (w1 ? 0 : 0.6) * u];
      // clipped topiary balls strung on a woody limb: shoulder, elbow, forearm, then a big fist
      const path = bez([sh, el, fist], 12);
      tube(Ar, path, 0.8 * u, ramp('#5a3628'));
      for (const [f, r] of [[0, 2.7], [0.42, 2.1], [0.7, 1.8]]) { const q = path[R(f * 12)]; blob(Ar, [[q[0], q[1], r * u, r * 0.92 * u]], HG, { tex: 11 }); }
      blob(Ar, [[fist[0], fist[1] - 0.3 * u, 3 * u, 2.8 * u]], HG, { tex: 12 });
      leafy(Ar, HG, 13 + sd);
      // stone urn cuff at the wrist
      const cx = lerp(el[0], fist[0], 0.62), cy = lerp(el[1], fist[1], 0.62), a = Math.atan2(fist[1] - el[1], fist[0] - el[0]);
      const pc = (along, across) => [cx + Math.cos(a) * along * u - Math.sin(a) * across * u, cy + Math.sin(a) * along * u + Math.cos(a) * across * u];
      plate(Ar, [pc(-0.9, -2.5), pc(0.9, -2.8), pc(0.9, 2.8), pc(-0.9, 2.5)], ST);
      put(L, Ar, true);
    };
    // ---- the wall: a clipped hedge block with merlons along its top and a lit top face
    const Wl = layer(F);
    const top = 23.2, wpts = [X(-14.5, 3.2), X(14.5, 3.2), X(14.5, top)];
    for (let k = 7; k >= -7; k--) { const x = k * 2; const up = k % 2 ? 0 : 1.6; wpts.push(X(x + 1, top + up), X(x - 1, top + up)); }
    wpts.push(X(-14.5, top));
    plate(Wl, wpts, HG, { wide: true });
    // form: a lit band under the merlons, a shadowed skirt along the bottom
    for (let y = 0; y < Wl.h; y++) for (let x = 0; x < Wl.w; x++) {
      if (!Wl.a(x, y)) continue;
      const fy = (oy - lift * u - y) / u;
      if (fy > top - 2.2 && fy < top - 0.8) Wl.set(x, y, HGt[3]);
      else if (fy < 5.4 && fy > 3.4) Wl.set(x, y, HG[2]);
    }
    leafy(Wl, HG, 21);
    // a darker band of shadow under the merlon line and down the right side (clipped planes)
    for (let k = -7; k <= 7; k += 2) { const [a, b] = X(k * 2, top); Wl.line(a - 1 * u, b + 1, a + 1 * u, b + 1, HG[2]); }
    // white flowers in clusters
    for (let k = 0; k < 7; k++) { const [a, b] = X(-12 + hash2(k, 1, 4) * 24, 5 + hash2(k, 2, 4) * 16); if (Math.abs(a - ox) > 6.5 * u) { Wl.over(R(a), R(b), CREAM); Wl.over(R(a) + 1, R(b) + 1, CREAM); Wl.over(R(a) - 1, R(b) + 1, '#cfa978'); } }
    // the arch opening: the maze inside, receding
    const ac = X(0, 12.2), ar = 5.2 * u, ab = X(0, 3.2)[1];
    const inArch = (x, y, sc = 1) => { const r = ar * sc, cy = ac[1] + (1 - sc) * (ab - ac[1]) * 0.35; return (y >= cy && Math.abs(x + 0.5 - ac[0]) <= r) || (x + 0.5 - ac[0]) ** 2 + (y + 0.5 - cy) ** 2 <= r * r; };
    for (let y = R(ac[1] - ar - 1); y <= ab; y++) for (let x = R(ac[0] - ar - 1); x <= ac[0] + ar + 1; x++) if (inArch(x, y) && y <= ab) Wl.clear(x, y);
    put(L, Wl, true);
    arm(-1); arm(1);
    const Mz = layer(F);
    // inside the arch: a corridor of hedge running away into the dark, its far end turning
    const vx = ac[0] + 0.15 * ar, vy = ab - 0.62 * ar;        // vanishing point
    for (let y = R(ac[1] - ar - 1); y <= ab; y++) for (let x = R(ac[0] - ar - 1); x <= ac[0] + ar + 1; x++) {
      if (!inArch(x, y) || y > ab) continue;
      const px = x + 0.5, py = y + 0.5;
      // which plane: floor below the line from the arch's bottom corners to the vanishing point,
      // walls left and right, far darkness in between
      const fl = ab - (ab - vy) * Math.min(1, Math.abs(px - vx) / ar) * 0;
      const lw = ac[0] - ar + (vx - (ac[0] - ar)) * clamp((py - (ac[1] - ar)) / (ab - ac[1] + ar), 0, 1) * 0;
      const depthL = (px - (ac[0] - ar)) / (vx - (ac[0] - ar)), depthR = ((ac[0] + ar) - px) / ((ac[0] + ar) - vx);
      const floorY = (d) => lerp(ab, vy, d);
      let c = C('#140913');
      if (depthL < 0.78 && py > floorY(depthL) - (1 - depthL) * 0.9 * ar * 2.6 && depthL < depthR) {
        // left wall, lit, banded by depth
        c = depthL < 0.3 ? HGs[3] : depthL < 0.55 ? HGs[2] : HGs[1];
        if (((R(px * 0.6 + py * 0.35) >> 1) & 3) === 0) c = HGs[Math.max(0, depthL < 0.3 ? 2 : 1)];
      } else if (depthR < 0.62 && py > floorY(depthR) - (1 - depthR) * 0.9 * ar * 2.6 && depthR <= depthL) {
        c = depthR < 0.3 ? HGs[1] : C('#1a281f');
      }
      if (py > floorY(Math.min(depthL, depthR, 1)) && py > vy) c = mixc(ST[1], C('#140913'), 0.45 + 0.4 * (1 - (py - vy) / (ab - vy)));
      Mz.set(x, y, c);
    }
    // the corridor turns at the far end: a dim gap of light on the right
    { const gx = vx + 0.08 * ar, gy = vy; Mz.rect(R(gx), R(gy - 0.5 * ar), Math.max(2, R(0.18 * ar)), R(0.5 * ar), G[0]); Mz.rect(R(gx), R(gy - 0.5 * ar), 1, R(0.5 * ar), G[1]); }
    put(L, Mz, false);
    // ---- portcullis: wrought-iron bars with spear finials, the arch's teeth
    const drop = w2 ? 1 : w1 ? -0.2 : hurt ? 0.55 : idle ? 0.05 + Math.max(0, sin(t)) * 0.05 : 0.1;
    const Pc = layer(F), gateTop = ac[1] - ar - 1 * u, gateLen = (ab - gateTop) * (0.25 + drop * 0.75);
    for (let k = -4; k <= 4; k++) {
      const x = ac[0] + k * ar * 0.24, yb = gateTop + gateLen;
      if (!inArch(R(x), R(yb - 1))) continue;
      Pc.rect(R(x - 0.25 * u), R(gateTop), Math.max(2, R(0.55 * u)), R(gateLen - 1.4 * u), IRON[1]);
      Pc.rect(R(x - 0.25 * u), R(gateTop), 1, R(gateLen - 1.4 * u), IRON[3]);
      Pc.poly([[x - 0.75 * u, yb - 1.6 * u], [x + 0.85 * u, yb - 1.6 * u], [x + 0.05 * u, yb + 0.2 * u]], IRON[3]);
      Pc.set(R(x - 0.2 * u), R(yb - 1.2 * u), IRON[4]);
    }
    for (const f of [0.3, 0.75]) { const y = gateTop + gateLen * f * 0.8; if (gateLen * f * 0.8 > 2 * u) Pc.rect(R(ac[0] - ar), R(y), R(ar * 2), Math.max(2, R(0.45 * u)), IRON[2]); }
    for (let y = 0; y < Pc.h; y++) for (let x = 0; x < Pc.w; x++) if (Pc.a(x, y) && !inArch(x, y)) Pc.clear(x, y);
    put(L, Pc, true);
    // ---- the stone archway: voussoirs and a keystone carved with the maze's spiral
    const Ac = layer(F);
    const nv = 9;
    for (let k = 0; k < nv; k++) {
      const a0 = Math.PI + k / nv * Math.PI, a1 = Math.PI + (k + 1) / nv * Math.PI, r0 = ar + 0.2 * u, r1 = ar + 2.2 * u + (k === 4 ? 1 * u : 0);
      const pt = (a, r) => [ac[0] + Math.cos(a) * r, ac[1] + Math.sin(a) * r];
      plate(Ac, [pt(a0 + 0.02, r0), pt(a1 - 0.02, r0), pt(a1 - 0.02, r1), pt(a0 + 0.02, r1)], k === 4 ? ST : STd);
    }
    for (const sd of [-1, 1]) plate(Ac, [[ac[0] + sd * (ar + 0.2 * u), ac[1]], [ac[0] + sd * (ar + 2.2 * u), ac[1]], [ac[0] + sd * (ar + 2.4 * u), ab], [ac[0] + sd * (ar + 0.2 * u), ab]], STd);
    for (let k = 1; k < 4; k++) for (const sd of [-1, 1]) { const y = lerp(ac[1], ab, k / 4); Ac.line(ac[0] + sd * (ar + 0.3 * u), y, ac[0] + sd * (ar + 2.2 * u), y, ST[1]); }
    // ivy creeping over the left jamb
    spots(Ac, ac[0] - ar - 1.2 * u, ac[1] - 1 * u, 1.4 * u, 4 * u, 6, 0.5 * u, HG[3], 31);
    put(L, Ac, true);
    { const [a, b] = [ac[0], ac[1] - ar - 1.6 * u]; for (let q = 0; q < 1; q += 0.03) { const rr = q * 1.1 * u, an = q * TAU * 2; const x = R(a + Math.cos(an) * rr), y = R(b + Math.sin(an) * rr); L.set(x, y, ST[1]); } }

    // ---- topiary towers on the shoulders
    const sw = idle ? sin(t) * 0.5 : run ? sin(t) * 1.2 : w1 ? -0.6 : w2 ? 1.2 : hurt ? -1.5 : 0;
    const Tw = layer(F);
    { // left: three tiered balls and a stone finial
      const b = X(-10.5, top + 0.6);
      const tiers = [[0, 3.2, 3.6], [0.2, 7.6, 2.8], [0.5, 11.2, 2], [0.7, 13.8, 1.1]];
      for (let k = 0; k < tiers.length; k++) {
        const [dx, dy, r] = tiers[k], cx = b[0] + (dx + sw * dy * 0.08) * u, cy = b[1] - dy * u;
        if (k) tube(Tw, [[b[0] + (sw * (dy - 2) * 0.08) * u, cy + (r + 1) * u], [cx, cy]], 0.5 * u, ramp('#5a3628'));
        if (k < 3) { blob(Tw, [[cx, cy, r * u, r * 0.92 * u]], HG, { tex: 14 + k }); leafy(Tw, HG, 17 + k, cx - r * u, cy - r * u, cx + r * u, cy + r * u); }
        else blob(Tw, [[cx, cy, r * u, r * u]], ST);
      }
    }
    { // right: a spiral-clipped cone, the tip bent over
      const b = X(10.5, top + 0.6), h = 13, w0 = 3.8;
      const pts = [];
      for (let k = 0; k <= 10; k++) { const f = k / 10, y = b[1] - f * h * u, w = w0 * (1 - f * 0.92) * u, bend = (f > 0.75 ? (f - 0.75) * 10 : 0) * u + sw * f * f * 1.4 * u; pts.push([b[0] - w + bend, y]); }
      const pts2 = []; for (let k = 10; k >= 0; k--) { const f = k / 10, y = b[1] - f * h * u, w = w0 * (1 - f * 0.92) * u, bend = (f > 0.75 ? (f - 0.75) * 10 : 0) * u + sw * f * f * 1.4 * u; pts2.push([b[0] + w + bend, y]); }
      plate(Tw, [...pts, ...pts2], HG, { wide: true });
      leafy(Tw, HG, 25);
      // the spiral groove
      for (let q = 0.05; q < 0.95; q += 0.004) { const y = b[1] - q * h * u, w = w0 * (1 - q * 0.92) * u, bend = (q > 0.75 ? (q - 0.75) * 10 : 0) * u + sw * q * q * 1.4 * u, x = b[0] + bend + Math.sin(q * TAU * 3.2) * w * 0.95; if (Math.cos(q * TAU * 3.2) > -0.2) { Tw.over(R(x), R(y), HG[1]); Tw.over(R(x), R(y) + 1, HG[0]); } }
    }
    put(L, Tw, true);
    put(F.p, L, false);
    // ---- eyes in the dark of the arch: wide on the wind-up, shut on hurt, they drift and blink
    const look = idle ? sin(t) * 0.5 : run ? 0.4 : 0, eh = hurt ? 0 : w1 ? 1.25 : idle && P.i === 3 ? 0.15 : 1;
    for (const sd of [-1, 1]) {
      const ex = ac[0] + (sd * 1.7 + look) * u, ey = ac[1] + (w1 ? -0.8 : 0.4) * u, r = (sd > 0 ? 0.95 : 0.8) * u;
      if (eh < 0.3) litLine(F, ex - r, ey, ex + r, ey + (sd > 0 ? -1 : 1), G[2]);
      else { litEll(F, ex, ey, r, r * 0.75 * eh, G[2]); litEll(F, ex + 0.15 * u, ey, r * 0.4, r * 0.55 * eh, G[4]); }
      if (w1 || w2) litLine(F, ex - r * 1.2, ey - r * (sd > 0 ? 1.2 : 1.6), ex + r * 1.2, ey - r * (sd > 0 ? 1.6 : 1.2), G[1]);
    }
    // clippings shaken loose
    if (hurt || w2) for (let k = 0; k < 6; k++) { const [a, b] = X(-12 + k * 4.6, top + 2 + (k % 3)); F.p.rect(R(a), R(b - (k % 2) * u), 2, 2, HG[3 + (k % 2)]); }
    if (idle) { const q = t, [a, b] = X(6 + q * 3, top - q * 14); F.p.rect(R(a), R(b), 2, 1, HG[4]); }
    F.mouth = [ac[0], ac[1]];
  },
};

// ================================================================== The Rot Mother
// The nurse log: a colossal fallen tree that would not lie still. She walks hunched on her roots,
// her rotting back a garden of saplings and bracket fungi, her broken stump-top a crown of
// splinters, moss hair hanging over a sorrowing face. In her root-arms she rocks a cradle woven of
// roots, and in it her children glow: fat seed pods that hatch into shamblers.
// a bracket fungus sticking out of bark: lit top surface, banded rim, dark gills under it
function bracket(L, x, y, w, h, Rm) {
  for (let yy = Math.floor(y - h); yy <= y + h; yy++) for (let xx = Math.floor(x - w); xx <= x + w; xx++) {
    const dx = (xx + 0.5 - x) / w, dy = (yy + 0.5 - y) / h;
    if (dx * dx + dy * dy > 1 || dy < -0.35) continue;
    const ring = Math.sqrt(dx * dx + dy * dy);
    let c = dy < -0.05 ? Rm[4] : ring > 0.82 ? Rm[3] : ring > 0.55 ? Rm[2] : Rm[3];
    if (dy > 0.55) c = Rm[1];
    L.set(xx, yy, c);
  }
  return L;
}
const rot_mother = {
  view: 'side', box: [60, 44], pivot: 0.46, scale: 0.75, idle: 6, idleFps: 3.5,
  draw(F, o, P) {
    const { u, ox, oy } = F;
    const t = P.t, idle = P.act === 'idle', run = P.act === 'run', w1 = P.atk === 1, w2 = P.atk === 2, hurt = P.hurt;
    const WD = ['#2a1420', '#3e2a30', '#5a4448', '#73605c', '#8f7c70'].map((c) => C(c)), WDd = dimR(WD, 0.8), WDs = dimR(WD, 0.64), HW = pal5('wood', 5).slice(1).concat([C('#cfa978')]), MOSS = pal5('moss', 5), FUN = pal5('clay', 6), LEAF = pal5('green', 5);
    const G = glowRamp(o.c3 || '#bbf24d');
    const rear = w1 ? 1 : w2 ? -0.6 : hurt ? 0.4 : 0;
    const bob = run ? Math.abs(sin(t)) * -0.8 : idle ? sin(t) * 0.3 : 0;
    // the hunched body pitches up at the front on the wind-up, down into the strike
    const X = (x, y) => [ox + x * u, oy - (y + (y > 4 ? bob + rear * Math.max(0, x + 8) * 0.12 : 0)) * u];
    const pulse = idle ? 0.5 + 0.5 * sin(t * 2) : w1 ? 1 : 0.6;
    const L = layer(F);
    // ---- root legs: knobbly, splayed, with root toes
    const leg = (hx, hy, side, ph, far) => {
      const Lg = layer(F), Rm = far ? WDs : WDd;
      let [dx, lift] = run ? stride(t + ph, 6, 2.4) : [0, 0];
      if (w2) dx += 1.5;
      const hip = X(hx, hy), foot = [ox + (hx + side * 2.5 + dx) * u, oy - (lift + 0.6) * u];
      const knee = [lerp(hip[0], foot[0], 0.5) + side * 2.6 * u, lerp(hip[1], foot[1], 0.45) - 1.2 * u];
      tube(Lg, bez([hip, knee, foot], 12), [3 * u, 1.8 * u], Rm, { tex: 4 });
      blob(Lg, [[knee[0], knee[1] + 0.8 * u, 2.1 * u, 1.8 * u]], Rm, { tex: 4 });
      for (let k = -1; k <= 1; k++) tube(Lg, bez([foot, [foot[0] + (k * 1.4 + 1.2) * u, foot[1] + 0.2 * u], [foot[0] + (k * 2.6 + 2.2) * u, oy - 0.2 * u]], 8), [1 * u, 0.4 * u], Rm);
      put(L, Lg, !far);
    };
    leg(-11, 9, -1, 0.5, true); leg(6, 12, 1, 0, true);
    // ---- far arm reaching round the cradle
    const crad = X(16 + (w1 ? -2 : w2 ? 1.5 : 0) + (idle ? sin(t) * 0.6 : 0), 9 + (w1 ? 2.5 : 0) + (idle ? Math.abs(sin(t)) * 0.5 : 0));
    const fa = layer(F);
    tube(fa, bez([X(5, 20), X(6, 9), [crad[0] - 5 * u, crad[1] + 3.6 * u]], 14), [2 * u, 1.3 * u], WDs, { tex: 4 });
    put(L, fa, true);
    // ---- saplings rising out of her back (behind the hump's rim)
    const sw = idle ? sin(t - 0.2) * 0.5 : run ? sin(t * 2) * 0.8 : w1 ? -1 : w2 ? 1.2 : 0;
    const Sp = layer(F);
    for (const [x, y, h, lean, seed] of [[-10, 24, 11, 0.15, 3], [-2, 28, 8, -0.1, 4]]) {
      const b = X(x, y - 2), tp = [b[0] + (lean * h + sw) * u, b[1] - h * u];
      tube(Sp, bez([b, [b[0] + lean * h * 0.3 * u, b[1] - h * 0.6 * u], tp], 10), [0.8 * u, 0.4 * u], pal5('wood', 5));
      foliage(Sp, tp[0], tp[1] + 1 * u, 3.6 * u, 2.6 * u, 1.9 * u, LEAF, seed);
      foliage(Sp, lerp(b[0], tp[0], 0.6) - 1.6 * u, lerp(b[1], tp[1], 0.6) + 0.6 * u, 2 * u, 1.4 * u, 1.6 * u, LEAF, seed + 10);
    }
    put(L, Sp, true);
    // ---- the log body: a hunched, rotten trunk with fissures, rot holes and moss on top
    const Bd = layer(F);
    blob(Bd, [[...X(-6, 17), 13.5 * u, 9.5 * u], [...X(5, 21), 9 * u, 8.5 * u], [...X(-15, 12), 6 * u, 6.5 * u], [...X(9, 27), 5 * u, 6 * u]], WD, { tex: 4 });
    // broken branch stubs and burls breaking the outline
    for (const [x0, y0, x1, y1, r] of [[-16, 18, -21, 23.5, 1.6], [-3, 25, -4.5, 30.5, 1.3], [3, 15, 6.5, 13, 1.1]]) {
      tube(Bd, [X(x0, y0), X(x1, y1)], [r * u, r * 0.8 * u], WD, { tex: 4 });
      const e = X(x1, y1); Bd.ellipse(e[0], e[1], r * 0.7 * u, r * 0.5 * u, HW[3]); Bd.set(R(e[0]), R(e[1]), HW[1]);
    }
    blob(Bd, [[...X(-18, 9), 2.6 * u, 2.2 * u], [...X(-9, 25), 2.4 * u, 1.8 * u]], WD, { tex: 4 });
    // deep fissures running along the log: a dark groove with a lit lip above it
    for (let k = 0; k < 9; k++) {
      const pts = bez([X(-21, 6 + k * 2.4), X(-7, 11 + k * 2.3), X(6, 13.5 + k * 1.9), X(13, 21 + k * 1.3)], 22);
      grain(Bd, pts, [0], WD[0], 70 + k); grain(Bd, pts, [-1], WD[4], 70 + k);
    }
    // exposed heartwood where the bark has sloughed: pale punky wood with growth rings
    for (const [x, y, rx, ry, sd] of [[-14, 15, 3.4, 2.6, 1], [0, 10, 2.6, 2, 2]]) {
      const [a, b] = X(x, y);
      for (let yy = R(b - ry * u); yy <= b + ry * u; yy++) for (let xx = R(a - rx * u); xx <= a + rx * u; xx++) {
        const d = Math.hypot((xx + 0.5 - a) / (rx * u), (yy + 0.5 - b) / (ry * u)) + (hash2(xx >> 2, yy >> 2, sd) - 0.5) * 0.25;
        if (d > 1 || !Bd.a(xx, yy)) continue;
        Bd.set(xx, yy, d > 0.86 ? WD[1] : (Math.floor(d * 5) % 2 ? HW[2] : HW[3]));
      }
    }
    // rot holes: dark hollows with a pale rim
    for (const [x, y, rx, ry] of [[-7, 13, 1.8, 2.4], [-3, 18, 1.2, 1.6], [4, 19, 1.4, 1]]) { const [a, b] = X(x, y); Bd.ellipse(a, b, rx * u, ry * u, C('#140913')); Bd.ellipse(a - 0.3 * u, b + 0.4 * u, rx * 0.7 * u, ry * 0.7 * u, C('#1d0814')); }
    // moss mantle over the top of the back
    const Ms = layer(F);
    blob(Ms, [[...X(-6, 18.4), 13.2 * u, 9.4 * u], [...X(5, 22.4), 8.6 * u, 8.2 * u]], MOSS, { tex: 6 });
    for (let y = 0; y < Ms.h; y++) for (let x = 0; x < Ms.w; x++) if (Ms.a(x, y)) { const xx = (x - ox) / u; const edge = X(xx, 22 + Math.sin(xx * 0.7) * 1.4 + (xx > 4 ? (xx - 4) * 0.6 : 0))[1]; if (y > edge) Ms.clear(x, y); }
    for (let x = 0; x < Ms.w; x += 2) { const lyy = lowY2(Ms, x); if (lyy > 0 && hash2(x >> 1, 9, 2) > 0.4) { const n = 1 + R(hash2(x, 3, 2) * 3); for (let k = 1; k <= n; k++) Ms.set(x, lyy + k, MOSS[2]); } }
    put(Bd, Ms, false);
    put(L, Bd, true);
    // ---- bracket fungi stacked on her flank and back
    const Fg = layer(F);
    for (const [x, y, w, h] of [[-17.5, 15, 3.2, 1.8], [-16, 18.4, 2.6, 1.5], [-8, 9.5, 2.8, 1.6], [-6.4, 12.4, 2.2, 1.3], [0, 26.4, 2.4, 1.4]]) bracket(Fg, ...X(x, y), w * u, h * u, FUN);
    if (hurt) { const [a, b] = X(-14, 7); bracket(Fg, a, b, 2.2 * u, 1.3 * u, FUN); }
    put(L, Fg, true);
    leg(-7, 8, -1, 0, false);

    // ---- the head: her broken stump-top, splinters for a crown, a face that looks down at the cradle
    const nod = w1 ? -1.4 : w2 ? 1.6 : hurt ? -1.2 : idle ? sin(t) * 0.35 : run ? 0.4 : 0;
    const hc = X(12 + nod * 0.4, 31 - Math.max(0, nod) * 0.6);
    const Hd = layer(F);
    blob(Hd, [[hc[0], hc[1], 4.6 * u, 5.4 * u], [hc[0] + 2.4 * u, hc[1] + 2.2 * u, 2.6 * u, 3.2 * u]], WD, { tex: 4 });
    grain(Hd, [[hc[0] - 3 * u, hc[1] - 4 * u], [hc[0] - 3.4 * u, hc[1] + 4 * u]], [0, 1.6 * u], WD[1], 81);
    // splintered crown: jagged spikes of broken heartwood
    for (const [x, h, a] of [[-3.6, 4, -0.3], [-2, 6.4, -0.1], [-0.4, 4.6, 0.05], [1.2, 7.4, 0.2], [2.8, 4.2, 0.35], [3.8, 2.6, 0.5]]) {
      const b = [hc[0] + x * u, hc[1] - 4.2 * u];
      plate(Hd, [[b[0] - 0.9 * u, b[1] + 0.8 * u], [b[0] + 0.9 * u, b[1] + 0.8 * u], [b[0] + Math.sin(a) * h * u + 0.2 * u, b[1] - h * u]], x < 0 ? WD : WDd);
      Hd.line(b[0], b[1], b[0] + Math.sin(a) * h * u * 0.8, b[1] - h * u * 0.8, C('#e2c494'));
    }
    // the face: hooded brow, deep sockets, a long nose of bark, a mouth that hangs open
    const fx = hc[0] + 1.8 * u, fy = hc[1] + 0.4 * u;
    Hd.ellipse(fx - 0.6 * u, fy - 0.8 * u, 1.5 * u, 1.1 * u, C('#140913'));
    Hd.ellipse(fx + 2.2 * u, fy - 0.6 * u, 1 * u, 0.9 * u, C('#140913'));
    tube(Hd, bez([[fx - 2.6 * u, fy - 2 * u + (w1 ? -0.4 * u : 0)], [fx + 0.6 * u, fy - 1.2 * u], [fx + 3.4 * u, fy - 2 * u]], 10), [1 * u, 0.8 * u], WD, { tex: 4 });
    tube(Hd, bez([[fx + 0.9 * u, fy - 1 * u], [fx + 2 * u, fy + 0.8 * u], [fx + 3.4 * u, fy + 2.2 * u]], 8), [0.9 * u, 0.6 * u], WD);
    const mo = w1 || hurt ? 1.6 : w2 ? 1.2 : 0.7 + (idle ? Math.max(0, sin(t)) * 0.3 : 0);
    Hd.ellipse(fx + 0.6 * u, fy + 3.4 * u, 1.6 * u, mo * u, C('#140913'));
    if (mo > 1) teeth(Hd, [fx - 0.6 * u, fy + 3.4 * u - mo * u * 0.8], [fx + 1.8 * u, fy + 3.4 * u - mo * u * 0.8], 3, 0.8 * u, 1, C('#cfa978'));
    put(L, Hd, true);
    // moss hair hanging from the crown
    const Hr = layer(F), hs = idle ? sin(t + 0.2) * 0.6 : run ? -1 : w1 ? -1.2 : w2 ? 1 : 0;
    // a beard of hanging moss from her jaw and cheek, strands of different lengths
    for (let k = 0; k < 7; k++) {
      const x0 = hc[0] + (-2.6 + k * 0.85) * u, y0 = hc[1] + (2.6 + Math.sin(k * 1.3) * 0.8 + (k > 3 ? 1.6 : 0)) * u, len = (3.4 + ((k * 7) % 4) * 1.3) * u;
      tube(Hr, bez([[x0, y0], [x0 - 0.5 * u + hs * 0.3 * u, y0 + len * 0.5], [x0 - 0.3 * u + hs * u, y0 + len]], 8), [0.65 * u, 0.25 * u], MOSS);
    }
    // and from the back of her skull
    for (let k = 0; k < 4; k++) { const x0 = hc[0] - (3.6 + k * 0.4) * u, y0 = hc[1] - (1.6 - k * 1.2) * u, len = (4 + k) * u; tube(Hr, bez([[x0, y0], [x0 - 1 * u + hs * 0.3 * u, y0 + len * 0.5], [x0 - 0.6 * u + hs * u, y0 + len]], 8), [0.6 * u, 0.25 * u], MOSS); }
    put(L, Hr, true);

    // ---- the cradle: a bowl woven of roots, the glowing seed pods in it
    const Cr = layer(F), cw = 8.4 * u, ch = 4.4 * u;
    for (let y = R(crad[1] - ch); y <= crad[1] + ch; y++) for (let x = R(crad[0] - cw); x <= crad[0] + cw; x++) {
      const dx = (x + 0.5 - crad[0]) / cw, dy = (y + 0.5 - crad[1]) / ch;
      if (dx * dx + dy * dy > 1 || dy < -0.2) continue;
      // weave: alternating root bands
      const band = Math.floor((y - crad[1]) / Math.max(2, 0.8 * u)), wv = Math.floor((x + band * 3) / Math.max(3, 1.4 * u)) & 1;
      Cr.set(x, y, wv ? WD[2] : WD[3]);
    }
    cylLite(Cr, WD);
    put(F.p, L, false);
    // pods inside, peeking over the rim
    for (const [dx, dy, r, ph] of [[-4.6, -1.8, 2, 0], [-1, -3, 2.6, 0.3], [2.8, -2.4, 2.3, 0.6], [5.6, -1.4, 1.6, 0.85]]) {
      const pr = r * u * (0.9 + 0.12 * (idle ? sin(t * 2 + ph) : pulse)), px = crad[0] + dx * u, py = crad[1] + dy * u;
      litEll(F, px, py, pr * 0.85, pr, G[2]);
      litEll(F, px - pr * 0.25, py - pr * 0.3, pr * 0.4, pr * 0.45, G[3]);
      F.p.line(px + pr * 0.15, py - pr * 0.9, px + pr * 0.15, py + pr * 0.5, G[1]);
      if (pulse > 0.75) lit(F, px - pr * 0.3, py - pr * 0.45, G[4]);
    }
    // ---- near arm: carries the cradle from beneath (fingers over the rim), or sweeps on the attack
    const NA = layer(F), nsh = X(8, 21), hold = !(w1 || w2 || hurt);
    let nhd;
    if (w1) nhd = X(4, 38);
    else if (w2) nhd = X(31, 8);
    else if (hurt) nhd = X(15, 16);
    else nhd = [crad[0] + 4.5 * u, crad[1] - 0.8 * u];
    const nel = w1 ? X(3, 30) : w2 ? X(19, 17) : hold ? [crad[0] - 3 * u, crad[1] + 5.2 * u] : [lerp(nsh[0], nhd[0], 0.5) - 1 * u, Math.max(nsh[1], nhd[1]) + 2 * u];
    tube(NA, bez([nsh, [nsh[0] - 1 * u, lerp(nsh[1], nel[1], 0.7)], nel, nhd], 18), [2.6 * u, 1.5 * u], WD, { tex: 4 });
    const na = hold ? -1.3 : Math.atan2(nhd[1] - nel[1], nhd[0] - nel[0]);
    const Fn = layer(F);
    for (let k = 0; k < 4; k++) { const a = na + (k - 1.5) * 0.45, l = (2.6 + (k % 2) * 0.8) * u, curl = hold ? -1.2 : 0.5; tube(Fn, bez([nhd, [nhd[0] + Math.cos(a) * l * 0.6, nhd[1] + Math.sin(a) * l * 0.6], [nhd[0] + Math.cos(a + curl) * l, nhd[1] + Math.sin(a + curl) * l]], 6), [0.85 * u, 0.3 * u], WD); }
    unglow(F, Cr); unglow(F, Fn); unglow(F, NA);
    if (hold) { put(F.p, NA, true); put(F.p, Cr, true); F.p.line(crad[0] - cw, crad[1] - 0.2 * ch, crad[0] + cw, crad[1] - 0.2 * ch, WD[4]); put(F.p, Fn, true); }
    else { put(F.p, Cr, true); F.p.line(crad[0] - cw, crad[1] - 0.2 * ch, crad[0] + cw, crad[1] - 0.2 * ch, WD[4]); put(NA, Fn, false); put(F.p, NA, true); }
    // ---- eyes: soft green glows that flare on the wind-up and squeeze shut when hurt
    const eh = hurt ? 0 : w1 ? 1.3 : idle && P.i === 2 ? 0 : 1;
    if (eh) { litEll(F, fx - 0.5 * u, fy - 0.6 * u, 0.75 * u, 0.6 * u * eh, G[2]); lit(F, fx - 0.3 * u, fy - 0.8 * u, G[4]); litEll(F, fx + 2.2 * u, fy - 0.5 * u, 0.5 * u, 0.45 * u * eh, G[2]); }
    else { litLine(F, fx - 1.4 * u, fy - 0.9 * u, fx + 0.4 * u, fy - 0.4 * u, G[1]); litLine(F, fx + 1.6 * u, fy - 0.4 * u, fx + 2.8 * u, fy - 0.8 * u, G[1]); }
    // spores drifting up from the pods
    if (!hurt) for (let k = 0; k < 4; k++) { const q = (t + k / 4) % 1; lit(F, crad[0] + (k - 1.5) * 2 * u + sin(q + k * 0.3) * u, crad[1] - (2 + q * 9) * u, G[q < 0.5 ? 2 : 1]); }
    if (hurt) for (let k = 0; k < 6; k++) { const [a, b] = X(-16 + k * 4, 6 + (k % 3) * 3); F.p.rect(R(a), R(b), 2, 2, WD[2 + (k % 2)]); }
    F.mouth = [crad[0], crad[1] - 2 * u];
  },
};
// clear the emissive buffer under an opaque layer (a solid part in front of a glow)
function unglow(F, Lr) { const d = Lr.d, e = F.e.d; for (let i = 3; i < d.length; i += 4) if (d[i] > 100) e[i] = 0; }
const lowY2 = (L, x) => { for (let y = L.h - 1; y >= 0; y--) if (L.a(x, y)) return y; return -1; };
// edge shading for a flat-filled layer: dark bottom-right rim, lit top-left rim
function cylLite(L, Rm) {
  const out = [];
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
    if (!L.a(x, y)) continue;
    if (!L.a(x + 1, y) || !L.a(x, y + 1)) out.push(x, y, 1); else if (!L.a(x - 1, y) || !L.a(x, y - 1)) out.push(x, y, 4);
  }
  for (let i = 0; i < out.length; i += 3) L.set(out[i], out[i + 1], Rm[out[i + 2]]);
  return L;
}

// ================================================================== The Briar Matron
// The bramble hag who flies in a mortar. Her mortar is a hollowed stump bound with iron, its roots
// still dangling and groping under it as it floats; she steers with a pestle like a rudder. Her
// hair is the bramble patch itself, streaming behind her in a tangle of thorns and blackberries,
// and the thorns she throws she plucks out of it.
const briar_matron = {
  view: 'side', box: [44, 40], pivot: 0.56, scale: 1.24, idle: 6, idleFps: 4.5, hover: true,
  draw(F, o, P) {
    const { u, ox, oy } = F;
    const t = P.t, idle = P.act === 'idle', run = P.act === 'run', w1 = P.atk === 1, w2 = P.atk === 2, hurt = P.hurt;
    const WOOD = pal5('wood', 5), IRON = pal5('steel', 4), SKIN = ['#3e2a30', '#5a4448', '#8a7476', '#a8948e', '#cdbcae'].map((c) => C(c));
    const SH = pal5('green', 4), CANE = pal5('plum', 4), LEAF = pal5('moss', 4), BERRY = pal5('lavender', 4), KER = pal5('red', 5);
    const G = glowRamp(o.c3 || '#a2f46b');
    const tilt = run ? 0.12 : w1 ? -0.1 : w2 ? 0.14 : hurt ? -0.14 : idle ? sin(t) * 0.04 : 0;
    const fl = idle ? sin(t) * 0.5 : run ? sin(t * 2) * 0.3 : 0;
    // the whole rig rotates about the mortar's middle
    const pc = [ox, oy - (10 + fl) * u];
    const X = (x, y) => { const [a, b] = rot(x * u, -(y - 9) * u, tilt); return [pc[0] + a, pc[1] + b]; };
    const L = layer(F);
    // ---- briar hair streaming behind (farthest back)
    const stream = run ? 1 : w2 ? -0.4 : w1 ? 0.5 : hurt ? 0.8 : 0.3 + (idle ? sin(t + 0.2) * 0.15 : 0);
    const Hr = layer(F);
    const head = X(3.6, 22.6);
    const canes = [];
    // the dark mass of the thicket behind the canes
    { const [a, b] = [head[0] - (7 + stream * 1.5) * u, head[1] + 0.5 * u]; blob(Hr, [[a, b, (7 + stream) * u, 4.6 * u], [a + 3.5 * u, b - 2 * u, 4 * u, 3 * u], [a - 4 * u, b + 2.4 * u, 3.6 * u, 3 * u]], CANE.map((c) => dark(c, 0.7)), { tex: 8 }); }
    for (let k = 0; k < 7; k++) {
      const f = k / 6, len = 11 + (k % 3) * 3 + stream * 3;
      const ang = Math.PI * (0.92 + f * 0.32) + stream * 0.1, wob = idle ? sin(t + k * 0.13) * 1 : run ? sin(t * 2 + k * 0.2) * 0.8 : 0;
      const p0 = [head[0] - 1 * u, head[1] - 1 * u], p3 = [p0[0] + Math.cos(ang) * len * u, p0[1] - Math.sin(ang) * len * u * 0.55 + (f - 0.4) * 9 * u];
      const p1 = [p0[0] + Math.cos(ang) * len * 0.35 * u, p0[1] - (3 + k % 2 * 2) * u + wob * u], p2 = [p0[0] + Math.cos(ang) * len * 0.7 * u, p3[1] - (1.5 + wob) * u];
      const pts = bez([p0, p1, p2, p3], 16);
      canes.push(pts);
      bramble(Hr, pts, (q) => (1.25 - q * 0.75) * u, CANE, 80 + k, CANE[4]);
    }
    // leaves, berries and a few white flowers
    for (let k = 0; k < canes.length; k++) {
      const c = canes[k];
      for (const q of [5, 10]) { const [x, y] = c[q]; if ((k + q) % 3 === 0) { Hr.poly([[x, y], [x + 1.4 * u, y - 0.9 * u], [x + 0.5 * u, y + 0.5 * u]], LEAF[3]); Hr.set(R(x + 0.6 * u), R(y - 0.3 * u), LEAF[1]); } }
      const [bx, by] = c[12 - (k % 3) * 2];
      blob(Hr, [[bx, by + 0.8 * u, 0.85 * u, 0.85 * u]], BERRY); Hr.set(R(bx - 0.3 * u), R(by + 0.4 * u), C(CREAM));
      if (k % 4 === 1) { const [fx, fy] = c[8]; for (let a = 0; a < 5; a++) Hr.set(R(fx + Math.cos(a * 1.26) * 0.8 * u), R(fy + Math.sin(a * 1.26) * 0.8 * u), C(CREAM)); Hr.set(R(fx), R(fy), C('#e8c35a')); }
    }
    put(L, Hr, true);
    // ---- the pestle (behind her body, dipping down behind the mortar like a rudder)
    const Ps = layer(F);
    let pTop, pBot;
    if (w1) { pTop = X(-3, 26); pBot = X(-9, 6); }
    else if (w2) { pTop = X(5, 24); pBot = X(-11, 9); }
    else if (run) { const r = sin(t) * 2; pTop = X(1 + r * 0.3, 25); pBot = X(-10 + r, 3); }
    else { const r = sin(t) * 1; pTop = X(1.5, 25.5); pBot = X(-8.5 + r, 2.6); }
    tube(Ps, [pTop, pBot], (q) => (0.55 + q * 0.75) * u, WOOD, { tex: 5 });
    blob(Ps, [[pBot[0], pBot[1], 1.4 * u, 1.5 * u]], WOOD, { tex: 5 });
    put(L, Ps, true);
    // ---- the hag: hunched torso in a ragged shawl
    const Bd = layer(F);
    blob(Bd, [[...X(0.4, 16.5), 3.6 * u, 4.4 * u], [...X(2, 19.4), 3 * u, 2.6 * u]], SH, { tex: 3 });
    drape(Bd, ...X(0.8, 19), 7 * u, 9.5 * u, 6.2 * u, SH, { ragged: true, seed: 9, teeth: 5, wave: 0.6 * u, phase: t, lean: (stream * 1.4 + 0.5) * u, folds: 2 });
    put(L, Bd, true);
    // ---- the mortar: a hollow stump bound in two iron hoops, its roots dangling and groping
    const Mo = layer(F);
    for (let k = 0; k < 5; k++) {
      const x = -3.4 + k * 1.7, wig = idle ? sin(t + k * 0.21) * 0.9 : run ? -1.6 - k * 0.2 : w2 ? 1 : 0;
      tube(Mo, bez([X(x, 4.2), X(x + wig * 0.5, 1.8), X(x * 1.3 - 0.6 + wig, -0.6 - (k % 2) * 1.2)], 10), [0.85 * u, 0.25 * u], WOOD.map((c) => dark(c, 0.85)));
    }
    // a mortar's goblet shape: a deep bowl on a waist and a flared foot
    const bowl = [];
    for (let k = 0; k <= 10; k++) { const f = k / 10; bowl.push(X(6.2 - Math.sin(f * Math.PI / 2) ** 1.4 * 3.4, 14 - f * 6.6)); }
    bowl.push(X(2.4, 6.6), X(4.4, 4.6), X(4.6, 3.6), X(-4.6, 3.6), X(-4.4, 4.6), X(-2.4, 6.6));
    for (let k = 10; k >= 0; k--) { const f = k / 10; bowl.push(X(-6.2 + Math.sin(f * Math.PI / 2) ** 1.4 * 3.4, 14 - f * 6.6)); }
    plate(Mo, bowl, WOOD, { wide: true });
    // carved grooves and a knot
    for (let k = -2; k <= 2; k++) grain(Mo, [X(k * 2.2, 13.4), X(k * 1, 7.6)], [0], WOOD[1], 90 + k);
    { const [a, b] = X(1.6, 8.4); Mo.ellipse(a, b, 0.9 * u, 0.7 * u, WOOD[0]); Mo.ellipse(a - 0.2 * u, b - 0.2 * u, 0.5 * u, 0.35 * u, WOOD[1]); }
    // iron hoops with rivets
    for (const [y0, w0, w1x] of [[12.2, 6.1, 5.6], [7.4, 3.1, 2.8]]) {
      plate(Mo, [X(-w0, y0 + 0.6), X(w0, y0 + 0.6), X(w1x, y0 - 0.6), X(-w1x, y0 - 0.6)], IRON);
      for (let k = -2; k <= 2; k++) { const [a, b] = X(k * w0 * 0.38, y0); Mo.set(R(a), R(b), IRON[4]); }
    }
    // the rim: a lit lip and the dark hollow she sits in
    plate(Mo, [X(-6.3, 14.9), X(6.3, 14.9), X(6, 13.6), X(-6, 13.6)], WOOD);
    put(L, Mo, true);
    // ---- arms
    const Ar = layer(F);
    // near arm on the pestle
    const sh = X(1.4, 19.6), grip = [lerp(pTop[0], pBot[0], 0.18), lerp(pTop[1], pBot[1], 0.18)];
    tube(Ar, [sh, [lerp(sh[0], grip[0], 0.5) - 0.6 * u, lerp(sh[1], grip[1], 0.5) + 1 * u], grip], [0.75 * u, 0.6 * u], SKIN);
    blob(Ar, [[grip[0], grip[1], 0.9 * u, 0.8 * u]], SKIN);
    put(L, Ar, true);
    put(F.p, L, false);
    // ---- the head: hooked nose and chin, one great eye, iron teeth, briars springing from the scalp
    const Hd = layer(F);
    const hx = head[0], hy = head[1];
    const cack = w1 || w2 || hurt ? 1 : idle ? [0, 0.6, 0, 0.6, 0, 0][P.i] : 0.3;
    blob(Hd, [[hx, hy, 3 * u, 3.2 * u], [hx + 1.6 * u, hy + 1.4 * u, 1.8 * u, 1.6 * u]], SKIN);
    // nose: long and hooked down
    tube(Hd, bez([[hx + 2.4 * u, hy - 0.8 * u], [hx + 5.4 * u, hy - 0.2 * u], [hx + 5 * u, hy + 2.2 * u]], 10), (q) => (0.85 - q * 0.55) * u, SKIN);
    Hd.set(R(hx + 4.4 * u), R(hy + 0.4 * u), C('#5a4448'));
    blob(Hd, [[hx + 3.4 * u, hy + 0.8 * u, 0.4 * u, 0.4 * u]], SKIN);
    // chin curling up to meet it
    tube(Hd, bez([[hx + 1.2 * u, hy + 2.6 * u + cack * 0.8 * u], [hx + 3.4 * u, hy + 4 * u + cack * 0.8 * u], [hx + 4 * u, hy + 2.8 * u + cack * 0.6 * u]], 8), [0.9 * u, 0.5 * u], SKIN);
    // mouth: a dark gap with iron teeth
    const mh = (0.4 + cack * 0.9) * u;
    Hd.ellipse(hx + 2.4 * u, hy + 2.1 * u + mh * 0.3, 1.3 * u, mh * 0.6, C('#140913'));
    for (let k = 0; k < 3; k++) Hd.rect(R(hx + (1.6 + k * 0.7) * u), R(hy + 1.6 * u), Math.max(1, R(0.4 * u)), Math.max(2, R(0.6 * u)), IRON[k === 1 ? 4 : 3]);
    // wrinkles, warts, an ear
    Hd.line(hx + 0.4 * u, hy + 0.2 * u, hx + 1.4 * u, hy + 0.9 * u, SKIN[1]);
    blob(Hd, [[hx + 1.2 * u, hy - 2.2 * u, 0.4 * u, 0.4 * u]], SKIN);
    blob(Hd, [[hx - 1.4 * u, hy + 0.4 * u, 0.8 * u, 1.1 * u]], SKIN);
    // the great eye socket, and a squinting little one
    Hd.ellipse(hx + 1.6 * u, hy - 0.9 * u, 1.3 * u, 1.2 * u, C('#140913'));
    // a red folk kerchief over the scalp, knotted under the chin, briars bursting out of it
    const Kc = layer(F);
    plate(Kc, [[hx - 3.4 * u, hy + 1.4 * u], [hx - 2.6 * u, hy - 2.6 * u], [hx - 0.4 * u, hy - 3.8 * u], [hx + 2.2 * u, hy - 3.2 * u], [hx + 3.1 * u, hy - 1.8 * u], [hx + 1.8 * u, hy - 2 * u], [hx - 0.6 * u, hy - 1.2 * u], [hx - 1.6 * u, hy + 1.2 * u], [hx - 0.6 * u, hy + 3.4 * u], [hx - 2.2 * u, hy + 3.8 * u]], KER, { wide: true });
    for (let k = 0; k < 6; k++) { const a = hx + (-2.6 + (k % 3) * 1.6) * u, b = hy + (-2.4 + Math.floor(k / 3) * 1.8) * u; Kc.over(R(a), R(b), CREAM); Kc.over(R(a) + 1, R(b), CREAM); }
    // the knot and its flapping ends
    const flap = idle ? sin(t + 0.4) * 0.5 : run ? -1 : 0;
    plate(Kc, [[hx - 1.4 * u, hy + 3.2 * u], [hx - 0.2 * u, hy + 3.4 * u], [hx - 2.4 * u + flap * u, hy + 5.6 * u], [hx - 3.2 * u + flap * u, hy + 5 * u]], KER);
    put(Hd, Kc, true);
    for (let k = 0; k < 3; k++) bramble(Hd, bez([[hx - 1.6 * u + k * 1.1 * u, hy - 3 * u], [hx + (-1.8 + k * 1.2) * u, hy - (5 + k % 2) * u], [hx + (-3 + k * 1.6) * u, hy - (5.4 + (k % 2) * 1.8) * u]], 8), [0.8 * u, 0.35 * u], CANE, 95 + k, CANE[4]);
    put(F.p, Hd, true);
    const eo = hurt ? 0 : w1 ? 1.25 : 1;
    if (eo) { litEll(F, hx + 1.7 * u, hy - 0.9 * u, 0.9 * u, 0.85 * u * eo, G[2]); F.p.rect(R(hx + 1.9 * u), R(hy - 1.5 * u), 1, Math.max(2, R(1.1 * u * eo)), C('#140913')); lit(F, hx + 1.3 * u, hy - 1.3 * u, G[4]); }
    else litLine(F, hx + 0.6 * u, hy - 1.2 * u, hx + 2.6 * u, hy - 0.6 * u, G[1]);
    // ---- far arm: plucks a thorn from her hair, then flings it
    const FA = layer(F), fsh = X(-0.4, 19.8);
    const fh = w1 ? X(-4.5, 24) : w2 ? X(10.5, 20.5) : hurt ? X(-2, 15) : run ? X(5.5, 16) : X(5 + sin(t) * 0.4, 17.4 + sin(t * 2) * 0.4);
    tube(FA, [fsh, [lerp(fsh[0], fh[0], 0.5), lerp(fsh[1], fh[1], 0.5) + 1 * u], fh], [0.75 * u, 0.55 * u], SKIN);
    const fa = Math.atan2(fh[1] - fsh[1], fh[0] - fsh[0]);
    for (let k = 0; k < 4; k++) { const a = fa + (k - 1.5) * 0.4; FA.line(fh[0], fh[1], fh[0] + Math.cos(a) * 1.8 * u, fh[1] + Math.sin(a) * 1.8 * u + 0.4 * u, SKIN[2]); FA.set(R(fh[0] + Math.cos(a) * 1.8 * u), R(fh[1] + Math.sin(a) * 1.8 * u + 0.4 * u), SKIN[4]); }
    blob(FA, [[fh[0], fh[1], 0.85 * u, 0.75 * u]], SKIN);
    put(F.p, FA, true);
    // the thorn: glowing in her fingers on the wind-up and flying off on the throw
    if (w1) { horn(F.p, [fh[0], fh[1] - 0.6 * u], [fh[0] + 0.6 * u, fh[1] - 2 * u], [fh[0] + 0.2 * u, fh[1] - 3.6 * u], 1 * u, G); F.e.disc(fh[0] + 0.2 * u, fh[1] - 2.2 * u, 0.8 * u, G[2]); }
    if (w2) for (let k = 0; k < 3; k++) { const x0 = fh[0] + (2 + k * 2.2) * u, y0 = fh[1] + (k - 1) * 1.2 * u; litLine(F, x0, y0, x0 + 2.2 * u, y0 - 0.2 * u, G[k === 1 ? 3 : 2]); lit(F, x0 + 2.4 * u, y0 - 0.2 * u, G[4]); }
    // leaves and petals shed in her wake
    if (run || idle) for (let k = 0; k < 2; k++) { const q = (t + k * 0.5) % 1, [a, b] = X(-10 - q * 6, 6 + k * 6 - q * 2); F.p.rect(R(a), R(b), 3, 2, LEAF[3]); F.p.set(R(a), R(b), LEAF[4]); F.p.set(R(a) + 2, R(b) + 1, LEAF[1]); }
    F.mouth = w2 ? [fh[0] + 1 * u, fh[1]] : [fh[0], fh[1] - 1 * u];
  },
};

// ================================================================== King Vael the Frozen
// The king who would not rise from his throne, and now cannot: his legs are frozen into the seat,
// the throne floats on its own cold, and his royal cape pours off his shoulders and turns to a
// glacier that drags behind him across the ground. Behind his head the throne's back is a fan of
// ice shards that flares when he strikes; his crown is a ring of icicles.
const king_vael = {
  view: 'side', box: [46, 46], pivot: 0.56, scale: 1.05, idle: 6, idleFps: 4,
  draw(F, o, P) {
    const { u, ox, oy } = F;
    const t = P.t, idle = P.act === 'idle', run = P.act === 'run', w1 = P.atk === 1, w2 = P.atk === 2, hurt = P.hurt;
    const ICE = pal5('frost', 5), ICEd = dimR(ICE, 0.78), DEEP = pal5('frost', 4), ARM = pal5('steel', 6), SKIN = ['#3e4a5a', '#6e7a9a', '#96a2bc', '#b8c4d8', '#dfe8f2'].map((c) => C(c)), ROY = pal5('blue', 5), GOLD = pal5('gold', 5);
    const G = glowRamp(o.c3 || '#89d5f6');
    const fl = idle ? sin(t) * 0.45 : run ? sin(t * 2) * 0.3 : 0;
    const tilt = run ? 0.08 : w1 ? -0.08 : w2 ? 0.1 : hurt ? -0.1 : 0;
    const pv = [ox, oy - (10 + fl) * u];
    const X = (x, y) => { const [a, b] = rot(x * u, -(y - 10) * u, tilt); return [pv[0] + a, pv[1] + b - fl * 0]; };
    const flare = w1 ? 1 : w2 ? 0.7 : idle ? 0.15 + 0.15 * sin(t) : 0.1;
    const L = layer(F);
    // ---- the glacier train: the cape's hem frozen into a dragging wedge of ice on the ground
    const Gl = layer(F), drag = run ? 1 : 0;
    const g0 = X(-3.6, 24), g1 = X(-6.4, 16);
    const gl = [g0, X(-0.8, 22), X(-2, 13), [ox - (4 + drag) * u, oy - 0.2 * u], [ox - (19 + drag * 2) * u, oy - 0.2 * u], [ox - (17.5 + drag) * u, oy - 3 * u], [ox - 13 * u, oy - 7.4 * u], g1];
    plate(Gl, gl, DEEP, { wide: true });
    // facets: big flat planes catching the light differently
    facet(Gl, [g1, [ox - 13 * u, oy - 7.4 * u], [ox - 10 * u, oy - 3 * u], X(-4.4, 12)], DEEP[3]);
    facet(Gl, [[ox - 13 * u, oy - 7.4 * u], [ox - 17.5 * u, oy - 3 * u], [ox - 12 * u, oy - 1.4 * u]], DEEP[4]);
    facet(Gl, [X(-4.4, 12), [ox - 10 * u, oy - 3 * u], [ox - 5 * u, oy - 0.6 * u]], DEEP[1]);
    // crevasses and a sword frozen inside, hilt up
    crack(Gl, ox - 9 * u, oy - 5 * u, 2.2, 6 * u, ICE[0], 5);
    crack(Gl, ox - 14 * u, oy - 3.6 * u, 1.2, 4 * u, ICE[0], 6);
    { const a = ox - 7.6 * u, b = oy - 6.4 * u; Gl.line(a, b, a + 1.6 * u, b + 4 * u, ARM[1]); Gl.line(a - 0.8 * u, b + 0.6 * u, a + 0.9 * u, b, ARM[2]); }
    for (let x = R(ox - 18 * u); x < ox - 4 * u; x += 3) { const y = R(oy - 0.6 * u); Gl.over(x, y, ICE[4]); }
    put(L, Gl, true);
    // ---- the throne's back: a fan of ice shards behind his head
    const Bk = layer(F), bc = X(-3, 14);
    const shards = [[-2.35, 21], [-2.05, 26], [-1.75, 29], [-1.5, 25], [-1.25, 20], [-1.02, 14]];
    for (const [a, l] of shards) shard(Bk, bc[0], bc[1], a - tilt, (l + flare * 3) * u, 2.1 * u, ICE);
    put(L, Bk, true);
    // a glint travels along the shards while he waits
    if (idle) { const [a, l] = shards[P.i % shards.length], len = (l + flare * 3) * u; litDisc(F, bc[0] + Math.cos(a - tilt) * len * 0.7, bc[1] + Math.sin(a - tilt) * len * 0.7, 0.55 * u, G[3]); lit(F, bc[0] + Math.cos(a - tilt) * len * 0.7, bc[1] + Math.sin(a - tilt) * len * 0.7, G[4]); }
    if (flare > 0.4) for (const [a, l] of shards) { const len = (l + flare * 3) * u; litDisc(F, bc[0] + Math.cos(a - tilt) * len * 0.85, bc[1] + Math.sin(a - tilt) * len * 0.85, 0.7 * u, G[3]); }
    // ---- the throne: a block of ice with carved arms, icicles hanging under it
    const Th = layer(F);
    for (let k = 0; k < 6; k++) { const x = -4.4 + k * 1.9, len = 3 + (k % 3) * 1.6 + (idle ? (P.i + k) % 6 === 0 ? 0.6 : 0 : 0); horn(Th, X(x, 6.4), X(x + 0.2, 6.4 - len * 0.5), X(x + 0.4, 6.4 - len), 1.4 * u, ICEd); }
    plate(Th, [X(-5.6, 14), X(-4.4, 15.2), X(5.2, 14.6), X(5.8, 13), X(5.4, 6.4), X(-5, 6.4)], DEEP, { wide: true });
    // fluted front: ice columns, a heavy lip
    for (let k = 0; k < 4; k++) { const x = -3.4 + k * 2.2; plate(Th, [X(x - 0.8, 12.6), X(x + 0.8, 12.6), X(x + 0.8, 7.2), X(x - 0.8, 7.2)], k % 2 ? DEEP : ICEd); }
    plate(Th, [X(-5.4, 14.4), X(5.6, 14), X(5.6, 12.8), X(-5.4, 13.2)], ICE);
    put(L, Th, true);
    // ---- far arm first: the hand frozen to the throne's armrest
    const FA = layer(F);
    tube(FA, [X(-0.8, 24.6), X(-2.8, 19.4), X(-3.6, 16)], [1.4 * u, 1.1 * u], dimR(ARM, 0.72));
    blob(FA, [[...X(-3.8, 15.4), 1.7 * u, 1.2 * u]], ICEd);
    put(L, FA, true);
    // ---- the king: legs frozen into the seat, an armoured torso, his cape running back into the glacier
    const K = layer(F);
    // cape over the shoulders, falling behind the throne into the glacier
    const Cp = layer(F);
    drape(Cp, ...X(-2.4, 25.6), 6.4 * u, 10 * u, 12.5 * u, ROY, { lean: 3.6 * u, folds: 2, teeth: 3, wave: 0.6 * u });
    // the hem freezes: frost creeps up the cloth in a ragged front, then it is ice
    for (let y = 0; y < Cp.h; y++) for (let x = 0; x < Cp.w; x++) {
      if (!Cp.a(x, y)) continue;
      const hy = (pv[1] - y) / u + 10, front = 18.4 + Math.sin(x * 0.45) * 0.8 + (hash2(x >> 2, 1, 3) - 0.5) * 1.2;
      if (hy < front - 1.6) { const c = Cp.get(x, y); const k = c[0] + c[1] + c[2] > 300 ? 4 : c[0] + c[1] + c[2] > 200 ? 3 : 2; Cp.set(x, y, ICE[k]); }
      else if (hy < front) Cp.set(x, y, ICE[4]);
    }
    put(K, Cp, true);
    // plated thighs on the seat, boots sunk in a crust of ice
    tube(K, [X(-1.6, 16.2), X(4.6, 16)], [2.2 * u, 2 * u], ARM);
    tube(K, [X(4.8, 15.4), X(5.4, 9.4)], [1.6 * u, 1.4 * u], ARM);
    plate(K, [X(3.2, 14.2), X(6.6, 13.6), X(7.4, 10.4), X(6.8, 7.4), X(3.6, 7.2), X(3, 10.8)], ICE.map((c) => [...c.slice(0, 3), 255]), { wide: true });
    facet(K, [X(3.6, 13.4), X(6.2, 12.8), X(6.6, 10.6), X(4.6, 10.8)], ICE[4]);
    facet(K, [X(4.4, 10.2), X(6.6, 9.8), X(6.2, 7.8), X(4.2, 8)], ICE[2]);
    // torso: a broad breastplate, frost-white tabard, gold belt
    blob(K, [[...X(0.6, 21), 4 * u, 5.4 * u], [...X(1.6, 24), 3.6 * u, 2.4 * u]], ARM);
    plate(K, [X(-0.4, 24.4), X(3.2, 24), X(3.4, 17), X(0, 17.2)], pal5('frost', 5).map((c) => light(c, 1.05)));
    plate(K, [X(-3, 17.8), X(4.2, 17.6), X(4.2, 16.4), X(-3, 16.6)], GOLD);
    put(L, K, true);
    // ---- the head: gaunt, blue-grey, a long frost beard, a crown of icicles
    const nod = w1 ? -0.6 : w2 ? 0.8 : hurt ? -0.8 : idle ? sin(t) * 0.15 : 0;
    let HC, HU;
    const v = u; { const u = v * 1.22;
    const hc = X(2 + nod * 0.4, 29.6 + (w1 ? 0.4 : 0));
    const Hd = layer(F);
    blob(Hd, [[hc[0], hc[1], 2.5 * u, 2.9 * u], [hc[0] + 1.4 * u, hc[1] + 0.8 * u, 1.4 * u, 1.7 * u]], SKIN);
    // sunken cheek, hard brow, a thin cruel mouth
    Hd.line(hc[0] + 0.4 * u, hc[1] + 1.2 * u, hc[0] + 1.4 * u, hc[1] + 2 * u, SKIN[1]);
    Hd.ellipse(hc[0] + 1.3 * u, hc[1] - 0.2 * u, 0.9 * u, 0.7 * u, C('#140f1c'));
    tube(Hd, [[hc[0] - 0.2 * u, hc[1] - 1.2 * u], [hc[0] + 2.8 * u, hc[1] - 0.8 * u]], [0.6 * u, 0.45 * u], SKIN);
    tube(Hd, [[hc[0] + 2.4 * u, hc[1] - 0.6 * u], [hc[0] + 3.2 * u, hc[1] + 1 * u]], [0.5 * u, 0.4 * u], SKIN);
    // frost beard: icy strands down over the chest
    const bs = idle ? sin(t + 0.3) * 0.25 : run ? -0.6 : 0;
    for (let k = 0; k < 5; k++) { const x0 = hc[0] + (0.2 + k * 0.6) * u, y0 = hc[1] + 2 * u; horn(Hd, [x0, y0], [x0 + (bs - 0.2) * u, y0 + (2 + k % 2) * u], [x0 + (bs - 0.6 + k * 0.1) * u, y0 + (4 + (k % 3) * 1.2) * u], 1 * u, ICE); }
    Hd.line(hc[0] + 1.6 * u, hc[1] + 2 * u, hc[0] + 2.8 * u, hc[1] + 1.8 * u, C('#140f1c'));
    // crown: a gold circlet ringed with icicles, upward spikes and drips below
    const cr = hc[1] - 2.2 * u;
    plate(Hd, [[hc[0] - 2.4 * u, cr + 0.6 * u], [hc[0] + 2.6 * u, cr + 0.2 * u], [hc[0] + 2.6 * u, cr - 0.8 * u], [hc[0] - 2.4 * u, cr - 0.4 * u]], GOLD);
    const snap = hurt ? 2 : -1;
    for (let k = 0; k < 6; k++) { if (k === snap) continue; const x = hc[0] + (-2 + k * 0.9) * u, h = (2.4 + ((k * 5) % 3) * 1.2 + (k === 3 ? 1.4 : 0)) * u; shard(Hd, x, cr - 0.4 * u, -Math.PI / 2 + (k - 2.5) * 0.08, h, 0.65 * u, ICE); }
    for (let k = 0; k < 3; k++) horn(Hd, [hc[0] + (-1.6 + k * 1.6) * u, cr + 0.6 * u], [hc[0] + (-1.6 + k * 1.6) * u, cr + 1.2 * u], [hc[0] + (-1.5 + k * 1.6) * u, cr + (1.8 + k % 2) * u], 0.6 * u, ICE);
    if (hurt) crack(Hd, hc[0] - 0.6 * u, hc[1] - 1.6 * u, 1.2, 3 * u, ICE[4], 8);
    put(L, Hd, true);
    HC = hc; HU = u;
    }
    // pauldrons with icicles, over the beard's edge
    const Pd = layer(F);
    blob(Pd, [[...X(0.2, 25.4), 3 * u, 2 * u]], ARM);
    for (let k = 0; k < 3; k++) horn(Pd, X(-2 + k * 1.6, 24), X(-1.9 + k * 1.6, 22.8), X(-1.8 + k * 1.6, 21.4 - (k % 2)), 0.8 * u, ICE);
    put(L, Pd, true);
    // ---- near arm and the frozen greatsword
    const W = layer(F), sh = X(1.8, 24.4), hc = HC;
    let hilt, tip;
    if (w1) { hilt = X(-1, 34.5); tip = X(-12, 42); }
    else if (w2) { hilt = X(9.5, 18); tip = X(25, 5); }
    else if (hurt) { hilt = X(5.6, 17); tip = X(7, 1); }
    else if (run) { hilt = X(6, 18.5); tip = X(16, 30); }
    else { const s2 = idle ? sin(t) * 0.2 : 0; hilt = X(7.2, 18 + s2); tip = X(8.6, 37 + s2); }
    const da = Math.atan2(tip[1] - hilt[1], tip[0] - hilt[0]), dl = Math.hypot(tip[0] - hilt[0], tip[1] - hilt[1]);
    const Q = (f, w) => [hilt[0] + Math.cos(da) * dl * f - Math.sin(da) * w * u, hilt[1] + Math.sin(da) * dl * f + Math.cos(da) * w * u];
    // the blade: frost-crusted steel with a ridge of ice crystals along its back
    plate(W, [Q(0.08, 0.85), Q(0.92, 0.6), Q(1, 0), Q(0.92, -0.6), Q(0.08, -0.85)], ICE, { wide: true });
    W.line(...Q(0.1, 0), ...Q(0.9, 0), ICE[4]);
    for (let k = 0; k < 4; k++) shard(W, ...Q(0.25 + k * 0.17, -0.7), da - Math.PI / 2 - 0.4, (1.4 + (k % 2) * 0.8) * u, 0.45 * u, ICE);
    plate(W, [Q(0.06, 1.8), Q(0.1, 1.8), Q(0.1, -1.8), Q(0.06, -1.8)], GOLD);
    tube(W, [Q(-0.12, 0), Q(0.06, 0)], 0.45 * u, ROY);
    blob(W, [[...Q(-0.14, 0), 0.6 * u, 0.6 * u]], GOLD);
    tube(W, [sh, [lerp(sh[0], hilt[0], 0.5) + 0.4 * u, lerp(sh[1], hilt[1], 0.5) + 0.8 * u], hilt], [1.45 * u, 1.15 * u], ARM);
    blob(W, [[hilt[0], hilt[1], 1.25 * u, 1.1 * u]], ARM);
    put(L, W, true);
    put(F.p, L, false);
    // ---- eyes and breath
    const eh = hurt ? 0 : w1 ? 1.3 : 1;
    { const u = HU;
    if (eh) { litEll(F, hc[0] + 1.4 * u, hc[1] - 0.2 * u, 0.6 * u, 0.45 * u * eh, G[3]); lit(F, hc[0] + 1.6 * u, hc[1] - 0.3 * u, G[4]); }
    else litLine(F, hc[0] + 0.7 * u, hc[1] - 0.4 * u, hc[0] + 2 * u, hc[1], G[2]); }
    if (idle) { const q = t; for (let k = 0; k < 3; k++) { const x = hc[0] + (3.4 + q * 3 + k * 0.6) * u, y = hc[1] + (1.4 - q * 1.6 - k * 0.3) * u; if (bayer2(R(x), R(y)) < 0.5) F.p.rect(R(x), R(y), 2, 2, [...ICE[4].slice(0, 3), 150]); } }
    // the strike: a trail of frost shards
    if (w2) for (let k = 0; k < 4; k++) { const [a, b] = Q(0.4 + k * 0.17, -2.2 - k * 0.5); litLine(F, a, b, a - Math.cos(da) * 2.4 * u, b - Math.sin(da) * 2.4 * u, G[k % 2 ? 2 : 3]); }
    // ice chips scraped off the glacier as he drags it
    if (run) for (let k = 0; k < 3; k++) { const q = (t + k / 3) % 1; F.p.rect(R(ox - (19 + q * 4) * u), R(oy - (0.6 + Math.sin(q * Math.PI) * 2) * u), 2, 2, ICE[3]); }
    F.mouth = [hc[0] + 2.4 * u, hc[1] + 1 * u];
  },
};

// ================================================================== The Last King Under Snow
// The last dwarf-king of the deep halls, dead and still at his work. His beard has become a frozen
// waterfall that pours from his chin to the ground and pools in ice around his boots; on his back
// he carries his anvil over a forge that has never gone out, and his rune hammer still burns.
const last_king = {
  view: 'side', box: [40, 38], pivot: 0.5, scale: 1.52, idle: 6, idleFps: 4,
  draw(F, o, P) {
    const { u, ox, oy } = F;
    const t = P.t, idle = P.act === 'idle', run = P.act === 'run', w1 = P.atk === 1, w2 = P.atk === 2, hurt = P.hurt;
    const IRON = pal5('steel', 4), RUST = pal5('clay', 4), GOLD = pal5('gold', 5), ICE = pal5('frost', 5), ANV = ramp('#3a4048');
    const SKIN = ['#2a1838', '#4a3a50', '#6a5a6e', '#8c7c8a', '#b0a2aa'].map((c) => C(c)), HAFT = pal5('wood', 5);
    const EMB = PAL_EMBER(), G = glowRamp(o.c3 || '#f2a04d');
    const lean = w1 ? -0.14 : w2 ? 0.2 : hurt ? -0.12 : run ? 0.06 : 0;
    const bob = run ? -Math.abs(sin(t)) * 0.7 : idle ? sin(t) * 0.2 : w1 ? 0.5 : w2 ? -1.2 : 0;
    const X = (x, y) => [ox + (x + lean * Math.max(0, y - 3)) * u, oy - (y + (y > 3 ? bob : 0)) * u];
    const L = layer(F);
    // ---- legs: short and armoured, a heavy stomp
    const leg = (side, far) => {
      const Lg = layer(F), Rm = far ? dimR(IRON, 0.75) : IRON;
      let [dx, lift] = run ? stride(t + (far ? 0.5 : 0), 4.4, 1.6) : [0, 0];
      if (w2) dx += side > 0 ? 1.6 : -1;
      const hip = X(side * 1.4, 7.2), ft = [ox + (side * 2 + dx) * u, oy - lift * u];
      tube(Lg, [hip, [lerp(hip[0], ft[0], 0.5) + 0.6 * u, lerp(hip[1], ft[1], 0.5)], [ft[0], ft[1] - 1.6 * u]], [2 * u, 1.7 * u], Rm);
      plate(Lg, [[ft[0] - 2 * u, ft[1]], [ft[0] + 2.8 * u, ft[1]], [ft[0] + 2.4 * u, ft[1] - 1.4 * u], [ft[0] + 0.8 * u, ft[1] - 2.4 * u], [ft[0] - 1.8 * u, ft[1] - 2.2 * u]], Rm);
      put(L, Lg, !far);
    };
    leg(-1, true);
    // ---- the anvil on his back over its forge
    const Av = layer(F), ab = X(-6.2, 15.6);
    // the forge box and its coals
    plate(Av, [[ab[0] - 3 * u, ab[1] + 1 * u], [ab[0] + 2.4 * u, ab[1] + 1 * u], [ab[0] + 2 * u, ab[1] + 5.4 * u], [ab[0] - 2.6 * u, ab[1] + 5.4 * u]], RUST, { wide: true });
    // anvil: face, horn, waist and foot
    plate(Av, [[ab[0] - 3.6 * u, ab[1] - 0.6 * u], [ab[0] + 2.8 * u, ab[1] - 0.6 * u], [ab[0] + 2.6 * u, ab[1] + 1.4 * u], [ab[0] - 3.4 * u, ab[1] + 1.4 * u]], ANV);
    horn(Av, [ab[0] - 3.2 * u, ab[1] + 0.2 * u], [ab[0] - 5.4 * u, ab[1] + 0.4 * u], [ab[0] - 6.6 * u, ab[1] - 0.8 * u], 1.8 * u, ANV);
    plate(Av, [[ab[0] - 1.4 * u, ab[1] - 0.6 * u], [ab[0] + 1.2 * u, ab[1] - 0.6 * u], [ab[0] + 0.8 * u, ab[1] - 2.8 * u], [ab[0] - 1 * u, ab[1] - 2.8 * u]], ANV);
    plate(Av, [[ab[0] - 2.6 * u, ab[1] - 2.6 * u], [ab[0] + 2.2 * u, ab[1] - 2.6 * u], [ab[0] + 2.6 * u, ab[1] - 3.8 * u], [ab[0] - 3 * u, ab[1] - 3.8 * u]], ANV);
    // strap
    Av.line(ab[0] + 2.6 * u, ab[1] - 1.6 * u, ab[0] + 5.4 * u, ab[1] + 3 * u, RUST[1]);
    put(L, Av, true);
    // glowing mouth of the forge
    const coal = idle ? 0.5 + 0.5 * sin(t * 2) : w1 ? 1 : 0.6;
    litEll(F, ab[0] - 0.3 * u, ab[1] + 3.6 * u, 1.8 * u, 0.9 * u, EMB[2]);
    litEll(F, ab[0] - 0.4 * u, ab[1] + 3.4 * u, 1.1 * u, 0.5 * u, EMB[coal > 0.7 ? 4 : 3]);
    // ---- the body: barrel chest in rusted plate, huge pauldrons
    const Bd = layer(F);
    blob(Bd, [[...X(0, 11.6), 5 * u, 5.2 * u], [...X(0.6, 8), 4.4 * u, 2.4 * u]], IRON);
    // overlapping plate bands, rust bleeding along their lower edges
    for (let k = 0; k < 3; k++) { const y = 10 + k * 2.2; for (let x = -5; x <= 5.4; x += 0.25) { const [a, b] = X(x, y + Math.sin(x * 0.3) * 0.3); Bd.over(R(a), R(b), IRON[1]); Bd.over(R(a), R(b) - 1, IRON[4]); if (hash2(R(x * 2), k, 9) > 0.55) { Bd.over(R(a), R(b) + 1, RUST[2]); if (hash2(R(x * 2), k, 8) > 0.6) Bd.over(R(a), R(b) + 2, RUST[1]); } } }
    for (let k = 0; k < 4; k++) { const [a, b] = X(-3 + k * 2.4, 12.2); Bd.over(R(a), R(b), GOLD[3]); }
    // gold belt and buckle
    plate(Bd, [X(-4.6, 8.6), X(5.2, 8.8), X(5, 7.2), X(-4.4, 7)], GOLD);
    plate(Bd, [X(2.6, 9.2), X(4.8, 9.2), X(4.8, 6.8), X(2.6, 6.8)], GOLD, { wide: true });
    put(L, Bd, true);
    leg(1, false);
    // ---- the head: grey dead face, a great nose, an iron crown-helm
    const nod = w1 ? -0.6 : w2 ? 1 : hurt ? -0.8 : 0;
    const hc = X(3 + nod * 0.5, 19.6);
    let HU;
    const v = u; { const u = v * 1.16;
    const Hd = layer(F);
    blob(Hd, [[hc[0], hc[1], 3.4 * u, 3.4 * u], [hc[0] + 2 * u, hc[1] + 0.8 * u, 2 * u, 2 * u]], SKIN);
    // crown-helm: an iron cap with a gold band and four stubby spikes, cheek guard
    plate(Hd, [[hc[0] - 3.6 * u, hc[1] - 0.6 * u], [hc[0] + 3 * u, hc[1] - 1.2 * u], [hc[0] + 2.6 * u, hc[1] - 3.8 * u], [hc[0] - 0.4 * u, hc[1] - 4.8 * u], [hc[0] - 3.2 * u, hc[1] - 3.6 * u]], IRON, { wide: true });
    plate(Hd, [[hc[0] - 3.8 * u, hc[1] - 0.2 * u], [hc[0] + 3.2 * u, hc[1] - 0.8 * u], [hc[0] + 3.2 * u, hc[1] - 2 * u], [hc[0] - 3.8 * u, hc[1] - 1.4 * u]], GOLD);
    for (const [x, h] of [[-2.6, 2.6], [-0.8, 3.6], [1, 3], [2.6, 2.2]]) plate(Hd, [[hc[0] + (x - 0.7) * u, hc[1] - (1.8 + x * 0.05) * u], [hc[0] + (x + 0.7) * u, hc[1] - (1.8 + x * 0.05) * u], [hc[0] + (x + 0.2) * u, hc[1] - (1.8 + h) * u]], GOLD);
    for (let k = 0; k < 3; k++) { const gx = hc[0] + (-2 + k * 2) * u, gy = hc[1] - 1.2 * u; Hd.rect(R(gx), R(gy), 2, 2, k === 1 ? EMB[3] : C('#2f7070')); }
    plate(Hd, [[hc[0] - 3.4 * u, hc[1] - 0.4 * u], [hc[0] - 1.6 * u, hc[1] - 0.4 * u], [hc[0] - 1.8 * u, hc[1] + 2.6 * u], [hc[0] - 3 * u, hc[1] + 2.2 * u]], IRON);
    // the nose, the brow, deep sockets
    blob(Hd, [[hc[0] + 3.4 * u, hc[1] + 0.8 * u, 1.3 * u, 1.5 * u]], SKIN);
    Hd.ellipse(hc[0] + 1.6 * u, hc[1] + 0.2 * u, 1 * u, 0.8 * u, C('#140913'));
    tube(Hd, [[hc[0] + 0.2 * u, hc[1] - 0.6 * u], [hc[0] + 3.4 * u, hc[1] - 0.2 * u]], [0.7 * u, 0.5 * u], SKIN);
    put(L, Hd, true);
    HU = u; }
    // ---- the beard: a frozen waterfall from the chin to the ground, pooling round his boots
    const Wf = layer(F), chin = [hc[0] + 2.2 * u, hc[1] + 2.8 * u];
    const sway = idle ? sin(t) * 0.3 : run ? -0.8 : w2 ? 1 : 0;
    const wpts = [[chin[0] - 2.6 * u, chin[1] - 0.6 * u], [chin[0] + 2.2 * u, chin[1] - 0.4 * u], [chin[0] + (3.8 + sway) * u, oy - 7 * u], [ox + (9.6 + sway) * u, oy - 1.4 * u], [ox + 12 * u, oy - 0.2 * u], [ox - 1 * u, oy - 0.2 * u], [ox + 0.8 * u, oy - 1.6 * u], [chin[0] - 3 * u + sway * u, oy - 8 * u]];
    plate(Wf, wpts, ICE, { wide: true });
    // the falling water's streaks, sliding down frame by frame, and the white churn at the foot
    for (let k = 0; k < 6; k++) {
      const f = (k + 0.5) / 6, x0 = lerp(chin[0] - 2.2 * u, chin[0] + 2 * u, f), x1 = lerp(ox + 0.6 * u, ox + 10 * u, f) + sway * u;
      const ph = ((idle || run ? t : 0) + k * 0.37) % 1;
      for (let q = 0; q < 1; q += 0.02) {
        const seg = ((q - ph) % 0.34 + 0.34) % 0.34;
        if (seg > 0.18) continue;
        const x = lerp(x0, x1, q * q), y = lerp(chin[1] + 1 * u, oy - 1.6 * u, q);
        Wf.over(R(x), R(y), ICE[seg < 0.06 ? 4 : 3]);
      }
    }
    for (let x = R(ox - 0.6 * u); x < ox + 11.6 * u; x += 2) { const y = R(oy - (1 + Math.abs(Math.sin(x * 0.7)) * 0.9) * u); Wf.over(x, y, ICE[4]); Wf.over(x + 1, y, ICE[4]); Wf.over(x, y + 1, ICE[3]); }
    // icicles along the edge of the fall
    for (let k = 0; k < 4; k++) { const f = 0.25 + k * 0.18, x = lerp(chin[0] + 2.2 * u, ox + (9.6 + sway) * u, f), y = lerp(chin[1], oy - 1.4 * u, f); horn(Wf, [x - 0.4 * u, y], [x + 0.6 * u, y + 1 * u], [x + 0.8 * u, y + 2 * u], 0.8 * u, ICE); }
    if (hurt) crack(Wf, chin[0], chin[1] + 3 * u, 1.6, 7 * u, ICE[0], 12);
    put(L, Wf, true);
    // moustache over the falls
    tube(L, bez([[hc[0] + 2 * u, hc[1] + 2.4 * u], [hc[0] + 4.4 * u, hc[1] + 2.2 * u], [hc[0] + 5.4 * u, hc[1] + 3.8 * u]], 8), [1 * u, 0.45 * u], ICE);
    // ---- pauldron and near arm with the rune hammer
    const Ar = layer(F), sh = X(1, 15.2);
    blob(Ar, [[sh[0], sh[1], 3 * u, 2.2 * u]], IRON);
    spots(Ar, sh[0], sh[1], 2.4 * u, 1.6 * u, 3, 0.6 * u, RUST[2], 23);
    let hand, head;
    if (w1) { hand = X(-0.5, 25); head = X(-6, 30); }
    else if (w2) { hand = X(8.6, 7); head = X(13.6, 1.6); }
    else if (hurt) { hand = X(4, 10); head = X(-6, 19); }
    else if (run) { hand = X(4.6, 11.4 + sin(t) * 0.4); head = X(-5, 22); }
    else { hand = X(4.8, 11.6 + sin(t) * 0.2); head = X(-5.6, 22.6 + sin(t) * 0.2); }
    tube(Ar, [sh, [lerp(sh[0], hand[0], 0.5) + 0.6 * u, lerp(sh[1], hand[1], 0.5) + 1 * u], hand], [1.4 * u, 1.2 * u], IRON);
    const ha = Math.atan2(head[1] - hand[1], head[0] - hand[0]);
    const H = (along, across) => [head[0] + Math.cos(ha) * along * u - Math.sin(ha) * across * u, head[1] + Math.sin(ha) * along * u + Math.cos(ha) * across * u];
    tube(Ar, [[hand[0] - Math.cos(ha) * 1.6 * u, hand[1] - Math.sin(ha) * 1.6 * u], head], 0.6 * u, HAFT);
    for (const f of [0.2, 0.55]) { const x = lerp(hand[0], head[0], f), y = lerp(hand[1], head[1], f); Ar.disc(x, y, 0.75 * u, GOLD[3]); }
    blob(Ar, [[hand[0], hand[1], 1.3 * u, 1.2 * u]], IRON);
    // the hammer head: a squared iron block across the haft
    plate(Ar, [H(-1.8, -3), H(1.8, -3), H(1.8, 3), H(-1.8, 3)], ANV, { wide: true });
    plate(Ar, [H(-2.1, -3.2), H(2.1, -3.2), H(2.1, -2.3), H(-2.1, -2.3)], GOLD);
    plate(Ar, [H(-2.1, 2.3), H(2.1, 2.3), H(2.1, 3.2), H(-2.1, 3.2)], GOLD);
    put(L, Ar, true);
    put(F.p, L, false);
    // runes burning on the hammer's face
    const rb = w1 || w2 ? G[3] : G[2];
    for (let k = 0; k < 2; k++) { const c = H(-0.8 + k * 1.6, 0); rune(F, c[0] - 0.8 * u, c[1] - 0.9 * u, Math.max(3, R(1.6 * u)), rb, 51 + k); }
    // ember eyes
    const eh = hurt ? 0 : w1 ? 1.3 : 1;
    { const u = HU;
    if (eh) { litEll(F, hc[0] + 1.7 * u, hc[1] + 0.25 * u, 0.6 * u, 0.42 * u * eh, G[2]); lit(F, hc[0] + 1.9 * u, hc[1] + 0.1 * u, G[4]); }
    else litLine(F, hc[0] + 0.9 * u, hc[1] + 0.2 * u, hc[0] + 2.4 * u, hc[1] + 0.4 * u, G[1]); }
    // embers rising from the forge on his back
    for (let k = 0; k < 3; k++) { const q = ((idle || run ? t : 0.3) + k / 3) % 1; lit(F, ab[0] + (-1 + k + sin(q + k * 0.3) * 0.8) * u, ab[1] - (q * 9 - 1) * u, EMB[q < 0.5 ? 4 : 3]); }
    // the slam: sparks and a ring of fire off the hammer
    if (w2) { for (let k = 0; k < 7; k++) { const a = -Math.PI * (0.1 + k * 0.13), r = (3 + (k % 2) * 1.6) * u; litLine(F, head[0] + Math.cos(a) * r * 0.5, head[1] + Math.sin(a) * r * 0.5, head[0] + Math.cos(a) * r, head[1] + Math.sin(a) * r, k % 2 ? EMB[4] : EMB[3]); } flame(F, head[0] - 3 * u, oy, 3 * u, 2 * u, 0.2); flame(F, head[0] + 3 * u, oy, 2.4 * u, 1.6 * u, 0.6); }
    if (w1) for (let k = 0; k < 3; k++) { const c = H(0, -3.6 - k); lit(F, c[0] + (k - 1) * u, c[1], EMB[4]); }
    // breath steaming in the cold
    if (idle && P.i > 2) { const q = (P.i - 3) / 3; for (let k = 0; k < 3; k++) { const x = hc[0] + (5 + q * 3 + k * 0.6) * u, y = hc[1] + (2 - q * 2 - k * 0.4) * u; if (((R(x) + R(y)) & 1) === 0) F.p.rect(R(x), R(y), 2, 2, [...ICE[4].slice(0, 3), 140]); } }
    F.mouth = [hc[0] + 3 * u, hc[1] + 2 * u];
  },
};
const PAL_EMBER = () => ['#7a1e14', '#c2401c', '#ec7a2a', '#f8b848', '#fff0b0'].map((c) => C(c));

// ================================================================== Ymrath, the Frozen Titan
// The first giant, out of whose body the north was made, walking again. He is a mountain range on
// legs: dark rock under glacier plates with snow on every upward face, pine forests frozen on his
// shoulders, a mammoth's skull for a helm with its tusks curling before a face that is only a
// cave and two cold lights. His heart shows through a crevasse in his chest.
// a snow-laden pine: stacked tiers of needles, each capped with snow
function pine(L, x, y, h, Rm, snow, lean = 0) {
  const tiers = 4;
  for (let k = 0; k < tiers; k++) {
    const f = k / tiers, ty = y - h * (0.18 + f * 0.82), w = h * 0.34 * (1 - f * 0.68), cx = x + lean * h * f;
    const by = ty + h * 0.3;
    plate(L, [[cx, ty - h * 0.06], [cx + w, by], [cx + w * 0.4, by - h * 0.04], [cx - w * 0.4, by - h * 0.04], [cx - w, by]], Rm);
    for (let xx = Math.floor(cx - w * 0.7); xx <= cx + w * 0.2; xx++) { const yy = R(ty - h * 0.06 + (cx - xx) * (h * 0.36 / w) * 0.95); if (L.a(xx, yy + 1)) { L.set(xx, yy, snow[3]); L.set(xx, yy + 1, snow[4]); } }
  }
  L.line(x, y, x, y - h * 0.18, C('#3f2622'));
  return L;
}
// snow lying on every upward-facing edge of a layer: the topmost n px of each column run
function snowCap(L, snow, n, seed = 1) {
  const out = [];
  for (let x = 0; x < L.w; x++) for (let y = 1; y < L.h; y++) {
    if (!L.a(x, y) || L.a(x, y - 1)) continue;
    const d = n + (hash2(x >> 1, y >> 2, seed) > 0.5 ? 1 : 0);
    for (let k = 0; k < d; k++) if (L.a(x, y + k)) out.push(x, y + k, k === 0 ? 4 : k < d - 1 ? 3 : 2);
  }
  for (let i = 0; i < out.length; i += 3) L.set(out[i], out[i + 1], snow[out[i + 2]]);
  return L;
}
const ymrath = {
  view: 'side', box: [50, 44], pivot: 0.46, scale: 0.62, idle: 6, idleFps: 3,
  draw(F, o, P) {
    const { u, ox, oy } = F;
    const t = P.t, idle = P.act === 'idle', run = P.act === 'run', w1 = P.atk === 1, w2 = P.atk === 2, hurt = P.hurt;
    const ROCK = pal5('stone', 5), ROCKd = dimR(ROCK, 0.72), ICE = pal5('frost', 5), ICEd = dimR(ICE, 0.75);
    const SNOW = [C('#6e7a9a'), C('#96a2bc'), C('#c4d0e0'), C('#e6f4fc'), C('#fff4fb')], PINE = ramp('#1a3a40'), PINEd = dimR(PINE, 0.75);
    const BONE = [C('#5e4a47'), C('#8a6a52'), C('#cfa978'), C('#e2c494'), C('#f6e9cc')];
    const G = glowRamp(o.c3 || '#6bb0f4');
    const rear = w1 ? 1 : w2 ? -1 : hurt ? 0.5 : 0;
    const bob = run ? -Math.abs(sin(t)) * 0.8 : idle ? sin(t) * 0.25 : w2 ? -1.4 : 0;
    const X = (x, y) => [ox + (x - rear * Math.max(0, y - 10) * 0.1) * u, oy - (y + (y > 9 ? bob : 0)) * u];
    const XS = (pts) => pts.map(([x, y]) => X(x, y));
    const pulse = idle ? 0.5 + 0.5 * sin(t) : w1 ? 1 : 0.6;
    const L = layer(F);
    const sway = idle ? sin(t - 0.2) * 0.25 : run ? sin(t * 2) * 0.4 : w1 ? -0.4 : w2 ? 0.6 : 0;
    // an angular rock part: a slab with a lit glacier facet on its upper-left and a shadow facet low-right
    const crag = (Lr, pts, Rm, Im, seed) => {
      plate(Lr, pts, Rm, { wide: true });
      const n = pts.length, c = pts.reduce((a, p) => [a[0] + p[0] / n, a[1] + p[1] / n], [0, 0]);
      const i0 = seed % n, i1 = (i0 + 1) % n;
      facet(Lr, [pts[i0], pts[i1], [lerp(c[0], pts[i1][0], 0.3), lerp(c[1], pts[i1][1], 0.3)], [lerp(c[0], pts[i0][0], 0.2), lerp(c[1], pts[i0][1], 0.2)]], Im[3]);
      Lr.line(pts[i0][0], pts[i0][1], pts[i1][0], pts[i1][1], Im[4]);
    };
    // ---- arms: an angular rock upper arm, a glacier forearm, a boulder fist
    const arm = (far) => {
      const Ar = layer(F), Rm = far ? ROCKd : ROCK, Im = far ? ICEd : ICE;
      const sh = far ? X(-3, 27) : X(5, 26.5);
      let fist;
      if (w1) fist = far ? X(-3, 41) : X(3, 42);
      else if (w2) fist = far ? X(12, 2.8) : X(16.5, 2.8);
      else if (hurt) fist = far ? X(-8, 10) : X(8.5, 12);
      else { const sw = run ? sin(t + (far ? 0.5 : 0)) * 2.4 : sin(t) * 0.3; fist = far ? X(4.6 + sw, 4.2) : X(12.4 + sw, 4 + Math.max(0, sw) * 0.4); }
      const el = w1 ? [lerp(sh[0], fist[0], 0.5) + 3.4 * u, lerp(sh[1], fist[1], 0.5)] : [lerp(sh[0], fist[0], 0.42) + 2.2 * u, lerp(sh[1], fist[1], 0.42) + 0.6 * u];
      const quad = (a, b, w0, w1x) => { const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / d, ny = (b[0] - a[0]) / d; return [[a[0] + nx * w0, a[1] + ny * w0], [b[0] + nx * w1x, b[1] + ny * w1x], [b[0] - nx * w1x, b[1] - ny * w1x], [a[0] - nx * w0, a[1] - ny * w0]]; };
      crag(Ar, quad(sh, el, 4.4 * u, 3.4 * u), Rm, Im, 0);
      const fa = quad(el, fist, 3.2 * u, 2.6 * u);
      plate(Ar, fa, Im, { wide: true });
      facet(Ar, [fa[0], fa[1], [lerp(fa[1][0], fa[2][0], 0.45), lerp(fa[1][1], fa[2][1], 0.45)], [lerp(fa[0][0], fa[3][0], 0.45), lerp(fa[0][1], fa[3][1], 0.45)]], Im[4]);
      blob(Ar, [[el[0], el[1], 3.4 * u, 3 * u]], Rm, { tex: 7 });
      // the fist: a faceted boulder with knuckle stones
      const fp = [[-3.4, -2.4], [0.6, -3.4], [3.6, -1.6], [4, 1.8], [1.4, 3.2], [-2.6, 2.6], [-3.8, 0]].map(([a, b]) => [fist[0] + a * u, fist[1] + b * u]);
      crag(Ar, fp, Rm, Im, 0);
      for (let k = 0; k < 3; k++) plate(Ar, [[fist[0] + (k * 1.5 - 1.6) * u, fist[1] + 1.6 * u], [fist[0] + (k * 1.5 - 0.3) * u, fist[1] + 1.4 * u], [fist[0] + (k * 1.5 - 0.2) * u, fist[1] + 3.2 * u], [fist[0] + (k * 1.5 - 1.5) * u, fist[1] + 3.2 * u]], Rm);
      leafy(Ar, Rm, far ? 32 : 33, 0, 0, Ar.w - 1, Ar.h - 1, 0.8, [Rm[1], Rm[2], Rm[3]]);
      snowCap(Ar, SNOW, 2, far ? 3 : 4);
      put(L, Ar, !far);
    };
    arm(true);
    // ---- legs: angular rock columns on boulder feet
    const leg = (far) => {
      const Lg = layer(F), Rm = far ? ROCKd : ROCK, Im = far ? ICEd : ICE;
      let [dx, lift] = run ? stride(t + (far ? 0.5 : 0), 7, 2.4) : [0, 0];
      if (w2) dx += far ? -1.5 : 2;
      const x0 = (far ? -7 : -1.2), hip = X(x0 + 0.5, 12), fx = ox + (x0 + dx) * u, fy = oy - lift * u;
      crag(Lg, [[hip[0] - 4.2 * u, hip[1]], [hip[0] + 4 * u, hip[1] - 0.6 * u], [fx + 3.6 * u, fy - 3 * u], [fx - 3.4 * u, fy - 2.6 * u]], Rm, Im, 0);
      crag(Lg, [[fx - 4.4 * u, fy], [fx + 5.2 * u, fy], [fx + 4.6 * u, fy - 2.6 * u], [fx + 1 * u, fy - 3.8 * u], [fx - 4 * u, fy - 3 * u]], Rm, Im, 3);
      leafy(Lg, Rm, far ? 34 : 35, 0, 0, Lg.w - 1, Lg.h - 1, 0.8, [Rm[1], Rm[2], Rm[3]]);
      snowCap(Lg, SNOW, 2, far ? 5 : 6);
      put(L, Lg, !far);
    };
    leg(true);
    // ---- far shoulder's forest (behind the body)
    const Pf = layer(F);
    for (const [x, h, ln] of [[-11.5, 6.6, -0.1], [-9, 8.8, 0], [-6.4, 7.4, 0.05], [-3.8, 9.6, -0.05], [-1.4, 7, 0]]) { const b = X(x, 30.2 - Math.abs(x + 6) * 0.3); pine(Pf, b[0], b[1], h * u, PINEd, SNOW, ln + sway * 0.08); }
    put(L, Pf, true);
    // ---- the body: a hunched mountain: crags of violet rock, glacier plates, snow on every ledge
    const Bd = layer(F);
    const body = XS([[-12.5, 10], [-14.6, 17], [-12.6, 24.6], [-8, 29.4], [-1, 31.4], [6, 30.4], [10.4, 26], [10.6, 19], [8.4, 12.4], [2.6, 9], [-6, 8.4]]);
    plate(Bd, body, ROCK, { wide: true });
    // big flat planes: the lit back and shoulder sheathed in glacier, the shadowed belly in bare rock
    facet(Bd, XS([[-12.6, 24.6], [-8, 29.4], [-1, 31.4], [0, 26], [-5, 21], [-11, 19]]), ICE[3]);
    facet(Bd, XS([[-1, 31.4], [6, 30.4], [8.4, 27], [3, 25.4], [0, 26]]), ICE[4]);
    facet(Bd, XS([[-14.6, 17], [-11, 19], [-9, 13], [-12.5, 10]]), ICE[2]);
    facet(Bd, XS([[3, 25.4], [8.4, 27], [10.4, 26], [10.6, 19], [6, 18], [2.4, 21]]), ROCK[3]);
    facet(Bd, XS([[2.6, 9], [8.4, 12.4], [10.6, 19], [6, 18], [1, 14]]), ROCK[1]);
    facet(Bd, XS([[-6, 8.4], [2.6, 9], [1, 14], [-4, 13]]), ROCK[2]);
    // the plane seams
    for (const [a, b] of [[[0, 26], [-5, 21]], [[-5, 21], [-11, 19]], [[3, 25.4], [0, 26]], [[6, 18], [2.4, 21]], [[1, 14], [6, 18]], [[-4, 13], [1, 14]], [[-9, 13], [-4, 13]]]) { const p0 = X(...a), p1 = X(...b); Bd.line(p0[0], p0[1], p1[0], p1[1], ROCK[0]); }
    crack(Bd, ...X(-7, 25), 0.5, 5 * u, ICE[0], 14);
    crack(Bd, ...X(-3, 16), 2, 4 * u, ROCK[0], 15);
    leafy(Bd, ROCK, 31, 0, 0, Bd.w - 1, Bd.h - 1, 0.8, [ROCK[1], ROCK[2], ROCK[3]]);
    snowCap(Bd, SNOW, 3, 7);
    // snow lying in the seams' ledges
    for (const [x, y, w] of [[-8, 21.6, 3], [-2, 14.6, 2.4], [4, 19.2, 2]]) { const [a, b] = X(x, y); Bd.rect(R(a - w * u / 2), R(b), R(w * u), Math.max(2, R(0.5 * u)), SNOW[3]); Bd.rect(R(a - w * u / 2), R(b), R(w * u), 1, SNOW[4]); }
    // the chest crevasse: a jagged split with his heart's light inside
    const cv = X(-3.4, 18.6);
    const crev = [[-0.8, -5.6], [0.9, -2.6], [0, 0], [1.2, 3.6], [0.4, 5.6], [-0.6, 3.4], [-1.4, 0.2], [-0.4, -2.4]].map(([a, b]) => [cv[0] + a * u, cv[1] + b * u]);
    Bd.poly(crev, C('#141c3a'));
    put(L, Bd, true);
    const hr = (1.2 + pulse * 0.5) * u;
    litEll(F, cv[0], cv[1], hr * 0.6, hr * 2.1, G[2]);
    litEll(F, cv[0] - 0.1 * u, cv[1] - 0.2 * u, hr * 0.3, hr * 1.2, G[pulse > 0.7 ? 4 : 3]);
    for (const [a, b] of crev) { F.p.set(R(a), R(b), G[1]); F.e.set(R(a), R(b), G[1]); }
    leg(false);
    // ---- the head: thrust forward, a cave of a face beneath the mammoth skull
    const nod = w1 ? -1.5 : w2 ? 1.5 : hurt ? -1 : idle ? sin(t) * 0.2 : 0;
    const hc = X(12.6 + nod * 0.5, 25.6 - Math.max(0, nod) * 0.8);
    const Hd = layer(F);
    horn(Hd, [hc[0] + 1.4 * u, hc[1] + 0.4 * u], [hc[0] + 7.4 * u, hc[1] + 5.6 * u], [hc[0] + 8.2 * u, hc[1] - 1.6 * u], 2 * u, dimR(BONE, 0.72));
    crag(Hd, [[hc[0] - 3.6 * u, hc[1] - 1.4 * u], [hc[0] + 3.4 * u, hc[1] - 1.6 * u], [hc[0] + 3.8 * u, hc[1] + 2.4 * u], [hc[0] + 1.6 * u, hc[1] + 4.2 * u], [hc[0] - 2.6 * u, hc[1] + 3.6 * u]], ROCKd, ICEd, 4);
    // the face: a dark cave with icicle teeth
    Hd.ellipse(hc[0] + 1 * u, hc[1] + 1.2 * u, 2.6 * u, 2.2 * u, C('#141c3a'));
    const gape = w1 || w2 ? 1 : hurt ? 0.6 : 0;
    for (let k = 0; k < 4; k++) horn(Hd, [hc[0] + (-0.6 + k * 1.1) * u, hc[1] + (2.6 + gape) * u], [hc[0] + (-0.5 + k * 1.1) * u, hc[1] + (3.6 + gape) * u], [hc[0] + (-0.3 + k * 1.1) * u, hc[1] + (4.8 + (k % 2) * 1.4 + gape) * u], 1 * u, ICE);
    // the mammoth skull: a high domed cranium, sockets, the trunk's opening at the front
    const sk = [hc[0] - 0.4 * u, hc[1] - 3.4 * u];
    blob(Hd, [[sk[0], sk[1], 4.2 * u, 3.4 * u], [sk[0] - 1.2 * u, sk[1] - 2.2 * u, 3 * u, 2.6 * u], [sk[0] + 2.8 * u, sk[1] + 1 * u, 2.4 * u, 2 * u]], BONE, { tex: 3 });
    Hd.ellipse(sk[0] + 1.6 * u, sk[1] + 0.2 * u, 1.1 * u, 1 * u, C('#2a1838'));
    Hd.ellipse(sk[0] + 4.1 * u, sk[1] + 1.4 * u, 0.7 * u, 0.9 * u, C('#2a1838'));
    crack(Hd, sk[0] - 2 * u, sk[1] - 3 * u, 0.7, 3 * u, BONE[1], 16);
    snowCap(Hd, SNOW, 2, 9);
    horn(Hd, [sk[0] + 3 * u, sk[1] + 2.6 * u], [hc[0] + 9.8 * u, hc[1] + 7.4 * u], [hc[0] + 10.8 * u, hc[1] - 0.8 * u], 2.4 * u, BONE);
    put(L, Hd, true);
    // ---- near shoulder's forest
    const Pn = layer(F);
    for (const [x, h, ln] of [[0, 7.4, 0.05], [2.8, 10.4, 0], [5.4, 8, -0.06], [-2.6, 6, 0.1]]) { const b = X(x, 30.6 - Math.abs(x - 2) * 0.35); pine(Pn, b[0], b[1], h * u, PINE, SNOW, ln + sway * 0.1); }
    put(L, Pn, true);
    arm(false);
    put(F.p, L, false);
    // ---- eyes: two cold lights deep in the cave
    const eh = hurt ? 0 : w1 ? 1.3 : idle && P.i === 4 ? 0.2 : 1;
    if (eh > 0.3) { litEll(F, hc[0] + 0.2 * u, hc[1] + 0.8 * u, 0.8 * u, 0.6 * u * eh, G[3]); litEll(F, hc[0] + 2.4 * u, hc[1] + 0.9 * u, 0.55 * u, 0.45 * u * eh, G[2]); lit(F, hc[0] + 0.4 * u, hc[1] + 0.7 * u, G[4]); }
    else { litLine(F, hc[0] - 0.6 * u, hc[1] + 0.8 * u, hc[0] + 1 * u, hc[1] + 1.1 * u, G[1]); litLine(F, hc[0] + 2 * u, hc[1] + 1 * u, hc[0] + 2.9 * u, hc[1] + 0.8 * u, G[1]); }
    // ---- weather: snow sifting off the pines, frost breath, the slam's ice burst
    const sn = (x, y) => F.p.rect(R(x), R(y), 2, 2, SNOW[4]);
    if (idle || run) for (let k = 0; k < 5; k++) { const q = (t + k / 5) % 1, [a, b] = X(-10 + k * 3.6 + sin(q + k * 0.2) * 1.2, 34 - q * 14); sn(a, b); }
    if (idle && P.i >= 3) { const q = (P.i - 3) / 3; for (let k = 0; k < 4; k++) { const x = hc[0] + (4 + q * 4 + k) * u, y = hc[1] + (3.6 - q * 2 - k * 0.5) * u; if (((R(x) >> 1) + (R(y) >> 1)) & 1) F.p.rect(R(x), R(y), 3, 3, [...SNOW[3].slice(0, 3), 150]); } }
    if (w2) for (let k = 0; k < 7; k++) { const x = ox + (8 + k * 2.2) * u, h = (2.4 + (k % 3) * 1.8) * u; shard(F.p, x, oy, -Math.PI / 2 + (k - 3) * 0.12, h, 0.9 * u, ICE); F.e.disc(x, oy - h * 0.4, 0.6 * u, G[2]); }
    if (w2 || hurt) for (let k = 0; k < 6; k++) { const [a, b] = X(-10 + k * 3.4, 38 + (k % 3)); F.p.rect(R(a), R(b), 3, 3, SNOW[4]); }
    F.mouth = [hc[0] + 1.6 * u, hc[1] + 2.4 * u];
  },
};

// ------------------------------------------------------------------ assignments
// enemy id -> { design, name }: folded into src/data/enemies.js at integration
export const assign = {
  yew_blight: { design: 'yew_blight', name: 'The Yew Blight' },
  barrow_king: { design: 'barrow_king', name: 'The Barrow King' },
  thorn_queen: { design: 'thorn_queen', name: 'The Thorn Queen' },
  maze_warden_elder: { design: 'maze_warden_elder', name: 'The Labyrinth Itself' },
  rot_mother: { design: 'rot_mother', name: 'The Rot Mother' },
  briar_matron: { design: 'briar_matron', name: 'The Briar Matron' },
  king_vael: { design: 'king_vael', name: 'King Vael the Frozen' },
  last_king: { design: 'last_king', name: 'The Last King Under Snow' },
  ymrath: { design: 'ymrath', name: 'Ymrath, the Frozen Titan' },
};

export default {
  yew_blight,
  barrow_king,
  thorn_queen,
  maze_warden_elder,
  rot_mother,
  briar_matron,
  king_vael,
  last_king,
  ymrath,
};
