// Online co-op for up to four players. One player hosts: their game runs the world (enemies,
// spawns, time of day, weather, where the party is) and friends join with their own saved heroes.
// Every game moves its own hero and takes its own hits. Guests send the hits they land on enemies
// to the host, who owns enemy health and tells everyone what the enemies do. Loot is personal:
// each player rolls their own drops, and XP is shared with partners close to a kill.
import { G } from '../game.js';
import { bus } from '../core/events.js';
import { hostRoom, joinRoom, PROTO } from './transport.js';
import { RemotePlayer } from './remotePlayer.js';
import { Enemy } from '../entities/enemy.js';
import { addEntity, clearSpawns } from '../systems/spawner.js';
import { dealDamage, killEntity, clearCombat, ghostly } from '../systems/combat.js';
import { atmo } from '../world/atmosphere.js';
import { weatherTable, setWeatherTable } from '../world/weather.js';
import { adoptDungeonBoss, applyMazeGrid } from '../world/dungeon.js';

export const MAX_PLAYERS = 4;
const ST_DT = 1 / 20;      // hero state reports
const ES_DT = 1 / 12;      // enemy snapshots
const W_DT = 2;            // time and weather
const RELEVANT = 160;      // enemies this close to a guest are mirrored to them
const SHARE = 75;          // partners this close to a kill share its XP and loot rolls
const TIMEOUT = 12;        // seconds of silence before a partner counts as gone

const r2 = (v) => Math.round(v * 100) / 100;
export const realmKey = () => (G.realm === 'dungeon' ? 'd:' + (G.dungeon?.def.id || '') : G.realm);

// what partners need to draw and replay a hero (not their bags, quests or map)
export function liteChar(c) {
  const { name, race, cls, level, stats, bonusStats, shrineBoons, equip, loadout, activeSlot, skills, skillBar, fateScar, appearance, title, activeMount } = c;
  return { name, race, cls, level, stats, bonusStats, shrineBoons, equip, loadout, activeSlot, skills, skillBar, fateScar, appearance, title, activeMount, mounts: [], flags: {}, consumables: {} };
}

const localSource = (src) => !!src && (src === G.player || src.owner === G.player || src.owner?.owner === G.player);
const pidOf = (src) => {
  if (!src) return 0;
  if (src === G.player || src.owner === G.player || src.owner?.owner === G.player) return G.net.me;
  const r = src.isRemote ? src : src.owner?.isRemote ? src.owner : src.owner?.owner?.isRemote ? src.owner.owner : null;
  return r ? r.pid : 0;
};

class Session {
  constructor(role) {
    this.role = role;
    this.me = role === 'host' ? 1 : 0;
    this.code = '';
    this.players = new Map();     // pid -> partner { pid, name, ghost, peer, rk, known, char }
    this.byPeer = new Map();
    this.byNet = new Map();       // netId -> enemy (host: the real one; guest: its mirror)
    this.nextNet = 1;
    this.nextPid = 2;
    this.stT = 0; this.esT = 0; this.wT = 0; this.lookT = 0;
    this.lookDirty = true;
    this.hits = [];
    this.applying = false;
    this.lastRk = realmKey();
    this.lastPos = { x: G.player.pos.x, z: G.player.pos.z };
    this.pullUntil = 0;
    this.offs = [];
    for (const ev of ['statsChanged', 'equipped', 'weaponSwap', 'kitChanged', 'levelUp']) this.offs.push(bus.on(ev, () => { this.lookDirty = true; }));
    this.offs.push(bus.on('fastTravelStart', () => { this.pullUntil = G.realTime + 4; }));
  }

  get isHost() { return this.role === 'host'; }
  realmKey() { return realmKey(); }
  ghosts() { const out = []; for (const pl of this.players.values()) if (pl.ghost) out.push(pl.ghost); return out; }
  partner(pid) { return this.players.get(pid); }
  roster() {
    const list = [{ pid: this.me, name: G.char.name, me: true, host: this.isHost, ghost: null }];
    for (const pl of this.players.values()) list.push({ pid: pl.pid, name: pl.name, host: pl.pid === 1, ghost: pl.ghost });
    return list.sort((a, b) => a.pid - b.pid);
  }
  leader() { return this.isHost ? G.player : this.players.get(1)?.ghost || null; }

