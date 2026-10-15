// Streams pixel-art terrain chunks around the camera, draws them as the ground layer, provides
// height/water lookups for gameplay, and feeds y-sorted prop sprites to the renderer.
import { heightAt as genHeight, waterAt } from './terrainGen.js';
import { PROPS, PROP_IDS } from '../data/scatter.js';
import { addCollider, removeOwner } from '../systems/collision.js';
import { scene } from '../px/scene.js';
import { view } from '../px/view.js';
import { PPU } from '../px/pix.js';
import { propSprite } from '../px/sprites/props.js';
import { glowAt } from '../render/renderer.js';
import { castSprite } from '../px/shadow.js';
import { G } from '../game.js';
import TerrainWorker from './terrainWorker.js?worker&inline';

const SIZE = 32;
const P = SIZE * PPU;

export const terrain = {
  realm: 'surface',
  chunks: new Map(),
  workers: [],
  inflight: 0,
  reqId: 1,
  focus: { x: 0, z: 0 },
  ready: false,
  glowLights: [],
  enabled: true,
  onMapRows: null,
};

export function initTerrain() {
  const n = Math.max(2, Math.min(4, (navigator.hardwareConcurrency || 4) - 2));
  for (let i = 0; i < n; i++) {
    const w = new TerrainWorker();
    w.onmessage = onWorkerMessage;
    w.busy = 0;
    terrain.workers.push(w);
  }
  scene.ground = drawGround;
  scene.groundEmissive = drawGroundEmissive;
  scene.providers.add(provideProps);
  view.ground = groundHeight;
}

function onWorkerMessage(e) {
  const m = e.data;
  if (m.type === 'map') { terrain.onMapRows && terrain.onMapRows(m); return; }
  if (m.type !== 'chunk') return;
  this.busy--;
  terrain.inflight--;
  const ch = terrain.chunks.get(m.key);
  if (!ch || ch.reqId !== m.id || m.realm !== terrain.realm) return;
  // ground image
  const cv = document.createElement('canvas');
  cv.width = cv.height = m.P;
  cv.getContext('2d').putImageData(new ImageData(m.img, m.P, m.P), 0, 0);
  ch.cv = cv;
  if (m.emis) { const ev = document.createElement('canvas'); ev.width = ev.height = m.P; ev.getContext('2d').putImageData(new ImageData(m.emis, m.P, m.P), 0, 0); ch.emis = ev; }
  ch.H = m.H; ch.G = m.G; ch.step = m.step;
  ch.glints = m.glints;
  ch.loaded = true;
  if (m.props && !ch.props) {
    ch.props = m.props;
    ch.sprites = [];
    const owner = 'chunk:' + ch.key;
    removeOwner(owner);
    for (let i = 0; i < m.props.length; i += 6) {
      const def = PROPS[PROP_IDS[m.props[i]]];
      if (def.r > 0) addCollider(owner, { x: m.props[i + 1], z: m.props[i + 3], r: def.r * m.props[i + 5] });
      ch.sprites.push(makeProp(m.props[i], m.props[i + 1], m.props[i + 2], m.props[i + 3], m.props[i + 4], m.props[i + 5]));
    }
  }
}

// ---------------------------------------------------------------- props as drawables
function makeProp(type, x, y, z, rot, scale) {
  const id = PROP_IDS[type];
  const def = PROPS[id];
  const variant = Math.floor(((rot / (Math.PI * 2)) % 1) * 4);
  const sp = propSprite(id, variant, scale);
  const tall = sp.frames[0].h > 22;
  const o = {
    x, z, sortZ: z, id, def, sp, phase: x * 0.37 + z * 0.23,
    occlude: tall,
    bounds() { const f = sp.frames[0]; return { x: Math.round(x * PPU - view.x0) - f.ox, y: Math.round(z * PPU - view.y0) - f.oy, w: f.w, h: f.h }; },
    frame() { const n = sp.frames.length; return n > 1 ? sp.frames[((Math.floor(G.realTime * (def.sway ? 2.2 : 4) + o.phase) % n) + n) % n] : sp.frames[0]; },
    draw(ctx) {
      const f = o.frame();
      ctx.drawImage(f.canvas(), Math.round(x * PPU - view.x0) - f.ox, Math.round(z * PPU - view.y0) - f.oy);
    },
  };
  // directional ground shadow (src/px/shadow.js) for anything taller than a pebble
  if (sp.frames[0].oy > 7) o.castShadow = (sctx) => castSprite(sctx, o.frame(), Math.round(x * PPU - view.x0), Math.round(z * PPU - view.y0));
  if (sp.emis) o.emissive = (ctx) => { const f = sp.emis; ctx.drawImage(f.canvas(), Math.round(x * PPU - view.x0) - f.ox, Math.round(z * PPU - view.y0) - f.oy); };
  if (def.glow) o.glow = (ctx) => glowAt(ctx, x, z, (sp.frames[0].oy * 0.55) / PPU, def.glow, 1.4 + scale * 0.6, 0.45 + 0.15 * Math.sin(G.realTime * 2 + o.phase));
  return o;
}

