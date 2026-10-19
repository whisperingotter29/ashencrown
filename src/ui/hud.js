// In-game HUD: health / mana orbs, stamina, the action bar (weapon slots 1-4, the Q / E / R
// abilities of the weapon in hand, X signature with its resource meter, Z / V potions), XP bar,
// buffs, minimap, quest tracker, boss bar, kill-streak counter and the interaction prompt.
//
// Built once; every frame only touches text / styles whose value actually changed (cached
// refs, no per-frame innerHTML). Cooldowns are pixel sweeps drawn into tiny canvases.
//
// Stable selectors other modules use: [data-ability-key="q|e|r"].slot (inside .skillbar),
// .slot.sig, [data-weapon-slot="0..3"], .orb.hp, classes tut-glow / fired.
import { G } from '../game.js';
import { el, esc, kc, root, bindTip, fmtTime, uiUnit, pxTitle } from './ui.js';
import { CLASS_BY_ID } from '../data/classes.js';
import { RACE_BY_ID } from '../data/races.js';
import { rarityOfRace, rarityOfClass } from '../data/fateRarity.js';
import { abilityDef } from '../systems/abilities.js';
import { skillIcon, simpleIcon, itemIcon } from './icons.js';
import { xpToNext } from '../systems/stats.js';
import { MAP, fogMask, FOG_N } from '../world/mapdata.js';
import { cam } from '../world/cameraRig.js';
import { TOWNS, DEEP_TOWNS, DUNGEONS, WAYSTONES, SHRINES, BIOMES } from '../data/world.js';
import { questDef, objectiveProgress, trackedObjectiveMarkers } from '../systems/quests.js';
import { clockString, timePhase } from '../world/atmosphere.js';
import { beatPhase } from '../systems/classMech.js';
import { CONSUMABLES } from '../data/items.js';
import { mixc } from '../px/pix.js';
import { drawText, textWidth, TINY } from '../px/font.js';
import { ensureLoadout, currentKit, switchSlot, LOADOUT_SIZE } from '../systems/loadout.js';
import { input } from '../core/input.js';
import { bus } from '../core/events.js';
import { abilityTip } from './menus.js';

const H = {};
let built = false;
const KEYS = ['Q', 'E', 'R'];
const PAD_KEYS = ['X', 'Y', 'RB'];
// resource each signature needs before it fires (mirrors classMech.useSignature)
const SIG_COST = { knight: 50, berserker: 30, pyromancer: 10, cleric: 60, necromancer: 3, bard: 20, alchemist: 2, warden: 25, duelist: 40 };

// small helpers that only write when the value changed
const setText = (n, v) => { v = String(v); if (n._t !== v) { n._t = v; n.textContent = v; } };
const setHTML = (n, v) => { if (n._h !== v) { n._h = v; n.innerHTML = v; } };
const setH = (n, f) => { const v = (Math.max(0, Math.min(1, f)) * 100).toFixed(1) + '%'; if (n._hh !== v) { n._hh = v; n.style.height = v; } };
const setW = (n, f) => { const v = (Math.max(0, Math.min(1, f)) * 100).toFixed(1) + '%'; if (n._w !== v) { n._w = v; n.style.width = v; } };
const tog = (n, cls, on) => { on = !!on; if ((n._c || (n._c = {}))[cls] !== on) { n._c[cls] = on; n.classList.toggle(cls, on); } };
const setSrc = (n, src) => { if (n._s !== src) { n._s = src; if (src) n.src = src; else n.removeAttribute('src'); n.style.visibility = src ? '' : 'hidden'; } };
const pop = (n, cls) => { n.classList.remove(cls); void n.offsetWidth; n.classList.add(cls); };

