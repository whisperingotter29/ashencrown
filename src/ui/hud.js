// In-game HUD: health/mana orbs, stamina & class resource, skill bar, minimap, quest tracker,
// buffs, boss bar, interaction prompt.
import { G } from '../game.js';
import { el, esc, root, bindTip, fmtTime, uiUnit } from './ui.js';
import { CLASS_BY_ID } from '../data/classes.js';
import { RACE_BY_ID } from '../data/races.js';
import { abilityDef, abilityUsable } from '../systems/abilities.js';
import { skillIcon, simpleIcon } from './icons.js';
import { xpToNext } from '../systems/stats.js';
import { MAP, fogMask, FOG_N } from '../world/mapdata.js';
import { cam } from '../world/cameraRig.js';
import { TOWNS, DEEP_TOWNS, DUNGEONS, WAYSTONES, SHRINES, BIOMES } from '../data/world.js';
import { questDef, objectiveProgress, trackedObjectiveMarkers } from '../systems/quests.js';
import { clockString, timePhase } from '../world/atmosphere.js';
import { beatPhase } from '../systems/classMech.js';
import { CONSUMABLES } from '../data/items.js';
import { SPELLS } from '../data/tomes.js';
import { C, mixc, light, dark, toHex } from '../px/pix.js';
import { drawText, textWidth } from '../px/font.js';

const H = {};
let built = false;

export function buildHud() {
  if (built) { H.root.classList.remove('hidden'); return; }
  built = true;
  const r = el('div', '', '');
  r.id = 'hud';
  H.root = r;
  // top-left: name, buffs
  const tl = el('div', 'hud-tl');
  H.name = el('div', 'charname');
  H.buffs = el('div', 'buffs');
  tl.append(H.name, H.buffs);
  r.appendChild(tl);
  // top-right: minimap, info, tracker
  const tr = el('div', 'hud-tr');
  const mm = el('div', 'minimap');
  H.mm = document.createElement('canvas');
  H.mm.width = H.mm.height = 92;
  mm.appendChild(H.mm);
  H.mmInfo = el('div', 'mm-info');
  H.tracker = el('div', 'tracker');
  tr.append(mm, H.mmInfo, H.tracker);
  r.appendChild(tr);
  // boss bar
  H.boss = el('div', 'bossbar hidden', '<div class="name"></div><div class="sub"></div><div class="bar"><div class="lag"></div><div class="fill"></div><div class="ticks"></div></div>');
  r.appendChild(H.boss);
  // bottom: orbs + bars + skills
  const bot = el('div', 'hud-bottom');
  H.hp = orb('hp');
  H.mp = orb('mp');
  const mid = el('div', 'center-col');
  H.res = el('div', 'res-bar', '<div class="label"></div><div class="fill"></div>');
  H.pips = el('div', 'res-pips');
  H.stam = el('div', 'stam', '<div class="lag"></div><div class="fill"></div>');
  H.stamLag = 1;
  H.bar = el('div', 'skillbar interactive');
  H.slots = [];
  const keys = ['1', '2', '3', '4', '5', '6'];
  for (let i = 0; i < 6; i++) {
    const s = el('div', 'slot', `<span class="key">${keys[i]}</span><div class="ic"></div><div class="cd" style="transform:scaleY(0)"></div><div class="cdt"></div><span class="cost"></span>`);
    H.bar.appendChild(s);
    H.slots.push(s);
    bindTip(s, () => slotTip(i));
  }
  H.sig = el('div', 'slot sig', `<span class="key">Q</span><div class="ic"></div><div class="cd" style="transform:scaleY(0)"></div><div class="cdt"></div>`);
  bindTip(H.sig, () => { const c = CLASS_BY_ID[G.char.cls]; return `<div class="tname gold">${esc(c.signature.name)}</div><div class="ttype">Class signature · ${esc(c.resource.name)}</div><div style="margin-top:6px">${esc(c.signature.desc)}</div><div class="muted" style="margin-top:6px;font-size:var(--fs-1)">${esc(c.mechanic)}</div>`; });
  H.bar.appendChild(H.sig);
  H.potHp = el('div', 'slot', `<span class="key">F</span><div class="ic"></div><span class="count"></span>`);
  H.potMp = el('div', 'slot', `<span class="key">G</span><div class="ic"></div><span class="count"></span>`);
  H.potHp.querySelector('.ic').innerHTML = `<img src="${simpleIcon('potion', '#d03030')}" width="40" height="40">`;
  H.potMp.querySelector('.ic').innerHTML = `<img src="${simpleIcon('potion', '#3050d0')}" width="40" height="40">`;
  bindTip(H.potHp, () => `<div class="tname">Healing Draught</div><div>${esc(CONSUMABLES.hp_potion.desc)}</div>`);
  bindTip(H.potMp, () => `<div class="tname">Mana Tincture</div><div>${esc(CONSUMABLES.mana_potion.desc)}</div>`);
  H.bar.append(H.potHp, H.potMp);
  mid.append(H.res, H.pips, H.stam, H.bar);
  bot.append(H.hp.node, mid, H.mp.node);
  r.appendChild(bot);
  H.xp = el('div', 'xpbar', '<div class="fill"></div>');
  r.appendChild(H.xp);
  H.prompt = el('div', 'prompt hidden');
  r.appendChild(H.prompt);
  H.beat = el('div', 'beat hidden', '<div class="center"></div><div class="dot"></div><div class="dot"></div>');
  r.appendChild(H.beat);
  root().appendChild(r);
  refreshSkillbar();
}

