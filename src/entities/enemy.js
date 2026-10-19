// Enemies and allied minions: data-driven attacks, telegraphs, boss phases, elites.
import { Vec3 } from '../core/vec3.js';
import { G } from '../game.js';
import { Entity } from './entity.js';
import { ENEMIES } from '../data/enemies.js';
import { S } from '../data/items.js';
import { Actor } from '../px/actor.js';
import { onScreen } from '../px/view.js';
import { enemySpec } from '../px/specs.js';
import { attackKindFor } from '../px/attackKinds.js';
import { dealDamage, targetsInArc, entitiesNear, hostile, spawnProjectile, spawnHazard, movementMult, canAct, applyStatus, explodeAt } from '../systems/combat.js';
import { telegraph, ring, burst, slash, beam, pillar, flash, particle, floatText, ELEM_COLORS, elemBurst, shockwave } from '../render/vfx.js';
import { addShake } from '../world/cameraRig.js';
import { bus } from '../core/events.js';
import { segmentBlocked } from '../systems/collision.js';
import { dungeonLOS, dungeonFlowDir } from '../world/dungeonQuery.js';
import { groundHeight } from '../world/terrain.js';
import { angleDiff, clamp, dampAngle } from '../core/math.js';
import { rand, pick, chance } from '../core/rng.js';

const ELITE_AFFIXES = [
  { id: 'molten', name: 'Molten', color: '#ff6020', desc: 'leaves fire' },
  { id: 'frenzied', name: 'Frenzied', color: '#ff3040', desc: 'fast' },
  { id: 'shielded', name: 'Shielded', color: '#80c0ff', desc: 'armoured' },
  { id: 'vampiric', name: 'Vampiric', color: '#c01030', desc: 'lifesteal' },
  { id: 'frozen', name: 'Frostbound', color: '#a0e0ff', desc: 'chilling' },
  { id: 'arcane', name: 'Arcane', color: '#c080ff', desc: 'orbs' },
];

const _dir = { x: 0, z: 0 };

export class Enemy extends Entity {
  constructor(id, level, x, z, opts = {}) {
    super();
    const tpl = ENEMIES[id];
    this.tplId = id;
    this.tpl = tpl;
    this.level = Math.max(1, Math.round(level));
    this.boss = !!tpl.boss;
    this.world = !!tpl.world;
    this.elite = !this.boss && !tpl.ally && (opts.elite || false);
    this.ally = !!tpl.ally || !!opts.ally;
    this.team = this.ally ? 'player' : 'enemy';
    this.spawnOpts = opts;      // co-op: the host sends these so guests build the same enemy
    this.affix = this.elite ? (ELITE_AFFIXES.find((a) => a.id === opts.affix) || pick(ELITE_AFFIXES)) : null;
    this.seed = opts.seed ?? this.id;
    this.name = (this.affix ? this.affix.name + ' ' : '') + (opts.name || tpl.name);
    const mult = this.boss ? (this.world ? 12 : tpl.final ? 16 : 7) : this.elite ? 2.6 : 1;
    const sl = S(this.level);
    this.maxHp = Math.round(tpl.hp * sl * mult * (opts.hpMult || 1));
    this.hp = this.maxHp;
    this.baseDmg = tpl.dmg * sl * (this.elite ? 1.3 : 1) * (this.boss ? 1.15 : 1) * (opts.dmgMult || 1);
    this.armor = tpl.armor * sl * (this.affix?.id === 'shielded' ? 2 : 1);
    this.speed = tpl.speed * (this.affix?.id === 'frenzied' ? 1.35 : 1);
    this.element = tpl.element || 'physical';
    this.undead = !!tpl.undead;
    this.res = {};
    if (tpl.element && tpl.element !== 'physical') this.res[tpl.element] = 40;
    if (tpl.undead) this.res.rot = 50;
    if (tpl.construct) this.res.rot = 60;
    const size = tpl.size * (this.elite ? 1.18 : 1) * (opts.scale || 1);
    this.radius = Math.max(0.4, 0.5 * size * (tpl.body === 'quadruped' || tpl.body === 'arachnid' || tpl.body === 'dragon' ? 1.4 : tpl.body === 'serpent' ? 1.2 : 1));
    this.pos.set(x, groundHeight(x, z), z);
    this.home = new Vec3(x, 0, z);
    this.leash = opts.leash || (this.boss ? 70 : 46);
    this.aggroR = opts.aggroR || (this.boss ? 26 : tpl.ranged ? 26 : 22);   // grindy: packs notice you from across the screen
    this.state = 'idle';
    this.stateT = rand(0, 3);
    this.target = null;
    this.cds = tpl.attacks.map((a) => rand(0.3, 1.5) + (a.type === 'summon' ? 6 : 0));
    this.atk = null;
    this.atkT = 0;
    this.phase = 1;
    this.poise = this.boss ? 999 : tpl.size > 1.3 ? 60 : 25;
    this.poiseDmg = 0;
    this.staggerT = 0;
    this.xp = Math.round(tpl.xp * sl * 2 * (this.boss ? (this.world ? 2 : 1) : this.elite ? 3 : 1));
    this.flying = tpl.body === 'flyer';
    this.flyH = 0;
    this.height = buildHeight(tpl) * size;
    this.wanderT = 0;
    this.wanderTarget = new Vec3(x, 0, z);
    this.summons = [];
    this.bloodColor = tpl.construct ? '#c8b8a0' : tpl.undead ? '#c0d0c0' : tpl.void ? '#a070ff' : '#c02020';
    this.dungeon = opts.dungeon || null;
    this.camp = opts.camp || null;
    this.spawner = opts.spawner || null;
    this.onKilled = opts.onKilled || null;
    this.lifeTime = opts.lifeTime || 0;
    this.owner = opts.owner || null;
    this.decoy = !!tpl.decoy;
    this.questTag = opts.questTag || null;
    this.rival = !!tpl.rival;
    this.weaponType = tpl.weapon;
    // model
    const actor = new Actor(this, enemySpec(tpl, { scale: (opts.scale || 1) * (this.elite ? 1.18 : 1), rarity: this.boss ? 'epic' : this.elite ? 'rare' : 'common', ilvl: this.level, seed: this.seed }));
    this.attachModel(actor);
    this.st.runSpeed = this.speed;
    this.st.heavy = tpl.size > 1.3;
    this.st.twoHanded = ['greatsword', 'halberd', 'bow', 'crossbow', 'staff'].includes(tpl.weapon);
    this.st.weaponType = tpl.weapon;
    if (this.elite) this.addEliteGlow();
    if (tpl.body === 'serpent') { this.trail = []; this.model.segs = Array.from({ length: 14 }, () => ({ x, y: this.pos.y, z })); }
    this.yOffset = 0;
  }

