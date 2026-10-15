// Tiny 5-row pixel font for in-world text (damage numbers, combat callouts). Glyphs are mostly
// 3px wide; M, N and W get extra width so they stay readable. Lowercase is drawn as uppercase.
const G = {
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'], 8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '##.'],
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'], N: ['#..#', '##.#', '#.##', '#..#', '#..#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'], Q: ['.#.', '#.#', '#.#', '##.', '.##'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'],
  '+': ['...', '.#.', '###', '.#.', '...'], '-': ['...', '...', '###', '...', '...'], '!': ['#', '#', '#', '.', '#'],
  '?': ['##.', '..#', '.#.', '...', '.#.'], '(': ['.#', '#.', '#.', '#.', '.#'], ')': ['#.', '.#', '.#', '.#', '#.'],
  '.': ['.', '.', '.', '.', '#'], ',': ['.', '.', '.', '#', '#'], ':': ['.', '#', '.', '#', '.'], "'": ['#', '#', '.', '.', '.'],
  '%': ['#.#', '..#', '.#.', '#..', '#.#'], '/': ['..#', '..#', '.#.', '#..', '#..'], '♪': ['.##', '.#.', '.#.', '##.', '##.'],
  ' ': ['..', '..', '..', '..', '..'],
  // a few lowercase forms for units ("84m", "1.2km")
  m: ['.....', '.....', '####.', '#.#.#', '#.#.#'], k: ['#..', '#..', '#.#', '##.', '#.#'],
};
const FALLBACK = ['###', '#.#', '#.#', '#.#', '###'];
const glyph = (ch) => G[ch] || G[ch.toUpperCase()] || FALLBACK;

export const FONT_H = 5;
export function textWidth(text) {
  let w = 0;
  for (const ch of text) w += glyph(ch)[0].length + 1;
  return Math.max(0, w - 1);
}

// Draw `text` with its top-left at (x, y) into a pixel sink with .px(x, y, rgb, a).
// s = integer pixel size; outline = rgb for a 1px ring around the (scaled) glyphs, so big text
// keeps a thin crisp edge and counters (holes in 0, 8, A...) stay open at larger sizes.
export function drawText(L, x, y, text, color, s = 1, outline = null, a = 1, mask = null) {
  x = Math.round(x); y = Math.round(y);
  const w = textWidth(text) * s + 2, h = FONT_H * s + 2;
  const on = new Uint8Array(w * h);
  eachPixel(text, (gx, gy) => { for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) on[(gy * s + j + 1) * w + gx * s + i + 1] = 1; });
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const X = x + i - 1, Y = y + j - 1;
    if (mask && !mask(X, Y)) continue;
    if (on[j * w + i]) L.px(X, Y, typeof color === 'function' ? color(Math.floor((i - 1) / s), Math.floor((j - 1) / s)) : color, a);
    else if (outline && ((i > 0 && on[j * w + i - 1]) || (i < w - 1 && on[j * w + i + 1]) || (j > 0 && on[(j - 1) * w + i]) || (j < h - 1 && on[(j + 1) * w + i])
      || (s === 1 && ((i > 0 && j > 0 && on[(j - 1) * w + i - 1]) || (i < w - 1 && j > 0 && on[(j - 1) * w + i + 1]) || (i > 0 && j < h - 1 && on[(j + 1) * w + i - 1]) || (i < w - 1 && j < h - 1 && on[(j + 1) * w + i + 1]))))) L.px(X, Y, outline, a);
  }
}
function eachPixel(text, fn) {
  let cx = 0;
  for (const ch of text) {
    const g = glyph(ch);
    for (let r = 0; r < g.length; r++) for (let c = 0; c < g[r].length; c++) if (g[r][c] === '#') fn(cx + c, r);
    cx += g[0].length + 1;
  }
}
