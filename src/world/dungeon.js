// Dungeon interiors: rooms-and-corridors, caves, and living labyrinths that rearrange themselves.
// Drawn as a pixel tile map in 3/4 view: floor slabs as the ground layer, wall tops and faces
// as y-sorted rows (so heroes walk behind walls), with props, chests, torches and portals.
import { G } from '../game.js';
import { R, requestLight, glowPx } from '../render/renderer.js';
import { DUNGEON_THEMES, DUNGEONS } from '../data/world.js';
import { RNG, hashStr, rand } from '../core/rng.js';
import { spawnEnemy, clearSpawns } from '../systems/spawner.js';
import { bus } from '../core/events.js';
import { particle, burst, floatText, ring, flash } from '../render/vfx.js';
import { atmo } from './atmosphere.js';
import { setTerrainVisible } from './terrain.js';
import { clearCombat } from '../systems/combat.js';
import { addShake } from './cameraRig.js';
import { scene, addObject, removeObject } from '../px/scene.js';
import { view } from '../px/view.js';
import { PPU, ART, ap, C, bayer, hash2 } from '../px/pix.js';
import { dungeonTiles, dpropSprite, chestSprite, torchSprite, bulbSprite } from '../px/sprites/dprops.js';
import { propSprite } from '../px/sprites/props.js';
import { bannerSprite, brazierSprite, flamePalette } from '../px/sprites/buildings.js';
import { RAMPS, INK } from '../px/palette.js';
const OX = 20000, OZ = 20000;
// palette picks (docs/ART_STYLE.md): ink void past the walls, plum contact shadows
const VOID = '#0c0812', SHADOW_FILL = 'rgba(20,12,30,0.42)', WALL_SHADOW = 'rgba(26,12,34,0.5)', WALL_SHADOW2 = 'rgba(26,12,34,0.26)';
const WALL_H = 4.6;

export function dungeonDef(id) { return DUNGEONS.find((d) => d.id === id); }

// ------------------------------------------------------------------- layout generators
function genRooms(rng, size) {
  const cellT = 9, W = size * cellT + 2, Hh = size * cellT + 2;
  const grid = new Uint8Array(W * Hh).fill(1);
  const rooms = [];
  const cells = [];
  for (let cy = 0; cy < size; cy++) for (let cx = 0; cx < size; cx++) {
    const isRoom = rng.chance(0.72) || (cx === 0 && cy === 0);
    const w = isRoom ? rng.int(4, 7) : 2, h = isRoom ? rng.int(4, 7) : 2;
    const x = 1 + cx * cellT + rng.int(1, cellT - w - 1), y = 1 + cy * cellT + rng.int(1, cellT - h - 1);
    const room = { x, y, w, h, cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2), real: isRoom, gx: cx, gy: cy };
    cells.push(room);
    if (isRoom) rooms.push(room);
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) grid[j * W + i] = 0;
  }
  const at = (cx, cy) => cells[cy * size + cx];
  // spanning tree (randomised DFS) + loops
  const seen = new Set([0]);
  const stack = [[0, 0]];
  const edges = [];
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [cx + dx, cy + dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < size && y < size && !seen.has(y * size + x));
    if (!nb.length) { stack.pop(); continue; }
    const [nx, ny] = nb[rng.int(0, nb.length - 1)];
    seen.add(ny * size + nx);
    edges.push([at(cx, cy), at(nx, ny)]);
    stack.push([nx, ny]);
  }
  for (let k = 0; k < size; k++) {
    const cx = rng.int(0, size - 2), cy = rng.int(0, size - 1);
    edges.push([at(cx, cy), at(cx + 1, cy)]);
  }
  const carve = (x, y) => { for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const xx = x + i, yy = y + j; if (xx > 0 && yy > 0 && xx < W - 1 && yy < Hh - 1) grid[yy * W + xx] = 0; } };
  for (const [a, b] of edges) {
    let x = a.cx, y = a.cy;
    while (x !== b.cx) { carve(x, y); x += Math.sign(b.cx - x); }
    while (y !== b.cy) { carve(x, y); y += Math.sign(b.cy - y); }
    carve(x, y);
  }
  return { W, H: Hh, grid, rooms, entrance: at(0, 0) };
}

