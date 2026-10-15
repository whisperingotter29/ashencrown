// Procedural SFX bank. Every sound is a recipe of layered synth / noise voices that is rendered ONCE
// into an AudioBuffer with an OfflineAudioContext (a few variants each). At runtime a sound costs a
// single AudioBufferSourceNode played through a pooled voice strip, so dozens of hits per second
// stay cheap, while the recipes themselves can afford rich layering (FM bells, modal metal, choirs,
// reversed swells, Karplus-Strong strings, crackle textures).
//
// Recipe: { id, dur, n (variants), vol (dB mix level), vary (± semitones per play), cat, group,
//           lp / lpVar (random low-pass per play), sr, pri (bake order), parts | build(b, v) }

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// ------------------------------------------------------------------ shared sources
// AudioBuffers are not tied to a context, so the noise beds are generated once per sample rate.
const NOISE = {};
function noiseFor(sr) {
  if (NOISE[sr]) return NOISE[sr];
  const len = Math.floor(sr * 2);
  const r = rng(1234);
  const mk = (fill) => { const b = new AudioBuffer({ length: len, numberOfChannels: 1, sampleRate: sr }); fill(b.getChannelData(0)); return b; };
  const white = mk((d) => { for (let i = 0; i < len; i++) d[i] = r() * 2 - 1; });
  const pink = mk((d) => {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = r() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
  });
  const brown = mk((d) => { let last = 0; for (let i = 0; i < len; i++) { last = (last + 0.02 * (r() * 2 - 1)) / 1.02; d[i] = last * 3.5; } });
  return (NOISE[sr] = { white, pink, brown });
}
const CURVES = {};
function tanhCurve(k) {
  if (CURVES[k]) return CURVES[k];
  const n = 1024, c = new Float32Array(n), norm = Math.tanh(k);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / norm; }
  return (CURVES[k] = c);
}
const scalePath = (f, k) => (typeof f === 'number' ? f * k : f.map(([t, v]) => [t, v * k]));

// ------------------------------------------------------------------ builder
// Thin helpers over raw Web Audio nodes in an OfflineAudioContext. Recipe times are seconds from the
// start of the sound; `o` shifts them to the sound's slot when several sounds share one render.
// Decay `d` is roughly the time to fall ~43 dB (exponential, time constant d/5).
class B {
  constructor(c, r, sr, o = 0, out = c.destination) { this.c = c; this.r = r; this.sr = sr; this.o = o; this.out = out; this.N = noiseFor(sr); }
  T(t) { return t + this.o; }
  R(a, b) { return a + (b - a) * this.r(); }
  g(v = 1, dst = this.out) { const n = this.c.createGain(); n.gain.value = v; n.connect(dst); return n; }
  env(p, t, peak, a, d, hold = 0, sus = 0) {
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(peak, t + Math.max(0.0005, a));
    if (hold) p.setValueAtTime(peak, t + a + hold);
    p.setTargetAtTime(sus * peak, t + a + hold, Math.max(0.001, d / 5));
  }
  path(p, t, f) {
    const ny = this.sr * 0.49, cl = (v) => Math.min(ny, v);   // keep frequencies under Nyquist
    if (typeof f === 'number') { p.setValueAtTime(cl(f), t); return; }
    p.setValueAtTime(cl(f[0][1]), t + f[0][0]);
    for (let i = 1; i < f.length; i++) p.exponentialRampToValueAtTime(Math.max(1, cl(f[i][1])), t + f[i][0]);
  }
  filt(type, f, Q = 0.707, dst = this.out, t = 0) {
    const n = this.c.createBiquadFilter(); n.type = type; this.path(n.frequency, this.T(t), f); n.Q.value = Q; n.connect(dst); return n;
  }
  drive(k = 2, dst = this.out) { const n = this.c.createWaveShaper(); n.curve = tanhCurve(k); n.connect(dst); return n; }
  // amplitude modulator: returns an input node whose gain wobbles between 1-depth and 1
  am(rate, depth, dst = this.out, t = 0, dur = 1, type = 'sine') {
    const n = this.c.createGain(); n.gain.value = 1 - depth / 2; n.connect(dst);
    const l = this.c.createOscillator(); l.type = type; l.frequency.value = rate;
    const lg = this.c.createGain(); lg.gain.value = depth / 2; l.connect(lg); lg.connect(n.gain);
    l.start(this.T(t)); l.stop(this.T(t) + dur + 0.1);
    return n;
  }
  vib(param, t, cents, rate, end) {
    const l = this.c.createOscillator(); l.frequency.value = rate;
    const lg = this.c.createGain(); lg.gain.value = cents; l.connect(lg); lg.connect(param);
    l.start(t); l.stop(end);
  }
  tone({ type = 'sine', f = 440, t: t0 = 0, a = 0.001, d = 0.2, hold = 0, g = 1, dst = this.out, det = 0, vib = 0, vibF = 6 }) {
    const t = this.T(t0);
    const o = this.c.createOscillator(); o.type = type; this.path(o.frequency, t, f); if (det) o.detune.value = det;
    const e = this.c.createGain(); e.gain.value = 0; this.env(e.gain, t, g, a, d, hold);
    o.connect(e); e.connect(dst);
    const end = t + a + hold + d * 1.5 + 0.05;
    if (vib) this.vib(o.detune, t, vib, vibF, end);
    o.start(t); o.stop(end);
    return o;
  }
  // filtered noise burst (optionally two filters in series, with frequency paths)
  nz({ c = 'white', t: t0 = 0, a = 0.001, d = 0.1, hold = 0, g = 1, dst = this.out, ft = null, f = 1000, Q = 0.707, ft2 = null, f2 = 1000, Q2 = 0.707, rate = 1 }) {
    const t = this.T(t0);
    const s = this.c.createBufferSource(); s.buffer = this.N[c]; s.loop = true; s.playbackRate.value = rate;
    const e = this.c.createGain(); e.gain.value = 0; this.env(e.gain, t, g, a, d, hold); e.connect(dst);
    let head = e;
    if (ft2) head = this.filt(ft2, f2, Q2, head, t0);
    if (ft) head = this.filt(ft, f, Q, head, t0);
    s.connect(head);
    s.start(t, this.r() * 1.8); s.stop(t + a + hold + d * 1.5 + 0.05);
    return s;
  }
  click({ t = 0, f = 3000, d = 0.004, g = 0.5, dst = this.out }) { this.nz({ c: 'white', t, a: 0.0003, d, g, ft: 'highpass', f, dst }); }
  fm({ f = 440, ratio = 2, index = 2, index1 = null, t: t0 = 0, a = 0.001, d = 0.3, hold = 0, g = 1, dst = this.out, type = 'sine', mtype = 'sine', di = null, vib = 0, vibF = 6 }) {
    const c = this.c, t = this.T(t0);
    const car = c.createOscillator(); car.type = type; this.path(car.frequency, t, f);
    const mod = c.createOscillator(); mod.type = mtype; this.path(mod.frequency, t, scalePath(f, ratio));
    const f0 = typeof f === 'number' ? f : f[0][1];
    const mg = c.createGain(); mg.gain.value = 0;
    mg.gain.setValueAtTime(index * f0, t);
    mg.gain.setTargetAtTime((index1 ?? index * 0.15) * f0, t + a, Math.max(0.002, (di ?? d) / 4));
    mod.connect(mg); mg.connect(car.frequency);
    const e = c.createGain(); e.gain.value = 0; this.env(e.gain, t, g, a, d, hold);
    car.connect(e); e.connect(dst);
    const end = t + a + hold + d * 1.5 + 0.05;
    if (vib) this.vib(car.detune, t, vib, vibF, end);
    car.start(t); mod.start(t); car.stop(end); mod.stop(end);
    return car;
  }
  bell({ t = 0, f, d = 0.6, g = 0.4, ratio = 3.5, idx = 1.8, dst = this.out }) { this.fm({ t, f, ratio, index: idx, index1: 0.05, di: d * 0.45, a: 0.0015, d, g, dst }); }
  // modal synthesis: a struck object is a handful of decaying inharmonic partials
  modal({ t = 0, f, ratios = [1], decays = 0.3, gains = null, g = 1, a = 0.0006, jit = 0.004, dst = this.out }) {
    const ny = this.sr * 0.45;
    ratios.forEach((r, i) => {
      const fr = f * r * (1 + this.R(-jit, jit));
      if (fr >= ny) return;
      const d = Array.isArray(decays) ? (decays[i] ?? decays[decays.length - 1]) : decays * (1 - i * 0.12);
      const gg = gains ? (gains[i] ?? 0.2) : 1 / (1 + i * 0.6);
      this.tone({ t, f: fr, a, d: Math.max(0.01, d), g: g * gg, dst });
    });
  }
  ring({ t: t0 = 0, f1 = 300, f2 = 70, a = 0.002, d = 0.3, g = 0.3, dst = this.out }) {
    const t = this.T(t0), c = this.c, o1 = c.createOscillator(), o2 = c.createOscillator();
    o1.frequency.value = f1; o2.frequency.value = f2;
    const rm = c.createGain(); rm.gain.value = 0; o2.connect(rm.gain); o1.connect(rm);
    const e = c.createGain(); e.gain.value = 0; this.env(e.gain, t, g, a, d); rm.connect(e); e.connect(dst);
    const end = t + a + d * 1.5 + 0.05; o1.start(t); o2.start(t); o1.stop(end); o2.stop(end);
  }
  // Karplus-Strong string (f must stay below ~340 Hz: Web Audio feedback loops need >= 128 frames)
  pluck({ t = 0, f = 110, fb = 0.98, damp = 3000, g = 1, d = 0.5, burst = 0.008, dst = this.out }) {
    const c = this.c;
    const del = c.createDelay(0.1); del.delayTime.value = 1 / f;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = damp; lp.Q.value = 0;
    const fbG = c.createGain(); fbG.gain.value = fb;
    del.connect(lp); lp.connect(fbG); fbG.connect(del);
    const e = c.createGain(); e.gain.value = 0; this.env(e.gain, this.T(t), g, 0.001, d); e.connect(dst); lp.connect(e);
    this.nz({ c: 'white', t, a: 0.0004, d: burst, g: 1, dst: del, ft: 'lowpass', f: Math.min(this.sr * 0.45, damp * 2.5) });
  }
  // bright plucked tone (harp / lute) for higher notes
  pluckTone({ t = 0, f, d = 0.6, g = 0.4, dst = this.out }) {
    const lp = this.filt('lowpass', [[0, Math.min(f * 10, 12000)], [d * 0.5, f * 1.5]], 2, dst, t);
    this.tone({ type: 'sawtooth', f, t, d, g, dst: lp });
    this.tone({ f, t, d: d * 1.2, g: g * 0.6, dst });
  }
  formants(list, dst = this.out) {
    const inp = this.c.createGain();
    for (const [f, Q, gg] of list) inp.connect(this.filt('bandpass', f, Q, this.g(gg, dst)));
    return inp;
  }
  // "aah" choir: detuned saws through vowel formants
  choir({ t = 0, notes, a = 0.3, d = 1, hold = 0, g = 0.5, dst = this.out }) {
    const form = this.formants([[700, 4, 1], [1150, 5, 0.55], [2650, 7, 0.25]], dst);
    const per = g / notes.length;
    for (const f of notes) for (const det of [-9, 9]) this.tone({ type: 'sawtooth', f, t, a, d, hold, g: per, dst: form, det: det + this.R(-3, 3), vib: 12, vibF: this.R(4.5, 6) });
  }
  brass({ t = 0, notes, a = 0.03, d = 0.6, hold = 0, g = 0.4, open = 3500, dst = this.out }) {
    const lp = this.filt('lowpass', [[0, 500], [a + 0.05, open], [a + hold + d, 700]], 1, dst, t);
    const per = g / notes.length;
    for (const f of notes) for (const det of [-6, 6]) this.tone({ type: 'sawtooth', f, t, a, d, hold, g: per, dst: lp, det });
  }
  bubbles({ t = 0, dur = 0.3, n = 5, fmin = 200, fmax = 800, g = 0.3, dst = this.out }) {
    for (let i = 0; i < n; i++) {
      const f = this.R(fmin, fmax);
      this.tone({ t: t + this.R(0, dur), f: [[0, f], [0.04, f * this.R(1.4, 1.9)]], a: 0.002, d: this.R(0.03, 0.06), g: g * this.R(0.5, 1), dst });
    }
  }
  // randomly-pitched sawtooth "electric" buzz
  zap({ t: t0 = 0, dur = 0.3, fmin = 70, fmax = 900, step = 0.008, g = 0.6, dst = this.out }) {
    const t = this.T(t0);
    const o = this.c.createOscillator(); o.type = 'sawtooth';
    for (let tt = 0; tt < dur; tt += step) o.frequency.setValueAtTime(this.R(fmin, fmax), t + tt);
    const e = this.c.createGain(); e.gain.value = 0; this.env(e.gain, t, g, 0.002, dur);
    o.connect(e); e.connect(this.drive(3, this.filt('bandpass', 2400, 0.7, dst)));
    o.start(t); o.stop(t + dur * 1.5 + 0.05);
  }
  // sparse random impulses: fire crackle, debris, gravel, sand (dense), page rustle
  crackle({ t = 0, dur = 0.3, rate = 200, g = 1, shape = 'flat', len = 30, dst = this.out, ft = 'highpass', f = 1500, Q = 0.7 }) {
    const sr = this.sr, n = Math.max(1, Math.ceil(dur * sr));
    const buf = new AudioBuffer({ length: n, numberOfChannels: 1, sampleRate: sr });
    const d = buf.getChannelData(0);
    let time = 0;
    for (;;) {
      time += -Math.log(1 - this.r() * 0.999) / rate;
      if (time >= dur) break;
      const u = time / dur;
      const env = shape === 'exp' ? Math.exp(-4 * u) : shape === 'bell' ? Math.sin(Math.PI * u) : shape === 'rise' ? u : 1;
      const amp = env * (0.15 + 0.85 * this.r() * this.r());
      const i0 = Math.floor(time * sr), L = len * (0.5 + this.r());
      const sgn = this.r() < 0.5 ? -1 : 1;
      for (let k = 0; k < L * 5 && i0 + k < n; k++) d[i0 + k] += sgn * amp * Math.exp(-k / L) * (k & 1 ? -0.4 : 1);
    }
    const s = this.c.createBufferSource(); s.buffer = buf;
    const gn = this.g(g, dst);
    s.connect(ft ? this.filt(ft, f, Q, gn, t) : gn);
    s.start(this.T(t));
  }
}

