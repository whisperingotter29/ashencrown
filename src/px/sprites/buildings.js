// Procedural pixel buildings in 3/4 top-down view: a front wall with doors and windows under a
// big tiled roof (Zelda-style), plus the town kit (stalls, braziers, lamps, fountains, banners,
// walls, towers) and site pieces (waystones, dungeon mouths, shrines, relics). Every sprite's
// pivot sits on the ground at the middle of its front edge. Windows / runes go to the emissive
// layer so they glow at night.
import { Pix, C, light, dark, mixc, alpha, hash2, srand, bayer } from '../pix.js';
import { ramp, blob } from './props.js';
import { weaponSprite } from './weapons.js';

const cache = new Map();
export const memo = (k, f) => { let s = cache.get(k); if (!s) { s = f(); cache.set(k, s); } return s; };
export function mk(w, h) { const p = new Pix(Math.ceil(w), Math.ceil(h)); p.ox = Math.floor(p.w / 2); p.oy = p.h - 1; return p; }
export function done(p, e, extra = {}) {
  p.outline();
  let any = false;
  if (e) for (let i = 3; i < e.d.length; i += 4) if (e.d[i]) { any = true; break; }
  return { pix: p, emis: any ? e : null, ...extra };
}
const WIN = C('#ffc070');

// ------------------------------------------------------------------ texture fills
export function fillWall(p, x0, y0, w, h, base, kind, seed = 0) {
  const c = C(base);
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const lx = x - x0, ly = y - y0;
    let col = c;
    const n = hash2(x, y, seed);
    if (kind === 'brick') {
      const row = Math.floor(ly / 3), off = row % 2 ? 3 : 0;
      if (ly % 3 === 2 || (lx + off) % 6 === 0) col = dark(c, 0.72);
      else if (n < 0.2) col = dark(c, 0.9); else if (n > 0.85) col = light(c, 1.08);
    } else if (kind === 'block') {
      const row = Math.floor(ly / 5), off = row % 2 ? 5 : 0;
      if (ly % 5 === 4 || (lx + off) % 10 === 0) col = dark(c, 0.78);
      else if (n < 0.15) col = dark(c, 0.92);
    } else if (kind === 'plank') {
      if (lx % 4 === 3) col = dark(c, 0.7); else if (n < 0.2) col = dark(c, 0.88);
      if ((ly + Math.floor(lx / 4) * 7) % 11 === 0) col = dark(c, 0.8);
    } else if (kind === 'adobe') {
      if (n < 0.12) col = dark(c, 0.9); else if (n > 0.9) col = light(c, 1.06);
    } else if (kind === 'marble') {
      if (ly % 6 === 5) col = dark(c, 0.88); else if (n > 0.93) col = mixc(c, '#a8a090', 0.4);
    } else if (n < 0.1) col = dark(c, 0.92);
    // vertical shading: lit left, shadowed right
    if (lx === 0) col = light(col, 1.1); else if (lx === w - 1) col = dark(col, 0.8);
    if (ly === h - 1) col = dark(col, 0.75);
    p.set(x, y, col);
  }
}
// roof of tile rows seen from the front: lighter toward the eave, darkest at the ridge
export function fillRoof(p, x0, y0, w, h, base, kind = 'tile', seed = 0, snow = 0) {
  const c = C(base);
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const ly = y - y0, lx = x - x0;
    const t = ly / Math.max(1, h - 1);
    let col = mixc(dark(c, 0.78), light(c, 1.12), t);
    if (kind === 'tile') {
      const row = Math.floor(ly / 3), off = row % 2 ? 2 : 0;
      if (ly % 3 === 2) col = dark(col, 0.72); else if ((lx + off) % 4 === 3) col = dark(col, 0.86);
      if (ly % 3 === 0 && (lx + off) % 4 === 1) col = light(col, 1.12);
    } else if (kind === 'slate') {
      const row = Math.floor(ly / 2), off = row % 2 ? 3 : 0;
      if (ly % 2 === 1 && (lx + off) % 6 < 5) col = dark(col, 0.82);
    } else if (kind === 'thatch') {
      if ((lx * 3 + ly * 7 + Math.floor(hash2(x, 0, seed) * 4)) % 5 === 0) col = dark(col, 0.78);
      if (ly % 4 === 3) col = dark(col, 0.85);
    } else if (kind === 'cloth') {
      if (Math.floor(lx / 4) % 2) col = mixc(col, '#f0e8d8', 0.35);
    }
    if (snow && t < snow + (hash2(x, y, 3) - 0.5) * 0.25) col = mixc(C('#eef2f8'), col, t * 0.6);
    if (lx === 0) col = light(col, 1.08); else if (lx === w - 1) col = dark(col, 0.82);
    p.set(x, y, col);
  }
  // ridge cap and eave shadow
  for (let x = x0; x < x0 + w; x++) { p.set(x, y0, dark(c, 0.55)); p.set(x, y0 + h - 1, dark(c, 0.62)); }
}
export function windowAt(p, e, x, y, w, h, frame, o = {}) {
  const f = C(frame);
  p.rect(x - 1, y - 1, w + 2, h + 2, f);
  if (o.arch) { p.set(x - 1, y - 1, null); p.clear(x - 1, y - 1); p.clear(x + w, y - 1); p.rect(x, y - 2, w, 1, f); }
  // dark glass by day; the warm lamplight lives on the emissive layer and fades in at dusk
  p.rect(x, y, w, h, o.dark ? C('#1a1418') : C('#2a3442'));
  if (!o.dark) { p.set(x, y, '#5a6a7a'); e.rect(x, y, w, h, o.color || WIN); e.set(x, y, '#fff0c0'); }
  if (o.mullion && w >= 3) { p.rect(x + Math.floor(w / 2), y, 1, h, f); p.rect(x, y + Math.floor(h / 2), w, 1, f); e.rect(x + Math.floor(w / 2), y, 1, h, [0, 0, 0, 0]); clearRect(e, x + Math.floor(w / 2), y, 1, h); clearRect(e, x, y + Math.floor(h / 2), w, 1); }
  if (o.shutters) { const s = C(o.shutters); p.rect(x - 3, y - 1, 2, h + 2, s); p.rect(x + w + 1, y - 1, 2, h + 2, s); p.set(x - 2, y + 1, dark(s, 0.7)); p.set(x + w + 2, y + 1, dark(s, 0.7)); }
  p.rect(x - 1, y + h + 1, w + 2, 1, dark(f, 0.7));     // sill
}
function clearRect(p, x, y, w, h) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) p.clear(x + i, y + j); }
export function doorAt(p, x, yb, w, h, wood, o = {}) {
  const c = C(wood), fr = C(o.frame || dark(wood, 0.6));
  for (let y = yb - h + 1; y <= yb; y++) for (let i = 0; i < w; i++) {
    const ly = y - (yb - h + 1);
    if (o.arch) { const cx = (w - 1) / 2, r = w / 2; const dy = Math.max(0, r - ly); if (Math.abs(i - cx) > Math.sqrt(Math.max(0, r * r - dy * dy)) + 0.2) continue; }
    p.set(x + i, y, i % 3 === 2 ? dark(c, 0.75) : i === 0 ? light(c, 1.15) : c);
  }
  // frame
  for (let y = yb - h; y <= yb; y++) { p.set(x - 1, y, fr); p.set(x + w, y, fr); }
  if (!o.arch) p.rect(x - 1, yb - h, w + 2, 1, fr);
  p.set(x + w - 2, yb - Math.floor(h / 2), '#e0c060');    // handle
  if (o.dark) for (let y = yb - h + 2; y <= yb; y++) for (let i = 1; i < w - 1; i++) if (p.a(x + i, y)) p.set(x + i, y, '#0a080c');
}

