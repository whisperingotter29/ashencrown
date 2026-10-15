// Runtime SFX engine: plays baked buffers through pooled voice strips with per-category rate
// limiting and priority-based voice stealing, then through a glue compressor, a brick-wall-ish
// limiter and a soft clipper so stacking dozens of hits never clips. Music is routed in here too so
// big impacts can duck it.
//
//   strip: BufferSource -> lowpass -> gain -> panner -> group bus
//   group bus -> sfxVol -> glue comp -> limiter        (+ group send -> reverb -> sfxVol)
//   music / ambience ------------------> limiter -> soft clip -> destination
//
// Every play() costs one AudioBufferSourceNode; everything else is created once.
import { RECIPES, bakeAll } from './sfxBank.js';

const dbToLin = (db) => Math.pow(10, db / 20);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// per: max voices that may START within `win` seconds (louder ones steal quieter ones);
// max: max voices of the category sounding at once;
// fatigue: up to this many dB softer while the category is being spammed (keeps long fights from
// turning into a wall of noise, while an isolated hit stays full-size).
export const CATS = {
  swing: { per: 2, win: 0.05, max: 4, fatigue: 4 },
  hit: { per: 3, win: 0.05, max: 8, fatigue: 6 },
  crit: { per: 2, win: 0.07, max: 3, fatigue: 3 },
  sub: { per: 1, win: 0.09, max: 2, fatigue: 4 },
  elem: { per: 3, win: 0.05, max: 8, fatigue: 6 },
  dot: { per: 1, win: 0.12, max: 2, fatigue: 6 },
  kill: { per: 2, win: 0.06, max: 5, fatigue: 4 },
  tick: { per: 3, win: 0.03, max: 6 },
  boom: { per: 2, win: 0.08, max: 4 },
  cast: { per: 3, win: 0.05, max: 6, fatigue: 4 },
  ability: { per: 4, win: 0.05, max: 8 },
  loop: { per: 2, win: 0.05, max: 3 },
  hurt: { per: 1, win: 0.09, max: 2 },
  def: { per: 2, win: 0.06, max: 3 },
  swap: { per: 1, win: 0.08, max: 2 },
  loot: { per: 2, win: 0.06, max: 4 },
  coin: { per: 2, win: 0.05, max: 4 },
  ui: { per: 2, win: 0.03, max: 4 },
  hover: { per: 1, win: 0.045, max: 2 },
  toast: { per: 1, win: 0.25, max: 1 },
  denied: { per: 1, win: 0.35, max: 1 },
  heart: { per: 1, win: 0.3, max: 1 },
  sting: { per: 2, win: 0.1, max: 3 },
  amb: { per: 2, win: 0.1, max: 3 },
  far: { per: 2, win: 0.06, max: 4 },
  step: { per: 1, win: 0.06, max: 2 },
  misc: { per: 3, win: 0.05, max: 6 },
};
for (const c of Object.values(CATS)) c.list = [];

const GROUPS = { world: { n: 28, send: 0.13 }, magic: { n: 18, send: 0.3 }, ui: { n: 10, send: 0.03 } };

export const E = {
  ready: false, ctx: null, sounds: {}, groups: {}, bake: null,
  listener: null,           // () => {x, z} of the listener in world units, for pan / distance
  stats: { plays: 0, drops: 0, steals: 0, groupSteals: 0, missing: 0, maxActive: 0 },
  counts: {},               // plays per sound id (inspection / tests)
  duckState: { t0: 0, v0: 1, t1: 0, v1: 1, t2: 0, t3: 0 },
};

function comp(ctx, thr, ratio, knee, att, rel) {
  const c = ctx.createDynamicsCompressor();
  c.threshold.value = thr; c.ratio.value = ratio; c.knee.value = knee; c.attack.value = att; c.release.value = rel;
  return c;
}
// Web Audio compressors add automatic make-up gain ((1/fullRangeGain)^0.6); undo it so the glue
// stage only ever turns loud things down.
const makeupInv = (thr, ratio) => dbToLin(0.6 * thr * (1 - 1 / ratio));
function gainNode(ctx, v, dst) { const g = ctx.createGain(); g.gain.value = v; if (dst) g.connect(dst); return g; }
function softClipCurve() {
  const n = 4096, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
    c[i] = Math.sign(x) * (a < 0.8 ? a : 0.8 + 0.2 * Math.tanh((a - 0.8) / 0.2));
  }
  return c;
}
function impulse(ctx, seconds, decay) {
  const sr = ctx.sampleRate, len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const k = 0.15 + 0.8 * Math.exp(-t * 3);           // tail gets darker
      lp += (Math.random() * 2 - 1 - lp) * k;
      d[i] = lp * Math.pow(1 - i / len, decay) * (t < 0.012 ? t / 0.012 : 1);
    }
  }
  return buf;
}

