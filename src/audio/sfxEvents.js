// Game events -> sound. Everything here listens on the event bus (plus global DOM listeners for UI
// clicks / hovers and a light poll for continuous states: whirlwind, channelled beams, heartbeat).
import { G } from '../game.js';
import { bus } from '../core/events.js';
import { E, play, stop, duck } from './sfxEngine.js';
import { primaryBiome, roadAt } from '../world/terrainGen.js';
import { TOWNS } from '../data/world.js';

const RARITY_IDX = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };
const RUN = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];            // pentatonic climb of the kill streak tick
const rand = (a, b) => a + Math.random() * (b - a);
const P = () => G.player;
const playerSide = (e) => !!e && (e.isPlayer || e.team === 'player' || !!e.owner?.isPlayer);
const at = (e) => (e?.pos ? { x: e.pos.x, z: e.pos.z } : {});
const elOk = (el) => !!el && E.sounds[el + '_hit'];

function material(t) {
  const tp = t?.tpl || {};
  if (tp.construct) return 'stone';
  if (tp.undead) return 'bone';
  if (tp.gear === 'plate' || tp.gear === 'mail' || t?.affix?.id === 'shielded') return 'armor';
  return 'flesh';
}
const HIT_OF = { flesh: 'hit_flesh', armor: 'hit_armor', bone: 'hit_bone', stone: 'hit_stone' };
const KILL_OF = { flesh: 'kill_flesh', armor: 'kill_flesh', bone: 'kill_bone', stone: 'kill_stone' };

const S = {
  streak: 0, lastKill: -9, extStreak: false, tickT: 0, burst: 0, burstT: -9,
  booms: [], loops: {}, beamEl: 'void', drawV: null, hbNext: 0, lastParry: -9,
  rareSeen: new WeakSet(), coinAcc: 0, coinT: -9, lastSwap: -9,
};

// ------------------------------------------------------------------ combat
function onSwing({ kind, weapon, heavy }) {
  const thrust = kind === 'thrust' || kind === 'stab' || kind === 'spearthrust';
  const big = weapon === 'greatsword' || weapon === 'halberd';
  if (heavy) {
    play('swing_heavy', { vol: 1, semis: big ? -3 : 0, prio: 2 });
    if (thrust) play('swing_thrust', { vol: -3, semis: -2 });
  } else if (thrust) play('swing_thrust', { semis: weapon === 'dagger' ? 2 : 0 });
  else if (big) play('swing_heavy', { semis: kind === 'overhead' ? -2 : 1 });
  else if (weapon === 'mace' || weapon === 'spear' || weapon === 'staff') play('swing_med', { semis: kind === 'backslash' ? 1.5 : 0 });
  else play('swing_light', { semis: kind === 'backslash' ? 1.5 : weapon === 'dagger' ? 2.5 : 0 });
  if ((heavy || kind === 'overhead') && /sword|dagger|halberd|spear/.test(weapon || '')) play('blade_ring', { delay: 0.09 });
  const el = P()?.derived?.weapon?.element;
  if (elOk(el) && el !== 'physical') play(el + '_bolt', { vol: heavy ? -5 : -12, delay: 0.04, cat: 'swing', prio: 0.5 });
}

function onHit(h) {
  const { src, tgt, dmg = 0, crit, kind, heavy } = h;
  if (!tgt) return;
  const el = h.element || 'physical';
  // an explosion's element arrives with its first hit, in the same frame
  if (kind === 'spell' && S.booms.length) { const b = S.booms[S.booms.length - 1]; if (!b.el) b.el = el; }
  if (tgt.isPlayer) return onPlayerHurt(h);
  const pos = at(tgt);
  if (!playerSide(src)) { play(HIT_OF[material(tgt)], { vol: -12, cat: 'far', ...pos }); return; }
  const frac = dmg / Math.max(1, tgt.maxHp || 100);
  const base = (src.isPlayer ? 0 : -6) + Math.min(3, Math.log2(1 + frac * 8) * 1.3) - 1.5;
  if (kind === 'dot' || kind === 'hazard') {
    if (elOk(el)) play(el + '_hit', { vol: base - 15, semis: 5, cat: 'dot', lp: 5000, ...pos });
    return;
  }
  const size = tgt.boss ? 2 : tgt.elite ? 1 : 0;
  const semis = -size * 2.5;
  const prio = crit ? 2 : heavy ? 1.6 : 1;
  if (el === 'physical' || kind === 'melee' || kind === 'ranged') play(HIT_OF[material(tgt)], { vol: base + (heavy ? 2 : 0), semis: semis + (crit ? -1 : 0), prio, ...pos });
  if (el !== 'physical' && elOk(el)) play(el + '_hit', { vol: base + (kind === 'spell' ? 0 : -5), semis, prio: kind === 'spell' ? 1.5 : 1, ...pos });
  if (crit) { play('crit_crack', { vol: base + 1, prio: 2, ...pos }); play('sub_thump', { vol: -1, prio: 2 }); }
  else if (heavy) play('sub_thump', { vol: -7, semis: 2 });
}

