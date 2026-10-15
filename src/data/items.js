// Loot: bases × materials × rarity × affixes produces hundreds of distinct weapons and armour.
// Sets and legendary relics are hand-authored on top.
import { RNG } from '../core/rng.js';
import { TOMES } from './tomes.js';

export const RARITIES = [
  { id: 'common', name: 'Common', color: '#d8d0c0', mult: 1.0, affixes: [0, 0], weight: 60 },
  { id: 'uncommon', name: 'Uncommon', color: '#6ad060', mult: 1.1, affixes: [1, 1], weight: 26 },
  { id: 'rare', name: 'Rare', color: '#5aa0ff', mult: 1.2, affixes: [2, 3], weight: 10 },
  { id: 'epic', name: 'Epic', color: '#b070ff', mult: 1.32, affixes: [3, 4], weight: 3.2 },
  { id: 'legendary', name: 'Legendary', color: '#ff9a30', mult: 1.46, affixes: [4, 4], weight: 0.7 },
  { id: 'mythic', name: 'Mythic', color: '#ff3a4a', mult: 1.62, affixes: [5, 5], weight: 0.08 },
];
export const RARITY = Object.fromEntries(RARITIES.map((r, i) => [r.id, { ...r, index: i }]));

// Level-scaling curve shared with enemies so gear keeps pace with the world.
export function S(level) { const l = Math.max(0, level - 1); return 1 + l * 0.18 + l * l * 0.004; }

export const MATERIALS = [
  { id: 'rusted', min: 1, metal: 'Rusted', cloth: 'Linen', leather: 'Rawhide', color: '#8a6450', trim: '#6a4a38' },
  { id: 'iron', min: 6, metal: 'Iron', cloth: 'Wool', leather: 'Leather', color: '#7c8088', trim: '#5a4a3a' },
  { id: 'steel', min: 13, metal: 'Steel', cloth: 'Silk', leather: 'Hardened', color: '#aab4be', trim: '#7a5a3a' },
  { id: 'ashsteel', min: 21, metal: 'Ashsteel', cloth: 'Ashsilk', leather: 'Drakehide', color: '#4c4650', trim: '#c84a28' },
  { id: 'gilded', min: 31, metal: 'Gilded', cloth: 'Gilded Silk', leather: 'Gilded', color: '#d8b050', trim: '#f0e0a0' },
  { id: 'mithral', min: 43, metal: 'Mithral', cloth: 'Moonweave', leather: 'Shadowhide', color: '#c8dcec', trim: '#6aa0d0' },
  { id: 'dragonbone', min: 56, metal: 'Dragonbone', cloth: 'Dragonsilk', leather: 'Dragonhide', color: '#e6d8bc', trim: '#a03020' },
  { id: 'starforged', min: 71, metal: 'Starforged', cloth: 'Starweave', leather: 'Starhide', color: '#a8bcff', trim: '#f0f0ff' },
  { id: 'voidglass', min: 86, metal: 'Voidglass', cloth: 'Voidweave', leather: 'Voidhide', color: '#3c2c5c', trim: '#b080ff' },
];
export function materialFor(ilvl) {
  let m = MATERIALS[0];
  for (const x of MATERIALS) if (ilvl >= x.min) m = x;
  return m;
}

export const WEAPON_TYPES = {
  sword: { name: 'Sword', hands: 1, dmg: 18, speed: 1.0, range: 2.6, arc: 110, stat: 'str', combo: 3, bases: ['Arming Sword', 'Falchion', 'Broadsword', 'Gladius', 'Khopesh', 'Scimitar', 'Longsword', 'Rapier'] },
  mace: { name: 'Mace', hands: 1, dmg: 20, speed: 0.9, range: 2.4, arc: 100, stat: 'str', combo: 3, stagger: 1.6, bases: ['Mace', 'Morningstar', 'Flanged Mace', 'Warhammer', 'Scepter-Mace'] },
  greatsword: { name: 'Greatsword', hands: 2, dmg: 34, speed: 0.7, range: 3.4, arc: 160, stat: 'str', combo: 3, stagger: 1.4, bases: ['Greatsword', 'Zweihander', 'Claymore', "Executioner's Blade", 'Flamberge'] },
  dagger: { name: 'Dagger', hands: 1, dmg: 11, speed: 1.45, range: 1.9, arc: 80, stat: 'dex', combo: 4, bases: ['Dagger', 'Kris', 'Stiletto', 'Dirk', 'Sickle-Knife'] },
  spear: { name: 'Spear', hands: 1, dmg: 20, speed: 0.95, range: 3.9, arc: 36, stat: 'dex', combo: 3, bases: ['Spear', 'Partisan', 'Trident', 'Boar Spear', 'Ranseur'] },
  halberd: { name: 'Halberd', hands: 2, dmg: 32, speed: 0.72, range: 4.1, arc: 140, stat: 'str', combo: 3, stagger: 1.3, bases: ['Halberd', 'Poleaxe', 'Bardiche', 'Voulge', 'Glaive'] },
  bow: { name: 'Bow', hands: 2, dmg: 17, speed: 1.0, ranged: true, projSpeed: 46, stat: 'dex', bases: ['Shortbow', 'Longbow', 'Recurve Bow', 'Hunting Bow', 'Composite Bow', 'Warbow'] },
  crossbow: { name: 'Crossbow', hands: 2, dmg: 30, speed: 0.6, ranged: true, projSpeed: 64, stat: 'dex', bases: ['Light Crossbow', 'Arbalest', 'Heavy Crossbow', 'Repeater', 'Siege Crossbow'] },
  staff: { name: 'Staff', hands: 2, dmg: 13, speed: 0.95, caster: true, spellPower: 20, stat: 'int', bases: ['Staff', 'Quarterstaff', 'Battle Staff', 'Rod of Office', 'Elder Staff'] },
  wand: { name: 'Wand', hands: 1, dmg: 9, speed: 1.3, caster: true, spellPower: 10, spellCrit: 5, stat: 'int', bases: ['Wand', 'Bone Wand', 'Crystal Wand', 'Rune Wand', 'Willow Wand'] },
};
export const SHIELD = { name: 'Shield', armor: 9, block: 0.72, bases: ['Buckler', 'Round Shield', 'Kite Shield', 'Heater Shield', 'Tower Shield', 'Pavise'] };

