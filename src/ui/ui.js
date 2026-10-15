// UI core: DOM helpers, in-place re-rendering (morph), toasts, banners, anchored tooltips,
// drag & drop, modal windows and the shared item card.
//
// Menus are written as "build the whole window" functions. Re-opening a window that is already
// open does NOT tear it down: the fresh tree is morphed into the live one, so elements, images,
// scroll positions, hover and focus all survive a click and nothing replays its entrance
// animation. (Rebuilding the window on every click used to make the whole UI blink.)
import { G } from '../game.js';
import { input } from '../core/input.js';
import { RARITY, AFFIX, WEAPON_TYPES, SETS, LEGENDARIES, WEIGHTS, ARMOR_SLOTS } from '../data/items.js';
import { TOMES, TOME_TIERS } from '../data/tomes.js';
import { itemPower } from '../systems/inventory.js';
import { abilityPool } from '../systems/loadout.js';
import { bus } from '../core/events.js';
import { pixelTitle } from './pixelKit.js';

export const root = () => document.getElementById('ui');

export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// key cap: <span class="kc">E</span>
export const kc = (k, cls = '') => `<span class="kc ${cls}">${esc(k)}</span>`;

// ---------------------------------------------------------------- morph (in-place re-render)
const HANDLERS = ['onclick', 'ondblclick', 'oncontextmenu', 'onmousedown', 'onmouseup', 'onmouseenter', 'onmouseleave', 'onmousemove', 'onwheel', 'oninput', 'onchange', 'onpointerdown', 'onkeydown'];
const PROPS = ['_tip', '_tipCls', '_tipPos', '_drag', '_drop', '_canDrop'];
function sameNode(a, b) {
  if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) return false;
  if (a.nodeType !== 1) return true;
  return a.getAttribute('data-key') === b.getAttribute('data-key');
}
// Make live node `a` look and behave like freshly built node `b`, reusing a's elements.
export function morph(a, b) {
  if (a.nodeType !== 1) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return a; }
  const aa = a.attributes, ba = b.attributes;
  for (let i = aa.length - 1; i >= 0; i--) { const n = aa[i].name; if (!b.hasAttribute(n)) a.removeAttribute(n); }
  for (let i = 0; i < ba.length; i++) { const { name, value } = ba[i]; if (a.getAttribute(name) !== value) a.setAttribute(name, value); }
  for (const k of HANDLERS) if (a[k] !== b[k]) a[k] = b[k];
  for (const k of PROPS) if (a[k] !== b[k]) a[k] = b[k];
  if (a.tagName === 'INPUT' && document.activeElement !== a && a.value !== b.value) a.value = b.value;
  if (a.hasAttribute('data-keep')) return a;
  const bc = [...b.childNodes];
  for (let i = 0; i < bc.length; i++) {
    const na = a.childNodes[i], nb = bc[i];
    if (!na) a.appendChild(nb);
    else if (sameNode(na, nb)) morph(na, nb);
    else a.replaceChild(nb, na);
  }
  while (a.childNodes.length > bc.length) a.removeChild(a.lastChild);
  return a;
}

// ---------------------------------------------------------------- toasts
let toastBox;
export function toast(msg, cls = '', dur = 3200) {
  if (!toastBox || !toastBox.isConnected) { toastBox = el('div', 'toasts'); root().appendChild(toastBox); }
  const t = el('div', 'toast ' + cls, msg);
  toastBox.appendChild(t);
  while (toastBox.children.length > 5) toastBox.firstChild.remove();
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 180); }, dur);
}

