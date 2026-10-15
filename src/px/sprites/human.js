// Procedural pixel humanoids. Chibi proportions in three views (down / side / up), drawn with
// 3-tone material ramps (cloth, leather, mail, plate, skin, hair), top-left key light with a warm
// rim, selective outlines, readable faces, varied hair, and armour that changes the silhouette by
// weight. Arms are NOT baked in: the actor draws them at runtime from the shoulder anchors in
// `m` so hands can follow the weapon through every swing.
//
// Frames are generated lazily per pose and cached. A pose is { legs, ph, bob, lean, hdx, hdy,
// cape, sway, face, wing }:
//   legs  'stand' | 'run' | 'sprint' | 'stance' | 'lunge' | 'tuck' | 'kneel' | 'ride'
//   ph    run phase 0..5 (contact, down, push, contact', down', push')
//   bob   torso + head drop in px (+ squashes the legs, - stretches them)
//   lean  torso shift toward the facing (side view; the head leads by one more px)
//   hdx/hdy extra head offset (hurt recoil, breathing)
//   cape  cape / hair / tail sway phase 0..3; sway = billow 0 (still) .. 2 (sprint)
//   face  0 normal, 1 blink, 2 hurt, 3 shout
// Glowing pixels (eyes, runes, embers, void marks) go to a separate emissive layer.
import { Pix, C, light, dark, mixc, alpha, hash2, bayer } from '../pix.js';

export const FW = 40, FH = 46, CX = 20, FEET = 42;
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
    height: FEET - m.headTop + 1,
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
    helm: o.helm || null, chest: o.chest || null, gloves: o.gloves || null, legs: o.legs || null, bootsGear: o.bootsGear || null,
    cape: o.cape || null, apron: o.apron || null, crown: o.crown || null, scarf: o.scarf || null, quiver: !!o.quiver,
    canopy: o.canopy || null, knots: o.knots || null, crystals: o.crystals || null, core: o.core || null,
    iris: IRIS[vs % IRIS.length],
  };
}

function metrics(L) {
  const s = L.scale, b = L.build;
  const headW = L.skeleton ? 9 : b > 1.3 ? 12 : b > 1.12 ? 11 : 10;
  const headH = L.skeleton ? 8 : 9;
  const torsoW = Math.max(6, Math.min(13, Math.round(8 * Math.pow(b, 0.75))));
  const torsoH = Math.max(4, Math.min(11, Math.round(6.6 * s + (b > 1.25 ? 1 : 0))));
  const legH = Math.max(3, Math.min(10, Math.round(6 * s)));
  const legTop = FEET - legH + 1;
  const torsoTop = legTop - torsoH;
  const headTop = torsoTop - headH + 2;
  const armW = L.skeleton ? 1 : b > 1.3 ? 3 : 2;
  const armL = Math.max(4, Math.round(torsoH * 0.78 + 1));
  const pad = L.chest && (L.chest.weight === 'plate' || L.chest.weight === 'mail') ? 1 : 0;
  return { headW, headH, torsoW, torsoH, legH, legTop, torsoTop, headTop, armW, armL, pad, cx: CX, feet: FEET };
}

// colours the actor needs to draw the runtime arms
function armPalette(L, m) {
  const sleeve = L.skeleton ? C('#ddd4be') : L.chest ? C(L.chest.color) : C(L.shirt);
  const plate = L.chest?.weight === 'plate' || L.chest?.weight === 'mail';
  const skin = skinOf(L);
  const hand = L.skeleton ? C('#e8e0cc') : L.gloves ? C(L.gloves.color) : L.golem || L.bark || L.stone ? skin : skin;
  return {
    sleeve, sleeveL: light(sleeve, plate ? 1.3 : 1.16), sleeveD: dark(sleeve, 0.66), cuff: L.chest?.trim ? C(L.chest.trim) : dark(sleeve, 0.8),
    hand, handL: light(hand, 1.14), handD: dark(hand, 0.7), w: m.armW, plate,
  };
}
function skinOf(L) { return L.skeleton ? C('#e8e0cc') : C(L.skin); }

// ------------------------------------------------------------------ material ramps
const ramp = (c, kd = 0.68, kl = 1.18) => { c = C(c); return { dd: dark(c, kd * 0.66), d: dark(c, kd), m: c, l: light(c, kl), ll: light(c, kl * 1.14) }; };
const skinRamp = (c) => { c = C(c); return { d: mixc(dark(c, 0.74), '#a03028', 0.12), m: c, l: light(c, 1.1), dd: mixc(dark(c, 0.56), '#601820', 0.15) }; };

// run cycle: stance (front -> back) then swing (back -> front, lifted)
const FOOT_POS = [1, 0, -1, -1, 0, 1], FOOT_LIFT = [0, 0, 0, 1, 2, 1];
function feet(pose) {
  const L = pose.legs || 'stand';
  if (L === 'run' || L === 'sprint') {
    const a = (pose.ph | 0) % 6, b = (a + 3) % 6, big = L === 'sprint' ? 1 : 0;
    return { a: { pos: FOOT_POS[a], lift: FOOT_LIFT[a] + (big && FOOT_LIFT[a] ? 1 : 0) }, b: { pos: FOOT_POS[b], lift: FOOT_LIFT[b] + (big && FOOT_LIFT[b] ? 1 : 0) }, stride: big ? 4 : 3 };
  }
  if (L === 'stance') return { a: { pos: 1, lift: 0 }, b: { pos: -1, lift: 0 }, stride: 2, wide: 1 };
  if (L === 'lunge') return { a: { pos: 1, lift: 0 }, b: { pos: -1, lift: 0 }, stride: 4, wide: 1, bendA: 1 };
  if (L === 'tuck') return { a: { pos: 1, lift: 3 }, b: { pos: 0, lift: 3 }, stride: 2, tuck: 1 };
  if (L === 'kneel') return { a: { pos: 1, lift: 1 }, b: { pos: -1, lift: 0 }, stride: 3, kneel: 1 };
  return { a: { pos: 0, lift: 0 }, b: { pos: 0, lift: 0 }, stride: 0 };
}

