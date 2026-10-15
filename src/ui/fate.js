// The Fate Table: roll two d12s for race and class, then lock in or defy fate once.
// Drawn as a pixel diorama: a round stone table in a ruined hall, candles, glowing runes, and two
// crisp pixel d12s that bounce, tumble and settle on their faces.
import { G } from '../game.js';
import { R, glowPx, setZoomStep } from '../render/renderer.js';
import { el, esc, root, toast, pxTitle } from './ui.js';
import { RACES } from '../data/races.js';
import { TOWNS } from '../data/world.js';
import { CLASSES, rareFateFor } from '../data/classes.js';
import { cam, snapCamera } from '../world/cameraRig.js';
import { atmo } from '../world/atmosphere.js';
import { setTerrainVisible } from '../world/terrain.js';
import { burst, particle, flash, ring } from '../render/vfx.js';
import { requestLight } from '../render/renderer.js';
import { bus } from '../core/events.js';
import { input } from '../core/input.js';
import { scene as world, addObject, removeObject } from '../px/scene.js';
import { view } from '../px/view.js';
import { Pix, PPU, C, light, dark, mixc, hash2, srand } from '../px/pix.js';
import { columnSprite } from '../px/sprites/buildings.js';
import { dungeonTiles } from '../px/sprites/dprops.js';

const FX = -30000, FZ = 0, TABLE_Y = 1.0;
let scene = null;

// ---------------------------------------------------------------- pixel dice
const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
function digit(p, d, x, y, c) { const g = DIGITS[d]; for (let i = 0; i < 15; i++) if (g[i] === '1') p.set(x + (i % 3), y + Math.floor(i / 3), c); }
const dieCache = new Map();
// a top-down d12: a pentagon face ringed by five facets, the face value printed in the middle
function dieSprite(body, ink, value) {
  const key = body + ink + value;
  let s = dieCache.get(key);
  if (s) return s;
  const p = new Pix(25, 25); p.ox = 12; p.oy = 12;
  const c = C(body), cx = 12.5, cy = 12.5;
  const ring = (r, rot) => Array.from({ length: 5 }, (_, i) => { const a = rot + (i / 5) * Math.PI * 2 - Math.PI / 2; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
  const outer = Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2 - Math.PI / 2; return [cx + Math.cos(a) * 11.5, cy + Math.sin(a) * 11.5]; });
  p.poly(outer, dark(c, 0.7));
  const inner = ring(7, 0);
  // facets: shade by their direction (top-left lit)
  for (let i = 0; i < 5; i++) {
    const a = inner[i], b = inner[(i + 1) % 5], o = outer[(i * 2 + 1) % 10];
    const mid = ((i + 0.5) / 5) * Math.PI * 2 - Math.PI / 2;
    const l = -Math.cos(mid) * 0.5 - Math.sin(mid) * 0.8;
    p.poly([a, outer[i * 2], o, outer[(i * 2 + 2) % 10], b], l > 0.4 ? light(c, 1.2) : l > -0.2 ? c : dark(c, 0.8));
  }
  p.poly(inner, light(c, 1.1));
  for (let i = 0; i < 5; i++) p.line(inner[i][0], inner[i][1], inner[(i + 1) % 5][0], inner[(i + 1) % 5][1], light(c, 1.35));
  const ic = C(ink);
  if (value >= 10) { digit(p, 1, 9, 10, ic); digit(p, value % 10, 13, 10, ic); }
  else digit(p, value, 11, 10, ic);
  if (value === 6 || value === 9) p.rect(11, 16, 3, 1, ic);
  p.outline();
  s = { pix: p };
  dieCache.set(key, s);
  return s;
}

// ---------------------------------------------------------------- the hall diorama
const now = () => performance.now() / 1000;
function tableSprite() {
  const R0 = 44, H = 12;
  const p = new Pix(R0 * 2 + 8, R0 * 2 + H + 8); p.ox = R0 + 4; p.oy = R0 + 4 + H;
  const cx = p.ox, top = p.oy - H;
  // pedestal side, then the slab top with a brass rim and the inlaid circle of fate
  for (let y = top; y <= top + H; y++) for (let x = cx - R0 + 3; x <= cx + R0 - 3; x++) { const u = (x - cx) / R0; if (y - top > Math.sqrt(Math.max(0, 1 - u * u)) * 6 + H - 2) continue; p.set(x, y, u < -0.4 ? '#5a4c40' : u > 0.5 ? '#2e2620' : '#4a3e34'); }
  p.ellipse(cx, top, R0, R0 * 0.62, '#8a6a3a');
  p.ellipse(cx, top - 1, R0 - 2, R0 * 0.62 - 2, '#5a4c40');
  p.ellipse(cx, top - 1, R0 - 9, R0 * 0.62 - 7, '#2a1a14');
  for (let i = 0; i < 260; i++) { const x = cx + (hash2(i, 1, 3) - 0.5) * R0 * 1.8, y = top + (hash2(i, 2, 3) - 0.5) * R0 * 1.1; if (p.a(x, y) && p.get(Math.round(x), Math.round(y))[0] === 0x5a) p.set(x, y, '#64554a'); }
  p.outline();
  return { pix: p };
}

