// The hand-authored world of Ashen Crown. Coordinates: x west(-)→east(+), z north(-)→south(+).
// The surface map spans roughly [-1200,1200] on both axes. The Hollow Deep is its own realm.

export const WORLD_HALF = 1200;

export const BIOMES = {
  wastes: {
    id: 'wastes', name: 'The Crimson Wastes', short: 'Crimson Wastes',
    blurb: 'Red dunes over buried colossi. The glass storms sing at dusk.',
    baseLevel: 20,
    palette: { low: '#a8442a', mid: '#cf7444', high: '#e3a066', rock: '#5c2a1e', alt: '#8f3524', dust: '#d98a4e' },
    fog: '#d89a7c', fogNight: '#2a1420', hemiSky: '#ffc49a', hemiGround: '#5a2a2a',
    sun: '#ffcf96', shadowTint: '#6a4a90', grade: { sat: 1.12, warm: 0.12, lift: [0.04, 0.0, 0.03] },
    particles: 'embers', music: 'wastes',
    weather: [['clear', 5], ['haze', 3], ['sandstorm', 2], ['glassstorm', 1], ['emberfall', 1.5]],
  },
  gilded: {
    id: 'gilded', name: 'The Gilded Ruins', short: 'Gilded Ruins',
    blurb: 'Marble bones of Aurelion, an empire that thought the sun would never set.',
    baseLevel: 26,
    palette: { low: '#7a7a42', mid: '#a29256', high: '#c4b896', rock: '#8a8068', alt: '#5f6a38', dust: '#d0c094' },
    fog: '#dcc8a0', fogNight: '#1c1a2c', hemiSky: '#f0dcb8', hemiGround: '#4e4632',
    sun: '#ffe2ac', shadowTint: '#5a5a90', grade: { sat: 1.0, warm: 0.08, lift: [0.03, 0.02, 0.0] },
    particles: 'pollen', music: 'gilded',
    weather: [['clear', 6], ['cloudy', 3], ['rain', 2], ['thunderstorm', 1], ['haze', 1]],
  },
  verdant: {
    id: 'verdant', name: 'The Verdant Reach', short: 'Verdant Reach',
    blurb: 'Forests older than names. Fungal groves breathe light at night.',
    baseLevel: 16,
    palette: { low: '#2c4a26', mid: '#3e6a32', high: '#6a8a3e', rock: '#4a4636', alt: '#5a3d6b', dust: '#7da04a' },
    fog: '#8fae86', fogNight: '#101c22', hemiSky: '#cfe8b0', hemiGround: '#2a3018',
    sun: '#fff0c0', shadowTint: '#203048', grade: { sat: 1.08, warm: -0.02, lift: [0.0, 0.03, 0.02] },
    particles: 'fireflies', music: 'verdant',
    weather: [['clear', 4], ['cloudy', 3], ['rain', 3], ['fog', 2], ['sporebloom', 1.5]],
  },
  frost: {
    id: 'frost', name: 'The Frostbite Spine', short: 'Frostbite Spine',
    blurb: 'Storm-lit highlands and frozen citadels on the roof of the world.',
    baseLevel: 45,
    palette: { low: '#6b7466', mid: '#8a96a0', high: '#e8eef5', rock: '#4c5664', alt: '#a8c8e0', dust: '#c8d4e0' },
    fog: '#a8b8cc', fogNight: '#0c1426', hemiSky: '#c8d8f0', hemiGround: '#3a4250',
    sun: '#e6eeff', shadowTint: '#283860', grade: { sat: 0.88, warm: -0.12, lift: [0.0, 0.02, 0.06] },
    particles: 'snow', music: 'frost',
    weather: [['clear', 3], ['cloudy', 2], ['snow', 4], ['blizzard', 2], ['thunderstorm', 1.5], ['aurora', 1]],
  },
  coast: {
    id: 'coast', name: 'The Drowned Coast', short: 'Drowned Coast',
    blurb: 'Sunken temples, pirate coves, and bells ringing under the tide.',
    baseLevel: 24,
    palette: { low: '#b8a47a', mid: '#6a8a5a', high: '#7f9468', rock: '#3a3d40', alt: '#c98a7a', dust: '#d8c8a0' },
    fog: '#9ab8bc', fogNight: '#0c1a26', hemiSky: '#bfe0e8', hemiGround: '#3a4a40',
    sun: '#fff2d8', shadowTint: '#203a50', grade: { sat: 1.02, warm: -0.05, lift: [0.0, 0.02, 0.04] },
    particles: 'spray', music: 'coast',
    weather: [['clear', 4], ['cloudy', 3], ['fog', 3], ['rain', 2], ['thunderstorm', 1.5]],
  },
  maw: {
    id: 'maw', name: 'The Maw', short: 'The Maw',
    blurb: 'A wound in the world. The Hollow Deep breathes up from below.',
    baseLevel: 30,
    palette: { low: '#3a3240', mid: '#4a4448', high: '#6a5a6a', rock: '#2a2230', alt: '#5a3d7a', dust: '#7a6a8a' },
    fog: '#6a5a7a', fogNight: '#100a1a', hemiSky: '#b0a0d0', hemiGround: '#2a1a30',
    sun: '#e0c8ff', shadowTint: '#301848', grade: { sat: 0.9, warm: -0.05, lift: [0.03, 0.0, 0.06] },
    particles: 'voidmotes', music: 'maw',
    weather: [['clear', 3], ['haze', 2], ['voidstorm', 1.5], ['emberfall', 1]],
  },
  deep: {
    id: 'deep', name: 'The Hollow Deep', short: 'Hollow Deep',
    blurb: 'Lantern-lit kingdoms beneath the world, where the old crown fell.',
    baseLevel: 60,
    palette: { low: '#2a2630', mid: '#3a3442', high: '#4c4458', rock: '#1c1a22', alt: '#2f5a6a', dust: '#5a4a6a' },
    fog: '#0e0c16', fogNight: '#0e0c16', hemiSky: '#4a5a8a', hemiGround: '#1a1020',
    sun: '#6a7ab0', shadowTint: '#100818', grade: { sat: 1.05, warm: -0.04, lift: [0.01, 0.0, 0.03] },
    particles: 'deepmotes', music: 'deep',
    weather: [['clear', 1]],
  },
};

