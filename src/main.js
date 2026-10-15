// Ashen Crown: bootstrap, game state machine and the main loop.
import { Vec3 } from './core/vec3.js';
import { G, newCharacter } from './game.js';
import { initRenderer, renderFrame, R, flushLights, requestLight, applySettings } from './render/renderer.js';
import { initTerrain, updateTerrain, groundHeight, terrain, setRealm, setTerrainVisible, terrainProgress } from './world/terrain.js';
import { initAtmosphere, updateAtmosphere, atmo, isNight, timePhase } from './world/atmosphere.js';
import { initWeather, updateWeather, forceWeather } from './world/weather.js';
import { cam, updateCamera, snapCamera, addShake, worldToScreen } from './world/cameraRig.js';
import { initInput, endFrameInput, input, keyPressed, key, pollGamepad } from './core/input.js';
import { primaryBiome, dangerLevel, heightAt } from './world/terrainGen.js';
import { initVfx, updateVfx, clearVfx, burst, ring, pillar, floatText, flash } from './render/vfx.js';
import { initStructures, updateStructures, shrineAwake, rebuildAll } from './world/structures.js';
import { updateProjectiles, updateHazards, clearCombat } from './systems/combat.js';
import { Player } from './entities/player.js';
import { updateTimers, clearTimers } from './entities/enemy.js';
import { updateSpawner, clearSpawns, cleanupEntities, spawnEnemy, RIVALS } from './systems/spawner.js';
import { enterDungeon, exitDungeon, updateDungeon, dungeonDef } from './world/dungeon.js';
import { initClassMechanics, updateClassMech, useSignature } from './systems/classMech.js';
import { useAbility } from './systems/abilities.js';
import { queryColliders } from './systems/collision.js';
import { initProgression, gainXp } from './systems/progression.js';
import { initQuests, updateQuests, startQuest, learnSkill, questDef, isActive } from './systems/quests.js';
import { initFactions, addRep } from './systems/factions.js';
import { updatePickups, openChest, clearPickups, spawnPickup } from './systems/loot.js';
import { addItem, useConsumable, addConsumable } from './systems/inventory.js';
import { makeWeapon, makeArmor, makeShield, makeTome, RARITY, LEGENDARIES } from './data/items.js';
import { RNG } from './core/rng.js';
import { RACE_BY_ID } from './data/races.js';
import { CLASS_BY_ID } from './data/classes.js';
import { TOWNS, DEEP_TOWNS, BIOMES, WAYSTONES, DUNGEONS, SHRINES, LANDMARKS, REALM_GATES, MAW } from './data/world.js';
import { TOMES, spellsForTome } from './data/tomes.js';
import { SKILLS } from './data/skills.js';
import { bus } from './core/events.js';
import { saveGame, loadGame, saveInfo, loadSettings, saveSettings } from './core/save.js';
import { buildMaps, revealAround, serializeFog, MAP } from './world/mapdata.js';
import { el, esc, root, toast, banner, closeModal, modalName, pxTitle } from './ui/ui.js';
import { initPixelKit, fontsReady } from './ui/pixelKit.js';
import { initFeel, updateFeel } from './core/feel.js';
import { initQuestMarkers } from './render/questMarkers.js';
import { initTutorial, startTutorial, updateTutorial } from './systems/tutorial.js';
import '@fontsource/jersey-10/400.css';
import '@fontsource/silkscreen/400.css';
import { buildHud, updateHud, refreshSkillbar, hideHud } from './ui/hud.js';
import { openInventory, openSkills, openJournal, openMap, openPause, showDeath, openSettings, openControls } from './ui/menus.js';
import { talkTo, closeDialogue, dialogueOpen, dialogueKey } from './ui/dialogue.js';
import { startFateTable, updateFate, fateActive } from './ui/fate.js';
import { initAudio, setMusic, audioReady } from './audio/audio.js';
import { xpToNext } from './systems/stats.js';

// ============================================================================ boot
loadSettings();
initPixelKit();
initFeel();
initTutorial();
initRenderer(document.getElementById('game'));
R.settings.pixel = G.settings.pixel || 'auto';
R.settings.glow = G.settings.glow !== false;
applySettings();
initInput(R.canvas);
initTerrain();
initAtmosphere();
initVfx();
initQuestMarkers();
initWeather();
initStructures();
initClassMechanics();
initProgression();
initQuests();
initFactions();

const params = new URLSearchParams(location.search);
window.__G = G;
// live module handles for automated testing
window.__dbg = { forceWeather, cam, atmo, R, spawnEnemy, enterDungeon, terrain, input, worldToScreen, queryColliders, groundHeight };

// held-key query for channelled spells
G.inputHeld = (slot) => input.down.has(String(slot + 1));

