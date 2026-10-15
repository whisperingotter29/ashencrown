// Inventory/character, skills & tomes, journal & codex, world map, pause/settings, death screen.
import { G } from '../game.js';
import { el, esc, root, openModal, closeModal, modalName, windowFrame, bindTip, itemTooltip, showTip, hideTip, rarityCls, toast, pxTitle } from './ui.js';
import { itemIcon, skillIcon, simpleIcon } from './icons.js';
import { equip, unequip, removeItem, slotFor, useConsumable, sellValue, itemPower, INV_SIZE, addGold } from '../systems/inventory.js';
import { RARITY, MATERIALS_LIST, CONSUMABLES, LEGENDARIES, SETS } from '../data/items.js';
import { RACE_BY_ID } from '../data/races.js';
import { CLASS_BY_ID } from '../data/classes.js';
import { TOMES, SPELLS, TOME_TIERS } from '../data/tomes.js';
import { SKILLS, COMBOS } from '../data/skills.js';
import { MOUNTS } from '../data/mounts.js';
import { availableAbilities, abilityDef } from '../systems/abilities.js';
import { xpToNext } from '../systems/stats.js';
import { questDef, objectiveProgress, isActive } from '../systems/quests.js';
import { FACTIONS, TOWNS, DEEP_TOWNS, DUNGEONS, WAYSTONES, SHRINES, BIOMES, WORLD_BOSSES, LANDMARKS } from '../data/world.js';
import { repTier } from '../systems/factions.js';
import { MAP, fogMask, FOG_N, isRevealed } from '../world/mapdata.js';
import { refreshSkillbar } from './hud.js';
import { bus } from '../core/events.js';
import { trackedObjectiveMarkers } from '../systems/quests.js';
import { R, applySettings } from '../render/renderer.js';
import { saveGame, saveSettings } from '../core/save.js';
import { dangerLevel } from '../world/terrainGen.js';

const EQUIP_LAYOUT = [
  ['helm', 1, 1, 'Helm'], ['chest', 2, 1, 'Chest'], ['gloves', 3, 1, 'Gloves'], ['legs', 4, 1, 'Legs'], ['boots', 5, 1, 'Boots'],
  ['amulet', 1, 3, 'Amulet'], ['mainhand', 2, 3, 'Weapon'], ['offhand', 3, 3, 'Offhand'], ['ring1', 4, 3, 'Ring'], ['ring2', 5, 3, 'Ring'],
];

