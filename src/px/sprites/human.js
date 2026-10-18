// Procedural pixel humanoids, drawn natively at the game's pixel density (PPU 16: a hooded hero is
// ~40 px from hood tip to boot sole). Chunky heroic proportions in three views (down / side / up):
// a big head or hood, a compact body and big boots, 3-4 tone material ramps (cloth, leather, mail,
// plate, skin, hair), a top-left key light, selective outlines, readable faces, varied hair, and
// armour that changes the silhouette by weight. Arms are NOT baked in: the actor draws them at
// runtime from the shoulder anchors in `m`, so hands can follow the weapon through every swing.
//
// Frames are generated lazily per pose and cached. A pose is { legs, ph, bob, lean, hdx, hdy,
// cape, sway, face, wing }, offsets in today's pixels:
//   legs  'stand' | 'run' | 'sprint' | 'stance' | 'lunge' | 'tuck' | 'kneel' | 'ride'
//   ph    run phase 0..5 (contact, down, push, contact', down', push')
//   bob   torso + head drop in px (+ squashes the legs, - stretches them)
//   lean  torso shift toward the facing (side view; the head leads by one more px)
//   hdx/hdy extra head offset (hurt recoil, breathing)
//   cape  cape / hair / tail sway phase 0..3; sway = billow 0 (still) .. 2 (sprint)
//   face  0 normal, 1 blink, 2 hurt, 3 shout
// Every look carries its own frame geometry in `m` (frame size, pivot column m.cx, sole row
// m.feet), because big bodies are drawn at their real size. Geometry that grows with the body uses
// m.hf (1 for people, up to ~2.4 for giant bosses); outlines, eyes and glints stay 1 px.
// Glowing pixels (eyes, runes, embers, void marks) go to a separate emissive layer.
import { Pix, C, light, dark, mixc, alpha, hash2, ART } from '../pix.js';

const cache = new Map();

export function humanSprites(look) {
  const key = JSON.stringify(look);
  let s = cache.get(key);
  if (s) return s;
  const L = norm(look);
  const m = metrics(L);
  const frames = new Map();
  s = {
    L, m, pal: armPalette(L, m),
    // pivot to the top of the head (hoods, helms and horns add a little)
    height: m.feet - m.headTop + 1 + (L.helm || L.horns || L.beastEars || L.canopy ? Math.round(5 * m.hf) : 1),
    frame(view, pose = {}) {
      const k = view + ':' + (pose.legs || 'stand') + (pose.ph | 0) + ':' + (pose.bob | 0) + ':' + (pose.lean | 0) + ':' + (pose.hdx | 0) + ':' + (pose.hdy | 0) + ':' + (pose.cape | 0) + ':' + (pose.sway | 0) + ':' + (pose.face | 0) + ':' + (pose.wing | 0);
      let f = frames.get(k);
      if (!f) {
        // poses are generated lazily; a hard cap keeps odd pose combinations from piling up
        if (frames.size > 480) frames.delete(frames.keys().next().value);
        f = fig(L, m, view, pose); frames.set(k, f);
      }
      return f;
    },
  };
  // looks are shared by every actor wearing them; drop the oldest once there are many (actors keep
  // their own reference, so nothing in use is lost)
  if (cache.size > 360) cache.delete(cache.keys().next().value);
  cache.set(key, s);
  return s;
}

const SHORT = ['short', 'messy', 'swept', 'spiky', 'short'];
const LONG = ['long', 'ponytail', 'braid', 'long', 'bun'];
const IRIS = ['#241826', '#22304e', '#2e4424', '#4a2e1a', '#241826'];
function norm(o) {
  const vs = (o.vseed ?? 0) | 0;
  let style = o.hairStyle;
  if (!style) style = o.longHair ? LONG[vs % LONG.length] : o.tusks ? 'mohawk' : o.beard ? 'crop' : SHORT[vs % SHORT.length];
  return {
    skin: o.skin || '#d8b090', hair: o.hair || null, hairStyle: style, vs,
    beard: !!o.beard, ears: o.ears || null, beastEars: !!o.beastEars, tusks: !!o.tusks, horns: !!o.horns, fins: !!o.fins, finColor: o.finColor || '#3a8a9a',
    wings: !!o.wings, wingColor: o.wingColor || '#e0c0ff', tail: !!o.tail, eyes: o.eyesGlow || null, voidMarks: o.voidMarks || null, glowSkin: o.glowSkin || null,
    stone: !!o.stone, skeleton: !!o.skeleton, bark: !!o.bark, golem: !!o.golem, scales: !!o.scales,
    scale: o.scale || 1, build: o.build || 1,
    shirt: o.shirt || '#6a5a4a', pants: o.pants || '#4a3a30', boots: o.bootsColor || '#3a2a20',
    // a class's default hood is worn when no helm is equipped; hooded figures get a cloak that
    // wraps across the chest
    helm: o.helm || o.hoodDefault || null, chest: o.chest || null, gloves: o.gloves || null, legs: o.legs || null, bootsGear: o.bootsGear || null,
    cape: o.cape || o.cloak || null, capeTrim: o.capeTrim || null, cloak: !!o.cloak && (!o.helm || o.helm.kind === 'hood'), apron: o.apron || null, crown: o.crown || null, scarf: o.scarf || null, quiver: !!o.quiver,
    canopy: o.canopy || null, knots: o.knots || null, crystals: o.crystals || null, core: o.core || null,
    iris: IRIS[vs % IRIS.length],
  };
}

// Proportions after the reference art: a big head (or a bigger hood), a compact torso and short
// legs in chunky boots. A plain human is 35 px from crown to sole, 40 px with a pointed hood.
// Big bodies (bosses up to scale 3) grow everything, the head a little slower.
function metrics(L) {
  const s = L.scale, b = L.build;
  const hf = s <= 1.1 ? 1 : 1 + (s - 1.1) * 0.75;
  const S = (v) => Math.round(v * hf);
  const ev = (v) => 2 * Math.round(v / 2);
  const headW = ev((L.skeleton ? 10 : b > 1.2 ? 14 : 12) * hf);
  const headH = Math.round((L.skeleton ? 10 : 11) * hf);
  const torsoW = Math.max(8, ev(10 * Math.pow(b, 0.85) * hf));
  const twSide = Math.max(6, Math.round(torsoW * 0.75));
  const torsoH = Math.max(8, Math.round(12 * s + (b > 1.25 ? 1 : 0)));
  const legH = Math.max(8, Math.round(13 * s));
  const bootH = Math.max(4, S(5));
  const armW = Math.max(2, Math.round((L.skeleton ? 2 : b > 1.3 ? 4 : 3) * hf));
  const armL = Math.round(torsoH * 0.85 + 1);
  const pad = L.chest && (L.chest.weight === 'plate' || L.chest.weight === 'mail') ? S(2) : 0;
  // frame: room above the head for hoods, plumes, horns, crowns and leaf canopies
  const headTop = S(L.canopy ? 22 : 14) + 2;
  const torsoTop = headTop + headH - 1;
  const legTop = torsoTop + torsoH;
  const feet = legTop + legH - 1;
  const half = (torsoW >> 1) + S(20) + 3;
  return { headW, headH, torsoW, twSide, torsoH, legH, bootH, legTop, torsoTop, headTop, armW, armL, pad, cx: half, feet, fw: half * 2, fh: feet + S(4) + 3, hf, u: ART * hf };
}

// default frame geometry (a plain human); every look carries its own in sprites.m
const DEF = metrics(norm({}));
export const FW = DEF.fw, FH = DEF.fh, CX = DEF.cx, FEET = DEF.feet;

// colours the actor needs to draw the runtime arms
function armPalette(L, m) {
  const sleeve = L.skeleton ? C('#ddd4be') : L.chest ? C(L.chest.color) : C(L.shirt);
  const plate = L.chest?.weight === 'plate' || L.chest?.weight === 'mail';
  const skin = skinOf(L);
  const hand = L.skeleton ? C('#e8e0cc') : L.gloves ? C(L.gloves.color) : skin;
  return {
    sleeve, sleeveL: light(sleeve, plate ? 1.3 : 1.16), sleeveD: dark(sleeve, 0.66), cuff: L.chest?.trim ? C(L.chest.trim) : dark(sleeve, 0.8),
    hand, handL: light(hand, 1.14), handD: dark(hand, 0.7), w: m.armW, plate,
  };
}
function skinOf(L) { return L.skeleton ? C('#e8e0cc') : C(L.skin); }

// ------------------------------------------------------------------ material ramps
// dd (deep shadow) / d / md (half shadow) / m / l (lit) / ll (highlight)
const ramp = (c, kd = 0.68, kl = 1.18) => { c = C(c); const d = dark(c, kd); return { dd: dark(c, kd * 0.66), d, md: mixc(c, d, 0.5), m: c, l: light(c, kl), ll: light(c, kl * 1.14) }; };
const skinRamp = (c) => { c = C(c); const d = mixc(dark(c, 0.74), '#a03028', 0.12); return { d, md: mixc(c, d, 0.5), m: c, l: light(c, 1.1), dd: mixc(dark(c, 0.56), '#601820', 0.15) }; };
const dim = (R) => { const o = {}; for (const k in R) o[k] = dark(R[k], 0.8); return o; };
// one step darker on a ramp (texture passes)
const stepD = (R, c) => (c === R.ll ? R.l : c === R.l ? R.m : c === R.m ? R.md : c === R.md ? R.d : R.dd);

// run cycle: stance (front -> back) then swing (back -> front, lifted)
const FOOT_POS = [1, 0, -1, -1, 0, 1], FOOT_LIFT = [0, 0, 0, 1, 2, 1];
function feet(pose, m) {
  const Lg = pose.legs || 'stand', S = (v) => Math.round(v * m.u);
  if (Lg === 'run' || Lg === 'sprint') {
    const a = (pose.ph | 0) % 6, b = (a + 3) % 6, big = Lg === 'sprint';
    const lift = (i) => S(FOOT_LIFT[i] * (big ? 1.4 : 1));
    return { a: { pos: FOOT_POS[a], lift: lift(a) }, b: { pos: FOOT_POS[b], lift: lift(b) }, stride: S(big ? 4 : 3), fy: 1 };
  }
  if (Lg === 'stance') return { a: { pos: 1, lift: 0 }, b: { pos: -1, lift: 0 }, stride: S(2), wide: S(1), fy: 1 };
  if (Lg === 'lunge') return { a: { pos: 1, lift: 0 }, b: { pos: -1, lift: 0 }, stride: S(4), wide: S(1), bendA: 1, fy: S(1) };
  if (Lg === 'tuck') return { a: { pos: 1, lift: S(3) }, b: { pos: 0, lift: S(3) }, stride: S(2), tuck: 1, fy: 0 };
  if (Lg === 'kneel') return { a: { pos: 1, lift: S(1) }, b: { pos: -1, lift: 0 }, stride: S(3), kneel: 1, fy: 0 };
  return { a: { pos: 0, lift: 0 }, b: { pos: 0, lift: 0 }, stride: 0, fy: 0 };
}

// ------------------------------------------------------------------ one frame
function fig(L, m, view, pose) {
  const p = new Pix(m.fw, m.fh); p.ox = m.cx; p.oy = m.feet;
  const e = new Pix(m.fw, m.fh); e.ox = m.cx; e.oy = m.feet;
  const side = view === 'side', up = view === 'up';
  const bob = pose.bob | 0;
  const lean = side ? pose.lean | 0 : 0;
  const tw = side ? m.twSide : m.torsoW;
  const bx = m.cx + lean;                                 // torso centre column
  const tl = bx - (tw >> 1), tr = tl + tw - 1;
  const ty0 = m.torsoTop + bob, ty1 = m.legTop - 1 + bob;
  const chest = L.chest, cw = L.skeleton ? null : chest?.weight;
  const robe = cw === 'cloth';
  const S = (v) => Math.round(v * m.hf);
  const F = { L, m, view, side, up, pose, bob, lean, tw, bx, tl, tr, ty0, ty1, cw, robe, ft: feet(pose, m), FE: m.feet, S, mL: tl + ((tw - 1) >> 1), mR: tl + (tw >> 1) };
  const hx = (side ? lean + (lean >= 3 ? 1 : 0) : 0) + (pose.hdx | 0), hy = bob + (pose.hdy | 0);

  // ---- back layer
  if (L.wings) wings(p, e, F);
  if (L.cape && !up) cape(p, F);
  if (L.tail && pose.legs !== 'ride') tail(p, F);
  if (!up) backHair(p, F, hx, hy);
  if (L.quiver && !up) quiver(p, F, true);
  // ---- legs, skirt, torso
  if (pose.legs !== 'ride') legs(p, F);
  else rideLegs(p, F);
  if (robe && pose.legs !== 'ride' && pose.legs !== 'tuck') robeSkirt(p, F);
  torso(p, e, F);
  if (L.apron && !up) apron(p, F);
  if (cw && cw !== 'cloth' && !L.golem) pauldrons(p, F);
  if (L.golem) boulders(p, e, F);
  if (L.cape && up) cape(p, F);
  if (L.cloak && !up && pose.legs !== 'ride') drape(p, F);
  if (L.quiver && up) quiver(p, F, false);
  if (L.scarf) scarf(p, F, hx, hy);
  // ---- head
  head(p, e, F, hx, hy);
  // ---- finish: selective outline, then emissive
  p.outlineSel();
  return { pix: p, emis: hasPixels(e) ? e : null };
}
function hasPixels(p) { for (let i = 3; i < p.d.length; i += 4) if (p.d[i]) return true; return false; }

