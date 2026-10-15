// Procedural pixel creatures. Side-view bodies (quadrupeds, dragons, arachnids, flyers, serpent
// heads) face right and are mirrored by the actor; blobs, wraiths and floating eyes are drawn
// front-on. Every frame is { pix, emis } with the pivot on the ground under the body.
// Golems and treants reuse the humanoid generator with extra features (see human.js).
import { Pix, C, light, dark, mixc, alpha, hash2, bayer } from '../pix.js';
import { ramp, blob as blobShape } from './props.js';
import { srand } from '../pix.js';

const cache = new Map();
const EYE_DARK = C('#140c10');

// ------------------------------------------------------------------ helpers
function mk(w, h, ox, oy) { const p = new Pix(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h))); p.ox = Math.round(ox); p.oy = Math.round(oy); return p; }
// shaded ellipse, top-left lit, 4-tone ramp
function ball(p, cx, cy, rx, ry, R, o = {}) {
  rx = Math.max(0.6, rx); ry = Math.max(0.6, ry);
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
    const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
    const d = nx * nx + ny * ny;
    if (d > 1) continue;
    if (o.clipY !== undefined && y > o.clipY) continue;
    let l = -0.5 * nx - 0.86 * ny + 0.22 + (o.lift || 0);
    if (o.tex) l += (hash2(x, y, o.tex) - 0.5) * 0.3;
    p.set(x, y, R[l > 0.66 ? 3 : l > -0.1 ? 2 : l > -0.62 ? 1 : 0]);
  }
  return p;
}
function finish(p, e) {
  p.outline();
  for (let i = 3; i < e.d.length; i += 4) if (e.d[i]) return { pix: p, emis: e };
  return { pix: p, emis: null };
}
const isTame = (o) => !!o.tame;
function eye(p, e, x, y, o, big) {
  x = Math.round(x); y = Math.round(y);
  if (isTame(o)) { p.set(x, y, EYE_DARK); if (big) p.set(x + 1, y, EYE_DARK); p.set(x, y - 1, '#f0f0f0'); return; }
  const c = C(o.c3);
  p.set(x, y, c); e.set(x, y, c);
  if (big) { p.set(x + 1, y, c); e.set(x + 1, y, c); }
}

// ------------------------------------------------------------------ public
// spec: { body, s, c1, c2, c3, kind, saddle, tame, glass, lure, caps } -> { views, sideOnly, height, seat, mouth }
export function creatureSprites(spec) {
  const key = JSON.stringify(spec);
  let s = cache.get(key);
  if (s) return s;
  switch (spec.body) {
    case 'quadruped': case 'dragon': s = quadSet(spec); break;
    case 'arachnid': s = arachSet(spec); break;
    case 'serpent': s = serpentSet(spec); break;
    case 'blob': s = blobSet(spec); break;
    case 'wraith': s = wraithSet(spec); break;
    case 'flyer': s = flyerSet(spec); break;
    case 'eye': s = eyeSet(spec); break;
    default: s = quadSet({ ...spec, body: 'quadruped' });
  }
  cache.set(key, s);
  return s;
}

// infer the visual sub-kind of a template
export function creatureKind(tpl) {
  const n = tpl.name || '';
  if (tpl.body === 'quadruped') {
    if (tpl.bear) return 'bear';
    if (tpl.tusks) return 'boar';
    if (/Rat/.test(n)) return 'rat';
    if (/Lion/.test(n)) return 'cat';
    return 'canine';
  }
  if (tpl.body === 'arachnid') return tpl.crab ? 'crab' : tpl.shell === 'glass' ? 'beetle' : tpl.spider ? 'spider' : 'scorpion';
  if (tpl.body === 'serpent') return tpl.shell === 'glass' ? 'glass' : /worm/i.test(n) ? 'worm' : /Leviathan/.test(n) ? 'sea' : 'eel';
  if (tpl.body === 'flyer') return /Gull/.test(n) ? 'gull' : /Harpy/.test(n) ? 'harpy' : 'vulture';
  return null;
}

// ================================================================== quadrupeds & dragons
const QF = {
  canine: { bl: 1, bh: 1, ll: 1.1, hh: 1, neck: 1.5, snout: 0.95 },
  bear: { bl: 1.05, bh: 1.5, ll: 0.75, hh: 1.05, neck: 0, snout: 0.75 },
  boar: { bl: 1, bh: 1.35, ll: 0.7, hh: 1.05, neck: 0, snout: 1.0 },
  cat: { bl: 1.05, bh: 1.05, ll: 1.05, hh: 1, neck: 1, snout: 0.55 },
  rat: { bl: 1.05, bh: 0.9, ll: 0.55, hh: 0.9, neck: 0.5, snout: 1.1 },
  horse: { bl: 1.1, bh: 1.15, ll: 1.6, hh: 1.05, neck: 5, snout: 1.25 },
  stag: { bl: 1.05, bh: 1.05, ll: 1.65, hh: 0.95, neck: 4.5, snout: 1.0 },
  dragon: { bl: 1.25, bh: 1.2, ll: 0.8, hh: 1.0, neck: 5, snout: 1.15 },
};
function quadSet(o) {
  if (o.body === 'dragon') o = { ...o, kind: 'dragon' };
  const f = QF[o.kind] || QF.canine;
  const s = o.s;
  const D = {
    s, f,
    BL: Math.max(8, Math.round(15 * s * f.bl)), BH: Math.max(4, Math.round(6.5 * s * f.bh)),
    LL: Math.max(2, Math.round(5 * s * f.ll)), HH: Math.max(4, Math.round(5.5 * s * f.hh)), NK: Math.round(f.neck * s),
    tail: Math.round((o.kind === 'dragon' ? 13 : o.kind === 'rat' ? 10 : 7) * s),
  };
  D.W = D.BL + D.HH * 3 + D.tail + D.NK + 14;
  D.H = D.BH + D.LL + D.NK + D.HH + Math.round((o.kind === 'stag' ? 10 : o.kind === 'dragon' ? 16 : 5) * s) + 10;
  D.ox = 5 + D.tail + Math.round(D.BL / 2); D.oy = D.H - 2;
  const fr = (pose) => quadFrame(o, D, pose);
  const out = {
    views: { side: {
      idle: [fr({ leg: -1, bob: 0 }), fr({ leg: -1, bob: 1 })],
      run: [0, 1, 2, 3].map((l) => fr({ leg: l, bob: l % 2 })),
      atk: [fr({ leg: -1, atk: 1 }), fr({ leg: -1, atk: 2 })],
      hurt: [fr({ leg: -1, hurt: true })],
      fly: o.kind === 'dragon' ? [fr({ leg: -1, fly: 0 }), fr({ leg: -1, fly: 1 })] : null,
    } },
    sideOnly: true,
    height: D.oy - (D.oy - D.LL - D.BH - D.NK - D.HH),
  };
  out.seat = D.seat; out.mouth = D.mouth;
  return out;
}