function genCave(rng, size) {
  const W = size * 8 + 6, Hh = size * 8 + 6;
  let g = new Uint8Array(W * Hh);
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) g[j * W + i] = i === 0 || j === 0 || i === W - 1 || j === Hh - 1 || rng.f() < 0.44 ? 1 : 0;
  for (let it = 0; it < 5; it++) {
    const n = new Uint8Array(W * Hh);
    for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) {
      if (i === 0 || j === 0 || i === W - 1 || j === Hh - 1) { n[j * W + i] = 1; continue; }
      let c = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) c += g[(j + dj) * W + i + di];
      n[j * W + i] = c >= 5 ? 1 : 0;
    }
    g = n;
  }
  // keep largest region
  const lab = new Int32Array(W * Hh).fill(-1);
  let best = -1, bestN = 0, label = 0;
  for (let k = 0; k < W * Hh; k++) {
    if (g[k] || lab[k] >= 0) continue;
    const q = [k]; lab[k] = label; let n = 0;
    while (q.length) { const c = q.pop(); n++; const x = c % W, y = (c / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nk = (y + dy) * W + x + dx; if (!g[nk] && lab[nk] < 0) { lab[nk] = label; q.push(nk); } } }
    if (n > bestN) { bestN = n; best = label; }
    label++;
  }
  for (let k = 0; k < W * Hh; k++) if (!g[k] && lab[k] !== best) g[k] = 1;
  // entrance: floor tile nearest the top-left corner
  let ent = null, ed = 1e9;
  for (let k = 0; k < W * Hh; k++) if (!g[k]) { const x = k % W, y = (k / W) | 0; const d = x + y; if (d < ed) { ed = d; ent = { cx: x, cy: y }; } }
  // open up a small entrance hall
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) { const x = ent.cx + i, y = ent.cy + j; if (x > 0 && y > 0 && x < W - 1 && y < Hh - 1) g[y * W + x] = 0; }
  // pseudo-rooms for spawning: spaced floor samples
  const rooms = [];
  for (let t = 0; t < 400 && rooms.length < size * 3; t++) {
    const x = rng.int(2, W - 3), y = rng.int(2, Hh - 3);
    if (g[y * W + x]) continue;
    if (rooms.some((r) => Math.hypot(r.cx - x, r.cy - y) < 7)) continue;
    rooms.push({ cx: x, cy: y, x: x - 2, y: y - 2, w: 4, h: 4, real: true });
  }
  return { W, H: Hh, grid: g, rooms, entrance: { ...ent, x: ent.cx - 2, y: ent.cy - 2, w: 5, h: 5, real: true } };
}

function genMaze(rng, size) {
  const N = size + 4; // cells per side
  const W = N * 3 + 1, Hh = N * 3 + 1;
  const g = new Uint8Array(W * Hh).fill(1);
  carveMaze(g, W, N, rng);
  const arena = { x: W - 13, y: Hh - 13, w: 11, h: 11 };
  for (let j = arena.y; j < arena.y + arena.h; j++) for (let i = arena.x; i < arena.x + arena.w; i++) g[j * W + i] = 0;
  const ent = { x: 1, y: 1, w: 5, h: 5, cx: 3, cy: 3, real: true };
  for (let j = 1; j < 6; j++) for (let i = 1; i < 6; i++) g[j * W + i] = 0;
  const rooms = [];
  for (let k = 0; k < size * 3; k++) { const cx = rng.int(1, N - 2) * 3 + 2, cy = rng.int(1, N - 2) * 3 + 2; rooms.push({ cx, cy, x: cx - 1, y: cy - 1, w: 2, h: 2, real: true }); }
  rooms.push({ cx: arena.x + 5, cy: arena.y + 5, ...arena, real: true, arena: true });
  return { W, H: Hh, grid: g, rooms, entrance: ent, maze: { N, arena } };
}

function carveMaze(g, W, N, rng) {
  // walls everywhere except cells; carve passages (2-wide cells, 1-wide walls)
  for (let cy = 0; cy < N; cy++) for (let cx = 0; cx < N; cx++) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) g[(cy * 3 + 1 + j) * W + cx * 3 + 1 + i] = 0;
  const seen = new Uint8Array(N * N);
  const stack = [[0, 0]]; seen[0] = 1;
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [cx + dx, cy + dy, dx, dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < N && y < N && !seen[y * N + x]);
    if (!nb.length) { stack.pop(); continue; }
    const [nx, ny, dx, dy] = nb[rng.int(0, nb.length - 1)];
    seen[ny * N + nx] = 1;
    // knock down the wall between
    if (dx) { const wx = (dx > 0 ? cx * 3 + 3 : cx * 3); for (let j = 0; j < 2; j++) g[(cy * 3 + 1 + j) * W + wx] = 0; }
    else { const wy = (dy > 0 ? cy * 3 + 3 : cy * 3); for (let i = 0; i < 2; i++) g[wy * W + cx * 3 + 1 + i] = 0; }
    stack.push([nx, ny]);
  }
  // a few loops so it is less punishing
  for (let k = 0; k < N; k++) { const x = rng.int(1, N - 2) * 3 + (rng.chance(0.5) ? 0 : 3), y = rng.int(0, N - 1) * 3 + 1; if (x > 0 && x < W - 1) { g[y * W + x] = 0; g[(y + 1) * W + x] = 0; } }
}

// ------------------------------------------------------------------- dungeon props
// dungeon props -> sprites (world scatter sprites where they exist, dungeon dressing otherwise)
const PROP_MAP = { glass_crystal: 'glass_shard', ice_crystal: 'ice_crystal', mushroom: 'mushroom_giant', void_crystal: 'void_crystal', rock: 'deep_rock', coral: 'coral', kelp: 'sea_grass', root: 'fallen_log', giant_bone: 'rib_bones', statue: 'statue_frag', pillar: 'column' };
function dpropFor(type, rng) {
  if (type === 'banner') { const c = rng.pick([RAMPS.red[3], RAMPS.slate[2], RAMPS.lavender[2]]); return { frames: [bannerSprite(c, 3.6, 0), bannerSprite(c, 3.6, 1)] }; }
  if (type === 'brazier') { const b = brazierSprite(1); return { spr: b, fire: -b.fireAt[1] }; }
  const own = dpropSprite(type, rng.int(0, 3));
  if (own) return { spr: own, fire: own.fireAt ? -own.fireAt[1] : 0 };
  const id = PROP_MAP[type] || 'rock';
  const ps = propSprite(id, rng.int(0, 2), type === 'mushroom' ? 1 : 0.9);
  return { frames: ps.frames.map((f) => ({ pix: f, emis: ps.emis || null })) };
}

