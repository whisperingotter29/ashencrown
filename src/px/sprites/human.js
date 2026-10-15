// Procedural pixel humanoids: chibi proportions, three views (down / side / up), idle-run-cast-
// hurt-block frames, every race feature, and visible armour by weight. Glowing pixels (eyes,
// runes, embers, void marks) go to a separate emissive layer that stays bright at night.
import { Pix, C, light, dark, shade, mixc, alpha, hash2 } from '../pix.js';

export const FW = 28, FH = 34, CX = 14, FEET = 32;
const EYE = [24, 16, 26, 255];
const cache = new Map();

export function humanSprites(look) {
  const key = JSON.stringify(look);
  let s = cache.get(key);
  if (s) return s;
  const L = norm(look);
  const m = metrics(L);
  const views = {};
  for (const v of ['down', 'side', 'up']) {
    views[v] = {
      idle: [fig(L, m, v, { bob: 0 }), fig(L, m, v, { bob: 1 })],
      run: [0, 1, 2, 3].map((f) => fig(L, m, v, { leg: f, bob: f % 2 ? -1 : 0, arm: f === 0 ? 1 : f === 2 ? -1 : 0 })),
      cast: [fig(L, m, v, { cast: true })],
      hurt: [fig(L, m, v, { hurt: true })],
      ride: [fig(L, m, v, { ride: true })],
    };
  }
  s = { views, m, L, height: FEET - m.headTop };
  cache.set(key, s);
  return s;
}

function norm(o) {
  return {
    skin: o.skin || '#d8b090', hair: o.hair || null, hairStyle: o.hairStyle || (o.longHair ? 'long' : o.beard || o.tusks ? 'crop' : 'short'),
    beard: !!o.beard, ears: o.ears || null, beastEars: !!o.beastEars, tusks: !!o.tusks, horns: !!o.horns, fins: !!o.fins, finColor: o.finColor || '#3a8a9a',
    wings: !!o.wings, wingColor: o.wingColor || '#e0c0ff', tail: !!o.tail, eyes: o.eyesGlow || null, voidMarks: o.voidMarks || null, glowSkin: o.glowSkin || null,
    stone: !!o.stone, skeleton: !!o.skeleton, bark: !!o.bark, golem: !!o.golem,
    scale: o.scale || 1, build: o.build || 1,
    shirt: o.shirt || '#6a5a4a', pants: o.pants || '#4a3a30', boots: o.bootsColor || '#3a2a20',
    helm: o.helm || null, chest: o.chest || null, gloves: o.gloves || null, legs: o.legs || null, bootsGear: o.bootsGear || null,
    cape: o.cape || null, apron: o.apron || null, crown: o.crown || null,
    canopy: o.canopy || null, knots: o.knots || null, crystals: o.crystals || null, core: o.core || null,
  };
}

function metrics(L) {
  const s = L.scale, b = L.build;
  const headW = L.skeleton ? 9 : b > 1.3 ? 12 : b > 1.15 ? 11 : 10;
  const headH = L.skeleton ? 8 : 9;
  const torsoW = Math.max(6, Math.min(12, Math.round(7.4 * Math.pow(b, 0.75))));
  const torsoH = Math.max(4, Math.min(9, Math.round(6.2 * s + (b > 1.25 ? 1 : 0))));
  const legH = Math.max(3, Math.min(8, Math.round(5.6 * s)));
  const legTop = FEET - legH + 1;
  const torsoTop = legTop - torsoH;
  const headTop = torsoTop - headH + 1;
  return { headW, headH, torsoW, torsoH, legH, legTop, torsoTop, headTop, armW: b > 1.3 ? 3 : 2 };
}

