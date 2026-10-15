// NPC conversations and town services.
import { G } from '../game.js';
import { el, esc, root, openModal, closeModal, windowFrame, bindTip, itemTooltip, hideTip, rarityCls, toast } from './ui.js';
import { itemIcon } from './icons.js';
import { greeting, RUMORS, NAMED } from '../data/npcs.js';
import { RACE_BY_ID } from '../data/races.js';
import { CLASS_BY_ID } from '../data/classes.js';
import { questDef, questsOffered, startQuest, onTalk, contractsFor, isActive, isDone } from '../systems/quests.js';
import { shopStock, stableStock, salvage, salvageYield, upgrade, upgradeCost, enchant, enchantCost, imbueElement, craft, CRAFT_RECIPES, recipeCost, transmute } from '../systems/crafting.js';
import { addItem, removeItem, sellValue, addGold, slotFor, itemPower, INV_SIZE } from '../systems/inventory.js';
import { payBounty, bountyAt, repTier, authorityAt } from '../systems/factions.js';
import { MATERIALS_LIST, AFFIX, RARITY, makeSetPiece, SETS, WEAPON_TYPES, CONSUMABLES } from '../data/items.js';
import { MOUNTS } from '../data/mounts.js';
import { FACTIONS, TOWNS, DEEP_TOWNS } from '../data/world.js';
import { TRAINER_TRIALS } from '../data/quests.js';
import { SKILLS } from '../data/skills.js';
import { atmo } from '../world/atmosphere.js';
import { saveGame } from '../core/save.js';
import { bus } from '../core/events.js';
import { RNG } from '../core/rng.js';
import { input } from '../core/input.js';

let dlg = null;
const ROLE_LINES = {
  merchant: 'Take a look. Everything has a price, and most of it is fair.',
  blacksmith: 'Steel needs fire and patience. What can I do for you?',
  enchanter: 'Arcane dust and a steady hand. I can reshape what your gear remembers.',
  innkeeper: 'A warm bed, a hot meal, and no questions. Mostly.',
  stable: 'Fine beasts, every one. Well, most of them.',
  bounty: 'Wanted posters and blood money. Looking to earn, or to pay?',
  trainer: 'You want to learn? Then show me you can survive the lesson.',
  tome: 'Spellbooks, and the knowledge to use them. Mind the pages, they bite.',
  faction: 'Speak, traveller.',
  guard: 'Move along. Keep the peace.',
  villager: null,
  seer: 'The Maw speaks to me. Sit, and listen.',
};

