// Spell effect recipes for the GPU magic layer (magic.js). Each element has its own material:
//   fire      roiling flame balls, licking flame tails, embers, heat bloom
//   frost     faceted crystal orbs with orbiting shards, mist, glints, shard bursts
//   lightning crackling plasma, branching fractal bolts, fast sparks
//   void      swirling vortices, implosions, dark-rimmed orbs
//   holy      radiant stars, light shafts, rune circles, rising motes
//   rot       bubbling orbs, drips, toxic mist
// 3D cues: hoops and orbits are squashed ellipses with front/back depth, domes expand around
// impacts, shafts rise from rune circles, sparks are stretched along their velocity.
import { addMagic, gpart, gburst, quad, shade, crystal, K, PASS, mx, my, mxw, myw, ground, col, UPX, magic } from './magic.js';
import { PALETTE, paletteOf, elementOf, ELEM_CODE } from './elements.js';
import { requestLight } from './renderer.js';
import { PPU } from '../px/pix.js';
import { Vec3 } from '../core/vec3.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (t) => 1 - (1 - t) ** 3;
const rnd = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;
const WHITE = [255, 255, 255];
const lightCss = new Map();
const css = (c) => { let s = lightCss.get(c); if (!s) { s = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; lightCss.set(c, s); } return s; };

// what the ground is multiplied by under each element (darkening pass): scorch, frost, blight...
const TINT = {
  fire: [120, 72, 50], frost: [170, 212, 255], lightning: [96, 102, 150], void: [58, 22, 96], rot: [96, 130, 70], nature: [110, 140, 84],
  blood: [110, 22, 28], water: [140, 185, 230], sand: [190, 160, 110], earth: [130, 104, 80], sound: [170, 120, 190], physical: [110, 100, 92], custom: [100, 90, 110],
};
const ZONE_DARK = { fire: 0.22, frost: 0.55, lightning: 0.4, void: 0.75, rot: 0.55, nature: 0.45, blood: 0.55, water: 0.45, sand: 0.35, earth: 0.35, sound: 0.3, custom: 0.35 };
const SHADOW = [60, 52, 72];

// lingering mark on the ground: charred for fire, frosted for ice, blighted for rot...
export function scorchFx(x, z, radius, elOrColor, dur = 2.4, strength = 0.65) {
  const { el } = resolve(elOrColor);
  if (el === 'holy') return null;
  const tint = TINT[el] || TINT.custom, seed = Math.random() * 10;
  return addMagic({
    update(f, dt) { f.t += dt; return f.t < dur; },
    draw(f) {
      const u = f.t / dur;
      const r = radius * UPX * (0.85 + 0.15 * easeOut(Math.min(1, f.t * 6)));
      shade(mx(x), my(z, 0), r, r, tint, strength * Math.min(1, f.t * 12) * (1 - u * u), true, seed);
    },
  });
}

function resolve(elOrColor) {
  const el = elementOf(elOrColor) || 'custom';
  return { el, P: PALETTE[el] || paletteOf(elOrColor) };
}

// tapered ribbon segment between two magic-canvas points (MAX pass: joints don't bead)
function seg(ax, ay, bx, by, wa, wb, aa, ab, c1, c2) {
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
  if (L < 0.01) return;
  const wm = Math.max(wa, wb);
  quad((ax + bx) / 2, (ay + by) / 2, L / 2 + wm, wm * 1.7, Math.atan2(dy, dx), K.TRAIL, 1, c1, c2, wa, wb, aa, ab, 0, 0, PASS.max);
}
function boltSeg(ax, ay, bx, by, core, glow, a, c1) {
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
  if (L < 0.01) return;
  quad((ax + bx) / 2, (ay + by) / 2, L / 2 + glow, glow, Math.atan2(dy, dx), K.BOLT, a, c1, c1, core, 0, 0, 0, 0, 0, PASS.max);
}

