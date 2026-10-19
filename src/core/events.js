// Tiny pub/sub so systems (quests, audio, UI) can react to gameplay without importing each other.
const handlers = new Map();

export const bus = {
  // set while a co-op partner's actions replay on this screen: their swings and spells must not
  // feed this player's quests, combos, sounds or HUD
  muted: 0,
  on(evt, fn) {
    if (!handlers.has(evt)) handlers.set(evt, new Set());
    handlers.get(evt).add(fn);
    return () => handlers.get(evt).delete(fn);
  },
  emit(evt, data) {
    if (bus.muted) return;
    const set = handlers.get(evt);
    if (set) for (const fn of [...set]) fn(data);
  },
};

// run fn with this player's event hooks muted when `ghost` is a partner's stand-in (or their summon)
export function asGhost(ghost, fn) {
  if (!ghost) return fn();
  const prev = bus.muted;
  bus.muted = 1;
  try { return fn(); } finally { bus.muted = prev; }
}