// ------------------------------------------------------------------ one frame
function fig(L, m, view, pose) {
  const p = new Pix(FW, FH); p.ox = CX; p.oy = FEET;
  const e = new Pix(FW, FH); e.ox = CX; e.oy = FEET;
  const side = view === 'side', up = view === 'up';
  const bob = pose.bob | 0;
  const lean = side ? pose.lean | 0 : 0;
  const tw = side ? Math.max(5, m.torsoW - 2) : m.torsoW;
  const bx = CX + lean;                                   // torso centre column
  const tl = bx - Math.floor(tw / 2), tr = tl + tw - 1;
  const ty0 = m.torsoTop + bob, ty1 = m.legTop - 1 + bob;
  const chest = L.chest, cw = L.skeleton ? null : chest?.weight;
  const robe = cw === 'cloth';
  const F = { L, m, view, side, up, pose, bob, lean, tw, bx, tl, tr, ty0, ty1, cw, robe, ft: feet(pose) };
  const hx = (side ? lean + (lean >= 2 ? 1 : 0) : 0) + (pose.hdx | 0), hy = bob + (pose.hdy | 0);

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
  const { L, m, view, side, up, tw, tl, tr, ty1, ft } = F;
  const legR = ramp(L.legs?.color || L.pants, 0.66, 1.14);
  const bootC = L.bootsGear?.color || L.boots;
  const bootR = ramp(bootC, 0.62, 1.2);
  const armoured = L.legs && !L.skeleton;
  const plateLegs = armoured && L.chest?.weight === 'plate';
  const hipY = ty1 + 1;
  const bootRows = L.bootsGear ? 3 : 2;
  if (L.skeleton) {
    const bone = C('#ddd4be'), boneD = dark(bone, 0.72);
    const draw = (x, f, far) => {
      const yb = FEET - f.lift + (side ? 0 : up ? -f.pos : f.pos);
      const fx = side ? x + f.pos * ft.stride : x;
      p.line(x, hipY, fx, yb - 1, far ? boneD : bone);
      p.rect(fx - 1, yb, 3, 1, far ? boneD : bone);
    };
    if (side) { draw(F.bx - 1, ft.b, true); draw(F.bx, ft.a, false); }
    else { draw(tl + 1, ft.a, false); draw(tr - 1, ft.b, false); }
    // pelvis
    p.rect(tl + 1, hipY - 1, tw - 2, 2, bone); p.rect(tl + 1, hipY, tw - 2, 1, boneD);
    return;
  }
  if (side) {
    // two-segment legs: hip -> knee -> ankle, boot pointing forward (+x)
    const hipX = F.bx - 1;
    const leg = (f, far) => {
      const R = far ? { d: dark(legR.d, 0.8), m: dark(legR.m, 0.78), l: dark(legR.l, 0.8) } : legR;
      const B = far ? { d: dark(bootR.d, 0.8), m: dark(bootR.m, 0.78), l: dark(bootR.l, 0.8), dd: bootR.dd } : bootR;
      const ankleY = FEET - 1 - f.lift;
      let fx = hipX + Math.round(f.pos * ft.stride * 0.8);
      const kneeY = Math.round((hipY + ankleY) / 2);
      let kx = Math.round((hipX + fx) / 2) + (f.lift > 0 || ft.kneel ? 2 : f.pos > 0 ? 1 : 0);
      if (ft.tuck) { kx = hipX + 3; fx = hipX + 1; }
      if (ft.bendA && !far) kx += 1;
      // thigh + shin, 2-3px thick
      const th = m.torsoW > 9 ? 3 : 2;
      p.line(hipX, hipY, kx, kneeY, R.m, th);
      p.line(kx, kneeY, fx, ankleY - 1, R.m, th);
      // lit front edge of the thigh, knee
      p.set(kx + (th > 2 ? 1 : 0), kneeY, plateLegs ? light(R.l, 1.2) : R.l);
      p.line(hipX, hipY, kx, kneeY, R.d);
      // boot: shaft + foot pointing forward
      for (let y = ankleY - bootRows + 1; y <= ankleY + 1; y++) for (let i = 0; i < th; i++) p.set(fx + i - (th > 2 ? 1 : 0), y, y === ankleY - bootRows + 1 ? B.l : B.m);
      p.rect(fx, ankleY + 1, 3 + (th > 2 ? 1 : 0), 1, B.d);
      p.set(fx + 2 + (th > 2 ? 1 : 0), ankleY + 1, B.d); p.set(fx + 1, ankleY, B.l);
    };
    leg(ft.b, true);
    leg(ft.a, false);
    return;
  }
  // front / back view: two straight legs, the stepping foot lower (toward the camera) or lifted
  const lw = Math.max(2, Math.floor((tw - 1) / 2)), wide = ft.wide ? 1 : 0;
  const draw = (x0, f, outer) => {
    const yb = FEET - f.lift + (up ? -f.pos : f.pos) * (ft.kneel ? 0 : 1) + (ft.tuck ? 0 : 0);
    for (let y = hipY; y <= yb; y++) for (let i = 0; i < lw; i++) {
      const boot = y > yb - bootRows;
      const R = boot ? bootR : legR;
      let c = i === 0 ? R.l : i === lw - 1 ? R.d : R.m;
      if (boot && y === yb - bootRows + 1) c = i === lw - 1 ? R.m : R.l;           // cuff
      if (boot && y === yb) c = i === lw - 1 ? R.dd : R.d;                         // sole
      if (!boot && y === hipY && !up) c = dark(c, 0.8);                           // crotch shadow under the belt
      // knee
      if (!boot && y === Math.round((hipY + yb) / 2) && i === 0 && !up) c = plateLegs ? light(R.l, 1.25) : armoured ? R.l : c;
      p.set(x0 + i, y, c);
    }
    // toe cap catches the light
    if (!up) p.set(x0 + (outer < 0 ? 0 : lw - 1), yb - 1, light(bootR.m, 1.25));
  };
  draw(tl - wide, up ? ft.b : ft.a, -1);
  draw(tr - lw + 1 + wide, up ? ft.a : ft.b, 1);
}

function rideLegs(p, F) {
  // seated: thigh forward, shin down the horse's flank
  const { L, side, tl, tr, ty1 } = F;
  const legR = ramp(L.legs?.color || L.pants, 0.66, 1.14), bootR = ramp(L.bootsGear?.color || L.boots, 0.62, 1.2);
  const hy = ty1 + 1;
  if (side) {
    p.line(F.bx - 1, hy, F.bx + 3, hy, legR.m, 2); p.line(F.bx + 3, hy, F.bx + 3, hy + 4, legR.m, 2);
    p.rect(F.bx + 2, hy + 4, 4, 2, bootR.m); p.rect(F.bx + 2, hy + 5, 4, 1, bootR.d);
  } else { p.rect(tl - 1, hy, 3, 4, legR.m); p.rect(tr - 1, hy, 3, 4, legR.m); }
}

