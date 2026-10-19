# Bestiary

Every monster in Ashen Crown is drawn by hand, one design per creature. This file is the creative
brief. The drawing code is in `src/px/sprites/monsters/`, the format is in `kit.js`, and the art
rules are in `ART_STYLE.md`.

The bar is set by monster-taming games such as Aethermancer. Their monsters come from world
folklore, but none is a generic "wolf" or "slime". Each takes a mythic root, adds a twist nobody
expects, and reads as a single strong shape. Nothing is traced or copied from another game. These
are our own creatures, built the same way.

## What makes a design

1. **One idea, one twist.** Start from a folklore root, then add one surprising swap: an object
   grown into the body, an organ replaced, a habit you can see. For example, a scarab that rolls a
   ball of molten glass, or a bull guardian with a man's crowned face.
2. **Silhouette first.** Filled in solid black at game size, it must still read. Give each design
   one dominant feature that no other monster shares: a ball, a bell, a crown, a shell, a lantern,
   a mask or a throne. Vary the outline. Not everything is a horizontal oval on four legs.
3. **A face with a mood.** Eyes, mask, brow, teeth or a carved expression. Use asymmetry: a broken
   horn, a tilted crown, one bigger eye.
4. **Colour is a plan.** Use two or three body ramps from the palette and one glow accent that
   matches the element: ember for fire, frost for ice, aether violet for void and undead, teal for
   sea, toxic green for rot. The body sits a step brighter than the ground of its biome. Glow is
   kept to eyes, magic and fire.
5. **Motion with secondary action.**
   - Idle breathes, and something else moves: a flicker, a sway, a twitch, a blink or a drip.
   - Run has a real gait (`stride` and `ik` for legs), or a slither, hop, glide or flap.
   - Attack frame 1 (`pose.atk === 1`) is a clear wind-up: pull back, rear up or open wide.
     Frame 2 (`pose.atk === 2`) is the strike: lunge, snap or slam, with the reach extended.
   - Hurt recoils, and the face reacts: eyes squeeze, the mask cracks, the flame gutters.
6. **Bosses are set pieces.**
   - Two to four times the size of a mob, built from several parts, with a "crown" feature that
     makes them unmistakable.
   - Give them glowing weak points, props or attendants (eggs, masks, chains, candles, a throne),
     and more detail bands than a mob.
   - Idle loops are livelier (4 to 6 frames).
7. **Proportions are chunky.** Heads and key features run big, with an ink outline round
   everything. Details are clusters of 2 to 6 px, never pixel noise.

## Technical rules (for anyone adding a design)

- **Your file.** Each regional file exports
  - a default object `{ designId: design }`, and
  - `assign = { enemyId: { design, name, body? } }`, which proposes the enemy's new display name
    and an optional body change.

  Integration folds `assign` into `src/data/enemies.js`. Don't edit shared files (`kit.js`,
  `draw.js`, the actor, the enemy data). A helper you need goes at the top of your own file.
- **Body vs design.** `body` still drives behaviour:
  - It sets hitbox radius, the flying flag, serpent segments and the slash effect.
  - Keep the enemy's body unless the concept truly needs another.
  - Never change a body to or from `serpent` or `flyer`.
  - A `serpent` design must supply `seg(F, o, i, r, N)`, which draws one body segment (a disc-ish
    part of radius r, centred at F.cx, F.cy).
  - A `flyer` design sets `flap: 10-14`, and its run frames are the flap cycle.
  - `wraith` and `eye` designs normally set `hover: true`.
- **Size.**
  - `u = size * 1.6 * scale` px per design unit. The hero is 25 units tall at size 1 (about 40 px).
  - Regular mobs at their template size come out about 24-56 px tall.
  - Bosses (template sizes 1.2-5.6) come out about 70-220 px tall.
  - Use `scale` to tune.
  - Bosses at size above 3 are drawn at full resolution, so keep any per-pixel loops proportionate.
- **Speed.** A design's full frame set builds in under 300 ms for a mob, or 1 s for a boss. The
  sheet tool prints the time.
- **Projectiles.** Ranged attackers set `F.mouth = [x, y]` where spit, bolts and breath come out.
- **Review.**
  - `node tools/monster-sheet.mjs <outDir> <file|designId|enemyId>` writes `<design>.png`. The
    sheet shows every frame zoomed in, plus the idle frame at game scale next to the hero.
  - Look at it, fix it, and look again until it is right.

## Briefs

The roster is grouped by the file that holds it. **Name** is the display name and **root** the
folklore source. Briefs are a starting point: improve them, but keep each design's dominant feature
unique across the whole bestiary.

### wastes.js: Crimson Wastes mobs and beasts (rust, clay, salmon, maroon; ember glows)

