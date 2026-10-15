// Damage, status effects, projectiles and ground hazards.
import { Vec3 } from '../core/vec3.js';
import { G } from '../game.js';
import { S } from '../data/items.js';
import { ELEMENTS } from '../data/tomes.js';
import { magicOn } from '../render/magic.js';
import { explosionFx, hitFx } from '../render/spellfx.js';
import { burst, floatText, elemBurst, projectileDrawable, removeDrawable, zoneDrawable, removeZone, ring, flash, particle, ELEM_COLORS, lightning, hitSpark } from '../render/vfx.js';
import { addShake } from '../world/cameraRig.js';
import { bus } from '../core/events.js';
import { segmentBlocked } from './collision.js';
import { groundHeight } from '../world/terrain.js';
import { clamp, angleDiff } from '../core/math.js';

// sprite tint modes: 'white' hit flash, 'frozen' ice tint, 'stone' petrify
export function setFlash(ent, on, mode = 'white') {
  if (!ent.model) return;
  if (on) ent.model.flash = mode;
  else ent.model.flash = ent._frozenVis && mode !== 'frozen' ? 'frozen' : null;
}

// ---------------------------------------------------------------------------------
export function hostile(a, b) {
  if (!a || !b || a === b) return false;
  if (a.team === 'neutral' || b.team === 'neutral') return a.team === 'player' && b.provoked || b.team === 'player' && a.provoked;
  return a.team !== b.team;
}

export function entitiesNear(x, z, r, filter) {
  const out = [];
  const all = G.entities;
  for (let i = 0; i < all.length; i++) {
    const e = all[i];
    if (e.dead || e.removed) continue;
    const dx = e.pos.x - x, dz = e.pos.z - z;
    const rr = r + e.radius;
    if (dx * dx + dz * dz <= rr * rr && (!filter || filter(e))) out.push(e);
  }
  if (G.player && !G.player.dead && (!filter || filter(G.player))) {
    const p = G.player, dx = p.pos.x - x, dz = p.pos.z - z, rr = r + p.radius;
    if (dx * dx + dz * dz <= rr * rr) out.push(p);
  }
  return out;
}

export function targetsInArc(src, range, arcDeg, facing = src.facing) {
  const half = (arcDeg * Math.PI) / 360;
  return entitiesNear(src.pos.x, src.pos.z, range, (e) => {
    if (!hostile(src, e)) return false;
    const a = Math.atan2(e.pos.x - src.pos.x, e.pos.z - src.pos.z);
    const d = Math.hypot(e.pos.x - src.pos.x, e.pos.z - src.pos.z);
    return d < e.radius + 0.6 || Math.abs(angleDiff(facing, a)) <= half + Math.atan2(e.radius, Math.max(0.1, d));
  });
}

