// Review sheets for the hand-built monster designs (src/px/sprites/monsters).
// Run: node tools/monster-sheet.mjs <outDir> [designId | enemyId | region ...]
// Writes one PNG per design: every frame zoomed (idle, run, wind-up, strike, hurt, fly), then the
// first idle frame at game scale next to a hero, on a grass-dark backdrop. Also monsters.png with
// the idle frame of every design rendered. Prints any design that throws.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { Pix } from '../src/px/pix.js';
import { humanSprites } from '../src/px/sprites/human.js';
import { creatureSprites } from '../src/px/sprites/creatures.js';
import { DESIGNS, REGIONS, ASSIGN } from '../src/px/sprites/monsters/index.js';
import { RACES } from '../src/data/races.js';
import { ENEMIES } from '../src/data/enemies.js';
import { raceLook } from '../src/px/specs.js';

const out = process.argv[2] || '.';
mkdirSync(out, { recursive: true });
const want = process.argv.slice(3);

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (b) => { let c = -1; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); }
function png(p, scale, bg) {
  const W = p.w * scale, H = p.h * scale;
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const i = ((Math.floor(y / scale) * p.w) + Math.floor(x / scale)) * 4, a = p.d[i + 3] / 255;
      const o = y * (W * 4 + 1) + 1 + x * 4;
      for (let c = 0; c < 3; c++) raw[o + c] = Math.round(p.d[i + c] * a + bg[c] * (1 - a));
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function sheet(rows, gap = 4) {
  const W = Math.max(...rows.map((r) => r.reduce((a, p) => a + (p ? p.w : 8) + gap, gap)));
  const H = rows.reduce((a, r) => a + Math.max(8, ...r.map((p) => (p ? p.h : 8))) + gap, gap);
  const S = new Pix(W, H);
  let y = gap;
  for (const r of rows) {
    let x = gap; const rh = Math.max(8, ...r.map((p) => (p ? p.h : 8)));
    for (const p of r) { if (p) S.blit(p, x, y + rh - p.h); x += (p ? p.w : 8) + gap; }
    y += rh + gap;
  }
  return S;
}
// emissive pixels drawn over the colour (the way the game adds them)
const lit = (fr) => {
  if (!fr.emis) return fr.pix;
  const q = fr.pix.clone();
  for (let i = 0; i < q.d.length; i += 4) if (fr.emis.d[i + 3]) { q.d[i] = Math.min(255, q.d[i] * 0.5 + fr.emis.d[i] * 0.7); q.d[i + 1] = Math.min(255, q.d[i + 1] * 0.5 + fr.emis.d[i + 1] * 0.7); q.d[i + 2] = Math.min(255, q.d[i + 2] * 0.5 + fr.emis.d[i + 2] * 0.7); q.d[i + 3] = 255; }
  return q;
};
// a little ground line under a frame so the pivot is visible
const withGround = (fr) => {
  const p = lit(fr), q = new Pix(p.w + 4, p.h + 3);
  q.blit(p, 2, 0);
  for (let x = 0; x < q.w; x++) q.set(x, p.oy + 1, [255, 255, 255, 60]);
  q.ox = p.ox + 2; q.oy = p.oy;
  return q;
};

const hero = humanSprites(raceLook(RACES[0].look, { skin: 1, hair: 2 }, { shirt: '#3973af', pants: '#3f2622' })).frame('side', {}).pix;

// which designs
let ids = Object.keys(DESIGNS);
if (want.length) {
  ids = [];
  for (const w of want) {
    if (REGIONS[w]) ids.push(...Object.keys(REGIONS[w]));
    else if (DESIGNS[w]) ids.push(w);
    else if (ENEMIES[w]?.design) ids.push(ENEMIES[w].design);
    else console.log('unknown', w);
  }
}
// the enemies drawn by a design (the regional files' assign tables, then enemies.js), with any body
// change the assign table proposes
const users = (id) => {
  const ids = new Set([...Object.entries(ASSIGN).filter(([, a]) => a.design === id).map(([k]) => k), ...Object.entries(ENEMIES).filter(([, t]) => t.design === id).map(([k]) => k)]);
  return [...ids].filter((k) => ENEMIES[k]).map((k) => [k, { ...ENEMIES[k], ...(ASSIGN[k]?.body ? { body: ASSIGN[k].body } : {}) }]);
};

let fails = 0;
const overview = [];
let row = [];
for (const id of ids) {
  const us = users(id);
  const tpl = us[0]?.[1] || { size: 1, colors: ['#8a3434', '#c99a3a', '#c860f0'], body: 'quadruped' };
  try {
    const t0 = Date.now();
    const spr = creatureSprites({ body: tpl.body, design: id, s: tpl.size, c1: tpl.colors[0], c2: tpl.colors[1], c3: tpl.colors[2] });
    // other enemies sharing the design: their idle frame at their own size and colours
    const extra = us.slice(1).map(([, t]) => lit(creatureSprites({ body: t.body, design: id, s: t.size, c1: t.colors[0], c2: t.colors[1], c3: t.colors[2] }).views[spr.views.side ? 'side' : 'down'].idle[0]));
    const ms = Date.now() - t0;
    const V = spr.views.side || spr.views.down;
    const frames = [...V.idle, ...V.run, ...V.atk, ...V.hurt, ...(V.fly || [])].map(withGround);
    const zoom = tpl.size >= 3 ? 2 : tpl.size >= 1.6 ? 3 : 4;
    const rows = [];
    // wrap frames into rows of a sensible width
    let r = [], w = 0;
    for (const f of frames) { if (w + f.w > 700 / zoom * 3 && r.length) { rows.push(r); r = []; w = 0; } r.push(f); w += f.w + 4; }
    if (r.length) rows.push(r);
    // game scale: hero beside the idle frame (at half the zoom)
    const segs = spr.segs ? spr.segs.slice(0, 8).map((s) => lit(s)) : [];
    rows.push([hero, lit(V.idle[0]), ...extra, ...segs]);
    writeFileSync(`${out}/${id}.png`, png(sheet(rows), zoom, [58, 66, 60]));
    console.log(`${id.padEnd(24)} ${us.map(([k]) => k).join(',').padEnd(30)} size ${tpl.size} frames ${frames.length} height ${spr.height}px  ${ms}ms`);
    row.push(lit(V.idle[0]));
    if (row.length >= 8) { overview.push(row); row = []; }
  } catch (e) {
    fails++;
    console.log('FAIL', id, e.stack.split('\n').slice(0, 4).join(' | '));
  }
}
if (row.length) overview.push(row);
if (overview.length) writeFileSync(`${out}/monsters.png`, png(sheet(overview, 8), 2, [58, 66, 60]));
console.log('done, failures', fails);
