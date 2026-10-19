// Hand-built monster designs: the Maw and the Hollow Deep. See kit.js for the design format and
// docs/BESTIARY.md for the concepts. These live on dark plum / violet cave floors, so every body
// sits a clear step brighter than the ground and carries one glow (aether, lantern gold, ember, teal).
import { C, R, ramp, pal5, layer, bez, cyl, underside, put, blob, tube, horn, slab, facet, shard, ik, stride, sin, cos, lerp, clamp, glow, flame, eyeGlow, eyeBead, teeth, maw, spots, stripes, crack, over, rimLight, tint, light, dark, mixc, hash2, srand, WHITE, VOID, BONE, BONE_D, MAW_D, PAL } from './kit.js';

// ------------------------------------------------------------------ local helpers
const TAU = Math.PI * 2;
// set a pixel in the colour buffer and the glow buffer
const lit = (F, x, y, c) => { x = R(x); y = R(y); F.p.set(x, y, C(c)); F.e.set(x, y, C(c)); };
// a star: a single glint, or a 4-point twinkle when big, in colour + glow (only over opaque pixels
// of `L` when given, so stars stay inside their window of sky)
function star(F, x, y, big, c, L = null) {
  x = R(x); y = R(y);
  const pts = big ? [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] : [[0, 0]];
  for (const [dx, dy] of pts) {
    if (L && L.a(x + dx, y + dy) < 100) continue;
    lit(F, x + dx, y + dy, dx || dy ? c : big ? '#fff4fb' : c);
  }
}
// a scatter of stars inside an ellipse; `t` re-picks which ones twinkle
function starfield(F, cx, cy, rx, ry, n, seed, t, L = null, cols = ['#c860f0', '#f5afd6', '#a8d0ec']) {
  const r = srand(seed);
  for (let k = 0; k < n; k++) {
    const a = r() * TAU, d = Math.sqrt(r()), ph = r(), ci = Math.floor(r() * cols.length);
    const x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d;
    const tw = (ph + t) % 1;
    if (tw < 0.18) continue;                       // blinked out this frame
    star(F, x, y, tw > 0.82 && k % 3 === 0, cols[ci], L);
  }
}

// an almond cat's eye w x h (odd w best), glowing colour c, with a vertical slit pupil at dx
function almond(F, x, y, w, h, c, dx = 0, lid = null) {
  x = R(x); y = R(y);
  const cc = C(c), hi = light(cc, 1.3);
  if (lid) F.p.rrect(x - 1, y - 1, w + 2, h + 2, C(lid), 1);
  for (let j = 0; j < h; j++) {
    const inset = h >= 3 && (j === 0 || j === h - 1) ? 1 : 0;
    for (let i = inset; i < w - inset; i++) { const k = j === 0 && i <= inset + 1 ? hi : cc; F.p.set(x + i, y + j, k); F.e.set(x + i, y + j, k); }
  }
  const px = x + (w >> 1) + dx;
  for (let j = 0; j < h; j++) if (!(h >= 3 && (j === 0 || j === h - 1)) || h < 3) F.p.set(px, y + j, VOID); else F.p.set(px, y + j, dark(cc, 0.6));
  return F;
}

// rotate point p about pivot c by angle a
const rotP = (p, c, a) => { const dx = p[0] - c[0], dy = p[1] - c[1], ca = Math.cos(a), sa = Math.sin(a); return [c[0] + dx * ca - dy * sa, c[1] + dx * sa + dy * ca]; };

// A miner's lantern hanging from a hook at (x, y): brass cap and ring, a barred glass cage, a flame
// inside (into p and e). k = size in px per unit, t = flicker phase, dim = guttering
function lantern(F, x, y, k, t, dim = false, rampG = null) {
  const G = rampG || pal5('gold', 5), L = layer(F);
  const w = 2.4 * k, h = 3.2 * k, top = y + 1.2 * k;
  L.ring(x, y + 0.4 * k, Math.max(1, 0.7 * k), G[2], 1);                                   // handle ring
  slab(L, [[x - w * 0.6, top], [x + w * 0.6, top], [x + w * 0.45, top - 0.7 * k], [x - w * 0.45, top - 0.7 * k]], G);   // cap
  L.rect(R(x - w * 0.5), R(top), Math.max(2, R(w)), Math.max(2, R(h)), C(dim ? '#4a3a2a' : '#f8b848'));                 // glass
  slab(L, [[x - w * 0.62, top + h], [x + w * 0.62, top + h], [x + w * 0.5, top + h + 0.8 * k], [x - w * 0.5, top + h + 0.8 * k]], G);   // base
  put(F.p, L, true);
  // the flame behind the glass: a hot core, emissive
  const gl = dim ? ['#7a1e14', '#c2401c'] : ['#ec7a2a', '#fff0b0'];
  for (const Lx of [F.p, F.e]) {
    Lx.rect(R(x - w * 0.5), R(top), Math.max(2, R(w)), Math.max(2, R(h)), C(dim ? '#7a3a1c' : '#f8b848'));
    const fh = h * (dim ? 0.35 : 0.7 + sin(t) * 0.1);
    Lx.ellipse(x + (dim ? 0 : sin(t * 2) * 0.3 * k), top + h - fh * 0.5, Math.max(0.6, w * 0.22), fh * 0.5, C(gl[0]));
    Lx.ellipse(x, top + h - fh * 0.35, Math.max(0.5, w * 0.12), fh * 0.3, C(gl[1]));
  }
  // cage bars over the glass
  F.p.line(x - w * 0.5, top, x - w * 0.5, top + h - 1, G[1]); F.p.line(R(x - w * 0.5) + Math.max(2, R(w)) - 1, top, R(x - w * 0.5) + Math.max(2, R(w)) - 1, top + h - 1, G[1]);
  if (w >= 4) F.p.line(x, top, x, top + h - 1, G[1]);
  F.p.set(R(x - w * 0.5) + 1, R(top) + 1, C('#fff4dc'));
  return [x, top + h * 0.5];
}

// enemy id -> { design, name, body? }: folded into src/data/enemies.js at integration
export const assign = {
  void_wretch: { design: 'star_wretch', name: 'Star-Eaten Wretch' },
  shadow_stalker: { design: 'sky_panther', name: 'Constellation Panther' },
  void_eye: { design: 'ophan', name: 'Ophan' },
  deep_crawler: { design: 'cart_crawler', name: 'Cart Crawler' },
  lantern_lurker: { design: 'lantern_toad', name: 'Lantern Lurker' },
};