function quadFrame(o, D, pose) {
  const { s, BL, BH, LL, HH, NK, f } = D;
  const kind = o.kind;
  const p = mk(D.W, D.H, D.ox, D.oy), e = mk(D.W, D.H, D.ox, D.oy);
  const R = ramp(o.c1), A = ramp(o.c2), Rd = R.map((c) => dark(c, 0.7));
  const dragon = kind === 'dragon', hooved = kind === 'horse' || kind === 'stag';
  const lunge = pose.atk === 1 ? -Math.max(1, Math.round(s)) : pose.atk === 2 ? Math.max(2, Math.round(2.2 * s)) : pose.hurt ? -1 : 0;
  const rx = BL / 2, ry = BH / 2;
  const bx = D.ox + lunge;
  const by = D.oy - LL - Math.round(ry) - (pose.bob || 0) + (pose.atk === 1 ? 1 : 0) - (pose.fly !== undefined ? 2 : 0);
  const gy = D.oy;
  const hipY = by + Math.round(ry * 0.3);
  const fxh = bx + Math.round(rx * 0.6), hxh = bx - Math.round(rx * 0.6);
  const lw = Math.max(2, Math.round(1.7 * s * (kind === 'bear' ? 1.5 : dragon ? 1.3 : hooved ? 0.9 : 1)));

  const leg = (x0, phase, far, hind) => {
    let sw = hind ? -0.25 : 0.25, lift = 0;
    if (pose.leg >= 0) { const q = (pose.leg + phase) % 4; sw = [1, 0, -1, 0][q]; lift = q === 3 ? 1 : 0; }
    if (!hind && pose.atk === 2) sw = 1.2;
    if (!hind && pose.atk === 1) sw = -0.3;
    if (pose.fly !== undefined) { sw = hind ? -0.8 : 0.6; lift = 2; }
    const fx = Math.round(x0 + sw * LL * 0.55 + (far ? 1 : 0)), fy = gy - lift * Math.max(1, Math.round(s * 1.2));
    const kx = Math.round((x0 + fx) / 2 + (hind ? -1 : 1) * Math.max(1, s * 0.9)), ky = Math.round((hipY + fy) / 2);
    const col = far ? Rd : R;
    p.line(x0 + (far ? 1 : 0), hipY, kx, ky, col[far ? 1 : 2], lw);
    p.line(kx, ky, fx, fy - 1, col[1], Math.max(1, lw - (hooved ? 1 : 0)));
    const pc = hooved ? dark(o.c2, 0.55) : dragon ? light(o.c2, 1.1) : dark(col[1], 0.85);
    p.rect(fx - Math.floor(lw / 2), fy - (s > 1.3 ? 1 : 0), lw + 1, s > 1.3 ? 2 : 1, pc);
    if (dragon) p.set(fx + Math.ceil(lw / 2) + 1, fy, '#f0e8d0');   // claw
  };

  // ---- far wing (dragons)
  const wingUp = pose.fly !== undefined ? pose.fly === 0 : pose.atk === 1;
  const shX = bx + Math.round(rx * 0.25), shY = by - Math.round(ry * 0.7);
  const wing = (far) => {
    const W = far ? A.map((c) => dark(c, 0.7)) : A;
    const ox = far ? 2 : 0, oy = far ? -1 : 0;
    let pts;
    const spread = pose.fly !== undefined || pose.atk;
    if (!spread) pts = [[shX + ox, shY + oy], [bx - rx * 0.7 + ox, shY - 6 * s + oy], [bx - rx * 0.9 + ox, shY + 2 * s + oy], [bx - rx * 0.1, shY + ry * 0.6]];
    else if (wingUp) pts = [[shX + ox, shY + oy], [shX - 2 * s + ox, shY - 13 * s + oy], [shX - 10 * s + ox, shY - 10 * s + oy], [shX - 13 * s + ox, shY - 3 * s + oy], [bx - rx * 0.5, shY + ry * 0.4]];
    else pts = [[shX + ox, shY + oy], [shX - 5 * s + ox, shY - 5 * s + oy], [shX - 14 * s + ox, shY - 2 * s + oy], [shX - 12 * s + ox, shY + 4 * s + oy], [bx - rx * 0.5, shY + ry * 0.5]];
    p.poly(pts, W[2]);
    // finger bones and scalloped trailing edge
    for (let i = 1; i < pts.length - 1; i++) p.line(pts[0][0], pts[0][1], pts[i][0], pts[i][1], W[0]);
    for (let i = 1; i < pts.length - 1; i++) p.set(Math.round(pts[i][0]), Math.round(pts[i][1]), light(W[3], 1.1));
  };
  if (dragon) wing(true);

  // ---- far legs
  leg(fxh, 2, true, false);
  leg(hxh, 0, true, true);

  // ---- tail
  const tbx = bx - Math.round(rx) + 1, tby = by - Math.round(ry * 0.25);
  const wag = (pose.leg >= 0 ? [0, 1, 0, -1][pose.leg] : pose.bob ? 1 : 0) * Math.max(1, Math.round(s));
  const T = D.tail;
  switch (kind) {
    case 'dragon': {
      const pts = [[tbx, tby], [tbx - T * 0.4, tby + ry * 0.6], [tbx - T * 0.75, tby + ry * 0.2 + wag], [tbx - T, tby - ry * 0.4 + wag]];
      for (let i = 0; i < 3; i++) p.taper(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], BH * (0.55 - i * 0.17), BH * (0.38 - i * 0.15), R[i ? 1 : 2]);
      for (let i = 0; i < 3; i++) { const [x, y] = pts[i + 1]; p.set(Math.round(x), Math.round(y - BH * (0.2 - i * 0.06)) - 1, A[3]); }
      p.poly([[pts[3][0], pts[3][1] - 2 * s], [pts[3][0] - 3 * s, pts[3][1]], [pts[3][0], pts[3][1] + 2 * s]], A[2]);
      break;
    }
    case 'horse': for (let k = -1; k <= 1; k++) p.line(tbx, tby, tbx - 3 * s + k, tby + 7 * s + Math.abs(k) - wag, k ? A[1] : A[2], Math.max(1, Math.round(s))); break;
    case 'bear': ball(p, tbx - 1, tby, 1.5 * s, 1.3 * s, R); break;
    case 'rat': for (let i = 0; i < T; i++) p.set(tbx - i, tby + Math.round(Math.sin(i / T * 3 + wag * 0.5) * 2 * s + i * 0.15), '#c89090'); break;
    case 'boar': p.line(tbx, tby, tbx - 2, tby - 2, R[1]); p.set(tbx - 3, tby - 1, R[1]); break;
    case 'stag': ball(p, tbx - 1, tby - 1, 1.3 * s, 1.2 * s, ramp('#f0ece0')); break;
    case 'cat': p.line(tbx, tby, tbx - T * 0.6, tby - T * 0.4 + wag, R[1], Math.max(1, Math.round(s))); ball(p, tbx - T * 0.65, tby - T * 0.45 + wag, 1.3 * s, 1.3 * s, A); break;
    default: p.taper(tbx, tby, tbx - T * 0.85, tby - T * 0.55 + wag, 2.6 * s, 1.6 * s, R[2]); p.taper(tbx - T * 0.6, tby - T * 0.4 + wag, tbx - T * 0.9, tby - T * 0.58 + wag, 1.8 * s, 1.2 * s, A[3]);
  }

  // ---- body
  ball(p, bx, by, rx, ry, R, { tex: 3 });
  if (kind === 'bear') ball(p, bx + rx * 0.35, by - ry * 0.35, rx * 0.55, ry * 0.75, R, { tex: 5 });
  if (kind === 'boar') ball(p, bx + rx * 0.3, by - ry * 0.1, rx * 0.6, ry * 0.95, R, { tex: 5 });
  if (hooved) ball(p, bx + rx * 0.55, by - ry * 0.05, rx * 0.4, ry * 0.85, R);
  if (dragon) {
    // pale belly plates
    for (let x = Math.round(bx - rx * 0.7); x <= bx + rx * 0.8; x++) { const yy = by + Math.round(ry * Math.sqrt(Math.max(0, 1 - ((x - bx) / rx) ** 2))) - 1; if (p.a(x, yy)) { p.set(x, yy, (x & 1) ? A[3] : A[2]); p.set(x, yy - 1, A[2]); } }
  }
  // back saddle of darker fur / ridge
  if (kind === 'canine' || kind === 'rat' || kind === 'cat' || kind === 'bear') {
    for (let y = Math.round(by - ry); y <= by - ry * 0.35; y++) for (let x = Math.round(bx - rx * 0.8); x <= bx + rx * 0.6; x++) {
      const nx = (x + 0.5 - bx) / rx, ny = (y + 0.5 - by) / ry;
      if (nx * nx + ny * ny <= 1 && ny < -0.45 - hash2(x, 0, 7) * 0.2) p.over(x, y, ny < -0.85 ? A[3] : A[2]);
    }
  }
  if (kind === 'boar' || dragon) {
    for (let x = Math.round(bx - rx * 0.8); x <= bx + rx * 0.5; x += 2) {
      const top = by - Math.round(ry * Math.sqrt(Math.max(0, 1 - ((x - bx) / rx) ** 2)) + (kind === 'boar' ? ry * 0.15 : 0));
      p.set(x, top - 1, A[2]); if (dragon || (x & 2)) p.set(x, top - 2, A[3]);
    }
  }

  // ---- neck & head
  const nbx = bx + Math.round(rx * 0.72), nby = by - Math.round(ry * 0.35);
  let hcx, hcy;
  if (hooved || dragon) { hcx = nbx + NK * 0.7 + HH * 0.25; hcy = nby - NK - HH * 0.3; }
  else { hcx = bx + rx + HH * 0.2; hcy = by - ry * 0.45 - NK * 0.6; }
  if (pose.atk === 1) { hcx -= Math.max(1, s); hcy += Math.max(1, s * 0.8); }
  if (pose.atk === 2) { hcx += Math.max(1, s * 1.4); hcy += dragon ? -s : 0; }
  if (pose.hurt) hcy -= 1;
  hcx = Math.round(hcx); hcy = Math.round(hcy);
  if (NK > 0) {
    p.taper(nbx, nby, hcx - HH * 0.25, hcy + HH * 0.15, BH * 0.72, HH * 0.75, R[2]);
    p.taper(nbx, nby - BH * 0.2, hcx - HH * 0.3, hcy - HH * 0.1, BH * 0.3, HH * 0.3, R[3]);
    if (kind === 'horse') p.taper(nbx - 1, nby - BH * 0.38, hcx - HH * 0.45, hcy - HH * 0.35, Math.max(2, 2 * s), Math.max(2, 1.6 * s), A[2]);
    if (dragon) for (let k = 1; k < 5; k++) { const t = k / 5; p.set(Math.round(nbx + (hcx - nbx) * t) - 1, Math.round(nby + (hcy - nby) * t - BH * 0.42 * (1 - t) - HH * 0.3 * t) - 1, A[3]); }
  }
  // lion mane behind the skull
  if (kind === 'cat' && o.mane !== false) blobShape(p, hcx - HH * 0.2, hcy + HH * 0.15, HH * 0.95, HH * 0.9, o.c2, srand(11), { bump: 0.25, lobes: 9 });
  const ex = Math.round(hcx - HH * 0.15), ey = Math.round(hcy - HH * 0.42);
  // ears behind the skull for some kinds
  const earsBack = () => {
    if (kind === 'canine') { p.poly([[ex - 1.6 * s, ey + 1], [ex + 1.4 * s, ey + 1], [ex - 0.8 * s, ey - 3.2 * s]], R[2]); p.set(ex - Math.round(0.3 * s), ey - 1, A[1]); }
    else if (kind === 'horse' || kind === 'stag') p.poly([[ex - 1.2 * s, ey + 1], [ex + 0.8 * s, ey + 1], [ex - 1.4 * s, ey - 2.6 * s]], R[2]);
    else if (kind === 'rat') { ball(p, ex - 0.5 * s, ey - 0.6 * s, 2 * s, 2 * s, R); p.disc(ex - 0.3 * s, ey - 0.4 * s, 1.1 * s, '#d89898'); }
    else if (kind === 'bear') { ball(p, ex, ey, 1.5 * s, 1.4 * s, R); p.set(ex, ey, R[0]); }
    else if (kind === 'cat') ball(p, ex, ey - 0.5 * s, 1.3 * s, 1.3 * s, R);
  };
  earsBack();
  // skull
  ball(p, hcx, hcy, HH * 0.55, HH * 0.5, R, { tex: 9 });
  // snout
  const SL = HH * f.snout;
  const sy = Math.round(hcy + HH * 0.18);
  const tipX = Math.round(hcx + HH * 0.25 + SL);
  const sh0 = HH * 0.6, sh1 = HH * (kind === 'rat' ? 0.18 : hooved ? 0.45 : kind === 'bear' ? 0.45 : 0.36);
  const open = pose.atk === 2 ? Math.max(2, Math.round(HH * 0.32)) : 0;
  if (open) {
    p.poly([[hcx + HH * 0.15, sy], [tipX, sy - 1], [tipX - 1, sy + open + 1], [hcx + HH * 0.15, sy + 1]], '#4a1418');
    p.taper(hcx, sy + 1, tipX - 1, sy + open + 1, sh0 * 0.55, sh1 * 0.7, R[1]);
    p.set(tipX - 1, sy, '#f8f0e0'); p.set(tipX - 2, sy + open, '#f8f0e0');
    if (dragon) { e.disc(tipX - 2, sy + open * 0.5, Math.max(1, open * 0.5), o.c3); }
  }
  p.taper(hcx + HH * 0.15, sy - (open ? 1 : 0), tipX, sy - (open ? 1 : 0), sh0, sh1, R[2]);
  // shading: darker underside of the muzzle, mouth line, nose
  for (let x = Math.round(hcx + HH * 0.2); x < tipX; x++) { const yb = sy + Math.round((sh0 + (sh1 - sh0) * ((x - hcx) / SL)) / 2) - (open ? 1 : 0); if (p.a(x, yb)) p.set(x, yb, R[1]); }
  if (!open) p.line(Math.round(hcx + HH * 0.3), sy + Math.round(sh1 / 2), tipX - 1, sy + Math.round(sh1 / 2), dark(o.c1, 0.45));
  p.set(tipX, sy - Math.round(sh1 / 2) - (open ? 1 : 0), dark(o.c1, 0.3));
  if (kind === 'boar') { p.line(tipX - HH * 0.35, sy + 1, tipX - HH * 0.15, sy - HH * 0.45, '#f0e8d0'); p.set(Math.round(tipX - HH * 0.15), Math.round(sy - HH * 0.45) - 1, '#ffffff'); }
  // eye
  eye(p, e, hcx + HH * 0.12, hcy - HH * 0.12, o, s >= 1.4);
  // front ears / horns / antlers
  if (kind === 'boar') p.poly([[ex - 0.5 * s, ey + 1], [ex + 2 * s, ey + 1], [ex + 2.6 * s, ey + 2.6 * s]], R[1]);
  if (kind === 'horse' || kind === 'stag') p.set(ex - 1, ey - Math.round(2 * s), light(o.c1, 1.3));
  if (kind === 'horse') for (let k = 0; k < 3; k++) p.set(Math.round(hcx - HH * 0.1) + k, Math.round(hcy - HH * 0.48) + (k > 1 ? 1 : 0), A[2]);
  if (o.antlers || kind === 'stag') {
    const ac = C(o.antlerColor || '#d8c8a8');
    for (const [dx, col] of [[2, dark(ac, 0.75)], [0, ac]]) {
      const ax = ex + dx, ay = ey;
      p.line(ax, ay, ax - 2 * s, ay - 5 * s, col); p.line(ax - 2 * s, ay - 5 * s, ax - 1 * s, ay - 9 * s, col);
      p.line(ax - 1.3 * s, ay - 3 * s, ax + 1.5 * s, ay - 5.5 * s, col); p.line(ax - 1.8 * s, ay - 6.5 * s, ax + 1 * s, ay - 9 * s, col);
      if (o.c3 && !o.tame) e.set(Math.round(ax - 1 * s), Math.round(ay - 9 * s), o.c3);
    }
  }
  if (dragon) {
    const hc = light(o.c2, 1.2);
    p.line(ex, ey + 1, ex - 3 * s, ey - 2.5 * s, hc); p.line(ex + 1, ey + 1, ex - 2 * s, ey - 1.5 * s, dark(hc, 0.8));
    p.set(Math.round(ex - 3 * s), Math.round(ey - 2.5 * s) - 1, '#f8f0e0');
  }
  // dragons: near wing after body
  if (dragon) wing(false);
  // ---- near legs
  leg(fxh, 0, false, false);
  leg(hxh, 2, false, true);
  // ---- saddle (mounts)
  if (o.saddle) {
    const sc = C(o.saddle);
    const x0 = Math.round(bx - rx * 0.35), x1 = Math.round(bx + rx * 0.25);
    const top = by - Math.round(ry);
    for (let x = x0; x <= x1; x++) for (let y = top; y <= top + Math.max(2, Math.round(ry * 0.9)); y++) if (p.a(x, y)) p.set(x, y, y === top ? light(sc, 1.2) : (x === x0 || x === x1) ? dark(sc, 0.7) : sc);
    p.rect(x0, top - 1, 2, 2, dark(sc, 0.6)); p.rect(x1 - 1, top - 1, 2, 1, dark(sc, 0.6));
    p.line(Math.round(bx), top + 2, Math.round(bx), Math.round(by + ry * 0.7), '#3a2a1a');
    p.rect(Math.round(bx) - 1, Math.round(by + ry * 0.7), 3, 1, '#a8a8b0');
    D.seat = [Math.round(bx - D.ox), top - D.oy];
  }
  D.mouth = [tipX - D.ox, sy - D.oy];
  if (o.glow2) for (let x = Math.round(bx - rx * 0.6); x < bx + rx * 0.6; x += 3) { const y = Math.round(by - ry * 0.2 + Math.sin(x) * 1.5); if (p.a(x, y)) { p.set(x, y, o.c3); e.set(x, y, o.c3); } }
  return finish(p, e);
}

