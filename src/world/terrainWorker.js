// Off-thread terrain: builds pixel-art ground images for chunks, heights for collision, prop
// scatter, and the world map.
//
// The ground follows docs/ART_STYLE.md: big flat colour clusters picked from the biome ramps
// (terrainGen.groundSample): an earth base with cover patches whose edges step in organic blobs,
// lighter and darker sub-patches, sparse pebbles, specks and flora clumps, stone on steep ground,
// packed-earth roads and flagstone plazas. Relief is quantised to ramp steps, water is banded with
// a cream foam line. No smooth colour blending and no per-pixel dither noise.
import { heightAt, colorAt, biomeWeights, waterAt, roadAt, primaryBiome, groundSample, SAMPLE_F, RAMP_N, LAYER, BIOME_INDEX } from './terrainGen.js';
import { SCATTER, PROPS, PROP_IDS } from '../data/scatter.js';
import { hash3, mulberry32 } from '../core/rng.js';
import { N1, N2, N3, N4 } from '../core/noise.js';
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
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const md = (v, m) => ((v % m) + m) % m;
const hexRGB = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

// World-size details, in art pixels (16 per world unit)
const A = ART, iA = 1 / ART;
const M = 2;                          // layer-mask margin round the chunk (edge tests look 2 px out)
const ROADW = 3.0;                    // road half-width in world units
const PEB = 7;                        // pebble cell
const SPK = 6;                        // speck cell inside cover patches
const FLC = 11;                       // flora clump cell
const FLAG = Math.round(12 * A);      // plaza flagstone size
const GLINT = 13;                     // water glint cell
const ROUGH = 0.22;                   // edge roughness added to the patch field
// water bands, deepest first; glowing lakes of the Deep; lava crust and melt
const WATER = ['#142640', '#1a344e', '#21465c', '#2a5a6a', '#357074', '#5a8e88'].map(hexRGB);
const GLOWW = ['#0a1a22', '#10262e', '#16343a', '#1e4648', '#2a5e5a', '#3e7e74'].map(hexRGB);
const FOAM = hexRGB('#efdab4'), FOAM2 = hexRGB('#c8c4a4');
const LAVA = ['#3a0e10', '#7a1e14', '#c2401c', '#ec7a2a', '#f8b848'].map(hexRGB);
// crack network from a noise isoline: dark seam, a lit lip on one side, a shaded lip on the other
const crackStep = (v, w) => (v > -w && v < w ? -9 : v >= w && v < w * 2.4 ? 1 : v <= -w && v > -w * 2.4 ? -1 : 0);

// Low-frequency noise sampled on a coarse grid over the chunk (with its margin) and interpolated
// per pixel: one noise call per step x step pixels instead of one per pixel.
function field(fn, f, step, ox, oz, span) {
  const n = Math.ceil(span / step) + 2, g = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) g[j * n + i] = fn((ox + i * step) * f, (oz + j * step) * f);
  const inv = 1 / step;
  return (px, py) => {
    const fx = px * inv, fy = py * inv, i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, k = j * n + i;
    return (g[k] * (1 - tx) + g[k + 1] * tx) * (1 - ty) + (g[k + n] * (1 - tx) + g[k + n + 1] * tx) * ty;
  };
}
// the patch field: blobs of mixed sizes (a broad noise plus a finer one)
const patchFn = (a, b) => N3(a, b) * 0.72 + N1(a * 2.3 + 5.3, b * 2.3 - 1.7) * 0.28;
const PATCH_F = 1 / 58;
// quantile table of the patch field, so a layer share maps straight to a threshold
const QT = (() => {
  const r = mulberry32(77), n = 8000, v = new Float32Array(n);
  for (let i = 0; i < n; i++) v[i] = patchFn(r() * 900, r() * 900) + ROUGH * N2(r() * 900, r() * 900);
  v.sort();
  const q = new Float32Array(65);
  for (let i = 0; i <= 64; i++) q[i] = v[Math.min(n - 1, Math.round((i / 64) * (n - 1)))];
  return q;
})();
const quant = (a) => { if (a <= 0) return -9; if (a >= 1) return 9; const f = a * 64, i = f | 0; return QT[i] + (QT[i + 1] - QT[i]) * (f - i); };