export function hideHud() { if (H.root) H.root.classList.add('hidden'); }

// Pixel-art orb: a 34px glass globe drawn pixel by pixel and scaled up with nearest-neighbour.
// Liquid level sloshes, bubbles rise, the value is printed in the pixel font.
const ORB_N = 34;
const ORB_COLS = { hp: ['#ff7058', '#c8281e', '#5a0a08'], mp: ['#80b8ff', '#2a50c8', '#0a1648'] };
function orb(kind) {
  const node = el('div', 'orb px ' + kind);
  const cv = document.createElement('canvas');
  cv.width = cv.height = ORB_N;
  node.appendChild(cv);
  const ctx = cv.getContext('2d');
  return { node, kind, ctx, img: ctx.createImageData(ORB_N, ORB_N), key: '' };
}
function drawOrb(o, frac, value, shield, t) {
  const tick = Math.floor(t * 8);
  const key = `${Math.round(frac * 60)}|${value}|${shield ? 1 : 0}|${tick}`;
  if (key === o.key) return;
  o.key = key;
  const N = ORB_N, d = o.img.data, c = N / 2, R = 13.6;
  const [hi, mid, lo] = ORB_COLS[o.kind].map((h) => C(h));
  const sink = { px(x, y, col) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= N || y >= N) return; const i = (y * N + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; } };
  d.fill(0);
  const surf = Math.round(c + R - frac * R * 2);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c, r = Math.hypot(dx, dy);
    if (r > R + 3) continue;
    const ang = Math.atan2(dy, dx);
    if (r > R + 2) sink.px(x, y, [18, 12, 10]);
    else if (r > R) {
      // metal rim: lit from the top-left
      const l = -Math.cos(ang + Math.PI * 0.25);
      sink.px(x, y, shield ? (l > 0.3 ? [220, 240, 255] : [130, 180, 230]) : l > 0.45 ? [240, 208, 128] : l > -0.35 ? [176, 138, 58] : [106, 74, 26]);
    } else {
      const wave = Math.round(Math.sin(x * 0.55 + t * 3.2) * (frac > 0.02 && frac < 0.98 ? 0.7 : 0));
      const sy = surf + wave;
      if (y > sy) {
        const depth = (y - sy) / Math.max(1, c + R - sy);
        const edge = r > R - 2.2;
        sink.px(x, y, edge ? lo : depth < 0.35 && dx < 2 ? mid : depth > 0.7 ? lo : mid);
        if (!edge && dx < -3 && dx > -7 && depth > 0.1 && depth < 0.7) sink.px(x, y, mixc(mid, hi, 0.5));
      } else if (y === sy && frac > 0.01) sink.px(x, y, hi);
      else sink.px(x, y, r > R - 1.5 ? [36, 22, 26] : [20, 12, 16]);
    }
  }
  // bubbles drifting up through the liquid
  for (let b = 0; b < 3; b++) {
    const bx = Math.round(c - 6 + b * 6 + Math.sin(t * 2 + b) * 1.2), by = Math.round(c + R - 2 - ((t * 6 + b * 9) % (R * 2)));
    if (by > surf + 1) sink.px(bx, by, hi);
  }
  // glass glint
  for (const [gx, gy] of [[10, 7], [9, 8], [8, 9], [8, 10], [7, 11], [12, 6], [13, 6]]) sink.px(gx, gy, [255, 255, 255]);
  const txt = String(value);
  drawText(sink, Math.round(c - textWidth(txt) / 2), Math.round(c - 2), txt, [255, 255, 255], 1, [20, 10, 12]);
  o.ctx.putImageData(o.img, 0, 0);
}