| enemy id | name | root | concept |
|---|---|---|---|
| glass_beetle | Kiln Scarab | Egyptian scarab | Black-glazed scarab rolling a ball of molten glass it spat itself (done) |
| dune_hound | Cinder Jackal | jackal of the necropolis | Lean jackal with towering ears. Its ribcage is open like a censer and holds a live coal that flares on the bite. Tail of drifting ash |
| ash_scorpion | Censer Scorpion | temple censers | Scorpion whose tail ends in a swinging brass incense censer instead of a sting. It spits burning incense; smoke curls from the vents |
| sand_wraith | Haboob Veil | ghul / dust devils | Floating gilt death-mask trailing a long scarf of blowing sand. Two sleeve-arms of sand; the lower body is a small whirlwind |
| sandworm | Olgoi Worm | Mongolian death worm | Fat, ribbed red worm. Its head opens like a four-petal flower lined with glass teeth (serpent: head plus segments) |
| colossus_shard | Wandering Hand | fallen colossi | A broken colossal stone hand that walks on its fingers. One finger wears a ruby ring; rubble trails from the wrist. Slams with its palm |
| glass_elemental | Fulgurite | lightning glass | A jagged, hovering figure of branching red glass tubes, like frozen lightning. Crackling core; shards orbit |
| sunmad_pilgrim | Sun-Eaten Pilgrim | sun cults | Robed pilgrim whose head is a blazing sun disk with a carved face. Carries a prayer-bell staff; the robe hem is singed |
| drakeling | Kettle Drake | hearth spirits | Pudgy little drake whose belly is a cracked clay kettle. Steam from its nostrils, stubby wings, a spout for a tail |
| carrion_vulture | Bone Vulture | sky burial | Vulture wearing a bleached ox skull as a mask, ragged wings, a vertebrae necklace (flyer) |
| scorpion_queen | The Scorpion Queen | — | Huge scorpion carrying a silk-canopied palanquin of glowing eggs on her back. Twin tails, a jewelled crown carapace |
| glass_matriarch | Glass Matriarch | — | Huge spider whose abdomen is a stained-glass rose window, lit from inside. Legs of red glass |
| sandworm_elder | The Elder Sandworm | — | Colossal worm with a ruined temple ring of columns grown into its neck. Four-petal maw, tongue of tendrils (serpent) |
| ember_drakeling_alpha | Ember Drake Alpha | — | Stocky drake with a basalt crown of horns, a cracked glowing lava belly, and chimney spines that smoke (dragon) |

### sunlands.js: great bosses of the Wastes and the Gilded Reach

| enemy id | name | concept |
|---|---|---|
| colossus_heart | Heart of Ozymar | A giant beating heart of gilded clay, chained to broken pillars. Its valves vent sand; its arms are rubble |
| sand_king | The Sand-King | A mummified king on a floating throne that is an hourglass. Sand pours from the top bulb through his body; he holds a jackal-headed crook |
| obelisk_keeper | Obelisk Keeper | A floating obelisk with one great carved eye and glowing glyphs. Four stone hands orbit it |
| ash_lich | The Ash Lich | A lich whose body is an iron brazier, the ribcage a grate holding fire. A robe of falling ash, a crown of melted candles |
| glass_wyrm | The Glass Wyrm | A serpent of stained glass with lead-lined pane segments that glow. Its head is a cathedral spire with a rose-window eye (serpent) |
| ozymar | Ozymar the Unburied | The colossus rising: a vast pharaoh-statue torso. The face is half crumbled, one eye a furnace, the headdress striped |
| emperor_echo | Echo of Emperor Aurel | A gilded marble bust floating over an empty toga, with a sun-disk halo and laurels. Two disembodied gauntlets hold a sword and a sceptre |
| rogue_effigy | The Unfinished Effigy | A half-carved statue: a noble finished top, a rough block below with chisel marks. A giant chisel is stuck in its shoulder |
| emperor_shade | The Last Emperor's Shade | A colossal ghost emperor in translucent gold-white robes. Hollow face, a crown of sun rays, one huge spectral hand |

### gilded.js: the Gilded Reach and the crypts