function buildHall() {
  const objs = [];
  const add = (o) => { objs.push(o); addObject(o); return o; };
  const tiles = dungeonTiles({ name: 'fatehall', floor: '#3a3230', wall: '#2a2422', accent: '#6a5048', layout: 'rooms' }, 36, 26);
  const prevGround = world.ground;
  world.ground = (ctx) => {
    ctx.fillStyle = '#0c0a0e'; ctx.fillRect(0, 0, view.W, view.H);
    const ox = FX * PPU - view.x0, oy = FZ * PPU - view.y0;
    for (let j = -6; j <= 6; j++) for (let i = -6; i <= 6; i++) {
      if (i * i + j * j > 34) continue;
      const h = ((i * 73856093) ^ (j * 19349663)) >>> 0;
      ctx.drawImage(tiles.floor[h % 6].canvas(), Math.round(ox + i * 36 - 18), Math.round(oy + j * 36 - 18));
    }
  };
  // ring of ruined columns
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const spr = columnSprite(i % 3 === 0 ? 5 : 11, '#6a6058', i % 3 === 0 ? 0.5 : 0, i);
    const x = FX + Math.cos(a) * 11, z = FZ + Math.sin(a) * 11;
    add({ sortZ: z, draw(ctx) { ctx.drawImage(spr.pix.canvas(), Math.round(x * PPU - view.x0) - spr.pix.ox, Math.round(z * PPU - view.y0) - spr.pix.oy); } });
  }
  // the table and its glowing runes
  const tbl = tableSprite();
  add({
    sortZ: FZ - 3.2,
    shadow(ctx) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(Math.round(FX * PPU - view.x0) + 4, Math.round(FZ * PPU - view.y0) + 4, 48, 30, 0, 0, Math.PI * 2); ctx.fill(); },
    draw(ctx) { ctx.drawImage(tbl.pix.canvas(), Math.round(FX * PPU - view.x0) - tbl.pix.ox, Math.round(FZ * PPU - view.y0) - tbl.pix.oy); },
    emissive(ctx) {
      const cx = Math.round(FX * PPU - view.x0), cy = Math.round(FZ * PPU - view.y0) - TABLE_Y * PPU - 1;
      const t = now();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + t * 0.05;
        ctx.globalAlpha = 0.65 + Math.sin(t * 2 + i) * 0.3;
        ctx.fillStyle = '#ff9040';
        ctx.fillRect(Math.round(cx + Math.cos(a) * 30) - 1, Math.round(cy + Math.sin(a) * 19), 3, 1);
        ctx.fillRect(Math.round(cx + Math.cos(a) * 30), Math.round(cy + Math.sin(a) * 19) - 1, 1, 3);
      }
      ctx.globalAlpha = 1;
    },
  });
  // candles on the rim
  const candles = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    const x = Math.cos(a) * 3.85, z = Math.sin(a) * 3.85 * 0.62, h = 4 + (i % 3) * 2;
    candles.push({ x, y: TABLE_Y + h / 10 + 0.15, z });
    add({
      sortZ: FZ + z + 0.01,
      draw(ctx) { const px = Math.round((FX + x) * PPU - view.x0), py = Math.round((FZ + z) * PPU - view.y0) - TABLE_Y * PPU; ctx.fillStyle = '#e8dcc0'; ctx.fillRect(px - 1, py - h, 3, h); ctx.fillStyle = '#c8bca0'; ctx.fillRect(px + 1, py - h, 1, h); },
      emissive(ctx) {
        const px = Math.round((FX + x) * PPU - view.x0), py = Math.round((FZ + z) * PPU - view.y0) - TABLE_Y * PPU - h;
        const f = Math.sin(now() * 13 + x) > 0.2 ? 1 : 0;
        ctx.fillStyle = '#ff9030'; ctx.fillRect(px, py - 3 - f, 1, 3 + f);
        ctx.fillStyle = '#fff0b0'; ctx.fillRect(px, py - 2, 1, 2);
      },
      glow(ctx) { glowPx(ctx, (FX + x) * PPU - view.x0, (FZ + z) * PPU - view.y0 - TABLE_Y * PPU - h - 2, '#ffb040', 7, 0.5); },
    });
  }
  return { objs, candles, prevGround };
}

