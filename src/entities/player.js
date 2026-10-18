// The player: input-driven movement, continuous melee combos (hold to keep swinging), auto-firing
// bows and crossbows, casting, dodge, block/parry. Weapons come from the loadout (keys 1-4).
import { rarityOfRace, rarityOfClass } from '../data/fateRarity.js';
import { Vec3 } from '../core/vec3.js';
import { G } from '../game.js';
import { Entity } from './entity.js';
import { Actor } from '../px/actor.js';
import { raceLook, mountSpec } from '../px/specs.js';
import { armorLook, weaponSpec, shieldSpec } from '../px/gearLook.js';
import { attackKindFor } from '../px/attackKinds.js';
import { computeStats } from '../systems/stats.js';
import { input, key, keyPressed } from '../core/input.js';
import { view } from '../px/view.js';
import { PPU } from '../px/pix.js';
import { cam, mouseWorld, moveBasis, cursorLow } from '../world/cameraRig.js';
import { RACE_BY_ID } from '../data/races.js';
import { CLASS_BY_ID } from '../data/classes.js';
import { TOMES } from '../data/tomes.js';
import { dealDamage, targetsInArc, spawnProjectile, movementMult, canAct, hostile, entitiesNear, chainLightning } from '../systems/combat.js';
import { slash, burst, particle, floatText, ELEM_COLORS, ring, flash, shockwave } from '../render/vfx.js';
import { bus } from '../core/events.js';
import { angleDiff, clamp, damp, dampAngle } from '../core/math.js';
import { groundHeight, waterLevel } from '../world/terrain.js';
import { MOUNTS } from '../data/mounts.js';
import { S } from '../data/items.js';
import { weatherSlow } from '../world/weather.js';
import { requestLight, R } from '../render/renderer.js';
import { magic } from '../render/magic.js';
import { mulberry32 } from '../core/rng.js';

// Class silhouettes. Rogues and casters wear a deep hood (eyes glowing out of the shadow) and a
// cloak thrown over one shoulder; fighters show their face and wear a plain cape from their armour.
// An equipped helm always replaces the default hood.
const OUTFIT = {
  ranger: ['#3e5a34', '#b8f070', '#2e3a26', '#8a9a7a'],
  assassin: ['#2a2836', '#ff4a6a', '#1e1c26', '#7a7a8a'],
  pyromancer: ['#7a2a1c', '#ffb040', '#3a2420', '#a8907a'],
  cryomancer: ['#2e4a78', '#80e8ff', '#2a3448', '#a8b8c8'],
  necromancer: ['#2c3e6e', '#c070ff', '#24202e', '#9aaa94'],
  alchemist: ['#2e5a56', '#a0ffb0', '#3a3228', '#9a8a70'],
  warden: ['#4a5a2e', '#d0ff80', '#2e3420', '#8a9070'],
  cleric: ['#d8ccb0', '#ffe8a0', '#5a4a3a', '#c8b898'],
};
// fighters keep their face bare and wear a plain class cape until their armour brings a better one
const CAPE = { knight: ['#2e3e6e', '#e0c070'], berserker: ['#5a2418', '#c89a60'], duelist: ['#6a1a2a', '#e8d0a0'], bard: ['#4a2a6a', '#f0c060'] };
function classOutfit(id) {
  const o = OUTFIT[id];
  if (!o) return CAPE[id] ? { cape: CAPE[id][0], capeTrim: CAPE[id][1] } : {};
  const [cloak, eyes, pants, boots] = o;
  return { hoodDefault: { kind: 'hood', color: cloak, eyes }, cloak, pants, bootsColor: boots };
}

export class Player extends Entity {
  constructor(char) {
    super();
    this.isPlayer = true;
    this.char = char;
    this.team = 'player';
    this.name = char.name;
    this.radius = 0.45;
    this.height = 1.9;
    this.level = char.level;
    this.mana = 0; this.stamina = 100;
    this.resource = 0;
    this.buffs = {};
    this.buffTimers = {};
    this.cooldowns = {};
    this.combo = 0; this.comboTimer = 0;
    this.action = null;
    this.blocking = false; this.parryT = 99;
    this.invuln = 0;
    this.staminaDelay = 0;
    this.lastCombatT = -99;
    this.mounted = null;
    this.stealthed = false;
    this.facing = 0;
    this.chargeT = 0;
    this.drawT = 0;
    this.xbowLoaded = true;
    this.aim = new Vec3();
    this.minions = [];
    this.swimming = false;
    this.canSwim = false;
    this.deathlessT = 0;
    this.beatT = 0;
    this.buildModel();
    this.refreshStats(true);
  }

  buildModel() {
    const race = RACE_BY_ID[this.char.race];
    const lk = race.look;
    const rnd = mulberry32(this.char.name.length * 31 + this.char.race.length);
    const app = this.char.appearance || (this.char.appearance = { skin: Math.floor(rnd() * lk.skin.length), hair: Math.floor(rnd() * lk.hair.length) });
    const cls = CLASS_BY_ID[this.char.cls];
    this.baseLook = { ...raceLook(lk, app, { shirt: cls.color, pants: '#3a3028', longHair: rnd() < 0.4 }), ...classOutfit(cls.id) };
    const actor = new Actor(this, { type: 'human', look: this.baseLook, scale: lk.scale });
    if (this.model) this.removeModel();
    this.removed = false;
    this.attachModel(actor);
    this.height = 1.9 * lk.scale;
    magic.target = this;
    R.focus = this.pos;      // occlusion test point for the x-ray outline
    R.focusModel = this.model;
  }