  // ------------------------------------------------------------------------- sending
  sendTo(pl, msg) { if (this.isHost) this.hub.send(pl.peer, msg); }
  toAll(msg, except) { if (this.isHost) { for (const pl of this.players.values()) if (pl !== except) this.hub.send(pl.peer, msg); } else this.link.send(msg); }

  // ------------------------------------------------------------------------- hooks from the game
  // a hero action on this screen: partners replay it
  act(player, a, data) {
    if (player !== G.player) return;
    this.toAll({ t: 'ac', p: this.me, a, ...data });
  }

  // who resolves a hit: 0 = someone else's game, 1 = this one, 2 = a partner's replayed hit (show only)
  vetDamage(src, tgt, amount, o) {
    if (tgt.isRemote) return 0;
    if (bus.muted || ghostly(src)) return this.applying ? 1 : 2;
    if (tgt.netPuppet) {
      if (!localSource(src)) return 2;
      if (o.kind !== 'dot') {
        this.hits.push([tgt.netId, r2(amount), { k: o.kind, c: o.crit ? 1 : 0, e: o.element, s: o.status, kn: o.knock, sg: o.stagger, h: o.heavy ? 1 : 0, fx: r2(o.fromX ?? src?.pos.x ?? tgt.pos.x), fz: r2(o.fromZ ?? src?.pos.z ?? tgt.pos.z) }]);
      }
      tgt.predT = G.time;
    }
    return 1;
  }

  // an entity died here. Returns whether this player gets the kill (XP, loot, quest credit).
  onKill(tgt, src) {
    if (tgt === G.player || tgt.isRemote) return true;
    if (this.isHost && tgt.netId) {
      const msg = { t: 'ek', id: tgt.netId, k: pidOf(src) };
      for (const pl of this.players.values()) if (pl.known.has(tgt.netId)) this.sendTo(pl, msg);
    }
    if (tgt.team !== 'enemy' || localSource(src)) return true;
    const p = G.player;
    return Math.hypot(tgt.pos.x - p.pos.x, tgt.pos.z - p.pos.z) < SHARE;
  }

  // host: an enemy starts an attack; guests who see it replay it against the same target
  enemyAttack(e, i) {
    if (!this.isHost || !e.netId) return;
    const t = e.target;
    const tp = t === G.player ? 1 : t?.isRemote ? t.pid : 0;
    const msg = { t: 'ea', id: e.netId, i, tp, te: !tp && t?.netId ? t.netId : 0, x: r2(e.pos.x), z: r2(e.pos.z), f: r2(e.facing) };
    for (const pl of this.players.values()) if (pl.known.has(e.netId)) this.sendTo(pl, msg);
  }

  mazeShifted(d) {
    if (!this.isHost) return;
    let g = '';
    for (let i = 0; i < d.grid.length; i++) g += String.fromCharCode(48 + d.grid[i]);
    this.toAll({ t: 'mz', rk: realmKey(), g });
  }

  onSpawnsCleared() {
    if (this.isHost) return;
    this.byNet.clear();
    this.link.send({ t: 'rs' });
  }

  say(text) {
    text = String(text).slice(0, 160).trim();
    if (!text) return;
    bus.emit('netChat', { pid: this.me, name: G.char.name, text });
    this.toAll({ t: 'ch', p: this.me, m: text });
  }

  // guest: walk over to the party leader (or ask the host where they are)
  goToLeader() {
    if (this.isHost) return;
    const L = this.leader();
    if (L && !L.away) bus.emit('netTravel', { realm: G.realm, x: L.pos.x, z: L.pos.z, dg: null, near: true });
    else this.link.send({ t: 'rq' });
  }

  // ------------------------------------------------------------------------- per frame
  tick(dt) {
    const now = G.realTime;
    for (const pl of [...this.players.values()]) {
      if (now - pl.ghost.lastSeen > TIMEOUT) {
        if (this.isHost) this.dropPeer(pl.peer, `${pl.name} lost connection.`);
        else if (pl.pid === 1) return this.end('Lost connection to the host.');
      }
    }
    if (this.isHost) for (const [peer, t] of this.pending) if (now - t > 10) { this.pending.delete(peer); this.hub.drop(peer); }
    if ((this.stT -= dt) <= 0) { this.stT = ST_DT; this.toAll(this.stateMsg()); }
    if ((this.lookT -= dt) <= 0 && this.lookDirty) { this.lookT = 0.5; this.lookDirty = false; this.toAll({ t: 'lk', p: this.me, c: liteChar(G.char) }); }
    if (this.isHost) {
      if ((this.esT -= dt) <= 0) { this.esT = ES_DT; this.syncEnemies(); }
      if ((this.wT -= dt) <= 0) { this.wT = W_DT; this.toAll(this.worldMsg()); }
      this.watchTravel();
    } else if (this.hits.length) {
      this.link.send({ t: 'hi', h: this.hits });
      this.hits = [];
    }
  }

