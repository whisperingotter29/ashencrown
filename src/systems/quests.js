// Quest tracking: start, progress, complete, rewards. Also trainer trials and bounty contracts.
import { G } from '../game.js';
import { bus } from '../core/events.js';
import { QUESTS, TRAINER_TRIALS } from '../data/quests.js';
import { DUNGEONS, TOWNS, DEEP_TOWNS } from '../data/world.js';
import { ENEMIES } from '../data/enemies.js';
import { SKILLS } from '../data/skills.js';
import { MOUNTS } from '../data/mounts.js';
import { rollLoot, makeLegendary, makeTome, makeSetPiece, MATERIALS_LIST } from '../data/items.js';
import { RNG, hashStr } from '../core/rng.js';
import { gainXp } from './progression.js';
import { addItem, addGold, addMaterial, classPrefer } from './inventory.js';
import { addRep } from './factions.js';
import { huntingGround } from './hunting.js';

const rewardRng = new RNG(4242);

export function questDef(id) {
  if (QUESTS[id]) return QUESTS[id];
  if (id.startsWith('trial_')) {
    const sk = id.slice(6);
    const t = TRAINER_TRIALS[sk];
    if (!t) return null;
    return { name: `Trial: ${SKILLS[sk].name}`, kind: 'trial', giver: `${t.trainer}:trainer:${sk}`, level: t.level, intro: `${t.name} looks you over. "Prove you can handle ${SKILLS[sk].name}. ${t.trial.text}, then come back."`, steps: [t.trial, { type: 'talk', npc: `${t.trainer}:trainer:${sk}`, text: `Return to ${t.name}` }], rewards: { xp: 150 + t.level * 40, skill: sk } };
  }
  if (id.startsWith('contract_')) return contractDef(id);
  return null;
}

// ------------------------------------------------------------------ bounty contracts
export function contractsFor(townId) {
  const town = [...TOWNS, ...DEEP_TOWNS].find((t) => t.id === townId);
  if (!town) return [];
  const day = G.char.day;
  const out = [];
  for (let k = 0; k < 2; k++) out.push(`contract_${townId}_${day}_${k}`);
  return out;
}

function contractDef(id) {
  const [, townId, day, k] = id.split('_');
  const town = [...TOWNS, ...DEEP_TOWNS].find((t) => t.id === townId);
  if (!town) return null;
  const rng = new RNG(hashStr(id));
  const realm = DEEP_TOWNS.includes(town) ? 'deep' : 'surface';
  const biome = town.biome;
  const lvlBase = Math.max(G.char.level, 3);
  if (+k === 0) {
    // hunt a named elite
    const pool = Object.entries(ENEMIES).filter(([eid, e]) => !e.boss && !e.ally && (e.biome || []).includes(biome)).map(([eid]) => eid);
    const eid = rng.pick(pool.length ? pool : ['bandit']);
    const ang = rng.f() * Math.PI * 2, r = 90 + rng.f() * 80;
    const x = Math.round(town.x + Math.cos(ang) * r), z = Math.round(town.z + Math.sin(ang) * r);
    const names = ['the Butcher', 'Old Scar', 'the Widowmaker', 'Grimtooth', 'the Hollow-Eyed', 'Ashmaw', 'the Unwashed', 'Saltjaw', 'the Pale', 'Bonecrack'];
    const nm = `${ENEMIES[eid].name} "${rng.pick(names)}"`;
    return { name: `Bounty: ${nm}`, kind: 'contract', giver: `${townId}:bounty`, level: lvlBase, contract: { enemy: eid, x, z, name: nm, realm },
      intro: `A wanted poster, nailed over three older ones. ${nm} has been killing travellers ${['north', 'east', 'south', 'west'][Math.floor(((ang + Math.PI * 2 + Math.PI / 4) % (Math.PI * 2)) / (Math.PI / 2))]} of ${town.name}. Bring proof.`,
      steps: [{ type: 'bountyKill', tag: id, x, z, r: 20, realm, text: `Hunt down ${nm}` }, { type: 'talk', npc: `${townId}:bounty`, text: `Collect the bounty in ${town.name}` }],
      rewards: { xp: 80 + lvlBase * 30, gold: 60 + lvlBase * 22, item: { random: 1, rarity: 2 }, rep: town.faction ? { [town.faction]: 60 } : null } };
  }
  const near = DUNGEONS.filter((d) => (d.realm || 'surface') === realm).sort((a, b) => Math.hypot(a.x - town.x, a.z - town.z) - Math.hypot(b.x - town.x, b.z - town.z));
  const dd = near[rng.int(0, Math.min(3, near.length - 1))];
  return { name: `Contract: ${dd.name}`, kind: 'contract', giver: `${townId}:bounty`, level: dd.level,
    intro: `The guild posts a standing contract on ${dd.name}. Whatever lives in there has been coming out at night. Clear it out.`,
    steps: [{ type: 'clear', dungeon: dd.id, fresh: true, text: `Clear ${dd.name} (Lv ${dd.level})` }, { type: 'talk', npc: `${townId}:bounty`, text: `Collect the contract in ${town.name}` }],
    rewards: { xp: 120 + dd.level * 45, gold: 100 + dd.level * 30, item: { random: 1, rarity: 2 }, rep: town.faction ? { [town.faction]: 80 } : null } };
}

