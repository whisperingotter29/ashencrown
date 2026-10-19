// Hand-built monster designs: the Sundered Coast. See kit.js for the design format and
// docs/BESTIARY.md for the concepts.
import { C, R, PAL, blank, cyl, ramp, pal5, layer, put, blob, tube, horn, slab, facet, wing, drape, ik, stride, sin, cos, lerp, clamp, bez, rot, glow, flame, eyeGlow, eyeBead, eyeBall, teeth, maw, spots, stripes, crack, over, rimLight, tint, toneIdx, light, dark, mixc, hash2, bayer, WHITE, VOID, BONE, BONE_D, MAW, MAW_D, TONGUE, CREAM, INK } from './kit.js';

// ------------------------------------------------------------------ local helpers
const PI = Math.PI;
const LX = -0.48, LY = -0.62, LZ = 0.62;   // the kit's light direction (top-left, toward the viewer)

// A solid of revolution whose axis lies in the picture plane (bells, conches, towers, lanterns,
// helmets). The axis starts at (x0, y0) and runs len px at angle ang (PI/2 = straight down);
// prof(v) is the radius in px at v = 0..1 along it. Lit as a real surface from the top-left.
// o.paint(v, nb, t, x, y) may return a tone index (0..4) or a colour to override a pixel
// (bands, stripes, patterns); nb is the across-axis position -1..1 (negative = the perp side).
function lathe(L, x0, y0, ang, len, prof, Rm, o = {}) {
  const dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx;
  let rmax = 0;
  for (let k = 0; k <= 24; k++) rmax = Math.max(rmax, prof(k / 24));
  const ex = [x0, x0 + dx * len], ey = [y0, y0 + dy * len];
  const bx0 = Math.floor(Math.min(...ex) - rmax - 1), bx1 = Math.ceil(Math.max(...ex) + rmax + 1);
  const by0 = Math.floor(Math.min(...ey) - rmax - 1), by1 = Math.ceil(Math.max(...ey) + rmax + 1);
  const eps = 0.02;
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
    const qx = x + 0.5 - x0, qy = y + 0.5 - y0;
    const a = qx * dx + qy * dy, b = qx * px + qy * py, v = a / len;
    if (v < 0 || v > 1) continue;
    const r = prof(v);
    if (r <= 0.3 || Math.abs(b) > r) continue;
    const nb = b / r, nz = Math.sqrt(Math.max(0, 1 - nb * nb));
    const rp = (prof(Math.min(1, v + eps)) - prof(Math.max(0, v - eps))) / (2 * eps * len);
    const s = Math.sqrt(1 + rp * rp);
    const nsx = (nb * px - rp * dx) / s, nsy = (nb * py - rp * dy) / s;
    const l = nsx * LX + nsy * LY + (nz / s) * LZ + (o.lift || 0);
    let t = toneIdx(l);
    if (o.matte && t === 4) t = 3;
    let c = Rm[t];
    if (o.paint) { const q = o.paint(v, nb, t, x, y); if (typeof q === 'number') c = Rm[clamp(q, 0, 4)]; else if (q) c = C(q); }
    L.set(x, y, c);
  }
  return L;
}
// a filled ellipse rotated by a (radians); with th > 0 only a ring th px thick
function ellR(L, cx, cy, rx, ry, a, c, th = 0) {
  const ca = Math.cos(a), sa = Math.sin(a), m = Math.max(rx, ry) + 1, cc = C(c);
  for (let y = Math.floor(cy - m); y <= cy + m; y++) for (let x = Math.floor(cx - m); x <= cx + m; x++) {
    const qx = x + 0.5 - cx, qy = y + 0.5 - cy, ux = qx * ca + qy * sa, uy = -qx * sa + qy * ca;
    if ((ux / rx) ** 2 + (uy / ry) ** 2 > 1) continue;
    if (th > 0 && (ux / Math.max(0.5, rx - th)) ** 2 + (uy / Math.max(0.5, ry - th)) ** 2 < 1) continue;
    L.set(x, y, cc);
  }
  return L;
}
// a sea bubble: a pale ring with a glint (fades into the emissive pass when glow is set)
function bubble(F, x, y, r, c = '#a8d0ec', glowIt = false) {
  x = R(x); y = R(y);
  if (r < 1.2) { F.p.set(x, y, C(c)); F.p.set(x - 1, y - 1, WHITE); return; }
  F.p.ring(x, y, r, C(c), 1); F.p.set(R(x - r * 0.4), R(y - r * 0.4), WHITE);
  if (glowIt) F.e.ring(x, y, r, C(c), 1);
}
// a barnacle: a little cream volcano with a dark pore, at (x, y) of radius r
function barnacle(L, x, y, r, seed = 1) {
  const B = pal5('sand', 6);
  L.disc(x, y, r, B[2]);
  L.disc(x - r * 0.25, y - r * 0.25, r * 0.7, B[4]);
  if (r >= 1.5) L.disc(x + r * 0.1, y, Math.max(0.6, r * 0.38), C('#2a1838'));
  else L.set(R(x), R(y), C('#2a1838'));
  if (hash2(seed, 3, 9) > 0.5 && r >= 1.5) L.set(R(x - r * 0.6), R(y + r * 0.3), B[1]);
  return L;
}
// a fringe of hanging kelp strands from (x, y) along a, swaying with phase t
function kelp(L, x, y, len, w, n, t, Rm, o = {}) {
  for (let k = 0; k < n; k++) {
    const f = n === 1 ? 0.5 : k / (n - 1), sx = x + (f - 0.5) * (o.spread ?? w * n * 0.8), l = len * (0.7 + hash2(k, 5, o.seed || 1) * 0.5);
    const sw = Math.sin((t + k * 0.23) * PI * 2) * w * 0.9, lean = o.lean || 0;
    tube(L, bez([[sx, y], [sx + lean * 0.4 + sw * 0.5, y + l * 0.5], [sx + lean + sw, y + l]]), (q) => w * 0.5 * (1 - q * 0.6), k % 2 ? Rm.map((c) => dark(c, 0.88)) : Rm, { matte: true });
  }
  return L;
}