// ------------------------------------------------------------------ one frame
function fig(L, m, view, pose) {
  const p = new Pix(FW, FH); p.ox = CX; p.oy = FEET;
  const e = new Pix(FW, FH); e.ox = CX; e.oy = FEET;
  const bob = pose.bob || 0;
  const skin = L.skeleton ? C('#e0d8c4') : L.stone ? C(L.skin) : L.bark ? C(L.skin) : C(L.skin);
  const side = view === 'side', up = view === 'up';
  const tw = side ? Math.max(5, m.torsoW - 2) : m.torsoW;
  const tl = CX - Math.floor(tw / 2), tr = tl + tw - 1;
  const ty0 = m.torsoTop + bob, ty1 = m.legTop - 1 + bob;
  const chest = L.chest, cw = chest?.weight;
  const robe = cw === 'cloth' && !L.skeleton;
  const torsoC = L.skeleton ? null : chest ? C(chest.color) : C(L.shirt);
  const legC = C(L.legs?.color || L.pants);
  const bootC = C(L.bootsGear?.color || L.boots);
  const handC = L.gloves ? C(L.gloves.color) : skin;
  const sleeveC = chest ? C(chest.color) : C(L.shirt);

  // ---- back layer: wings, cape (down/side), tail
  if (L.wings) wings(p, e, L, m, view, bob, pose);
  if (L.cape && !up) cape(p, L, m, view, tl, tr, ty0);
  if (L.tail && !pose.ride) tail(p, L, m, view, tl, tr, ty1);
  // back arm (side view)
  if (side) arm(p, L, m, 'back', CX - 1, ty0, ty1, sleeveC, handC, pose, view);

  // ---- legs
  if (!pose.ride) legs(p, L, m, view, tl, tr, tw, legC, bootC, pose, robe);
  // ---- torso
  torso(p, e, L, m, view, tl, tr, tw, ty0, ty1, torsoC, pose);
  if (robe) robeSkirt(p, L, m, view, tl, tr, ty1, C(chest.color), C(chest.trim || chest.color), pose);
  if (L.apron && !up) for (let y = ty0 + 2; y <= Math.min(FEET - 3, ty1 + 4); y++) for (let x = tl + 1; x <= tr - 1; x++) p.set(x, y, y === ty0 + 2 ? dark(L.apron, 0.8) : C(L.apron));
  // ---- arms
  if (side) arm(p, L, m, 'front', CX, ty0, ty1, sleeveC, handC, pose, view);
  else { arm(p, L, m, 'left', tl - m.armW, ty0, ty1, sleeveC, handC, pose, view); arm(p, L, m, 'right', tr + 1, ty0, ty1, sleeveC, handC, pose, view); }
  if ((cw === 'plate' || cw === 'mail' || cw === 'leather') && !L.skeleton) pauldrons(p, L, m, view, tl, tr, ty0, C(chest.color), cw);
  if (L.golem) boulders(p, e, L, view, tl, tr, ty0);
  // cape over the back in the up view
  if (L.cape && up) cape(p, L, m, view, tl, tr, ty0);
  // ---- head
  const hx = pose.hurt ? 1 : 0;
  head(p, e, L, m, view, bob + (pose.hurt ? 1 : 0), hx, skin, pose);
  p.outline();
  // a touch of top-left rim light on the whole figure
  return { pix: p, emis: hasPixels(e) ? e : null };
}
function hasPixels(p) { for (let i = 3; i < p.d.length; i += 4) if (p.d[i]) return true; return false; }

// ------------------------------------------------------------------ parts
function legs(p, L, m, view, tl, tr, tw, legC, bootC, pose, robe) {
  const lw = Math.max(2, Math.floor((tw - 1) / 2)), gap = Math.max(1, tw - lw * 2);
  const f = pose.leg;
  const thin = L.skeleton;
  const draw = (x0, lift, shift) => {
    const yTop = m.legTop, yBot = FEET - lift;
    for (let y = yTop; y <= yBot; y++) for (let i = 0; i < lw; i++) {
      if (thin && i !== Math.floor(lw / 2)) continue;
      const boot = y >= yBot - 1;
      let c = boot ? bootC : legC;
      if (thin && !boot) c = C('#e0d8c4');
      if (i === 0) c = light(c, 1.08); else if (i === lw - 1) c = dark(c, 0.82);
      p.set(x0 + i + shift, y, c);
    }
    // toe
    if (!thin) p.set(x0 + (view === 'side' ? lw : 0) + shift, yBot, dark(bootC, 0.85));
  };
  if (view === 'side') {
    const s = f === 0 ? 2 : f === 2 ? -2 : 0;
    draw(CX - lw + 1 - s, f === 2 ? 1 : 0, 0);         // back leg
    draw(CX - lw + 1 + s, f === 0 ? 1 : 0, 0);         // front leg
  } else {
    draw(tl, f === 0 ? 1 : 0, 0);
    draw(tl + lw + gap, f === 2 ? 1 : 0, 0);
  }
  if (robe) return;
}

