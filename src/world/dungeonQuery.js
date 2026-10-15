// Tile-grid collision for dungeon interiors (kept separate to avoid import cycles).
import { G } from '../game.js';

export function dungeonWallAt(x, z) {
  const d = G.dungeon;
  if (!d) return false;
  const tx = Math.floor((x - d.ox) / d.tile), tz = Math.floor((z - d.oz) / d.tile);
  if (tx < 0 || tz < 0 || tx >= d.w || tz >= d.h) return true;
  return d.grid[tz * d.w + tx] !== 0;
}

// Resolve a circle against wall tiles
export function dungeonBlocked(nx, nz, r, ox, oz) {
  const d = G.dungeon;
  if (!d) return { x: nx, z: nz };
  let x = nx, z = nz;
  for (let iter = 0; iter < 2; iter++) {
    const tx0 = Math.floor((x - r - d.ox) / d.tile), tx1 = Math.floor((x + r - d.ox) / d.tile);
    const tz0 = Math.floor((z - r - d.oz) / d.tile), tz1 = Math.floor((z + r - d.oz) / d.tile);
    for (let tz = tz0; tz <= tz1; tz++) for (let tx = tx0; tx <= tx1; tx++) {
      const wall = tx < 0 || tz < 0 || tx >= d.w || tz >= d.h || d.grid[tz * d.w + tx] !== 0;
      if (!wall) continue;
      const minx = d.ox + tx * d.tile, minz = d.oz + tz * d.tile;
      const cx = Math.max(minx, Math.min(minx + d.tile, x)), cz = Math.max(minz, Math.min(minz + d.tile, z));
      const ex = x - cx, ez = z - cz;
      const d2 = ex * ex + ez * ez;
      if (d2 < r * r) {
        if (d2 > 1e-8) { const dd = Math.sqrt(d2); x += (ex / dd) * (r - dd); z += (ez / dd) * (r - dd); }
        else { x = ox; z = oz; }
      }
    }
  }
  return { x, z };
}

export function dungeonLOS(ax, az, bx, bz) {
  const d = G.dungeon;
  if (!d) return true;
  const L = Math.hypot(bx - ax, bz - az);
  const n = Math.ceil(L / (d.tile * 0.4));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (dungeonWallAt(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
  }
  return true;
}

// Flow field toward the player (computed by the dungeon each time the player changes tile)
export function dungeonFlowDir(x, z, out) {
  const d = G.dungeon;
  if (!d || !d.flow) return false;
  const tx = Math.floor((x - d.ox) / d.tile), tz = Math.floor((z - d.oz) / d.tile);
  if (tx < 0 || tz < 0 || tx >= d.w || tz >= d.h) return false;
  const here = d.flow[tz * d.w + tx];
  if (here < 0) return false;
  let best = here, bx = 0, bz = 0;
  for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const nx = tx + ox, nz = tz + oz;
    if (nx < 0 || nz < 0 || nx >= d.w || nz >= d.h) continue;
    const v = d.flow[nz * d.w + nx];
    if (v < 0 || v >= best) continue;
    if (ox && oz && (d.grid[tz * d.w + nx] !== 0 || d.grid[nz * d.w + tx] !== 0)) continue;
    best = v; bx = ox; bz = oz;
  }
  if (!bx && !bz) return false;
  const cx = d.ox + (tx + bx + 0.5) * d.tile, cz = d.oz + (tz + bz + 0.5) * d.tile;
  const L = Math.hypot(cx - x, cz - z) || 1;
  out.x = (cx - x) / L; out.z = (cz - z) / L;
  return true;
}
