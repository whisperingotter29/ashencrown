// Visual effects for the pixel renderer. Crisp effects (particles, slash smears, hit sparks,
// rings, telegraphs, zones) are rasterised pixel-by-pixel into low-res layers; magic gets soft
// additive glows, beams and lightning on the full-resolution layer on top.
//   decal layer  : under sprites, lit (telegraph fills, zones)
//   lit layer    : over sprites, lit (dust, blood, debris)
//   glow layer   : over everything, unlit (sparks, magic particles, smears, outlines)
import { R, requestLight, glowPx, rgbStr } from './renderer.js';
import { scene } from '../px/scene.js';
import { view } from '../px/view.js';
import { PPU, C, bayer, Pix, light, dark } from '../px/pix.js';
import { ammoSprite } from '../px/sprites/weapons.js';
import { drawText, textWidth, FONT_H } from '../px/font.js';
import { G } from '../game.js';

const MAX = 2600;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (t) => 1 - (1 - t) * (1 - t) * (1 - t);

// ------------------------------------------------------------------ pixel layers
class Layer {
  constructor() { this.cv = null; this.w = 0; this.h = 0; this.d = null; this.used = false; }
  begin() {
    const w = view.W, h = view.H;
    if (!this.cv) { this.cv = document.createElement('canvas'); this.ctx = this.cv.getContext('2d'); }
    if (w !== this.w || h !== this.h) {
      this.w = this.cv.width = w; this.h = this.cv.height = h;
      this.img = this.ctx.createImageData(w, h); this.d = this.img.data; this.d32 = new Uint32Array(this.d.buffer);
    } else if (this.used) this.d32.fill(0);
    this.used = false;
  }
  // alpha-blended pixel write (a: 0..1)
  px(x, y, c, a = 1) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0.02) return;
    const i = (y * this.w + x) * 4, d = this.d;
    this.used = true;
    const da = d[i + 3] / 255;
    if (a >= 1 || da === 0) { d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = Math.max(d[i + 3], a * 255); return; }
    const oa = a + da * (1 - a);
    d[i] = (c[0] * a + d[i] * da * (1 - a)) / oa; d[i + 1] = (c[1] * a + d[i + 1] * da * (1 - a)) / oa; d[i + 2] = (c[2] * a + d[i + 2] * da * (1 - a)) / oa; d[i + 3] = oa * 255;
  }
  rect(x, y, w, h, c, a) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c, a); }
  flush(ctx) { if (!this.used) return; this.ctx.putImageData(this.img, 0, 0); ctx.drawImage(this.cv, 0, 0); }
}
const L = { decal: new Layer(), lit: new Layer(), glow: new Layer() };

export const vfx = {
  fx: [],            // { t, update(fx, dt) -> bool, decal?(L), lit?(L), glowPx?(L), glow?(ctx), draw?(ctx) }
  numbers: [],
  flashes: [],
  parts: [],
  layers: L,
};

export function initVfx() {
  // persistent render hooks (run every frame, even while paused)
  scene.persist.decals.push((ctx) => { L.decal.begin(); for (const f of vfx.fx) if (f.decal) f.decal(L.decal); L.decal.flush(ctx); });
  scene.persist.pixels.push((ctx) => { L.lit.begin(); drawParticles(L.lit, false); for (const f of vfx.fx) if (f.lit) f.lit(L.lit); L.lit.flush(ctx); });
  scene.persist.emissives.push((ctx) => { L.glow.begin(); drawParticles(L.glow, true); for (const f of vfx.fx) if (f.glowPx) f.glowPx(L.glow); drawNumbers(L.glow); L.glow.flush(ctx); });
  scene.persist.glows.push((ctx) => { glowParticles(ctx); for (const f of vfx.fx) if (f.glow) f.glow(ctx); });
}
export function addFx(f) { f.t = f.t || 0; vfx.fx.push(f); return f; }

// world -> low-res px helpers (h = height above the ground at that point)
const PX = (x) => x * PPU - view.x0;
const PY = (z, h) => z * PPU - view.y0 - h * PPU;
const ground = (x, z) => view.ground(x, z);

// ================================================================== particles
const cc = new Map();
const col = (c) => { if (Array.isArray(c)) return c; let v = cc.get(c); if (!v) { v = C(c); cc.set(c, v); } return v; };

export function particle(o) {
  if (vfx.parts.length >= MAX) vfx.parts.shift();
  const gy = ground(o.x, o.z);
  vfx.parts.push({
    x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, gy,
    life: o.life || 1, age: 0, size: o.size || 0.4, size1: o.size1 ?? (o.size || 0.4) * 0.3,
    c0: col(o.color || '#ffffff'), c1: o.color2 ? col(o.color2) : null,
    g: o.gravity ?? 0, drag: o.drag ?? 1.5, a0: o.alpha ?? 1, add: o.additive !== false,
    wobble: o.wobble || 0, seed: Math.random() * 100, floor: o.floor, halo: o.additive !== false && (o.size || 0.4) >= 0.3 && Math.random() < 0.5,
  });
}

