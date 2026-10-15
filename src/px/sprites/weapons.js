// Procedural pixel weapons, shields, tomes and ammo. Weapons are drawn pointing right (+x) with
// the pivot on the grip, so the actor can rotate them toward the aim. Elemental and high-rarity
// weapons get an emissive edge layer that glows at night and under the bloom pass.
import { Pix, C, light, dark, mixc } from '../pix.js';

export const ELEM_GLOW = {
  fire: '#ff7a20', frost: '#70d0ff', lightning: '#c8d0ff', rot: '#90e040', nature: '#80d040', void: '#a060ff', holy: '#ffd860',
  water: '#40b0f0', sand: '#e0b060', blood: '#e02030', sound: '#e070f0', earth: '#c09060',
};
const WOOD = C('#7a5232'), GRIP = C('#4a2c1c');
const cache = new Map();

function mk(w, h, ox, oy) { const p = new Pix(w, h); p.ox = ox; p.oy = oy; return p; }
function metal(col) { col = C(col); const m = mixc(col, '#e8ecf0', 0.35); return { hi: light(m, 1.3), mid: m, lo: dark(m, 0.66), edge: mixc(m, '#ffffff', 0.6) }; }
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

// blade along +x from x0 to x1 centred on row cy; w = 1/3/5; shape fn adjusts per-column half-width / offset
function blade(p, e, x0, x1, cy, w, M, glow, o = {}) {
  const half = (w - 1) / 2;
  for (let x = x0; x <= x1; x++) {
    const t = (x - x0) / Math.max(1, x1 - x0);
    let h = o.width ? o.width(t, half) : half;
    const off = o.curve ? Math.round(o.curve(t)) : 0;
    // taper to a point over the last few px
    const fromTip = x1 - x;
    if (!o.square) h = Math.min(h, Math.floor(fromTip / (half > 1 ? 1.5 : 2)));
    h = Math.max(0, Math.round(h));
    const top = cy - h + off, bot = cy + h + off;
    for (let y = top; y <= bot; y++) {
      let c = M.mid;
      if (y === top) c = M.hi;
      else if (y === bot && bot > top) c = M.lo;
      if (o.fuller && y === cy + off && x > x0 + 1 && fromTip > 3 && half >= 1) c = dark(M.mid, 0.82);
      if (o.wave && ((x + (y < cy ? 0 : 2)) % 4 === 0) && (y === top || y === bot)) c = M.lo;
      p.set(x, y, c);
    }
    if (fromTip === 0) p.set(x, Math.round(cy) + off, M.edge);
    if (glow && (x - x0) % 2 === 0) { e.set(x, top, glow); if (bot > top + 1) e.set(x, bot, glow); }
  }
}
function guard(p, x, cy, half, T, w = 1) {
  for (let y = cy - half; y <= cy + half; y++) for (let i = 0; i < w; i++) p.set(x + i, y, y === cy - half ? light(T, 1.25) : y === cy + half ? dark(T, 0.7) : T);
}
function grip(p, x0, x1, cy, col = GRIP, thick = 1) {
  for (let x = x0; x <= x1; x++) for (let k = 0; k < thick; k++) p.set(x, cy + k - (thick > 1 ? 1 : 0), (x - x0) % 2 ? dark(col, 0.75) : col);
}
function pommel(p, x, cy, T) { p.set(x, cy, T); p.set(x - 1, cy, dark(T, 0.75)); p.set(x, cy - 1, light(T, 1.2)); p.set(x, cy + 1, dark(T, 0.8)); }
function shaft(p, x0, x1, cy, col = WOOD, thick = 2) {
  for (let x = x0; x <= x1; x++) { p.set(x, cy, light(col, 1.1)); if (thick > 1) p.set(x, cy + 1, dark(col, 0.72)); if ((x * 7) % 9 === 0) p.set(x, cy, col); }
}