// ------------------------------------------------------------------ houses
export const STYLE = {
  desert: { wall: ['#c89a6a', '#b8845a', '#d8aa78', '#a87048'], roof: ['#a86a42', '#8a5030'], trim: '#6a3a24', cloth: ['#a02a20', '#d8a040', '#2a4a7a', '#7a2a5a'] },
  marble: { wall: ['#e8e0cc', '#d8cfb8', '#f0e8d8'], roof: ['#b8583a', '#a04a30', '#c86848'], trim: '#c8a050', cloth: ['#d8b040', '#a02020', '#f0e8d0'] },
  wood: { wall: ['#7a5a3a', '#8a6a48', '#6a4a30'], roof: ['#4a5a30', '#5a4a30', '#3a4a2a', '#7a5a30'], trim: '#3a2a1a', cloth: ['#4a7a3a', '#a08040', '#6a3a7a'] },
  stone: { wall: ['#7a7a80', '#6a6a72', '#8a8478'], roof: ['#3a4250', '#4a4a58', '#2a3240'], trim: '#3a3030', cloth: ['#3a5a8a', '#8a2a2a', '#5a3a7a'] },
  camp: { wall: ['#8a7058', '#a08060', '#6a5a48'], roof: ['#6a5040', '#7a6048'], trim: '#3a2a1a', cloth: ['#3a5a8a', '#8a2a2a', '#c0a060'] },
  port: { wall: ['#8a7a68', '#7a6a58', '#a09078'], roof: ['#5a3a2a', '#3a4a5a', '#6a3a2a'], trim: '#2a2a2a', cloth: ['#e0e0d0', '#2a5a7a', '#a03020'] },
};

