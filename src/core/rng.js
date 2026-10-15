// Seeded randomness. Everything in the world that must look the same on every
// visit (prop scatter, dungeon layouts, loot rolls from fixed chests) draws from these.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Integer hash of up to three ints -> uint32
export function hash3(x, y = 0, z = 0) {
  let h = 2166136261 ^ Math.imul(x | 0, 374761393);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h ^= Math.imul(z | 0, 3266489917);
  h = Math.imul(h ^ (h >>> 16), 2654435761);
  return (h ^ (h >>> 13)) >>> 0;
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class RNG {
  constructor(seed = 1) { this.next = mulberry32(seed); }
  f() { return this.next(); }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
  weighted(entries) { // [{w, v}] or [[v,w]]
    let total = 0;
    for (const e of entries) total += Array.isArray(e) ? e[1] : e.w;
    let r = this.next() * total;
    for (const e of entries) {
      const w = Array.isArray(e) ? e[1] : e.w;
      if ((r -= w) <= 0) return Array.isArray(e) ? e[0] : e.v;
    }
    const last = entries[entries.length - 1];
    return Array.isArray(last) ? last[0] : last.v;
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

// Unseeded convenience for moment-to-moment combat jitter
export const rand = (a = 0, b = 1) => a + (b - a) * Math.random();
export const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p) => Math.random() < p;
