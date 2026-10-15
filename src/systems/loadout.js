// Weapon loadout: four slots (keys 1-4) holding weapons or spellbooks. The active slot is what you
// fight with: left click is its basic attack, and Q / E / R are its three abilities. A sword gives
// sword abilities, a bow gives bow abilities, a spellbook gives its spells. Weapons with an element
// upgrade their abilities to the elemental version (a fire sword's Blade Dance is Cinder Waltz).
//
// Data (on the character):
//   c.loadout    [item|null x4]  weapons / tomes in slots 1-4 (not in the inventory while slotted)
//   c.activeSlot 0..3
//   c.kitPicks   { [kitKey]: [id|null, id|null, id|null] }  player overrides for Q / E / R
// The active item is mirrored into c.equip.mainhand (weapon) or c.equip.tome (spellbook) so the rest
// of the game (stats, visuals) keeps reading equip.* as before.
import { G } from '../game.js';
import { bus } from '../core/events.js';
import { SKILLS, COMBOS } from '../data/skills.js';
import { TOMES, spellsForTome } from '../data/tomes.js';
import { WEAPON_TYPES } from '../data/items.js';

export const LOADOUT_SIZE = 4;
export const ABILITY_KEYS = ['q', 'e', 'r'];

// which spellbook each element's combo abilities come from
export const TOME_ELEMENT = { embers: 'fire', frost: 'frost', storm: 'lightning', rot: 'rot', verdant: 'nature', void: 'void', radiant: 'holy', tidal: 'water', sand: 'sand', blood: 'blood', song: 'sound', stone: 'earth' };

// Default Q / E / R per weapon type. `shield` variants apply when a shield is in the offhand.
export const KITS = {
  sword: ['lunge', 'bladedance', 'whirlwind'],
  sword_shield: ['lunge', 'shieldbash', 'bladedance'],
  mace: ['execute', 'groundslam', 'warcry'],
  mace_shield: ['shieldbash', 'groundslam', 'shieldwall'],
  greatsword: ['whirlwind', 'groundslam', 'execute'],
  dagger: ['shadowstep', 'bladedance', 'stealth'],
  spear: ['lunge', 'impale', 'pounce'],
  spear_shield: ['lunge', 'impale', 'shieldbash'],
  halberd: ['whirlwind', 'impale', 'pounce'],
  bow: ['volley', 'piercingshot', 'trap'],
  crossbow: ['piercingshot', 'volley', 'trap'],
  staff: ['arcanenova', 'riftwalk', 'manaward'],
  wand: ['arcanebarrage', 'riftwalk', 'arcanenova'],
  fists: ['lunge', 'whirlwind', 'warcry'],
};

export function canSlot(item) { return !!item && (item.kind === 'weapon' || item.kind === 'tome'); }

// key used for kit picks: weapon type ('sword') or spellbook ('tome:embers')
export function kitKey(item) {
  if (!item) return 'fists';
  return item.kind === 'tome' ? 'tome:' + item.tome : item.type;
}

// ---------------------------------------------------------------- migration / setup
export function ensureLoadout(c) {
  if (!Array.isArray(c.loadout)) {
    c.loadout = [null, null, null, null];
    if (c.equip.mainhand) c.loadout[0] = c.equip.mainhand;
    if (c.equip.tome) c.loadout[c.loadout[0] ? 1 : 0] = c.equip.tome;
    c.activeSlot = 0;
  }
  while (c.loadout.length < LOADOUT_SIZE) c.loadout.push(null);
  c.kitPicks = c.kitPicks || {};
  if (!(c.activeSlot >= 0 && c.activeSlot < LOADOUT_SIZE)) c.activeSlot = 0;
  syncEquip(c);
}

// mirror the active slot into equip.mainhand / equip.tome
export function syncEquip(c) {
  const it = c.loadout[c.activeSlot] || null;
  c.equip.mainhand = it && it.kind === 'weapon' ? it : null;
  c.equip.tome = it && it.kind === 'tome' ? it : null;
}

export function activeItem(c = G.char) { return c?.loadout?.[c.activeSlot] || null; }
export function loadoutItem(i, c = G.char) { return c?.loadout?.[i] || null; }

