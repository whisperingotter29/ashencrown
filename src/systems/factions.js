// Faction reputation and the bounty (crime) system.
import { G } from '../game.js';
import { bus } from '../core/events.js';
import { FACTIONS, TOWNS, DEEP_TOWNS } from '../data/world.js';
import { floatText } from '../render/vfx.js';

export const REP_TIERS = [
  { min: -99999, name: 'Hated' }, { min: -500, name: 'Hostile' }, { min: 0, name: 'Neutral' }, { min: 250, name: 'Friendly' },
  { min: 600, name: 'Honored' }, { min: 1200, name: 'Revered' }, { min: 2400, name: 'Exalted' },
];
export function repTier(v) { let t = REP_TIERS[0]; for (const x of REP_TIERS) if (v >= x.min) t = x; return t; }

export function addRep(f, v) {
  const c = G.char;
  const before = repTier(c.rep[f] || 0).name;
  c.rep[f] = (c.rep[f] || 0) + v;
  const after = repTier(c.rep[f]).name;
  bus.emit('rep', { faction: f, amount: v, tier: after, changed: before !== after });
}

// Region authority for a position: nearest town's faction (or the town itself)
export function authorityAt(x, z) {
  let best = null, bd = 1e9;
  for (const t of G.realm === 'deep' ? DEEP_TOWNS : TOWNS) {
    const d = Math.hypot(t.x - x, t.z - z);
    if (d < bd) { bd = d; best = t; }
  }
  if (!best || bd > best.r + 60) return null;
  return best.faction || best.id;
}

export function bountyAt(key) { return G.char.bounty[key] || 0; }

export function addBounty(key, amount, reason) {
  if (!key) return;
  const c = G.char;
  c.bounty[key] = (c.bounty[key] || 0) + amount;
  bus.emit('bounty', { key, amount, total: c.bounty[key], reason });
  if (FACTIONS[key]) addRep(key, -Math.round(amount / 4));
}

export function payBounty(key) {
  const c = G.char;
  const b = c.bounty[key] || 0;
  if (!b) return true;
  if (c.gold < b) { bus.emit('toast', `You need ${b} gold to clear your bounty.`); return false; }
  c.gold -= b;
  c.bounty[key] = 0;
  for (const e of G.entities) if (e.isNpc && e.role === 'guard') { e.hunting = false; e.provoked = false; }
  bus.emit('bountyPaid', { key, amount: b });
  return true;
}

export function initFactions() {
  bus.on('crime', ({ type, target }) => {
    const p = G.player;
    if (!p) return;
    const key = authorityAt(target.pos.x, target.pos.z) || authorityAt(p.pos.x, p.pos.z);
    const amount = type === 'murder' ? 1000 : type === 'theft' ? 120 : 250;
    addBounty(key, amount, type);
    floatText(p.pos.x, p.pos.y + 3, p.pos.z, type === 'murder' ? 'MURDER! Bounty +1000' : `Crime! Bounty +${amount}`, { color: '#ff4030', force: true, crit: true });
    // nearby guards respond
    for (const e of G.entities) if (e.isNpc && e.role === 'guard' && !e.dead && Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < 50) { e.hunting = true; }
    // the victim's neighbours flee or fight
    for (const e of G.entities) if (e.isNpc && e !== target && Math.hypot(e.pos.x - target.pos.x, e.pos.z - target.pos.z) < 12) e.provoked = e.role === 'guard';
  });
}

export function guardsShouldArrest(key) {
  return bountyAt(key) > 0;
}
