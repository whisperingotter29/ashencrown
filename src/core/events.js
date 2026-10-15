// Tiny pub/sub so systems (quests, audio, UI) can react to gameplay without importing each other.
const handlers = new Map();

export const bus = {
  on(evt, fn) {
    if (!handlers.has(evt)) handlers.set(evt, new Set());
    handlers.get(evt).add(fn);
    return () => handlers.get(evt).delete(fn);
  },
  emit(evt, data) {
    const set = handlers.get(evt);
    if (set) for (const fn of [...set]) fn(data);
  },
};