function slotTip(i) {
  const id = G.char.skillBar[i];
  if (!id) return '<div class="muted">Empty slot. Open Skills (K) to assign abilities.</div>';
  const a = abilityDef(id);
  if (!a) return '';
  const d = a.def;
  const chk = abilityUsable(G.player, id);
  let cost = a.kind === 'spell' ? (d.hpCost ? `${Math.round(d.hpCost * 100)}% health` : `${d.cost} mana${d.channel ? '/s' : ''}`) : `${d.stamina || 0} stamina`;
  return `<div class="tname gold">${esc(d.name)}</div><div class="ttype">${a.kind === 'spell' ? 'Spell' : a.kind === 'combo' ? 'Combo skill' : 'Martial skill'} · ${cost} · ${d.cd || 0}s cooldown</div><div style="margin-top:6px">${esc(d.desc)}</div>${chk.ok || chk.cd ? '' : `<div class="req bad" style="margin-top:6px">${esc(chk.why)}</div>`}`;
}

export function refreshSkillbar() {
  if (!built || !G.char) return;
  G.char.skillBar.forEach((id, i) => {
    const s = H.slots[i];
    const ic = s.querySelector('.ic');
    if (!id) { ic.innerHTML = ''; ic.style.background = ''; s.querySelector('.cost').textContent = ''; return; }
    const a = abilityDef(id);
    if (!a) return;
    ic.innerHTML = `<img src="${skillIcon(a.def, a.def.element)}" width="42" height="42">`;
    s.querySelector('.cost').textContent = a.kind === 'spell' ? (a.def.hpCost ? '♥' : a.def.cost) : '';
  });
  const c = CLASS_BY_ID[G.char.cls];
  H.sig.querySelector('.ic').innerHTML = `<img src="${skillIcon({ id: 'sig_' + c.id, type: 'buff' }, 'holy')}" width="48" height="48">`;
  H.res.querySelector('.label').textContent = c.resource.name;
  H.res.querySelector('.fill').style.background = `linear-gradient(180deg, ${toHex(light(c.resource.color, 1.4))} 0 34%, ${c.resource.color} 34% 72%, ${toHex(dark(c.resource.color, 0.6))} 72%)`;
  H.res.classList.toggle('hidden', !!c.resource.discrete);
  H.pips.classList.toggle('hidden', !c.resource.discrete);
  if (c.resource.discrete) { H.pips.innerHTML = ''; for (let i = 0; i < c.resource.max; i++) H.pips.appendChild(el('span', '')); H.pips.style.color = c.resource.color; }
}

