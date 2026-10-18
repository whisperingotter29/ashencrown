// Saves: three slots plus settings. In a browser they live in localStorage; in the desktop app
// they are files in the user's app-data folder (see desktop/main.cjs), which Steam Cloud can sync.
import { G, CHAR_VERSION } from '../game.js';
import { desktop } from './desktop.js';

const store = desktop ? desktop.store : {
  get: (k) => localStorage.getItem(k),
  set: (k, v) => localStorage.setItem(k, v),
  remove: (k) => localStorage.removeItem(k),
};

const KEY = 'ashencrown.save.';
const SETTINGS = 'ashencrown.settings';

export function saveGame(slot = 0) {
  if (!G.char) return false;
  try {
    const c = G.char;
    if (G.player) c.pos = { x: G.player.pos.x, z: G.player.pos.z, realm: G.realm === 'dungeon' ? (G.dungeon?.returnRealm || 'surface') : G.realm, inDungeon: G.realm === 'dungeon' ? G.dungeon?.def.id : null, rx: G.dungeon?.returnPos?.x, rz: G.dungeon?.returnPos?.z };
    const data = JSON.stringify({ v: CHAR_VERSION, savedAt: Date.now(), char: c });
    if (store.set(KEY + slot, data) === false) throw new Error('could not write the save file');
    return true;
  } catch (e) {
    console.warn('save failed', e);
    return false;
  }
}

export function loadGame(slot = 0) {
  try {
    const raw = store.get(KEY + slot);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d.char;
  } catch (e) {
    return null;
  }
}

export function saveInfo(slot = 0) {
  try {
    const raw = store.get(KEY + slot);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return { savedAt: d.savedAt, name: d.char.name, race: d.char.race, cls: d.char.cls, level: d.char.level };
  } catch (e) { return null; }
}

export function deleteSave(slot = 0) {
  try { store.remove(KEY + slot); } catch (e) { /* ignore */ }
}

export function saveSettings() {
  try { store.set(SETTINGS, JSON.stringify(G.settings)); } catch (e) { /* ignore */ }
}
export function loadSettings() {
  try {
    const raw = store.get(SETTINGS);
    if (raw) Object.assign(G.settings, JSON.parse(raw));
  } catch (e) { /* ignore */ }
}
