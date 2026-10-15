// Character (bag, paper doll, weapon loadout, attributes), skills (Q / E / R per weapon), journal,
// world map with fast travel, pause / settings / controls, death screen.
//
// Every screen keeps its state in a small module-level object and re-renders through
// openModal(), which morphs the new tree into the open window (no flicker, scroll kept).
import { G } from '../game.js';
import { el, esc, kc, root, openModal, closeModal, modalName, modalNode, windowFrame, bindTip, bindDrag, bindDrop, itemCard, hideTip, toast, pxTitle, morph, uiUnit } from './ui.js';
import { itemIcon, skillIcon, simpleIcon } from './icons.js';
import { equip, unequip, removeItem, slotFor, useConsumable, itemPower, INV_SIZE } from '../systems/inventory.js';
import { RARITIES, RARITY, MATERIALS_LIST, CONSUMABLES, LEGENDARIES, SETS } from '../data/items.js';
import { RACE_BY_ID } from '../data/races.js';
import { CLASS_BY_ID } from '../data/classes.js';
import { TOMES, ELEMENTS } from '../data/tomes.js';
import { SKILLS, COMBOS } from '../data/skills.js';
import { MOUNTS } from '../data/mounts.js';
import { abilityDef } from '../systems/abilities.js';
import { ensureLoadout, activeItem, loadoutItem, setLoadoutSlot, clearLoadoutSlot, equipToLoadout, switchSlot, canSlot, kitFor, abilityPool, assignAbility, ABILITY_KEYS, LOADOUT_SIZE } from '../systems/loadout.js';
import { xpToNext } from '../systems/stats.js';
import { questDef, objectiveProgress } from '../systems/quests.js';
import { FACTIONS, TOWNS, DEEP_TOWNS, DUNGEONS, WAYSTONES, SHRINES, BIOMES, WORLD_BOSSES, LANDMARKS } from '../data/world.js';
import { repTier } from '../systems/factions.js';
import { MAP } from '../world/mapdata.js';
import { refreshSkillbar } from './hud.js';
import { bus } from '../core/events.js';
import { trackedObjectiveMarkers } from '../systems/quests.js';
import { R, applySettings } from '../render/renderer.js';
import { saveGame, saveSettings } from '../core/save.js';
import { dangerLevel, primaryBiome } from '../world/terrainGen.js';
import { input } from '../core/input.js';

const img = (src, cls = '') => `<img class="${cls}" src="${src}" draggable="false">`;
const KEYS = ['Q', 'E', 'R'];
const char = () => { const c = G.char; if (c) ensureLoadout(c); return c; };

// ===================================================================== shared item helpers
function findItem(uid) {
  const c = G.char;
  if (!uid) return null;
  let i = c.inventory.findIndex((x) => x.uid === uid);
  if (i >= 0) return { item: c.inventory[i], where: 'bag', i };
  i = c.loadout.findIndex((x) => x && x.uid === uid);
  if (i >= 0) return { item: c.loadout[i], where: 'loadout', i };
  for (const [slot, it] of Object.entries(c.equip)) if (it && it.uid === uid && slot !== 'mainhand' && slot !== 'tome') return { item: it, where: 'equip', slot };
  return null;
}
const equippable = (it) => canSlot(it) || it.kind === 'armor' || it.kind === 'shield' || it.kind === 'trinket';
// what a bag item would replace
export function compareFor(it) {
  const c = G.char;
  if (!it) return null;
  if (it.kind === 'weapon') { const a = activeItem(c); return a?.kind === 'weapon' ? a : c.loadout.find((x) => x?.kind === 'weapon') || null; }
  if (it.kind === 'tome') return c.loadout.find((x) => x?.kind === 'tome' && x.tome === it.tome) || c.loadout.find((x) => x?.kind === 'tome') || null;
  if (it.kind === 'trinket' && it.slot === 'ring') { const a = c.equip.ring1, b = c.equip.ring2; if (!a || !b) return null; return itemPower(a) <= itemPower(b) ? a : b; }
  const s = slotFor(it);
  return s ? c.equip[s] || null : null;
}
function doEquip(it) {
  hideTip();
  if (canSlot(it)) return equipToLoadout(it);
  if (equippable(it)) return equip(it);
  return false;
}
function kitHtml(item) {
  if (!canSlot(item)) return '';
  let kit = [];
  try { kit = kitFor(item); } catch (e) { return ''; }
  return `<div class="ic-kit">${kit.map((id, k) => { const a = id && abilityDef(id); return `<div>${kc(KEYS[k])}${a ? `${img(skillIcon(a.def, a.def.element), 'sk')}<span>${esc(a.def.name)}</span>` : '<span class="none">empty</span>'}</div>`; }).join('')}</div>`;
}
function cardFor(item, compare) { return itemCard(item, { compare, icon: itemIcon(item), kit: kitHtml(item) }); }

// An item cell (bag, doll, loadout, shop). o: { sel, dim, better, ghost (empty-slot silhouette) }
function cellHtml(it, o = {}) {
  const c = G.char;
  if (!it) return o.ghost ? img(o.ghost, 'ic ghost-ic') : '';
  let h = img(itemIcon(it), 'ic');
  if (it.upgrade) h += `<span class="up">+${it.upgrade}</span>`;
  if (o.lv !== false) h += `<span class="lv">${it.ilvl}</span>`;
  if (it.req > c.level) h += '<i class="req"></i>';
  if (it.junk) h += '<i class="junk"></i>';
  if (o.better) h += '<i class="better"></i>';
  if (o.price !== undefined) h += `<span class="price">${o.price}</span>`;
  return h;
}
function cellCls(it, o = {}) { return 'cell slotf' + (it ? ' rf-' + it.rarity : ' empty') + (o.sel ? ' sel' : '') + (o.dim ? ' dim' : '') + (o.cls ? ' ' + o.cls : ''); }

const SLOT_GHOST = { helm: 'helm', chest: 'chest', gloves: 'gloves', legs: 'legs', boots: 'boots', amulet: 'amulet', ring1: 'ring', ring2: 'ring', offhand: 'shield' };
const ghostIcon = (slot) => simpleIcon(SLOT_GHOST[slot] || 'gem', '#8a7a64');

// pixel portrait of the player (their actual in-game sprite, armour included)
const portraitCache = new WeakMap();
function heroPortrait() {
  const fr = G.player?.model?.spr?.views?.down?.idle?.[0];
  const pix = fr?.pix || fr;
  if (!pix?.canvas) return '';
  let url = portraitCache.get(pix);
  if (!url) { url = pix.canvas().toDataURL(); portraitCache.set(pix, url); }
  const s = 2 * uiUnit();
  return `<img class="hero-img" src="${url}" width="${pix.w * s}" height="${pix.h * s}" draggable="false">`;
}

// ===================================================================== CHARACTER WINDOW
const inv = { tab: 'inv', sel: null, filter: 'all', confirm: null, confirmT: 0 };
const DOLL = [['helm', 'Helm'], ['chest', 'Chest'], ['gloves', 'Gloves'], ['legs', 'Legs'], ['boots', 'Boots'], ['amulet', 'Amulet'], ['ring1', 'Ring'], ['ring2', 'Ring'], ['offhand', 'Offhand']];
const fitsSlot = (it, slot) => {
  if (!it) return false;
  if (slot === 'ring1' || slot === 'ring2') return it.kind === 'trinket' && it.slot === 'ring';
  if (slot === 'amulet') return it.kind === 'trinket' && it.slot === 'amulet';
  if (slot === 'offhand') return it.kind === 'shield';
  return it.kind === 'armor' && it.slot === slot;
};

export function openInventory(tab = inv.tab) {
  const c = char();
  if (!c) return;
  inv.tab = tab;
  const hints = tab === 'inv'
    ? [['Click', 'Inspect'], ['Right Click', 'Equip'], ['Drag', 'Move'], ['Shift+Right Click', 'Junk'], ['Esc', 'Close']]
    : [['C', 'Attributes'], ['I', 'Bag'], ['Esc', 'Close']];
  const { w, body } = windowFrame('Character', [['inv', 'Bag'], ['stats', 'Attributes']], tab, (t) => openInventory(t), { id: 'character', hints });
  if (tab === 'inv') buildBag(body, c); else buildAttributes(body, c);
  openModal('inventory', w);
}
function rerender() { if (modalName() === 'inventory') openInventory(); }

