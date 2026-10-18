// Ground pickups: dropped weapons show their real sprite, armour gets a small piece icon in its
// material and rarity colours, plus coins, materials, potions and tomes. Pivot at the base.
// Drawn natively at the art-pixel density: ramps of 3-4 shades, 1px glints and outlines.
import { Pix, C, light, dark, mixc } from '../pix.js';
import { weaponSprite, shieldSprite, tomeSprite } from './weapons.js';
import { weaponSpec, shieldSpec, materialColor, rarityTrim } from '../gearLook.js';
import { RARITY, MATERIALS_LIST, CONSUMABLES } from '../../data/items.js';
import { TOMES } from '../../data/tomes.js';

const cache = new Map();
function mk(w, h) { const p = new Pix(w, h); p.ox = Math.floor(w / 2); p.oy = h - 1; return p; }
const WHITE = [255, 255, 255, 255];
const OUT = [22, 16, 24, 255];

export function pickupSprite(kind, data) {
  const key = kind + ':' + (kind === 'item' ? [data.slot, data.type, data.base, data.weight, data.material, data.rarity, data.element, data.tome, data.set, data.legendary].join('|') : kind === 'gold' ? '' : data.id);
  let s = cache.get(key);
  if (s) return s;
  s = build(kind, data);
  cache.set(key, s);
  return s;
}

// ------------------------------------------------------------------ helpers
// paint a hand-drawn bitmap: rows of palette keys, '.' = empty
function paint(p, x, y, rows, pal) {
  for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) {
    const k = rows[j][i];
    if (k !== '.' && pal[k]) p.set(x + i, y + j, pal[k]);
  }
}
// colour ramp for a base colour: hi2 / hi / base / lo / lo2
const ramp = (c) => { c = C(c); return { h2: light(c, 1.5), h: light(c, 1.22), b: c, l: dark(c, 0.74), l2: dark(c, 0.52) }; };
// shade a filled region by position: lit toward the top-left, shadow toward the bottom-right
function shadeBody(p, x0, y0, w, h, r, k = 1) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    if (!p.a(x, y)) continue;
    const u = ((x - x0) / Math.max(1, w - 1) + (y - y0) / Math.max(1, h - 1)) * 0.5 * k;
    const up = !p.a(x, y - 1), lt = !p.a(x - 1, y), dn = !p.a(x, y + 1), rt = !p.a(x + 1, y);
    if (up || lt) p.set(x, y, u < 0.55 ? r.h : r.b);
    else if (dn || rt) p.set(x, y, r.l2 || r.l);
    else if (u > 0.62) p.set(x, y, r.l);
  }
}
function hasPix(p) { for (let i = 3; i < p.d.length; i += 4) if (p.d[i]) return true; return false; }

// ------------------------------------------------------------------ gold
// one coin seen from above at an angle: bright top rim, face, shaded lower face, dark edge
const COIN = ['.aaaa.', 'abbbbc', 'bbbbcc', 'dccccd', '.dddd.'];
function goldPile() {
  const p = mk(18, 12), e = mk(18, 12);
  const g = C('#f0c040'), pal = { a: light(g, 1.42), b: g, c: dark(g, 0.8), d: dark(g, 0.5) };
  // back row, a short stack in the middle, then the front row (each later coin overlaps)
  for (const [x, y] of [[2, 3], [10, 2], [6, 1], [12, 5], [1, 6], [6, 4], [7, 7], [12, 7]]) paint(p, x, y, COIN, pal);
  for (const [x, y] of [[7, 4], [3, 6], [8, 7], [13, 5], [7, 1]]) { p.set(x, y, WHITE); e.set(x, y, [255, 240, 160, 255]); }
  p.outline(OUT);
  return { pix: p, emis: e };
}