// layer codes in the mask
const L_EARTH = 0, L_COVER = 1, L_STONE = 3, L_ROAD = 4, L_PLAZA = 5, L_RIM = 6;
const S_WASTES = BIOME_INDEX.wastes, S_COAST = BIOME_INDEX.coast, S_FROST = BIOME_INDEX.frost, S_MAW = BIOME_INDEX.maw, S_DEEP = BIOME_INDEX.deep;
const RS_STRIDE = RAMP_N * 3;
// scratch buffers reused across chunks (only the image, heights and emissive leave the worker)
const scratch = new Map();
function buf(name, Ctor, n) { let b = scratch.get(name); if (!b || b.length !== n) { b = new Ctor(n); scratch.set(name, b); } return b; }

function buildChunk(m) {
  const { cx, cz, size, realm, withProps } = m;
  const x0 = cx * size, z0 = cz * size;
  const G = size + 3;                    // samples at 1-unit spacing with a margin of 1
  const H = new Float32Array(G * G), RS = buf('RS', Float32Array, G * G * SAMPLE_F), AM = buf('AM', Float32Array, G * G * 7);
  const ST = buf('ST', Uint8Array, G * G), WL = buf('WL', Float32Array, G * G), WT = buf('WT', Uint8Array, G * G);
  const am = {};
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) H[j * G + i] = heightAt(x0 + i - 1, z0 + j - 1, realm);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const k = j * G + i, x = x0 + i - 1, z = z0 + j - 1, h = H[k];
    const hl = H[j * G + Math.max(0, i - 1)], hr = H[j * G + Math.min(G - 1, i + 1)], hu = H[Math.max(0, j - 1) * G + i], hd = H[Math.min(G - 1, j + 1) * G + i];
    const slope = Math.sqrt((hr - hl) * (hr - hl) + (hd - hu) * (hd - hu)) / 2;
    groundSample(x, z, h, Math.min(1, slope * 0.9), realm, RS, k * SAMPLE_F, am);
    // per-sample patch thresholds: cover below QC, stone above QS (interpolated per pixel)
    AM[k * 7] = am.cov; AM[k * 7 + 1] = am.flo; AM[k * 7 + 2] = am.stone; AM[k * 7 + 3] = am.road; AM[k * 7 + 4] = am.plaza;
    AM[k * 7 + 5] = clamp(quant(am.cov), -1.4, 1.4); AM[k * 7 + 6] = am.stone > 0.01 ? clamp(quant(1 - am.stone), -1.4, 1.4) : 1.4;
    ST[k] = am.style;
    const wa = waterAt(x, z, realm);
    WL[k] = wa.level; WT[k] = wa.type === 'lava' ? 2 : wa.type === 'glow' ? 3 : wa.type === 'none' ? 0 : 1;
  }
  // per-sample central-difference gradients; interpolating these (instead of differencing the
  // bilinear heights) gives slopes that vary smoothly inside a cell, so cliff and shade edges
  // follow the land in crisp curves rather than stair-steps
  const GX = buf('GX', Float32Array, G * G), GZ = buf('GZ', Float32Array, G * G);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const k = j * G + i;
    GX[k] = (H[j * G + Math.min(G - 1, i + 1)] - H[j * G + Math.max(0, i - 1)]) / (i > 0 && i < G - 1 ? 2 : 1);
    GZ[k] = (H[Math.min(G - 1, j + 1) * G + i] - H[Math.max(0, j - 1) * G + i]) / (j > 0 && j < G - 1 ? 2 : 1);
  }
  const P = size * PPU, PM = P + 2 * M;
  const WX0 = x0 * PPU, WZ0 = z0 * PPU;
  // noise fields over the chunk and its margin (pixel coords offset by M)
  const F1 = field(patchFn, PATCH_F, 4, WX0 - M, WZ0 - M, PM);     // patch shapes
  const F3 = field(N2, 1 / 5.5, 2, WX0 - M, WZ0 - M, PM);         // edge roughness (2-3 px steps)
  const F2 = field(N4, 1 / 104, 8, WX0 - M, WZ0 - M, PM);          // lighter / darker sub-patches
  let gCrack = null, gRip = null, gWave = null;

  // ---- pass 1: which layer shows at every pixel (plus margin)
  const LY = buf('LY', Uint8Array, PM * PM), R3B = buf('R3B', Float32Array, PM * PM), V1B = buf('V1B', Float32Array, PM * PM);
  for (let y = 0; y < PM; y++) {
    const fz = (y - M) / PPU + 1, j = Math.floor(fz), tz = fz - j;
    for (let x = 0; x < PM; x++) {
      const fx = (x - M) / PPU + 1, i = Math.floor(fx), tx = fx - i;
      const a00 = (j * G + i) * 7, a10 = a00 + 7, a01 = a00 + G * 7, a11 = a01 + 7;
      const w00 = (1 - tx) * (1 - tz), w10 = tx * (1 - tz), w01 = (1 - tx) * tz, w11 = tx * tz;
      const r3 = F3(x, y), v1 = F1(x, y), q = y * PM + x;
      R3B[q] = r3; V1B[q] = v1;
      let L;
      if (AM[a00 + 4] * w00 + AM[a10 + 4] * w10 + AM[a01 + 4] * w01 + AM[a11 + 4] * w11 + r3 * 0.9 > 0) L = L_PLAZA;
      else {
        const rd = AM[a00 + 3] * w00 + AM[a10 + 3] * w10 + AM[a01 + 3] * w01 + AM[a11 + 3] * w11 + r3 * 0.9;
        if (rd < ROADW) L = L_ROAD;
        else {
          const v = v1 + ROUGH * r3;
          if (v > AM[a00 + 6] * w00 + AM[a10 + 6] * w10 + AM[a01 + 6] * w01 + AM[a11 + 6] * w11) L = L_STONE;
          else if (v < AM[a00 + 5] * w00 + AM[a10 + 5] * w10 + AM[a01 + 5] * w01 + AM[a11 + 5] * w11) L = L_COVER;
          else L = L_EARTH;
          if (L !== L_STONE && rd < ROADW + 0.55) L = L_RIM;
        }
      }
      LY[q] = L;
    }
  }

  // ---- pass 2: colour
  const CLIFF = buf('CLIFF', Uint8Array, P * P); CLIFF.fill(0);
  const img = new Uint8ClampedArray(P * P * 4);
  let emis = null;
  const glints = [];
  for (let py = 0; py < P; py++) {
    const fz = py / PPU + 1, j = Math.floor(fz), tz = fz - j;
    for (let px = 0; px < P; px++) {
      const fxx = px / PPU + 1, i = Math.floor(fxx), tx = fxx - i;
      const k00 = j * G + i, k10 = k00 + 1, k01 = k00 + G, k11 = k01 + 1;
      const w00 = (1 - tx) * (1 - tz), w10 = tx * (1 - tz), w01 = (1 - tx) * tz, w11 = tx * tz;
      const wx = WX0 + px, wz = WZ0 + py; // world pixel coords (stable hashing across chunks)
      const h = H[k00] * w00 + H[k10] * w10 + H[k01] * w01 + H[k11] * w11;
      const dhdx = GX[k00] * w00 + GX[k10] * w10 + GX[k01] * w01 + GX[k11] * w11;
      const dhdz = GZ[k00] * w00 + GZ[k10] * w10 + GZ[k01] * w01 + GZ[k11] * w11;
      const X = px + M, Y = py + M, li = Y * PM + X;
      const r3 = R3B[li];
      // nearest sample, picked with the roughness field so style borders are crisp but organic
      const ks = tx + r3 * 0.3 < 0.5 ? (tz - r3 * 0.3 < 0.5 ? k00 : k01) : (tz - r3 * 0.3 < 0.5 ? k10 : k11);
      const style = ST[ks];
      // relief, lit from the top-left, quantised to whole ramp steps with rough band edges
      const steep = Math.sqrt(dhdx * dhdx + dhdz * dhdz);
      const rel = (dhdx * 0.16 + dhdz * 0.2) * 10 + V1B[li] * 1.1 + r3 * 0.12;
      let step = rel > 4.8 ? 2 : rel > 2.1 ? 1 : rel < -4.8 ? -2 : rel < -2.1 ? -1 : 0;
      if (steep > 1.0) step--;
      const f2 = F2(X, Y) + r3 * 0.14;
      const mot = f2 > 0.5 ? 1 : f2 < -0.5 ? -1 : 0;
      let L = LY[li], layer = LAYER.EARTH, idx = 2, glow = 0;
      // cliff faces on steep south-facing slopes read as walls in the 3/4 view
      if (steep > 1.05 + r3 * 0.06 && dhdz < -0.6) {
        CLIFF[py * P + px] = 1;
        layer = LAYER.STONE;
        // columnar joints: a dark seam, a lit edge beside it, blocky per-column tone
        const cm = md(wx, 5);
        idx = cm === 0 ? 0 : cm === 1 ? 2 : h2(Math.floor(wx / 5), Math.floor(wz / 6), 17) < 0.35 ? 2 : 1;
        if (py > 0 && !CLIFF[(py - 1) * P + px]) idx = 4;              // lit lip along the top
        L = -1;
      }
      switch (L) {
        case L_COVER: {
          layer = LAYER.COVER;
          idx = 2 + step + (mot > 0 ? 1 : 0);
          if (LY[li - PM] !== L_COVER) idx++;                          // lit lip along the top edge
          else if (LY[li + PM] !== L_COVER) idx--;                     // shaded underside
          // sparse 1-2 px specks: a darker blade cluster or a lit tip
          const scx = Math.floor(wx / SPK), scz = Math.floor(wz / SPK), sh = h2(scx, scz, 61);
          if (sh < 0.16) {
            const sx = scx * SPK + 1 + Math.floor(h2(scx, scz, 62) * 4), sz = scz * SPK + 1 + Math.floor(h2(scx, scz, 63) * 4);
            if (wx === sx && (wz === sz || (sh < 0.06 && wz === sz + 1))) idx += sh < 0.1 ? -1 : 1;
          }
          if (style === S_DEEP && h2(wx, wz, 3) < 0.012) { idx = 4; glow = 1; }    // glow-moss spores
          break;
        }
        case L_EARTH: {
          layer = LAYER.EARTH;
          idx = 2 + step + mot;
          if (LY[li - PM] === L_COVER) idx = Math.min(idx, 2) - 1;     // shadow under the cover lip
          if (style === S_WASTES || (style === S_COAST && h < 3.6)) {
            // wind ripples in patches: a lit crest with its shadow just behind it
            const ph = wx * (0.11 * iA) + wz * (0.045 * iA) + (gRip ||= field(N1, 0.004 * iA, 8, WX0 - M, WZ0 - M, PM))(X, Y) * 4;
            if (f2 > -0.15) { if (Math.sin(ph) > 0.94) idx++; else if (Math.sin(ph - 0.5) > 0.96) idx--; }
          } else if (style === S_MAW) {
            // ash crust with a crack network; aether seeps from the odd crack
            const ck = crackStep((gCrack ||= field(N2, 0.6 / PPU, 2, WX0 - M, WZ0 - M, PM))(X, Y), 0.03);
            if (ck === -9) { idx = 0; const n = h2(wx, wz, 3); if (n > 0.9) { layer = LAYER.FLORA; idx = n > 0.97 ? 3 : 2; glow = 1; } } else idx += ck;
          } else if (style === S_FROST && h2(wx, wz, 3) < 0.005) idx = 4;          // frost glint
          // pebbles: a lit stone with its shadow under it
          const pcx = Math.floor(wx / PEB), pcz = Math.floor(wz / PEB);
          if (h2(pcx, pcz, 51) < 0.05) {
            const big = h2(pcx, pcz, 54) < 0.4;
            const ddx = wx - pcx * PEB - 1 - Math.floor(h2(pcx, pcz, 52) * 4), ddz = wz - pcz * PEB - 1 - Math.floor(h2(pcx, pcz, 53) * 4);
            if (ddz === 0 && ddx >= 0 && ddx <= (big ? 1 : 0)) idx = ddx === 0 ? 4 : 3;
            else if (ddz === 1 && ddx >= 0 && ddx <= (big ? 1 : 0)) idx = 1;
          }
          break;
        }
        case L_STONE: {
          layer = LAYER.STONE;
          idx = 2 + step + mot;
          const ck = crackStep((gCrack ||= field(N2, 0.6 / PPU, 2, WX0 - M, WZ0 - M, PM))(X, Y), 0.035);
          if (ck === -9) idx = 0; else idx += ck;
          if (LY[li - PM] !== L_STONE) idx++;
          break;
        }
        case L_ROAD: case L_RIM: {
          layer = LAYER.ROAD;
          if (L === L_RIM) { idx = 1 + Math.min(0, step); break; }
          idx = 2 + Math.max(-1, Math.min(1, step)) + (f2 > 0.45 ? 1 : f2 < -0.5 ? -1 : 0);
          // packed earth: pebbles with shadows, more of them than off the road
          const pcx = Math.floor(wx / PEB), pcz = Math.floor(wz / PEB);
          if (h2(pcx, pcz, 51) < 0.16) {
            const big = h2(pcx, pcz, 54) < 0.4;
            const ddx = wx - pcx * PEB - 1 - Math.floor(h2(pcx, pcz, 52) * 4), ddz = wz - pcz * PEB - 1 - Math.floor(h2(pcx, pcz, 53) * 4);
            if (ddz === 0 && ddx >= 0 && ddx <= (big ? 1 : 0)) idx = ddx === 0 ? 4 : 3;
            else if (ddz === 1 && ddx >= 0 && ddx <= (big ? 1 : 0)) idx = 0;
          }
          break;
        }
        case L_PLAZA: {
          // flagstones: offset courses, 1-px mortar, a bevel lit on the top-left, per-stone tone
          layer = LAYER.PLAZA;
          const row = Math.floor(wz / FLAG), off = (row & 1) * (FLAG >> 1);
          const bxs = Math.floor((wx + off) / FLAG);
          const mx = md(wx + off, FLAG), mz = md(wz, FLAG);
          if (mx === 0 || mz === 0) idx = 0;
          else {
            const t = h2(bxs, row, 8);
            idx = t < 0.22 ? 1 : t > 0.86 ? 3 : 2;
            if (mx === 1 || mz === 1) idx++; else if (mx === FLAG - 1 || mz === FLAG - 1) idx--;
            // the odd cracked slab: a jagged hairline across part of the stone
            const ch = h2(bxs, row, 13);
            if (ch < 0.09) {
              const sl = (h2(bxs, row, 14) - 0.5) * 1.6, c0 = 3 + h2(bxs, row, 15) * (FLAG - 6);
              const zz = mz + (md(mz, 4) === 0 ? 1 : 0);
              if (Math.abs(mx - Math.round(c0 + (zz - FLAG / 2) * sl)) < 1 && mz > 2 && mz < FLAG - 2 - ch * 40) idx = 0;
            }
          }
          break;
        }
      }
      // flora clumps (rose / lavender / heather...): small ragged beds of petals, lit along the top
      // and shaded at the foot, with a contact shadow on the ground under them; they gather where
      // the sub-patch field is high
      if (L === L_COVER || L === L_EARTH) {
        const fcx = Math.floor(wx / FLC), fcz = Math.floor(wz / FLC);
        if (h2(fcx, fcz, 11) < AM[ks * 7 + 1] * (f2 > 0.2 ? 3.2 : 0.3)) {
          const rx = 1.5 + h2(fcx, fcz, 15) * 1.7, ry = rx * 0.68;
          const ddx = wx + 0.5 - (fcx * FLC + 5 + Math.floor(h2(fcx, fcz, 13) * 3) - 1), ddz = wz + 0.5 - (fcz * FLC + 4 + Math.floor(h2(fcx, fcz, 14) * 3) - 1);
          const e = (ddx * ddx) / (rx * rx) + (ddz * ddz) / (ry * ry);
          if (e <= 1 && h2(wx, wz, 16) > 0.2) {
            const base = h2(fcx, fcz, 12) < 0.5 ? 2 : 3;
            layer = LAYER.FLORA;
            idx = ddz < -ry * 0.3 ? (ddx < rx * 0.3 ? 4 : base) : ddz > ry * 0.4 ? 1 : h2(wx, wz, 17) < 0.3 ? 1 : base;
            if ((style === S_MAW || style === S_DEEP) && idx >= 2) glow = 1;
          } else if (ddz > ry * 0.5 && ddz < ry + 1.6 && ddx > -rx * 0.8 && ddx < rx * 0.8 && e < 2.6) idx = Math.min(idx, 2) - 1;
        }
      }
      idx = idx < 0 ? 0 : idx > 4 ? 4 : idx;
      const b = layer * RS_STRIDE + idx * 3;
      const o00 = k00 * SAMPLE_F + b, o10 = k10 * SAMPLE_F + b, o01 = k01 * SAMPLE_F + b, o11 = k11 * SAMPLE_F + b;
      let r = RS[o00] * w00 + RS[o10] * w10 + RS[o01] * w01 + RS[o11] * w11;
      let g = RS[o00 + 1] * w00 + RS[o10 + 1] * w10 + RS[o01 + 1] * w01 + RS[o11 + 1] * w11;
      let bl = RS[o00 + 2] * w00 + RS[o10 + 2] * w10 + RS[o01 + 2] * w01 + RS[o11 + 2] * w11;
      const o = (py * P + px) * 4;
      if (glow) {
        if (!emis) emis = new Uint8ClampedArray(P * P * 4);
        emis[o] = r; emis[o + 1] = g; emis[o + 2] = bl; emis[o + 3] = 170;
      }
      // ---- water: depth bands from the water ramp, a cream foam line at the shore
      const wl = WL[k00] * w00 + WL[k10] * w10 + WL[k01] * w01 + WL[k11] * w11;
      const wt = WT[ks];
      if (wt && h < wl) {
        const depth = wl - h;
        if (wt === 2) {
          // lava: bright melt in cracks of a dark crust
          const fl = N2(wx * (0.025 * iA), wz * (0.025 * iA)) + N1(wx * (0.07 * iA), wz * (0.07 * iA)) * 0.5 + r3 * 0.08;
          const c = LAVA[fl > 0.45 ? 0 : fl > 0.25 ? 1 : fl > 0.12 ? 2 : fl > -0.2 ? 3 : 4];
          r = c[0]; g = c[1]; bl = c[2];
          if (!emis) emis = new Uint8ClampedArray(P * P * 4);
          if (fl <= 0.25) { emis[o] = c[0]; emis[o + 1] = c[1]; emis[o + 2] = c[2]; emis[o + 3] = 255; }
        } else {
          const glowW = wt === 3, W = glowW ? GLOWW : WATER;
          const dq = depth + r3 * 0.14;
          let wi = dq < 0.45 ? 5 : dq < 1.1 ? 4 : dq < 2.4 ? 3 : dq < 4.5 ? 2 : dq < 8 ? 1 : 0;
          let c = W[wi];
          if (dq < 0.17) c = FOAM;
          else if (dq < 0.26 && h2(wx >> 1, wz, 23) < 0.5) c = FOAM2;
          else if (depth > 0.6) {
            // wave lines: a lighter crest band, now and then a cream fleck at its peak
            const wv = wx * (0.05 * iA) + wz * (0.21 * iA) + (gWave ||= field(N1, 0.01 * iA, 8, WX0 - M, WZ0 - M, PM))(X, Y) * 6;
            const sv = Math.sin(wv);
            if (sv > 0.95) c = sv > 0.995 && h2(wx >> 2, wz, 29) < 0.25 ? FOAM : W[Math.min(5, wi + 1)];
          }
          r = c[0]; g = c[1]; bl = c[2];
          if (glowW) {
            if (!emis) emis = new Uint8ClampedArray(P * P * 4);
            emis[o] = r * 0.7; emis[o + 1] = g * 1.1; emis[o + 2] = bl * 1.1; emis[o + 3] = 120;
          }
          if (depth > 0.5 && md(wx, GLINT) === 6 && md(wz, GLINT) === 6 && glints.length < 120 && h2(Math.floor(wx / GLINT), Math.floor(wz / GLINT), 21) < 0.035) glints.push(x0 + px / PPU, z0 + py / PPU);
        }
      }
      img[o] = r; img[o + 1] = g; img[o + 2] = bl;
      img[o + 3] = 255;
    }
  }
  // ---- cliff feet: a plum-dark contact line where each cliff face meets the ground below
  for (let py = 1; py < P - 1; py++) for (let px = 0; px < P; px++) {
    const k = py * P + px;
    if (!CLIFF[k] || CLIFF[k + P]) continue;
    const o = k * 4;
    img[o] *= 0.55; img[o + 1] *= 0.5; img[o + 2] *= 0.62;
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
