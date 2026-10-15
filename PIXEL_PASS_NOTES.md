# Pixel pass notes

The game is now fully 2D: a top-down pixel renderer (`src/render/renderer.js` + `src/px/`), no three.js.

## What changed in this pass
- **Removed 3D leftovers**: the old mesh, material, and model modules, the 3D gallery, and `tools/check-models.mjs`. `three` is out of `package.json`, and vectors use `src/core/vec3.js`. The 3D version is still in `archive/`.
- **Crisper combat**:
  - Light attacks wind up faster and land at about 30% of the swing (`player.js` `startAttack`).
  - Slash arcs are solid pixel crescents (`vfx.js` `slash`). Stabs draw a lance streak.
  - Hit flash runs on real time: a white impact frame, then a red tint. Effects freeze during hitstop.
  - Damage numbers use a pixel font (`src/px/font.js`).
  - Projectiles have pixel trails. Light pillars are hard-edged columns.
  - Slams, landings, and heavy overheads add ground cracks plus a shockwave (`vfx.js` `shockwave`).
- **Visuals**:
  - Terrain relief is banded and dithered, and cliffs have lit rims (`terrainWorker.js`).
  - The light map is quantised with ordered dither (`renderer.js` `stepLight`).
  - Health and mana orbs are pixel-art canvases (`hud.js` `drawOrb`).
  - The default zoom is a little closer (`pixelScale`); the mouse wheel zooms out further.
- **Fixes**: crashes from negative frame indexes (some starting towns), the Fate Table panning through darkness, and the shield covering the face in side view.

## Checks
- `npm run dev`: play.
- `?quick=race,class&smoke=1`: fights a pack with every ability.
- `npm run check`: builds every site headless.
- `npm run sheets`: writes sprite contact sheets to `sheets/`.

## Pass 2: pixel UI, closer camera, haptics
- **Pixel UI everywhere**:
  - Fonts are Jersey 10 and Silkscreen, self-hosted through `@fontsource`. Sizes snap to each font's pixel grid (`--fs-*`, `--lbl-*`), and font smoothing is off.
  - Panel, button, slot, tooltip, bar, and frame graphics are 9-slice pixel images generated at startup (`src/ui/pixelKit.js`) and scaled by `--u`.
  - The logo, region banners, Fate Table header, and death title are pixel-font images (`pxTitle`).
  - Icons are downsampled into outlined 20px sprites (`icons.js` `pixelize`).
  - The minimap is square, drawn at half resolution, and uses pixel markers.
- **Camera**: the default zoom targets about 210 game pixels tall (`renderer.js` `pixelScale`). Ranged enemies only fire from on screen, and prefer about 8.5 units of distance.
- **Haptics / game feel** (`src/core/feel.js`, `cameraRig.js` `kick`):
  - Spring camera kicks toward your hits and away from hits you take, plus recoil on shots.
  - The HUD jolts and the screen edge flashes red when you're hurt.
  - Low health triggers a heartbeat pulse; boss kills get slow-mo.
  - Skill slots pop when fired and flash when ready.
  - Controllers rumble (and phones vibrate). Settings has "Screen shake & kick" and "Controller vibration".
- **Gamepad support** (`input.js` `pollGamepad`): left stick moves, right stick aims, RT attacks, LT blocks, A dodges, B interacts, X/Y/RB and d-pad left/right are skills, LB is the signature, and d-pad up/down are potions.

## Pass 3: quest markers, full map
- **Quest markers** (`src/render/questMarkers.js`):
  - "!" over NPCs with a quest to offer, "?" over NPCs a quest is waiting on.
  - A bobbing chevron over the tracked objective.
  - When the objective is off screen, an edge arrow with the distance.
- **Hunting grounds** (`src/systems/hunting.js`, spawner `updateHunts`): every "kill N of X" objective has a marked ring outside the quest-giver's town. Its targets keep spawning there while you're nearby, each with a small red arrow overhead.
- **Full map from the start** (`mapdata.js` `FULL_MAP`): no fog of war. The world map and minimap show every town, dungeon, shrine, and waystone. Waystones still need one touch before you can fast travel to them; unattuned ones are drawn dim.

## Pass 4: starter tutorial
- `src/systems/tutorial.js` starts after the prologue on a new character. It also resumes for a fresh character that quit mid-training; use `?quick=race,class&tutorial=1` to test it.
- Steps: move, hit the training dummy 3 times (the text adapts to bow, crossbow, staff/wand, or melee), dodge, block/parry, use your first usable skill, your class signature (info), open bag or map, then follow the quest arrow.
- The pixel panel sits on the left and shows key caps. Prompts switch to controller buttons when a pad is used. There's a Skip button, and the relevant hotbar slot glows.
- `src/entities/dummy.js` is a straw training dummy. It takes hits (numbers, flash, wobble) but never moves, fights back, or dies. The quest-marker chevron points at it.
- Finishing sets `flags.tutorialDone`, gives 2 Healing Draughts, and shows a "Go forth" banner with a chime and rumble.
- Aim snapping: with the mouse over an enemy's sprite, attacks and spells aim at that enemy (`player.js` `enemyUnderCursor`). Clicking a body no longer aims at the ground behind it.

## Pass 5: stamina, wall x-ray, hosting
- Stamina bar: smooth fill plus a trailing "lag" bar; sprint drains slowly (6.5/s, 3/s mounted) and locks out at empty until 33% recovers (bar turns red while winded).
- Walls and buildings no longer fade when you stand behind them; the player shows as a gold outline through whatever covers them.
- Terrain worker is inlined (`?worker&inline`) so the game can ship as one file.
- `npm run build:single` builds `dist-single/ashen-crown.html`, a single self-contained page (JS, CSS, fonts, worker inlined) used for the claude.ai hosted link.