// a die on the table: world (x, z) on the slab, h = height above the slab
function dieObj(d) {
  return {
    sortZ: FZ + 5,
    shadow(ctx) {
      const px = Math.round((FX + d.x) * PPU - view.x0), py = Math.round((FZ + d.z) * PPU - view.y0) - TABLE_Y * PPU;
      const k = Math.max(0.4, 1 - d.h * 0.25);
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(px - Math.round(9 * k), py + 5, Math.round(18 * k), 3);
    },
    draw(ctx) {
      const px = Math.round((FX + d.x) * PPU - view.x0), py = Math.round((FZ + d.z) * PPU - view.y0 - (TABLE_Y + d.h) * PPU);
      const spr = dieSprite(d.body, d.ink, d.face);
      ctx.save(); ctx.translate(px, py); ctx.rotate(Math.round(d.rot / (Math.PI / 8)) * (Math.PI / 8));
      ctx.drawImage(spr.pix.canvas(), -spr.pix.ox, -spr.pix.oy);
      ctx.restore();
    },
  };
}

export function startFateTable(onDone) {
  setTerrainVisible(false);
  atmo.indoor = true;
  atmo.indoorCfg = { fog: '#0a0606', ambient: '#3a2a30', light: '#ff9040' };
  const hall = buildHall();
  const raceDie = { x: -1.2, z: 0.3, h: 0.1, rot: 0, face: 12, body: '#8a2018', ink: '#ffe8c0' };
  const classDie = { x: 1.2, z: 0.3, h: 0.1, rot: 0, face: 12, body: '#d0a040', ink: '#2a1408' };
  const dieObjs = [addObject(dieObj(raceDie)), addObject(dieObj(classDie))];
  scene = { hall, candles: hall.candles, raceDie, classDie, dieObjs, t: 0, rolls: [], rolling: false, state: 'name', rerolled: false, onDone };
  scene.prevZoom = R.zoomStep;
  setZoomStep(2);
  cam.cinematic = { x: FX, z: FZ - 0.5, speed: 2.2 };
  // cut straight to the hall instead of panning across 30k units of darkness
  snapCamera({ x: FX, y: 0, z: FZ - 0.5 });
  G.mode = 'fate';
  buildFateUI();
}

// ------------------------------------------------------------------ UI
let ui = null;
function buildFateUI() {
  ui = el('div', 'fate-ui');
  ui.innerHTML = `<div class="fate-head"><div class="t"></div><div class="s">Your blood and your calling are already written in the bones. Roll them.</div></div>`;
  ui.querySelector('.fate-head .t').appendChild(pxTitle('The Fate Table', 3));
  ui.actions = el('div', 'fate-actions');
  ui.appendChild(ui.actions);
  root().appendChild(ui);
  showNameStep();
}

function showNameStep() {
  const a = ui.actions;
  a.innerHTML = '';
  const inp = el('input', 'name-input interactive');
  inp.placeholder = 'Name your wanderer';
  inp.maxLength = 18;
  inp.value = ['Kael', 'Ilsa', 'Varek', 'Mira', 'Oren', 'Sefa', 'Taryn', 'Dusk'][Math.floor(Math.random() * 8)];
  a.appendChild(inp);
  const b = el('button', 'primary', 'Roll the Fates');
  b.onclick = () => {
    scene.name = (inp.value.trim() || 'Wanderer').slice(0, 18);
    input.enabled = true;
    rollDice(true, true);
  };
  a.appendChild(b);
  a.appendChild(el('div', 'note', 'Two twelve-sided dice: crimson for your <b>race</b>, gold for your <b>class</b>. You may defy fate once, at a cost, or accept it and be rewarded.'));
  inp.focus();
}