  refreshStats(full = false) {
    const c = this.char;
    this.level = c.level;
    const prevMax = this.maxHp || 1;
    this.derived = computeStats(c);
    const d = this.derived;
    this.maxHp = d.maxHp;
    this.maxMana = d.maxMana;
    this.maxStamina = d.maxStamina;
    this.armor = d.armor;
    this.res = d.res;
    if (full) { this.hp = this.maxHp; this.mana = this.maxMana; this.stamina = this.maxStamina; }
    else this.hp = Math.min(this.maxHp, this.hp * (this.maxHp / prevMax));
    this.canSwim = d.traits.has('gills');
    // visuals: armour on the sprite, weapon / shield / floating tome
    const A = this.model;
    A.setLook({ ...this.baseLook, ...armorLook(c.equip) });
    A.setWeapon(weaponSpec(c.equip.mainhand));
    A.setShield(c.equip.offhand && !d.twoHanded ? shieldSpec(c.equip.offhand) : null);
    A.setTome(c.equip.tome ? { color: TOMES[c.equip.tome.tome]?.color || '#6a2a20', glow: '#ffe0a0' } : null);
    this.st.twoHanded = d.twoHanded || d.weapon.type === 'staff';
    this.xbowLoaded = true;
    this.st.weaponType = d.weapon.type;
    this.st.hasShield = d.hasShield;
    this.st.runSpeed = 6;
    const cls = CLASS_BY_ID[c.cls];
    this.resourceMax = cls.resource.max;
    if (d.flags.lantern) this.lantern = true; else this.lantern = false;
    bus.emit('statsChanged', this);
  }

