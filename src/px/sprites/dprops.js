// Dungeon dressing sprites (barrels, crates, coffins, urns, candles, anvils, carts, nests, gold)
// plus chests, wall torches, glow bulbs and the dungeon tile set (floor slabs, wall tops and wall
// faces per theme). Drawn natively at PPU (ap() for design-pixel geometry, 1-px details at 1 px).
//
// Style (docs/ART_STYLE.md): colours come from the master ramps (wood, steel, gold, ember, bone
// cream); props are shaded in flat bands lit from the upper left and get the ink outline; tiles
// are big flat clusters with stepped edges and no per-pixel noise. Shadows lean plum.
import { Pix, C, ap, light, dark, mixc, hash2, srand } from '../pix.js';
import { RAMPS, INK, INK_SOFT, CREAM, CREAM_HI } from '../palette.js';
import { ramp } from './props.js';
import { memo, mk, done, fillWall, stoneMass, R5 } from './buildings.js';

const P = RAMPS;
const WOOD = P.wood.map((c) => C(c)), GOLD = P.gold.map((c) => C(c)), EMBER = P.ember.map((c) => C(c));
const IRON = R5('#3a3440'), BONE = R5('#e2d2b0');

// 4-tone ball lit from the top-left
function ball(p, cx, cy, rx, ry, R) {
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
    const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
    if (nx * nx + ny * ny > 1) continue;
    const l = -0.5 * nx - 0.8 * ny + 0.2;
    p.set(x, y, R[l > 0.6 ? 3 : l > -0.1 ? 2 : l > -0.6 ? 1 : 0]);
  }
}
// a bone: shaft with knobbly ends
function bone(p, x0, y0, x1, y1) {
  const L = BONE;
  p.line(x0, y0, x1, y1, L[1], 2); p.line(x0, y0 - 1, x1, y1 - 1, L[3]);
  for (const [x, y] of [[x0, y0], [x1, y1]]) { p.disc(x - 1, y - 0.5, 1.4, L[2]); p.disc(x + 1, y + 0.5, 1.4, L[2]); p.set(Math.round(x) - 1, Math.round(y) - 1, L[4]); }
}

