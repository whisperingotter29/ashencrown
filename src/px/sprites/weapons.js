// Procedural pixel weapons, shields, tomes and ammo, drawn natively at the game's pixel density
// (PPU 16) so they keep their world size in hand next to the bodies. Weapons are drawn pointing
// right (+x) with the pivot on the grip, so the actor can rotate them toward the aim. Blades get a
// bright edge, a fuller and a shaded back; grips are wrapped; guards and pommels catch the light.
// Elemental and high-rarity weapons get an emissive edge layer that glows at night and under the
// bloom pass. `len` is the reach from the pivot to the tip in pixels.
import { Pix, C, light, dark, mixc, CREAM } from '../pix.js';
import { tone } from '../lookTone.js';

// element glows from the palette's accent ends (aether, ember, frost, ...): bright, never neon
export const ELEM_GLOW = {
  fire: '#ec7a2a', frost: '#8cc8ec', lightning: '#c8d0f0', rot: '#a8c860', nature: '#90ac5c', void: '#c860f0', holy: '#f6e39a',
  water: '#5a9ad0', sand: '#e2c494', blood: '#cc4a5a', sound: '#e48fb0', earth: '#b07e52',
};
// wood, grip leather and the cream glint (src/px/palette.js ramps)
const WOOD = C('#77492f'), GRIP = C('#3f2622'), GLINT = C('#fff4dc'), STRING = C('#efdab4');
const cache = new Map();