function rollDice(rRace, rClass) {
  scene.rolling = true;
  ui.actions.innerHTML = '<div class="note">The bones tumble...</div>';
  if (ui.cards) { ui.cards.forEach((c) => c.remove()); ui.cards = null; }
  if (ui.rare) { ui.rare.remove(); ui.rare = null; }
  const dice = [];
  if (rRace) { scene.race = 1 + Math.floor(Math.random() * 12); dice.push([scene.raceDie, scene.race, -1.2]); }
  if (rClass) { scene.cls = 1 + Math.floor(Math.random() * 12); dice.push([scene.classDie, scene.cls, 1.2]); }
  scene.rolls = dice.map(([die, value, x], i) => {
    die.x = -3.4 + i * 0.4; die.z = 1.6; die.h = 3 + i * 0.4;
    return { die, value, vx: 3.2 + Math.random() * 1.2 + x * 0.4, vz: -1.4 - Math.random() * 0.6, vh: 1.2, spin: (Math.random() < 0.5 ? -1 : 1) * (14 + Math.random() * 8), t: -i * 0.18, settled: false, endX: x, faceT: 0 };
  });
  bus.emit('diceRoll');
}

export function updateFate(dt) {
  if (!scene) return;
  scene.t += dt;
  for (const c of scene.candles) {
    requestLight(FX + c.x, c.y + 0.3, FZ + c.z, '#ffa040', 3.5 + Math.sin(scene.t * 9 + c.x) * 0.6, 7);
    if (Math.random() < dt * 3) particle({ x: FX + c.x, y: c.y + 0.4, z: FZ + c.z, vy: 0.8, life: 0.8, size: 0.12, color: '#ffb060' });
  }
  requestLight(FX, TABLE_Y + 6, FZ, '#ffd8a0', 18, 18);
  if (Math.random() < dt * 14) particle({ x: FX + (Math.random() - 0.5) * 16, y: 0.2, z: FZ + (Math.random() - 0.5) * 16, vx: (Math.random() - 0.5) * 0.4, vy: 0.6 + Math.random(), vz: (Math.random() - 0.5) * 0.4, life: 5, size: 0.14, color: '#ff8030', wobble: 1.2 });
  if (scene.rolling) {
    let allDone = true;
    for (const r of scene.rolls) {
      r.t += dt;
      if (r.t < 0) { allDone = false; continue; }
      const d = r.die;
      if (r.settled) continue;
      allDone = false;
      r.vh -= 22 * dt;
      d.x += r.vx * dt; d.z += r.vz * dt; d.h += r.vh * dt;
      if (d.h < 0) {
        d.h = 0;
        if (Math.abs(r.vh) > 1.5) { bus.emit('diceClack', { strength: Math.min(1, Math.abs(r.vh) / 8) }); burst(FX + d.x, TABLE_Y + 0.1, FZ + d.z, { count: 6, speed: 2, color: '#e0c090', life: 0.4, additive: false, size: 0.15 }); }
        r.vh = -r.vh * 0.42; r.vx *= 0.78; r.vz *= 0.78; r.spin *= 0.7;
      }
      // keep the bones on the slab
      const rr = Math.hypot(d.x / 3.0, d.z / 1.9);
      if (rr > 1) { d.x /= rr; d.z /= rr; r.vx *= -0.5; r.vz *= -0.5; }
      // tumble: spin and flicker through faces, slowing toward the result
      d.rot += r.spin * dt;
      r.faceT -= dt;
      if (r.faceT <= 0 && r.t < 1.9) { d.face = 1 + Math.floor(Math.random() * 12); r.faceT = 0.04 + r.t * 0.05; }
      if (r.t > 1.2) { d.x += (r.endX - d.x) * dt * 2; d.z += (0.3 - d.z) * dt * 2; d.rot += (Math.round(d.rot / (Math.PI * 2)) * Math.PI * 2 - d.rot) * dt * 3; }
      if (r.t > 2.2) {
        d.face = r.value; d.h = 0; d.rot = 0; r.settled = true;
        ring(FX + d.x, TABLE_Y + 0.05, FZ + d.z, { radius: 1.2, color: d === scene.raceDie ? '#ff4030' : '#ffd060', dur: 0.6 });
        flash(FX + d.x, TABLE_Y + 1, FZ + d.z, d === scene.raceDie ? '#ff4030' : '#ffd060', 12, 6, 0.4);
        bus.emit('diceSettle');
      }
    }
    if (allDone) { scene.rolling = false; showResult(); }
  } else {
    for (const d of [scene.raceDie, scene.classDie]) d.h = 0.05 + (Math.sin(scene.t * 1.5 + d.x) > 0.6 ? 0.1 : 0);
  }
}

