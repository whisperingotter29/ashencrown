// Sprite actors: the pixel "model" of an entity.
//
// Humanoids are a small procedural rig: a baked body frame (legs, torso, head; see human.js) plus
// two arms drawn at runtime from the shoulder anchors to the hands, so the hands can follow the
// weapon. Every attack kind is a set of keyframes (anticipation -> strike -> impact hold ->
// follow-through -> recover) for the hand's angle and reach around the chest, the blade's roll,
// the lift and the body (stance, lunge, squash). Consecutive attacks blend from the pose the last
// one ended in, so held-mouse combo chains loop smoothly at any attack speed.
//
// Locomotion: a 6-frame run cycle with bob, squash on footfalls and stretch at push-off, arm swing,
// a leaning sprint, footstep dust, start lean and stop settle, idle breathing and blinking, dodge
// rolls in pixel-exact quarter turns with a stretch and afterimages, hurt recoil and a fall-down
// death. Creatures get squash/stretch, anticipation and lunges on their attack frames, recoil and
// death falls. Everything casts a directional shadow (see shadow.js).
import { glowPx } from '../render/renderer.js';
import { view } from './view.js';
import { Pix, PPU, C, ART, ap, OUTLINE } from './pix.js';
import { humanSprites } from './sprites/human.js';
import { creatureSprites } from './sprites/creatures.js';
import { weaponSprite, shieldSprite, tomeSprite, ELEM_GLOW } from './sprites/weapons.js';
import { addObject, removeObject } from './scene.js';
import { castSprite, castLine, contactBlob, sun } from './shadow.js';
import { particle } from '../render/vfx.js';

const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
const easeOut2 = (t) => 1 - (1 - t) * (1 - t);
const easeIn = (t) => t * t;
const easeIO = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const lerpAng = (a, b, t) => a + angDiff(a, b) * t;

// which way the rim light comes from right now: the sun by day (the side facing away from the
// shadows), cool moonlight from above at night, warm lantern light indoors and underground
let rimF = -1, rimS = null;
function rimNow() {
  if (rimF === sun.frame && rimS) return rimS;
  rimF = sun.frame;
  const dx = sun.lx > 0.2 ? -1 : sun.lx < -0.2 ? 1 : 0;
  if (sun._ind) rimS = { kind: 'rim:0:-1:#ffc890', a: 0.32 };
  else if (sun.a > 0.08) rimS = { kind: `rim:${dx}:-1:#fff2cc`, a: Math.min(0.75, 0.25 + sun.a * 1.2) };
  else rimS = { kind: 'rim:0:-1:#a8c0ff', a: 0.42 };
  return rimS;
}

// ------------------------------------------------------------------ pix variants (cached on the Pix)
export function variant(p, kind) {
  if (!p) return null;
  const k = '_v_' + kind;
  if (p[k]) return p[k];
  let v;
  if (kind === 'flip') v = p.flipX();
  else if (kind === 'white') v = p.silhouette('#ffffff');
  else if (kind === 'frozen') v = p.tinted('#a8d0ec', 0.7);
  else if (kind === 'hurt') v = p.tinted('#e46a5a', 0.5);
  else if (kind === 'xray') {
    // outline only: shows the shape through walls without painting over the visible parts
    v = new Pix(p.w + 2, p.h + 2); v.ox = p.ox + 1; v.oy = p.oy + 1;
    const A = (x, y) => (x < 0 || y < 0 || x >= p.w || y >= p.h ? 0 : p.d[(y * p.w + x) * 4 + 3]);
    for (let y = -1; y <= p.h; y++) for (let x = -1; x <= p.w; x++) {
      if (A(x, y) > 40) continue;
      if (A(x - 1, y) > 100 || A(x + 1, y) > 100 || A(x, y - 1) > 100 || A(x, y + 1) > 100) v.set(x + 1, y + 1, [255, 204, 72, 255]);
    }
  }
  else if (kind.startsWith('rim:')) {
    // rim light: the outline pixels that face the light pick up its colour, so bodies read as round
    const [, sdx, sdy, col] = kind.split(':'), dx = +sdx, dy = +sdy, L = C(col);
    v = new Pix(p.w, p.h); v.ox = p.ox; v.oy = p.oy;
    const A = (x, y) => (x < 0 || y < 0 || x >= p.w || y >= p.h ? 0 : p.d[(y * p.w + x) * 4 + 3]);
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      if (A(x, y) < 100 || A(x + dx, y + dy) > 40) continue;
      const i = (y * p.w + x) * 4;
      v.set(x, y, [Math.round(p.d[i] * 0.35 + L[0] * 0.65), Math.round(p.d[i + 1] * 0.35 + L[1] * 0.65), Math.round(p.d[i + 2] * 0.35 + L[2] * 0.65), 255]);
    }
  }
  else if (kind === 'stone') v = p.tinted('#827d82', 0.9);
  else if (kind === 'ghost') v = p.silhouette('#8cb8de');
  else if (kind === 'smear') v = p.silhouette('#fff4dc');
  else if (kind.startsWith('smear:')) {
    // pale silhouette of the outer part of a blade (the bit that whips through the air)
    const [, col, from] = kind.split(':');
    v = new Pix(p.w, p.h); v.ox = p.ox; v.oy = p.oy;
    const c = C(col), x0 = p.ox + (+from || 0);
    for (let y = 0; y < p.h; y++) for (let x = Math.max(0, x0); x < p.w; x++) if (p.d[(y * p.w + x) * 4 + 3] > 100) v.set(x, y, c);
  } else if (kind.startsWith('rot')) v = p.rot90(+kind.slice(3));
  else if (kind.startsWith('aura:')) {
    v = new Pix(p.w + 2, p.h + 2); v.ox = p.ox + 1; v.oy = p.oy + 1;
    v.blit(p, 1, 1); v.outline(C(kind.slice(5)));
  } else v = p;
  p[k] = v;
  return v;
}
function blit(ctx, p, x, y, k, rot, flip) {
  if (!p) return;
  if (flip) p = variant(p, 'flip');
  const cv = p.canvas();
  if (rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.drawImage(cv, -p.ox * k, -p.oy * k, p.w * k, p.h * k);
    ctx.restore();
  } else ctx.drawImage(cv, x - p.ox * k, y - p.oy * k, p.w * k, p.h * k);
}

// draw a quarter-turned copy of a frame so that sprite point (cx, cy) lands on screen (X, Y)
function rotFrame(p, q, cx, cy) {
  const r = variant(p, 'rot' + q), sw = p.w, sh = p.h;
  const at = q === 1 ? [sh - 1 - cy, cx] : q === 2 ? [sw - 1 - cx, sh - 1 - cy] : q === 3 ? [cy, sw - 1 - cx] : [cx, cy];
  return { pix: r, dx: r.ox - at[0], dy: r.oy - at[1] };
}

// screen-space aim angle from a world facing (0 = +z = down the screen)
const screenAngle = (f) => Math.atan2(Math.cos(f), Math.sin(f));
const CASTS = new Set(['cast', 'castup', 'nova']);
const POLES = new Set(['spear', 'halberd', 'staff']);
const TWO_H = new Set(['greatsword', 'halberd', 'spear', 'staff', 'crossbow']);
const HEAVY = new Set(['overhead', 'slam', 'sweep', 'spearthrust', 'nova']);

// Every body is drawn at its true size in the one pixel density (big bosses used to be drawn
// small and blown up 2-5x, which made their pixels chunkier than everything around them).
// Kept as a function so callers stay simple; k is always 1 now.
export function upscaleFor() { return 1; }

// ------------------------------------------------------------------ runtime limb colours
// arm palettes per flash mode, as css strings (the arms are drawn with fillRect every frame)
const css = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
function tintC(c, t, k) { const l = (c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15) / 255; return [c[0] + (t[0] * (0.4 + l) - c[0]) * k, c[1] + (t[1] * (0.4 + l) - c[1]) * k, c[2] + (t[2] * (0.4 + l) - c[2]) * k]; }
const MODES = { white: null, frozen: [C('#a8d0ec'), 0.7], hurt: [C('#e46a5a'), 0.5], stone: [C('#827d82'), 0.9] };
function limbPal(pal, mode, aura) {
  const key = '_lp_' + (mode || '') + (aura || '');
  if (pal[key]) return pal[key];
  const f = (c) => {
    if (mode === 'white') return '#ffffff';
    if (mode === 'ghost') return '#8cb8de';
    if (MODES[mode]) return css(tintC(c, MODES[mode][0], MODES[mode][1]));
    return css(c);
  };
  // arms carry the same violet-black ink outline as the body, with only a hint of the sleeve in it
  const ink = (c) => css([OUTLINE[0] * 0.88 + c[0] * 0.05, OUTLINE[1] * 0.88 + c[1] * 0.04, OUTLINE[2] * 0.88 + c[2] * 0.06]);
  const out = {
    o: mode === 'white' ? '#ffffff' : mode === 'ghost' ? '#8cb8de' : aura ? aura : ink(pal.sleeve),
    ho: mode === 'white' ? '#ffffff' : aura ? aura : ink(pal.hand),
    s: f(pal.sleeve), sl: f(pal.sleeveL), sd: f(pal.sleeveD), cf: f(pal.cuff), h: f(pal.hand), hl: f(pal.handL), hd: f(pal.handD), w: pal.w,
  };
  pal[key] = out;
  return out;
}