function onPlayerHurt({ dmg = 0, crit, element, kind }) {
  const p = P();
  const frac = dmg / Math.max(1, p?.maxHp || 100);
  if (kind === 'dot' || kind === 'hazard') { if (frac > 0.01) play('hurt', { vol: -15, semis: 3, lp: 2200 }); return; }
  play('hurt', { vol: -3 + Math.min(5, frac * 35), semis: -Math.min(4, frac * 20), prio: 3 });
  if (element && element !== 'physical' && elOk(element)) play(element + '_hit', { vol: -9, prio: 2 });
  if (frac > 0.12 || crit) { play('sub_thump', { vol: -3, prio: 3 }); duck(4, 0.1, 0.5); }
}

function onKill({ victim, killer, element }) {
  if (!victim) return;
  if (victim.isPlayer) {
    play('player_death', { prio: 5 }); play('boom_big', { vol: -4 });
    for (const k of Object.keys(S.loops)) stopLoop(k, 0.3);
    duck(14, 2.5, 3);
    return;
  }
  const pos = at(victim);
  if (!playerSide(killer)) { play(KILL_OF[material(victim)], { vol: -13, cat: 'far', ...pos }); return; }
  const t = E.ctx.currentTime;
  if (!S.extStreak) S.streak = t - S.lastKill < 3 ? S.streak + 1 : 1;
  S.lastKill = t;
  if (t - S.burstT > 0.08) S.burst = 0;
  S.burst++; S.burstT = t;
  const size = victim.boss ? 2 : victim.elite ? 1 : 0;
  play(KILL_OF[material(victim)], { vol: size ? 2 : 0, semis: -size * 3, prio: 1 + size, ...pos });
  if (material(victim) === 'armor') play('hit_armor', { vol: -4, semis: -3, ...pos });
  if (element && element !== 'physical' && elOk(element)) play(element + '_hit', { vol: -5, semis: -2, ...pos });
  if (size >= 1) {
    play('boom_small', { vol: -3, ...pos }); play('crit_crack', { vol: -3 });
    play('gong', { vol: size === 2 ? 0 : -5, semis: size === 2 ? -5 : 0 });
    duck(size === 2 ? 12 : 5, size === 2 ? 0.8 : 0.15, size === 2 ? 2.5 : 0.8);
  }
  if (size === 2) { play('boom_big', {}); play('rumble_tail', { vol: -2 }); }
  if (S.burst === 4) { play('sub_thump', { vol: 0, prio: 3 }); play('crit_crack', { vol: -4, semis: -3 }); }   // multi-kill punch
  // the reward tick waits a microtask so a 'streak' event emitted for this kill lands first
  const burst = S.burst;
  queueMicrotask(() => rewardTick(S.streak, burst));
}