export function burst(x, y, z, o = {}) {
  const n = o.count || 20;
  const sp = o.speed || 6;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const e = (o.up ?? 0.5) + (Math.random() - 0.5) * (o.spread ?? 1.2);
    const s = sp * (0.35 + Math.random() * 0.75);
    let vx = Math.cos(a) * Math.cos(e) * s, vy = Math.sin(e) * s, vz = Math.sin(a) * Math.cos(e) * s;
    if (o.dir) { vx = o.dir.x * s + vx * (o.cone ?? 0.4); vz = o.dir.z * s + vz * (o.cone ?? 0.4); vy = (o.dir.y || 0) * s + vy * (o.cone ?? 0.4); }
    particle({
      x: x + (Math.random() - 0.5) * (o.jitter || 0.3), y: y + (Math.random() - 0.5) * (o.jitter || 0.3), z: z + (Math.random() - 0.5) * (o.jitter || 0.3),
      vx, vy, vz, life: (o.life || 0.7) * (0.6 + Math.random() * 0.7), size: (o.size || 0.35) * (0.6 + Math.random() * 0.8), size1: o.size1,
      color: Math.random() < 0.5 && o.color2 ? o.color2 : o.color, color2: o.colorEnd, gravity: o.gravity ?? -6, drag: o.drag ?? 2.5,
      additive: o.additive, alpha: o.alpha, wobble: o.wobble,
    });
  }
}

function updateParticles(dt) {
  const P = vfx.parts;
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i];
    p.age += dt;
    if (p.age >= p.life) { P[i] = P[P.length - 1]; P.pop(); continue; }
    const dr = Math.exp(-p.drag * dt);
    p.vx *= dr; p.vz *= dr; p.vy = p.vy * dr + p.g * dt;
    if (p.wobble) { p.vx += Math.sin(p.age * 7 + p.seed) * p.wobble * dt; p.vz += Math.cos(p.age * 6 + p.seed) * p.wobble * dt; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.y < p.gy + 0.02 && p.g < 0) { p.y = p.gy + 0.02; p.vy *= -0.25; p.vx *= 0.6; p.vz *= 0.6; }
  }
}
const _c3 = [0, 0, 0];
function drawParticles(layer, additive) {
  for (const p of vfx.parts) {
    if (p.add !== additive) continue;
    const u = p.age / p.life;
    const x = Math.round(PX(p.x)), y = Math.round(PY(p.z, p.y - p.gy));
    if (x < -4 || y < -4 || x > layer.w + 4 || y > layer.h + 4) continue;
    const sz = p.size + (p.size1 - p.size) * u;
    const n = Math.max(1, Math.min(4, Math.round(sz * PPU * 0.45)));
    let c = p.c0;
    if (p.c1) { _c3[0] = p.c0[0] + (p.c1[0] - p.c0[0]) * u; _c3[1] = p.c0[1] + (p.c1[1] - p.c0[1]) * u; _c3[2] = p.c0[2] + (p.c1[2] - p.c0[2]) * u; c = _c3; }
    const a = p.a0 * (u > 0.6 ? 1 - (u - 0.6) / 0.4 : 1);
    // dithered fade keeps pixels hard-edged
    if (a < 0.98 && bayer(x, y) > a + 0.1) continue;
    if (n === 1) layer.px(x, y, c, 1);
    else if (n === 2) layer.rect(x, y, 2, 2, c, 1);
    else if (additive && n >= 3) {
      // little four-point sparkle with a white-hot core
      layer.px(x, y, WHITE, 1); layer.px(x - 1, y, c, 1); layer.px(x + 1, y, c, 1); layer.px(x, y - 1, c, 1); layer.px(x, y + 1, c, 1);
      if (n >= 4) { layer.px(x - 2, y, c, 0.6); layer.px(x + 2, y, c, 0.6); layer.px(x, y - 2, c, 0.6); layer.px(x, y + 2, c, 0.6); }
    } else layer.rect(x - (n >> 1), y - (n >> 1), n, n, c, 1);
  }
}
const WHITE = [255, 255, 255];
function glowParticles(ctx) {
  let n = 0;
  for (const p of vfx.parts) {
    if (!p.halo || n > 420) continue;
    const u = p.age / p.life;
    const x = PX(p.x), y = PY(p.z, p.y - p.gy);
    if (x < -10 || y < -10 || x > view.W + 10 || y > view.H + 10) continue;
    n++;
    glowPx(ctx, x + 0.5, y + 0.5, rgbStr(p.c1 && u > 0.5 ? p.c1 : p.c0), Math.max(3, p.size * PPU * 0.9), 0.32 * (1 - u));
  }
}