// ================================================================== projectiles
// A magic orb in flight. Returns a handle; set handle.gone = true when the projectile dies and
// the trail collapses into the impact point.
export function orbFx(p, size) {
  const { el, P } = resolve(p.element !== 'physical' ? p.element : p.color);
  const code = ELEM_CODE[el] ?? 0;
  const big = p.kind === 'fireball' || size >= 0.5;
  const hist = [];
  const HL = el === 'fire' ? (big ? 7 : 5) : big ? 12 : 9;   // fire already streams flames behind it
  let acc = 0, arcT = 0;
  const arcs = [];
  const seed = Math.random();
  const lcss = css(P.c2);
  const f = addMagic({
    gone: false,
    update(fx, dt) {
      fx.t += dt;
      if (!fx.gone) {
        hist.unshift([p.pos.x, p.pos.y, p.pos.z]);
        if (hist.length > HL) hist.pop();
        requestLight(p.pos.x, p.pos.y, p.pos.z, lcss, big ? 12 : 7, big ? 9 : 6);
        acc += dt;
        emit(dt);
        arcT -= dt;
        if (el === 'lightning' && arcT <= 0) { arcT = 0.035; arcs.length = 0; for (let k = 0; k < 2; k++) arcs.push(jagArc(size)); }
      } else { hist.pop(); if (hist.length > 2) hist.pop(); }
      return !fx.gone || hist.length > 1;
    },
    draw() {
      const r = size * UPX * (big ? 1.05 : 1.1);
      // trail
      const n = hist.length;
      for (let i = 0; i < n - 1; i++) {
        const [ax, ay, az] = hist[i], [bx, by, bz] = hist[i + 1];
        const t0 = i / (HL - 1), t1 = (i + 1) / (HL - 1);
        seg(mx(bx), my(bz, by - ground(bx, bz)), mx(ax), my(az, ay - ground(ax, az)), r * 0.8 * (1 - t1), r * 0.8 * (1 - t0) + 0.5, (1 - t1) ** 1.5, (1 - t0) ** 1.5 * (f.gone ? 0.6 : 1), P.c1, P.c2);
      }
      if (f.gone) return;
      const x = mx(p.pos.x), y = my(p.pos.z, p.pos.y - ground(p.pos.x, p.pos.z));
      // ground shadow under the orb sells its height; void orbs also drink the light around them
      const hgt = Math.max(0, p.pos.y - ground(p.pos.x, p.pos.z));
      shade(x, my(p.pos.z, 0), r * (1.3 + hgt * 0.05), r * 0.5, SHADOW, Math.max(0.15, 0.5 - hgt * 0.02));
      if (el === 'void') shade(x, y, r * 3.2, r * 3.2, TINT.void, 0.55);
      else if (el === 'lightning' || el === 'frost') shade(x, y, r * 2.6, r * 2.6, TINT[el], el === 'lightning' ? 0.6 : 0.4);
      const vx = p.vel.x, vy = p.vel.z - p.vel.y, vl = Math.hypot(vx, vy) || 1;
      const ux = vx / vl, uy = vy / vl;
      if (el === 'fire') {
        // flame tail licking backwards
        quad(x - ux * r * 1.1, y - uy * r * 1.1, r * 1.35, r * 2.1, Math.atan2(-ux, uy), K.FLAME, 0.95, P.c1, P.c2, 0, 3.2, 1.2, 0, 0.12, seed);
        quad(x, y, r * 2.6, r * 2.6, 0, K.GLOW, 0.55, P.c1, P.c2, 0, 2.5);
      } else if (el === 'void') {
        quad(x, y, r * 2.8, r * 2.8 * 0.9, 0, K.VORTEX, 0.9, P.c1, P.c2, 3, -magic.time * 7 + seed * 9, 0.22, 0, 0, seed);
      } else if (el === 'holy') {
        quad(x, y, r * 3.6, r * 3.6, magic.time * 0.9 + seed * 3, K.STAR, 0.75, P.c1, P.c2, 36, 3, 0.45);
      } else if (el === 'frost') {
        quad(x, y, r * 2.4, r * 2.4, 0, K.MIST, 0.45, P.c1, P.c2, 0, 0, 0, 0, 0, seed);
      } else if (el === 'lightning') {
        for (const a of arcs) for (let i = 0; i < a.length - 1; i++) boltSeg(x + a[i][0] * r, y + a[i][1] * r, x + a[i + 1][0] * r, y + a[i + 1][1] * r, 1.2, Math.max(3, r * 0.3), 0.9, P.c2);
        quad(x, y, r * 2.4, r * 2.4, 0, K.GLOW, 0.3, P.c2, P.deep, 0.15, 3);
      }
      // lightning: white arcs over a deep violet-blue body so it doesn't wash out to white
      if (el === 'lightning') quad(x, y, r / 0.45, r / 0.45, 0, K.ORB, 1, P.c2, P.deep, code, 0.45, 0, 0, 0, seed);
      else quad(x, y, r / 0.45, r / 0.45, 0, K.ORB, 1, P.c1, P.c2, code, 0.45, 0, 0, 0, seed);
      if (el === 'frost') {
        // three crystals orbiting in a tilted ring: brighter and bigger in front, dim behind
        for (let k = 0; k < 3; k++) {
          const a = magic.time * 5 + seed * 9 + k * TAU / 3;
          const dep = Math.sin(a);
          const sx = x + Math.cos(a) * r * 1.7, sy = y + dep * r * 0.6;
          const s = r * 0.75 * (0.75 + 0.25 * dep);
          crystal(sx, sy, s, s * 0.42, Math.atan2(Math.cos(a) * 0.35, -Math.sin(a)), 0.55 + 0.45 * (dep * 0.5 + 0.5), P.c1, P.c2, seed + k);
        }
      }
    },
  });
  function emit(dt) {
    const x = p.pos.x, y = p.pos.y, z = p.pos.z, gy = ground(x, z);
    const bvx = -p.vel.x * 0.07, bvz = -p.vel.z * 0.07, bvy = -p.vel.y * 0.07;
    const rate = (r) => { let n = 0; const k = r * dt; n = Math.floor(k); if (Math.random() < k - n) n++; return n; };
    const j = () => (Math.random() - 0.5) * size * 0.8;
    if (el === 'fire') {
      for (let i = rate(big ? 60 : 38); i--;) gpart({ x: x + j(), y: y + j(), z: z + j(), gy, vx: bvx + rnd(-1.4, 1.4), vy: bvy + rnd(0.8, 2.2), vz: bvz + rnd(-1.4, 1.4), life: rnd(0.16, 0.3), size: size * rnd(1.7, 2.5), size1: size * 0.6, color: P.c1, color2: P.c2, kind: 'flame', drag: 3 });
      for (let i = rate(18); i--;) gpart({ x, y, z, gy, vx: rnd(-2, 2), vy: rnd(0.5, 3), vz: rnd(-2, 2), life: rnd(0.4, 0.8), size: 0.07, size1: 0.03, color: P.c1, color2: P.c2, kind: 'ember', gravity: 2, drag: 1.5, hot: 1 });
    } else if (el === 'frost') {
      for (let i = rate(14); i--;) gpart({ x: x + j(), y: y + j(), z: z + j(), gy, vx: bvx, vy: 0.3, vz: bvz, life: 0.55, size: size * 2.2, size1: size * 3, color: P.c1, color2: P.c2, kind: 'mist', alpha: 0.4, drag: 2 });
      for (let i = rate(16); i--;) gpart({ x: x + j() * 2, y: y + j() * 2, z: z + j() * 2, gy, vx: bvx * 0.5, vy: -0.4, vz: bvz * 0.5, life: rnd(0.25, 0.45), size: rnd(0.22, 0.38), size1: 0.05, color: P.c1, color2: P.c2, kind: 'star', drag: 1 });
    } else if (el === 'lightning') {
      for (let i = rate(34); i--;) { const a = Math.random() * TAU, s = rnd(4, 9); gpart({ x, y, z, gy, vx: Math.cos(a) * s, vy: rnd(-2, 3), vz: Math.sin(a) * s, life: rnd(0.08, 0.16), size: 0.06, color: P.hot, color2: P.c1, kind: 'spark', drag: 4, hot: 1, stretch: 0.03 }); }
    } else if (el === 'void') {
      for (let i = rate(34); i--;) gpart({ x: x + j() * 3, y: y + j() * 3, z: z + j() * 3, gy, vx: bvx * 2, vy: bvy, vz: bvz * 2, life: rnd(0.3, 0.5), size: rnd(0.18, 0.32), size1: 0.02, color: P.c1, color2: P.c2, kind: 'glow', drag: 3 });
    } else if (el === 'holy') {
      for (let i = rate(26); i--;) gpart({ x: x + j() * 2, y: y + j() * 2, z: z + j() * 2, gy, vx: bvx * 0.4, vy: rnd(0.5, 1.5), vz: bvz * 0.4, life: rnd(0.4, 0.7), size: rnd(0.12, 0.22), size1: 0.03, color: P.hot, color2: P.c1, kind: 'glow', drag: 2, hot: 1 });
    } else if (el === 'rot' || el === 'nature') {
      for (let i = rate(16); i--;) gpart({ x: x + j(), y: y + j(), z: z + j(), gy, vx: bvx, vy: 0, vz: bvz, life: rnd(0.4, 0.6), size: rnd(0.12, 0.2), size1: 0.05, color: P.c1, color2: P.c2, kind: 'glow', gravity: -7, drag: 1 });
      for (let i = rate(7); i--;) gpart({ x: x + j() * 2, y: y + j() * 2, z: z + j() * 2, gy, vy: 0.6, life: 0.4, size: 0.1, size1: 0.3, color: P.c1, color2: P.c2, kind: 'bubble' });
    } else if (el === 'blood') {
      for (let i = rate(22); i--;) gpart({ x, y, z, gy, vx: bvx + rnd(-1, 1), vy: rnd(0, 1.5), vz: bvz + rnd(-1, 1), life: rnd(0.3, 0.5), size: 0.08, color: P.c1, color2: P.c2, kind: 'spark', gravity: -12, drag: 1, hot: 0.4 });
    } else if (el === 'sound') {
      for (let i = rate(6); i--;) gpart({ x, y, z, gy, life: 0.45, size: 0.2, size1: 1.1, color: P.c1, color2: P.c2, kind: 'bubble', alpha: 0.7 });
    } else {
      for (let i = rate(18); i--;) gpart({ x: x + j(), y: y + j(), z: z + j(), gy, vx: bvx, vy: 0.4, vz: bvz, life: 0.35, size: size * 0.8, size1: 0.05, color: P.c1, color2: P.c2, kind: 'glow', drag: 2 });
    }
  }
  return f;
}
function jagArc(size) {
  const a = Math.random() * TAU, L = rnd(1.4, 2.6);
  const pts = [[0, 0]];
  for (let i = 1; i <= 4; i++) { const t = i / 4; pts.push([Math.cos(a) * L * t + rnd(-0.35, 0.35), Math.sin(a) * L * t + rnd(-0.35, 0.35)]); }
  void size;
  return pts;
}

// thin glowing trail for magic shards and elemental arrows (the pixel sprite still draws the body)
export function shardTrailFx(p) {
  const { el, P } = resolve(p.element !== 'physical' ? p.element : p.color);
  const hist = [];
  let acc = 0;
  const f = addMagic({
    gone: false,
    update(fx, dt) {
      if (!fx.gone) {
        hist.unshift([p.pos.x, p.pos.y, p.pos.z]); if (hist.length > 7) hist.pop();
        acc += dt;
        if (acc > 0.03) {
          acc = 0;
          const gy = ground(p.pos.x, p.pos.z);
          if (el === 'fire') gpart({ x: p.pos.x, y: p.pos.y, z: p.pos.z, gy, vx: rnd(-1, 1), vy: rnd(0.5, 2), vz: rnd(-1, 1), life: 0.4, size: 0.07, color: P.c1, color2: P.c2, kind: 'ember', gravity: 2, hot: 1 });
          else if (el === 'frost' || el === 'holy') gpart({ x: p.pos.x, y: p.pos.y, z: p.pos.z, gy, vy: -0.3, life: 0.3, size: 0.3, size1: 0.05, color: P.hot, color2: P.c1, kind: 'star' });
          else if (el === 'lightning') gpart({ x: p.pos.x, y: p.pos.y, z: p.pos.z, gy, vx: rnd(-6, 6), vy: rnd(-2, 3), vz: rnd(-6, 6), life: 0.1, size: 0.05, color: P.hot, color2: P.c1, kind: 'spark', hot: 1, stretch: 0.03 });
          else gpart({ x: p.pos.x, y: p.pos.y, z: p.pos.z, gy, life: 0.3, size: 0.18, size1: 0.02, color: P.c1, color2: P.c2, kind: 'glow' });
        }
      } else hist.pop();
      return !fx.gone || hist.length > 1;
    },
    draw() {
      const w = UPX * 0.13;
      for (let i = 0; i < hist.length - 1; i++) {
        const [ax, ay, az] = hist[i], [bx, by, bz] = hist[i + 1];
        const t0 = i / 6, t1 = (i + 1) / 6;
        seg(mx(bx), my(bz, by - ground(bx, bz)), mx(ax), my(az, ay - ground(ax, az)), w * (1 - t1), w * (1 - t0) + 0.4, (1 - t1) * 0.85, (1 - t0) * 0.85, P.c1, P.c2);
      }
      if (!f.gone && hist.length) {
        const x = mx(p.pos.x), y = my(p.pos.z, p.pos.y - ground(p.pos.x, p.pos.z));
        quad(x, y, UPX * 0.7, UPX * 0.7, 0, K.GLOW, 0.5, P.c1, P.c2, 0.3, 4);
      }
    },
  });
  return f;
}