// ============================================================================ title
let titleUI = null;
const titleFocus = new Vec3(260, 0, 560);
function showTitle() {
  G.mode = 'title';
  atmo.timeOfDay = 0.74;
  atmo.biome = 'wastes';
  G.biome = 'wastes';
  titleUI = el('div', 'screen');
  const info = saveInfo(0);
  titleUI.innerHTML = `<div class="title-logo text">ASHEN<br>CROWN</div><div class="title-sub">The dice remember a crown that the world forgot.</div>`;
  fontsReady().then(() => {
    const logo = titleUI?.querySelector('.title-logo');
    if (!logo) return;
    logo.className = 'title-logo';
    logo.innerHTML = '';
    logo.append(pxTitle('Ashen', 5), pxTitle('Crown', 5));
  });
  const menu = el('div', 'title-menu');
  if (info) {
    const b = el('button', 'primary', 'Continue');
    b.onclick = () => begin(() => continueGame());
    menu.appendChild(b);
    menu.appendChild(el('div', 'saveinfo', `${esc(info.name)} · Level ${info.level} ${esc(RACE_BY_ID[info.race]?.name || '')} ${esc(CLASS_BY_ID[info.cls]?.name || '')}`));
  }
  const nb = el('button', info ? '' : 'primary', 'New Game · Roll the Fates');
  nb.onclick = () => begin(() => newGame());
  menu.appendChild(nb);
  const sb = el('button', '', 'Settings');
  sb.onclick = () => openSettings();
  const cb = el('button', '', 'Controls');
  cb.onclick = () => openControls();
  menu.append(sb, cb);
  titleUI.appendChild(menu);
  titleUI.appendChild(el('div', 'credits', 'Click to awaken the music · Best with headphones'));
  root().appendChild(titleUI);
  cam.cinematic = { x: titleFocus.x, z: titleFocus.z, speed: 0.3 };
  snapCamera(titleFocus);
  titleUI.addEventListener('mousedown', () => { initAudio().then(() => setMusic('title')); }, { once: true });
}

function begin(fn) {
  initAudio().then(() => setMusic('title')).catch(() => {});
  if (titleUI) { titleUI.remove(); titleUI = null; }
  fn();
}

// ============================================================================ new game
function newGame() {
  setMusic('title');
  startFateTable((res) => {
    const c = newCharacter(res);
    G.char = c;
    applyFateRewards(c, res);
    giveStartingKit(c);
    showPrologue(c, () => spawnPlayerAtHome(c));
  });
}

function applyFateRewards(c, res) {
  const rng = new RNG(Date.now() & 0xffff);
  if (res.fateLocked) {
    c.statPoints += 3; c.gold += 100; c.titles.push('the Unbending'); c.title = 'the Unbending';
    const cls = CLASS_BY_ID[c.cls];
    const type = cls.kit.mainhand === 'rapier' ? 'sword' : cls.kit.mainhand;
    const w = makeWeapon(type, 3, 2, rng, { base: cls.kit.mainhand === 'rapier' ? 'Rapier' : undefined });
    w.name = 'Fate-Sealed ' + w.name.split(' ').slice(-1)[0];
    c.inventory.push(w);
  }
  if (res.doubles) {
    for (const k in c.bonusStats) c.bonusStats[k] += 2;
    const cls = CLASS_BY_ID[c.cls];
    const type = cls.kit.mainhand === 'rapier' ? 'sword' : cls.kit.mainhand;
    const w = makeWeapon(type, 5, 3, rng);
    w.name = 'Heirloom of the Crown';
    c.inventory.push(w);
  }
  if (res.rareFate) c.flags.rareFate = res.rareFate.id;
}

function giveStartingKit(c) {
  const cls = CLASS_BY_ID[c.cls];
  const rng = new RNG(7);
  const k = cls.kit;
  const wtype = k.mainhand === 'rapier' ? 'sword' : k.mainhand;
  c.equip.mainhand = makeWeapon(wtype, 1, 0, rng, { base: k.mainhand === 'rapier' ? 'Rapier' : undefined });
  if (k.offhand === 'shield') c.equip.offhand = makeShield(1, 0, rng);
  for (const slot of ['chest', 'legs', 'boots']) c.equip[slot] = makeArmor(slot, k.armor, 1, 0, rng);
  if (k.tome) {
    const t = makeTome(k.tome, 1, 1, 1, rng);
    c.equip.tome = t;
    const spells = spellsForTome(k.tome, 1).map((s) => s.id);
    spells.forEach((s, i) => { c.skillBar[i] = s; });
  }
  for (const s of cls.skills) { c.skills.push(s); const sk = SKILLS[s]; if (sk.type !== 'passive') { const free = c.skillBar.indexOf(null); if (free >= 0) c.skillBar[free] = s; } }
  c.consumables = { hp_potion: 5, mana_potion: 3 };
}

function showPrologue(c, done) {
  G.mode = 'prologue';
  const race = RACE_BY_ID[c.race];
  const s = el('div', 'screen');
  s.style.background = 'rgba(0,0,0,0.88)';
  const pr = el('div', 'prologue');
  const lines = [...race.prologue];
  if (c.rareFate) lines.push(`And the dice whisper a second story: ${c.rareFate.desc}`);
  for (const l of lines) pr.appendChild(el('p', '', esc(l)));
  s.appendChild(el('div', 'kicker', `<div class="title-sub" style="font-family:var(--label);font-size:var(--lbl-2);margin-bottom:calc(var(--u) * 8)">${esc(c.name.toUpperCase())} · ${esc(race.name.toUpperCase())} ${esc(CLASS_BY_ID[c.cls].name.toUpperCase())}</div>`));
  s.appendChild(pr);
  const skip = el('div', 'skip', 'CLICK TO CONTINUE');
  s.appendChild(skip);
  root().appendChild(s);
  const ps = [...pr.children];
  let i = 0;
  const next = () => {
    if (i < ps.length) { ps[i++].classList.add('on'); return; }
    s.removeEventListener('mousedown', next);
    s.style.transition = 'opacity 1.2s'; s.style.opacity = '0';
    setTimeout(() => { s.remove(); done(); }, 1200);
  };
  s.addEventListener('mousedown', next);
  next();
  const auto = setInterval(() => { if (!s.isConnected) return clearInterval(auto); if (i < ps.length) next(); }, 4200);
}