// w, d, h in world units; returns sprite + footprint
export function houseSprite(style, w, d, h, seed, o = {}) {
  const key = ['house', style, w.toFixed(1), d.toFixed(1), h.toFixed(1), seed, o.snow ? 1 : 0, o.variant || 0].join(':');
  return memo(key, () => {
    const r = srand(seed * 7 + 3);
    const S = STYLE[style] || STYLE.wood;
    const pick = (a) => a[Math.floor(r() * a.length)];
    const W = Math.round(w * 10), D = Math.round(d * 10), Hh = Math.round(h * 10 * 0.72);
    const ov = 2;
    const RH = style === 'desert' ? Math.round(D * 0.42) : Math.round(D * 0.48 + h * 10 * 0.28);
    const top = 14;
    const p = mk(W + ov * 2 + 8, Hh + RH + top), e = mk(p.w, p.h);
    const x0 = 4 + ov, yb = p.h - 1, wallTop = yb - Hh + 1;
    const wallC = pick(S.wall), roofC = pick(S.roof), trim = C(S.trim);
    const cx = x0 + Math.floor(W / 2);
    if (style === 'camp') return tent(p, e, S, r, W, Hh + RH);
    if (style === 'mushroom') return mushroomHouse(p, e, r, W, Hh);
    // ---- foundation strip
    p.rect(x0 - 1, yb - 1, W + 2, 2, style === 'marble' ? '#c8c0a8' : '#5a5048');
    // ---- front wall
    if (style === 'desert') fillWall(p, x0, wallTop, W, Hh - 1, wallC, 'adobe', seed);
    else if (style === 'marble') fillWall(p, x0, wallTop, W, Hh - 1, wallC, 'marble', seed);
    else if (style === 'stone') fillWall(p, x0, wallTop, W, Hh - 1, wallC, 'block', seed);
    else {
      const plasterC = pick(['#cdbb98', '#c8b088', '#d8c8a8']);
      fillWall(p, x0, wallTop, W, Hh - 1, plasterC, 'plaster', seed);
      // timber frame: posts, rail, braces
      const tc = C(wallC);
      for (const x of [x0, x0 + W - 1, x0 + Math.floor(W / 3), x0 + Math.floor((W * 2) / 3)]) p.rect(x, wallTop, 1, Hh - 1, dark(tc, 0.9));
      p.rect(x0, wallTop, W, 1, tc); p.rect(x0, wallTop + Math.floor(Hh * 0.5), W, 1, tc);
      p.line(x0 + 1, wallTop + Math.floor(Hh * 0.5) - 1, x0 + Math.floor(W / 3) - 1, wallTop + 1, tc);
      p.line(x0 + W - 2, wallTop + Math.floor(Hh * 0.5) - 1, x0 + Math.floor((W * 2) / 3) + 1, wallTop + 1, tc);
    }
    // quoins on stone houses
    if (style === 'stone') for (let y = wallTop; y < yb - 1; y += 3) for (const x of [x0, x0 + W - 3]) p.rect(x + ((y / 3) % 2 ? 1 : 0), y, 2, 2, light(wallC, 1.15));
    // ---- door + windows
    const dw = Math.max(5, Math.round(W * 0.16)), dh = Math.min(Hh - 3, 20);
    doorAt(p, cx - Math.floor(dw / 2), yb - 2, dw, dh, style === 'desert' ? '#5a3420' : style === 'marble' ? '#5a3a24' : '#3e2616', { arch: style !== 'wood' && style !== 'port', frame: style === 'marble' ? '#c8a050' : null });
    const wy = wallTop + Math.max(3, Math.floor(Hh * 0.28));
    const wwid = style === 'desert' ? 3 : 4, whgt = style === 'desert' ? 6 : 5;
    const winX = [cx - Math.floor(W * 0.3) - 2, cx + Math.floor(W * 0.3) - 2];
    if (W >= 40) for (const wx of winX) windowAt(p, e, wx, wy, wwid, whgt, style === 'marble' ? '#d8ccb0' : style === 'desert' ? S.trim : style === 'stone' ? '#5a5a58' : S.trim, { mullion: style !== 'desert', arch: style === 'desert', shutters: style === 'wood' && r() < 0.6 ? pick(['#4a6a3a', '#6a3a2a', '#3a4a6a']) : null });
    if (Hh > 26 && style !== 'desert') windowAt(p, e, cx - 2, wallTop + 3, 4, 4, style === 'marble' ? '#d8ccb0' : S.trim, { mullion: true });
    // ---- portico (marble)
    if (style === 'marble') {
      for (const fx of [0.06, 0.32, 0.68, 0.94]) column(p, x0 + Math.round(W * fx) - 1, yb, Hh, 3, '#f0e8d8');
      p.rect(x0 - 2, wallTop - 2, W + 4, 3, '#e8e0c8'); p.rect(x0 - 2, wallTop - 2, W + 4, 1, '#fffaf0');
    }
    // ---- roof
    const ry0 = wallTop - RH;
    if (style === 'desert') {
      // flat roof: the top surface with a parapet lip, beam ends below
      fillWall(p, x0 - 1, ry0 + 2, W + 2, RH - 2, light(wallC, 1.12), 'adobe', seed + 1);
      p.rect(x0 - 1, ry0, W + 2, 2, dark(wallC, 0.9)); p.rect(x0 - 1, wallTop - 2, W + 2, 2, dark(wallC, 0.82));
      p.rect(x0 + 1, ry0 + 2, W - 2, 1, dark(wallC, 0.75));
      for (let x = x0 + 3; x < x0 + W - 2; x += 6) p.rect(x, wallTop + 1, 2, 1, '#5a3a24');
      if (r() < 0.45) dome(p, e, cx, ry0 + Math.floor(RH * 0.6), Math.min(W, D) * 0.28, r() < 0.3 ? '#d8a040' : pick(['#e0c8a0', '#6a9ab0', '#c8a070']), r() < 0.35);
      else { // striped awning over the door
        const aw = Math.round(W * 0.7), ax = cx - Math.floor(aw / 2), ay = yb - dh - 6;
        const cc = C(pick(S.cloth));
        for (let y = 0; y < 5; y++) for (let x = 0; x < aw; x++) p.set(ax + x, ay + y, Math.floor(x / 3) % 2 ? (y === 4 ? dark(cc, 0.7) : cc) : (y === 4 ? C('#c8b8a0') : C('#f0e8d8')));
        for (const sx of [ax, ax + aw - 1]) p.rect(sx, ay + 5, 1, yb - ay - 6, '#4a3020');
      }
    } else {
      const kind = style === 'stone' ? 'slate' : style === 'wood' && r() < 0.3 ? 'thatch' : 'tile';
      fillRoof(p, x0 - ov, ry0, W + ov * 2, RH, roofC, kind, seed, o.snow ? 0.55 : 0);
      if (style === 'marble') { for (let x = x0 - ov; x < x0 + W + ov; x += 2) p.set(x, ry0 + RH - 1, '#e8e0c8'); }
      // chimney
      if (style !== 'marble') {
        const chx = x0 + Math.round(W * (r() < 0.5 ? 0.22 : 0.72)), chy = ry0 + Math.floor(RH * 0.35);
        p.rect(chx, chy - 9, 5, 10, '#5a5048'); fillWall(p, chx, chy - 9, 5, 10, '#6a6058', 'brick', seed + 5);
        p.rect(chx - 1, chy - 10, 7, 2, '#4a4038');
        o.chimney = [chx + 2 - p.ox, chy - 11 - p.oy];
      }
      // dormer window in the roof
      if (W >= 50 && style !== 'marble') windowAt(p, e, cx - 2, ry0 + Math.floor(RH * 0.5), 4, 4, S.trim, { mullion: true });
    }
    // stilts for port houses
    if (style === 'port') for (const x of [x0 + 1, x0 + W - 3]) p.rect(x, yb - 1, 2, 2, '#4a3a2a');
    return done(p, e, { chimney: o.chimney || null, footprint: [w, d] });
  });
}
function column(p, x, yb, h, w, col) {
  const c = C(col);
  for (let y = yb - h + 2; y <= yb - 1; y++) for (let i = 0; i < w; i++) p.set(x + i, y, i === 0 ? light(c, 1.08) : i === w - 1 ? dark(c, 0.78) : (y % 4 === 0 ? dark(c, 0.95) : c));
  p.rect(x - 1, yb - h + 1, w + 2, 2, light(c, 1.05)); p.rect(x - 1, yb - 1, w + 2, 1, dark(c, 0.85));
}
function dome(p, e, cx, yb, r, col, onion) {
  const R = ramp(col);
  for (let y = Math.floor(yb - r * (onion ? 1.5 : 1)); y <= yb; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
    const ny = (yb - y) / (r * (onion ? 1.5 : 1)), nx = (x + 0.5 - cx) / r;
    const wdt = onion ? Math.sin(Math.min(1, ny * 1.25) * Math.PI) * 0.9 + (ny < 0.4 ? 0.4 : 0) : Math.sqrt(Math.max(0, 1 - ny * ny));
    if (Math.abs(nx) > wdt) continue;
    const l = -0.6 * nx + 0.5 * ny;
    let c = R[l > 0.45 ? 3 : l > 0 ? 2 : l > -0.4 ? 1 : 0];
    if (Math.round(nx * 6) % 2 === 0 && Math.abs(nx) < wdt - 0.1 && ny > 0.1) c = dark(c, 0.92);
    p.set(x, y, c);
  }
  p.rect(Math.round(cx), Math.floor(yb - r * (onion ? 1.5 : 1)) - 3, 1, 3, '#d8b050');
}
function tent(p, e, S, r, W, H) {
  const cc = C(S.cloth[Math.floor(r() * S.cloth.length)]);
  const body = C(S.wall[Math.floor(r() * S.wall.length)]);
  const cx = p.w / 2, yb = p.h - 1, R0 = W * 0.5, top = yb - Math.min(H, W * 0.8);
  for (let y = top; y <= yb; y++) {
    const t = (y - top) / (yb - top);
    const half = R0 * Math.sqrt(t) + 1;
    for (let x = Math.floor(cx - half); x <= cx + half; x++) {
      const u = (x - (cx - half)) / (2 * half);
      let c = Math.floor(u * 8) % 2 ? body : light(body, 1.1);
      if (y > yb - 4) c = dark(c, 0.85);
      if (Math.abs(y - (top + (yb - top) * 0.55)) < 1.5) c = cc;
      if (u > 0.75) c = dark(c, 0.82);
      p.set(x, y, c);
    }
  }
  // door flap
  p.poly([[cx - 4, yb], [cx, yb - 14], [cx + 4, yb]], '#2a1a12');
  p.line(cx, yb - 14, cx + 5, yb, light(body, 1.2));
  p.rect(Math.round(cx), top - 4, 1, 5, '#4a3020');
  p.poly([[cx + 1, top - 4], [cx + 7, top - 2.5], [cx + 1, top - 1]], cc);
  return done(p, null, { footprint: [W / 10, W / 10] });
}
function mushroomHouse(p, e, r, W, Hh) {
  const cx = p.w / 2, yb = p.h - 1;
  const stem = C('#e8dcc8'), cap = C(['#8a3a9a', '#c04040', '#4a8a9a'][Math.floor(r() * 3)]);
  for (let y = yb - Hh; y <= yb; y++) for (let x = Math.round(cx - W * 0.22); x <= cx + W * 0.22; x++) p.set(x, y, x < cx - W * 0.12 ? light(stem, 1.08) : x > cx + W * 0.14 ? dark(stem, 0.85) : stem);
  doorAt(p, Math.round(cx) - 3, yb, 6, 12, '#5a3a24', { arch: true });
  windowAt(p, e, Math.round(cx) + 4, yb - Hh + 8, 3, 3, '#5a3a24', { color: C('#c0ff80') });
  const cy = yb - Hh;
  blob(p, cx, cy, W * 0.6, W * 0.32, cap, r, { bump: 0.08, lobes: 7 });
  for (let k = 0; k < 7; k++) p.ellipse(cx + (r() - 0.5) * W * 0.9, cy - r() * W * 0.22, 1.6, 1.2, '#f8f0f0');
  return done(p, e, { footprint: [W / 10, W / 10] });
}

