// Pure terrain functions shared by the main thread and the terrain worker.
// heightAt / colorAt / biomeWeights / dangerLevel for both realms.
import { N1, N2, N3, N4, fbm, ridged } from '../core/noise.js';
import { BIOMES, BIOME_SEEDS, MAW, TOWNS, DEEP_TOWNS, DUNGEONS, WAYSTONES, DANGER_PEAKS, LANDMARKS, SHRINES, RELICS } from '../data/world.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export const BIOME_IDS = ['wastes', 'gilded', 'verdant', 'frost', 'coast', 'maw', 'deep'];
const BLEND = 30;

// ---------- Roads -------------------------------------------------------
export const ROADS = [
  [[200, 520], [400, 640], [600, 800]],
  [[200, 520], [0, 640], [-250, 860]],
  [[200, 520], [250, 330], [190, 150], [60, 98]],
  [[60, 98], [20, 0], [-60, -90], [-170, -190]],
  [[-170, -190], [-20, -300], [40, -460], [40, -600]],
  [[-170, -190], [-290, -10]],
  [[-170, -190], [-420, -230], [-620, -260], [-820, -250]],
  [[-820, -250], [-700, -420], [-560, -560]],
  [[-560, -560], [-480, -720], [-420, -860]],
  [[-820, -250], [-800, 60], [-700, 380]],
  [[-290, -10], [-500, 200], [-700, 380]],
  [[40, -600], [20, -800], [60, -1000]],
  [[40, -600], [220, -680], [380, -720]],
  [[40, -600], [200, -500], [330, -400]],
  [[330, -400], [560, -300], [760, -180], [890, -150]],
  [[890, -150], [880, -400], [870, -620]],
  [[890, -150], [850, 150], [820, 450], [920, 700]],
  [[920, 700], [760, 760], [600, 800]],
  [[-420, -860], [-200, -930], [60, -1000]],
  [[380, -720], [620, -680], [870, -620]],
  [[-250, 860], [-450, 650], [-700, 380]],
  [[20, 0], [200, -200], [330, -400]],
];

export const DEEP_TUNNELS = [
  [[0, -440], [0, -360]],
  [[0, -360], [-120, -260], [-280, 60]],
  [[0, -360], [140, -300], [360, -200], [300, 120]],
  [[-280, 60], [-380, 260], [-200, 420], [0, 440]],
  [[300, 120], [220, 380], [0, 440]],
  [[-280, 60], [0, 100], [300, 120]],
  [[0, 100], [0, 440]],
];

function buildSegments(roads) {
  const segs = [];
  for (const road of roads) {
    for (let i = 0; i < road.length - 1; i++) {
      const [ax, az] = road[i], [bx, bz] = road[i + 1];
      segs.push({ ax, az, bx, bz, minx: Math.min(ax, bx) - 40, maxx: Math.max(ax, bx) + 40, minz: Math.min(az, bz) - 40, maxz: Math.max(az, bz) + 40, ha: 0, hb: 0 });
    }
  }
  return segs;
}
const ROAD_SEGS = buildSegments(ROADS);
const TUNNEL_SEGS = buildSegments(DEEP_TUNNELS);

function segDist(s, x, z) {
  const dx = s.bx - s.ax, dz = s.bz - s.az;
  const L2 = dx * dx + dz * dz;
  let t = ((x - s.ax) * dx + (z - s.az) * dz) / L2;
  t = clamp(t, 0, 1);
  const px = s.ax + dx * t, pz = s.az + dz * t;
  const ex = x - px, ez = z - pz;
  return [Math.sqrt(ex * ex + ez * ez), t];
}

// ---------- Biome weights ----------------------------------------------
const seedArr = BIOME_SEEDS.map(([b, x, z]) => ({ b, x, z }));