// Voronoi seeds that shape the biome regions (domain-warped at sample time)
export const BIOME_SEEDS = [
  // Frostbite Spine (north)
  ['frost', -950, -1050], ['frost', -560, -980], ['frost', -150, -1040], ['frost', 280, -980], ['frost', 720, -1000],
  ['frost', -760, -800], ['frost', 20, -830], ['frost', 450, -780], ['frost', -380, -760],
  // Verdant Reach (west)
  ['verdant', -1050, -480], ['verdant', -980, -60], ['verdant', -1020, 420], ['verdant', -680, -330], ['verdant', -640, 160],
  ['verdant', -560, 520], ['verdant', -860, 820], ['verdant', -520, -80],
  // Gilded Ruins (center-north)
  ['gilded', -250, -470], ['gilded', 140, -470], ['gilded', -140, -170], ['gilded', 360, -260], ['gilded', -300, 60],
  ['gilded', 160, -120], ['gilded', 520, -520],
  // Crimson Wastes (south)
  ['wastes', 20, 470], ['wastes', 420, 380], ['wastes', -220, 700], ['wastes', 300, 820], ['wastes', 680, 620],
  ['wastes', -480, 960], ['wastes', 100, 1080], ['wastes', 640, 1020], ['wastes', 460, 120], ['wastes', -320, 420],
  // Drowned Coast (east)
  ['coast', 960, -620], ['coast', 980, -220], ['coast', 980, 220], ['coast', 930, 620], ['coast', 1000, 940],
  ['coast', 820, -860], ['coast', 860, 20],
];

export const MAW = { x: 60, z: 210, r: 120, pitR: 46 };

export const FACTIONS = {
  sunward: {
    id: 'sunward', name: 'The Sunward Order', color: '#f0c860', sigil: '☀',
    desc: 'Knights who still tend the dead empire\'s flame, hoping the sun will rise for Aurelion again.',
    hq: 'sunhold',
  },
  ashen: {
    id: 'ashen', name: 'The Ashen Court', color: '#d0503a', sigil: '♛',
    desc: 'A court-in-exile ruling from the desert, whose nobles anoint themselves with the ash of the old throne.',
    hq: 'qalsahar',
  },
  tidebound: {
    id: 'tidebound', name: 'The Tidebound Guild', color: '#4ab0c0', sigil: '⚓',
    desc: 'Merchants, smugglers and salvagers who say anything the sea swallows belongs to them.',
    hq: 'brinehollow',
  },
  choir: {
    id: 'choir', name: 'The Silent Choir', color: '#9a80d0', sigil: '◐',
    desc: 'Monks who took a vow of silence after hearing what sings in the Hollow Deep.',
    hq: 'quietspire',
  },
};

