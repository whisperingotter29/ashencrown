// Executes spells (from equipped tome), martial skills and combo skills for the player.
import { Vec3 } from '../core/vec3.js';
import { spikeSprite, totemSprite, iceSprite } from '../px/sprites/fx.js';
import { G } from '../game.js';
import { SPELLS, TOMES, spellsForTome } from '../data/tomes.js';
import { SKILLS, COMBOS, combosAvailable } from '../data/skills.js';
import { spellDamage } from './stats.js';
import { S } from '../data/items.js';
import { dealDamage, spawnProjectile, spawnHazard, entitiesNear, hostile, targetsInArc, explodeAt, chainLightning, applyStatus } from './combat.js';
import { worldSprite, burst, ring, slash, beam, pillar, lightning, flash, particle, telegraph, floatText, ELEM_COLORS, elemBurst, shockwave } from '../render/vfx.js';
import { addShake } from '../world/cameraRig.js';
import { bus } from '../core/events.js';
import { setTimeoutGame } from '../entities/enemy.js';
import { groundHeight } from '../world/terrain.js';
import { dungeonLOS, dungeonWallAt } from '../world/dungeonQuery.js';
import { addCollider, removeOwner } from './collision.js';
import { angleDiff } from '../core/math.js';

export function abilityDef(id) {
  return SPELLS[id] ? { kind: 'spell', def: SPELLS[id] } : SKILLS[id] ? { kind: 'skill', def: SKILLS[id] } : COMBOS.find((c) => c.id === id) ? { kind: 'combo', def: COMBOS.find((c) => c.id === id) } : null;
}

// Everything the player could put on the bar right now
export function availableAbilities(char, derived) {
  const out = [];
  if (derived.tome) for (const s of spellsForTome(derived.tome.id, derived.tome.tier)) out.push({ id: s.id, kind: 'spell', def: s });
  for (const sid of char.skills) { const sk = SKILLS[sid]; if (sk && sk.type !== 'passive') out.push({ id: sid, kind: 'skill', def: sk }); }
  for (const c of combosAvailable(char.skills, derived.tome?.id)) if (c.type !== 'passive') out.push({ id: c.id, kind: 'combo', def: c });
  return out;
}

export function abilityUsable(player, id) {
  const a = abilityDef(id);
  if (!a) return { ok: false, why: 'Unknown' };
  const d = player.derived;
  if (a.kind === 'spell') {
    if (!d.tome) return { ok: false, why: 'You need a spellbook equipped to cast.' };
    if (d.tome.id !== a.def.tome) return { ok: false, why: `Requires the ${TOMES[a.def.tome].name}.` };
    if (a.def.tier > d.tome.tier) return { ok: false, why: `Requires a tier ${a.def.tier} tome.` };
    const slotIdx = player.char.skillBar.filter((x) => x && SPELLS[x]).indexOf(id);
    if (slotIdx >= d.spellSlots) return { ok: false, why: 'Not enough spell slots in this tome.' };
  } else if (a.kind === 'combo') {
    if (!d.tome || d.tome.id !== a.def.tome) return { ok: false, why: `Requires the ${TOMES[a.def.tome].name} equipped.` };
  }
  const need = a.def.needs;
  if (need === 'shield' && !d.hasShield) return { ok: false, why: 'Requires a shield.' };
  if (need === 'ranged' && !d.weapon.ranged) return { ok: false, why: 'Requires a bow or crossbow.' };
  if ((player.cooldowns[id] || 0) > 0) return { ok: false, why: 'Not ready.', cd: true };
  return { ok: true, a };
}

export function useAbility(player, id) {
  if (player.mounted) player.toggleMount();
  const chk = abilityUsable(player, id);
  if (!chk.ok) { if (!chk.cd) bus.emit('toast', chk.why); return false; }
  const { kind, def } = chk.a;
  if (player.action && player.action.type !== 'attack' && player.action.type !== 'shot') return false;
  if (player.action?.type === 'attack' && player.action.t < player.action.strikeAt) return false;
  if (kind === 'spell') {
    const hpCost = def.hpCost ? player.maxHp * def.hpCost : 0;
    if (hpCost && player.hp <= hpCost + 1) { bus.emit('toast', 'Not enough blood.'); return false; }
    let cost = def.cost;
    if (def.element === 'fire' && player.derived.traits.has('ember_blood')) cost *= 0.9;
    if (cost && !def.channel && !player.useMana(cost)) return false;
    if (hpCost) { player.hp -= hpCost; floatText(player.pos.x, player.pos.y + 2, player.pos.z, '-' + Math.round(hpCost), { color: '#c01020' }); }
    castSpell(player, def);
  } else {
    if (!player.useStamina(def.stamina || 10)) return false;
    useSkill(player, def, kind === 'combo');
  }
  player.cooldowns[id] = def.cd || 0.5;
  player.lastCombatT = G.time;
  bus.emit('abilityUsed', { id, kind, def });
  return true;
}

function aimAngle(p) { return Math.atan2(p.aim.x - p.pos.x, p.aim.z - p.pos.z); }
function aimPoint(p, maxR) {
  let dx = p.aim.x - p.pos.x, dz = p.aim.z - p.pos.z;
  const L = Math.hypot(dx, dz);
  if (L > maxR) { dx *= maxR / L; dz *= maxR / L; }
  return { x: p.pos.x + dx, z: p.pos.z + dz };
}
function gY(x, z) { return G.realm === 'dungeon' ? (G.dungeon?.floorY ?? 0) : groundHeight(x, z); }

