// Co-op UI: the Host / Join window (Menu › Co-op), party frames under the nameplate, name tags over
// partners' heads, and party chat (Enter).
import { G } from '../game.js';
import { bus } from '../core/events.js';
import { input } from '../core/input.js';
import { el, esc, root, toast, openModal, closeModal, modalName, windowFrame, kc, pxTitle } from './ui.js';
import { openPause } from './menus.js';
import { worldToScreen } from '../world/cameraRig.js';
import { CLASS_BY_ID } from '../data/classes.js';
import { hostGame, joinGame, leaveGame, MAX_PLAYERS } from '../net/session.js';
import { cleanCode, localMode } from '../net/transport.js';

const C = { party: null, frames: new Map(), tags: new Map(), chat: null, log: null, say: null, busy: false, status: '' };
const SHOW_CHAT = 12;   // seconds a chat line stays up

export function initCoop() {
  bus.on('netParty', () => { refreshFrames(); if (modalName() === 'coop') openCoop(); });
  bus.on('netChat', ({ name, text, pid }) => chatLine(name, text, pid === G.net?.me));
  bus.on('netEnded', () => { refreshFrames(); if (modalName() === 'coop') openCoop(); });
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Enter' || !G.net || G.mode !== 'play' || modalName()) return;
    if (document.activeElement === C.say) return;
    e.preventDefault();
    openSay();
  });
}

// ------------------------------------------------------------------------------- window
export function openCoop() {
  const { w, body } = windowFrame('Co-op', null, null, null, { id: 'coop', cls: 'sys-win coop-win', hints: [['Esc', 'Close']] });
  const col = el('div', 'coop f-sheet');
  const net = G.net;
  if (!net) {
    col.appendChild(el('div', 'sec-h', '<span>Play together</span><span class="sec-sub">Online co-op · up to 4 heroes</span>'));
    col.appendChild(el('p', 'coop-p', 'Host and friends join your world with their own heroes. Everyone keeps the loot, gold and XP they earn. The host leads the party into dungeons and on fast travel.'));
    const hb = el('button', 'primary', 'Host a game');
    hb.dataset.key = 'coop-host';
    hb.disabled = C.busy;
    hb.onclick = () => run('Opening a room...', () => hostGame().then((s) => { C.status = ''; toast(`Room open. Code <b>${s.code}</b>`); }));
    col.appendChild(el('div', 'coop-row')).appendChild(hb);
    col.appendChild(el('div', 'sec-h', '<span>Join a friend</span><span class="sec-sub">Enter their room code</span>'));
    const row = el('div', 'coop-row');
    const inp = el('input', 'coop-code');
    inp.maxLength = 5;
    inp.placeholder = 'CODE';
    inp.spellcheck = false;
    inp.dataset.key = 'coop-code';
    inp.oninput = () => { inp.value = cleanCode(inp.value); };
    const jb = el('button', '', 'Join');
    jb.dataset.key = 'coop-join';
    jb.disabled = C.busy;
    const join = () => { const code = cleanCode(inp.value); if (code.length === 5) run('Joining...', () => joinGame(code).then(() => { C.status = ''; closeModal(); })); };
    jb.onclick = join;
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.code === 'Enter') join(); });
    row.append(inp, jb);
    col.appendChild(row);
    if (C.status) col.appendChild(el('div', 'coop-status', esc(C.status)));
    col.appendChild(el('div', 'coop-note dim', localMode() ? 'Local test mode: tabs of this browser connect to each other.' : 'Players connect directly to each other. Some strict school or office networks block this.'));
  } else {
    if (net.isHost) {
      col.appendChild(el('div', 'sec-h', '<span>Room code</span><span class="sec-sub">Share it with up to 3 friends</span>'));
      const row = el('div', 'coop-row');
      const big = el('div', 'coop-big');
      big.appendChild(pxTitle(net.code, 3));
      row.appendChild(big);
      const cb = el('button', 'small', 'Copy');
      cb.onclick = () => { navigator.clipboard?.writeText(net.code).then(() => toast('Room code copied.'), () => {}); };
      row.appendChild(cb);
      col.appendChild(row);
    } else col.appendChild(el('div', 'sec-h', `<span>In a party</span><span class="sec-sub">Room ${esc(net.code)}</span>`));
    col.appendChild(el('div', 'sec-h', `<span>Party</span><span class="sec-sub">${net.roster().length} / ${MAX_PLAYERS}</span>`));
    for (const m of net.roster()) {
      const lvl = m.me ? G.char.level : m.ghost?.level || '?';
      const cls = CLASS_BY_ID[m.me ? G.char.cls : m.ghost?.char.cls]?.name || '';
      const where = m.ghost?.away ? ' · elsewhere' : '';
      col.appendChild(el('div', 'coop-member', `<b class="lv">${lvl}</b><span class="nm">${esc(m.name)}${m.me ? ' <span class="dim">(you)</span>' : ''}</span><span class="dim">${esc(cls)}${m.host ? ' · leader' : ''}${where}</span>`));
    }
    const row = el('div', 'coop-row');
    if (!net.isHost) {
      const gb = el('button', '', 'Go to leader');
      gb.onclick = () => { closeModal(); net.goToLeader(); };
      row.appendChild(gb);
    }
    const lb = el('button', 'danger', net.isHost ? 'Close the game' : 'Leave party');
    lb.dataset.key = 'coop-leave';
    lb.onclick = () => { leaveGame(); openCoop(); };
    row.appendChild(lb);
    col.appendChild(row);
    col.appendChild(el('div', 'coop-note dim', `Press ${kc('Enter')} to chat. The world keeps running while menus are open.`));
  }
  const back = el('button', 'small', 'Back to menu');
  back.onclick = openPause;
  col.appendChild(el('div', 'coop-row coop-back')).appendChild(back);
  body.appendChild(col);
  openModal('coop', w);
}

