// Blacksmith & enchanter services: salvage, upgrade, enchant, craft, transmute. Plus shop stock.
import { G } from '../game.js';
import { bus } from '../core/events.js';
import { RARITY, RARITIES, AFFIXES, AFFIX, affixValue, finalizeItem, makeWeapon, makeArmor, makeShield, makeTrinket, makeTome, rollLoot, WEAPON_TYPES, WEAPON_ELEMENTS, CONSUMABLES, S, newUid } from '../data/items.js';
import { TOMES } from '../data/tomes.js';
import { RNG, hashStr } from '../core/rng.js';
import { addItem, removeItem, addGold, addMaterial, hasMaterials, spendMaterials, classPrefer } from './inventory.js';
import { TOWNS, DEEP_TOWNS } from '../data/world.js';
import { MOUNTS } from '../data/mounts.js';

const rng = new RNG(Date.now() & 0xfff);

function discount() {
  let d = 1;
  if (G.char.skills.includes('crafting')) d *= 0.75;
  if (G.player?.derived.traits.has('master_smith')) d *= 0.75;
  return d;
}

function metalFor(item) { return item.kind === 'armor' && (item.weight === 'cloth') ? 'cloth' : item.kind === 'armor' && item.weight === 'leather' ? 'leather' : 'ore'; }
function highMat(ilvl) { return ilvl >= 86 ? 'voidshard' : ilvl >= 71 ? 'starmetal' : ilvl >= 56 ? 'dragonscale' : ilvl >= 43 ? 'mithral' : 'dust'; }

export function salvageYield(item) {
  const r = RARITY[item.rarity].index;
  const out = { [metalFor(item)]: 1 + Math.floor(item.ilvl / 25) };
  if (r >= 1) out.dust = r * (r + 1) / 2 + (G.char.skills.includes('crafting') ? 1 : 0);
  if (r >= 3 && item.ilvl >= 43) out[highMat(item.ilvl)] = (out[highMat(item.ilvl)] || 0) + 1;
  if (item.element) { const map = { fire: 'ess_fire', frost: 'ess_frost', lightning: 'ess_storm', void: 'ess_void', holy: 'ess_holy', rot: 'ess_rot' }; out[map[item.element]] = 1; }
  return out;
}

export function salvage(item) {
  if (item.legendary && RARITY[item.rarity].index >= 5) { bus.emit('toast', 'Mythic relics cannot be salvaged.'); return false; }
  removeItem(item.uid);
  const y = salvageYield(item);
  for (const [k, v] of Object.entries(y)) addMaterial(k, v, true);
  bus.emit('salvaged', { item, yield: y });
  return y;
}

export function upgradeCost(item) {
  const up = item.upgrade || 0;
  if (up >= 10) return null;
  const d = discount();
  const cost = { gold: Math.round((20 + item.ilvl * 6) * (up + 1) * d), mats: { [metalFor(item)]: Math.ceil((up + 1) * d) } };
  if (up >= 4) cost.mats.dust = Math.ceil((up - 3) * 2 * d);
  if (up >= 7) cost.mats[highMat(item.ilvl)] = (cost.mats[highMat(item.ilvl)] || 0) + Math.ceil((up - 6) * d);
  return cost;
}

export function upgrade(item) {
  const cost = upgradeCost(item);
  if (!cost) { bus.emit('toast', 'Already at +10.'); return false; }
  if (G.char.gold < cost.gold || !hasMaterials(cost.mats)) { bus.emit('toast', 'Not enough gold or materials.'); return false; }
  G.char.gold -= cost.gold;
  spendMaterials(cost.mats);
  item.upgrade = (item.upgrade || 0) + 1;
  finalizeItem(item);
  G.player?.refreshStats();
  bus.emit('upgraded', item);
  return true;
}

export function enchantCost(item) {
  const r = RARITY[item.rarity].index;
  return { gold: Math.round((30 + item.ilvl * 5) * (r + 1)), mats: { dust: 2 + r * 2 } };
}

// Reroll one affix (index) into a random different affix valid for the slot
export function enchant(item, idx) {
  const cost = enchantCost(item);
  if (G.char.gold < cost.gold || !hasMaterials(cost.mats)) { bus.emit('toast', 'Not enough gold or Arcane Dust.'); return false; }
  G.char.gold -= cost.gold;
  spendMaterials(cost.mats);
  const valid = AFFIXES.filter((a) => !item.affixes.some((x) => x.id === a.id) && fits(a, item));
  const a = rng.pick(valid);
  const v = affixValue(a, item.ilvl, Math.max(rng.f(), rng.f()));
  if (idx >= 0 && idx < item.affixes.length) item.affixes[idx] = { id: a.id, v };
  else item.affixes.push({ id: a.id, v });
  G.player?.refreshStats();
  bus.emit('enchanted', item);
  return true;
}

