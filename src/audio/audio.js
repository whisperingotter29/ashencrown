// Generative score and ambience (Tone.js), plus the wiring for the procedural SFX engine
// (sfxBank.js: baked recipes, sfxEngine.js: voices / limiting / ducking, sfxEvents.js: game hooks).
import * as Tone from 'tone';
import { G } from '../game.js';
import { bus } from '../core/events.js';
import { E, initEngine, play, stop, duck, setSfxVolume, activeVoices, CATS } from './sfxEngine.js';
import { hookSfxEvents, sfxTick } from './sfxEvents.js';

const A = { ready: false, music: null, themes: {}, current: null, ambience: {}, intensity: 0, initP: null };

const NOTE = (m) => Tone.Frequency(m, 'midi').toNote();
const SCALES = {
  wastes: { root: 50, steps: [0, 1, 4, 5, 7, 8, 10], step: 0.42, lead: 'pluck', pad: 'am', drum: 'frame', mood: 0.6 },
  gilded: { root: 57, steps: [0, 2, 3, 5, 7, 9, 10], step: 0.5, lead: 'bell', pad: 'strings', drum: null, mood: 0.45 },
  verdant: { root: 55, steps: [0, 2, 4, 6, 7, 9, 11], step: 0.42, lead: 'flute', pad: 'am', drum: null, mood: 0.55 },
  frost: { root: 52, steps: [0, 2, 3, 5, 7, 8, 10], step: 0.56, lead: 'celesta', pad: 'choir', drum: null, mood: 0.35 },
  coast: { root: 50, steps: [0, 2, 3, 5, 7, 9, 10], step: 0.46, lead: 'pluck', pad: 'strings', drum: 'frame', mood: 0.5 },
  maw: { root: 48, steps: [0, 1, 3, 5, 6, 8, 10], step: 0.62, lead: 'bell', pad: 'fm', drum: null, mood: 0.3 },
  deep: { root: 47, steps: [0, 1, 3, 5, 6, 8, 10], step: 0.6, lead: 'celesta', pad: 'fm', drum: null, mood: 0.3 },
  dungeon: { root: 45, steps: [0, 1, 3, 5, 7, 8, 10], step: 0.5, lead: 'pluck', pad: 'fm', drum: 'heart', mood: 0.3 },
  title: { root: 50, steps: [0, 2, 3, 5, 7, 8, 10], step: 0.6, lead: 'bell', pad: 'choir', drum: 'taiko', mood: 0.4 },
  boss: { root: 45, steps: [0, 1, 3, 5, 7, 8, 10], step: 0.25, lead: 'brass', pad: 'strings', drum: 'taiko', mood: 1 },
};
const CHORDS = [[0, 2, 4], [5, 0, 2], [3, 5, 0], [4, 6, 1], [0, 2, 4], [6, 1, 3]];

// Builds the whole audio graph right away (sound baking runs in the background) and resolves once
// the context is running, or shortly after if the browser is still waiting for a user gesture.
export function initAudio() {
  if (A.initP) return A.initP;
  A.initP = new Promise((resolve) => {
    try {
      useNativeContext();
      const ctx = Tone.getContext();
      ctx.lookAhead = 0.08;
      initEngine(ctx.rawContext);
      const verb = new Tone.Reverb({ decay: 7, wet: 0.42, preDelay: 0.03 }).connect(E.musicIn);
      A.music = new Tone.Volume(-6).connect(verb);
      A.sfxDry = new Tone.Volume(-4).connect(E.ambIn);
      buildAmbience();
      applyVolume();
      A.ready = true;
      hookSfxEvents();
      bus.on('volume', applyVolume);
      setInterval(tick, 40);
      resumeOnGesture();
      if (typeof window !== 'undefined') window.__sfx = debugApi();
    } catch (e) {
      console.warn('[audio] init failed', e);
      resolve();
      return;
    }
    const started = Tone.start().catch(() => {});
    Promise.race([started, new Promise((r) => setTimeout(r, 400))]).then(() => resolve());
  });
  return A.initP;
}

// Run Tone (and the SFX engine) on a plain AudioContext: native nodes are ~10x cheaper to create
// than the standardized-audio-context wrappers, which matters when every hit spawns a source node.
function useNativeContext() {
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return;
  try { Tone.setContext(new AC({ latencyHint: 'interactive' }), true); } catch (e) { /* keep Tone's default context */ }
}

