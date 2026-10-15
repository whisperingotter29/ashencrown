// UI core: DOM helpers, toasts, banners, tooltips, modal management, item tooltip text.
import { G } from '../game.js';
import { input } from '../core/input.js';
import { RARITY, AFFIX, WEAPON_TYPES, SETS, LEGENDARIES, WEIGHTS, ARMOR_SLOTS, CONSUMABLES } from '../data/items.js';
import { TOMES, TOME_TIERS, spellsForTome } from '../data/tomes.js';
import { itemPower } from '../systems/inventory.js';
import { bus } from '../core/events.js';
import { pixelTitle } from './pixelKit.js';

export const root = () => document.getElementById('ui');

export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ---------------- toasts ----------------
let toastBox;
export function toast(msg, cls = '', dur = 3200) {
  if (!toastBox) { toastBox = el('div', 'toasts'); root().appendChild(toastBox); }
  const t = el('div', 'toast ' + cls, msg);
  toastBox.appendChild(t);
  while (toastBox.children.length > 5) toastBox.firstChild.remove();
  setTimeout(() => { t.style.transition = 'opacity 0.5s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 500); }, dur);
}

// ---------------- region banner ----------------
let bannerEl;
// current UI pixel unit (CSS px per UI pixel)
export function uiUnit() { return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--u')) || 2; }
// big pixel-font heading as an image; mult = pixel size in UI units
export function pxTitle(text, mult = 3, o = {}) { return pixelTitle(String(text).toUpperCase(), { ...o, scale: mult * uiUnit() }); }

export function banner(kicker, title, sub) {
  if (!bannerEl) { bannerEl = el('div', 'banner'); root().appendChild(bannerEl); }
  bannerEl.innerHTML = `<div class="kicker">${esc(kicker)}</div><div class="line"></div><div class="title"></div><div class="line"></div><div class="sub">${esc(sub || '')}</div>`;
  bannerEl.querySelector('.title').appendChild(pxTitle(title, String(title).length > 18 ? 2 : 3));
  bannerEl.classList.remove('show');
  void bannerEl.offsetWidth;
  bannerEl.classList.add('show');
  bus.emit('bannerShown', title);
}

// ---------------- tooltip ----------------
let tip;
export function showTip(html, x, y, cls = '') {
  if (!tip) { tip = el('div', 'tooltip panel'); root().appendChild(tip); }
  tip.className = 'tooltip panel ' + cls;
  tip.innerHTML = html;
  tip.style.display = 'block';
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let px = x + 18, py = y + 12;
  if (px + w > window.innerWidth - 8) px = x - w - 18;
  if (py + h > window.innerHeight - 8) py = window.innerHeight - h - 8;
  tip.style.left = Math.max(8, px) + 'px';
  tip.style.top = Math.max(8, py) + 'px';
}
export function hideTip() { if (tip) tip.style.display = 'none'; }

export function bindTip(node, htmlFn) {
  node.addEventListener('mouseenter', (e) => showTip(htmlFn(), e.clientX, e.clientY));
  node.addEventListener('mousemove', (e) => showTip(htmlFn(), e.clientX, e.clientY));
  node.addEventListener('mouseleave', hideTip);
}

// ---------------- modal management ----------------
let modal = null;
export function openModal(name, node) {
  closeModal();
  const wrap = el('div', 'modal-wrap');
  wrap.appendChild(node);
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) closeModal(); });
  root().appendChild(wrap);
  modal = { name, wrap };
  G.menuOpen = name;
  input.uiBlocking = true;
  bus.emit('menuOpen', name);
}
export function closeModal() {
  if (!modal) return;
  modal.wrap.remove();
  const n = modal.name;
  modal = null;
  G.menuOpen = null;
  input.uiBlocking = false;
  hideTip();
  bus.emit('menuClose', n);
}
export function modalName() { return modal?.name || null; }

export function windowFrame(title, tabs, activeTab, onTab) {
  const w = el('div', 'window panel');
  const head = el('div', 'head');
  head.appendChild(el('h2', '', esc(title)));
  if (tabs) {
    const tb = el('div', 'tabs');
    for (const [id, label] of tabs) {
      const b = el('button', id === activeTab ? 'on' : '', label);
      b.onclick = () => onTab(id);
      tb.appendChild(b);
    }
    head.appendChild(tb);
  }
  const x = el('button', 'close-x', '✕');
  x.onclick = closeModal;
  head.appendChild(x);
  w.appendChild(head);
  const body = el('div', 'body');
  w.appendChild(body);
  return { w, body };
}

// ---------------- item text ----------------
export function rarityCls(item) { return 'r-' + item.rarity; }

