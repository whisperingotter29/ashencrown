// Named NPCs and how they greet you. Greetings bend around your race, class and fate.

export const NAMED = {
  'aurelionsrest:elder': { name: 'Reeve Halden', title: "Reeve of Aurelion's Rest", race: 'human' },
  'emberwell:elder': { name: 'Elder Sarqa', title: 'Keeper of the Flame-Well', race: 'ashborn' },
  'sylvanhold:elder': { name: 'Warden Ilyra', title: 'First Warden of Sylvanhold', race: 'elf' },
  'kharakdun:elder': { name: 'Forgemaster Brann', title: 'Voice of the King Under Snow', race: 'dwarf' },
  'skarrow:elder': { name: 'Shaman Ugra', title: 'Storm-Reader of the Skarrow Clans', race: 'orc' },
  'brinehollow:elder': { name: 'Harbormaster Quill', title: 'Harbormaster of Brinehollow', race: 'tidekin' },
  'effigies:elder': { name: 'Curator Maelis', title: 'Last Curator of the Hall', race: 'stoneborn' },
  'mirewisp:elder': { name: 'Mother Mossbell', title: 'Matron of the Hollow', race: 'fae' },
  'saltfang:elder': { name: 'Packmother Rhessa', title: 'Packmother of Saltfang', race: 'beastkin' },
  'ossuary:elder': { name: 'Brother Hush', title: 'Silent Choir, Keeper of Bones', race: 'revenant', mute: true },
  'cinderspire:elder': { name: 'Keeper Vashti', title: 'Keeper of the Brood', race: 'dragonblood' },
  'riftwatch:elder': { name: 'Warden Corwin', title: 'Captain of the Rim Watch', race: 'human' },
  'riftwatch:seer': { name: 'Seer Omenra', title: 'Who Reads the Maw', race: 'void' },
  'qalsahar:elder': { name: 'Vizier Talun', title: 'Vizier of the Ashen Court', race: 'ashborn' },
  'qalsahar:faction': { name: 'Queen-in-Ash Sefira', title: 'Sovereign of the Ashen Court', race: 'ashborn', faction: 'ashen' },
  'sunhold:elder': { name: 'Chaplain Merren', title: 'Chaplain of the Sunward Order', race: 'human' },
  'sunhold:faction': { name: 'Lord-Commander Aldric', title: 'Lord-Commander of the Sunward Order', race: 'human', faction: 'sunward' },
  'brinehollow:faction': { name: 'Guildmistress Coralie Vane', title: 'Mistress of the Tidebound Guild', race: 'tidekin', faction: 'tidebound' },
  'quietspire:faction': { name: 'The Abbess', title: 'Mother of the Silent Choir', race: 'void', faction: 'choir', mute: true },
  'quietspire:elder': { name: 'Sister Vellum', title: 'Choir Archivist', race: 'elf' },
  'greywater:elder': { name: 'Mayor Tobin Greaves', title: 'Mayor of Greywater', race: 'human' },
  'gullwatch:elder': { name: 'Old Gannet', title: 'Lightkeeper of Gullwatch', race: 'tidekin' },
  'lanternfall:elder': { name: 'Lampwright Durga', title: 'Warden of the Lanterns', race: 'dwarf' },
  'gloomhaven:elder': { name: 'Fence Malric', title: 'Broker of Gloomhaven', race: 'human' },
  'quiethalls:elder': { name: 'Brother Ash', title: 'Silent Choir, Deep Cloister', race: 'revenant', mute: true },
  'quiethalls:faction': { name: 'The Abbess (Deep)', title: 'The Abbess, in her deep retreat', race: 'void', faction: 'choir', mute: true },
};

const FIRST = ['Aldo', 'Bryn', 'Cass', 'Dov', 'Esme', 'Fenn', 'Gael', 'Hale', 'Ines', 'Jory', 'Kael', 'Lark', 'Mara', 'Nils', 'Orla', 'Pell', 'Quin', 'Rook', 'Sela', 'Tamsin', 'Ulric', 'Vesna', 'Wren', 'Yara', 'Zev', 'Ashk', 'Borka', 'Corvin', 'Dagny', 'Eskil'];
const LAST = ['Ashby', 'Brask', 'Corrow', 'Dunmere', 'Emberly', 'Fallow', 'Greyhand', 'Holt', 'Ironside', 'Juniper', 'Kettle', 'Lowe', 'Marsh', 'Nettle', 'Oakes', 'Pike', 'Quarry', 'Rusk', 'Saltry', 'Thorne', 'Umber', 'Vane', 'Wick', 'Yarrow'];
export function genName(seed) {
  return FIRST[seed % FIRST.length] + ' ' + LAST[Math.floor(seed / 7) % LAST.length];
}