// ------------------------------------------------------------------ consumables
function flask(c, round = true) {
  const p = mk(11, 16), e = mk(11, 16), L = ramp(c), glass = C('#c8d8e0'), gl = ramp(glass), cork = ramp('#8a6a40');
  paint(p, 3, 0, ['.hbb.', 'hbbbl'], { h: cork.h, b: cork.b, l: cork.l });
  paint(p, 4, 2, ['gbl', 'gbl', 'gbl'], { g: WHITE, b: gl.b, l: gl.l });
  if (round) {
    p.disc(5.5, 10.2, 5.2, gl.b);
    for (let y = 7; y < 16; y++) for (let x = 0; x < 11; x++) {
      const d = Math.hypot(x + 0.5 - 5.5, y + 0.5 - 10.2);
      if (d > 4.3 || y < 8) continue;
      p.set(x, y, y === 8 ? L.h2 : d > 3.2 && x > 5 ? L.l : x + y > 17 ? L.l : L.b);
      if (d < 3 && y > 8) e.set(x, y, L.b);
    }
  } else {
    p.rrect(1, 5, 9, 11, gl.b, 2);
    for (let y = 7; y < 15; y++) for (let x = 2; x < 9; x++) { p.set(x, y, y === 7 ? L.h2 : x > 6 || y > 12 ? L.l : L.b); if (y > 8 && x > 2 && x < 7) e.set(x, y, L.b); }
  }
  // glass: a bright streak down the left, a glint, a darker right edge
  p.set(2, 9, WHITE); p.set(2, 10, gl.h2); p.set(2, 11, gl.h2); p.set(3, 8, WHITE);
  p.outline(OUT);
  return { pix: p, emis: e };
}
function consumable(id) {
  const c = CONSUMABLES[id]?.color || '#e04040';
  if (id === 'waystone_shard') return crystal('#80c0ff', true);
  if (id === 'roasted_meat') {
    const p = mk(15, 11), m = ramp('#a06040'), bone = ramp('#e8e0d0');
    p.ellipse(9, 5, 5.6, 4.2, m.b);
    shadeBody(p, 3, 1, 12, 9, m);
    p.set(6, 3, m.h2); p.set(7, 2, m.h2); p.set(10, 4, m.l2); p.set(8, 6, m.l2);
    paint(p, 0, 6, ['.hh..', 'hbbbb', 'hbbbl', '.ll..'], { h: bone.h2, b: bone.b, l: bone.l });
    p.outline(OUT);
    return { pix: p, emis: null };
  }
  return flask(c, id === 'hp_potion' || id === 'mana_potion');
}