// ------------------------------------------------------------------ torso by armour weight
function torso(p, e, F) {
  const { L, m, side, up, tw, tl, tr, ty0, ty1, cw, bx } = F;
  if (L.skeleton) {
    const bone = C('#e8e0cc'), d = dark(bone, 0.72);
    for (let y = ty0; y <= ty1; y++) p.set(bx, y, d);
    for (let r = 0; r < 3; r++) { const y = ty0 + 1 + r * 2; if (y > ty1 - 1) break; for (let x = tl; x <= tr; x++) p.set(x, y, x === tl ? light(bone, 1.1) : x === tr ? d : bone); }
    p.rect(tl, ty0, tw, 1, d);
    return;
  }
  const base = L.chest ? L.chest.color : L.shirt;
  const R = cw === 'plate' ? ramp(mixc(base, '#e8ecf0', 0.12), 0.56, 1.2) : cw === 'mail' ? ramp(mixc(base, '#c8ccd0', 0.12), 0.6, 1.16) : ramp(base, 0.66, 1.14);
  const trim = C(L.chest?.trim || '#c8a050');
  const T = ramp(trim, 0.7, 1.2);
  // body block with sloped shoulders
  for (let y = ty0; y <= ty1; y++) for (let x = tl; x <= tr; x++) {
    if (y === ty0 && (x === tl || x === tr)) continue;
    const u = (x - tl) / Math.max(1, tw - 1);
    let c = u < 0.2 ? R.l : u > 0.78 ? R.d : R.m;
    if (y === ty1) c = R.d;
    if (y === ty0 && !up) c = u > 0.78 ? R.m : R.l;
    // material texture
    if (cw === 'mail') { if ((x + (y & 1)) % 2 === 0) c = c === R.l ? R.m : c === R.m ? R.d : R.dd; }
    else if (cw === 'leather') { if (hash2(x, y, 11) < 0.12) c = dark(c, 0.9); }
    else if (cw === 'cloth' || !cw) { if ((x - tl) % 3 === 2 && y > ty0 + 1 && !side) c = dark(c, 0.92); }
    if (L.bark && (x * 3 + y) % 5 === 0) c = dark(c, 0.8);
    if (L.stone && hash2(x, y, 4) < 0.12) c = dark(c, 0.82);
    if (L.scales && (x + y * 2) % 4 === 0) c = light(c, 1.1);
    p.set(x, y, c);
  }
  const midX = side ? tr - 1 : tl + Math.floor((tw - 1) / 2);
  if (up) {
    // back: plate spine ridge, leather harness cross, robe hood fold
    if (cw === 'plate') { for (let y = ty0 + 1; y < ty1; y++) p.set(midX, y, R.l); p.rect(tl, ty1 - 1, tw, 1, T.m); }
    else if (cw === 'leather') { p.line(tl, ty0 + 1, tr, ty1 - 1, dark(R.d, 0.85)); p.line(tr, ty0 + 1, tl, ty1 - 1, dark(R.d, 0.85)); }
    else if (cw === 'cloth') { p.rect(tl + 1, ty0, tw - 2, 2, R.d); p.rect(tl + 2, ty0, tw - 4, 1, R.dd); }
    if (cw !== 'cloth') belt(p, F, ty1 - 1, T);
    return;
  }
  // ---- front details
  const neck = skinOf(L);
  if (cw === 'plate') {
    // gorget, breastplate highlight streak and centre ridge, faulds, gold edging
    p.rect(tl + 1, ty0, tw - 2, 1, T.m);
    if (!side) {
      for (let y = ty0 + 1; y < ty1 - 1; y++) p.set(midX, y, R.ll);
      p.set(tl + 1, ty0 + 1, R.ll); p.set(tl + 2, ty0 + 1, R.l); p.set(tl + 1, ty0 + 2, R.l);
      p.set(midX + 1, ty0 + 2, R.d);
    } else { for (let y = ty0 + 1; y < ty1 - 1; y++) p.set(tr - 1, y, R.ll); }
    belt(p, F, ty1 - 1, T, true);
    for (let x = tl; x <= tr; x++) p.set(x, ty1, (x & 1) ? R.dd : R.d);
  } else if (cw === 'mail') {
    // tabard over the hauberk: trim-coloured panel with an emblem, mail at the sides
    const px0 = side ? tr - 2 : tl + 2, px1 = side ? tr : tr - 2;
    for (let y = ty0 + 1; y <= ty1; y++) for (let x = px0; x <= px1; x++) p.set(x, y, x === px0 ? T.l : x === px1 ? T.d : T.m);
    if (!side && tw >= 8) { p.set(midX, ty0 + 2, T.ll); p.set(midX, ty0 + 3, T.ll); p.set(midX - 1, ty0 + 3, T.l); p.set(midX + 1, ty0 + 3, T.l); }
    p.rect(tl + 1, ty0, tw - 2, 1, R.l);
    belt(p, F, ty1 - 1, T);
  } else if (cw === 'leather') {
    // jerkin: darker yoke, stitched seams, a diagonal strap with a buckle
    p.rect(tl + 1, ty0, tw - 2, 1, R.l);
    if (!side) {
      p.set(midX, ty0, neck); p.set(midX + 1, ty0, neck); p.set(midX, ty0 + 1, dark(neck, 0.8));
      for (let y = ty0 + 2; y < ty1 - 1; y += 2) { p.set(tl + 1, y, R.l); p.set(tr - 1, y, R.m); }
      p.line(tl, ty0 + 1, tr - 1, ty1 - 2, mixc(R.dd, '#2a1810', 0.4));
      p.set(Math.round((tl + tr) / 2), Math.round((ty0 + ty1) / 2), T.l);
    } else { p.line(tr, ty0 + 1, tl, ty1 - 2, mixc(R.dd, '#2a1810', 0.4)); }
    belt(p, F, ty1 - 1, T);
    // pouch on the hip
    if (!side) { p.rect(tr - 2, ty1 - 1, 2, 2, ramp('#6a4a2a').m); p.set(tr - 2, ty1 - 1, ramp('#6a4a2a').l); }
  } else if (cw === 'cloth') {
    // robe: open collar, trim down the front, sash
    if (!side) {
      p.set(midX, ty0, neck); p.set(midX + (tw % 2 ? 0 : 1), ty0, neck);
      for (let y = ty0; y <= ty1; y++) p.set(midX + (tw % 2 ? 0 : 1) - (y > ty0 + 1 ? 0 : 0), y, y <= ty0 + 1 ? dark(neck, 0.85) : T.m);
      for (let k = 0; k < 3; k++) { p.set(midX - k, ty0 + k, T.l); p.set(midX + 1 + k - (tw % 2 ? 1 : 0), ty0 + k, T.m); }
    } else { for (let y = ty0; y <= ty1; y++) p.set(tr, y, T.m); }
    for (let x = tl; x <= tr; x++) p.set(x, ty1 - 1, x === tl ? T.l : x === tr ? T.d : T.m);
  } else {
    // plain tunic: collar, laces, belt
    if (!side) {
      p.set(midX, ty0, neck); p.set(midX + (tw % 2 ? 0 : 1), ty0, neck); p.set(midX, ty0 + 1, dark(neck, 0.82));
      p.set(midX, ty0 + 2, R.dd);
    }
    belt(p, F, ty1 - 1, { m: C('#4a2e1c'), l: C('#6a4630'), d: C('#2e1c12'), ll: C('#e8c050') });
  }
  // runes / embers / void marks / constructs' core on bare chests
  if (L.glowSkin && !L.chest) { e.set(midX + 1, ty0 + 1, L.glowSkin); e.set(midX + 1, ty0 + 2, L.glowSkin); e.set(midX, ty0 + 3, L.glowSkin); e.set(midX - 1, ty0 + 2, L.glowSkin); }
  if (L.voidMarks && !L.chest) { for (let x = tl + 1; x <= tr - 1; x++) if ((x & 1) === 0) e.set(x, ty0 + 2, L.voidMarks); }
  if (L.stone && !L.chest) p.line(midX, ty0, midX + 1, ty1 - 2, dark(R.m, 0.6));
  if (L.core) { const cy = ty0 + 2, cc = C(L.core); for (const [dx, dy] of [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]]) { p.set(midX + dx, cy + dy, cc); e.set(midX + dx, cy + dy, cc); } e.set(midX, cy, '#ffffff'); }
  if (L.knots) for (const [dx, dy] of [[-2, 1], [2, 3], [0, 4]]) { p.set(midX + dx, ty0 + dy, L.knots); e.set(midX + dx, ty0 + dy, L.knots); }
}

function belt(p, F, y, T, plate) {
  const { tl, tr, side, up } = F;
  const strap = plate ? T : { m: C('#3e2618'), l: C('#5a3a24'), d: C('#24160e') };
  for (let x = tl; x <= tr; x++) p.set(x, y, x === tl ? strap.l : x === tr ? strap.d : strap.m);
  if (up) return;
  const bx = side ? tr - 1 : Math.floor((tl + tr) / 2);
  p.set(bx, y, '#f0d070'); if (!side) p.set(bx + 1, y, '#a88830');
}

function apron(p, F) {
  const { L, tl, tr, ty0, ty1 } = F;
  const R = ramp(L.apron, 0.7, 1.12);
  const bottom = Math.min(FEET - 2, ty1 + 4);
  for (let y = ty0 + 2; y <= bottom; y++) for (let x = tl + 1; x <= tr - 1; x++) p.set(x, y, y === ty0 + 2 ? R.l : x === tr - 1 ? R.d : y === bottom ? R.d : R.m);
  p.set(tl + 1, ty0 + 1, R.d); p.set(tr - 1, ty0 + 1, R.d);
}