function torso(p, e, L, m, view, tl, tr, tw, ty0, ty1, C0, pose) {
  if (L.skeleton) {
    // spine and ribs
    const bone = C('#e8e0cc');
    for (let y = ty0; y <= ty1; y++) p.set(CX - (view === 'side' ? 0 : 0), y, dark(bone, 0.85));
    for (let r = 0; r < 3; r++) { const y = ty0 + 1 + r * 2; if (y > ty1) break; for (let x = tl; x <= tr; x++) p.set(x, y, x === tl || x === tr ? dark(bone, 0.85) : bone); }
    p.rect(tl + 1, ty1, tw - 2, 1, dark(bone, 0.8));
    return;
  }
  const cw = L.chest?.weight;
  for (let y = ty0; y <= ty1; y++) for (let x = tl; x <= tr; x++) {
    let c = C0;
    if (cw === 'mail' && (x + y) % 2 === 0) c = dark(C0, 0.8);
    if (cw === 'plate' && (y - ty0) % 3 === 2) c = dark(C0, 0.84);
    if (L.bark && (x * 3 + y) % 5 === 0) c = dark(C0, 0.8);
    if (L.stone && hash2(x, y, 4) < 0.12) c = dark(C0, 0.82);
    if (x === tl) c = light(c, 1.12); else if (x === tr) c = dark(c, 0.78);
    if (y === ty1 && view !== 'up') c = dark(c, 0.86);
    p.set(x, y, c);
  }
  if (view === 'up') return;
  const trim = C(L.chest?.trim || '#c8a050');
  // details by armour weight
  if (cw === 'plate') {
    for (let y = ty0 + 1; y < ty1; y++) p.set(view === 'side' ? tr - 1 : CX, y, light(C0, 1.25));
    p.rect(tl, ty0, tw, 1, dark(C0, 0.7));
  } else if (cw === 'leather') {
    p.line(view === 'side' ? tl : tl, ty0, view === 'side' ? tr : tr, ty1 - 1, light(C0, 1.3));
    p.set(CX + 1, ty1 - 2, '#c8a050');
  } else if (cw === 'cloth') {
    for (let k = 0; k < 3; k++) { p.set(CX - k + (view === 'side' ? 1 : 0), ty0 + k, trim); if (view !== 'side') p.set(CX + k - 1, ty0 + k, trim); }
  } else if (!L.chest) {
    // collar + tunic shading
    p.set(CX - 1, ty0, dark(C0, 0.7)); p.set(CX, ty0, dark(C0, 0.7));
  }
  // belt
  if (cw !== 'cloth') {
    const by = ty1 - 1;
    for (let x = tl; x <= tr; x++) p.set(x, by, cw === 'plate' ? trim : C('#3a2418'));
    p.set(view === 'side' ? tr - 1 : CX, by, '#e8c050');
  } else {
    for (let x = tl; x <= tr; x++) p.set(x, ty1 - 1, trim);
  }
  // runes / embers / void marks on the chest
  if (L.glowSkin && !L.chest) { e.set(CX + 1, ty0 + 1, L.glowSkin); e.set(CX + 1, ty0 + 2, L.glowSkin); e.set(CX, ty0 + 3, L.glowSkin); e.set(CX - 1, ty0 + 2, L.glowSkin); }
  if (L.voidMarks && !L.chest) { for (let x = tl + 1; x <= tr - 1; x++) if ((x & 1) === 0) e.set(x, ty0 + 2, L.voidMarks); }
  if (L.stone && !L.chest) p.line(CX, ty0, CX + 1, ty1 - 2, dark(C0, 0.6));
  if (L.core && view !== 'up') { const cy = ty0 + 2, cc = C(L.core); for (const [dx, dy] of [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]]) { p.set(CX + dx, cy + dy, cc); e.set(CX + dx, cy + dy, cc); } e.set(CX, cy, '#ffffff'); }
  if (L.knots && view !== 'up') for (const [dx, dy] of [[-2, 1], [2, 3], [0, 4]]) { p.set(CX + dx, ty0 + dy, L.knots); e.set(CX + dx, ty0 + dy, L.knots); }
}

