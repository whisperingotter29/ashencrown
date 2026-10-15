// Spellbooks. You cannot cast without a tome equipped. Tier (I-V) decides how many of its
// spells you can slot (tier + 1) and which ones are unlocked; tiers IV-V unlock evolved spells.

export const ELEMENTS = {
  physical: { name: 'Physical', core: '#ffffff', glow: '#d0c8c0', res: null },
  fire: { name: 'Fire', core: '#ffe0a0', glow: '#ff5a1a', res: 'fireRes', status: 'burn' },
  frost: { name: 'Frost', core: '#f0fcff', glow: '#58c0ff', res: 'frostRes', status: 'chill' },
  lightning: { name: 'Lightning', core: '#ffffff', glow: '#9ab4ff', res: 'lightningRes', status: 'shock' },
  rot: { name: 'Rot', core: '#d8ffc0', glow: '#58c038', res: 'rotRes', status: 'poison' },
  nature: { name: 'Nature', core: '#e8ffb0', glow: '#70d040', res: 'rotRes', status: 'root' },
  void: { name: 'Void', core: '#e8d0ff', glow: '#8040ff', res: 'voidRes', status: 'weaken' },
  holy: { name: 'Holy', core: '#fffff0', glow: '#ffd050', res: 'holyRes', status: 'brand' },
  water: { name: 'Water', core: '#e8ffff', glow: '#40a8e8', res: 'frostRes', status: 'soak' },
  sand: { name: 'Sand', core: '#fff0c8', glow: '#e0a850', res: null, status: 'blind' },
  blood: { name: 'Blood', core: '#ffc0c0', glow: '#d01828', res: null, status: 'bleed' },
  sound: { name: 'Sound', core: '#fff0ff', glow: '#e080f0', res: null, status: 'stagger' },
  earth: { name: 'Earth', core: '#f0e0c0', glow: '#b08048', res: null, status: 'stagger' },
};

