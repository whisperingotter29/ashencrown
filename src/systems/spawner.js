// Spawns open-world enemies (biome/danger/time/weather), camps, world bosses, rivals and bounty marks.
import { G } from '../game.js';
import { Enemy } from '../entities/enemy.js';
import { NPC, spawnTownNpcs } from '../entities/npc.js';
import { SPAWN_TABLES, NIGHT_EXTRAS, WEATHER_EXTRAS, ENEMIES } from '../data/enemies.js';
import { TOWNS, DEEP_TOWNS, WORLD_BOSSES, DUNGEONS } from '../data/world.js';
import { primaryBiome, dangerLevel, heightAt, waterAt } from '../world/terrainGen.js';
import { RNG, hashStr, rand, pick, chance } from '../core/rng.js';
import { isNight } from '../world/atmosphere.js';
import { bus } from '../core/events.js';
import { burst } from '../render/vfx.js';
import { queryColliders } from './collision.js';
import { activeKillObjectives } from './quests.js';

const MAX_OPEN = 46;          // grindy: the wilds are crowded
let spawnT = 0;
const townNpcs = new Map();       // town id -> [npc]
const campsAlive = new Map();     // camp key -> enemies
const campCooldown = new Map();
const wbState = {};
const rng = new RNG(99);

export function liveEnemies() { return G.entities.filter((e) => !e.dead && e.team === 'enemy'); }

export function addEntity(e) { G.entities.push(e); return e; }

export function spawnEnemy(id, level, x, z, opts = {}) {
  if (!ENEMIES[id]) { console.warn('unknown enemy', id); return null; }
  // co-op guests see the host's enemies; only their own summons are theirs to make
  if (G.net?.role === 'guest' && !opts.ally) return null;
  const e = new Enemy(id, level, x, z, opts);
  return addEntity(e);
}

bus.on('spawnEnemy', ({ id, level, x, z, summoner, dungeon }) => {
  const e = spawnEnemy(id, level, x, z, { dungeon, leash: 60 });
  if (e && summoner) { summoner.summons.push(e); e.target = summoner.target; e.state = 'chase'; }
});
// packs fight together: when one notices you, its neighbours come too
bus.on('aggro', (e) => {
  if (!e?.target || e.ally) return;
  for (const o of G.entities) {
    if (o === e || o.dead || o.team !== 'enemy' || o.ally || o.target || o.boss) continue;
    if ((o.pos.x - e.pos.x) ** 2 + (o.pos.z - e.pos.z) ** 2 < 120) { o.target = e.target; o.state = 'chase'; }
  }
});
bus.on('spawnAlly', ({ id, x, z, lifeTime, owner, champion }) => {
  const lvl = owner.level;
  const e = spawnEnemy(id, lvl, x, z, { ally: true, lifeTime, hpMult: champion ? 1.8 : 1, dmgMult: champion ? 1.8 : 1, scale: champion ? 1.3 : 1, name: champion ? 'Skeletal Champion' : undefined });
  if (e) { e.owner = owner; e.champion = champion; owner.minions.push(e); }
});

function isTownNear(x, z, r = 80) {
  for (const t of G.realm === 'deep' ? DEEP_TOWNS : TOWNS) if (Math.hypot(t.x - x, t.z - z) < t.r + r) return true;
  return false;
}

function goodSpot(x, z) {
  const realm = G.realm;
  const h = heightAt(x, z, realm);
  if (h < waterAt(x, z, realm).level + 0.3) return false;
  if (realm === 'deep' && h > 5) return false;
  if (queryColliders(x, z, 1.5).some((c) => c.hw === undefined ? Math.hypot(c.x - x, c.z - z) < c.r + 1 : true)) return false;
  return true;
}

function pickTable(biome) {
  const t = [...(SPAWN_TABLES[biome] || SPAWN_TABLES.gilded)];
  if (isNight()) for (const e of NIGHT_EXTRAS[biome] || []) t.push(e);
  const w = G.weather?.id;
  if (w && WEATHER_EXTRAS[w]) for (const e of WEATHER_EXTRAS[w]) t.push([e[0], e[1] * 1.5]);
  return t;
}

// every hero the wilds spawn around: this player plus co-op partners in the same place
function heroes() {
  const list = [G.player];
  if (G.net) for (const g of G.net.ghosts()) if (!g.away) list.push(g);
  return list;
}
function nearestHero(x, z, list) {
  let best = 1e9;
  for (const h of list) best = Math.min(best, Math.hypot(h.pos.x - x, h.pos.z - z));
  return best;
}