// ------------------------------------------------------------------ generators
const GEN = {
  sword(s) {
    const b = s.base || 'Arming Sword';
    const M = metal(s.color || '#9aa4ae'), T = C(s.trim || '#c8a050'), gl = edgeGlow(s);
    const cfg = {
      'Arming Sword': { L: 12, w: 3, fuller: true },
      Longsword: { L: 15, w: 3, fuller: true, gripL: 4 },
      Broadsword: { L: 13, w: 5, fuller: true },
      Gladius: { L: 9, w: 3, width: (t, h) => h + (t > 0.55 && t < 0.85 ? 1 : 0) },
      Falchion: { L: 12, w: 3, width: (t, h) => h + (t > 0.5 ? 1 : 0), square: false },
      Scimitar: { L: 13, w: 3, curve: (t) => -t * t * 4 },
      Khopesh: { L: 12, w: 3, curve: (t) => (t > 0.45 ? -(t - 0.45) * 9 + (t > 0.8 ? (t - 0.8) * 14 : 0) : 0) },
      Rapier: { L: 17, w: 1, cup: true },
    }[b] || { L: 12, w: 3, fuller: true };
    const gl0 = cfg.gripL || 3;
    const W = 3 + gl0 + 1 + cfg.L + 2, H = 15;
    const p = mk(W, H, 3, 7), e = mk(W, H, 3, 7);
    const cy = 7;
    pommel(p, 1, cy, T);
    grip(p, 2, 1 + gl0, cy);
    const gx = 2 + gl0;
    if (cfg.cup) { p.ellipse(gx + 0.5, cy + 0.5, 1.6, 2.6, T); p.set(gx, cy - 1, light(T, 1.3)); }
    else guard(p, gx, cy, cfg.w >= 5 ? 3 : 2, T);
    blade(p, e, gx + 1, gx + cfg.L, cy, cfg.w, M, gl, cfg);
    return done(p, e, { tip: gx + cfg.L - 1 - 3, len: gx + cfg.L - 3 });
  },
  greatsword(s) {
    const b = s.base || 'Greatsword';
    const M = metal(s.color || '#9aa4ae'), T = C(s.trim || '#c8a050'), gl = edgeGlow(s);
    const cfg = {
      Greatsword: { L: 17, w: 5, fuller: true },
      Zweihander: { L: 19, w: 5, fuller: true, hooks: true },
      Claymore: { L: 17, w: 5, angled: true },
      "Executioner's Blade": { L: 15, w: 7, square: true, blunt: true },
      Flamberge: { L: 18, w: 5, wave: true, width: (t, h) => h + (Math.floor(t * 12) % 2 ? 0 : -1) + (t < 0.1 ? 0 : 0) },
    }[b] || { L: 17, w: 5, fuller: true };
    const W = 3 + 6 + 1 + cfg.L + 2, H = 19;
    const cy = 9;
    const p = mk(W, H, 5, cy), e = mk(W, H, 5, cy);
    pommel(p, 1, cy, T);
    grip(p, 2, 7, cy, GRIP, 2);
    const gx = 8;
    if (cfg.angled) { for (let k = 0; k <= 4; k++) { p.set(gx + Math.floor(k / 2), cy - k, T); p.set(gx + Math.floor(k / 2), cy + k, dark(T, 0.8)); } p.set(gx, cy, T); }
    else guard(p, gx, cy, 4, T, 2);
    blade(p, e, gx + 2, gx + 1 + cfg.L, cy, cfg.w, M, gl, cfg);
    if (cfg.hooks) { p.set(gx + 5, cy - 3, M.hi); p.set(gx + 5, cy + 3, M.lo); }
    return done(p, e, { len: gx + 1 + cfg.L - 5 });
  },
  dagger(s) {
    const b = s.base || 'Dagger';
    const M = metal(s.color || '#9aa4ae'), T = C(s.trim || '#c8a050'), gl = edgeGlow(s);
    const cfg = {
      Dagger: { L: 7, w: 3 }, Kris: { L: 8, w: 3, curve: (t) => Math.round(Math.sin(t * 9)) * 0.6 },
      Stiletto: { L: 9, w: 1 }, Dirk: { L: 8, w: 3, fuller: true }, 'Sickle-Knife': { L: 7, w: 3, curve: (t) => t * t * 4 },
    }[b] || { L: 7, w: 3 };
    const W = 3 + 3 + cfg.L + 2, H = 11, cy = 5;
    const p = mk(W, H, 3, cy), e = mk(W, H, 3, cy);
    pommel(p, 1, cy, T);
    grip(p, 2, 3, cy);
    guard(p, 4, cy, 2, T);
    blade(p, e, 5, 4 + cfg.L, cy, cfg.w, M, gl, cfg);
    return done(p, e, { len: 4 + cfg.L - 3 });
  },
  mace(s) {
    const b = s.base || 'Mace';
    const M = metal(s.color || '#9aa4ae'), T = C(s.trim || '#c8a050'), gl = edgeGlow(s);
    const L = 11, W = L + 11, H = 15, cy = 7;
    const p = mk(W, H, 3, cy), e = mk(W, H, 3, cy);
    pommel(p, 1, cy, T);
    grip(p, 2, 4, cy);
    shaft(p, 5, 3 + L, cy, dark(s.color || '#8a8a8a', 0.8), 2);
    const hx = 4 + L + 2;
    if (b === 'Morningstar') {
      p.disc(hx, cy + 0.5, 3, M.mid); p.disc(hx - 0.7, cy - 0.3, 1.6, M.hi);
      for (const [dx, dy] of [[0, -5], [4, -3], [5, 1], [3, 4], [-1, 5], [-4, 3], [-4, -3]]) { p.set(hx + dx, cy + dy, M.edge); p.set(hx + Math.round(dx * 0.8), cy + Math.round(dy * 0.8), M.lo); }
    } else if (b === 'Warhammer') {
      p.rect(hx - 2, cy - 4, 4, 10, M.mid); p.rect(hx - 2, cy - 4, 4, 1, M.hi); p.rect(hx - 2, cy + 5, 4, 1, M.lo); p.rect(hx + 1, cy - 4, 1, 10, M.lo);
      p.line(hx + 2, cy, hx + 5, cy, M.edge); p.rect(hx - 3, cy - 2, 1, 6, T);
    } else if (b === 'Scepter-Mace') {
      p.disc(hx, cy + 0.5, 3, T); p.disc(hx, cy + 0.5, 1.6, s.element ? ELEM_GLOW[s.element] || '#ff4060' : '#ff4060');
      e.disc(hx, cy + 0.5, 1.6, s.element ? ELEM_GLOW[s.element] || '#ff4060' : '#ff4060');
      p.set(hx + 4, cy, T); p.set(hx - 1, cy - 4, T); p.set(hx - 1, cy + 5, T);
    } else {
      // flanged / plain mace
      p.rrect(hx - 3, cy - 3, 6, 7, M.mid, 1);
      for (let k = -3; k <= 3; k += 2) { p.line(hx - 3, cy + k + 0, hx + 3, cy + k, k < 0 ? M.hi : M.lo); }
      if (b === 'Flanged Mace') for (const dy of [-5, 5]) p.rect(hx - 2, cy + dy - (dy > 0 ? -1 : 0), 4, 1, M.edge);
      p.set(hx + 4, cy, M.edge);
    }
    if (gl) { e.set(hx, cy - 3, gl); e.set(hx + 3, cy, gl); e.set(hx, cy + 4, gl); }
    return done(p, e, { len: hx - 3 + 3 });
  },
  club(s) {
    const col = C(s.color || '#6a4a2a');
    const W = 22, H = 13, cy = 6;
    const p = mk(W, H, 2, cy), e = mk(W, H, 2, cy);
    for (let x = 1; x < 20; x++) {
      const t = x / 20, h = 0.8 + t * t * 3.2;
      for (let y = Math.round(cy - h); y <= Math.round(cy + h); y++) p.set(x, y, y <= cy - h + 1 ? light(col, 1.2) : y >= cy + h - 1 ? dark(col, 0.65) : col);
    }
    for (const [x, y] of [[13, cy - 2], [16, cy + 2], [18, cy - 1]]) { p.set(x, y, dark(col, 0.5)); p.set(x + 1, y, light(col, 1.3)); }
    return done(p, e, { len: 18 });
  },
  spear(s) {
    const b = s.base || 'Spear';
    const M = metal(s.color || '#9aa4ae'), T = C(s.trim || '#c8a050'), gl = edgeGlow(s);
    const L = 20, W = L + 12, H = 13, cy = 6;
    const p = mk(W, H, 6, cy), e = mk(W, H, 6, cy);
    shaft(p, 0, L, cy, WOOD, 1);
    p.set(0, cy, T); p.set(1, cy, T);
    p.set(L - 1, cy, T); p.set(L, cy, T);
    const hx = L + 1;
    if (b === 'Trident') {
      p.line(hx, cy - 3, hx, cy + 3, M.mid);
      for (const dy of [-3, 0, 3]) { p.line(hx, cy + dy, hx + (dy ? 6 : 8), cy + dy, dy < 0 ? M.hi : dy > 0 ? M.lo : M.mid); p.set(hx + (dy ? 6 : 8), cy + dy, M.edge); }
    } else if (b === 'Partisan' || b === 'Ranseur') {
      blade(p, e, hx, hx + 8, cy, 3, M, gl, {});
      for (const dy of [-1, 1]) { p.line(hx + 1, cy + dy * 2, hx + (b === 'Ranseur' ? 4 : 2), cy + dy * 4, dy < 0 ? M.hi : M.lo); }
    } else {
      blade(p, e, hx, hx + 7, cy, 3, M, gl, { width: (t, h) => (t > 0.25 && t < 0.7 ? h + 0.6 : h) });
      if (b === 'Boar Spear') p.line(hx, cy - 2, hx, cy + 2, T);
    }
    return done(p, e, { len: L + 4 });
  },
  halberd(s) {
    const b = s.base || 'Halberd';
    const M = metal(s.color || '#9aa4ae'), T = C(s.trim || '#c8a050'), gl = edgeGlow(s);
    const L = 22, W = L + 12, H = 21, cy = 10;
    const p = mk(W, H, 7, cy), e = mk(W, H, 7, cy);
    shaft(p, 0, L + 1, cy, WOOD, 1);
    p.set(0, cy, T); p.set(L - 4, cy, T);
    const hx = L - 2;
    if (b === 'Glaive') {
      blade(p, e, hx, hx + 10, cy, 5, M, gl, { curve: (t) => -t * 2.5, width: (t, h) => h - (t < 0.15 ? 1 : 0) });
    } else if (b === 'Bardiche') {
      for (let y = -8; y <= 1; y++) { const x0 = hx - 1 + Math.round(Math.abs(y + 3) * 0.3), x1 = hx + 4 + Math.round((y + 8) * 0.25); for (let x = x0; x <= x1; x++) p.set(x, cy + y, x === x1 ? M.edge : y === -8 ? M.hi : M.mid); if (gl) e.set(x1, cy + y, gl); }
      blade(p, e, L + 1, L + 4, cy, 1, M, null, {});
    } else {
      // axe blade on one side, hook/hammer on the other, spike forward
      for (let y = -6; y <= 0; y++) { const w = 4 - Math.round(Math.abs(y + 3) * 0.7); for (let x = hx - w; x <= hx + w; x++) p.set(x, cy + y - 1, y === -6 ? M.edge : x === hx + w ? M.lo : M.mid); if (gl) e.set(hx, cy + y - 7 + 6, gl); }
      for (let y = -7; y <= -6; y++) for (let x = hx - 3; x <= hx + 3; x++) p.set(x, cy + y, M.edge);
      if (b === 'Poleaxe') p.rect(hx - 1, cy + 1, 3, 3, M.lo);
      else { p.line(hx, cy + 1, hx - 2, cy + 4, M.mid); p.set(hx - 2, cy + 4, M.edge); }
      blade(p, e, L + 2, L + 7, cy, 3, M, gl, {});
    }
    return done(p, e, { len: L + 2 });
  },
  staff(s) {
    const b = s.base || 'Staff';
    const T = C(s.trim || '#c8a050');
    const orb = C(s.element && ELEM_GLOW[s.element] ? ELEM_GLOW[s.element] : s.orb || '#a080ff');
    const L = 20, W = L + 9, H = 13, cy = 6;
    const p = mk(W, H, 8, cy), e = mk(W, H, 8, cy);
    const wood = b === 'Rod of Office' ? T : b === 'Battle Staff' ? C('#5a5048') : WOOD;
    for (let x = 0; x <= L; x++) { const wob = b === 'Elder Staff' ? Math.round(Math.sin(x * 0.7) * 0.6) : 0; p.set(x, cy + wob, light(wood, 1.1)); p.set(x, cy + 1 + wob, dark(wood, 0.72)); }
    p.rect(0, cy, 2, 2, T);
    if (b === 'Quarterstaff') { p.rect(L - 1, cy, 2, 2, T); return done(p, e, { len: L - 8 }); }
    // head: prongs cradling an orb
    const ox = L + 3;
    p.line(L - 1, cy - 1, L + 2, cy - 3, T); p.line(L - 1, cy + 2, L + 2, cy + 4, dark(T, 0.8));
    if (b === 'Elder Staff') { p.line(L, cy, L + 4, cy - 4, wood); p.line(L + 4, cy - 4, L + 6, cy - 1, wood); }
    p.disc(ox + 0.5, cy + 0.5, 2.6, orb);
    p.set(ox - 1, cy - 1, mixc(orb, '#ffffff', 0.7));
    e.disc(ox + 0.5, cy + 0.5, 2.6, orb); e.set(ox - 1, cy - 1, '#ffffff');
    return done(p, e, { len: ox - 8, orb: [ox - 8, 0], orbColor: orb });
  },
  wand(s) {
    const b = s.base || 'Wand';
    const T = C(s.trim || '#c8a050');
    const orb = C(s.element && ELEM_GLOW[s.element] ? ELEM_GLOW[s.element] : '#c0a0ff');
    const wood = b === 'Bone Wand' ? C('#e0d8c4') : b === 'Crystal Wand' ? mixc(orb, '#ffffff', 0.4) : b === 'Willow Wand' ? C('#8a7a4a') : C('#4a3020');
    const W = 15, H = 9, cy = 4;
    const p = mk(W, H, 2, cy), e = mk(W, H, 2, cy);
    for (let x = 1; x <= 10; x++) p.set(x, cy, x < 4 ? GRIP : x % 3 === 0 && b === 'Rune Wand' ? orb : wood);
    if (b === 'Rune Wand') for (let x = 4; x <= 10; x += 3) e.set(x, cy, orb);
    p.set(4, cy, T); p.set(4, cy - 1, T); p.set(4, cy + 1, T);
    p.disc(12, cy + 0.5, 1.6, orb); p.set(12, cy - 1, '#ffffff');
    e.disc(12, cy + 0.5, 1.6, orb);
    return done(p, e, { len: 10, orb: [10, 0], orbColor: orb });
  },
  claws() { const p = mk(1, 1, 0, 0); return { pix: p, emis: null, len: 2, none: true }; },
  bow(s) {
    const b = s.base || 'Shortbow';
    const draw = s.draw || 0;
    const wood = b === 'Composite Bow' ? C('#c8b080') : b === 'Warbow' ? C('#5a3a22') : WOOD;
    const T = C(s.trim || '#c8a050'), gl = edgeGlow(s);
    const Hh = b === 'Longbow' || b === 'Warbow' ? 10 : b === 'Shortbow' || b === 'Hunting Bow' ? 7 : 8;
    const W = 22, H = Hh * 2 + 5, cy = Hh + 2;
    const p = mk(W, H, 10, cy), e = mk(W, H, 10, cy);
    const gx = 12;            // grip column
    const pull = Math.round(draw * 7);
    const bend = 3 + Math.round(draw * 2);
    // limbs: parabola bending back toward the archer
    const pts = [];
    for (let y = -Hh; y <= Hh; y++) {
      const t = Math.abs(y) / Hh;
      let x = gx - Math.round(t * t * bend);
      if (b === 'Recurve Bow' && t > 0.85) x += 2;
      pts.push([x, cy + y]);
      p.set(x, cy + y, t < 0.18 ? GRIP : y < 0 ? light(wood, 1.15) : wood);
      p.set(x + 1, cy + y, t < 0.18 ? GRIP : dark(wood, 0.72));
      if (gl && y % 3 === 0) e.set(x + 1, cy + y, gl);
    }
    const tipX = pts[0][0], nock = gx - bend - pull;
    // string: two segments meeting at the nock point
    p.line(tipX, cy - Hh, nock, cy, '#e8e0d0');
    p.line(tipX, cy + Hh, nock, cy, '#e8e0d0');
    // nocked arrow
    if (draw > 0.05) {
      p.line(nock, cy, gx + 6, cy, '#c8a878');
      p.set(gx + 6, cy, '#d8dce4'); p.set(gx + 7, cy, '#ffffff'); p.set(gx + 5, cy - 1, '#a8acb4'); p.set(gx + 5, cy + 1, '#a8acb4');
      p.set(nock + 1, cy - 1, T); p.set(nock + 1, cy + 1, T);
      if (gl) { e.set(gx + 7, cy, gl); e.set(gx + 6, cy, gl); }
    }
    return done(p, e, { len: 6, bow: true });
  },
  crossbow(s) {
    const T = C(s.trim || '#c8a050'), M = metal(s.color || '#9aa4ae'), gl = edgeGlow(s);
    const loaded = s.draw !== 0;
    const W = 22, H = 19, cy = 9;
    const p = mk(W, H, 6, cy), e = mk(W, H, 6, cy);
    // stock
    for (let x = 1; x <= 16; x++) { p.set(x, cy, light(WOOD, 1.1)); p.set(x, cy + 1, x < 6 ? dark(WOOD, 0.7) : WOOD); if (x < 5) p.set(x, cy + 2, dark(WOOD, 0.6)); }
    // prod (arms) across the front
    const px = 14;
    for (let y = -7; y <= 7; y++) { const x = px - Math.round(Math.abs(y) * 0.28); p.set(x, cy + y, Math.abs(y) < 2 ? T : y < 0 ? M.hi : M.lo); }
    const sx = loaded ? 7 : px - 1;
    p.line(px - 2, cy - 7, sx, cy, '#e8e0d0'); p.line(px - 2, cy + 7, sx, cy, '#e8e0d0');
    if (loaded) { p.line(sx, cy - 1, px + 4, cy - 1, '#c8a878'); p.set(px + 4, cy - 1, M.edge); p.set(px + 5, cy - 1, '#ffffff'); if (gl) e.set(px + 5, cy - 1, gl); }
    p.set(9, cy + 2, M.lo); // trigger
    return done(p, e, { len: 10 });
  },
};

