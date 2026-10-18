// Towns, waystones, dungeon entrances, shrines, relics, realm gates and landmark set-pieces as
// pixel sprites. Sites stream in/out by distance; each site registers its drawables, colliders,
// lights and interactables, and drops them all when the player moves away.
import { G } from '../game.js';
import { R, requestLight, glowPx } from '../render/renderer.js';
import { RNG, hashStr } from '../core/rng.js';
import { TOWNS, DEEP_TOWNS, WAYSTONES, DUNGEONS, SHRINES, RELICS, LANDMARKS, REALM_GATES, DUNGEON_THEMES } from '../data/world.js';
import { heightAt } from './terrainGen.js';
import { addCollider, removeOwner } from '../systems/collision.js';
import { bus } from '../core/events.js';
import { atmo, isNight } from './atmosphere.js';
import { particle } from '../render/vfx.js';
import { addObject, removeObject } from '../px/scene.js';
import { view } from '../px/view.js';
import { PPU, ART, ap, C, bayer, hash2 } from '../px/pix.js';
import * as B from '../px/sprites/buildings.js';
import * as LM from '../px/sprites/landmarks.js';
import { propSprite } from '../px/sprites/props.js';
import { shieldSprite } from '../px/sprites/weapons.js';
import { castSprite } from '../px/shadow.js';

const BUILD_R = 240, DROP_R = 300;
export const sites = [];
const built = new Map();
let nightF = 0;

function H(x, z, realm) { return heightAt(x, z, realm); }
const now = () => performance.now() / 1000;

export function initStructures() {
  for (const t of TOWNS) sites.push({ kind: 'town', id: t.id, data: t, x: t.x, z: t.z, realm: 'surface' });
  for (const t of DEEP_TOWNS) sites.push({ kind: 'town', id: t.id, data: t, x: t.x, z: t.z, realm: 'deep' });
  for (const w of WAYSTONES) sites.push({ kind: 'waystone', id: w.id, data: w, x: w.x, z: w.z, realm: w.realm });
  for (const d of DUNGEONS) sites.push({ kind: 'dungeon', id: d.id, data: d, x: d.x, z: d.z, realm: d.realm || 'surface' });
  for (const s of SHRINES) sites.push({ kind: 'shrine', id: s.id, data: s, x: s.x, z: s.z, realm: s.realm });
  for (const r of RELICS) sites.push({ kind: 'relic', id: r.id, data: r, x: r.x, z: r.z, realm: 'surface' });
  for (const l of LANDMARKS) sites.push({ kind: 'landmark', id: l.id, data: l, x: l.x, z: l.z, realm: 'surface', big: true });
  for (const g of REALM_GATES) sites.push({ kind: 'gate', id: g.id, data: g, x: g.x, z: g.z, realm: g.realm });
}

// ---------------------------------------------------------------------------- update
let scanT = 0;
export function updateStructures(dt, px, pz, realm) {
  scanT -= dt;
  if (scanT <= 0) {
    scanT = 0.5;
    for (const s of sites) {
      const d = Math.hypot(s.x - px, s.z - pz);
      const has = built.has(s.id);
      const want = s.realm === realm && G.realm !== 'dungeon' && d < BUILD_R + (s.big ? 160 : 0);
      if (want && !has) buildSite(s);
      else if (has && (!want || d > DROP_R + (s.big ? 160 : 0))) dropSite(s);
    }
  }
  nightF = Math.max(0, Math.min(1, -Math.sin((atmo.timeOfDay - 0.25) * Math.PI * 2) * 3 + 0.4));
  if (G.realm === 'deep') nightF = 1;
  for (const b of built.values()) {
    if (b.update) b.update(dt, b);
    for (const L of b.lights) {
      const d2 = (L.x - px) ** 2 + (L.z - pz) ** 2;
      if (d2 < 60 * 60) requestLight(L.x, L.y, L.z, L.color, (L.i || 8) * (L.always ? 1 : 0.3 + nightF) * (0.9 + Math.sin(G.time * 9 + L.x) * 0.1), L.d || 12);
    }
  }
}

function dropSite(s) {
  const b = built.get(s.id);
  if (!b) return;
  for (const o of b.objs) removeObject(o);
  removeOwner('site:' + s.id);
  G.interactables = G.interactables.filter((i) => i.site !== s.id);
  bus.emit('siteDropped', s);
  built.delete(s.id);
}
export function rebuildAll() { for (const s of sites) if (built.has(s.id)) dropSite(s); scanT = 0; }
export function siteBuilt(id) { return built.get(id); }

function buildSite(s) {
  const b = { objs: [], lights: [], colliders: [], fires: [], updates: [], sx: s.x, sz: s.z, realm: s.realm };
  const fn = { town: buildTown, waystone: buildWaystone, dungeon: buildEntrance, shrine: buildShrine, relic: buildRelic, landmark: buildLandmark, gate: buildGate }[s.kind];
  fn(s, b);
  for (const c of b.colliders) addCollider('site:' + s.id, { ...c, x: s.x + c.x, z: s.z + c.z });
  for (const o of b.objs) addObject(o);
  const fires = b.fires;
  b.update = (dt) => {
    for (const f of fires) if (Math.random() < dt * (f.big ? 26 : 9)) {
      const sp = f.big || 1;
      particle({ x: f.x + (Math.random() - 0.5) * 0.4 * sp, y: f.y + 0.4, z: f.z + (Math.random() - 0.5) * 0.3 * sp, vx: (Math.random() - 0.5) * 0.6, vy: 2 + Math.random() * 2, vz: (Math.random() - 0.5) * 0.4, life: 0.7, size: 0.3 * Math.sqrt(sp), size1: 0.1, color: '#ffd080', color2: f.color, gravity: 1.5 });
    }
    for (const u of b.updates) u(dt);
  };
  built.set(s.id, b);
  bus.emit('siteBuilt', { site: s, build: b });
}

