// Shared view transform for the pixel renderer: world (x, z, height) -> low-res pixels.
import { PPU } from './pix.js';

export const view = {
  W: 640, H: 360,     // low-res buffer size
  scale: 3,           // device pixels per low-res pixel (integer)
  dpr: 1,
  x0: 0, y0: 0,       // world-pixel coordinate of the buffer's top-left
  cx: 0, cz: 0,       // camera centre in world units
  shakeX: 0, shakeY: 0,
  ground: (x, z) => 0, // ground height lookup (set by the terrain / dungeon modules)
};

// world -> low-res pixel (integer). h = height above ground in world units
export function sx(x) { return Math.round(x * PPU - view.x0); }
export function sy(z, h = 0) { return Math.round(z * PPU - view.y0 - h * PPU); }
// world -> device pixel on the screen canvas (for glow / FX layer)
export function fx(x) { return (x * PPU - view.x0) * view.scale; }
export function fy(z, h = 0) { return (z * PPU - view.y0 - h * PPU) * view.scale; }
export function onScreen(x, z, margin = 4) {
  const px = x * PPU - view.x0, pz = z * PPU - view.y0;
  const m = margin * PPU;
  return px > -m && pz > -m && px < view.W + m && pz < view.H + m * 2.5;
}
// height of a world point above the local ground (for particles and projectiles)
export function above(x, y, z) { return y - view.ground(x, z); }