// ------------------------------------------------------------------ legs
function legs(p, F) {
  const { L, m, side, up, tw, tl, tr, ty1, ft, FE, S } = F;
  const legR = ramp(L.legs?.color || L.pants, 0.66, 1.14);
  const bootR = ramp(L.bootsGear?.color || L.boots, 0.62, 1.2);
  const armoured = !!L.legs && !L.skeleton;
  const plateLegs = armoured && L.chest?.weight === 'plate';
  const mailLegs = armoured && L.chest?.weight === 'mail';
  const hipY = ty1 + 1, BH = m.bootH;
  if (L.skeleton) {
    const bone = C('#ddd4be'), boneD = dark(bone, 0.72), boneL = light(bone, 1.08);
    const draw = (x, f, far) => {
      const yb = FE - f.lift + (side ? 0 : (up ? -f.pos : f.pos) * ft.fy);
      const fx = side ? x + f.pos * ft.stride : x;
      const kx = Math.round((x + fx) / 2) + (side && (f.lift || ft.kneel) ? S(2) : 0), ky = Math.round((hipY + yb) / 2);
      p.line(x, hipY, kx, ky, far ? boneD : bone, 2);
      p.line(kx, ky, fx, yb - 1, far ? boneD : bone, 2);
      p.rect(kx - 1, ky - 1, 3, 2, far ? boneD : boneL);                         // knee cap
      p.rect(fx - 1, yb, side ? S(5) : S(4), 1, far ? boneD : bone);             // foot
      p.set(fx - 1, yb - 1, far ? boneD : bone);
    };
    if (side) { draw(F.bx - 1, ft.b, true); draw(F.bx, ft.a, false); }
    else { draw(tl + S(2), ft.a, false); draw(tr - S(2), ft.b, false); }
    // pelvis
    p.rect(tl + 1, hipY - 2, tw - 2, 2, bone); p.rect(tl + 1, hipY, tw - 2, 1, boneD); p.rect(F.mL, hipY - 2, F.mR - F.mL + 1, 3, boneD);
    return;
  }
  if (side) {
    // two-segment legs: hip -> knee -> boot, the boot pointing forward (+x)
    const hipX = F.bx - 1;
    const th = Math.max(3, Math.round(tw * 0.5));
    const be = -(th >> 1), fe = th - 1 + be;              // back / front edge of a thick line
    const toe = S(3);
    const leg = (f, far) => {
      const R = far ? dim(legR) : legR, B = far ? dim(bootR) : bootR;
      const sole = FE - f.lift, bootTop = sole - BH + 1;
      let fx = hipX + Math.round(f.pos * ft.stride * 0.8);
      const kneeY = Math.round((hipY + bootTop) / 2);
      let kx = Math.round((hipX + fx) / 2) + (f.lift > 0 || ft.kneel ? S(3) : f.pos > 0 ? S(1) : 0);
      if (ft.tuck) { kx = hipX + S(5); fx = hipX + S(2); }
      if (ft.bendA && !far) kx += S(1);
      p.line(hipX, hipY, kx, kneeY, R.m, th);                                   // thigh
      p.line(kx, kneeY, fx, bootTop, R.m, th);                                  // shin
      p.line(kx + be, kneeY + 1, fx + be, bootTop, R.md);                       // calf in shade
      p.line(hipX + fe, hipY - 1, kx + fe, kneeY - 1, R.l);                     // lit front of the thigh
      p.set(kx + fe, kneeY, plateLegs ? R.ll : R.l);                            // knee
      if (plateLegs) { p.set(kx + fe - 1, kneeY, R.l); p.set(kx + fe, kneeY + 1, R.d); p.set(kx + fe - 1, kneeY + 1, R.d); }
      if (mailLegs) for (let y = hipY; y < bootTop; y += 2) p.set(Math.round(hipX + (kx - hipX) * Math.min(1, (y - hipY) / Math.max(1, kneeY - hipY))), y, R.md);
      // boot: shaft, a folded cuff, the foot pointing forward with a dark sole and a bright toe cap
      for (let y = bootTop; y <= sole; y++) {
        const r = y - bootTop;
        const xa = fx + be - (y === sole ? 1 : 0);
        const xb = fx + fe + 1 + (y === sole ? toe : y === sole - 1 ? toe - 1 : 0);
        for (let x = xa; x <= xb; x++) {
          let c = x === xa ? B.l : x === xb ? B.d : B.m;
          if (r === 0) c = x >= xb ? B.m : B.l;
          else if (r === 1 && BH >= 5) c = x === xa ? B.md : B.d;
          if (y === sole) c = x <= xa + 1 ? B.dd : B.d;
          p.set(x, y, c);
        }
        if (y === sole - 1) { p.set(xb - 1, y, B.ll); p.set(xb - 2, y, B.l); }
      }
    };
    leg(ft.b, true);
    leg(ft.a, false);
    return;
  }
  // front / back view: two legs, the stepping foot lower (toward the camera) or lifted
  const gap = tw >= 9 ? 2 : 1, lw = Math.max(3, (tw - gap) >> 1), wide = ft.wide || 0;
  const tone = (i, ob) => {
    if (ob < 0) return i === 0 ? 'l' : i === lw - 1 ? 'md' : 'm';
    return i === 0 ? 'm' : i === lw - 1 ? 'd' : i >= lw / 2 ? 'md' : 'm';
  };
  const draw = (x0, f, ob) => {
    const sole = FE - f.lift + (ft.kneel ? 0 : (up ? -f.pos : f.pos) * ft.fy);
    const bootTop = sole - BH + 1, kneeY = Math.round((hipY + bootTop) / 2) - 1;
    for (let y = hipY; y < bootTop; y++) for (let i = 0; i < lw; i++) {
      let c = legR[tone(i, ob)];
      if (y === hipY && !up) c = dark(c, 0.78);                                 // shadow under the belt
      if (mailLegs && (i + y) % 2 === 0) c = stepD(legR, c);
      if (plateLegs && y === kneeY + 2) c = legR.dd;                            // greave seam under the knee
      p.set(x0 + i, y, c);
    }
    if (!up && kneeY > hipY && kneeY < bootTop - 1) {
      if (plateLegs) { p.set(x0 + 1, kneeY, legR.ll); p.set(x0 + 2, kneeY, legR.l); p.set(x0 + 1, kneeY + 1, legR.d); p.set(x0 + 2, kneeY + 1, legR.dd); }
      else if (armoured) { p.set(x0 + 1, kneeY, legR.l); p.set(x0 + 1, kneeY + 1, legR.md); }
      else p.set(x0 + (ob < 0 ? lw - 2 : 1), kneeY, legR.md);                   // a crease
    }
    // chunky boots: wider than the leg on the outside, a folded pale cuff, a bright toe cap and
    // a dark sole that flares out one more pixel
    for (let y = bootTop; y <= sole; y++) {
      const r = y - bootTop, last = y === sole;
      const xa = x0 - (ob < 0 ? 1 + (last ? 1 : 0) : 0), xb = x0 + lw - 1 + (ob > 0 ? 1 + (last ? 1 : 0) : 0);
      const n = xb - xa;
      for (let x = xa; x <= xb; x++) {
        const i = x - xa;
        let c = i === 0 ? bootR.l : i === n ? bootR.d : i === n - 1 ? bootR.md : bootR.m;
        if (r === 0) c = i === n ? bootR.m : i <= 1 ? bootR.ll : bootR.l;     // cuff
        else if (r === 1 && BH >= 5) c = i === n ? bootR.dd : bootR.d;        // shadow under the cuff
        if (last) c = i >= n - 1 ? bootR.dd : bootR.d;                        // sole
        p.set(x, y, c);
      }
      if (!up && y === sole - 1) { const tx = ob < 0 ? xa + 1 : xa + 1; p.set(tx, y, bootR.ll); p.set(tx + 1, y, bootR.l); }
    }
  };
  draw(tl - wide, up ? ft.b : ft.a, -1);
  draw(tr - lw + 1 + wide, up ? ft.a : ft.b, 1);
}

function rideLegs(p, F) {
  // seated: thigh forward, shin down the mount's flank
  const { L, side, tl, tr, tw, ty1, S } = F;
  const legR = ramp(L.legs?.color || L.pants, 0.66, 1.14), bootR = ramp(L.bootsGear?.color || L.boots, 0.62, 1.2);
  const hy = ty1 + 1;
  if (side) {
    const th = Math.max(3, Math.round(tw * 0.5)), kx = F.bx + S(5), fy = hy + S(8);
    p.line(F.bx - 1, hy, kx, hy, legR.m, th);
    p.line(F.bx - 1, hy - (th >> 1), kx, hy - (th >> 1), legR.l);
    p.line(kx, hy, kx, fy - S(4), legR.m, th - 1);
    for (let y = fy - S(4); y <= fy; y++) for (let x = kx - 2; x <= kx + 1 + (y >= fy - 1 ? S(3) : 0); x++) p.set(x, y, y === fy ? bootR.dd : y === fy - S(4) ? bootR.l : x === kx - 2 ? bootR.l : bootR.m);
    p.set(kx + S(3), fy - 1, bootR.ll);
  } else {
    const lw = Math.max(3, (tw - 2) >> 1);
    for (const x0 of [tl - 1, tr - lw + 2]) {
      p.rect(x0, hy, lw, S(4), legR.m); p.rect(x0, hy, 1, S(4), legR.l);
      p.rect(x0, hy + S(4), lw, S(3), bootR.m); p.rect(x0, hy + S(4), lw, 1, bootR.l); p.rect(x0, hy + S(7) - 1, lw, 1, bootR.dd);
    }
  }
}