// ===================================================================== INVENTORY
export function openInventory(tab = 'inv') {
  const { w, body } = windowFrame('Character', [['inv', 'Inventory'], ['stats', 'Attributes']], tab, (t) => openInventory(t));
  const c = G.char, p = G.player;
  // paper doll
  const doll = el('div', 'paperdoll');
  for (const [slot, row, col, label] of EQUIP_LAYOUT) {
    const s = el('div', 'eslot interactive');
    s.style.gridRow = row; s.style.gridColumn = col;
    const it = c.equip[slot];
    s.innerHTML = it ? `<div class="item-ic"><img src="${itemIcon(it)}" width="52" height="52">${it.upgrade ? `<span class="up">+${it.upgrade}</span>` : ''}</div>` : `<span class="lbl">${label}</span>`;
    if (it) { s.classList.add('bd-' + it.rarity); bindTip(s, () => itemTooltip(it)); }
    s.onclick = () => { if (it) { unequip(slot); openInventory(tab); } };
    doll.appendChild(s);
  }
  const race = RACE_BY_ID[c.race], cls = CLASS_BY_ID[c.cls];
  const fig = el('div', 'doll-figure', `<div class="big">${c.level}</div><div class="race">${esc(race.name)}<br>${esc(cls.name)}</div><div class="muted" style="font-size:var(--fs-1);margin-top:6px">${c.title ? esc(c.title) : ''}</div><div class="rule" style="width:80%"></div><div style="font-size:var(--fs-1)">XP ${c.xp} / ${xpToNext(c.level)}</div><div style="font-size:var(--fs-1)" class="gold">${c.gold} gold</div>`);
  fig.style.gridRow = '1 / span 5';
  doll.appendChild(fig);
  const tomeS = el('div', 'eslot interactive');
  tomeS.style.gridRow = 6; tomeS.style.gridColumn = '1 / span 3'; tomeS.style.width = '100%';
  const tome = c.equip.tome;
  tomeS.innerHTML = tome ? `<div class="item-ic"><img src="${itemIcon(tome)}" width="52" height="52"></div><div style="font-size:var(--fs-1);margin-left:8px" class="${rarityCls(tome)}">${esc(tome.name)}</div>` : '<span class="lbl" style="position:static">Spellbook (required to cast)</span>';
  if (tome) bindTip(tomeS, () => itemTooltip(tome));
  tomeS.onclick = () => { if (tome) { unequip('tome'); openInventory(tab); } };
  doll.appendChild(tomeS);
  body.appendChild(doll);

  if (tab === 'inv') {
    const mid = el('div', 'scroll');
    mid.style.flex = '1';
    mid.appendChild(el('h3', '', `Pack (${c.inventory.length}/${INV_SIZE}) · Click to equip · Right-click to mark junk · Shift+Right-click to destroy`));
    const grid = el('div', 'grid');
    grid.style.marginTop = '8px';
    const sorted = c.inventory;
    for (let i = 0; i < INV_SIZE; i++) {
      const it = sorted[i];
      const cell = el('div', 'cell interactive');
      if (it) {
        const cur = c.equip[slotFor(it)];
        const better = cur ? itemPower(it) > itemPower(cur) : it.kind !== 'tome' || !c.equip.tome;
        cell.classList.add('bd-' + it.rarity);
        cell.innerHTML = `<div class="item-ic ${better && it.req <= c.level ? 'better' : ''}"><img src="${itemIcon(it)}" width="48" height="48">${it.upgrade ? `<span class="up">+${it.upgrade}</span>` : ''}<span class="lv">${it.ilvl}</span>${it.req > c.level ? '<div class="bad"></div>' : ''}${it.junk ? '<div class="bad" style="background:rgba(0,0,0,0.55)"></div>' : ''}</div>`;
        bindTip(cell, () => itemTooltip(it, c.equip[slotFor(it)]) + (it.junk ? '<div class="muted">Marked as junk</div>' : ''));
        cell.onclick = () => { hideTip(); if (equip(it)) openInventory(tab); };
        cell.oncontextmenu = (e) => {
          e.preventDefault();
          if (e.shiftKey) { removeItem(it.uid); toast(`Destroyed ${it.name}.`); }
          else it.junk = !it.junk;
          hideTip(); openInventory(tab);
        };
      }
      grid.appendChild(cell);
    }
    mid.appendChild(grid);
    // consumables & materials
    mid.appendChild(el('div', 'rule'));
    mid.appendChild(el('h3', '', 'Consumables'));
    const cons = el('div', 'mats');
    for (const [id, n] of Object.entries(c.consumables)) {
      if (!n) continue;
      const b = el('div', 'mat interactive', `<span style="color:${CONSUMABLES[id].color}">●</span> ${esc(CONSUMABLES[id].name)} × ${n}`);
      b.style.cursor = 'pointer';
      bindTip(b, () => `<div class="tname">${esc(CONSUMABLES[id].name)}</div><div>${esc(CONSUMABLES[id].desc)}</div><div class="muted">Click to use</div>`);
      b.onclick = () => { useConsumable(id); openInventory(tab); };
      cons.appendChild(b);
    }
    mid.appendChild(cons);
    mid.appendChild(el('h3', '', 'Materials'));
    const mats = el('div', 'mats');
    for (const [id, n] of Object.entries(c.materials)) mats.appendChild(el('div', 'mat', `<span style="color:${MATERIALS_LIST[id]?.color}">◆</span> ${esc(MATERIALS_LIST[id]?.name || id)} × ${n}`));
    if (!Object.keys(c.materials).length) mats.appendChild(el('div', 'muted', 'None yet. Slain foes, chests and salvage yield materials.'));
    mid.appendChild(mats);
    // mounts
    if (c.mounts.length) {
      mid.appendChild(el('h3', '', 'Mounts (R to summon)'));
      const mm = el('div', 'mats');
      for (const id of c.mounts) {
        const b = el('div', 'mat interactive', `${c.activeMount === id ? '★ ' : ''}${esc(MOUNTS[id].name)} <span class="muted">(${MOUNTS[id].speed} speed)</span>`);
        b.style.cursor = 'pointer';
        b.onclick = () => { c.activeMount = id; openInventory(tab); };
        mm.appendChild(b);
      }
      mid.appendChild(mm);
    }
    body.appendChild(mid);
  } else {
    body.appendChild(statsColumn(true));
    const right = el('div', 'scroll');
    right.style.flex = '1';
    const race = RACE_BY_ID[c.race];
    right.innerHTML = `<h3>Racial Traits: ${esc(race.name)}</h3>${race.traits.map((t) => `<div style="margin:6px 0"><b class="gold" style="font-family:var(--display);font-size:var(--fs-1)">${esc(t.name)}</b> <span>${esc(t.desc)}</span></div>`).join('')}<div class="rule"></div><h3>Class: ${esc(cls.name)}</h3><div style="margin:6px 0">${esc(cls.desc)}</div><div class="muted">${esc(cls.mechanic)}</div><div style="margin-top:8px"><b class="gold" style="font-family:var(--display);font-size:var(--fs-1)">Q · ${esc(cls.signature.name)}</b> ${esc(cls.signature.desc)}</div>`;
    if (c.rareFate) right.innerHTML += `<div class="rule"></div><h3 style="color:#ff9a50">Hidden Fate: ${esc(c.rareFate.title)}</h3><div style="">${esc(c.rareFate.desc)}</div>`;
    if (c.fateLocked) right.innerHTML += `<div class="rule"></div><div class="gold">✦ Fate Sealed: you accepted the dice without question.</div>`;
    if (c.fateScar) right.innerHTML += `<div class="rule"></div><div style="color:#ff8060">✦ Fate Scar: you defied the dice. -10% max health.</div>`;
    if (c.titles.length) {
      right.innerHTML += `<div class="rule"></div><h3>Titles</h3>`;
      const tl = el('div', 'mats');
      for (const t of c.titles) { const b = el('div', 'mat interactive', (c.title === t ? '★ ' : '') + esc(t)); b.style.cursor = 'pointer'; b.onclick = () => { c.title = t; openInventory(tab); }; tl.appendChild(b); }
      right.appendChild(tl);
    }
    body.appendChild(right);
  }
  openModal('inventory', w);
}