function spawnPlayerAtHome(c) {
  const race = RACE_BY_ID[c.race];
  atmo.timeOfDay = 0.29;
  atmo.day = 1;
  const town = TOWNS.find((t) => t.id === race.home);
  enterWorld('surface', town.x + 6, town.z + town.r * 0.35, () => {
    startQuest(race.openingQuest);
    if (c.rareFate) setTimeout(() => toast(`A hidden fate stirs: <b style="color:#ff9a50">${esc(c.rareFate.title)}</b>. Someone in this land knows your name.`, '', 6000), 8000);
    setTimeout(() => startTutorial(), 1800);
    saveGame(0);
  });
}

function continueGame() {
  const c = loadGame(0);
  if (!c) return newGame();
  G.char = c;
  migrateChar(c);
  atmo.timeOfDay = c.timeOfDay ?? 0.3;
  atmo.day = c.day || 1;
  const p = c.pos || { x: 200, z: 540, realm: 'surface' };
  let x = p.x, z = p.z;
  if (p.inDungeon && p.rx !== undefined) { x = p.rx; z = p.rz; }
  enterWorld(p.realm || 'surface', x, z, () => {
    toast(`Welcome back, ${esc(c.name)}.`);
    // a fresh character that never finished training picks it up again
    if (!c.flags.tutorialDone && c.level <= 2 && (c.playTime || 0) < 900 && !p.inDungeon) setTimeout(() => startTutorial(), 1500);
  });
}

function migrateChar(c) {
  c.discovered = c.discovered || { waystones: [], dungeons: [], towns: [], shrines: [], landmarks: [] };
  c.discovered.landmarks = c.discovered.landmarks || [];
  c.worldBossTimers = {};
  c.bonusStats = c.bonusStats || { str: 0, dex: 0, int: 0, vit: 0, wil: 0 };
  c.relicsTaken = c.relicsTaken || [];
  c.fogData = null;
}

// ============================================================================ world entry
let loadingUI = null;
function enterWorld(realm, x, z, after) {
  G.mode = 'loading';
  hideHud();
  loadingUI = el('div', 'loading', `<div class="title-logo"></div><div class="bar"><div></div></div><div class="hint">${esc(randomHint())}</div>`);
  loadingUI.querySelector('.title-logo').appendChild(pxTitle('Ashen Crown', 3));
  root().appendChild(loadingUI);
  cam.cinematic = null;
  atmo.indoor = realm === 'deep';
  atmo.indoorCfg = realm === 'deep' ? deepCfg : null;
  if (terrain.realm !== realm) setRealm(realm);
  setTerrainVisible(true);
  G.realm = realm;
  if (!G.player) { G.player = new Player(G.char); }
  const p = G.player;
  p.pos.set(x, groundHeight(x, z), z);
  snapCamera(p.pos);
  const start = performance.now();
  const wait = () => {
    updateTerrain(0.016, p.pos.x, p.pos.z);
    const prog = terrainProgress();
    const bar = loadingUI?.querySelector('.bar div');
    const mapP = (MAP.surface.progress + MAP.deep.progress) / 2;
    if (bar) bar.style.width = `${Math.round(Math.min(1, prog * 0.7 + mapP * 0.3) * 100)}%`;
    if ((terrain.ready && prog > 0.6 && (MAP[realm].ready || performance.now() - start > 9000)) || performance.now() - start > 16000) {
      p.pos.y = groundHeight(p.pos.x, p.pos.z);
      loadingUI.style.transition = 'opacity 1s'; loadingUI.style.opacity = '0';
      setTimeout(() => { loadingUI?.remove(); loadingUI = null; }, 1000);
      G.mode = 'play';
      buildHud();
      refreshSkillbar();
      lastBiome = null; lastTown = null;
      after && after();
      return;
    }
    setTimeout(wait, 30);
  };
  wait();
}

const HINTS = [
  'Tap right-click just before a blow lands to parry. Parries stagger, and some classes riposte.',
  'Spellbooks are required for magic. Higher tiers unlock more spell slots and evolved spells.',
  'A martial skill combined with the right spellbook unlocks a combo: fire tome plus a bow skill makes flame arrows.',
  'Hold left-click after a light attack for a heavy finisher.',
  'Some shrines only wake at night, at dusk, or in strange weather.',
  'World bosses appear with the weather: the Glass Wyrm rides glass storms, the Leviathan rises with the thunder.',
  'Living labyrinths rearrange themselves. Watch for the warning tremor.',
  'Touch waystones to attune them. Then fast travel from the map (M).',
  'Ancient battlefields hide relics that still remember how to fight.',
  'Crimes raise your bounty. Guards everywhere talk to each other.',
];
function randomHint() { return HINTS[Math.floor(Math.random() * HINTS.length)]; }