// ---------------------------------------------------------------- slotting
// Put `item` (from the inventory) into slot i. Whatever was there goes back to the inventory.
export function setLoadoutSlot(i, item) {
  const c = G.char;
  if (!canSlot(item) || i < 0 || i >= LOADOUT_SIZE) return false;
  if (item.req > c.level) { bus.emit('toast', `Requires level ${item.req}.`); return false; }
  const at = c.inventory.findIndex((x) => x.uid === item.uid);
  const from = c.loadout.findIndex((x) => x && x.uid === item.uid);
  if (at >= 0) c.inventory.splice(at, 1);
  else if (from >= 0) { c.loadout[from] = c.loadout[i]; c.loadout[i] = item; afterChange(); return true; }   // swap two slots
  const prev = c.loadout[i];
  c.loadout[i] = item;
  if (prev) c.inventory.push(prev);
  afterChange();
  bus.emit('equipped', { item, slot: 'loadout' + i });
  return true;
}
export function clearLoadoutSlot(i) {
  const c = G.char;
  const it = c.loadout[i];
  if (!it) return false;
  if (c.inventory.length >= 48) { bus.emit('toast', 'Your pack is full.'); return false; }
  c.loadout[i] = null;
  c.inventory.push(it);
  afterChange();
  bus.emit('equipped', { item: null, slot: 'loadout' + i });
  return true;
}
// "Equip" from the inventory: first empty slot, else replace the active one
export function equipToLoadout(item) {
  const c = G.char;
  let i = c.loadout.findIndex((x) => !x);
  if (i < 0) i = c.activeSlot;
  const ok = setLoadoutSlot(i, item);
  if (ok && !c.loadout[c.activeSlot]) switchSlot(i, true);
  return ok;
}
function afterChange() {
  const c = G.char;
  syncEquip(c);
  G.player?.refreshStats();
}

// Switch the active weapon (keys 1-4). quiet: no swap flourish / event
export function switchSlot(i, quiet = false) {
  const c = G.char, p = G.player;
  if (i < 0 || i >= LOADOUT_SIZE || i === c.activeSlot) return false;
  if (!c.loadout[i] && !quiet) { bus.emit('toast', `Slot ${i + 1} is empty. Put a weapon or spellbook there from your inventory.`); return false; }
  if (p && (p.cooldowns._swap || 0) > 0) return false;
  c.activeSlot = i;
  syncEquip(c);
  if (p) {
    if (p.action && p.action.type !== 'dodge') { p.action?.end?.(); p.action = null; p.st.action = null; p.st.spin = false; }
    p.drawing = false; p.chargeT = 0;
    p.cooldowns._swap = 0.18;
    p.refreshStats();
  }
  if (!quiet) bus.emit('weaponSwap', { slot: i, item: c.loadout[i] });
  return true;
}

// ---------------------------------------------------------------- abilities
function elementalUpgrade(id, element) {
  if (!element) return id;
  const combo = COMBOS.find((cb) => cb.type !== 'passive' && cb.skill.includes(id) && TOME_ELEMENT[cb.tome] === element);
  return combo ? combo.id : id;
}

// Everything that could go on Q / E / R for this item (for the Skills screen)
export function abilityPool(item, c = G.char) {
  if (item?.kind === 'tome') {
    const tier = item.tier || 1;
    return spellsForTome(item.tome, Math.min(5, tier + 1)).map((s) => s.id);
  }
  const type = item?.type || 'fists';
  const shield = c.equip.offhand?.kind === 'shield' && WEAPON_TYPES[type]?.hands !== 2;
  const base = new Set([...(KITS[type] || KITS.fists), ...(shield ? KITS[type + '_shield'] || [] : [])]);
  // learned skills that fit this weapon
  for (const sid of c.skills || []) {
    const sk = SKILLS[sid];
    if (!sk || sk.type === 'passive') continue;
    if (sk.needs === 'shield' && !shield) continue;
    if (sk.needs === 'ranged' && !WEAPON_TYPES[type]?.ranged) continue;
    if (!sk.weapons || sk.weapons.includes(type)) base.add(sid);
  }
  return [...base].map((id) => elementalUpgrade(id, item?.element));
}

// The resolved Q / E / R ability ids for an item (null where empty)
export function kitFor(item, c = G.char) {
  const pool = abilityPool(item, c);
  const key = kitKey(item);
  let picks;
  if (item?.kind === 'tome') picks = pool.slice(0, 3);
  else {
    const type = item?.type || 'fists';
    const shield = c.equip.offhand?.kind === 'shield' && WEAPON_TYPES[type]?.hands !== 2;
    picks = ((shield && KITS[type + '_shield']) || KITS[type] || KITS.fists).map((id) => elementalUpgrade(id, item?.element));
  }
  const over = c.kitPicks?.[key];
  if (over) picks = picks.map((id, i) => (over[i] && pool.includes(over[i]) ? over[i] : id));
  while (picks.length < 3) picks.push(null);
  return picks.slice(0, 3);
}
export function currentKit(c = G.char) { return kitFor(activeItem(c), c); }

// Put ability `id` on key index k (0 = Q, 1 = E, 2 = R) for this item
export function assignAbility(item, k, id) {
  const c = G.char;
  const key = kitKey(item);
  const cur = kitFor(item, c);
  const j = cur.indexOf(id);
  if (j >= 0 && j !== k) cur[j] = cur[k];   // swap if it was already bound elsewhere
  cur[k] = id;
  c.kitPicks[key] = cur;
  bus.emit('kitChanged', { item, k, id });
}

// Key letter for an ability in the current kit ('q' | 'e' | 'r'), or null
export function keyForAbility(id, c = G.char) {
  const k = currentKit(c).indexOf(id);
  return k >= 0 ? ABILITY_KEYS[k] : null;
}