// ---------------------------------------------------------------- region banner
let bannerEl, bannerT = 0;
// current UI pixel unit (CSS px per UI pixel)
export function uiUnit() { return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--u')) || 2; }
// big pixel-font heading as an image; mult = pixel size in UI units
export function pxTitle(text, mult = 3, o = {}) { return pixelTitle(String(text).toUpperCase(), { ...o, scale: mult * uiUnit() }); }

export function banner(kicker, title, sub) {
  if (!bannerEl || !bannerEl.isConnected) { bannerEl = el('div', 'banner'); root().appendChild(bannerEl); }
  bannerEl.innerHTML = `<div class="kicker">${esc(kicker)}</div><div class="line"></div><div class="title"></div><div class="line"></div><div class="sub">${esc(sub || '')}</div>`;
  bannerEl.querySelector('.title').appendChild(pxTitle(title, String(title).length > 18 ? 2 : 3));
  bannerEl.classList.remove('show', 'hide');
  void bannerEl.offsetWidth;
  bannerEl.classList.add('show');
  clearTimeout(bannerT);
  bannerT = setTimeout(() => bannerEl.classList.add('hide'), 4200);
  bus.emit('bannerShown', title);
}

// ---------------------------------------------------------------- tooltips
// Elements carry their tooltip as node._tip = () => html (set with bindTip). One delegated
// listener shows it anchored beside the element, so it never jitters with the cursor. Tips with
// _tipPos = 'cursor' (map markers) follow the mouse instead.
let tip = null, tipOwner = null, tipHtml = '', mouse = { x: 0, y: 0 }, manual = false;
function ensureTip() { if (!tip || !tip.isConnected) { tip = el('div', 'tooltip f-card'); root().appendChild(tip); } return tip; }
function ownerOf(n) { while (n && n.nodeType === 1) { if (n._tip) return n; n = n.parentElement; } return null; }
function placeTip(rect, pos) {
  const t = tip, w = t.offsetWidth, h = t.offsetHeight, W = window.innerWidth, H = window.innerHeight, gap = 6;
  let x, y;
  if (pos === 'cursor') {
    x = mouse.x + 20; y = mouse.y + 14;
    if (x + w > W - 8) x = mouse.x - w - 16;
    if (y + h > H - 8) y = H - h - 8;
  } else if (pos === 'top') {
    x = rect.left + rect.width / 2 - w / 2; y = rect.top - h - gap;
    if (y < 8) y = rect.bottom + gap;
  } else if (pos === 'left') {
    x = rect.left - w - gap; y = rect.top;
    if (x < 8) x = rect.right + gap;
  } else {
    x = rect.right + gap; y = rect.top;
    if (x + w > W - 8) x = rect.left - w - gap;
    if (x < 8) { x = rect.left + rect.width / 2 - w / 2; y = rect.bottom + gap; if (y + h > H - 8) y = rect.top - h - gap; }
  }
  x = Math.round(Math.max(8, Math.min(W - w - 8, x)));
  y = Math.round(Math.max(8, Math.min(H - h - 8, y)));
  t.style.transform = `translate(${x}px, ${y}px)`;
}
function renderTip() {
  if (!tipOwner || !tipOwner.isConnected || dragState?.started) { if (!manual) hideTip(); return; }
  const html = tipOwner._tip();
  if (!html) { hideTip(); return; }
  ensureTip();
  const cls = 'tooltip f-card ' + (tipOwner._tipCls || '');
  if (tip.className !== cls) tip.className = cls;
  if (html !== tipHtml) { tip.innerHTML = html; tipHtml = html; }
  tip.style.display = 'block';
  placeTip(tipOwner.getBoundingClientRect(), tipOwner._tipPos);
}
// refresh the tooltip after a re-render (its element may now show a different item)
export function refreshTip() { if (tipOwner) { if (tipOwner.isConnected) renderTip(); else { tipOwner = null; hideTip(); } } }
export function showTip(html, x, y, cls = '') {
  ensureTip(); manual = true;
  tip.className = 'tooltip f-card ' + cls;
  if (html !== tipHtml) { tip.innerHTML = html; tipHtml = html; }
  tip.style.display = 'block';
  mouse.x = x; mouse.y = y;
  placeTip(null, 'cursor');
}
export function hideTip() { manual = false; if (tip) { tip.style.display = 'none'; } }
export function bindTip(node, htmlFn, o = {}) { node._tip = htmlFn; if (o.cls) node._tipCls = o.cls; if (o.pos) node._tipPos = o.pos; return node; }

let tipRaf = 0;
document.addEventListener('mouseover', (e) => {
  const o = ownerOf(e.target);
  if (o === tipOwner) return;
  tipOwner = o;
  if (o) renderTip(); else if (!manual) hideTip();
});
document.addEventListener('mousemove', (e) => {
  mouse.x = e.clientX; mouse.y = e.clientY;
  if (tipOwner && tipOwner._tipPos === 'cursor' && !tipRaf) tipRaf = requestAnimationFrame(() => { tipRaf = 0; renderTip(); });
  moveDrag(e);
});
document.addEventListener('mouseleave', () => { tipOwner = null; hideTip(); });

// ---------------------------------------------------------------- drag & drop
// node._drag = () => ({ icon, ...payload }); drop targets get node._drop(payload) and an
// optional node._canDrop(payload). A pixel ghost of the icon follows the cursor.
let dragState = null, ghost = null, suppressClick = false;
export function bindDrag(node, payloadFn) { node._drag = payloadFn; node.classList.add('draggable'); return node; }
export function bindDrop(node, dropFn, canFn) { node._drop = dropFn; if (canFn) node._canDrop = canFn; node.classList.add('dropzone'); return node; }
export function dragging() { return !!dragState?.started; }
function upTo(n, prop) { while (n && n.nodeType === 1) { if (n[prop]) return n; n = n.parentElement; } return null; }
document.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  const src = upTo(e.target, '_drag');
  dragState = src ? { src, x: e.clientX, y: e.clientY, started: false } : null;
});
function moveDrag(e) {
  const d = dragState;
  if (!d) return;
  if (!d.started) {
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < 6) return;
    const payload = d.src._drag();
    if (!payload) { dragState = null; return; }
    d.payload = payload; d.started = true;
    hideTip();
    ghost = el('div', 'drag-ghost', payload.icon ? `<img src="${payload.icon}" draggable="false">` : '');
    root().appendChild(ghost);
    d.src.classList.add('drag-src');
    document.body.classList.add('is-dragging');
    for (const z of document.querySelectorAll('.dropzone')) if (!z._canDrop || z._canDrop(payload)) z.classList.add('drop-ok');
  }
  ghost.style.transform = `translate(${Math.round(e.clientX)}px, ${Math.round(e.clientY)}px)`;
  const over = upTo(document.elementFromPoint(e.clientX, e.clientY), '_drop');
  if (over !== d.over) { d.over?.classList.remove('drop-hover'); d.over = over; if (over?.classList.contains('drop-ok')) over.classList.add('drop-hover'); }
}
function endDrag() {
  const d = dragState;
  dragState = null;
  if (!d?.started) return d;
  ghost?.remove(); ghost = null;
  d.src.classList.remove('drag-src');
  document.body.classList.remove('is-dragging');
  for (const z of document.querySelectorAll('.drop-ok, .drop-hover')) z.classList.remove('drop-ok', 'drop-hover');
  return d;
}
document.addEventListener('mouseup', (e) => {
  const d = endDrag();
  if (!d?.started) return;
  suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
  const target = upTo(document.elementFromPoint(e.clientX, e.clientY), '_drop');
  if (target && (!target._canDrop || target._canDrop(d.payload))) target._drop(d.payload);
  else if (d.payload.onMiss) d.payload.onMiss();
});
document.addEventListener('click', (e) => { if (suppressClick) { suppressClick = false; e.stopPropagation(); e.preventDefault(); } }, true);