export function talkTo(npc) {
  const c = G.char;
  const lines = onTalk(npc.id_);
  closeDialogue();
  const race = RACE_BY_ID[c.race], cls = CLASS_BY_ID[c.cls];
  const town = [...TOWNS, ...DEEP_TOWNS].find((t) => t.id === npc.town);
  // guards confront wanted players
  const authKey = town ? (town.faction || town.id) : null;
  if (npc.role === 'guard' && authKey && bountyAt(authKey) > 0) {
    return showDialogue(npc, `Halt! You have a bounty of ${bountyAt(authKey)} gold in these parts. Pay it now, or face the consequences.`, [
      { t: `Pay ${bountyAt(authKey)} gold`, fn: () => { if (payBounty(authKey)) { toast('Bounty paid. Your record is clean.'); closeDialogue(); } } },
      { t: 'Resist arrest', fn: () => { npc.provoked = true; npc.hunting = true; for (const e of G.entities) if (e.isNpc && e.role === 'guard' && e.town === npc.town) e.hunting = true; closeDialogue(); } },
    ]);
  }
  let text = '';
  if (lines.length) text = lines.map((l) => l.text).join('\n\n');
  else {
    const fateG = c.rareFate ? { title: c.rareFate.title } : null;
    const g = greeting(npc.seed, c.race, c.cls, c.name, fateG);
    text = npc.mute ? '(They incline their head and write on a slate.) WELCOME.' : (ROLE_LINES[npc.role] ? `${g} ${ROLE_LINES[npc.role]}` : g);
    if (npc.role === 'villager') text = g + ' ' + RUMORS[npc.seed % RUMORS.length];
    if (npc.role === 'seer' && !isActive('q_main_1') && !isDone('q_main_1')) text = '"Not yet, little fate. Finish what your home asked of you first."';
  }
  const opts = [];
  // quests this NPC gave you that are still underway
  for (const id of c.questOrder) {
    const def = questDef(id);
    if (!def || def.giver !== npc.id_ || !isActive(id)) continue;
    if (!c.flags['heard_' + id] && !lines.length) { text = def.intro; c.flags['heard_' + id] = true; }
    opts.push({ t: `<span class="q">QUEST</span>${esc(def.name)}`, html: true, fn: () => showDialogue(npc, def.intro, [{ t: 'I will see it done.', fn: () => talkTo(npc) }]) });
  }
  // quests offered
  for (const id of questsOffered(npc.id_)) {
    const def = questDef(id);
    opts.push({ t: `<span class="q">NEW</span>${esc(def.name)}${def.kind === 'hidden' ? ' <span style="color:#ff9a50">(hidden fate)</span>' : ''}`, html: true, fn: () => offerQuest(npc, id) });
  }
  // bounty officer contracts
  if (npc.role === 'bounty' && town) {
    for (const id of contractsFor(town.id)) {
      if (G.char.quests[id]) continue;
      const def = questDef(id);
      opts.push({ t: `<span class="q">CONTRACT</span>${esc(def.name)}`, html: true, fn: () => offerQuest(npc, id) });
    }
    const keys = Object.entries(c.bounty).filter(([, v]) => v > 0);
    for (const [k, v] of keys) opts.push({ t: `Pay bounty in ${esc(FACTIONS[k]?.name || [...TOWNS, ...DEEP_TOWNS].find((t) => t.id === k)?.name || k)} (${v} gold)`, html: true, fn: () => { if (payBounty(k)) { toast('Bounty paid.'); talkTo(npc); } } });
  }
  // services
  const svc = {
    merchant: [['Trade', () => openShop(npc, 'merchant')]],
    blacksmith: [['Trade', () => openShop(npc, 'blacksmith')], ['Salvage, upgrade & forge', () => openSmith(npc)]],
    enchanter: [['Enchant & transmute', () => openEnchanter(npc)], ['Trade', () => openShop(npc, 'enchanter')]],
    innkeeper: [['Rest until morning (10 gold)', () => rest(npc, 0.3)], ['Rest until nightfall (10 gold)', () => rest(npc, 0.82)], ['Hear the rumours', () => showDialogue(npc, RUMORS[(G.char.day + npc.seed) % RUMORS.length] + ' ' + RUMORS[(G.char.day * 3 + npc.seed + 5) % RUMORS.length], [{ t: 'Back', fn: () => talkTo(npc) }])]],
    stable: [['Browse mounts', () => openStable(npc)]],
    tome: [['Browse spellbooks', () => openShop(npc, 'tome')]],
    faction: [['Quartermaster', () => openQuartermaster(npc)], ['Standing', () => showDialogue(npc, `The ${FACTIONS[npc.faction].name} regards you as ${repTier(c.rep[npc.faction] || 0).name} (${c.rep[npc.faction] || 0}).`, [{ t: 'Back', fn: () => talkTo(npc) }])]],
  }[npc.role] || [];
  for (const [t, fn] of svc) opts.push({ t, fn });
  if (npc.role === 'trainer' && npc.sub) {
    const sk = SKILLS[npc.sub];
    if (c.skills.includes(npc.sub)) opts.push({ t: `About ${sk.name}`, fn: () => showDialogue(npc, `You already know ${sk.name}. ${sk.desc} Practise it.`, [{ t: 'Back', fn: () => talkTo(npc) }]) });
  }
  if (npc.role === 'seer' && isDone('q_main_2')) opts.push({ t: 'Ask about the Hollow Deep', fn: () => showDialogue(npc, '"Walk down into the Maw. The stair at its heart descends to the Hollow Deep. Lanternfall is the last light below."', [{ t: 'Back', fn: () => talkTo(npc) }]) });
  opts.push({ t: 'Farewell', fn: closeDialogue });
  showDialogue(npc, text, opts);
}

function offerQuest(npc, id) {
  const def = questDef(id);
  const lvlWarn = def.level > G.char.level + 3 ? `<div style="color:#ff8060;font-size:var(--fs-1);margin-top:6px">Suggested level ${def.level}. This will be dangerous.</div>` : '';
  showDialogue(npc, `<b class="gold">${esc(def.name)}</b><br><br>${esc(def.intro)}${lvlWarn}`, [
    { t: 'Accept', fn: () => { startQuest(id); talkTo(npc); } },
    { t: 'Not now', fn: () => talkTo(npc) },
  ], true);
}