function card(side, kicker, name, tag, desc, traits) {
  const cdv = el('div', `fate-card panel ${side}`);
  cdv.innerHTML = `<div class="die">${kicker}</div><div class="nm">${esc(name)}</div><div class="tag">${esc(tag)}</div><div class="rule"></div><div class="desc">${esc(desc)}</div>${traits.map((t) => `<div class="trait"><b>${esc(t.name)}.</b> ${esc(t.desc)}</div>`).join('')}`;
  return cdv;
}

function showResult() {
  const race = RACES[scene.race - 1], cls = CLASSES[scene.cls - 1];
  const rc = card('left', `CRIMSON DIE · ${scene.race}`, race.name, race.tagline, race.desc, [...race.traits, { name: 'Homeland', desc: TOWNS.find((t) => t.id === race.home)?.name || race.home }]);
  const cc = card('right', `GOLDEN DIE · ${scene.cls}`, cls.name, cls.tagline, cls.desc, [{ name: 'Signature (Q): ' + cls.signature.name, desc: cls.signature.desc }, { name: 'Kit', desc: `${cls.kit.mainhand}${cls.kit.offhand ? ' & shield' : ''}, ${cls.kit.armor} armour${cls.kit.tome ? ', a spellbook' : ''}` }]);
  ui.appendChild(rc); ui.appendChild(cc);
  ui.cards = [rc, cc];
  const rare = rareFateFor(race.id, cls.id);
  const doubles = scene.race === scene.cls;
  scene.rare = rare; scene.doubles = doubles;
  if (rare || doubles) {
    const r = el('div', 'fate-rare panel');
    r.innerHTML = rare ? `<div class="k">A RARE FATE</div><div class="n">${esc(rare.title)}</div><div class="d">${esc(rare.desc)}</div>` : '';
    if (doubles) r.innerHTML += `<div class="k" style="margin-top:6px">DOUBLES · OMEN OF THE CROWN</div><div class="d">Both dice show ${scene.race}. The crown remembers you: +2 to every attribute and an Epic heirloom.</div>`;
    ui.appendChild(r);
    ui.rare = r;
    flash(FX, TABLE_Y + 2, FZ, '#ffa040', 40, 14, 1.2);
    burst(FX, TABLE_Y + 0.5, FZ, { count: 80, speed: 6, color: '#ffd080', color2: '#ff6020', life: 1.5, up: 1.4 });
    bus.emit('rareFate');
  }
  const a = ui.actions;
  a.innerHTML = '';
  if (!scene.rerolled) {
    const lock = el('button', 'primary', 'Lock in my fate');
    lock.onclick = () => finish(true);
    const row = el('div', 'row');
    const rr = el('button', '', 'Defy: reroll race');
    rr.onclick = () => { scene.rerolled = true; rollDice(true, false); };
    const rc2 = el('button', '', 'Defy: reroll class');
    rc2.onclick = () => { scene.rerolled = true; rollDice(false, true); };
    const rb = el('button', '', 'Defy: reroll both');
    rb.onclick = () => { scene.rerolled = true; rollDice(true, true); };
    row.append(rr, rc2, rb);
    a.append(lock, row);
    a.appendChild(el('div', 'note', '<b>Lock in</b> and fate rewards you: +3 attribute points, 100 gold, a Rare weapon and the title "the Unbending".<br><b>Defy</b> once and fate scars you: −10% max health until you reach level 20.'));
  } else {
    const ok = el('button', 'primary', 'Accept what fate gives');
    ok.onclick = () => finish(false);
    a.appendChild(ok);
    a.appendChild(el('div', 'note', 'You have spent your one defiance. The Fate Scar is yours.'));
  }
}

function finish(locked) {
  const race = RACES[scene.race - 1], cls = CLASSES[scene.cls - 1];
  const result = { name: scene.name, race: race.id, cls: cls.id, fateLocked: locked, fateScar: scene.rerolled, rareFate: scene.rare, doubles: scene.doubles };
  ui.remove(); ui = null;
  const done = scene.onDone;
  cam.cinematic = { x: FX, z: FZ, speed: 1.2 };
  setZoomStep(3);
  bus.emit('fateSealed', result);
  setTimeout(() => {
    for (const o of scene.hall.objs) removeObject(o);
    for (const o of scene.dieObjs) removeObject(o);
    world.ground = scene.hall.prevGround;
    setZoomStep(scene.prevZoom || 0);
    scene = null;
    done(result);
  }, 1600);
}

export function fateActive() { return !!scene; }
