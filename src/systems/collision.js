// Static collision: circles and oriented boxes in a spatial hash, plus terrain slope/water checks.
const CELL = 8;
const grid = new Map();
const owners = new Map(); // owner -> [colliders]

const key = (cx, cz) => cx * 73856093 ^ cz * 19349663;

function cellsFor(c) {
  const r = c.br;
  const x0 = Math.floor((c.x - r) / CELL), x1 = Math.floor((c.x + r) / CELL);
  const z0 = Math.floor((c.z - r) / CELL), z1 = Math.floor((c.z + r) / CELL);
  const out = [];
  for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) out.push(key(cx, cz));
  return out;
}

export function addCollider(owner, c) {
  // c: { x, z, r } circle  or { x, z, hw, hd, rot } box ; optional h (height; ignored if player above)
  if (c.hw !== undefined) { c.br = Math.hypot(c.hw, c.hd); c.cos = Math.cos(c.rot || 0); c.sin = Math.sin(c.rot || 0); }
  else c.br = c.r;
  c.owner = owner;
  c.cells = cellsFor(c);
  for (const k of c.cells) {
    let arr = grid.get(k);
    if (!arr) { arr = []; grid.set(k, arr); }
    arr.push(c);
  }
  let list = owners.get(owner);
  if (!list) { list = []; owners.set(owner, list); }
  list.push(c);
  return c;
}

export function removeOwner(owner) {
  const list = owners.get(owner);
  if (!list) return;
  for (const c of list) {
    for (const k of c.cells) {
      const arr = grid.get(k);
      if (!arr) continue;
      const i = arr.indexOf(c);
      if (i >= 0) arr.splice(i, 1);
      if (!arr.length) grid.delete(k);
    }
  }
  owners.delete(owner);
}

export function clearAllColliders() { grid.clear(); owners.clear(); }

const seen = new Set();
export function queryColliders(x, z, r, out = []) {
  out.length = 0;
  seen.clear();
  const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
  const z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
  for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
    const arr = grid.get(key(cx, cz));
    if (!arr) continue;
    for (const c of arr) { if (!seen.has(c)) { seen.add(c); out.push(c); } }
  }
  return out;
}

const tmp = [];
// Push a circle out of all static colliders. Returns {x, z, hit}
export function resolveStatic(x, z, r, y = null) {
  let hit = false;
  for (let iter = 0; iter < 2; iter++) {
    queryColliders(x, z, r + 2, tmp);
    for (const c of tmp) {
      if (y !== null && c.top !== undefined && y > c.top) continue;
      if (c.hw === undefined) {
        const dx = x - c.x, dz = z - c.z;
        const d2 = dx * dx + dz * dz, rr = r + c.r;
        if (d2 < rr * rr) {
          const d = Math.sqrt(d2) || 0.001;
          const push = rr - d;
          x += (dx / d) * push; z += (dz / d) * push; hit = true;
        }
      } else {
        // to box local space
        const dx = x - c.x, dz = z - c.z;
        const lx = dx * c.cos + dz * c.sin, lz = -dx * c.sin + dz * c.cos;
        const cx = Math.max(-c.hw, Math.min(c.hw, lx)), cz = Math.max(-c.hd, Math.min(c.hd, lz));
        let ex = lx - cx, ez = lz - cz;
        const d2 = ex * ex + ez * ez;
        if (d2 < r * r) {
          let nx, nz, push;
          if (d2 > 1e-6) { const d = Math.sqrt(d2); nx = ex / d; nz = ez / d; push = r - d; }
          else {
            // centre inside box: push out along the shallowest axis
            const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz);
            if (px < pz) { nx = Math.sign(lx) || 1; nz = 0; push = px + r; } else { nx = 0; nz = Math.sign(lz) || 1; push = pz + r; }
          }
          const wx = nx * c.cos - nz * c.sin, wz = nx * c.sin + nz * c.cos;
          x += wx * push; z += wz * push; hit = true;
        }
      }
    }
  }
  return { x, z, hit };
}

// Ray/segment test against static colliders (line of sight, projectiles)
export function segmentBlocked(ax, az, bx, bz, pad = 0) {
  const minx = Math.min(ax, bx), maxx = Math.max(ax, bx), minz = Math.min(az, bz), maxz = Math.max(az, bz);
  const cx = (minx + maxx) / 2, cz = (minz + maxz) / 2;
  const r = Math.hypot(maxx - minx, maxz - minz) / 2 + 2;
  queryColliders(cx, cz, r, tmp);
  const dx = bx - ax, dz = bz - az;
  const L2 = dx * dx + dz * dz || 1;
  for (const c of tmp) {
    if (c.noBlockSight) continue;
    const rr = (c.hw === undefined ? c.r : Math.min(c.hw, c.hd)) + pad;
    let t = ((c.x - ax) * dx + (c.z - az) * dz) / L2;
    t = Math.max(0, Math.min(1, t));
    const px = ax + dx * t - c.x, pz = az + dz * t - c.z;
    if (px * px + pz * pz < rr * rr) return true;
  }
  return false;
}
