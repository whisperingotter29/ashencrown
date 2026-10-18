// Small world-effect sprites: earth spikes, totems, ice shards (summoned by abilities).
// Drawn natively at the art-pixel density (16 px per world unit).
import { Pix, C, ART, light, dark, mixc, hash2 } from '../pix.js';

const cache = new Map();
const memo = (k, f) => { let s = cache.get(k); if (!s) { s = f(); cache.set(k, s); } return s; };
function mk(w, h) { const p = new Pix(w, h); p.ox = Math.floor(w / 2); p.oy = h - 1; return p; }
const WHITE = [255, 255, 255, 255];

// jagged rock spike: three faces (lit left, mid, shadow right), strata, chipped edges, rubble at
// the foot; `glow` adds molten / runic cracks down the middle (also on the emissive layer)
export function spikeSprite(color = '#7a6048', glow = null) {
  return memo('spike' + color + glow, () => {
    const W = 17, H = 35, p = mk(W, H), e = mk(W, H), c = C(color);
    const hi2 = light(c, 1.45), hi = light(c, 1.2), lo = dark(c, 0.7), lo2 = dark(c, 0.52), cx = 8;
    const top = 1, base = H - 3;
    for (let y = top; y <= base; y++) {
      const t = (y - top) / (base - top);
      const hw = Math.pow(t, 0.85) * 7 + 0.4;
      const jl = hash2(y, 1, 7) < 0.25 ? 1 : 0, jr = hash2(y, 2, 7) < 0.25 ? 1 : 0;   // chipped edges
      for (let x = Math.round(cx - hw) + jl; x <= Math.round(cx + hw) - jr; x++) {
        const rx = (x - cx) / Math.max(1, hw);
        let col = rx < -0.38 ? hi : rx > 0.4 ? lo : c;
        if (rx > 0.75) col = lo2;
        if ((y + Math.round(rx * 2)) % 7 === 0 && hash2(x, y, 3) < 0.7) col = rx < -0.38 ? c : lo;   // strata
        p.set(x, y, col);
      }
    }
    // lit ridge from the tip down the left face
    for (let y = top + 1; y < base - 2; y++) { const t = (y - top) / (base - top), x = Math.round(cx - Math.pow(t, 0.85) * 7 * 0.45); p.set(x, y, hi2); }
    p.set(cx, top, hi2);
    // rubble at the foot
    for (const [x, y, r] of [[2.5, H - 2.5, 2], [14.5, H - 2.2, 1.8], [5.5, H - 1.5, 1.2], [11.5, H - 1.5, 1.4]]) { p.ellipse(x, y, r, r * 0.8, lo); p.set(Math.floor(x - r * 0.4), Math.floor(y - r * 0.5), hi); }
    if (glow) {
      const g = C(glow), gh = light(g, 1.4);
      let x = cx;
      for (let y = 8; y < base - 1; y++) {
        if (hash2(y, 9, 1) < 0.3) x += hash2(y, 4, 2) < 0.5 ? -1 : 1;
        x = Math.max(cx - 2, Math.min(cx + 2, x));
        if (y % 6 === 5) continue;
        const cc = y % 6 === 2 ? gh : g;
        p.set(x, y, cc); e.set(x, y, cc);
      }
    }
    p.outline();
    return { pix: p, emis: glow ? e : null };
  });
}

// carved wooden totem with three faces and a glowing green orb on top
export function totemSprite() {
  return memo('totem', () => {
    const W = 17, H = 42, p = mk(W, H), e = mk(W, H), wood = C('#6a4a30');
    const wh = light(wood, 1.22), wl = dark(wood, 0.7), wl2 = dark(wood, 0.5), ink = C('#1a1010');
    const x0 = 5, x1 = 11;
    for (let y = 13; y < H; y++) for (let x = x0; x <= x1; x++) p.set(x, y, x === x0 ? wh : x === x1 ? wl2 : x === x1 - 1 ? wl : (x + y * 3) % 11 === 0 ? wl : wood);
    // carved faces: brow ridge, eyes, mouth
    for (const y of [17, 26, 35]) {
      for (let x = x0; x <= x1; x++) { p.set(x, y - 2, wh); p.set(x, y + 4, wl2); }
      p.set(x0 + 1, y, ink); p.set(x0 + 2, y, ink); p.set(x1 - 2, y, ink); p.set(x1 - 1, y, ink);
      p.set(x0 + 1, y - 1, wl); p.set(x1 - 1, y - 1, wl);
      for (let x = x0 + 2; x <= x1 - 2; x++) p.set(x, y + 2, ink);
      p.set(x0 + 3, y + 3, wl);
    }
    // side pegs with a feather each
    p.rect(2, 21, 3, 2, wood); p.set(2, 21, wh); p.rect(12, 30, 3, 2, wl);
    p.line(1, 23, 1, 27, C('#d0c0a0')); p.line(15, 32, 15, 36, C('#c04030'));
    // orb
    const g = C('#60c040'), gh = C('#a0ff70'), gh2 = C('#e0ffc0'), gl = dark(g, 0.65);
    p.disc(8.5, 7, 6.2, gl); p.disc(8.5, 7, 5.4, g); p.disc(7.4, 5.8, 3.3, gh); p.disc(6.6, 4.8, 1.4, gh2); p.set(6, 4, WHITE);
    p.rect(6, 12, 5, 2, wl);
    e.disc(8.5, 7, 4.2, C('#80ff60')); e.disc(7.4, 5.8, 2.2, gh2); e.set(6, 4, WHITE);
    p.outline();
    return { pix: p, emis: e };
  });
}

// ice shard; h is the height in design pixels (callers pass 16-22), drawn at h * ART
export function iceSprite(h = 20) {
  return memo('ice' + h, () => {
    const H = Math.round(h * ART), W = 17, p = mk(W, H + 2), e = mk(W, H + 2), c = C('#a8e0ff');
    const body = mixc(c, '#ffffff', 0.12), lit = light(c, 1.18), deep = dark(c, 0.78), deep2 = mixc(c, '#3a70b0', 0.5);
    const tipY = 0, shY = H * 0.35;
    p.poly([[8.5, tipY], [16, shY], [13.5, H], [3.5, H], [1.5, shY]], body);
    p.poly([[8.5, tipY], [1.5, shY], [3.5, H], [8.5, H]], lit);                    // lit left facet
    p.poly([[8.5, tipY], [16, shY], [13.5, H], [11, H]], deep);                    // shadow facet
    p.poly([[16, shY], [13.5, H], [12.4, H], [14.6, shY + 2]], deep2);
    // inner fractures and the bright spine
    p.line(8, 1, 8, H - 1, WHITE);
    p.line(4, Math.round(shY) + 2, 7, Math.round(H * 0.7), mixc(c, '#ffffff', 0.55));
    p.line(12, Math.round(shY) + 3, 10, Math.round(H * 0.8), mixc(c, '#ffffff', 0.35));
    p.set(5, Math.round(shY) - 2, WHITE); p.set(3, Math.round(shY) + 1, WHITE);
    for (let x = 4; x < 14; x++) if (p.a(x, H - 1)) p.set(x, H - 1, deep);              // frosted foot
    e.line(8, 2, 8, H - 2, C('#c0f0ff')); e.set(5, Math.round(shY) - 2, WHITE);
    p.outline(C('#2a4a6a'));
    return { pix: p, emis: e };
  });
}
