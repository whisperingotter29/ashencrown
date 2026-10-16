// Painted world-map images (generated on the terrain workers) and fog of war.
import { G } from '../game.js';
import { generateMapImage } from './terrain.js';
import { WORLD_HALF } from '../data/world.js';

export const MAP = {
  surface: { canvas: null, N: 512, half: WORLD_HALF, ready: false, progress: 0 },
  deep: { canvas: null, N: 256, half: 540, ready: false, progress: 0 },
};
export const FOG_N = 96;
export const FULL_MAP = true;

// after a GPU reset the map canvases come back blank: repaint them from the kept pixels
export function repaintMaps() {
  for (const m of Object.values(MAP)) {
    if (!m.pixels) continue;
    const c = document.createElement('canvas'); c.width = c.height = m.N;
    c.getContext('2d').putImageData(m.pixels, 0, 0);
    m.canvas = c;
  }
}

export function buildMaps(onProgress) {
  return new Promise((resolve) => {
    let pending = 0;
    for (const realm of ['surface', 'deep']) {
      const m = MAP[realm];
      if (m.ready) continue;
      pending++;
      generateMapImage(realm, m.N, m.half, (data) => {
        const c = document.createElement('canvas');
        c.width = c.height = m.N;
        const g = c.getContext('2d');
        const img = new ImageData(data, m.N, m.N);
        g.putImageData(img, 0, 0);
        // painterly finish: soft vignette + grain
        g.globalCompositeOperation = 'multiply';
        const gr = g.createRadialGradient(m.N / 2, m.N / 2, m.N * 0.3, m.N / 2, m.N / 2, m.N * 0.75);
        gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#6a5a48');
        g.fillStyle = gr; g.fillRect(0, 0, m.N, m.N);
        g.globalCompositeOperation = 'source-over';
        m.canvas = c;
        m.pixels = g.getImageData(0, 0, m.N, m.N);   // kept to repaint after a GPU reset
        m.ready = true;
        if (--pending === 0) resolve();
      }, (p) => { m.progress = p; onProgress && onProgress(realm, p); });
    }
    if (!pending) resolve();
  });
}

// --- fog of war -------------------------------------------------------------
function fogArr(realm) {
  const c = G.char;
  if (!c.fogData) c.fogData = {};
  if (!c.fogData[realm]) {
    const saved = c.fog?.[realm];
    const arr = new Uint8Array(FOG_N * FOG_N);
    if (saved) { const bin = atob(saved); for (let i = 0; i < bin.length && i < arr.length; i++) arr[i] = bin.charCodeAt(i); }
    // the whole map is charted from the start: no fog of war
    if (FULL_MAP) arr.fill(1);
    c.fogData[realm] = arr;
  }
  return c.fogData[realm];
}

export function revealAround(realm, x, z, r = 70) {
  if (realm !== 'surface' && realm !== 'deep') return false;
  const m = MAP[realm];
  const arr = fogArr(realm);
  const cell = (m.half * 2) / FOG_N;
  const cx = Math.floor((x + m.half) / cell), cz = Math.floor((z + m.half) / cell);
  const rc = Math.ceil(r / cell);
  let changed = false;
  for (let j = cz - rc; j <= cz + rc; j++) for (let i = cx - rc; i <= cx + rc; i++) {
    if (i < 0 || j < 0 || i >= FOG_N || j >= FOG_N) continue;
    if ((i - cx) ** 2 + (j - cz) ** 2 > rc * rc) continue;
    if (!arr[j * FOG_N + i]) { arr[j * FOG_N + i] = 1; changed = true; }
  }
  return changed;
}

export function isRevealed(realm, x, z) {
  const m = MAP[realm];
  const arr = fogArr(realm);
  const cell = (m.half * 2) / FOG_N;
  const i = Math.floor((x + m.half) / cell), j = Math.floor((z + m.half) / cell);
  if (i < 0 || j < 0 || i >= FOG_N || j >= FOG_N) return false;
  return !!arr[j * FOG_N + i];
}

export function fogMask(realm) { return fogArr(realm); }

export function serializeFog() {
  const c = G.char;
  if (!c.fogData) return;
  c.fog = c.fog || {};
  for (const [realm, arr] of Object.entries(c.fogData)) {
    let s = '';
    for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
    c.fog[realm] = btoa(s);
  }
}