function spellHooks(p, dmg, el) {
  const h = { dmg, crit: Math.random() * 100 < p.derived.critChance + p.derived.spellCrit, element: el, kind: 'spell' };
  bus.emit('preSpell', h);
  let d = h.dmg;
  if (p.buffAgg?.dmgPct) d *= 1 + p.buffAgg.dmgPct / 100;
  if (el === 'fire' && p.derived.fireDmgPct) d *= 1 + p.derived.fireDmgPct / 100;
  if (el === 'void' && p.derived.voidDmgPct) d *= 1 + p.derived.voidDmgPct / 100;
  if (h.crit) d *= 1 + p.derived.critDmg / 100;
  return { dmg: d, crit: h.crit };
}

// ------------------------------------------------------------------------------- spells
export function castSpell(p, s) {
  const el = s.element;
  const [c1, c2] = ELEM_COLORS[el] || ELEM_COLORS.physical;
  const base = spellDamage(p.char, p.derived, s);
  const anim = ['ground', 'rain', 'summon', 'buff', 'heal'].includes(s.type) ? 'castup' : s.type === 'nova' || s.type === 'aura' ? 'nova' : 'cast';
  const castT = Math.max(0.08, s.cast || 0.2);
  const doIt = () => runSpell(p, s, base, el, c1, c2);
  if (s.channel) { startChannel(p, s, base, el, c2); return; }
  p.action = { type: 'cast', t: 0, dur: castT + 0.25, castAt: castT, faceAim: true, onCast: doIt, move: s.type === 'blink' ? 1 : 0.35 };
  p.st.action = 'attack'; p.st.kind = anim; p.st.actionT = 0; p.st.strikeU = castT / (castT + 0.25);
  // casting glow
  const hand = p.model.handPos(new Vec3());
  burst(hand.x, hand.y, hand.z, { count: 10, speed: 2, color: c1, color2: c2, life: castT + 0.2, gravity: 2, size: 0.3 });
  flash(hand.x, hand.y, hand.z, c2, 10, 7, castT + 0.2);
  bus.emit('castStart', { spell: s });
}