// ---------------------------------------------------------------------------- drawables
// spr = { pix, emis } (or o.frames: [spr...]); (wx, wz) is the world point under the sprite's pivot
function obj(b, spr, wx, wz, o = {}) {
  const ob = {
    sortZ: wz + (o.sortOff || 0), flat: !!o.flat, occlude: o.occlude ?? (spr.pix.h > ap(34) && !o.flat), hidden: false,
    cur() { if (!o.frames) return spr; const n = o.frames.length; return o.frames[((Math.floor(now() * (o.fps || 4) + (o.phase || 0)) % n) + n) % n]; },
    pos() { return [Math.round(wx * PPU - view.x0), Math.round(wz * PPU - view.y0 - (o.lift || 0) * PPU)]; },
    draw(ctx) {
      const s = this.cur(); const [x, y] = this.pos();
      if (x - s.pix.ox > view.W + 4 || x - s.pix.ox + s.pix.w < -4 || y - s.pix.oy > view.H + 4 || y - s.pix.oy + s.pix.h < -4) return;
      ctx.drawImage(s.pix.canvas(), x - s.pix.ox, y - s.pix.oy);
    },
    emissive(ctx) {
      const s = this.cur();
      if (!s.emis) return;
      const a = o.windows ? nightF : 1;
      if (a < 0.03) return;
      const [x, y] = this.pos();
      ctx.globalAlpha = a; ctx.drawImage(s.emis.canvas(), x - s.emis.ox, y - s.emis.oy); ctx.globalAlpha = 1;
    },
    bounds() { const s = this.cur(); const [x, y] = this.pos(); return { x: x - s.pix.ox, y: y - s.pix.oy, w: s.pix.w, h: s.pix.h }; },
  };
  // contact shadow: a flat pixel oval o.shadow px to each side of the pivot
  if (o.shadow) ob.shadow = (ctx) => { const [x, y] = ob.pos(); const w = o.shadow, k = Math.max(1, Math.round(w * 0.2)); ctx.fillStyle = 'rgba(10,6,12,0.28)'; ctx.fillRect(x - w + k, y - 2, w * 2 + 1 - k * 2, 1); ctx.fillRect(x - w, y - 1, w * 2 + 1, 3); ctx.fillRect(x - w + k, y + 2, w * 2 + 1 - k * 2, 1); };
  // directional cast shadow; houses cap the casting height so the roof's depth doesn't stretch it
  if (!o.flat && o.cast !== false && spr.pix.oy > ap(6)) {
    const cap = o.shadowCap || (spr.footprint ? Math.round(spr.pix.h * 0.58) : 0);
    const lift = Math.round((o.lift || 0) * PPU);
    ob.castShadow = (sctx) => { const [x, y] = ob.pos(); castSprite(sctx, ob.cur().pix, x, y + lift, { cap, h: lift }); };
  }
  if (o.glow) ob.glow = o.glow;
  if (o.extraEmissive) { const base = ob.emissive; ob.emissive = (ctx) => { base.call(ob, ctx); o.extraEmissive(ctx, ob.pos()); }; }
  b.objs.push(ob);
  return ob;
}
// site-relative helpers
const at = (b, spr, x, z, o) => obj(b, spr, b.sx + x, b.sz + z, o);
function prop(b, id, x, z, scale = 1, variant = 0, o = {}) {
  const sp = propSprite(id, variant, scale);
  const frames = sp.frames.map((f) => ({ pix: f, emis: sp.emis || null }));
  return at(b, frames[0], x, z, { frames: frames.length > 1 ? frames : null, fps: 2.5, phase: x * 0.37, shadow: Math.round(frames[0].pix.w * 0.3), ...o });
}
// crisp flickering flame (emissive pixels) + soft glow, for braziers and torches; sizes are in
// design pixels scaled by ART, drawn one art pixel at a time
function flame(b, wx, wz, h, big = 1, color = '#ff9030') {
  const c = C(color), edge = `rgb(${c[0]},${Math.round(c[1] * 0.6)},${Math.round(c[2] * 0.4)})`;
  const s = big * ART;
  const o = {
    sortZ: wz + 0.01, hidden: false, draw() {},
    emissive(ctx) {
      const x = Math.round(wx * PPU - view.x0), y = Math.round(wz * PPU - view.y0 - h * PPU);
      const t = now() * 9 + wx;
      const hgt = Math.round((4 + Math.sin(t) * 1.2 + Math.sin(t * 2.7) * 0.8) * s);
      for (let k = 0; k < hgt; k++) {
        const w = Math.max(0, Math.round((1 - k / hgt) * 2.6 * s - (k === 0 ? 0 : 0.3)));
        const sway = Math.round(Math.sin(t * 0.7 + k * 0.6) * (k / hgt) * 1.3 * ART);
        for (let i = -w; i <= w; i++) {
          const core = Math.abs(i) < w * 0.45 && k < hgt * 0.6;
          ctx.fillStyle = core ? '#fff0b0' : Math.abs(i) === w ? edge : color;
          ctx.fillRect(x + i + sway, y - k, 1, 1);
        }
      }
    },
    glow(ctx) { const x = wx * PPU - view.x0, y = wz * PPU - view.y0 - h * PPU; glowPx(ctx, x, y - 3 * s, color, 10 * s, 0.45 + Math.sin(now() * 13 + wx) * 0.05); },
  };
  b.objs.push(o);
  return o;
}
function brazier(b, x, z, color = '#ff9030', big = 1) {
  const spr = B.brazierSprite(big);
  at(b, spr, x, z, { shadow: ap(4 * big) });
  const y = H(b.sx + x, b.sz + z, b.realm);
  flame(b, b.sx + x, b.sz + z, (-spr.fireAt[1] + 1) / PPU, big, color);
  b.lights.push({ x: b.sx + x, y: y + 2.2, z: b.sz + z, color, i: 14, d: 16, always: G.realm !== 'surface' });
  b.fires.push({ x: b.sx + x, y: y + 1.0 * big, z: b.sz + z, color, big: big > 1.5 ? big : 0 });
  b.colliders.push({ x, z, r: 0.5 * big });
}