// ------------------------------------------------------------------- enter / exit
// seed: co-op guests build the host's layout
export function enterDungeon(def, returnPos, seed) {
  const theme = DUNGEON_THEMES[def.theme];
  seed ??= hashStr(def.id) + (G.char.cleared[def.id] ? G.char.deaths + G.char.day : 0);
  const rng = new RNG(seed);
  const size = { small: 4, medium: 5, large: 7 }[def.size] || 5;
  const lay = theme.layout === 'cave' ? genCave(rng, size) : theme.layout === 'maze' ? genMaze(rng, size - 1) : genRooms(rng, size);
  const tile = theme.layout === 'maze' ? 3.2 : 3.6;
  clearCombat();
  clearSpawns(false);
  setTerrainVisible(false);
  const d = {
    def, theme, tile, w: lay.W, h: lay.H, grid: lay.grid, ox: OX, oz: OZ, floorY: 0, rooms: lay.rooms, entrance: lay.entrance, maze: lay.maze,
    objs: [], lights: [], chests: [], flow: new Int16Array(lay.W * lay.H).fill(-1), flowTile: -1,
    returnPos: returnPos.clone(), returnRealm: G.realm, bossDead: !!G.char.cleared[def.id] && false, shiftT: 26, rng, seed, fires: [],
  };
  G.dungeon = d;
  G.realm = 'dungeon';
  d.prevGround = scene.ground;
  scene.ground = (ctx) => drawFloor(d, ctx);
  chooseBoss(d);
  buildGeometry(d);
  populate(d, rng);
  atmo.indoor = true;
  atmo.indoorCfg = { fog: theme.fog, ambient: theme.ambient || '#c8b4a4', light: theme.light };
  const ent = lay.entrance;
  const ex = OX + (ent.cx + 0.5) * tile, ez = OZ + (ent.cy + 0.5) * tile;
  G.player.pos.set(ex, 0, ez);
  d.exit = { x: ex - tile * 0.8, z: ez - tile * 0.8 };
  G.interactables.push({ site: 'dungeon', kind: 'exit', x: d.exit.x, z: d.exit.z, r: 2.5, label: `Leave ${def.name}` });
  exitPortal(d, d.exit.x, d.exit.z, theme.light);
  bus.emit('dungeonEnter', d);
  return d;
}

export function exitDungeon() {
  const d = G.dungeon;
  if (!d) return;
  for (const o of d.objs) removeObject(o);
  scene.ground = d.prevGround;
  clearCombat();
  clearSpawns(false);
  G.interactables = G.interactables.filter((i) => i.site !== 'dungeon');
  G.realm = d.returnRealm;
  G.dungeon = null;
  atmo.indoor = false;
  setTerrainVisible(true);
  G.player.pos.copy(d.returnPos);
  bus.emit('dungeonExit', d);
}

// ------------------------------------------------------------------- build
const T_PX = (d) => Math.round(d.tile * PPU);
const WALL_PX = ap(26);       // visible height of a wall face (2.6 world units)
function addObj(d, o) { d.objs.push(o); addObject(o); return o; }