function robeSkirt(p, F) {
  const { L, side, up, tl, tr, ty1, pose } = F;
  const R = ramp(L.chest.color, 0.66, 1.15), T = ramp(L.chest.trim || L.chest.color, 0.7, 1.2);
  const bottom = FEET - 1;
  const sw = pose.legs === 'run' || pose.legs === 'sprint' ? [1, 0, -1, -1, 0, 1][(pose.ph | 0) % 6] : 0;
  for (let y = ty1; y <= bottom; y++) {
    const grow = Math.floor((y - ty1) / 2.5);
    const s = y > ty1 + 2 ? sw : 0;
    const x0 = tl - grow + (side ? s : 0), x1 = tr + grow + (side ? s : s > 0 ? 0 : 0);
    for (let x = x0; x <= x1; x++) {
      let c = R.m;
      if ((x - x0) % 3 === 2 && !side) c = R.d;                // folds
      if (x === x0) c = R.l; else if (x === x1) c = R.dd;
      if (y === bottom) c = x === x1 ? T.d : T.m;
      if (!up && !side && y > ty1 && x === Math.floor((tl + tr) / 2) + (F.tw % 2 ? 0 : 1)) c = T.m;   // front trim
      p.set(x, y, c);
    }
  }
  // the stepping foot peeks out under the hem
  if (!side && sw) { const bR = ramp(L.bootsGear?.color || L.boots); p.rect(sw > 0 ? tl : tr - 1, bottom + 1, 2, 1, bR.m); }
}

function pauldrons(p, F) {
  const { L, side, up, tl, tr, ty0, cw } = F;
  const M = cw === 'plate' ? mixc(L.chest.color, '#e8ecf0', 0.1) : cw === 'mail' ? mixc(L.chest.color, '#c8ccd0', 0.08) : dark(L.chest.color, 0.92);
  const R = ramp(M, 0.6, 1.18), T = C(L.chest.trim || '#c8a050');
  const big = cw === 'plate' ? 1 : 0;
  const pad = (cx, dir) => {
    for (let y = -1; y <= 1 + big; y++) for (let x = -1 - big; x <= 1 + big; x++) {
      if (Math.abs(x) + Math.max(0, y) > 2 + big) continue;
      let c = y < 0 ? R.l : y > big ? R.d : R.m;
      if (x === -1 - big && y <= 0) c = R.ll;
      if (cw === 'plate' && y === 1 + big - 0) c = T;
      if (cw === 'leather' && y === 1) c = R.d;
      p.set(cx + x + dir * 0, ty0 + y, c);
    }
  };
  if (side) pad(F.bx - 1, 0);
  else if (up) { pad(tl - 1, -1); pad(tr + 1, 1); }
  else { pad(tl - 1, -1); pad(tr + 1, 1); }
}

// rocky shoulder boulders (golems) and crystal spikes (glass / ice)
function boulders(p, e, F) {
  const { L, side, tl, tr, ty0 } = F;
  const M = C(L.skin);
  const lump = (cx) => {
    for (let y = -3; y <= 2; y++) for (let x = -3; x <= 3; x++) {
      if (x * x * 0.8 + y * y > 9.5) continue;
      let c = M;
      if (y < -1 || x < -1) c = light(M, 1.2); else if (y > 0 || x > 1) c = dark(M, 0.7);
      if (hash2(cx + x, y, 21) < 0.15) c = dark(M, 0.58);
      p.set(cx + x, ty0 + y, c);
    }
    p.set(cx - 2, ty0 - 2, light(M, 1.4));
    if (L.crystals) for (let k = 0; k < 3; k++) { const x = cx - 1 + k, y = ty0 - 3 - (k === 1 ? 2 : 0); p.set(x, y, L.crystals); p.set(x, y - 1, light(L.crystals, 1.3)); e.set(x, y - 1, L.crystals); }
  };
  if (side) lump(F.bx);
  else { lump(tl - 1); lump(tr + 1); }
}

// ------------------------------------------------------------------ back layer
function cape(p, F) {
  const { L, side, up, tl, tr, ty0, pose } = F;
  const R = ramp(L.cape, 0.62, 1.16);
  const lining = dark(mixc(L.cape, '#201018', 0.35), 0.8);
  const ph = (pose.cape | 0) % 4, sway = pose.sway | 0;
  const wave = [0, 1, 0, -1][ph];
  const bottom = FEET - 2 - (sway > 1 ? 2 : sway);
  if (up) {
    // full cape over the back: folds, trim at the hem, the hem swings
    for (let y = ty0; y <= bottom; y++) {
      const t = (y - ty0) / Math.max(1, bottom - ty0);
      const g = Math.floor(t * 2.6);
      const sh = Math.round(wave * t * t * 1.5);
      const x0 = tl - 1 - g + sh, x1 = tr + 1 + g + sh;
      for (let x = x0; x <= x1; x++) {
        let c = R.m;
        const fx = (x - x0) % 3;
        if (fx === 0) c = R.l; else if (fx === 2) c = R.d;
        if (x === x1) c = R.dd;
        if (y === ty0) c = R.l;
        if (y === bottom) c = (x + y) & 1 ? R.d : R.dd;
        p.set(x, y, c);
      }
    }
    // clasp line at the shoulders
    p.rect(tl, ty0, tr - tl + 1, 1, R.d);
    return;
  }
  if (side) {
    // trails behind the back; billows further back and higher with speed
    const back = F.bx - Math.floor(F.tw / 2);
    for (let y = ty0; y <= bottom; y++) {
      const t = (y - ty0) / Math.max(1, bottom - ty0);
      const flare = Math.round(t * (1.5 + sway * 1.6) + (t > 0.4 ? wave * t : 0));
      const x0 = back - 1 - flare, x1 = back + 1;
      for (let x = x0; x <= x1; x++) p.set(x, y, x === x0 ? R.d : x === x0 + 1 ? R.m : lining);
    }
    return;
  }
  // front view: the cape hangs behind, its edges flare past the body
  for (let y = ty0 + 1; y <= bottom; y++) {
    const t = (y - ty0) / Math.max(1, bottom - ty0);
    const g = Math.floor(t * (1.8 + sway * 0.6)) + (t > 0.5 ? (wave > 0 ? 1 : 0) : 0);
    for (let x = tl - 1 - g; x <= tr + 1 + g + (t > 0.5 && wave < 0 ? 1 : 0); x++) p.set(x, y, x < tl ? R.d : x > tr ? lining : R.dd);
  }
}

function backHair(p, F, hx, hy) {
  const { L, m, side, ty0 } = F;
  if (!L.hair || L.skeleton || L.hairStyle === 'bald') return;
  const helm = L.helm;
  if (helm && (helm.kind === 'great' || helm.kind === 'hood' || helm.kind === 'coif')) return;
  const H = hairRamp(L.hair);
  const w = m.headW, x0 = CX - Math.floor(w / 2) + hx, y0 = m.headTop + hy, x1 = x0 + w - 1;
  const ph = (F.pose.cape | 0) % 4, wave = [0, 1, 0, -1][ph];
  const st = L.hairStyle;
  if (st === 'long' && !side) {
    // falls behind the shoulders
    const bottom = ty0 + 4;
    for (let y = y0 + 4; y <= bottom; y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
      const c = (x - x0) % 3 === 1 ? H.d : x === x0 - 1 ? H.l : H.m;
      p.set(x, y, y === bottom && (x & 1) ? H.d : c);
    }
  } else if ((st === 'ponytail' || st === 'braid') && side) {
    // tied at the back of the crown, hangs down and swings back with speed
    const sway = F.pose.sway | 0;
    const pts = [[x0 - 1, y0 + 2], [x0 - 2, y0 + 3], [x0 - 2 - (sway > 0 ? 1 : 0), y0 + 5], [x0 - 2 - sway - (wave > 0 ? 1 : 0), y0 + 7 - (sway > 1 ? 1 : 0)], [x0 - 2 - sway * 2 - (wave > 0 ? 1 : 0), y0 + 9 - sway]];
    for (let i = 0; i < pts.length - 1; i++) p.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], st === 'braid' && i % 2 ? H.d : i === 0 ? H.l : H.m, 2);
    p.set(pts[0][0], pts[0][1], '#c8a050');
    const tip = pts[pts.length - 1];
    p.set(tip[0], tip[1] + 1, H.d);
  } else if (st === 'long' && side) {
    for (let y = y0 + 2; y <= ty0 + 4; y++) for (let x = x0 - 1 - (y > ty0 && (F.pose.sway | 0) ? 1 : 0); x <= x0 + 3; x++) p.set(x, y, (y + x) % 3 === 0 ? H.d : H.m);
  }
}