// ------------------------------------------------------------------ shields
// returns { front, edge, back } sprites, pivot at the grip (centre)
export function shieldSprite(spec) {
  const key = 'sh' + JSON.stringify(spec);
  let s = cache.get(key);
  if (s) return s;
  const b = spec.base || 'Round Shield';
  const M = metal(spec.color || '#8a8a8a'), T = C(spec.trim || '#c8a050');
  const face = C(spec.face || mixc(spec.color || '#8a8a8a', '#6a3a2a', 0.45));
  const emb = spec.emblem ? C(spec.emblem) : null;
  const shapes = {
    Buckler: { w: 7, h: 7, kind: 'round' }, 'Round Shield': { w: 11, h: 11, kind: 'round' }, 'Kite Shield': { w: 10, h: 14, kind: 'kite' },
    'Heater Shield': { w: 10, h: 12, kind: 'heater' }, 'Tower Shield': { w: 11, h: 16, kind: 'tower' }, Pavise: { w: 12, h: 16, kind: 'tower' },
  };
  const sh = shapes[b] || shapes['Round Shield'];
  const inside = (x, y) => {
    const u = (x + 0.5) / sh.w, v = (y + 0.5) / sh.h;
    if (sh.kind === 'round') return (u - 0.5) ** 2 + (v - 0.5) ** 2 <= 0.25;
    if (sh.kind === 'tower') return !((u < 0.12 || u > 0.88) && (v < 0.06 || v > 0.94));
    if (sh.kind === 'heater') return v < 0.5 || Math.abs(u - 0.5) <= 0.5 * (1 - (v - 0.5) * 1.9) ** 0.7;
    return v < 0.35 ? Math.abs(u - 0.5) <= 0.5 * (0.6 + v * 1.15) : Math.abs(u - 0.5) <= 0.5 * (1 - (v - 0.35) / 0.65) ** 0.9;
  };
  const front = mk(sh.w + 2, sh.h + 2, Math.floor(sh.w / 2) + 1, Math.floor(sh.h / 2) + 1);
  const back = mk(sh.w + 2, sh.h + 2, front.ox, front.oy);
  for (let y = 0; y < sh.h; y++) for (let x = 0; x < sh.w; x++) {
    if (!inside(x, y)) continue;
    const rim = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
    let c = rim ? T : face;
    if (!rim && sh.kind !== 'round' && (x - 1) % 4 === 0 && b !== 'Kite Shield') c = dark(face, 0.88);
    if (rim && (y < 2 || x < 2)) c = light(T, 1.2);
    front.set(x + 1, y + 1, c);
    back.set(x + 1, y + 1, rim ? dark(T, 0.8) : (x + y) % 5 === 0 ? dark(WOOD, 0.75) : WOOD);
  }
  const cx = front.ox, cy = front.oy;
  if (emb && sh.w >= 9) { front.line(cx, cy - 3, cx, cy + 3, emb); front.line(cx - 2, cy - 1, cx + 2, cy - 1, emb); }
  else if (sh.kind === 'round') { front.disc(cx + 0.5, cy + 0.5, sh.w > 8 ? 2 : 1.4, M.mid); front.set(cx, cy, M.edge); }
  back.rect(cx - 1, cy - 2, 2, 5, GRIP);
  const edge = mk(4, sh.h + 2, 2, front.oy);
  for (let y = 1; y <= sh.h; y++) { edge.set(1, y, T); edge.set(2, y, y < sh.h / 2 ? light(face, 1.15) : face); }
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
  const p = mk(9, 9, 4, 8), e = mk(9, 9, 4, 8);
  p.rect(1, 1, 7, 7, c);
  p.rect(1, 1, 7, 1, light(c, 1.3)); p.rect(1, 7, 7, 1, dark(c, 0.6));
  p.rect(7, 2, 1, 5, '#e8e0c8');           // page edges
  p.rect(1, 1, 1, 7, dark(c, 0.7));        // spine
  p.set(4, 3, g); p.set(3, 4, g); p.set(5, 4, g); p.set(4, 5, g);
  e.set(4, 3, g); e.set(3, 4, g); e.set(5, 4, g); e.set(4, 5, g); e.set(4, 4, g);
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
    const L = kind === 'bolt' ? 8 : 10;
    p = mk(L + 2, 5, Math.floor(L / 2), 2);
    p.line(1, 2, L - 1, 2, '#c8a878');
    p.set(L, 2, '#e8ecf0'); p.set(L - 1, 1, '#a8acb4'); p.set(L - 1, 3, '#a8acb4');
    p.set(1, 1, c); p.set(2, 1, c); p.set(1, 3, c); p.set(2, 3, c);
    if (color && color !== '#e8dcc0') { e = mk(p.w, p.h, p.ox, p.oy); e.set(L, 2, c); e.set(L - 1, 2, c); }
  } else if (kind === 'shard' || kind === 'thorn') {
    p = mk(10, 5, 5, 2);
    p.poly([[1, 2], [5, 0.5], [9.5, 2.5], [5, 4.5]], c);
    p.line(2, 2, 8, 2, light(c, 1.4));
    e = p.clone();
  } else {
    p = mk(9, 9, 4, 4);
    p.disc(4.5, 4.5, 3.6, c); p.disc(4, 4, 2, light(c, 1.4)); p.set(3, 3, '#ffffff');
    e = p.clone();
  }
  p.outline(dark(c, 0.4));
  s = { pix: p, emis: e };
  cache.set(key, s);
  return s;
}