| enemy id | name | concept |
|---|---|---|
| marble_sentinel | Lamassu | A marble bull with a crowned, bearded man's face and straight-feathered wings (done) |
| gilded_revenant | Death-Mask Legionary | No body. A floating gold death-mask, a segmented cuirass, a crested helm and two gauntlets hover in formation, with a sun shield |
| hollow_senator | Hollow Senator | A toga hanging on nothing, with a cracked marble bust for a head and a laurel. Scroll pages orbit it; one hand holds a voting tablet |
| gilded_lion | Clockwork Lion | A gilded automaton lion with a gear-tooth mane and open cogs in its flank. A wind-up key turns in its back |
| plague_rat | Rat King | Three rats with their tails knotted together, moving as one tangle. One wears a bottle-cap crown |
| ghoul | Ghoul | A gaunt grave-eater crawling on its knuckles: high shoulders, a long tongue, a lantern made of a skull with a candle in it |
| wraith | Candle Wraith | A tattered shroud with a candle where the head should be. The flame is the face, with two eye holes; hands of dripping wax |
| bone_warden | The Bone Warden | An ossuary golem of stacked skulls and femurs, arranged like a chapel chandelier, with a bell in its ribcage |
| shade_consul | Consul of Shades | An empty curule chair floating, draped in a giant toga, with a ring of marble masks (the senate) orbiting it |
| gilded_lich | The Gilded Lich | An upright golden sarcophagus that opens like doors. Inside, a linen-wrapped lich with violet eyes and scarab amulets |
| sewer_hag | Jenny of the Aqueduct | Jenny Greenteeth: a green river hag rising from a pool of sludge, with weedy hair, huge green teeth and arms that are too long |

### verdant.js: the Verdant Wilds

| enemy id | name | concept |
|---|---|---|
| thornwolf | Briarback | A wolf with a mane of brambles. Rose buds along its spine bloom red when it attacks; bark-plated snout |
| fungal_shambler | Toadstool Trudger | A giant red-and-white toadstool walking on root legs. Sleepy face in the stem; it swings a smaller mushroom like a club |
| spore_sprite | Will-o'-Moth | A glowing moth with a dandelion-puff body that leaves drifting light motes (hover) |
| elder_boar | Shrine Boar | A giant boar whose mossy back carries a little stone lantern shrine. A rope with paper streamers is tied round its tusks |
| moss_troll | Hillock Troll | A hunched troll that looks like a mossy hill. A sapling grows from its head; tiny eyes, huge hands |
| giant_spider | Pitcher Spider | A spider whose abdomen is a carnivorous pitcher plant with an opening lid. Legs like vine tendrils |
| treant | Leshy | A tall forest lord: a stag-skull face with branching antlers, a bark body, a moss beard and glowing knots |
| maze_warden | Topiary Warden | A hedge clipped into a knight-chess-piece horse on a stone plinth, with garden-shear arms (labyrinth guard) |
| rot_heart | The Rot Heart | A giant rotting gourd-heart with a carved grin, vines for arteries and root feet |
| spore_queen | The Spore Queen | A mushroom lady whose skirt is a huge gilled cap. A crown of glowing toadstools and puff-ball attendants |
| broodmother | The Broodmother | A huge spider carrying a woven cocoon nursery on its back with glowing egg sacs. Many eyes |

### wildwood.js: great bosses of the wilds and the frozen kings

| enemy id | name | concept |
|---|---|---|
| yew_blight | The Yew Blight | A colossal diseased yew with a hollow ribcage trunk, lantern fruit and a bark face |
| barrow_king | The Barrow King | A burial mound with a stone door, from which a crowned skeleton king emerges. The mound is his body |
| thorn_queen | The Thorn Queen | A fae queen with moth wings, a rose crown, a thorn gown and a mask-like face |
| maze_warden_elder | The Labyrinth Itself | A living hedge gate: a wall of hedge with a stone archway mouth, topiary towers for shoulders, eyes in the arch |
| rot_mother | The Rot Mother | A gigantic rotting tree-mother with a face in the trunk and a cradle of roots holding glowing seed pods |
| briar_matron | The Briar Matron | A bramble hag riding a flying mortar, steering with a pestle; her hair is briars |
| king_vael | King Vael the Frozen | A king fused to a floating ice throne, with an icicle crown and a cape frozen into a glacier |
| last_king | The Last King Under Snow | An undead dwarf king whose beard is a frozen waterfall, with a rune hammer and an anvil on his back |
| ymrath | Ymrath, the Frozen Titan | A colossal frost giant: a glacier body, a mammoth-skull helm, frozen pines on its shoulders |

### frost.js: the Frostreach

