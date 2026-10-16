// Race and class rarities. The fate dice are weighted: common bloodlines and callings turn up
// most of the time, Supreme ones almost never. Rarer fates are stronger: bonus attributes to every
// stat plus a little extra damage and health, and they glow a little on the field.
import { RACES } from './races.js';
import { CLASSES } from './classes.js';

export const FATE_RARITIES = [
  { id: 'common', name: 'Common', color: '#d8d0c0', weight: 30, stats: 0, power: 0 },
  { id: 'rare', name: 'Rare', color: '#5aa0ff', weight: 15, stats: 1, power: 3 },
  { id: 'epic', name: 'Epic', color: '#b070ff', weight: 7, stats: 2, power: 6 },
  { id: 'mythic', name: 'Mythic', color: '#ff3a4a', weight: 3, stats: 3, power: 10 },
  { id: 'legendary', name: 'Legendary', color: '#ff9a30', weight: 1.4, stats: 4, power: 14 },
  { id: 'supreme', name: 'Supreme', color: '#fff0a0', weight: 0.5, stats: 6, power: 20 },
];
export const FATE_RARITY = Object.fromEntries(FATE_RARITIES.map((r, i) => [r.id, { ...r, index: i }]));

export const RACE_RARITY = {
  human: 'common', orc: 'common', beastkin: 'common',
  elf: 'rare', dwarf: 'rare', tidekin: 'rare',
  ashborn: 'epic', stoneborn: 'epic',
  fae: 'mythic', revenant: 'mythic',
  dragonblood: 'legendary',
  void: 'supreme',
};
export const CLASS_RARITY = {
  knight: 'common', ranger: 'common', berserker: 'common',
  assassin: 'rare', cleric: 'rare', warden: 'rare',
  duelist: 'epic', pyromancer: 'epic',
  cryomancer: 'mythic', alchemist: 'mythic',
  bard: 'legendary',
  necromancer: 'supreme',
};
for (const r of RACES) r.rarity = RACE_RARITY[r.id] || 'common';
for (const c of CLASSES) c.rarity = CLASS_RARITY[c.id] || 'common';

export const rarityOfRace = (id) => FATE_RARITY[RACE_RARITY[id] || 'common'];
export const rarityOfClass = (id) => FATE_RARITY[CLASS_RARITY[id] || 'common'];

// chance (0..1) of rolling a given entry
export function fateChance(list, entry) {
  const tot = list.reduce((s, x) => s + FATE_RARITY[x.rarity].weight, 0);
  return FATE_RARITY[entry.rarity].weight / tot;
}
// weighted pick; returns the 1-based index (the die face)
export function rollFate(list) {
  const tot = list.reduce((s, x) => s + FATE_RARITY[x.rarity].weight, 0);
  let r = Math.random() * tot;
  for (let i = 0; i < list.length; i++) { r -= FATE_RARITY[list[i].rarity].weight; if (r <= 0) return i + 1; }
  return list.length;
}
// combined bonuses of a character's race + class rarity
export function fateBonus(c) {
  const a = rarityOfRace(c.race), b = rarityOfClass(c.cls);
  return { stats: a.stats + b.stats, power: a.power + b.power };
}
// small inline badge for UI
export const rarityTag = (r) => `<span class="fate-rar r-${r.id}" style="color:${r.color}">${r.name}</span>`;