let mmT = 0, slowT = 0;
export function updateHud(dt) {
  if (!built || !G.player || !G.char) return;
  const p = G.player, c = G.char;
  const race = RACE_BY_ID[c.race], cls = CLASS_BY_ID[c.cls];
  // orbs
  const sh = p.buffs.shield || 0;
  drawOrb(H.hp, Math.max(0, Math.min(1, p.hp / p.maxHp)), Math.ceil(Math.max(0, p.hp)), sh > 1, G.realTime);
  drawOrb(H.mp, Math.max(0, Math.min(1, p.mana / p.maxMana)), Math.floor(p.mana), false, G.realTime + 1.7);
  // stamina: width snapped to whole UI pixels so it glides smoothly; a pale lag bar trails
  // behind spending, and the bar blinks while winded
  {
    const u = uiUnit(), cells = 210;
    const f = Math.max(0, Math.min(1, p.stamina / p.maxStamina));
    H.stamLag = f > H.stamLag ? f : Math.max(f, H.stamLag - dt * 0.6);
    H.stam.querySelector('.fill').style.width = `${Math.round(f * cells) * u}px`;
    H.stam.querySelector('.lag').style.width = `${Math.round(H.stamLag * cells) * u}px`;
    H.stam.classList.toggle('winded', !!p.winded);
    H.stam.classList.toggle('sprint', !!p.sprinting);
  }
  const rv = p.resource || 0;
  if (cls.resource.discrete) { [...H.pips.children].forEach((s, i) => { s.classList.toggle('on', i < rv); s.style.background = i < rv ? cls.resource.color : ''; }); }
  else H.res.querySelector('.fill').style.width = `${(rv / p.resourceMax) * 100}%`;
  // cooldowns
  c.skillBar.forEach((id, i) => {
    const s = H.slots[i];
    if (!id) return;
    const cd = p.cooldowns[id] || 0;
    const a = abilityDef(id);
    const max = a?.def.cd || 1;
    s.querySelector('.cd').style.transform = `scaleY(${Math.max(0, Math.min(1, cd / max))})`;
    s.querySelector('.cdt').textContent = cd > 0.05 ? (cd < 1 ? cd.toFixed(1) : Math.ceil(cd)) : '';
    // pop when an ability comes off cooldown
    if (s._cd > 0.05 && cd <= 0.05) { s.classList.remove('ready'); void s.offsetWidth; s.classList.add('ready'); }
    s._cd = cd;
    if (slowT <= 0) { const u = abilityUsable(p, id); s.classList.toggle('locked', !u.ok && !u.cd); }
  });
  const scd = p.cooldowns.signature || 0;
  H.sig.querySelector('.cd').style.transform = `scaleY(${Math.max(0, Math.min(1, scd / 1.5))})`;
  H.potHp.querySelector('.count').textContent = c.consumables.hp_potion || 0;
  H.potMp.querySelector('.count').textContent = c.consumables.mana_potion || 0;
  H.xp.querySelector('.fill').style.width = `${(c.xp / xpToNext(c.level)) * 100}%`;
  // bard beat
  if (c.cls === 'bard') {
    H.beat.classList.remove('hidden');
    const ph = beatPhase();
    const dots = H.beat.querySelectorAll('.dot');
    dots[0].style.left = `${(1 - ph) * 50 + 50 - 7}%`;
    dots[1].style.left = `${ph * 50 - 7}%`;
    dots[0].style.opacity = dots[1].style.opacity = ph < 0.18 || ph > 0.86 ? 1 : 0.5;
  }
  slowT -= dt;
  if (slowT <= 0) {
    slowT = 0.25;
    H.name.innerHTML = `${esc(c.name)}${c.title ? ` <span class="muted" style="font-size:var(--fs-1)">${esc(c.title)}</span>` : ''}<small>Level ${c.level} ${esc(race.name)} ${esc(cls.name)}${c.statPoints ? ` · <span class="gold">${c.statPoints} stat points (C)</span>` : ''}</small>`;
    // buffs
    let bh = '';
    for (const [id, t] of Object.entries(p.buffTimers)) bh += `<div class="buff">${esc(id.replace(/_/g, ' ').slice(0, 10))}<div class="t">${fmtTime(t)}</div></div>`;
    if (p.stealthed) bh += '<div class="buff">hidden</div>';
    for (const k of ['burn', 'poison', 'bleed', 'chill', 'shock', 'weaken', 'slow', 'blind']) if (p.status[k] > 0) bh += `<div class="buff" style="border-color:#a03020;color:#ff9080">${k}</div>`;
    if (p.frozen > 0) bh += '<div class="buff" style="color:#a0e0ff">frozen</div>';
    if (c.fateScar) bh += '<div class="buff" style="color:#ff8060" title="Fate Scar: -10% max health">scar</div>';
    H.buffs.innerHTML = bh;
    // region info
    const biome = BIOMES[G.realm === 'dungeon' ? 'deep' : G.realm === 'deep' ? 'deep' : G.biome];
    const W = G.weather;
    const regionName = G.realm === 'dungeon' ? G.dungeon?.def.name : biome?.name;
    const dl = G.realm === 'dungeon' ? G.dungeon?.def.level : G.danger;
    const dangerCls = dl > c.level + 4 ? 'danger' : '';
    H.mmInfo.innerHTML = `${esc(regionName || '')}<br><span class="${dangerCls}">Danger ${dl}</span> · ${clockString()} ${timePhase() === 'night' ? '☾' : '☀'}<br>${G.realm !== 'dungeon' ? `<span class="weather-ind ${W?.def?.danger ? 'danger' : ''}">${esc(W?.name || '')}</span>` : ''} · <span class="gold">${c.gold}g</span>`;
    // tracker
    const tq = c.trackedQuest;
    let th = '';
    if (tq && c.quests[tq] && !c.quests[tq].done) {
      const def = questDef(tq);
      th += `<div class="qname">${esc(def.name)}</div>`;
      for (const o of objectiveProgress(tq)) th += `<div class="qobj ${o.done ? 'done' : ''}">${esc(o.text)}${o.n !== null && o.of ? ` (${o.n}/${o.of})` : ''}</div>`;
    }
    const others = c.questOrder.filter((q) => q !== tq && c.quests[q] && !c.quests[q].done).length;
    if (others) th += `<div class="other">+${others} more in your journal (J)</div>`;
    H.tracker.innerHTML = th;
    // boss bar
    const boss = G.bossActive;
    if (boss && !boss.dead && !boss.removed) {
      H.boss.classList.remove('hidden');
      H.boss.querySelector('.name').textContent = boss.name;
      H.boss.querySelector('.sub').textContent = `Level ${boss.level}${boss.world ? ' · World Boss' : ''} · Phase ${boss.phase}`;
    } else H.boss.classList.add('hidden');
  }
  const boss = G.bossActive;
  if (boss && !boss.dead) { const f = `${(boss.hp / boss.maxHp) * 100}%`; H.boss.querySelector('.fill').style.width = f; H.boss.querySelector('.lag').style.width = f; }
  // interaction prompt
  if (G.prompt) { H.prompt.classList.remove('hidden'); H.prompt.innerHTML = `<b>E</b>${esc(G.prompt)}`; } else H.prompt.classList.add('hidden');
  mmT -= dt;
  if (mmT <= 0) { mmT = 0.05; drawMinimap(); }
}