export function initEngine(ctx) {
  E.ctx = ctx;
  const clip = ctx.createWaveShaper(); clip.curve = softClipCurve(); clip.connect(ctx.destination);
  const lim = comp(ctx, -3, 20, 0, 0.002, 0.12);
  E.limPost = gainNode(ctx, makeupInv(-3, 20), clip); lim.connect(E.limPost);
  E.limIn = gainNode(ctx, 1, lim);
  const glue = comp(ctx, -15, 3, 8, 0.004, 0.16);
  glue.connect(gainNode(ctx, makeupInv(-15, 3), E.limIn));
  E.sfxVol = gainNode(ctx, 1, glue);
  E.verbIn = gainNode(ctx, 1);
  const conv = ctx.createConvolver(); conv.normalize = true; conv.buffer = impulse(ctx, 1.4, 3);
  E.verbIn.connect(conv); conv.connect(gainNode(ctx, 0.7, E.sfxVol));
  E.musicIn = gainNode(ctx, 1, E.limIn);
  E.ambIn = gainNode(ctx, 1, E.limIn);
  E.glue = glue; E.lim = lim;
  for (const [k, gd] of Object.entries(GROUPS)) {
    const bus = gainNode(ctx, 1, E.sfxVol);
    bus.connect(gainNode(ctx, gd.send, E.verbIn));
    const strips = [];
    for (let i = 0; i < gd.n; i++) {
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 20000; f.Q.value = 0;
      const g = gainNode(ctx, 0);
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      f.connect(g);
      if (p) { g.connect(p); p.connect(bus); } else g.connect(bus);
      strips.push({ f, g, p, v: null, busy: 0 });
    }
    E.groups[k] = { bus, strips };
  }
  // sound table (buffers arrive as they bake)
  for (const r of RECIPES) E.sounds[r.id] = { ...r, bufs: [], meta: [], last: -1 };
  E.ready = true;
  E.bake = bakeAll((rec, res) => {
    const S = E.sounds[rec.id];
    S.bufs = res.map((x) => x.buf); S.meta = res.map((x) => ({ peak: x.peak, rms: x.rms, dur: x.buf.duration }));
  }, { baseSr: 32000 }).then((s) => { E.bakeStats = s; return s; });
}

export function setSfxVolume(lin) { if (E.ready) E.sfxVol.gain.setTargetAtTime(lin, E.ctx.currentTime, 0.03); }
export const now = () => (E.ctx ? E.ctx.currentTime : 0);
export const has = (id) => !!E.sounds[id]?.bufs.length;

function remain(v, t) { return v.end > 1e8 ? 1 : clamp((v.end - t) / Math.max(0.05, v.end - v.t0), 0, 1); }

// Fade a voice out quickly (used for stealing and stopping loops)
export function release(v, at, fade = 0.012) {
  if (!v || v.dead) return;
  const t = Math.max(at ?? E.ctx.currentTime, E.ctx.currentTime);
  v.dead = true;
  const own = v.st.v === v;
  try {
    if (own) {
      const g = v.st.g.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(v.cur(t), t);
      g.linearRampToValueAtTime(0, t + fade);
    }
    v.src.stop(t + fade + 0.002);
  } catch (e) { /* already stopped */ }
  v.end = Math.min(v.end, t + fade);
  if (own) v.st.busy = t + fade + 0.001;
}

/**
 * play(id, opts) -> voice | null
 * opts: vol (dB), semis, rate, lp (Hz), pan, x/z (world pos: pan + distance attenuation),
 *       delay (s) or at (ctx time), cat, group, prio (multiplier), loop, fadeIn, variant
 */
