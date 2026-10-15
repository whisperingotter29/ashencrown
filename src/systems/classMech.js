// Class signature mechanics (X) and the passive hooks that make each class play differently.
import { G } from '../game.js';
import { bus } from '../core/events.js';
import { CLASS_BY_ID } from '../data/classes.js';
import { dealDamage, entitiesNear, hostile, spawnHazard, applyStatus, spawnProjectile, targetsInArc, explodeAt } from './combat.js';
import { burst, ring, floatText, slash, pillar, flash, particle, ELEM_COLORS, lightning } from '../render/vfx.js';
import { addShake } from '../world/cameraRig.js';
import { spellDamage } from './stats.js';
import { S } from '../data/items.js';
import { setTimeoutGame } from '../entities/enemy.js';
import { groundHeight } from '../world/terrain.js';
import { biomeWeights } from '../world/terrainGen.js';

export const BEAT = 0.6; // Bard tempo: 100 BPM
const P = () => G.player;
const cls = () => G.player?.char.cls;
function add(n) { const p = P(); p.resource = Math.max(0, Math.min(p.resourceMax, (p.resource || 0) + n)); }
function gY(x, z) { return G.realm === 'dungeon' ? (G.dungeon?.floorY ?? 0) : groundHeight(x, z); }

export function beatPhase() { return (G.time % BEAT) / BEAT; }
export function onBeat() { const ph = beatPhase(); return ph < 0.18 || ph > 0.86; }