// ---------------------------------------------------------------- modal windows
let modal = null;
export function openModal(name, node) {
  if (!node.dataset.win) node.dataset.win = name;
  if (modal && modal.wrap.isConnected) {
    if (modal.win.dataset.win === node.dataset.win) {
      if (modal.win.classList.contains('swap')) node.classList.add('swap');
      morph(modal.win, node);
    } else {
      node.classList.add('swap');
      modal.win.replaceWith(node);
      modal.win = node;
    }
    const changed = modal.name !== name;
    modal.name = name;
    G.menuOpen = name;
    input.uiBlocking = true;
    if (changed) bus.emit('menuOpen', name);
    refreshTip();
    return modal.win;
  }
  const wrap = el('div', 'modal-wrap');
  wrap.appendChild(node);
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) closeModal(); });
  wrap.addEventListener('contextmenu', (e) => e.preventDefault());
  root().appendChild(wrap);
  modal = { name, wrap, win: node };
  G.menuOpen = name;
  input.uiBlocking = true;
  bus.emit('menuOpen', name);
  return node;
}
export function closeModal() {
  if (!modal) return;
  endDrag();
  modal.wrap.remove();
  const n = modal.name;
  modal = null;
  G.menuOpen = null;
  input.uiBlocking = false;
  tipOwner = null;
  hideTip();
  bus.emit('menuClose', n);
}
// outside of play (title screen, character creation) the game loop doesn't read keys, so Esc
// closes windows here
window.addEventListener('keydown', (e) => { if (e.code === 'Escape' && modal && G.mode !== 'play') closeModal(); });
export function modalName() { return modal?.name || null; }
export function modalNode() { return modal?.win || null; }

