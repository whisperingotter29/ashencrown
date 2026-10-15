// localStorage saves: three slots plus settings.
import { G, CHAR_VERSION } from '../game.js';

const KEY = 'ashencrown.save.';
const SETTINGS = 'ashencrown.settings';

export function saveGame(slot = 0) {
  if (!G.char) return false;
  try {
    const c = G.char;
    if (G.player) c.pos = { x: G.player.pos.x, z: G.player.pos.z, realm: G.realm === 'dungeon' ? (G.dungeon?.returnRealm || 'surface') : G.realm, inDungeon: G.realm === 'dungeon' ? G.dungeon?.def.id : null, rx: G.dungeon?.returnPos?.x, rz: G.dungeon?.returnPos?.z };
    const data = JSON.stringify({ v: CHAR_VERSION, savedAt: Date.now(), char: c });
    localStorage.setItem(KEY + slot, data);
    return true;
  } catch (e) {
    console.warn('save failed', e);
    return false;
  }
}

export function loadGame(slot = 0) {
  try {
    const raw = localStorage.getItem(KEY + slot);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d.char;
  } catch (e) {
    return null;
  }
}

export function saveInfo(slot = 0) {
  try {
    const raw = localStorage.getItem(KEY + slot);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return { savedAt: d.savedAt, name: d.char.name, race: d.char.race, cls: d.char.cls, level: d.char.level };
  } catch (e) { return null; }
}

export function deleteSave(slot = 0) {
  try { localStorage.removeItem(KEY + slot); } catch (e) { /* ignore */ }
}

export function saveSettings() {
  try { localStorage.setItem(SETTINGS, JSON.stringify(G.settings)); } catch (e) { /* ignore */ }
}
export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS);
    if (raw) Object.assign(G.settings, JSON.parse(raw));
  } catch (e) { /* ignore */ }
}