// ------------------------------------------------------------------ town kit
export function stallSprite(cloth, seed = 0) {
  return memo('stall' + cloth + seed, () => {
    const p = mk(30, 26), e = mk(30, 26);
    const c = C(cloth), r = srand(seed + 5);
    // counter with goods
    p.rect(3, 15, 24, 9, '#6a4a2c'); fillWall(p, 3, 17, 24, 7, '#7a5a38', 'plank', seed);
    p.rect(2, 14, 26, 2, '#8a6a44');
    const goods = ['#c04030', '#e0c040', '#60a040', '#a06030', '#d8d0b0', '#5080c0'];
    for (let i = 0; i < 9; i++) { const x = 4 + i * 2.6, g = C(goods[Math.floor(r() * goods.length)]); p.ellipse(x + 1, 12.6, 1.3, 1.3, g); p.set(Math.round(x), 12, light(g, 1.3)); }
    // posts + striped awning
    for (const x of [3, 26]) p.rect(x, 4, 1, 12, '#4a3020');
    for (let y = 0; y < 6; y++) for (let x = 0; x < 28; x++) p.set(1 + x, 2 + y, Math.floor(x / 3) % 2 ? (y === 5 ? dark(c, 0.7) : y === 0 ? light(c, 1.2) : c) : (y === 5 ? C('#c8b8a0') : C('#f0e8d8')));
    for (let x = 1; x < 29; x += 3) p.set(x + 1, 8, Math.floor(x / 3) % 2 ? dark(c, 0.8) : C('#d8d0c0'));
    return done(p, e);
  });
}
// braziers: bowl on legs; flames are drawn live by the structure (animated)
export function brazierSprite(big = 1) {
  return memo('brazier' + big, () => {
    const s = big;
    const p = mk(14 * s + 4, 16 * s + 4);
    const cx = p.w / 2, yb = p.h - 1;
    const iron = C('#3a3438');
    for (const dx of [-3, 0, 3]) p.line(cx + dx * s, yb, cx + dx * s * 0.6, yb - 7 * s, iron, Math.max(1, Math.round(s)));
    p.ellipse(cx, yb - 8 * s, 5.5 * s, 2.6 * s, light(iron, 1.3));
    p.ellipse(cx, yb - 8.5 * s, 4.5 * s, 1.6 * s, '#ff8030');
    p.ellipse(cx, yb - 8.6 * s, 2.5 * s, 0.9 * s, '#ffe090');
    p.rect(Math.round(cx - 5.5 * s), Math.round(yb - 8 * s), Math.round(11 * s), Math.max(2, Math.round(2 * s)), iron);
    const e = new Pix(p.w, p.h); e.ox = p.ox; e.oy = p.oy;
    e.ellipse(cx, yb - 8.5 * s, 4.5 * s, 1.6 * s, '#ff9030');
    return done(p, e, { fireAt: [0, -Math.round(9 * s)] });
  });
}
export function lampSprite(color = '#ffc060') {
  return memo('lamp' + color, () => {
    const p = mk(9, 40), e = mk(9, 40);
    p.rect(3, 8, 2, 31, '#3a2a1a'); p.rect(3, 8, 1, 31, '#5a4028');
    p.rect(2, 37, 4, 2, '#2a2018');
    p.rect(1, 2, 6, 7, '#2a2420'); p.rect(2, 3, 4, 5, color); e.rect(2, 3, 4, 5, color); e.set(3, 4, '#fff8e0');
    p.rect(0, 1, 8, 1, '#2a2420'); p.rect(3, 0, 2, 1, '#2a2420');
    return done(p, e, { lightAt: [0, -34] });
  });
}
export function fountainSprite(r = 3, stone = '#e0d8c4', frame = 0) {
  return memo('fountain' + r + stone + frame, () => {
    const R = Math.round(r * 10), n = R * 2 + 8;
    const p = mk(n, R + 34), e = mk(n, R + 34);
    const cx = p.w / 2, yb = p.h - 4, cy = yb - R * 0.45;
    const S = ramp(stone);
    // basin rim (ellipse) + inner water
    p.ellipse(cx, cy, R, R * 0.48, S[1]);
    p.ellipse(cx, cy - 1, R, R * 0.48, S[2]);
    p.ellipse(cx, cy - 1, R - 3, R * 0.48 - 2, '#3a7a90');
    for (let k = 0; k < 18; k++) { const a = (k / 18) * Math.PI * 2 + frame * 0.35; const x = cx + Math.cos(a) * (R - 6) * (0.4 + (k % 3) * 0.25), y = cy - 1 + Math.sin(a) * (R * 0.48 - 4) * (0.4 + (k % 3) * 0.25); p.set(x, y, '#8ad0e0'); }
    p.rect(Math.round(cx - R), Math.round(cy), R * 2, Math.round(R * 0.45) + 1, S[1]);
    p.ellipse(cx, yb - 1, R, R * 0.48, S[0]);
    p.ellipse(cx, cy, R, R * 0.48 - 0.5, S[2]); p.ellipse(cx, cy - 1, R - 3, R * 0.48 - 2, '#3a7a90');
    for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2 + frame * 0.45; p.set(cx + Math.cos(a) * (R - 6) * (0.3 + (k % 3) * 0.3), cy - 1 + Math.sin(a) * (R * 0.48 - 4) * (0.3 + (k % 3) * 0.3), '#a0e0f0'); }
    // spout column + water arcs
    p.rect(Math.round(cx) - 2, Math.round(cy) - 22, 4, 22, S[2]); p.rect(Math.round(cx) - 2, Math.round(cy) - 22, 1, 22, S[3]); p.rect(Math.round(cx) + 1, Math.round(cy) - 22, 1, 22, S[1]);
    p.ellipse(cx, cy - 22, 5, 2, S[3]);
    for (const sd of [-1, 1]) for (let k = 0; k < 10; k++) { const t = k / 9; const x = cx + sd * t * 8, y = cy - 26 + t * t * 18 + (frame % 2); p.set(x, y, '#c0f0ff'); e.set(x, y, '#60b0d0'); }
    return done(p, e);
  });
}
export function bannerSprite(color, h = 7, frame = 0) {
  return memo('banner' + color + h + frame, () => {
    const H = Math.round(h * 10 * 0.75);
    const p = mk(18, H + 4);
    const c = C(color), yb = p.h - 1, cx = 4;
    p.rect(cx, 2, 2, H, '#4a3020'); p.rect(cx, 2, 1, H, '#6a4a30');
    p.disc(cx + 1, 2, 1.5, '#d8b050');
    for (let y = 5; y < 5 + Math.round(H * 0.5); y++) {
      const sway = Math.round(Math.sin(y * 0.35 + frame * 2) * 0.8);
      for (let x = cx + 2; x < cx + 12; x++) p.set(x + sway, y, x === cx + 2 ? light(c, 1.2) : x > cx + 9 ? dark(c, 0.8) : c);
    }
    const by = 5 + Math.round(H * 0.5);
    for (let x = cx + 2; x < cx + 12; x++) for (let k = 0; k < 3 - Math.abs(x - cx - 7) * 0.6; k++) p.set(x + Math.round(Math.sin(by * 0.35 + frame * 2) * 0.8), by + k, dark(c, 0.85));
    p.rect(cx + 5, 8, 4, 4, '#e8c050');
    void yb;
    return done(p, null);
  });
}
// curtain wall segment (width in px) / round tower
export function wallSprite(wpx, color, h = 4.2, seed = 0, snow = false) {
  return memo('wall' + wpx + color + h + seed + snow, () => {
    const H = Math.round(h * 10 * 0.8), T = 9;
    const p = mk(wpx + 2, H + T + 4);
    const x0 = 1, yb = p.h - 1;
    fillWall(p, x0, yb - H + 1, wpx, H, color, 'block', seed);
    fillWall(p, x0, yb - H - T + 1, wpx, T, light(color, 1.15), 'block', seed + 3);   // walkway top
    for (let x = x0; x < x0 + wpx; x += 4) p.rect(x, yb - H - T - 2, 2, 3, light(color, 1.05));  // crenels
    if (snow) for (let x = x0; x < x0 + wpx; x++) if (hash2(x, 1, seed) < 0.7) p.set(x, yb - H - T + 1, '#eef2f8');
    return done(p, null);
  });
}
export function towerSprite(r, h, color, roof, seed = 0, flat = false) {
  return memo('tower' + r + h + color + roof + flat, () => {
    const R = Math.round(r * 10), H = Math.round(h * 10 * 0.75);
    const p = mk(R * 2 + 6, H + R + 26), e = mk(R * 2 + 6, H + R + 26);
    const cx = p.w / 2, yb = p.h - 1;
    const c = C(color);
    for (let y = yb - H; y <= yb; y++) for (let x = Math.round(cx - R); x < cx + R; x++) {
      const u = (x + 0.5 - cx) / R;
      const sh = -u * 0.5 + 0.2;
      let col = sh > 0.3 ? light(c, 1.12) : sh > -0.05 ? c : sh > -0.35 ? dark(c, 0.85) : dark(c, 0.7);
      const ly = yb - y;
      if (ly % 5 === 4 || (Math.floor((u + 1) * R) + (Math.floor(ly / 5) % 2) * 3) % 6 === 0) col = dark(col, 0.82);
      p.set(x, y, col);
    }
    windowAt(p, e, Math.round(cx) - 1, yb - Math.round(H * 0.6), 2, 4, dark(color, 0.6), {});
    const ty = yb - H;
    if (flat) {
      p.ellipse(cx, ty, R + 1, R * 0.45 + 1, light(c, 1.2));
      for (let k = 0; k < 8; k++) { const a = Math.PI + (k / 7) * Math.PI; p.rect(Math.round(cx + Math.cos(a) * R) - 1, Math.round(ty + Math.sin(a) * R * 0.45) - 2, 2, 3, light(c, 1.1)); }
    } else {
      const rc = C(roof);
      for (let y = ty - R - 14; y <= ty + 2; y++) {
        const t = (y - (ty - R - 14)) / (R + 16);
        const half = (R + 2) * t;
        for (let x = Math.floor(cx - half); x <= cx + half; x++) { const u = (x - cx) / Math.max(1, half); p.set(x, y, u < -0.3 ? light(rc, 1.15) : u > 0.4 ? dark(rc, 0.75) : (y % 3 === 0 ? dark(rc, 0.88) : rc)); }
      }
    }
    void seed;
    return done(p, e);
  });
}
export function pierSprite(len, wid) {
  return memo('pier' + len + wid, () => {
    const p = mk(wid, len); p.oy = len - 1;
    fillWall(p, 0, 0, wid, len, '#7a5a3a', 'plank', 4);
    for (let y = 0; y < len; y += 6) p.rect(0, y, wid, 1, '#5a3a24');
    return done(p, null);
  });
}
export function boatSprite(color = '#5a3a24', sail = '#e8e0d0') {
  return memo('boat' + color + sail, () => {
    const p = mk(46, 70);
    const c = C(color), cx = 23, yb = 69;
    p.ellipse(cx, yb - 10, 20, 9, dark(c, 0.8)); p.ellipse(cx, yb - 12, 19, 8, c); p.ellipse(cx, yb - 13, 16, 5.5, light(c, 1.25));
    for (let x = cx - 14; x < cx + 14; x += 4) p.line(x, yb - 17, x, yb - 9, dark(c, 0.85));
    p.rect(cx, yb - 66, 2, 54, '#4a3020');
    const s = C(sail);
    for (let y = yb - 62; y < yb - 26; y++) { const t = (y - (yb - 62)) / 36; const half = 4 + t * 12; for (let x = Math.round(cx + 2); x < cx + 2 + half; x++) p.set(x, y, x > cx + half * 0.8 ? dark(s, 0.85) : s); }
    return done(p, null);
  });
}

