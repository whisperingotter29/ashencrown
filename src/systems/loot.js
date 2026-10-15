// Loot drops in the world: gold, materials, items with rarity beams; chests.
import { G } from '../game.js';
import { glowPx } from '../render/renderer.js';
import { addObject, removeObject } from '../px/scene.js';
import { view } from '../px/view.js';
import { PPU, bayer, C } from '../px/pix.js';
import { pickupSprite } from '../px/sprites/items.js';
import { RNG, rand, chance } from '../core/rng.js';
import { rollLoot, RARITY, makeTome, makeLegendary, makeSetPiece, materialDropsFor, MATERIALS_LIST, CONSUMABLES, S } from '../data/items.js';
import { TOMES } from '../data/tomes.js';
import { addItem, addGold, addMaterial, addConsumable, classPrefer } from './inventory.js';
import { burst, particle, floatText, flash, ring } from '../render/vfx.js';
import { bus } from '../core/events.js';
import { groundHeight } from '../world/terrain.js';
import { primaryBiome } from '../world/terrainGen.js';

const lootRng = new RNG(Date.now() & 0xffff);

function groundY(x, z) { return G.realm === 'dungeon' ? 0 : groundHeight(x, z); }

export function spawnPickup(kind, x, z, data) {
  const y = groundY(x, z);
  let color = '#ffd060';
  if (kind === 'item') color = RARITY[data.rarity].color;
  else if (kind !== 'gold') color = MATERIALS_LIST[data.id]?.color || CONSUMABLES[data.id]?.color || '#ffffff';
  const pk = { kind, data, x, z, y, t: 0, vy: 4 + Math.random() * 2, h: 0.6, color };
  pk.g = addObject(pickupDrawable(pk));
  G.pickups.push(pk);
  if (kind === 'item' && RARITY[data.rarity].index >= 3) { bus.emit('rareDrop', data); flash(x, y + 2, z, color, 20, 10, 1); }
  return pk;
}

// Pixel pickup: the item's sprite bobbing over a little shadow, with a dithered rarity beam
function pickupDrawable(pk) {
  const spr = pickupSprite(pk.kind, pk.data);
  const ri = pk.kind === 'item' ? RARITY[pk.data.rarity].index : -1;
  const rc = C(pk.color);
  const place = () => {
    const bob = pk.t > 0.6 ? Math.round(Math.sin(pk.t * 3) * 1.2) : 0;
    return [Math.round(pk.x * PPU - view.x0), Math.round(pk.z * PPU - view.y0), Math.round(Math.max(0, pk.h) * PPU) + 2 - bob];
  };
  return {
    sortZ: pk.z, pk,
    shadow(ctx) { const [x, y] = place(); ctx.fillStyle = 'rgba(10,6,12,0.32)'; ctx.fillRect(x - 3, y, 7, 2); ctx.fillRect(x - 2, y - 1, 5, 1); },
    draw(ctx) {
      const [x, y, h] = place();
      ctx.drawImage(spr.pix.canvas(), x - spr.pix.ox, y - h - spr.pix.oy);
      // sparkle glint
      if (Math.floor(pk.t * 2 + pk.x) % 5 === 0) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 2, y - h - spr.pix.oy + 2, 1, 1); }
    },
    emissive(ctx) {
      const [x, y, h] = place();
      if (spr.emis) ctx.drawImage(spr.emis.canvas(), x - spr.emis.ox, y - h - spr.emis.oy);
      if (ri >= 1) {
        // light column: crisp dithered pixels thinning upward
        const H = 14 + ri * 9;
        for (let k = 2; k < H; k++) {
          const a = (1 - k / H) * (0.55 + ri * 0.08);
          for (let dx = -1; dx <= 1; dx++) {
            if (bayer(x + dx, y - k + Math.floor(pk.t * 12)) > a * (dx ? 0.5 : 1)) continue;
            ctx.fillStyle = dx ? pk.color : '#ffffff';
            ctx.globalAlpha = dx ? 0.8 : 0.55;
            ctx.fillRect(x + dx, y - h - k, 1, 1);
          }
        }
        ctx.globalAlpha = 1;
      }
    },
    glow(ctx) {
      const [x, y, h] = place();
      if (ri >= 1) glowPx(ctx, x, y - h - 2, pk.color, 6 + ri * 3, 0.3 + ri * 0.06);
      else if (pk.kind === 'gold') glowPx(ctx, x, y - h - 2, '#ffd060', 5, 0.18);
      void rc;
    },
  };
}