// ------------------------------------------------------------------ recipes
export const RECIPES = [];
function def(id, o, build) { RECIPES.push({ id, n: 1, vol: -6, vary: 1, cat: 'misc', group: 'world', pri: 2, ...o, build }); }

// ---- weapon swings --------------------------------------------------------------------------
def('swing_light', { dur: 0.3, n: 4, vol: -10, vary: 1.5, cat: 'swing', pri: 0 }, (b) => {
  const f1 = b.R(2400, 3600), tp = b.R(0.05, 0.08);
  b.nz({ c: 'pink', a: tp, d: 0.16, ft: 'bandpass', f: [[0, f1 * 0.35], [tp, f1], [tp + 0.18, f1 * 0.45]], Q: 1.4 });
  b.nz({ c: 'white', t: tp * 0.6, a: tp * 0.5, d: 0.07, g: 0.3, ft: 'highpass', f: 5000 });
});
def('swing_med', { dur: 0.4, n: 3, vol: -9, vary: 1.2, cat: 'swing', pri: 0 }, (b) => {
  const f1 = b.R(1500, 2100), tp = b.R(0.08, 0.11);
  b.nz({ c: 'pink', a: tp, d: 0.22, ft: 'bandpass', f: [[0, f1 * 0.3], [tp, f1], [tp + 0.25, f1 * 0.35]], Q: 1.2 });
  b.nz({ c: 'brown', a: tp, d: 0.18, g: 0.6, ft: 'lowpass', f: 500 });
});
def('swing_heavy', { dur: 0.7, n: 3, vol: -7, vary: 1, cat: 'swing', pri: 0 }, (b) => {
  const f1 = b.R(900, 1300), tp = b.R(0.14, 0.18);
  const am = b.am(b.R(14, 20), 0.35, b.out, 0, 0.7);           // big blade "whum-whum"
  b.nz({ c: 'pink', a: tp, d: 0.4, dst: am, ft: 'bandpass', f: [[0, 220], [tp, f1], [tp + 0.45, 300]], Q: 0.9 });
  b.nz({ c: 'brown', a: tp, d: 0.32, g: 0.8, ft: 'lowpass', f: 380 });
  b.tone({ f: [[0, 75], [0.4, 42]], a: tp, d: 0.3, g: 0.35 });
});
def('swing_thrust', { dur: 0.22, n: 3, vol: -10, vary: 1.5, cat: 'swing', pri: 0 }, (b) => {
  b.nz({ c: 'white', a: 0.035, d: 0.11, ft: 'bandpass', f: [[0, 1200], [0.07, b.R(3800, 4800)]], Q: 2 });
  b.nz({ c: 'pink', a: 0.02, d: 0.08, g: 0.5, ft: 'lowpass', f: 900 });
});
def('blade_ring', { sr: 44100, dur: 0.6, n: 3, vol: -19, vary: 1, cat: 'swing', pri: 1 }, (b) => {
  b.modal({ f: b.R(2300, 3100), ratios: [1, 1.51, 2.27, 3.03, 3.98], decays: [0.45, 0.35, 0.25, 0.18, 0.12], g: 0.7 });
  b.nz({ c: 'white', a: 0.01, d: 0.12, g: 0.25, ft: 'bandpass', f: [[0, 4000], [0.1, 8000]], Q: 3 });
});

// ---- ranged ---------------------------------------------------------------------------------
def('bow_twang', { dur: 0.5, n: 3, vol: -8, vary: 1.2, cat: 'swing', pri: 0 }, (b) => {
  b.pluck({ f: b.R(92, 125), fb: 0.987, damp: 2600, g: 1, d: 0.4 });
  b.nz({ c: 'white', d: 0.045, g: 0.55, ft: 'highpass', f: 2600 });
  b.tone({ type: 'triangle', f: [[0, 260], [0.04, 170]], d: 0.06, g: 0.4 });
});
def('arrow_whiz', { sr: 44100, dur: 0.3, n: 2, vol: -17, vary: 2, cat: 'swing', pri: 1 }, (b) => {
  b.nz({ c: 'white', a: 0.02, d: 0.22, ft: 'bandpass', f: [[0, 3400], [0.25, 1700]], Q: 5 });
});
def('xbow_thunk', { dur: 0.36, n: 3, vol: -6, vary: 1, cat: 'swing', pri: 0 }, (b) => {
  b.click({ g: 0.9, f: 2500 });
  b.tone({ f: [[0, 140], [0.08, 55]], d: 0.12, g: 1 });
  b.pluck({ f: b.R(170, 200), fb: 0.93, damp: 3500, g: 0.7, d: 0.2 });
  b.modal({ t: 0.035, f: b.R(850, 1000), ratios: [1, 1.71, 2.93], decays: 0.035, g: 0.5 });
  b.nz({ c: 'white', t: 0.03, d: 0.03, g: 0.35, ft: 'bandpass', f: 3000, Q: 2 });
});
def('bow_draw', { dur: 0.6, n: 2, vol: -22, vary: 1, cat: 'swing', pri: 2 }, (b) => {
  const am = b.am(b.R(22, 30), 0.6, b.out, 0, 0.6);
  b.tone({ type: 'sawtooth', f: [[0, 70], [0.5, 96]], a: 0.25, d: 0.25, g: 0.6, dst: b.filt('bandpass', 900, 6, am) });
  b.nz({ c: 'pink', a: 0.3, d: 0.2, g: 0.15, ft: 'bandpass', f: 1500, Q: 1 });
});

// ---- hits -----------------------------------------------------------------------------------
def('hit_flesh', { dur: 0.27, n: 5, vol: -5, vary: 1.5, cat: 'hit', lpVar: 1, pri: 0 }, (b) => {
  const dr = b.drive(1.8);
  b.tone({ f: [[0, b.R(150, 200)], [0.08, 46]], d: 0.15, dst: dr });
  b.nz({ c: 'white', d: 0.045, g: 0.9, ft: 'lowpass', f: [[0, 4000], [0.05, 700]], dst: dr });
  b.nz({ c: 'pink', t: 0.004, a: 0.003, d: 0.09, g: 0.55, ft: 'bandpass', f: b.R(450, 800), Q: 2.5, dst: dr });
  b.click({ g: 0.5, f: 3000 });
});
def('hit_armor', { dur: 0.4, n: 4, vol: -7, vary: 1.2, cat: 'hit', lpVar: 0.8, pri: 0 }, (b) => {
  b.click({ g: 0.8, f: 2000 });
  b.modal({ f: b.R(480, 760), ratios: [1, 2.32, 4.25, 6.63, 9.38], decays: [0.3, 0.22, 0.15, 0.1, 0.06], g: 0.55, jit: 0.02 });
  b.tone({ f: [[0, 140], [0.06, 62]], d: 0.1, g: 0.85 });
  b.nz({ c: 'white', d: 0.035, g: 0.45, ft: 'highpass', f: 2200 });
});
def('hit_bone', { dur: 0.14, n: 3, vol: -6, vary: 1.5, cat: 'hit', lpVar: 0.8, pri: 0 }, (b) => {
  b.nz({ c: 'white', d: 0.022, ft: 'bandpass', f: b.R(2000, 2800), Q: 1.4 });
  b.modal({ f: b.R(650, 1000), ratios: [1, 2.6, 4.1], decays: 0.05, g: 0.6 });
  b.tone({ f: [[0, 120], [0.05, 60]], d: 0.07, g: 0.6 });
  b.crackle({ dur: 0.07, rate: 300, g: 0.6, ft: 'bandpass', f: 2500, Q: 0.8 });
});
def('hit_stone', { dur: 0.26, n: 3, vol: -6, vary: 1.2, cat: 'hit', lpVar: 0.8, pri: 0 }, (b) => {
  b.tone({ f: [[0, 105], [0.09, 48]], d: 0.13 });
  b.crackle({ dur: 0.2, rate: 450, g: 0.8, ft: 'lowpass', f: 2600, shape: 'exp', len: 50 });
  b.modal({ f: b.R(260, 340), ratios: [1, 1.93, 3.1], decays: 0.07, g: 0.5 });
  b.nz({ c: 'white', d: 0.02, g: 0.6, ft: 'bandpass', f: 1500, Q: 1 });
});
def('crit_crack', { sr: 44100, dur: 0.5, n: 3, vol: -8, vary: 1, cat: 'crit', pri: 0 }, (b) => {
  b.nz({ c: 'white', d: 0.02, ft: 'highpass', f: 1400, dst: b.drive(4) });
  b.modal({ t: 0.002, f: b.R(1800, 2300), ratios: [1, 1.41, 2.13, 2.87, 3.6], decays: [0.4, 0.3, 0.25, 0.2, 0.15], g: 0.4 });
  b.nz({ c: 'white', a: 0.003, d: 0.18, g: 0.22, ft: 'highpass', f: 6500 });
});
def('sub_thump', { sr: 16000, dur: 0.5, n: 2, vol: -5, vary: 0.8, cat: 'sub', pri: 0 }, (b) => {
  const dr = b.drive(1.5);
  b.tone({ f: [[0, 88], [0.2, 31]], d: 0.34, dst: dr });
  b.tone({ f: [[0, 190], [0.04, 70]], d: 0.05, g: 0.45, dst: dr });
});
def('hurt', { dur: 0.38, n: 3, vol: -5, vary: 1, cat: 'hurt', pri: 0 }, (b) => {
  const dr = b.drive(3);
  b.tone({ f: [[0, 115], [0.15, 40]], d: 0.2, dst: dr });
  b.nz({ c: 'brown', d: 0.14, g: 0.8, ft: 'lowpass', f: 700, dst: dr });
  b.nz({ c: 'white', d: 0.04, g: 0.4, ft: 'bandpass', f: 1500, dst: dr });
  const vox = b.formants([[650, 3.5, 1], [1100, 4, 0.5]], b.out);
  b.tone({ type: 'sawtooth', f: [[0, b.R(135, 160)], [0.14, 92]], a: 0.012, d: 0.14, g: 0.5, dst: vox });
});

