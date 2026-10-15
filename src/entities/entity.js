// Base entity: position, ground snapping, collision, knockback, model sync & animation.
import { Vec3 } from '../core/vec3.js';
import { G } from '../game.js';
import { groundHeight, waterLevel } from '../world/terrain.js';
import { resolveStatic } from '../systems/collision.js';
import { updateStatus, setFlash } from '../systems/combat.js';
import { dampAngle } from '../core/math.js';
import { dungeonBlocked } from '../world/dungeonQuery.js';

let nextId = 1;

export class Entity {
  constructor() {
    this.id = nextId++;
    this.pos = new Vec3();
    this.vel = new Vec3();
    this.knock = new Vec3();
    this.facing = 0;
    this.radius = 0.5;
    this.height = 1.8;
    this.hp = 100; this.maxHp = 100;
    this.armor = 0;
    this.level = 1;
    this.team = 'enemy';
    this.res = {};
    this.status = {};
    this.dead = false;
    this.deathT = 0;
    this.st = { t: 0, moveSpeed: 0, runSpeed: 6, action: null, actionT: 0, kind: null, seed: Math.random() * 10 };
    this.model = null;
    this.hitFlash = 0;
    this.hitT = 0;
    this.moveSpeedNow = 0;
    this.removed = false;
    this.grounded = true;
    this.yOffset = 0;
  }

  // model = a pixel Actor (src/px/actor.js) that draws this entity
  attachModel(actor) {
    if (this.model && this.model !== actor) this.model.detach();
    this.model = actor;
    actor.attach();
    actor.sortZ = this.pos.z;
  }

  // Move by (dx, dz) with collision; returns actual movement
  move(dx, dz, dt) {
    const ox = this.pos.x, oz = this.pos.z;
    let nx = ox + dx, nz = oz + dz;
    if (G.realm === 'dungeon') {
      const r = dungeonBlocked(nx, nz, this.radius, ox, oz);
      nx = r.x; nz = r.z;
    } else {
      // slope and deep water
      const h0 = this.pos.y, h1 = groundHeight(nx, nz);
      const step = Math.hypot(dx, dz) || 0.0001;
      const wl = waterLevel(nx, nz);
      const deep = h1 < wl - 1.4 && !(this.isPlayer && this.canSwim);
      if ((h1 - h0) / step > 1.25 || deep) {
        // try sliding along each axis
        const hx = groundHeight(nx, oz), hz = groundHeight(ox, nz);
        const okx = (hx - h0) / Math.max(0.0001, Math.abs(dx)) <= 1.25 && !(hx < waterLevel(nx, oz) - 1.4 && !(this.isPlayer && this.canSwim));
        const okz = (hz - h0) / Math.max(0.0001, Math.abs(dz)) <= 1.25 && !(hz < waterLevel(ox, nz) - 1.4 && !(this.isPlayer && this.canSwim));
        if (okx && Math.abs(dx) > 0.0001) nz = oz; else if (okz && Math.abs(dz) > 0.0001) nx = ox; else { nx = ox; nz = oz; }
      }
      const r = resolveStatic(nx, nz, this.radius, this.pos.y);
      nx = r.x; nz = r.z;
    }
    this.pos.x = nx; this.pos.z = nz;
    return Math.hypot(nx - ox, nz - oz);
  }

  baseUpdate(dt) {
    this.st.t += dt;
    updateStatus(this, dt);
    // knockback
    if (this.knock.lengthSq() > 0.01) {
      this.move(this.knock.x * dt, this.knock.z * dt, dt);
      this.knock.multiplyScalar(Math.exp(-dt * 7));
    }
    const gy = G.realm === 'dungeon' ? (G.dungeon?.floorY ?? 0) : groundHeight(this.pos.x, this.pos.z);
    if (this.flying) this.pos.y = gy + this.flyH;
    else this.pos.y = gy + this.yOffset;
    // hit flash runs on real time so hitstop holds the white impact frame instead of stretching it
    if (this.hitFlash > 0) {
      const mode = this.hitFlash > 0.05 ? 'white' : 'hurt';
      if (this._flashing !== mode && !this._frozenVis) { setFlash(this, true, mode); this._flashing = mode; }
      this.hitFlash -= G.rawDt || dt;
      if (this.hitFlash <= 0 && this._flashing) { setFlash(this, false); this._flashing = false; }
    }
    this.hitT = Math.max(0, this.hitT - dt * 5);
    this.st.hitT = this.hitT;
  }

  syncModel(dt) {
    if (!this.model) return;
    this.st.moveSpeed = this.moveSpeedNow;
    this.st.dead = this.dead;
    this.st.deathT = this.deathT;
    this.model.update(dt);
  }

  faceTowards(x, z, dt, rate = 12) {
    const a = Math.atan2(x - this.pos.x, z - this.pos.z);
    this.facing = dt ? dampAngle(this.facing, a, rate, dt) : a;
  }

  distTo(e) { return Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z); }

  removeModel() {
    if (this.model) this.model.detach();
    this.removed = true;
  }
}
