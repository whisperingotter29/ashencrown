// Procedural pixel weapons, shields, tomes and ammo, drawn natively at the game's pixel density
// (PPU 16) so they keep their world size in hand next to the bodies. Weapons are drawn pointing
// right (+x) with the pivot on the grip, so the actor can rotate them toward the aim. Blades get a
// bright edge, a fuller and a shaded back; grips are wrapped; guards and pommels catch the light.
// Elemental and high-rarity weapons get an emissive edge layer that glows at night and under the
// bloom pass. `len` is the reach from the pivot to the tip in pixels.
import { Pix, C, light, dark, mixc } from '../pix.js';

export const ELEM_GLOW = {
  fire: '#ff7a20', frost: '#70d0ff', lightning: '#c8d0ff', rot: '#90e040', nature: '#80d040', void: '#a060ff', holy: '#ffd860',
  water: '#40b0f0', sand: '#e0b060', blood: '#e02030', sound: '#e070f0', earth: '#c09060',
};
const WOOD = C('#7a5232'), GRIP = C('#4a2c1c');
const cache = new Map();

function mk(w, h, ox, oy) { const p = new Pix(w, h); p.ox = ox; p.oy = oy; return p; }
function metal(col) { col = C(col); const m = mixc(col, '#e8ecf0', 0.35); return { hi: light(m, 1.3), mid: m, md: mixc(m, dark(m, 0.66), 0.5), lo: dark(m, 0.66), dk: dark(m, 0.5), edge: mixc(m, '#ffffff', 0.6) }; }
function trimR(T) { T = C(T); return { l: light(T, 1.25), m: T, d: dark(T, 0.72), dd: dark(T, 0.5) }; }
function done(p, e, extra = {}) {
  p.outline();
  let any = false;
  for (let i = 3; i < e.d.length; i += 4) if (e.d[i]) { any = true; break; }
  return { pix: p, emis: any ? e : null, ...extra };
}

// ------------------------------------------------------------------ public
// spec: { type, base, color, trim, element, rarity(index), draw (bows: 0..1) }
export function weaponSprite(spec) {
  const key = JSON.stringify(spec);
  let s = cache.get(key);
  if (s) return s;
  const fn = GEN[spec.type] || GEN.sword;
  s = fn(spec);
  cache.set(key, s);
  return s;
}

// a glowing edge for elemental / epic+ weapons
function edgeGlow(spec) {
  if (spec.element && spec.element !== 'physical' && ELEM_GLOW[spec.element]) return C(ELEM_GLOW[spec.element]);
  if ((spec.rarity || 0) >= 4) return C(spec.trim || '#ffb040');
  return null;
}

// blade along +x from x0 to x1 centred on row cy; w = 3/5/7/...; o.width(t, half) adjusts the
// half-width per column, o.curve(t) bends it. Rows: a bright cutting edge on top, the lit flat, a
// dark fuller down the middle, the shaded flat and a dark back edge; the tip tapers to a point.
function blade(p, e, x0, x1, cy, w, M, glow, o = {}) {
  const half = (w - 1) / 2;
  for (let x = x0; x <= x1; x++) {
    const t = (x - x0) / Math.max(1, x1 - x0);
    let h = o.width ? o.width(t, half) : half;
    const off = o.curve ? Math.round(o.curve(t)) : 0;
    const fromTip = x1 - x;
    if (!o.square) h = Math.min(h, Math.floor(fromTip / (half > 1 ? 1.4 : 2)));
    h = Math.max(0, Math.round(h));
    const top = cy - h + off, bot = cy + h + off;
    for (let y = top; y <= bot; y++) {
      let c = y < cy + off ? M.hi : y > cy + off ? M.md : M.mid;
      if (y === top) c = h ? M.edge : M.hi;
      else if (y === bot) c = M.lo;
      else if (y === bot - 1 && h >= 2) c = M.md;
      if (o.fuller && y === cy + off && x > x0 + 1 && fromTip > 4 && h >= 2) c = M.lo;
      if (o.wave && ((x + (y < cy ? 0 : 2)) % 4 === 0) && (y === top || y === bot)) c = M.lo;
      p.set(x, y, c);
    }
    if (fromTip === 0) p.set(x, Math.round(cy) + off, M.edge);
    if (glow && (x - x0) % 2 === 0) { e.set(x, top, glow); if (bot > top + 1) e.set(x, bot, glow); }
  }
  // a glint near the base of the edge
  if (x1 - x0 > 6) { const gx = x0 + 2, off = o.curve ? Math.round(o.curve(2 / (x1 - x0))) : 0; const hh = Math.round(o.width ? o.width(0.1, half) : half); p.set(gx, cy - hh + off, '#ffffff'); }
}
// crossguard: lit top, shaded underside, darker quillon tips
function guard(p, x, cy, half, T, w = 2) {
  const R = trimR(T);
  for (let y = cy - half; y <= cy + half; y++) for (let i = 0; i < w; i++) {
    let c = y === cy - half ? R.l : y === cy + half ? R.d : i === w - 1 ? R.d : R.m;
    if (Math.abs(y - cy) === half - 1 && i === 0) c = R.l;
    p.set(x + i, y, c);
  }
  p.set(x, cy - half - 1, R.d); p.set(x, cy + half + 1, R.dd);
}
// leather-wrapped grip, thick rows centred on cy
function grip(p, x0, x1, cy, col = GRIP, thick = 2) {
  const y0 = cy - (thick >> 1);
  for (let x = x0; x <= x1; x++) for (let k = 0; k < thick; k++) {
    const y = y0 + k;
    let c = (x + k) % 3 === 0 ? dark(col, 0.7) : k === 0 ? light(col, 1.15) : col;
    if (k === thick - 1 && (x + k) % 3 !== 0) c = dark(col, 0.85);
    p.set(x, y, c);
  }
}
function pommel(p, x, cy, T) {
  const R = trimR(T);
  p.set(x, cy - 1, R.l); p.set(x + 1, cy - 1, R.m); p.set(x - 1, cy, R.m); p.set(x, cy, R.l); p.set(x + 1, cy, R.m);
  p.set(x, cy + 1, R.d); p.set(x + 1, cy + 1, R.dd); p.set(x - 1, cy - 1 + 1, R.d);
}
function shaft(p, x0, x1, cy, col = WOOD, thick = 2) {
  for (let x = x0; x <= x1; x++) {
    p.set(x, cy, (x * 7) % 11 === 0 ? col : light(col, 1.12));
    if (thick > 1) p.set(x, cy + 1, (x * 5) % 13 === 0 ? dark(col, 0.6) : dark(col, 0.74));
    if (thick > 2) p.set(x, cy - 1, light(col, 1.28));
  }
}