// ------------------------------------------------------------------ site pieces
export function waystoneSprite(active) {
  return memo('waystone' + active, () => {
    const p = mk(26, 64), e = mk(26, 64);
    const cx = 13, yb = 63, st = C('#4a4a52');
    // plinth
    p.ellipse(cx, yb - 3, 12, 4, '#5a5450'); p.ellipse(cx, yb - 4, 11, 3.4, '#6a6460');
    // obelisk
    for (let y = yb - 46; y <= yb - 4; y++) { const t = (y - (yb - 46)) / 42; const half = 3 + t * 2.5; for (let x = Math.round(cx - half); x <= cx + half; x++) p.set(x, y, x < cx - half * 0.4 ? light(st, 1.2) : x > cx + half * 0.4 ? dark(st, 0.75) : st); }
    p.poly([[cx - 3.5, yb - 46], [cx + 0.5, yb - 54], [cx + 4.5, yb - 46]], dark(st, 0.85));
    // runes
    const rc = active ? C('#80c8ff') : C('#3a3a42');
    for (let k = 0; k < 5; k++) { const y = yb - 40 + k * 7; p.rect(cx - 1, y, 2, 3, rc); p.set(cx + (k % 2 ? 1 : -2), y + 1, rc); if (active) { e.rect(cx - 1, y, 2, 3, rc); e.set(cx + (k % 2 ? 1 : -2), y + 1, rc); } }
    return done(p, e, { crystalAt: [0, -60] });
  });
}
export function crystalSprite(color, h = 10) {
  return memo('cryst' + color + h, () => {
    const p = mk(9, h + 2), c = C(color);
    p.poly([[4.5, 0], [8.5, h * 0.45], [4.5, h], [0.5, h * 0.45]], c);
    p.poly([[4.5, 0], [0.5, h * 0.45], [4.5, h]], light(c, 1.3));
    p.line(4, 1, 4, h - 1, '#ffffff');
    p.outline(dark(c, 0.4));
    return { pix: p, emis: p };
  });
}
// dungeon mouths by theme
export function entranceSprite(theme, biome, glowC) {
  return memo('ent' + theme + biome, () => {
    const r = srand(theme.length * 97 + 5);
    const p = mk(110, 96), e = mk(110, 96);
    const cx = 55, yb = 95;
    const masonry = ['cursed_crypt', 'marble_vault', 'frozen_citadel', 'dwarven_deephall'];
    let doorW = 26, doorH = 32, doorY = yb - 4;
    if (masonry.includes(theme)) {
      const wallC = theme === 'marble_vault' ? '#e0d8c4' : theme === 'frozen_citadel' ? '#a8b8c8' : theme === 'dwarven_deephall' ? '#6a6058' : '#5a5860';
      const roofC = theme === 'marble_vault' ? '#c8a050' : '#3a3a44';
      // steps
      for (let i = 0; i < 3; i++) p.rect(cx - 22 + i * 2, yb - 3 - i * 2, 44 - i * 4, 3, i % 2 ? dark(wallC, 0.8) : wallC);
      // facade
      fillWall(p, cx - 34, yb - 62, 68, 54, wallC, theme === 'marble_vault' ? 'marble' : 'block', 3);
      for (const sx of [-1, 1]) column(p, cx + sx * 24 - 2, yb - 8, 52, 5, light(wallC, 1.1));
      // pediment roof
      for (let y = yb - 82; y <= yb - 62; y++) { const t = (y - (yb - 82)) / 20; const half = 4 + t * 34; for (let x = Math.floor(cx - half); x <= cx + half; x++) p.set(x, y, y % 3 === 0 ? dark(roofC, 0.8) : (x < cx ? light(roofC, 1.1) : roofC)); }
      p.rect(cx - 36, yb - 63, 72, 3, light(wallC, 1.15));
      if (theme === 'frozen_citadel') for (let x = cx - 36; x < cx + 36; x++) if (hash2(x, 2, 9) < 0.8) { p.set(x, yb - 64, '#eef2f8'); p.set(x, yb - 63, '#eef2f8'); }
      // torches
      for (const sx of [-1, 1]) { p.rect(cx + sx * 16 - 1, yb - 46, 3, 5, '#3a3030'); p.rect(cx + sx * 16 - 1, yb - 50, 3, 4, glowC); e.rect(cx + sx * 16 - 1, yb - 50, 3, 4, glowC); }
      if (theme === 'cursed_crypt') { p.disc(cx, yb - 72, 4, '#d8d0c0'); p.rect(cx - 2, yb - 73, 1, 2, '#0a0808'); p.rect(cx + 1, yb - 73, 1, 2, '#0a0808'); }
      doorW = 22; doorH = 34; doorY = yb - 9;
    } else if (theme === 'buried_colossus') {
      blob(p, cx, yb - 20, 50, 20, '#c8784a', r, { bump: 0.15 });
      fillWall(p, cx - 20, yb - 58, 40, 44, '#b87a4a', 'block', 7);
      for (const sx of [-1, 1]) column(p, cx + sx * 18 - 2, yb - 12, 48, 5, '#c08050');
      // giant fingers rising beside the door
      for (let k = 0; k < 4; k++) { const fx = cx - 46 + k * 6; p.taper(fx, yb - 10, fx - 2 + k, yb - 40 - k * 4, 6, 4, k % 2 ? '#c88a5a' : '#d89a6a'); }
      doorW = 22; doorH = 36; doorY = yb - 12;
    } else if (theme === 'sunken_temple') {
      p.rect(cx - 40, yb - 10, 80, 8, '#5a7a7a');
      for (const sx of [-30, -10, 10, 30]) column(p, cx + sx - 2, yb - 10, 46, 5, '#7a9a90');
      for (let y = yb - 74; y <= yb - 56; y++) { const t = (y - (yb - 74)) / 18; const half = 6 + t * 36; for (let x = Math.floor(cx - half); x <= cx + half; x++) p.set(x, y, y % 3 ? '#6a8a88' : '#5a7a78'); }
      for (let k = 0; k < 20; k++) p.set(cx - 40 + r() * 80, yb - 12 - r() * 44, '#3a7a5a');
      fillWall(p, cx - 14, yb - 46, 28, 36, '#5a7a78', 'block', 5);
      doorW = 20; doorH = 30; doorY = yb - 11;
    } else if (theme === 'living_labyrinth') {
      for (let i = -3; i <= 3; i++) { if (Math.abs(i) < 1) continue; blob(p, cx + i * 13, yb - 26 - Math.abs(i) * 2, 9, 26 + Math.abs(i) * 2, '#2a4a24', r, { bump: 0.2, lobes: 8 }); }
      blob(p, cx, yb - 62, 48, 12, '#335a2a', r, { bump: 0.2, lobes: 10 });
      e.disc(cx, yb - 64, 3, '#a0ff60'); p.disc(cx, yb - 64, 3, '#a0ff60');
      doorW = 22; doorH = 38; doorY = yb - 2;
    } else {
      // cave mouth in a rock outcrop
      const rc = { glass_cavern: '#2a1a20', void_rift: '#2a2034', dragon_lair: '#4a2a22', fungal_warren: '#3a3430', pirate_cove: '#4a4a48', bandit_hideout: biome === 'wastes' ? '#8a4a30' : '#5a5048', beast_den: biome === 'frost' ? '#6a7480' : '#5a5040' }[theme] || '#5a5048';
      blob(p, cx, yb - 36, 50, 36, rc, r, { bump: 0.18, lobes: 7, texture: 0.5 });
      for (let k = 0; k < 5; k++) blob(p, cx - 40 + k * 20, yb - 14, 12, 12, dark(rc, 0.9), r, { bump: 0.25 });
      if (biome === 'frost' || biome === 'verdant') for (let x = 0; x < p.w; x++) for (let y = 0; y < p.h; y++) if (p.a(x, y) && !p.a(x, y - 1)) for (let k = 0; k < 3; k++) if (p.a(x, y + k)) p.set(x, y + k, biome === 'frost' ? '#eef2f8' : '#4a7a2a');
      if (theme === 'bandit_hideout' || theme === 'pirate_cove') { for (const sx of [-1, 1]) p.rect(cx + sx * 30, yb - 34, 2, 30, '#4a3020'); for (let y = yb - 34; y < yb - 18; y++) for (let x = cx - 30 + 2; x < cx - 30 + 10; x++) p.set(x, y, theme === 'pirate_cove' ? '#1a1a1a' : '#8a2a1a'); if (theme === 'pirate_cove') { p.disc(cx - 24, yb - 28, 2, '#e8e0d0'); } }
      doorW = 34; doorH = 30; doorY = yb - 2;
    }
    // the dark doorway itself
    const dx0 = cx - Math.floor(doorW / 2);
    for (let y = doorY - doorH; y <= doorY; y++) for (let x = dx0; x < dx0 + doorW; x++) {
      const ly = y - (doorY - doorH), r0 = doorW / 2, dy = Math.max(0, r0 - ly);
      if (Math.abs(x + 0.5 - cx) > Math.sqrt(Math.max(0, r0 * r0 - dy * dy)) + 0.3) continue;
      p.set(x, y, ly > doorH - 3 ? '#1a1418' : '#06040a');
    }
    return done(p, e, { door: [0, doorY - yb, doorW, doorH] });
  });
}
export function shrineSprite() {
  return memo('shrine', () => {
    const p = mk(70, 46);
    const cx = 35, yb = 45, r = srand(77);
    p.ellipse(cx, yb - 8, 24, 8, '#6a6460'); p.ellipse(cx, yb - 9, 22, 7, '#7a7470');
    // standing stones around (back ones first)
    const stones = [];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; stones.push([cx + Math.cos(a) * 28, yb - 9 + Math.sin(a) * 9, i]); }
    stones.sort((a, b) => a[1] - b[1]);
    for (const [x, y, i] of stones) { const h = 18 + (i % 2) * 5; const st = ramp('#5a5650'); for (let yy = y - h; yy <= y; yy++) for (let xx = Math.round(x - 3); xx <= x + 3; xx++) { const u = (xx - x) / 3; p.set(xx, yy, u < -0.3 ? st[3] : u > 0.4 ? st[1] : st[2]); } for (let k = 0; k < 4; k++) p.set(Math.round(x - 2 + r() * 4), Math.round(y - h + r() * h), '#5a7a4a'); }
    // altar
    p.rect(cx - 7, yb - 20, 14, 12, '#7a7268'); p.rect(cx - 8, yb - 22, 16, 3, '#8a8278'); p.rect(cx - 7, yb - 20, 1, 12, '#8a8278');
    return done(p, null, { orbAt: [0, -34] });
  });
}
export function relicSprite(taken) {
  return memo('relic' + taken, () => {
    const p = mk(40, 50), r = srand(33);
    blob(p, 20, 42, 16, 7, '#6a5a4a', r, { bump: 0.2 });
    if (!taken) {
      const sw = weaponSprite({ type: 'sword', base: 'Longsword', color: '#c8d0d8', trim: '#c8a050', rarity: 4 });
      // blade plunged into the stone, pointing down
      for (let y = 0; y < sw.pix.h; y++) for (let x = 0; x < sw.pix.w; x++) { const i = (y * sw.pix.w + x) * 4; if (!sw.pix.d[i + 3]) continue; p.set(20 + (y - sw.pix.oy), 13 + x, [sw.pix.d[i], sw.pix.d[i + 1], sw.pix.d[i + 2], 255]); }
    }
    return done(p, null, { orbAt: [0, -46] });
  });
}

