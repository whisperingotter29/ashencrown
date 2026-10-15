// Generative score, ambience and synthesized sound effects (Tone.js).
import * as Tone from 'tone';
import { G } from '../game.js';
import { bus } from '../core/events.js';

const A = { ready: false, music: null, sfx: null, themes: {}, current: null, last: {}, ambience: {}, intensity: 0 };

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

export function initAudio() {
  if (A.ready) return Promise.resolve();
  return Tone.start().then(() => {
    const ctx = Tone.getContext();
    ctx.lookAhead = 0.08;
    const verb = new Tone.Reverb({ decay: 7, wet: 0.42, preDelay: 0.03 }).toDestination();
    A.music = new Tone.Volume(-6).connect(verb);
    const sverb = new Tone.Reverb({ decay: 1.8, wet: 0.18 }).toDestination();
    A.sfx = new Tone.Volume(-4).connect(sverb);
    A.sfxDry = new Tone.Volume(-4).toDestination();
    A.comp = null;
    buildSfx();
    buildAmbience();
    applyVolume();
    A.ready = true;
    hookEvents();
    setInterval(tick, 40);
  });
}

export function applyVolume() {
  if (!A.music) return;
  const m = G.settings.music, s = G.settings.sfx;
  A.music.volume.rampTo(m <= 0.001 ? -80 : -24 + m * 20, 0.3);
  A.sfx.volume.rampTo(s <= 0.001 ? -80 : -22 + s * 20, 0.1);
  A.sfxDry.volume.rampTo(s <= 0.001 ? -80 : -22 + s * 20, 0.1);
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

// ------------------------------------------------------------------ sfx
const SFX = {};
function buildSfx() {
  const o = A.sfx;
  SFX.noise = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.002, decay: 0.12, sustain: 0 } });
  SFX.swingF = new Tone.Filter(1800, 'bandpass').connect(o);
  SFX.noise.connect(SFX.swingF);
  SFX.thud = new Tone.MembraneSynth({ pitchDecay: 0.02, octaves: 3, envelope: { attack: 0.001, decay: 0.18, sustain: 0 }, volume: -4 }).connect(o);
  SFX.ping = new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 0.25, release: 0.1 }, harmonicity: 5.1, modulationIndex: 20, resonance: 3000, octaves: 1.2, volume: -18 }).connect(o);
  SFX.ping.frequency.value = 400;
  SFX.chime = new Tone.PolySynth(Tone.FMSynth, { maxPolyphony: 8, harmonicity: 3, modulationIndex: 5, envelope: { attack: 0.002, decay: 0.8, sustain: 0, release: 1 }, volume: -12 }).connect(o);
  SFX.tone = new Tone.PolySynth(Tone.Synth, { maxPolyphony: 8, oscillator: { type: 'triangle' }, envelope: { attack: 0.005, decay: 0.3, sustain: 0.1, release: 0.4 }, volume: -10 }).connect(o);
  SFX.boom = new Tone.NoiseSynth({ noise: { type: 'brown' }, envelope: { attack: 0.005, decay: 0.8, sustain: 0 }, volume: -2 });
  SFX.boomF = new Tone.Filter(400, 'lowpass').connect(o);
  SFX.boom.connect(SFX.boomF);
  SFX.hiss = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.05, decay: 0.4, sustain: 0 }, volume: -8 });
  SFX.hissF = new Tone.Filter(900, 'lowpass').connect(o);
  SFX.hiss.connect(SFX.hissF);
  SFX.growl = new Tone.FMSynth({ harmonicity: 0.5, modulationIndex: 12, envelope: { attack: 0.1, decay: 0.8, sustain: 0.2, release: 0.6 }, volume: -8 }).connect(o);
  SFX.click = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.03, sustain: 0 }, volume: -14 }).connect(A.sfxDry);
}

function rl(key, gap = 0.04) { const t = Tone.now(); if (A.last[key] && t - A.last[key] < gap) return false; A.last[key] = t; return true; }
// Tone requires strictly increasing start times per voice; keep a global monotonic clock for sfx
let lastT = 0;
const tnow = () => { const t = Math.max(Tone.now() + 0.01, lastT + 0.012); lastT = t; return t; };