function tail(p, F) {
  const { L, side, up, tl, tr, ty1, pose } = F;
  const H = hairRamp(L.hair || '#8a6040');
  const ph = (pose.cape | 0) % 4, wave = [0, 1, 0, -1][ph];
  const pts = side ? [[F.bx - 2, ty1], [F.bx - 5, ty1 + 1], [F.bx - 7, ty1 - 1 + wave], [F.bx - 8, ty1 - 4 + wave]]
    : up ? [[CX, ty1], [CX + 1, ty1 + 3], [CX + 3 + wave, ty1 + 3], [CX + 4 + wave, ty1]]
      : [[tr, ty1], [tr + 3, ty1 + 1], [tr + 5, ty1 - 1 + wave], [tr + 6, ty1 - 4 + wave]];
  for (let i = 0; i < pts.length - 1; i++) p.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], i === 2 ? H.m : H.d, 2);
  p.set(pts[3][0], pts[3][1] - 1, H.l); p.set(pts[3][0] + 1, pts[3][1], H.l);
  void tl;
}

function quiver(p, F, behind) {
  const { side, up, tr, ty0 } = F;
  const wood = ramp('#6a4428', 0.62, 1.2);
  const fx = side ? F.bx - Math.floor(F.tw / 2) - 1 : up ? tr - 2 : tr - 1;
  const top = ty0 - 2;
  if (behind && !side && !up) {
    // only the fletchings peek over the shoulder
    p.set(fx + 1, top, '#e8e0d0'); p.set(fx + 2, top - 1, '#c83a2a'); p.set(fx + 2, top, '#e8e0d0');
    return;
  }
  for (let k = 0; k < 7; k++) { const x = fx + Math.round(k * (up ? -0.4 : 0.3)), y = top + k; p.rect(x, y, 2, 1, k === 0 ? wood.l : k === 6 ? wood.d : wood.m); }
  p.set(fx, top - 1, '#e8e0d0'); p.set(fx + 1, top - 2, '#c83a2a'); p.set(fx + 1, top - 1, '#e8e0d0');
}

function scarf(p, F, hx, hy) {
  const { L, side, up, m, pose } = F;
  const R = ramp(L.scarf, 0.64, 1.2);
  const y = m.torsoTop + F.bob;
  const w = m.headW, x0 = CX - Math.floor(w / 2) + hx, x1 = x0 + w - 1;
  const ph = (pose.cape | 0) % 4, wave = [0, 1, 0, -1][ph], sway = pose.sway | 0;
  for (let x = x0 + 1; x <= x1 - 1; x++) { p.set(x, y, x === x0 + 1 ? R.l : x === x1 - 1 ? R.d : R.m); p.set(x, y + 1, (x & 1) ? R.d : R.m); }
  // trailing ends
  if (side) {
    const bx = x0 + 1;
    for (let k = 1; k <= 3 + sway; k++) p.rect(bx - k, y + 1 + Math.round(k * (sway > 0 ? 0.3 : 0.9)) + (k > 2 ? wave : 0), 1, 2, k % 2 ? R.m : R.d);
  } else if (up) { p.rect(CX + 1, y + 2, 2, 3 + (sway ? 0 : 1), R.d); p.set(CX + 1 + wave, y + 5, R.dd); }
  else { p.rect(x1 - 3, y + 2, 2, 2, R.m); p.set(x1 - 3, y + 4, R.d); }
  void hy;
}

function wings(p, e, F) {
  const { L, side, m, bob, pose } = F;
  const c = alpha(L.wingColor, 140), edge = alpha(light(L.wingColor, 1.25), 230), vein = alpha(dark(L.wingColor, 0.8), 190);
  const y = m.torsoTop + bob;
  const flap = (pose.wing | 0) % 2;
  const lobe = (dir) => {
    for (let k = 0; k < 7 - flap; k++) for (let j = -4 + Math.floor(k / 3) + flap; j <= 2 - Math.floor(k / 2.5); j++) {
      const x = CX + dir * (3 + k), yy = y + j - 1 + Math.floor(k / 3);
      p.set(x, yy, (j === -4 + Math.floor(k / 3) + flap || k === 6 - flap) ? edge : k === 3 ? vein : c);
    }
    for (let k = 0; k < 4; k++) for (let j = 0; j < 3; j++) p.set(CX + dir * (3 + k), y + 3 + j + Math.floor(k / 2), j === 2 ? edge : c);
    e.set(CX + dir * (8 - flap), y - 2 + flap, light(L.wingColor, 1.4));
  };
  if (side) lobe(-1);
  else { lobe(-1); lobe(1); }
}

// ------------------------------------------------------------------ head
function hairRamp(h) { const c = C(h); return { dd: dark(c, 0.48), d: dark(c, 0.68), m: c, l: light(c, 1.22), s: light(c, 1.5) }; }