function mk(w, h, ox, oy) { const p = new Pix(w, h); p.ox = ox; p.oy = oy; return p; }
function metal(col) { col = C(tone(col)); const m = mixc(col, '#e2e6e0', 0.22); return { hi: light(m, 1.26), mid: m, md: mixc(m, dark(m, 0.66), 0.5), lo: dark(m, 0.64), dk: dark(m, 0.48), edge: mixc(light(m, 1.3), CREAM, 0.55) }; }
function trimR(T) { T = C(tone(T)); return { l: light(T, 1.25), m: T, d: dark(T, 0.72), dd: dark(T, 0.5) }; }
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
  if ((spec.rarity || 0) >= 4) return C(spec.trim || '#ec7a2a');
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
  if (x1 - x0 > 6) { const gx = x0 + 2, off = o.curve ? Math.round(o.curve(2 / (x1 - x0))) : 0; const hh = Math.round(o.width ? o.width(0.1, half) : half); p.set(gx, cy - hh + off, GLINT); }
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
// native size factor for weapons held by giant bodies: g, G(n) = round(n * g), odd(w) keeps odd widths odd
function sizer(s) { const g = s.sz || 1; return { g, G: (v) => Math.max(1, Math.round(v * g)), odd: (w) => 2 * Math.round(((w - 1) / 2) * g) + 1 }; }
function pommel(p, x, cy, T, g = 1) {
  const R = trimR(T);
  if (g > 1.3) { const r = 1.6 * g; p.disc(x + 0.5, cy + 0.5, r, R.m); p.disc(x, cy, r * 0.55, R.l); p.set(x - 1, cy - 1, GLINT); p.set(x + Math.round(r * 0.6), cy + Math.round(r * 0.6), R.dd); return; }
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
  // every melee generator takes spec.sz (1 = a person's weapon, up to ~2 for giant bosses) and
  // grows its geometry natively by it; 1-px edges, glints and wraps stay 1 px
  sword(s) {
    const b = s.base || 'Arming Sword', z = sizer(s);
    const M = metal(s.color || '#828882'), T = C(tone(s.trim || '#c99a3a')), gl = edgeGlow(s);
    const cfg = {
      'Arming Sword': { L: 19, w: 5, fuller: true },
      Longsword: { L: 24, w: 5, fuller: true, gripL: 7 },
      Broadsword: { L: 21, w: 7, fuller: true },
      Gladius: { L: 14, w: 5, width: (t, h) => h + (t > 0.5 && t < 0.85 ? z.G(1) : 0) },
      Falchion: { L: 19, w: 5, width: (t, h) => h + (t > 0.45 ? z.G(1) : 0) + (t > 0.7 ? z.G(1) : 0) },
      Scimitar: { L: 21, w: 5, curve: (t) => -t * t * 6 * z.g },
      Khopesh: { L: 19, w: 5, curve: (t) => (t > 0.45 ? -(t - 0.45) * 14 + (t > 0.8 ? (t - 0.8) * 22 : 0) : 0) * z.g },
      Rapier: { L: 27, w: 3, cup: true },
    }[b] || { L: 19, w: 5, fuller: true };
    const L = z.G(cfg.L), bw = z.odd(cfg.w), gl0 = z.G(cfg.gripL || 5), pr = z.G(2);
    const gx = 2 + pr + gl0;                               // guard column
    const H = z.odd(23), cy = H >> 1, W = gx + z.G(2) + L + 2, ox = 2 + pr + (gl0 >> 1);
    const p = mk(W, H, ox, cy), e = mk(W, H, ox, cy);
    pommel(p, 1 + pr - 1, cy, T, z.g);
    grip(p, 2 + pr, gx - 1, cy, GRIP, z.G(2));
    if (cfg.cup) {
      const R = trimR(T);
      p.ellipse(gx + 1, cy + 0.5, 2.4 * z.g, 4.2 * z.g, R.m); p.ellipse(gx + 0.6, cy - 0.5, 1.2 * z.g, 2.6 * z.g, R.l); p.set(gx + 2, cy + z.G(3), R.d); p.set(gx + 1, cy + z.G(3), R.d);
      p.line(gx - 1, cy + 1, gx - z.G(3), cy + z.G(3), R.d);  // knuckle bow
    } else guard(p, gx, cy, z.G(cfg.w >= 7 ? 5 : 4), T, z.G(2));
    blade(p, e, gx + z.G(2), gx + z.G(2) - 1 + L, cy, bw, M, gl, cfg);
    if (cfg.cup) { p.set(gx + z.G(3), cy - 1, light(T, 1.2)); }
    else { p.set(gx + z.G(2), cy, trimR(T).d); p.set(gx + z.G(2), cy - 1, trimR(T).m); }   // ricasso collar
    return done(p, e, { len: gx + z.G(2) - 1 + L - ox });
  },
  greatsword(s) {
    const b = s.base || 'Greatsword', z = sizer(s);
    const M = metal(s.color || '#828882'), T = C(tone(s.trim || '#c99a3a')), gl = edgeGlow(s);
    const cfg = {
      Greatsword: { L: 27, w: 7, fuller: true },
      Zweihander: { L: 30, w: 7, fuller: true, hooks: true },
      Claymore: { L: 27, w: 7, angled: true, fuller: true },
      "Executioner's Blade": { L: 24, w: 11, square: true, blunt: true },
      Flamberge: { L: 29, w: 7, wave: true, width: (t, h) => h + (Math.floor(t * 14) % 2 ? 0 : -1) },
    }[b] || { L: 27, w: 7, fuller: true };
    const L = z.G(cfg.L), bw = z.odd(cfg.w), pr = z.G(2);
    const gx = 2 + pr + z.G(10), H = z.odd(29), cy = H >> 1, W = gx + z.G(3) + L + 2, ox = 2 + pr + z.G(4);
    const p = mk(W, H, ox, cy), e = mk(W, H, ox, cy);
    pommel(p, 1 + pr - 1, cy, T, z.g);
    grip(p, 2 + pr, gx - 1, cy, GRIP, z.G(3));
    const R = trimR(T);
    if (cfg.angled) {
      // claymore: quillons swept forward, ending in quatrefoil knobs
      const n = z.G(7);
      for (let k = 0; k <= n; k++) { const xx = gx + Math.floor(k / 2); p.set(xx, cy - k, k < 2 ? R.m : R.l); p.set(xx + 1, cy - k, R.d); p.set(xx, cy + k, R.m); p.set(xx + 1, cy + k, R.dd); }
      for (const d of [-1, 1]) { const ky = cy + d * (n + 1), kx = gx + (n >> 1) + 1; p.rect(kx - 1, ky - 1, z.G(2), z.G(2), R.l); p.set(kx, ky, R.d); }
    } else guard(p, gx, cy, z.G(cfg.w >= 11 ? 7 : 6), T, z.G(3));
    const b0 = gx + z.G(3), b1 = b0 - 1 + L;
    blade(p, e, b0, b1, cy, bw, M, gl, cfg);
    if (cfg.hooks) for (const d of [-1, 1]) { const hx = b0 + z.G(5), hy = cy + d * ((bw >> 1) + 1); p.set(hx, hy, M.hi); p.set(hx + 1, hy + d, M.mid); p.set(hx, hy + d, M.lo); }
    if (cfg.blunt) { for (let y = cy - (bw >> 1); y <= cy + (bw >> 1); y++) p.set(b1, y, M.lo); p.disc(b1 - z.G(4), cy - z.G(2), 1.2 * z.g, M.dk); }
    return done(p, e, { len: b1 - ox - z.G(3) });
  },
  dagger(s) {
    const b = s.base || 'Dagger', z = sizer(s);
    const M = metal(s.color || '#828882'), T = C(tone(s.trim || '#c99a3a')), gl = edgeGlow(s);
    const cfg = {
      Dagger: { L: 11, w: 5 }, Kris: { L: 13, w: 5, curve: (t) => Math.round(Math.sin(t * 11)) * 0.8 * z.g },
      Stiletto: { L: 14, w: 3 }, Dirk: { L: 13, w: 5, fuller: true }, 'Sickle-Knife': { L: 11, w: 5, curve: (t) => t * t * 6 * z.g },
    }[b] || { L: 11, w: 5 };
    const L = z.G(cfg.L), pr = z.G(2);
    const gx = 2 + pr + z.G(4), H = z.odd(17), cy = H >> 1, W = gx + z.G(2) + L + 2, ox = 2 + pr + z.G(1);
    const p = mk(W, H, ox, cy), e = mk(W, H, ox, cy);
    pommel(p, 1 + pr - 1, cy, T, z.g);
    grip(p, 2 + pr, gx - 1, cy, GRIP, z.G(2));
    guard(p, gx, cy, z.G(3), T, z.G(2));
    blade(p, e, gx + z.G(2), gx + z.G(2) - 1 + L, cy, z.odd(cfg.w), M, gl, cfg);
    return done(p, e, { len: gx + z.G(2) - 1 + L - ox - 2 });
  },
  mace(s) {
    const b = s.base || 'Mace', z = sizer(s), G = z.G;
    const M = metal(s.color || '#828882'), T = C(tone(s.trim || '#c99a3a')), gl = edgeGlow(s);
    const L = G(18), H = z.odd(23), cy = H >> 1, pr = G(2), W = 2 + pr + G(4) + L + G(14), ox = 2 + pr + G(1);
    const p = mk(W, H, ox, cy), e = mk(W, H, ox, cy);
    pommel(p, 1 + pr - 1, cy, T, z.g);
    const g0 = 2 + pr, g1 = g0 + G(4) - 1;
    grip(p, g0, g1, cy, GRIP, G(2));
    shaft(p, g1 + 1, g1 + L - 2, cy - 1, dark(tone(s.color || '#827d82'), 0.8), G(2));
    const R = trimR(T);
    p.rect(g1 + 1, cy - 1, 1, G(2), R.m); p.set(g1 + 1, cy - 2, R.l);           // collar above the grip
    const hx = g1 + L + G(2);
    if (b === 'Morningstar') {
      p.disc(hx, cy + 0.5, 5 * z.g, M.mid); p.disc(hx - G(1), cy - 0.5, 3.2 * z.g, M.hi); p.disc(hx + 1.2 * z.g, cy + 1.6 * z.g, 2.4 * z.g, M.md); p.set(hx - G(2), cy - G(2), M.edge);
      for (const [dx, dy] of [[0, -8], [6, -5], [8, 1], [5, 6], [-1, 8], [-6, 5], [-6, -5]]) { const ex = hx + G(dx), ey = cy + G(dy); p.set(ex, ey, M.edge); p.set(hx + Math.round(dx * 0.82 * z.g), cy + Math.round(dy * 0.82 * z.g), M.hi); p.set(hx + Math.round(dx * 0.68 * z.g), cy + Math.round(dy * 0.68 * z.g), M.lo); }
    } else if (b === 'Warhammer') {
      const a = G(3), t = G(7);
      p.rect(hx - a, cy - t, 2 * a, 2 * t + 2, M.mid); p.rect(hx - a, cy - t, 2 * a, G(2), M.hi); p.rect(hx - a, cy + t, 2 * a, G(2), M.lo); p.rect(hx + a - G(2), cy - t, G(2), 2 * t + 2, M.md); p.rect(hx + a - 1, cy - t, 1, 2 * t + 2, M.lo);
      p.rect(hx - a, cy - t, 1, 2 * t, M.hi);
      for (let x = hx + a; x <= hx + a + G(5); x++) { const hh = x < hx + a + G(3) ? G(1) : 0; for (let y = cy - hh; y <= cy + hh; y++) p.set(x, y, y < cy ? M.hi : y > cy ? M.lo : M.edge); }
      p.rect(hx - a - G(2), cy - G(3), G(2), G(8), R.m); p.rect(hx - a - G(2), cy - G(3), 1, G(8), R.l);
    } else if (b === 'Scepter-Mace') {
      const gem = C(s.element ? ELEM_GLOW[s.element] || '#cc6a86' : '#cc6a86');
      p.disc(hx, cy + 0.5, 5 * z.g, R.m); p.disc(hx - G(1), cy - 0.5, 3 * z.g, R.l); p.disc(hx, cy + 0.5, 2.6 * z.g, gem); p.set(hx - G(1), cy - G(1), GLINT);
      e.disc(hx, cy + 0.5, 2.6 * z.g, gem);
      for (const [dx, dy] of [[6, 0], [-1, -6], [-1, 7], [4, -4], [4, 5]]) { p.set(hx + G(dx), cy + G(dy), R.l); p.set(hx + G(dx), cy + G(dy) + 1, R.d); }
    } else {
      // flanged / plain mace: a ribbed head with a top cap and a spike
      const a = G(4), t = G(5);
      p.rrect(hx - a, cy - t, 2 * a + 1, 2 * t + 1, M.mid, G(2));
      for (let k = -a; k <= a; k += 2) for (let x = hx - a; x <= hx + a; x++) if (Math.abs(k) + Math.abs(x - hx) < 2 * a + 1) p.set(x, cy + k, k < 0 ? M.hi : k > 0 ? M.lo : M.mid);
      p.rect(hx - a + 1, cy - a, G(2), G(2), M.edge);
      if (b === 'Flanged Mace') for (const d of [-1, 1]) { const fy = cy + d * G(8); p.rect(hx - G(3), fy - (d > 0 ? 1 : 0), G(6), G(2), M.edge); p.rect(hx - G(2), fy + (d > 0 ? -G(2) : G(1)), G(4), 1, M.lo); }
      p.set(hx + a + 1, cy, M.edge); p.set(hx + a + 2, cy, M.hi);
    }
    if (gl) for (const [dx, dy] of [[0, -5], [5, 0], [0, 6], [-4, 0]]) e.set(hx + G(dx), cy + G(dy), gl);
    return done(p, e, { len: hx - ox + G(2) });
  },
  club(s) {
    const col = C(tone(s.color || '#77492f')), z = sizer(s), G = z.G;
    const Ln = G(33), H = z.odd(19), cy = H >> 1, W = Ln + 2;
    const p = mk(W, H, G(3), cy), e = mk(W, H, G(3), cy);
    for (let x = 1; x < Ln; x++) {
      const t = x / Ln, h = (1.3 + t * t * 5.2) * z.g;
      const y0 = Math.round(cy - h), y1 = Math.round(cy + h);
      for (let y = y0; y <= y1; y++) p.set(x, y, y <= y0 + 1 ? light(col, 1.2) : y >= y1 - 1 ? dark(col, 0.65) : y > cy + h * 0.3 ? dark(col, 0.85) : col);
    }
    for (const [x, y] of [[20, -3], [25, 3], [29, -2], [16, 1]]) { const kx = G(x), ky = cy + G(y); p.set(kx, ky, dark(col, 0.5)); p.set(kx + 1, ky, light(col, 1.3)); p.set(kx, ky + 1, dark(col, 0.6)); }
    for (let x = 2; x < G(8); x++) if (x % 2) { p.set(x, cy - 1, dark(col, 0.6)); p.set(x, cy + 1, dark(col, 0.6)); }
    return done(p, e, { len: Ln - G(4) });
  },
  spear(s) {
    const b = s.base || 'Spear', z = sizer(s), G = z.G;
    const M = metal(s.color || '#828882'), T = C(tone(s.trim || '#c99a3a')), gl = edgeGlow(s);
    const L = G(32), H = z.odd(19), cy = H >> 1, W = L + G(19), ox = G(10);
    const p = mk(W, H, ox, cy), e = mk(W, H, ox, cy);
    const R = trimR(T), th = G(2);
    shaft(p, 0, L, cy, WOOD, th);
    p.rect(0, cy, G(3), th, R.m); p.rect(0, cy, G(3), 1, R.l);
    p.rect(L - G(2), cy, G(3), th, R.m); p.set(L - G(2), cy, R.l); p.set(L - G(3), cy - 1, R.d); p.set(L - G(3), cy + th, R.dd);
    for (let x = G(8); x <= G(12); x++) if (x % 2 === 0) { p.set(x, cy, dark(WOOD, 0.6)); p.set(x, cy + 1, dark(WOOD, 0.5)); }   // binding where the hand rests
    const hx = L + 1;
    if (b === 'Trident') {
      p.line(hx, cy - G(5), hx, cy + G(5), M.mid); p.line(hx + 1, cy - G(5), hx + 1, cy + G(5), M.lo);
      for (const d of [-1, 0, 1]) { const dy = d * G(5), len = G(d ? 9 : 13); p.line(hx, cy + dy, hx + len, cy + dy, d < 0 ? M.hi : d > 0 ? M.lo : M.mid, z.g > 1.4 ? 2 : 1); p.set(hx + len, cy + dy, M.edge); p.set(hx + len - 1, cy + dy - 1, M.hi); }
    } else if (b === 'Partisan' || b === 'Ranseur') {
      blade(p, e, hx, hx + G(13), cy, z.odd(5), M, gl, {});
      for (const d of [-1, 1]) { const r = b === 'Ranseur' ? 6 : 3; p.line(hx + 1, cy + d * G(3), hx + G(r), cy + d * G(7), d < 0 ? M.hi : M.lo); p.line(hx + 2, cy + d * G(3), hx + G(r) + 1, cy + d * G(7), M.md); }
    } else {
      blade(p, e, hx, hx + G(11), cy, z.odd(5), M, gl, { width: (t, h) => (t > 0.2 && t < 0.7 ? h + G(1) : h), fuller: true });
      if (b === 'Boar Spear') { p.line(hx - 1, cy - G(4), hx - 1, cy + G(4), R.m); p.line(hx, cy - G(4), hx, cy + G(4), R.d); }
    }
    return done(p, e, { len: L + G(6) - ox });
  },
  halberd(s) {
    const b = s.base || 'Halberd', z = sizer(s), G = z.G;
    const M = metal(s.color || '#828882'), T = C(tone(s.trim || '#c99a3a')), gl = edgeGlow(s);
    const L = G(35), H = z.odd(33), cy = H >> 1, W = L + G(19), ox = G(11);
    const p = mk(W, H, ox, cy), e = mk(W, H, ox, cy);
    const R = trimR(T), th = G(2);
    shaft(p, 0, L + 1, cy, WOOD, th);
    p.rect(0, cy, G(2), th, R.m); p.rect(L - G(6), cy, G(2), th, R.m); p.set(L - G(6), cy, R.l);
    const hx = L - G(3);
    if (b === 'Glaive') {
      blade(p, e, hx, hx + G(16), cy, z.odd(7), M, gl, { curve: (t) => -t * 4 * z.g, width: (t, h) => h - (t < 0.15 ? 1 : 0) });
      p.set(hx + G(2), cy + G(4), M.lo); p.set(hx + G(3), cy + G(5), M.lo);
    } else if (b === 'Bardiche' || b === 'Voulge') {
      // a long crescent blade bound to the haft
      for (let y = -G(13); y <= G(2); y++) {
        const x0 = hx - 1 + Math.round(Math.abs(y + G(5)) * 0.3), x1 = hx + G(6) + Math.round((y + G(13)) * 0.25);
        for (let x = x0; x <= x1; x++) p.set(x, cy + y, x === x1 ? M.edge : x === x1 - 1 ? M.hi : y === -G(13) ? M.hi : x === x0 ? M.lo : M.mid);
        if (gl) e.set(x1, cy + y, gl);
      }
      blade(p, e, L + 1, L + G(6), cy, z.odd(3), M, null, {});
    } else {
      // axe blade on one side, hook or hammer on the other, a spike forward; the axe flares
      // from a narrow neck at the haft to a broad crescent edge
      const n = G(11);
      for (let k = 0; k <= n; k++) {
        const y = -k, t = k / n;
        const w = t <= 0.55 ? G(2) + (k <= 1 ? 1 : 0) : t < 0.85 ? G(3) + Math.round((t - 0.55) * 10 * z.g) : t < 0.95 ? G(5) : G(4);
        const x0 = hx - w + (t <= 0.55 ? 1 : 0), x1 = hx + w;
        for (let x = x0; x <= x1; x++) p.set(x, cy + y - 1, k === n ? M.edge : k === n - 1 ? (x === x0 || x === x1 ? M.hi : M.edge) : x === x1 ? M.lo : x === x0 ? M.hi : x > hx + 1 ? M.md : M.mid);
        if (gl) e.set(x0, cy + y - 1, gl);
      }
      p.set(hx, cy - G(5), M.dk); p.set(hx + 1, cy - G(5), M.dk); p.set(hx, cy - G(4), M.lo);
      if (b === 'Poleaxe') { const a = G(5); p.rect(hx - G(2), cy + G(2), a, a, M.mid); p.rect(hx - G(2), cy + G(2), a, 1, M.hi); p.rect(hx - G(2) + a - 1, cy + G(2), 1, a, M.lo); p.rect(hx - G(2), cy + G(2) + a - 1, a, 1, M.lo); }
      else { p.line(hx, cy + G(2), hx - G(3), cy + G(6), M.mid, G(2)); p.set(hx - G(4), cy + G(7), M.edge); p.set(hx - G(3), cy + G(7), M.lo); }
      blade(p, e, L + G(2), L + G(11), cy, z.odd(5), M, gl, {});
    }
    return done(p, e, { len: L + G(3) - ox });
  },
  staff(s) {
    const b = s.base || 'Staff', z = sizer(s), G = z.G;
    const T = C(tone(s.trim || '#c99a3a')), R = trimR(T);
    const orb = C(s.element && ELEM_GLOW[s.element] ? ELEM_GLOW[s.element] : s.orb || '#c860f0');
    const L = G(32), H = z.odd(19), cy = H >> 1, W = L + G(14), ox = G(13);
    const p = mk(W, H, ox, cy), e = mk(W, H, ox, cy);
    const wood = b === 'Rod of Office' ? T : b === 'Battle Staff' ? C('#4e4b53') : WOOD;
    const th = G(3), t0 = cy - (th >> 1);
    for (let x = 0; x <= L; x++) {
      const wob = b === 'Elder Staff' ? Math.round(Math.sin(x * 0.45 / z.g) * 0.8 * z.g) : 0;
      for (let k = 0; k < th; k++) p.set(x, t0 + k + wob, k === 0 ? light(wood, 1.25) : k === th - 1 ? dark(wood, 0.7) : (x * 7) % 9 === 0 ? wood : light(wood, 1.05));
    }
    p.rect(0, t0, G(3), th, R.m); p.rect(0, t0, G(3), 1, R.l);
    if (b === 'Battle Staff') for (const x of [G(10), G(22)]) { p.rect(x, t0, G(2), th, R.m); p.set(x, t0, R.l); }
    for (let x = G(11); x <= G(15); x++) if (x % 2) { p.set(x, cy, dark(wood, 0.6)); p.set(x, cy + 1, dark(wood, 0.5)); }      // hand wrap
    if (b === 'Quarterstaff') { p.rect(L - G(2), t0, G(3), th, R.m); p.rect(L - G(2), t0, G(3), 1, R.l); return done(p, e, { len: L - ox }); }
    // head: prongs cradling an orb
    const ocx = L + G(5);
    p.line(L - 1, cy - G(2), L + G(3), cy - G(5), R.m, G(2)); p.line(L - 1, cy + G(2), L + G(3), cy + G(6), R.d, G(2));
    p.set(L + G(4), cy - G(6), R.l); p.set(L + G(4), cy + G(6), R.dd);
    if (b === 'Elder Staff') { p.line(L, cy, L + G(6), cy - G(6), wood, G(2)); p.line(L + G(6), cy - G(6), L + G(9), cy - G(1), wood, G(2)); p.set(L + G(6), cy - G(7), light(wood, 1.3)); }
    const r = 4.2 * z.g;
    p.disc(ocx + 0.5, cy + 0.5, r, orb); p.disc(ocx - 0.5, cy - 0.5, r * 0.57, mixc(orb, '#fff4fb', 0.35));
    p.set(ocx - G(1), cy - G(2), '#fff4fb'); p.set(ocx - G(2), cy - G(1), mixc(orb, '#fff4fb', 0.7)); p.set(ocx + G(2), cy + G(3), dark(orb, 0.7)); p.set(ocx + G(3), cy + G(2), dark(orb, 0.75));
    e.disc(ocx + 0.5, cy + 0.5, r, orb); e.disc(ocx - 0.5, cy - 0.5, r * 0.48, '#fff4fb');
    return done(p, e, { len: ocx - ox, orb: [ocx - ox, 0], orbColor: orb });
  },
  wand(s) {
    const b = s.base || 'Wand';
    const T = C(tone(s.trim || '#c99a3a')), R = trimR(T);
    const orb = C(s.element && ELEM_GLOW[s.element] ? ELEM_GLOW[s.element] : '#c860f0');
    const wood = b === 'Bone Wand' ? C('#efdab4') : b === 'Crystal Wand' ? mixc(orb, '#fff4fb', 0.4) : b === 'Willow Wand' ? C('#94603c') : C('#5a3628');
    const W = 24, H = 13, cy = 6;
    const p = mk(W, H, 3, cy), e = mk(W, H, 3, cy);
    for (let x = 1; x <= 16; x++) {
      const th = x < 6 ? 2 : x < 12 ? 2 : 1;
      p.set(x, cy, x < 6 ? light(GRIP, 1.15) : b === 'Rune Wand' && x % 3 === 0 ? orb : light(wood, 1.15));
      if (th > 1) p.set(x, cy + 1, x < 6 ? (x % 2 ? dark(GRIP, 0.7) : GRIP) : dark(wood, 0.72));
    }
    if (b === 'Rune Wand') for (let x = 6; x <= 16; x += 3) e.set(x, cy, orb);
    p.rect(6, cy - 1, 1, 4, R.m); p.set(6, cy - 1, R.l); p.set(7, cy - 1, R.d); p.set(7, cy + 2, R.d);
    p.disc(19, cy + 0.5, 2.7, orb); p.set(18, cy - 1, '#fff4fb'); p.set(20, cy + 2, dark(orb, 0.7));
    e.disc(19, cy + 0.5, 2.7, orb);
    return done(p, e, { len: 16, orb: [16, 0], orbColor: orb });
  },
  claws() { const p = mk(1, 1, 0, 0); return { pix: p, emis: null, len: 3, none: true }; },
  bow(s) {
    const b = s.base || 'Shortbow';
    const draw = s.draw || 0;
    const wood = b === 'Composite Bow' ? C('#cfa978') : b === 'Warbow' ? C('#5a3628') : WOOD;
    const T = C(tone(s.trim || '#c99a3a')), gl = edgeGlow(s), R = trimR(T);
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
    p.line(tipX, cy - Hh, nock, cy, STRING);
    p.line(tipX, cy + Hh, nock, cy, STRING);
    // nocked arrow
    if (draw > 0.05) {
      p.line(nock, cy, gx + 10, cy, '#b07e52');
      p.set(gx + 10, cy, '#b6bdbd'); p.set(gx + 11, cy, GLINT); p.set(gx + 12, cy, '#e2e6e0');
      p.set(gx + 9, cy - 1, '#828882'); p.set(gx + 9, cy + 1, '#6a7276'); p.set(gx + 10, cy - 1, '#b6bdbd');
      p.set(nock + 1, cy - 1, R.m); p.set(nock + 2, cy - 1, R.m); p.set(nock + 1, cy + 1, R.d); p.set(nock + 2, cy + 1, R.d);
      if (gl) { e.set(gx + 11, cy, gl); e.set(gx + 10, cy, gl); e.set(gx + 12, cy, gl); }
    }
    return done(p, e, { len: 10, bow: true });
  },
  crossbow(s) {
    const T = C(tone(s.trim || '#c99a3a')), M = metal(s.color || '#828882'), gl = edgeGlow(s), R = trimR(T);
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
    p.line(px - 3, cy - 11, sx, cy - 1, STRING); p.line(px - 3, cy + 11, sx, cy - 1, STRING);
    if (loaded) { p.line(sx, cy - 2, px + 6, cy - 2, '#b07e52'); p.set(px + 6, cy - 2, M.edge); p.set(px + 7, cy - 2, GLINT); p.set(px + 5, cy - 3, M.hi); if (gl) { e.set(px + 7, cy - 2, gl); e.set(px + 6, cy - 2, gl); } }
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
  const M = metal(spec.color || '#827d82'), T = C(tone(spec.trim || '#c99a3a')), TR = trimR(T);
  // the painted face: a cloth colour from the palette, darkened toward the shield's metal
  const face = C(tone(spec.face || mixc(tone(spec.color || '#827d82'), '#60282c', 0.5)));
  const emb = spec.emblem ? C(tone(spec.emblem)) : null;
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
  const c = C(tone(color)), g = C(glow);
  const p = mk(15, 15, 7, 13), e = mk(15, 15, 7, 13);
  // cover with a lit top edge and a dark lower edge, a spine, page edges, corner caps
  p.rect(1, 1, 12, 12, c);
  p.rect(1, 1, 12, 1, light(c, 1.3)); p.rect(1, 12, 12, 1, dark(c, 0.6)); p.rect(12, 2, 1, 10, dark(c, 0.72));
  p.rect(13, 2, 1, 11, '#efdab4'); p.rect(2, 13, 11, 1, '#e2c494'); p.set(13, 12, '#cfa978');
  for (let y = 3; y < 12; y += 2) p.set(13, y, '#cfa978');
  p.rect(1, 1, 2, 12, dark(c, 0.7)); p.rect(1, 1, 1, 12, dark(c, 0.55));
  for (const [x, y] of [[3, 1], [11, 1], [3, 12], [11, 12]]) p.set(x, y, '#e8c35a');
  // a glowing rune on the cover
  const rune = [[7, 3], [7, 4], [6, 5], [8, 5], [5, 6], [9, 6], [7, 6], [6, 7], [8, 7], [7, 8], [7, 9], [7, 10]];
  for (const [x, y] of rune) { p.set(x, y, g); e.set(x, y, g); }
  e.set(7, 6, '#fff4fb'); p.set(7, 6, mixc(g, '#fff4fb', 0.6));
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
  const c = C(color || '#efdab4');
  let p, e = null;
  if (kind === 'arrow' || kind === 'bolt') {
    const L = kind === 'bolt' ? 13 : 16;
    p = mk(L + 3, 7, Math.floor(L / 2), 3);
    p.line(2, 3, L - 2, 3, '#b07e52'); p.line(4, 3, L - 3, 3, '#94603c');
    // head
    p.set(L, 3, GLINT); p.set(L - 1, 3, '#e2e6e0'); p.set(L - 2, 2, '#b6bdbd'); p.set(L - 2, 4, '#6a7276'); p.set(L - 3, 2, '#828882'); p.set(L - 3, 4, '#4a5259');
    // fletching
    p.set(1, 2, c); p.set(2, 2, c); p.set(3, 2, light(c, 1.15)); p.set(0, 1, c); p.set(1, 1, c);
    p.set(1, 4, dark(c, 0.8)); p.set(2, 4, dark(c, 0.8)); p.set(3, 4, c); p.set(0, 5, dark(c, 0.8)); p.set(1, 5, dark(c, 0.8));
    if (color && color !== '#efdab4') { e = mk(p.w, p.h, p.ox, p.oy); e.set(L, 3, c); e.set(L - 1, 3, c); e.set(L - 2, 2, c); e.set(L - 2, 4, c); }
  } else if (kind === 'shard' || kind === 'thorn') {
    p = mk(16, 8, 8, 4);
    p.poly([[1, 4], [8, 1], [15.5, 4.5], [8, 7.5]], c);
    p.poly([[3, 4], [8, 2], [13, 4]], light(c, 1.25));
    p.line(3, 4, 13, 4, light(c, 1.5)); p.line(5, 5, 12, 5, dark(c, 0.8));
    p.set(14, 4, '#fff4fb');
    e = p.clone();
  } else {
    p = mk(15, 15, 7, 7);
    p.disc(7.5, 7.5, 5.8, c); p.disc(7, 7, 4, light(c, 1.25)); p.disc(6.5, 6.5, 2.2, light(c, 1.5)); p.set(5, 5, '#fff4fb'); p.set(6, 5, '#fff4fb');
    e = p.clone();
  }
  p.outline();
  s = { pix: p, emis: e };
  cache.set(key, s);
  return s;
}
