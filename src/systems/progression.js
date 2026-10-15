// XP, levels, kills, death and respawn.
import { G } from '../game.js';
import { bus } from '../core/events.js';
import { xpToNext, MAX_LEVEL } from './stats.js';
import { dropFromEnemy } from './loot.js';
import { burst, ring, floatText, pillar } from '../render/vfx.js';
import { addGold } from './inventory.js';

export const STAT_POINTS_PER_LEVEL = 3;

export function gainXp(amount, silent = false) {
  const c = G.char;
  if (c.level >= MAX_LEVEL) return;
  const mult = 1 + (G.player?.derived.xpPct || 0) / 100;
  amount = Math.round(amount * mult);
  c.xp += amount;
  if (!silent && G.player) floatText(G.player.pos.x, G.player.pos.y + 2.8, G.player.pos.z, `+${amount} xp`, { color: '#c0a0ff', force: true, life: 1.2 });
  while (c.level < MAX_LEVEL && c.xp >= xpToNext(c.level)) {
    c.xp -= xpToNext(c.level);
    c.level++;
    c.statPoints += STAT_POINTS_PER_LEVEL;
    onLevelUp(c.level);
  }
  bus.emit('xp', amount);
}

function onLevelUp(level) {
  const p = G.player;
  if (p) {
    p.refreshStats();
    p.hp = p.maxHp; p.mana = p.maxMana; p.stamina = p.maxStamina;
    pillar(p.pos.x, p.pos.y, p.pos.z, { radius: 1.6, height: 22, color: '#ffd870', dur: 1.2 });
    ring(p.pos.x, p.pos.y, p.pos.z, { radius: 8, color: '#ffd870', dur: 0.9 });
    burst(p.pos.x, p.pos.y + 1, p.pos.z, { count: 80, speed: 7, color: '#fff0c0', color2: '#ffb030', life: 1.5, up: 1.3, gravity: 2 });
  }
  bus.emit('levelUp', level);
}

export function initProgression() {
  bus.on('kill', ({ victim, killer }) => {
    if (victim.isPlayer) return;
    if (victim.team === 'enemy') {
      G.char.kills++;
      const p = G.player;
      // XP: reduced for trivial foes, bonus for dangerous ones
      const diff = victim.level - G.char.level;
      const scale = diff < -6 ? Math.max(0.1, 1 + (diff + 6) * 0.12) : diff > 2 ? 1 + Math.min(1, (diff - 2) * 0.1) : 1;
      if (victim.xp) gainXp(victim.xp * scale);
      dropFromEnemy(victim);
      if (victim.boss) {
        G.char.bossesSlain.push(victim.tplId);
        bus.emit('bossSlain', victim);
      }
    }
  });
  bus.on('weatherHurt', ({ amount, reason }) => {
    const p = G.player;
    if (!p || p.dead) return;
    p.hp -= p.maxHp * amount;
    p.lastCombatT = G.time - 3;
    floatText(p.pos.x, p.pos.y + 2, p.pos.z, '-' + Math.round(p.maxHp * amount), { color: '#ff4060' });
    if (!G._stormWarned || G.time - G._stormWarned > 20) { G._stormWarned = G.time; bus.emit('toast', reason); }
    if (p.hp <= 0) { p.hp = 0; p.dead = true; p.deathT = 0; bus.emit('kill', { victim: p, killer: null }); }
  });
  bus.on('weatherChill', () => { const p = G.player; if (p && !p.dead) p.status.chill = Math.max(p.status.chill || 0, 1.2); });
}