// ---------------------------------------------------------------------------------
// Core damage resolution
export function dealDamage(src, tgt, amount, o = {}) {
  if (!tgt || tgt.dead || tgt.removed) return 0;
  if (tgt.invuln > 0 || tgt.buffs?.invuln) { if (tgt.isPlayer && o.kind !== 'dot') floatText(tgt.pos.x, tgt.pos.y + 2, tgt.pos.z, 'Immune', { color: '#ffe080' }); return 0; }
  if (src && src.isPlayer && tgt.team === 'neutral' && !tgt.provoked) { tgt.provoked = true; bus.emit('crime', { type: 'assault', target: tgt }); }
  const el = o.element || 'physical';
  let dmg = amount;
  let crit = !!o.crit;
  // Player blocking / parrying
  if (tgt.isPlayer && o.kind !== 'dot' && o.kind !== 'hazard' && src && tgt.blocking) {
    const toSrc = Math.atan2(src.pos.x - tgt.pos.x, src.pos.z - tgt.pos.z);
    const front = Math.abs(angleDiff(tgt.facing, toSrc)) < 1.3;
    if (front) {
      if (tgt.parryT < tgt.derived.parryWindow && o.kind === 'melee') {
        bus.emit('parry', { player: tgt, attacker: src });
        return 0;
      }
      const blk = tgt.derived.hasShield ? tgt.derived.block * (1 + tgt.derived.blockPct / 100) : 0.4;
      const frontBlock = tgt.buffs?.frontBlock || 0;
      const reduce = Math.min(0.95, Math.max(blk, frontBlock));
      dmg *= 1 - reduce;
      tgt.useStamina(Math.min(30, 6 + amount / Math.max(1, tgt.maxHp) * 120) * (tgt.derived.traits.has('unmoving') ? 0.75 : 1), true);
      bus.emit('block', { player: tgt, attacker: src, amount });
      if (tgt.stamina <= 0) { tgt.guardBreak(); }
      burst(tgt.pos.x + Math.sin(tgt.facing) * 0.6, tgt.pos.y + 1.2, tgt.pos.z + Math.cos(tgt.facing) * 0.6, { count: 10, speed: 6, color: '#ffe0a0', life: 0.25, size: 0.2 });
    }
  }
  // Mitigation
  if (el === 'physical') {
    const lvl = src ? src.level : tgt.level;
    let armor = tgt.armor * (tgt.armorMult || 1) * (tgt.status?.armorBreak ? 0.75 : 1);
    dmg *= 1 - armor / (armor + 40 * S(lvl));
  } else {
    const res = tgt.res?.[el] || 0;
    dmg *= 1 - clamp(res, -50, 75) / 100;
  }
  if (tgt.status?.weaken > 0 && !tgt.isPlayer) dmg *= 1.0;
  if (src?.status?.weaken > 0) dmg *= 0.75;
  if (tgt.status?.brand > 0) dmg *= 1.15;
  if (tgt.status?.shock > 0 && el !== 'lightning') dmg *= 1.1;
  if (tgt.status?.soak > 0 && el === 'lightning') dmg *= 1.4;
  if (tgt.frozen > 0 && src?.isPlayer && src.derived.flags.frozenVuln) dmg *= 1.4;
  if (tgt.dmgTakenMult) dmg *= tgt.dmgTakenMult;
  if (tgt.undead && el === 'holy') dmg *= 1.5;
  if (tgt.isPlayer && tgt.buffs?.shield > 0) {
    const absorbed = Math.min(tgt.buffs.shield, dmg);
    tgt.buffs.shield -= absorbed; dmg -= absorbed;
    if (absorbed > 0) floatText(tgt.pos.x, tgt.pos.y + 2.2, tgt.pos.z, `(${Math.round(absorbed)})`, { color: '#c0e0ff' });
  }
  dmg = Math.max(o.kind === 'dot' ? 0.5 : 1, dmg);
  // Apply
  tgt.hp -= dmg;
  tgt.lastHitBy = src;
  tgt.lastHitT = G.time;
  if (tgt.sleep > 0) tgt.sleep = 0;
  if (src && !tgt.isPlayer && tgt.onAggro) tgt.onAggro(src);
  // feedback
  const hx = tgt.pos.x, hy = tgt.pos.y + (tgt.height || 1.8) * 0.65, hz = tgt.pos.z;
  if (o.kind !== 'dot') {
    tgt.hitFlash = 0.1;
    tgt.hitT = 1;
    const cols = ELEM_COLORS[el] || ELEM_COLORS.physical;
    if (o.kind === 'melee' || o.kind === 'ranged' || crit) hitSpark(hx, hy, hz, { color: el === 'physical' ? (crit ? '#ffd040' : '#fff4d0') : cols[1], size: crit || o.heavy ? 1.6 : 1, rays: crit ? 8 : 6 });
    if (el === 'physical') burst(hx, hy, hz, { count: crit ? 14 : 8, speed: crit ? 9 : 6, color: tgt.bloodColor || '#ffe0c0', color2: cols[1], life: 0.35, size: 0.22, gravity: -14, additive: false });
    else elemBurst(el, hx, hy, hz, crit ? 0.8 : 0.45);
    if (src?.isPlayer) {
      // short hitstop on ordinary hits so hold-to-attack spam stays fluid; crits and heavies still bite
      G.hitstop = Math.max(G.hitstop, crit || o.heavy ? 0.075 : 0.028);
      addShake((crit || o.heavy ? 0.24 : 0.07) * G.settings.screenShake);
      if (magicOn() && (o.kind === 'melee' || o.kind === 'ranged')) hitFx(hx, hy, hz, hx - src.pos.x, hz - src.pos.z, el === 'physical' ? (crit ? '#ffd040' : '#ffe0a0') : cols[1], crit);
    }
    if (tgt.isPlayer) { addShake(0.28 * G.settings.screenShake); bus.emit('playerHit', { amount: dmg, src }); }
    bus.emit('hit', { src, tgt, dmg, crit, element: el, kind: o.kind, heavy: !!o.heavy });
  }
  if (!o.silent && (o.kind !== 'dot' || dmg >= 1)) {
    const col = tgt.isPlayer ? '#ff5a4a' : crit ? '#ffd040' : o.kind === 'dot' ? (ELEM_COLORS[el] || ELEM_COLORS.physical)[1] : el !== 'physical' ? (ELEM_COLORS[el] || ['#fff'])[0] : '#ffffff';
    floatText(hx, hy + 0.4, hz, Math.round(dmg) + (crit ? '!' : ''), { crit, color: col, cls: o.kind === 'dot' ? 'dot' : '' });
  }
  // knockback / stagger
  if (o.knock && !tgt.boss && !(tgt.isPlayer && tgt.derived.traits.has('unmoving'))) {
    const ang = src ? Math.atan2(tgt.pos.x - (o.fromX ?? src.pos.x), tgt.pos.z - (o.fromZ ?? src.pos.z)) : 0;
    tgt.knock.set(Math.sin(ang) * o.knock, 0, Math.cos(ang) * o.knock);
  }
  if (o.stagger && tgt.applyStagger) tgt.applyStagger(o.stagger);
  // status
  if (o.status) for (const [k, v] of Object.entries(o.status)) applyStatus(tgt, k, v, src, amount);
  // lifesteal / life on hit
  if (src?.isPlayer && o.kind !== 'dot') {
    let heal = 0;
    if (o.lifesteal) heal += dmg * o.lifesteal;
    if (src.derived.lifeOnHit && (o.kind === 'melee' || o.kind === 'ranged')) heal += src.derived.lifeOnHit * S(src.level) * 0.5;
    if (src.buffs?.lifesteal) heal += dmg * src.buffs.lifesteal;
    if (heal > 0) src.heal(heal, true);
  }
  if (tgt.hp <= 0) {
    if (tgt.isPlayer && tgt.tryCheatDeath && tgt.tryCheatDeath()) { tgt.hp = 1; }
    else killEntity(tgt, src, o);
  }
  return dmg;
}

