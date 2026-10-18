// Twelve races, rolled on a d12 at the Fate Table. Each has a home, passives, a look and a prologue.

export const RACES = [
  {
    id: 'human', name: 'Human', die: 1, home: 'aurelionsrest',
    tagline: 'Heirs of the empire that fell.',
    desc: 'Descendants of Aurelion\'s citizens, still living in the shadow of its ruins. Adaptable and stubborn, and convinced the golden age can be rebuilt.',
    stats: { str: 1, dex: 1, int: 1, vit: 1, wil: 1 },
    traits: [
      { id: 'adaptable', name: 'Adaptable', desc: '+10% experience from all sources.' },
      { id: 'silver_tongue', name: 'Silver Tongue', desc: 'Merchants give 10% better prices.' },
    ],
    look: { skin: ['#f0bea0', '#d9967e', '#8a5048'], hair: ['#3f2622', '#94603c', '#e2c494', '#2a1a1c'], scale: 1.0, build: 1.0 },
    prologue: [
      'The bells of Aurelion\'s Rest ring once at dawn, as they have every dawn since the empire died.',
      'You were born in a house built from a fallen temple\'s stones. Gilded letters on the lintel still praise a god nobody remembers.',
      'Last night someone broke into the ossuaries beneath the town and stole the bones of a Sun-King. The elders say the dead do not rest without their crowns.',
      'The dice have chosen you to go and find out why.',
    ],
    openingQuest: 'q_human_open',
  },
  {
    id: 'ashborn', name: 'Ashborn', die: 2, home: 'emberwell',
    tagline: 'Ember-skinned children of the burning waste.',
    desc: 'Desert folk whose skin cracks with living coals. Their elders claim they were born from the pyre the old empire lit to burn its enemies.',
    stats: { str: 1, int: 2, vit: 1 },
    traits: [
      { id: 'ember_blood', name: 'Ember Blood', desc: '+25% fire resistance. Fire spells cost 10% less mana.' },
      { id: 'heat_walker', name: 'Heat Walker', desc: 'Immune to sandstorm slow. Desert heat never tires you.' },
    ],
    look: { skin: ['#60323a', '#3b1e22', '#662b2c'], hair: ['#2a0e18', '#ec7a2a'], glowSkin: '#ec7a2a', scale: 1.0, build: 1.0 },
    prologue: [
      'The well at Emberwell has never run with water. It runs with a slow, golden flame that the Ashborn drink to keep their embers lit.',
      'This morning the flame guttered. Elder Sarqa says something below the cistern is drinking it first.',
      'Your skin hasn\'t burned this dim since you were a child. If the well dies, the Ashborn go cold with it.',
    ],
    openingQuest: 'q_ashborn_open',
  },
  {
    id: 'elf', name: 'Elf', die: 3, home: 'sylvanhold',
    tagline: 'Long-lived wardens of the Verdant Reach.',
    desc: 'They remember Aurelion\'s founding and do not speak of its fall. They live in the canopy cities of the Reach, slow to trust and slower to forget.',
    stats: { dex: 2, int: 1, wil: 1 },
    traits: [
      { id: 'keen_sight', name: 'Keen Sight', desc: '+8% critical chance with bows and crossbows.' },
      { id: 'old_blood', name: 'Old Blood', desc: '+15% nature resistance. Night does not dim your vision.' },
    ],
    look: { skin: ['#ecc6a8', '#f0bea0', '#d9a08a'], hair: ['#efdab4', '#22341f', '#8a4238', '#c4bdb6'], ears: 'long', scale: 1.04, build: 0.88 },
    prologue: [
      'Sylvanhold hangs between the boughs of trees that were saplings when the first emperor was crowned.',
      'The roots under the city have begun to rot. The Wardens blame a blight. The old songs blame something that woke when the crown broke.',
      'You are young for an elf, only a century old. That is why they are sending you: the young don\'t yet know what to fear.',
    ],
    openingQuest: 'q_elf_open',
  },
  {
    id: 'dwarf', name: 'Dwarf', die: 4, home: 'kharakdun',
    tagline: 'Forge-folk of the Frostbite Spine.',
    desc: 'Stout miners and smiths who sealed their halls when the empire fell, and are only now opening them again.',
    stats: { str: 2, vit: 2 },
    traits: [
      { id: 'stoneblood', name: 'Stoneblood', desc: '+10% armor. +20% frost resistance.' },
      { id: 'master_smith', name: 'Master Smith', desc: 'Blacksmith upgrades cost 25% less.' },
    ],
    look: { skin: ['#d9967e', '#b07062', '#9c615b'], hair: ['#8a4238', '#2a1a1c', '#c4bdb6', '#c99a3a'], beard: true, scale: 0.78, build: 1.35 },
    prologue: [
      'The great gate of Kharak Dun opened for the first time in three hundred years, and the cold rushed in like a creditor.',
      'Something is moving in the old mines below the forge, and it has been eating the lanterns.',
      'Your clan never forgot the debt it owes the surface. The King Under Snow sends you to start paying it.',
    ],
    openingQuest: 'q_dwarf_open',
  },
  {
    id: 'orc', name: 'Orc', die: 5, home: 'skarrow',
    tagline: 'Storm-riders of the highland steppe.',
    desc: 'Proud warbands who ride lightning-lit plains beneath the Spine. Empires come and go; the clans keep their storms.',
    stats: { str: 3, vit: 1 },
    traits: [
      { id: 'bloodrush', name: 'Bloodrush', desc: 'Below 35% health, deal 20% more damage.' },
      { id: 'thick_hide', name: 'Thick Hide', desc: '+15% max health. +10% lightning resistance.' },
    ],
    look: { skin: ['#557048', '#4a6e36', '#6f8a52', '#7b576f'], hair: ['#152018', '#2a1a1c'], tusks: true, scale: 1.1, build: 1.3 },
    prologue: [
      'In the clans, the young earn their names in the Trial Caves beneath Skarrow, where the frost bears sleep.',
      'This year the bears do not sleep. They come down from the caves maddened, with frost in their eyes and the smell of the Deep on their breath.',
      'You have no name yet. The storm is gathering, and the shaman says it will give you one.',
    ],
    openingQuest: 'q_orc_open',
  },
  {
    id: 'tidekin', name: 'Tidekin', die: 6, home: 'brinehollow',
    tagline: 'Sea-born, salt-blooded, never quite dry.',
    desc: 'Gill-necked folk of the Drowned Coast who dive the sunken temples for salvage. They say the sea is only borrowing them.',
    stats: { dex: 1, wil: 2, vit: 1 },
    traits: [
      { id: 'gills', name: 'Gills', desc: 'Move freely through deep water. +15% water and frost resistance.' },
      { id: 'tidecaller', name: 'Tidecaller', desc: 'In rain or fog, regenerate 2% health per second out of combat.' },
    ],
    look: { skin: ['#4a9488', '#2f7070', '#7cbca8', '#396586'], hair: ['#172d50', '#c4bdb6', '#245458'], fins: true, scale: 1.0, build: 0.95 },
    prologue: [
      'Under the Drowned Coast the old temples still ring their bells. Only the Tidekin can hear them.',
      'Last night the bells stopped. Then the smugglers of Brinehollow\'s caves started pulling sealed reliquaries out of the deep.',
      'The Tidebound Guild pays well for salvage. The bells, you suspect, are asking for something else.',
    ],
    openingQuest: 'q_tidekin_open',
  },
  {
    id: 'stoneborn', name: 'Stoneborn', die: 7, home: 'effigies',
    tagline: 'Statues of the empire, woken to life.',
    desc: 'The Sculpted Ones: marble effigies carved to guard Aurelion, who woke the night the crown shattered. They remember orders but not who gave them.',
    stats: { str: 1, vit: 3 },
    traits: [
      { id: 'marble_skin', name: 'Marble Skin', desc: '+15% armor. Immune to bleed.' },
      { id: 'unmoving', name: 'Unmoving', desc: 'Cannot be knocked back. Blocking costs 25% less stamina.' },
    ],
    look: { skin: ['#c4bdb6', '#a29c9c', '#b6bdbd', '#827d82'], hair: ['#c4bdb6', '#a29c9c'], stone: true, scale: 1.08, build: 1.2 },
    prologue: [
      'You remember one order, carved behind your eyes: GUARD THE HEIR.',
      'You woke in the Hall of Effigies with a crack running down your chest and dust in your joints. A thousand other statues stood around you, and none of them were breathing.',
      'The workshop below the Hall is grinding again. Someone is carving new effigies, and they are not carving them to guard anyone.',
    ],
    openingQuest: 'q_stoneborn_open',
  },
  {
    id: 'fae', name: 'Fae-touched', die: 8, home: 'mirewisp',
    tagline: 'Mortals who wandered too long in the fungal groves.',
    desc: 'Changed by the old fae courts of the Reach. Glimmering, unpredictable, and owed favours by things that should not exist.',
    stats: { int: 2, dex: 1, wil: 1 },
    traits: [
      { id: 'glamour', name: 'Glamour', desc: '15% chance for enemies to lose track of you after a dodge.' },
      { id: 'fae_luck', name: 'Fae Luck', desc: '+15% chance to find higher-rarity loot.' },
    ],
    look: { skin: ['#c8a4dc', '#7cbca8', '#f4bccf'], hair: ['#a87cc0', '#4a9488', '#e48fb0', '#f3e1b5'], wings: true, glowSkin: '#c860f0', scale: 0.95, build: 0.85 },
    prologue: [
      'You don\'t remember being born. You remember a ring of mushrooms, a song, and waking up a hundred years later with the song still stuck in your head.',
      'The spore-caves of Mirewisp Hollow have begun to glow out of season. The fae who live there only bloom like that when a queen is dying.',
      'Something in the caves keeps calling your true name, and you would very much like it to stop.',
    ],
    openingQuest: 'q_fae_open',
  },
  {
    id: 'beastkin', name: 'Beastkin', die: 9, home: 'saltfang',
    tagline: 'Fang and fur, of the wild coasts.',
    desc: 'Cat-, wolf- and fox-blooded folk who hunt the tidepools and mangroves of the southern coast. Keen senses, short tempers.',
    stats: { dex: 2, str: 1, vit: 1 },
    traits: [
      { id: 'predator', name: 'Predator', desc: '+15% damage to enemies below 50% health.' },
      { id: 'swift', name: 'Swift', desc: '+8% movement speed. Dodge costs 15% less stamina.' },
    ],
    look: { skin: ['#b07e52', '#5e4a47', '#cfa978', '#3f2622'], hair: ['#b07e52', '#2a1a1c', '#efdab4', '#b04a3e'], beastEars: true, tail: true, scale: 1.0, build: 1.0 },
    prologue: [
      'The tide brought the dead crabs first. Then the dead gulls. Then something large enough to swallow a boat, glimpsed once beneath the Saltfang tidepools.',
      'Your pack lives by the tide. When it turns against you, someone must go into the pools and bite back.',
    ],
    openingQuest: 'q_beastkin_open',
  },
  {
    id: 'revenant', name: 'Revenant', die: 10, home: 'ossuary',
    tagline: 'The once-dead, walking again.',
    desc: 'They died, and something sent them back. The Silent Choir tends them at the Ossuary of Kings, and asks them what they saw on the other side.',
    stats: { int: 1, wil: 2, vit: 1 },
    traits: [
      { id: 'deathless', name: 'Deathless', desc: 'Once per 5 minutes, survive a killing blow with 1 health.' },
      { id: 'grave_chill', name: 'Grave Chill', desc: '+25% rot and frost resistance. Healing received is 10% weaker.' },
    ],
    look: { skin: ['#b6bdbd', '#96a2bc', '#a29c9c'], hair: ['#c4bdb6', '#2f2c38', '#4e4b53'], eyesGlow: '#8cc8ec', scale: 1.0, build: 0.9 },
    prologue: [
      'You died in the year the crown broke. You remember the cold, a voice, and a door that would not stay shut.',
      'The Choir found you clawing your way out of a burial niche in the Ossuary of Kings, three centuries late.',
      'Now the other dead in the Undercroft are stirring too, and none of them are coming back as gently as you did.',
    ],
    openingQuest: 'q_revenant_open',
  },
  {
    id: 'dragonblood', name: 'Dragonblood', die: 11, home: 'cinderspire',
    tagline: 'Scaled descendants of the last dragons.',
    desc: 'Horned, scaled, proud: the children of Aurelion\'s dragon-consorts. Their blood remembers flight; their bodies do not.',
    stats: { str: 2, int: 1, wil: 1 },
    traits: [
      { id: 'draconic_scales', name: 'Draconic Scales', desc: '+8% armor and +15% fire resistance.' },
      { id: 'ancestral_roar', name: 'Ancestral Roar', desc: 'Your first hit on each enemy deals 25% more damage.' },
    ],
    look: { skin: ['#8a3434', '#245458', '#4a3266', '#2a3240', '#9a6424'], hair: ['#1f1d26'], horns: true, scales: true, scale: 1.08, build: 1.1 },
    prologue: [
      'The Cinder Spire was the last aerie of Aurelion\'s dragons. Its stones are still warm.',
      'You were raised on stories of wings. Last night you dreamed of them, and woke with your horns smoking.',
      'Below the Spire, the old drake-eggs are hatching. Dragons should not be born into a world without a crown to bind them.',
    ],
    openingQuest: 'q_dragonblood_open',
  },
  {
    id: 'void', name: 'Void-marked', die: 12, home: 'riftwatch',
    tagline: 'Touched by the darkness beneath the world.',
    desc: 'Born near the Maw with sigils of starless night on their skin. Feared, whispered about, and always able to hear the Hollow Deep breathing.',
    stats: { int: 2, wil: 2 },
    traits: [
      { id: 'void_sight', name: 'Void Sight', desc: 'See hidden shrines and secret passages from twice as far away.' },
      { id: 'abyssal', name: 'Abyssal', desc: '+25% void resistance. Spells have a 10% chance to cost no mana.' },
    ],
    look: { skin: ['#4e4b53', '#2f2c38', '#674952'], hair: ['#1f1d26', '#c8a4dc', '#4a3266'], voidMarks: '#c860f0', eyesGlow: '#f5afd6', scale: 1.0, build: 0.95 },
    prologue: [
      'Riftwatch was built to watch the Maw. You were born in the shadow of its wall, and the marks on your skin have glowed ever since.',
      'Three nights ago the Maw exhaled. The watchmen on the rim lost their voices. Something climbed up through the Rim Caverns, and the marks on your arms have not stopped burning.',
      'The Silent Choir says that what came up is looking for you.',
    ],
    openingQuest: 'q_void_open',
  },
];

export const RACE_BY_ID = Object.fromEntries(RACES.map((r) => [r.id, r]));