function rewardTick(n, burst) {
  const tn = E.ctx.currentTime;
  S.tickT = Math.max(tn + 0.02, S.tickT + 0.045);              // simultaneous kills arpeggiate
  if (S.tickT > tn + 0.4) { S.tickT = tn + 0.4; return; }       // never queue a long backlog
  n = Math.max(1, n | 0);
  const tier = Math.floor((n - 1) / 10);
  play('kill_tick', { at: S.tickT, semis: RUN[(n - 1) % 10], vol: Math.min(5, tier * 1.2) + (burst > 2 ? 1 : 0), prio: 2 });
  if (n % 10 === 0 && !SHOUT_AT[n]) {                           // every tenth kill: a sparkle that climbs with the streak
    play('streak_sting', { at: S.tickT + 0.04, semis: Math.min(7, tier - 1), vol: Math.min(4, tier) });
    if (n >= 30) play('sub_thump', { at: S.tickT + 0.04, vol: -4 });
  }
}
// named milestones from the streak system (10 KILLING SPREE, 25 RAMPAGE, 50, 100, 200, 350, 500)
const SHOUT_AT = { 10: 0, 25: 1, 50: 2, 100: 3, 200: 4, 350: 5, 500: 6 };
function onShout({ n }) {
  const k = SHOUT_AT[n] ?? Math.min(6, Math.floor(Math.log2(Math.max(1, n / 10))));
  const t = Math.max(E.ctx.currentTime + 0.02, S.tickT + 0.05);
  play('streak_shout', { at: t, semis: Math.min(9, k * 1.5), vol: Math.min(3, k), prio: 5 });
  play('streak_sting', { at: t + 0.36, semis: Math.min(9, k * 1.5), vol: -2 });
  if (k >= 1) play('sub_thump', { at: t + 0.34, vol: 0, prio: 4 });
  if (k >= 2) play('boom_small', { at: t + 0.34, vol: -4 + k, prio: 4 });
  if (k >= 3) play('gong', { at: t + 0.34, vol: -6 + k, semis: -k });
  duck(5 + k * 1.5, 0.5 + k * 0.15, 1.2);
}

function onShot({ kind, draw = 1, crit }) {
  if (S.drawV) { stop(S.drawV, 0.03); S.drawV = null; }
  if (kind === 'bolt') { play('xbow_thunk', { prio: 1.5 }); play('arrow_whiz', { vol: -2, delay: 0.02 }); return; }
  play('bow_twang', { vol: -3 + draw * 3, semis: (draw - 0.5) * 3, prio: 1.5 });
  play('arrow_whiz', { vol: -6 + draw * 4, delay: 0.015, semis: draw * 2 });
  if (draw >= 1 || crit) play('swing_thrust', { vol: -6, semis: 3 });
}

const scheduled = [];
function later(sec, fn) { scheduled.push(setTimeout(fn, sec * 1000)); if (scheduled.length > 64) scheduled.shift(); }

function boomNow(b) {
  const mine = playerSide(b.owner);
  const r = b.radius || 3;
  const big = r >= 5;
  const vol = mine ? 0 : -5;
  play(big ? 'boom_big' : 'boom_small', { vol, x: b.x, z: b.z, semis: big ? -Math.min(4, (r - 5) * 0.7) : clamp3(3.5 - r), prio: 2 });
  if (r >= 6) play('rumble_tail', { vol: vol - 3 });
  if (b.el && b.el !== 'physical' && elOk(b.el)) play(b.el + '_hit', { vol, x: b.x, z: b.z, semis: -2, prio: 1.5 });
  if (mine) duck(Math.min(9, 2 + r), 0.1, 0.4 + r * 0.08);
}
const clamp3 = (v) => Math.max(-3, Math.min(3, v));

function onSpellCast({ spell: s, element }) {
  if (!s) return;
  const el = elOk(element) ? element : 'physical';
  const big = (s.cost || 0) >= 30 || (s.tier || 1) >= 4;
  play(el + '_cast', { vol: big ? 1 : -1, semis: (s.tier || 1) >= 4 ? -2 : 0, prio: 1.5 });
  switch (s.type) {
    case 'projectile': for (let i = 1; i < Math.min(s.count || 1, 4); i++) play(el + '_bolt', { delay: 0.03 * i, vol: -6 }); break;
    case 'nova': case 'aura': play('nova', { vol: s.type === 'aura' ? -4 : 0, prio: 2 }); if (s.type === 'nova') duck(3, 0.1, 0.4); break;
    case 'cone': play('swing_heavy', { vol: -2, semis: 3 }); break;
    case 'line': play('dash', { vol: -3, semis: -2 }); break;
    case 'buff': play('buff_up'); break;
    case 'heal': play('heal'); break;
    case 'summon': play('summon'); break;
    case 'zone': play('zone'); break;
    case 'blink': play('blink'); break;
    case 'chain': play('lightning_bolt', { vol: -3 }); break;
    case 'ground': {
      const delay = s.delay || 0.3;
      if (delay >= 0.5) play('meteor_whistle', { rate: Math.max(0.6, Math.min(2.5, 1.15 / delay)) });
      const r = s.radius || 4;
      later(delay, () => {
        play(el + '_hit', { vol: 2, prio: 2 });
        play(r >= 5 ? 'boom_big' : 'boom_small', { vol: el === 'physical' ? 0 : -2, prio: 2 });
        if (r >= 6) play('rumble_tail', { vol: -3 });
        duck(Math.min(9, 3 + r * 0.8), 0.15, 0.7);
      });
      break;
    }
    case 'rain': {
      const n = Math.min(s.count || 8, 14), dur = s.duration || 2;
      for (let i = 0; i < n; i++) play(el + '_hit', { delay: (i / n) * dur + 0.05, vol: -4, semis: rand(-2, 2), cat: 'elem' });
      for (let i = 0; i < n; i += 3) play('boom_small', { delay: (i / n) * dur + 0.06, vol: -9 });
      break;
    }
    default: break;
  }
}