// ---- kills ----------------------------------------------------------------------------------
def('kill_flesh', { dur: 0.48, n: 4, vol: -4, vary: 1.2, cat: 'kill', pri: 0 }, (b) => {
  const dr = b.drive(2.5);
  b.crackle({ dur: 0.16, rate: 1600, g: 0.9, ft: 'bandpass', f: b.R(1400, 2000), Q: 0.7, dst: dr, len: 30 });
  b.tone({ f: [[0, 125], [0.15, 36]], d: 0.26, dst: dr });
  b.nz({ c: 'pink', t: 0.01, a: 0.002, d: 0.24, g: 0.75, ft: 'lowpass', f: [[0, 2600], [0.2, 380]] });
  b.nz({ c: 'white', t: 0.02, d: 0.13, g: 0.45, ft: 'bandpass', f: [[0, 950], [0.12, 280]], Q: 5 });
});
def('kill_bone', { dur: 0.42, n: 3, vol: -5, vary: 1.2, cat: 'kill', pri: 0 }, (b) => {
  b.crackle({ dur: 0.28, rate: 700, g: 0.8, ft: 'bandpass', f: 2400, Q: 0.8, len: 25 });
  for (let i = 0; i < 7; i++) b.modal({ t: b.R(0, 0.3), f: b.R(550, 1500), ratios: [1, 2.6, 4.1], decays: b.R(0.03, 0.06), g: b.R(0.2, 0.5) });
  b.tone({ f: [[0, 105], [0.1, 50]], d: 0.15, g: 0.8 });
  b.nz({ c: 'white', d: 0.03, g: 0.7, ft: 'bandpass', f: 2200, Q: 1 });
});
def('kill_stone', { dur: 0.76, n: 2, vol: -4, vary: 1, cat: 'kill', sr: 32000, pri: 0 }, (b) => {
  b.nz({ c: 'brown', a: 0.005, d: 0.55, g: 0.9, ft: 'lowpass', f: 320 });
  b.crackle({ dur: 0.6, rate: 900, g: 0.8, ft: 'lowpass', f: 3000, shape: 'exp', len: 50 });
  b.tone({ f: [[0, 85], [0.25, 34]], d: 0.32 });
  b.nz({ c: 'white', d: 0.03, g: 0.6, ft: 'bandpass', f: 1300 });
});
// the reward "tick": pitched up along a pentatonic run by the kill streak at play time
def('kill_tick', { sr: 44100, dur: 0.26, n: 1, vol: -13, vary: 0, cat: 'tick', group: 'ui', pri: 0 }, (b) => {
  const f = 659.26;
  b.tone({ f, d: 0.16, g: 0.6 });
  b.tone({ f: f * 2, d: 0.08, g: 0.3 });
  b.tone({ f: f * 3.01, d: 0.04, g: 0.15 });
  b.tone({ type: 'triangle', f: f / 2, d: 0.06, g: 0.2 });
  b.click({ g: 0.25, f: 5000, d: 0.003 });
});
def('streak_sting', { sr: 44100, dur: 1.4, n: 1, vol: -11, vary: 0, cat: 'sting', group: 'ui', pri: 1 }, (b) => {
  [76, 79, 83, 88, 91].forEach((m, i) => b.bell({ t: i * 0.05, f: mtof(m), d: 0.7, g: 0.35, ratio: 3.01, idx: 1.6 }));
  b.nz({ c: 'white', t: 0.05, a: 0.15, d: 0.8, g: 0.15, ft: 'highpass', f: 7000 });
  b.tone({ type: 'triangle', f: mtof(64), t: 0.2, a: 0.02, d: 0.9, g: 0.25 });
});
// named streak milestones (KILLING SPREE, RAMPAGE ...): rising swell into a brass power chord + crash
def('streak_shout', { dur: 2.0, n: 1, vol: -6, vary: 0, cat: 'sting', group: 'ui', pri: 1, parts: [
  { dur: 0.36, reverse: true, build: (b) => { b.nz({ c: 'white', d: 0.34, g: 0.5, ft: 'highpass', f: 4000 }); b.nz({ c: 'pink', d: 0.3, g: 0.7, ft: 'bandpass', f: 900, Q: 0.8 }); } },
  { at: 0.34, dur: 1.65, build: (b) => {
    const dr = b.drive(2);
    b.tone({ f: [[0, 80], [0.25, 32]], d: 0.45, dst: dr });
    b.nz({ c: 'white', d: 0.025, g: 0.8, ft: 'lowpass', f: 7000, dst: dr });
    b.brass({ notes: [45, 52, 57, 61, 64].map(mtof), a: 0.02, hold: 0.25, d: 0.9, g: 0.6, open: 4500 });
    b.nz({ c: 'white', a: 0.004, d: 1.2, g: 0.22, ft: 'highpass', f: 5000 });
    [81, 85, 88, 93].forEach((m, i) => b.bell({ t: 0.05 + i * 0.05, f: mtof(m), d: 0.5, g: 0.12 }));
  } },
] });
def('streak_end', { dur: 0.7, n: 1, vol: -16, vary: 0, cat: 'sting', group: 'ui', pri: 2 }, (b) => {
  b.bell({ f: mtof(76), d: 0.3, g: 0.35, ratio: 2, idx: 0.8 });
  b.bell({ t: 0.12, f: mtof(71), d: 0.45, g: 0.3, ratio: 2, idx: 0.8 });
});
def('gong', { dur: 2.8, n: 1, vol: -10, vary: 0.5, cat: 'sting', sr: 16000, pri: 1 }, (b) => {
  b.modal({ f: 98, ratios: [1, 1.47, 2.09, 2.56, 3.14, 4.2], decays: [2.4, 1.8, 1.4, 1.0, 0.8, 0.5], gains: [1, 0.7, 0.6, 0.4, 0.35, 0.2], g: 0.6, a: 0.004 });
  b.nz({ c: 'pink', d: 0.12, g: 0.5, ft: 'lowpass', f: 1200 });
});