export function updateSpawner(dt) {
  const p = G.player;
  if (!p || G.realm === 'dungeon') return;
  spawnT -= dt;
  // co-op guests: the host spawns the enemies; town folk are local
  if (G.net?.role === 'guest') { if (spawnT <= 0) { spawnT = 0.9; updateTownNpcs(p); } return; }
  const hs = heroes();
  // despawn far enemies
  for (const e of G.entities) {
    if (e.removed || e.isNpc || e.team === 'player') continue;
    const d = nearestHero(e.pos.x, e.pos.z, hs);
    if (d > (e.boss ? 220 : 140)) { e.removeModel(); e.dead = true; e.despawned = true; }
  }
  if (spawnT <= 0) {
    spawnT = 0.9;
    // packs appear around a random hero; a bigger party gets a busier world
    const anchor = hs[Math.floor(Math.random() * hs.length)];
    const inTown = isTownNear(anchor.pos.x, anchor.pos.z, 30);
    const n = liveEnemies().filter((e) => !e.camp && !e.world && !e.questTag).length;
    if (!inTown && n < MAX_OPEN * (1 + (hs.length - 1) * 0.5)) {
      // spawn a pack just off-screen
      const a = Math.random() * Math.PI * 2, r = rand(46, 72);
      const x = anchor.pos.x + Math.cos(a) * r, z = anchor.pos.z + Math.sin(a) * r;
      if (!isTownNear(x, z, 40) && goodSpot(x, z)) {
        const biome = primaryBiome(x, z, G.realm);
        const lvl = dangerLevel(x, z, G.realm);
        const id = rng.weighted(pickTable(biome));
        const tpl = ENEMIES[id];
        const [lo, hi] = tpl.pack || [1, 2];
        const count = Math.floor(rand(lo + 1, hi * 2 + 2));   // bigger packs to mow through
        const elite = chance(0.07 + Math.min(0.08, lvl * 0.002));
        for (let i = 0; i < count; i++) {
          const ex = x + rand(-4, 4), ez = z + rand(-4, 4);
          if (!goodSpot(ex, ez)) continue;
          spawnEnemy(id, lvl + Math.floor(rand(-1, 2)), ex, ez, { elite: elite && i === 0 });
        }
      }
    }
    updateCamps(hs);
    updateHunts(p);
    updateWorldBosses(p, hs);
    updateTownNpcs(p);
  }
}

// Quest hunting grounds: keep a pack of each active kill objective's targets at its marked spot
// while the player is nearby, so "kill 5 looters" always has looters where the marker points.
const huntCd = new Map();
function updateHunts(p) {
  for (const h of activeKillObjectives()) {
    const g = h.ground;
    if (g.realm !== G.realm) continue;
    const d = Math.hypot(g.x - p.pos.x, g.z - p.pos.z);
    if (d > 110) continue;
    const tag = 'hunt:' + h.quest + ':' + h.obj;
    const alive = G.entities.filter((e) => !e.dead && !e.removed && e.questTag === tag).length;
    const want = Math.min(4, h.left + 1);
    if (alive >= want || (huntCd.get(tag) || 0) > G.time) continue;
    huntCd.set(tag, G.time + (alive ? 6 : 2));
    const lvl = Math.max(1, dangerLevel(g.x, g.z, G.realm));
    for (let k = alive; k < want; k++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 6;
      const x = g.x + Math.cos(a) * r, z = g.z + Math.sin(a) * r;
      if (!goodSpot(x, z)) continue;
      const id = Array.isArray(h.enemy) ? pick(h.enemy) : h.enemy;
      if (!ENEMIES[id]) continue;
      const e = spawnEnemy(id, lvl, x, z, { questTag: tag, leash: 40 });
      if (e) e.questTag = tag;
    }
  }
}

// Fixed camps near dungeon entrances & on the road: bandits around their fires, beasts at dens.
function updateCamps(hs) {
  if (G.realm !== 'surface' && G.realm !== 'deep') return;
  for (const d of DUNGEONS) {
    if ((d.realm || 'surface') !== G.realm) continue;
    const key = 'camp:' + d.id;
    const dist = nearestHero(d.x, d.z, hs);
    if (dist < 90 && dist > 30 && !campsAlive.has(key) && (campCooldown.get(key) || 0) < G.time) {
      const theme = d.theme;
      const pool = d.denOf || { bandit_hideout: ['bandit', 'bandit_archer'], pirate_cove: ['corsair', 'corsair_gunner'], cursed_crypt: ['skeleton', 'skeleton_archer'], void_rift: ['void_wretch'], fungal_warren: ['fungal_shambler', 'spore_sprite'], glass_cavern: ['glass_beetle'], frozen_citadel: ['frozen_knight', 'frost_wolf'], sunken_temple: ['drowned_sailor', 'tidecrab'], marble_vault: ['gilded_revenant', 'looter'], dwarven_deephall: ['deep_crawler'], dragon_lair: ['drakeling', 'ember_cultist'], buried_colossus: ['sand_wraith', 'ash_scorpion'], living_labyrinth: ['thornwolf'] }[theme] || ['bandit'];
      const list = [];
      const n = 3 + (hashStr(d.id) % 3);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, r = 9 + (i % 2) * 3;
        const x = d.x + Math.cos(a) * r, z = d.z + Math.sin(a) * r;
        const e = spawnEnemy(pick(pool), d.level + Math.floor(rand(-1, 1)), x, z, { camp: key, leash: 35 });
        if (e) list.push(e);
      }
      campsAlive.set(key, list);
    }
    const alive = campsAlive.get(key);
    if (alive && alive.every((e) => e.dead)) { campsAlive.delete(key); campCooldown.set(key, G.time + 300); }
    if (alive && dist > 150) { for (const e of alive) if (!e.dead) { e.removeModel(); e.dead = true; e.despawned = true; } campsAlive.delete(key); }
  }
}

