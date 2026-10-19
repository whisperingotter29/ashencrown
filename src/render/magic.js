// GPU magic layer. Spells, impacts, auras and lightning are drawn here with WebGL2 shaders on the
// world's pixel grid (one magic pixel per art pixel), then blown up with the world and laid on top,
// so spell effects share the game's pixel density.
//
// The light is accumulated additively into an offscreen buffer, then a posterize pass turns it into
// flat palette bands (docs/ART_STYLE.md): a dithered haze, a saturated deep edge, the main colour,
// a light band that leans warm (violet -> pink, orange -> amber) and a pale hot core. The result is
// painted over the frame like opaque pixel art instead of being added as soft light.
//
// Every visual is an instanced quad with a "kind" picked in the fragment shader: soft glows,
// velocity-stretched sparks, noisy flames, ground rings, faceted shards, shaded orbs, lightning
// and beam ribbons, rune circles, light shafts, vortices, domes, mist, star flares, slash arcs and
// tapered trails. Ribbons (trails, bolts) go in a MAX-blended pass so their joints don't bead;
// everything else is additive.
import { view } from '../px/view.js';
import { PPU, C } from '../px/pix.js';
import { pal } from './elements.js';
import { G } from '../game.js';

export const K = { GLOW: 0, SPARK: 1, FLAME: 2, RING: 3, SHARD: 4, ORB: 5, BOLT: 6, BEAM: 7, CIRCLE: 8, SHAFT: 9, VORTEX: 10, SHELL: 11, MIST: 12, STAR: 13, ARC: 14, TRAIL: 15, SHADE: 16, SCORCH: 17 };

const VS = `#version 300 es
layout(location=0) in vec2 corner;
layout(location=1) in vec4 a0;
layout(location=2) in vec4 a1;
layout(location=3) in vec4 a2;
layout(location=4) in vec4 a3;
layout(location=5) in vec4 a4;
uniform vec2 uRes;
out vec2 vUv; out vec2 vPx;
flat out vec4 v1; flat out vec4 v2; flat out vec4 v3; flat out vec4 v4; flat out vec2 vHalf;
void main() {
  float c = cos(a1.x), s = sin(a1.x);
  vec2 p = corner * a0.zw;
  vec2 w = vec2(p.x * c - p.y * s, p.x * s + p.y * c) + a0.xy;
  gl_Position = vec4(w / uRes * 2.0 - 1.0, 0.0, 1.0);
  gl_Position.y = -gl_Position.y;
  vUv = corner; vPx = p; vHalf = a0.zw;
  v1 = a1; v2 = a2; v3 = a3; v4 = a4;
}`;