// rocky shoulder boulders (golems) and crystal spikes (glass / ice)
function boulders(p, e, L, view, tl, tr, ty0) {
  const M = C(L.skin);
  const lump = (cx) => {
    for (let y = -3; y <= 2; y++) for (let x = -3; x <= 3; x++) {
      if (x * x * 0.8 + y * y > 9.5) continue;
      let c = M;
      if (y < -1 || x < -1) c = light(M, 1.18); else if (y > 0 || x > 1) c = dark(M, 0.72);
      if (hash2(cx + x, y, 21) < 0.15) c = dark(M, 0.6);
      p.set(cx + x, ty0 + y, c);
    }
    if (L.crystals) for (let k = 0; k < 3; k++) { const x = cx - 1 + k, y = ty0 - 3 - (k === 1 ? 2 : 0); p.set(x, y, L.crystals); p.set(x, y - 1, light(L.crystals, 1.3)); e.set(x, y - 1, L.crystals); }
  };
  if (view === 'side') lump(CX);
  else { lump(tl - 1); lump(tr + 1); }
}

function robeSkirt(p, L, m, view, tl, tr, ty1, C0, trim, pose) {
  const bottom = FEET - 2;
  for (let y = ty1; y <= bottom; y++) {
    const grow = Math.floor((y - ty1) / 2);
    const swing = pose.leg === 0 ? 1 : pose.leg === 2 ? -1 : 0;
    const x0 = tl - grow + (y > ty1 + 2 ? swing * (view === 'side' ? 1 : 0) : 0), x1 = tr + grow;
    for (let x = x0; x <= x1; x++) {
      let c = C0;
      if ((x - x0) % 3 === 2) c = dark(C0, 0.85);      // folds
      if (x === x0) c = light(c, 1.1); else if (x === x1) c = dark(c, 0.75);
      if (y === bottom) c = trim;
      p.set(x, y, c);
    }
  }
}

function arm(p, L, m, which, x0, ty0, ty1, sleeveC, handC, pose, view) {
  const w = L.skeleton ? 1 : m.armW;
  let yTop = ty0 + 1, yBot = ty1;
  let dx = 0, dy = 0;
  if (pose.arm && !pose.cast) dy = (which === 'left' || which === 'front' ? pose.arm : -pose.arm);
  if (view === 'side' && pose.arm) dx = which === 'front' ? pose.arm : -pose.arm;
  if (pose.ride) dy = -1;
  if (pose.cast) {
    // arms raised high
    yTop = ty0 - 4; yBot = ty0 + 1;
    if (which === 'left') x0 -= 1; else if (which === 'right') x0 += 1;
  }
  if (pose.hurt) { dy = -1; if (which === 'left') dx = -1; if (which === 'right') dx = 1; }
  const back = which === 'back';
  for (let y = yTop; y <= yBot; y++) for (let i = 0; i < w; i++) {
    const isHand = pose.cast ? y <= yTop + 1 : y >= yBot - 1;
    let c = isHand ? handC : sleeveC;
    if (L.skeleton) c = C('#e0d8c4');
    if (i === w - 1 || back) c = dark(c, back ? 0.7 : 0.85);
    p.set(x0 + i + dx, y + dy, c);
  }
}

function pauldrons(p, L, m, view, tl, tr, ty0, M, cw) {
  const big = cw === 'plate' ? 1 : 0;
  const pad = (cx) => {
    for (let y = -1; y <= 1 + big; y++) for (let x = -1 - big; x <= 1 + big; x++) {
      if (Math.abs(x) + Math.max(0, y) > 2 + big) continue;
      p.set(cx + x, ty0 + y, y < 0 ? light(M, 1.25) : y > big ? dark(M, 0.78) : M);
    }
  };
  if (view === 'side') pad(CX);
  else { pad(tl - 1); pad(tr + 1); }
}

