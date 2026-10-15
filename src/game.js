// Shared game state. Systems read and write through G so modules stay loosely coupled.
import { Vec3 } from './core/vec3.js';

export const G = {
  mode: 'boot',          // boot | title | fate | prologue | play | dead | ending
  time: 0,               // scaled game time (seconds)
  realTime: 0,
  dt: 0,
  timeScale: 1,
  hitstop: 0,
  realm: 'surface',      // surface | deep | dungeon
  player: null,
  entities: [],          // enemies, npcs, allies (anything with update/hp)
  projectiles: [],
  hazards: [],
  pickups: [],
  interactables: [],
  dungeon: null,
  char: null,            // persistent character data (saved)
  settings: { music: 0.5, sfx: 0.7, pixel: 'auto', glow: true, damageNumbers: true, screenShake: 1, vibration: true, magicFx: true },
  paused: false,
  menuOpen: null,
  biome: 'wastes',
  region: null,
  danger: 1,
  weather: null,
  combatTimer: 0,        // >0 while in combat (drives music intensity)
  bossActive: null,
  messages: [],
  tmpV: new Vec3(),
  aimPoint: new Vec3(),
  debug: false,
};

export const CHAR_VERSION = 3;

export function newCharacter({ name, race, cls, fateLocked, fateScar, rareFate, doubles }) {
  return {
    v: CHAR_VERSION,
    name, race, cls, level: 1, xp: 0, statPoints: 0,
    stats: { str: 5, dex: 5, int: 5, vit: 5, wil: 5 },
    bonusStats: { str: 0, dex: 0, int: 0, vit: 0, wil: 0 },
    shrineBoons: {},
    gold: 30,
    inventory: [],
    equip: { mainhand: null, offhand: null, tome: null, helm: null, chest: null, gloves: null, legs: null, boots: null, amulet: null, ring1: null, ring2: null },
    materials: {},
    consumables: { hp_potion: 5, mana_potion: 2 },
    skills: [],
    skillBar: [null, null, null, null, null, null],
    quests: {},
    questOrder: [],
    trackedQuest: null,
    flags: {},
    discovered: { waystones: [], dungeons: [], towns: [], shrines: [], landmarks: [] },
    cleared: {},
    shrinesUsed: [],
    relicsTaken: [],
    rep: { sunward: 0, ashen: 0, tidebound: 0, choir: 0 },
    bounty: {},
    mounts: [],
    activeMount: null,
    titles: [],
    title: null,
    fateLocked: !!fateLocked,
    fateScar: !!fateScar,
    rareFate: rareFate || null,
    doubles: !!doubles,
    timeOfDay: 0.3,
    day: 1,
    pos: null,
    kills: 0,
    deaths: 0,
    bossesSlain: [],
    playTime: 0,
    fog: null,
    deathless: 0,
    worldBossTimers: {},
  };
}