// a conch: a spindle shell along the axis from the spire tip (x0, y0) at angle ang, len px long and
// rw px at its widest. Stepped spire whorls, a knobbed shoulder, brown zigzag bands. Returns a
// point helper at(v, b) along the shell (b > 0 on the perp side). o.lip: -1 or 1 draws the flared
// rose aperture lip on that side.
function conch(L, x0, y0, ang, len, rw, o = {}) {
  const SH = o.ramp || pal5('sand', 5).map((c, i) => mixc(c, PAL.clay[i + 2], 0.25)), BR = pal5('clay', 4), RO = pal5('rose', 5);
  const prof = (v) => {
    if (v < 0.4) { const b = rw * Math.pow(v / 0.4, 0.85), f = (v / 0.075) % 1; return b * (0.84 + 0.16 * f); }
    if (v < 0.52) return rw;
    return rw * (1 - Math.pow((v - 0.52) / 0.48, 1.3) * 0.86);
  };
  const dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx;
  const at = (v, b) => [x0 + dx * len * v + px * b, y0 + dy * len * v + py * b];
  const S = blank(L);
  lathe(S, x0, y0, ang, len, prof, SH, {
    paint: (v, nb, t, x, y) => {
      if (v < 0.4 && ((v / 0.075) % 1) < 0.14) return Math.max(0, t - 2);
      if (v >= 0.42 && v < 0.95 && Math.floor(v * 11 + Math.abs(Math.sin(nb * 5)) * 0.35 + (o.seed || 0)) % 2 === 0) return t >= 3 ? BR[3] : t >= 2 ? BR[2] : BR[1];
      return undefined;
    },
  });
  // knobs along the shoulder on the far side
  for (let k = 0; k < 4; k++) {
    const v = 0.36 + k * 0.06, r = prof(v), root = at(v, -(o.lip || 1) * r * 0.8), tip = at(v - 0.02, -(o.lip || 1) * (r + rw * 0.32));
    horn(S, root, at(v, -(o.lip || 1) * (r + rw * 0.2)), tip, rw * 0.32, SH);
  }
  put(L, S, true);
  if (o.lip) {
    // the flared, glossy aperture lip
    const sg = o.lip, A = blank(L);
    const pts = [at(0.44, sg * rw * 0.6), at(0.5, sg * rw * 1.5), at(0.66, sg * rw * 1.62), at(0.84, sg * rw * 1.2), at(1.0, sg * rw * 0.3), at(0.9, 0), at(0.6, sg * rw * 0.4)];
    A.poly(pts, RO[3]);
    cyl(A, RO, { wide: true });
    const inner = [at(0.52, sg * rw * 1.1), at(0.66, sg * rw * 1.25), at(0.82, sg * rw * 0.9), at(0.9, sg * rw * 0.3), at(0.62, sg * rw * 0.5)];
    A.poly(inner, RO[1]);
    A.line(...at(0.56, sg * rw * 1.15), ...at(0.7, sg * rw * 1.2), RO[4]);
    put(L, A, true);
  }
  return at;
}
// a five-armed starfish of radius r at (x, y), turned by a
function starfish(L, x, y, r, a, Rm) {
  const pts = [];
  for (let k = 0; k < 10; k++) { const aa = a + k * PI / 5 - PI / 2, rr = k % 2 ? r * 0.42 : r; pts.push([x + Math.cos(aa) * rr, y + Math.sin(aa) * rr]); }
  const S = blank(L);
  S.poly(pts, Rm[3]); cyl(S, Rm);
  S.set(R(x), R(y), Rm[4]);
  return put(L, S, true);
}

// enemy id -> { design, name, body? }: folded into src/data/enemies.js at integration
export const assign = {
  tidecrab: { design: 'bellcrab', name: 'Bellcrab' },
  drowned_sailor: { design: 'drowned_diver', name: 'Drowned Diver' },
  sea_hag: { design: 'conch_hag', name: 'Conch Hag' },
};