export const ARMOR_SLOTS = {
  helm: { name: 'Helm', armor: 6, names: { cloth: ['Hood', 'Circlet', 'Cowl'], leather: ['Cap', 'Mask', 'Coif'], mail: ['Mail Coif', 'Bascinet', 'Nasal Helm'], plate: ['Greathelm', 'Sallet', 'Armet'] } },
  chest: { name: 'Chest', armor: 12, names: { cloth: ['Robe', 'Vestments', 'Mantle'], leather: ['Jerkin', 'Brigandine', 'Leather Coat'], mail: ['Hauberk', 'Chainmail', 'Scale Coat'], plate: ['Cuirass', 'Breastplate', 'Plate Armor'] } },
  gloves: { name: 'Gloves', armor: 4, names: { cloth: ['Wraps', 'Gloves', 'Silk Gloves'], leather: ['Bracers', 'Gloves', 'Grips'], mail: ['Mail Gloves', 'Vambraces', 'Mitts'], plate: ['Gauntlets', 'Fists', 'Plated Gauntlets'] } },
  legs: { name: 'Legs', armor: 8, names: { cloth: ['Leggings', 'Trousers', 'Skirt'], leather: ['Breeches', 'Leggings', 'Chaps'], mail: ['Chausses', 'Mail Leggings', 'Tassets'], plate: ['Greaves', 'Cuisses', 'Legplates'] } },
  boots: { name: 'Boots', armor: 4, names: { cloth: ['Sandals', 'Slippers', 'Wrapped Boots'], leather: ['Boots', 'Treads', 'Moccasins'], mail: ['Mail Boots', 'Stompers', 'Footguards'], plate: ['Sabatons', 'War Boots', 'Plated Boots'] } },
};
export const WEIGHTS = { cloth: { mult: 0.35, name: 'Cloth' }, leather: { mult: 0.6, name: 'Leather' }, mail: { mult: 0.8, name: 'Mail' }, plate: { mult: 1.0, name: 'Plate' } };

export const TRINKETS = {
  amulet: { name: 'Amulet', bases: ['Amulet', 'Pendant', 'Talisman', 'Choker', 'Locket'] },
  ring: { name: 'Ring', bases: ['Ring', 'Band', 'Signet', 'Loop', 'Seal'] },
};