export function killEntity(tgt, src, o = {}) {
  if (tgt.dead) return;
  tgt.hp = 0;
  tgt.dead = true;
  tgt.deathT = 0;
  if (tgt.onDeath) tgt.onDeath(src);
  bus.emit('kill', { victim: tgt, killer: src, element: o.element });
}

// ---------------------------------------------------------------------------------
// Status effects
export function applyStatus(t, k, v, src, baseDmg = 10) {
  if (!t.status) t.status = {};
  const S_ = t.status;
  const resist = t.boss ? 0.5 : 1;
  switch (k) {
    case 'burn': S_.burn = Math.max(S_.burn || 0, v); S_.burnDps = Math.max(S_.burnDps || 0, baseDmg * 0.22); S_.burnSrc = src; break;
    case 'poison': S_.poison = Math.max(S_.poison || 0, v + 1); S_.poisonDps = Math.max(S_.poisonDps || 0, baseDmg * 0.16); S_.poisonSrc = src; break;
    case 'bleed': if (t.isPlayer && t.derived.traits.has('marble_skin')) break; S_.bleed = Math.max(S_.bleed || 0, v + 1); S_.bleedDps = Math.max(S_.bleedDps || 0, baseDmg * 0.18); S_.bleedSrc = src; break;
    case 'chill': {
      S_.chill = 4; S_.chillStacks = (S_.chillStacks || 0) + v;
      if (S_.chillStacks >= 3) { S_.chillStacks = 0; applyStatus(t, 'freeze', 1.6, src); }
      break;
    }
    case 'freeze': {
      const dur = v * resist * (src?.derived?.powers?.freezeLonger || 1);
      if (t.isPlayer) { t.frozen = Math.max(t.frozen || 0, dur * 0.4); }
      else { t.frozen = Math.max(t.frozen || 0, dur); bus.emit('frozen', { target: t, src }); }
      break;
    }
    case 'shock': S_.shock = Math.max(S_.shock || 0, 3 + v); break;
    case 'stun': t.stun = Math.max(t.stun || 0, v * resist * (t.isPlayer ? 0.5 : 1)); break;
    case 'root': t.root = Math.max(t.root || 0, v * resist * (src?.derived?.flags?.longRoots ? 2 : 1)); break;
    case 'weaken': S_.weaken = Math.max(S_.weaken || 0, 3 + v); break;
    case 'brand': S_.brand = Math.max(S_.brand || 0, 4 + v); break;
    case 'blind': S_.blind = Math.max(S_.blind || 0, 2 + v); break;
    case 'soak': S_.soak = Math.max(S_.soak || 0, 4 + v); break;
    case 'slow': S_.slow = Math.max(S_.slow || 0, 2 + v); break;
    case 'sleep': if (!t.boss) t.sleep = Math.max(t.sleep || 0, v * 2); break;
    case 'stagger': if (t.applyStagger) t.applyStagger(0.4 * v); break;
    case 'fear': if (!t.boss) t.fear = Math.max(t.fear || 0, v); break;
    case 'armorBreak': S_.armorBreak = Math.max(S_.armorBreak || 0, v); break;
  }
}

