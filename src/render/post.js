// Camera lens / post-processing. The finished 2D frame (pixel world, glows, magic, overlays) is
// re-presented through WebGL so the camera stops feeling flat:
//   - a perspective tilt: the top of the screen recedes into the distance, the bottom comes close
//   - tilt-shift depth of field: the far and near bands soften, the action stays sharp
//   - bloom from the bright parts, a light colour grade
//   - punchy camera moves on big moments: a small roll, a quick zoom punch, chromatic split
// Aiming maps through the same lens (lensToSource / sourceToLens), so the cursor stays exact.
import { G } from '../game.js';

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
uniform float tilt, zoom, roll, dof, bloom, aberr, grade;
vec2 lens(vec2 u) {
  vec2 p = (u - .5) * res;                       // centred pixels
  float c = cos(roll), s = sin(roll);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  vec2 q = p / res;                              // back to -0.5..0.5
  float w = 1. + tilt * q.y;
  return q / w * zoom + .5;
}
vec3 tap(vec2 s, float lod) { return textureLod(src, s, lod).rgb; }
void main() {
  vec2 s = lens(uv);
  // tilt-shift: soft far band at the top, a lighter one at the very bottom
  float b = smoothstep(.32, 0., uv.y) * 1.9 + smoothstep(.82, 1., uv.y) * 1.1;
  b *= dof;
  vec3 col;
  if (aberr > .001) {
    vec2 d = (s - .5) * aberr * .012;
    col = vec3(tap(s + d, b).r, tap(s, b).g, tap(s - d, b).b);
  } else col = tap(s, b);
  // bloom: bright, wide glow taken from small mip levels
  vec3 b1 = tap(s, 3.5), b2 = tap(s, 5.);
  vec3 br = max(b1 - .74, 0.) * 1.6 + max(b2 - .62, 0.) * 1.1;
  col += br * bloom;
  // grade: a touch more contrast and colour, cool shadows, warm highlights
  float l = dot(col, vec3(.299, .587, .114));
  col = mix(vec3(l), col, 1. + .1 * grade);
  col = (col - .5) * (1. + .07 * grade) + .5;
  col += grade * (vec3(-.012, -.004, .02) * (1. - l) + vec3(.02, .01, -.012) * l);
  o = vec4(clamp(col, 0., 1.), 1.);
}`;

export const post = {
  ok: false, on: false, cv: null, gl: null, prog: null, tex: null, u: {},
  tilt: 0.16, dof: 1, bloom: 0.5, grade: 1,
  roll: 0, rollV: 0, punch: 0, aberr: 0,
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
    for (const n of ['src', 'res', 'tilt', 'zoom', 'roll', 'dof', 'bloom', 'aberr', 'grade']) u[n] = gl.getUniformLocation(prog, n);
    Object.assign(post, { ok: true, cv, gl, prog, vao, tex, u });
    cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); post.ok = false; });
    return true;
  } catch (e) {
    console.warn('post-processing unavailable', e);
    return false;
  }
}

// camera moments
export function postKick({ roll = 0, punch = 0, aberr = 0 } = {}) {
  if (G.settings.camera === 'flat') return;
  post.rollV += roll;
  post.punch = Math.max(post.punch, punch);
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
  const want = post.ok && G.settings.camera !== 'flat';
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
  gl.uniform1f(u.dof, post.dof * (G.settings.dof === false ? 0 : 1));
  gl.uniform1f(u.bloom, post.bloom);
  gl.uniform1f(u.aberr, post.aberr);
  gl.uniform1f(u.grade, post.grade);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

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