// floor: pre-rendered chunk canvases of tiles (drawn as the ground layer)
function drawFloor(d, ctx) {
  const T = T_PX(d), CH = 8;
  const ox = d.ox * PPU - view.x0, oy = d.oz * PPU - view.y0;
  const c0 = Math.max(0, Math.floor(-ox / (T * CH))), c1 = Math.min(Math.ceil(d.w / CH) - 1, Math.floor((view.W - ox) / (T * CH)));
  const r0 = Math.max(0, Math.floor((-oy - WALL_PX) / (T * CH))), r1 = Math.min(Math.ceil(d.h / CH) - 1, Math.floor((view.H - oy + WALL_PX) / (T * CH)));
  for (let cj = r0; cj <= r1; cj++) for (let ci = c0; ci <= c1; ci++) {
    const key = ci + ',' + cj;
    let cv = d.floorChunks.get(key);
    if (!cv) { cv = bakeFloorChunk(d, ci, cj, CH, T); d.floorChunks.set(key, cv); }
    ctx.drawImage(cv, Math.round(ox + ci * CH * T), Math.round(oy + cj * CH * T));
  }
}
// smooth value noise over tile coordinates (cells of 3 tiles), for floor clusters
function tileNoise(ti, tj, s) {
  const fx = ti / 3, fy = tj / 3, ix = Math.floor(fx), iy = Math.floor(fy);
  let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), e = hash2(ix + 1, iy + 1, s);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + e) * tx * ty;
}
function bakeFloorChunk(d, ci, cj, CH, T) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = CH * T;
  const g = cv.getContext('2d');
  const tiles = d.tiles;
  for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) {
    const ti = ci * CH + i, tj = cj * CH + j;
    if (ti >= d.w || tj >= d.h) continue;
    if (d.grid[tj * d.w + ti] === 1 && !d.maze) { g.fillStyle = VOID; g.fillRect(i * T, j * T, T, T); continue; }
    const h = ((ti * 73856093) ^ (tj * 19349663)) >>> 0;
    // big clusters of darker slabs and worn patches give the room its value structure
    const n = tileNoise(ti, tj, d.def.id.length);
    const set = n < 0.36 && tiles.floorDark ? tiles.floorDark : n > 0.7 && tiles.floorWorn ? tiles.floorWorn : tiles.floor;
    g.drawImage(set[h % 11 < 7 ? h % 3 : 3 + (h % 3)].canvas(), i * T, j * T);
    // flat plum shadow bands where a wall stands to the north or west (the maze's walls move, so
    // its floor stays unshaded)
    if (!d.maze) {
      const wall = (x, y) => x < 0 || y < 0 || x >= d.w || y >= d.h || d.grid[y * d.w + x] === 1;
      const n = wall(ti, tj - 1), wv = wall(ti - 1, tj), s1 = ap(3), s2 = ap(2);
      if (n) { g.fillStyle = WALL_SHADOW; g.fillRect(i * T, j * T, T, s1); g.fillStyle = WALL_SHADOW2; g.fillRect(i * T, j * T + s1, T, s2); }
      if (wv) { g.fillStyle = WALL_SHADOW; g.fillRect(i * T, j * T + (n ? s1 : 0), s2, T - (n ? s1 : 0)); g.fillStyle = WALL_SHADOW2; g.fillRect(i * T + s2, j * T + (n ? s1 + s2 : 0), s2, T - (n ? s1 + s2 : 0)); }
    }
  }
  return cv;
}

function buildGeometry(d) {
  const { w, h, grid, tile, theme } = d;
  const T = T_PX(d);
  d.tiles = dungeonTiles(theme, T, WALL_PX);
  d.floorChunks = new Map();
  // wall tiles that touch floor (maze: every lattice cell can become a wall)
  const wallTiles = [];
  d.wallIndex = new Int32Array(w * h).fill(-1);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    let use = false;
    if (d.maze) use = i === 0 || j === 0 || i === w - 1 || j === h - 1 || grid[j * w + i] === 1 || i % 3 === 0 || j % 3 === 0;
    else if (grid[j * w + i] === 1) {
      for (let dj = -1; dj <= 1 && !use; dj++) for (let di = -1; di <= 1; di++) { const x = i + di, y = j + dj; if (x >= 0 && y >= 0 && x < w && y < h && grid[y * w + x] === 0) { use = true; break; } }
    }
    if (use) { d.wallIndex[j * w + i] = wallTiles.length; wallTiles.push([i, j]); }
  }
  d.walls = { tiles: wallTiles, anim: new Float32Array(wallTiles.length).fill(1), target: new Float32Array(wallTiles.length).fill(1) };
  if (d.maze) refreshMazeWalls(d, true);
  // one y-sorted drawable per wall row
  for (let j = 0; j < h; j++) {
    const row = wallTiles.filter(([, jj]) => jj === j).map(([i]) => i);
    if (!row.length) continue;
    addObj(d, { sortZ: OZ + (j + 1) * tile - 0.01, draw: (ctx) => drawWallRow(d, ctx, j, row) });
  }
  // torches on south-facing wall faces (other faces just light the room)
  const rng = new RNG(7 + w);
  for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
    if (grid[j * w + i] !== 1 || d.maze) continue;
    for (const [di, dj] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
      if (grid[(j + dj) * w + i + di] !== 0) continue;
      if (((i * 7 + j * 13) % 7) !== 0) continue;
      const x = OX + (i + 0.5 + di * 0.55) * tile, z = OZ + (j + 0.5 + dj * 0.55) * tile;
      d.lights.push({ x: x + di * 0.4, y: 3.2, z: z + dj * 0.4, color: theme.light });
      if (dj === 1) {
        const tx = OX + (i + 0.5) * tile, tz = OZ + (j + 1) * tile;
        addObj(d, torchObj(tx, tz, theme.light));
        d.fires.push({ x: tx, y: 1.9, z: tz });
      }
      break;
    }
  }
  if (d.maze) {
    for (let cy = 0; cy < d.maze.N; cy += 2) for (let cx = (cy / 2) % 2; cx < d.maze.N; cx += 2) {
      const x = OX + (cx * 3 + 2) * tile, z = OZ + (cy * 3 + 2) * tile;
      addObj(d, glowBulb(x, z, theme.light));
      d.lights.push({ x, y: 1.5, z, color: theme.light, weak: true });
    }
  }
  // room dressing
  for (const room of d.rooms) {
    if (!room.real) continue;
    const n = rng.int(1, 4);
    for (let k = 0; k < n; k++) {
      const type = rng.pick(theme.props);
      const side = rng.int(0, 3);
      const px = room.x + (side === 0 ? 0.6 : side === 1 ? room.w - 0.6 : rng.f() * room.w);
      const pz = room.y + (side === 2 ? 0.6 : side === 3 ? room.h - 0.6 : rng.f() * room.h);
      const x = OX + px * tile, z = OZ + pz * tile;
      if (d.grid[Math.floor(pz) * w + Math.floor(px)] !== 0) continue;
      const pr = dpropFor(type, rng);
      addObj(d, spriteObj(x, z, pr.spr, pr.frames));
      if (pr.fire) addObj(d, flameObj(x, z, pr.fire / PPU, type === 'brazier' ? 1 : 1.2, theme.light));
      if (type === 'brazier' || type === 'campfire') { d.lights.push({ x, y: 1.8, z, color: theme.light }); d.fires.push({ x, y: 1.4, z }); }
      if (type === 'glass_crystal' || type === 'void_crystal' || type === 'ice_crystal' || type === 'mushroom') d.lights.push({ x, y: 2, z, color: theme.accent, weak: true });
    }
  }
  d.motes = 0;
}