function fits(a, item) {
  if (a.slots === 'any') return true;
  const s = a.slots.split(',');
  if (item.kind === 'weapon') return s.includes('weapon');
  if (item.kind === 'armor') return s.includes('armor') || s.includes(item.slot);
  if (item.kind === 'shield') return s.includes('shield');
  if (item.kind === 'trinket') return s.includes(item.slot);
  if (item.kind === 'tome') return s.includes('tome');
  return false;
}

export function imbueElement(item, el) {
  const essence = { fire: 'ess_fire', frost: 'ess_frost', lightning: 'ess_storm', void: 'ess_void', holy: 'ess_holy', rot: 'ess_rot' }[el];
  if (item.kind !== 'weapon') return false;
  if (!hasMaterials({ [essence]: 2, dust: 2 })) { bus.emit('toast', 'Needs 2 essence and 2 Arcane Dust.'); return false; }
  spendMaterials({ [essence]: 2, dust: 2 });
  item.element = el;
  if (!item.legendary) item.name = item.name.replace(/^(Blazing|Frozen|Thundering|Hollow|Radiant|Blighted) /, '');
  if (!item.legendary) item.name = `${WEAPON_ELEMENTS.find((e) => e.id === el).pre} ${item.name}`;
  G.player?.refreshStats();
  bus.emit('enchanted', item);
  return true;
}

export const CRAFT_RECIPES = [
  { id: 'c_weapon', name: 'Forge a Weapon', desc: 'A rare weapon of a type you choose, at your level.', mats: { ore: 4, wood: 2, dust: 2 }, goldMul: 12, kind: 'weapon' },
  { id: 'c_armor', name: 'Craft Armour', desc: 'A rare armour piece for a slot you choose, at your level.', mats: { ore: 2, leather: 2, cloth: 2, dust: 2 }, goldMul: 10, kind: 'armor' },
  { id: 'c_shield', name: 'Forge a Shield', desc: 'A rare shield at your level.', mats: { ore: 3, wood: 3, dust: 2 }, goldMul: 10, kind: 'shield' },
  { id: 'c_trinket', name: 'Set a Trinket', desc: 'A rare ring or amulet at your level.', mats: { gold_dust: 2, dust: 3 }, goldMul: 14, kind: 'trinket' },
  { id: 'c_hp', name: 'Brew Healing Draughts (x3)', desc: 'Three healing potions.', mats: { herb: 2 }, gold: 15, cons: 'hp_potion', n: 3 },
  { id: 'c_mana', name: 'Distil Mana Tinctures (x2)', desc: 'Two mana potions.', mats: { herb: 1, dust: 1 }, gold: 15, cons: 'mana_potion', n: 2 },
  { id: 'c_might', name: 'Brew Elixir of Might', desc: '+20% damage for 60s.', mats: { herb: 2, ess_fire: 1 }, gold: 40, cons: 'elixir_might', n: 1 },
  { id: 'c_ward', name: 'Brew Elixir of Warding', desc: '+30% resistances for 60s.', mats: { herb: 2, ess_holy: 1 }, gold: 40, cons: 'elixir_ward', n: 1 },
  { id: 'c_shard', name: 'Carve a Waystone Shard', desc: 'Recall to a waystone from anywhere.', mats: { dust: 2, ore: 1 }, gold: 30, cons: 'waystone_shard', n: 1 },
];

export function craft(recipe, choice) {
  const c = G.char;
  const lvl = c.level;
  const gold = recipe.gold ?? Math.round(recipe.goldMul * (5 + lvl * 2) * discount());
  const mats = Object.fromEntries(Object.entries(recipe.mats).map(([k, v]) => [k, Math.ceil(v * (recipe.cons ? 1 : 1 + lvl / 40) * discount())]));
  if (c.gold < gold || !hasMaterials(mats)) { bus.emit('toast', 'Not enough gold or materials.'); return null; }
  c.gold -= gold;
  spendMaterials(mats);
  if (recipe.cons) {
    c.consumables[recipe.cons] = Math.min(CONSUMABLES[recipe.cons].stack, (c.consumables[recipe.cons] || 0) + recipe.n);
    bus.emit('crafted', { name: recipe.name });
    return true;
  }
  const r = rng.chance(0.15) ? 3 : 2;
  let it;
  if (recipe.kind === 'weapon') it = makeWeapon(choice || classPrefer().weapons[0], lvl, r, rng);
  else if (recipe.kind === 'armor') it = makeArmor(choice || 'chest', classPrefer().weight, lvl, r, rng);
  else if (recipe.kind === 'shield') it = makeShield(lvl, r, rng);
  else it = makeTrinket(choice || 'ring', lvl, r, rng);
  if (c.skills.includes('crafting')) { const valid = AFFIXES.filter((a) => !it.affixes.some((x) => x.id === a.id) && fits(a, it)); const a = rng.pick(valid); it.affixes.push({ id: a.id, v: affixValue(a, lvl, rng.f()) }); }
  finalizeItem(it);
  it.crafted = true;
  addItem(it);
  bus.emit('crafted', { name: it.name, item: it });
  return it;
}