function statsColumn(alloc) {
  const c = G.char, p = G.player, d = p.derived;
  const col = el('div', 'stats-col scroll');
  col.appendChild(el('h3', '', `Attributes${c.statPoints ? ` · <span class="gold">${c.statPoints} to spend</span>` : ''}`));
  const names = { str: 'Strength', dex: 'Dexterity', int: 'Intellect', vit: 'Vitality', wil: 'Willpower' };
  const tips = { str: 'Melee weapon damage (swords, maces, greatswords, halberds).', dex: 'Bow, dagger & spear damage, critical chance, stamina.', int: 'Spell power, mana, staff & wand damage.', vit: 'Maximum health and some armor.', wil: 'Mana regeneration, resistances.' };
  for (const k of ['str', 'dex', 'int', 'vit', 'wil']) {
    const row = el('div', 'stat-row', `<span>${names[k]}</span><span><b>${d.stats[k]}</b></span>`);
    bindTip(row, () => `<div class="tname gold">${names[k]}</div><div>${tips[k]}</div>`);
    if (alloc && c.statPoints > 0) {
      const b = el('button', 'small', '+');
      b.onclick = (e) => { e.stopPropagation(); c.stats[k]++; c.statPoints--; p.refreshStats(); openInventory('stats'); };
      row.lastChild.appendChild(b);
    }
    col.appendChild(row);
  }
  col.appendChild(el('div', 'rule'));
  const rows = [
    ['Health', `${Math.ceil(p.hp)} / ${p.maxHp}`], ['Mana', `${Math.floor(p.mana)} / ${p.maxMana}`], ['Stamina', p.maxStamina],
    ['Weapon damage', Math.round(d.weaponDmg)], ['Spell power', `+${Math.round(d.spellPower)}%`], ['Armor', d.armor],
    ['Critical chance', `${d.critChance.toFixed(1)}%`], ['Critical damage', `+${d.critDmg}%`], ['Attack speed', `+${d.atkSpeed}%`], ['Movement', `+${d.moveSpeed}%`],
    ['Block', d.hasShield ? `${Math.round(d.block * 100)}%` : '40% (weapon)'], ['Parry window', `${(d.parryWindow * 1000).toFixed(0)}ms`],
    ['Fire res.', `${Math.round(d.res.fire)}%`], ['Frost res.', `${Math.round(d.res.frost)}%`], ['Lightning res.', `${Math.round(d.res.lightning)}%`], ['Void res.', `${Math.round(d.res.void)}%`], ['Rot res.', `${Math.round(d.res.rot)}%`],
    ['Mana regen', `${d.manaRegen.toFixed(1)}/s`], ['Cooldown reduction', `${d.cdr}%`], ['Magic find', `+${d.magicFind}%`], ['Gold find', `+${d.goldFind}%`], ['Experience', `+${d.xpPct}%`],
  ];
  for (const [k, v] of rows) col.appendChild(el('div', 'stat-row', `<span>${k}</span><b>${v}</b>`));
  const sets = Object.entries(d.sets);
  if (sets.length) { col.appendChild(el('div', 'rule')); for (const [s, n] of sets) col.appendChild(el('div', 'stat-row', `<span>${esc(SETS[s].name)}</span><b>${n}/5</b>`)); }
  return col;
}

