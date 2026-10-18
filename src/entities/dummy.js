// Training dummy: a straw target on a post for the tutorial. It takes hits (numbers, sparks, the
// white impact flash and a wobble) but never fights back, never moves and never dies.
import { Entity } from './entity.js';
import { Pix, PPU } from '../px/pix.js';
import { view } from '../px/view.js';
import { addObject, removeObject } from '../px/scene.js';
import { variant } from '../px/actor.js';
import { groundHeight } from '../world/terrain.js';

let SPR = null;
// drawn natively at the game's pixel density (PPU 16): about 3 world units tall
function dummySprite() {
  if (SPR) return SPR;
  const p = new Pix(32, 52);
  // palette ramps (src/px/palette.js): wood for the post, sand / gold for the straw, cream and red paint
  const wood = '#77492f', woodL = '#94603c', woodD = '#5a3628', straw = '#cfa978', strawL = '#e2c494', strawD = '#b08a64', strawDD = '#8a6a52';
  // stake base and post
  p.rect(8, 46, 16, 3, '#5a3628'); p.rect(8, 46, 16, 1, '#77492f'); p.rect(20, 47, 4, 2, '#3f2622');
  for (let y = 22; y <= 47; y++) { p.set(14, y, woodL); p.set(15, y, y % 5 === 0 ? woodD : wood); p.set(16, y, woodD); }
  // crossbar arms, rope-bound at the ends, straw sticking out
  for (let x = 3; x <= 28; x++) { p.set(x, 20, woodL); p.set(x, 21, x % 6 === 0 ? woodD : wood); p.set(x, 22, '#5a3628'); }
  for (const x of [5, 6, 25, 26]) { p.set(x, 20, strawD); p.set(x, 21, strawDD); p.set(x, 22, strawDD); }
  for (const [x, y, c] of [[2, 18, strawL], [1, 19, straw], [0, 20, strawL], [1, 22, straw], [2, 23, strawD], [0, 22, strawL], [29, 18, strawL], [30, 19, straw], [31, 21, strawL], [30, 22, straw], [29, 23, strawD], [31, 19, strawL]]) p.set(x, y, c);
  // straw sack body: vertical straw strands, lit upper left
  for (let y = 18; y <= 41; y++) for (let x = 6; x <= 26; x++) {
    const nx = (x + 0.5 - 16) / 9.2, ny = (y + 0.5 - 29.5) / 11.2;
    if (nx * nx + ny * ny > 1) continue;
    const l = -nx * 0.6 - ny * 0.5;
    let c = l > 0.45 ? strawL : l > -0.35 ? straw : strawD;
    if ((x * 3 + (y >> 2)) % 5 === 0) c = c === strawL ? straw : c === straw ? strawD : strawDD;
    p.set(x, y, c);
  }
  // painted target
  p.disc(16, 29.5, 5.6, '#efdab4'); p.disc(16, 29.5, 4.3, '#b04a3e'); p.disc(16, 29.5, 2.8, '#efdab4'); p.disc(16, 29.5, 1.5, '#b04a3e');
  p.set(13, 26, '#fff4dc'); p.set(14, 26, '#fff4dc'); p.set(19, 33, '#8a3434');
  // rope belt with a knot
  for (let x = 8; x <= 24; x++) { p.set(x, 37, x % 2 ? strawD : '#94603c'); p.set(x, 38, strawDD); }
  p.rect(10, 37, 2, 3, '#94603c'); p.set(10, 40, strawD); p.set(11, 41, strawD);
  // burlap head: stitched eyes and mouth, straw tufts on top
  for (let y = 5; y <= 19; y++) for (let x = 8; x <= 24; x++) {
    const nx = (x + 0.5 - 16) / 7.2, ny = (y + 0.5 - 12.5) / 7.2;
    if (nx * nx + ny * ny > 1) continue;
    const l = -nx * 0.6 - ny * 0.6;
    let c = l > 0.4 ? '#e2c494' : l > -0.4 ? '#cfa978' : '#b08a64';
    if ((x >> 1) % 3 === 0 && (y >> 1) % 2 === 0 && l <= 0.4) c = l > -0.4 ? '#b08a64' : '#8a6a52';   // burlap weave in clusters
    p.set(x, y, c);
  }
  for (const ex of [12, 19]) for (const [dx, dy] of [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]]) p.set(ex + dx - 1, 10 + dy, '#3f2622');
  for (let x = 12; x <= 20; x++) p.set(x, 16, x % 2 ? '#5a3628' : '#3f2622');
  for (const x of [12, 14, 16, 18, 20]) { p.set(x, 15, '#5a3628'); p.set(x, 17, '#5a3628'); }
  for (const [x, y, c] of [[11, 5, strawL], [12, 4, straw], [14, 4, strawL], [15, 3, strawL], [17, 3, straw], [18, 4, strawL], [20, 4, straw], [21, 5, strawD], [16, 2, strawL]]) p.set(x, y, c);
  p.rim(1.15, 0.8);
  p.outline();
  p.ox = 16; p.oy = 49;
  SPR = p;
  return p;
}

class DummyModel {
  constructor(ent) { this.ent = ent; this.sortZ = ent.pos.z; this.hidden = false; this.flash = null; this.heightPx = 48; this.wob = 0; this.t = 0; }
  attach() { addObject(this); }
  detach() { removeObject(this); }
  update(dt) { this.t += dt; this.sortZ = this.ent.pos.z; this.wob = Math.max(0, this.wob - dt); }
  shadow(ctx) {
    const x = Math.round(this.ent.pos.x * PPU - view.x0), y = Math.round(this.ent.pos.z * PPU - view.y0);
    ctx.fillStyle = 'rgba(12,6,16,0.35)'; ctx.fillRect(x - 10, y - 2, 21, 4); ctx.fillRect(x - 7, y + 2, 15, 2);
  }
  draw(ctx) {
    if (this.hidden) return;
    let p = dummySprite();
    if (this.flash === 'white') p = variant(p, 'white'); else if (this.flash === 'hurt') p = variant(p, 'hurt');
    const shake = this.wob > 0 ? Math.round(Math.sin(this.t * 55) * 3 * (this.wob / 0.35)) : 0;
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