function drawWallRow(d, ctx, j, row) {
  const T = T_PX(d), { tiles, walls, w, grid } = d;
  const ox = Math.round(d.ox * PPU - view.x0), oy = Math.round(d.oz * PPU - view.y0);
  const yBase = oy + (j + 1) * T;
  if (yBase < -4 || yBase - T - WALL_PX > view.H + 4) return;
  // flag the x-ray outline when the player stands just behind this row
  const f = R.focus;
  const fx = f ? Math.round(f.x * PPU - view.x0) : -9999, fz = f ? f.z : 1e9;
  const behind = f && fz < OZ + (j + 1) * d.tile - 0.05 && fz > OZ + (j - 2.2) * d.tile;
  const topCv = tiles.top.canvas(), frontCv = tiles.front.canvas();
  for (const i of row) {
    const x = ox + i * T;
    if (x > view.W + 2 || x + T < -2) continue;
    const k = d.wallIndex[j * w + i];
    const s = walls.anim[k];
    if (s < 0.02) continue;
    const wp = Math.round(WALL_PX * s);
    const southOpen = j + 1 >= d.h || grid[(j + 1) * w + i] !== 1 || walls.anim[d.wallIndex[(j + 1) * w + i]] < 0.5;
    if (behind && Math.abs(x + T / 2 - fx) < T * 1.2) R.xrayHint = true;
    // top cap sits a wall-height above its tile; the face shows only toward open floor
    ctx.drawImage(topCv, x, yBase - T - wp);
    if (southOpen) { ctx.drawImage(frontCv, 0, WALL_PX - wp, T, wp, x, yBase - wp, T, wp); }
    // ink rim where the cap meets an open neighbour (the wall silhouette's outline)
    ctx.fillStyle = INK;
    if (i > 0 && grid[j * w + i - 1] !== 1) ctx.fillRect(x, yBase - T - wp, 1, T);
    if (i < w - 1 && grid[j * w + i + 1] !== 1) ctx.fillRect(x + T - 1, yBase - T - wp, 1, T);
    if (j > 0 && grid[(j - 1) * w + i] !== 1) ctx.fillRect(x, yBase - T - wp, T, 1);
  }
}

const now = () => performance.now() / 1000;
function spriteObj(x, z, spr, frames) {
  const first = spr || frames[0];
  return {
    sortZ: z, hidden: false,
    cur() { if (!frames) return spr; const n = frames.length; return frames[((Math.floor(now() * 2.5 + x) % n) + n) % n]; },
    shadow(ctx) {
      const w = Math.max(ap(3), Math.round(first.pix.w * 0.3)), k = Math.max(1, Math.round(w * 0.2)), px = Math.round(x * PPU - view.x0), py = Math.round(z * PPU - view.y0);
      ctx.fillStyle = SHADOW_FILL; ctx.fillRect(px - w + k, py - 2, w * 2 + 1 - k * 2, 1); ctx.fillRect(px - w, py - 1, w * 2 + 1, 3); ctx.fillRect(px - w + k, py + 2, w * 2 + 1 - k * 2, 1);
    },
    draw(ctx) { const s = this.cur(); ctx.drawImage(s.pix.canvas(), Math.round(x * PPU - view.x0) - s.pix.ox, Math.round(z * PPU - view.y0) - s.pix.oy); },
    emissive(ctx) { const s = this.cur(); if (s.emis) ctx.drawImage(s.emis.canvas(), Math.round(x * PPU - view.x0) - s.emis.ox, Math.round(z * PPU - view.y0) - s.emis.oy); },
  };
}
// a crisp flickering flame (emissive pixels) with a soft glow; sizes in design pixels x ART.
// Stepped bands: deep edge, body, hot inner band, pale core (ember ramp for warm colours).
function flameObj(x, z, h, big, color) {
  const [edge, body, hot, core] = flamePalette(color);
  const s = big * ART;
  return {
    sortZ: z + 0.02, draw() {},
    emissive(ctx) {
      const px = Math.round(x * PPU - view.x0), py = Math.round(z * PPU - view.y0 - h * PPU);
      const t = now() * 9 + x;
      const hgt = Math.round((4 + Math.sin(t) * 1.2 + Math.sin(t * 2.7) * 0.8) * s);
      for (let k = 0; k < hgt; k++) {
        const w = Math.max(0, Math.round((1 - k / hgt) * 2.4 * s));
        const sway = Math.round(Math.sin(t * 0.7 + k * 0.6) * (k / hgt) * 1.3 * ART);
        for (let i = -w; i <= w; i++) { const a = Math.abs(i); ctx.fillStyle = a === w ? edge : a < w * 0.4 && k < hgt * 0.45 ? core : a < w * 0.7 && k < hgt * 0.7 ? hot : body; ctx.fillRect(px + i + sway, py - k, 1, 1); }
      }
    },
    glow(ctx) { glowPx(ctx, x * PPU - view.x0, z * PPU - view.y0 - h * PPU - 3 * s, color, 10 * s, 0.45); },
  };
}
// a sprite pinned to a world point (its pivot), with optional emissive
function pinned(spr, x, z) {
  return {
    draw(ctx) { ctx.drawImage(spr.pix.canvas(), Math.round(x * PPU - view.x0) - spr.pix.ox, Math.round(z * PPU - view.y0) - spr.pix.oy); },
    emissive(ctx) { if (spr.emis) ctx.drawImage(spr.emis.canvas(), Math.round(x * PPU - view.x0) - spr.emis.ox, Math.round(z * PPU - view.y0) - spr.emis.oy); },
  };
}
function torchObj(x, z, color) {
  const o = flameObj(x, z, 1.9, 0.9, color);
  const flame = o.emissive, sc = pinned(torchSprite(), x, z);
  o.sortZ = z + 0.03;
  o.draw = sc.draw;
  o.emissive = (ctx) => { sc.emissive(ctx); flame(ctx); };
  return o;
}
function glowBulb(x, z, color) {
  const sp = pinned(bulbSprite(color), x, z);
  return { sortZ: z, draw: sp.draw, emissive: sp.emissive, glow(ctx) { glowPx(ctx, x * PPU - view.x0, z * PPU - view.y0 - ap(8), color, ap(9), 0.5); } };
}