  addEliteGlow() {
    const col = this.affix.color;
    this._eliteColor = col;
    this.model.aura = col;
  }

  onAggro(src) {
    if (this.ally || this.dead) return;
    if (src && src !== this.target && hostile(this, src)) { this.target = src; }
    if (this.state === 'idle' || this.state === 'wander' || this.state === 'return') { this.state = 'chase'; bus.emit('aggro', this); }
    if (this.sleep > 0) this.sleep = 0;
  }

  applyStagger(amount) {
    if (this.boss) return;
    this.poiseDmg += amount * 30;
    if (this.poiseDmg >= this.poise) {
      this.poiseDmg = 0;
      this.staggerT = 0.55;
      this.cancelAttack();
    }
  }

  cancelAttack() {
    if (this.tele) { this.tele.done = true; this.tele = null; }
    this.atk = null;
    this.st.action = null;
    this.state = this.target ? 'chase' : 'idle';
  }

  findTarget() {
    const r = this.aggroR * (this.status.blind > 0 ? 0.5 : 1);
    let best = null, bd = r * r;
    if (this.ally) {
      for (const e of G.entities) {
        if (e.dead || e.team !== 'enemy') continue;
        const d = (e.pos.x - this.pos.x) ** 2 + (e.pos.z - this.pos.z) ** 2;
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    }
    const p = G.player;
    if (p && !p.dead && !p.stealthed) {
      const d = (p.pos.x - this.pos.x) ** 2 + (p.pos.z - this.pos.z) ** 2;
      if (d < bd && this.canSee(p)) { bd = d; best = p; }
    }
    for (const e of G.entities) {
      if (e.dead || e.team !== 'player' || e.away || e.stealthed) continue;
      const d = (e.pos.x - this.pos.x) ** 2 + (e.pos.z - this.pos.z) ** 2;
      if (d < bd * (e.decoy ? 4 : 1) && this.canSee(e)) { bd = d; best = e; }
    }
    return best;
  }

  canSee(e) {
    if (G.realm === 'dungeon') return dungeonLOS(this.pos.x, this.pos.z, e.pos.x, e.pos.z);
    return !segmentBlocked(this.pos.x, this.pos.z, e.pos.x, e.pos.z, -0.3);
  }

  update(dt) {
    if (this.removed) return;
    this.baseUpdate(dt);
    if (this.dead) {
      this.deathT += dt;
      if (this.flying) this.flyH = Math.max(0, this.flyH - dt * 6);
      this.syncModel(dt);
      if (this.deathT > 3.5) this.removeModel();
      return;
    }
    if (this.netPuppet) { this.puppetUpdate(dt); return; }
    if (this.lifeTime) { this.lifeTime -= dt; if (this.lifeTime <= 0) { this.hp = 0; this.dead = true; burst(this.pos.x, this.pos.y + 1, this.pos.z, { count: 20, color: '#80ffa0' }); this.removeModel(); return; } }
    if (this.flying) this.flyH = 1.2 + Math.sin(this.st.t * 2 + this.id) * 0.3;
    if (this.elite && Math.random() < dt * 6) particle({ x: this.pos.x + rand(-0.6, 0.6), y: this.pos.y + rand(0.2, this.height), z: this.pos.z + rand(-0.6, 0.6), vy: 1.4, life: 0.6, size: 0.3, color: this._eliteColor });
    // phases
    if (this.boss) {
      const f = this.hp / this.maxHp;
      if (this.phase === 1 && f < 0.66) this.enterPhase(2);
      else if (this.phase === 2 && f < 0.33) this.enterPhase(3);
    }
    this.moveSpeedNow = 0;
    if (this.staggerT > 0) { this.staggerT -= dt; this.st.hitT = 1; this.syncModel(dt); return; }
    if (!canAct(this)) { if (this.tele && this.atk) this.cancelAttack(); this.syncModel(dt); return; }
    for (let i = 0; i < this.cds.length; i++) this.cds[i] -= dt * (this.phase === 3 ? 1.3 : this.phase === 2 ? 1.15 : 1);

    if (this.atk) { this.updateAttack(dt); this.syncModel(dt); return; }
    if (this.decoy) { this.syncModel(dt); return; }

    // targeting
    this.stateT -= dt;
    if (!this.target || this.target.dead || this.target.removed || (this.target.stealthed && !this.ally) || this.stateT < -4) {
      this.target = this.findTarget();
      this.stateT = 0.6;
      if (this.target && !this.ally && this.state !== 'chase') { this.state = 'chase'; bus.emit('aggro', this); }
    }
    if (this.fear > 0 && this.target) {
      const a = Math.atan2(this.pos.x - this.target.pos.x, this.pos.z - this.target.pos.z);
      this.facing = a;
      this.walk(Math.sin(a), Math.cos(a), this.speed * 1.1, dt);
      this.syncModel(dt);
      return;
    }
    const homeD = Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z);
    if (!this.ally && this.state === 'chase' && homeD > this.leash && !this.dungeon && !this.world) {
      this.state = 'return'; this.target = null;
    }
    if (this.state === 'return') {
      this.walkTo(this.home.x, this.home.z, this.speed * 1.2, dt);
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.25 * dt);
      if (homeD < 3) this.state = 'idle';
      this.syncModel(dt);
      return;
    }
    if (this.target) {
      this.state = 'chase';
      const d = this.distTo(this.target);
      // pick an attack
      let chosen = -1;
      const order = this.tpl.attacks.map((a, i) => i).sort(() => Math.random() - 0.5);
      for (const i of order) {
        const a = this.tpl.attacks[i];
        if (this.cds[i] > 0) continue;
        const rng = a.type === 'melee' || a.type === 'cleave' ? a.range + this.target.radius : a.type === 'slam' || a.type === 'nova' ? a.radius * 0.8 : a.type === 'summon' || a.type === 'storm' || a.type === 'teleport' ? 30 : a.type === 'burrow' ? 25 : a.range || 14;
        const minR = a.type === 'charge' ? 5 : a.type === 'teleport' ? 6 : 0;
        // with the closer camera, ranged attacks wait until the enemy is actually on screen
        const offscreen = this.target.isPlayer && !this.boss && (a.type === 'ranged' || a.type === 'beam' || a.type === 'breath' || a.type === 'nova_ring') && !onScreen(this.pos.x, this.pos.z, -1);
        if (d <= rng && d >= minR && !offscreen && (a.type === 'summon' ? this.summons.filter((s) => !s.dead).length < 4 : true)) { chosen = i; break; }
      }
      if (chosen >= 0 && (this.tpl.attacks[chosen].type === 'melee' || this.canSee(this.target))) {
        this.startAttack(chosen);
      } else {
        // move: ranged enemies keep distance
        const prefer = this.tpl.ranged ? 8.5 : 0;
        if (this.tpl.ranged && d < prefer * 0.6) {
          const a = Math.atan2(this.pos.x - this.target.pos.x, this.pos.z - this.target.pos.z) + Math.sin(this.st.t + this.id) * 0.8;
          this.walk(Math.sin(a), Math.cos(a), this.speed * 0.8, dt);
          this.faceTowards(this.target.pos.x, this.target.pos.z, dt);
        } else if (d > (this.tpl.ranged ? prefer : (this.tpl.attacks[0]?.range || 2) * 0.8 + this.target.radius)) {
          this.walkTo(this.target.pos.x, this.target.pos.z, this.speed, dt);
        } else this.faceTowards(this.target.pos.x, this.target.pos.z, dt);
      }
    } else if (this.ally) {
      // follow the player
      const p = G.player;
      if (p) {
        const d = this.distTo(p);
        if (d > 30) { this.pos.set(p.pos.x + rand(-2, 2), p.pos.y, p.pos.z + rand(-2, 2)); }
        else if (d > 4) this.walkTo(p.pos.x, p.pos.z, Math.max(this.speed, p.moveSpeedNow * 0.95), dt);
      }
    } else {
      // wander
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        this.wanderT = rand(3, 8);
        const a = Math.random() * Math.PI * 2, r = rand(2, 10);
        this.wanderTarget.set(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
      }
      const wd = Math.hypot(this.wanderTarget.x - this.pos.x, this.wanderTarget.z - this.pos.z);
      if (wd > 1 && this.wanderT < 5) this.walkTo(this.wanderTarget.x, this.wanderTarget.z, this.speed * 0.35, dt);
    }
    this.separate(dt);
    this.syncModel(dt);
  }

  // co-op guest: this enemy lives in the host's game. Follow its reports and replay the attacks the
  // host starts, so its swings and spells land on this player exactly where they see them.
  puppetUpdate(dt) {
    const n = this.net;
    if (this.flying) this.flyH = 1.2 + Math.sin(this.st.t * 2 + this.id) * 0.3;
    if (this.elite && Math.random() < dt * 6) particle({ x: this.pos.x + rand(-0.6, 0.6), y: this.pos.y + rand(0.2, this.height), z: this.pos.z + rand(-0.6, 0.6), vy: 1.4, life: 0.6, size: 0.3, color: this._eliteColor });
    this.moveSpeedNow = 0;
    if (n.ph > this.phase) this.enterPhase(n.ph);
    if (n.flags & 1) this.frozen = Math.max(this.frozen || 0, 0.2);
    if (n.flags & 2) this.stun = Math.max(this.stun || 0, 0.2);
    if (n.flags & 8) this.st.hitT = 1;
    if (this.atk) {
      this.updateAttack(dt);
      if (!this.charging && !this.burrowPhase) this.follow(n, dt, 2.5);
    } else {
      this.model.hidden = !!(n.flags & 4);
      this.follow(n, dt, 10);
      this.facing = dampAngle(this.facing, n.f, 12, dt);
      this.moveSpeedNow = n.ms;
    }
    this.syncModel(dt);
  }

  follow(n, dt, rate) {
    const age = Math.min(0.25, G.realTime - n.at);
    const tx = n.x + n.vx * age, tz = n.z + n.vz * age;
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    if (dx * dx + dz * dz > 64) { this.pos.x = tx; this.pos.z = tz; return; }
    const k = Math.min(1, dt * rate);
    this.pos.x += dx * k; this.pos.z += dz * k;
  }

  enterPhase(n) {
    this.phase = n;
    this.speed *= 1.12;
    ring(this.pos.x, this.pos.y, this.pos.z, { radius: 10, color: ELEM_COLORS[this.element]?.[1] || '#ff4020', dur: 0.8 });
    burst(this.pos.x, this.pos.y + 2, this.pos.z, { count: 50, speed: 10, color: ELEM_COLORS[this.element]?.[1] || '#ff4020', life: 1 });
    addShake(0.5);
    bus.emit('bossPhase', { boss: this, phase: n });
    for (let i = 0; i < this.cds.length; i++) this.cds[i] *= 0.5;
  }

  walk(dx, dz, speed, dt) {
    const m = movementMult(this);
    if (m <= 0) return;
    const s = speed * m;
    const moved = this.move(dx * s * dt, dz * s * dt, dt);
    this.moveSpeedNow = moved / Math.max(dt, 0.0001);
    if (this.model.kind !== 'serpent') this.facing = Math.atan2(dx, dz) * 0.0 + this.facing;
  }

  walkTo(x, z, speed, dt) {
    let dx = x - this.pos.x, dz = z - this.pos.z;
    const L = Math.hypot(dx, dz) || 1;
    dx /= L; dz /= L;
    if (G.realm === 'dungeon' && this.target && !dungeonLOS(this.pos.x, this.pos.z, x, z)) {
      if (dungeonFlowDir(this.pos.x, this.pos.z, _dir)) { dx = _dir.x; dz = _dir.z; }
    }
    this.facing = this.facing + angleDiff(this.facing, Math.atan2(dx, dz)) * Math.min(1, dt * 10);
    this.walk(dx, dz, speed, dt);
  }

  separate(dt) {
    for (const e of G.entities) {
      if (e === this || e.dead || e.boss && this.boss) continue;
      const dx = this.pos.x - e.pos.x, dz = this.pos.z - e.pos.z;
      const rr = this.radius + e.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 0.0001) {
        const d = Math.sqrt(d2), push = (rr - d) * 0.5;
        this.move((dx / d) * push, (dz / d) * push, dt);
      }
    }
  }

  // ------------------------------------------------------------------ attacks
  startAttack(i) {
    const a = this.tpl.attacks[i];
    this.atk = a; this.atkI = i; this.atkT = 0; this.atkDone = false;
    this.cds[i] = a.cd * (this.boss ? 0.9 : 1) * rand(0.85, 1.2);
    this.lockX = this.target.pos.x; this.lockZ = this.target.pos.z;
    this.faceTowards(this.target.pos.x, this.target.pos.z);
    const wind = a.windup * (this.affix?.id === 'frenzied' ? 0.75 : 1);
    this.atkWind = wind;
    this.st.strikeU = wind / (wind + 0.35);
    const kind = a.type === 'melee' ? attackKindFor(this.tpl.weapon || 'claws', Math.floor(Math.random() * 3)) : a.type === 'ranged' ? (this.tpl.weapon === 'bow' ? 'bowrelease' : this.tpl.weapon === 'crossbow' ? 'xbow' : 'cast') : a.type === 'slam' ? 'slam' : a.type === 'cleave' ? 'sweep' : a.type === 'summon' || a.type === 'storm' ? 'castup' : a.type === 'nova' || a.type === 'nova_ring' ? 'nova' : 'cast';
    this.st.action = 'attack'; this.st.kind = kind; this.st.actionT = 0;
    const tele = this.boss || this.elite || ['slam', 'cleave', 'charge', 'nova', 'groundfire', 'storm', 'beam', 'burrow', 'breath'].includes(a.type);
    if (tele) {
      if (a.type === 'slam' || a.type === 'nova') this.tele = telegraph({ shape: 'circle', x: this.pos.x, y: this.pos.y, z: this.pos.z, radius: a.radius, dur: wind, follow: this });
      else if (a.type === 'cleave' || a.type === 'breath') this.tele = telegraph({ shape: 'cone', x: this.pos.x, y: this.pos.y, z: this.pos.z, radius: a.range, angle: a.arc || 60, facing: this.facing, dur: wind, follow: this });
      else if (a.type === 'charge' || a.type === 'beam') this.tele = telegraph({ shape: 'line', x: this.pos.x, y: this.pos.y, z: this.pos.z, width: a.type === 'beam' ? 1.6 : this.radius * 2.2, length: a.range, facing: this.facing, dur: wind, follow: this });
      else if (a.type === 'melee' && (this.boss || this.elite)) this.tele = telegraph({ shape: 'cone', x: this.pos.x, y: this.pos.y, z: this.pos.z, radius: a.range + 0.5, angle: a.arc || 90, facing: this.facing, dur: wind, follow: this, color: '#ff8030' });
      else if (a.type === 'groundfire') {
        this.groundSpots = [];
        for (let k = 0; k < a.count; k++) {
          const ang = Math.random() * Math.PI * 2, r = k === 0 ? 0 : rand(2, 7);
          const x = this.target.pos.x + Math.cos(ang) * r, z = this.target.pos.z + Math.sin(ang) * r;
          this.groundSpots.push([x, z]);
          telegraph({ shape: 'circle', x, y: groundY(x, z), z, radius: a.radius, dur: wind, color: '#ff4020' });
        }
      } else if (a.type === 'burrow') {
        this.burrowing = true;
      }
    }
    if (a.type === 'storm') this.stormLeft = a.count, this.stormT = 0;
    G.net?.enemyAttack(this, i);
  }

  updateAttack(dt) {
    const a = this.atk;
    this.atkT += dt;
    const wind = this.atkWind;
    const total = wind + a.recover + (a.duration || 0);
    this.st.actionT = Math.min(1, this.atkT / (wind + 0.35));
    const t = this.target;
    // keep facing target during windup (slower for big attacks)
    if (t && !t.dead && this.atkT < wind * 0.7 && a.type !== 'charge') this.faceTowards(t.pos.x, t.pos.z, dt, a.type === 'melee' ? 8 : 3);
    if (a.type === 'burrow') return this.updateBurrow(dt, a);
    if (a.type === 'storm') return this.updateStorm(dt, a, wind, total);
    if (!this.atkDone && this.atkT >= wind) {
      this.atkDone = true;
      this.tele = null;
      this.executeAttack(a);
    }
    if (this.charging) {
      const s = a.speed || 20;
      const moved = this.move(Math.sin(this.facing) * s * dt, Math.cos(this.facing) * s * dt, dt);
      this.moveSpeedNow = s;
      this.st.charging = true;
      this.chargeLeft -= moved;
      for (const e of targetsInArc(this, this.radius + 1.2, 140)) {
        if (this.chargeHit.has(e)) continue;
        this.chargeHit.add(e);
        dealDamage(this, e, this.baseDmg * a.mult, { kind: 'melee', knock: 12, element: this.element === 'physical' ? 'physical' : this.element });
      }
      if (Math.random() < dt * 30) burst(this.pos.x, this.pos.y + 0.2, this.pos.z, { count: 2, speed: 3, color: '#c0a080', additive: false, life: 0.5, size: 0.5, gravity: 1 });
      if (this.chargeLeft <= 0 || moved < s * dt * 0.3) { this.charging = false; this.st.charging = false; }
    }
    if (this.beamActive) this.updateBeam(dt, a);
    if (this.breathActive) this.updateBreath(dt, a);
    if (this.atkT >= total && !this.charging) { this.atk = null; this.st.action = null; this.beamActive = false; this.breathActive = false; this.st.breathing = false; }
  }

  executeAttack(a) {
    const t = this.target;
    const dmg = this.baseDmg * a.mult;
    const el = a.element || (a.type === 'melee' ? 'physical' : this.element);
    switch (a.type) {
      case 'melee': {
        const hits = targetsInArc(this, a.range + 0.4, a.arc || 90);
        if (this.tpl.body === 'humanoid' || this.tpl.body === 'golem' || this.tpl.body === 'treant') slash(this.pos.x, this.pos.y, this.pos.z, this.facing, { radius: a.range, arc: a.arc || 100, color: el !== 'physical' ? ELEM_COLORS[el][1] : '#ffe8d0', dur: 0.2 });
        for (const e of hits) {
          dealDamage(this, e, dmg, { kind: 'melee', element: el, status: a.status, stagger: this.boss ? 0 : 0 });
          if (this.affix?.id === 'vampiric') this.hp = Math.min(this.maxHp, this.hp + dmg * 0.5);
          if (this.affix?.id === 'frozen') applyStatus(e, 'chill', 1, this);
        }
        break;
      }
      case 'ranged': {
        if (!t) break;
        const sx = this.pos.x + Math.sin(this.facing) * 0.6, sz = this.pos.z + Math.cos(this.facing) * 0.6, sy = this.pos.y + this.height * 0.6;
        const lead = Math.hypot(t.pos.x - sx, t.pos.z - sz) / (a.speed || 26);
        const tx = t.pos.x + (t.vel?.x || 0) * lead * 0.5, tz = t.pos.z + (t.vel?.z || 0) * lead * 0.5;
        const L = Math.hypot(tx - sx, tz - sz) || 1;
        const spd = a.speed || 26;
        const blind = this.status.blind > 0 ? (Math.random() - 0.5) * 0.8 : 0;
        const ang = Math.atan2(tx - sx, tz - sz) + blind;
        spawnProjectile({ x: sx, y: sy, z: sz, vx: Math.sin(ang) * spd, vz: Math.cos(ang) * spd, vy: (t.pos.y + 1 - sy) / Math.max(0.1, L / spd), owner: this, dmg, element: el, kind: a.proj || 'orb', explode: a.explode, status: a.status, homing: a.homing, life: (a.range || 18) / spd * 1.5 });
        if (this.affix?.id === 'arcane') for (const off of [-0.4, 0.4]) spawnProjectile({ x: sx, y: sy, z: sz, vx: Math.sin(ang + off) * spd, vz: Math.cos(ang + off) * spd, owner: this, dmg: dmg * 0.6, element: 'void', kind: 'orb', life: 1.2 });
        break;
      }
      case 'slam': case 'nova': {
        if (a.type === 'slam') shockwave(this.pos.x, this.pos.y, this.pos.z, { radius: a.radius, color: el !== 'physical' ? ELEM_COLORS[el][1] : '#f0d8b8' });
        ring(this.pos.x, this.pos.y, this.pos.z, { radius: a.radius, color: el !== 'physical' ? ELEM_COLORS[el][1] : '#e0c0a0', dur: 0.4 });
        burst(this.pos.x, this.pos.y + 0.3, this.pos.z, { count: 30, speed: 9, color: el !== 'physical' ? ELEM_COLORS[el][0] : '#c8a880', color2: el !== 'physical' ? ELEM_COLORS[el][1] : '#8a6a4a', additive: el !== 'physical', life: 0.7, up: 0.3, size: 0.5, gravity: -10 });
        addShake(this.boss ? 0.45 : 0.25);
        bus.emit('slam', { src: this, radius: a.radius });
        for (const e of entitiesNear(this.pos.x, this.pos.z, a.radius, (e) => hostile(this, e))) dealDamage(this, e, dmg, { kind: 'melee', element: el, status: a.status, knock: 7, fromX: this.pos.x, fromZ: this.pos.z });
        if (a.hazard) spawnHazard({ x: this.pos.x, z: this.pos.z, radius: a.radius * 0.8, owner: this, dmg: dmg * 0.15, tick: 0.5, life: 4, element: el, status: a.hazard === 'spores' ? { poison: 1 } : { burn: 1 } });
        break;
      }
      case 'cleave': {
        slash(this.pos.x, this.pos.y, this.pos.z, this.facing, { radius: a.range, arc: a.arc, color: el !== 'physical' ? ELEM_COLORS[el][1] : '#ffe0c0', dur: 0.28 });
        addShake(0.3);
        for (const e of targetsInArc(this, a.range, a.arc)) dealDamage(this, e, dmg, { kind: 'melee', element: el, status: a.status, knock: 6 });
        break;
      }
      case 'charge': {
        this.charging = true; this.chargeLeft = a.range; this.chargeHit = new Set();
        break;
      }
      case 'volley': {
        if (!t) break;
        const base = Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
        const spread = (a.spread || 40) * Math.PI / 180;
        for (let k = 0; k < a.count; k++) {
          const ang = a.spread >= 360 ? (k / a.count) * Math.PI * 2 : base + (k / Math.max(1, a.count - 1) - 0.5) * spread;
          spawnProjectile({ x: this.pos.x, y: this.pos.y + this.height * 0.55, z: this.pos.z, vx: Math.sin(ang) * a.speed, vz: Math.cos(ang) * a.speed, owner: this, dmg, element: el, kind: a.proj || 'orb', life: 2.2, status: a.status });
        }
        break;
      }
      case 'nova_ring': {
        const off = Math.random() * Math.PI;
        const rings = this.phase >= 3 ? 2 : 1;
        for (let r = 0; r < rings; r++) for (let k = 0; k < a.count; k++) {
          const ang = off + (k / a.count) * Math.PI * 2 + r * (Math.PI / a.count);
          spawnProjectile({ x: this.pos.x, y: this.pos.y + 1.0, z: this.pos.z, vx: Math.sin(ang) * a.speed * (1 - r * 0.25), vz: Math.cos(ang) * a.speed * (1 - r * 0.25), owner: this, dmg, element: el, kind: a.proj || 'orb', life: 2.4 });
        }
        ring(this.pos.x, this.pos.y, this.pos.z, { radius: 4, color: ELEM_COLORS[el]?.[1] || '#fff', dur: 0.4 });
        break;
      }
      case 'groundfire': {
        for (const [x, z] of this.groundSpots || []) {
          const y = groundY(x, z);
          pillar(x, y, z, { radius: a.radius * 0.8, height: 6, color: ELEM_COLORS[el]?.[1] || '#ff4020', dur: 0.4 });
          elemBurst(el, x, y + 0.5, z, 0.8);
          for (const e of entitiesNear(x, z, a.radius, (e) => hostile(this, e))) {
            dealDamage(this, e, dmg, { kind: 'spell', element: el, status: a.status });
            if (a.pull) { const ang = Math.atan2(x - e.pos.x, z - e.pos.z); e.knock.set(Math.sin(ang) * a.pull, 0, Math.cos(ang) * a.pull); }
          }
          if (a.hazard) spawnHazard({ x, z, radius: a.radius * 0.9, owner: this, dmg: dmg * 0.15, tick: 0.5, life: 4, element: el, status: { burn: 1 } });
        }
        break;
      }
      case 'summon': {
        const n = a.count + (this.phase >= 2 ? 1 : 0);
        for (let k = 0; k < n; k++) {
          const ang = Math.random() * Math.PI * 2;
          const x = this.pos.x + Math.cos(ang) * 4, z = this.pos.z + Math.sin(ang) * 4;
          bus.emit('spawnEnemy', { id: a.what, level: Math.max(1, this.level - 2), x, z, summoner: this, dungeon: this.dungeon });
          burst(x, groundY(x, z) + 0.5, z, { count: 20, speed: 5, color: ELEM_COLORS[this.element]?.[1] || '#a080ff', life: 0.7 });
        }
        break;
      }
      case 'teleport': {
        if (!t) break;
        burst(this.pos.x, this.pos.y + 1, this.pos.z, { count: 24, speed: 6, color: ELEM_COLORS[this.element]?.[1] || '#a070ff', life: 0.5 });
        const ang = t.facing + Math.PI + rand(-0.6, 0.6);
        const nx = t.pos.x + Math.sin(ang) * 3, nz = t.pos.z + Math.cos(ang) * 3;
        if (G.realm !== 'dungeon' || dungeonLOS(t.pos.x, t.pos.z, nx, nz)) { this.pos.x = nx; this.pos.z = nz; }
        this.faceTowards(t.pos.x, t.pos.z);
        burst(this.pos.x, this.pos.y + 1, this.pos.z, { count: 24, speed: 6, color: ELEM_COLORS[this.element]?.[1] || '#a070ff', life: 0.5 });
        break;
      }
      case 'beam': {
        this.beamActive = true; this.beamT = 0; this.beamDir = this.facing; this.beamTick = 0;
        break;
      }
      case 'breath': {
        this.breathActive = true; this.st.breathing = true; this.breathTick = 0;
        break;
      }
    }
  }

  updateBeam(dt, a) {
    this.beamT += dt;
    if (this.beamT > (a.duration || 2)) { this.beamActive = false; return; }
    if (a.sweep) this.beamDir += Math.sin(this.beamT * 2) * a.sweep * dt;
    else if (this.target) this.beamDir = this.beamDir + angleDiff(this.beamDir, Math.atan2(this.target.pos.x - this.pos.x, this.target.pos.z - this.pos.z)) * dt * 1.2;
    this.facing = this.beamDir;
    const sx = this.pos.x, sz = this.pos.z, sy = this.pos.y + this.height * 0.6;
    const ex = sx + Math.sin(this.beamDir) * a.range, ez = sz + Math.cos(this.beamDir) * a.range;
    const col = ELEM_COLORS[a.element || this.element]?.[1] || '#a060ff';
    beam(sx, sy, sz, ex, sy - 0.6, ez, { color: col, width: 0.5, dur: dt * 1.5 });
    if (Math.random() < 0.6) burst(ex, sy - 0.6, ez, { count: 2, speed: 4, color: col, life: 0.3 });
    this.beamTick -= dt;
    if (this.beamTick <= 0) {
      this.beamTick = 0.2;
      for (const e of [...G.entities, G.player]) {
        if (!e || e.dead || !hostile(this, e)) continue;
        // distance from segment
        const dx = ex - sx, dz = ez - sz;
        let u = ((e.pos.x - sx) * dx + (e.pos.z - sz) * dz) / (dx * dx + dz * dz);
        u = clamp(u, 0, 1);
        const px = sx + dx * u - e.pos.x, pz = sz + dz * u - e.pos.z;
        if (px * px + pz * pz < (0.9 + e.radius) ** 2) dealDamage(this, e, this.baseDmg * a.mult, { kind: 'spell', element: a.element || this.element });
      }
    }
  }

  updateBreath(dt, a) {
    const col = ELEM_COLORS[a.element || 'fire'];
    const hx = this.pos.x + Math.sin(this.facing) * this.radius, hz = this.pos.z + Math.cos(this.facing) * this.radius, hy = this.pos.y + this.height * 0.6;
    for (let k = 0; k < 4; k++) {
      const ang = this.facing + rand(-0.4, 0.4);
      const s = rand(10, 16);
      particle({ x: hx, y: hy, z: hz, vx: Math.sin(ang) * s, vy: rand(-1, 1), vz: Math.cos(ang) * s, life: a.range / s, size: 0.7, size1: 1.6, color: col[0], color2: col[1], drag: 0.5 });
    }
    if (this.target) this.faceTowards(this.target.pos.x, this.target.pos.z, dt, 1.5);
    this.breathTick -= dt;
    if (this.breathTick <= 0) {
      this.breathTick = 0.25;
      for (const e of targetsInArc(this, a.range, a.arc)) dealDamage(this, e, this.baseDmg * a.mult, { kind: 'spell', element: a.element || 'fire', status: a.status });
    }
    flash(hx, hy, hz, col[1], 8, 10, 0.05);
  }

  updateStorm(dt, a, wind, total) {
    this.stormT -= dt;
    if (this.atkT > wind * 0.5 && this.stormLeft > 0 && this.stormT <= 0 && this.target) {
      this.stormT = 0.18;
      this.stormLeft--;
      const ang = Math.random() * Math.PI * 2, r = this.stormLeft % 3 === 0 ? 0 : rand(1, 9);
      const x = this.target.pos.x + Math.cos(ang) * r, z = this.target.pos.z + Math.sin(ang) * r;
      const y = groundY(x, z);
      const el = a.element || this.element;
      telegraph({ shape: 'circle', x, y, z, radius: a.radius, dur: 0.75, color: '#ff4020' });
      const self = this;
      setTimeoutGame(0.75, () => {
        if (self.dead) return;
        pillar(x, y, z, { radius: a.radius * 0.6, height: 18, color: ELEM_COLORS[el]?.[1] || '#fff', dur: 0.35 });
        elemBurst(el, x, y + 0.5, z, 0.8);
        for (const e of entitiesNear(x, z, a.radius, (e) => hostile(self, e))) dealDamage(self, e, self.baseDmg * a.mult, { kind: 'spell', element: el, status: a.status });
      });
    }
    if (this.atkT >= total + 1.5) { this.atk = null; this.st.action = null; }
  }

  updateBurrow(dt, a) {
    const t = this.target;
    if (!this.burrowPhase) { this.burrowPhase = 'down'; this.burrowT = 0; }
    this.burrowT += dt;
    if (this.burrowPhase === 'down') {
      this.yOffset = -this.burrowT * 6;
      if (Math.random() < 0.5) burst(this.pos.x, this.pos.y + 0.3 - this.yOffset, this.pos.z, { count: 3, speed: 5, color: '#c8a070', additive: false, life: 0.8, size: 0.6, gravity: -8 });
      if (this.burrowT > 0.6) {
        this.burrowPhase = 'travel'; this.burrowT = 0; this.model.hidden = true;
        if (t) { this.burrowX = t.pos.x; this.burrowZ = t.pos.z; }
        this.burrowTele = telegraph({ shape: 'circle', x: this.burrowX, y: groundY(this.burrowX, this.burrowZ), z: this.burrowZ, radius: a.radius, dur: a.windup + 0.2 });
      }
    } else if (this.burrowPhase === 'travel') {
      if (Math.random() < 0.7) burst(this.burrowX + rand(-1, 1), groundY(this.burrowX, this.burrowZ) + 0.2, this.burrowZ + rand(-1, 1), { count: 2, speed: 3, color: '#b09060', additive: false, life: 0.6, size: 0.5 });
      if (this.burrowT > a.windup + 0.2) {
        this.pos.x = this.burrowX; this.pos.z = this.burrowZ;
        this.model.hidden = false; this.yOffset = -4;
        this.burrowPhase = 'up'; this.burrowT = 0;
        addShake(0.5);
        ring(this.pos.x, groundY(this.pos.x, this.pos.z), this.pos.z, { radius: a.radius, color: '#e0c080', dur: 0.5 });
        burst(this.pos.x, groundY(this.pos.x, this.pos.z) + 0.5, this.pos.z, { count: 40, speed: 12, color: '#c8a070', color2: '#8a6040', additive: false, life: 1, size: 0.7, up: 1.2, gravity: -14 });
        for (const e of entitiesNear(this.pos.x, this.pos.z, a.radius, (e) => hostile(this, e))) dealDamage(this, e, this.baseDmg * a.mult, { kind: 'melee', knock: 12, fromX: this.pos.x, fromZ: this.pos.z });
      }
    } else {
      this.yOffset = Math.min(0, -4 + this.burrowT * 10);
      if (this.burrowT > a.recover) { this.yOffset = 0; this.burrowPhase = null; this.atk = null; this.st.action = null; }
    }
  }

  syncModel(dt) {
    this.st.combat = !!this.target && this.state !== 'idle' && this.state !== 'wander';
    if (this.model.kind === 'serpent') this.updateSerpent(dt);
    super.syncModel(dt);
  }

  updateSerpent(dt) {
    const segs = this.model.segs;
    const tr = this.trail;
    const last = tr[tr.length - 1];
    if (!last || Math.hypot(last.x - this.pos.x, last.z - this.pos.z) > 0.2) tr.push({ x: this.pos.x, y: this.pos.y, z: this.pos.z });
    if (tr.length > 260) tr.shift();
    const sc = this.tpl.size * (this.elite ? 1.18 : 1);
    const spacing = 0.42 * sc;
    let acc = 0, seg = 0;
    let px = this.pos.x, pz = this.pos.z;
    for (let i = tr.length - 2; i >= 0 && seg < segs.length; i--) {
      const p = tr[i];
      acc += Math.hypot(p.x - px, p.z - pz);
      px = p.x; pz = p.z;
      while (acc >= spacing * (seg + 1) && seg < segs.length) {
        const s = segs[seg];
        const wave = Math.sin(this.st.t * 4 - seg * 0.7) * 0.15 * sc;
        s.x = p.x; s.z = p.z; s.y = p.y + wave * 0.5 + this.yOffset * (1 - seg / segs.length);
        seg++;
      }
    }
    for (; seg < segs.length; seg++) {
      const s = segs[seg];
      s.x = this.pos.x - Math.sin(this.facing) * spacing * (seg + 1); s.z = this.pos.z - Math.cos(this.facing) * spacing * (seg + 1); s.y = this.pos.y + this.yOffset;
    }
  }

  onDeath(killer) {
    if (this.tele) this.tele.done = true;
    this.model.hidden = false;
    this.yOffset = 0;
    burst(this.pos.x, this.pos.y + this.height * 0.5, this.pos.z, { count: this.boss ? 80 : 18, speed: this.boss ? 12 : 6, color: ELEM_COLORS[this.element]?.[1] || '#d0c0a0', life: 0.8 });
    if (this.boss) { addShake(0.7); flash(this.pos.x, this.pos.y + 2, this.pos.z, '#ffe0a0', 60, 30, 1.0); }
    if (this.affix?.id === 'molten') spawnHazard({ x: this.pos.x, z: this.pos.z, radius: 3, owner: this, dmg: this.baseDmg * 0.4, life: 3, element: 'fire', status: { burn: 1 } });
    if (this.onKilled) this.onKilled(this, killer);
  }
}

function buildHeight(tpl) {
  return { quadruped: 1.2, arachnid: 1.0, serpent: 1.2, blob: 1.3, golem: 2.0, wraith: 2.0, flyer: 1.8, treant: 2.2, dragon: 2.0, eye: 2.0 }[tpl.body] || 1.9;
}

function groundY(x, z) { return G.realm === 'dungeon' ? (G.dungeon?.floorY ?? 0) : groundHeight(x, z); }

// Game-time timers (respect pause/hitstop)
const timers = [];
// a timer set while a co-op partner's actions replay keeps their events muted when it fires
export function setTimeoutGame(delay, fn) { timers.push({ t: delay, fn, muted: bus.muted }); }
export function updateTimers(dt) {
  for (let i = timers.length - 1; i >= 0; i--) {
    timers[i].t -= dt;
    if (timers[i].t <= 0) {
      const { fn, muted } = timers[i];
      timers.splice(i, 1);
      const prev = bus.muted;
      bus.muted = muted;
      try { fn(); } finally { bus.muted = prev; }
    }
  }
}
export function clearTimers() { timers.length = 0; }
