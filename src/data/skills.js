// Martial skills (earned from trainers, relics, rivals and faction quests) and the combos they form
// with spellbooks.

export const SKILLS = {
  shieldbash: { id: 'shieldbash', name: 'Shield Bash', type: 'melee', needs: 'shield', cd: 5, stamina: 18, dmg: 1.2, range: 2.6, angle: 90, status: { stun: 1.2 }, desc: 'Bash with your shield, stunning the target.', source: 'Knight starting skill. Taught at Aurelion\'s Rest.' },
  shieldwall: { id: 'shieldwall', name: 'Shield Wall', type: 'buff', needs: 'shield', cd: 16, stamina: 25, duration: 5, buff: { frontBlock: 0.9 }, desc: 'Brace: block 90% of damage from the front for 5s.', source: 'Trainer at Sunhold.' },
  parry: { id: 'parry', name: 'Parry Mastery', type: 'passive', passive: { parryWindow: 0.12 }, desc: 'Passive: your parry window is much wider, and perfect parries stagger.', source: "Duelist starting skill. Relic: Duelist's Notched Guard." },
  riposte: { id: 'riposte', name: 'Riposte', type: 'passive', passive: { riposte: 1 }, desc: 'Passive: after a perfect parry, your next attack crits for triple damage.', source: "Trainer at Qal'Sahar." },
  lunge: { id: 'lunge', name: 'Lunge', type: 'dash', cd: 4, stamina: 16, dmg: 1.6, range: 8, desc: 'Dash forward and pierce the first enemy.', source: 'Trainer at Emberwell. Relic: Spear of the First Legion.' },
  whirlwind: { id: 'whirlwind', name: 'Whirlwind', type: 'spin', cd: 8, stamina: 30, dmg: 0.55, radius: 3.6, duration: 1.8, tick: 0.25, desc: 'Spin, striking everything around you repeatedly.', source: 'Trainer at Skarrow Camp. Relic: Shattered Warlord Blade.' },
  groundslam: { id: 'groundslam', name: 'Ground Slam', type: 'nova', cd: 9, stamina: 28, dmg: 2.0, radius: 5, status: { stun: 0.8 }, desc: 'Slam the earth, damaging and stunning foes around you.', source: 'Trainer at Kharak Dun. Relic: Colossus-Breaker Maul.' },
  bladedance: { id: 'bladedance', name: 'Blade Dance', type: 'flurry', cd: 7, stamina: 26, dmg: 0.6, hits: 5, range: 3, angle: 120, desc: 'A flurry of five quick strikes ahead.', source: "Trainer at Qal'Sahar." },
  volley: { id: 'volley', name: 'Volley', type: 'volley', needs: 'ranged', cd: 6, stamina: 20, dmg: 0.8, count: 7, spread: 50, desc: 'Fire a fan of seven arrows.', source: 'Trainer at Sylvanhold. Relic: Quiver of the Wild Hunt.' },
  piercingshot: { id: 'piercingshot', name: 'Piercing Shot', type: 'shot', needs: 'ranged', cd: 4, stamina: 16, dmg: 2.2, pierce: 99, desc: 'A powerful shot that pierces every enemy in a line.', source: 'Ranger starting skill. Trainer at Brinehollow.' },
  stealth: { id: 'stealth', name: 'Shadow Veil', type: 'stealth', cd: 18, stamina: 20, duration: 6, desc: 'Vanish for 6s. Breaking stealth with an attack deals 2.5x damage.', source: 'Trainer at Greywater.' },
  shadowstep: { id: 'shadowstep', name: 'Shadowstep', type: 'teleport', cd: 6, stamina: 18, range: 12, desc: 'Teleport behind the enemy nearest your cursor.', source: 'Assassin starting skill. Silent Choir trainers.' },
  riftwalk: { id: 'riftwalk', name: 'Rift Step', type: 'dashblink', cd: 5, stamina: 16, range: 9, desc: 'Step through a fold in the world toward your cursor.', source: 'Trainer at Riftwatch.' },
  pounce: { id: 'pounce', name: 'Pounce', type: 'leap', cd: 6, stamina: 20, dmg: 1.8, range: 10, radius: 3, desc: 'Leap at the cursor, crashing down on enemies.', source: 'Trainer at Saltfang. Relic: Sand-Lion Totem.' },
  warcry: { id: 'warcry', name: 'Warcry', type: 'buff', cd: 18, stamina: 15, duration: 8, buff: { dmgPct: 25 }, fear: 2.5, radius: 8, desc: 'Roar: +25% damage, and weak enemies flee.', source: 'Berserker starting skill.' },
  execute: { id: 'execute', name: 'Execute', type: 'melee', cd: 8, stamina: 22, dmg: 1.5, range: 2.8, angle: 70, execute: 0.3, desc: 'A heavy blow; instantly kills non-boss enemies under 30% health.', source: 'Reward: Ashen Court quest "The Headsman\'s Debt".' },
  throwflask: { id: 'throwflask', name: 'Throw Flask', type: 'flask', cd: 0.8, stamina: 8, dmg: 1.4, radius: 3.5, desc: 'Lob a volatile flask (uses a Flask charge).', source: 'Alchemist starting skill.' },
  totem: { id: 'totem', name: 'Thorn Totem', type: 'totem', cd: 10, stamina: 20, duration: 15, radius: 6, desc: 'Plant a totem that roots and pricks nearby foes.', source: 'Warden starting skill.' },
  crafting: { id: 'crafting', name: 'Crafting Mastery', type: 'passive', passive: { craftBonus: 1 }, desc: 'Passive: crafting yields an extra affix, salvaging yields more, upgrades cost less.', source: 'Trainers at Kharak Dun and Lanternfall.' },
  impale: { id: 'impale', name: 'Impale', type: 'melee', cd: 3, stamina: 12, dmg: 2.1, range: 4.6, angle: 34, knock: 7, thrust: true, weapons: ['spear', 'halberd'], desc: 'A driving thrust that skewers everything in a line and hurls it back.', source: 'Spear and halberd technique.' },
  arcanenova: { id: 'arcanenova', name: 'Arcane Pulse', type: 'nova', cd: 3.5, stamina: 0, mana: 8, dmg: 1.7, radius: 5, element: 'void', caster: true, weapons: ['staff', 'wand'], desc: 'Release a pulse of raw arcana that blasts nearby foes away.', source: 'Staff and wand technique.' },
  manaward: { id: 'manaward', name: 'Mana Ward', type: 'buff', cd: 12, stamina: 0, mana: 15, duration: 6, buff: { shieldPct: 22 }, element: 'void', weapons: ['staff', 'wand'], desc: 'Wrap yourself in a ward that absorbs 22% of your max health.', source: 'Staff technique.' },
  arcanebarrage: { id: 'arcanebarrage', name: 'Arcane Barrage', type: 'barrage', cd: 2.5, stamina: 0, mana: 6, dmg: 0.9, count: 5, element: 'void', weapons: ['wand', 'staff'], desc: 'Fire a burst of seeking arcane missiles.', source: 'Wand technique.' },
  trap: { id: 'trap', name: 'Snare Trap', type: 'trap', cd: 10, stamina: 14, dmg: 1.5, radius: 2.5, status: { root: 3 }, desc: 'Set a trap that roots and wounds the first foe to touch it.', source: 'Reward: Sylvanhold quest "The Poacher\'s Trap".' },
};