  stateMsg() {
    const p = G.player, st = p.st;
    return {
      t: 'st', p: this.me, rk: realmKey(), x: r2(p.pos.x), y: r2(p.pos.y), z: r2(p.pos.z), f: r2(p.facing),
      vx: r2(p.vel.x), vz: r2(p.vel.z), ms: r2(p.moveSpeedNow), a: st.action || 0, k: st.kind || 0, at: r2(st.actionT || 0),
      b: p.blocking ? 1 : 0, sp: p.sprinting ? 1 : 0, mt: p.mounted?.def.id || 0, hp: Math.ceil(p.hp), mhp: Math.round(p.maxHp),
      mn: Math.round(p.mana), mmn: Math.round(p.maxMana), lv: p.level, ax: r2(p.aim.x), az: r2(p.aim.z), yo: r2(p.yOffset || 0),
      sl: p.stealthed ? 1 : 0, dd: p.dead ? 1 : 0, ch: p.action?.type === 'channel' ? 1 : 0, cb: st.combat ? 1 : 0,
    };
  }

  worldMsg() { return { t: 'w', tod: atmo.timeOfDay, day: atmo.day, wx: weatherTable() }; }

  travelMsg() {
    const p = G.player.pos, d = G.dungeon;
    return { t: 'tv', realm: G.realm, x: r2(p.x), z: r2(p.z), dg: d ? { id: d.def.id, seed: d.seed, rr: d.returnRealm, rx: r2(d.returnPos.x), rz: r2(d.returnPos.z) } : null };
  }

  // host: the party follows when the leader changes realm, enters or leaves a dungeon, or fast travels
  watchTravel() {
    const rk = realmKey(), p = G.player.pos;
    const jump = Math.hypot(p.x - this.lastPos.x, p.z - this.lastPos.z) > 30;
    if (rk !== this.lastRk || (jump && G.realTime < this.pullUntil)) { this.toAll(this.travelMsg()); this.pullUntil = 0; }
    this.lastRk = rk;
    this.lastPos = { x: p.x, z: p.z };
  }

  // host: mirror enemies near each guest to them. Rows that haven't changed are skipped, with a
  // full refresh every second.
  syncEnemies() {
    const rk = realmKey(), t = G.realTime;
    const full = (this.fullT = (this.fullT || 0) - ES_DT) <= 0;
    if (full) this.fullT = 1;
    const live = [];
    for (const e of G.entities) {
      if (!(e instanceof Enemy) || e.removed) continue;
      if (!e.netId) { e.netId = this.nextNet++; this.byNet.set(e.netId, e); }
      if (e._st !== undefined && t > e._st) { e._vx = (e.pos.x - e._sx) / (t - e._st); e._vz = (e.pos.z - e._sz) / (t - e._st); }
      e._sx = e.pos.x; e._sz = e.pos.z; e._st = t;
      if (!e.dead) {
        const flags = (e.frozen > 0 ? 1 : 0) | (e.stun > 0 || e.sleep > 0 ? 2 : 0) | (e.model?.hidden ? 4 : 0) | (e.staggerT > 0 ? 8 : 0);
        e._row = [e.netId, r2(e.pos.x), r2(e.pos.z), r2(e.facing), Math.ceil(e.hp), r2(e._vx || 0), r2(e._vz || 0), r2(e.moveSpeedNow || 0), flags | ((e.phase || 1) - 1) << 6];
        e._rowKey = e._row.join();
      }
      live.push(e);
    }
    const alive = new Set(live);
    for (const [id, e] of this.byNet) {
      if (alive.has(e)) continue;
      this.byNet.delete(id);
      for (const pl of this.players.values()) { pl.rows.delete(id); if (pl.known.delete(id)) this.sendTo(pl, { t: 'er', ids: [id] }); }
    }
    for (const pl of this.players.values()) {
      if (pl.rk !== rk) { pl.known.clear(); pl.rows.clear(); continue; }
      const g = pl.ghost, rows = [], spawns = [], gone = [];
      for (const e of live) {
        const d = Math.hypot(e.pos.x - g.pos.x, e.pos.z - g.pos.z);
        const known = pl.known.has(e.netId);
        if (d > (e.boss ? 260 : RELEVANT) + (known ? 20 : 0)) { if (known) { pl.known.delete(e.netId); gone.push(e.netId); } continue; }
        if (e.dead) continue;
        if (!known) { pl.known.add(e.netId); spawns.push(this.spawnInfo(e)); }
        if (full || pl.rows.get(e.netId) !== e._rowKey) { rows.push(e._row); pl.rows.set(e.netId, e._rowKey); }
      }
      if (spawns.length) this.sendTo(pl, { t: 'en', rk, e: spawns });
      if (gone.length) { this.sendTo(pl, { t: 'er', ids: gone }); for (const id of gone) pl.rows.delete(id); }
      if (rows.length) this.sendTo(pl, { t: 'es', rk, e: rows });
    }
  }