// Affixes: value = base * S(ilvl)^scale ; pct affixes don't scale with level
export const AFFIXES = [
  { id: 'str', name: 'Strength', fmt: '+{v} Strength', base: 2, lvl: 0.12, pre: 'Mighty', suf: 'of the Bear', slots: 'any' },
  { id: 'dex', name: 'Dexterity', fmt: '+{v} Dexterity', base: 2, lvl: 0.12, pre: 'Nimble', suf: 'of the Fox', slots: 'any' },
  { id: 'int', name: 'Intellect', fmt: '+{v} Intellect', base: 2, lvl: 0.12, pre: 'Arcane', suf: 'of the Owl', slots: 'any' },
  { id: 'vit', name: 'Vitality', fmt: '+{v} Vitality', base: 2, lvl: 0.12, pre: 'Hale', suf: 'of the Ox', slots: 'any' },
  { id: 'wil', name: 'Willpower', fmt: '+{v} Willpower', base: 2, lvl: 0.12, pre: 'Resolute', suf: 'of the Sage', slots: 'any' },
  { id: 'dmgPct', name: 'Damage', fmt: '+{v}% Damage', base: 6, pct: true, max: 20, pre: 'Vicious', suf: 'of Slaughter', slots: 'weapon,ring,amulet,gloves' },
  { id: 'critChance', name: 'Crit Chance', fmt: '+{v}% Critical Chance', base: 2, pct: true, max: 7, pre: 'Keen', suf: 'of Precision', slots: 'weapon,ring,amulet,gloves,helm' },
  { id: 'critDmg', name: 'Crit Damage', fmt: '+{v}% Critical Damage', base: 10, pct: true, max: 35, pre: 'Brutal', suf: 'of Ruin', slots: 'weapon,amulet,gloves' },
  { id: 'atkSpeed', name: 'Attack Speed', fmt: '+{v}% Attack Speed', base: 4, pct: true, max: 12, pre: 'Swift', suf: 'of Haste', slots: 'weapon,gloves,ring' },
  { id: 'spellPower', name: 'Spell Power', fmt: '+{v}% Spell Power', base: 6, pct: true, max: 22, pre: 'Mystic', suf: 'of Sorcery', slots: 'weapon,helm,amulet,ring,chest' },
  { id: 'hpPct', name: 'Max Health', fmt: '+{v}% Max Health', base: 4, pct: true, max: 12, pre: 'Vital', suf: 'of Life', slots: 'armor,amulet,shield' },
  { id: 'armorPct', name: 'Armor', fmt: '+{v}% Armor', base: 8, pct: true, max: 25, pre: 'Sturdy', suf: 'of the Wall', slots: 'armor,shield' },
  { id: 'moveSpeed', name: 'Movement Speed', fmt: '+{v}% Movement Speed', base: 3, pct: true, max: 9, pre: 'Fleet', suf: 'of the Wind', slots: 'boots,legs' },
  { id: 'lifeOnHit', name: 'Life on Hit', fmt: '+{v} Life on Hit', base: 2, lvl: 0.6, pre: 'Leeching', suf: 'of the Leech', slots: 'weapon,gloves,ring' },
  { id: 'manaRegen', name: 'Mana Regen', fmt: '+{v} Mana per second', base: 1, lvl: 0.25, pre: 'Flowing', suf: 'of Clarity', slots: 'helm,amulet,ring,weapon,chest' },
  { id: 'staminaRegen', name: 'Stamina Regen', fmt: '+{v}% Stamina Regen', base: 8, pct: true, max: 25, pre: 'Tireless', suf: 'of Endurance', slots: 'chest,legs,boots,amulet' },
  { id: 'cdr', name: 'Cooldown Reduction', fmt: '+{v}% Cooldown Reduction', base: 3, pct: true, max: 10, pre: 'Timeless', suf: 'of Eternity', slots: 'helm,amulet,ring,tome' },
  { id: 'fireRes', name: 'Fire Resistance', fmt: '+{v}% Fire Resistance', base: 8, pct: true, max: 25, pre: 'Flameward', suf: 'of the Salamander', slots: 'armor,shield,ring' },
  { id: 'frostRes', name: 'Frost Resistance', fmt: '+{v}% Frost Resistance', base: 8, pct: true, max: 25, pre: 'Frostward', suf: 'of the Yeti', slots: 'armor,shield,ring' },
  { id: 'lightningRes', name: 'Lightning Resistance', fmt: '+{v}% Lightning Resistance', base: 8, pct: true, max: 25, pre: 'Grounded', suf: 'of the Storm', slots: 'armor,shield,ring' },
  { id: 'voidRes', name: 'Void Resistance', fmt: '+{v}% Void Resistance', base: 8, pct: true, max: 25, pre: 'Starlit', suf: 'of the Lantern', slots: 'armor,shield,amulet' },
  { id: 'rotRes', name: 'Rot Resistance', fmt: '+{v}% Rot Resistance', base: 8, pct: true, max: 25, pre: 'Purifying', suf: 'of the Healer', slots: 'armor,shield,amulet' },
  { id: 'goldFind', name: 'Gold Find', fmt: '+{v}% Gold Found', base: 10, pct: true, max: 30, pre: 'Gilded', suf: 'of Greed', slots: 'ring,amulet,helm' },
  { id: 'magicFind', name: 'Magic Find', fmt: '+{v}% Magic Find', base: 6, pct: true, max: 18, pre: 'Lucky', suf: 'of Fortune', slots: 'ring,amulet,helm,boots' },
  { id: 'xpPct', name: 'Experience', fmt: '+{v}% Experience', base: 4, pct: true, max: 10, pre: 'Wise', suf: 'of Learning', slots: 'helm,amulet,ring' },
];
export const AFFIX = Object.fromEntries(AFFIXES.map((a) => [a.id, a]));

export const WEAPON_ELEMENTS = [
  { id: 'fire', pre: 'Blazing', color: '#ff6a20' },
  { id: 'frost', pre: 'Frozen', color: '#70c8ff' },
  { id: 'lightning', pre: 'Thundering', color: '#a0b0ff' },
  { id: 'void', pre: 'Hollow', color: '#9a60ff' },
  { id: 'holy', pre: 'Radiant', color: '#ffe080' },
  { id: 'rot', pre: 'Blighted', color: '#70c040' },
];

