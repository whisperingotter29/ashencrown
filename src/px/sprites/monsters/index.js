// Registry of hand-built monster designs (docs/BESTIARY.md). An enemy template with `design: 'id'`
// is drawn by DESIGNS[id] instead of a stock body; its `body` still decides how it moves and fights.
import { buildDesign } from './kit.js';
import wastes, { assign as aWastes } from './wastes.js';
import sunlands, { assign as aSunlands } from './sunlands.js';
import gilded, { assign as aGilded } from './gilded.js';
import verdant, { assign as aVerdant } from './verdant.js';
import wildwood, { assign as aWildwood } from './wildwood.js';
import frost, { assign as aFrost } from './frost.js';
import coast, { assign as aCoast } from './coast.js';
import deep, { assign as aDeep } from './deep.js';
import abyss, { assign as aAbyss } from './abyss.js';

export const REGIONS = { wastes, sunlands, gilded, verdant, wildwood, frost, coast, deep, abyss };
export const DESIGNS = Object.assign({}, ...Object.values(REGIONS));
// enemy id -> { design, name, body? } as proposed by each regional file
export const ASSIGN = { ...aWastes, ...aSunlands, ...aGilded, ...aVerdant, ...aWildwood, ...aFrost, ...aCoast, ...aDeep, ...aAbyss };

export function designSprites(spec) {
  const d = DESIGNS[spec.design];
  return d ? buildDesign(d, spec) : null;
}