function rest(npc, tod) {
  const c = G.char;
  if (c.gold < 10) return toast('Not enough gold.');
  c.gold -= 10;
  if (atmo.timeOfDay > tod) c.day++;
  atmo.timeOfDay = tod;
  G.player.hp = G.player.maxHp; G.player.mana = G.player.maxMana;
  saveGame(0);
  closeDialogue();
  bus.emit('rested');
  toast('You rest, and wake refreshed. (Game saved)');
}

export function showDialogue(npc, text, opts, html = false) {
  closeDialogue();
  const d = el('div', 'dialogue panel');
  d.innerHTML = `<div class="who">${esc(npc.name)}<small>${esc(npc.title || '')}</small></div><div class="text">${html ? text : esc(text).replace(/\n/g, '<br>')}</div>`;
  const o = el('div', 'opts');
  opts.forEach((op, i) => {
    const b = el('button', 'opt', `<span class="q">${i + 1}.</span>${op.html ? op.t : esc(op.t)}`);
    b.onclick = () => op.fn();
    o.appendChild(b);
  });
  d.appendChild(o);
  root().appendChild(d);
  dlg = { node: d, npc, opts };
  G.menuOpen = 'dialogue';
  input.uiBlocking = true;
  G.talkingTo = npc;
  bus.emit('dialogueOpen', npc);
}

export function dialogueKey(k) {
  if (!dlg) return false;
  const n = +k;
  if (n >= 1 && n <= dlg.opts.length) { dlg.opts[n - 1].fn(); return true; }
  return false;
}

export function closeDialogue() {
  if (dlg) { dlg.node.remove(); dlg = null; if (G.menuOpen === 'dialogue') { G.menuOpen = null; input.uiBlocking = false; } G.talkingTo = null; }
}
export function dialogueOpen() { return !!dlg; }

// ---------------------------------------------------------------- shops
function priceOf(it) { return Math.max(1, Math.round((it.shopPrice || it.value * 1.4) * (G.player.derived.traits.has('silver_tongue') ? 0.9 : 1))); }

export function openShop(npc, role) {
  closeDialogue();
  const c = G.char;
  const { w, body } = windowFrame(`${npc.name} · ${role === 'tome' ? 'Spellbooks' : 'Trade'}`);
  const stock = shopStock(npc.town, role, npc.sub);
  const cols = el('div', 'shop-cols');
  const buy = el('div', 'shop-col');
  buy.appendChild(el('h3', '', `Buy · you have <span class="gold">${c.gold} gold</span>`));
  const bl = el('div', 'scroll');
  bl.style.flex = '1';
  // potions for merchants
  if (role === 'merchant') {
    for (const id of ['hp_potion', 'mana_potion', 'stamina_tonic', 'roasted_meat', 'waystone_shard']) {
      const def = CONSUMABLES[id];
      const price = Math.round(def.value * (1 + c.level * 0.05));
      const row = el('div', 'shop-row interactive', `<span style="color:${def.color};font-size:var(--fs-1)">●</span><span class="nm">${esc(def.name)} <span class="muted" style="font-size:var(--fs-1)">${esc(def.desc)}</span></span><span class="pr">${price}g</span>`);
      row.onclick = () => { if (c.gold < price) return toast('Not enough gold.'); if ((c.consumables[id] || 0) >= def.stack) return toast('You cannot carry more.'); c.gold -= price; c.consumables[id] = (c.consumables[id] || 0) + 1; openShop(npc, role); };
      bl.appendChild(row);
    }
  }
  for (const it of stock) {
    if (it.sold) continue;
    const price = priceOf(it);
    const row = el('div', 'shop-row interactive', `<img src="${itemIcon(it)}" width="38" height="38"><span class="nm ${rarityCls(it)}">${esc(it.name)} <span class="muted" style="font-size:var(--fs-1)">iLvl ${it.ilvl}</span></span><span class="pr">${price}g</span>`);
    bindTip(row, () => itemTooltip(it, c.equip[slotFor(it)]));
    row.onclick = () => { if (c.gold < price) return toast('Not enough gold.'); if (c.inventory.length >= INV_SIZE) return toast('Your pack is full.'); c.gold -= price; it.sold = true; const copy = { ...it, affixes: it.affixes.map((a) => ({ ...a })) }; delete copy.sold; delete copy.shopPrice; addItem(copy); hideTip(); openShop(npc, role); };
    bl.appendChild(row);
  }
  buy.appendChild(bl);
  const sell = el('div', 'shop-col');
  const junk = c.inventory.filter((i) => i.junk || i.rarity === 'common');
  const sh = el('h3', '', `Sell · click an item `);
  const sj = el('button', 'small', `Sell junk & commons (${junk.length})`);
  sj.onclick = () => { let g = 0; for (const it of junk) { g += sellValue(it); removeItem(it.uid); } addGold(g); toast(`Sold ${junk.length} items for ${g} gold.`); openShop(npc, role); };
  sh.appendChild(sj);
  sell.appendChild(sh);
  const sl = el('div', 'scroll');
  sl.style.flex = '1';
  for (const it of c.inventory) {
    const row = el('div', 'shop-row interactive', `<img src="${itemIcon(it)}" width="38" height="38"><span class="nm ${rarityCls(it)}">${esc(it.name)}${it.junk ? ' <span class="muted">(junk)</span>' : ''}</span><span class="pr">${sellValue(it)}g</span>`);
    bindTip(row, () => itemTooltip(it, c.equip[slotFor(it)]));
    row.onclick = () => { removeItem(it.uid); addGold(sellValue(it)); hideTip(); openShop(npc, role); };
    sl.appendChild(row);
  }
  sell.appendChild(sl);
  cols.append(buy, sell);
  body.appendChild(cols);
  openModal('shop', w);
}