function cape(p, L, m, view, tl, tr, ty0) {
  const c = C(L.cape), d = dark(c, 0.72);
  if (view === 'up') {
    for (let y = ty0; y <= FEET - 3; y++) {
      const g = Math.floor((y - ty0) / 3);
      for (let x = tl - 1 - g; x <= tr + 1 + g; x++) p.set(x, y, (x - tl) % 3 === 0 ? d : y === FEET - 3 ? dark(c, 0.6) : c);
    }
    return;
  }
  if (view === 'side') {
    for (let y = ty0; y <= FEET - 4; y++) { const g = Math.floor((y - ty0) / 2); for (let x = CX - 3 - g; x <= CX - 1; x++) p.set(x, y, x === CX - 3 - g ? d : c); }
    return;
  }
  for (let y = ty0; y <= FEET - 3; y++) for (let x = tl - 1; x <= tr + 1; x++) p.set(x, y, d);
}

function tail(p, L, m, view, tl, tr, ty1) {
  const c = C(L.hair || '#8a6040');
  const pts = view === 'side' ? [[CX - 2, ty1], [CX - 5, ty1 + 1], [CX - 7, ty1 - 1], [CX - 8, ty1 - 4]] : [[tr, ty1], [tr + 3, ty1 + 1], [tr + 5, ty1 - 1], [tr + 6, ty1 - 4]];
  for (let i = 0; i < pts.length - 1; i++) p.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], c, 2);
  p.set(pts[3][0], pts[3][1] - 1, light(c, 1.3));
}

function wings(p, e, L, m, view, bob, pose) {
  const c = alpha(L.wingColor, 150), edge = alpha(light(L.wingColor, 1.2), 220);
  const y = m.torsoTop + bob;
  const flap = pose.leg === 1 || pose.leg === 3 ? 1 : 0;
  const lobe = (dir) => {
    for (let k = 0; k < 7 - flap; k++) for (let j = -3 + Math.floor(k / 3); j <= 2 - Math.floor(k / 2.5); j++) {
      const x = CX + dir * (3 + k), yy = y + j - 1 + Math.floor(k / 3);
      p.set(x, yy, (j === -3 + Math.floor(k / 3) || k === 6 - flap) ? edge : c);
    }
    for (let k = 0; k < 4; k++) for (let j = 0; j < 3; j++) p.set(CX + dir * (3 + k), y + 3 + j + Math.floor(k / 2), c);
  };
  if (view === 'side') lobe(-1);
  else { lobe(-1); lobe(1); }
}