const deepCfg = { fog: '#0e0c18', ambient: '#8a9ac8', light: '#80c0ff', deep: true };

// ============================================================================ interactions
let interactCooldown = 0;
function findInteraction() {
  const p = G.player;
  let best = null, bd = 1e9;
  for (const it of G.interactables) {
    if (it.realm && it.realm !== G.realm && !(G.realm === 'dungeon' && it.site === 'dungeon')) continue;
    if (G.realm === 'dungeon' && it.site !== 'dungeon') continue;
    const d = Math.hypot(it.x - p.pos.x, it.z - p.pos.z);
    if (d < it.r && d < bd) { bd = d; best = { kind: 'it', it }; }
  }
  for (const e of G.entities) {
    if (!e.isNpc || e.dead || e.removed || e.hunting) continue;
    const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
    if (d < 3.2 && d < bd + 0.5) { bd = d; best = { kind: 'npc', npc: e }; }
  }
  return best;
}

function promptFor(f) {
  if (!f) return null;
  if (f.kind === 'npc') return `Talk to ${f.npc.name}${f.npc.title ? ', ' + f.npc.title : ''}`;
  const it = f.it;
  if (it.kind === 'shrine') return G.char.shrinesUsed.includes(it.data.id) ? `${it.data.name} (spent)` : shrineAwake(it.data) ? `Pray at ${it.data.name}` : `${it.data.name} (dormant)`;
  return it.label;
}

function interact(f) {
  if (!f || interactCooldown > 0) return;
  interactCooldown = 0.4;
  if (f.kind === 'npc') { talkTo(f.npc); return; }
  const it = f.it;
  const c = G.char;
  switch (it.kind) {
    case 'waystone': {
      if (!c.discovered.waystones.includes(it.data.id)) {
        c.discovered.waystones.push(it.data.id);
        bus.emit('waystone');
        pillar(it.x, G.player.pos.y, it.z, { radius: 1.5, height: 20, color: '#90c8ff', dur: 1 });
        toast(`Waystone attuned: <b>${esc(it.data.name)}</b>`);
        rebuildAll();
        saveGame(0);
      } else openMap();
      break;
    }
    case 'dungeon': {
      const d = it.data;
      if (d.level > c.level + 8 && !it.warned) { it.warned = true; toast(`${esc(d.name)} is level ${d.level}. Death waits within. Press E again to enter anyway.`); interactCooldown = 0.1; return; }
      if (G.player.mounted) G.player.toggleMount();
      const back = new Vec3(it.x + Math.sin(it.entranceAngle) * 3, 0, it.z + Math.cos(it.entranceAngle) * 3);
      back.y = groundHeight(back.x, back.z);
      transition(() => {
        enterDungeon(d, back);
        if (!c.discovered.dungeons.includes(d.id)) c.discovered.dungeons.push(d.id);
        snapCamera(G.player.pos);
        banner(DUNGEONS_THEME_NAME(d), d.name, `Level ${d.level}${d.shard ? ' · A Crown Shard lies within' : ''}`);
        setMusic('dungeon');
      });
      break;
    }
    case 'exit': transition(() => { exitDungeon(); snapCamera(G.player.pos); lastBiome = null; saveGame(0); }); break;
    case 'chest': openChest(it.data); G.interactables = G.interactables.filter((x) => x !== it); break;
    case 'shrine': activateShrine(it.data); break;
    case 'relic': {
      const r = it.data;
      if (c.relicsTaken.includes(r.id)) return;
      c.relicsTaken.push(r.id);
      const learned = learnSkill(r.skill);
      pillar(it.x, G.player.pos.y, it.z, { radius: 1, height: 14, color: '#ffd080', dur: 1 });
      toast(learned ? `The ${esc(r.name)} remembers its last battle. You learn <b>${esc(SKILLS[r.skill].name)}</b>!` : `The ${esc(r.name)} has nothing left to teach you.`, '', 6000);
      refreshSkillbar();
      G.interactables = G.interactables.filter((x) => x !== it);
      break;
    }
    case 'gate': {
      const g = it.data;
      if (g.to === 'deep' && !isActive('q_main_3') && c.level < 45 && !it.warned) { it.warned = true; toast('The Hollow Deep swallows the unprepared (level 50+). Press E again to descend anyway.'); interactCooldown = 0.1; return; }
      transition(() => { switchRealm(g.to, g.tx, g.tz); });
      break;
    }
  }
}
function DUNGEONS_THEME_NAME(d) { return d.shard ? 'A Crown Shard Dungeon' : d.final ? 'The End of All Roads' : 'You enter'; }