function refreshMazeWalls(d, instant) {
  const { w, grid } = d;
  d.walls.tiles.forEach(([i, j], k) => {
    d.walls.target[k] = grid[j * w + i] === 1 ? 1 : 0;
    if (instant) d.walls.anim[k] = d.walls.target[k];
  });
}

// swirling exit portal: crisp orbiting pixels in a ring, a breathing core, soft glow
function exitPortal(d, x, z, color) {
  const c = C(color);
  addObj(d, {
    sortZ: z, draw() {},
    emissive(ctx) {
      const lift = ap(16), R = ap(13), rx = ap(11), ry = ap(13);
      const px = Math.round(x * PPU - view.x0), py = Math.round(z * PPU - view.y0) - lift, t = now();
      const body = `rgb(${c[0]},${c[1]},${c[2]})`, dim = `rgb(${Math.round(c[0] * 0.6)},${Math.round(c[1] * 0.6)},${Math.round(c[2] * 0.7)})`;
      // orbiting sparks, each with a short trailing pixel
      for (let k = 0; k < 44; k++) {
        const a = (k / 44) * Math.PI * 2 + t * 2.2, r = R + Math.sin(t * 3 + k) * ap(1.2);
        const sx = Math.round(px + Math.cos(a) * r), sy = Math.round(py + Math.sin(a) * r * 1.15);
        ctx.fillStyle = dim; ctx.fillRect(Math.round(px + Math.cos(a - 0.12) * r), Math.round(py + Math.sin(a - 0.12) * r * 1.15), 1, 1);
        ctx.fillStyle = k % 3 ? body : RAMPS.aether[6]; ctx.fillRect(sx, sy, 2, 2);
      }
      // dithered breathing core
      const a = 0.35 + Math.sin(t * 3) * 0.15;
      ctx.fillStyle = body;
      for (let yy = -ry; yy <= ry; yy++) for (let xx = -rx; xx <= rx; xx++) { const d = (xx * xx) / (rx * rx) + (yy * yy) / (ry * ry); if (d > 1) continue; if (bayer(px + xx + Math.floor(t * 8), py + yy) > a + (1 - d) * 0.25) continue; ctx.fillRect(px + xx, py + yy, 1, 1); }
    },
    glow(ctx) { glowPx(ctx, x * PPU - view.x0, z * PPU - view.y0 - ap(16), color, ap(26), 0.55); },
  });
  d.lights.push({ x, y: 2, z, color, strong: true });
}

// ------------------------------------------------------------------- populate
function tileCenter(d, cx, cy) { return { x: OX + (cx + 0.5) * d.tile, z: OZ + (cy + 0.5) * d.tile }; }

function chooseBoss(d) {
  // boss room = farthest room from entrance by BFS
  const dist = bfs(d, d.entrance.cx, d.entrance.cy);
  let boss = null, bd = -1;
  for (const r of d.rooms) { const v = dist[r.cy * d.w + r.cx]; if (r.arena) { boss = r; break; } if (v > bd) { bd = v; boss = r; } }
  if (!d.maze && boss) {
    // widen the boss room into an arena
    for (let j = boss.cy - 4; j <= boss.cy + 4; j++) for (let i = boss.cx - 4; i <= boss.cx + 4; i++) if (i > 0 && j > 0 && i < d.w - 1 && j < d.h - 1 && Math.hypot(i - boss.cx, j - boss.cy) < 4.6) d.grid[j * d.w + i] = 0;
  }
  d.bossRoom = boss;
}