// Combo skills: unlocked while you know the martial skill AND have the tome equipped.
export const COMBOS = [
  { id: 'flamearrows', name: 'Flame Arrows', tome: 'embers', skill: ['volley', 'piercingshot'], type: 'passive', passive: { arrowElement: 'fire' }, desc: 'Your arrows ignite foes (Embers + bow skill).' },
  { id: 'rainoffire', name: 'Rain of Fire', tome: 'embers', skill: ['volley'], type: 'rain', element: 'fire', cd: 12, stamina: 25, dmg: 1.0, radius: 7, count: 12, duration: 2, status: { burn: 2 }, desc: 'Loose a sky-arc of burning arrows (Embers + Volley).' },
  { id: 'bonebarrier', name: 'Bone Barrier', tome: 'rot', skill: ['shieldwall'], type: 'buff', cd: 20, stamina: 20, duration: 8, buff: { shieldPct: 30, thorns: 0.4 }, desc: 'A wall of bone absorbs 30% max health and wounds attackers (Rot + Shield Wall).' },
  { id: 'frostlunge', name: 'Glacial Lunge', tome: 'frost', skill: ['lunge'], type: 'dash', cd: 5, stamina: 18, dmg: 2.0, range: 10, element: 'frost', status: { freeze: 1.5 }, desc: 'Lunge in a trail of ice that freezes foes (Frost + Lunge).' },
  { id: 'tempestspin', name: 'Tempest Spin', tome: 'storm', skill: ['whirlwind'], type: 'spin', cd: 9, stamina: 32, dmg: 0.7, radius: 4.2, duration: 2.2, tick: 0.22, element: 'lightning', chain: 2, desc: 'A whirlwind that throws chain lightning (Storm + Whirlwind).' },
  { id: 'riftstrike', name: 'Rift Strike', tome: 'void', skill: ['shadowstep', 'riftwalk'], type: 'teleport', cd: 8, stamina: 22, range: 14, dmg: 2.4, radius: 4, element: 'void', pull: 6, desc: 'Teleport behind a foe and implode the space around them (Void + step skill).' },
  { id: 'thornquake', name: 'Thornquake', tome: 'verdant', skill: ['groundslam'], type: 'nova', cd: 10, stamina: 30, dmg: 2.4, radius: 6.5, element: 'nature', status: { root: 2.5 }, desc: 'Your slam erupts in rooting thorns (Verdant + Ground Slam).' },
  { id: 'judgementbash', name: 'Judgement Bash', tome: 'radiant', skill: ['shieldbash'], type: 'melee', cd: 6, stamina: 20, dmg: 2.2, range: 3, angle: 100, element: 'holy', status: { stun: 1.5 }, smite: 3, desc: 'Your bash calls down a pillar of light (Radiant + Shield Bash).' },
  { id: 'cinderwaltz', name: 'Cinder Waltz', tome: 'embers', skill: ['bladedance'], type: 'flurry', cd: 8, stamina: 28, dmg: 0.75, hits: 6, range: 3.2, angle: 140, element: 'fire', status: { burn: 2 }, desc: 'Each step of your blade dance leaves fire behind (Embers + Blade Dance).' },
  { id: 'glacierwall', name: 'Glacier Wall', tome: 'frost', skill: ['shieldwall'], type: 'wall', cd: 18, stamina: 20, duration: 6, element: 'frost', desc: 'Raise a wall of ice that blocks projectiles and chills (Frost + Shield Wall).' },
  { id: 'stormarrows', name: 'Storm Arrows', tome: 'storm', skill: ['volley', 'piercingshot'], type: 'passive', passive: { arrowElement: 'lightning', arrowChain: 2 }, desc: 'Arrows chain lightning to nearby foes (Storm + bow skill).' },
  { id: 'plagueblades', name: 'Plague Blades', tome: 'rot', skill: ['bladedance', 'lunge'], type: 'passive', passive: { meleeStatus: 'poison' }, desc: 'Your melee strikes poison (Rot + blade skill).' },
  { id: 'tidalpounce', name: 'Tidal Pounce', tome: 'tidal', skill: ['pounce'], type: 'leap', cd: 7, stamina: 22, dmg: 2.4, range: 12, radius: 5, element: 'water', knock: 8, desc: 'Pounce in a crashing wave (Tidal + Pounce).' },
  { id: 'voidvolley', name: 'Void Volley', tome: 'void', skill: ['volley'], type: 'volley', cd: 8, stamina: 22, dmg: 0.9, count: 7, spread: 50, element: 'void', pull: 3, desc: 'Arrows that drag foes toward their impact (Void + Volley).' },
  { id: 'sunburst', name: 'Sunburst Parry', tome: 'radiant', skill: ['parry', 'riposte'], type: 'passive', passive: { parryNova: 'holy' }, desc: 'Perfect parries release a nova of holy light (Radiant + parry skill).' },
  { id: 'emberriposte', name: 'Ember Riposte', tome: 'embers', skill: ['riposte'], type: 'passive', passive: { riposteExplode: 'fire' }, desc: 'Ripostes explode in flame (Embers + Riposte).' },
  { id: 'earthshatter', name: 'Earthshatter', tome: 'stone', skill: ['groundslam'], type: 'nova', cd: 10, stamina: 30, dmg: 3.0, radius: 7, element: 'earth', status: { stun: 1.5 }, desc: 'A shattering slam that throws up stone spikes (Stone + Ground Slam).' },
  { id: 'bloodwhirl', name: 'Blood Whirl', tome: 'blood', skill: ['whirlwind'], type: 'spin', cd: 9, stamina: 30, dmg: 0.7, radius: 3.8, duration: 2, tick: 0.25, element: 'blood', lifesteal: 0.25, desc: 'A whirlwind that drinks the blood it spills (Blood + Whirlwind).' },
  { id: 'sandstep', name: 'Sandstorm Step', tome: 'sand', skill: ['shadowstep', 'riftwalk'], type: 'teleport', cd: 7, stamina: 18, range: 12, dmg: 1.2, radius: 4, element: 'sand', status: { blind: 3 }, desc: 'Vanish in a burst of blinding sand (Sand + step skill).' },
  { id: 'songblade', name: 'Rhythm Blade', tome: 'song', skill: ['bladedance', 'parry'], type: 'passive', passive: { beatBonus: 0.15 }, desc: 'On-beat melee hits deal 15% more (Songbook + blade skill).' },
];

export function combosAvailable(knownSkills, tomeId) {
  if (!tomeId) return [];
  return COMBOS.filter((c) => c.tome === tomeId && c.skill.some((s) => knownSkills.includes(s)));
}
