// Hand-built monster designs: the Sundered Coast. See kit.js for the design format and
// docs/BESTIARY.md for the concepts.
import { C, R, PAL, blank, cyl, underside, ramp, pal5, layer, put, blob, tube, horn, slab, facet, wing, drape, ik, stride, sin, cos, lerp, clamp, bez, rot, glow, flame, eyeGlow, eyeBead, eyeBall, teeth, maw, spots, stripes, crack, over, rimLight, tint, toneIdx, light, dark, mixc, hash2, bayer, WHITE, VOID, BONE, BONE_D, MAW, MAW_D, TONGUE, CREAM, INK } from './kit.js';

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
    paint: (v, nb, t) => {
      if (v < 0.4 && ((v / 0.075) % 1) < 0.16) return Math.max(0, t - 2);
      if (v >= 0.42 && v < 0.96 && Math.floor(v * 10 - nb * nb * 0.8 + (o.seed || 0)) % 2 === 0) return t >= 3 ? BR[3] : BR[Math.max(1, t)];
      return undefined;
    },
  });
  // blunt knobs along the shoulder, on the side away from the lip
  const ks = -(o.lip || 1);
  for (let k = 0; k < 4; k++) {
    const v = 0.34 + k * 0.06, r = prof(v), root = at(v, ks * r * 0.7), tip = at(v - 0.03, ks * (r + rw * 0.38));
    horn(S, root, at(v, ks * (r + rw * 0.2)), tip, rw * 0.36, SH);
  }
  put(L, S, true);
  if (o.lip) {
    // the flared, glossy aperture lip: a crescent wing along the body whorl, the dark slit inside it
    const sg = o.lip, A = blank(L), out = [], inn = [];
    for (let k = 0; k <= 12; k++) {
      const v = 0.42 + k / 12 * 0.56, f = k / 12, fl = rw * 0.75 * Math.sin(Math.min(1, f * 1.4) * PI * 0.5) * (1 - f * 0.6);
      out.push(at(v, sg * (prof(v) + fl)));
      inn.unshift(at(v, sg * prof(v) * 0.45));
    }
    A.poly([...out, ...inn], RO[3]);
    cyl(A, RO);
    const slit = [];
    for (let k = 1; k <= 10; k++) { const v = 0.46 + k / 11 * 0.5; slit.push(at(v, sg * prof(v) * 0.82)); }
    for (let k = 1; k < slit.length; k++) A.line(...slit[k - 1], ...slit[k], RO[0]);
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

// sea-foam plumage: teal shadow rising to a pale foam white
const FOAM = ['#1a3a40', '#2f7070', '#4a9488', '#7cbca8', '#d6ead6'].map((h) => C(h));
// a sound ring: an arc of glowing dashes centred on (x, y)
function songRing(F, x, y, r, c, a0 = 0, a1 = PI * 2, dash = 3) {
  const cc = C(c), n = Math.max(8, R(r * (a1 - a0)));
  for (let k = 0; k <= n; k++) {
    if (Math.floor(k / dash) % 2) continue;
    const a = a0 + (a1 - a0) * k / n, xx = R(x + Math.cos(a) * r), yy = R(y + Math.sin(a) * r);
    F.p.set(xx, yy, cc); F.e.set(xx, yy, cc);
  }
}

// One valve of a clam: a fluted dome hinged at (hx, hy). Its straight lip runs from the hinge
// along angle a for 2 * rx px, and the dome bulges ry px to one side (side -1: the left of the
// lip direction, i.e. up for a lip pointing right; +1: down). The lip is zigzag toothed; ribs
// fan out from the hinge; growth lines run concentric. Lit from the top-left.
function valve(L, hx, hy, a, rx, ry, side, Rm, o = {}) {
  const ca = Math.cos(a), sa = Math.sin(a), nx = -sa * side, ny = ca * side;   // n: out of the lip into the dome
  const ribs = o.ribs ?? 7, tooth = o.tooth ?? Math.max(1, ry * 0.22), m = Math.max(rx * 2, ry) + 2;
  for (let y = Math.floor(hy - m); y <= hy + m; y++) for (let x = Math.floor(hx - m); x <= hx + m; x++) {
    const qx = x + 0.5 - hx, qy = y + 0.5 - hy, s = qx * ca + qy * sa, q = -(qx * nx + qy * ny);   // q < 0 inside the dome
    if (s < 0 || s > rx * 2) continue;
    const f = (s - rx) / rx, lim = ry * Math.sqrt(Math.max(0, 1 - f * f));
    const th = Math.max(0, Math.atan2(-q, s)) / (PI / 2);      // 0 along the lip .. 1 straight out
    const per = rx * 2 / (ribs + 1), tz = tooth * (1 - Math.abs(((s / per) % 1) * 2 - 1)) * Math.min(1, s / (rx * 0.4));
    if (-q > lim || q > tz) continue;
    // dome normal for the light
    const dn = Math.min(1, Math.max(0, -q) / Math.max(1, lim));
    const ux = f * 0.6, un = dn;
    const wx = ca * ux + nx * un, wy = sa * ux + ny * un, wz = Math.sqrt(Math.max(0, 1 - dn * dn)) * 0.9 + 0.1;
    let tt = toneIdx(wx * -0.48 + wy * -0.62 + wz * 0.62 + 0.05);
    const rb = (th * ribs) % 1;
    if (-q > 1.5) { if (rb < 0.16 || rb > 0.86) tt = Math.max(0, tt - 1); else if (rb > 0.36 && rb < 0.6) tt = Math.min(4, tt + 1); }
    const r = Math.hypot(qx, qy);
    if (r > 2 && (r % Math.max(3, rx * 0.45)) < 1) tt = Math.max(0, tt - 1);
    if (q > -1.2) tt = Math.min(tt, 2);
    L.set(x, y, Rm[clamp(tt, 0, 4)]);
  }
  return L;
}

// A crab claw from the wrist wr pointing along angle ca: a swollen palm, a fixed lower finger and
// a hinged upper dactyl opened by gape (radians). k scales it (1 = a mob-sized claw in units).
function crabClaw(L, F, wr, ca, gape, k, CR, CRd, o = {}) {
  const u = F.u * k, fw = [Math.cos(ca), Math.sin(ca)], nw = [-fw[1], fw[0]];
  const P0 = (a, b) => [wr[0] + fw[0] * a * u + nw[0] * b * u, wr[1] + fw[1] * a * u + nw[1] * b * u];
  const Cw = blank(L);
  const fx0 = P0(2.8, 0.6), fx1 = P0(5.2, 0.8), fxc = P0(4.2, 1.3);
  horn(Cw, fx0, fxc, fx1, 1.8 * u, CRd);
  const da = ca - gape, dfw = [Math.cos(da), Math.sin(da)], dnw = [-dfw[1], dfw[0]];
  const d0 = P0(2.6, -0.6), D = (a, b) => [d0[0] + dfw[0] * a * u + dnw[0] * b * u, d0[1] + dfw[1] * a * u + dnw[1] * b * u];
  horn(Cw, d0, D(1.6, -0.6), D(2.9, 0.5), 1.8 * u, CR);
  // tooth bumps along the cutting edges
  if (u >= 2) for (let f = 0.3; f < 0.9; f += 0.2) { over(Cw, ...D(2.9 * f, 0.55), CREAM); over(Cw, lerp(fx0[0], fx1[0], f) - nw[0] * 0.5 * u, lerp(fx0[1], fx1[1], f) - nw[1] * 0.5 * u, CREAM); }
  const pc = P0(1.6, 0), Pm = blank(L);
  blob(Pm, [[pc[0], pc[1], 2.3 * u, 1.85 * u]], CR, { tex: 5 });
  for (let j = 0; j < (o.knobs ?? 4); j++) over(Pm, ...P0(0.3 + j * 0.8, -1.2 + (j % 2) * 0.2), CR[4]);
  put(Cw, Pm, true);
  over(Cw, ...D(2.4, 0.3), CREAM); over(Cw, fx1[0] - fw[0] * 0.6 * u, fx1[1] - fw[1] * 0.6 * u, CREAM);
  put(L, Cw, true);
  return P0(5.2, 0);
}

// enemy id -> { design, name, body? }: folded into src/data/enemies.js at integration
export const assign = {
  tidecrab: { design: 'bellcrab', name: 'Bellcrab' },
  drowned_sailor: { design: 'drowned_diver', name: 'Drowned Diver' },
  sea_hag: { design: 'conch_hag', name: 'Conch Hag' },
  siren: { design: 'siren', name: 'Siren' },
  murk_serpent: { design: 'kelpie', name: 'Kelpie' },
  coral_golem: { design: 'clam_golem', name: 'Clam Golem' },
  gull: { design: 'pirate_gull', name: 'Pirate Gull' },
  king_crab: { design: 'king_crab', name: 'The King Crab' },
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
  // Siren (siren): the Greek siren, a seabird with a woman's face. The face is a pale porcelain
  // mask with sea-glass eyes, framed by a hood of sea-foam feathers; foam drips off her wing tips.
  // She sings with the mask's lips rounded into an O; when struck, the mask cracks.
  siren: {
    view: 'front', box: [36, 28], pivot: 0.5, idleFps: 4, hover: true,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle', A1 = P.atk === 1, A2 = P.atk === 2, hurt = P.hurt;
      const MK = ['#827d82', '#a29c9c', '#c4bdb6', '#e8dfcf', '#fff4dc'].map((h) => C(h)), FO = FOAM, FOd = FOAM.map((c) => dark(c, 0.8)), LG = pal5('stone', 4), RO = pal5('rose', 5);
      const bob = idle ? sin(t) * 0.4 * u : 0;
      const by = oy - 13 * u + bob;                      // breast centre
      const L = layer(F);
      // wings: raised in a V; a full beat when flying, high on the inhale, flung wide on the song
      const beat = run ? sin(t) : idle ? sin(t) * 0.2 : 0;
      const wa = A1 ? 1.15 : A2 ? 0.05 : hurt ? -0.45 : 0.7 + beat * 0.55;   // raise above horizontal
      const wl = 15 * u;
      for (const sd of [-1, 1]) {
        const sh = [ox + sd * 2.4 * u, by - 3 * u];
        wing(L, sh[0], sh[1], sd > 0 ? -wa : PI + wa, wl, sd > 0 ? 1.45 : -1.45, sd > 0 ? FO : FOd, 'feather', { n: 7 });
      }
      // the tail: a fan of foam plumes curling at the tips like a breaking wave
      const Tl = layer(F);
      for (let k = -2; k <= 2; k++) {
        const sw = idle ? sin(t + k * 0.12) * 0.9 * u : run ? sin(t * 2 + k * 0.1) * 1.4 * u : 0, l = (10 - Math.abs(k) * 1.2) * u, a = PI / 2 + k * 0.32;
        const p0 = [ox + k * 0.5 * u, by + 3.6 * u], p2 = [ox + Math.cos(a) * l + sw, by + 3.6 * u + Math.sin(a) * l];
        const p1 = [lerp(p0[0], p2[0], 0.5) - k * 0.4 * u, lerp(p0[1], p2[1], 0.5)];
        tube(Tl, bez([p0, p1, p2]), (q) => (q < 0.7 ? 1.3 : 1.3 * (1 - q) / 0.3) * u + 0.3, k % 2 ? FOd : FO, { matte: true });
        const tip = [p2[0] + (k >= 0 ? 1 : -1) * 0.8 * u, p2[1] - 0.6 * u];
        Tl.set(R(tip[0]), R(tip[1]), FO[4]);
      }
      put(L, Tl, false);
      // talons: tucked at the sides of the body, toes curled (spread wide on the song)
      const Lg = layer(F);
      for (const sd of [-1, 1]) {
        const ft = [ox + sd * (2.8 + (A2 ? 0.8 : 0)) * u, by + 5.6 * u - (hurt ? 1 * u : 0)];
        tube(Lg, [[ox + sd * 1.8 * u, by + 3 * u], ft], [0.9 * u, 0.6 * u], LG);
        const sp = A2 ? 1.3 : 0.7;
        for (let k = -1; k <= 1; k++) horn(Lg, ft, [ft[0] + (k * sp + sd * 0.4) * u, ft[1] + 0.9 * u], [ft[0] + (k * sp * 0.5 + sd * 0.2) * u, ft[1] + 1.8 * u], 0.7 * u, LG);
      }
      // the body: a teardrop of scalloped foam feathers
      const B = layer(F);
      put(L, Lg, true);
      blob(B, [[ox, by, 4.3 * u, 4.6 * u], [ox, by + 3.4 * u, 2.8 * u, 2.8 * u]], FO, { tex: 3 });
      for (let r = 0; r < 3; r++) for (let k = -1; k <= 1; k++) {
        const cx = ox + (k + (r % 2) * 0.5 - 0.25) * 1.9 * u, cy = by - 0.6 * u + r * 1.9 * u;
        for (let a = 0.25; a < PI - 0.25; a += 0.3) over(B, cx + Math.cos(a) * 0.9 * u, cy + Math.sin(a) * 0.7 * u, FO[2]);
      }
      put(L, B, true);
      // the head: a foam hood, long foam locks curling down past the shoulders
      const hc = [ox + (hurt ? 0.8 * u : 0), by - 6.8 * u + (A1 ? -0.8 * u : 0)];
      const Hd = layer(F);
      for (const sd of [-1, 1]) {
        const sw = idle ? sin(t + (sd > 0 ? 0.3 : 0)) * 0.6 * u : run ? sin(t) * 0.8 * u : A2 ? sd * 1.2 * u : 0;
        tube(Hd, bez([[hc[0] + sd * 2.4 * u, hc[1] - 1.6 * u], [hc[0] + sd * 4.6 * u, hc[1] + 2 * u], [hc[0] + sd * 3.2 * u + sw, hc[1] + 6.4 * u], [hc[0] + sd * 4.8 * u + sw, hc[1] + 8 * u]]), (q) => (1.7 - q * 1.1) * u, sd > 0 ? FOd : FO, { matte: true });
      }
      blob(Hd, [[hc[0], hc[1] - 0.6 * u, 3.7 * u, 4 * u]], FO, { tex: 5 });
      horn(Hd, [hc[0] - 1 * u, hc[1] - 3.4 * u], [hc[0] + 0.6 * u, hc[1] - 6 * u], [hc[0] + 2.8 * u + (idle ? sin(t) * 0.4 * u : 0), hc[1] - 5.6 * u], 2.2 * u, FO);
      put(L, Hd, true);
      // the mask: a porcelain oval with painted brows, a fine nose ridge
      const Mk = layer(F), tilt = A1 ? -0.8 * u : 0;
      blob(Mk, [[hc[0], hc[1] + 0.5 * u + tilt, 2.8 * u, 3.4 * u]], MK);
      Mk.line(hc[0] - 2 * u, hc[1] - 1.1 * u + tilt, hc[0] - 0.5 * u, hc[1] - 1.5 * u + tilt, MK[0]);
      Mk.line(hc[0] + 0.5 * u, hc[1] - 1.5 * u + tilt, hc[0] + 2 * u, hc[1] - 1.1 * u + tilt, MK[0]);
      Mk.line(hc[0], hc[1] - 0.4 * u + tilt, hc[0], hc[1] + 1.2 * u + tilt, MK[2]);
      put(L, Mk, true);
      put(F.p, L, false);
      // eyes: dark almond holes with sea-glass light deep inside; squeezed to slits when hurt
      for (const sd of [-1, 1]) {
        const ex = hc[0] + sd * 1.2 * u, ey = hc[1] - 0.3 * u + tilt;
        F.p.ellipse(ex, ey, 0.95 * u, 0.6 * u, VOID);
        if (hurt) F.p.line(R(ex - 0.8 * u), R(ey), R(ex + 0.8 * u), R(ey), C(MK[1]));
        else { const c = C(o.c3); F.p.set(R(ex + sd * 0.2 * u), R(ey), c); F.e.set(R(ex + sd * 0.2 * u), R(ey), c); if (u >= 1.5) { F.p.set(R(ex + sd * 0.2 * u) - sd, R(ey), light(c, 1.2)); F.e.set(R(ex + sd * 0.2 * u) - sd, R(ey), c); } }
      }
      // the mouth: small dark lips; an O when she sings
      const mo = [hc[0], hc[1] + 2 * u + tilt];
      if (A2) { F.p.ellipse(mo[0], mo[1] + 0.2 * u, 0.85 * u, 1.05 * u, RO[1]); F.p.ellipse(mo[0], mo[1] + 0.2 * u, 0.5 * u, 0.7 * u, MAW_D); }
      else if (A1) F.p.ellipse(mo[0], mo[1], 0.6 * u, 0.5 * u, RO[1]);
      else { F.p.line(R(mo[0] - 0.7 * u), R(mo[1]), R(mo[0] + 0.7 * u), R(mo[1]), C(RO[1])); F.p.set(R(mo[0]), R(mo[1] + 1), C(RO[2])); }
      // a hairline crack down the porcelain; it splits open when she is struck
      if (hurt) crack(F.p, hc[0] + 1.4 * u, hc[1] - 2.6 * u, 1.9, 5.4 * u, VOID, 6);
      else F.p.line(R(hc[0] + 1.7 * u), R(hc[1] - 2.2 * u), R(hc[0] + 1.3 * u), R(hc[1] - 1.2 * u), C(MK[1]));
      // the song: rings of sound spreading from the lips
      if (A2) { songRing(F, mo[0], mo[1], 3 * u, o.c3); songRing(F, mo[0], mo[1], 5.5 * u, o.c3, 0, PI * 2, 4); }
      if (A1) songRing(F, mo[0], mo[1], 2.2 * u, o.c3, PI * 0.15, PI * 0.85, 2);
      // foam dripping from the wing tips
      for (let k = 0; k < 4; k++) {
        const sd = k % 2 ? 1 : -1, ph = (P.i * 0.31 + k * 0.37) % 1;
        const fx = ox + sd * (8 + k * 1.4) * u, fy = by - 2 * u + ph * 7 * u;
        F.p.set(R(fx), R(fy), FO[4]);
        if (u >= 1.4 && k < 2) F.p.set(R(fx) + 1, R(fy), FO[3]);
      }
      F.mouth = mo;
    },
  },
  // Kelpie (murk_serpent): the Scottish water-horse. A dark, slick horse's head with a mane of
  // kelp rises on an eel's body. It still wears the rusted bridle of the one rider who nearly
  // tamed it; the broken chain rein swings from its jaw. Gill frills on the neck, a glowing eye.
  kelpie: {
    view: 'side', box: [22, 22], pivot: 0.38, idleFps: 3, scale: 0.85, segR: 4.2, segTaper: 0.62,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle', A1 = P.atk === 1, A2 = P.atk === 2, hurt = P.hurt;
      const BD = pal5('teal', 4).map((c, i) => mixc(c, PAL.slate[i + 1], 0.35)), BL = pal5('teal', 5).map((c) => mixc(c, CREAM, 0.25));
      const KE = pal5('moss', 5), KEd = KE.map((c) => dark(c, 0.8)), RU = pal5('clay', 4).map((c, i) => mixc(c, PAL.wood[i], 0.5));
      const bob = idle ? sin(t) * 0.4 * u : run ? sin(t) * 0.8 * u : 0;
      // head pose: reared back on the wind-up, lunging low on the strike, jerked back when hit
      const hx = ox + (A1 ? -2.2 : A2 ? 4.4 : hurt ? -1.8 : run ? 0.8 : 0) * u, hy = oy - 17 * u + bob + (A1 ? -1.6 * u : A2 ? 4 * u : hurt ? -0.4 * u : 0);
      const tilt = A1 ? -0.4 : A2 ? 0.3 : hurt ? -0.5 : (run ? sin(t) * 0.06 : 0) + 0.12;    // nose up (-) / down (+)
      const R2 = (x, y) => { const [a, b] = rot(x * u, y * u, tilt); return [hx + a, hy + b]; };
      const flow = run ? 1.5 : A2 ? 1.2 : 0.5;          // how far the mane streams back
      const L = layer(F);
      // the neck: an arched horse's neck rising from the eel body at the water line
      const base = [ox - 2 * u, oy - 4.6 * u], top = R2(-1.4, 1.4);
      const neck = bez([base, [base[0] + 1.6 * u, base[1] - 3 * u], [base[0] - 1.4 * u + (A2 ? 3 * u : 0), top[1] + 3 * u], top], 14);
      // kelp mane along the crest: strands rooted on the neck's back edge, streaming back
      const Mn = layer(F);
      for (let k = 0; k < 6; k++) {
        const q = 0.35 + k * 0.12, [nx, ny] = neck[Math.min(14, R(q * 14))];
        const root = [nx - 1.4 * u, ny - 0.6 * u], sw = sin(t + k * 0.17) * 0.7 * u, ln = (4.4 + k * 0.3) * u;
        tube(Mn, bez([root, [root[0] - (1.6 + flow) * u, root[1] + 0.4 * u + sw], [root[0] - (2.2 + flow * 1.6) * u + sw, root[1] + ln]]), (f) => (1.2 - f * 0.8) * u, k % 2 ? KEd : KE, { matte: true });
      }
      put(L, Mn, false);
      const Nk = layer(F);
      tube(Nk, neck, (q) => (2.3 - q * 0.6) * u, BD, { tex: 4 });
      // gill frills: three slits that flush red when it attacks
      for (let k = 0; k < 3; k++) {
        const [gx, gy] = neck[5 + k * 2];
        Nk.line(gx + 0.2 * u, gy - 0.8 * u, gx + 1 * u, gy + 0.6 * u, BD[0]);
        if (u >= 1.2) Nk.line(gx + 0.8 * u, gy - 0.8 * u, gx + 1.6 * u, gy + 0.6 * u, A2 || A1 ? C('#a94a68') : BD[4]);
      }
      underside(Nk, [BL[2], BL[3]]);
      put(L, Nk, true);
      // the head: a long horse's skull with a heavy brow and a soft muzzle
      const Hd = layer(F);
      blob(Hd, [[...R2(0, 0), 3 * u, 2.7 * u], [...R2(3.6, 1), 2.6 * u, 1.9 * u], [...R2(6.4, 1.8), 1.7 * u, 1.6 * u]], BD, { tex: 6 });
      // lower jaw: hinges open on the wind-up, gapes on the strike
      const open = A2 ? 0.7 : A1 ? 0.3 : hurt ? 0.18 : 0;
      const jaw = layer(F), jh = R2(0.6, 1.6);
      const ja = tilt + open, jd = (x, y) => { const [a, b] = rot(x * u, y * u, ja); return [jh[0] + a, jh[1] + b]; };
      if (open > 0) {
        const Mw = layer(F);
        Mw.poly([R2(1, 1.4), R2(7.2, 2.6), jd(6, 1.4), jd(0.8, 0.6)], MAW_D);
        teeth(Mw, R2(2.6, 2.3), R2(6.8, 2.8), 5, 0.9 * u, 1);
        teeth(Mw, jd(2.4, 0.9), jd(5.6, 1.3), 4, 0.8 * u, -1);
        put(Hd, Mw, false);
      }
      tube(jaw, [jd(0, 0.6), jd(5.8, 1.3)], [1.5 * u, 0.9 * u], BD);
      underside(jaw, [BL[2]]);
      put(Hd, jaw, true);
      // ears: two swept points, pinned flat when it strikes or is struck
      const pin = A2 || hurt ? 0.9 : A1 ? 0.5 : idle && P.i === 2 ? 0.3 : 0;
      for (const [ex, c] of [[-1.4, BD.map((x) => dark(x, 0.85))], [-0.4, BD]]) horn(Hd, R2(ex, -2), R2(ex - 0.4 - pin * 1.4, -4 + pin * 1.6), R2(ex - 1.2 - pin * 2.6, -5.4 + pin * 2.8), 1.5 * u, c);
      // the forelock: kelp falling over the brow
      kelp(Hd, ...R2(0.2, -2.4), 3.4 * u, 1.1 * u, 2, t, KE, { spread: 1.4 * u, lean: -0.8 * u - flow * 0.5 * u, seed: 5 });
      // nostril, flared on the wind-up; a brow ridge
      const ns = R2(7, 1.4);
      Hd.ellipse(ns[0], ns[1], 0.5 * u, (A1 ? 0.6 : 0.35) * u, BD[0]);
      Hd.line(...R2(-0.4, -1.3), ...R2(2.2, -0.9), BD[4]);
      // the rusted bridle: a noseband and a cheek strap meeting at a ring by the mouth
      const Bd = layer(F);
      Bd.line(...R2(4.4, -0.7), ...R2(4.8, 2.4), RU[1]);
      Bd.line(...R2(-0.8, -1.8), ...R2(1.6, 1.6), RU[1]);
      over(Bd, ...R2(4.4, -0.5), RU[3]);
      put(Hd, Bd, false);
      const ring = R2(1.6, 1.7);
      Hd.ring(ring[0], ring[1], Math.max(1.3, 0.9 * u), RU[3], 1);
      put(L, Hd, true);
      // the broken rein: a short chain swinging from the ring
      const sw = idle ? sin(t + 0.25) * 1 * u : run ? -1.6 * u : A2 ? -2 * u : A1 ? 1.2 * u : 1.4 * u;
      const ch = bez([ring, [ring[0] + sw * 0.4, ring[1] + 3 * u], [ring[0] + sw - 0.6 * u, ring[1] + 5.4 * u]], 9);
      for (let k = 1; k < ch.length; k++) { const [x, y] = ch[k]; L.set(R(x), R(y), k % 2 ? RU[1] : RU[3]); if (k % 2 === 0 && u >= 1.4) L.set(R(x) + 1, R(y), RU[2]); }
      put(F.p, L, false);
      // the eye: a glowing sea-green eye under the brow, shut tight when hurt
      const ey = R2(1.4, -0.6);
      if (hurt) F.p.line(R(ey[0] - 1 * u), R(ey[1] - 0.2 * u), R(ey[0] + 0.8 * u), R(ey[1] + 0.4 * u), C(VOID));
      else eyeGlow(F, ey[0] - 0.6 * u, ey[1] - 0.4 * u, Math.max(2, 1.4 * u), Math.max(1, 0.9 * u), o.c3, { brow: BD[0] });
      // bubbles from the nostril when idle, a spray on the strike
      if (idle && P.i % 2 === 0) bubble(F, ns[0] + 1.2 * u, ns[1] - 1.6 * u - P.i * 0.4 * u, 0.8 * u);
      if (A2) for (let k = 0; k < 3; k++) bubble(F, ns[0] + (1.4 + k) * u, ns[1] + (k - 1) * 1.2 * u, 0.7 * u);
      F.mouth = R2(7, 2.4);
    },
    // one eel segment: slick dark disc, pale belly, a fin crest, kelp fronds on the first few,
    // a tail fan on the last (segments are never mirrored, so the crest stays symmetric)
    seg(F, o, i, r, N) {
      const { cx, cy } = F;
      const BD = pal5('teal', 4).map((c, k) => mixc(c, PAL.slate[k + 1], 0.35)), BL = pal5('teal', 5).map((c) => mixc(c, CREAM, 0.25));
      const KE = pal5('moss', 5), FN = BD.map((c) => mixc(c, PAL.teal[4], 0.35));
      const L = layer(F);
      if (i >= 3) {
        // dorsal fin: a ridge with rays
        const Fn = layer(F), h = r * (i === N - 1 ? 1 : 0.6);
        Fn.poly([[cx - r * 0.55, cy - r * 0.6], [cx, cy - r - h], [cx + r * 0.55, cy - r * 0.6]], FN[3]);
        cyl(Fn, FN);
        Fn.line(cx, cy - r * 0.7, cx, cy - r - h + 1, FN[1]);
        put(L, Fn, false);
      }
      if (i === N - 1) {
        // tail: two fan lobes to either side
        const Tf = layer(F);
        for (const sd of [-1, 1]) Tf.poly([[cx, cy], [cx + sd * r * 1.5, cy - r * 0.6], [cx + sd * r * 1.3, cy + r * 0.8]], FN[3]);
        cyl(Tf, FN);
        put(L, Tf, false);
      }
      const B = layer(F);
      blob(B, [[cx, cy, r, r * 0.92]], BD, { tex: 3 + i });
      for (let y = R(cy + r * 0.45); y <= cy + r; y++) for (let x = R(cx - r); x <= cx + r; x++) if (B.a(x, y)) B.set(x, y, y > cy + r * 0.72 ? BL[2] : BL[3]);
      put(L, B, true);
      if (i < 5 && i % 2 === 0) {
        const K = layer(F), w = Math.max(0.7, r * 0.18);
        tube(K, bez([[cx - r * 0.8, cy - r * 0.3], [cx - r * 0.5, cy - r * 1.05], [cx + r * 0.5, cy - r * 1.05], [cx + r * 0.85, cy - r * 0.1]], 16), w, KE, { matte: true });
        tube(K, [[cx + r * 0.85, cy - r * 0.1], [cx + r * 0.95, cy + r * 0.45]], [w, w * 0.4], KE.map((c) => dark(c, 0.85)));
        put(L, K, true);
      }
      put(F.p, L, false);
    },
  },
  // Clam Golem (coral_golem): a giant clam that walks on two trunks of living coral. The gape is
  // its face: inside, a teal mantle and one great pearl for an eye, and it blinks by shutting the
  // shell. It clubs with brain-coral fists and bites with the shell's toothed lips. A sea anemone
  // rides on its crown.
  clam_golem: {
    view: 'side', box: [26, 27], pivot: 0.5, idleFps: 2.5, scale: 0.88,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle', A1 = P.atk === 1, A2 = P.atk === 2, hurt = P.hurt;
      const SH = pal5('sand', 5).map((c, i) => mixc(c, PAL.mauve[i + 2], 0.28)), SHd = SH.map((c) => dark(c, 0.86));
      const CO = pal5('clay', 6).map((c, i) => mixc(c, PAL.rose[i], 0.35)), COd = CO.map((c) => dark(c, 0.8));
      const MA = pal5('teal', 5), PE = ['#8a6a8a', '#a87cc0', '#c8b8d8', '#efe4ec', '#fff4fb'].map((h) => C(h));
      const bob = run ? -Math.abs(sin(t)) * 1 * u : idle ? sin(t) * 0.3 * u : A2 ? 1 * u : 0;
      const gape = A1 ? 0.7 : A2 ? 0 : hurt ? 0.04 : run ? 0.42 + sin(t * 2) * 0.04 : idle ? (P.i === 3 ? 0.06 : 0.5 + sin(t) * 0.05) : 0.45;
      const lean = A1 ? -0.12 : A2 ? 0.22 : hurt ? -0.16 : run ? 0.06 : 0;
      const hinge = [ox - 8.4 * u + (A2 ? 1 * u : 0), oy - 13.6 * u + bob];
      const rx = 8.6 * u, ry = 7.2 * u;
      const L = layer(F);
      // coral legs: two branching trunks with knobbly side shoots
      const leg = (far) => {
        const Lg = layer(F), Rc = far ? COd : CO;
        const hip = [ox + (far ? 2.4 : -0.6) * u, oy - 7.4 * u + bob];
        const ph = far ? t + 0.5 : t;
        const [sx, lift] = run ? stride(ph, 4.6 * u, 1.8 * u) : [A2 ? (far ? 2.4 : -1.6) * u : 0, 0];
        const foot = [hip[0] + sx, oy - lift];
        const knee = ik(hip, foot, 3.8 * u, 3.8 * u, -1);
        tube(Lg, [hip, knee, foot], [1.5 * u, 1.2 * u], Rc, { tex: 7 });
        // side shoots
        for (const [f, dx, dy] of [[0.25, -1.6, -1.6], [0.55, 1.5, -1.4], [0.8, -1.2, -0.8]]) {
          const bp = [lerp(hip[0], foot[0], f), lerp(hip[1], foot[1], f)];
          horn(Lg, bp, [bp[0] + dx * u, bp[1] + dy * 0.4 * u], [bp[0] + dx * 1.4 * u, bp[1] + dy * u], 1 * u, Rc);
        }
        // splayed root-foot
        blob(Lg, [[foot[0] + 0.6 * u, foot[1] - 0.5 * u, 2.2 * u, 0.9 * u]], Rc);
        put(L, Lg, !far);
      };
      // an arm: a coral branch ending in a brain-coral fist
      const arm = (far) => {
        const Ar = layer(F), Rc = far ? COd : CO;
        const sh = [ox + (far ? 3 : 0.4) * u, oy - 9.4 * u + bob];
        const hand = A1 ? [sh[0] + (far ? 1 : -1.6) * u, sh[1] - 9 * u] : A2 ? [sh[0] + 9 * u, oy - 2.2 * u] : hurt ? [sh[0] + 3.4 * u, sh[1] - 4 * u] : run ? [sh[0] + (far ? -1 : 1) * sin(t) * 2.6 * u + 2.4 * u, sh[1] + 4.6 * u] : [sh[0] + 3.4 * u, sh[1] + 5 * u + (idle ? sin(t + 0.2) * 0.4 * u : 0)];
        const el = ik(sh, hand, 4 * u, 4 * u, A1 ? 1 : -1);
        tube(Ar, [sh, el, hand], [1.1 * u, 0.9 * u], Rc, { tex: 5 });
        horn(Ar, el, [el[0] - 0.8 * u, el[1] - 1 * u], [el[0] - 1.4 * u, el[1] - 2 * u], 0.9 * u, Rc);
        const BR = (far ? SHd : SH).map((c) => mixc(c, PAL.rose[3], 0.35));
        blob(Ar, [[hand[0], hand[1], 2.1 * u, 1.9 * u]], BR, { tex: 9 });
        // the maze grooves of brain coral
        for (let k = -1; k <= 1; k++) for (let a = -0.9; a < 0.9; a += 0.18) over(Ar, hand[0] + k * 0.8 * u + Math.sin(a * 3 + k) * 0.4 * u, hand[1] + a * 1.6 * u, BR[1]);
        put(L, Ar, !far);
      };
      arm(true);
      leg(true);
      // the shell: lower valve, the mantle and the pearl eye in the gape, the upper valve
      const a0 = lean;
      const Lo = layer(F);
      valve(Lo, hinge[0], hinge[1], a0 + gape * 0.25, rx, ry * 0.8, 1, SHd, { ribs: 5 });
      put(L, Lo, true);
      const mid = a0 - gape * 0.4;
      const mc = [hinge[0] + Math.cos(mid) * rx * 1.15, hinge[1] + Math.sin(mid) * rx * 1.15];
      if (gape > 0.08) {
        const Mn = layer(F), mh = gape * rx * 1.3;
        ellR(Mn, mc[0], mc[1], rx * 0.82, Math.max(1, mh * 0.6), mid, MA[2]);
        ellR(Mn, mc[0] - 0.4 * u, mc[1] - 0.4 * u, rx * 0.7, Math.max(1, mh * 0.42), mid, MA[3]);
        spots(Mn, mc[0], mc[1], rx * 0.7, mh * 0.45, 7, 0.45 * u, MA[4], 3);
        put(L, Mn, false);
      }
      const Up = layer(F);
      valve(Up, hinge[0], hinge[1], a0 - gape, rx, ry, -1, SH, { ribs: 6 });
      // a barnacle crust and the anemone on the crown
      const crown = [hinge[0] + Math.cos(a0 - gape - 0.55) * rx * 1.05, hinge[1] + Math.sin(a0 - gape - 0.55) * rx * 1.05];
      if (hurt) crack(Up, crown[0] + 1 * u, crown[1] + 1 * u, 1.6, 5 * u, SH[0], 4);
      put(L, Up, true);
      const An = layer(F), RO = pal5('rose', 5);
      for (let k = 0; k < 5; k++) {
        const aa = -PI / 2 + (k - 2) * 0.38 + sin(t + k * 0.13) * (idle ? 0.12 : 0.2), l = (2.8 + (k % 2) * 0.8) * u;
        tube(An, bez([crown, [crown[0] + Math.cos(aa) * l * 0.6, crown[1] + Math.sin(aa) * l * 0.5], [crown[0] + Math.cos(aa + 0.4) * l, crown[1] + Math.sin(aa + 0.4) * l]]), (q) => (0.7 - q * 0.35) * u + 0.3, RO, { matte: true });
      }
      blob(An, [[crown[0], crown[1] + 0.2 * u, 1.4 * u, 0.9 * u]], RO);
      put(L, An, true);
      leg(false);
      arm(false);
      put(F.p, L, false);
      // the pearl eye: iridescent, with a glowing iris that tracks forward; hidden when shut
      if (gape > 0.15) {
        const pr = Math.min(2.6 * u, gape * rx * 0.62);
        const pc = [mc[0] - 0.4 * u, mc[1]];
        F.p.disc(pc[0], pc[1], pr, PE[2]);
        F.p.disc(pc[0] - pr * 0.15, pc[1] - pr * 0.15, pr * 0.78, PE[3]);
        F.p.disc(pc[0] - pr * 0.4, pc[1] - pr * 0.4, Math.max(0.6, pr * 0.22), PE[4]);
        const ir = pr * 0.5, ix = pc[0] + pr * 0.32, iy = pc[1] + (A1 ? -0.2 : 0.1) * pr;
        F.p.disc(ix, iy, ir, C(o.c3)); F.e.disc(ix, iy, ir, C(o.c3));
        F.p.disc(ix + ir * 0.15, iy, Math.max(0.6, ir * 0.45), VOID);
        F.p.set(R(ix - ir * 0.4), R(iy - ir * 0.4), WHITE);
      }
      // the toothed lips grinding shut on the strike: a puff of grit
      if (A2) for (let k = 0; k < 4; k++) { const x = hinge[0] + rx * 2.1 + k * 0.8 * u, y = hinge[1] + (k - 1.5) * 1.2 * u; F.p.set(R(x), R(y), SH[4]); }
    },
  },
  // Pirate Gull (gull): a dockside thief in a tricorn several sizes too big, stolen off a drowned
  // captain. A huge hooked beak with a gold earring hoop through it, a mean brow, and a stolen
  // coin clutched in its feet. The hat flies off when it is hit.
  pirate_gull: {
    view: 'side', box: [26, 20], pivot: 0.48, idleFps: 6, flap: 12, scale: 1.4, run: 4, idle: 4,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const t = P.t, A1 = P.atk === 1, A2 = P.atk === 2, hurt = P.hurt;
      const WH = ['#827d82', '#a29c9c', '#c4bdb6', '#e8dfcf', '#fff4dc'].map((h) => C(h)), GR = pal5('stone', 6).map((c, i) => mixc(c, PAL.slate[i], 0.25));
      const TIP = pal5('plum', 3).map((c) => mixc(c, INK, 0.3)), BK = pal5('gold', 5), RD = pal5('red', 5);
      const HT = pal5('plum', 4).map((c) => mixc(c, INK, 0.2)), GD = pal5('gold', 5), FT = pal5('ember', 4).map((c) => mixc(c, PAL.clay[3], 0.4));
      // flap phase: 0 up, 0.25 level, 0.5 down, 0.75 level (idle and run are both the flap cycle)
      const fl = A1 ? 0 : A2 ? 0.6 : hurt ? 0.35 : t;
      const wy = Math.cos(fl * PI * 2);                  // 1 = wings up, -1 = wings down
      const pitch = A1 ? -0.25 : A2 ? 0.32 : hurt ? -0.35 : 0.04;
      const bx = ox + (A2 ? 2.4 * u : A1 ? -1 * u : 0), by = oy - 7.4 * u - wy * 0.6 * u;
      const Q = (x, y) => { const [a, b] = rot(x * u, y * u, pitch); return [bx + a, by + b]; };
      const L = layer(F);
      // the near wing is drawn as a flat-shaded swept shape: arm, coverts, primaries
      const wingShape = (far) => {
        const W = layer(F), Rm = far ? GR.map((c) => dark(c, 0.78)) : GR;
        const sh = Q(far ? 1.6 : 0.2, -1.4);
        const ang = -2.55 + wy * 1.15 + (far ? 0.2 : 0);           // the leading edge, sweeping up and back
        const d = [Math.cos(ang), Math.sin(ang)], n = [d[1], -d[0]];
        const span = 12 * u, chord = 3.8 * u;
        const P2 = (a, b) => [sh[0] + d[0] * a + n[0] * b, sh[1] + d[1] * a + n[1] * b];
        const outline = [P2(0, 0), P2(span * 0.45, -0.5 * u), P2(span, 0.3 * u), P2(span * 0.74, chord * 0.55), P2(span * 0.42, chord * 0.95), P2(0, chord * 0.85)];
        W.poly(outline, Rm[3]);
        cyl(W, Rm, { wide: true });
        // the black tip and white mirrors
        const tipC = far ? TIP.map((c) => dark(c, 0.8)) : TIP;
        const T2 = layer(F);
        T2.poly([P2(span * 0.66, -0.4 * u), P2(span, 0.3 * u), P2(span * 0.74, chord * 0.55), P2(span * 0.6, chord * 0.7)], tipC[2]);
        put(W, T2, false);
        W.set(...P2(span * 0.84, chord * 0.12).map(R), WH[4]);
        // feather separations along the trailing edge
        for (let k = 1; k < 4; k++) W.line(...P2(span * (0.22 + k * 0.13), chord * 0.4), ...P2(span * (0.18 + k * 0.13), chord * 0.85), Rm[1]);
        put(L, W, !far);
      };
      wingShape(true);
      // tail: white fan with a dark band
      const Tl = layer(F);
      Tl.poly([Q(-4, -0.6), Q(-8.6, -1.4 + wy * 0.4), Q(-8.8, 0.8 + wy * 0.4), Q(-4, 1.2)], WH[3]);
      cyl(Tl, WH);
      Tl.line(...Q(-8.2, -1.2 + wy * 0.4), ...Q(-8.4, 0.6 + wy * 0.4), TIP[1]);
      put(L, Tl, true);
      // feet tucked under, clutching a stolen coin
      const Ft = layer(F), fp = Q(-0.6, 3.6);
      tube(Ft, [Q(-0.4, 2), fp], 0.5 * u, FT);
      Ft.ellipse(fp[0] + 0.6 * u, fp[1] + 0.4 * u, 1 * u, 0.6 * u, FT[3]);
      put(L, Ft, true);
      if (!hurt) { glow(F, fp[0] + 0.4 * u, fp[1] + 1.4 * u, 0.9 * u, GD[4]); }
      // body: plump white with a grey mantle
      const B = layer(F);
      blob(B, [[...Q(0, 0), 4.6 * u, 3.1 * u], [...Q(-3, 0.2), 2.6 * u, 2 * u]], WH);
      put(L, B, true);
      // head: round, a bit too big for the body, under the tricorn
      const hc = Q(4.4, -2.4);
      const Hd = layer(F);
      blob(Hd, [[hc[0], hc[1], 2.9 * u, 2.7 * u]], WH);
      put(L, Hd, true);
      // the beak: long and hooked, a red gonys spot; opens to screech on the wind-up and the strike
      const open = A1 ? 0.5 : A2 ? 0.35 : hurt ? 0.25 : 0;
      const ba = pitch + (A1 ? -0.15 : 0), bd = [Math.cos(ba), Math.sin(ba)], bn = [-bd[1], bd[0]];
      const BQ = (a, b) => [hc[0] + 1.8 * u + bd[0] * a * u + bn[0] * b * u, hc[1] + 0.2 * u + bd[1] * a * u + bn[1] * b * u];
      const Bk = layer(F);
      if (open) Bk.poly([BQ(0, 0), BQ(5, -0.4), BQ(4.6, 1.4 + open * 3), BQ(0, 1.2)], MAW_D);
      // upper mandible with the hook
      Bk.poly([BQ(-0.4, -1), BQ(4.2, -0.8), BQ(5.4, -0.4), BQ(5.6, 0.6), BQ(4.8, 0.2), BQ(0, 0.4)], BK[3]);
      Bk.line(...BQ(0, -0.6), ...BQ(4.2, -0.6), BK[4]);
      // lower mandible, swung open
      const la = open * 0.6, lq = (a, b) => { const [x, y] = rot(a * u, b * u, la); return [BQ(0, 0.6)[0] + bd[0] * x - bn[0] * -y, BQ(0, 0.6)[1] + bd[1] * x + bn[1] * y]; };
      Bk.poly([lq(0, 0), lq(4.4, 0), lq(4, 0.9), lq(0, 1)], BK[2]);
      Bk.set(...lq(3.2, 0.6).map(R), RD[3]);
      put(L, Bk, true);
      // the gold earring hoop through the nostril
      const ring = BQ(1.6, -0.1);
      L.ring(ring[0], ring[1] + 1 * u, Math.max(1.2, 1 * u), GD[4], 1);
      // the tricorn: rakish, gold trimmed, with a cream skull badge; knocked flying when hurt
      const hp = hurt ? [hc[0] - 2 * u, hc[1] - 6 * u] : [hc[0] - 0.6 * u, hc[1] - 2.2 * u + (A1 ? -0.5 * u : 0)];
      const ht = hurt ? -0.8 : -0.22 + (A2 ? 0.15 : 0);
      const H = layer(F), HQ = (a, b) => { const [x, y] = rot(a * u, b * u, ht); return [hp[0] + x, hp[1] + y]; };
      H.poly([HQ(-3.4, 0.4), HQ(-2.6, -1.8), HQ(-0.6, -2.7), HQ(1.2, -2.5), HQ(2.8, -1.4), HQ(3.4, 0.3), HQ(1.4, -0.4), HQ(-1.6, -0.3)], HT[2]);
      cyl(H, HT);
      H.line(...HQ(-3.4, 0.4), ...HQ(-1.6, -0.3), GD[4]); H.line(...HQ(-1.6, -0.3), ...HQ(1.4, -0.4), GD[3]); H.line(...HQ(1.4, -0.4), ...HQ(3.4, 0.3), GD[4]);
      H.set(...HQ(0.3, -1.4).map(R), C(CREAM));
      put(L, H, true);
      wingShape(false);
      put(F.p, L, false);
      // the eye: a mean little bead under a slanted brow; screwed shut when hurt
      const ey = [hc[0] + 0.9 * u, hc[1] - 0.1 * u];
      if (hurt) F.p.line(R(ey[0] - 0.8 * u), R(ey[1]), R(ey[0] + 0.8 * u), R(ey[1] + 0.6 * u), C(VOID));
      else {
        F.p.rect(R(ey[0]), R(ey[1]), Math.max(1, R(0.9 * u)), Math.max(1, R(0.9 * u)), C('#1d0814'));
        F.p.set(R(ey[0] + 0.9 * u) - 1, R(ey[1]), WHITE);
        F.p.line(R(ey[0] - 0.8 * u), R(ey[1] - 1.2 * u), R(ey[0] + 1.4 * u), R(ey[1] - 0.3 * u), C(HT[0]));
        if (o.c3) { F.e.set(R(ey[0]), R(ey[1]), C(o.c3)); }
      }
      // loose feathers when hit
      if (hurt) for (let k = 0; k < 3; k++) { const x = bx + (k - 1) * 3 * u, y = by - (4 + k) * u; F.p.line(R(x), R(y), R(x + 1.2 * u), R(y + 0.6 * u), WH[3]); }
      F.mouth = BQ(5, 0.4);
    },
  },
  // The King Crab (king_crab): a colossal crab that has taken the broken-off stern of a sunken
  // galleon for its shell. The quarter gallery's cabin windows still glow (its soft weak points),
  // the rudder swings behind it, a stern lantern burns on the poop deck, and the drowned captain's
  // gold crown sits on top, half swallowed by barnacles. One crusher claw as big as a rowboat.
  king_crab: {
    view: 'side', box: [54, 40], pivot: 0.5, idleFps: 4, idle: 6, scale: 0.6,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle', A1 = P.atk === 1, A2 = P.atk === 2, hurt = P.hurt;
      const CR = pal5('red', 5), CRd = CR.map((c) => dark(c, 0.78)), WD = pal5('wood', 5), WDd = WD.map((c) => dark(c, 0.82));
      const GD = pal5('gold', 5), VG = pal5('teal', 5), WN = pal5('ember', 5), EYE = pal5('sand', 6);
      const bob = run ? -Math.abs(sin(t * 2)) * 0.8 * u : idle ? sin(t) * 0.3 * u : A2 ? 1 * u : 0;
      const tip = A1 ? -0.07 : A2 ? 0.06 : hurt ? -0.09 : run ? sin(t * 2) * 0.03 : idle ? sin(t) * 0.012 : 0;
      const sx = ox - 6 * u, sy = oy - 12 * u + bob;      // stern origin: the hull's bottom at the middle
      const S = (x, y) => { const [a, b] = rot(x * u, y * u, tip); return [sx + a, sy + b]; };
      const L = layer(F);
      // walking legs: four a side under the hull, spiny, pale-tipped
      const legs = (far) => {
        const Lg = layer(F), Rl = far ? CRd.map((c) => dark(c, 0.9)) : CR;
        for (let k = 0; k < 4; k++) {
          const hip = S(-7 + k * 5 + (far ? 1.6 : 0), 0.6);
          const ph = run ? t * 2 + k * 0.27 + (far ? 0.5 : 0) : 0;
          const [dx, lift] = stride(ph, 4 * u, 2 * u);
          const out = [-8, -3.5, 2, 7][k] * u;
          const foot = [hip[0] + out + dx + (A1 ? -1 * u : A2 ? 1 * u : 0), oy - lift];
          const knee = ik(hip, foot, 6.6 * u, 7.6 * u, k < 2 ? 1 : -1);
          const kn = [knee[0], knee[1] - 2 * u];
          tube(Lg, [hip, kn], [1.6 * u, 1.3 * u], Rl, { tex: 3 });
          tube(Lg, [kn, foot], [1.3 * u, 0.4 * u], Rl, { tex: 4 });
          for (let f = 0.25; f < 0.8; f += 0.25) { const p = [lerp(kn[0], foot[0], f), lerp(kn[1], foot[1], f)]; Lg.set(R(p[0] + (k < 2 ? -1 : 1) * 1.2 * u), R(p[1]), Rl[3]); }
          Lg.disc(kn[0], kn[1] - 0.4 * u, 0.6 * u, Rl[4]);
          Lg.set(R(foot[0]), R(foot[1] - 1), C(CREAM));
        }
        put(L, Lg, !far);
      };
      legs(true);
      // the small cutter claw on the far side
      const cut = S(16.5, -4.4);
      tube(L, [S(10, -3), cut], [1.6 * u, 1.4 * u], CRd);
      crabClaw(L, F, cut, (A2 ? 0.5 : A1 ? -0.3 : 0.15) + tip, A1 ? 0.7 : idle && P.i === 3 ? 0.5 : 0.18, 1.2, CRd, CRd.map((c) => dark(c, 0.85)));
      // the crab's body showing under the hull and out of the broken bow end
      const Bd = layer(F);
      blob(Bd, [[...S(1, 0.4), 13 * u, 3.4 * u], [...S(11.6, -4.6), 4.4 * u, 4.2 * u]], CR, { tex: 7 });
      put(L, Bd, true);
      // the rudder: a heavy slab hung on iron pintles off the stern, swinging
      const rs = idle ? sin(t) * 0.05 : run ? sin(t * 2) * 0.1 : A1 ? -0.12 : A2 ? 0.14 : 0.08;
      const rp = S(-15.6, -5.4), RQ = (x, y) => { const [a, b] = rot(x * u, y * u, tip + rs); return [rp[0] + a, rp[1] + b]; };
      slab(L, [RQ(-1, -1), RQ(1.4, -1), RQ(1.2, 8), RQ(-3.2, 7.6), RQ(-2.6, 2)], WDd, { wide: true });
      for (let k = 0; k < 3; k++) L.line(...RQ(-1.6, 0.8 + k * 2.4), ...RQ(1.4, 0.8 + k * 2.4), C('#3a4048'));
      // the hull: a side of the stern castle, planked, weedy at the waterline, snapped off at the bow
      const H = layer(F);
      const hull = [S(-13.6, 0), S(-6, 2), S(2, 2.4), S(9, 1.2), S(11.2, -2), S(9.4, -4), S(12, -6.2), S(9.6, -8.6), S(11.6, -10.6), S(10, -11.4), S(-4, -13.4), S(-13, -16.4), S(-16, -16), S(-15, -6)];
      H.poly(hull, WD[3]);
      cyl(H, WD, { wide: true });
      // plank seams following the hull's sheer, a light edge above each
      for (let k = 1; k < 8; k++) {
        const y0 = -k * 1.9;
        for (let x = -16; x <= 12; x += 0.25) { const yy = y0 + 1.6 - Math.pow((x + 2) / 14, 2) * 1.2 - (x < -4 ? (-4 - x) * 0.22 * (k / 8) : 0); const pp = S(x, yy); if (H.a(R(pp[0]), R(pp[1]))) { over(H, pp[0], pp[1], WD[1]); over(H, pp[0], pp[1] - 1, WD[4]); } }
      }
      // weed and verdigris along the waterline, barnacles below
      spots(H, ...S(-1, -1), 12 * u, 1.6 * u, 10, 1 * u, VG[1], 5);
      spots(H, ...S(-2, -1.4), 11 * u, 1.2 * u, 6, 0.8 * u, VG[2], 9);
      for (let k = 0; k < 7; k++) barnacle(H, ...S(-12 + k * 3.4 + (k % 2) * 0.8, 0.4 - (k % 3) * 0.6), (0.8 + (k % 2) * 0.4) * u, k);
      // the broken bow end: splintered plank ends, dark inside
      for (let k = 0; k < 5; k++) { const p0 = S(9.6 + (k % 2) * 1.6, -1.6 - k * 2.1); H.line(p0[0], p0[1], p0[0] - 2 * u, p0[1] + 0.3 * u, WD[0]); }
      put(L, H, true);
      // the quarter gallery: a carved bay of cabin windows that glow from inside
      const G = layer(F);
      slab(G, [S(-14.6, -13.2), S(-3.4, -12.4), S(-3.8, -5.2), S(-13.6, -5.6)], WD.map((c) => light(c, 1.06)), { wide: true });
      slab(G, [S(-15.2, -14.2), S(-3, -13.2), S(-3.2, -12.2), S(-15, -13)], GD);
      slab(G, [S(-14, -5.8), S(-3.6, -5.4), S(-4.4, -4), S(-12.8, -4.4)], GD);
      put(L, G, true);
      put(F.p, L, false);
      const flick = hurt ? 1 : idle ? [0.8, 1, 0.9, 1, 0.75, 0.95][P.i % 6] : A1 ? 1 : 0.9;
      for (let k = 0; k < 4; k++) {
        const wx = -13 + k * 2.5, w0 = S(wx, -11.6), w1 = S(wx + 1.7, -6.4);
        const ww = Math.max(2, R(w1[0] - w0[0])), wh = Math.max(3, R(w1[1] - w0[1]));
        const c = flick > 0.9 || k % 2 ? WN[3] : WN[2];
        for (const Lr of [F.p, F.e]) { Lr.rrect(R(w0[0]), R(w0[1]), ww, wh, c, Math.min(2, ww >> 1)); Lr.rect(R(w0[0]) + 1, R(w0[1]) + 2, Math.max(1, ww - 2), Math.max(1, (wh >> 1) - 1), WN[4]); }
        // mullion bars
        F.p.line(R(w0[0] + ww / 2), R(w0[1]) + 1, R(w0[0] + ww / 2), R(w0[1]) + wh - 1, WD[1]);
        F.p.line(R(w0[0]), R(w0[1] + wh * 0.55), R(w0[0]) + ww - 1, R(w0[1] + wh * 0.55), WD[1]);
      }
      // the poop deck rail: balusters along the top edge
      const L2 = layer(F);
      for (let x = -15; x <= 9.6; x += 1.6) { const yy = x < -4 ? -16.2 + (x + 15) * 0.25 : -13.4 + (x + 4) * 0.17; L2.line(...S(x, yy), ...S(x, yy - 1.8), WD[2], Math.max(1, R(0.5 * u))); }
      L2.line(...S(-15.4, -18.1), ...S(-4, -15.3), WD[4], Math.max(1, R(0.6 * u)));
      L2.line(...S(-4, -15.3), ...S(9.8, -13.1), WD[4], Math.max(1, R(0.6 * u)));
      // the stern lantern on its post
      const lp = S(-14.6, -18);
      L2.line(lp[0], lp[1], ...S(-14.6, -22), C('#3a4048'), Math.max(1, R(0.6 * u)));
      slab(L2, [S(-16, -22.4), S(-13.2, -22.4), S(-13.4, -26.6), S(-15.8, -26.6)], pal5('stone', 4));
      slab(L2, [S(-16.4, -27.6), S(-12.8, -27.6), S(-14.6, -29.6)], GD);
      // the crown: a gold coronet sunk in barnacles on the deck
      const cc = S(1.6, -15.6), ct = -0.18 + tip;
      const CQ = (x, y) => { const [a, b] = rot(x * u, y * u, ct); return [cc[0] + a, cc[1] + b]; };
      const Cr = layer(F);
      const cpts = [CQ(-3.6, 1), CQ(-3.6, -1.6), CQ(-2.6, -3.6), CQ(-1.8, -1.8), CQ(-0.6, -4.6), CQ(0.6, -1.8), CQ(1.8, -4), CQ(2.6, -1.6), CQ(3.6, -3.2), CQ(3.6, 1)];
      Cr.poly(cpts, GD[3]);
      cyl(Cr, GD, { wide: true });
      Cr.line(...CQ(-3.6, -0.6), ...CQ(3.6, -0.6), GD[1]);
      for (const [x, y] of [[-2.6, -3.6], [-0.6, -4.6], [1.8, -4], [3.6, -3.2]]) { Cr.disc(...CQ(x, y - 0.4), 0.6 * u, GD[4]); }
      put(L2, Cr, true);
      for (let k = 0; k < 6; k++) barnacle(L2, ...CQ(-3.6 + k * 1.5 + (k % 2) * 0.4, 0.6 - (k % 3) * 0.9), (0.9 + (k % 3) * 0.35) * u, k + 3);
      barnacle(L2, ...CQ(2.8, -2.2), 1.1 * u, 11);
      put(F.p, L2, true);
      // the crown's jewel and the lantern flame
      glow(F, ...CQ(-0.6, -1.2), 0.8 * u, '#60e0c0');
      flame(F, ...S(-14.6, -23.2), (A1 || hurt ? 3.6 : 2.6 + (idle ? (P.i % 3) * 0.3 : 0)) * u, 2 * u, t, {});
      // the eyestalks, rising out of the broken bow: one tall, one short; glowing eyes
      const E = layer(F), look = A1 ? 0.8 : hurt ? -1 : 0, tw = idle && (P.i === 2 || P.i === 5) ? -1 * u : 0;
      const eyes = [];
      for (const [bx0, h, lean] of [[11, 7 + tw / u, -0.6], [12.6, 5.2, 0.9]]) {
        const base = S(bx0, -7.6), tp = [base[0] + (lean + look) * u, base[1] - (hurt ? h * 0.55 : h) * u];
        tube(E, bez([base, [base[0] + lean * 0.5 * u, base[1] - h * 0.6 * u], tp]), [1 * u, 0.8 * u], CR);
        blob(E, [[tp[0], tp[1], 1.6 * u, 1.8 * u]], EYE);
        eyes.push(tp);
      }
      // mouthparts: layered maxillipeds
      for (let k = 0; k < 3; k++) tube(E, [S(14.6, -5.6 + k * 1.2), S(15.6 + (idle ? sin(t + k * 0.3) * 0.4 : 0), -4.6 + k * 1.3)], [0.8 * u, 0.5 * u], CRd);
      put(F.p, E, true);
      for (const e of eyes) {
        if (hurt) F.p.line(R(e[0] - 1.2 * u), R(e[1]), R(e[0] + 1.2 * u), R(e[1] + 0.4 * u), C(VOID));
        else eyeGlow(F, e[0] - 0.7 * u, e[1] - 0.8 * u, Math.max(2, 1.4 * u), Math.max(2, 1.6 * u), o.c3);
      }
      // the crusher claw: resting on the ground before it; raised gaping; slammed down
      const L3 = layer(F);
      const sh = S(12, -3.2);
      const wr = A1 ? [sh[0] + 4 * u, sh[1] - 13 * u] : A2 ? [sh[0] + 12 * u, oy - 5.4 * u] : hurt ? [sh[0] + 3 * u, sh[1] - 8 * u] : [sh[0] + 7 * u, oy - 7.6 * u + (idle ? sin(t) * 0.4 * u : run ? sin(t * 2) * 0.8 * u : 0)];
      const ca = A1 ? -0.9 : A2 ? 0.45 : hurt ? -1.3 : -0.05;
      const el = ik(sh, wr, 6 * u, 6 * u, A1 ? -1 : 1);
      tube(L3, [sh, el], [2.6 * u, 2.2 * u], CR, { tex: 2 });
      tube(L3, [el, wr], [2.2 * u, 2.4 * u], CR, { tex: 3 });
      L3.disc(el[0], el[1] - 0.6 * u, 0.9 * u, CR[4]);
      crabClaw(L3, F, wr, ca, A1 ? 0.95 : A2 ? 0.02 : hurt ? 0.6 : idle && (P.i === 1 || P.i === 4) ? 0.4 : 0.14, 2.3, CR, CRd, { knobs: 5 });
      legs(false);
      put(F.p, L3, true);
      legs(false);
      // bubbles from the mouth; spray and grit on the slam
      if (idle) for (let k = 0; k < 2; k++) bubble(F, ...S(16.6 + k, -7 - ((P.i * 0.5 + k * 1.3) % 3) * 1.6), (0.9 - k * 0.3) * u);
      if (A2) for (let k = 0; k < 6; k++) { const x = wr[0] + (k - 1) * 2.4 * u, y = oy - (1 + (k % 3)) * u; F.p.set(R(x), R(y), pal5('sand', 6)[3]); F.p.set(R(x) + 1, R(y), pal5('sand', 6)[4]); }
      if (hurt) for (let k = 0; k < 4; k++) { const p0 = S(10 + k * 0.8, -9 - k * 1.6); F.p.line(R(p0[0]), R(p0[1]), R(p0[0] + 1.6 * u), R(p0[1] - 0.8 * u), WD[2]); }
      F.mouth = S(15.6, -5);
    },
  },
};