function resumeOnGesture() {
  if (typeof document === 'undefined') return;
  const kick = () => {
    if (Tone.getContext().state === 'running') { document.removeEventListener('pointerdown', kick, true); document.removeEventListener('keydown', kick, true); return; }
    Tone.start().catch(() => {});
  };
  document.addEventListener('pointerdown', kick, true);
  document.addEventListener('keydown', kick, true);
}

export function applyVolume() {
  if (!A.music) return;
  const m = G.settings.music, s = G.settings.sfx;
  A.music.volume.rampTo(m <= 0.001 ? -80 : -24 + m * 20, 0.3);
  A.sfxDry.volume.rampTo(s <= 0.001 ? -80 : -22 + s * 20, 0.1);
  setSfxVolume(s <= 0.001 ? 0 : Math.pow(s, 1.6));
  for (const amb of Object.values(A.ambience)) amb.base = s;
}

// ------------------------------------------------------------------ instruments
function makeInst(kind, out) {
  switch (kind) {
    case 'pluck': return new Tone.PolySynth(Tone.Synth, { maxPolyphony: 6, oscillator: { type: 'triangle8' }, envelope: { attack: 0.004, decay: 0.5, sustain: 0.05, release: 0.8 }, volume: -12 }).connect(out);
    case 'bell': return new Tone.PolySynth(Tone.FMSynth, { maxPolyphony: 5, harmonicity: 3.01, modulationIndex: 9, envelope: { attack: 0.002, decay: 1.6, sustain: 0, release: 2.2 }, modulationEnvelope: { attack: 0.002, decay: 0.6, sustain: 0, release: 0.5 }, volume: -20 }).connect(out);
    case 'flute': { const v = new Tone.Vibrato(5, 0.12).connect(out); return new Tone.PolySynth(Tone.Synth, { maxPolyphony: 3, oscillator: { type: 'sine' }, envelope: { attack: 0.12, decay: 0.3, sustain: 0.6, release: 0.9 }, volume: -16 }).connect(v); }
    case 'celesta': return new Tone.PolySynth(Tone.FMSynth, { maxPolyphony: 5, harmonicity: 5, modulationIndex: 3, envelope: { attack: 0.003, decay: 1.2, sustain: 0, release: 1.5 }, volume: -19 }).connect(out);
    case 'brass': { const f = new Tone.Filter(1400, 'lowpass').connect(out); return new Tone.PolySynth(Tone.Synth, { maxPolyphony: 4, oscillator: { type: 'sawtooth' }, envelope: { attack: 0.03, decay: 0.2, sustain: 0.5, release: 0.3 }, volume: -17 }).connect(f); }
    case 'strings': { const f = new Tone.Filter(1100, 'lowpass').connect(out); return new Tone.PolySynth(Tone.Synth, { maxPolyphony: 6, oscillator: { type: 'fatsawtooth', count: 3, spread: 22 }, envelope: { attack: 1.4, decay: 0.5, sustain: 0.8, release: 3 }, volume: -26 }).connect(f); }
    case 'choir': { const f = new Tone.Filter(1600, 'bandpass').connect(out); const ch = new Tone.Chorus(1.5, 3.5, 0.6).connect(f); ch.start(); return new Tone.PolySynth(Tone.AMSynth, { maxPolyphony: 6, harmonicity: 1.5, envelope: { attack: 1.8, decay: 0.5, sustain: 0.8, release: 3.5 }, volume: -18 }).connect(ch); }
    case 'am': return new Tone.PolySynth(Tone.AMSynth, { maxPolyphony: 6, envelope: { attack: 1.6, decay: 0.4, sustain: 0.8, release: 3 }, volume: -24 }).connect(out);
    case 'fm': return new Tone.PolySynth(Tone.FMSynth, { maxPolyphony: 5, harmonicity: 0.5, modulationIndex: 6, envelope: { attack: 2.2, decay: 0.5, sustain: 0.8, release: 4 }, volume: -24 }).connect(out);
    case 'frame': return new Tone.MembraneSynth({ pitchDecay: 0.03, octaves: 3, envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.2 }, volume: -14 }).connect(out);
    case 'taiko': return new Tone.MembraneSynth({ pitchDecay: 0.08, octaves: 5, envelope: { attack: 0.001, decay: 0.8, sustain: 0, release: 0.5 }, volume: -8 }).connect(out);
    case 'heart': return new Tone.MembraneSynth({ pitchDecay: 0.05, octaves: 2, envelope: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.2 }, volume: -12 }).connect(out);
    case 'drone': return new Tone.Synth({ oscillator: { type: 'fatsine', count: 3, spread: 10 }, envelope: { attack: 4, decay: 1, sustain: 1, release: 6 }, volume: -22 }).connect(out);
  }
}