// generic rock / ruin pieces for landmarks
export function rockSprite(rx, ry, color, seed = 1, top = null) {
  return memo('rock' + rx + ry + color + seed + top, () => {
    const p = mk(rx * 2 + 6, ry * 2 + 6), r = srand(seed);
    blob(p, p.w / 2, p.h - ry - 2, rx, ry, color, r, { bump: 0.2, lobes: 6, texture: 0.4 });
    if (top) for (let x = 0; x < p.w; x++) for (let y = 0; y < p.h; y++) if (p.a(x, y) && !p.a(x, y - 1)) for (let k = 0; k < 2 + (hash2(x, 0, seed) < 0.5 ? 1 : 0); k++) if (p.a(x, y + k)) p.set(x, y + k, top);
    return done(p, null);
  });
}
export function columnSprite(h, color, broken = 0, seed = 0) {
  return memo('col' + h + color + broken + seed, () => {
    const H = Math.round(h * 10 * 0.7), p = mk(13, H + 6), cx = 6, yb = p.h - 1;
    const top = yb - Math.round(H * (broken ? 1 - broken : 1));
    const c = C(color);
    p.rect(cx - 5, yb - 2, 11, 3, dark(c, 0.85));
    for (let y = top; y < yb - 2; y++) for (let x = cx - 3; x <= cx + 3; x++) { const u = x - cx; p.set(x, y, u < -1 ? light(c, 1.1) : u > 1 ? dark(c, 0.78) : (u === 0 ? dark(c, 0.92) : c)); }
    if (broken) { for (let x = cx - 3; x <= cx + 3; x++) for (let k = 0; k < 1 + Math.floor(hash2(x, seed, 2) * 3); k++) p.clear(x, top + k); }
    else { p.rect(cx - 5, top - 3, 11, 3, light(c, 1.1)); p.rect(cx - 4, top - 1, 9, 1, dark(c, 0.85)); }
    return done(p, null);
  });
}
export function ruinWallSprite(wu, hu, color, seed) {
  return memo('ruin' + wu + hu + color + seed, () => {
    const W = Math.round(wu * 10), H = Math.round(hu * 10 * 0.7);
    const p = mk(W + 2, H + 10), yb = p.h - 1;
    fillWall(p, 1, yb - H, W, H, color, 'block', seed);
    fillWall(p, 1, yb - H - 6, W, 6, light(color, 1.15), 'block', seed + 1);
    // broken jagged top and a collapsed doorway
    for (let x = 1; x <= W; x++) { const cut = Math.floor((Math.sin(x * 0.21 + seed) * 0.5 + 0.5) * H * 0.55 + hash2(x, seed, 5) * 4); for (let y = yb - H - 6; y < yb - H - 6 + cut; y++) p.clear(x, y); }
    doorAt(p, Math.round(W / 2) - 5, yb, 10, Math.min(18, H - 4), '#2a2018', { arch: true, dark: true });
    for (let k = 0; k < W / 3; k++) p.over(1 + hash2(k, 1, seed) * W, yb - hash2(k, 2, seed) * H, '#9aa070');
    return done(p, null);
  });
}