// ================================================================== slash smears
// Crescent swing smear around the attacker, rasterised every frame as hard pixels: the leading
// edge whips round in the first ~40% of the effect, the tail chases it and the crescent thins
// out. Outer rim white-hot, a light band, then the swing colour; the tail dithers away.
// o.kind 'thrust' draws a straight lance streak instead (stabs, spear thrusts).
export function slash(x, y, z, facing, o = {}) {
  if (o.kind === 'thrust') return thrustStreak(x, y, z, facing, o);
  const r = (o.radius || 2.4) * PPU, arc = (o.arc || 110) * Math.PI / 180;
  const a0 = Math.atan2(Math.cos(facing), Math.sin(facing));
  const dir = o.reverse ? -1 : 1;
  const start = a0 - dir * arc / 2, sweep = dir * arc;
  const c = col(o.color || '#fff0d0'), lc = light(c, 1.3), hi = WHITE;
  const dur = o.dur || 0.16;
  const lift = o.h ?? 0.7;
  const gy = ground(x, z);
  const heavy = (o.dur || 0) >= 0.24;
  const R0 = r, thickMax = Math.max(4, r * (heavy ? 0.5 : 0.4));
  const physical = o.physical ?? (o.color === undefined || /^#(ff(f|e)|c8dcff)/i.test(o.color));
  return addFx({
    update(f, dt) { f.t += dt; return f.t < dur; },
    glowPx(Ly) {
      const u = clamp01(this.t / dur);
      const lead = sweep * easeOut(clamp01(u / 0.42));
      const tail = sweep * clamp01((u - 0.18) / 0.82) ** 1.6;
      const span = Math.abs(lead - tail);
      if (span < 0.02) return;
      const cx = PX(x), cy = PY(z, y - gy + lift);
      const fadeOut = u > 0.65 ? 1 - (u - 0.65) / 0.35 : 1;
      const x0 = Math.floor(cx - R0 - 1), x1 = Math.ceil(cx + R0 + 1), y0 = Math.floor(cy - R0 - 1), y1 = Math.ceil(cy + R0 + 1);
      for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
        const dx = px + 0.5 - cx, dy = py + 0.5 - cy;
        const d = Math.hypot(dx, dy);
        if (d > R0 || d < R0 - thickMax - 1) continue;
        let rel = (Math.atan2(dy, dx) - (start + tail)) * dir;
        while (rel < -Math.PI) rel += Math.PI * 2; while (rel > Math.PI) rel -= Math.PI * 2;
        if (rel < 0 || rel > span) continue;
        const t = rel / span;                                    // 0 = tail, 1 = leading edge
        const th = thickMax * Math.pow(t, 0.55) * (0.55 + 0.45 * fadeOut);
        const depth = R0 - d;                                    // 0 at the rim
        if (depth > th) continue;
        if (t < 0.3 && bayer(px, py) > t / 0.3) continue;        // dithered tail
        if (fadeOut < 1 && bayer(px, py) > fadeOut) continue;
        Ly.px(px, py, depth < (heavy ? 2 : 1.2) || t > 0.93 ? hi : depth < th * 0.45 ? lc : c, 1);
      }
    },
    glow(ctx) {
      if (physical) return;                                      // steel stays crisp; magic gets a halo
      const u = this.t / dur;
      const a = start + sweep * easeOut(clamp01(u / 0.42));
      const cx = PX(x) + Math.cos(a) * r * 0.8, cy = PY(z, y - gy + lift) + Math.sin(a) * r * 0.8;
      glowPx(ctx, cx, cy, rgbStr(c), r * 0.5, 0.35 * (1 - u));
    },
  });
}
// straight stab streak: a pointed lance of light that shoots out along the facing and retracts
function thrustStreak(x, y, z, facing, o) {
  const len = (o.radius || 2.4) * PPU * 1.1, dur = o.dur || 0.14;
  const c = col(o.color || '#fff0d0'), lc = light(c, 1.3);
  const ux = Math.sin(facing), uz = Math.cos(facing);
  const lift = o.h ?? 0.7, gy = ground(x, z);
  const w0 = o.width || 3;
  return addFx({
    update(f, dt) { f.t += dt; return f.t < dur; },
    glowPx(Ly) {
      const u = clamp01(this.t / dur);
      const tip = len * easeOut(clamp01(u / 0.35)), back = len * clamp01((u - 0.25) / 0.75) ** 1.4;
      if (tip - back < 1) return;
      const cx = PX(x), cy = PY(z, y - gy + lift);
      for (let s = back; s <= tip; s += 0.5) {
        const t = (s - back) / Math.max(1, tip - back);           // 0 = back, 1 = tip
        const w = Math.max(0.5, w0 * Math.sin(Math.PI * Math.min(1, t * 1.05)) * (1 - u * 0.4));
        const px = cx + ux * s, py = cy + uz * s;
        for (let k = -Math.ceil(w); k <= Math.ceil(w); k++) {
          if (Math.abs(k) > w) continue;
          if (t < 0.25 && bayer(Math.round(px + uz * k), Math.round(py - ux * k)) > t / 0.25) continue;
          Ly.px(px + uz * k, py - ux * k, Math.abs(k) < 0.8 || t > 0.9 ? WHITE : Math.abs(k) < w * 0.6 ? lc : c, 1);
        }
      }
    },
  });
}

// crisp radial hit spark (melee impacts)
export function hitSpark(x, y, z, o = {}) {
  const c = col(o.color || '#fff4d0');
  const n = o.rays || 6, len = (o.size || 1) * 6, dur = o.dur || 0.14;
  const gy = ground(x, z);
  const rot = Math.random() * Math.PI;
  return addFx({
    update(f, dt) { f.t += dt; return f.t < dur; },
    glowPx(Ly) {
      const u = this.t / dur;
      const cx = Math.round(PX(x)), cy = Math.round(PY(z, y - gy));
      for (let k = 0; k < n; k++) {
        const a = rot + k / n * Math.PI * 2, l = len * (k % 2 ? 0.6 : 1);
        const r0 = l * u * 0.8, r1 = l * (0.35 + u * 0.9);
        for (let s = r0; s <= r1; s += 0.7) Ly.px(cx + Math.cos(a) * s, cy + Math.sin(a) * s, s > r1 - 1.5 ? c : WHITE, 1);
      }
      if (u < 0.35) Ly.rect(cx - 1, cy - 1, 3, 3, WHITE, 1);
    },
    glow(ctx) { if (o.glow !== false) glowPx(ctx, PX(x), PY(z, y - gy), rgbStr(c), len * 1.1, 0.3 * (1 - this.t / dur)); },
  });
}