function populate(d, rng) {
  const def = d.def, theme = d.theme;
  const pool = def.denOf || (theme.enemies.length ? theme.enemies : ['bandit']);
  const boss = d.bossRoom;
  // enemy packs (capped by dungeon size so big dungeons stay fun and fast)
  const cap = { small: 22, medium: 36, large: 54 }[def.size] || 30;
  let spawned = 0;
  const order = rng.shuffle([...d.rooms]);
  for (const r of order) {
    if (spawned >= cap) break;
    if (r === boss || r === d.entrance || !r.real) continue;
    if (Math.hypot(r.cx - d.entrance.cx, r.cy - d.entrance.cy) < 6) continue;
    const n = d.maze ? rng.int(1, 2) : rng.int(2, 4) + (def.size === 'large' ? 1 : 0);
    const elite = rng.chance(0.18);
    for (let k = 0; k < n; k++) {
      const tx = r.cx + rng.int(-1, 1), ty = r.cy + rng.int(-1, 1);
      if (d.grid[ty * d.w + tx] !== 0) continue;
      const p = tileCenter(d, tx, ty);
      spawnEnemy(rng.pick(pool), def.level + rng.int(-1, 1), p.x, p.z, { dungeon: def.id, elite: elite && k === 0, leash: 999, aggroR: 14 });
      spawned++;
    }
  }
  // boss
  if (boss) {
    const p = tileCenter(d, boss.cx, boss.cy);
    const b = spawnEnemy(def.boss, def.level + (def.final ? 2 : 1), p.x, p.z, { dungeon: def.id, leash: 999, aggroR: 18 });
    if (b) {
      b.dungeonBoss = true;
      d.boss = b;
      b.onKilled = () => onBossDead(d, b);
    }
  }
  // chests
  const chestRooms = d.rooms.filter((r) => r.real && r !== d.entrance && r !== boss);
  const nChests = { small: 1, medium: 2, large: 3 }[def.size] || 1;
  for (let k = 0; k < nChests && chestRooms.length; k++) {
    const r = chestRooms.splice(rng.int(0, chestRooms.length - 1), 1)[0];
    const p = tileCenter(d, r.cx, r.cy);
    placeChest(d, p.x, p.z, { level: def.level, rarityBoost: 0.4 });
  }
}

function bfs(d, sx, sy) {
  const dist = new Int16Array(d.w * d.h).fill(-1);
  const q = [sy * d.w + sx]; dist[q[0]] = 0;
  let head = 0;
  while (head < q.length) {
    const c = q[head++];
    const x = c % d.w, y = (c / d.w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= d.w || ny >= d.h) continue;
      const k = ny * d.w + nx;
      if (d.grid[k] !== 0 || dist[k] >= 0) continue;
      dist[k] = dist[c] + 1;
      q.push(k);
    }
  }
  return dist;
}

export function placeChest(d, x, z, o) {
  const chest = { x, z, opened: false, ...o };
  addObj(d, {
    sortZ: z, hidden: false,
    shadow(ctx) { const px = Math.round(x * PPU - view.x0), py = Math.round(z * PPU - view.y0), w = ap(7); ctx.fillStyle = SHADOW_FILL; ctx.fillRect(px - w, py - 1, w * 2 + 1, 3); ctx.fillRect(px - w + 2, py + 2, w * 2 - 3, 1); },
    draw(ctx) { const s = chestSprite(chest.opened, !!o.boss); ctx.drawImage(s.pix.canvas(), Math.round(x * PPU - view.x0) - s.pix.ox, Math.round(z * PPU - view.y0) - s.pix.oy); },
    emissive(ctx) { const s = chestSprite(chest.opened, !!o.boss); if (s.emis) ctx.drawImage(s.emis.canvas(), Math.round(x * PPU - view.x0) - s.emis.ox, Math.round(z * PPU - view.y0) - s.emis.oy); },
    glow(ctx) { if (o.boss || !chest.opened) glowPx(ctx, x * PPU - view.x0, z * PPU - view.y0 - ap(8), o.boss ? RAMPS.aether[4] : RAMPS.gold[4], o.boss ? ap(14) : ap(8), chest.opened ? 0.2 : 0.3 + Math.sin(now() * 3) * 0.1); },
  });
  d.chests.push(chest);
  G.interactables.push({ site: 'dungeon', kind: 'chest', x, z, r: 2.2, label: o.boss ? 'Open the boss hoard' : 'Open chest', data: chest });
  return chest;
}

// co-op guests: the host's boss arrives as a mirrored enemy; it opens the hoard here too
export function adoptDungeonBoss(b) {
  const d = G.dungeon;
  if (!d || d.boss === b) return;
  d.boss = b;
  b.dungeonBoss = true;
  b.onKilled = () => onBossDead(d, b);
}

