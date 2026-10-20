// Hand-built monster designs: the Maw and the Hollow Deep. See kit.js for the design format and
// docs/BESTIARY.md for the concepts. These live on dark plum / violet cave floors, so every body
// sits a clear step brighter than the ground and carries one glow (aether, lantern gold, ember, teal).
import { C, R, ramp, pal5, layer, bez, cyl, underside, rune, drape, put, blob, tube, horn, slab, facet, shard, ik, stride, sin, cos, lerp, clamp, glow, flame, eyeGlow, eyeBead, teeth, maw, spots, stripes, crack, over, rimLight, tint, light, dark, mixc, hash2, srand, WHITE, VOID, BONE, BONE_D, MAW_D, PAL } from './kit.js';

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

// brick coursing over a layer: mortar lines (dark) and a lit top edge on every brick, only over
// opaque pixels; rows of bh px, bricks bw px wide, staggered every other row
function bricks(L, x0, y0, x1, y1, bw, bh, mortar, hi, seed = 1) {
  const mc = C(mortar), hc = C(hi);
  x0 = Math.floor(x0); y0 = Math.floor(y0); bw = Math.round(bw); bh = Math.round(bh);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (L.a(x, y) < 100) continue;
    const ry = Math.floor((y - y0) / bh), ly = (y - y0) - ry * bh, off = (ry & 1) * Math.floor(bw / 2) + Math.floor(hash2(ry, 0, seed) * 2);
    const lx = ((x - x0 + off) % bw + bw) % bw;
    if (ly === Math.floor(bh) - 1 || lx === 0) L.set(x, y, mc);
    else if (ly === 0 && lx > 1) L.set(x, y, hc);
  }
  return L;
}
// a smoke puff: a small lumpy cloud
function puff(L, x, y, r, Rm) { blob(L, [[x, y, r, r * 0.8], [x - r * 0.7, y + r * 0.3, r * 0.6, r * 0.5], [x + r * 0.6, y + r * 0.2, r * 0.65, r * 0.55]], Rm, { matte: true }); return L; }

// a broken dashed pattern for sound rings / fading magic
const bayerLike = (x, y, k) => ((R(x) + R(y) * 3 + k) % 4) !== 0;