function run(status, fn) {
  if (C.busy) return;
  C.busy = true;
  C.status = status;
  openCoop();
  fn().catch((e) => { C.status = e.message || 'Connection failed.'; }).finally(() => { C.busy = false; if (modalName() === 'coop') openCoop(); });
}

// ------------------------------------------------------------------------------- party frames
function ensureContainers() {
  if (!C.party) {
    C.party = el('div', 'party');
    C.tagLayer = el('div', 'coop-tags');
    C.chat = el('div', 'coop-chat');
    C.log = el('div', 'log');
    C.say = el('input', 'say hidden');
    C.say.maxLength = 160;
    C.say.placeholder = 'Say something to the party';
    C.say.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Enter') { const t = C.say.value; C.say.value = ''; closeSay(); if (t.trim()) G.net?.say(t); }
      else if (e.code === 'Escape') closeSay();
    });
    C.say.addEventListener('blur', () => closeSay());
    C.chat.append(C.log, C.say);
    // under the HUD and any open window
    root().prepend(C.tagLayer, C.chat);
  }
  const tl = document.querySelector('#hud .hud-tl');
  if (tl && C.party.parentNode !== tl) tl.appendChild(C.party);
}

function refreshFrames() {
  ensureContainers();
  const net = G.net;
  const ghosts = net ? net.ghosts() : [];
  for (const [pid, f] of C.frames) if (!ghosts.some((g) => g.pid === pid)) { f.remove(); C.frames.delete(pid); }
  for (const [pid, t] of C.tags) if (!ghosts.some((g) => g.pid === pid)) { t.remove(); C.tags.delete(pid); }
  for (const g of ghosts) {
    if (!C.frames.has(g.pid)) {
      const f = el('div', 'pm', '<b class="lv"></b><div class="pm-t"><div class="pm-n"></div><div class="pm-bar"><i></i></div></div>');
      f.lv = f.querySelector('.lv'); f.nm = f.querySelector('.pm-n'); f.bar = f.querySelector('.pm-bar i');
      C.party.appendChild(f);
      C.frames.set(g.pid, f);
    }
    if (!C.tags.has(g.pid)) {
      const t = el('div', 'coop-tag', '<span class="n"></span><div class="hb"><i></i></div>');
      t.nm = t.querySelector('.n'); t.bar = t.querySelector('.hb i');
      C.tagLayer.appendChild(t);
      C.tags.set(g.pid, t);
    }
  }
  C.party.classList.toggle('hidden', !ghosts.length);
}

const setText = (n, s) => { if (n._t !== s) { n._t = s; n.textContent = s; } };
const setW = (n, f) => { const v = Math.round(Math.max(0, Math.min(1, f)) * 100); if (n._w !== v) { n._w = v; n.style.width = v + '%'; } };

export function updateCoop() {
  if (!C.party) { if (!G.net) return; refreshFrames(); }
  ensureContainers();
  const net = G.net;
  const show = !!net && G.mode === 'play';
  C.tagLayer.classList.toggle('hidden', !show);
  C.chat.classList.toggle('hidden', !show);
  if (!show) return;
  for (const g of net.ghosts()) {
    const f = C.frames.get(g.pid), t = C.tags.get(g.pid);
    if (!f || !t) { refreshFrames(); return; }
    const cls = CLASS_BY_ID[g.char.cls]?.name || '';
    setText(f.lv, String(g.level));
    setText(f.nm, `${g.name}${g.pid === 1 ? ' ★' : ''}`);
    f.title = `${g.name} · Level ${g.level} ${cls}`;
    setW(f.bar, g.maxHp ? g.hp / g.maxHp : 0);
    f.classList.toggle('away', g.away);
    f.classList.toggle('down', g.dead);
    // name tag over their head
    const vis = !g.away && !g.removed && g.net;
    if (vis) {
      const s = worldToScreen({ x: g.pos.x, y: g.pos.y + g.height + 0.55, z: g.pos.z });
      t.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px)`;
      t.classList.toggle('hidden', !s.visible);
      setText(t.nm, g.dead ? `${g.name} · down` : g.name);
      setW(t.bar, g.maxHp ? g.hp / g.maxHp : 0);
    } else t.classList.add('hidden');
  }
  // fade old chat lines
  const now = performance.now();
  for (const ln of C.log.children) if (!ln.classList.contains('old') && now - ln._t > SHOW_CHAT * 1000) ln.classList.add('old');
}

// ------------------------------------------------------------------------------- chat
function chatLine(name, text, mine) {
  ensureContainers();
  const ln = el('div', 'ln' + (mine ? ' me' : ''), `<b>${esc(name)}</b> ${esc(text)}`);
  ln._t = performance.now();
  C.log.appendChild(ln);
  while (C.log.children.length > 8) C.log.firstChild.remove();
}

function openSay() {
  ensureContainers();
  input.down.clear();
  input.mouse.left = input.mouse.right = false;
  C.chat.classList.add('typing');
  C.say.classList.remove('hidden');
  C.say.focus();
}
function closeSay() {
  if (!C.say || C.say.classList.contains('hidden')) return;
  C.say.classList.add('hidden');
  C.chat.classList.remove('typing');
  C.say.blur();
}
