// Headless sheets for the town / site / dungeon art (buildings.js, dprops.js): writes PNG contact
// sheets so building and dungeon sprites can be reviewed without a browser.
// Run: node tools/building-sheet.mjs <outDir> [scale]
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { Pix } from '../src/px/pix.js';
import { DUNGEON_THEMES } from '../src/data/world.js';

const out = process.argv[2] || '.';
const SC = +(process.argv[3] || 2);
// optional alternative module folder (for before / after comparisons)
const SRC = process.env.SPRITE_SRC ? pathToFileURL(process.env.SPRITE_SRC + '/').href : new URL('../src/px/sprites/', import.meta.url).href;
const B = await import(SRC + 'buildings.js');
const DP = await import(SRC + 'dprops.js');
const PPU = +(process.env.SHEET_PPU || (await import('../src/px/pix.js')).PPU);
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
// shelf packer; every sprite sits on a common baseline per row (pivots line up)
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
// sprite with its emissive layer composited on top (night look)
function lit(s, k = 0.85) {
  if (!s.emis) return s.pix;
  const p = s.pix.clone();
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const i = (y * p.w + x) * 4;
    if (!p.d[i + 3]) continue;
    for (let c = 0; c < 3; c++) p.d[i + c] = Math.round(p.d[i + c] * 0.4);
    const ex = x - p.ox + s.emis.ox, ey = y - p.oy + s.emis.oy;
    if (ex < 0 || ey < 0 || ex >= s.emis.w || ey >= s.emis.h) continue;
    const j = (ey * s.emis.w + ex) * 4;
    if (s.emis.d[j + 3]) for (let c = 0; c < 3; c++) p.d[i + c] = Math.min(255, p.d[i + c] + s.emis.d[j + c] * k * s.emis.d[j + 3] / 255);
  }
  return p;
}
let fails = 0;
const T = (label, f) => { try { return f(); } catch (e) { fails++; console.log('FAIL', label, e.stack.split('\n').slice(0, 3).join(' | ')); return null; } };
const pix = (s) => (s ? s.pix : null);

// ---- houses
const hrows = [];
for (const style of ['wood', 'stone', 'marble', 'desert', 'port']) {
  const row = [];
  for (const [w, d, h, seed] of [[4, 4, 3, 11], [5.5, 5, 4.2, 23], [7, 6, 5, 37], [8.4, 7.4, 6.2, 91]]) row.push(T(style, () => pix(B.houseSprite(style, w, d, h, seed))));
  if (style === 'wood' || style === 'stone') row.push(T(style + ' snow', () => pix(B.houseSprite(style, 5.5, 5, 4.2, 23, { snow: true }))));
  hrows.push(row);
}
hrows.push([...[5, 6.5].map((w, i) => T('camp', () => pix(B.houseSprite('camp', w, w, 4, 3 + i)))), ...[5, 6.5, 4.5].map((w, i) => T('mush', () => pix(B.houseSprite('mushroom', w, w, 3.5 + i, 7 + i * 5))))]);
writeFileSync(out + '/houses.png', png(sheet(hrows), SC));
// night look of a few houses
writeFileSync(out + '/houses-night.png', png(sheet([['wood', 'stone', 'marble', 'desert', 'port'].map((st) => T('n' + st, () => lit(B.houseSprite(st, 7, 6, 5, 37)))), [T('mush', () => lit(B.houseSprite('mushroom', 5, 5, 3.5, 7)))]]), SC, [20, 22, 30]));

