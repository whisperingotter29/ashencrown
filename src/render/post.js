// Camera lens / post-processing. The finished 2D frame (pixel world, glows, magic, overlays) is
// re-presented through WebGL for bloom from the bright parts, a light colour grade, sun shafts and
// a chromatic split on big hits. The lens never moves or resamples pixels: every art pixel stays
// the same size everywhere on screen (the old perspective tilt, depth-of-field blur, roll and zoom
// punch made pixels smaller or softer toward the edges, so they are switched off; the geometry
// code is kept, at zero, so aiming maps stay exact).
import { G } from '../game.js';
import { bus } from '../core/events.js';

const VS = `#version 300 es
layout(location=0) in vec2 a;
out vec2 uv;
void main() { uv = a * .5 + .5; uv.y = 1. - uv.y; gl_Position = vec4(a, 0., 1.); }`;

const FS = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 o;
uniform sampler2D src;
uniform vec2 res;          // screen size in px
uniform float tilt, zoom, roll, dof, bloom, aberr, grade, rays, time;
uniform vec3 rayCol;
vec2 lens(vec2 u) {
  vec2 p = (u - .5) * res;                       // centred pixels
  float c = cos(roll), s = sin(roll);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  vec2 q = p / res;                              // back to -0.5..0.5
  float w = 1. + tilt * q.y;
  return q / w * zoom + .5;
}
vec3 tap(vec2 s, float lod) { return textureLod(src, s, lod).rgb; }
float gkey(vec3 c) {
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float sat = mx > 0. ? (mx - mn) / mx : 0.;
  return max(dot(c, vec3(.299, .587, .114)), mx * (.55 + .45 * sat) * step(.45, sat));
}
void main() {
  vec2 s = lens(uv);
  // tilt-shift: soft far band at the top, a lighter one at the very bottom
  float b = smoothstep(.32, 0., uv.y) * 1.9 + smoothstep(.82, 1., uv.y) * 1.1;
  b *= dof;
  vec3 col;
  if (aberr > .001) {
    vec2 d = (s - .5) * aberr * .012;
    col = vec3(tap(s + d, b).r, tap(s, b).g, tap(s - d, b).b);
  } else col = texelFetch(src, ivec2(uv * res), 0).rgb;
  // bloom: a soft halo from small mip levels around the brightest pixels. The key is the brighter
  // of luminance and saturation-weighted value, so violet aether and ember glows catch it as well
  // as pale cores, while dusty mid-tone ground never does
  vec3 b1 = tap(s, 3.5), b2 = tap(s, 5.);
  float k1 = gkey(b1), k2 = gkey(b2);
  vec3 br = b1 * max(k1 - .72, 0.) * 1.6 + b2 * max(k2 - .62, 0.) * 0.9;
  col += min(br, vec3(.2)) * bloom;
  // sun shafts slanting in from the top left, slowly breathing
  if (rays > .001) {
    vec2 r = uv * vec2(res.x / res.y, 1.);
    float a = dot(r, vec2(.78, -.62));
    float band = .5 + .5 * sin(a * 11. + sin(a * 2.7 + time * .23) * 2.2 + time * .11);
    band *= .5 + .5 * sin(a * 23. - time * .17);
    float m = pow(band, 5.) * smoothstep(1.25, .05, uv.y + uv.x * .45);
    col += rayCol * m * rays * .2;
  }
  // grade (see docs/ART_STYLE.md): shadows lean plum-violet, highlights warm cream, muted
  // midtones keep their dusty look while saturated accents (aether, eyes, pickups) stay vivid
  float l = dot(col, vec3(.299, .587, .114));
  float sat = max(col.r, max(col.g, col.b)) - min(col.r, min(col.g, col.b));
  col = mix(vec3(l), col, 1. + grade * (.16 * smoothstep(.18, .5, sat) - .05));
  col = (col - .5) * (1. + .06 * grade) + .5;
  float sh = smoothstep(.45, 0., l), hi = smoothstep(.55, 1., l);
  col += grade * (vec3(.016, -.006, .03) * sh + vec3(.018, .01, -.014) * hi);
  o = vec4(clamp(col, 0., 1.), 1.);
}`;

export const post = {
  ok: false, on: false, cv: null, gl: null, prog: null, tex: null, u: {},
  tilt: 0, dof: 0, bloom: 0.5, grade: 1,
  roll: 0, rollV: 0, punch: 0, aberr: 0,
  rays: 0, rayCol: [1, 0.92, 0.75], time: 0,
  cost: 0, slowFrames: 0, autoOff: false,   // frame-cost guard for slow machines
};

export function initPost(container) {
  try {
    const cv = document.createElement('canvas');
    cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;display:none;';
    container.appendChild(cv);
    const gl = cv.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
    if (!gl) return false;
    const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const u = {};
    for (const n of ['src', 'res', 'tilt', 'zoom', 'roll', 'dof', 'bloom', 'aberr', 'grade', 'rays', 'time', 'rayCol']) u[n] = gl.getUniformLocation(prog, n);
    Object.assign(post, { ok: true, cv, gl, prog, vao, tex, u });
    cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); post.ok = false; });
    cv.addEventListener('webglcontextrestored', () => { cv.remove(); post.on = false; initPost(container); });
    return true;
  } catch (e) {
    console.warn('post-processing unavailable', e);
    return false;
  }
}

// camera moments
export function postKick({ aberr = 0 } = {}) {
  if (G.settings.camera === 'flat') return;
  post.aberr = Math.max(post.aberr, aberr);
}

let curZoom = 1, curRoll = 0;
function zoomFor(roll) {
  const t = post.tilt;
  // pull in just enough that the receding top corners and the roll never show past the frame
  return (1 - t / 2) * (1 - Math.abs(roll) * 1.3) * (1 - post.punch * 0.045);
}

// Present the finished frame through the lens. src: the 2D canvas holding the frame.
export function presentPost(src, dt) {
  const want = post.ok && G.settings.camera !== 'flat' && !post.autoOff;
  if (want !== post.on) {
    post.on = want;
    if (post.cv) post.cv.style.display = want ? 'block' : 'none';
    src.style.opacity = want ? '0' : '1';    // stays under the lens canvas to receive the mouse
  }
  if (!want) { curZoom = 1; curRoll = 0; return; }
  // spring the roll back, let punch and aberration decay
  post.rollV += (-post.roll * 120 - post.rollV * 14) * dt;
  post.roll += post.rollV * dt;
  post.roll = Math.max(-0.03, Math.min(0.03, post.roll));
  post.punch = Math.max(0, post.punch - dt * 3.5);
  post.aberr = Math.max(0, post.aberr - dt * 3);
  curRoll = post.roll; curZoom = zoomFor(curRoll);
  const t0 = performance.now();
  const gl = post.gl, cv = post.cv;
  if (cv.width !== src.width || cv.height !== src.height) { cv.width = src.width; cv.height = src.height; }
  gl.viewport(0, 0, cv.width, cv.height);
  gl.useProgram(post.prog);
  gl.bindVertexArray(post.vao);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, post.tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  gl.generateMipmap(gl.TEXTURE_2D);
  const u = post.u;
  gl.uniform1i(u.src, 0);
  gl.uniform2f(u.res, cv.width, cv.height);
  gl.uniform1f(u.tilt, post.tilt);
  gl.uniform1f(u.zoom, curZoom);
  gl.uniform1f(u.roll, curRoll);
  gl.uniform1f(u.dof, 0);
  gl.uniform1f(u.bloom, post.bloom);
  gl.uniform1f(u.aberr, post.aberr);
  gl.uniform1f(u.grade, post.grade);
  post.time += dt;
  gl.uniform1f(u.rays, post.rays);
  gl.uniform1f(u.time, post.time);
  gl.uniform3f(u.rayCol, ...post.rayCol);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  // if presenting through the lens keeps costing too much CPU (slow canvas upload), fall back to
  // the flat camera rather than stutter
  const cost = performance.now() - t0;
  post.cost = post.cost * 0.95 + cost * 0.05;
  post.slowFrames = post.cost > 7 ? post.slowFrames + 1 : Math.max(0, post.slowFrames - 2);
  if (post.slowFrames > 240) { post.autoOff = true; bus.emit('toast', 'Cinematic camera switched off to keep things smooth. You can turn it back on in Settings.'); }
}
// called when the player changes the camera setting
export function resetPostGuard() { post.autoOff = false; post.slowFrames = 0; post.cost = 0; }
bus.on('settingsChanged', (k) => { if (k === 'camera') resetPostGuard(); });

// screen CSS px -> source-frame CSS px (what the game sees under the cursor)
export function lensToSource(x, y) {
  if (!post.on) return [x, y];
  const W = window.innerWidth, H = window.innerHeight;
  let px = x - W / 2, py = y - H / 2;
  const c = Math.cos(curRoll), s = Math.sin(curRoll);
  [px, py] = [c * px - s * py, s * px + c * py];
  const qx = px / W, qy = py / H;
  const w = 1 + post.tilt * qy;
  return [(qx / w * curZoom + 0.5) * W, (qy / w * curZoom + 0.5) * H];
}
// source-frame CSS px -> screen CSS px (inverse of the lens)
export function sourceToLens(x, y) {
  if (!post.on) return [x, y];
  const W = window.innerWidth, H = window.innerHeight;
  const sx = (x / W - 0.5) / curZoom, sy = (y / H - 0.5) / curZoom;
  const qy = sy / (1 - post.tilt * sy);
  const qx = sx * (1 + post.tilt * qy);
  let px = qx * W, py = qy * H;
  const c = Math.cos(-curRoll), s = Math.sin(-curRoll);
  [px, py] = [c * px - s * py, s * px + c * py];
  return [px + W / 2, py + H / 2];
}