export const SETS = {
  sunward: { name: 'Sunward Aegis', weight: 'plate', color: '#f0d070', trim: '#ffffff', bonuses: { 2: { stats: { blockPct: 15 }, text: '+15% block effectiveness' }, 4: { flag: 'parryHeal', text: 'Perfect parries heal 6% health' }, 5: { flag: 'blockNova', text: 'Blocking releases a nova of sunlight' } }, where: 'Sunward Order quartermaster; Vaults of Aurelion' },
  ashencourt: { name: 'Ashen Court Regalia', weight: 'cloth', color: '#3a2a2e', trim: '#e04a28', bonuses: { 2: { stats: { fireDmgPct: 15 }, text: '+15% fire damage' }, 4: { flag: 'burnVuln', text: 'Burning enemies take 20% more damage' }, 5: { flag: 'killBurst', text: 'Burning enemies explode on death' } }, where: "Ashen Court quartermaster; Ashen Court Catacombs" },
  tidebound: { name: 'Tidebound Corsair', weight: 'leather', color: '#2a4a5a', trim: '#e0c070', bonuses: { 2: { stats: { moveSpeed: 10 }, text: '+10% movement speed' }, 4: { flag: 'dodgeSoak', text: 'Dodging soaks nearby enemies' }, 5: { flag: 'soakVuln', text: 'Soaked enemies take 30% more damage' } }, where: "Tidebound Guild quartermaster; Corsair's Grave" },
  choir: { name: 'Silent Choir Shroud', weight: 'leather', color: '#2a2438', trim: '#a080e0', bonuses: { 2: { stats: { critChance: 10 }, text: '+10% critical chance' }, 4: { flag: 'longStealth', text: 'Stealth lasts 50% longer' }, 5: { flag: 'stealthRefresh', text: 'Kills from stealth refresh stealth' } }, where: 'Silent Choir quartermaster; The Quiet Halls' },
  frostwarden: { name: 'Frostwarden Plate', weight: 'plate', color: '#a8c8e0', trim: '#e8f8ff', bonuses: { 2: { stats: { frostRes: 20 }, text: '+20% frost resistance' }, 4: { flag: 'chillAttackers', text: 'Attackers are chilled' }, 5: { flag: 'frozenVuln', text: 'Frozen enemies take 40% more damage' } }, where: 'Frozen Citadel of Vael; Stormcrown Peak' },
  dunewalker: { name: "Dunewalker's Garb", weight: 'leather', color: '#c09060', trim: '#7a3020', bonuses: { 2: { stats: { staminaRegen: 15 }, text: '+15% stamina regeneration' }, 4: { flag: 'stormImmune', text: 'Immune to sandstorm and glass storm harm' }, 5: { flag: 'dodgeSand', text: 'Dodging throws a blinding sand blast' } }, where: 'Crimson Wastes dungeons' },
  verdantbough: { name: 'Verdant Bough', weight: 'mail', color: '#4a6a3a', trim: '#a0d060', bonuses: { 2: { stats: { regen: 1 }, text: 'Regenerate 1% health per second' }, 4: { flag: 'longRoots', text: 'Your roots last twice as long' }, 5: { flag: 'thornHits', text: 'Hits have a chance to burst into rooting thorns' } }, where: 'Verdant Reach dungeons' },
  revenant: { name: "Revenant's Shroud", weight: 'cloth', color: '#5a6060', trim: '#80e0c0', bonuses: { 2: { stats: { rotRes: 20 }, text: '+20% rot resistance' }, 4: { flag: 'cheatDeath', text: 'Once every 3 minutes, survive a killing blow' }, 5: { flag: 'moreMinions', text: '+3 maximum minions' } }, where: 'Ossuary Undercroft; Mossgrave Barrow' },
  dragonscale: { name: 'Dragonscale Harness', weight: 'mail', color: '#7a2a20', trim: '#e0a040', bonuses: { 2: { stats: { fireRes: 15 }, text: '+15% fire resistance' }, 4: { stats: { bossDmg: 20 }, text: '+20% damage against bosses' }, 5: { flag: 'dragonBreath', text: 'Heavy attacks breathe fire' } }, where: 'Cinder Spire Depths; The Magma Forge' },
  gildedlegion: { name: 'Gilded Legion', weight: 'plate', color: '#c8a040', trim: '#8a2020', bonuses: { 2: { stats: { armorPct: 10 }, text: '+10% armor' }, 4: { flag: 'highHpDmg', text: '+15% damage while above 80% health' }, 5: { flag: 'legionAura', text: 'Nearby enemies deal 15% less damage' } }, where: 'Senate of Shades; Lion Gate Barracks' },
  deepdelver: { name: "Deepdelver's Kit", weight: 'mail', color: '#5a5048', trim: '#e0a040', bonuses: { 2: { stats: { goldFind: 25 }, text: '+25% gold found' }, 4: { flag: 'lantern', text: 'You carry a lantern light everywhere' }, 5: { flag: 'deepDmg', text: '+20% damage in dungeons and the Hollow Deep' } }, where: 'Kharak Dun Mines; The Lantern Mines' },
  stormbreaker: { name: 'Stormbreaker', weight: 'mail', color: '#4a5a7a', trim: '#c0d0ff', bonuses: { 2: { stats: { lightningRes: 20 }, text: '+20% lightning resistance' }, 4: { flag: 'critChain', text: 'Critical hits chain lightning' }, 5: { flag: 'tenthStrike', text: 'Every 10th hit calls a lightning strike' } }, where: 'Skarrow Camp; Stormcrown Peak Shrine' },
};