// ---- town kit
const krows = [];
krows.push([...['#a02a20', '#d8a040', '#2a4a7a', '#4a7a3a'].map((c, i) => T('stall', () => pix(B.stallSprite(c, i)))), T('braz1', () => pix(B.brazierSprite(1))), T('braz14', () => pix(B.brazierSprite(1.4))), T('braz22', () => pix(B.brazierSprite(2.2))), T('braz08', () => pix(B.brazierSprite(0.8))), T('lamp', () => pix(B.lampSprite('#ffc060'))), T('lamp2', () => pix(B.lampSprite('#c0ff80')))]);
krows.push([...[0, 1, 2, 3].map((f) => T('fountain', () => pix(B.fountainSprite(3, '#e0d8c4', f)))), T('fountain2', () => pix(B.fountainSprite(3.6, '#8a5a3a', 0))), T('fountain3', () => pix(B.fountainSprite(3, '#b08060', 0)))]);
krows.push([...[0, 1].map((f) => T('banner', () => pix(B.bannerSprite('#b02a20', 7, f)))), T('banner2', () => pix(B.bannerSprite('#e8c050', 7, 0))), T('banner3', () => pix(B.bannerSprite('#3a4a6a', 3.6, 0))), T('banner4', () => pix(B.bannerSprite('#8a2020', 3.4, 1))),
  T('tower', () => pix(B.towerSprite(1.4, 6.5, '#7a7a80', '#3a4250', 0, false))), T('towerd', () => pix(B.towerSprite(1.4, 6.5, '#c89a6a', '#a86a42', 0, true))), T('towerm', () => pix(B.towerSprite(1.4, 6.5, '#e8e0cc', '#b8583a', 0, false))),
  ...['#6a6a72', '#b8845a', '#d8cfb8', '#8a6a48'].map((c) => T('wblock', () => pix(B.wallBlock(c, 4.2, false)))), T('wblocks', () => pix(B.wallBlock('#6a6a72', 4.2, true))), T('wall', () => pix(B.wallSprite(60, '#7a7a80', 4.2, 1, false))), T('walls', () => pix(B.wallSprite(60, '#7a7a80', 4.2, 1, true)))]);
krows.push([T('pier', () => pix(B.pierSprite(Math.round(2.2 * PPU), Math.round(2.2 * PPU)))), T('boat', () => pix(B.boatSprite('#5a3a24', '#e8e0d0'))), T('boat2', () => pix(B.boatSprite('#3a4a5a', '#c8b8a0')))]);
writeFileSync(out + '/townkit.png', png(sheet(krows), SC));
writeFileSync(out + '/townkit-night.png', png(sheet([[T('lamp', () => lit(B.lampSprite('#ffc060'))), T('braz', () => lit(B.brazierSprite(1.4))), T('tower', () => lit(B.towerSprite(1.4, 6.5, '#7a7a80', '#3a4250', 0, false))), T('ws', () => lit(B.waystoneSprite(true))), T('fountain', () => lit(B.fountainSprite(3, '#e0d8c4', 0)))]]), SC, [20, 22, 30]));

// ---- sites
const srows = [];
srows.push([T('ws0', () => pix(B.waystoneSprite(false))), T('ws1', () => pix(B.waystoneSprite(true))), T('cr', () => pix(B.crystalSprite('#a0d8ff', Math.round(12 * PPU / 10)))), T('cr2', () => pix(B.crystalSprite('#808890', Math.round(12 * PPU / 10)))), T('shrine', () => pix(B.shrineSprite())), T('relic0', () => pix(B.relicSprite(false))), T('relic1', () => pix(B.relicSprite(true))),
  ...['sword', 'spear', 'greatsword'].map((t, i) => T('stuck', () => pix(B.stuckWeapon(t, i))))]);
