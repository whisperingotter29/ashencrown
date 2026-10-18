// Top-down pixel camera: smooth follow with combat look-ahead, crisp pixel shake, integer zoom
// steps (mouse wheel), cinematic pans, and screen <-> world conversion for aiming and UI.
import { Vec3 } from '../core/vec3.js';
import { R, setZoomStep } from '../render/renderer.js';
import { input } from '../core/input.js';
import { damp } from '../core/math.js';
import { view } from '../px/view.js';
import { PPU, ART } from '../px/pix.js';
import { lensToSource, sourceToLens } from '../render/post.js';

export const cam = {
  target: new Vec3(),
  smooth: new Vec3(),
  zoom: 0.4, zoomGoal: 0.4, contextZoom: 0,   // kept for compatibility with callers
  yaw: 0, yawGoal: 0,                          // top-down: north is always up
  dist: 40,
  trauma: 0,
  cinematic: null,                              // { x, z, speed } world point to pan to
  lookAhead: new Vec3(),
  aim: new Vec3(),
};

export function snapCamera(pos) {
  cam.target.copy(pos);
  cam.smooth.copy(pos);
  apply();
}

export function addShake(amount) { cam.trauma = Math.min(1, cam.trauma + amount); }

// Directional camera kick: an impulse (screen direction dx/dy, size in design pixels, i.e. tenths
// of a world unit, converted to art pixels with ART) that a stiff spring pulls back to rest. Hits
// punch the view toward the target, getting hit knocks it away, recoil nudges it backwards.
// Integer-pixel output keeps the image crisp. Shake and kick cover the same patch of world (and
// so the same screen distance) at any pixel density.
const kickS = { x: 0, y: 0, vx: 0, vy: 0 };
export function kick(dx, dy, px) {
  const L = Math.hypot(dx, dy);
  if (!L || !px) return;
  const v = px * ART * 23;
  kickS.vx += (dx / L) * v; kickS.vy += (dy / L) * v;
}
function stepKick(dt) {
  const n = 4, h = dt / n;
  for (let i = 0; i < n; i++) {
    kickS.vx += (-520 * kickS.x - 30 * kickS.vx) * h;
    kickS.vy += (-520 * kickS.y - 30 * kickS.vy) * h;
    kickS.x += kickS.vx * h; kickS.y += kickS.vy * h;
  }
  const lim = 8 * ART;
  kickS.x = Math.max(-lim, Math.min(lim, kickS.x)); kickS.y = Math.max(-lim, Math.min(lim, kickS.y));
}

export function updateCamera(dt, allowInput = true) {
  if (allowInput && input.mouse.wheel) setZoomStep(R.zoomStep - Math.sign(input.mouse.wheel));
  let tx, tz, k = 7;
  if (cam.cinematic) { tx = cam.cinematic.x; tz = cam.cinematic.z; k = cam.cinematic.speed ?? 2; }
  else { tx = cam.target.x + cam.lookAhead.x; tz = cam.target.z + cam.lookAhead.z - 0.6; }
  cam.smooth.x = damp(cam.smooth.x, tx, k, dt);
  cam.smooth.z = damp(cam.smooth.z, tz, k, dt);
  cam.smooth.y = cam.target.y;
  // shake: integer low-res pixels so the image stays crisp; layered sines give a rough,
  // non-repeating rattle, plus the spring kick on top
  stepKick(dt);
  const amt = cam.shakeScale ?? 1;
  let sx = 0, sy = 0;
  if (cam.trauma > 0) {
    const s = cam.trauma * cam.trauma * 7 * ART;
    const t = performance.now() * 0.001;
    sx = (Math.sin(t * 61.3) * 0.7 + Math.sin(t * 23.9 + 0.7) * 0.3) * s;
    sy = (Math.sin(t * 47.1 + 1.3) * 0.7 + Math.sin(t * 31.7 + 2.1) * 0.3) * s;
    cam.trauma = Math.max(0, cam.trauma - dt * 1.8);
  }
  view.shakeX = Math.round((sx + kickS.x) * amt);
  view.shakeY = Math.round((sy + kickS.y) * amt);
  cam.dist = 40 / Math.max(1, view.scale / 3);
  apply();
}

function apply() {
  const px = cam.smooth.x * PPU - view.W / 2 + view.shakeX, pz = cam.smooth.z * PPU - view.H / 2 + view.shakeY;
  view.x0 = Math.floor(px); view.y0 = Math.floor(pz);
  view.fracX = px - view.x0; view.fracY = pz - view.y0;
  view.cx = cam.smooth.x; view.cz = cam.smooth.z;
}

// screen (CSS px) -> world on the ground plane
export function mouseWorld(y, out = cam.aim) {
  const s = view.scale, dpr = view.dpr;
  const [mx, my] = lensToSource(input.mouse.x, input.mouse.y);
  const lx = (mx * dpr + Math.round(view.fracX * s) + s) / s;
  const ly = (my * dpr + Math.round(view.fracY * s) + s) / s;
  out.set((lx + view.x0) / PPU, y, (ly + view.y0) / PPU);
  return out;
}

// cursor position in low-res pixels (same space as view.x0 / sprites)
export function cursorLow() {
  const s = view.scale, dpr = view.dpr;
  const [mx, my] = lensToSource(input.mouse.x, input.mouse.y);
  return [(mx * dpr + Math.round(view.fracX * s) + s) / s, (my * dpr + Math.round(view.fracY * s) + s) / s];
}

// movement basis: W = up the screen (-z), D = right (+x)
export function moveBasis() { return { fx: 0, fz: -1, rx: 1, rz: 0 }; }

// world -> CSS pixels (for DOM damage numbers and markers). y is world height.
export function worldToScreen(v, out = { x: 0, y: 0, visible: false }) {
  const s = view.scale, dpr = view.dpr;
  const h = v.y - view.ground(v.x, v.z);
  const lx = v.x * PPU - view.x0, ly = v.z * PPU - view.y0 - h * PPU;
  [out.x, out.y] = sourceToLens((lx * s - Math.round(view.fracX * s) - s) / dpr, (ly * s - Math.round(view.fracY * s) - s) / dpr);
  out.visible = out.x > -50 && out.y > -50 && out.x < window.innerWidth + 50 && out.y < window.innerHeight + 50;
  return out;
}