// ================================================================== rings
export function ring(x, y, z, o = {}) {
  const c = col(o.color || '#ffd080');
  const r0 = (o.r0 ?? 0.3) * PPU, r1 = (o.radius || 4) * PPU, dur = o.dur || 0.45;
  const gy = ground(x, z);
  const h = Math.max(0, y - gy) * 0.2;
  return addFx({
    update(f, dt) { f.t += dt; return f.t < dur; },
    glowPx(Ly) {
      const u = this.t / dur;
      const rr = r0 + (r1 - r0) * easeOut(u);
      const th = Math.max(1, 3 * (1 - u));
      const cx = PX(x), cy = PY(z, h);
      ringPx(Ly, cx, cy, rr, th, c, 1 - u * 0.7, u);
    },
    glow(ctx) {
      const u = this.t / dur;
      if (u < 0.35) glowPx(ctx, PX(x), PY(z, h), rgbStr(c), r1 * 0.6, 0.35 * (1 - u / 0.35));
    },
  });
}
function ringPx(Ly, cx, cy, rr, th, c, a, u = 0) {
  const x0 = Math.floor(cx - rr - 1), x1 = Math.ceil(cx + rr + 1);
  for (let py = Math.floor(cy - rr - 1); py <= Math.ceil(cy + rr + 1); py++) for (let px = x0; px <= x1; px++) {
    const d = Math.hypot(px + 0.5 - cx, py + 0.5 - cy);
    if (d > rr || d < rr - th - 2) continue;
    if (d >= rr - th) { if (bayer(px, py) < a + 0.15) Ly.px(px, py, d > rr - 1 ? WHITE : c, 1); }
    else if (bayer(px, py) < (1 - u) * 0.35) Ly.px(px, py, c, 1);
  }
}

// Ground impact for slams, landings and heavy overheads: a sharp expanding ring, jagged cracks
// that stay on the ground for a moment, and a skirt of dust kicked out along the shockwave.
export function shockwave(x, y, z, o = {}) {
  const R = (o.radius || 3) * PPU, c = col(o.color || '#e8d8b8'), crackC = o.crackColor ? col(o.crackColor) : [40, 28, 24];
  const dur = o.dur || 1.1, gy = ground(x, z);
  const cracks = [];
  const n = o.cracks ?? 9;
  for (let i = 0; i < n; i++) {
    let a = (i / n) * Math.PI * 2 + Math.random() * 0.5, px = 0, py = 0;
    const pts = [[0, 0]];
    const len = R * (0.35 + Math.random() * 0.35);
    for (let d = 0; d < len; d += 2.5) { a += (Math.random() - 0.5) * 0.7; px += Math.cos(a) * 2.5; py += Math.sin(a) * 2.5 * 0.8; pts.push([px, py]); }
    cracks.push(pts);
  }
  if (o.dust !== false) for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2, sp = (o.radius || 3) * (2.2 + Math.random() * 1.5);
    particle({ x: x + Math.cos(a) * 0.4, y: gy + 0.15, z: z + Math.sin(a) * 0.4, vx: Math.cos(a) * sp, vy: 0.6 + Math.random() * 1.2, vz: Math.sin(a) * sp, life: 0.45 + Math.random() * 0.3, size: 0.5, size1: 0.2, color: o.dustColor || '#c8b090', color2: '#8a7a64', gravity: -4, drag: 5, additive: false });
  }
  return addFx({
    update(f, dt) { f.t += dt; return f.t < dur; },
    decal(Ly) {
      const u = this.t / dur, cx = PX(x), cy = PY(z, 0);
      const grow = clamp01(this.t / 0.08);
      for (const pts of cracks) {
        const m = Math.max(2, Math.round(pts.length * grow));
        for (let i = 0; i < m - 1; i++) {
          const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
          const k = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
          for (let j = 0; j <= k; j++) {
            const X = Math.round(cx + x0 + (x1 - x0) * j / k), Y = Math.round(cy + y0 + (y1 - y0) * j / k);
            if (u > 0.55 && bayer(X, Y) < (u - 0.55) / 0.45) continue;
            Ly.px(X, Y, crackC, 0.9);
            if (i < 2) Ly.px(X + 1, Y, crackC, 0.9);
          }
        }
      }
    },
    glowPx(Ly) {
      const t = this.t;
      if (t > 0.28) return;
      const u = t / 0.28, cx = PX(x), cy = PY(z, 0);
      const rr = R * easeOut(u), th = Math.max(1, 3 * (1 - u));
      // squashed ring so it reads as lying on the ground
      for (let k = 0; k < 360; k++) {
        const a = (k / 360) * Math.PI * 2;
        if (u > 0.5 && bayer(k, 1) < (u - 0.5) * 2) continue;
        for (let w = 0; w < th; w++) Ly.px(cx + Math.cos(a) * (rr - w), cy + Math.sin(a) * (rr - w) * 0.75, w < 1 ? WHITE : c, 1);
      }
    },
  });
}