// ------------------------------------------------------------------ head
function head(p, e, L, m, view, dy, dx, skin, pose) {
  const w = m.headW, h = m.headH;
  const x0 = CX - Math.floor(w / 2) + dx, y0 = m.headTop + dy, x1 = x0 + w - 1, y1 = y0 + h - 1;
  const side = view === 'side', up = view === 'up';
  const helm = L.helm;
  const hairC = L.hair ? C(L.hair) : null;
  // elf / beast ears behind hair & helm
  const eyeY = y0 + 5;
  if (L.ears === 'long' && helm?.kind !== 'great') {
    for (const dir of side ? [-1] : [-1, 1]) {
      const ex = dir < 0 ? x0 : x1;
      for (let k = 1; k <= 3; k++) { p.set(ex + dir * k, eyeY - k + 1, skin); p.set(ex + dir * k, eyeY - k + 2, dark(skin, 0.82)); }
    }
  }
  // skull
  const SK = L.skeleton ? C('#e8e0cc') : skin;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const cx = x === x0 || x === x1, cy = y === y0 || y === y1;
    if ((x === x0 || x === x1) && (y === y0 || y === y1)) continue;     // rounded corners
    if (((x === x0 + 1 || x === x1 - 1) && y === y0) || ((x === x0 + 1 || x === x1 - 1) && y === y1 && !L.skeleton)) continue;
    let c = SK;
    if (x === x1 || y === y1) c = dark(SK, 0.82);
    else if (x === x0 || y === y0) c = light(SK, 1.06);
    if (L.stone && hash2(x, y, 9) < 0.1) c = dark(SK, 0.85);
    if (L.bark && (x + y * 2) % 4 === 0) c = dark(SK, 0.8);
    p.set(x, y, c);
    void cx; void cy;
  }
  // face
  const glowEyes = L.eyes || (L.skeleton ? '#80c0ff' : null);
  if (!up) {
    if (L.skeleton) {
      const sock = side ? [x1 - 3] : [x0 + 2, x1 - 3];
      for (const sx of sock) { p.rect(sx, eyeY - 1, 2, 2, '#2a2024'); e.set(sx + 1, eyeY - 1, glowEyes); }
      p.set(side ? x1 - 1 : CX, eyeY + 1, '#3a3034');
      for (let x = (side ? x1 - 4 : x0 + 2); x <= (side ? x1 : x1 - 2); x += 2) p.set(x, y1 - 1, '#7a7060');
    } else if (side) {
      p.set(x1 - 2, eyeY, glowEyes ? C(glowEyes) : EYE); p.set(x1 - 2, eyeY + 1, glowEyes ? C(glowEyes) : EYE);
      if (glowEyes) { e.set(x1 - 2, eyeY, glowEyes); e.set(x1 - 2, eyeY + 1, glowEyes); }
      p.set(x1 + 1, eyeY + 2, skin);                    // nose
      if (!L.beard) p.set(x1 - 1, eyeY + 3, dark(skin, 0.7));
      p.set(x0 + 3, eyeY, dark(skin, 0.75));            // ear
    } else {
      const ex = [x0 + 2, x1 - 2];
      for (const xx of ex) {
        p.set(xx, eyeY, glowEyes ? C(glowEyes) : EYE); p.set(xx, eyeY + 1, glowEyes ? C(glowEyes) : EYE);
        if (glowEyes) { e.set(xx, eyeY, glowEyes); e.set(xx, eyeY + 1, glowEyes); }
      }
      if (!L.beard && !L.tusks) p.set(CX - (w % 2 ? 0 : 0), eyeY + 3, dark(skin, 0.72));
      // cheek blush on lighter skins for warmth
      if (!L.stone && !L.bark && skin[0] > 150) { p.set(x0 + 1, eyeY + 2, mixc(skin, '#e07060', 0.35)); p.set(x1 - 1, eyeY + 2, mixc(skin, '#e07060', 0.35)); }
    }
    if (L.tusks) { const tx = side ? [x1 - 1] : [x0 + 2, x1 - 2]; for (const xx of tx) { p.set(xx, y1, '#f0e8d0'); p.set(xx, y1 - 1, '#f0e8d0'); } }
    if (L.glowSkin) { const gx = side ? x1 - 3 : x1 - 3; e.set(gx, y0 + 2, L.glowSkin); e.set(gx + 1, y0 + 3, L.glowSkin); e.set(gx, y0 + 4, L.glowSkin); e.set(gx - 1, y1 - 1, L.glowSkin); }
    if (L.voidMarks) { const vx = side ? x1 - 2 : x0 + 2; for (let y = y0 + 2; y <= y1 - 1; y++) if (y !== eyeY && y !== eyeY + 1) e.set(vx, y, L.voidMarks); }
    if (L.stone) p.line(x0 + 3, y0 + 1, x0 + 5, y1 - 2, dark(skin, 0.6));
  }
  // beard
  if (L.beard && !L.skeleton && !(helm && helm.kind === 'great')) {
    const bc = C(L.hair || '#6a3a1a'), big = L.scale < 0.9;
    const bx0 = side ? x1 - 4 : x0 + 1, bx1 = side ? x1 + 1 : x1 - 1;
    for (let y = eyeY + 2; y <= y1 + (big ? 4 : 1); y++) {
      const shrink = Math.max(0, y - y1 - 1);
      for (let x = bx0 + shrink; x <= bx1 - shrink; x++) p.set(x, y, (x + y) % 3 === 0 ? dark(bc, 0.8) : bc);
    }
    if (!side) p.set(CX - 1, eyeY + 3, dark(bc, 0.6));
  }
  // hair
  if (hairC && !L.skeleton && !(helm && (helm.kind === 'great' || helm.kind === 'hood' || helm.kind === 'coif'))) hair(p, L, x0, y0, x1, y1, eyeY, hairC, view, helm);
  // beast ears on top
  if (L.beastEars && !(helm && helm.kind === 'great')) {
    const ec = hairC || C('#8a6040');
    for (const ex of side ? [x0 + 3] : [x0 + 1, x1 - 3]) {
      for (let k = 0; k < 3; k++) for (let i = 0; i < 3 - k; i++) p.set(ex + i + (k > 0 ? 0 : 0), y0 - k, k === 0 ? ec : light(ec, 1.1));
      if (!up) p.set(ex + 1, y0, mixc(ec, '#e0a0a0', 0.5));
    }
  }
  // horns
  if (L.horns) {
    const hc = C('#2a2420');
    for (const dir of side ? [-1] : [-1, 1]) {
      const hx = dir < 0 ? x0 + 1 : x1 - 1;
      const pts = [[hx, y0], [hx + dir, y0 - 1], [hx + dir * 2, y0 - 2], [hx + dir * 2, y0 - 3], [hx + dir, y0 - 4]];
      for (const [px, py] of pts) p.set(px, py, hc);
      p.set(pts[1][0], pts[1][1], light(hc, 1.6));
    }
  }
  // fins
  if (L.fins) {
    const fc = C(L.finColor);
    for (let k = 0; k < 4; k++) p.set(CX - 1 + (k % 2), y0 - 1 - k, k % 2 ? light(fc) : fc);
    p.set(CX, y0 - 1, fc); p.set(CX - 1, y0 - 2, fc);
    if (!side) { p.set(x0 - 1, eyeY, fc); p.set(x0 - 2, eyeY - 1, light(fc)); p.set(x1 + 1, eyeY, fc); p.set(x1 + 2, eyeY - 1, light(fc)); }
  }
  // treant crown of leaves
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
  // helm
  if (helm) helmet(p, e, L, helm, x0, y0, x1, y1, eyeY, view);
  if (L.crown && !(helm && helm.kind === 'crown')) crown(p, e, x0, y0, x1, '#ffd060');
}