// ================================================================== impacts
// Element-flavoured hit / burst. scale ~0.35 (projectile pop) .. 1.6 (big ground spell)
export function impactFx(elOrColor, x, y, z, scale = 1) {
  const { el, P } = resolve(elOrColor);
  const gy = ground(x, z);
  const n = (k) => Math.max(1, Math.round(k * scale));
  // white-hot core flash + bloom
  flareFx(x, y, z, { size: 0.65 * scale + 0.35, color: P.c1, color2: P.c2, dur: 0.16 + 0.05 * scale, star: el === 'holy' || el === 'lightning' || el === 'frost' || el === 'physical' });
  switch (el) {
    case 'fire':
      gburst(x, y, z, { count: n(8), speed: 4.5 * scale + 1.5, kind: 'flame', size: Math.min(1.1, 0.6 * scale + 0.3), size1: 0.2, color: P.c1, color2: P.c2, life: 0.45, gravity: 2.5, drag: 4, up: 0.6, spread: 1.6 });
      gburst(x, y, z, { count: n(14), speed: 9 * scale + 3, kind: 'ember', size: 0.08, color: P.c1, color2: P.c2, life: 0.7, gravity: -6, drag: 1.6, up: 0.9, hot: 1, stretch: 0.05 });
      break;
    case 'frost':
      gburst(x, y, z, { count: n(9), speed: 7 * scale + 2, kind: 'shard', size: 0.5 * scale + 0.3, size1: 0.2, color: P.c1, color2: P.c2, life: 0.5, gravity: -14, drag: 2, up: 0.7 });
      gburst(x, y, z, { count: n(3), speed: 1.5, kind: 'mist', size: 1.2 * scale + 0.5, size1: 2 * scale + 0.6, color: P.c1, color2: P.c2, life: 0.8, gravity: 0, drag: 2, alpha: 0.55 });
      gburst(x, y, z, { count: n(8), speed: 3, kind: 'star', size: 0.35, size1: 0.05, color: P.hot, color2: P.c1, life: 0.45, gravity: -1, drag: 2 });
      break;
    case 'lightning':
      for (let i = 0; i < n(4); i++) { const a = Math.random() * TAU, L = rnd(1, 2.4) * (0.6 + scale * 0.5); boltFx(x, y, z, x + Math.cos(a) * L, y + rnd(-0.5, 0.8), z + Math.sin(a) * L, { color: P.c1, dur: 0.12, width: 0.6, branches: 0, segs: 3 }); }
      gburst(x, y, z, { count: n(16), speed: 12 * scale + 4, kind: 'spark', size: 0.07, color: P.hot, color2: P.c1, life: 0.2, gravity: -6, drag: 3, hot: 1, stretch: 0.035 });
      break;
    case 'void': {
      // implosion: motes rush inward, then a ring snaps outward
      for (let i = 0; i < n(18); i++) {
        const a = Math.random() * TAU, r = rnd(1.2, 2) * (0.5 + scale * 0.6), life = rnd(0.25, 0.4);
        gpart({ x: x + Math.cos(a) * r, y: y + rnd(-0.6, 0.6), z: z + Math.sin(a) * r, gy, vx: -Math.cos(a) * r / life, vz: -Math.sin(a) * r / life, life, size: rnd(0.15, 0.3), size1: 0.05, color: P.c1, color2: P.c2, kind: 'glow', drag: 0, hot: 0.6 });
      }
      vortexFx(x, y, z, { radius: 1.1 * scale + 0.4, dur: 0.4, P });
      break;
    }
    case 'holy':
      gburst(x, y, z, { count: n(12), speed: 2.5, kind: 'glow', size: 0.2, size1: 0.04, color: P.hot, color2: P.c1, life: 0.9, gravity: 2.5, drag: 2, up: 1.2, hot: 1 });
      gburst(x, y, z, { count: n(8), speed: 8 * scale + 2, kind: 'spark', size: 0.08, color: P.c1, color2: P.c2, life: 0.25, gravity: 0, drag: 3, hot: 1 });
      break;
    case 'rot': case 'nature':
      gburst(x, y, z, { count: n(3), speed: 1.2, kind: 'mist', size: 1.1 * scale + 0.5, size1: 1.9 * scale + 0.6, color: P.c1, color2: P.c2, life: 0.9, gravity: 0.4, drag: 2, alpha: 0.55 });
      gburst(x, y, z, { count: n(9), speed: 3, kind: 'bubble', size: 0.12, size1: 0.35, color: P.c1, color2: P.c2, life: 0.55, gravity: 1, drag: 2, up: 1 });
      gburst(x, y, z, { count: n(10), speed: 5 * scale + 2, kind: 'glow', size: 0.16, size1: 0.06, color: P.c1, color2: P.c2, life: 0.5, gravity: -12, drag: 1, up: 1 });
      break;
    case 'blood':
      gburst(x, y, z, { count: n(14), speed: 7 * scale + 2, kind: 'spark', size: 0.1, color: P.c1, color2: P.c2, life: 0.5, gravity: -16, drag: 1.2, up: 0.9, hot: 0.4 });
      gburst(x, y, z, { count: n(2), speed: 1, kind: 'mist', size: 0.9 * scale + 0.4, size1: 1.5 * scale, color: P.c1, color2: P.deep, life: 0.6, alpha: 0.5, gravity: 0 });
      break;
    case 'water':
      gburst(x, y, z, { count: n(14), speed: 6 * scale + 2, kind: 'spark', size: 0.09, color: P.c1, color2: P.c2, life: 0.5, gravity: -16, drag: 1.2, up: 1.1, hot: 0.6 });
      gburst(x, y, z, { count: n(2), speed: 1, kind: 'mist', size: 1 * scale + 0.4, size1: 1.6 * scale, color: P.c1, color2: P.c2, life: 0.6, alpha: 0.45, gravity: 0 });
      break;
    case 'sound':
      for (let i = 0; i < 3; i++) setTimeout(() => ringFx(x, y, z, { radius: 1.4 * scale + 0.6, color: P.c1, color2: P.c2, dur: 0.3, th: 0.12, noise: 0.1 }), i * 70);
      break;
    default:
      gburst(x, y, z, { count: n(10), speed: 8 * scale + 3, kind: 'spark', size: 0.07, color: P.c1, color2: P.c2, life: 0.22, gravity: -8, drag: 3, hot: 1 });
  }
  if (scale >= 0.5 && (el === 'fire' || el === 'void' || el === 'frost')) scorchFx(x, z, 0.5 * scale + 0.3, el, 1.4, 0.5);
  if (scale >= 0.5 && el !== 'sound') ringFx(x, gy, z, { radius: 0.9 * scale + 0.5, color: P.c1, color2: P.c2, dur: 0.25, th: 0.18, noise: el === 'fire' ? 0.6 : 0.3, r0: 0.15 });
}

// big area explosion (fireballs, flasks, ground spells)
export function explosionFx(elOrColor, x, y, z, radius = 3) {
  const { el, P } = resolve(elOrColor);
  const gy = ground(x, z);
  const sc = Math.min(2.2, 0.5 + radius * 0.35);
  impactFx(el, x, y, z, sc);
  shellFx(x, y, z, { radius: radius * 0.85, color: P.c1, color2: P.c2, dur: 0.32 });
  scorchFx(x, z, radius * 0.8, el, el === 'frost' ? 3 : 2.4, el === 'fire' ? 0.7 : 0.6);
  ringFx(x, gy, z, { radius: radius * 1.1, color: P.c1, color2: P.c2, dur: 0.42, th: 0.28, noise: el === 'fire' ? 0.7 : 0.45, fill: 0.5 });
  if (el === 'fire') {
    gburst(x, y + 0.3, z, { count: Math.round(8 + radius * 2.5), speed: radius * 2.8, kind: 'flame', size: 0.8 + radius * 0.14, size1: 0.3, color: P.c1, color2: P.c2, life: 0.6, gravity: 3, drag: 4.5, up: 0.25, spread: 0.8, alpha: 0.85 });
    gburst(x, y + 0.5, z, { count: Math.round(10 + radius * 5), speed: radius * 3, kind: 'ember', size: 0.09, color: P.c1, color2: P.c2, life: 1.1, gravity: 1.5, drag: 1.8, up: 0.9, hot: 1 });
  } else if (el === 'frost') {
    gburst(x, y + 0.3, z, { count: Math.round(8 + radius * 3), speed: radius * 3, kind: 'shard', size: 0.55, size1: 0.2, color: P.c1, color2: P.c2, life: 0.55, gravity: -14, drag: 2, up: 0.5 });
  } else if (el === 'void') {
    vortexFx(x, y, z, { radius: radius * 0.8, dur: 0.6, P });
  }
}

