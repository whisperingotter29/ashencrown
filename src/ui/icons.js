// Canvas-painted item and skill icons (cached as data URLs).
import { RARITY, MATERIALS } from '../data/items.js';
import { ELEMENTS, TOMES } from '../data/tomes.js';

import { Pix } from '../px/pix.js';

const cache = new Map();
const S = 64;
export const ICON_N = 20;

// Turn a 64px vector-painted icon into a 20px pixel sprite: area-sample each output pixel,
// keep only solid coverage, posterise the colour, then add a dark outline and top-left rim.
function pixelize(cv, n = ICON_N) {
  const src = cv.getContext('2d').getImageData(0, 0, S, S).data;
  const p = new Pix(n, n);
  const k = S / n, sub = 4;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let j = 0; j < sub; j++) for (let i = 0; i < sub; i++) {
      const sx = Math.min(S - 1, Math.floor((x + (i + 0.5) / sub) * k)), sy = Math.min(S - 1, Math.floor((y + (j + 0.5) / sub) * k));
      const o = (sy * S + sx) * 4, al = src[o + 3] / 255;
      r += src[o] * al; g += src[o + 1] * al; b += src[o + 2] * al; a += al;
    }
    const cov = a / (sub * sub);
    if (cov < 0.42) continue;
    const q = (v) => Math.min(255, Math.round(v / a / 20) * 20);
    p.set(x, y, [q(r), q(g), q(b), 255]);
  }
  p.rim(1.15, 0.82);
  p.outline([14, 9, 8, 255]);
  return p.canvas();
}

function c2d() { const c = document.createElement('canvas'); c.width = c.height = S; return [c, c.getContext('2d')]; }

function metal(item) {
  const m = MATERIALS.find((x) => x.id === item.material);
  return m ? m.color : '#b0b0b8';
}

function poly(g, pts, fill, stroke = '#000') {
  g.beginPath(); g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath(); g.fillStyle = fill; g.fill(); g.lineWidth = 2; g.strokeStyle = stroke; g.stroke();
}