export function updateStatus(t, dt) {
  const S_ = t.status;
  if (!S_) return;
  t._dotT = (t._dotT || 0) - dt;
  const tick = t._dotT <= 0;
  if (tick) t._dotT = 0.5;
  if (S_.burn > 0) {
    S_.burn -= dt;
    if (tick) dealDamage(S_.burnSrc, t, S_.burnDps * 0.5, { element: 'fire', kind: 'dot' });
    if (Math.random() < dt * 14) particle({ x: t.pos.x + (Math.random() - 0.5) * 0.6, y: t.pos.y + Math.random() * (t.height || 1.8), z: t.pos.z + (Math.random() - 0.5) * 0.6, vy: 2.5, life: 0.5, size: 0.35, color: '#ffb040', color2: '#ff3010', gravity: 2 });
    if (S_.burn <= 0) S_.burnDps = 0;
  }
  if (S_.poison > 0) {
    S_.poison -= dt;
    if (tick) dealDamage(S_.poisonSrc, t, S_.poisonDps * 0.5, { element: 'rot', kind: 'dot' });
    if (Math.random() < dt * 6) particle({ x: t.pos.x, y: t.pos.y + 1.4, z: t.pos.z, vx: (Math.random() - 0.5), vy: 1, vz: (Math.random() - 0.5), life: 0.7, size: 0.3, color: '#80e040', additive: true });
    if (S_.poison <= 0) S_.poisonDps = 0;
  }
  if (S_.bleed > 0) {
    S_.bleed -= dt;
    if (tick) dealDamage(S_.bleedSrc, t, S_.bleedDps * 0.5 * (t.moveSpeedNow > 0.5 ? 1.5 : 1), { element: 'physical', kind: 'dot' });
    if (Math.random() < dt * 8) particle({ x: t.pos.x, y: t.pos.y + 1, z: t.pos.z, vx: (Math.random() - 0.5) * 2, vy: 0.5, vz: (Math.random() - 0.5) * 2, life: 0.4, size: 0.18, color: '#c01010', additive: false, gravity: -10 });
    if (S_.bleed <= 0) S_.bleedDps = 0;
  }
  for (const k of ['chill', 'shock', 'weaken', 'brand', 'blind', 'soak', 'slow', 'armorBreak']) if (S_[k] > 0) S_[k] -= dt;
  if (S_.chill <= 0) S_.chillStacks = 0;
  if (t.frozen > 0) {
    t.frozen -= dt;
    if (!t._frozenVis && !t.isPlayer) { setFlash(t, true, 'frozen'); t._frozenVis = true; }
    if (t.frozen <= 0 && t._frozenVis) { t._frozenVis = false; setFlash(t, false, 'frozen'); burst(t.pos.x, t.pos.y + 1, t.pos.z, { count: 14, speed: 5, color: '#c0f0ff', life: 0.5 }); }
  }
  if (t.stun > 0) { t.stun -= dt; if (Math.random() < dt * 5) particle({ x: t.pos.x + Math.cos(G.time * 6) * 0.4, y: t.pos.y + (t.height || 1.8) + 0.2, z: t.pos.z + Math.sin(G.time * 6) * 0.4, life: 0.3, size: 0.2, color: '#ffe060' }); }
  if (t.root > 0) t.root -= dt;
  if (t.sleep > 0) { t.sleep -= dt; if (Math.random() < dt * 1.5) floatText(t.pos.x, t.pos.y + 2.2, t.pos.z, 'z', { color: '#c0c0ff', force: true, life: 1.2, vy: 1 }); }
  if (t.fear > 0) t.fear -= dt;
}