| enemy id | name | concept |
|---|---|---|
| frost_wolf | Aurora Fox | The Finnish fire-fox (revontulet): a fox whose tail streams the northern lights |
| ice_wraith | Rime Banshee | A hooded veil of snow with an icicle crown and long icicle fingers; the face is a crack of blue light (hover) |
| frost_troll | Snowdrift Troll | A troll with a snowcap hunch and one huge tusk, carrying a frozen tree trunk |
| frozen_knight | Encased Knight | A knight half-trapped in a block of ice that moves with him like a coffin-shield |
| snow_harpy | Strix | A white owl with a pale human mask for a face, huge eyes and talons (flyer) |
| ice_golem | Glacier Golem | A walking glacier block with a frozen mammoth skull embedded in it, tusks forward |
| crystal_spider | Geode Spider | A spider whose abdomen is a cracked geode full of violet-blue crystals |
| mine_horror | The Mine Horror | A huge mole-centipede with a drill-like nose and miners' lanterns stuck in its back |
| frost_bear_alpha | Frostmaw, the Alpha | A huge bear armoured in the frozen shields of fallen warriors, with icicle teeth |
| rimefang | Rimefang | A colossal wolf with broken chains on its neck, an aurora mane and frozen breath |

### coast.js: the Sundered Coast

| enemy id | name | concept |
|---|---|---|
| tidecrab | Bellcrab | A hermit crab using a sunken ship's bell as its shell |
| drowned_sailor | Drowned Diver | A sailor in an old brass diving helmet full of water with a fish swimming inside. Barnacles |
| sea_hag | Conch Hag | A crone carrying a huge conch shell on her back like a snail, with kelp hair and a starfish brooch |
| siren | Siren | The Greek siren: a seabird with a pale masked woman's face and sea-foam plumage (hover) |
| murk_serpent | Kelpie | A water-horse head with a kelp mane on an eel's body (serpent) |
| coral_golem | Clam Golem | A giant clam walking on coral legs that opens to show a pearl eye |
| gull | Pirate Gull | A gull wearing a stolen tricorn hat, with a huge beak (flyer) |
| king_crab | The King Crab | A giant crab wearing the stern of a sunken ship as its shell, crowned with barnacles |
| siren_queen | The Siren Queen | A great crowned siren-bird whose wings are shaped like harps |
| drowned_bishop | The Drowned Bishop | A bishop with a conch mitre whose body is a bell-jellyfish with trailing tentacles |
| ghost_captain | Captain Ashgrave | A ghost captain whose lower body is fog round a ship's wheel. Tricorn and lantern |
| keeper_of_light | Keeper of the Last Lamp | A lighthouse golem: a lighthouse body with a lamp head that sweeps a beam |

### deep.js: the Maw and the Deep

| enemy id | name | concept |
|---|---|---|
| void_wretch | Star-Eaten Wretch | A crawling thing with too-long arms whose face is a hole full of stars |
| shadow_stalker | Constellation Panther | A panther cut from a starfield, with constellation lines and eyes on its shoulders |
| void_eye | Ophan | Interlocking rings covered in eyes around a central eye (hover) |
| deep_crawler | Cart Crawler | A giant isopod that has grown into an abandoned mine cart as its shell |
| lantern_lurker | Lantern Lurker | An angler-toad with a miner's lantern for a lure |
| stone_golem | Kiln Golem | A dwarven mining golem: a walking furnace with a pickaxe arm and a chimney head |
| cave_troll | Blind Cave Troll | A tiny head, huge arms, glow-worms on its back and a stalagmite club |
| hollow_priest | Bell Priest | Its robes are a giant bell, its face a candle, its legs the clapper |
| magma_golem | Crucible Golem | A crucible pot on stilt legs pouring molten metal |
| rift_spawn | Rift Spawn | A void blob full of mouths and stars, with grasping tendrils |
| lantern_lurker_king | The Lurker King | A giant angler-toad with a chandelier for a lure and a crown |

### abyss.js: the last bosses and the abyss

| enemy id | name | concept |
|---|---|---|
| gorm, gorm_avatar | Gorm, the Mycelial God | A cathedral of mushrooms with a face, its caps for spires. The avatar is larger and brighter |
| forge_wyrm | The Forge Wyrm | A dragon with an anvil head, bellows wings and chimneys on its back (dragon) |
| hollow_king | The Hollow King | Empty royal armour with a void where the body should be, a floating crown and a cape of night |
| void_heart | The Void Heart | A giant heart-shaped void eye wrapped in veins of aether |
| ashen_king | Aurel, the Ashen King | The final boss: a towering king of ash and gold with a burning crown, a cracked glowing body, a cape of embers and a greatsword |
| crown_herald | The Crown Herald | A floating crown over an empty cloak, with arms that end in trumpets |
| void_herald | Herald of the Rift | An angel of the void with a trumpet-shaped head and many wings covered in eyes |
| trench_horror | The Trench Horror | A deep-sea angler with many eyes and a drowned lantern for a lure |
| leviathan | The Leviathan | A sea serpent with a whale-like head, barnacles and sail fins (serpent) |

Humans (bandits, corsairs, cultists, zealots, witches, raiders and their captains) and the
player's summons keep the humanoid generator.
