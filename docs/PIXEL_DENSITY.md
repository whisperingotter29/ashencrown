# Pixel density

Everything on screen shares one pixel grid: one art pixel is one cell of the low-res world buffer,
blown up by the same whole number everywhere. Nothing is drawn at a different pixel size.

## Numbers

- `PPU = 16` art pixels per world unit (was 10). Exported from `src/px/pix.js` with
  `ART = 1.6` (new pixels per old design pixel) and `ap(n) = Math.round(n * ART)`.
- A hero is about 40 px from hood tip to boot sole. That matches the reference art the look is
  based on (hooded, cloaked figures; chunky boots; strong silhouettes).
- The screen shows about the same amount of world as before: the auto pixel scale is
  `round(screenHeight / 336)` (2x at 720p, 3x at 1080p).

## Rules for art and effects

1. **Same world size, more pixels.** Anything that used to be N design pixels is now about
   N × 1.6 pixels, so it covers the same patch of world.
2. **Rasterise natively, never scale images.** Shapes are drawn at the new resolution: rects,
   ellipses, polygons, tapers and per-pixel loops all run in today's pixels. Never `drawImage` a
   sprite at a non-1 scale, never `ctx.scale()` pixel art, never upscale a finished `Pix`.
   (The 2.5D lean shear and mirror flips are the only transforms.)
3. **1-pixel details stay 1 pixel.** Outlines, selective outlines, rim light, eye glints, single
   highlight pixels, dither and texture noise all stay 1 px. Geometry (lengths, radii, offsets,
   widths, gaps) scales by `ART`. More pixels means more detail: extra shading bands, folds, trim,
   texture. It shouldn't look like a blown-up old sprite.
4. **No mixed density.** No 2×2 or uneven blocks from looping over old design pixels; loop over
   real pixels. No sprite drawn at an integer upscale (big bosses are drawn at their real size).
5. **Effects follow the grid.** Glows and the WebGL magic layer render at art-pixel resolution and
   snap to dithered steps. The post lens doesn't warp, blur, roll or zoom.
6. **Keep APIs stable.** Function signatures other modules call stay the same. A generator that
   takes sizes in old design pixels from a caller outside its file converts with `ART` inside.
   Hard-coded `10` used as pixels-per-unit becomes `PPU`.

## Checking your work

- `node tools/sprite-sheet.mjs <outDir>` writes PNG contact sheets of humans, creatures, weapons
  and props (headless, fast). Add your own sheet script for other generators the same way.
- In game: `npx vite --port <port>`, open `/?quick=<race>,<class>[&dungeon=<id>]`. Test hooks:
  `window.__G`, `window.__dbg`, `window.__advance(sec, fps)`.