export function buildHud() {
  if (built) { H.root.classList.remove('hidden'); refreshSkillbar(); return; }
  built = true;
  if (G.char) ensureLoadout(G.char);
  const r = el('div', '');
  r.id = 'hud';
  H.root = r;
  // ------------------------------------------------ top-left: nameplate, buffs
  const tl = el('div', 'hud-tl');
  H.name = el('div', 'nameplate', '<div class="lvl"><b></b></div><div class="np-t"><div class="np-n"></div><div class="np-s"></div></div>');
  H.lvl = H.name.querySelector('.lvl b'); H.npN = H.name.querySelector('.np-n'); H.npS = H.name.querySelector('.np-s');
  H.buffs = el('div', 'buffs');
  tl.append(H.name, H.buffs);
  r.appendChild(tl);
  // ------------------------------------------------ top-right: minimap, info, tracker
  const tr = el('div', 'hud-tr');
  const mm = el('div', 'minimap f-ring');
  H.mm = document.createElement('canvas');
  H.mm.width = H.mm.height = 92;
  mm.appendChild(H.mm);
  H.mmInfo = el('div', 'mm-info');
  H.tracker = el('div', 'tracker');
  tr.append(mm, H.mmInfo, H.tracker);
  r.appendChild(tr);
  // ------------------------------------------------ boss bar, streak, shout
  H.boss = el('div', 'bossbar hidden', '<div class="name"></div><div class="sub"></div><div class="bar"><div class="lag"></div><div class="fill"></div><div class="ticks"></div></div>');
  H.bossName = H.boss.querySelector('.name'); H.bossSub = H.boss.querySelector('.sub'); H.bossFill = H.boss.querySelector('.fill'); H.bossLag = H.boss.querySelector('.lag');
  r.appendChild(H.boss);
  H.streak = el('div', 'streak hidden', '<div class="sn"><span class="x">x</span><b>0</b></div><div class="sl">Kills</div><div class="st"><i></i></div>');
  H.streakN = H.streak.querySelector('b'); H.streakT = H.streak.querySelector('.st i');
  r.appendChild(H.streak);
  H.shout = el('div', 'shout hidden');
  r.appendChild(H.shout);
  // ------------------------------------------------ bottom: orbs + action bar
  const bot = el('div', 'hud-bottom');
  H.hp = orb('hp');
  H.mp = orb('mp');
  const mid = el('div', 'center-col');
  H.stam = el('div', 'stam', '<div class="lag"></div><div class="fill"></div>');
  H.stamFill = H.stam.querySelector('.fill'); H.stamLagEl = H.stam.querySelector('.lag');
  H.stamLag = 1;
  const bar = el('div', 'actionbar f-plank');
  // weapons 1-4
  const wg = el('div', 'wslots');
  H.wpad = [el('span', 'padhint l', kc('◄', 'pad')), el('span', 'padhint r', kc('►', 'pad'))];
  wg.appendChild(H.wpad[0]);
  H.wslots = [];
  for (let i = 0; i < LOADOUT_SIZE; i++) {
    const s = el('div', 'wslot interactive', `<img class="ic" draggable="false"><span class="kc">${i + 1}</span>`);
    s.dataset.weaponSlot = String(i);
    s.ic = s.querySelector('.ic'); s.key = s.querySelector('.kc');
    bindTip(s, () => weaponTip(i), { pos: 'top' });
    s.onclick = () => { if (!G.menuOpen) switchSlot(i); };
    wg.appendChild(s);
    H.wslots.push(s);
  }
  wg.appendChild(H.wpad[1]);
  // Q / E / R
  H.bar = el('div', 'skillbar');
  H.slots = [];
  for (let k = 0; k < 3; k++) {
    const s = el('div', 'slot ab interactive', `<img class="ic" draggable="false"><canvas class="cd" width="20" height="20"></canvas><span class="cdt"></span><span class="cost"></span><span class="kc">${KEYS[k]}</span>`);
    s.dataset.abilityKey = KEYS[k].toLowerCase();
    Object.assign(s, { ic: s.querySelector('.ic'), cv: s.querySelector('.cd'), cdt: s.querySelector('.cdt'), cost: s.querySelector('.cost'), key: s.querySelector('.kc'), _cd: 0, _q: -1 });
    bindTip(s, () => { const id = H.kit?.[k]; return id ? abilityTip(id, KEYS[k]) + usableNote(id) : `<div class="tip-s"><b>${KEYS[k]} · empty</b><span>Bind abilities for the weapon in hand in Skills (${kc('K')}).</span></div>`; }, { pos: 'top' });
    H.bar.appendChild(s);
    H.slots.push(s);
  }
  // X signature with its resource meter
  H.sig = el('div', 'slot sig interactive', `<img class="ic" draggable="false"><canvas class="cd" width="20" height="20"></canvas><span class="kc">X</span><div class="meter"><i></i></div><div class="pips"></div>`);
  Object.assign(H.sig, { ic: H.sig.querySelector('.ic'), cv: H.sig.querySelector('.cd'), key: H.sig.querySelector('.kc'), meter: H.sig.querySelector('.meter i'), meterBox: H.sig.querySelector('.meter'), pips: H.sig.querySelector('.pips'), _q: -1 });
  bindTip(H.sig, () => { const c = CLASS_BY_ID[G.char.cls]; return `<div class="tip-a"><div class="ta-h"><div><b>${esc(c.signature.name)}</b><span>Class signature · ${esc(c.resource.name)} ${Math.floor(G.player?.resource || 0)}/${G.player?.resourceMax || c.resource.max}</span></div>${kc('X')}</div><div class="ta-d">${esc(c.signature.desc)}</div><div class="ta-d dim">${esc(c.mechanic)}</div></div>`; }, { pos: 'top' });
  // potions
  const pots = el('div', 'pots');
  const potSlot = (id, key, color) => {
    const s = el('div', 'slot pot interactive', `<img class="ic" src="${simpleIcon('potion', color)}" draggable="false"><canvas class="cd" width="20" height="20"></canvas><span class="count"></span><span class="kc">${key}</span>`);
    Object.assign(s, { cv: s.querySelector('.cd'), count: s.querySelector('.count'), key: s.querySelector('.kc'), _q: -1, potion: id });
    bindTip(s, () => `<div class="tip-s"><b>${esc(CONSUMABLES[id].name)}</b><span>${esc(CONSUMABLES[id].desc)}</span><span class="dim">${G.char.consumables[id] || 0} left</span></div>`, { pos: 'top' });
    return s;
  };
  H.potHp = potSlot('hp_potion', 'Z', '#b04a3e');
  H.potMp = potSlot('mana_potion', 'V', '#3973af');
  pots.append(H.potHp, H.potMp);
  bar.append(wg, el('i', 'sep'), H.bar, el('i', 'sep'), H.sig, el('i', 'sep'), pots);
  mid.append(H.stam, bar);
  bot.append(H.hp.node, mid, H.mp.node);
  r.appendChild(bot);
  H.xp = el('div', 'xpbar', '<div class="fill"></div><div class="ticks"></div>');
  H.xpFill = H.xp.querySelector('.fill');
  r.appendChild(H.xp);
  H.prompt = el('div', 'prompt hidden');
  r.appendChild(H.prompt);
  H.beat = el('div', 'beat hidden', '<div class="center"></div><div class="dot"></div><div class="dot"></div>');
  r.appendChild(H.beat);
  root().appendChild(r);
  refreshSkillbar();
}