function buildBag(body, c) {
  const wrap = el('div', 'inv');
  // ------------------------------------------------ left: paper doll + loadout
  const left = el('div', 'inv-left');
  const doll = el('div', 'doll f-sheet');
  doll.appendChild(el('div', 'sec-h', `<span>Equipment</span><span class="sec-sub">Lv ${c.level} ${esc(RACE_BY_ID[c.race].name)} ${esc(CLASS_BY_ID[c.cls].name)}</span>`));
  const grid = el('div', 'doll-grid');
  DOLL.forEach(([slot, label], k) => {
    const it = c.equip[slot];
    const s = el('div', cellCls(it, { sel: it && it.uid === inv.sel, cls: 'eq eq-' + slot }), cellHtml(it, { ghost: ghostIcon(slot), lv: false }));
    s.style.gridArea = slot;
    if (it) {
      bindTip(s, () => (it.uid === inv.sel ? '' : cardFor(it)));
      s.onclick = () => { inv.sel = it.uid; rerender(); };
      s.ondblclick = s.oncontextmenu = (e) => { e.preventDefault(); hideTip(); unequip(slot); rerender(); };
      bindDrag(s, () => ({ item: it, from: 'equip', slot, icon: itemIcon(it) }));
    } else bindTip(s, () => `<div class="tip-s"><b>${label}</b><span>Empty. Drag ${label === 'Offhand' ? 'a shield' : label === 'Ring' ? 'a ring' : 'an item'} here from your bag.</span></div>`);
    bindDrop(s, (p) => {
      if (p.from === 'bag') equip(p.item, slot);
      else if (p.from === 'equip' && p.slot !== slot) { const a = c.equip[p.slot], b = c.equip[slot]; c.equip[slot] = a; c.equip[p.slot] = b; G.player?.refreshStats(); bus.emit('equipped', { item: a, slot }); }
      rerender();
    }, (p) => (p.from === 'bag' || p.from === 'equip') && fitsSlot(p.item, slot));
    grid.appendChild(s);
  });
  const hero = el('div', 'hero', `<div class="hero-bg">${heroPortrait()}</div><div class="hero-stats"><span title="Armor">${img(simpleIcon('shield', '#c8c0b0'), 'mini')}${G.player?.derived.armor ?? 0}</span><span>${img(simpleIcon('sword', '#d8d0c8'), 'mini')}${Math.round(G.player?.derived.weaponDmg ?? 0)}</span></div>`);
  hero.style.gridArea = 'hero';
  grid.appendChild(hero);
  doll.appendChild(grid);
  left.appendChild(doll);
  // weapon loadout 1-4
  const lo = el('div', 'loadout f-sheet');
  lo.appendChild(el('div', 'sec-h', `<span>Weapons</span><span class="sec-sub">${kc('1')}–${kc('4')} swap in battle</span>`));
  const row = el('div', 'lo-row');
  for (let i = 0; i < LOADOUT_SIZE; i++) {
    const it = c.loadout[i], on = i === c.activeSlot;
    const s = el('div', cellCls(it, { sel: it && it.uid === inv.sel, cls: 'lslot' + (on ? ' active' : '') }), cellHtml(it, { lv: false }) + `<span class="num">${i + 1}</span>${on ? '<span class="inhand">In hand</span>' : ''}`);
    s.dataset.key = 'lo' + i;
    if (it) {
      bindTip(s, () => (it.uid === inv.sel ? '' : cardFor(it)));
      s.onclick = () => { inv.sel = it.uid; rerender(); };
      s.ondblclick = () => { if (G.player?.cooldowns) G.player.cooldowns._swap = 0; switchSlot(i); rerender(); };
      s.oncontextmenu = (e) => { e.preventDefault(); hideTip(); clearLoadoutSlot(i); rerender(); };
      bindDrag(s, () => ({ item: it, from: 'loadout', i, icon: itemIcon(it) }));
    } else bindTip(s, () => `<div class="tip-s"><b>Weapon slot ${i + 1}</b><span>Drag a weapon or spellbook here. Its abilities go on ${kc('Q')}${kc('E')}${kc('R')} while it is in hand.</span></div>`);
    bindDrop(s, (p) => { if (p.from === 'bag' || p.from === 'loadout') { if (p.from !== 'loadout' || p.i !== i) setLoadoutSlot(i, p.item); } rerender(); }, (p) => (p.from === 'bag' || p.from === 'loadout') && canSlot(p.item));
    row.appendChild(s);
  }
  lo.appendChild(row);
  left.appendChild(lo);
  wrap.appendChild(left);

  // ------------------------------------------------ middle: the bag
  const mid = el('div', 'inv-mid');
  const head = el('div', 'bag-head');
  head.appendChild(el('div', 'bag-title', `<span>Bag</span><b>${c.inventory.length}</b><span class="of">/ ${INV_SIZE}</span>`));
  const filters = el('div', 'rfilter');
  const fAll = el('button', 'chip' + (inv.filter === 'all' ? ' on' : ''), 'All');
  fAll.onclick = () => { inv.filter = 'all'; rerender(); };
  filters.appendChild(fAll);
  for (const r of RARITIES) {
    const b = el('button', 'chip gem' + (inv.filter === r.id ? ' on' : ''), `<i style="background:${r.color}"></i>`);
    bindTip(b, () => `<div class="tip-s"><b style="color:${r.color}">${r.name}</b><span>Show only ${r.name.toLowerCase()} items</span></div>`, { pos: 'top' });
    b.onclick = () => { inv.filter = inv.filter === r.id ? 'all' : r.id; rerender(); };
    filters.appendChild(b);
  }
  head.appendChild(filters);
  const sortB = el('button', 'small', 'Sort');
  sortB.onclick = () => { sortBag(c); rerender(); };
  head.appendChild(sortB);
  mid.appendChild(head);
  const well = el('div', 'bag f-well');
  const bg = el('div', 'grid');
  bindDrop(well, (p) => { if (p.from === 'loadout') clearLoadoutSlot(p.i); else if (p.from === 'equip') unequip(p.slot); rerender(); }, (p) => p.from === 'loadout' || p.from === 'equip');
  for (let i = 0; i < INV_SIZE; i++) {
    const it = c.inventory[i];
    const dim = it && inv.filter !== 'all' && it.rarity !== inv.filter;
    let better = false;
    if (it && equippable(it) && it.req <= c.level) { const cur = compareFor(it); better = cur ? itemPower(it) > itemPower(cur) : (canSlot(it) ? c.loadout.some((x) => !x) : !c.equip[slotFor(it)]); }
    const cell = el('div', cellCls(it, { sel: it && it.uid === inv.sel, dim }), cellHtml(it, { better }));
    if (it) {
      bindTip(cell, () => (it.uid === inv.sel ? '' : cardFor(it, compareFor(it)) + (it.junk ? '<div class="tip-note">Marked as junk</div>' : '')));
      cell.onclick = () => { inv.sel = it.uid; inv.confirm = null; rerender(); };
      cell.ondblclick = () => { doEquip(it); rerender(); };
      cell.oncontextmenu = (e) => { e.preventDefault(); if (e.shiftKey) it.junk = !it.junk; else doEquip(it); rerender(); };
      bindDrag(cell, () => ({ item: it, from: 'bag', i, icon: itemIcon(it) }));
    }
    bindDrop(cell, (p) => {
      if (p.from === 'bag') { if (p.i !== i) { const arr = c.inventory; const [m] = arr.splice(p.i, 1); arr.splice(Math.min(i, arr.length), 0, m); } }
      else if (p.from === 'loadout') clearLoadoutSlot(p.i);
      else if (p.from === 'equip') unequip(p.slot);
      rerender();
    }, (p) => p.from === 'bag' || p.from === 'loadout' || p.from === 'equip');
    bg.appendChild(cell);
  }
  well.appendChild(bg);
  mid.appendChild(well);
  // belt: potions & consumables, materials, gold
  const belt = el('div', 'belt');
  const cons = el('div', 'belt-row');
  for (const [id, n] of Object.entries(c.consumables)) {
    if (!n || !CONSUMABLES[id]) continue;
    const d = CONSUMABLES[id];
    const b = el('div', 'bchip interactive', `${img(simpleIcon(id === 'waystone_shard' ? 'gem' : 'potion', d.color), 'mini')}<b>${n}</b>`);
    b.dataset.key = 'c-' + id;
    bindTip(b, () => `<div class="tip-s"><b>${esc(d.name)}</b><span>${esc(d.desc)}</span><span class="dim">Click to use${id === 'hp_potion' ? ` · ${kc('Z')} in battle` : id === 'mana_potion' ? ` · ${kc('V')} in battle` : ''}</span></div>`, { pos: 'top' });
    b.onclick = () => { useConsumable(id); rerender(); };
    cons.appendChild(b);
  }
  const mats = Object.entries(c.materials);
  for (const [id, n] of mats) {
    const m = MATERIALS_LIST[id];
    const b = el('div', 'bchip mat', `${img(simpleIcon('gem', m?.color || '#a0a0a0'), 'mini')}<b>${n}</b>`);
    b.dataset.key = 'm-' + id;
    bindTip(b, () => `<div class="tip-s"><b>${esc(m?.name || id)}</b><span>Crafting material. Blacksmiths and enchanters use it.</span></div>`, { pos: 'top' });
    cons.appendChild(b);
  }
  belt.appendChild(cons);
  belt.appendChild(el('div', 'gold-pill', `${img(simpleIcon('gem', '#f0c040'), 'mini')}<b>${c.gold}</b><span>gold</span>`));
  mid.appendChild(belt);
  wrap.appendChild(mid);

  // ------------------------------------------------ right: item detail
  const right = el('div', 'inv-right');
  const found = findItem(inv.sel);
  if (!found) inv.sel = null;
  const det = el('div', 'detail f-card');
  if (found) {
    const it = found.item;
    det.innerHTML = cardFor(it, found.where === 'bag' ? compareFor(it) : null);
    const acts = el('div', 'detail-acts');
    const btn = (label, fn, cls = '') => { const b = el('button', cls, label); b.onclick = fn; acts.appendChild(b); return b; };
    if (found.where === 'bag') {
      if (equippable(it)) btn(canSlot(it) ? 'Equip to slot' : 'Equip', () => { doEquip(it); rerender(); }, 'primary').disabled = it.req > c.level;
      btn(it.junk ? 'Unmark junk' : 'Mark junk', () => { it.junk = !it.junk; rerender(); });
      const confirming = inv.confirm === it.uid && performance.now() - inv.confirmT < 3000;
      btn(confirming ? 'Really destroy?' : 'Destroy', () => {
        if (confirming) { removeItem(it.uid); toast(`Destroyed ${esc(it.name)}.`); inv.sel = null; inv.confirm = null; }
        else { inv.confirm = it.uid; inv.confirmT = performance.now(); }
        rerender();
      }, confirming ? 'danger' : '');
    } else if (found.where === 'loadout') {
      if (found.i !== c.activeSlot) btn('Take in hand', () => { if (G.player?.cooldowns) G.player.cooldowns._swap = 0; switchSlot(found.i); rerender(); }, 'primary');
      btn('To bag', () => { clearLoadoutSlot(found.i); rerender(); });
    } else btn('Unequip', () => { unequip(found.slot); rerender(); });
    det.appendChild(acts);
  } else {
    det.classList.add('empty');
    det.innerHTML = `<div class="detail-empty">${img(simpleIcon('gem', '#b89868'), 'big-ghost')}<b>Select an item</b><span>Click anything in your bag or on your character to inspect it here. Items marked ${'<i class="better-ico"></i>'} are an upgrade.</span></div>`;
  }
  right.appendChild(det);
  wrap.appendChild(right);
  body.appendChild(wrap);
}