// Towns. `start` marks a racial starting town. Services drive the NPC roster.
export const TOWNS = [
  { id: 'emberwell', name: 'Emberwell', biome: 'wastes', x: 200, z: 520, r: 34, faction: 'ashen', start: 'ashborn',
    services: ['merchant', 'blacksmith', 'innkeeper', 'quest', 'stable', 'bounty', 'guard', 'trainer:lunge'], style: 'desert' },
  { id: 'cinderspire', name: 'Cinder Spire', biome: 'wastes', x: -250, z: 860, r: 26, faction: 'ashen', start: 'dragonblood',
    services: ['merchant', 'blacksmith', 'quest', 'tome:embers', 'guard'], style: 'desert' },
  { id: 'qalsahar', name: "Qal'Sahar", biome: 'wastes', x: 600, z: 800, r: 44, faction: 'ashen',
    services: ['merchant', 'blacksmith', 'enchanter', 'innkeeper', 'quest', 'faction', 'stable', 'bounty', 'guard', 'trainer:riposte', 'trainer:bladedance', 'tome:embers'], style: 'desert' },
  { id: 'aurelionsrest', name: "Aurelion's Rest", biome: 'gilded', x: -170, z: -190, r: 34, faction: 'sunward', start: 'human',
    services: ['merchant', 'blacksmith', 'innkeeper', 'quest', 'stable', 'bounty', 'guard', 'trainer:shieldbash'], style: 'marble' },
  { id: 'effigies', name: 'Hall of Effigies', biome: 'gilded', x: 330, z: -400, r: 26, faction: 'sunward', start: 'stoneborn',
    services: ['merchant', 'blacksmith', 'quest', 'enchanter', 'guard'], style: 'marble' },
  { id: 'ossuary', name: 'Ossuary of Kings', biome: 'gilded', x: -290, z: -10, r: 26, faction: 'choir', start: 'revenant',
    services: ['merchant', 'quest', 'tome:rot', 'innkeeper', 'guard'], style: 'marble' },
  { id: 'sunhold', name: 'Sunhold', biome: 'gilded', x: 40, z: -600, r: 42, faction: 'sunward',
    services: ['merchant', 'blacksmith', 'enchanter', 'innkeeper', 'quest', 'faction', 'stable', 'bounty', 'guard', 'trainer:shieldwall', 'trainer:parry', 'tome:radiant'], style: 'marble' },
  { id: 'sylvanhold', name: 'Sylvanhold', biome: 'verdant', x: -820, z: -250, r: 36, faction: null, start: 'elf',
    services: ['merchant', 'blacksmith', 'innkeeper', 'quest', 'stable', 'guard', 'trainer:volley', 'tome:verdant'], style: 'wood' },
  { id: 'mirewisp', name: 'Mirewisp Hollow', biome: 'verdant', x: -700, z: 380, r: 28, faction: null, start: 'fae',
    services: ['merchant', 'quest', 'enchanter', 'innkeeper', 'guard', 'tome:verdant'], style: 'wood' },
  { id: 'greywater', name: 'Greywater', biome: 'verdant', x: -560, z: -560, r: 26, faction: null,
    services: ['merchant', 'blacksmith', 'innkeeper', 'quest', 'bounty', 'guard', 'trainer:stealth'], style: 'wood' },
  { id: 'kharakdun', name: 'Kharak Dun', biome: 'frost', x: -420, z: -860, r: 34, faction: null, start: 'dwarf',
    services: ['merchant', 'blacksmith', 'enchanter', 'innkeeper', 'quest', 'guard', 'trainer:groundslam', 'trainer:crafting'], style: 'stone' },
  { id: 'skarrow', name: 'Skarrow Camp', biome: 'frost', x: 380, z: -720, r: 30, faction: null, start: 'orc',
    services: ['merchant', 'blacksmith', 'quest', 'stable', 'guard', 'trainer:whirlwind', 'tome:storm'], style: 'camp' },
  { id: 'quietspire', name: 'The Quiet Spire', biome: 'frost', x: 60, z: -1000, r: 30, faction: 'choir',
    services: ['merchant', 'enchanter', 'quest', 'faction', 'innkeeper', 'guard', 'trainer:shadowstep', 'tome:void', 'tome:frost'], style: 'stone' },
  { id: 'brinehollow', name: 'Brinehollow', biome: 'coast', x: 890, z: -150, r: 40, faction: 'tidebound', start: 'tidekin',
    services: ['merchant', 'blacksmith', 'enchanter', 'innkeeper', 'quest', 'faction', 'stable', 'bounty', 'guard', 'trainer:piercingshot', 'tome:tidal', 'tome:storm'], style: 'port' },
  { id: 'saltfang', name: 'Saltfang', biome: 'coast', x: 920, z: 700, r: 28, faction: 'tidebound', start: 'beastkin',
    services: ['merchant', 'blacksmith', 'quest', 'innkeeper', 'guard', 'trainer:pounce'], style: 'port' },
  { id: 'gullwatch', name: 'Gullwatch', biome: 'coast', x: 870, z: -620, r: 24, faction: 'tidebound',
    services: ['merchant', 'innkeeper', 'quest', 'bounty', 'guard', 'stable'], style: 'port' },
  { id: 'riftwatch', name: 'Riftwatch', biome: 'maw', x: 60, z: 98, r: 28, faction: 'choir', start: 'void',
    services: ['merchant', 'blacksmith', 'quest', 'innkeeper', 'guard', 'tome:void', 'trainer:riftwalk'], style: 'stone' },
];

// Hollow Deep settlements live in deep-realm coordinates (realm spans [-500,500])
export const DEEP_TOWNS = [
  { id: 'lanternfall', name: 'Lanternfall', biome: 'deep', x: 0, z: -360, r: 34, faction: null,
    services: ['merchant', 'blacksmith', 'enchanter', 'innkeeper', 'quest', 'guard', 'trainer:crafting'], style: 'stone' },
  { id: 'gloomhaven', name: 'Gloomhaven Market', biome: 'deep', x: -280, z: 60, r: 30, faction: 'tidebound',
    services: ['merchant', 'enchanter', 'quest', 'bounty', 'guard', 'tome:rot', 'tome:void'], style: 'stone' },
  { id: 'quiethalls', name: 'The Quiet Halls', biome: 'deep', x: 300, z: 120, r: 30, faction: 'choir',
    services: ['merchant', 'quest', 'faction', 'innkeeper', 'guard', 'trainer:shadowstep', 'tome:void'], style: 'stone' },
];

// The Maw descends into the Deep; these are the two-way gates.
export const REALM_GATES = [
  { id: 'maw_gate', realm: 'surface', x: MAW.x, z: MAW.z, to: 'deep', tx: 0, tz: -420, label: 'Descend into the Hollow Deep' },
  { id: 'deep_gate', realm: 'deep', x: 0, z: -440, to: 'surface', tx: MAW.x, tz: MAW.z - 30, label: 'Climb to the surface' },
];