export function itemTypeLine(item) {
  const r = RARITY[item.rarity].name;
  if (item.kind === 'weapon') return `${r} ${WEAPON_TYPES[item.type].hands === 2 ? 'Two-Handed ' : ''}${WEAPON_TYPES[item.type].name}`;
  if (item.kind === 'armor') return `${r} ${WEIGHTS[item.weight].name} ${ARMOR_SLOTS[item.slot].name}`;
  if (item.kind === 'shield') return `${r} Shield`;
  if (item.kind === 'trinket') return `${r} ${item.slot === 'ring' ? 'Ring' : 'Amulet'}`;
  if (item.kind === 'tome') return `${r} Spellbook · Tier ${TOME_TIERS[item.tier]}`;
  return r;
}

export function itemTooltip(item, compare) {
  const c = G.char;
  let h = `<div class="tname ${rarityCls(item)}">${esc(item.name)}${item.upgrade ? ` <span class="gold">+${item.upgrade}</span>` : ''}</div><div class="ttype">${itemTypeLine(item)} · iLvl ${item.ilvl}</div>`;
  if (item.kind === 'weapon') {
    const wt = WEAPON_TYPES[item.type];
    h += `<div class="tstat">${item.dmg} <small>damage · ${wt.speed.toFixed(2)} speed${wt.ranged ? ' · ranged' : ''}</small></div>`;
    if (item.spellPower) h += `<div class="aff">+${item.spellPower}% Spell Power</div>`;
    if (item.element) h += `<div class="elem">Elemental affinity: ${item.element[0].toUpperCase() + item.element.slice(1)}</div>`;
  }
  if (item.armor) h += `<div class="tstat">${item.armor} <small>armor</small></div>`;
  if (item.kind === 'shield') h += `<div class="aff">${Math.round(item.block * 100)}% block</div>`;
  if (item.kind === 'tome') {
    const t = TOMES[item.tome];
    h += `<div class="tstat" style="font-size:var(--fs-1)">${t.name}</div><div class="aff">${item.tier + 1} spell slots</div>`;
    h += `<div style="font-size:var(--fs-1);margin-top:4px">${t.spells.map((s) => `<div class="${s.tier <= item.tier ? '' : 'muted'}">${s.tier <= item.tier ? '✦' : '·'} ${esc(s.name)}${s.evolved ? ' <span class="r-legendary">(evolved)</span>' : ''} <span class="muted">T${s.tier}</span></div>`).join('')}</div>`;
  }
  for (const a of item.affixes || []) { const A = AFFIX[a.id]; if (A) h += `<div class="aff">${A.fmt.replace('{v}', a.v)}</div>`; }
  if (item.legendary) {
    const L = LEGENDARIES[item.legendary];
    h += `<div class="power">◆ ${esc(L.powerText)}</div><div class="lore">"${esc(L.lore)}"</div>`;
  }
  if (item.set) {
    const set = SETS[item.set];
    const n = Object.values(c.equip).filter((x) => x?.set === item.set).length;
    h += `<div class="rule"></div><div class="gold" style="font-family:var(--display);font-size:var(--fs-1)">${esc(set.name)} (${n}/5)</div>`;
    for (const [k, b] of Object.entries(set.bonuses)) h += `<div class="setb ${n >= +k ? 'on' : ''}">(${k}) ${esc(b.text)}</div>`;
  }
  if (item.kind === 'tome') h += `<div class="lore">"${esc(TOMES[item.tome].lore)}"</div>`;
  h += `<div class="req ${item.req > c.level ? 'bad' : 'muted'}" style="margin-top:6px;font-size:var(--fs-1)">Requires level ${item.req}</div>`;
  h += `<div class="muted" style="font-size:var(--fs-1)">Value ${item.value} gold</div>`;
  if (compare && compare !== item) {
    const a = itemPower(item), b = itemPower(compare);
    h += `<div class="cmp">Compared to equipped <b>${esc(compare.name)}</b>: <span class="${a >= b ? 'up' : 'down'}">${a >= b ? '▲' : '▼'} ${Math.abs(a - b)} power</span>`;
    if (item.dmg && compare.dmg) h += ` · <span class="${item.dmg >= compare.dmg ? 'up' : 'down'}">${item.dmg - compare.dmg >= 0 ? '+' : ''}${item.dmg - compare.dmg} dmg</span>`;
    if (item.armor && compare.armor) h += ` · <span class="${item.armor >= compare.armor ? 'up' : 'down'}">${item.armor - compare.armor >= 0 ? '+' : ''}${item.armor - compare.armor} armor</span>`;
    h += '</div>';
  }
  return h;
}

export function fmtTime(s) { s = Math.max(0, Math.ceil(s)); return s >= 60 ? `${Math.floor(s / 60)}m` : `${s}`; }