function hair(p, L, x0, y0, x1, y1, eyeY, hc, view, helm) {
  const style = L.hairStyle;
  if (style === 'bald') return;
  const hl = light(hc, 1.3), hd = dark(hc, 0.75);
  const capped = helm && (helm.kind === 'cap' || helm.kind === 'crown');
  const rows = style === 'crop' ? 2 : 3;
  const up = view === 'up', side = view === 'side';
  // crown of hair
  for (let y = y0 - 1; y < y0 + rows; y++) for (let x = x0 - (y > y0 ? 1 : 0); x <= x1 + (y > y0 ? 1 : 0); x++) {
    if (y === y0 - 1 && (x <= x0 + 1 || x >= x1 - 1)) continue;
    p.set(x, y, y === y0 - 1 ? hl : (x + y) % 4 === 0 ? hd : hc);
  }
  if (up) {
    // back of the head fully covered
    for (let y = y0; y <= y1 + (style === 'long' ? 3 : 0); y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
      if (y > y1 && (x < x0 + 1 || x > x1 - 1)) continue;
      p.set(x, y, (x - x0) % 3 === 1 ? hd : hc);
    }
    return;
  }
  if (side) {
    // back half and nape
    for (let y = y0; y <= y1 - 1 + (style === 'long' ? 4 : 0); y++) for (let x = x0 - 1; x <= x0 + 3; x++) p.set(x, y, (y + x) % 3 === 0 ? hd : hc);
    p.set(x1, y0 + rows, hc); p.set(x1 - 1, y0 + rows, hc);       // fringe
    return;
  }
  // bangs (jagged) and sides
  if (!capped) for (let x = x0; x <= x1; x++) if ((x + y0) % 2 === 0 || x === x0 || x === x1) p.set(x, y0 + rows, hc);
  const sideLen = style === 'long' ? y1 + 3 : eyeY;
  for (let y = y0 + rows; y <= sideLen; y++) { p.set(x0 - 1, y, hd); p.set(x0, y, hc); p.set(x1, y, hc); p.set(x1 + 1, y, hd); }
}