  spawnInfo(e) {
    const o = e.spawnOpts || {};
    return {
      id: e.netId, t: e.tplId, l: e.level, x: r2(e.pos.x), z: r2(e.pos.z), f: r2(e.facing), hp: Math.ceil(e.hp), mh: e.maxHp,
      el: e.elite ? 1 : 0, af: e.affix?.id, sd: e.seed, n: o.name, hm: o.hpMult, dm: o.dmgMult, sc: o.scale, al: e.ally ? 1 : 0,
      db: e.dungeonBoss ? 1 : 0, wb: e.worldBossId, ph: e.phase || 1,
    };
  }

  // ------------------------------------------------------------------------- host: incoming
  hostMsg(peer, m) {
    if (m.t === 'hello') return this.admit(peer, m);
    const pl = this.byPeer.get(peer);
    if (!pl) return;
    pl.ghost.lastSeen = G.realTime;
    m.p = pl.pid;
    switch (m.t) {
      case 'st': pl.rk = m.rk; pl.ghost.report(m); this.toAll(m, pl); break;
      case 'ac': pl.ghost.replay(m); this.toAll(m, pl); break;
      case 'lk': pl.char = m.c; pl.name = m.c.name; pl.ghost.setChar(m.c); this.toAll(m, pl); bus.emit('netParty'); break;
      case 'hi': this.applyHits(pl, m.h); break;
      case 'rs': pl.known.clear(); pl.rows.clear(); break;
      case 'rq': this.sendTo(pl, { ...this.travelMsg(), near: true }); break;
      case 'ch': bus.emit('netChat', { pid: pl.pid, name: pl.name, text: String(m.m).slice(0, 160) }); this.toAll(m, pl); break;
    }
  }

  admit(peer, m) {
    this.pending.delete(peer);
    const deny = (why) => { this.hub.send(peer, { t: 'deny', why }); setTimeout(() => this.hub.drop(peer), 300); };
    if (m.v !== PROTO) return deny('Your game is a different version. Both players need the latest one.');
    if (this.players.size + 1 >= MAX_PLAYERS) return deny('The party is full.');
    if (!m.c?.race || !m.c?.cls) return deny('No hero to bring.');
    const pid = this.nextPid++;
    const ghost = new RemotePlayer(pid, m.c);
    ghost.pos.copy(G.player.pos);
    ghost.away = true;
    ghost.model.hidden = true;
    addEntity(ghost);
    const pl = { pid, peer, ghost, name: m.c.name, rk: null, known: new Set(), rows: new Map(), char: m.c };
    const others = [...this.players.values()];
    this.players.set(pid, pl);
    this.byPeer.set(peer, pl);
    this.hub.send(peer, {
      t: 'welcome', pid, code: this.code,
      players: [{ pid: 1, c: liteChar(G.char) }, ...others.map((o) => ({ pid: o.pid, c: o.char }))],
      tv: this.travelMsg(), w: this.worldMsg(),
    });
    for (const o of others) this.hub.send(o.peer, { t: 'pj', p: pid, c: m.c });
    this.lookDirty = true;
    bus.emit('netParty');
    bus.emit('netNotice', `${pl.name} joined the party.`);
  }

  applyHits(pl, hits) {
    if (!Array.isArray(hits)) return;
    for (const [id, a, o] of hits) {
      const e = this.byNet.get(id);
      if (!e || e.dead || !(a > 0)) continue;
      this.applying = true;
      try {
        dealDamage(pl.ghost, e, Math.min(a, 1e7), { kind: o.k, crit: !!o.c, element: o.e, status: o.s, knock: o.kn, stagger: o.sg, heavy: !!o.h, fromX: o.fx, fromZ: o.fz, quiet: true });
      } finally { this.applying = false; }
    }
  }

