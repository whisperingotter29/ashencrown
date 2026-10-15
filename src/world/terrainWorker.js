// Off-thread terrain: builds pixel-art ground images for chunks (relief shading, dithered colour,
// biome micro-texture, cliffs, water), heights for collision, prop scatter, and the world map.
import { heightAt, colorAt, biomeWeights, waterAt, roadAt, primaryBiome } from './terrainGen.js';
import { SCATTER, PROPS, PROP_IDS } from '../data/scatter.js';
import { hash3, mulberry32 } from '../core/rng.js';
import { N1, N2, N3 } from '../core/noise.js';
import { TOWNS, DEEP_TOWNS, DUNGEONS, WAYSTONES, LANDMARKS, SHRINES, RELICS } from '../data/world.js';

const PPU = 10;
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
      if (cliff) { sh *= 0.66 + 0.08 * ((wx % 3 === 0) ? 1 : 0); CLIFF[py * P + px] = 1; }
      sh = clamp(sh, 0.45, 1.45);
      // micro texture
      const n = h2(wx, wz, 3);
      let tex = 1;
      switch (mat) {
        case M_GRASS: case M_MOSS: {
          if (n < 0.07) tex = 1.16; else if (n < 0.13) tex = 0.84;
          if (h2(wx, wz + 1, 3) < 0.07) tex = 1.1;   // two-pixel blades
          if (mat === M_MOSS && h2(wx >> 1, wz >> 1, 9) < 0.08) tex = 0.8;
          if (h2(wx >> 2, wz >> 2, 11) < 0.012) { r = r * 0.3 + 230 * 0.7; g = g * 0.3 + (h2(wx >> 2, wz >> 2, 12) < 0.5 ? 200 : 90) * 0.7; b = b * 0.4 + 90 * 0.6; } // flecks of flowers
          break;
        }
        case M_SAND: {
          const rip = Math.sin(wx * 0.11 + wz * 0.045 + N1(wx * 0.004, wz * 0.004) * 4);
          tex = rip > 0.82 ? 1.1 : rip < -0.9 ? 0.92 : 1;
          if (n < 0.025) tex *= 0.88;
          break;
        }
        case M_SNOW: tex = n < 0.012 ? 1.25 : n < 0.06 ? 0.95 : 1; break;
        case M_ROCK: case M_CAVE: {
          const cr = h2(wx >> 1, wz >> 1, 5);
          tex = cr < 0.08 ? 0.78 : cr > 0.92 ? 1.12 : 1;
          if (((wx + (wz >> 2)) % 7 === 0) && h2(wx >> 3, wz >> 2, 6) < 0.4) tex *= 0.85;
          break;
        }
        case M_ASH: tex = n < 0.05 ? 0.7 : n > 0.97 ? 1.5 : 1; if (n > 0.995) { r = 255; g = 120; b = 40; } break;
        case M_ROAD: {
          // packed dirt with pebbles
          tex = n < 0.08 ? 0.82 : n > 0.94 ? 1.14 : 1;
          break;
        }
        case M_PLAZA: {
          // flagstones: grid with mortar lines and per-stone tone
          const bxs = Math.floor((wx + ((Math.floor(wz / 12) & 1) * 6)) / 12), bzs = Math.floor(wz / 12);
          const mx = (wx + ((Math.floor(wz / 12) & 1) * 6)) % 12, mz = wz % 12;
          tex = (mx === 0 || mz === 0) ? 0.72 : 0.92 + h2(bxs, bzs, 8) * 0.16;
          break;
        }
        case M_DIRT: tex = n < 0.1 ? 0.85 : 1; break;
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
          const fl = N2(wx * 0.025, wz * 0.025) + N1(wx * 0.07, wz * 0.07) * 0.5;
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
          else if (Math.sin(wx * 0.05 + wz * 0.21 + N1(wx * 0.01, wz * 0.01) * 6) > 0.93 && depth < 3) { r += 40; g += 40; b += 30; }
          if (glow) {
            if (!emis) emis = new Uint8ClampedArray(P * P * 4);
            emis[o] = r * 0.7; emis[o + 1] = g * 1.1; emis[o + 2] = b * 1.1; emis[o + 3] = 120;
          }
          if (depth > 0.5 && h2(wx >> 3, wz >> 3, 21) < 0.02 && glints.length < 60) glints.push(x0 + px / PPU, z0 + py / PPU);
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
  const { N, half, realm, row0, rows } = m;
  const data = new Uint8ClampedArray(N * rows * 4);
  const c = [0, 0, 0];
  const s = (half * 2) / N;
  for (let j = 0; j < rows; j++) for (let i = 0; i < N; i++) {
    const x = -half + (i + 0.5) * s, z = -half + (row0 + j + 0.5) * s;
    const h = heightAt(x, z, realm);
    const hx = heightAt(x + s, z, realm), hz = heightAt(x, z + s, realm);
    const slope = Math.min(1, Math.hypot(hx - h, hz - h) / s);
    colorAt(x, z, h, slope, realm, c);
    const shade = Math.max(0.45, Math.min(1.35, 1 + ((h - hx) * 0.35 + (h - hz) * 0.2)));
    let r = c[0] * shade, g = c[1] * shade, b = c[2] * shade;
    const w = waterAt(x, z, realm);
    if (h < w.level && w.type !== 'none') {
      const t = Math.min(1, (w.level - h) / 5);
      const wc = w.type === 'lava' ? [0.9, 0.25, 0.02] : w.type === 'glow' ? [0.05, 0.25, 0.3] : [0.03, 0.13, 0.2];
      r = r * (1 - t) * 0.5 + wc[0] * (0.5 + t * 0.5); g = g * (1 - t) * 0.5 + wc[1] * (0.5 + t * 0.5); b = b * (1 - t) * 0.5 + wc[2] * (0.5 + t * 0.5);
    }
    const k = (j * N + i) * 4;
    data[k] = toS(Math.min(1, r)); data[k + 1] = toS(Math.min(1, g)); data[k + 2] = toS(Math.min(1, b)); data[k + 3] = 255;
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