export default {
  // Bellcrab (tidecrab): a hermit crab that has moved into a sunken ship's bell. The green-bronze
  // bell is the silhouette; it leans back so the crab can peer out of the mouth past the clapper.
  // It rings when it strikes and when it is struck.
  bellcrab: {
    view: 'side', box: [27, 19], pivot: 0.46, idleFps: 4, scale: 1.1,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle', A1 = P.atk === 1, A2 = P.atk === 2, hurt = P.hurt;
      const BZ = pal5('gold', 4).map((c, i) => mixc(c, PAL.wood[i + 1], 0.3)), BZd = BZ.map((c) => dark(c, 0.78)), VG = pal5('teal', 5);
      const CR = pal5('red', 5), CRd = CR.map((c) => dark(c, 0.78)), EYE = pal5('sand', 6);
      const bob = run ? -Math.abs(Math.sin(t * PI * 2)) * 0.8 * u : idle ? sin(t) * 0.2 * u : 0;
      // the bell lies on its side, mouth forward, and rocks as the crab hauls it
      const ang = 0.1 + (idle ? sin(t) * 0.03 : run ? sin(t * 2) * 0.07 : A1 ? -0.14 : A2 ? 0.1 : hurt ? -0.2 : 0);
      const dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx;
      const blen = 12 * u, W = 7 * u;
      const mc = [ox + 2.6 * u + (A2 ? 0.8 * u : A1 ? -0.6 * u : 0), oy - 7.8 * u + bob - (hurt ? 0.6 * u : 0)];   // centre of the mouth
      const top = [mc[0] - dx * blen, mc[1] - dy * blen];
      const at = (v, b) => [top[0] + dx * blen * v + px * b, top[1] + dy * blen * v + py * b];   // b > 0: the bell's underside
      const L = layer(F);
      // two pairs of walking legs from under the bell: arched, pointed pale tips
      const legs = (far) => {
        const Lg = layer(F), Rl = far ? CRd : CR;
        for (let k = 0; k < 2; k++) {
          const hip = at(0.86 - k * 0.22, W * 0.5);
          if (far) hip[0] += 1.2 * u;
          const ph = run ? t + k * 0.5 + (far ? 0.25 : 0) : 0;
          const [sx, lift] = stride(ph, 3 * u, 1.6 * u);
          const out = k === 0 ? 3.6 : -3;
          const foot = [hip[0] + out * u + sx, oy - lift];
          const knee = ik(hip, foot, 2.8 * u, 3 * u, k === 0 ? -1 : 1);
          tube(Lg, [hip, knee], [1.2 * u, 1 * u], Rl);
          tube(Lg, [knee, foot], [1 * u, 0.35 * u], Rl);
          Lg.set(R(knee[0]), R(knee[1] - 0.6 * u), Rl[4]);
          Lg.set(R(foot[0]), R(foot[1] - 1), C(CREAM));
        }
        put(L, Lg, !far);
      };
      legs(true);
      // the bell: domed crown, straight waist, flared sound bow; cast bands, verdigris, a cream glint
      const prof = (v) => {
        if (v < 0.22) return W * 0.56 * Math.sqrt(1 - ((0.22 - v) / 0.22) ** 2);
        if (v < 0.42) return W * 0.56;
        if (v < 0.94) { const f = (v - 0.42) / 0.52; return W * (0.56 + 0.4 * f * f); }
        return W * (0.96 + 0.04 * Math.sqrt((v - 0.94) / 0.06));
      };
      const Bl = layer(F);
      lathe(Bl, top[0], top[1], ang, blen, prof, BZ, {
        paint: (v, nb, tn) => {
          if (v > 0.24 && v < 0.28) return Math.min(4, tn + 1);
          if (v >= 0.28 && v < 0.31) return Math.max(0, tn - 1);
          if (v > 0.86 && v < 0.9) return Math.min(4, tn + 1);
          if (v >= 0.9 && v < 0.93) return Math.max(0, tn - 1);
          if (nb > -0.62 && nb < -0.44 && v > 0.12 && v < 0.84) return tn >= 3 ? CREAM : Math.min(4, tn + 1);
          return undefined;
        },
      });
      // verdigris crust, heaviest on the shaded underside; barnacles on the belly
      spots(Bl, ...at(0.58, W * 0.48), blen * 0.3, W * 0.22, 6, 1 * u, VG[2], 4);
      spots(Bl, ...at(0.45, W * 0.5), blen * 0.2, W * 0.12, 3, 0.7 * u, VG[3], 7);
      spots(Bl, ...at(0.16, W * 0.3), blen * 0.1, W * 0.2, 2, 0.8 * u, VG[2], 11);
      barnacle(Bl, ...at(0.36, W * 0.46), 0.8 * u, 1);
      barnacle(Bl, ...at(0.5, W * 0.56), 0.7 * u, 2);
      // canon: the hanging loop on the crown
      const cn = at(0.0, 0);
      tube(Bl, bez([[cn[0] + 0.4 * u, cn[1] - 1.3 * u], [cn[0] - 2.6 * u, cn[1] - 1.6 * u], [cn[0] - 2.6 * u, cn[1] + 1.4 * u], [cn[0] + 0.4 * u, cn[1] + 1.1 * u]]), 0.75 * u, BZd, { matte: true });
      put(L, Bl, true);
      // the mouth seen a little from the front: dark inside, the clapper hanging in it
      ellR(L, mc[0], mc[1], W * 0.34, W * 0.98, ang, '#2a1838');
      const swing = idle ? sin(t + 0.25) * 0.5 * u : run ? sin(t * 2) * 0.9 * u : A2 ? 1.2 * u : hurt ? -1 * u : 0;
      blob(L, [[mc[0] - 0.4 * u + swing * 0.4, mc[1] + 4.4 * u, 0.9 * u, 0.9 * u]], BZd);
      // the crab peering out: carapace front with mouthparts, eyestalks leaning out past the lip
      const hd = [mc[0] + 0.9 * u, mc[1] + 0.2 * u];
      const Hd = layer(F);
      blob(Hd, [[hd[0], hd[1], 1.6 * u, 1.9 * u]], CR, { tex: 3 });
      Hd.line(hd[0] + 1 * u, hd[1] + 0.8 * u, hd[0] + 1.3 * u, hd[1] + 1.8 * u, CR[1]);
      Hd.line(hd[0] + 0.2 * u, hd[1] + 1.1 * u, hd[0] + 0.4 * u, hd[1] + 2 * u, CR[1]);
      const look = hurt ? -0.8 : A1 ? 0.6 : 0, twitch = idle && P.i === 2 ? -0.8 * u : 0;
      const stalks = [[hd[0] + 0.2 * u, 6.2 * u + twitch, 1.4], [hd[0] + 1.2 * u, 4.6 * u, 2.6]];
      const eyes = [];
      for (const [sx, h, lean] of stalks) {
        const hh = hurt ? h * 0.5 : h;
        const tip = [sx + (lean + look) * u * (hurt ? 0.4 : 1), hd[1] - 1 * u - hh];
        tube(Hd, bez([[sx, hd[1] - 1 * u], [sx + 0.2 * u, hd[1] - 1 * u - hh * 0.6], tip]), [0.6 * u, 0.5 * u], CR);
        blob(Hd, [[tip[0], tip[1], 1.15 * u, 1.25 * u]], EYE);
        eyes.push(tip);
      }
      put(L, Hd, true);
      // the bronze lip ring over the crab's body, open where the eyestalks cross it
      const Rg = layer(F);
      ellR(Rg, mc[0], mc[1], W * 0.4, W * 1.0, ang, BZ[1], 1.4 * u);
      ellR(Rg, mc[0] - 0.3 * u, mc[1] - 0.3 * u, W * 0.36, W * 0.95, ang, BZ[4], 0.9 * u);
      for (let y = 0; y < Rg.h; y++) for (let x = 0; x < Rg.w; x++) if (Rg.a(x, y) && Hd.a(x, y) && y < hd[1] - 1.6 * u) Rg.clear(x, y);
      put(L, Rg, false);
      // the small claw, low
      const Sc = layer(F), sc = [hd[0] + 2.6 * u, hd[1] + 3.6 * u + (A2 ? 0.4 * u : 0)];
      tube(Sc, [[hd[0] + 0.4 * u, hd[1] + 1.8 * u], sc], [0.8 * u, 0.7 * u], CRd);
      blob(Sc, [[sc[0] + 0.5 * u, sc[1], 1.2 * u, 0.9 * u]], CRd);
      horn(Sc, [sc[0] + 1.3 * u, sc[1] - 0.3 * u], [sc[0] + 2.2 * u, sc[1] - 0.7 * u], [sc[0] + 2.6 * u, sc[1] + 0.1 * u], 0.9 * u, CRd);
      put(L, Sc, true);
      // the crusher claw: rests forward at the lip, raised gaping on the wind-up, slammed down on the strike
      const sh = [hd[0] + 0.6 * u, hd[1] + 1 * u];
      const wr = A1 ? [sh[0] + 2 * u, sh[1] - 5.4 * u] : A2 ? [sh[0] + 5.4 * u, sh[1] + 3.2 * u] : hurt ? [sh[0] + 1.2 * u, sh[1] - 2.6 * u] : [sh[0] + 2.8 * u, sh[1] + 0.4 * u + (idle ? sin(t) * 0.3 * u : run ? sin(t * 2) * 0.5 * u : 0)];
      const ca = A1 ? -0.55 : A2 ? 0.35 : hurt ? -1.5 : -0.2;
      const el = ik(sh, wr, 2.2 * u, 2.6 * u, 1);
      const Cw = layer(F);
      tube(Cw, [sh, el], [1.1 * u, 1 * u], CR);
      tube(Cw, [el, wr], [1 * u, 1.1 * u], CR);
      const fw = [Math.cos(ca), Math.sin(ca)], nw = [-fw[1], fw[0]];
      const P0 = (a, b) => [wr[0] + fw[0] * a * u + nw[0] * b * u, wr[1] + fw[1] * a * u + nw[1] * b * u];
      const gape = A1 ? 0.9 : A2 ? 0.05 : hurt ? 0.6 : idle && P.i === 1 ? 0.45 : 0.22;
      const fx0 = P0(2.8, 0.6), fx1 = P0(5, 0.7), fxc = P0(4, 1.2);
      horn(Cw, fx0, fxc, fx1, 1.7 * u, CRd);
      const da = ca - gape, dfw = [Math.cos(da), Math.sin(da)], dnw = [-dfw[1], dfw[0]];
      const d0 = P0(2.6, -0.6), D = (a, b) => [d0[0] + dfw[0] * a * u + dnw[0] * b * u, d0[1] + dfw[1] * a * u + dnw[1] * b * u];
      horn(Cw, d0, D(1.5, -0.5), D(2.7, 0.5), 1.7 * u, CR);
      const pc = P0(1.6, 0), Pm = layer(F);
      blob(Pm, [[pc[0], pc[1], 2.1 * u, 1.7 * u]], CR, { tex: 5 });
      over(Pm, ...P0(1.2, -1), CR[4]); over(Pm, ...P0(2, -1.1), CR[4]); over(Pm, ...P0(0.4, -0.8), CR[4]);
      put(Cw, Pm, true);
      over(Cw, ...D(2.1, 0.3), CREAM); over(Cw, fx1[0] - fw[0] * 0.6 * u, fx1[1] - fw[1] * 0.6 * u, CREAM);
      put(L, Cw, true);
      legs(false);
      put(F.p, L, false);
      // bead eyes, squeezed shut when hurt
      for (const e of eyes) {
        if (hurt) F.p.line(R(e[0] - 0.8 * u), R(e[1] - 0.2 * u), R(e[0] + 0.6 * u), R(e[1] + 0.4 * u), C('#1d0814'));
        else eyeBead(F.p, e[0] - 0.1 * u, e[1] - 0.5 * u, Math.max(1, R(1.1 * u)));
      }
      // the bell rings: cream arcs over its back on the strike and the hit
      if (A2 || hurt) {
        const c0 = at(0.4, 0), rr = W * 0.95;
        for (let k = 0; k < 2; k++) for (let a = PI * 1.12; a <= PI * 1.55; a += 0.05) F.p.set(R(c0[0] + Math.cos(a) * (rr + k * 2.2 * u)), R(c0[1] + Math.sin(a) * (rr + k * 2.2 * u)), C(k ? '#e2c494' : CREAM));
      }
    },
  },
  // Drowned Diver (drowned_sailor): a sailor's corpse in a copper diving helmet flooded with sea
  // water. The real occupant is the little fish swimming behind the faceplate: its eye is the only
  // light in there. Barnacled shoulders, a cut air hose leaking bubbles, a rusted anchor for a club.
  drowned_diver: {
    view: 'side', box: [24, 28], pivot: 0.5, idleFps: 3, scale: 0.92,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle', A1 = P.atk === 1, A2 = P.atk === 2, hurt = P.hurt;
      const CU = pal5('gold', 5).map((c, i) => mixc(c, PAL.red[i + 1], 0.42)), CUd = CU.map((c) => dark(c, 0.8));
      const SU = pal5('teal', 5), SUd = SU.map((c) => dark(c, 0.8));
      const LD = pal5('stone', 5), RU = pal5('wood', 5).map((c, i) => mixc(c, PAL.clay[i], 0.3));
      const WA = pal5('water', 6), VG = pal5('teal', 5);
      const step = run ? sin(t) : 0;
      const bob = run ? -Math.abs(cos(t)) * 0.8 * u : idle ? sin(t) * 0.3 * u : 0;
      const lean = A1 ? -1.2 * u : A2 ? 1.6 * u : hurt ? -1.4 * u : run ? 0.6 * u : 0;
      const hipY = oy - 9.2 * u + bob, hipX = ox;
      const chest = [hipX + lean * 0.6, hipY - 4.6 * u];
      const hc = [hipX + lean + 1 * u, hipY - 11.8 * u + (hurt ? 0.6 * u : 0)], hr = 5.4 * u;   // helmet centre
      const L = layer(F);
      // legs: baggy canvas trousers into lead boots
      const leg = (far) => {
        const Lg = layer(F), Rs = far ? SUd : SU, Rb = far ? LD.map((c) => dark(c, 0.8)) : LD;
        const hip = [hipX + (far ? 1.2 * u : -0.8 * u), hipY];
        const ph = far ? t + 0.5 : t;
        const [sx, lift] = run ? stride(ph, 5 * u, 1.8 * u) : [A2 ? (far ? 2 * u : -2.4 * u) : A1 ? (far ? 1.2 * u : -1 * u) : 0, 0];
        const foot = [hip[0] + sx + 0.4 * u, oy - 1.4 * u - lift];
        const knee = ik(hip, foot, 4.4 * u, 4.2 * u, -1);
        tube(Lg, [hip, knee, foot], [2.2 * u, 1.8 * u], Rs, { tex: 5 });
        slab(Lg, [[foot[0] - 2 * u, foot[1] - 1.2 * u], [foot[0] + 2.2 * u, foot[1] - 1.2 * u], [foot[0] + 3 * u, foot[1] + 1.4 * u], [foot[0] - 2.2 * u, foot[1] + 1.4 * u]], Rb, { wide: true });
        Lg.line(foot[0] - 2 * u, foot[1] - 0.2 * u, foot[0] + 2.4 * u, foot[1] - 0.2 * u, Rb[1]);
        put(L, Lg, !far);
      };
      // the anchor: ring, stock, shank, curved arms with spade flukes
      const anchor = (Lr, hand, a) => {
        const d = [Math.cos(a), Math.sin(a)], n = [-d[1], d[0]];
        const Q = (k, m) => [hand[0] + d[0] * k * u + n[0] * m * u, hand[1] + d[1] * k * u + n[1] * m * u];
        const A = layer(F);
        tube(A, [Q(-1.2, 0), Q(8.4, 0)], 0.8 * u, RU, { tex: 2 });
        tube(A, [Q(0.6, -2.4), Q(0.6, 2.4)], 0.6 * u, RU);
        A.ring(...Q(-1.9, 0), 1.1 * u, RU[1], Math.max(1, R(0.6 * u)));
        tube(A, bez([Q(8.4, 0), Q(8.6, -3.6), Q(5.6, -4.4)]), [0.8 * u, 0.5 * u], RU);
        tube(A, bez([Q(8.4, 0), Q(8.6, 3.6), Q(5.6, 4.4)]), [0.8 * u, 0.5 * u], RU);
        for (const sg of [-1, 1]) facet(A, [Q(6.8, sg * 3.6), Q(4.8, sg * 5.4), Q(5.2, sg * 3.2)], RU[3]);
        spots(A, ...Q(5, 0), 4 * u, 3 * u, 4, 0.7 * u, RU[1], 3);
        put(Lr, A, true);
      };
      // far arm: a mitt hanging, swinging opposite the near leg
      {
        const Ar = layer(F), sh = [chest[0] + 1.6 * u, chest[1] - 1.6 * u];
        const hand = A1 ? [sh[0] + 3 * u, sh[1] + 2 * u] : A2 ? [sh[0] + 4.4 * u, sh[1] + 3.2 * u] : [sh[0] + 1.2 * u - step * 1.6 * u, sh[1] + 6 * u];
        const el = ik(sh, hand, 3.4 * u, 3.4 * u, -1);
        tube(Ar, [sh, el, hand], [1.8 * u, 1.5 * u], SUd);
        blob(Ar, [[hand[0], hand[1], 1.3 * u, 1.3 * u]], CUd);
        put(L, Ar, false);
      }
      leg(true);
      // the cut air hose: from the back of the helmet, coiling down behind, a frayed end
      const hose = layer(F), hz = idle ? sin(t) * 0.6 * u : run ? sin(t) * 1.2 * u : 0;
      const hEnd = [hc[0] - 8 * u + hz, hipY + 1 * u];
      tube(hose, bez([[hc[0] - 4 * u, hc[1] + 1 * u], [hc[0] - 9 * u, hc[1] + 2 * u], [hc[0] - 4 * u, hipY - 2 * u], hEnd]), 0.9 * u, pal5('stone', 6), { rings: Math.max(2, R(1.4 * u)) });
      put(L, hose, false);
      // torso: a bulky canvas suit with a copper corselet; barnacles on the shoulders
      const T = layer(F);
      blob(T, [[chest[0], chest[1], 4.4 * u, 4.4 * u], [hipX + lean * 0.3, hipY - 1 * u, 3.8 * u, 2.8 * u]], SU, { tex: 4 });
      for (let k = 0; k < 3; k++) over(T, chest[0] - 2 * u + k * 1.6 * u, chest[1] + 2.6 * u, SU[1]);
      T.line(hipX - 3 * u + lean * 0.3, hipY - 1.2 * u, hipX + 3.4 * u + lean * 0.3, hipY - 1.6 * u, LD[1], Math.max(1, R(0.9 * u)));
      put(L, T, true);
      leg(false);
      // corselet: the copper breastplate the helmet bolts on to, with bolt heads
      const Co = layer(F);
      ellR(Co, hc[0] - 0.4 * u, hc[1] + hr * 0.82, hr * 1.05, 2.6 * u, -0.08, CU[3]);
      slab(Co, [[hc[0] - 5.4 * u, hc[1] + hr * 0.6], [hc[0] + 4.8 * u, hc[1] + hr * 0.5], [hc[0] + 4 * u, hc[1] + hr * 1.3], [hc[0] - 5 * u, hc[1] + hr * 1.4]], CU, { wide: true });
      for (let k = 0; k < 4; k++) { const bx = hc[0] - 4.2 * u + k * 2.6 * u, by = hc[1] + hr * 1.05 - k * 0.12 * u; Co.set(R(bx), R(by), CU[4]); Co.set(R(bx + 1), R(by + 1), CU[1]); }
      barnacle(Co, hc[0] - 4 * u, hc[1] + hr * 0.7, 1.1 * u, 1);
      barnacle(Co, hc[0] - 2.4 * u, hc[1] + hr * 0.62, 0.8 * u, 2);
      put(L, Co, true);
      // the helmet: a copper sphere, a side port, a front faceplate full of water
      const Hm = layer(F);
      blob(Hm, [[hc[0], hc[1], hr, hr * 0.98]], CU);
      spots(Hm, hc[0] - 1 * u, hc[1] + 2.6 * u, hr * 0.6, hr * 0.3, 5, 0.8 * u, VG[2], 5);
      spots(Hm, hc[0] - 3 * u, hc[1] - 2 * u, hr * 0.3, hr * 0.3, 2, 0.6 * u, VG[3], 8);
      // a bolted seam band round the crown
      for (let a = -2.6; a <= -0.4; a += 0.07) over(Hm, hc[0] + Math.cos(a) * hr * 0.8, hc[1] + Math.sin(a) * hr * 0.8, CU[2]);
      for (let a = -2.4; a <= -0.6; a += 0.45) over(Hm, hc[0] + Math.cos(a) * hr * 0.8, hc[1] + Math.sin(a) * hr * 0.8 - 1, CU[4]);
      // side port with a grille (the back of the helmet)
      const sp = [hc[0] - 2.4 * u, hc[1] - 0.2 * u];
      Hm.disc(sp[0], sp[1], 1.7 * u, CU[1]); Hm.disc(sp[0], sp[1], 1.1 * u, WA[1]);
      Hm.line(sp[0] - 1 * u, sp[1], sp[0] + 1 * u, sp[1], CU[3]);
      barnacle(Hm, hc[0] - 3.6 * u, hc[1] - 3 * u, 1 * u, 3);
      put(L, Hm, true);
      // faceplate: a thick copper rim, murky water inside, the fish, a crack when hurt
      const fp = [hc[0] + hr * 0.62, hc[1] + 0.3 * u], fr = 3.2 * u;
      const Fp = layer(F);
      Fp.disc(fp[0], fp[1], fr + 1 * u, CU[2]);
      Fp.disc(fp[0] - 0.3 * u, fp[1] - 0.3 * u, fr + 0.6 * u, CU[4]);
      Fp.disc(fp[0] + 0.2 * u, fp[1] + 0.2 * u, fr + 0.4 * u, CU[1]);
      Fp.disc(fp[0], fp[1], fr, WA[2]);
      Fp.ellipse(fp[0] + 0.5 * u, fp[1] + 0.8 * u, fr * 0.8, fr * 0.7, WA[1]);
      // murk drifting in the water
      Fp.set(R(fp[0] - fr * 0.5), R(fp[1] + fr * 0.45), WA[3]); Fp.set(R(fp[0] + fr * 0.3), R(fp[1] + fr * 0.6), WA[3]);
      // a glint across the glass
      Fp.line(fp[0] - fr * 0.6, fp[1] - fr * 0.2, fp[0] - fr * 0.2, fp[1] - fr * 0.6, WA[4]);
      put(L, Fp, true);
      // near arm with the anchor: dragged low, swung up over the shoulder, smashed down
      const sh = [chest[0] - 0.6 * u, chest[1] - 1.4 * u];
      const hand = A1 ? [sh[0] - 3.4 * u, sh[1] - 4.6 * u] : A2 ? [sh[0] + 6 * u, sh[1] + 2.4 * u] : hurt ? [sh[0] - 0.6 * u, sh[1] + 4.6 * u] : [sh[0] + 3.4 * u + step * 0.8 * u, sh[1] + 5 * u];
      const aa = A1 ? -2.2 : A2 ? 0.95 : hurt ? 1.75 : run ? 1.2 + step * 0.12 : 1.25 + (idle ? sin(t) * 0.03 : 0);
      if (!A1 && !A2) anchor(L, hand, aa);
      const Ar = layer(F);
      const el = ik(sh, hand, 3.6 * u, 3.6 * u, A1 ? 1 : -1);
      tube(Ar, [sh, el, hand], [2.2 * u, 1.7 * u], SU, { tex: 6 });
      blob(Ar, [[sh[0], sh[1], 2.4 * u, 2.2 * u]], SU);
      barnacle(Ar, sh[0] - 0.6 * u, sh[1] - 1.2 * u, 0.9 * u, 4);
      blob(Ar, [[hand[0], hand[1], 1.5 * u, 1.4 * u]], CU);
      put(L, Ar, true);
      if (A1 || A2) anchor(L, hand, aa);
      put(F.p, L, false);
      // the fish: swims a loop behind the glass; startled flat against it when hit
      const fpos = hurt ? [0.9, -0.6] : A1 ? [0.5, -0.4] : A2 ? [1.1, 0.1] : [[0.2, -0.3], [0.6, -0.5], [0.3, 0.0], [-0.1, -0.2]][P.i % 4];
      const fdir = hurt ? -1 : idle && (P.i === 3) ? -1 : 1;
      const fx = fp[0] + fpos[0] * fr * 0.6, fy = fp[1] + fpos[1] * fr * 0.6;
      const FI = pal5('ember', 5);
      F.p.ellipse(fx, fy, 1.5 * u, 0.9 * u, FI[3]);
      F.p.poly([[fx - fdir * 1.2 * u, fy], [fx - fdir * 2.6 * u, fy - 1 * u], [fx - fdir * 2.4 * u, fy + 1 * u]], FI[2]);
      F.p.set(R(fx - fdir * 0.4 * u), R(fy + 0.5 * u), FI[1]);
      const ex = R(fx + fdir * 0.6 * u), ey = R(fy - 0.3 * u);
      F.p.set(ex, ey, C(o.c3)); F.e.set(ex, ey, C(o.c3));
      if (u >= 1.3) { F.p.set(ex + fdir, ey, C(o.c3)); F.e.set(ex + fdir, ey, C(o.c3)); }
      if (hurt) crack(F.p, fp[0] + fr * 0.2, fp[1] - fr * 0.7, 1.9, fr * 1.4, '#a8d0ec', 5);
      // bubbles: from the faceplate seal and the cut hose, a different trail every frame
      const bs = [[fp[0] + fr * 0.9, fp[1] - fr - 1 * u], [hEnd[0], hEnd[1] - 1.5 * u]];
      for (let k = 0; k < 3; k++) {
        const [bx, by] = bs[k % 2], ph = (P.i * 0.37 + k * 0.29) % 1;
        bubble(F, bx + Math.sin((ph + k) * 6) * 0.8 * u, by - ph * 6 * u, k === 0 ? 1.1 * u : 0.7 * u);
      }
      if (hurt) for (let k = 0; k < 4; k++) bubble(F, fp[0] + (k - 1) * 1.6 * u, fp[1] - fr - (2 + k % 2) * u, 0.8 * u);
    },
  },
  // Conch Hag (sea_hag): a crone who is half sea-snail. She has no legs, only a broad grey snail's
  // foot that glides her along, and her house is a huge knobbed conch on her back with a rose
  // lip. Kelp hair, one huge sea-glass eye, a starfish brooch. She cups a swirling tide in her
  // webbed hand and throws it.
  conch_hag: {
    view: 'side', box: [26, 26], pivot: 0.5, idleFps: 3,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle', A1 = P.atk === 1, A2 = P.atk === 2, hurt = P.hurt;
      const SK = pal5('moss', 5).map((c, i) => mixc(c, PAL.sand[i + 2], 0.35)), SW = pal5('teal', 4), KE = pal5('green', 5);
      const ripple = run ? t : idle ? t * 0.5 : 0;
      const lean = A1 ? -1.6 * u : A2 ? 2 * u : hurt ? -1.8 * u : run ? 0.8 * u : 0;
      const breathe = idle ? sin(t) * 0.3 * u : 0;
      const L = layer(F);
      // the snail foot: a low fleshy slab along the ground, rippling as it glides
      const Ft = layer(F);
      const fl = [];
      for (let k = 0; k <= 12; k++) {
        const f = k / 12, x = ox - 10 * u + f * 17 * u, h = (f < 0.85 ? 1.8 + f * 1.6 : 3.2 - (f - 0.85) * 14) * u;
        fl.push([x, oy - 0.2 * u - h - Math.max(0, Math.sin((f * 3 - ripple) * PI * 2)) * (run ? 0.7 * u : 0.25 * u)]);
      }
      Ft.poly([[ox - 11 * u, oy], ...fl, [ox + 7.6 * u, oy]], SK[3]);
      cyl(Ft, SK, { wide: true });
      for (let k = 1; k < 5; k++) over(Ft, ox - 9 * u + k * 3.2 * u - (ripple % 1) * 3.2 * u, oy - 1.4 * u, SK[1]);
      for (let x = R(ox - 10 * u); x < ox + 7 * u; x++) over(Ft, x, R(oy - 0.6 * u), SK[0]);
      put(L, Ft, false);
      // the conch house along her back: spire back and up, knobs on top, rose lip flaring down
      const cAng = 0.42 + (A1 ? -0.1 : A2 ? 0.06 : hurt ? -0.06 : 0) + (idle ? sin(t) * 0.02 : 0);
      conch(L, ox - 12.6 * u + lean * 0.3, oy - 18.4 * u + breathe + (A1 ? 0.6 * u : 0), cAng, 17 * u, 5 * u, { lip: 1 });
      // her body rises from the front of the foot: hunched, a fishing-net shawl
      const hip = [ox + 3.4 * u, oy - 3 * u];
      const nape = [ox + 3.4 * u + lean, oy - 13.6 * u + breathe];
      const B = layer(F);
      tube(B, bez([hip, [hip[0] + 0.6 * u, hip[1] - 5 * u], nape]), (q) => (3.6 - q * 0.8) * u, SK, { tex: 3 });
      drape(B, nape[0] - 0.4 * u, nape[1] - 0.8 * u, 6 * u, 10 * u, 10 * u, SW, { wave: 0.8 * u, phase: t, ragged: true, seed: 4, lean: lean * 0.3 - 0.4 * u, trim: SW[0] });
      stripes(B, nape[0] - 5 * u, nape[1], nape[0] + 5 * u, nape[1] + 9 * u, 0.8, 4, 1, SW[1]);
      stripes(B, nape[0] - 5 * u, nape[1], nape[0] + 5 * u, nape[1] + 9 * u, -0.8, 4, 1, SW[1]);
      // a cork net-float hanging at the hem
      blob(B, [[nape[0] - 3 * u, nape[1] + 8.4 * u, 0.9 * u, 0.7 * u]], pal5('wood', 5));
      starfish(B, nape[0] + 1.6 * u, nape[1] + 2 * u, 1.5 * u, idle ? sin(t) * 0.1 : 0.2, pal5('ember', 4).map((c) => mixc(c, PAL.clay[3], 0.35)));
      put(L, B, true);
      // the head: craning forward, long hooked nose, jutting chin
      const hc = [nape[0] + 2.2 * u + lean * 0.4, nape[1] - 2.2 * u + (hurt ? 0.6 * u : 0)];
      const Hd = layer(F);
      blob(Hd, [[hc[0], hc[1], 2.9 * u, 2.7 * u], [hc[0] + 1.4 * u, hc[1] + 1.8 * u, 1.6 * u, 1.3 * u]], SK, { tex: 9 });
      horn(Hd, [hc[0] + 2 * u, hc[1] - 0.4 * u], [hc[0] + 4.6 * u, hc[1] - 0.2 * u], [hc[0] + 4 * u, hc[1] + 2 * u], 1.9 * u, SK);
      horn(Hd, [hc[0] + 1.4 * u, hc[1] + 2.4 * u], [hc[0] + 2.6 * u, hc[1] + 3.2 * u], [hc[0] + 3 * u, hc[1] + 2.2 * u], 1.3 * u, SK);
      over(Hd, hc[0] + 3.6 * u, hc[1] + 0.4 * u, SK[1]);   // a wart
      // mouth: a thin crooked line, open when she throws
      if (A2 || hurt) Hd.ellipse(hc[0] + 2 * u, hc[1] + 1.6 * u, 0.8 * u, 0.6 * u, MAW_D);
      else Hd.line(hc[0] + 1.2 * u, hc[1] + 1.6 * u, hc[0] + 2.6 * u, hc[1] + 1.3 * u, SK[0]);
      put(L, Hd, true);
      // kelp hair: strands from the crown hanging past her shoulders, swaying
      const Hr = layer(F);
      kelp(Hr, hc[0] - 1.2 * u, hc[1] - 2.2 * u, 9 * u, 1.3 * u, 4, t, KE, { spread: 3.4 * u, lean: -2.6 * u - lean * 0.5, seed: 3 });
      blob(Hr, [[hc[0] - 0.6 * u, hc[1] - 2 * u, 3 * u, 1.6 * u]], KE, { tex: 2 });
      put(L, Hr, true);
      // the arm: long and bony, a webbed hand cupping the tide
      const sh = [nape[0] + 0.6 * u, nape[1] + 2.4 * u];
      const hand = A1 ? [sh[0] - 4.4 * u, sh[1] - 3 * u] : A2 ? [sh[0] + 8 * u, sh[1] - 1.4 * u] : hurt ? [sh[0] + 1 * u, sh[1] - 4 * u] : [sh[0] + 4.6 * u, sh[1] + 2.4 * u + (idle ? sin(t + 0.3) * 0.5 * u : 0)];
      const Ar = layer(F), el = ik(sh, hand, 4 * u, 4 * u, A1 ? 1 : -1);
      tube(Ar, [sh, el, hand], [1.2 * u, 0.9 * u], SK);
      const fa = A1 ? -2.4 : A2 ? 0 : -0.4;
      for (let k = -1; k <= 1; k++) horn(Ar, hand, [hand[0] + Math.cos(fa + k * 0.4) * 1.4 * u, hand[1] + Math.sin(fa + k * 0.4) * 1.4 * u], [hand[0] + Math.cos(fa + k * 0.5) * 2.6 * u, hand[1] + Math.sin(fa + k * 0.5) * 2.6 * u], 0.9 * u, SK);
      blob(Ar, [[hand[0], hand[1], 1.1 * u, 1 * u]], SK);
      put(L, Ar, true);
      put(F.p, L, false);
      // eyes: one huge sea-glass eye, one screwed shut
      const er = hurt ? 0 : 1.5 * u;
      if (er) eyeBall(F, hc[0] + 1 * u, hc[1] - 0.7 * u, er, o.c3, { look: [0.6, 0.2], lid: SK[2], lidAmt: A1 ? 0.15 : 0.35 });
      else F.p.line(R(hc[0]), R(hc[1] - 0.6 * u), R(hc[0] + 2 * u), R(hc[1] - 0.2 * u), C('#1d0814'));
      F.p.line(R(hc[0] - 1.4 * u), R(hc[1] - 1.2 * u), R(hc[0] - 0.4 * u), R(hc[1] - 0.8 * u), C('#1d0814'));
      // the tide in her hand: a swirling orb, growing on the wind-up, flung on the strike
      const orbR = A1 ? 2.6 * u : A2 ? 2 * u : idle ? 1.1 * u + sin(t) * 0.2 * u : 1 * u;
      const ob = A2 ? [hand[0] + 2.6 * u, hand[1] - 0.4 * u] : [hand[0] + 0.4 * u, hand[1] - orbR - 0.6 * u];
      if (!hurt) {
        glow(F, ob[0], ob[1], orbR, o.c3);
        for (let a = 0; a < 5.5; a += 0.35) { const rr = orbR * (0.25 + a / 8), aa = a + t * 6; F.p.set(R(ob[0] + Math.cos(aa) * rr), R(ob[1] + Math.sin(aa) * rr), WHITE); F.e.set(R(ob[0] + Math.cos(aa) * rr), R(ob[1] + Math.sin(aa) * rr), WHITE); }
      }
      F.mouth = ob;
    },
  },
};