const ents = [];
const biomeOf = { bandit_hideout: 'wastes', beast_den: 'frost', glass_cavern: 'wastes', void_rift: 'wastes', dragon_lair: 'wastes', fungal_warren: 'verdant', pirate_cove: 'coast' };
for (const [id, th] of Object.entries(DUNGEON_THEMES)) ents.push(T('ent ' + id, () => pix(B.entranceSprite(id, biomeOf[id] || 'gilded', th.light))));
ents.push(T('ent verdant', () => pix(B.entranceSprite('beast_den', 'verdant', '#ffc080'))));
srows.push(ents.slice(0, 7)); srows.push(ents.slice(7));
srows.push([T('rock1', () => pix(B.rockSprite(Math.round(4 * PPU), Math.round(4 * 0.6 * PPU), '#c8a050', 1))), T('rock2', () => pix(B.rockSprite(Math.round(6 * PPU), Math.round(6 * 0.6 * PPU), '#d8d0b8', 2))), T('rock3', () => pix(B.rockSprite(Math.round(3 * PPU), Math.round(2 * PPU), '#6a6460', 3, '#eef2f8'))),
  T('col', () => pix(B.columnSprite(9, '#e8e0cc', 0, 1))), T('colb', () => pix(B.columnSprite(9, '#e8e0cc', 0.5, 2))), T('colb2', () => pix(B.columnSprite(14.5, '#ece4d0', 0.42, 3))), T('colt', () => pix(B.columnSprite(14.5, '#ece4d0', 0, 3))), T('cols', () => pix(B.columnSprite(13, '#7a9a90', 0, 4))), T('colf', () => pix(B.columnSprite(5, '#6a6058', 0.5, 4))),
  T('ruin1', () => pix(B.ruinWallSprite(8, 5, '#e0d8c4', 1))), T('ruin2', () => pix(B.ruinWallSprite(14, 9, '#d4ccb4', 2)))]);
writeFileSync(out + '/sites.png', png(sheet(srows), SC));
writeFileSync(out + '/sites-night.png', png(sheet([Object.entries(DUNGEON_THEMES).slice(0, 7).map(([id, th]) => T('e', () => lit(B.entranceSprite(id, biomeOf[id] || 'gilded', th.light))))]), SC, [20, 22, 30]));

// ---- dungeon dressing
const drows = [];
const types = ['barrel', 'crate', 'coffin', 'urn', 'candles', 'anvil', 'anchor', 'minecart', 'nest', 'shell', 'gold_pile', 'bones', 'campfire', 'tent'];
drows.push(types.map((t) => T(t, () => pix(DP.dpropSprite(t, 0)))));
drows.push(types.map((t) => T(t, () => pix(DP.dpropSprite(t, 2)))));
drows.push([T('c0', () => pix(DP.chestSprite(false, false))), T('c1', () => pix(DP.chestSprite(true, false))), T('c2', () => pix(DP.chestSprite(false, true))), T('c3', () => pix(DP.chestSprite(true, true)))]);
writeFileSync(out + '/dprops.png', png(sheet(drows), SC + 1));

// ---- dungeon tiles: a mini room per theme (floor patch with a wall row along the top and a pillar)
const trows = [];
let row = [];
for (const [id, th] of Object.entries(DUNGEON_THEMES)) {
  const tp = T('tiles ' + id, () => {
    const Tt = Math.round((th.layout === 'maze' ? 3.2 : 3.6) * PPU), WP = Math.round(26 * PPU / 10);
    const t = DP.dungeonTiles({ ...th, name: id }, Tt, WP);
    const n = 4, room = new Pix(Tt * n, Tt * (n + 1) + WP);
    const y0 = Tt + WP;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) room.blit(t.floor[(i * 3 + j * 5) % t.floor.length], i * Tt, y0 + j * Tt);
    // a wall row on top: caps + faces
    for (let i = 0; i < n; i++) { room.blit(t.top, i * Tt, 0); room.blit(t.front, i * Tt, Tt); }
    // and one free-standing block in the room
    room.blit(t.top, Tt, y0 + Tt - WP); room.blit(t.front, Tt, y0 + Tt * 2 - WP);
    return room;
  });
  row.push(tp);
  if (row.length === 5) { trows.push(row); row = []; }
}
if (row.length) trows.push(row);
writeFileSync(out + '/dtiles.png', png(sheet(trows, 6), SC === 2 ? 1 : SC - 1));

console.log('done', fails ? fails + ' failures' : 'ok');