// ------------------------------------------------------------------ torso by armour weight
function torso(p, e, F) {
  const { L, side, up, tw, tl, tr, ty0, ty1, cw, mL, mR, S } = F;
  const H = ty1 - ty0 + 1;
  if (L.skeleton) {
    const bone = C('#e8e0cc'), d = dark(bone, 0.72), l = light(bone, 1.1);
    for (let y = ty0; y <= ty1; y++) { p.set(mL, y, d); p.set(mR, y, dark(d, 0.85)); }
    for (let r = 0; ; r++) {
      const y = ty0 + 2 + r * 2;
      if (y > ty1 - 3) break;
      const ins = r > 2 ? 1 : 0;
      for (let x = tl + ins; x <= tr - ins; x++) if (x !== mL && x !== mR) p.set(x, y, x === tl + ins ? l : x === tr - ins ? d : bone);
    }
    p.rect(tl, ty0, tw, 1, d); p.rect(tl + 1, ty0, 3, 1, l);
    return;
  }
  const base = L.chest ? L.chest.color : L.shirt;
  const R = cw === 'plate' ? ramp(mixc(base, '#e8ecf0', 0.12), 0.56, 1.2) : cw === 'mail' ? ramp(mixc(base, '#c8ccd0', 0.12), 0.6, 1.16) : ramp(base, 0.66, 1.14);
  const T = ramp(C(L.chest?.trim || '#c8a050'), 0.7, 1.2);
  // body block with sloped shoulders: lit down the left, half shade then shade to the right,
  // the waist darker
  for (let y = ty0; y <= ty1; y++) for (let x = tl; x <= tr; x++) {
    if (y === ty0 && (x === tl || x === tr)) continue;
    const u = (x - tl) / Math.max(1, tw - 1), v = (y - ty0) / Math.max(1, H - 1);
    let c = u < 0.12 ? R.l : u < 0.6 ? R.m : u < 0.86 ? R.md : R.d;
    if (y === ty0 && !up) c = u > 0.8 ? R.m : R.l;
    if (y === ty1) c = u < 0.12 ? R.md : R.d;
    else if (v > 0.7 && c === R.m && u > 0.4) c = R.md;
    // material texture
    if (cw === 'mail') { if ((x + y) % 2 === 0) c = stepD(R, c); }
    else if (cw === 'leather') { if (hash2(x, y, 11) < 0.1) c = stepD(R, c); }
    else if (!side && (x - tl) % 4 === 3 && y > ty0 + 2 && y < ty1 - 2) c = stepD(R, c);   // cloth folds
    if (L.bark && (x * 3 + y) % 5 === 0) c = dark(c, 0.8);
    if (L.stone && hash2(x, y, 4) < 0.12) c = dark(c, 0.82);
    if (L.scales) { const k = (x + y * 2) % 4; if (k === 0) c = light(c, 1.1); else if (k === 2 && y % 2) c = dark(c, 0.9); }
    p.set(x, y, c);
  }
  if (up) {
    // back: plate spine ridge and shoulder blades, leather harness cross, robe hood fold
    if (cw === 'plate') {
      for (let y = ty0 + 1; y < ty1 - 1; y++) { p.set(mL, y, R.ll); p.set(mR, y, R.d); }
      for (let x = tl + 1; x < mL; x++) p.set(x, ty0 + Math.round(H * 0.45), R.d);
      for (let x = mR + 1; x < tr; x++) p.set(x, ty0 + Math.round(H * 0.45), R.dd);
      belt(p, F, ty1 - 2, T, true);
    } else if (cw === 'leather') {
      const sc = mixc(R.dd, '#2a1810', 0.4);
      p.line(tl, ty0 + 1, tr, ty1 - 3, sc, 2); p.line(tr, ty0 + 1, tl, ty1 - 3, sc, 2);
      belt(p, F, ty1 - 1, T);
    } else if (cw === 'cloth') {
      p.rect(tl + 1, ty0, tw - 2, S(3), R.d); p.rect(tl + 2, ty0, tw - 4, 1, R.dd); p.rect(tl + 1, ty0 + S(3), tw - 2, 1, R.md);
    } else belt(p, F, ty1 - 1, BROWN);
    if (cw === 'plate' || cw === 'mail') skirt(p, F, R, T);
    return;
  }
  // ---- front details
  const neck = skinOf(L), neckD = dark(neck, 0.78);
  if (cw === 'plate') {
    // gorget, a bright bevel down the centre ridge, a highlight on the upper left, a crease under
    // the chest, a lame below it, the belt and the faulds
    for (let x = tl + 1; x <= tr - 1; x++) { p.set(x, ty0, x < mL ? R.ll : R.l); p.set(x, ty0 + 1, x === tl + 1 ? T.l : x === tr - 1 ? T.d : T.m); }
    const chestY = ty0 + Math.max(4, Math.round(H * 0.52));
    if (!side) {
      for (let y = ty0 + 2; y < chestY; y++) { p.set(mL, y, R.ll); if (mR !== mL) p.set(mR, y, R.md); else p.set(mL + 1, y, R.md); }
      p.rect(tl + 1, ty0 + 2, 2, 2, R.ll); p.set(tl + 1, ty0 + 4, R.l); p.set(tl + 3, ty0 + 2, R.l);
      for (let x = tl; x <= tr; x++) p.set(x, chestY, x < mL ? R.d : R.dd);
      for (let x = tl; x <= tr; x++) if (chestY + 1 < ty1 - 2) p.set(x, chestY + 1, x <= tl + 1 ? R.ll : x < mL ? R.l : R.m);
    } else {
      for (let y = ty0 + 2; y < chestY; y++) { p.set(tr - 1, y, R.ll); p.set(tr - 2, y, R.l); }
      for (let x = tl; x <= tr; x++) p.set(x, chestY, R.dd);
    }
    belt(p, F, ty1 - 2, T, true);
    for (let x = tl; x <= tr; x++) p.set(x, ty1, (x & 1) ? R.dd : R.d);
  } else if (cw === 'mail') {
    // tabard over the hauberk: a trim-coloured panel with an emblem, mail at the sides
    const ins = Math.max(2, Math.round(tw * 0.3));
    const px0 = side ? tr - S(3) : tl + ins, px1 = side ? tr : tr - ins;
    for (let y = ty0 + 1; y <= ty1; y++) for (let x = px0; x <= px1; x++) p.set(x, y, x === px0 ? T.l : x === px1 ? T.d : y === ty0 + 1 ? T.l : x > (px0 + px1) / 2 ? T.md : T.m);
    if (!side && px1 - px0 >= 3) {
      const ey = ty0 + S(3);
      for (let y = ey - 1; y <= ey + S(3); y++) { p.set(mL, y, T.ll); if (mR !== mL) p.set(mR, y, T.l); }
      for (let x = px0 + 1; x <= px1 - 1; x++) p.set(x, ey, x === px1 - 1 ? T.l : T.ll);
    }
    for (let x = tl + 1; x <= tr - 1; x++) p.set(x, ty0, x < px0 || x > px1 ? R.l : T.l);
    belt(p, F, ty1 - 1, T);
  } else if (cw === 'leather') {
    // jerkin: a darker yoke with a stitched edge, a V neck, side seams, a bandolier with a buckle
    for (let x = tl + 1; x <= tr - 1; x++) { p.set(x, ty0, R.l); p.set(x, ty0 + 1, x < mL ? R.md : R.d); p.set(x, ty0 + 2, (x & 1) ? R.l : R.md); }
    if (!side) {
      p.set(mL, ty0, neck); p.set(mR, ty0, neck); p.set(mL, ty0 + 1, neckD); p.set(mR, ty0 + 1, dark(neck, 0.66));
      for (let y = ty0 + 4; y < ty1 - 2; y += 2) { p.set(tl + 1, y, R.l); p.set(tr - 1, y, R.md); }
      const sc = mixc(R.dd, '#2a1810', 0.4), sl = mixc(R.d, '#5a3a24', 0.4);
      p.line(tl + 1, ty0 + 1, tr - 1, ty1 - 3, sc, 2);
      p.line(tl + 1, ty0, tr - 1, ty1 - 4, sl);
      const bx = Math.round((tl + tr) / 2), by = Math.round((ty0 + ty1 - 3) / 2);
      p.set(bx, by, T.ll); p.set(bx + 1, by, T.l); p.set(bx, by + 1, T.m); p.set(bx + 1, by + 1, T.d);
    } else p.line(tr, ty0 + 1, tl, ty1 - 3, mixc(R.dd, '#2a1810', 0.4), 2);
    belt(p, F, ty1 - 1, T);
    if (!side) {
      // pouch on the hip
      const P = ramp('#6a4a2a'), x0 = tr - S(3), y0 = ty1 - 1;
      p.rect(x0, y0, S(3), S(3), P.m); p.rect(x0, y0, S(3), 1, P.l); p.set(x0 + S(3) - 1, y0 + 1, P.d); p.rect(x0, y0 + S(3) - 1, S(3), 1, P.d); p.set(x0 + 1, y0 + 1, '#d8b060');
    }
  } else if (cw === 'cloth') {
    // robe: open collar showing the neck, trimmed lapels meeting at the sternum, trim down the
    // front, a sash with a knot
    if (!side) {
      p.set(mL, ty0, neck); p.set(mR, ty0, neck); p.set(mL, ty0 + 1, neckD); p.set(mR, ty0 + 1, dark(neck, 0.66));
      for (let k = 0; k < S(3); k++) { p.set(mL - S(2) + k, ty0 + k, T.l); p.set(mR + S(2) - k, ty0 + k, T.m); }
      for (let y = ty0 + S(3); y <= ty1; y++) { p.set(mL, y, T.l); if (mR !== mL) p.set(mR, y, T.d); }
      for (let x = tl; x <= tr; x++) { p.set(x, ty1 - 1, x === tl ? T.l : x === tr ? T.d : T.m); p.set(x, ty1, x === tr ? T.dd : T.d); }
      p.set(tl + 2, ty1 + 1, T.m); p.set(tl + 2, ty1 + 2, T.d); p.set(tl + 3, ty1 + 1, T.d);
    } else {
      for (let y = ty0; y <= ty1; y++) p.set(tr, y, T.m);
      for (let x = tl; x <= tr; x++) { p.set(x, ty1 - 1, T.m); p.set(x, ty1, T.d); }
    }
  } else {
    // plain tunic: collar, laces, belt
    if (!side) {
      p.set(mL, ty0, neck); p.set(mR, ty0, neck); p.set(mL, ty0 + 1, neckD); p.set(mR, ty0 + 1, dark(neck, 0.66));
      p.set(mL, ty0 + 2, R.dd); p.set(mR, ty0 + 3, R.dd); p.set(mL, ty0 + 4, R.dd);
      p.set(mL - 1, ty0 + 1, R.l); p.set(mR + 1, ty0 + 1, R.md);
    }
    belt(p, F, ty1 - 1, BROWN);
  }
  if (cw === 'plate' || cw === 'mail') skirt(p, F, R, T);
  // runes / embers / void marks / constructs' core on bare chests
  if (L.glowSkin && !L.chest) for (const [dx, dy] of [[1, 1], [1, 2], [0, 3], [0, 4], [-1, 3], [1, 5], [2, 6], [-1, 6], [-2, 7]]) { const x = mL + dx, y = ty0 + dy; if (y < ty1 - 1) { e.set(x, y, L.glowSkin); p.set(x, y, mixc(L.glowSkin, '#ffffff', 0.25)); } }
  if (L.voidMarks && !L.chest) for (let x = tl + 1; x <= tr - 1; x++) { if ((x & 1) === 0) e.set(x, ty0 + 3, L.voidMarks); if ((x & 3) === 1) e.set(x, ty0 + 5, L.voidMarks); }
  if (L.stone && !L.chest) { p.line(mL, ty0, mR + 1, ty1 - 3, dark(R.m, 0.6)); p.line(mR + 1, ty0 + 4, tr - 1, ty0 + 6, dark(R.m, 0.6)); }
  if (L.core) {
    const cy = ty0 + S(4), cc = C(L.core), r = S(2);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.abs(dx) + Math.abs(dy) <= r) { const c = Math.abs(dx) + Math.abs(dy) < r ? light(cc, 1.25) : cc; p.set(mL + dx, cy + dy, c); e.set(mL + dx, cy + dy, c); }
    e.set(mL, cy, '#ffffff'); p.set(mL, cy, '#ffffff');
  }
  if (L.knots) for (const [dx, dy] of [[-3, 2], [3, 5], [0, 7]]) { p.set(mL + dx, ty0 + dy, L.knots); e.set(mL + dx, ty0 + dy, L.knots); p.set(mL + dx + 1, ty0 + dy, dark(L.knots, 0.7)); }
}
const BROWN = { m: C('#4a2e1c'), l: C('#6a4630'), d: C('#2e1c12'), dd: C('#20140c') };

// a two-row belt with a chunky gold buckle that hangs a pixel below the strap
function belt(p, F, y, T, plate) {
  const { tl, tr, tw, side, up } = F;
  const strap = plate ? T : T === BROWN ? BROWN : { m: C('#3e2618'), l: C('#5a3a24'), d: C('#24160e'), dd: C('#180e08') };
  for (let x = tl; x <= tr; x++) { p.set(x, y, x === tl ? strap.l : x === tr ? strap.d : strap.m); p.set(x, y + 1, x === tr ? strap.dd : strap.d); }
  if (up) return;
  const G = [C('#fff0a8'), C('#f0d070'), C('#c09838'), C('#7a5a20')];
  if (side) { const bx = tr - 2; p.set(bx, y, G[0]); p.set(bx + 1, y, G[2]); p.set(bx, y + 1, G[1]); p.set(bx + 1, y + 1, G[3]); p.set(bx, y + 2, G[2]); return; }
  const bw = tw % 2 ? 3 : 4, bx = tl + ((tw - bw) >> 1);
  for (let j = 0; j < 3; j++) for (let i = 0; i < bw; i++) {
    const edge = i === 0 || i === bw - 1 || j === 0 || j === 2;
    let c = !edge ? strap.dd : j === 0 ? (i === bw - 1 ? G[2] : G[0]) : j === 2 ? (i === 0 ? G[2] : G[3]) : i === 0 ? G[1] : G[3];
    p.set(bx + i, y + j, c);
  }
}

