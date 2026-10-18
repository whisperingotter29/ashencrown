// Item -> sprite spec mapping: armour pieces become humanoid look fields, weapons and shields
// become weapon / shield sprite specs. Colours follow material, rarity trim and item sets, and are
// all taken from the master palette ramps (src/px/palette.js): metals on the steel / gold / frost
// ramps, cloth and leather on the cloth ramps, trims on the bright ends.
import { RARITY, MATERIALS, SETS } from '../data/items.js';
import { tone } from './lookTone.js';

// per material: plate / mail metal, its trim, robe cloth and leather
const METAL = { rusted: '#6a7276', iron: '#828882', steel: '#b6bdbd', ashsteel: '#4e4b53', gilded: '#c99a3a', mithral: '#a8d0ec', dragonbone: '#efdab4', starforged: '#96a2bc', voidglass: '#4a3266' };
const MTRIM = { rusted: '#94603c', iron: '#77492f', steel: '#b07e52', ashsteel: '#c2401c', gilded: '#f6e39a', mithral: '#3e6aa8', dragonbone: '#8a3434', starforged: '#fff4dc', voidglass: '#c860f0' };
const CLOTH = { rusted: '#55323d', iron: '#4e4b53', steel: '#243e7b', ashsteel: '#3e1c2c', gilded: '#e2c494', mithral: '#525c83', dragonbone: '#60282c', starforged: '#172d64', voidglass: '#351135' };
const LEATHER = { rusted: '#77492f', iron: '#5a3628', steel: '#60282c', ashsteel: '#3f2622', gilded: '#9a6424', mithral: '#2a3240', dragonbone: '#8a3434', starforged: '#243e7b', voidglass: '#4a1a48' };
// rarity trims (epic and up show their rarity colour) on palette accents
const RTRIM = ['#e2c494', '#6a8c44', '#5a8fc8', '#a87cc0', '#ec7a2a', '#cc6a86'];

const rIndex = (item) => (RARITY[item.rarity] || RARITY.common).index;
export function rarityTrim(item) {
  if (item.set && SETS[item.set]) return tone(SETS[item.set].trim);
  const ri = rIndex(item);
  if (ri >= 4) return RTRIM[ri] || tone(RARITY[item.rarity].color);
  if (MTRIM[item.material]) return MTRIM[item.material];
  const mat = MATERIALS.find((m) => m.id === item.material);
  return mat ? tone(mat.trim) : '#94603c';
}
export function materialColor(item) {
  if (item.set && SETS[item.set]) return tone(SETS[item.set].color);
  if (item.weight === 'cloth') return CLOTH[item.material] || '#55323d';
  if (item.weight === 'leather') return LEATHER[item.material] || '#77492f';
  if (METAL[item.material]) return METAL[item.material];
  const mat = MATERIALS.find((m) => m.id === item.material);
  return mat ? tone(mat.color) : '#828882';
}

// armour slots -> look fields for humanSprites()
export function armorLook(equip = {}) {
  const out = {};
  const h = equip.helm;
  if (h) {
    const col = materialColor(h), trim = rarityTrim(h), ri = rIndex(h);
    if (h.legendary === 'ashencrown') out.helm = { kind: 'crown', color: '#e8c35a', gem: '#ec7a2a' };
    else if (h.legendary === 'hollowcrown') out.helm = { kind: 'crown', color: '#a87cc0', gem: '#fff4fb' };
    else if (h.weight === 'cloth') out.helm = { kind: 'hood', color: col };
    else if (h.weight === 'leather') out.helm = { kind: 'cap', color: col };
    else if (h.weight === 'mail') out.helm = { kind: 'coif', color: col, trim };
    else out.helm = { kind: 'great', color: col, trim, crest: ri === 2, plume: ri >= 3 ? trim : null, glow: ri >= 4 ? trim : null };
  }
  const c = equip.chest;
  if (c) {
    const ri = rIndex(c);
    out.chest = { weight: c.weight, color: materialColor(c), trim: rarityTrim(c) };
    if (ri >= 2 || c.set) out.cape = c.set && SETS[c.set] ? tone(SETS[c.set].trim) : ri >= 4 ? '#60282c' : materialColor(c);
    // light armour gets a scarf (in the trim colour) instead of a cape until it's rare enough
    if (c.weight === 'leather' && !out.cape) out.scarf = ri >= 2 ? rarityTrim(c) : '#8a3434';
  }
  if (equip.gloves) out.gloves = { color: materialColor(equip.gloves) };
  if (equip.legs) out.legs = { color: materialColor(equip.legs) };
  // boots read pale and blocky: cloth and leather boots are dusty hide (lifted in human.js), metal
  // boots keep their metal
  if (equip.boots) out.bootsGear = { color: equip.boots.weight === 'cloth' ? LEATHER[equip.boots.material] || '#77492f' : materialColor(equip.boots), metal: equip.boots.weight === 'plate' || equip.boots.weight === 'mail' };
  return out;
}

export function weaponSpec(item) {
  if (!item) return null;
  const metal = materialColor({ ...item, weight: 'plate' });
  return { type: item.type, base: item.base || null, color: metal, trim: rarityTrim(item), element: item.element || null, rarity: rIndex(item) };
}
export function shieldSpec(item) {
  if (!item) return null;
  const ri = rIndex(item);
  return { base: item.base || 'Round Shield', color: materialColor({ ...item, weight: 'plate' }), trim: rarityTrim(item), emblem: ri >= 3 ? rarityTrim(item) : null };
}

// NPC / enemy outfit by armour weight and level (mirrors the old dressHumanoid)
export function dressLook({ gear, rarity = 'common', ilvl = 5, helmChance = 0.5, seed = 0 }) {
  const material = ilvl > 60 ? 'starforged' : ilvl > 40 ? 'mithral' : ilvl > 25 ? 'gilded' : ilvl > 12 ? 'steel' : 'iron';
  if (!gear || gear === 'none') return { look: {}, material };
  const eq = {};
  for (const slot of ['chest', 'legs', 'boots']) eq[slot] = { weight: gear, material, rarity, slot };
  if (gear !== 'cloth' || (seed % 100) / 100 < helmChance) eq.helm = { weight: gear, material, rarity, slot: 'helm' };
  if (gear === 'plate' || gear === 'mail') eq.gloves = { weight: gear, material, rarity, slot: 'gloves' };
  return { look: armorLook(eq), material };
}