export default {
  // Star-Eaten Wretch (void_wretch): a hungry ghost (the gaki / preta, forever starving) that ate the
  // night sky and is still hungry. A gaunt crawler on spidery, far-too-long arms; where its face should
  // be is a round hole full of stars, the brightest of which drifts like a pupil and watches you.
  star_wretch: {
    view: 'side', box: [32, 22], pivot: 0.42, idleFps: 3.5, scale: 1.1,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const S = ramp('#a493b0'), Sd = S.map((c) => dark(c, 0.78)), N = ramp('#5a4870');
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle', a1 = P.atk === 1, a2 = P.atk === 2, hurt = P.hurt;
      const breathe = idle ? sin(t) * 0.5 * u : 0, bob = run ? Math.abs(sin(t)) * 0.8 * u : 0;
      // torso: hips low at the back, bony shoulders high in front
      let hip = [ox - 6 * u, oy - 8 * u - bob * 0.5], sh = [ox + 2.5 * u, oy - 12.5 * u + breathe - bob];
      if (a1) { hip = [ox - 7 * u, oy - 7.5 * u]; sh = [ox - 1.5 * u, oy - 16 * u]; }
      if (a2) { hip = [ox - 4 * u, oy - 7 * u]; sh = [ox + 6 * u, oy - 9.5 * u]; }
      if (hurt) { hip = [ox - 7.5 * u, oy - 8.5 * u]; sh = [ox + 0.5 * u, oy - 13.5 * u]; }
      const L = layer(F);
      // legs: crouched, knees forward like a frog's
      const leg = (far, ph) => {
        const Lg = layer(F), Rl = far ? Sd : S;
        const h0 = [hip[0] + (far ? 1 * u : 0), hip[1] + 1 * u];
        const [dx, lift] = run ? stride(ph, 5 * u, 2 * u) : [a2 ? -2 * u : 0, 0];
        const foot = [h0[0] + 2.5 * u + dx, oy - lift - 0.6 * u];
        const knee = ik(h0, foot, 5.2 * u, 5.6 * u, -1);
        tube(Lg, [h0, knee], [1.5 * u, 1 * u], Rl);
        tube(Lg, [knee, foot], [0.95 * u, 0.6 * u], Rl);
        tube(Lg, [[foot[0] - 1 * u, foot[1]], [foot[0] + 2 * u, foot[1] + 0.3 * u]], [0.7 * u, 0.4 * u], Rl);
        put(L, Lg, !far);
        return Lg;
      };
      // arms: far too long (the near one longer still), elbows jutting high like a spider's
      const arm = (far, ph) => {
        const Lg = layer(F), Rl = far ? Sd : S, l1 = (far ? 6.8 : 7.8) * u, l2 = (far ? 8.4 : 9.8) * u;
        const s0 = [sh[0] + (far ? 1.2 * u : -0.4 * u), sh[1] + 0.8 * u];
        let hand;
        if (a1) hand = [s0[0] - (far ? 1 : 3) * u, s0[1] - 8 * u];                  // flung up and back, claws over the head
        else if (a2) hand = [s0[0] + (far ? 12.5 : 15.5) * u, oy - (far ? 2.5 : 1) * u]; // raked far forward
        else if (hurt) hand = [s0[0] + 6 * u, oy - 1.5 * u];
        else {
          const [dx, lift] = run ? stride(ph, 6 * u, 3 * u) : [idle && !far ? sin(t) * 0.5 * u : 0, 0];
          hand = [s0[0] + (far ? 7 : 8.5) * u + dx, oy - lift - 0.5 * u];
        }
        const elbow = ik(s0, hand, l1, l2, a1 ? 1 : -1);
        tube(Lg, [s0, elbow], [1.3 * u, 0.9 * u], Rl);
        tube(Lg, [elbow, hand], [0.9 * u, 0.6 * u], Rl);
        Lg.disc(elbow[0], elbow[1], 0.9 * u, Rl[3]); Lg.set(R(elbow[0] - 0.3 * u), R(elbow[1] - 0.6 * u), Rl[4]);
        // claws: long and splayed, bone-pale
        const da = a1 ? -2.1 : a2 ? 0.25 : 0.1;
        for (let k = -1; k <= 1; k++) {
          const a = da + k * 0.45, l = (k === 0 ? 3.4 : 2.6) * u;
          horn(Lg, hand, [hand[0] + Math.cos(a) * l * 0.6, hand[1] + Math.sin(a) * l * 0.6 - 0.6 * u], [hand[0] + Math.cos(a) * l, hand[1] + Math.sin(a) * l], 0.85 * u, ramp(BONE_D));
        }
        put(L, Lg, !far);
        return Lg;
      };
      arm(true, t + 0.5);
      leg(true, t + 0.25);
      // torso: a starved barrel, ribs and spine knobs showing
      const B = layer(F);
      tube(B, [hip, [lerp(hip[0], sh[0], 0.55), lerp(hip[1], sh[1], 0.55) - 1 * u], sh], (q) => lerp(2.2, 3.4, q) * u, S);
      blob(B, [[sh[0] - 0.6 * u, sh[1] - 0.4 * u, 2.8 * u, 2.6 * u]], S);
      const ang = Math.atan2(sh[1] - hip[1], sh[0] - hip[0]);
      for (let k = 0; k < 4; k++) {   // ribs: short dark arcs across the flank
        const f = 0.4 + k * 0.13, rx = lerp(hip[0], sh[0], f), ry = lerp(hip[1], sh[1], f);
        for (let s = -0.4; s <= 1.2; s += 0.25) over(B, rx + Math.cos(ang + Math.PI / 2) * s * u * 1.6 - Math.cos(ang) * s * u * 0.5, ry + Math.sin(ang + Math.PI / 2) * s * u * 1.6, S[1]);
      }
      for (let k = 0; k < 5; k++) {   // spine knobs along the back
        const f = 0.15 + k * 0.18, kx = lerp(hip[0], sh[0], f) + Math.cos(ang - Math.PI / 2) * 2.4 * u, ky = lerp(hip[1], sh[1], f) + Math.sin(ang - Math.PI / 2) * (2.2 + f) * u;
        B.disc(kx, ky, Math.max(0.8, 0.6 * u), S[4]);
      }
      // the hungry ghost's swollen belly: stars it swallowed shine through the stretched skin
      const bx = lerp(hip[0], sh[0], 0.45), by = lerp(hip[1], sh[1], 0.45) + 2.4 * u;
      blob(B, [[bx, by, 3.4 * u, 2.6 * u]], S, { lift: -0.1 });
      put(L, B, true);
      const nearLeg = leg(false, t + 0.75);
      const nearArm = arm(false, t);
      // head: a round flesh hood thrust forward; the face is a hole into the night sky
      const hx = sh[0] + (a2 ? 4 : 3.4) * u, hy = sh[1] - (a1 ? 1.5 : 0.6) * u + (hurt ? -0.6 * u : 0);
      const tilt = hurt ? -0.8 * u : idle ? sin(t + 0.25) * 0.3 * u : 0;
      const H = layer(F);
      blob(H, [[hx, hy + tilt, 4.4 * u, 4.2 * u], [hx - 2.6 * u, hy + 1 * u, 2.2 * u, 2 * u]], S);
      // hole: a ragged oval, wide open on the wind-up, squeezed on the hurt frame
      const fx = hx + 1.5 * u, fy = hy + 0.3 * u + tilt;
      const frx = (a1 ? 3.1 : hurt ? 1.9 : 2.8) * u, fry = (a1 ? 3.6 : hurt ? 2.4 : 3.2) * u;
      H.ellipse(fx + 0.2 * u, fy + 0.2 * u, frx + 0.9 * u, fry + 0.9 * u, C('#f3e1b5'));   // a puckered pale lip round the hole
      H.ellipse(fx - 0.2 * u, fy - 0.2 * u, frx + 0.5 * u, fry + 0.5 * u, S[1]);
      const Hole = layer(F);
      Hole.ellipse(fx, fy, frx, fry, C('#2a1046'));
      Hole.ellipse(fx + 0.3 * u, fy + 0.3 * u, frx * 0.72, fry * 0.72, C('#1a0a2c'));
      // a faint nebula swirl turning inside
      for (let s = 0; s < 1; s += 0.05) {
        const a = s * 4 + t * TAU, rr = s * Math.min(frx, fry) * 0.9;
        over(Hole, fx + Math.cos(a) * rr * 0.8, fy + Math.sin(a) * rr, '#4a1664');
      }
      put(H, Hole, false);
      put(L, H, true);
      put(F.p, L, false);
      // stars in the hole; the brightest one is the pupil and looks ahead (or flees on the hurt frame)
      starfield(F, fx, fy, frx * 0.85, fry * 0.85, 11, 41, t, Hole);
      // swallowed stars glowing through the belly skin
      const r = srand(7);
      for (let k = 0; k < 6; k++) { const a = r() * TAU, d = Math.sqrt(r()), tw = (r() + t) % 1; const sx = R(bx + Math.cos(a) * 2.2 * u * d), sy = R(by + 0.6 * u + Math.sin(a) * 1.4 * u * d); if (nearLeg.a(sx, sy) || nearArm.a(sx, sy) || H.a(sx, sy)) continue; if (tw > 0.3) lit(F, bx + Math.cos(a) * 2.2 * u * d, by + 0.6 * u + Math.sin(a) * 1.4 * u * d, tw > 0.75 ? '#f5afd6' : '#a026ef'); }
      const px = fx + (a2 ? 0.9 : hurt ? -0.6 : 0.5) * u, py = fy + (hurt ? 1 : -0.4) * u;
      star(F, px, py, !hurt, '#f5afd6', Hole);
      if (a1 || a2) star(F, px - 1.2 * u, py + 1.2 * u, false, '#fff4fb', Hole);
      // stardust drips from the hole (idle / run) or sprays out (hurt)
      if (hurt) for (let k = 0; k < 5; k++) { const a = -2.4 + k * 0.5; lit(F, fx + Math.cos(a) * (frx + 2.2 * u), fy + Math.sin(a) * (fry + 2 * u), k % 2 ? '#f5afd6' : '#c860f0'); }
      else { const d = ((t * 2) % 1); lit(F, fx + 0.6 * u, fy + fry + 1 * u + d * 4 * u, '#c860f0'); }
      F.mouth = [fx, fy];
    },
  },
  // Constellation Panther (shadow_stalker): the night jaguar whose spotted pelt is the starry sky (the
  // Mesoamerican sky-jaguar). Its twist: it is not spotted with stars, it is cut out of them. A lean
  // panther-shaped window onto the night, its anatomy traced in constellation lines, the joints bright
  // stars, and two extra eyes opening on its shoulder blade. The tail ends in a comet.
  sky_panther: {
    view: 'side', box: [36, 19], pivot: 0.52, idleFps: 3, scale: 1.15,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      // a night-sky ramp: indigo shadow, deep blue base, a periwinkle starlight edge
      const B = [C('#120c30'), C('#1a0f47'), C('#172d64'), C('#243e7b'), C('#3973af')], Bd = B.map((c) => dark(c, 0.82));
      const EDGE = C('#8cb8de'), LINE = C('#c8a4dc'), STAR = '#fff4fb';
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle', a1 = P.atk === 1, a2 = P.atk === 2, hurt = P.hurt;
      const lean = a1 ? -2.4 * u : a2 ? 3 * u : hurt ? -1.4 * u : 0;
      const crouch = a1 ? 1.8 * u : a2 ? -1.4 * u : run ? Math.abs(sin(t)) * -0.7 * u : idle ? sin(t) * 0.25 * u : 0;
      const len = a2 ? 1.2 : 1;
      const bx = ox + lean, by = oy - 8 * u + crouch;
      const sx = bx + 5.4 * u * len, hx0 = bx - 6 * u * len;   // shoulder, hip
      const nodes = [];
      const L = layer(F);
      // tail: long and heavy, hanging in a J and curling up into a comet
      const sway = idle ? sin(t) * 1.2 * u : run ? sin(t) * 1.6 * u : a1 ? -1.5 * u : 0;
      const tailPts = [[hx0 - 1 * u, by - 1.2 * u], [hx0 - 7 * u, by + 3.5 * u], [hx0 - 9.5 * u, by - 1 * u + sway * 0.4], [hx0 - 12.5 * u - sway * 0.3, by - 3.5 * u + sway * 0.6]];
      const T = layer(F);
      tube(T, bez(tailPts, 24), (q) => lerp(1.3, 0.8, q) * u, B);
      put(L, T, true);
      const tip = tailPts[3];
      // legs: short and powerful, big soft paws; a rotary gallop
      const leg = (rootX, ph, far, front) => {
        const Lg = layer(F), Rl = far ? Bd : B;
        const root = [rootX, by + 0.6 * u];
        let [dx, lift] = run ? stride(ph, 7 * u, 2.4 * u) : [0, 0];
        if (a2) dx = front ? 5.5 * u : -3.5 * u;
        if (a1) dx = front ? -1 * u : 1.2 * u;
        const paw = [rootX + dx + (front ? 0.6 * u : -0.4 * u), oy - lift - (a2 && front ? 2.2 * u : 0.8 * u)];
        const knee = ik(root, paw, 4 * u, 3.9 * u, front ? 1 : -1);
        tube(Lg, [root, knee], [front ? 1.9 * u : 2.2 * u, 1.2 * u], Rl);
        tube(Lg, [knee, paw], [1.05 * u, 0.9 * u], Rl);
        blob(Lg, [[paw[0] + 0.6 * u, paw[1] + 0.1 * u, 1.4 * u, 0.85 * u]], Rl);
        if (a2 && front) for (let k = 0; k < 3; k++) Lg.set(R(paw[0] + 2 * u), R(paw[1] - 0.5 * u + k), C('#f3e1b5'));
        put(L, Lg, !far);
        if (!far) nodes.push([knee, paw]);
      };
      leg(hx0 + 1 * u, t + 0.6, true, false); leg(sx + 0.8 * u, t + 0.1, true, true);
      // body: heavy shoulders, long low back, tucked waist
      const Bo = layer(F);
      blob(Bo, [[sx, by - 0.6 * u, 4.4 * u, 3.9 * u], [bx, by - 0.2 * u, 6.4 * u * len, 2.9 * u], [hx0, by - 0.6 * u, 3.7 * u, 3.4 * u]], B);
      put(L, Bo, true);
      leg(hx0, t + 0.5, false, false); leg(sx - 0.4 * u, t, false, true);
      // head: broad flat skull held low (stalking), short muzzle, small round ears
      const hx = sx + 5 * u + (a2 ? 1.2 * u : 0), hy = by - 2.2 * u + (a1 ? 1.4 * u : 0) + (hurt ? -1.2 * u : 0);
      const Hd = layer(F);
      tube(Hd, [[sx + 1 * u, by - 2 * u], [hx - 1 * u, hy + 0.2 * u]], [3 * u, 2.4 * u], B);
      slab(Hd, [[hx - 2.4 * u, hy - 0.8 * u], [hx - 1.6 * u, hy - 3.6 * u], [hx - 0.2 * u, hy - 1.6 * u]], B);   // ear
      blob(Hd, [[hx, hy, 2.7 * u, 2.4 * u], [hx + 2.3 * u, hy + 0.8 * u, 1.6 * u, 1.3 * u], [hx + 1.2 * u, hy + 1.6 * u, 1.9 * u, 0.9 * u]], B);
      Hd.set(R(hx - 1.4 * u), R(hy - 2.2 * u), B[0]); Hd.set(R(hx - 1.4 * u), R(hy - 1.8 * u), B[0]);           // inner ear
      Hd.rect(R(hx + 3.4 * u), R(hy + 0.1 * u), 2, 1, C('#4a3266'));                                               // nose
      if (a2 || a1) { // open jaw: a void wedge with fangs
        const open = a2 ? 2 * u : 1 * u;
        facet(Hd, [[hx + 0.4 * u, hy + 1 * u], [hx + 4.2 * u, hy + 1.1 * u], [hx + 3.6 * u, hy + 1.1 * u + open], [hx + 1 * u, hy + 1.6 * u]], '#0e0820');
        teeth(Hd, [hx + 2 * u, hy + 1.1 * u], [hx + 3.8 * u, hy + 1.1 * u], 2, Math.max(1, 0.8 * u), 1);
      }
      put(L, Hd, true);
      // starlight edge along the top-left of the silhouette so the dark body reads on dark floors
      { const w = L.w, A = (x, y) => L.a(x, y) > 100; const E = [];
        for (let y = 0; y < L.h; y++) for (let x = 0; x < w; x++) if (A(x, y) && (!A(x, y - 1) || (!A(x - 1, y) && !A(x, y - 2)))) E.push(x, y);
        for (let i = 0; i < E.length; i += 2) L.set(E[i], E[i + 1], EDGE); }
      put(F.p, L, false);
      // the night inside: faint stars, a nebula smudge, then the constellation figure
      spots(F.p, bx - 1 * u, by + 0.4 * u, 5 * u, 1.4 * u, 3, 1.2 * u, '#2e1f45', 5);
      starfield(F, bx, by, 9 * u, 2.6 * u, 12, 23, t * 0.5, L, ['#a8d0ec', '#f3e1b5', '#c8a4dc']);
      const lineC = (a, b) => { F.p.line(a[0], a[1], b[0], b[1], LINE); F.e.line(a[0], a[1], b[0], b[1], C('#4a3266')); };
      const shoulder = [sx - 0.6 * u, by - 2.4 * u], hip = [hx0 - 0.2 * u, by - 1.6 * u], mid = [bx, by - 1.2 * u], eye = [hx + 0.9 * u, hy - 0.6 * u];
      lineC(tip, tailPts[2]); lineC(tailPts[2], hip); lineC(hip, mid); lineC(mid, shoulder); lineC(shoulder, [hx - 1 * u, hy - 1 * u]);
      for (const [k, p] of nodes) { star(F, k[0], k[1], false, STAR); star(F, p[0] + 0.6 * u, p[1], false, STAR); }
      star(F, hip[0], hip[1], true, STAR); star(F, mid[0], mid[1], false, '#a8d0ec'); star(F, tailPts[2][0], tailPts[2][1], true, STAR);
      // the comet at the tail tip, trailing as it swings
      glow(F, tip[0], tip[1], Math.max(1.4, 1.2 * u), '#a8d0ec');
      for (let k = 1; k <= 3; k++) lit(F, tip[0] + k * 0.7 * u, tip[1] + k * 0.6 * u * (run ? 1.4 : 1), k === 3 ? '#3e6aa8' : '#6aa0d0');
      // shoulder eyes: two almond eyes open on the shoulder blade and blink in turn
      const blink = idle ? Math.floor(t * 4) : -1;
      for (let k = 0; k < 2; k++) {
        const ex = shoulder[0] + (k ? -2.8 : 0) * u, ey = shoulder[1] + (k ? 1.6 : 0.6) * u;
        if (blink === k + 1 || hurt) { F.p.rrect(R(ex) - 1, R(ey) - 1, 7, 4, B[0], 1); F.p.line(ex, ey + 1, ex + 4, ey + 1, C('#6a4a8a')); continue; }
        almond(F, ex, ey, 5, a1 || a2 ? 3 : 3, '#e8c35a', a2 ? 1 : 0, B[0]);
      }
      // the head's own eye: an angled gold slit under a heavy brow; a dark mouth line
      F.p.line(hx + 3.8 * u, hy + 1.2 * u, hx + 1.4 * u, hy + 1.4 * u, B[0]);
      if (hurt) F.p.line(eye[0] - 1, eye[1], eye[0] + 2, eye[1] + 1, C('#e8c35a'));
      else { almond(F, eye[0] - 1, eye[1] - 1, 4, 2, '#e8c35a', 1); F.p.line(eye[0] - 2, eye[1] - 2, eye[0] + 3, eye[1] - 1, B[0]); }
    },
  },
  // Ophan (void_eye): the ophanim, the "wheels within wheels, full of eyes". The twist: these wheels
  // are a tarnished brass armillary sphere, an astronomer's instrument from the sunken observatories,
  // that opened its eyes. Two gimballed rings lined with lidded eyes turn round a great almond eye on
  // a polar axle with finials; when it charges a bolt, every eye on the rings swivels to stare.
  ophan: {
    view: 'front', box: [30, 30], pivot: 0.5, idleFps: 4, hover: true, scale: 0.86,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const G = pal5('gold', 5), Gb = G.map((c) => dark(c, 0.7)), FL = ramp('#8a4078'), IRIS = '#a026ef';
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle', a1 = P.atk === 1, a2 = P.atk === 2, hurt = P.hurt;
      const cx = ox, cy = oy - 15 * u + (idle ? sin(t) * 0.4 * u : 0);
      const spin = (run ? t * 0.5 : idle ? t * 0.25 : 0) + (a2 ? 0.06 : 0);
      const flare = a2 ? 1.14 : a1 ? 0.9 : 1, jolt = hurt ? 0.25 : 0;
      // ring geometry: [rx, ry, tilt, phase sign, eye count]; they coil level on the wind-up and snap open on the strike
      const t0 = a1 ? -0.06 : a2 ? -0.5 : -0.3, t1 = a1 ? 0.06 : a2 ? 0.55 : 0.34;
      const rings = [[11 * u * flare, (a1 ? 3 : 4) * u * flare, t0 + jolt, 1, 4], [(a1 ? 3.4 : 4.4) * u * flare, 11.5 * u * flare, t1 - jolt, -1, 4]];
      const ringPt = (r, a) => { const [rx, ry, tl] = r, x = Math.cos(a) * rx, y = Math.sin(a) * ry; return [cx + x * Math.cos(tl) - y * Math.sin(tl), cy + x * Math.sin(tl) + y * Math.cos(tl)]; };
      // depth: ring 0's lower half and ring 1's right half are toward us
      const front = (k, a) => (k === 0 ? Math.sin(a) > 0 : Math.cos(a) > 0);
      const half = (k, isFront) => {
        const Lr = layer(F), pts = [];
        const runs = [];
        for (let s2 = 0; s2 <= 96; s2++) {
          const a = (s2 / 96) * TAU;
          if (front(k, a) === isFront) pts.push(ringPt(rings[k], a)); else if (pts.length) { runs.push(pts.splice(0)); }
        }
        if (pts.length) runs.push(pts);
        // join a run that wraps round the start
        for (const rr of runs) if (rr.length > 1) tube(Lr, rr, 1.15 * u, isFront ? G : Gb);
        // engraved degree ticks
        for (let s2 = 0; s2 < 24; s2++) { const a = (s2 / 24) * TAU; if (front(k, a) !== isFront) continue; const [x, y] = ringPt(rings[k], a); over(Lr, x, y, isFront ? G[1] : Gb[0]); }
        return Lr;
      };
      const eyesOn = (k, isFront) => {
        const r = rings[k], n = r[4];
        for (let j = 0; j < n; j++) {
          const a = (j / n + spin * r[3] + k * 0.08) * TAU;
          if (front(k, a) !== isFront) continue;
          const [x, y] = ringPt(r, a);
          const ex = R(x - 2), ey = R(y - 1);
          if (!isFront) { F.p.rrect(ex, ey, 4, 3, Gb[0], 1); F.p.rect(ex, ey + 1, 4, 1, FL[1]); continue; }   // the far eyes are shut
          const shut = hurt || (idle && (j + Math.floor(t * 4)) % 3 === 0);
          F.p.rrect(ex - 1, ey - 1, 6, 5, FL[1], 1);
          F.p.rect(ex, ey - 1, 4, 1, FL[3]);
          if (shut) { F.p.rect(ex, ey + 1, 4, 1, FL[0]); F.p.rect(ex, ey, 4, 1, FL[3]); continue; }
          F.p.rrect(ex, ey, 4, 3, C('#f3e1b5'), 1);
          // pupils: wander when idle, all swivel to stare when attacking
          const look = a1 || a2 ? 2 : (hash2(j, k, Math.floor(t * 4)) > 0.5 ? 2 : 1);
          for (const Lx of [F.p, F.e]) Lx.rect(ex + look - 1, ey, 2, 2, C(IRIS));
          F.p.set(ex + look, ey + 1, VOID);
        }
      };
      // axle: a polar rod through everything, finials top and bottom (behind the eye)
      const Ax = layer(F), ah = 13.5 * u;
      tube(Ax, [[cx + 1.2 * u, cy - ah], [cx - 1.2 * u, cy + ah]], 0.7 * u, G);
      blob(Ax, [[cx + 1.3 * u, cy - ah - 0.6 * u, 1.3 * u, 1.3 * u], [cx - 1.3 * u, cy + ah + 0.4 * u, 1.1 * u, 1.1 * u]], G);
      horn(Ax, [cx + 1.3 * u, cy - ah - 1.4 * u], [cx + 1.6 * u, cy - ah - 2.6 * u], [cx + 1.5 * u, cy - ah - 4 * u], 1.2 * u, G);
      put(F.p, Ax, false);
      put(F.p, half(0, false), true); put(F.p, half(1, false), true);
      eyesOn(0, false); eyesOn(1, false);
      // the great eye: an almond of plum lids round a cream eyeball, violet iris, a slit that narrows to charge
      const ew = (a2 ? 7.2 : 6.4) * u, eh = (hurt ? 1.2 : a1 ? 3 : a2 ? 4.8 : 4.2) * u;
      const E = layer(F);
      const lid = [];
      for (let k = 0; k <= 24; k++) { const a = (k / 24) * TAU; lid.push([cx + Math.cos(a) * (ew + 1.4 * u), cy + Math.sin(a) * (eh + 1.6 * u) * (Math.abs(Math.cos(a)) > 0.92 ? 0.6 : 1)]); }
      E.poly(lid.map(([x, y]) => [x, y]), FL[3]);
      blob(E, [[cx, cy, ew + 1.4 * u, eh + 1.6 * u]], FL, { clipY: 9999 });
      put(F.p, E, true);
      // eyeball: an almond made from two arcs
      const Eb = layer(F);
      for (let y = Math.floor(cy - eh); y <= cy + eh; y++) for (let x = Math.floor(cx - ew); x <= cx + ew; x++) {
        const nx = (x + 0.5 - cx) / ew, ny = (y + 0.5 - cy) / eh;
        if (Math.abs(ny) > (1 - nx * nx)) continue;
        Eb.set(x, y, ny < -0.35 && nx < 0.2 ? C('#d9c39a') : C('#f3e1b5'));
      }
      put(F.p, Eb, false);
      if (!hurt) {
        const lk = a1 || a2 ? 1.6 * u : idle ? sin(t) * 1.6 * u : 0.6 * u;
        const ir = Math.min(eh * 0.95, 3.4 * u), ix = cx + lk, iy = cy;
        for (const Lx of [F.p, F.e]) { Lx.disc(ix, iy, ir, C(IRIS)); Lx.disc(ix - ir * 0.2, iy - ir * 0.2, ir * 0.6, C('#c860f0')); }
        F.p.ring(ix, iy, ir, C('#4a1664'), 1);
        const pw = a1 ? 0.6 : a2 ? 2.2 * u : 1.1 * u;              // slit: a thread on the wind-up, a blown pupil on the strike
        F.p.ellipse(ix, iy, Math.max(0.6, pw * 0.5), ir * 0.85, VOID);
        if (a2) { glow(F, ix, iy, 1.2 * u, '#f5afd6'); }
        F.p.set(R(ix - ir * 0.5), R(iy - ir * 0.5), WHITE); F.p.set(R(ix - ir * 0.5) + 1, R(iy - ir * 0.5), WHITE);
        // clip the iris to the almond
        for (let y = Math.floor(cy - eh - 2); y <= cy + eh + 2; y++) for (let x = Math.floor(cx - ew); x <= cx + ew; x++) {
          const nx = (x + 0.5 - cx) / ew, ny = (y + 0.5 - cy) / eh;
          if (Math.abs(ny) > (1 - nx * nx) && Eb.a(x, y) === 0 && E.a(x, y)) { if (Math.hypot(x + 0.5 - ix, y + 0.5 - iy) <= ir + 1) { F.p.set(x, y, E.get(x, y)); F.e.clear(x, y); } }
        }
      } else {
        F.p.line(cx - ew, cy, cx + ew, cy, FL[0]);
        F.p.line(cx - ew * 0.6, cy - 1, cx + ew * 0.6, cy - 1, FL[4]);
      }
      // upper lid line and lashes of brass
      for (let x = Math.floor(cx - ew); x <= cx + ew; x++) { const nx = (x + 0.5 - cx) / ew; const y = cy - eh * (1 - nx * nx); F.p.set(x, R(y) - 1, FL[0]); }
      put(F.p, half(0, true), true); put(F.p, half(1, true), true);
      eyesOn(0, true); eyesOn(1, true);
      // charge: a halo of aether motes drawn toward the pupil on the wind-up
      if (a1) for (let k = 0; k < 10; k++) { const a = k / 10 * TAU + 0.2, d = (k % 2 ? 7 : 9.5) * u; const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.8; lit(F, x, y, k % 2 ? '#c860f0' : '#f5afd6'); lit(F, lerp(x, cx, 0.12), lerp(y, cy, 0.12), '#a026ef'); }
      F.mouth = [cx + 1.6 * u, cy];
    },
  },
  // Cart Crawler (deep_crawler): the Tommyknockers' pet. A giant cave isopod that crawled into an
  // abandoned mine cart as a hatchling and grew into it like a hermit crab into a shell: its armoured
  // head and tail plates jut from either end, a fringe of little legs carries the cart, one iron wheel
  // still spins and the other is a broken stub. It hoards glowing teal ore heaped in the cart and
  // spills it when it lunges.
  cart_crawler: {
    view: 'side', box: [32, 18], pivot: 0.5, idleFps: 3.5,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const CH = ramp('#8e88a6'), CHd = CH.map((c) => dark(c, 0.8)), IR = ramp('#8a4a34'), ST = pal5('steel', 4);
      const ORE = ['#0f2228', '#245458', '#2f9a8a', '#60d8b8', '#c8f4e4'];
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle', a1 = P.atk === 1, a2 = P.atk === 2, hurt = P.hurt;
      const bob = run ? Math.abs(sin(t * 2)) * -0.5 * u : idle ? sin(t) * 0.2 * u : 0;
      const tilt = a1 ? -0.16 : a2 ? 0.12 : hurt ? -0.06 : 0;
      const push = a2 ? 2 * u : a1 ? -1 * u : hurt ? -1 * u : 0;
      const cx = ox - 1.5 * u + push, cy = oy - 7.5 * u + bob;        // cart centre
      const piv = [cx + 4 * u, cy + 3.5 * u];
      const rp = (x, y) => rotP([cx + x * u, cy + y * u], piv, tilt);
      const L = layer(F);
      // far legs: a fringe of short jointed legs, rippling in a wave
      const legs = (far) => {
        const Lg = layer(F), Rl = far ? CHd : CH;
        for (let k = 0; k < 5; k++) {
          const rx = -6.4 + k * 2.4 + (far ? 1 : 0);
          const hip = rp(rx, 3.6);
          const ph = t * (run ? 1 : 0.5) + k * 0.2 + (far ? 0.5 : 0);
          const [dx, lift] = run ? stride(ph, 2.4 * u, 1.2 * u) : [idle ? sin(ph) * 0.3 * u : 0, 0];
          const foot = [hip[0] + 0.8 * u + dx, oy - lift];
          const knee = ik(hip, foot, 2.4 * u, 2.6 * u, -1);
          tube(Lg, [hip, knee], [0.6 * u, 0.45 * u], Rl); tube(Lg, [knee, foot], [0.45 * u, 0.3 * u], Rl);
          Lg.set(R(knee[0]), R(knee[1]) - 1, Rl[4]);
        }
        put(L, Lg, !far);
      };
      legs(true);
      // tail plates (pleotelson + two forked uropods) out of the back
      const Tl = layer(F);
      const tb = rp(-8.4, 1.6);
      blob(Tl, [[tb[0], tb[1], 1.7 * u, 2.7 * u]], CH);
      blob(Tl, [[tb[0] - 1.5 * u, tb[1] + 0.9 * u, 1.4 * u, 2 * u]], CH);
      blob(Tl, [[tb[0] - 2.7 * u, tb[1] + 1.6 * u, 1.1 * u, 1.4 * u]], CH);
      const uw = idle ? sin(t) * 0.3 * u : 0;
      horn(Tl, [tb[0] - 3 * u, tb[1] + 2.2 * u], [tb[0] - 4 * u, tb[1] + 2.6 * u + uw], [tb[0] - 4.8 * u, tb[1] + 2.4 * u + uw], 0.8 * u, CHd);
      horn(Tl, [tb[0] - 3 * u, tb[1] + 1.4 * u], [tb[0] - 4 * u, tb[1] + 1.2 * u - uw], [tb[0] - 4.7 * u, tb[1] + 0.6 * u - uw], 0.8 * u, CH);
      put(L, Tl, true);
      // the ore heap: teal crystals poking above the rim (behind the front wall of the cart)
      const O = layer(F);
      blob(O, [[cx - 1.5 * u, cy - 3.6 * u, 6 * u, 1.8 * u]], ramp('#3e4a5a'));
      const oreR = srand(19);
      const shardsAt = [[-6.4, 0.5, -2.0], [-4.2, 1.0, -1.3], [-1.8, 1.5, -1.7], [0.6, 0.9, -1.15], [2.8, 0.5, -1.95], [-0.4, 0.6, -2.2]];
      void oreR;
      for (const [sx2, sl, sa] of shardsAt) {
        const b0 = rp(sx2, -3), len = (2.8 + sl * 2.6) * u;
        shard(O, b0[0], b0[1], sa + tilt, len, 1.6 * u, ORE.map((c) => C(c)), {});
      }
      put(L, O, true);
      // the cart: a tapered iron tub with riveted bands, rust streaks, a lip
      const Ca = layer(F);
      const body = [rp(-9.2, -3.4), rp(5.8, -3.4), rp(3.9, 3.6), rp(-7.3, 3.6)];
      slab(Ca, body, IR, { wide: true });
      for (const bxx of [-5.2, 1.4]) { const a = rp(bxx, -3.2), b = rp(bxx - 0.3, 3.4); tube(Ca, [a, b], 0.6 * u, ST); }
      const lipA = rp(-9.7, -3.6), lipB = rp(6.3, -3.6);
      tube(Ca, [lipA, lipB], 0.75 * u, ST);
      for (const [rx2, ry2] of [[-7.4, -1.8], [-7.2, 1.8], [3.6, -1.8], [3.4, 1.8], [-1.9, -1.8], [-1.9, 1.8]]) { const q = rp(rx2, ry2); Ca.set(R(q[0]), R(q[1]), ST[4]); Ca.set(R(q[0]) + 1, R(q[1]) + 1, IR[0]); }
      // rust streaks and a teal ore stain dripping from the lip
      for (const [rx2, h2] of [[-3.4, 2.4], [-0.6, 1.4], [3, 2.8]]) { const a = rp(rx2, -2.6); for (let k = 0; k < h2 * u; k++) over(Ca, a[0] - k * tilt, a[1] + k, IR[1]); }
      put(L, Ca, true);
      legs(false);
      // the one good wheel (front) and the broken axle stub (back)
      const wc = rp(2.2, 4.5), wr = 2.5 * u, ang = (run ? -t : 0) * TAU;
      const W = layer(F);
      W.disc(wc[0], wc[1], wr, ST[0]);                                   // iron tyre
      W.disc(wc[0], wc[1], wr - 1.2, IR[1]);                               // rusted dish
      W.disc(wc[0] - 0.5, wc[1] - 0.5, wr - 2, IR[2]);
      for (let k = 0; k < 3; k++) { const a = ang + k * Math.PI / 3; W.line(wc[0] - Math.cos(a) * (wr - 1), wc[1] - Math.sin(a) * (wr - 1), wc[0] + Math.cos(a) * (wr - 1), wc[1] + Math.sin(a) * (wr - 1), ST[3]); }
      for (let a = 3.3; a < 4.6; a += 0.12) W.set(R(wc[0] + Math.cos(a) * (wr - 0.5)), R(wc[1] + Math.sin(a) * (wr - 0.5)), ST[4]);   // lit edge of the tyre
      W.disc(wc[0], wc[1], Math.max(1, 0.7 * u), ST[4]); W.set(R(wc[0]), R(wc[1]), ST[1]);
      put(L, W, true);
      const stub = rp(-5.2, 4);
      L.rect(R(stub[0] - 1), R(stub[1] - 1), 2, 2, ST[0]);
      // head: three overlapping armour plates out of the front, then the rounded head with eye clusters
      const Hd = layer(F);
      const reach = a2 ? 2.8 : a1 ? -0.6 : hurt ? -1.4 : 0, rise = a1 ? -3.2 : a2 ? 1 : 0;
      const segs = [[5.4, 0.6, 2.7, 3], [7.3 + reach * 0.4, 0.8 + rise * 0.4, 2.4, 2.7], [9 + reach * 0.75, 1.1 + rise * 0.75, 2.1, 2.3]];
      for (const [hx2, hy2, rx2, ry2] of segs) {
        const q = rp(hx2, hy2);
        const Sg = layer(F);
        blob(Sg, [[q[0], q[1], rx2 * u * 0.75, ry2 * u]], CH);
        over(Sg, q[0] - rx2 * u * 0.4, q[1] - ry2 * u * 0.6, CH[4]);
        put(Hd, Sg, true);
      }
      const hq = rp(10.6 + reach, 1.6 + rise);
      blob(Hd, [[hq[0], hq[1], 1.9 * u, 1.9 * u]], CH);
      // mandibles: open on the wind-up, snapped shut on the strike
      const mo = a1 ? 1.2 : a2 ? 0.2 : 0.5;
      horn(Hd, [hq[0] + 1 * u, hq[1] + 1 * u], [hq[0] + 2.4 * u, hq[1] + 0.6 * u + mo * u], [hq[0] + 2.8 * u, hq[1] + 1.8 * u + mo * u], 0.9 * u, ramp(BONE_D));
      horn(Hd, [hq[0] + 0.6 * u, hq[1] + 1.4 * u], [hq[0] + 1.8 * u, hq[1] + 2.6 * u], [hq[0] + 2.6 * u, hq[1] + 2 * u], 0.8 * u, ramp(BONE_D));
      put(L, Hd, true);
      // antennae: long, bent, twitching
      const tw = idle ? sin(t * 2) * 0.8 * u : run ? sin(t) * 0.6 * u : 0;
      const ant = (k) => {
        const base = [hq[0] + 0.6 * u, hq[1] - 1.2 * u], up = a1 ? -1.5 : 0;
        const tip = k ? [base[0] + 6 * u, base[1] - (3 + up) * u + tw] : [base[0] + 4.6 * u, base[1] - (5.2 + up) * u - tw];
        L.line(base[0], base[1], lerp(base[0], tip[0], 0.5), lerp(base[1], tip[1], 0.5) - 1.4 * u, k ? CHd[2] : CH[3]);
        L.line(lerp(base[0], tip[0], 0.5), lerp(base[1], tip[1], 0.5) - 1.4 * u, tip[0], tip[1], k ? CHd[2] : CH[3]);
      };
      ant(1); ant(0);
      put(F.p, L, false);
      // glows: the ore that shows above the rim
      for (let y = 0; y < O.h; y++) for (let x = 0; x < O.w; x++) {
        if (!O.a(x, y) || Ca.a(x, y) || Hd.a(x, y)) continue;
        const c = O.get(x, y); if (c[1] > 120) F.e.set(x, y, C(c[1] > 200 ? '#60d8b8' : '#245458'));
      }
      for (const [sx2, sl, sa] of shardsAt) { const b0 = rp(sx2, -3.2), len = (2.6 + sl * 2.4) * u; const tip = [b0[0] + Math.cos(sa + tilt) * len * 0.75, b0[1] + Math.sin(sa + tilt) * len * 0.75]; if (F.p.a(R(tip[0]), R(tip[1]))) lit(F, tip[0], tip[1], ORE[4]); }
      const gl = idle ? Math.floor(t * 4) % 3 : 0;
      const g0 = rp([-3.8, -1.5, 0.6][gl], -4.2); glow(F, g0[0], g0[1], Math.max(1, 0.6 * u), ORE[3]);
      const ec = hurt ? '#2f7070' : '#7cf0c8';
      for (const [dx, dy] of [[0.1, -0.6], [0.9, -0.2], [0.3, 0.3]]) lit(F, hq[0] + dx * u + 0.3 * u, hq[1] + dy * u - 0.2 * u, ec);
      // the strike spills ore forward out of the tipping cart
      if (a2) for (let k = 0; k < 3; k++) { const q = rp(6 + k * 1.6, -4.8 + k * 1.4); shard(F.p, q[0], q[1], -0.6 + k * 0.7, 1.6 * u, 0.7 * u, ORE.map((c) => C(c))); lit(F, q[0], q[1], ORE[4]); }
    },
  },
  // Lantern Lurker (lantern_lurker): the frog-spirits of the old mines meet the deep-sea angler. A squat,
  // warty cave toad that fishes for lost miners: a bony rod grows from its brow with a stolen miner's
  // lantern hooked on the end, swinging in front of a mouth as wide as its body. Its throat sac pulses,
  // its eyes are sleepy slits until the lantern draws you close, then the tongue lashes out.
  lantern_toad: {
    view: 'side', box: [30, 20], pivot: 0.45, idleFps: 3,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const T = pal5('teal', 5), Td = T.map((c) => dark(c, 0.8)), BEL = ramp('#c8c49a'), WART = '#7cbca8';
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle', a1 = P.atk === 1, a2 = P.atk === 2, hurt = P.hurt;
      // a hop cycle when running: crouch, launch, air, land
      const hop = run ? [0, 1.6, 2.4, 0.6][P.i % 4] : 0, squash = run ? [1.08, 0.92, 0.96, 1.1][P.i % 4] : a1 ? 1.06 : 1;
      const rock = a1 ? -1.2 * u : a2 ? 1.6 * u : hurt ? -1 * u : 0;
      const bx = ox + rock, by = oy - 5.2 * u - hop * u + (idle ? sin(t) * 0.2 * u : 0);
      const L = layer(F);
      // hind leg (far, then near): big folded thigh, foot flat on the ground, kicks out on the hop
      const hind = (far) => {
        const Lg = layer(F), Rl = far ? Td : T;
        const hip = [bx - 4.5 * u + (far ? 1 * u : 0), by + 0.5 * u];
        const kick = run && P.i % 4 === 1 ? 1 : 0;
        const foot = kick ? [hip[0] - 5 * u, oy - 0.6 * u] : [hip[0] + 1 * u, oy - 0.6 * u];
        const knee = kick ? [hip[0] - 1.5 * u, hip[1] + 3 * u] : [hip[0] + 3.2 * u, by + 1.5 * u];
        tube(Lg, [hip, knee], [2.6 * u, 1.6 * u], Rl, { tex: 4 });
        tube(Lg, [knee, foot], [1.3 * u, 0.9 * u], Rl);
        tube(Lg, [[foot[0] - 0.6 * u, foot[1]], [foot[0] + 2.4 * u, foot[1] + 0.2 * u]], [0.8 * u, 0.5 * u], Rl);
        put(L, Lg, !far);
      };
      hind(true);
      // body: a low wide sack, the head merged into it, a pale belly
      const B = layer(F);
      blob(B, [[bx - 1.5 * u, by, 7.4 * u * squash, 4.6 * u / squash], [bx + 3.6 * u, by - 0.8 * u, 5.2 * u, 4 * u / squash]], T, { tex: 6 });
      underside(B, [BEL[3], BEL[3], BEL[2], BEL[4]], bx - 6 * u, bx + 8 * u);
      // warts: lighter clusters on the back, a couple of glowing ones near the brow
      spots(B, bx - 2 * u, by - 2.6 * u, 6 * u, 1.6 * u, 9, 0.6 * u, WART, 12);
      spots(B, bx - 2 * u, by - 1.6 * u, 6 * u, 1.6 * u, 6, 0.5 * u, T[1], 13);
      put(L, B, true);
      // throat sac: a pale balloon that pulses under the jaw
      const sac = idle ? 0.7 + (sin(t) * 0.5 + 0.5) * 0.9 : a1 ? 1.5 : 0.6;
      const Sa = layer(F);
      blob(Sa, [[bx + 5.4 * u, by + 2.6 * u, 2.4 * u * sac, 1.6 * u * sac]], BEL);
      put(L, Sa, true);
      // front arm: a stubby splayed hand
      const Fa = layer(F), sh = [bx + 3.4 * u, by + 2 * u], hand = [bx + 5 * u + (a2 ? 1 * u : 0), oy - 0.5 * u];
      tube(Fa, [sh, [sh[0] + 0.4 * u, sh[1] + 2 * u], hand], [1.3 * u, 0.8 * u], T);
      for (let k = -1; k <= 1; k++) tube(Fa, [hand, [hand[0] + 1.3 * u + k * 0.4 * u, hand[1] + 0.3 * u + k * 0.3 * u]], [0.5 * u, 0.4 * u], T);
      put(L, Fa, true);
      hind(false);
      // the mouth: a long downturned lip line, gaping into a maw on the strike
      const mx0 = bx + 0.6 * u, mx1 = bx + 8.6 * u, my = by + 0.8 * u;
      if (a2 || a1) {
        const gape = a2 ? 3.2 * u : 1.2 * u;
        const M = layer(F);
        M.poly([[mx0, my], [mx1 + 0.4 * u, my - (a2 ? 1.2 * u : 0.4 * u)], [mx1 - 0.4 * u, my + gape], [mx0 + 2 * u, my + gape * 0.6]], MAW_D);
        if (a2) teeth(M, [mx0 + 3 * u, my - 0.2 * u], [mx1, my - 0.9 * u], 4, Math.max(1, 0.6 * u), 1);
        put(L, M, false);
      } else {
        // a wide sour grin: a dark lip line with a pale lip under it, turned down at the corner
        for (let x = R(mx0); x <= mx1; x++) { const f = (x - mx0) / (mx1 - mx0), y = R(my + Math.sin(f * Math.PI) * -0.5 * u + f * 0.6 * u); L.set(x, y, VOID); L.set(x, y + 1, f > 0.15 ? BEL[2] : Td[0]); }
        L.set(R(mx0), R(my) + 1, VOID); L.set(R(mx0), R(my) + 2, VOID);
      }
      // eyes: two bulging domes on top of the head, heavy lids; sleepy slits until it strikes
      const E = layer(F);
      const ex = bx + 3.6 * u, ey = by - 4.2 * u;
      blob(E, [[ex, ey, 1.8 * u, 1.5 * u]], T);
      blob(E, [[ex - 2.6 * u, ey + 0.3 * u, 1.4 * u, 1.2 * u]], Td);
      put(L, E, true);
      // the lure rod: a bony fin-ray from the brow, arching forward; the lantern swings on its hook
      const swing = idle ? sin(t) * 0.8 * u : run ? sin(t) * 1.4 * u : a1 ? -2.6 * u : a2 ? 2 * u : 0;
      const rod0 = [bx + 1.8 * u, by - 4.4 * u], rodTip = a1 ? [bx + 6 * u, by - 12.5 * u] : [bx + 12.5 * u + (a2 ? 1.5 * u : 0), by - 8.5 * u + (hurt ? 2 * u : 0)];
      const rod = bez([rod0, [rod0[0] + 2 * u, rod0[1] - 8 * u], rodTip], 20);
      tube(L, rod, (q) => lerp(0.85, 0.45, q) * u, ramp('#9c8a6a'), { rings: 3 });
      put(F.p, L, false);
      const hookX = rodTip[0] + swing * 0.3, hookY = rodTip[1] + 0.6 * u;
      F.p.line(rodTip[0], rodTip[1], hookX, hookY + 2.2 * u, C('#4a3e50'));
      lantern(F, hookX, hookY + 2.2 * u, 1.2 * u, t, hurt);
      // eye shine: a gold slit, wide and round when it means to eat
      const lidC = T[1];
      if (hurt) { F.p.line(ex - 1 * u, ey, ex + 1 * u, ey + 0.4 * u, Td[0]); }
      else if (a1 || a2) { F.p.disc(ex + 0.3 * u, ey, 1 * u, C('#2a1046')); eyeGlow(F, ex, ey - 0.6 * u, Math.max(2, 1.2 * u), Math.max(2, 1.2 * u), '#f8b848'); F.p.rect(R(ex + 0.4 * u), R(ey - 0.4 * u), 1, Math.max(2, R(0.9 * u)), VOID); }
      else {
        F.p.rect(R(ex - 1.2 * u), R(ey - 1.2 * u), R(2.6 * u), R(1.2 * u), lidC);   // heavy lid
        F.p.line(ex - 1.3 * u, ey - 1.2 * u, ex + 1.3 * u, ey - 1.2 * u, T[3]);
        eyeGlow(F, ex - 0.6 * u, ey, Math.max(3, 1.8 * u), 1, '#f8b848');
      }
      // the strike: a sticky tongue lashes out past the lantern
      if (a2) {
        const tg = layer(F), t0 = [mx1 - 1 * u, my + 1 * u], t1 = [mx1 + 8 * u, my - 1 * u];
        tube(tg, bez([t0, [lerp(t0[0], t1[0], 0.5), my + 2.4 * u], t1], 14), [0.9 * u, 0.7 * u], ramp('#cc6a86'));
        blob(tg, [[t1[0] + 0.4 * u, t1[1], 1.4 * u, 1.1 * u]], ramp('#cc6a86'));
        put(F.p, tg, true);
      }
      F.mouth = [mx1, my];
    },
  },
};
