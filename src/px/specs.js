// Actor specs from game data: races, enemy templates, NPC roles and mounts.
import { creatureKind } from './sprites/creatures.js';
import { dressLook, weaponSpec } from './gearLook.js';

const HUMAN_SKIN = ['#f0c8a0', '#d8a878', '#b07850', '#8a5a3a', '#e8b890', '#c89070'];
const HUMAN_HAIR = ['#2a1a14', '#5a3a1a', '#8a6a3a', '#1a1414', '#a04a20', '#c8c0b0'];
const hashS = (s) => { let h = 9; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0; return Math.abs(h); };

// race look + appearance indices -> humanoid look
export function raceLook(lk, app = { skin: 0, hair: 0 }, extra = {}) {
  return {
    scale: lk.scale, build: lk.build, skin: lk.skin[app.skin % lk.skin.length], hair: lk.hair[app.hair % lk.hair.length],
    ears: lk.ears, beard: lk.beard, tusks: lk.tusks, horns: lk.horns, fins: lk.fins, wings: lk.wings, beastEars: lk.beastEars, tail: lk.tail,
    eyesGlow: lk.eyesGlow, voidMarks: lk.voidMarks, glowSkin: lk.glowSkin, stone: lk.stone, scales: lk.scales,
    vseed: (app.skin | 0) * 10 + (app.hair | 0),   // picks hair style / eye colour variety
    ...extra,
  };
}

// enemy template -> actor spec
export function enemySpec(tpl, { scale = 1, ilvl = 5, rarity = 'common', seed = 0 } = {}) {
  const [c1, c2, c3] = tpl.colors;
  const s = tpl.size * scale;
  const body = tpl.body || 'humanoid';
  if (body === 'humanoid') {
    const h = hashS(tpl.name || '') + seed;
    const look = {
      build: tpl.size > 1.4 ? 1.3 : 1,
      skin: tpl.human ? HUMAN_SKIN[h % HUMAN_SKIN.length] : c2,
      hair: tpl.skeleton ? null : tpl.human ? (h % 3 ? c1 : HUMAN_HAIR[h % HUMAN_HAIR.length]) : c1,
      shirt: c1, pants: tpl.human ? c2 : c1, bootsColor: '#3a2a20',
      skeleton: !!tpl.skeleton, eyesGlow: tpl.undead || tpl.void ? c3 : null, beard: !!tpl.beard,
      tusks: /Troll/.test(tpl.name || ''), wings: !!tpl.wings, wingColor: c3,
      longHair: /Hag|Witch|Matron|Queen|Siren/.test(tpl.name || ''), crown: tpl.crown ? '#ffd060' : null, vseed: h % 97,
    };
    const dl = dressLook({ gear: tpl.gear, rarity, ilvl, seed: h });
    Object.assign(look, dl.look);
    if (tpl.boss && !look.cape && (tpl.gear === 'plate' || tpl.gear === 'mail')) look.cape = c3 === '#ffffff' ? c1 : '#7a1a1a';
    let weapon = null;
    if (tpl.weapon === 'club') weapon = { type: 'club', color: /Frost/.test(tpl.name) ? '#8a9aa8' : '#6a4a2a' };
    else if (tpl.weapon && tpl.weapon !== 'claws') weapon = weaponSpec({ type: tpl.weapon, material: dl.material, rarity, element: tpl.element && tpl.element !== 'physical' ? tpl.element : null });
    return { type: 'human', look, weapon, scale: s };
  }
  if (body === 'golem') {
    const icy = /Ice|Glass|Crystal|Ymrath/.test(tpl.name || '');
    return { type: 'human', kind: 'golem', scale: s, look: { golem: true, stone: true, build: 1.6, skin: c1, shirt: c1, pants: c2, bootsColor: c2, eyesGlow: c3, core: c3, crystals: icy ? c3 : null, hairStyle: 'bald' } };
  }
  if (body === 'treant') return { type: 'human', kind: 'treant', scale: s, look: { bark: true, build: 1.5, skin: c1, shirt: c1, pants: c1, bootsColor: c1, eyesGlow: c3, canopy: c2, knots: c3, hairStyle: 'bald' } };
  return {
    type: 'creature', scale: s,
    creature: { body, s, c1, c2, c3, kind: creatureKind(tpl), glass: tpl.shell === 'glass', lure: !!tpl.lure, caps: /Fungal|Spore/.test(tpl.name || '') },
  };
}

// mount definition -> creature spec
export function mountSpec(def) {
  const [c1, c2, c3] = def.colors;
  const body = def.body || 'quadruped';
  return { body, s: (def.size || 1.3) * (body === 'dragon' ? 1.15 : 1), c1, c2, c3, kind: body === 'dragon' ? 'dragon' : def.antlers ? 'stag' : 'horse', saddle: def.saddle || '#5a2a1a', tame: true, antlers: !!def.antlers };
}