// enemy id -> { design, name, body? }: folded into src/data/enemies.js at integration
export const assign = {
  void_wretch: { design: 'star_wretch', name: 'Star-Eaten Wretch' },
  shadow_stalker: { design: 'sky_panther', name: 'Constellation Panther' },
  void_eye: { design: 'ophan', name: 'Ophan' },
  deep_crawler: { design: 'cart_crawler', name: 'Cart Crawler' },
  lantern_lurker: { design: 'lantern_toad', name: 'Lantern Lurker' },
  stone_golem: { design: 'kiln_golem', name: 'Kiln Golem' },
  cave_troll: { design: 'olm_troll', name: 'Blind Cave Troll' },
  hollow_priest: { design: 'bell_priest', name: 'Bell Priest' },
  magma_golem: { design: 'crucible_golem', name: 'Crucible Golem' },
  rift_spawn: { design: 'rift_spawn', name: 'Rift Spawn' },
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
      blob(B, [[bx - 1.5 * u, by, 7.4 * u * squash, 4.6 * u / squash], [bx + 3.8 * u, by - 1 * u, 5.6 * u, 4.2 * u / squash], [bx + 7.6 * u, by - 0.4 * u, 2.4 * u, 2.3 * u]], T, { tex: 6 });
      underside(B, [BEL[3], BEL[3], BEL[2], BEL[4]], bx - 6 * u, bx + 8 * u);
      // warts: lighter clusters on the back, a couple of glowing ones near the brow
      spots(B, bx - 2 * u, by - 2.6 * u, 6 * u, 1.6 * u, 9, 0.6 * u, WART, 12);
      spots(B, bx - 2 * u, by - 1.6 * u, 6 * u, 1.6 * u, 6, 0.5 * u, T[1], 13);
      put(L, B, true);
      // throat sac: a pale balloon that pulses under the jaw
      const sac = idle ? 0.7 + (sin(t) * 0.5 + 0.5) * 0.9 : a1 ? 1.5 : 0.6;
      const Sa = layer(F);
      blob(Sa, [[bx + 6 * u, by + 2.6 * u + 0.4 * u * sac, 2.4 * u * sac, 1.5 * u * sac]], BEL);
      put(L, Sa, true);
      // front arm: a stubby splayed hand
      const Fa = layer(F), sh = [bx + 3.4 * u, by + 2 * u], hand = [bx + 5 * u + (a2 ? 1 * u : 0), oy - 0.5 * u];
      tube(Fa, [sh, [sh[0] + 0.4 * u, sh[1] + 2 * u], hand], [1.3 * u, 0.8 * u], T);
      for (let k = -1; k <= 1; k++) tube(Fa, [hand, [hand[0] + 1.3 * u + k * 0.4 * u, hand[1] + 0.3 * u + k * 0.3 * u]], [0.5 * u, 0.4 * u], T);
      put(L, Fa, true);
      hind(false);
      // the mouth: a long downturned lip line, gaping into a maw on the strike
      const mx0 = bx + 1.2 * u, mx1 = bx + 9.9 * u, my = by - 0.2 * u;
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
  // Kiln Golem (stone_golem): the dwarves' answer to the clay golem of legend: instead of a holy word
  // on the brow, a fire in the belly. A walking brick furnace on stumpy pillar legs, the firebox door
  // its grated mouth, a chimney stack for a head with two vent-slit eyes, and one arm forged into a
  // pickaxe. It puffs smoke as it idles and belches a black cloud when it swings.
  kiln_golem: {
    view: 'side', box: [30, 28], pivot: 0.45, idleFps: 3, scale: 0.78,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const S = pal5('stone', 5), Sd = S.map((c) => dark(c, 0.8)), BR = ramp('#a07a72'), IR = pal5('steel', 4), PK = pal5('steel', 6), SM = ramp('#5e5468');
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle', a1 = P.atk === 1, a2 = P.atk === 2, hurt = P.hurt;
      const step = run ? sin(t) : 0, bob = run ? Math.abs(sin(t)) * -0.6 * u : idle ? sin(t) * 0.2 * u : 0;
      const lean = a1 ? -0.8 * u : a2 ? 1.4 * u : hurt ? -1 * u : 0;
      const bx = ox + lean, hipY = oy - 6 * u + bob, topY = oy - 17.5 * u + bob;
      const heat = a1 ? 1 : a2 ? 1.3 : hurt ? 0.3 : 0.7 + sin(t * 2) * 0.1;
      const L = layer(F);
      // legs: short pillars of stacked stone with iron-shod feet
      const leg = (far, ph) => {
        const Lg = layer(F), Rl = far ? Sd : S;
        const hip = [bx + (far ? 1.6 : -1.4) * u, hipY];
        const [dx, lift] = run ? stride(ph, 4 * u, 1.4 * u) : [a2 && !far ? 1.2 * u : 0, 0];
        const foot = [hip[0] + dx, oy - lift - 1 * u];
        tube(Lg, [hip, foot], [2 * u, 1.7 * u], Rl, { tex: 9 });
        slab(Lg, [[foot[0] - 2.2 * u, foot[1] - 0.4 * u], [foot[0] + 2.8 * u, foot[1] - 0.4 * u], [foot[0] + 3 * u, foot[1] + 1 * u], [foot[0] - 2.2 * u, foot[1] + 1 * u]], far ? IR.map((c) => dark(c, 0.8)) : IR);
        put(L, Lg, !far);
      };
      // far arm: a stone mitt
      const shY = topY + 3.6 * u;
      const farArm = () => {
        const Lg = layer(F), sh = [bx + 3 * u, shY];
        const hand = a1 ? [sh[0] - 3 * u, sh[1] - 4 * u] : a2 ? [sh[0] + 4 * u, sh[1] + 5 * u] : [sh[0] + 1 * u + step * 1.5 * u, sh[1] + 7.5 * u];
        const el = ik(sh, hand, 4 * u, 4 * u, -1);
        tube(Lg, [sh, el, hand], [1.8 * u, 1.5 * u], Sd, { tex: 5 });
        blob(Lg, [[hand[0], hand[1], 1.9 * u, 1.7 * u]], Sd);
        put(L, Lg, false);
      };
      farArm();
      leg(true, t + 0.5);
      // the kiln body: a squat beehive of brick on a stone plinth
      const K = layer(F), kw = 6.6 * u;
      const body = [[bx - kw, hipY + 0.6 * u], [bx + kw, hipY + 0.6 * u], [bx + kw, topY + 4 * u]];
      for (let k = 0; k <= 12; k++) { const a = k / 12 * Math.PI; body.push([bx + Math.cos(a) * kw, topY + 4 * u - Math.sin(a) * 4 * u]); }
      body.push([bx - kw, topY + 4 * u]);
      slab(K, body, BR, { wide: true });
      // round-shade the dome: darker toward the back-bottom, lit top-left
      for (let y = 0; y < K.h; y++) for (let x = 0; x < K.w; x++) if (K.a(x, y)) { const nx = (x - bx) / kw, ny = (y - (topY + 6 * u)) / (8 * u); if (nx > 0.62 || ny > 0.75) over(K, x, y, BR[2]); else if (nx < -0.55 && ny < 0.1) over(K, x, y, BR[4]); }
      bricks(K, bx - kw, topY - 1 * u, bx + kw, hipY, Math.max(5, R(3.6 * u)), Math.max(3, R(2 * u)), BR[1], BR[4], 3);
      // stone plinth band at the base
      slab(K, [[bx - kw - 0.4 * u, hipY - 1 * u], [bx + kw + 0.4 * u, hipY - 1 * u], [bx + kw + 0.2 * u, hipY + 1 * u], [bx - kw - 0.2 * u, hipY + 1 * u]], S);
      put(L, K, true);
      // the firebox door: an iron frame and a grate of bars across the glow (its mouth)
      const dx0 = bx - 3.2 * u, dy0 = hipY - 6.6 * u, dw = 5.4 * u, dh = 4.8 * u;
      const D = layer(F);
      slab(D, [[dx0, dy0], [dx0 + dw, dy0 - 0.4 * u], [dx0 + dw, dy0 + dh], [dx0, dy0 + dh]], IR, { wide: true });
      put(L, D, true);
      leg(false, t);
      // chimney head: a brick stack leaning with the body, a cap, and two vent-slit eyes
      const tilt = hurt ? -1.2 * u : a1 ? -0.6 * u : a2 ? 1 * u : 0;
      const cx0 = bx + 0.2 * u, cTop = topY - 6.8 * u;
      const Ch = layer(F);
      slab(Ch, [[cx0 - 2 * u, topY + 0.4 * u], [cx0 + 2.4 * u, topY + 0.4 * u], [cx0 + 2.2 * u + tilt, cTop], [cx0 - 1.8 * u + tilt, cTop]], BR, { wide: true });
      bricks(Ch, cx0 - 2.4 * u, cTop, cx0 + 3.6 * u, topY, Math.max(5, R(2.8 * u)), Math.max(3, R(1.8 * u)), BR[1], BR[4], 5);
      slab(Ch, [[cx0 - 2.6 * u + tilt, cTop + 0.2 * u], [cx0 + 3 * u + tilt, cTop + 0.2 * u], [cx0 + 2.6 * u + tilt, cTop - 1.4 * u], [cx0 - 2.2 * u + tilt, cTop - 1.4 * u]], S);
      // an iron brow band across the face of the stack
      slab(Ch, [[cx0 - 2.1 * u + tilt * 0.7, cTop + 2.4 * u], [cx0 + 2.5 * u + tilt * 0.7, cTop + 1.6 * u], [cx0 + 2.5 * u + tilt * 0.7, cTop + 2.6 * u], [cx0 - 2.1 * u + tilt * 0.7, cTop + 3.4 * u]], IR);
      put(L, Ch, true);
      // near arm: stacked stones ending in a pickaxe head fused at the wrist
      const Ar = layer(F), sh = [bx + 4.8 * u, shY];
      let hand;
      if (a1) hand = [sh[0] - 3.4 * u, sh[1] - 6.6 * u];
      else if (a2) hand = [sh[0] + 7 * u, sh[1] + 5 * u];
      else if (hurt) hand = [sh[0] - 0.4 * u, sh[1] + 6.6 * u];
      else hand = [sh[0] + 1.6 * u - step * 1.6 * u, sh[1] + 7 * u];
      const el = ik(sh, hand, 4.4 * u, 4.4 * u, a1 ? -1 : 1);
      blob(Ar, [[sh[0], sh[1], 2.6 * u, 2.4 * u]], S, { tex: 5 });
      tube(Ar, [sh, el], [2 * u, 1.7 * u], S, { tex: 5 });
      tube(Ar, [el, hand], [1.7 * u, 1.5 * u], S, { tex: 5 });
      // the pick: an iron crescent across the end of the forearm
      const fa = Math.atan2(hand[1] - el[1], hand[0] - el[0]), sg = a1 ? -1 : 1, px2 = Math.cos(fa - sg * Math.PI / 2), py2 = Math.sin(fa - sg * Math.PI / 2);
      const head = [hand[0] + Math.cos(fa) * 1.2 * u, hand[1] + Math.sin(fa) * 1.2 * u];
      const pl = 5.2 * u, back = 2.6 * u, curve = 1.6 * u;
      const tipA = [head[0] + px2 * pl + Math.cos(fa) * curve, head[1] + py2 * pl + Math.sin(fa) * curve];
      const tipB = [head[0] - px2 * back + Math.cos(fa) * curve * 0.6, head[1] - py2 * back + Math.sin(fa) * curve * 0.6];
      horn(Ar, head, [head[0] + px2 * pl * 0.5 - Math.cos(fa) * 0.2 * u, head[1] + py2 * pl * 0.5 - Math.sin(fa) * 0.2 * u], tipA, 2.4 * u, PK);
      horn(Ar, head, [head[0] - px2 * back * 0.5, head[1] - py2 * back * 0.5], tipB, 2.2 * u, PK);
      blob(Ar, [[head[0], head[1], 1.3 * u, 1.3 * u]], IR);
      put(L, Ar, true);
      // smoke: puffs rising from the chimney (a black belch on the swing)
      const Sm = layer(F);
      const n = a2 ? 3 : 2;
      for (let k = 0; k < n; k++) {
        const f = ((idle || run ? t : 0) + k / n) % 1, big = a2 ? 1.5 : a1 ? 1.2 : 1;
        puff(Sm, cx0 + tilt + (f * 3 - 1) * u - (run ? f * 3 * u : 0), cTop - 2.6 * u - f * 6 * u, (1 + f * 1.2) * u * big, a2 ? ramp('#3e3448') : SM);
      }
      put(F.p, Sm, false);
      put(F.p, L, false);
      // fire: the grate glows between the bars; the vents in the stack are its eyes; a rune plate
      const gx0 = R(dx0 + 0.8 * u), gy0 = R(dy0 + 0.8 * u), gw = R(dw - 1.6 * u), gh = R(dh - 1.6 * u);
      const fireC = hurt ? ['#7a1e14', '#c2401c'] : heat > 1 ? ['#f8b848', '#fff0b0'] : ['#c2401c', '#ec7a2a'];
      for (let y = gy0; y < gy0 + gh; y++) for (let x = gx0; x < gx0 + gw; x++) { const c = y > gy0 + gh * 0.55 ? fireC[1] : fireC[0]; F.p.set(x, y, C(c)); F.e.set(x, y, C(c)); }
      for (let x = gx0 + 1; x < gx0 + gw; x += Math.max(2, R(1.2 * u))) F.p.line(x, gy0, x, gy0 + gh - 1, IR[0]);   // grate bars: teeth
      if (a2 || a1) flame(F, dx0 + dw * 0.5, gy0, 2 * u * heat, 2 * u, t + 0.3);
      const ey = cTop + 3.8 * u;
      for (const exx of [cx0 - 0.6 * u + tilt * 0.6, cx0 + 1.4 * u + tilt * 0.6]) {
        if (hurt) F.p.line(exx - 1, ey, exx + 1, ey, C('#7a1e14'));
        else eyeGlow(F, exx - 0.6 * u, ey - 0.3 * u, Math.max(2, R(1.2 * u)), Math.max(1, R((a1 || a2 ? 0.8 : 0.5) * u)), fireC[1]);
      }
      // dwarven rune plate above the door
      const rx = R(dx0 + dw * 0.3), ry = R(dy0 - 2.2 * u);
      F.p.rect(rx - 1, ry - 1, R(1.6 * u) + 2, R(1.6 * u) + 2, C('#9a6424'));
      { const rc = heat > 0.9 ? '#f8b848' : '#ec7a2a', n = Math.max(2, R(1.6 * u)), h2 = n >> 1;   // an othala-like rune: a diamond on two legs
        for (const [a2x, a2y, b2x, b2y] of [[h2, 0, 0, h2], [h2, 0, n, h2], [0, h2, n, n], [n, h2, 0, n]]) { F.p.line(rx + a2x, ry + a2y, rx + b2x, ry + b2y, C(rc)); F.e.line(rx + a2x, ry + a2y, rx + b2x, ry + b2y, C(rc)); } }
      // the slam: sparks off the pick tip
      if (a2) for (let k = 0; k < 5; k++) { const a = -2.6 + k * 0.45; lit(F, tipA[0] + Math.cos(a) * 2.4 * u, tipA[1] + Math.sin(a) * 1.8 * u, k % 2 ? '#f8b848' : '#fff0b0'); }
      if (hurt) crack(F.p, bx - 2 * u, topY + 2 * u, 1.1, 6 * u, BR[0], 4);
    },
  },
  // Blind Cave Troll (cave_troll): a mountain troll that never saw the sun, crossed with the olm, the
  // pale blind "human fish" of the karst caves. Pallid, eyeless, it smells its way with flaring pink
  // gill-plumes on a tiny head. A slab of cave ceiling has grown onto its hunched back and a colony of
  // glow-worms lives under it, dangling beaded threads of light. It clubs with a broken stalagmite.
  olm_troll: {
    view: 'side', box: [32, 26], pivot: 0.48, idleFps: 3, scale: 0.84,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const SK = ramp('#cbb8c0'), SKd = SK.map((c) => dark(c, 0.8)), RK = pal5('stone', 4), MO = pal5('moss', 5), GI = pal5('rose', 4), HD = pal5('wood', 5);
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle', a1 = P.atk === 1, a2 = P.atk === 2, hurt = P.hurt;
      const bob = run ? Math.abs(sin(t)) * -0.8 * u : idle ? sin(t) * 0.35 * u : 0;
      const lean = a1 ? -1.4 * u : a2 ? 2 * u : hurt ? -1.4 * u : 0;
      const bx = ox + lean, hipY = oy - 7.2 * u + bob;
      const sh = [bx + 2.2 * u, oy - 14.6 * u + bob + (a2 ? 1.6 * u : 0)];       // the near shoulder, high and huge
      const L = layer(F);
      // legs: short, bowed, splayed toes
      const leg = (far, ph) => {
        const Lg = layer(F), Rl = far ? SKd : SK;
        const hip = [bx - (far ? 0 : 2) * u, hipY];
        const [dx, lift] = run ? stride(ph, 5 * u, 1.8 * u) : [a2 && !far ? 1.5 * u : 0, 0];
        const foot = [hip[0] + 0.6 * u + dx, oy - lift - 0.8 * u];
        const knee = ik(hip, foot, 3.8 * u, 3.8 * u, -1);
        tube(Lg, [hip, knee], [2.4 * u, 1.8 * u], Rl);
        tube(Lg, [knee, foot], [1.7 * u, 1.3 * u], Rl);
        blob(Lg, [[foot[0] + 1 * u, foot[1] + 0.1 * u, 2.2 * u, 1 * u]], Rl);
        put(L, Lg, !far);
      };
      // arms: enormous, knuckles to the ground; far one bare
      const arm = (far) => {
        const Lg = layer(F), Rl = far ? SKd : SK;
        const s0 = far ? [sh[0] + 1.6 * u, sh[1] + 0.6 * u] : sh;
        let hand;
        if (far) hand = a1 ? [s0[0] - 2 * u, s0[1] - 6 * u] : a2 ? [s0[0] + 7 * u, s0[1] + 5 * u] : [s0[0] + 3 * u + (run ? sin(t + 0.5) * 2 * u : 0), oy - 1.4 * u];
        else if (a1) hand = [s0[0] - 3 * u, s0[1] - 7 * u];
        else if (a2) hand = [s0[0] + 7.5 * u, s0[1] + 6 * u];
        else if (hurt) hand = [s0[0] + 1.6 * u, s0[1] + 6 * u];
        else hand = [s0[0] + 2.6 * u + (run ? sin(t) * 1.2 * u : 0), s0[1] + 6.4 * u + (idle ? sin(t) * 0.3 * u : 0)];
        const el = ik(s0, hand, 6 * u, 6.2 * u, far ? -1 : a1 ? 1 : 1);
        tube(Lg, [s0, el], [2.6 * u, 1.9 * u], Rl, { tex: 3 });
        tube(Lg, [el, hand], (q) => (2 + Math.sin(q * Math.PI) * 1.1) * u, Rl, { tex: 3 });   // the forearm swells
        blob(Lg, [[hand[0], hand[1], 2.5 * u, 2.2 * u]], Rl);                     // a huge mitt
        for (let k = 0; k < 3; k++) Lg.set(R(hand[0] + (k - 1) * 0.9 * u + 0.6 * u), R(hand[1] + 1.6 * u), Rl[1]);
        put(L, Lg, !far);
        return [el, hand];
      };
      arm(true);
      leg(true, t + 0.5);
      // body: a pear-shaped hulk, belly sagging, the hump high
      const B = layer(F);
      blob(B, [[bx - 2 * u, hipY - 2 * u, 5 * u, 4.4 * u], [bx - 0.6 * u, sh[1] + 2.4 * u, 5.8 * u, 4.6 * u], [bx + 2.6 * u, hipY - 1.4 * u, 3.4 * u, 3.4 * u]], SK, { tex: 8 });
      spots(B, bx, hipY - 4 * u, 5 * u, 4 * u, 6, 0.6 * u, SK[2], 31);     // mottling, like an olm's
      put(L, B, true);
      // the cave-ceiling crust on the back: a shelf of rock with moss on top
      const Rk = layer(F), cy0 = sh[1] - 2.2 * u;
      const crust = [[bx - 7.4 * u, cy0 + 4.6 * u], [bx - 6.6 * u, cy0 + 0.6 * u], [bx - 3.6 * u, cy0 - 1.8 * u], [bx - 0.2 * u, cy0 - 2.6 * u], [bx + 2.6 * u, cy0 - 1.6 * u], [bx + 3.2 * u, cy0], [bx + 0.4 * u, cy0 + 0.4 * u], [bx - 3.6 * u, cy0 + 1.6 * u], [bx - 6 * u, cy0 + 4.8 * u]];
      slab(Rk, crust, RK, { wide: true });
      spots(Rk, bx - 2 * u, cy0 - 1.2 * u, 4.4 * u, 1 * u, 7, 0.9 * u, MO[3], 4);
      spots(Rk, bx - 2 * u, cy0 - 1.8 * u, 3.6 * u, 0.6 * u, 4, 0.6 * u, MO[4], 5);
      put(L, Rk, true);
      leg(false, t);
      // a ragged hide wrap round the hips, belted with rope
      drape(L, bx - 0.6 * u, hipY - 2.6 * u, 10 * u, 10.6 * u, 3.8 * u, HD, { ragged: true, seed: 5, wave: 0.6 * u, phase: t, folds: 2 });
      L.line(bx - 5.2 * u, hipY - 2.4 * u, bx + 4.6 * u, hipY - 2.8 * u, C('#b07e52'));
      // near arm with the stalagmite club: held by its thin end, the heavy base swinging
      const [el, hand] = arm(false);
      // the tiny head, low and forward on the chest: no eyes, a wide underbite, two stub tusks
      const hx = sh[0] + 4.6 * u + (a2 ? 1 * u : 0), hy = sh[1] + 0.6 * u + (a1 ? -0.8 * u : 0) + (idle ? sin(t + 0.25) * 0.4 * u : 0);
      const H = layer(F);
      // gill plumes: three frilly pink fronds each side, fluttering
      const flut = idle ? sin(t * 2) * 0.5 : run ? sin(t * 2) * 0.7 : a1 ? -0.8 : hurt ? 0.9 : 0.2;
      const gills = (far) => {
        const G2 = layer(F), Rg = far ? GI.map((c) => dark(c, 0.8)) : GI;
        for (let k = 0; k < 3; k++) {
          const root = [hx - 1.6 * u + (far ? 0.6 * u : 0), hy - 0.2 * u + k * 0.7 * u];
          const a = -2.1 - k * 0.45 + flut * 0.25 + (far ? 0.3 : 0), l = (2.8 - k * 0.3) * u;
          const tip = [root[0] + Math.cos(a) * l, root[1] + Math.sin(a) * l];
          tube(G2, [root, [lerp(root[0], tip[0], 0.5) - 0.3 * u, lerp(root[1], tip[1], 0.5) - 0.3 * u], tip], [0.6 * u, 0.35 * u], Rg);
          for (let f = 0.35; f < 1; f += 0.22) { const fx = lerp(root[0], tip[0], f), fy = lerp(root[1], tip[1], f); G2.set(R(fx + Math.cos(a + 1.6) * 0.8 * u), R(fy + Math.sin(a + 1.6) * 0.8 * u), Rg[4]); G2.set(R(fx + Math.cos(a - 1.6) * 0.8 * u), R(fy + Math.sin(a - 1.6) * 0.8 * u), Rg[2]); }
        }
        put(H, G2, !far);
      };
      gills(true);
      blob(H, [[hx, hy, 2.3 * u, 2 * u], [hx + 1.7 * u, hy + 0.5 * u, 1.5 * u, 1.3 * u]], SK);
      // blind: a heavy frowning brow fold sealed over smooth skin where the eyes should be
      for (let k = 0; k < R(2.2 * u); k++) { H.set(R(hx - 0.2 * u) + k, R(hy - 0.9 * u + k * 0.25), SK[1]); H.set(R(hx - 0.2 * u) + k, R(hy - 1.5 * u + k * 0.25), SK[4]); }
      over(H, hx + 0.9 * u, hy - 0.1 * u, SK[2]);
      // nostrils, big, sniffing
      over(H, hx + 2.6 * u, hy - 0.1 * u, SK[0]); over(H, hx + 2.6 * u, hy + 0.3 * u, SK[1]);
      // mouth: an underbite with two tusks; it bellows on the swing and on the hurt frame
      const open = a2 || hurt ? 1.2 * u : 0;
      facet(H, [[hx - 0.2 * u, hy + 1 * u], [hx + 2.8 * u, hy + 1.2 * u], [hx + 2.6 * u, hy + 1.6 * u + open], [hx, hy + 1.4 * u + open * 0.5]], MAW_D);
      horn(H, [hx + 2.2 * u, hy + 1.8 * u + open], [hx + 2.4 * u, hy + 1 * u + open], [hx + 2.1 * u, hy + 0.2 * u + open * 0.5], 0.8 * u, ramp(BONE));
      horn(H, [hx + 0.8 * u, hy + 1.7 * u + open], [hx + 0.9 * u, hy + 1.1 * u + open], [hx + 0.7 * u, hy + 0.5 * u + open * 0.5], 0.7 * u, ramp(BONE_D));
      gills(false);
      put(L, H, true);
      put(F.p, L, false);
      const Cl = layer(F);
      const ca = a1 ? -2.2 : a2 ? 0.55 : hurt ? 1.4 : 1.25 + (run ? sin(t) * 0.2 : idle ? sin(t) * 0.05 : 0);
      const cl = 9.5 * u, base = [hand[0] + Math.cos(ca) * cl, hand[1] + Math.sin(ca) * cl];
      const LS = ramp('#a8805a');   // limestone: warm tan with darker drip rings
      tube(Cl, [hand, base], (q) => lerp(0.9, 2.6, q) * u, LS, { rings: Math.max(3, R(1.8 * u)) });
      blob(Cl, [[base[0], base[1], 2.7 * u, 2.3 * u]], LS, { tex: 2 });
      over(Cl, base[0] - 1 * u, base[1] - 1.2 * u, '#efdab4'); over(Cl, base[0] - 0.6 * u, base[1] - 1.2 * u, '#efdab4');
      put(F.p, Cl, true);
      // redraw the fist over the club's handle
      const Fi = layer(F); blob(Fi, [[hand[0], hand[1], 2.3 * u, 2 * u]], SK); for (let k = 0; k < 3; k++) Fi.set(R(hand[0] + 1.4 * u), R(hand[1] + (k - 1) * 0.9 * u), SK[1]); put(F.p, Fi, true);
      // glow-worm threads hanging from under the crust: beaded with light, swaying with the body
      const sw = idle ? sin(t) * 0.6 * u : run ? -1.2 * u + sin(t * 2) * 0.6 * u : a1 ? 1.2 * u : a2 ? -1.6 * u : hurt ? 1 * u : 0;
      const threads = [[-7.2, 4.6], [-6.2, 6.8], [-5, 3.6], [-3.8, 2.6]];
      threads.forEach(([tx, tl], k) => {
        const x0 = bx + tx * u, y0 = cy0 + (4.6 + (tx + 7.2) * -0.9) * u, len = tl * u;
        const x1 = x0 + sw * (tl / 5), y1 = y0 + len;
        F.p.line(x0, y0, x1, y1, C('#4a9488'));
        for (let f = 0.25; f <= 1.01; f += 0.25) { const gx = lerp(x0, x1, f), gy = lerp(y0, y1, f); lit(F, gx, gy, f > 0.9 ? '#e6f4fc' : '#7cbca8'); if (f > 0.9) lit(F, gx, gy + 1, '#a8d0ec'); }
        if ((k + Math.floor(t * 4)) % 3 === 0) { lit(F, x1, y1 + 1, '#e6f4fc'); lit(F, x1 + 1, y1, '#a8d0ec'); }
      });
      for (let k = 0; k < 4; k++) lit(F, bx + (-5.6 + k * 2.2) * u, cy0 + (3.2 - k * 0.9) * u + 1, (k + Math.floor(t * 4)) % 2 ? '#7cbca8' : '#e6f4fc');
      // dust kicked up by the club on the strike
      if (a2) for (let k = 0; k < 5; k++) { const dx = (k - 2) * 1.6 * u; F.p.disc(base[0] + dx, oy - 1 * u - Math.abs(k - 2) * 0.6 * u, 1.1 * u, C('#7b6a74')); }
    },
  },
  // Bell Priest (hollow_priest): church bells were rung to drive the demons off; this one was rung
  // too long in the drowned chapels of the Quiet Halls and the demon moved in. Its body is a bronze
  // bell crusted with verdigris, hollow and full of void; a priest's stole hangs over its shoulder,
  // a cracked choir mask singing one endless "O" sits where the crown loop should be, and its only
  // leg is the clapper, swinging. When it casts, the bell tolls in rings of violet sound.
  bell_priest: {
    view: 'front', box: [26, 30], pivot: 0.5, idleFps: 4, hover: true, scale: 0.84,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const BZ = [C('#3e2418'), C('#5e3a22'), C('#8a5a2c'), C('#ad7a3a'), C('#d4a85a')], VG = pal5('teal', 5), ST = pal5('lavender', 5), CW = pal5('plum', 4), MK = ramp('#e2d4b8'), IRN = pal5('steel', 4);
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle', a1 = P.atk === 1, a2 = P.atk === 2, hurt = P.hurt;
      const rockA = idle ? sin(t) * 0.05 : run ? -0.1 + sin(t) * 0.04 : a1 ? -0.08 : a2 ? 0.1 : hurt ? 0.16 : 0;
      const cx = ox, top = oy - 25 * u + (idle ? sin(t) * 0.4 * u : 0), lipY = top + 15 * u;
      const piv = [cx, top + 2 * u];
      const rp = (x, y) => rotP([cx + x * u, top + y * u], piv, rockA);
      // the clapper: an iron rod and ball hanging out of the bell mouth, swinging as a pendulum
      const swing = idle ? sin(t) * 0.25 : run ? 0.35 + sin(t * 2) * 0.1 : a1 ? -0.35 : a2 ? 0.5 : hurt ? -0.55 : 0;
      const c0 = rp(0, 12.5), cl = 8.5 * u, cb = [c0[0] - Math.sin(swing) * cl, c0[1] + Math.cos(swing) * cl];
      const Cl = layer(F);
      tube(Cl, [c0, cb], [0.8 * u, 0.6 * u], IRN);
      blob(Cl, [[cb[0], cb[1], 1.8 * u, 2 * u]], IRN);
      put(F.p, Cl, false);
      // the bell's open mouth: an ellipse of void seen from below the lip, faintly lit violet inside
      const mouthC = rp(0, 15);
      const M = layer(F);
      M.ellipse(mouthC[0], mouthC[1], 8.4 * u, 1.9 * u, C('#1a0a2c'));
      M.ellipse(mouthC[0], mouthC[1] - 0.4 * u, 6.2 * u, 1.1 * u, C('#2f0d48'));
      put(F.p, M, false);
      // sleeves: thin dark arms from slits at the shoulder, bony hands; folded in prayer at rest
      const arm = (sd) => {
        const A = layer(F), s0 = rp(sd * 3.4, 2.4);
        let hand;
        if (a1) hand = rp(sd * 7.5, -1.5);
        else if (a2) hand = rp(sd * 9.5, 5.5);
        else if (hurt) hand = rp(sd * 6, 7.5);
        else hand = rp(sd * 0.8, 4.4 + (idle ? sin(t) * 0.2 : 0));
        const el = [lerp(s0[0], hand[0], 0.5) + sd * (a1 || a2 ? 1.8 : 0.8) * u, lerp(s0[1], hand[1], 0.5) + (a1 || a2 ? 0.8 : 1) * u];
        tube(A, [s0, el, hand], [0.8 * u, 0.55 * u], CW);
        blob(A, [[hand[0], hand[1], 0.8 * u, 0.9 * u]], MK);
        if (a2) for (let k = -1; k <= 1; k++) A.line(hand[0], hand[1], hand[0] + sd * 1.6 * u, hand[1] + k * 0.8 * u, MK[3]);
        put(F.p, A, true);
        return hand;
      };
      // the bell: a flared bronze silhouette, ring bands, verdigris crust, a thick lip
      const B = layer(F);
      const prof = [[0.4, 2.2], [0.9, 3.8], [1.8, 4.8], [3.2, 5.3], [6, 5.4], [9, 5.8], [11.3, 6.7], [13.2, 8.2], [14.4, 9.2], [15, 9.4]];
      const pts = prof.map(([y, w]) => rp(-w, y)).concat(prof.slice().reverse().map(([y, w]) => rp(w, y)));
      B.poly(pts, BZ[3]);
      // shade as a cylinder: lit band left of centre, shadow at the right edge
      for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) {
        if (!B.a(x, y)) continue;
        let w = 1; for (let k = 1; k < 40; k++) if (!B.a(x - k, y) || !B.a(x + k, y)) { w = k; break; }
        let l0 = x - 1, r0 = x + 1; while (B.a(l0, y)) l0--; while (B.a(r0, y)) r0++;
        const f = (x - l0) / Math.max(1, r0 - l0);
        B.set(x, y, f < 0.1 ? BZ[2] : f < 0.2 ? BZ[3] : f < 0.32 ? BZ[4] : f < 0.62 ? BZ[3] : f < 0.84 ? BZ[2] : BZ[1]);
        void w;
      }
      // ring bands and the heavy lip
      for (const yy of [3.4, 4, 13.2]) { const a = rp(-9, yy), b = rp(9, yy); for (let x = Math.floor(Math.min(a[0], b[0])); x <= Math.max(a[0], b[0]); x++) { const y = lerp(a[1], b[1], (x - a[0]) / (b[0] - a[0] || 1)); over(B, x, y, BZ[1]); over(B, x, y + 1, BZ[4]); } }
      // verdigris crust in clusters, heavier toward the bottom
      spots(B, cx - 1 * u, top + 11.6 * u, 7 * u, 2.4 * u, 14, 0.9 * u, VG[3], 8);
      spots(B, cx - 1 * u, top + 12.2 * u, 7 * u, 1.8 * u, 7, 0.6 * u, VG[4], 9);
      spots(B, cx + 2.5 * u, top + 6 * u, 2.6 * u, 3 * u, 5, 0.7 * u, VG[2], 10);
      spots(B, cx - 3 * u, top + 2 * u, 2 * u, 1 * u, 3, 0.6 * u, VG[3], 11);
      // a cast relief band of little bells / crosses round the waist
      for (let k = -2; k <= 2; k++) { const q = rp(k * 1.9, 8.6); over(B, q[0], q[1], BZ[4]); over(B, q[0], q[1] + 1, BZ[1]); over(B, q[0] - 1, q[1], BZ[4]); over(B, q[0] + 1, q[1], BZ[2]); }
      put(F.p, B, true);
      // the stole: two lavender strips over the shoulder, cream trim, a gold sun on each end
      const S2 = layer(F);
      for (const sd of [-1, 1]) {
        const flap = idle ? sin(t + (sd > 0 ? 0.3 : 0)) * 0.3 : run ? -0.6 : 0;
        const a = rp(sd * 3.2, 1.2), b = rp(sd * 4.6 + flap, 14.2);
        const w0 = 0.7 * u, w1 = 0.9 * u;
        slab(S2, [[a[0] - w0, a[1]], [a[0] + w0, a[1]], [b[0] + w1, b[1]], [b[0] - w1, b[1]]], ST);
        S2.line(b[0] - w1, b[1], b[0] + w1, b[1], C('#f3e1b5'));
        S2.line(b[0] - w1, b[1] + 1, b[0] + w1, b[1] + 1, C('#f3e1b5'));
        const sun = rp(sd * 4.5 + flap * 0.8, 12.4);
        S2.disc(sun[0], sun[1], Math.max(1, 0.6 * u), C('#e8c35a'));
      }
      put(F.p, S2, true);
      const hands = [arm(-1), arm(1)];
      // the mask: a cracked ivory choir mask on a dark cowl, at the crown of the bell
      const mc = rp(0, -1.2);
      const H = layer(F);
      blob(H, [[mc[0], mc[1] + 0.4 * u, 3.5 * u, 3.7 * u]], CW, {});                  // cowl
      slab(H, [[mc[0] - 1.2 * u, mc[1] - 3.6 * u], [mc[0] + 1.4 * u, mc[1] - 3.6 * u], [mc[0] + 0.6 * u, mc[1] - 5.2 * u]], CW);

      put(F.p, H, true);
      const Mk = layer(F);
      blob(Mk, [[mc[0], mc[1] + 0.4 * u, 2.7 * u, 3.2 * u]], MK);
      put(F.p, Mk, true);
      // hollow eyes: dark sockets with gold embers deep inside; the O mouth sings, wider on the toll
      const eo = 1.1 * u, ey = mc[1] - 0.3 * u;
      for (const sd of [-1, 1]) {
        F.p.ellipse(mc[0] + sd * eo, ey, Math.max(1, 0.75 * u), Math.max(1, 0.9 * u), VOID);
        if (hurt) F.p.line(mc[0] + sd * eo - 1, ey, mc[0] + sd * eo + 1, ey, C('#7a1e14'));
        else { const ec = a1 || a2 ? '#fff0b0' : '#f8b848'; lit(F, mc[0] + sd * eo, ey, ec); if (u > 1.6) lit(F, mc[0] + sd * eo, ey + 1, ec); }
      }
      const mo = a2 ? 1.4 : a1 ? 1.1 : idle ? 0.8 + sin(t) * 0.1 : 0.85;
      F.p.ellipse(mc[0], mc[1] + 1.9 * u, 0.8 * u * mo, 1.1 * u * mo, VOID);
      if (a1 || a2) { glow(F, mc[0], mc[1] + 1.9 * u, Math.max(1, 0.6 * u * mo), '#c860f0'); }
      // the crack across the mask (wider when hurt) and a chip off the brow
      crack(F.p, mc[0] + 1.6 * u, mc[1] - 2.6 * u, 1.9, hurt ? 6 * u : 3.2 * u, MK[1], 5);
      F.p.set(R(mc[0] - 2 * u), R(mc[1] - 1.8 * u), ST[1]);
      // the toll: rings of violet sound spreading from the bell lip on the wind-up and the strike
      if (a1 || a2) {
        const rr = a2 ? 3 : 1.6;
        for (let k = 0; k < (a2 ? 2 : 1); k++) {
          const rx = (9 + k * rr * 1.6) * u, ry = (2.4 + k * 0.9) * u;
          for (let aa = 0; aa < TAU; aa += 0.05) {
            if (Math.sin(aa) < -0.2) continue;
            const x = mouthC[0] + Math.cos(aa) * rx, y = mouthC[1] + Math.sin(aa) * ry;
            if (bayerLike(x, y, k)) lit(F, x, y, k ? '#a026ef' : '#c860f0');
          }
        }
      }
      F.mouth = [mc[0], mc[1] + 1.9 * u];
      void hands;
    },
  },
  // Crucible Golem (magma_golem): Talos, the bronze guardian whose life was one vein of molten ichor,
  // reimagined by dwarven smelters: the vein is the whole body. A fired-clay crucible brimming with
  // molten metal, walking on tall iron stilt legs, a grim face cast into its side and lit from within,
  // two blacksmith's tongs for arms. It tips itself forward to pour a glowing stream on you.
  crucible_golem: {
    view: 'side', box: [30, 24], pivot: 0.45, idleFps: 4, scale: 0.92,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const CL = pal5('clay', 6), IRN = pal5('steel', 4), IRd = IRN.map((c) => dark(c, 0.8)), HOT = PAL.ember.map((c) => C(c));
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle', a1 = P.atk === 1, a2 = P.atk === 2, hurt = P.hurt;
      const bob = run ? Math.abs(sin(t)) * -0.7 * u : idle ? sin(t) * 0.25 * u : 0;
      const tilt = a1 ? -0.32 : a2 ? 0.62 : hurt ? -0.2 : run ? sin(t) * 0.05 : 0;
      const px0 = ox + (a2 ? 1.2 * u : a1 ? -0.8 * u : 0), base = oy - 9 * u + bob;      // pot base centre
      const piv = [px0, base];
      const rp = (x, y) => rotP([px0 + x * u, base + y * u], piv, tilt);
      const L = layer(F);
      // stilt legs: long iron rods, reverse knee like a wading bird, three-toed feet
      const leg = (far, ph) => {
        const Lg = layer(F), Rl = far ? IRd : IRN;
        const hip = [px0 + (far ? 1.6 : -1.4) * u, base - 0.6 * u];
        const [dx, lift] = run ? stride(ph, 5.5 * u, 2 * u) : [0, 0];
        const foot = [hip[0] + dx + (far ? 1 * u : -0.6 * u), oy - lift - 0.5 * u];
        const knee = ik(hip, foot, 4.9 * u, 4.9 * u, 1);                         // knee points back
        tube(Lg, [hip, knee], [0.8 * u, 0.6 * u], Rl);
        tube(Lg, [knee, foot], [0.6 * u, 0.5 * u], Rl);
        Lg.disc(knee[0], knee[1], Math.max(1, 0.9 * u), Rl[3]); Lg.set(R(knee[0] - 0.4 * u), R(knee[1] - 0.4 * u), Rl[4]);
        for (const a of [-0.3, 0.2, 2.9]) tube(Lg, [foot, [foot[0] + Math.cos(a) * 1.8 * u, foot[1] + 0.3 * u]], [0.5 * u, 0.3 * u], Rl);
        put(L, Lg, !far);
      };
      // tong arms: a long jointed rod ending in pincers, held off the pot's shoulder
      const tong = (far) => {
        const Lg = layer(F), Rl = far ? IRd : IRN;
        const sh = rp(far ? 3.4 : 5.2, far ? -6.4 : -4.4);
        let hand;
        if (a1) hand = [sh[0] + (far ? 0.5 : 2) * u, sh[1] - 5.5 * u];
        else if (a2) hand = [sh[0] + (far ? 4 : 6) * u, sh[1] + 4 * u];
        else if (hurt) hand = [sh[0] - 2 * u, sh[1] + 5 * u];
        else hand = [sh[0] + (far ? 5.4 : 5) * u + (run ? sin(t + (far ? 0.5 : 0)) * 1.2 * u : 0), sh[1] + (far ? 1.4 : 3.6) * u + (idle ? sin(t + (far ? 0.3 : 0)) * 0.5 * u : 0)];
        const el = ik(sh, hand, 4 * u, 4.2 * u, 1);
        tube(Lg, [sh, el, hand], [0.6 * u, 0.45 * u], Rl);
        Lg.disc(el[0], el[1], Math.max(1, 0.7 * u), Rl[3]);
        const fa = Math.atan2(hand[1] - el[1], hand[0] - el[0]), open = a1 ? 0.6 : a2 ? 0.15 : 0.32;
        for (const sg of [-1, 1]) horn(Lg, hand, [hand[0] + Math.cos(fa + sg * open) * 1.6 * u, hand[1] + Math.sin(fa + sg * open) * 1.6 * u], [hand[0] + Math.cos(fa + sg * open * 0.2) * 2.8 * u, hand[1] + Math.sin(fa + sg * open * 0.2) * 2.8 * u], 0.9 * u, Rl);
        put(L, Lg, !far);
      };
      tong(true);
      leg(true, t + 0.5);
      // the crucible: a fired-clay tub, wider at the brim, a pouring spout at the front, soot at the foot
      const Pt = layer(F);
      const prof = [[0, 3.6], [-1, 4.6], [-3, 5.2], [-6, 5.7], [-9, 6.1], [-9.8, 6.3]];
      const pts = prof.map(([y, w]) => rp(-w, y)).concat(prof.slice().reverse().map(([y, w]) => rp(w, y)));
      pts.splice(prof.length + 1, 0, rp(8, -10.4), rp(6.6, -8.8));       // the spout lip, at the front rim
      slab(Pt, pts, CL, { wide: true });
      // round shading: a lit band on the left, soot toward the base
      for (let y = 0; y < Pt.h; y++) for (let x = 0; x < Pt.w; x++) {
        if (!Pt.a(x, y)) continue;
        const [lx, ly] = rotP([x, y], piv, -tilt); const fx = (lx - px0) / (6 * u), fy = (ly - base) / u;
        if (fy > -1.6 && Pt.get(x, y)[0] > 60) over(Pt, x, y, fy > -0.6 ? '#2a1420' : '#55323d');
        else if (fx < -0.55 && fx > -0.82 && fy < -2) over(Pt, x, y, CL[4]);
        else if (fx > 0.62 && fy < -1) over(Pt, x, y, CL[1]);
      }
      // a thick rim band
      { const a = rp(-6.4, -9.5), b = rp(6.4, -9.5); tube(Pt, [a, b], 0.9 * u, CL); }
      // the cast face: a heavy brow and a frowning mouth slit (glowing from within, painted later)
      put(L, Pt, true);
      // a heavy scowling brow, cast in relief and soot-dark
      const Bw = layer(F);
      const br0 = rp(-0.2, -8), br1 = rp(4.8, -6.6);
      tube(Bw, [br0, [lerp(br0[0], br1[0], 0.45), lerp(br0[1], br1[1], 0.45) - 0.3 * u], br1], [0.9 * u, 0.7 * u], CL.map((c) => dark(c, 0.78)));
      put(L, Bw, true);
      leg(false, t);
      tong(false);
      put(F.p, L, false);
      // molten metal: the brimming surface with a cooling crust, a bubble that swells and pops
      const m0 = rp(-5.6, -10), m1 = rp(5.8, -10);
      const heat = hurt ? 0 : a1 || a2 ? 2 : 1;
      for (const Lx of [F.p, F.e]) { Lx.line(m0[0], m0[1], m1[0], m1[1], HOT[heat >= 1 ? 3 : 2], 2); Lx.line(m0[0] + 1, m0[1] + 1, m1[0] - 1, m1[1] + 1, HOT[2]); }
      for (let k = 0; k < 3; k++) { const q = rp(-3.6 + k * 3.2, -10.2); F.p.rect(R(q[0]), R(q[1]), 2, 1, C('#4a1420')); F.e.clear(R(q[0]), R(q[1])); F.e.clear(R(q[0]) + 1, R(q[1])); }
      if (idle || run) { const bp = t * 2 % 1, q = rp(-1 + bp * 2, -10.1 - bp * 0.5); if (bp < 0.75) glow(F, q[0], q[1], Math.max(0.8, (0.3 + bp * 0.5) * u), HOT[4]); else { lit(F, q[0] - 1, q[1] - 2, HOT[4]); lit(F, q[0] + 1, q[1] - 3, HOT[5]); } }
      // face glow: eyes and mouth slit, the hot interior seen through the clay
      const eyeC = hurt ? HOT[1] : heat > 1 ? HOT[5] : HOT[4];
      for (const [ex, ey] of [[0.6, -6.6], [3.4, -5.8]]) { const q = rp(ex, ey); F.p.rrect(R(q[0] - 0.9 * u), R(q[1] - 0.7 * u), R(2.2 * u), R(1.6 * u), C('#2a1420'), 1); eyeGlow(F, q[0] - 0.6 * u, q[1] - 0.4 * u, Math.max(2, R(1.5 * u)), Math.max(1, R((a1 || a2 ? 1.1 : 0.8) * u)), eyeC); }
      const mq0 = rp(0.2, -3.2), mq1 = rp(4.6, -3), mmid = rp(2.4, a2 ? -3 : -4.2);
      for (const Lx of [F.p, F.e]) { Lx.line(mq0[0], mq0[1] + 1, mmid[0], mmid[1], C(eyeC)); Lx.line(mmid[0], mmid[1], mq1[0], mq1[1] + 1, C(eyeC)); }
      // glowing heat-cracks through the clay
      if (!hurt) { crack(F.p, rp(-4.2, -8.6)[0], rp(-4.2, -8.6)[1], 1.4 + tilt, 3.4 * u, HOT[3], 3, F.e); crack(F.p, rp(5.2, -8.8)[0], rp(5.2, -8.8)[1], 1.9 + tilt, 2.4 * u, HOT[3], 8, F.e); }
      else crack(F.p, rp(-1, -8)[0], rp(-1, -8)[1], 1.2, 6 * u, '#2a1420', 6);
      // the pour: a bright stream from the spout arcing to the ground, a splash where it lands
      const sp = rp(8, -10.4);
      if (a2) {
        const land = [sp[0] + 5 * u, oy - 0.5 * u];
        const st = bez([sp, [sp[0] + 4 * u, sp[1]], land], 14);
        const S2 = layer(F); tube(S2, st, (q) => lerp(1.3, 0.9, q) * u, HOT.slice(1, 6)); put(F.p, S2, false);
        for (let i = 0; i < S2.d.length; i += 4) if (S2.d[i + 3]) F.e.d.set([S2.d[i], S2.d[i + 1], S2.d[i + 2], 255], i);
        for (let k = 0; k < 5; k++) { const a = -Math.PI + k * 0.5 + 0.4; lit(F, land[0] + Math.cos(a) * 2.4 * u, land[1] + Math.sin(a) * 1.6 * u, k % 2 ? HOT[4] : HOT[5]); }
        F.p.ellipse(land[0], land[1], 2.6 * u, 0.7 * u, HOT[3]); F.e.ellipse(land[0], land[1], 2.6 * u, 0.7 * u, HOT[3]);
      } else if (!hurt) {
        // a slow drip from the spout lip
        const dp = (t * 2) % 1;
        lit(F, sp[0] + 0.3 * u, sp[1] + 0.8 * u, HOT[4]);
        lit(F, sp[0] + 0.3 * u, sp[1] + (1.6 + dp * 3) * u, dp > 0.5 ? HOT[3] : HOT[4]);
      }
      if (a1) for (let k = 0; k < 3; k++) { const q = rp(-4 + k * 3, -11.6 - k * 0.6); lit(F, q[0], q[1], HOT[4]); }   // sloshing as it rocks back
      F.mouth = sp;
    },
  },
  // Rift Spawn (rift_spawn, boss): Ginnungagap, the yawning gap before the world, still hungry. The
  // set piece is the wound itself: a tall torn slit of light hanging in the air, its ragged edges
  // glowing pink-white, and through it something is squeezing into the world: a lumpy void-plum mass
  // of many mouths, two tendrils hooked over the edges of the tear to haul itself through, two more
  // groping along the floor. Deep in its central maw a star-core pulses: the weak point.
  rift_spawn: {
    view: 'front', box: [40, 46], pivot: 0.5, idleFps: 5, idle: 6,
    draw(F, o, P) {
      const { u, ox, oy } = F;
      const VB = [C('#2a1030'), C('#4a1a48'), C('#6a2a5e'), C('#8e4282'), C('#b46aa4')];
      const RE = layer(F), FR = layer(F);   // the rift's glow (applied only where nothing covers it) and a mask of the front parts
      const t = P.t, run = P.act === 'run', idle = P.act === 'idle', a1 = P.atk === 1, a2 = P.atk === 2, hurt = P.hurt;
      const cx = ox, swell = a1 ? 1.08 : a2 ? 1.02 : hurt ? 0.9 : 1 + (idle ? sin(t) * 0.025 : 0);
      const by = oy - 11 * u + (run ? sin(t) * 0.6 * u : 0) + (hurt ? -1 * u : 0);
      // ------------------------------------------------ the rift: a jagged lens of torn light
      const rTop = oy - 44 * u, rBot = oy - 4 * u, rW = (a1 ? 9.4 : hurt ? 10.5 : 8.4) * u;
      const rr = srand(77), edgeL = [], edgeR = [];
      const N = 18;
      for (let k = 0; k <= N; k++) {
        const f = k / N, y = lerp(rTop, rBot, f), w = rW * Math.pow(Math.sin(Math.pow(f, 0.62) * Math.PI), 0.9);
        const jl = (rr() - 0.5) * 3 * u * Math.sin(f * Math.PI), jr = (rr() - 0.5) * 3 * u * Math.sin(f * Math.PI);
        const sway = sin(t + f * 0.7) * 0.5 * u * Math.sin(f * Math.PI);
        edgeL.push([cx - w + jl + sway, y]); edgeR.push([cx + w + jr + sway, y]);
      }
      const grow = (pts, side, e) => pts.map(([x, y], k) => [x + side * e * Math.sin((k / N) * Math.PI) + side * 0.3 * e, y + (k === 0 ? -e : k === N ? e : 0)]);
      const lens = (e) => grow(edgeL, -1, e).concat(grow(edgeR, 1, e).reverse());
      const flick = idle ? (P.i % 2) * 0.4 : 0;
      for (const Lx of [F.p, RE]) { Lx.poly(lens((2.6 + flick) * u * 0.6), C('#a026ef')); Lx.poly(lens(1.1 * u * 0.6), C('#f5afd6')); }
      F.p.poly(lens(0), C('#140818')); RE.poly(lens(0), C('#2f0d48'));
      // inner swirl and the far stars inside the tear
      const In = layer(F); In.poly(lens(0), C('#140818'));
      for (let s2 = 0; s2 < 1; s2 += 0.02) { const a = s2 * 9 + t * TAU * 0.5, rad = s2 * rW * 0.8; over(In, cx + Math.cos(a) * rad, by - 19 * u + Math.sin(a) * rad * 1.6, '#4a1664'); over(In, cx + Math.cos(a) * rad + 1, by - 19 * u + Math.sin(a) * rad * 1.6, '#2f0d48'); }
      put(F.p, In, false);
      starfield({ p: F.p, e: RE }, cx, by - 19 * u, rW * 0.7, 12 * u, 20, 5, t, In, ['#f5afd6', '#c860f0', '#e6f4fc']);
      // torn flaps curling out of the edges
      for (const [k, side] of [[2, 1], [8, -1], [10, 1], [13, -1]]) {
        const [x, y] = side < 0 ? edgeL[k] : edgeR[k];
        const tip = [x + side * 2.4 * u, y - 1.6 * u + sin(t + k * 0.1) * 0.4 * u];
        for (const Lx of [F.p, RE]) Lx.poly([[x, y - 1 * u], tip, [x, y + 1.2 * u]], C(k % 2 ? '#f5afd6' : '#c860f0'));
      }
      // ------------------------------------------------ tendrils (behind the body)
      const tend = (root, tip, ctrl, r0, far) => {
        const Lt = layer(F), Rm = far ? VB.map((c) => dark(c, 0.8)) : VB;
        const pts = bez([root, ctrl, tip], 22);
        tube(Lt, pts, (q) => lerp(r0, 0.35, q) * u, Rm);
        // suckers: pale dots along the underside
        for (let k = 4; k < pts.length - 3; k += 3) { const [x, y] = pts[k]; over(Lt, x + 0.5, y + lerp(r0, 0.35, k / pts.length) * u * 0.6, '#f5afd6'); }
        put(F.p, Lt, true); put(FR, Lt, false);
      };
      const lift = a1 ? -3 * u : a2 ? 0 : hurt ? -1 * u : sin(t) * 0.6 * u;
      const lash = a2 ? 6 * u : a1 ? -2 * u : 0;
      // upper pair: hooked over the edges of the tear, hauling
      const gl = edgeL[5], gr = edgeR[4];
      tend([cx - 5 * u, by - 4 * u], [gl[0] - 1.2 * u, gl[1] - 0.6 * u], [cx - 14 * u, by - 9 * u + lift * 0.3], 2.1, false);
      tend([cx + 5 * u, by - 4.5 * u], [gr[0] + 1.2 * u, gr[1] - 0.6 * u], [cx + 14 * u, by - 10 * u + lift * 0.3], 2.1, false);
      // hooked tips curling over the rim
      for (const [g, sd] of [[gl, -1], [gr, 1]]) { const H2 = layer(F); horn(H2, [g[0] + sd * 1.2 * u, g[1] - 0.6 * u], [g[0] + sd * 0.6 * u, g[1] - 2.4 * u], [g[0] - sd * 1.4 * u, g[1] - 1.8 * u], 1.2 * u, VB); put(F.p, H2, true); put(FR, H2, false); }
      // ------------------------------------------------ the body: a lumpy mass squeezing out
      const B = layer(F), sw = swell;
      blob(B, [[cx, by, 9 * u * sw, 7.4 * u * sw], [cx - 5.6 * u, by + 3.4 * u, 5 * u * sw, 4.6 * u], [cx + 5.8 * u, by + 3 * u, 5.2 * u * sw, 5 * u], [cx - 2.6 * u, by - 5.4 * u, 5 * u * sw, 4 * u], [cx + 3.4 * u, by - 6 * u, 4.2 * u * sw, 3.6 * u], [cx, by + 7 * u, 7 * u * sw, 3.6 * u]], VB);
      // oily magenta sheen: two curved streaks on the lit side
      for (let a = 3.5; a <= 4.4; a += 0.05) { over(B, cx + Math.cos(a) * 7.4 * u, by + Math.sin(a) * 5.8 * u, '#c860f0'); over(B, cx - 4 * u + Math.cos(a) * 3.6 * u, by + 3 * u + Math.sin(a) * 3 * u, '#a05aa4'); }
      over(B, cx - 4.6 * u, by - 4.4 * u, '#fff4fb');
      put(F.p, B, true); put(FR, B, false);
      // lower pair: groping along the floor, lashing out on the strike
      tend([cx - 7 * u, by + 5 * u], [cx - 15 * u - lash, oy - 1 * u + lift * 0.5], [cx - 13 * u, by + 2 * u + lift], 2, false);
      tend([cx + 7 * u, by + 5 * u], [cx + 15 * u + lash, oy - 1 * u + lift * 0.5], [cx + 13 * u, by + 2 * u + lift], 2, false);
      // the rift's glow, only where the body and tendrils don't cover it
      for (let i = 3; i < RE.d.length; i += 4) if (RE.d[i] && !FR.d[i]) { F.e.d[i - 3] = RE.d[i - 3]; F.e.d[i - 2] = RE.d[i - 2]; F.e.d[i - 1] = RE.d[i - 1]; F.e.d[i] = RE.d[i]; }
      // ------------------------------------------------ mouths: they open and shut in turn
      const mouths = [[0.4, 1.6, 5.4, 0], [-5.4, 4.4, 2.2, 1], [5.6, 4, 2.2, 2], [-2.6, -4.8, 1.8, 3], [3.6, -5.6, 1.6, 4], [-6.4, -1, 1.4, 5]];
      for (const [mx, my, mw, k] of mouths) {
        const x = cx + mx * u * sw, y = by + my * u;
        let open = k === 0 ? (a1 ? 0.75 : a2 ? 1 : hurt ? 0 : 0.35 + sin(t) * 0.1) : (a1 || a2 ? 0.8 : hurt ? 0 : Math.max(0, sin(t + k / 6)) * 0.9);
        const h = mw * open * 0.75 * u, w = mw * u;
        if (h < 1) {   // shut: a lip line with fang tips
          F.p.line(x - w, y, x + w, y, VB[0]); F.p.line(x - w * 0.8, y + 1, x + w * 0.8, y + 1, VB[4]);
          for (let q = -1; q <= 1; q += 2) F.p.set(R(x + q * w * 0.45), R(y) + 1, C('#f3e1b5'));
          continue;
        }
        F.p.ellipse(x, y, w, h, MAW_D);
        F.p.ellipse(x, y + h * 0.4, w * 0.6, h * 0.4, C('#7a2f4a'));
        teeth(F.p, [x - w * 0.85, y - h * 0.8], [x + w * 0.85, y - h * 0.8], Math.max(2, R(mw * 1.6)), Math.max(1, h * 0.45), 1);
        teeth(F.p, [x - w * 0.7, y + h * 0.85], [x + w * 0.7, y + h * 0.85], Math.max(2, R(mw * 1.2)), Math.max(1, h * 0.35), -1);
        // lips: a lit upper rim
        for (let a = 3.3; a < 6.1; a += 0.1) F.p.set(R(x + Math.cos(a) * (w + 0.6)), R(y + Math.sin(a) * (h + 0.6)), VB[4]);
        if (k === 0) {   // the weak point: a star-core pulsing deep in the central maw
          const cr = Math.max(1.2, h * (a2 ? 0.55 : 0.4));
          glow(F, x + 0.3 * u, y + 0.2 * u, cr, a2 ? '#f5afd6' : '#c860f0', { halo: a2 });
        }
      }
      // a face of sorts: three star-eyes, one big, over the central maw; they squeeze shut when hurt
      for (const [ex, ey, er] of [[-1.6, -1.6, 1.5], [2.6, -2.4, 1], [-4.6, -3.4, 0.8]]) {
        const x = cx + ex * u * sw, y = by + ey * u;
        F.p.ellipse(x, y, er * u + 1, er * u * 0.8 + 1, VB[0]);
        if (hurt) { F.p.line(x - er * u, y, x + er * u, y, C('#f5afd6')); continue; }
        glow(F, x, y, Math.max(1, er * u * (a1 ? 0.9 : 0.75)), er > 1.2 ? '#f5afd6' : '#c860f0');
        F.p.set(R(x + (a1 || a2 ? 0 : sin(t) * er * 0.4 * u)), R(y), VOID);
      }
      // little star-motes orbiting the mass (the sky it drags along)
      for (let k = 0; k < 4; k++) { const a = (k / 4 + t * 0.5) * TAU; star(F, cx + Math.cos(a) * 12 * u, by - 2 * u + Math.sin(a) * 4 * u, k === 0, k % 2 ? '#c860f0' : '#f5afd6'); }
      // the volley charge: motes drawn in on the wind-up; a spray on the strike
      if (a1) for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; lit(F, cx + Math.cos(a) * 8 * u, by + 1.6 * u + Math.sin(a) * 6 * u, '#f5afd6'); }
      if (a2) for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + 0.2; glow(F, cx + Math.cos(a) * 11 * u, by + 1.6 * u + Math.sin(a) * 8 * u, Math.max(1, 0.8 * u), '#c860f0'); }
      if (hurt) tint(F.p, '#f5afd6', 0.12);
      F.mouth = [cx + 0.4 * u, by + 1.6 * u];
    },
  },
};