export function hideHud() { if (H.root) H.root.classList.add('hidden'); }

function weaponTip(i) {
  const c = G.char, it = c.loadout?.[i];
  if (!it) return `<div class="tip-s"><b>Slot ${i + 1} · empty</b><span>Drag a weapon or spellbook here from your bag (${kc('I')}).</span></div>`;
  return `<div class="tip-s"><b class="r-${it.rarity}">${esc(it.name)}</b><span>${i === c.activeSlot ? 'In hand' : `Press ${kc(String(i + 1))} to take it in hand`}</span></div>`;
}
function usableNote(id) {
  const a = abilityDef(id), p = G.player;
  if (!a || !p) return '';
  const cd = p.cooldowns[id] || 0;
  if (cd > 0.05) return `<div class="tip-note">Ready in ${cd.toFixed(1)}s</div>`;
  if (a.kind === 'spell' && !a.def.hpCost && p.mana < (a.def.cost || 0)) return '<div class="tip-note bad">Not enough mana</div>';
  if (a.def.mana && p.mana < a.def.mana) return '<div class="tip-note bad">Not enough mana</div>';
  return '';
}

// Pixel-art orb: a 34px glass globe drawn pixel by pixel and scaled up with nearest-neighbour.
// Liquid level sloshes, bubbles rise, the value is printed in the pixel font.
const ORB_N = 34;
// liquid ramps from the master palette: health on the red ramp, mana on blue leaning aether
const ORB_COLS = { hp: ['#d9765a', '#b04a3e', '#4a1420'], mp: ['#8cb8de', '#3973af', '#1a0f47'] };
function orb(kind) {
  const node = el('div', 'orb px ' + kind);
  const cv = document.createElement('canvas');
  cv.width = cv.height = ORB_N;
  node.appendChild(cv);
  const ctx = cv.getContext('2d');
  return { node, kind, ctx, img: ctx.createImageData(ORB_N, ORB_N), key: '' };
}
const C3 = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
function drawOrb(o, frac, value, shield, t) {
  const tick = Math.floor(t * 8);
  const key = `${Math.round(frac * 60)}|${value}|${shield ? 1 : 0}|${tick}`;
  if (key === o.key) return;
  o.key = key;
  const N = ORB_N, d = o.img.data, c = N / 2, R = 13.6;
  const [hi, mid, lo] = ORB_COLS[o.kind].map(C3);
  const sink = { px(x, y, col) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= N || y >= N) return; const i = (y * N + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; } };
  d.fill(0);
  const surf = Math.round(c + R - frac * R * 2);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c, r = Math.hypot(dx, dy);
    if (r > R + 3) continue;
    const ang = Math.atan2(dy, dx);
    if (r > R + 2) sink.px(x, y, [20, 15, 28]);
    else if (r > R) {
      const l = -Math.cos(ang + Math.PI * 0.25);
      sink.px(x, y, shield ? (l > 0.3 ? [230, 244, 252] : [106, 160, 208]) : l > 0.45 ? [246, 227, 154] : l > -0.35 ? [201, 154, 58] : [106, 62, 28]);
    } else {
      const wave = Math.round(Math.sin(x * 0.55 + t * 3.2) * (frac > 0.02 && frac < 0.98 ? 0.7 : 0));
      const sy = surf + wave;
      if (y > sy) {
        const depth = (y - sy) / Math.max(1, c + R - sy);
        const edge = r > R - 2.2;
        sink.px(x, y, edge ? lo : depth < 0.35 && dx < 2 ? mid : depth > 0.7 ? lo : mid);
        if (!edge && dx < -3 && dx > -7 && depth > 0.1 && depth < 0.7) sink.px(x, y, mixc(mid, hi, 0.5));
      } else if (y === sy && frac > 0.01) sink.px(x, y, hi);
      else sink.px(x, y, r > R - 1.5 ? [42, 24, 56] : [26, 16, 34]);
    }
  }
  for (let b = 0; b < 3; b++) {
    const bx = Math.round(c - 6 + b * 6 + Math.sin(t * 2 + b) * 1.2), by = Math.round(c + R - 2 - ((t * 6 + b * 9) % (R * 2)));
    if (by > surf + 1) sink.px(bx, by, hi);
  }
  for (const [gx, gy] of [[10, 7], [9, 8], [8, 9], [8, 10], [7, 11], [12, 6], [13, 6]]) sink.px(gx, gy, [255, 244, 220]);
  const txt = String(value);
  drawText(sink, Math.round(c - textWidth(txt, TINY) / 2), Math.round(c - 2), txt, [255, 244, 220], TINY, [20, 15, 28]);
  o.ctx.putImageData(o.img, 0, 0);
}

