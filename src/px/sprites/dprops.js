// Dungeon dressing sprites (barrels, crates, coffins, urns, candles, anvils, carts, nests, gold)
// plus chests and the dungeon tile set (floor slabs, wall tops and wall faces per theme).
import { Pix, C, light, dark, mixc, hash2, srand } from '../pix.js';
import { ramp, blob } from './props.js';
import { memo, mk, done, fillWall, doorAt } from './buildings.js';

function ball(p, cx, cy, rx, ry, R) {
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
    const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
    if (nx * nx + ny * ny > 1) continue;
    const l = -0.5 * nx - 0.8 * ny + 0.2;
    p.set(x, y, R[l > 0.6 ? 3 : l > -0.1 ? 2 : l > -0.6 ? 1 : 0]);
  }
}

export function dpropSprite(type, seed = 0) {
  return memo('dp' + type + seed, () => {
    const r = srand(seed * 13 + type.length);
    switch (type) {
      case 'barrel': {
        const p = mk(14, 18), w = ramp('#7a5232');
        for (let y = 3; y < 17; y++) { const bulge = Math.round(Math.sin(((y - 3) / 14) * Math.PI) * 1.5); for (let x = 2 - bulge; x < 12 + bulge; x++) { const u = (x - 7) / (5 + bulge); p.set(x, y, u < -0.5 ? w[3] : u > 0.5 ? w[1] : (x % 3 === 0 ? w[1] : w[2])); } }
        p.ellipse(7, 3.5, 5, 2, '#5a3a22'); p.ellipse(7, 3.5, 4, 1.4, '#6a4a2c');
        for (const y of [6, 13]) p.rect(1, y, 12, 1, '#3a3a3a');
        return done(p, null);
      }
      case 'crate': {
        const p = mk(16, 18), w = C('#8a6a40');
        fillWall(p, 1, 6, 14, 11, w, 'plank', seed); fillWall(p, 1, 1, 14, 5, light(w, 1.15), 'plank', seed + 1);
        p.line(1, 6, 14, 16, dark(w, 0.65)); p.rect(1, 6, 14, 1, dark(w, 0.6));
        return done(p, null);
      }
      case 'coffin': {
        const p = mk(16, 26), w = ramp('#4a3020');
        p.poly([[4, 2], [12, 2], [15, 8], [12, 24], [4, 24], [1, 8]], w[2]);
        p.poly([[4, 2], [8, 2], [8, 24], [4, 24], [1, 8]], w[3]);
        p.line(8, 6, 8, 16, '#c8a050'); p.line(5, 9, 11, 9, '#c8a050');
        return done(p, null);
      }
      case 'urn': {
        const p = mk(12, 16), u = ramp(r() < 0.5 ? '#a86a42' : '#8a8478');
        ball(p, 6, 10, 5, 5, u); p.rect(4, 2, 4, 4, u[2]); p.rect(3, 1, 6, 2, u[3]); p.line(2, 10, 10, 10, u[0]);
        return done(p, null);
      }
      case 'candles': {
        const p = mk(16, 12), e = mk(16, 12);
        for (const [x, h] of [[3, 6], [7, 9], [11, 5], [9, 4]]) { p.rect(x, 11 - h, 2, h, '#e8e0c8'); p.set(x, 11 - h - 1, '#ffd060'); e.set(x, 11 - h - 1, '#ffd060'); e.set(x, 11 - h - 2, '#ff9030'); }
        return done(p, e);
      }
      case 'anvil': {
        const p = mk(18, 14), m = ramp('#4a4a4a');
        p.rect(6, 7, 6, 6, m[1]); p.rect(4, 12, 10, 2, m[0]);
        p.rect(2, 3, 14, 4, m[2]); p.rect(2, 3, 14, 1, m[3]); p.poly([[16, 3], [18, 4], [16, 6]], m[2]);
        return done(p, null);
      }
      case 'anchor': {
        const p = mk(18, 24), m = '#4a4a50';
        p.rect(8, 3, 2, 18, m); p.ring(9, 2, 2, C(m), 1); p.rect(4, 6, 10, 2, m);
        for (let a = 0; a <= Math.PI; a += 0.1) p.set(9 + Math.cos(a) * 7, 16 + Math.sin(a) * 5, m);
        return done(p, null);
      }
      case 'minecart': {
        const p = mk(22, 18), w = ramp('#5a4a3a');
        p.poly([[1, 4], [21, 4], [19, 14], [3, 14]], w[2]); p.rect(1, 4, 20, 2, w[3]);
        ball(p, 11, 4, 7, 3, ramp('#6a6a70'));
        for (const x of [5, 17]) { p.disc(x, 15, 2.4, '#2a2a2a'); p.set(x, 15, '#6a6a6a'); }
        return done(p, null);
      }
      case 'nest': {
        const p = mk(24, 12), n = ramp('#6a5030');
        p.ellipse(12, 7, 11, 4.5, n[1]); p.ellipse(12, 6, 8, 3, n[0]);
        for (let k = 0; k < 18; k++) { const a = r() * Math.PI * 2; p.line(12 + Math.cos(a) * 8, 7 + Math.sin(a) * 3, 12 + Math.cos(a) * 11, 7 + Math.sin(a) * 4.5, n[k % 2 ? 2 : 3]); }
        for (const x of [9, 12, 15]) ball(p, x, 5, 2, 2.4, ramp('#e0d8c0'));
        return done(p, null);
      }
      case 'shell': { const p = mk(14, 10), s = ramp('#e8c0a8'); ball(p, 7, 6, 6, 4, s); for (let k = -2; k <= 2; k++) p.line(7, 9, 7 + k * 2.5, 3, s[1]); return done(p, null); }
      case 'gold_pile': {
        const p = mk(26, 14), e = mk(26, 14), g = ramp('#e8b830');
        ball(p, 13, 10, 12, 5, g);
        for (let k = 0; k < 16; k++) { const x = 3 + r() * 20, y = 6 + r() * 6; if (p.a(x, y)) { p.set(x, y, '#fff0a0'); if (k % 4 === 0) e.set(x, y, '#fff0a0'); } }
        p.rect(18, 3, 4, 4, '#8a2a20'); p.set(19, 3, '#c8a050');
        return done(p, e);
      }
      case 'bones': {
        const p = mk(18, 10), b = '#e0d8c4';
        for (let k = 0; k < 4; k++) { const x = 2 + r() * 12, y = 4 + r() * 4; p.line(x, y, x + 5, y + (r() - 0.5) * 3, b); p.set(x - 1, y, b); }
        p.ellipse(6, 5, 2.4, 2, b); p.set(5, 5, '#1a1010'); p.set(7, 5, '#1a1010');
        return done(p, null);
      }
      case 'campfire': {
        const p = mk(18, 10);
        for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; p.line(9 + Math.cos(a) * 7, 6 + Math.sin(a) * 3, 9, 6, '#5a3a22', 2); }
        for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; p.disc(9 + Math.cos(a) * 8, 6 + Math.sin(a) * 3.2, 1.3, '#6a6460'); }
        return done(p, null, { fireAt: [0, -4] });
      }
      case 'tent': {
        const p = mk(36, 28), c = ramp('#8a7058');
        p.poly([[2, 26], [18, 2], [34, 26]], c[2]); p.poly([[2, 26], [18, 2], [12, 26]], c[3]);
        p.poly([[14, 26], [18, 14], [22, 26]], '#1a120c');
        return done(p, null);
      }
      default: return null;
    }
  });
}