const KIND_ORDER = { weapon: 0, tome: 1, shield: 2, armor: 3, trinket: 4 };
const SLOT_ORDER = { helm: 0, chest: 1, gloves: 2, legs: 3, boots: 4, amulet: 5, ring: 6 };
function sortBag(c) {
  c.inventory.sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) || (SLOT_ORDER[a.slot] ?? 0) - (SLOT_ORDER[b.slot] ?? 0) || RARITY[b.rarity].index - RARITY[a.rarity].index || itemPower(b) - itemPower(a));
}

// ----------------------------------------------------------------- attributes
const STAT_NAMES = { str: 'Strength', dex: 'Dexterity', int: 'Intellect', vit: 'Vitality', wil: 'Willpower' };
const STAT_TIPS = { str: 'Melee damage with swords, maces, greatswords and halberds.', dex: 'Bow, dagger and spear damage, critical chance and stamina.', int: 'Spell power, mana, staff and wand damage.', vit: 'Maximum health and a little armor.', wil: 'Mana regeneration and resistances.' };
const STAT_ICON = { str: ['sword', '#e06040'], dex: ['bow', '#70c060'], int: ['staff', '#70a0ff'], vit: ['chest', '#e0a060'], wil: ['amulet', '#c080ff'] };
function buildAttributes(body, c) {
  const p = G.player, d = p.derived, race = RACE_BY_ID[c.race], cls = CLASS_BY_ID[c.cls];
  const wrap = el('div', 'attr');
  // left: portrait + attributes
  const left = el('div', 'attr-left f-sheet');
  const need = xpToNext(c.level);
  left.appendChild(el('div', 'attr-id', `<div class="hero-bg small">${heroPortrait()}</div><div><div class="nm">${esc(c.name)}</div><div class="sub">${c.title ? esc(c.title) + ' · ' : ''}Level ${c.level} ${esc(race.name)} ${esc(cls.name)}</div><div class="xp"><i style="width:${Math.min(100, (c.xp / need) * 100).toFixed(1)}%"></i></div><div class="xpt">${c.xp} / ${need} XP</div></div>`));
  left.appendChild(el('div', 'sec-h', `<span>Attributes</span>${c.statPoints ? `<span class="pts">${c.statPoints} to spend</span>` : ''}`));
  for (const k of ['str', 'dex', 'int', 'vit', 'wil']) {
    const r = el('div', 'arow', `${img(simpleIcon(...STAT_ICON[k]), 'mini')}<span class="an">${STAT_NAMES[k]}</span><b>${d.stats[k]}</b>`);
    r.dataset.key = 'a-' + k;
    bindTip(r, () => `<div class="tip-s"><b>${STAT_NAMES[k]}</b><span>${STAT_TIPS[k]}</span></div>`);
    if (c.statPoints > 0) {
      const b = el('button', 'plus', '+');
      b.onclick = (e) => { e.stopPropagation(); c.stats[k]++; c.statPoints--; p.refreshStats(); openInventory('stats'); };
      r.appendChild(b);
    }
    left.appendChild(r);
  }
  wrap.appendChild(left);
  // middle: derived stats in groups
  const mid = el('div', 'attr-mid');
  const group = (title, rows) => {
    const g = el('div', 'sgroup f-sheet');
    g.appendChild(el('div', 'sec-h', `<span>${title}</span>`));
    for (const [k, v] of rows) g.appendChild(el('div', 'srow', `<span>${k}</span><b>${v}</b>`));
    mid.appendChild(g);
  };
  group('Vitals', [['Health', `${Math.ceil(p.hp)} / ${p.maxHp}`], ['Mana', `${Math.floor(p.mana)} / ${p.maxMana}`], ['Stamina', p.maxStamina], ['Mana regen', `${d.manaRegen.toFixed(1)}/s`]]);
  group('Offense', [['Weapon damage', Math.round(d.weaponDmg)], ['Spell power', `+${Math.round(d.spellPower)}%`], ['Critical chance', `${d.critChance.toFixed(1)}%`], ['Critical damage', `+${d.critDmg}%`], ['Attack speed', `+${d.atkSpeed}%`], ['Cooldown reduction', `${d.cdr}%`]]);
  group('Defense', [['Armor', d.armor], ['Block', d.hasShield ? `${Math.round(d.block * 100)}%` : '40% (weapon)'], ['Parry window', `${(d.parryWindow * 1000).toFixed(0)} ms`], ['Movement', `+${d.moveSpeed}%`]]);
  group('Resistances', [['Fire', `${Math.round(d.res.fire)}%`], ['Frost', `${Math.round(d.res.frost)}%`], ['Lightning', `${Math.round(d.res.lightning)}%`], ['Void', `${Math.round(d.res.void)}%`], ['Rot', `${Math.round(d.res.rot)}%`]]);
  group('Fortune', [['Magic find', `+${d.magicFind}%`], ['Gold find', `+${d.goldFind}%`], ['Experience', `+${d.xpPct}%`], ['Gold', c.gold]]);
  const sets = Object.entries(d.sets);
  if (sets.length) group('Sets', sets.map(([s, n]) => [SETS[s].name, `${n}/5`]));
  wrap.appendChild(mid);
  // right: lore of the character
  const right = el('div', 'attr-right f-sheet scroll');
  let h = `<div class="sec-h"><span>${esc(race.name)}</span><span class="sec-sub">Racial traits</span></div>${race.traits.map((t) => `<div class="trait"><b>${esc(t.name)}</b> ${esc(t.desc)}</div>`).join('')}`;
  h += `<div class="sec-h"><span>${esc(cls.name)}</span><span class="sec-sub">Class</span></div><div class="trait">${esc(cls.desc)}</div><div class="trait dim">${esc(cls.mechanic)}</div><div class="trait">${kc('X')} <b>${esc(cls.signature.name)}</b> ${esc(cls.signature.desc)}</div>`;
  if (c.rareFate) h += `<div class="sec-h"><span class="fate">Hidden fate</span></div><div class="trait"><b>${esc(c.rareFate.title)}</b> ${esc(c.rareFate.desc)}</div>`;
  if (c.fateLocked) h += '<div class="trait"><b>Fate Sealed</b> You accepted the dice without question.</div>';
  if (c.fateScar) h += '<div class="trait bad"><b>Fate Scar</b> You defied the dice: -10% max health until level 20.</div>';
  right.innerHTML = h;
  if (c.titles.length) {
    right.appendChild(el('div', 'sec-h', '<span>Titles</span><span class="sec-sub">click to wear</span>'));
    const tl = el('div', 'chips');
    for (const t of c.titles) { const b = el('button', 'chip' + (c.title === t ? ' on' : ''), esc(t)); b.onclick = () => { c.title = c.title === t ? null : t; openInventory('stats'); }; tl.appendChild(b); }
    right.appendChild(tl);
  }
  if (c.mounts.length) {
    right.appendChild(el('div', 'sec-h', `<span>Mounts</span><span class="sec-sub">${kc('G')} to ride</span>`));
    const ml = el('div', 'chips');
    for (const id of c.mounts) { const b = el('button', 'chip' + (c.activeMount === id ? ' on' : ''), esc(MOUNTS[id].name)); b.onclick = () => { c.activeMount = id; openInventory('stats'); }; ml.appendChild(b); }
    right.appendChild(ml);
  }
  wrap.appendChild(right);
  body.appendChild(wrap);
}

