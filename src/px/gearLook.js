// Item -> sprite spec mapping: armour pieces become humanoid look fields, weapons and shields
// become weapon / shield sprite specs. Colours follow material, rarity trim and item sets.
import { RARITY, MATERIALS, SETS } from '../data/items.js';

const CLOTH = { rusted: '#7a6a58', iron: '#6a5a48', steel: '#4a5a6a', ashsteel: '#3a2a2e', gilded: '#8a6a30', mithral: '#3a4a6a', dragonbone: '#7a2a20', starforged: '#3a4a8a', voidglass: '#2a1a3a' };
const LEATHER = { rusted: '#6a4a30', iron: '#5a3a24', steel: '#4a3428', ashsteel: '#3a2420', gilded: '#7a5a2a', mithral: '#2a3a4a', dragonbone: '#6a2a1a', starforged: '#2a3a6a', voidglass: '#2a1a34' };

const rIndex = (item) => (RARITY[item.rarity] || RARITY.common).index;
export function rarityTrim(item) {
  if (item.set && SETS[item.set]) return SETS[item.set].trim;
  if (rIndex(item) >= 4) return RARITY[item.rarity].color;
  const mat = MATERIALS.find((m) => m.id === item.material);
  return mat ? mat.trim : '#8a6a3a';
}
export function materialColor(item) {
  if (item.set && SETS[item.set]) return SETS[item.set].color;
  const mat = MATERIALS.find((m) => m.id === item.material);
  if (item.weight === 'cloth') return CLOTH[item.material] || '#5a4a3a';
  if (item.weight === 'leather') return LEATHER[item.material] || '#5a4a3a';
  return mat ? mat.color : '#8a8a8a';
}

// armour slots -> look fields for humanSprites()
export function armorLook(equip = {}) {
  const out = {};
  const h = equip.helm;
  if (h) {
    const col = materialColor(h), trim = rarityTrim(h), ri = rIndex(h);
    if (h.legendary === 'ashencrown') out.helm = { kind: 'crown', color: '#ffc040', gem: '#ff5030' };
    else if (h.legendary === 'hollowcrown') out.helm = { kind: 'crown', color: '#a070ff', gem: '#ffffff' };
    else if (h.weight === 'cloth') out.helm = { kind: 'hood', color: col };
    else if (h.weight === 'leather') out.helm = { kind: 'cap', color: col };
    else if (h.weight === 'mail') out.helm = { kind: 'coif', color: col, trim };
    else out.helm = { kind: 'great', color: col, trim, crest: ri === 2, plume: ri >= 3 ? trim : null, glow: ri >= 4 ? trim : null };
  }
  const c = equip.chest;
  if (c) {
    const ri = rIndex(c);
    out.chest = { weight: c.weight, color: materialColor(c), trim: rarityTrim(c) };
    if (ri >= 2 || c.set) out.cape = c.set && SETS[c.set] ? SETS[c.set].trim : ri >= 4 ? '#8a1a1a' : materialColor(c);
  }
  if (equip.gloves) out.gloves = { color: materialColor(equip.gloves) };
  if (equip.legs) out.legs = { color: materialColor(equip.legs) };
  if (equip.boots) out.bootsGear = { color: equip.boots.weight === 'cloth' ? LEATHER[equip.boots.material] || '#4a3020' : materialColor(equip.boots) };
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