// a cloth skirt under the belt for mail and plate, with a stitched rune band
function skirt(p, F, R, T) {
  const { L, side, up, tl, tr, ty1, cw, mL, mR, S } = F;
  const Sk = ramp(L.chest.trim ? mixc(L.chest.trim, '#3a2a4a', 0.55) : '#4a3a5a', 0.66, 1.18), Rn = C(L.chest.trim || '#40c0c0');
  const rows = S(5);
  for (let j = 1; j <= rows; j++) {
    const y = ty1 + j, fl = j >= 3 ? 1 : 0;
    const x0 = tl - (side ? 0 : fl), x1 = tr + fl;
    for (let x = x0; x <= x1; x++) {
      const u = (x - x0) / Math.max(1, x1 - x0);
      let c = u < 0.12 ? Sk.l : u < 0.55 ? Sk.m : u < 0.85 ? Sk.md : Sk.d;
      if (j === rows) c = (x & 1) ? Sk.dd : Sk.d;
      else if (j === 1) c = Sk.dd;
      if (!up && (j === 3 || j === 4)) {
        const k = (x - tl + 40) % 5;
        if ((j === 3 && (k === 1 || k === 3)) || (j === 4 && (k === 2 || k === 3))) c = Rn;
      }
      p.set(x, y, c);
    }
  }
  // the mail tabard hangs over the skirt, cut to a point
  if (cw === 'mail' && !up && !side) {
    const ins = Math.max(2, Math.round(F.tw * 0.3)), px0 = tl + ins, px1 = tr - ins;
    for (let j = 1; j <= rows - 1; j++) for (let x = px0 + Math.max(0, j - rows + 3); x <= px1 - Math.max(0, j - rows + 3); x++) p.set(x, ty1 + j, x === px0 ? T.l : x === px1 ? T.d : j === rows - 1 ? T.md : T.m);
  }
  void R; void mL; void mR;
}

function apron(p, F) {
  const { L, tl, tr, ty0, ty1, mL, mR, FE, m, S } = F;
  const R = ramp(L.apron, 0.7, 1.12);
  const top = ty0 + S(3), bottom = Math.min(FE - m.bootH - 1, ty1 + S(6));
  for (let y = top; y <= bottom; y++) for (let x = tl + 1; x <= tr - 1; x++) p.set(x, y, y === top ? R.l : x === tr - 1 ? R.d : y === bottom ? R.d : x === tl + 1 ? R.l : R.m);
  // straps to the neck, a pocket
  p.line(tl + 2, top - 1, mL - 1, ty0, R.d); p.line(tr - 2, top - 1, mR + 1, ty0, R.d);
  p.rect(mL - 1, ty1 - 1, mR - mL + 3, S(2), R.d); p.rect(mL - 1, ty1 - 1, mR - mL + 3, 1, R.md);
}

function robeSkirt(p, F) {
  const { L, side, up, tl, tr, ty1, pose, FE, mL, mR, S } = F;
  const R = ramp(L.chest.color, 0.66, 1.15), T = ramp(L.chest.trim || L.chest.color, 0.7, 1.2);
  const bottom = FE - 1;
  const sw = pose.legs === 'run' || pose.legs === 'sprint' ? [1, 0, -1, -1, 0, 1][(pose.ph | 0) % 6] * S(1) : 0;
  for (let y = ty1; y <= bottom; y++) {
    const t = (y - ty1) / Math.max(1, bottom - ty1);
    const grow = Math.floor(t * S(4));
    const s = y > ty1 + 3 ? sw : 0;
    const x0 = tl - grow + (side ? s : 0), x1 = tr + grow + (side ? s : 0);
    for (let x = x0; x <= x1; x++) {
      const u = (x - x0) / Math.max(1, x1 - x0);
      let c = u < 0.5 ? R.m : R.md;
      if (!side && (x - x0) % 4 === 3) c = stepD(R, c);                      // folds
      if (x === x0) c = R.l; else if (x === x1) c = R.dd; else if (x === x1 - 1) c = R.d;
      if (y >= bottom - 1) c = y === bottom ? (x >= x1 - 1 ? T.dd : T.d) : x === x0 ? T.l : T.m;   // hem
      else if (!up && !side && y > ty1 && (x === mL || x === mR)) c = x === mL ? T.l : T.m;      // front trim
      p.set(x, y, c);
    }
  }
  // the stepping foot peeks out under the hem
  if (!side && sw) { const bR = ramp(L.bootsGear?.color || L.boots); const x0 = sw > 0 ? tl : tr - S(3) + 1; p.rect(x0, bottom + 1, S(3), 1, bR.d); p.set(x0, bottom + 1, bR.l); }
}

function pauldrons(p, F) {
  const { L, side, up, tl, tr, ty0, cw, S } = F;
  const M = cw === 'plate' ? mixc(L.chest.color, '#e8ecf0', 0.1) : cw === 'mail' ? mixc(L.chest.color, '#c8ccd0', 0.08) : dark(L.chest.color, 0.92);
  const R = ramp(M, 0.6, 1.18), T = ramp(L.chest.trim || '#c8a050', 0.7, 1.2);
  const plate = cw === 'plate', mail = cw === 'mail';
  const hw = S(plate ? 4 : 3), top = -S(plate ? 2 : 1), bot = S(plate ? 3 : 2);
  // a rounded dome: lit from the top left, the trim band near the rim, a dark lip under it
  const pad = (cx) => {
    for (let y = top; y <= bot; y++) {
      const w = y === top ? hw - 2 : y === top + 1 ? hw - 1 : y === bot ? hw - 1 : hw;
      for (let x = -w; x < w; x++) {
        const u = (x + w) / Math.max(1, 2 * w - 1);
        let c = u < 0.3 ? R.l : u < 0.7 ? R.m : R.d;
        if (y === top || (y === top + 1 && u < 0.5)) c = u < 0.6 ? R.ll : R.l;
        if (mail && y > top && (x + y) % 2 === 0) c = stepD(R, c);
        if (y === bot - 1 && plate) c = u < 0.25 ? T.l : u > 0.8 ? T.d : T.m;
        if (y === bot) c = u < 0.3 ? R.d : R.dd;
        if (!plate && !mail && y === bot - 1 && (x & 1)) c = T.m;              // stitched edge
        p.set(cx + x, ty0 + y, c);
      }
    }
    if (plate) p.set(cx - S(2), ty0 + top + 2, light(R.ll, 1.15));            // a glint
  };
  if (side) pad(F.bx);
  else { pad(tl); pad(tr + 1); }
  void up;
}

// rocky shoulder boulders (golems) and crystal spikes (glass / ice)
function boulders(p, e, F) {
  const { L, side, tl, tr, ty0, S } = F;
  const M = C(L.skin), r = S(5);
  const lump = (cx) => {
    for (let y = -r; y <= r - 1; y++) for (let x = -r; x <= r; x++) {
      if (x * x * 0.8 + y * y > r * r + 1) continue;
      let c = M;
      if (y < -r * 0.3 || x < -r * 0.3) c = light(M, 1.2); else if (y > r * 0.2 || x > r * 0.4) c = dark(M, 0.7);
      if (hash2(cx + x, y, 21) < 0.15) c = dark(M, 0.58);
      p.set(cx + x, ty0 + y, c);
    }
    p.set(cx - S(3), ty0 - S(3), light(M, 1.4)); p.set(cx - S(2), ty0 - S(3), light(M, 1.3));
    if (L.crystals) for (let k = 0; k < 3; k++) {
      const x = cx - S(2) + k * S(2), h = S(k === 1 ? 6 : 4);
      for (let j = 0; j < h; j++) { const y = ty0 - r + 1 - j; p.set(x, y, j > h - 2 ? light(L.crystals, 1.4) : L.crystals); p.set(x + 1, y, dark(L.crystals, 0.75)); }
      e.set(x, ty0 - r + 2 - h, L.crystals);
    }
  };
  if (side) lump(F.bx);
  else { lump(tl - 1); lump(tr + 1); }
}

// ------------------------------------------------------------------ back layer
function cape(p, F) {
  const { L, side, up, tl, tr, ty0, pose, FE, S } = F;
  const R = ramp(L.cape, 0.62, 1.16);
  const TR = C(L.capeTrim || mixc(light(L.cape, 1.7), '#f0e0b0', 0.5)), TRd = mixc(TR, R.d, 0.45);
  const lining = dark(mixc(L.cape, '#201018', 0.35), 0.8);
  const ph = (pose.cape | 0) % 4, sway = pose.sway | 0;
  const wave = [0, 1, 0, -1][ph];
  const bottom = FE - S(L.cloak ? 3 : 4) - (sway > 1 ? S(3) : sway * S(1));
  if (up) {
    // full cape over the back: soft folds that open toward the hem, trim at the hem
    for (let y = ty0; y <= bottom; y++) {
      const t = (y - ty0) / Math.max(1, bottom - ty0);
      const g = Math.floor(t * S(L.cloak ? 6 : 4));
      const sh = Math.round(wave * t * t * S(2));
      const x0 = tl - 1 - g + sh, x1 = tr + 1 + g + sh;
      const W = Math.max(1, x1 - x0);
      for (let x = x0; x <= x1; x++) {
        const fp = (x - x0) / W;
        const fold = Math.sin(fp * Math.PI * (2.2 + t * 2) + 0.4 + wave * 0.5 * t);
        const lit = fold * 0.45 - fp * 0.7 + 0.32;
        let c = lit > 0.42 ? R.l : lit > 0.08 ? R.m : lit > -0.22 ? R.md : R.d;
        if (x === x1) c = R.dd;
        if (x === x0) c = L.cloak ? TR : R.l;
        if (y === ty0) c = R.l;
        if (y >= bottom - (L.cloak ? 1 : 0)) c = L.cloak ? (y === bottom ? TRd : TR) : (x + y) & 1 ? R.d : R.dd;
        p.set(x, y, c);
      }
    }
    p.rect(tl, ty0, tr - tl + 1, 1, R.d);                  // clasp line at the shoulders
    return;
  }
  if (side) {
    // trails behind the back; billows further back and higher with speed
    const back = F.bx - (F.tw >> 1);
    for (let y = ty0; y <= bottom; y++) {
      const t = (y - ty0) / Math.max(1, bottom - ty0);
      const flare = Math.round(t * (S(2) + sway * S(2.5)) + (t > 0.4 ? wave * t * S(1.5) : 0));
      const x0 = back - 1 - flare, x1 = back + 2;
      for (let x = x0; x <= x1; x++) {
        let c = x === x0 ? (L.cloak ? TR : R.d) : x === x0 + 1 ? R.l : x === x0 + 2 ? R.m : x === x0 + 3 ? R.md : lining;
        if (y === bottom) c = L.cloak && x <= x0 + 2 ? TRd : R.dd;
        p.set(x, y, c);
      }
    }
    return;
  }
  // front view: the cape hangs behind, its edges flare past the body
  for (let y = ty0 + 1; y <= bottom; y++) {
    const t = (y - ty0) / Math.max(1, bottom - ty0);
    const g = Math.floor(t * (S(L.cloak ? 5 : 3) + sway * S(1))) + (t > 0.5 && wave > 0 ? 1 : 0);
    const xa = tl - 1 - g, xb = tr + 1 + g + (t > 0.5 && wave < 0 ? 1 : 0);
    for (let x = xa; x <= xb; x++) {
      let c;
      if (x < tl) c = x === xa ? (L.cloak ? TR : R.l) : x === xa + 1 ? R.m : x === xa + 2 ? R.md : R.d;
      else if (x > tr) c = x === xb ? R.dd : x === xb - 1 ? R.d : lining;
      else c = lining;
      if (y === bottom) c = L.cloak && x < tl ? TRd : R.dd;
      p.set(x, y, c);
    }
  }
}