// ------------------------------------------------------------------ materials
function crystal(col, emissive = false) {
  const p = mk(11, 15), e = mk(11, 15), r = ramp(col);
  p.poly([[5.5, 0], [10, 5], [8, 14.5], [3, 14.5], [1, 5]], r.b);
  p.poly([[5.5, 0], [1, 5], [3, 14.5], [5.5, 14.5]], r.h);          // lit left facet
  p.poly([[5.5, 0], [10, 5], [7.5, 5.5]], r.h2);                      // top facet
  p.poly([[8.6, 7], [10, 5], [8, 14.5], [6.5, 14.5]], r.l);          // shadow facet
  p.line(5, 2, 4, 12, r.h2);
  p.set(4, 3, WHITE); p.set(3, 6, WHITE);
  if (emissive) { e.line(5, 3, 5, 12, r.h2); e.set(4, 3, WHITE); }
  p.outline(OUT);
  return { pix: p, emis: emissive ? e : null };
}
function material(id) {
  const col = MATERIALS_LIST[id]?.color || '#c0c0c0', r = ramp(col);
  let p;
  if (id === 'ore' || id === 'stone') {
    p = mk(14, 11);
    const rock = ramp(mixc(C(col), '#5a5a60', 0.45));
    p.ellipse(7, 6, 6.4, 4.6, rock.b); p.ellipse(4.5, 4.2, 3.2, 2.4, rock.b); p.ellipse(10, 4.6, 3, 2.6, rock.b);
    shadeBody(p, 0, 1, 14, 10, rock);
    for (const [x, y] of [[4, 4], [8, 6], [10, 3], [6, 8]]) { p.set(x, y, r.h2); p.set(x + 1, y, r.l); }
    p.set(3, 3, WHITE);
  } else if (id === 'wood') {
    p = mk(16, 9);
    const bark = ramp(col), end = ramp(mixc(C(col), '#e0b070', 0.55));
    p.rrect(0, 1, 13, 7, bark.b, 1);
    for (let x = 1; x < 12; x++) { p.set(x, 1, bark.h); p.set(x, 7, bark.l2); if (x % 4 === 1) p.set(x, 3, bark.l); if (x % 5 === 3) p.set(x, 5, bark.l); }
    p.ellipse(13, 4.5, 2.6, 3.6, end.b); p.ellipse(13, 4.5, 1.4, 2, end.h); p.set(13, 4, end.l);
  } else if (id === 'leather') {
    p = mk(14, 10);
    p.poly([[1, 2], [5, 0.5], [9, 1.5], [13, 0.5], [12.5, 6], [13.5, 9.5], [7, 8.5], [0.5, 9.5], [1.5, 6]], r.b);
    shadeBody(p, 0, 0, 14, 10, r);
    p.line(2, 5, 11, 5, r.l); for (let x = 3; x < 12; x += 2) p.set(x, 7, r.h);
  } else if (id === 'cloth') {
    p = mk(15, 10);
    p.rect(0, 2, 12, 7, r.b); p.ellipse(12.5, 5.5, 2.5, 3.6, r.h);
    for (let x = 0; x < 12; x++) { p.set(x, 2, r.h); p.set(x, 8, r.l2); }
    p.rect(3, 2, 1, 7, r.l); p.rect(8, 2, 1, 7, r.l); p.set(12, 5, r.l); p.set(13, 6, r.l);
  } else if (id === 'bone') {
    p = mk(15, 9);
    const b = ramp(col);
    p.line(3, 6, 11, 2, b.b, 2);
    p.disc(2.2, 5.5, 1.6, b.b); p.disc(3.4, 7.4, 1.6, b.b); p.disc(11.6, 1.6, 1.6, b.b); p.disc(12.8, 3.4, 1.6, b.b);
    shadeBody(p, 0, 0, 15, 9, b);
  } else if (id === 'mithral' || id === 'starmetal') {
    p = mk(15, 9);
    p.poly([[3, 1], [12, 1], [14.5, 8.5], [0.5, 8.5]], r.b);
    p.poly([[3, 1], [12, 1], [11, 3], [4, 3]], r.h2);
    p.poly([[11, 3], [12, 1], [14.5, 8.5], [12.5, 8.5]], r.l);
    for (let x = 4; x < 11; x++) p.set(x, 4, r.h);
    p.set(5, 2, WHITE); p.set(8, 2, WHITE);
  } else if (id === 'dragonscale') {
    p = mk(12, 13);
    p.poly([[1, 1], [11, 1], [10.5, 7], [6, 12.5], [1.5, 7]], r.b);
    shadeBody(p, 0, 0, 12, 13, r);
    p.line(6, 2, 6, 10, r.h); p.line(7, 2, 7, 10, r.l);
    p.set(3, 3, WHITE);
  } else if (id === 'herb') {
    p = mk(13, 14);
    const leaf = ramp('#4a9a3a');
    p.line(6, 13, 6, 4, leaf.l);
    p.ellipse(4, 5, 2.8, 1.6, leaf.b); p.ellipse(9, 7, 2.8, 1.6, leaf.b); p.ellipse(6.5, 2, 1.8, 2.2, leaf.b); p.ellipse(4, 9.5, 2.4, 1.4, leaf.b);
    for (const [x, y] of [[3, 4], [8, 6], [6, 1], [3, 9]]) p.set(x, y, leaf.h2);
    paint(p, 5, 11, ['.r.', 'rrr', '.r.'], { r: r.b });
    p.set(5, 12, r.h);
  } else if (id.startsWith('ess_')) {
    const e = mk(12, 13);
    p = mk(12, 13);
    p.disc(6, 7, 4.8, r.b); p.disc(5.2, 6, 3, r.h); p.disc(4.6, 5.2, 1.4, r.h2); p.set(4, 4, WHITE);
    for (let k = 0; k < 6; k++) { const a = k * 1.05; p.set(Math.round(6 + Math.cos(a) * 4), Math.round(7 + Math.sin(a) * 4), k % 2 ? r.l : r.h2); }
    p.set(6, 0, r.h); p.set(9, 1, r.h2); p.set(2, 2, r.h);
    e.disc(6, 7, 3.6, r.b); e.disc(5.2, 6, 2, r.h2); e.set(4, 4, WHITE);
    p.outline(OUT);
    return { pix: p, emis: e };
  } else if (id === 'dust' || id === 'gold_dust') {
    p = mk(14, 9);
    p.ellipse(7, 6, 6.4, 3, r.l); p.ellipse(7, 5, 5, 2.6, r.b); p.ellipse(6, 4, 2.6, 1.6, r.h);
    for (const [x, y] of [[4, 4], [9, 5], [7, 3], [11, 6]]) p.set(x, y, r.h2);
    p.set(6, 3, WHITE);
    p.outline(OUT);
    const e = mk(14, 9); for (const [x, y] of [[4, 4], [9, 5], [7, 3], [6, 3]]) e.set(x, y, r.h2);
    return { pix: p, emis: e };
  } else {
    return crystal(col, id === 'crown_shard' || id === 'glass' || id === 'voidshard');
  }
  p.outline(OUT);
  return { pix: p, emis: null };
}