const FS = `#version 300 es
precision highp float;
in vec2 vUv; in vec2 vPx;
flat in vec4 v1; flat in vec4 v2; flat in vec4 v3; flat in vec4 v4; flat in vec2 vHalf;
out vec4 outC;
uniform int uMode;
vec2 uv; float d; float seed; float T; float u; vec3 C1; vec3 C2; vec4 P; float PXU;
// PXU: one art pixel in quad-uv units, from the quad's own size (screen-space derivatives vary
// between GPUs; this keeps 1-2 px lines exactly 1-2 px everywhere)

float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 w = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), w.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), w.x), w.y); }
float fbm(vec2 p) { float v = 0., a = .5; for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + vec2(5.3, 1.7); a *= .5; } return v / .9375; }
float lineAt(float x, float w) { return 1. - step(w + PXU * .5, abs(x)); }

vec3 kGlow() {
  float k = P.y > 0. ? P.y : 4.;
  float g = exp(-d * d * k) * (1. - smoothstep(.75, 1., d));
  float core = exp(-d * d * k * 7.) * P.x;
  return mix(C2, C1, exp(-d * d * k * 2.)) * g + vec3(core);
}
// streak: a chunky sliver, thickest toward the head, with a hot pale core along its middle
vec3 kSpark() {
  float t = uv.x * .5 + .5;
  float w = mix(.35, 1., pow(t, .5));
  float ac = uv.y / w;
  float g = exp(-ac * ac * 2.6) * smoothstep(0., .3, t) * (1. - smoothstep(.9, 1., t));
  float hot = exp(-ac * ac * 9.) * smoothstep(.25, .8, t) * (1. - smoothstep(.95, 1., t)) * P.x;
  return C1 * g * mix(.45, 1.05, t) + mix(C1, vec3(1.), .75) * hot;
}
vec3 kFlame() {
  float n = fbm(uv * 1.6 + vec2(seed * 7.1, seed * 3.3 + T * P.y));
  float n2 = fbm(uv * 3.4 + vec2(-T * P.y * .7, seed * 9.));
  float dd = length(uv * vec2(1., .9) + vec2(0., .1));
  float heat = (1. - dd) * 1.75 + (n - .5) * 1.3 * P.z + (n2 - .5) * .35 - u * 1.15;
  heat = clamp(heat, 0., 1.);
  vec3 c = mix(C2 * .35, C2, smoothstep(0., .35, heat));
  c = mix(c, C1, smoothstep(.3, .72, heat));
  c = mix(c, vec3(1., .98, .9), smoothstep(.74, 1., heat) * .85);
  return c * smoothstep(0., .2, heat);
}
vec3 kRing() {
  float th = max(P.x, .02);
  float k = (d - (1. - th)) / th;
  float aa = PXU;
  float band = pow(clamp(k, 0., 1.), 2.2) * (1. - smoothstep(1. - aa * 1.2, 1., d)) * step(0., k);
  float ang = atan(uv.y, uv.x);
  float nb = mix(1., smoothstep(.2, .8, fbm(vec2(ang * 3.2 + seed * 10., d * 2.5 - T * P.z))), P.y);
  float rim = (1. - smoothstep(0., aa * 1.6, abs(d - (1. - aa * 1.8)))) * step(d, 1.) * (1. - u);
  float fill = P.w * (1. - smoothstep(0., 1., d)) * .35;
  return C1 * band * nb * 1.25 + mix(C1, vec3(1.), .6) * rim * nb + C2 * fill;
}
// angled shard: a sheared parallelogram (long flat edges, pointed ends). Solid pass: the body in
// flat bands (deep edge, main, lit upper facet, hot core stripe); light pass: a pale core and a
// travelling glint, plus a thin halo the posterize pass turns into a dithered fringe
vec2 shQ() { return vec2(uv.x + uv.y * .85, uv.y); }
float shE(vec2 q) { return max(abs(q.x) / .9, abs(q.y) / .46); }
vec4 shardSolid() {
  vec2 q = shQ();
  float e = shE(q);
  if (e > 1.) return vec4(0.);
  vec3 c = q.y < 0. ? mix(C2, C1, .6) : C2 * .82;
  if (e > .78) c = C2 * .62;
  if (abs(q.y) < .13 && abs(q.x) < .62) c = mix(C1, vec3(1.), .55);
  return vec4(c * .97, .97);
}
vec3 kShard() {
  vec2 q = shQ();
  float e = shE(q);
  float inside = step(e, 1.);
  float core = step(abs(q.y), .12) * step(abs(q.x), .55);
  float gl = exp(-pow((q.x - (fract(T * 1.4 + seed) * 2.4 - 1.2)) * 4., 2.));
  vec3 halo = C2 * exp(-max(e - 1., 0.) * 7.) * .38 * (1. - inside);
  return mix(C1, vec3(1.), .6) * inside * (core * .5 + gl * .35) + halo;
}
vec3 kOrb() {
  float r = P.y > 0. ? P.y : .5;
  float dl = d / r;
  int el = int(P.x + .5);
  float hd = max(d - r, 0.) / (1. - r);
  vec3 col = C2 * exp(-hd * hd * 4.5) * (1. - smoothstep(.8, 1., d)) * .8;
  if (dl < 1.) {
    vec3 n = vec3(uv / r, sqrt(max(0., 1. - dl * dl)));
    vec3 L = normalize(vec3(-.45, -.55, .7));
    float diff = max(dot(n, L), 0.);
    float fres = pow(1. - n.z, 2.);
    float spec = pow(max(dot(reflect(-L, n), vec3(0., 0., 1.)), 0.), 24.);
    vec2 sp = n.xy / (n.z + .55);
    float edge = step(dl, 1.);
    vec3 b;
    if (el == 1) {
      float f = fbm(sp * 2.2 + vec2(T * 1.8 + seed, -T * 2.8));
      float h = clamp(f * 1.35 + n.z * .55 - .25, 0., 1.);
      b = mix(C2 * .75, C1, h); b = mix(b, vec3(1., .97, .86), smoothstep(.68, 1., h));
      b *= .8 + .45 * diff;
    } else if (el == 2) {
      float f = fbm(sp * 3.2 + seed * 3.);
      float facet = smoothstep(.42, .58, fract(f * 4.));
      b = mix(C2 * .7, C1, .3 + .45 * facet * diff + .3 * n.z) + vec3(.92, 1., 1.) * spec * 1.6;
    } else if (el == 3) {
      float f = fbm(sp * 3. + vec2(T * 7., -T * 5.) + seed);
      float arcs = 1. - smoothstep(0., .05, abs(f - .5));
      float arcs2 = 1. - smoothstep(0., .035, abs(fbm(sp * 4.5 - vec2(T * 6., T * 4.) + seed * 3.) - .5));
      b = C2 * .55 + C1 * (.25 + .4 * n.z) + vec3(1.) * max(arcs, arcs2 * .8) * 1.2;
    } else if (el == 4) {
      float a = atan(n.y, n.x), rr = length(n.xy);
      float sw = sin(a * 3. + rr * 9. - T * 7. + seed * 6.) * .5 + .5;
      b = C2 * (fres * 1.7 + .08) + C1 * smoothstep(.55, 1., sw) * rr * .9;
    } else if (el == 5) {
      b = mix(C2, C1, n.z) * (.7 + .5 * diff) + vec3(1.) * pow(n.z, 3.) * .9;
    } else if (el == 6) {
      float f = fbm(sp * 3. + vec2(0., -T * 1.3) + seed);
      b = mix(C2 * .7, C1, .3 + .5 * diff) + C1 * smoothstep(.6, .7, f) * .65;
    } else if (el == 7) {
      float f = fbm(sp * 2.5 + vec2(T * .8, T * 1.1) + seed);
      b = mix(C2 * .55, C1 * .9, f * diff + .2) + vec3(1., .8, .8) * spec;
    } else {
      b = mix(C2, C1, .3 + .6 * diff) + vec3(1.) * spec * .8;
    }
    b += C1 * fres * .9;
    col = mix(col, b, edge);
  }
  return col;
}
float capsule(float L) { return length(vec2(max(abs(vPx.x) - L, 0.), vPx.y)); }
vec3 kBolt() {
  float dist = capsule(max(vHalf.x - vHalf.y, 0.));
  float g = exp(-pow(dist / vHalf.y, 2.) * 3.2);
  float core = 1. - step(P.x * .5 + .5, dist);
  return C2 * g + mix(C1, vec3(1.), .5) * core;
}
vec3 kBeam() {
  float dist = capsule(max(vHalf.x - vHalf.y, 0.));
  float n = fbm(vec2(vPx.x / (vHalf.y * 2.5) - T * P.y, vPx.y / vHalf.y * 1.5 + seed * 5.));
  float w = vHalf.y * (.42 + .42 * n);
  float g = exp(-pow(dist / w, 2.) * 2.4);
  float core = 1. - smoothstep(P.x * .5, P.x * .5 + 1.5, dist * (1.1 - n * .3));
  float streak = smoothstep(.55, .82, fbm(vec2(vPx.x / (vHalf.y * 1.2) - T * P.y * 1.6, vPx.y / vHalf.y * 4.)));
  return C2 * g * .85 + C1 * streak * g + vec3(1.) * core;
}
vec3 kCircle() {
  float aa = PXU;
  float ang = atan(uv.y, uv.x);
  float rot = P.y;
  float a01 = fract((ang + 3.14159265) / 6.2831853 + .75);
  float drawn = step(a01, P.x);
  float lw = max(aa * .7, .004);
  float c = 0.;
  c += lineAt(d - .965, lw) * drawn;
  c += lineAt(d - .855, lw * .8) * drawn;
  float N = 30.;
  float ar = ang + rot;
  float cellA = ar / 6.2831853 * N;
  float idx = floor(cellA), s = fract(cellA);
  float rb = (d - .875) / .07;
  if (rb > 0. && rb < 1. && drawn > 0.) {
    vec2 cell = vec2(s, rb);
    vec2 g = floor(cell * 3.), f = fract(cell * 3.);
    float bit = hash(vec2(idx * 3. + g.x, g.y + P.z * 7.));
    float stroke = step(.48, bit) * step(abs(f.x - .5), .34) * step(abs(f.y - .5), .34);
    stroke *= step(.22, hash(vec2(idx, P.z))) * step(.14, s) * step(s, .86);
    c += stroke * .9;
  }
  float r2 = -rot * .6;
  vec2 q = vec2(cos(r2) * uv.x - sin(r2) * uv.y, sin(r2) * uv.x + cos(r2) * uv.y);
  float ri = .36;
  float show = smoothstep(.25, .6, P.x);
  for (int k = 0; k < 2; k++) {
    float off = float(k) * 3.14159265;
    for (int e = 0; e < 3; e++) {
      float th = off + float(e) * 2.0943951 + 1.5707963;
      vec2 nr = vec2(cos(th), sin(th));
      float along = dot(q, vec2(-nr.y, nr.x));
      c += lineAt(dot(q, nr) - ri, lw * .8) * step(abs(along), ri * 1.732) * show;
    }
  }
  c += lineAt(d - .3, lw) * smoothstep(.4, .8, P.x);
  c += lineAt(d - .74, lw * .6) * smoothstep(.3, .7, P.x) * .6;
  float glow = exp(-pow((d - .9) / .09, 2.)) * .4 + (1. - smoothstep(0., 1., d)) * .12;
  return C1 * min(c, 1.) * .92 + C2 * glow;
}
vec3 kShaft() {
  float ax = abs(uv.x);
  float n = fbm(vec2(uv.x * 2.4 + seed * 4., uv.y * 1.3 + T * P.x));
  float vt = uv.y * .5 + .5;
  float top = smoothstep(0., .45, vt);
  float body = exp(-ax * ax * 3.) * (.5 + .65 * n);
  float core = exp(-ax * ax * (P.y > 0. ? P.y : 26.)) * (.65 + .55 * n);
  float edge = exp(-pow((ax - .6) * 9., 2.)) * .35 * n;
  float base = exp(-pow((uv.y - .9) * 7., 2.)) * exp(-ax * ax * 1.5) * .8;
  return (C2 * body * .7 + C1 * (core * .8 + edge) + vec3(1.) * core * .28 * smoothstep(.3, 1., vt)) * top + C1 * base * .7;
}
vec3 kVortex() {
  float a = atan(uv.y, uv.x);
  float sw = sin(a * P.x + log(d + .02) * 5. + P.y);
  float n = fbm(vec2(a * 2. + P.y * .3, d * 4.) + seed);
  float arms = smoothstep(.25, 1., sw * .5 + .5 + (n - .5) * .6);
  float mask = (1. - smoothstep(.62, 1., d)) * smoothstep(P.z, P.z + .25, d);
  float rim = exp(-pow((d - P.z) / .05, 2.));
  return C1 * arms * mask + C2 * mask * .3 + mix(C1, vec3(1.), .5) * rim * .8;
}
vec3 kShell() {
  if (d > 1.) return vec3(0.);
  float aa = PXU;
  float rim = pow(d, P.x > 0. ? P.x : 5.) * (1. - smoothstep(1. - aa * 1.5, 1., d));
  float n = fbm(uv * 3. + seed + T * .5);
  float spec = exp(-pow(length(uv - vec2(-.35, -.42)) / .22, 2.)) * .45;
  return C1 * rim * (.65 + .7 * n) + C2 * .06 + vec3(1.) * spec * rim * 2.;
}
vec3 kMist() {
  float n = fbm(uv * 1.4 + vec2(seed * 9., seed * 4.) + vec2(T * .15, -T * .25));
  float m = smoothstep(.35, .85, n + (1. - d) * .45 - .2) * (1. - smoothstep(.5, 1., d));
  return mix(C2, C1, n) * m;
}
vec3 kStar() {
  float k = P.x > 0. ? P.x : 30., f = P.y > 0. ? P.y : 2.5;
  float rays = exp(-abs(uv.y) * k) * exp(-abs(uv.x) * f) + exp(-abs(uv.x) * k) * exp(-abs(uv.y) * f);
  float diag = P.z > 0. ? (exp(-abs(uv.x - uv.y) * k) + exp(-abs(uv.x + uv.y) * k)) * exp(-d * f * 1.6) * P.z : 0.;
  float core = exp(-d * d * 25.);
  return C1 * (rays + diag + exp(-d * d * 5.) * .25) + vec3(1.) * (core + rays * .4);
}
vec3 kArc() {
  float a = atan(uv.y, uv.x);
  float rel = a + P.x;
  float span = P.y - P.z;
  if (span <= .001) return vec3(0.);
  float t = (rel - P.z) / span;
  if (t < 0. || t > 1.) return vec3(0.);
  // facets: every ~0.32 rad the rim is a straight chord, and the thickness steps per facet, so
  // the crescent reads as a run of angled parallelogram chunks
  float stp = .32, fi = floor(rel / stp), mid = (fi + .5) * stp;
  float dp = d * cos(rel - mid) / cos(stp * .5);
  float tq = clamp((floor(t * 7.) + 1.) / 7., 0., 1.);
  float th = P.w * pow(tq, .55);
  float k = (1. - dp) / max(th, .001);
  float n = fbm(vec2(rel * 6. + seed, d * 5. - T * 3.));
  if (k < 0.) return C2 * step(dp, 1.05) * t * .4;
  if (k > 1.) return vec3(0.);
  // bands from the rim inward: hot pale edge, light, the colour, a deep inner lip
  vec3 c = k < .28 ? mix(C1, vec3(1.), .55) * 1.2 : k < .55 ? C1 : k < .82 ? C2 * .95 : C2 * .55;
  c *= smoothstep(0., .2, t) * (.9 + .2 * n);
  c += mix(C1, vec3(1.), .7) * step(.93, t) * (1. - k);
  return c;
}
vec3 kTrail() {
  float wm = max(P.x, P.y);
  float L = max(vHalf.x - wm, 0.);
  float tt = clamp(vPx.x / max(2. * L, 1.) + .5, 0., 1.);
  float w = max(mix(P.x, P.y, tt), .5);
  float al = mix(P.z, P.w, tt);
  float dist = capsule(L);
  float g = exp(-pow(dist / w, 2.) * 2.2);
  float core = exp(-pow(dist / max(w * .33, .5), 2.) * 2.);
  return (C2 * g + mix(C1, vec3(1.), .5) * core) * al;
}
// pixel-art finish: values snap to a few dithered steps, like the light map and the glows
const float BAY[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
float bay() { ivec2 q = ivec2(gl_FragCoord.xy) & 3; return (BAY[q.y * 4 + q.x] + .5) / 16.; }
vec3 steps(vec3 c) { float b = bay(); return floor(c * 10. + b) / 10.; }
void main() {
  uv = vUv; d = length(uv); seed = v1.w; u = v2.w; T = v3.w; C1 = v2.rgb; C2 = v3.rgb; P = v4; PXU = 1. / max(1., min(vHalf.x, vHalf.y));
  int kind = int(v1.y + .5);
  if (uMode == 1) {
    // darkening pass (composited with multiply): C1 is the tint the ground is multiplied by
    float a;
    if (kind == 17) { float n = fbm(uv * 2.6 + seed * 7.); a = smoothstep(1., .3, d + (n - .5) * .55); }
    else a = exp(-d * d * (P.y > 0. ? P.y : 2.5)) * (1. - smoothstep(.75, 1., d));
    a = clamp(a * v1.z, 0., 1.);
    a = floor(a * 6. + bay()) / 6.;
    outC = vec4(C1 * a, a);
    return;
  }
  if (uMode == 2) { vec4 sc = shardSolid() * v1.z; float sa = step(.5, sc.a); outC = sa > 0. ? vec4(sc.rgb / max(sc.a, .001), 1.) : vec4(0.); return; }
  vec3 c;
  switch (kind) {
    case 0: c = kGlow(); break;
    case 1: c = kSpark(); break;
    case 2: c = kFlame(); break;
    case 3: c = kRing(); break;
    case 4: c = kShard(); break;
    case 5: c = kOrb(); break;
    case 6: c = kBolt(); break;
    case 7: c = kBeam(); break;
    case 8: c = kCircle(); break;
    case 9: c = kShaft(); break;
    case 10: c = kVortex(); break;
    case 11: c = kShell(); break;
    case 12: c = kMist(); break;
    case 13: c = kStar(); break;
    case 14: c = kArc(); break;
    default: c = kTrail(); break;
  }
  c = clamp(c * v1.z, 0., 1.);
  outC = vec4(c, max(c.r, max(c.g, c.b)));
}`;