// Pixel cooldown sweep: the not-yet-ready part of the clock face is shaded, clearing clockwise
// from 12 o'clock, with a bright pixel edge on the leading line. q = remaining fraction 0..1.
const sweepCache = new Map();
function drawSweep(cv, q) {
  const steps = 48;
  const qi = Math.round(Math.max(0, Math.min(1, q)) * steps);
  if (cv._q === qi) return;
  cv._q = qi;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 20, 20);
  if (!qi) return;
  let im = sweepCache.get(qi);
  if (!im) {
    im = g.createImageData(20, 20);
    const d = im.data, f = qi / steps;
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
      const a = (Math.atan2(x + 0.5 - 10, -(y + 0.5 - 10)) / (Math.PI * 2) + 1) % 1;
      if (a < 1 - f) continue;
      const i = (y * 20 + x) * 4;
      const edge = a - (1 - f) < 0.035 && Math.hypot(x + 0.5 - 10, y + 0.5 - 10) < 10;
      d[i] = edge ? 255 : 6; d[i + 1] = edge ? 236 : 4; d[i + 2] = edge ? 170 : 10; d[i + 3] = edge ? 200 : (x + y) % 2 ? 176 : 150;
    }
    sweepCache.set(qi, im);
  }
  g.putImageData(im, 0, 0);
}

let sigKey = '';
// Rebuild icons for the weapon slots, the kit of the weapon in hand and the signature.
export function refreshSkillbar() {
  if (!built || !G.char) return;
  const c = G.char;
  ensureLoadout(c);
  for (let i = 0; i < LOADOUT_SIZE; i++) {
    const s = H.wslots[i], it = c.loadout[i];
    setSrc(s.ic, it ? itemIcon(it) : null);
    tog(s, 'empty', !it);
    tog(s, 'active', i === c.activeSlot && !!it);
    s.className = s.className.replace(/\brf-\w+/g, '').trim() + (it ? ' rf-' + it.rarity : '');
  }
  let kit = [null, null, null];
  try { kit = currentKit(c); } catch (e) { /* loadout not ready */ }
  H.kit = kit;
  kit.forEach((id, k) => {
    const s = H.slots[k], a = id && abilityDef(id);
    setSrc(s.ic, a ? skillIcon(a.def, a.def.element) : null);
    tog(s, 'empty', !a);
    setText(s.cost, a ? (a.kind === 'spell' ? (a.def.hpCost ? '♥' : a.def.cost || '') : a.def.mana || '') : '');
    s._max = a?.def.cd || 1;
  });
  const cls = CLASS_BY_ID[c.cls];
  setSrc(H.sig.ic, skillIcon({ id: 'sig_' + cls.id, type: 'sig', color: '#9a6424' }));
  H.sig.style.setProperty('--rc', cls.resource.color);
  tog(H.sig, 'discrete', !!cls.resource.discrete);
  if (cls.resource.discrete && H.sig.pips.children.length !== cls.resource.max) { H.sig.pips.innerHTML = ''; for (let i = 0; i < cls.resource.max; i++) H.sig.pips.appendChild(el('span', '')); }
  sigKey = signature();
}
// cheap fingerprint of everything refreshSkillbar depends on (polled as a safety net)
function signature() {
  const c = G.char;
  return (c.loadout || []).map((x) => x?.uid || '-').join(',') + '|' + c.activeSlot + '|' + JSON.stringify(c.kitPicks || {}) + '|' + (c.equip.offhand?.uid || '') + '|' + c.skills.length;
}

