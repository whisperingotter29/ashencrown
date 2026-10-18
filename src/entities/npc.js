// Town folk: merchants, smiths, trainers, quest givers, guards. They idle, wander and talk.
import { Vec3 } from '../core/vec3.js';
import { G } from '../game.js';
import { Entity } from './entity.js';
import { Actor } from '../px/actor.js';
import { raceLook } from '../px/specs.js';
import { dressLook, armorLook, weaponSpec } from '../px/gearLook.js';
import { RACE_BY_ID, RACES } from '../data/races.js';
import { NAMED, genName, ROLE_TITLES } from '../data/npcs.js';
import { TRAINER_TRIALS } from '../data/quests.js';
import { TOMES } from '../data/tomes.js';
import { hashStr, RNG } from '../core/rng.js';
import { heightAt } from '../world/terrainGen.js';
import { bus } from '../core/events.js';
import { dealDamage, targetsInArc, hostile } from '../systems/combat.js';
import { slash } from '../render/vfx.js';
import { S } from '../data/items.js';

// outfit colours from the palette's cloth ramps (src/px/palette.js)
const ROLE_GEAR = {
  merchant: { shirt: '#94603c', pants: '#3f2622' }, blacksmith: { shirt: '#5e4a47', pants: '#2a1a1c', apron: '#3f2622' },
  enchanter: { shirt: '#4a3266', pants: '#2e1f45' }, innkeeper: { shirt: '#b07e52', pants: '#5a3628' },
  stable: { shirt: '#557048', pants: '#3f2622' }, bounty: { shirt: '#2f2c38', pants: '#1f1d26' },
  trainer: { shirt: '#8a3434', pants: '#3f2622' }, tome: { shirt: '#243e7b', pants: '#172d64' },
  faction: { shirt: '#c99a3a', pants: '#3f2622' }, elder: { shirt: '#674952', pants: '#3f2622' }, seer: { shirt: '#4a1a48', pants: '#1d0814' },
  guard: { shirt: '#4e4b53', pants: '#2f2c38' }, quest: { shirt: '#2f7070', pants: '#3f2622' }, villager: { shirt: '#8a6a52', pants: '#5a3628' },
};

export class NPC extends Entity {
  constructor(o) {
    super();
    this.isNpc = true;
    this.team = 'neutral';
    this.role = o.role;
    this.sub = o.sub || null;
    this.town = o.town;
    this.id_ = o.id;
    this.name = o.name;
    this.title = o.title;
    this.level = Math.max(5, o.level || 10);
    this.maxHp = Math.round(200 * S(this.level) * (o.role === 'guard' ? 2 : 1)); this.hp = this.maxHp;
    this.armor = 10 * S(this.level);
    this.pos.set(o.x, heightAt(o.x, o.z, o.realm), o.z);
    this.home = new Vec3(o.x, 0, o.z);
    this.facing = o.facing || 0;
    this.wanders = o.wanders || 0;
    this.wanderT = Math.random() * 4;
    this.wanderTo = new Vec3(o.x, 0, o.z);
    this.seed = hashStr(o.id);
    this.mute = o.mute;
    this.faction = o.faction;
    this.radius = 0.45;
    this.provoked = false;
    this.realm = o.realm;
    const rng = new RNG(this.seed);
    const race = RACE_BY_ID[o.race] || rng.pick(RACES);
    const lk = race.look;
    const gear = ROLE_GEAR[o.role] || ROLE_GEAR.villager;
    const look = raceLook(lk, { skin: rng.int(0, 9), hair: rng.int(0, 9) }, { shirt: gear.shirt, pants: gear.pants, apron: gear.apron, longHair: rng.chance(0.4) });
    let weapon = null;
    if (o.role === 'guard') { Object.assign(look, dressLook({ gear: 'mail', rarity: 'uncommon', ilvl: this.level, helmChance: 1 }).look); weapon = weaponSpec({ type: 'spear', material: 'steel', rarity: 'uncommon' }); }
    if (o.role === 'faction') Object.assign(look, armorLook({ chest: { weight: 'plate', material: 'gilded', rarity: 'epic', slot: 'chest', set: { sunward: 'sunward', ashen: 'ashencourt', tidebound: 'tidebound', choir: 'choir' }[o.faction] } }));
    if (o.role === 'blacksmith') weapon = weaponSpec({ type: 'mace', base: 'Warhammer', material: 'iron', rarity: 'common' });
    if (o.role === 'trainer') weapon = weaponSpec({ type: rng.pick(['sword', 'spear', 'greatsword']), material: 'steel', rarity: 'rare' });
    if (o.role === 'tome' || o.role === 'enchanter' || o.role === 'seer') weapon = weaponSpec({ type: 'staff', material: 'gilded', rarity: 'rare' });
    if (o.role === 'elder' || o.role === 'seer') Object.assign(look, armorLook({ chest: { weight: 'cloth', material: o.role === 'seer' ? 'voidglass' : 'gilded', rarity: 'rare', slot: 'chest' } }));
    this.attachModel(new Actor(this, { type: 'human', look, weapon, scale: lk.scale }));
    this.st.runSpeed = 4;
    this.st.seed = this.seed % 10;
    this.st.twoHanded = o.role === 'guard';
    this.speed = 1.6;
    this.marker = null;
  }