// ---- elements -------------------------------------------------------------------------------
// CAST[el](b, s, v): cast / launch (s = 1 full spell, s = 0.45 short basic bolt)
// HIT[el](b, s, v): impact
const CHORDS4 = [[57, 60, 64, 69], [53, 57, 60, 65], [52, 56, 59, 64], [55, 59, 62, 67]];
const CAST = {
  fire(b, s) {
    b.nz({ c: 'brown', a: 0.06 * s, d: 0.42 * s, ft: 'lowpass', f: [[0, 160], [0.12 * s, 2400], [0.5 * s, 450]], Q: 2 });
    b.tone({ f: [[0, 95], [0.2 * s, 52]], a: 0.015, d: 0.22 * s, g: 0.55 });
    b.nz({ c: 'pink', a: 0.08 * s, d: 0.35 * s, g: 0.5, ft: 'bandpass', f: 650, Q: 0.7 });
    b.crackle({ t: 0.03, dur: 0.6 * s, rate: 70, g: 0.55, ft: 'highpass', f: 1400, shape: 'exp', len: 40 });
  },
  frost(b, s) {
    const n = Math.round(4 + 4 * s);
    for (let i = 0; i < n; i++) b.modal({ t: b.R(0, 0.3 * s), f: b.R(2400, 6200), ratios: [1, 2.76, 5.4], decays: b.R(0.12, 0.3) * s + 0.04, g: b.R(0.12, 0.3) });
    b.nz({ c: 'white', a: 0.1 * s, d: 0.4 * s, g: 0.35, ft: 'bandpass', f: [[0, 3000], [0.4 * s, 8500]], Q: 1.5 });
    b.tone({ f: mtof(91), a: 0.03, d: 0.5 * s, g: 0.08 }); b.tone({ f: mtof(98), a: 0.05, d: 0.45 * s, g: 0.06 });
  },
  lightning(b, s) {
    b.zap({ dur: 0.32 * s + 0.05, g: 0.6 });
    b.nz({ c: 'white', d: 0.03, ft: 'highpass', f: 3000 });
    b.tone({ type: 'square', f: 60, a: 0.005, d: 0.32 * s + 0.05, g: 0.15, dst: b.filt('lowpass', 900, 0) });
  },
  holy(b, s) {
    [62, 66, 69, 74].forEach((m, i) => b.bell({ t: i * 0.035, f: mtof(m + 12), d: 1.0 * s, g: 0.22, ratio: 3.5, idx: 1.8 }));
    b.choir({ notes: [50, 57, 62, 66].map(mtof), a: 0.15 * s, d: 0.9 * s, hold: 0.1 * s, g: 0.5 });
    b.nz({ c: 'white', a: 0.2 * s, d: 0.8 * s, g: 0.12, ft: 'highpass', f: 7500 });
  },
  rot(b, s) {
    b.nz({ c: 'pink', a: 0.01, d: 0.35 * s, ft: 'bandpass', f: [[0, 1700], [0.3 * s, 240]], Q: 8 });
    b.bubbles({ dur: 0.45 * s, n: Math.round(4 + 5 * s), fmin: 140, fmax: 420, g: 0.35 });
    const am = b.am(12, 0.8, b.filt('lowpass', 520, 0), 0, 0.5 * s);
    b.tone({ type: 'sawtooth', f: 58, a: 0.05, d: 0.4 * s, g: 0.4, dst: am });
  },
  nature(b, s) {
    b.crackle({ dur: 0.5 * s, rate: 900, g: 0.45, ft: 'bandpass', f: 4200, Q: 0.6, shape: 'bell', len: 12 });
    for (let i = 0; i < 3; i++) b.modal({ t: i * 0.075 * s, f: b.R(240, 420), ratios: [1, 2.4, 3.9], decays: 0.09, g: 0.55 });
    b.tone({ type: 'sawtooth', f: [[0, 85], [0.35 * s, 140]], a: 0.05, d: 0.3 * s, g: 0.25, dst: b.filt('bandpass', 1200, 8) });
    b.nz({ c: 'pink', a: 0.12 * s, d: 0.35 * s, g: 0.3, ft: 'bandpass', f: [[0, 600], [0.4 * s, 1800]], Q: 1 });
  },
  water(b, s) {
    b.nz({ c: 'pink', a: 0.2 * s, d: 0.4 * s, g: 0.85, ft: 'bandpass', f: [[0, 400], [0.2 * s, 1400], [0.6 * s, 550]], Q: 0.9 });
    b.bubbles({ dur: 0.55 * s, n: Math.round(5 + 7 * s), fmin: 300, fmax: 1100, g: 0.3 });
    b.nz({ c: 'white', a: 0.1 * s, d: 0.3 * s, g: 0.3, ft: 'lowpass', f: 1600 });
  },
  sand(b, s) {
    b.crackle({ dur: 0.55 * s, rate: 3200, g: 0.7, ft: 'bandpass', f: 2600, Q: 0.7, shape: 'bell', len: 6 });
    b.nz({ c: 'pink', a: 0.15 * s, d: 0.35 * s, g: 0.5, ft: 'bandpass', f: [[0, 800], [0.4 * s, 1700]], Q: 1 });
    b.nz({ c: 'brown', a: 0.05, d: 0.4 * s, g: 0.45, ft: 'lowpass', f: 160 });
  },
  earth(b, s) {
    const am = b.am(b.R(9, 13), 0.5, b.out, 0, 0.9 * s);
    b.nz({ c: 'brown', a: 0.15 * s, d: 0.6 * s, ft: 'lowpass', f: 130, dst: am });
    b.crackle({ dur: 0.45 * s, rate: 420, g: 0.6, ft: 'lowpass', f: 1600, shape: 'bell', len: 45 });
    b.modal({ t: 0.05, f: b.R(160, 210), ratios: [1, 1.8, 2.9], decays: 0.11, g: 0.5 });
  },
  sound(b, s, v) {
    const ch = CHORDS4[v % CHORDS4.length];
    ch.forEach((m, i) => b.pluckTone({ t: i * 0.03 * s, f: mtof(m + 12), d: 0.8 * s, g: 0.35 }));
    b.tone({ f: mtof(ch[0] - 12), a: 0.02, d: 0.6 * s, g: 0.35 });
    b.tone({ type: 'triangle', f: mtof(ch[0]), a: 0.12 * s, d: 0.5 * s, g: 0.25, vib: 25, vibF: 6 });
  },
  physical(b, s) {
    b.nz({ c: 'pink', a: 0.05 * s, d: 0.25 * s, g: 0.9, ft: 'bandpass', f: [[0, 600], [0.2 * s, 2100]], Q: 1.2 });
    b.fm({ f: [[0, 300], [0.25 * s, 650]], ratio: 2, index: 1.5, a: 0.02, d: 0.22 * s, g: 0.25 });
  },
};
// void and blood casts are two-part: a reversed swell that sucks in, then the release
const CAST_PARTS = {
  void: (s) => [
    { dur: 0.5 * s + 0.05, reverse: true, build: (b) => {
      b.nz({ c: 'pink', d: 0.45 * s, ft: 'bandpass', f: [[0, 1800], [0.4 * s, 300]], Q: 2.5 });
      b.fm({ f: 70, ratio: 1.5, index: 5, d: 0.4 * s, g: 0.6 });
    } },
    { at: 0.5 * s, dur: 0.6 * s + 0.1, build: (b) => {
      b.fm({ f: [[0, 85], [0.4 * s, 42]], ratio: 0.5, index: 4, d: 0.42 * s, g: 0.9, vib: 60, vibF: 7 });
      b.ring({ f1: b.R(300, 380), f2: b.R(60, 90), d: 0.3 * s, g: 0.25 });
    } },
  ],
  blood: (s) => [
    { dur: 0.32 * s + 0.04, reverse: true, build: (b) => {
      b.nz({ c: 'pink', d: 0.3 * s, ft: 'bandpass', f: [[0, 900], [0.25 * s, 250]], Q: 4 });
      b.nz({ c: 'white', d: 0.2 * s, g: 0.5, ft: 'lowpass', f: 1800 });
    } },
    { at: 0.32 * s, dur: 0.55, build: (b) => {
      b.tone({ f: [[0, 62], [0.12, 40]], d: 0.16 });
      b.tone({ t: 0.17 * Math.max(0.6, s), f: [[0, 55], [0.12, 38]], d: 0.18, g: 0.75 });
      b.click({ g: 0.3, f: 800, d: 0.008 });
    } },
  ],
};
const HIT = {
  fire(b, s) {
    const dr = b.drive(2);
    b.nz({ c: 'brown', a: 0.003, d: 0.26 * s, ft: 'lowpass', f: [[0, 3200], [0.3 * s, 300]], dst: dr });
    b.tone({ f: [[0, 120], [0.1, 55]], d: 0.12 * s, g: 0.5, dst: dr });
    b.crackle({ dur: 0.5 * s, rate: 120, g: 0.6, ft: 'highpass', f: 1200, shape: 'exp', len: 40 });
    b.nz({ c: 'white', a: 0.02, d: 0.3 * s, g: 0.22, ft: 'highpass', f: 4200 });
  },
  frost(b, s) {
    b.nz({ c: 'white', d: 0.02, ft: 'highpass', f: 2500 });
    const n = Math.round(6 + 6 * s);
    for (let i = 0; i < n; i++) b.modal({ t: b.R(0, 0.22 * s), f: b.R(2800, 8000), ratios: [1, 2.76, 5.4], decays: b.R(0.05, 0.12), g: b.R(0.15, 0.4) });
    b.tone({ f: [[0, 220], [0.05, 85]], d: 0.07, g: 0.5 });
    b.crackle({ dur: 0.12 * s + 0.03, rate: 400, g: 0.5, ft: 'highpass', f: 4000, len: 15 });
  },
  lightning(b, s) {
    const dr = b.drive(5);
    b.nz({ c: 'white', d: 0.012, dst: dr });
    b.nz({ c: 'white', t: 0.022, d: 0.01, g: 0.7, dst: dr });
    b.nz({ c: 'brown', a: 0.01, d: 0.6 * s, g: 0.7, ft: 'lowpass', f: [[0, 450], [0.6 * s, 110]] });
    b.zap({ t: 0.005, dur: 0.12 * s, g: 0.3 });
  },
  void(b, s) {
    const dr = b.drive(2);
    b.fm({ f: [[0, 70], [0.3 * s, 38]], ratio: 1.5, index: 6, index1: 0.2, d: 0.35 * s, dst: dr });
    b.ring({ f1: b.R(280, 360), f2: b.R(55, 80), d: 0.25 * s, g: 0.3 });
    b.nz({ c: 'brown', d: 0.2 * s, g: 0.6, ft: 'lowpass', f: 900, dst: dr });
  },
  holy(b, s) {
    b.modal({ f: b.R(880, 1050), ratios: [0.5, 1, 1.19, 1.5, 2, 2.5, 3], decays: [0.9, 0.7, 0.5, 0.45, 0.35, 0.25, 0.2].map((x) => x * s), gains: [0.5, 1, 0.6, 0.5, 0.4, 0.3, 0.2], g: 0.35 });
    b.crackle({ dur: 0.4 * s, rate: 90, g: 0.35, ft: 'highpass', f: 6000, shape: 'exp', len: 20 });
    b.tone({ f: [[0, 130], [0.08, 70]], d: 0.1, g: 0.5 });
    b.nz({ c: 'white', d: 0.015, g: 0.5, ft: 'highpass', f: 3000 });
  },
  rot(b, s) {
    b.nz({ c: 'white', d: 0.15 * s, g: 0.8, ft: 'lowpass', f: [[0, 2200], [0.15, 300]] });
    b.nz({ c: 'pink', d: 0.18 * s, g: 0.7, ft: 'bandpass', f: [[0, 1300], [0.16 * s, 280]], Q: 7 });
    b.bubbles({ t: 0.04, dur: 0.25 * s, n: 3, fmin: 180, fmax: 500, g: 0.3 });
  },
  nature(b, s) {
    b.modal({ f: b.R(300, 520), ratios: [1, 2.4, 3.9], decays: 0.07, g: 0.8 });
    b.crackle({ dur: 0.13 * s + 0.02, rate: 520, g: 0.6, ft: 'bandpass', f: 3000, Q: 0.8, len: 18 });
    b.tone({ f: [[0, 140], [0.06, 70]], d: 0.07, g: 0.6 });
  },
  blood(b, s) {
    b.nz({ c: 'pink', d: 0.13 * s, ft: 'lowpass', f: [[0, 1600], [0.12, 220]] });
    b.nz({ c: 'white', d: 0.11 * s, g: 0.55, ft: 'bandpass', f: [[0, 750], [0.1, 200]], Q: 6 });
    for (let i = 0; i < 3; i++) b.tone({ t: b.R(0.07, 0.25) * s, f: [[0, 850], [0.03, 1400]], d: 0.03, g: 0.12 });
    b.tone({ f: [[0, 95], [0.1, 45]], d: 0.11, g: 0.7 });
  },
  water(b, s) {
    b.nz({ c: 'white', a: 0.003, d: 0.2 * s, ft: 'bandpass', f: 2400, Q: 0.7 });
    b.nz({ c: 'white', a: 0.01, d: 0.26 * s, g: 0.4, ft: 'highpass', f: 5200 });
    b.bubbles({ t: 0.01, dur: 0.2 * s, n: Math.round(4 + 5 * s), fmin: 400, fmax: 1300, g: 0.3 });
    b.tone({ f: [[0, 125], [0.08, 70]], d: 0.09, g: 0.45 });
  },
  sand(b, s) {
    b.crackle({ dur: 0.22 * s, rate: 1600, g: 0.9, ft: 'bandpass', f: 1800, Q: 0.8, shape: 'exp', len: 14 });
    b.tone({ f: [[0, 110], [0.08, 55]], d: 0.1, g: 0.7 });
    b.nz({ c: 'white', a: 0.01, d: 0.25 * s, g: 0.3, ft: 'bandpass', f: 3200, Q: 1 });
  },
  earth(b, s) {
    const dr = b.drive(2);
    b.tone({ f: [[0, 92], [0.2, 34]], d: 0.26 * s, dst: dr });
    b.nz({ c: 'white', d: 0.03, g: 0.8, ft: 'bandpass', f: 1500, Q: 1, dst: dr });
    b.crackle({ dur: 0.4 * s, rate: 600, g: 0.6, ft: 'lowpass', f: 2600, shape: 'exp', len: 40 });
    b.nz({ c: 'brown', d: 0.4 * s, g: 0.55, ft: 'lowpass', f: 160 });
  },
  sound(b, s, v) {
    const ch = CHORDS4[(v + 1) % CHORDS4.length];
    const lp = b.filt('lowpass', [[0, 4500], [0.3 * s, 600]], 3);
    ch.forEach((m) => b.tone({ type: 'square', f: mtof(m), d: 0.32 * s, g: 0.2, dst: lp }));
    b.tone({ f: [[0, 160], [0.06, 80]], d: 0.08, g: 0.5 });
    b.nz({ c: 'white', d: 0.012, g: 0.4, ft: 'highpass', f: 3000 });
  },
  physical(b, s) {
    const dr = b.drive(2);
    b.tone({ f: [[0, 140], [0.08, 50]], d: 0.14 * s, dst: dr });
    b.nz({ c: 'pink', d: 0.12 * s, g: 0.8, ft: 'lowpass', f: [[0, 3500], [0.1, 500]], dst: dr });
    b.nz({ c: 'white', d: 0.015, g: 0.5, ft: 'highpass', f: 2500 });
  },
};
export const ELEMENTS = Object.keys(HIT);
// render lengths (s) for hit / bolt / cast, measured from the decays so no time is spent on silence
const EL_DUR = {
  fire: [0.6, 0.36, 0.74], frost: [0.4, 0.4, 0.76], lightning: [0.72, 0.36, 0.64], void: [0.6, 0.5, 1.1],
  holy: [0.8, 0.56, 1.1], rot: [0.38, 0.36, 0.7], nature: [0.24, 0.3, 0.6], blood: [0.34, 0.5, 0.75],
  water: [0.44, 0.4, 0.8], sand: [0.38, 0.36, 0.76], earth: [0.52, 0.48, 0.92], sound: [0.5, 0.56, 1.1], physical: [0.3, 0.26, 0.48],
};
const BRIGHT = { frost: 1 };   // glass partials reach past 16 kHz: keep 44.1 kHz for frost
for (const el of ELEMENTS) {
  const [dh, db, dc] = EL_DUR[el];
  const sr = BRIGHT[el] ? 44100 : undefined;
  def(el + '_hit', { dur: dh, n: 3, vol: -6, vary: 1.2, cat: 'elem', group: 'magic', lpVar: 0.6, pri: 1, sr }, (b, v) => HIT[el](b, 1, v));
  const P = CAST_PARTS[el];
  def(el + '_bolt', { dur: db, n: 2, vol: -9, vary: 1.5, cat: 'cast', group: 'magic', pri: 1, sr, parts: P && P(0.45) }, (b, v) => CAST[el](b, 0.45, v));
  def(el + '_cast', { dur: dc, n: 2, vol: -6, vary: 0.8, cat: 'cast', group: 'magic', pri: 2, sr, parts: P && P(1) }, (b, v) => CAST[el](b, 1, v));
}
// generic spell wind-up: a reversed swell, stretched at runtime to land on the cast moment
def('charge', { dur: 0.7, n: 2, vol: -14, vary: 0.5, cat: 'cast', group: 'magic', pri: 1, parts: [{ dur: 0.7, reverse: true, build: (b) => {
  b.nz({ c: 'pink', d: 0.65, ft: 'bandpass', f: [[0, 2600], [0.6, 500]], Q: 1.6 });
  b.fm({ f: [[0, 520], [0.6, 260]], ratio: 2.01, index: 2, d: 0.6, g: 0.25 });
} }] });

// ---- explosions & slams ---------------------------------------------------------------------
def('boom_small', { dur: 0.86, n: 3, vol: -4, vary: 1.2, cat: 'boom', pri: 1 }, (b) => {
  const dr = b.drive(2.2);
  b.nz({ c: 'white', d: 0.02, ft: 'lowpass', f: 7000, dst: dr });
  b.nz({ c: 'brown', a: 0.002, d: 0.55, ft: 'lowpass', f: [[0, 2000], [0.3, 180]], dst: dr });
  b.tone({ f: [[0, 72], [0.3, 30]], d: 0.42, dst: dr });
  b.crackle({ t: 0.02, dur: 0.7, rate: 90, g: 0.35, ft: 'highpass', f: 900, shape: 'exp', len: 50 });
});
def('boom_big', { dur: 2.4, n: 2, vol: -3, vary: 1, cat: 'boom', sr: 32000, pri: 1 }, (b) => {
  const dr = b.drive(2.5);
  b.nz({ c: 'white', d: 0.025, ft: 'lowpass', f: 9000, dst: dr });
  b.nz({ c: 'brown', a: 0.003, d: 0.9, ft: 'lowpass', f: [[0, 2600], [0.5, 140]], dst: dr });
  b.tone({ f: [[0, 62], [0.5, 24]], d: 0.8, dst: dr });
  const am = b.am(b.R(4, 7), 0.5, b.out, 0, 2.4);
  b.nz({ c: 'brown', t: 0.05, a: 0.08, d: 1.7, g: 0.8, ft: 'lowpass', f: 130, dst: am });
  b.crackle({ t: 0.03, dur: 1.6, rate: 70, g: 0.3, ft: 'highpass', f: 700, shape: 'exp', len: 60 });
});
def('rumble_tail', { dur: 2.6, n: 1, vol: -9, vary: 1, cat: 'boom', sr: 22050, pri: 1 }, (b) => {
  const am = b.am(b.R(3, 5), 0.6, b.out, 0, 2.6);
  b.nz({ c: 'brown', a: 0.15, d: 2.1, ft: 'lowpass', f: b.R(100, 140), dst: am });
});
def('slam', { dur: 0.8, n: 3, vol: -3, vary: 1, cat: 'boom', sr: 32000, pri: 1 }, (b) => {
  const dr = b.drive(2.2);
  b.tone({ f: [[0, 78], [0.25, 28]], d: 0.46, dst: dr });
  b.nz({ c: 'white', d: 0.04, g: 0.9, ft: 'lowpass', f: 3200, dst: dr });
  b.crackle({ t: 0.01, dur: 0.5, rate: 500, g: 0.6, ft: 'lowpass', f: 2200, shape: 'exp', len: 45 });
  b.nz({ c: 'brown', d: 0.6, g: 0.7, ft: 'lowpass', f: 170 });
});