// ================================================================== arachnids
function arachSet(o) {
  const s = o.s;
  const W = Math.round(32 * s) + 14, H = Math.round(26 * s) + 12;
  const D = { s, W, H, ox: Math.round(W / 2), oy: H - 2 };
  const fr = (pose) => arachFrame(o, D, pose);
  return {
    views: { side: {
      idle: [fr({ leg: -1, bob: 0 }), fr({ leg: -1, bob: 1 })],
      run: [0, 1, 2, 3].map((l) => fr({ leg: l })),
      atk: [fr({ leg: -1, atk: 1 }), fr({ leg: -1, atk: 2 })],
      hurt: [fr({ leg: -1, hurt: true })],
    } },
    sideOnly: true,
    height: Math.round((o.kind === 'scorpion' ? 14 : o.kind === 'spider' ? 13 : 10) * s),
    mouth: D.mouth,
  };
}
function arachFrame(o, D, pose) {
  const { s } = D;
  const kind = o.kind;
  const p = mk(D.W, D.H, D.ox, D.oy), e = mk(D.W, D.H, D.ox, D.oy);
  const R = ramp(o.c1), A = ramp(o.c2), Rd = R.map((c) => dark(c, 0.68));
  const glass = kind === 'beetle' && o.glass;
  const lunge = pose.atk === 1 ? -Math.max(1, Math.round(s)) : pose.atk === 2 ? Math.max(2, Math.round(2 * s)) : pose.hurt ? -1 : 0;
  const gy = D.oy;
  const bodyLift = kind === 'spider' ? 5.5 * s : kind === 'scorpion' ? 3.2 * s : kind === 'crab' ? 4.5 * s : 3.6 * s;
  const cx = D.ox + lunge, cy = Math.round(gy - bodyLift - (pose.bob || 0) - (pose.atk === 1 && kind !== 'scorpion' ? s : 0));
  const lw = Math.max(1, Math.round(1.1 * s));
  // legs: 4 per side (crabs 3), jointed high above the body so they read against it; far side first
  const nLegs = kind === 'crab' ? 3 : 4;
  const span = kind === 'spider' ? 10.5 * s : kind === 'crab' ? 9 * s : kind === 'scorpion' ? 7.5 * s : 6.5 * s;
  const topY = cy - (kind === 'spider' ? 6.5 : kind === 'crab' ? 5 : 3.6) * s;
  const hipSpan = (kind === 'spider' ? 5 : kind === 'scorpion' ? 7 : 6) * s;
  const hipX0 = kind === 'spider' ? cx + 2 * s : cx;
  const LA = kind === 'crab' ? R : A, LAd = LA.map((c) => dark(c, 0.62));
  const legs = (far) => {
    for (let i = 0; i < nLegs; i++) {
      const t = i / (nLegs - 1);
      const dir = 1 - t * 2;                      // front legs reach forward, back legs backward
      const hx = hipX0 + (0.5 - t) * hipSpan + (far ? 1 : 0), hy = cy + (far ? -1 : 0);
      let shift = 0, lift = 0;
      if (pose.leg >= 0) { const q = (pose.leg + i + (far ? 2 : 0)) % 4; shift = [1, 0, -1, 0][q] * 1.6 * s; lift = q === 3 ? Math.max(1, Math.round(s)) : 0; }
      let fx = hx + dir * span * 0.75 + Math.sign(dir || 1) * span * 0.25 + shift, fy = gy - lift;
      if (i === 0 && pose.atk === 1 && (kind === 'spider' || kind === 'beetle')) { fx = hx + span * 0.9; fy = cy - 4 * s; }
      const kx = hx + (fx - hx) * 0.4, ky = topY + (far ? 1 : 0) - Math.abs(dir) * s;
      const col = far ? LAd : LA;
      p.line(hx, hy, kx, ky, col[2], lw);
      p.line(kx, ky, fx, fy, col[1], Math.max(1, lw - (s < 1.5 ? 0 : 1)));
      p.set(Math.round(kx), Math.round(ky) - 1, col[3]);
      p.set(Math.round(fx), Math.round(fy), col[0]);
    }
  };
  legs(true);
  // scorpion tail (behind) / pincers
  if (kind === 'scorpion') {
    const segs = 6;
    let px = cx - 6 * s, py = cy - s;
    const strike = pose.atk === 2, cock = pose.atk === 1;
    for (let i = 0; i < segs; i++) {
      const t = (i + 1) / segs;
      const ang = Math.PI * (strike ? 0.15 + t * 0.95 : cock ? 0.55 + t * 0.85 : 0.4 + t * 0.95);
      const L = 3.3 * s * (1 - t * 0.2);
      const nx = px - Math.cos(ang) * L, ny = py - Math.sin(ang) * L;
      const rr = 1.8 * s * (1 - t * 0.35);
      ball(p, nx, ny, rr, rr * 0.92, i % 2 ? R : A.map((c) => mixc(c, o.c1, 0.45)));
      p.ring(nx, ny, rr + 0.6, [22, 16, 24, 255], 1);
      px = nx; py = ny;
    }
    const sc = C(o.c3);
    p.line(px, py, px + 2.5 * s, py + 1.5 * s, sc, Math.max(1, Math.round(s)));
    e.line(px, py, px + 2.5 * s, py + 1.5 * s, sc);
    D.mouth = [Math.round(px - D.ox), Math.round(py - D.oy)];
  }
  // abdomen + cephalothorax / shell
  if (kind === 'spider') {
    ball(p, cx - 4.5 * s, cy - 2.2 * s, 5.2 * s, 4.3 * s, R, { tex: 2 });
    // markings
    const mx = cx - 4.5 * s, my = cy - 2.6 * s;
    p.poly([[mx - 1.5 * s, my - 2 * s], [mx + 1.5 * s, my - 2 * s], [mx, my]], A[2]); p.poly([[mx, my], [mx - 1.5 * s, my + 2 * s], [mx + 1.5 * s, my + 2 * s]], A[1]);
    ball(p, cx + 2.5 * s, cy, 3.4 * s, 2.7 * s, R, { tex: 4 });
    // eyes cluster
    for (const [dx, dy] of [[4.2, -1.4], [5, -0.8], [3.6, -0.6], [4.6, -2]]) { const x = Math.round(cx + dx * s), y = Math.round(cy + dy * s); p.set(x, y, o.c3); e.set(x, y, o.c3); }
    // fangs
    const fo = pose.atk === 2 ? 1 : 0;
    p.line(cx + 5 * s, cy + 0.5 * s, cx + 5.5 * s + fo, cy + 2.6 * s, '#e8e0d0');
    D.mouth = [Math.round(cx + 5 * s - D.ox), Math.round(cy - D.oy)];
  } else if (kind === 'scorpion') {
    for (let i = 0; i < 4; i++) ball(p, cx - 4 * s + i * 2.6 * s, cy, 2.6 * s, 2.3 * s - i * 0.1 * s, i % 2 ? R : R.map((c) => light(c, 1.05)), { tex: i });
    ball(p, cx + 5 * s, cy + 0.2 * s, 2.6 * s, 2 * s, R);
    eye(p, e, cx + 5.8 * s, cy - 0.8 * s, o, false);
  } else if (kind === 'crab') {
    ball(p, cx, cy, 7.5 * s, 4 * s, R, { tex: 6 });
    for (let i = 0; i < 5; i++) { const x = Math.round(cx + (hash2(i, 3, 1) - 0.5) * 9 * s), y = Math.round(cy - (hash2(i, 5, 1)) * 2.5 * s); p.over(x, y, A[3]); }
    // eye stalks
    for (const dx of [2.5, 4]) { p.line(cx + dx * s, cy - 3 * s, cx + dx * s, cy - 6 * s, R[1]); eye(p, e, cx + dx * s, cy - 6.5 * s, o, s > 1.4); }
    D.mouth = [Math.round(cx + 6 * s - D.ox), Math.round(cy - D.oy)];
  } else {
    // beetle / glass shell
    ball(p, cx + 4.8 * s, cy + 0.5 * s, 2.6 * s, 2.2 * s, R);
    ball(p, cx - 1 * s, cy - 1 * s, 7.5 * s, 4.4 * s, glass ? ramp(mixc(o.c1, o.c2, 0.18)) : R, { tex: 8, lift: 0.1 });
    p.line(cx - 7 * s, cy - 0.5 * s, cx + 4 * s, cy - 1.5 * s, R[0]);   // wing seam
    if (glass) {
      // glowing glass ridges
      const gc = C(o.c2);
      for (let k = 0; k < 3; k++) { const x0 = cx - (5 - k * 3.5) * s, y0 = cy - 3 * s + k; p.line(x0, y0, x0 + 2 * s, y0 + 3 * s, gc); e.line(x0, y0, x0 + 2 * s, y0 + 3 * s, gc); }
      p.set(Math.round(cx - 3 * s), Math.round(cy - 3 * s), '#ffffff');
    } else p.set(Math.round(cx - 3 * s), Math.round(cy - 3 * s), R[3]);
    // horn / mandibles
    p.line(cx + 7 * s, cy + 0.5 * s, cx + 8.5 * s + (pose.atk === 2 ? 1 : 0), cy - 1.5 * s, light(o.c2, 1.1));
    eye(p, e, cx + 5.6 * s, cy - 0.4 * s, o, false);
    D.mouth = [Math.round(cx + 7 * s - D.ox), Math.round(cy - D.oy)];
  }
  // pincers / claws in front
  if (kind === 'scorpion' || kind === 'crab') {
    const big = kind === 'crab' ? 1.5 : 1;
    const raise = pose.atk === 1 ? -3 * s : pose.atk === 2 ? 1 * s : 0;
    const reach = pose.atk === 2 ? 2.5 * s : 0;
    const PR = kind === 'crab' ? R : A.map((c) => mixc(c, o.c1, 0.3));
    for (const far of [true, false]) {
      const col = far ? PR.map((c) => dark(c, 0.65)) : PR;
      const ax = cx + (kind === 'crab' ? 5 : 6) * s + (far ? 1 : 0), ay = cy + (far ? -1 : 1) * s;
      const hx2 = ax + 4 * s + reach, hy2 = ay - 2 * s * big + raise;
      p.line(ax, ay, hx2, hy2, col[2], Math.max(1, Math.round(1.2 * s)));
      ball(p, hx2 + 1.5 * s * big, hy2, 2.2 * s * big, 1.6 * s * big, col);
      const open = pose.atk === 1 ? 1.5 * s : 0.3 * s;
      p.line(hx2 + 2 * s * big, hy2 - 0.5, hx2 + 4.2 * s * big, hy2 - open - 0.5, col[3], Math.max(1, Math.round(s * big * 0.8)));
      p.line(hx2 + 2 * s * big, hy2 + 1, hx2 + 4 * s * big, hy2 + open * 0.5 + 1, col[1], Math.max(1, Math.round(s * 0.8)));
    }
  }
  legs(false);
  return finish(p, e);
}