// Window shell: wooden frame, title plaque, physical tabs, iron close button, optional key hints.
// tabs: [[id, label(html)], ...]; opts: { id, cls, hints: [[key, text], ...] }
export function windowFrame(title, tabs, activeTab, onTab, opts = {}) {
  const w = el('div', 'window f-wood' + (tabs ? ' has-tabs' : '') + (opts.cls ? ' ' + opts.cls : ''));
  w.dataset.win = opts.id || String(title);
  const plate = el('div', 'win-plate f-plate');
  plate.appendChild(pixelTitle(String(title).toUpperCase(), { scale: Math.max(2, Math.round(uiUnit() * 1.5)) }));
  w.appendChild(plate);
  if (tabs) {
    const tb = el('div', 'win-tabs');
    for (const [id, label] of tabs) {
      const b = el('button', 'tab' + (id === activeTab ? ' on' : ''), label);
      b.dataset.key = 'tab-' + id;
      b.onclick = () => { if (id !== activeTab) onTab(id); };
      tb.appendChild(b);
    }
    w.appendChild(tb);
  }
  const x = el('button', 'close-x', '<i></i>');
  x.title = 'Close (Esc)';
  x.onclick = closeModal;
  w.appendChild(x);
  const body = el('div', 'body');
  w.appendChild(body);
  if (opts.hints) w.appendChild(el('div', 'win-hints', opts.hints.map(([k, t]) => `<span>${k.split('+').map((s) => kc(s)).join('')} ${esc(t)}</span>`).join('')));
  return { w, body };
}

// ---------------------------------------------------------------- item text
export function rarityCls(item) { return 'r-' + item.rarity; }
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');

export function itemTypeLine(item) {
  const r = RARITY[item.rarity].name;
  if (item.kind === 'weapon') return `${r} ${WEAPON_TYPES[item.type].hands === 2 ? 'Two-Handed ' : ''}${WEAPON_TYPES[item.type].name}`;
  if (item.kind === 'armor') return `${r} ${WEIGHTS[item.weight].name} ${ARMOR_SLOTS[item.slot].name}`;
  if (item.kind === 'shield') return `${r} Shield`;
  if (item.kind === 'trinket') return `${r} ${item.slot === 'ring' ? 'Ring' : 'Amulet'}`;
  if (item.kind === 'tome') return `${r} Spellbook · Tier ${TOME_TIERS[item.tier]}`;
  return r;
}

const delta = (v, unit = '', inv = false) => {
  if (!v) return '';
  const up = inv ? v < 0 : v > 0;
  return `<span class="dl ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs(Math.round(v * 10) / 10)}${unit}</span>`;
};