// ---- abilities ------------------------------------------------------------------------------
def('dash', { dur: 0.4, n: 3, vol: -7, vary: 1, cat: 'ability', pri: 1 }, (b) => {
  b.nz({ c: 'pink', a: 0.12, d: 0.18, ft: 'bandpass', f: [[0, 500], [0.15, 4200]], Q: 1.4 });
  b.tone({ f: [[0, 380], [0.15, 1700]], a: 0.03, d: 0.13, g: 0.12 });
  b.nz({ c: 'white', a: 0.08, d: 0.12, g: 0.3, ft: 'highpass', f: 6000 });
  b.nz({ c: 'brown', a: 0.01, d: 0.12, g: 0.5, ft: 'lowpass', f: 300 });
});
// seamless 1 s loops: rendered long, the steady middle second is kept (`slice`)
def('spin_loop', { dur: 3, slice: [1, 2], loop: true, n: 1, vol: -11, vary: 0, cat: 'loop', pri: 1 }, (b) => {
  for (let i = 0; i < 24; i++) {
    const t = i * 0.125;
    b.nz({ c: 'pink', t, a: 0.05, d: 0.09, g: i % 2 ? 0.8 : 1, ft: 'bandpass', f: [[0, 600], [0.05, 1900], [0.14, 700]], Q: 1.3 });
  }
  const am = b.am(8, 0.7, b.out, 0, 3);
  b.nz({ c: 'brown', a: 0.01, hold: 3, d: 0.1, g: 0.6, ft: 'lowpass', f: 320, dst: am });
});
def('beam_loop', { dur: 2, slice: [0.5, 1.5], loop: true, n: 1, vol: -15, vary: 0, cat: 'loop', group: 'magic', pri: 2 }, (b) => {
  const bp = b.filt('bandpass', 1400, 0.8);
  const am = b.am(10, 0.4, bp, 0, 2);
  [110, 165, 220, 331].forEach((f, i) => b.tone({ type: 'sawtooth', f, a: 0.001, hold: 2, d: 0.1, g: [0.5, 0.3, 0.25, 0.15][i], dst: am }));
  b.nz({ c: 'white', a: 0.001, hold: 2, d: 0.1, g: 0.25, ft: 'bandpass', f: 3200, Q: 2 });
});
def('nova', { dur: 1.0, n: 2, vol: -5, vary: 1, cat: 'ability', pri: 1, parts: [
  { dur: 0.28, reverse: true, build: (b) => { b.nz({ c: 'pink', d: 0.26, ft: 'bandpass', f: 2000, Q: 1 }); b.tone({ f: 200, d: 0.25, g: 0.3 }); } },
  { at: 0.27, dur: 0.75, build: (b) => {
    const dr = b.drive(2);
    b.nz({ c: 'brown', d: 0.45, ft: 'lowpass', f: [[0, 3200], [0.4, 220]], dst: dr });
    b.tone({ f: [[0, 75], [0.3, 33]], d: 0.42, dst: dr });
    b.modal({ f: 440, ratios: [1, 1.5, 2.01], decays: 0.6, g: 0.18 });
  } },
] });
def('zap_small', { dur: 0.25, n: 4, vol: -10, vary: 1.5, cat: 'ability', group: 'magic', pri: 1 }, (b) => {
  b.fm({ f: [[0, b.R(1100, 1400)], [0.12, 300]], ratio: 1.5, index: 3, d: 0.15, g: 0.6 });
  b.nz({ c: 'white', d: 0.03, g: 0.3, ft: 'highpass', f: 4000 });
});
def('buff_up', { dur: 1.4, n: 2, vol: -8, vary: 0.5, cat: 'ability', group: 'magic', pri: 2 }, (b, v) => {
  const root = v ? 57 : 55;
  const lp = b.filt('lowpass', [[0, 300], [0.7, 5200]], 4);
  for (const iv of [0, 7, 12]) for (const det of [-6, 6]) b.tone({ type: 'sawtooth', f: mtof(root + iv), a: 0.6, d: 0.6, g: 0.12, dst: lp, det });
  [0, 2, 4, 7, 9, 12].forEach((iv, i) => b.bell({ t: 0.1 + i * 0.075, f: mtof(root + 24 + iv), d: 0.35, g: 0.2, ratio: 3.01, idx: 1.4 }));
  b.nz({ c: 'pink', a: 0.5, d: 0.3, g: 0.35, ft: 'bandpass', f: [[0, 300], [0.6, 3200]], Q: 1 });
});
def('warcry', { dur: 1.3, n: 2, vol: -5, vary: 1, cat: 'ability', pri: 2 }, (b) => {
  const form = b.formants([[650, 3, 1], [1100, 4, 0.6], [2500, 5, 0.25]], b.drive(3));
  b.tone({ type: 'sawtooth', f: [[0, b.R(105, 125)], [0.2, b.R(130, 150)], [0.9, 95]], a: 0.04, hold: 0.3, d: 0.55, g: 0.9, dst: form, vib: 35, vibF: 5.5 });
  b.fm({ f: [[0, 90], [0.9, 70]], ratio: 0.5, index: 8, index1: 3, a: 0.05, d: 0.8, g: 0.5, dst: b.drive(4, b.filt('bandpass', 900, 0.7)) });
  b.nz({ c: 'pink', a: 0.05, d: 0.7, g: 0.35, ft: 'bandpass', f: 1200 });
  b.tone({ f: [[0, 90], [0.15, 40]], d: 0.2, g: 0.7 });
});
def('heal', { dur: 1.8, n: 2, vol: -8, vary: 0.3, cat: 'ability', group: 'magic', pri: 2 }, (b, v) => {
  const root = v ? 72 : 74;
  [0, 4, 7, 12].forEach((iv, i) => {
    b.tone({ f: mtof(root + iv), a: 0.25, d: 1.1, g: 0.14 });
    b.tone({ type: 'triangle', f: mtof(root + iv - 12), t: i * 0.04, a: 0.3, d: 1.0, g: 0.1 });
  });
  [0, 4, 7, 12, 16, 19, 24, 28].forEach((iv, i) => b.bell({ t: 0.1 + i * 0.09, f: mtof(root + 12 + iv), d: 0.4, g: 0.12, ratio: 4, idx: 1 }));
  b.nz({ c: 'white', a: 0.3, d: 0.9, g: 0.08, ft: 'highpass', f: 8000 });
});
def('blink', { dur: 0.7, n: 3, vol: -7, vary: 1.2, cat: 'ability', group: 'magic', pri: 1, parts: [
  { dur: 0.26, reverse: true, build: (b) => { b.nz({ c: 'pink', d: 0.24, ft: 'bandpass', f: 3000, Q: 1.5 }); b.tone({ f: [[0, 1200], [0.2, 300]], d: 0.22, g: 0.25 }); } },
  { at: 0.25, dur: 0.45, build: (b) => {
    b.tone({ f: [[0, 950], [0.05, 200]], d: 0.07, g: 0.8 });
    b.nz({ c: 'white', d: 0.03, g: 0.6, ft: 'highpass', f: 3000 });
    [1, 1.5, 2.25, 3].forEach((k, i) => b.tone({ f: 1200 * k, a: 0.01, d: 0.3, g: 0.07, vib: 40, vibF: 9 + i }));
  } },
] });
def('summon', { dur: 1.7, n: 2, vol: -7, vary: 1, cat: 'ability', group: 'magic', sr: 22050, pri: 2 }, (b) => {
  b.nz({ c: 'brown', a: 0.8, d: 0.5, g: 0.9, ft: 'lowpass', f: [[0, 90], [0.9, 650]] });
  b.fm({ f: 55, ratio: 0.5, index: 5, a: 0.6, d: 0.7, g: 0.5 });
  b.modal({ t: 0.75, f: 330, ratios: [0.5, 1, 1.19, 1.5, 2], decays: 0.8, g: 0.3 });
  b.tone({ t: 0.75, f: [[0, 90], [0.2, 40]], d: 0.3, g: 0.6 });
});
def('summon_pop', { dur: 0.5, n: 2, vol: -12, vary: 2, cat: 'ability', group: 'magic', pri: 2, parts: [
  { dur: 0.2, reverse: true, build: (b) => b.nz({ c: 'pink', d: 0.18, ft: 'bandpass', f: 1200, Q: 1 }) },
  { at: 0.19, dur: 0.3, build: (b) => { b.tone({ f: [[0, 500], [0.06, 140]], d: 0.08, g: 0.8 }); b.nz({ c: 'brown', d: 0.1, g: 0.5, ft: 'lowpass', f: 700 }); } },
] });
def('zone', { dur: 1.2, n: 2, vol: -8, vary: 1, cat: 'ability', group: 'magic', pri: 2 }, (b) => {
  const lp = b.filt('lowpass', [[0, 200], [0.4, 600]], 2);
  b.tone({ type: 'sawtooth', f: 55, a: 0.3, d: 0.7, g: 0.35, dst: lp });
  b.tone({ type: 'sawtooth', f: 82.4, a: 0.3, d: 0.7, g: 0.25, dst: lp });
  b.nz({ c: 'pink', a: 0.1, d: 0.5, g: 0.6, ft: 'bandpass', f: [[0, 2200], [0.5, 400]], Q: 1 });
  b.modal({ t: 0.05, f: 220, ratios: [1, 2, 3.01], decays: 0.7, g: 0.15 });
});
def('meteor_whistle', { dur: 1.2, n: 1, vol: -11, vary: 0.5, cat: 'ability', group: 'magic', pri: 2 }, (b) => {
  b.tone({ f: [[0, 2600], [1.1, 280]], a: 0.35, hold: 0.55, d: 0.2, g: 0.35, vib: 30, vibF: 11 });
  b.nz({ c: 'white', a: 0.4, hold: 0.5, d: 0.2, g: 0.35, ft: 'bandpass', f: [[0, 3000], [1.1, 500]], Q: 3 });
});
def('stealth', { dur: 0.8, n: 2, vol: -10, vary: 1, cat: 'ability', group: 'magic', pri: 2 }, (b) => {
  b.nz({ c: 'pink', a: 0.05, d: 0.5, g: 0.8, ft: 'bandpass', f: [[0, 3200], [0.5, 280]], Q: 1.2 });
  b.tone({ f: [[0, 800], [0.45, 180]], a: 0.04, d: 0.4, g: 0.12 });
});
def('trap_set', { dur: 0.2, n: 2, vol: -9, vary: 1, cat: 'ability', pri: 2 }, (b) => {
  b.modal({ f: b.R(1400, 1700), ratios: [1, 2.1, 3.3], decays: 0.03, g: 0.7 });
  b.modal({ t: 0.085, f: b.R(1100, 1300), ratios: [1, 2.1, 3.3], decays: 0.04, g: 0.8 });
  b.tone({ t: 0.085, f: [[0, 220], [0.04, 120]], d: 0.05, g: 0.6 });
});
def('totem', { dur: 0.64, n: 2, vol: -7, vary: 1, cat: 'ability', pri: 2 }, (b) => {
  for (let i = 0; i < 3; i++) b.modal({ t: i * 0.11, f: b.R(220, 320), ratios: [1, 2.4, 3.9], decays: 0.1, g: 0.7 });
  b.tone({ t: 0.22, f: [[0, 100], [0.15, 45]], d: 0.2, g: 0.8 });
  b.crackle({ t: 0.2, dur: 0.4, rate: 700, g: 0.35, ft: 'bandpass', f: 4000, shape: 'exp', len: 12 });
});
def('flask_throw', { dur: 0.3, n: 2, vol: -9, vary: 1.5, cat: 'ability', pri: 2 }, (b) => {
  b.modal({ f: b.R(2200, 2700), ratios: [1, 2.32, 3.9], decays: 0.12, g: 0.4 });
  b.nz({ c: 'pink', t: 0.02, a: 0.06, d: 0.15, g: 0.7, ft: 'bandpass', f: [[0, 700], [0.08, 2400]], Q: 1.3 });
  b.bubbles({ t: 0.02, dur: 0.2, n: 3, fmin: 500, fmax: 900, g: 0.2 });
});