export function initClassMechanics() {
  bus.on('preHit', (h) => {
    const p = P(); if (!p) return;
    const c = cls();
    if (c === 'assassin' && h.behind) { h.crit = true; add(15); }
    if (c === 'duelist') { h.dmg *= 1 + Math.min(0.3, (p.resource || 0) * 0.003); }
    if (c === 'bard') beatHook(h);
    if (c === 'necromancer') h.dmg *= 1;
    if (p.riposteReady) {
      h.crit = true; h.dmg *= 3 * (p.derived.powers.riposteX || 1); p.riposteReady = false;
      floatText(p.pos.x, p.pos.y + 2.6, p.pos.z, 'RIPOSTE', { color: '#ffffff', force: true });
      if (p.derived.passives.riposteExplode) explodeAt(p, h.e.pos.x, h.e.pos.y + 1, h.e.pos.z, 3.5, h.dmg * 0.5, 'fire', { burn: 2 }, false);
    }
  });
  bus.on('preShot', (h) => {
    const p = P(); if (!p) return;
    const c = cls();
    if (c === 'ranger' && p.resource >= 100 && h.kind !== 'bolt') { h.crit = true; h.dmg *= 1.25; p.resource = 0; floatText(p.pos.x, p.pos.y + 2.4, p.pos.z, 'Focused!', { color: '#c0ff80', force: true }); }
    if (c === 'bard') beatHook(h);
    if (c === 'pyromancer' && h.element === 'fire') h.dmg *= 1 + Math.floor((p.resource || 0) / 10) * 0.04;
    if (c === 'necromancer') h.dmg *= 1 + (p.resource || 0) * 0.02;
  });
  bus.on('preSpell', (h) => {
    const p = P(); if (!p) return;
    const c = cls();
    if (c === 'pyromancer' && h.element === 'fire') h.dmg *= 1 + Math.floor((p.resource || 0) / 10) * 0.04;
    if (c === 'necromancer') h.dmg *= 1 + (p.resource || 0) * 0.02;
    if (c === 'bard') beatHook(h);
  });
  bus.on('spellCast', ({ spell, element }) => {
    const p = P(); if (!p) return;
    if (cls() === 'pyromancer' && element === 'fire') {
      add(spell.cost >= 30 ? 22 : 12);
      if (p.resource >= 100) overheat(p);
    }
  });
  bus.on('drawing', ({ still, dt }) => { if (cls() === 'ranger' && still) add(45 * dt); });
  bus.on('block', () => { if (cls() === 'knight') add(12); });
  bus.on('meleeHit', () => {
    const c = cls();
    if (c === 'knight') add(3);
    if (c === 'berserker') add(6);
    if (c === 'duelist') add(3);
  });
  bus.on('playerHitEnemy', ({ e, dmg }) => {
    const c = cls();
    if (c === 'berserker') add(2);
    const p = P();
    if (p?.buffs?.wildform) { /* thorns handled on damage taken */ }
  });
  bus.on('playerHit', ({ amount, src }) => {
    const p = P(); if (!p) return;
    const c = cls();
    if (c === 'berserker') add(8 + (amount / p.maxHp) * 60);
    if (c === 'duelist') p.resource = (p.resource || 0) * 0.5;
    // thorns / reflect effects
    const B = p.buffAgg || {};
    if (src && !src.isPlayer && (p.buffs.wildform || B.thorns)) {
      dealDamage(p, src, amount * (B.thorns || 0.4) + p.derived.weaponDmg * 0.3, { kind: 'dot', element: 'nature', silent: false });
      if (p.buffs.wildform) applyStatus(src, 'root', 1.5);
    }
    if (B.chillAttackers || p.derived.flags.chillAttackers) src && applyStatus(src, 'chill', 1, p);
    // mounted riders get knocked off by big hits
    if (p.mounted && amount > p.maxHp * 0.08) { p.toggleMount(); bus.emit('toast', 'You were knocked from your mount!'); }
  });
  bus.on('dodge', () => {
    const p = P(); if (!p) return;
    if (cls() === 'duelist') add(5);
    if (p.derived.traits.has('glamour') && Math.random() < 0.15) for (const e of G.entities) if (e.target === p && !e.boss) { e.target = null; floatText(e.pos.x, e.pos.y + 2.2, e.pos.z, '?', { color: '#e0c0ff', force: true }); }
    if (p.derived.flags.dodgeSand) for (const e of entitiesNear(p.pos.x, p.pos.z, 4, (e) => hostile(p, e))) applyStatus(e, 'blind', 2);
    if (p.derived.flags.dodgeSoak) for (const e of entitiesNear(p.pos.x, p.pos.z, 4, (e) => hostile(p, e))) applyStatus(e, 'soak', 2);
    if (p.derived.powers.dodgeFire) spawnHazard({ x: p.pos.x, z: p.pos.z, radius: 2, owner: p, dmg: p.derived.weaponDmg * 0.2, life: 2.5, element: 'fire', status: { burn: 1 } });
  });
  bus.on('parry', ({ player: p, attacker }) => {
    floatText(p.pos.x, p.pos.y + 2.6, p.pos.z, 'PARRY', { color: '#ffffff', force: true, crit: true });
    burst(p.pos.x + Math.sin(p.facing) * 0.7, p.pos.y + 1.3, p.pos.z + Math.cos(p.facing) * 0.7, { count: 26, speed: 9, color: '#ffffff', color2: '#ffd080', life: 0.4, size: 0.25 });
    flash(p.pos.x, p.pos.y + 1.5, p.pos.z, '#fff0c0', 30, 8, 0.2);
    G.slowmo = 0.22;
    addShake(0.25);
    if (attacker && !attacker.boss) { attacker.applyStagger && attacker.applyStagger(99); attacker.stun = Math.max(attacker.stun || 0, 1.0); attacker.cancelAttack && attacker.cancelAttack(); }
    else if (attacker?.boss) { attacker.cancelAttack && attacker.cancelAttack(); }
    p.stamina = Math.min(p.maxStamina, p.stamina + 15);
    const c = cls();
    if (c === 'knight') add(25);
    if (c === 'duelist') add(8);
    if (c === 'duelist' || p.derived.passives.riposte) p.riposteReady = true;
    if (p.derived.flags.parryHeal) p.heal(p.maxHp * 0.06);
    if (p.derived.passives.parryNova) {
      ring(p.pos.x, p.pos.y, p.pos.z, { radius: 5, color: '#ffd050', dur: 0.4 });
      for (const e of entitiesNear(p.pos.x, p.pos.z, 5, (e) => hostile(p, e))) dealDamage(p, e, p.derived.weaponDmg * 1.2, { kind: 'spell', element: 'holy', status: { brand: 1 } });
    }
    if (p.derived.flags.blockNova) pillar(p.pos.x, p.pos.y, p.pos.z, { radius: 2, color: '#ffe080', height: 10 });
    bus.emit('parrySound');
  });
  bus.on('block', ({ player: p }) => {
    if (p.derived.flags.blockNova && Math.random() < 0.3) {
      ring(p.pos.x, p.pos.y, p.pos.z, { radius: 4, color: '#ffd050', dur: 0.4 });
      for (const e of entitiesNear(p.pos.x, p.pos.z, 4, (e) => hostile(p, e))) dealDamage(p, e, p.derived.weaponDmg * 0.6, { kind: 'spell', element: 'holy' });
    }
  });
  bus.on('healed', ({ amount, over }) => {
    const p = P(); if (!p) return;
    if (cls() === 'cleric') {
      add((amount / p.maxHp) * 80);
      if (over > 0) { p.buffs.shield = Math.min(p.maxHp * 0.3, (p.buffs.shield || 0) + over * 0.5); }
    }
  });
  bus.on('hit', ({ src, tgt, element }) => {
    if (src?.isPlayer && cls() === 'cleric' && element === 'holy') add(5);
  });
  bus.on('frozen', ({ src }) => { if (src?.isPlayer && cls() === 'cryomancer') add(20); });
  bus.on('kill', ({ victim, killer }) => {
    const p = P(); if (!p || victim.isPlayer || victim.team === 'player') return;
    const c = cls();
    const near = Math.hypot(victim.pos.x - p.pos.x, victim.pos.z - p.pos.z) < 16;
    if (c === 'necromancer' && near) {
      add(1);
      particle({ x: victim.pos.x, y: victim.pos.y + 1, z: victim.pos.z, vx: (p.pos.x - victim.pos.x) * 1.5, vy: 3, vz: (p.pos.z - victim.pos.z) * 1.5, life: 0.7, size: 0.5, color: '#80ffa0', drag: 0.5 });
    }
    if (c === 'assassin' && killer === p) { p.stamina = Math.min(p.maxStamina, p.stamina + 20); }
    if (c === 'alchemist' && near && Math.random() < 0.25) add(1);
    if (killer === p && p.derived.powers.killStealth) p.enterStealth(p.derived.powers.killStealth);
    if (killer === p && p.stealthedKill && p.derived.flags.stealthRefresh) p.enterStealth(4);
    if (p.derived.flags.killBurst && victim.status?.burn > 0) explodeAt(p, victim.pos.x, victim.pos.y + 1, victim.pos.z, 3.5, p.derived.weaponDmg * 0.8, 'fire', { burn: 2 }, false);
    if (p.derived.powers.killSpores) spawnHazard({ x: victim.pos.x, z: victim.pos.z, radius: 3, owner: p, dmg: 0, life: 4, element: 'nature', healTick: 0.01, color: '#80ffb0' });
  });
  bus.on('callLightning', ({ x, z }) => {
    const p = P(); const y = gY(x, z);
    lightning(x, y + 30, z, x, y, z, { color: '#c0d0ff', segs: 12, jag: 2 });
    for (const e of entitiesNear(x, z, 3, (e) => hostile(p, e))) dealDamage(p, e, p.derived.weaponDmg * 1.5, { kind: 'spell', element: 'lightning', status: { shock: 2 } });
  });
  bus.on('thornBurst', ({ x, z }) => {
    const p = P();
    ring(x, gY(x, z), z, { radius: 3, color: '#80d040' });
    for (const e of entitiesNear(x, z, 3, (e) => hostile(p, e))) dealDamage(p, e, p.derived.weaponDmg * 0.5, { kind: 'spell', element: 'nature', status: { root: 1.5 } });
  });
}