// a cloak thrown over one shoulder: it covers the off side of the body down to the boots, its pale
// lining edge cutting diagonally across the chest from the neck to past the right hip
function drape(p, F) {
  const { L, side, tl, tr, ty0, ty1, tw, pose, FE, m, S } = F;
  const R = ramp(L.cape, 0.62, 1.16);
  const TR = C(L.capeTrim || mixc(light(L.cape, 1.7), '#f0e0b0', 0.5));
  const sw = pose.legs === 'run' || pose.legs === 'sprint' ? [0, 1, 1, 0, -1, -1][(pose.ph | 0) % 6] * S(1) : 0;
  const bottom = FE - m.bootH - S(1);
  if (side) {
    // seen from the side the cloak wraps the shoulder and hangs over the back half
    for (let y = ty0 - S(2); y <= bottom; y++) {
      const t = (y - ty0) / Math.max(1, bottom - ty0);
      const x1 = F.bx + Math.round(S(2) - t * S(3)), x0 = F.bx - (tw >> 1) - 1 - Math.round(t * S(3)) + (y > ty1 ? sw : 0);
      for (let x = x0; x <= x1; x++) {
        let c = x === x1 ? TR : x === x1 - 1 ? R.l : (x - x0) % 4 === 1 ? R.md : x === x0 ? R.d : R.m;
        if (y === bottom) c = x === x1 ? TR : R.dd;
        p.set(x, y, c);
      }
    }
    return;
  }
  const top = ty0 - S(2);
  const xr = (t) => tr + 1 + Math.round(t * S(6));                 // right edge, flaring out
  const ex0 = F.mL - S(2), ex1 = xr(1) - S(3);
  for (let y = top; y <= bottom; y++) {
    const t = (y - top) / Math.max(1, bottom - top);
    const edge = Math.round(ex0 + (ex1 - ex0) * t);
    const x1 = xr(t) + (y > ty1 ? sw : 0);
    for (let x = edge; x <= x1; x++) {
      const d = x - edge;
      let c = d === 0 ? TR : d === 1 ? R.l : R.m;
      // long folds running down beside the trim, the far side in shade
      if (d >= 2) { const f = (d + Math.floor(t * 3)) % 5; if (f === 4) c = R.md; else if (f === 0 && d > 3) c = R.l; }
      if (x === x1) c = R.dd; else if (x === x1 - 1 && d > 2) c = R.d;
      if (y === bottom && d > 0) c = (x & 1) ? R.d : R.dd;
      p.set(x, y, c);
    }
  }
  // a toggle where the cloak pins at the collarbone
  p.set(ex0 + 1, top + S(3), '#e8d090'); p.set(ex0 + 2, top + S(3), '#a07830');
}

function backHair(p, F, hx, hy) {
  const { L, m, side, ty0, S } = F;
  if (!L.hair || L.skeleton || L.hairStyle === 'bald') return;
  const helm = L.helm;
  if (helm && (helm.kind === 'great' || helm.kind === 'hood' || helm.kind === 'coif')) return;
  const H = hairRamp(L.hair);
  const w = m.headW, x0 = m.cx - (w >> 1) + hx, y0 = m.headTop + hy, x1 = x0 + w - 1;
  const ph = (F.pose.cape | 0) % 4, wave = [0, 1, 0, -1][ph], sway = F.pose.sway | 0;
  const st = L.hairStyle;
  if (st === 'long' && !side) {
    // falls behind the shoulders in locks
    const bottom = ty0 + S(6);
    for (let y = y0 + S(6); y <= bottom; y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
      const k = (x - x0 + 1) % 4;
      let c = k === 3 ? H.d : x === x0 - 1 ? H.l : x >= x1 ? H.d : H.m;
      if (y >= bottom - 1 && k === 3) continue;
      if (y === bottom) c = H.d;
      p.set(x, y, c);
    }
  } else if ((st === 'ponytail' || st === 'braid') && side) {
    // tied at the back of the crown, hangs down and swings back with speed
    const pts = [[x0, y0 + S(3)], [x0 - S(2), y0 + S(5)], [x0 - S(3) - sway, y0 + S(8)], [x0 - S(3) - sway * S(2) - (wave > 0 ? 1 : 0), y0 + S(11) - sway], [x0 - S(3) - sway * S(3) - (wave > 0 ? 1 : 0), y0 + S(14) - sway * S(2)]];
    for (let i = 0; i < pts.length - 1; i++) p.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], st === 'braid' && i % 2 ? H.d : i === 0 ? H.l : H.m, 3);
    for (let i = 1; i < pts.length - 1; i++) p.set(pts[i][0] + 1, pts[i][1], H.d);
    p.rect(pts[0][0] - 1, pts[0][1] - 1, 2, 2, '#c8a050');
    const tip = pts[pts.length - 1];
    p.set(tip[0], tip[1] + 2, H.d); p.set(tip[0] - 1, tip[1] + 2, H.dd);
  } else if (st === 'long' && side) {
    for (let y = y0 + S(3); y <= ty0 + S(6); y++) for (let x = x0 - 1 - (y > ty0 && sway ? 1 : 0); x <= x0 + S(5); x++) p.set(x, y, (y + x) % 4 === 0 ? H.d : x === x0 + S(5) ? H.d : H.m);
  }
}

function tail(p, F) {
  const { L, side, up, tr, ty1, pose, m, S } = F;
  const H = hairRamp(L.hair || '#8a6040');
  const ph = (pose.cape | 0) % 4, wave = [0, 1, 0, -1][ph];
  const cx = m.cx;
  const pts = side ? [[F.bx - S(3), ty1], [F.bx - S(8), ty1 + S(2)], [F.bx - S(11), ty1 - 1 + wave], [F.bx - S(13), ty1 - S(6) + wave]]
    : up ? [[cx, ty1], [cx + S(2), ty1 + S(5)], [cx + S(5) + wave, ty1 + S(5)], [cx + S(7) + wave, ty1]]
      : [[tr, ty1], [tr + S(5), ty1 + S(2)], [tr + S(8), ty1 - 1 + wave], [tr + S(10), ty1 - S(6) + wave]];
  for (let i = 0; i < pts.length - 1; i++) p.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], i === 2 ? H.m : H.d, 3);
  for (let i = 0; i < pts.length - 1; i++) p.line(pts[i][0], pts[i][1] - 1, pts[i + 1][0], pts[i + 1][1] - 1, i === 0 ? H.d : H.l);
  const t = pts[3];
  p.rect(t[0] - 1, t[1] - 2, 3, 3, H.l); p.set(t[0], t[1] - 3, H.s); p.set(t[0] + 1, t[1], H.m);
}

function quiver(p, F, behind) {
  const { side, up, tr, ty0, S } = F;
  const wood = ramp('#6a4428', 0.62, 1.2);
  const fx = side ? F.bx - (F.tw >> 1) - 2 : up ? tr - S(4) : tr - 2;
  const top = ty0 - S(3);
  const fletch = (x, y) => { p.set(x, y, '#e8e0d0'); p.set(x + 1, y - 1, '#c83a2a'); p.set(x + 1, y, '#e8e0d0'); p.set(x - 1, y - 1, '#a02a1a'); };
  if (behind && !side && !up) {
    // only the fletchings peek over the shoulder
    fletch(fx + 1, top); fletch(fx + 3, top - 1);
    return;
  }
  const n = S(11);
  for (let k = 0; k < n; k++) {
    const x = fx + Math.round(k * (up ? -0.35 : 0.25)), y = top + k;
    p.set(x, y, k === 0 ? wood.ll : wood.l); p.set(x + 1, y, k === 0 ? wood.l : k === n - 1 ? wood.d : wood.m); p.set(x + 2, y, k === 0 ? wood.m : wood.d);
    if (k === 2 || k === n - 3) { p.set(x, y, '#c8a050'); p.set(x + 1, y, '#a07830'); p.set(x + 2, y, '#7a5a20'); }
  }
  fletch(fx, top - 1); fletch(fx + 2, top - 2);
}

function scarf(p, F, hx, hy) {
  const { L, side, up, m, pose, S } = F;
  const R = ramp(L.scarf, 0.64, 1.2);
  const y = m.torsoTop + F.bob;
  const w = m.headW, x0 = m.cx - (w >> 1) + hx, x1 = x0 + w - 1;
  const ph = (pose.cape | 0) % 4, wave = [0, 1, 0, -1][ph], sway = pose.sway | 0;
  for (let x = x0 + 1; x <= x1 - 1; x++) {
    p.set(x, y - 1, x === x0 + 1 ? R.l : x === x1 - 1 ? R.d : R.m);
    p.set(x, y, x === x0 + 1 ? R.l : x === x1 - 1 ? R.d : (x & 1) ? R.md : R.m);
    p.set(x, y + 1, (x & 1) ? R.d : R.md);
  }
  // trailing ends
  if (side) {
    const bx = x0 + 1;
    for (let k = 1; k <= S(5) + sway * S(2); k++) p.rect(bx - k, y + Math.round(k * (sway > 0 ? 0.3 : 0.8)) + (k > S(3) ? wave : 0), 1, 3, k % 3 === 0 ? R.d : k % 3 === 1 ? R.m : R.l);
  } else if (up) { p.rect(m.cx + 1, y + 2, 3, S(5) - (sway ? 1 : 0), R.md); p.rect(m.cx + 1, y + 2, 1, S(5) - (sway ? 1 : 0), R.m); p.set(m.cx + 2 + wave, y + S(5) + 2, R.dd); }
  else { p.rect(x1 - S(4), y + 2, 3, S(4), R.m); p.rect(x1 - S(4) + 2, y + 2, 1, S(4), R.d); p.set(x1 - S(4), y + S(4) + 2, R.d); p.set(x1 - S(4) + 2, y + S(4) + 2, R.dd); }
  void hy;
}

function wings(p, e, F) {
  const { L, side, m, bob, pose, S } = F;
  const c = alpha(L.wingColor, 140), cl = alpha(light(L.wingColor, 1.1), 150), edge = alpha(light(L.wingColor, 1.25), 230), vein = alpha(dark(L.wingColor, 0.8), 190);
  const y = m.torsoTop + bob, cx = m.cx;
  const flap = (pose.wing | 0) % 2;
  const lobe = (dir) => {
    // upper wing: a broad sail from the shoulder blade, veins fanning out
    const n = S(11) - flap * S(2);
    for (let k = 0; k < n; k++) {
      const ja = -S(7) + Math.floor(k / 2.2) + flap * S(2), jb = S(3) - Math.floor(k / 2.6);
      for (let j = ja; j <= jb; j++) {
        const x = cx + dir * (S(4) + k), yy = y + j - 1 + Math.floor(k / 3);
        const isEdge = j === ja || k === n - 1 || j === jb;
        p.set(x, yy, isEdge ? edge : (k === S(4) || k === S(8)) && j > ja + 1 ? vein : j < ja + 3 ? cl : c);
      }
    }
    // lower wing
    for (let k = 0; k < S(6); k++) for (let j = 0; j < S(5) - Math.floor(k / 2); j++) p.set(cx + dir * (S(4) + k), y + S(4) + j + Math.floor(k / 2), j === S(5) - Math.floor(k / 2) - 1 || k === S(6) - 1 ? edge : c);
    e.set(cx + dir * (S(4) + n - 1), y - S(6) + flap * S(2) + Math.floor((n - 1) / 3), light(L.wingColor, 1.4));
  };
  if (side) lobe(-1);
  else { lobe(-1); lobe(1); }
}

// ------------------------------------------------------------------ head
function hairRamp(h) { const c = C(h); return { dd: dark(c, 0.48), d: dark(c, 0.68), m: c, l: light(c, 1.22), s: light(c, 1.5) }; }