function head(p, e, F, dx, dy) {
  const { L, m, view, side, up, pose } = F;
  const w = m.headW, h = m.headH;
  const x0 = CX - Math.floor(w / 2) + dx, y0 = m.headTop + dy, x1 = x0 + w - 1, y1 = y0 + h - 1;
  const helm = L.helm;
  const hairR = L.hair ? hairRamp(L.hair) : null;
  const S = skinRamp(skinOf(L));
  const eyeY = y0 + (L.skeleton ? 3 : 4);
  const face = pose.face | 0;
  // ---- ears behind the skull
  if (L.ears === 'long' && helm?.kind !== 'great') {
    for (const dir of side ? [-1] : [-1, 1]) {
      const ex = side ? x0 + 4 : dir < 0 ? x0 : x1;
      for (let k = 1; k <= 3; k++) { p.set(ex + dir * k, eyeY - k + 1, S.l); p.set(ex + dir * k, eyeY - k + 2, S.d); }
      p.set(ex + dir * 4, eyeY - 3, S.m);
    }
  }
  // ---- skull: rounded, jaw narrower
  const inset = L.skeleton ? [2, 1, 0, 0, 0, 0, 1, 2] : [2, 1, 0, 0, 0, 0, 0, 1, 2];
  for (let j = 0; j < h; j++) {
    const iL = inset[j] ?? 0;
    const iR = side && !L.skeleton ? Math.max(0, iL - (j >= 3 ? 1 : 0)) : iL;
    for (let x = x0 + iL; x <= x1 - iR; x++) {
      const y = y0 + j;
      let c = S.m;
      if (x === x0 + iL && j > 1) c = S.l;
      if (x === x1 - iR || j === h - 1) c = S.d;
      if (j === h - 1 && x === x1 - iR) c = S.dd;
      if (L.skeleton) c = x === x1 - iR || j === h - 1 ? C('#b8b09c') : x === x0 + iL ? C('#f4eedc') : C('#e8e0cc');
      if (L.stone && hash2(x, y, 9) < 0.1) c = dark(c, 0.85);
      if (L.bark && (x + y * 2) % 4 === 0) c = dark(c, 0.8);
      if (L.scales && (x + y) % 3 === 0 && j > 4) c = light(c, 1.08);
      p.set(x, y, c);
    }
  }
  // ---- face
  const glowEyes = L.eyes || (L.skeleton ? '#80c0ff' : null);
  if (!up) {
    if (L.skeleton) {
      const sock = side ? [x1 - 3] : [x0 + 2, x1 - 3];
      for (const sx of sock) { p.rect(sx, eyeY, 2, 2, '#1e161a'); e.set(sx + 1, eyeY, glowEyes); p.set(sx + 1, eyeY, glowEyes); }
      p.set(side ? x1 - 1 : CX, eyeY + 2, '#3a3034');
      for (let x = (side ? x1 - 4 : x0 + 2); x <= (side ? x1 : x1 - 2); x += 2) p.set(x, y1 - 1, '#6a6050');
    } else if (side) {
      const ex = x1 - 2;
      eyeAt(p, e, ex, eyeY, L, glowEyes, face, true);
      p.set(x1 + 1, eyeY + 1, S.m); p.set(x1 + 1, eyeY + 2, S.d);                  // nose
      if (!L.beard) p.set(x1, eyeY + 3, face === 3 ? '#3a1418' : S.dd);               // mouth
      // ear
      p.set(x0 + 4, eyeY + 1, S.d); p.set(x0 + 4, eyeY, S.m); p.set(x0 + 3, eyeY + 1, S.dd);
    } else {
      const exL = x0 + 2, exR = x1 - 2;
      eyeAt(p, e, exL, eyeY, L, glowEyes, face, false, -1);
      eyeAt(p, e, exR, eyeY, L, glowEyes, face, false, 1);
      const midL = x0 + Math.floor((w - 1) / 2);
      if (!L.beard && !L.tusks) {
        p.set(midL + 1, eyeY + 2, S.d);                                                  // nose shade
        if (face === 3) { p.rect(midL, eyeY + 3, 2, 2, '#3a1418'); }
        else { p.set(midL, eyeY + 3, S.dd); if (w % 2 === 0) p.set(midL + 1, eyeY + 3, mixc(S.dd, S.m, 0.5)); }
      }
      // cheek blush on lighter skins
      if (!L.stone && !L.bark && skinOf(L)[0] > 150) { p.set(x0 + 1, eyeY + 2, mixc(S.m, '#e06858', 0.35)); p.set(x1 - 1, eyeY + 2, mixc(S.m, '#e06858', 0.35)); }
    }
    if (L.tusks) { const tx = side ? [x1 - 1] : [x0 + 2, x1 - 2]; for (const xx of tx) { p.set(xx, y1 - 1, '#f4ecd4'); p.set(xx, y1 - 2, '#fffaf0'); p.set(xx, y1, '#d8ccb0'); } }
    if (L.glowSkin) { const gx = side ? x1 - 3 : x1 - 3; e.set(gx, y0 + 2, L.glowSkin); e.set(gx + 1, y0 + 3, L.glowSkin); e.set(gx, y0 + 4, L.glowSkin); e.set(gx - 1, y1 - 1, L.glowSkin); }
    if (L.voidMarks) { const vx = side ? x1 - 2 : x0 + 2; for (let y = y0 + 2; y <= y1 - 1; y++) if (y !== eyeY && y !== eyeY + 1) e.set(vx, y, L.voidMarks); }
    if (L.stone) p.line(x0 + 3, y0 + 1, x0 + 5, y1 - 2, dark(S.m, 0.6));
  }
  // ---- beard (over the collar)
  if (L.beard && !L.skeleton && !(helm && helm.kind === 'great')) beard(p, F, x0, y0, x1, y1, eyeY, hairR || hairRamp('#6a3a1a'));
  // ---- hair
  if (hairR && !L.skeleton && !(helm && (helm.kind === 'great' || helm.kind === 'hood' || helm.kind === 'coif'))) hair(p, F, x0, y0, x1, y1, eyeY, hairR, helm);
  // ---- beast ears on top
  if (L.beastEars && !(helm && helm.kind === 'great')) {
    const ec = hairR || hairRamp('#8a6040');
    for (const ex of side ? [x0 + 3] : [x0 + 1, x1 - 3]) {
      for (let k = 0; k < 3; k++) for (let i = 0; i < 3 - k; i++) p.set(ex + i, y0 - k, k === 0 ? ec.m : i === 0 ? ec.l : ec.m);
      if (!up) p.set(ex + 1, y0, mixc(ec.m, '#e8a0a0', 0.55));
    }
  }
  // ---- horns
  if (L.horns) {
    const hc = C('#2a2420'), hl = C('#8a7a68');
    for (const dir of side ? [-1] : [-1, 1]) {
      const hxx = side ? x0 + 3 : dir < 0 ? x0 + 1 : x1 - 1;
      const pts = [[hxx, y0], [hxx + dir, y0 - 1], [hxx + dir * 2, y0 - 2], [hxx + dir * 2, y0 - 3], [hxx + dir, y0 - 4]];
      for (const [px, py] of pts) p.set(px, py, hc);
      p.set(pts[1][0], pts[1][1] + 1, hc);
      p.set(pts[2][0], pts[2][1], hl); p.set(pts[4][0], pts[4][1], light(hl, 1.3));
    }
  }
  // ---- fins
  if (L.fins) {
    const fc = C(L.finColor);
    for (let k = 0; k < 4; k++) p.set(CX - 1 + dx + (k % 2), y0 - 1 - k, k % 2 ? light(fc, 1.2) : fc);
    p.set(CX + dx, y0 - 1, fc); p.set(CX - 1 + dx, y0 - 2, fc);
    if (!side) { p.set(x0 - 1, eyeY, fc); p.set(x0 - 2, eyeY - 1, light(fc, 1.2)); p.set(x1 + 1, eyeY, fc); p.set(x1 + 2, eyeY - 1, light(fc, 1.2)); }
  }
  // ---- treant crown of leaves
  if (L.canopy) {
    const lc = C(L.canopy);
    for (let y = y0 - 6; y <= y0 + 2; y++) for (let x = x0 - 4; x <= x1 + 4; x++) {
      const nx = (x + 0.5 - (x0 + x1 + 1) / 2) / (w / 2 + 4), ny = (y + 0.5 - (y0 - 2)) / 4.6;
      if (nx * nx + ny * ny > 1 - hash2(x, y, 33) * 0.25) continue;
      const l = -0.5 * nx - 0.85 * ny + (hash2(x, y, 5) - 0.5) * 0.6;
      p.set(x, y, l > 0.5 ? light(lc, 1.25) : l > -0.2 ? lc : dark(lc, 0.7));
    }
    if (L.knots) { e.set(x0 - 1, y0 - 3, L.knots); e.set(x1 + 2, y0 - 1, L.knots); p.set(x0 - 1, y0 - 3, L.knots); p.set(x1 + 2, y0 - 1, L.knots); }
  }
  if (helm) helmet(p, e, F, helm, x0, y0, x1, y1, eyeY);
  if (L.crown && !(helm && helm.kind === 'crown')) crown(p, e, x0, y0, x1, '#ffd060');
  void view;
}

function eyeAt(p, e, x, y, L, glow, face, side, dir = 1) {
  const S = skinRamp(skinOf(L));
  if (glow) {
    const g = C(glow);
    if (face === 1) { p.set(x, y + 1, dark(g, 0.6)); return; }
    p.set(x, y, light(g, 1.3)); p.set(x, y + 1, g); e.set(x, y, light(g, 1.3)); e.set(x, y + 1, g);
    return;
  }
  if (face === 1) { p.set(x, y + 1, S.dd); if (!side) p.set(x - dir, y + 1, S.d); return; }   // blink
  if (face === 2) { p.set(x, y, S.dd); p.set(x - dir, y + 1, S.dd); p.set(x, y + 1, S.dd); return; }   // squeezed shut
  const iris = C(L.iris || '#241826');
  p.set(x, y, iris); p.set(x, y + 1, dark(iris, 0.55));
  // brow above, a little outward
  p.set(x + (side ? 0 : dir), y - 1, face === 3 ? '#2a1418' : S.d);
}