// ================================================================== serpents (head + segments)
function serpentSet(o) {
  const s = o.s;
  const r0 = Math.max(3, 4.2 * s);
  const W = Math.round(r0 * 4 + 12), H = Math.round(r0 * 4 + 10);
  const D = { s, r0, W, H, ox: Math.round(W / 2 - r0 * 0.4), oy: H - 2 };
  const fr = (pose) => serpentHead(o, D, pose);
  const segs = [];
  const N = 14;
  for (let i = 0; i < N; i++) segs.push(segSprite(o, Math.max(1.6, r0 * (0.95 - (i / N) * 0.6)), i));
  return {
    views: { side: { idle: [fr({}), fr({ bob: 1 })], run: [fr({}), fr({ bob: 1 })], atk: [fr({ atk: 1 }), fr({ atk: 2 })], hurt: [fr({ hurt: true })] } },
    sideOnly: true, segs, height: Math.round(r0 * 2.4), mouth: D.mouth, r0,
  };
}
function serpentHead(o, D, pose) {
  const { s, r0 } = D;
  const p = mk(D.W, D.H, D.ox, D.oy), e = mk(D.W, D.H, D.ox, D.oy);
  const R = ramp(o.c1), A = ramp(o.c2);
  const kind = o.kind;
  const lunge = pose.atk === 2 ? Math.round(2 * s) : pose.atk === 1 ? -Math.round(s) : 0;
  const cx = D.ox + lunge, cy = Math.round(D.oy - r0 * 1.15 - (pose.bob || 0) - (pose.atk === 1 ? s : 0));
  const glass = kind === 'glass';
  if (kind === 'sea') { for (let k = 0; k < 4; k++) p.line(cx - r0 * 0.6, cy - r0 * 0.3, cx - r0 * (1.4 + k * 0.25), cy - r0 * (1.3 - k * 0.3), k % 2 ? A[2] : A[3], Math.max(1, Math.round(s))); }
  if (kind === 'worm') {
    ball(p, cx, cy, r0 * 1.1, r0 * 1.05, R, { tex: 2 });
    for (let k = -1; k <= 1; k++) for (let y = Math.round(cy - r0); y <= cy + r0; y++) { const x = Math.round(cx + k * r0 * 0.55 - r0 * 0.2); if (p.a(x, y)) p.set(x, y, A[1]); }
    const open = pose.atk === 2 ? r0 * 0.75 : pose.atk === 1 ? r0 * 0.4 : r0 * 0.2;
    ball(p, cx + r0 * 0.95, cy, Math.max(1, r0 * 0.35), Math.max(1, open), [C('#2a0a0c'), C('#3a1014'), C('#4a1418'), C('#5a1a1e')]);
    for (let k = -2; k <= 2; k++) p.set(Math.round(cx + r0 * 0.95 + (Math.abs(k) === 2 ? -1 : 0)), Math.round(cy + k * open * 0.45), '#f0e8d0');
    // mandibles
    for (const sg of [-1, 1]) p.line(cx + r0 * 0.8, cy + sg * (open + 1), cx + r0 * 1.5, cy + sg * (open * 0.6), light(o.c2, 1.2), Math.max(1, Math.round(s * 0.8)));
    D.mouth = [Math.round(cx + r0 - D.ox), Math.round(cy - D.oy)];
  } else {
    // snake/eel head: skull + long jaw
    ball(p, cx, cy, r0 * 1.0, r0 * 0.85, glass ? R : R, { tex: 4 });
    const open = pose.atk === 2 ? Math.round(r0 * 0.6) : 0;
    const tip = Math.round(cx + r0 * 1.9);
    if (open) {
      p.poly([[cx + r0 * 0.3, cy + 1], [tip, cy - 1], [tip - 1, cy + open + 1], [cx + r0 * 0.3, cy + 2]], '#3a0c10');
      p.taper(cx, cy + r0 * 0.4, tip - 1, cy + open + 1, r0 * 0.7, r0 * 0.3, R[1]);
      p.set(tip - 1, cy, '#f8f0e0'); p.set(tip - 2, cy + open, '#f8f0e0');
    }
    p.taper(cx + r0 * 0.2, cy - (open ? 1 : 0), tip, cy - 1 - (open ? 1 : 0), r0 * 1.2, r0 * 0.55, R[2]);
    p.line(cx + r0 * 0.4, cy - r0 * 0.45, tip - 1, cy - r0 * 0.2 - 1, R[3]);
    if (!open) p.line(cx + r0 * 0.5, cy + r0 * 0.2, tip - 1, cy, dark(o.c1, 0.45));
    eye(p, e, cx + r0 * 0.55, cy - r0 * 0.35, o, s >= 1.3);
    if (kind === 'sea' || kind === 'eel') { p.line(cx - r0 * 0.3, cy - r0 * 0.8, cx - r0 * 0.1, cy - r0 * 1.5, A[3], Math.max(1, Math.round(s))); }
    if (glass) for (let k = 0; k < 3; k++) { const x = Math.round(cx - r0 * 0.4 + k * r0 * 0.5), y = Math.round(cy - r0 * 0.6 + k); p.set(x, y, o.c2); e.set(x, y, o.c2); }
    D.mouth = [Math.round(tip - D.ox), Math.round(cy - D.oy)];
  }
  return finish(p, e);
}
function segSprite(o, r, i) {
  const s = o.s, kind = o.kind;
  const n = Math.ceil(r * 2 + 8);
  const p = mk(n, n, n / 2, n / 2), e = mk(n, n, n / 2, n / 2);
  const R = ramp(o.c1), A = ramp(o.c2);
  const c = n / 2;
  ball(p, c, c, r, r * 0.92, R, { tex: 10 + i });
  if (kind === 'worm') for (let y = Math.round(c - r); y <= c + r; y++) { if (p.a(Math.round(c + r * 0.3), y)) p.set(Math.round(c + r * 0.3), y, A[1]); }
  else if (kind === 'glass') { const x = Math.round(c - r * 0.3), y = Math.round(c - r * 0.4); p.line(x, y, x + r * 0.6, y + r * 0.5, o.c2); e.line(x, y, x + r * 0.6, y + r * 0.5, o.c2); }
  else {
    // dorsal ridge / fin and a belly band
    for (let k = -1; k <= 1; k++) p.set(Math.round(c + k), Math.round(c - r * 0.92) - (k ? 0 : 1), A[k ? 2 : 3]);
    if (kind === 'sea') p.line(c - 1, c - r, c + 1, c - r - Math.max(2, 1.5 * s), A[3]);
  }
  if (i % 3 === 0 && kind !== 'worm') p.over(Math.round(c - r * 0.4), Math.round(c - r * 0.45), light(o.c1, 1.4));
  return finish(p, e);
}

