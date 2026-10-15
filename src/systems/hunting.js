// Hunting grounds: every "kill N of X" objective gets a fixed spot outside the quest-giver's town
// where its targets gather, so quest markers can point somewhere real (see spawner + quests).
import { TOWNS, DEEP_TOWNS } from '../data/world.js';
import { heightAt, waterAt } from '../world/terrainGen.js';
import { hashStr } from '../core/rng.js';

const cache = new Map();

function dry(x, z, realm) {
  const h = heightAt(x, z, realm);
  if (h < waterAt(x, z, realm).level + 0.6) return false;
  // reasonably flat so a pack can stand there
  for (const [dx, dz] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) if (Math.abs(heightAt(x + dx, z + dz, realm) - h) > 2.2) return false;
  return true;
}

// questId + objective index -> { x, z, realm, r } or null
export function huntingGround(questId, objIndex, def) {
  const key = questId + ':' + objIndex;
  if (cache.has(key)) return cache.get(key);
  const townId = (def.giver || '').split(':')[0];
  const town = TOWNS.find((t) => t.id === townId) || DEEP_TOWNS.find((t) => t.id === townId);
  let spot = null;
  if (town) {
    const realm = DEEP_TOWNS.includes(town) ? 'deep' : 'surface';
    const a0 = (hashStr(key) % 360) * Math.PI / 180;
    for (let ring = 0; ring < 3 && !spot; ring++) {
      const r = town.r + 38 + ring * 16;
      for (let k = 0; k < 16; k++) {
        const a = a0 + k * (Math.PI * 2 / 16);
        const x = town.x + Math.cos(a) * r, z = town.z + Math.sin(a) * r;
        if (dry(x, z, realm)) { spot = { x, z, realm, r: 9 }; break; }
      }
    }
  }
  cache.set(key, spot);
  return spot;
}
