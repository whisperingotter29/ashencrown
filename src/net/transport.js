// Links between co-op players. Two kinds:
//  - WebRTC data channels through PeerJS: works between any two browsers or desktop builds. A small
//    signalling server introduces the peers (the public PeerJS one by default, or your own with
//    `npm run signal` and `?signal=host:port`); after that the game data flows peer to peer.
//  - A BroadcastChannel between tabs of one browser (`?net=local`), for testing without a network.
// The host gets a hub (many guests); a guest gets a single link to the host. Messages are plain JSON.

export const PROTO = 1;
const PREFIX = 'ashencrown-v1-';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newRoomCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}
export const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);

const params = () => new URLSearchParams(location.search);
export const localMode = () => params().get('net') === 'local';

function peerOptions() {
  const env = import.meta.env || {};
  const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
  if (env.VITE_TURN_URL) iceServers.push({ urls: env.VITE_TURN_URL, username: env.VITE_TURN_USER, credential: env.VITE_TURN_PASS });
  const o = { config: { iceServers }, debug: 1 };
  const s = params().get('signal') || env.VITE_SIGNAL || '';
  const m = s.match(/^(?:(wss?|https?):\/\/)?([^:/]+)(?::(\d+))?(\/.*)?$/);
  if (m) {
    const secure = m[1] === 'https' || m[1] === 'wss' || (!m[1] && m[3] === '443');
    Object.assign(o, { host: m[2], port: m[3] ? +m[3] : secure ? 443 : 80, path: m[4] || '/', secure });
  }
  return o;
}

const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);

function peerError(e) {
  const t = e?.type;
  if (t === 'peer-unavailable') return 'No game is open with that code.';
  if (t === 'unavailable-id') return 'That room code is taken.';
  if (t === 'network' || t === 'server-error' || t === 'socket-error') return 'Could not reach the matchmaking server. Check your connection.';
  if (t === 'browser-incompatible') return 'This browser cannot do peer-to-peer games.';
  return e?.message || 'Connection failed.';
}

// ------------------------------------------------------------------------------- host
// hub: { code, send(id, msg), close(), onJoin(id), onMsg(id, msg), onLeave(id) }
export async function hostRoom() {
  if (localMode()) return localHub(newRoomCode());
  const { Peer } = await import('peerjs');
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = newRoomCode();
    const peer = new Peer(PREFIX + code, peerOptions());
    try {
      await withTimeout(new Promise((res, rej) => { peer.once('open', res); peer.once('error', rej); }), 12000, 'The matchmaking server did not answer.');
    } catch (e) {
      peer.destroy();
      if (e?.type === 'unavailable-id') continue;
      throw new Error(peerError(e));
    }
    const conns = new Map();
    const hub = { code, onJoin() {}, onMsg() {}, onLeave() {} };
    peer.on('connection', (conn) => {
      conn.on('open', () => { conns.set(conn.peer, conn); hub.onJoin(conn.peer); });
      conn.on('data', (d) => { try { hub.onMsg(conn.peer, typeof d === 'string' ? JSON.parse(d) : d); } catch (e) { console.warn('bad message', e); } });
      const gone = () => { if (conns.delete(conn.peer)) hub.onLeave(conn.peer); };
      conn.on('close', gone);
      conn.on('error', gone);
    });
    // losing the signalling server does not drop players already connected; reconnect so new ones can join
    peer.on('disconnected', () => { if (!peer.destroyed) setTimeout(() => { if (!peer.destroyed) peer.reconnect(); }, 2000); });
    peer.on('error', (e) => console.warn('net:', peerError(e)));
    hub.send = (id, msg) => { const c = conns.get(id); if (c?.open) c.send(JSON.stringify(msg)); };
    hub.drop = (id) => { const c = conns.get(id); conns.delete(id); c?.close(); };
    hub.close = () => { for (const c of conns.values()) c.close(); conns.clear(); peer.destroy(); };
    return hub;
  }
  throw new Error('Could not open a room. Try again.');
}

// ------------------------------------------------------------------------------- guest
// link: { send(msg), close(), onMsg(msg), onClose() }
export async function joinRoom(code) {
  code = cleanCode(code);
  if (code.length !== 5) throw new Error('Room codes have five letters.');
  if (localMode()) return localLink(code);
  const { Peer } = await import('peerjs');
  const peer = new Peer(undefined, peerOptions());
  try {
    await withTimeout(new Promise((res, rej) => { peer.once('open', res); peer.once('error', rej); }), 12000, 'The matchmaking server did not answer.');
    const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'raw' });
    await withTimeout(new Promise((res, rej) => { conn.once('open', res); conn.once('error', rej); peer.once('error', rej); }), 15000, 'No game answered with that code.');
    let closed = false;
    const link = { onMsg() {}, onClose() {} };
    const end = () => { if (closed) return; closed = true; peer.destroy(); link.onClose(); };
    conn.on('data', (d) => { try { link.onMsg(typeof d === 'string' ? JSON.parse(d) : d); } catch (e) { console.warn('bad message', e); } });
    conn.on('close', end);
    conn.on('error', end);
    peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
    link.send = (msg) => { if (conn.open) conn.send(JSON.stringify(msg)); };
    link.close = () => { closed = true; conn.close(); peer.destroy(); };
    return link;
  } catch (e) {
    peer.destroy();
    throw new Error(peerError(e));
  }
}

// ------------------------------------------------------------------------------- same-browser channel
function localHub(code) {
  const bc = new BroadcastChannel('ashencrown-' + code);
  const peers = new Set();
  const hub = { code, onJoin() {}, onMsg() {}, onLeave() {} };
  bc.onmessage = (e) => {
    const m = e.data;
    if (m.to !== 'host') return;
    if (m.k === 'hi') { peers.add(m.from); bc.postMessage({ to: m.from, k: 'ok' }); hub.onJoin(m.from); }
    else if (m.k === 'm' && peers.has(m.from)) hub.onMsg(m.from, m.d);
    else if (m.k === 'bye' && peers.delete(m.from)) hub.onLeave(m.from);
  };
  hub.send = (id, msg) => { if (peers.has(id)) bc.postMessage({ to: id, k: 'm', d: msg }); };
  hub.drop = (id) => { if (peers.delete(id)) bc.postMessage({ to: id, k: 'bye' }); };
  hub.close = () => { for (const id of peers) bc.postMessage({ to: id, k: 'bye' }); peers.clear(); bc.close(); };
  return Promise.resolve(hub);
}

function localLink(code) {
  const bc = new BroadcastChannel('ashencrown-' + code);
  const me = 'g' + Math.random().toString(36).slice(2, 9);
  const link = { onMsg() {}, onClose() {} };
  let closed = false;
  return withTimeout(new Promise((res) => {
    bc.onmessage = (e) => {
      const m = e.data;
      if (m.to !== me) return;
      if (m.k === 'ok') res(link);
      else if (m.k === 'm') link.onMsg(m.d);
      else if (m.k === 'bye' && !closed) { closed = true; bc.close(); link.onClose(); }
    };
    bc.postMessage({ to: 'host', from: me, k: 'hi' });
  }), 3000, 'No game is open with that code.').then(() => {
    link.send = (msg) => { if (!closed) bc.postMessage({ to: 'host', from: me, k: 'm', d: msg }); };
    link.close = () => { if (closed) return; closed = true; bc.postMessage({ to: 'host', from: me, k: 'bye' }); bc.close(); };
    return link;
  }, (e) => { bc.close(); throw e; });
}