export const sfx = {
  swing(heavy) { if (!rl('swing', 0.05)) return; SFX.swingF.frequency.setValueAtTime(heavy ? 900 : 2200, tnow()); SFX.swingF.frequency.exponentialRampToValueAtTime(heavy ? 300 : 700, tnow() + 0.15); SFX.noise.envelope.decay = heavy ? 0.22 : 0.12; SFX.noise.triggerAttackRelease(heavy ? 0.22 : 0.12, tnow(), heavy ? 0.6 : 0.35); },
  hit(crit, el) { if (!rl('hit', 0.03)) return; SFX.thud.triggerAttackRelease(crit ? 'A1' : 'D2', '16n', tnow(), crit ? 1 : 0.7); if (crit) SFX.ping.triggerAttackRelease('16n', tnow(), 0.4); },
  playerHurt() { if (!rl('hurt', 0.15)) return; SFX.thud.triggerAttackRelease('F1', '8n', tnow(), 0.9); SFX.hiss.triggerAttackRelease(0.15, tnow(), 0.4); },
  parry() { SFX.ping.triggerAttackRelease('8n', tnow(), 1); SFX.chime.triggerAttackRelease(['E6', 'B6'], '8n', tnow(), 0.5); },
  block() { if (!rl('block', 0.08)) return; SFX.ping.frequency.value = 220; SFX.ping.triggerAttackRelease('32n', tnow(), 0.4); SFX.ping.frequency.value = 400; SFX.thud.triggerAttackRelease('G1', '16n', tnow(), 0.5); },
  dodge() { if (!rl('dodge', 0.1)) return; SFX.hissF.frequency.setValueAtTime(400, tnow()); SFX.hissF.frequency.exponentialRampToValueAtTime(2000, tnow() + 0.2); SFX.hiss.triggerAttackRelease(0.25, tnow(), 0.5); },
  bow() { if (!rl('bow', 0.05)) return; SFX.tone.triggerAttackRelease('G2', '32n', tnow(), 0.5); SFX.noise.triggerAttackRelease(0.06, tnow(), 0.25); },
  spell(el) {
    if (!rl('spell' + el, 0.08)) return;
    const t = tnow();
    switch (el) {
      case 'fire': SFX.hissF.frequency.setValueAtTime(300, t); SFX.hissF.frequency.exponentialRampToValueAtTime(1800, t + 0.3); SFX.hiss.triggerAttackRelease(0.4, t, 0.8); break;
      case 'frost': SFX.chime.triggerAttackRelease(['B5', 'F#6', 'D7'], '16n', t, 0.35); break;
      case 'lightning': SFX.noise.triggerAttackRelease(0.08, t, 0.9); SFX.ping.triggerAttackRelease('32n', t, 0.5); break;
      case 'void': SFX.growl.triggerAttackRelease('C2', 0.4, t, 0.5); break;
      case 'holy': SFX.chime.triggerAttackRelease(['D5', 'F#5', 'A5', 'D6'], '4n', t, 0.3); break;
      case 'rot': SFX.tone.triggerAttackRelease(['C3', 'C#3'], '16n', t, 0.5); break;
      case 'nature': SFX.tone.triggerAttackRelease(['G4', 'D5'], '16n', t, 0.4); break;
      case 'water': SFX.hissF.frequency.setValueAtTime(800, t); SFX.hissF.frequency.exponentialRampToValueAtTime(200, t + 0.4); SFX.hiss.triggerAttackRelease(0.4, t, 0.6); break;
      case 'sound': SFX.chime.triggerAttackRelease(['A4', 'E5', 'A5'], '8n', t, 0.4); break;
      case 'blood': SFX.growl.triggerAttackRelease('F2', 0.25, t, 0.4); break;
      default: SFX.tone.triggerAttackRelease('E5', '32n', t, 0.3);
    }
  },
  explosion() { if (!rl('boom', 0.12)) return; SFX.boom.triggerAttackRelease(0.8, tnow(), 0.9); SFX.thud.triggerAttackRelease('C1', '8n', tnow(), 1); },
  thunder(dist) { const d = Math.min(3, dist / 40); SFX.boomF.frequency.value = 300; setTimeout(() => SFX.boom.triggerAttackRelease(1.8, tnow(), Math.max(0.3, 1 - d * 0.2)), d * 600); },
  levelUp() { const t = tnow(); ['D5', 'F#5', 'A5', 'D6', 'F#6'].forEach((n, i) => SFX.chime.triggerAttackRelease(n, '8n', t + i * 0.09, 0.5)); },
  loot(r) { if (!rl('loot', 0.08)) return; const t = tnow(); const notes = [['C6'], ['E6'], ['G6', 'C7'], ['A5', 'E6', 'A6'], ['D5', 'A5', 'D6', 'F#6'], ['C5', 'G5', 'C6', 'E6', 'G6']][r] || ['C6']; notes.forEach((n, i) => SFX.chime.triggerAttackRelease(n, '8n', t + i * 0.07, 0.4)); },
  coin() { if (!rl('coin', 0.06)) return; SFX.chime.triggerAttackRelease(['B6', 'E7'], '32n', tnow(), 0.25); },
  click() { SFX.click.triggerAttackRelease(0.03, tnow(), 0.6); },
  dice(s = 0.6) { if (!rl('dice', 0.04)) return; SFX.click.triggerAttackRelease(0.04, tnow(), s); SFX.thud.triggerAttackRelease('E3', '64n', tnow(), s * 0.4); },
  death() { if (!rl('death', 0.1)) return; SFX.thud.triggerAttackRelease('A0', '8n', tnow(), 0.7); },
  roar() { SFX.growl.triggerAttackRelease('A1', 1.2, tnow(), 0.9); SFX.boom.triggerAttackRelease(1.2, tnow(), 0.5); },
  quest() { const t = tnow(); [['D4', 'A4'], ['F#4', 'D5'], ['A4', 'E5', 'A5']].forEach((n, i) => SFX.tone.triggerAttackRelease(n, '8n', t + i * 0.18, 0.5)); },
  shrine() { const t = tnow(); ['A4', 'C#5', 'E5', 'A5', 'C#6', 'E6'].forEach((n, i) => SFX.chime.triggerAttackRelease(n, '4n', t + i * 0.12, 0.35)); },
  waystone() { const t = tnow(); ['E5', 'B5', 'E6'].forEach((n, i) => SFX.chime.triggerAttackRelease(n, '4n', t + i * 0.15, 0.4)); },
  beat() { SFX.click.triggerAttackRelease(0.02, tnow(), 0.25); },
};