// ===================================================================== SKILLS
let pendingAbility = null;
export function openSkills() {
  const { w, body } = windowFrame('Skills & Spellbooks');
  const c = G.char, p = G.player, d = p.derived;
  const left = el('div', 'scroll');
  left.style.flex = '1';
  // bar builder
  left.appendChild(el('h3', '', 'Skill bar · click an ability, then a slot (click a slot to clear)'));
  const bb = el('div', 'barbuild');
  c.skillBar.forEach((id, i) => {
    const s = el('div', 'slot interactive', `<span class="key">${i + 1}</span><div class="ic"></div>`);
    if (id) { const a = abilityDef(id); if (a) s.querySelector('.ic').innerHTML = `<img src="${skillIcon(a.def, a.def.element)}" width="42" height="42">`; bindTip(s, () => `<div class="tname gold">${esc(a?.def.name)}</div><div>${esc(a?.def.desc)}</div>`); }
    s.style.cursor = 'pointer';
    s.onclick = () => {
      if (pendingAbility) { const prev = c.skillBar.indexOf(pendingAbility); if (prev >= 0) c.skillBar[prev] = null; c.skillBar[i] = pendingAbility; pendingAbility = null; }
      else c.skillBar[i] = null;
      refreshSkillbar(); hideTip(); openSkills();
    };
    bb.appendChild(s);
  });
  left.appendChild(bb);
  // tome
  const t = d.tome;
  left.appendChild(el('div', 'rule'));
  if (t) {
    const used = c.skillBar.filter((x) => x && SPELLS[x]).length;
    left.appendChild(el('h3', '', `${esc(TOMES[t.id].name)} · Tier ${TOME_TIERS[t.tier]} · spell slots ${used}/${d.spellSlots}`));
  } else left.appendChild(el('h3', '', 'No spellbook equipped: you cannot cast spells. Find tomes in dungeons, from bosses, faction masters and quests.'));
  const list = el('div', 'skill-list');
  list.style.marginTop = '8px';
  const avail = availableAbilities(c, d);
  const card = (id, def, kind, known, extra = '') => {
    const cdv = el('div', 'skill-card interactive' + (known ? '' : ' unknown') + (pendingAbility === id ? ' on' : '') + (c.skillBar.includes(id) ? ' on' : ''));
    cdv.innerHTML = `<div class="sic"><img src="${skillIcon(def, def.element)}" width="40" height="40"></div><div><div class="sname">${esc(def.name)} <span class="muted" style="font-size:var(--fs-1)">${kind}</span></div><div class="sdesc">${esc(def.desc)}</div>${extra}</div>`;
    if (known && def.type !== 'passive') cdv.onclick = () => { pendingAbility = id; openSkills(); };
    return cdv;
  };
  if (t) for (const s of TOMES[t.id].spells) {
    const known = s.tier <= t.tier;
    list.appendChild(card(s.id, s, `SPELL T${s.tier}`, known, known ? `<div class="src">${s.hpCost ? Math.round(s.hpCost * 100) + '% health' : s.cost + ' mana'} · ${s.cd}s</div>` : `<div class="src">Requires a tier ${s.tier} ${esc(TOMES[t.id].name)}</div>`));
  }
  left.appendChild(list);
  left.appendChild(el('div', 'rule'));
  left.appendChild(el('h3', '', 'Martial skills · earned from trainers, rivals, relics and quests'));
  const list2 = el('div', 'skill-list');
  list2.style.marginTop = '8px';
  for (const sk of Object.values(SKILLS)) {
    const known = c.skills.includes(sk.id);
    list2.appendChild(card(sk.id, sk, sk.type === 'passive' ? 'PASSIVE' : 'SKILL', known, `<div class="src">${esc(sk.source)}</div>`));
  }
  left.appendChild(list2);
  left.appendChild(el('div', 'rule'));
  left.appendChild(el('h3', '', 'Combo skills · a martial skill plus the right spellbook'));
  const list3 = el('div', 'skill-list');
  list3.style.marginTop = '8px';
  for (const cb of COMBOS) {
    const known = avail.some((a) => a.id === cb.id) || (cb.type === 'passive' && t?.id === cb.tome && cb.skill.some((s) => c.skills.includes(s)));
    list3.appendChild(card(cb.id, cb, cb.type === 'passive' ? 'COMBO · PASSIVE' : 'COMBO', known, `<div class="src">${esc(TOMES[cb.tome].name)} + ${cb.skill.map((s) => esc(SKILLS[s].name)).join(' or ')}</div>`));
  }
  left.appendChild(list3);
  body.appendChild(left);
  openModal('skills', w);
}