// Hand-authored legendary relics: each carries lore and some begin a quest chain.
export const LEGENDARIES = {
  emberfall: { name: 'Emberfall', kind: 'weapon', type: 'greatsword', rarity: 'legendary', element: 'fire', power: { heavyWave: 'fire' }, powerText: 'Heavy attacks send out a wave of fire.', lore: 'The blade of the last Sun-King, Aurel IX. It was broken over his own coronation altar.', chain: 'q_leg_emberfall' },
  tidecaller: { name: 'Tidecaller', kind: 'weapon', type: 'spear', rarity: 'legendary', element: 'frost', power: { waveChance: 0.15 }, powerText: '15% chance on hit to summon a crashing wave.', lore: 'Admiral Veyl went down with her fleet rather than surrender it. The sea gave back only her spear.', chain: 'q_leg_tidecaller' },
  whisper: { name: 'Whisper', kind: 'weapon', type: 'dagger', rarity: 'legendary', element: 'void', power: { killStealth: 2 }, powerText: 'Kills grant 2 seconds of stealth.', lore: 'The knife of Saint Ilse, the first of the Silent Choir. It has never been used to make a sound.', chain: 'q_leg_whisper' },
  frostheart: { name: 'Frostheart of Vael', kind: 'weapon', type: 'staff', rarity: 'legendary', element: 'frost', power: { extraProjectile: 1, freezeLonger: 1.5 }, powerText: 'Frost spells fire an extra projectile; freezes last 50% longer.', lore: 'King Vael froze his own citadel to keep something in. The staff is still cold with the effort.' },
  yewheart: { name: 'Yewheart', kind: 'weapon', type: 'bow', rarity: 'legendary', element: 'rot', power: { arrowRoot: 0.25 }, powerText: 'Arrows have a 25% chance to root.', lore: 'Grown, not made: a living branch of the Elder Yew, bent to the will of the first Warden.', chain: 'q_leg_yewheart' },
  kharaksoath: { name: "Kharak's Oath", kind: 'shield', rarity: 'legendary', power: { reflect: 1 }, powerText: 'Blocking reflects projectiles back at their source.', lore: 'The first dwarf-king swore to hold the gate against the dark. The shield remembers the oath even if his heirs do not.', chain: 'q_leg_kharak' },
  ozymarseye: { name: "Ozymar's Eye", kind: 'trinket', slot: 'amulet', rarity: 'legendary', power: { magicFind: 30, revealShrines: 1 }, powerText: '+30% magic find. Hidden shrines appear on your map.', lore: 'The colossus Ozymar watched the empire for nine hundred years. When it fell, he closed one eye. This is the other.' },
  glassfang: { name: 'The Glass Fang', kind: 'weapon', type: 'dagger', rarity: 'legendary', element: 'fire', power: { critBleed: 1 }, powerText: 'Critical hits shatter into bleeding glass shards.', lore: 'A tooth of the Glass Wyrm, which swims through the sand during the glass storms.' },
  lastlight: { name: 'Last Light of Aurelion', kind: 'weapon', type: 'wand', rarity: 'legendary', element: 'holy', power: { holyBolts: 1 }, powerText: 'Wand bolts become searing sunlight that pierces.', lore: 'Lit from the empire\'s final dawn, the light has not gone out since.' },
  ymrathknuckle: { name: "Ymrath's Knuckle", kind: 'weapon', type: 'mace', rarity: 'legendary', element: 'frost', power: { heavyFreeze: 1 }, powerText: 'Heavy attacks freeze enemies around the impact.', lore: 'A knucklebone of the frozen titan, bound to an oaken haft. It hums in blizzards.' },
  leviathanrib: { name: "Leviathan's Rib", kind: 'weapon', type: 'halberd', rarity: 'legendary', element: 'lightning', power: { stormSweep: 1 }, powerText: 'Sweeping attacks call down lightning.', lore: 'Cut from the beast that swallows ships when the storms come in off the Drowned Coast.' },
  stormjaw: { name: 'Stormjaw', kind: 'weapon', type: 'crossbow', rarity: 'legendary', element: 'lightning', power: { boltChain: 3 }, powerText: 'Bolts chain lightning to 3 foes.', lore: 'Orc-forged in a lightning-struck forge on the steppe. It has to be cranked during a storm.' },
  lastword: { name: "The Duelist's Last Word", kind: 'weapon', type: 'sword', base: 'Rapier', rarity: 'legendary', power: { riposteX: 1.5 }, powerText: 'Ripostes deal 50% more damage.', lore: 'Carried by the champion of the Last Legion at Aurelion\'s final duel, which she won.', chain: 'q_hidden_lastlegion' },
  sunderer: { name: 'Sunderer', kind: 'weapon', type: 'halberd', rarity: 'legendary', power: { armorBreak: 0.25 }, powerText: 'Hits reduce enemy armor by 25%.', lore: 'Standard-bearer\'s halberd of the Gilded Legion. It still carries the scraps of a golden banner.' },
  sporeheart: { name: "Gorm's Spore-Heart", kind: 'trinket', slot: 'ring', rarity: 'legendary', power: { killSpores: 1 }, powerText: 'Enemies you kill release healing spores.', lore: 'Taken from the fungal god of the Deep. It is still, very slowly, beating.' },
  wintermantle: { name: "Vael's Wintermantle", kind: 'armor', slot: 'chest', weight: 'plate', rarity: 'legendary', power: { frostAura: 1 }, powerText: 'Nearby enemies are continuously chilled.', lore: 'The king\'s cloak, fused to his armour by the cold of three hundred winters.' },
  cinderwing: { name: 'Cinderwing Mantle', kind: 'armor', slot: 'chest', weight: 'mail', rarity: 'legendary', power: { dodgeFire: 1 }, powerText: 'Dodging leaves a trail of fire.', lore: 'Woven from the moulted wing-membrane of the last dragon to roost in the Cinder Spire.' },
  saltfanggrin: { name: "Saltfang's Grin", kind: 'armor', slot: 'gloves', weight: 'leather', rarity: 'legendary', power: { predator: 0.25 }, powerText: '+25% damage to enemies below 50% health.', lore: 'Gauntlets studded with the teeth of the first King Crab, taken by the founder of Saltfang.' },
  heraldlantern: { name: "Herald's Lantern", kind: 'trinket', slot: 'amulet', rarity: 'legendary', power: { voidDmgPct: 30 }, powerText: '+30% void damage. You glow with unlight.', lore: 'The Crown Herald carried this lantern ahead of the Hollow King. What burns in it is not flame.' },
  hollowcrown: { name: 'The Hollow Crown', kind: 'armor', slot: 'helm', weight: 'plate', rarity: 'mythic', power: { allStats: 10, deepDmg: 25 }, powerText: '+10 to all stats. +25% damage in the Hollow Deep.', lore: 'The crown the Hollow King forged to replace the one he lost. It is empty inside, as he was.' },
  ashencrown: { name: 'The Ashen Crown', kind: 'armor', slot: 'helm', weight: 'plate', rarity: 'mythic', power: { allStats: 25, crowned: 1 }, powerText: '+25 to all stats. Every faction bows. The world remembers its king.', lore: 'Six shards, reforged in the heart of the world. It is warm, like a hearth, and heavy, like a promise.' },
  codexrot: { name: "Rot Mother's Lament", kind: 'tome', tome: 'rot', tier: 5, rarity: 'legendary', power: { moreMinions: 2 }, powerText: '+2 maximum minions.', lore: 'Written in sap and spores. The Rot Mother wept it as she died.' },
};