// ================================================================== Actor
export class Actor {
  // spec: { type: 'human', look, weapon?, shield?, tome?, scale } | { type: 'creature', creature: {...}, scale }
  constructor(ent, spec) {
    this.ent = ent;
    this.spec = spec;
    this.sortZ = 0;
    this.hidden = false;
    this.alpha = 1;
    this.flash = null;           // 'white' | 'frozen' | 'stone' | 'hurt'
    this.aura = null;            // elite outline colour
    this.t = Math.random() * 10;
    this.ph = 0;
    this.flip = false;
    this.viewName = 'down';
    this.ghosts = [];
    this.ghostT = 0;
    this.ops = [];               // emissive replay list
    this.segs = null;            // serpent segment world positions
    this.weapon = null; this.shield = null; this.tome = null;
    this.mount = null;           // { spr, k, ph }
    // animation state
    this.moving = false; this.settleT = 0; this.startT = 0; this.turn = 0; this.prevFacing = null;
    this.blinkT = 2 + Math.random() * 3; this.blink = 0;
    this.prevKind = null; this.prevU = 0; this.blend = null; this.atkT = 0;
    this.pose = null;            // last rig pose (for blending into the next attack)
    this.trail = [];             // recent blade states for the smear
    this.stepFi = -1; this.dustT = 0; this.deathDust = false; this.dodgeDust = false;
    this.shadowInfo = null;      // what to cast next frame
    this.build(spec);
  }

  build(spec) {
    this.spec = spec;
    if (spec.type === 'human') {
      const s = spec.scale || 1;
      this.k = upscaleFor(s, true);
      const ms = Math.max(0.8, Math.min(7, s));
      this.look = { ...spec.look, scale: ms };
      this.spr = humanSprites(this.look);
      this.kind = spec.kind || 'humanoid';
      this.sideOnly = false; this.frontOnly = false;
      this.setWeapon(spec.weapon || null);
      this.setShield(spec.shield || null);
      this.setTome(spec.tome || null);
    } else {
      const c = spec.creature;
      const s = c.s;
      this.k = upscaleFor(s, false);
      this.spr = creatureSprites({ ...c, s: s / this.k });
      this.kind = c.body;
      this.sideOnly = !!this.spr.sideOnly;
      this.frontOnly = !!this.spr.frontOnly;
    }
    this.heightPx = (this.spr.height || ap(24)) * this.k;
  }
  setLook(look) {
    if (this.spec.type !== 'human') return;
    const keep = [this.weapon, this.shield, this.tome];
    this.build({ ...this.spec, look, weapon: null, shield: null, tome: null });
    [this.weapon, this.shield, this.tome] = keep;
    this.refreshQuiver();
  }
  // giant bodies hold weapons drawn natively at their size (quarter steps keep the cache small)
  heldSpec(spec) {
    const hf = this.spr?.m?.hf || 1;
    return hf > 1.12 ? { ...spec, sz: Math.round(hf * 4) / 4 } : spec;
  }
  setWeapon(spec) { this.weapon = spec && spec.type !== 'claws' ? spec : null; this.refreshQuiver(); }
  setShield(spec) { this.shield = spec ? shieldSprite(spec) : null; }
  setTome(spec) { this.tome = spec ? tomeSprite(spec.color, spec.glow) : null; }
  setMount(spec) {
    if (!spec) { this.mount = null; return; }
    const k = upscaleFor(spec.s, false);
    this.mount = { spr: creatureSprites({ ...spec, s: spec.s / k }), k, ph: 0 };
  }
  // archers wear a quiver on the back
  refreshQuiver() {
    if (this.spec.type !== 'human' || !this.look) return;
    const q = !!this.weapon && (this.weapon.type === 'bow' || this.weapon.type === 'crossbow');
    if (!!this.look.quiver === q) return;
    this.look = { ...this.look, quiver: q };
    this.spr = humanSprites(this.look);
  }

  attach() { addObject(this); }
  detach() { removeObject(this); }