function onCastStart({ spell: s }) {
  if (!s) return;
  if (s.channel) S.beamEl = s.element || 'void';
  const ct = Math.max(0.08, s.cast || 0.2);
  if (ct >= 0.25) play('charge', { rate: Math.max(0.7, Math.min(2.5, 0.7 / ct)), lp: LP[s.element] || 12000, vol: ct > 0.5 ? 2 : 0 });
}
const LP = { fire: 6000, frost: 16000, lightning: 14000, void: 4000, holy: 16000, rot: 3500, nature: 8000, blood: 3000, water: 7000, sand: 9000, earth: 2500, sound: 12000 };
const BEAM_SEMIS = { fire: -3, frost: 5, lightning: 3, void: -7, holy: 7, rot: -5, nature: 0, blood: -6, water: 2, sand: -1, earth: -9, sound: 4 };

function onAbility({ id, kind, def }) {
  if (!def || kind === 'spell') return;                      // spells are voiced by castStart / spellCast
  const wel = P()?.derived?.weapon?.element;
  const el = def.element || (wel && wel !== 'physical' ? wel : null);
  switch (def.type) {
    case 'dash': play('dash', { prio: 2 }); play('swing_thrust', { delay: 0.05, vol: -2 }); break;
    case 'spin': startLoop('spin', 'spin_loop', { fadeIn: 0.12, semis: el ? -1 : 0 }); play('swing_heavy', { vol: -2 }); break;
    case 'nova': play('swing_heavy', { semis: -3, vol: -2 }); break;                 // wind-up; the slam lands on 'slam'
    case 'leap': play('dash', { semis: -4 }); break;                                 // take-off; landing on 'slam'
    case 'flurry': for (let i = 0; i < Math.min(def.hits || 5, 8); i++) play(i % 2 ? 'swing_light' : 'swing_med', { delay: i * 0.11, semis: i * 0.6, cat: 'ability' }); break;
    case 'volley': {
      const n = Math.min(def.count || 5, 7);
      for (let i = 0; i < n; i++) play('bow_twang', { delay: i * 0.018, semis: rand(-2, 2), vol: -4, cat: 'ability' });
      play('arrow_whiz', { delay: 0.03 }); play('dash', { vol: -9, semis: 5 });
      break;
    }
    case 'shot': play('bow_twang', { vol: 2, semis: -3, prio: 2 }); play('crit_crack', { vol: -6, semis: -4 }); play('arrow_whiz', { vol: 3, semis: -3 }); break;
    case 'barrage': for (let i = 0; i < Math.min(def.count || 5, 6); i++) play('zap_small', { delay: i * 0.06, semis: i * 1.2, cat: 'ability' }); break;
    case 'buff':
      if (id === 'warcry') { play('warcry', { prio: 2 }); duck(5, 0.3, 0.8); }
      else if (def.buff?.frontBlock || def.buff?.shieldPct) { play('block', { semis: -4 }); play('buff_up', { vol: -3 }); }
      else play('buff_up');
      break;
    case 'teleport': play('blink', { semis: -2, prio: 2 }); if (def.dmg) play('void_hit', { delay: 0.25, vol: -3 }); break;
    case 'dashblink': play('blink', { prio: 2 }); break;
    case 'stealth': play('stealth'); break;
    case 'melee':
      play('swing_heavy', { prio: 2 });
      if (def.execute) play('sub_thump', { delay: 0.12, vol: -4 });
      if (def.needs === 'shield') play('block', { delay: 0.08, vol: -2, semis: -3 });
      break;
    case 'flask': play('flask_throw'); break;
    case 'totem': play('totem'); break;
    case 'trap': play('trap_set'); break;
    case 'wall': play('frost_cast'); play('earth_hit', { vol: -2, semis: 4 }); break;
    case 'rain': for (let i = 0; i < 3; i++) play('bow_twang', { delay: i * 0.03, vol: -3, cat: 'ability' }); play('dash', { vol: -6, semis: 3 }); break;
    default: play('dash', { vol: -6 });
  }
  if (el && def.type !== 'wall' && elOk(el)) play(el + '_cast', { vol: -5, delay: 0.02, prio: 1.2 });   // elemental combo layer
}