// co-op guests: the host moved the labyrinth's walls
export function applyMazeGrid(grid) {
  const d = G.dungeon;
  if (!d?.maze || grid.length !== d.grid.length) return;
  for (let i = 0; i < grid.length; i++) d.grid[i] = grid.charCodeAt(i) - 48;
  const p = G.player;
  const ex = Math.floor((p.pos.x - OX) / d.tile), ez = Math.floor((p.pos.z - OZ) / d.tile);
  if (ex > 0 && ez > 0 && ex < d.w - 1 && ez < d.h - 1) d.grid[ez * d.w + ex] = 0;
  refreshMazeWalls(d, false);
  d.flowTile = -1;
  d.shiftT = 28; d.warned = false;
  addShake(0.4);
  bus.emit('mazeShift');
}

function onBossDead(d, b) {
  if (d.bossDead) return;
  d.bossDead = true;
  const p = { x: b.pos.x, z: b.pos.z };
  setTimeout(() => {
    if (G.dungeon !== d) return;
    placeChest(d, p.x + 2, p.z + 2, { level: d.def.level + 2, boss: true, rarityBoost: 1.5, shard: d.def.shard, final: d.def.final });
    exitPortal(d, p.x - 3, p.z - 3, RAMPS.gold[5]);
    G.interactables.push({ site: 'dungeon', kind: 'exit', x: p.x - 3, z: p.z - 3, r: 2.5, label: `Leave ${d.def.name}` });
  }, 1800);
  bus.emit('dungeonCleared', { def: d.def, boss: b });
}

// ------------------------------------------------------------------- per-frame
export function updateDungeon(dt) {
  const d = G.dungeon;
  if (!d) return;
  const p = G.player;
  // flow field toward the player
  const tx = Math.floor((p.pos.x - OX) / d.tile), tz = Math.floor((p.pos.z - OZ) / d.tile);
  const t = tz * d.w + tx;
  if (t !== d.flowTile && tx >= 0 && tz >= 0 && tx < d.w && tz < d.h) { d.flowTile = t; d.flow = bfs(d, tx, tz); }
  // lights: nearest torches
  for (const L of d.lights) {
    const dd = (L.x - p.pos.x) ** 2 + (L.z - p.pos.z) ** 2;
    if (dd < 40 * 40) requestLight(L.x, L.y, L.z, L.color, (L.strong ? 22 : L.weak ? 14 : 38) * (0.85 + Math.sin(G.time * 11 + L.x) * 0.15), L.strong ? 14 : 18);
  }
  for (const f of d.fires) if (Math.random() < dt * 8 && (f.x - p.pos.x) ** 2 + (f.z - p.pos.z) ** 2 < 900) particle({ x: f.x, y: f.y, z: f.z, vx: (Math.random() - 0.5) * 0.4, vy: 1.5, vz: (Math.random() - 0.5) * 0.4, life: 0.5, size: 0.35, size1: 0.05, color: flamePalette(d.theme.light)[2], color2: d.theme.light, gravity: 1 });
  if (Math.random() < dt * 12) particle({ x: p.pos.x + (Math.random() - 0.5) * 30, y: Math.random() * 4, z: p.pos.z + (Math.random() - 0.5) * 30, vx: (Math.random() - 0.5) * 0.3, vy: 0.1, vz: (Math.random() - 0.5) * 0.3, life: 4, size: 0.12, color: d.theme.accent, intensity: 1.2, drag: 0 });
  // living labyrinth: the walls move
  if (d.maze) {
    // co-op guests wait for the host to move the walls (it warns at the same time)
    if (G.net?.role !== 'guest' || d.shiftT > 2) d.shiftT -= dt;
    if (d.shiftT < 3 && !d.warned) { d.warned = true; bus.emit('toast', 'The labyrinth groans. The walls are about to move...'); addShake(0.2); }
    if (d.shiftT <= 0) {
      d.shiftT = 28; d.warned = false;
      const keep = new Uint8Array(d.grid);
      const g = d.grid;
      g.fill(1);
      carveMaze(g, d.w, d.maze.N, d.rng);
      const a = d.maze.arena;
      for (let j = a.y; j < a.y + a.h; j++) for (let i = a.x; i < a.x + a.w; i++) g[j * d.w + i] = 0;
      for (let j = 1; j < 6; j++) for (let i = 1; i < 6; i++) g[j * d.w + i] = 0;
      // never wall in an entity: keep its tile open
      for (const e of [p, ...G.entities]) {
        const ex = Math.floor((e.pos.x - OX) / d.tile), ez = Math.floor((e.pos.z - OZ) / d.tile);
        if (ex > 0 && ez > 0 && ex < d.w - 1 && ez < d.h - 1) g[ez * d.w + ex] = 0;
      }
      refreshMazeWalls(d, false);
      d.flowTile = -1;
      addShake(0.4);
      bus.emit('mazeShift');
      G.net?.mazeShifted(d);
    }
    let changed = false;
    const W_ = d.walls;
    for (let k = 0; k < W_.anim.length; k++) {
      if (W_.anim[k] !== W_.target[k]) { W_.anim[k] += Math.sign(W_.target[k] - W_.anim[k]) * Math.min(Math.abs(W_.target[k] - W_.anim[k]), dt * 0.8); changed = true; }
    }
    if (changed) {
      if (Math.random() < dt * 20) burst(p.pos.x + rand(-12, 12), 0.2, p.pos.z + rand(-12, 12), { count: 4, speed: 2, color: '#6a5a4e', additive: false, life: 0.8, size: 0.6, gravity: 1 });
    }
  }
}