function beatHook(h) {
  const p = P();
  if (onBeat()) {
    h.dmg *= 1.25 + (p.derived.passives.beatBonus || 0);
    add(10);
    floatText(p.pos.x, p.pos.y + 2.5, p.pos.z, '♪', { color: '#ffa0ff', force: true, life: 0.6 });
    bus.emit('onBeat');
  } else add(-3);
}

function overheat(p) {
  p.resource = 0;
  floatText(p.pos.x, p.pos.y + 2.6, p.pos.z, 'OVERHEAT', { color: '#ff6020', force: true, crit: true });
  const dmg = spellDamage(p.char, p.derived, { dmg: 60 });
  explodeAt(p, p.pos.x, p.pos.y + 1, p.pos.z, 6, dmg, 'fire', { burn: 3 }, false);
  dealDamage(null, p, p.maxHp * 0.1, { element: 'fire', kind: 'hazard' });
}

export function updateClassMech(dt) {
  const p = P();
  if (!p || p.dead) return;
  const c = cls();
  const def = CLASS_BY_ID[c];
  const inCombat = G.time - p.lastCombatT < 4;
  if (def.resource.decays && !inCombat) add(-(c === 'pyromancer' ? 6 : 5) * dt);
  if (c === 'pyromancer') add(-2 * dt);
  // passive effects
  p.dmgTakenMult = 1;
  if (c === 'knight' && p.resource >= 100) p.dmgTakenMult *= 0.85;
  if (c === 'warden') {
    let near = false;
    for (const h of G.hazards) if (h.totem && Math.hypot(h.x - p.pos.x, h.z - p.pos.z) < h.radius + 2) near = true;
    if (!near && G.realm === 'surface') { const w = biomeWeights(p.pos.x, p.pos.z, {}); near = (w.verdant || 0) > 0.6; }
    if (near) add(8 * dt);
    p.dmgTakenMult *= 1 - Math.floor((p.resource || 0) / 25) * 0.05;
  }
  if (c === 'cryomancer') {
    for (const e of G.entities) if (!e.dead && e.status?.chill > 0 && Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < 6) { p.dmgTakenMult *= 0.9; break; }
  }
  if (c === 'alchemist') {
    p._flaskT = (p._flaskT || 0) + dt;
    if (p._flaskT > 6) { p._flaskT = 0; add(1); }
  }
  if (p.buffs.bloodfrenzy) { p.buffs.bloodfrenzy.lifesteal = 0.15; }
  if (p.derived.flags.legionAura) for (const e of G.entities) if (!e.dead && e.team === 'enemy' && Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < 6) e.status.weaken = Math.max(e.status.weaken || 0, 0.5);
  if (p.derived.powers.frostAura) for (const e of G.entities) if (!e.dead && e.team === 'enemy' && Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < 5) e.status.chill = Math.max(e.status.chill || 0, 0.5);
}