function provideProps(out) {
  if (!terrain.enabled) return;
  const x0 = view.x0 / PPU - 4, x1 = (view.x0 + view.W) / PPU + 4, z0 = view.y0 / PPU - 2, z1 = (view.y0 + view.H) / PPU + 10;
  for (const ch of terrain.chunks.values()) {
    if (!ch.sprites) continue;
    const cx0 = ch.cx * SIZE, cz0 = ch.cz * SIZE;
    if (cx0 > x1 || cx0 + SIZE < x0 || cz0 > z1 || cz0 + SIZE < z0) continue;
    for (const s of ch.sprites) if (s.x > x0 && s.x < x1 && s.z > z0 && s.z < z1) out.push(s);
  }
}

// ---------------------------------------------------------------- ground drawing
function drawGround(ctx) {
  if (!terrain.enabled) return;
  for (const ch of terrain.chunks.values()) {
    if (!ch.cv) continue;
    const px = ch.cx * P - view.x0, py = ch.cz * P - view.y0;
    if (px > view.W || py > view.H || px + P < 0 || py + P < 0) continue;
    ctx.drawImage(ch.cv, px, py);
  }
  // twinkling water glints
  const t = G.realTime;
  ctx.fillStyle = '#e8f8ff';
  for (const ch of terrain.chunks.values()) {
    const gl = ch.glints;
    if (!gl || !gl.length) continue;
    for (let i = 0; i < gl.length; i += 2) {
      const ph = (t * 0.9 + gl[i] * 0.13 + gl[i + 1] * 0.07) % 3;
      if (ph > 0.6) continue;
      const px = Math.round(gl[i] * PPU - view.x0 + Math.sin(t + i) * 2), py = Math.round(gl[i + 1] * PPU - view.y0);
      if (px < 0 || py < 0 || px > view.W || py > view.H) continue;
      const len = ph < 0.3 ? 3 : 2;
      ctx.fillRect(px - (len >> 1), py, len, 1);
    }
  }
}
function drawGroundEmissive(ctx) {
  if (!terrain.enabled) return;
  for (const ch of terrain.chunks.values()) {
    if (!ch.emis) continue;
    const px = ch.cx * P - view.x0, py = ch.cz * P - view.y0;
    if (px > view.W || py > view.H || px + P < 0 || py + P < 0) continue;
    ctx.drawImage(ch.emis, px, py);
  }
}