// ------------------------------------------------------------------ lifecycle
export function questState(id) { return G.char.quests[id]; }
export function isActive(id) { const q = G.char.quests[id]; return q && !q.done; }
export function isDone(id) { return !!G.char.quests[id]?.done; }

export function startQuest(id, silent = false) {
  const c = G.char;
  if (c.quests[id]) return false;
  const def = questDef(id);
  if (!def) return false;
  c.quests[id] = { step: 0, prog: {}, done: false, started: G.time };
  c.questOrder.unshift(id);
  if (!c.trackedQuest || def.kind === 'main' || def.kind === 'race') c.trackedQuest = id;
  if (!silent) bus.emit('questStarted', { id, def });
  catchUp(id);
  if (def.kind === 'contract' && def.contract) bus.emit('contractStarted', { id, def });
  return true;
}

// Credit objectives the player has already accomplished
function catchUp(id) {
  const def = questDef(id), st = G.char.quests[id];
  if (!def || !st || st.done) return;
  const step = def.steps[st.step];
  if (!step) return;
  const objs = step.any || [step];
  objs.forEach((o, i) => {
    if (o.type === 'clear' && !o.fresh && G.char.cleared[o.dungeon]) mark(id, i);
    if (o.type === 'boss' && G.char.bossesSlain.includes(o.enemy)) mark(id, i);
    if (o.type === 'level' && G.char.level >= o.level) mark(id, i);
  });
  checkStep(id);
}

function key(i) { return 'o' + i; }
function mark(id, i, n = 1) {
  const st = G.char.quests[id];
  st.prog[key(i)] = (st.prog[key(i)] || 0) + n;
}

function objDone(o, st, i) {
  const v = st.prog[key(i)] || 0;
  if (o.type === 'kill') return v >= o.count;
  if (o.type === 'collect') return (G.char.materials[o.item] || 0) >= o.count;
  return v >= 1;
}

export function objectiveProgress(id) {
  const def = questDef(id), st = G.char.quests[id];
  if (!def || !st) return [];
  const step = def.steps[st.step];
  if (!step) return [];
  const objs = step.any || [step];
  return objs.map((o, i) => ({ text: o.text, done: objDone(o, st, i), n: o.type === 'kill' ? Math.min(o.count, st.prog[key(i)] || 0) : o.type === 'collect' ? Math.min(o.count, G.char.materials[o.item] || 0) : null, of: o.count || null }));
}

function checkStep(id) {
  const def = questDef(id), st = G.char.quests[id];
  if (!def || !st || st.done) return;
  const step = def.steps[st.step];
  const objs = step.any || [step];
  if (objs.every((o, i) => objDone(o, st, i))) {
    st.step++;
    st.prog = {};
    if (st.step >= def.steps.length) completeQuest(id);
    else { bus.emit('questStep', { id, def, step: def.steps[st.step] }); catchUp(id); }
  } else bus.emit('questProgress', { id });
}