function buildTheme(name) {
  const S = SCALES[name] || SCALES.gilded;
  const gain = new Tone.Gain(0).connect(A.music);
  const th = { name, S, gain, lead: makeInst(S.lead, gain), pad: makeInst(S.pad, gain), drone: makeInst('drone', gain), drum: S.drum ? makeInst(S.drum, gain) : null, perc: makeInst('taiko', gain), next: Tone.now() + 0.1, stepN: 0, chord: 0, active: true, melodyPos: 3 };
  th.perc.volume.value = -60;
  th.drone.triggerAttack(NOTE(S.root - 12), Tone.now() + 0.05);
  return th;
}

function noteOf(S, deg, oct = 0) {
  const n = S.steps.length;
  const o = Math.floor(deg / n);
  const d = ((deg % n) + n) % n;
  return NOTE(S.root + S.steps[d] + 12 * (o + oct));
}

function stepTheme(th, now) {
  const S = th.S;
  while (th.next < now + 0.25) {
    const t = th.next;
    const i = th.stepN++;
    th.next += S.step;
    const bar = Math.floor(i / 8);
    // chords every bar
    if (i % 8 === 0) {
      th.chord = (th.chord + (Math.random() < 0.7 ? 1 : 2)) % CHORDS.length;
      const ch = CHORDS[th.chord].map((d) => noteOf(S, d, 0));
      th.pad.triggerAttackRelease(ch, S.step * 7.5, t, 0.5);
    }
    // melody: random walk on the scale
    const density = S.mood * (th.name === 'boss' ? 1 : 0.65) * (0.7 + A.intensity * 0.6);
    if (Math.random() < density * (i % 2 === 0 ? 0.8 : 0.35)) {
      th.melodyPos += [-2, -1, -1, 0, 1, 1, 2, 3][Math.floor(Math.random() * 8)];
      th.melodyPos = Math.max(0, Math.min(12, th.melodyPos));
      th.lead.triggerAttackRelease(noteOf(S, th.melodyPos, 1), S.step * (Math.random() < 0.3 ? 2 : 1), t, 0.6 + Math.random() * 0.3);
    }
    // percussion
    if (th.drum) {
      if (S.drum === 'heart') { if (i % 4 === 0 || i % 4 === 1) th.drum.triggerAttackRelease(i % 4 === 0 ? 'C2' : 'A1', '16n', t, i % 4 === 0 ? 0.9 : 0.6); }
      else if (S.drum === 'taiko') { if (i % 8 === 0 || i % 8 === 3 || (i % 8 === 6 && Math.random() < 0.6)) th.drum.triggerAttackRelease('C1', '8n', t, 0.9); }
      else if (i % 4 === 0 || Math.random() < 0.25) th.drum.triggerAttackRelease(i % 4 === 0 ? 'D2' : 'A2', '16n', t, i % 4 === 0 ? 0.7 : 0.35);
    }
    // combat layer: taiko pulse scaled by intensity
    th.perc.volume.value = A.intensity > 0.05 ? -30 + A.intensity * 22 : -60;
    if (A.intensity > 0.05 && (i % 4 === 0 || (i % 4 === 2 && A.intensity > 0.6))) th.perc.triggerAttackRelease(i % 8 === 0 ? 'C1' : 'G1', '8n', t, 0.8);
    if (i % 32 === 0 && Math.random() < 0.5) { th.drone.triggerRelease(t); th.drone.triggerAttack(NOTE(S.root - 12 + (Math.random() < 0.5 ? 0 : 7)), t + 0.1); }
  }
}

export function setMusic(name) {
  if (!A.ready || A.current?.name === name) return;
  const old = A.current;
  if (old) {
    old.gain.gain.rampTo(0, 3.5);
    old.active = false;
    setTimeout(() => { try { old.drone.triggerRelease(); } catch (e) { /* ignore */ } setTimeout(() => { for (const k of ['lead', 'pad', 'drone', 'drum', 'perc']) old[k]?.dispose(); old.gain.dispose(); }, 5000); }, 3600);
  }
  const th = buildTheme(name);
  th.gain.gain.rampTo(1, 4);
  A.current = th;
}

function tick() {
  if (!A.ready) return;
  try { tickInner(); } catch (e) { /* ignore */ }
}
function tickInner() {
  const now = Tone.now();
  const target = Math.min(1, (G.combatTimer > 0 ? 0.5 : 0) + (G.bossActive ? 0.5 : 0));
  A.intensity += (target - A.intensity) * 0.04;
  if (A.current?.active) stepTheme(A.current, now);
  updateAmbience();
  sfxTick();
}