function runSpell(p, s, base, el, c1, c2) {
  const ang = aimAngle(p);
  p.facing = ang;
  const sx = p.pos.x + Math.sin(ang) * 0.8, sz = p.pos.z + Math.cos(ang) * 0.8, sy = p.pos.y + 1.35;
  const pow = p.derived.powers;
  bus.emit('spellCast', { spell: s, element: el });
  switch (s.type) {
    case 'projectile': {
      const n = (s.count || 1) + (el === 'frost' && pow.extraProjectile ? pow.extraProjectile : 0);
      const spread = (s.spread || 10) * Math.PI / 180;
      for (let i = 0; i < n; i++) {
        const a = n === 1 ? ang : ang + (i / (n - 1) - 0.5) * spread;
        const { dmg, crit } = spellHooks(p, base, el);
        spawnProjectile({
          x: sx, y: sy, z: sz, vx: Math.sin(a) * s.speed, vz: Math.cos(a) * s.speed, owner: p, dmg, crit, element: el,
          kind: s.id === 'bonespear' || s.id === 'iceshard' || s.id === 'glacialspike' || s.id === 'sunlance' ? 'shard' : s.explode ? 'fireball' : 'orb',
          explode: s.explode || 0, pierce: s.pierce || 0, homing: s.homing || 0, status: s.status, knock: s.knock || 0, lifesteal: s.lifesteal,
          tick: s.tick || 0, aoe: s.radius || 0, life: s.duration || 1.6, size: s.explode ? 0.55 : s.id === 'balllightning' ? 0.6 : 0.32, dmgKind: 'spell',
        });
      }
      break;
    }
    case 'cone': {
      const { dmg, crit } = spellHooks(p, base, el);
      const R = s.range, A = s.angle;
      for (let i = 0; i < 40; i++) {
        const a = ang + (Math.random() - 0.5) * A * Math.PI / 180;
        const sp = R * (1.6 + Math.random());
        particle({ x: p.pos.x, y: sy - 0.2, z: p.pos.z, vx: Math.sin(a) * sp, vy: Math.random() * 1.5, vz: Math.cos(a) * sp, life: 0.45, size: 0.6, size1: 1.2, color: c1, color2: c2, drag: 2 });
      }
      slash(p.pos.x, p.pos.y, p.pos.z, ang, { radius: R, arc: A, color: c2, dur: 0.3 });
      for (const e of targetsInArc(p, R, A, ang)) dealDamage(p, e, dmg, { kind: 'spell', element: el, crit, status: s.status, knock: s.knock || 0, lifesteal: s.lifesteal, fromX: p.pos.x, fromZ: p.pos.z });
      break;
    }
    case 'nova': {
      const { dmg, crit } = spellHooks(p, base, el);
      ring(p.pos.x, p.pos.y, p.pos.z, { radius: s.radius, color: c2, dur: 0.5 });
      ring(p.pos.x, p.pos.y + 0.5, p.pos.z, { radius: s.radius * 0.7, color: c1, dur: 0.35 });
      burst(p.pos.x, p.pos.y + 0.6, p.pos.z, { count: 50, speed: s.radius * 2.2, color: c1, color2: c2, life: 0.5, up: 0.1, spread: 0.4, gravity: 0 });
      addShake(0.2);
      for (const e of entitiesNear(p.pos.x, p.pos.z, s.radius, (e) => hostile(p, e))) dealDamage(p, e, dmg, { kind: 'spell', element: el, crit, status: s.status, lifesteal: s.lifesteal, knock: 3, fromX: p.pos.x, fromZ: p.pos.z });
      break;
    }
    case 'ground': {
      const pt = aimPoint(p, 18);
      const y = gY(pt.x, pt.z);
      const delay = s.delay || 0.3;
      const tl = telegraph({ shape: 'circle', x: pt.x, y, z: pt.z, radius: s.radius, dur: delay, color: c2 });
      if (s.id === 'meteor' || s.id === 'leviathan') {
        const m = spawnProjectile({ x: pt.x - 6, y: y + 26, z: pt.z - 4, vx: 6 / delay, vy: -26 / delay, vz: 4 / delay, owner: p, dmg: 0, element: el, kind: 'fireball', size: 1.2, life: delay + 0.2, team: 'player' });
        m.hits = new Set(G.entities);
      }
      setTimeoutGame(delay, () => {
        const { dmg, crit } = spellHooks(p, base, el);
        if (el === 'lightning') lightning(pt.x, y + 40, pt.z, pt.x, y, pt.z, { color: c2, segs: 14, jag: 2.5, dur: 0.25 });
        pillar(pt.x, y, pt.z, { radius: s.radius * 0.5, height: 16, color: c2, dur: 0.45 });
        ring(pt.x, y, pt.z, { radius: s.radius * 1.2, color: c2, dur: 0.5 });
        elemBurst(el, pt.x, y + 0.5, pt.z, 1.6);
        flash(pt.x, y + 2, pt.z, c2, 40, s.radius * 4, 0.4);
        addShake(0.3);
        for (const e of entitiesNear(pt.x, pt.z, s.radius, (e) => hostile(p, e))) {
          dealDamage(p, e, dmg, { kind: 'spell', element: el, crit, status: s.status, knock: s.knock || 2, fromX: pt.x, fromZ: pt.z });
          if (s.pull) { const a = Math.atan2(pt.x - e.pos.x, pt.z - e.pos.z); if (!e.boss) e.knock.set(Math.sin(a) * s.pull, 0, Math.cos(a) * s.pull); }
        }
        if (s.id === 'meteor') spawnHazard({ x: pt.x, z: pt.z, radius: s.radius * 0.7, owner: p, dmg: dmg * 0.1, life: 3, element: 'fire', status: { burn: 1 } });
      });
      break;
    }
    case 'rain': {
      const pt = aimPoint(p, 16);
      const n = s.count || 8;
      for (let i = 0; i < n; i++) {
        setTimeoutGame((i / n) * (s.duration || 2), () => {
          const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * s.radius;
          const x = pt.x + Math.cos(a) * r, z = pt.z + Math.sin(a) * r, y = gY(x, z);
          const { dmg, crit } = spellHooks(p, base, el);
          if (el === 'lightning') lightning(x, y + 40, z, x, y, z, { color: c2, segs: 12, jag: 2, dur: 0.2 });
          else pillar(x, y, z, { radius: 1.1, height: 14, color: c2, dur: 0.35 });
          elemBurst(el, x, y + 0.3, z, 0.7);
          for (const e of entitiesNear(x, z, 2.6, (e) => hostile(p, e))) dealDamage(p, e, dmg, { kind: 'spell', element: el, crit, status: s.status });
        });
      }
      break;
    }
    case 'zone': {
      const pt = s.selfZone ? { x: p.pos.x, z: p.pos.z } : aimPoint(p, 16);
      const { dmg } = spellHooks(p, base, el);
      spawnHazard({ x: pt.x, z: pt.z, radius: s.radius, owner: p, dmg, tick: s.tick || 0.5, life: s.duration || 4, element: el, status: s.status, pull: s.pull, healTick: s.healTick, follow: s.selfZone ? p : null });
      ring(pt.x, gY(pt.x, pt.z), pt.z, { radius: s.radius, color: c2, dur: 0.5 });
      break;
    }
    case 'aura': {
      const { dmg } = spellHooks(p, base, el);
      spawnHazard({ x: p.pos.x, z: p.pos.z, radius: s.radius, owner: p, dmg, tick: s.tick || 0.5, life: s.duration, element: el, status: s.status, follow: p, onTick: el === 'lightning' ? (h) => {
        const tg = entitiesNear(h.x, h.z, h.radius, (e) => hostile(p, e))[0];
        if (tg) lightning(p.pos.x, p.pos.y + 1.4, p.pos.z, tg.pos.x, tg.pos.y + 1, tg.pos.z, { color: c2 });
      } : null });
      break;
    }
    case 'chain': {
      const { dmg, crit } = spellHooks(p, base, el);
      let best = null, bd = s.range * s.range;
      for (const e of G.entities) {
        if (e.dead || !hostile(p, e)) continue;
        const d2 = (e.pos.x - p.aim.x) ** 2 + (e.pos.z - p.aim.z) ** 2;
        const dp = (e.pos.x - p.pos.x) ** 2 + (e.pos.z - p.pos.z) ** 2;
        if (dp < bd && d2 < 36) { bd = dp; best = e; }
      }
      if (!best) for (const e of G.entities) { if (e.dead || !hostile(p, e)) continue; const dp = (e.pos.x - p.pos.x) ** 2 + (e.pos.z - p.pos.z) ** 2; if (dp < bd) { bd = dp; best = e; } }
      if (best) {
        lightning(sx, sy, sz, best.pos.x, best.pos.y + 1.2, best.pos.z, { color: c2 });
        dealDamage(p, best, dmg, { kind: 'spell', element: el, crit, status: s.status });
        chainLightning(p, best, dmg * 0.75, s.chains || 3, el);
      } else lightning(sx, sy, sz, p.aim.x, gY(p.aim.x, p.aim.z), p.aim.z, { color: c2 });
      break;
    }
    case 'line': {
      const { dmg, crit } = spellHooks(p, base, el);
      for (let i = 1; i <= 8; i++) {
        setTimeoutGame(i * 0.05, () => {
          const d = (i / 8) * s.range;
          const x = p.pos.x + Math.sin(ang) * d, z = p.pos.z + Math.cos(ang) * d, y = gY(x, z);
          burst(x, y + 0.3, z, { count: 8, speed: 6, color: c1, color2: c2, additive: false, life: 0.6, up: 1.4, size: 0.5, gravity: -14 });
          spikeVisual(x, y, z, c2);
          for (const e of entitiesNear(x, z, 1.8, (e) => hostile(p, e))) { if (e._lineHit === s) continue; e._lineHit = s; dealDamage(p, e, dmg, { kind: 'spell', element: el, crit, status: s.status }); }
        });
      }
      setTimeoutGame(0.6, () => { for (const e of G.entities) if (e._lineHit === s) e._lineHit = null; });
      break;
    }
    case 'blink': {
      let pt = aimPoint(p, s.range);
      if (G.realm === 'dungeon') {
        for (let k = 10; k >= 0; k--) { const t = k / 10; const x = p.pos.x + (pt.x - p.pos.x) * t, z = p.pos.z + (pt.z - p.pos.z) * t; if (!dungeonWallAt(x, z) && dungeonLOS(p.pos.x, p.pos.z, x, z)) { pt = { x, z }; break; } }
      }
      burst(p.pos.x, p.pos.y + 1, p.pos.z, { count: 30, speed: 5, color: c1, color2: c2, life: 0.6 });
      p.pos.x = pt.x; p.pos.z = pt.z;
      p.invuln = Math.max(p.invuln, 0.2);
      burst(p.pos.x, p.pos.y + 1, p.pos.z, { count: 30, speed: 5, color: c1, color2: c2, life: 0.6 });
      ring(p.pos.x, gY(p.pos.x, p.pos.z), p.pos.z, { radius: 3, color: c2, dur: 0.35 });
      break;
    }
    case 'buff': {
      const data = { ...s.buff };
      if (data.shieldPct) { p.buffs.shield = (p.buffs.shield || 0) + p.maxHp * data.shieldPct / 100; delete data.shieldPct; }
      p.addBuff(s.id, s.duration, data);
      ring(p.pos.x, p.pos.y, p.pos.z, { radius: 2.5, color: c2, dur: 0.6 });
      burst(p.pos.x, p.pos.y + 1, p.pos.z, { count: 30, speed: 3, color: c1, color2: c2, life: 1, gravity: 3, up: 1 });
      floatText(p.pos.x, p.pos.y + 2.6, p.pos.z, s.name, { color: c1, force: true });
      break;
    }
    case 'heal': {
      p.heal(p.maxHp * s.heal);
      if (s.hot) p.addBuff(s.id + '_hot', s.duration, { regenPct: (s.hot * 100) / s.duration });
      pillar(p.pos.x, p.pos.y, p.pos.z, { radius: 1.2, height: 8, color: c2, dur: 0.6 });
      burst(p.pos.x, p.pos.y + 1, p.pos.z, { count: 30, speed: 2, color: c1, color2: c2, life: 1.2, gravity: 4, up: 1.5 });
      bus.emit('spellHeal', { amount: p.maxHp * s.heal });
      break;
    }
    case 'summon': {
      const n = s.count || 1;
      const maxN = (s.max || 3) + (p.derived.flags.moreMinions ? 3 : 0) + (p.derived.powers.moreMinions || 0);
      for (let i = 0; i < n; i++) {
        p.minions = p.minions.filter((m) => !m.dead && !m.removed);
        const same = p.minions.filter((m) => m.tplId === s.summon);
        if (same.length >= maxN) { same[0].lifeTime = 0.01; }
        const a = ang + (i - (n - 1) / 2) * 0.6;
        const x = p.pos.x + Math.sin(a) * 2.5, z = p.pos.z + Math.cos(a) * 2.5;
        bus.emit('spawnAlly', { id: s.summon, x, z, lifeTime: s.duration, owner: p });
        burst(x, gY(x, z) + 0.3, z, { count: 25, speed: 4, color: c1, color2: c2, life: 0.9, up: 1.4 });
      }
      break;
    }
  }
}