export function completeQuest(id) {
  const def = questDef(id), st = G.char.quests[id];
  st.done = true;
  st.step = def.steps.length;
  const R = def.rewards || {};
  const got = [];
  if (R.take) for (const [k, v] of Object.entries(R.take)) addMaterial(k, -v, true);
  if (R.xp) { gainXp(R.xp); got.push(`${R.xp} XP`); }
  if (R.gold) { addGold(R.gold); got.push(`${R.gold} gold`); }
  for (const spec of [R.item, R.item2]) {
    if (!spec) continue;
    const it = makeRewardItem(spec);
    if (it) { addItem(it, true) || bus.emit('toast', 'Pack full: reward dropped at your feet.'); got.push(it.name); }
  }
  if (R.skill) { learnSkill(R.skill); got.push(`Skill: ${SKILLS[R.skill].name}`); }
  if (R.rep) for (const [f, v] of Object.entries(R.rep)) { addRep(f, v); }
  if (R.title) { if (!G.char.titles.includes(R.title)) G.char.titles.push(R.title); G.char.title = R.title; got.push(`Title: ${R.title}`); }
  if (R.mount) { if (!G.char.mounts.includes(R.mount)) G.char.mounts.push(R.mount); if (!G.char.activeMount) G.char.activeMount = R.mount; got.push(`Mount: ${MOUNTS[R.mount].name}`); }
  if (G.char.trackedQuest === id) G.char.trackedQuest = G.char.questOrder.find((q) => isActive(q)) || null;
  bus.emit('questComplete', { id, def, rewards: got });
  if (def.next) setTimeout(() => { startQuest(def.next); }, 1500);
}

function makeRewardItem(spec) {
  const lvl = Math.max(1, G.char.level);
  if (spec.legendary) return makeLegendary(spec.legendary, Math.max(lvl, 10), rewardRng);
  if (spec.tome) return makeTome(spec.tome, spec.tier, Math.max(lvl, spec.tier * 10), Math.min(4, spec.tier), rewardRng);
  if (spec.set) return makeSetPiece(spec.set, spec.slot, lvl, rewardRng);
  if (spec.random) return rollLoot(lvl, rewardRng, { minRarity: spec.rarity || 1, prefer: classPrefer(), boost: 0.5 });
  return null;
}

export function learnSkill(id) {
  const c = G.char;
  if (c.skills.includes(id)) return false;
  c.skills.push(id);
  const sk = SKILLS[id];
  if (sk.type !== 'passive') { const free = c.skillBar.indexOf(null); if (free >= 0) c.skillBar[free] = id; }
  G.player?.refreshStats();
  bus.emit('skillLearned', id);
  return true;
}

// ------------------------------------------------------------------ events
function forEachActive(fn) {
  for (const id of [...G.char.questOrder]) {
    const st = G.char.quests[id];
    if (!st || st.done) continue;
    const def = questDef(id);
    if (!def) continue;
    const step = def.steps[st.step];
    if (!step) continue;
    const objs = step.any || [step];
    let touched = false;
    objs.forEach((o, i) => { if (fn(o, i, id, st)) { touched = true; } });
    if (touched) checkStep(id);
  }
}

export function initQuests() {
  bus.on('kill', ({ victim, killer }) => {
    if (victim.isPlayer || victim.team !== 'enemy') return;
    forEachActive((o, i, id) => {
      if (o.type === 'kill' && (victim.tplId === o.enemy || (Array.isArray(o.enemy) && o.enemy.includes(victim.tplId)))) { mark(id, i); return true; }
      if (o.type === 'bountyKill' && victim.questTag === o.tag) { mark(id, i); return true; }
      if (o.type === 'boss' && victim.tplId === o.enemy) { mark(id, i); return true; }
      return false;
    });
  });
  bus.on('dungeonCleared', ({ def }) => {
    G.char.cleared[def.id] = true;
    forEachActive((o, i, id) => { if (o.type === 'clear' && o.dungeon === def.id) { mark(id, i); return true; } return false; });
  });
  bus.on('material', () => forEachActive((o) => o.type === 'collect'));
  bus.on('levelUp', (lvl) => forEachActive((o, i, id) => { if (o.type === 'level' && lvl >= o.level) { mark(id, i); return true; } return false; }));
  bus.on('rivalDefeated', (rv) => forEachActive((o, i, id) => { if (o.type === 'boss' && o.enemy === 'rival_duelist' && rv.enemy === 'rival_duelist') { mark(id, i); return true; } return false; }));
}

let reachT = 0;
export function updateQuests(dt) {
  reachT -= dt;
  if (reachT > 0 || !G.player) return;
  reachT = 0.5;
  const p = G.player.pos;
  const realm = G.realm === 'dungeon' ? 'dungeon' : G.realm;
  forEachActive((o, i, id, st) => {
    if (o.type === 'reach' && (o.realm || 'surface') === realm && Math.hypot(p.x - o.x, p.z - o.z) < o.r && !(st.prog[key(i)] > 0)) { mark(id, i); return true; }
    return false;
  });
}

