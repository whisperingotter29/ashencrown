// NPC conversations and town services (trade, forge, enchanting, stables, quartermasters).
import { G } from '../game.js';
import { el, esc, kc, root, openModal, windowFrame, bindTip, itemCard, hideTip, rarityCls, toast, morph } from './ui.js';
import { itemIcon, simpleIcon } from './icons.js';
import { greeting, RUMORS } from '../data/npcs.js';
import { questDef, questsOffered, startQuest, onTalk, contractsFor, isActive, isDone } from '../systems/quests.js';
import { shopStock, stableStock, salvage, salvageYield, upgrade, upgradeCost, enchant, enchantCost, imbueElement, craft, CRAFT_RECIPES, recipeCost, transmute } from '../systems/crafting.js';
import { addItem, removeItem, sellValue, addGold, INV_SIZE } from '../systems/inventory.js';
import { payBounty, bountyAt, repTier } from '../systems/factions.js';
import { MATERIALS_LIST, AFFIX, RARITY, makeSetPiece, WEAPON_TYPES, CONSUMABLES } from '../data/items.js';
import { FACTIONS, TOWNS, DEEP_TOWNS } from '../data/world.js';
import { SKILLS } from '../data/skills.js';
import { atmo } from '../world/atmosphere.js';
import { saveGame } from '../core/save.js';
import { bus } from '../core/events.js';
import { RNG } from '../core/rng.js';
import { input } from '../core/input.js';
import { compareFor } from './menus.js';

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
    opts.push({ t: `<span class="tag">Quest</span>${esc(def.name)}`, html: true, fn: () => showDialogue(npc, def.intro, [{ t: 'I will see it done.', fn: () => talkTo(npc) }]) });
  }
  // quests offered
  for (const id of questsOffered(npc.id_)) {
    const def = questDef(id);
    opts.push({ t: `<span class="tag new">New</span>${esc(def.name)}${def.kind === 'hidden' ? ' <span class="fate">(hidden fate)</span>' : ''}`, html: true, fn: () => offerQuest(npc, id) });
  }
  // bounty officer contracts
  if (npc.role === 'bounty' && town) {
    for (const id of contractsFor(town.id)) {
      if (G.char.quests[id]) continue;
      const def = questDef(id);
      opts.push({ t: `<span class="tag">Contract</span>${esc(def.name)}`, html: true, fn: () => offerQuest(npc, id) });
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
  const lvlWarn = def.level > G.char.level + 3 ? `<div class="warn">Suggested level ${def.level}. This will be dangerous.</div>` : '';
  showDialogue(npc, `<b>${esc(def.name)}</b><br><br>${esc(def.intro)}${lvlWarn}`, [
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
  const d = el('div', 'dialogue f-card');
  d.innerHTML = `<div class="who f-plate"><span class="wn">${esc(npc.name)}</span>${npc.title ? `<span class="wt">${esc(npc.title)}</span>` : ''}</div><div class="text">${html ? text : esc(text).replace(/\n/g, '<br>')}</div>`;
  const o = el('div', 'opts');
  opts.forEach((op, i) => {
    const b = el('button', 'opt', `<span class="q">${i + 1}</span><span class="ot">${op.html ? op.t : esc(op.t)}</span>`);
    b.onclick = () => op.fn();
    o.appendChild(b);
  });
  d.appendChild(o);
  // already talking: update the box in place (no re-entrance animation, no flicker)
  if (dlg && dlg.node.isConnected) { morph(dlg.node, d); dlg.npc = npc; dlg.opts = opts; }
  else { if (dlg) dlg.node.remove(); root().appendChild(d); dlg = { node: d, npc, opts }; }
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
const CONS_STOCK = ['hp_potion', 'mana_potion', 'stamina_tonic', 'roasted_meat', 'waystone_shard'];
const shop = { npc: null, role: null, sel: null };
const consIcon = (id) => simpleIcon(id === 'waystone_shard' ? 'gem' : 'potion', CONSUMABLES[id].color);
function consPrice(id) { return Math.round(CONSUMABLES[id].value * (1 + G.char.level * 0.05)); }
function consCard(id) {
  const d = CONSUMABLES[id];
  return `<div class="icard"><div class="ic-head"><div class="ic-icon slotf"><img src="${consIcon(id)}" draggable="false"></div><div class="ic-title"><div class="ic-name">${esc(d.name)}</div><div class="ic-type">Consumable · you carry ${G.char.consumables[id] || 0}/${d.stack}</div></div></div><div class="ic-body"><div class="ic-sub">${esc(d.desc)}</div></div></div>`;
}
function buyCons(id) {
  const c = G.char, def = CONSUMABLES[id], price = consPrice(id);
  if (c.gold < price) return toast('Not enough gold.');
  if ((c.consumables[id] || 0) >= def.stack) return toast('You cannot carry more.');
  c.gold -= price;
  c.consumables[id] = (c.consumables[id] || 0) + 1;
  bus.emit('purchase', { id });
}
function buyItem(it) {
  const c = G.char, price = priceOf(it);
  if (c.gold < price) return toast('Not enough gold.');
  if (c.inventory.length >= INV_SIZE) return toast('Your pack is full.');
  c.gold -= price;
  it.sold = true;
  const copy = { ...it, affixes: it.affixes.map((a) => ({ ...a })) };
  delete copy.sold; delete copy.shopPrice;
  addItem(copy, true);
  shop.sel = null;
  toast(`Bought <span class="r-${copy.rarity}">${esc(copy.name)}</span>`, 'loot', 2200);
  bus.emit('purchase', { item: copy });
}
function sellItem(it) {
  removeItem(it.uid);
  addGold(sellValue(it));
  if (shop.sel?.uid === it.uid) shop.sel = null;
  bus.emit('sold', { item: it });
}

export function openShop(npc, role) {
  closeDialogue();
  if (shop.npc !== npc || shop.role !== role) { shop.npc = npc; shop.role = role; shop.sel = null; }
  const c = G.char;
  const { w, body } = windowFrame(role === 'tome' ? 'Spellbooks' : 'Trade', null, null, null, { id: 'shop', cls: 'shop-win', hints: [['Click', 'Inspect'], ['Dbl Click', 'Buy / sell'], ['Right Click', 'Quick'], ['Esc', 'Leave']] });
  const stock = shopStock(npc.town, role, npc.sub);
  const wrap = el('div', 'shop');
  const reopen = () => openShop(npc, role);
  // ------------------------------------------------ merchant wares
  const left = el('div', 'shop-side');
  left.appendChild(el('div', 'shop-h', `<span>${esc(npc.name)}</span><span class="sec-sub">${role === 'tome' ? 'spellbooks' : 'wares'}</span>`));
  const lw = el('div', 'shop-grid f-well scroll');
  const lg = el('div', 'grid');
  const cells = [];
  if (role === 'merchant') for (const id of CONS_STOCK) cells.push({ cons: id });
  for (const it of stock) if (!it.sold) cells.push({ item: it });
  for (const x of cells) {
    let cell;
    if (x.cons) {
      const price = consPrice(x.cons), on = shop.sel?.cons === x.cons;
      cell = el('div', 'cell slotf' + (on ? ' sel' : ''), `<img class="ic" src="${consIcon(x.cons)}" draggable="false"><span class="price${c.gold < price ? ' no' : ''}">${price}g</span>`);
      bindTip(cell, () => (on ? '' : consCard(x.cons)));
      cell.onclick = () => { shop.sel = { side: 'buy', cons: x.cons }; reopen(); };
      cell.ondblclick = cell.oncontextmenu = (e) => { e.preventDefault(); buyCons(x.cons); reopen(); };
    } else {
      const it = x.item, price = priceOf(it), on = shop.sel?.uid === it.uid;
      cell = el('div', `cell slotf rf-${it.rarity}${on ? ' sel' : ''}`, `<img class="ic" src="${itemIcon(it)}" draggable="false"><span class="price${c.gold < price ? ' no' : ''}">${price}g</span>`);
      bindTip(cell, () => (on ? '' : itemCard(it, { compare: compareFor(it), icon: itemIcon(it) })));
      cell.onclick = () => { shop.sel = { side: 'buy', uid: it.uid, item: it }; reopen(); };
      cell.ondblclick = cell.oncontextmenu = (e) => { e.preventDefault(); hideTip(); buyItem(it); reopen(); };
    }
    lg.appendChild(cell);
  }
  for (let i = cells.length; i < 24; i++) lg.appendChild(el('div', 'cell slotf empty'));
  lw.appendChild(lg);
  left.appendChild(lw);
  wrap.appendChild(left);
  // ------------------------------------------------ detail + action
  const mid = el('div', 'shop-mid');
  const det = el('div', 'detail f-card');
  const sel = shop.sel;
  const act = el('div', 'detail-acts');
  if (sel?.cons) {
    det.innerHTML = consCard(sel.cons);
    const price = consPrice(sel.cons);
    const b = el('button', 'primary', `Buy · ${price}g`);
    b.disabled = c.gold < price;
    b.onclick = () => { buyCons(sel.cons); reopen(); };
    act.appendChild(b);
    det.appendChild(act);
  } else if (sel?.item && (sel.side === 'sell' ? c.inventory.includes(sel.item) : !sel.item.sold)) {
    const it = sel.item;
    det.innerHTML = itemCard(it, { compare: compareFor(it), icon: itemIcon(it) });
    if (sel.side === 'buy') {
      const price = priceOf(it);
      const b = el('button', 'primary', `Buy · ${price}g`);
      b.disabled = c.gold < price;
      b.onclick = () => { buyItem(it); reopen(); };
      act.appendChild(b);
    } else {
      const b = el('button', 'primary', `Sell · ${sellValue(it)}g`);
      b.onclick = () => { sellItem(it); reopen(); };
      act.appendChild(b);
      const j = el('button', '', it.junk ? 'Unmark junk' : 'Mark junk');
      j.onclick = () => { it.junk = !it.junk; reopen(); };
      act.appendChild(j);
    }
    det.appendChild(act);
  } else {
    shop.sel = null;
    det.classList.add('empty');
    det.innerHTML = `<div class="detail-empty"><b>${role === 'tome' ? 'Browse the shelves' : 'What catches your eye?'}</b><span>Click a ware to inspect it, or an item in your bag to see what it fetches. Double-click to buy or sell at once.</span></div>`;
  }
  mid.appendChild(det);
  mid.appendChild(el('div', 'gold-pill shop-gold', `<img class="mini" src="${simpleIcon('gem', '#e8c35a')}" draggable="false"><b>${c.gold}</b><span>gold</span>`));
  wrap.appendChild(mid);
  // ------------------------------------------------ your bag
  const right = el('div', 'shop-side');
  const junk = c.inventory.filter((i) => i.junk || i.rarity === 'common');
  right.appendChild(el('div', 'shop-h', `<span>Your bag</span><span class="sec-sub">${c.inventory.length}/${INV_SIZE}</span>`));
  const rw = el('div', 'shop-grid f-well scroll');
  const rg = el('div', 'grid');
  for (let i = 0; i < Math.max(24, Math.ceil(c.inventory.length / 6) * 6); i++) {
    const it = c.inventory[i];
    if (!it) { rg.appendChild(el('div', 'cell slotf empty')); continue; }
    const on = shop.sel?.uid === it.uid;
    const cell = el('div', `cell slotf rf-${it.rarity}${on ? ' sel' : ''}`, `<img class="ic" src="${itemIcon(it)}" draggable="false">${it.junk ? '<i class="junk"></i>' : ''}<span class="price">${sellValue(it)}g</span>`);
    bindTip(cell, () => (on ? '' : itemCard(it, { compare: compareFor(it), icon: itemIcon(it) })));
    cell.onclick = () => { shop.sel = { side: 'sell', uid: it.uid, item: it }; reopen(); };
    cell.ondblclick = cell.oncontextmenu = (e) => { e.preventDefault(); hideTip(); sellItem(it); reopen(); };
    rg.appendChild(cell);
  }
  rw.appendChild(rg);
  right.appendChild(rw);
  const sj = el('button', 'small', `Sell junk & commons (${junk.length})`);
  sj.disabled = !junk.length;
  sj.onclick = () => { let g = 0; for (const it of junk) { g += sellValue(it); removeItem(it.uid); } addGold(g); toast(`Sold ${junk.length} items for ${g} gold.`); shop.sel = null; reopen(); };
  right.appendChild(sj);
  wrap.appendChild(right);
  body.appendChild(wrap);
  openModal('shop', w);
}

function openStable(npc) {
  closeDialogue();
  const c = G.char;
  const { w, body } = windowFrame('Stables', null, null, null, { id: 'stable', cls: 'svc-win' });
  const col = el('div', 'svc f-sheet scroll');
  col.appendChild(el('div', 'sec-h', `<span>${esc(npc.name)}</span><span class="sec-sub">${c.gold} gold · ${kc('G')} to ride</span>`));
  for (const m of stableStock(npc.town)) {
    const owned = c.mounts.includes(m.id);
    const row = el('div', 'shop-row' + (c.activeMount === m.id ? ' on' : ''), `<span class="nm"><b>${esc(m.name)}</b> <span class="muted">${esc(m.desc)} · speed ${m.speed}</span></span><span class="pr">${owned ? (c.activeMount === m.id ? 'Riding' : 'Owned') : m.price + 'g'}</span>`);
    row.onclick = () => { if (owned) { c.activeMount = m.id; toast(`${esc(m.name)} will answer your call.`); openStable(npc); return; } if (c.gold < m.price) return toast('Not enough gold.'); c.gold -= m.price; c.mounts.push(m.id); c.activeMount = m.id; toast(`You bought ${esc(m.name)}! Press G to ride.`); openStable(npc); };
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
  const { w, body } = windowFrame('Quartermaster', null, null, null, { id: 'quartermaster', cls: 'svc-win' });
  const col = el('div', 'svc f-sheet scroll');
  col.appendChild(el('div', 'sec-h', `<span>${esc(FACTIONS[f].name)}</span><span class="sec-sub">${repTier(rep).name} (${rep}) · set pieces at Honored (600)</span>`));
  const rng = new RNG(c.level * 7 + f.length);
  for (const slot of ['helm', 'chest', 'gloves', 'legs', 'boots']) {
    const it = makeSetPiece(setId, slot, c.level, rng);
    const price = Math.round(it.value * 2.2);
    const ok = rep >= 600;
    const row = el('div', 'shop-row', `<img src="${itemIcon(it)}" draggable="false"><span class="nm ${rarityCls(it)}">${esc(it.name)}</span><span class="pr">${ok ? price + 'g' : 'Honored'}</span>`);
    bindTip(row, () => itemCard(it, { compare: c.equip[slot], icon: itemIcon(it) }));
    row.onclick = () => { if (!ok) return toast('Your standing is too low.'); if (c.gold < price) return toast('Not enough gold.'); c.gold -= price; addItem(it); hideTip(); toast(`Purchased ${esc(it.name)}.`); };
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
  const { w, body } = windowFrame('Forge', [['salvage', 'Salvage'], ['upgrade', 'Upgrade'], ['craft', 'Craft']], tab, (t) => openSmith(npc, t), { id: 'smith', cls: 'svc-win' });
  const col = el('div', 'svc f-sheet scroll');
  col.dataset.key = 'smith-' + tab;
  const matsLine = () => Object.entries(c.materials).map(([k, v]) => `<span style="color:${MATERIALS_LIST[k]?.color}">◆</span> ${MATERIALS_LIST[k]?.name} ${v}`).join(' · ') || 'no materials';
  col.appendChild(el('div', 'svc-mats', `<span class="gold">${c.gold} gold</span> · ${matsLine()}`));
  if (tab === 'salvage') {
    const h = el('div', 'sec-h', '<span>Salvage</span><span class="sec-sub">break gear down into materials and Arcane Dust</span>');
    col.appendChild(h);
    const sj = el('button', 'small', 'Salvage all junk & commons');
    sj.onclick = () => { const list = c.inventory.filter((i) => i.junk || i.rarity === 'common'); for (const it of list) salvage(it); toast(`Salvaged ${list.length} items.`); openSmith(npc, tab); };
    col.appendChild(sj);
    for (const it of c.inventory) {
      const y = salvageYield(it);
      const row = el('div', 'shop-row', `<img src="${itemIcon(it)}" draggable="false"><span class="nm ${rarityCls(it)}">${esc(it.name)}</span><span class="pr">${Object.entries(y).map(([k, v]) => `${v} ${MATERIALS_LIST[k].name}`).join(', ')}</span>`);
      bindTip(row, () => itemCard(it, { icon: itemIcon(it) }));
      row.onclick = () => { salvage(it); hideTip(); openSmith(npc, tab); };
      col.appendChild(row);
    }
  } else if (tab === 'upgrade') {
    col.appendChild(el('div', 'sec-h', '<span>Temper</span><span class="sec-sub">each level adds 8% to base power (max +10)</span>'));
    const equipped = [...Object.entries(c.equip).filter(([s, x]) => x && s !== 'mainhand' && s !== 'tome').map(([, x]) => x), ...(c.loadout || []).filter(Boolean)];
    const items = [...equipped, ...c.inventory].filter((i) => i.kind !== 'tome');
    for (const it of items) {
      const cost = upgradeCost(it);
      const costTxt = cost ? `${cost.gold}g + ${Object.entries(cost.mats).map(([k, v]) => `${v} ${MATERIALS_LIST[k].name}`).join(', ')}` : 'Max';
      const eq = equipped.includes(it);
      const row = el('div', 'shop-row', `<img src="${itemIcon(it)}" draggable="false"><span class="nm ${rarityCls(it)}">${eq ? '★ ' : ''}${esc(it.name)} ${it.upgrade ? `<b>+${it.upgrade}</b>` : ''}</span><span class="pr">${costTxt}</span>`);
      bindTip(row, () => itemCard(it, { icon: itemIcon(it) }));
      row.onclick = () => { if (upgrade(it)) { toast(`${esc(it.name)} is now +${it.upgrade}.`); } hideTip(); openSmith(npc, tab); };
      col.appendChild(row);
    }
  } else {
    col.appendChild(el('div', 'sec-h', `<span>Forge</span><span class="sec-sub">new gear at your level${c.skills.includes('crafting') ? ' · Crafting Mastery: +1 affix' : ''}</span>`));
    for (const r of CRAFT_RECIPES) {
      const cost = recipeCost(r);
      const row = el('div', 'shop-row craft', `<span class="nm"><b>${esc(r.name)}</b> <span class="muted">${esc(r.desc)}</span><br><span class="muted">${cost.gold}g + ${Object.entries(cost.mats).map(([k, v]) => `${v} ${MATERIALS_LIST[k].name}`).join(', ')}</span></span>`);
      const choices = r.kind === 'weapon' ? Object.keys(WEAPON_TYPES) : r.kind === 'armor' ? ['helm', 'chest', 'gloves', 'legs', 'boots'] : r.kind === 'trinket' ? ['ring', 'amulet'] : [null];
      const bx = el('div', 'chips craft-opts');
      for (const ch of choices) {
        const b = el('button', 'chip', ch ? (WEAPON_TYPES[ch]?.name || ch) : 'Craft');
        b.onclick = (e) => { e.stopPropagation(); const res = craft(r, ch); if (res) toast(res === true ? `${esc(r.name)}: done.` : `Forged ${esc(res.name)}!`); openSmith(npc, tab); };
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
  const { w, body } = windowFrame('Enchanting', [['enchant', 'Enchant'], ['imbue', 'Imbue'], ['transmute', 'Transmute']], tab, (t) => { enchSel = null; transSel = []; openEnchanter(npc, t); }, { id: 'enchanter', cls: 'svc-win' });
  const left = el('div', 'shop-col f-sheet scroll');
  left.dataset.key = 'el-' + tab;
  const right = el('div', 'svc f-sheet scroll');
  right.dataset.key = 'er-' + tab;
  left.appendChild(el('div', 'svc-mats', `<span class="gold">${c.gold} gold</span> · Arcane Dust ${c.materials.dust || 0}`));
  const equipped = [...Object.entries(c.equip).filter(([s, x]) => x && s !== 'mainhand' && s !== 'tome').map(([, x]) => x), ...(c.loadout || []).filter(Boolean)];
  const items = [...equipped, ...c.inventory];
  const pool = tab === 'imbue' ? items.filter((i) => i.kind === 'weapon') : tab === 'transmute' ? c.inventory : items;
  for (const it of pool) {
    const on = tab === 'transmute' ? transSel.includes(it) : enchSel === it;
    const row = el('div', 'shop-row' + (on ? ' on' : ''), `<img src="${itemIcon(it)}" draggable="false"><span class="nm ${rarityCls(it)}">${esc(it.name)}</span>`);
    bindTip(row, () => (on ? '' : itemCard(it, { icon: itemIcon(it) })));
    row.onclick = () => {
      if (tab === 'transmute') { if (on) transSel = transSel.filter((x) => x !== it); else if (transSel.length < 3) transSel.push(it); }
      else enchSel = it;
      hideTip(); openEnchanter(npc, tab);
    };
    left.appendChild(row);
  }
  if (tab === 'enchant' && enchSel) {
    const cost = enchantCost(enchSel);
    right.innerHTML = `<div class="sec-h"><span>Reroll a property</span></div><div class="ench-n ${rarityCls(enchSel)}">${esc(enchSel.name)}</div><div class="muted">Cost: ${cost.gold} gold + ${cost.mats.dust} Arcane Dust per reroll</div>`;
    enchSel.affixes.forEach((a, i) => {
      const b = el('button', 'wide', `Reroll: ${AFFIX[a.id].fmt.replace('{v}', a.v)}`);
      b.onclick = () => { if (enchant(enchSel, i)) toast('The enchantment shifts.'); openEnchanter(npc, tab); };
      right.appendChild(b);
    });
    const maxA = RARITY[enchSel.rarity].affixes[1];
    if (enchSel.affixes.length < Math.max(1, maxA)) {
      const b = el('button', 'primary wide', 'Add a new property');
      b.onclick = () => { if (enchant(enchSel, -1)) toast('A new enchantment takes hold.'); openEnchanter(npc, tab); };
      right.appendChild(b);
    }
  } else if (tab === 'imbue' && enchSel) {
    right.innerHTML = `<div class="sec-h"><span>Imbue an element</span></div><div class="ench-n ${rarityCls(enchSel)}">${esc(enchSel.name)}</div><div class="muted">Costs 2 of the matching essence + 2 Arcane Dust. Elemental weapons apply status effects and upgrade their abilities.</div>`;
    const g = el('div', 'chips');
    for (const [el_, ess] of [['fire', 'ess_fire'], ['frost', 'ess_frost'], ['lightning', 'ess_storm'], ['void', 'ess_void'], ['holy', 'ess_holy'], ['rot', 'ess_rot']]) {
      const b = el('button', 'chip', `${el_} (${c.materials[ess] || 0})`);
      b.onclick = () => { if (imbueElement(enchSel, el_)) toast(`${esc(enchSel.name)} hums with ${el_}.`); openEnchanter(npc, tab); };
      g.appendChild(b);
    }
    right.appendChild(g);
  } else if (tab === 'transmute') {
    right.innerHTML = `<div class="sec-h"><span>Transmutation</span></div><div class="muted">Select three items of the same rarity (Common to Rare). They become one item of the next rarity.</div><div class="ink-rule"></div><div>${transSel.map((i) => `<div class="${rarityCls(i)}">${esc(i.name)}</div>`).join('') || '<span class="muted">Nothing selected.</span>'}</div>`;
    const b = el('button', 'primary wide', 'Transmute');
    b.disabled = transSel.length !== 3;
    b.onclick = () => { const it = transmute(transSel); transSel = []; if (it) toast(`Transmuted into ${esc(it.name)}!`); openEnchanter(npc, tab); };
    right.appendChild(b);
  } else right.innerHTML = '<div class="detail-empty"><b>Select an item</b><span>Pick something on the left to work on.</span></div>';
  body.append(left, right);
  openModal('enchanter', w);
}