export function movementMult(t) {
  let m = 1;
  if (t.status?.chill > 0) m *= 0.65;
  if (t.status?.slow > 0) m *= 0.5;
  if (t.frozen > 0 || t.stun > 0 || t.sleep > 0) m = 0;
  if (t.root > 0) m = 0;
  return m;
}
export function canAct(t) { return !(t.frozen > 0 || t.stun > 0 || t.sleep > 0); }

// ---------------------------------------------------------------------------------
// Projectiles

export function spawnProjectile(o) {
  const p = {
    pos: new Vec3(o.x, o.y, o.z), vel: new Vec3(o.vx, o.vy || 0, o.vz),
    owner: o.owner, team: o.owner?.team || o.team, dmg: o.dmg, element: o.element || 'physical', radius: o.radius || 0.45,
    pierce: o.pierce || 0, hits: new Set(), life: o.life || 2.5, homing: o.homing || 0, explode: o.explode || 0,
    status: o.status, kind: o.kind || 'orb', gravity: o.gravity || 0, knock: o.knock || 0, crit: o.crit, lifesteal: o.lifesteal,
    chain: o.chain || 0, pull: o.pull || 0, onHit: o.onHit, tick: o.tick || 0, tickT: 0, aoe: o.aoe || 0, heavy: o.heavy, dmgKind: o.dmgKind || (o.kind === 'arrow' || o.kind === 'bolt' ? 'ranged' : 'spell'),
    color: o.color || (ELEM_COLORS[o.element || 'physical'] || ELEM_COLORS.physical)[1], target: o.target, reflectable: o.reflectable !== false,
  };
  p.mesh = projectileDrawable(p, o.size || (p.kind === 'fireball' ? 0.55 : 0.32));
  G.projectiles.push(p);
  return p;
}

