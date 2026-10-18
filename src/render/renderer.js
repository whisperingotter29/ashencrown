// Pixel renderer: the world is drawn into a small low-res buffer (crisp pixels), coloured light is
// multiplied in, emissive bits are re-drawn bright, then the buffer is upscaled by an integer
// factor with nearest-neighbour filtering. Glows, beams and magic go on top at full resolution
// with additive blending, followed by screen overlays (fog, vignette, damage, fades).
import { scene } from '../px/scene.js';
import { view } from '../px/view.js';
import { PPU, ART, C } from '../px/pix.js';
import { drawMagic } from './magic.js';
import { initPost, presentPost } from './post.js';
import { drawCastShadows } from '../px/shadow.js';
import { bus } from '../core/events.js';
import { G } from '../game.js';

export const R = {
  canvas: null, ctx: null,         // screen canvas (device pixels)
  low: null, lctx: null,           // low-res world buffer
  lightCv: null, lightCtx: null,   // low-res light map
  W: 640, H: 360,
  settings: { pixel: 'auto', glow: true, shadows: 2048, detail: 'high', painterly: 0, bloom: true, dpr: 1 },
  zoomStep: 0,                     // user zoom (+ = closer)
  lights: [],
  ambient: [1, 1, 1],              // multiply colour for the scene (1 = full daylight)
  lightBoost: 1,
  fog: { amount: 0, color: [200, 200, 210] },
  tint: [1, 1, 1],
  fade: 0, damage: 0, white: 0, letterbox: 0, vignette: 0.55,
  focusBox: null, focusZ: 0,       // player's screen box for see-through occluders
  focus: null,                     // world point (player) the focus box is built around
  focusModel: null,                // the player's actor, outlined when something covers it
  xrayHint: false,                 // set by dungeon walls drawn in front of the player
  time: 0,
};

let lightTex = null;
function makeLightTex() {
  // radial light falloff texture
  lightTex = document.createElement('canvas');
  lightTex.width = lightTex.height = 64;
  const g = lightTex.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.55)'); grd.addColorStop(0.7, 'rgba(255,255,255,0.16)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
}
export function resetRendererCaches() { makeLightTex(); tintedLights.clear(); vigKey = ''; }
// polled from the frame loop: a lost -> back transition means cached canvases need rebuilding
let ctxLost = false, lostCheckT = 0;
function checkContextLoss(dt) {
  if ((lostCheckT += dt) < 0.5) return;
  lostCheckT = 0;
  const lost = !!(R.ctx.isContextLost?.() || R.lctx.isContextLost?.());
  if (ctxLost && !lost) bus.emit('canvasRestored');
  ctxLost = lost;
}
const tintedLights = new Map();

export function initRenderer(container) {
  const cv = document.createElement('canvas');
  cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;image-rendering:pixelated;';
  container.appendChild(cv);
  R.canvas = cv;
  R.ctx = cv.getContext('2d', { alpha: false });
  R.low = document.createElement('canvas');
  R.lctx = R.low.getContext('2d', { alpha: false });
  R.lightCv = document.createElement('canvas');
  R.lightCtx = R.lightCv.getContext('2d', { alpha: false, willReadFrequently: true });
  makeLightTex();
  // The browser can drop GPU canvas contents (GPU process reset, memory pressure, long sleep).
  // Every cached image then comes back blank: a black world with only freshly drawn things on it.
  // Catch it and have everything rebuild its caches.
  for (const c of [cv, R.low]) c.addEventListener('contextrestored', () => bus.emit('canvasRestored'));
  initPost(container);
  window.addEventListener('resize', resize);
  resize();
  // compatibility shims for code that still reads these
  R.renderer = { domElement: cv };
  R.grade = { uFade: { get value() { return R.fade; }, set value(v) { R.fade = v; } } };
  return R;
}

export function pixelScale() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const devH = window.innerHeight * dpr;
  let s = R.settings.pixel === 'auto' || !R.settings.pixel ? Math.max(2, Math.round(devH / (210 * ART))) : Math.round(+R.settings.pixel * dpr);
  s = Math.max(1, s + Math.round(R.zoomStep * dpr));
  return s;
}

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const bw = Math.floor(window.innerWidth * dpr), bh = Math.floor(window.innerHeight * dpr);
  R.canvas.width = bw; R.canvas.height = bh;
  const s = pixelScale();
  // one extra pixel of margin so the camera can scroll smoothly by sub-pixels
  R.W = Math.ceil(bw / s) + 2; R.H = Math.ceil(bh / s) + 2;
  R.low.width = R.W; R.low.height = R.H;
  R.lightCv.width = R.W; R.lightCv.height = R.H;
  view.W = R.W; view.H = R.H; view.scale = s; view.dpr = dpr;
  R.lctx.imageSmoothingEnabled = false;
  R.ctx.imageSmoothingEnabled = false;
}