// soft bloom + optional 4-point star at a point
export function flareFx(x, y, z, o = {}) {
  const c1 = col(o.color || '#ffffff'), c2 = col(o.color2 || o.color || '#ffffff');
  const dur = o.dur || 0.18, size = o.size || 1, gy = ground(x, z);
  const rot = Math.random() * 0.6 - 0.3;
  return addMagic({
    update(f, dt) { f.t += dt; return f.t < dur; },
    draw(f) {
      const u = f.t / dur, X = mx(x), Y = my(z, y - gy);
      const s = size * UPX;
      quad(X, Y, s * (1 + u * 0.6), s * (1 + u * 0.6), 0, K.GLOW, (1 - u) ** 1.5 * 0.85, c1, c2, 0.55, 3.5);
      if (o.star) quad(X, Y, s * 1.8 * (0.6 + u * 0.6), s * 1.8 * (0.6 + u * 0.6), rot, K.STAR, (1 - u) ** 2, c1, c2, 34, 3, 0.35);
    },
  });
}

// ================================================================== rings, domes, vortices
export function ringFx(x, y, z, o = {}) {
  const { P } = resolve(o.color || '#ffd080');
  const c1 = o.color && !elementOf(o.color) ? col(o.color) : P.c1, c2 = o.color2 ? col(o.color2) : P.c2;
  const r0 = (o.r0 ?? 0.3), r1 = o.radius || 4, dur = o.dur || 0.45, th = o.th ?? 0.22;
  const gy = ground(x, z), h = Math.max(0, y - gy) * 0.2;
  const seed = Math.random();
  const noise = o.noise ?? 0.3;
  return addMagic({
    update(f, dt) { f.t += dt; return f.t < dur; },
    draw(f) {
      const u = clamp01(f.t / dur);
      const r = (r0 + (r1 - r0) * easeOut(u)) * UPX;
      quad(mx(x), my(z, h), r, r * (o.squash ?? 1), 0, K.RING, (1 - u) ** 1.2 * (o.alpha ?? 1), c1, c2, th * (1 - u * 0.6), noise, 2, (o.fill || 0) * (1 - u), u, seed);
    },
  });
}
// expanding translucent sphere shell (reads as a 3D blast dome)
export function shellFx(x, y, z, o = {}) {
  const c1 = col(o.color || '#ffffff'), c2 = col(o.color2 || o.color || '#ffffff');
  const dur = o.dur || 0.3, R = o.radius || 2, gy = ground(x, z), seed = Math.random();
  const h = Math.max(0.4, y - gy);
  return addMagic({
    update(f, dt) { f.t += dt; return f.t < dur; },
    draw(f) {
      const u = clamp01(f.t / dur);
      const r = R * easeOut(u) * UPX;
      quad(mx(x), my(z, h * (1 - u * 0.5)), r, r * 0.92, 0, K.SHELL, (1 - u) ** 1.4 * 0.9, c1, c2, 4.5, 0, 0, 0, u, seed);
    },
  });
}
export function vortexFx(x, y, z, o = {}) {
  const P = o.P || PALETTE.void;
  const dur = o.dur || 0.5, R = o.radius || 1.5, gy = ground(x, z), seed = Math.random();
  return addMagic({
    update(f, dt) { f.t += dt; return f.t < dur; },
    draw(f) {
      const u = clamp01(f.t / dur);
      const r = R * (1 - u * 0.75) * UPX;
      shade(mx(x), my(z, Math.max(0, y - gy) * 0.6), r * 1.1, r * 0.95, TINT.void, 0.6 * Math.sin(u * Math.PI));
      quad(mx(x), my(z, Math.max(0, y - gy) * 0.6), r, r * 0.85, 0, K.VORTEX, Math.sin(u * Math.PI), P.c1, P.c2, 4, -f.t * 16, 0.18, 0, u, seed);
    },
  });
}

// ================================================================== pillars, circles, shafts
// rune circle on the ground. o.follow: entity to stay under; o.reveal: seconds to draw on
export function circleFx(x, y, z, o = {}) {
  const { P } = resolve(o.color || 'holy');
  const dur = o.dur || 1, R = o.radius || 2, reveal = o.reveal ?? 0.25, seed = Math.random() * 10;
  const spin = o.spin ?? 1.2;
  return addMagic({
    update(f, dt) { f.t += dt; return f.t < dur; },
    draw(f) {
      const u = f.t / dur;
      const ex = o.follow ? o.follow.pos.x : x, ez = o.follow ? o.follow.pos.z : z;
      const a = Math.min(1, f.t / 0.08) * (u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1) * (o.alpha ?? 1);
      const r = R * UPX * (0.85 + 0.15 * easeOut(Math.min(1, f.t / 0.2)));
      quad(mx(ex), my(ez, 0.02), r, r * (o.squash ?? 1), 0, K.CIRCLE, a, P.c1, P.c2, Math.min(1, f.t / reveal), f.t * spin + seed, seed);
    },
  });
}
export function pillarFx(x, y, z, o = {}) {
  const { el, P } = resolve(o.color || 'holy');
  const H = (o.height || 14) * 0.62, R = o.radius || 1.2, dur = o.dur || 0.5;
  const gy = ground(x, z), base = Math.max(0, y - gy), seed = Math.random();
  circleFx(x, y, z, { radius: R * 1.7, color: el !== 'custom' ? el : o.color, dur: dur + 0.35, reveal: 0.1, spin: 2 });
  gburst(x, gy + 0.2, z, { count: Math.round(10 + R * 6), speed: 2, kind: 'glow', size: 0.18, size1: 0.03, color: P.hot, color2: P.c1, life: 0.9, gravity: 5, drag: 1.5, up: 1.4, spread: 0.3, jitter: R * 1.6, hot: 1 });
  return addMagic({
    update(f, dt) { f.t += dt; return f.t < dur; },
    draw(f) {
      const u = clamp01(f.t / dur);
      const grow = easeOut(clamp01(f.t / 0.07));
      const w = R * UPX * (u < 0.12 ? 1.35 : 1.25 - (u - 0.12) * 0.9);
      const hh = H * UPX * grow;
      const X = mx(x), Yb = my(z, base);
      const a = u > 0.4 ? 1 - (u - 0.4) / 0.6 : 1;
      quad(X, Yb - hh / 2, w, hh / 2 + 1, 0, K.SHAFT, a * 0.8, P.c1, P.c2, 3.5, 22, 0, 0, u, seed);
      quad(X, Yb, w * 2.4, w * 1.4, 0, K.GLOW, a * 0.6, P.c1, P.c2, 0.4, 3);
    },
  });
}

// ================================================================== lightning & beams
// Fractal bolt with branches (midpoint displacement); flickers and re-strikes once.
export function boltFx(ax, ay, az, bx, by, bz, o = {}) {
  const { P } = resolve(o.color || 'lightning');
  const c1 = o.color && !elementOf(o.color) ? col(o.color) : P.c1;
  const dur = o.dur || 0.18, width = o.width || 1;
  const gA = ground(ax, az), gB = ground(bx, bz);
  // world-pixel coordinates (camera independent)
  const A = [ax * PPU, az * PPU - (ay - gA) * PPU], B = [bx * PPU, bz * PPU - (by - gB) * PPU];
  const depth = o.segs ? Math.max(2, Math.ceil(Math.log2(o.segs))) : 5;
  const jag = o.jag ?? 0.22;
  let paths;
  const build = () => {
    const main = fractal(A, B, depth, jag);
    paths = [{ pts: main, w: 1, a: 1 }];
    const nb = o.branches ?? (Math.hypot(B[0] - A[0], B[1] - A[1]) > 60 ? 3 : 1);
    for (let k = 0; k < nb; k++) {
      const i = Math.floor(rnd(0.25, 0.8) * (main.length - 1));
      const s = main[i];
      const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx) + (Math.random() < 0.5 ? -1 : 1) * rnd(0.35, 0.9);
      const l = L * rnd(0.15, 0.35);
      paths.push({ pts: fractal(s, [s[0] + Math.cos(ang) * l, s[1] + Math.sin(ang) * l], 3, jag * 1.2), w: 0.55, a: 0.65 });
    }
  };
  build();
  if (ay - by > 8) scorchFx(bx, bz, 0.9 * width, 'lightning', 1.6, 0.6);
  let restruck = false;
  return addMagic({
    update(f, dt) {
      f.t += dt;
      if (!restruck && f.t > dur * 0.45) { restruck = true; build(); }
      return f.t < dur;
    },
    draw(f) {
      const u = f.t / dur;
      const flick = (0.65 + Math.random() * 0.35) * (1 - u * u);
      const toX = mxw, toY = myw;
      const core = Math.max(1, Math.max(1.3, UPX * 0.07) * width), glow = Math.max(3, Math.max(4, UPX * 0.3) * width);   // art px: keep a 1px core
      for (const p of paths) {
        const pts = p.pts;
        for (let i = 0; i < pts.length - 1; i++) boltSeg(toX(pts[i][0]), toY(pts[i][1]), toX(pts[i + 1][0]), toY(pts[i + 1][1]), core * p.w, glow * p.w, flick * p.a, c1);
      }
      const X = toX(B[0]), Y = toY(B[1]);
      quad(X, Y, glow * 4, glow * 4, 0, K.GLOW, flick * 0.8, P.hot, c1, 0.8, 3);
      quad(toX(A[0]), toY(A[1]), glow * 2, glow * 2, 0, K.GLOW, flick * 0.5, P.hot, c1, 0.5, 3);
    },
  });
}
function fractal(A, B, depth, jag) {
  let pts = [A, B];
  let disp = Math.hypot(B[0] - A[0], B[1] - A[1]) * jag;
  for (let d = 0; d < depth; d++) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
      const off = (Math.random() - 0.5) * disp;
      out.push([(x0 + x1) / 2 - dy / L * off, (y0 + y1) / 2 + dx / L * off], pts[i + 1]);
    }
    pts = out;
    disp *= 0.55;
  }
  return pts;
}
export function beamFx(ax, ay, az, bx, by, bz, o = {}) {
  const { P } = resolve(o.color || 'void');
  const dur = o.dur || 0.1, w = (o.width || 0.25), seed = Math.random();
  const gA = ground(ax, az), gB = ground(bx, bz);
  return addMagic({
    update(f, dt) { f.t += dt; return f.t < dur; },
    draw(f) {
      const u = f.t / dur;
      const X0 = mx(ax), Y0 = my(az, ay - gA), X1 = mx(bx), Y1 = my(bz, by - gB);
      const L = Math.hypot(X1 - X0, Y1 - Y0);
      const hw = w * UPX * 1.8;
      const a = 1 - u * u;
      quad((X0 + X1) / 2, (Y0 + Y1) / 2, L / 2 + hw, hw, Math.atan2(Y1 - Y0, X1 - X0), K.BEAM, a, P.c1, P.c2, Math.max(2, hw * 0.35), 9, 0, 0, u, seed);
      quad(X1, Y1, hw * 3, hw * 3, 0, K.GLOW, a * 0.9, P.hot, P.c2, 0.9, 3);
      quad(X0, Y0, hw * 2, hw * 2, 0, K.GLOW, a * 0.7, P.hot, P.c1, 0.6, 3);
    },
  });
}