// Dungeon themes define layout, palette, enemies and props. Colours follow docs/ART_STYLE.md:
// floor and wall sit low and muted (purple stone, teal stone, clay, plum, bone-cream...), torches
// and braziers burn in the ember ramp, magical themes glow aether violet, rose or frost.
export const DUNGEON_THEMES = {
  bandit_hideout: { name: 'Hideout', floor: '#6a5040', wall: '#5e4a4c', accent: '#ec7a2a', light: '#f8a050', fog: '#1a0e12', enemies: ['bandit', 'bandit_archer', 'bandit_brute'], props: ['crate', 'barrel', 'tent', 'campfire', 'banner'], layout: 'cave' },
  cursed_crypt: { name: 'Crypt', floor: '#4e4658', wall: '#544a64', accent: '#8a58a3', light: '#9c8ae8', fog: '#0c0814', enemies: ['skeleton', 'skeleton_archer', 'ghoul', 'wraith'], props: ['coffin', 'urn', 'candles', 'bones', 'statue'], layout: 'rooms' },
  buried_colossus: { name: 'Colossus', floor: '#9c615b', wall: '#84524a', accent: '#e8c35a', light: '#f8b060', fog: '#2a1210', enemies: ['sand_wraith', 'colossus_shard', 'ash_scorpion', 'ember_cultist'], props: ['gold_pile', 'giant_bone', 'pillar', 'brazier'], layout: 'rooms' },
  glass_cavern: { name: 'Glass Caverns', floor: '#4a2a3a', wall: '#44263a', accent: '#e48fb0', light: '#f06a8a', fog: '#12060c', enemies: ['glass_beetle', 'glass_elemental', 'ash_scorpion'], props: ['glass_crystal', 'glass_crystal', 'rock'], layout: 'cave' },
  marble_vault: { name: 'Vault', floor: '#9a8c7c', wall: '#8e8078', accent: '#e8c35a', light: '#f8c878', fog: '#1a1410', enemies: ['marble_sentinel', 'gilded_revenant', 'hollow_senator', 'looter'], props: ['statue', 'pillar', 'gold_pile', 'urn', 'brazier'], layout: 'rooms' },
  sunken_temple: { name: 'Sunken Temple', floor: '#3a5a5a', wall: '#3a5458', accent: '#4a9488', light: '#7cd0d0', fog: '#061418', enemies: ['drowned_sailor', 'sea_hag', 'tidecrab', 'siren'], props: ['coral', 'pillar', 'kelp', 'statue', 'shell'], layout: 'rooms' },
  frozen_citadel: { name: 'Citadel', floor: '#6a7494', wall: '#5e6888', accent: '#a8d0ec', light: '#a8d0ec', fog: '#0e1428', enemies: ['frozen_knight', 'ice_wraith', 'frost_wolf', 'ice_golem'], props: ['ice_crystal', 'pillar', 'banner', 'statue', 'brazier'], layout: 'rooms' },
  fungal_warren: { name: 'Warren', floor: '#54405a', wall: '#4a3852', accent: '#c860f0', light: '#d8a0f0', fog: '#0a0612', enemies: ['fungal_shambler', 'spore_sprite', 'giant_spider', 'moss_troll'], props: ['mushroom', 'mushroom', 'root', 'bones'], layout: 'cave' },
  pirate_cove: { name: 'Cove', floor: '#6a5848', wall: '#54505c', accent: '#c99a3a', light: '#f8b060', fog: '#0c1014', enemies: ['corsair', 'corsair_gunner', 'drowned_sailor', 'tidecrab'], props: ['barrel', 'crate', 'gold_pile', 'anchor', 'campfire'], layout: 'cave' },
  dwarven_deephall: { name: 'Deephall', floor: '#5e5458', wall: '#544a52', accent: '#ec7a2a', light: '#f8a040', fog: '#0c0a0c', enemies: ['deep_crawler', 'stone_golem', 'frozen_knight', 'cave_troll'], props: ['pillar', 'brazier', 'anvil', 'minecart', 'statue'], layout: 'rooms' },
  void_rift: { name: 'Rift', floor: '#342a4a', wall: '#30264a', accent: '#a026ef', light: '#c068f0', fog: '#0a0414', enemies: ['void_wretch', 'shadow_stalker', 'void_eye'], props: ['void_crystal', 'void_crystal', 'rock', 'bones'], layout: 'cave' },
  dragon_lair: { name: 'Lair', floor: '#5a3430', wall: '#522c2a', accent: '#ec7a2a', light: '#f87a30', fog: '#160606', enemies: ['ember_cultist', 'drakeling', 'magma_golem'], props: ['gold_pile', 'giant_bone', 'brazier', 'rock'], layout: 'cave' },
  beast_den: { name: 'Den', floor: '#5e5040', wall: '#52443e', accent: '#a8805a', light: '#f8b878', fog: '#0c0a08', enemies: [], props: ['bones', 'rock', 'root', 'nest'], layout: 'cave' },
  living_labyrinth: { name: 'Living Labyrinth', floor: '#3c4e47', wall: '#3d553d', accent: '#f4bccf', light: '#c8e890', fog: '#060a08', enemies: ['thornwolf', 'briar_witch', 'treant', 'maze_warden'], props: ['root', 'statue', 'mushroom'], layout: 'maze' },
};