// ===================================================================== SKILLS (K)
const sk = { slot: null, pick: null, key: null };
function abilityMeta(id) {
  const a = abilityDef(id);
  if (!a) return null;
  const d = a.def, el_ = d.element || 'physical';
  const cost = a.kind === 'spell' ? (d.hpCost ? `${Math.round(d.hpCost * 100)}% health` : `${d.cost} mana${d.channel ? '/s' : ''}`) : d.mana ? `${d.mana} mana` : `${d.stamina || 0} stamina`;
  return { a, d, el: el_, elem: ELEMENTS[el_] || ELEMENTS.physical, cost, kind: a.kind === 'spell' ? 'Spell' : a.kind === 'combo' ? 'Combo' : 'Technique', cd: d.cd || 0 };
}
export function abilityTip(id, key) {
  const m = abilityMeta(id);
  if (!m) return '';
  return `<div class="tip-a" style="--ec:${m.elem.glow}"><div class="ta-h">${img(skillIcon(m.d, m.d.element), 'sk')}<div><b>${esc(m.d.name)}</b><span>${m.kind} · ${m.elem.name}</span></div>${key ? kc(key) : ''}</div><div class="ta-tags"><span>${m.cd}s cooldown</span><span>${m.cost}</span></div><div class="ta-d">${esc(m.d.desc)}</div></div>`;
}
export function openSkills() {
  const c = char();
  if (!c) return;
  if (sk.slot === null || sk.slot >= LOADOUT_SIZE) sk.slot = c.activeSlot;
  const tabs = [];
  for (let i = 0; i < LOADOUT_SIZE; i++) {
    const it = c.loadout[i];
    tabs.push([String(i), `<span class="tn">${i + 1}</span>${it ? img(itemIcon(it), 'ti') + `<span class="tl">${esc(shortName(it))}</span>` : '<span class="tl dim">Empty</span>'}${i === c.activeSlot ? '<i class="hand"></i>' : ''}`]);
  }
  const { w, body } = windowFrame('Skills', tabs, String(sk.slot), (t) => { sk.slot = +t; sk.pick = null; sk.key = null; openSkills(); }, { id: 'skills', cls: 'skills-win', hints: [['Click', 'Pick ability'], ['Click', 'Then a key'], ['Drag', 'Onto a key'], ['K', 'Close']] });
  const item = c.loadout[sk.slot];
  const wrap = el('div', 'skw');
  const main = el('div', 'sk-main');
  // ------------------------------------------- header: the weapon and its Q / E / R
  const head = el('div', 'sk-head f-sheet');
  if (item) {
    head.appendChild(el('div', 'sk-item', `<div class="cell slotf rf-${item.rarity}">${img(itemIcon(item), 'ic')}</div><div><div class="nm r-${item.rarity}">${esc(item.name)}</div><div class="sub">Slot ${sk.slot + 1}${sk.slot === c.activeSlot ? ' · in hand' : ''} · ${item.kind === 'tome' ? 'its spells' : 'its techniques'} go on ${kc('Q')}${kc('E')}${kc('R')}</div></div>`));
    const keys = el('div', 'sk-keys');
    const kit = kitFor(item);
    kit.forEach((id, k) => {
      const m = id && abilityMeta(id);
      const ks = el('div', 'kslot' + (sk.key === k ? ' pending' : '') + (sk.pick ? ' armed' : ''), `<div class="cell slotf big${m ? '' : ' empty'}">${m ? img(skillIcon(m.d, m.d.element), 'ic') : ''}${kc(KEYS[k], 'big')}</div><div class="kn">${m ? esc(m.d.name) : 'Empty'}</div><div class="kt">${m ? `${m.cd}s · ${m.cost}` : '&nbsp;'}</div>`);
      ks.dataset.key = 'k' + k;
      if (m) bindTip(ks, () => abilityTip(id, KEYS[k]));
      ks.onclick = () => {
        if (sk.pick) { assignAbility(item, k, sk.pick); sk.pick = null; sk.key = null; refreshSkillbar(); }
        else sk.key = sk.key === k ? null : k;
        openSkills();
      };
      if (id) bindDrag(ks, () => ({ ability: id, fromKey: k, icon: skillIcon(m.d, m.d.element) }));
      bindDrop(ks, (p) => { assignAbility(item, k, p.ability); sk.pick = null; sk.key = null; refreshSkillbar(); openSkills(); }, (p) => !!p.ability);
      keys.appendChild(ks);
    });
    head.appendChild(keys);
  } else head.appendChild(el('div', 'sk-empty', `<b>Slot ${sk.slot + 1} is empty</b><span>Open your bag (${kc('I')}) and drag a weapon or spellbook onto slot ${sk.slot + 1}. Swords, bows, staves and tomes each bring their own abilities.</span>`));
  main.appendChild(head);
  // ------------------------------------------- the ability pool
  if (item) {
    const pool = abilityPool(item);
    const kit = kitFor(item);
    main.appendChild(el('div', 'pool-h', `<span>${item.kind === 'tome' ? 'Spells in this book' : 'Techniques for this weapon'}</span><span class="sec-sub">${sk.pick ? 'Now click Q, E or R' : sk.key !== null ? `Pick an ability for ${KEYS[sk.key]}` : 'Click an ability, then a key · or drag it onto a key'}</span>`));
    const list = el('div', 'pool f-well scroll');
    list.dataset.key = 'pool' + sk.slot;
    for (const id of pool) {
      const m = abilityMeta(id);
      if (!m) continue;
      const bound = kit.indexOf(id);
      const card = el('div', 'acard' + (sk.pick === id ? ' on' : '') + (bound >= 0 ? ' bound' : ''), `<div class="ac-ic cell slotf">${img(skillIcon(m.d, m.d.element), 'ic')}</div><div class="ac-t"><div class="ac-n">${esc(m.d.name)}${bound >= 0 ? kc(KEYS[bound]) : ''}</div><div class="ac-k"><i style="background:${m.elem.glow}"></i>${m.kind} · ${m.elem.name}</div><div class="ac-d">${esc(m.d.desc)}</div><div class="ac-tags"><span>${m.cd}s</span><span>${m.cost}</span></div></div>`);
      card.style.setProperty('--ec', m.elem.glow);
      card.dataset.key = 'a-' + id;
      card.onclick = () => {
        if (sk.key !== null) { assignAbility(item, sk.key, id); sk.key = null; sk.pick = null; refreshSkillbar(); }
        else sk.pick = sk.pick === id ? null : id;
        openSkills();
      };
      bindDrag(card, () => ({ ability: id, icon: skillIcon(m.d, m.d.element) }));
      list.appendChild(card);
    }
    if (!pool.length) list.appendChild(el('div', 'pool-empty', 'This item has no abilities yet.'));
    main.appendChild(list);
  }
  wrap.appendChild(main);
  // ------------------------------------------- side: signature + passives
  const side = el('div', 'sk-side');
  const cls = CLASS_BY_ID[c.cls];
  const p = G.player;
  const rv = p?.resource || 0, rmax = p?.resourceMax || cls.resource.max;
  side.appendChild(el('div', 'sig f-sheet', `<div class="sec-h"><span>Signature</span>${kc('X')}</div><div class="sig-row"><div class="cell slotf big rf-legendary">${img(skillIcon({ id: 'sig_' + cls.id, type: 'buff' }, 'holy'), 'ic')}</div><div><b>${esc(cls.signature.name)}</b><span>${esc(cls.signature.desc)}</span></div></div><div class="res"><span>${esc(cls.resource.name)}</span><div class="res-bar"><i style="width:${Math.min(100, (rv / rmax) * 100).toFixed(1)}%;background:${cls.resource.color}"></i></div><b>${Math.floor(rv)}/${rmax}</b></div><div class="dim small">${esc(cls.mechanic)}</div>`));
  const pas = el('div', 'passives f-sheet scroll');
  pas.appendChild(el('div', 'sec-h', '<span>Passives</span><span class="sec-sub">always active</span>'));
  const passives = c.skills.map((id) => SKILLS[id]).filter((s) => s && s.type === 'passive');
  const tomes = c.loadout.filter((x) => x?.kind === 'tome').map((x) => x.tome);
  for (const cb of COMBOS) if (cb.type === 'passive' && tomes.includes(cb.tome) && cb.skill.some((s) => c.skills.includes(s))) passives.push(cb);
  for (const s of passives) pas.appendChild(el('div', 'pitem', `${img(skillIcon(s, s.element), 'sk')}<div><b>${esc(s.name)}</b><span>${esc(s.desc.replace(/^Passive: /, ''))}</span></div>`));
  if (!passives.length) pas.appendChild(el('div', 'dim small', 'No passives yet. Trainers, relics and rivals teach them.'));
  side.appendChild(pas);
  wrap.appendChild(side);
  body.appendChild(wrap);
  openModal('skills', w);
}
function shortName(it) { const n = it.name; return n.length > 16 ? n.split(' ').slice(-2).join(' ') : n; }