export function biomeWeights(x, z, out = {}) {
  for (const id of BIOME_IDS) out[id] = 0;
  const wx = x + N1(x * 0.0035, z * 0.0035) * 110 + N2(x * 0.012, z * 0.012) * 22;
  const wz = z + N2(x * 0.0035 + 40, z * 0.0035) * 110 + N1(x * 0.012 + 9, z * 0.012) * 22;
  const best = { wastes: 1e9, gilded: 1e9, verdant: 1e9, frost: 1e9, coast: 1e9 };
  for (let i = 0; i < seedArr.length; i++) {
    const s = seedArr[i];
    const dx = wx - s.x, dz = wz - s.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < best[s.b]) best[s.b] = d;
  }
  let dmin = 1e9;
  for (const k in best) if (best[k] < dmin) dmin = best[k];
  let sum = 0;
  for (const k in best) {
    const w = Math.exp(-(best[k] - dmin) / BLEND);
    if (w > 0.01) { out[k] = w; sum += w; }
  }
  for (const k in best) out[k] /= sum;
  // The Maw overrides its surroundings
  const mdx = x - MAW.x, mdz = z - MAW.z;
  const md = Math.sqrt(mdx * mdx + mdz * mdz) + N3(x * 0.03, z * 0.03) * 10;
  const mw = 1 - smooth(MAW.r * 0.75, MAW.r * 1.25, md);
  if (mw > 0) {
    for (const k in best) out[k] *= 1 - mw;
    out.maw = mw;
  }
  return out;
}

export function primaryBiome(x, z, realm = 'surface') {
  if (realm === 'deep') return 'deep';
  const w = biomeWeights(x, z, _tmpW);
  let best = 'gilded', bw = -1;
  for (const k in w) if (w[k] > bw) { bw = w[k]; best = k; }
  return best;
}
const _tmpW = {};

// ---------- Per-biome raw heights --------------------------------------
function hWastes(x, z) {
  const large = fbm(N1, x * 0.002, z * 0.002, 3) * 9;
  const warp = N2(x * 0.007, z * 0.007) * 2.4 + N4(x * 0.02, z * 0.02) * 0.4;
  // asymmetric barchan-like ridges: long windward slope, short steep lee face
  const ph = (x * 0.072 + z * 0.028 + warp) / (Math.PI * 2);
  const f = ph - Math.floor(ph);
  const dune = f < 0.78 ? smooth(0, 0.78, f) : 1 - smooth(0.78, 1.0, f);
  const big = Math.pow(1 - Math.abs(Math.sin(x * 0.021 + z * 0.009 + warp * 0.5)), 2.0);
  const duneMask = smooth(-0.3, 0.3, N3(x * 0.004 + 7, z * 0.004));
  const ripple = Math.sin(x * 0.75 + z * 0.3 + N3(x * 0.05, z * 0.05) * 3) * 0.16;
  const m = N4(x * 0.0032 + 3, z * 0.0032);
  const mesaT = smooth(0.56, 0.61, m);
  const mesa = mesaT * (14 + N1(x * 0.05, z * 0.05) * 0.8);
  return 6 + large + (dune * 4.2 + big * 5.5 + ripple) * duneMask * (1 - mesaT) + mesa;
}

function hGilded(x, z) {
  const base = 9 + fbm(N1, x * 0.003 + 11, z * 0.003, 4) * 11;
  const t = base / 4;
  const ft = Math.floor(t);
  const terr = (ft + smooth(0.38, 0.62, t - ft)) * 4;
  return lerp(base, terr, 0.65) + N2(x * 0.03, z * 0.03) * 0.35;
}

function hVerdant(x, z) {
  const hills = fbm(N2, x * 0.0042, z * 0.0042, 5) * 15;
  return 9 + hills + ridged(N3, x * 0.011, z * 0.011, 2) * 3.2;
}

function hFrost(x, z) {
  const r = ridged(N1, x * 0.0032 + 13, z * 0.0032 - 5, 5);
  const north = smooth(-620, -900, z);
  const mountains = r * r * 92 * (0.18 + 0.82 * north);
  const passN = Math.abs(N4(x * 0.0042 + 2, z * 0.0021));
  const pass = smooth(0.02, 0.24, passN);
  return 12 + fbm(N2, x * 0.005, z * 0.005, 3) * 7 + mountains * pass;
}

function hCoast(x, z) {
  const base = 4.5 + fbm(N3, x * 0.004, z * 0.004, 4) * 7;
  const cliffs = smooth(0.35, 0.45, N1(x * 0.006 + 5, z * 0.006)) * 9;
  return base + cliffs;
}