// 54 dungeons. `shard` marks the six Crown Shard dungeons of the main story.
export const DUNGEONS = [
  // Crimson Wastes
  { id: 'd_cistern', name: 'Emberwell Cistern', theme: 'bandit_hideout', biome: 'wastes', x: 250, z: 590, level: 3, size: 'small', boss: 'bandit_chief' },
  { id: 'd_scorpionhollow', name: 'Scorpion Hollow', theme: 'beast_den', biome: 'wastes', x: 110, z: 650, level: 6, size: 'small', boss: 'scorpion_queen', denOf: ['ash_scorpion', 'dune_hound'] },
  { id: 'd_colossus', name: 'Heart of the Colossus', theme: 'buried_colossus', biome: 'wastes', x: 520, z: 360, level: 25, size: 'large', boss: 'colossus_heart', shard: 'wastes' },
  { id: 'd_glasswind', name: 'Glasswind Caverns', theme: 'glass_cavern', biome: 'wastes', x: 380, z: 690, level: 18, size: 'medium', boss: 'glass_matriarch' },
  { id: 'd_cinderdepths', name: 'Cinder Spire Depths', theme: 'dragon_lair', biome: 'wastes', x: -270, z: 930, level: 5, size: 'small', boss: 'ember_drakeling_alpha' },
  { id: 'd_dunerunner', name: 'Dunerunner Den', theme: 'bandit_hideout', biome: 'wastes', x: -80, z: 540, level: 10, size: 'medium', boss: 'bandit_chief' },
  { id: 'd_sandkings', name: 'Tomb of the Sand-Kings', theme: 'cursed_crypt', biome: 'wastes', x: -110, z: 760, level: 20, size: 'medium', boss: 'sand_king' },
  { id: 'd_mirage', name: 'The Mirage Labyrinth', theme: 'living_labyrinth', biome: 'wastes', x: 240, z: 980, level: 30, size: 'large', boss: 'maze_warden_elder' },
  { id: 'd_catacombs', name: 'Ashen Court Catacombs', theme: 'cursed_crypt', biome: 'wastes', x: 680, z: 900, level: 28, size: 'medium', boss: 'ash_lich' },
  { id: 'd_obelisk', name: 'The Hollowed Obelisk', theme: 'marble_vault', biome: 'wastes', x: -360, z: 620, level: 22, size: 'medium', boss: 'obelisk_keeper' },
  { id: 'd_edgerift', name: 'Burning Edge Rift', theme: 'void_rift', biome: 'wastes', x: 200, z: 1120, level: 45, size: 'medium', boss: 'void_herald' },
  { id: 'd_wyrmscar', name: 'Wyrmscar Burrow', theme: 'beast_den', biome: 'wastes', x: 720, z: 540, level: 32, size: 'medium', boss: 'sandworm_elder', denOf: ['sandworm', 'ash_scorpion'] },
  // Gilded Ruins
  { id: 'd_aurelion', name: 'Vaults of Aurelion', theme: 'marble_vault', biome: 'gilded', x: 90, z: -330, level: 35, size: 'large', boss: 'emperor_echo', shard: 'gilded' },
  { id: 'd_effigyworks', name: 'Effigy Workshops', theme: 'marble_vault', biome: 'gilded', x: 380, z: -450, level: 4, size: 'small', boss: 'rogue_effigy' },
  { id: 'd_undercroft', name: 'Ossuary Undercroft', theme: 'cursed_crypt', biome: 'gilded', x: -330, z: 30, level: 3, size: 'small', boss: 'bone_warden' },
  { id: 'd_looterswarren', name: "Looter's Warren", theme: 'bandit_hideout', biome: 'gilded', x: -230, z: -280, level: 4, size: 'small', boss: 'looter_king' },
  { id: 'd_aqueduct', name: 'Aqueduct Tunnels', theme: 'sunken_temple', biome: 'gilded', x: -60, z: -500, level: 18, size: 'medium', boss: 'sewer_hag' },
  { id: 'd_senate', name: 'Senate of Shades', theme: 'cursed_crypt', biome: 'gilded', x: 250, z: -240, level: 30, size: 'medium', boss: 'shade_consul' },
  { id: 'd_triumph', name: 'The Triumph Labyrinth', theme: 'living_labyrinth', biome: 'gilded', x: -320, z: -420, level: 26, size: 'large', boss: 'maze_warden_elder' },
  { id: 'd_liongate', name: 'Lion Gate Barracks', theme: 'bandit_hideout', biome: 'gilded', x: 400, z: -130, level: 15, size: 'medium', boss: 'deserter_captain' },
  { id: 'd_mausoleum', name: 'The Gilded Mausoleum', theme: 'cursed_crypt', biome: 'gilded', x: -40, z: -60, level: 22, size: 'medium', boss: 'gilded_lich' },
  // Verdant Reach
  { id: 'd_rootbound', name: 'Rootbound Hollow', theme: 'fungal_warren', biome: 'verdant', x: -880, z: -170, level: 3, size: 'small', boss: 'rot_heart' },
  { id: 'd_sporecaves', name: 'Mirewisp Sporecaves', theme: 'fungal_warren', biome: 'verdant', x: -760, z: 450, level: 4, size: 'small', boss: 'spore_queen' },
  { id: 'd_elderyew', name: "The Elder Yew's Roots", theme: 'fungal_warren', biome: 'verdant', x: -900, z: 120, level: 22, size: 'large', boss: 'yew_blight', shard: 'verdant' },
  { id: 'd_broodnest', name: "Broodmother's Nest", theme: 'beast_den', biome: 'verdant', x: -560, z: -120, level: 14, size: 'medium', boss: 'broodmother', denOf: ['giant_spider'] },
  { id: 'd_witchbriar', name: 'Witchbriar Coven', theme: 'cursed_crypt', biome: 'verdant', x: -1000, z: -500, level: 18, size: 'medium', boss: 'briar_matron' },
  { id: 'd_thornmaze', name: 'The Thornmaze', theme: 'living_labyrinth', biome: 'verdant', x: -620, z: 650, level: 20, size: 'large', boss: 'maze_warden_elder' },
  { id: 'd_mossgrave', name: 'Mossgrave Barrow', theme: 'cursed_crypt', biome: 'verdant', x: -500, z: 260, level: 12, size: 'medium', boss: 'barrow_king' },
  { id: 'd_poachers', name: "Poacher's Camp", theme: 'bandit_hideout', biome: 'verdant', x: -680, z: -460, level: 9, size: 'small', boss: 'bandit_chief' },
  { id: 'd_faecourt', name: 'Fae Court Ruins', theme: 'marble_vault', biome: 'verdant', x: -1020, z: 300, level: 26, size: 'medium', boss: 'thorn_queen' },
  // Frostbite Spine
  { id: 'd_kharakmines', name: 'Kharak Dun Mines', theme: 'dwarven_deephall', biome: 'frost', x: -470, z: -900, level: 4, size: 'small', boss: 'mine_horror' },
  { id: 'd_skarrowcaves', name: 'Skarrow Trial Caves', theme: 'beast_den', biome: 'frost', x: 430, z: -780, level: 4, size: 'small', boss: 'frost_bear_alpha', denOf: ['frost_wolf'] },
  { id: 'd_vael', name: 'Frozen Citadel of Vael', theme: 'frozen_citadel', biome: 'frost', x: -150, z: -1060, level: 50, size: 'large', boss: 'king_vael', shard: 'frost' },
  { id: 'd_rimefang', name: 'Rimefang Lair', theme: 'beast_den', biome: 'frost', x: -720, z: -920, level: 35, size: 'medium', boss: 'rimefang', denOf: ['frost_wolf', 'frost_troll'] },
  { id: 'd_stormcrown', name: 'Stormcrown Peak Shrine', theme: 'frozen_citadel', biome: 'frost', x: 260, z: -1020, level: 45, size: 'medium', boss: 'storm_herald' },
  { id: 'd_lastking', name: 'Halls of the Last King', theme: 'dwarven_deephall', biome: 'frost', x: -860, z: -1000, level: 55, size: 'large', boss: 'last_king' },
  { id: 'd_glacier', name: 'The Glacier Labyrinth', theme: 'living_labyrinth', biome: 'frost', x: 600, z: -980, level: 48, size: 'large', boss: 'maze_warden_elder' },
  { id: 'd_frostbitten', name: 'Frostbitten Hold', theme: 'bandit_hideout', biome: 'frost', x: 100, z: -800, level: 30, size: 'medium', boss: 'raider_jarl' },
  // Drowned Coast
  { id: 'd_smugglers', name: "Smugglers' Cave", theme: 'pirate_cove', biome: 'coast', x: 950, z: -60, level: 3, size: 'small', boss: 'smuggler_boss' },
  { id: 'd_tidepools', name: 'Saltfang Tidepools', theme: 'beast_den', biome: 'coast', x: 980, z: 780, level: 4, size: 'small', boss: 'king_crab', denOf: ['tidecrab'] },
  { id: 'd_cathedral', name: 'The Drowned Cathedral', theme: 'sunken_temple', biome: 'coast', x: 1010, z: 300, level: 32, size: 'large', boss: 'drowned_bishop', shard: 'coast' },
  { id: 'd_corsairgrave', name: "Corsair's Grave", theme: 'pirate_cove', biome: 'coast', x: 860, z: 460, level: 18, size: 'medium', boss: 'ghost_captain' },
  { id: 'd_sirengrotto', name: "Siren's Grotto", theme: 'sunken_temple', biome: 'coast', x: 990, z: -420, level: 24, size: 'medium', boss: 'siren_queen' },
  { id: 'd_wreckers', name: "Wreckers' Hideout", theme: 'pirate_cove', biome: 'coast', x: 820, z: -780, level: 26, size: 'medium', boss: 'wrecker_lord' },
  { id: 'd_trench', name: 'The Abyssal Trench', theme: 'void_rift', biome: 'coast', x: 1040, z: 960, level: 40, size: 'medium', boss: 'trench_horror' },
  { id: 'd_lighthouse', name: 'Lighthouse Vault', theme: 'marble_vault', biome: 'coast', x: 900, z: 110, level: 15, size: 'medium', boss: 'keeper_of_light' },
  // The Maw rim
  { id: 'd_rimcaverns', name: 'Rim Caverns', theme: 'void_rift', biome: 'maw', x: 130, z: 120, level: 5, size: 'small', boss: 'rift_spawn' },
  // Hollow Deep (deep realm coordinates)
  { id: 'd_lanternmines', name: 'The Lantern Mines', theme: 'dwarven_deephall', biome: 'deep', realm: 'deep', x: -120, z: -260, level: 55, size: 'medium', boss: 'lantern_lurker_king' },
  { id: 'd_mycelial', name: 'Mycelial Cathedral', theme: 'fungal_warren', biome: 'deep', realm: 'deep', x: -380, z: 260, level: 65, size: 'large', boss: 'gorm' },
  { id: 'd_magmaforge', name: 'The Magma Forge', theme: 'dragon_lair', biome: 'deep', realm: 'deep', x: 360, z: -200, level: 75, size: 'large', boss: 'forge_wyrm' },
  { id: 'd_hollowlab', name: "The Hollow King's Labyrinth", theme: 'living_labyrinth', biome: 'deep', realm: 'deep', x: 220, z: 380, level: 85, size: 'large', boss: 'hollow_king', shard: 'deep' },
  { id: 'd_voidheart', name: 'The Void Heart', theme: 'void_rift', biome: 'deep', realm: 'deep', x: -200, z: 420, level: 92, size: 'large', boss: 'void_heart' },
  { id: 'd_throne', name: 'The Crownless Throne', theme: 'marble_vault', biome: 'deep', realm: 'deep', x: 0, z: 440, level: 98, size: 'large', boss: 'ashen_king', final: true },
];