export function dpropSprite(type, seed = 0) {
  return memo('dp' + type + seed, () => {
    const r = srand(seed * 13 + type.length);
    switch (type) {
      case 'barrel': {
        const W = ap(14), H = ap(18), p = mk(W, H), w = R5(P.wood[3]), cx = W / 2;
        const top = ap(3), bot = H - 2;
        for (let y = top; y <= bot; y++) {
          const t = (y - top) / (bot - top), half = ap(5) + Math.sin(t * Math.PI) * ap(1.5);
          for (let x = Math.floor(cx - half); x <= cx + half; x++) {
            const u = (x + 0.5 - cx) / half;
            if (Math.abs(u) > 1) continue;
            let k = u < -0.55 ? 3 : u < 0.1 ? 2 : u < 0.6 ? 1 : 0;
            const st = Math.floor((Math.asin(u) / Math.PI + 0.5) * 7), stl = Math.floor((Math.asin(Math.max(-1, (x - 0.5 - cx) / half)) / Math.PI + 0.5) * 7);
            if (st !== stl) k = Math.max(0, k - 1);
            let col = w[k];
            for (const ht of [0.16, 0.8]) { const hy = top + Math.round(ht * (bot - top)); if (y === hy) col = u < -0.3 ? IRON[3] : IRON[1]; if (y === hy + 1) col = IRON[0]; }
            p.set(x, y, col);
          }
        }
        p.ellipse(cx, top + 0.5, ap(5) + 0.4, ap(2), w[0]); p.ellipse(cx, top + 0.5, ap(4), ap(1.4), w[2]);
        for (let x = Math.round(cx - ap(4)) + 2; x < cx + ap(4); x += 3) p.line(x, top - 1, x, top + 2, w[1]);
        p.set(Math.round(cx) - 3, top - 1, w[4]);
        return done(p, null);
      }
      case 'crate': {
        const W = ap(16), H = ap(18), p = mk(W, H), w = C(P.wood[4]), R = R5(w);
        const tH = ap(5), x0 = 1, fw = W - 2;
        fillWall(p, x0, 1, fw, tH, R[3], 'plank', seed + 1);
        fillWall(p, x0, 1 + tH, fw, H - tH - 2, w, 'plank', seed);
        // frame boards, brace and nails on the front face
        const fy = 1 + tH, fh = H - tH - 2, fr = R[1];
        p.rect(x0, fy, fw, 2, fr); p.rect(x0, fy + fh - 2, fw, 2, fr); p.rect(x0, fy, 2, fh, fr); p.rect(x0 + fw - 2, fy, 2, fh, fr);
        p.rect(x0, fy, fw, 1, R[3]); p.rect(x0, fy, 1, fh, R[3]);
        p.line(x0 + 2, fy + fh - 3, x0 + fw - 3, fy + 2, fr, 2); p.line(x0 + 2, fy + fh - 4, x0 + fw - 4, fy + 2, R[3]);
        for (const [nx, ny] of [[x0 + 1, fy + 1], [x0 + fw - 2, fy + 1], [x0 + 1, fy + fh - 2], [x0 + fw - 2, fy + fh - 2]]) p.set(nx, ny, IRON[1]);
        p.rect(x0, 1, fw, 1, R[4]); p.rect(x0, tH, fw, 1, R[0]);
        return done(p, null);
      }
      case 'coffin': {
        const W = ap(16), H = ap(26), p = mk(W, H), w = R5(P.wood[2]);
        const pts = [[ap(4), 2], [W - ap(4), 2], [W - 1, ap(8)], [W - ap(4), H - 2], [ap(4), H - 2], [1, ap(8)]];
        p.poly(pts, w[1]);
        p.poly([[ap(4) + 1, 3], [W - ap(4) - 1, 3], [W - 3, ap(8)], [W - ap(4) - 1, H - 4], [ap(4) + 1, H - 4], [3, ap(8)]], w[2]);
        p.poly([[ap(4) + 1, 3], [W / 2, 3], [W / 2, H - 4], [ap(4) + 1, H - 4], [3, ap(8)]], w[3]);
        // lid boards: seams every few rows on the lit half
        for (let y = 5; y < H - 4; y += ap(4)) for (let x = 3; x < W / 2; x++) if (p.get(x, y)?.[0] === w[3][0]) p.set(x, y, w[2]);
        const cx = Math.floor(W / 2);
        p.rect(cx - 1, ap(6), 2, ap(11), GOLD[3]); p.rect(cx - ap(3), ap(9), ap(6), 2, GOLD[3]); p.set(cx - 1, ap(6), GOLD[5]); p.rect(cx, ap(6) + 1, 1, ap(11) - 1, GOLD[2]);
        p.line(2, ap(8), W - 3, ap(8), w[0]);
        return done(p, null);
      }
      case 'urn': {
        const W = ap(12), H = ap(16), p = mk(W, H), u = ramp(r() < 0.5 ? P.clay[3] : P.stone[4]), cx = W / 2;
        ball(p, cx, H - ap(6), ap(5), ap(5), u);
        p.rect(Math.round(cx - ap(2)), ap(2), ap(4), ap(4), u[2]); p.rect(Math.round(cx - ap(2)), ap(2), 2, ap(4), u[3]); p.rect(Math.round(cx + ap(2)) - 1, ap(2), 1, ap(4), u[1]);
        p.rect(Math.round(cx - ap(3)), 1, ap(6), ap(1.5), u[3]); p.rect(Math.round(cx - ap(3)), 1 + ap(1.5), ap(6), 1, u[0]);
        for (const sd of [-1, 1]) { const hx = Math.round(cx + sd * ap(3.4)); p.line(hx, ap(3), hx + sd, ap(6), u[1]); p.set(hx + sd, ap(6) + 1, u[1]); }
        const by = H - ap(6);
        for (let x = 0; x < W; x++) if (p.a(x, by)) { p.set(x, by, u[0]); p.set(x, by + 2, u[0]); if (x % 3 === 0) p.set(x, by + 1, GOLD[4]); }
        return done(p, null);
      }
      case 'candles': {
        const W = ap(16), H = ap(12), p = mk(W, H), e = mk(W, H), WX = BONE;
        p.ellipse(W / 2, H - 2, W / 2 - 1, 1.6, WX[1]);
        for (const [x, h] of [[ap(3), ap(6)], [ap(7), ap(9)], [ap(11), ap(5)], [ap(9), ap(4)]]) {
          p.rect(x, H - 2 - h, 3, h, WX[2]); p.rect(x, H - 2 - h, 1, h, WX[4]); p.rect(x + 2, H - 2 - h, 1, h, WX[1]);
          p.set(x + 2, H - 1 - h + ap(2), WX[2]); p.set(x - 1, H - 2 - h + 2, WX[2]);
          p.set(x + 1, H - 3 - h, INK_SOFT);
          for (const [fx, fy, c] of [[x + 1, H - 4 - h, EMBER[5]], [x + 1, H - 5 - h, EMBER[4]], [x + 1, H - 6 - h, EMBER[3]]]) { p.set(fx, fy, c); e.set(fx, fy, c); }
        }
        return done(p, e);
      }
      case 'anvil': {
        const W = ap(18), H = ap(14), p = mk(W, H), m = R5(P.steel[2]);
        p.rect(ap(6), ap(7), ap(6), ap(5), m[1]); p.rect(ap(6), ap(7), 2, ap(5), m[2]);
        p.rect(ap(4), H - ap(2) - 1, ap(10), ap(2), m[0]); p.rect(ap(4), H - ap(2) - 1, ap(10), 1, m[1]);
        p.rect(2, ap(3), ap(13), ap(4), m[2]); p.rect(2, ap(3), ap(13), 1, m[3]); p.rect(2, ap(3) + ap(4) - 1, ap(13), 1, m[0]);
        p.poly([[2 + ap(13), ap(3)], [W - 1, ap(3) + 2], [W - 1, ap(3) + 3], [2 + ap(13), ap(3) + ap(4) - 1]], m[2]); p.set(W - 2, ap(3) + 2, m[3]);
        p.rect(ap(5), ap(3) + 1, 2, 1, m[0]); p.rect(4, ap(3), ap(6), 1, m[4]);
        return done(p, null);
      }
      case 'anchor': {
        const W = ap(18), H = ap(24), p = mk(W, H), m = R5(P.steel[1]), cx = Math.floor(W / 2), RU = R5(P.clay[2]);
        for (let a = 0.15; a <= Math.PI - 0.15; a += 0.04) { const x = cx + Math.cos(a) * ap(7), y = ap(16) + Math.sin(a) * ap(5); p.rect(Math.round(x) - 1, Math.round(y) - 1, 3, 3, m[1]); p.set(x, y - 1, m[3]); }
        for (const sd of [-1, 1]) p.poly([[cx + sd * ap(7), ap(16) - 1], [cx + sd * (ap(7) + 3), ap(16) - 4], [cx + sd * (ap(7) + 1), ap(16) + 2]], m[2]);
        p.rect(cx - 1, ap(3), 3, ap(18), m[2]); p.rect(cx - 1, ap(3), 1, ap(18), m[3]); p.rect(cx + 1, ap(3), 1, ap(18), m[0]);
        p.ring(cx + 0.5, ap(2), ap(2), m[2], 2); p.set(cx - 2, 1, m[3]);
        p.rect(cx - ap(5), ap(6), ap(10) + 1, 2, m[2]); p.rect(cx - ap(5), ap(6), ap(10) + 1, 1, m[3]);
        // rust in 2-px patches
        for (let k = 0; k < 6; k++) { const x = Math.floor(r() * W), y = Math.floor(r() * H); if (p.a(x, y) && p.a(x + 1, y)) { p.set(x, y, RU[2]); p.set(x + 1, y, RU[1]); } }
        return done(p, null);
      }
      case 'minecart': {
        const W = ap(22), H = ap(18), p = mk(W, H), w = R5(P.wood[3]);
        const t = ap(4), b = ap(14);
        p.poly([[1, t], [W - 1, t], [W - 3, b], [3, b]], w[2]);
        p.poly([[1, t], [W / 2, t], [W / 2, b], [3, b]], w[3]);
        for (let y = t + 3; y < b; y += 3) p.line(2, y, W - 3, y, w[1]);
        p.rect(1, t, W - 2, 2, w[1]); p.rect(1, t, W - 2, 1, w[4]);
        for (const x of [2, W - 4]) for (let y = t + 2; y < b; y += 3) p.set(x + 1, y, IRON[3]);
        stoneMass(p, W / 2, t, ap(7), ap(3), P.stone[3], seed + 3, { facet: ap(2), cracks: 0, flatBase: 0.2 });
        for (let k = 0; k < 5; k++) { const x = Math.round(W / 2 + (r() - 0.5) * ap(10)), y = Math.round(t - r() * ap(2)); if (p.a(x, y)) { p.set(x, y, GOLD[4]); p.set(x + 1, y, GOLD[3]); } }
        for (const x of [ap(5), W - ap(5)]) { p.disc(x, b + 1, ap(2.4), IRON[0]); p.disc(x, b + 1, ap(2.4) - 1.5, IRON[2]); p.set(x, b + 1, IRON[4]); p.set(x - 1, b, IRON[3]); }
        return done(p, null);
      }
      case 'nest': {
        const W = ap(24), H = ap(12), p = mk(W, H), n = R5(P.wood[4]), cx = W / 2, cy = H - ap(5);
        p.ellipse(cx, cy, ap(11), ap(4.5), n[1]); p.ellipse(cx, cy - 1, ap(8), ap(3), n[0]);
        for (let k = 0; k < 40; k++) { const a = r() * Math.PI * 2; const r0 = 0.62 + r() * 0.2; p.line(cx + Math.cos(a) * ap(11) * r0, cy + Math.sin(a) * ap(4.5) * r0, cx + Math.cos(a + 0.5) * ap(11), cy + Math.sin(a + 0.5) * ap(4.5), n[k % 3 === 0 ? 3 : 2]); }
        for (const x of [-ap(3), 0, ap(3)]) { ball(p, cx + x, cy - ap(1.5), ap(2), ap(2.4), [BONE[1], BONE[2], BONE[3], BONE[4]]); p.set(Math.round(cx + x + 1), Math.round(cy - 1), BONE[0]); }
        return done(p, null);
      }
      case 'shell': {
        const W = ap(14), H = ap(10), p = mk(W, H), s = R5('#d8a29c'), cx = W / 2, by = H - 2;
        for (let y = 1; y <= by; y++) for (let x = 0; x < W; x++) {
          const nx = (x + 0.5 - cx) / (W / 2 - 1), ny = (by - y) / (by - 1);
          if (nx * nx + ny * ny > 1) continue;
          const a = Math.atan2(ny, nx), rib = Math.abs(Math.sin(a * 7));
          p.set(x, y, s[rib < 0.25 ? 1 : nx < -0.2 ? 3 : 2]);
        }
        p.rect(Math.round(cx) - 2, by, 5, 2, s[1]); p.set(Math.round(cx) - 2, by, s[3]);
        return done(p, null);
      }
      case 'gold_pile': {
        const W = ap(26), H = ap(14), p = mk(W, H), e = mk(W, H), g = [GOLD[2], GOLD[3], GOLD[4], GOLD[5]];
        // a heap of overlapping coins, lit from the top-left
        const cx = W / 2, cy = H - ap(4), rx = ap(12), ry = ap(5);
        for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = 0; x < W; x++) {
          const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
          if (nx * nx + ny * ny > 1) continue;
          const l = -0.5 * nx - 0.8 * ny + 0.2, row = y >> 1, cxx = (x + (row % 2 ? 2 : 0)) % 4;
          let idx = l > 0.6 ? 3 : l > -0.1 ? 2 : l > -0.6 ? 1 : 0;
          if (cxx === 0 || (y % 2 === 1 && cxx === 3)) idx = Math.max(0, idx - 1);
          p.set(x, y, g[idx]);
        }
        // glints: a few cream crosses (also on the emissive layer so loot sparkles in the dark)
        for (let k = 0; k < 7; k++) { const x = Math.round(3 + r() * (W - 6)), y = Math.round(cy - ry + 2 + r() * ry * 1.4); if (p.a(x, y)) { p.set(x, y, CREAM_HI); e.set(x, y, GOLD[5]); if (k % 2 === 0) { p.set(x - 1, y, GOLD[5]); p.set(x + 1, y, GOLD[5]); } } }
        // a goblet and a gem
        const gx = Math.round(W * 0.68), gy = ap(3);
        p.rect(gx, gy, ap(3), ap(3), GOLD[3]); p.rect(gx, gy, 1, ap(3), GOLD[5]); p.rect(gx + 1, gy + ap(3), 1, 2, GOLD[2]); p.rect(gx - 1, gy + ap(3) + 2, ap(3) + 2, 1, GOLD[2]);
        const GM = R5(P.rose[2]);
        p.rect(Math.round(W * 0.3), ap(5), 3, 3, GM[2]); p.set(Math.round(W * 0.3), ap(5), GM[4]); p.set(Math.round(W * 0.3) + 2, ap(5) + 2, GM[0]); e.set(Math.round(W * 0.3), ap(5), GM[4]);
        return done(p, e);
      }
      case 'bones': {
        const W = ap(18), H = ap(10), p = mk(W, H);
        for (let k = 0; k < 4; k++) { const x = 3 + r() * (W - ap(10)), y = ap(4) + r() * ap(4); bone(p, x, y, x + ap(6), y + (r() - 0.5) * ap(3)); }
        const sx = ap(6), sy = ap(5);
        p.ellipse(sx, sy, ap(2.4), ap(2), BONE[2]); p.rect(sx - 2, sy + 1, 4, 2, BONE[1]); p.set(sx - 2, sy - 2, BONE[4]);
        p.rect(sx - 2, sy - 1, 2, 2, INK); p.rect(sx + 1, sy - 1, 2, 2, INK); p.set(sx, sy + 1, BONE[0]);
        return done(p, null);
      }
      case 'campfire': {
        const W = ap(18), H = ap(10), p = mk(W, H), e = mk(W, H), cx = W / 2, cy = H - ap(4);
        for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; ball(p, cx + Math.cos(a) * ap(8), cy + Math.sin(a) * ap(3.2), ap(1.5), ap(1.2), ramp(P.stone[3])); }
        p.ellipse(cx, cy, ap(5.5), ap(2), INK_SOFT);
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2 + 0.3, x0 = cx + Math.cos(a) * ap(6), y0 = cy + Math.sin(a) * ap(2.4);
          p.line(x0, y0, cx, cy - 1, WOOD[1], 3); p.line(x0, y0 - 1, cx, cy - 2, WOOD[3]);
          p.disc(x0, y0, 1.6, P.sand[3]); p.set(Math.round(x0), Math.round(y0), WOOD[4]);
        }
        // embers in the ash: small hot clusters
        for (let k = 0; k < 5; k++) { const x = Math.round(cx + (r() - 0.5) * ap(6)), y = Math.round(cy + (r() - 0.5) * ap(2)); p.set(x, y, EMBER[3]); p.set(x + 1, y, EMBER[2]); e.set(x, y, EMBER[4]); e.set(x + 1, y, EMBER[3]); }
        return done(p, e, { fireAt: [0, -ap(4)] });
      }
      case 'tent': {
        const W = ap(36), H = ap(28), p = mk(W, H), c = R5('#8a6a58');
        const apx = W / 2, top = 2, by = H - 2;
        p.line(1, by, apx - ap(6), top + ap(10), P.sand[2]); p.line(W - 2, by, apx + ap(6), top + ap(10), P.sand[2]);
        p.poly([[ap(2), by], [apx, top], [W - ap(2), by]], c[1]);
        p.poly([[ap(2), by], [apx, top], [apx - ap(5), by]], c[3]);
        p.poly([[apx - ap(5), by], [apx, top], [apx + ap(2), by]], c[2]);
        for (let k = 1; k < 4; k++) p.line(apx, top, ap(2) + (k / 4) * (W - ap(4)), by, c[1]);
        p.poly([[apx - ap(4), by], [apx, top + ap(12)], [apx + ap(4), by]], INK);
        p.poly([[apx, top + ap(12)], [apx + ap(5), by], [apx + ap(3), by]], c[3]);
        p.rect(Math.round(apx) - 1, top - ap(3), 2, ap(4), WOOD[2]);
        p.rect(ap(2), by, W - ap(4), 1, c[0]);
        return done(p, null);
      }
      default: return null;
    }
  });
}