function head(p, e, F, dx, dy) {
  const { L, m, side, up, pose, S } = F;
  const w = m.headW, h = m.headH;
  const x0 = m.cx - (w >> 1) + dx, y0 = m.headTop + dy, x1 = x0 + w - 1, y1 = y0 + h - 1;
  const helm = L.helm;
  const hairR = L.hair ? hairRamp(L.hair) : null;
  const SK = skinRamp(skinOf(L));
  const eyeY = y0 + Math.round(h * 0.47);
  const face = pose.face | 0;
  const cL = x0 + (w >> 1) - 1, cR = x0 + (w >> 1);
  // ---- long ears behind the skull (front / back views)
  if (L.ears === 'long' && helm?.kind !== 'great' && !side) {
    for (const dir of [-1, 1]) {
      const ex = dir < 0 ? x0 : x1, n = S(6);
      for (let k = 1; k <= n; k++) {
        const yy = eyeY + 1 - Math.round(k * 0.75);
        p.set(ex + dir * k, yy, SK.l); if (k < n) p.set(ex + dir * k, yy + 1, k < 3 ? SK.md : SK.m); if (k < n - 2) p.set(ex + dir * k, yy + 2, SK.d);
      }
    }
  }
  // ---- skull: a rounded box, the jaw a little narrower (the chin juts forward in profile)
  const pw = (j) => {
    const v = Math.abs((2 * (j + 0.5)) / h - 1), top = j < h / 2;
    const pp = top ? 3 : 2.8;
    return Math.round((w / 2) * (1 - Math.pow(Math.max(0, 1 - Math.pow(v, pp)), 1 / pp)));
  };
  for (let j = 0; j < h; j++) {
    const ins = pw(j), bottom = j > h / 2;
    const iL = side && !L.skeleton && bottom && j >= h - 3 ? ins + 1 : ins;
    const iR = side && !L.skeleton && bottom ? Math.max(0, ins - 1) : ins;
    for (let x = x0 + iL; x <= x1 - iR; x++) {
      const y = y0 + j, uu = (x - x0) / (w - 1);
      let c = SK.m;
      if (x === x0 + iL && j > 1) c = SK.l;
      if (uu > 0.8 || j >= h - 2) c = SK.md;
      if (x === x1 - iR || j === h - 1) c = SK.d;
      if (j === h - 1 && x >= x1 - iR - 1) c = SK.dd;
      if (L.skeleton) c = x === x1 - iR || j === h - 1 ? C('#b8b09c') : x === x0 + iL ? C('#f4eedc') : uu > 0.75 ? C('#d4ccb8') : C('#e8e0cc');
      if (L.stone && hash2(x, y, 9) < 0.1) c = dark(c, 0.85);
      if (L.bark && (x + y * 2) % 4 === 0) c = dark(c, 0.8);
      if (L.scales && (x + y) % 3 === 0 && j > h / 2) c = light(c, 1.08);
      p.set(x, y, c);
    }
  }
  // ---- face
  const glowEyes = L.eyes || (L.skeleton ? '#80c0ff' : null);
  if (!up) {
    if (L.skeleton) {
      const sock = side ? [x1 - 3] : [x0 + 2, x1 - 4];
      for (const sx of sock) { p.rect(sx, eyeY - 1, 3, 3, '#1e161a'); p.set(sx, eyeY - 1, '#3a3034'); e.set(sx + 1, eyeY, glowEyes); p.set(sx + 1, eyeY, glowEyes); }
      p.set(side ? x1 - 1 : cL, eyeY + 2, '#3a3034'); if (!side) p.set(cR, eyeY + 2, '#3a3034');
      for (let x = (side ? x1 - 5 : x0 + 2); x <= (side ? x1 : x1 - 2); x += 2) { p.set(x, y1 - 1, '#6a6050'); p.set(x, y1 - 2, '#8a8070'); }
    } else if (side) {
      const ex = x1 - 3;
      eyeAt(p, e, ex, eyeY, L, glowEyes, face, true, 1);
      p.set(x1 + 1, eyeY + 1, SK.m); p.set(x1 + 1, eyeY + 2, SK.d); p.set(x1, eyeY + 2, SK.md);   // nose
      if (!L.beard) { p.set(x1, eyeY + 4, face === 3 ? '#3a1418' : SK.dd); p.set(x1 - 1, eyeY + 4, face === 3 ? '#3a1418' : SK.d); if (face === 3) p.set(x1, eyeY + 5, '#3a1418'); }
      // ear
      const ax = x0 + Math.round(w * 0.38);
      p.set(ax, eyeY, SK.m); p.set(ax, eyeY + 1, SK.d); p.set(ax + 1, eyeY + 1, SK.md); p.set(ax, eyeY + 2, SK.dd); p.set(ax - 1, eyeY + 1, SK.l);
      if (L.ears === 'long' && helm?.kind !== 'great') for (let k = 0; k < S(6); k++) { const xx = ax - k, yy = eyeY - Math.round(k * 0.7); p.set(xx, yy, SK.l); p.set(xx, yy + 1, k < S(6) - 1 ? SK.d : SK.md); }
    } else {
      const exL = x0 + 3, exR = x1 - 3;
      eyeAt(p, e, exL, eyeY, L, glowEyes, face, false, -1);
      eyeAt(p, e, exR, eyeY, L, glowEyes, face, false, 1);
      if (!L.beard && !L.tusks) {
        p.set(cR, eyeY + 2, SK.d); p.set(cL, eyeY + 2, SK.md);                    // nose
        if (face === 3) { p.rect(cL, eyeY + 4, 2, 2, '#3a1418'); p.set(cL, eyeY + 4, '#5a2028'); }
        else { p.set(cL, eyeY + 4, SK.dd); p.set(cR, eyeY + 4, mixc(SK.dd, SK.m, 0.45)); p.set(cL - 1, eyeY + 4, mixc(SK.dd, SK.m, 0.6)); }
      }
      // cheek blush on lighter skins
      if (!L.stone && !L.bark && skinOf(L)[0] > 150) { p.set(x0 + 2, eyeY + 2, mixc(SK.m, '#e06858', 0.35)); p.set(x1 - 2, eyeY + 2, mixc(SK.md, '#e06858', 0.3)); }
      // small ears at the sides of the head
      if (!L.ears && !L.beastEars && !L.fins) { p.set(x0 - 1, eyeY + 1, SK.m); p.set(x0 - 1, eyeY + 2, SK.d); p.set(x1 + 1, eyeY + 1, SK.d); p.set(x1 + 1, eyeY + 2, SK.dd); }
    }
    if (L.tusks) {
      const tx = side ? [x1 - 1] : [x0 + 3, x1 - 3];
      for (const xx of tx) { p.set(xx, y1 - 1, '#f4ecd4'); p.set(xx, y1 - 2, '#fffaf0'); p.set(xx, y1, '#d8ccb0'); if (!side) p.set(xx + (xx < cL ? -1 : 1), y1, '#b8ac90'); }
    }
    if (L.glowSkin) { const gx = x1 - 4; for (const [ddx, ddy] of [[0, 2], [1, 3], [1, 4], [0, 5], [-1, 7], [-2, 8]]) e.set(gx + ddx, y0 + ddy, L.glowSkin); }
    if (L.voidMarks) { const vx = side ? x1 - 2 : x0 + 2; for (let y = y0 + 2; y <= y1 - 1; y++) if (y < eyeY - 1 || y > eyeY + 1) e.set(vx, y, L.voidMarks); if (!side) for (let y = eyeY + 3; y <= y1 - 1; y += 2) e.set(x1 - 2, y, L.voidMarks); }
    if (L.stone) { p.line(x0 + 4, y0 + 1, x0 + 6, y1 - 3, dark(SK.m, 0.6)); p.set(x0 + 7, y0 + 5, dark(SK.m, 0.6)); }
  }
  // ---- beard (over the collar)
  if (L.beard && !L.skeleton && !(helm && helm.kind === 'great')) beard(p, F, x0, y0, x1, y1, eyeY, hairR || hairRamp('#6a3a1a'));
  // ---- hair
  if (hairR && !L.skeleton && !(helm && (helm.kind === 'great' || helm.kind === 'hood' || helm.kind === 'coif'))) hair(p, F, x0, y0, x1, y1, eyeY, hairR, helm);
  // ---- beast ears on top
  if (L.beastEars && !(helm && helm.kind === 'great')) {
    const ec = hairR || hairRamp('#8a6040'), n = S(5);
    for (const ex of side ? [x0 + S(4)] : [x0 + 1, x1 - n]) {
      for (let k = 0; k < n; k++) for (let i = 0; i < n - k; i++) {
        const xx = ex + i + (k >> 1), yy = y0 + 1 - k;
        p.set(xx, yy, i === 0 ? ec.l : i === n - k - 1 ? ec.d : ec.m);
      }
      if (!up) { p.set(ex + 2, y0 - 1, mixc(ec.m, '#e8a0a0', 0.6)); p.set(ex + 2, y0, mixc(ec.m, '#e8a0a0', 0.5)); p.set(ex + 3, y0, mixc(ec.d, '#e8a0a0', 0.4)); }
    }
  }
  // ---- horns: curling up and back from the temples
  if (L.horns) {
    const hc = C('#2a2420'), hm = C('#4a3e34'), hl = C('#8a7a68');
    for (const dir of side ? [-1] : [-1, 1]) {
      const hxx = side ? x0 + S(4) : dir < 0 ? x0 + 2 : x1 - 2;
      const pts = [[0, 1], [1, 0], [2, -1], [3, -2], [3, -3], [3, -4], [2, -5], [1, -6]].map(([a, b]) => [hxx + dir * Math.round(a * m.hf), y0 + Math.round(b * m.hf)]);
      pts.forEach(([px, py], i) => { p.set(px, py, i < 3 ? hm : hc); if (i < 5) p.set(px, py + 1, hc); if (i < 2) p.set(px - dir, py + 1, hc); });
      p.set(pts[2][0], pts[2][1], hl); p.set(pts[4][0], pts[4][1], hl); p.set(pts[7][0], pts[7][1], light(hl, 1.3));
    }
  }
  // ---- fins: a ribbed crest over the crown and fins at the cheeks
  if (L.fins) {
    const fc = C(L.finColor), fl = light(fc, 1.25), fd = dark(fc, 0.7);
    for (let k = 0; k < S(6); k++) { const x = (side ? x0 + S(2) : cL - S(2)) + k, ht = Math.round(S(4) * Math.sin((k + 0.5) / S(6) * Math.PI)); for (let j = 1; j <= ht; j++) p.set(x, y0 + 1 - j, j === ht ? fl : k % 2 ? fd : fc); }
    if (!side) for (const dir of [-1, 1]) { const ex = dir < 0 ? x0 - 1 : x1 + 1; for (let k = 0; k < S(3); k++) { p.set(ex + dir * k, eyeY - k, k === S(3) - 1 ? fl : fc); p.set(ex + dir * k, eyeY - k + 1, fd); } }
    else { p.set(x0 + S(4), eyeY, fc); p.set(x0 + S(3), eyeY - 1, fl); p.set(x0 + S(4), eyeY + 1, fd); }
  }
  // ---- treant crown of leaves
  if (L.canopy) {
    const lc = C(L.canopy), rx = w / 2 + S(6), ry = S(7);
    const ccx = (x0 + x1 + 1) / 2, ccy = y0 - S(3);
    for (let y = Math.floor(ccy - ry - 1); y <= y0 + S(3); y++) for (let x = Math.floor(ccx - rx - 1); x <= Math.ceil(ccx + rx + 1); x++) {
      const nx = (x + 0.5 - ccx) / rx, ny = (y + 0.5 - ccy) / ry;
      if (nx * nx + ny * ny > 1 - hash2(x, y, 33) * 0.25) continue;
      const l = -0.5 * nx - 0.85 * ny + (hash2(x >> 1, y >> 1, 5) - 0.5) * 0.7;
      p.set(x, y, l > 0.6 ? light(lc, 1.4) : l > 0.25 ? light(lc, 1.2) : l > -0.25 ? lc : l > -0.6 ? dark(lc, 0.75) : dark(lc, 0.58));
    }
    if (L.knots) for (const [kx, ky] of [[x0 - S(2), y0 - S(4)], [x1 + S(3), y0 - S(2)], [cL, y0 - S(8)]]) { e.set(kx, ky, L.knots); p.set(kx, ky, L.knots); }
  }
  if (helm) helmet(p, e, F, helm, x0, y0, x1, y1, eyeY);
  if (L.crown && !(helm && helm.kind === 'crown')) crown(p, e, F, x0, y0, x1, '#ffd060');
}

// 2x2 eyes: iris with a dark lower half, a white on the outer side, a brow above
function eyeAt(p, e, x, y, L, glow, face, side, dir = 1) {
  const SK = skinRamp(skinOf(L));
  if (glow) {
    const g = C(glow);
    if (face === 1) { p.set(x, y + 1, dark(g, 0.6)); p.set(x + dir, y + 1, dark(g, 0.45)); return; }
    p.set(x, y, light(g, 1.35)); p.set(x, y + 1, g); p.set(x + dir, y, g); p.set(x + dir, y + 1, dark(g, 0.75));
    e.set(x, y, light(g, 1.35)); e.set(x, y + 1, g); e.set(x + dir, y, g);
    return;
  }
  if (face === 1) { p.set(x, y + 1, SK.dd); p.set(x + dir, y + 1, SK.d); return; }                   // blink
  if (face === 2) { p.set(x + dir, y, SK.dd); p.set(x, y + 1, SK.dd); p.set(x + dir, y + 1, SK.dd); return; }  // squeezed shut
  const iris = C(L.iris || '#241826');
  p.set(x, y, iris); p.set(x, y + 1, dark(iris, 0.55));
  p.set(x + dir, y, '#ece6dc'); p.set(x + dir, y + 1, SK.md);
  // brow above, a little outward (angry when shouting)
  const bc = face === 3 ? C('#2a1418') : SK.dd;
  p.set(x, y - 1 - (face === 3 && !side ? 0 : 0), bc); p.set(x + dir, y - 1 - (face === 3 ? 1 : 0), bc);
}