function openStable(npc) {
  closeDialogue();
  const c = G.char;
  const { w, body } = windowFrame(`${npc.name} · Stables`);
  w.style.height = 'auto';
  const col = el('div', 'scroll');
  col.style.flex = '1';
  col.appendChild(el('h3', '', `You have <span class="gold">${c.gold} gold</span>. Press R to summon your mount outside of combat.`));
  for (const m of stableStock(npc.town)) {
    const owned = c.mounts.includes(m.id);
    const row = el('div', 'shop-row interactive', `<span class="nm"><b class="gold" style="font-family:var(--display)">${esc(m.name)}</b> <span class="muted">${esc(m.desc)} · speed ${m.speed}</span></span><span class="pr">${owned ? 'Owned' : m.price + 'g'}</span>`);
    row.onclick = () => { if (owned) { c.activeMount = m.id; toast(`${m.name} will answer your call.`); return; } if (c.gold < m.price) return toast('Not enough gold.'); c.gold -= m.price; c.mounts.push(m.id); c.activeMount = m.id; toast(`You bought ${m.name}! Press R to ride.`); openStable(npc); };
    col.appendChild(row);
  }
  body.appendChild(col);
  openModal('stable', w);
}

function openQuartermaster(npc) {
  closeDialogue();
  const c = G.char;
  const f = npc.faction;
  const setId = { sunward: 'sunward', ashen: 'ashencourt', tidebound: 'tidebound', choir: 'choir' }[f];
  const rep = c.rep[f] || 0;
  const { w, body } = windowFrame(`${FACTIONS[f].name} · Quartermaster`);
  const col = el('div', 'scroll');
  col.style.flex = '1';
  col.appendChild(el('h3', '', `Standing: ${repTier(rep).name} (${rep}) · set pieces unlock at Honored (600)`));
  const rng = new RNG(c.level * 7 + f.length);
  for (const slot of ['helm', 'chest', 'gloves', 'legs', 'boots']) {
    const it = makeSetPiece(setId, slot, c.level, rng);
    const price = Math.round(it.value * 2.2);
    const ok = rep >= 600;
    const row = el('div', 'shop-row interactive', `<img src="${itemIcon(it)}" width="38" height="38"><span class="nm ${rarityCls(it)}">${esc(it.name)}</span><span class="pr">${ok ? price + 'g' : 'Honored'}</span>`);
    bindTip(row, () => itemTooltip(it, c.equip[slot]));
    row.onclick = () => { if (!ok) return toast('Your standing is too low.'); if (c.gold < price) return toast('Not enough gold.'); c.gold -= price; addItem(it); hideTip(); toast(`Purchased ${it.name}.`); };
    col.appendChild(row);
  }
  body.appendChild(col);
  openModal('quartermaster', w);
}