// ================================================================== zones
// Persistent ground hazard, styled per element. h: hazard object (x, z, radius, life, age, element)
export function zoneFx(h) {
  const { el, P } = resolve(h.element !== 'physical' ? h.element : h.color);
  const seed = Math.random() * 10;
  let acc = 0, boltT = 0;
  return addMagic({
    zone: true,
    update(f, dt) {
      f.t += dt;
      if (h.gone) return false;
      const R = h.radius;
      acc += dt * (6 + R * R * 1.4);
      const gy = ground(h.x, h.z);
      const pt = () => { const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * R * 0.92; return [h.x + Math.cos(a) * r, h.z + Math.sin(a) * r]; };
      while (acc > 1) {
        acc -= 1;
        const [x, z] = pt();
        if (el === 'fire') {
          gpart({ x, y: gy + 0.1, z, gy, vy: rnd(1, 2.4), life: rnd(0.4, 0.7), size: rnd(0.5, 0.9), size1: 0.15, color: P.c1, color2: P.c2, kind: 'flame', drag: 1.5 });
          if (Math.random() < 0.3) gpart({ x, y: gy + 0.2, z, gy, vx: rnd(-1, 1), vy: rnd(1.5, 3.5), vz: rnd(-1, 1), life: 0.8, size: 0.07, color: P.c1, color2: P.c2, kind: 'ember', gravity: 1, hot: 1 });
        } else if (el === 'frost' || el === 'water') {
          if (el === 'frost' && Math.random() < 0.5) { const a = Math.random() * TAU; gpart({ x: h.x, y: gy, z: h.z, gy, life: rnd(0.5, 0.9), size: rnd(0.06, 0.1), color: P.hot, color2: P.c1, kind: 'glow', hot: 1, orbit: { x: h.x, y: gy, z: h.z, a, w: rnd(2.5, 4), r: Math.sqrt(Math.random()) * R * 0.95, h: rnd(0.2, 2), vh: -0.6, sq: 1 } }); continue; }
          if (Math.random() < 0.45) gpart({ x, y: gy + 0.3, z, gy, vx: rnd(-0.3, 0.3), vy: 0.15, vz: rnd(-0.3, 0.3), life: 1.4, size: 1.1, size1: 1.6, color: P.c1, color2: P.c2, kind: 'mist', alpha: 0.35, drag: 0.5 });
          else gpart({ x, y: gy + rnd(0.1, 1.2), z, gy, vy: 0.2, life: rnd(0.3, 0.6), size: rnd(0.25, 0.4), size1: 0.04, color: P.hot, color2: P.c1, kind: 'star' });
        } else if (el === 'rot' || el === 'nature' || el === 'blood') {
          if (Math.random() < 0.4) gpart({ x, y: gy + 0.3, z, gy, vy: 0.3, life: 1.3, size: 1, size1: 1.5, color: P.c1, color2: P.c2, kind: 'mist', alpha: 0.32, drag: 0.5 });
          else gpart({ x, y: gy + 0.05, z, gy, vy: 0.5, life: rnd(0.35, 0.6), size: 0.06, size1: rnd(0.25, 0.4), color: P.c1, color2: P.c2, kind: 'bubble' });
        } else if (el === 'void') {
          const a = Math.random() * TAU;
          gpart({ x: h.x, y: gy, z: h.z, gy, life: 0.9, size: rnd(0.15, 0.28), size1: 0.03, color: P.c1, color2: P.c2, kind: 'glow', orbit: { x: h.x, y: gy, z: h.z, a, w: 3.5, r: R * 0.95, vr: -R * 0.9, h: 0.15, vh: 0.6, sq: 1 } });
        } else if (el === 'holy') {
          gpart({ x, y: gy + 0.1, z, gy, vy: rnd(1.2, 2.4), life: rnd(0.6, 1), size: rnd(0.12, 0.22), size1: 0.03, color: P.hot, color2: P.c1, kind: 'glow', drag: 0.5, hot: 1 });
        } else if (el === 'lightning') {
          gpart({ x, y: gy + rnd(0.1, 0.6), z, gy, vx: rnd(-5, 5), vy: rnd(0, 3), vz: rnd(-5, 5), life: 0.12, size: 0.06, color: P.hot, color2: P.c1, kind: 'spark', hot: 1, stretch: 0.03 });
        } else {
          gpart({ x, y: gy + 0.1, z, gy, vy: rnd(0.6, 1.4), life: 0.7, size: 0.2, size1: 0.03, color: P.c1, color2: P.c2, kind: 'glow' });
        }
      }
      if (el === 'lightning') {
        boltT -= dt;
        if (boltT <= 0) { boltT = rnd(0.12, 0.3); const [x0, z0] = pt(), [x1, z1] = pt(); boltFx(x0, gy + 0.2, z0, x1, gy + 0.2, z1, { color: P.c1, dur: 0.12, width: 0.55, branches: 0, segs: 8 }); }
      }
      return true;
    },
    draw(f) {
      const X = mx(h.x), Y = my(h.z, 0), r = h.radius * UPX;
      const fade = Math.min(1, h.life * 1.5) * Math.min(1, f.t * 4);
      if (el !== 'holy') shade(X, Y, r * 1.05, r * 1.05, TINT[el] || TINT.custom, (ZONE_DARK[el] ?? 0.35) * fade, true, seed, 2);
      quad(X, Y, r * 1.08, r * 1.08, 0, K.GLOW, 0.32 * fade, P.c2, P.deep, 0, 2.2);
      quad(X, Y, r, r, 0, K.RING, 0.4 * fade, P.c1, P.c2, 0.22, 0.8, 1.5, 0.2, 1, seed);
      if (el === 'holy') quad(X, Y, r * 0.95, r * 0.95, 0, K.CIRCLE, 0.7 * fade, P.c1, P.c2, 1, f.t * 0.8 + seed, seed);
      else if (el === 'void') quad(X, Y, r * 0.95, r * 0.95, 0, K.VORTEX, 0.8 * fade, P.c1, P.c2, 4, -f.t * 3 + seed, 0.12, 0, 0, seed);
      else if (el === 'fire') quad(X, Y, r * 0.9, r * 0.9, 0, K.GLOW, 0.35 * fade * (0.85 + 0.15 * Math.sin(f.t * 13)), P.c1, P.c2, 0, 2.5);
      else if (el === 'frost') quad(X, Y, r * 0.95, r * 0.95, seed, K.MIST, 0.45 * fade, P.c1, P.c2, 0, 0, 0, 0, 0, seed);
    },
  });
}