// ---- defense --------------------------------------------------------------------------------
def('dodge', { dur: 0.4, n: 3, vol: -9, vary: 1.2, cat: 'def', pri: 0 }, (b) => {
  b.nz({ c: 'pink', a: 0.1, d: 0.2, ft: 'bandpass', f: [[0, 380], [0.12, 1700], [0.32, 480]], Q: 1 });
  const am = b.am(b.R(26, 34), 0.7, b.out, 0, 0.35);
  b.nz({ c: 'white', a: 0.05, d: 0.15, g: 0.3, ft: 'bandpass', f: 2600, Q: 1.5, dst: am });
  b.nz({ c: 'brown', t: 0.24, d: 0.06, g: 0.4, ft: 'lowpass', f: 800 });
});
def('block', { dur: 0.7, n: 3, vol: -5, vary: 1.2, cat: 'def', pri: 0 }, (b) => {
  b.click({ g: 0.8, f: 1800 });
  b.modal({ f: b.R(380, 520), ratios: [1, 2.08, 2.74, 3.97, 5.33], decays: [0.5, 0.35, 0.28, 0.2, 0.13], g: 0.6, jit: 0.015 });
  b.tone({ f: [[0, 160], [0.06, 80]], d: 0.09, g: 0.8 });
  b.nz({ c: 'white', d: 0.07, g: 0.4, ft: 'bandpass', f: 3500, Q: 2 });
});
def('parry', { dur: 1.45, n: 2, vol: -5, vary: 0.8, cat: 'def', pri: 0 }, (b) => {
  b.click({ g: 1, f: 2500 });
  b.modal({ f: b.R(1250, 1450), ratios: [1, 1.5, 2.0, 2.76, 3.5], decays: [1.2, 0.9, 0.7, 0.5, 0.4], g: 0.6 });
  b.nz({ c: 'white', a: 0.002, d: 0.28, g: 0.5, ft: 'bandpass', f: [[0, 6500], [0.25, 3000]], Q: 3 });
  b.bell({ t: 0.01, f: mtof(88), d: 0.8, g: 0.18, ratio: 3, idx: 1.2 });
  b.bell({ t: 0.01, f: mtof(95), d: 0.7, g: 0.12, ratio: 3, idx: 1.2 });
  b.tone({ f: [[0, 180], [0.05, 90]], d: 0.08, g: 0.6 });
});
def('guard', { dur: 0.14, n: 2, vol: -16, vary: 1.5, cat: 'def', pri: 1 }, (b) => {
  b.crackle({ dur: 0.1, rate: 350, g: 0.6, ft: 'bandpass', f: 2200, Q: 1, len: 10 });
  b.tone({ f: [[0, 190], [0.04, 120]], d: 0.05, g: 0.5 });
  b.modal({ t: 0.01, f: b.R(900, 1200), ratios: [1, 2.3], decays: 0.05, g: 0.25 });
});

// ---- footsteps by surface (quiet, many variants, 32 kHz) ------------------------------------
const STEP = { n: 4, vol: -21, vary: 1.5, cat: 'step', lpVar: 0.8, pri: 1 };
const heel = (b, f = 120, g = 0.6) => b.tone({ f: [[0, f], [0.04, f * 0.58]], d: 0.05, g });
def('step_grass', { ...STEP, dur: 0.14 }, (b) => {
  heel(b);
  b.crackle({ dur: 0.09, rate: 900, g: 0.7, ft: 'bandpass', f: b.R(2500, 3800), Q: 0.7, shape: 'exp', len: 8 });
  b.nz({ c: 'pink', a: 0.005, d: 0.06, g: 0.35, ft: 'bandpass', f: 1200, Q: 0.8 });
});
def('step_dirt', { ...STEP, dur: 0.12 }, (b) => {
  heel(b, 140, 0.7);
  b.crackle({ dur: 0.08, rate: 700, g: 0.8, ft: 'bandpass', f: b.R(1500, 2200), Q: 0.9, shape: 'exp', len: 20 });
});
def('step_stone', { ...STEP, dur: 0.1, vol: -20 }, (b) => {
  b.click({ g: 0.6, f: 1800, d: 0.003 });
  b.tone({ f: [[0, 220], [0.02, 150]], d: 0.035, g: 0.6 });
  b.modal({ f: b.R(900, 1300), ratios: [1, 2.3], decays: 0.02, g: 0.2 });
  b.crackle({ dur: 0.04, rate: 500, g: 0.3, ft: 'highpass', f: 3000, len: 6 });
});
def('step_sand', { ...STEP, dur: 0.15 }, (b) => {
  b.crackle({ t: 0.005, dur: 0.12, rate: 4000, g: 0.6, ft: 'bandpass', f: 2200, Q: 0.6, shape: 'bell', len: 4 });
  heel(b, 100, 0.4);
});
def('step_snow', { ...STEP, dur: 0.16 }, (b) => {
  b.crackle({ dur: 0.13, rate: 1800, g: 0.8, ft: 'bandpass', f: b.R(1300, 1800), Q: 1.2, shape: 'bell', len: 14 });
  heel(b, 110, 0.4);
});
def('step_ash', { ...STEP, dur: 0.12 }, (b) => {
  b.crackle({ dur: 0.09, rate: 1200, g: 0.8, ft: 'highpass', f: 2500, shape: 'exp', len: 6 });
  heel(b, 130, 0.5);
});
def('step_splash', { ...STEP, dur: 0.18, vol: -19 }, (b) => {
  b.nz({ c: 'white', a: 0.004, d: 0.1, g: 0.8, ft: 'bandpass', f: b.R(1400, 2200), Q: 0.8 });
  b.bubbles({ dur: 0.08, n: 3, fmin: 500, fmax: 1100, g: 0.25 });
  heel(b, 120, 0.4);
});
def('swim', { dur: 0.6, n: 3, vol: -16, vary: 1.5, cat: 'step', pri: 2 }, (b) => {
  b.nz({ c: 'pink', a: 0.15, d: 0.3, g: 0.8, ft: 'bandpass', f: [[0, 400], [0.15, 1200], [0.45, 500]], Q: 1 });
  b.bubbles({ t: 0.1, dur: 0.3, n: 5, fmin: 300, fmax: 900, g: 0.25 });
});
def('hoof', { dur: 0.16, n: 4, vol: -15, vary: 1.5, cat: 'step', pri: 2 }, (b) => {
  for (const [t, g] of [[0, 1], [b.R(0.06, 0.08), 0.75]]) {
    b.modal({ t, f: b.R(420, 560), ratios: [1, 1.6, 2.7], decays: 0.03, g: 0.6 * g });
    b.tone({ t, f: [[0, 260], [0.03, 120]], d: 0.04, g: 0.6 * g });
    b.crackle({ t, dur: 0.04, rate: 600, g: 0.3 * g, ft: 'bandpass', f: 2000, len: 10 });
  }
});

// ---- weapon swap & equipment ----------------------------------------------------------------
def('equip', { dur: 0.36, n: 3, vol: -10, vary: 1, cat: 'swap', pri: 1 }, (b) => {
  b.crackle({ dur: 0.22, rate: 500, g: 0.6, ft: 'bandpass', f: 3000, Q: 0.9, shape: 'bell', len: 10 });
  for (let i = 0; i < 4; i++) b.modal({ t: b.R(0.02, 0.2), f: b.R(2500, 4000), ratios: [1, 1.7], decays: 0.03, g: b.R(0.1, 0.25) });
  b.modal({ t: 0.24, f: b.R(1300, 1600), ratios: [1, 2.2], decays: 0.03, g: 0.5 });
  b.tone({ t: 0.24, f: [[0, 200], [0.03, 120]], d: 0.04, g: 0.4 });
});
def('swap_blade', { dur: 0.7, n: 3, vol: -9, vary: 1, cat: 'swap', pri: 1 }, (b) => {
  b.nz({ c: 'white', a: 0.06, d: 0.22, g: 0.7, ft: 'bandpass', f: [[0, 2400], [0.25, 7200]], Q: 4 });
  b.modal({ t: 0.2, f: b.R(2400, 2900), ratios: [1, 1.48, 2.21, 2.93], decays: 0.45, g: 0.45 });
  b.click({ t: 0.2, g: 0.5, f: 3000 });
});
def('swap_heavy', { dur: 0.26, n: 2, vol: -8, vary: 1, cat: 'swap', pri: 1 }, (b) => {
  b.tone({ f: [[0, 170], [0.08, 80]], d: 0.12 });
  b.modal({ f: b.R(280, 340), ratios: [1, 2.3, 3.7], decays: 0.16, g: 0.5 });
  b.crackle({ dur: 0.12, rate: 400, g: 0.4, ft: 'bandpass', f: 1800, len: 12 });
});
def('swap_bow', { dur: 0.5, n: 2, vol: -9, vary: 1, cat: 'swap', pri: 1 }, (b) => {
  b.pluck({ f: b.R(140, 160), fb: 0.97, damp: 3000, g: 0.6, d: 0.3 });
  b.modal({ f: b.R(380, 440), ratios: [1, 2.4], decays: 0.06, g: 0.5 });
  b.crackle({ t: 0.05, dur: 0.12, rate: 300, g: 0.3, ft: 'bandpass', f: 2000, len: 10 });
});
def('swap_staff', { dur: 0.7, n: 2, vol: -9, vary: 1, cat: 'swap', group: 'magic', pri: 1 }, (b) => {
  b.tone({ f: [[0, 210], [0.05, 140]], d: 0.06, g: 0.6 });
  b.nz({ c: 'pink', a: 0.15, d: 0.3, g: 0.6, ft: 'bandpass', f: [[0, 600], [0.3, 2400]], Q: 1.2 });
  b.fm({ t: 0.1, f: b.R(1400, 1700), ratio: 3.01, index: 2, d: 0.4, g: 0.2, vib: 20, vibF: 7 });
});
def('swap_tome', { dur: 0.6, n: 2, vol: -9, vary: 1, cat: 'swap', pri: 1 }, (b) => {
  let t = 0;
  for (let i = 0; i < 4; i++) { b.nz({ t, c: 'white', a: 0.008, d: 0.05, g: b.R(0.4, 0.7), ft: 'bandpass', f: b.R(3500, 5500), Q: 0.7, ft2: 'highpass', f2: 1800 }); t += b.R(0.04, 0.065); }
  b.nz({ t: 0.27, c: 'brown', d: 0.06, g: 0.7, ft: 'lowpass', f: 450 });
  b.tone({ t: 0.27, f: [[0, 160], [0.04, 100]], d: 0.05, g: 0.4 });
  b.bell({ t: 0.3, f: mtof(84), d: 0.3, g: 0.08 });
});

