// Derived character stats. Keep the math light: five stats, a level curve, and gear.
import { RACE_BY_ID } from '../data/races.js';
import { CLASS_BY_ID } from '../data/classes.js';
import { WEAPON_TYPES, SETS, LEGENDARIES, S } from '../data/items.js';
import { SKILLS, COMBOS } from '../data/skills.js';
import { TOMES } from '../data/tomes.js';

export const MAX_LEVEL = 100;
export function xpToNext(level) { return Math.round(80 * Math.pow(level, 1.35) + 60); }

const UNARMED = { type: 'fists', dmg: 6, speed: 1.2, range: 1.8, arc: 90, stat: 'str', combo: 3 };

export function computeStats(c) {
  const race = RACE_BY_ID[c.race];
  const cls = CLASS_BY_ID[c.cls];
  const st = { str: 0, dex: 0, int: 0, vit: 0, wil: 0 };
  for (const k in st) st[k] = c.stats[k] + (c.bonusStats?.[k] || 0) + (race?.stats[k] || 0) + (c.shrineBoons?.[k] || 0);
  const out = {
    stats: st, armor: 0, armorPct: 0, dmgPct: 0, critChance: 5, critDmg: 50, atkSpeed: 0, moveSpeed: 0, spellPower: 0, spellCrit: 0,
    hpPct: 0, manaPct: 0, lifeOnHit: 0, manaRegen: 0, staminaRegen: 0, cdr: 0, goldFind: 0, magicFind: 0, xpPct: 0,
    fireRes: 0, frostRes: 0, lightningRes: 0, voidRes: 0, rotRes: 0, holyRes: 0, blockPct: 0, regen: 0, bossDmg: 0, fireDmgPct: 0, voidDmgPct: 0,
    block: 0.5, flags: {}, powers: {}, sets: {}, trinketAll: 0,
  };
  const items = Object.entries(c.equip).filter(([, it]) => it);
  for (const [slot, it] of items) {
    if (it.armor) out.armor += it.armor;
    for (const a of it.affixes || []) {
      if (a.id in st) st[a.id] += a.v;
      else out[a.id] = (out[a.id] || 0) + a.v;
    }
    if (it.set) out.sets[it.set] = (out.sets[it.set] || 0) + 1;
    if (it.legendary) {
      const L = LEGENDARIES[it.legendary];
      for (const [k, v] of Object.entries(L.power || {})) {
        if (k === 'allStats') for (const s in st) st[s] += v;
        else if (k in out && typeof out[k] === 'number') out[k] += v;
        else out.powers[k] = v;
      }
    }
    if (slot === 'offhand' && it.kind === 'shield') out.block = it.block;
  }
  // set bonuses
  for (const [setId, n] of Object.entries(out.sets)) {
    const set = SETS[setId];
    for (const [need, b] of Object.entries(set.bonuses)) {
      if (n >= +need) {
        if (b.stats) for (const [k, v] of Object.entries(b.stats)) out[k] = (out[k] || 0) + v;
        if (b.flag) out.flags[b.flag] = true;
      }
    }
  }
  // shrine boons beyond stats
  for (const [k, v] of Object.entries(c.shrineBoons || {})) if (!(k in st)) out[k] = (out[k] || 0) + v;
  // racial traits
  const traits = new Set(race?.traits.map((t) => t.id));
  out.traits = traits;
  if (traits.has('adaptable')) out.xpPct += 10;
  if (traits.has('ember_blood')) out.fireRes += 25;
  if (traits.has('old_blood')) out.rotRes += 15;
  if (traits.has('stoneblood')) { out.armorPct += 10; out.frostRes += 20; }
  if (traits.has('thick_hide')) { out.hpPct += 15; out.lightningRes += 10; }
  if (traits.has('gills')) { out.frostRes += 15; }
  if (traits.has('marble_skin')) out.armorPct += 15;
  if (traits.has('fae_luck')) out.magicFind += 15;
  if (traits.has('swift')) out.moveSpeed += 8;
  if (traits.has('grave_chill')) { out.rotRes += 25; out.frostRes += 25; }
  if (traits.has('draconic_scales')) { out.armorPct += 8; out.fireRes += 15; }
  if (traits.has('abyssal')) out.voidRes += 25;
  if (traits.has('keen_sight')) out.rangedCrit = 8;

  const L = c.level;
  const sL = S(L);
  out.maxHp = Math.round((92 + st.vit * 7) * sL * (1 + out.hpPct / 100) * (c.fateScar ? 0.9 : 1));
  out.maxMana = Math.round((55 + st.int * 5 + st.wil * 2) * (1 + L * 0.03) * (1 + (out.maxManaPct || 0) / 100));
  out.maxStamina = Math.round(100 + st.dex * 0.8 + st.vit * 0.4);
  out.maxHp = Math.round(out.maxHp * (1 + (out.maxHpPct || 0) / 100));
  out.armor = Math.round((out.armor + st.vit * 0.4 * sL) * (1 + out.armorPct / 100));
  out.manaRegen += 1.2 + st.wil * 0.12 + L * 0.03;
  out.staminaRegenMult = 1 + out.staminaRegen / 100 + st.dex * 0.004;
  out.critChance += st.dex * 0.12;
  out.spellPower += st.int * 2.2;
  out.res = {
    fire: Math.min(75, out.fireRes + st.wil * 0.2), frost: Math.min(75, out.frostRes + st.wil * 0.2), lightning: Math.min(75, out.lightningRes + st.wil * 0.2),
    void: Math.min(75, out.voidRes + st.wil * 0.2), rot: Math.min(75, out.rotRes + st.wil * 0.2), nature: Math.min(75, out.rotRes * 0.5 + st.wil * 0.2),
    holy: Math.min(75, out.holyRes + st.wil * 0.2), water: Math.min(75, out.frostRes * 0.5), physical: 0, sand: 0, blood: 0, sound: 0, earth: 0,
  };
  // weapon
  const w = c.equip.mainhand;
  if (w) {
    const wt = WEAPON_TYPES[w.type];
    out.weapon = { ...wt, type: w.type, dmg: w.dmg, element: w.element, item: w, spellPower: w.spellPower || 0 };
    out.spellPower += w.spellPower || 0;
    out.spellCrit += wt.spellCrit || 0;
  } else out.weapon = { ...UNARMED, dmg: Math.round(UNARMED.dmg * sL) };
  const mainStat = st[out.weapon.stat || 'str'];
  out.weaponDmg = out.weapon.dmg * (1 + mainStat * 0.028) * (1 + out.dmgPct / 100);
  out.spellMult = (1 + out.spellPower / 100) * (1 + out.dmgPct / 200);
  out.moveSpeedMult = 1 + out.moveSpeed / 100;
  out.atkSpeedMult = 1 + out.atkSpeed / 100;
  out.hasShield = c.equip.offhand?.kind === 'shield';
  out.twoHanded = out.weapon.hands === 2;
  // tome
  const tome = c.equip.tome;
  out.tome = tome ? { id: tome.tome, tier: tome.tier, item: tome } : null;
  out.spellSlots = tome ? tome.tier + 1 : 0;
  // passives from skills & combos
  out.passives = {};
  for (const sid of c.skills) { const sk = SKILLS[sid]; if (sk?.passive) Object.assign(out.passives, sk.passive); }
  if (tome) for (const cb of COMBOS) if (cb.tome === tome.tome && cb.type === 'passive' && cb.skill.some((s) => c.skills.includes(s))) Object.assign(out.passives, cb.passive);
  out.parryWindow = 0.16 + (out.passives.parryWindow || 0);
  return out;
}

// Damage scaling for spells: base * S(level) * tier bonus * spell power
export function spellDamage(char, derived, spell) {
  const tier = derived.tome?.tier || 1;
  return spell.dmg * S(char.level) * (1 + (tier - 1) * 0.12) * derived.spellMult;
}