function spikeVisual(x, y, z, color) {
  // erupts out of the ground fast, holds, then sinks back
  worldSprite(x, z, spikeSprite('#7a6048', color), (o) => { o.rise = Math.min(1, o.t * 9) - Math.max(0, o.t - 0.8) * 2.2; return o.t < 1.25; });
}

function startChannel(p, s, base, el, color) {
  const cost = s.cost;
  p.action = {
    type: 'channel', t: 0, dur: 99, faceAim: true, tickT: 0,
    tick: (dt) => {
      const a = p.action;
      const slotKey = p.char.skillBar.indexOf(s.id);
      const held = slotKey >= 0 && G.inputHeld && G.inputHeld(slotKey);
      if (!held) { a.stop = true; return; }
      if (s.hpCost) { const c = p.maxHp * s.hpCost * dt * 3; if (p.hp <= c + 1) { a.stop = true; return; } p.hp -= c; }
      else if (!p.useMana(cost * dt * 3)) { a.stop = true; return; }
      const ang = aimAngle(p);
      const sx = p.pos.x + Math.sin(ang) * 0.7, sz = p.pos.z + Math.cos(ang) * 0.7, sy = p.pos.y + 1.35;
      // find target along aim
      let best = null, bd = 1e9;
      for (const e of G.entities) {
        if (e.dead || !hostile(p, e)) continue;
        const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > s.range) continue;
        const da = Math.abs(angleDiff(ang, Math.atan2(dx, dz)));
        if (da < 0.35 + 1 / Math.max(1, d) && d < bd) { bd = d; best = e; }
      }
      const ex = best ? best.pos.x : p.pos.x + Math.sin(ang) * s.range, ez = best ? best.pos.z : p.pos.z + Math.cos(ang) * s.range, ey = best ? best.pos.y + 1.1 : sy - 0.4;
      beam(sx, sy, sz, ex, ey, ez, { color, width: 0.18, dur: dt * 1.6 });
      if (Math.random() < 0.5) particle({ x: ex, y: ey, z: ez, vx: (sx - ex) * 1.5, vy: 0, vz: (sz - ez) * 1.5, life: 0.5, size: 0.3, color });
      a.tickT -= dt;
      if (best && a.tickT <= 0) {
        a.tickT = 0.25;
        const { dmg, crit } = spellHooks(p, base * 0.25, el);
        dealDamage(p, best, dmg, { kind: 'spell', element: el, crit, lifesteal: s.lifesteal, silent: false });
      }
    },
  };
  p.st.action = 'attack'; p.st.kind = 'cast';
}