export function chestSprite(open, boss) {
  return memo('chest' + open + boss, () => {
    const p = mk(18, 18), e = mk(18, 18);
    const w = ramp(boss ? '#8a6a2a' : '#6a4a2a'), band = boss ? C('#e0b040') : C('#c8a040');
    p.rect(2, 8, 14, 9, w[2]); p.rect(2, 8, 2, 9, w[3]); p.rect(14, 8, 2, 9, w[1]);
    for (const x of [5, 12]) p.rect(x, 8, 1, 9, band);
    if (open) {
      p.rect(3, 9, 12, 3, '#1a1008'); for (let k = 0; k < 6; k++) { p.set(4 + k * 2, 9, '#ffd860'); e.set(4 + k * 2, 9, '#ffd860'); }
      p.rect(2, 2, 14, 6, w[1]); p.rect(2, 2, 14, 1, w[3]); p.rect(2, 7, 14, 1, band);
    } else {
      p.rect(2, 4, 14, 5, w[3]); p.rect(2, 4, 14, 1, light(w[3], 1.15)); p.rect(2, 8, 14, 1, band);
      p.rect(8, 8, 2, 3, band); p.set(8, 10, '#1a1008');
    }
    return done(p, e);
  });
}

// ---------------------------------------------------------------- tile set
// floor: [variants]; top / front: wall top cap and the south-facing wall face
export function dungeonTiles(theme, T, WPX) {
  return memo('tiles' + theme.name + T + WPX, () => {
    const cave = theme.layout === 'cave', maze = theme.layout === 'maze';
    const floorC = mixc(theme.floor, '#ffffff', 0.12), acc = C(theme.accent);
    const floor = [];
    for (let v = 0; v < 6; v++) {
      const p = new Pix(T, T);
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
        const n = hash2(x + v * 97, y, 3);
        let c = floorC;
        if (cave) { c = n < 0.18 ? dark(floorC, 0.85) : n > 0.9 ? light(floorC, 1.08) : floorC; if (hash2(Math.floor(x / 3) + v * 7, Math.floor(y / 3), 9) < 0.1) c = dark(floorC, 0.75); }
        else if (maze) { c = n < 0.25 ? dark(floorC, 0.85) : n > 0.85 ? light(floorC, 1.15) : floorC; if ((x * 7 + y * 3 + v) % 23 === 0) c = light(acc, 0.9); }
        else {
          // flagstones: 2x2 slabs per tile with mortar joints, slight per-slab tone
          const half = T / 2, sx = Math.floor(x / half), sy = Math.floor(y / half);
          const tone = 0.9 + hash2(sx + v * 3, sy, 5) * 0.18;
          c = mixc(dark(floorC, tone), floorC, 0.5);
          if (x % half === 0 || y % half === 0) c = dark(floorC, 0.68);
          else if (x % half === 1 || y % half === 1) c = light(c, 1.06);
          if (n < 0.06) c = dark(c, 0.85);
        }
        if (v === 5 && hash2(x, y, 11) < 0.08) c = mixc(c, acc, 0.5);
        p.set(x, y, c);
      }
      if (v === 4 && !cave) { let x = T * 0.3, y = T * 0.2; for (let k = 0; k < 10; k++) { const nx = x + (hash2(k, v, 1) - 0.3) * 4, ny = y + 2; p.line(x, y, nx, ny, dark(floorC, 0.6)); x = nx; y = ny; } }
      floor.push(p);
    }
    const wallC = mixc(theme.wall, '#ffffff', 0.18);
    // wall top cap
    const top = new Pix(T, T);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const n = hash2(x, y, 21);
      let c = cave ? (n < 0.3 ? dark(wallC, 0.82) : n > 0.85 ? light(wallC, 1.1) : wallC) : maze ? (n < 0.35 ? dark(wallC, 0.8) : n > 0.8 ? light(wallC, 1.25) : wallC) : (x % (T / 2) === 0 || y % (T / 3) === 0 ? dark(wallC, 0.85) : wallC);
      top.set(x, y, dark(c, 0.72));
    }
    const front = new Pix(T, WPX);
    if (maze) {
      for (let y = 0; y < WPX; y++) for (let x = 0; x < T; x++) { const n = hash2(x, y, 31); let c = n < 0.35 ? dark(wallC, 0.75) : n > 0.8 ? light(wallC, 1.2) : wallC; if (y > WPX - 3) c = dark(c, 0.7); front.set(x, y, c); }
      for (let k = 0; k < 6; k++) { const x = hash2(k, 1, 2) * T, y = hash2(k, 2, 2) * WPX; front.set(x, y, acc); }
    } else if (cave) {
      for (let y = 0; y < WPX; y++) for (let x = 0; x < T; x++) { const n = hash2(x, y, 41) + hash2(Math.floor(x / 4), Math.floor(y / 3), 42) * 0.6; let c = n < 0.5 ? dark(wallC, 0.78) : n > 1.2 ? light(wallC, 1.1) : wallC; if (y > WPX - 3) c = dark(c, 0.65); if (y < 2) c = light(c, 1.1); front.set(x, y, c); }
    } else {
      fillWall(front, 0, 0, T, WPX, wallC, 'brick', 7);
      for (let x = 0; x < T; x++) front.set(x, 0, light(wallC, 1.2));
    }
    return { floor, top, front };
  });
}