export function dropFromEnemy(e) {
  if (e.ally || e.tpl.ally) return;
  const lvl = Math.max(1, Math.min(100, e.level));
  const p = G.player;
  const mf = p?.derived.magicFind || 0;
  const gf = p?.derived.goldFind || 0;
  const spread = () => [e.pos.x + rand(-1.2, 1.2), e.pos.z + rand(-1.2, 1.2)];
  // gold
  const gold = Math.round((3 + lvl * 1.6) * (e.boss ? 15 : e.elite ? 3 : 1) * rand(0.6, 1.4) * (1 + gf / 100));
  if (chance(e.boss || e.elite ? 1 : 0.55)) spawnPickup('gold', ...spread(), { amount: gold });
  // items
  const nItems = e.boss ? (e.world ? 4 : 2 + (e.tpl.final ? 3 : 0)) : e.elite ? (chance(0.6) ? 1 : 0) + (chance(0.25) ? 1 : 0) : chance(0.1) ? 1 : 0;
  for (let i = 0; i < nItems; i++) {
    const it = rollLoot(lvl, lootRng, { magicFind: mf, minRarity: e.boss ? 2 : e.elite ? 1 : 0, boost: e.boss ? 0.8 : e.elite ? 0.3 : 0, prefer: chance(0.5) ? classPrefer() : null });
    spawnPickup('item', ...spread(), it);
  }
  // tome chance from casters / bosses
  if ((e.boss && chance(0.35)) || (e.tpl.ranged && e.tpl.weapon === 'staff' && chance(0.02))) {
    const tomeIds = Object.keys(TOMES);
    const tier = Math.max(1, Math.min(5, Math.floor(lvl / 20) + 1 + (e.boss ? 1 : 0)));
    spawnPickup('item', ...spread(), makeTome(lootRng.pick(tomeIds), Math.min(5, tier), lvl, 2, lootRng));
  }
  // world boss legendary drops
  const WB_DROPS = { glass_wyrm: 'glassfang', ozymar: 'ozymarseye', emperor_shade: 'lastlight', rot_mother: 'codexrot', ymrath: 'ymrathknuckle', leviathan: 'leviathanrib', crown_herald: 'heraldlantern', gorm_avatar: 'sporeheart', king_vael: 'frostheart', gorm: 'sporeheart' };
  if (e.boss && WB_DROPS[e.tplId] && chance(e.world ? 0.6 : 0.4)) spawnPickup('item', ...spread(), makeLegendary(WB_DROPS[e.tplId], lvl, lootRng));
  // materials
  const biome = G.realm === 'dungeon' ? (G.dungeon?.def.biome || 'gilded') : primaryBiome(e.pos.x, e.pos.z, G.realm);
  const mats = materialDropsFor(null, biome);
  if (chance(e.boss ? 1 : 0.3)) spawnPickup('mat', ...spread(), { id: lootRng.pick(mats), n: e.boss ? 3 : 1 });
  if (e.tpl.shell === 'glass' || e.tplId === 'glass_beetle') if (chance(0.5)) spawnPickup('mat', ...spread(), { id: 'glass', n: 1 });
  if (e.tpl.beast && chance(0.3)) spawnPickup('mat', ...spread(), { id: 'leather', n: 1 });
  if (e.tpl.undead && chance(0.3)) spawnPickup('mat', ...spread(), { id: 'bone', n: 1 });
  if (e.tpl.construct && chance(0.3)) spawnPickup('mat', ...spread(), { id: 'ore', n: 1 });
  if (chance(0.05)) spawnPickup('mat', ...spread(), { id: 'dust', n: 1 });
  if (chance(0.06)) spawnPickup('cons', ...spread(), { id: 'hp_potion', n: 1 });
}