// ------------------------------------------------------------------ generators
const GEN = {
  sword(s) {
    const b = s.base || 'Arming Sword';
    const M = metal(s.color || '#9aa4ae'), T = C(s.trim || '#c8a050'), gl = edgeGlow(s);
    const cfg = {
      'Arming Sword': { L: 19, w: 5, fuller: true },
      Longsword: { L: 24, w: 5, fuller: true, gripL: 7 },
      Broadsword: { L: 21, w: 7, fuller: true },
      Gladius: { L: 14, w: 5, width: (t, h) => h + (t > 0.5 && t < 0.85 ? 1 : 0) },
      Falchion: { L: 19, w: 5, width: (t, h) => h + (t > 0.45 ? 1 : 0) + (t > 0.7 ? 1 : 0) },
      Scimitar: { L: 21, w: 5, curve: (t) => -t * t * 6 },
      Khopesh: { L: 19, w: 5, curve: (t) => (t > 0.45 ? -(t - 0.45) * 14 + (t > 0.8 ? (t - 0.8) * 22 : 0) : 0) },
      Rapier: { L: 27, w: 3, cup: true },
    }[b] || { L: 19, w: 5, fuller: true };
    const gl0 = cfg.gripL || 5;
    const gx = 4 + gl0;                                    // guard column
    const W = gx + 2 + cfg.L + 2, H = 23, cy = 11, ox = 4 + (gl0 >> 1);
    const p = mk(W, H, ox, cy), e = mk(W, H, ox, cy);
    pommel(p, 2, cy, T);
    grip(p, 4, gx - 1, cy, GRIP, 2);
    if (cfg.cup) {
      const R = trimR(T);
      p.ellipse(gx + 1, cy + 0.5, 2.4, 4.2, R.m); p.ellipse(gx + 0.6, cy - 0.5, 1.2, 2.6, R.l); p.set(gx + 2, cy + 3, R.d); p.set(gx + 1, cy + 3, R.d);
      p.line(gx - 1, cy + 1, gx - 3, cy + 3, R.d);           // knuckle bow
    } else guard(p, gx, cy, cfg.w >= 7 ? 5 : 4, T);
    blade(p, e, gx + 2, gx + 1 + cfg.L, cy, cfg.w, M, gl, cfg);
    if (cfg.cup) { p.set(gx + 3, cy - 1, light(T, 1.2)); }
    else { p.set(gx + 2, cy, trimR(T).d); p.set(gx + 2, cy - 1, trimR(T).m); }   // ricasso collar
    return done(p, e, { len: gx + 1 + cfg.L - ox });
  },
  greatsword(s) {
    const b = s.base || 'Greatsword';
    const M = metal(s.color || '#9aa4ae'), T = C(s.trim || '#c8a050'), gl = edgeGlow(s);
    const cfg = {
      Greatsword: { L: 27, w: 7, fuller: true },
      Zweihander: { L: 30, w: 7, fuller: true, hooks: true },
      Claymore: { L: 27, w: 7, angled: true, fuller: true },
      "Executioner's Blade": { L: 24, w: 11, square: true, blunt: true },
      Flamberge: { L: 29, w: 7, wave: true, width: (t, h) => h + (Math.floor(t * 14) % 2 ? 0 : -1) },
    }[b] || { L: 27, w: 7, fuller: true };
    const gx = 14, cy = 14, H = 29, W = gx + 3 + cfg.L + 2, ox = 8;
    const p = mk(W, H, ox, cy), e = mk(W, H, ox, cy);
    pommel(p, 2, cy, T);
    grip(p, 4, gx - 1, cy, GRIP, 3);
    const R = trimR(T);
    if (cfg.angled) {
      // claymore: quillons swept forward, ending in quatrefoil knobs
      for (let k = 0; k <= 7; k++) { const xx = gx + Math.floor(k / 2); p.set(xx, cy - k, k < 2 ? R.m : R.l); p.set(xx + 1, cy - k, R.d); p.set(xx, cy + k, R.m); p.set(xx + 1, cy + k, R.dd); }
      for (const dy of [-8, 8]) { p.rect(gx + 3, cy + dy - 1, 2, 2, R.l); p.set(gx + 4, cy + dy, R.d); }
    } else guard(p, gx, cy, cfg.w >= 11 ? 7 : 6, T, 3);
    blade(p, e, gx + 3, gx + 2 + cfg.L, cy, cfg.w, M, gl, cfg);
    if (cfg.hooks) for (const d of [-1, 1]) { p.set(gx + 8, cy + d * 4, M.hi); p.set(gx + 9, cy + d * 5, M.mid); p.set(gx + 8, cy + d * 5, M.lo); }
    if (cfg.blunt) { for (let y = cy - 5; y <= cy + 5; y++) p.set(gx + 2 + cfg.L, y, M.lo); p.disc(gx + 2 + cfg.L - 4, cy - 2, 1.2, M.dk); }
    return done(p, e, { len: gx + 2 + cfg.L - ox - 3 });
  },
  dagger(s) {
    const b = s.base || 'Dagger';
    const M = metal(s.color || '#9aa4ae'), T = C(s.trim || '#c8a050'), gl = edgeGlow(s);
    const cfg = {
      Dagger: { L: 11, w: 5 }, Kris: { L: 13, w: 5, curve: (t) => Math.round(Math.sin(t * 11)) * 0.8 },
      Stiletto: { L: 14, w: 3 }, Dirk: { L: 13, w: 5, fuller: true }, 'Sickle-Knife': { L: 11, w: 5, curve: (t) => t * t * 6 },
    }[b] || { L: 11, w: 5 };
    const gx = 8, cy = 8, W = gx + 2 + cfg.L + 2, H = 17, ox = 5;
    const p = mk(W, H, ox, cy), e = mk(W, H, ox, cy);
    pommel(p, 2, cy, T);
    grip(p, 4, gx - 1, cy, GRIP, 2);
    guard(p, gx, cy, 3, T);
    blade(p, e, gx + 2, gx + 1 + cfg.L, cy, cfg.w, M, gl, cfg);
    return done(p, e, { len: gx + 1 + cfg.L - ox - 2 });
  },
  mace(s) {
    const b = s.base || 'Mace';
    const M = metal(s.color || '#9aa4ae'), T = C(s.trim || '#c8a050'), gl = edgeGlow(s);
    const L = 18, cy = 11, H = 23, W = L + 18, ox = 5;
    const p = mk(W, H, ox, cy), e = mk(W, H, ox, cy);
    pommel(p, 2, cy, T);
    grip(p, 4, 7, cy, GRIP, 2);
    shaft(p, 8, 5 + L, cy - 1, dark(s.color || '#8a8a8a', 0.8), 2);
    const R = trimR(T);
    p.rect(8, cy - 1, 1, 2, R.m); p.set(8, cy - 2, R.l);           // collar above the grip
    const hx = 7 + L + 2;
    if (b === 'Morningstar') {
      p.disc(hx, cy + 0.5, 5, M.mid); p.disc(hx - 1, cy - 0.5, 3.2, M.hi); p.disc(hx + 1.2, cy + 1.6, 2.4, M.md); p.set(hx - 2, cy - 2, M.edge);
      for (const [dx, dy] of [[0, -8], [6, -5], [8, 1], [5, 6], [-1, 8], [-6, 5], [-6, -5]]) { p.set(hx + dx, cy + dy, M.edge); p.set(hx + Math.round(dx * 0.82), cy + Math.round(dy * 0.82), M.hi); p.set(hx + Math.round(dx * 0.68), cy + Math.round(dy * 0.68), M.lo); }
    } else if (b === 'Warhammer') {
      p.rect(hx - 3, cy - 7, 6, 16, M.mid); p.rect(hx - 3, cy - 7, 6, 2, M.hi); p.rect(hx - 3, cy + 7, 6, 2, M.lo); p.rect(hx + 1, cy - 7, 2, 16, M.md); p.rect(hx + 2, cy - 7, 1, 16, M.lo);
      p.rect(hx - 3, cy - 7, 1, 14, M.hi);
      for (let x = hx + 3; x <= hx + 8; x++) { const hh = x < hx + 6 ? 1 : 0; for (let y = cy - hh; y <= cy + hh; y++) p.set(x, y, y < cy ? M.hi : y > cy ? M.lo : M.edge); }
      p.rect(hx - 5, cy - 3, 2, 8, R.m); p.rect(hx - 5, cy - 3, 1, 8, R.l);
    } else if (b === 'Scepter-Mace') {
      const gem = C(s.element ? ELEM_GLOW[s.element] || '#ff4060' : '#ff4060');
      p.disc(hx, cy + 0.5, 5, R.m); p.disc(hx - 1, cy - 0.5, 3, R.l); p.disc(hx, cy + 0.5, 2.6, gem); p.set(hx - 1, cy - 1, '#ffffff');
      e.disc(hx, cy + 0.5, 2.6, gem);
      for (const [dx, dy] of [[6, 0], [-1, -6], [-1, 7], [4, -4], [4, 5]]) { p.set(hx + dx, cy + dy, R.l); p.set(hx + dx, cy + dy + 1, R.d); }
    } else {
      // flanged / plain mace: a ribbed head with a top cap and a spike
      p.rrect(hx - 4, cy - 5, 9, 11, M.mid, 2);
      for (let k = -4; k <= 4; k += 2) for (let x = hx - 4; x <= hx + 4; x++) if (Math.abs(k) + Math.abs(x - hx) < 9) p.set(x, cy + k, k < 0 ? M.hi : k > 0 ? M.lo : M.mid);
      p.rect(hx - 3, cy - 4, 2, 2, M.edge);
      if (b === 'Flanged Mace') for (const dy of [-8, 8]) { p.rect(hx - 3, cy + dy - (dy > 0 ? 1 : 0), 6, 2, M.edge); p.rect(hx - 2, cy + dy + (dy > 0 ? -2 : 1), 4, 1, M.lo); }
      p.set(hx + 5, cy, M.edge); p.set(hx + 6, cy, M.hi);
    }
    if (gl) for (const [dx, dy] of [[0, -5], [5, 0], [0, 6], [-4, 0]]) e.set(hx + dx, cy + dy, gl);
    return done(p, e, { len: hx - ox + 2 });
  },
  club(s) {
    const col = C(s.color || '#6a4a2a');
    const W = 35, H = 19, cy = 9;
    const p = mk(W, H, 3, cy), e = mk(W, H, 3, cy);
    for (let x = 1; x < 33; x++) {
      const t = x / 33, h = 1.3 + t * t * 5.2;
      const y0 = Math.round(cy - h), y1 = Math.round(cy + h);
      for (let y = y0; y <= y1; y++) p.set(x, y, y <= y0 + 1 ? light(col, 1.2) : y >= y1 - 1 ? dark(col, 0.65) : y > cy + h * 0.3 ? dark(col, 0.85) : col);
    }
    for (const [x, y] of [[20, cy - 3], [25, cy + 3], [29, cy - 2], [16, cy + 1]]) { p.set(x, y, dark(col, 0.5)); p.set(x + 1, y, light(col, 1.3)); p.set(x, y + 1, dark(col, 0.6)); }
    for (let x = 2; x < 8; x++) if (x % 2) { p.set(x, cy - 1, dark(col, 0.6)); p.set(x, cy + 1, dark(col, 0.6)); }
    return done(p, e, { len: 29 });
  },
  spear(s) {
    const b = s.base || 'Spear';
    const M = metal(s.color || '#9aa4ae'), T = C(s.trim || '#c8a050'), gl = edgeGlow(s);
    const L = 32, cy = 9, H = 19, W = L + 19, ox = 10;
    const p = mk(W, H, ox, cy), e = mk(W, H, ox, cy);
    const R = trimR(T);
    shaft(p, 0, L, cy, WOOD, 2);
    p.rect(0, cy, 3, 2, R.m); p.rect(0, cy, 3, 1, R.l);
    p.rect(L - 2, cy, 3, 2, R.m); p.set(L - 2, cy, R.l); p.set(L - 3, cy - 1, R.d); p.set(L - 3, cy + 2, R.dd);
    for (let x = 8; x <= 12; x++) if (x % 2 === 0) { p.set(x, cy, dark(WOOD, 0.6)); p.set(x, cy + 1, dark(WOOD, 0.5)); }   // binding where the hand rests
    const hx = L + 1;
    if (b === 'Trident') {
      p.line(hx, cy - 5, hx, cy + 5, M.mid); p.line(hx + 1, cy - 5, hx + 1, cy + 5, M.lo);
      for (const dy of [-5, 0, 5]) { const len = dy ? 9 : 13; p.line(hx, cy + dy, hx + len, cy + dy, dy < 0 ? M.hi : dy > 0 ? M.lo : M.mid); p.set(hx + len, cy + dy, M.edge); p.set(hx + len - 1, cy + dy - 1, M.hi); }
    } else if (b === 'Partisan' || b === 'Ranseur') {
      blade(p, e, hx, hx + 13, cy, 5, M, gl, {});
      for (const dy of [-1, 1]) { p.line(hx + 1, cy + dy * 3, hx + (b === 'Ranseur' ? 6 : 3), cy + dy * 7, dy < 0 ? M.hi : M.lo); p.line(hx + 2, cy + dy * 3, hx + (b === 'Ranseur' ? 7 : 4), cy + dy * 7, M.md); }
    } else {
      blade(p, e, hx, hx + 11, cy, 5, M, gl, { width: (t, h) => (t > 0.2 && t < 0.7 ? h + 1 : h), fuller: true });
      if (b === 'Boar Spear') { p.line(hx - 1, cy - 4, hx - 1, cy + 4, R.m); p.line(hx, cy - 4, hx, cy + 4, R.d); }
    }
    return done(p, e, { len: L + 6 - ox });
  },
  halberd(s) {
    const b = s.base || 'Halberd';
    const M = metal(s.color || '#9aa4ae'), T = C(s.trim || '#c8a050'), gl = edgeGlow(s);
    const L = 35, cy = 16, H = 33, W = L + 19, ox = 11;
    const p = mk(W, H, ox, cy), e = mk(W, H, ox, cy);
    const R = trimR(T);
    shaft(p, 0, L + 1, cy, WOOD, 2);
    p.rect(0, cy, 2, 2, R.m); p.rect(L - 6, cy, 2, 2, R.m); p.set(L - 6, cy, R.l);
    const hx = L - 3;
    if (b === 'Glaive') {
      blade(p, e, hx, hx + 16, cy, 7, M, gl, { curve: (t) => -t * 4, width: (t, h) => h - (t < 0.15 ? 1 : 0) });
      p.set(hx + 2, cy + 4, M.lo); p.set(hx + 3, cy + 5, M.lo);
    } else if (b === 'Bardiche' || b === 'Voulge') {
      // a long crescent blade bound to the haft
      for (let y = -13; y <= 2; y++) {
        const x0 = hx - 1 + Math.round(Math.abs(y + 5) * 0.3), x1 = hx + 6 + Math.round((y + 13) * 0.25);
        for (let x = x0; x <= x1; x++) p.set(x, cy + y, x === x1 ? M.edge : x === x1 - 1 ? M.hi : y === -13 ? M.hi : x === x0 ? M.lo : M.mid);
        if (gl) e.set(x1, cy + y, gl);
      }
      blade(p, e, L + 1, L + 6, cy, 3, M, null, {});
    } else {
      // axe blade on one side, hook or hammer on the other, a spike forward
      // the axe flares from a narrow neck at the haft to a broad crescent edge
      for (let y = -11; y <= 0; y++) {
        const w = y >= -6 ? 2 + (y >= -1 ? 1 : 0) : y >= -9 ? 3 + (-6 - y) : y === -10 ? 5 : 4;
        const x0 = hx - w + (y >= -6 ? 1 : 0), x1 = hx + w;
        for (let x = x0; x <= x1; x++) p.set(x, cy + y - 1, y === -11 ? M.edge : y === -10 ? (x === x0 || x === x1 ? M.hi : M.edge) : x === x1 ? M.lo : x === x0 ? M.hi : x > hx + 1 ? M.md : M.mid);
        if (gl) e.set(x0, cy + y - 1, gl);
      }
      p.set(hx, cy - 5, M.dk); p.set(hx + 1, cy - 5, M.dk); p.set(hx, cy - 4, M.lo);
      if (b === 'Poleaxe') { p.rect(hx - 2, cy + 2, 5, 5, M.mid); p.rect(hx - 2, cy + 2, 5, 1, M.hi); p.rect(hx + 2, cy + 2, 1, 5, M.lo); p.rect(hx - 2, cy + 6, 5, 1, M.lo); }
      else { p.line(hx, cy + 2, hx - 3, cy + 6, M.mid, 2); p.set(hx - 4, cy + 7, M.edge); p.set(hx - 3, cy + 7, M.lo); }
      blade(p, e, L + 2, L + 11, cy, 5, M, gl, {});
    }
    return done(p, e, { len: L + 3 - ox });
  },
  staff(s) {
    const b = s.base || 'Staff';
    const T = C(s.trim || '#c8a050'), R = trimR(T);
    const orb = C(s.element && ELEM_GLOW[s.element] ? ELEM_GLOW[s.element] : s.orb || '#a080ff');
    const L = 32, cy = 9, H = 19, W = L + 14, ox = 13;
    const p = mk(W, H, ox, cy), e = mk(W, H, ox, cy);
    const wood = b === 'Rod of Office' ? T : b === 'Battle Staff' ? C('#5a5048') : WOOD;
    for (let x = 0; x <= L; x++) {
      const wob = b === 'Elder Staff' ? Math.round(Math.sin(x * 0.45) * 0.8) : 0;
      p.set(x, cy - 1 + wob, light(wood, 1.25)); p.set(x, cy + wob, (x * 7) % 9 === 0 ? wood : light(wood, 1.05)); p.set(x, cy + 1 + wob, dark(wood, 0.7));
    }
    p.rect(0, cy - 1, 3, 3, R.m); p.rect(0, cy - 1, 3, 1, R.l);
    if (b === 'Battle Staff') for (const x of [10, 22]) { p.rect(x, cy - 1, 2, 3, R.m); p.set(x, cy - 1, R.l); }
    for (let x = 11; x <= 15; x++) if (x % 2) { p.set(x, cy, dark(wood, 0.6)); p.set(x, cy + 1, dark(wood, 0.5)); }      // hand wrap
    if (b === 'Quarterstaff') { p.rect(L - 2, cy - 1, 3, 3, R.m); p.rect(L - 2, cy - 1, 3, 1, R.l); return done(p, e, { len: L - ox }); }
    // head: prongs cradling an orb
    const ocx = L + 5;
    p.line(L - 1, cy - 2, L + 3, cy - 5, R.m, 2); p.line(L - 1, cy + 2, L + 3, cy + 6, R.d, 2);
    p.set(L + 4, cy - 6, R.l); p.set(L + 4, cy + 6, R.dd);
    if (b === 'Elder Staff') { p.line(L, cy, L + 6, cy - 6, wood, 2); p.line(L + 6, cy - 6, L + 9, cy - 1, wood, 2); p.set(L + 6, cy - 7, light(wood, 1.3)); }
    p.disc(ocx + 0.5, cy + 0.5, 4.2, orb); p.disc(ocx - 0.5, cy - 0.5, 2.4, mixc(orb, '#ffffff', 0.35));
    p.set(ocx - 1, cy - 2, '#ffffff'); p.set(ocx - 2, cy - 1, mixc(orb, '#ffffff', 0.7)); p.set(ocx + 2, cy + 3, dark(orb, 0.7)); p.set(ocx + 3, cy + 2, dark(orb, 0.75));
    e.disc(ocx + 0.5, cy + 0.5, 4.2, orb); e.disc(ocx - 0.5, cy - 0.5, 2, '#ffffff');
    return done(p, e, { len: ocx - ox, orb: [ocx - ox, 0], orbColor: orb });
  },
  wand(s) {
    const b = s.base || 'Wand';
    const T = C(s.trim || '#c8a050'), R = trimR(T);
    const orb = C(s.element && ELEM_GLOW[s.element] ? ELEM_GLOW[s.element] : '#c0a0ff');
    const wood = b === 'Bone Wand' ? C('#e0d8c4') : b === 'Crystal Wand' ? mixc(orb, '#ffffff', 0.4) : b === 'Willow Wand' ? C('#8a7a4a') : C('#4a3020');
    const W = 24, H = 13, cy = 6;
    const p = mk(W, H, 3, cy), e = mk(W, H, 3, cy);
    for (let x = 1; x <= 16; x++) {
      const th = x < 6 ? 2 : x < 12 ? 2 : 1;
      p.set(x, cy, x < 6 ? light(GRIP, 1.15) : b === 'Rune Wand' && x % 3 === 0 ? orb : light(wood, 1.15));
      if (th > 1) p.set(x, cy + 1, x < 6 ? (x % 2 ? dark(GRIP, 0.7) : GRIP) : dark(wood, 0.72));
    }
    if (b === 'Rune Wand') for (let x = 6; x <= 16; x += 3) e.set(x, cy, orb);
    p.rect(6, cy - 1, 1, 4, R.m); p.set(6, cy - 1, R.l); p.set(7, cy - 1, R.d); p.set(7, cy + 2, R.d);
    p.disc(19, cy + 0.5, 2.7, orb); p.set(18, cy - 1, '#ffffff'); p.set(20, cy + 2, dark(orb, 0.7));
    e.disc(19, cy + 0.5, 2.7, orb);
    return done(p, e, { len: 16, orb: [16, 0], orbColor: orb });
  },
  claws() { const p = mk(1, 1, 0, 0); return { pix: p, emis: null, len: 3, none: true }; },
  bow(s) {
    const b = s.base || 'Shortbow';
    const draw = s.draw || 0;
    const wood = b === 'Composite Bow' ? C('#c8b080') : b === 'Warbow' ? C('#5a3a22') : WOOD;
    const T = C(s.trim || '#c8a050'), gl = edgeGlow(s), R = trimR(T);
    const Hh = b === 'Longbow' || b === 'Warbow' ? 16 : b === 'Shortbow' || b === 'Hunting Bow' ? 11 : 13;
    const W = 35, H = Hh * 2 + 7, cy = Hh + 3;
    const gx = 19;            // grip column
    const p = mk(W, H, 16, cy), e = mk(W, H, 16, cy);
    const pull = Math.round(draw * 11);
    const bend = 5 + Math.round(draw * 3);
    // limbs: a parabola bending back toward the archer, thicker at the riser
    const pts = [];
    for (let y = -Hh; y <= Hh; y++) {
      const t = Math.abs(y) / Hh;
      let x = gx - Math.round(t * t * bend);
      if (b === 'Recurve Bow' && t > 0.85) x += Math.round((t - 0.85) * 20);
      pts.push([x, cy + y]);
      const riser = t < 0.16;
      p.set(x, cy + y, riser ? light(GRIP, 1.2) : y < 0 ? light(wood, 1.2) : light(wood, 1.05));
      p.set(x + 1, cy + y, riser ? (y % 2 ? GRIP : dark(GRIP, 0.7)) : wood);
      if (t < 0.6) p.set(x + 2, cy + y, riser ? dark(GRIP, 0.7) : dark(wood, 0.7));
      if (gl && y % 3 === 0) e.set(x + 1, cy + y, gl);
    }
    for (const yy of [-Hh, Hh]) { p.set(pts[yy < 0 ? 0 : pts.length - 1][0], cy + yy, R.l); }
    const tipX = pts[0][0], nock = gx - bend - pull;
    // string: two segments meeting at the nock point
    p.line(tipX, cy - Hh, nock, cy, '#e8e0d0');
    p.line(tipX, cy + Hh, nock, cy, '#e8e0d0');
    // nocked arrow
    if (draw > 0.05) {
      p.line(nock, cy, gx + 10, cy, '#c8a878');
      p.set(gx + 10, cy, '#d8dce4'); p.set(gx + 11, cy, '#ffffff'); p.set(gx + 12, cy, '#e8ecf0');
      p.set(gx + 9, cy - 1, '#a8acb4'); p.set(gx + 9, cy + 1, '#a8acb4'); p.set(gx + 10, cy - 1, '#c8ccd4');
      p.set(nock + 1, cy - 1, R.m); p.set(nock + 2, cy - 1, R.m); p.set(nock + 1, cy + 1, R.d); p.set(nock + 2, cy + 1, R.d);
      if (gl) { e.set(gx + 11, cy, gl); e.set(gx + 10, cy, gl); e.set(gx + 12, cy, gl); }
    }
    return done(p, e, { len: 10, bow: true });
  },
  crossbow(s) {
    const T = C(s.trim || '#c8a050'), M = metal(s.color || '#9aa4ae'), gl = edgeGlow(s), R = trimR(T);
    const loaded = s.draw !== 0;
    const W = 35, H = 29, cy = 14;
    const p = mk(W, H, 10, cy), e = mk(W, H, 10, cy);
    // stock: a lit top, the dark underside, a heavy butt
    for (let x = 1; x <= 26; x++) {
      p.set(x, cy - 1, light(WOOD, 1.25)); p.set(x, cy, light(WOOD, 1.05)); p.set(x, cy + 1, x < 9 ? dark(WOOD, 0.7) : WOOD);
      if (x < 8) { p.set(x, cy + 2, dark(WOOD, 0.62)); p.set(x, cy + 3, dark(WOOD, 0.5)); }
    }
    // prod (arms) across the front, with a stirrup
    const px = 22;
    for (let y = -11; y <= 11; y++) { const x = px - Math.round(Math.abs(y) * 0.3); const c = Math.abs(y) < 3 ? R.m : y < 0 ? M.hi : M.lo; p.set(x, cy + y, c); p.set(x + 1, cy + y, Math.abs(y) < 3 ? R.d : M.md); }
    p.line(px + 2, cy - 2, px + 5, cy - 2, M.mid); p.line(px + 2, cy + 2, px + 5, cy + 2, M.lo); p.line(px + 5, cy - 2, px + 5, cy + 2, M.mid);
    const sx = loaded ? 11 : px - 1;
    p.line(px - 3, cy - 11, sx, cy - 1, '#e8e0d0'); p.line(px - 3, cy + 11, sx, cy - 1, '#e8e0d0');
    if (loaded) { p.line(sx, cy - 2, px + 6, cy - 2, '#c8a878'); p.set(px + 6, cy - 2, M.edge); p.set(px + 7, cy - 2, '#ffffff'); p.set(px + 5, cy - 3, M.hi); if (gl) { e.set(px + 7, cy - 2, gl); e.set(px + 6, cy - 2, gl); } }
    // trigger and lock
    p.set(14, cy + 2, M.lo); p.set(14, cy + 3, M.lo); p.set(15, cy + 4, M.mid); p.rect(12, cy - 1, 3, 2, M.mid); p.set(12, cy - 1, M.hi);
    return done(p, e, { len: 16 });
  },
};