const _tmp = new Vec3();
export function updateProjectiles(dt) {
  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    const p = G.projectiles[i];
    p.life -= dt;
    // homing
    if (p.homing > 0) {
      let tgt = p.target && !p.target.dead ? p.target : null;
      if (!tgt) {
        let best = 18 * 18;
        for (const e of [...G.entities, G.player]) {
          if (!e || e.dead || !hostile(p.owner || { team: p.team }, e)) continue;
          const d = (e.pos.x - p.pos.x) ** 2 + (e.pos.z - p.pos.z) ** 2;
          if (d < best) { best = d; tgt = e; }
        }
        p.target = tgt;
      }
      if (tgt) {
        _tmp.set(tgt.pos.x - p.pos.x, tgt.pos.y + 1 - p.pos.y, tgt.pos.z - p.pos.z).normalize().multiplyScalar(p.vel.length());
        p.vel.lerp(_tmp, Math.min(1, p.homing * dt));
      }
    }
    p.vel.y += p.gravity * dt;
    const ox = p.pos.x, oz = p.pos.z;
    p.pos.addScaledVector(p.vel, dt);
    // trail
    if (p.kind !== 'arrow' && p.kind !== 'bolt' && !magicOn() && Math.random() < dt * 24) particle({ x: p.pos.x, y: p.pos.y, z: p.pos.z, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.2) * 2, vz: (Math.random() - 0.5) * 2, life: 0.35, size: p.kind === 'fireball' ? 0.45 : 0.25, color: p.color, gravity: p.element === 'fire' ? 3 : 0 });
    let dead = p.life <= 0;
    // ground / walls
    const gh = groundHeight(p.pos.x, p.pos.z);
    if (p.pos.y < gh + 0.1) dead = true;
    if (!dead && segmentBlocked(ox, oz, p.pos.x, p.pos.z, 0)) dead = true;
    // ticking aoe projectiles (ball lightning)
    if (p.tick) {
      p.tickT -= dt;
      if (p.tickT <= 0) {
        p.tickT = p.tick;
        for (const e of entitiesNear(p.pos.x, p.pos.z, p.aoe || 4, (e) => hostile(p.owner, e))) {
          dealDamage(p.owner, e, p.dmg, { element: p.element, kind: 'spell', status: p.status });
          lightning(p.pos.x, p.pos.y, p.pos.z, e.pos.x, e.pos.y + 1, e.pos.z, { color: p.color });
        }
      }
    }
    // entity hits
    if (!dead) {
      const hits = entitiesNear(p.pos.x, p.pos.z, p.radius, (e) => hostile(p.owner || { team: p.team }, e) && !p.hits.has(e) && Math.abs(e.pos.y + (e.height || 1.8) * 0.5 - p.pos.y) < (e.height || 1.8) * 0.8 + 0.6);
      for (const e of hits) {
        // reflect off a Kharak's Oath block
        if (e.isPlayer && e.blocking && e.derived.powers.reflect && p.reflectable) {
          p.vel.multiplyScalar(-1); p.owner = e; p.team = 'player'; p.hits.clear(); p.hits.add(e);
          floatText(e.pos.x, e.pos.y + 2, e.pos.z, 'Reflected!', { color: '#ffe080' });
          break;
        }
        p.hits.add(e);
        if (!p.explode) {
          dealDamage(p.owner, e, p.dmg, { element: p.element, kind: p.dmgKind, status: p.status, knock: p.knock, crit: p.crit, lifesteal: p.lifesteal, fromX: p.pos.x - p.vel.x, fromZ: p.pos.z - p.vel.z, heavy: p.heavy });
          if (p.onHit) p.onHit(e, p);
          if (p.chain > 0) chainLightning(p.owner, e, p.dmg * 0.6, p.chain, p.element === 'physical' ? 'lightning' : p.element, p.hits);
          if (p.pull) { const a = Math.atan2(p.pos.x - e.pos.x, p.pos.z - e.pos.z); if (!e.boss) e.knock.set(Math.sin(a) * p.pull, 0, Math.cos(a) * p.pull); }
        }
        if (p.pierce-- <= 0 || p.explode) { dead = true; break; }
      }
    }
    if (dead) {
      if (p.explode) explodeAt(p.owner, p.pos.x, p.pos.y, p.pos.z, p.explode, p.dmg, p.element, p.status, p.crit);
      else elemBurst(p.element, p.pos.x, p.pos.y, p.pos.z, 0.35);
      removeDrawable(p.mesh);
      G.projectiles.splice(i, 1);
    }
  }
}

export function explodeAt(owner, x, y, z, radius, dmg, element, status, crit) {
  if (magicOn()) explosionFx(element, x, y, z, radius);
  else {
    ring(x, y, z, { radius: radius * 1.1, color: (ELEM_COLORS[element] || ELEM_COLORS.physical)[1], dur: 0.4 });
    elemBurst(element, x, y, z, 1.2);
  }
  flash(x, y + 1, z, (ELEM_COLORS[element] || ELEM_COLORS.physical)[1], 30, radius * 3, 0.35);
  if (owner?.isPlayer) addShake(0.25 * G.settings.screenShake);
  bus.emit('explosion', { owner, radius, x, z });
  for (const e of entitiesNear(x, z, radius, (e) => hostile(owner || { team: 'enemy' }, e))) {
    dealDamage(owner, e, dmg, { element, kind: 'spell', status, crit, fromX: x, fromZ: z, knock: 4 });
  }
}