function onSlam({ src, radius = 4 }) {
  if (!src) return;
  if (src === P()) {
    play('slam', { semis: -Math.max(0, Math.min(4, (radius - 4) * 0.8)), prio: 3 });
    play('sub_thump', { prio: 3 });
    if (radius >= 6) play('rumble_tail', { vol: -4 });
    duck(5, 0.15, 0.7);
  } else play('slam', { vol: src.boss ? 0 : -6, semis: src.boss ? -3 : 0, ...at(src) });
}

// ------------------------------------------------------------------ loops & polling
function startLoop(key, id, o = {}) {
  if (S.loops[key] && !S.loops[key].dead) return;
  S.loops[key] = play(id, { ...o, loop: true });
}
function stopLoop(key, fade = 0.15) { const v = S.loops[key]; if (v) stop(v, fade); S.loops[key] = null; }

// ------------------------------------------------------------------ footsteps
// Contact frames of the walk cycle are 0 and 3 of the actor's 6-frame stride (px/actor.js), so a
// step lands every time the run phase crosses a multiple of 3. The poll runs every 40 ms; each step
// is scheduled at its predicted audio time so the timing stays tight. Mounts: 4-frame gallop.
const F = { idx: -1, ph: 0, t: 0, hoof: { idx: -1, ph: 0, t: 0 }, surf: 'grass', surfT: -9, swimT: 0 };
function surfaceAt(p) {
  const tn = E.ctx.currentTime;
  if (tn - F.surfT < 0.3) return F.surf;
  F.surfT = tn;
  const x = p.pos.x, z = p.pos.z;
  let s = 'grass';
  if (p.wading) s = 'splash';
  else if (G.realm === 'dungeon') s = 'stone';
  else if (G.realm === 'deep') s = roadAt(x, z, 'deep') < 4 ? 'dirt' : 'stone';
  else if (TOWNS.some((t) => Math.hypot(x - t.x, z - t.z) < t.r * 0.9)) s = 'stone';
  else if (roadAt(x, z) < 3.4) s = 'dirt';
  else {
    const b = primaryBiome(x, z);
    s = b === 'wastes' ? (p.pos.y > 13 ? 'stone' : 'sand') : b === 'frost' ? 'snow' : b === 'coast' ? (p.pos.y < 3 ? 'sand' : 'grass') : b === 'maw' ? 'ash' : 'grass';
  }
  return (F.surf = s);
}
function stepAt(p, at) {
  const surf = surfaceAt(p);
  const vol = (p.sprinting ? 2 : 0) + (G.combatTimer > 0 ? -2 : 0);
  play('step_' + surf, { at, vol, semis: p.sprinting ? 1 : 0 });
  if (G.weather?.def?.wet && G.realm === 'surface' && (surf === 'grass' || surf === 'dirt' || surf === 'stone')) play('step_splash', { at, vol: vol - 7, cat: 'misc' });
}
// advance a phase-locked step counter; returns the audio time of a step due before the next poll
function nextStep(st, ph, every, tn) {
  const rate = (ph - st.ph) / Math.max(1e-3, tn - st.t);
  st.ph = ph; st.t = tn;
  const idx = Math.floor(ph / every);
  if (st.idx < 0 || idx - st.idx > 2 || idx < st.idx - 1) st.idx = idx;     // (re)sync
  if (rate <= 0.5) return -1;
  const dtNext = ((st.idx + 1) * every - ph) / rate;
  if (dtNext > 0.055) return -1;
  st.idx += 1;
  return tn + Math.max(0.005, dtNext);
}
function footsteps(p) {
  const m = p.model;
  if (!m || typeof m.ph !== 'number' || G.mode !== 'play') return;
  const tn = E.ctx.currentTime;
  const moving = (p.moveSpeedNow || 0) > 0.5 && !p.dead && p.action?.type !== 'dodge';
  if (m.mount) {
    const h = F.hoof, ph = m.mount.ph || 0;
    if (!moving) { h.ph = ph; h.t = tn; h.idx = Math.floor(ph / 2); return; }
    const when = nextStep(h, ph, 2, tn);
    if (when > 0) play('hoof', { at: when, vol: p.sprinting ? 2 : 0 });
    return;
  }
  if (p.swimming) {
    if (moving && tn - F.swimT > 0.75) { F.swimT = tn; play('swim'); }
    F.idx = -1;
    return;
  }
  if (!moving) { F.ph = m.ph; F.t = tn; F.idx = Math.floor(m.ph / 3); return; }
  const when = nextStep(F, m.ph, 3, tn);
  if (when > 0) stepAt(p, when);
}