function updateWorldBosses(p, hs) {
  for (const wb of WORLD_BOSSES) {
    if ((wb.realm || 'surface') !== G.realm) continue;
    const st = wbState[wb.id] || (wbState[wb.id] = { alive: null });
    const cond = !wb.cond || (wb.cond === 'night' ? isNight() : G.weather?.id === wb.cond && G.biome === wb.biome);
    const dist = nearestHero(wb.x, wb.z, hs);
    const respawnAt = G.char.worldBossTimers[wb.id] || 0;
    if (!st.alive && cond && dist < wb.roam + 120 && G.time > respawnAt) {
      const a = Math.random() * Math.PI * 2;
      const x = wb.x + Math.cos(a) * wb.roam * 0.4, z = wb.z + Math.sin(a) * wb.roam * 0.4;
      const e = spawnEnemy(wb.enemy, wb.level, x, z, { leash: wb.roam * 2, aggroR: 34 });
      if (e) {
        e.worldBossId = wb.id;
        st.alive = e;
        e.onKilled = () => { st.alive = null; G.char.worldBossTimers[wb.id] = G.time + 900; };
        bus.emit('worldBossAppears', { boss: e, def: wb });
      }
    }
    if (st.alive && (st.alive.dead || st.alive.removed)) st.alive = null;
    if (st.alive && !cond && !st.alive.target) { st.alive.removeModel(); st.alive.dead = true; st.alive = null; bus.emit('toast', 'The world boss fades with the weather.'); }
  }
  // rivals walking the roads
  for (const rv of RIVALS) {
    const st = wbState[rv.id] || (wbState[rv.id] = { alive: null });
    if (G.realm !== 'surface' || G.char.flags['rival_' + rv.id]) continue;
    const dist = Math.hypot(rv.x - p.pos.x, rv.z - p.pos.z);
    if (!st.alive && dist < 70) {
      const e = spawnEnemy(rv.enemy, Math.max(rv.level, p.level), rv.x, rv.z, { name: rv.name, leash: 40, aggroR: 14, hpMult: 0.15 });
      if (e) { e.rivalDef = rv; st.alive = e; e.onKilled = () => { st.alive = null; bus.emit('rivalDefeated', rv); }; bus.emit('rivalNear', rv); }
    }
    if (st.alive && (st.alive.dead || st.alive.removed)) st.alive = null;
  }
}

export const RIVALS = [
  { id: 'sabine', enemy: 'rival_duelist', name: 'Sabine the Unbeaten', x: 520, z: 760, level: 16, teaches: 'riposte', line: '"You carry that blade like a stranger. Shall we be introduced?"' },
  { id: 'grunk', enemy: 'bandit_brute', name: 'Grunk Ironhide', x: 300, z: -680, level: 10, teaches: 'whirlwind', line: '"Grunk wants fair fight! Grunk wins fair fights!"' },
  { id: 'palearcher', enemy: 'bandit_archer', name: 'The Pale Archer', x: -760, z: 700, level: 14, teaches: 'volley', line: '"Shoot me first. I insist."' },
];

function updateTownNpcs(p) {
  const towns = G.realm === 'deep' ? DEEP_TOWNS : G.realm === 'surface' ? TOWNS : [];
  for (const t of towns) {
    const d = Math.hypot(t.x - p.pos.x, t.z - p.pos.z);
    const has = townNpcs.has(t.id);
    if (d < 140 && !has) {
      const npcs = spawnTownNpcs(t, G.realm);
      for (const n of npcs) addEntity(n);
      townNpcs.set(t.id, npcs);
      if (G.char.bounty[t.faction || t.id] > 300) for (const n of npcs) if (n.role === 'guard') n.hunting = true;
    } else if (has && d > 180) {
      for (const n of townNpcs.get(t.id)) { n.removeModel(); n.dead = true; n.despawned = true; }
      townNpcs.delete(t.id);
    }
  }
}

export function clearSpawns(keepNpcs = false) {
  // co-op partners' heroes stay
  const keep = (e) => e.isRemote || (keepNpcs && e.isNpc);
  for (const e of G.entities) { if (keep(e)) continue; e.removeModel(); }
  G.entities = G.entities.filter(keep);
  G.net?.onSpawnsCleared();
  campsAlive.clear();
  for (const k in wbState) wbState[k].alive = null;
  if (!keepNpcs) townNpcs.clear();
}

export function townNpcList(id) { return townNpcs.get(id) || []; }
export function allTownNpcs() { return [...townNpcs.values()].flat(); }

export function cleanupEntities() {
  G.entities = G.entities.filter((e) => !e.removed);
}