export function chestSprite(open, boss) {
  return memo('chest' + open + boss, () => {
    const S = ap(18), p = mk(S, S), e = mk(S, S);
    const w4 = R5(boss ? P.plum[3] : P.wood[3]), w = [w4[0], w4[1], w4[2], w4[3]];
    const BD = boss ? R5(P.gold[4]) : R5(P.steel[3]), band = BD[2], bandL = BD[4], bandD = BD[0];
    const x0 = ap(2), x1 = S - ap(2) - 1, bw = x1 - x0 + 1;
    const lidTop = ap(4), lidBot = ap(8), bodyBot = S - 2;
    const bandXs = [x0 + ap(3), x1 - ap(3) - 1];
    // body: horizontal boards, lit left / shaded right
    for (let y = lidBot; y <= bodyBot; y++) for (let x = x0; x <= x1; x++) {
      const u = (x - x0) / (bw - 1);
      let k = u < 0.12 ? 3 : u > 0.88 ? 1 : 2;
      if ((y - lidBot) % 4 === 3) k = 0; else if ((y - lidBot) % 4 === 0 && k < 3) k++;
      p.set(x, y, w[k]);
    }
    for (const bx of bandXs) for (let y = lidBot; y <= bodyBot; y++) { p.set(bx, y, bandL); p.set(bx + 1, y, band); if ((y - lidBot) % 4 === 2) p.set(bx + 1, y, bandD); }
    p.rect(x0, bodyBot, bw, 1, w[0]);
    for (const [cx, sd] of [[x0, 1], [x1, -1]]) { p.rect(sd > 0 ? cx : cx - 2, bodyBot - 2, 3, 3, band); p.set(cx, bodyBot - 2, bandL); }
    const A = P.aether;
    if (open) {
      // lid swung up behind, inside facing us
      for (let y = 1; y < lidTop + 3; y++) for (let x = x0; x <= x1; x++) p.set(x, y, (y % 3 === 0) ? w[0] : w[1]);
      p.rect(x0, 1, bw, 1, w[2]);
      for (const bx of bandXs) p.rect(bx, 1, 2, lidTop + 2, bandD);
      // the treasure inside
      p.rect(x0 + 1, lidTop + 3, bw - 2, lidBot - lidTop - 2, INK);
      for (let x = x0 + 2; x < x1 - 1; x++) { const h = 1 + Math.floor(hash2(x >> 1, 1, 5) * 3); for (let k = 0; k < h; k++) { const c = k === h - 1 ? GOLD[5] : (x + k) % 3 ? GOLD[3] : GOLD[4]; p.set(x, lidBot - k, c); if (k === h - 1) e.set(x, lidBot - k, GOLD[5]); } }
      p.rect(x0, lidBot, bw, 2, band); p.rect(x0, lidBot, bw, 1, bandL);
      if (boss) { p.set(x0 + 4, lidBot - 2, A[4]); e.set(x0 + 4, lidBot - 2, A[5]); p.set(x1 - 5, lidBot - 2, P.rose[3]); e.set(x1 - 5, lidBot - 2, P.rose[5]); }
    } else {
      // rounded lid
      for (let x = x0; x <= x1; x++) {
        const u = (x - x0) / (bw - 1), crown = Math.round(Math.sin(u * Math.PI) * 2);
        for (let y = lidTop - crown; y < lidBot; y++) {
          let col = w[u < 0.12 ? 3 : u > 0.88 ? 1 : 2];
          const ly = y - (lidTop - crown);
          if (ly === 0) col = w4[4]; else if (ly === 1) col = w[3]; else if (y === lidBot - 1) col = w[0];
          p.set(x, y, col);
        }
      }
      for (const bx of bandXs) for (let y = lidTop - 2; y < lidBot; y++) if (p.a(bx, y)) { p.set(bx, y, bandL); p.set(bx + 1, y, band); }
      p.rect(x0, lidBot, bw, 1, band); p.rect(x0, lidBot + 1, bw, 1, bandD);
      // lock plate
      const lx = Math.floor(S / 2) - 2;
      p.rect(lx, lidBot - 2, 5, ap(4), band); p.rect(lx, lidBot - 2, 5, 1, bandL); p.rect(lx + 4, lidBot - 2, 1, ap(4), bandD);
      p.rect(lx + 2, lidBot + 1, 1, 2, INK);
      // boss hoard: an aether gem in the lock and on the straps
      if (boss) { p.set(lx + 2, lidBot - 1, A[3]); e.set(lx + 2, lidBot - 1, A[5]); for (const bx of bandXs) { p.set(bx, lidTop, A[4]); e.set(bx, lidTop, A[5]); } }
    }
    return done(p, e);
  });
}