  // -------------------------------------------------------------- per-frame state
  update(dt) {
    const e = this.ent, st = e.st;
    this.t += dt;
    this.sortZ = e.pos.z;
    const spd = st.moveSpeed || 0;
    const moving = spd > 0.5 && !e.dead;
    // run cycle advances with distance so feet don't slide; 6 frames per stride
    if (moving) {
      const cyc = this.spec.type === 'human' ? Math.max(1.3, Math.min(4.4, spd / (st.sprint ? 2.5 : 1.95))) : Math.max(1.2, Math.min(4, spd / 2.6));
      this.ph += dt * cyc * 6;
    }
    if (this.mount && spd > 0.4) this.mount.ph += dt * Math.max(6, Math.min(14, spd * 0.9));
    // footsteps: dust at each contact frame
    const fi = Math.floor(this.ph) % 6;
    if (moving && fi !== this.stepFi && (fi === 0 || fi === 3) && !st.ride && !this.mount) this.footDust(fi === 0 ? -1 : 1, st.sprint ? 1.6 : 1);
    this.stepFi = fi;
    // start lean, stop settle (with a little puff)
    if (moving && !this.moving) this.startT = 0.14;
    if (!moving && this.moving && !st.action && !e.dead) { this.settleT = 0.13; if (spd < 0.5) this.footDust(0, 0.8); }
    this.moving = moving;
    this.startT = Math.max(0, this.startT - dt); this.settleT = Math.max(0, this.settleT - dt);
    // turning lean (side view)
    if (this.prevFacing !== null && dt > 0) {
      const dF = angDiff(this.prevFacing, e.facing) / dt;
      const target = moving ? Math.max(-1, Math.min(1, dF * 0.12)) : 0;
      this.turn += (target - this.turn) * Math.min(1, dt * 12);
    }
    this.prevFacing = e.facing;
    // blinking
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = 0.13; this.blinkT = 2.2 + Math.random() * 3.5; }
    this.blink = Math.max(0, this.blink - dt);
    // attack start detection -> blend from the previous pose
    const kind = st.action ? st.kind : null, u = st.actionT || 0;
    if (kind && (kind !== this.prevKind || u < this.prevU - 0.04)) { this.blend = this.pose ? { ...this.pose } : null; this.atkT = 0; this.trail.length = 0; }
    if (kind) this.atkT += dt;
    this.prevKind = kind; this.prevU = u;
    // dodge: dust on take-off and landing
    const dodging = st.dodgeT !== undefined && st.dodgeT >= 0;
    if (dodging && !this.dodgeDust) { this.dodgeDust = true; this.footDust(0, 1.4); }
    if (!dodging && this.dodgeDust) { this.dodgeDust = false; this.footDust(0, 1.2); this.settleT = 0.12; }
    // death: a thump of dust when the body hits the ground
    if (e.dead && !this.deathDust && (e.deathT || 0) > 0.34) { this.deathDust = true; this.footDust(0, 2); }
    if (!e.dead) this.deathDust = false;
    // afterimages while rolling / dashing / charging
    const dashing = dodging || st.charging || st.dash;
    this.ghostT -= dt;
    if (dashing && this.ghostT <= 0 && this._lastDraw) {
      this.ghostT = 0.035;
      this.ghosts.push({ parts: this._lastDraw, life: 0.22, wx: e.pos.x, wz: e.pos.z, wh: e.pos.y - view.ground(e.pos.x, e.pos.z) });
      if (this.ghosts.length > 7) this.ghosts.shift();
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) { this.ghosts[i].life -= dt; if (this.ghosts[i].life <= 0) this.ghosts.splice(i, 1); }
  }

  // pixel dust puffs at the feet (lit, not additive); n scales the amount
  footDust(side, n = 1) {
    const e = this.ent;
    if (e.flying || this.hidden || this.kind === 'wraith' || this.kind === 'eye' || this.kind === 'flyer' || this.kind === 'serpent' || this.kind === 'blob') return;
    const sx = e.pos.x * PPU - view.x0, sy = e.pos.z * PPU - view.y0;
    if (sx < -32 || sy < -32 || sx > view.W + 32 || sy > view.H + 32) return;
    if (e.swimming || e.wading) return;
    const gy = view.ground(e.pos.x, e.pos.z);
    if (e.pos.y - gy > 0.4) return;
    const f = e.facing, dx = Math.sin(f), dz = Math.cos(f);
    const big = Math.min(2.4, (this.spr?.m?.hf || this.k || 1) * (this.kind === 'quadruped' || this.kind === 'dragon' ? 1.4 : 1));
    const count = Math.max(1, Math.round((1 + Math.random()) * n));
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const ox = side ? -dz * side * 0.18 : 0, oz = side ? dx * side * 0.18 : 0;
      particle({
        x: e.pos.x + ox - dx * 0.15 + Math.cos(a) * 0.12 * big, y: gy + 0.05, z: e.pos.z + oz - dz * 0.15 + Math.sin(a) * 0.08 * big,
        vx: -dx * (0.8 + Math.random()) + Math.cos(a) * 0.7, vy: 0.9 + Math.random() * 0.7, vz: -dz * (0.8 + Math.random()) + Math.sin(a) * 0.4,
        life: 0.32 + Math.random() * 0.22, size: (0.24 + Math.random() * 0.12) * big, size1: 0.06,
        color: '#e2c494', color2: '#a8705a', alpha: 0.75, additive: false, gravity: 2.5, drag: 4,
      });
    }
  }

  // view with hysteresis so diagonals don't flicker between sprites
  pickView(f) {
    const dx = Math.sin(f), dz = Math.cos(f);
    if (Math.abs(dx) > 0.15) this.flip = dx < 0;
    if (this.sideOnly || this.mount || this.ent.st.ride) return 'side';
    if (this.frontOnly) return 'down';
    const ax = Math.abs(dx), cur = this.viewName;
    const sideT = cur === 'side' ? 0.62 : 0.78;
    let v;
    if (ax > sideT) v = 'side';
    else v = dz >= 0 ? 'down' : 'up';
    if (this.spr.views && !this.spr.views[v]) v = this.spr.views.down ? 'down' : 'side';
    this.viewName = v;
    return v;
  }

  // -------------------------------------------------------------- shadows
  // contact blob under the feet (always), bigger and softer when there is no sun to cast from
  shadow(ctx) {
    if (this.hidden || this.ent.removed) return;
    const e = this.ent;
    const x = Math.round(e.pos.x * PPU - view.x0), y = Math.round(e.pos.z * PPU - view.y0);
    let rx = this.spec.type === 'human' ? this.k * (this.spr.m ? this.spr.m.torsoW * 0.66 : 7) : Math.max(5, this.heightPx * (this.kind === 'serpent' ? 0.5 : 0.42));
    if (this.kind === 'quadruped' || this.kind === 'dragon' || this.kind === 'arachnid') rx *= 1.45;
    if (this.mount) rx = 9 * this.mount.k * (this.mount.spr.height / 16);
    const h = e.pos.y - view.ground(e.pos.x, e.pos.z) + (this.hoverPx || 0) / PPU;
    if (h < -0.3) return;
    const fade = h > 0.3 ? Math.max(0.3, 1 - h * 0.14) : 1;
    const noSun = !sun.cast || sun.a < 0.2;
    const soft = noSun ? 1.25 : 0.9;
    const a = (e.dead ? Math.max(0, 1 - e.deathT * 0.5) : 1) * this.alpha * (noSun ? 1 : 0.85);
    contactBlob(ctx, x, y, rx * fade * soft, Math.max(2, rx * 0.36 * fade * soft), a);
  }

  castShadow(sctx) {
    const s = this.shadowInfo;
    if (!s || this.hidden || this.ent.removed || !sun.cast) return;
    if (this.ent.dead && this.ent.deathT > 2) return;
    for (const b of s.bodies) castSprite(sctx, b.p, b.x, b.y, { h: b.h, k: b.k });
    for (const l of s.lines) castLine(sctx, l[0], l[1], l[2], l[3], l[4], l[5], l[6]);
  }

  // -------------------------------------------------------------- drawing
  draw(ctx) {
    this.ops.length = 0;
    this.shadowInfo = null;
    if (this.hidden) return;
    const e = this.ent;
    if (e.dead && e.deathT > (e.isPlayer || e.isRemote ? 1e9 : 2.6) && Math.floor(e.deathT * 14) % 2) return;
    const x = Math.round(e.pos.x * PPU - view.x0);
    const h = e.pos.y - view.ground(e.pos.x, e.pos.z);
    const y = Math.round(e.pos.z * PPU - view.y0 - h * PPU);
    // afterimages first (behind), tinted cool and fading
    if (!this._xray) for (const g of this.ghosts) {
      const gx = Math.round(g.wx * PPU - view.x0), gy = Math.round(g.wz * PPU - view.y0 - g.wh * PPU);
      ctx.globalAlpha = (g.life / 0.22) * 0.5 * this.alpha;
      for (const pt of g.parts) blit(ctx, variant(pt.p, 'ghost'), gx + pt.dx, gy + pt.dy, pt.k, pt.rot, pt.flip);
    }
    ctx.globalAlpha = this.alpha;
    this._draws = this._xray ? null : [];
    this.shadowInfo = { bodies: [], lines: [] };
    this._gx = x; this._gy = Math.round(e.pos.z * PPU - view.y0); this._gh = Math.round(h * PPU);
    if (h < -0.05) {
      // burrowing: only what is above the ground line shows
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - 200, y - 400 + Math.round(h * PPU), 400, 400);
      ctx.clip();
      if (this.spec.type === 'human') this.drawHuman(ctx, x, y); else this.drawCreature(ctx, x, y);
      ctx.restore();
      this.shadowInfo = null;
    } else if (this.spec.type === 'human') this.drawHuman(ctx, x, y);
    else this.drawCreature(ctx, x, y);
    ctx.globalAlpha = 1;
    if (this._draws && this._draws.length) this._lastDraw = this._draws;
  }

  // redraw the actor as an outline (used when something stands in front of the player)
  drawXray(ctx) {
    if (this.hidden || this.ent.dead) return;
    const ops = this.ops, ghosts = this.ghosts, pose = this.pose, trail = this.trail.slice(), si = this.shadowInfo, ld = this._lastDraw, tip = this._tipPx, hand = this._hand;
    this.ops = []; this.ghosts = []; this._xray = true;
    ctx.globalAlpha = 0.85;
    this.draw(ctx);
    ctx.globalAlpha = 1;
    this._xray = false; this.ops = ops; this.ghosts = ghosts; this.pose = pose; this.trail = trail; this.shadowInfo = si; this._lastDraw = ld; this._tipPx = tip; this._hand = hand;
  }

  // sprite blit with flash / tint / aura handling; records emissive ops, ghost parts and shadow casters
  body(ctx, fr, x, y, k, rot, flip, opts = {}) {
    let p = fr.pix;
    if (this._xray) { blit(ctx, variant(p, 'xray'), x, y, k, rot, flip); return; }
    if (this.flash === 'white') p = variant(p, 'white');
    else if (this.flash === 'frozen') p = variant(p, 'frozen');
    else if (this.flash === 'stone') p = variant(p, 'stone');
    else if (this.flash === 'hurt') p = variant(p, 'hurt');
    else if (this.aura && !opts.noAura) p = variant(p, 'aura:' + this.aura);
    blit(ctx, p, x, y, k, rot, flip);
    if (!rot && !this.flash && !opts.noRim) {
      const rim = rimNow(), a0 = ctx.globalAlpha;
      ctx.globalAlpha = a0 * rim.a;
      blit(ctx, variant(flip ? variant(fr.pix, 'flip') : fr.pix, rim.kind), x, y, k, 0, false);
      ctx.globalAlpha = a0;
    }
    if (fr.emis && this.flash !== 'stone' && this.flash !== 'frozen') this.ops.push([fr.emis, x, y, k, rot, flip, ctx.globalAlpha]);
    if (opts.record !== false && this._draws) this._draws.push({ p: fr.pix, dx: x - this._ax, dy: y - this._ay, k, rot, flip });
    if (opts.cast && this.shadowInfo && !rot) this.shadowInfo.bodies.push({ p: flip ? variant(fr.pix, 'flip') : fr.pix, x, y: opts.cast.y, h: opts.cast.h, k });
  }

  emissive(ctx) {
    for (const [p, x, y, k, rot, flip, a] of this.ops) {
      ctx.globalAlpha = a * (this.flash === 'white' ? 0.4 : 1);
      blit(ctx, p, x, y, k, rot, flip);
    }
    ctx.globalAlpha = 1;
  }

  glow(ctx) {
    if (this.hidden || !this._glows) return;
    for (const g of this._glows) glowPx(ctx, g[0], g[1], g[2], g[3], g[4] * this.alpha);
  }

  // ---------------------------------------------------------------- limbs (runtime arms)
  // a 3-4 px arm from the shoulder to the hand: 1-px outline, a lit upper-left edge, a shaded
  // lower-right edge, a sleeve fold half way and a cuff before the hand
  limb(ctx, x0, y0, x1, y1, k, P, w) {
    if (this._xray) return;
    const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / k));
    const hw = w >> 1;
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push([Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n)]);
    ctx.fillStyle = P.o;
    for (const [x, y] of pts) ctx.fillRect(x - (hw + 1) * k, y - (hw + 1) * k, (w + 2) * k, (w + 2) * k);
    ctx.fillStyle = P.s;
    for (const [x, y] of pts) ctx.fillRect(x - hw * k, y - hw * k, w * k, w * k);
    // shading: shadowed lower-right edge, lit upper-left edge
    ctx.fillStyle = P.sd;
    for (const [x, y] of pts) { ctx.fillRect(x + (w - 1 - hw) * k, y - hw * k, k, w * k); ctx.fillRect(x - hw * k, y + (w - 1 - hw) * k, w * k, k); }
    ctx.fillStyle = P.sl;
    for (let i = 0; i < pts.length - 1; i++) ctx.fillRect(pts[i][0] - hw * k, pts[i][1] - hw * k, k, k);
    // a fold at the elbow
    if (n >= 6) { const c = pts[n >> 1]; ctx.fillStyle = P.sd; ctx.fillRect(c[0] - hw * k, c[1] - hw * k, (w - 1) * k, k); }
    // cuff just before the hand
    if (n >= 3) { const c = pts[n - 1]; ctx.fillStyle = P.cf; ctx.fillRect(c[0] - hw * k, c[1] - hw * k, w * k, w * k); }
  }
  // a rounded fist: knuckles lit on top, shaded underneath
  hand(ctx, x, y, k, P, w) {
    if (this._xray) return;
    const s = Math.max(3, w);
    const hx = x - (s >> 1) * k, hy = y - (s >> 1) * k;
    ctx.fillStyle = P.ho; ctx.fillRect(hx - k, hy, (s + 2) * k, s * k); ctx.fillRect(hx, hy - k, s * k, (s + 2) * k);
    ctx.fillStyle = P.h; ctx.fillRect(hx, hy, s * k, s * k);
    ctx.fillStyle = P.hd; ctx.fillRect(hx + (s - 1) * k, hy + k, k, (s - 1) * k); ctx.fillRect(hx + k, hy + (s - 1) * k, (s - 1) * k, k);
    ctx.fillStyle = P.hl; ctx.fillRect(hx, hy, (s - 1) * k, k); ctx.fillRect(hx, hy, k, (s - 1) * k);
    if (s >= 4) { ctx.fillStyle = P.hd; ctx.fillRect(hx + k, hy + k, k, k); }
  }

  // ================================================================ humanoids
  drawHuman(ctx, x, y) {
    const e = this.ent, st = e.st, k = this.k, m = this.spr.m;
    this._ax = x; this._ay = y;
    this._glows = null;
    // U: today's pixels per old design pixel for this body (ART, more for giant bosses)
    const U = m.u, q = (v) => Math.round(v * U);
    const kind = st.action ? st.kind : null;
    const u = clamp01(st.actionT || 0);
    const su = st.strikeU || 0.5;
    const spd = st.moveSpeed || 0;
    const moving = this.moving;
    const wpn = this.weapon && !e.dead ? this.weapon : null;
    const wtype = wpn ? wpn.type : null;
    // spinning attacks turn the whole body through the views
    let facing = e.facing;
    if (st.spin) facing = this.t * 17;
    const vName = this.pickView(facing);
    const flip = vName === 'side' && this.flip;
    const alpha = screenAngle(facing);
    const dx = Math.cos(alpha), dy = Math.sin(alpha);
    const side = { x: Math.cos(alpha + Math.PI / 2), y: Math.sin(alpha + Math.PI / 2) };   // the weapon-hand side
    const dodging = st.dodgeT !== undefined && st.dodgeT >= 0;
    const hurt = (st.hitT || 0) > 0.35 && !e.dead && !kind;

    // ---- mount underneath
    let bx = x, by = y, rideH = 0;
    if (this.mount && st.ride) {
      const M = this.mount, MV = M.spr.views.side;
      const fr = spd > 0.4 ? MV.run[Math.floor(M.ph) % 4] : MV.idle[Math.floor(this.t * 1.5) % 2];
      this.body(ctx, fr, x, y, M.k, 0, this.flip, { noAura: true, cast: { y: this._gy, h: this._gh } });
      const seat = M.spr.seat || [0, -ap(14)];
      bx = x + (this.flip ? -seat[0] : seat[0]) * M.k;
      by = y + seat[1] * M.k + (m.feet - m.legTop) * k + (spd > 0.4 && Math.floor(M.ph) % 2 ? -q(1) : 0);
      rideH = y - by;
    }

    // ---- body pose (offsets in today's pixels)
    const pose = { legs: 'stand', ph: 0, bob: 0, lean: 0, hdx: 0, hdy: 0, cape: Math.floor(this.t * 3.2) % 4, sway: 0, face: this.blink > 0 ? 1 : 0, wing: Math.floor(this.t * 9) % 2 };
    let rot = 0, roll = 0, lift = 0, offX = 0, offY = 0;
    let deathPhase = -1;
    const atk = kind ? attackPose(kind, u, su, wtype) : null;
    if (e.dead) {
      const dt = e.deathT || 0;
      deathPhase = dt < 0.12 ? 0 : dt < 0.3 ? 1 : 2;
      if (deathPhase === 0) { pose.legs = 'stance'; pose.face = 2; pose.hdy = -q(1); offX = -dx * q(2); offY = -dy * q(2); }
      else if (deathPhase === 1) { pose.legs = 'kneel'; pose.bob = q(3); pose.face = 2; offX = -dx * q(2); offY = -dy * q(2); }
      else { pose.legs = 'stand'; pose.face = 1; }
    } else if (st.ride) {
      pose.legs = 'ride';
    } else if (dodging) {
      const du = clamp01(st.dodgeT);
      if (du < 0.14) { pose.legs = 'lunge'; pose.lean = q(2); pose.bob = q(1); }
      else if (du < 0.84) { pose.legs = 'tuck'; pose.bob = q(3); pose.hdy = q(1); roll = Math.min(3, Math.floor((du - 0.14) / 0.7 * 4)) + 1; lift = Math.round(Math.sin((du - 0.14) / 0.7 * Math.PI) * 3 * U); }
      else { pose.legs = 'stance'; pose.bob = q(2); }
    } else if (atk) {
      pose.legs = atk.legs; pose.bob = q(atk.bob); pose.lean = q(atk.lean); if (atk.face) pose.face = atk.face;
      offX = dx * atk.lunge * U; offY = dy * atk.lunge * U;
      if (moving) { pose.legs = 'run'; pose.ph = Math.floor(this.ph) % 6; }
    } else if (st.spin) {
      pose.legs = 'stance'; pose.bob = q(1);
    } else if (hurt) {
      pose.legs = 'stance'; pose.face = 2; pose.hdy = -q(1); pose.lean = -q(1);
      const r = ((st.hitT || 0) - 0.35) * 3 * U;
      offX = -dx * r; offY = -dy * r;
    } else if (st.block) {
      pose.legs = 'stance'; pose.bob = q(1);
    } else if (moving) {
      const sprint = !!st.sprint;
      pose.legs = sprint ? 'sprint' : 'run';
      pose.ph = Math.floor(this.ph) % 6;
      pose.bob = [0, q(1), -1, 0, q(1), -1][pose.ph];
      pose.lean = q(sprint ? 2 : 1);
      if (this.startT > 0) pose.lean += q(1);
      pose.sway = sprint ? 2 : 1;
      pose.cape = Math.floor(this.ph / 1.5) % 4;
      if (sprint) pose.hdy = q(1);
    } else if (this.settleT > 0) {
      pose.legs = 'stance'; pose.bob = this.settleT > 0.06 ? q(2) : q(1);
    } else if (st.combat) {
      pose.legs = 'stance'; pose.bob = Math.floor(this.t * 2.2 + (st.seed || 0)) % 2;
    } else {
      // breathing: shoulders drop a pixel every other beat
      pose.bob = Math.floor(this.t * 1.5 + (st.seed || 0)) % 2;
    }
    if (vName !== 'side') pose.lean = 0;
    else if (Math.abs(this.turn) > 0.5 && moving) pose.lean += q(1);
    if (pose.lean < -q(1)) pose.lean = -q(1);
    const fr = this.spr.frame(vName, pose);
    const lx = Math.round(offX), ly = Math.round(offY);
    const px = bx + lx * k, py = by + (ly - lift) * k;

    // ---- rig: shoulders and hands in screen px relative to the pivot (before upscale)
    const P = this.rig(vName, flip, pose, atk, kind, u, su, { dx, dy, side, alpha, moving, dodging, hurt, deathPhase });
    this.pose = P.save;

    // ---- compose (back-to-front)
    const L = limbPal(this.spr.pal, this.flash === 'white' || this.flash === 'frozen' || this.flash === 'stone' || this.flash === 'hurt' ? this.flash : null, this.aura);
    const w = this.spr.pal.w;
    const S = (q) => [px + Math.round(q[0]) * k, py + Math.round(q[1]) * k];
    // shadow anchoring: the ground line under the body and the pivot's height above it
    const gY = this._gy + ly * k, gH = this._gh + rideH + lift * k;
    const lines = this.shadowInfo ? this.shadowInfo.lines : null;
    const castArm = (s0, h0) => { if (lines && !roll && deathPhase < 2) lines.push([px + s0[0] * k, gY, gH - s0[1] * k, px + h0[0] * k, gY, gH - h0[1] * k, w * k]); };
    const drawArm = (s0, h0) => { const a = S(s0), b = S(h0); this.limb(ctx, a[0], a[1], b[0], b[1], k, L, w); castArm(s0, h0); };
    const drawFist = (h0) => { const b = S(h0); this.hand(ctx, b[0], b[1], k, L, w); };
    const body = () => {
      const src = flip ? variant(fr.pix, 'flip') : fr.pix;
      const ccx = m.cx + (flip ? -1 : 0), ccy = Math.round((m.torsoTop + m.legTop) / 2);
      if (roll) {
        // tucked roll: pixel-exact quarter turns around the body centre
        const dir = dx < -0.05 || (Math.abs(dx) <= 0.05 && dy < 0) ? -1 : 1;
        const qt = ((dir > 0 ? roll : 4 - roll) % 4 + 4) % 4;
        const R = rotFrame(src, qt, ccx, ccy);
        this.body(ctx, { pix: R.pix, emis: null }, px + R.dx * k, py - (m.feet - ccy) * k + R.dy * k, k, 0, false, {});
        return;
      }
      if (deathPhase === 2) {
        // lying on the ground: the standing frame turned a quarter, with a small landing bounce
        const dt = e.deathT;
        const sideSgn = this._deathSide || (this._deathSide = (e.id % 2 ? 1 : -1));
        const qt = sideSgn > 0 ? 1 : 3;
        const b = dt < 0.42 ? Math.round(Math.sin((dt - 0.3) / 0.12 * Math.PI) * 2 * U) : 0;
        const R = rotFrame(src, qt, ccx, ccy);
        const half = Math.ceil(m.torsoW / 2) + q(1);
        this.body(ctx, { pix: R.pix, emis: null }, px + R.dx * k, py - (half + b) * k + R.dy * k, k, 0, false, {});
        return;
      }
      this.body(ctx, fr, px, py, k, 0, flip, { cast: { y: gY, h: gH } });
    };
    const shieldUp = !!st.block || kind === 'bash';
    const drawShield = () => {
      if (!this.shield || e.dead || roll) return;
      let sp = vName === 'up' ? this.shield.back : vName === 'side' ? this.shield.edge : this.shield.front;
      if (shieldUp) sp = vName === 'up' ? this.shield.back : this.shield.front;
      const h0 = P.off;
      this.body(ctx, { pix: sp, emis: null }, px + Math.round(h0[0]) * k, py + Math.round(h0[1] + q(1)) * k, k, 0, false, { noAura: true });
    };
    const drawTome = () => {
      if (!this.tome || e.dead || roll) return;
      const bob = Math.round(Math.sin(this.t * 2.6) * 1.5 * U);
      const so = P.offS;
      const sx = so[0] + (so[0] >= 0 ? q(4) : -q(4)), sy = so[1] - q(6) + bob;
      const tx = px + sx * k, ty = py + sy * k;
      this.body(ctx, this.tome, tx, ty, k, 0, sx < 0, { noAura: true });
      this._glows = this._glows || [];
      this._glows.push([tx, ty - q(4) * k, '#f6e39a', q(5) * k, 0.35]);
      if (lines) lines.push([tx - q(3) * k, gY, gH - sy * k + q(4) * k, tx + q(3) * k, gY, gH - sy * k + q(4) * k, q(2) * k]);
    };
    // weapon sprite + smear trail
    let wspr = null;
    if (wpn) {
      let draw = 0;
      if (wtype === 'bow') draw = kind === 'bowdraw' ? Math.round(u * 2) / 2 : 0;
      if (wtype === 'crossbow') draw = kind === 'xbow' && u < 0.6 ? 0 : 1;
      wspr = weaponSprite(this.heldSpec(wtype === 'bow' || wtype === 'crossbow' ? { ...wpn, draw } : wpn));
    }
    const W = P.weapon;   // { x, y, a } grip position + angle, or null
    const drawWeapon = () => {
      if (!wspr || wspr.none || !W || roll) return;
      const wx = px + Math.round(W.x) * k, wy = py + Math.round(W.y) * k;
      let rr = W.a, fl = false;
      // keep blades right side up when pointing left
      if (Math.cos(rr) < 0) { fl = true; rr += Math.PI; }
      if (P.smear && !this._xray) this.drawSmear(ctx, wspr, wx, wy, W.a, k, wpn);
      if (P.streak && !this._xray) {
        // thrust: pale speed copies trailing the blade
        const sm = variant(wspr.pix, 'smear:' + (wpn.element && ELEM_GLOW[wpn.element] ? ELEM_GLOW[wpn.element] : '#fff4dc') + ':' + Math.round((wspr.len || ap(8)) * 0.3));
        for (let i = 2; i >= 1; i--) { ctx.globalAlpha = this.alpha * (i === 1 ? 0.7 : 0.35); blit(ctx, sm, wx - Math.round(Math.cos(W.a) * q(3) * i * k), wy - Math.round(Math.sin(W.a) * q(3) * i * k), k, rr, fl); }
        ctx.globalAlpha = this.alpha;
      }
      this.body(ctx, { pix: wspr.pix, emis: wspr.emis }, wx, wy, k, rr, fl, { noAura: true });
      const len = (wspr.len || ap(8)) * k;
      const tipx = wx + Math.cos(W.a) * len, tipy = wy + Math.sin(W.a) * len;
      this._tipPx = [tipx - x, tipy - y];
      if (lines && deathPhase < 0 && !roll) lines.push([wx, gY, gH - W.y * k, tipx, gY, gH - W.y * k - Math.sin(W.a) * len, k]);
      if (wspr.orb) {
        const ox = wx + Math.cos(W.a) * wspr.orb[0] * k, oy = wy + Math.sin(W.a) * wspr.orb[0] * k;
        this._tipPx = [ox - x, oy - y];
        this._glows = this._glows || [];
        this._glows.push([ox, oy, wspr.orbColor, q(kind && CASTS.has(kind) ? 9 : 6) * k, kind && CASTS.has(kind) ? 0.75 : 0.45]);
      } else if (wpn.element && ELEM_GLOW[wpn.element]) {
        this._glows = this._glows || [];
        this._glows.push([(wx + tipx) / 2, (wy + tipy) / 2, ELEM_GLOW[wpn.element], q(6) * k, 0.3]);
      }
      if (!this._xray) { this.trail.push({ a: W.a }); if (this.trail.length > 4) this.trail.shift(); }
    };

    this._tipPx = [P.main[0] * k, P.main[1] * k];
    const arms = !roll && deathPhase < 2;
    const mainArm = () => { if (arms) drawArm(P.mainS, P.main); };
    const offArm = () => { if (arms && !P.offHidden) drawArm(P.offS, P.off); };
    const mainFist = () => { if (arms) drawFist(P.main); };
    const offFist = () => { if (arms && !P.offHidden && !(this.shield && !e.dead)) drawFist(P.off); };
    const shieldFirst = this.shield && !shieldUp;
    if (vName === 'up') {
      // facing away: weapon, hands and shield sit behind the body unless hanging at the sides
      if (P.weaponBehind !== false) drawWeapon();
      mainArm(); mainFist();
      offArm(); offFist();
      drawShield(); drawTome();
      body();
      if (P.weaponBehind === false) drawWeapon();
    } else if (vName === 'side') {
      // far (off) arm and resting shield behind, near (weapon) arm in front
      offArm(); offFist();
      if (shieldFirst) drawShield();
      if (P.weaponBehind) drawWeapon();
      body();
      if (!shieldFirst) drawShield();
      drawTome();
      mainArm();
      if (!P.weaponBehind) drawWeapon();
      mainFist();
      if (P.twoHand) { offFist(); }
    } else {
      // facing the camera: arms hanging at the sides tuck behind the torso edge
      if (P.weaponBehind) drawWeapon();
      if (P.mainBack) mainArm();
      if (P.offBack) offArm();
      body();
      if (!P.offBack) offArm();
      drawShield(); drawTome();
      offFist();
      if (!P.mainBack) mainArm();
      if (!P.weaponBehind) drawWeapon();
      mainFist();
    }
    // dropped weapon after death
    if (e.dead && this.weapon && !this._xray) this.drawDropped(ctx, x, y, k, U);
    this._hand = [P.main[0] * k + lx * k, P.main[1] * k + ly * k];
  }

  // pale crescent between the last few blade positions: a solid smear frame, not ghosts
  drawSmear(ctx, wspr, wx, wy, a, k, wpn) {
    const tr = this.trail;
    if (!tr.length) return;
    if (Math.abs(angDiff(tr[0].a, a)) < 0.15) return;
    const col = wpn.element && ELEM_GLOW[wpn.element] ? ELEM_GLOW[wpn.element] : '#fff4dc';
    // only the outer part of the blade smears, so it reads as a crescent near the tip, not a fan
    const from = Math.max(3, Math.round((wspr.len || ap(8)) * 0.6));
    const sm = variant(wspr.pix, 'smear:' + col + ':' + from);
    const fan = (a0, a1, al) => {
      let dd = angDiff(a0, a1);
      if (Math.abs(dd) > 1.1) { a0 = a1 - Math.sign(dd) * 1.1; dd = angDiff(a0, a1); }
      const n = Math.min(14, Math.ceil(Math.abs(dd) / 0.08));
      ctx.globalAlpha = this.alpha * al;
      for (let i = 0; i < n; i++) {
        let r2 = a0 + dd * (i / n), f2 = false;
        if (Math.cos(r2) < 0) { f2 = true; r2 += Math.PI; }
        blit(ctx, sm, wx, wy, k, r2, f2);
      }
    };
    // a fan back through the last few frames, the older sweep fainter
    let a1 = a;
    for (let i = tr.length - 1, n = 0; i >= 0 && n < 2; i--, n++) {
      const a0 = tr[i].a;
      if (Math.abs(angDiff(a0, a1)) >= 0.06) fan(a0, a1, n === 0 ? 0.8 : 0.38);
      a1 = a0;
    }
    ctx.globalAlpha = this.alpha;
  }

  drawDropped(ctx, x, y, k, U = ART) {
    const e = this.ent;
    const wspr = weaponSprite(this.heldSpec(this.weapon.type === 'bow' || this.weapon.type === 'crossbow' ? { ...this.weapon, draw: 0 } : this.weapon));
    if (!wspr || wspr.none) return;
    const t = clamp01((e.deathT || 0) / 0.4);
    const sideSgn = this._deathSide || 1;
    const gx = x + Math.round(sideSgn * 3 * U) * k, gy = y + Math.round(6 * U) * k;
    const hx = x + (this._hand ? this._hand[0] : 0), hy = y + (this._hand ? this._hand[1] : -Math.round(10 * U));
    const arcH = Math.sin(t * Math.PI) * 6 * U * k;
    const wx = Math.round(lerp(hx, gx, t)), wy = Math.round(lerp(hy, gy, t) - arcH);
    const a = lerp(-1.2 * sideSgn, sideSgn > 0 ? 0.25 : Math.PI - 0.25, easeOut(t)) + (t < 1 ? t * 6 * sideSgn : 0);
    let rr = a, fl = false;
    if (Math.cos(rr) < 0) { fl = true; rr += Math.PI; }
    this.body(ctx, { pix: wspr.pix, emis: null }, wx, wy, k, rr, fl, { noAura: true, record: false });
  }

  // ---------------------------------------------------------------- the humanoid rig
  // returns shoulders, hands and the weapon grip (px relative to the pivot) for this frame
  rig(vName, flip, pose, atk, kind, u, su, c) {
    const st = this.ent.st, m = this.spr.m, wpn = this.weapon && !this.ent.dead ? this.weapon : null;
    const wtype = wpn ? wpn.type : null;
    const { dx, dy, side, alpha, moving } = c;
    // every reach, offset and lift below was designed in old pixels; U converts to today's
    const U = m.u, q = (v) => v * U;
    const tw = vName === 'side' ? m.twSide : m.torsoW;
    const bob = pose.bob | 0, lean = vName === 'side' ? pose.lean | 0 : 0;
    const tyR = m.torsoTop - m.feet + bob;
    const tl = -(tw >> 1) + lean, tr = tl + tw - 1;
    const fx = (r) => (flip ? -r - 1 : r);
    // shoulder anchors (pixel centres of the arm's top), tucked one pixel into the shoulder
    let mainS, offS;
    const sy = tyR + Math.round(m.armW / 2) + m.pad;
    if (vName === 'down') { mainS = [tl - 1, sy]; offS = [tr + 1, sy]; }
    else if (vName === 'up') { mainS = [tr + 1, sy]; offS = [tl - 1, sy]; }
    else { mainS = [fx(lean), sy]; offS = [fx(lean - Math.round(q(2))), sy]; }
    const chest = [fx(lean), tyR + q(2)];
    const armL = m.armL;
    const swingPh = moving ? Math.sin((this.ph / 6) * TAU) : 0;
    const sprint = !!st.sprint;
    const A = q(sprint ? 3 : 2);
    // relaxed hands: hang under the shoulder, swing along the facing while running
    const hang = (s, sw) => [s[0] + dx * sw * A * 0.9, s[1] + armL - 1 - Math.abs(sw) * q(sprint ? 1.5 : 0.7) + dy * sw * A * 0.5];
    let main = hang(mainS, -swingPh), off = hang(offS, swingPh);
    if (vName !== 'side') { main[0] += (vName === 'down' ? -q(0.4) : q(0.4)); off[0] += (vName === 'down' ? q(0.4) : -q(0.4)); }
    let weapon = null, smear = false, streak = false, weaponBehind = vName === 'up', twoHand = false, offHidden = false;
    let mainBehind = false, offBehind = false;
    const norm = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
    const ang = (v) => Math.atan2(v[1], v[0]);
    const pole = wtype && POLES.has(wtype);
    const combat = st.combat || !!kind;

    // ---- weapon at rest / guard
    if (wpn) {
      if (wtype === 'bow') {
        // bow in the off hand; drawn toward the aim when fighting
        if (combat) { off = [chest[0] + dx * (armL + q(1)), chest[1] + dy * (armL + q(1)) - q(1)]; weapon = { x: off[0], y: off[1], a: alpha, off: true }; main = [off[0] - dx * q(3), off[1] - dy * q(3)]; }
        else weapon = { x: off[0], y: off[1], a: Math.abs(dx) > 0.3 ? alpha : (vName === 'down' ? 0 : Math.PI), off: true };
      } else if (wtype === 'crossbow') {
        const g = combat ? [chest[0] + dx * q(3), chest[1] + dy * q(3) + q(1)] : [main[0], main[1]];
        main = g; weapon = { x: g[0], y: g[1], a: combat ? alpha : ang(norm([dx * 0.6, 1])) };
        off = [g[0] + dx * q(5), g[1] + dy * q(5)]; twoHand = true;
      } else if (pole) {
        if (combat && wtype !== 'staff') {
          main = [chest[0] - dx * q(1) + side.x * q(2), chest[1] - dy * q(1) + q(2) + side.y * q(1)];
          const a = ang(norm([dx, dy - 0.25]));
          weapon = { x: main[0], y: main[1], a };
          off = [main[0] + Math.cos(a) * q(5), main[1] + Math.sin(a) * q(5)]; twoHand = true;
        } else {
          // walking staff / spear held upright at the side
          main = [mainS[0] + (vName === 'side' ? dx * q(2) : 0), mainS[1] + armL - q(3)];
          weapon = { x: main[0], y: main[1], a: -Math.PI / 2 + (vName === 'down' ? -0.12 : vName === 'up' ? 0.12 : dx * 0.18) };
          weaponBehind = vName === 'up' || vName === 'side' && !combat;
        }
      } else if (TWO_H.has(wtype)) {
        // greatsword: two-handed guard forward, or resting on the shoulder
        if (combat) {
          main = [chest[0] + dx * q(3) + side.x * q(1), chest[1] + dy * q(2) + q(2)];
          const a = ang(norm([dx * 1.0 + side.x * 0.3, dy * 0.8 - 0.75]));
          weapon = { x: main[0], y: main[1], a };
          off = [main[0] - Math.cos(a) * q(2), main[1] - Math.sin(a) * q(2)]; twoHand = true;
        } else {
          main = [mainS[0] + side.x * q(0.5), mainS[1] + q(2)];
          const a = ang(norm([-dx * 0.55 + side.x * 0.45, -1 - dy * 0.2]));
          weapon = { x: main[0], y: main[1], a };
          weaponBehind = vName === 'up';
        }
      } else {
        // one-handed: relaxed at the side, raised in a guard when fighting
        if (combat) {
          main = [mainS[0] + dx * q(2.5), mainS[1] + armL - q(3) + dy * q(1.5)];
          weapon = { x: main[0], y: main[1], a: ang(norm([dx * 0.8 + side.x * 0.7, dy * 0.2 - 0.75 + side.y * 0.3])) };
        } else {
          weapon = { x: main[0], y: main[1], a: ang(norm([dx * 0.45 + side.x * 0.3, 1 + side.y * 0.3])) };
        }
        if (wtype === 'wand' && combat) weapon.a = ang(norm([dx, dy - 0.4]));
      }
      if (weapon && !weapon.off) { weapon.x = main[0]; weapon.y = main[1]; }
    }
    // shield arm: held a little forward in a fight, up in front of the chest when blocking
    if (this.shield) {
      if (st.block) off = [chest[0] + dx * q(4), chest[1] + dy * q(3) - q(1)];
      else if (combat) off = [offS[0] + dx * q(2), offS[1] + armL - q(2) + dy * q(1)];
    }
    if (st.block && wpn && !twoHand) { main = [mainS[0] - dx * q(1), mainS[1] + armL - q(3)]; if (weapon) { weapon.x = main[0]; weapon.y = main[1]; weapon.a = ang(norm([side.x * 0.5 + dx * 0.3, -1])); } }

    // ---- attacks
    if (kind && atk) {
      const K = atk;
      const cA = [chest[0], chest[1]];
      const Kr = q(K.r), Kl = q(K.lift);
      if (K.mode === 'arc' || K.mode === 'thrust') {
        const ha = alpha + K.phi;
        const hp = [cA[0] + Math.cos(ha) * Kr, cA[1] + Math.sin(ha) * Kr * 0.85 - Kl];
        let wa = ha + K.psi;
        if (K.mode === 'thrust') wa = alpha + K.psi;
        if (pole || twoHand || TWO_H.has(wtype)) { twoHand = true; }
        main = hp;
        weapon = wpn ? { x: hp[0], y: hp[1], a: wa } : null;
        if (twoHand && wtype !== 'bow') off = [hp[0] - Math.cos(wa) * q(pole ? -4 : 2), hp[1] - Math.sin(wa) * q(pole ? -4 : 2)];
        smear = K.smear && !!wpn && K.mode === 'arc';
        streak = K.smear && !!wpn && K.mode === 'thrust' && atk.streak;
        if (!wpn) {
          // claws: both hands rake, the off hand trailing the main one
          const oa = alpha - K.phi * 0.6;
          off = [cA[0] + Math.cos(oa) * Kr * 0.8, cA[1] + Math.sin(oa) * Kr * 0.7 - Kl];
        }
      } else if (K.mode === 'overhead') {
        main = [cA[0] + dx * Kr, cA[1] + dy * Kr * 0.85 - Kl];
        const vw = norm([-dx * 0.7 + side.x * 0.3, -1 - dy * 0.3]), vm = norm([side.x * 0.9 + dx * 0.3, -0.8 + side.y * 0.4]), ve = norm([dx, dy + 0.75]);
        const t = K.wt;
        const v = norm([(1 - t) * (1 - t) * vw[0] + 2 * t * (1 - t) * vm[0] + t * t * ve[0], (1 - t) * (1 - t) * vw[1] + 2 * t * (1 - t) * vm[1] + t * t * ve[1]]);
        weapon = wpn ? { x: main[0], y: main[1], a: ang(v) } : null;
        twoHand = TWO_H.has(wtype) || pole || K.slam;
        if (twoHand) off = [main[0] - v[0] * q(2), main[1] - v[1] * q(2)];
        else off = [offS[0] - dx * q(1), offS[1] + armL - q(2)];
        smear = K.smear && !!wpn;
        if (vName === 'down' && v[1] < -0.55 && K.lift > 3) weaponBehind = true; else if (vName !== 'up') weaponBehind = false;
      } else if (K.mode === 'cast') {
        // staff / wand forward, the free hand raised toward the aim
        main = [cA[0] + dx * Kr + side.x * q(1.5), cA[1] + dy * Kr * 0.8 - Kl + q(1)];
        if (wpn) weapon = { x: main[0], y: main[1], a: K.up ? -Math.PI / 2 + side.x * 0.12 : alpha + K.psi };
        off = K.up ? [cA[0] - side.x * q(3), cA[1] - q(7)] : [cA[0] + dx * (Kr + q(1)) - side.x * q(2), cA[1] + dy * (Kr + q(1)) * 0.8 - q(3)];
        if (K.nova) { main = [cA[0] + side.x * q(K.spread) + dx * q(2), cA[1] - q(K.olift)]; off = [main[0], main[1] + q(3)]; if (weapon) { weapon.x = main[0]; weapon.y = main[1]; weapon.a = K.wa; } }
        if (vName === 'up') weaponBehind = true;
      } else if (K.mode === 'bow') {
        off = [cA[0] + dx * (armL + q(1)), cA[1] + dy * (armL + q(1)) - q(1)];
        const pull = K.pull;
        main = [off[0] - dx * q(2 + pull * 6), off[1] - dy * q(2 + pull * 6) - q(1 - pull)];
        weapon = wpn ? { x: off[0], y: off[1], a: alpha, off: true } : null;
        if (K.recoil) { main = [main[0] - dx * q(K.recoil), main[1] - dy * q(K.recoil) - q(K.recoil * 0.5)]; }
      } else if (K.mode === 'xbow') {
        const kick = K.kick;
        main = [cA[0] + dx * q(3 - kick), cA[1] + dy * q(3 - kick) + q(1 - kick * 0.5)];
        weapon = wpn ? { x: main[0], y: main[1], a: alpha - (dx >= 0 ? 1 : -1) * kick * 0.12 } : null;
        off = [main[0] + dx * q(5), main[1] + dy * q(5)]; twoHand = true;
      } else if (K.mode === 'bash') {
        off = [cA[0] + dx * Kr, cA[1] + dy * Kr * 0.8 - q(1)];
        main = [mainS[0] - dx * q(2), mainS[1] + armL - q(3)];
        if (weapon) { weapon.x = main[0]; weapon.y = main[1]; }
      }
      // blend in from the previous pose so chained attacks don't pop
      if (this.blend && this.atkT < K.blendDur) {
        const t = easeOut2(clamp01(this.atkT / K.blendDur));
        const b = this.blend;
        main = [lerp(b.main[0], main[0], t), lerp(b.main[1], main[1], t)];
        off = [lerp(b.off[0], off[0], t), lerp(b.off[1], off[1], t)];
        if (weapon && b.wa !== null) weapon = { ...weapon, x: main[0], y: main[1], a: lerpAng(b.wa, weapon.a, t) };
        if (weapon && weapon.off) { weapon.x = off[0]; weapon.y = off[1]; }
      }
    } else if (st.spin && wpn) {
      // whirlwind: blade sweeps around the body, smearing all the way
      const a = this.t * 17 + Math.PI / 2;
      main = [chest[0] + Math.cos(a) * q(6), chest[1] + Math.sin(a) * q(5)];
      weapon = { x: main[0], y: main[1], a };
      smear = true; weaponBehind = Math.sin(a) < -0.2;
      if (TWO_H.has(wtype) || pole) { twoHand = true; off = [main[0] - Math.cos(a) * q(2), main[1] - Math.sin(a) * q(2)]; }
    }

    // ---- states that override the arms
    if (c.hurt) {
      main = [mainS[0] + (mainS[0] < 0 ? -q(2) : q(2)), mainS[1] + armL - q(3)];
      off = [offS[0] + (offS[0] < 0 ? -q(2) : q(2)), offS[1] + armL - q(3)];
      if (weapon) { weapon = { ...weapon, x: weapon.off ? off[0] : main[0], y: weapon.off ? off[1] : main[1], a: weapon.a + 0.5 }; }
    }
    if (pose.legs === 'ride' && !kind) {
      main = [mainS[0] + dx * q(3), mainS[1] + armL - q(2)]; off = [offS[0] + dx * q(3), offS[1] + armL - q(2)];
      if (weapon && !weapon.off) { weapon.x = main[0]; weapon.y = main[1]; }
    }
    if (c.deathPhase >= 0) { weapon = null; main = [mainS[0] - q(1), mainS[1] + armL - 1]; off = [offS[0] + q(1), offS[1] + armL - 1]; }
    // weapon swap flourish: a quick twirl in the hand
    if (wpn && weapon && !kind && st.swapT !== undefined && st.swapT < 0.36) {
      const t = clamp01(st.swapT / 0.36);
      weapon = { ...weapon, a: weapon.a + easeOut(t) * TAU * (dx >= 0 ? 1 : -1) - TAU * (dx >= 0 ? 1 : -1) };
      main = [main[0], main[1] - Math.sin(t * Math.PI) * q(3)];
      if (!weapon.off) { weapon.x = main[0]; weapon.y = main[1]; }
      smear = t < 0.8;
    }
    // up view: hands raised forward or inside the torso go behind the body
    if (vName === 'up') {
      mainBehind = main[1] < sy + 1 || (main[0] > tl && main[0] < tr);
      offBehind = off[1] < sy + 1 || (off[0] > tl && off[0] < tr) || !!this.shield;
      if (weapon && !weapon.off) weaponBehind = mainBehind || POLES.has(wtype) || TWO_H.has(wtype) ? true : (Math.sin(weapon.a) < 0.2);
      else if (weapon && weapon.off) weaponBehind = true;
    }
    // down view: hands hanging outside the torso keep their arm behind it
    const mainBack = vName === 'down' && main[0] < tl - 0.5 && main[1] > sy + 1;
    const offBack = vName === 'down' && off[0] > tr + 0.5 && off[1] > sy + 1;
    const save = { main: [main[0], main[1]], off: [off[0], off[1]], wa: weapon ? weapon.a : null };
    return { mainS, offS, main, off, weapon, smear, streak, weaponBehind, twoHand, offHidden, mainBehind, offBehind, mainBack, offBack, save };
  }

  // ================================================================ creatures
  drawCreature(ctx, x, y) {
    const e = this.ent, st = e.st, k = this.k;
    // motion offsets are authored in old design pixels: one is ART art pixels, times the old
    // upscale big bodies used to get, so hover, lunges and knock-back cover the same world distance
    const cs = this.spec.creature.s, mk = (PPU / 10) * (cs <= 2.6 ? 1 : Math.min(4, Math.ceil(cs / 2.6)));
    this._ax = x; this._ay = y;
    this._glows = null;
    const vName = this.pickView(e.facing);
    const V = this.spr.views[vName] || this.spr.views.side || this.spr.views.down;
    const flip = this.sideOnly && this.flip;
    const kind = st.action ? st.kind : null;
    const u = clamp01(st.actionT || 0);
    const su = st.strikeU || 0.6;
    const fx = Math.sin(e.facing), fz = Math.cos(e.facing);
    let fr;
    if (e.dead) fr = V.hurt[0];
    else if (st.breathing || st.charging) fr = V.atk[1];
    else if (kind && u < su + 0.25) fr = u < su - 0.06 ? V.atk[0] : V.atk[1];
    else if ((st.hitT || 0) > 0.55) fr = V.hurt[0];
    else if (st.flying && V.fly) fr = V.fly[Math.floor(this.t * 6) % 2];
    else if (this.spr.flapFps) fr = V.run[Math.floor(this.t * this.spr.flapFps) % V.run.length];
    else if (this.moving) fr = V.run[Math.floor(this.ph * (V.run.length / 6)) % V.run.length];
    else fr = V.idle[Math.abs(Math.floor(this.t * (this.kind === 'wraith' ? 5 : 1.8) + (st.seed || 0))) % V.idle.length];
    // hovering bodies bob; anticipation pulls back, the strike lunges; knock-back; death.
    // gx/gz move the body over the ground (its shadow follows), lift raises it off the ground
    let gx = 0, gz = 0, lift = 0, rot = 0;
    const hover = this.kind === 'wraith' || this.kind === 'eye';
    if (hover) lift = Math.round((3 + Math.sin(this.t * 2.2 + (st.seed || 0)) * 1.5) * mk);
    if (kind && !e.dead) {
      const ph = phases(u, su);
      const big = this.kind === 'quadruped' || this.kind === 'dragon' || this.kind === 'arachnid' ? 3 : 2;
      const l = ph.inWind ? -easeOut(ph.w) * 1.5 : ph.inStrike ? lerp(-1.5, big, easeOut(ph.s)) : ph.inHold ? big : ph.inFollow ? big : lerp(big, 0, easeIO(ph.r));
      gx += fx * l * mk; gz += fz * l * mk * 0.6;
      // crouch before the pounce, rise into it
      if (ph.inWind && (this.kind === 'quadruped' || this.kind === 'arachnid')) lift -= Math.round(easeOut(ph.w) * mk);
      if (ph.inStrike && this.kind === 'quadruped') lift += Math.round(Math.sin(ph.s * Math.PI) * 2 * mk);
    }
    if (this.moving && !hover && !e.dead && this.kind !== 'serpent' && this.kind !== 'blob' && this.kind !== 'flyer') {
      // gallop bob: down on the footfalls
      lift -= Math.round([0, 1, 0, 0, 1, 0][Math.floor(this.ph) % 6] * mk);
    }
    if ((st.hitT || 0) > 0.35 && !e.dead) { const r = Math.round(((st.hitT || 0) - 0.35) * 3 * mk); gx -= fx * r; gz -= fz * r * 0.6; }
    if (e.dead) {
      const d = easeOut(clamp01(e.deathT * 3));
      if (this.kind === 'quadruped' || this.kind === 'arachnid' || this.kind === 'dragon') {
        if (e.deathT > 0.3) this._dead90 = true;
        else lift += Math.round(Math.sin(e.deathT / 0.3 * Math.PI) * 2 * mk);
      }
      if (this.kind === 'wraith' || this.kind === 'eye' || this.kind === 'flyer') lift -= Math.round(d * 4 * mk);
    }
    gx = Math.round(gx); gz = Math.round(gz);
    this.hoverPx = Math.max(0, lift);
    const ox = gx, oy = gz - lift;
    const cast = { y: this._gy + gz, h: this._gh + Math.max(0, lift) };
    const px = x + ox, py = y + oy;
    // serpent body segments, sorted back-to-front with the head
    if (this.kind === 'serpent' && this.segs) {
      const order = this.segs.map((s, i) => [s, i]).sort((a, b) => a[0].z - b[0].z);
      const headZ = e.pos.z;
      let headDrawn = false;
      for (const [s, i] of order) {
        if (!headDrawn && s.z > headZ) { this.body(ctx, fr, px, py, k, rot, flip, { cast }); headDrawn = true; }
        const sp = this.spr.segs[Math.min(i, this.spr.segs.length - 1)];
        const sh = s.y - view.ground(s.x, s.z);
        if (sh < -0.2) continue;
        const sx = Math.round(s.x * PPU - view.x0), sy = Math.round(s.z * PPU - view.y0 - sh * PPU) - Math.round(sp.pix.oy * 0.75) * k;
        this.body(ctx, sp, sx, sy, k, 0, false, { record: false });
        if (this.shadowInfo && k === 1) this.shadowInfo.bodies.push({ p: sp.pix, x: sx, y: Math.round(s.z * PPU - view.y0) + Math.round(sp.pix.oy * 0.25), h: Math.round(sp.pix.oy * 0.75) });
      }
      if (!headDrawn) this.body(ctx, fr, px, py, k, rot, flip, { cast });
    } else if (e.dead && this._dead90 && e.deathT > 0.3) {
      const q = flip ? 3 : 1;
      const rp = variant(flip ? variant(fr.pix, 'flip') : fr.pix, 'rot' + q);
      this.body(ctx, { pix: rp, emis: null }, px, py - Math.round(fr.pix.oy * 0.25) * k + Math.round(2 * mk), k, 0, false, {});
    } else this.body(ctx, fr, px, py, k, rot, flip, { cast });
    if (!e.dead) this._dead90 = false;
    // floating eye iris tracks its target
    if (this.spr.iris && !e.dead) {
      const tg = e.target;
      let ax = Math.sin(e.facing), az = Math.cos(e.facing);
      if (tg) { const dx = tg.pos.x - e.pos.x, dz = tg.pos.z - e.pos.z, d = Math.hypot(dx, dz) || 1; ax = dx / d; az = dz / d; }
      const L = this.spr.lookR;
      const ix = px + Math.round(ax * L * k), iy = py + Math.round((this.spr.eyeAt[1] + az * L) * k);
      this.body(ctx, this.spr.iris, ix, iy, k, 0, false, { noAura: true });
      this._glows = [[ix, iy, this.spec.creature.c3, 7 * mk, st.action ? 0.8 : 0.4]];
    }
    // glowing maw while breathing fire / beams
    if ((st.breathing || (kind === 'cast' && u > su - 0.1 && u < su + 0.3)) && this.spr.mouth) {
      const mx = px + (flip ? -this.spr.mouth[0] : this.spr.mouth[0]) * k, my = py + this.spr.mouth[1] * k;
      this._glows = this._glows || [];
      this._glows.push([mx, my, this.spec.creature.c3, 10 * mk, 0.8]);
    }
    const mouth = this.spr.mouth || [0, -Math.round(this.heightPx * 0.6 / k)];
    this._tipPx = [(flip ? -mouth[0] : mouth[0]) * k + ox, mouth[1] * k + oy];
    this._hand = this._tipPx;
  }

  // -------------------------------------------------------------- world-space helpers
  // tip of the weapon / staff orb / creature mouth in world space (projectile origins)
  weaponTip(out) {
    const e = this.ent;
    const t = this._tipPx || [0, -ap(12)];
    const hUnits = Math.max(0.6, -t[1] / PPU * 0.6);
    out.x = e.pos.x + t[0] / PPU;
    out.y = e.pos.y + hUnits;
    out.z = e.pos.z + (t[1] / PPU + hUnits);
    return out;
  }
  handPos(out) {
    const e = this.ent;
    const t = this._hand || [0, -ap(8)];
    out.x = e.pos.x + t[0] / PPU;
    out.y = e.pos.y + Math.max(0.6, -t[1] / PPU);
    out.z = e.pos.z;
    return out;
  }
}