// ---------------------------------------------------------------- blacksmith
let smithTab = 'salvage';
export function openSmith(npc, tab = smithTab) {
  closeDialogue();
  smithTab = tab;
  const c = G.char;
  const { w, body } = windowFrame(`${npc.name} · Forge`, [['salvage', 'Salvage'], ['upgrade', 'Upgrade'], ['craft', 'Craft']], tab, (t) => openSmith(npc, t));
  const col = el('div', 'scroll');
  col.style.flex = '1';
  const matsLine = () => Object.entries(c.materials).map(([k, v]) => `<span style="color:${MATERIALS_LIST[k]?.color}">◆</span> ${MATERIALS_LIST[k]?.name} ${v}`).join(' · ') || 'no materials';
  col.appendChild(el('div', 'muted', `<span class="gold">${c.gold} gold</span> · ${matsLine()}`));
  col.appendChild(el('div', 'rule'));
  if (tab === 'salvage') {
    col.appendChild(el('h3', '', 'Break gear down into materials and Arcane Dust'));
    const sj = el('button', 'small', 'Salvage all junk & commons');
    sj.onclick = () => { const list = c.inventory.filter((i) => i.junk || i.rarity === 'common'); for (const it of list) salvage(it); toast(`Salvaged ${list.length} items.`); openSmith(npc, tab); };
    col.appendChild(sj);
    for (const it of c.inventory) {
      const y = salvageYield(it);
      const row = el('div', 'shop-row interactive', `<img src="${itemIcon(it)}" width="38" height="38"><span class="nm ${rarityCls(it)}">${esc(it.name)}</span><span class="pr">${Object.entries(y).map(([k, v]) => `${v} ${MATERIALS_LIST[k].name}`).join(', ')}</span>`);
      bindTip(row, () => itemTooltip(it));
      row.onclick = () => { salvage(it); hideTip(); openSmith(npc, tab); };
      col.appendChild(row);
    }
  } else if (tab === 'upgrade') {
    col.appendChild(el('h3', '', 'Temper gear: each level adds 8% to its base power (max +10)'));
    const items = [...Object.values(c.equip).filter(Boolean), ...c.inventory].filter((i) => i.kind !== 'tome');
    for (const it of items) {
      const cost = upgradeCost(it);
      const costTxt = cost ? `${cost.gold}g + ${Object.entries(cost.mats).map(([k, v]) => `${v} ${MATERIALS_LIST[k].name}`).join(', ')}` : 'Max';
      const eq = Object.values(c.equip).includes(it);
      const row = el('div', 'shop-row interactive', `<img src="${itemIcon(it)}" width="38" height="38"><span class="nm ${rarityCls(it)}">${eq ? '★ ' : ''}${esc(it.name)} ${it.upgrade ? `<span class="gold">+${it.upgrade}</span>` : ''}</span><span class="pr">${costTxt}</span>`);
      bindTip(row, () => itemTooltip(it));
      row.onclick = () => { if (upgrade(it)) { toast(`${it.name} is now +${it.upgrade}.`); } hideTip(); openSmith(npc, tab); };
      col.appendChild(row);
    }
  } else {
    col.appendChild(el('h3', '', 'Forge new gear at your level' + (c.skills.includes('crafting') ? ' · Crafting Mastery: +1 affix' : '')));
    for (const r of CRAFT_RECIPES) {
      const cost = recipeCost(r);
      const row = el('div', 'shop-row', `<span class="nm"><b class="gold" style="font-family:var(--display);font-size:var(--fs-1)">${esc(r.name)}</b> <span class="muted">${esc(r.desc)}</span></span><span class="pr">${cost.gold}g + ${Object.entries(cost.mats).map(([k, v]) => `${v} ${MATERIALS_LIST[k].name}`).join(', ')}</span>`);
      const choices = r.kind === 'weapon' ? Object.keys(WEAPON_TYPES) : r.kind === 'armor' ? ['helm', 'chest', 'gloves', 'legs', 'boots'] : r.kind === 'trinket' ? ['ring', 'amulet'] : [null];
      const bx = el('div', '');
      bx.style.cssText = 'display:flex;gap:3px;flex-wrap:wrap;max-width:420px';
      for (const ch of choices) {
        const b = el('button', 'small', ch ? (WEAPON_TYPES[ch]?.name || ch) : 'Craft');
        b.onclick = () => { const res = craft(r, ch); if (res) toast(res === true ? `${r.name}: done.` : `Forged ${res.name}!`); openSmith(npc, tab); };
        bx.appendChild(b);
      }
      row.appendChild(bx);
      col.appendChild(row);
    }
  }
  body.appendChild(col);
  openModal('smith', w);
}