// ===================================================================== JOURNAL
let journalSel = null;
export function openJournal(tab = 'quests') {
  const { w, body } = windowFrame('Journal', [['quests', 'Quests'], ['codex', 'Codex'], ['factions', 'Factions']], tab, (t) => openJournal(t));
  const c = G.char;
  if (tab === 'quests') {
    const ql = el('div', 'qlist scroll');
    const active = c.questOrder.filter((id) => c.quests[id] && !c.quests[id].done);
    const done = c.questOrder.filter((id) => c.quests[id]?.done);
    if (!journalSel || !c.quests[journalSel]) journalSel = c.trackedQuest || active[0] || done[0];
    for (const [label, ids] of [['Active', active], ['Completed', done]]) {
      if (!ids.length) continue;
      ql.appendChild(el('h3', '', label));
      for (const id of ids) {
        const def = questDef(id);
        if (!def) continue;
        const it = el('div', 'qitem interactive' + (id === journalSel ? ' on' : '') + (c.quests[id].done ? ' done' : ''), `<div class="qk">${def.kind}${c.trackedQuest === id ? ' · tracked' : ''}</div><div class="qn">${esc(def.name)}</div>`);
        it.onclick = () => { journalSel = id; openJournal('quests'); };
        ql.appendChild(it);
      }
    }
    if (!active.length && !done.length) ql.appendChild(el('div', 'muted', 'No quests yet. Speak with townsfolk; elders, faction masters and trainers all have work.'));
    body.appendChild(ql);
    const det = el('div', 'qdetail scroll');
    if (journalSel) {
      const def = questDef(journalSel), st = c.quests[journalSel];
      det.innerHTML = `<h2>${esc(def.name)}</h2><div class="muted" style="font-family:var(--display);font-size:var(--fs-1);text-transform:uppercase">${def.kind} quest · suggested level ${def.level || 1}</div><div class="rule"></div><div class="intro">${esc(def.intro || '')}</div><div class="rule"></div>`;
      def.steps.forEach((s, i) => {
        if (i > st.step) return;
        if (i < st.step) { det.innerHTML += `<div class="obj done">${esc(s.text || (s.any ? 'Objectives' : ''))}</div>`; return; }
        for (const o of objectiveProgress(journalSel)) det.innerHTML += `<div class="obj ${o.done ? 'done' : ''}">◆ ${esc(o.text)}${o.n !== null && o.of ? ` (${o.n}/${o.of})` : ''}</div>`;
      });
      if (st.done && def.outro) det.innerHTML += `<div class="rule"></div><div class="intro">${esc(def.outro)}</div>`;
      const R_ = def.rewards || {};
      det.innerHTML += `<div class="rule"></div><h3>Rewards</h3><div>${[R_.xp && `${R_.xp} XP`, R_.gold && `${R_.gold} gold`, R_.skill && `Skill: ${SKILLS[R_.skill].name}`, R_.item?.legendary && `Relic: ${LEGENDARIES[R_.item.legendary].name}`, R_.item?.tome && `${TOMES[R_.item.tome].name} (tier ${R_.item.tier})`, R_.item?.random && 'Equipment', R_.title && `Title: ${R_.title}`, R_.mount && `Mount: ${MOUNTS[R_.mount].name}`].filter(Boolean).join(' · ')}</div>`;
      if (!st.done) {
        const tb = el('button', '', c.trackedQuest === journalSel ? 'Tracked' : 'Track quest');
        tb.style.marginTop = '14px';
        tb.onclick = () => { c.trackedQuest = journalSel; openJournal('quests'); };
        det.appendChild(tb);
      }
    }
    body.appendChild(det);
  } else if (tab === 'codex') {
    const col = el('div', 'scroll');
    col.style.flex = '1';
    const surfaceD = DUNGEONS;
    const cleared = surfaceD.filter((d) => c.cleared[d.id]).length;
    col.innerHTML = `<h3>The World</h3>
      <div class="stat-row"><span>Dungeons cleared</span><b>${cleared} / ${surfaceD.length}</b></div>
      <div class="stat-row"><span>Waystones attuned</span><b>${c.discovered.waystones.length} / ${WAYSTONES.length}</b></div>
      <div class="stat-row"><span>Shrines blessed</span><b>${c.shrinesUsed.length} / ${SHRINES.length}</b></div>
      <div class="stat-row"><span>Landmarks seen</span><b>${c.discovered.landmarks.length} / ${LANDMARKS.length}</b></div>
      <div class="stat-row"><span>World bosses slain</span><b>${WORLD_BOSSES.filter((b) => c.bossesSlain.includes(b.enemy)).length} / ${WORLD_BOSSES.length}</b></div>
      <div class="stat-row"><span>Foes slain</span><b>${c.kills}</b></div><div class="stat-row"><span>Deaths</span><b>${c.deaths}</b></div>
      <div class="stat-row"><span>Days survived</span><b>${c.day}</b></div>`;
    col.appendChild(el('div', 'rule'));
    col.appendChild(el('h3', '', 'Dungeons'));
    const dl = el('div', '');
    dl.style.columns = '2';
    for (const d of DUNGEONS) {
      const known = c.discovered.dungeons.includes(d.id) || c.cleared[d.id];
      dl.appendChild(el('div', '', `<span style="color:${c.cleared[d.id] ? '#7a9a6a' : known ? '#e9dcc0' : '#5a5040'}">${c.cleared[d.id] ? '✓' : d.shard ? '♛' : '◆'} ${known ? esc(d.name) : '???'}</span> <span class="muted" style="font-size:var(--fs-1)">Lv ${d.level}${known ? ' · ' + BIOMES[d.biome].short : ''}</span>`));
    }
    col.appendChild(dl);
    col.appendChild(el('div', 'rule'));
    col.appendChild(el('h3', '', 'World Bosses'));
    for (const b of WORLD_BOSSES) col.appendChild(el('div', '', `${c.bossesSlain.includes(b.enemy) ? '✓' : '◆'} <b class="gold" style="font-family:var(--display);font-size:var(--fs-1)">${esc(b.enemy.replace(/_/g, ' '))}</b> <span class="muted">${BIOMES[b.biome].short} · appears ${b.cond ? 'during ' + b.cond : 'always'} · Lv ${b.level}</span>`));
    body.appendChild(col);
  } else {
    const col = el('div', 'scroll');
    col.style.flex = '1';
    for (const f of Object.values(FACTIONS)) {
      const v = c.rep[f.id] || 0;
      col.appendChild(el('div', '', `<h2 style="color:${f.color}">${f.sigil} ${esc(f.name)}</h2><div>${esc(f.desc)}</div><div class="stat-row"><span>Standing</span><b>${repTier(v).name} (${v})</b></div><div class="stat-row"><span>Bounty</span><b style="color:${(c.bounty[f.id] || 0) ? '#ff6040' : ''}">${c.bounty[f.id] || 0} gold</b></div><div class="rule"></div>`));
    }
    const other = Object.entries(c.bounty).filter(([k, v]) => v > 0 && !FACTIONS[k]);
    for (const [k, v] of other) col.appendChild(el('div', 'stat-row', `<span>Bounty in ${esc([...TOWNS, ...DEEP_TOWNS].find((t) => t.id === k)?.name || k)}</span><b style="color:#ff6040">${v} gold</b>`));
    body.appendChild(col);
  }
  openModal('journal', w);
}