// ===================================================================== JOURNAL (J)
let journalSel = null, journalTab = 'quests';
export function openJournal(tab = journalTab) {
  journalTab = tab;
  const c = char();
  if (!c) return;
  const { w, body } = windowFrame('Journal', [['quests', 'Quests'], ['codex', 'Codex'], ['factions', 'Factions']], tab, (t) => openJournal(t), { id: 'journal', hints: [['Click', 'Read'], ['J', 'Close']] });
  if (tab === 'quests') {
    const ql = el('div', 'qlist f-well scroll');
    ql.dataset.key = 'ql';
    const active = c.questOrder.filter((id) => c.quests[id] && !c.quests[id].done);
    const done = c.questOrder.filter((id) => c.quests[id]?.done);
    if (!journalSel || !c.quests[journalSel]) journalSel = c.trackedQuest || active[0] || done[0];
    for (const [label, ids] of [['Active', active], ['Completed', done]]) {
      if (!ids.length) continue;
      ql.appendChild(el('div', 'ql-h', `${label} <b>${ids.length}</b>`));
      for (const id of ids) {
        const def = questDef(id);
        if (!def) continue;
        const it = el('div', 'qitem' + (id === journalSel ? ' on' : '') + (c.quests[id].done ? ' done' : ''), `<i class="qk-${def.kind}"></i><div><div class="qn">${esc(def.name)}</div><div class="qk">${esc(def.kind)}${c.trackedQuest === id ? ' · <b>tracked</b>' : ''}</div></div>`);
        it.dataset.key = 'q-' + id;
        it.onclick = () => { journalSel = id; openJournal('quests'); };
        ql.appendChild(it);
      }
    }
    if (!active.length && !done.length) ql.appendChild(el('div', 'ql-empty', 'No quests yet. Speak with townsfolk: elders, faction masters and trainers all have work.'));
    body.appendChild(ql);
    const det = el('div', 'qpage f-sheet scroll');
    det.dataset.key = 'qp-' + journalSel;
    if (journalSel) {
      const def = questDef(journalSel), st = c.quests[journalSel];
      let h = `<div class="qp-kind">${esc(def.kind)} quest · suggested level ${def.level || 1}${st.done ? ' · <b>complete</b>' : ''}</div><div class="qp-title">${esc(def.name)}</div><div class="ink-rule"></div><p class="qp-intro">${esc(def.intro || '')}</p><div class="sec-h"><span>Objectives</span></div>`;
      def.steps.forEach((s, i) => {
        if (i > st.step) return;
        if (i < st.step || st.done) { if (s.text || s.any) h += `<div class="obj done"><i></i>${esc(s.text || 'Objectives')}</div>`; return; }
        for (const o of objectiveProgress(journalSel)) h += `<div class="obj ${o.done ? 'done' : ''}"><i></i>${esc(o.text)}${o.n !== null && o.of ? ` <b>${o.n}/${o.of}</b>` : ''}</div>`;
      });
      if (st.done && def.outro) h += `<div class="ink-rule"></div><p class="qp-intro">${esc(def.outro)}</p>`;
      const R_ = def.rewards || {};
      const rew = [R_.xp && `${R_.xp} XP`, R_.gold && `${R_.gold} gold`, R_.skill && `Skill: ${SKILLS[R_.skill]?.name}`, R_.item?.legendary && `Relic: ${LEGENDARIES[R_.item.legendary]?.name}`, R_.item?.tome && `${TOMES[R_.item.tome]?.name} (tier ${R_.item.tier})`, R_.item?.random && 'Equipment', R_.title && `Title: ${R_.title}`, R_.mount && `Mount: ${MOUNTS[R_.mount]?.name}`].filter(Boolean);
      if (rew.length) h += `<div class="sec-h"><span>Rewards</span></div><div class="chips">${rew.map((r) => `<span class="chip">${esc(r)}</span>`).join('')}</div>`;
      det.innerHTML = h;
      if (!st.done) {
        const tb = el('button', c.trackedQuest === journalSel ? 'on' : 'primary', c.trackedQuest === journalSel ? 'Tracking' : 'Track quest');
        tb.onclick = () => { c.trackedQuest = journalSel; openJournal('quests'); };
        det.appendChild(el('div', 'qp-acts')).appendChild(tb);
      }
    } else det.innerHTML = '<div class="ql-empty">Your journal is empty.</div>';
    body.appendChild(det);
  } else if (tab === 'codex') {
    const col = el('div', 'codex f-sheet scroll');
    col.dataset.key = 'codex';
    const cleared = DUNGEONS.filter((d) => c.cleared[d.id]).length;
    const stat = (k, v, of) => `<div class="cstat"><b>${v}</b>${of !== undefined ? `<span class="of">/ ${of}</span>` : ''}<span>${k}</span></div>`;
    let h = `<div class="sec-h"><span>The World</span></div><div class="cstats">${stat('Dungeons cleared', cleared, DUNGEONS.length)}${stat('Waystones attuned', c.discovered.waystones.length, WAYSTONES.length)}${stat('Shrines blessed', c.shrinesUsed.length, SHRINES.length)}${stat('Landmarks seen', c.discovered.landmarks.length, LANDMARKS.length)}${stat('World bosses slain', WORLD_BOSSES.filter((b) => c.bossesSlain.includes(b.enemy)).length, WORLD_BOSSES.length)}${stat('Foes slain', c.kills)}${stat('Deaths', c.deaths)}${stat('Days survived', c.day)}</div>`;
    h += '<div class="sec-h"><span>Dungeons</span><span class="sec-sub">♛ holds a Crown Shard</span></div><div class="dlist">';
    for (const d of DUNGEONS) {
      const known = c.discovered.dungeons.includes(d.id) || c.cleared[d.id];
      h += `<div class="dl ${c.cleared[d.id] ? 'done' : known ? '' : 'unknown'}"><i></i><span>${d.shard ? '♛ ' : ''}${known ? esc(d.name) : '???'}</span><b>Lv ${d.level}</b></div>`;
    }
    h += '</div><div class="sec-h"><span>World Bosses</span></div><div class="dlist">';
    for (const b of WORLD_BOSSES) h += `<div class="dl ${c.bossesSlain.includes(b.enemy) ? 'done' : ''}"><i></i><span>${esc(b.enemy.replace(/_/g, ' '))}</span><b>${esc(BIOMES[b.biome].short)} · ${b.cond ? esc(b.cond) : 'always'} · Lv ${b.level}</b></div>`;
    h += '</div>';
    col.innerHTML = h;
    body.appendChild(col);
  } else {
    const col = el('div', 'factions scroll');
    col.dataset.key = 'factions';
    for (const f of Object.values(FACTIONS)) {
      const v = c.rep[f.id] || 0;
      const tier = repTier(v);
      const pct = Math.max(0, Math.min(100, ((v + 1000) / 4000) * 100));
      col.appendChild(el('div', 'fcard f-sheet', `<div class="fh"><span class="sig" style="background:${f.color}">${f.sigil}</span><div><div class="fn">${esc(f.name)}</div><div class="ft">${esc(tier.name)} · ${v} standing</div></div></div><div class="fbar"><i style="width:${pct}%;background:${f.color}"></i></div><p>${esc(f.desc)}</p>${(c.bounty[f.id] || 0) ? `<div class="bounty">Bounty: ${c.bounty[f.id]} gold</div>` : ''}`));
    }
    const other = Object.entries(c.bounty).filter(([k, v]) => v > 0 && !FACTIONS[k]);
    for (const [k, v] of other) col.appendChild(el('div', 'fcard f-sheet', `<div class="bounty">Bounty in ${esc([...TOWNS, ...DEEP_TOWNS].find((t) => t.id === k)?.name || k)}: ${v} gold</div>`));
    body.appendChild(col);
  }
  openModal('journal', w);
}