export function chainLightning(src, from, dmg, n, element = 'lightning', exclude = new Set()) {
  let cur = from;
  const hit = new Set(exclude);
  hit.add(from);
  for (let k = 0; k < n; k++) {
    let best = null, bd = 10 * 10;
    for (const e of G.entities) {
      if (e.dead || hit.has(e) || !hostile(src, e)) continue;
      const d = (e.pos.x - cur.pos.x) ** 2 + (e.pos.z - cur.pos.z) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) break;
    lightning(cur.pos.x, cur.pos.y + 1.2, cur.pos.z, best.pos.x, best.pos.y + 1.2, best.pos.z, { color: (ELEM_COLORS[element] || ELEM_COLORS.lightning)[1] });
    dealDamage(src, best, dmg, { element, kind: 'spell', status: { shock: 1 } });
    hit.add(best);
    cur = best;
  }
}

// ---------------------------------------------------------------------------------
// Hazards: persistent zones (player spells or enemy ground effects)
export function spawnHazard(o) {
  const h = {
    x: o.x, z: o.z, y: o.y ?? groundHeight(o.x, o.z), radius: o.radius, owner: o.owner, team: o.owner?.team || o.team,
    dmg: o.dmg || 0, tick: o.tick || 0.5, tickT: o.delay ?? 0, life: o.life || 3, element: o.element || 'physical', status: o.status,
    pull: o.pull || 0, follow: o.follow || null, healTick: o.healTick || 0, kind: o.kind || 'zone', color: o.color || (ELEM_COLORS[o.element || 'physical'] || ELEM_COLORS.physical)[1],
    particles: o.particles ?? true, onTick: o.onTick, slowZone: o.slowZone, age: 0,
  };
  h.mesh = zoneDrawable(h, o.opacity ?? 0.4);
  G.hazards.push(h);
  return h;
}

export function updateHazards(dt) {
  for (let i = G.hazards.length - 1; i >= 0; i--) {
    const h = G.hazards[i];
    h.life -= dt; h.age += dt;
    if (h.follow) { h.x = h.follow.pos.x; h.z = h.follow.pos.z; h.y = h.follow.pos.y; }
    if (h.particles && !(h.mesh?.gl) && Math.random() < dt * (8 + h.radius * 3)) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * h.radius;
      particle({ x: h.x + Math.cos(a) * r, y: h.y + 0.2, z: h.z + Math.sin(a) * r, vy: 1.5 + Math.random() * 2, life: 0.8, size: 0.4, color: h.color, gravity: 1 });
    }
    h.tickT -= dt;
    if (h.tickT <= 0) {
      h.tickT = h.tick;
      const owner = h.owner || { team: h.team, isPlayer: false, level: G.player?.level || 1 };
      for (const e of entitiesNear(h.x, h.z, h.radius, (e) => hostile(owner, e))) {
        if (h.dmg) dealDamage(h.owner, e, h.dmg, { element: h.element, kind: h.owner?.isPlayer ? 'spell' : 'hazard', status: h.status, silent: false });
        if (h.pull && !e.boss) { const a = Math.atan2(h.x - e.pos.x, h.z - e.pos.z); e.knock.set(Math.sin(a) * h.pull * 0.5, 0, Math.cos(a) * h.pull * 0.5); }
      }
      if (h.healTick && G.player && !G.player.dead) {
        const p = G.player;
        if ((p.pos.x - h.x) ** 2 + (p.pos.z - h.z) ** 2 < h.radius * h.radius) p.heal(p.maxHp * h.healTick, false);
      }
      if (h.onTick) h.onTick(h);
    }
    if (h.life <= 0) { h.gone = true; removeZone(h.mesh); G.hazards.splice(i, 1); }
  }
}

export function clearCombat() {
  for (const p of G.projectiles) removeDrawable(p.mesh);
  G.projectiles.length = 0;
  for (const h of G.hazards) { h.gone = true; removeZone(h.mesh); }
  G.hazards.length = 0;
}

export function elementName(el) { return ELEMENTS[el]?.name || 'Physical'; }