// ------------------------------------------------------------------ ambience
function buildAmbience() {
  const mk = (type, filterType, freq, q = 1) => {
    const n = new Tone.Noise(type);
    const f = new Tone.Filter(freq, filterType, -24);
    f.Q.value = q;
    const g = new Tone.Gain(0).connect(A.sfxDry);
    n.connect(f); f.connect(g);
    n.start();
    return { n, f, g, level: 0, base: G.settings.sfx };
  };
  A.ambience.wind = mk('pink', 'bandpass', 500, 0.7);
  A.ambience.rain = mk('white', 'highpass', 2600);
  A.ambience.waves = mk('brown', 'lowpass', 500);
  A.ambience.cave = mk('brown', 'lowpass', 180);
  A.windLfo = 0;
}

function updateAmbience() {
  const W = G.weather || {};
  const id = W.id;
  const realm = G.realm;
  A.windLfo += 0.04;
  const set = (k, v) => { const a = A.ambience[k]; if (!a) return; a.g.gain.rampTo(v * G.settings.sfx, 0.4); };
  const indoor = realm === 'dungeon' || realm === 'deep';
  const storm = W.storm || 0;
  set('wind', indoor ? 0 : 0.05 + (W.wind || 1) * 0.04 + storm * 0.1 + (id === 'sandstorm' || id === 'blizzard' || id === 'glassstorm' ? 0.18 : 0) + Math.sin(A.windLfo * 0.3) * 0.02);
  A.ambience.wind.f.frequency.rampTo(380 + Math.sin(A.windLfo * 0.21) * 160 + storm * 300, 0.4);
  set('rain', !indoor && W.def?.wet ? 0.05 + storm * 0.06 : 0);
  const coastal = G.biome === 'coast' && realm === 'surface';
  set('waves', coastal ? 0.12 + Math.max(0, Math.sin(A.windLfo * 0.12)) * 0.14 : 0);
  set('cave', indoor ? 0.18 : 0);
}

// ------------------------------------------------------------------ sfx facade
// Kept for callers of the old API; new code can use playSound(id, opts) directly.
const clampR = (r) => Math.max(0, Math.min(5, r | 0));
export const sfx = {
  swing(heavy) { play(heavy ? 'swing_heavy' : 'swing_light'); },
  hit(crit, el) { play('hit_flesh'); if (el && el !== 'physical') play(el + '_hit', { vol: -4 }); if (crit) { play('crit_crack'); play('sub_thump'); } },
  playerHurt() { play('hurt'); },
  parry() { play('parry'); },
  block() { play('block'); },
  dodge() { play('dodge'); },
  bow() { play('bow_twang'); },
  spell(el) { play((el && E.sounds[el + '_cast'] ? el : 'physical') + '_cast'); },
  explosion() { play('boom_small'); },
  thunder(dist = 40) { const d = Math.min(3, dist / 40); play('thunder', { delay: d * 0.6, vol: -d * 4 }); },
  levelUp() { play('levelup'); },
  loot(r) { play('loot_' + clampR(r)); },
  coin() { play('coin'); },
  click() { play('ui_click'); },
  dice(s = 0.6) { play('dice', { vol: -10 + s * 10 }); },
  death() { play('kill_flesh'); },
  roar() { play('roar'); },
  quest() { play('quest'); },
  shrine() { play('shrine'); },
  waystone() { play('waystone'); },
  beat() { play('beat'); },
};
export { play as playSound, stop as stopSound, duck as duckMusic };

export function audioReady() { return A.ready; }

// window.__sfx: inspection hooks for tests / tuning (cheap; nothing runs until called)
function debugApi() {
  let an = null, buf = null;
  const meter = () => {
    if (!an) { an = E.ctx.createAnalyser(); an.fftSize = 2048; E.limPost.connect(an); buf = new Float32Array(an.fftSize); }
    an.getFloatTimeDomainData(buf);
    let pk = 0, ss = 0;
    for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > pk) pk = a; ss += buf[i] * buf[i]; }
    return { peak: pk, rms: Math.sqrt(ss / buf.length) };
  };
  return {
    E, CATS, play, stop, duck, activeVoices, meter, setMusic,
    get ready() { return E.ready; },
    bake: () => E.bake,
    list: () => Object.keys(E.sounds),
    info: (id) => E.sounds[id] && { ...E.sounds[id], bufs: E.sounds[id].bufs.length },
    state: () => Tone.getContext().state,
  };
}

