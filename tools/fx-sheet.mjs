// Headless contact sheets for the in-world font, ground pickups and world-effect sprites.
// Run: node tools/fx-sheet.mjs <outDir>
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { Pix, light, dark, C } from '../src/px/pix.js';
import { drawText, textWidth, fontFor, REGULAR, BIG, TINY } from '../src/px/font.js';
import { pickupSprite } from '../src/px/sprites/items.js';
import { spikeSprite, totemSprite, iceSprite } from '../src/px/sprites/fx.js';
import { MATERIALS_LIST, CONSUMABLES } from '../src/data/items.js';

const out = process.argv[2] || '.';
mkdirSync(out, { recursive: true });

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

// ---- font
const OUT = [24, 12, 20];
function textPix(text, col, size = 1, outline = OUT) {
  const F = fontFor(text, size);
  const p = new Pix(textWidth(text, F) + 4, F.h + F.desc + 5);
  const c = C(col), hi = light(c, 1.25), lo = dark(c, 0.8);
  const fn = (gx, gy, H) => (gy < Math.round(H * 0.3) ? hi : gy >= Math.round(H * 0.78) ? lo : c);
  drawText({ px: (x, y, cc) => p.set(x, y, [cc[0], cc[1], cc[2], 255]) }, 2, 2, text, typeof col === 'string' ? fn : col, F, outline);
  return p;
}
const all = '0123456789 ABCDEFGHIJKLM NOPQRSTUVWXYZ abcdefghijklm nopqrstuvwxyz !?+-().,:\'%/♪';
const frows = [
  [textPix('0123456789', '#ffffff'), textPix('+12 gold', '#ffd060'), textPix('Immune', '#ffe080'), textPix('(34)', '#c0e0ff')],
  [textPix('ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#ffffff')],
  [textPix('abcdefghijklmnopqrstuvwxyz', '#ffffff')],
  [textPix("!?+-().,:'%/♪ 84m 1.2km x", '#ffffff')],
  [textPix('Reflected! Free cast  Guard Broken  Deathless!', '#80e0ff')],
  [textPix('+3 Iron Ore', '#8a8a90'), textPix('+Healing Draught', '#e04040'), textPix('-27', '#c01020'), textPix('+18', '#70ff70'), textPix('z', '#c0c0ff')],
  [textPix('1234!', '#ffd040', 2), textPix('987', '#ffffff', 2), textPix('PARRY', '#ffffff', 2)],
  [textPix('0123456789', '#ff6040', 2), textPix('!?+-().,:', '#ffffff', 2)],
  [textPix('ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#ffd040', 2)],
  [textPix('KILLING SPREE', '#ffd040', 2), textPix('MURDER! Bounty +1000', '#ff4030', 2)],
  [textPix('157', [255, 255, 255], TINY, [20, 10, 12]), textPix('2048', [255, 255, 255], TINY, [20, 10, 12])],
];
writeFileSync(out + '/font.png', png(sheet(frows), 4));
void all; void REGULAR; void BIG;

// ---- pickups
const prow = [];
prow.push([pickupSprite('gold', {}), ...Object.keys(CONSUMABLES).map((id) => pickupSprite('cons', { id }))]);
prow.push(Object.keys(MATERIALS_LIST).map((id) => pickupSprite('mat', { id })));
const armor = [];
for (const slot of ['helm', 'chest', 'gloves', 'legs', 'boots']) for (const [w, m, r] of [['plate', 'steel', 'rare'], ['mail', 'iron', 'uncommon'], ['leather', 'leather', 'epic'], ['cloth', 'silk', 'legendary']]) armor.push(pickupSprite('item', { slot, weight: w, material: m, rarity: r }));
for (const slot of ['amulet', 'ring', 'charm']) for (const r of ['rare', 'epic', 'legendary']) armor.push(pickupSprite('item', { slot, rarity: r }));
armor.push(pickupSprite('item', { slot: 'helm', legendary: 'ashencrown', rarity: 'legendary' }), pickupSprite('item', { slot: 'helm', legendary: 'hollowcrown', rarity: 'legendary' }));
prow.push(armor);
const wrow = [];
for (const type of ['sword', 'mace', 'greatsword', 'dagger', 'spear', 'halberd', 'bow', 'crossbow', 'staff', 'wand']) { try { wrow.push(pickupSprite('item', { slot: 'mainhand', type, material: 'steel', rarity: 'rare' })); } catch (e) { console.log('weapon', type, e.message); } }
try { wrow.push(pickupSprite('item', { slot: 'offhand', base: 'Kite Shield', material: 'steel', rarity: 'rare' })); } catch (e) { console.log('shield', e.message); }
try { wrow.push(pickupSprite('item', { slot: 'offhand', tome: 'pyromancy', rarity: 'rare' })); } catch (e) { console.log('tome', e.message); }
prow.push(wrow);
const prow2 = prow.map((r) => r.flatMap((s) => (s ? [s.pix, s.emis || null] : [])));
writeFileSync(out + '/pickups.png', png(sheet(prow2), 4));

// ---- world fx sprites
const fx = [spikeSprite(), spikeSprite('#7a6048', '#ff8030'), spikeSprite('#6a7a88', '#80d0ff'), totemSprite(), iceSprite(16), iceSprite(19), iceSprite(22)];
writeFileSync(out + '/fxsprites.png', png(sheet([fx.flatMap((s) => [s.pix, s.emis])]), 4));
console.log('wrote', out);
