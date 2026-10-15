// Which swing curve (see actor.js) each weapon uses for each step of its combo.
export function attackKindFor(weaponType, combo = 0) {
  switch (weaponType) {
    case 'sword': return ['slash', 'backslash', 'thrust'][combo % 3];
    case 'mace': return ['slash', 'backslash', 'overhead'][combo % 3];
    case 'dagger': return ['stab', 'slash', 'stab', 'backslash'][combo % 4];
    case 'greatsword': return ['sweep', 'overhead', 'sweep'][combo % 3];
    case 'halberd': return ['sweep', 'spearthrust', 'overhead'][combo % 3];
    case 'spear': return ['spearthrust', 'spearthrust', 'sweep'][combo % 3];
    case 'staff': return ['slash', 'cast'][combo % 2];
    case 'wand': return 'cast';
    case 'bow': return 'bowrelease';
    case 'crossbow': return 'xbow';
    case 'claws': return ['claw', 'claw'][combo % 2];
    default: return ['slash', 'backslash'][combo % 2];
  }
}
