// Big landmark set-pieces as pixel sprites: colossus remains, the Cinder Spire, the triumphal
// arch, aqueduct bays, the Elder Yew, the frozen titan, the dwarf gate, the lighthouse, wrecks.
// Heights are compressed (~0.6) relative to the 3D originals so they don't swallow the screen.
import { Pix, C, light, dark, mixc, hash2, srand } from '../pix.js';
import { ramp, blob } from './props.js';
import { memo, mk, done, fillWall, fillRoof, doorAt, windowAt } from './buildings.js';

// shaded ellipse with a 4-tone ramp (top-left light)
function ball(p, cx, cy, rx, ry, R, tex = 0) {
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
    const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
    if (nx * nx + ny * ny > 1) continue;
    let l = -0.5 * nx - 0.8 * ny + 0.2 + (tex ? (hash2(x, y, tex) - 0.5) * 0.3 : 0);
    p.set(x, y, R[l > 0.6 ? 3 : l > -0.1 ? 2 : l > -0.6 ? 1 : 0]);
  }
}
function sandMound(p, cx, yb, rx, ry, color, seed) { blob(p, cx, yb - ry * 0.6, rx, ry, color, srand(seed), { bump: 0.12, lobes: 5, texture: 0.25, flat: true }); }

// ---------------------------------------------------------------- colossus
export function colossusHead(sc = 1) {
  return memo('cHead' + sc, () => {
    const W = Math.round(180 * sc), H = Math.round(170 * sc);
    const p = mk(W + 40, H + 30), e = mk(W + 40, H + 30);
    const cx = p.w / 2, yb = p.h - 1, R = ramp('#c88a5a'), G = ramp('#d8a040');
    const fy = yb - H * 0.5, fr = W * 0.36;
    // crown behind and above
    for (let k = -4; k <= 4; k++) { const x = cx + k * fr * 0.22, h = (k % 2 ? 0.22 : 0.34) * H; p.poly([[x - fr * 0.1, fy - fr * 0.72], [x, fy - fr * 0.72 - h], [x + fr * 0.1, fy - fr * 0.72]], k < 0 ? G[3] : k > 2 ? G[1] : G[2]); }
    ball(p, cx, fy - fr * 0.68, fr * 1.02, fr * 0.2, G, 3);
    // face
    ball(p, cx, fy, fr, fr * 1.15, R, 7);
    // brow ridge, hollow eyes, nose, lips
    for (const sd of [-1, 1]) {
      ball(p, cx + sd * fr * 0.38, fy - fr * 0.18, fr * 0.24, fr * 0.13, [C('#0e0808'), C('#1a1010'), C('#2a1a14'), C('#3a2418')]);
      p.line(cx + sd * fr * 0.15, fy - fr * 0.36, cx + sd * fr * 0.62, fy - fr * 0.33, R[0], Math.max(2, Math.round(3 * sc)));
    }
    p.poly([[cx - fr * 0.04, fy - fr * 0.25], [cx + fr * 0.16, fy + fr * 0.3], [cx - fr * 0.12, fy + fr * 0.32]], R[3]);
    p.poly([[cx + fr * 0.04, fy - fr * 0.2], [cx + fr * 0.16, fy + fr * 0.3], [cx + fr * 0.02, fy + fr * 0.3]], R[1]);
    p.line(cx - fr * 0.25, fy + fr * 0.55, cx + fr * 0.25, fy + fr * 0.55, R[0], Math.max(2, Math.round(2 * sc)));
    p.line(cx - fr * 0.18, fy + fr * 0.62, cx + fr * 0.18, fy + fr * 0.62, R[3]);
    // cracks
    const r = srand(5);
    for (let k = 0; k < 6; k++) { let x = cx + (r() - 0.5) * fr * 1.6, y = fy + (r() - 0.5) * fr * 1.6; for (let i = 0; i < 12; i++) { const nx = x + (r() - 0.5) * 6, ny = y + r() * 5; p.line(x, y, nx, ny, R[0]); x = nx; y = ny; } }
    // half-buried in the dunes
    sandMound(p, cx, yb, W * 0.62, H * 0.22, '#d89a68', 9);
    return done(p, e);
  });
}
export function colossusHand() {
  return memo('cHand', () => {
    const p = mk(170, 150), cx = 85, yb = 149, R = ramp('#c88a5a');
    const fingers = [[-44, 70, -0.5], [-20, 105, -0.15], [6, 115, 0.05], [30, 100, 0.25], [52, 58, 0.7]];
    for (const [dx, h, lean] of fingers) {
      const x0 = cx + dx, y0 = yb - 20;
      const x1 = x0 + lean * h * 0.5, y1 = y0 - h;
      p.taper(x0, y0, x1, y1, 22, 15, R[2]);
      p.taper(x0 - 5, y0, x1 - 5, y1, 7, 5, R[3]);
      p.taper(x0 + 6, y0, x1 + 5, y1, 6, 4, R[1]);
      for (const t of [0.35, 0.68]) p.line(x0 + (x1 - x0) * t - 9, y0 + (y1 - y0) * t, x0 + (x1 - x0) * t + 9, y0 + (y1 - y0) * t, R[0]);
      ball(p, x1, y1, 7.5, 5, R);
    }
    sandMound(p, cx, yb, 82, 26, '#d89a68', 3);
    return done(p, null);
  });
}
export function colossusTorso() {
  return memo('cTorso', () => {
    const p = mk(300, 140), cx = 150, yb = 139, R = ramp('#b87a4a');
    ball(p, cx - 10, yb - 60, 110, 52, R, 4);
    // pectorals / abdomen carving facing up
    for (const sd of [-1, 1]) ball(p, cx - 40, yb - 72 + sd * 22, 30, 18, R.map((c) => light(c, 1.04)), 6);
    for (let k = 0; k < 3; k++) for (const sd of [-1, 1]) ball(p, cx + 15 + k * 22, yb - 66 + sd * 13, 10, 9, R, 8);
    // flung arm
    p.taper(cx - 90, yb - 90, cx - 135, yb - 128, 30, 22, R[2]);
    ball(p, cx - 138, yb - 130, 15, 11, R);
    // neck stump + spears stuck in it
    ball(p, cx - 118, yb - 64, 22, 26, R, 3);
    p.ellipse(cx - 118, yb - 64, 12, 15, R[0]);
    const r = srand(17);
    for (let k = 0; k < 6; k++) { const x = cx - 60 + r() * 140, y = yb - 50 - r() * 50; p.line(x, y, x + 8 + r() * 6, y - 26 - r() * 10, '#d8a040'); }
    sandMound(p, cx, yb, 140, 20, '#d8a070', 7);
    return done(p, null);
  });
}
// ---------------------------------------------------------------- the Cinder Spire
export function spireSprite(sc = 1) {
  return memo('spire' + sc, () => {
    const W = Math.round(150 * sc), H = Math.round(250 * sc);
    const p = mk(W + 20, H + 40), e = mk(W + 20, H + 40);
    const cx = p.w / 2, yb = p.h - 1;
    const segs = 8, segH = H / segs;
    for (let i = 0; i < segs; i++) {
      const r0 = (W / 2) * (1 - i * 0.093), y1 = yb - i * segH, y0 = y1 - segH;
      const col = C(i % 2 ? '#4a2a22' : '#5a3228');
      for (let y = Math.floor(y0); y <= y1; y++) {
        const t = (y - y0) / segH;
        const half = r0 * (0.92 + 0.08 * t) + Math.sin(y * 0.2 + i) * 2;
        for (let x = Math.floor(cx - half); x <= cx + half; x++) {
          const u = (x - cx) / half;
          let c = u < -0.45 ? light(col, 1.18) : u > 0.5 ? dark(col, 0.72) : col;
          if (hash2(x, y, i) < 0.08) c = dark(c, 0.8);
          if (t < 0.06) c = dark(col, 0.6);
          p.set(x, y, c);
        }
      }
      if (i > 1) { const wx = Math.round(cx + Math.sin(i * 1.7) * r0 * 0.5), wy = Math.round(y1 - segH * 0.55); doorAt(p, wx - 3, wy, 6, Math.round(segH * 0.45), '#ff7030', { arch: true }); for (let y = wy - Math.round(segH * 0.45); y <= wy; y++) for (let x = wx - 3; x < wx + 3; x++) if (p.a(x, y)) { p.set(x, y, '#ff8a40'); e.set(x, y, '#ff7030'); } }
    }
    // dragon skull crowning the broken top
    const ty = yb - H;
    ball(p, cx, ty - 6, 18 * sc, 10 * sc, ramp('#e0d8c4'));
    p.ellipse(cx - 6 * sc, ty - 8 * sc, 4 * sc, 3 * sc, '#1a1010'); e.disc(cx - 6 * sc, ty - 8 * sc, 1.5, '#ff6020');
    for (const sd of [-1, 1]) p.line(cx + sd * 10 * sc, ty - 12 * sc, cx + sd * 26 * sc, ty - 26 * sc, '#d8ccb8', 3);
    return done(p, e);
  });
}
// ---------------------------------------------------------------- imperial ruins
export function archSprite(sc = 1) {
  return memo('arch' + sc, () => {
    const W = Math.round(130 * sc), H = Math.round(160 * sc);
    const p = mk(W + 10, H + 10), e = null;
    const cx = p.w / 2, yb = p.h - 1, stone = '#e8e0cc';
    fillWall(p, cx - W / 2, yb - H, W, H, stone, 'block', 4);
    // attic with gold band
    p.rect(Math.round(cx - W / 2 - 3), yb - H - 4, W + 6, 6, '#f0e8d8');
    p.rect(Math.round(cx - W * 0.35), yb - H + 8, Math.round(W * 0.7), 10, '#c8a050');
    // central arch opening (dark) + side columns
    const aw = Math.round(W * 0.38), ah = Math.round(H * 0.62);
    doorAt(p, Math.round(cx - aw / 2), yb, aw, ah, '#1a1410', { arch: true, dark: true });
    for (const sd of [-1, 1]) for (const k of [0.3, 0.42]) { const x = Math.round(cx + sd * W * k) - 2; for (let y = yb - Math.round(H * 0.8); y < yb; y++) { p.set(x, y, '#fff8e8'); p.set(x + 1, y, '#f0e8d8'); p.set(x + 2, y, '#c8c0a8'); } }
    return done(p, e);
  });
}
export function aqueductBay() {
  return memo('aqBay', () => {
    const p = mk(92, 96), yb = 95, stone = '#d8d0b8';
    fillWall(p, 1, yb - 90, 90, 90, stone, 'block', 2);
    for (let t = 0; t < 2; t++) { const ay = t ? yb - 46 : yb; doorAt(p, 18, ay, 56, t ? 30 : 40, '#1a1410', { arch: true, dark: true }); }
    p.rect(0, yb - 92, 92, 4, '#e8e0cc');
    for (let x = 4; x < 88; x += 5) p.set(x, yb - 93, '#6aa0c0');
    return done(p, null);
  });
}
export function palaceDome() {
  return memo('palDome', () => {
    const p = mk(210, 130), cx = 105, yb = 129, G = ramp('#d8a840');
    p.rect(cx - 104, yb - 34, 208, 30, '#e8e0cc'); fillWall(p, cx - 104, yb - 34, 208, 30, '#e8e0cc', 'marble', 3);
    for (let y = yb - 120; y <= yb - 34; y++) { const t = (yb - 34 - y) / 86; const half = 96 * Math.sqrt(Math.max(0, 1 - t * t)); for (let x = Math.floor(cx - half); x <= cx + half; x++) { const u = (x - cx) / Math.max(1, half); const broken = x > cx + 10 && y < yb - 70 + Math.sin(x * 0.3) * 6; if (broken) continue; p.set(x, y, u < -0.4 ? G[3] : u > 0.45 ? G[1] : Math.round(u * 8) % 2 ? G[2] : dark(G[2], 0.92)); } }
    for (let x = cx + 12; x < cx + 96; x += 3) p.line(x, yb - 70 + Math.sin(x * 0.3) * 6, x + 2, yb - 60, '#8a6a30');
    return done(p, null);
  });
}
export function throneSprite() {
  return memo('throne', () => {
    const p = mk(40, 56), e = mk(40, 56), g = C('#c8a050');
    p.rect(6, 40, 28, 14, dark(g, 0.85)); p.rect(10, 6, 20, 36, g); p.rect(10, 6, 2, 36, light(g, 1.2));
    for (const x of [4, 30]) p.rect(x, 30, 6, 14, light(g, 1.05));
    p.poly([[10, 6], [20, 0], [30, 6]], light(g, 1.2));
    p.disc(20, 4, 2, '#ffd060'); e.disc(20, 4, 2, '#ffd060');
    return done(p, e);
  });
}
export function statueSprite(prone = true) {
  return memo('statue' + prone, () => {
    const p = mk(230, 80), cx = 115, yb = 79, R = ramp('#e8e0cc');
    ball(p, cx + 30, yb - 34, 70, 28, R, 3);          // torso lying
    for (const sd of [-1, 1]) p.taper(cx - 30, yb - 34 + sd * 12, cx - 105, yb - 30 + sd * 14, 26, 18, R[2]);
    for (const sd of [-1, 1]) ball(p, cx - 108, yb - 30 + sd * 14, 10, 9, R);
    p.taper(cx + 60, yb - 50, cx + 85, yb - 66, 18, 13, R[3]);
    return done(p, null);
  });
}
export function stoneHeadSprite(color = '#e0d8c4', crown = '#d8a040', size = 40) {
  return memo('sHead' + color + crown + size, () => {
    const p = mk(size * 2 + 10, size * 2 + 10), cx = p.w / 2, cy = p.h / 2 + 4, R = ramp(color), r = size * 0.7;
    if (crown) { const G = ramp(crown); for (let k = -3; k <= 3; k++) p.poly([[cx + k * r * 0.28 - r * 0.12, cy - r * 0.8], [cx + k * r * 0.28, cy - r * 1.25], [cx + k * r * 0.28 + r * 0.12, cy - r * 0.8]], G[k < 0 ? 3 : 2]); }
    ball(p, cx, cy, r, r * 1.12, R, 5);
    for (const sd of [-1, 1]) p.ellipse(cx + sd * r * 0.36, cy - r * 0.15, r * 0.16, r * 0.09, R[0]);
    p.poly([[cx, cy - r * 0.2], [cx + r * 0.14, cy + r * 0.3], [cx - r * 0.1, cy + r * 0.3]], R[3]);
    p.line(cx - r * 0.2, cy + r * 0.55, cx + r * 0.2, cy + r * 0.55, R[0]);
    return done(p, null);
  });
}
// ---------------------------------------------------------------- the Elder Yew
export function yewSprite(sc = 1) {
  return memo('yew' + sc, () => {
    const W = Math.round(320 * sc), H = Math.round(300 * sc);
    const p = mk(W, H), e = mk(W, H), cx = W / 2, yb = H - 1, r = srand(31);
    const bark = ramp('#4a3a28');
    // roots
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI - Math.PI; const x1 = cx + Math.cos(a) * W * 0.3, y1 = yb - 4 + Math.abs(Math.sin(a)) * -6; p.taper(cx, yb - 26, x1, yb - 4, 22 * sc, 6 * sc, bark[i % 2 ? 1 : 2]); }
    // trunk
    for (let y = yb - H * 0.6; y <= yb - 8; y++) { const t = (y - (yb - H * 0.6)) / (H * 0.6); const half = (22 + t * t * 26) * sc + Math.sin(y * 0.15) * 3; for (let x = Math.floor(cx - half); x <= cx + half; x++) { const u = (x - cx) / half; let c = u < -0.4 ? bark[3] : u > 0.45 ? bark[0] : bark[2]; if (Math.round(x * 0.4 + Math.sin(y * 0.08) * 3) % 4 === 0) c = bark[1]; p.set(x, y, c); } }
    // canopy clusters
    const greens = ['#2a5024', '#335c2a', '#3a6a30'];
    for (let i = 0; i < 14; i++) { const a = r() * Math.PI * 2, d = r() * W * 0.28; blob(p, cx + Math.cos(a) * d * 1.3, yb - H * 0.68 + Math.sin(a) * d * 0.55, W * (0.14 + r() * 0.07), W * (0.1 + r() * 0.05), greens[i % 3], r, { bump: 0.25, lobes: 7, texture: 0.5 }); }
    // glowing motes caught in the leaves
    for (let i = 0; i < 26; i++) { const x = cx + (r() - 0.5) * W * 0.8, y = yb - H * 0.68 + (r() - 0.5) * H * 0.4; if (p.a(x, y)) { p.set(x, y, '#d0ff80'); e.set(x, y, '#d0ff80'); } }
    return done(p, e);
  });
}
export function standingStone(i) {
  return memo('stoneC' + i, () => {
    const h = 30 + (i % 3) * 5, p = mk(14, h + 4), e = mk(14, h + 4), R = ramp('#6a6a62'), yb = p.h - 1;
    for (let y = yb - h; y <= yb; y++) { const t = (y - (yb - h)) / h; const half = 4 + t * 2 - (t < 0.1 ? 1 : 0); for (let x = Math.round(7 - half); x <= 7 + half; x++) { const u = x - 7; p.set(x, y, u < -2 ? R[3] : u > 2 ? R[1] : R[2]); } }
    for (let k = 0; k < 4; k++) { const y = yb - h + 8 + k * 5; p.rect(6, y, 2, 3, '#80ffc0'); e.rect(6, y, 2, 3, '#80ffc0'); }
    for (let k = 0; k < 6; k++) p.over(3 + hash2(k, i, 1) * 8, yb - hash2(k, i, 2) * h, '#5a7a4a');
    return done(p, e);
  });
}
// ---------------------------------------------------------------- frozen titan
export function titanSprite() {
  return memo('titan', () => {
    const p = mk(250, 290), e = mk(250, 290), cx = 125, yb = 289;
    const body = ramp('#4a5a6a');
    // the giant: legs braced, torso, head, arms thrown up
    for (const sd of [-1, 1]) p.taper(cx + sd * 18, yb - 120, cx + sd * 34, yb - 12, 30, 22, body[2]);
    ball(p, cx, yb - 160, 62, 56, body, 4);
    for (const sd of [-1, 1]) { p.taper(cx + sd * 50, yb - 190, cx + sd * 78, yb - 250, 26, 18, body[sd < 0 ? 3 : 1]); ball(p, cx + sd * 80, yb - 256, 14, 12, body); }
    ball(p, cx + 4, yb - 228, 30, 32, body, 6);
    p.taper(cx + 4, yb - 210, cx + 4, yb - 182, 30, 14, body[1]);   // beard
    for (const sd of [-1, 1]) { p.rect(cx + 4 + sd * 11 - 2, yb - 234, 5, 3, '#80d8ff'); e.rect(cx + 4 + sd * 11 - 2, yb - 234, 5, 3, '#80d8ff'); }
    // translucent faceted glacier over everything
    const ice = srand(21);
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const nx = (x - cx) / 118, ny = (y - (yb - 150)) / 142;
      const d = nx * nx + ny * ny * 1.05;
      if (d > 1 + Math.sin(Math.atan2(ny, nx) * 7) * 0.04) continue;
      const facet = Math.floor((x * 0.8 + y * 0.3) / 18) + Math.floor((y - x * 0.5) / 22);
      const l = -0.5 * nx - 0.7 * ny + (facet % 3) * 0.12;
      const c = l > 0.5 ? C('#e8f6ff', 170) : l > 0 ? C('#a8d8f0', 140) : C('#6aa0c8', 140);
      p.set(x, y, c);
      if (ny < -0.82 && hash2(x, y, 3) < 0.8) p.set(x, y, '#f0f6fa');
    }
    void ice;
    return done(p, e);
  });
}
// ---------------------------------------------------------------- dwarf gate (cliff + statues)
export function dwarfCliff() {
  return memo('dwCliff', () => {
    const p = mk(600, 220), e = mk(600, 220), yb = 219, r = srand(5);
    const R = ramp('#5a6470');
    for (let x = 0; x < 600; x++) {
      const top = 30 + Math.sin(x * 0.03) * 14 + Math.sin(x * 0.11) * 6 + hash2(x, 0, 2) * 4;
      for (let y = Math.round(top); y <= yb; y++) {
        const strata = Math.floor((y + Math.sin(x * 0.05) * 4) / 9);
        let c = R[strata % 3 === 0 ? 1 : strata % 3 === 1 ? 2 : 3];
        if (hash2(x, y, 7) < 0.06) c = R[0];
        if (y < top + 6 + hash2(x, 1, 3) * 4) c = C('#eef2f8');
        p.set(x, y, c);
      }
    }
    // the great doors
    const cx = 300;
    for (let y = yb - 150; y <= yb; y++) for (let x = cx - 52; x <= cx + 52; x++) { const ly = y - (yb - 150), r0 = 52, dy = Math.max(0, r0 - ly); if (Math.abs(x - cx) > Math.sqrt(Math.max(0, r0 * r0 - dy * dy)) + 6) continue; p.set(x, y, '#6a6058'); }
    doorAt(p, cx - 43, yb, 86, 134, '#3a3028', { arch: true });
    for (const yy of [30, 70, 110]) p.rect(cx - 43, yb - yy, 86, 4, '#a07a40');
    p.line(cx, yb - 134, cx, yb, '#1a1410', 2);
    for (const sd of [-1, 1]) { p.rect(cx + sd * 30 - 2, yb - 70, 4, 10, '#ffa040'); e.rect(cx + sd * 30 - 2, yb - 70, 4, 10, '#ffa040'); }
    void r;
    return done(p, e);
  });
}
export function kingStatue() {
  return memo('kingStatue', () => {
    const p = mk(60, 230), e = mk(60, 230), cx = 30, yb = 229, R = ramp('#7a7068');
    fillWall(p, cx - 20, yb - 140, 40, 140, '#7a7068', 'block', 3);
    p.rect(cx - 24, yb - 146, 48, 8, '#8a8078');
    ball(p, cx, yb - 172, 22, 26, R, 4);
    p.taper(cx, yb - 162, cx, yb - 140, 34, 14, '#6a6058');      // stone beard
    for (const sd of [-1, 1]) { p.rect(cx + sd * 8 - 2, yb - 176, 4, 2, '#ffa040'); e.rect(cx + sd * 8 - 2, yb - 176, 4, 2, '#ffa040'); }
    const G = ramp('#a08040');
    for (let k = -2; k <= 2; k++) p.poly([[cx + k * 8 - 4, yb - 194], [cx + k * 8, yb - 206], [cx + k * 8 + 4, yb - 194]], G[2]);
    p.rect(cx - 20, yb - 196, 40, 4, G[2]);
    for (let x = cx - 24; x < cx + 24; x++) if (hash2(x, 3, 1) < 0.7) p.set(x, yb - 147, '#eef2f8');
    return done(p, e);
  });
}
// ---------------------------------------------------------------- coast
export function wreckSprite(seed) {
  return memo('wreck' + seed, () => {
    const p = mk(190, 90), r = srand(seed), cx = 95, yb = 89, wood = ramp('#4a3424');
    const tilt = (r() - 0.5) * 0.3;
    for (let x = -85; x <= 85; x++) {
      const t = Math.abs(x) / 85;
      const h = 34 * Math.sqrt(1 - t * t);
      const y0 = yb - 14 + x * tilt;
      for (let y = Math.round(y0 - h); y <= y0; y++) { const ly = y0 - y; let c = ly > h - 3 ? wood[3] : (Math.floor(ly / 4) % 2 ? wood[2] : wood[1]); if (hash2(x, y, seed) < 0.05 || (x > 30 && x < 52 && ly < h * 0.6)) c = x > 30 && x < 52 ? C('#0e0a08') : wood[0]; p.set(cx + x, y, c); }
    }
    p.line(cx - 10, yb - 40, cx - 10 + r() * 40 - 20, yb - 86, '#3a2a1a', 3);
    return done(p, null);
  });
}
export function lighthouseSprite() {
  return memo('lighthouse', () => {
    const p = mk(90, 230), e = mk(90, 230), cx = 45, yb = 229, r = srand(70);
    blob(p, cx, yb - 16, 42, 16, '#4a4e52', r, { bump: 0.25 });
    const tw = ramp('#e8e0d0'), red = ramp('#a02a20');
    for (let y = yb - 170; y <= yb - 22; y++) {
      const t = (y - (yb - 170)) / 148, half = 16 + t * 8;
      const band = Math.floor((y - (yb - 170)) / 22) % 2 === 1;
      for (let x = Math.round(cx - half); x <= cx + half; x++) { const u = (x - cx) / half; const R = band ? red : tw; p.set(x, y, u < -0.4 ? R[3] : u > 0.45 ? R[1] : R[2]); }
    }
    doorAt(p, cx - 5, yb - 22, 10, 16, '#3a2a1c', { arch: true });
    for (let k = 0; k < 3; k++) windowAt(p, e, cx - 2 + (k % 2 ? 6 : -4), yb - 60 - k * 34, 3, 5, '#5a4a3a', { arch: true });
    // gallery, lantern room, cap
    p.rect(cx - 22, yb - 176, 44, 6, '#2a2a2a'); for (let x = cx - 22; x <= cx + 22; x += 3) p.rect(x, yb - 184, 1, 8, '#2a2a2a');
    p.rect(cx - 12, yb - 200, 24, 24, '#ffe0a0'); e.rect(cx - 12, yb - 200, 24, 24, '#ffe0a0');
    for (const x of [cx - 12, cx - 4, cx + 4, cx + 11]) p.rect(x, yb - 200, 1, 24, '#2a2a2a');
    for (let y = yb - 222; y <= yb - 200; y++) { const t = (y - (yb - 222)) / 22; const half = 3 + t * 16; p.rect(Math.round(cx - half), y, Math.round(half * 2), 1, t > 0.85 ? '#2a2a2a' : '#3a3a3a'); }
    return done(p, e, { lampAt: [0, -188] });
  });
}
export function skullSprite() {
  return memo('skull', () => { const p = mk(8, 7); p.ellipse(4, 3, 3.3, 3, '#e0d8c4'); p.rect(2, 3, 2, 2, '#1a1010'); p.rect(5, 3, 2, 2, '#1a1010'); p.rect(3, 6, 3, 1, '#c8c0a8'); return done(p, null); });
}
