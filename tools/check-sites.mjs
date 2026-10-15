// Headless check: builds every town, waystone, dungeon entrance, shrine, relic, gate and landmark as pixel sprites,
// printing the drawable count of each town and landmark. Run: npm run check
const P = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : P()), apply: () => P(), set: () => true });
globalThis.window = globalThis; globalThis.devicePixelRatio = 1; globalThis.innerWidth = 800; globalThis.innerHeight = 600;
globalThis.addEventListener = () => {};
globalThis.document = { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => P(), addEventListener() {} }), getElementById: () => null, body: { appendChild() {} } };

const V = await import('../src/render/vfx.js'); try { V.initVfx(); } catch (e) { console.log('initVfx failed', e.message); }
const { G } = await import('../src/game.js');
G.realm = 'surface'; G.interactables = []; G.time = 0;
const S = await import('../src/world/structures.js');
S.initStructures();
const { sites } = await import('../src/world/structures.js');
let ok = 0, fail = 0; const kinds = {};
for (const s of sites) {
  G.realm = s.realm;
  try { S.updateStructures(1, s.x, s.z, s.realm); if (S.siteBuilt(s.id)) { ok++; kinds[s.kind] = (kinds[s.kind] || 0) + 1; if (s.kind === 'landmark' || s.kind === 'town') console.log(s.kind.padEnd(9), s.id.padEnd(18), S.siteBuilt(s.id).objs.length + ' sprites'); } else { console.log('not built', s.kind, s.id); } }
  catch (e) { fail++; console.log('FAIL', s.kind, s.id, e.message, (e.stack || '').split('\n')[1]); }
  S.rebuildAll();
}
console.log('built', ok, 'failed', fail, JSON.stringify(kinds));