// ------------------------------------------------------------------ shields
// returns { front, edge, back } sprites, pivot at the grip (centre)
export function shieldSprite(spec) {
  const key = 'sh' + JSON.stringify(spec);
  let s = cache.get(key);
  if (s) return s;
  const b = spec.base || 'Round Shield';
  const M = metal(spec.color || '#8a8a8a'), T = C(spec.trim || '#c8a050'), TR = trimR(T);
  const face = C(spec.face || mixc(spec.color || '#8a8a8a', '#6a3a2a', 0.45));
  const emb = spec.emblem ? C(spec.emblem) : null;
  const shapes = {
    Buckler: { w: 11, h: 11, kind: 'round' }, 'Round Shield': { w: 17, h: 17, kind: 'round' }, 'Kite Shield': { w: 16, h: 22, kind: 'kite' },
    'Heater Shield': { w: 16, h: 19, kind: 'heater' }, 'Tower Shield': { w: 17, h: 26, kind: 'tower' }, Pavise: { w: 19, h: 26, kind: 'tower' },
  };
  const sh = shapes[b] || shapes['Round Shield'];
  const inside = (x, y) => {
    if (x < 0 || y < 0 || x >= sh.w || y >= sh.h) return false;
    const u = (x + 0.5) / sh.w, v = (y + 0.5) / sh.h;
    if (sh.kind === 'round') return (u - 0.5) ** 2 + (v - 0.5) ** 2 <= 0.25;
    if (sh.kind === 'tower') return !((u < 0.1 || u > 0.9) && (v < 0.05 || v > 0.95));
    if (sh.kind === 'heater') return v < 0.5 || Math.abs(u - 0.5) <= 0.5 * (1 - (v - 0.5) * 1.9) ** 0.7;
    return v < 0.35 ? Math.abs(u - 0.5) <= 0.5 * (0.6 + v * 1.15) : Math.abs(u - 0.5) <= 0.5 * (1 - (v - 0.35) / 0.65) ** 0.9;
  };
  const front = mk(sh.w + 2, sh.h + 2, Math.floor(sh.w / 2) + 1, Math.floor(sh.h / 2) + 1);
  const back = mk(sh.w + 2, sh.h + 2, front.ox, front.oy);
  const depth = (x, y) => (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1) ? 0 : !inside(x - 2, y) || !inside(x + 2, y) || !inside(x, y - 2) || !inside(x, y + 2) ? 1 : 2);
  for (let y = 0; y < sh.h; y++) for (let x = 0; x < sh.w; x++) {
    if (!inside(x, y)) continue;
    const d = depth(x, y), u = x / sh.w, v = y / sh.h;
    // a two-pixel metal rim lit from the top left, then the painted face with planks and a
    // soft shade toward the lower right
    let c;
    if (d === 0) c = u + v < 0.8 ? TR.l : u + v > 1.25 ? TR.d : TR.m;
    else if (d === 1) c = u + v < 0.8 ? TR.m : TR.dd;
    else {
      c = u + v < 0.7 ? light(face, 1.12) : u + v > 1.3 ? dark(face, 0.8) : face;
      if (sh.kind !== 'round' && (x - 2) % 5 === 0 && b !== 'Kite Shield') c = dark(c, 0.85);
      if (sh.kind === 'round' && (x + y) % 6 === 0 && Math.hypot(u - 0.5, v - 0.5) > 0.2) c = dark(c, 0.9);
    }
    front.set(x + 1, y + 1, c);
    back.set(x + 1, y + 1, d === 0 ? TR.d : (x % 5 === 0) ? dark(WOOD, 0.72) : (x + y * 3) % 11 === 0 ? dark(WOOD, 0.85) : u < 0.3 ? light(WOOD, 1.1) : WOOD);
  }
  const cx = front.ox, cy = front.oy;
  if (emb && sh.w >= 15) {
    // a heraldic cross with a drop shadow
    const E = trimR(emb);
    for (let y = cy - 5; y <= cy + 5; y++) { front.set(cx, y, E.l); front.set(cx + 1, y, E.d); }
    for (let x = cx - 3; x <= cx + 4; x++) { front.set(x, cy - 2, E.l); front.set(x, cy - 1, E.d); }
    front.set(cx, cy - 2, light(emb, 1.4));
  }
  if (sh.kind === 'round') {
    // the boss
    const r = sh.w > 12 ? 3.2 : 2.2;
    front.disc(cx + 0.5, cy + 0.5, r, M.lo); front.disc(cx, cy, r - 0.8, M.mid); front.set(cx - 1, cy - 1, M.edge); front.set(cx, cy - 1, M.hi);
    if (sh.w > 12) for (const [dx, dy] of [[-6, 0], [6, 0], [0, -6], [0, 6]]) front.set(cx + dx, cy + dy, M.hi);
  } else if (!emb) { front.set(cx, cy - 1, M.edge); front.set(cx, cy, M.lo); }
  // back: the arm strap and the grip
  back.rect(cx - 1, cy - 3, 3, 7, GRIP); back.rect(cx - 1, cy - 3, 1, 7, light(GRIP, 1.2)); back.rect(cx - 4, cy - 1, 9, 2, dark(GRIP, 0.85));
  const edge = mk(6, sh.h + 2, 3, front.oy);
  for (let y = 1; y <= sh.h; y++) { edge.set(1, y, TR.l); edge.set(2, y, TR.m); edge.set(3, y, y < sh.h / 2 ? light(face, 1.15) : face); edge.set(4, y, dark(face, 0.75)); }
  edge.set(2, 1, TR.l); edge.set(3, 1, TR.m); edge.set(3, sh.h, TR.d); edge.set(4, sh.h, TR.dd);
  front.outline(); back.outline(); edge.outline();
  s = { front, back, edge };
  cache.set(key, s);
  return s;
}