// ===================================================================== WORLD MAP & FAST TRAVEL (M)
const mapView = { realm: null, zoom: 1, cx: 0, cz: 0, sel: null, hover: null, open: {} };
const REGION_ORDER = ['wastes', 'gilded', 'verdant', 'frost', 'coast', 'maw', 'deep'];
let destCache = null;
function destinations(realm) {
  const c = G.char;
  const key = realm + '|' + c.discovered.dungeons.length + '|' + Object.keys(c.cleared).length + '|' + c.discovered.waystones.length;
  if (destCache?.key === key) return destCache.list;
  const out = [];
  const towns = realm === 'deep' ? DEEP_TOWNS : TOWNS;
  for (const t of towns) {
    const w = WAYSTONES.find((x) => x.id === 'w_' + t.id);
    out.push({ id: 'town:' + t.id, kind: 'town', name: t.name, x: w ? w.x : t.x, z: w ? w.z : t.z, mx: t.x, mz: t.z, realm, region: t.biome, sub: t.faction ? FACTIONS[t.faction].name : 'Free settlement' });
  }
  for (const w of WAYSTONES) {
    if (w.realm !== realm || towns.some((t) => 'w_' + t.id === w.id)) continue;
    out.push({ id: 'way:' + w.id, kind: 'waystone', name: w.name, x: w.x, z: w.z, mx: w.x, mz: w.z, realm, region: primaryBiome(w.x, w.z, realm), sub: c.discovered.waystones.includes(w.id) ? 'Waystone · attuned' : 'Waystone' });
  }
  for (const d of DUNGEONS) {
    if ((d.realm || 'surface') !== realm) continue;
    if (!c.discovered.dungeons.includes(d.id) && !c.cleared[d.id]) continue;
    out.push({ id: 'dun:' + d.id, kind: 'dungeon', name: d.name, x: d.x, z: d.z, mx: d.x, mz: d.z, realm, region: d.biome, level: d.level, shard: !!d.shard, cleared: !!c.cleared[d.id], sub: `Dungeon · Lv ${d.level}${c.cleared[d.id] ? ' · cleared' : ''}` });
  }
  destCache = { key, list: out };
  return out;
}
function travelTo(d) {
  if (!d) return;
  hideTip();
  bus.emit('fastTravel', { x: d.x, z: d.z, realm: d.realm, name: d.name, kind: d.kind, id: d.id.split(':')[1] });
}

export function openMap(realmOverride) {
  const c = char();
  if (!c) return;
  const here = G.realm === 'dungeon' ? G.dungeon?.returnRealm || 'surface' : G.realm;
  const realm = realmOverride || mapView.realm || here;
  const fresh = modalName() !== 'map';
  if (fresh || realm !== mapView.realm) {
    if (fresh && !realmOverride) { mapView.realm = here; }
    else mapView.realm = realm;
    mapView.zoom = 1;
    const pp = G.realm === 'dungeon' ? G.dungeon?.returnPos : G.player?.pos;
    if (here === mapView.realm && pp) { mapView.cx = pp.x; mapView.cz = pp.z; } else { mapView.cx = 0; mapView.cz = 0; }
    if (fresh) mapView.sel = null;
  }
  const R_ = mapView.realm;
  const { w, body } = windowFrame('World Map', [['surface', 'Surface'], ['deep', 'Hollow Deep']], R_, (t) => { mapView.sel = null; openMap(t); }, { id: 'map', cls: 'map-win', hints: [['Drag', 'Pan'], ['Wheel', 'Zoom'], ['Click', 'Select'], ['Dbl Click', 'Travel'], ['M', 'Close']] });
  const view = el('div', 'mapview f-ring');
  view.setAttribute('data-keep', '');
  view.dataset.key = 'mapview';
  body.appendChild(view);
  // ------------------------------------------- fast travel list
  const side = el('div', 'travel f-sheet');
  side.appendChild(el('div', 'sec-h', `<span>Fast Travel</span><span class="sec-sub">${R_ === 'deep' ? 'The Hollow Deep' : 'The Surface'}</span>`));
  const list = el('div', 'tlist scroll');
  list.dataset.key = 'tl-' + R_;
  const dests = destinations(R_);
  const groups = new Map();
  for (const d of dests) { if (!groups.has(d.region)) groups.set(d.region, []); groups.get(d.region).push(d); }
  const order = [...groups.keys()].sort((a, b) => REGION_ORDER.indexOf(a) - REGION_ORDER.indexOf(b));
  const KIND_RANK = { town: 0, waystone: 1, dungeon: 2 };
  for (const reg of order) {
    const ds = groups.get(reg).sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.name.localeCompare(b.name));
    const closed = mapView.open[reg] === false;
    const gh = el('div', 'tgroup' + (closed ? ' closed' : ''), `<i></i><span>${esc(BIOMES[reg]?.short || reg)}</span><b>${ds.length}</b>`);
    gh.dataset.key = 'g-' + reg;
    gh.onclick = () => { mapView.open[reg] = closed; openMap(); };
    list.appendChild(gh);
    if (closed) continue;
    for (const d of ds) {
      const row = el('div', 'trow' + (mapView.sel === d.id ? ' on' : '') + (d.cleared ? ' cleared' : ''), `<i class="mk mk-${d.kind}${d.shard ? ' shard' : ''}"></i><div><div class="tn">${esc(d.name)}</div><div class="ts">${esc(d.sub)}</div></div>`);
      row.dataset.key = 'd-' + d.id;
      row.onclick = () => { mapView.sel = d.id; mapView.cx = d.mx; mapView.cz = d.mz; mapView.zoom = Math.max(mapView.zoom, 2.2); openMap(); };
      row.ondblclick = () => travelTo(d);
      list.appendChild(row);
    }
  }
  side.appendChild(list);
  const sel = dests.find((d) => d.id === mapView.sel);
  const foot = el('div', 'tfoot');
  if (sel) {
    const dl = dangerLevel(sel.mx, sel.mz, R_);
    foot.appendChild(el('div', 'tsel', `<i class="mk mk-${sel.kind}${sel.shard ? ' shard' : ''}"></i><div><b>${esc(sel.name)}</b><span>${esc(BIOMES[sel.region]?.short || '')} · danger ${dl}${dl > c.level + 4 ? ' <em>deadly</em>' : ''}</span></div>`));
    const go = el('button', 'primary wide', `Travel to ${esc(sel.name.length > 18 ? sel.name.slice(0, 17) + '…' : sel.name)}`);
    go.onclick = () => travelTo(sel);
    foot.appendChild(go);
  } else foot.appendChild(el('div', 'tsel hint', `<span>Pick any town, waystone or discovered dungeon, on the map or in this list, then travel there.</span>`));
  side.appendChild(foot);
  body.appendChild(side);
  const live = openModal('map', w);
  const lv = live.querySelector('.mapview');
  if (!lv._init) initMapView(lv);
  mapView.draw?.();
}

