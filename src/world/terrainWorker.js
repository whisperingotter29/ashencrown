// Off-thread terrain: builds pixel-art ground images for chunks (relief shading, dithered colour,
// biome micro-texture, cliffs, water), heights for collision, prop scatter, and the world map.
import { heightAt, colorAt, biomeWeights, waterAt, roadAt, primaryBiome } from './terrainGen.js';
import { SCATTER, PROPS, PROP_IDS } from '../data/scatter.js';
import { hash3, mulberry32 } from '../core/rng.js';
import { N1, N2, N3 } from '../core/noise.js';
import { TOWNS, DEEP_TOWNS, DUNGEONS, WAYSTONES, LANDMARKS, SHRINES, RELICS } from '../data/world.js';

import { PPU, ART } from '../px/pix.js';
const propIndex = Object.fromEntries(PROP_IDS.map((k, i) => [k, i]));

// Places where scatter must stay clear (towns, entrances, landmarks)
const CLEAR = [];
for (const t of TOWNS) CLEAR.push({ x: t.x, z: t.z, r: t.r + 6, realm: 'surface' });
for (const t of DEEP_TOWNS) CLEAR.push({ x: t.x, z: t.z, r: t.r + 6, realm: 'deep' });
for (const d of DUNGEONS) CLEAR.push({ x: d.x, z: d.z, r: 10, realm: d.realm || 'surface' });
for (const w of WAYSTONES) CLEAR.push({ x: w.x, z: w.z, r: 5, realm: w.realm });
for (const s of SHRINES) CLEAR.push({ x: s.x, z: s.z, r: 5, realm: s.realm });
for (const r of RELICS) CLEAR.push({ x: r.x, z: r.z, r: 5, realm: 'surface' });
for (const l of LANDMARKS) {
  const r = l.type === 'dead_capital' ? l.r * 0.8 : l.type === 'glass_field' ? 0 : l.type === 'maw' ? 40 : l.type === 'battlefield' ? 0 : (l.r || 22);
  if (r > 0) CLEAR.push({ x: l.x, z: l.z, r, realm: 'surface' });
}
function clearAt(x, z, realm) {
  for (const c of CLEAR) {
    if (c.realm !== realm) continue;
    const dx = x - c.x, dz = z - c.z;
    if (dx * dx + dz * dz < c.r * c.r) return true;
  }
  return false;
}

const toS = (v) => 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055);
function h2(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bay = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// posterise a channel with an ordered-dither offset: gives the pixel-art banding/texture
const post = (v, d, step = 9) => clamp(Math.floor(v / step + d) * step, 0, 255);

// World-size micro features, in art pixels. The ground used to be painted at 10 px per unit; the
// features below are sized so they cover the same patch of world at today's density, with the
// extra pixels spent on shape (lit tips, bevels, shadow sides) rather than on bigger blocks.
const A = ART, iA = 1 / ART;
const BLADE = 5;                      // grass blade cell (one short blade per lucky cell)
const FLOWER = 7;                     // flower cell
const MOSS = 4;                       // moss cushion cell
const PEB = 6;                        // road pebble cell
const FLAG = Math.round(12 * A);      // plaza flagstone size
const SANDPEB = 9;                    // grit on sand
const GLINT = 13;                     // water glint cell
const md = (v, m) => ((v % m) + m) % m;
const PETALS = [[236, 84, 72], [242, 236, 222], [244, 202, 74], [150, 126, 236], [232, 122, 204]];
// crack network from a noise isoline: dark seam, a lit lip on one side and a shaded lip on the other
const crackTex = (v, w) => (v > -w && v < w ? 0.72 : v >= w && v < w * 2.2 ? 1.08 : v <= -w && v > -w * 2.2 ? 0.9 : 1);
// Low-frequency texture noise sampled on a coarse grid over the chunk and interpolated per pixel
// (one noise call per step x step pixels instead of one per pixel); built on first use.
function noiseGrid(fn, f, step, wx0, wz0, P) {
  const n = P / step + 2, g = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) g[j * n + i] = fn((wx0 + i * step) * f, (wz0 + j * step) * f);
  const inv = 1 / step;
  return (px, py) => {
    const fx = px * inv, fy = py * inv, i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, k = j * n + i;
    return (g[k] * (1 - tx) + g[k + 1] * tx) * (1 - ty) + (g[k + n] * (1 - tx) + g[k + n + 1] * tx) * ty;
  };
}