// ============================================================================ TOWNS
function buildTown(s, b) {
  const t = s.data;
  const rng = new RNG(hashStr(t.id));
  const style = t.style, biome = t.biome, realm = s.realm;
  const n = Math.round(t.r * 0.42);
  const placed = [];
  const S = B.STYLE[style];
  const snow = biome === 'frost';
  // plaza centrepiece
  // fountains: the pivot is the basin's front foot, so place it to keep the rim centre on the plaza
  const basinZ = (spr, c) => -spr.basinAt[1] / PPU + c;
  if (t.id === 'emberwell') {
    const fs = B.fountainSprite(3.6, '#8a5a3a', 0);
    at(b, fs, 0, basinZ(fs, -0.32), { sortOff: 0 });
    flame(b, s.x, s.z, 0.8, 2.6, '#ffa030');
    b.lights.push({ x: s.x, y: H(s.x, s.z, realm) + 3, z: s.z, color: '#ff9030', i: 22, d: 20, always: true });
    b.fires.push({ x: s.x, y: H(s.x, s.z, realm) + 1.3, z: s.z, color: '#ffa030', big: 2 });
    b.colliders.push({ x: 0, z: 0, r: 3.6 });
  } else if (style === 'marble' || style === 'desert') {
    const stone = style === 'marble' ? '#e0d8c4' : '#b08060';
    const fs = B.fountainSprite(3, stone, 0);
    at(b, fs, 0, basinZ(fs, -0.25), { frames: [0, 1, 2, 3].map((f) => B.fountainSprite(3, stone, f)), fps: 5 });
    b.colliders.push({ x: 0, z: 0, r: 3.3 });
  } else if (style === 'camp' || style === 'stone') {
    brazier(b, 0, 0, style === 'camp' ? '#ffa040' : realm === 'deep' ? '#60d0ff' : '#ff9030', 2.2);
  } else if (style === 'wood') {
    if (t.id === 'mirewisp') prop(b, 'mushroom_giant', 0, 0, 1.35);
    else prop(b, 'oak_big', 0, 0, 1.35);
    b.colliders.push({ x: 0, z: 0, r: 2 });
  } else if (style === 'port') brazier(b, 0, 0, '#ffb060', 1.4);
  // houses
  let tries = 0;
  while (placed.length < n && tries++ < 300) {
    const a = rng.f() * Math.PI * 2;
    const r = t.r * (0.42 + rng.f() * 0.5);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const sc = t.r > 38 ? 1.2 : 1;
    if (placed.some((p) => Math.hypot(p[0] - x, p[1] - z) < 8.5 * sc)) continue;
    const roadA = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    if (roadA.some((ra) => Math.abs(Math.atan2(Math.sin(a - ra), Math.cos(a - ra))) < 0.16)) continue;
    placed.push([x, z]);
    const mush = style === 'wood' && t.id === 'mirewisp' && rng.chance(0.5);
    const w = (4 + rng.f() * 3) * sc, d = (4 + rng.f() * 2.5) * sc, h = (3 + rng.f() * 2.2) * sc;
    const spr = B.houseSprite(mush ? 'mushroom' : style, w, d, h, Math.floor(rng.f() * 1e4), { snow });
    at(b, spr, x, z + d / 2, { windows: true });
    if (spr.chimney && rng.chance(0.6)) {
      const cxw = s.x + x + spr.chimney[0] / PPU, czw = s.z + z + d / 2;
      const chH = -spr.chimney[1] / PPU;
      b.updates.push((dt) => { if (Math.random() < dt * 3) particle({ x: cxw, y: H(cxw, czw, realm) + chH, z: czw, vx: 0.4 + Math.random() * 0.3, vy: 1.2, vz: -0.1, life: 2.2, size: 0.5, size1: 1.0, color: '#8a8480', color2: '#5a5654', alpha: 0.6, additive: false, gravity: 0.2, drag: 0.6 }); });
    }
    b.colliders.push(style === 'camp' || mush ? { x, z, r: Math.max(w, d) * 0.5 } : { x, z, hw: w / 2 + 0.3, hd: d / 2 + 0.3, rot: 0 });
  }
  // market stalls around the plaza
  const stalls = Math.min(5, Math.max(2, Math.round(t.r / 9)));
  for (let i = 0; i < stalls; i++) {
    const a = (i / stalls) * Math.PI * 2 + 0.4;
    const r = t.r * 0.24 + 3;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    at(b, B.stallSprite(rng.pick(S.cloth), i), x, z + 0.7);
    b.colliders.push({ x, z, hw: 1.4, hd: 0.7, rot: 0 });
  }
  // braziers / lanterns
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.2;
    const r = t.r * 0.35;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (style === 'wood' || style === 'port') {
      const col = t.id === 'mirewisp' ? '#c0ff80' : '#ffc060';
      const spr = B.lampSprite(col);
      at(b, spr, x, z, { shadow: ap(2), windows: false, glow: (ctx) => { const px = (s.x + x) * PPU - view.x0, py = (s.z + z) * PPU - view.y0 + spr.lightAt[1]; glowPx(ctx, px, py, col, ap(9), 0.2 + nightF * 0.4); } });
      b.lights.push({ x: s.x + x, y: H(s.x + x, s.z + z, realm) + 3.5, z: s.z + z, color: col, i: 8, d: 12 });
      b.colliders.push({ x, z, r: 0.25 });
    } else brazier(b, x, z, style === 'stone' && realm === 'deep' ? '#60d0ff' : '#ff9030');
  }
  // faction banners
  if (t.faction) {
    const col = { sunward: '#e8c050', ashen: '#b02a20', tidebound: '#2a7a8a', choir: '#5a3a8a' }[t.faction];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4, r = t.r * 0.95;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      at(b, B.bannerSprite(col, 7, 0), x, z, { frames: [B.bannerSprite(col, 7, 0), B.bannerSprite(col, 7, 1)], fps: 2, phase: i, shadow: ap(2) });
      b.colliders.push({ x, z, r: 0.3 });
    }
  }
  // decoration
  const deco = { desert: 'palm', marble: 'cypress', wood: 'oak', stone: biome === 'frost' ? 'pine_snow' : 'deep_rock', camp: 'dead_pine', port: 'palm' }[style];
  for (let i = 0; i < 8; i++) {
    const a = rng.f() * Math.PI * 2, r = t.r * (0.7 + rng.f() * 0.4);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (placed.some((p) => Math.hypot(p[0] - x, p[1] - z) < 5)) continue;
    prop(b, realm === 'deep' ? 'crystal_blue' : deco, x, z, 0.9 + rng.f() * 0.4, i);
    b.colliders.push({ x, z, r: 0.6 });
  }
  if (style === 'port') buildPier(b, s, rng);
  if (t.id === 'sylvanhold') for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.7, r = t.r * 0.75; const x = Math.cos(a) * r, z = Math.sin(a) * r; prop(b, 'oak_big', x, z, 1.35, i); b.lights.push({ x: s.x + x + 3, y: H(s.x + x, s.z + z, realm) + 7, z: s.z + z, color: '#ffd080', i: 8, d: 12 }); b.colliders.push({ x, z, r: 2.4 }); }
  // town walls with gate towers (overlapping wall blocks follow the ring)
  if (t.r >= 34 && style !== 'camp' && style !== 'wood') {
    const R0 = t.r * 1.12;
    const gates = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
    const steps = Math.round((Math.PI * 2 * R0) / 1.5);
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      if (gates.some((ra) => Math.abs(Math.atan2(Math.sin(a - ra), Math.cos(a - ra))) < 0.2)) continue;
      const x = Math.cos(a) * R0, z = Math.sin(a) * R0;
      at(b, B.wallBlock(S.wall[1], 4.2, snow), x, z + 0.6, { occlude: true });
    }
    for (const ga of gates) for (const sd of [-1, 1]) {
      const a = ga + sd * 0.24;
      const x = Math.cos(a) * R0, z = Math.sin(a) * R0;
      at(b, B.towerSprite(1.4, 6.5, S.wall[0], S.roof[0], 0, style === 'desert'), x, z + 1.4, { windows: true, occlude: true });
      b.colliders.push({ x, z, hw: 1.5, hd: 1.5, rot: 0 });
    }
    // wall colliders as short chords
    const segs = 22;
    for (let i = 0; i < segs; i++) {
      const mid = ((i + 0.5) / segs) * Math.PI * 2;
      if (gates.some((ra) => Math.abs(Math.atan2(Math.sin(mid - ra), Math.cos(mid - ra))) < 0.2)) continue;
      const x = Math.cos(mid) * R0, z = Math.sin(mid) * R0;
      const len = 2 * R0 * Math.sin(Math.PI / segs) + 0.4;
      b.colliders.push({ x, z, hw: len / 2, hd: 0.7, rot: mid - Math.PI / 2 });
    }
  }
  bus.emit('townBuilt', { town: t, site: s, baseY: H(s.x, s.z, realm) });
}