// ===================================================================== WORLD MAP
const mapView = { realm: null, zoom: 1, cx: 0, cz: 0 };
export function openMap(realmOverride) {
  const realm = realmOverride || (G.realm === 'dungeon' ? G.dungeon.returnRealm : G.realm);
  const { w, body } = windowFrame('World Map', [['surface', 'Surface'], ['deep', 'Hollow Deep']], realm, (t) => { mapView.realm = t; mapView.zoom = 1; openMap(t); });
  const view = el('div', 'mapview interactive');
  const cv = document.createElement('canvas');
  view.appendChild(cv);
  body.appendChild(view);
  const legend = el('div', 'map-legend scroll');
  legend.innerHTML = `<h3>Legend</h3>
    <div class="li"><span class="sw" style="background:#ffe0a0;border-radius:0"></span> Town</div>
    <div class="li"><span class="sw" style="background:#ff6040"></span> Dungeon (♛ Crown Shard)</div>
    <div class="li"><span class="sw" style="background:#80c0ff"></span> Waystone (bright = attuned, click to travel)</div>
    <div class="li"><span class="sw" style="background:#60ffc0"></span> Shrine</div>
    <div class="li"><span class="sw" style="background:#ffd040"></span> Quest objective</div>
    <div class="rule"></div><div class="muted" style="font-size:var(--fs-1)">Drag to pan, scroll to zoom. Fast travel works from anywhere when you are not in combat or a dungeon.</div><div class="rule"></div><div id="map-hover" style="font-size:var(--fs-1)"></div>`;
  body.appendChild(legend);
  openModal('map', w);
  if (mapView.realm !== realm) { mapView.realm = realm; mapView.zoom = 1; const p = G.player.pos; if (G.realm === realm) { mapView.cx = p.x; mapView.cz = p.z; } else { mapView.cx = 0; mapView.cz = 0; } }
  const m = MAP[realm];
  const resize = () => { cv.width = view.clientWidth; cv.height = view.clientHeight; draw(); };
  const toScreen = (x, z) => { const s = (Math.min(cv.width, cv.height) / (m.half * 2)) * mapView.zoom; return [cv.width / 2 + (x - mapView.cx) * s, cv.height / 2 + (z - mapView.cz) * s, s]; };
  const toWorld = (sx, sy) => { const s = (Math.min(cv.width, cv.height) / (m.half * 2)) * mapView.zoom; return [mapView.cx + (sx - cv.width / 2) / s, mapView.cz + (sy - cv.height / 2) / s]; };
  const hot = [];
  function draw() {
    const g = cv.getContext('2d');
    g.fillStyle = '#0a0806'; g.fillRect(0, 0, cv.width, cv.height);
    if (!m.ready) { g.fillStyle = '#e8c47a'; g.font = "18.6667px 'Jersey 10'"; g.fillText('The cartographers are still painting...', 30, 40); return; }
    const [x0, y0, s] = toScreen(-m.half, -m.half);
    g.imageSmoothingEnabled = false;
    g.drawImage(m.canvas, x0, y0, m.half * 2 * s, m.half * 2 * s);
    // fog
    const fog = fogMask(realm);
    const cell = (m.half * 2) / FOG_N;
    g.fillStyle = 'rgba(10,8,6,0.94)';
    for (let j = 0; j < FOG_N; j++) for (let i = 0; i < FOG_N; i++) if (!fog[j * FOG_N + i]) { const [sx, sy] = toScreen(i * cell - m.half, j * cell - m.half); g.fillRect(sx - 0.5, sy - 0.5, cell * s + 1, cell * s + 1); }
    hot.length = 0;
    const c = G.char;
    g.textAlign = 'center';
    const towns = realm === 'deep' ? DEEP_TOWNS : TOWNS;
    for (const t of towns) {
      const [sx, sy] = toScreen(t.x, t.z);
      g.fillStyle = '#ffe0a0'; g.strokeStyle = '#000'; g.lineWidth = 2;
      g.fillRect(sx - 5, sy - 5, 10, 10); g.strokeRect(sx - 5, sy - 5, 10, 10);
      if (isRevealed(realm, t.x, t.z) || mapView.zoom > 1.5) { g.font = `${mapView.zoom > 2 ? 37.3333 : 18.6667}px 'Jersey 10'`; g.fillStyle = '#000'; g.fillText(t.name, sx + 1, sy - 9); g.fillStyle = '#fff0d0'; g.fillText(t.name, sx, sy - 10); }
      hot.push({ x: sx, y: sy, r: 8, text: `<b class="gold">${esc(t.name)}</b><br><span class="muted">${BIOMES[t.biome].short}${t.faction ? ' · ' + FACTIONS[t.faction].name : ''} · Danger ${dangerLevel(t.x, t.z, realm)}</span>` });
    }
    for (const d of DUNGEONS) {
      if ((d.realm || 'surface') !== realm) continue;
      const known = c.discovered.dungeons.includes(d.id) || c.cleared[d.id];
      if (!known && !isRevealed(realm, d.x, d.z)) continue;
      const [sx, sy] = toScreen(d.x, d.z);
      g.fillStyle = c.cleared[d.id] ? '#8a8070' : d.shard ? '#ff70ff' : '#ff6040';
      g.beginPath(); g.moveTo(sx, sy - 7); g.lineTo(sx + 6, sy + 5); g.lineTo(sx - 6, sy + 5); g.closePath(); g.fill(); g.stroke();
      hot.push({ x: sx, y: sy, r: 8, text: `<b>${d.shard ? '♛ ' : ''}${esc(d.name)}</b><br><span class="muted">Level ${d.level} · ${d.size}${c.cleared[d.id] ? ' · cleared' : ''}</span>` });
    }
    for (const wz of WAYSTONES) {
      if (wz.realm !== realm) continue;
      const attuned = c.discovered.waystones.includes(wz.id);
      const [sx, sy] = toScreen(wz.x, wz.z);
      g.fillStyle = attuned ? '#80c0ff' : '#3a5a78';
      g.beginPath(); g.moveTo(sx, sy - 7); g.lineTo(sx + 5, sy); g.lineTo(sx, sy + 7); g.lineTo(sx - 5, sy); g.closePath(); g.fill(); g.stroke();
      hot.push({ x: sx, y: sy, r: 9, text: `<b style="color:#a0d0ff">Waystone: ${esc(wz.name)}</b><br><span class="muted">${attuned ? 'Click to travel' : 'Not attuned yet. Touch it once to fast travel here.'}</span>`, travel: attuned ? wz : null });
    }
    for (const sh of SHRINES) {
      if (sh.realm !== realm) continue;
      const [sx, sy] = toScreen(sh.x, sh.z);
      g.fillStyle = c.shrinesUsed.includes(sh.id) ? '#6a6a60' : '#60ffc0';
      g.beginPath(); g.arc(sx, sy, 4, 0, Math.PI * 2); g.fill(); g.stroke();
      hot.push({ x: sx, y: sy, r: 7, text: `<b>${esc(sh.name)}</b><br><span class="muted">${sh.cond ? 'Awakens: ' + sh.cond : ''}${c.shrinesUsed.includes(sh.id) ? ' · blessed' : ''}</span>` });
    }
    for (const q of trackedObjectiveMarkers()) {
      if (q.realm !== realm) continue;
      const [sx, sy] = toScreen(q.x, q.z);
      g.fillStyle = q.tracked ? '#ffd040' : '#b09050';
      g.beginPath(); for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2; const r = i % 2 ? 4 : 9; g.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r); } g.closePath(); g.fill(); g.stroke();
      hot.push({ x: sx, y: sy, r: 10, text: `<b class="gold">${esc(questDef(q.quest).name)}</b><br>${esc(q.text)}` });
    }
    // region labels
    if (realm === 'surface') {
      g.font = `${mapView.zoom > 1.2 ? 37.3333 : 18.6667}px 'Jersey 10'`;
      const labels = [['The Frostbite Spine', 0, -930], ['The Verdant Reach', -850, 0], ['The Gilded Ruins', 60, -330], ['The Crimson Wastes', 200, 760], ['The Drowned Coast', 940, 80], ['The Maw', 60, 210]];
      for (const [t, x, z] of labels) { const [sx, sy] = toScreen(x, z); g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillText(t, sx + 1, sy + 1); g.fillStyle = 'rgba(255,240,210,0.85)'; g.fillText(t, sx, sy); }
    }
    // player
    if (G.realm === realm || (G.realm === 'dungeon' && G.dungeon.returnRealm === realm)) {
      const pp = G.realm === 'dungeon' ? G.dungeon.returnPos : G.player.pos;
      const [sx, sy] = toScreen(pp.x, pp.z);
      g.save(); g.translate(sx, sy); g.rotate(Math.PI - G.player.facing);
      g.beginPath(); g.moveTo(0, -10); g.lineTo(7, 8); g.lineTo(0, 4); g.lineTo(-7, 8); g.closePath();
      g.fillStyle = '#fff'; g.fill(); g.strokeStyle = '#000'; g.lineWidth = 2; g.stroke(); g.restore();
    }
  }
  let drag = null;
  view.onmousedown = (e) => { drag = { x: e.clientX, y: e.clientY, cx: mapView.cx, cz: mapView.cz, moved: false }; };
  view.onmousemove = (e) => {
    const rect = cv.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    if (drag) {
      const s = (Math.min(cv.width, cv.height) / (m.half * 2)) * mapView.zoom;
      if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4) drag.moved = true;
      mapView.cx = drag.cx - (e.clientX - drag.x) / s; mapView.cz = drag.cz - (e.clientY - drag.y) / s; draw();
    }
    const h = hot.find((o) => Math.hypot(o.x - mx, o.y - my) < o.r);
    const hv = document.getElementById('map-hover');
    if (hv) { const [wx, wz] = toWorld(mx, my); hv.innerHTML = h ? h.text : (isRevealed(realm, wx, wz) ? `<span class="muted">Danger ${dangerLevel(wx, wz, realm)}</span>` : '<span class="muted">Unexplored</span>'); }
    view.style.cursor = h?.travel ? 'pointer' : drag ? 'grabbing' : 'grab';
  };
  view.onmouseup = (e) => {
    if (drag && !drag.moved) {
      const rect = cv.getBoundingClientRect();
      const h = hot.find((o) => Math.hypot(o.x - (e.clientX - rect.left), o.y - (e.clientY - rect.top)) < o.r);
      if (h?.travel) { bus.emit('fastTravel', h.travel); }
    }
    drag = null;
  };
  view.onwheel = (e) => { e.preventDefault(); mapView.zoom = Math.max(0.8, Math.min(8, mapView.zoom * (e.deltaY < 0 ? 1.15 : 0.87))); draw(); };
  requestAnimationFrame(resize);
}