// ================================================================== blobs (front)
function blobSet(o) {
  const s = o.s;
  const W = Math.round(22 * s) + 12, H = Math.round(26 * s) + 12;
  const D = { s, W, H, ox: Math.round(W / 2), oy: H - 2 };
  const fr = (pose) => blobFrame(o, D, pose);
  return {
    views: { down: {
      idle: [fr({ sq: 0 }), fr({ sq: 1 })],
      run: [fr({ sq: -2, hop: 2 }), fr({ sq: 0, hop: 1 }), fr({ sq: 2 }), fr({ sq: 1 })],
      atk: [fr({ sq: 3 }), fr({ sq: -3, mouth: true })],
      hurt: [fr({ sq: 1, hurt: true })],
    } },
    sideOnly: false, frontOnly: true, height: Math.round(13 * s),
  };
}
function blobFrame(o, D, pose) {
  const { s } = D;
  const p = mk(D.W, D.H, D.ox, D.oy), e = mk(D.W, D.H, D.ox, D.oy);
  const R = ramp(o.c1), A = ramp(o.c2);
  const sq = pose.sq || 0;
  const rx = 7.5 * s + sq * 0.6 * Math.max(1, s), ry = 6.5 * s - sq * 0.6 * Math.max(1, s);
  const lift = (pose.hop || 0) * Math.max(1, s);
  const cx = D.ox, cy = D.oy - ry - lift + 1;
  // lure stalk behind
  if (o.lure) {
    const bx = cx + rx * 0.55, by = cy - ry - 6 * s + (pose.sq || 0);
    p.line(cx + rx * 0.1, cy - ry * 0.8, cx + rx * 0.35, by + 1, R[1], Math.max(1, Math.round(s * 0.7)));
    p.line(cx + rx * 0.35, by + 1, bx, by, R[1], Math.max(1, Math.round(s * 0.7)));
    p.disc(bx, by + 0.5, 1.6 * s, o.c3); p.set(Math.round(bx) - 1, Math.round(by) - 1, '#ffffff');
    e.disc(bx, by + 0.5, 1.6 * s, o.c3);
  }
  ball(p, cx, cy, rx, ry, R, { clipY: D.oy - lift, tex: 5 });
  // translucent bright underside + glossy highlight
  for (let x = Math.round(cx - rx); x <= cx + rx; x++) for (let y = Math.round(cy + ry * 0.55); y <= D.oy - lift; y++) if (p.a(x, y) && !p.a(x, y + 1)) p.set(x, y, light(o.c1, 1.25));
  p.ellipse(cx - rx * 0.45, cy - ry * 0.5, Math.max(1, rx * 0.18), Math.max(1, ry * 0.12), light(o.c1, 1.6));
  p.set(Math.round(cx - rx * 0.5), Math.round(cy - ry * 0.55), '#ffffff');
  // spots
  for (let k = 0; k < 4; k++) { const x = cx + (hash2(k, 1, 4) - 0.5) * rx * 1.4, y = cy + (hash2(k, 2, 4) - 0.3) * ry * 0.9; p.ellipse(x, y, Math.max(0.8, s * 0.9), Math.max(0.8, s * 0.7), A[1]); }
  // mushroom caps
  if (o.caps) for (const [dx, r] of [[-0.45, 0.32], [0.1, 0.42], [0.5, 0.28]]) {
    const x = cx + dx * rx, y = cy - ry * 0.75 - r * rx * 0.2;
    ball(p, x, y, r * rx, r * rx * 0.6, A, { clipY: y + 1 });
    p.set(Math.round(x - r * rx * 0.3), Math.round(y - r * rx * 0.25), '#f8f0f0'); p.set(Math.round(x + r * rx * 0.3), Math.round(y - 1), '#f8f0f0');
  }
  // face
  const ey = Math.round(cy - ry * 0.05), es = s >= 1.5 ? 2 : 1;
  for (const sg of [-1, 1]) {
    const x = Math.round(cx + sg * rx * 0.32);
    if (pose.hurt) { p.set(x - 1, ey - 1, EYE_DARK); p.set(x + 1, ey + 1, EYE_DARK); p.set(x, ey, EYE_DARK); continue; }
    p.rect(x, ey, es, es + 1, o.c3); e.rect(x, ey, es, es + 1, o.c3);
  }
  if (pose.mouth) { p.ellipse(cx, cy + ry * 0.4, Math.max(1, rx * 0.3), Math.max(1, ry * 0.25), '#2a0a10'); p.set(Math.round(cx - rx * 0.15), Math.round(cy + ry * 0.25), '#f0e8d0'); p.set(Math.round(cx + rx * 0.15), Math.round(cy + ry * 0.25), '#f0e8d0'); }
  else p.line(cx - rx * 0.15, cy + ry * 0.35, cx + rx * 0.15, cy + ry * 0.35, dark(o.c1, 0.4));
  return finish(p, e);
}

