// Dev-only smoke test (?quick=race,class&smoke=1): fights a pack using every ability and the class signature.
import { G } from '../game.js';
import { spellsForTome } from '../data/tomes.js';

export async function runSmoke(D) {
  const p = G.player, inp = D.input;
  const errs = [];
  const origErr = console.error;
  window.addEventListener('error', (e) => errs.push(String(e.message)));
  console.error = (...a) => { errs.push(a.map(String).join(' ').slice(0, 300)); origErr(...a); };
  const aim = (e) => { const s = D.worldToScreen({ x: e.pos.x, y: e.pos.y + 1, z: e.pos.z }); inp.mouse.x = s.x; inp.mouse.y = s.y; };
  p.pos.x += 40; p.pos.z += 40;
  window.__advance(0.5);
  const foes = [];
  for (let i = 0; i < 6; i++) foes.push(D.spawnEnemy(i % 2 ? 'bandit' : 'ash_scorpion', 3, p.pos.x + 6 + i, p.pos.z + 5));
  const c = G.char;
  if (c.equip.tome) { c.equip.tome.tier = 5; spellsForTome(c.equip.tome.tome, 5).slice(0, 6).forEach((s, i) => { c.skillBar[i] = s.id; }); }
  else ['whirlwind', 'groundslam', 'lunge', 'bladedance', 'shadowstep', 'warcry'].forEach((s, i) => { if (!c.skills.includes(s)) c.skills.push(s); c.skillBar[i] = s; });
  p.refreshStats(true);
  for (let i = 0; i < 120; i++) {
    const f = foes.find((e) => !e.dead) || foes[0];
    aim(f);
    p.mana = p.maxMana; p.stamina = p.maxStamina; p.resource = p.resourceMax; p.hp = p.maxHp;
    for (const k in p.cooldowns) p.cooldowns[k] = 0;
    if (i % 10 === 0) inp.pressed.add('q');
    else if (i % 5 === 0) inp.pressed.add(String(1 + (Math.floor(i / 5) % 6)));
    else if (i % 3 === 0) { inp.mouse.left = true; inp.mousePressed.left = true; } else inp.mouse.left = false;
    window.__advance(0.1);
  }
  inp.mouse.left = false;
  window.__advance(1);
  window.__smoke = { cls: c.cls, race: c.race, kills: c.kills, errs: errs.slice(0, 5), dead: p.dead, minions: p.minions.length };
  return window.__smoke;
}
