// Quest markers in the world, drawn as crisp unlit pixel sprites:
//   "!" over NPCs with a quest to offer, "?" over NPCs a quest is waiting on,
//   a bobbing chevron over the tracked objective (NPC, dungeon door, destination),
//   a dashed ring on kill-quest hunting grounds with small arrows over the targets,
//   and, when the objective is off-screen, an arrow on the screen edge with the distance.
import { G } from '../game.js';
import { scene } from '../px/scene.js';
import { view } from '../px/view.js';
import { Pix, PPU, ART, C } from '../px/pix.js';
import { drawText, textWidth, REGULAR } from '../px/font.js';
import { trackedObjectiveMarkers, pendingTalkNpcs, questsOffered } from '../systems/quests.js';
import { DUNGEONS } from '../data/world.js';

const GOLD = C('#ffd040'), GOLD_HI = C('#fff4b0'), GOLD_LO = C('#b07818'), GOLD_MID = C('#e8a828'), INK = C('#1a0c06');
const ap = (v) => Math.round(v * ART);

function sprite(rows, colorAt) {
  const h = rows.length, w = rows[0].length;
  const p = new Pix(w + 2, h + 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rows[y][x] === '#') p.set(x + 1, y + 1, colorAt(x, y, w, h, rows));
  p.outline(INK, true);
  p.ox = Math.floor(p.w / 2); p.oy = p.h;
  return p;
}
// gold ramp: lit left column and top, a warm mid band, deep right column; one white glint
const on = (rows, x, y) => y >= 0 && y < rows.length && rows[y][x] === '#';
const shade = (x, y, w, h, rows) => {
  if (y < 2 && !on(rows, x - 1, y) && !on(rows, x, y - 1)) return [255, 255, 255, 255];
  if (!on(rows, x - 1, y) || !on(rows, x, y - 1)) return GOLD_HI;
  if (!on(rows, x + 1, y) || !on(rows, x, y + 1)) return GOLD_LO;
  return !on(rows, x + 2, y) ? GOLD_MID : GOLD;
};
const BANG = sprite(['.###.', '#####', '#####', '#####', '#####', '#####', '.###.', '.###.', '.###.', '..#..', '.....', '.###.', '#####', '.###.'], shade);
const ASK = sprite(['..#####..', '.#######.', '###...###', '###...###', '......###', '.....###.', '....###..', '...###...', '...###...', '.........', '.........', '...###...', '...###...'], shade);
const CHEVRON = sprite(['##############', '.############.', '..##########..', '...########...', '....######....', '.....####.....', '......##......'], (x, y, w) => (y === 0 ? (x === 1 ? [255, 255, 255, 255] : GOLD_HI) : y > 3 ? GOLD_LO : x < w / 2 ? GOLD : GOLD_MID));
const MINI = sprite(['########', '.######.', '..####..', '...##...'], (x, y) => (y === 0 ? [255, 190, 150, 255] : y === 1 ? [240, 96, 60, 255] : [200, 50, 30, 255]));

// edge arrows, cached per 1/32 turn
const arrows = new Map();
function arrowSprite(ang, col) {
  const k = ((Math.round(ang / (Math.PI * 2) * 32) % 32) + 32) % 32;
  const key = k + col;
  let p = arrows.get(key);
  if (p) return p;
  const a = (k / 32) * Math.PI * 2, n = 21, c = n / 2;
  p = new Pix(n, n);
  const pt = (r, t) => [c + Math.cos(a + t) * r, c + Math.sin(a + t) * r];
  const fill = C(col);
  p.poly([pt(5.6 * ART, 0), pt(5 * ART, 2.45), pt(1.6 * ART, Math.PI), pt(5 * ART, -2.45)], fill);
  // lit upper half, white-hot tip
  const lit = [Math.min(255, fill[0] + 40), Math.min(255, fill[1] + 40), Math.min(255, fill[2] + 30), 255];
  p.poly([pt(5.6 * ART, 0), pt(5 * ART, -2.45), pt(1.6 * ART, Math.PI)], lit);
  const [tx, ty] = pt(4 * ART, 0), [tx2, ty2] = pt(3 * ART, 0);
  p.set(Math.floor(tx), Math.floor(ty), [255, 255, 255, 255]); p.set(Math.floor(tx2), Math.floor(ty2), [255, 255, 255, 255]);
  p.outline(INK, true);
  p.ox = Math.floor(c); p.oy = Math.floor(c);
  arrows.set(key, p);
  return p;
}
const labels = new Map();
function label(text, col) {
  const key = text + col;
  let p = labels.get(key);
  if (p) return p;
  const w = textWidth(text) + 2;
  p = new Pix(w + 2, REGULAR.h + REGULAR.desc + 4);
  const sink = { px: (x, y, c) => p.set(x, y, c) };
  drawText(sink, 2, 2, text, C(col), 1, INK);
  if (labels.size > 300) labels.clear();
  labels.set(key, p);
  return p;
}

const blit = (ctx, p, x, y) => ctx.drawImage(p.canvas(), Math.round(x) - p.ox, Math.round(y) - p.oy);
const SX = (x) => x * PPU - view.x0;
const SY = (z, h = 0) => z * PPU - view.y0 - h * PPU;

// dashed ground ring (pixel dots marching around)
function ring(ctx, x, z, r, t, col) {
  const cx = SX(x), cy = SY(z), R = r * PPU * (1 + Math.sin(t * 3) * 0.03);
  const n = Math.max(24, Math.round(R * 1.2 / ART));
  for (let i = 0; i < n; i++) {
    if ((i + Math.floor(t * 8)) % 4 === 0) continue;
    const a = (i / n) * Math.PI * 2;
    const X = Math.round(cx + Math.cos(a) * R), Y = Math.round(cy + Math.sin(a) * R * 0.8);
    ctx.fillStyle = '#1a0c06'; ctx.fillRect(X - 1, Y - 1, 5, 4);
    ctx.fillStyle = col; ctx.fillRect(X, Y, 3, 2);
    ctx.fillStyle = '#fff4b0'; ctx.fillRect(X, Y, 1, 1);
  }
}