// ================================================================== wraiths (front / back)
function wraithSet(o) {
  const s = o.s;
  const W = Math.round(24 * s) + 10, H = Math.round(30 * s) + 10;
  const D = { s, W, H, ox: Math.round(W / 2), oy: H - 2 };
  const v = (view) => {
    const fr = (pose) => wraithFrame(o, D, view, pose);
    return { idle: [0, 1, 2].map((t) => fr({ t })), run: [0, 1, 2].map((t) => fr({ t, lean: 1 })), atk: [fr({ t: 0, atk: 1 }), fr({ t: 1, atk: 2 })], hurt: [fr({ t: 0, hurt: true })] };
  };
  return { views: { down: v('down'), up: v('up') }, sideOnly: false, height: Math.round(24 * s) };
}
function wraithFrame(o, D, view, pose) {
  const { s } = D;
  const p = mk(D.W, D.H, D.ox, D.oy), e = mk(D.W, D.H, D.ox, D.oy);
  const R = ramp(o.c1), A = ramp(o.c2);
  const cx = D.ox, bottom = D.oy, top = Math.round(bottom - 24 * s);
  const shY = top + Math.round(9 * s), hemY = bottom - Math.round(2 * s);
  // tattered robe
  for (let y = shY; y <= bottom; y++) {
    const t = (y - shY) / (bottom - shY);
    const half = 3.5 * s + t * 3.5 * s;
    for (let x = Math.round(cx - half); x <= cx + half; x++) {
      const u = (x - (cx - half)) / (2 * half);
      if (y > hemY - 2 * s) {
        // jagged dithered tatters that drift each frame
        const jag = Math.abs(Math.sin((x + pose.t * 2.3) * 0.9)) * 3 * s;
        if (y > hemY + jag - 2 * s) { if (bayer(x, y) > 0.5 - (bottom - y) / (4 * s)) continue; }
      }
      let c = R[2];
      if (u < 0.15) c = R[3]; else if (u > 0.8) c = R[1];
      if (Math.round(x - cx) % Math.max(2, Math.round(3 * s)) === 0 && t > 0.1) c = R[1];
      if (y === Math.round(hemY - 3 * s)) c = A[2];
      p.set(x, y, c);
    }
  }
  // arms
  const armUp = pose.atk === 1, armOut = pose.atk === 2;
  for (const sg of [-1, 1]) {
    const ax = cx + sg * 4 * s, ay = shY + s;
    const hx = armUp ? cx + sg * 6 * s : armOut ? cx + sg * 3.5 * s : cx + sg * 6.5 * s;
    const hy = armUp ? top + 2 * s : armOut ? shY + 9 * s : shY + 8 * s;
    p.taper(ax, ay, hx, hy, 3 * s, 2.4 * s, sg < 0 ? R[3] : R[1]);
    const hand = C(o.hand || '#d8d0c0');
    p.rect(Math.round(hx - s), Math.round(hy), Math.max(2, Math.round(2 * s)), Math.max(2, Math.round(2 * s)), hand);
    for (let k = -1; k <= 1; k++) p.set(Math.round(hx + k * s), Math.round(hy + 2 * s), dark(hand, 0.7));
    if (armUp || armOut) { e.set(Math.round(hx), Math.round(hy), o.c3); }
  }
  // hood
  const hy = top + Math.round(5 * s);
  ball(p, cx, hy, 4.6 * s, 5 * s, R);
  p.set(cx, top - 1, R[2]); p.set(cx, top, R[2]);
  for (let x = Math.round(cx - 4.6 * s); x <= cx + 4.6 * s; x++) if (p.a(x, Math.round(hy + 4.4 * s))) p.set(x, Math.round(hy + 4.4 * s), A[2]);
  if (view === 'down') {
    p.ellipse(cx, hy + s * 0.8, 2.8 * s, 3 * s, '#0c060c');
    const gy = Math.round(hy + s * 0.5);
    for (const sg of [-1, 1]) { const x = Math.round(cx + sg * 1.3 * s) - (sg < 0 ? 1 : 0); const w = s >= 1.6 ? 2 : 1; p.rect(x, gy, w, 1 + (s >= 1.6 ? 1 : 0), o.c3); e.rect(x, gy, w, 1 + (s >= 1.6 ? 1 : 0), o.c3); }
    if (pose.hurt) p.rect(cx - 1, gy, 2, 1, '#0c060c');
  } else {
    p.line(cx, hy - 3 * s, cx, hy + 4 * s, R[1]);
  }
  return finish(p, e);
}