function beard(p, F, x0, y0, x1, y1, eyeY, H) {
  const { side, up, L, S } = F;
  if (up) { for (let x = x0; x <= x1; x++) { p.set(x, y1, H.d); p.set(x, y1 + 1, (x & 1) ? H.dd : H.d); } return; }
  const big = L.scale < 0.9;
  const bx0 = side ? x1 - S(6) : x0, bx1 = side ? x1 + 1 : x1;
  const bottom = y1 + S(big ? 6 : 3);
  for (let y = eyeY + 2; y <= bottom; y++) {
    const shrink = Math.max(0, Math.round((y - y1 - 1) * 0.8));
    for (let x = bx0 + shrink; x <= bx1 - shrink; x++) {
      let c = (x + (y >> 1)) % 3 === 0 ? H.d : H.m;
      if (x === bx0 + shrink) c = H.l;
      if (y === bottom || x === bx1 - shrink) c = H.d;
      if (y === eyeY + 2 && !side && x > bx0 + 1 && x < bx1 - 1) c = H.l;          // moustache catches the light
      if (y === eyeY + 2 && side && x > bx0 + 2) c = H.l;
      p.set(x, y, c);
    }
  }
  const mx = Math.floor((x0 + x1) / 2);
  if (!side) { p.set(mx, eyeY + 4, '#3a1418'); p.set(mx + 1, eyeY + 4, '#3a1418'); p.set(mx - 2, eyeY + 3, H.d); p.set(mx + 3, eyeY + 3, H.d); }
  // braided tip with a gold bead
  if (big && !side) { p.set(mx, bottom + 1, H.d); p.set(mx + 1, bottom + 1, H.m); p.set(mx, bottom + 2, '#e8c060'); p.set(mx + 1, bottom + 2, '#a07830'); p.set(mx, bottom + 3, H.d); }
}

function hair(p, F, x0, y0, x1, y1, eyeY, H, helm) {
  const { L, side, up, S } = F;
  const style = L.hairStyle;
  if (style === 'bald') return;
  const capped = helm && (helm.kind === 'cap' || helm.kind === 'crown');
  const rows = style === 'crop' || style === 'mohawk' ? S(2) : S(3);
  const w = x1 - x0 + 1;
  // shade by column: lit on the left, falling into shadow on the right
  const col = (x, y) => {
    const u = (x - x0 + 1) / (w + 2);
    let c = u < 0.26 ? H.l : u > 0.76 ? H.d : H.m;
    if (y <= y0 - 1) c = u > 0.7 ? H.m : H.l;
    return c;
  };
  const crownIns = (y) => (y === y0 - 1 ? 3 : y === y0 ? 1 : 0);
  if (up) {
    // back of the head: rounded cap of hair, strands toward the nape, a shine on the crown
    const long = style === 'long';
    const bottom = y1 + (long ? S(6) : 0);
    for (let y = y0 - 1; y <= bottom; y++) {
      const ins = crownIns(y);
      for (let x = x0 - 1 + ins; x <= x1 + 1 - ins; x++) {
        if (y > y1 - 1 && (x < x0 + 1 || x > x1 - 1)) continue;
        let c = col(x, y);
        if (y > y0 + 2 && (x - x0) % 3 === 2) c = c === H.l ? H.m : H.d;          // strands
        if (y === bottom) c = (x & 1) ? H.dd : H.d;
        if (x === x1 + 1 - ins) c = H.dd;
        p.set(x, y, c);
      }
    }
    p.set(x0 + 1, y0, H.s); p.set(x0 + 2, y0, H.s); p.set(x0 + 3, y0 - 1, H.l); p.set(x0 + 1, y0 + 1, H.l); p.set(x0 + 4, y0 - 1, H.s);
    const cx = Math.floor((x0 + x1) / 2);
    if (style === 'ponytail' || style === 'braid') {
      p.rect(cx, y0 + S(6), 2, 1, '#c8a050'); p.set(cx + 1, y0 + S(6), '#a07830');
      for (let k = 0; k < S(9); k++) { const yy = y0 + S(6) + 1 + k; p.set(cx, yy, style === 'braid' && k % 2 ? H.d : H.l); p.set(cx + 1, yy, style === 'braid' && k % 2 ? H.m : H.d); if (k > 1 && k < S(8)) p.set(cx - 1, yy, H.m); }
      p.set(cx, y0 + S(6) + S(9) + 1, H.d);
    }
    if (style === 'bun') { p.disc(cx + 1, y0 + 1, S(3), H.m); p.set(cx, y0, H.l); p.set(cx + 1, y0 - 1, H.s); p.set(cx + 2, y0 + 2, H.d); }
    return;
  }
  // crown of hair, one pixel proud of the skull at the temples
  for (let y = y0 - 1; y < y0 + rows; y++) {
    const ins = crownIns(y), puff = y > y0 ? 1 : 0;
    for (let x = x0 - puff + (ins > 1 ? ins - 1 : 0); x <= x1 + puff - (ins > 1 ? ins - 1 : 0); x++) {
      if (style === 'mohawk' && (x < x0 + S(4) || x > x1 - S(4))) { if (y === y0 + rows - 1) p.set(x, y, H.dd); continue; }
      let c = col(x, y);
      if (y > y0 && y === y0 + rows - 1 && (x === x0 + 3 || x === x1 - 3)) c = H.d;        // a parting / strands
      if (y === y0 + 1 && (x - x0) % 4 === 1 && x > x0 + 2) c = c === H.l ? H.m : H.d;
      p.set(x, y, c);
    }
  }
  // shine: a short bright arc on the lit side
  if (!capped) { p.set(x0 + 1, y0, H.s); p.set(x0 + 2, y0, H.s); p.set(x0 + 3, y0 - 1, H.s); p.set(x0 + 4, y0 - 1, H.l); p.set(x0, y0 + 1, H.l); }
  // tufts
  if (style === 'spiky') for (let k = 0; k < 5; k++) { const x = x0 + 1 + k * 2 + (k > 2 ? 1 : 0), tall = k % 2 ? S(2) : S(3); for (let j = 1; j <= tall; j++) p.set(x + (j === tall ? (k < 2 ? -1 : k > 2 ? 1 : 0) : 0), y0 - 1 - j, j === tall ? H.d : k < 2 ? H.l : H.m); }
  if (style === 'messy') { p.set(x0 + 3, y0 - 2, H.l); p.set(x0 + 4, y0 - 3, H.m); p.set(x1 - 3, y0 - 2, H.m); p.set(x1 - 2, y0 - 2, H.d); p.set(x1 - 1, y0 - 1, H.d); p.set(x0 - 1, y0, H.m); p.set(x1 + 1, y0, H.d); }
  if (style === 'mohawk') for (let x = x0 + S(4); x <= x1 - S(4); x++) { p.set(x, y0 - 2, x & 1 ? H.m : H.l); p.set(x, y0 - 3, H.l); p.set(x, y0 - 4, H.d); }
  if (side) {
    // back half and nape, fringe at the front
    const nape = y1 - 2 + (style === 'long' ? S(4) : 0);
    for (let y = y0; y <= nape; y++) for (let x = x0 - 1; x <= x0 + S(5) - (y > eyeY + 1 ? 2 : 0); x++) {
      let c = y < y0 + 2 ? H.l : H.m;
      if (x === x0 - 1 || y === nape) c = H.d;
      if (y > y0 + 2 && (x + y) % 3 === 0) c = H.d;
      p.set(x, y, c);
    }
    for (let x = x0 + S(5); x <= x1; x++) { p.set(x, y0 + rows - 1, x === x1 ? H.d : H.m); if (x > x1 - 3 && style !== 'crop' && style !== 'mohawk') p.set(x, y0 + rows, H.d); }
    if (style === 'swept' || style === 'messy' || style === 'spiky') { p.set(x1, y0 + rows, H.m); p.set(x1 + 1, y0 + rows - 1, H.d); p.set(x1 + 1, y0 + rows, H.dd); }
    if (style === 'bun') { p.disc(x0 + 0.5, y0 + 1, S(3), H.m); p.set(x0 - 1, y0, H.l); p.set(x0, y0 - 1, H.s); }
    return;
  }
  // front: fringe and side locks
  if (!capped && style !== 'mohawk' && style !== 'crop') {
    if (style === 'swept') {
      // swept to one side: longer over the right eye
      for (let x = x0; x <= x1; x++) { const len = Math.round((x - x0) / (x1 - x0) * S(3)); for (let k = 0; k <= len; k++) p.set(x, y0 + rows + k - 1, k === len ? H.d : col(x, y0 + 2)); }
    } else {
      for (let x = x0; x <= x1; x++) {
        const lock = (x - x0) % 3;
        if (lock !== 1 || x === x0 || x === x1) p.set(x, y0 + rows, lock === 2 ? H.d : col(x, y0 + 2));
        if (lock === 0 && x > x0 && x < x1 - 1) p.set(x, y0 + rows + 1, H.d);
      }
    }
  }
  const sideLen = style === 'long' ? y1 + S(4) : style === 'crop' || style === 'mohawk' ? y0 + rows : eyeY + (style === 'braid' || style === 'ponytail' ? 2 : 1);
  for (let y = y0 + rows; y <= sideLen; y++) { p.set(x0 - 1, y, H.m); p.set(x0, y, H.l); p.set(x1, y, H.d); p.set(x1 + 1, y, H.dd); if (style === 'long' && y > eyeY) { p.set(x0 - 2, y, H.d); p.set(x1 + 2, y, H.dd); } }
  if (style === 'long') { p.set(x0 - 1, sideLen + 1, H.d); p.set(x1 + 1, sideLen + 1, H.dd); }
  if (style === 'braid') { for (let k = 0; k < S(7); k++) { p.set(x1 + 1, eyeY + 1 + k, k % 2 ? H.d : H.l); p.set(x1 + 2, eyeY + 1 + k, k % 2 ? H.m : H.d); } p.rect(x1 + 1, eyeY + 1 + S(7), 2, 1, '#c8a050'); }
  if (style === 'ponytail') { p.set(x1 + 2, eyeY - 1, H.m); p.set(x1 + 2, eyeY, H.m); p.set(x1 + 2, eyeY + 1, H.d); p.set(x1 + 3, eyeY, H.d); }
  if (style === 'bun') { const cx = Math.floor((x0 + x1) / 2); p.disc(cx + 1, y0 - S(2), S(3), H.m); p.set(cx, y0 - S(4), H.s); p.set(cx - 1, y0 - S(3), H.l); p.set(cx + 2, y0 - 1, H.d); }
}