// Fast travel stones. Every town has one; landmarks add more.
export const WAYSTONES = [
  ...TOWNS.map((t) => ({ id: 'w_' + t.id, name: t.name, x: t.x + t.r * 0.6, z: t.z + t.r * 0.55, realm: 'surface' })),
  { id: 'w_glasssea', name: 'Edge of the Glass Sea', x: 440, z: 600, realm: 'surface' },
  { id: 'w_colossus', name: "Colossus' Shadow", x: 470, z: 300, realm: 'surface' },
  { id: 'w_deadcap', name: 'Aurelion Gate', x: 30, z: -250, realm: 'surface' },
  { id: 'w_elderyew', name: 'Elder Yew', x: -850, z: 60, realm: 'surface' },
  { id: 'w_vaelroad', name: "Vael's Road", x: -160, z: -940, realm: 'surface' },
  { id: 'w_drownedbay', name: 'Drowned Bay', x: 940, z: 330, realm: 'surface' },
  { id: 'w_mawrim', name: 'Rim of the Maw', x: 140, z: 260, realm: 'surface' },
  { id: 'w_southdunes', name: 'Southern Dunes', x: -60, z: 1000, realm: 'surface' },
  ...DEEP_TOWNS.map((t) => ({ id: 'w_' + t.id, name: t.name, x: t.x + t.r * 0.6, z: t.z + t.r * 0.55, realm: 'deep' })),
];