function hMaw(x, z) {
  const dx = x - MAW.x, dz = z - MAW.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  const ang = Math.atan2(dz, dx);
  const rim = 26 * smooth(MAW.r * 1.25, MAW.r * 0.8, d) + N2(x * 0.04, z * 0.04) * 2.5;
  // bowl descending in a lazy spiral to the gate
  const spiral = Math.sin(ang * 2 + d * 0.09) * 1.6;
  const bowl = smooth(MAW.r * 0.82, MAW.pitR * 0.4, d) * 23;
  return 6 + rim - bowl + spiral * smooth(MAW.r * 0.8, MAW.pitR, d);
}

const RAW = { wastes: hWastes, gilded: hGilded, verdant: hVerdant, frost: hFrost, coast: hCoast, maw: hMaw };

function rawSurface(x, z, w) {
  let h = 0;
  for (const k in RAW) if (w[k] > 0) h += w[k] * RAW[k](x, z);
  // Rivers: wet in temperate lands, dry beds in the waste
  const rv = Math.abs(N3(x * 0.0017 + 31, z * 0.0017) + N4(x * 0.006, z * 0.006) * 0.12);
  const wet = (w.verdant || 0) + (w.gilded || 0) * 0.8 + (w.coast || 0);
  if (rv < 0.04) {
    const t = 1 - rv / 0.04;
    const tt = t * t * (3 - 2 * t);
    const floor = wet > 0.4 ? -1.15 : h - 2.5;
    h = lerp(h, Math.min(h, floor), tt * clamp(1 - (w.frost || 0) - (w.maw || 0) * 2, 0, 1));
  }
  // Verdant lakes
  if ((w.verdant || 0) > 0.5) {
    const lk = fbm(N1, x * 0.006 + 77, z * 0.006, 2);
    if (lk > 0.42) h = lerp(h, -3.5, smooth(0.42, 0.55, lk) * (w.verdant - 0.5) * 2);
  }
  // Eastern sea
  const sea = smooth(990, 1110, x + N2(x * 0.004, z * 0.004 + 50) * 70);
  h = lerp(h, -16, sea);
  // World walls: north peaks, west wildwall, south burning dunes
  const north = smooth(-1060, -1190, z + N1(x * 0.01, 3) * 30);
  const west = smooth(-1080, -1190, x + N2(z * 0.01, 9) * 30);
  const south = smooth(1080, 1190, z + N3(x * 0.01, 7) * 30);
  h += north * 110 + west * 70 + south * 60;
  return h;
}

// ---------- Flattening sites (towns, entrances, waystones, landmarks) ------
const FLATS = [];
function addFlat(x, z, r, fall, minH, realm) { FLATS.push({ x, z, r, fall, minH, realm, h: 0 }); }
for (const t of TOWNS) addFlat(t.x, t.z, t.r, 48, 2.0, 'surface');
for (const t of DEEP_TOWNS) addFlat(t.x, t.z, t.r, 20, 1.0, 'deep');
for (const d of DUNGEONS) addFlat(d.x, d.z, 7, 16, 1.6, d.realm || 'surface');
for (const w of WAYSTONES) addFlat(w.x, w.z, 4, 6, 1.4, w.realm);
for (const s of SHRINES) addFlat(s.x, s.z, 4, 6, 1.4, s.realm);
for (const r of RELICS) addFlat(r.x, r.z, 4, 6, 1.4, 'surface');
for (const l of LANDMARKS) {
  if (l.type === 'dead_capital') addFlat(l.x, l.z, l.r * 0.85, 40, 3, 'surface');
  if (l.type === 'glass_field') addFlat(l.x, l.z, l.r, 30, 2.6, 'surface');
  if (l.type === 'stone_circle') addFlat(l.x, l.z, l.r + 4, 10, 2, 'surface');
  if (l.type === 'dwarf_gate') addFlat(l.x, l.z + 18, 20, 16, 2, 'surface');
  if (l.type === 'lighthouse') addFlat(l.x, l.z, 10, 10, 3, 'surface');
  if (l.type === 'spire') addFlat(l.x, l.z, 18, 12, 2, 'surface');
}

