// Headless sprite sheets: renders every generated sprite into PNG contact sheets for review.
// Run: node tools/sprite-sheet.mjs <outDir>
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { Pix } from '../src/px/pix.js';
import { humanSprites } from '../src/px/sprites/human.js';
import { creatureSprites } from '../src/px/sprites/creatures.js';
import { weaponSprite, shieldSprite, tomeSprite, ammoSprite } from '../src/px/sprites/weapons.js';
import { propSprite } from '../src/px/sprites/props.js';
import { RACES } from '../src/data/races.js';
import { CLASSES } from '../src/data/classes.js';
import { ENEMIES } from '../src/data/enemies.js';
import { MOUNTS } from '../src/data/mounts.js';
import { WEAPON_TYPES, SHIELD } from '../src/data/items.js';
import { raceLook, enemySpec, mountSpec } from '../src/px/specs.js';
import { armorLook, weaponSpec } from '../src/px/gearLook.js';
import { upscaleFor } from '../src/px/actor.js';

const out = process.argv[2] || '.';
mkdirSync(out, { recursive: true });

// ---- PNG
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (b) => { let c = -1; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); }
function png(p, scale = 3, bg = [70, 74, 64]) {
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
// simple shelf packer: rows of sprites
function sheet(rows, gap = 3) {
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
const up = (p, k) => { if (k === 1) return p; const q = new Pix(p.w * k, p.h * k); for (let y = 0; y < q.h; y++) for (let x = 0; x < q.w; x++) { const i = ((Math.floor(y / k) * p.w) + Math.floor(x / k)) * 4; const o = (y * q.w + x) * 4; for (let c = 0; c < 4; c++) q.d[o + c] = p.d[i + c]; } return q; };

let fails = 0;
const tryit = (label, f) => { try { return f(); } catch (e) { fails++; console.log('FAIL', label, e.stack.split('\n').slice(0, 3).join(' | ')); return null; } };

// ---- races x classes
const rows = [];
const weights = ['plate', 'mail', 'leather', 'cloth'];
RACES.forEach((r, i) => tryit('race ' + r.id, () => {
  const cls = CLASSES[i % CLASSES.length];
  const w = weights[i % 4];
  const eq = { helm: i % 3 ? { weight: w, material: 'steel', rarity: 'rare' } : null, chest: { weight: w, material: 'steel', rarity: i % 2 ? 'epic' : 'common' }, legs: { weight: w, material: 'steel', rarity: 'rare' }, boots: { weight: w, material: 'iron', rarity: 'rare' }, gloves: { weight: w, material: 'steel', rarity: 'rare' } };
  const bare = humanSprites(raceLook(r.look, { skin: i, hair: i }, { shirt: cls.color, pants: '#3a3028' }));
  const dressed = humanSprites({ ...raceLook(r.look, { skin: i + 1, hair: i + 2 }, { shirt: cls.color, pants: '#3a3028' }), ...armorLook(eq) });
  const row = [];
  for (const v of ['down', 'side', 'up']) row.push(bare.views[v].idle[0].pix);
  for (const f of bare.views.down.run) row.push(f.pix);
  row.push(bare.views.down.cast[0].pix, bare.views.down.hurt[0].pix);
  for (const v of ['down', 'side', 'up']) row.push(dressed.views[v].idle[0].pix);
  for (const f of dressed.views.side.run) row.push(f.pix);
  rows.push(row);
}));
writeFileSync(out + '/races.png', png(sheet(rows), 3));

// ---- weapons
const wrows = [];
for (const [type, def] of Object.entries(WEAPON_TYPES)) {
  const row = [];
  for (const base of def.bases) for (const el of [null, 'fire']) { const s = tryit('weapon ' + base, () => weaponSprite({ ...weaponSpec({ type, base, material: el ? 'gilded' : 'steel', rarity: el ? 'legendary' : 'common', element: el }), draw: 0 })); if (s) row.push(s.pix); }
  if (type === 'bow') for (const d of [0.5, 1]) row.push(weaponSprite({ type, base: 'Longbow', color: '#aab4be', trim: '#c8a050', draw: d }).pix);
  wrows.push(row);
}
wrows.push([weaponSprite({ type: 'club', color: '#6a4a2a' }).pix, ...SHIELD.bases.flatMap((b) => { const s = shieldSprite({ base: b, color: '#aab4be', trim: '#c8a050', emblem: '#ff4030' }); return [s.front, s.back, s.edge]; }), tomeSprite('#6a2a20', '#ffd080').pix, ammoSprite('arrow').pix, ammoSprite('bolt', '#80d0ff').pix, ammoSprite('orb', '#ff7020').pix, ammoSprite('shard', '#a0e0ff').pix]);
writeFileSync(out + '/weapons.png', png(sheet(wrows), 4));

// ---- enemies (idle + windup + strike + hurt), grouped by body
const byBody = {};
for (const [id, tpl] of Object.entries(ENEMIES)) (byBody[tpl.body || 'humanoid'] ||= []).push([id, tpl]);
for (const [body, list] of Object.entries(byBody)) {
  const erows = [];
  let row = [];
  for (const [id, tpl] of list) tryit('enemy ' + id, () => {
    const sp = enemySpec(tpl, { ilvl: 30, rarity: tpl.boss ? 'epic' : 'common' });
    let frames, k;
    if (sp.type === 'human') {
      k = upscaleFor(sp.scale, true);
      const hs = humanSprites({ ...sp.look, scale: Math.max(0.8, Math.min(1.55, sp.scale / k)) });
      frames = [hs.views.down.idle[0], hs.views.side.run[1], hs.views.up.idle[0]];
      if (sp.weapon) { const w = weaponSprite(sp.weapon); frames.push(w); }
    } else {
      k = upscaleFor(sp.scale, false);
      const cs = creatureSprites({ ...sp.creature, s: sp.scale / k });
      const V = cs.views.side || cs.views.down;
      frames = [V.idle[0], V.run[1], V.atk[0], V.atk[1], V.hurt[0]];
      if (cs.views.up) frames.push(cs.views.up.idle[0]);
      if (cs.segs) frames.push(...cs.segs.filter((_, i) => i % 4 === 0));
      if (cs.iris) frames.push(cs.iris);
    }
    for (const f of frames) row.push(up(f.pix, Math.min(k, 2)));
    row.push(null);
    if (row.length > 18) { erows.push(row); row = []; }
  });
  if (row.length) erows.push(row);
  writeFileSync(out + `/enemies-${body}.png`, png(sheet(erows), body === 'humanoid' ? 2 : 2));
}

// ---- mounts
const mrow = [];
for (const [id, def] of Object.entries(MOUNTS)) tryit('mount ' + id, () => { const cs = creatureSprites(mountSpec(def)); mrow.push(cs.views.side.idle[0].pix, cs.views.side.run[2].pix); });
writeFileSync(out + '/mounts.png', png(sheet([mrow]), 3));
console.log('sheets written to', out, 'failures', fails);
