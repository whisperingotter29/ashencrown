// Draw registries for the pixel renderer.
// Drawables: { sortZ, draw(ctx), emissive?(ctx), glow?(gctx), bounds?(), occlude?, decal? }
export const scene = {
  ground: null,            // (ctx) => void : terrain chunks or dungeon tiles
  groundEmissive: null,    // (ctx) => void : lava / glowing water drawn after lighting
  objects: new Set(),      // persistent drawables (structures, dungeon props, pickups, projectiles)
  providers: new Set(),    // (out) => void : push extra drawables each frame (terrain props, entities)
  decals: [],              // per-frame ground decals: (ctx) => void
  pixels: [],              // per-frame pixel particles: (ctx) => void (after sprites)
  glows: [],               // per-frame additive glows on the full-res layer: (gctx) => void
  emissives: [],           // per-frame emissive pixels drawn after lighting: (ctx) => void
  screen: [],              // per-frame screen-space overlays on the low-res buffer (weather)
  // persistent hooks that run every frame alongside the per-frame lists above
  persist: { decals: [], pixels: [], emissives: [], glows: [], screen: [] },
  background: '#0c0a0e',
};

export function addObject(o) { scene.objects.add(o); return o; }
export function removeObject(o) { if (o) scene.objects.delete(o); }
export function clearObjects(pred) { for (const o of [...scene.objects]) if (!pred || pred(o)) scene.objects.delete(o); }