export function applySettings() { resize(); }
export function setZoomStep(n) { R.zoomStep = Math.max(-2, Math.min(3, n)); resize(); }

// ---------------------------------------------------------------- lights
export function requestLight(x, y, z, color, intensity = 8, distance = 12) {
  if (R.lights.length > 160) return;
  R.lights.push({ x, y, z, color, i: intensity, d: distance });
}
export function flushLights() {}

function tintedLight(color) {
  let t = tintedLights.get(color);
  if (t) return t;
  t = document.createElement('canvas');
  t.width = t.height = 64;
  const g = t.getContext('2d');
  g.drawImage(lightTex, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, 64, 64);
  tintedLights.set(color, t);
  return t;
}

// ---------------------------------------------------------------- frame
const list = [];
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

let lastT = 0;
// ---- 2.5D lean. The camera hangs above the middle of the screen looking down at an angle, so
// anything that stands up leans away from the centre the further out it is, and stands a little
// taller near the top of the screen (seen more from the side) than near the bottom (seen from
// above). Walking past a house or a tree, its top swings across: the flat pixel world reads as 3D.
const LEAN = 0.17, SQUASH = 0.09;
function anchorOf(o) {
  if (o.ent) return [o.ent.pos.x * PPU - view.x0, o.ent.pos.z * PPU - view.y0];
  if (typeof o.pos === 'function') return o.pos();
  if (o.x !== undefined && o.z !== undefined) return [o.x * PPU - view.x0, o.z * PPU - view.y0];
  return null;
}
// sets ctx's transform to lean o around its ground point; unit = pixels per low-res pixel
function lean(ctx, o, unit = 1) {
  if (G_flat()) return false;
  const a = anchorOf(o);
  if (!a) return false;
  const W2 = view.W / 2, H2 = view.H / 2;
  const k = -Math.max(-1.2, Math.min(1.2, (a[0] - W2) / W2)) * LEAN;
  const sy = 1 - Math.max(-1.2, Math.min(1.2, (a[1] - H2) / H2)) * SQUASH;
  const by = a[1] * unit;
  ctx.transform(1, 0, k, sy, -k * by, by - sy * by);
  return true;
}
let flatCam = false;
let glowCv = null, glowCtx = null;
const G_flat = () => flatCam;