// ================================================================== casting & bodies
// rune circle under the caster + motes converging into the casting hand
export function castFx(ent, elOrColor, castT = 0.25) {
  const { el, P } = resolve(elOrColor);
  circleFx(ent.pos.x, ent.pos.y, ent.pos.z, { radius: 1.45, color: el !== 'custom' ? el : elOrColor, dur: castT + 0.45, reveal: Math.max(0.12, castT * 0.8), spin: 2.4, follow: ent, alpha: 0.9 });
  const hand = new Vec3();
  let acc = 0;
  return addMagic({
    update(f, dt) {
      f.t += dt;
      if (f.t < castT) {
        acc += dt * 60;
        if (ent.model?.handPos) ent.model.handPos(hand); else hand.set(ent.pos.x, ent.pos.y + 1.3, ent.pos.z);
        const gy = ground(hand.x, hand.z);
        while (acc > 1) {
          acc -= 1;
          const a = Math.random() * TAU, r = rnd(1, 1.8), life = rnd(0.16, 0.26);
          const ox = Math.cos(a) * r, oz = Math.sin(a) * r * 0.5, oy = rnd(-0.8, 0.9);
          gpart({ x: hand.x + ox, y: hand.y + oy, z: hand.z + oz, gy, vx: -ox / life, vy: -oy / life, vz: -oz / life, life, size: rnd(0.08, 0.14), size1: 0.03, color: P.hot, color2: P.c1, kind: el === 'lightning' ? 'spark' : 'glow', drag: 0, hot: 1, stretch: 0.02 });
        }
      }
      return f.t < castT + 0.15;
    },
    draw(f) {
      if (ent.model?.handPos) ent.model.handPos(hand); else hand.set(ent.pos.x, ent.pos.y + 1.3, ent.pos.z);
      const k = clamp01(f.t / Math.max(0.05, castT));
      const a = f.t < castT ? 0.4 + 0.6 * k : Math.max(0, 1 - (f.t - castT) / 0.15);
      const X = mx(hand.x), Y = my(hand.z, hand.y - ground(hand.x, hand.z));
      const s = UPX * (0.35 + 0.45 * k);
      quad(X, Y, s * 2, s * 2, 0, K.GLOW, a, P.hot, P.c2, 1, 3.5);
      quad(X, Y, s * 2.4, s * 2.4, f.t * 3, K.STAR, a * 0.7, P.c1, P.c2, 40, 4, 0.4);
    },
  });
}

// glowing hoops rising around a body (buffs, wards, level ups) + a spiral of motes
export function hoopsFx(ent, elOrColor, o = {}) {
  const { P } = resolve(elOrColor);
  const dur = o.dur || 0.85, R = o.radius || 1.15, n = o.count || 3, top = o.height || 2.3;
  for (let i = 0; i < 18; i++) {
    gpart({ x: ent.pos.x, y: ent.pos.y, z: ent.pos.z, life: rnd(0.6, 0.9), size: rnd(0.1, 0.18), size1: 0.03, color: P.hot, color2: P.c1, kind: 'glow', hot: 1,
      orbit: { follow: ent, a: (i / 18) * TAU, w: 6, r: R * 0.95, vr: -0.3, h: 0.1 + (i % 3) * 0.2, vh: rnd(2.2, 3.2), sq: 0.42 } });
  }
  return addMagic({
    update(f, dt) { f.t += dt; return f.t < dur; },
    draw(f) {
      for (let i = 0; i < n; i++) {
        const u = clamp01((f.t - i * 0.12) / (dur - 0.24));
        if (u <= 0 || u >= 1) continue;
        const hgt = 0.05 + top * easeOut(u);
        const r = R * (1 - u * 0.3) * UPX;
        const a = Math.sin(u * Math.PI);
        quad(mx(ent.pos.x), my(ent.pos.z, hgt + (ent.pos.y - ground(ent.pos.x, ent.pos.z))), r, r * 0.38, 0, K.RING, a, P.c1, P.c2, 0.35, 0.25, 3, 0, u, i * 0.37);
      }
    },
  });
}
export function healFx(ent, elOrColor = 'nature') {
  const { P } = resolve(elOrColor);
  hoopsFx(ent, elOrColor, { count: 2, dur: 0.9 });
  const gy = ground(ent.pos.x, ent.pos.z);
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * TAU, r = rnd(0.2, 1.1);
    gpart({ x: ent.pos.x + Math.cos(a) * r, y: ent.pos.y + rnd(0.2, 1.8), z: ent.pos.z + Math.sin(a) * r * 0.5, gy, vy: rnd(1.2, 2.2), life: rnd(0.7, 1.1), size: rnd(0.3, 0.45), size1: 0.1, color: P.hot, color2: P.c1, kind: 'star', rot: 0, drag: 1.5, fadeIn: 0.2 });
  }
  return addMagic({
    update(f, dt) { f.t += dt; return f.t < 0.8; },
    draw(f) {
      const u = f.t / 0.8;
      const X = mx(ent.pos.x), Yb = my(ent.pos.z, ent.pos.y - ground(ent.pos.x, ent.pos.z));
      const w = UPX * 1.05, hh = UPX * 3.4 * easeOut(clamp01(f.t / 0.12));
      quad(X, Yb - hh / 2, w, hh / 2 + 1, 0, K.SHAFT, Math.sin(Math.min(1, u * 1.4) * Math.PI) * 0.75, P.c1, P.c2, 2, 14, 0, 0, u, 0.3);
    },
  });
}

// blink / teleport: a bright streak from where you were to where you are, plus afterimages
export function blinkFx(ax, ay, az, bx, by, bz, elOrColor = 'void') {
  const { el, P } = resolve(elOrColor);
  impactFx(el === 'custom' ? elOrColor : el, ax, ay + 1, az, 0.5);
  impactFx(el === 'custom' ? elOrColor : el, bx, by + 1, bz, 0.6);
  const gA = ground(ax, az), gB = ground(bx, bz);
  return addMagic({
    update(f, dt) { f.t += dt; return f.t < 0.35; },
    draw(f) {
      const u = f.t / 0.35;
      const X0 = mx(ax), Y0 = my(az, ay - gA + 1), X1 = mx(bx), Y1 = my(bz, by - gB + 1);
      const w = UPX * 0.55 * (1 - u * 0.6);
      seg(X0, Y0, X1, Y1, w * 0.2, w, (1 - u) * 0.6, 1 - u, P.c1, P.c2);
      for (let k = 1; k <= 3; k++) { const t = k / 4; quad(X0 + (X1 - X0) * t, Y0 + (Y1 - Y0) * t, UPX * 0.9, UPX * 1.3, 0, K.GLOW, (1 - u) * 0.35 * t, P.c1, P.c2, 0, 3); }
    },
  });
}

// dash / lunge: a ribbon that follows the body for the length of the dash, shedding element bits
export function dashTrailFx(ent, elOrColor, dur = 0.32) {
  const { el, P } = resolve(elOrColor);
  const hist = [];
  return addMagic({
    update(f, dt) {
      f.t += dt;
      if (f.t < dur) {
        hist.unshift([ent.pos.x, ent.pos.y + 0.9, ent.pos.z]);
        if (hist.length > 10) hist.pop();
        const gy = ground(ent.pos.x, ent.pos.z);
        const b = { x: ent.pos.x + rnd(-0.3, 0.3), y: ent.pos.y + rnd(0.3, 1.4), z: ent.pos.z + rnd(-0.3, 0.3), gy, vx: rnd(-1, 1), vy: rnd(0, 1), vz: rnd(-1, 1), drag: 2 };
        if (el === 'fire') gpart({ ...b, life: 0.35, size: 0.6, size1: 0.2, color: P.c1, color2: P.c2, kind: 'flame', gravity: 2 });
        else if (el === 'frost') { gpart({ ...b, life: 0.4, size: 0.3, size1: 0.05, color: P.hot, color2: P.c1, kind: 'star' }); if (Math.random() < 0.3) gpart({ ...b, life: 0.5, size: 0.35, size1: 0.15, color: P.c1, color2: P.c2, kind: 'shard', gravity: -8 }); }
        else if (el === 'lightning') gpart({ ...b, vx: rnd(-6, 6), vz: rnd(-6, 6), life: 0.12, size: 0.06, color: P.hot, color2: P.c1, kind: 'spark', hot: 1 });
        else if (el !== 'physical') gpart({ ...b, life: 0.4, size: 0.2, size1: 0.03, color: P.c1, color2: P.c2, kind: 'glow' });
      } else hist.pop();
      return f.t < dur || hist.length > 1;
    },
    draw() {
      const w = UPX * (el === 'physical' ? 0.35 : 0.5);
      const a = el === 'physical' ? 0.35 : 0.85;
      for (let i = 0; i < hist.length - 1; i++) {
        const [ax, ay, az] = hist[i], [bx, by, bz] = hist[i + 1];
        const t0 = i / 9, t1 = (i + 1) / 9;
        seg(mx(bx), my(bz, ay - ground(ax, az)), mx(ax), my(az, by - ground(bx, bz)), w * (1 - t1), w * (1 - t0), a * (1 - t1), a * (1 - t0), P.c1, P.c2);
      }
    },
  });
}