// ================================================================== telegraphs
// Red ground warnings: the fill (lit, under sprites) grows toward the strike; a blinking crisp
// outline stays bright on top so it reads even in dark dungeons.
export function telegraph(o) {
  const c = col(o.color || '#ff3020');
  const dur = o.dur || 1;
  const handle = { done: false, follow: o.follow };
  const st = { x: o.x, z: o.z, facing: o.facing || 0 };
  const shape = o.shape || 'circle';
  const R0 = (o.radius || 3) * PPU, ang = ((o.angle || 90) * Math.PI) / 180, wid = (o.width || 2) * PPU, len = (o.length || 10) * PPU;
  // inside test in local px; returns [inside, edge, progressCoord]
  const test = (dx, dy) => {
    if (shape === 'circle') { const d = Math.hypot(dx, dy); return [d <= R0, d > R0 - 1.2, d / R0]; }
    const a0 = Math.atan2(Math.cos(st.facing), Math.sin(st.facing));
    if (shape === 'cone') {
      const d = Math.hypot(dx, dy);
      let a = Math.atan2(dy, dx) - a0; while (a < -Math.PI) a += Math.PI * 2; while (a > Math.PI) a -= Math.PI * 2;
      const inA = Math.abs(a) <= ang / 2;
      return [d <= R0 && inA, d > R0 - 1.2 || (Math.abs(Math.abs(a) - ang / 2) * d < 1.1), d / R0];
    }
    // line: along the facing
    const ux = Math.cos(a0), uy = Math.sin(a0);
    const along = dx * ux + dy * uy, across = -dx * uy + dy * ux;
    return [along >= 0 && along <= len && Math.abs(across) <= wid / 2, Math.abs(across) > wid / 2 - 1.1 || along > len - 1.1, along / len];
  };
  const bounds = () => (shape === 'line' ? len + wid : R0) + 2;
  const raster = (Ly, fill) => {
    const u = clamp01(fx.t / dur);
    const cx = PX(st.x), cy = PY(st.z, 0);
    const B = bounds();
    const blink = Math.floor(fx.t * 12) % 2 === 0 || u > 0.8;
    for (let py = Math.floor(cy - B); py <= Math.ceil(cy + B); py++) for (let px = Math.floor(cx - B); px <= Math.ceil(cx + B); px++) {
      const [inside, edge, prog] = test(px + 0.5 - cx, py + 0.5 - cy);
      if (!inside) continue;
      if (fill) {
        if (prog <= u) { if (bayer(px, py) < 0.42 + (prog > u - 0.08 ? 0.5 : 0)) Ly.px(px, py, c, 0.85); }
        else if (bayer(px, py) < 0.12) Ly.px(px, py, c, 0.7);
      } else if (edge && blink) Ly.px(px, py, u > 0.85 ? WHITE : c, 1);
    }
  };
  const fx = addFx({
    update(f, dt) {
      f.t += dt;
      if (handle.follow && !handle.follow.dead) { st.x = handle.follow.pos.x; st.z = handle.follow.pos.z; if (shape !== 'circle') st.facing = handle.follow.facing; }
      return !(f.t >= dur || handle.done);
    },
    decal(Ly) { raster(Ly, true); },
    glowPx(Ly) { raster(Ly, false); },
  });
  return handle;
}

// ================================================================== beams / lightning / pillars (smooth magic)
function strokeGlow(ctx, pts, color, w, a) {
  const s = view.scale;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const pass = (lw, alpha, c) => {
    ctx.globalAlpha = alpha; ctx.strokeStyle = c; ctx.lineWidth = lw * s;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s)));
    ctx.stroke();
  };
  pass(w * 4, 0.12 * a, color); pass(w * 2, 0.3 * a, color); pass(w, 0.9 * a, color); pass(Math.max(0.6, w * 0.4), a, '#ffffff');
  ctx.globalAlpha = 1;
}
export function beam(ax, ay, az, bx, by, bz, o = {}) {
  const c = o.color || '#a060ff', w = (o.width || 0.25) * PPU * 1.6, dur = o.dur || 0.1;
  const ga = ground(ax, az), gb = ground(bx, bz);
  return addFx({
    update(f, dt) { f.t += dt; return f.t < dur; },
    glow(ctx) {
      const u = this.t / dur;
      const wob = 1 + Math.sin(this.t * 50) * 0.15;
      const A = [PX(ax), PY(az, ay - ga)], B = [PX(bx), PY(bz, by - gb)];
      strokeGlow(ctx, [A, B], c, w * wob, 1 - u * u);
      glowPx(ctx, B[0], B[1], c, w * 3, 0.6 * (1 - u));
    },
  });
}
export function lightning(ax, ay, az, bx, by, bz, o = {}) {
  const segs = o.segs || 10, jag = (o.jag || 0.8) * PPU;
  const c = o.color || '#c0d0ff', dur = o.dur || 0.18;
  const ga = ground(ax, az), gb = ground(bx, bz);
  const A = [PX(ax) + view.x0, PY(az, ay - ga) + view.y0], B = [PX(bx) + view.x0, PY(bz, by - gb) + view.y0];
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, j = i === 0 || i === segs ? 0 : jag;
    pts.push([A[0] + (B[0] - A[0]) * t + (Math.random() - 0.5) * j, A[1] + (B[1] - A[1]) * t + (Math.random() - 0.5) * j]);
  }
  const f = addFx({
    update(fx, dt) { fx.t += dt; return fx.t < dur; },
    glowPx(Ly) {
      // a hard 1px bolt core on the pixel layer
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
        const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
        for (let k = 0; k <= n; k++) Ly.px(x0 + (x1 - x0) * k / n - view.x0, y0 + (y1 - y0) * k / n - view.y0, WHITE, 1);
      }
    },
    glow(ctx) { strokeGlow(ctx, pts.map(([x, y]) => [x - view.x0, y - view.y0]), c, 1.6, 1 - this.t / dur); },
  });
  for (let i = 0; i < 4; i++) {
    const t = Math.random();
    particle({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t, z: az + (bz - az) * t, vx: (Math.random() - 0.5) * 4, vy: Math.random() * 3, vz: (Math.random() - 0.5) * 4, life: 0.25, size: 0.25, color: c });
  }
  return f;
}
export function pillar(x, y, z, o = {}) {
  const H = (o.height || 14) * PPU * 0.6, r = (o.radius || 1.2) * PPU, c = col(o.color || '#ffe080'), dur = o.dur || 0.5;
  const lc = light(c, 1.3), dc = dark(c, 0.8);
  const gy = ground(x, z);
  return addFx({
    update(f, dt) { f.t += dt; return f.t < dur; },
    // a hard-edged beam of light: slams down in a couple of frames, then thins and dithers out
    glowPx(Ly) {
      const u = clamp01(this.t / dur);
      const cx = PX(x), base = PY(z, Math.max(0, y - gy));
      const top = base - H * easeOut(clamp01(u * 5));
      const w = Math.max(1, r * 0.55 * (u < 0.15 ? 1.25 : 1 - (u - 0.15) * 0.8));
      const fade = u > 0.45 ? 1 - (u - 0.45) / 0.55 : 1;
      for (let py = Math.floor(top); py <= Math.ceil(base); py++) {
        const vt = (py - top) / Math.max(1, base - top);          // 0 at the top, 1 at the ground
        if (vt < 0.3 && bayer(Math.round(cx), py) > vt / 0.3) continue;
        const ww = w * (0.75 + vt * 0.25);
        for (let px = Math.floor(cx - ww); px <= Math.ceil(cx + ww); px++) {
          const dx = Math.abs(px + 0.5 - cx) / ww;
          if (dx > 1) continue;
          if (fade < 1 && bayer(px, py) > fade + (1 - dx) * 0.3) continue;
          Ly.px(px, py, dx < 0.35 ? WHITE : dx < 0.7 ? lc : dx < 0.9 ? c : dc, 1);
        }
      }
      ringPx(Ly, cx, PY(z, 0), r * (1 + u * 0.8), 1.5, c, 1 - u, u);
    },
    glow(ctx) {
      const u = this.t / dur;
      glowPx(ctx, PX(x), PY(z, Math.max(0, y - gy)), rgbStr(c), r * 2.4, 0.6 * (1 - u));
      glowPx(ctx, PX(x), PY(z, Math.max(0, y - gy)) - H * 0.4, rgbStr(c), r * 1.6, 0.35 * (1 - u));
    },
  });
}