// Posterize: the accumulated light -> flat palette bands. Value and whiteness pick the band; the
// pixel's own hue picks the colour, shifted the way the master ramps shift (shadows toward plum
// violet, highlights toward warm cream; blues lighten toward pale ice instead).
const VS2 = `#version 300 es
layout(location=0) in vec2 corner;
void main() { gl_Position = vec4(corner, 0., 1.); }`;
const FS2 = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
out vec4 o;
const float BAY[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0., -1. / 3., 2. / 3., -1.);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y), e = 1e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6. * d + e)), d / (q.x + e), q.x);
}
vec3 hsv2rgb(vec3 c) { vec3 p = abs(fract(c.xxx + vec3(1., 2. / 3., 1. / 3.)) * 6. - 3.); return c.z * mix(vec3(1.), clamp(p - 1., 0., 1.), c.y); }
float toward(float h, float t, float a) { float d = t - h; d -= floor(d + .5); return fract(h + sign(d) * min(abs(d), a)); }
void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  vec3 c = texelFetch(uSrc, ip, 0).rgb;
  float v = max(c.r, max(c.g, c.b));
  if (v < .075) { o = vec4(0.); return; }
  float w = min(c.r, min(c.g, c.b)) / v;
  vec3 hsv = rgb2hsv(c);
  float h = hsv.x, s = hsv.y;
  float heat = v + .25 * w;
  float b = (BAY[(ip.y & 3) * 4 + (ip.x & 3)] + .5) / 16.;
  bool ice = h > .48 && h < .7;
  vec3 col;
  if (heat < .5) {
    // haze: a sparse then a checker dither of the deep edge colour, then the edge solid
    if (heat < .17 && b > .25) { o = vec4(0.); return; }
    if (heat < .31 && b > .5) { o = vec4(0.); return; }
    col = hsv2rgb(vec3(toward(h, .79, .05), clamp(s * 1.25 + .05, 0., .88), .7));
  } else if (heat < .985) col = hsv2rgb(vec3(h, clamp(s * 1.08, 0., .9), .94));
  else if (heat < 1.16) col = ice ? hsv2rgb(vec3(toward(h, .53, .02), s * .5, .97)) : hsv2rgb(vec3(toward(h, .122, .09), s * .55, 1.));
  else col = ice ? hsv2rgb(vec3(h, s * .16, 1.)) : hsv2rgb(vec3(toward(h, .122, .16), s * .22, 1.));
  o = vec4(col, 1.);
}`;

// ------------------------------------------------------------------ GL setup
const FL = 20, CAP = 6000;
const M = {
  ok: false, on: false, cv: null, gl: null, prog: null, vao: null, ibuf: null, uRes: null,
  add: { d: new Float32Array(CAP * FL), n: 0 }, max: { d: new Float32Array(CAP * FL), n: 0 }, dark: { d: new Float32Array(1500 * FL), n: 0, cap: 1500 }, solid: { d: new Float32Array(1500 * FL), n: 0, cap: 1500 },
  time: 0, fx: [], parts: [], W: 0, H: 0, target: null, view,   // target: the player (soul motes fly to it)
};
export const magic = M;

export function initMagic() {
  const cv = document.createElement('canvas');
  cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); M.ok = false; console.warn('magic layer: context lost'); });
  cv.addEventListener('webglcontextrestored', () => { console.warn('magic layer: context restored', setup(cv)); });
  return setup(cv);
}
function setup(cv) {
  try {
    const gl = cv.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
    if (!gl) return false;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const qb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, ib);
    gl.bufferData(gl.ARRAY_BUFFER, CAP * FL * 4, gl.DYNAMIC_DRAW);
    for (let i = 0; i < 5; i++) {
      gl.enableVertexAttribArray(1 + i);
      gl.vertexAttribPointer(1 + i, 4, gl.FLOAT, false, FL * 4, i * 16);
      gl.vertexAttribDivisor(1 + i, 1);
    }
    gl.bindVertexArray(null);
    // posterize pass: a full-screen quad reading the accumulated light from a texture
    const prog2 = gl.createProgram();
    gl.attachShader(prog2, sh(gl.VERTEX_SHADER, VS2)); gl.attachShader(prog2, sh(gl.FRAGMENT_SHADER, FS2));
    gl.linkProgram(prog2);
    if (!gl.getProgramParameter(prog2, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog2));
    const vao2 = gl.createVertexArray();
    gl.bindVertexArray(vao2);
    gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    const fbo = gl.createFramebuffer();
    Object.assign(M, { ok: true, cv, gl, prog, vao, ibuf: ib, uRes: gl.getUniformLocation(prog, 'uRes'), uMode: gl.getUniformLocation(prog, 'uMode'), W: 0, H: 0,
      prog2, vao2, tex, fbo, uSrc: gl.getUniformLocation(prog2, 'uSrc'), texW: 0, texH: 0 });
    return true;
  } catch (e) {
    console.warn('magic layer unavailable', e);
    M.ok = false;
    return false;
  }
}
export function magicOn() { return M.on; }

// ------------------------------------------------------------------ projection (per frame)
// world (x, z, height above ground) -> magic canvas pixels
let S = 3, OX = 0, OY = 0, F = 1;
export let UPX = 30;                       // magic-canvas pixels per world unit
export const mx = (x) => ((x * PPU - view.x0) * S + OX) * F;
export const my = (z, h = 0) => ((z * PPU - view.y0 - h * PPU) * S + OY) * F;
export const ground = (x, z) => view.ground(x, z);
// world-pixel coordinates (x * PPU, z * PPU - h * PPU) -> magic canvas pixels
export const mxw = (wx) => ((wx - view.x0) * S + OX) * F;
export const myw = (wy) => ((wy - view.y0) * S + OY) * F;

// ------------------------------------------------------------------ instance queue
const cache = new Map();
// hex -> [r,g,b], snapped to the master palette (other modules pass their own colours)
export const col = (c) => {
  if (Array.isArray(c)) return c;
  let v = cache.get(c);
  if (!v) { v = C(pal(c)); cache.set(c, v); }
  return v;
};
// push one quad. c1/c2: [r,g,b] 0..255. pass: 'add' | 'max'
export function quad(cx, cy, hx, hy, rot, kind, alpha, c1, c2, p0 = 0, p1 = 0, p2 = 0, p3 = 0, u = 0, seed = 0, pass = M.add) {
  if (alpha <= 0.003 || pass.n >= (pass.cap || CAP)) return;
  const r = Math.max(hx, hy) * 1.42;
  if (cx < -r || cy < -r || cx > M.W + r || cy > M.H + r) return;
  const d = pass.d, i = pass.n++ * FL;
  d[i] = cx; d[i + 1] = cy; d[i + 2] = hx; d[i + 3] = hy;
  d[i + 4] = rot; d[i + 5] = kind; d[i + 6] = alpha; d[i + 7] = seed;
  d[i + 8] = c1[0] / 255; d[i + 9] = c1[1] / 255; d[i + 10] = c1[2] / 255; d[i + 11] = u;
  d[i + 12] = c2[0] / 255; d[i + 13] = c2[1] / 255; d[i + 14] = c2[2] / 255; d[i + 15] = M.time;
  d[i + 16] = p0; d[i + 17] = p1; d[i + 18] = p2; d[i + 19] = p3;
}
export const PASS = { add: M.add, max: M.max, dark: M.dark, solid: M.solid };
// a faceted ice/bone/stone crystal: solid coloured body + additive edges and glint
export function crystal(cx, cy, hx, hy, rot, alpha, c1, c2, seed = 0) {
  quad(cx, cy, hx, hy, rot, K.SHARD, alpha, c1, c2, 0, 0, 0, 0, 0, seed, M.solid);
  quad(cx, cy, hx, hy, rot, K.SHARD, alpha, c1, c2, 0, 0, 0, 0, 0, seed, M.add);
}
// darken / tint the ground: tint [r,g,b] 0..255 is what the ground gets multiplied by at full strength
export function shade(cx, cy, rx, ry, tint, strength, scorch = false, seed = 0, falloff = 2.5) {
  quad(cx, cy, rx, ry, 0, scorch ? K.SCORCH : K.SHADE, strength, tint, tint, 0, falloff, 0, 0, 0, seed, M.dark);
}

// ------------------------------------------------------------------ GPU particles
// CPU-simulated, GPU-drawn. kind: 'glow' | 'spark' | 'flame' | 'mist' | 'star' | 'shard' | 'bubble'
const PMAX = 3200;
const PK = { glow: K.GLOW, spark: K.SPARK, flame: K.FLAME, mist: K.MIST, star: K.STAR, shard: K.SHARD, bubble: K.RING, ember: K.SPARK };
export function gpart(o) {
  if (M.parts.length >= PMAX) M.parts.shift();
  const gy = o.gy ?? ground(o.x, o.z);
  const c1 = col(o.color || '#ffffff');
  M.parts.push({
    x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, gy,
    life: o.life || 0.6, age: 0, size: o.size ?? 0.4, size1: o.size1 ?? (o.size ?? 0.4) * 0.35,
    c1, c2: o.color2 ? col(o.color2) : c1, cEnd: o.colorEnd ? col(o.colorEnd) : null,
    kind: PK[o.kind || 'glow'] ?? K.GLOW, ember: o.kind === 'ember', g: o.gravity ?? 0, drag: o.drag ?? 1.5, a0: o.alpha ?? 1,
    seed: Math.random(), rot: o.rot ?? Math.random() * Math.PI * 2, spin: o.spin ?? 0, stretch: o.stretch ?? 0.045,
    hot: o.hot ?? 0.8, fadeIn: o.fadeIn ?? 0.08, wobble: o.wobble || 0, floor: o.floor !== false,
    orbit: o.orbit || null, squash: o.squash ?? 1,
  });
}
export function gburst(x, y, z, o = {}) {
  const n = o.count || 12, sp = o.speed ?? 5;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const e = (o.up ?? 0.4) + (Math.random() - 0.5) * (o.spread ?? 1.2);
    const s = sp * (0.35 + Math.random() * 0.75);
    let vx = Math.cos(a) * Math.cos(e) * s, vy = Math.sin(e) * s, vz = Math.sin(a) * Math.cos(e) * s;
    if (o.dir) { const k = o.cone ?? 0.4; vx = o.dir.x * s + vx * k; vz = o.dir.z * s + vz * k; vy = (o.dir.y || 0) * s + vy * k; }
    const j = o.jitter ?? 0.25;
    gpart({
      x: x + (Math.random() - 0.5) * j, y: y + (Math.random() - 0.5) * j, z: z + (Math.random() - 0.5) * j, vx, vy, vz,
      life: (o.life || 0.6) * (0.6 + Math.random() * 0.7), size: (o.size ?? 0.4) * (0.6 + Math.random() * 0.8), size1: o.size1,
      color: Math.random() < 0.5 && o.color2 ? o.color2 : o.color, color2: o.edge || o.color2 || o.color, colorEnd: o.colorEnd,
      kind: o.kind, gravity: o.gravity ?? -4, drag: o.drag ?? 2.5, alpha: o.alpha, hot: o.hot, stretch: o.stretch, wobble: o.wobble, spin: o.spin,
    });
  }
}

function updateParts(dt) {
  const P = M.parts;
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i];
    p.age += dt;
    if (p.age >= p.life) { P[i] = P[P.length - 1]; P.pop(); continue; }
    if (p.orbit) {
      const o = p.orbit;
      o.a += o.w * dt; o.h += (o.vh || 0) * dt; o.r += (o.vr || 0) * dt;
      const c = o.follow ? o.follow.pos : o;
      p.x = c.x + Math.cos(o.a) * o.r; p.z = c.z + Math.sin(o.a) * o.r * (o.sq ?? 0.42); p.y = (o.follow ? c.y : o.y) + o.h;
      p.depth = Math.sin(o.a);
      continue;
    }
    const dr = Math.exp(-p.drag * dt);
    p.vx *= dr; p.vz *= dr; p.vy = p.vy * dr + p.g * dt;
    if (p.wobble) { p.vx += Math.sin(p.age * 7 + p.seed * 50) * p.wobble * dt; p.vz += Math.cos(p.age * 6 + p.seed * 50) * p.wobble * dt; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    p.rot += p.spin * dt;
    if (p.floor && p.y < p.gy + 0.03 && p.g < 0) { p.y = p.gy + 0.03; p.vy *= -0.3; p.vx *= 0.55; p.vz *= 0.55; }
  }
}
const _c = [0, 0, 0];
function drawParts() {
  for (const p of M.parts) {
    const u = p.age / p.life;
    const x = mx(p.x), y = my(p.z, p.y - p.gy);
    let sz = (p.size + (p.size1 - p.size) * u) * UPX;
    let a = p.a0 * (u < p.fadeIn ? u / p.fadeIn : 1) * (u > 0.55 ? 1 - (u - 0.55) / 0.45 : 1);
    if (p.ember) a *= 0.65 + 0.35 * Math.sin(p.age * 30 + p.seed * 40);
    if (p.depth !== undefined) { const k = 0.72 + 0.28 * p.depth; sz *= k; a *= 0.45 + 0.55 * (p.depth * 0.5 + 0.5); }
    let c1 = p.c1;
    if (p.cEnd) { _c[0] = p.c1[0] + (p.cEnd[0] - p.c1[0]) * u; _c[1] = p.c1[1] + (p.cEnd[1] - p.c1[1]) * u; _c[2] = p.c1[2] + (p.cEnd[2] - p.c1[2]) * u; c1 = _c; }
    switch (p.kind) {
      case K.SPARK: {
        const vx = p.vx * UPX, vy = (p.vz - p.vy) * UPX;
        const v = Math.hypot(vx, vy);
        const len = Math.max(sz * 1.2, v * p.stretch + sz);
        quad(x - vx / Math.max(v, 1e-3) * len * 0.7, y - vy / Math.max(v, 1e-3) * len * 0.7, len, Math.max(1.6, sz * 0.5), Math.atan2(vy, vx), K.SPARK, a, c1, p.c2, p.hot);
        break;
      }
      case K.SHARD: {
        const vx = p.vx * UPX, vy = (p.vz - p.vy) * UPX;
        const r = Math.hypot(vx, vy) > 6 ? Math.atan2(vy, vx) : p.rot;
        crystal(x, y, sz, sz * 0.42, r, a, c1, p.c2, p.seed);
        break;
      }
      case K.FLAME: quad(x, y, sz, sz, 0, K.FLAME, a, c1, p.c2, 0, 2.2, 1, 0, u, p.seed, M.max); break;
      case K.MIST: quad(x, y, sz, sz, p.rot, K.MIST, a * 0.8, c1, p.c2, 0, 0, 0, 0, u, p.seed, M.max); break;
      case K.STAR: quad(x, y, sz, sz, p.rot, K.STAR, a, c1, p.c2, 26, 3.2); break;
      case K.RING: quad(x, y, sz, sz, 0, K.RING, a, c1, p.c2, 0.28, 0, 0, 0.6); break;
      default: quad(x, y, sz, sz, 0, K.GLOW, a, c1, p.c2, p.hot, 4.5);
    }
  }
}

// ------------------------------------------------------------------ effects
// { t, update(fx, dt) -> keep, draw(fx) }
export function addMagic(f) { f.t = f.t || 0; M.fx.push(f); return f; }
export function updateMagic(dt) {
  if (!M.on) return;
  M.time += dt;
  updateParts(dt);
  for (let i = M.fx.length - 1; i >= 0; i--) {
    const f = M.fx[i];
    if (!f.update(f, dt)) M.fx.splice(i, 1);
  }
}
export function clearMagic() { M.fx = M.fx.filter((f) => f.persistent); M.parts.length = 0; }

// ------------------------------------------------------------------ frame
// Called by the renderer after the glow pass. ox, oy: device-pixel position of the low-res buffer.
export function drawMagic(ctx, ox, oy) {
  M.on = M.ok && G.settings.magicFx !== false;
  if (!M.on) { if (M.fx.length || M.parts.length) clearMagic(); return; }
  if (!M.fx.length && !M.parts.length) return;
  // drawn at art-pixel resolution (one magic pixel = one world pixel) and blown up with the
  // world, so spells share the pixel density of everything else
  const sc = view.scale;
  const W = view.W, H = view.H;
  if (W !== M.W || H !== M.H) { M.W = M.cv.width = W; M.H = M.cv.height = H; }
  F = 1; S = 1; OX = 0; OY = 0; UPX = PPU;
  M.add.n = 0; M.max.n = 0; M.dark.n = 0; M.solid.n = 0;
  drawParts();
  for (const f of M.fx) if (f.draw) f.draw(f);
  if (!M.add.n && !M.max.n && !M.dark.n && !M.solid.n) return;
  const gl = M.gl;
  gl.viewport(0, 0, W, H);
  gl.useProgram(M.prog);
  gl.uniform2f(M.uRes, W, H);
  gl.bindVertexArray(M.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, M.ibuf);
  gl.enable(gl.BLEND);
  const run = (q, eq) => {
    if (!q.n) return;
    gl.blendEquation(eq);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, q.d, 0, q.n * FL);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, q.n);
  };
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = false;
  // 1) darkening pass: shadows, scorch marks and tinted ground, multiplied in so the light
  //    pass keeps its colour on bright daylight ground
  if (M.dark.n) {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1i(M.uMode, 1);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    run(M.dark, gl.FUNC_ADD);
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(M.cv, 0, 0, W, H, ox, oy, W * sc, H * sc);
  }
  // 2) solid pass: crystals and other things with real colour, normal blending
  if (M.solid.n) {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1i(M.uMode, 2);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    run(M.solid, gl.FUNC_ADD);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(M.cv, 0, 0, W, H, ox, oy, W * sc, H * sc);
  }
  // 3) light pass: ribbons (MAX) then everything else (additive), accumulated offscreen, then
  //    posterized into flat palette bands and painted over the frame
  if (M.add.n || M.max.n) {
    if (M.texW !== W || M.texH !== H) {
      gl.bindTexture(gl.TEXTURE_2D, M.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, M.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, M.tex, 0);
      M.texW = W; M.texH = H;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, M.fbo);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1i(M.uMode, 0);
    gl.blendFunc(gl.ONE, gl.ONE);
    run(M.max, gl.MAX);
    run(M.add, gl.FUNC_ADD);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.BLEND);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(M.prog2);
    gl.bindVertexArray(M.vao2);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, M.tex);
    gl.uniform1i(M.uSrc, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(M.cv, 0, 0, W, H, ox, oy, W * sc, H * sc);
  }
  gl.bindVertexArray(null);
  ctx.restore();
}