function activateShrine(sh) {
  const c = G.char;
  if (c.shrinesUsed.includes(sh.id)) { toast('This shrine has already blessed you.'); return; }
  if (!shrineAwake(sh)) { const why = { night: 'It wakes only at night.', dusk: 'It wakes only at dusk.' }[sh.cond] || `It wakes only during a ${sh.cond}.`; toast(`The shrine is dormant. ${why}`); return; }
  c.shrinesUsed.push(sh.id);
  for (const [k, v] of Object.entries(sh.boon)) c.shrineBoons[k] = (c.shrineBoons[k] || 0) + v;
  G.player.refreshStats();
  pillar(sh.x, G.player.pos.y, sh.z, { radius: 2, height: 30, color: '#a0ffd0', dur: 1.5 });
  burst(sh.x, G.player.pos.y + 1, sh.z, { count: 80, speed: 5, color: '#c0ffe0', life: 1.8, up: 1.5 });
  const txt = Object.entries(sh.boon).map(([k, v]) => `+${v}${k.endsWith('Pct') || k.endsWith('Res') ? '%' : ''} ${k.replace('Pct', '').replace('Res', ' res.').replace('maxHp', 'max health').replace('maxMana', 'max mana')}`).join(', ');
  banner('A shrine blesses you', sh.name, txt);
  bus.emit('shrineBlessed', sh);
  saveGame(0);
}

let fadeT = 0;
function transition(fn) {
  R.fade = 0;
  fadeT = 0.001;
  const steps = 18;
  let i = 0;
  const iv = setInterval(() => {
    i++;
    R.fade = Math.min(1, i / (steps / 2));
    if (i === Math.ceil(steps / 2)) { try { fn(); } catch (e) { console.error(e); } }
    if (i > steps / 2) R.fade = Math.max(0, 1 - (i - steps / 2) / (steps / 2));
    if (i >= steps) { clearInterval(iv); R.fade = 0; }
  }, 45);
}

function switchRealm(realm, x, z) {
  clearCombat(); clearSpawns(false); clearPickups();
  G.interactables = [];
  rebuildAll();
  setRealm(realm);
  G.realm = realm;
  atmo.indoor = realm === 'deep';
  atmo.indoorCfg = realm === 'deep' ? deepCfg : null;
  G.player.pos.set(x, heightAt(x, z, realm), z);
  snapCamera(G.player.pos);
  lastBiome = null;
  if (realm === 'deep') banner('You descend into', 'The Hollow Deep', 'Lantern-lit kingdoms beneath the world, where the old crown fell.');
}

function fastTravel(w) {
  const p = G.player;
  if (G.realm === 'dungeon') { toast('You cannot fast travel from inside a dungeon.'); return; }
  if (G.time - p.lastCombatT < 4) { toast('You cannot fast travel during combat.'); return; }
  closeModal();
  transition(() => {
    if (p.mounted) p.toggleMount();
    if (w.realm !== G.realm) switchRealm(w.realm, w.x + 3, w.z + 3);
    else { clearSpawns(true); clearPickups(); p.pos.set(w.x + 3, groundHeight(w.x + 3, w.z + 3), w.z + 3); snapCamera(p.pos); }
    lastBiome = null;
  });
}
bus.on('fastTravel', fastTravel);
bus.on('recall', () => {
  const c = G.char;
  const list = WAYSTONES.filter((w) => c.discovered.waystones.includes(w.id) && w.realm === (G.realm === 'dungeon' ? G.dungeon.returnRealm : G.realm));
  if (!list.length) { toast('You have not attuned any waystones.'); return; }
  const p = G.realm === 'dungeon' ? G.dungeon.returnPos : G.player.pos;
  list.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
  if (G.realm === 'dungeon') { transition(() => { exitDungeon(); G.player.pos.set(list[0].x + 3, groundHeight(list[0].x + 3, list[0].z + 3), list[0].z + 3); snapCamera(G.player.pos); }); }
  else fastTravel(list[0]);
});

// ============================================================================ death & respawn
let deathShown = false;
bus.on('kill', ({ victim }) => {
  if (!victim.isPlayer || deathShown) return;
  deathShown = true;
  G.char.deaths++;
  setTimeout(() => showDeath(respawn), 2200);
});
function respawn() {
  deathShown = false;
  const c = G.char, p = G.player;
  const lost = Math.floor(c.gold * 0.1);
  c.gold -= lost;
  const realm = G.realm === 'dungeon' ? G.dungeon.returnRealm : G.realm;
  const from = G.realm === 'dungeon' ? G.dungeon.returnPos : p.pos;
  let dest = WAYSTONES.filter((w) => c.discovered.waystones.includes(w.id) && w.realm === realm).sort((a, b) => Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z))[0];
  if (!dest) { const t = TOWNS.find((t) => t.id === RACE_BY_ID[c.race].home); dest = { x: t.x, z: t.z, realm: 'surface' }; }
  transition(() => {
    if (G.realm === 'dungeon') exitDungeon();
    if (dest.realm && dest.realm !== G.realm) switchRealm(dest.realm, dest.x + 3, dest.z + 3);
    p.dead = false; p.deathT = 0; p.hp = p.maxHp; p.mana = p.maxMana; p.stamina = p.maxStamina;
    p.status = {}; p.frozen = 0; p.stun = 0; p.root = 0;
    p.st.dead = false;
    clearSpawns(true);
    p.pos.set(dest.x + 3, groundHeight(dest.x + 3, dest.z + 3), dest.z + 3);
    snapCamera(p.pos);
    p.invuln = 3;
    if (lost) toast(`You lost ${lost} gold.`);
  });
}