  dropPeer(peer, why) {
    this.pending.delete(peer);
    const pl = this.byPeer.get(peer);
    if (!pl) return;
    this.byPeer.delete(peer);
    this.hub.drop(peer);
    this.removePartner(pl.pid);
    this.toAll({ t: 'pl', p: pl.pid });
    bus.emit('netNotice', why || `${pl.name} left the party.`);
  }

  // ------------------------------------------------------------------------- guest: incoming
  guestMsg(m) {
    const pl = m.p ? this.players.get(m.p) : null;
    if (pl) pl.ghost.lastSeen = G.realTime;
    switch (m.t) {
      case 'st': if (pl) pl.ghost.report(m); break;
      case 'ac': if (pl) pl.ghost.replay(m); break;
      case 'lk': if (pl) { pl.name = m.c.name; pl.ghost.setChar(m.c); bus.emit('netParty'); } break;
      case 'pj': this.addPartner(m.p, m.c); bus.emit('netNotice', `${m.c.name} joined the party.`); break;
      case 'pl': { const who = this.players.get(m.p)?.name; this.removePartner(m.p); if (who) bus.emit('netNotice', `${who} left the party.`); break; }
      case 'ch': bus.emit('netChat', { pid: m.p, name: pl?.name || '?', text: String(m.m).slice(0, 160) }); break;
      case 'w': this.applyWorld(m); break;
      case 'tv': bus.emit('netTravel', m); break;
      case 'mz': if (m.rk === realmKey()) applyMazeGrid(m.g); break;
      case 'en': if (m.rk === realmKey()) for (const s of m.e) this.spawnMirror(s); break;
      case 'es': if (m.rk === realmKey()) this.applySnapshot(m.e); break;
      case 'er': for (const id of m.ids) this.dropMirror(id); break;
      case 'ea': this.mirrorAttack(m); break;
      case 'ek': this.mirrorKill(m); break;
    }
  }

  applyWelcome(m) {
    this.me = m.pid;
    this.code = m.code;
    for (const p of m.players) this.addPartner(p.pid, p.c);
    clearCombat();
    clearSpawns(true);
    this.applyWorld(m.w);
    bus.emit('netTravel', { ...m.tv, join: true });
  }

  applyWorld(m) {
    let d = m.tod - atmo.timeOfDay;
    if (d > 0.5) d -= 1; else if (d < -0.5) d += 1;
    atmo.timeOfDay = Math.abs(d) > 0.02 ? m.tod : (atmo.timeOfDay + d * 0.5 + 1) % 1;
    atmo.day = m.day;
    if (m.wx) setWeatherTable(m.wx);
  }

  addPartner(pid, c) {
    if (this.players.has(pid) || pid === this.me) return;
    const ghost = new RemotePlayer(pid, c);
    ghost.pos.copy(G.player.pos);
    ghost.away = true;
    ghost.model.hidden = true;
    addEntity(ghost);
    this.players.set(pid, { pid, name: c.name, ghost, known: new Set() });
    bus.emit('netParty');
  }

  removePartner(pid) {
    const pl = this.players.get(pid);
    if (!pl) return;
    this.players.delete(pid);
    const g = pl.ghost;
    g.removeModel();
    for (const e of G.entities) if (e.target === g) e.target = null;
    G.entities = G.entities.filter((e) => e !== g);
    bus.emit('netParty');
  }

  spawnMirror(s) {
    if (this.byNet.has(s.id)) return;
    const e = new Enemy(s.t, s.l, s.x, s.z, { elite: !!s.el, affix: s.af, seed: s.sd, name: s.n, hpMult: s.hm, dmgMult: s.dm, scale: s.sc, ally: !!s.al, dungeon: G.dungeon?.def.id || null });
    e.netPuppet = true;
    e.netId = s.id;
    e.maxHp = s.mh; e.hp = s.hp;
    e.facing = s.f;
    e.net = { x: s.x, z: s.z, f: s.f, vx: 0, vz: 0, ms: 0, flags: 0, ph: s.ph || 1, at: G.realTime };
    if (s.wb) e.worldBossId = s.wb;
    addEntity(e);
    this.byNet.set(s.id, e);
    if (s.db) adoptDungeonBoss(e);
  }