let flatsReady = false;
function prepareFlats() {
  if (flatsReady) return;
  flatsReady = true;
  const w = {};
  for (const f of FLATS) {
    if (f.realm === 'deep') { f.h = Math.max(f.minH, rawDeep(f.x, f.z)); continue; }
    biomeWeights(f.x, f.z, w);
    // average a few samples for a calm plateau
    let s = 0;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const px = f.x + Math.cos(a) * f.r * 0.5, pz = f.z + Math.sin(a) * f.r * 0.5;
      biomeWeights(px, pz, w);
      s += rawSurface(px, pz, w);
    }
    f.h = Math.max(f.minH, s / 5);
  }
  // Roads interpolate between the (flattened) heights at their ends
  const rw = {};
  for (const s of ROAD_SEGS) {
    s.ha = Math.max(1.4, surfaceNoRoad(s.ax, s.az, rw));
    s.hb = Math.max(1.4, surfaceNoRoad(s.bx, s.bz, rw));
  }
  for (const s of TUNNEL_SEGS) { s.ha = 1.2; s.hb = 1.2; }
}

function applyFlats(x, z, h, realm) {
  for (let i = 0; i < FLATS.length; i++) {
    const f = FLATS[i];
    if (f.realm !== realm) continue;
    const dx = x - f.x, dz = z - f.z;
    const lim = f.r + f.fall;
    if (dx > lim || dx < -lim || dz > lim || dz < -lim) continue;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d >= lim) continue;
    const t = smooth(f.r + f.fall, f.r, d);
    h = lerp(h, f.h, t);
  }
  return h;
}

function surfaceNoRoad(x, z, w) {
  biomeWeights(x, z, w);
  return applyFlats(x, z, rawSurface(x, z, w), 'surface');
}

// Returns [dist, segment, t] to nearest road
function nearestRoad(x, z, segs) {
  let bd = 1e9, bs = null, bt = 0;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (x < s.minx || x > s.maxx || z < s.minz || z > s.maxz) continue;
    const [d, t] = segDist(s, x, z);
    if (d < bd) { bd = d; bs = s; bt = t; }
  }
  return [bd, bs, bt];
}

// ---------- Deep realm ---------------------------------------------------
const DEEP_CAVERNS = [
  { x: 0, z: -400, r: 70 }, { x: -280, z: 60, r: 75 }, { x: 300, z: 120, r: 75 }, { x: -120, z: -260, r: 45 },
  { x: -380, z: 260, r: 70 }, { x: 360, z: -200, r: 85, lava: true }, { x: 220, z: 380, r: 55 }, { x: -200, z: 420, r: 55 },
  { x: 0, z: 440, r: 60 }, { x: 0, z: 100, r: 80, lake: true }, { x: 140, z: -300, r: 40 }, { x: -420, z: 120, r: 40 },
  { x: 420, z: 300, r: 40 }, { x: -300, z: 200, r: 50 }, { x: 0, z: 240, r: 50 },
];

function rawDeep(x, z) {
  let open = 0;
  for (const c of DEEP_CAVERNS) {
    const dx = x - c.x, dz = z - c.z;
    const d = Math.sqrt(dx * dx + dz * dz) + N2(x * 0.03, z * 0.03) * 14;
    open = Math.max(open, smooth(c.r, c.r * 0.7, d));
  }
  const [td] = nearestRoad(x, z, TUNNEL_SEGS);
  const tw = 10 + N3(x * 0.02, z * 0.02) * 4;
  open = Math.max(open, smooth(tw + 6, tw, td));
  const caveNoise = fbm(N4, x * 0.008, z * 0.008, 3);
  open = Math.max(open, smooth(0.32, 0.4, caveNoise));
  const floor = 1.5 + fbm(N1, x * 0.01, z * 0.01, 3) * 2.5;
  const wall = 13 + ridged(N2, x * 0.02, z * 0.02, 3) * 9;
  let h = lerp(wall, floor, open);
  // lava field & glowing lake basins
  for (const c of DEEP_CAVERNS) {
    if (!c.lava && !c.lake) continue;
    const dx = x - c.x, dz = z - c.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    const pool = fbm(N3, x * 0.025 + c.x, z * 0.025, 2);
    if (d < c.r * 0.85 && pool > 0.05) h = lerp(h, -2.2, smooth(0.05, 0.2, pool) * smooth(c.r * 0.85, c.r * 0.5, d));
  }
  const edge = Math.max(Math.abs(x), Math.abs(z));
  h += smooth(480, 540, edge) * 30;
  return h;
}