// ------------------------------------------------------------------------
let uidCounter = Date.now() % 100000;
export const newUid = () => 'i' + (uidCounter++).toString(36) + Math.floor(Math.random() * 1296).toString(36);

const WEAPON_KEYS = Object.keys(WEAPON_TYPES);
const ARMOR_KEYS = Object.keys(ARMOR_SLOTS);

export function rollRarity(rng, magicFind = 0, minRarity = 0, boost = 0) {
  const ws = RARITIES.map((r, i) => [i, i === 0 ? r.weight : r.weight * (1 + magicFind / 100) * (1 + boost * i)]);
  let idx = rng.weighted(ws);
  return Math.max(idx, minRarity);
}

function affixSlotOk(a, item) {
  if (a.slots === 'any') return true;
  const s = a.slots.split(',');
  if (item.kind === 'weapon' && s.includes('weapon')) return true;
  if (item.kind === 'armor' && (s.includes('armor') || s.includes(item.slot))) return true;
  if (item.kind === 'shield' && s.includes('shield')) return true;
  if (item.kind === 'trinket' && s.includes(item.slot)) return true;
  if (item.kind === 'tome' && s.includes('tome')) return true;
  return false;
}

export function affixValue(a, ilvl, roll) {
  if (a.pct) return Math.max(1, Math.round(a.base + (a.max - a.base) * roll * Math.min(1, ilvl / 60)));
  return Math.max(1, Math.round(a.base * (0.7 + roll * 0.6) * (1 + ilvl * a.lvl)));
}

function addAffixes(item, n, rng) {
  const pool = AFFIXES.filter((a) => affixSlotOk(a, item));
  rng.shuffle(pool);
  item.affixes = item.affixes || [];
  for (const a of pool) {
    if (item.affixes.length >= n) break;
    if (item.affixes.some((x) => x.id === a.id)) continue;
    item.affixes.push({ id: a.id, v: affixValue(a, item.ilvl, rng.f()) });
  }
}

export function itemDisplayName(item) {
  return item.name + (item.upgrade ? ` +${item.upgrade}` : '');
}

// Recompute derived numbers (damage, armour, value) from base + rarity + upgrade
export function finalizeItem(item) {
  const r = RARITY[item.rarity];
  const up = 1 + (item.upgrade || 0) * 0.08;
  const s = S(item.ilvl);
  if (item.kind === 'weapon') {
    const wt = WEAPON_TYPES[item.type];
    item.dmg = Math.round(wt.dmg * s * r.mult * up * (item.dmgRoll || 1));
    item.speed = wt.speed;
    if (wt.spellPower) item.spellPower = Math.round(wt.spellPower * r.mult * up);
  } else if (item.kind === 'armor') {
    item.armor = Math.round(ARMOR_SLOTS[item.slot].armor * WEIGHTS[item.weight].mult * s * r.mult * up);
  } else if (item.kind === 'shield') {
    item.armor = Math.round(SHIELD.armor * s * r.mult * up);
    item.block = Math.min(0.92, SHIELD.block + r.index * 0.03 + (item.upgrade || 0) * 0.01);
  }
  item.value = Math.round((8 + item.ilvl * 3.2) * (1 + r.index * r.index * 0.9) * (item.kind === 'tome' ? 3 : 1) * up);
  return item;
}

function nameWeapon(item, base, rng) {
  const mat = materialFor(item.ilvl);
  const r = RARITY[item.rarity];
  let name = `${mat.metal} ${base}`;
  if (item.element) name = `${WEAPON_ELEMENTS.find((e) => e.id === item.element).pre} ${name}`;
  if (r.index >= 2 && item.affixes.length) {
    const a = AFFIX[item.affixes[0].id];
    name = item.element ? `${name} ${a.suf}` : `${a.pre} ${name}`;
    if (item.affixes[1] && !item.element) name += ` ${AFFIX[item.affixes[1].id].suf}`;
  } else if (r.index === 1 && item.affixes.length) name = `${name} ${AFFIX[item.affixes[0].id].suf}`;
  return name;
}