let offerCache = new Map(), offerT = 0;
function npcOffers(id) {
  if (G.time > offerT) { offerCache = new Map(); offerT = G.time + 0.5; }
  let v = offerCache.get(id);
  if (v === undefined) { v = questsOffered(id).length > 0; offerCache.set(id, v); }
  return v;
}

function draw(ctx) {
  if (G.mode !== 'play' || !G.player || !G.char || (G.menuOpen && G.menuOpen !== 'dialogue') || G.settings.questMarkers === false) return;
  const p = G.player, t = G.realTime;
  const bob = Math.round(Math.sin(t * 4) * 1.5 * ART);
  const W = view.W, H = view.H;
  const onScr = (X, Y, m = ap(6)) => X > m && Y > m && X < W - m && Y < H - m;
  const inDungeon = G.realm === 'dungeon';
  // ---- NPC "!" and "?"
  const waiting = pendingTalkNpcs();
  const npcById = new Map();
  for (const e of G.entities) {
    if (!e.isNpc || e.dead || e.removed || !e.model) continue;
    npcById.set(e.id_, e);
    const ask = waiting.has(e.id_), offer = !ask && npcOffers(e.id_);
    if (!ask && !offer) continue;
    const X = SX(e.pos.x), Y = SY(e.pos.z) - (e.model.heightPx || ap(24)) - ap(4) + bob;
    if (onScr(X, Y, -ap(8))) blit(ctx, ask ? ASK : BANG, X, Y);
  }
  // ---- tutorial target (the training dummy)
  const tt = G.tutorialTarget;
  if (tt && !tt.removed && !tt.dead) {
    const X = SX(tt.pos.x), Y = SY(tt.pos.z) - (tt.model?.heightPx || ap(28)) - ap(5) + bob;
    if (onScr(X, Y, -ap(6))) blit(ctx, CHEVRON, X, Y);
  }
  if (inDungeon) return;
  // ---- tracked objectives
  const all = trackedObjectiveMarkers().filter((q) => q.realm === G.realm);
  const marks = all.some((q) => q.tracked) ? all.filter((q) => q.tracked) : all.slice(0, 1).length ? all.filter((q) => q.quest === all[0].quest) : [];
  const px0 = SX(p.pos.x), py0 = SY(p.pos.z) - ap(10);
  const cssToLow = view.dpr / view.scale;
  const bottomInset = 150 * cssToLow;
  const ecx = W / 2, ecy = (H - bottomInset) / 2 + ap(4), erx = W / 2 - ap(14), ery = (H - bottomInset) / 2 - ap(6);
  for (const q of marks) {
    let x = q.x, z = q.z, head = 0;
    if (q.npc && npcById.has(q.npc)) { const n = npcById.get(q.npc); x = n.pos.x; z = n.pos.z; head = (n.model.heightPx || ap(24)) + ap(16); }
    if (q.type === 'clear') { const d = DUNGEONS.find((dd) => Math.hypot(dd.x - q.x, dd.z - q.z) < 1); if (d) head = ap(26); }
    const X = SX(x), Y = SY(z);
    const dist = Math.hypot(x - p.pos.x, z - p.pos.z);
    if (q.area) {
      // hunting ground: ring + targets
      ring(ctx, x, z, q.r || 9, t, '#ffd040');
      if (q.enemy) for (const e of G.entities) {
        if (e.dead || e.removed || e.isNpc || e.team !== 'enemy') continue;
        if (!(e.tplId === q.enemy || (Array.isArray(q.enemy) && q.enemy.includes(e.tplId)))) continue;
        const ex = SX(e.pos.x), ey = SY(e.pos.z) - (e.model?.heightPx || ap(20)) - ap(3) + bob;
        if (onScr(ex, ey, -ap(4))) blit(ctx, MINI, ex, ey);
      }
    }
    if (q.npc && npcById.has(q.npc)) continue;     // the "?" over their head already marks them
    const my = Y - head - ap(4) + bob;
    if (onScr(X, my, ap(4)) && dist < 60) { blit(ctx, CHEVRON, X, my); continue; }
    // off screen (or far): arrow on an ellipse inside the HUD-safe area
    let dx = X - px0, dy = Y - py0;
    if (!dx && !dy) continue;
    const k = 1 / Math.sqrt((dx / erx) ** 2 + (dy / ery) ** 2);
    if (onScr(X, Y, ap(10)) && k >= 1) { blit(ctx, CHEVRON, X, my); continue; }
    const ax = ecx + dx * k, ay = ecy + dy * k;
    const ang = Math.atan2(dy, dx);
    const pulse = Math.round(Math.sin(t * 5) * 1.2 * ART);
    const arr = arrowSprite(ang, q.tracked ? '#ffd040' : '#c8a060');
    blit(ctx, arr, ax + Math.cos(ang) * pulse, ay + Math.sin(ang) * pulse);
    const lb = label(dist >= 1000 ? (dist / 1000).toFixed(1) + 'km' : Math.round(dist) + 'm', q.tracked ? '#fff0c0' : '#d8c8a0');
    ctx.drawImage(lb.canvas(), Math.round(ax - Math.cos(ang) * 11 * ART - lb.w / 2), Math.round(ay - Math.sin(ang) * 9 * ART - lb.h / 2));
  }
}

export function initQuestMarkers() { scene.persist.emissives.push(draw); }