// ------------------------------------------------------------------------------- skills
export function useSkill(p, sk, combo) {
  const el = sk.element || p.derived.weapon.element || 'physical';
  const [c1, c2] = ELEM_COLORS[el] || ELEM_COLORS.physical;
  const ang = aimAngle(p);
  const wd = p.derived.weaponDmg;
  switch (sk.type) {
    case 'melee': {
      p.facing = ang;
      p.action = { type: 'custom', t: 0, dur: 0.45, faceAim: true, move: 0.2, update: (dt, a) => {
        p.st.action = 'attack'; p.st.kind = sk.id.includes('bash') ? 'bash' : 'overhead'; p.st.actionT = Math.min(1, a.t / 0.45);
        if (!a.hit && a.t > 0.22) {
          a.hit = true;
          slash(p.pos.x, p.pos.y, p.pos.z, p.facing, { radius: sk.range, arc: sk.angle, color: el !== 'physical' ? c2 : '#ffe8c0', dur: 0.25 });
          for (const e of targetsInArc(p, sk.range, sk.angle)) {
            if (sk.execute && !e.boss && e.hp / e.maxHp < sk.execute) { dealDamage(p, e, e.hp + 1, { kind: 'melee', crit: true }); floatText(e.pos.x, e.pos.y + 2.4, e.pos.z, 'EXECUTED', { color: '#ff3020', force: true }); continue; }
            p.hitWithWeapon(e, sk.dmg, { status: sk.status, element: sk.element, knock: 5, heavy: true });
            if (sk.smite) { pillar(e.pos.x, e.pos.y, e.pos.z, { radius: 1, color: c2, height: 12, dur: 0.4 }); dealDamage(p, e, wd * sk.smite * 0.5, { kind: 'spell', element: 'holy' }); }
          }
          addShake(0.2);
        }
      } };
      break;
    }
    case 'buff': {
      const data = { ...sk.buff };
      if (data.shieldPct) { p.buffs.shield = (p.buffs.shield || 0) + p.maxHp * data.shieldPct / 100; delete data.shieldPct; }
      p.addBuff(sk.id, sk.duration, data);
      ring(p.pos.x, p.pos.y, p.pos.z, { radius: sk.radius || 3, color: c2 !== '#c8c0b0' ? c2 : '#ffd080', dur: 0.5 });
      floatText(p.pos.x, p.pos.y + 2.6, p.pos.z, sk.name, { color: '#ffe0a0', force: true });
      if (sk.fear) for (const e of entitiesNear(p.pos.x, p.pos.z, sk.radius, (e) => hostile(p, e))) applyStatus(e, 'fear', sk.fear);
      if (sk.id === 'bonebarrier') burst(p.pos.x, p.pos.y + 1, p.pos.z, { count: 30, speed: 4, color: '#e8e0d0', additive: false, life: 1, size: 0.4 });
      p.st.action = 'attack'; p.st.kind = 'castup'; p.st.actionT = 0.5;
      setTimeoutGame(0.3, () => { if (p.st.kind === 'castup') p.st.action = null; });
      break;
    }
    case 'dash': {
      p.facing = ang;
      const hit = new Set();
      p.invuln = Math.max(p.invuln, 0.25);
      p.action = { type: 'custom', t: 0, dur: 0.32, move: 0, update: (dt, a) => {
        p.st.action = 'attack'; p.st.kind = 'spearthrust'; p.st.actionT = 0.55;
        const sp = sk.range / 0.3;
        p.move(Math.sin(p.facing) * sp * dt, Math.cos(p.facing) * sp * dt, dt);
        p.moveSpeedNow = sp;
        if (el !== 'physical') particle({ x: p.pos.x, y: p.pos.y + 0.3, z: p.pos.z, life: 1.2, size: 0.8, color: c1, color2: c2, vy: 0.5 });
        for (const e of targetsInArc(p, 1.8, 120)) { if (hit.has(e)) continue; hit.add(e); p.hitWithWeapon(e, sk.dmg, { status: sk.status, element: sk.element, knock: 4 }); }
      } };
      break;
    }
    case 'spin': {
      const hitT = new Map();
      p.action = { type: 'custom', t: 0, dur: sk.duration, move: 0.7, update: (dt, a) => {
        p.st.spin = true; p.st.action = null;
        p.facing += dt * 14;
        a.tickT = (a.tickT || 0) - dt;
        if (Math.random() < dt * 20) slash(p.pos.x, p.pos.y, p.pos.z, p.facing, { radius: sk.radius, arc: 140, color: el !== 'physical' ? c2 : '#fff0d8', dur: 0.15 });
        if (a.tickT <= 0) {
          a.tickT = sk.tick;
          for (const e of entitiesNear(p.pos.x, p.pos.z, sk.radius, (e) => hostile(p, e))) {
            p.hitWithWeapon(e, sk.dmg, { element: sk.element, lifesteal: sk.lifesteal, knock: 1 });
            if (sk.chain) chainLightning(p, e, wd * sk.dmg * 0.5, sk.chain);
          }
        }
      }, end: () => { p.st.spin = false; } };
      break;
    }
    case 'nova': {
      p.action = { type: 'custom', t: 0, dur: 0.6, move: 0, update: (dt, a) => {
        p.st.action = 'attack'; p.st.kind = 'slam'; p.st.actionT = Math.min(1, a.t / 0.6);
        if (!a.hit && a.t > 0.36) {
          a.hit = true;
          shockwave(p.pos.x, p.pos.y, p.pos.z, { radius: sk.radius, color: el !== 'physical' ? c2 : '#f0e0c0' });
          if (el !== 'physical') ring(p.pos.x, p.pos.y, p.pos.z, { radius: sk.radius, color: c2, dur: 0.45 });
          burst(p.pos.x, p.pos.y + 0.3, p.pos.z, { count: 24, speed: sk.radius * 2, color: el !== 'physical' ? c1 : '#c8a880', color2: el !== 'physical' ? c2 : '#8a6a4a', additive: el !== 'physical', life: 0.6, up: 1.1, size: 0.45, gravity: -18 });
          addShake(0.45); G.hitstop = Math.max(G.hitstop, 0.06); bus.emit('slam', { src: p, radius: sk.radius });
          for (const e of entitiesNear(p.pos.x, p.pos.z, sk.radius, (e) => hostile(p, e))) p.hitWithWeapon(e, sk.dmg, { status: sk.status, element: sk.element, knock: 7, heavy: true });
          if (sk.element === 'earth' || sk.id === 'thornquake') for (let i = 0; i < 10; i++) { const a2 = (i / 10) * Math.PI * 2; const x = p.pos.x + Math.cos(a2) * sk.radius * 0.7, z = p.pos.z + Math.sin(a2) * sk.radius * 0.7; spikeVisual(x, gY(x, z), z, c2); }
        }
      } };
      break;
    }
    case 'flurry': {
      p.facing = ang;
      p.action = { type: 'custom', t: 0, dur: sk.hits * 0.11 + 0.2, move: 0.4, update: (dt, a) => {
        p.facing = aimAngle(p);
        const i = Math.floor(a.t / 0.11);
        p.st.action = 'attack'; p.st.kind = i % 2 ? 'backslash' : 'slash'; p.st.actionT = (a.t % 0.11) / 0.11 * 0.6 + 0.3;
        if (i < sk.hits && (a.done || 0) <= i) {
          a.done = i + 1;
          slash(p.pos.x, p.pos.y, p.pos.z, p.facing, { radius: sk.range, arc: sk.angle, color: el !== 'physical' ? c2 : '#ffffff', dur: 0.14, reverse: i % 2 === 1 });
          for (const e of targetsInArc(p, sk.range, sk.angle)) p.hitWithWeapon(e, sk.dmg, { status: sk.status, element: sk.element });
          if (sk.id === 'cinderwaltz') spawnHazard({ x: p.pos.x + Math.sin(p.facing) * 1.5, z: p.pos.z + Math.cos(p.facing) * 1.5, radius: 1.6, owner: p, dmg: wd * 0.15, life: 2.5, element: 'fire', status: { burn: 1 } });
        }
      } };
      break;
    }
    case 'volley': case 'shot': {
      const n = sk.count || 1;
      const spread = (sk.spread || 0) * Math.PI / 180;
      const elA = p.derived.passives.arrowElement || el;
      for (let i = 0; i < n; i++) {
        const a = n === 1 ? ang : ang + (i / (n - 1) - 0.5) * spread;
        const sp = (p.derived.weapon.projSpeed || 46);
        let dmg = wd * sk.dmg;
        const crit = Math.random() * 100 < p.derived.critChance;
        if (crit) dmg *= 1 + p.derived.critDmg / 100;
        spawnProjectile({ x: p.pos.x + Math.sin(a) * 0.6, y: p.pos.y + 1.35, z: p.pos.z + Math.cos(a) * 0.6, vx: Math.sin(a) * sp, vz: Math.cos(a) * sp, owner: p, dmg, crit, element: elA, kind: 'arrow', pierce: sk.pierce || 0, pull: sk.pull || 0, life: 1.4, status: elA === 'fire' ? { burn: 2 } : elA === 'lightning' ? { shock: 1 } : null, chain: p.derived.passives.arrowChain || 0, heavy: sk.type === 'shot' });
      }
      p.action = { type: 'shot', t: 0, dur: 0.3, faceAim: true };
      p.st.action = 'attack'; p.st.kind = 'bowrelease'; p.st.actionT = 0;
      break;
    }
    case 'rain': {
      const pt = aimPoint(p, 16);
      for (let i = 0; i < sk.count; i++) {
        setTimeoutGame(0.3 + (i / sk.count) * sk.duration, () => {
          const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * sk.radius;
          const x = pt.x + Math.cos(a) * r, z = pt.z + Math.sin(a) * r, y = gY(x, z);
          const pr = spawnProjectile({ x: x - 2, y: y + 14, z: z - 1, vx: 4, vy: -30, vz: 2, owner: p, dmg: wd * sk.dmg, element: sk.element || 'fire', kind: 'arrow', life: 0.6, status: sk.status, explode: 1.8 });
        });
      }
      p.action = { type: 'shot', t: 0, dur: 0.35, faceAim: true };
      p.st.action = 'attack'; p.st.kind = 'bowrelease'; p.st.actionT = 0;
      break;
    }
    case 'stealth': p.enterStealth(sk.duration); break;
    case 'teleport': {
      let best = null, bd = sk.range * sk.range;
      for (const e of G.entities) {
        if (e.dead || !hostile(p, e)) continue;
        const d2 = (e.pos.x - p.aim.x) ** 2 + (e.pos.z - p.aim.z) ** 2;
        const dp = (e.pos.x - p.pos.x) ** 2 + (e.pos.z - p.pos.z) ** 2;
        if (dp < bd && d2 < 49) { bd = dp; best = e; }
      }
      if (!best) { bus.emit('toast', 'No target.'); p.cooldowns[sk.id] = 0.2; p.stamina += sk.stamina || 0; return; }
      burst(p.pos.x, p.pos.y + 1, p.pos.z, { count: 25, speed: 5, color: el !== 'physical' ? c2 : '#4a3a6a', additive: el !== 'physical', life: 0.6 });
      const behind = best.facing + Math.PI;
      const nx = best.pos.x + Math.sin(behind) * (best.radius + 1.0), nz = best.pos.z + Math.cos(behind) * (best.radius + 1.0);
      if (G.realm !== 'dungeon' || (!dungeonWallAt(nx, nz))) { p.pos.x = nx; p.pos.z = nz; }
      p.facing = Math.atan2(best.pos.x - p.pos.x, best.pos.z - p.pos.z);
      p.invuln = Math.max(p.invuln, 0.3);
      burst(p.pos.x, p.pos.y + 1, p.pos.z, { count: 25, speed: 5, color: el !== 'physical' ? c2 : '#4a3a6a', additive: el !== 'physical', life: 0.6 });
      if (sk.dmg) {
        ring(best.pos.x, best.pos.y, best.pos.z, { radius: sk.radius || 3, color: c2, dur: 0.4 });
        for (const e of entitiesNear(best.pos.x, best.pos.z, sk.radius || 3, (e) => hostile(p, e))) {
          p.hitWithWeapon(e, sk.dmg, { element: sk.element, status: sk.status });
          if (sk.pull && !e.boss) { const a = Math.atan2(best.pos.x - e.pos.x, best.pos.z - e.pos.z); e.knock.set(Math.sin(a) * sk.pull, 0, Math.cos(a) * sk.pull); }
        }
      }
      break;
    }
    case 'dashblink': {
      const pt = aimPoint(p, sk.range);
      let tx = pt.x, tz = pt.z;
      if (G.realm === 'dungeon') for (let k = 10; k >= 0; k--) { const t = k / 10; const x = p.pos.x + (pt.x - p.pos.x) * t, z = p.pos.z + (pt.z - p.pos.z) * t; if (!dungeonWallAt(x, z) && dungeonLOS(p.pos.x, p.pos.z, x, z)) { tx = x; tz = z; break; } }
      burst(p.pos.x, p.pos.y + 1, p.pos.z, { count: 25, speed: 4, color: '#a070ff', life: 0.5 });
      p.pos.x = tx; p.pos.z = tz;
      p.invuln = Math.max(p.invuln, 0.25);
      burst(p.pos.x, p.pos.y + 1, p.pos.z, { count: 25, speed: 4, color: '#a070ff', life: 0.5 });
      break;
    }
    case 'leap': {
      const pt = aimPoint(p, sk.range);
      const sx = p.pos.x, sz = p.pos.z;
      p.invuln = Math.max(p.invuln, 0.5);
      p.action = { type: 'custom', t: 0, dur: 0.5, move: 0, update: (dt, a) => {
        const u = Math.min(1, a.t / 0.42);
        const nx = sx + (pt.x - sx) * u, nz = sz + (pt.z - sz) * u;
        p.move(nx - p.pos.x, nz - p.pos.z, dt);
        p.yOffset = Math.sin(u * Math.PI) * 3;
        p.st.action = 'attack'; p.st.kind = 'slam'; p.st.actionT = u * 0.7;
        if (u >= 1 && !a.hit) {
          a.hit = true; p.yOffset = 0;
          shockwave(p.pos.x, p.pos.y, p.pos.z, { radius: sk.radius, color: el !== 'physical' ? c2 : '#f0e0c0' });
          if (el !== 'physical') ring(p.pos.x, p.pos.y, p.pos.z, { radius: sk.radius, color: c2, dur: 0.4 });
          burst(p.pos.x, p.pos.y + 0.3, p.pos.z, { count: 20, speed: 8, color: el !== 'physical' ? c1 : '#c8a880', additive: el !== 'physical', life: 0.5, up: 1.1, gravity: -18 });
          addShake(0.4); G.hitstop = Math.max(G.hitstop, 0.05); bus.emit('slam', { src: p, radius: sk.radius });
          for (const e of entitiesNear(p.pos.x, p.pos.z, sk.radius, (e) => hostile(p, e))) p.hitWithWeapon(e, sk.dmg, { element: sk.element, knock: sk.knock || 5, heavy: true });
        }
      }, end: () => { p.yOffset = 0; } };
      break;
    }
    case 'flask': {
      if (p.char.cls === 'alchemist') {
        if ((p.resource || 0) < 1) { bus.emit('toast', 'No flasks charged.'); p.cooldowns[sk.id] = 0.2; return; }
        p.resource -= 1;
      }
      const pt = aimPoint(p, 14);
      const els = ['fire', 'frost', 'rot', 'lightning'];
      const fe = els[Math.floor(Math.random() * els.length)];
      const dist = Math.hypot(pt.x - p.pos.x, pt.z - p.pos.z);
      const T = 0.55;
      spawnProjectile({ x: p.pos.x, y: p.pos.y + 1.6, z: p.pos.z, vx: (pt.x - p.pos.x) / T, vy: 9, vz: (pt.z - p.pos.z) / T, gravity: -2 * 9 / T, owner: p, dmg: wd * sk.dmg * (1 + p.derived.spellPower / 200), element: fe, kind: 'orb', size: 0.25, explode: sk.radius, status: fe === 'fire' ? { burn: 3 } : fe === 'frost' ? { chill: 2 } : fe === 'rot' ? { poison: 3 } : { shock: 2 }, life: T + 0.3 });
      p.action = { type: 'shot', t: 0, dur: 0.35, faceAim: true };
      p.st.action = 'attack'; p.st.kind = 'throw'; p.st.actionT = 0;
      break;
    }
    case 'totem': {
      const pt = aimPoint(p, 6);
      const h = spawnHazard({ x: pt.x, z: pt.z, radius: sk.radius, owner: p, dmg: wd * 0.25, tick: 1, life: sk.duration, element: 'nature', status: { root: 1, bleed: 1 }, kind: 'totem' });
      h.totem = true;
      totemVisual(pt.x, gY(pt.x, pt.z), pt.z, sk.duration);
      bus.emit('totemPlaced', h);
      break;
    }
    case 'trap': {
      const pt = aimPoint(p, 5);
      const h = spawnHazard({ x: pt.x, z: pt.z, radius: sk.radius, owner: p, dmg: 0, tick: 0.1, life: 30, element: 'physical', color: '#c0a060', opacity: 0.25 });
      h.onTick = (hz) => {
        const v = entitiesNear(hz.x, hz.z, hz.radius, (e) => hostile(p, e))[0];
        if (v) { dealDamage(p, v, wd * sk.dmg, { kind: 'melee', status: sk.status }); burst(hz.x, hz.y + 0.5, hz.z, { count: 20, speed: 6, color: '#e0c080', life: 0.5 }); hz.life = 0; }
      };
      break;
    }
    case 'wall': {
      const cx = p.pos.x + Math.sin(ang) * 3, cz = p.pos.z + Math.cos(ang) * 3;
      iceWall(cx, cz, ang, sk.duration, p);
      break;
    }
  }
  bus.emit('skillUsed', { skill: sk, combo });
}