function helmet(p, e, L, helm, x0, y0, x1, y1, eyeY, view) {
  const M = C(helm.color || '#9aa4ae'), T = C(helm.trim || '#c8a050');
  const side = view === 'side', up = view === 'up';
  switch (helm.kind) {
    case 'great': {
      for (let y = y0 - 1; y <= y1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
        if ((x === x0 - 1 || x === x1 + 1) && (y === y0 - 1)) continue;
        let c = M;
        if (x === x1 + 1 || y === y1) c = dark(M, 0.75); else if (x === x0 - 1 || y === y0 - 1) c = light(M, 1.2);
        if (!side && !up && x === Math.floor((x0 + x1) / 2)) c = light(M, 1.12);
        p.set(x, y, c);
      }
      if (!up) {
        const sx0 = side ? x1 - 4 : x0 + 1, sx1 = side ? x1 + 1 : x1 - 1;
        for (let x = sx0; x <= sx1; x++) { p.set(x, eyeY, '#0e0a10'); if (helm.glow) e.set(x, eyeY, helm.glow); }
        for (let y = eyeY + 2; y < y1; y += 2) p.set(side ? x1 : Math.floor((x0 + x1) / 2) + 2, y, dark(M, 0.6)); // breaths
      }
      if (helm.crest) for (let k = 0; k < (side ? 6 : 3); k++) { const cx = side ? x0 + 1 + k : Math.floor((x0 + x1) / 2); p.set(cx, y0 - 2 - (side ? 0 : k), T); if (!side) p.set(cx + 1, y0 - 2 - k, light(T)); }
      if (helm.plume) for (let k = 0; k < 6; k++) { const cx = side ? x0 - k + 3 : Math.floor((x0 + x1) / 2); p.set(cx, y0 - 2 - (side ? Math.floor(k / 2) : k), k % 2 ? light(helm.plume) : C(helm.plume)); if (!side) p.set(cx + 1, y0 - 2 - k, dark(helm.plume, 0.8)); }
      break;
    }
    case 'coif': {
      for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
        const inFace = !up && (side ? x >= x1 - 3 : x >= x0 + 2 && x <= x1 - 2) && y >= y0 + 3 && y <= y1 - 1;
        if (inFace) continue;
        if ((x === x0 - 1 || x === x1 + 1) && y === y0 - 1) continue;
        p.set(x, y, (x + y) % 2 ? M : dark(M, 0.8));
      }
      // conical cap with a nasal bar
      for (let x = x0; x <= x1; x++) p.set(x, y0 - 1, light(M, 1.25));
      for (let x = x0 + 2; x <= x1 - 2; x++) p.set(x, y0 - 2, M);
      if (!up && !side) for (let y = y0 + 2; y <= eyeY + 1; y++) p.set(Math.floor((x0 + x1) / 2), y, light(M, 1.1));
      break;
    }
    case 'hood': {
      const c = M, d = dark(M, 0.7);
      for (let y = y0 - 2; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
        if ((x === x0 - 1 || x === x1 + 1) && y <= y0 - 1) continue;
        p.set(x, y, x === x1 + 1 ? d : x === x0 - 1 ? light(c, 1.1) : c);
      }
      p.set(Math.floor((x0 + x1) / 2), y0 - 3, c);
      if (!up) {
        const fx0 = side ? x1 - 3 : x0 + 1, fx1 = side ? x1 + 1 : x1 - 1;
        for (let y = y0 + 3; y <= y1; y++) for (let x = fx0; x <= fx1; x++) p.set(x, y, '#140e14');
        const gl = L.eyes || null;
        const ex = side ? [x1 - 1] : [x0 + 3, x1 - 3];
        for (const xx of ex) { p.set(xx, eyeY, gl || '#6a6058'); if (gl) e.set(xx, eyeY, gl); }
      }
      break;
    }
    case 'cap': {
      for (let y = y0 - 1; y <= y0 + 2; y++) for (let x = x0 - (y > y0 ? 1 : 0); x <= x1 + (y > y0 ? 1 : 0); x++) p.set(x, y, y === y0 - 1 ? light(M, 1.2) : M);
      for (let x = x0 - 1; x <= x1 + 1; x++) p.set(x, y0 + 3, dark(M, 0.75));
      break;
    }
    case 'crown': crown(p, e, x0, y0, x1, helm.color || '#ffc040', helm.gem); break;
  }
}
function crown(p, e, x0, y0, x1, col, gem = '#ff4030') {
  const c = C(col);
  for (let x = x0; x <= x1; x++) { p.set(x, y0, c); p.set(x, y0 - 1, (x - x0) % 2 ? light(c, 1.2) : c); }
  for (const x of [x0, Math.floor((x0 + x1) / 2), x1]) { p.set(x, y0 - 2, c); p.set(x, y0 - 3, light(c, 1.3)); }
  p.set(Math.floor((x0 + x1) / 2), y0, gem); e.set(Math.floor((x0 + x1) / 2), y0, gem);
}