const DRAW = {
  sword(g, col, acc) { g.save(); g.translate(32, 32); g.rotate(-Math.PI / 4); poly(g, [-4, -26, 4, -26, 4, 10, -4, 10], col); poly(g, [-4, -26, 0, -32, 4, -26], col); poly(g, [-12, 10, 12, 10, 12, 14, -12, 14], acc); poly(g, [-3, 14, 3, 14, 3, 26, -3, 26], '#5a3a20'); g.restore(); },
  greatsword(g, col, acc) { g.save(); g.translate(32, 32); g.rotate(-Math.PI / 4); poly(g, [-6, -30, 6, -30, 6, 12, -6, 12], col); poly(g, [-6, -30, 0, -36, 6, -30], col); poly(g, [-15, 12, 15, 12, 15, 17, -15, 17], acc); poly(g, [-3, 17, 3, 17, 3, 30, -3, 30], '#5a3a20'); g.restore(); },
  dagger(g, col, acc) { g.save(); g.translate(32, 34); g.rotate(-Math.PI / 4); poly(g, [-4, -18, 4, -18, 3, 4, -3, 4], col); poly(g, [-4, -18, 0, -24, 4, -18], col); poly(g, [-9, 4, 9, 4, 9, 8, -9, 8], acc); poly(g, [-2.5, 8, 2.5, 8, 2.5, 18, -2.5, 18], '#5a3a20'); g.restore(); },
  mace(g, col, acc) { g.save(); g.translate(32, 32); g.rotate(-Math.PI / 4); poly(g, [-2.5, -8, 2.5, -8, 2.5, 28, -2.5, 28], '#5a3a20'); g.beginPath(); g.arc(0, -16, 10, 0, Math.PI * 2); g.fillStyle = col; g.fill(); g.stroke(); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; poly(g, [Math.cos(a) * 9, -16 + Math.sin(a) * 9, Math.cos(a + 0.3) * 15, -16 + Math.sin(a + 0.3) * 15, Math.cos(a + 0.5) * 9, -16 + Math.sin(a + 0.5) * 9], acc); } g.restore(); },
  spear(g, col, acc) { g.save(); g.translate(32, 32); g.rotate(-Math.PI / 4); poly(g, [-2, -16, 2, -16, 2, 32, -2, 32], '#6a4a2a'); poly(g, [0, -32, 6, -18, 0, -12, -6, -18], col); poly(g, [-6, -14, 6, -14, 6, -11, -6, -11], acc); g.restore(); },
  halberd(g, col, acc) { g.save(); g.translate(32, 32); g.rotate(-Math.PI / 4); poly(g, [-2, -24, 2, -24, 2, 32, -2, 32], '#6a4a2a'); poly(g, [0, -32, 4, -24, -4, -24], col); poly(g, [2, -22, 16, -26, 18, -12, 2, -12], col); poly(g, [-2, -20, -10, -17, -2, -14], acc); g.restore(); },
  bow(g, col) { g.beginPath(); g.lineWidth = 5; g.strokeStyle = '#000'; g.arc(18, 32, 26, -1.1, 1.1); g.stroke(); g.lineWidth = 3; g.strokeStyle = col; g.arc(18, 32, 26, -1.1, 1.1); g.stroke(); g.beginPath(); g.lineWidth = 1; g.strokeStyle = '#e8e0d0'; g.moveTo(18 + Math.cos(-1.1) * 26, 32 + Math.sin(-1.1) * 26); g.lineTo(18 + Math.cos(1.1) * 26, 32 + Math.sin(1.1) * 26); g.stroke(); poly(g, [14, 31, 54, 31, 54, 33, 14, 33], '#c8b890', '#000'); poly(g, [54, 28, 60, 32, 54, 36], '#a8b0b8'); },
  crossbow(g, col, acc) { poly(g, [28, 14, 36, 14, 36, 56, 28, 56], '#6a4a2a'); g.beginPath(); g.lineWidth = 5; g.strokeStyle = '#000'; g.arc(32, 34, 22, -2.6, -0.54); g.stroke(); g.lineWidth = 3; g.strokeStyle = col; g.arc(32, 34, 22, -2.6, -0.54); g.stroke(); poly(g, [26, 50, 38, 50, 38, 58, 26, 58], acc); },
  staff(g, col, acc, glow) { g.save(); g.translate(32, 32); g.rotate(-Math.PI / 5); poly(g, [-2.5, -18, 2.5, -18, 2.5, 30, -2.5, 30], '#6a4a2a'); g.beginPath(); g.arc(0, -22, 8, 0, Math.PI * 2); const gr = g.createRadialGradient(0, -22, 1, 0, -22, 9); gr.addColorStop(0, '#fff'); gr.addColorStop(1, glow || '#80b0ff'); g.fillStyle = gr; g.fill(); g.lineWidth = 2; g.strokeStyle = acc; g.stroke(); g.restore(); },
  wand(g, col, acc, glow) { g.save(); g.translate(32, 34); g.rotate(-Math.PI / 4); poly(g, [-2, -10, 2, -10, 2.5, 22, -2.5, 22], '#5a3a20'); poly(g, [0, -22, 5, -14, 0, -8, -5, -14], glow || '#c0a0ff'); g.restore(); },
  shield(g, col, acc) { poly(g, [12, 10, 52, 10, 52, 32, 32, 56, 12, 32], col); poly(g, [20, 16, 44, 16, 44, 30, 32, 46, 20, 30], acc); },
  helm(g, col, acc) { g.beginPath(); g.moveTo(14, 44); g.lineTo(14, 26); g.quadraticCurveTo(14, 10, 32, 10); g.quadraticCurveTo(50, 10, 50, 26); g.lineTo(50, 44); g.closePath(); g.fillStyle = col; g.fill(); g.lineWidth = 2; g.strokeStyle = '#000'; g.stroke(); poly(g, [20, 28, 44, 28, 44, 32, 20, 32], '#1a1410'); poly(g, [30, 32, 34, 32, 34, 44, 30, 44], acc); },
  chest(g, col, acc) { poly(g, [16, 12, 26, 8, 38, 8, 48, 12, 54, 26, 46, 28, 46, 56, 18, 56, 18, 28, 10, 26], col); poly(g, [26, 8, 32, 18, 38, 8], acc); poly(g, [18, 42, 46, 42, 46, 46, 18, 46], acc); },
  gloves(g, col, acc) { poly(g, [18, 54, 18, 30, 22, 16, 27, 16, 27, 28, 30, 12, 35, 12, 35, 28, 38, 14, 43, 14, 43, 30, 46, 22, 50, 24, 46, 54], col); poly(g, [18, 46, 46, 46, 46, 54, 18, 54], acc); },
  legs(g, col, acc) { poly(g, [16, 10, 48, 10, 50, 56, 36, 56, 32, 26, 28, 56, 14, 56], col); poly(g, [16, 10, 48, 10, 48, 16, 16, 16], acc); },
  boots(g, col, acc) { poly(g, [16, 10, 32, 10, 32, 40, 52, 44, 52, 54, 16, 54], col); poly(g, [16, 22, 32, 22, 32, 26, 16, 26], acc); },
  ring(g, col, acc, glow) { g.beginPath(); g.lineWidth = 8; g.strokeStyle = '#000'; g.arc(32, 38, 15, 0, Math.PI * 2); g.stroke(); g.lineWidth = 5; g.strokeStyle = '#d8b050'; g.arc(32, 38, 15, 0, Math.PI * 2); g.stroke(); poly(g, [32, 12, 40, 22, 32, 30, 24, 22], glow || '#ff4060'); },
  amulet(g, col, acc, glow) { g.beginPath(); g.lineWidth = 2; g.strokeStyle = '#d8b050'; g.moveTo(14, 8); g.quadraticCurveTo(32, 36, 50, 8); g.stroke(); g.beginPath(); g.arc(32, 40, 12, 0, Math.PI * 2); g.fillStyle = '#d8b050'; g.fill(); g.strokeStyle = '#000'; g.stroke(); g.beginPath(); g.arc(32, 40, 7, 0, Math.PI * 2); g.fillStyle = glow || '#40a0ff'; g.fill(); },
  tome(g, col, acc, glow) { poly(g, [14, 10, 48, 8, 50, 54, 16, 56], col); poly(g, [18, 12, 46, 10, 47, 52, 19, 54], '#e8dcc0', 'rgba(0,0,0,0.4)'); poly(g, [16, 10, 22, 10, 22, 56, 16, 56], col); g.beginPath(); g.arc(34, 31, 8, 0, Math.PI * 2); g.fillStyle = glow || '#ffd060'; g.fill(); },
  potion(g, col) { poly(g, [28, 8, 36, 8, 36, 20, 48, 34, 48, 54, 16, 54, 16, 34, 28, 20], 'rgba(200,220,230,0.4)'); poly(g, [18, 36, 46, 36, 46, 52, 18, 52], col); poly(g, [26, 4, 38, 4, 38, 10, 26, 10], '#7a5a3a'); },
  gem(g, col) { poly(g, [32, 8, 52, 24, 44, 54, 20, 54, 12, 24], col); poly(g, [32, 8, 40, 24, 32, 54, 24, 24], 'rgba(255,255,255,0.25)', 'rgba(0,0,0,0.3)'); },
  fists(g, col) { DRAW.gloves(g, '#c8a080', '#8a6a4a'); },
};