  applySnapshot(rows) {
    for (const r of rows) {
      const e = this.byNet.get(r[0]);
      if (!e || e.dead) continue;
      const n = e.net;
      n.x = r[1]; n.z = r[2]; n.f = r[3]; n.vx = r[5]; n.vz = r[6]; n.ms = r[7]; n.flags = r[8] & 63; n.ph = (r[8] >> 6) + 1; n.at = G.realTime;
      // keep this player's own hits showing until the host has counted them
      e.hp = G.time - (e.predT ?? -9) < 0.4 ? Math.min(e.hp, r[4]) : r[4];
      e.hp = Math.max(1, e.hp);
    }
  }

  dropMirror(id) {
    const e = this.byNet.get(id);
    this.byNet.delete(id);
    if (!e || e.removed) return;
    if (!e.dead) { e.dead = true; e.despawned = true; }
    e.removeModel();
  }

  mirrorAttack(m) {
    const e = this.byNet.get(m.id);
    if (!e || e.dead) return;
    const tgt = m.tp ? (m.tp === this.me ? G.player : this.players.get(m.tp)?.ghost) : this.byNet.get(m.te);
    if (!tgt || tgt.dead) return;
    if ((e.pos.x - m.x) ** 2 + (e.pos.z - m.z) ** 2 > 4) { e.pos.x = m.x; e.pos.z = m.z; }
    e.facing = m.f;
    e.target = tgt;
    e.state = 'chase';
    if (e.tele) e.tele.done = true;
    e.charging = false; e.beamActive = false; e.breathActive = false; e.burrowPhase = null;
    e.startAttack(m.i);
  }

  mirrorKill(m) {
    const e = this.byNet.get(m.id);
    if (!e || e.dead) return;
    const killer = m.k === this.me ? G.player : this.players.get(m.k)?.ghost || null;
    killEntity(e, killer);
  }

  // ------------------------------------------------------------------------- leaving
  end(why) {
    if (G.net !== this) return;
    G.net = null;
    for (const off of this.offs) off();
    for (const pid of [...this.players.keys()]) this.removePartner(pid);
    if (this.isHost) { try { this.hub.close(); } catch (e) { /* already closed */ } }
    else {
      try { this.link.close(); } catch (e) { /* already closed */ }
      // the host's enemies go with the host; this world fills with its own again
      clearCombat();
      clearSpawns(true);
    }
    for (const e of G.entities) { delete e.netId; delete e.net; }
    bus.emit('netParty');
    bus.emit('netEnded', { why, wasGuest: !this.isHost });
  }
}

// ------------------------------------------------------------------------------- entry points
export async function hostGame() {
  if (G.net) throw new Error('Already in a co-op game.');
  const hub = await hostRoom();
  const s = new Session('host');
  s.hub = hub;
  s.code = hub.code;
  s.pending = new Map();
  hub.onJoin = (peer) => s.pending.set(peer, G.realTime);
  hub.onMsg = (peer, m) => { try { s.hostMsg(peer, m); } catch (e) { console.error('net', e); } };
  hub.onLeave = (peer) => s.dropPeer(peer);
  G.net = s;
  bus.emit('netParty');
  return s;
}

export async function joinGame(code) {
  if (G.net) throw new Error('Already in a co-op game.');
  const link = await joinRoom(code);
  const s = new Session('guest');
  s.link = link;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { link.close(); reject(new Error('The host did not answer.')); }, 10000);
    link.onClose = () => { clearTimeout(timer); if (G.net === s) s.end('The host closed the game.'); else reject(new Error('The host closed the connection.')); };
    link.onMsg = (m) => {
      if (G.net !== s) {
        if (m.t === 'deny') { clearTimeout(timer); link.close(); reject(new Error(m.why)); }
        else if (m.t === 'welcome') {
          clearTimeout(timer);
          G.net = s;
          link.onMsg = (mm) => { try { s.guestMsg(mm); } catch (e) { console.error('net', e); } };
          s.applyWelcome(m);
          bus.emit('netParty');
          resolve(s);
        }
        return;
      }
    };
    link.send({ t: 'hello', v: PROTO, c: liteChar(G.char) });
  });
}

export function leaveGame() { G.net?.end(); }

// closing the tab or quitting tells the party right away instead of after a timeout
window.addEventListener('pagehide', () => G.net?.end());