// ================================================================== projectiles & zones
// Projectile drawable: rotated ammo sprite (arrows, bolts, shards) or a hard-edged glowing orb.
const orbCache = new Map();
function orbSprite(color, r) {
  const key = color + r;
  let s = orbCache.get(key);
  if (s) return s;
  const n = r * 2 + 3, c = C(color);
  const p = new Pix(n, n); p.ox = p.oy = Math.floor(n / 2);
  p.disc(n / 2, n / 2, r + 0.4, c);
  p.disc(n / 2 - 0.4, n / 2 - 0.4, r * 0.62, light(c, 1.45));
  p.disc(n / 2 - 0.6, n / 2 - 0.6, Math.max(0.6, r * 0.28), [255, 255, 255, 255]);
  p.outline(dark(c, 0.35));
  s = { pix: p, emis: p };
  orbCache.set(key, s);
  return s;
}
export function projectileDrawable(p, size = 0.3) {
  const kind = p.kind;
  const pointed = kind === 'arrow' || kind === 'bolt' || kind === 'shard' || kind === 'thorn';
  const spr = pointed ? ammoSprite(kind, p.element !== 'physical' || kind === 'shard' || kind === 'thorn' ? p.color : null) : orbSprite(p.color, Math.max(2, Math.round(size * PPU * 0.9)));
  const glowR = pointed ? (p.element !== 'physical' ? 6 : 0) : size * PPU * 2.6;
  const o = {
    sortZ: p.pos.z, p,
    pos() { const gy = ground(p.pos.x, p.pos.z); return [Math.round(PX(p.pos.x)), Math.round(PY(p.pos.z, p.pos.y - gy)), gy]; },
    shadow(ctx) { const gy = ground(p.pos.x, p.pos.z); ctx.fillStyle = 'rgba(10,6,12,0.35)'; ctx.fillRect(Math.round(PX(p.pos.x)) - 1, Math.round(PY(p.pos.z, 0)), 3, 1); void gy; },
    draw(ctx) {
      this.sortZ = p.pos.z;
      const [x, y] = this.pos();
      const cv = spr.pix.canvas();
      if (pointed) {
        const a = Math.atan2(p.vel.z - p.vel.y, p.vel.x);
        ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.drawImage(cv, -spr.pix.ox, -spr.pix.oy); ctx.restore();
      } else ctx.drawImage(cv, x - spr.pix.ox, y - spr.pix.oy);
    },
    emissive(ctx) {
      if (!spr.emis) return;
      const [x, y] = this.pos();
      const cv = spr.emis.canvas();
      if (pointed) { const a = Math.atan2(p.vel.z - p.vel.y, p.vel.x); ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.drawImage(cv, -spr.emis.ox, -spr.emis.oy); ctx.restore(); }
      else ctx.drawImage(cv, x - spr.emis.ox, y - spr.emis.oy);
    },
    glow(ctx) { if (glowR) { const [x, y] = this.pos(); glowPx(ctx, x + 0.5, y + 0.5, p.color, glowR, 0.65); } },
  };
  scene.objects.add(o);
  // crisp trail: recent positions joined by a tapering pixel ribbon (magic) or a thin streak
  // (arrows); once the projectile dies the tail keeps collapsing into the impact point
  const trail = [], TL = pointed ? 4 : 7, headW = pointed ? 0.5 : Math.max(1.5, size * PPU * 0.75);
  const c = col(p.color), tc = pointed ? (p.element !== 'physical' ? light(c, 1.2) : [235, 230, 220]) : light(c, 1.25), dc = dark(c, 0.75);
  addFx({
    update() {
      if (!o.gone) { trail.unshift([p.pos.x, p.pos.y, p.pos.z]); if (trail.length > TL) trail.pop(); }
      else trail.pop();
      return trail.length > 0;
    },
    glowPx(Ly) {
      const n = trail.length;
      if (n < 2) return;
      for (let i = 0; i < n - 1; i++) {
        const [ax, ay, az] = trail[i], [bx, by, bz] = trail[i + 1];
        const x0 = PX(ax), y0 = PY(az, ay - ground(ax, az)), x1 = PX(bx), y1 = PY(bz, by - ground(bx, bz));
        const L = Math.max(1, Math.hypot(x1 - x0, y1 - y0)), steps = Math.ceil(L * 1.5);
        for (let k = 0; k <= steps; k++) {
          const t = (i + k / steps) / (TL - 1);                     // 0 at the head, 1 at the tail
          const xx = x0 + (x1 - x0) * k / steps, yy = y0 + (y1 - y0) * k / steps;
          if (t > 0.45 && bayer(Math.round(xx), Math.round(yy)) > (1 - t) / 0.55) continue;
          const w = headW * (1 - t * 0.85);
          if (w <= 0.6) { Ly.px(xx, yy, t < 0.4 ? tc : pointed ? tc : c, 1); continue; }
          for (let dy = -Math.ceil(w); dy <= Math.ceil(w); dy++) for (let dx = -Math.ceil(w); dx <= Math.ceil(w); dx++) {
            const d = Math.hypot(dx, dy);
            if (d > w) continue;
            Ly.px(xx + dx, yy + dy, d < w * 0.45 && t < 0.5 ? tc : t > 0.7 ? dc : c, 1);
          }
        }
      }
    },
  });
  return o;
}
export function removeDrawable(o) { if (o) { o.gone = true; scene.objects.delete(o); } }

