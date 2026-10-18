// Big landmark set-pieces as pixel sprites: colossus remains, the Cinder Spire, the triumphal
// arch, aqueduct bays, the Elder Yew, the frozen titan, the dwarf gate, the lighthouse, wrecks.
// Heights are compressed (~0.6) relative to the 3D originals so they don't swallow the screen.
//
// Drawn natively at the art density: every size below is written in the original design pixels
// (10 px per unit) and multiplied by A = ART, so a landmark covers the same patch of world as it
// always did while its masonry courses, cracks, leaf puffs and carvings get the extra pixels.
// Signatures are unchanged; sizes that callers pass in design pixels are converted here.
import { C, ART, light, dark, mixc, alpha, hash2, srand } from '../pix.js';
import { ramp5, pal, vn, limb, crown, capTop, boulder } from './props.js';
import { memo, mk, done } from './buildings.js';

const A = ART;
const lvl = (l, t = [0.62, 0.22, -0.18, -0.6]) => (l > t[0] ? 4 : l > t[1] ? 3 : l > t[2] ? 2 : l > t[3] ? 1 : 0);
const R4to5 = (R) => (R.length >= 5 ? R : [R[0], R[1], R[2], R[3], light(R[3], 1.12)]);

// shaded ellipse lit from the top-left; texture comes in small clusters, not per-pixel speckle
function ball(p, cx, cy, rx, ry, R, tex = 0) {
  R = R4to5(R);
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
    const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
    const d2 = nx * nx + ny * ny;
    if (d2 > 1) continue;
    let l = -0.5 * nx - 0.8 * ny + 0.2 + (tex ? (vn(x, y, 2.5 * A, tex) - 0.5) * 0.36 : 0);
    if (d2 > 0.8 && ny > 0.2) l -= 0.25;                                  // reflected-light rim stays dark
    p.set(x, y, R[lvl(l, [0.85, 0.55, -0.1, -0.6])]);
  }
}
// wind-blown sand heaped against a landmark: dune shading with crest and shadow ripple lines
function dune(p, cx, yb, rx, ry, color, seed) {
  const R = ramp5(color);
  const cy = yb - ry * 0.55;
  for (let y = Math.floor(cy - ry * 1.3); y <= yb; y++) for (let x = Math.floor(cx - rx * 1.3); x <= Math.ceil(cx + rx * 1.3); x++) {
    const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
    const edge = 1 + 0.1 * Math.sin(Math.atan2(ny, nx) * 5 + seed) + (vn(x, y, 4 * A, seed) - 0.5) * 0.16;
    if (nx * nx + ny * ny > edge * edge) continue;
    let l = -0.45 * nx - 0.6 * ny + 0.25 + (vn(x, y, 6 * A, seed + 1) - 0.5) * 0.2;
    const ph = x * (0.16 / A) + y * (0.55 / A) + vn(x, y, 14 * A, seed + 2) * 5;
    if (Math.sin(ph) > 0.93) l += 0.3; else if (Math.sin(ph - 0.5) > 0.95) l -= 0.3;
    p.set(x, y, R[lvl(l, [0.72, 0.3, -0.12, -0.55])]);
    if (hash2(x, y, seed) < 0.012) p.set(x, y, R[1]);
  }
}
// a crack: 1-px dark seam with a lit lip on its upper-left side, over existing pixels only
function seam(p, x, y, steps, dark0, lit, r, spread = 1) {
  for (let i = 0; i < steps; i++) {
    const nx = x + (r() - 0.5) * 2 * spread * A, ny = y + r() * 1.6 * A;
    const n = Math.max(1, Math.round(Math.hypot(nx - x, ny - y)));
    for (let k = 0; k <= n; k++) {
      const X = Math.round(x + (nx - x) * k / n), Y = Math.round(y + (ny - y) * k / n);
      if (p.a(X, Y) < 200) continue;
      p.set(X, Y, dark0);
      if (lit && p.a(X - 1, Y - 1) > 200 && hash2(X, Y, 3) < 0.6) p.set(X - 1, Y, lit);
    }
    x = nx; y = ny;
  }
}
// ashlar masonry: offset courses of world-sized blocks, 1-px mortar, a lit top-left bevel and a
// shaded bottom-right edge per block, per-block tone, weather stains, the odd chipped corner
function masonry(p, x0, y0, w, h, base, o = {}) {
  const c = C(base), bh = o.bh ?? Math.round(5 * A), bw = o.bw ?? Math.round(10 * A), seed = o.seed ?? 1;
  x0 = Math.round(x0); y0 = Math.round(y0); w = Math.round(w); h = Math.round(h);
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const lx = x - x0, ly = y - y0, row = Math.floor(ly / bh), off = row & 1 ? bw >> 1 : 0;
    const bx = Math.floor((lx + off) / bw), mx = (lx + off) % bw, my = ly % bh;
    let col;
    if (my === bh - 1 || mx === 0) col = dark(c, 0.62);
    else {
      const t = 0.9 + hash2(bx, row, seed) * 0.16;
      col = [c[0] * t, c[1] * t, c[2] * t, 255];
      if (my === 0 || mx === 1) col = light(col, 1.1);
      else if (mx === bw - 1 || my === bh - 2) col = dark(col, 0.86);
      if (vn(x, y, 5 * A, seed + 7) > 0.74) col = dark(col, 0.9);
      if (hash2(bx, row, seed + 3) < 0.08 && mx < 3 && my < 3) col = dark(c, 0.62);   // chipped corner
    }
    if (lx === 0) col = light(col, 1.1); else if (lx === w - 1) col = dark(col, 0.78);
    if (ly === h - 1) col = dark(col, 0.72);
    p.set(x, y, col);
  }
  if (o.moss) for (let x = x0; x < x0 + w; x++) {
    const hh = Math.round(vn(x, 0, 4 * A, seed + 9) * o.moss * A);
    for (let k = 0; k < hh; k++) if (p.a(x, y0 + h - 1 - k) > 200) p.set(x, y0 + h - 1 - k, k === hh - 1 ? '#7a9a4a' : '#4a6a32');
  }
}
// arched opening: dark interior with light spilling in at the floor, and a ring of voussoirs with
// a keystone around the arch
function archway(p, cx, yb, w, h, stone, o = {}) {
  const r = w / 2, spring = yb - h + r, t = o.ring ?? Math.round(3.2 * A), S = ramp5(stone);
  for (let y = Math.floor(yb - h - t); y <= yb; y++) for (let x = Math.floor(cx - r - t); x <= Math.ceil(cx + r + t); x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - spring;
    const d = dy < 0 ? Math.hypot(dx, dy) : Math.abs(dx);
    if (d <= r) {
      const depth = (y - (yb - h)) / h;
      p.set(x, y, depth > 0.85 ? '#2a2220' : depth > 0.7 ? '#1c1614' : '#0e0a0c');
    } else if (d <= r + t && (dy < 0 || o.jambs)) {
      const ang = Math.atan2(-dy, dx), seg = Math.floor((ang / Math.PI) * 9 + 0.5);
      const joint = Math.abs((ang / Math.PI) * 9 + 0.5 - Math.round((ang / Math.PI) * 9 + 0.5)) < 0.08 + 0.5 / (r + t);
      let i = dx < -r * 0.2 ? 3 : dx > r * 0.3 ? 1 : 2;
      if (d > r + t - 1.2) i = Math.max(0, i - 1);
      if (d < r + 1.2) i = Math.min(4, i + 1);
      if (seg === 4 || seg === 5) i = Math.min(4, i + (dy < -r ? 1 : 0));          // keystone catches light
      p.set(x, y, joint && dy < 0 ? S[0] : S[i]);
    }
  }
}
// engaged column (pilaster) with base, fluted shaft and a simple capital
function pilaster(p, x, ytop, ybot, w, stone) {
  const S = ramp5(stone);
  for (let y = Math.round(ytop); y <= ybot; y++) for (let i = 0; i < w; i++) {
    const u = i / (w - 1);
    let k = u < 0.25 ? 3 : u < 0.6 ? 2 : u < 0.85 ? 1 : 0;
    if (i % 3 === 2 && u > 0.1 && u < 0.9) k = Math.max(0, k - 1);
    p.set(x + i, y, S[k]);
  }
  for (const [yy, ext] of [[ytop, 2], [ytop + 1, 1], [ybot - 1, 1], [ybot, 2]]) for (let i = -ext; i < w + ext; i++) p.set(x + i, Math.round(yy), S[yy === ytop || yy === ybot - 1 ? 4 : 1]);
}
// strata-banded rock face with snow on top (dwarf cliff)
function lantern(e, p, x, y, w, h, c) { p.rect(x, y, w, h, c); e.rect(x, y, w, h, c); p.set(x, y, '#fff4d0'); e.set(x, y, '#fff4d0'); }