export function openChest(chest) {
  if (chest.opened) return;
  chest.opened = true;
  const lvl = chest.level || G.player.level;
  const p = G.player;
  const n = chest.boss ? 3 + (chest.final ? 3 : 0) : 1 + (chance(0.5) ? 1 : 0);
  burst(chest.x, 1, chest.z, { count: 40, speed: 6, color: '#ffe080', life: 1, up: 1.2 });
  flash(chest.x, 2, chest.z, '#ffd080', 25, 10, 0.8);
  for (let i = 0; i < n; i++) {
    const it = rollLoot(lvl, lootRng, { magicFind: (p.derived.magicFind || 0) + 30, minRarity: chest.boss ? 2 : 1, boost: chest.rarityBoost || 0.3, prefer: chance(0.6) ? classPrefer() : null });
    spawnPickup('item', chest.x + rand(-1.5, 1.5), chest.z + rand(-1.5, 1.5), it);
  }
  spawnPickup('gold', chest.x + rand(-1, 1), chest.z + rand(-1, 1), { amount: Math.round((20 + lvl * 8) * (chest.boss ? 6 : 1)) });
  if (chest.boss) {
    // dungeon-specific rewards
    const d = G.dungeon?.def;
    if (chest.shard) spawnPickup('mat', chest.x, chest.z, { id: 'crown_shard', n: 1, shard: chest.shard });
    if (d && chance(0.5)) {
      const setFor = { cursed_crypt: 'revenant', marble_vault: 'gildedlegion', frozen_citadel: 'frostwarden', bandit_hideout: 'dunewalker', dwarven_deephall: 'deepdelver', pirate_cove: 'tidebound', fungal_warren: 'verdantbough', dragon_lair: 'dragonscale', buried_colossus: 'dunewalker', sunken_temple: 'tidebound', void_rift: 'choir', glass_cavern: 'dunewalker', living_labyrinth: 'verdantbough', beast_den: 'stormbreaker' }[d.theme];
      if (setFor) spawnPickup('item', chest.x + 1, chest.z - 1, makeSetPiece(setFor, lootRng.pick(['helm', 'chest', 'gloves', 'legs', 'boots']), lvl, lootRng));
    }
    if (chance(0.45)) {
      const tomeIds = Object.keys(TOMES);
      const tier = Math.max(1, Math.min(5, Math.floor(lvl / 20) + 2));
      spawnPickup('item', chest.x - 1, chest.z + 1, makeTome(lootRng.pick(tomeIds), tier, lvl, 2, lootRng));
    }
    spawnPickup('cons', chest.x, chest.z + 1.5, { id: 'hp_potion', n: 3 });
  }
  bus.emit('chestOpened', chest);
}

export function updatePickups(dt) {
  const p = G.player;
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const pk = G.pickups[i];
    pk.t += dt;
    // pop out
    if (pk.t < 0.6) { pk.h += pk.vy * dt; pk.vy -= 14 * dt; if (pk.h < 0) { pk.h = 0; pk.vy *= -0.3; } }
    if (pk.kind === 'item' && RARITY[pk.data.rarity].index >= 2 && Math.random() < dt * 6) particle({ x: pk.x, y: pk.y + 0.5, z: pk.z, vx: (Math.random() - 0.5) * 0.6, vy: 1.5, vz: (Math.random() - 0.5) * 0.6, life: 1, size: 0.18, color: pk.color });
    if (!p || p.dead) continue;
    const d = Math.hypot(p.pos.x - pk.x, p.pos.z - pk.z);
    const magnet = pk.kind === 'gold' || pk.kind === 'mat' || pk.kind === 'cons' ? 4 : 1.6;
    if (pk.t > 0.5 && d < magnet) {
      let taken = true;
      if (pk.kind === 'gold') { addGold(pk.data.amount); floatText(pk.x, pk.y + 1, pk.z, `+${pk.data.amount} gold`, { color: '#ffd060', force: true }); }
      else if (pk.kind === 'mat') { addMaterial(pk.data.id, pk.data.n || 1); floatText(pk.x, pk.y + 1, pk.z, `+${pk.data.n || 1} ${MATERIALS_LIST[pk.data.id].name}`, { color: MATERIALS_LIST[pk.data.id].color, force: true }); if (pk.data.shard) bus.emit('crownShard', pk.data.shard); }
      else if (pk.kind === 'cons') { addConsumable(pk.data.id, pk.data.n || 1); floatText(pk.x, pk.y + 1, pk.z, `+${CONSUMABLES[pk.data.id].name}`, { color: CONSUMABLES[pk.data.id].color, force: true }); }
      else taken = addItem(pk.data);
      if (taken) {
        removeObject(pk.g);
        G.pickups.splice(i, 1);
        bus.emit('pickup', pk);
      }
    }
    if (pk.t > 300) { removeObject(pk.g); G.pickups.splice(i, 1); }
  }
}

export function clearPickups() {
  for (const pk of G.pickups) removeObject(pk.g);
  G.pickups.length = 0;
}