// ------------------------------------------------------------------ tome (floats beside the caster)
export function tomeSprite(color = '#6a2a20', glow = '#ffd080') {
  const key = 'tome' + color + glow;
  let s = cache.get(key);
  if (s) return s;
  const c = C(color), g = C(glow);
  const p = mk(15, 15, 7, 13), e = mk(15, 15, 7, 13);
  // cover with a lit top edge and a dark lower edge, a spine, page edges, corner caps
  p.rect(1, 1, 12, 12, c);
  p.rect(1, 1, 12, 1, light(c, 1.3)); p.rect(1, 12, 12, 1, dark(c, 0.6)); p.rect(12, 2, 1, 10, dark(c, 0.72));
  p.rect(13, 2, 1, 11, '#e8e0c8'); p.rect(2, 13, 11, 1, '#d8ccb0'); p.set(13, 12, '#c0b498');
  for (let y = 3; y < 12; y += 2) p.set(13, y, '#c8bca0');
  p.rect(1, 1, 2, 12, dark(c, 0.7)); p.rect(1, 1, 1, 12, dark(c, 0.55));
  for (const [x, y] of [[3, 1], [11, 1], [3, 12], [11, 12]]) p.set(x, y, '#e8c060');
  // a glowing rune on the cover
  const rune = [[7, 3], [7, 4], [6, 5], [8, 5], [5, 6], [9, 6], [7, 6], [6, 7], [8, 7], [7, 8], [7, 9], [7, 10]];
  for (const [x, y] of rune) { p.set(x, y, g); e.set(x, y, g); }
  e.set(7, 6, '#ffffff'); p.set(7, 6, mixc(g, '#ffffff', 0.6));
  p.outline();
  s = { pix: p, emis: e };
  cache.set(key, s);
  return s;
}