function totemVisual(x, y, z, dur) {
  worldSprite(x, z, totemSprite(), (o) => { o.rise = Math.min(1, o.t * 5); o.alpha = o.t > dur - 0.3 ? Math.max(0, (dur - o.t) / 0.3) : 1; return o.t < dur; });
}

function iceWall(cx, cz, ang, dur, owner) {
  const owner_ = 'icewall' + Math.random();
  addCollider(owner_, { x: cx, z: cz, hw: 4, hd: 0.6, rot: -ang });
  spawnHazard({ x: cx, z: cz, radius: 4, owner, dmg: 0, tick: 0.5, life: dur, element: 'frost', status: { chill: 1 }, particles: true });
  for (let i = -3; i <= 3; i++) {
    const x = cx + Math.cos(ang) * i * 1.1, z = cz - Math.sin(ang) * i * 1.1;
    const delay = Math.abs(i) * 0.03;
    worldSprite(x, z, iceSprite(16 + ((i + 3) % 3) * 3), (o) => {
      o.rise = Math.min(1, Math.max(0, o.t - delay) * 7);
      o.alpha = o.t > dur - 0.25 ? Math.max(0, (dur - o.t) / 0.25) : 1;
      if (o.t > dur) { if (i === 0) removeOwner(owner_); return false; }
      return true;
    });
  }
}
