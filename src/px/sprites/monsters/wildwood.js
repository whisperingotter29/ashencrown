// Hand-built monster designs: wildwood (great bosses of the wilds and the frozen kings). See kit.js
// for the design format and docs/BESTIARY.md for the concepts.
import { C, R, ramp, pal5, layer, put, blob, tube, horn, slab, facet, shard, wing, drape, ik, stride, sin, cos, lerp, clamp, bez, rot, glow, flame, rune, eyeGlow, eyeBead, teeth, maw, spots, stripes, crack, over, rimLight, tint, light, dark, mixc, hash2, WHITE, VOID, BONE, BONE_D, MAW_D, CREAM, INK } from './kit.js';

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
  view: 'side', box: [52, 36], pivot: 0.36, scale: 1.1, idle: 6, idleFps: 4,
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
      const wrist = X(x, 3.4), palm = [ox + (x + 0.8 + dx) * u, oy - (1 + lift) * u];
      tube(Hd, [wrist, palm], [0.75 * u, 0.6 * u], Bm);
      for (let k = 0; k < 4; k++) {
        const a = -0.1 + k * 0.32 + (lift > 0.2 ? -0.3 : 0), l = (k === 0 ? 1.4 : 2) * u;
        const kn = [palm[0] + Math.cos(a) * l * 0.55, palm[1] + Math.sin(a) * l * 0.2], tip = [palm[0] + Math.cos(a) * l, palm[1] + Math.sin(a) * l * 0.5 + 0.5 * u];
        Hd.line(palm[0], palm[1], kn[0], kn[1], Bm[3]); Hd.line(kn[0], kn[1], tip[0], Math.min(tip[1], oy - 0.2 * u), Bm[2]);
        Hd.set(R(kn[0]), R(kn[1]) - 1, Bm[4]);
      }
      blob(Hd, [[palm[0], palm[1] - 0.2 * u, 0.9 * u, 0.6 * u]], Bm);
      put(L, Hd, !far);
    };
    for (const [x, ph] of [[-12, 0.1], [-6.5, 0.45], [-1, 0.8], [4.5, 0.15]]) hand(x, ph, true);

    // ---- the rune menhir standing on the back of the mound
    const Mn = layer(F);
    plate(Mn, [X(-11.2, 13), X(-7.4, 13.5), X(-7.6, 24), X(-8.8, 27.6), X(-10.6, 25.4)], stone, { wide: true });
    put(L, Mn, true);
    for (let k = 0; k < 3; k++) { const [rx, ry] = X(-9.6, 16 + k * 3.2); rune(F, rx - 0.8 * u, ry - 0.8 * u, Math.max(3, R(1.6 * u)), k === 1 && idle && P.i % 3 === 0 ? G[3] : G[1], 11 + k); }

    // ---- the mound: earth sides, a turf cap with a grass fringe, kerbstones round the rim
    const Md = layer(F), mc = X(-3, 7.8);
    blob(Md, [[mc[0], mc[1], 14.5 * u, 9.6 * u], [mc[0] + 5 * u, mc[1] + 1.2 * u, 9 * u, 7.4 * u]], earth, { tex: 5, clipY: R(oy - 2.4 * u) });
    const Tf = layer(F);
    blob(Tf, [[mc[0], mc[1] - 0.4 * u, 14.2 * u, 9.6 * u], [mc[0] + 5 * u, mc[1] + 0.8 * u, 9 * u, 7.4 * u]], turf, { tex: 7 });
    const edge = (x) => mc[1] - 1.4 * u + Math.sin(x * 0.21) * 0.9 * u + Math.sin(x * 0.07 + 1) * 1.1 * u;
    for (let y = 0; y < Tf.h; y++) for (let x = 0; x < Tf.w; x++) if (Tf.a(x, y) && y > edge(x)) Tf.clear(x, y);
    // grass fringe: tufts hanging over the earth line
    for (let x = 0; x < Tf.w; x += 2) { const y = R(edge(x)); if (Md.a(x, y + 1) && Tf.a(x, y - 1) && hash2(x >> 1, 3, 5) > 0.35) { Tf.set(x, y, turf[2]); Tf.set(x, y + 1, turf[2]); if (hash2(x, 4, 5) > 0.5) Tf.set(x, y + 2, turf[1]); } }
    put(Md, Tf, false);
    // grave-goods and bones poking out of the earth
    { const [a, b] = X(-10, 4.6); Md.disc(a, b, 1.1 * u, bone[3]); Md.set(R(a - 0.3 * u), R(b), C('#140913')); Md.set(R(a + 0.4 * u), R(b), C('#140913')); }
    { const [a, b] = X(-4, 3.6); Md.line(a - 1.6 * u, b, a + 1.4 * u, b - 0.6 * u, bone[3]); Md.line(a - 1.6 * u, b + 1, a + 1.4 * u, b - 0.6 * u + 1, bone[1]); }
    put(L, Md, true);
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
    const hip = X(10.4, 3.5), sh = X(11.8 + lean, 13.2 + rise), nk = X(12.4 + lean * 1.15, 14.6 + rise);
    const head = X(13.4 + lean * 1.25, 17.6 + rise);
    const K = layer(F);
    // far arm: a bony hand clutching the door post
    const fsh = [sh[0] - 1.4 * u, sh[1] + 0.2 * u], fel = X(8.8 + lean * 0.4, 10.4), fhd = X(7.6, 9.4);
    tube(K, [fsh, fel], [0.6 * u, 0.5 * u], dimR(bone, 0.75)); tube(K, [fel, fhd], [0.5 * u, 0.45 * u], dimR(bone, 0.75));
    for (let k = 0; k < 3; k++) K.line(fhd[0], fhd[1] + k, fhd[0] - 1 * u, fhd[1] + k * 1.1 + 0.6 * u, bone[2]);
    // spine, pelvis and ribcage
    tube(K, bez([hip, [lerp(hip[0], sh[0], 0.5) - 0.6 * u, lerp(hip[1], sh[1], 0.5)], sh], 10), [0.55 * u, 0.6 * u], bone);
    blob(K, [[hip[0] + 0.2 * u, hip[1] - 0.4 * u, 1.8 * u, 1.2 * u]], bone);
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
    Hd.ellipse(head[0] + 0.2 * u, head[1] - 0.1 * u, 0.95 * u, 0.85 * u, C('#140913'));
    Hd.ellipse(head[0] + 1.9 * u, head[1] - 0.1 * u, 0.7 * u, 0.8 * u, C('#140913'));
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
    if (w1) { hilt = X(9 + lean, 21.5); tip = X(1, 31); }
    else if (w2) { hilt = X(19.5, 10.5); tip = X(32, 2.2); }
    else if (hurt) { hilt = X(14, 9); tip = X(19, 0.4); }
    else { const sw = idle ? sin(t) * 0.2 : run ? sin(t * 2) * 0.4 : 0; hilt = X(16.2 + lean * 0.5 + sw, 9.6 + rise * 0.5); tip = X(18.5 + sw, 0.2); }
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
    if (eh) { litDisc(F, head[0] + 0.3 * u, head[1] - 0.05 * u, 0.5 * u, ec); litDisc(F, head[0] + 1.95 * u, head[1] - 0.05 * u, 0.38 * u, ec); }
    else { litLine(F, head[0] - 0.3 * u, head[1], head[0] + 0.8 * u, head[1] + 0.2 * u, G[1]); }
    // motes of wight-light drifting out of the passage
    if (idle || run) for (let k = 0; k < 3; k++) { const q = (t + k / 3) % 1, [a, b] = X(9.4 + k * 1.2 + sin(q + k) * 0.6, 4 + q * 9); lit(F, a, b, G[q < 0.6 ? 2 : 1]); }
    // dirt shaken loose on hurt
    if (hurt) for (let k = 0; k < 5; k++) { const [a, b] = X(-12 + k * 4.5, 1.2 + (k % 2) * 0.8); F.p.rect(R(a), R(b), 2, 2, earth[2]); }
    F.mouth = [head[0] + 1.8 * u, head[1] + hr * 0.7];
  },
};
const bayer2 = (x, y) => [0, 0.5, 0.75, 0.25][(x & 1) + ((y & 1) << 1)];

// ------------------------------------------------------------------ assignments
// enemy id -> { design, name }: folded into src/data/enemies.js at integration
export const assign = {
  yew_blight: { design: 'yew_blight', name: 'The Yew Blight' },
  barrow_king: { design: 'barrow_king', name: 'The Barrow King' },
};

export default {
  yew_blight,
  barrow_king,
};