// elemental slash crescent drawn under the crisp pixel smear
export function arcFx(x, y, z, facing, o = {}) {
  const { P } = resolve(o.color || 'fire');
  const R = (o.radius || 2.4), arc = (o.arc || 110) * Math.PI / 180, dur = (o.dur || 0.16) * 1.15;
  const a0 = Math.atan2(Math.cos(facing), Math.sin(facing));
  const lift = o.h ?? 0.7, gy = ground(x, z), seed = Math.random();
  const span = arc;
  const { el } = resolve(o.color || 'fire');
  const P2 = resolve(o.color || 'fire').P;
  let emitted = 0;
  return addMagic({
    update(f, dt) {
      f.t += dt;
      // shed element particles off the leading edge of the swing
      const u = clamp01(f.t / dur), head = span * easeOut(clamp01(u / 0.42));
      const want = Math.floor(14 * clamp01(u / 0.42));
      for (; emitted < want; emitted++) {
        const sa = a0 - span / 2 + head * (o.reverse ? -1 : 1) * (o.reverse ? -1 : 1);
        const ang = o.reverse ? a0 + span / 2 - head : sa;
        const px = x + Math.cos(ang) * R * rnd(0.75, 1), pz = z + Math.sin(ang) * R * rnd(0.75, 1), py = y + lift + rnd(-0.2, 0.3);
        const tx = -Math.sin(ang) * (o.reverse ? -1 : 1), tz = Math.cos(ang) * (o.reverse ? -1 : 1);
        const b = { x: px, y: py, z: pz, gy, vx: tx * rnd(2, 5), vy: rnd(0, 1.5), vz: tz * rnd(2, 5), drag: 3 };
        if (el === 'fire') gpart({ ...b, life: rnd(0.25, 0.4), size: 0.45, size1: 0.15, color: P2.c1, color2: P2.c2, kind: 'flame', gravity: 2 });
        else if (el === 'frost') gpart({ ...b, life: 0.35, size: 0.3, size1: 0.05, color: P2.hot, color2: P2.c1, kind: 'star' });
        else if (el === 'lightning') gpart({ ...b, vx: b.vx * 2, vz: b.vz * 2, life: 0.14, size: 0.06, color: P2.hot, color2: P2.c1, kind: 'spark', hot: 1 });
        else gpart({ ...b, life: 0.35, size: 0.16, size1: 0.03, color: P2.c1, color2: P2.c2, kind: 'glow' });
      }
      return f.t < dur;
    },
    draw(f) {
      const u = clamp01(f.t / dur);
      const head = span * easeOut(clamp01(u / 0.42));
      const tail = span * clamp01((u - 0.18) / 0.82) ** 1.6;
      const r = R * UPX * 1.04;
      const fade = u > 0.65 ? 1 - (u - 0.65) / 0.35 : 1;
      quad(mx(x), my(z, y - gy + lift), r, o.reverse ? -r : r, a0, K.ARC, fade, P.c1, P.c2, span / 2, head, tail, o.heavy ? 0.55 : 0.42, u, seed);
    },
  });
}

// cone spells (breath, sprays): a stream of element particles fanning out
export function coneFx(x, y, z, ang, R, A, elOrColor) {
  const { el, P } = resolve(elOrColor);
  const half = A * Math.PI / 360;
  const gy = ground(x, z);
  const n = 26;
  for (let i = 0; i < n; i++) {
    const a = ang + (Math.random() * 2 - 1) * half, sp = R * rnd(1.8, 2.8);
    const base = { x: x + Math.sin(a) * 0.6, y: y, z: z + Math.cos(a) * 0.6, gy, vx: Math.sin(a) * sp, vy: rnd(-0.2, 1), vz: Math.cos(a) * sp, drag: 2.6 };
    if (el === 'fire') gpart({ ...base, life: rnd(0.35, 0.5), size: 0.45, size1: 1.3, color: P.c1, color2: P.c2, kind: 'flame', gravity: 2 });
    else if (el === 'frost') { gpart({ ...base, life: 0.5, size: 0.6, size1: 1.5, color: P.c1, color2: P.c2, kind: 'mist', alpha: 0.5 }); if (i % 3 === 0) gpart({ ...base, life: 0.4, size: 0.4, size1: 0.2, color: P.c1, color2: P.c2, kind: 'shard' }); }
    else if (el === 'lightning') gpart({ ...base, life: 0.18, size: 0.08, color: P.hot, color2: P.c1, kind: 'spark', hot: 1 });
    else if (el === 'void' || el === 'rot' || el === 'nature' || el === 'blood') gpart({ ...base, life: 0.45, size: 0.5, size1: 1.2, color: P.c1, color2: P.c2, kind: 'mist', alpha: 0.6 });
    else gpart({ ...base, life: 0.35, size: 0.3, size1: 0.05, color: P.c1, color2: P.c2, kind: 'glow' });
  }
  if (el === 'lightning') for (let i = 0; i < 4; i++) { const a = ang + (Math.random() * 2 - 1) * half, L = R * rnd(0.6, 1); boltFx(x, y, z, x + Math.sin(a) * L, y - 0.3, z + Math.cos(a) * L, { color: P.c1, dur: 0.16, width: 0.7, branches: 1 }); }
  arcFx(x, y - 1.35 + 0.2, z, ang, { radius: R, arc: A, color: el !== 'custom' ? el : elOrColor, dur: 0.3, heavy: true });
}

// nova: a dome and a ground ring blasting out from the caster
export function novaFx(x, y, z, radius, elOrColor) {
  const { el, P } = resolve(elOrColor);
  const gy = ground(x, z);
  shellFx(x, gy + 0.8, z, { radius: radius * 0.95, color: P.c1, color2: P.c2, dur: 0.38 });
  ringFx(x, gy, z, { radius, color: P.c1, color2: P.c2, dur: 0.5, th: 0.3, noise: 0.5, fill: 0.6 });
  ringFx(x, gy, z, { radius: radius * 0.6, color: P.c1, color2: P.c2, dur: 0.32, th: 0.2, noise: 0.3 });
  const n = Math.round(18 + radius * 4);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rnd(-0.1, 0.1), sp = radius * rnd(2.6, 3.4);
    const b = { x: x + Math.cos(a) * 0.5, y: gy + rnd(0.2, 0.9), z: z + Math.sin(a) * 0.5, gy, vx: Math.cos(a) * sp, vy: rnd(0, 1), vz: Math.sin(a) * sp, drag: 3.2 };
    if (el === 'frost') gpart({ ...b, life: 0.5, size: 0.7, size1: 0.3, color: P.c1, color2: P.c2, kind: 'shard' });
    else if (el === 'fire') gpart({ ...b, life: 0.45, size: 0.7, size1: 0.25, color: P.c1, color2: P.c2, kind: 'flame', gravity: 2 });
    else gpart({ ...b, life: 0.35, size: 0.1, color: P.hot, color2: P.c1, kind: 'spark', hot: 1 });
  }
  flareFx(x, gy + 1, z, { size: 1.6, color: P.c1, color2: P.c2, dur: 0.2, star: true });
  if (el === 'frost' || el === 'fire' || el === 'void' || el === 'blood') scorchFx(x, z, radius * 0.9, el, el === 'frost' ? 3.2 : 2, 0.55);
}

// ================================================================== kills
// Every kill pops: a white-hot flare, a spray of sparks, a shock ring, and soul motes that streak
// into the player (more of them as the kill streak climbs).
export function killFx(victim, streak = 1) {
  const x = victim.pos.x, z = victim.pos.z, gy = ground(x, z);
  const y = victim.pos.y + (victim.height || 1.8) * 0.5;
  const big = victim.boss || victim.elite;
  const heat = Math.min(1, streak / 60);
  const c1 = heat > 0.5 ? '#fff0c0' : '#ffffff', c2 = heat > 0.5 ? '#ff7a30' : '#ffc070';
  flareFx(x, y, z, { size: big ? 2.2 : 1.1 + heat * 0.6, color: c1, color2: c2, dur: big ? 0.3 : 0.18, star: true });
  gburst(x, y, z, { count: big ? 34 : 12 + Math.round(heat * 10), speed: big ? 13 : 9, kind: 'spark', size: 0.08, color: '#ffffff', color2: c2, life: 0.32, gravity: -9, drag: 2.2, hot: 1, up: 0.6 });
  ringFx(x, gy, z, { radius: big ? 4.5 : 1.8 + heat, color: c1, color2: c2, dur: 0.26, th: 0.16, noise: 0.25, r0: 0.2 });
  if (big) shellFx(x, y, z, { radius: 3.2, color: c1, color2: c2, dur: 0.3 });
  soulFx(x, y, z, big ? 14 : 2 + Math.min(6, Math.floor(streak / 8)));
}