// ============================================================================ event-driven UI
bus.on('toast', (m) => toast(esc(m)));
bus.on('itemGained', (it) => toast(`<span class="r-${it.rarity}">${esc(it.name)}</span>`, 'loot', 2600));
bus.on('rareDrop', (it) => { if (RARITY[it.rarity].index >= 4) banner('A relic answers your call', it.name, LEGENDARIES[it.legendary]?.powerText || 'Legendary'); });
bus.on('questStarted', ({ def }) => toast(`New quest: <b class="gold">${esc(def.name)}</b>`, '', 4000));
bus.on('questStep', ({ def, step }) => toast(`${esc(def.name)}: ${esc(step.text || 'next objective')}`, '', 4000));
bus.on('questComplete', ({ def, rewards }) => { banner('Quest complete', def.name, rewards.join(' · ')); refreshSkillbar(); saveGame(0); });
bus.on('levelUp', (lvl) => { banner('Your legend grows', `Level ${lvl}`, `+3 attribute points (C) · Recommended danger: ${lvl}`); if (G.char.fateScar && lvl >= 20) { G.char.fateScar = false; G.player.refreshStats(); toast('Your Fate Scar has healed. You made your own fate.', '', 6000); } saveGame(0); });
bus.on('skillLearned', (id) => { toast(`Skill learned: <b class="gold">${esc(SKILLS[id].name)}</b>`, '', 5000); refreshSkillbar(); });
bus.on('rep', ({ faction, amount, tier, changed }) => { if (changed) toast(`Standing with ${esc(faction)} is now <b>${esc(tier)}</b>`, '', 4000); });
bus.on('bountyPaid', ({ amount }) => toast(`Paid ${amount} gold. Your bounty is cleared.`));
bus.on('worldBossAppears', ({ boss, def }) => { banner('The world trembles', boss.name, `A world boss has appeared nearby (Lv ${boss.level})`); addShake(0.6); });
bus.on('dungeonCleared', ({ def }) => { setTimeout(() => banner('Dungeon cleared', def.name, def.shard ? 'A Crown Shard glows among the spoils' : 'Its master is slain'), 1500); G.char.cleared[def.id] = true; saveGame(0); });
bus.on('crownShard', (s) => { G.char.flags.shards = [...new Set([...(G.char.flags.shards || []), s])]; banner('A Crown Shard', `Shard of the ${({ wastes: 'Waste', gilded: 'Throne', verdant: 'Root', coast: 'Tide', frost: 'Winter', deep: 'Hollow King' })[s] || s}`, `${G.char.flags.shards.length} of 6 shards recovered`); });
bus.on('rivalNear', (rv) => toast(`<b class="gold">${esc(rv.name)}</b> blocks the road. ${esc(rv.line)}`, '', 6000));
bus.on('rivalDefeated', (rv) => { G.char.flags['rival_' + rv.id] = true; const ok = learnSkill(rv.teaches); toast(`${esc(rv.name)} yields. ${ok ? `They teach you <b class="gold">${esc(SKILLS[rv.teaches].name)}</b>.` : ''}`, '', 6000); });
bus.on('bossPhase', ({ boss, phase }) => toast(`${esc(boss.name)} grows ${phase === 3 ? 'desperate' : 'enraged'}!`));
bus.on('mazeShift', () => toast('The labyrinth rearranges itself!'));
bus.on('equipped', () => refreshSkillbar());
bus.on('contractStarted', () => {});
bus.on('crime', () => {});

// ============================================================================ region tracking
let lastBiome = null, lastTown = null, regionT = 0, saveT = 60, discoverT = 0;
function updateRegion(dt) {
  const p = G.player;
  regionT -= dt;
  if (regionT > 0) return;
  regionT = 0.5;
  if (G.realm === 'dungeon') { G.inTown = false; return; }
  const b = primaryBiome(p.pos.x, p.pos.z, G.realm);
  G.biome = b;
  atmo.biome = b;
  G.danger = dangerLevel(p.pos.x, p.pos.z, G.realm);
  const towns = G.realm === 'deep' ? DEEP_TOWNS : TOWNS;
  const town = towns.find((t) => Math.hypot(t.x - p.pos.x, t.z - p.pos.z) < t.r + 8);
  G.inTown = !!town;
  if (b !== lastBiome && !town) {
    lastBiome = b;
    const B = BIOMES[b];
    banner('You enter', B.name, B.blurb);
    setMusic(b);
  }
  if (town && town !== lastTown) {
    lastTown = town;
    if (!G.char.discovered.towns.includes(town.id)) G.char.discovered.towns.push(town.id);
    banner(BIOMES[town.biome].short, town.name, town.faction ? `Held by the ${({ sunward: 'Sunward Order', ashen: 'Ashen Court', tidebound: 'Tidebound Guild', choir: 'Silent Choir' })[town.faction]}` : 'A free settlement');
    setMusic(town.biome === 'deep' ? 'deep' : town.biome);
    cam.contextZoom = -0.08;
  } else if (!town && lastTown) { lastTown = null; cam.contextZoom = 0; }
  revealAround(G.realm, p.pos.x, p.pos.z, 80);
  // discovery
  for (const d of DUNGEONS) if ((d.realm || 'surface') === G.realm && !G.char.discovered.dungeons.includes(d.id) && Math.hypot(d.x - p.pos.x, d.z - p.pos.z) < 45) { G.char.discovered.dungeons.push(d.id); toast(`Discovered: <b>${esc(d.name)}</b> (Lv ${d.level})`); }
  const vsMult = G.player.derived.traits.has('void_sight') ? 2 : 1;
  for (const s of SHRINES) if (s.realm === G.realm && !G.char.discovered.shrines.includes(s.id) && Math.hypot(s.x - p.pos.x, s.z - p.pos.z) < 30 * vsMult) { G.char.discovered.shrines.push(s.id); toast(`You sense a shrine: <b>${esc(s.name)}</b>`); }
  for (const l of LANDMARKS) if (G.realm === 'surface' && !G.char.discovered.landmarks.includes(l.id) && Math.hypot(l.x - p.pos.x, l.z - p.pos.z) < 60) { G.char.discovered.landmarks.push(l.id); gainXp(40 + G.char.level * 10); }
  // contract targets
  for (const [id, st] of Object.entries(G.char.quests)) {
    if (st.done || !id.startsWith('contract_')) continue;
    const def = questDef(id);
    const step = def?.steps[st.step];
    if (!step || step.type !== 'bountyKill' || (step.realm || 'surface') !== G.realm) continue;
    if (Math.hypot(step.x - p.pos.x, step.z - p.pos.z) < 110 && !G.entities.some((e) => e.questTag === step.tag && !e.dead)) {
      const e = spawnEnemy(def.contract.enemy, Math.max(G.char.level, def.level), step.x, step.z, { elite: true, name: def.contract.name, questTag: step.tag, hpMult: 1.6, leash: 60 });
      if (e) e.questTag = step.tag;
    }
  }
}