// ---- loot & economy -------------------------------------------------------------------------
const shimmer = (b, t, a, d, g) => b.nz({ c: 'white', t, a, d, g, ft: 'highpass', f: 7000 });
def('loot_0', { dur: 0.15, n: 2, vol: -12, vary: 1, cat: 'loot', group: 'ui', pri: 1 }, (b) => {
  b.modal({ f: b.R(850, 1000), ratios: [1, 2.5], decays: 0.05, g: 0.6 });
  b.crackle({ dur: 0.05, rate: 300, g: 0.3, ft: 'bandpass', f: 2500, len: 10 });
  b.tone({ f: mtof(84), d: 0.1, g: 0.15 });
});
def('loot_1', { dur: 0.7, n: 1, vol: -11, vary: 0, cat: 'loot', group: 'ui', pri: 1 }, (b) => {
  b.bell({ f: mtof(79), d: 0.4, g: 0.4 }); b.bell({ t: 0.07, f: mtof(86), d: 0.45, g: 0.4 });
});
def('loot_2', { sr: 44100, dur: 0.86, n: 1, vol: -10, vary: 0, cat: 'loot', group: 'ui', pri: 1 }, (b) => {
  [84, 88, 91].forEach((m, i) => b.bell({ t: i * 0.06, f: mtof(m), d: 0.5, g: 0.35 }));
  shimmer(b, 0.02, 0.05, 0.4, 0.12);
});
def('loot_3', { sr: 44100, dur: 1.35, n: 1, vol: -9, vary: 0, cat: 'loot', group: 'ui', pri: 2 }, (b) => {
  [81, 85, 88, 93, 97].forEach((m, i) => b.bell({ t: i * 0.06, f: mtof(m), d: 0.7, g: 0.3 }));
  b.choir({ notes: [57, 64, 69].map(mtof), a: 0.1, d: 1.0, g: 0.3 });
  shimmer(b, 0.05, 0.2, 0.8, 0.12);
});
def('loot_4', { dur: 2.8, n: 1, vol: -7, vary: 0, cat: 'loot', group: 'ui', pri: 2 }, (b) => {
  b.choir({ notes: [50, 57, 62, 66, 69].map(mtof), a: 0.45, hold: 0.4, d: 1.6, g: 0.55 });
  [74, 78, 81, 86, 90, 93].forEach((m, i) => b.bell({ t: 0.35 + i * 0.07, f: mtof(m), d: 1.0, g: 0.22, ratio: 3.5 }));
  b.tone({ t: 0.35, f: [[0, 80], [0.3, 36]], d: 0.5, g: 0.7 });
  b.modal({ t: 0.35, f: 147, ratios: [1, 1.47, 2.09, 2.56], decays: 1.6, g: 0.25 });
  shimmer(b, 0.1, 0.5, 1.4, 0.18);
});
def('loot_5', { dur: 3.2, n: 1, vol: -6, vary: 0, cat: 'loot', group: 'ui', pri: 2, parts: [
  { dur: 0.8, reverse: true, build: (b) => { shimmer(b, 0, 0.001, 0.75, 0.6); b.nz({ c: 'pink', d: 0.7, g: 0.4, ft: 'bandpass', f: 1500, Q: 0.8 }); } },
  { at: 0.78, dur: 2.4, build: (b) => {
    b.choir({ notes: [45, 52, 57, 60, 64].map(mtof), a: 0.08, hold: 0.4, d: 1.5, g: 0.55 });
    [69, 72, 76, 81, 84, 88].forEach((m, i) => b.bell({ t: i * 0.06, f: mtof(m), d: 1.1, g: 0.22, ratio: 3.5 }));
    b.modal({ f: 82, ratios: [1, 1.47, 2.09, 2.56, 3.14], decays: [2, 1.5, 1.1, 0.8, 0.6], g: 0.45 });
    b.tone({ f: [[0, 70], [0.4, 28]], d: 0.6 });
    shimmer(b, 0, 0.01, 1.4, 0.2);
  } },
] });
def('coin', { sr: 44100, dur: 0.32, n: 4, vol: -12, vary: 1, cat: 'coin', group: 'ui', pri: 1 }, (b) => {
  let t = 0;
  for (let i = 0, k = 2 + Math.floor(b.R(0, 2)); i < k; i++) { b.modal({ t, f: b.R(2900, 4200), ratios: [1, 1.34, 2.72, 3.9], decays: [0.14, 0.1, 0.07, 0.05], g: b.R(0.4, 0.7) }); t += b.R(0.03, 0.07); }
});
def('coin_shower', { sr: 44100, dur: 0.75, n: 1, vol: -11, vary: 0.5, cat: 'coin', group: 'ui', pri: 2 }, (b) => {
  for (let i = 0; i < 12; i++) b.modal({ t: b.R(0, 0.55), f: b.R(2700, 4500), ratios: [1, 1.34, 2.72, 3.9], decays: [0.14, 0.1, 0.07, 0.05], g: b.R(0.25, 0.55) });
});
def('mat', { dur: 0.14, n: 2, vol: -14, vary: 2, cat: 'coin', group: 'ui', pri: 1 }, (b) => {
  b.tone({ f: [[0, 380], [0.04, 900]], d: 0.07, g: 0.5 });
  b.click({ g: 0.25, f: 3000 });
});
def('potion', { dur: 0.7, n: 1, vol: -9, vary: 1, cat: 'misc', pri: 2 }, (b) => {
  b.tone({ f: [[0, 650], [0.03, 260]], d: 0.04, g: 0.6 });
  b.click({ g: 0.4, f: 2000 });
  for (let i = 0; i < 4; i++) b.tone({ t: 0.15 + i * 0.13, f: [[0, b.R(170, 220)], [0.05, b.R(360, 420)]], a: 0.005, d: 0.07, g: 0.45 });
  b.nz({ c: 'pink', t: 0.12, a: 0.05, d: 0.5, g: 0.2, ft: 'lowpass', f: 900 });
});

// ---- progression, world & UI ----------------------------------------------------------------
def('levelup', { dur: 2.8, n: 1, vol: -6, vary: 0, cat: 'sting', group: 'ui', pri: 2 }, (b) => {
  [62, 66, 69, 74].forEach((m, i) => b.brass({ t: i * 0.09, notes: [mtof(m)], a: 0.02, d: 0.25, g: 0.4 }));
  b.brass({ t: 0.36, notes: [50, 62, 69, 74, 78].map(mtof), a: 0.04, hold: 0.5, d: 1.4, g: 0.6, open: 4200 });
  b.nz({ c: 'white', t: 0.36, a: 0.01, d: 1.6, g: 0.25, ft: 'highpass', f: 5500 });
  b.tone({ t: 0.36, f: [[0, 90], [0.2, 40]], d: 0.35, g: 0.8 });
  [0, 4, 7, 12, 16, 19].forEach((iv, i) => b.bell({ t: 0.4 + i * 0.07, f: mtof(86 + iv), d: 0.6, g: 0.12 }));
  b.choir({ t: 0.36, notes: [62, 66, 69].map(mtof), a: 0.3, hold: 0.4, d: 1.4, g: 0.35 });
});
def('quest', { dur: 2.0, n: 1, vol: -7, vary: 0, cat: 'sting', group: 'ui', pri: 2 }, (b) => {
  b.brass({ t: 0, notes: [62, 66, 69].map(mtof), a: 0.02, d: 0.2, g: 0.45 });
  b.brass({ t: 0.18, notes: [62, 67, 71].map(mtof), a: 0.02, d: 0.2, g: 0.45 });
  b.brass({ t: 0.36, notes: [50, 62, 66, 69, 74].map(mtof), a: 0.03, hold: 0.35, d: 1.1, g: 0.6 });
  b.nz({ c: 'white', t: 0.36, a: 0.01, d: 1.0, g: 0.15, ft: 'highpass', f: 6000 });
});
def('tut_step', { dur: 0.8, n: 1, vol: -12, vary: 0, cat: 'sting', group: 'ui', pri: 2 }, (b) => {
  b.bell({ f: mtof(76), d: 0.5, g: 0.35 }); b.bell({ t: 0.1, f: mtof(83), d: 0.6, g: 0.35 });
});
def('toast', { dur: 0.15, n: 1, vol: -18, vary: 0.5, cat: 'toast', group: 'ui', pri: 1 }, (b) => {
  b.tone({ f: 1250, d: 0.05, g: 0.4 }); b.tone({ t: 0.04, f: 1660, d: 0.06, g: 0.3 });
});
def('denied', { dur: 0.2, n: 2, vol: -14, vary: 0.5, cat: 'denied', group: 'ui', pri: 1 }, (b) => {
  b.tone({ type: 'triangle', f: [[0, 230], [0.08, 160]], d: 0.12, g: 0.6 });
  b.tone({ type: 'square', f: 110, d: 0.1, g: 0.3, dst: b.filt('lowpass', 450, 0) });
});
def('ui_click', { sr: 44100, dur: 0.05, n: 3, vol: -14, vary: 1.5, cat: 'ui', group: 'ui', pri: 0 }, (b) => {
  b.nz({ c: 'white', d: 0.007, ft: 'bandpass', f: b.R(3000, 4000), Q: 1.2 });
  b.tone({ f: [[0, 1900], [0.02, 1200]], d: 0.018, g: 0.35 });
  b.tone({ f: [[0, 300], [0.01, 160]], d: 0.015, g: 0.3 });
});
def('ui_hover', { sr: 44100, dur: 0.04, n: 2, vol: -26, vary: 2, cat: 'hover', group: 'ui', pri: 0 }, (b) => {
  b.tone({ f: 2400, d: 0.014, g: 0.4 });
  b.nz({ c: 'white', d: 0.004, g: 0.25, ft: 'highpass', f: 6000 });
});
def('ui_open', { dur: 0.4, n: 1, vol: -14, vary: 0.5, cat: 'ui', group: 'ui', pri: 0 }, (b) => {
  b.nz({ c: 'pink', a: 0.08, d: 0.15, g: 0.7, ft: 'bandpass', f: [[0, 500], [0.12, 2200]], Q: 1.2 });
  b.tone({ t: 0.08, f: [[0, 210], [0.04, 140]], d: 0.05, g: 0.5 });
  b.bell({ t: 0.09, f: mtof(79), d: 0.2, g: 0.15 });
});
def('ui_close', { dur: 0.22, n: 1, vol: -15, vary: 0.5, cat: 'ui', group: 'ui', pri: 0 }, (b) => {
  b.nz({ c: 'pink', a: 0.05, d: 0.12, g: 0.6, ft: 'bandpass', f: [[0, 2000], [0.12, 500]], Q: 1.2 });
  b.tone({ t: 0.06, f: [[0, 180], [0.04, 110]], d: 0.05, g: 0.5 });
});
def('ui_tab', { dur: 0.06, n: 2, vol: -16, vary: 1.5, cat: 'ui', group: 'ui', pri: 0 }, (b) => {
  b.nz({ c: 'white', d: 0.02, g: 0.7, ft: 'bandpass', f: 4500, Q: 1 });
  b.tone({ f: 1500, d: 0.025, g: 0.3 });
});
def('signature', { dur: 2.3, n: 1, vol: -5, vary: 0, cat: 'sting', pri: 2, parts: [
  { dur: 0.6, reverse: true, build: (b) => { b.nz({ c: 'white', d: 0.55, g: 0.6, ft: 'highpass', f: 3000 }); b.nz({ c: 'brown', d: 0.5, g: 0.8, ft: 'lowpass', f: 400 }); b.tone({ f: 110, d: 0.5, g: 0.3 }); } },
  { at: 0.58, dur: 1.7, build: (b) => {
    const dr = b.drive(2);
    b.tone({ f: [[0, 70], [0.4, 28]], d: 0.6, dst: dr });
    b.nz({ c: 'white', d: 0.03, g: 0.8, ft: 'lowpass', f: 6000, dst: dr });
    b.brass({ notes: [45, 52, 57, 61, 64].map(mtof), a: 0.03, hold: 0.3, d: 1.0, g: 0.55 });
    b.nz({ c: 'white', a: 0.005, d: 1.3, g: 0.25, ft: 'highpass', f: 5000 });
  } },
] });
def('mount', { dur: 0.86, n: 1, vol: -9, vary: 1, cat: 'misc', pri: 2 }, (b) => {
  [0, 0.12, 0.3, 0.42].forEach((t) => { b.modal({ t, f: b.R(480, 560), ratios: [1, 1.6], decays: 0.03, g: 0.6 }); b.tone({ t, f: [[0, 300], [0.03, 150]], d: 0.04, g: 0.5 }); });
  b.tone({ type: 'sawtooth', f: [[0, 70], [0.3, 90]], t: 0.05, a: 0.1, d: 0.3, g: 0.2, dst: b.filt('bandpass', 700, 8) });
  b.nz({ c: 'pink', t: 0.55, a: 0.05, d: 0.25, g: 0.4, ft: 'bandpass', f: 800, Q: 1 });
});
def('travel', { dur: 1.55, n: 1, vol: -7, vary: 0, cat: 'sting', group: 'magic', pri: 2 }, (b) => {
  const am = b.am(8, 0.6, b.out, 0, 1.6);
  b.nz({ c: 'pink', a: 0.5, d: 0.8, g: 0.8, ft: 'bandpass', f: [[0, 300], [0.6, 3000], [1.4, 600]], Q: 1.5, dst: am });
  [76, 79, 83, 88].forEach((m, i) => b.bell({ t: 0.2 + i * 0.1, f: mtof(m), d: 0.6, g: 0.2 }));
  b.tone({ t: 0.9, f: [[0, 120], [0.3, 45]], d: 0.4, g: 0.6 });
});
def('waystone', { dur: 1.4, n: 1, vol: -9, vary: 0, cat: 'sting', group: 'ui', pri: 2 }, (b) => {
  [76, 83, 88].forEach((m, i) => b.bell({ t: i * 0.15, f: mtof(m), d: 0.8, g: 0.35 }));
});
def('shrine', { dur: 2.0, n: 1, vol: -9, vary: 0, cat: 'sting', group: 'ui', pri: 2 }, (b) => {
  [69, 73, 76, 81, 85, 88].forEach((m, i) => b.bell({ t: i * 0.12, f: mtof(m), d: 0.8, g: 0.3 }));
  b.choir({ t: 0.2, notes: [57, 64, 69].map(mtof), a: 0.4, d: 1.2, g: 0.35 });
});
def('chest', { dur: 1.0, n: 1, vol: -8, vary: 1, cat: 'misc', pri: 2 }, (b) => {
  b.tone({ type: 'sawtooth', f: [[0, 60], [0.3, 92]], a: 0.1, d: 0.3, g: 0.4, dst: b.filt('bandpass', 700, 8) });
  b.modal({ t: 0.32, f: 1300, ratios: [1, 2.1, 3.3], decays: 0.04, g: 0.6 });
  b.tone({ t: 0.32, f: [[0, 160], [0.05, 90]], d: 0.07, g: 0.6 });
  [88, 91, 95].forEach((m, i) => b.bell({ t: 0.4 + i * 0.06, f: mtof(m), d: 0.4, g: 0.15 }));
});
def('anvil', { dur: 1.0, n: 2, vol: -8, vary: 1, cat: 'misc', pri: 2 }, (b) => {
  b.click({ g: 1, f: 2000 });
  b.modal({ f: b.R(760, 860), ratios: [1, 2.7, 4.6, 6.1, 7.9], decays: [0.7, 0.5, 0.35, 0.25, 0.2], g: 0.6 });
  b.tone({ f: [[0, 150], [0.06, 80]], d: 0.1, g: 0.7 });
});
def('enchant', { dur: 1.4, n: 1, vol: -8, vary: 0, cat: 'misc', group: 'magic', pri: 2, parts: [
  { dur: 0.5, reverse: true, build: (b) => { shimmer(b, 0, 0.001, 0.45, 0.5); b.fm({ f: 880, ratio: 3.01, index: 2, d: 0.45, g: 0.25 }); } },
  { at: 0.48, dur: 0.9, build: (b) => [81, 85, 88, 93].forEach((m, i) => b.bell({ t: i * 0.05, f: mtof(m), d: 0.6, g: 0.25 })) },
] });
def('salvage', { dur: 0.34, n: 1, vol: -9, vary: 1, cat: 'misc', pri: 2 }, (b) => {
  b.crackle({ dur: 0.25, rate: 900, g: 0.8, ft: 'bandpass', f: 1800, shape: 'exp', len: 30 });
  b.tone({ f: [[0, 130], [0.08, 60]], d: 0.12, g: 0.7 });
  for (let i = 0; i < 4; i++) b.modal({ t: b.R(0.02, 0.3), f: b.R(1500, 3000), ratios: [1, 2.3], decays: 0.06, g: 0.3 });
});
def('roar', { dur: 2.2, n: 1, vol: -5, vary: 1, cat: 'sting', sr: 22050, pri: 2 }, (b) => {
  const form = b.formants([[420, 3, 1], [850, 4, 0.7], [1900, 5, 0.3]], b.drive(4));
  const am = b.am(28, 0.5, form, 0, 2);
  b.fm({ f: [[0, 75], [0.3, 92], [1.6, 55]], ratio: 0.5, index: 10, index1: 5, a: 0.15, hold: 0.5, d: 1.0, g: 1, type: 'sawtooth', dst: am });
  b.nz({ c: 'pink', a: 0.2, hold: 0.4, d: 1.0, g: 0.5, ft: 'bandpass', f: 900, Q: 0.8 });
  b.tone({ f: [[0, 60], [0.5, 30]], a: 0.05, d: 0.8, g: 0.8 });
});
def('thunder', { dur: 3.5, n: 1, vol: -6, vary: 1.5, cat: 'amb', sr: 22050, pri: 2 }, (b) => {
  b.nz({ c: 'white', d: 0.05, g: 0.6, ft: 'lowpass', f: 5000, dst: b.drive(3) });
  const am = b.am(b.R(2, 4), 0.7, b.out, 0, 3.4);
  b.nz({ c: 'brown', a: 0.05, d: 2.8, g: 1, ft: 'lowpass', f: [[0, 260], [2.8, 70]], dst: am });
  b.crackle({ dur: 1.2, rate: 40, g: 0.3, ft: 'lowpass', f: 900, shape: 'exp', len: 200 });
});
def('dice', { dur: 0.08, n: 3, vol: -10, vary: 2, cat: 'misc', group: 'ui', pri: 2 }, (b) => {
  b.modal({ f: b.R(1500, 2100), ratios: [1, 2.2], decays: 0.02, g: 0.7 }); b.click({ g: 0.4, f: 3000 });
});
def('beat', { dur: 0.06, n: 1, vol: -18, vary: 0, cat: 'misc', group: 'ui', pri: 2 }, (b) => {
  b.modal({ f: 1200, ratios: [1, 2.7], decays: 0.03, g: 0.6 });
});
def('heartbeat', { dur: 0.46, n: 1, vol: -6, vary: 0, cat: 'heart', group: 'ui', sr: 22050, pri: 1 }, (b) => {
  b.tone({ f: [[0, 62], [0.1, 42]], d: 0.13 }); b.nz({ c: 'brown', d: 0.05, g: 0.4, ft: 'lowpass', f: 300 });
  b.tone({ t: 0.21, f: [[0, 54], [0.1, 38]], d: 0.15, g: 0.8 });
});
def('player_death', { dur: 3.2, n: 1, vol: -4, vary: 0, cat: 'sting', sr: 22050, pri: 2 }, (b) => {
  const dr = b.drive(2.5);
  b.tone({ f: [[0, 70], [0.6, 25]], d: 1.0, dst: dr });
  b.nz({ c: 'brown', d: 1.2, g: 0.8, ft: 'lowpass', f: [[0, 1500], [1, 100]], dst: dr });
  b.tone({ type: 'triangle', f: [[0, 220], [2.4, 55]], a: 0.1, d: 2.2, g: 0.3 });
  b.choir({ t: 0.3, notes: [45, 48, 52].map(mtof), a: 0.6, d: 2.0, g: 0.4 });
});
def('dungeon_door', { dur: 1.6, n: 1, vol: -7, vary: 1, cat: 'amb', sr: 22050, pri: 2 }, (b) => {
  const am = b.am(17, 0.7, b.out, 0, 1.2);
  b.nz({ c: 'brown', a: 0.1, hold: 0.6, d: 0.4, g: 1, ft: 'bandpass', f: 220, Q: 1.2, dst: am });
  b.crackle({ dur: 1, rate: 120, g: 0.3, ft: 'lowpass', f: 1500, len: 60 });
  b.tone({ t: 1.05, f: [[0, 90], [0.2, 40]], d: 0.35 });
});

