// Small world-effect sprites: earth spikes, totems, ice shards (summoned by abilities).
import { Pix, C, light, dark, mixc } from '../pix.js';

const cache = new Map();
const memo = (k, f) => { let s = cache.get(k); if (!s) { s = f(); cache.set(k, s); } return s; };
function mk(w, h) { const p = new Pix(w, h); p.ox = Math.floor(w / 2); p.oy = h - 1; return p; }

export function spikeSprite(color = '#7a6048', glow = null) {
  return memo('spike' + color + glow, () => {
    const p = mk(11, 22), e = mk(11, 22), c = C(color);
    for (let y = 0; y < 21; y++) {
      const w = Math.max(0, Math.round((y / 20) * 4.5));
      for (let x = -w; x <= w; x++) p.set(5 + x, y, x < -w / 3 ? light(c, 1.25) : x > w / 3 ? dark(c, 0.68) : c);
    }
    p.line(5, 2, 3, 19, light(c, 1.45));
    if (glow) for (let y = 6; y < 20; y += 3) { p.set(6, y, glow); e.set(6, y, glow); }
    p.outline();
    return { pix: p, emis: glow ? e : null };
  });
}
export function totemSprite() {
  return memo('totem', () => {
    const p = mk(11, 26), e = mk(11, 26), wood = C('#6a4a30');
    p.rect(3, 8, 5, 17, wood); p.rect(3, 8, 1, 17, light(wood, 1.2)); p.rect(7, 8, 1, 17, dark(wood, 0.7));
    for (const y of [11, 16, 21]) { p.rect(3, y, 5, 1, dark(wood, 0.6)); p.set(4, y - 2, '#1a1010'); p.set(6, y - 2, '#1a1010'); }
    p.disc(5.5, 4.5, 4, '#60c040'); p.disc(4.5, 3.5, 2, '#a0ff70');
    e.disc(5.5, 4.5, 2.5, '#80ff60');
    p.outline();
    return { pix: p, emis: e };
  });
}
export function iceSprite(h = 20) {
  return memo('ice' + h, () => {
    const p = mk(11, h + 2), e = mk(11, h + 2), c = C('#a8e0ff');
    p.poly([[5.5, 0], [10, h * 0.35], [8.5, h], [2.5, h], [1, h * 0.35]], mixc(c, '#ffffff', 0.15));
    p.poly([[5.5, 0], [1, h * 0.35], [2.5, h], [5.5, h]], light(c, 1.15));
    p.line(5, 1, 5, h - 1, '#ffffff');
    e.line(5, 2, 5, h - 2, '#c0f0ff');
    p.outline(C('#2a4a6a'));
    return { pix: p, emis: e };
  });
}
