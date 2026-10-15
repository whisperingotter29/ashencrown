// Ground pickups: dropped weapons show their real sprite, armour gets a small piece icon in its
// material and rarity colours, plus coins, materials, potions and tomes. Pivot at the base.
import { Pix, C, light, dark, mixc } from '../pix.js';
import { weaponSprite, shieldSprite, tomeSprite } from './weapons.js';
import { weaponSpec, shieldSpec, materialColor, rarityTrim } from '../gearLook.js';
import { RARITY, MATERIALS_LIST, CONSUMABLES } from '../../data/items.js';
import { TOMES } from '../../data/tomes.js';

const cache = new Map();
function mk(w, h) { const p = new Pix(w, h); p.ox = Math.floor(w / 2); p.oy = h - 1; return p; }

export function pickupSprite(kind, data) {
  const key = kind + ':' + (kind === 'item' ? [data.slot, data.type, data.base, data.weight, data.material, data.rarity, data.element, data.tome, data.set, data.legendary].join('|') : kind === 'gold' ? '' : data.id);
  let s = cache.get(key);
  if (s) return s;
  s = build(kind, data);
  cache.set(key, s);
  return s;
}

function build(kind, data) {
  if (kind === 'gold') {
    const p = mk(11, 7), e = mk(11, 7);
    const g = C('#f0c040');
    for (const [x, y] of [[2, 4], [6, 4], [4, 2], [8, 3]]) { p.ellipse(x + 1, y + 1, 2, 1.2, dark(g, 0.75)); p.ellipse(x + 1, y + 0.6, 2, 1.1, g); p.set(x, y, light(g, 1.3)); }
    e.set(4, 2, '#fff0a0');
    p.outline();
    return { pix: p, emis: e };
  }
  if (kind === 'mat') {
    const c = C(MATERIALS_LIST[data.id]?.color || '#c0c0c0');
    const p = mk(9, 8);
    if (data.id === 'ore' || data.id === 'stone') { p.ellipse(4.5, 4.5, 3.5, 2.8, mixc(c, '#5a5a60', 0.4)); p.set(3, 3, light(c, 1.4)); p.set(5, 4, c); }
    else if (data.id === 'wood') { p.rect(1, 3, 7, 3, c); p.rect(1, 3, 7, 1, light(c, 1.2)); p.set(7, 4, dark(c, 0.6)); }
    else if (data.id === 'leather' || data.id === 'cloth') { p.rrect(1, 2, 7, 5, c, 1); p.line(2, 4, 6, 4, dark(c, 0.75)); }
    else { p.poly([[4.5, 0.5], [8, 3.5], [4.5, 7.5], [1, 3.5]], c); p.line(4, 1, 2, 4, light(c, 1.5)); p.set(5, 5, dark(c, 0.7)); }
    p.outline();
    return { pix: p, emis: data.id === 'crown_shard' || data.id === 'dust' || data.id === 'glass' ? p : null };
  }
  if (kind === 'cons') {
    const c = C(CONSUMABLES[data.id]?.color || '#e04040');
    const p = mk(7, 10), e = mk(7, 10);
    p.rect(2, 0, 3, 1, '#8a6a40'); p.rect(3, 1, 1, 2, '#c8d0d8');
    p.disc(3.5, 6, 3, '#c8d8e0'); p.disc(3.5, 6.5, 2.4, c); p.set(2, 5, '#ffffff');
    e.disc(3.5, 6.8, 1.6, c);
    p.outline();
    return { pix: p, emis: e };
  }
  // ---- items
  if (data.tome) { const t = tomeSprite(TOMES[data.tome]?.color || '#6a2a20', '#ffe0a0'); return { pix: t.pix, emis: t.emis }; }
  if (data.slot === 'mainhand' && data.type) {
    const w = weaponSprite({ ...weaponSpec(data), draw: 0 });
    return { pix: lay(w.pix), emis: w.emis ? lay(w.emis) : null };
  }
  if (data.slot === 'offhand') { const sh = shieldSprite(shieldSpec(data)); return { pix: sh.front, emis: null }; }
  const col = C(data.weight ? materialColor(data) : '#d8b050'), T = C(rarityTrim(data));
  const p = mk(11, 11), e = mk(11, 11);
  switch (data.slot) {
    case 'helm':
      if (data.legendary === 'ashencrown' || data.legendary === 'hollowcrown') { const g = C(data.legendary === 'ashencrown' ? '#ffc040' : '#a070ff'); p.rect(2, 5, 7, 3, g); for (const x of [2, 5, 8]) p.rect(x, 3, 1, 2, light(g, 1.3)); p.set(5, 6, '#ff4030'); e.set(5, 6, '#ff4030'); break; }
      p.ellipse(5.5, 6, 4, 4, col); p.rect(1, 6, 9, 4, col); p.rect(2, 6, 7, 1, '#140e14'); p.ellipse(4, 4, 1.4, 1, light(col, 1.4)); p.rect(1, 9, 9, 1, T); break;
    case 'chest': p.poly([[1, 2], [4, 1], [7, 1], [10, 2], [9, 10], [2, 10]], col); p.line(5, 2, 5, 9, light(col, 1.25)); p.rect(2, 7, 7, 1, T); p.rect(0, 2, 2, 3, dark(col, 0.8)); p.rect(9, 2, 2, 3, dark(col, 0.8)); break;
    case 'gloves': p.rrect(2, 2, 5, 7, col, 1); p.rect(7, 4, 2, 3, col); p.rect(2, 8, 5, 2, T); p.set(3, 3, light(col, 1.3)); break;
    case 'legs': p.rect(2, 1, 7, 3, col); p.rect(2, 4, 3, 6, col); p.rect(6, 4, 3, 6, col); p.rect(2, 1, 7, 1, T); p.set(3, 5, light(col, 1.3)); break;
    case 'boots': p.rect(2, 1, 3, 7, col); p.rect(2, 7, 6, 3, col); p.rect(2, 1, 3, 1, T); p.rect(2, 9, 7, 1, dark(col, 0.6)); break;
    case 'amulet': p.line(2, 1, 5, 6, '#c8a050'); p.line(8, 1, 5, 6, '#c8a050'); p.disc(5.5, 7.5, 2.4, T); p.set(5, 7, '#ffffff'); e.disc(5.5, 7.5, 1.4, T); break;
    case 'ring': p.ring(5.5, 6.5, 3, C('#d8b050'), 1.5); p.disc(5.5, 3.2, 1.4, T); e.set(5, 3, T); break;
    default: p.rrect(2, 3, 7, 7, '#8a6a40', 2); p.rect(4, 2, 3, 1, '#5a3a20'); p.set(5, 6, T);
  }
  p.outline();
  return { pix: p, emis: hasPix(e) ? e : null };
}
function hasPix(p) { for (let i = 3; i < p.d.length; i += 4) if (p.d[i]) return true; return false; }
// lay a weapon sprite down diagonally on the ground (pixel-exact 45-degree shear)
function lay(src) {
  const n = Math.ceil((src.w + src.h) * 0.75) + 2;
  const p = new Pix(n, n);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const i = (y * src.w + x) * 4;
    if (!src.d[i + 3]) continue;
    const u = x - src.ox, v = y - src.oy;
    const tx = Math.round((u + v) * 0.7071 * 0.9 + n / 2), ty = Math.round((v - u) * 0.7071 * 0.9 + n / 2);
    p.set(tx, ty, [src.d[i], src.d[i + 1], src.d[i + 2], src.d[i + 3]]);
    p.set(tx + 1, ty, [src.d[i], src.d[i + 1], src.d[i + 2], src.d[i + 3]]);
  }
  const t = p.trim(0);
  t.ox = Math.floor(t.w / 2); t.oy = t.h - 1;
  return t;
}
export const rarityColor = (r) => (RARITY[r] || RARITY.common).color;