  update(dt) {
    if (this.removed) return;
    this.baseUpdate(dt);
    if (this.dead) { this.deathT += dt; this.syncModel(dt); if (this.deathT > 6) this.removeModel(); return; }
    this.moveSpeedNow = 0;
    const p = G.player;
    const dP = p ? this.distTo(p) : 999;
    // hostile guards chase criminals
    if (this.role === 'guard' && p && !p.dead && (this.provoked || this.hunting)) {
      if (dP > 2.2) {
        const a = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
        this.facing = a;
        const moved = this.move(Math.sin(a) * 6 * dt, Math.cos(a) * 6 * dt, dt);
        this.moveSpeedNow = moved / dt;
      } else {
        this.atkT = (this.atkT || 0) - dt;
        this.faceTowards(p.pos.x, p.pos.z, dt);
        if (this.atkT <= 0) {
          this.atkT = 1.2;
          this.st.action = 'attack'; this.st.kind = 'spearthrust'; this.st.actionT = 0;
          setTimeout(() => { if (!this.dead && this.distTo(p) < 3.2) { slash(this.pos.x, this.pos.y, this.pos.z, this.facing, { radius: 3, arc: 50 }); dealDamage(this, p, 12 * S(this.level), { kind: 'melee' }); } }, 380);
        }
      }
      if (this.st.action) { this.st.actionT += dt * 2; if (this.st.actionT >= 1) this.st.action = null; }
      if (dP > 60) { this.hunting = false; this.provoked = false; }
      this.syncModel(dt);
      return;
    }
    // look at the player when near
    if (dP < 6 && !this.provoked) {
      this.faceTowards(p.pos.x, p.pos.z, dt, 4);
    } else if (this.wanders) {
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        this.wanderT = 4 + Math.random() * 6;
        const a = Math.random() * Math.PI * 2, r = Math.random() * this.wanders;
        this.wanderTo.set(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
      }
      const dx = this.wanderTo.x - this.pos.x, dz = this.wanderTo.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.6 && this.wanderT < 3.5) {
        this.facing = Math.atan2(dx, dz) * 0.15 + this.facing * 0.85;
        const moved = this.move((dx / d) * this.speed * dt, (dz / d) * this.speed * dt, dt);
        this.moveSpeedNow = moved / dt;
      }
    }
    this.syncModel(dt);
  }

  onDeath(killer) {
    if (killer?.isPlayer) bus.emit('crime', { type: 'murder', target: this });
  }
}

// Populate a town with its service NPCs
export function spawnTownNpcs(town, realm) {
  const out = [];
  const rng = new RNG(hashStr(town.id + 'npcs'));
  const n = town.services.length;
  const raceDefault = town.start ? town.start : null;
  town.services.forEach((svc, i) => {
    let [role, sub] = svc.split(':');
    const a = (i / n) * Math.PI * 2 + 0.15;
    const r = role === 'guard' ? town.r * 0.85 : town.r * 0.22 + 2.4 + (i % 2) * 1.5;
    const x = town.x + Math.cos(a) * r, z = town.z + Math.sin(a) * r;
    const key = `${town.id}:${role === 'quest' ? 'elder' : role}`;
    const named = NAMED[key];
    let name, title = ROLE_TITLES[role] || role;
    if (role === 'trainer') { const tr = TRAINER_TRIALS[sub]; name = tr ? tr.name : genName(rng.int(0, 999)); title = 'Trainer'; }
    else if (role === 'tome') { name = genName(rng.int(0, 999)); title = `Keeper of the ${TOMES[sub].name}`; }
    else if (named) { name = named.name; title = named.title; }
    else name = genName(rng.int(0, 9999));
    const npcRole = role === 'quest' ? 'elder' : role;
    const npc = new NPC({ id: `${town.id}:${npcRole}${sub ? ':' + sub : ''}`, role: npcRole, sub, town: town.id, name, title, race: named?.race || (rng.chance(0.55) && raceDefault) || null, x, z, facing: Math.atan2(town.x - x, town.z - z), wanders: role === 'guard' ? 10 : 0, realm, mute: named?.mute, faction: town.faction, level: Math.max(10, town.r) });
    out.push(npc);
    if (role === 'guard') {
      for (let k = 0; k < 2; k++) {
        const ga = a + (k + 1) * 2.1;
        out.push(new NPC({ id: `${town.id}:guard${k}`, role: 'guard', town: town.id, name: genName(rng.int(0, 9999)), title: 'Guard', x: town.x + Math.cos(ga) * town.r * 0.9, z: town.z + Math.sin(ga) * town.r * 0.9, wanders: 12, realm, faction: town.faction, level: Math.max(10, town.r) }));
      }
    }
  });
  // special: the Seer at Riftwatch
  if (town.id === 'riftwatch') out.push(new NPC({ id: 'riftwatch:seer', role: 'seer', town: town.id, name: NAMED['riftwatch:seer'].name, title: NAMED['riftwatch:seer'].title, race: 'void', x: town.x + 4, z: town.z + 14, facing: Math.PI, realm }));
  // villagers
  for (let k = 0; k < Math.round(town.r / 9); k++) {
    const a = rng.f() * Math.PI * 2, r = town.r * (0.3 + rng.f() * 0.4);
    out.push(new NPC({ id: `${town.id}:villager${k}`, role: 'villager', town: town.id, name: genName(rng.int(0, 9999)), title: 'Villager', race: rng.chance(0.6) ? raceDefault : null, x: town.x + Math.cos(a) * r, z: town.z + Math.sin(a) * r, wanders: 9, realm }));
  }
  return out;
}
