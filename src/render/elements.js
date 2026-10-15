// Element colours, shared by the pixel VFX (vfx.js) and the GPU magic layer (magic.js).
// ELEM_COLORS: [light, main] pairs used all over the game. PALETTE adds a white-hot core and a
// deep shade for the shader effects.
import { C } from '../px/pix.js';

export const ELEM_COLORS = {
  physical: ['#ffffff', '#c8c0b0'], fire: ['#ffd080', '#ff5010'], frost: ['#f0fcff', '#50b8ff'], lightning: ['#ffffff', '#90a8ff'],
  rot: ['#d0ffa0', '#50b030'], nature: ['#e0ffa0', '#60c030'], void: ['#e8d0ff', '#8030ff'], holy: ['#fffff0', '#ffc840'],
  water: ['#e0ffff', '#30a0e0'], sand: ['#fff0c0', '#e0a040'], blood: ['#ffb0b0', '#c00818'], sound: ['#fff0ff', '#e070f0'], earth: ['#f0e0c0', '#a07040'],
};

const P = (hot, c1, c2, deep) => ({ hot: C(hot), c1: C(c1), c2: C(c2), deep: C(deep) });
export const PALETTE = {
  physical: P('#ffffff', '#fff4dc', '#d0c0a8', '#806850'),
  fire: P('#fff6d8', '#ffc850', '#ff5a10', '#a01800'),
  frost: P('#ffffff', '#a8e6ff', '#3c9cf0', '#1a50c0'),
  lightning: P('#ffffff', '#d8e4ff', '#7c9cff', '#4030c0'),
  void: P('#f4e0ff', '#c070ff', '#7020e0', '#300080'),
  holy: P('#ffffff', '#fff0a0', '#ffb830', '#c07010'),
  rot: P('#f0ffc0', '#a8f060', '#40a020', '#205010'),
  nature: P('#f0ffd0', '#b0f070', '#50b030', '#286018'),
  blood: P('#ffd0d0', '#ff5050', '#c00818', '#600008'),
  water: P('#ffffff', '#a0f0ff', '#2090e0', '#104080'),
  sand: P('#fff8e0', '#ffe090', '#e0a040', '#906020'),
  earth: P('#fff0d0', '#f0c890', '#b07840', '#604020'),
  sound: P('#ffffff', '#ffc0ff', '#e070f0', '#8030a0'),
};

// colour -> element (most callers only pass a colour)
const byColor = new Map();
for (const [el, [a, b]] of Object.entries(ELEM_COLORS)) { if (!byColor.has(b.toLowerCase())) byColor.set(b.toLowerCase(), el); if (!byColor.has(a.toLowerCase())) byColor.set(a.toLowerCase(), el); }
byColor.set('#ffffff', 'physical');
export function elementOf(colorOrEl) {
  if (!colorOrEl) return 'physical';
  if (PALETTE[colorOrEl]) return colorOrEl;
  if (typeof colorOrEl === 'string') return byColor.get(colorOrEl.toLowerCase()) || null;
  return null;
}

// palette for an element, or one derived from an arbitrary colour
const custom = new Map();
export function paletteOf(colorOrEl) {
  const el = elementOf(colorOrEl);
  if (el) return PALETTE[el];
  let p = custom.get(colorOrEl);
  if (p) return p;
  const c = C(colorOrEl);
  const lift = (k, add) => [Math.min(255, c[0] * k + add), Math.min(255, c[1] * k + add), Math.min(255, c[2] * k + add), 255];
  p = { hot: [255, 255, 255, 255], c1: lift(1.15, 60), c2: c, deep: [c[0] * 0.45, c[1] * 0.45, c[2] * 0.5, 255] };
  custom.set(colorOrEl, p);
  return p;
}

export const ELEM_CODE = { physical: 0, fire: 1, frost: 2, lightning: 3, void: 4, holy: 5, rot: 6, nature: 6, blood: 7, water: 8, sand: 9, earth: 9, sound: 10 };