// ============================================================================ main loop
let last = performance.now();
let combatTrack = 0;
G.slowmo = 0;

function frame(now) {
  step(now);
  requestAnimationFrame(frame);
}
// Test hook: advance the simulation without relying on requestAnimationFrame (hidden tabs throttle it)
window.__advance = (sec, fps = 30) => { const n = Math.round(sec * fps); for (let i = 0; i < n; i++) step(last + 1000 / fps); };

function step(now) {
  if (now < last) now = last;
  const rawDt = Math.min(0.05, (now - last) / 1000);
  last = now;
  G.realTime += rawDt;
  G.rawDt = rawDt;
  // hitstop / slow motion
  let scale = 1;
  if (G.hitstop > 0) { G.hitstop -= rawDt; scale = 0.06; }
  if (G.slowmo > 0) { G.slowmo -= rawDt; scale = Math.min(scale, 0.3); }
  const paused = G.menuOpen && G.menuOpen !== 'dialogue' && G.mode === 'play';
  const dt = paused ? 0 : rawDt * scale;
  G.dt = dt;
  G.time += dt;

  try {
    pollGamepad(G.player && G.mode === 'play' ? worldToScreen({ x: G.player.pos.x, y: G.player.pos.y + 1, z: G.player.pos.z }) : null);
    if (G.mode === 'play') playFrame(dt, rawDt);
    else if (G.mode === 'title' || G.mode === 'boot') idleFrame(rawDt, titleFocus);
    else if (G.mode === 'fate') { updateFate(rawDt); updateCamera(rawDt, false); updateAtmosphere(rawDt, new Vec3(-30000, 0, 0), 12, G.weather); updateVfx(rawDt); }
    else if (G.mode === 'prologue' || G.mode === 'loading') { updateCamera(rawDt, false); if (G.player) updateTerrain(rawDt, G.player.pos.x, G.player.pos.z); }
  } catch (e) { console.error(e); }
  renderFrame(G.realTime);
  endFrameInput();
}

let titleT = 0;
function idleFrame(dt, focus) {
  titleT += dt;
  // slow drift across the dunes at dusk
  const a = titleT * 0.04;
  const tx = focus.x + Math.cos(a) * 40, tz = focus.z + Math.sin(a * 0.7) * 25;
  cam.cinematic = { x: tx, z: tz, speed: 0.8 };
  atmo.freezeTime = true;
  updateTerrain(dt, focus.x + Math.cos(titleT * 0.04) * 40, focus.z + Math.sin(titleT * 0.028) * 25);
  updateStructures(dt, tx, tz, 'surface');
  updateCamera(dt, false);
  updateWeather(dt, focus, false);
  updateAtmosphere(dt, focus, 60, G.weather);
  updateVfx(dt);
}