function beard(p, F, x0, y0, x1, y1, eyeY, H) {
  const { side, up, L } = F;
  if (up) { for (let x = x0; x <= x1; x++) p.set(x, y1, H.d); return; }
  const big = L.scale < 0.9;
  const bx0 = side ? x1 - 4 : x0, bx1 = side ? x1 + 1 : x1;
  const bottom = y1 + (big ? 4 : 2);
  for (let y = eyeY + 2; y <= bottom; y++) {
    const shrink = Math.max(0, y - y1 - 1);
    for (let x = bx0 + shrink; x <= bx1 - shrink; x++) {
      let c = (x + y) % 3 === 0 ? H.d : H.m;
      if (x === bx0 + shrink) c = H.l;
      if (y === bottom || x === bx1 - shrink) c = H.d;
      if (y === eyeY + 2 && !side && x > bx0 + 1 && x < bx1 - 1) c = H.l;          // moustache catches the light
      p.set(x, y, c);
    }
  }
  if (!side) { p.set(Math.floor((x0 + x1) / 2), eyeY + 3, '#3a1418'); p.set(Math.floor((x0 + x1) / 2) + 1, eyeY + 3, '#3a1418'); }
  // braided tip
  if (big && !side) { const mx = Math.floor((x0 + x1) / 2); p.set(mx, bottom + 1, H.d); p.set(mx + 1, bottom + 1, H.m); p.set(mx, bottom + 2, '#c8a050'); }
}

function hair(p, F, x0, y0, x1, y1, eyeY, H, helm) {
  const { L, side, up } = F;
  const style = L.hairStyle;
  if (style === 'bald') return;
  const capped = helm && (helm.kind === 'cap' || helm.kind === 'crown');
  const rows = style === 'crop' || style === 'mohawk' ? 2 : 3;
  const w = x1 - x0 + 1;
  // shade by column: lit on the left, falling into shadow on the right
  const col = (x, y) => {
    const u = (x - x0 + 1) / (w + 2);
    let c = u < 0.28 ? H.l : u > 0.78 ? H.d : H.m;
    if (y === y0 - 1) c = u > 0.7 ? H.m : H.l;
    return c;
  };
  if (up) {
    // back of the head: rounded cap of hair, strands toward the nape, a shine on the crown
    const long = style === 'long';
    const bottom = y1 + (long ? 4 : 0);
    for (let y = y0 - 1; y <= bottom; y++) {
      const inset = y === y0 - 1 ? 2 : y === y0 ? 1 : 0;
      for (let x = x0 - 1 + inset; x <= x1 + 1 - inset; x++) {
        if (y > y1 && (x < x0 + 1 || x > x1 - 1)) continue;
        let c = col(x, y);
        if (y > y0 + 2 && (x - x0) % 3 === 2) c = c === H.l ? H.m : H.d;          // strands
        if (y === bottom) c = (x & 1) ? H.dd : H.d;
        if (x === x1 + 1 - inset) c = H.dd;
        p.set(x, y, c);
      }
    }
    p.set(x0 + 1, y0, H.s); p.set(x0 + 2, y0, H.s); p.set(x0 + 3, y0 - 1, H.l); p.set(x0 + 1, y0 + 1, H.l);
    const cx = Math.floor((x0 + x1) / 2);
    if (style === 'ponytail' || style === 'braid') {
      p.set(cx, y0 + 4, '#c8a050'); p.set(cx + 1, y0 + 4, '#a07830');
      for (let k = 0; k < 6; k++) { const yy = y0 + 5 + k; p.set(cx, yy, style === 'braid' && k % 2 ? H.d : H.m); p.set(cx + 1, yy, style === 'braid' && k % 2 ? H.m : H.d); }
      p.set(cx, y0 + 11, H.d);
    }
    if (style === 'bun') { p.disc(cx + 1, y0 + 1, 2.2, H.m); p.set(cx, y0, H.l); }
    return;
  }
  // crown of hair, one pixel proud of the skull at the temples
  for (let y = y0 - 1; y < y0 + rows; y++) for (let x = x0 - (y > y0 ? 1 : 0); x <= x1 + (y > y0 ? 1 : 0); x++) {
    if (y === y0 - 1 && (x <= x0 + 1 || x >= x1 - 1)) continue;
    if (style === 'mohawk' && (x < x0 + 3 || x > x1 - 3)) { if (y === y0 + rows - 1) p.set(x, y, H.dd); continue; }
    let c = col(x, y);
    if (y === y0 + rows - 1 && (x === x0 + 3 || x === x1 - 3)) c = H.d;             // a parting / strand
    p.set(x, y, c);
  }
  // shine: a short bright arc on the lit side
  if (!capped) { p.set(x0 + 1, y0, H.s); p.set(x0 + 2, y0, H.s); p.set(x0 + 3, y0 - 1, H.l); }
  // tufts
  if (style === 'spiky') for (let k = 0; k < 4; k++) { const x = x0 + 1 + k * 2 + (k > 1 ? 1 : 0); p.set(x, y0 - 2, k % 2 ? H.m : H.l); p.set(x + (k < 2 ? -1 : 1), y0 - 3 + (k % 2), k % 2 ? H.d : H.m); }
  if (style === 'messy') { p.set(x0 + 3, y0 - 2, H.l); p.set(x1 - 2, y0 - 2, H.m); p.set(x1 - 1, y0 - 1, H.d); p.set(x0, y0 - 1, H.m); }
  if (style === 'mohawk') for (let x = x0 + 3; x <= x1 - 3; x++) { p.set(x, y0 - 2, x & 1 ? H.m : H.l); p.set(x, y0 - 3, H.d); }
  if (side) {
    // back half and nape, fringe at the front
    const nape = y1 - 1 + (style === 'long' ? 3 : 0);
    for (let y = y0; y <= nape; y++) for (let x = x0 - 1; x <= x0 + 3 - (y > eyeY + 1 ? 1 : 0); x++) {
      let c = y < y0 + 2 ? H.l : H.m;
      if (x === x0 - 1 || y === nape) c = H.d;
      if (y > y0 + 2 && (x + y) % 3 === 0) c = H.d;
      p.set(x, y, c);
    }
    for (let x = x0 + 4; x <= x1; x++) p.set(x, y0 + rows - 1, x === x1 ? H.d : H.m);
    if (style === 'swept' || style === 'messy' || style === 'spiky') { p.set(x1, y0 + rows, H.m); p.set(x1 + 1, y0 + rows - 1, H.d); }
    else if (style !== 'crop' && style !== 'mohawk') p.set(x1, y0 + rows, H.d);
    if (style === 'bun') { p.disc(x0 + 0.5, y0 + 1, 2.2, H.m); p.set(x0, y0, H.l); }
    return;
  }
  // front: fringe and side locks
  if (!capped && style !== 'mohawk' && style !== 'crop') {
    if (style === 'swept') {
      // swept to one side: longer over the right eye
      for (let x = x0; x <= x1; x++) { const len = Math.round((x - x0) / (x1 - x0) * 1.6); for (let k = 0; k <= len; k++) p.set(x, y0 + rows + k - 1, k === len ? H.d : col(x, y0 + 2)); }
    } else {
      for (let x = x0; x <= x1; x++) if ((x + y0) % 2 === 0 || x === x0 || x === x1) p.set(x, y0 + rows, (x + y0) % 4 === 0 ? H.d : col(x, y0 + 2));
    }
  }
  const sideLen = style === 'long' ? y1 + 3 : style === 'crop' || style === 'mohawk' ? y0 + rows : eyeY + (style === 'braid' || style === 'ponytail' ? 1 : 0);
  for (let y = y0 + rows; y <= sideLen; y++) { p.set(x0 - 1, y, H.m); p.set(x0, y, H.l); p.set(x1, y, H.d); p.set(x1 + 1, y, H.dd); }
  if (style === 'long') { p.set(x0 - 1, sideLen + 1, H.d); p.set(x1 + 1, sideLen + 1, H.dd); }
  if (style === 'braid') { for (let k = 0; k < 5; k++) p.set(x1 + 1, eyeY + 1 + k, k % 2 ? H.d : H.l); p.set(x1 + 1, eyeY + 6, '#c8a050'); }
  if (style === 'ponytail') { p.set(x1 + 2, eyeY, H.m); p.set(x1 + 2, eyeY + 1, H.d); }
  if (style === 'bun') { const cx = Math.floor((x0 + x1) / 2); p.disc(cx + 1, y0 - 2, 2, H.m); p.set(cx, y0 - 3, H.l); }
}