let padMode = null;
function setPadLabels(pad) {
  padMode = pad;
  tog(H.root, 'pad', pad);
  H.slots.forEach((s, k) => setText(s.key, pad ? PAD_KEYS[k] : KEYS[k]));
  setText(H.sig.key, pad ? 'LB' : 'X');
  setText(H.potHp.key, pad ? '▲' : 'Z');
  setText(H.potMp.key, pad ? '▼' : 'V');
}

let mmT = 0, slowT = 0, streakMax = 1, lastStreak = 0, lastPrompt = null;
export function updateHud(dt) {
  if (!built || !G.player || !G.char) return;
  const p = G.player, c = G.char;
  const race = RACE_BY_ID[c.race], cls = CLASS_BY_ID[c.cls];
  if (padMode !== !!input.usingPad) setPadLabels(!!input.usingPad);
  // orbs
  const sh = p.buffs?.shield || 0;
  drawOrb(H.hp, Math.max(0, Math.min(1, p.hp / p.maxHp)), Math.ceil(Math.max(0, p.hp)), sh > 1, G.realTime);
  drawOrb(H.mp, Math.max(0, Math.min(1, p.mana / p.maxMana)), Math.floor(p.mana), false, G.realTime + 1.7);
  // stamina: width snapped to whole UI pixels; a pale lag bar trails spending
  {
    const u = uiUnit(), cells = 168;
    const f = Math.max(0, Math.min(1, p.stamina / p.maxStamina));
    H.stamLag = f > H.stamLag ? f : Math.max(f, H.stamLag - dt * 0.6);
    const fw = `${Math.round(f * cells) * u}px`, lw = `${Math.round(H.stamLag * cells) * u}px`;
    if (H.stamFill._w !== fw) { H.stamFill._w = fw; H.stamFill.style.width = fw; }
    if (H.stamLagEl._w !== lw) { H.stamLagEl._w = lw; H.stamLagEl.style.width = lw; }
    tog(H.stam, 'winded', p.winded);
    tog(H.stam, 'sprint', p.sprinting);
    tog(H.stam, 'full', f >= 0.999 && H.stamLag >= 0.999);
  }
  // abilities: cooldown sweeps, ready flash, out-of-mana / stamina tint
  const kit = H.kit || [];
  for (let k = 0; k < 3; k++) {
    const s = H.slots[k], id = kit[k];
    if (!id) { drawSweep(s.cv, 0); setText(s.cdt, ''); continue; }
    const cd = p.cooldowns[id] || 0;
    drawSweep(s.cv, cd / (s._max || 1));
    setText(s.cdt, cd > 0.05 ? (cd < 1 ? cd.toFixed(1) : Math.ceil(cd)) : '');
    if (s._cd > 0.05 && cd <= 0.05) pop(s, 'ready');
    s._cd = cd;
    const a = abilityDef(id);
    if (a) {
      const manaCost = a.kind === 'spell' ? (a.def.hpCost ? 0 : a.def.cost || 0) : a.def.mana || 0;
      tog(s, 'nomana', manaCost > p.mana + 0.01);
      tog(s, 'nostam', !manaCost && (a.def.stamina || 0) > p.stamina + 0.01);
    }
  }
  // signature: resource meter, ready glow
  {
    const rv = p.resource || 0, rmax = p.resourceMax || cls.resource.max;
    const scd = p.cooldowns.signature || 0;
    drawSweep(H.sig.cv, scd / 1.5);
    if (cls.resource.discrete) { const pips = H.sig.pips.children; for (let i = 0; i < pips.length; i++) tog(pips[i], 'on', i < rv); }
    else setH(H.sig.meter, rv / rmax);
    const cost = SIG_COST[cls.id] || 0;
    tog(H.sig, 'charged', rv >= (cost || rmax * 0.999) && scd <= 0);
    tog(H.sig, 'low', cost > 0 && rv < cost);
  }
  // potions
  for (const s of [H.potHp, H.potMp]) {
    const n = c.consumables[s.potion] || 0;
    setText(s.count, n);
    tog(s, 'none', !n);
    drawSweep(s.cv, (p.cooldowns['potion_' + s.potion] || 0) / 1.5);
  }
  setW(H.xpFill, c.xp / xpToNext(c.level));
  // bard beat
  if (c.cls === 'bard') {
    tog(H.beat, 'hidden', false);
    const ph = beatPhase();
    const dots = H.beat.querySelectorAll('.dot');
    dots[0].style.left = `${(1 - ph) * 50 + 50 - 7}%`;
    dots[1].style.left = `${ph * 50 - 7}%`;
    dots[0].style.opacity = dots[1].style.opacity = ph < 0.18 || ph > 0.86 ? 1 : 0.5;
  }
  // kill streak
  updateStreak();
  slowT -= dt;
  if (slowT <= 0) {
    slowT = 0.25;
    if (signature() !== sigKey) refreshSkillbar();
    setText(H.lvl, c.level);
    setText(H.npN, c.name + (c.title ? ' ' + c.title : ''));
    setHTML(H.npS, `<span style="color:${rarityOfRace(c.race).color}">${esc(race.name)}</span> <span style="color:${rarityOfClass(c.cls).color}">${esc(cls.name)}</span>${c.statPoints ? ` · <span class="pts">${c.statPoints} points ${kc('C')}</span>` : ''}`);
    // buffs
    let bh = '';
    for (const [id, t] of Object.entries(p.buffTimers || {})) bh += `<div class="buff"><span>${esc(id.replace(/_/g, ' ').slice(0, 10))}</span><b>${fmtTime(t)}</b></div>`;
    if (p.stealthed) bh += '<div class="buff good"><span>hidden</span></div>';
    for (const k of ['burn', 'poison', 'bleed', 'chill', 'shock', 'weaken', 'slow', 'blind']) if (p.status?.[k] > 0) bh += `<div class="buff bad"><span>${k}</span></div>`;
    if (p.frozen > 0) bh += '<div class="buff bad"><span>frozen</span></div>';
    if (c.fateScar) bh += '<div class="buff bad"><span>scar</span></div>';
    setHTML(H.buffs, bh);
    // region info
    const biome = BIOMES[G.realm === 'dungeon' ? 'deep' : G.realm === 'deep' ? 'deep' : G.biome];
    const W = G.weather;
    const regionName = G.realm === 'dungeon' ? G.dungeon?.def.name : biome?.name;
    const dl = G.realm === 'dungeon' ? G.dungeon?.def.level : G.danger;
    const dangerCls = dl > c.level + 4 ? 'danger' : '';
    setHTML(H.mmInfo, `<div class="rg">${esc(regionName || '')}</div><div><span class="${dangerCls}">Danger ${dl}</span> · ${clockString()} ${timePhase() === 'night' ? '☾' : '☀'}${G.realm !== 'dungeon' && W?.name ? ` · <span class="weather-ind ${W?.def?.danger ? 'danger' : ''}">${esc(W.name)}</span>` : ''}</div><div class="gold">${c.gold} gold</div>`);
    // tracker
    const tq = c.trackedQuest;
    let th = '';
    if (tq && c.quests[tq] && !c.quests[tq].done) {
      const def = questDef(tq);
      th += `<div class="qname">${esc(def.name)}</div>`;
      for (const o of objectiveProgress(tq)) th += `<div class="qobj ${o.done ? 'done' : ''}"><i></i><span>${esc(o.text)}${o.n !== null && o.of ? ` <b>${o.n}/${o.of}</b>` : ''}</span></div>`;
    }
    const others = c.questOrder.filter((q) => q !== tq && c.quests[q] && !c.quests[q].done).length;
    if (others) th += `<div class="other">+${others} more in your journal ${kc('J')}</div>`;
    setHTML(H.tracker, th);
    tog(H.tracker, 'hidden', !th);
    // boss bar
    const boss = G.bossActive;
    if (boss && !boss.dead && !boss.removed) {
      tog(H.boss, 'hidden', false);
      setText(H.bossName, boss.name);
      setText(H.bossSub, `Level ${boss.level}${boss.world ? ' · World Boss' : ''} · Phase ${boss.phase}`);
    } else tog(H.boss, 'hidden', true);
  }
  const boss = G.bossActive;
  if (boss && !boss.dead) { setW(H.bossFill, boss.hp / boss.maxHp); setW(H.bossLag, boss.hp / boss.maxHp); }
  // interaction prompt
  if (G.prompt !== lastPrompt) {
    lastPrompt = G.prompt;
    if (G.prompt) { H.prompt.innerHTML = `${kc(input.usingPad ? 'B' : 'F', 'big')}<span>${esc(G.prompt)}</span>`; if (H.prompt.classList.contains('hidden')) { H.prompt.classList.remove('hidden'); pop(H.prompt, 'in'); } }
    else H.prompt.classList.add('hidden');
  }
  mmT -= dt;
  if (mmT <= 0) { mmT = 0.05; drawMinimap(); }
}

