// Kill streaks: each kill within a few seconds of the last keeps the streak alive. The streak adds
// bonus XP (up to double at 100), drives the HUD combo counter and kill sounds ('streak' event),
// and scales the kill effects. Big round numbers get a shout.
import { G } from '../game.js';
import { bus } from '../core/events.js';
import { magicOn } from '../render/magic.js';
import { killFx } from '../render/spellfx.js';
import { floatText } from '../render/vfx.js';
import { R } from '../render/renderer.js';
import { addShake } from '../world/cameraRig.js';

export const STREAK_WINDOW = 4.5;
const SHOUTS = { 10: 'KILLING SPREE', 25: 'RAMPAGE', 50: 'UNSTOPPABLE', 100: 'GODLIKE', 200: 'ASHEN TEMPEST', 350: 'CROWNBREAKER', 500: 'LEGEND OF THE ASH' };

G.streak = { n: 0, t: 0, best: 0 };

export function streakXpMult() { return 1 + Math.min(1, G.streak.n / 100); }

function reset() {
  if (G.streak.n) { G.streak.n = 0; G.streak.t = 0; bus.emit('streak', { n: 0 }); }
}

export function initStreak() {
  bus.on('kill', ({ victim, killer }) => {
    if (victim.isPlayer) { reset(); return; }
    const p = G.player;
    if (!p || victim.team !== 'enemy' || victim.isNpc) return;
    if (!(killer === p || killer?.owner === p)) return;
    const s = G.streak;
    s.n++; s.t = STREAK_WINDOW; s.best = Math.max(s.best, s.n);
    bus.emit('streak', { n: s.n });
    if (magicOn()) killFx(victim, s.n);
    const shout = SHOUTS[s.n];
    if (shout) {
      floatText(p.pos.x, p.pos.y + 3.2, p.pos.z, shout, { color: s.n >= 100 ? '#ff6040' : '#ffd040', force: true, crit: true, life: 1.6, vy: 1.6 });
      R.white = Math.max(R.white, 0.18);
      addShake(0.35 * (G.settings.screenShake ?? 1));
      bus.emit('streakShout', { n: s.n, name: shout });
    }
  });
  bus.on('playerDied', reset);
}

export function updateStreak(dt) {
  const s = G.streak;
  if (s.n > 0) { s.t -= dt; if (s.t <= 0) reset(); }
}
