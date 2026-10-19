// A co-op partner's hero on this screen. It is drawn and animated like the local hero and replays
// their swings, shots and spells, but their own game moves it and resolves everything it hits or
// takes: here it only follows their reports.
import { G } from '../game.js';
import { Player, classOutfit } from '../entities/player.js';
import { Actor } from '../px/actor.js';
import { raceLook, mountSpec } from '../px/specs.js';
import { RACE_BY_ID } from '../data/races.js';
import { CLASS_BY_ID } from '../data/classes.js';
import { MOUNTS } from '../data/mounts.js';
import { mulberry32 } from '../core/rng.js';
import { dampAngle } from '../core/math.js';
import { asGhost } from '../core/events.js';
import { replayAbility } from '../systems/abilities.js';
import { useSignature } from '../systems/classMech.js';
import { requestLight } from '../render/renderer.js';
import { burst } from '../render/vfx.js';

export class RemotePlayer extends Player {
  constructor(pid, char) {
    super(char);
    this.isPlayer = false;
    this.pid = pid;
    this.net = null;         // latest state report
    this.netHeld = false;    // still channelling
    this.away = false;       // in another realm or dungeon
    this.lastSeen = G.realTime;
  }

  get isRemote() { return true; }   // on the prototype, so it already holds while Player's constructor runs
  claimFocus() {}
  useMana() { return true; }
  useStamina() { return true; }

  buildModel() {
    const race = RACE_BY_ID[this.char.race];
    const lk = race.look;
    const rnd = mulberry32(this.char.name.length * 31 + this.char.race.length);
    const app = this.char.appearance || { skin: Math.floor(rnd() * lk.skin.length), hair: Math.floor(rnd() * lk.hair.length) };
    const cls = CLASS_BY_ID[this.char.cls];
    this.baseLook = { ...raceLook(lk, app, { shirt: cls.color, pants: '#3f2622', longHair: rnd() < 0.4 }), ...classOutfit(cls.id) };
    if (this.model) this.removeModel();
    this.removed = false;
    this.attachModel(new Actor(this, { type: 'human', look: this.baseLook, scale: lk.scale }));
    this.height = 1.9 * lk.scale;
  }

  // new gear, level or loadout
  setChar(char) {
    const looks = char.race !== this.char.race || char.cls !== this.char.cls || char.name !== this.char.name;
    this.char = char;
    this.name = char.name;
    if (looks) this.buildModel();
    this.refreshStats(false);
  }

  // a state report (20 a second)
  report(s) {
    const first = !this.net;
    this.net = s;
    this.netAt = G.realTime;
    this.lastSeen = G.realTime;
    this.away = s.rk !== G.net.realmKey();
    this.model.hidden = this.away;
    if (first || this.away) { this.pos.set(s.x, s.y, s.z); this.facing = s.f; }
    this.hp = s.hp; this.maxHp = s.mhp; this.mana = s.mn; this.maxMana = s.mmn;
    this.level = s.lv;
    this.aim.set(s.ax, this.pos.y + 1, s.az);
    this.netHeld = !!s.ch;
    this.stealthed = !!s.sl;
    this.blocking = !!s.b;
    if (s.dd && !this.dead) { this.dead = true; this.deathT = 0; }
    else if (!s.dd && this.dead) { this.dead = false; this.st.dead = false; this.deathT = 0; }
    const mount = s.mt || null;
    if (mount !== (this.mounted?.def.id || null)) {
      if (mount && MOUNTS[mount]) {
        const def = MOUNTS[mount];
        this.model.setMount(mountSpec(def));
        this.mounted = { def, st: { t: 0, moveSpeed: 0, runSpeed: def.speed * 0.6, seed: 1 } };
      } else { this.model.setMount(null); this.mounted = null; }
    }
  }