// material ids per sample
const M_GRASS = 1, M_SAND = 2, M_SNOW = 3, M_ROCK = 4, M_ASH = 5, M_ROAD = 6, M_PLAZA = 7, M_DIRT = 8, M_GLASS = 9, M_CAVE = 10, M_MOSS = 11;

function buildChunk(m) {
  const { cx, cz, size, realm, withProps } = m;
  const x0 = cx * size, z0 = cz * size;
  const G = size + 3;                    // samples at 1-unit spacing with a margin of 1
  const H = new Float32Array(G * G), CR = new Float32Array(G * G * 3), MAT = new Uint8Array(G * G), WL = new Float32Array(G * G), WT = new Uint8Array(G * G);
  const c = [0, 0, 0], w = {};
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) H[j * G + i] = heightAt(x0 + i - 1, z0 + j - 1, realm);
  let anyWater = false;
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const k = j * G + i, x = x0 + i - 1, z = z0 + j - 1, h = H[k];
    const hl = H[j * G + Math.max(0, i - 1)], hr = H[j * G + Math.min(G - 1, i + 1)], hu = H[Math.max(0, j - 1) * G + i], hd = H[Math.min(G - 1, j + 1) * G + i];
    const slope = Math.hypot(hr - hl, hd - hu) / 2;
    colorAt(x, z, h, Math.min(1, slope * 0.9), realm, c);
    CR[k * 3] = toS(c[0]); CR[k * 3 + 1] = toS(c[1]); CR[k * 3 + 2] = toS(c[2]);
    const wa = waterAt(x, z, realm);
    WL[k] = wa.level; WT[k] = wa.type === 'lava' ? 2 : wa.type === 'glow' ? 3 : wa.type === 'none' ? 0 : 1;
    if (h < wa.level && WT[k]) anyWater = true;
    // material
    let mat;
    if (realm === 'deep') mat = h > 6.5 ? M_CAVE : M_ROCK;
    else {
      biomeWeights(x, z, w);
      let pb = 'gilded', bw = -1;
      for (const kk in w) if (w[kk] > bw) { bw = w[kk]; pb = kk; }
      mat = pb === 'wastes' ? M_SAND : pb === 'frost' ? (CR[k * 3] > 205 && CR[k * 3 + 2] > 205 ? M_SNOW : M_ROCK) : pb === 'coast' ? (h < 3 ? M_SAND : M_GRASS) : pb === 'maw' ? M_ASH : pb === 'verdant' ? (N3(x * 0.05, z * 0.05) > 0.35 ? M_MOSS : M_GRASS) : M_GRASS;
      if (pb === 'wastes' && h > 13) mat = M_ROCK;
      if (slope > 0.75) mat = M_ROCK;
      const rd = roadAt(x, z, realm);
      if (rd < 3.2 + N2(x * 0.2, z * 0.2) * 0.8) mat = M_ROAD;
    }
    if (realm === 'deep' && roadAt(x, z, realm) < 4) mat = M_DIRT;
    MAT[k] = mat;
  }
  // plaza: town centres paved
  if (realm === 'surface') for (const t of TOWNS) {
    if (t.x + t.r < x0 - 2 || t.x - t.r > x0 + size + 2 || t.z + t.r < z0 - 2 || t.z - t.r > z0 + size + 2) continue;
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const d = Math.hypot(x0 + i - 1 - t.x, z0 + j - 1 - t.z);
      if (d < t.r * 0.33 + N1((x0 + i) * 0.2, (z0 + j) * 0.2) * 1.5) MAT[j * G + i] = M_PLAZA;
    }
  }
  // per-sample central-difference gradients; interpolating these (instead of differencing the
  // bilinear heights) gives slopes that vary smoothly inside a cell, so cliff and shade edges
  // follow the land in crisp curves rather than 10px stair-steps
  const GX = new Float32Array(G * G), GZ = new Float32Array(G * G);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const k = j * G + i;
    GX[k] = (H[j * G + Math.min(G - 1, i + 1)] - H[j * G + Math.max(0, i - 1)]) / (i > 0 && i < G - 1 ? 2 : 1);
    GZ[k] = (H[Math.min(G - 1, j + 1) * G + i] - H[Math.max(0, j - 1) * G + i]) / (j > 0 && j < G - 1 ? 2 : 1);
  }
  // ---- per-pixel synthesis
  const P = size * PPU;
  const CLIFF = new Uint8Array(P * P);
  const img = new Uint8ClampedArray(P * P * 4);
  let emis = null;
  const glints = [];
  const seed = (cx * 7919 + cz * 104729 + (realm === 'deep' ? 99 : 0)) | 0;
  const WX0 = x0 * PPU, WZ0 = z0 * PPU;
  let gPatch = null, gTone = null, gCrack = null, gAsh = null;
  for (let py = 0; py < P; py++) {
    const fz = py / PPU + 1, j = Math.floor(fz), tz = fz - j;
    for (let px = 0; px < P; px++) {
      const fxx = px / PPU + 1, i = Math.floor(fxx), tx = fxx - i;
      const k00 = j * G + i, k10 = k00 + 1, k01 = k00 + G, k11 = k01 + 1;
      const wx = x0 * PPU + px, wz = z0 * PPU + py; // world pixel coords (stable hashing across chunks)
      const h = (H[k00] * (1 - tx) + H[k10] * tx) * (1 - tz) + (H[k01] * (1 - tx) + H[k11] * tx) * tz;
      const dhdx = (GX[k00] * (1 - tx) + GX[k10] * tx) * (1 - tz) + (GX[k01] * (1 - tx) + GX[k11] * tx) * tz;
      const dhdz = (GZ[k00] * (1 - tx) + GZ[k10] * tx) * (1 - tz) + (GZ[k01] * (1 - tx) + GZ[k11] * tx) * tz;
      const d = bay(px, py);
      // nearest-ish sample picked with dither so material borders are pixel-crisp but organic
      const ks = (tx + (d - 0.5) * 0.8 < 0.5 ? (tz + (bay(px + 2, py + 1) - 0.5) * 0.8 < 0.5 ? k00 : k01) : (tz + (bay(px + 2, py + 1) - 0.5) * 0.8 < 0.5 ? k10 : k11));
      const mat = MAT[ks];
      let r = (CR[k00 * 3] * (1 - tx) + CR[k10 * 3] * tx) * (1 - tz) + (CR[k01 * 3] * (1 - tx) + CR[k11 * 3] * tx) * tz;
      let g = (CR[k00 * 3 + 1] * (1 - tx) + CR[k10 * 3 + 1] * tx) * (1 - tz) + (CR[k01 * 3 + 1] * (1 - tx) + CR[k11 * 3 + 1] * tx) * tz;
      let b = (CR[k00 * 3 + 2] * (1 - tx) + CR[k10 * 3 + 2] * tx) * (1 - tz) + (CR[k01 * 3 + 2] * (1 - tx) + CR[k11 * 3 + 2] * tx) * tz;
      // relief: light from the top-left, quantised into 10% bands with dithered borders so
      // hills read as crisp pixel-art terraces instead of airbrushed gradients
      const steep = Math.hypot(dhdx, dhdz);
      let sh = 1 + Math.round((dhdx * 0.16 + dhdz * 0.2) / 0.1 + (d - 0.5) * 0.9) * 0.1;
      // cliff faces on steep south-facing slopes read as walls in the 3/4 view
      const cliff = steep > 1.05 + (d - 0.5) * 0.1 && dhdz < -0.6;
      if (steep > 1.0) sh *= 0.92;
      if (cliff) {
        // columnar joints on the face: a dark seam, a lit edge beside it, blocky per-column tone
        const cm = md(wx, 5);
        sh *= cm === 0 ? 0.6 : cm === 1 ? 0.75 : 0.65 + h2(Math.floor(wx / 5), Math.floor(wz / 7), 17) * 0.07;
        CLIFF[py * P + px] = 1;
      }
      sh = clamp(sh, 0.45, 1.45);
      // micro texture (world-sized features, see the constants at the top)
      const n = h2(wx, wz, 3);
      let tex = 1;
      switch (mat) {
        case M_GRASS: case M_MOSS: {
          // light / dark sward patches with dithered, chunky borders
          const pv = (gPatch ||= noiseGrid(N3, 0.32 / PPU, 4, WX0, WZ0, P))(px, py);
          if (pv > 0.42) tex = 1.07; else if (pv < -0.45) tex = 0.93;
          if (n < 0.03) tex *= 1.16; else if (n < 0.06) tex *= 0.84;
          // short blades: root dark, tip lit, the tip leaning one pixel
          const bcx = Math.floor(wx / BLADE);
          for (let k = 0; k < 3; k++) {
            const bcz = Math.floor((wz + k) / BLADE);
            if (k && bcz === Math.floor((wz + k - 1) / BLADE)) continue;
            if (h2(bcx, bcz, 31) > 0.3) continue;
            const bz = bcz * BLADE + Math.floor(h2(bcx, bcz, 32) * BLADE), dz = bz - wz;
            if (dz < 0 || dz > 2) continue;
            const lean = dz === 2 ? Math.floor(h2(bcx, bcz, 33) * 3) - 1 : 0;
            if (bcx * BLADE + Math.floor(h2(bcx, bcz, 34) * BLADE) + lean !== wx) continue;
            tex = dz === 0 ? 0.8 : dz === 1 ? 1.16 : 1.34;
            break;
          }
          if (mat === M_MOSS) {
            const mcx = Math.floor(wx / MOSS), mcz = Math.floor(wz / MOSS);
            if (h2(mcx, mcz, 9) < 0.12) {
              const ddx = wx - mcx * MOSS - 1 - Math.floor(h2(mcx, mcz, 10) * 2), ddz = wz - mcz * MOSS - 1 - Math.floor(h2(mcx, mcz, 11) * 2);
              if (Math.abs(ddx) + Math.abs(ddz) <= 1) tex = ddz < 0 ? 1.0 : 0.8;
            }
          }
          // flowers: five-pixel blossoms, petals lit up-left, a warm eye
          const fcx = Math.floor(wx / FLOWER), fcz = Math.floor(wz / FLOWER);
          if (h2(fcx, fcz, 11) < 0.014) {
            const ddx = wx - fcx * FLOWER - 2 - Math.floor(h2(fcx, fcz, 13) * 3), ddz = wz - fcz * FLOWER - 2 - Math.floor(h2(fcx, fcz, 14) * 3);
            if (Math.abs(ddx) + Math.abs(ddz) <= 1) {
              const P = PETALS[Math.floor(h2(fcx, fcz, 12) * PETALS.length)];
              const k = ddx === 0 && ddz === 0 ? -1 : ddx < 0 || ddz < 0 ? 1.12 : 0.82;
              if (k < 0) { r = 250; g = 226; b = 120; } else { r = P[0] * k; g = P[1] * k; b = P[2] * k; }
              tex = 1;
            }
          }
          break;
        }
        case M_SAND: {
          // wind ripples: a lit crest line with its shadow just behind it
          const ph = wx * (0.11 * iA) + wz * (0.045 * iA) + N1(wx * (0.004 * iA), wz * (0.004 * iA)) * 4;
          const rip = Math.sin(ph), rip2 = Math.sin(ph - 0.55);
          tex = rip > 0.86 ? 1.09 : rip2 > 0.9 ? 0.93 : 1;
          if (n < 0.02) tex *= 0.86; else if (n > 0.99) tex *= 1.1;
          const scx = Math.floor(wx / SANDPEB), scz = Math.floor(wz / SANDPEB);
          if (h2(scx, scz, 41) < 0.05) {
            const ddx = wx - scx * SANDPEB - 2 - Math.floor(h2(scx, scz, 42) * 4), ddz = wz - scz * SANDPEB - 2 - Math.floor(h2(scx, scz, 43) * 4);
            if (ddx >= 0 && ddx <= 1 && ddz >= 0 && ddz <= 1) tex = ddx + ddz === 0 ? 1.12 : ddx + ddz === 2 ? 0.8 : 0.94;
            else if (ddz === 2 && ddx >= 0 && ddx <= 1) tex = 0.9;
          }
          break;
        }
        case M_SNOW: {
          const ph = wx * (0.07 * iA) - wz * (0.03 * iA) + N1(wx * (0.003 * iA), wz * (0.003 * iA)) * 5;
          tex = Math.sin(ph) > 0.92 ? 0.96 : 1;
          if (n < 0.01) tex = 1.25; else if (n < 0.05) tex *= 0.96;
          break;
        }
        case M_ROCK: case M_CAVE: {
          const pv = (gTone ||= noiseGrid(N1, 0.9 / PPU, 4, WX0, WZ0, P))(px, py);
          tex = pv > 0.5 ? 1.07 : pv < -0.5 ? 0.9 : 1;
          tex *= crackTex((gCrack ||= noiseGrid(N2, 0.75 / PPU, 2, WX0, WZ0, P))(px, py), 0.035);
          if (n < 0.04) tex *= 0.85; else if (n > 0.97) tex *= 1.1;
          break;
        }
        case M_ASH: {
          tex = n < 0.05 ? 0.7 : n > 0.97 ? 1.5 : 1;
          const ck = crackTex((gAsh ||= noiseGrid(N2, 0.6 / PPU, 2, WX0, WZ0, P))(px, py), 0.03);
          tex *= ck;
          if (n > 0.996 || (ck < 0.8 && n > 0.93)) { r = 255; g = 110 + n * 40; b = 40; }
          break;
        }
        case M_ROAD: case M_DIRT: {
          // packed dirt with lit pebbles and their shadows
          tex = n < 0.07 ? 0.84 : n > 0.95 ? 1.12 : 1;
          const pcx = Math.floor(wx / PEB), pcz = Math.floor(wz / PEB);
          if (h2(pcx, pcz, 51) < (mat === M_ROAD ? 0.2 : 0.1)) {
            const big = h2(pcx, pcz, 54) < 0.4;
            const ddx = wx - pcx * PEB - 1 - Math.floor(h2(pcx, pcz, 52) * 3), ddz = wz - pcz * PEB - 1 - Math.floor(h2(pcx, pcz, 53) * 3);
            const w = big ? 2 : 1;
            if (ddx >= 0 && ddx <= w && ddz >= 0 && ddz <= (big ? 1 : 0)) tex = ddx === 0 && ddz === 0 ? 1.2 : ddz > 0 || ddx === w ? 0.92 : 1.08;
            else if (ddz === (big ? 2 : 1) && ddx >= 1 && ddx <= w) tex = 0.8;
          }
          break;
        }
        case M_PLAZA: {
          // flagstones: offset courses, 1-px mortar, a bevel lit on the top-left, per-stone tone
          const row = Math.floor(wz / FLAG), off = (row & 1) * (FLAG >> 1);
          const bxs = Math.floor((wx + off) / FLAG);
          const mx = md(wx + off, FLAG), mz = md(wz, FLAG);
          if (mx === 0 || mz === 0) tex = 0.7;
          else {
            tex = 0.9 + h2(bxs, row, 8) * 0.16;
            if (mx === 1 || mz === 1) tex *= 1.08; else if (mx === FLAG - 1 || mz === FLAG - 1) tex *= 0.88;
            // the odd cracked slab: a jagged hairline across part of the stone
            const ch = h2(bxs, row, 13);
            if (ch < 0.09) {
              const sl = (h2(bxs, row, 14) - 0.5) * 1.6, c0 = 3 + h2(bxs, row, 15) * (FLAG - 6);
              const zz = mz + (md(mz, 4) === 0 ? 1 : 0);
              if (Math.abs(mx - Math.round(c0 + (zz - FLAG / 2) * sl)) < 1 && mz > 2 && mz < FLAG - 2 - ch * 40) tex *= 0.8;
            }
            if (n < 0.03) tex *= 0.9;
          }
          break;
        }
      }
      if (mat === M_PLAZA) { r = r * 0.55 + 168 * 0.45; g = g * 0.55 + 156 * 0.45; b = b * 0.55 + 136 * 0.45; }
      if (mat === M_ROAD && realm === 'surface') { /* colour already tinted by colorAt */ }
      r *= sh * tex; g *= sh * tex; b *= sh * tex;
      // ---- water
      const wl = (WL[k00] * (1 - tx) + WL[k10] * tx) * (1 - tz) + (WL[k01] * (1 - tx) + WL[k11] * tx) * tz;
      const wt = WT[ks];
      const o = (py * P + px) * 4;
      if (wt && h < wl) {
        const depth = wl - h;
        if (wt === 2) {
          // lava: bright cracks in a dark crust
          const fl = N2(wx * (0.025 * iA), wz * (0.025 * iA)) + N1(wx * (0.07 * iA), wz * (0.07 * iA)) * 0.5;
          const crust = fl > 0.25;
          r = crust ? 60 : 255; g = crust ? 22 : 120 + fl * 160; b = crust ? 20 : 30;
          if (!emis) emis = new Uint8ClampedArray(P * P * 4);
          if (!crust) { emis[o] = 255; emis[o + 1] = clamp(110 + fl * 200, 0, 255); emis[o + 2] = 40; emis[o + 3] = 255; }
        } else {
          const glow = wt === 3;
          const t = clamp(depth / 5, 0, 1);
          if (glow) { r = 20 + (1 - t) * 30; g = 120 - t * 70 + 40; b = 140 - t * 40; }
          else { r = 52 - t * 40; g = 140 - t * 92; b = 158 - t * 70; }
          // shore foam and wave bands
          if (depth < 0.22 + (d - 0.5) * 0.12) { r = 225; g = 238; b = 235; }
          else if (depth < 3) {
            // wave bands: a lit crest with a darker trough line under it
            const wv = wx * (0.05 * iA) + wz * (0.21 * iA) + N1(wx * (0.01 * iA), wz * (0.01 * iA)) * 6;
            if (Math.sin(wv) > 0.94) { r += 40; g += 40; b += 30; } else if (Math.sin(wv - 0.42) > 0.97) { r -= 10; g -= 12; b -= 8; }
          }
          if (glow) {
            if (!emis) emis = new Uint8ClampedArray(P * P * 4);
            emis[o] = r * 0.7; emis[o + 1] = g * 1.1; emis[o + 2] = b * 1.1; emis[o + 3] = 120;
          }
          if (depth > 0.5 && md(wx, GLINT) === 6 && md(wz, GLINT) === 6 && glints.length < 120 && h2(Math.floor(wx / GLINT), Math.floor(wz / GLINT), 21) < 0.035) glints.push(x0 + px / PPU, z0 + py / PPU);
        }
      }
      img[o] = post(r, d - 0.5);
      img[o + 1] = post(g, d - 0.5);
      img[o + 2] = post(b, d - 0.5);
      img[o + 3] = 255;
    }
  }
  // ---- cliff rims: a 1px lit lip along the top of every cliff face and a dark contact line at its foot
  for (let py = 1; py < P - 1; py++) for (let px = 0; px < P; px++) {
    const k = py * P + px;
    if (!CLIFF[k]) continue;
    const o = k * 4;
    if (!CLIFF[k - P]) { img[o] = Math.min(255, img[o] * 1.35 + 18); img[o + 1] = Math.min(255, img[o + 1] * 1.35 + 14); img[o + 2] = Math.min(255, img[o + 2] * 1.3 + 8); }
    else if (!CLIFF[k + P]) { img[o] *= 0.55; img[o + 1] *= 0.55; img[o + 2] *= 0.6; }
  }
  // ---- props
  let props = null;
  if (withProps) {
    const out = [];
    const rnd = mulberry32(hash3(cx, cz, realm === 'deep' ? 7 : 3));
    const spacing = 2.6;
    const n = Math.floor(size / spacing);
    const bw = {};
    for (let jj = 0; jj < n; jj++) for (let ii = 0; ii < n; ii++) {
      const lx = (ii + rnd()) * spacing, lz = (jj + rnd()) * spacing;
      const x = x0 + lx, z = z0 + lz;
      let biome;
      if (realm === 'deep') biome = 'deep';
      else {
        biomeWeights(x, z, bw);
        let rr = rnd(); biome = 'gilded';
        for (const k in bw) { if (bw[k] <= 0) continue; rr -= bw[k]; if (rr <= 0) { biome = k; break; } }
      }
      const rules = SCATTER[biome];
      if (!rules) continue;
      const fi = lx + 1, fj = lz + 1;
      const ii0 = Math.min(G - 2, Math.max(1, Math.floor(fi))), jj0 = Math.min(G - 2, Math.max(1, Math.floor(fj)));
      const tx = fi - ii0, tz = fj - jj0;
      const h00 = H[jj0 * G + ii0], h10 = H[jj0 * G + ii0 + 1], h01 = H[(jj0 + 1) * G + ii0], h11 = H[(jj0 + 1) * G + ii0 + 1];
      const h = (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
      const slope = Math.hypot(h10 - h00, h01 - h00);
      const roll = rnd();
      let acc = 0;
      for (const rule of rules) {
        let pr = rule.p;
        if (rule.cluster) {
          const nv = N1(x * rule.cluster[0] + rule.t.length * 13.1, z * rule.cluster[0]);
          pr *= Math.max(0, (nv - rule.cluster[1]) * 3);
        }
        acc += pr;
        if (roll < acc) {
          const wlev = waterAt(x, z, realm).level;
          if (rule.water) { if (h > wlev - 0.2 || h < wlev - 4) break; }
          else if (h < wlev + 0.5) break;
          if (rule.maxSlope !== undefined && slope > rule.maxSlope) break;
          if (rule.maxSlope === undefined && slope > 0.9) break;
          if (rule.minH !== undefined && h < rule.minH) break;
          if (rule.maxH !== undefined && h > rule.maxH) break;
          if (realm === 'deep' && h > 6) break;
          if (roadAt(x, z, realm) < (PROPS[rule.t].r > 0 ? 6 : 3.5)) break;
          if (clearAt(x, z, realm)) break;
          const sc = rule.scale ? rule.scale[0] + rnd() * (rule.scale[1] - rule.scale[0]) : 0.8 + rnd() * 0.5;
          out.push(propIndex[rule.t], x, h - 0.05, z, rnd() * Math.PI * 2, sc);
          break;
        }
      }
    }
    props = new Float32Array(out);
  }
  return { img, emis, H, G, step: 1, props, glints: new Float32Array(glints), P };
}

