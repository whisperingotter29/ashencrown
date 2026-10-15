// Inventory, equipping, consumables, gold and materials.
import { G } from '../game.js';
import { bus } from '../core/events.js';
import { CONSUMABLES, MATERIALS_LIST, RARITY, WEAPON_TYPES } from '../data/items.js';
import { CLASS_BY_ID } from '../data/classes.js';
import { floatText } from '../render/vfx.js';
import { equipToLoadout, clearLoadoutSlot } from './loadout.js';

export const INV_SIZE = 48;

export function slotFor(item) {
  if (item.kind === 'weapon') return 'mainhand';
  if (item.kind === 'shield') return 'offhand';
  if (item.kind === 'tome') return 'tome';
  if (item.kind === 'armor') return item.slot;
  if (item.kind === 'trinket') return item.slot === 'ring' ? (G.char.equip.ring1 ? 'ring2' : 'ring1') : 'amulet';
  return null;
}

export function addItem(item, silent = false) {
  const c = G.char;
  if (c.inventory.length >= INV_SIZE) { if (!silent) bus.emit('toast', 'Your pack is full.'); return false; }
  c.inventory.push(item);
  if (!silent) bus.emit('itemGained', item);
  return true;
}

export function removeItem(uid) {
  const c = G.char;
  const i = c.inventory.findIndex((x) => x.uid === uid);
  if (i >= 0) return c.inventory.splice(i, 1)[0];
  return null;
}

export function canEquip(item) {
  const c = G.char;
  if (item.req > c.level) return { ok: false, why: `Requires level ${item.req}.` };
  return { ok: true };
}

export function equip(item, slotOverride) {
  const c = G.char;
  const chk = canEquip(item);
  if (!chk.ok) { bus.emit('toast', chk.why); return false; }
  // weapons and spellbooks live in the 1-4 loadout
  if (item.kind === 'weapon' || item.kind === 'tome') return equipToLoadout(item);
  let slot = slotOverride || slotFor(item);
  if (!slot) return false;
  removeItem(item.uid);
  const prev = c.equip[slot];
  c.equip[slot] = item;
  if (prev) c.inventory.push(prev);
  G.player?.refreshStats();
  bus.emit('equipped', { item, slot });
  return true;
}

export function unequip(slot) {
  const c = G.char;
  const it = c.equip[slot];
  if (!it) return;
  if (slot === 'mainhand' || slot === 'tome') { clearLoadoutSlot(c.activeSlot); return; }
  if (c.inventory.length >= INV_SIZE) { bus.emit('toast', 'Your pack is full.'); return; }
  c.equip[slot] = null;
  c.inventory.push(it);
  G.player?.refreshStats();
  bus.emit('equipped', { item: null, slot });
}

export function addGold(n, silent = false) {
  const c = G.char;
  c.gold = Math.max(0, Math.round(c.gold + n));
  if (!silent && n) bus.emit('gold', n);
}

export function addMaterial(id, n = 1, silent = false) {
  const c = G.char;
  c.materials[id] = (c.materials[id] || 0) + n;
  if (c.materials[id] <= 0) delete c.materials[id];
  if (!silent && n > 0) bus.emit('material', { id, n });
}
export function hasMaterials(cost) { for (const [k, v] of Object.entries(cost)) if ((G.char.materials[k] || 0) < v) return false; return true; }
export function spendMaterials(cost) { for (const [k, v] of Object.entries(cost)) addMaterial(k, -v, true); }

export function addConsumable(id, n = 1) {
  const c = G.char;
  c.consumables[id] = Math.min(CONSUMABLES[id].stack, (c.consumables[id] || 0) + n);
}

export function useConsumable(id) {
  const c = G.char, p = G.player;
  if (!p || p.dead || !(c.consumables[id] > 0)) { bus.emit('toast', `No ${CONSUMABLES[id]?.name || 'items'} left.`); return false; }
  if ((p.cooldowns['potion_' + id] || 0) > 0) return false;
  const def = CONSUMABLES[id];
  c.consumables[id]--;
  const alch = c.cls === 'alchemist' ? 1.5 : 1;
  if (def.heal) {
    if (def.hot) p.addBuff('food', def.hot, { regenPct: (def.heal * 100 * alch) / def.hot });
    else { p.addBuff('potion', 2, { regenPct: (def.heal * 100 * alch) / 2 }); }
  }
  if (def.mana) p.mana = Math.min(p.maxMana, p.mana + p.maxMana * def.mana * alch);
  if (def.buff) {
    if (def.buff.stealth) p.enterStealth(def.duration);
    else p.addBuff(id, def.duration, def.buff);
  }
  if (def.recall) bus.emit('recall');
  p.cooldowns['potion_' + id] = def.heal ? 1.5 : 0.5;
  floatText(p.pos.x, p.pos.y + 2.4, p.pos.z, def.name, { color: def.color, force: true });
  bus.emit('consumableUsed', id);
  return true;
}

export function sellValue(item) { return Math.max(1, Math.round(item.value * 0.25 * (G.player?.derived.traits.has('silver_tongue') ? 1.1 : 1))); }
export function buyPrice(item) { return Math.max(1, Math.round(item.value * 1.4 * (G.player?.derived.traits.has('silver_tongue') ? 0.9 : 1))); }

// Class weapon/armour preference for loot rolls
export function classPrefer() {
  const cls = CLASS_BY_ID[G.char.cls];
  const map = { knight: ['sword', 'mace'], berserker: ['greatsword', 'halberd'], ranger: ['bow', 'crossbow'], assassin: ['dagger'], pyromancer: ['staff', 'wand'], cryomancer: ['wand', 'staff'], cleric: ['mace'], necromancer: ['staff', 'wand'], bard: ['sword', 'dagger'], alchemist: ['dagger', 'wand'], warden: ['spear'], duelist: ['sword'] };
  const weight = { knight: 'plate', berserker: 'mail', ranger: 'leather', assassin: 'leather', pyromancer: 'cloth', cryomancer: 'cloth', cleric: 'mail', necromancer: 'cloth', bard: 'leather', alchemist: 'leather', warden: 'mail', duelist: 'leather' };
  return { weapons: map[cls.id] || ['sword'], weight: weight[cls.id] || 'leather' };
}

export function itemPower(item) {
  if (!item) return 0;
  const r = RARITY[item.rarity].index;
  return Math.round((item.dmg || 0) * 2 + (item.armor || 0) * 3 + (item.affixes?.length || 0) * item.ilvl * 0.8 + r * 10 + item.ilvl * 2);
}