// A sprite standing in the world for a while (spikes, totems, ice walls). update(fx, dt) returns
// false to remove; fx.rise (0..1) reveals the sprite from the ground up, fx.alpha fades it.
export function worldSprite(x, z, spr, update) {
  const gy = ground(x, z);
  const o = {
    sortZ: z, t: 0, rise: 1, alpha: 1,
    shadow(ctx) { const w = Math.max(3, Math.round(spr.pix.w * 0.35)); ctx.fillStyle = 'rgba(10,6,12,0.3)'; ctx.fillRect(Math.round(PX(x)) - w, Math.round(PY(z, 0)) - 1, w * 2 + 1, 2); },
    blitTo(ctx, p) {
      const X = Math.round(PX(x)), Y = Math.round(PY(z, 0));
      const vis = Math.max(1, Math.round(p.h * this.rise));
      ctx.globalAlpha = this.alpha;
      // the top `vis` rows poke out of the ground (sprite sunk by h - vis)
      ctx.drawImage(p.canvas(), 0, 0, p.w, vis, X - p.ox, Y - p.oy + (p.h - vis), p.w, vis);
      ctx.globalAlpha = 1;
    },
    draw(ctx) { this.blitTo(ctx, spr.pix); },
    emissive(ctx) { if (spr.emis) this.blitTo(ctx, spr.emis); },
  };
  scene.objects.add(o);
  addFx({ update(f, dt) { o.t += dt; const keep = update(o, dt); if (!keep) scene.objects.delete(o); return keep; } });
  void gy;
  return o;
}

// Persistent ground zone (hazards): dithered fill + rotating dashed rim + soft glow.
export function zoneDrawable(h, opacity = 0.4) {
  const c = col(h.color);
  return addFx({
    zone: true,
    update() { return !h.gone; },
    decal(Ly) {
      const cx = PX(h.x), cy = PY(h.z, 0), r = h.radius * PPU;
      const a = Math.min(1, h.life * 1.6) * (0.75 + Math.sin(h.age * 6) * 0.25) * opacity * 1.6;
      for (let py = Math.floor(cy - r); py <= Math.ceil(cy + r); py++) for (let px = Math.floor(cx - r); px <= Math.ceil(cx + r); px++) {
        const d = Math.hypot(px + 0.5 - cx, py + 0.5 - cy);
        if (d > r) continue;
        const edge = d / r;
        if (bayer(px + Math.floor(h.age * 3), py) < a * (0.25 + edge * edge * 0.6)) Ly.px(px, py, c, 0.9);
      }
    },
    glowPx(Ly) {
      const cx = PX(h.x), cy = PY(h.z, 0), r = h.radius * PPU;
      const n = Math.max(12, Math.round(r * 1.2));
      const fade = Math.min(1, h.life * 2);
      for (let k = 0; k < n; k++) {
        if ((k + Math.floor(h.age * 8)) % 4 === 0) continue;
        const a = (k / n) * Math.PI * 2 + h.age * 0.6;
        if (bayer(k, 0) > fade) continue;
        Ly.px(cx + Math.cos(a) * r, cy + Math.sin(a) * r, c, 1);
      }
    },
    glow(ctx) { glowPx(ctx, PX(h.x), PY(h.z, 0), rgbStr(c), h.radius * PPU * 1.1, 0.16 * Math.min(1, h.life)); },
  });
}
export function removeZone(f) { if (f) { const i = vfx.fx.indexOf(f); if (i >= 0) vfx.fx.splice(i, 1); } }