// ------------------------------------------------------------------ kill streak
// kill-streak heat climbs the ember ramp, then crosses into aether
const HEAT = [[3, '#fff4dc'], [5, '#f6e39a'], [10, '#f8b848'], [20, '#ec7a2a'], [35, '#e46a72'], [60, '#e48fb0'], [100, '#c860f0']];
function heat(n) { let c = HEAT[0][1]; for (const [m, col] of HEAT) if (n >= m) c = col; return c; }
function updateStreak() {
  const s = G.streak;
  const n = s?.n || 0;
  if (n !== lastStreak) {
    if (n > lastStreak && n >= 3) {
      tog(H.streak, 'hidden', false);
      tog(H.streak, 'out', false);
      setText(H.streakN, n);
      H.streak.style.setProperty('--heat', heat(n));
      H.streak.style.setProperty('--hs', Math.min(1, n / 50).toFixed(2));
      tog(H.streak, 'hot', n >= 20);
      pop(H.streak, 'bump');
      streakMax = Math.max(0.5, s.t || 0);
    } else if (n < 3 && lastStreak >= 3) {
      tog(H.streak, 'out', true);
      clearTimeout(H.streakHide);
      H.streakHide = setTimeout(() => { if ((G.streak?.n || 0) < 3) tog(H.streak, 'hidden', true); }, 260);
    }
    lastStreak = n;
  }
  if (n >= 3) setW(H.streakT, (s.t || 0) / streakMax);
}
let shoutT = 0;
bus.on('streak', () => { if (built) updateStreak(); });
bus.on('streakShout', ({ n, name } = {}) => {
  if (!built || !name) return;
  const col = heat(n || 10);
  H.shout.innerHTML = '';
  H.shout.appendChild(pxTitle(name, uiUnit() >= 3 ? 2 : 3, { bands: ['#fff4dc', col, col, '#4a1420'] }));
  H.shout.appendChild(el('div', 'shout-n', `${n} kills`));
  H.shout.classList.remove('hidden', 'out');
  pop(H.shout, 'in');
  clearTimeout(shoutT);
  shoutT = setTimeout(() => { H.shout.classList.add('out'); shoutT = setTimeout(() => H.shout.classList.add('hidden'), 220); }, 1500);
});
// weapon swap flourish: the new slot pops, the ability icons flip in
bus.on('weaponSwap', ({ slot } = {}) => {
  if (!built) return;
  refreshSkillbar();
  const s = H.wslots[slot];
  if (s) pop(s, 'swap');
  pop(H.bar, 'flip');
});
for (const ev of ['equipped', 'kitChanged', 'statsChanged', 'skillLearned']) bus.on(ev, () => refreshSkillbar());
// fired pop for ability buttons (core/feel.js may also add it)
bus.on('abilityUsed', ({ id } = {}) => {
  if (!built || !H.kit) return;
  const k = H.kit.indexOf(id);
  if (k >= 0) pop(H.slots[k], 'fired');
});