function buildPier(b, s, rng) {
  const t = s.data;
  let best = 0, bestD = 1e9;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const h = H(s.x + Math.cos(a) * t.r * 1.3, s.z + Math.sin(a) * t.r * 1.3, 'surface');
    if (h < bestD) { bestD = h; best = a; }
  }
  const plank = B.pierSprite(ap(22), ap(22));
  for (let k = 0; k < 30; k += 2) {
    const r = t.r * 0.9 + k;
    at(b, plank, Math.cos(best) * r, Math.sin(best) * r + 1.1, { flat: true });
  }
  for (let i = 0; i < 2; i++) {
    const r = t.r + 12 + i * 10, side = i ? 1 : -1;
    const x = Math.cos(best) * r + Math.cos(best + Math.PI / 2) * side * 5, z = Math.sin(best) * r + Math.sin(best + Math.PI / 2) * side * 5;
    at(b, B.boatSprite('#5a3a24', '#e8e0d0'), x, z + 1, { occlude: true });
  }
  void rng;
}

// ============================================================================ WAYSTONE
function buildWaystone(s, b) {
  const active = G.char?.discovered.waystones.includes(s.id);
  const spr = B.waystoneSprite(active);
  const rc = active ? '#90c8ff' : '#707078';
  // rune circle on the ground (crisp dotted ring that slowly turns)
  b.objs.push({
    sortZ: -1e9, flat: true, draw(ctx) {}, emissive(ctx) {
      const cx = s.x * PPU - view.x0, cy = s.z * PPU - view.y0, t = now() * 0.25;
      ctx.fillStyle = rc; ctx.globalAlpha = active ? 0.9 : 0.35;
      const R1 = ap(22), R2 = ap(17), dash = ap(2);
      for (let k = 0; k < 64; k++) { const a = (k / 64) * Math.PI * 2 + t; if (k % 8 === 0) continue; ctx.fillRect(Math.round(cx + Math.cos(a) * R1), Math.round(cy + Math.sin(a) * R1), 1, 1); }
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 - t * 1.5; ctx.fillRect(Math.round(cx + Math.cos(a) * R2) - 1, Math.round(cy + Math.sin(a) * R2), dash, 1); }
      ctx.globalAlpha = 1;
    },
  });
  at(b, spr, 0, 0.4, { shadow: ap(8) });
  const cr = B.crystalSprite(active ? '#a0d8ff' : '#808890', ap(12));
  const bob = () => Math.round(Math.sin(now() * 1.5) * ap(2.5));
  at(b, cr, 0, 0.41, { lift: 0, extraEmissive: () => {} }).draw = function (ctx) {
    const x = Math.round(s.x * PPU - view.x0), y = Math.round((s.z + 0.4) * PPU - view.y0) + spr.crystalAt[1] + bob();
    ctx.drawImage(cr.pix.canvas(), x - cr.pix.ox, y - cr.pix.oy);
    if (active) this._g = [x, y - ap(6)];
  };
  b.objs[b.objs.length - 1].emissive = function (ctx) { if (!active) return; const x = Math.round(s.x * PPU - view.x0), y = Math.round((s.z + 0.4) * PPU - view.y0) + spr.crystalAt[1] + bob(); ctx.drawImage(cr.pix.canvas(), x - cr.pix.ox, y - cr.pix.oy); };
  b.objs[b.objs.length - 1].glow = function (ctx) { if (active && this._g) glowPx(ctx, this._g[0], this._g[1], '#90c8ff', ap(14), 0.5); };
  if (active) b.lights.push({ x: s.x, y: H(s.x, s.z, s.realm) + 6, z: s.z, color: '#90c8ff', i: 10, d: 14, always: true });
  b.colliders.push({ x: 0, z: 0, r: 0.9 });
  G.interactables.push({ site: s.id, kind: 'waystone', x: s.x, z: s.z, r: 3.5, label: active ? `Travel from ${s.data.name}` : `Attune to ${s.data.name}`, data: s.data, realm: s.realm });
}