// iron wall sconce with a burning torch head; drawn with its pivot at the foot of the wall face
// (the flame is added live, about 1.9 world units up)
export function torchSprite() {
  return memo('torch', () => {
    const p = new Pix(9, ap(19) - ap(8) + 2), e = new Pix(9, p.h);
    p.ox = 4; p.oy = ap(19);
    const y = (wy) => p.oy - wy;           // row of a height above the pivot
    // wall plate
    p.rect(2, y(ap(13)), 5, ap(5), IRON[1]); p.rect(2, y(ap(13)), 5, 1, IRON[3]); p.set(4, y(ap(13)) + 2, IRON[4]);
    // stick
    p.rect(3, y(ap(16)), 3, ap(7), WOOD[2]); p.rect(3, y(ap(16)), 1, ap(7), WOOD[4]);
    // collar and wrapped head
    p.rect(2, y(ap(16)), 5, 2, IRON[1]); p.rect(2, y(ap(16)), 5, 1, IRON[3]);
    p.rect(2, y(ap(19)) + 1, 5, ap(3) - 1, WOOD[1]); p.rect(2, y(ap(19)) + 1, 5, 1, WOOD[3]);
    for (const [x, yy] of [[3, y(ap(19)) + 1], [5, y(ap(19)) + 2], [4, y(ap(19)) + 1]]) { p.set(x, yy, EMBER[3]); e.set(x, yy, EMBER[4]); }
    p.outlineSel();
    return { pix: p, emis: e };
  });
}
// glowing seed pod on a stalk (living labyrinth lamps)
export function bulbSprite(color) {
  return memo('bulb' + color, () => {
    const W = ap(6) | 1, H = ap(11), p = mk(W, H), e = mk(W, H), cx = W >> 1, c = R5(color), M = P.moss;
    p.rect(cx, ap(5), 2, H - ap(5), M[1]); p.rect(cx, ap(5), 1, H - ap(5), M[3]);
    p.poly([[cx, H - 3], [cx - ap(2.5), H - ap(3)], [cx - 1, H - 2]], M[2]);
    p.poly([[cx + 1, H - ap(4)], [cx + ap(2.5) + 1, H - ap(5)], [cx + 2, H - ap(3)]], M[3]);
    p.disc(cx + 0.5, ap(3), ap(2.5), c[1]); p.disc(cx + 0.5, ap(3), ap(2.5) - 1, c[2]); p.disc(cx, ap(3) - 1, 1.2, c[4]);
    e.disc(cx + 0.5, ap(3), ap(2.5) - 1, c[3]); e.disc(cx, ap(3) - 1, 1.2, c[4]);
    return done(p, e);
  });
}