// ---------- Public height ------------------------------------------------
const _w = {};
export function heightAt(x, z, realm = 'surface') {
  prepareFlats();
  if (realm === 'deep') {
    let h = rawDeep(x, z);
    h = applyFlats(x, z, h, 'deep');
    return h;
  }
  biomeWeights(x, z, _w);
  let h = rawSurface(x, z, _w);
  h = applyFlats(x, z, h, 'surface');
  const [rd, rs, rt] = nearestRoad(x, z, ROAD_SEGS);
  if (rs && rd < 26) {
    // roads follow the land loosely but are cut gently where it climbs too steeply
    const target = lerp(rs.ha, rs.hb, rt) + N1(x * 0.02, z * 0.02) * 0.6;
    const along = lerp(h, target, clamp(0.5 + Math.abs(h - target) / 28, 0.5, 0.96));
    h = lerp(h, Math.max(along, 0.9), smooth(26, 4, rd));
  }
  return h;
}

export function roadAt(x, z, realm = 'surface') {
  const [d] = nearestRoad(x, z, realm === 'deep' ? TUNNEL_SEGS : ROAD_SEGS);
  return d;
}

// Water: y of the surface and its type
export function waterAt(x, z, realm = 'surface') {
  if (realm === 'deep') {
    const lava = Math.hypot(x - 360, z + 200) < 90;
    return { level: -0.4, type: lava ? 'lava' : 'glow' };
  }
  const md = Math.hypot(x - MAW.x, z - MAW.z);
  if (md < MAW.r * 0.9) return { level: -60, type: 'none' };
  return { level: 0, type: 'water' };
}

// ---------- Colour --------------------------------------------------------
// The ground is painted from per-biome ramps (BIOMES[*].palette, see docs/ART_STYLE.md) as big flat
// clusters: an earth base with cover patches, flora clumps, stone, road and plaza layers. Each world
// sample carries the biome-blended ramps of every layer plus how much of each layer it holds; the
// terrain worker picks a layer and a ramp step per pixel (stepped blob edges, no smooth blending).
export const RAMP_N = 5;                      // deep, shadow, base, light, highlight
export const LAYER = { EARTH: 0, COVER: 1, FLORA: 2, STONE: 3, ROAD: 4, PLAZA: 5 };
export const SAMPLE_F = 6 * RAMP_N * 3;       // floats per sample: 6 layers x 5 steps x rgb (sRGB 0..255)
const LAYER_KEYS = ['earth', 'cover', 'flora', 'stone', 'road', 'plaza'];
const hexRGB = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
function flatRamp(list) { const f = new Float32Array(RAMP_N * 3); list.forEach((h, i) => f.set(hexRGB(h), i * 3)); return f; }
const GP = {};
for (const k in BIOMES) {
  const p = BIOMES[k].palette, f = new Float32Array(SAMPLE_F);
  LAYER_KEYS.forEach((l, li) => f.set(flatRamp(p[l]), li * RAMP_N * 3));
  GP[k] = f;
}
export const BIOME_INDEX = Object.fromEntries(BIOME_IDS.map((k, i) => [k, i]));
const SNOW_R = flatRamp(BIOMES.frost.palette.snow);
const WETSAND_R = flatRamp(['#4a3838', '#5e4a42', '#72604e', '#84705a', '#9e8a6e']);
const GLASS_R = flatRamp(['#140a10', '#1e1016', '#2a141e', '#3e1c28', '#5e2a3a']);
// share of the ground under cover patches, and the chance of a flora clump per 9-px cell
const COVER = { wastes: 0.08, gilded: 0.3, verdant: 0.44, frost: 0.36, coast: 0.5, maw: 0.24, deep: 0.18 };
const FLORA = { wastes: 0.012, gilded: 0.03, verdant: 0.08, frost: 0.012, coast: 0.03, maw: 0.025, deep: 0.035 };
const GLASS_SEA = LANDMARKS.find((l) => l.id === 'glass_sea');

