// Pixel buffers for procedural sprite art. Everything is drawn pixel-exact into RGBA arrays
// (no anti-aliasing), outlined, and only turned into a canvas the first time it is drawn.
// Works headless (no DOM needed until .canvas() is called).

export const PPU = 10;          // world units -> low-res pixels
export const OUTLINE = [22, 16, 24, 255];

// ------------------------------------------------------------------ colours
const cache = new Map();
export function C(hex, a = 255) {
  if (Array.isArray(hex)) return hex;
  const k = hex + a;
  let c = cache.get(k);
  if (!c) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    const n = parseInt(h, 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
    cache.set(k, c);
  }
  return c;
}
export const shade = (c, k) => { c = C(c); return [Math.min(255, Math.round(c[0] * k)), Math.min(255, Math.round(c[1] * k)), Math.min(255, Math.round(c[2] * k)), c[3]]; };
export const mixc = (a, b, t) => { a = C(a); b = C(b); return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t), Math.round(a[3] + (b[3] - a[3]) * t)]; };
export const alpha = (c, a) => { c = C(c); return [c[0], c[1], c[2], a]; };
// highlight that also shifts slightly warm, shadow that shifts cool (classic pixel-art ramps)
export const light = (c, k = 1.25) => { c = C(c); return [Math.min(255, Math.round(c[0] * k + 14)), Math.min(255, Math.round(c[1] * k + 10)), Math.min(255, Math.round(c[2] * k + 4)), c[3]]; };
export const dark = (c, k = 0.68) => { c = C(c); return [Math.round(c[0] * k), Math.round(c[1] * k + 2), Math.round(c[2] * k + 8), c[3]]; };
export const toHex = (c) => '#' + c.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('');
export const css = (c, a) => { c = C(c); return `rgba(${c[0]},${c[1]},${c[2]},${a ?? c[3] / 255})`; };

