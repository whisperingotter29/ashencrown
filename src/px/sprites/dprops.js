// Dungeon dressing sprites (barrels, crates, coffins, urns, candles, anvils, carts, nests, gold)
// plus chests, wall torches, glow bulbs and the dungeon tile set (floor slabs, wall tops and wall
// faces per theme). Drawn natively at PPU (ap() for design-pixel geometry, 1-px details at 1 px).
import { Pix, C, ap, light, dark, shade, mixc, hash2, srand } from '../pix.js';
import { ramp } from './props.js';
import { memo, mk, done, fillWall, stoneMass } from './buildings.js';

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
function bone(p, x0, y0, x1, y1, c) {
  const L = ramp(c);
  p.line(x0, y0, x1, y1, L[1], 2); p.line(x0, y0 - 1, x1, y1 - 1, L[3]);
  for (const [x, y] of [[x0, y0], [x1, y1]]) { p.disc(x - 1, y - 0.5, 1.4, L[2]); p.disc(x + 1, y + 0.5, 1.4, L[2]); p.set(Math.round(x) - 1, Math.round(y) - 1, L[3]); }
}

export function dpropSprite(type, seed = 0) {
  return memo('dp' + type + seed, () => {
    const r = srand(seed * 13 + type.length);
    switch (type) {
      case 'barrel': {
        const W = ap(14), H = ap(18), p = mk(W, H), w = ramp('#7a5232'), cx = W / 2;
        const top = ap(3), bot = H - 2;
        for (let y = top; y <= bot; y++) {
          const t = (y - top) / (bot - top), half = ap(5) + Math.sin(t * Math.PI) * ap(1.5);
          for (let x = Math.floor(cx - half); x <= cx + half; x++) {
            const u = (x + 0.5 - cx) / half;
            if (Math.abs(u) > 1) continue;
            let col = w[u < -0.55 ? 3 : u < 0.1 ? 2 : u < 0.6 ? 1 : 0];
            const st = Math.floor((Math.asin(u) / Math.PI + 0.5) * 7), stl = Math.floor((Math.asin(Math.max(-1, (x - 0.5 - cx) / half)) / Math.PI + 0.5) * 7);
            if (st !== stl) col = dark(col, 0.8);
            if (hash2(x, y >> 2, seed) < 0.1) col = shade(col, 0.9);
            for (const ht of [0.16, 0.8]) { const hy = top + Math.round(ht * (bot - top)); if (y === hy) col = u < -0.3 ? C('#6a6a6e') : C('#3a3a3e'); if (y === hy + 1) col = C('#2a2a2e'); }
            p.set(x, y, col);
          }
        }
        p.ellipse(cx, top + 0.5, ap(5) + 0.4, ap(2), '#4a2e1a'); p.ellipse(cx, top + 0.5, ap(4), ap(1.4), '#6a4a2c');
        for (let x = Math.round(cx - ap(4)) + 2; x < cx + ap(4); x += 3) p.line(x, top - 1, x, top + 2, '#5a3a22');
        p.set(Math.round(cx) - 3, top - 1, '#8a6440');
        return done(p, null);
      }
      case 'crate': {
        const W = ap(16), H = ap(18), p = mk(W, H), w = C('#8a6a40');
        const tH = ap(5), x0 = 1, fw = W - 2;
        fillWall(p, x0, 1, fw, tH, light(w, 1.15), 'plank', seed + 1);
        fillWall(p, x0, 1 + tH, fw, H - tH - 2, w, 'plank', seed);
        // frame boards, brace and nails on the front face
        const fy = 1 + tH, fh = H - tH - 2, fr = dark(w, 0.78);
        p.rect(x0, fy, fw, 2, fr); p.rect(x0, fy + fh - 2, fw, 2, fr); p.rect(x0, fy, 2, fh, fr); p.rect(x0 + fw - 2, fy, 2, fh, fr);
        p.rect(x0, fy, fw, 1, light(w, 1.1)); p.rect(x0, fy, 1, fh, light(w, 1.06));
        p.line(x0 + 2, fy + fh - 3, x0 + fw - 3, fy + 2, fr, 2); p.line(x0 + 2, fy + fh - 4, x0 + fw - 4, fy + 2, light(w, 1.08));
        for (const [nx, ny] of [[x0 + 1, fy + 1], [x0 + fw - 2, fy + 1], [x0 + 1, fy + fh - 2], [x0 + fw - 2, fy + fh - 2]]) p.set(nx, ny, '#3a3030');
        p.rect(x0, 1, fw, 1, light(w, 1.3)); p.rect(x0, tH, fw, 1, dark(w, 0.6));
        return done(p, null);
      }
      case 'coffin': {
        const W = ap(16), H = ap(26), p = mk(W, H), w = ramp('#4a3020');
        const pts = [[ap(4), 2], [W - ap(4), 2], [W - 1, ap(8)], [W - ap(4), H - 2], [ap(4), H - 2], [1, ap(8)]];
        p.poly(pts, w[1]);
        p.poly([[ap(4) + 1, 3], [W - ap(4) - 1, 3], [W - 3, ap(8)], [W - ap(4) - 1, H - 4], [ap(4) + 1, H - 4], [3, ap(8)]], w[2]);
        p.poly([[ap(4) + 1, 3], [W / 2, 3], [W / 2, H - 4], [ap(4) + 1, H - 4], [3, ap(8)]], w[3]);
        for (let y = 4; y < H - 4; y += 3) for (let x = 2; x < W - 2; x++) if (p.get(x, y)?.[0] === w[3][0] && hash2(x, y, seed) < 0.3) p.set(x, y, w[2]);
        const g = C('#c8a050'), cx = Math.floor(W / 2);
        p.rect(cx - 1, ap(6), 2, ap(11), g); p.rect(cx - ap(3), ap(9), ap(6), 2, g); p.set(cx - 1, ap(6), '#fff0a0'); p.rect(cx, ap(6) + 1, 1, ap(11) - 1, '#8a6a2a');
        p.line(2, ap(8), W - 3, ap(8), w[0]);
        return done(p, null);
      }
      case 'urn': {
        const W = ap(12), H = ap(16), p = mk(W, H), u = ramp(r() < 0.5 ? '#a86a42' : '#8a8478'), cx = W / 2;
        ball(p, cx, H - ap(6), ap(5), ap(5), u);
        p.rect(Math.round(cx - ap(2)), ap(2), ap(4), ap(4), u[2]); p.rect(Math.round(cx - ap(2)), ap(2), 2, ap(4), u[3]); p.rect(Math.round(cx + ap(2)) - 1, ap(2), 1, ap(4), u[1]);
        p.rect(Math.round(cx - ap(3)), 1, ap(6), ap(1.5), u[3]); p.rect(Math.round(cx - ap(3)), 1 + ap(1.5), ap(6), 1, u[0]);
        for (const sd of [-1, 1]) { const hx = Math.round(cx + sd * ap(3.4)); p.line(hx, ap(3), hx + sd, ap(6), u[1]); p.set(hx + sd, ap(6) + 1, u[1]); }
        const by = H - ap(6);
        for (let x = 0; x < W; x++) if (p.a(x, by)) { p.set(x, by, u[0]); p.set(x, by + 2, u[0]); if (x % 3 === 0) p.set(x, by + 1, mixc(u[3], '#e8d8a0', 0.5)); }
        return done(p, null);
      }
      case 'candles': {
        const W = ap(16), H = ap(12), p = mk(W, H), e = mk(W, H);
        p.ellipse(W / 2, H - 2, W / 2 - 1, 1.6, '#c8c0a8');
        for (const [x, h] of [[ap(3), ap(6)], [ap(7), ap(9)], [ap(11), ap(5)], [ap(9), ap(4)]]) {
          p.rect(x, H - 2 - h, 3, h, '#e8e0c8'); p.rect(x, H - 2 - h, 1, h, '#fff8e8'); p.rect(x + 2, H - 2 - h, 1, h, '#b8b098');
          p.set(x + 2, H - 1 - h + ap(2), '#e8e0c8'); p.set(x - 1, H - 2 - h + 2, '#e8e0c8');
          p.set(x + 1, H - 3 - h, '#3a3030');
          for (const [fx, fy, c] of [[x + 1, H - 4 - h, '#ffd060'], [x + 1, H - 5 - h, '#ffb040'], [x + 1, H - 6 - h, '#ff9030']]) { p.set(fx, fy, c); e.set(fx, fy, c); }
          e.set(x + 1, H - 4 - h, '#fff0b0');
        }
        return done(p, e);
      }
      case 'anvil': {
        const W = ap(18), H = ap(14), p = mk(W, H), m = ramp('#4a4a4e');
        p.rect(ap(6), ap(7), ap(6), ap(5), m[1]); p.rect(ap(6), ap(7), 2, ap(5), m[2]);
        p.rect(ap(4), H - ap(2) - 1, ap(10), ap(2), m[0]); p.rect(ap(4), H - ap(2) - 1, ap(10), 1, m[1]);
        p.rect(2, ap(3), ap(13), ap(4), m[2]); p.rect(2, ap(3), ap(13), 1, m[3]); p.rect(2, ap(3) + ap(4) - 1, ap(13), 1, m[0]);
        p.poly([[2 + ap(13), ap(3)], [W - 1, ap(3) + 2], [W - 1, ap(3) + 3], [2 + ap(13), ap(3) + ap(4) - 1]], m[2]); p.set(W - 2, ap(3) + 2, m[3]);
        p.rect(ap(5), ap(3) + 1, 2, 1, '#2a2a2e'); p.rect(4, ap(3), ap(6), 1, '#9a9aa4');
        return done(p, null);
      }
      case 'anchor': {
        const W = ap(18), H = ap(24), p = mk(W, H), m = ramp('#4a4a50'), cx = Math.floor(W / 2);
        for (let a = 0.15; a <= Math.PI - 0.15; a += 0.04) { const x = cx + Math.cos(a) * ap(7), y = ap(16) + Math.sin(a) * ap(5); p.rect(Math.round(x) - 1, Math.round(y) - 1, 3, 3, m[1]); p.set(x, y - 1, m[3]); }
        for (const sd of [-1, 1]) p.poly([[cx + sd * ap(7), ap(16) - 1], [cx + sd * (ap(7) + 3), ap(16) - 4], [cx + sd * (ap(7) + 1), ap(16) + 2]], m[2]);
        p.rect(cx - 1, ap(3), 3, ap(18), m[2]); p.rect(cx - 1, ap(3), 1, ap(18), m[3]); p.rect(cx + 1, ap(3), 1, ap(18), m[0]);
        p.ring(cx + 0.5, ap(2), ap(2), m[2], 2); p.set(cx - 2, 1, m[3]);
        p.rect(cx - ap(5), ap(6), ap(10) + 1, 2, m[2]); p.rect(cx - ap(5), ap(6), ap(10) + 1, 1, m[3]);
        for (let k = 0; k < 8; k++) { const x = Math.floor(r() * W), y = Math.floor(r() * H); if (p.a(x, y)) p.set(x, y, '#7a4a2a'); }
        return done(p, null);
      }
      case 'minecart': {
        const W = ap(22), H = ap(18), p = mk(W, H), w = ramp('#5a4a3a');
        const t = ap(4), b = ap(14);
        p.poly([[1, t], [W - 1, t], [W - 3, b], [3, b]], w[2]);
        p.poly([[1, t], [W / 2, t], [W / 2, b], [3, b]], w[3]);
        for (let y = t + 3; y < b; y += 3) p.line(2, y, W - 3, y, w[1]);
        p.rect(1, t, W - 2, 2, w[1]); p.rect(1, t, W - 2, 1, light(w[3], 1.1));
        for (const x of [2, W - 4]) for (let y = t + 2; y < b; y += 3) p.set(x + 1, y, '#8a8a90');
        stoneMass(p, W / 2, t, ap(7), ap(3), '#6a6a70', seed + 3, { facet: ap(2), cracks: 0, flatBase: 0.2 });
        for (let k = 0; k < 5; k++) { const x = Math.round(W / 2 + (r() - 0.5) * ap(10)), y = Math.round(t - r() * ap(2)); if (p.a(x, y)) p.set(x, y, '#c89040'); }
        for (const x of [ap(5), W - ap(5)]) { p.disc(x, b + 1, ap(2.4), '#1e1e22'); p.disc(x, b + 1, ap(2.4) - 1.5, '#4a4a50'); p.set(x, b + 1, '#8a8a90'); p.set(x - 1, b, '#6a6a70'); }
        return done(p, null);
      }
      case 'nest': {
        const W = ap(24), H = ap(12), p = mk(W, H), n = ramp('#6a5030'), cx = W / 2, cy = H - ap(5);
        p.ellipse(cx, cy, ap(11), ap(4.5), n[1]); p.ellipse(cx, cy - 1, ap(8), ap(3), n[0]);
        for (let k = 0; k < 40; k++) { const a = r() * Math.PI * 2; const r0 = 0.62 + r() * 0.2; p.line(cx + Math.cos(a) * ap(11) * r0, cy + Math.sin(a) * ap(4.5) * r0, cx + Math.cos(a + 0.5) * ap(11), cy + Math.sin(a + 0.5) * ap(4.5), n[k % 3 === 0 ? 3 : 2]); }
        for (const x of [-ap(3), 0, ap(3)]) { ball(p, cx + x, cy - ap(1.5), ap(2), ap(2.4), ramp('#e0d8c0')); p.set(Math.round(cx + x + 1), Math.round(cy - 1), '#8a8070'); }
        return done(p, null);
      }
      case 'shell': {
        const W = ap(14), H = ap(10), p = mk(W, H), s = ramp('#e8c0a8'), cx = W / 2, by = H - 2;
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
        const W = ap(26), H = ap(14), p = mk(W, H), e = mk(W, H), g = ramp('#e8b830');
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
        for (let k = 0; k < 12; k++) { const x = Math.round(3 + r() * (W - 6)), y = Math.round(cy - ry + 2 + r() * ry * 1.4); if (p.a(x, y)) { p.set(x, y, '#ffffff'); e.set(x, y, '#fff0a0'); if (k % 3 === 0) { p.set(x - 1, y, '#fff0a0'); p.set(x + 1, y, '#fff0a0'); } } }
        // a goblet and a gem
        const gx = Math.round(W * 0.68), gy = ap(3);
        p.rect(gx, gy, ap(3), ap(3), '#d8a030'); p.rect(gx, gy, 1, ap(3), '#ffe080'); p.rect(gx + 1, gy + ap(3), 1, 2, '#c09020'); p.rect(gx - 1, gy + ap(3) + 2, ap(3) + 2, 1, '#c09020');
        p.rect(Math.round(W * 0.3), ap(5), 3, 3, '#c02030'); p.set(Math.round(W * 0.3), ap(5), '#ff8090'); e.set(Math.round(W * 0.3), ap(5), '#ff6070');
        return done(p, e);
      }
      case 'bones': {
        const W = ap(18), H = ap(10), p = mk(W, H);
        for (let k = 0; k < 4; k++) { const x = 3 + r() * (W - ap(10)), y = ap(4) + r() * ap(4); bone(p, x, y, x + ap(6), y + (r() - 0.5) * ap(3), '#e0d8c4'); }
        const sx = ap(6), sy = ap(5);
        p.ellipse(sx, sy, ap(2.4), ap(2), '#e0d8c4'); p.rect(sx - 2, sy + 1, 4, 2, '#d0c8b4'); p.set(sx - 2, sy - 2, '#fff8e8');
        p.rect(sx - 2, sy - 1, 2, 2, '#1a1010'); p.rect(sx + 1, sy - 1, 2, 2, '#1a1010'); p.set(sx, sy + 1, '#3a3028');
        return done(p, null);
      }
      case 'campfire': {
        const W = ap(18), H = ap(10), p = mk(W, H), e = mk(W, H), cx = W / 2, cy = H - ap(4);
        for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; ball(p, cx + Math.cos(a) * ap(8), cy + Math.sin(a) * ap(3.2), ap(1.5), ap(1.2), ramp('#6a6460')); }
        p.ellipse(cx, cy, ap(5.5), ap(2), '#2a1a12');
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2 + 0.3, x0 = cx + Math.cos(a) * ap(6), y0 = cy + Math.sin(a) * ap(2.4);
          p.line(x0, y0, cx, cy - 1, '#4a2e1a', 3); p.line(x0, y0 - 1, cx, cy - 2, '#7a5232');
          p.disc(x0, y0, 1.6, '#c8a070'); p.set(Math.round(x0), Math.round(y0), '#8a6440');
        }
        for (let k = 0; k < 8; k++) { const x = cx + (r() - 0.5) * ap(6), y = cy + (r() - 0.5) * ap(2); p.set(x, y, '#ff7020'); e.set(x, y, '#ff9030'); }
        return done(p, e, { fireAt: [0, -ap(4)] });
      }
      case 'tent': {
        const W = ap(36), H = ap(28), p = mk(W, H), c = ramp('#8a7058');
        const apx = W / 2, top = 2, by = H - 2;
        p.line(1, by, apx - ap(6), top + ap(10), '#a89070'); p.line(W - 2, by, apx + ap(6), top + ap(10), '#a89070');
        p.poly([[ap(2), by], [apx, top], [W - ap(2), by]], c[1]);
        p.poly([[ap(2), by], [apx, top], [apx - ap(5), by]], c[3]);
        p.poly([[apx - ap(5), by], [apx, top], [apx + ap(2), by]], c[2]);
        for (let k = 1; k < 4; k++) p.line(apx, top, ap(2) + (k / 4) * (W - ap(4)), by, dark(c[2], 0.85));
        p.poly([[apx - ap(4), by], [apx, top + ap(12)], [apx + ap(4), by]], '#1a120c');
        p.poly([[apx, top + ap(12)], [apx + ap(5), by], [apx + ap(3), by]], c[3]);
        p.rect(Math.round(apx) - 1, top - ap(3), 2, ap(4), '#4a3020');
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
    const w = ramp(boss ? '#8a6a2a' : '#6a4a2a'), band = boss ? C('#e8c048') : C('#a8a0a0'), bandL = light(band, 1.25), bandD = dark(band, 0.62);
    const x0 = ap(2), x1 = S - ap(2) - 1, bw = x1 - x0 + 1;
    const lidTop = ap(4), lidBot = ap(8), bodyBot = S - 2;
    const bandXs = [x0 + ap(3), x1 - ap(3) - 1];
    // body: horizontal boards, lit left / shaded right
    for (let y = lidBot; y <= bodyBot; y++) for (let x = x0; x <= x1; x++) {
      const u = (x - x0) / (bw - 1);
      let col = w[u < 0.12 ? 3 : u > 0.88 ? 1 : 2];
      if ((y - lidBot) % 4 === 3) col = w[0]; else if ((y - lidBot) % 4 === 0) col = light(col, 1.06);
      if (hash2(x, y, 3) < 0.08) col = shade(col, 0.9);
      p.set(x, y, col);
    }
    for (const bx of bandXs) for (let y = lidBot; y <= bodyBot; y++) { p.set(bx, y, bandL); p.set(bx + 1, y, band); if ((y - lidBot) % 4 === 2) p.set(bx + 1, y, bandD); }
    p.rect(x0, bodyBot, bw, 1, w[0]);
    for (const [cx, sd] of [[x0, 1], [x1, -1]]) { p.rect(sd > 0 ? cx : cx - 2, bodyBot - 2, 3, 3, band); p.set(cx, bodyBot - 2, bandL); }
    if (open) {
      // lid swung up behind, inside facing us
      for (let y = 1; y < lidTop + 3; y++) for (let x = x0; x <= x1; x++) p.set(x, y, (y % 3 === 0) ? w[0] : w[1]);
      p.rect(x0, 1, bw, 1, w[2]);
      for (const bx of bandXs) p.rect(bx, 1, 2, lidTop + 2, bandD);
      // the treasure inside
      p.rect(x0 + 1, lidTop + 3, bw - 2, lidBot - lidTop - 2, '#1a1008');
      for (let x = x0 + 2; x < x1 - 1; x++) { const h = 1 + Math.floor(hash2(x, 1, 5) * 3); for (let k = 0; k < h; k++) { const c = (x + k) % 3 ? '#e0a020' : '#ffd860'; p.set(x, lidBot - k, c); if (k === h - 1) e.set(x, lidBot - k, '#ffd860'); } }
      p.rect(x0, lidBot, bw, 2, band); p.rect(x0, lidBot, bw, 1, bandL);
      if (boss) { p.set(x0 + 4, lidBot - 2, '#40c0ff'); e.set(x0 + 4, lidBot - 2, '#80e0ff'); p.set(x1 - 5, lidBot - 2, '#ff4060'); e.set(x1 - 5, lidBot - 2, '#ff8090'); }
    } else {
      // rounded lid
      for (let x = x0; x <= x1; x++) {
        const u = (x - x0) / (bw - 1), crown = Math.round(Math.sin(u * Math.PI) * 2);
        for (let y = lidTop - crown; y < lidBot; y++) {
          let col = w[u < 0.12 ? 3 : u > 0.88 ? 1 : 2];
          const ly = y - (lidTop - crown);
          if (ly === 0) col = light(w[3], 1.12); else if (ly === 1) col = w[3]; else if (y === lidBot - 1) col = w[0];
          p.set(x, y, col);
        }
      }
      for (const bx of bandXs) for (let y = lidTop - 2; y < lidBot; y++) if (p.a(bx, y)) { p.set(bx, y, bandL); p.set(bx + 1, y, band); }
      p.rect(x0, lidBot, bw, 1, band); p.rect(x0, lidBot + 1, bw, 1, bandD);
      // lock plate
      const lx = Math.floor(S / 2) - 2;
      p.rect(lx, lidBot - 2, 5, ap(4), band); p.rect(lx, lidBot - 2, 5, 1, bandL); p.rect(lx + 4, lidBot - 2, 1, ap(4), bandD);
      p.rect(lx + 2, lidBot + 1, 1, 2, '#1a1008');
      if (boss) { p.set(lx + 2, lidBot - 1, '#ff4060'); e.set(lx + 2, lidBot - 1, '#ff6070'); for (const bx of bandXs) { p.set(bx, lidTop, '#40c0ff'); e.set(bx, lidTop, '#60d0ff'); } }
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
    p.rect(2, y(ap(13)), 5, ap(5), '#2a2420'); p.rect(2, y(ap(13)), 5, 1, '#4a4038'); p.set(4, y(ap(13)) + 2, '#6a6058');
    // stick
    p.rect(3, y(ap(16)), 3, ap(7), '#5a3a22'); p.rect(3, y(ap(16)), 1, ap(7), '#7a5232');
    // collar and wrapped head
    p.rect(2, y(ap(16)), 5, 2, '#3a3438'); p.rect(2, y(ap(16)), 5, 1, '#6a6468');
    p.rect(2, y(ap(19)) + 1, 5, ap(3) - 1, '#3a2418'); p.rect(2, y(ap(19)) + 1, 5, 1, '#5a3a24');
    for (const [x, yy] of [[3, y(ap(19)) + 1], [5, y(ap(19)) + 2], [4, y(ap(19)) + 1]]) { p.set(x, yy, '#ff9030'); e.set(x, yy, '#ffb040'); }
    p.outlineSel();
    return { pix: p, emis: e };
  });
}
// glowing seed pod on a stalk (living labyrinth lamps)
export function bulbSprite(color) {
  return memo('bulb' + color, () => {
    const W = ap(6) | 1, H = ap(11), p = mk(W, H), e = mk(W, H), cx = W >> 1, c = C(color);
    p.rect(cx, ap(5), 2, H - ap(5), '#2a3a24'); p.rect(cx, ap(5), 1, H - ap(5), '#4a5a34');
    p.poly([[cx, H - 3], [cx - ap(2.5), H - ap(3)], [cx - 1, H - 2]], '#3a5a2a');
    p.poly([[cx + 1, H - ap(4)], [cx + ap(2.5) + 1, H - ap(5)], [cx + 2, H - ap(3)]], '#4a6a30');
    p.disc(cx + 0.5, ap(3), ap(2.5), dark(c, 0.7)); p.disc(cx + 0.5, ap(3), ap(2.5) - 1, c); p.disc(cx, ap(3) - 1, 1.2, '#ffffff');
    e.disc(cx + 0.5, ap(3), ap(2.5) - 1, c); e.disc(cx, ap(3) - 1, 1.2, '#ffffff');
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
// floor: [variants]; top / front: wall top cap and the south-facing wall face
export function dungeonTiles(theme, T, WPX) {
  return memo('tiles' + theme.name + T + WPX, () => {
    const cave = theme.layout === 'cave', maze = theme.layout === 'maze';
    const floorC = mixc(theme.floor, '#ffffff', 0.12), acc = C(theme.accent);
    const FR = [dark(floorC, 0.62), dark(floorC, 0.8), floorC, light(floorC, 1.1)];
    const floor = [];
    const h1 = Math.floor(T / 2);
    for (let v = 0; v < 6; v++) {
      const p = new Pix(T, T), rnd = srand(v * 71 + T);
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
        const n = hash2(x + v * 97, y, 3);
        let c = floorC;
        if (cave) {
          const b = pvn(x, y, 5 + v, ap(6), T);
          c = b < 0.3 ? shade(floorC, 0.92) : b > 0.74 ? mixc(floorC, FR[3], 0.3) : floorC;
          if (n < 0.08) c = dark(c, 0.86); else if (n > 0.96) c = light(c, 1.08);
        } else if (maze) {
          const b = pvn(x, y, 9 + v, ap(5), T);
          c = b < 0.35 ? FR[1] : b > 0.7 ? light(floorC, 1.06) : floorC;
          if (n < 0.1) c = dark(c, 0.82);
          else if (n > 0.9 && hash2(x, y + 1, 4) < 0.6) c = light(c, 1.22);
        } else {
          // flagstones: 2x2 slabs (some variants split or merge them), bevelled, worn
          const sx = x < h1 ? 0 : 1, sy = y < h1 ? 0 : 1;
          let x0 = sx ? h1 : 0, x1 = sx ? T : h1, y0 = sy ? h1 : 0, y1 = sy ? T : h1, id = sx + sy * 2;
          if (v === 1 && sy === 0) { const t3 = Math.floor(T / 3); const k = Math.min(2, Math.floor(x / t3)); x0 = k * t3; x1 = k === 2 ? T : (k + 1) * t3; id = 10 + k; }
          if (v === 2 && sx === 0) { y0 = 0; y1 = T; id = 20; }
          const lx = x - x0, ly = y - y0, sw = x1 - x0, sh = y1 - y0;
          const tone = 0.9 + hash2(id + v * 5, 1, 5) * 0.16;
          c = shade(floorC, tone);
          if (pvn(x, y, 7 + v, ap(5), T) < 0.3) c = shade(c, 0.94);
          if (lx === 0 || ly === 0) c = FR[0];
          else if (lx === 1 || ly === 1) c = light(c, 1.08);
          else if (lx === sw - 1 || ly === sh - 1) c = shade(c, 0.86);
          else if (n < 0.05) c = dark(c, 0.86); else if (n > 0.975) c = light(c, 1.06);
          if ((lx <= 2 && ly <= 2 && lx + ly <= 3 && hash2(id, v, 9) < 0.4)) c = FR[1];
        }
        if (v === 5 && hash2(x, y, 11) < 0.06) c = mixc(c, acc, 0.5);
        p.set(x, y, c);
      }
      // per-variant details: pebbles (caves), tufts (maze), a crack (flagstones)
      if (cave) for (let k = 0; k < 3 + v; k++) {
        const px = 3 + Math.floor(rnd() * (T - 6)), py = 3 + Math.floor(rnd() * (T - 6)), pr = rnd() < 0.3 ? 2 : 1;
        const pc = rnd() < 0.5 ? FR[3] : FR[2];
        for (let j = -pr; j <= pr; j++) for (let i = -pr - 1; i <= pr; i++) if (i * i + j * j <= pr * pr + 1) p.set(px + i, py + j, j < 0 || i < 0 ? light(pc, 1.06) : pc);
        p.rect(px - pr, py + pr + 1, pr * 2 + 1, 1, FR[0]);
      } else if (maze) for (let k = 0; k < 5 + v; k++) {
        const px = 2 + Math.floor(rnd() * (T - 4)), py = 4 + Math.floor(rnd() * (T - 6)), gc = light(floorC, 1.35);
        p.set(px, py, gc); p.set(px - 1, py + 1, gc); p.set(px + 1, py + 1, gc); p.set(px, py + 1, light(floorC, 1.15)); p.rect(px - 1, py + 2, 3, 1, FR[1]);
        if (k % 3 === 0) p.set(px + 2, py - 1, acc);
      } else if (v === 4) {
        let x = T * 0.3, y = T * 0.15;
        for (let k = 0; k < 12; k++) { const nx = x + (hash2(k, v, 1) - 0.35) * ap(4), ny = y + ap(2); p.line(x, y, nx, ny, FR[0]); p.set(Math.round(x) + 1, Math.round(y), light(floorC, 1.12)); x = nx; y = ny; }
      }
      if (cave && v === 4) { let x = T * 0.6, y = T * 0.2; for (let k = 0; k < 10; k++) { const nx = x + (hash2(k, v, 1) - 0.5) * ap(4), ny = y + ap(2); p.line(x, y, nx, ny, FR[0]); x = nx; y = ny; } }
      floor.push(p);
    }
    const wallC = mixc(theme.wall, '#ffffff', 0.18), WR = [dark(wallC, 0.6), dark(wallC, 0.78), wallC, light(wallC, 1.14)];
    // wall top cap (seen from above, in shade)
    const top = new Pix(T, T);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const n = hash2(x, y, 21);
      let c;
      if (maze) {
        pcell(x, y, ap(3), 23, T, T);
        const l = -(CELL.dx + CELL.dy) / ap(3) + (hash2(CELL.id, 2, 3) - 0.5) * 0.6;
        c = l > 0.45 ? WR[3] : l > -0.1 ? WR[2] : l > -0.6 ? WR[1] : WR[0];
        if (CELL.edge < 0.8) c = WR[0];
        c = shade(c, 0.86);
      } else if (cave) {
        pcell(x, y, ap(7), 24, T, T);
        const l = (hash2(CELL.id, 2, 3) - 0.5) * 0.9 - (CELL.dx + CELL.dy) / ap(7) * 0.35;
        c = l > 0.3 ? WR[3] : l > -0.1 ? WR[2] : l > -0.45 ? WR[1] : WR[0];
        if (CELL.edge < 0.8 && hash2(CELL.id, 4, 1) < 0.5) c = WR[0];
        if (n < 0.06) c = dark(c, 0.86);
        c = dark(c, 0.74);
      } else {
        // cap stones: two courses of blocks with a bevel
        const rows = 2, rh = T / rows, row = Math.floor(y / rh), ly = y - Math.floor(row * rh), rhh = Math.floor((row + 1) * rh) - Math.floor(row * rh);
        const nb = 3, bwid = T / nb, off = row % 2 ? bwid / 2 : 0, xx = (x + off) % T, bi = Math.floor(xx / bwid), lx = Math.floor(xx - Math.floor(bi * bwid));
        const bww = Math.floor((bi + 1) * bwid) - Math.floor(bi * bwid);
        c = shade(wallC, 0.9 + hash2(bi + row * 7, 2, 21) * 0.14);
        if (lx === 0 || ly === 0) c = WR[0]; else if (lx === 1 || ly === 1) c = light(c, 1.1); else if (lx === bww - 1 || ly === rhh - 1) c = shade(c, 0.86);
        if (n < 0.05) c = shade(c, 0.86);
        c = dark(c, 0.74);
      }
      top.set(x, y, c);
    }
    // south-facing wall face
    const front = new Pix(T, WPX);
    if (maze) {
      for (let y = 0; y < WPX; y++) for (let x = 0; x < T; x++) {
        pcell(x, y, ap(3), 31, T, 0);
        const l = -(CELL.dx + CELL.dy) / ap(3) + (hash2(CELL.id, 2, 3) - 0.5) * 0.6 - (y / WPX) * 0.7 + 0.25;
        let c = l > 0.45 ? WR[3] : l > -0.1 ? WR[2] : l > -0.6 ? WR[1] : WR[0];
        if (CELL.edge < 0.8) c = WR[0];
        if (y > WPX - 3) c = dark(c, 0.7);
        front.set(x, y, c);
      }
      for (let k = 0; k < 6; k++) { const x = Math.floor(hash2(k, 1, 2) * (T - 2)), y = 2 + Math.floor(hash2(k, 2, 2) * (WPX - 6)); front.set(x, y, acc); front.set(x + 1, y, light(acc, 1.2)); front.set(x, y + 1, dark(acc, 0.7)); }
    } else if (cave) {
      for (let y = 0; y < WPX; y++) for (let x = 0; x < T; x++) {
        pcell(x, y, ap(7), 41, T, 0);
        const strata = Math.floor((y + pvn(x, 0, 43, ap(8), T) * ap(5)) / ap(5)) % 2;
        let l = (hash2(CELL.id, 2, 3) - 0.5) * 0.9 - (CELL.dx + CELL.dy) / ap(7) * 0.3 - (y / WPX) * 0.5 + 0.2;
        if (strata) l -= 0.15;
        let c = l > 0.35 ? WR[3] : l > -0.05 ? WR[2] : l > -0.45 ? WR[1] : WR[0];
        if (CELL.edge < 0.8 && hash2(CELL.id, 4, 1) < 0.4) c = WR[0];
        if (hash2(x, y, 41) < 0.05) c = dark(c, 0.86);
        if (y < 2) c = light(c, 1.12);
        if (y > WPX - 3) c = dark(c, 0.65);
        front.set(x, y, c);
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
        if (ry === BRt - 1 || rx === 0) c = dark(wallC, 0.64);
        else {
          c = shade(wallC, 0.88 + hash2(bi, row, 7) * 0.18);
          if (ry === 0) c = light(c, 1.08); else if (ry === BRt - 2 || rx === bw - 1) c = shade(c, 0.88);
          if (hash2(x, y, 9) < 0.04) c = shade(c, 0.84);
          if (hash2(bi, row, 13) < 0.06 && rx === Math.floor(bw / 2) && ry < BRt - 2) c = dark(wallC, 0.66);
        }
        if (y < 2) c = y === 0 ? light(wallC, 1.24) : light(c, 1.06);
        if (y > WPX - 1 - ap(2)) c = shade(c, 0.8);
        front.set(x, y, c);
      }
    }
    return { floor, top, front };
  });
}