const _tmpR = new Float32Array(SAMPLE_F);
// add w * ramp-set into R at o; layers listed in `swap` take a replacement ramp mixed in by t
function addRamps(R, o, src, w) { for (let i = 0; i < SAMPLE_F; i++) R[o + i] += src[i] * w; }
function mixLayer(R, o, li, ramp, t) {
  if (t <= 0) return;
  const b = o + li * RAMP_N * 3;
  for (let i = 0; i < RAMP_N * 3; i++) R[b + i] += (ramp[i] - R[b + i]) * t;
}

// Ground layers at a world point. Writes SAMPLE_F floats of ramps into R at offset o and the layer
// amounts into `am`: cov (cover share), flo (flora clump chance), stone (stone share), road (distance
// to the road centre line), plaza (signed distance inside a town plaza), style (dominant biome index).
export function groundSample(x, z, h, slope, realm, R, o, am) {
  for (let i = 0; i < SAMPLE_F; i++) R[o + i] = 0;
  if (realm === 'deep') {
    addRamps(R, o, GP.deep, 1);
    am.cov = clamp(COVER.deep + N2(x * 0.02, z * 0.02) * 0.2, 0, 1);
    am.flo = FLORA.deep;
    am.stone = Math.max(smooth(5.4, 6.8, h), smooth(0.55, 0.9, slope) * 0.9);
    am.road = roadAt(x, z, 'deep');
    am.plaza = -99;
    am.style = BIOME_INDEX.deep;
    return am;
  }
  biomeWeights(x, z, _w);
  let cov = 0, flo = 0, stone = 0, pb = 'gilded', bw = -1;
  for (const k in _w) {
    const wt = _w[k];
    if (wt < 0.02) continue;
    if (wt > bw) { bw = wt; pb = k; }
    let c = COVER[k];
    const src = GP[k];
    switch (k) {
      case 'frost': {
        // snow above the snowline (and on the northern wall), slate tundra below it
        const n = N4(x * 0.02, z * 0.02);
        const snowT = clamp(smooth(22, 32, h + n * 8) * (1 - smooth(0.55, 0.85, slope) * 0.8) + smooth(-850, -1000, z) * 0.6, 0, 1);
        _tmpR.set(src);
        mixLayer(_tmpR, 0, LAYER.EARTH, SNOW_R, snowT);
        // on snow the cover patches are wind-scoured slate showing through
        mixLayer(_tmpR, 0, LAYER.COVER, src.subarray(LAYER.STONE * 15, LAYER.STONE * 15 + 15), snowT * 0.8);
        addRamps(R, o, _tmpR, wt);
        c = lerp(c + N1(x * 0.012, z * 0.012 + 7) * 0.24, 0.12, snowT);
        break;
      }
      case 'coast': {
        // beach sand by the water (wet and darker at the tide line), dune grass inland
        _tmpR.set(src);
        mixLayer(_tmpR, 0, LAYER.EARTH, WETSAND_R, smooth(0.9, 0.0, h));
        addRamps(R, o, _tmpR, wt);
        // one layer dominates at a time: dune-grass meadows holding a few sand islands, or open sand
        // with the odd grass tuft patch, joined by a short transition (never an even 50/50 mix)
        c = (0.08 + 0.82 * smooth(-0.1, 0.1, N4(x * 0.0095 + 9, z * 0.0095) + N1(x * 0.04, z * 0.04 + 3) * 0.05)) * smooth(1.6, 3.4, h);
        break;
      }
      case 'verdant': addRamps(R, o, src, wt); c += N2(x * 0.012 + 20, z * 0.012) * 0.34; break;
      case 'gilded': addRamps(R, o, src, wt); c = 0.1 + 0.62 * smooth(-0.14, 0.14, N3(x * 0.011, z * 0.011)); break;
      case 'wastes': addRamps(R, o, src, wt); c += N2(x * 0.01, z * 0.01 + 4) * 0.16; stone += wt * smooth(12.5, 14.5, h) * 0.55; break;
      default: addRamps(R, o, src, wt); c += N3(x * 0.014 + 3, z * 0.014) * 0.16;
    }
    cov += wt * clamp(c, 0, 0.95);
    flo += wt * FLORA[k];
  }
  // glass sea: fused black-red glass over the waste
  const gd = Math.hypot(x - GLASS_SEA.x, z - GLASS_SEA.z) + N1(x * 0.05, z * 0.05) * 14;
  if (gd < GLASS_SEA.r) {
    const t = smooth(GLASS_SEA.r, GLASS_SEA.r * 0.6, gd) * 0.9;
    mixLayer(R, o, LAYER.EARTH, GLASS_R, t); mixLayer(R, o, LAYER.COVER, GLASS_R, t * 0.7);
    cov *= 1 - t; flo *= 1 - t;
  }
  // trodden ground round towns, a paved plaza in the middle
  let plaza = -99;
  for (const t of TOWNS) {
    const d = Math.hypot(x - t.x, z - t.z);
    if (d > t.r * 1.2) continue;
    cov *= 0.35 + 0.65 * smooth(t.r * 0.45, t.r * 1.15, d);
    plaza = Math.max(plaza, t.r * 0.33 + N1(x * 0.2, z * 0.2) * 1.5 - d);
  }
  am.cov = cov; am.flo = flo;
  am.stone = Math.min(1, stone + smooth(0.5, 0.85, slope) * 0.9);
  am.road = roadAt(x, z);
  am.plaza = plaza;
  am.style = BIOME_INDEX[pb];
  return am;
}