// ---------------------------------------------------------------- enchanter
let enchSel = null, transSel = [];
export function openEnchanter(npc, tab = 'enchant') {
  closeDialogue();
  const c = G.char;
  const { w, body } = windowFrame(`${npc.name} · Enchanting`, [['enchant', 'Enchant'], ['imbue', 'Imbue'], ['transmute', 'Transmute']], tab, (t) => { enchSel = null; transSel = []; openEnchanter(npc, t); });
  const left = el('div', 'scroll');
  left.style.width = '440px';
  const right = el('div', 'scroll');
  right.style.flex = '1';
  left.appendChild(el('div', 'muted', `<span class="gold">${c.gold} gold</span> · Arcane Dust ${c.materials.dust || 0}`));
  const items = [...Object.values(c.equip).filter(Boolean), ...c.inventory];
  const pool = tab === 'imbue' ? items.filter((i) => i.kind === 'weapon') : tab === 'transmute' ? c.inventory : items;
  for (const it of pool) {
    const on = tab === 'transmute' ? transSel.includes(it) : enchSel === it;
    const row = el('div', 'shop-row interactive', `<img src="${itemIcon(it)}" width="34" height="34"><span class="nm ${rarityCls(it)}">${on ? '▶ ' : ''}${esc(it.name)}</span>`);
    bindTip(row, () => itemTooltip(it));
    row.onclick = () => {
      if (tab === 'transmute') { if (on) transSel = transSel.filter((x) => x !== it); else if (transSel.length < 3) transSel.push(it); }
      else enchSel = it;
      hideTip(); openEnchanter(npc, tab);
    };
    left.appendChild(row);
  }
  if (tab === 'enchant' && enchSel) {
    const cost = enchantCost(enchSel);
    right.innerHTML = `<h3>Reroll one property of</h3><div class="${rarityCls(enchSel)}" style="font-family:var(--display);font-size:var(--fs-1)">${esc(enchSel.name)}</div><div class="muted">Cost: ${cost.gold} gold + ${cost.mats.dust} Arcane Dust per reroll</div><div class="rule"></div>`;
    enchSel.affixes.forEach((a, i) => {
      const b = el('button', '', `Reroll: ${AFFIX[a.id].fmt.replace('{v}', a.v)}`);
      b.style.display = 'block'; b.style.margin = '6px 0';
      b.onclick = () => { if (enchant(enchSel, i)) toast('The enchantment shifts.'); openEnchanter(npc, tab); };
      right.appendChild(b);
    });
    const maxA = RARITY[enchSel.rarity].affixes[1];
    if (enchSel.affixes.length < Math.max(1, maxA)) {
      const b = el('button', 'primary', 'Add a new property');
      b.onclick = () => { if (enchant(enchSel, -1)) toast('A new enchantment takes hold.'); openEnchanter(npc, tab); };
      right.appendChild(b);
    }
  } else if (tab === 'imbue' && enchSel) {
    right.innerHTML = `<h3>Imbue an element into</h3><div class="${rarityCls(enchSel)}" style="font-family:var(--display);font-size:var(--fs-1)">${esc(enchSel.name)}</div><div class="muted">Costs 2 of the matching essence + 2 Arcane Dust. Elemental weapons apply status effects.</div><div class="rule"></div>`;
    for (const [el_, ess] of [['fire', 'ess_fire'], ['frost', 'ess_frost'], ['lightning', 'ess_storm'], ['void', 'ess_void'], ['holy', 'ess_holy'], ['rot', 'ess_rot']]) {
      const b = el('button', '', `${el_} (${c.materials[ess] || 0} essence)`);
      b.style.margin = '4px';
      b.onclick = () => { if (imbueElement(enchSel, el_)) toast(`${enchSel.name} hums with ${el_}.`); openEnchanter(npc, tab); };
      right.appendChild(b);
    }
  } else if (tab === 'transmute') {
    right.innerHTML = `<h3>Transmutation</h3><div>Select three items of the same rarity (Common to Rare). They will become one item of the next rarity.</div><div class="rule"></div><div>${transSel.map((i) => `<div class="${rarityCls(i)}">${esc(i.name)}</div>`).join('') || '<span class="muted">Nothing selected.</span>'}</div>`;
    const b = el('button', 'primary', 'Transmute');
    b.disabled = transSel.length !== 3;
    b.onclick = () => { const it = transmute(transSel); transSel = []; if (it) toast(`Transmuted into ${it.name}!`); openEnchanter(npc, tab); };
    right.appendChild(b);
  } else right.innerHTML = '<div class="muted">Select an item on the left.</div>';
  body.append(left, right);
  openModal('enchanter', w);
}