export const ROLE_TITLES = {
  merchant: 'Merchant', blacksmith: 'Blacksmith', enchanter: 'Enchanter', innkeeper: 'Innkeeper', quest: 'Notice Board',
  stable: 'Stablemaster', bounty: 'Bounty Officer', guard: 'Guard', trainer: 'Trainer', tome: 'Tome Master', faction: 'Faction Master', elder: 'Elder',
};

// Greeting lines. {name} = player name, {race}/{class} = names.
const RACE_GREET = {
  human: ['Another child of the old empire. Welcome, {name}.', 'You have that Aurelion stubbornness about you.'],
  ashborn: ['Your embers burn bright today, {name}.', 'Ashborn. Keep that heat away from my stall.'],
  elf: ['An elf, this far from the boughs? The Reach must be stirring.', 'Your kind remembers the founding. Do you remember the fall?'],
  dwarf: ['Kharak Dun opened its gates and sent us you? Good stock.', 'A dwarf! Mind the doorframe. No, wait, you\'re fine.'],
  orc: ['Storm-rider. You smell of lightning.', 'An orc of the Skarrow clans. Do not break anything.'],
  tidekin: ['You\'re dripping on my floor, Tidekin.', 'The sea sends its children ashore. Salt and welcome.'],
  stoneborn: ['A walking statue. I heard they woke. I didn\'t believe it.', 'Your marble is cracked, effigy. Does it hurt?'],
  fae: ['Do not make me any promises, Fae-touched. I will not make you any.', 'You shimmer when you move. Stop that.'],
  beastkin: ['Beastkin. Keep your tail out of the wares.', 'Pack-blood. The coast breeds them fierce.'],
  revenant: ['...You\'re dead. You\'re walking around and you\'re dead.', 'The Choir says your kind saw the other side. Don\'t tell me about it.'],
  dragonblood: ['Horns like that, you must be from the Spire.', 'Dragonblood! My grandmother said your kind could fly.'],
  void: ['Void-marked. The marks... they\'re moving.', 'Don\'t look at me with those eyes. Please.'],
};
const CLASS_GREET = {
  knight: 'A knight\'s bearing. The roads need more like you.',
  berserker: 'Easy, berserker. No one here wants a fight.',
  ranger: 'Ranger. Seen anything interesting out in the wilds?',
  assassin: 'I didn\'t hear you come in. I don\'t like that.',
  pyromancer: 'Pyromancer, mind the thatch.',
  cryomancer: 'It got colder when you walked in. Was that you?',
  cleric: 'A cleric. Bless this house, would you?',
  necromancer: 'Necromancer. Leave the dead in my family alone.',
  bard: 'A bard! Play us something that isn\'t sad.',
  alchemist: 'Alchemist. Is that smell coming from you?',
  warden: 'A Warden of the wilds. You\'re far from the trees.',
  duelist: 'A duelist. Please don\'t challenge anyone in here.',
};
export function greeting(npcSeed, race, cls, name, fate) {
  if (fate && npcSeed % 3 === 0) return fate.greet || `They say the dice marked you as the ${fate.title}. Is it true?`;
  const lines = RACE_GREET[race] || ['Traveller.'];
  if (npcSeed % 2) return CLASS_GREET[cls] || lines[0];
  return lines[npcSeed % lines.length].replace('{name}', name);
}

export const RUMORS = [
  'They say a wyrm made of black glass swims the dunes when the glass storms come.',
  'The Emperor\'s shade walks the Dead Capital at night. Don\'t be there after dark.',
  'Dwarves claim there\'s a titan frozen in the peaks, and that it moves during blizzards.',
  'Fishermen on the coast won\'t sail when the thunder comes. Something big rises with it.',
  'Some shrines only show themselves at night, or in certain weather. Keep your eyes open.',
  'The labyrinths are alive. The walls move when you\'re not looking.',
  'If you find a battlefield, look for relics. The dead still remember how to fight.',
  'The Rot Mother wakes when the spores bloom in the Reach.',
  'A shard of the old crown in each land, and the last one beneath the world. That\'s what the Seer says.',
  'Waystones remember everyone who touches them. Touch one and you can always find your way back.',
  'A duelist called Sabine waits on the Qal\'Sahar road. She\'s never lost.',
  'The Silent Choir took a vow after hearing something sing in the Deep. Nobody knows what it sang.',
  'Glass storms cut you to ribbons out in the open. Find shelter, or wear the right garb.',
  'Pay your bounties. The guards in every town talk to each other.',
  'An orc brute named Grunk Ironhide roams the highlands looking for a fair fight.',
  'There\'s a pale archer in the Reach who only shoots at people who shoot back.',
];
