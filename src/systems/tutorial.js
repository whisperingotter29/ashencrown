// First-steps tutorial: a short guided run right after the prologue. Each step asks for one action
// (move, hit the training dummy, dodge, block, use a skill, open a menu, follow the quest arrow),
// ticks off when you do it, then rolls on. Keyboard or controller prompts swap automatically.
import { G } from '../game.js';
import { bus } from '../core/events.js';
import { input } from '../core/input.js';
import { el, esc, root, toast, banner, modalName } from '../ui/ui.js';
import { TrainingDummy } from '../entities/dummy.js';
import { abilityDef, abilityUsable } from './abilities.js';
import { questDef } from './quests.js';
import { CLASS_BY_ID } from '../data/classes.js';
import { burst } from '../render/vfx.js';
import { resolveStatic } from './collision.js';
import { groundHeight } from '../world/terrain.js';

const T = { active: false, list: [], i: 0, ui: null, dummy: null, moved: 0, last: null, hits: 0, dodges: 0, blocks: 0, skills: 0, menus: 0, t: 0, doneT: 0, startPos: null };
export const tutorial = T;

const kc = (k) => `<span class="kc">${esc(k)}</span>`;
const pad = () => !!input.usingPad;
const PAD_SLOT = ['X', 'Y', 'RB', 'D-LEFT', 'D-RIGHT', ''];

function buildSteps() {
  const p = G.player, c = G.char, cls = CLASS_BY_ID[c.cls];
  const w = p.derived.weapon;
  const bow = w.type === 'bow', xbow = w.type === 'crossbow', caster = w.type === 'staff' || w.type === 'wand';
  const slot = c.skillBar.findIndex((id) => id && abilityUsable(p, id).ok);
  const skill = slot >= 0 ? abilityDef(c.skillBar[slot]).def : null;
  const quest = questDef(c.trackedQuest);
  const list = [
    { id: 'move', title: 'On your feet', need: 8, prog: () => T.moved,
      text: () => (pad() ? `Move with the ${kc('LEFT STICK')}. Click ${kc('L3')} to sprint.` : `Walk with ${kc('W')}${kc('A')}${kc('S')}${kc('D')}. Hold ${kc('SHIFT')} to sprint.`) },
    { id: 'attack', title: 'Strike', need: 3, prog: () => T.hits, start: spawnDummy,
      text: () => {
        const btn = pad() ? kc('RT') : kc('LEFT CLICK');
        if (bow) return `Aim at the dummy and hold ${btn} to draw your bow, then let go to loose. Three hits.`;
        if (xbow) return `Aim at the dummy and press ${btn} to fire your crossbow. Three hits.`;
        if (caster) return `Aim at the dummy and press ${btn} to hurl bolts from your ${w.type}. Three hits.`;
        return `Aim at the dummy and press ${btn} to swing. Keep pressing to chain a combo. Three hits.`;
      } },
    { id: 'dodge', title: 'Roll', need: 1, prog: () => T.dodges,
      text: () => `Press ${kc(pad() ? 'A' : 'SPACE')} to dodge roll. Nothing can touch you mid-roll.` },
    { id: 'block', title: 'Guard', need: 1, prog: () => T.blocks,
      text: () => `Hold ${kc(pad() ? 'LT' : 'RIGHT CLICK')} to block. Tap it just before a blow lands to parry and stagger the attacker.` },
  ];
  if (skill) list.push({ id: 'skill', title: 'Skills', need: 1, prog: () => T.skills, slot,
    text: () => `Press ${kc(pad() ? PAD_SLOT[slot] : String(slot + 1))} to use ${esc(skill.name)}. New skills come from trainers, relics and quests.` });
  list.push({ id: 'signature', title: cls.signature.name, info: 8, sig: true,
    text: () => `${kc(pad() ? 'LB' : 'Q')} is your class signature. ${esc(cls.signature.desc)}` });
  list.push({ id: 'menus', title: 'Gear and map', need: 1, prog: () => T.menus,
    text: () => `Open your bag with ${kc(pad() ? 'R3' : 'I')} or the map with ${kc(pad() ? 'BACK' : 'M')}. ${kc(pad() ? 'START' : 'ESC')} closes it again.` });
  list.push({ id: 'quest', title: 'Your first quest', info: 10, leave: 14,
    text: () => `${quest ? `"${esc(quest.name)}" is in your tracker. ` : ''}Follow the gold arrow. Anyone with a ${kc('!')} over their head has work for you; press ${kc(pad() ? 'B' : 'E')} to talk.` });
  return list;
}

// ---------------------------------------------------------------- dummy
function spawnDummy() {
  const p = G.player;
  let spot = null;
  for (let k = 0; k < 24 && !spot; k++) {
    const a = p.facing + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.4;
    const r = k < 16 ? 4.2 : 6;
    const x = p.pos.x + Math.sin(a) * r, z = p.pos.z + Math.cos(a) * r;
    if (resolveStatic(x, z, 0.9).hit) continue;
    if (Math.abs(groundHeight(x, z) - p.pos.y) > 1.2) continue;
    spot = { x, z };
  }
  // crowded spot: put it wherever the collision system says it fits
  if (!spot) { const r = resolveStatic(p.pos.x + Math.sin(p.facing) * 4, p.pos.z + Math.cos(p.facing) * 4, 0.9); spot = { x: r.x, z: r.z }; }
  const d = new TrainingDummy(spot.x, spot.z);
  G.entities.push(d);
  T.dummy = d;
  G.tutorialTarget = d;
  burst(spot.x, d.pos.y + 1, spot.z, { count: 18, speed: 4, color: '#e8c878', color2: '#8a6a3a', additive: false, life: 0.6, size: 0.4 });
}
function removeDummy() {
  const d = T.dummy;
  if (!d) return;
  burst(d.pos.x, d.pos.y + 1.2, d.pos.z, { count: 30, speed: 6, color: '#e8c878', color2: '#c8a060', additive: false, life: 0.8, size: 0.45, gravity: -10 });
  d.removeModel();
  d.dead = true;
  T.dummy = null;
  G.tutorialTarget = null;
}