// World map image for the map screen & minimap
function buildMap(m) {
  // A cartographer's map: soft relief lit from the north-west, contour lines, height tint, water
  // graded by depth with a foam edge, and an inked coastline.
  const { N, half, realm, row0, rows } = m;
  const data = new Uint8ClampedArray(N * rows * 4);
  const c = [0, 0, 0];
  const s = (half * 2) / N;
  const CONTOUR = realm === 'deep' ? 5 : 7;
  // sample height and water once on a grid one cell wider than the rows, then read neighbours
  const GW = N + 2, GH = rows + 2;
  const HG = new Float32Array(GW * GH), WL = new Float32Array(GW * GH), WT = new Array(GW * GH);
  for (let jj = 0; jj < GH; jj++) for (let ii = 0; ii < GW; ii++) {
    const x = -half + (ii - 0.5) * s, z = -half + (row0 + jj - 0.5) * s, k = jj * GW + ii;
    HG[k] = heightAt(x, z, realm);
    const w = waterAt(x, z, realm);
    WT[k] = w.type; WL[k] = w.type === 'none' ? -1e9 : w.level;
  }
  const under = (k) => HG[k] < WL[k];
  for (let j = 0; j < rows; j++) for (let i = 0; i < N; i++) {
    const x = -half + (i + 0.5) * s, z = -half + (row0 + j + 0.5) * s;
    const k = (j + 1) * GW + (i + 1);
    const h = HG[k], hx = HG[k + 1], hxm = HG[k - 1], hz = HG[k + GW], hzm = HG[k - GW];
    const slope = Math.min(1, Math.hypot(hx - h, hz - h) / s);
    colorAt(x, z, h, slope, realm, c);
    // relief: central-difference normal lit from the north-west, plus a touch of slope darkening
    const dx = (hx - hxm) / (2 * s), dz = (hz - hzm) / (2 * s);
    const lit = (dx * 0.62 + dz * 0.62 + 0.9) / Math.sqrt(dx * dx + dz * dz + 0.81) / 1.25;
    const shade = 0.55 + 0.6 * Math.max(0, Math.min(1.2, lit)) - slope * 0.08;
    // height tint: high ground pales toward the snowline, low ground stays rich
    const ht = Math.max(0, Math.min(1, (h - 10) / 60));
    let r = c[0] * shade, g = c[1] * shade, b = c[2] * shade;
    r += (0.82 - r) * ht * 0.25; g += (0.8 - g) * ht * 0.25; b += (0.76 - b) * ht * 0.25;
    // contour lines
    const band = Math.floor(h / CONTOUR);
    if (band !== Math.floor(hx / CONTOUR) || band !== Math.floor(hz / CONTOUR)) { r *= 0.78; g *= 0.76; b *= 0.74; }
    const wt = WT[k];
    if (under(k)) {
      const t = Math.min(1, (WL[k] - h) / 9);
      const shallow = wt === 'lava' ? [1, 0.55, 0.1] : wt === 'glow' ? [0.2, 0.6, 0.55] : [0.16, 0.5, 0.55];
      const deep = wt === 'lava' ? [0.75, 0.12, 0.02] : wt === 'glow' ? [0.03, 0.16, 0.22] : [0.03, 0.12, 0.24];
      const wr = shallow[0] + (deep[0] - shallow[0]) * t, wg = shallow[1] + (deep[1] - shallow[1]) * t, wb = shallow[2] + (deep[2] - shallow[2]) * t;
      const kk = 0.2 * (1 - t);
      r = r * kk + wr * (1 - kk); g = g * kk + wg * (1 - kk); b = b * kk + wb * (1 - kk);
      // faint wave hatching on open water
      if (t > 0.35 && ((i + (row0 + j) * 3) % 11 === 0)) { r *= 1.12; g *= 1.12; b *= 1.12; }
      // foam where the water meets land
      if (!under(k + 1) || !under(k - 1) || !under(k + GW) || !under(k - GW)) { r = r * 0.4 + 0.55; g = g * 0.4 + 0.58; b = b * 0.4 + 0.56; }
    } else if (under(k + 1) || under(k - 1) || under(k + GW) || under(k - GW)) {
      // inked coastline on the land side
      r *= 0.35; g *= 0.3; b *= 0.28;
    }
    const k4 = (j * N + i) * 4;
    data[k4] = toS(Math.min(1, r)); data[k4 + 1] = toS(Math.min(1, g)); data[k4 + 2] = toS(Math.min(1, b)); data[k4 + 3] = 255;
  }
  return data;
}

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'chunk') {
    const r = buildChunk(m);
    const transfer = [r.img.buffer, r.H.buffer, r.glints.buffer];
    if (r.emis) transfer.push(r.emis.buffer);
    if (r.props) transfer.push(r.props.buffer);
    self.postMessage({ type: 'chunk', id: m.id, key: m.key, realm: m.realm, ...r }, transfer);
  } else if (m.type === 'map') {
    const data = buildMap(m);
    self.postMessage({ type: 'map', realm: m.realm, row0: m.row0, rows: m.rows, data }, [data.buffer]);
  } else if (m.type === 'biome') {
    self.postMessage({ type: 'biome', id: m.id, biome: primaryBiome(m.x, m.z, m.realm) });
  }
};