// ================================================================== numbers & lights
// Floating combat text, drawn in the pixel font on the unlit layer so it stays crisp and bright.
// Pops in one size larger for a couple of frames, drifts up, then dithers away.
export function floatText(x, y, z, text, o = {}) {
  if (!G.settings.damageNumbers && !o.force) return;
  text = String(text);
  vfx.numbers.push({
    text, x: x + (Math.random() - 0.5) * 0.6, y, z: z + (Math.random() - 0.5) * 0.4, t: 0, life: o.life || 0.85,
    vy: o.vy ?? 2.6, vx: (Math.random() - 0.5) * 0.8, c: col(o.color || '#ffffff'), crit: !!o.crit, small: o.cls === 'dot',
  });
  if (vfx.numbers.length > 60) vfx.numbers.shift();
}
const NUM_OUT = [24, 12, 20];
function drawNumbers(Ly) {
  for (const n of vfx.numbers) {
    const base = n.crit ? 2 : 1;
    const s = n.t < 0.07 && !n.small ? base + 1 : base;
    const gy = ground(n.x, n.z);
    const w = textWidth(n.text) * s;
    const px = Math.round(PX(n.x) - w / 2), py = Math.round(PY(n.z, n.y - gy) - FONT_H * s);
    if (px > Ly.w || py > Ly.h || px + w < 0 || py + FONT_H * s < 0) continue;
    if (n.t > n.life * 0.72 && Math.floor(n.t * 24) % 2) continue;   // blink out
    const hi = light(n.c, 1.25);
    drawText(Ly, px, py, n.text, (gx, gyy) => (gyy < 2 ? hi : n.c), s, NUM_OUT);
  }
}

// Short-lived point lights (impacts, casts, explosions) with a matching soft glow pop
export function flash(x, y, z, color, intensity = 10, dist = 9, dur = 0.25) {
  vfx.flashes.push({ x, y, z, color, intensity, dist, dur, t: 0 });
  if (vfx.flashes.length > 24) vfx.flashes.shift();
}

// rawDt drives text and lights' fade-out; gameDt (frozen during hitstop) drives particles and
// effects, so a heavy hit holds its impact frame instead of the smear finishing in the freeze.
export function updateVfx(dt, gameDt = dt) {
  for (let i = vfx.flashes.length - 1; i >= 0; i--) {
    const f = vfx.flashes[i];
    f.t += gameDt;
    if (f.t >= f.dur) { vfx.flashes.splice(i, 1); continue; }
    requestLight(f.x, f.y, f.z, f.color, f.intensity * (1 - f.t / f.dur), f.dist);
  }
  updateParticles(gameDt);
  for (let i = vfx.fx.length - 1; i >= 0; i--) {
    const f = vfx.fx[i];
    if (!f.update(f, gameDt)) vfx.fx.splice(i, 1);
  }
  for (let i = vfx.numbers.length - 1; i >= 0; i--) {
    const n = vfx.numbers[i];
    n.t += dt;
    n.y += n.vy * dt; n.vy *= Math.exp(-5 * dt); n.x += n.vx * dt;
    if (n.t > n.life) vfx.numbers.splice(i, 1);
  }
}
// soft glow for active flashes (on the full-res layer)
scene.persist.glows.push((ctx) => {
  for (const f of vfx.flashes) {
    const u = f.t / f.dur;
    const gy = ground(f.x, f.z);
    glowPx(ctx, PX(f.x), PY(f.z, Math.max(0, f.y - gy) * 0.5), f.color, Math.min(60, f.dist * PPU * 0.45), Math.min(0.55, f.intensity / 40) * (1 - u));
  }
});

export function clearVfx() {
  vfx.fx.length = 0;
  vfx.parts.length = 0;
  vfx.numbers.length = 0;
  vfx.flashes.length = 0;
}

// Element helpers
export const ELEM_COLORS = {
  physical: ['#ffffff', '#c8c0b0'], fire: ['#ffd080', '#ff5010'], frost: ['#f0fcff', '#50b8ff'], lightning: ['#ffffff', '#90a8ff'],
  rot: ['#d0ffa0', '#50b030'], nature: ['#e0ffa0', '#60c030'], void: ['#e8d0ff', '#8030ff'], holy: ['#fffff0', '#ffc840'],
  water: ['#e0ffff', '#30a0e0'], sand: ['#fff0c0', '#e0a040'], blood: ['#ffb0b0', '#c00818'], sound: ['#fff0ff', '#e070f0'], earth: ['#f0e0c0', '#a07040'],
};
export function elemBurst(el, x, y, z, scale = 1) {
  const [c1, c2] = ELEM_COLORS[el] || ELEM_COLORS.physical;
  const conf = {
    fire: { count: 26, speed: 7, gravity: 3, up: 0.8, life: 0.7, size: 0.5 },
    frost: { count: 22, speed: 6, gravity: -8, life: 0.8, size: 0.35 },
    lightning: { count: 18, speed: 12, gravity: 0, life: 0.3, size: 0.3 },
    void: { count: 24, speed: -5, gravity: 0, life: 0.6, size: 0.45, jitter: 2 },
    holy: { count: 24, speed: 6, gravity: 4, up: 1.2, life: 0.8, size: 0.4 },
    rot: { count: 20, speed: 4, gravity: 1, life: 1.0, size: 0.6 },
  }[el] || { count: 16, speed: 6, gravity: -8, life: 0.5, size: 0.3 };
  burst(x, y, z, { ...conf, count: Math.round(conf.count * scale), color: c1, color2: c2, colorEnd: c2 });
  flash(x, y + 1, z, c2, 14 * scale, 9, 0.3);
  if (scale >= 0.4) ring(x, y, z, { radius: 1.2 * scale + 0.5, color: c2, dur: 0.22, r0: 0.2 });
}