export function play(id, o = {}) {
  if (!E.ready) return null;
  const S = E.sounds[id];
  if (!S || !S.bufs.length) { E.stats.missing++; return null; }
  const ctx = E.ctx, tn = ctx.currentTime;
  const t = Math.max(tn + 0.005, o.at ?? tn + 0.005 + (o.delay || 0));
  let db = (S.vol || 0) + (o.vol || 0) + (Math.random() * 2 - 1) * 0.8;
  let pan = o.pan || 0;
  if (o.x != null && E.listener) {
    const L = E.listener();
    if (L) {
      const dx = o.x - L.x, dz = o.z - L.z;
      pan = clamp(dx / 16, -0.75, 0.75);
      const d = Math.hypot(dx, dz);
      if (d > 10) db -= Math.min(30, (d - 10) * 0.75);
    }
  }
  if (db < -55) { E.stats.drops++; return null; }
  const ck = o.cat || S.cat || 'misc';
  const C = CATS[ck] || CATS.misc;
  if (C.fatigue) {
    C.fc = (C.fc || 0) * Math.exp(-(tn - (C.ft || 0)) / 0.6); C.ft = tn;   // decaying count of recent starts
    db -= Math.min(C.fatigue, Math.log2(1 + C.fc / 3) * 2) * ((o.prio || 1) >= 2 ? 0.5 : 1);
  }
  const lin = dbToLin(db);
  const prio = lin * (o.prio || 1);
  const list = C.list;
  for (let i = list.length - 1; i >= 0; i--) if (list[i].dead || list[i].end <= tn) list.splice(i, 1);
  // burst limit: only `per` starts per window; a louder sound replaces the weakest recent one
  let n = 0, weak = null;
  for (const v of list) if (Math.abs(t - v.t0) < C.win) { n++; if (!weak || v.prio < weak.prio) weak = v; }
  if (n >= C.per) {
    if (weak && prio > weak.prio * 1.25) { release(weak, t, 0.01); E.stats.steals++; }
    else { E.stats.drops++; return null; }
  }
  // concurrency limit: steal the voice with the least left to give
  if (list.filter((v) => !v.dead).length >= C.max) {
    let w = null, ws = Infinity;
    for (const v of list) { if (v.dead) continue; const s = v.prio * remain(v, tn); if (s < ws) { ws = s; w = v; } }
    if (w && ws < prio * 1.5) { release(w, t, 0.02); E.stats.steals++; } else { E.stats.drops++; return null; }
  }
  // strip from the group pool
  const grp = E.groups[o.group || S.group || 'world'];
  let st = null;
  for (const s of grp.strips) if (!s.v || s.v.dead ? s.busy <= t : s.v.end <= t) { st = s; break; }
  if (!st) {
    let ws = Infinity;
    for (const s of grp.strips) { const v = s.v; const sc = v && !v.dead ? v.prio * remain(v, tn) : -1; if (sc < ws) { ws = sc; st = s; } }
    if (!st || ws > prio * 2) { E.stats.drops++; return null; }
    if (st.v && !st.v.dead) { release(st.v, t, 0.006); E.stats.groupSteals++; }
  }
  const ts = Math.max(t, st.busy || 0);
  // variant (never the same one twice in a row), pitch and tone variation
  const nb = S.bufs.length;
  let vi = o.variant ?? Math.floor(Math.random() * nb);
  if (o.variant == null && nb > 1 && vi === S.last) vi = (vi + 1) % nb;
  S.last = vi;
  const buf = S.bufs[vi % nb];
  const semis = (o.semis || 0) + (S.vary || 0) * (Math.random() * 2 - 1);
  const rate = clamp((o.rate || 1) * Math.pow(2, semis / 12), 0.25, 4);
  const lp = o.lp || (S.lpVar ? 18000 * Math.pow(2, -Math.random() * S.lpVar) : 20000);
  const src = ctx.createBufferSource();
  src.buffer = buf; src.playbackRate.value = rate; if (o.loop) src.loop = true;
  const g = st.g.gain;
  g.cancelScheduledValues(ts);
  const fadeIn = o.fadeIn || 0;
  if (fadeIn) { g.setValueAtTime(0, ts); g.linearRampToValueAtTime(lin, ts + fadeIn); } else g.setValueAtTime(lin, ts);
  st.f.frequency.setValueAtTime(Math.min(lp, ctx.sampleRate * 0.45), ts);
  if (st.p) st.p.pan.setValueAtTime(pan, ts);
  src.connect(st.f);
  src.start(ts);
  const v = { id, st, src, t0: ts, end: o.loop ? 1e9 : ts + buf.duration / rate, prio, lin, dead: false, cur: (tt) => (fadeIn && tt < ts + fadeIn ? lin * clamp((tt - ts) / fadeIn, 0, 1) : lin) };
  src.onended = () => { try { src.disconnect(); } catch (e) { /* gone */ } };
  st.v = v; st.busy = v.end;
  list.push(v);
  if (C.fatigue) C.fc += 1;
  E.stats.plays++;
  E.counts[id] = (E.counts[id] || 0) + 1;
  return v;
}

export function stop(v, fade = 0.08) { if (v && !v.dead) release(v, E.ctx.currentTime, fade); }

// Music ducking: dip the music bus by `db`, hold, then recover. Overlapping requests keep the deepest.
export function duck(db = 6, hold = 0.15, rel = 0.6, delay = 0) {
  if (!E.ready) return;
  const ctx = E.ctx, t = ctx.currentTime + delay, D = E.duckState;
  const cur = duckValue(t);
  const target = dbToLin(-db);
  const endHold = t + 0.03 + hold;
  if (target >= cur && endHold <= D.t2) return;              // a deeper duck is already holding
  const tv = Math.min(target, cur);
  const g = E.musicIn.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(cur, t);
  g.linearRampToValueAtTime(tv, t + 0.03);
  g.setValueAtTime(tv, endHold);
  g.linearRampToValueAtTime(1, endHold + rel);
  Object.assign(D, { t0: t, v0: cur, t1: t + 0.03, v1: tv, t2: endHold, t3: endHold + rel });
}
function duckValue(t) {
  const D = E.duckState;
  if (t >= D.t3) return 1;
  if (t >= D.t2) return D.v1 + (1 - D.v1) * ((t - D.t2) / Math.max(1e-3, D.t3 - D.t2));
  if (t >= D.t1) return D.v1;
  if (t >= D.t0) return D.v0 + (D.v1 - D.v0) * ((t - D.t0) / Math.max(1e-3, D.t1 - D.t0));
  return 1;
}

export function activeVoices() {
  const tn = E.ctx ? E.ctx.currentTime : 0;
  let n = 0;
  for (const g of Object.values(E.groups)) for (const s of g.strips) if (s.v && !s.v.dead && s.v.end > tn) n++;
  if (n > E.stats.maxActive) E.stats.maxActive = n;
  return n;
}