// ---------------------------------------------------------------- colossus
export function colossusHead(sc = 1) {
  return memo('cHead' + sc, () => {
    const W = Math.round(180 * sc * A), H = Math.round(170 * sc * A);
    const p = mk(W + 40 * A, H + 30 * A), e = mk(W + 40 * A, H + 30 * A);
    const cx = p.w / 2, yb = p.h - 1, R = ramp5('#c88a5a'), G = pal('#7a4a14', '#b07a24', '#d8a040', '#f0c860', '#fff0a8');
    const fy = yb - H * 0.5, fr = W * 0.36, r = srand(5);
    // crown behind and above: faceted spikes, lit flank left of the ridge
    for (let k = -4; k <= 4; k++) {
      const x = cx + k * fr * 0.22, h = (k % 2 ? 0.22 : 0.34) * H, by = fy - fr * 0.72, hw = fr * 0.1;
      p.poly([[x - hw, by], [x, by - h], [x, by]], G[k < 1 ? 3 : 2]);
      p.poly([[x, by], [x, by - h], [x + hw, by]], G[k < 1 ? 1 : 0]);
      p.line(x, by - h, x - hw * 0.4, by - h * 0.6, G[4]);
    }
    ball(p, cx, fy - fr * 0.68, fr * 1.02, fr * 0.2, G, 3);
    for (let k = -3; k <= 3; k++) { const x = cx + k * fr * 0.27, y = fy - fr * 0.68 + Math.abs(k) * 0.6 * A; p.disc(x, y, 2.2 * A, '#8a1a20'); p.disc(x - 0.4 * A, y - 0.4 * A, 1.2 * A, '#e04040'); p.set(Math.round(x - A), Math.round(y - A), '#ffd0c0'); }
    // face
    ball(p, cx, fy, fr, fr * 1.15, R, 7);
    // weathering: streaks running down from the brow
    for (let x = Math.floor(cx - fr); x < cx + fr; x++) {
      if (vn(x, 0, 2 * A, 11) < 0.68) continue;
      const len = fr * (0.4 + vn(x, 1, 3 * A, 12) * 0.9);
      for (let y = Math.round(fy - fr * 0.5); y < fy - fr * 0.5 + len; y++) if (p.a(x, y) > 200 && hash2(x, y, 4) < 0.8) p.set(x, y, dark(p.get(x, y), 0.9));
    }
    // brow ridge, hollow eyes, nose, lips
    const EY = pal('#0a0606', '#140c0a', '#22140e', '#321e14', '#4a2c1c');
    for (const sd of [-1, 1]) {
      ball(p, cx + sd * fr * 0.38, fy - fr * 0.18, fr * 0.24, fr * 0.13, EY);
      p.ellipse(cx + sd * fr * 0.38 + fr * 0.04, fy - fr * 0.14, fr * 0.07, fr * 0.04, '#5a3420');      // dull iris stone
      limb(p, cx + sd * fr * 0.15, fy - fr * 0.36, cx + sd * fr * 0.62, fy - fr * 0.33, 3 * sc * A, 2.2 * sc * A, R);
      p.line(cx + sd * fr * 0.18, fy - fr * 0.31, cx + sd * fr * 0.6, fy - fr * 0.28, R[0]);
      p.line(cx + sd * fr * 0.2, fy - fr * 0.03, cx + sd * fr * 0.55, fy - fr * 0.01, R[1]);            // lower lid
    }
    p.poly([[cx - fr * 0.04, fy - fr * 0.25], [cx + fr * 0.16, fy + fr * 0.3], [cx - fr * 0.12, fy + fr * 0.32]], R[3]);
    p.poly([[cx + fr * 0.04, fy - fr * 0.2], [cx + fr * 0.16, fy + fr * 0.3], [cx + fr * 0.02, fy + fr * 0.3]], R[1]);
    p.line(cx - fr * 0.03, fy - fr * 0.22, cx - fr * 0.1, fy + fr * 0.26, R[4]);
    for (const sd of [-1, 1]) p.ellipse(cx + sd * fr * 0.07 + fr * 0.02, fy + fr * 0.3, fr * 0.035, fr * 0.02, R[0]);
    limb(p, cx - fr * 0.25, fy + fr * 0.55, cx + fr * 0.25, fy + fr * 0.55, 2.2 * sc * A, 2.2 * sc * A, [R[0], R[0], R[1], R[1]]);
    limb(p, cx - fr * 0.18, fy + fr * 0.63, cx + fr * 0.18, fy + fr * 0.63, 2 * sc * A, 2 * sc * A, [R[1], R[2], R[3], R[4]]);
    p.line(cx - fr * 0.1, fy + fr * 0.8, cx + fr * 0.12, fy + fr * 0.8, R[1]);                          // chin cleft shadow
    // cracks
    for (let k = 0; k < 7; k++) seam(p, cx + (r() - 0.5) * fr * 1.5, fy + (r() - 0.6) * fr * 1.4, 7, R[0], R[3], r);
    // half-buried in the dunes
    dune(p, cx, yb, W * 0.62, H * 0.22, '#d89a68', 9);
    return done(p, e);
  });
}
export function colossusHand() {
  return memo('cHand', () => {
    const p = mk(170 * A, 150 * A), cx = p.w / 2, yb = p.h - 1, R = ramp5('#c88a5a'), r = srand(3);
    const fingers = [[-44, 70, -0.5], [-20, 105, -0.15], [6, 115, 0.05], [30, 100, 0.25], [52, 58, 0.7]];
    for (const [dx, h, lean] of fingers) {
      const x0 = cx + dx * A, y0 = yb - 20 * A;
      const x1 = x0 + lean * h * 0.5 * A, y1 = y0 - h * A;
      limb(p, x0, y0, x1, y1, 22 * A, 15 * A, R, { grain: true, seed: dx + 50 });
      // knuckle creases: a dark fold with a lit ridge above it
      for (const t of [0.35, 0.68]) {
        const kx = x0 + (x1 - x0) * t, ky = y0 + (y1 - y0) * t, hw = (22 - 7 * t) * A * 0.42;
        for (let i = -hw; i <= hw; i++) { const yy = ky + Math.abs(i) * 0.12 - 0.1 * i; if (p.a(kx + i, yy) > 200) { p.set(kx + i, yy, R[0]); if (i < hw * 0.4) p.set(kx + i, yy - 1, R[3]); } }
      }
      // fingertip with a worn nail
      ball(p, x1, y1, 7.5 * A, 5 * A, R, 5);
      p.ellipse(x1 + lean * A, y1 - 1.2 * A, 4 * A, 2.4 * A, R[3]);
      p.line(x1 - 3 * A, y1 - 0.4 * A, x1 + 3 * A, y1 - 0.4 * A, R[1]);
    }
    for (let k = 0; k < 6; k++) seam(p, cx + (r() - 0.5) * 120 * A, yb - (40 + r() * 70) * A, 6, R[0], R[3], r);
    dune(p, cx, yb, 82 * A, 26 * A, '#d89a68', 3);
    return done(p, null);
  });
}
export function colossusTorso() {
  return memo('cTorso', () => {
    const p = mk(300 * A, 140 * A), cx = p.w / 2, yb = p.h - 1, R = ramp5('#b87a4a'), r = srand(17);
    ball(p, cx - 10 * A, yb - 60 * A, 110 * A, 52 * A, R, 4);
    // pectorals / abdomen carving facing up
    for (const sd of [-1, 1]) ball(p, cx - 40 * A, yb - (72 - sd * 22) * A, 30 * A, 18 * A, R.map((c) => light(c, 1.04)), 6);
    for (let k = 0; k < 3; k++) for (const sd of [-1, 1]) ball(p, cx + (15 + k * 22) * A, yb - (66 - sd * 13) * A, 10 * A, 9 * A, R, 8);
    // flung arm
    limb(p, cx - 90 * A, yb - 90 * A, cx - 135 * A, yb - 128 * A, 30 * A, 22 * A, R, { grain: true, seed: 4 });
    ball(p, cx - 138 * A, yb - 130 * A, 15 * A, 11 * A, R, 9);
    // neck stump + spears stuck in it
    ball(p, cx - 118 * A, yb - 64 * A, 22 * A, 26 * A, R, 3);
    ball(p, cx - 118 * A, yb - 64 * A, 12 * A, 15 * A, pal('#3a1e10', '#4e2a18', '#683a22', '#7a4a2c', '#8a5a36'));
    for (let k = 0; k < 6; k++) seam(p, cx + (r() - 0.4) * 160 * A, yb - (40 + r() * 50) * A, 8, R[0], R[3], r);
    for (let k = 0; k < 6; k++) {
      const x = cx - 60 * A + r() * 140 * A, y = yb - 50 * A - r() * 50 * A, x2 = x + (8 + r() * 6) * A, y2 = y - (26 + r() * 10) * A;
      p.line(x, y, x2, y2, '#5a3a1a'); p.line(x + 1, y, x2 + 1, y2, '#3a2410');
      p.poly([[x2 - 1.5 * A, y2 + 1], [x2 + 2 * A * 0.3, y2 - 4 * A], [x2 + 2 * A, y2 + 1.5]], '#d8a040'); p.set(Math.round(x2), Math.round(y2 - 2 * A), '#fff0a0');
    }
    dune(p, cx, yb, 140 * A, 20 * A, '#d8a070', 7);
    return done(p, null);
  });
}
// ---------------------------------------------------------------- the Cinder Spire
export function spireSprite(sc = 1) {
  return memo('spire' + sc, () => {
    const W = Math.round(150 * sc * A), H = Math.round(250 * sc * A);
    const p = mk(W + 20 * A, H + 40 * A), e = mk(W + 20 * A, H + 40 * A);
    const cx = p.w / 2, yb = p.h - 1;
    const segs = 8, segH = H / segs;
    for (let i = 0; i < segs; i++) {
      const r0 = (W / 2) * (1 - i * 0.093), y1 = yb - i * segH, y0 = y1 - segH;
      const col = C(i % 2 ? '#4a2a22' : '#5a3228'), S = ramp5(col);
      for (let y = Math.floor(y0); y <= y1; y++) {
        const t = (y - y0) / segH;
        const half = r0 * (0.92 + 0.08 * t) + Math.sin(y * 0.2 / A + i) * 2 * A;
        for (let x = Math.floor(cx - half); x <= cx + half; x++) {
          const u = (x - cx) / half;
          let k = u < -0.7 ? 4 : u < -0.4 ? 3 : u < 0.45 ? 2 : u < 0.8 ? 1 : 0;
          // basalt blocks: vertical joints and horizontal courses
          const course = Math.floor((y - y0) / (6 * A)), jx = Math.floor((x - cx + (course & 1) * 5 * A) / (10 * A));
          if ((y - y0) % Math.round(6 * A) === 0 || Math.round(x - cx + (course & 1) * 5 * A) % Math.round(10 * A) === 0) k = Math.max(0, k - 1);
          else if (hash2(jx, course + i * 20, 5) < 0.25) k = Math.max(0, k - 1);
          if (t < 0.06) k = 0;                                                           // ledge shadow
          if (t > 0.94 && u < 0.4) k = Math.min(4, k + 1);                               // lit ledge lip
          p.set(x, y, S[k]);
        }
      }
      if (i > 1) {
        // glowing arched windows
        const wx = Math.round(cx + Math.sin(i * 1.7) * r0 * 0.5), wy = Math.round(y1 - segH * 0.55), ww = Math.round(6 * A), wh = Math.round(segH * 0.45);
        archway(p, wx, wy, ww, wh, '#7a4a38', { ring: Math.round(1.6 * A) });
        for (let y = wy - wh; y <= wy; y++) for (let x = wx - ww / 2; x < wx + ww / 2; x++) {
          const d = Math.hypot(x + 0.5 - wx, Math.max(0, (wy - wh + ww / 2) - y));
          if (d > ww / 2 - 0.5) continue;
          const c = y > wy - wh * 0.3 ? '#ffb060' : '#ff7030';
          p.set(x, y, c); e.set(x, y, c);
        }
      }
    }
    // embers seeping from the joints
    for (let k = 0; k < 30; k++) { const x = Math.round(cx + (hash2(k, 1, 9) - 0.5) * W * 0.7), y = Math.round(yb - hash2(k, 2, 9) * H); if (p.a(x, y) > 200) { p.set(x, y, '#ff8a40'); e.set(x, y, '#ff7030'); } }
    // dragon skull crowning the broken top
    const ty = yb - H, B = pal('#5a5044', '#9a8e7a', '#cfc4ae', '#e8e0cc', '#fff8e8');
    for (const sd of [-1, 1]) limb(p, cx + sd * 10 * sc * A, ty - 12 * sc * A, cx + sd * 26 * sc * A, ty - 26 * sc * A, 3.2 * A, 1.2 * A, B);
    ball(p, cx, ty - 6 * A, 18 * sc * A, 10 * sc * A, B, 2);
    p.ellipse(cx + 8 * sc * A, ty - 3 * sc * A, 6 * sc * A, 3 * sc * A, B[1]);                       // snout ridge
    p.ellipse(cx - 6 * sc * A, ty - 8 * sc * A, 4 * sc * A, 3 * sc * A, '#1a1010');
    e.disc(cx - 6 * sc * A, ty - 8 * sc * A, 1.5 * A, '#ff6020'); p.disc(cx - 6 * sc * A, ty - 8 * sc * A, 1.2 * A, '#ff6020');
    for (let k = 0; k < 4; k++) { const x = cx + (2 + k * 3) * sc * A, y = ty + 1 * A; p.poly([[x, y], [x + 1.2 * A, y], [x + 0.6 * A, y + 2.4 * A]], B[3]); }
    return done(p, e);
  });
}
// ---------------------------------------------------------------- imperial ruins
export function archSprite(sc = 1) {
  return memo('arch' + sc, () => {
    const W = Math.round(130 * sc * A), H = Math.round(160 * sc * A);
    const p = mk(W + 10 * A, H + 10 * A);
    const cx = p.w / 2, yb = p.h - 1, stone = '#e8e0cc', S = ramp5(stone), r = srand(41);
    masonry(p, cx - W / 2, yb - H, W, H, stone, { seed: 3, moss: 3 });
    // attic with cornice and a gold band of lettering
    const at = Math.round(yb - H);
    for (let x = Math.round(cx - W / 2 - 3 * A); x < cx + W / 2 + 3 * A; x++) { p.set(x, at - Math.round(4 * A), S[4]); for (let k = 1; k < Math.round(4 * A); k++) p.set(x, at - k, S[k < 2 ? 3 : 2]); p.set(x, at, S[0]); }
    const gx = Math.round(cx - W * 0.35), gw = Math.round(W * 0.7), gy = Math.round(at + 8 * A), gh = Math.round(10 * A);
    const Gd = pal('#6a4a18', '#a07830', '#c8a050', '#e8c870', '#fff0b0');
    for (let y = gy; y < gy + gh; y++) for (let x = gx; x < gx + gw; x++) p.set(x, y, y === gy ? Gd[4] : y === gy + gh - 1 ? Gd[0] : x === gx ? Gd[3] : x === gx + gw - 1 ? Gd[1] : Gd[2]);
    for (let x = gx + 3 * A; x < gx + gw - 3 * A; x += Math.round(3 * A)) if (hash2(x, 1, 3) < 0.8) { const h = Math.round(gh * 0.5); p.rect(Math.round(x), gy + Math.round(gh * 0.25), Math.round(A), h, Gd[0]); p.set(Math.round(x) - 1, gy + Math.round(gh * 0.25), Gd[4]); }
    // central arch opening + side reliefs + engaged columns
    const aw = Math.round(W * 0.38), ah = Math.round(H * 0.62);
    archway(p, cx, yb, aw, ah, stone);
    for (const sd of [-1, 1]) {
      // relief panel: a figure-shaped dark recess with a lit rim
      const px = Math.round(cx + sd * W * 0.36 - 8 * A), py = Math.round(yb - H * 0.62), pw = Math.round(16 * A), ph = Math.round(24 * A);
      for (let y = py; y < py + ph; y++) for (let x = px; x < px + pw; x++) p.set(x, y, x === px || y === py ? S[1] : x === px + pw - 1 || y === py + ph - 1 ? S[4] : S[2]);
      ball(p, px + pw / 2, py + ph * 0.3, 3 * A, 3 * A, S);
      limb(p, px + pw / 2, py + ph * 0.45, px + pw / 2, py + ph * 0.85, 5 * A, 4 * A, S);
      limb(p, px + pw / 2, py + ph * 0.5, px + pw / 2 + sd * 5 * A, py + ph * 0.32, 1.8 * A, 1.4 * A, S);
      for (const k of [0.3, 0.42]) pilaster(p, Math.round(cx + sd * W * k) - Math.round(1.5 * A), yb - Math.round(H * 0.8), yb - 1, Math.round(4 * A), stone);
    }
    for (let k = 0; k < 5; k++) seam(p, cx + (r() - 0.5) * W * 0.9, yb - H * (0.3 + r() * 0.6), 6, S[0], null, r);
    return done(p, null);
  });
}
export function aqueductBay() {
  return memo('aqBay', () => {
    const p = mk(92 * A, 96 * A), yb = p.h - 1, stone = '#d8d0b8', S = ramp5(stone);
    masonry(p, A, yb - 90 * A, 90 * A, 90 * A, stone, { seed: 2, moss: 4 });
    const cx = p.w / 2;
    archway(p, cx, yb, 56 * A, 40 * A, stone);
    archway(p, cx, yb - 46 * A, 56 * A, 30 * A, stone);
    // channel lip with water running in it
    const ty = Math.round(yb - 92 * A);
    for (let x = 0; x < p.w; x++) for (let k = 0; k < Math.round(4 * A); k++) p.set(x, ty + k, k === 0 ? S[4] : k === Math.round(4 * A) - 1 ? S[0] : S[3]);
    for (let x = Math.round(2 * A); x < p.w - 2 * A; x++) { p.set(x, ty - 1, (x + 3) % Math.round(5 * A) < 2 ? '#a8d8f0' : '#5a90b8'); p.set(x, ty - 2, '#3a6a90'); }
    return done(p, null);
  });
}
export function palaceDome() {
  return memo('palDome', () => {
    const p = mk(210 * A, 130 * A), cx = p.w / 2, yb = p.h - 1, G = pal('#6a4a18', '#a87a28', '#d8a840', '#f0c860', '#fff0a8');
    masonry(p, cx - 104 * A, yb - 34 * A, 208 * A, 30 * A, '#e8e0cc', { seed: 3, bh: Math.round(6 * A), bw: Math.round(14 * A) });
    const base = yb - 34 * A, Rr = 96 * A, Hd = 86 * A;
    const brokenY = (x) => yb - 70 * A + Math.sin(x * 0.3 / A) * 6 * A + (hash2(Math.round(x / 2), 0, 5) - 0.5) * 3 * A;
    for (let y = Math.round(yb - 120 * A); y <= base; y++) {
      const t = (base - y) / Hd; const half = Rr * Math.sqrt(Math.max(0, 1 - t * t));
      for (let x = Math.floor(cx - half); x <= cx + half; x++) {
        const u = (x - cx) / Math.max(1, half);
        if (x > cx + 10 * A && y < brokenY(x)) continue;
        // gilded ribs every eighth of the dome, panels shaded by their angle
        const ang = Math.asin(Math.max(-1, Math.min(1, u))), rib = Math.abs(((ang / Math.PI) * 8 + 8.5) % 1 - 0.5);
        let k = u < -0.72 ? 4 : u < -0.38 ? 3 : u < 0.3 ? 2 : u < 0.72 ? 1 : 0;
        if (rib < 0.07) k = Math.min(4, k + 1); else if (rib < 0.12) k = Math.max(0, k - 1);
        if (t > 0.92) k = Math.max(0, k - 1);
        p.set(x, y, G[k]);
      }
    }
    // the broken edge: gilt torn back over the dark iron frame of the ribs
    for (let x = Math.round(cx + 10 * A); x < cx + Rr; x++) {
      const y = Math.round(brokenY(x));
      if (p.a(x, y) > 200) { p.set(x, y, G[4]); p.set(x, y + 1, G[0]); }
      if (Math.round(x - cx) % Math.round(8 * A) === 0) p.line(x, y, x + 2 * A, yb - 60 * A, '#4a3420');
    }
    for (let x = Math.round(cx + 12 * A); x < cx + 96 * A; x += Math.round(3 * A)) p.line(x, brokenY(x) + 2, x + 2 * A, yb - 60 * A, '#8a6a30');
    return done(p, null);
  });
}
export function throneSprite() {
  return memo('throne', () => {
    const p = mk(40 * A, 56 * A), e = mk(40 * A, 56 * A), G = pal('#5a3a10', '#8a6420', '#c8a050', '#e8c870', '#fff0b0');
    const box = (x, y, w, h, lit = 1) => { x = Math.round(x * A); y = Math.round(y * A); w = Math.round(w * A); h = Math.round(h * A); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) p.set(x + i, y + j, G[j === 0 ? 4 : i === 0 ? 3 : i === w - 1 || j === h - 1 ? 0 : i < w * 0.3 ? 2 + lit : 2]); };
    box(6, 40, 28, 14, 0);
    box(10, 6, 20, 36);
    for (const x of [4, 30]) box(x, 30, 6, 14);
    p.poly([[10 * A, 6 * A], [20 * A, 0], [30 * A, 6 * A]], G[3]); p.poly([[20 * A, 0], [30 * A, 6 * A], [20 * A, 6 * A]], G[2]);
    // red cushion and carved back panel
    p.rect(Math.round(12 * A), Math.round(38 * A), Math.round(16 * A), Math.round(3 * A), '#8a1a20'); p.rect(Math.round(12 * A), Math.round(38 * A), Math.round(16 * A), 1, '#c83a3a');
    for (let y = Math.round(10 * A); y < 34 * A; y += Math.round(4 * A)) p.line(13 * A, y, 27 * A, y, G[1]);
    p.disc(20 * A, 4 * A, 2 * A, '#ffd060'); e.disc(20 * A, 4 * A, 2 * A, '#ffd060'); p.set(Math.round(19 * A), Math.round(3 * A), '#ffffff');
    return done(p, e);
  });
}
export function statueSprite(prone = true) {
  return memo('statue' + prone, () => {
    const p = mk(230 * A, 80 * A), cx = p.w / 2, yb = p.h - 1, R = ramp5('#e8e0cc'), r = srand(22);
    // legs, torso lying, raised arm; folds of a carved robe across the body
    for (const sd of [-1, 1]) { limb(p, cx - 30 * A, yb - (34 - sd * 12) * A, cx - 105 * A, yb - (30 - sd * 14) * A, 26 * A, 18 * A, R, { grain: true, seed: sd + 3 }); ball(p, cx - 108 * A, yb - (30 - sd * 14) * A, 10 * A, 9 * A, R, 3); }
    ball(p, cx + 30 * A, yb - 34 * A, 70 * A, 28 * A, R, 3);
    for (let k = 0; k < 7; k++) { const x0 = cx - 20 * A + k * 12 * A; p.line(x0, yb - 52 * A, x0 + 8 * A, yb - 14 * A, R[1]); p.line(x0 - 1, yb - 52 * A, x0 + 8 * A - 1, yb - 14 * A, R[4]); }
    limb(p, cx + 60 * A, yb - 50 * A, cx + 85 * A, yb - 66 * A, 18 * A, 13 * A, R);
    ball(p, cx + 87 * A, yb - 68 * A, 8 * A, 7 * A, R);
    for (let k = 0; k < 6; k++) seam(p, cx + (r() - 0.5) * 180 * A, yb - (20 + r() * 40) * A, 5, R[0], R[3], r);
    capTop(p, pal('#4a5a32', '#6a7a42', '#8a9a5a', '#a8b46a', '#c8d088'), r, 0.3);
    return done(p, null);
  });
}
export function stoneHeadSprite(color = '#e0d8c4', crown = '#d8a040', size = 40) {
  return memo('sHead' + color + crown + size, () => {
    const S = size * A;                                         // size comes in design pixels
    const p = mk(S * 2 + 10 * A, S * 2 + 10 * A), cx = p.w / 2, cy = p.h / 2 + 4 * A, R = ramp5(color), r = S * 0.7;
    if (crown) {
      const G = ramp5(crown);
      for (let k = -3; k <= 3; k++) {
        const x = cx + k * r * 0.28, by = cy - r * 0.8, hw = r * 0.12, ty = cy - r * 1.25;
        p.poly([[x - hw, by], [x, ty], [x, by]], G[k < 1 ? 3 : 2]); p.poly([[x, by], [x, ty], [x + hw, by]], G[k < 1 ? 1 : 0]); p.set(Math.round(x), Math.round(ty), G[4]);
      }
    }
    ball(p, cx, cy, r, r * 1.12, R, 5);
    for (const sd of [-1, 1]) { p.ellipse(cx + sd * r * 0.36, cy - r * 0.15, r * 0.16, r * 0.09, R[0]); p.line(cx + sd * r * 0.2, cy - r * 0.3, cx + sd * r * 0.52, cy - r * 0.28, R[1]); }
    p.poly([[cx, cy - r * 0.2], [cx + r * 0.14, cy + r * 0.3], [cx - r * 0.1, cy + r * 0.3]], R[3]);
    p.poly([[cx + r * 0.03, cy - r * 0.15], [cx + r * 0.14, cy + r * 0.3], [cx + r * 0.02, cy + r * 0.3]], R[1]);
    p.line(cx - r * 0.2, cy + r * 0.55, cx + r * 0.2, cy + r * 0.55, R[0]);
    p.line(cx - r * 0.14, cy + r * 0.6, cx + r * 0.14, cy + r * 0.6, R[4]);
    const rr = srand(size);
    for (let k = 0; k < 3; k++) seam(p, cx + (rr() - 0.5) * r, cy - r * 0.6 + rr() * r, 5, R[0], R[3], rr);
    return done(p, null);
  });
}
// ---------------------------------------------------------------- the Elder Yew
export function yewSprite(sc = 1) {
  return memo('yew' + sc, () => {
    const W = Math.round(320 * sc * A), H = Math.round(300 * sc * A);
    const p = mk(W, H), e = mk(W, H), cx = W / 2, yb = H - 1, r = srand(31);
    const bark = pal('#1e1610', '#30241a', '#4a3a28', '#685238', '#86704e');
    // roots
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI - Math.PI; const x1 = cx + Math.cos(a) * W * 0.3, y1 = yb - 4 * A + Math.abs(Math.sin(a)) * -6 * A; limb(p, cx + Math.cos(a) * 14 * sc * A, yb - 26 * A, x1, y1, 22 * sc * A, 6 * sc * A, bark, { grain: true, seed: i }); }
    // twisted trunk: spiralling bark ridges, lit left, deep shadow right
    for (let y = Math.round(yb - H * 0.6); y <= yb - 8 * A; y++) {
      const t = (y - (yb - H * 0.6)) / (H * 0.6); const half = (22 + t * t * 26) * sc * A + Math.sin(y * 0.15 / A) * 3 * A;
      for (let x = Math.floor(cx - half); x <= cx + half; x++) {
        const u = (x - cx) / half;
        let k = u < -0.6 ? 3 : u < -0.2 ? 2 : u < 0.45 ? 2 : u < 0.8 ? 1 : 0;
        const twist = x * 0.4 / A + Math.sin(y * 0.08 / A) * 3 + y * 0.12 / A;
        const ridge = ((twist % 4) + 4) % 4;
        if (ridge < 0.8) k = Math.max(0, k - 1); else if (ridge < 1.3 && u < 0.5) k = Math.min(4, k + 1);
        if (vn(x, y, 3 * A, 5) > 0.8) k = Math.max(0, k - 1);
        p.set(x, y, bark[k]);
      }
    }
    // hollow in the trunk
    ball(p, cx + 6 * A, yb - H * 0.32, 9 * sc * A, 12 * sc * A, pal('#060404', '#0e0a08', '#1a120c', '#241a12', '#2e2216'));
    // canopy: great masses of leaf puffs
    const parts = [];
    for (let i = 0; i < 14; i++) { const a = r() * Math.PI * 2, d = r() * W * 0.28; parts.push([cx + Math.cos(a) * d * 1.3, yb - H * 0.68 + Math.sin(a) * d * 0.55, W * (0.14 + r() * 0.07), W * (0.1 + r() * 0.05)]); }
    crown(p, parts, pal('#10241a', '#1a3a20', '#2a5226', '#3e6e2e', '#64964a'), r, { clump: 9 * sc * A, aspect: 0.82, fill: true, lobes: 7 });
    // glowing motes caught in the leaves
    for (let i = 0; i < 40; i++) { const x = cx + (r() - 0.5) * W * 0.8, y = yb - H * 0.68 + (r() - 0.5) * H * 0.4; if (p.a(x, y)) { p.set(x, y, '#d0ff80'); e.set(x, y, '#d0ff80'); if (r() < 0.4) { p.set(x + 1, y, '#a0e060'); e.set(x + 1, y, alpha('#d0ff80', 140)); } } }
    return done(p, e);
  });
}
export function standingStone(i) {
  return memo('stoneC' + i, () => {
    const h = (30 + (i % 3) * 5) * A, p = mk(16 * A, h + 5 * A), e = mk(16 * A, h + 5 * A), R = ramp5('#6a6a62'), yb = p.h - 1, cx = p.w / 2;
    for (let y = Math.round(yb - h); y <= yb; y++) {
      const t = (y - (yb - h)) / h, half = (4 + t * 2 - (t < 0.1 ? (0.1 - t) * 14 : 0)) * A;
      for (let x = Math.round(cx - half); x <= cx + half; x++) {
        const u = (x - cx) / half;
        let k = u < -0.6 ? 4 : u < -0.2 ? 3 : u < 0.5 ? 2 : u < 0.85 ? 1 : 0;
        if (vn(x, y, 2.5 * A, i + 3) > 0.72) k = Math.max(0, k - 1);
        if (t < 0.04) k = Math.min(4, k + 1);
        p.set(x, y, R[k]);
      }
    }
    // carved runes glowing in a column
    for (let k = 0; k < 4; k++) {
      const y = Math.round(yb - h + (8 + k * 5) * A), x = Math.round(cx - A);
      const glyph = [[0, 0], [1, 0], [0, 1], [0, 2], [1, 2], [1, 3], [0, 4]].filter((_, j) => hash2(j, k, i) < 0.75);
      for (const [gx, gy] of glyph) { const X = x + gx * Math.round(A), Y = y + gy; p.set(X, Y, '#80ffc0'); e.set(X, Y, '#80ffc0'); p.set(X, Y + 1, R[0]); }
    }
    capTop(p, pal('#22381e', '#34522a', '#4e7036', '#6a8e42', '#90b25a'), srand(i + 1), 0.6, { drip: true });
    return done(p, e);
  });
}
// ---------------------------------------------------------------- frozen titan
export function titanSprite() {
  return memo('titan', () => {
    const p = mk(250 * A, 290 * A), e = mk(250 * A, 290 * A), cx = p.w / 2, yb = p.h - 1;
    const body = ramp5('#4a5a6a');
    // the giant: legs braced, torso, head, arms thrown up
    for (const sd of [-1, 1]) limb(p, cx + sd * 18 * A, yb - 120 * A, cx + sd * 34 * A, yb - 12 * A, 30 * A, 22 * A, body);
    ball(p, cx, yb - 160 * A, 62 * A, 56 * A, body, 4);
    for (const sd of [-1, 1]) { limb(p, cx + sd * 50 * A, yb - 190 * A, cx + sd * 78 * A, yb - 250 * A, 26 * A, 18 * A, body); ball(p, cx + sd * 80 * A, yb - 256 * A, 14 * A, 12 * A, body); }
    ball(p, cx + 4 * A, yb - 228 * A, 30 * A, 32 * A, body, 6);
    limb(p, cx + 4 * A, yb - 210 * A, cx + 4 * A, yb - 182 * A, 30 * A, 14 * A, body.map((c) => dark(c, 0.85)));   // beard
    for (const sd of [-1, 1]) { const x = Math.round(cx + (4 + sd * 11 - 2) * A), y = Math.round(yb - 234 * A); p.rect(x, y, Math.round(5 * A), Math.round(3 * A), '#80d8ff'); e.rect(x, y, Math.round(5 * A), Math.round(3 * A), '#80d8ff'); p.set(x, y, '#ffffff'); }
    // translucent faceted glacier over everything: angular facets, each lit by its own tilt, with
    // pale crisp edges where the facets meet and frost on the crown
    const F = [], fr = srand(21);
    for (let k = 0; k < 26; k++) { const a = fr() * Math.PI * 2, d = Math.sqrt(fr()); const nx = Math.cos(a) * d * 0.9 + (fr() - 0.5) * 0.5, ny = Math.sin(a) * d * 0.9 + (fr() - 0.5) * 0.5; F.push({ x: cx + Math.cos(a) * d * 118 * A, y: yb - 150 * A + Math.sin(a) * d * 142 * A, l: -0.5 * nx - 0.7 * ny + 0.5 * Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny)) }); }
    const near = (x, y) => { let b = 0, bd = 1e18; for (let k = 0; k < F.length; k++) { const dx = x - F[k].x, dy = y - F[k].y, dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; b = k; } } return b; };
    const ICE = [C('#3e6e98', 150), C('#5a8eb8', 140), C('#86b8dc', 140), C('#b4dcf2', 160), C('#e8f6ff', 180)];
    for (let y = 0; y < p.h; y++) {
      let prev = -1;
      for (let x = 0; x < p.w; x++) {
        const nx = (x - cx) / (118 * A), ny = (y - (yb - 150 * A)) / (142 * A);
        const d = nx * nx + ny * ny * 1.05;
        if (d > 1 + Math.sin(Math.atan2(ny, nx) * 7) * 0.04) { prev = -1; continue; }
        const k = near(x, y);
        let l = F[k].l * 0.8 + (-0.4 * nx - 0.5 * ny) * 0.4;
        let c = ICE[lvl(l, [0.75, 0.4, 0, -0.4])];
        if (prev >= 0 && prev !== k) c = C('#e8f6ff', 200);                                 // facet edge
        if (d > 0.93) c = C('#d8eefa', 190);                                                  // glacier rim
        p.set(x, y, c);
        if (ny < -0.8 && hash2(x, y, 3) < 0.85) p.set(x, y, ny < -0.9 ? '#ffffff' : '#e4eef6');
        prev = k;
      }
    }
    // vertical edges too (compare with the row above)
    for (let y = 1; y < p.h; y++) for (let x = 0; x < p.w; x += 1) {
      const nx = (x - cx) / (118 * A), ny = (y - (yb - 150 * A)) / (142 * A);
      if (nx * nx + ny * ny * 1.05 > 0.9 || ny < -0.8) continue;
      if (hash2(x, y, 9) < 0.5 && near(x, y) !== near(x, y - 1)) p.set(x, y, C('#e8f6ff', 200));
    }
    return done(p, e);
  });
}
// ---------------------------------------------------------------- dwarf gate (cliff + statues)
export function dwarfCliff() {
  return memo('dwCliff', () => {
    const W = Math.round(600 * A), Hh = Math.round(220 * A);
    const p = mk(W, Hh), e = mk(W, Hh), yb = p.h - 1;
    const R = ramp5('#5a6470');
    for (let x = 0; x < W; x++) {
      const X = x / A;
      const top = (30 + Math.sin(X * 0.03) * 14 + Math.sin(X * 0.11) * 6 + vn(x, 0, 3 * A, 2) * 4) * A;
      const snow = (6 + vn(x, 1, 5 * A, 3) * 5) * A;
      for (let y = Math.round(top); y <= yb; y++) {
        const Y = y / A;
        const strata = Math.floor((Y + Math.sin(X * 0.05) * 4) / 9);
        const sy = ((Y + Math.sin(X * 0.05) * 4) % 9 + 9) % 9;
        let k = strata % 3 === 0 ? 1 : strata % 3 === 1 ? 2 : 3;
        if (sy < 0.8) k = Math.min(4, k + 1);                   // lit lip of each layer
        else if (sy > 8.2) k = 0;                               // shadowed seam under it
        // the odd vertical fracture through a layer, irregularly spaced, and weathered patches
        const L = 31 + (strata * 17 % 23), jx = Math.floor((X + strata * 13) / L);
        if (((X + strata * 13) % L + L) % L < 0.7 && hash2(jx, strata, 4) < 0.45) k = Math.max(0, k - 2);
        const wv = vn(x, y, 5 * A, 7);
        if (wv > 0.74) k = Math.max(0, k - 1); else if (wv < 0.2 && k < 4) k++;
        let c = R[k];
        const dy = y - top;
        if (dy < snow) c = dy < snow - 2 * A ? (dy < 1 ? C('#ffffff') : C('#eef2f8')) : C('#c8d4e4');
        p.set(x, y, c);
      }
    }
    // icicles under the snow line
    for (let x = 0; x < W; x += Math.round(3 * A)) { if (hash2(x, 5, 1) > 0.35) continue; const X = x / A, top = (30 + Math.sin(X * 0.03) * 14 + Math.sin(X * 0.11) * 6 + vn(x, 0, 3 * A, 2) * 4) * A + (6 + vn(x, 1, 5 * A, 3) * 5) * A; const L = Math.round((2 + hash2(x, 6, 1) * 5) * A); for (let k = 0; k < L; k++) p.set(x, Math.round(top + k), k > L - 2 ? '#ffffff' : '#a8c8e0'); }
    // the great doors: a carved surround, banded doors, a seam of light where they part
    const cx = Math.round(W / 2), S = ramp5('#6a6058'), r0 = 52 * A, dh = 150 * A;
    for (let y = Math.round(yb - dh); y <= yb; y++) for (let x = Math.round(cx - r0 - 6 * A); x <= cx + r0 + 6 * A; x++) {
      const ly = y - (yb - dh), dy = Math.max(0, r0 - ly), lim = Math.sqrt(Math.max(0, r0 * r0 - dy * dy)) + 6 * A;
      if (Math.abs(x - cx) > lim) continue;
      const edge = lim - Math.abs(x - cx);
      let k = x < cx ? 3 : 1;
      if (edge < 1.2) k = x < cx ? 4 : 0;
      if (Math.round(ly) % Math.round(8 * A) === 0) k = Math.max(0, k - 1);
      p.set(x, y, S[k]);
    }
    const dw = Math.round(86 * A), dhh = Math.round(134 * A), dx0 = cx - dw / 2;
    const Wd = ramp5('#3a3028');
    for (let y = yb - dhh + 1; y <= yb; y++) for (let i = 0; i < dw; i++) {
      const ly = y - (yb - dhh + 1), ccx = (dw - 1) / 2, rr = dw / 2, dy = Math.max(0, rr - ly);
      if (Math.abs(i - ccx) > Math.sqrt(Math.max(0, rr * rr - dy * dy)) + 0.2) continue;
      const pl = i % Math.round(5 * A);
      p.set(dx0 + i, y, Wd[pl === 0 ? 0 : pl === 1 ? 3 : i < dw / 2 ? 2 : 1]);
    }
    const Br = ramp5('#a07a40');
    for (const yy of [30, 70, 110]) for (let k = 0; k < Math.round(4 * A); k++) for (let i = 0; i < dw; i++) {
      const y = Math.round(yb - yy * A) + k;
      if (p.a(dx0 + i, y) < 200) continue;
      p.set(dx0 + i, y, Br[k === 0 ? 4 : k === Math.round(4 * A) - 1 ? 0 : 2]);
      if (k === 1 && i % Math.round(8 * A) === 3) p.set(dx0 + i, y, Br[4]);                  // rivets
    }
    for (let y = yb - dhh; y <= yb; y++) { p.set(cx, y, '#1a1410'); p.set(cx - 1, y, '#0e0a08'); if (y > yb - dhh * 0.7 && hash2(y, 1, 3) < 0.5) { p.set(cx, y, '#ffb050'); e.set(cx, y, alpha('#ff9030', 200)); } }
    for (const sd of [-1, 1]) lantern(e, p, Math.round(cx + sd * 30 * A - 2 * A), Math.round(yb - 70 * A), Math.round(4 * A), Math.round(10 * A), '#ffa040');
    return done(p, e);
  });
}
export function kingStatue() {
  return memo('kingStatue', () => {
    const p = mk(60 * A, 230 * A), e = mk(60 * A, 230 * A), cx = p.w / 2, yb = p.h - 1, R = ramp5('#7a7068'), r = srand(8);
    masonry(p, cx - 20 * A, yb - 140 * A, 40 * A, 140 * A, '#7a7068', { seed: 5, bh: Math.round(6 * A), bw: Math.round(12 * A) });
    // plinth cornice
    for (let y = Math.round(yb - 146 * A); y < yb - 138 * A; y++) for (let x = Math.round(cx - 24 * A); x < cx + 24 * A; x++) { const ly = y - (yb - 146 * A); p.set(x, y, R[ly < 1 ? 4 : ly < 3 * A ? 3 : ly > 6 * A ? 0 : 2]); }
    // head, stone beard with braids, glowing eyes, crown
    ball(p, cx, yb - 172 * A, 22 * A, 26 * A, R, 4);
    limb(p, cx, yb - 162 * A, cx, yb - 140 * A, 34 * A, 14 * A, ramp5('#6a6058'));
    for (const bx of [-8, 0, 8]) for (let y = Math.round(yb - 158 * A); y < yb - 140 * A; y += Math.round(3 * A)) { p.set(Math.round(cx + bx * A * (1 - (y - (yb - 158 * A)) / (40 * A))), y, R[0]); p.set(Math.round(cx + bx * A * (1 - (y - (yb - 158 * A)) / (40 * A))) - 1, y - 1, R[3]); }
    p.line(cx - 12 * A, yb - 180 * A, cx - 3 * A, yb - 179 * A, R[0]); p.line(cx + 3 * A, yb - 179 * A, cx + 12 * A, yb - 180 * A, R[0]);
    for (const sd of [-1, 1]) { const x = Math.round(cx + (sd * 8 - 2) * A), y = Math.round(yb - 176 * A); p.rect(x, y, Math.round(4 * A), Math.round(2 * A), '#ffa040'); e.rect(x, y, Math.round(4 * A), Math.round(2 * A), '#ffa040'); p.set(x, y, '#fff0c0'); }
    const G = ramp5('#a08040');
    for (let k = -2; k <= 2; k++) { const x = cx + k * 8 * A; p.poly([[x - 4 * A, yb - 194 * A], [x, yb - 206 * A], [x, yb - 194 * A]], G[3]); p.poly([[x, yb - 194 * A], [x, yb - 206 * A], [x + 4 * A, yb - 194 * A]], G[1]); }
    for (let y = Math.round(yb - 196 * A); y < yb - 192 * A; y++) for (let x = Math.round(cx - 20 * A); x < cx + 20 * A; x++) p.set(x, y, G[y === Math.round(yb - 196 * A) ? 4 : 2]);
    for (let x = Math.round(cx - 24 * A); x < cx + 24 * A; x++) if (vn(x, 3, 2 * A, 1) < 0.7) { p.set(x, Math.round(yb - 147 * A), '#eef2f8'); p.set(x, Math.round(yb - 148 * A), '#ffffff'); }
    for (let k = 0; k < 4; k++) seam(p, cx + (r() - 0.5) * 30 * A, yb - (20 + r() * 110) * A, 6, R[0], null, r);
    return done(p, e);
  });
}
// ---------------------------------------------------------------- coast
export function wreckSprite(seed) {
  return memo('wreck' + seed, () => {
    const p = mk(190 * A, 90 * A), r = srand(seed), cx = p.w / 2, yb = p.h - 1, wood = ramp5('#4a3424');
    const tilt = (r() - 0.5) * 0.3, hole0 = 30 * A, hole1 = 52 * A;
    for (let x = Math.round(-85 * A); x <= 85 * A; x++) {
      const t = Math.abs(x) / (85 * A);
      const h = 34 * A * Math.sqrt(1 - t * t);
      const y0 = yb - 14 * A + x * tilt;
      for (let y = Math.round(y0 - h); y <= y0; y++) {
        const ly = y0 - y;
        const plank = Math.floor(ly / (4 * A));
        const seamRow = (ly % (4 * A)) < 1;
        let k = ly > h - 3 * A ? 3 : plank % 2 ? 2 : 1;
        if (ly > h - 1) k = 4;
        if (seamRow) k = 0;
        if (Math.round(x + plank * 7 * A) % Math.round(26 * A) === 0) k = 0;              // butt joints
        if (k > 0 && vn(x, y, 3 * A, seed) > 0.78) k--;                                      // rot
        let c = wood[k];
        if (x > hole0 && x < hole1 && ly < h * 0.6 + Math.sin(x * 0.5 / A) * 2 * A) c = ly > h * 0.6 - 1.2 ? wood[0] : C('#0e0a08');
        if (ly < 6 * A && hash2(x, y, seed) < 0.3) c = C(hash2(x, 1, seed) < 0.5 ? '#2a4a34' : '#3a6a40');   // weed at the waterline
        p.set(cx + x, y, c);
      }
    }
    // ribs showing through the hole
    for (let x = hole0 + 3 * A; x < hole1; x += 6 * A) p.line(cx + x, yb - 14 * A + x * tilt, cx + x + 1, yb - 14 * A + x * tilt - 18 * A, wood[3]);
    const mx = cx - 10 * A, my = yb - 40 * A, tx = mx + (r() * 40 - 20) * A, ty = yb - 86 * A;
    limb(p, mx, my, tx, ty, 3.4 * A, 2.2 * A, wood);
    p.line(tx, ty + 8 * A, tx + 12 * A, ty + 26 * A, '#2a2018');                               // a frayed stay
    return done(p, null);
  });
}
export function lighthouseSprite() {
  return memo('lighthouse', () => {
    const p = mk(90 * A, 230 * A), e = mk(90 * A, 230 * A), cx = p.w / 2, yb = p.h - 1, r = srand(70);
    boulder(p, cx, yb - 14 * A, 42 * A, 16 * A, ramp5('#4a4e52'), r, { bump: 0.22, facets: 9 });
    const tw = ramp5('#e8e0d0'), red = ramp5('#a02a20');
    for (let y = Math.round(yb - 170 * A); y <= yb - 22 * A; y++) {
      const t = (y - (yb - 170 * A)) / (148 * A), half = (16 + t * 8) * A;
      const band = Math.floor((y - (yb - 170 * A)) / (22 * A)) % 2 === 1;
      for (let x = Math.round(cx - half); x <= cx + half; x++) {
        const u = (x - cx) / half, R = band ? red : tw;
        let k = u < -0.7 ? 4 : u < -0.35 ? 3 : u < 0.4 ? 2 : u < 0.8 ? 1 : 0;
        if (Math.round(y - (yb - 170 * A)) % Math.round(5 * A) === 0) k = Math.max(0, k - 1);   // stone courses
        p.set(x, y, R[k]);
      }
    }
    // door, slit windows lit at night
    const D = ramp5('#3a2a1c');
    for (let y = Math.round(yb - 38 * A); y <= yb - 22 * A; y++) for (let x = Math.round(cx - 5 * A); x < cx + 5 * A; x++) { const ly = y - (yb - 38 * A), dy = Math.max(0, 5 * A - ly); if (Math.abs(x + 0.5 - cx) > Math.sqrt(Math.max(0, 25 * A * A - dy * dy))) continue; p.set(x, y, D[Math.round(x - cx) % 3 === 0 ? 0 : x < cx ? 3 : 2]); }
    for (let k = 0; k < 3; k++) { const x = Math.round(cx + (k % 2 ? 4 : -6) * A), y = Math.round(yb - (60 + k * 34) * A); p.rect(x - 1, y - 1, Math.round(3 * A) + 2, Math.round(5 * A) + 2, '#5a4a3a'); p.rect(x, y, Math.round(3 * A), Math.round(5 * A), '#2a3442'); e.rect(x, y, Math.round(3 * A), Math.round(5 * A), '#ffc070'); }
    // gallery with railings, lantern room, cap
    p.rect(Math.round(cx - 22 * A), Math.round(yb - 176 * A), Math.round(44 * A), Math.round(6 * A), '#2a2a2a'); p.rect(Math.round(cx - 22 * A), Math.round(yb - 176 * A), Math.round(44 * A), 1, '#5a5a5a');
    for (let x = Math.round(cx - 22 * A); x <= cx + 22 * A; x += Math.round(3 * A)) p.rect(x, Math.round(yb - 184 * A), 1, Math.round(8 * A), '#2a2a2a');
    p.rect(Math.round(cx - 22 * A), Math.round(yb - 184 * A), Math.round(44 * A), 1, '#3a3a3a');
    const lx = Math.round(cx - 12 * A), ly = Math.round(yb - 200 * A), lw = Math.round(24 * A), lh = Math.round(24 * A);
    for (let y = ly; y < ly + lh; y++) for (let x = lx; x < lx + lw; x++) { const c = mixc('#fff4c8', '#ffd080', (y - ly) / lh); p.set(x, y, c); e.set(x, y, c); }
    for (const x of [cx - 12 * A, cx - 4 * A, cx + 4 * A, cx + 11 * A]) p.rect(Math.round(x), ly, 1, lh, '#2a2a2a');
    for (let y = Math.round(yb - 222 * A); y <= ly; y++) { const t = (y - (yb - 222 * A)) / (22 * A); const half = (3 + t * 16) * A; for (let x = Math.round(cx - half); x < cx + half; x++) p.set(x, y, t > 0.85 ? '#2a2a2a' : x < cx - half * 0.4 ? '#5a5a5a' : '#3a3a3a'); }
    return done(p, e, { lampAt: [0, -Math.round(188 * A)] });
  });
}
export function skullSprite() {
  return memo('skull', () => {
    const p = mk(8 * A, 7 * A), B = pal('#6a5e50', '#a89c86', '#d0c6b0', '#e8e0cc', '#fff8e8');
    ball(p, 4 * A, 3 * A, 3.3 * A, 3 * A, B);
    for (const x of [2, 5]) { p.ellipse((x + 0.6) * A, 3.6 * A, 1 * A, 0.9 * A, '#1a1010'); }
    p.set(Math.round(4 * A), Math.round(5 * A), '#3a2a20');
    p.rect(Math.round(3 * A), Math.round(6 * A) - 1, Math.round(3 * A), 1, B[1]);
    return done(p, null);
  });
}