function safe(fn) { return (...a) => { try { fn(...a); } catch (e) { /* audio glitches must never break the game */ } }; }
for (const k of Object.keys(sfx)) sfx[k] = safe(sfx[k]);

function hookEvents() {
  bus.on('swing', ({ heavy }) => sfx.swing(heavy));
  bus.on('hit', ({ src, tgt, crit, element, kind }) => { if (tgt.isPlayer) sfx.playerHurt(); else if (src?.isPlayer || src?.team === 'player') { sfx.hit(crit, element); } });
  bus.on('parrySound', () => sfx.parry());
  bus.on('block', () => sfx.block());
  bus.on('dodge', () => sfx.dodge());
  bus.on('shot', () => sfx.bow());
  bus.on('bolt', ({ el }) => sfx.spell(el));
  bus.on('spellCast', ({ element }) => sfx.spell(element));
  bus.on('thunder', ({ dist }) => sfx.thunder(dist));
  bus.on('levelUp', () => sfx.levelUp());
  bus.on('pickup', (pk) => { if (pk.kind === 'gold') sfx.coin(); else if (pk.kind === 'item') sfx.loot(['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'].indexOf(pk.data.rarity)); });
  bus.on('kill', ({ victim }) => { if (!victim.isPlayer) sfx.death(); });
  bus.on('worldBossAppears', () => sfx.roar());
  bus.on('bossPhase', () => sfx.roar());
  bus.on('questComplete', () => sfx.quest());
  bus.on('tutorialStep', () => sfx.waystone());
  bus.on('tutorialDone', () => sfx.quest());
  bus.on('shrineBlessed', () => sfx.shrine());
  bus.on('waystone', () => sfx.waystone());
  bus.on('diceClack', ({ strength }) => sfx.dice(strength));
  bus.on('diceRoll', () => sfx.dice(0.8));
  bus.on('rareFate', () => sfx.levelUp());
  bus.on('menuOpen', () => sfx.click());
  bus.on('onBeat', () => sfx.beat());
  bus.on('volume', applyVolume);
}

export function audioReady() { return A.ready; }