// ================================================================== flyers (side)
function flyerSet(o) {
  const s = o.s;
  const W = Math.round(30 * s) + 12, H = Math.round(28 * s) + 10;
  const D = { s, W, H, ox: Math.round(W / 2), oy: H - 2 };
  const fr = (pose) => flyerFrame(o, D, pose);
  return {
    views: { side: {
      idle: [0, 1, 2, 1].map((w) => fr({ w })),
      run: [0, 1, 2, 1].map((w) => fr({ w })),
      atk: [fr({ w: 0, atk: 1 }), fr({ w: 3, atk: 2 })],
      hurt: [fr({ w: 2, hurt: true })],
    } },
    sideOnly: true, height: Math.round(10 * s), flapFps: 12,
  };
}
function flyerFrame(o, D, pose) {
  const { s } = D;
  const p = mk(D.W, D.H, D.ox, D.oy), e = mk(D.W, D.H, D.ox, D.oy);
  const kind = o.kind;
  const body = ramp(o.c1), wingR = ramp(kind === 'gull' ? o.c2 : mixc(o.c1, o.c2, 0.25));
  const headC = kind === 'vulture' ? ramp(o.c2) : body;
  const beak = C(kind === 'gull' ? o.c3 : '#e0c080');
  const tilt = pose.atk === 2 ? 2 * s : 0;
  const cx = D.ox, cy = Math.round(D.oy - 7 * s);
  const shX = cx + s, shY = cy - 2 * s;
  const wing = (far) => {
    const W = far ? wingR.map((c) => dark(c, 0.7)) : wingR;
    const fo = far ? -1 : 0;
    let pts;
    switch (pose.w) {
      case 0: pts = [[shX, shY + fo], [shX - 3 * s, shY - 10 * s + fo], [shX - 8 * s, shY - 8 * s + fo], [shX - 5 * s, shY + fo]]; break;
      case 1: pts = [[shX, shY + fo], [shX - 6 * s, shY - 5 * s + fo], [shX - 12 * s, shY - 3 * s + fo], [shX - 4 * s, shY + 1 + fo]]; break;
      case 2: pts = [[shX, shY + fo], [shX - 5 * s, shY + 5 * s + fo], [shX - 10 * s, shY + 7 * s + fo], [shX - 3 * s, shY + 1 + fo]]; break;
      default: pts = [[shX, shY + fo], [shX - 6 * s, shY - 2 * s + fo], [shX - 12 * s, shY + fo], [shX - 4 * s, shY + 2 + fo]];
    }
    p.poly(pts, W[2]);
    p.line(pts[0][0], pts[0][1], pts[1][0], pts[1][1], W[3]);
    // feather tips
    for (let k = 0; k <= 3; k++) { const t = k / 3; p.set(Math.round(pts[1][0] + (pts[2][0] - pts[1][0]) * t), Math.round(pts[1][1] + (pts[2][1] - pts[1][1]) * t), W[0]); }
  };
  wing(true);
  // tail fan
  p.poly([[cx - 4 * s, cy - s], [cx - 9 * s, cy - 2 * s + tilt * 0.5], [cx - 9 * s, cy + 2 * s], [cx - 4 * s, cy + s]], body[1]);
  // body
  ball(p, cx, cy + tilt * 0.3, 5 * s, 3.2 * s, body, { tex: 3 });
  if (kind !== 'gull') for (let x = Math.round(cx - 3 * s); x <= cx + 3 * s; x++) p.over(x, Math.round(cy + 2.4 * s + tilt * 0.3), body[3]);
  // talons
  const tc = C('#c8a060');
  const tx = pose.atk === 2 ? cx + 3 * s : cx;
  p.line(cx, cy + 2.5 * s, tx + s, cy + 5 * s, tc); p.line(cx - s, cy + 2.5 * s, tx, cy + 5 * s, dark(tc, 0.8));
  // head
  const hx = Math.round(cx + 5.2 * s), hy = Math.round(cy - 2.4 * s + tilt);
  if (kind === 'vulture') { p.taper(cx + 3 * s, cy - s, hx, hy, 2.4 * s, 1.6 * s, headC[2]); for (let k = -2; k <= 2; k++) p.set(Math.round(cx + 3 * s) + k, Math.round(cy - 1.5 * s) + Math.abs(k) % 2, body[3]); }
  ball(p, hx, hy, 2.3 * s, 2.1 * s, headC);
  p.poly([[hx + 1.5 * s, hy - 0.6 * s], [hx + 4.5 * s, hy + (kind === 'vulture' ? 1.2 : 0.4) * s], [hx + 1.5 * s, hy + 0.9 * s]], beak);
  p.set(Math.round(hx + 1.5 * s), Math.round(hy - 0.6 * s), light(beak, 1.2));
  eye(p, e, hx + 0.6 * s, hy - 0.5 * s, o, false);
  wing(false);
  return finish(p, e);
}