export function makeWeapon(type, ilvl, rarityIdx, rng, opts = {}) {
  const wt = WEAPON_TYPES[type];
  const base = opts.base || rng.pick(wt.bases);
  const item = {
    uid: newUid(), kind: 'weapon', type, base, ilvl, req: Math.max(1, ilvl - 2), rarity: RARITIES[rarityIdx].id,
    material: materialFor(ilvl).id, dmgRoll: 0.92 + rng.f() * 0.16, affixes: [], upgrade: 0,
  };
  if (rarityIdx >= 1 && rng.chance(0.25 + rarityIdx * 0.1)) item.element = opts.element || rng.pick(WEAPON_ELEMENTS).id;
  if (opts.element) item.element = opts.element;
  addAffixes(item, rng.int(...RARITIES[rarityIdx].affixes), rng);
  item.name = nameWeapon(item, base, rng);
  return finalizeItem(item);
}

export function makeArmor(slot, weight, ilvl, rarityIdx, rng, opts = {}) {
  const mat = materialFor(ilvl);
  const piece = rng.pick(ARMOR_SLOTS[slot].names[weight]);
  const matName = weight === 'cloth' ? mat.cloth : weight === 'leather' ? mat.leather : mat.metal;
  const item = { uid: newUid(), kind: 'armor', slot, weight, ilvl, req: Math.max(1, ilvl - 2), rarity: RARITIES[rarityIdx].id, material: mat.id, affixes: [], upgrade: 0 };
  addAffixes(item, rng.int(...RARITIES[rarityIdx].affixes), rng);
  let name = `${matName} ${piece}`;
  if (rarityIdx >= 2 && item.affixes.length) name = `${AFFIX[item.affixes[0].id].pre} ${name}`;
  if (rarityIdx >= 1 && item.affixes.length > 1) name += ` ${AFFIX[item.affixes[item.affixes.length - 1].id].suf}`;
  else if (rarityIdx === 1 && item.affixes.length) name += ` ${AFFIX[item.affixes[0].id].suf}`;
  item.name = name;
  return finalizeItem(item);
}

export function makeShield(ilvl, rarityIdx, rng) {
  const mat = materialFor(ilvl);
  const base = rng.pick(SHIELD.bases);
  const item = { uid: newUid(), kind: 'shield', type: 'shield', base, ilvl, req: Math.max(1, ilvl - 2), rarity: RARITIES[rarityIdx].id, material: mat.id, affixes: [], upgrade: 0 };
  addAffixes(item, rng.int(...RARITIES[rarityIdx].affixes), rng);
  item.name = (rarityIdx >= 2 && item.affixes.length ? AFFIX[item.affixes[0].id].pre + ' ' : '') + `${mat.metal} ${base}` + (rarityIdx >= 1 && item.affixes.length ? ' ' + AFFIX[item.affixes[item.affixes.length - 1].id].suf : '');
  return finalizeItem(item);
}

export function makeTrinket(slot, ilvl, rarityIdx, rng) {
  const base = rng.pick(TRINKETS[slot].bases);
  const gems = ['Ruby', 'Sapphire', 'Topaz', 'Amethyst', 'Emerald', 'Onyx', 'Opal', 'Garnet', 'Jade', 'Moonstone'];
  const item = { uid: newUid(), kind: 'trinket', slot, base, ilvl, req: Math.max(1, ilvl - 2), rarity: RARITIES[rarityIdx].id, affixes: [], upgrade: 0, gem: rng.pick(gems) };
  addAffixes(item, Math.max(1, rng.int(...RARITIES[rarityIdx].affixes)), rng);
  const a = AFFIX[item.affixes[0].id];
  item.name = `${item.gem} ${base} ${a.suf}`;
  return finalizeItem(item);
}

export function makeTome(tomeId, tier, ilvl, rarityIdx, rng) {
  const t = TOMES[tomeId];
  const item = { uid: newUid(), kind: 'tome', tome: tomeId, tier, ilvl, req: Math.max(1, Math.min(ilvl - 2, (tier - 1) * 18)), rarity: RARITIES[Math.max(rarityIdx, tier - 1)]?.id || 'rare', affixes: [], upgrade: 0 };
  addAffixes(item, Math.max(0, tier - 1), rng);
  item.name = `${t.name}, ${['', 'Apprentice', 'Journeyman', 'Adept', 'Master', 'Archmage'][tier]} Edition`;
  return finalizeItem(item);
}

export function makeLegendary(id, ilvl, rng) {
  const L = LEGENDARIES[id];
  let item;
  const rIdx = RARITY[L.rarity].index;
  if (L.kind === 'weapon') item = makeWeapon(L.type, ilvl, rIdx, rng, { base: L.base, element: L.element });
  else if (L.kind === 'armor') item = makeArmor(L.slot, L.weight, ilvl, rIdx, rng);
  else if (L.kind === 'shield') item = makeShield(ilvl, rIdx, rng);
  else if (L.kind === 'trinket') item = makeTrinket(L.slot, ilvl, rIdx, rng);
  else if (L.kind === 'tome') item = makeTome(L.tome, L.tier, ilvl, rIdx, rng);
  item.name = L.name;
  item.legendary = id;
  item.rarity = L.rarity;
  if (L.element) item.element = L.element;
  return finalizeItem(item);
}

export function makeSetPiece(setId, slot, ilvl, rng) {
  const set = SETS[setId];
  const item = makeArmor(slot, set.weight, ilvl, 3, rng);
  item.set = setId;
  const piece = item.name.split(' ').slice(-1)[0];
  item.name = `${set.name} ${ARMOR_SLOTS[slot].name}`;
  return finalizeItem(item);
}