// ------------------------------------------------------------------ signatures (X)
export function useSignature(p) {
  const c = p.char.cls;
  const def = CLASS_BY_ID[c];
  if ((p.cooldowns.signature || 0) > 0) return;
  const r = p.resource || 0;
  const fail = (msg) => { bus.emit('toast', msg); };
  const ang = Math.atan2(p.aim.x - p.pos.x, p.aim.z - p.pos.z);
  const wd = p.derived.weaponDmg;
  switch (c) {
    case 'knight': {
      if (r < 50) return fail('Not enough Resolve (50).');
      add(-50);
      p.facing = ang;
      const hit = new Set();
      p.invuln = Math.max(p.invuln, 0.4);
      p.action = { type: 'custom', t: 0, dur: 0.5, move: 0, update: (dt) => {
        p.st.action = 'attack'; p.st.kind = 'bash'; p.st.actionT = 0.5;
        p.move(Math.sin(p.facing) * 22 * dt, Math.cos(p.facing) * 22 * dt, dt);
        p.moveSpeedNow = 22;
        burst(p.pos.x, p.pos.y + 0.3, p.pos.z, { count: 2, speed: 3, color: '#ffe0a0', life: 0.4 });
        for (const e of targetsInArc(p, 2.2, 160)) { if (hit.has(e)) continue; hit.add(e); p.hitWithWeapon(e, 2.0, { status: { stun: 1.5 }, knock: 9, heavy: true }); }
      } };
      break;
    }
    case 'berserker': {
      if (r < 30) return fail('Not enough Rage (30).');
      const dur = r / 10;
      p.resource = 0;
      p.addBuff('bloodfrenzy', dur, { attackSpeedPct: 30, lifesteal: 0.15 });
      ring(p.pos.x, p.pos.y, p.pos.z, { radius: 5, color: '#ff2010', dur: 0.6 });
      burst(p.pos.x, p.pos.y + 1, p.pos.z, { count: 50, speed: 8, color: '#ff3020', color2: '#600000', life: 0.8 });
      floatText(p.pos.x, p.pos.y + 2.8, p.pos.z, 'BLOODFRENZY', { color: '#ff3020', force: true, crit: true });
      addShake(0.4);
      break;
    }
    case 'ranger': {
      let best = null, bd = 400;
      for (const e of G.entities) { if (e.dead || !hostile(p, e)) continue; const d2 = (e.pos.x - p.aim.x) ** 2 + (e.pos.z - p.aim.z) ** 2; if (d2 < bd) { bd = d2; best = e; } }
      if (!best) return fail('No prey near your cursor.');
      best.dmgTakenMult = 1.3; best.marked = G.time + 15;
      setTimeoutGame(15, () => { if (best.marked <= G.time) best.dmgTakenMult = 1; });
      pillar(best.pos.x, best.pos.y, best.pos.z, { radius: 0.8, color: '#c0ff60', height: 8 });
      floatText(best.pos.x, best.pos.y + 2.6, best.pos.z, 'MARKED', { color: '#c0ff60', force: true });
      break;
    }
    case 'assassin': {
      p.enterStealth(6);
      p.shadowmeld = true;
      break;
    }
    case 'pyromancer': {
      if (r < 10) return fail('Not enough Heat.');
      const rad = 3 + r / 12;
      const dmg = spellDamage(p.char, p.derived, { dmg: 25 + r * 0.9 });
      p.resource = 0;
      explodeAt(p, p.pos.x, p.pos.y + 1, p.pos.z, rad, dmg, 'fire', { burn: 3 }, false);
      pillar(p.pos.x, p.pos.y, p.pos.z, { radius: rad * 0.4, height: 14, color: '#ff6020' });
      break;
    }
    case 'cryomancer': {
      const frozen = G.entities.filter((e) => !e.dead && e.frozen > 0 && hostile(p, e) && Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < 16);
      if (!frozen.length) return fail('No frozen enemies to shatter.');
      const dmg = spellDamage(p.char, p.derived, { dmg: 70 }) * (1 + r / 100);
      for (const e of frozen) {
        e.frozen = 0;
        burst(e.pos.x, e.pos.y + 1, e.pos.z, { count: 30, speed: 10, color: '#e0faff', color2: '#60c0ff', life: 0.7, size: 0.4 });
        dealDamage(p, e, dmg, { kind: 'spell', element: 'frost', crit: true });
      }
      p.resource = 0;
      addShake(0.4);
      break;
    }
    case 'cleric': {
      if (r < 60) return fail('Not enough Devotion (60).');
      add(-60);
      const dmg = spellDamage(p.char, p.derived, { dmg: 14 });
      spawnHazard({ x: p.pos.x, z: p.pos.z, radius: 6, owner: p, dmg, tick: 0.5, life: 8, element: 'holy', healTick: 0.02, color: '#ffe080', status: { brand: 1 } });
      pillar(p.pos.x, p.pos.y, p.pos.z, { radius: 6, height: 16, color: '#ffe080', dur: 0.8 });
      break;
    }
    case 'necromancer': {
      if (r < 3) return fail('Not enough Souls (3).');
      const champs = p.minions.filter((m) => !m.dead && m.champion);
      if (champs.length >= 3) champs[0].lifeTime = 0.01;
      add(-3);
      const x = p.pos.x + Math.sin(ang) * 2.5, z = p.pos.z + Math.cos(ang) * 2.5;
      bus.emit('spawnAlly', { id: 'skeleton_minion', x, z, lifeTime: 60, owner: p, champion: true });
      pillar(x, gY(x, z), z, { radius: 1.2, color: '#80ffa0', height: 6 });
      break;
    }
    case 'bard': {
      if (r < 20) return fail('Not enough Tempo (20).');
      const rad = 4 + r / 20;
      const dmg = wd * (1 + r / 40) * (1 + p.derived.spellPower / 200);
      p.resource = 0;
      for (let i = 0; i < 3; i++) setTimeoutGame(i * 0.12, () => ring(p.pos.x, p.pos.y + 0.5, p.pos.z, { radius: rad, color: '#ff90ff', dur: 0.5 }));
      for (const e of entitiesNear(p.pos.x, p.pos.z, rad, (e) => hostile(p, e))) dealDamage(p, e, dmg, { kind: 'spell', element: 'sound', status: { stagger: 2, stun: 0.8 }, knock: 8, fromX: p.pos.x, fromZ: p.pos.z });
      addShake(0.4);
      break;
    }
    case 'alchemist': {
      if (r < 2) return fail('Need 2 flask charges.');
      add(-2);
      let best = null, bd = 64;
      for (const e of G.entities) { if (e.dead || !hostile(p, e)) continue; const d2 = (e.pos.x - p.aim.x) ** 2 + (e.pos.z - p.aim.z) ** 2; if (d2 < bd) { bd = d2; best = e; } }
      let el = 'fire';
      if (best) { let lo = 999; for (const k of ['fire', 'frost', 'lightning', 'rot', 'void', 'holy']) { const v = best.res?.[k] || 0; if (v < lo) { lo = v; el = k; } } }
      const tx = best ? best.pos.x : p.aim.x, tz = best ? best.pos.z : p.aim.z;
      const T = 0.6;
      spawnProjectile({ x: p.pos.x, y: p.pos.y + 1.8, z: p.pos.z, vx: (tx - p.pos.x) / T, vy: 10, vz: (tz - p.pos.z) / T, gravity: -2 * 10 / T, owner: p, dmg: wd * 3 * (1 + p.derived.spellPower / 150), element: el, kind: 'fireball', size: 0.5, explode: 5, life: T + 0.4 });
      break;
    }
    case 'warden': {
      if (r < 25) return fail('Not enough Bark (25).');
      p.resource = 0;
      p.addBuff('wildform', 8, { armorPct: 30 });
      burst(p.pos.x, p.pos.y + 1, p.pos.z, { count: 40, speed: 5, color: '#90e060', color2: '#3a6a20', life: 1 });
      floatText(p.pos.x, p.pos.y + 2.8, p.pos.z, 'WILDFORM', { color: '#90e060', force: true, crit: true });
      break;
    }
    case 'duelist': {
      if (r < 40) return fail('Not enough Style (40).');
      add(-40);
      p.action = { type: 'custom', t: 0, dur: 0.9, move: 0, update: (dt, a) => {
        const i = Math.floor(a.t / 0.14);
        p.st.action = 'attack'; p.st.kind = i % 2 ? 'backslash' : 'slash'; p.st.actionT = (a.t % 0.14) / 0.14 * 0.6 + 0.3;
        if (i < 6 && (a.done || 0) <= i) {
          a.done = i + 1;
          const tg = entitiesNear(p.pos.x, p.pos.z, 4.5, (e) => hostile(p, e));
          const e = tg[i % Math.max(1, tg.length)];
          if (e) { p.facing = Math.atan2(e.pos.x - p.pos.x, e.pos.z - p.pos.z); p.hitWithWeapon(e, 0.7, { critBonus: 30 }); }
          slash(p.pos.x, p.pos.y, p.pos.z, p.facing, { radius: 3.4, arc: 160, color: '#ffffff', dur: 0.14, reverse: i % 2 === 1 });
        }
      } };
      p.invuln = Math.max(p.invuln, 0.9);
      break;
    }
  }
  p.cooldowns.signature = 1.5;
  p.lastCombatT = G.time;
  bus.emit('signature', { cls: c });
}

// Shadowmeld: next attack triple — implemented via the stealth multiplier (x2.5) plus a bonus
bus.on('preHit', (h) => { const p = G.player; if (p?.shadowmeld && p.stealthed) { h.dmg *= 1.2; } });
bus.on('stealthBroken', () => { const p = G.player; if (p) { p.shadowmeld = false; p.stealthedKill = true; setTimeoutGame(0.3, () => { p.stealthedKill = false; }); } });