export function renderFrame(time) {
  flatCam = G.settings?.camera === 'flat';
  const fdt = Math.min(0.1, Math.max(0, (time - (lastT || time))));
  lastT = time;
  R.time = time;
  checkContextLoss(fdt);
  const { lctx, W, H, ctx } = R;
  lctx.setTransform(1, 0, 0, 1, 0, 0);
  lctx.globalCompositeOperation = 'source-over';
  lctx.globalAlpha = 1;
  lctx.fillStyle = scene.background;
  lctx.fillRect(0, 0, W, H);
  if (scene.ground) scene.ground(lctx);
  for (const d of scene.decals) d(lctx);
  for (const d of scene.persist.decals) d(lctx);
  // gather + y-sort world sprites
  list.length = 0;
  for (const o of scene.objects) if (!o.hidden) list.push(o);
  for (const p of scene.providers) p(list);
  list.sort((a, b) => a.sortZ - b.sortZ);
  // flat ground pieces (piers, plazas, rune circles), then shadows under everything that stands up
  for (const o of list) if (o.flat) o.draw(lctx);
  // ---- shadow stage: directional cast shadows (src/px/shadow.js), then contact shadows
  drawCastShadows(lctx, list);
  for (const o of list) if (o.shadow) o.shadow(lctx);
  // ---- end shadow stage
  // the player's screen box: anything in front of it that overlaps turns see-through
  let fb = R.focusBox;
  if (R.focus) {
    const fx0 = Math.round(R.focus.x * PPU - view.x0), fy0 = Math.round(R.focus.z * PPU - view.y0);
    fb = { x: fx0 - 7, y: fy0 - 24, w: 14, h: 25 };
    R.focusZ = R.focus.z;
  }
  // anything standing in front of the player that covers them stays solid; the player is
  // outlined through it afterwards (see the emissive pass) so you never lose track of them
  let covered = R.xrayHint;
  for (const o of list) {
    if (o.flat) continue;
    if (!covered && fb && o.occlude && o.sortZ > R.focusZ && o.bounds) {
      const b = o.bounds();
      if (b && overlap(b, fb)) covered = true;
    }
    if (lean(lctx, o)) { o.draw(lctx); lctx.setTransform(1, 0, 0, 1, 0, 0); } else o.draw(lctx);
  }
  R.xrayHint = false;
  for (const f of scene.pixels) f(lctx);
  for (const f of scene.persist.pixels) f(lctx);
  for (const f of scene.screen) f(lctx);
  for (const f of scene.persist.screen) f(lctx);
  // ---- lighting (multiply)
  const amb = R.ambient;
  const dark = amb[0] < 0.97 || amb[1] < 0.97 || amb[2] < 0.97;
  if (dark) {
    const L = R.lightCtx;
    L.globalCompositeOperation = 'source-over';
    L.fillStyle = `rgb(${Math.round(amb[0] * 255)},${Math.round(amb[1] * 255)},${Math.round(amb[2] * 255)})`;
    L.fillRect(0, 0, W, H);
    L.globalCompositeOperation = 'lighter';
    const night = 1 - (amb[0] + amb[1] + amb[2]) / 3;
    for (const l of R.lights) {
      const r = l.d * PPU * 1.05;
      const px = l.x * PPU - view.x0, py = l.z * PPU - view.y0 - Math.max(0, (l.y - view.ground(l.x, l.z))) * PPU * 0.5;
      if (px < -r || py < -r || px > W + r || py > H + r) continue;
      L.globalAlpha = Math.min(1, (l.i / 18) * (0.6 + night * 0.8) * R.lightBoost);
      L.drawImage(tintedLight(l.color), px - r, py - r, r * 2, r * 2);
    }
    L.globalAlpha = 1;
    if (R.settings.lightSteps !== false) stepLight(L, W, H);
    lctx.globalCompositeOperation = 'multiply';
    lctx.drawImage(R.lightCv, 0, 0);
    lctx.globalCompositeOperation = 'source-over';
  }
  // ---- emissive (unaffected by darkness)
  if (scene.groundEmissive) scene.groundEmissive(lctx);
  for (const o of list) if (o.emissive) { if (!o.flat && lean(lctx, o)) { o.emissive(lctx); lctx.setTransform(1, 0, 0, 1, 0, 0); } else o.emissive(lctx); }
  if (covered && R.focusModel && !R.focusModel.hidden) R.focusModel.drawXray(lctx);
  for (const f of scene.emissives) f(lctx);
  for (const f of scene.persist.emissives) f(lctx);
  // ---- upscale with sub-pixel scroll
  const s = view.scale;
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = false;
  const ox = -Math.round(view.fracX * s), oy = -Math.round(view.fracY * s);
  ctx.drawImage(R.low, 0, 0, W, H, ox - s, oy - s, W * s, H * s);
  // ---- glows. They are drawn on the same pixel grid as the world (one glow pixel = one art
  // pixel), with overlapping glows taking the brighter of the two instead of adding up (a row of
  // wall torches used to sum to pure white), stepped into dithered bands like the light map, then
  // screened over the frame once.
  if (R.settings.glow !== false) {
    const main = R.ctx;
    if (!glowCv || glowCv.width !== W || glowCv.height !== H) {
      glowCv = glowCv || document.createElement('canvas');
      glowCv.width = W; glowCv.height = H;
      glowCtx = glowCv.getContext('2d', { alpha: false, willReadFrequently: true });
    }
    const ctx = glowCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    // glow code works in device pixels relative to the buffer origin; scale that down to art pixels
    ctx.setTransform(1 / s, 0, 0, 1 / s, 0, 0);
    ctx.globalCompositeOperation = 'lighten';
    for (const o of list) if (o.glow) { ctx.save(); if (!o.flat) lean(ctx, o, s); o.glow(ctx); ctx.restore(); }
    for (const f of scene.glows) f(ctx);
    for (const f of scene.persist.glows) f(ctx);
    // soft halos around strong lights at night
    if (dark) {
      const night = 1 - (amb[0] + amb[1] + amb[2]) / 3;
      for (const l of R.lights) {
        if (l.i < 6) continue;
        const r = l.d * PPU * 0.55 * s;
        const px = (l.x * PPU - view.x0) * s, py = (l.z * PPU - view.y0 - Math.max(0, (l.y - view.ground(l.x, l.z))) * PPU * 0.5) * s;
        if (px < -r || py < -r || px > W * s + r || py > H * s + r) continue;
        ctx.globalAlpha = Math.min(0.35, l.i / 120) * night;
        ctx.drawImage(tintedLight(l.color), px - r, py - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    stepLight(ctx, W, H);
    main.globalCompositeOperation = 'screen';
    main.globalAlpha = 0.95;
    main.imageSmoothingEnabled = false;
    main.drawImage(glowCv, 0, 0, W, H, ox - s, oy - s, W * s, H * s);
    main.globalAlpha = 1;
    main.globalCompositeOperation = 'source-over';
  }
  // ---- GPU magic layer (spells, impacts, lightning), added over everything
  drawMagic(ctx, ox - s, oy - s);
  overlays(ctx);
  // ---- camera lens: perspective tilt, depth of field, bloom, grade (WebGL)
  presentPost(R.canvas, fdt);
  // per-frame lists
  scene.decals.length = 0; scene.pixels.length = 0; scene.glows.length = 0; scene.emissives.length = 0; scene.screen.length = 0;
  R.lights.length = 0;
}

// Light map quantised to hard steps with a 4x4 ordered dither: pools of light get crisp pixel
// rings instead of smooth gradients, and blended coloured lights stop fringing into rainbows.
const LIGHT_STEP = 18;
const STEP_LUT = (() => {
  const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const t = new Uint8Array(16 * 256);
  for (let k = 0; k < 16; k++) for (let v = 0; v < 256; v++) t[k * 256 + v] = Math.min(255, Math.floor(v / LIGHT_STEP + (B[k] + 0.5) / 16) * LIGHT_STEP);
  return t;
})();
function stepLight(L, W, H) {
  const img = L.getImageData(0, 0, W, H), d = img.data;
  for (let y = 0; y < H; y++) {
    const row = (y & 3) * 4;
    for (let x = 0, i = y * W * 4; x < W; x++, i += 4) {
      const o = (row + (x & 3)) * 256;
      d[i] = STEP_LUT[o + d[i]]; d[i + 1] = STEP_LUT[o + d[i + 1]]; d[i + 2] = STEP_LUT[o + d[i + 2]];
    }
  }
  L.putImageData(img, 0, 0);
}

// fog, vignette, damage edge, white flash, letterbox, fade
let vigCv = null, vigKey = '';
function overlays(ctx) {
  const w = R.canvas.width, h = R.canvas.height;
  ctx.globalCompositeOperation = 'source-over';
  if (R.fog.amount > 0.01) {
    const f = R.fog.color;
    ctx.fillStyle = `rgba(${f[0]},${f[1]},${f[2]},${Math.min(0.75, R.fog.amount)})`;
    ctx.fillRect(0, 0, w, h);
  }
  // vignette (cached)
  const key = w + 'x' + h;
  if (vigKey !== key) {
    vigKey = key;
    vigCv = document.createElement('canvas');
    vigCv.width = 256; vigCv.height = 256;
    const g = vigCv.getContext('2d');
    const grd = g.createRadialGradient(128, 128, 60, 128, 128, 182);
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  }
  ctx.globalAlpha = R.vignette;
  ctx.drawImage(vigCv, 0, 0, w, h);
  if (R.damage > 0.01) {
    ctx.globalAlpha = Math.min(1, R.damage);
    ctx.globalCompositeOperation = 'source-over';
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, 'rgba(160,0,0,0)'); g.addColorStop(1, 'rgba(170,10,10,0.85)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  ctx.globalAlpha = 1;
  if (R.white > 0.01) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,255,255,${Math.min(0.9, R.white)})`; ctx.fillRect(0, 0, w, h); ctx.globalCompositeOperation = 'source-over'; }
  if (R.letterbox > 0.001) { const lb = R.letterbox * h; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, lb); ctx.fillRect(0, h - lb, w, lb); }
  if (R.fade > 0.001) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, R.fade)})`; ctx.fillRect(0, 0, w, h); }
}

// Draw a soft glow sprite at a world point on the full-res layer (used by vfx / sprites)
export function glowAt(ctx, x, z, h, color, radiusUnits, a = 1) {
  const s = view.scale;
  const r = radiusUnits * PPU * s;
  const px = (x * PPU - view.x0) * s, py = (z * PPU - view.y0 - h * PPU) * s;
  if (px < -r || py < -r || px > view.W * s + r || py > view.H * s + r) return;
  ctx.globalAlpha = Math.max(0, Math.min(1, a));
  ctx.drawImage(tintedLight(typeof color === 'string' ? color : `rgb(${color[0]},${color[1]},${color[2]})`), px - r, py - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}
// same, but at a low-res pixel position (actors know their pixel anchors)
export function glowPx(ctx, px, py, color, rPx, a = 1) {
  const s = view.scale, r = rPx * s;
  ctx.globalAlpha = Math.max(0, Math.min(1, a));
  ctx.drawImage(tintedLight(typeof color === 'string' ? color : `rgb(${color[0]},${color[1]},${color[2]})`), px * s - r, py * s - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}
export { tintedLight };
export const rgbStr = (c) => { c = C(c); return `rgb(${c[0]},${c[1]},${c[2]})`; };
