// Achievements. Unlocks are kept on the character and, in the desktop build with Steam running,
// sent to Steam (the ids below must match the API names set up in the Steamworks admin page).
// In a browser, or without Steam, an unlock shows as an in-game toast instead.
import { G } from '../game.js';
import { bus } from '../core/events.js';
import { toast } from '../ui/ui.js';
import { desktop } from '../core/desktop.js';
import { rarityOfRace, rarityOfClass } from '../data/fateRarity.js';
import { RARITY } from '../data/items.js';
import { DUNGEONS } from '../data/world.js';

export const ACHIEVEMENTS = [
  { id: 'ACH_FIRST_BLOOD', name: 'First Blood', desc: 'Slay your first foe.' },
  { id: 'ACH_SLAYER', name: 'Ash and Bone', desc: 'Slay 1,000 foes.' },
  { id: 'ACH_FATE_EPIC', name: 'Touched by Fate', desc: 'Roll an Epic or rarer race or class.' },
  { id: 'ACH_FATE_SUPREME', name: 'Chosen of the Dice', desc: 'Roll a Supreme race or class.' },
  { id: 'ACH_LEVEL_10', name: 'Blooded', desc: 'Reach level 10.' },
  { id: 'ACH_LEVEL_25', name: 'Veteran', desc: 'Reach level 25.' },
  { id: 'ACH_LEVEL_50', name: 'Legend of the Waste', desc: 'Reach level 50.' },
  { id: 'ACH_LEVEL_100', name: 'Crownworthy', desc: 'Reach level 100.' },
  { id: 'ACH_DUNGEON', name: 'Delver', desc: 'Clear a dungeon.' },
  { id: 'ACH_DUNGEON_10', name: 'Tomb Robber', desc: 'Clear 10 dungeons.' },
  { id: 'ACH_DUNGEON_ALL', name: 'Nothing Left Buried', desc: 'Clear every dungeon.' },
  { id: 'ACH_BOSS', name: 'Kingslayer', desc: 'Slay a dungeon boss.' },
  { id: 'ACH_WORLD_BOSS', name: 'Titanfall', desc: 'Slay a world boss.' },
  { id: 'ACH_RIVAL', name: 'Settled Score', desc: 'Defeat your rival.' },
  { id: 'ACH_SHARD', name: 'A Piece of the Crown', desc: 'Recover a Crown Shard.' },
  { id: 'ACH_SHARDS_ALL', name: 'The Crown Remembered', desc: 'Recover all six Crown Shards.' },
  { id: 'ACH_DEEP', name: 'Into the Hollow', desc: 'Descend into the Hollow Deep.' },
  { id: 'ACH_STREAK_50', name: 'Unstoppable', desc: 'Reach a 50-kill streak.' },
  { id: 'ACH_PARRY_25', name: 'Steel Wall', desc: 'Parry 25 attacks.' },
  { id: 'ACH_LEGENDARY', name: 'Fortune Favours', desc: 'Find a Legendary or Mythic item.' },
  { id: 'ACH_MOUNT', name: 'Saddled', desc: 'Ride a mount.' },
  { id: 'ACH_WAYSTONES_5', name: 'Pathfinder', desc: 'Attune 5 waystones.' },
  { id: 'ACH_CRAFT_10', name: 'Forge-Hand', desc: 'Craft 10 items.' },
  { id: 'ACH_ENCHANT', name: 'Runesmith', desc: 'Enchant an item.' },
];
const BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

function unlock(id) {
  const c = G.char, a = BY_ID[id];
  if (!c || !a) return;
  c.achievements ||= [];
  if (c.achievements.includes(id)) return;
  c.achievements.push(id);
  if (desktop?.steam) desktop.achievement(id);
  else toast(`Achievement unlocked: <b style="color:#ffd070">${a.name}</b> · ${a.desc}`);
}
function count(key, n = 1) {
  const c = G.char;
  if (!c) return 0;
  c.achCounts ||= {};
  return (c.achCounts[key] = (c.achCounts[key] || 0) + n);
}

bus.on('kill', ({ victim, killer }) => {
  if (!G.player || killer !== G.player || !victim || victim.team !== 'enemy') return;
  unlock('ACH_FIRST_BLOOD');
  if (count('kills') >= 1000) unlock('ACH_SLAYER');
  if (victim.worldBossId) unlock('ACH_WORLD_BOSS');
});
bus.on('fateSealed', (r) => {
  // the character is created right after the fate is sealed
  setTimeout(() => {
    const best = Math.max(rarityOfRace(r.race).index, rarityOfClass(r.cls).index);
    if (best >= 2) unlock('ACH_FATE_EPIC');
    if (best >= 5) unlock('ACH_FATE_SUPREME');
  }, 0);
});
bus.on('levelUp', (lvl) => {
  for (const [n, id] of [[10, 'ACH_LEVEL_10'], [25, 'ACH_LEVEL_25'], [50, 'ACH_LEVEL_50'], [100, 'ACH_LEVEL_100']]) if (lvl >= n) unlock(id);
});
bus.on('dungeonCleared', () => {
  // runs after main.js has marked the dungeon cleared
  setTimeout(() => {
    const n = Object.keys(G.char?.cleared || {}).length;
    unlock('ACH_DUNGEON');
    if (n >= 10) unlock('ACH_DUNGEON_10');
    if (n >= DUNGEONS.length) unlock('ACH_DUNGEON_ALL');
  }, 0);
});
bus.on('bossSlain', () => unlock('ACH_BOSS'));
bus.on('rivalDefeated', () => unlock('ACH_RIVAL'));
bus.on('crownShard', () => setTimeout(() => {
  unlock('ACH_SHARD');
  if ((G.char?.flags?.shards || []).length >= 6) unlock('ACH_SHARDS_ALL');
}, 0));
bus.on('streak', ({ n }) => { if (n >= 50) unlock('ACH_STREAK_50'); });
bus.on('parry', ({ player }) => { if (player === G.player && count('parries') >= 25) unlock('ACH_PARRY_25'); });
bus.on('rareDrop', (item) => { if ((RARITY[item?.rarity]?.index ?? 0) >= 4) unlock('ACH_LEGENDARY'); });
bus.on('mount', () => unlock('ACH_MOUNT'));
bus.on('waystone', () => { if ((G.char?.discovered?.waystones || []).length >= 5) unlock('ACH_WAYSTONES_5'); });
bus.on('crafted', () => { if (count('crafted') >= 10) unlock('ACH_CRAFT_10'); });
bus.on('enchanted', () => unlock('ACH_ENCHANT'));

// slow checks: entering the Deep, and re-sending a loaded character's unlocks to Steam (covers
// anything earned before Steam was set up, or while it was offline)
let synced = null;
setInterval(() => {
  const c = G.char;
  if (!c || G.mode !== 'play') return;
  if (G.realm === 'deep') unlock('ACH_DEEP');
  if (synced !== c && desktop?.steam) { synced = c; for (const id of c.achievements || []) desktop.achievement(id); }
}, 3000);