// Hidden shrines grant permanent boons. Some only manifest at night or in certain weather.
export const SHRINES = [
  { id: 's_sun1', name: 'Shrine of the Setting Sun', x: -20, z: -380, boon: { str: 2 }, cond: null, realm: 'surface' },
  { id: 's_sun2', name: 'Shrine of the Golden Hour', x: 470, z: -560, boon: { str: 2, wil: 1 }, cond: 'dusk', realm: 'surface' },
  { id: 's_ember1', name: 'Shrine of the Ember Saint', x: 330, z: 540, boon: { fireRes: 10, int: 1 }, cond: null, realm: 'surface' },
  { id: 's_glass', name: 'Shrine of the Singing Glass', x: 520, z: 680, boon: { dex: 3 }, cond: 'glassstorm', realm: 'surface' },
  { id: 's_dune', name: 'Shrine of the Buried Choir', x: -420, z: 1040, boon: { vit: 3 }, cond: null, realm: 'surface' },
  { id: 's_ozy', name: "Ozymar's Tear", x: 760, z: 380, boon: { maxHpPct: 5 }, cond: 'night', realm: 'surface' },
  { id: 's_moon1', name: 'Shrine of the Pale Moon', x: -380, z: -300, boon: { int: 2 }, cond: 'night', realm: 'surface' },
  { id: 's_lion', name: 'Shrine of the Stone Lion', x: 480, z: -320, boon: { vit: 2, str: 1 }, cond: null, realm: 'surface' },
  { id: 's_root1', name: 'Shrine of the First Root', x: -1080, z: 120, boon: { vit: 2, wil: 1 }, cond: null, realm: 'surface' },
  { id: 's_spore', name: 'Shrine of the Glowing Bloom', x: -620, z: 300, boon: { wil: 3 }, cond: 'sporebloom', realm: 'surface' },
  { id: 's_hunt', name: 'Shrine of the Hunt', x: -920, z: -640, boon: { dex: 2 }, cond: null, realm: 'surface' },
  { id: 's_rain', name: 'Shrine of Falling Rain', x: -440, z: 560, boon: { manaRegen: 1 }, cond: 'rain', realm: 'surface' },
  { id: 's_aurora', name: 'Shrine of the Aurora', x: -300, z: -1100, boon: { int: 3, wil: 1 }, cond: 'aurora', realm: 'surface' },
  { id: 's_storm', name: 'Shrine of the Storm-Lit Peak', x: 560, z: -860, boon: { lightningRes: 10, dex: 1 }, cond: 'thunderstorm', realm: 'surface' },
  { id: 's_frost1', name: 'Shrine of the Frozen Oath', x: -1000, z: -820, boon: { frostRes: 10, vit: 1 }, cond: null, realm: 'surface' },
  { id: 's_titan', name: "Shrine of the Titan's Rest", x: 180, z: -1120, boon: { str: 3 }, cond: null, realm: 'surface' },
  { id: 's_tide1', name: 'Shrine of the Low Tide', x: 1060, z: -280, boon: { dex: 1, vit: 1 }, cond: null, realm: 'surface' },
  { id: 's_bell', name: 'Shrine of the Drowned Bell', x: 1080, z: 520, boon: { wil: 2 }, cond: 'fog', realm: 'surface' },
  { id: 's_lighthouse', name: 'Shrine of the Last Lamp', x: 820, z: 180, boon: { int: 1, wil: 1 }, cond: 'night', realm: 'surface' },
  { id: 's_void1', name: 'Shrine of the Unspoken', x: -30, z: 280, boon: { voidRes: 10, int: 1 }, cond: 'voidstorm', realm: 'surface' },
  { id: 's_maw', name: 'Shrine of the Rim', x: 180, z: 180, boon: { maxManaPct: 5 }, cond: null, realm: 'surface' },
  { id: 's_deep1', name: 'Shrine of the Lantern', x: 140, z: -300, boon: { int: 2, wil: 2 }, cond: null, realm: 'deep' },
  { id: 's_deep2', name: 'Shrine of the Mycelium', x: -420, z: 120, boon: { vit: 3, wil: 1 }, cond: null, realm: 'deep' },
  { id: 's_deep3', name: 'Shrine of the Deep Crown', x: 420, z: 300, boon: { str: 2, dex: 2, int: 2 }, cond: null, realm: 'deep' },
];