export const TOMES = {
  embers: {
    id: 'embers', name: 'Tome of Embers', element: 'fire', color: '#d04a20',
    lore: 'Its pages are warm. The ink was rendered from the ash of a burned library.',
    spells: [
      { id: 'firebolt', name: 'Firebolt', tier: 1, type: 'projectile', cost: 9, cd: 0.45, cast: 0.18, dmg: 20, speed: 32, status: { burn: 2.5 }, desc: 'Hurl a bolt of flame that sets its target burning.' },
      { id: 'flamewave', name: 'Flame Wave', tier: 1, type: 'cone', cost: 16, cd: 4, cast: 0.3, dmg: 28, range: 7, angle: 70, status: { burn: 3 }, desc: 'A crescent of fire sweeps out before you.' },
      { id: 'fireball', name: 'Fireball', tier: 2, type: 'projectile', cost: 22, cd: 3, cast: 0.45, dmg: 42, speed: 24, explode: 4, status: { burn: 3 }, desc: 'A slow sphere of flame that bursts on impact.' },
      { id: 'immolate', name: 'Immolate', tier: 3, type: 'aura', cost: 30, cd: 12, cast: 0.3, dmg: 9, radius: 4, duration: 8, tick: 0.5, status: { burn: 1 }, desc: 'Wreathe yourself in fire, scorching anything nearby.' },
      { id: 'meteor', name: 'Meteor', tier: 4, type: 'ground', cost: 45, cd: 14, cast: 0.6, dmg: 110, radius: 6, delay: 1.1, status: { burn: 5 }, desc: 'Call a burning stone down from the sky.' },
      { id: 'cataclysm', name: 'Cataclysm', tier: 5, evolved: true, type: 'rain', cost: 70, cd: 30, cast: 0.8, dmg: 70, radius: 12, count: 9, duration: 3, desc: 'EVOLVED: meteors rain over a wide area.' },
    ],
  },
  frost: {
    id: 'frost', name: 'Frostbound Codex', element: 'frost', color: '#5aa8e0',
    lore: 'Bound in pale leather that never thaws. Frost blooms on the clasp in summer.',
    spells: [
      { id: 'iceshard', name: 'Ice Shards', tier: 1, type: 'projectile', cost: 10, cd: 0.6, cast: 0.2, dmg: 9, speed: 36, count: 3, spread: 16, status: { chill: 1 }, desc: 'Fan of three shards, each adding Chill.' },
      { id: 'frostnova', name: 'Frost Nova', tier: 1, type: 'nova', cost: 18, cd: 7, cast: 0.25, dmg: 18, radius: 6, status: { chill: 2 }, desc: 'Burst of cold around you; heavily chills.' },
      { id: 'glacialspike', name: 'Glacial Spike', tier: 2, type: 'projectile', cost: 20, cd: 2.5, cast: 0.4, dmg: 40, speed: 40, pierce: 5, status: { chill: 2 }, desc: 'A lance of ice that pierces every foe in a line.' },
      { id: 'icearmor', name: 'Ice Armor', tier: 3, type: 'buff', cost: 25, cd: 20, cast: 0.3, duration: 12, buff: { armorPct: 40, chillAttackers: 1 }, desc: 'Encase yourself in ice: +40% armor; attackers are chilled.' },
      { id: 'blizzard', name: 'Blizzard', tier: 4, type: 'zone', cost: 40, cd: 15, cast: 0.5, dmg: 14, radius: 7, duration: 6, tick: 0.5, status: { chill: 1 }, desc: 'A storm of ice at the target area.' },
      { id: 'absolutezero', name: 'Absolute Zero', tier: 5, evolved: true, type: 'nova', cost: 65, cd: 28, cast: 0.6, dmg: 90, radius: 12, status: { freeze: 3 }, desc: 'EVOLVED: instantly freeze everything nearby solid.' },
    ],
  },
  storm: {
    id: 'storm', name: "Stormcaller's Folio", element: 'lightning', color: '#7a8aff',
    lore: 'Pages crackle when turned. Orc shamans wrote it on a mountain, mid-storm.',
    spells: [
      { id: 'spark', name: 'Arc Spark', tier: 1, type: 'chain', cost: 10, cd: 0.6, cast: 0.15, dmg: 16, range: 14, chains: 3, status: { shock: 1 }, desc: 'Lightning leaps between up to 4 enemies.' },
      { id: 'lightningbolt', name: 'Lightning Strike', tier: 1, type: 'ground', cost: 18, cd: 3, cast: 0.3, dmg: 40, radius: 3, delay: 0.25, status: { shock: 2 }, desc: 'A bolt from the sky strikes the target area.' },
      { id: 'balllightning', name: 'Ball Lightning', tier: 2, type: 'projectile', cost: 24, cd: 6, cast: 0.3, dmg: 8, speed: 7, pierce: 99, radius: 4, tick: 0.25, duration: 4, status: { shock: 1 }, desc: 'A slow orb zaps everything it passes.' },
      { id: 'staticfield', name: 'Static Field', tier: 3, type: 'aura', cost: 28, cd: 14, cast: 0.2, dmg: 12, radius: 6, duration: 8, tick: 0.6, status: { shock: 1 }, desc: 'Lightning arcs from you to nearby foes.' },
      { id: 'thunderstorm', name: 'Thunderstorm', tier: 4, type: 'rain', cost: 45, cd: 16, cast: 0.5, dmg: 36, radius: 10, count: 10, duration: 4, element: 'lightning', desc: 'Lightning hammers the area again and again.' },
      { id: 'tempest', name: 'Tempest', tier: 5, evolved: true, type: 'aura', cost: 70, cd: 30, cast: 0.5, dmg: 34, radius: 10, duration: 10, tick: 0.35, status: { shock: 2 }, desc: 'EVOLVED: become the eye of a lightning storm.' },
    ],
  },
  rot: {
    id: 'rot', name: 'Grimoire of Rot', element: 'rot', color: '#58a048',
    lore: 'Smells of loam and endings. Bound with a strip of grave-shroud.',
    spells: [
      { id: 'bonespear', name: 'Bone Spear', tier: 1, type: 'projectile', cost: 11, cd: 0.7, cast: 0.25, dmg: 24, speed: 34, pierce: 2, element: 'physical', desc: 'A splinter of bone that pierces two foes.' },
      { id: 'raiseskeleton', name: 'Raise Skeleton', tier: 1, type: 'summon', cost: 26, cd: 6, cast: 0.5, summon: 'skeleton_minion', max: 3, duration: 45, desc: 'Raise a skeletal warrior to fight for you (max 3).' },
      { id: 'rotcloud', name: 'Rot Cloud', tier: 2, type: 'zone', cost: 22, cd: 8, cast: 0.35, dmg: 10, radius: 5, duration: 6, tick: 0.5, status: { poison: 2 }, desc: 'A choking cloud of decay.' },
      { id: 'lifedrain', name: 'Life Drain', tier: 3, type: 'beam', cost: 7, cd: 0.2, cast: 0.1, dmg: 20, range: 12, channel: true, lifesteal: 0.5, desc: 'Channel: drain life from a foe (cost per second).' },
      { id: 'bonearmor', name: 'Bone Armor', tier: 4, type: 'buff', cost: 30, cd: 22, cast: 0.3, duration: 15, buff: { shieldPct: 25 }, desc: 'A cage of bone absorbs damage equal to 25% of max health.' },
      { id: 'armyofdead', name: 'Army of the Dead', tier: 5, evolved: true, type: 'summon', cost: 80, cd: 45, cast: 0.8, summon: 'skeleton_minion', count: 6, max: 9, duration: 25, desc: 'EVOLVED: six skeletons claw up from the earth.' },
    ],
  },
  verdant: {
    id: 'verdant', name: 'Verdant Psalter', element: 'nature', color: '#58a838',
    lore: 'Moss grows along its spine. The Wardens copy it by hand onto living leaves.',
    spells: [
      { id: 'mend', name: 'Mend', tier: 1, type: 'heal', cost: 18, cd: 5, cast: 0.4, heal: 0.22, hot: 0.12, duration: 5, desc: 'Heal 22% of max health, plus more over 5s.' },
      { id: 'thornlash', name: 'Thorn Lash', tier: 1, type: 'cone', cost: 10, cd: 1.2, cast: 0.2, dmg: 22, range: 6, angle: 40, status: { bleed: 2 }, desc: 'A whip of thorns tears through foes ahead.' },
      { id: 'roots', name: 'Entangling Roots', tier: 2, type: 'zone', cost: 20, cd: 10, cast: 0.3, dmg: 6, radius: 5, duration: 4, tick: 0.5, status: { root: 2 }, desc: 'Roots burst from the ground, holding foes in place.' },
      { id: 'regrowth', name: 'Regrowth', tier: 3, type: 'buff', cost: 24, cd: 18, cast: 0.3, duration: 12, buff: { regenPct: 2.5 }, desc: 'Regenerate 2.5% health per second for 12s.' },
      { id: 'treant', name: 'Call the Old Ones', tier: 4, type: 'summon', cost: 45, cd: 40, cast: 0.8, summon: 'treant_minion', max: 1, duration: 40, desc: 'Summon a treant guardian.' },
      { id: 'wrathwild', name: 'Wrath of the Wild', tier: 5, evolved: true, type: 'rain', cost: 70, cd: 30, cast: 0.6, dmg: 50, radius: 10, count: 14, duration: 3, element: 'nature', status: { root: 1 }, desc: 'EVOLVED: a forest of thorns erupts across the field.' },
    ],
  },
  void: {
    id: 'void', name: 'Void Lexicon', element: 'void', color: '#7a48d0',
    lore: 'The pages are black. The words appear only when you are not looking directly at them.',
    spells: [
      { id: 'voidbolt', name: 'Void Bolt', tier: 1, type: 'projectile', cost: 11, cd: 0.6, cast: 0.2, dmg: 24, speed: 26, homing: 3, status: { weaken: 1 }, desc: 'A seeking bolt of unlight that weakens its victim.' },
      { id: 'blink', name: 'Blink', tier: 1, type: 'blink', cost: 14, cd: 4, cast: 0.05, range: 11, desc: 'Teleport to the cursor.' },
      { id: 'gravitywell', name: 'Gravity Well', tier: 2, type: 'zone', cost: 24, cd: 10, cast: 0.4, dmg: 8, radius: 7, duration: 4, tick: 0.4, pull: 9, desc: 'Drag enemies into a crushing singularity.' },
      { id: 'unmake', name: 'Unmake', tier: 3, type: 'beam', cost: 9, cd: 0.2, cast: 0.1, dmg: 34, range: 14, channel: true, desc: 'Channel a beam that erases matter.' },
      { id: 'riftgate', name: 'Rift Gate', tier: 4, type: 'ground', cost: 40, cd: 14, cast: 0.5, dmg: 85, radius: 7, delay: 1.4, pull: 6, desc: 'Tear the world open; it snaps shut with a crushing blow.' },
      { id: 'eventhorizon', name: 'Event Horizon', tier: 5, evolved: true, type: 'zone', cost: 75, cd: 32, cast: 0.6, dmg: 40, radius: 11, duration: 5, tick: 0.3, pull: 14, desc: 'EVOLVED: a black star that devours everything near it.' },
    ],
  },
  radiant: {
    id: 'radiant', name: 'Radiant Canticle', element: 'holy', color: '#e8c050',
    lore: 'Gold-leafed hymns of the Sun-Kings. It glows faintly in the presence of the dead.',
    spells: [
      { id: 'smite', name: 'Smite', tier: 1, type: 'ground', cost: 12, cd: 1.2, cast: 0.2, dmg: 28, radius: 2.5, delay: 0.1, status: { brand: 1 }, desc: 'A shaft of sunlight strikes the target. Extra damage to undead.' },
      { id: 'holylight', name: 'Holy Light', tier: 1, type: 'heal', cost: 20, cd: 6, cast: 0.45, heal: 0.3, desc: 'Heal 30% of max health.' },
      { id: 'consecrate', name: 'Consecrate', tier: 2, type: 'zone', cost: 24, cd: 10, cast: 0.3, dmg: 12, radius: 6, duration: 6, tick: 0.5, selfZone: true, healTick: 0.01, desc: 'Hallow the ground around you; foes burn and you heal.' },
      { id: 'divineshield', name: 'Divine Shield', tier: 3, type: 'buff', cost: 35, cd: 30, cast: 0.2, duration: 4, buff: { invuln: 1 }, desc: 'Become immune to damage for 4s.' },
      { id: 'sunlance', name: 'Sunlance', tier: 4, type: 'projectile', cost: 30, cd: 6, cast: 0.4, dmg: 70, speed: 60, pierce: 99, desc: 'A spear of noon-light that pierces everything.' },
      { id: 'judgement', name: 'Judgement', tier: 5, evolved: true, type: 'rain', cost: 70, cd: 30, cast: 0.6, dmg: 80, radius: 11, count: 8, duration: 2.5, element: 'holy', desc: 'EVOLVED: pillars of judgement fall upon the wicked.' },
    ],
  },
  tidal: {
    id: 'tidal', name: 'Tidal Hymnal', element: 'water', color: '#3a90c8',
    lore: 'Water-stained and salt-crusted. Sung, not read, by the Tidebound captains.',
    spells: [
      { id: 'waterlash', name: 'Water Lash', tier: 1, type: 'projectile', cost: 9, cd: 0.5, cast: 0.2, dmg: 18, speed: 34, status: { soak: 1 }, desc: 'A whip of seawater; soaked foes take extra lightning damage.' },
      { id: 'tidalwave', name: 'Tidal Wave', tier: 1, type: 'cone', cost: 18, cd: 5, cast: 0.35, dmg: 26, range: 9, angle: 80, knock: 9, status: { soak: 2 }, desc: 'A crashing wave that hurls enemies back.' },
      { id: 'whirlpool', name: 'Whirlpool', tier: 2, type: 'zone', cost: 24, cd: 10, cast: 0.4, dmg: 10, radius: 6, duration: 5, tick: 0.4, pull: 6, status: { soak: 1 }, desc: 'A swirling vortex that drags foes inward.' },
      { id: 'healingrain', name: 'Healing Rain', tier: 3, type: 'buff', cost: 28, cd: 20, cast: 0.3, duration: 10, buff: { regenPct: 2 }, desc: 'Gentle rain heals you 2% per second.' },
      { id: 'maelstrom', name: 'Maelstrom', tier: 4, type: 'aura', cost: 45, cd: 18, cast: 0.4, dmg: 22, radius: 7, duration: 6, tick: 0.4, status: { soak: 1 }, desc: 'Spinning water tears at everything around you.' },
      { id: 'leviathan', name: "Leviathan's Call", tier: 5, evolved: true, type: 'ground', cost: 75, cd: 32, cast: 0.8, dmg: 200, radius: 9, delay: 1.5, knock: 14, desc: 'EVOLVED: something vast rises from below and crashes down.' },
    ],
  },
  sand: {
    id: 'sand', name: 'Sandglass Scripture', element: 'sand', color: '#d8a050',
    lore: 'An hourglass is set into the cover. The sand inside falls upward.',
    spells: [
      { id: 'sandblast', name: 'Sand Blast', tier: 1, type: 'cone', cost: 10, cd: 1.0, cast: 0.15, dmg: 18, range: 7, angle: 55, status: { blind: 1 }, desc: 'Scouring sand blinds foes (they miss more).' },
      { id: 'haste', name: 'Haste', tier: 1, type: 'buff', cost: 18, cd: 16, cast: 0.1, duration: 8, buff: { speedPct: 30, attackSpeedPct: 20 }, desc: '+30% movement and +20% attack speed.' },
      { id: 'slowtime', name: 'Slow Time', tier: 2, type: 'zone', cost: 24, cd: 12, cast: 0.3, dmg: 0, radius: 7, duration: 5, tick: 0.5, status: { slow: 2 }, desc: 'Time crawls for enemies in the area.' },
      { id: 'mirage', name: 'Mirage', tier: 3, type: 'summon', cost: 26, cd: 18, cast: 0.2, summon: 'mirage_decoy', max: 2, duration: 8, desc: 'Leave a shimmering decoy that draws attacks.' },
      { id: 'duneburst', name: 'Dune Burst', tier: 4, type: 'ground', cost: 38, cd: 10, cast: 0.4, dmg: 75, radius: 6, delay: 0.6, knock: 6, desc: 'The ground erupts in a geyser of sand.' },
      { id: 'eternityglass', name: 'Eternity Glass', tier: 5, evolved: true, type: 'nova', cost: 70, cd: 35, cast: 0.5, dmg: 60, radius: 14, status: { stun: 3 }, desc: 'EVOLVED: stop time for everything around you.' },
    ],
  },
  blood: {
    id: 'blood', name: 'Bloodbound Ledger', element: 'blood', color: '#a01828',
    lore: 'A banker\'s ledger of debts, paid in blood. Its spells cost health, not mana.',
    spells: [
      { id: 'bloodbolt', name: 'Blood Bolt', tier: 1, type: 'projectile', cost: 0, hpCost: 0.03, cd: 0.4, cast: 0.15, dmg: 26, speed: 34, lifesteal: 0.3, desc: 'Costs 3% health; heals you for some of the damage.' },
      { id: 'hemorrhage', name: 'Hemorrhage', tier: 1, type: 'nova', cost: 0, hpCost: 0.06, cd: 6, cast: 0.25, dmg: 30, radius: 5, status: { bleed: 3 }, desc: 'Burst open the veins of nearby foes.' },
      { id: 'bloodpact', name: 'Blood Pact', tier: 2, type: 'buff', cost: 0, hpCost: 0.1, cd: 20, cast: 0.2, duration: 10, buff: { dmgPct: 35 }, desc: 'Pay 10% health for +35% damage.' },
      { id: 'sanguinenova', name: 'Sanguine Nova', tier: 3, type: 'nova', cost: 0, hpCost: 0.05, cd: 10, cast: 0.4, dmg: 40, radius: 8, lifesteal: 0.4, desc: 'A crimson ring that drains all it touches.' },
      { id: 'exsanguinate', name: 'Exsanguinate', tier: 4, type: 'beam', cost: 0, hpCost: 0.01, cd: 0.2, cast: 0.1, dmg: 40, range: 12, channel: true, lifesteal: 0.6, desc: 'Channel a river of stolen blood.' },
      { id: 'crimsontide', name: 'Crimson Tide', tier: 5, evolved: true, type: 'cone', cost: 0, hpCost: 0.15, cd: 25, cast: 0.5, dmg: 160, range: 14, angle: 100, lifesteal: 0.5, desc: 'EVOLVED: a tidal wave of blood.' },
    ],
  },
  song: {
    id: 'song', name: 'Bardic Songbook', element: 'sound', color: '#c070c0',
    lore: 'Annotated in four hands, with rude comments in the margins of the sad songs.',
    spells: [
      { id: 'valor', name: 'Song of Valor', tier: 1, type: 'buff', cost: 16, cd: 14, cast: 0.2, duration: 12, buff: { dmgPct: 20, armorPct: 15 }, desc: '+20% damage and +15% armor.' },
      { id: 'discord', name: 'Discord', tier: 1, type: 'cone', cost: 12, cd: 2, cast: 0.15, dmg: 20, range: 8, angle: 60, status: { stagger: 1 }, desc: 'A jarring chord that staggers foes.' },
      { id: 'lullaby', name: 'Lullaby', tier: 2, type: 'nova', cost: 22, cd: 14, cast: 0.4, dmg: 0, radius: 8, status: { sleep: 4 }, desc: 'Put nearby foes to sleep (they wake when hit).' },
      { id: 'ballad', name: 'Ballad of Mending', tier: 3, type: 'buff', cost: 22, cd: 16, cast: 0.3, duration: 10, buff: { regenPct: 2 }, desc: 'A gentle tune heals 2% per second.' },
      { id: 'warsong', name: 'Warsong', tier: 4, type: 'aura', cost: 35, cd: 18, cast: 0.3, dmg: 16, radius: 7, duration: 8, tick: 0.5, status: { stagger: 1 }, desc: 'Drums only you can hear batter everything around you.' },
      { id: 'finale', name: 'Grand Finale', tier: 5, evolved: true, type: 'nova', cost: 70, cd: 30, cast: 0.7, dmg: 150, radius: 13, status: { stun: 2 }, desc: 'EVOLVED: the last note of a song that ends worlds.' },
    ],
  },
  stone: {
    id: 'stone', name: 'Stoneheart Almanac', element: 'earth', color: '#a07848',
    lore: 'A slab-bound dwarven almanac, heavy enough to be a weapon itself.',
    spells: [
      { id: 'stonefist', name: 'Stone Fist', tier: 1, type: 'projectile', cost: 10, cd: 0.7, cast: 0.25, dmg: 26, speed: 28, knock: 4, desc: 'A hurled fist of rock that knocks foes back.' },
      { id: 'stoneskin', name: 'Stoneskin', tier: 1, type: 'buff', cost: 20, cd: 20, cast: 0.2, duration: 12, buff: { armorPct: 60, speedPct: -10 }, desc: '+60% armor, slightly slower.' },
      { id: 'earthspike', name: 'Earth Spikes', tier: 2, type: 'line', cost: 22, cd: 6, cast: 0.35, dmg: 38, range: 14, status: { stagger: 1 }, desc: 'A line of spikes rips up from the ground.' },
      { id: 'tremor', name: 'Tremor', tier: 3, type: 'nova', cost: 26, cd: 10, cast: 0.35, dmg: 34, radius: 7, status: { stun: 1 }, desc: 'Shake the earth, stunning foes around you.' },
      { id: 'golem', name: 'Awaken Golem', tier: 4, type: 'summon', cost: 45, cd: 40, cast: 0.8, summon: 'golem_minion', max: 1, duration: 40, desc: 'Raise a stone golem from the ground.' },
      { id: 'avalanche', name: 'Avalanche', tier: 5, evolved: true, type: 'rain', cost: 70, cd: 30, cast: 0.6, dmg: 75, radius: 11, count: 10, duration: 2.5, element: 'earth', desc: 'EVOLVED: boulders crash down across the area.' },
    ],
  },
};

export const TOME_TIERS = ['', 'I', 'II', 'III', 'IV', 'V'];
export const TOME_TIER_NAMES = ['', 'Apprentice', 'Journeyman', 'Adept', 'Master', 'Archmage'];

export const SPELLS = {};
for (const t of Object.values(TOMES)) for (const s of t.spells) { s.tome = t.id; s.element = s.element || t.element; SPELLS[s.id] = s; }

export function spellsForTome(tomeId, tier) {
  const t = TOMES[tomeId];
  if (!t) return [];
  return t.spells.filter((s) => s.tier <= tier);
}