// Main loot roller
export function rollLoot(ilvl, rng, opts = {}) {
  const mf = opts.magicFind || 0;
  const rIdx = rollRarity(rng, mf, opts.minRarity || 0, opts.boost || 0);
  if (rIdx >= 4 && rng.chance(0.75)) {
    // legendary drop: pick a relic that can drop randomly
    const pool = Object.keys(LEGENDARIES).filter((k) => !['ashencrown', 'hollowcrown', 'lastword'].includes(k) && !LEGENDARIES[k].chain);
    return makeLegendary(rng.pick(pool), ilvl, rng);
  }
  const r = Math.min(rIdx, 3);
  const roll = rng.f();
  const prefer = opts.prefer; // class-appropriate bias
  if (roll < 0.42) {
    const type = prefer && rng.chance(0.5) ? rng.pick(prefer.weapons) : rng.pick(WEAPON_KEYS);
    return makeWeapon(type, ilvl, r, rng);
  } else if (roll < 0.82) {
    const slot = rng.pick(ARMOR_KEYS);
    const weight = prefer && rng.chance(0.5) ? prefer.weight : rng.pick(Object.keys(WEIGHTS));
    if (opts.setChance && rng.chance(opts.setChance) && opts.set) return makeSetPiece(opts.set, slot, ilvl, rng);
    return makeArmor(slot, weight, ilvl, r, rng);
  } else if (roll < 0.9) {
    return makeShield(ilvl, r, rng);
  } else {
    return makeTrinket(rng.pick(['amulet', 'ring']), ilvl, Math.max(1, r), rng);
  }
}

// ---------------- Consumables & materials ----------------
export const CONSUMABLES = {
  hp_potion: { name: 'Healing Draught', desc: 'Restore 40% health over 2s.', heal: 0.4, color: '#e04040', value: 20, stack: 20 },
  mana_potion: { name: 'Mana Tincture', desc: 'Restore 50% mana.', mana: 0.5, color: '#4060e0', value: 18, stack: 20 },
  stamina_tonic: { name: 'Sandrunner Tonic', desc: '+50% stamina regeneration for 30s.', buff: { staminaRegen: 50 }, duration: 30, color: '#e0c040', value: 25, stack: 10 },
  elixir_might: { name: 'Elixir of Might', desc: '+20% damage for 60s.', buff: { dmgPct: 20 }, duration: 60, color: '#e07030', value: 60, stack: 5 },
  elixir_ward: { name: 'Elixir of Warding', desc: '+30% all resistances for 60s.', buff: { allRes: 30 }, duration: 60, color: '#60a0e0', value: 60, stack: 5 },
  elixir_shadow: { name: 'Shadow Draught', desc: 'Become invisible for 10s.', buff: { stealth: 1 }, duration: 10, color: '#6040a0', value: 80, stack: 5 },
  waystone_shard: { name: 'Waystone Shard', desc: 'Return to the nearest discovered waystone.', recall: true, color: '#80c0ff', value: 40, stack: 10 },
  roasted_meat: { name: 'Roasted Dunehare', desc: 'Restore 25% health over 10s.', heal: 0.25, hot: 10, color: '#a06040', value: 6, stack: 20 },
};

export const MATERIALS_LIST = {
  ore: { name: 'Iron Ore', color: '#8a8a90', value: 4 },
  leather: { name: 'Leather Scraps', color: '#8a6040', value: 3 },
  cloth: { name: 'Bolt of Cloth', color: '#c0b8a0', value: 3 },
  wood: { name: 'Hardwood', color: '#7a5a3a', value: 2 },
  bone: { name: 'Bone Fragments', color: '#e0d8c8', value: 2 },
  dust: { name: 'Arcane Dust', color: '#b0a0ff', value: 8 },
  glass: { name: 'Storm Glass', color: '#ff3050', value: 12 },
  gold_dust: { name: 'Gold Dust', color: '#e8c050', value: 15 },
  mithral: { name: 'Mithral Ingot', color: '#c8e0f0', value: 30 },
  dragonscale: { name: 'Dragon Scale', color: '#a03020', value: 45 },
  starmetal: { name: 'Starmetal', color: '#a8bcff', value: 70 },
  voidshard: { name: 'Void Shard', color: '#8050d0', value: 90 },
  ess_fire: { name: 'Essence of Fire', color: '#ff6020', value: 20 },
  ess_frost: { name: 'Essence of Frost', color: '#60c0ff', value: 20 },
  ess_storm: { name: 'Essence of Storms', color: '#a0b0ff', value: 20 },
  ess_void: { name: 'Essence of the Void', color: '#9050ff', value: 24 },
  ess_holy: { name: 'Essence of Light', color: '#ffe080', value: 22 },
  ess_life: { name: 'Essence of Life', color: '#70d040', value: 20 },
  ess_rot: { name: 'Essence of Rot', color: '#60a040', value: 20 },
  herb: { name: 'Bloodroot Herb', color: '#c03040', value: 3 },
  crown_shard: { name: 'Crown Shard', color: '#ffd060', value: 0, quest: true },
};

export function materialDropsFor(theme, biome) {
  const t = { wastes: ['glass', 'bone', 'ess_fire'], gilded: ['gold_dust', 'ore', 'ess_holy'], verdant: ['wood', 'herb', 'ess_life'], frost: ['ore', 'mithral', 'ess_frost'], coast: ['cloth', 'leather', 'ess_storm'], maw: ['voidshard', 'dust', 'ess_void'], deep: ['starmetal', 'voidshard', 'ess_void', 'mithral'] };
  return t[biome] || ['ore', 'leather'];
}