// ============================================================================ DUNGEON ENTRANCES
function buildEntrance(s, b) {
  const d = s.data;
  const th = DUNGEON_THEMES[d.theme];
  const cleared = G.char?.cleared[d.id];
  const glowC = cleared ? '#e0c080' : th.light;
  const spr = B.entranceSprite(d.theme, d.biome, th.light);
  // sprite faces south; the doorway is at its front-centre
  const ob = at(b, spr, 0, 2.2, { occlude: true, extraEmissive: (ctx, [x, y]) => {
    // portal shimmer inside the doorway: dithered colour that breathes
    const [, dy, dw, dh] = spr.door;
    const t = now();
    const a = 0.45 + Math.sin(t * 2) * 0.15;
    ctx.fillStyle = glowC;
    for (let yy = 0; yy < dh; yy++) for (let xx = 0; xx < dw; xx++) {
      const px = x - Math.floor(dw / 2) + xx, py = y + dy - dh + yy;
      const r0 = dw / 2, ly = yy, ddy = Math.max(0, r0 - ly);
      if (Math.abs(xx + 0.5 - dw / 2) > Math.sqrt(Math.max(0, r0 * r0 - ddy * ddy)) - 0.5) continue;
      if (bayer(px + Math.floor(t * 6), py) > a * (0.3 + (yy / dh) * 0.7)) continue;
      ctx.fillRect(px, py, 1, 1);
    }
  } });
  ob.glow = (ctx) => { const [x, y] = ob.pos(); glowPx(ctx, x, y + spr.door[1] - spr.door[3] / 2, glowC, ap(20), 0.4 + Math.sin(now() * 2) * 0.1); };
  if (d.theme === 'bandit_hideout' || d.theme === 'pirate_cove') brazier(b, 4.5, 4, '#ff9040', 0.8);
  if (d.theme === 'glass_cavern') for (let i = 0; i < 4; i++) prop(b, 'glass_shard', Math.cos(i * 1.7) * 6, 3 + Math.sin(i * 1.7) * 2, 1.2, i);
  if (d.theme === 'void_rift') for (let i = 0; i < 4; i++) prop(b, 'void_crystal', Math.cos(i * 1.7) * 6, 3 + Math.sin(i * 1.7) * 2, 1.2, i);
  if (d.theme === 'fungal_warren') for (let i = 0; i < 3; i++) prop(b, 'mushroom_giant', Math.cos(i * 2.1) * 7, 3 + Math.sin(i * 2.1) * 2, 1.0, i);
  if (d.theme === 'dragon_lair' || d.theme === 'beast_den') for (let i = 0; i < 3; i++) prop(b, 'rib_bones', Math.cos(i * 2.1) * 7, 4 + Math.sin(i * 2.1) * 2, 1.0, i);
  if (d.theme === 'frozen_citadel') for (let i = 0; i < 5; i++) prop(b, 'ice_crystal', Math.cos(i) * 6, Math.sin(i) * 3 + 3, 1, i);
  if (d.theme === 'sunken_temple') for (const sx of [-1, 1]) prop(b, 'coral', sx * 5, 3, 1.2, sx > 0 ? 1 : 0);
  const y = H(s.x, s.z, s.realm);
  b.lights.push({ x: s.x, y: y + 2.5, z: s.z + 2.6, color: glowC, i: 9, d: 10, always: true });
  // colliders: the facade, leaving the doorway open to walk into
  b.colliders.push({ x: -3.6, z: 0, hw: 1.6, hd: 1.8, rot: 0 }, { x: 3.6, z: 0, hw: 1.6, hd: 1.8, rot: 0 }, { x: 0, z: -1.6, hw: 5, hd: 1.2, rot: 0 });
  G.interactables.push({ site: s.id, kind: 'dungeon', x: s.x, z: s.z + 2.4, r: 3.2, label: `Enter ${d.name} (Lv ${d.level})`, data: d, realm: s.realm, entranceAngle: 0 });
}

// ============================================================================ SHRINES
export function shrineAwake(sh) {
  const c = sh.cond;
  if (!c) return true;
  const ph = atmo.timeOfDay;
  if (c === 'night') return isNight();
  if (c === 'dusk') return ph > 0.68 && ph < 0.82;
  return G.weather?.id === c;
}
// a floating orb: crisp bobbing pixel disc on the emissive layer (rim, body, hot core, glint)
// with a soft glow
const ORB = (() => {
  const r = ap(2.5), rows = [];
  for (let y = -r; y <= r; y++) { const w = Math.floor(Math.sqrt(Math.max(0, r * r - y * y) + 0.5)); rows.push([y, w]); }
  return rows;
})();
function floatingOrb(b, wx, wz, liftPx, color, visible = () => true) {
  const c = C(color), body = `rgb(${c[0]},${c[1]},${c[2]})`, rim = `rgb(${Math.round(c[0] * 0.7)},${Math.round(c[1] * 0.7)},${Math.round(c[2] * 0.75)})`;
  const o = {
    sortZ: wz + 0.05, draw() {},
    pos() { return [Math.round(wx * PPU - view.x0), Math.round(wz * PPU - view.y0) + liftPx + Math.round(Math.sin(now() * 2) * ap(2))]; },
    emissive(ctx) {
      if (!visible()) return;
      const [x, y] = this.pos();
      ctx.fillStyle = rim; for (const [dy, w] of ORB) ctx.fillRect(x - w, y + dy, w * 2 + 1, 1);
      ctx.fillStyle = body; for (const [dy, w] of ORB) if (w > 0 && Math.abs(dy) < ORB.length / 2 - 1) ctx.fillRect(x - w + 1, y + dy, w * 2 - 1, 1);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 1, y - 1, 2, 2); ctx.fillRect(x - 2, y - 2, 1, 1);
    },
    glow(ctx) { if (!visible()) return; const [x, y] = this.pos(); glowPx(ctx, x, y, color, ap(14), 0.55); },
  };
  b.objs.push(o);
  return o;
}
function buildShrine(s, b) {
  const sh = s.data;
  const used = G.char?.shrinesUsed.includes(sh.id);
  const spr = B.shrineSprite();
  at(b, spr, 0, 0.9);
  const col = { s_sun: '#ffd060', s_moon: '#c0d0ff', s_glass: '#ff3050', s_storm: '#a0b0ff', s_aurora: '#60ffb0', s_void: '#a060ff', s_spore: '#c080ff' };
  const key = Object.keys(col).find((k) => sh.id.startsWith(k)) || null;
  const gc = key ? col[key] : '#ffe0a0';
  const awake = () => shrineAwake(sh) && !G.char?.shrinesUsed.includes(sh.id);
  floatingOrb(b, s.x, s.z + 0.9, spr.orbAt[1], gc, awake);
  const y = H(s.x, s.z, s.realm);
  b.updates.push((dt) => { if (awake() && Math.random() < dt * 10) particle({ x: s.x + (Math.random() - 0.5) * 3, y: y + 0.6, z: s.z + (Math.random() - 0.5) * 3, vy: 1.6, life: 1.2, size: 0.3, color: gc }); });
  b.lights.push({ x: s.x, y: y + 2.5, z: s.z, color: gc, i: 6, d: 10, always: true });
  b.colliders.push({ x: 0, z: 0, r: 1.0 });
  G.interactables.push({ site: s.id, kind: 'shrine', x: s.x, z: s.z, r: 3.2, label: used ? `${sh.name} (spent)` : sh.name, data: sh, realm: s.realm });
}