// A representative colour (linear rgb) for the world map: the layers mixed by their amounts.
const _am = {};
const toLin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
function mix3(o, a, b, t) { o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; return o; }
const rampCol = (li, idx, o) => { const b = li * RAMP_N * 3 + idx * 3; o[0] = _tmpS[b]; o[1] = _tmpS[b + 1]; o[2] = _tmpS[b + 2]; return o; };
const _tmpS = new Float32Array(SAMPLE_F), _ca = [0, 0, 0];
export function colorAt(x, z, h, slope, realm, out) {
  groundSample(x, z, h, slope, realm, _tmpS, 0, _am);
  rampCol(LAYER.EARTH, 2, out);
  mix3(out, out, rampCol(LAYER.COVER, 2, _ca), clamp(_am.cov, 0, 1));
  mix3(out, out, rampCol(LAYER.STONE, 2, _ca), _am.stone);
  mix3(out, out, rampCol(LAYER.ROAD, 2, _ca), smooth(5.5, 2.5, _am.road) * 0.85);
  if (_am.plaza > -6) mix3(out, out, rampCol(LAYER.PLAZA, 2, _ca), smooth(-3, 0, _am.plaza) * 0.85);
  out[0] = toLin(out[0]); out[1] = toLin(out[1]); out[2] = toLin(out[2]);
  // underwater darkening
  if (h < 0 && realm !== 'deep') {
    const t = smooth(0, -6, h);
    out[0] *= 1 - t * 0.65; out[1] *= 1 - t * 0.45; out[2] *= 1 - t * 0.25;
  }
  if (realm === 'deep' && h < -0.2) mix3(out, out, [0.007, 0.004, 0.008], 0.8);
  return out;
}

// ---------- Danger ---------------------------------------------------------
const STARTS = TOWNS.filter((t) => t.start);
export function dangerLevel(x, z, realm = 'surface') {
  if (realm === 'deep') {
    const d = Math.hypot(x, z + 420);
    return Math.round(clamp(50 + d / 11, 50, 100));
  }
  biomeWeights(x, z, _w);
  let L = 0;
  for (const k in _w) L += _w[k] * BIOMES[k].baseLevel;
  L += N1(x * 0.01, z * 0.01) * 3;
  for (const p of DANGER_PEAKS) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r) L = Math.max(L, lerp(L, p.level, smooth(p.r, p.r * 0.35, d)));
  }
  const edge = Math.max(smooth(800, 1120, -x), smooth(800, 1120, Math.abs(z)), smooth(1000, 1150, x));
  L += edge * 22;
  for (const t of STARTS) {
    const d = Math.hypot(x - t.x, z - t.z);
    const f = smooth(60, 300, d);
    L = Math.min(L, lerp(1 + d / 40, L, f));
  }
  return Math.round(clamp(L, 1, 78));
}

export function isWalkable(x, z, realm, fromH) {
  const h = heightAt(x, z, realm);
  const w = waterAt(x, z, realm);
  if (h < w.level - 1.35) return false;
  if (realm === 'deep' && h > 7) return false;
  if (fromH !== undefined && h - fromH > 1.1) return false;
  return true;
}