// ===================================================================== PAUSE & SETTINGS
export function openPause() {
  const { w, body } = windowFrame('Paused', [['main', 'Menu'], ['settings', 'Settings'], ['controls', 'Controls']], 'main', (t) => (t === 'settings' ? openSettings() : t === 'controls' ? openControls() : openPause()));
  w.style.width = '520px'; w.style.height = 'auto';
  const col = el('div', '');
  col.style.cssText = 'display:flex;flex-direction:column;gap:10px;width:100%;padding:10px 40px';
  const mk = (t, fn, cls = '') => { const b = el('button', cls, t); b.onclick = fn; col.appendChild(b); };
  mk('Resume', closeModal, 'primary');
  mk('Save game', () => { saveGame(0) ? toast('Game saved.') : toast('Save failed.'); });
  mk('Quit to title', () => { saveGame(0); location.reload(); });
  body.appendChild(col);
  openModal('pause', w);
}

export function openSettings() {
  const { w, body } = windowFrame('Settings', [['main', 'Menu'], ['settings', 'Settings'], ['controls', 'Controls']], 'settings', (t) => (t === 'settings' ? openSettings() : t === 'controls' ? openControls() : openPause()));
  w.style.width = '620px'; w.style.height = 'auto';
  const col = el('div', 'scroll');
  col.style.cssText = 'width:100%;padding:6px 20px';
  const S = G.settings;
  const row = (label, input) => { const r = el('div', 'stat-row'); r.appendChild(el('span', '', label)); r.appendChild(input); col.appendChild(r); };
  const slider = (key, min, max, step, fn) => { const i = el('input', 'range interactive'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = S[key]; i.oninput = () => { S[key] = +i.value; fn && fn(); saveSettings(); }; return i; };
  const select = (key, opts, fn) => { const s = document.createElement('select'); s.className = 'interactive'; s.style.cssText = 'background:#1a120c;color:#e9dcc0;border:1px solid #6a5228;font-family:inherit;font-size:var(--fs-1)'; for (const [v, t] of opts) { const o = document.createElement('option'); o.value = v; o.textContent = t; if (String(S[key]) === String(v)) o.selected = true; s.appendChild(o); } s.onchange = () => { S[key] = isNaN(+s.value) ? s.value : +s.value; fn && fn(); saveSettings(); }; return s; };
  row('Music volume', slider('music', 0, 1, 0.05, () => bus.emit('volume')));
  row('Effects volume', slider('sfx', 0, 1, 0.05, () => bus.emit('volume')));
  row('Pixel size', select('pixel', [['auto', 'Auto (fit screen)'], [2, 'Small (2x)'], [3, 'Medium (3x)'], [4, 'Large (4x)'], [5, 'Huge (5x)']], () => { R.settings.pixel = S.pixel; applySettings(); }));
  row('Magic glow', select('glow', [[true, 'On'], [false, 'Off']], () => { S.glow = S.glow === true || S.glow === 'true'; R.settings.glow = S.glow; }));
  row('Spell effects', select('magicFx', [[true, 'Enhanced (shaders)'], [false, 'Classic pixel']], () => { S.magicFx = S.magicFx === true || S.magicFx === 'true'; }));
  row('Damage numbers', select('damageNumbers', [[true, 'On'], [false, 'Off']], () => { S.damageNumbers = S.damageNumbers === true || S.damageNumbers === 'true'; }));
  row('Screen shake & kick', slider('screenShake', 0, 1.5, 0.1));
  row('Controller vibration', select('vibration', [[true, 'On'], [false, 'Off']], () => { S.vibration = S.vibration === true || S.vibration === 'true'; }));
  body.appendChild(col);
  openModal('settings', w);
}

export function openControls() {
  const { w, body } = windowFrame('Controls', [['main', 'Menu'], ['settings', 'Settings'], ['controls', 'Controls']], 'controls', (t) => (t === 'settings' ? openSettings() : t === 'controls' ? openControls() : openPause()));
  w.style.width = '640px'; w.style.height = 'auto';
  body.innerHTML = `<div class="keys" style="padding:6px 20px">
    <b>WASD</b><span>Move (relative to camera)</span><b>Mouse</b><span>Aim</span>
    <b>Left click</b><span>Attack / combo (hold for a heavy finisher) · draw bow · cast staff bolts</span>
    <b>Right click</b><span>Block; tap just before a hit lands to PARRY</span>
    <b>Space</b><span>Dodge roll (brief invulnerability)</span><b>Shift</b><span>Sprint</span>
    <b>1 – 6</b><span>Skills & spells (hold channelled spells)</span><b>Q</b><span>Class signature ability</span>
    <b>F / G</b><span>Healing draught / mana tincture</span><b>E</b><span>Interact, talk, loot, enter</span><b>R</b><span>Summon / dismiss mount</span>
    <b>I / Tab</b><span>Inventory</span><b>C</b><span>Attributes</span><b>K</b><span>Skills & spellbooks</span><b>J</b><span>Journal</span><b>M</b><span>World map & fast travel</span>
    <b>Wheel</b><span>Zoom in / out</span><b>Esc</b><span>Close menus / pause</span><b>Controller</b><span>Left stick move · right stick aim · RT attack · LT block · A dodge · B interact · X/Y/RB skills · LB signature · d-pad potions & skills · rumble on hits</span></div>`;
  openModal('controls', w);
}

// ===================================================================== DEATH
export function showDeath(onRespawn) {
  const d = el('div', 'death', `<div class="t"></div><div style="margin:calc(var(--u) * 6) 0 calc(var(--u) * 12)">The dice are not finished with you.</div>`);
  d.querySelector('.t').appendChild(pxTitle('You have fallen', 4, { bands: ['#ff9a80', '#e04030', '#a01810', '#5a0806'] }));
  const b = el('button', 'primary', 'Rise again');
  b.onclick = () => { d.remove(); onRespawn(); };
  d.appendChild(b);
  d.appendChild(el('div', 'muted', '<div style="margin-top:12px;font-size:var(--fs-1)">You will wake at the last waystone you touched, lighter by a tenth of your gold.</div>'));
  root().appendChild(d);
}