// ------------------------------------------------------------------ armour icons
function armorIcon(data) {
  const col = C(data.weight ? materialColor(data) : '#d8b050'), T = C(rarityTrim(data));
  const M = ramp(col), R = ramp(T), gold = ramp('#d8b050');
  const p = mk(18, 18), e = mk(18, 18);
  const w = data.weight;
  switch (data.slot) {
    case 'helm': {
      if (data.legendary === 'ashencrown' || data.legendary === 'hollowcrown') {
        const g = ramp(data.legendary === 'ashencrown' ? '#ffc040' : '#a070ff');
        p.rect(2, 8, 14, 6, g.b);
        for (const x of [2, 8, 14]) p.poly([[x, 8], [x + 1, 2.5], [x + 2, 8]], g.b);
        shadeBody(p, 2, 2, 14, 12, g);
        for (let x = 3; x < 15; x++) p.set(x, 9, g.h2);
        p.disc(9, 11, 1.6, '#ff4030'); p.set(8, 10, WHITE); e.disc(9, 11, 1.6, '#ff4030');
        for (const x of [4, 13]) { p.set(x, 11, '#60c0ff'); e.set(x, 11, '#60c0ff'); }
        break;
      }
      if (w === 'cloth') {
        // hood: a soft cowl with a dark opening
        p.ellipse(9, 8, 7, 7, M.b); p.rect(2, 8, 14, 8, M.b);
        shadeBody(p, 2, 1, 14, 15, M);
        p.ellipse(9, 10, 4, 4.4, '#140e14'); p.rect(5, 10, 8, 5, '#140e14');
        p.line(4, 15, 14, 15, R.b); p.line(5, 3, 7, 2, M.h2);
        break;
      }
      p.ellipse(9, 9, 7, 7, M.b); p.rect(2, 9, 14, 7, M.b);
      shadeBody(p, 2, 2, 14, 14, M);
      p.ellipse(6.5, 5.5, 2.2, 1.4, M.h2); p.set(5, 5, WHITE);
      if (w === 'leather') p.rect(3, 9, 12, 1, M.l2);
      else { p.rect(3, 9, 12, 2, '#140e14'); p.rect(8, 9, 2, 5, M.b); p.set(8, 9, M.h); }   // visor slit + nose guard
      if (w === 'mail') for (let y = 11; y < 15; y++) for (let x = 3 + (y & 1); x < 15; x += 2) p.set(x, y, M.l);
      p.rect(2, 15, 14, 2, R.b); p.rect(2, 15, 14, 1, R.h); p.set(9, 2, R.h2);
      break;
    }
    case 'chest': {
      if (w === 'cloth') {
        p.poly([[3, 2], [7, 1], [11, 1], [15, 2], [16.5, 17], [1.5, 17]], M.b);
        shadeBody(p, 1, 1, 16, 16, M);
        p.poly([[7, 1], [9, 6], [11, 1]], '#1a1018'); p.line(9, 6, 9, 16, M.l);
        p.rect(3, 9, 12, 2, R.b); p.rect(3, 9, 12, 1, R.h);
        break;
      }
      p.poly([[3, 3], [7, 1.5], [11, 1.5], [15, 3], [14, 15.5], [4, 15.5]], M.b);
      shadeBody(p, 3, 1, 12, 15, M);
      p.ellipse(3, 4.5, 3, 2.4, M.b); p.ellipse(15, 4.5, 3, 2.4, M.l);    // pauldrons
      p.set(2, 3, M.h2); p.set(3, 3, M.h2);
      p.line(9, 3, 9, 13, M.h); p.line(10, 3, 10, 13, M.l);
      if (w === 'mail') for (let y = 5; y < 15; y += 2) for (let x = 5 + (y & 2 ? 1 : 0); x < 14; x += 2) p.over(x, y, M.l);
      if (w === 'leather') for (let y = 5; y < 14; y += 3) p.set(6, y, M.l2);
      p.rect(4, 11, 10, 2, R.b); p.rect(4, 11, 10, 1, R.h); p.set(9, 11, gold.h2);
      p.set(6, 4, WHITE);
      break;
    }
    case 'gloves': {
      p.rrect(3, 2, 8, 11, M.b, 2); p.rrect(10, 5, 4, 5, M.b, 1);           // hand + thumb
      shadeBody(p, 3, 2, 11, 11, M);
      for (const x of [5, 7, 9]) p.line(x, 2, x, 6, M.l);                    // fingers
      p.set(4, 3, M.h2); p.set(4, 4, M.h2);
      p.rect(2, 12, 10, 4, R.b); p.rect(2, 12, 10, 1, R.h); p.rect(2, 15, 10, 1, R.l);
      if (w === 'plate') { p.line(4, 8, 9, 8, M.h); p.line(4, 9, 9, 9, M.l); }
      break;
    }
    case 'legs': {
      p.rect(3, 1, 12, 4, M.b); p.rect(3, 5, 5, 12, M.b); p.rect(10, 5, 5, 12, M.b);
      shadeBody(p, 3, 1, 12, 16, M);
      p.rect(3, 1, 12, 2, R.b); p.rect(3, 1, 12, 1, R.h); p.set(9, 2, gold.h2);
      if (w === 'plate' || w === 'mail') { p.ellipse(5.5, 10, 1.8, 1.4, M.h2); p.ellipse(12.5, 10, 1.8, 1.4, M.h); }  // knee cops
      p.set(4, 6, M.h2); p.line(8, 5, 8, 16, M.l2); p.line(10, 5, 10, 16, M.l2);
      break;
    }
    case 'boots': {
      p.rect(3, 1, 6, 11, M.b); p.rrect(3, 10, 11, 5, M.b, 2);
      shadeBody(p, 3, 1, 11, 14, M);
      p.rect(3, 15, 12, 2, M.l2); p.rect(3, 15, 12, 1, dark(col, 0.4));     // sole
      p.rect(3, 1, 6, 2, R.b); p.rect(3, 1, 6, 1, R.h);
      p.set(4, 4, M.h2); p.set(4, 5, M.h2); p.set(10, 11, M.h2);
      if (w === 'leather' || w === 'cloth') for (let y = 5; y < 10; y += 2) p.set(7, y, M.l2);
      break;
    }
    case 'amulet': {
      for (let k = 0; k < 7; k++) { p.set(3 + k, 1 + k, k % 2 ? gold.l : gold.h); p.set(14 - k, 1 + k, k % 2 ? gold.l : gold.b); }
      p.disc(9, 11.5, 4.2, gold.b); p.disc(9, 11.5, 3, R.b); p.disc(8.3, 10.8, 1.6, R.h); p.set(7, 10, WHITE);
      p.set(10, 13, R.l); p.set(11, 12, R.l);
      e.disc(9, 11.5, 2.4, R.b); e.set(7, 10, WHITE);
      break;
    }
    case 'ring': {
      p.ring(9, 11, 5.4, gold.b, 2.2);
      for (let y = 5; y < 17; y++) for (let x = 3; x < 15; x++) if (p.a(x, y)) { const lit = x + y < 18; p.set(x, y, lit ? gold.h : x + y > 22 ? gold.l : gold.b); }
      p.set(5, 9, WHITE);
      p.disc(9, 5, 2.6, R.b); p.disc(8.4, 4.4, 1.2, R.h2); p.set(8, 4, WHITE);
      e.disc(9, 5, 1.8, R.b); e.set(8, 4, WHITE);
      break;
    }
    default: {
      // charm / pouch: a tied leather bag with a rarity-coloured knot
      const bag = ramp('#8a6a40');
      p.ellipse(9, 11, 6, 5.4, bag.b); p.poly([[6, 4], [12, 4], [11, 7], [7, 7]], bag.b);
      shadeBody(p, 3, 4, 12, 13, bag);
      p.rect(6, 6, 6, 1, R.b); p.set(9, 6, R.h2); p.set(6, 9, bag.h2);
      e.set(9, 6, R.h2);
    }
  }
  p.outline(OUT);
  return { pix: p, emis: hasPix(e) ? e : null };
}