// Called by dialogue when talking to an NPC; returns quest lines to show
export function onTalk(npcId) {
  const lines = [];
  forEachActive((o, i, id, st) => {
    if (o.type === 'talk' && o.npc === npcId) {
      const def = questDef(id);
      const last = st.step === def.steps.length - 1;
      mark(id, i);
      if (last && def.outro) lines.push({ quest: id, text: def.outro });
      return true;
    }
    return false;
  });
  return lines;
}

export function questsOffered(npcId) {
  const c = G.char;
  const out = [];
  for (const [id, def] of Object.entries(QUESTS)) {
    if (def.giver !== npcId || c.quests[id]) continue;
    if (def.kind === 'race') continue;
    if (def.kind === 'hidden' && (!c.rareFate || c.rareFate.quest !== id)) continue;
    if (def.kind === 'faction' && (c.rep[def.faction] || 0) < (def.repReq || 0)) continue;
    if (def.kind === 'main' && def.giver && id !== 'q_main_1') {
      // main quests chain automatically
      continue;
    }
    out.push(id);
  }
  // trainer trials
  const parts = npcId.split(':');
  if (parts[1] === 'trainer' && parts[2]) { const tid = 'trial_' + parts[2]; if (!c.quests[tid] && !c.skills.includes(parts[2])) out.push(tid); }
  return out;
}

export function trackedObjectiveMarkers() {
  const c = G.char;
  const out = [];
  for (const id of c.questOrder) {
    const st = c.quests[id];
    if (!st || st.done) continue;
    const def = questDef(id);
    if (!def) continue;
    const step = def.steps[st.step];
    if (!step) continue;
    const objs = step.any || [step];
    objs.forEach((o, i) => {
      if (objDone(o, st, i)) return;
      let pos = null;
      if (o.type === 'clear') { const d = DUNGEONS.find((x) => x.id === o.dungeon); if (d) pos = { x: d.x, z: d.z, realm: d.realm || 'surface' }; }
      else if (o.type === 'reach' || o.type === 'bountyKill') pos = { x: o.x, z: o.z, realm: o.realm || 'surface' };
      else if (o.type === 'talk') { const t = [...TOWNS, ...DEEP_TOWNS].find((t) => t.id === o.npc.split(':')[0]); if (t) pos = { x: t.x, z: t.z, realm: DEEP_TOWNS.includes(t) ? 'deep' : 'surface', npc: o.npc }; }
      else if (o.type === 'kill') { const hg = huntingGround(id, i, def); if (hg) pos = { ...hg, area: true, enemy: o.enemy }; }
      else if (o.type === 'collect') { const t = [...TOWNS, ...DEEP_TOWNS].find((t) => t.id === (def.giver || '').split(':')[0]); if (t) pos = { x: t.x, z: t.z, realm: 'surface', area: true }; }
      if (pos) out.push({ ...pos, quest: id, obj: i, type: o.type, text: o.text, tracked: id === c.trackedQuest, kind: def.kind });
    });
  }
  return out;
}

// NPC ids someone is waiting to hear from (the current "talk" objective of an active quest)
export function pendingTalkNpcs() {
  const out = new Set();
  const c = G.char;
  for (const id of c.questOrder) {
    const st = c.quests[id];
    if (!st || st.done) continue;
    const def = questDef(id);
    const step = def?.steps[st.step];
    if (!step) continue;
    (step.any || [step]).forEach((o, i) => { if (o.type === 'talk' && !objDone(o, st, i)) out.add(o.npc); });
  }
  return out;
}

// unfinished "kill N of X" objectives, for the hunting-ground spawner
export function activeKillObjectives() {
  const out = [];
  const c = G.char;
  for (const id of c.questOrder) {
    const st = c.quests[id];
    if (!st || st.done) continue;
    const def = questDef(id);
    const step = def?.steps[st.step];
    if (!step) continue;
    (step.any || [step]).forEach((o, i) => {
      if (o.type !== 'kill' || objDone(o, st, i)) return;
      const hg = huntingGround(id, i, def);
      if (hg) out.push({ quest: id, obj: i, enemy: o.enemy, left: o.count - (st.prog[key(i)] || 0), ground: hg });
    });
  }
  return out;
}