// ------------------------------------------------------------------ minimap
function drawMinimap() {
  const cv = H.mm, g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  const W = cv.width;
  const p = G.player;
  g.fillStyle = '#090410';
  g.fillRect(0, 0, W, W);
  const scale = 0.6;
  const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
  const rot = -Math.PI / 2 - Math.atan2(fz, fx);
  g.save();
  g.translate(W / 2, W / 2);
  g.rotate(rot);
  if (G.realm === 'dungeon') {
    const d = G.dungeon;
    const s = scale * 1.6;
    for (let j = 0; j < d.h; j++) for (let i = 0; i < d.w; i++) {
      if (d.grid[j * d.w + i] !== 0) continue;
      const x = (d.ox + i * d.tile - p.pos.x) * s, z = (d.oz + j * d.tile - p.pos.z) * s;
      if (Math.abs(x) > W || Math.abs(z) > W) continue;
      g.fillStyle = '#4a3266';
      g.fillRect(x, z, d.tile * s + 0.5, d.tile * s + 0.5);
    }
    if (d.exit) dot(g, (d.exit.x - p.pos.x) * s, (d.exit.z - p.pos.z) * s, '#a8d0ec', 4);
    for (const e of G.entities) if (!e.dead && e.team === 'enemy') dot(g, (e.pos.x - p.pos.x) * s, (e.pos.z - p.pos.z) * s, e.boss ? '#ec7a2a' : '#d9765a', e.boss ? 5 : 2.5);
  } else {
    const m = MAP[G.realm];
    if (m?.ready) {
      const px = (p.pos.x + m.half) / (m.half * 2) * m.N, pz = (p.pos.z + m.half) / (m.half * 2) * m.N;
      const unitsPerPx = (m.half * 2) / m.N;
      const sz = W / scale / unitsPerPx;
      g.drawImage(m.canvas, px - sz, pz - sz, sz * 2, sz * 2, -W, -W, W * 2, W * 2);
      const fog = fogMask(G.realm);
      const cell = (m.half * 2) / FOG_N;
      g.fillStyle = 'rgba(9,4,16,0.92)';
      const r = Math.ceil(W / scale / cell) + 1;
      const ci = Math.floor((p.pos.x + m.half) / cell), cj = Math.floor((p.pos.z + m.half) / cell);
      for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
        if (i >= 0 && j >= 0 && i < FOG_N && j < FOG_N && fog[j * FOG_N + i]) continue;
        const x = (i * cell - m.half - p.pos.x) * scale, z = (j * cell - m.half - p.pos.z) * scale;
        g.fillRect(x - 0.5, z - 0.5, cell * scale + 1, cell * scale + 1);
      }
    }
    const towns = G.realm === 'deep' ? DEEP_TOWNS : TOWNS;
    for (const t of towns) mark(g, t.x, t.z, p, scale, '#f3e1b5', 5, 'town');
    for (const d of DUNGEONS) if ((d.realm || 'surface') === G.realm) mark(g, d.x, d.z, p, scale, G.char.cleared[d.id] ? '#827d82' : d.shard ? '#c860f0' : '#d9765a', 4, 'dungeon');
    for (const w of WAYSTONES) if (w.realm === G.realm) mark(g, w.x, w.z, p, scale, G.char.discovered.waystones.includes(w.id) ? '#a8d0ec' : '#3e4a5a', 3.5, 'way');
    for (const s of SHRINES) if (s.realm === G.realm) mark(g, s.x, s.z, p, scale, G.char.shrinesUsed.includes(s.id) ? '#66626a' : '#7cbca8', 3, 'shrine');
    for (const e of G.entities) {
      if (e.dead || e.removed) continue;
      const x = (e.pos.x - p.pos.x) * scale, z = (e.pos.z - p.pos.z) * scale;
      if (Math.abs(x) > W / 2 || Math.abs(z) > W / 2) continue;
      if (e.team === 'enemy') dot(g, x, z, e.boss ? '#ec7a2a' : '#d9765a', e.boss ? 5 : 2.2);
      else if (e.isNpc) dot(g, x, z, e.hunting ? '#e46a72' : '#e8c35a', 2);
      else if (e.team === 'player') dot(g, x, z, '#b4cc84', 2);
    }
    for (const q of trackedObjectiveMarkers()) if (q.realm === G.realm) questMark(g, q, p, scale, W);
  }
  g.restore();
  {
    const c = Math.floor(W / 2), f = G.player.facing;
    const nx = Math.round(Math.sin(f) * 1.4), nz = Math.round(Math.cos(f) * 1.4);
    g.fillStyle = '#140f1c'; g.fillRect(c - 2, c - 2, 5, 5); g.fillRect(c + nx * 2 - 1, c + nz * 2 - 1, 3, 3);
    g.fillStyle = '#fff4dc'; g.fillRect(c - 1, c - 1, 3, 3); g.fillRect(c + nx * 2, c + nz * 2, 1, 1);
  }
  const na = rot - Math.PI / 2;
  g.font = "8px 'Silkscreen'"; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#140f1c'; g.fillText('N', Math.round(W / 2 + Math.cos(na) * (W / 2 - 6)) + 1, Math.round(W / 2 + Math.sin(na) * (W / 2 - 6)) + 1);
  g.fillStyle = '#e8c35a'; g.fillText('N', Math.round(W / 2 + Math.cos(na) * (W / 2 - 6)), Math.round(W / 2 + Math.sin(na) * (W / 2 - 6)));
}