function build(kind, data) {
  if (kind === 'gold') return goldPile();
  if (kind === 'mat') return material(data.id);
  if (kind === 'cons') return consumable(data.id);
  // ---- items
  if (data.tome) { const t = tomeSprite(TOMES[data.tome]?.color || '#6a2a20', '#ffe0a0'); return { pix: t.pix, emis: t.emis }; }
  if (data.slot === 'mainhand' && data.type) {
    const w = weaponSprite({ ...weaponSpec(data), draw: 0 });
    return { pix: lay(w.pix), emis: w.emis ? lay(w.emis) : null };
  }
  if (data.slot === 'offhand') { const sh = shieldSprite(shieldSpec(data)); return { pix: sh.front, emis: null }; }
  return armorIcon(data);
}

// lay a weapon sprite down diagonally on the ground: an exact nearest-pixel 45-degree turn
// (every target pixel looks up its source, so lines stay unbroken and no pixel is doubled)
function lay(src) {
  const n = Math.ceil((src.w + src.h) * 0.75) + 4, h = n / 2, k = 0.7071 / 0.9;
  const p = new Pix(n, n);
  for (let ty = 0; ty < n; ty++) for (let tx = 0; tx < n; tx++) {
    const X = tx + 0.5 - h, Y = ty + 0.5 - h;
    const u = (X - Y) * k, v = (X + Y) * k;
    const sx = Math.floor(u + src.ox), sy = Math.floor(v + src.oy);
    if (sx < 0 || sy < 0 || sx >= src.w || sy >= src.h) continue;
    const i = (sy * src.w + sx) * 4;
    if (!src.d[i + 3]) continue;
    p.set(tx, ty, [src.d[i], src.d[i + 1], src.d[i + 2], src.d[i + 3]]);
  }
  const t = p.trim(0);
  t.ox = Math.floor(t.w / 2); t.oy = t.h - 1;
  return t;
}
export const rarityColor = (r) => (RARITY[r] || RARITY.common).color;