// ---------------------------------------------------------------- streaming
export function updateTerrain(dt, fx, fz) {
  if (!terrain.enabled) return;
  terrain.focus.x = fx; terrain.focus.z = fz;
  // chunks covering the view (plus a margin), nearest first
  const vx0 = Math.min(view.x0 / PPU, fx - 30), vx1 = Math.max((view.x0 + view.W) / PPU, fx + 30);
  const vz0 = Math.min(view.y0 / PPU, fz - 20), vz1 = Math.max((view.y0 + view.H) / PPU, fz + 20);
  const cx0 = Math.floor(vx0 / SIZE) - 1, cx1 = Math.floor(vx1 / SIZE) + 1, cz0 = Math.floor(vz0 / SIZE) - 1, cz1 = Math.floor(vz1 / SIZE) + 1;
  const requests = [];
  const wanted = new Set();
  for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
    const key = cx + ',' + cz;
    wanted.add(key);
    let ch = terrain.chunks.get(key);
    if (!ch) { ch = { key, cx, cz, reqId: 0, cv: null, props: null, loaded: false, requested: false }; terrain.chunks.set(key, ch); }
    ch.lastUsed = G.realTime;
    if (!ch.requested) requests.push({ ch, d: Math.hypot(cx * SIZE + SIZE / 2 - fx, cz * SIZE + SIZE / 2 - fz) });
  }
  // evict far, unused chunks (keep a cache so turning around is instant)
  if (terrain.chunks.size > 90) {
    const old = [...terrain.chunks.values()].filter((c) => !wanted.has(c.key)).sort((a, b) => (a.lastUsed || 0) - (b.lastUsed || 0));
    for (const ch of old.slice(0, terrain.chunks.size - 70)) { removeOwner('chunk:' + ch.key); terrain.chunks.delete(ch.key); }
  }
  requests.sort((a, b) => a.d - b.d);
  for (const r of requests) {
    if (terrain.inflight >= terrain.workers.length * 2) break;
    const w = terrain.workers.reduce((a, b) => (a.busy <= b.busy ? a : b));
    r.ch.requested = true;
    r.ch.reqId = terrain.reqId++;
    w.busy++; terrain.inflight++;
    w.postMessage({ type: 'chunk', id: r.ch.reqId, key: r.ch.key, cx: r.ch.cx, cz: r.ch.cz, size: SIZE, realm: terrain.realm, withProps: !r.ch.props });
  }
  // glowing props become lights
  terrain.glowLights.length = 0;
  for (const ch of terrain.chunks.values()) {
    if (!ch.sprites || !wanted.has(ch.key)) continue;
    for (const s of ch.sprites) if (s.def.glow && (Math.round(s.x * 7) % 5 === 0)) terrain.glowLights.push({ x: s.x, y: groundHeight(s.x, s.z) + 1.5, z: s.z, color: s.def.glow });
  }
  // ready when the chunks around the focus are drawn
  let near = 0, nearLoaded = 0;
  for (const ch of terrain.chunks.values()) {
    const d = Math.max(Math.abs(ch.cx * SIZE + SIZE / 2 - fx), Math.abs(ch.cz * SIZE + SIZE / 2 - fz));
    if (d < SIZE * 1.6) { near++; if (ch.loaded) nearLoaded++; }
  }
  terrain.ready = near > 0 && near === nearLoaded;
}

export function terrainProgress() {
  let total = 0, loaded = 0;
  const fx = terrain.focus.x, fz = terrain.focus.z;
  for (const ch of terrain.chunks.values()) {
    const d = Math.max(Math.abs(ch.cx * SIZE + SIZE / 2 - fx), Math.abs(ch.cz * SIZE + SIZE / 2 - fz));
    if (d > SIZE * 2.5) continue;
    total++; if (ch.loaded) loaded++;
  }
  return total ? loaded / total : 0;
}

export function setRealm(realm) {
  terrain.realm = realm;
  for (const key of terrain.chunks.keys()) removeOwner('chunk:' + key);
  terrain.chunks.clear();
  terrain.ready = false;
}

export function setTerrainVisible(v) { terrain.enabled = v; }

// Ground height under a point: chunk grid when loaded, analytic otherwise
export function groundHeight(x, z) {
  if (G.realm === 'dungeon') return G.dungeon?.floorY ?? 0;
  const cx = Math.floor(x / SIZE), cz = Math.floor(z / SIZE);
  const ch = terrain.chunks.get(cx + ',' + cz);
  if (ch && ch.H) {
    const fi = (x - cx * SIZE) / ch.step + 1, fj = (z - cz * SIZE) / ch.step + 1;
    const i = Math.floor(fi), j = Math.floor(fj);
    const tx = fi - i, tz = fj - j, Gg = ch.G, H = ch.H;
    const h00 = H[j * Gg + i], h10 = H[j * Gg + i + 1], h01 = H[(j + 1) * Gg + i], h11 = H[(j + 1) * Gg + i + 1];
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  }
  return genHeight(x, z, terrain.realm);
}

export function waterLevel(x, z) { return waterAt(x, z, terrain.realm).level; }

// Map image generation (progressive) on the workers
export function generateMapImage(realm, N, half, onDone, onProgress) {
  const data = new Uint8ClampedArray(N * N * 4);
  const rowsPer = 16;
  let next = 0, done = 0;
  const workers = terrain.workers;
  const prev = terrain.onMapRows;
  terrain.onMapRows = (m) => {
    if (m.realm !== realm) { prev && prev(m); return; }
    data.set(m.data, m.row0 * N * 4);
    done += m.rows;
    onProgress && onProgress(done / N);
    if (next < N) dispatch();
    if (done >= N) { terrain.onMapRows = prev; onDone(data); }
  };
  const dispatch = () => {
    const rows = Math.min(rowsPer, N - next);
    const w = workers[(next / rowsPer) % workers.length | 0];
    w.postMessage({ type: 'map', N, half, realm, row0: next, rows });
    next += rows;
  };
  for (let i = 0; i < workers.length && next < N; i++) dispatch();
}