// ------------------------------------------------------------------ minimap
function drawMinimap() {
  const cv = H.mm, g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  const W = cv.width;
  const p = G.player;
  g.fillStyle = '#060404';
  g.fillRect(0, 0, W, W);
  const scale = 0.6; // px per world unit (canvas is drawn at half res and scaled up pixelated)
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
      g.fillStyle = '#5a4a3a';
      g.fillRect(x, z, d.tile * s + 0.5, d.tile * s + 0.5);
    }
    if (d.exit) dot(g, (d.exit.x - p.pos.x) * s, (d.exit.z - p.pos.z) * s, '#80c0ff', 4);
    for (const e of G.entities) if (!e.dead && e.team === 'enemy') dot(g, (e.pos.x - p.pos.x) * s, (e.pos.z - p.pos.z) * s, e.boss ? '#ff4020' : '#d03030', e.boss ? 5 : 2.5);
  } else {
    const m = MAP[G.realm];
    if (m?.ready) {
      const px = (p.pos.x + m.half) / (m.half * 2) * m.N, pz = (p.pos.z + m.half) / (m.half * 2) * m.N;
      const unitsPerPx = (m.half * 2) / m.N;
      const sz = W / scale / unitsPerPx;
      g.drawImage(m.canvas, px - sz, pz - sz, sz * 2, sz * 2, -W, -W, W * 2, W * 2);
      // fog
      const fog = fogMask(G.realm);
      const cell = (m.half * 2) / FOG_N;
      g.fillStyle = 'rgba(6,4,4,0.92)';
      const r = Math.ceil(W / scale / cell) + 1;
      const ci = Math.floor((p.pos.x + m.half) / cell), cj = Math.floor((p.pos.z + m.half) / cell);
      for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
        if (i >= 0 && j >= 0 && i < FOG_N && j < FOG_N && fog[j * FOG_N + i]) continue;
        const x = (i * cell - m.half - p.pos.x) * scale, z = (j * cell - m.half - p.pos.z) * scale;
        g.fillRect(x - 0.5, z - 0.5, cell * scale + 1, cell * scale + 1);
      }
    }
    const towns = G.realm === 'deep' ? DEEP_TOWNS : TOWNS;
    for (const t of towns) mark(g, t.x, t.z, p, scale, '#ffe0a0', 5, 'town');
    for (const d of DUNGEONS) if ((d.realm || 'surface') === G.realm) mark(g, d.x, d.z, p, scale, G.char.cleared[d.id] ? '#8a8070' : d.shard ? '#ff70ff' : '#ff6040', 4, 'dungeon');
    for (const w of WAYSTONES) if (w.realm === G.realm) mark(g, w.x, w.z, p, scale, G.char.discovered.waystones.includes(w.id) ? '#80c0ff' : '#3a5a78', 3.5, 'way');
    for (const s of SHRINES) if (s.realm === G.realm) mark(g, s.x, s.z, p, scale, G.char.shrinesUsed.includes(s.id) ? '#6a6a60' : '#60ffc0', 3, 'shrine');
    for (const e of G.entities) {
      if (e.dead || e.removed) continue;
      const x = (e.pos.x - p.pos.x) * scale, z = (e.pos.z - p.pos.z) * scale;
      if (Math.abs(x) > W / 2 || Math.abs(z) > W / 2) continue;
      if (e.team === 'enemy') dot(g, x, z, e.boss ? '#ff4020' : '#d03030', e.boss ? 5 : 2.2);
      else if (e.isNpc) dot(g, x, z, e.hunting ? '#ff3020' : '#e8d080', 2);
      else if (e.team === 'player') dot(g, x, z, '#80ff90', 2);
    }
    for (const q of trackedObjectiveMarkers()) if (q.realm === G.realm) questMark(g, q, p, scale, W);
  }
  g.restore();
  // player marker: white pixel block with a nose toward the facing (8 directions)
  {
    const c = Math.floor(W / 2), f = G.player.facing;
    const nx = Math.round(Math.sin(f) * 1.4), nz = Math.round(Math.cos(f) * 1.4);
    g.fillStyle = '#000'; g.fillRect(c - 2, c - 2, 5, 5); g.fillRect(c + nx * 2 - 1, c + nz * 2 - 1, 3, 3);
    g.fillStyle = '#fff4d0'; g.fillRect(c - 1, c - 1, 3, 3); g.fillRect(c + nx * 2, c + nz * 2, 1, 1);
  }
  // north indicator
  const na = rot - Math.PI / 2;
  g.font = "8px 'Silkscreen'"; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#e8c47a';
  g.fillStyle = '#000'; g.fillText('N', Math.round(W / 2 + Math.cos(na) * (W / 2 - 6)) + 1, Math.round(W / 2 + Math.sin(na) * (W / 2 - 6)) + 1);
  g.fillStyle = '#e8c47a'; g.fillText('N', Math.round(W / 2 + Math.cos(na) * (W / 2 - 6)), Math.round(W / 2 + Math.sin(na) * (W / 2 - 6)));
}

function dot(g, x, y, col, r) { const s = Math.max(1, Math.round(r * 0.8)); g.fillStyle = '#000'; g.fillRect(Math.round(x) - s, Math.round(y) - s, s * 2 + 1, s * 2 + 1); g.fillStyle = col; g.fillRect(Math.round(x) - s + 1, Math.round(y) - s + 1, s * 2 - 1, s * 2 - 1); }
// pixel glyphs for minimap markers: rows of widths, centred, black outline
const GLYPHS = { town: [3, 3, 3], dungeon: [1, 3, 5], way: [1, 3, 1], shrine: [1, 3, 1], quest: [1, 5, 3, 5, 1] };
function glyph(g, X, Z, rows, col) {
  const h = rows.length, x0 = Math.round(X), y0 = Math.round(Z) - Math.floor(h / 2);
  g.fillStyle = '#000';
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
  glyph(g, X, Z, GLYPHS.quest, q.tracked ? '#ffd040' : '#c0a060');
}