// ============================================================================ RELICS
function buildRelic(s, b) {
  const r = s.data;
  const taken = G.char?.relicsTaken.includes(r.id);
  const spr = B.relicSprite(taken);
  at(b, spr, 0, 0.7);
  if (!taken) {
    floatingOrb(b, s.x, s.z + 0.7, spr.orbAt[1], '#ffe080', () => !G.char?.relicsTaken.includes(r.id));
    b.lights.push({ x: s.x, y: H(s.x, s.z, 'surface') + 3, z: s.z, color: '#ffd080', i: 6, d: 9, always: true });
    G.interactables.push({ site: s.id, kind: 'relic', x: s.x, z: s.z, r: 3, label: `Touch the ${r.name}`, data: r, realm: 'surface' });
  }
  b.colliders.push({ x: 0, z: 0, r: 1.0 });
}

// ============================================================================ REALM GATES
function buildGate(s, b) {
  const g = s.data;
  const y = H(s.x, s.z, s.realm);
  if (s.realm === 'surface') {
    // the Maw: a crisp spiral vortex of void pixels in the crater floor
    b.objs.push({
      sortZ: -1e9, flat: true, draw() {},
      emissive(ctx) {
        const cx = s.x * PPU - view.x0, cy = s.z * PPU - view.y0, t = now();
        const R0 = ap(140), N = 190;
        if (cx < -R0 || cy < -R0 || cx > view.W + R0 || cy > view.H + R0) return;
        for (let arm = 0; arm < 5; arm++) for (let k = 0; k < N; k++) {
          const u = k / N, r = u * R0;
          const a = arm * (Math.PI * 2 / 5) + u * 7 - t * 1.4;
          const x = Math.round(cx + Math.cos(a) * r), yy = Math.round(cy + Math.sin(a) * r);
          ctx.fillStyle = u < 0.2 ? '#ffffff' : u < 0.5 ? '#c090ff' : '#7040c0';
          ctx.globalAlpha = 1 - u * 0.8;
          const sz = u < 0.25 ? 3 : u < 0.5 ? 2 : 1;
          ctx.fillRect(x, yy, sz, sz);
        }
        ctx.globalAlpha = 1;
      },
      glow(ctx) { glowPx(ctx, s.x * PPU - view.x0, s.z * PPU - view.y0, '#a060ff', ap(90), 0.5); glowPx(ctx, s.x * PPU - view.x0, s.z * PPU - view.y0, '#ffffff', ap(18), 0.6); },
    });
    for (let i = 0; i < 10; i++) prop(b, 'void_crystal', Math.cos(i * 0.628) * 18, Math.sin(i * 0.628) * 18, 1.35, i);
    b.lights.push({ x: s.x, y: y + 4, z: s.z, color: '#a060ff', i: 40, d: 40, always: true });
    b.updates.push((dt) => { if (Math.random() < dt * 30) particle({ x: s.x + (Math.random() - 0.5) * 20, y: y + 0.5, z: s.z + (Math.random() - 0.5) * 20, vy: 3 + Math.random() * 4, life: 2, size: 0.4, color: '#b080ff', wobble: 2 }); });
  } else {
    // a shaft of daylight falling from the surface onto a rune ring
    b.objs.push({
      sortZ: s.z, draw() {},
      emissive(ctx) {
        const cx = s.x * PPU - view.x0, cy = s.z * PPU - view.y0, t = now() * 0.4;
        const R1 = ap(52), R2 = ap(44);
        ctx.fillStyle = '#c0d8ff';
        for (let k = 0; k < 80; k++) { const a = (k / 80) * Math.PI * 2 + t; if (k % 10 === 0) continue; ctx.fillRect(Math.round(cx + Math.cos(a) * R1), Math.round(cy + Math.sin(a) * R1), 1, 1); }
        for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 - t; ctx.fillRect(Math.round(cx + Math.cos(a) * R2) - 2, Math.round(cy + Math.sin(a) * R2) - 1, ap(3), ap(2)); }
      },
      glow(ctx) {
        const s2 = view.scale, cx = (s.x * PPU - view.x0) * s2, cy = (s.z * PPU - view.y0) * s2;
        const L = ap(400) * s2, hw = ap(40) * s2;
        const gr = ctx.createLinearGradient(0, cy - L, 0, cy);
        gr.addColorStop(0, 'rgba(192,216,255,0)'); gr.addColorStop(1, 'rgba(192,216,255,0.32)');
        ctx.fillStyle = gr; ctx.fillRect(cx - hw, cy - L, hw * 2, L);
        glowPx(ctx, s.x * PPU - view.x0, s.z * PPU - view.y0, '#c0d8ff', ap(60), 0.45);
      },
    });
    b.lights.push({ x: s.x, y: y + 6, z: s.z, color: '#c0d8ff', i: 30, d: 30, always: true });
  }
  G.interactables.push({ site: s.id, kind: 'gate', x: s.x, z: s.z, r: s.realm === 'surface' ? 10 : 5, label: g.label, data: g, realm: s.realm });
}