// ================================================================== floating eyes (front)
function eyeSet(o) {
  const s = o.s;
  const W = Math.round(22 * s) + 10, H = Math.round(28 * s) + 10;
  const D = { s, W, H, ox: Math.round(W / 2), oy: H - 2 };
  const fr = (pose) => eyeFrame(o, D, pose);
  // iris drawn by the actor so the eye can track its target
  const ir = Math.max(1.4, 2.3 * s);
  const n = Math.ceil(ir * 2 + 2);
  const iris = mk(n, n, n / 2, n / 2), ie = mk(n, n, n / 2, n / 2);
  iris.disc(n / 2, n / 2, ir, o.c3); ie.disc(n / 2, n / 2, ir, o.c3);
  iris.disc(n / 2, n / 2, Math.max(0.7, ir * 0.42), '#0a0408');
  iris.set(Math.floor(n / 2 - ir * 0.5), Math.floor(n / 2 - ir * 0.5), '#ffffff');
  return {
    views: { down: { idle: [fr({ t: 0 }), fr({ t: 1 })], run: [fr({ t: 0 }), fr({ t: 1 })], atk: [fr({ t: 0, atk: 1 }), fr({ t: 1, atk: 2 })], hurt: [fr({ t: 0, hurt: true })] } },
    sideOnly: false, frontOnly: true, height: Math.round(16 * s),
    iris: { pix: iris, emis: ie }, eyeAt: [0, -Math.round(D.oy - D.cy)], lookR: Math.max(1, 1.6 * s),
    _D: D,
  };
}
function eyeFrame(o, D, pose) {
  const { s } = D;
  const p = mk(D.W, D.H, D.ox, D.oy), e = mk(D.W, D.H, D.ox, D.oy);
  const R = ramp(o.c1), W = ramp(o.c2);
  const r = 6.5 * s;
  const cx = D.ox, cy = Math.round(D.oy - 10 * s - r * 0.6);
  D.cy = cy;
  // tentacles
  for (let k = 0; k < 5; k++) {
    const bx = cx + (k - 2) * r * 0.35;
    let x = bx, y = cy + r * 0.6;
    for (let i = 0; i < 8; i++) {
      const nx = bx + Math.sin(i * 0.8 + k + pose.t * 1.6) * 1.6 * s, ny = y + 1.2 * s;
      p.line(x, y, nx, ny, i < 4 ? R[1] : R[0], Math.max(1, Math.round(s * (1.6 - i * 0.15))));
      x = nx; y = ny;
    }
  }
  ball(p, cx, cy, r, r, R, { tex: 7 });
  // eyeball and lids
  const er = r * 0.72;
  const lid = pose.atk === 1 ? 0.45 : pose.hurt ? 0.7 : 0;
  ball(p, cx, cy, er, er * (1 - lid), W);
  for (let k = 0; k < 3; k++) { const a = k * 2.1 + 0.4; p.line(cx + Math.cos(a) * er * 0.5, cy + Math.sin(a) * er * 0.5, cx + Math.cos(a) * er * 0.95, cy + Math.sin(a) * er * 0.9, mixc(o.c2, '#c03040', 0.5)); }
  if (pose.atk === 2) { e.disc(cx, cy, er * 0.5, o.c3); }
  D.mouth = [0, cy - D.oy];
  return finish(p, e);
}