export function recipeCost(recipe) {
  const lvl = G.char.level;
  const gold = recipe.gold ?? Math.round(recipe.goldMul * (5 + lvl * 2) * discount());
  const mats = Object.fromEntries(Object.entries(recipe.mats).map(([k, v]) => [k, Math.ceil(v * (recipe.cons ? 1 : 1 + lvl / 40) * discount())]));
  return { gold, mats };
}

// Transmute three items of one rarity into one of the next
export function transmute(items) {
  if (items.length !== 3) return null;
  const r = RARITY[items[0].rarity].index;
  if (items.some((i) => RARITY[i.rarity].index !== r) || r >= 3) { bus.emit('toast', 'Transmute needs three items of the same rarity (up to Rare).'); return null; }
  const lvl = Math.round(items.reduce((s, i) => s + i.ilvl, 0) / 3);
  for (const i of items) removeItem(i.uid);
  const it = rollLoot(Math.max(lvl, G.char.level - 2), rng, { minRarity: r + 1, prefer: classPrefer() });
  addItem(it);
  bus.emit('crafted', { name: it.name, item: it });
  return it;
}

// ------------------------------------------------------------------ shops
const stockCache = new Map();
export function shopStock(townId, role, sub) {
  const key = `${townId}:${role}:${sub || ''}:${G.char.day}:${Math.floor(G.char.level / 3)}`;
  if (stockCache.has(key)) return stockCache.get(key);
  const town = [...TOWNS, ...DEEP_TOWNS].find((t) => t.id === townId);
  const r = new RNG(hashStr(key));
  const lvl = Math.max(1, G.char.level + r.int(-1, 2));
  const items = [];
  if (role === 'merchant') {
    for (let i = 0; i < 6; i++) items.push(rollLoot(lvl, r, { minRarity: r.chance(0.3) ? 1 : 0, prefer: r.chance(0.5) ? classPrefer() : null }));
    for (let i = 0; i < 2; i++) items.push(makeTrinket(r.pick(['ring', 'amulet']), lvl, r.int(1, 2), r));
  } else if (role === 'blacksmith') {
    const pref = classPrefer();
    for (let i = 0; i < 4; i++) items.push(makeWeapon(r.chance(0.6) ? r.pick(pref.weapons) : r.pick(Object.keys(WEAPON_TYPES)), lvl, r.int(0, 2), r));
    for (let i = 0; i < 4; i++) items.push(makeArmor(r.pick(['helm', 'chest', 'gloves', 'legs', 'boots']), r.chance(0.6) ? pref.weight : r.pick(['cloth', 'leather', 'mail', 'plate']), lvl, r.int(0, 2), r));
    items.push(makeShield(lvl, r.int(0, 2), r));
  } else if (role === 'tome' && sub) {
    const rep = town?.faction ? (G.char.rep[town.faction] || 0) : 0;
    const maxTier = 1 + (G.char.level >= 10 ? 1 : 0) + (G.char.level >= 25 && rep >= 250 ? 1 : 0) + (G.char.level >= 40 && rep >= 600 ? 1 : 0);
    for (let t = 1; t <= maxTier; t++) items.push(makeTome(sub, t, Math.max(lvl, t * 10), Math.min(3, t), r));
  } else if (role === 'enchanter') {
    for (let i = 0; i < 3; i++) items.push(makeTrinket(r.pick(['ring', 'amulet']), lvl, r.int(1, 3), r));
    items.push(makeTome(r.pick(Object.keys(TOMES)), 1, lvl, 1, r));
  }
  for (const it of items) { it.shopPrice = Math.round(it.value * (role === 'tome' ? 2.2 : 1.4)); }
  stockCache.set(key, items);
  return items;
}

export function stableStock(townId) {
  return Object.values(MOUNTS).filter((m) => m.price > 0 && (m.stables === 'any' || m.stables.includes(townId)));
}