// deterministic hash noise for pixel texture
export function hash2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function srand(seed) {
  let a = seed >>> 0 || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ------------------------------------------------------------------ buffer
export class Pix {
  constructor(w, h) {
    this.w = w | 0; this.h = h | 0;
    this.d = new Uint8ClampedArray(this.w * this.h * 4);
    this.ox = 0; this.oy = 0; // pivot (feet / anchor) in pixels
    this._cv = null;
  }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) { if (!this.inb(x, y)) return null; const i = (y * this.w + x) * 4; return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]]; }
  a(x, y) { return this.inb(x, y) ? this.d[(y * this.w + x) * 4 + 3] : 0; }
  set(x, y, c) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || !c) return this;
    c = C(c);
    const i = (y * this.w + x) * 4;
    if (c[3] >= 255) { this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = 255; return this; }
    if (c[3] <= 0) return this;
    // alpha blend over
    const sa = c[3] / 255, da = this.d[i + 3] / 255, oa = sa + da * (1 - sa);
    if (oa <= 0) return this;
    this.d[i] = (c[0] * sa + this.d[i] * da * (1 - sa)) / oa;
    this.d[i + 1] = (c[1] * sa + this.d[i + 1] * da * (1 - sa)) / oa;
    this.d[i + 2] = (c[2] * sa + this.d[i + 2] * da * (1 - sa)) / oa;
    this.d[i + 3] = oa * 255;
    return this;
  }
  // only paint where something already exists (for shading passes)
  over(x, y, c) { if (this.a(x, y) > 0) this.set(x, y, c); return this; }
  clear(x, y) { if (this.inb(x, y)) this.d[(y * this.w + x) * 4 + 3] = 0; return this; }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); return this; }
  // rectangle with clipped corners (soft box)
  rrect(x, y, w, h, c, r = 1) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const cx = i < r ? r - i : i >= w - r ? i - (w - r - 1) : 0, cy = j < r ? r - j : j >= h - r ? j - (h - r - 1) : 0;
      if (cx + cy > r) continue;
      this.set(x + i, y + j, c);
    }
    return this;
  }
  ellipse(cx, cy, rx, ry, c) {
    const x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx), y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5 - cx) / (rx + 0.01), dy = (y + 0.5 - cy) / (ry + 0.01);
      if (dx * dx + dy * dy <= 1) this.set(x, y, c);
    }
    return this;
  }
  disc(cx, cy, r, c) { return this.ellipse(cx, cy, r, r, c); }
  ring(cx, cy, r, c, th = 1) {
    const x0 = Math.floor(cx - r - 1), x1 = Math.ceil(cx + r + 1);
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d <= r && d > r - th) this.set(x, y, c);
    }
    return this;
  }
  line(x0, y0, x1, y1, c, w = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (w <= 1) this.set(x0, y0, c); else this.rect(x0 - (w >> 1), y0 - (w >> 1), w, w, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return this;
  }
  // tapered thick line from (x0,y0) w0 to (x1,y1) w1
  taper(x0, y0, x1, y1, w0, w1, c) {
    const L = Math.max(1, Math.hypot(x1 - x0, y1 - y0));
    const n = Math.ceil(L * 1.5);
    for (let k = 0; k <= n; k++) {
      const t = k / n, w = w0 + (w1 - w0) * t;
      this.ellipse(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w / 2, w / 2, c);
    }
    return this;
  }
  poly(pts, c) {
    let y0 = Infinity, y1 = -Infinity;
    for (const [, y] of pts) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      const yy = y + 0.5, xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= yy && by > yy) || (by <= yy && ay > yy)) xs.push(ax + (yy - ay) / (by - ay) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.set(x, y, c);
    }
    return this;
  }
  // paste another Pix at (x, y)
  blit(p, x, y, o = {}) {
    for (let j = 0; j < p.h; j++) for (let i = 0; i < p.w; i++) {
      const k = (j * p.w + i) * 4;
      if (!p.d[k + 3]) continue;
      const sx = o.flip ? p.w - 1 - i : i;
      const c = [p.d[k], p.d[k + 1], p.d[k + 2], o.alpha !== undefined ? Math.round(p.d[k + 3] * o.alpha) : p.d[k + 3]];
      this.set(x + sx, y + j, c);
    }
    return this;
  }
  // 1px outline around opaque pixels (4-neighbour), optionally only below a given alpha
  outline(c = OUTLINE, diag = false) {
    const w = this.w, h = this.h, src = new Uint8ClampedArray(this.d);
    const A = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : src[(y * w + x) * 4 + 3]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (A(x, y) > 40) continue;
      const n = A(x - 1, y) > 100 || A(x + 1, y) > 100 || A(x, y - 1) > 100 || A(x, y + 1) > 100 || (diag && (A(x - 1, y - 1) > 100 || A(x + 1, y - 1) > 100 || A(x - 1, y + 1) > 100 || A(x + 1, y + 1) > 100));
      if (n) this.set(x, y, c);
    }
    return this;
  }
  // selective outline ("sel-out"): the outline takes a deep shade of the colour it borders, a touch
  // warmer and lighter on the lit top-left side, near-black on the shadow side, so silhouettes stay
  // readable without the flat sticker look of a pure black line
  outlineSel(base = OUTLINE, litMix = 0.42, darkMix = 0.16) {
    const w = this.w, h = this.h, src = new Uint8ClampedArray(this.d);
    const A = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : src[(y * w + x) * 4 + 3]);
    const at = (x, y) => { const i = (y * w + x) * 4; return [src[i], src[i + 1], src[i + 2], 255]; };
    base = C(base);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (A(x, y) > 40) continue;
      // neighbour on the lit side (this pixel sits above / left of the body) or the shadow side
      let nb = null, lit = false;
      if (A(x + 1, y) > 100) { nb = at(x + 1, y); lit = true; }
      else if (A(x, y + 1) > 100) { nb = at(x, y + 1); lit = true; }
      else if (A(x - 1, y) > 100) nb = at(x - 1, y);
      else if (A(x, y - 1) > 100) nb = at(x, y - 1);
      if (!nb) continue;
      const deep = [nb[0] * 0.38, nb[1] * 0.36, nb[2] * 0.42 + 6, 255];
      this.set(x, y, mixc(base, deep, lit ? litMix : darkMix));
    }
    return this;
  }
  // exact quarter-turn rotation (k = 1: 90deg clockwise), pivot carried along
  rot90(k = 1) {
    k = ((k % 4) + 4) % 4;
    if (!k) return this.clone();
    const sw = this.w, sh = this.h;
    const p = k === 2 ? new Pix(sw, sh) : new Pix(sh, sw);
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const i = (y * sw + x) * 4;
      if (!this.d[i + 3]) continue;
      let nx, ny;
      if (k === 1) { nx = sh - 1 - y; ny = x; } else if (k === 2) { nx = sw - 1 - x; ny = sh - 1 - y; } else { nx = y; ny = sw - 1 - x; }
      const o = (ny * p.w + nx) * 4;
      p.d[o] = this.d[i]; p.d[o + 1] = this.d[i + 1]; p.d[o + 2] = this.d[i + 2]; p.d[o + 3] = this.d[i + 3];
    }
    const ox = this.ox, oy = this.oy;
    if (k === 1) { p.ox = sh - oy; p.oy = ox; } else if (k === 2) { p.ox = sw - ox; p.oy = sh - oy; } else { p.ox = oy; p.oy = sw - ox; }
    return p;
  }
  // top-left lighting: brighten opaque pixels whose upper/left neighbour is empty, darken lower/right edges
  rim(lightK = 1.18, darkK = 0.78) {
    const w = this.w, h = this.h, src = new Uint8ClampedArray(this.d);
    const A = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : src[(y * w + x) * 4 + 3]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (A(x, y) < 200) continue;
      const i = (y * w + x) * 4;
      const c = [src[i], src[i + 1], src[i + 2], 255];
      if (A(x, y - 1) < 100 || A(x - 1, y) < 100) this.set(x, y, light(c, lightK));
      else if (A(x, y + 1) < 100 || A(x + 1, y) < 100) this.set(x, y, dark(c, darkK));
    }
    return this;
  }
  // replace every opaque pixel with one colour (hit flash / freeze silhouettes)
  silhouette(c, keepAlpha = true) {
    const p = new Pix(this.w, this.h); p.ox = this.ox; p.oy = this.oy;
    c = C(c);
    for (let i = 0; i < this.d.length; i += 4) {
      if (!this.d[i + 3]) continue;
      p.d[i] = c[0]; p.d[i + 1] = c[1]; p.d[i + 2] = c[2]; p.d[i + 3] = keepAlpha ? this.d[i + 3] : 255;
    }
    return p;
  }
  // tint toward a colour (frozen / petrified looks)
  tinted(c, t) {
    const p = new Pix(this.w, this.h); p.ox = this.ox; p.oy = this.oy;
    c = C(c);
    for (let i = 0; i < this.d.length; i += 4) {
      if (!this.d[i + 3]) continue;
      const l = (this.d[i] * 0.3 + this.d[i + 1] * 0.55 + this.d[i + 2] * 0.15) / 255;
      p.d[i] = this.d[i] + (c[0] * (0.4 + l) - this.d[i]) * t; p.d[i + 1] = this.d[i + 1] + (c[1] * (0.4 + l) - this.d[i + 1]) * t; p.d[i + 2] = this.d[i + 2] + (c[2] * (0.4 + l) - this.d[i + 2]) * t; p.d[i + 3] = this.d[i + 3];
    }
    return p;
  }
  flipX() {
    const p = new Pix(this.w, this.h); p.ox = this.w - this.ox; p.oy = this.oy;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const a = (y * this.w + x) * 4, b = (y * this.w + (this.w - 1 - x)) * 4;
      p.d[b] = this.d[a]; p.d[b + 1] = this.d[a + 1]; p.d[b + 2] = this.d[a + 2]; p.d[b + 3] = this.d[a + 3];
    }
    return p;
  }
  clone() { const p = new Pix(this.w, this.h); p.d.set(this.d); p.ox = this.ox; p.oy = this.oy; return p; }
  // trim transparent margins, keeping the pivot consistent
  trim(pad = 0) {
    let x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.d[(y * this.w + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return this;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(this.w - 1, x1 + pad); y1 = Math.min(this.h - 1, y1 + pad);
    const p = new Pix(x1 - x0 + 1, y1 - y0 + 1);
    for (let y = y0; y <= y1; y++) p.d.set(this.d.subarray((y * this.w + x0) * 4, (y * this.w + x1 + 1) * 4), (y - y0) * p.w * 4);
    p.ox = this.ox - x0; p.oy = this.oy - y0;
    return p;
  }
  canvas() {
    if (this._cv) return this._cv;
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, this.w); cv.height = Math.max(1, this.h);
    if (this.w && this.h) cv.getContext('2d').putImageData(new ImageData(this.d, this.w, this.h), 0, 0);
    this._cv = cv;
    return cv;
  }
}

// Ordered 4x4 Bayer threshold, for dithered fades and gradients
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