export function sfxTick() {
  if (!E.ready) return;
  const p = P();
  if (p) footsteps(p);
  if (S.loops.spin && !p?.st?.spin) stopLoop('spin', 0.18);
  const ch = p && !p.dead && p.action?.type === 'channel';
  if (ch && !S.loops.beam) startLoop('beam', 'beam_loop', { fadeIn: 0.08, semis: BEAM_SEMIS[S.beamEl] || 0, lp: LP[S.beamEl] || 12000 });
  if (!ch && S.loops.beam) stopLoop('beam', 0.12);
  // low-health heartbeat (faster as health drops)
  const frac = p && p.maxHp ? p.hp / p.maxHp : 1;
  if (p && !p.dead && G.mode === 'play' && frac < 0.25) {
    const tn = E.ctx.currentTime;
    if (tn >= S.hbNext) { play('heartbeat', { vol: (0.25 - frac) * 16, lp: 900 }); S.hbNext = tn + 0.6 + Math.max(0, frac) * 2.2; }
  } else S.hbNext = 0;
}

// ------------------------------------------------------------------ UI (global DOM listeners)
const CLICK_SEL = 'button, .interactive, .slot, .eslot, .cell, .skill-card, .fate-card, .shop-row, .qitem, .close-x, [role="button"], select, input[type="checkbox"], input[type="range"], .px-slot';
const HOVER_SEL = 'button, .interactive, .slot, .eslot, .cell, .skill-card, .fate-card, .shop-row, .qitem, .px-slot';
function hookUI() {
  if (typeof document === 'undefined') return;
  let lastHover = null, lastClick = 0;
  document.addEventListener('pointerdown', (e) => {
    const el = e.target?.closest?.(CLICK_SEL);
    if (!el) return;
    lastClick = performance.now();
    if (el.disabled || el.classList.contains('disabled') || el.classList.contains('locked')) { play('denied', { vol: -4 }); return; }
    if (el.closest('.tabs')) play('ui_tab');
    else if (el.classList.contains('close-x')) play('ui_close');
    else if (el.classList.contains('primary')) play('ui_click', { semis: -4, vol: 2 });
    else if (el.matches('.slot, .eslot, .cell, .px-slot')) play('ui_click', { semis: -2, vol: -1 });
    else play('ui_click');
  }, { capture: true, passive: true });
  document.addEventListener('pointerover', (e) => {
    const el = e.target?.closest?.(HOVER_SEL);
    if (!el || el === lastHover) return;
    lastHover = el;
    if (performance.now() - lastClick < 160) return;          // menus re-render under the cursor after a click
    play('ui_hover', { semis: el.matches('.slot, .cell, .eslot') ? 3 : 0 });
  }, { passive: true });
}