  // a discrete action: replay it so this screen shows the same swing, shot or spell
  replay(a) {
    if (this.away || this.dead) return;
    asGhost(this, () => {
      switch (a.a) {
        case 'atk':
          this.facing = a.f;
          this.action = { type: 'attack', t: 0, dur: a.d, strikeAt: a.s, cancelAt: a.ca, kind: a.k, combo: a.c, faceAim: true, hit: false, final: a.fi, lock: null, step: 0 };
          this.st.action = 'attack'; this.st.kind = a.k; this.st.actionT = 0; this.st.strikeU = a.s / a.d;
          break;
        case 'bolt':
          this.action = { type: 'bolt', t: 0, dur: a.d, strikeAt: a.d * 0.4, faceAim: true, el: a.el };
          this.st.action = 'attack'; this.st.kind = 'cast'; this.st.actionT = 0; this.st.strikeU = 0.4;
          break;
        case 'arrow': this.fireArrow(a.dr, a.k); break;
        case 'dodge': this.startDodge(a.dir); break;
        case 'ab':
          this.aim.x = a.ax; this.aim.z = a.az;
          this.cooldowns = {};
          replayAbility(this, a.id);
          break;
        case 'sig':
          this.aim.x = a.ax; this.aim.z = a.az;
          this.resource = a.r; this.cooldowns.signature = 0;
          useSignature(this);
          break;
        case 'pot':
          burst(this.pos.x, this.pos.y + 1, this.pos.z, { count: 14, speed: 3, color: a.id === 'mana_potion' ? '#80b0ff' : '#ff7070', life: 0.6, up: 1 });
          break;
      }
    });
  }

  update(dt) {
    asGhost(this, () => this.step(dt));
  }

  step(dt) {
    const n = this.net;
    if (!n || this.away) return;
    if (this.dead) {
      this.deathT += dt;
      this.st.dead = true; this.st.deathT = this.deathT;
      this.syncModel(dt);
      return;
    }
    this.baseUpdate(dt);
    this.invuln = Math.max(0, this.invuln - dt);
    // glide toward where their game says they are (a little ahead, to hide the delay)
    const age = Math.min(0.2, G.realTime - this.netAt);
    const tx = n.x + n.vx * age, tz = n.z + n.vz * age;
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    if (dx * dx + dz * dz > 100) { this.pos.x = tx; this.pos.z = tz; }
    else { const k = Math.min(1, dt * 14); this.pos.x += dx * k; this.pos.z += dz * k; }
    this.yOffset = n.yo || 0;
    this.moveSpeedNow = n.ms;
    this.vel.set(n.vx, 0, n.vz);
    if (!this.action || this.action.type === 'dodge') this.facing = dampAngle(this.facing, n.f, 18, dt);
    // replayed actions run their timing here (strikes, bolts, casts, channels)
    if (this.action) {
      if (this.action.type === 'dodge') { this.action.t += dt; if (this.action.t >= this.action.dur) this.action = null; }
      else this.updateAction(dt);
    } else if (n.a === 'attack' && (n.k === 'bowdraw' || n.k === 'xbow' || n.k === 'bowrelease')) {
      this.st.action = 'attack'; this.st.kind = n.k; this.st.actionT = n.at;
    } else if (!this.poseAnim) this.st.action = null;
    this.drawing = n.k === 'bowdraw' && n.a === 'attack';
    this.st.block = !!n.b;
    this.st.sprint = !!n.sp;
    this.st.ride = !!this.mounted;
    if (this.mounted) { this.mounted.st.t += dt; this.mounted.st.moveSpeed = this.moveSpeedNow; }
    this.st.dodgeT = this.action?.type === 'dodge' ? this.action.t / this.action.dur : -1;
    this.st.combat = !!n.cb;
    this.model.alpha = this.stealthed ? 0.3 : 1;
    if (this.lantern || G.realm !== 'surface') requestLight(this.pos.x, this.pos.y + 3, this.pos.z, G.realm === 'deep' ? '#c0d8ff' : '#ffc890', G.realm === 'deep' ? 10 : 7, 14);
    this.stepPose(dt);
    this.syncModel(dt);
  }
}