// The item card: dark header with the name in its rarity colour, parchment body with the main
// stat (and green / red deltas against `compare`), affixes, powers, set bonuses and lore.
// o: { compare, extra (html appended), icon (src), kit (html) }
export function itemCard(item, o = {}) {
  const c = G.char;
  const cmp = o.compare && o.compare !== item ? o.compare : null;
  let h = `<div class="icard rc-${item.rarity}"><div class="ic-head">`;
  if (o.icon) h += `<div class="ic-icon slotf ${rarityCls(item)}"><img src="${o.icon}" draggable="false"></div>`;
  h += `<div class="ic-title"><div class="ic-name">${esc(item.name)}${item.upgrade ? ` <span class="ic-up">+${item.upgrade}</span>` : ''}</div><div class="ic-type">${itemTypeLine(item)} · iLvl ${item.ilvl}</div></div></div><div class="ic-body">`;
  if (item.kind === 'weapon') {
    const wt = WEAPON_TYPES[item.type];
    h += `<div class="ic-main"><b>${item.dmg}</b><span class="lbl">Damage</span>${cmp?.dmg ? delta(item.dmg - cmp.dmg) : ''}</div>`;
    h += `<div class="ic-sub">${wt.speed.toFixed(2)} attack speed${wt.ranged ? ' · ranged' : wt.caster ? ' · caster' : ''}${wt.hands === 2 ? ' · two hands' : ''}</div>`;
    if (item.spellPower) h += `<div class="ic-aff">+${item.spellPower}% Spell Power</div>`;
    if (item.element) h += `<div class="ic-elem el-${item.element}">${cap(item.element)} affinity: abilities become ${item.element}</div>`;
  }
  if (item.armor) h += `<div class="ic-main"><b>${item.armor}</b><span class="lbl">Armor</span>${cmp?.armor ? delta(item.armor - cmp.armor) : ''}</div>`;
  if (item.kind === 'shield') h += `<div class="ic-sub">${Math.round(item.block * 100)}% block</div>`;
  if (item.kind === 'tome') {
    const t = TOMES[item.tome];
    let pool = [];
    try { pool = abilityPool(item); } catch (e) { /* no character yet */ }
    h += `<div class="ic-main"><b>${TOME_TIERS[item.tier] || item.tier}</b><span class="lbl">Tier · ${pool.length} spells</span></div><div class="ic-spells">${t.spells.map((s) => { const on = pool.includes(s.id); return `<div class="${on ? 'on' : 'off'}">${on ? '◆' : '◇'} ${esc(s.name)}${s.evolved ? ' <span class="evo">evolved</span>' : ''}<span class="t">T${s.tier}</span></div>`; }).join('')}</div>`;
  }
  const aff = item.affixes || [];
  if (aff.length) { h += '<div class="ic-rule"></div>'; for (const a of aff) { const A = AFFIX[a.id]; if (A) h += `<div class="ic-aff">${A.fmt.replace('{v}', a.v)}</div>`; } }
  if (item.legendary) {
    const L = LEGENDARIES[item.legendary];
    if (L) h += `<div class="ic-power">◆ ${esc(L.powerText)}</div>`;
  }
  if (item.set && SETS[item.set]) {
    const set = SETS[item.set];
    const n = Object.values(c?.equip || {}).filter((x) => x?.set === item.set).length;
    h += `<div class="ic-rule"></div><div class="ic-setn">${esc(set.name)} <span>(${n}/5)</span></div>`;
    for (const [k, b] of Object.entries(set.bonuses)) h += `<div class="ic-setb ${n >= +k ? 'on' : ''}">(${k}) ${esc(b.text)}</div>`;
  }
  if (o.kit) h += `<div class="ic-rule"></div>${o.kit}`;
  if (item.legendary && LEGENDARIES[item.legendary]?.lore) h += `<div class="ic-lore">"${esc(LEGENDARIES[item.legendary].lore)}"</div>`;
  else if (item.kind === 'tome') h += `<div class="ic-lore">"${esc(TOMES[item.tome].lore)}"</div>`;
  if (cmp) {
    const a = itemPower(item), b = itemPower(cmp);
    h += `<div class="ic-cmp"><span class="lbl">vs ${esc(cmp.name)}</span>${a === b ? '<span class="dl">same power</span>' : delta(a - b, ' power')}</div>`;
  }
  h += `<div class="ic-foot"><span class="${item.req > (c?.level || 1) ? 'bad' : ''}">Requires level ${item.req}</span><span class="val">${item.value}g</span></div>`;
  if (o.extra) h += o.extra;
  h += '</div></div>';
  return h;
}
// tooltip text for an item (kept for older callers)
export function itemTooltip(item, compare) { return itemCard(item, { compare }); }

export function fmtTime(s) { s = Math.max(0, Math.ceil(s)); return s >= 60 ? `${Math.floor(s / 60)}m` : `${s}`; }