function helmet(p, e, F, helm, x0, y0, x1, y1, eyeY) {
  const { side, up } = F;
  const M = C(helm.color || '#9aa4ae'), T = C(helm.trim || '#c8a050');
  const R = ramp(mixc(M, '#e8ecf0', 0.2), 0.58, 1.3);
  switch (helm.kind) {
    case 'great': {
      for (let y = y0 - 1; y <= y1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
        if ((x === x0 - 1 || x === x1 + 1) && (y === y0 - 1)) continue;
        if ((x === x0 - 1 || x === x1 + 1) && y === y1) continue;
        let c = R.m;
        if (x === x1 + 1 || y === y1) c = R.d; else if (x === x0 - 1 || y === y0 - 1) c = R.l;
        if (!side && !up && x === Math.floor((x0 + x1) / 2)) c = R.ll;                 // centre ridge
        if (x === x0 && y === y0) c = R.ll;
        p.set(x, y, c);
      }
      if (!up) {
        // visor slit, breaths, a brow band in the trim colour
        const sx0 = side ? x1 - 4 : x0 + 1, sx1 = side ? x1 + 1 : x1 - 1;
        for (let x = sx0; x <= sx1; x++) { p.set(x, eyeY, '#0e0a10'); p.set(x, eyeY - 1, R.d); if (helm.glow) { e.set(x, eyeY, helm.glow); p.set(x, eyeY, helm.glow); } }
        for (let y = eyeY + 2; y < y1; y += 2) p.set(side ? x1 : Math.floor((x0 + x1) / 2) + 2, y, R.dd);
        if (!side) for (let x = x0; x <= x1; x++) p.set(x, y0 + 1, (x & 1) ? T : light(T, 1.15));
      } else for (let x = x0; x <= x1; x++) p.set(x, y0 + 1, T);
      if (helm.crest) for (let k = 0; k < (side ? 6 : 3); k++) { const cx = side ? x0 + 1 + k : Math.floor((x0 + x1) / 2); p.set(cx, y0 - 2 - (side ? 0 : k), T); if (!side) p.set(cx + 1, y0 - 2 - k, light(T, 1.2)); }
      if (helm.plume) {
        const pc = C(helm.plume);
        for (let k = 0; k < 7; k++) {
          const cx = side ? x0 - k + 3 : Math.floor((x0 + x1) / 2) - (k > 4 ? k - 4 : 0);
          const cy = y0 - 2 - (side ? Math.floor(k / 2) - (k > 4 ? k - 4 : 0) : Math.min(k, 4));
          p.set(cx, cy, k % 2 ? light(pc, 1.2) : pc); p.set(cx + 1, cy, dark(pc, 0.75));
        }
      }
      break;
    }
    case 'coif': {
      for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
        const inFace = !up && (side ? x >= x1 - 3 : x >= x0 + 2 && x <= x1 - 2) && y >= y0 + 3 && y <= y1 - 1;
        if (inFace) continue;
        if ((x === x0 - 1 || x === x1 + 1) && y === y0 - 1) continue;
        let c = (x + y) % 2 ? R.m : R.d;
        if (x === x0 - 1) c = (y & 1) ? R.l : R.m;
        p.set(x, y, c);
      }
      // conical cap with a nasal bar
      for (let x = x0; x <= x1; x++) p.set(x, y0 - 1, x < x0 + 3 ? R.ll : R.l);
      for (let x = x0 + 2; x <= x1 - 2; x++) p.set(x, y0 - 2, R.m);
      p.set(x0 + 3, y0 - 2, R.ll);
      for (let x = x0; x <= x1; x++) p.set(x, y0 + 2, T);
      if (!up && !side) for (let y = y0 + 3; y <= eyeY + 1; y++) p.set(Math.floor((x0 + x1) / 2), y, R.l);
      break;
    }
    case 'hood': {
      const H = ramp(M, 0.6, 1.15);
      for (let y = y0 - 2; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
        if ((x === x0 - 1 || x === x1 + 1) && y <= y0 - 1) continue;
        p.set(x, y, x === x1 + 1 ? H.d : x === x0 - 1 ? H.l : (x - x0) % 4 === 3 ? H.d : H.m);
      }
      p.set(Math.floor((x0 + x1) / 2), y0 - 3, H.m); p.set(Math.floor((x0 + x1) / 2) - 1, y0 - 2, H.l);
      if (!up) {
        const fx0 = side ? x1 - 3 : x0 + 1, fx1 = side ? x1 + 1 : x1 - 1;
        for (let y = y0 + 3; y <= y1; y++) for (let x = fx0; x <= fx1; x++) p.set(x, y, y === y0 + 3 ? H.dd : '#120c12');
        // lower face lit just at the chin
        for (let x = fx0 + 1; x < fx1; x++) p.set(x, y1, skinRamp(skinOf(F.L)).d);
        const gl = F.L.eyes || null;
        const ex = side ? [x1 - 1] : [x0 + 3, x1 - 3];
        for (const xx of ex) { p.set(xx, eyeY + 1, gl || '#9a8a78'); if (gl) e.set(xx, eyeY + 1, gl); }
      } else {
        for (let y = y0 + 1; y <= y1 + 1; y++) p.set(Math.floor((x0 + x1) / 2), y, H.d);
      }
      break;
    }
    case 'cap': {
      const H = ramp(M, 0.62, 1.2);
      for (let y = y0 - 1; y <= y0 + 2; y++) for (let x = x0 - (y > y0 ? 1 : 0); x <= x1 + (y > y0 ? 1 : 0); x++) p.set(x, y, y === y0 - 1 ? H.l : x === x0 - 1 ? H.l : x === x1 + 1 ? H.d : H.m);
      for (let x = x0 - 1; x <= x1 + 1; x++) p.set(x, y0 + 3, H.d);
      p.set(x0 + 1, y0, H.ll);
      // feather
      if (!up) { const fx = side ? x0 : x1; p.set(fx, y0 - 2, '#c83a2a'); p.set(fx + (side ? -1 : 1), y0 - 3, '#e85a3a'); p.set(fx + (side ? -1 : 1), y0 - 1, '#a02a1a'); }
      break;
    }
    case 'crown': crown(p, e, x0, y0, x1, helm.color || '#ffc040', helm.gem); break;
  }
}
function crown(p, e, x0, y0, x1, col, gem = '#ff4030') {
  const c = C(col);
  for (let x = x0; x <= x1; x++) { p.set(x, y0, dark(c, 0.8)); p.set(x, y0 - 1, (x - x0) % 2 ? light(c, 1.2) : c); }
  for (const x of [x0, Math.floor((x0 + x1) / 2), x1]) { p.set(x, y0 - 2, c); p.set(x, y0 - 3, light(c, 1.35)); }
  p.set(Math.floor((x0 + x1) / 2), y0, gem); e.set(Math.floor((x0 + x1) / 2), y0, gem);
}