// ---------------------------------------------------------------- UI
function render(justDone = false) {
  const s = T.list[T.i];
  if (!s || !T.ui) return;
  const n = T.list.length;
  let pips = '';
  if (s.need > 1) { const v = Math.min(s.need, s.prog()); pips = `<div class="pips">${Array.from({ length: s.need }, (_, k) => `<span class="${k < v ? 'on' : ''}"></span>`).join('')}</div>`; }
  T.ui.innerHTML = `<div class="k">Training · ${T.i + 1} / ${n}</div><div class="t">${esc(s.title)}</div><div class="x">${s.text()}</div>${pips}<div class="row">${s.info ? '<button class="small next">Next</button>' : ''}<button class="small skip">Skip training</button></div>`;
  T.ui.querySelector('.skip').onclick = () => finish(true);
  const nb = T.ui.querySelector('.next');
  if (nb) nb.onclick = () => advance();
  T.ui.classList.toggle('done', justDone);
  T.padShown = pad();
  // highlight the relevant hotbar slot
  document.querySelectorAll('#hud .slot.tut-glow').forEach((e) => e.classList.remove('tut-glow'));
  const slots = document.querySelectorAll('#hud .skillbar .slot');
  if (s.slot !== undefined && slots[s.slot]) slots[s.slot].classList.add('tut-glow');
  if (s.sig) document.querySelector('#hud .slot.sig')?.classList.add('tut-glow');
}

function begin(i) {
  T.i = i;
  T.t = 0;
  const s = T.list[i];
  if (!s) return finish(false);
  if (s.start) s.start();
  if (s.leave) T.startPos = { x: G.player.pos.x, z: G.player.pos.z };
  render();
}

function advance() {
  if (!T.active || T.doneT > 0) return;
  T.doneT = 0.7;                       // brief tick-off flash before the next step
  bus.emit('tutorialStep', { step: T.list[T.i].id });
  if (T.ui) {
    T.ui.classList.remove('done'); void T.ui.offsetWidth; T.ui.classList.add('done');
    const t = T.ui.querySelector('.t'); if (t) t.innerHTML = `${esc(T.list[T.i].title)} <span class="ok">✓</span>`;
    const pips = T.ui.querySelectorAll('.pips span'); pips.forEach((p) => p.classList.add('on'));
  }
}

function finish(skipped) {
  if (!T.active) return;
  T.active = false;
  removeDummy();
  document.querySelectorAll('#hud .slot.tut-glow').forEach((e) => e.classList.remove('tut-glow'));
  if (T.ui) { T.ui.remove(); T.ui = null; }
  const c = G.char;
  c.flags.tutorialDone = true;
  if (!skipped) {
    c.consumables.hp_potion = (c.consumables.hp_potion || 0) + 2;
    banner('Training complete', 'Go forth', 'Two Healing Draughts have been added to your belt.');
    bus.emit('tutorialDone');
  } else toast('Training skipped. Press H any time to see the controls.', '', 4000);
}

// ---------------------------------------------------------------- lifecycle
export function startTutorial() {
  if (T.active || !G.player || G.char.flags.tutorialDone) return;
  Object.assign(T, { active: true, i: 0, moved: 0, hits: 0, dodges: 0, blocks: 0, skills: 0, menus: 0, doneT: 0, last: { x: G.player.pos.x, z: G.player.pos.z } });
  T.list = buildSteps();
  T.ui = el('div', 'tutorial panel');
  root().appendChild(T.ui);
  begin(0);
}
export function tutorialActive() { return T.active; }

export function updateTutorial(dt) {
  if (!T.active) return;
  const p = G.player, s = T.list[T.i];
  if (!p || !s) return;
  T.t += dt;
  // distance walked (teleports and knockbacks above 3 units in a frame don't count)
  const step = Math.hypot(p.pos.x - T.last.x, p.pos.z - T.last.z);
  if (step < 3) T.moved += step;
  T.last.x = p.pos.x; T.last.z = p.pos.z;
  const m = modalName();
  if (m === 'inventory' || m === 'map') T.menus = 1;
  if (T.ui) T.ui.style.visibility = m && m !== 'dialogue' ? 'hidden' : '';
  if (T.doneT > 0) {
    T.doneT -= dt;
    if (T.doneT <= 0 && !m) begin(T.i + 1);
    else if (T.doneT <= 0) T.doneT = 0.01;   // wait for the menu to close before moving on
    return;
  }
  let complete = false;
  if (s.need) complete = s.prog() >= s.need;
  if (s.info && T.t >= s.info) complete = true;
  if (s.leave && T.startPos && Math.hypot(p.pos.x - T.startPos.x, p.pos.z - T.startPos.z) > s.leave) complete = true;
  if (complete) advance();
  else if (s.need > 1 || T.padShown !== pad()) { const v = s.need > 1 ? s.prog() : 0; if (v !== T.lastProg || T.padShown !== pad()) { T.lastProg = v; render(); } }
}

export function initTutorial() {
  bus.on('hit', ({ src, tgt }) => { if (T.active && tgt === T.dummy && (src?.isPlayer || src?.owner === G.player)) T.hits++; });
  bus.on('dodge', () => { if (T.active) T.dodges++; });
  bus.on('blockStart', () => { if (T.active) T.blocks++; });
  bus.on('abilityUsed', () => { if (T.active) T.skills++; });
}