// ------------------------------------------------------------------ wiring
export function hookSfxEvents() {
  E.listener = () => P()?.pos;
  const on = (name, fn) => bus.on(name, (d) => { try { fn(d || {}); } catch (e) { /* audio must never break the game */ } });

  on('swing', onSwing);
  on('hit', onHit);
  on('kill', onKill);
  on('shot', onShot);
  on('bowDraw', () => { S.drawV = play('bow_draw'); });
  on('bolt', ({ el }) => { const w = P()?.derived?.weapon?.type; play((elOk(el) ? el : 'void') + '_bolt', { semis: w === 'wand' ? 2 : w === 'staff' ? -1 : 0, prio: 1.2 }); });
  on('castStart', onCastStart);
  on('spellCast', onSpellCast);
  on('abilityUsed', onAbility);
  on('slam', onSlam);
  on('explosion', (d) => {
    const b = { owner: d.owner, radius: d.radius, x: d.x, z: d.z, el: d.element || null };
    S.booms.push(b);
    queueMicrotask(() => { const i = S.booms.indexOf(b); if (i >= 0) S.booms.splice(i, 1); boomNow(b); });
  });
  on('dodge', () => play('dodge', { prio: 2 }));
  on('block', () => play('block', { prio: 2 }));
  on('blockStart', () => play('guard'));
  const parry = () => { const t = E.ctx.currentTime; if (t - S.lastParry < 0.12) return; S.lastParry = t; play('parry', { prio: 4 }); play('sub_thump', { vol: -6 }); duck(5, 0.12, 0.7); };
  on('parry', parry);
  on('parrySound', parry);
  on('weaponSwap', ({ item }) => {
    if (!item) return;
    if (item.kind === 'tome') play('swap_tome');
    else switch (item.type) {
      case 'sword': case 'dagger': case 'spear': play('swap_blade', { semis: item.type === 'dagger' ? 3 : 0 }); break;
      case 'greatsword': case 'halberd': play('swap_blade', { semis: -4 }); play('swap_heavy', { vol: -4 }); break;
      case 'bow': case 'crossbow': play('swap_bow', { semis: item.type === 'crossbow' ? -3 : 0 }); break;
      case 'staff': case 'wand': play('swap_staff', { semis: item.type === 'wand' ? 3 : 0 }); break;
      default: play('swap_heavy');
    }
    if (item.element && elOk(item.element)) play(item.element + '_bolt', { vol: -11, delay: 0.15 });
  });
  on('streak', ({ n }) => {
    if (typeof n !== 'number') return;
    if (n === 0 && S.streak >= 10) play('streak_end', { vol: Math.min(4, S.streak / 25) });   // a big streak just ran out
    S.extStreak = true; S.streak = n;
  });
  on('streakShout', onShout);

  // progression & loot
  on('levelUp', () => { play('levelup', { prio: 5 }); duck(10, 1.0, 1.5); });
  on('rareDrop', (item) => {
    const r = RARITY_IDX[item.rarity] ?? 3;
    S.rareSeen.add(item);
    play('loot_' + Math.min(5, r), { prio: 3 });
    if (r >= 4) duck(8, 1.0, 1.5);
  });
  on('itemGained', (item) => {
    const r = RARITY_IDX[item.rarity] ?? 0;
    if (r >= 3 && S.rareSeen.has(item)) { play('loot_2', { semis: 3 }); play('coin', { vol: -4 }); return; }   // its big sting played at the drop
    play('loot_' + Math.min(5, r), { prio: 1 + r });
    if (r >= 4) duck(8, 1.0, 1.5);
  });
  on('gold', (n) => {
    if (typeof n !== 'number') return;
    if (n < 0) { play('coin', { semis: -5, vol: -3 }); return; }
    const t = E.ctx.currentTime;
    S.coinAcc = t - S.coinT < 0.4 ? S.coinAcc + 1 : 1; S.coinT = t;
    if (n >= 100 || S.coinAcc === 5) play('coin_shower'); else play('coin', { semis: Math.min(5, S.coinAcc - 1) });
  });
  on('material', () => play('mat'));
  on('consumableUsed', (id) => { if (/potion|elixir|tonic/.test(String(id))) play('potion'); else play('mat', { semis: -5 }); });
  on('pickup', (pk) => { if (pk?.kind === 'cons') play('mat', { semis: 4 }); });
  on('signature', () => { play('signature', { prio: 5 }); duck(8, 0.5, 1.2); });
  on('mount', () => play('mount'));
  on('questComplete', () => { play('quest', { prio: 4 }); duck(7, 0.8, 1.2); });
  on('dungeonCleared', () => { play('quest', { prio: 4 }); play('gong', { vol: -4 }); duck(7, 0.8, 1.2); });
  on('tutorialStep', () => play('tut_step'));
  on('tutorialDone', () => { play('quest'); duck(6, 0.6, 1); });
  on('skillLearned', () => { play('buff_up'); play('tut_step', { delay: 0.2 }); });
  on('toast', () => play('toast'));
  on('lowMana', () => play('denied', { semis: 4 }));
  on('lowStamina', () => play('denied', { semis: -2 }));
  on('fastTravelStart', () => { play('travel', { prio: 3 }); duck(5, 0.6, 1); });
  on('purchase', ({ item }) => { play('coin', { semis: -4 }); play('coin', { delay: 0.06, semis: -2, vol: -3 }); if (item) play('loot_' + Math.min(5, RARITY_IDX[item.rarity] ?? 0), { delay: 0.08, vol: -3 }); });
  on('equipped', ({ item, slot }) => {
    if (String(slot).startsWith('loadout')) { if (item) play(item.kind === 'tome' ? 'swap_tome' : 'swap_heavy', { vol: -3 }); return; }
    play('equip', { semis: item ? 0 : -3, vol: item ? 0 : -3 });
  });
  on('kitChanged', () => play('ui_tab', { semis: 3 }));
  on('questStarted', () => play('tut_step', { semis: -2 }));
  on('rivalDefeated', () => { play('quest', { prio: 4 }); duck(6, 0.6, 1); });
  on('bossEngaged', () => { play('roar', { prio: 5 }); play('boom_big', { vol: -2 }); play('gong', { vol: -2, semis: -5 }); duck(10, 1.0, 1.8); });
  on('waystone', () => play('waystone'));
  on('shrineBlessed', () => play('shrine'));
  on('rested', () => play('shrine', { vol: -4, semis: -5 }));
  on('chestOpened', () => play('chest'));
  on('crafted', () => play('anvil'));
  on('upgraded', () => { play('anvil', { semis: 2 }); play('loot_1', { delay: 0.1, vol: -3 }); });
  on('enchanted', () => play('enchant'));
  on('salvaged', () => play('salvage'));
  on('crownShard', () => { play('loot_5'); duck(10, 1.2, 1.5); });

  // world
  on('worldBossAppears', () => { play('roar', { prio: 4 }); play('boom_big', { vol: -4 }); duck(8, 0.8, 1.5); });
  on('bossPhase', () => { play('roar', { prio: 4, semis: -2 }); duck(6, 0.5, 1); });
  on('thunder', ({ dist = 40 }) => { const d = Math.min(3, dist / 40); play('thunder', { delay: d * 0.6, vol: -d * 4, lp: 6000 / (1 + d * 2) }); });
  on('frozen', ({ target }) => play('frost_hit', { vol: -7, semis: -3, ...at(target) }));
  on('callLightning', (d) => play('lightning_hit', { vol: -2, x: d.x, z: d.z }));
  on('thornBurst', (d) => play('nature_hit', { vol: -6, x: d.x, z: d.z }));
  on('stealthBroken', ({ attacked }) => { if (attacked) play('blink', { semis: -5, vol: -4 }); });
  on('spawnAlly', (d) => play('summon_pop', { x: d.x, z: d.z }));
  on('dungeonEnter', () => play('dungeon_door'));
  on('dungeonExit', () => play('dungeon_door', { semis: 2 }));
  on('mazeShift', () => { play('dungeon_door', { semis: -3 }); play('rumble_tail'); });
  on('bannerShown', () => play('gong', { vol: -10 }));
  on('diceClack', ({ strength = 0.6 }) => play('dice', { vol: -10 + strength * 10 }));
  on('diceRoll', () => { for (let i = 0; i < 3; i++) play('dice', { delay: i * 0.05, vol: -2 }); });
  on('diceSettle', () => play('dice', { vol: -6, semis: -3 }));
  on('rareFate', () => { play('shrine'); play('loot_3', { delay: 0.2 }); });
  on('fateSealed', () => play('quest'));
  on('onBeat', () => play('beat'));
  on('menuOpen', () => play('ui_open'));
  on('menuClose', () => play('ui_close'));
  on('dialogueOpen', () => play('ui_open', { semis: -3 }));
  hookUI();
}