const MK_COL = { town: '#ffe2a0', waystone: '#8ad0ff', dungeon: '#ff7050', shrine: '#70f0c0', quest: '#ffd040' };
function initMapView(view) {
  view._init = true;
  const cv = document.createElement('canvas');
  view.appendChild(cv);
  const legend = el('div', 'map-legend', `<span><i class="mk mk-town"></i>Town</span><span><i class="mk mk-waystone"></i>Waystone</span><span><i class="mk mk-dungeon"></i>Dungeon</span><span><i class="mk mk-shrine"></i>Shrine</span><span><i class="mk mk-quest"></i>Quest</span><span class="you"><i></i>You</span>`);
  view.appendChild(legend);
  const zoomBox = el('div', 'map-zoom', '<button class="small">+</button><button class="small">−</button><button class="small me">◎</button>');
  view.appendChild(zoomBox);
  const [zin, zout, zme] = zoomBox.querySelectorAll('button');
  zin.onclick = () => { mapView.zoom = Math.min(8, mapView.zoom * 1.4); draw(); };
  zout.onclick = () => { mapView.zoom = Math.max(0.8, mapView.zoom / 1.4); draw(); };
  zme.onclick = () => { const pp = G.realm === 'dungeon' ? G.dungeon?.returnPos : G.player?.pos; if (pp) { mapView.cx = pp.x; mapView.cz = pp.z; mapView.zoom = Math.max(mapView.zoom, 2); draw(); } };
  const hot = [];
  const scale = () => { const m = MAP[mapView.realm]; return (Math.min(cv.width, cv.height) / (m.half * 2)) * mapView.zoom; };
  const toScreen = (x, z) => { const s = scale(); return [Math.round(cv.width / 2 + (x - mapView.cx) * s), Math.round(cv.height / 2 + (z - mapView.cz) * s)]; };
  const toWorld = (sx, sy) => { const s = scale(); return [mapView.cx + (sx - cv.width / 2) / s, mapView.cz + (sy - cv.height / 2) / s]; };
  const u = () => uiUnit();
  // pixel markers, drawn in whole UI pixels
  function marker(g, kind, sx, sy, o = {}) {
    const p = u(), col = o.col || MK_COL[kind];
    const px = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(sx + x * p, sy + y * p, w * p, h * p); };
    if (kind === 'town') { px(-4, -3, 8, 7, '#000'); px(-3, -2, 6, 5, col); px(-3, -2, 6, 1, '#fff6d8'); px(-1, 0, 2, 3, '#6a4020'); px(-5, -4, 10, 1, '#000'); px(-4, -5, 8, 1, '#000'); px(-3, -6, 6, 1, '#000'); px(-4, -4, 8, 1, '#c8502a'); px(-3, -5, 6, 1, '#e0683a'); }
    else if (kind === 'waystone') { px(-2, -5, 4, 10, '#000'); px(-3, -3, 6, 6, '#000'); px(-1, -4, 2, 8, col); px(-2, -2, 4, 4, col); px(-1, -3, 1, 2, '#ffffff'); if (o.dim) px(-1, -1, 2, 2, '#3a5a78'); }
    else if (kind === 'dungeon') { px(-4, -4, 8, 8, '#000'); px(-3, -3, 6, 6, col); px(-2, -1, 1, 1, '#000'); px(1, -1, 1, 1, '#000'); px(-1, 1, 2, 1, '#000'); px(-3, -3, 6, 1, '#ffb090'); }
    else if (kind === 'shrine') { px(-2, -2, 4, 4, '#000'); px(-1, -1, 2, 2, col); }
    else if (kind === 'quest') { px(-1, -6, 3, 9, '#000'); px(0, -5, 1, 5, col); px(-1, 4, 3, 3, '#000'); px(0, 5, 1, 1, col); }
  }
  function draw() {
    if (!cv.isConnected) return;
    const m = MAP[mapView.realm], c = G.char;
    const W = Math.max(1, view.clientWidth), H = Math.max(1, view.clientHeight);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#120c08'; g.fillRect(0, 0, cv.width, cv.height);
    if (!m.ready) { g.fillStyle = '#e8c47a'; g.font = "18.6667px 'Jersey 10'"; g.fillText('The cartographers are still painting...', 30, 40); return; }
    const [x0, y0] = toScreen(-m.half, -m.half);
    const s = scale();
    g.drawImage(m.canvas, x0, y0, Math.round(m.half * 2 * s), Math.round(m.half * 2 * s));
    hot.length = 0;
    const dests = destinations(mapView.realm);
    const selD = dests.find((d) => d.id === mapView.sel);
    // shrines and quest markers first (under the travel markers)
    for (const sh of SHRINES) {
      if (sh.realm !== mapView.realm) continue;
      const [sx, sy] = toScreen(sh.x, sh.z);
      marker(g, 'shrine', sx, sy, { col: c.shrinesUsed.includes(sh.id) ? '#6a6a60' : MK_COL.shrine });
      hot.push({ x: sx, y: sy, r: 4 * u(), html: `<div class="tip-s"><b>${esc(sh.name)}</b><span>${sh.cond ? 'Awakens: ' + esc(sh.cond) : 'Shrine'}${c.shrinesUsed.includes(sh.id) ? ' · blessed' : ''}</span></div>` });
    }
    for (const d of dests) {
      const [sx, sy] = toScreen(d.mx, d.mz);
      marker(g, d.kind, sx, sy, { col: d.kind === 'dungeon' ? (d.cleared ? '#9a9080' : d.shard ? '#ff70ff' : MK_COL.dungeon) : undefined, dim: d.kind === 'waystone' && !d.sub.includes('attuned') });
      hot.push({ x: sx, y: sy, r: 6 * u(), dest: d, html: `<div class="tip-s"><b>${esc(d.name)}</b><span>${esc(d.sub)}</span><span class="dim">Click to select · double-click to travel</span></div>` });
    }
    for (const q of trackedObjectiveMarkers()) {
      if (q.realm !== mapView.realm) continue;
      const [sx, sy] = toScreen(q.x, q.z);
      marker(g, 'quest', sx, sy, { col: q.tracked ? MK_COL.quest : '#b09050' });
      hot.push({ x: sx, y: sy, r: 6 * u(), html: `<div class="tip-s"><b>${esc(questDef(q.quest)?.name || 'Quest')}</b><span>${esc(q.text)}</span></div>` });
    }
    // town labels
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    const big = mapView.zoom > 2.2;
    g.font = `${big ? 37.3333 : 18.6667}px 'Jersey 10'`;
    for (const d of dests) {
      if (d.kind !== 'town' && !(big && d.id === mapView.sel)) continue;
      const [sx, sy] = toScreen(d.mx, d.mz);
      const ty = sy - 8 * u();
      g.fillStyle = '#000'; for (const [ox, oy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) g.fillText(d.name, sx + ox, ty + oy);
      g.fillStyle = d.id === mapView.sel ? '#ffe08a' : '#fff0d0'; g.fillText(d.name, sx, ty);
    }
    // selection ring
    if (selD) {
      const [sx, sy] = toScreen(selD.mx, selD.mz);
      const p = u(), r = 9 + (Math.floor(performance.now() / 250) % 2);
      g.fillStyle = '#ffe08a';
      for (let a = 0; a < 16; a++) { const an = (a / 16) * Math.PI * 2; if (a % 2) continue; g.fillRect(Math.round(sx + Math.cos(an) * r * p) - p, Math.round(sy + Math.sin(an) * r * p) - p, p * 2, p * 2); }
    }
    // the player
    const here = G.realm === 'dungeon' ? G.dungeon?.returnRealm : G.realm;
    if (here === mapView.realm) {
      const pp = G.realm === 'dungeon' ? G.dungeon.returnPos : G.player.pos;
      const [sx, sy] = toScreen(pp.x, pp.z);
      g.save(); g.translate(sx, sy); g.rotate(Math.PI - G.player.facing);
      const p = u();
      g.beginPath(); g.moveTo(0, -6 * p); g.lineTo(4 * p, 5 * p); g.lineTo(0, 2 * p); g.lineTo(-4 * p, 5 * p); g.closePath();
      g.fillStyle = '#ffffff'; g.fill(); g.strokeStyle = '#000'; g.lineWidth = p; g.stroke(); g.restore();
    }
  }
  mapView.draw = draw;
  let drag = null;
  cv.onmousedown = (e) => { drag = { x: e.clientX, y: e.clientY, cx: mapView.cx, cz: mapView.cz, moved: false }; };
  const pick = (e) => { const r = cv.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top; let best = null, bd = 1e9; for (const o of hot) { const d = Math.hypot(o.x - mx, o.y - my); if (d < o.r && d < bd) { bd = d; best = o; } } return best; };
  bindTip(cv, () => { if (drag?.moved) return ''; return mapView.hover?.html || ''; }, { pos: 'cursor' });
  cv.onmousemove = (e) => {
    if (drag) {
      const s = scale();
      if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4) drag.moved = true;
      mapView.cx = drag.cx - (e.clientX - drag.x) / s; mapView.cz = drag.cz - (e.clientY - drag.y) / s; draw();
    }
    const h = pick(e);
    mapView.hover = h;
    cv.style.cursor = drag?.moved ? 'grabbing' : h?.dest ? 'pointer' : 'grab';
  };
  cv.onmouseleave = () => { mapView.hover = null; };
  window.addEventListener('mouseup', function up(e) {
    if (!cv.isConnected) { window.removeEventListener('mouseup', up); return; }
    if (!drag) return;
    const d = drag; drag = null;
    if (d.moved || e.target !== cv) return;
    const h = pick(e);
    if (h?.dest) { if (mapView.sel === h.dest.id) return; mapView.sel = h.dest.id; openMap(); }
  });
  cv.ondblclick = (e) => { const h = pick(e); if (h?.dest) travelTo(h.dest); };
  cv.onwheel = (e) => {
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    const [wx, wz] = toWorld(e.clientX - r.left, e.clientY - r.top);
    const z0 = mapView.zoom;
    mapView.zoom = Math.max(0.8, Math.min(8, mapView.zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
    // zoom toward the cursor
    const k = z0 / mapView.zoom;
    mapView.cx = wx + (mapView.cx - wx) * k; mapView.cz = wz + (mapView.cz - wz) * k;
    draw();
  };
  // keep the selection ring blinking and the canvas sized to the window
  const tick = () => { if (!cv.isConnected) return; if (mapView.sel || view.clientWidth !== cv.width || view.clientHeight !== cv.height) draw(); setTimeout(tick, 250); };
  requestAnimationFrame(() => { draw(); tick(); });
}

// ===================================================================== PAUSE, SETTINGS, CONTROLS
const SYS_TABS = [['main', 'Menu'], ['settings', 'Settings'], ['controls', 'Controls']];
const sysTab = (t) => (t === 'settings' ? openSettings() : t === 'controls' ? openControls() : openPause());
export function openPause() {
  const { w, body } = windowFrame('Paused', G.char ? SYS_TABS : null, 'main', sysTab, { id: 'system', cls: 'sys-win pause-win', hints: [['Esc', 'Resume']] });
  const col = el('div', 'pause');
  const c = G.char;
  if (c) {
    const cls = CLASS_BY_ID[c.cls], race = RACE_BY_ID[c.race];
    const pt = Math.floor((c.playTime || 0) / 60);
    col.appendChild(el('div', 'pcard f-sheet', `<div class="hero-bg small">${heroPortrait()}</div><div><div class="nm">${esc(c.name)}</div><div class="sub">Level ${c.level} ${esc(race.name)} ${esc(cls.name)}</div><div class="sub">Day ${c.day} · ${Math.floor(pt / 60)}h ${pt % 60}m played · ${c.gold} gold</div></div>`));
  }
  const btns = el('div', 'pbtns');
  const mk = (t, fn, cls = '') => { const b = el('button', cls, t); b.onclick = fn; btns.appendChild(b); };
  mk('Resume', closeModal, 'primary');
  if (c) mk('Save game', () => { saveGame(0) ? toast('Game saved.') : toast('Save failed.'); });
  mk('Settings', openSettings);
  mk('Controls', openControls);
  if (c) mk('Quit to title', () => { saveGame(0); location.reload(); }, 'danger');
  col.appendChild(btns);
  body.appendChild(col);
  openModal('pause', w);
}

export function openSettings() {
  const { w, body } = windowFrame('Settings', SYS_TABS, 'settings', sysTab, { id: 'system', cls: 'sys-win settings-win', hints: [['Esc', 'Close']] });
  const col = el('div', 'settings f-sheet scroll');
  const S = G.settings;
  const row = (label, ctl, key) => { const r = el('div', 'set-row'); r.dataset.key = 's-' + key; r.appendChild(el('span', 'sl', label)); r.appendChild(ctl); col.appendChild(r); };
  const slider = (key, min, max, step, fn) => {
    const wrap = el('div', 'slider');
    const i = el('input', 'range');
    i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = S[key];
    const out = el('b', '', `${Math.round((S[key] / max) * 100)}%`);
    i.oninput = () => { S[key] = +i.value; out.textContent = `${Math.round((S[key] / max) * 100)}%`; i.style.setProperty('--p', `${((S[key] - min) / (max - min)) * 100}%`); fn && fn(); saveSettings(); };
    i.style.setProperty('--p', `${((S[key] - min) / (max - min)) * 100}%`);
    wrap.append(i, out);
    return wrap;
  };
  const choice = (key, opts, fn) => {
    const g = el('div', 'seg');
    const cur = S[key] === undefined ? opts[0][0] : S[key];
    for (const [v, t] of opts) {
      const b = el('button', 'chip' + (String(cur) === String(v) ? ' on' : ''), t);
      b.onclick = () => { S[key] = v; fn && fn(); saveSettings(); openSettings(); };
      g.appendChild(b);
    }
    return g;
  };
  col.appendChild(el('div', 'sec-h', '<span>Audio</span>'));
  row('Music', slider('music', 0, 1, 0.05, () => bus.emit('volume')), 'music');
  row('Effects', slider('sfx', 0, 1, 0.05, () => bus.emit('volume')), 'sfx');
  col.appendChild(el('div', 'sec-h', '<span>Display</span>'));
  row('Pixel size', choice('pixel', [['auto', 'Auto'], [2, '2x'], [3, '3x'], [4, '4x'], [5, '5x']], () => { R.settings.pixel = S.pixel; applySettings(); }), 'pixel');
  row('Camera', choice('camera', [['cinematic', 'Cinematic (tilt + depth of field)'], ['flat', 'Flat 2D']], () => bus.emit('settingsChanged', 'camera')), 'camera');
  row('Depth of field', choice('dof', [[true, 'On'], [false, 'Off']], () => bus.emit('settingsChanged', 'dof')), 'dof');
  row('Magic glow', choice('glow', [[true, 'On'], [false, 'Off']], () => { R.settings.glow = S.glow; }), 'glow');
  row('Spell effects', choice('magicFx', [[true, 'Enhanced'], [false, 'Classic']]), 'fx');
  row('Damage numbers', choice('damageNumbers', [[true, 'On'], [false, 'Off']]), 'dmg');
  col.appendChild(el('div', 'sec-h', '<span>Feel</span>'));
  row('Screen shake & kick', slider('screenShake', 0, 1.5, 0.1), 'shake');
  row('Controller vibration', choice('vibration', [[true, 'On'], [false, 'Off']]), 'vib');
  body.appendChild(col);
  openModal('settings', w);
}

const CONTROLS_KB = [
  ['W+A+S+D', 'Move'], ['Mouse', 'Aim'], ['Left Click', 'Attack (hold to keep attacking)'], ['Right Click', 'Block · tap just before a hit to parry'],
  ['Space', 'Dodge roll'], ['Shift', 'Sprint'], ['1+2+3+4', 'Switch weapon slot'], ['Q+E+R', 'Abilities of the weapon in hand (hold to keep casting)'],
  ['X', 'Class signature'], ['F', 'Interact · talk · loot'], ['Z', 'Health potion'], ['V', 'Mana potion'], ['G', 'Mount'],
  ['I', 'Inventory (also Tab)'], ['C', 'Character'], ['K', 'Skills'], ['J', 'Journal'], ['M', 'Map & fast travel'], ['H', 'Controls'], ['Esc', 'Menu · close'],
];
const CONTROLS_PAD = [
  ['L Stick', 'Move'], ['R Stick', 'Aim'], ['RT', 'Attack'], ['LT', 'Block · parry'], ['A', 'Dodge roll'], ['L3', 'Sprint'],
  ['B', 'Interact'], ['X+Y+RB', 'Q · E · R abilities'], ['LB', 'Class signature'], ['◄+►', 'Cycle weapon slots'], ['▲', 'Health potion'], ['▼', 'Mana potion'],
  ['Start', 'Menu'], ['Back', 'Map'],
];
export function openControls() {
  const { w, body } = windowFrame('Controls', SYS_TABS, 'controls', sysTab, { id: 'system', cls: 'sys-win controls-win', hints: [['Esc', 'Close']] });
  const col = el('div', 'controls');
  const sheet = (title, rows, pad) => {
    const s = el('div', 'ctl f-sheet');
    s.appendChild(el('div', 'sec-h', `<span>${title}</span>`));
    for (const [k, t] of rows) s.appendChild(el('div', 'crow', `<span class="ck">${k.split('+').map((x) => kc(x, pad ? 'pad' : '')).join('')}</span><span>${esc(t)}</span>`));
    return s;
  };
  col.append(sheet('Keyboard & mouse', CONTROLS_KB), sheet('Controller', CONTROLS_PAD, true));
  body.appendChild(col);
  openModal('controls', w);
}

// ===================================================================== DEATH
export function showDeath(onRespawn) {
  const d = el('div', 'death', `<div class="t"></div><div class="death-sub">The dice are not finished with you.</div>`);
  d.querySelector('.t').appendChild(pxTitle('You have fallen', 4, { bands: ['#ff9a80', '#e04030', '#a01810', '#5a0806'] }));
  const b = el('button', 'primary', 'Rise again');
  b.onclick = () => { d.remove(); onRespawn(); };
  d.appendChild(b);
  d.appendChild(el('div', 'death-note', 'You will wake at the last waystone you touched, lighter by a tenth of your gold.'));
  root().appendChild(d);
}

// keep an open character / skills window in step with the game (pickups, swaps, level ups)
let pendingRefresh = 0;
function liveRefresh() {
  if (pendingRefresh) return;
  pendingRefresh = requestAnimationFrame(() => {
    pendingRefresh = 0;
    const n = modalName();
    if (n === 'inventory' && !input.mouse.left) openInventory();
    else if (n === 'skills') openSkills();
  });
}
for (const ev of ['equipped', 'weaponSwap', 'kitChanged', 'itemGained', 'statsChanged']) bus.on(ev, liveRefresh);
