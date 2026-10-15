// Game feel ("haptics"): every impact moves something. Camera kicks toward what you hit and away
// from what hits you, recoil on shots, HUD jolts and a red edge when you take damage, slow-mo on
// boss kills, a heartbeat at low health, and controller rumble (or phone vibration) to match.
import { G } from '../game.js';
import { bus } from './events.js';
import { R } from '../render/renderer.js';
import { cam, kick, addShake } from '../world/cameraRig.js';
import { postKick } from '../render/post.js';
import { keyForAbility } from '../systems/loadout.js';

// ---------------------------------------------------------------- rumble
let lastRumble = 0, lastStrength = 0;
const touch = typeof window !== 'undefined' && 'ontouchstart' in window;
export function rumble(strong, weak, ms) {
  if (G.settings.vibration === false) return;
  const now = performance.now();
  const str = Math.max(strong, weak);
  // don't let a flurry of small hits drown out a big one
  if (now - lastRumble < 45 && str <= lastStrength) return;
  lastRumble = now; lastStrength = str;
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of pads) {
    const act = gp && gp.vibrationActuator;
    if (!act || !act.playEffect) continue;
    try { act.playEffect('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) }).catch(() => {}); } catch (e) { /* unsupported */ }
  }
  if (touch && navigator.vibrate) try { navigator.vibrate(Math.round(ms * (0.4 + str * 0.6))); } catch (e) { /* blocked */ }
}

// ---------------------------------------------------------------- HUD jolts
function hudJolt() {
  const hud = document.getElementById('hud');
  if (!hud) return;
  hud.classList.remove('hurt-shake');
  void hud.offsetWidth;
  hud.classList.add('hurt-shake');
}
export function slotFired(key) {
  const s = document.querySelector(`#hud [data-ability-key="${key}"]`);
  if (!s) return;
  s.classList.remove('fired'); void s.offsetWidth; s.classList.add('fired');
}

// ---------------------------------------------------------------- per-frame
let beatT = 0;
// strongest player hit this frame (AoE swings hit many things at once; feel the best one)
let pendingHit = null;
export function updateFeel(dt) {
  cam.shakeScale = G.settings.screenShake ?? 1;
  R.damage = Math.max(0, R.damage - dt * 1.6);
  if (pendingHit) {
    const h = pendingHit; pendingHit = null;
    kick(h.dx, h.dz, h.big ? 3 : 1.5);
    if (h.big) rumble(0.55, 0.35, 90); else rumble(0.12, 0.32, 45);
  }
  // low-health heartbeat: lub-dub every second
  const p = G.player;
  const orb = document.querySelector('.orb.hp');
  const low = p && !p.dead && G.mode === 'play' && p.hp / p.maxHp < 0.25;
  if (orb) orb.classList.toggle('pulse', !!low);
  if (low) {
    beatT -= dt;
    if (beatT <= 0) {
      beatT = 1.0;
      rumble(0.3, 0, 70);
      setTimeout(() => rumble(0.18, 0, 60), 170);
      R.damage = Math.max(R.damage, 0.35);
    }
  } else beatT = 0;
}

// ---------------------------------------------------------------- events
export function initFeel() {
  bus.on('hit', ({ src, tgt, dmg, crit, kind, heavy }) => {
    if (src?.isPlayer && !tgt.isPlayer) {
      const big = crit || heavy;
      const dx = tgt.pos.x - src.pos.x, dz = tgt.pos.z - src.pos.z;
      if (kind === 'dot' || kind === 'hazard') return;
      if (!pendingHit || (big && !pendingHit.big)) pendingHit = { dx, dz, big: big || false };
      if (crit) postKick({ punch: 0.35, aberr: 0.25 });
    }
  });
  bus.on('playerHit', ({ amount, src }) => {
    const p = G.player;
    if (!p) return;
    const frac = amount / Math.max(1, p.maxHp);
    if (src && src !== p) kick(p.pos.x - src.pos.x, p.pos.z - src.pos.z, 2.5 + Math.min(4, frac * 30));
    R.damage = Math.min(1, Math.max(R.damage, 0.3 + frac * 3));
    postKick({ roll: (Math.random() < 0.5 ? -1 : 1) * Math.min(0.5, 0.15 + frac * 3), aberr: Math.min(1, 0.3 + frac * 6) });
    hudJolt();
    rumble(Math.min(1, 0.45 + frac * 4), 0.5, 120 + Math.min(200, frac * 1500));
  });
  bus.on('block', ({ player: p, attacker }) => {
    if (attacker) kick(p.pos.x - attacker.pos.x, p.pos.z - attacker.pos.z, 1.5);
    rumble(0.35, 0.2, 55);
  });
  bus.on('parry', ({ player: p, attacker }) => {
    if (attacker) kick(attacker.pos.x - p.pos.x, attacker.pos.z - p.pos.z, 3);
    R.white = Math.max(R.white, 0.22);
    rumble(0.8, 0.4, 110);
  });
  bus.on('dodge', ({ player: p }) => {
    const a = p.action?.dir ?? p.facing;
    kick(-Math.sin(a), -Math.cos(a), 1.5);       // the camera lags a beat behind the roll
    rumble(0, 0.22, 40);
  });
  bus.on('shot', ({ draw, crit }) => {
    const p = G.player;
    const a = p.facing;
    kick(-Math.sin(a), -Math.cos(a), draw >= 1 ? 2 : 1);   // recoil
    rumble(draw >= 1 ? 0.25 : 0, 0.2, 35);
  });
  bus.on('bolt', () => { const a = G.player.facing; kick(-Math.sin(a), -Math.cos(a), 0.8); rumble(0, 0.15, 30); });
  bus.on('abilityUsed', ({ id }) => {
    const p = G.player;
    const a = Math.atan2(p.aim.x - p.pos.x, p.aim.z - p.pos.z);
    kick(Math.sin(a), Math.cos(a), 1);
    rumble(0.15, 0.3, 50);
    const k = keyForAbility(id);
    if (k) slotFired(k);
  });
  bus.on('kill', ({ victim, killer }) => {
    if (victim.isPlayer) { rumble(1, 1, 600); addShake(0.6); return; }
    if (!killer?.isPlayer && killer?.owner !== G.player) return;
    if (victim.boss) {
      postKick({ roll: 0.45, punch: 1, aberr: 1 });
      G.slowmo = Math.max(G.slowmo || 0, 0.9);
      addShake(0.9 * (G.settings.screenShake ?? 1));
      R.white = Math.max(R.white, 0.35);
      rumble(1, 1, 700);
    } else if (victim.elite) { addShake(0.3 * (G.settings.screenShake ?? 1)); rumble(0.6, 0.5, 160); postKick({ roll: (Math.random() < 0.5 ? -1 : 1) * 0.3, punch: 0.7, aberr: 0.5 }); }
    else rumble(0.25, 0.3, 60);
  });
  bus.on('tutorialStep', () => rumble(0.1, 0.4, 80));
  bus.on('tutorialDone', () => rumble(0.3, 0.6, 300));
  bus.on('levelUp', () => { addShake(0.25 * (G.settings.screenShake ?? 1)); rumble(0.3, 0.7, 420); postKick({ punch: 1, aberr: 0.4 }); });
  bus.on('explosion', ({ owner, radius }) => { if (owner?.isPlayer) { rumble(Math.min(1, 0.4 + radius * 0.1), 0.4, 130); postKick({ punch: Math.min(1, 0.2 + radius * 0.1), aberr: Math.min(0.8, radius * 0.12), roll: (Math.random() - 0.5) * 0.3 }); } });
  bus.on('streakShout', () => postKick({ punch: 1, aberr: 0.7, roll: (Math.random() < 0.5 ? -1 : 1) * 0.25 }));
  bus.on('parry', () => postKick({ punch: 0.8, aberr: 0.6 }));
  bus.on('slam', ({ src }) => {
    const p = G.player;
    if (!p) return;
    const d = Math.hypot(src.pos.x - p.pos.x, src.pos.z - p.pos.z);
    if (src === p) { rumble(0.7, 0.5, 140); return; }
    if (d < 14) { rumble(Math.max(0.15, 0.7 - d / 20), 0.3, 120); kick(0, 1, Math.max(0.5, 3 - d / 5)); }
  });
}