// ------------------------------------------------------------------ baking
const TARGET_RMS = 0.25;   // short-term (25 ms) RMS every buffer is normalised to (peak-capped)

function finish(data, sr, raw) {
  let peak = 0;
  for (let i = 0; i < data.length; i++) { const a = Math.abs(data[i]); if (a > peak) peak = a; }
  if (peak < 1e-6) return null;
  let end = data.length;
  if (!raw) {
    const thr = peak * 0.0018;          // ~ -55 dB below the peak counts as silence
    while (end > 1 && Math.abs(data[end - 1]) < thr) end--;
    end = Math.min(data.length, end + Math.floor(sr * 0.01));
  }
  const W = Math.max(1, Math.floor(sr * 0.025));
  let acc = 0, maxMs = 0;
  for (let i = 0; i < end; i++) {
    acc += data[i] * data[i];
    if (i >= W) acc -= data[i - W] * data[i - W];
    if (acc > maxMs) maxMs = acc;
  }
  const rms = Math.sqrt(Math.max(1e-12, maxMs / W));
  const gain = Math.min(TARGET_RMS / rms, 0.94 / peak);
  const out = new Float32Array(end);
  for (let i = 0; i < end; i++) out[i] = data[i] * gain;
  if (!raw) { const F = Math.min(Math.floor(sr * 0.008), Math.floor(end / 4)); for (let i = 0; i < F; i++) out[end - 1 - i] *= i / F; }
  return { data: out, peak: peak * gain, rms: rms * gain };
}

// All variants (and parts) of a recipe render side by side in ONE OfflineAudioContext: each sound
// gets its own time slot behind a gate that is open only inside the slot, so nothing bleeds across.
// One context per recipe instead of one per variant cuts the per-render overhead roughly in half.
async function renderRecipe(rec, baseSr) {
  const sr = rec.sr || baseSr;
  const parts = rec.parts || [{ dur: rec.dur, build: rec.build }];
  const gap = Math.ceil(sr * 0.01);
  const slots = [];
  let cursor = 0;
  for (let v = 0; v < rec.n; v++) parts.forEach((p) => { const len = Math.max(1, Math.ceil(p.dur * sr)); slots.push({ v, p, start: cursor, len }); cursor += len + gap; });
  const c = new OfflineAudioContext(1, cursor, sr);
  const rngs = [];
  for (const sl of slots) {
    const gate = c.createGain(); gate.gain.value = 0;
    gate.gain.setValueAtTime(1, sl.start / sr); gate.gain.setValueAtTime(0, (sl.start + sl.len) / sr);
    gate.connect(c.destination);
    rngs[sl.v] = rngs[sl.v] || rng(hash(rec.id) + sl.v * 7919);
    sl.p.build(new B(c, rngs[sl.v], sr, sl.start / sr, gate), sl.v);
  }
  const data = (await c.startRendering()).getChannelData(0);
  const out = [];
  for (let v = 0; v < rec.n; v++) {
    const mine = slots.filter((sl) => sl.v === v).map((sl) => {
      let d = data.slice(sl.start, sl.start + sl.len);
      if (sl.p.reverse) d.reverse();
      return { d, at: Math.round((sl.p.at || 0) * sr) };
    });
    let mix;
    if (mine.length === 1 && !mine[0].at) mix = mine[0].d;
    else {
      let total = 0;
      for (const p of mine) total = Math.max(total, p.at + p.d.length);
      mix = new Float32Array(total);
      for (const p of mine) for (let i = 0; i < p.d.length; i++) mix[p.at + i] += p.d[i];
    }
    if (rec.slice) mix = mix.slice(Math.floor(rec.slice[0] * sr), Math.floor(rec.slice[1] * sr));
    const fin = finish(mix, sr, !!rec.loop);
    if (!fin) continue;
    const ab = new AudioBuffer({ length: fin.data.length, numberOfChannels: 1, sampleRate: sr });
    ab.copyToChannel(fin.data, 0);
    out.push({ buf: ab, peak: fin.peak, rms: fin.rms });
  }
  return out;
}

// Render every recipe in priority order through a small pool of concurrent offline renders (each
// OfflineAudioContext renders on its own audio thread). A sound becomes playable as soon as its
// recipe has rendered: onSound(rec, results) fires once per recipe.
export async function bakeAll(onSound, { baseSr = 32000, pool = 12 } = {}) {
  const t0 = performance.now();
  const jobs = [...RECIPES].sort((a, b) => a.pri - b.pri);
  const cost = {};
  let bytes = 0, variants = 0, sounds = 0, next = 0, coreMs = 0, coreLeft = jobs.filter((r) => r.pri === 0).length;
  const worker = async () => {
    while (next < jobs.length) {
      const rec = jobs[next++];
      const ts = performance.now();
      const res = await renderRecipe(rec, baseSr).catch((e) => { console.warn('[sfx] bake failed', rec.id, e); return []; });
      cost[rec.id] = performance.now() - ts;
      if (rec.pri === 0 && --coreLeft === 0) coreMs = performance.now() - t0;
      if (!res.length) continue;
      for (const r of res) bytes += r.buf.length * 4;
      variants += res.length; sounds++;
      onSound(rec, res);
    }
  };
  await Promise.all(Array.from({ length: pool }, worker));
  for (const k of Object.keys(NOISE)) delete NOISE[k];      // noise beds are only needed while baking
  const slow = Object.entries(cost).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => k + ':' + Math.round(v));
  return { ms: performance.now() - t0, coreMs, variants, sounds, bytes, slow };
}