function dot(g, x, y, col, r) { const s = Math.max(1, Math.round(r * 0.8)); g.fillStyle = '#140f1c'; g.fillRect(Math.round(x) - s, Math.round(y) - s, s * 2 + 1, s * 2 + 1); g.fillStyle = col; g.fillRect(Math.round(x) - s + 1, Math.round(y) - s + 1, s * 2 - 1, s * 2 - 1); }
const GLYPHS = { town: [3, 3, 3], dungeon: [1, 3, 5], way: [1, 3, 1], shrine: [1, 3, 1], quest: [1, 5, 3, 5, 1] };
function glyph(g, X, Z, rows, col) {
  const h = rows.length, x0 = Math.round(X), y0 = Math.round(Z) - Math.floor(h / 2);
  g.fillStyle = '#140f1c';
  rows.forEach((w, j) => g.fillRect(x0 - (w >> 1) - 1, y0 + j - 1, w + 2, 3));
  g.fillStyle = col;
  rows.forEach((w, j) => g.fillRect(x0 - (w >> 1), y0 + j, w, 1));
}
function mark(g, x, z, p, scale, col, r, kind) {
  const X = (x - p.pos.x) * scale, Z = (z - p.pos.z) * scale;
  if (Math.abs(X) > 48 || Math.abs(Z) > 48) return;
  glyph(g, X, Z, GLYPHS[kind] || GLYPHS.way, col);
}
function questMark(g, q, p, scale, W) {
  let X = (q.x - p.pos.x) * scale, Z = (q.z - p.pos.z) * scale;
  const lim = W / 2 - 5;
  const m = Math.max(Math.abs(X), Math.abs(Z));
  if (m > lim) { X *= lim / m; Z *= lim / m; }
  glyph(g, X, Z, GLYPHS.quest, q.tracked ? '#e8c35a' : '#c99a3a');
}