// a weapon stuck point-down in the earth (battlefields)
export function stuckWeapon(type, seed) {
  return memo('stuck' + type + seed, () => {
    const w = weaponSprite({ type, color: '#8a8a90', trim: '#6a5a3a', rarity: 0 });
    const p = mk(w.pix.h + 2, w.pix.w + 2);
    const lean = (hash2(seed, 1, 2) - 0.5) * 0.5;
    for (let y = 0; y < w.pix.h; y++) for (let x = 0; x < w.pix.w; x++) {
      const i = (y * w.pix.w + x) * 4;
      if (!w.pix.d[i + 3]) continue;
      p.set(Math.round(p.ox + (y - w.pix.oy) + lean * (x - w.pix.w / 2)), x + 1, [w.pix.d[i], w.pix.d[i + 1], w.pix.d[i + 2], 255]);
    }
    return { pix: p, emis: null };
  });
}
// a single block of curtain wall (overlapping blocks build walls along any curve)
export function wallBlock(color, h = 4.2, snow = false) {
  return memo('wblock' + color + h + snow, () => {
    const H = Math.round(h * 10 * 0.7), T = 12;
    const p = mk(18, H + T + 3), yb = p.h - 1;
    fillWall(p, 0, yb - H + 1, 18, H, color, 'block', 3);
    fillWall(p, 0, yb - H - T + 1, 18, T, light(color, 1.16), 'block', 5);
    for (let x = 0; x < 18; x += 6) p.rect(x + 1, yb - H - T - 2, 3, 3, light(color, 1.08));
    if (snow) for (let x = 0; x < 18; x++) p.set(x, yb - H - T + 1, '#eef2f8');
    return { pix: p, emis: null };
  });
}