// motes burst out, hang for a beat, then home in on the player
export function soulFx(x, y, z, n = 4) {
  const motes = [];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = rnd(3, 7);
    motes.push({ x, y, z, vx: Math.cos(a) * s, vy: rnd(2, 6), vz: Math.sin(a) * s, t: -i * 0.03, done: false, h: [] });
  }
  const P = PALETTE.holy, cyan = col('#9ff0ff');
  return addMagic({
    update(f, dt) {
      f.t += dt;
      const p = magic.target;
      let alive = 0;
      for (const m of motes) {
        if (m.done) continue;
        alive++;
        m.t += dt;
        if (m.t < 0) continue;
        const k = Math.exp(-4 * dt);
        if (m.t > 0.22 && p) {
          // steer toward the chest with rising acceleration
          const tx = p.pos.x, ty = p.pos.y + 1.1, tz = p.pos.z;
          const dx = tx - m.x, dy = ty - m.y, dz = tz - m.z, L = Math.hypot(dx, dy, dz) || 1;
          const acc = 60 + m.t * 160;
          m.vx = m.vx * k + dx / L * acc * dt; m.vy = m.vy * k + dy / L * acc * dt; m.vz = m.vz * k + dz / L * acc * dt;
          if (L < 0.6) { m.done = true; continue; }
        } else { m.vx *= k; m.vz *= k; m.vy = m.vy * k - 6 * dt; }
        m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt;
        m.h.unshift([m.x, m.y, m.z]); if (m.h.length > 6) m.h.pop();
      }
      return alive > 0 && f.t < 3;
    },
    draw() {
      const s = UPX * 0.22;
      for (const m of motes) {
        if (m.done || m.t < 0) continue;
        for (let i = 0; i < m.h.length - 1; i++) {
          const [ax, ay, az] = m.h[i], [bx, by, bz] = m.h[i + 1];
          seg(mx(bx), my(bz, by - ground(bx, bz)), mx(ax), my(az, ay - ground(ax, az)), s * 0.5 * (1 - (i + 1) / 6), s * 0.5 * (1 - i / 6), 0.8 * (1 - (i + 1) / 6), 0.8 * (1 - i / 6), P.hot, cyan);
        }
        quad(mx(m.x), my(m.z, m.y - ground(m.x, m.z)), s * 2.2, s * 2.2, 0, K.GLOW, 0.9, P.hot, cyan, 0.8, 4);
      }
    },
  });
}

// ================================================================== weapon hits
// A directional impact for every player weapon hit: a hot flash, sparks thrown away from the
// attacker, and on crits a star burst and a shock ring.
export function hitFx(x, y, z, dx, dz, color = '#fff4d0', crit = false) {
  const L = Math.hypot(dx, dz) || 1;
  const dir = { x: dx / L, y: 0.25, z: dz / L };
  const gy = ground(x, z);
  flareFx(x, y, z, { size: crit ? 1.1 : 0.55, color: '#ffffff', color2: color, dur: crit ? 0.16 : 0.09, star: crit });
  gburst(x, y, z, { count: crit ? 12 : 5, speed: crit ? 14 : 10, kind: 'spark', size: 0.07, color: '#ffffff', color2: color, life: 0.2, gravity: -10, drag: 3, hot: 1, dir, cone: 0.7, stretch: 0.035 });
  if (crit) ringFx(x, gy, z, { radius: 1.6, color: '#ffffff', color2: color, dur: 0.2, th: 0.14, noise: 0.15, r0: 0.2 });
}

// a flourish at the hand whenever an ability fires: makes every key press feel loud
export function abilityFlourish(p, elOrColor, big = false) {
  const { P } = resolve(elOrColor);
  const h = p.model?.handPos ? p.model.handPos(new Vec3()) : { x: p.pos.x, y: p.pos.y + 1.2, z: p.pos.z };
  flareFx(h.x, h.y, h.z, { size: big ? 1.3 : 0.9, color: P.c1, color2: P.c2, dur: 0.16, star: true });
  gburst(h.x, h.y, h.z, { count: big ? 14 : 8, speed: 6, kind: 'spark', size: 0.07, color: P.hot, color2: P.c1, life: 0.25, gravity: 0, drag: 3, hot: 1 });
  ringFx(p.pos.x, ground(p.pos.x, p.pos.z), p.pos.z, { radius: big ? 2.6 : 1.8, color: P.c1, color2: P.c2, dur: 0.24, th: 0.18, noise: 0.35, r0: 0.3 });
}

// ================================================================== loot
// A light pillar over dropped gear, coloured and sized by rarity (rare and up), with a slow ring
// at its base and motes drifting up. Lives as long as the pickup is on the ground.
export function lootBeamFx(pk, colorHex, rarityIndex) {
  const c = col(colorHex), hot = [255, 255, 255];
  const H = 4 + rarityIndex * 2.2, seed = Math.random();
  const gy = ground(pk.x, pk.z);
  if (rarityIndex >= 4) {
    flareFx(pk.x, gy + 1, pk.z, { size: 2.4, color: colorHex, color2: colorHex, dur: 0.5, star: true });
    ringFx(pk.x, gy, pk.z, { radius: 4, color: colorHex, color2: colorHex, dur: 0.6, th: 0.2 });
  }
  let acc = 0;
  return addMagic({
    update(f, dt) {
      f.t += dt;
      acc += dt * (2 + rarityIndex * 2);
      while (acc > 1) { acc -= 1; gpart({ x: pk.x + rnd(-0.3, 0.3), y: gy + 0.2, z: pk.z + rnd(-0.2, 0.2), gy, vy: rnd(1.5, 3), life: rnd(0.8, 1.4), size: rnd(0.08, 0.14), size1: 0.02, color: '#ffffff', color2: colorHex, kind: 'glow', hot: 1, drag: 0.3 }); }
      return !pk.gone && !!G_pickupAlive(pk);
    },
    draw(f) {
      const X = mx(pk.x), Yb = my(pk.z, 0);
      const grow = easeOut(Math.min(1, f.t / 0.35));
      const w = UPX * (0.32 + rarityIndex * 0.05), hh = H * UPX * grow;
      const pulse = 0.85 + 0.15 * Math.sin(f.t * 3 + seed * 6);
      quad(X, Yb - hh / 2, w, hh / 2, 0, K.SHAFT, 0.75 * pulse, c, c, 1.5, 34, 0, 0, 0.3, seed);
      quad(X, Yb, UPX * 0.9, UPX * 0.9 * 0.45, 0, K.RING, 0.8, hot, c, 0.3, 0.4, 1, 0.4, 1, seed);
      quad(X, Yb - UPX * (Math.max(0, pk.h) + 0.3), UPX * 0.9, UPX * 0.9, f.t * 0.7, K.STAR, 0.55 * pulse, c, c, 40, 4, 0.3);
    },
  });
}
let G_pickupAlive = () => true;
export function setPickupProbe(fn) { G_pickupAlive = fn; }

// ================================================================== ambience
// Life in the air around the camera: warm dust motes in daylight, blinking fireflies at night,
// drifting cyan spores in the Deep, slow dust and embers in dungeons.
export function ambientFx(getMode) {
  let acc = 0;
  return addMagic({
    update(f, dt) {
      const m = getMode();
      if (!m) return true;
      acc += dt * m.rate;
      const view = magic.view;
      while (acc > 1) {
        acc -= 1;
        const x = view.cx + rnd(-16, 16), z = view.cz + rnd(-10, 11), gy = ground(x, z);
        if (m.kind === 'fireflies') gpart({ x, y: gy + rnd(0.3, 2.2), z, gy, vx: rnd(-0.4, 0.4), vy: rnd(-0.1, 0.2), vz: rnd(-0.4, 0.4), life: rnd(2.5, 4.5), size: 0.09, size1: 0.07, color: '#f4ffb0', color2: '#9ad040', kind: 'ember', hot: 1, drag: 0.2, wobble: 2, fadeIn: 0.25, floor: false });
        else if (m.kind === 'spores') gpart({ x, y: gy + rnd(0.2, 3), z, gy, vx: rnd(-0.2, 0.2), vy: rnd(0.1, 0.4), vz: rnd(-0.2, 0.2), life: rnd(3, 5), size: 0.08, size1: 0.05, color: '#c0fff4', color2: '#40b0c0', kind: 'glow', hot: 0.6, drag: 0.1, wobble: 1, fadeIn: 0.3, floor: false });
        else if (m.kind === 'embers') gpart({ x, y: gy + rnd(0, 1), z, gy, vx: rnd(-0.3, 0.3), vy: rnd(0.3, 0.8), vz: rnd(-0.3, 0.3), life: rnd(2, 3.5), size: 0.06, size1: 0.03, color: '#ffd090', color2: '#ff6020', kind: 'ember', hot: 1, drag: 0.1, wobble: 0.8, fadeIn: 0.2, floor: false });
        else gpart({ x, y: gy + rnd(0.5, 3.5), z, gy, vx: rnd(0.1, 0.5), vy: rnd(-0.05, 0.1), vz: rnd(-0.1, 0.1), life: rnd(3, 5), size: 0.05, size1: 0.04, color: '#fff4d8', color2: '#ffd890', kind: 'glow', hot: 0.3, alpha: m.alpha ?? 0.5, drag: 0.1, wobble: 0.4, fadeIn: 0.35, floor: false });
      }
      return true;
    },
  });
}