function helmet(p, e, F, helm, x0, y0, x1, y1, eyeY) {
  const { side, up, S, m } = F;
  const M = C(helm.color || '#9aa4ae'), T = ramp(C(helm.trim || '#c8a050'), 0.7, 1.2);
  const R = ramp(mixc(M, '#e8ecf0', 0.2), 0.58, 1.3);
  const w = x1 - x0 + 1, cL = x0 + (w >> 1) - 1, cR = x0 + (w >> 1);
  switch (helm.kind) {
    case 'great': {
      // a full helm one pixel wider than the head, rounded on top
      const ya = y0 - S(2);
      for (let y = ya; y <= y1; y++) {
        const ins = y === ya ? 3 : y === ya + 1 ? 1 : y === y1 ? 1 : 0;
        for (let x = x0 - 1 + ins; x <= x1 + 1 - ins; x++) {
          const u = (x - x0 + 1) / (w + 1);
          let c = u < 0.15 ? R.l : u < 0.55 ? R.m : u < 0.82 ? R.md : R.d;
          if (x === x1 + 1 - ins) c = R.dd;
          if (y <= ya + 1) c = u < 0.6 ? R.ll : R.l;
          if (y === y1) c = u < 0.3 ? R.md : R.d;
          if (!side && !up && x === cL && y > ya) c = R.ll;                     // centre ridge
          if (!side && !up && x === cR && y > ya + 1 && y < y1) c = R.md;
          p.set(x, y, c);
        }
      }
      p.set(x0, ya + 1, light(R.ll, 1.15));
      if (!up) {
        // visor: a slit across the eyes and a breathing slot below, a trim brow band
        const sx0 = side ? x1 - S(5) : x0, sx1 = side ? x1 + 1 : x1;
        for (let x = sx0; x <= sx1; x++) {
          p.set(x, eyeY, '#0e0a10'); p.set(x, eyeY - 1, R.d); p.set(x, eyeY + 1, x < cL ? R.l : R.m);
          if (helm.glow) { e.set(x, eyeY, helm.glow); p.set(x, eyeY, helm.glow); }
        }
        if (!side) { for (let y = eyeY + 1; y <= eyeY + S(3); y++) { p.set(cL, y, '#0e0a10'); p.set(cR, y, '#1a1418'); } for (let y = eyeY + 3; y < y1; y += 2) p.set(x1 - 2, y, R.dd); }
        else for (let y = eyeY + 2; y < y1; y += 2) { p.set(x1, y, R.dd); p.set(x1 - 2, y, R.dd); }
        for (let x = x0 - (side ? 1 : 0); x <= x1 + (side ? 1 : 0); x++) p.set(x, y0, (x & 1) ? T.m : T.l);
        for (let x = x0; x <= x1; x++) if (!side) p.set(x, y0 + 1, x < cL ? T.d : T.dd);
      } else { for (let x = x0; x <= x1; x++) p.set(x, y0, T.m); for (let y = y0 + 1; y < y1; y++) p.set(cL, y, R.md); }
      if (!helm.plume) {
        // swept horns at the temples, angled back like a bird of prey
        const fin = (bx, dir) => {
          const pts = [[0, 3], [1, 2], [2, 1], [2, 0], [3, -1], [3, -2], [4, -3], [4, -4]].map(([a, b]) => [bx + dir * Math.round(a * m.hf), y0 + Math.round(b * m.hf)]);
          pts.forEach(([x, y], i) => { p.set(x, y, i < 3 ? R.d : i % 2 ? R.l : R.m); if (i < 6) p.set(x - dir, y, i < 3 ? R.dd : R.md); });
          p.set(pts[pts.length - 1][0], pts[pts.length - 1][1], R.ll);
        };
        if (side) fin(x0 - 1, -1); else { fin(x0 - 1, -1); fin(x1 + 1, 1); }
      }
      if (helm.crest) for (let k = 0; k < (side ? S(7) : S(3)); k++) { const cx = side ? x0 + 1 + k : cL; p.set(cx, ya - 1 - (side ? 0 : k), T.m); p.set(side ? cx : cR, ya - 1 - (side ? 1 : k), T.l); }
      if (helm.plume) {
        const pc = ramp(helm.plume, 0.7, 1.2);
        for (let k = 0; k < S(11); k++) {
          const cx = side ? x0 + S(4) - k : cL - (k > S(7) ? k - S(7) : 0);
          const cy = ya - 1 - (side ? Math.floor(k / 2) - (k > S(7) ? k - S(7) : 0) : Math.min(k, S(6)));
          p.set(cx, cy, k % 2 ? pc.l : pc.m); p.set(cx + 1, cy, pc.d); if (k > 2) p.set(cx, cy + 1, pc.md);
        }
      }
      break;
    }
    case 'coif': {
      // mail hood with an opening for the face, a conical cap and a nasal bar
      for (let y = y0 - 1; y <= y1 + S(2); y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
        const inFace = !up && (side ? x >= x1 - S(4) : x >= x0 + 2 && x <= x1 - 2) && y >= y0 + S(4) && y <= y1 - 1;
        if (inFace) continue;
        if ((x === x0 - 1 || x === x1 + 1) && y === y0 - 1) continue;
        const u = (x - x0 + 1) / (w + 1);
        let c = (x + y) % 2 ? R.m : R.md;
        if (u > 0.75) c = (x + y) % 2 ? R.md : R.d;
        if (x === x0 - 1) c = (y & 1) ? R.l : R.m;
        if (x === x1 + 1 || y === y1 + S(2)) c = R.dd;
        p.set(x, y, c);
      }
      for (let y = y0 - S(3); y <= y0 + 1; y++) {
        const t = y - (y0 - S(3)), hw = Math.round((w / 2 + 1) * Math.min(1, 0.3 + t * 0.25));
        for (let x = cL + 1 - hw; x <= cR - 1 + hw; x++) { const u = (x - (cL + 1 - hw)) / Math.max(1, 2 * hw - 2); p.set(x, y, u < 0.3 ? R.ll : u < 0.7 ? R.l : R.md); }
      }
      for (let x = x0 - 1; x <= x1 + 1; x++) { p.set(x, y0 + 2, x < cL ? T.l : T.m); p.set(x, y0 + 3, T.d); }
      if (!up && !side) for (let y = y0 + 4; y <= eyeY + 2; y++) { p.set(cL, y, R.ll); p.set(cR, y, R.md); }
      break;
    }
    case 'hood': {
      // a deep pointed hood: the tip flops to the side, the cowl is wider than the head and
      // spills onto the shoulders, and the face is lost in shadow apart from the eyes
      const H = ramp(M, 0.58, 1.2);
      const lin = mixc(light(M, 1.6), '#f0e0b0', 0.5), linD = mixc(lin, H.d, 0.55);
      const cx2 = x0 + w / 2;                                // centre line between the two middle columns
      const half = w / 2 + S(2);
      const top = y0 - S(4), nTop = S(6), bot = y1 + S(3);
      const hwAt = (y) => {
        const t = y - top;
        if (y > y1) return half + Math.min(S(3), y - y1);
        if (t >= nTop) return half;
        return half * (0.12 + 0.88 * Math.pow(t / nTop, 0.75));
      };
      for (let y = top; y <= bot; y++) {
        const t = y - top, hw = hwAt(y);
        const sh = side ? (t <= 2 ? -1 : 0) : (t <= 2 ? 1 : 0);     // the crown leans toward the tip
        const xa = Math.round(cx2 - hw) + sh, xb = Math.round(cx2 + hw) - 1 + sh + (side && y <= y1 ? 1 : 0);
        for (let x = xa; x <= xb; x++) {
          const u = (x - xa) / Math.max(1, xb - xa);
          let c = u < 0.2 ? H.l : u < 0.56 ? H.m : u < 0.82 ? H.md : H.d;
          if (t <= 2 && u < 0.55) c = H.ll;
          else if (t <= 4 && u < 0.3) c = H.ll;
          if (x === xb) c = H.dd;
          if (y > y1 && !up) {
            // the mantle over the shoulders: folds, a lit upper edge
            if (y === y1 + 1 && u < 0.5) c = H.l;
            if ((x - xa) % 4 === 3 && y > y1 + 1 && x < xb) c = H.md;
            if (y === bot) c = u < 0.2 ? H.md : H.d;
          }
          if (up && Math.abs(x + 0.5 - cx2 - sh) < 0.6 && t > 2) c = H.md;  // back seam
          p.set(x, y, c);
        }
      }
      // the floppy tip, trailing back (side view) or to one side, curling down at the end
      const dir = side ? -1 : 1, tx = Math.round(cx2) + (side ? -2 : 0);
      const tip = [[0, -1, 'l'], [1, -1, 'm'], [-1, -1, 'll'], [1, -2, 'm'], [2, -2, 'md'], [3, -2, 'd'], [3, -1, 'd'], [4, -1, 'dd'], [2, -1, 'm'], [4, 0, 'dd']];
      for (const [a, b, k] of tip) p.set(tx + dir * Math.round(a * m.hf), top + Math.round(b * m.hf), H[k]);
      if (!up) {
        // face opening: a pointed arch rimmed with the pale lining, deep shadow inside
        const fy0 = y0 + S(1), fy1 = y1 + S(1), mh = w / 2 - 2;
        const ohw = (y) => { const k = y - fy0, b = fy1 - y; return Math.min(mh, k * 1.0 + 1, b * 1.2 + 2); };
        if (!side) {
          for (let y = fy0 - 1; y <= fy1 + 1; y++) {
            const hw = Math.max(0, ohw(y));
            const ya = Math.round(cx2 - hw), yb = Math.round(cx2 + hw) - 1;
            if (y < fy0 || y > fy1) { if (y === fy1 + 1) for (let x = ya; x <= yb; x++) p.set(x, y, H.d); continue; }
            p.set(ya - 1, y, lin); p.set(yb + 1, y, linD);
            for (let x = ya; x <= yb; x++) p.set(x, y, y === fy0 ? lin : y === fy0 + 1 ? dark(H.dd, 0.7) : '#0b070d');
          }
          for (let x = Math.round(cx2 - ohw(fy0)) - 1; x <= Math.round(cx2) - 1; x++) p.set(x, fy0 - 1, lin);
        } else {
          for (let y = fy0; y <= fy1; y++) {
            const d = Math.max(1, Math.round(ohw(y) * 0.75));
            const xb = x1 + 2, xa = xb - d;
            for (let x = xa; x <= xb; x++) p.set(x, y, x === xa ? lin : '#0b070d');
          }
        }
        const gl = F.L.eyes || helm.eyes || null;
        const ex = side ? [x1] : [Math.round(cx2) - 2, Math.round(cx2) + 1];
        for (const xx of ex) {
          if (gl) { const g = C(gl); p.set(xx, eyeY, light(g, 1.3)); e.set(xx, eyeY, light(g, 1.3)); p.set(xx, eyeY + 1, g); e.set(xx, eyeY + 1, g); p.set(xx, eyeY - 1, dark(g, 0.5)); }
          else { p.set(xx, eyeY, '#cfc2b0'); p.set(xx, eyeY + 1, '#6a6058'); }
        }
      }
      break;
    }
    case 'cap': {
      // leather cap: a domed crown with a stitched seam, a turned-up brim, a feather
      const H = ramp(M, 0.62, 1.2);
      for (let y = y0 - S(2); y <= y0 + S(2); y++) {
        const ins = y === y0 - S(2) ? 3 : y === y0 - S(2) + 1 ? 1 : 0, puff = y > y0 ? 1 : 0;
        for (let x = x0 - puff + ins; x <= x1 + puff - ins; x++) { const u = (x - x0) / (w - 1); p.set(x, y, u < 0.25 ? H.l : u > 0.78 ? H.d : y < y0 ? H.l : H.m); }
      }
      for (let x = x0 - 1; x <= x1 + 1; x++) { p.set(x, y0 + S(2) + 1, x < cL ? H.l : H.md); p.set(x, y0 + S(2) + 2, H.d); }
      if (!side && !up) for (let y = y0 - 1; y <= y0 + S(2); y++) p.set(cR, y, H.md);
      p.set(x0 + 1, y0 - 1, H.ll); p.set(x0 + 2, y0 - 1, H.ll);
      // feather
      if (!up) { const fx = side ? x0 : x1; const dd = side ? -1 : 1; for (let k = 0; k < S(5); k++) { p.set(fx + dd * Math.round(k * 0.6), y0 - 1 - k, k % 2 ? '#e85a3a' : '#c83a2a'); p.set(fx + dd * Math.round(k * 0.6) + dd, y0 - k, '#a02a1a'); } }
      break;
    }
    case 'crown': crown(p, e, F, x0, y0, x1, helm.color || '#ffc040', helm.gem); break;
  }
}
function crown(p, e, F, x0, y0, x1, col, gem = '#ff4030') {
  const { S } = F;
  const c = C(col), cl = light(c, 1.25), cd = dark(c, 0.72);
  for (let x = x0; x <= x1; x++) { p.set(x, y0, x === x1 ? dark(cd, 0.8) : cd); p.set(x, y0 - 1, (x - x0) % 2 ? cl : c); }
  const mid = Math.floor((x0 + x1) / 2);
  for (const x of [x0, mid, x1 - 1]) { const ht = x === mid ? S(3) : S(2); for (let j = 1; j <= ht; j++) { p.set(x, y0 - 1 - j, j === ht ? light(c, 1.4) : c); p.set(x + 1, y0 - 1 - j, j === ht ? c : cd); } }
  p.set(mid, y0, gem); p.set(mid + 1, y0, dark(gem, 0.7)); e.set(mid, y0, gem);
}
