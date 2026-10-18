# Art style

The look is a dusk-lit, hand-painted 16-bit style: dusty warm earth, muted teal greens, mauve and
rose flora, cool blue cloth, violet-black ink, cream highlights, and saturated violet/magenta
"aether" for magic. Characters and creatures are chunky, ink-outlined and brighter than the world
they stand in. The world is drawn in big, flat colour clusters with almost no pixel noise.

All art is our own. The rules below describe a style; nothing is traced or copied from any other
game's sprites or tiles.

Pixel density stays as in `PIXEL_DENSITY.md` (16 px per world unit, hero ~40 px).

## Palette

`src/px/palette.js` holds the master ramps (`RAMPS.dirt`, `grass`, `mauve`, `rose`, `lavender`,
`stone`, `steel`, `gold`, `wood`, `blue`, `teal`, `red`, `green`, `plum`, `skin`, `aether`, `ember`,
`frost`, `water`, ...), plus `INK` (outline), `CREAM` (top highlight / trim) and `SHADOW`
(contact shadows). Pick colours from these ramps. A new colour is fine when a ramp has nothing
close, but keep it in the same value and saturation band.

- **Value structure.** Ground and backgrounds sit low and muted: lightness about 0.25-0.45,
  saturation about 0.15-0.35. Characters, enemies, pickups and interactables sit a step brighter
  and more saturated, so they read at a glance. The brightest, most saturated colours (aether
  violet/magenta, ember orange, eye glows) belong to magic, light sources and loot.
- **Hue-shifted ramps.** Shadows lean toward plum-violet: rust goes to maroon, teal to indigo,
  blue to violet, and grey gets a violet cast. Highlights lean toward warm cream. `light()` and
  `dark()` in `pix.js` do this now, and the ramps are built the same way.
- **Never** use pure black, pure white (except 1-px glints), neutral grey with no hue, or fully
  saturated primaries.

## Outlines

- Characters, NPCs, creatures, mounts, held weapons, pickups and interactable props get a solid
  1-px `INK` outline all round. Use `outline()`, or `outlineSel()` with its new low lit-side mix.
  Only a hint of the body colour comes through on the lit side; the silhouette must read as
  ink-outlined.
- Buildings and big structures get an `INK` outline on the silhouette. Interior edges use the
  darkest step of their own ramp.
- Terrain detail is not ink-outlined: ground patches, grass tufts, flower beds, tree canopies and
  rocks set into the ground. Edges there use the darkest step of the object's own ramp, or
  `INK_SOFT` for trunks.

## Shading

- Light comes from the upper left. Use 3-4 flat bands per material with hard edges between them:
  shadow, base, light, and an optional cream top highlight.
- Add texture with clusters of 2-6 px: grain, folds, stones, leaves. Never use per-pixel
  salt-and-pepper noise on sprites or ground. Each cluster takes one ramp step.
- Dithering is only for effects that fade (glows, fog, magic). Sprites and tiles are never
  dithered.
- Cloth gets a 1-px cream (or very light ramp) trim along hems and hood edges, and a light rim
  along the top-left of the silhouette.
- Hooded faces use a dark plum/ink void with 1-2 px glowing eyes in an aether or accent colour.

## Characters and creatures

- Proportions are chunky: the head or hood is about a third of the height, the body is short and
  stocky, boots are pale and blocky, and hands are small mitts. Strong silhouettes come first.
- Cloth uses a 4-step hue-shifted ramp: deep violet-navy shadow, base, light, cream trim.
  Metal uses `steel` with a cream glint. Skin uses `skin`.
- Contact shadow: a flat ellipse in `SHADOW`. No soft gradient.

## World

- **Ground.** Big flat patches with stepped, organic blob edges, roughly 6-30 px across. Typical
  layering is dusty earth (`dirt` / `clay` / `sand` / snow) with teal-green `grass` / `moss`
  patches over it. Scatter sparse 1-3 px pebbles and specks. Never a uniform carpet of fine noise.
- **Foliage.** Leaves are chunky 4-8 px clusters in 3 tones from `grass` / `moss` / `green`, with
  plum-tinted shadows. Accent flora is in `rose` / `lavender` / `mauve`. Tree trunks are mauve or
  plum-brown (`mauve`, `wood`), with dark maroon roots.
- **Water** uses `water`: deep teal-blue bands and cream foam lines.
- **Biomes** are each a distinct palette family but share the same value band.
  - Verdant: rust earth, teal grass, rose/lavender flora.
  - Wastes: clay, salmon and maroon.
  - Gilded: ochre-cream stone and olive.
  - Frost: lavender-blue snow with slate shadows.
  - Coast: sand and teal water.
  - Maw/Deep: plum and violet with aether glows.

## Light, magic and effects

- **Aether** (`aether` ramp) is violet to magenta to pink, with a white-pink core. **Fire**
  (`ember` ramp) is maroon to orange to pale yellow. **Frost** is `frost`.
- Glows are 2-3 flat, stepped rings around a bright core. Bloom (post) adds the soft halo on the
  brightest pixels only.
- Slashes, bolts and impacts are chunky shards and streaks, 2-4 px thick, angled, with a hot
  pale core and a coloured edge. Sparks are single pixels or 2×2 blocks. Avoid thin 1-px lines
  for big effects.
- The post grade (`src/render/post.js`) lifts shadows toward plum and warms highlights. It
  boosts saturated accents and leaves muted tones dusty. There is no green or grey fog wash: fog
  and haze use the biome's own muted tone at low strength.

## UI

Panels and text use the same palette family: ink and plum backgrounds, cream text, gold or cream
frames, and aether/teal accents. They keep the same pixel font and layout.