const SLOT_ICON = { helm: 'helm', chest: 'chest', gloves: 'gloves', legs: 'legs', boots: 'boots' };
const ELEM_GLOW = { fire: '#ff6a20', frost: '#70c8ff', lightning: '#c0d0ff', void: '#a060ff', holy: '#ffe080', rot: '#70d040' };

export function itemIconKind(item) {
  if (item.kind === 'weapon') return item.type;
  if (item.kind === 'shield') return 'shield';
  if (item.kind === 'armor') return SLOT_ICON[item.slot];
  if (item.kind === 'trinket') return item.slot;
  if (item.kind === 'tome') return 'tome';
  return 'gem';
}

export function itemIcon(item) {
  const kind = itemIconKind(item);
  const col = item.kind === 'tome' ? TOMES[item.tome]?.color : metal(item);
  const r = RARITY[item.rarity];
  const key = `${kind}|${col}|${item.rarity}|${item.element || ''}|${item.gem || ''}`;
  let url = cache.get(key);
  if (url) return url;
  const [c, g] = c2d();
  // rarity backdrop
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 34);
  gr.addColorStop(0, r.color + '55'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  const acc = r.index >= 3 ? r.color : '#a07a40';
  const glowC = item.element ? ELEM_GLOW[item.element] : item.kind === 'trinket' ? ({ Ruby: '#ff3040', Sapphire: '#3060ff', Topaz: '#ffc030', Amethyst: '#a050ff', Emerald: '#30d060', Onyx: '#303030', Opal: '#e0f0ff', Garnet: '#a01030', Jade: '#40a060', Moonstone: '#c0d0ff' })[item.gem] : null;
  (DRAW[kind] || DRAW.gem)(g, col || '#b0b0b8', acc, glowC);
  if (item.element && kind !== 'staff' && kind !== 'wand') { g.globalCompositeOperation = 'source-atop'; g.fillStyle = ELEM_GLOW[item.element] + '40'; g.fillRect(0, 0, S, S); g.globalCompositeOperation = 'source-over'; }
  url = pixelize(c).toDataURL();
  cache.set(key, url);
  return url;
}