// ------------------------------------------------------------------ ammo (pointing right, pivot at centre)
export function ammoSprite(kind, color) {
  const key = 'ammo' + kind + color;
  let s = cache.get(key);
  if (s) return s;
  const c = C(color || '#e8dcc0');
  let p, e = null;
  if (kind === 'arrow' || kind === 'bolt') {
    const L = kind === 'bolt' ? 13 : 16;
    p = mk(L + 3, 7, Math.floor(L / 2), 3);
    p.line(2, 3, L - 2, 3, '#c8a878'); p.line(4, 3, L - 3, 3, '#b89868');
    // head
    p.set(L, 3, '#ffffff'); p.set(L - 1, 3, '#e8ecf0'); p.set(L - 2, 2, '#c8ccd4'); p.set(L - 2, 4, '#8a8e96'); p.set(L - 3, 2, '#a8acb4'); p.set(L - 3, 4, '#7a7e86');
    // fletching
    p.set(1, 2, c); p.set(2, 2, c); p.set(3, 2, light(c, 1.15)); p.set(0, 1, c); p.set(1, 1, c);
    p.set(1, 4, dark(c, 0.8)); p.set(2, 4, dark(c, 0.8)); p.set(3, 4, c); p.set(0, 5, dark(c, 0.8)); p.set(1, 5, dark(c, 0.8));
    if (color && color !== '#e8dcc0') { e = mk(p.w, p.h, p.ox, p.oy); e.set(L, 3, c); e.set(L - 1, 3, c); e.set(L - 2, 2, c); e.set(L - 2, 4, c); }
  } else if (kind === 'shard' || kind === 'thorn') {
    p = mk(16, 8, 8, 4);
    p.poly([[1, 4], [8, 1], [15.5, 4.5], [8, 7.5]], c);
    p.poly([[3, 4], [8, 2], [13, 4]], light(c, 1.25));
    p.line(3, 4, 13, 4, light(c, 1.5)); p.line(5, 5, 12, 5, dark(c, 0.8));
    p.set(14, 4, '#ffffff');
    e = p.clone();
  } else {
    p = mk(15, 15, 7, 7);
    p.disc(7.5, 7.5, 5.8, c); p.disc(7, 7, 4, light(c, 1.25)); p.disc(6.5, 6.5, 2.2, light(c, 1.5)); p.set(5, 5, '#ffffff'); p.set(6, 5, '#ffffff');
    e = p.clone();
  }
  p.outline(dark(c, 0.4));
  s = { pix: p, emis: e };
  cache.set(key, s);
  return s;
}