// ------------------------------------------------------------------ attack choreography
// Phases relative to the strike point su: anticipation [0, A], strike [A, su], impact hold
// [su, B], follow-through [B, F], recover [F, 1].
function phases(u, su) {
  const A = Math.max(0.05, su * 0.72), B = Math.min(0.93, su + 0.1), F = Math.max(B + 0.05, Math.min(0.97, 0.78));
  return {
    A, B, F,
    w: clamp01(u / A), s: clamp01((u - A) / Math.max(0.01, su - A)), h: clamp01((u - su) / Math.max(0.01, B - su)), f: clamp01((u - B) / Math.max(0.01, F - B)), r: clamp01((u - F) / Math.max(0.01, 1 - F)),
    inWind: u < A, inStrike: u >= A && u < su, inHold: u >= su && u < B, inFollow: u >= B && u < F, inRec: u >= F,
  };
}
// key poses: [wind, strike, hold, follow]; rest = guard (the rig blends back to it)
const ARC = {
  slash: { phi: [-1.9, 0.5, 0.85, 1.7], r: [4, 7, 7, 5.5], psi: [-0.85, 0.05, 0.2, 0.6], lift: [2, 0, 0, -1] },
  sweep: { phi: [-2.5, 0.6, 1.0, 2.2], r: [5, 8, 8, 6], psi: [-0.7, 0.05, 0.15, 0.5], lift: [1, 0, 0, -1] },
  claw: { phi: [-1.3, 1.0, 1.15, 1.35], r: [3, 7, 7, 5], psi: [-0.5, 0, 0, 0.3], lift: [2, 0, 0, 0] },
  throw: { phi: [2.6, 0, -0.1, -0.3], r: [4, 7, 7, 6], psi: [0.6, 0, 0, 0], lift: [4, 1, 0, 0] },
  thrust: { phi: [0.5, 0, 0, 0.05], r: [-2, 8, 8, 6], psi: [-0.2, 0, 0, 0], lift: [2, 0, 0, 0], thrust: true },
  stab: { phi: [0.3, 0, 0, 0.05], r: [1, 7, 7, 5], psi: [-0.12, 0, 0, 0], lift: [1, 0, 0, 0], thrust: true },
  spearthrust: { phi: [0.3, 0, 0, 0], r: [-4, 10, 10, 7], psi: [-0.15, 0, 0, 0], lift: [2, 0, 0, 0], thrust: true },
};
function seg(ph, keys, rest, ease = easeOut) {
  // keys: [wind, strike, hold, follow]
  if (ph.inWind) return lerp(rest, keys[0], easeOut(ph.w));
  if (ph.inStrike) return lerp(keys[0], keys[1], easeIn(ph.s) * 0.35 + ease(ph.s) * 0.65);
  if (ph.inHold) return lerp(keys[1], keys[2], ph.h);
  if (ph.inFollow) return lerp(keys[2], keys[3], easeOut(ph.f));
  return lerp(keys[3], rest, easeIO(ph.r));
}
function attackPose(kind, u, su, wtype) {
  const ph = phases(u, su);
  const heavy = HEAVY.has(kind);
  // body: lean back in the wind-up, lunge and squash on the strike, settle after
  const big = kind === 'spearthrust' || kind === 'thrust' || kind === 'sweep' || kind === 'bash' || kind === 'overhead' || kind === 'slam' ? 3 : kind === 'xbow' ? -1 : 2;
  let lunge = 0, legs = 'stance', bob = 1, lean = 0, face = 0;
  if (ph.inWind) { lunge = -Math.round(easeOut(ph.w)); lean = -1; bob = heavy ? 0 : 1; if (heavy) face = 0; }
  else if (ph.inStrike) { lunge = Math.round(lerp(-1, big, easeOut(ph.s))); legs = 'lunge'; bob = heavy ? 2 : 1; lean = 1; }
  else if (ph.inHold) { lunge = big; legs = 'lunge'; bob = heavy ? 2 : 1; lean = 1; face = heavy ? 3 : 0; }
  else if (ph.inFollow) { lunge = Math.round(lerp(big, big * 0.5, ph.f)); legs = 'lunge'; bob = 1; }
  else { lunge = Math.round(lerp(big * 0.5, 0, easeIO(ph.r))); bob = ph.r < 0.5 ? 1 : 0; }
  if (kind === 'bowdraw' || kind === 'bowrelease' || kind === 'castup') lunge = 0;
  const blendDur = 0.07;
  const base = { lunge, legs, bob, lean, face, blendDur, smear: false };
  if (ARC[kind]) {
    const K = ARC[kind];
    const rest = { phi: K.phi[0] * 0.4, r: 4, psi: 0, lift: 0 };
    return { ...base, mode: K.thrust ? 'thrust' : 'arc', phi: seg(ph, K.phi, rest.phi), r: seg(ph, K.r, rest.r), psi: seg(ph, K.psi, rest.psi), lift: seg(ph, K.lift, 0), smear: ph.inStrike || (ph.inHold && ph.h < 0.5), streak: ph.inStrike || (ph.inHold && ph.h < 0.35) };
  }
  if (kind === 'backslash') {
    const K = ARC.slash;
    const neg = (a) => a.map((v) => -v);
    return { ...base, mode: 'arc', phi: seg(ph, neg(K.phi), -K.phi[0] * 0.4), r: seg(ph, K.r, 4), psi: seg(ph, neg(K.psi), 0), lift: seg(ph, K.lift, 0), smear: ph.inStrike || (ph.inHold && ph.h < 0.5) };
  }
  if (kind === 'overhead' || kind === 'slam') {
    const up = kind === 'slam' ? 10 : 8;
    const lift = ph.inWind ? up * easeOut(ph.w) : ph.inStrike ? up * (1 - easeIn(ph.s)) : 0;
    const r = ph.inWind ? lerp(3, -1, easeOut(ph.w)) : ph.inStrike ? lerp(-1, 6, easeOut(ph.s)) : ph.inRec ? lerp(5, 3, ph.r) : 6;
    const wt = ph.inWind ? 0 : ph.inStrike ? easeIn(ph.s) * 0.4 + easeOut(ph.s) * 0.6 : 1;
    return { ...base, mode: 'overhead', r, lift, wt, slam: kind === 'slam', smear: ph.inStrike || (ph.inHold && ph.h < 0.4), bob: ph.inWind ? -1 : base.bob, face: ph.inHold || ph.inStrike ? 3 : 0 };
  }
  if (kind === 'cast') {
    const r = ph.inWind ? lerp(3, 1, easeOut(ph.w)) : ph.inStrike || ph.inHold ? lerp(1, 6, easeOut(Math.min(1, ph.s + ph.h))) : lerp(6, 3, easeIO(Math.max(ph.f, ph.r)));
    return { ...base, mode: 'cast', r, lift: ph.inWind ? 2 * ph.w : 0, psi: ph.inWind ? -0.6 * ph.w : 0, legs: 'stance', lunge: ph.inWind ? 0 : base.lunge > 0 ? 1 : 0 };
  }
  if (kind === 'castup') return { ...base, mode: 'cast', up: true, r: 1, lift: u < 0.8 ? 6 * easeOut(clamp01(u * 3)) : 6 * (1 - (u - 0.8) * 5), psi: 0, legs: 'stance', lunge: 0, bob: 0 };
  if (kind === 'nova') {
    const raise = ph.inWind ? easeOut(ph.w) : ph.inStrike ? 1 - easeIn(ph.s) : 0;
    return { ...base, mode: 'cast', nova: true, r: 1, lift: 0, psi: 0, spread: lerp(2, 1, raise), olift: lerp(-3, 8, raise), wa: -Math.PI / 2, legs: 'stance', bob: ph.inWind ? -1 : 2, lunge: 0, face: ph.inHold ? 3 : 0 };
  }
  if (kind === 'bowdraw') return { ...base, mode: 'bow', pull: u, recoil: 0, lunge: 0, legs: 'stance', bob: 1 };
  if (kind === 'bowrelease') return { ...base, mode: 'bow', pull: 0, recoil: u < 0.3 ? Math.round((1 - u / 0.3) * 3) : 0, lunge: u < 0.2 ? -1 : 0, legs: 'stance', bob: 1 };
  if (kind === 'xbow') return { ...base, mode: 'xbow', kick: u < 0.12 ? 2 : u < 0.3 ? lerp(2, 0, (u - 0.12) / 0.18) : 0, legs: 'stance', bob: 1 };
  if (kind === 'bash') return { ...base, mode: 'bash', r: ph.inWind ? lerp(3, 1, ph.w) : ph.inStrike || ph.inHold ? lerp(1, 7, easeOut(Math.min(1, ph.s + ph.h))) : lerp(7, 3, easeIO(Math.max(ph.f, ph.r))) };
  void wtype;
  const K = ARC.slash;
  return { ...base, mode: 'arc', phi: seg(ph, K.phi, 0), r: seg(ph, K.r, 4), psi: seg(ph, K.psi, 0), lift: seg(ph, K.lift, 0), smear: ph.inStrike };
}