  // -------------------------------------------------------------- resources
  useStamina(n, force = false) {
    if (!force && this.stamina < n * 0.5) { bus.emit('lowStamina'); return false; }
    this.stamina = Math.max(0, this.stamina - n);
    this.staminaDelay = 0.7;
    return true;
  }
  useMana(n) {
    if (this.derived.traits.has('abyssal') && Math.random() < 0.1) { floatText(this.pos.x, this.pos.y + 2.4, this.pos.z, 'Free cast', { color: '#c090ff' }); return true; }
    if (this.mana < n) { bus.emit('lowMana'); return false; }
    this.mana -= n;
    return true;
  }
  heal(n, silent = false) {
    if (this.dead) return;
    const mult = this.derived.traits.has('grave_chill') ? 0.9 : 1;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + n * mult);
    const got = this.hp - before;
    if (!silent && got >= 1) floatText(this.pos.x, this.pos.y + 2.2, this.pos.z, '+' + Math.round(got), { color: '#70ff70' });
    bus.emit('healed', { amount: got, over: n * mult - got });
  }
  guardBreak() {
    this.blocking = false;
    this.stun = 0.8;
    floatText(this.pos.x, this.pos.y + 2.3, this.pos.z, 'Guard Broken', { color: '#ff8040', force: true });
  }
  tryCheatDeath() {
    const d = this.derived;
    if ((d.traits.has('deathless') || d.flags.cheatDeath) && this.deathlessT <= 0) {
      this.deathlessT = d.flags.cheatDeath ? 180 : 300;
      floatText(this.pos.x, this.pos.y + 2.5, this.pos.z, 'Deathless!', { color: '#80e0ff', force: true });
      burst(this.pos.x, this.pos.y + 1, this.pos.z, { count: 40, speed: 8, color: '#80e0ff', life: 1 });
      this.invuln = 1.5;
      return true;
    }
    return false;
  }
  addBuff(id, dur, data = {}) {
    this.buffTimers[id] = dur;
    this.buffs[id] = data;
    this.recomputeBuffs();
  }
  recomputeBuffs() {
    const b = { dmgPct: 0, armorPct: 0, speedPct: 0, attackSpeedPct: 0, regenPct: 0, lifesteal: 0, shield: this.buffs.shield || 0, invuln: 0, frontBlock: 0, staminaRegen: 0, allRes: 0, thorns: 0, chillAttackers: 0, stealth: 0 };
    for (const [id, data] of Object.entries(this.buffs)) {
      if (id === 'shield' || id === '_agg') continue;
      for (const [k, v] of Object.entries(data)) if (k in b && k !== 'shield') b[k] += v;
    }
    this.buffAgg = b;
  }

  get buffStat() { return this.buffAgg || {}; }

  // A short body/arm animation for abilities that don't run a full action (volleys, buffs, throws,
  // blinks): the pose plays through its wind-up, strike and follow-through over `dur` seconds.
  playPose(kind, dur = 0.4) { this.poseAnim = { kind, t: 0, dur }; this.st.action = 'attack'; this.st.kind = kind; this.st.actionT = 0; }
  stepPose(dt) {
    const a = this.poseAnim;
    if (!a) return;
    a.t += dt;
    if (this.action || this.drawing) { if (a.t >= a.dur) this.poseAnim = null; return; }
    if (a.t >= a.dur) { this.poseAnim = null; if (this.st.kind === a.kind) this.st.action = null; return; }
    this.st.action = 'attack'; this.st.kind = a.kind; this.st.actionT = a.t / a.dur;
  }
  // -------------------------------------------------------------- update
  update(dt) {
    if (this.dead) {
      this.deathT += dt;
      this.st.dead = true; this.st.deathT = this.deathT;
      this.syncModel(dt);
      return;
    }
    this.baseUpdate(dt);
    const d = this.derived;
    const B = this.buffAgg || {};
    this.st.swapT = (this.st.swapT ?? 9) + dt;
    // timers
    for (const k in this.cooldowns) if (this.cooldowns[k] > 0) this.cooldowns[k] -= dt * (1 + d.cdr / 100);
    for (const [id, t] of Object.entries(this.buffTimers)) {
      this.buffTimers[id] = t - dt;
      if (this.buffTimers[id] <= 0) { delete this.buffTimers[id]; delete this.buffs[id]; if (id === 'stealth') this.breakStealth(false); this.recomputeBuffs(); bus.emit('buffEnd', id); }
    }
    this.buffs.shield = this.buffs.shield || 0;
    this.invuln = Math.max(0, this.invuln - dt);
    this.deathlessT -= dt;
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.combo = 0;
    this.parryT += dt;
    // regen
    const inCombat = G.time - this.lastCombatT < 5;
    const regen = (d.regen + (B.regenPct || 0)) / 100 + (inCombat ? 0 : 0.02);
    if (this.hp < this.maxHp && !this.dead) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * regen * dt);
    this.mana = Math.min(this.maxMana, this.mana + d.manaRegen * dt * (inCombat ? 1 : 2.5));
    this.staminaDelay -= dt;
    if (this.staminaDelay <= 0 && !this.sprinting) this.stamina = Math.min(this.maxStamina, this.stamina + 38 * d.staminaRegenMult * (1 + (B.staminaRegen || 0) / 100) * dt);
    if (d.traits.has('tidecaller') && !inCombat && G.weather?.def?.wet) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.02 * dt);

    // aim point: the ground under the cursor, but if the cursor is over an enemy's sprite
    // (drawn above its feet in this 3/4 view) aim at that enemy instead
    mouseWorld(this.pos.y + 1.0, this.aim);
    if (!input.usingPad) {
      const tgt = this.enemyUnderCursor();
      if (tgt) { this.aim.x = tgt.pos.x; this.aim.z = tgt.pos.z; }
    }
    G.aimPoint.copy(this.aim);

    const free = !input.uiBlocking && G.mode === 'play';
    const able = canAct(this);
    // swimming / water
    const wl = G.realm === 'dungeon' ? -999 : waterLevel(this.pos.x, this.pos.z);
    const depth = wl - this.pos.y;
    this.swimming = depth > 1.0;
    this.wading = depth > 0.15 && !this.swimming;
    if (this.swimming && this.canSwim) { this.yOffset = depth - 1.25; } else this.yOffset = 0;

    // mount toggle
    if (free && keyPressed('g') && !this.action) this.toggleMount();

    // ---- movement input
    let mx = 0, mz = 0;
    if (free) {
      const b = moveBasis();
      if (key('w')) { mx += b.fx; mz += b.fz; }
      if (key('s')) { mx -= b.fx; mz -= b.fz; }
      if (key('d')) { mx += b.rx; mz += b.rz; }
      if (key('a')) { mx -= b.rx; mz -= b.rz; }
    }
    const ml = Math.hypot(mx, mz);
    if (ml > 0) { mx /= ml; mz /= ml; }
    this.moveDir = { x: mx, z: mz };

    // ---- block / parry
    const wantBlock = free && able && input.mouse.right && !this.mounted && !(this.action && this.action.type !== 'block') && !this.swimming;
    if (wantBlock && !this.blocking) { this.blocking = true; this.parryT = 0; bus.emit('blockStart'); }
    if (!wantBlock) this.blocking = false;
    this.st.block = this.blocking;

    // ---- dodge
    if (free && able && keyPressed('space') && !this.mounted && (!this.action || this.action.cancelable || this.action.type === 'attack' && this.action.t > this.action.strikeAt)) {
      const cost = 22 * (d.traits.has('swift') ? 0.85 : 1);
      if (this.useStamina(cost)) this.startDodge(ml > 0 ? Math.atan2(mx, mz) : this.facing);
    }

    // ---- attacks
    const wt = d.weapon.type;
    if (free && able && !this.mounted && !this.swimming) {
      if (d.weapon.ranged) this.handleRanged(dt, ml);
      else if (wt === 'staff' || wt === 'wand' || wt === 'tome') this.handleBolt(dt);
      else this.handleMelee(dt);
    } else if (this.mounted && free && input.mousePressed.left) this.toggleMount();

    // ---- actions
    let speedMult = 1;
    if (this.action) speedMult = this.updateAction(dt);
    if (this.blocking) speedMult = Math.min(speedMult, 0.45);
    if (this.drawing) speedMult = Math.min(speedMult, 0.5);

    // ---- move
    let base = 6.0 * d.moveSpeedMult * (1 + (B.speedPct || 0) / 100);
    if (this.mounted) base = this.mounted.def.speed * (1 + (d.moveSpeed || 0) / 200);
    // sprinting drains stamina slowly and steadily; run it dry and you're winded until it
    // refills to a third (no stop-start stutter at the bottom of the bar)
    if (this.stamina <= 0.5) this.winded = true;
    else if (this.winded && this.stamina >= this.maxStamina * 0.33) this.winded = false;
    this.sprinting = free && key('shift') && ml > 0 && !this.action && !this.blocking && !this.winded && !this.swimming;
    if (this.sprinting) { base *= this.mounted ? 1.35 : 1.55; this.stamina = Math.max(0, this.stamina - (this.mounted ? 3 : 6.5) * dt); this.staminaDelay = 0.35; }
    if (this.swimming) base *= 0.55;
    else if (this.wading) base *= 0.75;
    const ws = weatherSlow();
    if (ws && !d.traits.has('heat_walker') && !d.flags.stormImmune) base *= 1 - ws;
    const statusMult = movementMult(this);
    if (this.action?.type === 'dodge') {
      const u = this.action.t / this.action.dur;
      const sp = 15 * (1 - u * 0.7);
      const moved = this.move(Math.sin(this.action.dir) * sp * dt, Math.cos(this.action.dir) * sp * dt, dt);
      this.moveSpeedNow = moved / dt;
      this.facing = this.action.dir;
    } else if (ml > 0 && statusMult > 0) {
      const sp = base * speedMult * statusMult;
      const moved = this.move(mx * sp * dt, mz * sp * dt, dt);
      this.moveSpeedNow = moved / Math.max(dt, 0.0001);
      this.vel.set(mx * sp, 0, mz * sp);
      if (!this.action && !this.blocking && !this.drawing) this.facing = dampAngle(this.facing, Math.atan2(mx, mz), 16, dt);
      if (this.wading && Math.random() < dt * 10) particle({ x: this.pos.x, y: wl + 0.05, z: this.pos.z, vx: (Math.random() - 0.5) * 2, vy: 2, vz: (Math.random() - 0.5) * 2, life: 0.4, size: 0.25, color: '#d8f0ff', gravity: -9 });
    } else { this.moveSpeedNow = 0; this.vel.set(0, 0, 0); }
    if ((this.action && this.action.faceAim) || this.blocking || this.drawing) {
      const lk = this.action?.lock, f = lk && !lk.dead ? lk.pos : this.aim;
      this.facing = dampAngle(this.facing, Math.atan2(f.x - this.pos.x, f.z - this.pos.z), 20, dt);
    }

    // camera look-ahead toward aim when in combat
    const la = inCombat ? 2.5 : 0;
    cam.lookAhead.set(clamp(this.aim.x - this.pos.x, -10, 10) / 10 * la, 0, clamp(this.aim.z - this.pos.z, -10, 10) / 10 * la);

    // mounted model
    if (this.mounted) this.updateMount(dt);
    this.st.ride = !!this.mounted;
    this.st.sprint = this.sprinting;
    this.st.dodgeT = this.action?.type === 'dodge' ? this.action.t / this.action.dur : -1;
    this.model.alpha = this.stealthed ? 0.38 + Math.sin(G.time * 9) * 0.08 : 1;
    this.st.combat = inCombat || this.drawing || this.blocking;
    // lights
    if (this.lantern || G.realm !== 'surface' || G.dungeon) requestLight(this.pos.x, this.pos.y + 3, this.pos.z, G.realm === 'deep' ? '#c0d8ff' : '#ffc890', G.realm === 'surface' && !this.lantern ? 0 : G.realm === 'deep' ? 14 : 10, G.realm === 'deep' ? 21 : 16);
    this.stepPose(dt);
    // Mythic and rarer fates shed a few motes of their rarity colour
    const fr = G.char && (rarityOfRace(G.char.race).index >= rarityOfClass(G.char.cls).index ? rarityOfRace(G.char.race) : rarityOfClass(G.char.cls));
    if (fr && fr.index >= 3 && !this.stealthed && Math.random() < dt * (fr.index * 2.2)) {
      const a = Math.random() * Math.PI * 2;
      particle({ x: this.pos.x + Math.cos(a) * 0.45, y: this.pos.y + 0.3 + Math.random() * 1.4, z: this.pos.z + Math.sin(a) * 0.3, vy: 0.9 + Math.random() * 0.6, life: 0.9, size: 0.13, color: fr.id === 'supreme' ? ['#fff0a0', '#a0f0ff', '#ffa0f0'][Math.floor(Math.random() * 3)] : fr.color, gl: true });
    }
    this.syncModel(dt);
  }

  enemyUnderCursor() {
    const [cx, cy] = cursorLow();
    let best = null, bd = 1e9;
    for (const e of G.entities) {
      if (e.dead || e.removed || e.isNpc || !e.model || !hostile(this, e)) continue;
      const hp = e.model.heightPx || 24;
      const X = e.pos.x * PPU - view.x0, Y = e.pos.z * PPU - view.y0 - (e.pos.y - view.ground(e.pos.x, e.pos.z)) * PPU;
      const half = Math.max(6, hp * 0.32);
      if (cx < X - half || cx > X + half || cy < Y - hp - 2 || cy > Y + 3) continue;
      const d = Math.abs(cx - X) + Math.abs(cy - (Y - hp * 0.5));
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // -------------------------------------------------------------- melee
  // Hold left click to keep swinging: each swing can be cancelled into the next once its hit has
  // landed and the blade is into its follow-through, so the combo chain loops without a gap.
  handleMelee(dt) {
    if (input.mousePressed.left) this.attackQueued = 0.3;
    if (this.attackQueued > 0) this.attackQueued -= dt;
    const want = input.mouse.left || this.attackQueued > 0;
    if (!want) return;
    const a = this.action;
    if (!a || (a.type === 'attack' && a.hit && a.t >= a.cancelAt)) {
      this.action = null;
      this.attackQueued = 0;
      this.startAttack();
    }
  }

  startAttack() {
    const d = this.derived;
    const w = d.weapon;
    const speed = (w.speed || 1) * d.atkSpeedMult * (1 + ((this.buffAgg?.attackSpeedPct) || 0) / 100);
    const comboMax = w.combo || 3;
    const idx = this.combo % comboMax;
    const final = idx === comboMax - 1;
    // snappy: a short anticipation, the hit lands early, the follow-through can be cancelled into
    // the next swing. The combo finisher is a touch slower and hits harder.
    const dur = (w.hands === 2 ? 0.56 : 0.36) / speed * (final ? 1.15 : 1);
    const su = w.hands === 2 ? 0.36 : 0.28;
    const kind = attackKindFor(w.type, idx);
    // swing step + soft lock: pick the closest enemy near the aim line and step into it during the
    // wind-up, so a held attack chain keeps connecting instead of whiffing just out of reach
    const range = w.range || 2;
    const aimAng = Math.atan2(this.aim.x - this.pos.x, this.aim.z - this.pos.z);
    let lock = null, lockD = range + 3.2;
    for (const e of entitiesNear(this.pos.x, this.pos.z, range + 3.2, (e) => !e.dead && hostile(this, e))) {
      const dist = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
      if (dist < lockD && Math.abs(angleDiff(aimAng, Math.atan2(e.pos.x - this.pos.x, e.pos.z - this.pos.z))) < 0.9) { lock = e; lockD = dist; }
    }
    const maxStep = w.hands === 2 ? 1.7 : 2.4;
    const step = lock ? clamp(lockD - range * 0.7, 0, maxStep) : 0.3;
    this.action = { type: 'attack', t: 0, dur, strikeAt: dur * su, cancelAt: dur * (final ? 0.78 : 0.62), kind, combo: idx, faceAim: true, hit: false, final, lock, step };
    this.st.action = 'attack'; this.st.kind = kind; this.st.actionT = 0; this.st.strikeU = su;
    this.combo++;
    this.comboTimer = dur + 0.5;
    this.facing = lock ? Math.atan2(lock.pos.x - this.pos.x, lock.pos.z - this.pos.z) : aimAng;
    bus.emit('swing', { kind, weapon: w.type });
  }

  strike(a) {
    const d = this.derived;
    const w = d.weapon;
    const comboMult = a.heavy || (a.final ? 1.35 : 1 + a.combo * 0.08);
    const range = (w.range || 2) * (a.heavy ? 1.2 : 1);
    const arc = (w.arc || 90) + (a.heavy ? 30 : 0) + (a.final ? 20 : 0);
    const el = w.element || (d.passives.meleeStatus === 'poison' ? 'physical' : 'physical');
    const color = w.element ? ELEM_COLORS[w.element][1] : '#c8dcff';
    const stab = a.kind === 'stab' || a.kind === 'thrust' || a.kind === 'spearthrust';
    slash(this.pos.x, this.pos.y, this.pos.z, this.facing, { radius: range, arc: a.kind === 'overhead' ? arc * 0.6 : arc, color, dur: a.final ? 0.22 : 0.15, reverse: a.kind === 'backslash', kind: stab ? 'thrust' : 'arc', width: a.final ? 4 : 3 });
    if (a.final && (a.kind === 'overhead' || a.kind === 'slam' || d.twoHanded)) shockwave(this.pos.x + Math.sin(this.facing) * range * 0.7, this.pos.y, this.pos.z + Math.cos(this.facing) * range * 0.7, { radius: 1.6, cracks: 6, color: color });
    let hitAny = false;
    for (const e of targetsInArc(this, range + 0.3, arc)) {
      hitAny = true;
      this.hitWithWeapon(e, comboMult, { heavy: !!a.final && d.twoHanded, final: a.final, knock: a.final ? 3.5 : undefined });
    }
    if (a.final && d.powers.heavyWave) this.waveAttack(d.powers.heavyWave);
    if (a.final && d.powers.heavyFreeze) for (const e of entitiesNear(this.pos.x + Math.sin(this.facing) * 2, this.pos.z + Math.cos(this.facing) * 2, 3.5, (e) => hostile(this, e))) e.status && (e.frozen = Math.max(e.frozen || 0, 2));
    if (a.final && d.flags.dragonBreath) this.waveAttack('fire', 0.8);
    if (hitAny) bus.emit('meleeHit', { player: this, heavy: a.final });
    this.lastCombatT = G.time;
  }

  // Shared weapon hit (melee & weapon-skill)
  hitWithWeapon(e, mult = 1, o = {}) {
    const d = this.derived;
    const w = d.weapon;
    let dmg = d.weaponDmg * mult;
    let crit = Math.random() * 100 < d.critChance + (o.critBonus || 0);
    const toMe = Math.atan2(this.pos.x - e.pos.x, this.pos.z - e.pos.z);
    const behind = Math.abs(angleDiff(e.facing, toMe)) > 2.0;
    const hooks = { dmg, crit, behind, e, kind: 'melee', o };
    bus.emit('preHit', hooks);
    dmg = hooks.dmg; crit = hooks.crit;
    if (behind) dmg *= 1.2;
    if (this.buffAgg?.dmgPct) dmg *= 1 + this.buffAgg.dmgPct / 100;
    if (d.flags.highHpDmg && this.hp > this.maxHp * 0.8) dmg *= 1.15;
    if (d.traits.has('bloodrush') && this.hp < this.maxHp * 0.35) dmg *= 1.2;
    if ((d.traits.has('predator') || d.powers.predator) && e.hp < e.maxHp * 0.5) dmg *= 1 + (d.powers.predator || 0.15);
    if (d.traits.has('ancestral_roar') && !e._roared) { e._roared = true; dmg *= 1.25; }
    if (e.boss && d.bossDmg) dmg *= 1 + d.bossDmg / 100;
    if ((G.realm === 'deep' || G.realm === 'dungeon') && (d.flags.deepDmg || d.powers.deepDmg)) dmg *= 1 + (d.powers.deepDmg || 20) / 100;
    if (this.stealthed) { dmg *= 2.5; this.breakStealth(true); }
    if (crit) dmg *= 1 + d.critDmg / 100;
    const status = {};
    if (w.element === 'fire') status.burn = 2;
    if (w.element === 'frost') status.chill = 1;
    if (w.element === 'lightning') status.shock = 1;
    if (w.element === 'rot' || d.passives.meleeStatus === 'poison') status.poison = 2;
    if (w.element === 'void') status.weaken = 1;
    if (w.element === 'holy') status.brand = 1;
    if (d.powers.armorBreak) status.armorBreak = 4;
    if (o.status) Object.assign(status, o.status);
    const elemental = w.element && Math.random() < 0.35 ? w.element : 'physical';
    const dealt = dealDamage(this, e, dmg, { kind: 'melee', crit, element: o.element || elemental, status, knock: o.heavy ? 6 : o.knock || 1.5, stagger: o.heavy ? 1.5 : (w.stagger || 0.6), heavy: o.heavy, lifesteal: o.lifesteal });
    if (crit && d.powers.critBleed) e.status && (e.status.bleed = 4, e.status.bleedDps = dealt * 0.15, e.status.bleedSrc = this);
    if (crit && d.flags.critChain) chainLightning(this, e, dealt * 0.4, 2);
    if (d.powers.waveChance && Math.random() < d.powers.waveChance) this.waveAttack('water', 0.6);
    if (d.flags.tenthStrike) { this.tenth = (this.tenth || 0) + 1; if (this.tenth >= 10) { this.tenth = 0; bus.emit('callLightning', { x: e.pos.x, z: e.pos.z }); } }
    if (d.flags.thornHits && Math.random() < 0.12) bus.emit('thornBurst', { x: e.pos.x, z: e.pos.z });
    bus.emit('playerHitEnemy', { e, dmg: dealt, crit, behind, kind: 'melee' });
    return dealt;
  }

  waveAttack(el, mult = 1) {
    const sx = this.pos.x, sz = this.pos.z;
    const ang = this.facing;
    spawnProjectile({ x: sx + Math.sin(ang), y: this.pos.y + 0.8, z: sz + Math.cos(ang), vx: Math.sin(ang) * 18, vz: Math.cos(ang) * 18, owner: this, dmg: this.derived.weaponDmg * 1.2 * mult, element: el, kind: 'orb', size: 0.7, pierce: 99, radius: 1.4, life: 0.6, status: el === 'fire' ? { burn: 2 } : { soak: 2 } });
  }

  // -------------------------------------------------------------- ranged
  handleRanged(dt, moving) {
    const d = this.derived;
    const w = d.weapon;
    if (w.type === 'bow') {
      // hold to keep shooting: the bow draws to full and looses on its own, then draws again;
      // letting go early looses a quicker, weaker arrow
      const full = 0.34;
      if (input.mouse.left && !this.action) {
        if (!this.drawing) { this.drawing = true; this.drawT = 0; bus.emit('bowDraw'); }
        this.drawT += dt * d.atkSpeedMult * (w.speed || 1);
        this.st.action = 'attack'; this.st.kind = 'bowdraw'; this.st.actionT = Math.min(1, this.drawT / full);
        bus.emit('drawing', { t: this.drawT, still: !moving, dt });
        if (this.drawT >= full) this.looseArrow(1);
      } else if (this.drawing) this.looseArrow(Math.min(1, this.drawT / full));
    } else {
      // crossbow: hold to keep firing; it cranks back between bolts
      if (input.mouse.left && !this.action && this.xbowLoaded) {
        this.fireArrow(1, 'bolt');
        this.xbowLoaded = false;
        this.action = { type: 'reload', t: 0, dur: 0.62 / ((w.speed || 0.6) * d.atkSpeedMult) * 0.6, faceAim: true };
        this.st.action = 'attack'; this.st.kind = 'xbow'; this.st.actionT = 0;
      }
    }
  }

  looseArrow(draw) {
    this.drawing = false;
    if (draw > 0.15) this.fireArrow(draw);
    this.action = { type: 'shot', t: 0, dur: 0.1, faceAim: true };
    this.st.kind = 'bowrelease'; this.st.actionT = 0;
  }

  fireArrow(draw, kind = 'arrow') {
    const d = this.derived;
    const w = d.weapon;
    let dmg = d.weaponDmg * (0.35 + 0.65 * draw);
    let crit = Math.random() * 100 < d.critChance + (d.rangedCrit || 0);
    const hooks = { dmg, crit, draw, kind: 'ranged' };
    bus.emit('preShot', hooks);
    dmg = hooks.dmg; crit = hooks.crit;
    if (this.buffAgg?.dmgPct) dmg *= 1 + this.buffAgg.dmgPct / 100;
    if (this.stealthed) { dmg *= 2.5; this.breakStealth(true); }
    if (crit) dmg *= 1 + d.critDmg / 100;
    const el = d.passives.arrowElement || w.element || 'physical';
    const spd = (w.projSpeed || 46) * (0.6 + 0.4 * draw);
    const ang = Math.atan2(this.aim.x - this.pos.x, this.aim.z - this.pos.z);
    this.facing = ang;
    const sy = this.pos.y + 1.35;
    const status = el === 'fire' ? { burn: 2 } : el === 'frost' ? { chill: 1 } : el === 'lightning' ? { shock: 1 } : el === 'rot' ? { poison: 2 } : el === 'void' ? { weaken: 1 } : null;
    const extra = d.powers.arrowRoot && Math.random() < d.powers.arrowRoot ? { root: 2 } : null;
    spawnProjectile({ x: this.pos.x + Math.sin(ang) * 0.6, y: sy, z: this.pos.z + Math.cos(ang) * 0.6, vx: Math.sin(ang) * spd, vz: Math.cos(ang) * spd, vy: 0.4, gravity: -1.5, owner: this, dmg, element: el, kind, crit, status: extra ? { ...status, ...extra } : status, chain: d.passives.arrowChain || d.powers.boltChain || 0, life: 1.6, radius: 0.5, heavy: draw >= 1 });
    bus.emit('shot', { kind, draw, crit });
    this.lastCombatT = G.time;
  }

  // -------------------------------------------------------------- caster bolts
  handleBolt(dt) {
    const d = this.derived;
    const w = d.weapon;
    if ((input.mousePressed.left || input.mouse.left) && !this.action) {
      const el = d.powers.holyBolts ? 'holy' : d.tome ? TOMES[d.tome.id].element === 'physical' ? 'void' : TOMES[d.tome.id].element : 'void';
      const dur = (w.type === 'staff' ? 0.4 : 0.27) / ((w.speed || 1) * d.atkSpeedMult);
      this.action = { type: 'bolt', t: 0, dur, strikeAt: dur * 0.4, faceAim: true, el };
      this.st.action = 'attack'; this.st.kind = 'cast'; this.st.actionT = 0; this.st.strikeU = 0.4;
    }
  }

  fireBolt(el) {
    const d = this.derived;
    const w = d.weapon;
    let dmg = d.weaponDmg * (w.type === 'staff' ? 1.25 : w.type === 'tome' ? 1.05 : 0.9) * (1 + d.spellPower / 200);
    let crit = Math.random() * 100 < d.critChance + d.spellCrit;
    const hooks = { dmg, crit, kind: 'bolt', element: el };
    bus.emit('preShot', hooks);
    dmg = hooks.dmg; crit = hooks.crit;
    if (this.buffAgg?.dmgPct) dmg *= 1 + this.buffAgg.dmgPct / 100;
    if (crit) dmg *= 1 + d.critDmg / 100;
    const ang = Math.atan2(this.aim.x - this.pos.x, this.aim.z - this.pos.z);
    const sp = w.type === 'tome' ? this.model.handPos(new Vec3()) : this.model.weaponTip(new Vec3());
    const spd = w.type === 'staff' ? 28 : 36;
    spawnProjectile({ x: sp.x + Math.sin(ang) * 0.3, y: this.pos.y + 1.35, z: sp.z + Math.cos(ang) * 0.3, vx: Math.sin(ang) * spd, vz: Math.cos(ang) * spd, owner: this, dmg, element: el, kind: 'orb', size: w.type === 'staff' ? 0.36 : 0.24, crit, pierce: d.powers.holyBolts ? 3 : 0, life: 1.0, dmgKind: 'spell', status: el === 'fire' ? { burn: 1.5 } : el === 'frost' ? { chill: 1 } : null });
    flash(sp.x, sp.y, sp.z, ELEM_COLORS[el]?.[1] || '#c0a0ff', 8, 6, 0.12);
    bus.emit('bolt', { el });
    this.lastCombatT = G.time;
  }

  // -------------------------------------------------------------- dodge
  startDodge(dir) {
    this.blocking = false;
    this.drawing = false;
    this.action = { type: 'dodge', t: 0, dur: 0.46, dir };
    this.st.action = null;
    this.invuln = 0.36;
    this.combo = 0;
    bus.emit('dodge', { player: this });
    burst(this.pos.x, this.pos.y + 0.2, this.pos.z, { count: 8, speed: 3, color: '#c8b090', additive: false, life: 0.5, size: 0.5, gravity: 1 });
  }

  updateAction(dt) {
    const a = this.action;
    a.t += dt;
    this.st.charge = 0;
    let speedMult = 1;
    switch (a.type) {
      case 'attack':
        this.st.actionT = Math.min(1, a.t / a.dur);
        if (a.step > 0 && a.t <= a.strikeAt + 0.03) {
          const s = a.step * Math.min(dt, a.strikeAt + 0.03 - (a.t - dt)) / (a.strikeAt + 0.03);
          if (s > 0) this.move(Math.sin(this.facing) * s, Math.cos(this.facing) * s, dt);
        }
        if (!a.hit && a.t >= a.strikeAt) { a.hit = true; this.strike(a); }
        speedMult = a.t < a.strikeAt + 0.06 ? 0.45 : 0.75;
        if (a.t >= a.dur) { this.action = null; this.st.action = null; }
        break;
      case 'bolt':
        this.st.actionT = Math.min(1, a.t / a.dur);
        if (!a.hit && a.t >= a.strikeAt) { a.hit = true; this.fireBolt(a.el); }
        speedMult = 0.55;
        if (a.t >= a.dur) { this.action = null; this.st.action = null; }
        break;
      case 'shot':
        this.st.actionT = Math.min(1, a.t / a.dur);
        if (a.t >= a.dur) { this.action = null; this.st.action = null; }
        break;
      case 'reload':
        this.st.actionT = Math.min(1, a.t / a.dur);
        speedMult = 0.6;
        if (a.t >= a.dur) { this.action = null; this.st.action = null; this.xbowLoaded = true; }
        break;
      case 'dodge':
        if (a.t >= a.dur) { this.action = null; }
        break;
      case 'cast':
        this.st.actionT = Math.min(1, a.t / a.dur);
        speedMult = a.move ?? 0.3;
        if (!a.fired && a.t >= a.castAt) { a.fired = true; a.onCast && a.onCast(); }
        if (a.t >= a.dur) { this.action = null; this.st.action = null; }
        break;
      case 'channel':
        this.st.action = 'attack'; this.st.kind = 'cast'; this.st.actionT = 0.6;
        speedMult = 0.35;
        a.tick && a.tick(dt);
        if (a.t >= a.dur || a.stop) { this.action = null; this.st.action = null; }
        break;
      case 'custom':
        speedMult = a.move ?? 0;
        a.update && a.update(dt, a);
        if (a.t >= a.dur) { a.end && a.end(); this.action = null; this.st.action = null; this.st.spin = false; }
        break;
      default:
        if (a.t >= (a.dur || 0.3)) this.action = null;
    }
    return speedMult;
  }

  breakStealth(attacked) {
    if (!this.stealthed) return;
    this.stealthed = false;
    delete this.buffs.stealth; delete this.buffTimers.stealth;
    this.model.alpha = 1;
    bus.emit('stealthBroken', { attacked });
  }
  enterStealth(dur) {
    this.stealthed = true;
    this.addBuff('stealth', dur * (this.derived.flags.longStealth ? 1.5 : 1), {});
    for (const e of G.entities) if (e.target === this) e.target = null;
    burst(this.pos.x, this.pos.y + 1, this.pos.z, { count: 30, speed: 4, color: '#6040a0', additive: false, life: 0.8, size: 0.6 });
  }

  // -------------------------------------------------------------- mounts
  toggleMount() {
    const c = this.char;
    if (this.mounted) {
      this.model.setMount(null);
      this.mounted = null;
      burst(this.pos.x, this.pos.y + 1, this.pos.z, { count: 16, speed: 4, color: '#e0d0b0', additive: false, life: 0.6, size: 0.5 });
      return;
    }
    if (G.realm === 'dungeon') { bus.emit('toast', 'You cannot ride in here.'); return; }
    if (!c.activeMount) { bus.emit('toast', c.mounts.length ? 'Choose a mount in your inventory.' : 'You have no mount. Visit a stablemaster.'); return; }
    if (G.time - this.lastCombatT < 3) { bus.emit('toast', 'Cannot summon a mount in combat.'); return; }
    const def = MOUNTS[c.activeMount];
    this.model.setMount(mountSpec(def));
    this.mounted = { def, st: { t: 0, moveSpeed: 0, runSpeed: def.speed * 0.6, seed: 1 } };
    burst(this.pos.x, this.pos.y + 1, this.pos.z, { count: 26, speed: 5, color: def.colors[2] || '#ffe0a0', life: 0.8 });
    bus.emit('mount', def);
  }

  updateMount(dt) {
    const m = this.mounted;
    m.st.t += dt;
    m.st.moveSpeed = this.moveSpeedNow;
    // trample
    if (this.sprinting && this.moveSpeedNow > 10) {
      for (const e of targetsInArc(this, 1.8, 120)) {
        if (e._trampled > G.time) continue;
        e._trampled = G.time + 1;
        dealDamage(this, e, this.derived.weaponDmg * 0.8, { kind: 'melee', knock: 10 });
      }
    }
  }
}