export function simpleIcon(kind, color) {
  const key = `s|${kind}|${color}`;
  let url = cache.get(key);
  if (url) return url;
  const [c, g] = c2d();
  (DRAW[kind] || DRAW.gem)(g, color, '#a07a40', color);
  url = pixelize(c).toDataURL();
  cache.set(key, url);
  return url;
}

// Skill/spell icons: element-tinted medallion with a rune glyph
const GLYPH = {
  projectile: '➶', cone: '◣', nova: '✺', ground: '☄', rain: '⁂', zone: '◎', aura: '❂', chain: 'ϟ', buff: '✚', heal: '✙', summon: '☠', blink: '⤳', beam: '═', line: '⫶',
  melee: '⚔', dash: '➽', spin: '↻', flurry: '≋', volley: '⇶', shot: '➹', stealth: '◐', teleport: '⇄', dashblink: '⇢', leap: '⤒', flask: '⚗', totem: '♣', trap: '⊗', wall: '▤', passive: '◈',
};
export function skillIcon(def, element) {
  const el = element || def.element || 'physical';
  const key = `k|${def.id}|${el}`;
  let url = cache.get(key);
  if (url) return url;
  const [c, g] = c2d();
  const col = ELEMENTS[el]?.glow || '#c0b090';
  // banded medallion: light top, element colour, dark base (reads as pixel shading once shrunk)
  g.save();
  g.beginPath(); g.rect(2, 2, 60, 60); g.clip();
  g.fillStyle = '#0a0606'; g.fillRect(0, 0, S, S);
  g.fillStyle = col; g.fillRect(6, 6, 52, 52);
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(6, 6, 52, 13);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(6, 45, 52, 13);
  g.restore();
  g.font = 'bold 46px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#1a0c08'; g.fillText(GLYPH[def.type] || '✦', 35, 37);
  g.fillStyle = '#fff8e8'; g.fillText(GLYPH[def.type] || '✦', 32, 34);
  url = pixelize(c).toDataURL();
  cache.set(key, url);
  return url;
}