// ============================================================================ LANDMARKS
function buildLandmark(s, b) {
  const l = s.data;
  const rng = new RNG(hashStr(l.id));
  const col = (c) => b.colliders.push(c);
  switch (l.type) {
    case 'colossus_head': { const sc = l.scale; at(b, LM.colossusHead(sc), 0, 9 * sc, { occlude: true }); col({ x: 0, z: 0, r: 11 * sc }); break; }
    case 'colossus_hand': at(b, LM.colossusHand(), 0, 6, { occlude: true }); col({ x: 0, z: 0, r: 7.5 }); break;
    case 'colossus_torso': at(b, LM.colossusTorso(), 0, 6, { occlude: true }); col({ x: 0, z: 0, r: 13 }); break;
    case 'glass_field': {
      for (let i = 0; i < 60; i++) {
        const a = rng.f() * Math.PI * 2, r = Math.sqrt(rng.f()) * l.r;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        prop(b, 'glass_shard', x, z, 1 + rng.f() * 0.5, i);
        if (i % 6 === 0) col({ x, z, r: 1.5 });
      }
      break;
    }
    case 'spire': {
      const sc = l.scale;
      at(b, LM.spireSprite(sc), 0, 7 * sc, { occlude: true, windows: false });
      b.lights.push({ x: s.x, y: H(s.x, s.z, 'surface') + 20, z: s.z, color: '#ff6020', i: 30, d: 30, always: true });
      col({ x: 0, z: 0, r: 7.5 * sc });
      break;
    }
    case 'dead_capital': {
      for (let i = 0; i < 46; i++) {
        const a = rng.f() * Math.PI * 2, r = 18 + rng.f() * (l.r - 18);
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const kind = rng.int(0, 4);
        if (kind === 0) {
          const w = 6 + rng.f() * 10, h = 3 + rng.f() * 8;
          at(b, B.ruinWallSprite(Math.round(w), Math.round(h), rng.pick(['#e0d8c4', '#d4ccb4', '#c8c0a8']), i), x, z + 0.7, { occlude: true });
          col({ x, z, hw: w / 2, hd: 0.9, rot: 0 });
        } else if (kind === 1) {
          const n = rng.int(3, 7);
          for (let k = 0; k < n; k++) {
            const cx = x + k * 3, cz = z;
            at(b, B.columnSprite(9, '#e8e0cc', rng.chance(0.4) ? 0.35 + rng.f() * 0.35 : 0, i * 10 + k), cx, cz + 0.3, { shadow: ap(4) });
            col({ x: cx, z: cz, r: 1.0 });
          }
        } else if (kind === 2) {
          const dr = 4 + rng.f() * 4;
          at(b, B.rockSprite(Math.round(dr * PPU), Math.round(dr * 0.6 * PPU), rng.chance(0.5) ? '#c8a050' : '#d8d0b8', i), x, z + dr * 0.5, { occlude: true });
          col({ x, z, r: dr * 0.85 });
        } else if (kind === 3) { prop(b, 'statue_frag', x, z, 1.35, i); col({ x, z, r: 2.4 }); }
        else for (let k = 0; k < 4; k++) prop(b, 'marble_block', x + rng.range(-3, 3), z + rng.range(-3, 3), 1 + rng.f() * 0.35, k);
      }
      // palace: stepped platform, a ring of columns, the broken golden dome and the throne
      b.objs.push({ sortZ: -1e9, flat: true, draw(ctx) {
        const cx = Math.round(s.x * PPU - view.x0), cy = Math.round(s.z * PPU - view.y0);
        const cols = ['#c8c0a8', '#d8d0b8', '#e8e0cc'];
        for (let i = 0; i < 3; i++) {
          const r = ap(130) - i * ap(12);
          ctx.fillStyle = cols[i]; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
          ctx.fillStyle = 'rgba(255,250,236,0.35)'; ctx.fillRect(cx - r, cy - r, r * 2, 1); ctx.fillRect(cx - r, cy - r, 1, r * 2);
          ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(cx - r, cy + r - ap(2), r * 2, ap(2));
          // flagstone joints on each terrace
          ctx.fillStyle = 'rgba(80,70,50,0.16)';
          for (let g = cx - r + ap(16); g < cx + r; g += ap(16)) ctx.fillRect(g, cy - r, 1, r * 2 - ap(2));
          for (let g = cy - r + ap(16); g < cy + r - ap(2); g += ap(16)) ctx.fillRect(cx - r, g, r * 2, 1);
        }
      } });
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        at(b, B.columnSprite(14.5, '#ece4d0', k % 3 === 0 ? 0.42 : 0, k), Math.cos(a) * 11, Math.sin(a) * 11 + 0.3, { shadow: ap(4) });
        col({ x: Math.cos(a) * 11, z: Math.sin(a) * 11, r: 1.3 });
      }
      at(b, LM.palaceDome(), 0, -3, { occlude: true });
      at(b, LM.throneSprite(), 0, 1.5, { glow: (ctx) => glowPx(ctx, s.x * PPU - view.x0, (s.z + 1.5) * PPU - view.y0 - ap(52), '#ffd060', ap(10), 0.5) });
      b.lights.push({ x: s.x, y: H(s.x, s.z, 'surface') + 7, z: s.z, color: '#ffd060', i: 12, d: 18, always: true });
      break;
    }
    case 'fallen_statue': {
      at(b, LM.statueSprite(), 0, 2.5, { occlude: true });
      const hx = Math.sin(l.rot) * 19, hz = Math.cos(l.rot) * 19;
      at(b, LM.stoneHeadSprite('#e0d8c4', '#d8a040', 40), hx, hz + 3.5, { occlude: true });
      col({ x: 1, z: 0, hw: 11, hd: 2.5, rot: 0 });
      col({ x: hx, z: hz, r: 4 });
      break;
    }
    case 'arch': {
      const sc = l.scale;
      at(b, LM.archSprite(sc), 0, 2 * sc, { occlude: true });
      for (const sd of [-1, 1]) col({ x: sd * 4.6 * sc, z: 0, hw: 1.8 * sc, hd: 2 * sc, rot: 0 });
      break;
    }
    case 'aqueduct': {
      const n = Math.floor(l.len / 9);
      for (let i = 0; i < n; i++) {
        const d = (i - n / 2) * 9;
        const x = Math.cos(l.rot) * d, z = -Math.sin(l.rot) * d;
        if (rng.chance(0.18)) continue;
        at(b, LM.aqueductBay(), x, z + 1, { occlude: true });
        col({ x: x - 3.6, z, r: 1.2 }); col({ x: x + 3.6, z, r: 1.2 });
      }
      break;
    }
    case 'elder_yew': {
      const sc = l.scale;
      at(b, LM.yewSprite(sc), 0, 8 * sc, { occlude: true });
      const y = H(s.x, s.z, 'surface');
      b.updates.push((dt) => { if (Math.random() < dt * 6) particle({ x: s.x + (Math.random() - 0.5) * 30, y: y + 2 + Math.random() * 8, z: s.z + (Math.random() - 0.5) * 20, vy: -0.3, vx: 0.4, life: 3, size: 0.25, color: '#d0ff80', wobble: 1.5, gravity: 0 }); });
      b.lights.push({ x: s.x, y: y + 10, z: s.z, color: '#c0ff80', i: 20, d: 30, always: true });
      col({ x: 0, z: 0, r: 8.5 * sc });
      break;
    }
    case 'stone_circle': {
      b.objs.push({ sortZ: -1e9, flat: true, draw(ctx) {
        const cx = Math.round(s.x * PPU - view.x0), cy = Math.round(s.z * PPU - view.y0);
        // a worn stone disc, filled row by row so its edge stays on the pixel grid
        const disc = (r, oy, col) => { ctx.fillStyle = col; for (let y = -r; y <= r; y++) { const w = Math.round(Math.sqrt(r * r - y * y)); ctx.fillRect(cx - w, cy + oy + y, w * 2 + 1, 1); } };
        disc(ap(32), 0, '#5a5a52'); disc(ap(28), -1, '#6a6a62'); disc(ap(10), -1, '#62625a');
      } });
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const x = Math.cos(a) * l.r, z = Math.sin(a) * l.r;
        at(b, LM.standingStone(i), x, z + 0.4, { shadow: ap(5) });
        col({ x, z, r: 1.1 });
      }
      break;
    }
    case 'frozen_titan': {
      at(b, LM.titanSprite(), 0, 8, { occlude: true });
      for (let i = 0; i < 7; i++) prop(b, 'ice_crystal', Math.cos(i * 0.9) * 13, Math.sin(i * 0.9) * 13, 1.35, i);
      col({ x: 0, z: 0, r: 10 });
      break;
    }
    case 'dwarf_gate': {
      at(b, LM.dwarfCliff(), 0, -2, { occlude: true });
      for (const sd of [-1, 1]) { at(b, LM.kingStatue(), sd * 10.5, 2.6, { occlude: true }); brazier(b, sd * 6, 6, '#ff9030', 1.4); }
      col({ x: 0, z: -10, hw: 30, hd: 8, rot: 0 });
      for (const sd of [-1, 1]) col({ x: sd * 10.5, z: 0.4, hw: 2.6, hd: 2.6, rot: 0 });
      break;
    }
    case 'shipwrecks': {
      for (let i = 0; i < 5; i++) {
        const a = rng.f() * Math.PI * 2, r = rng.f() * l.r;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        at(b, LM.wreckSprite(i + 1), x, z + 3, { occlude: true });
        col({ x, z, r: 4 });
      }
      break;
    }
    case 'sunken_temple': {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const x = Math.cos(a) * 14, z = Math.sin(a) * 9;
        at(b, B.columnSprite(13, '#7a9a90', i % 3 === 1 ? 0.45 + rng.f() * 0.3 : 0, i), x, z + 0.3, { shadow: ap(4) });
        if (i % 2 === 0) prop(b, 'coral', x + 1.6, z + 0.5, 1.1, i);
        col({ x, z, r: 1.2 });
      }
      const roof = B.memo('templeRoof', () => {
        const W = ap(240), RH = ap(70), FH = ap(8), p = B.mk(W, ap(80));
        B.fillRoof(p, 0, 0, W, RH, '#6a8a88', 'tile', 3, 0, { ridge: 0.18, moss: 0.35 });
        // entablature under the eave: a lit band, a frieze with triglyphs, a shadow line
        p.rect(0, RH, W, FH, '#6a8a88'); p.rect(0, RH, W, 1, '#8aaaa8'); p.rect(0, RH + FH - 1, W, 1, '#3a5a58');
        for (let x = ap(4); x < W; x += ap(12)) { p.rect(x, RH + 2, ap(3), FH - 4, '#4a6a68'); p.rect(x, RH + 2, 1, FH - 4, '#5a7a78'); }
        // weed and algae creeping over it
        for (let k = 0; k < 200; k++) p.over(Math.floor(hash2(k, 1, 4) * W), Math.floor(hash2(k, 2, 4) * (RH + FH)), hash2(k, 3, 4) < 0.5 ? '#3a7a5a' : '#2a6a4a');
        for (let k = 0; k < 24; k++) { const x = Math.floor(hash2(k, 5, 4) * W), L = ap(2) + Math.floor(hash2(k, 6, 4) * ap(6)); for (let j = 0; j < L; j++) p.over(x + (j % 3 === 2 ? 1 : 0), RH + FH - 2 + j, j % 2 ? '#2a6a4a' : '#3a7a5a'); }
        return B.done(p, null);
      });
      at(b, roof, 2, 10, { lift: 7, occlude: true });
      break;
    }
    case 'lighthouse': {
      const spr = LM.lighthouseSprite();
      const y0 = H(s.x, s.z, 'surface');
      at(b, spr, 0, 3, { occlude: true, glow: (ctx) => {
        const x = s.x * PPU - view.x0, y = (s.z + 3) * PPU - view.y0 + spr.lampAt[1];
        glowPx(ctx, x, y, '#ffe0a0', ap(26), 0.55);
        if (isNight() || G.weather?.id === 'fog') {
          // the sweeping beam
          const sc = view.scale, a = now() * 0.6, L = ap(420) * sc, hw = ap(50) * sc;
          ctx.save(); ctx.translate(x * sc, y * sc); ctx.rotate(a);
          const gr = ctx.createLinearGradient(0, 0, L, 0);
          gr.addColorStop(0, 'rgba(255,240,192,0.35)'); gr.addColorStop(1, 'rgba(255,240,192,0)');
          ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L, -hw); ctx.lineTo(L, hw); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
      } });
      b.lights.push({ x: s.x, y: y0 + 28, z: s.z, color: '#ffe0a0', i: 40, d: 60 });
      col({ x: 0, z: 0, r: 5 });
      break;
    }
    case 'maw': break;
    case 'battlefield': {
      for (let i = 0; i < 40; i++) {
        const a = rng.f() * Math.PI * 2, r = Math.sqrt(rng.f()) * l.r;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const k = rng.int(0, 4);
        if (k === 0) at(b, B.stuckWeapon(rng.pick(['sword', 'spear', 'greatsword']), i), x, z, { shadow: ap(2) });
        else if (k === 1) at(b, B.bannerSprite(rng.pick(['#8a2020', '#c8a040', '#3a4a6a']), 3.4, 0), x, z, { shadow: ap(2) });
        else if (k === 2) prop(b, 'rib_bones', x, z, 0.75, i);
        else if (k === 3) { const sh = shieldSprite({ base: rng.pick(['Round Shield', 'Kite Shield', 'Heater Shield']), color: '#6a6a70', trim: rng.pick(['#6a4a2a', '#8a7a5a']) }); at(b, { pix: sh.front, emis: null }, x, z); }
        else at(b, LM.skullSprite(), x, z);
      }
      break;
    }
  }
  if (!G.char?.discovered.landmarks.includes(l.id)) bus.emit('landmarkNear', l);
}
