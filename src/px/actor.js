// Sprite actors: the pixel "model" of an entity. Picks a view (down / side / up) and frame from
// the entity's animation state, rotates the held weapon through snappy per-attack swing curves
// (anticipation -> strike -> follow-through), and adds the juice: weapon smears, dodge
// afterimages, white hit flashes, frozen tints, knock-back nudges, death falls and blinks.
import { R, glowPx } from '../render/renderer.js';
import { view } from './view.js';
import { Pix, PPU, C } from './pix.js';
import { humanSprites, FEET } from './sprites/human.js';
import { creatureSprites } from './sprites/creatures.js';
import { weaponSprite, shieldSprite, tomeSprite, ELEM_GLOW } from './sprites/weapons.js';
import { addObject, removeObject } from './scene.js';

const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
const easeIn = (t) => t * t;
const easeIO = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// ------------------------------------------------------------------ pix variants (cached on the Pix)
export function variant(p, kind) {
  if (!p) return null;
  const k = '_v_' + kind;
  if (p[k]) return p[k];
  let v;
  if (kind === 'flip') v = p.flipX();
  else if (kind === 'white') v = p.silhouette('#ffffff');
  else if (kind === 'frozen') v = p.tinted('#a8e0ff', 0.7);
  else if (kind === 'hurt') v = p.tinted('#ff6048', 0.5);
  else if (kind === 'xray') {
    // outline only: shows the shape through walls without painting over the visible parts
    v = new Pix(p.w + 2, p.h + 2); v.ox = p.ox + 1; v.oy = p.oy + 1;
    const A = (x, y) => (x < 0 || y < 0 || x >= p.w || y >= p.h ? 0 : p.d[(y * p.w + x) * 4 + 3]);
    for (let y = -1; y <= p.h; y++) for (let x = -1; x <= p.w; x++) {
      if (A(x, y) > 40) continue;
      if (A(x - 1, y) > 100 || A(x + 1, y) > 100 || A(x, y - 1) > 100 || A(x, y + 1) > 100) v.set(x + 1, y + 1, [255, 204, 72, 255]);
    }
  }
  else if (kind === 'stone') v = p.tinted('#8a8478', 0.9);
  else if (kind === 'ghost') v = p.silhouette('#8fd0ff');
  else if (kind === 'smear') v = p.silhouette('#fff6e0');
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

// soft ground shadows (cached ellipses)
const shadows = new Map();
function shadowCv(rx, ry) {
  const key = rx + ':' + ry;
  let c = shadows.get(key);
  if (c) return c;
  const p = new Pix(rx * 2 + 1, ry * 2 + 1);
  p.ellipse(rx + 0.5, ry + 0.5, rx + 0.5, ry + 0.5, [12, 6, 16, 90]);
  p.ellipse(rx + 0.5, ry + 0.5, rx * 0.65 + 0.5, ry * 0.6 + 0.5, [12, 6, 16, 60]);
  c = p.canvas();
  shadows.set(key, c);
  return c;
}

// screen-space aim angle from a world facing (0 = +z = down the screen)
const screenAngle = (f) => Math.atan2(Math.cos(f), Math.sin(f));
const CASTS = new Set(['cast', 'castup', 'nova']);
const POLES = new Set(['spear', 'halberd', 'staff']);

// integer upscale for very large bodies, so big bosses stay pixel-crisp
export function upscaleFor(s, humanoid) {
  if (humanoid) return s < 1.75 ? 1 : Math.min(5, Math.max(2, Math.round(s / 1.1)));
  return s <= 2.6 ? 1 : Math.min(4, Math.ceil(s / 2.6));
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
    this.flash = null;           // 'white' | 'frozen' | 'stone'
    this.aura = null;            // elite outline colour
    this.t = Math.random() * 10;
    this.ph = 0;
    this.flip = false;
    this.viewName = 'down';
    this.ghosts = [];
    this.ghostT = 0;
    this.ops = [];               // emissive replay list
    this.prevRot = null;
    this.segs = null;            // serpent segment world positions
    this.weapon = null; this.shield = null; this.tome = null;
    this.mount = null;           // { spr, k, st }
    this.lastTip = { x: 0, y: 0, z: 0 };
    this.build(spec);
  }

  build(spec) {
    this.spec = spec;
    if (spec.type === 'human') {
      const s = spec.scale || 1;
      this.k = upscaleFor(s, true);
      const ms = Math.max(0.8, Math.min(1.55, s / this.k));
      this.spr = humanSprites({ ...spec.look, scale: ms });
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
    this.heightPx = (this.spr.height || 24) * this.k;
  }
  setLook(look) {
    if (this.spec.type !== 'human') return;
    const keep = [this.weapon, this.shield, this.tome];
    this.build({ ...this.spec, look, weapon: null, shield: null, tome: null });
    [this.weapon, this.shield, this.tome] = keep;
  }
  setWeapon(spec) { this.weapon = spec && spec.type !== 'claws' ? spec : null; }
  setShield(spec) { this.shield = spec ? shieldSprite(spec) : null; }
  setTome(spec) { this.tome = spec ? tomeSprite(spec.color, spec.glow) : null; }
  setMount(spec) {
    if (!spec) { this.mount = null; return; }
    const k = upscaleFor(spec.s, false);
    this.mount = { spr: creatureSprites({ ...spec, s: spec.s / k }), k, ph: 0 };
  }

  attach() { addObject(this); }
  detach() { removeObject(this); }

  // -------------------------------------------------------------- per-frame state
  update(dt) {
    const e = this.ent, st = e.st;
    this.t += dt;
    this.sortZ = e.pos.z;
    const spd = st.moveSpeed || 0;
    if (spd > 0.4) this.ph += dt * Math.max(6, Math.min(13, spd * 1.5));
    if (this.mount && spd > 0.4) this.mount.ph += dt * Math.max(6, Math.min(14, spd * 0.9));
    // afterimages while rolling / dashing / charging
    const dashing = (st.dodgeT !== undefined && st.dodgeT >= 0) || st.charging || st.dash;
    this.ghostT -= dt;
    if (dashing && this.ghostT <= 0 && this._lastBody) {
      this.ghostT = 0.03;
      this.ghosts.push({ ...this._lastBody, life: 0.2, wx: e.pos.x, wz: e.pos.z, wh: e.pos.y - view.ground(e.pos.x, e.pos.z) });
      if (this.ghosts.length > 8) this.ghosts.shift();
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) { this.ghosts[i].life -= dt; if (this.ghosts[i].life <= 0) this.ghosts.splice(i, 1); }
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

  // -------------------------------------------------------------- drawing
  shadow(ctx) {
    if (this.hidden || this.ent.removed) return;
    const e = this.ent;
    const x = Math.round(e.pos.x * PPU - view.x0), y = Math.round(e.pos.z * PPU - view.y0);
    let rx = this.spec.type === 'human' ? 5 * this.k : Math.max(3, Math.round(this.heightPx * (this.kind === 'serpent' ? 0.5 : 0.42)));
    if (this.kind === 'quadruped' || this.kind === 'dragon' || this.kind === 'arachnid') rx = Math.round(rx * 1.45);
    if (this.mount) rx = Math.round(9 * this.mount.k * (this.mount.spr.height / 16));
    const h = e.pos.y - view.ground(e.pos.x, e.pos.z);
    if (h < -0.3) return;
    const fade = h > 0.5 ? Math.max(0.35, 1 - h * 0.12) : 1;
    const ry = Math.max(2, Math.round(rx * 0.38));
    const cv = shadowCv(Math.round(rx * fade), Math.round(ry * fade));
    ctx.globalAlpha = (this.ent.dead ? Math.max(0, 1 - this.ent.deathT * 0.5) : 1) * this.alpha;
    ctx.drawImage(cv, x - Math.round(rx * fade), y - Math.round(ry * fade));
    ctx.globalAlpha = 1;
  }

  draw(ctx) {
    this.ops.length = 0;
    if (this.hidden) return;
    const e = this.ent;
    if (e.dead && e.deathT > (e.isPlayer ? 1e9 : 2.6) && Math.floor(e.deathT * 14) % 2) return;
    const x = Math.round(e.pos.x * PPU - view.x0);
    const h = e.pos.y - view.ground(e.pos.x, e.pos.z);
    const y = Math.round(e.pos.z * PPU - view.y0 - h * PPU);
    // ghosts first (behind)
    for (const g of this.ghosts) {
      const gx = Math.round(g.wx * PPU - view.x0), gy = Math.round(g.wz * PPU - view.y0 - g.wh * PPU);
      ctx.globalAlpha = (g.life / 0.2) * 0.45 * this.alpha;
      blit(ctx, variant(g.p, 'ghost'), gx + g.dx, gy + g.dy, g.k, g.rot, g.flip);
    }
    ctx.globalAlpha = this.alpha;
    if (h < -0.05) {
      // burrowing: only what is above the ground line shows
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - 200, y - 400 + Math.round(h * PPU), 400, 400);
      ctx.clip();
      if (this.spec.type === 'human') this.drawHuman(ctx, x, y); else this.drawCreature(ctx, x, y);
      ctx.restore();
    } else if (this.spec.type === 'human') this.drawHuman(ctx, x, y);
    else this.drawCreature(ctx, x, y);
    ctx.globalAlpha = 1;
  }

  // body blit with flash / tint / aura handling, recording an emissive op
  // redraw the actor as an outline (used when something stands in front of the player)
  drawXray(ctx) {
    if (this.hidden || this.ent.dead) return;
    const ops = this.ops, ghosts = this.ghosts, prev = this.prevRot;
    this.ops = []; this.ghosts = []; this._xray = true;
    ctx.globalAlpha = 0.85;
    this.draw(ctx);
    ctx.globalAlpha = 1;
    this._xray = false; this.ops = ops; this.ghosts = ghosts; this.prevRot = prev;
  }

  body(ctx, fr, x, y, k, rot, flip, opts = {}) {
    let p = fr.pix;
    if (this._xray) { blit(ctx, variant(p, 'xray'), x, y, k, rot, flip); return; }
    if (this.flash === 'white') p = variant(p, 'white');
    else if (this.flash === 'frozen') p = variant(p, 'frozen');
    else if (this.flash === 'stone') p = variant(p, 'stone');
    else if (this.flash === 'hurt') p = variant(p, 'hurt');
    else if (this.aura && !opts.noAura) p = variant(p, 'aura:' + this.aura);
    blit(ctx, p, x, y, k, rot, flip);
    if (fr.emis && this.flash !== 'stone' && this.flash !== 'frozen') this.ops.push([fr.emis, x, y, k, rot, flip, ctx.globalAlpha]);
    if (opts.record) this._lastBody = { p: fr.pix, dx: x - this._ax, dy: y - this._ay, k, rot, flip };
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
    const s = view.scale;
    for (const g of this._glows) glowPx(ctx, g[0], g[1], g[2], g[3], g[4] * this.alpha);
    void s;
  }

  // ================================================================ humanoids
  drawHuman(ctx, x, y) {
    const e = this.ent, st = e.st, k = this.k;
    this._ax = x; this._ay = y;
    this._glows = null;
    const f = e.facing;
    const vName = this.pickView(f);
    const V = this.spr.views[vName];
    const flip = vName === 'side' && this.flip;
    const m = this.spr.m;
    const dirx = Math.sin(f), dirz = Math.cos(f);
    const alpha = screenAngle(f);
    const sg = dirx < -0.05 || (Math.abs(dirx) <= 0.05 && dirz < 0) ? -1 : 1;     // which side the weapon rests on
    const kind = st.action ? st.kind : null;
    const u = clamp01(st.actionT || 0);
    const su = st.strikeU || 0.5;

    // ---- mount underneath
    let bx = x, by = y;
    if (this.mount && st.ride) {
      const M = this.mount, MV = M.spr.views.side;
      const fr = (st.moveSpeed || 0) > 0.4 ? MV.run[Math.floor(M.ph) % 4] : MV.idle[Math.floor(this.t * 1.5) % 2];
      this.body(ctx, fr, x, y, M.k, 0, this.flip, { noAura: true });
      const seat = M.spr.seat || [0, -14];
      bx = x + (this.flip ? -seat[0] : seat[0]) * M.k;
      by = y + seat[1] * M.k + (FEET - m.legTop) * k + ((st.moveSpeed || 0) > 0.4 && Math.floor(M.ph) % 2 ? -1 : 0);
    }

    // ---- frame
    let anim = 'idle', fi = Math.abs(Math.floor(this.t * 1.7 + (st.seed || 0))) % 2;
    const casting = kind && CASTS.has(kind) && u > 0.18 && u < 0.88;
    if (e.dead) anim = 'hurt';
    else if (st.ride) anim = 'ride';
    else if ((st.hitT || 0) > 0.55 && !kind) anim = 'hurt';
    else if (casting) anim = 'cast';
    else if ((st.moveSpeed || 0) > 0.4) { anim = 'run'; fi = Math.floor(this.ph) % 4; }
    const frames = V[anim] || V.idle;
    const fr = frames[fi % frames.length];

    // ---- body motion: lunge along the aim, recoil when hit, roll, death fall
    let lx = 0, ly = 0, rot = 0;
    const lunge = kind ? lungeFor(kind, u, su) : 0;
    lx += dirx * lunge * k; ly += dirz * lunge * k;
    if ((st.hitT || 0) > 0.35 && !e.dead) { lx -= dirx * k; ly -= dirz * k; }
    let pivotUp = 0;
    if (st.dodgeT !== undefined && st.dodgeT >= 0) {
      rot = easeIO(clamp01(st.dodgeT)) * TAU * (dirx < 0 ? -1 : 1);
      pivotUp = Math.round((FEET - (m.legTop + m.headTop) / 2) * k);
    }
    if (e.dead) rot = (this._deathSide || (this._deathSide = (e.id % 2 ? 1 : -1))) * (Math.PI / 2) * easeOut(clamp01(e.deathT * 3.2));
    // fully charged heavy attack: a 1px tremble
    if (kind && (st.charge || 0) > 0.9) lx += Math.floor(this.t * 30) % 2;
    lx = Math.round(lx); ly = Math.round(ly);
    const px = bx + lx, py = by + ly;

    // ---- weapon pose
    const wpn = this.weapon;
    let wspr = null, wrot = 0, reach = 0, lift = 0, smear = false;
    const handPose = casting ? 'cast' : anim === 'ride' ? 'ride' : 'idle';
    const hand = handOffset(m, vName, flip, handPose);
    if (wpn && !e.dead) {
      const type = wpn.type;
      const pole = POLES.has(type);
      const combat = st.combat || !!kind;
      let rest = pole && !kind ? -Math.PI / 2 + sg * 0.3 - alpha : type === 'bow' ? 0 : sg * (combat ? 0.55 : 0.95);
      if (type === 'wand') rest = sg * 0.6;
      if (pole && combat && !kind) rest = sg * 0.35;
      wrot = alpha + rest;
      let draw = 0;
      if (st.spin) { wrot = this.t * 28; smear = true; }
      else if (st.block) { wrot = alpha - sg * 1.15; reach = 1; }
      else if (kind) {
        const P = swingFor(kind, u, su, sg, rest, alpha);
        wrot = alpha + P.rot; reach = P.reach; lift = P.lift; smear = P.smear; draw = P.draw || 0;
        if (P.abs !== undefined) wrot = P.abs;
      }
      if (type === 'bow') draw = kind === 'bowdraw' ? Math.round(u * 2) / 2 : 0;
      if (type === 'crossbow') draw = kind === 'xbow' && u < 0.6 ? 0 : 1;
      wspr = weaponSprite(type === 'bow' || type === 'crossbow' ? { ...wpn, draw } : wpn);
    }
    const wx = px + Math.round(hand[0] * k + dirx * reach * k);
    const wy = py + Math.round((hand[1] - lift) * k + dirz * reach * k);
    const weaponBehind = vName === 'up' || (vName === 'side' && wpn && POLES.has(wpn.type) && !kind && !st.combat);

    // ---- shield & tome positions
    const off = handOffset(m, vName, flip, 'off');
    const shieldUp = !!st.block || kind === 'bash';
    const drawShield = () => {
      if (!this.shield || e.dead) return;
      let sp = vName === 'up' ? this.shield.back : vName === 'side' ? this.shield.edge : this.shield.front;
      let sx0 = off[0], sy0 = off[1] + 1;
      // side view at rest: the shield arm is on the far side, so it hangs behind the back
      if (vName === 'side' && !shieldUp) sx0 = flip ? 2 : -2;
      if (st.block || kind === 'bash') {
        sp = vName === 'up' ? this.shield.back : this.shield.front;
        const r = kind === 'bash' ? lerp(2, 6, Math.sin(Math.PI * clamp01(u * 1.4))) : 3;
        sx0 = vName === 'side' ? (flip ? -3 : 3) : 0; sy0 = -Math.round((FEET - m.torsoTop) * 0.6);
        sx0 += Math.round(dirx * r); sy0 += Math.round(dirz * r);
      }
      this.body(ctx, { pix: sp, emis: null }, px + sx0 * k, py + sy0 * k, k, 0, false, { noAura: true });
    };
    const drawTome = () => {
      if (!this.tome || e.dead) return;
      const bob = Math.round(Math.sin(this.t * 2.6) * 1.5);
      const tx = px + (off[0] + (off[0] >= 0 ? 4 : -4)) * k, ty = py + (off[1] - 8 + bob) * k;
      this.body(ctx, this.tome, tx, ty, k, 0, off[0] < 0, { noAura: true });
      this._glows = this._glows || [];
      this._glows.push([tx, ty - 4 * k, '#ffd080', 5 * k, 0.35]);
    };
    const drawWeapon = () => {
      if (!wspr || wspr.none) return;
      let rr = wrot, p = wspr.pix, em = wspr.emis, fl = false;
      // keep blades right side up when pointing left
      if (Math.cos(rr) < 0) { fl = true; rr += Math.PI; }
      // swing smear: two pale echoes trailing the blade through the strike
      if (smear && this.prevRot !== null && !this._xray) {
        let d = wrot - this.prevRot;
        while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
        if (Math.abs(d) > 0.08) for (let i = 1; i <= 3; i++) {
          let r2 = wrot - d * (i / 3), f2 = false;
          if (Math.cos(r2) < 0) { f2 = true; r2 += Math.PI; }
          ctx.globalAlpha = this.alpha * (0.5 - i * 0.12);
          blit(ctx, variant(p, 'smear'), wx, wy, k, r2, f2);
        }
        ctx.globalAlpha = this.alpha;
      }
      this.body(ctx, { pix: p, emis: em }, wx, wy, k, rr, fl, { noAura: true });
      const len = (wspr.len || 8) * k;
      const tipx = wx + Math.cos(wrot) * len, tipy = wy + Math.sin(wrot) * len;
      this._tipPx = [tipx - x, tipy - y];
      if (wspr.orb) {
        const ox = wx + Math.cos(wrot) * wspr.orb[0] * k, oy = wy + Math.sin(wrot) * wspr.orb[0] * k;
        this._tipPx = [ox - x, oy - y];
        this._glows = this._glows || [];
        this._glows.push([ox, oy, wspr.orbColor, (kind && CASTS.has(kind) ? 9 : 6) * k, kind && CASTS.has(kind) ? 0.75 : 0.45]);
      } else if (wpn.element && ELEM_GLOW[wpn.element]) {
        this._glows = this._glows || [];
        this._glows.push([(wx + tipx) / 2, (wy + tipy) / 2, ELEM_GLOW[wpn.element], 6 * k, 0.3]);
      }
    };

    // ---- compose (back-to-front)
    this._tipPx = [hand[0] * k, hand[1] * k];
    if (weaponBehind) drawWeapon();
    if (vName === 'up') { drawShield(); drawTome(); }
    else if (vName === 'side' && !shieldUp) drawShield();
    const bodyY = py + (pivotUp && rot ? -pivotUp : 0);
    if (rot && pivotUp) {
      // roll around the body centre
      ctx.save(); ctx.translate(px, bodyY); ctx.rotate(rot);
      const n = this.ops.length;
      this.body(ctx, fr, 0, pivotUp, k, 0, flip, { record: false });
      this.ops.length = n;
      ctx.restore();
      this._lastBody = { p: fr.pix, dx: px - x, dy: py - y, k, rot: 0, flip };
    } else this.body(ctx, fr, px, py, k, rot, flip, { record: true });
    if (vName !== 'up') { if (vName !== 'side' || shieldUp) drawShield(); drawTome(); }
    if (!weaponBehind) drawWeapon();
    this.prevRot = wspr ? wrot : null;
    this._hand = [hand[0] * k + lx, hand[1] * k + ly];
  }

  // ================================================================ creatures
  drawCreature(ctx, x, y) {
    const e = this.ent, st = e.st, k = this.k;
    this._ax = x; this._ay = y;
    this._glows = null;
    const vName = this.pickView(e.facing);
    const V = this.spr.views[vName] || this.spr.views.side || this.spr.views.down;
    const flip = this.sideOnly && this.flip;
    const kind = st.action ? st.kind : null;
    const u = clamp01(st.actionT || 0);
    const su = st.strikeU || 0.6;
    let fr;
    if (e.dead) fr = V.hurt[0];
    else if (st.breathing || st.charging) fr = V.atk[1];
    else if (kind && u < su + 0.25) fr = u < su - 0.06 ? V.atk[0] : V.atk[1];
    else if ((st.hitT || 0) > 0.55) fr = V.hurt[0];
    else if (st.flying && V.fly) fr = V.fly[Math.floor(this.t * 6) % 2];
    else if (this.spr.flapFps) fr = V.run[Math.floor(this.t * this.spr.flapFps) % V.run.length];
    else if ((st.moveSpeed || 0) > 0.4) fr = V.run[Math.floor(this.ph) % V.run.length];
    else fr = V.idle[Math.abs(Math.floor(this.t * (this.kind === 'wraith' ? 5 : 1.8) + (st.seed || 0))) % V.idle.length];
    // hovering bodies bob; knock-back nudge; death
    let oy = 0, ox = 0, rot = 0;
    if (this.kind === 'wraith' || this.kind === 'eye') oy = -Math.round((3 + Math.sin(this.t * 2.2 + (st.seed || 0)) * 1.5) * k);
    if ((st.hitT || 0) > 0.35 && !e.dead) { ox -= Math.round(Math.sin(e.facing) * k); oy -= Math.round(Math.cos(e.facing) * k); }
    if (e.dead) {
      const d = easeOut(clamp01(e.deathT * 3));
      if (this.kind === 'quadruped' || this.kind === 'arachnid' || this.kind === 'dragon') rot = (flip ? -1 : 1) * d * Math.PI * 0.5;
      if (this.kind === 'wraith' || this.kind === 'eye' || this.kind === 'flyer') oy += Math.round(d * 4 * k);
    }
    const px = x + ox, py = y + oy;
    // serpent body segments, sorted back-to-front with the head
    if (this.kind === 'serpent' && this.segs) {
      const order = this.segs.map((s, i) => [s, i]).sort((a, b) => a[0].z - b[0].z);
      const headZ = e.pos.z;
      let headDrawn = false;
      for (const [s, i] of order) {
        if (!headDrawn && s.z > headZ) { this.body(ctx, fr, px, py, k, rot, flip, { record: true }); headDrawn = true; }
        const sp = this.spr.segs[Math.min(i, this.spr.segs.length - 1)];
        const sh = s.y - view.ground(s.x, s.z);
        if (sh < -0.2) continue;
        this.body(ctx, sp, Math.round(s.x * PPU - view.x0), Math.round(s.z * PPU - view.y0 - sh * PPU) - Math.round(sp.pix.oy * 0.75) * k, k, 0, false);
      }
      if (!headDrawn) this.body(ctx, fr, px, py, k, rot, flip, { record: true });
    } else this.body(ctx, fr, px, py, k, rot, flip, { record: true });
    // floating eye iris tracks its target
    if (this.spr.iris && !e.dead) {
      const tg = e.target;
      let ax = Math.sin(e.facing), az = Math.cos(e.facing);
      if (tg) { const dx = tg.pos.x - e.pos.x, dz = tg.pos.z - e.pos.z, d = Math.hypot(dx, dz) || 1; ax = dx / d; az = dz / d; }
      const L = this.spr.lookR;
      const ix = px + Math.round(ax * L * k), iy = py + Math.round((this.spr.eyeAt[1] + az * L) * k);
      this.body(ctx, this.spr.iris, ix, iy, k, 0, false, { noAura: true });
      this._glows = [[ix, iy, this.spec.creature.c3, 7 * k, st.action ? 0.8 : 0.4]];
    }
    // glowing maw while breathing fire / beams
    if ((st.breathing || (kind === 'cast' && u > su - 0.1 && u < su + 0.3)) && this.spr.mouth) {
      const mx = px + (flip ? -this.spr.mouth[0] : this.spr.mouth[0]) * k, my = py + this.spr.mouth[1] * k;
      this._glows = this._glows || [];
      this._glows.push([mx, my, this.spec.creature.c3, 10 * k, 0.8]);
    }
    const mouth = this.spr.mouth || [0, -Math.round(this.heightPx * 0.6 / k)];
    this._tipPx = [(flip ? -mouth[0] : mouth[0]) * k + ox, mouth[1] * k + oy];
    this._hand = this._tipPx;
  }

  // -------------------------------------------------------------- world-space helpers
  // tip of the weapon / staff orb / creature mouth in world space (projectile origins)
  weaponTip(out) {
    const e = this.ent;
    const t = this._tipPx || [0, -12];
    const hUnits = Math.max(0.6, -t[1] / PPU * 0.6);
    out.x = e.pos.x + t[0] / PPU;
    out.y = e.pos.y + hUnits;
    out.z = e.pos.z + (t[1] / PPU + hUnits);
    return out;
  }
  handPos(out) {
    const e = this.ent;
    const t = this._hand || [0, -8];
    out.x = e.pos.x + t[0] / PPU;
    out.y = e.pos.y + Math.max(0.6, -t[1] / PPU);
    out.z = e.pos.z;
    return out;
  }
}

// ------------------------------------------------------------------ hand anchors (sprite px from the feet)
function handOffset(m, v, flip, pose) {
  const hy = pose === 'cast' ? m.torsoTop - FEET - 3 : pose === 'ride' ? m.legTop - FEET - 2 : m.legTop - FEET - 1;
  const half = Math.floor(m.torsoW / 2) + m.armW;
  let hx;
  if (pose === 'off') {
    if (v === 'down') hx = half; else if (v === 'up') hx = -half; else hx = flip ? -2 : 2;
    return [hx, m.legTop - FEET - 2];
  }
  if (v === 'down') hx = -half + 1; else if (v === 'up') hx = half - 1; else hx = flip ? -1 : 1;
  return [hx, hy];
}

// ------------------------------------------------------------------ swing curves
// Phases relative to the strike point su: wind-up [0, su-0.1], strike [su-0.1, su+0.08], recover.
function phases(u, su) {
  const a = Math.max(0.05, su - 0.1), b = Math.min(0.95, su + 0.08);
  return { w: clamp01(u / a), s: clamp01((u - a) / (b - a)), r: clamp01((u - b) / (1 - b)), inWind: u < a, inStrike: u >= a && u < b };
}
function arc(from, to, rest, ph) {
  if (ph.inWind) return lerp(rest, from, easeOut(ph.w));
  if (ph.inStrike) return lerp(from, to, easeOut(ph.s));
  return lerp(to, rest, easeIO(ph.r));
}
function swingFor(kind, u, su, sg, rest, alpha) {
  const ph = phases(u, su);
  const strikeReach = (r) => (ph.inWind ? lerp(0, -1, ph.w) : ph.inStrike ? lerp(-1, r, easeOut(ph.s)) : lerp(r, 0, easeIO(ph.r)));
  switch (kind) {
    case 'slash': return { rot: arc(-1.9 * sg, 1.7 * sg, rest, ph), reach: strikeReach(2), lift: 0, smear: ph.inStrike };
    case 'backslash': return { rot: arc(1.9 * sg, -1.7 * sg, rest, ph), reach: strikeReach(2), lift: 0, smear: ph.inStrike };
    case 'sweep': return { rot: arc(-2.5 * sg, 2.4 * sg, rest, ph), reach: strikeReach(3), lift: 0, smear: ph.inStrike };
    case 'claw': return { rot: arc(-1.4 * sg, 1.4 * sg, rest, ph), reach: strikeReach(3), lift: 0, smear: ph.inStrike };
    case 'throw': return { rot: arc(-2.3 * sg, 0.7 * sg, rest, ph), reach: strikeReach(2), lift: ph.inWind ? 2 * ph.w : 0, smear: ph.inStrike };
    case 'thrust': case 'stab': case 'spearthrust': {
      const far = kind === 'spearthrust' ? 11 : kind === 'thrust' ? 8 : 6;
      const back = kind === 'spearthrust' ? -5 : -3;
      const reach = ph.inWind ? lerp(0, back, easeOut(ph.w)) : ph.inStrike ? lerp(back, far, easeOut(ph.s)) : lerp(far, 0, easeIO(ph.r));
      return { rot: ph.inWind ? lerp(rest, 0.12 * sg, ph.w) : ph.inStrike ? 0 : lerp(0, rest, ph.r), reach, lift: 0, smear: false };
    }
    case 'overhead': case 'slam': {
      const up = kind === 'slam' ? 6 : 4;
      const rot = arc(-2.7 * sg, 0.15 * sg, rest, ph);
      const lift = ph.inWind ? up * easeOut(ph.w) : ph.inStrike ? up * (1 - easeIn(ph.s)) : 0;
      return { rot, reach: strikeReach(kind === 'slam' ? 3 : 4), lift, smear: ph.inStrike };
    }
    case 'cast': return { rot: ph.inWind ? lerp(rest, -0.7 * sg, ph.w) : ph.inStrike ? lerp(-0.7 * sg, 0, ph.s) : lerp(0, rest, ph.r), reach: strikeReach(4), lift: ph.inWind ? 2 * ph.w : 0, smear: false };
    case 'castup': return { rot: 0, abs: -Math.PI / 2 + sg * 0.15, reach: 0, lift: u < 0.8 ? 4 * easeOut(clamp01(u * 3)) : 4 * (1 - (u - 0.8) * 5), smear: false };
    case 'nova': {
      if (ph.inWind) return { rot: 0, abs: -Math.PI / 2, reach: 0, lift: 5 * easeOut(ph.w), smear: false };
      return { rot: ph.inStrike ? lerp(-Math.PI / 2 - alpha, 0.4 * sg, easeOut(ph.s)) : lerp(0.4 * sg, rest, ph.r), reach: strikeReach(2), lift: 0, smear: ph.inStrike };
    }
    case 'bowdraw': return { rot: 0, reach: -Math.round(u * 2), lift: 0, draw: u };
    case 'bowrelease': return { rot: 0, reach: u < 0.18 ? -2 + u * 6 : 0, lift: 0 };
    case 'xbow': return { rot: 0, reach: u < 0.12 ? -3 : u < 0.3 ? lerp(-3, 0, (u - 0.12) / 0.18) : 0, lift: 0 };
    case 'bash': return { rot: rest * 0.5, reach: 0, lift: 0 };
    default: return { rot: arc(-1.6 * sg, 1.5 * sg, rest, ph), reach: strikeReach(2), lift: 0, smear: ph.inStrike };
  }
}
// whole-body lunge (px) along the aim: small anticipation, big punchy step on the strike
function lungeFor(kind, u, su) {
  if (kind === 'bowdraw' || kind === 'bowrelease' || kind === 'castup') return 0;
  const ph = phases(u, su);
  const big = kind === 'spearthrust' || kind === 'thrust' || kind === 'overhead' || kind === 'slam' || kind === 'sweep' || kind === 'bash' ? 3 : kind === 'xbow' ? -1 : 2;
  if (ph.inWind) return -Math.round(easeOut(ph.w) * (big > 0 ? 1 : 0));
  if (ph.inStrike) return Math.round(lerp(-1, big, easeOut(ph.s)));
  return Math.round(lerp(big, 0, easeIO(ph.r)));
}