function playFrame(dt, rawDt) {
  const p = G.player;
  atmo.freezeTime = false;
  interactCooldown -= rawDt;
  handleHotkeys();
  const realmFocus = p.pos;
  if (G.realm !== 'dungeon') updateTerrain(dt || 0.001, p.pos.x, p.pos.z);
  updateStructures(dt, p.pos.x, p.pos.z, G.realm);
  if (dt > 0) {
    p.update(dt);
    for (const e of G.entities) e.update(dt);
    cleanupEntities();
    updateProjectiles(dt);
    updateHazards(dt);
    updateTimers(dt);
    updatePickups(dt);
    updateClassMech(dt);
    updateSpawner(dt);
    updateDungeon(dt);
    updateQuests(dt);
  }
  updateRegion(rawDt);
  // combat & boss tracking
  let boss = null, inCombat = false;
  for (const e of G.entities) {
    if (e.dead || e.team !== 'enemy') continue;
    if (e.target === p && e.state === 'chase') inCombat = true;
    if (e.boss && e.target && Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < 50) boss = e;
  }
  if (boss && G.bossActive !== boss) { setMusic('boss'); cam.contextZoom = 0.12; }
  if (!boss && G.bossActive) { cam.contextZoom = 0; lastBiome = null; if (G.realm === 'dungeon') setMusic('dungeon'); }
  G.bossActive = boss;
  G.combatTimer = inCombat ? 4 : Math.max(0, G.combatTimer - dt);
  // prompt
  const f = G.menuOpen ? null : findInteraction();
  G.prompt = promptFor(f);
  if (keyPressed('e') && !G.menuOpen && f) interact(f);
  // camera
  cam.target.copy(p.pos);
  if (p.mounted) cam.target.y += 0.8;
  updateCamera(rawDt, !G.menuOpen);
  const indoor = G.realm === 'dungeon';
  atmo.indoor = indoor || G.realm === 'deep';
  atmo.indoorCfg = G.realm === 'deep' ? deepCfg : indoor ? atmo.indoorCfg : null;
  if (G.realm === 'dungeon' && G.dungeon) atmo.indoorCfg = { fog: G.dungeon.theme.fog, ambient: '#c8b4a4', light: G.dungeon.theme.light };
  updateWeather(rawDt, p.pos, G.realm !== 'surface');
  updateAtmosphere(dt, p.pos, cam.dist, G.weather);
  if (G.realm === 'surface') for (const L of terrain.glowLights) if ((L.x - p.pos.x) ** 2 + (L.z - p.pos.z) ** 2 < 2500) requestLight(L.x, L.y, L.z, L.color, 5, 9);
  updateVfx(rawDt, G.menuOpen && G.menuOpen !== 'dialogue' ? rawDt : dt);
  updateFeel(rawDt);
  updateTutorial(rawDt);
  updateHud(rawDt);
  // autosave
  saveT -= rawDt;
  if (saveT <= 0 && !p.dead) { saveT = 90; G.char.timeOfDay = atmo.timeOfDay; G.char.day = atmo.day; serializeFog(); saveGame(0); }
  G.char.playTime += rawDt;
  G.char.timeOfDay = atmo.timeOfDay; G.char.day = atmo.day;
}

function handleHotkeys() {
  const p = G.player;
  if (dialogueOpen()) {
    for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) if (input.pressed.has(k)) { dialogueKey(k); return; }
    if (input.pressed.has('escape')) { closeDialogue(); return; }
    // walking away closes the conversation
    if (G.talkingTo && Math.hypot(G.talkingTo.pos.x - p.pos.x, G.talkingTo.pos.z - p.pos.z) > 6) closeDialogue();
    return;
  }
  const open = modalName();
  const toggle = (name, fn) => { if (open === name) closeModal(); else fn(); };
  if (input.pressed.has('escape')) { if (open) closeModal(); else openPause(); return; }
  if (input.pressed.has('i') || input.pressed.has('tab')) return toggle('inventory', () => openInventory('inv'));
  if (input.pressed.has('c')) return toggle('inventory', () => openInventory('stats'));
  if (input.pressed.has('k')) return toggle('skills', openSkills);
  if (input.pressed.has('j')) return toggle('journal', () => openJournal());
  if (input.pressed.has('m')) return toggle('map', () => openMap());
  if (input.pressed.has('h')) return toggle('controls', openControls);
  if (open || p.dead) return;
  for (let i = 0; i < 6; i++) if (input.pressed.has(String(i + 1))) { const id = G.char.skillBar[i]; if (id) useAbility(p, id); }
  if (input.pressed.has('q')) useSignature(p);
  if (input.pressed.has('f')) useConsumable('hp_potion');
  if (input.pressed.has('g')) useConsumable('mana_potion');
  if (G.debug && input.pressed.has('backquote')) { gainXp(xpToNext(G.char.level)); }
}

// ============================================================================ start
buildMaps().catch(() => {});
if (params.get('quick')) {
  // dev shortcut: ?quick=race,class
  const [race, cls] = params.get('quick').split(',');
  initAudio().catch(() => {});
  const c = newCharacter({ name: 'Tester', race: race || 'ashborn', cls: cls || 'knight' });
  G.char = c;
  giveStartingKit(c);
  if (params.get('lvl')) { c.level = +params.get('lvl'); c.statPoints = (c.level - 1) * 3; }
  if (params.get('t')) atmo.timeOfDay = +params.get('t');
  G.debug = true;
  const x = params.get('x'), z = params.get('z');
  const home = TOWNS.find((t) => t.id === RACE_BY_ID[c.race].home);
  enterWorld(params.get('realm') || 'surface', x ? +x : home.x + 6, z ? +z : home.z + 10, () => {
    startQuest(RACE_BY_ID[c.race].openingQuest);
    if (params.get('dungeon')) { const d = dungeonDef(params.get('dungeon')); enterDungeon(d, G.player.pos.clone()); snapCamera(G.player.pos); }
    if (params.get('smoke')) import('./dev/smoke.js').then((m) => m.runSmoke(window.__dbg));
    if (params.get('tutorial')) setTimeout(() => startTutorial(), 500);
  });
} else showTitle();
requestAnimationFrame(frame);