// Landmarks: set-pieces built by structures.js
export const LANDMARKS = [
  { id: 'colossus_head', type: 'colossus_head', x: 470, z: 330, rot: 0.6, scale: 1.0 },
  { id: 'colossus_hand', type: 'colossus_hand', x: 360, z: 620, rot: -0.3, scale: 1.0 },
  { id: 'colossus_torso', type: 'colossus_torso', x: -130, z: 900, rot: 1.2, scale: 1.0 },
  { id: 'colossus_head2', type: 'colossus_head', x: 720, z: 1000, rot: 2.4, scale: 0.8 },
  { id: 'glass_sea', type: 'glass_field', x: 480, z: 640, r: 70 },
  { id: 'cinder_spire', type: 'spire', x: -250, z: 905, scale: 1.0 },
  { id: 'dead_capital', type: 'dead_capital', x: 80, z: -300, r: 110 },
  { id: 'sunking_statue', type: 'fallen_statue', x: 170, z: -380, rot: 0.9, scale: 1 },
  { id: 'triumph_arch', type: 'arch', x: -60, z: -230, rot: 0.2, scale: 1.4 },
  { id: 'aqueduct', type: 'aqueduct', x: -120, z: -470, rot: 0.4, len: 220 },
  { id: 'elder_yew', type: 'elder_yew', x: -880, z: 80, scale: 1 },
  { id: 'standing_stones', type: 'stone_circle', x: -760, z: -40, r: 14 },
  { id: 'frozen_titan', type: 'frozen_titan', x: 160, z: -1090, rot: -0.4, scale: 1 },
  { id: 'kharak_gate', type: 'dwarf_gate', x: -420, z: -905, rot: 0, scale: 1 },
  { id: 'shipwrecks', type: 'shipwrecks', x: 1000, z: 560, r: 60 },
  { id: 'sunken_temple', type: 'sunken_temple', x: 1050, z: 300, scale: 1 },
  { id: 'lighthouse', type: 'lighthouse', x: 905, z: 100, scale: 1 },
  { id: 'maw_pit', type: 'maw', x: MAW.x, z: MAW.z },
  { id: 'battlefield1', type: 'battlefield', x: -440, z: -650, r: 50 },
  { id: 'battlefield2', type: 'battlefield', x: 250, z: 150, r: 45 },
];

// Ancient battlefield relics teach martial skills when touched.
export const RELICS = [
  { id: 'r_whirl', x: -430, z: -640, skill: 'whirlwind', name: 'Shattered Warlord Blade' },
  { id: 'r_slam', x: 260, z: 160, skill: 'groundslam', name: 'Colossus-Breaker Maul' },
  { id: 'r_lunge', x: -470, z: -670, skill: 'lunge', name: "Spear of the First Legion" },
  { id: 'r_parry', x: 230, z: 130, skill: 'parry', name: "Duelist's Notched Guard" },
  { id: 'r_volley', x: -790, z: 760, skill: 'volley', name: 'Quiver of the Wild Hunt' },
  { id: 'r_pounce', x: 640, z: 260, skill: 'pounce', name: 'Sand-Lion Totem' },
];

// Roaming world bosses and what makes them appear.
export const WORLD_BOSSES = [
  { id: 'wb_glasswyrm', enemy: 'glass_wyrm', biome: 'wastes', cond: 'glassstorm', x: 480, z: 640, roam: 160, level: 35 },
  { id: 'wb_ozymar', enemy: 'ozymar', biome: 'wastes', cond: 'night', x: 460, z: 390, roam: 120, level: 30 },
  { id: 'wb_emperor', enemy: 'emperor_shade', biome: 'gilded', cond: 'night', x: 80, z: -300, roam: 90, level: 40 },
  { id: 'wb_rotmother', enemy: 'rot_mother', biome: 'verdant', cond: 'sporebloom', x: -720, z: 200, roam: 180, level: 30 },
  { id: 'wb_ymrath', enemy: 'ymrath', biome: 'frost', cond: 'blizzard', x: 160, z: -1000, roam: 200, level: 60 },
  { id: 'wb_leviathan', enemy: 'leviathan', biome: 'coast', cond: 'thunderstorm', x: 1000, z: 200, roam: 220, level: 45 },
  { id: 'wb_herald', enemy: 'crown_herald', biome: 'maw', cond: 'voidstorm', x: 60, z: 210, roam: 90, level: 50 },
  { id: 'wb_gorm', enemy: 'gorm_avatar', biome: 'deep', cond: null, x: -300, z: 200, roam: 140, level: 80, realm: 'deep' },
];

// Danger: starter pockets keep each race's home gentle; the frontier and deep places bite.
export const DANGER_PEAKS = [
  { x: 80, z: -300, r: 160, level: 38 },     // Dead Capital
  { x: -150, z: -1060, r: 200, level: 58 },  // Vael
  { x: -860, z: -1000, r: 200, level: 60 },
  { x: 600, z: -980, r: 200, level: 52 },
  { x: 200, z: 1100, r: 220, level: 46 },    // Burning Edge
  { x: 1040, z: 960, r: 160, level: 42 },    // Abyssal trench
  { x: 520, z: 360, r: 120, level: 28 },     // Colossus
  { x: 480, z: 640, r: 120, level: 26 },     // Glass Sea
  { x: 1010, z: 300, r: 140, level: 34 },    // Drowned cathedral
  { x: -900, z: 120, r: 150, level: 24 },    // Elder Yew
];

export const FATE_TABLE_LOCATION = { x: 0, z: 0 };