// ---------------------------------------------------------------- tile set
// periodic value noise / cells (period P px in x and y) so neighbouring tiles join seamlessly
function pvn(x, y, s, cell, P) {
  const N = Math.max(1, Math.round(P / cell)), c = P / N;
  const fx = x / c, fy = y / c, ix = Math.floor(fx), iy = Math.floor(fy);
  let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const m = (v) => ((v % N) + N) % N;
  const a = hash2(m(ix), m(iy), s), b = hash2(m(ix + 1), m(iy), s), cc = hash2(m(ix), m(iy + 1), s), d = hash2(m(ix + 1), m(iy + 1), s);
  return a + (b - a) * tx + (cc - a) * ty + (a - b - cc + d) * tx * ty;
}
const CELL = { id: 0, edge: 0, dx: 0, dy: 0 };
function pcell(x, y, cell, s, Px, Py) {
  const Nx = Math.max(1, Math.round(Px / cell)), cx0 = Px / Nx, Ny = Py ? Math.max(1, Math.round(Py / cell)) : 0, cy0 = Py ? Py / Ny : cell;
  const gx = Math.floor(x / cx0), gy = Math.floor(y / cy0);
  let d1 = 1e9, d2 = 1e9;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const ax = gx + i, ay = gy + j, hx = ((ax % Nx) + Nx) % Nx, hy = Ny ? ((ay % Ny) + Ny) % Ny : ay;
    const px = (ax + 0.15 + hash2(hx, hy, s) * 0.7) * cx0, py = (ay + 0.15 + hash2(hx, hy, s + 1) * 0.7) * cy0;
    const d = (x + 0.5 - px) ** 2 + (y + 0.5 - py) ** 2;
    if (d < d1) { d2 = d1; d1 = d; CELL.id = hx * 7919 + hy * 31; CELL.dx = x + 0.5 - px; CELL.dy = y + 0.5 - py; } else if (d < d2) d2 = d;
  }
  CELL.edge = Math.sqrt(d2) - Math.sqrt(d1);
  return CELL;
}
// floor: [variants]; top / front: wall top cap and the south-facing wall face.
// Floors are flat-cluster slabs (rooms), worn rock (caves) or turf (mazes) in 3-4 steps of the
// theme's floor ramp. The wall's top face is the lit cap; the front face is masonry (or rock)
// a step darker, sinking into a plum shadow band at its foot.
export function dungeonTiles(theme, T, WPX) {
  return memo('tiles' + theme.name + T + WPX, () => {
    const cave = theme.layout === 'cave', maze = theme.layout === 'maze';
    const FR = R5(theme.floor), acc = C(theme.accent);
    const fMid = mixc(FR[1], FR[2], 0.5), fWorn = mixc(FR[2], FR[3], 0.5);
    const accA = mixc(FR[2], acc, 0.16), accB = mixc(FR[2], acc, 0.3);
    const floor = [];
    const h1 = Math.floor(T / 2);
    for (let v = 0; v < 6; v++) {
      const p = new Pix(T, T), rnd = srand(v * 71 + T);
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
        let c = FR[2];
        if (cave) {
          // worn rock floor: big flat patches in three tones
          const b = pvn(x, y, 5 + v, ap(7), T);
          c = b < 0.3 ? fMid : b > 0.72 ? fWorn : FR[2];
        } else if (maze) {
          const b = pvn(x, y, 9 + v, ap(6), T);
          c = b < 0.34 ? FR[1] : b > 0.7 ? fWorn : FR[2];
        } else {
          // flagstones: 2x2 slabs (some variants split or merge them), bevelled, worn
          const sx = x < h1 ? 0 : 1, sy = y < h1 ? 0 : 1;
          let x0 = sx ? h1 : 0, x1 = sx ? T : h1, y0 = sy ? h1 : 0, y1 = sy ? T : h1, id = sx + sy * 2;
          if (v === 1 && sy === 0) { const t3 = Math.floor(T / 3); const k = Math.min(2, Math.floor(x / t3)); x0 = k * t3; x1 = k === 2 ? T : (k + 1) * t3; id = 10 + k; }
          if (v === 2 && sx === 0) { y0 = 0; y1 = T; id = 20; }
          const lx = x - x0, ly = y - y0, sw = x1 - x0, sh = y1 - y0;
          const tone = hash2(id + v * 5, 1, 5);
          c = tone < 0.3 ? fMid : tone > 0.85 ? fWorn : FR[2];
          // a worn hollow in the middle of some slabs (one flat cluster)
          if (pvn(x, y, 7 + v, ap(6), T) < 0.18) c = c === fMid ? FR[1] : fMid;
          if (lx === 0 || ly === 0) c = FR[0];
          else if (lx === 1 || ly === 1) c = c === fMid ? FR[2] : FR[3];
          else if (lx === sw - 1 || ly === sh - 1) c = FR[1];
          // chipped corner
          if (lx <= 3 && ly <= 3 && lx + ly <= 4 && lx + ly > 1 && hash2(id, v, 9) < 0.4) c = FR[1];
        }
        // lichen / glow-moss: accent-tinted clusters on one variant
        if (v === 5) { const m = pvn(x, y, 31, ap(4), T); if (m > 0.84) c = accB; else if (m > 0.76) c = accA; }
        p.set(x, y, c);
      }
      // per-variant details: pebbles (caves), tufts (maze), a crack (flagstones)
      if (cave) for (let k = 0; k < 2 + v; k++) {
        const px = 3 + Math.floor(rnd() * (T - 6)), py = 3 + Math.floor(rnd() * (T - 6)), pr = rnd() < 0.3 ? 2 : 1;
        for (let j = -pr; j <= pr; j++) for (let i = -pr - 1; i <= pr; i++) if (i * i + j * j <= pr * pr + 1) p.set(px + i, py + j, j < 0 || i < 0 ? FR[4] : FR[3]);
        p.rect(px - pr, py + pr + 1, pr * 2 + 1, 1, FR[0]);
      } else if (maze) for (let k = 0; k < 4 + v; k++) {
        const px = 2 + Math.floor(rnd() * (T - 4)), py = 4 + Math.floor(rnd() * (T - 6)), gc = FR[4];
        p.set(px, py, gc); p.set(px - 1, py + 1, gc); p.set(px + 1, py + 1, gc); p.set(px, py + 1, FR[3]); p.rect(px - 1, py + 2, 3, 1, FR[1]);
        if (k % 3 === 0) { p.set(px + 2, py - 1, acc); p.set(px + 3, py - 1, accB); }
      } else if (v === 4) {
        let x = T * 0.3, y = T * 0.15;
        for (let k = 0; k < 12; k++) { const nx = x + (hash2(k, v, 1) - 0.35) * ap(4), ny = y + ap(2); p.line(x, y, nx, ny, FR[0]); p.set(Math.round(x) + 1, Math.round(y), FR[3]); x = nx; y = ny; }
      }
      if (cave && v === 4) { let x = T * 0.6, y = T * 0.2; for (let k = 0; k < 10; k++) { const nx = x + (hash2(k, v, 1) - 0.5) * ap(4), ny = y + ap(2); p.line(x, y, nx, ny, FR[0]); x = nx; y = ny; } }
      floor.push(p);
    }
    const WR = R5(theme.wall), wMid = mixc(WR[2], WR[3], 0.5);
    // wall top cap (seen from above): the lit face
    const top = new Pix(T, T);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      let c;
      if (maze) {
        // hedge top: rounded leaf clumps, lit on their upper left
        pcell(x, y, ap(3), 23, T, T);
        const l = -(CELL.dx + CELL.dy) / ap(3) + (hash2(CELL.id, 2, 3) - 0.5) * 0.5;
        c = l > 0.5 ? WR[4] : l > -0.1 ? WR[3] : l > -0.6 ? WR[2] : WR[1];
        if (CELL.edge < 0.8) c = WR[1];
      } else if (cave) {
        // rock top: flat facets in three steps
        pcell(x, y, ap(7), 24, T, T);
        const l = (hash2(CELL.id, 2, 3) - 0.5) * 0.9 - (CELL.dx + CELL.dy) / ap(7) * 0.35;
        c = l > 0.3 ? wMid : l > -0.2 ? WR[2] : WR[1];
        if (CELL.edge < 0.8 && hash2(CELL.id, 4, 1) < 0.5) c = WR[1];
      } else {
        // cap stones: two courses of blocks with a bevel
        const rows = 2, rh = T / rows, row = Math.floor(y / rh), ly = y - Math.floor(row * rh), rhh = Math.floor((row + 1) * rh) - Math.floor(row * rh);
        const nb = 3, bwid = T / nb, off = row % 2 ? bwid / 2 : 0, xx = (x + off) % T, bi = Math.floor(xx / bwid), lx = Math.floor(xx - Math.floor(bi * bwid));
        const bww = Math.floor((bi + 1) * bwid) - Math.floor(bi * bwid);
        c = hash2(bi + row * 7, 2, 21) < 0.3 ? WR[2] : wMid;
        if (lx === 0 || ly === 0) c = WR[1]; else if (lx === 1 || ly === 1) c = WR[3]; else if (lx === bww - 1 || ly === rhh - 1) c = WR[2];
      }
      // the south lip of the cap catches the light
      if (y === T - 1) c = WR[4];
      top.set(x, y, c);
    }
    // south-facing wall face: a step darker than the cap, a lit lip on top, masonry or rock in
    // flat clusters, and a plum shadow band at the foot
    const front = new Pix(T, WPX);
    const foot = ap(4);
    const shadowed = (c, y) => (y >= WPX - 2 ? dark(c, 0.55) : y >= WPX - foot ? dark(c, 0.72) : c);
    if (maze) {
      for (let y = 0; y < WPX; y++) for (let x = 0; x < T; x++) {
        pcell(x, y, ap(3), 31, T, 0);
        const l = -(CELL.dx + CELL.dy) / ap(3) + (hash2(CELL.id, 2, 3) - 0.5) * 0.5 - (y / WPX) * 0.8 + 0.2;
        let c = l > 0.45 ? WR[3] : l > -0.15 ? WR[2] : l > -0.65 ? WR[1] : WR[0];
        if (CELL.edge < 0.8) c = WR[0];
        front.set(x, y, shadowed(c, y));
      }
      // glowing buds among the leaves (2-px clusters)
      for (let k = 0; k < 5; k++) { const x = Math.floor(hash2(k, 1, 2) * (T - 3)), y = 2 + Math.floor(hash2(k, 2, 2) * (WPX - foot - 4)); front.set(x, y, acc); front.set(x + 1, y, light(acc, 1.2)); front.set(x, y + 1, dark(acc, 0.7)); front.set(x + 1, y + 1, acc); }
    } else if (cave) {
      for (let y = 0; y < WPX; y++) for (let x = 0; x < T; x++) {
        pcell(x, y, ap(7), 41, T, 0);
        const strata = Math.floor((y + pvn(x, 0, 43, ap(8), T) * ap(5)) / ap(5)) % 2;
        let l = (hash2(CELL.id, 2, 3) - 0.5) * 0.8 - (CELL.dx + CELL.dy) / ap(7) * 0.3 - (y / WPX) * 0.6 + 0.1;
        if (strata) l -= 0.15;
        let c = l > 0.3 ? WR[2] : l > -0.2 ? mixc(WR[1], WR[2], 0.5) : l > -0.55 ? WR[1] : WR[0];
        if (CELL.edge < 0.8 && hash2(CELL.id, 4, 1) < 0.45) c = WR[0];
        if (y < 2) c = y === 0 ? WR[3] : WR[2];
        front.set(x, y, shadowed(c, y));
      }
    } else {
      // bricks sized to divide the tile width so faces join without seams
      const nb = Math.max(2, Math.round(T / ap(6))), bs = (k) => Math.round((k * T) / nb), BRt = ap(3);
      for (let y = 0; y < WPX; y++) for (let x = 0; x < T; x++) {
        const ly = WPX - 1 - y, row = Math.floor(ly / BRt), ry = BRt - 1 - (ly % BRt);
        const xx = (x + (row % 2 ? Math.round(T / nb / 2) : 0)) % T;
        let bi = Math.floor((xx * nb) / T); if (bs(bi + 1) <= xx) bi++; if (bs(bi) > xx) bi--;
        const rx = xx - bs(bi), bw = bs(bi + 1) - bs(bi);
        let c;
        if (ry === BRt - 1) c = WR[0];
        else if (rx === 0) c = WR[0];
        else {
          const t = hash2(bi, row, 7);
          c = t < 0.25 ? WR[1] : t > 0.9 ? WR[2] : mixc(WR[1], WR[2], 0.55);
          if (ry === 0 && rx < bw - 1) c = WR[2];
          // a few cracked / missing bricks (cluster, not speckle)
          if (hash2(bi, row, 13) < 0.06 && rx >= 1 && rx <= 3 && ry >= 1) c = WR[0];
        }
        if (y < 2) c = y === 0 ? WR[4] : WR[3];
        front.set(x, y, shadowed(c, y));
      }
    }
    return { floor, top, front };
  });
}
