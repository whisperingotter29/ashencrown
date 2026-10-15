// Training dummy: a straw target on a post for the tutorial. It takes hits (numbers, sparks, the
// white impact flash and a wobble) but never fights back, never moves and never dies.
import { Entity } from './entity.js';
import { Pix, PPU } from '../px/pix.js';
import { view } from '../px/view.js';
import { addObject, removeObject } from '../px/scene.js';
import { variant } from '../px/actor.js';
import { groundHeight } from '../world/terrain.js';

let SPR = null;
function dummySprite() {
  if (SPR) return SPR;
  const p = new Pix(20, 32);
  const wood = '#6a4a2a', woodD = '#4a3018', straw = '#c8a060', strawL = '#e8c878', strawD = '#8a6a3a';
  p.rect(5, 29, 10, 2, '#5a3a20');                       // stake base
  p.rect(9, 15, 2, 15, wood); p.rect(10, 15, 1, 15, woodD); // post
  p.rect(2, 13, 16, 2, '#7a5530'); p.rect(2, 14, 16, 1, '#5a3a20'); // crossbar arms
  for (const [x, y, c] of [[1, 12, strawL], [1, 15, straw], [0, 13, strawL], [18, 12, strawL], [18, 15, straw], [19, 14, strawL]]) p.set(x, y, c);
  p.ellipse(10, 18, 5.5, 6.5, straw);                     // straw sack body
  p.ellipse(9, 16, 2.5, 3, strawL);
  p.disc(10, 18.5, 3.4, '#e8e0d0'); p.disc(10, 18.5, 2.3, '#c83020'); p.disc(10, 18.5, 1.1, '#e8e0d0'); // painted target
  p.rect(5, 23, 10, 1, strawD);                           // rope belt
  p.disc(10, 8, 4.3, '#b89060'); p.disc(9, 7, 2.2, '#cca878');   // burlap head
  for (const [x, y] of [[7, 7], [8, 8], [8, 7], [7, 8], [12, 7], [13, 8], [13, 7], [12, 8]]) p.set(x, y, (x + y) % 2 ? '#3a2a1a' : '#3a2a1a');
  p.rect(8, 10, 5, 1, '#5a3a20');                         // stitched mouth
  for (const [x, y] of [[7, 3], [10, 2], [13, 3], [9, 3], [11, 3]]) p.set(x, y, strawL);
  p.rim(1.15, 0.8);
  p.outline();
  p.ox = 10; p.oy = 31;
  SPR = p;
  return p;
}

class DummyModel {
  constructor(ent) { this.ent = ent; this.sortZ = ent.pos.z; this.hidden = false; this.flash = null; this.heightPx = 30; this.wob = 0; this.t = 0; }
  attach() { addObject(this); }
  detach() { removeObject(this); }
  update(dt) { this.t += dt; this.sortZ = this.ent.pos.z; this.wob = Math.max(0, this.wob - dt); }
  shadow(ctx) {
    const x = Math.round(this.ent.pos.x * PPU - view.x0), y = Math.round(this.ent.pos.z * PPU - view.y0);
    ctx.fillStyle = 'rgba(12,6,16,0.35)'; ctx.fillRect(x - 6, y - 1, 13, 3); ctx.fillRect(x - 4, y + 2, 9, 1);
  }
  draw(ctx) {
    if (this.hidden) return;
    let p = dummySprite();
    if (this.flash === 'white') p = variant(p, 'white'); else if (this.flash === 'hurt') p = variant(p, 'hurt');
    const shake = this.wob > 0 ? Math.round(Math.sin(this.t * 55) * 2 * (this.wob / 0.35)) : 0;
    const x = Math.round(this.ent.pos.x * PPU - view.x0) + shake, y = Math.round(this.ent.pos.z * PPU - view.y0);
    ctx.drawImage(p.canvas(), x - p.ox, y - p.oy);
  }
}

export class TrainingDummy extends Entity {
  constructor(x, z) {
    super();
    this.name = 'Training Dummy';
    this.isDummy = true;
    this.team = 'enemy';
    this.level = 1;
    this.maxHp = this.hp = 1e9;
    this.armor = 0;
    this.radius = 0.55;
    this.height = 2.4;
    this.tpl = { name: 'Training Dummy' };
    this.tplId = 'training_dummy';
    this.pos.set(x, groundHeight(x, z), z);
    this.attachModel(new DummyModel(this));
  }
  update(dt) {
    this.knock.set(0, 0, 0);                    // planted in the ground
    this.baseUpdate(dt);
    if (this.lastHitT !== undefined && this.lastHitT !== this._seenHit) { this._seenHit = this.lastHitT; this.model.wob = 0.35; }
    this.hp = this.maxHp;
    this.syncModel(dt);
  }
}
